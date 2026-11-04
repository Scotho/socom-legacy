import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { lobbySessionStart, type ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { MEDIUS_LOBBY_NAME_VAR } from '../../src/screens/briefingRoomCommands';
import {
  BRIEFING_ROOM_CHAT_ROWS, BriefingRoomChat, CHAT_COLOUR, CHAT_KIND, CHAT_MESSAGE_CHARS, CHAT_POLL_MS_ADAPTATION, CHAT_RECV_VAR, GAME_LOBBY_CHAT_LINES,
  GAME_LOBBY_CHAT_VAR, ROOM_CHAT_LINES, WHISPER_USAGE_TEXT, appendGameLobbyChat, gameLobbyChatLine, parseChatInput,
  type ChatFwdLine, type LobbyChatService,
  ROUND_PLAYER_NOT_FOUND_TEXT,
} from '../../src/screens/briefingRoomChat';

/**
 * ONL-23's lobby-server half (web research 266 §1): `SendMediusChat` (0x27d220 -> `FUN_00281d40` D:L128201-128324 ->
 * 0x27d250 -> `FUN_002f4860` D:L194526-194590), the whisper's FindPlayer (`FUN_002f4a20` D:L194594-194651), the own line
 * (`FUN_002f4ba0` D:L194700-194707), a received ChatFwdMessage (`FUN_002f4ef0` D:L194781-194803), the screen's line
 * (`FUN_001f4d20` D:L54919-54934: `FUN_001f5020` D:L55020-55158 the room's 11 and `FUN_002f5020` D:L194822-194884 its
 * draw in state 11, else `FUN_001f4df0` D:L54939-55015 the game lobby's panel) and the poll that stands for the push
 * (`CHAT_POLL_MS_ADAPTATION`), over a fake service. Synthetic lines; nothing measured on the original running.
 */

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const room = (lobbyName: string, mediusWorldId: number): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false,
});
const ROOMS = [room('Alpha', 1), room('Bravo', 2)];
/** A command as the disc's `send_chat` carries it: the text's variable at +8, the recipient's name at +0x10 (a C string). */
const command = (fn: string, arg: string, recipientVar: string): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x30);
  for (let i = 0; i < recipientVar.length; i++) bytes[0x10 + i] = recipientVar.charCodeAt(i);
  return { anim: 'send_chat', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes };
};
const fwd = (name: string, message: string, messageType = 0, id = 7): ChatFwdLine => ({ originatorAccountId: id, originatorAccountName: name, messageType, message });
const strings = (v: UiVarValue | undefined): string[] => (v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : `<${e.type}>`)) : []);

function rig(o: { state?: number; up?: boolean; found?: (name: string) => { status: number; accountId: number; accountName: string }; ticket?: () => string | null } = {}) {
  const uiVars = new UiVarManager();
  lobbySessionStart(uiVars);
  uiVars.set(uiVars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: 'Alpha' });
  const lobby = { up: o.up ?? true, st: o.state ?? 11, state(): number { return this.st; }, account: (): string | null => 'socomc' };
  const requests: { op: string; body: unknown }[] = [];
  const events: string[] = [];
  const names = Object.fromEntries(Object.entries(DIALOG_EVENTS).map(([k, v]) => [v, k]));
  let waiting: ChatFwdLine[] = [];
  let answer: ((lines: ChatFwdLine[]) => void) | null = null;
  let hold = false;
  const service: LobbyChatService = {
    findPlayer: (q) => { requests.push({ op: 'find-player', body: q }); return Promise.resolve(o.found?.(q.name) ?? { status: 0, accountId: 42, accountName: q.name }); },
    chat: (q) => { requests.push({ op: 'chat', body: q }); return Promise.resolve(); },
    chatLines: () => {
      requests.push({ op: 'chat-lines', body: {} });
      if (hold) return new Promise((r) => { answer = r; });
      const out = waiting; waiting = []; return Promise.resolve(out);
    },
  };
  const chat = new BriefingRoomChat({ uiVars, lobby, service, rooms: () => ROOMS, event: (k) => { events.push(names[k]!); }, ticket: o.ticket });
  const host = new UiCommandHost({});
  chat.register(host);
  const set = (name: string, value: string): void => { uiVars.set(uiVars.add(name, null, 2), { type: 'string', value }); };
  /** The disc's `send_chat`: `SendMediusChat(CHATMESSAGE)` with MsgPlayer_Recipient at +0x10, CHATMESSAGE typed. */
  const send = async (text: string, recipient = ''): Promise<void> => {
    set('CHATMESSAGE', text); set('MsgPlayer_Recipient', recipient);
    const c = command('SendMediusChat', 'CHATMESSAGE', 'MsgPlayer_Recipient');
    expect(host.dispatch(c)).toMatchObject({ kind: 'table' });
    await flush(); await flush();
  };
  return {
    uiVars, lobby, chat, host, requests, events, send, set,
    deliver: (lines: ChatFwdLine[]) => { waiting.push(...lines); },
    holdPoll: (on: boolean) => { hold = on; },
    answerPoll: (lines: ChatFwdLine[]) => { answer?.(lines); answer = null; },
    panel: () => strings(uiVars.find(CHAT_RECV_VAR)?.value),
    lobbyPanel: () => strings(uiVars.find(GAME_LOBBY_CHAT_VAR)?.value),
  };
}

describe('SendMediusChat (row 48, 0x27d220): the briefing room\'s line', () => {
  it('is the table\'s row 48, ONL-23\'s, and this module\'s', () => {
    expect(BRIEFING_ROOM_CHAT_ROWS).toEqual([{ id: 48, name: 'SendMediusChat', fn: 0x27d220, task: 'ONL-23' }]);
    const row = uiCommandRowByName('SendMediusChat')!;
    expect([row.id, row.fn, row.task]).toEqual([48, 0x27d220, 'ONL-23']);
  });

  it('a room line: ChatMessage type 0 to -1 with the text (FUN_002f4860 D:L194556-194561); the own line drawn at once, "#C\\x80\\x80\\x80 name: text" (S:0x3f5648, S:0x3f5660)', async () => {
    const r = rig();
    await r.send('hello room');
    expect(r.requests).toEqual([{ op: 'chat', body: { messageType: 0, targetId: -1, message: 'hello room' } }]);
    expect(r.panel()).toEqual([`${CHAT_COLOUR.room} socomc: hello room`]);
  });

  it('the cut: 63 characters sent and drawn (the 64-byte field and its NUL, D:L194556-194558)', async () => {
    const r = rig();
    const long = 'x'.repeat(70);
    await r.send(long);
    expect(CHAT_MESSAGE_CHARS).toBe(63);
    expect(r.requests[0]!.body).toEqual({ messageType: 0, targetId: -1, message: 'x'.repeat(63) });
    expect(r.panel()).toEqual([`${CHAT_COLOUR.room} socomc: ${'x'.repeat(63)}`]);
  });

  it('never sent: a blank line, one opening "$~" (D:L128300-128313); the lobby down sends nothing (FUN_002f4860\'s flag, +0x7d)', async () => {
    const r = rig();
    await r.send('    ');
    await r.send('$~x');
    expect([r.requests, r.panel()]).toEqual([[], []]);
    const down = rig({ up: false });
    await down.send('hello');
    expect([down.requests, down.panel()]).toEqual([[], []]);
  });

  it('a whisper typed "/w name text": FindPlayer by the name, then ChatMessage type 1 to the account found (+0x48), the own line in the whisper colour', async () => {
    const r = rig();
    await r.send('/w bob  hi there');
    expect(r.requests).toEqual([
      { op: 'find-player', body: { name: 'bob' } },
      { op: 'chat', body: { messageType: 1, targetId: 42, message: 'hi there' } },
    ]);
    expect(r.panel()).toEqual([`${CHAT_COLOUR.whisper} socomc: hi there`]);
  });

  it('a quoted name runs to its closing quote; the keyboard\'s recipient edit (MsgPlayer_Recipient at +0x10) whispers without the /w', async () => {
    const r = rig();
    await r.send('/w "Big Bob" yo');
    await r.send('direct', 'carol');
    expect(r.requests.filter((q) => q.op === 'find-player').map((q) => q.body)).toEqual([{ name: 'Big Bob' }, { name: 'carol' }]);
    expect(r.requests.filter((q) => q.op === 'chat').map((q) => q.body)).toEqual([
      { messageType: 1, targetId: 42, message: 'yo' }, { messageType: 1, targetId: 42, message: 'direct' },
    ]);
  });

  it('no such player: MP_PLAYER_NOT_FOUND (S:0x3f5620, D:L194618) and nothing sent; a whisper to oneself draws no own line', async () => {
    const r = rig({ found: (name) => (name === 'socomc' ? { status: 0, accountId: 3, accountName: 'SOCOMC' } : { status: -998, accountId: 0, accountName: name }) });
    await r.send('/w nobody hi');
    expect([r.requests.map((q) => q.op), r.events, r.panel()]).toEqual([['find-player'], ['MP_PLAYER_NOT_FOUND'], []]);
    await r.send('/w socomc me');
    expect(r.requests.at(-1)).toEqual({ op: 'chat', body: { messageType: 1, targetId: 3, message: 'me' } });
    expect(r.panel()).toEqual([]);
  });

  it('"/w name" with no message: the usage line (S:0x3ef6d0), drawn as a universe line with no name; nothing sent', async () => {
    const r = rig();
    await r.send('/w bob');
    expect(r.requests).toEqual([]);
    expect(r.panel()).toEqual([`${CHAT_COLOUR.universe}${WHISPER_USAGE_TEXT}`]);
  });
});

describe('parseChatInput (FUN_00281d40 D:L128225-128313)', () => {
  it('reads the /w, the name (to a space, or quoted), the text after the spaces; the line sent or not', () => {
    expect(parseChatInput('hello', null)).toEqual({ text: 'hello', recipient: null });
    expect(parseChatInput('/W  bob   hi', null)).toEqual({ text: 'hi', recipient: 'bob' });
    expect(parseChatInput('/w "a b" c', null)).toEqual({ text: 'c', recipient: 'a b' });
    expect(parseChatInput('/w bob', null)).toBe('usage');
    expect(parseChatInput('/w "bob', null)).toBe('usage');
    expect(parseChatInput('/w bob ', null)).toBeNull();                     // the name read, the text blank: not sent
    expect(parseChatInput('/wbob hi', null)).toEqual({ text: '/wbob hi', recipient: null });
    expect(parseChatInput('/w bob hi', 'carol')).toEqual({ text: '/w bob hi', recipient: 'carol' });   // a recipient named: no parse
    expect(parseChatInput('$~x', null)).toBeNull();
    expect(parseChatInput(' \t ', null)).toBeNull();
    expect(parseChatInput(null, null)).toBeNull();
  });
});

describe('the lines received (FUN_002f4ef0, the screen\'s line FUN_001f4d20)', () => {
  it('a room line arrives as one text "name: text" with no name of its own (S:0x3f5638; CHAT_LINE_ARGS_READING): "#C\\x80\\x80\\x80name: text"; a whisper in its colour, a universe line in its', () => {
    const r = rig();
    r.chat.received(fwd('bob', 'hi all'));
    r.chat.received(fwd('carol', 'psst', 1));
    r.chat.received(fwd('ops', 'restart soon', 2));
    expect(r.panel()).toEqual([
      `${CHAT_COLOUR.room}bob: hi all`, '\n', `${CHAT_COLOUR.whisper}carol: psst`, '\n', `${CHAT_COLOUR.universe}ops: restart soon`,
    ]);
  });

  it('the room keeps 11 (FUN_001f5020: past 10 the oldest dropped before the new one is added): the 12th drops the first', () => {
    const r = rig();
    for (let i = 1; i <= 12; i++) r.chat.received(fwd('bob', `line ${i}`));
    expect(ROOM_CHAT_LINES).toBe(11);
    const lines = r.panel().filter((s) => s !== '\n');
    expect(lines).toHaveLength(11);
    expect([lines[0], lines[10]]).toEqual([`${CHAT_COLOUR.room}bob: line 2`, `${CHAT_COLOUR.room}bob: line 12`]);
    expect(r.panel().filter((s) => s === '\n')).toHaveLength(10);
  });

  it('a received text cut to 63 with its name ("name: text" in the record\'s 64-byte field, FUN_0039fc60)', () => {
    const r = rig();
    r.chat.received(fwd('bob', 'y'.repeat(63)));
    expect(r.panel()).toEqual([`${CHAT_COLOUR.room}${`bob: ${'y'.repeat(63)}`.slice(0, 63)}`]);
  });

  it('per room: a room line goes to the room MEDIUS_LOBBY_NAME holds, a whisper to every room\'s list (D:L55052-55101)', () => {
    const r = rig();
    r.chat.received(fwd('bob', 'in alpha'));
    r.chat.received(fwd('carol', 'to me', 1));
    r.set(MEDIUS_LOBBY_NAME_VAR, 'Bravo');
    r.chat.drawRoom();
    expect(r.panel()).toEqual([`${CHAT_COLOUR.whisper}carol: to me`]);
    r.set(MEDIUS_LOBBY_NAME_VAR, 'Alpha');
    r.chat.drawRoom();
    expect(r.panel()).toEqual([`${CHAT_COLOUR.room}bob: in alpha`, '\n', `${CHAT_COLOUR.whisper}carol: to me`]);
  });

  it('out of state 11 (a game lobby, state 17): a room line is not drawn (D:L194797); a whisper goes to BCHATLISTVAR as "#C..name: text\\n" (FUN_001f4df0)', () => {
    const r = rig({ state: 17 });
    r.chat.received(fwd('bob', 'room line'));
    r.chat.received(fwd('carol', 'psst', 1));
    expect(r.panel()).toEqual([]);
    expect(r.lobbyPanel()).toEqual([`${CHAT_COLOUR.whisper}carol: psst\n`]);
  });
});

describe('the game lobby\'s panel (BCHATLISTVAR): FUN_002ba9d0\'s and FUN_001f4df0\'s 21', () => {
  it('a line "#C\\x80\\x80\\x80name (All): text\\n" (S:0x3f2720), "Unknown" with no name (S:0x3f26f8); the last 20 and the new one kept', () => {
    expect(gameLobbyChatLine('bob', 'hi')).toBe(`${CHAT_COLOUR.room}bob (All): hi\n`);
    expect(gameLobbyChatLine(null, 'hi')).toBe(`${CHAT_COLOUR.room}Unknown (All): hi\n`);
    const uiVars = new UiVarManager();
    for (let i = 1; i <= 22; i++) appendGameLobbyChat(uiVars, `l${i}\n`);
    const v = strings(uiVars.find(GAME_LOBBY_CHAT_VAR)?.value);
    expect(GAME_LOBBY_CHAT_LINES).toBe(21);
    expect([v.length, v[0], v[20]]).toEqual([21, 'l2\n', 'l22\n']);
  });
});

describe('the poll (CHAT_POLL_MS_ADAPTATION): the lobby server\'s push, as the HTTP seam serves it', () => {
  it('/lobby/chat-lines once a period while the session is up, one in flight; the lines drawn in order', async () => {
    const r = rig();
    r.deliver([fwd('bob', 'one'), fwd('bob', 'two')]);
    r.chat.frame(0);
    await flush();
    expect(r.requests.map((q) => q.op)).toEqual(['chat-lines']);
    expect(r.panel()).toEqual([`${CHAT_COLOUR.room}bob: one`, '\n', `${CHAT_COLOUR.room}bob: two`]);
    r.chat.frame(CHAT_POLL_MS_ADAPTATION - 1);
    expect(r.requests).toHaveLength(1);
    r.holdPoll(true);
    r.chat.frame(CHAT_POLL_MS_ADAPTATION);
    r.chat.frame(3 * CHAT_POLL_MS_ADAPTATION);                        // one in flight: no second
    expect(r.requests).toHaveLength(2);
    r.answerPoll([fwd('bob', 'three')]);
    await flush();
    expect(r.panel().at(-1)).toBe(`${CHAT_COLOUR.room}bob: three`);
  });

  it('nothing asked with the lobby down or no ticket; a reply under a ticket since changed is dropped', async () => {
    const down = rig({ up: false });
    down.chat.frame(0);
    expect(down.requests).toEqual([]);
    const none = rig({ ticket: () => null });
    none.chat.frame(0);
    expect(none.requests).toEqual([]);
    let ticket = 'T1';
    const r = rig({ ticket: () => ticket });
    r.holdPoll(true);
    r.chat.frame(0);
    ticket = 'T2';
    r.answerPoll([fwd('bob', 'stale')]);
    await flush();
    expect(r.panel()).toEqual([]);
  });

  it('the ignore filter\'s effect is the server\'s (SVC-17): the page draws what it is sent -- an ignorer\'s poll without the line, a third\'s with it', async () => {
    const ignorer = rig(), third = rig();
    third.deliver([fwd('pest', 'spam')]);                              // the server held it back from the ignorer
    ignorer.chat.frame(0); third.chat.frame(0);
    await flush();
    expect([ignorer.panel(), third.panel()]).toEqual([[], [`${CHAT_COLOUR.room}pest: spam`]]);
    expect(CHAT_KIND).toEqual({ room: 0, universe: 1, whisper: 5 });
  });
});

/**
 * SVC-19 (web research 266 §3): the round's frame drains the lobby server's queue (`FUN_001f7ff0` D:L56708-56719), so a
 * line forwarded while a round runs goes to the round -- the queued text `"%s: %s"` (D:L194798), its sender's name (the
 * record's +0x89, `FUN_002a4050` D:L147657-147661) and its kind -- never to the front end's screen line; and the game
 * lobby's "(Team)" form (`FUN_002ba9d0` D:L160184, S:0x3f2700).
 */
describe('SVC-19: the round takes the queued lines while it runs; the game lobby line\'s (Team) form', () => {
  it('a polled whisper and universe line go to the round, with name and kind, not the lobby panel; a room line out of state 11 nowhere; no round, the panel', async () => {
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    let waiting: ChatFwdLine[] = [fwd('carol', 'psst', 1), fwd('ops', 'restart soon', 2), fwd('bob', 'in the room', 0)];
    const service: LobbyChatService = {
      findPlayer: () => Promise.resolve({ status: 0, accountId: 1, accountName: 'x' }), chat: () => Promise.resolve(),
      chatLines: () => { const out = waiting; waiting = []; return Promise.resolve(out); },
    };
    const taken: { text: string; name: string; kind: number }[] = [];
    let running = true;
    const chat = new BriefingRoomChat({
      uiVars, lobby: { up: true, state: () => 17 }, service, rooms: () => ROOMS,
      round: () => (running ? (l) => { taken.push(l); } : null),
    });
    chat.frame(0);
    await flush(); await flush();
    expect(taken).toEqual([{ text: 'carol: psst', name: 'carol', kind: CHAT_KIND.whisper }, { text: 'ops: restart soon', name: 'ops', kind: CHAT_KIND.universe }]);
    expect(uiVars.find(GAME_LOBBY_CHAT_VAR)).toBeUndefined();
    running = false;
    waiting = [fwd('carol', 'after', 1)];
    chat.frame(CHAT_POLL_MS_ADAPTATION);
    await flush(); await flush();
    expect(strings(uiVars.find(GAME_LOBBY_CHAT_VAR)?.value)).toEqual([`${CHAT_COLOUR.whisper}carol: after\n`]);
  });

  it('KEYBOARD-WHISPER: a whisper sent while a round runs answers on the round -- no such player the queued universe line, the own line on the round state -- never the dialog or the panel', async () => {
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    const sent: unknown[] = [];
    const events: number[] = [];
    const service: LobbyChatService = {
      findPlayer: (q) => Promise.resolve(q.name === 'nobody' ? { status: -998, accountId: 0, accountName: q.name } : { status: 0, accountId: 42, accountName: q.name }),
      chat: (q) => { sent.push(q); return Promise.resolve(); },
      chatLines: () => Promise.resolve([]),
    };
    const taken: unknown[] = [];
    let running = true;
    const chat = new BriefingRoomChat({
      uiVars, lobby: { up: true, state: () => 17, account: () => 'socomc' }, service, rooms: () => ROOMS, event: (k) => { events.push(k); },
      round: () => (running ? (l) => { taken.push(l); } : null),
    });
    chat.mediusChat('hi', 'nobody');
    await flush(); await flush();
    expect(events).toEqual([]);
    expect(taken).toEqual([{ text: ROUND_PLAYER_NOT_FOUND_TEXT, name: '', kind: CHAT_KIND.universe }]);
    expect(ROUND_PLAYER_NOT_FOUND_TEXT).toBe('PLAYER NAME DOES NOT EXIST. CHECK ENTERED NAME AND TRY AGAIN.');
    chat.mediusChat('yo', 'kilo');
    await flush(); await flush();
    expect(sent).toEqual([{ messageType: 1, targetId: 42, message: 'yo' }]);
    expect(taken.at(-1)).toEqual({ text: 'yo', name: 'socomc', kind: CHAT_KIND.whisper, own: true });
    expect(uiVars.find(GAME_LOBBY_CHAT_VAR)).toBeUndefined();
    running = false;
    chat.mediusChat('hi', 'nobody');
    await flush(); await flush();
    expect(events).toEqual([DIALOG_EVENTS['MP_PLAYER_NOT_FOUND']]);
  });

  it('the game lobby line\'s two forms: "(All)" for scope 0, "(Team)" in its own colour for a team scope', () => {
    expect(gameLobbyChatLine('host', 'gg')).toBe('#C\x80\x80\x80host (All): gg\n');
    expect(gameLobbyChatLine('host', 'on it', true)).toBe('#C@\x80@host (Team): on it\n');
    expect(gameLobbyChatLine(null, 'x', true)).toBe('#C@\x80@Unknown (Team): x\n');
  });
});
