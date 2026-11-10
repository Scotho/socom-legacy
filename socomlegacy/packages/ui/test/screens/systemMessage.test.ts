import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { lobbySessionStart, type ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, MEDIUS_LOBBY_NAME_VAR } from '../../src/screens/briefingRoomCommands';
import { GAME_LOBBY } from '../../src/screens/gameLobbyCommands';
import {
  BriefingRoomChat, CHAT_COLOUR, CHAT_KIND, CHAT_POLL_MS_ADAPTATION, CHAT_RECV_VAR, GAME_LOBBY_CHAT_VAR, SERVER_MESSAGE_BYTES, SERVER_MESSAGE_NAME,
  SERVER_MESSAGE_TOO_LONG, SYSTEM_MESSAGE_KIND, systemMessageFlag, systemMessageText,
  type ChatLinesReply, type LobbyChatService, type RoundQueueLine, type ServerSystemMessage,
} from '../../src/screens/briefingRoomChat';
import { HAVE, WORLD } from './worldOfSocomRig';
import { briefingRig, type BriefingRigOptions } from './briefingRoomRig';
import { gameLobbyRig } from './gameLobbyRig';

/**
 * SA-43c RESTART-NOTICE, Part 1 -- the page's half (web research 345 §2; the simulation track: reading, pending review):
 * a server's system message (RT_MSG_SERVER_SYSTEM_MESSAGE) as the original client draws it. `FUN_0030dce0`
 * (D:L210355-210398) buffers the text to 1000 bytes ("[Server message too long]" past it, S:0x3f6740), maps the severity
 * to a flag (below 0x80: 2; below 0xC0: 1; else 0, D:L210380-210389) and calls the current state's +0x2c with the text,
 * the name "Server" (S:0x3f6760), the flag and the kind 1 (0x30ddb0, decoded by hand). The front end's (`FUN_001f4d20`
 * D:L54919-54934): kind 1 with the flag 2 raises MP_SYSTEM_MESSAGE with the text (`FUN_001f3bf0` D:L54925; the name-to-id
 * chain gives 0x3a at D:L54618-54620), else the screen's line; the disc's `OnSystemMessage` (UIanim.rdr) is the modal
 * popup CROSS closes, bound on 20 online dialogs. A round's (`FUN_001ecc40` D:L51076-51099): the text alone on the HUD.
 * The loading states' (`FUN_001e7c80`): empty -- dropped. The carrier is ours (`/lobby/chat-lines`' `system`, central's
 * SA-43c notices). Synthetic notices; nothing measured on the original running.
 */

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1), room('Bravo', 2)];
const strings = (v: UiVarValue | undefined): string[] => (v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : `<${e.type}>`)) : []);
const TEXT = 'The server restarts in about 10 minutes.';
const notice = (id: number, text = TEXT, severity = 0): ServerSystemMessage => ({ id, severity, text });

/** The chat alone over a fake service: the poll's reply carries `system` (`ChatLinesReply`). */
function unit(o: { state?: number; round?: () => ((l: RoundQueueLine) => void) | null; loading?: () => boolean; reply?: () => Promise<ChatLinesReply | []> } = {}) {
  const uiVars = new UiVarManager();
  lobbySessionStart(uiVars);
  uiVars.set(uiVars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: 'Alpha' });
  uiVars.add(CHAT_RECV_VAR, null, 2);
  const lobby = { up: true, st: o.state ?? 11, state(): number { return this.st; }, account: (): string | null => 'socomc' };
  const events: [number, string | null][] = [];
  let system: ServerSystemMessage[] = [];
  const service: LobbyChatService = {
    findPlayer: () => new Promise(() => {}), chat: () => Promise.resolve(),
    chatLines: (): Promise<ChatLinesReply | []> => o.reply?.() ?? Promise.resolve({ lines: [], system }),
  };
  const chat = new BriefingRoomChat({ uiVars, lobby, service, rooms: () => ROOMS, event: (k, t) => { events.push([k, t]); }, ...(o.round ? { round: o.round } : {}), ...(o.loading ? { loading: o.loading } : {}) });
  let now = 0;
  /** One poll's reply taken, then the menu state's tick step (6) (`systemMessages`). */
  const poll = async (live: ServerSystemMessage[]): Promise<void> => {
    system = live;
    chat.frame(now += CHAT_POLL_MS_ADAPTATION);
    await flush();
    chat.systemMessages();
  };
  return { uiVars, lobby, chat, events, poll, panel: () => strings(uiVars.find(CHAT_RECV_VAR)?.value), lobbyPanel: () => strings(uiVars.find(GAME_LOBBY_CHAT_VAR)?.value) };
}

describe('FUN_0030dce0 (D:L210355-210398): the text, the flag, the name and the kind', () => {
  it('MP_SYSTEM_MESSAGE is the dialog event 0x3a (FUN_001f3bf0\'s chain, D:L54618-54620)', () => {
    expect(DIALOG_EVENTS['MP_SYSTEM_MESSAGE']).toBe(0x3a);
  });

  it('the name "Server" (S:0x3f6760), the kind 1 (0x30ddb0), the buffer of 1000 bytes and its overflow text (S:0x3f6740)', () => {
    expect(SERVER_MESSAGE_NAME).toBe('Server');
    expect(SYSTEM_MESSAGE_KIND).toBe(1);
    expect(SYSTEM_MESSAGE_KIND).toBe(CHAT_KIND.universe);
    expect(SERVER_MESSAGE_BYTES).toBe(1000);
    expect(SERVER_MESSAGE_TOO_LONG).toBe('[Server message too long]');
  });

  it('a text of 999 bytes is kept; one of 1000 bytes or more is "[Server message too long]" -- bytes, not characters', () => {
    expect(systemMessageText('a'.repeat(999))).toBe('a'.repeat(999));
    expect(systemMessageText('a'.repeat(1000))).toBe(SERVER_MESSAGE_TOO_LONG);
    expect(systemMessageText('é'.repeat(500))).toBe(SERVER_MESSAGE_TOO_LONG);      // 1000 bytes in UTF-8
    expect(systemMessageText('é'.repeat(499))).toBe('é'.repeat(499));
  });

  it('the flag: below 0x80 2, below 0xC0 1, else 0 (D:L210380-210389)', () => {
    expect([0, 0x7f, 0x80, 0xbf, 0xc0, 0xff].map(systemMessageFlag)).toEqual([2, 2, 1, 1, 0, 0]);
  });
});

describe('the current state\'s +0x2c: the front end, a round, a load', () => {
  it('the front end, severity below 0x80: MP_SYSTEM_MESSAGE with the text, raised at the menu state\'s tick step (6), never at the reply', async () => {
    const u = unit({ state: 11 });
    await u.poll([notice(1)]);
    expect(u.events).toEqual([[0x3a, TEXT]]);
    expect(u.panel()).toEqual([]);                                             // no room line (FUN_001f4d20's first branch only)
    const held = unit({ reply: () => Promise.resolve({ lines: [], system: [notice(1)] }) });
    held.chat.frame(CHAT_POLL_MS_ADAPTATION);
    await flush();
    expect(held.events).toEqual([]);                                           // the reply taken; not yet raised
    held.chat.systemMessages();
    expect(held.events).toEqual([[0x3a, TEXT]]);
  });

  it('each notice\'s id once: a notice still live at the next polls is not raised again; a newer one is', async () => {
    const u = unit();
    await u.poll([notice(1)]);
    await u.poll([notice(1)]);
    await u.poll([notice(1), notice(2, 'The server is restarting now.')]);
    expect(u.events).toEqual([[0x3a, TEXT], [0x3a, 'The server is restarting now.']]);
    await u.poll([notice(1)]);                                                // an older id after a newer: never again
    expect(u.events).toHaveLength(2);
  });

  it('the front end, severity 0x80 and above, in state 11: the room\'s line "Server", a universe line, in every room\'s history (FUN_001f5020)', async () => {
    const u = unit({ state: 11 });
    await u.poll([notice(1, 'hello', 0x80)]);
    expect(u.events).toEqual([]);
    expect(u.panel()).toEqual([`${CHAT_COLOUR.universe} Server: hello`]);
  });

  it('the front end, severity 0x80 and above, out of state 11: the game lobby\'s panel "#C\\x80\\x80@Server: text" (FUN_001f4df0)', async () => {
    const u = unit({ state: 17 });
    await u.poll([notice(1, 'hello', 0xc0)]);
    expect(u.events).toEqual([]);
    expect(u.lobbyPanel()).toEqual(['#C\x80\x80@Server: hello\n']);
  });

  it('a round (FUN_001ecc40): the text alone to the round\'s sink, kind 1, the state\'s own line (no queue test); no dialog event', async () => {
    const lines: RoundQueueLine[] = [];
    const u = unit({ round: () => (l) => { lines.push(l); } });
    await u.poll([notice(1), notice(2, 'x', 0xc0)]);
    expect(lines).toEqual([{ text: TEXT, name: '', kind: 1, own: true }, { text: 'x', name: '', kind: 1, own: true }]);
    expect(u.events).toEqual([]);
  });

  it('a load (FUN_001e7c80, empty): dropped -- and not shown later, once the front end is current again', async () => {
    let loading = true;
    const lines: RoundQueueLine[] = [];
    const u = unit({ loading: () => loading, round: () => null });
    await u.poll([notice(1)]);
    expect([u.events, lines, u.panel(), u.lobbyPanel()]).toEqual([[], [], [], []]);
    loading = false;
    await u.poll([notice(1)]);
    expect(u.events).toEqual([]);
    await u.poll([notice(1), notice(2)]);
    expect(u.events).toEqual([[0x3a, TEXT]]);
  });

  it('OA-3: systemMessage routes every system entry as before and never sees a say', async () => {
    // OA-3 (the operator announcement plan, OA.R1; a browser adaptation): a reply with central's `says` only -- the page's
    // toast takes them (viewer `operatorToast.ts`); this routing (FUN_0030dce0, the cases above) never sees one.
    for (const state of [11, 17]) {
      const says = [{ id: 9, severity: 0, text: TEXT, until: Date.now() + 600_000, kind: 'say' }, { id: 8, withdrawn: true }];
      const lines: RoundQueueLine[] = [];
      const u = unit({ state, reply: () => Promise.resolve({ lines: [], says } as unknown as ChatLinesReply) });
      u.chat.frame(CHAT_POLL_MS_ADAPTATION);
      await flush();
      u.chat.systemMessages();
      expect([u.events, lines, u.panel(), u.lobbyPanel()]).toEqual([[], [], [], []]);   // no popup, no line
      const r = unit({ round: () => (l) => { lines.push(l); }, reply: () => Promise.resolve({ lines: [], says } as unknown as ChatLinesReply) });
      r.chat.frame(CHAT_POLL_MS_ADAPTATION);
      await flush();
      expect(lines).toEqual([]);                                                // nor the round's line
    }
    const after = unit();
    await after.poll([notice(1)]);                                              // the restart notice beside: as before
    expect(after.events).toEqual([[0x3a, TEXT]]);
  });

  it('an older reply (an array of lines, no `system`) is read as before', async () => {
    const u = unit({ reply: () => Promise.resolve([]) });
    u.chat.frame(CHAT_POLL_MS_ADAPTATION);
    await flush();
    u.chat.systemMessages();
    expect(u.events).toEqual([]);
  });
});

// ---- over the machine: the disc's own dialogs ----

const SETTLED = 60;
const SECOND = 30;
const HORIZON_ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })];
type Rig = Awaited<ReturnType<typeof briefingRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
async function until(r: Rig, done: () => boolean, frames = 10 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }

/** The live notices `/lobby/chat-lines` carries (a list the test sets), on the rig's poll. */
function noticesOn(o: BriefingRigOptions = {}): { live: ServerSystemMessage[]; o: BriefingRigOptions } {
  const held = { live: [] as ServerSystemMessage[] };
  return { live: held.live, o: { ...o, system: () => held.live } };
}
/** SOCOM II ONLINE past SERVER NEWS (its popup closed by CROSS). */
async function world(o: BriefingRigOptions): Promise<Rig> {
  const r = await briefingRig({ name: 'socomc', announcement: '', rooms: HORIZON_ROOMS, ...o });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  await r.settle(SETTLED);
  expect([r.current(), r.shown()]).toEqual([WORLD, false]);
  return r;
}
/** A notice told and the popup up with its text; CROSS closes it. */
async function toldAndClosed(r: Rig, live: ServerSystemMessage[], n: ServerSystemMessage): Promise<void> {
  live.push(n);
  await until(r, () => r.shown(), 3 * SECOND);
  expect(r.shown()).toBe(true);
  expect(popupText(r)).toBe(n.text);
  r.press('TRIANGLE', 6);                                                      // every button but CROSS swallowed (FUN_00368650)
  expect(r.shown()).toBe(true);
  r.press('CROSS', 6);                                                         // FUN_00370990 D:L268488-268510
  expect(r.shown()).toBe(false);
}

describe.skipIf(!HAVE)(`a server's system message on the disc's own dialogs${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('SOCOM II ONLINE (bound): the OnSystemMessage popup with the text, CROSS closes it, the menu usable after; the id shown once', async () => {
    const n = noticesOn();
    const r = await world(n.o);
    await toldAndClosed(r, n.live, notice(1));
    await r.settle(3 * SECOND);                                                 // three more polls, the notice still live
    expect(r.shown()).toBe(false);
    go(r, 'briefingrooms');                                                     // the menu's focus moves again
    r.press('CROSS', 6);
    expect(r.focused()).toBe('ROOMLIST');
  });

  it('the BRIEFING ROOM (dlgMPBriefingRoom, bound): the popup, CROSS closes it, the room stays', async () => {
    const n = noticesOn();
    const r = await world(n.o);
    go(r, 'briefingrooms');
    r.press('CROSS', 6);
    r.press('CROSS', 2);
    await until(r, () => r.current() === BRIEFING_ROOM, 200);
    await r.settle(SETTLED);
    expect(r.current()).toBe(BRIEFING_ROOM);
    await toldAndClosed(r, n.live, notice(1, 'The server is restarting now.'));
    await r.settle(SECOND);
    expect([r.current(), r.shown()]).toEqual([BRIEFING_ROOM, false]);
  });

  it('the GAME LOBBY (dlgGameLobby, bound): the popup, CROSS closes it, the lobby stays', async () => {
    const live: ServerSystemMessage[] = [];
    const statsHex = (): string => { const b = new Uint8Array(256); b[0] = 0x44; b[1] = 5; b[2] = 6; b[4] = 8; b[8] = 2; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
    const r = await gameLobbyRig({
      name: 'socomc', announcement: '', rooms: HORIZON_ROOMS, system: () => live,
      games: [{ status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1, genericField1: 1, genericField2: 65000,
        genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test$~Alpha', gameStats: statsHex(), endOfList: true }],
    });
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r, 'briefingrooms');
    r.press('CROSS', 6);
    r.press('CROSS', 2);
    await until(r, () => r.current() === BRIEFING_ROOM, 200);
    await r.settle(SETTLED);
    go(r, 'JoinGame');
    r.press('CROSS', 6);
    r.press('CROSS', 2);
    await until(r, () => r.current() === GAME_LOBBY, 60 * SECOND);
    await r.settle(SETTLED);
    expect(r.current()).toBe(GAME_LOBBY);
    await toldAndClosed(r, live, notice(1));
    await r.settle(SECOND);
    expect([r.current(), r.shown()]).toEqual([GAME_LOBBY, false]);
  });

  it('an unbound dialog (dlgNetServerSelect): nothing shown -- and the notice is not shown later on a bound one', async () => {
    const n = noticesOn();
    const r = await world(n.o);
    await r.switchTo('dlgNetServerSelect.rdr');
    await r.settle(SETTLED);
    expect(r.current()).toBe('dlgNetServerSelect.rdr');
    n.live.push(notice(1));
    await r.settle(3 * SECOND);
    expect(r.shown()).toBe(false);
    await r.switchTo(WORLD);
    await r.settle(3 * SECOND);
    expect([r.current(), r.shown()]).toEqual([WORLD, false]);
  });
});
