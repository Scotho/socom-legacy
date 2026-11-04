// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_LOBBY_COMMAND_ROWS, talkerBarText, TALKER_BAR_FREE, uiCommandRowByName, UiCommandHost, UiVarManager, VALVE_TYPE, ValveStore, type GameLobbySeat, type GameLobbyView, type ZAnimUiCommand } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import { connectGameLobby, type GameLobbyHandOff } from '../src/gameLobbyHost';
import type { WebSocketLike } from '../src/net/client';
import type { ClientEvent, ServerEvent } from '../src/net/protocol';
import { mountTaunts } from '../src/matchTaunts';
import { noInput, type PadButton, type PadLike } from '../src/gamepad';
import { createHeadsetPage, mountHeadset, VOICE_MIC_NOTICE_PLACEHOLDER } from '../src/voice/headset';
import type { TauntMenuDeps } from '../src/tauntMenu';
import type { WebCodecs } from '../src/voice/voiceCodec';

/**
 * ONL-16b (web sprint 20, wave 3; research 227 §1, on research 170 §4.1 and §5.1, C9, C11, R2-AV §1.5, §1.6, §1.12,
 * §1.15): the game lobby's push-to-talk as the original drives it. `dlgGameLobby.rdr` binds CIRCLE three times --
 * FALLING `do_team_button_down` (`VCButton(1T)`), RISING `do_team_button_up` (`VCButton(0T)`, `ChatIconReset`), DOWN
 * `do_circle_button_down` (`ChatIconAction` while the valve `can_talk` is 1, else `ChatIconReset`) -- and the wait loop's
 * `CheckForcedLaunch` (`FUN_0027cbf0` D:L125660-125680) writes `can_talk` (`FUN_0030e710`: the voice object recording)
 * and the bar `PLAYERTACOVAR` (`FUN_0030e790`: another client holds the listener's channel). Here the rows are run as
 * the dialog's scripts run them (the `UiCommandHost`'s dispatch); the page's voice client (`../src/voice/voiceClient`)
 * is the real one over fakes of the microphone, WebCodecs and WebAudio, and the match server is a fake socket (R293).
 * The images themselves are the disc's animations' (`packages/ui/test/screens/gameLobbyScreen.test.ts`). Unit tests;
 * no browser, no game.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const PINNED = pinnedMatchSocket('', LOC, false);
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const GAME = { mediusWorldId: 7, gameName: 'test$~Alpha', maxPlayers: 16, rulesSet: 1, gameStats: statsHex({ 1: 5, 2: 6, 8: 2 }) };
const seat = (id: number, name: string, team: GameLobbySeat['team']): GameLobbySeat => ({ id, name, team, ready: false, host: id === 1, readyIn: 30 });
/** The host (1) and a third player (3) on the SEALs, this page's seat (2, "socomc") on the terrorists. */
const SEATS = [seat(1, 'host', 'seal'), seat(2, 'socomc', 'terrorist'), seat(3, 'rook', 'seal')];
const SELF = 2;

// ---- the voice client's fakes (compact: what `mountVoice` reaches before a frame is encoded) ----

class Codec { constructor(readonly init: unknown) {} configure(): void {} close(): void {} static async isConfigSupported(config: unknown) { return { supported: true, config }; } }
const WC = { AudioEncoder: Codec, AudioDecoder: Codec, AudioData: class {}, EncodedAudioChunk: class {} } as unknown as WebCodecs;
class FakeContext {
  state = 'running'; currentTime = 0; readonly destination = {};
  readonly audioWorklet = { addModule: async (): Promise<void> => {} };
  createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}
/** The page's sources the headset reads (`../src/voice/headset`): a window, a document, a pad list. */
function env() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  let pads: (PadLike | null)[] = [];
  return {
    win, doc, source: { getGamepads: () => pads },
    plug: (): void => { pads = [{ id: 'Wireless Controller', index: 0, connected: true, mapping: 'standard', axes: [], buttons: [] } as unknown as PadLike]; },
    unplug: (): void => { pads = []; },
    key: (type: 'keydown' | 'keyup', code: string): void => { win.dispatchEvent(Object.assign(new Event(type), { code })); },
  };
}

const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

function rig(o: { firstView?: Partial<GameLobbyView> } = {}) {
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  const sent: string[] = [];
  /** LATER 23: which socket each send went on (1 the first, then each reconnect's). */
  const sentOn: number[] = [];
  let socks = 0;
  const handOffs: GameLobbyHandOff[] = [];
  const cues: string[] = [];
  const track = { stopped: 0, stop() { track.stopped++; } };
  let mics = 0, t = 0;
  const e = env();
  const page = createHeadsetPage();
  const log: string[] = [];
  let ticket: string | null = 'tkt';
  let sock: WebSocketLike | null = null;
  const lobby = {
    up: true, state: () => 0x11, queueState: () => {}, setHandler: () => {},
    ticket: () => ticket, socketHolds: () => {}, sessionLost: () => {},
  };
  const g = connectGameLobby(host, {
    uiVars, valves: () => valves, lobby, games: () => [], roomWorldId: () => 1, inputString: () => null, event: () => {}, switchMenu: () => {},
    pinned: PINNED,
    socket: () => { const n = ++socks; sock = { binaryType: '', readyState: 1, send: (d: string) => { sent.push(d); sentOn.push(n); }, close: () => {}, onopen: null, onclose: null, onmessage: null, onerror: null } as unknown as WebSocketLike; return sock; },
    matchStart: (h) => { handOffs.push(h); },
    voice: {
      talkCue: (name) => { cues.push(name); },
      microphone: async () => { mics++; log.push('getGameMicrophone'); return { getTracks: () => [track] } as unknown as MediaStream; },
      headset: (line) => mountHeadset({ line: (text) => { log.push(text); line(text); }, win: e.win, doc: e.doc, pads: e.source, page }),
      microphoneOn: () => true, webCodecs: WC, permission: async () => 'granted',
      audioContext: () => new FakeContext() as never,
      workletNode: () => ({ port: { onmessage: null }, connect: () => undefined, disconnect: () => undefined }) as never,
      workletUrl: async () => '/voice-capture.js',
      clock: () => t * 1000,
      seconds: () => t,
    },
  });
  const server = (ev: ServerEvent): void => { sock!.onmessage?.({ data: JSON.stringify(ev) }); };
  g.commands.enterGameLobby(GAME);
  g.socket!.open(GAME.mediusWorldId);
  sock!.onopen?.({});
  server({ type: 'welcome', id: SELF, version: 11, map: '', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 5, ghost: false } as unknown as ServerEvent);
  server({ type: 'gameLobby', seats: SEATS, countdown: null, launched: false, ...o.firstView } as unknown as ServerEvent);
  /** A table row as the dialog's scripts dispatch it (`FUN_002745a0`), its argument as the script wrote it. */
  const row = (fn: string, arg = 'NA'): void => {
    host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) } as unknown as ZAnimUiCommand);
  };
  /** The page's frames (`FrontEndSession`'s advance: the lobby's `frame`), 1/60 s each. */
  const frames = (n = 1): void => { for (let i = 0; i < n; i++) { t += 1 / 60; g.frame(); } };
  const floor = (holder: number | null): void => server({ type: 'voiceFloor', channel: 9, holder } as ServerEvent);
  const bar = (): unknown => { const v = uiVars.find('PLAYERTACOVAR')?.value; return v?.type === 'string' ? v.value : v; };
  const canTalk = (): number | undefined => valves.find('can_talk')?.value;
  const voiceSent = (): ClientEvent[] => sent.map((s) => JSON.parse(s) as ClientEvent).filter((e) => e.type === 'voiceTalk' || e.type === 'voiceRadio');
  const list = (name: string): unknown => uiVars.find(name)?.value;
  const closeWith = (code: number): void => { sock!.onclose?.({ code, reason: '' }); };
  /** LATER 23: the radio sends with the socket each went on. */
  const radioOn = (): [number, boolean][] => sent.flatMap((d, k) => { const e = JSON.parse(d) as ClientEvent; return e.type === 'voiceRadio' && 'on' in e ? [[sentOn[k]!, e.on as boolean] as [number, boolean]] : []; });
  /** LATER 23: the latest socket opened and welcomed again (a reconnect's), its lobby view laid. */
  const reopen = (): void => {
    sock!.onopen?.({});
    server({ type: 'welcome', id: SELF, version: 11, map: '', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 5, ghost: false } as unknown as ServerEvent);
    server({ type: 'gameLobby', seats: SEATS, countdown: null, launched: false } as unknown as ServerEvent);
  };
  return {
    g, host, uiVars, valves, row, frames, floor, bar, canTalk, voiceSent, list, server, handOffs, track, mics: () => mics, closeWith,
    sockets: () => socks, radioOn, reopen,
    now: () => t, setTicket: (v: string | null) => { ticket = v; }, e, log, cues,
  };
}

/** CIRCLE pressed (`do_team_button_down`: `VCButton(1T)`), the page's frames run until the capture is up. */
async function press(r: ReturnType<typeof rig>): Promise<void> {
  r.row('VCButton', '1T');
  r.frames();
  await settle();
  r.frames();
}

describe('ONL-16b: the talker bar (CheckForcedLaunch, FUN_0027cbf0 D:L125660-125680)', () => {
  it('plays the selected local mic cue once on a lobby grant, never for a busy floor or after leaving', async () => {
    const r = rig(); await press(r);
    r.floor(1); r.frames(3); expect(r.cues).toEqual([]);
    r.floor(SELF); r.floor(SELF); r.frames(3); expect(r.cues).toEqual(['.TCM_SELECT']);
    r.row('VCButton', '0T'); r.frames(); r.floor(null); expect(r.cues).toHaveLength(1);
    r.g.voice!.release(); r.floor(SELF); expect(r.cues).toHaveLength(1);
  });
  it('RED 1: "#C<80 40 20>[clan] #C<80 80 80>name" with a clan, the name alone without, a single space when the floor is free -- and never the listener\'s own name', () => {
    // S:0x3ef310, its bytes as the ELF holds them: 23 43 80 40 20 5b 25 73 5d 20 23 43 80 80 80 25 73 -- `#C` and three
    // colour bytes, "[%s] ", `#C` and three more, "%s" (wrapLines reads `#C` + the next three bytes as a colour).
    const fmt = [0x23, 0x43, 0x80, 0x40, 0x20, 0x5b, 0x25, 0x73, 0x5d, 0x20, 0x23, 0x43, 0x80, 0x80, 0x80, 0x25, 0x73];
    const bytes = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
    const filled = (clan: string, name: string): number[] => {
      const out: number[] = [];
      let k = 0;
      for (let i = 0; i < fmt.length; i++) {
        if (fmt[i] === 0x25 && fmt[i + 1] === 0x73) { out.push(...bytes(k++ === 0 ? clan : name)); i++; } else out.push(fmt[i]!);
      }
      return out;
    };
    expect(bytes(talkerBarText('host', 'NAVY'))).toEqual(filled('NAVY', 'host'));
    expect(talkerBarText('host', 'NAVY')).toBe('#C\x80@ [NAVY] #C\x80\x80\x80host');
    expect(talkerBarText('host', '')).toBe('host');                                  // S:0x3eebc8, the clan empty
    expect(talkerBarText('host', null)).toBe('host');
    expect(TALKER_BAR_FREE).toBe(' ');                                               // S:0x3ef338
    const r = rig();
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe(' ');                                                       // no holder: the entry free (0x100)
    r.floor(1);
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe('host');                                                    // another holds: his name (no clans: SVC-11 parked)
    r.floor(3);
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe('rook');
    r.floor(SELF);
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe(' ');                                                       // the listener holds it: never "socomc"
    r.floor(null);
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe(' ');
  });

  it('RED 1: written only by the wait loop\'s pass, as the original; a holder no slot names leaves it as it stands', () => {
    const r = rig();
    r.floor(1);
    expect(r.bar()).toBeUndefined();                                                 // the entry alone writes nothing
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe('host');
    r.floor(9);                                                                      // FUN_002c3a70 answers 0: nothing written
    r.row('CheckForcedLaunch');
    expect(r.bar()).toBe('host');
  });
});

describe('ONL-16b: the icon (can_talk, FUN_0030e710; R2-AV §1.15)', () => {
  it('RED 2: "talk" only while this page records (its flag on and the floor naming it), "no talk" pressing on a busy floor, reset on release', async () => {
    const r = rig();
    r.row('CheckForcedLaunch');
    expect(r.canTalk()).toBe(0);                                                     // idle: ChatIconReset's no-talk icon
    r.floor(1);                                                                      // another talks
    await press(r);
    r.row('CheckForcedLaunch');
    expect([r.canTalk(), r.bar()]).toEqual([0, 'host']);                             // pressing on a busy floor: no talk
    r.floor(SELF);                                                                   // the floor is this page's
    r.frames();
    r.row('CheckForcedLaunch');
    expect([r.canTalk(), r.bar()]).toEqual([1, ' ']);                                // recording: the talk icon, the bar blank
    r.row('VCButton', '0T');                                                         // do_team_button_up (then ChatIconReset)
    r.frames();
    r.row('CheckForcedLaunch');
    expect(r.canTalk()).toBe(0);
  });
});

describe('ONL-16b: CIRCLE\'s three animations into the talk input\'s lobby phase (W20.R9)', () => {
  it('RED 3: FALLING (VCButton(1T)) sends voiceTalk on, RISING (VCButton(0T)) off; held frames send nothing more', async () => {
    const r = rig();
    expect(r.mics()).toBe(0);                                                        // no microphone before the first press
    await press(r);
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }]);
    expect(r.mics()).toBe(1);
    r.frames(30);                                                                    // DOWN every frame: do_circle_button_down only
    r.row('CheckForcedLaunch');
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.row('VCButton', '0T');
    r.frames();
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }]);
  });

  it('VCButton is the table row 75 at 0x27e1c0 (PLAT-08), filled here (its task SVC-22, the voice task)', () => {
    const row = uiCommandRowByName('VCButton')!;
    expect(GAME_LOBBY_COMMAND_ROWS.find((r) => r.name === 'VCButton')).toEqual({ id: row.id, name: 'VCButton', fn: row.fn, task: 'SVC-22' });
    expect([row.id, row.fn]).toEqual([75, 0x27e1c0]);
  });

  it('RED 3: the second character is not read (T or P: one button, the channel decides); a second press while held is no second talk', async () => {
    const r = rig();
    r.row('VCButton', '1P');
    r.frames();
    await settle();
    r.frames();
    r.row('VCButton', '1T');
    r.frames(3);
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.row('VCButton', '0P');
    r.frames();
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }]);
  });

  it('RED 3: a held lobby talk is cut at 10 s and asked again at 20 s (the talk input\'s cycle, C6)', async () => {
    const r = rig();
    await press(r);
    r.frames(60 * 10);
    expect(r.voiceSent().map((e) => (e as { on: boolean }).on)).toEqual([true, false]);
    r.frames(60 * 10 + 2);
    expect(r.voiceSent().map((e) => (e as { on: boolean }).on)).toEqual([true, false, true]);
  });
});

describe('ONL-16b: the late joiner (game +0xcc, the late_joiner valve; C11)', () => {
  it('RED 4: his press is inert -- no voiceTalk, no microphone -- and the wait loop writes neither the bar nor can_talk', async () => {
    const r = rig({ firstView: { launched: true } });                               // seated in a game already launched
    expect(r.valves.find('late_joiner')?.value).toBe(1);                             // SetupLateJoiner hides InfoTextCT on the disc's script
    r.floor(1);
    await press(r);
    r.frames(10);
    r.row('CheckForcedLaunch');
    expect([r.voiceSent(), r.mics(), r.bar(), r.canTalk()]).toEqual([[], 0, undefined, undefined]);
  });
});

describe('ONL-16b: the ARMORY (W20.R12; FUN_0027d8c0 D:L126094-126102)', () => {
  /** `goto_eq_mp_set_return_valve`'s `GoneToArmory` 1, then `InitializeOnlineArmory`; back, `check_loop`'s 0 (research 167 §1). */
  const intoArmory = (r: ReturnType<typeof rig>): void => {
    if (!r.valves.find('GoneToArmory')) r.valves.acquire('GoneToArmory', VALVE_TYPE.PERM);
    r.valves.set('GoneToArmory', 1, VALVE_TYPE.PERM);
    r.row('InitializeOnlineArmory');
  };
  const backFromArmory = (r: ReturnType<typeof rig>): void => {
    r.valves.set('GoneToArmory', 0, VALVE_TYPE.PERM);
    r.row('CheckForcedLaunch');                                                      // back in the lobby's wait loop
  };

  it("RED 5 (the close review's F2): the page carries the ARMORY to the room -- voiceRadio {on: false} as it enters (RADIO OFF, D:L126099), {on: true} as it leaves (the lobby's 9 again, D:L125568), and nothing else", () => {
    const r = rig();
    r.frames(5);
    expect(r.voiceSent()).toEqual([]);
    intoArmory(r);
    r.frames(5);
    expect(r.voiceSent()).toEqual([{ type: 'voiceRadio', on: false }]);              // once, however long it stays
    backFromArmory(r);
    r.frames(5);
    expect(r.voiceSent()).toEqual([{ type: 'voiceRadio', on: false }, { type: 'voiceRadio', on: true }]);
    intoArmory(r);
    r.frames(2);
    backFromArmory(r);
    r.frames(2);
    expect(r.voiceSent().map((e) => (e as { on: boolean }).on)).toEqual([false, true, false, true]);
  });

  it('RED 5: a talk held into the ARMORY is let go there -- the flag cleared first (FUN_0030e6e0(voice, 0), D:L126098), then RADIO OFF (D:L126099)', async () => {
    const r = rig();
    await press(r);
    intoArmory(r);
    r.frames(3);
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }, { type: 'voiceRadio', on: false }]);
  });

  // LATER 23 (web sprint 20's close review, its nits): the reconnect's RADIO OFF re-send (`GameLobbyVoice.armoryToRoom`)
  // had no test -- a client that came after the entry is sent the entry again, and the return goes to it alone.
  it("LATER 23: a reconnect inside the ARMORY is sent RADIO OFF again on its new client; the return's RADIO ON goes to that client alone", () => {
    const r = rig();
    vi.spyOn(performance, 'now').mockImplementation(() => r.now() * 1000);           // the socket's backoff clock
    r.frames();
    intoArmory(r);
    r.frames(2);
    expect(r.radioOn()).toEqual([[1, false]]);
    r.closeWith(1006);                                                               // a drop: opened again after the backoff
    for (let i = 0; i < 60 * 15 && r.sockets() === 1; i++) r.frames();
    expect(r.sockets()).toBe(2);
    r.reopen();
    r.frames(2);
    expect(r.radioOn()).toEqual([[1, false], [2, false]]);                           // the entry again, on the new client
    backFromArmory(r);
    r.frames(2);
    expect(r.radioOn()).toEqual([[1, false], [2, false], [2, true]]);                // the return to the new client alone
  });

  it('RED 5: let go inside the ARMORY (the lobby left) owes that client no return: nothing more is sent', () => {
    const r = rig();
    r.frames();
    intoArmory(r);
    r.frames(2);
    r.g.voice!.release();
    backFromArmory(r);
    r.frames(2);
    expect(r.voiceSent()).toEqual([{ type: 'voiceRadio', on: false }]);
  });
});

describe('ONL-16b: no row mark (C9, VOICE_ROW_MARK_READING; OT.R32)', () => {
  it('RED 6: the side lists\' strings are the same whatever the talk state', async () => {
    const r = rig();
    const lists = (): unknown => ['BSEALLISTVAR', 'BTERRLISTVAR', 'BSPECLISTVAR'].map((n) => r.list(n));
    const idle = JSON.stringify(lists());
    r.floor(1);
    r.row('CheckForcedLaunch');
    r.row('RefreshGamePlayerList');
    expect(JSON.stringify(lists())).toBe(idle);
    await press(r);
    r.floor(SELF);
    r.frames(3);
    r.row('CheckForcedLaunch');
    r.row('RefreshGamePlayerList');
    expect(JSON.stringify(lists())).toBe(idle);
  });
});

describe('ONL-16b: one talk input (W20.R9) across the hand-off', () => {
  it('the hand-off carries the lobby\'s talk input, which the match adopts with its menu; the lobby\'s voice client is let go', async () => {
    const r = rig();
    await press(r);
    r.row('VCButton', '0T');
    r.frames();
    r.server({ type: 'gameLobby', seats: SEATS, countdown: null, launched: true } as unknown as ServerEvent);   // the launch
    expect(r.handOffs).toHaveLength(1);
    const h = r.handOffs[0]!;
    const sentTaunts: unknown[] = [];
    const deps: TauntMenuDeps = { send: (c) => { sentTaunts.push(c); }, custom: () => ['a', 'b', 'c', 'd', 'e'], sound: () => {}, unsupported: () => {} };
    const talk = h.talk!.adopt(deps);
    expect(talk).toBe(r.g.voice!.talk.input);                                            // the one instance
    expect(r.track.stopped).toBe(1);                                                 // the lobby's microphone track stopped
    const before = r.voiceSent().length;
    r.frames(5);                                                                     // the lobby no longer feeds it
    expect(r.voiceSent().length).toBe(before);
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('ONL-16b fix round: the lobby\'s microphone on every seat end (F2)', () => {
  it('a drop whose retry finds no ticket ends the seat and lets the lobby\'s voice go (its microphone track stopped), as a final close does', async () => {
    const r = rig();
    vi.spyOn(performance, 'now').mockImplementation(() => r.now() * 1000);           // the socket's backoff clock
    await press(r);
    r.row('VCButton', '0T');
    r.frames();
    expect(r.track.stopped).toBe(0);
    r.closeWith(1006);                                                               // a drop: opened again after the backoff
    r.frames();
    r.setTicket(null);                                                               // the session gone meanwhile
    r.frames(60 * 15);
    expect(r.track.stopped).toBe(1);
  });

  it('a final close (4007) lets it go too', async () => {
    const r = rig();
    await press(r);
    r.closeWith(4007);
    r.frames();
    expect(r.track.stopped).toBe(1);
  });
});

describe('ONL-16b fix round: the match adopts the lobby\'s talk input (W20.R9)', () => {
  /** The match's taunts part as `./matchMount` mounts it, on the hand-off's talk input, at the lobby's clock. */
  function match(r: ReturnType<typeof rig>, h: GameLobbyHandOff | null) {
    const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false };
    const net = { client: { id: SELF, send: () => {} }, gate: () => gate };
    return mountTaunts({
      net: () => net as never, hud: { postMessage: () => {} }, audio: { play: () => null, playStream: () => null } as never,
      custom: () => [], otherMenu: () => false, release: () => {}, clock: () => r.now(),
      ...(h?.talk ? { talk: h.talk } : {}),
    });
  }
  const CIRCLE: ReadonlySet<PadButton> = new Set(['Circle']);
  const NONE: ReadonlySet<PadButton> = new Set();
  /** CIRCLE held in the round for `s` seconds at 60 frames a second: the last frame's talk flag. */
  const hold = (r: ReturnType<typeof rig>, t: ReturnType<typeof mountTaunts>, s: number): boolean => {
    let talk = false;
    for (let i = 0; i < Math.round(s * 60); i++) { r.frames(); talk = t.pad(CIRCLE, noInput()).talk; }
    return talk;
  };

  /** The round's frames with nothing held for `s` seconds. */
  const idle = (r: ReturnType<typeof rig>, t: ReturnType<typeof mountTaunts>, s: number): void => {
    for (let i = 0; i < Math.round(s * 60); i++) { r.frames(); t.pad(NONE, noInput()); }
  };
  /** CIRCLE pressed and held for `s` seconds: when the talk flag first came on, seconds after the press (null: never). */
  const talksAfter = (r: ReturnType<typeof rig>, t: ReturnType<typeof mountTaunts>, s: number): number | null => {
    const pressAt = r.now();
    let first: number | null = null;
    for (let i = 0; i < Math.round(s * 60); i++) { r.frames(); if (t.pad(CIRCLE, noInput()).talk && first === null) first = r.now() - pressAt; }
    return first;
  };
  /** Into the round on the hand-off at ~10.07 s, the lobby's talk cut at 10 s (`cut`) or let go at 1 s (never cut). */
  async function launched(cut: boolean) {
    const r = rig();
    await press(r);                                                                  // talking from ~0.02 s
    r.frames(cut ? 60 * 10 + 1 : 60);                                                // cut at ~10.02 s: the wait runs to ~20.02 s
    r.row('VCButton', '0T');
    r.frames(cut ? 1 : 60 * 9 + 2);                                                  // both launch at the same time
    r.server({ type: 'gameLobby', seats: SEATS, countdown: null, launched: true } as unknown as ServerEvent);
    const h = r.handOffs[0]!;
    const t = match(r, h);
    expect(t.talk).toBe(r.g.voice!.talk.input);                                       // one instance
    idle(r, t, 0.1);                                                                 // the round's first frame: its phase, nothing held
    return { r, h, t };
  }

  it('F5: the hand-off\'s instance carries the voice object\'s wait -- a lobby talk cut at 10 s keeps a round re-press silent until ~20 s; an uncut one talks 0.3 s after it', async () => {
    const a = await launched(true);
    expect(a.r.now()).toBeLessThan(10.3);
    expect(talksAfter(a.r, a.t, 1)).toBeNull();                                      // inside the wait: held past 0.3 s, no talk
    idle(a.r, a.t, 2);                                                               // let go, past route A's 1.3 s lockout
    const pressAt = a.r.now();                                                       // ~13.2 s: still inside the wait
    const after = talksAfter(a.r, a.t, 8);
    expect(after).not.toBeNull();
    expect(pressAt + after!).toBeGreaterThan(20);                                    // on once the wait (to ~20.02 s) ends
    expect(pressAt + after!).toBeLessThan(20.1);
    expect(after!).toBeGreaterThan(6);                                               // not the 0.3 s of a press with no wait

    const b = await launched(false);                                                 // the same moments, the lobby talk never cut
    expect(talksAfter(b.r, b.t, 1)).toBeGreaterThan(0.29);
    idle(b.r, b.t, 2);
    const bAfter = talksAfter(b.r, b.t, 8);
    expect(bAfter).toBeGreaterThan(0.29);
    expect(bAfter).toBeLessThan(0.4);                                                // 0.3 s after the re-press

    // Every round frame above also ran the lobby's frame: from the hand-off the lobby feeds the input nothing (a lobby
    // phase between the round's frames would have released the talk each frame). The match over, the socket takes the
    // client back (`adopt`) and the lobby drives the same instance again.
    a.t.pad(NONE, noInput());
    a.t.dispose();
    a.r.g.socket!.adopt(a.h.client);
    a.r.frames();                                                                    // the lobby's first frame back: its phase again
    const before = a.r.voiceSent().length;
    a.r.row('VCButton', '1T');
    a.r.frames();
    await settle();
    a.r.frames(25 * 60);                                                             // past the lockout and any wait
    expect(a.r.voiceSent().slice(before)).toContainEqual({ type: 'voiceTalk', on: true });
  });

  it('matchMount passes the hand-off\'s talk input to the taunts part', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/matchMount.ts', import.meta.url), 'utf8');
    expect(src).toContain('talk: o.handOff.talk');
  });
});

describe('ONL-16b fix round: the lobby\'s headset (F6; SVC-22b\'s `voice/headset.ts`, research 226 §5)', () => {
  it('the notice shows once, before the lobby\'s first getGameMicrophone call, on the lobby\'s screen (B_CHATLIST); not at load, not again', async () => {
    const r = rig();
    r.frames(5);
    expect(r.log).toEqual([]);                                                       // never at load
    await press(r);
    expect(r.log).toEqual([VOICE_MIC_NOTICE_PLACEHOLDER.ask, 'getGameMicrophone']);
    expect(r.list('BCHATLISTVAR')).toEqual({ type: 'array', value: [{ type: 'string', value: `${VOICE_MIC_NOTICE_PLACEHOLDER.ask}\n` }] });   // LOBBY_VOICE_LINE_ADAPTATION: a line of the panel's 21 (ONL-23)
    r.row('VCButton', '0T');
    r.frames();
    await press(r);
    expect(r.log).toEqual([VOICE_MIC_NOTICE_PLACEHOLDER.ask, 'getGameMicrophone']);
  });

  it('the pad the page reads going releases a lobby talk the same frame', async () => {
    const r = rig();
    r.e.plug();
    r.frames();
    await press(r);
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.e.unplug();
    r.frames();
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }]);
  });

  it('DEV: R held is the lobby\'s CIRCLE (`keys(\'lobby\')`) into the same talk input; let go, off; in the ARMORY (GoneToArmory) it feeds nothing', async () => {
    vi.stubEnv('DEV', true);
    const r = rig();
    r.frames();                                                                      // the headset mounted (its listeners)
    r.e.key('keydown', 'KeyR');
    r.frames();
    await settle();
    r.frames();
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }]);
    r.e.key('keyup', 'KeyR');
    r.frames();
    expect(r.voiceSent()).toEqual([{ type: 'voiceTalk', on: true }, { type: 'voiceTalk', on: false }]);
    r.valves.acquire('GoneToArmory', VALVE_TYPE.PERM);
    r.valves.set('GoneToArmory', 1, VALVE_TYPE.PERM);
    r.frames(120);                                                                   // past the release's lockout (none in the lobby)
    r.e.key('keydown', 'KeyR');
    r.frames(10);
    expect(r.voiceSent()).toHaveLength(3);                                           // the ARMORY's RADIO OFF (F2), no talk
    expect(r.voiceSent()[2]).toEqual({ type: 'voiceRadio', on: false });
    vi.unstubAllEnvs();
  });
});

describe('V-E2E (sprint 20): the lobby\'s voice client read through GameLobbyVoice (the browser spec\'s read; note 227 §4)', () => {
  it('state() is null until the socket\'s first frame mounts the client, then that client\'s own VoiceState: the floor, the talk flag', async () => {
    const r = rig();
    expect(r.g.voice!.state()).toBeNull();
    r.frames();
    expect(r.g.voice!.state()).toMatchObject({ sent: 0, heard: 0, holder: null, talking: false });
    r.floor(1);                                                                      // another holds 9
    await press(r);
    expect(r.g.voice!.state()).toMatchObject({ holder: 1, talking: true, sent: 0 }); // pressing on a busy floor
    r.g.voice!.release();
    expect(r.g.voice!.state()).toBeNull();                                           // let go: no client
  });
});
