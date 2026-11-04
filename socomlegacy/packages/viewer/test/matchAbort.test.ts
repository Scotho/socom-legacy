// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PadButton } from '../src/gamepad';
import { noInput } from '../src/gamepad';
import type { GameLobbyHandOff } from '../src/gameLobbyHost';
import { LobbyMatch, MATCH_ABORT_DIALOG, returnDialog, type LobbyMatchReturn } from '../src/lobbyMatch';
import {
  ABORT_LINES_READING, abortLines, MATCH_ABORT_DIALOG_ID, MATCH_ABORT_WAIT_SECONDS, MatchAbort,
} from '../src/matchAbort';
import { mountTaunts } from '../src/matchTaunts';
import type { NetClient } from '../src/net/client';
import type { SoundData } from '../src/soundData';
import { START_MENU_CONFIRM_TEXT } from '../src/startMenu';
import { mountHeadset } from '../src/voice/headset';

/**
 * MATCH-02 (web research 266 §8.10): where ABORT lands online. The confirm's YES writes `mission_abort` 1
 * (`FUN_002041e0` D:L61890-61897; the confirm itself is `startMenu.test.ts`'s); the mission tick turns it into state 4
 * (`FUN_002aa490` D:L151146, D:L151157-151158), whose online branch holds the talk flag off each tick and, 3 s of the
 * mission's clock later, writes `dlgNetAbort.rdr` into the menu state's start dialog and switches to it (`FUN_002a9b30`
 * D:L150614-150627). `dlgNetAbort.rdr`'s ONSTART leaves the game (DisconnectFromGameServer), waits 3 s and returns to
 * SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`; `dlgLANBriefingRoom.rdr` on a LAN). The pin's and the disc's cases read the
 * dialog's scripts and the ELF; the disc's skip without `SOCOM_DISC`.
 */

describe('MATCH-02: the mission\'s side of ABORT online (FUN_002aa490 D:L151067; FUN_002a9b30 D:L150614-150627)', () => {
  it('nothing before the confirm; after it, the wait is set at the next tick (+0xe4 = +0xe0 + 3) and ends once +0xe4 < +0xe0: #529', () => {
    const a = new MatchAbort();
    for (let i = 0; i < 600; i++) expect(a.frame(1 / 60)).toBe(false);
    expect(a.ended()).toBeNull();
    expect(a.aborting()).toBe(false);
    a.abort();
    expect(a.aborting()).toBe(true);
    expect(a.frame(0.5)).toBe(false);                     // the first tick: +0xe0 0.5, +0xe4 3.5 (D:L150619-150620)
    expect(a.frame(1.5)).toBe(false);                     // 2.0
    expect(a.frame(1.5)).toBe(false);                     // 3.5: not yet below (a strict test, D:L150622)
    expect(a.ended()).toBeNull();
    expect(a.frame(0.01)).toBe(true);                     // 3.51: the switch, once
    expect(a.frame(1)).toBe(false);
    expect(a.ended()).toBe(MATCH_ABORT_DIALOG_ID);
    expect(MATCH_ABORT_DIALOG_ID).toBe(529);
    expect(MATCH_ABORT_WAIT_SECONDS).toBe(3);
  });

  it('a second confirm does not move the wait; the HUD torn down forgets it', () => {
    const a = new MatchAbort();
    a.abort(); a.frame(1); a.frame(2); a.abort(); a.frame(1.01);
    expect(a.ended()).toBe(529);
    a.reset();
    expect(a.ended()).toBeNull();
    expect(a.aborting()).toBe(false);
  });

  it('while aborting the talk is held off (FUN_0030e6e0(voice, 0) each tick, D:L150618): the taunts part\'s talk gate', () => {
    const talked = (aborting: boolean): boolean => {
      let now = 0, any = false;
      const net = { client: { id: 2, send: () => {} }, gate: () => ({ inMatch: true, alive: true, cameraOnSelf: true, spectator: false }) };
      const t = mountTaunts({
        net: () => net as never, hud: { postMessage: () => {} }, audio: { play: () => true as never, playStream: () => 'played' },
        custom: () => [], otherMenu: () => false, release: () => {}, clock: () => now, runAndTalk: () => true, aborting: () => aborting,
        headset: mountHeadset({ line: () => {}, win: null, doc: null, pads: null }),
      });
      t.setData({ taunts: { defaults: [], captions: {}, vocals: { seal: [], terrorist: [] } } } as unknown as SoundData);
      for (let i = 0; i < 20; i++) { now += 0.05; any = t.pad(new Set<PadButton>(['L2']), noInput()).talk || any; }
      t.dispose();
      return any;
    };
    expect(talked(false)).toBe(true);
    expect(talked(true)).toBe(false);
  });
});

describe('MATCH-02: where it lands -- dlgNetAbort.rdr (S:0x3f1380), then SOCOM II ONLINE', () => {
  it('the match\'s end on #529 is dlgNetAbort.rdr, why \'aborted\' (FUN_002a9b30 D:L150624)', () => {
    expect(returnDialog(MATCH_ABORT_DIALOG_ID)).toEqual({ dialog: MATCH_ABORT_DIALOG, why: 'aborted' });
    expect(MATCH_ABORT_DIALOG).toBe('dlgNetAbort.rdr');
  });

  it('the front end\'s return: the client closed (the room\'s leave), the hold let go, the menu state on dlgNetAbort.rdr', async () => {
    let t = 0, closes = 0, ended: number | null = null;
    const client = {
      state: 'open', closeCode: null, on: () => () => {}, reportLoaded: () => {}, close: () => { closes++; client.state = 'closed'; },
    } as unknown as NetClient & { state: string };
    const roundStart = { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 };   // LOAD-HOLD: the barrier passed
    const hand = { client, held: true, welcome: null, roundStart, mission: 'mp2', mediusWorldId: 7, gameName: 'g', lateJoiner: false } as unknown as GameLobbyHandOff;
    const backs: LobbyMatchReturn[] = [], holds: boolean[] = [];
    const match = new LobbyMatch({
      now: () => t, screen: { show: () => {}, hide: () => {} }, load: () => Promise.resolve(),
      start: (s) => ({ release: () => s.client, close: () => { s.client.close(); }, ended: () => ended }),
      back: (r) => { backs.push(r); }, holds: (h) => { holds.push(h); },
    });
    match.start(hand);
    await Promise.resolve(); await Promise.resolve();
    for (let i = 0; i < 100 && match.phase !== 'match'; i++) { t += 50; match.frame(); }
    expect(match.phase).toBe('match');
    ended = MATCH_ABORT_DIALOG_ID;                         // the mount's `ended`: `MatchAbort.ended()`
    t += 16; match.frame();
    expect(backs).toEqual([{ dialog: 'dlgNetAbort.rdr', why: 'aborted', client: null }]);
    expect(closes).toBeGreaterThan(0);                     // the socket closed: the room's `leave` (`left` to the others)
    expect(match.phase).toBe('ended');
  });

  it('the pin: dlgNetAbort\'s ONSTART leaves the game, waits 3 s and returns; ReturnToWorldOfSOCOM goes to SOCOM II ONLINE (LAN: its briefing room)', () => {
    const pin = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tools/test/onlineDialogs.pinned.json'), 'utf-8')) as {
      chapters: { name: string; widgets: string[]; bindings: string[]; animations: Record<string, string[]>; locs: number[] }[];
      library: Record<string, string[]>;
    };
    const c = pin.chapters.find((x) => x.name === 'dlgNetAbort.rdr')!;
    expect(c.bindings).toContain('SCREEN EVENT ONSTART -> onstart_handler [dlgNetAbort.rdr]');
    expect(c.bindings).toContain('SCREEN EVENT ONSTART -> LANorMPAbortCaption [dlgNetAbort.rdr]');
    expect(c.animations.onstart_handler).toEqual(['StopAllSounds(NA)', 'VagStreaming(OFF)', 'DisconnectFromGameServer(NA)', 'WAIT 3', 'CALL exit_lobby']);
    expect(c.animations.LANorMPAbortCaption).toEqual(['IF ComeFromLan == 1', '  disconnect.op1(#530)', 'ELSE', '  disconnect.op1(#531)', 'ENDIF']);
    expect(c.animations.exit_lobby).toContain('CALL ReturnToWorldOfSOCOM (blocking)');
    expect(c.widgets).toContain('TEXT bar_title _529_AbortingMission_MSG');
    expect(pin.library['RUN/UIZANIM.ZAR:UIanim.rdr/ReturnToWorldOfSOCOM']).toEqual([
      'IF ComeFromLan == 1', '  SWITCHMENU(dlgLANBriefingRoom.rdr)', 'ELSE', '  SWITCHMENU(dlgWorldOfSOCOM.rdr)', 'ENDIF',
    ]);
  });

  it('/testroom, which has no dialog runtime, posts the dialog\'s two lines (ABORT_LINES_READING)', () => {
    expect(abortLines(false)).toEqual([ABORT_LINES_READING.aborting, ABORT_LINES_READING.online]);
    expect(abortLines(true)).toEqual([ABORT_LINES_READING.aborting, ABORT_LINES_READING.lan]);
    expect(ABORT_LINES_READING).toEqual({ aborting: 'ABORTING MISSION.', online: 'RETURNING TO SOCOM II ONLINE', lan: 'RETURNING TO LAN BRIEFING ROOM' });
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));
const ELF = DISC ? join(DISC, 'socom2_game.elf') : '';

describe.skipIf(!HAVE_DISC || !existsSync(ELF))('MATCH-02 on the disc (SOCOM_DISC): the ELF, UIMnLOC and the front end on dlgNetAbort.rdr', () => {
  it('the ELF: the dialog\'s name, the confirm\'s strings, and the widgets\' +0x1c the show and +0x18 the hide (research 114\'s correction)', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF)));
    expect(elf.cstr(0x3f1380)).toBe(MATCH_ABORT_DIALOG);
    const T = START_MENU_CONFIRM_TEXT;
    expect([0x3e3ce0, 0x3e3d00, 0x3e3d18, 0x3e3d20, 0x3e3d38, 0x3e3d40].map((va) => elf.cstr(va))).toEqual([T.sure, T.abort, T.blank, T.replay, T.yes, T.no]);
    // The box class (vtable 0x406e80, `FUN_00364c50` D:L262007): +0x18 is FUN_00364e50, which clears bit 6 of +0x14
    // (D:L262096-262101); +0x1c FUN_00364e30, which sets it (D:L262086-262091); its draw FUN_00364e70 walks its
    // children only with the bit set (D:L262106-262115). So +0x1c shows and +0x18 hides.
    expect([elf.u32(0x406e80 + 0x18), elf.u32(0x406e80 + 0x1c)]).toEqual([0x364e50, 0x364e30]);
    // The six lines cases 1 and 2 show and hide (+0xcf0..+0xfe8) are the text class (vtable 0x406df0, set by
    // `FUN_00363e70` D:L261452): its +0x18 is 0x363c10 (`thunk_FUN_00364e50`, D:L261318) and its +0x1c 0x363c00, each a
    // `j` to the box class's hide and show (MIPS `j`: 0x08000000 | target >> 2), the delay slot a nop.
    expect([elf.u32(0x406df0 + 0x18), elf.u32(0x406df0 + 0x1c)]).toEqual([0x363c10, 0x363c00]);
    expect([elf.u32(0x363c10), elf.u32(0x363c14)]).toEqual([0x08000000 | (0x364e50 >>> 2), 0]);
    expect([elf.u32(0x363c00), elf.u32(0x363c04)]).toEqual([0x08000000 | (0x364e30 >>> 2), 0]);
  });

  it('UIMnLOC: #529, #530 and #531, the dialog\'s texts', async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { parseRdr, readZarMembers } = await import('@s2u/archive');
    const { parseLocTable, UIMNLOC } = await import('@s2u/scene');
    const b = (await readZarMembers(new FsAssetSource(DISC), UIMNLOC.archive, [UIMNLOC.member])).get(UIMNLOC.member)!;
    const loc = parseLocTable(parseRdr(b));
    const text = (id: number): string | undefined => loc.find((e) => e.id === id)?.text;
    expect([text(529), text(530), text(531)]).toEqual([ABORT_LINES_READING.aborting, ABORT_LINES_READING.lan, ABORT_LINES_READING.online]);
  });

  it('the front end on dlgNetAbort.rdr: its ONSTART runs, and after its WAIT 3 the menu state is on SOCOM II ONLINE (dlgWorldOfSOCOM.rdr)', async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { UI_TICK_SECONDS } = await import('@s2u/ui');
    const { FrontEndSession, readFrontEndDisc } = await import('../src/frontEnd');
    const d = await readFrontEndDisc(new FsAssetSource(DISC));
    const s = new FrontEndSession({ disc: d, startDialog: MATCH_ABORT_DIALOG });
    const seen: string[] = [], at: number[] = [];
    let t = 0;
    s.advance(0);
    for (let i = 0; i * UI_TICK_SECONDS < 5; i++) {
      t += 1000 * UI_TICK_SECONDS + 0.01;
      s.advance(t);
      const name = s.machine.shell()?.currentName ?? '';
      if (seen.at(-1) !== name) { seen.push(name); at.push(t); }
    }
    expect(seen.slice(0, 2)).toEqual(['dlgNetAbort.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(3000 - 1000 * UI_TICK_SECONDS);   // its WAIT 3 first
  }, 60_000);
});

/**
 * NET-ERRNO (research 315 §1 and §6 E4): the other three end dialogs' landings, as MATCH-02's case above pins ABORT's --
 * each set read from the disc and run by the front end's menu state, `ComeFromLan` 0 (online). `dlgNetBanned.rdr` (R315.3:
 * #541, #539, #540; `DisconnectFromGameServer`, `WAIT 4`, `ReturnToWorldOfSOCOM`; TRIANGLE's `exit_lobby` at once;
 * `onlineDialogs.pinned.json` P:L12478-12497) and `dlgNetAbandoned.rdr` (R315.4: POPUP #528, no button, no wait,
 * `ReturnToWorldOfSOCOM`; P:L12419-12436) on SOCOM II ONLINE; `dlgNetError.rdr` (R315.5, `displayNews`
 * P:L12262-12299) with `mp_net_errno` 0 on SOCOM II ONLINE at once, with 32 the popup with MAIN MENU (#45) waiting, then
 * REBOOT; MP_MEDIUS_ERROR (`UIanim.rdr`'s `OnMultiplayerDisconnect`, bound on all four end dialogs, R315.7,
 * P:L15659-15672: the event's text, MAIN MENU, then REBOOT) on `dlgNetError`'s popup and on `dlgNetBanned`'s wait. The
 * lobby side of the abandon is `gameLobbyScreen.test.ts`'s; the match's own return to `dlgNetError.rdr` with errno 32 is
 * `frontEndMatch.test.ts`'s (E2).
 *
 * The menu state's `currentName` is the switch's target from its request (`MenuShell.switchTo`, `FUN_00365a00`): a
 * landing is timed from the request, and a popup is recorded by its text whichever name the shell holds.
 */
describe.skipIf(!HAVE_DISC)('NET-ERRNO E4 on the disc (SOCOM_DISC): where dlgNetBanned, dlgNetAbandoned and dlgNetError land (research 315 §1)', () => {
  type Disc = Awaited<ReturnType<typeof import('../src/frontEnd')['readFrontEndDisc']>>;
  let discP: Promise<Disc> | null = null;
  const disc = (): Promise<Disc> => (discP ??= (async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { readFrontEndDisc } = await import('../src/frontEnd');
    return readFrontEndDisc(new FsAssetSource(DISC));
  })());
  const loc = async (id: number): Promise<string> => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { parseRdr, readZarMembers } = await import('@s2u/archive');
    const { parseLocTable, UIMNLOC } = await import('@s2u/scene');
    const b = (await readZarMembers(new FsAssetSource(DISC), UIMNLOC.archive, [UIMNLOC.member])).get(UIMNLOC.member)!;
    return parseLocTable(parseRdr(b)).find((e) => e.id === id)!.text.trim();
  };

  /** The front end started on `dialog` (MATCH-02's pattern), `mp_net_errno` set before its first frame when given. */
  async function boot(dialog: string, errno: number | null = null) {
    const { DIALOG_EVENTS, findNode, lobbyEventInto, UI_TICK_SECONDS, VALVE_TYPE } = await import('@s2u/ui');
    const { FrontEndSession } = await import('../src/frontEnd');
    const launches: string[][] = [];
    const s = new FrontEndSession({ disc: await disc(), startDialog: dialog, onLaunch: (l) => { launches.push([...l.argv]); } });
    if (errno !== null) s.opener.valves.set('mp_net_errno', errno, VALVE_TYPE.PERM);
    const seen: string[] = [], at: number[] = [], popups: string[] = [];
    let t = 0;
    const popupText = (): string => (s.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
    const shown = (): boolean => { const sh = s.machine.shell(); return sh ? sh.popups.shown(sh.screen) : false; };
    const frame = (): void => {
      t += 1000 * UI_TICK_SECONDS + 0.01;
      s.advance(t);
      const name = s.machine.shell()?.currentName ?? '';
      if (seen.at(-1) !== name) { seen.push(name); at.push(t); }
      if (shown() && popups.at(-1) !== popupText()) popups.push(popupText());
    };
    s.advance(0);
    const run = (seconds: number): void => { for (let i = 0; i * UI_TICK_SECONDS < seconds; i++) frame(); };
    /** A pad button held one frame through the page's input (the popup reads it there, `FUN_00370990`), then let go. */
    const hold = (name: 'CROSS'): void => {
      s.input.source = { read: () => ({ down: new Set([name]), stickX: 0, stickY: 0 }) } as unknown as typeof s.input.source;
      frame();
      s.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) } as unknown as typeof s.input.source;
    };
    const text = (node: string): string => {
      const sh = s.machine.shell();
      const c = sh ? findNode(sh.screen.root, node)?.content : null;
      return c?.kind === 'text' ? new TextDecoder().decode(Uint8Array.from(c.text.codes)).trim() : '';
    };
    const button = (): [string | undefined, string] => {
      const p = s.parts.current?.popup()?.popup;
      return [p?.valve?.name, p ? String.fromCharCode(...p.buttons[0].captionCodes) : ''];
    };
    const mediusError = (msg: string): void => { lobbyEventInto(() => s.machine, s.parts)(DIALOG_EVENTS.MP_MEDIUS_ERROR!, msg); };
    return { s, launches, seen, at, popups, run, hold, shown, text, button, mediusError, errno: () => s.opener.valves.find('mp_net_errno')?.value ?? 0, tick: 1000 * UI_TICK_SECONDS };
  }

  it('dlgNetBanned.rdr: #541, #539, #540 on screen; WAIT 4, then SOCOM II ONLINE (dlgWorldOfSOCOM.rdr)', async () => {
    const x = await boot('dlgNetBanned.rdr');
    x.run(0.5);
    expect([x.text('title'), x.text('banned'), x.text('disconnect')]).toEqual([await loc(541), await loc(539), await loc(540)]);
    x.run(6);
    expect(x.seen.slice(0, 2)).toEqual(['dlgNetBanned.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(x.at[1]! - x.at[0]!).toBeGreaterThanOrEqual(4000 - x.tick);              // its WAIT 4 first
    expect(x.launches).toEqual([]);
  }, 120_000);

  it('dlgNetBanned.rdr: TRIANGLE leaves at once for SOCOM II ONLINE, before the 4 s', async () => {
    const x = await boot('dlgNetBanned.rdr');
    x.run(1);
    x.s.press('TRIANGLE');
    x.run(1.5);
    expect(x.seen.slice(0, 2)).toEqual(['dlgNetBanned.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(x.at[1]! - x.at[0]!).toBeLessThan(4000 - x.tick);
  }, 120_000);

  it('dlgNetAbandoned.rdr: the popup #528 with no button until the switch, then SOCOM II ONLINE at once (no WAIT)', async () => {
    const x = await boot('dlgNetAbandoned.rdr');
    x.run(3);
    expect(x.popups).toEqual([await loc(528)]);
    expect(x.seen.slice(0, 2)).toEqual(['dlgNetAbandoned.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(x.at[1]! - x.at[0]!).toBeLessThan(1000);
    expect(x.shown()).toBe(false);                                                   // no popup survives the switch (R118.3)
    expect(x.launches).toEqual([]);
  }, 120_000);

  it('dlgNetError.rdr with mp_net_errno 0: the buttonless popup until the switch, then SOCOM II ONLINE at once', async () => {
    const x = await boot('dlgNetError.rdr');
    expect(x.errno()).toBe(0);
    x.run(3);
    expect(x.popups).toEqual(['You have been disconnected from SOCOM II Online.']);   // the set's online literal (<text 48>)
    expect(x.seen.slice(0, 2)).toEqual(['dlgNetError.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(x.at[1]! - x.at[0]!).toBeLessThan(1000);
    expect(x.launches).toEqual([]);
  }, 120_000);

  it('dlgNetError.rdr with mp_net_errno 32: the popup with MAIN MENU waits; CROSS -> REBOOT (dlgAfterErrorReboot.rdr)', async () => {
    const x = await boot('dlgNetError.rdr', 32);
    x.run(10);
    expect(x.seen).toEqual(['dlgNetError.rdr']);                                    // it waits for the button
    // The popup's text is the record's +0x10 name (`FUN_0036da20` D:L266833-266834 through `FUN_0026ed60`): the set stores the
    // unquoted sentence as one name a word (READERC 463460-463508: `You`, `have`, ...), so its text is `You` -- research
    // 315 §2 reads the whole sentence (flagged at NET-ERRNO for the controller; ONL-32's capture settles it).
    expect(x.popups).toEqual(['You']);
    expect(x.button()).toEqual(['OKValve', await loc(45)]);
    x.hold('CROSS');
    x.run(3);
    expect(x.launches.map((l) => l[1])).toEqual(['dlgAfterErrorReboot.rdr']);       // SWITCHMENU(REBOOT): REBOOT_LAUNCH
  }, 120_000);

  it('MP_MEDIUS_ERROR on dlgNetError.rdr\'s popup (errno 32): OnMultiplayerDisconnect -- the event\'s text with MAIN MENU; CROSS -> REBOOT', async () => {
    const x = await boot('dlgNetError.rdr', 32);
    x.run(1);
    x.mediusError('Disconnected from Network');                                    // #1068's text (FUN_002f4090 D:L194283-194293)
    x.run(8);
    expect(x.seen).toEqual(['dlgNetError.rdr']);
    expect(x.popups).toEqual(['You', 'Disconnected from Network']);
    expect(x.button()).toEqual(['OKValve', await loc(45)]);
    x.hold('CROSS');
    x.run(3);
    expect(x.launches.map((l) => l[1])).toEqual(['dlgAfterErrorReboot.rdr']);
  }, 120_000);

  it('MP_MEDIUS_ERROR on dlgNetBanned.rdr\'s 4 s wait: OnMultiplayerDisconnect\'s popup with MAIN MENU; CROSS in the wait -> REBOOT', async () => {
    const x = await boot('dlgNetBanned.rdr');
    x.run(1);
    x.mediusError('Disconnected from Network');
    x.run(1);
    expect(x.seen).toEqual(['dlgNetBanned.rdr']);
    expect(x.popups).toEqual(['Disconnected from Network']);
    expect(x.button()).toEqual(['OKValve', await loc(45)]);
    x.hold('CROSS');
    x.run(4);
    expect(x.launches.map((l) => l[1])).toEqual(['dlgAfterErrorReboot.rdr']);
  }, 120_000);

  it('MP_MEDIUS_ERROR on dlgNetBanned.rdr\'s wait, no button: the set\'s own WAIT 4 still ends on SOCOM II ONLINE, the popup gone with the switch', async () => {
    // OnMultiplayerDisconnect stops nothing (P:L15659-15672), so the set's `onstart_handler` runs on beside it: its WAIT 4
    // and `ReturnToWorldOfSOCOM` switch while the popup waits, and no popup survives a switch (R118.3). Research 315 R315.7
    // reads this wait as going "through OnMultiplayerDisconnect to REBOOT"; that holds only for a CROSS within the 4 s
    // (the case above) -- flagged at NET-ERRNO for the controller.
    const x = await boot('dlgNetBanned.rdr');
    x.run(1);
    x.mediusError('Disconnected from Network');
    x.run(6);
    expect(x.seen.slice(0, 2)).toEqual(['dlgNetBanned.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(x.at[1]! - x.at[0]!).toBeGreaterThanOrEqual(4000 - x.tick);
    expect(x.shown()).toBe(false);
    expect(x.launches).toEqual([]);
  }, 120_000);
});
