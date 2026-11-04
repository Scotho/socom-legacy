import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { BriefingRoomChat, CHAT_KIND, type LobbyChatService } from '../../src/screens/briefingRoomChat';
import { COPY_UI_VAR_DIALOGS } from '../../src/screens/optionsCommands';
import { USAGE_POLICY_ENTRY_COMMANDS } from '../../src/screens/usagePolicyCommands';
import { PARKED_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import {
  LadderLobbyCommands, PLAYER_INFO_ORIGIN, PLAYER_INFO_VAR1, type LadderOnlineState, type LadderService,
} from '../../src/screens/ladderLobbyCommands';
import {
  FRIEND_ANSWER, FRIEND_CONFIRMATION_LIST_VAR, FRIEND_EVENTS_POLL_MS_ADAPTATION, FRIEND_INFO_VARS, FRIEND_INVITED_LINE, FRIEND_LIST, FRIEND_LIST_COMMAND_ROWS,
  FRIEND_LIST_VAR, FRIEND_MAIN_MENU, FRIEND_REQUEST_EVENT_READING, FriendListCommands, PLAYER_FRIEND_NAME_VAR, friendConfirmationRows, friendInvitedText, friendListRows,
  type FriendEvent, type FriendListEntry, type FriendListService,
} from '../../src/screens/friendListCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-24 (web research 269 §3): FRIENDS (`dlgFriendList.rdr`) and the friends' eight rows -- `GetFriendsList`
 * (`FUN_0027a2e0` -> `FUN_00301750` D:L202617-202629, its reply `FUN_003017a0` D:L202632-202651, the insert
 * `FUN_003020a0`, the draw `FUN_00301a70` D:L202724-202778), `GetFriendInfo` (`FUN_00279ab0` -> `FUN_00301140`
 * D:L202393-202432), `AddFriend` (`FUN_0027a050` -> `FUN_003013c0` D:L202483-202544, `FUN_003015d0` D:L202547-202580),
 * `ConfirmFriend` / `RejectFriend` (`FUN_00300a70`, `FUN_00300af0`), `AddFriendDirectly` (`FUN_00300b70`, its reply
 * `FUN_00300c10`), `RemoveFriend` (`FUN_003016a0`, `FUN_00301710`), `GetFriendInvitations` (`FUN_003012f0`,
 * `FUN_00301350`) -- and the two pushes (the forward `FUN_003009c0`, the request's reply `FUN_00300be0`).
 * - The rows off the machine, over the service's fake (SVC-16's answers, research 268 §2.4).
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): reached by SOCOM II
 *   ONLINE's FRIENDS row (`Goto_Friends`, unparked), the list drawn from a seeded list, ADD by name through the keyboard
 *   with the original's three popups, CONFIRM with the add back (YES, NO), REJECT, REMOVE, VIEW INFO's PLAYER INFO
 *   (the FRIEND origin), MESSAGE's whisper, the empty lists' lines, and the way back.
 * Synthetic lists; nothing measured on the original running (ONL-32's two-persona transcripts are the proven level).
 */

const SETTLED = 60;
const ME = 'socomc';
const cmd = (fn: string, arg = 'NA', anim = 'OnFriendListStart'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x20) });
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const OFF: LadderOnlineState = { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' };
const IN_ROOM: LadderOnlineState = { connectStatus: 2, lobbyWorldId: 7, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' };
const IN_GAME: LadderOnlineState = { connectStatus: 3, lobbyWorldId: 7, gameWorldId: 12, lobbyName: 'Alpha', gameName: 'Night Raid' };
const ON_MENUS: LadderOnlineState = { connectStatus: 1, lobbyWorldId: 1, gameWorldId: -1, lobbyName: 'Medius Lobby', gameName: '' };
/** Horizon's answer for an empty list (desktop@be557831 `MLS.cs:672-679`; SVC-16's `list`): one NoResult row ending it. */
const NO_FRIENDS: FriendListEntry = { status: 1, accountId: 0, accountName: '', onlineState: OFF, endOfList: true };
const friendRow = (id: number, name: string, glyph: string, lobby: string, game: string): UiVarValue => ({ type: 'array', value: [str(String(id)), str(name), str(glyph), str(lobby), str(game)] });
const askRow = (id: number, name: string): UiVarValue => ({ type: 'array', value: [str(String(id)), str(name)] });

interface Seed { id: number; name: string; state?: LadderOnlineState }

/** A server's friends over the service's seven calls (SVC-16's answers): the list, the requests to me, the request's status, the pushes. */
function server(o: { friends?: Seed[]; invitations?: Seed[]; requestStatus?: number; addStatus?: number; removeStatus?: number; events?: FriendEvent[][] } = {}) {
  let friends = [...(o.friends ?? [])];
  const invitations = [...(o.invitations ?? [])];
  const events = [...(o.events ?? [])];
  const requests: { op: string; body: unknown }[] = [];
  const service: FriendListService = {
    list: () => {
      requests.push({ op: 'friend-list', body: {} });
      const rows = friends.map((f, i): FriendListEntry => ({ status: 0, accountId: f.id, accountName: f.name, onlineState: { ...(f.state ?? OFF) }, endOfList: i === friends.length - 1 }));
      return Promise.resolve(rows.length ? rows : [NO_FRIENDS]);
    },
    request: (q) => { requests.push({ op: 'friend-request', body: q }); return Promise.resolve({ status: o.requestStatus ?? 0 }); },
    answer: (q) => { requests.push({ op: 'friend-answer', body: q }); return Promise.resolve(); },
    invitations: () => {
      requests.push({ op: 'friend-invitations', body: {} });
      const rows = invitations.map((f, i) => ({ status: 0, accountId: f.id, accountName: f.name, addType: 0, endOfList: i === invitations.length - 1 }));
      return Promise.resolve(rows.length ? rows : [{ status: 1, accountId: 0, accountName: '', addType: 0, endOfList: true }]);
    },
    add: (q) => {
      requests.push({ op: 'friend-add', body: q });
      const status = o.addStatus ?? 0;
      const who = invitations.find((f) => f.id === q.accountId);
      if (status === 0 && who && !friends.some((f) => f.id === q.accountId)) friends.push(who);
      return Promise.resolve({ status });
    },
    remove: (q) => {
      requests.push({ op: 'friend-remove', body: q });
      const status = o.removeStatus ?? 0;
      if (status === 0) friends = friends.filter((f) => f.id !== q.accountId);
      return Promise.resolve({ status });
    },
    events: () => { requests.push({ op: 'friend-events', body: {} }); return Promise.resolve(events.shift() ?? []); },
  };
  return { service, requests, ops: () => requests.map((q) => q.op) };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { ticket?: () => string | null; input?: string | null; up?: boolean; state?: number; me?: string } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const events: number[] = [];
  const lines: { text: string; name: string | null; flag: number; kind: number }[] = [];
  const c = new FriendListCommands({
    uiVars, service: s.service, event: (kind) => { events.push(kind); }, inputString: () => extra.input ?? null, ticket: extra.ticket,
    lobbyUp: () => extra.up ?? true, lobbyState: () => extra.state ?? 11, accountName: () => extra.me ?? ME,
    line: (text, name, flag, kind) => { lines.push({ text, name, flag, kind }); },
  });
  const value = (name: string): UiVarValue | undefined => uiVars.find(name)?.value;
  const typed = (name: string): void => { uiVars.set(uiVars.add(PLAYER_FRIEND_NAME_VAR, null, 1), str(name)); };
  const run = (name: keyof ReturnType<FriendListCommands['entries']>, arg = 'NA'): boolean => c.entries()[name](cmd(name, arg), {} as never, undefined) as boolean;
  return { ...s, uiVars, events, lines, c, value, typed, run };
}

describe('the rows (PLAT-08\'s table: 157, 158, 163, 164, 168, 169, 170, 206, ONL-24\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each answers 1', () => {
    expect(FRIEND_LIST_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '157 GetFriendsList 27a2e0 ONL-24', '158 RemoveFriend 279980 ONL-24', '163 AddFriend 27a050 ONL-24', '164 GetFriendInfo 279ab0 ONL-24',
      '168 ConfirmFriend 279eb0 ONL-24', '169 RejectFriend 279e10 ONL-24', '170 AddFriendDirectly 279fb0 ONL-24', '206 GetFriendInvitations 27a2b0 ONL-24',
    ]);
    for (const r of FRIEND_LIST_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, t.answer], r.name).toEqual([r.id, r.fn, r.task, true]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of FRIEND_LIST_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('the names the bodies use are the ELF\'s (S:0x3f6160, S:0x3f6120, S:0x3eee20, S:0x3f6058-0x3f6080, S:0x3f6090-0x3f60a8, S:0x3f5f20); the answers 2 and -985', () => {
    expect([FRIEND_LIST, FRIEND_LIST_VAR, FRIEND_CONFIRMATION_LIST_VAR, PLAYER_FRIEND_NAME_VAR]).toEqual(['dlgFriendList.rdr', 'FriendListVar', 'FriendConfirmationListVar', 'PLAYER_FRIEND_NAME']);
    expect(FRIEND_INFO_VARS).toEqual({ name: 'FriendInfoName', game: 'FriendInfoGame', lobby: 'FriendInfoLobby' });
    expect(FRIEND_MAIN_MENU).toEqual({ prefix: 'Medius', lobby: 'MAIN MENU', game: ' ' });
    expect(friendInvitedText('bob')).toBe('bob has invited you to join their friends list.');
    expect(FRIEND_ANSWER).toEqual({ confirm: 2, reject: 0xfffffc27 | 0 });
    expect(FRIEND_INVITED_LINE).toEqual({ name: '', flag: 1, kind: CHAT_KIND.universe });
    expect(FRIEND_REQUEST_EVENT_READING).toBe('-998 MP_PLAYER_NOT_FOUND; any other MP_FRIEND_CONFIRMATION_REQUESTED');
  });
});

describe('GetFriendsList (FUN_00301750, its reply FUN_003017a0, the draw FUN_00301a70)', () => {
  it('none: the list emptied and asked, nothing drawn before the reply; Horizon\'s NoResult row draws it empty, TEMPORARY', async () => {
    const r = rows();
    expect(r.run('GetFriendsList')).toBe(true);
    expect(r.requests).toEqual([{ op: 'friend-list', body: {} }]);
    expect(r.value(FRIEND_LIST_VAR)).toBeUndefined();
    await flush();
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [] });
    expect(r.uiVars.find(FRIEND_LIST_VAR)!.longevity).toBe(1);                         // FUN_003857c0(.., 0, 1)
  });

  it('one, then several with their online states: ["%d", name, glyph, lobby, game]; off line two empty cells; a "Medius..." lobby MAIN MENU and " "', async () => {
    const one = rows({ friends: [{ id: 42, name: 'bob', state: IN_ROOM }] });
    one.run('GetFriendsList');
    await flush();
    expect(one.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(42, 'bob', '\xa7', 'Alpha', '')] });
    const many = rows({ friends: [{ id: 42, name: 'bob', state: OFF }, { id: 43, name: 'Carol', state: IN_GAME }, { id: 44, name: 'dave', state: ON_MENUS }] });
    many.run('GetFriendsList');
    await flush();
    expect(many.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [
      friendRow(42, 'bob', '\xaa', '', ''), friendRow(43, 'Carol', '\xa7', 'Alpha', 'Night Raid'), friendRow(44, 'dave', '\xa7', 'MAIN MENU', ' '),
    ] });
    expect(many.c.records().map((x) => x.accountId)).toEqual([42, 43, 44]);
  });

  it('one row per account (FUN_003020a0 D:L202972); a non-Success row draws what is held; the rows as friendListRows builds them', () => {
    const r = rows();
    r.c.listReply([{ status: 0, accountId: 42, accountName: 'bob', onlineState: OFF, endOfList: false }, { status: 0, accountId: 42, accountName: 'bob2', onlineState: IN_ROOM, endOfList: false }, { ...NO_FRIENDS, endOfList: false }]);
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(42, 'bob', '\xaa', '', '')] });
    expect(friendListRows([{ status: 0, accountId: 7, accountName: 'x', onlineState: { ...IN_ROOM, lobbyName: 'Mediu' }, endOfList: true }])).toEqual([friendRow(7, 'x', '\xa7', 'Mediu', '')]);
    expect(friendConfirmationRows([{ accountId: 9, accountName: 'y', addType: 0 }])).toEqual([askRow(9, 'y')]);
  });

  it('FRIEND_LIST_LATEST_REPLY_ADAPTATION: a reply under a ticket no longer held is dropped', async () => {
    let ticket: string | null = 'T1';
    const r = rows({ friends: [{ id: 42, name: 'bob' }] }, { ticket: () => ticket });
    r.run('GetFriendsList');
    ticket = 'T2';
    await flush();
    expect(r.value(FRIEND_LIST_VAR)).toBeUndefined();
    r.run('GetFriendsList');
    await flush();
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(42, 'bob', '\xaa', '', '')] });
  });
});

describe('GetFriendInfo (FUN_00301140): local, from the list', () => {
  it('the name, the game and the lobby of the row\'s account; MAIN MENU and " " for a lobby named "Medius..."; an account not listed empties all three; nothing sent', async () => {
    const r = rows({ friends: [{ id: 42, name: 'bob', state: IN_GAME }, { id: 44, name: 'dave', state: ON_MENUS }, { id: 45, name: 'eve', state: OFF }] }, { input: '42' });
    r.run('GetFriendsList');
    await flush();
    r.requests.length = 0;
    const info = (): (UiVarValue | undefined)[] => [r.value(FRIEND_INFO_VARS.name), r.value(FRIEND_INFO_VARS.game), r.value(FRIEND_INFO_VARS.lobby)];
    expect(r.run('GetFriendInfo', 'INPUT_STRING')).toBe(true);
    expect(info()).toEqual([str('bob'), str('Night Raid'), str('Alpha')]);
    r.run('GetFriendInfo', '44');
    expect(info()).toEqual([str('dave'), str('MAIN MENU'), str(' ')]);
    r.run('GetFriendInfo', '45');                                                       // no status tested: the off-line row's empty names
    expect(info()).toEqual([str('eve'), str(''), str('')]);
    r.run('GetFriendInfo', '99');
    expect(info()).toEqual([str(''), str(''), str('')]);
    expect(r.uiVars.find(FRIEND_INFO_VARS.name)!.longevity).toBe(1);
    expect(r.requests).toEqual([]);
  });
});

describe('AddFriend (FUN_0027a050 -> FUN_003013c0, FUN_003015d0)', () => {
  it('sent by the typed name; Success: MP_FRIEND_CONFIRMATION_REQUESTED; the variable added TEMPORARY', async () => {
    const r = rows();
    r.typed('bob');
    expect(r.run('AddFriend')).toBe(true);
    await flush();
    expect([r.requests, r.events]).toEqual([[{ op: 'friend-request', body: { name: 'bob' } }], [DIALOG_EVENTS.MP_FRIEND_CONFIRMATION_REQUESTED]]);
    expect(r.uiVars.find(PLAYER_FRIEND_NAME_VAR)!.longevity).toBe(1);
  });

  it('one\'s own name (case-blind), a friend already, one who asked me: MP_PLAYER_IS_FRIEND, nothing sent; no name: MP_PLAYER_IS_FRIEND (D:L202541)', async () => {
    const r = rows({ friends: [{ id: 42, name: 'bob' }], invitations: [{ id: 43, name: 'Carol' }] });
    r.run('GetFriendsList');
    r.run('GetFriendInvitations');
    await flush();
    r.requests.length = 0;
    for (const name of ['SOCOMC', 'Bob', 'carol']) { r.typed(name); r.run('AddFriend'); }
    r.uiVars.set(PLAYER_FRIEND_NAME_VAR, { type: 'int', value: 3 });
    r.run('AddFriend');
    await flush();
    expect(r.requests).toEqual([]);
    expect(r.events).toEqual(new Array(4).fill(DIALOG_EVENTS.MP_PLAYER_IS_FRIEND));
  });

  it('FRIEND_REQUEST_EVENT_READING: -998 MP_PLAYER_NOT_FOUND; any other -- the server\'s -958, the caps\' and the rate\'s -956, a DBError -- MP_FRIEND_CONFIRMATION_REQUESTED, the request\'s status unread (D:L202569-202576)', async () => {
    const at = async (status: number): Promise<number[]> => { const r = rows({ requestStatus: status }); r.typed('dave'); r.run('AddFriend'); await flush(); return r.events; };
    expect(await at(-998)).toEqual([DIALOG_EVENTS.MP_PLAYER_NOT_FOUND]);
    expect(await at(-958)).toEqual([DIALOG_EVENTS.MP_FRIEND_CONFIRMATION_REQUESTED]);
    expect(await at(-956)).toEqual([DIALOG_EVENTS.MP_FRIEND_CONFIRMATION_REQUESTED]);
    expect(await at(-988)).toEqual([DIALOG_EVENTS.MP_FRIEND_CONFIRMATION_REQUESTED]);
  });

  it('FRIEND_TICKET_ADAPTATION: an answer after the ticket changed raises nothing', async () => {
    let ticket: string | null = 'T1';
    const r = rows({}, { ticket: () => ticket });
    r.typed('dave');
    r.run('AddFriend');
    ticket = 'T2';
    await flush();
    expect([r.ops(), r.events]).toEqual([['friend-request'], []]);
  });
});

describe('the requests to me: GetFriendInvitations (FUN_003012f0, FUN_00301350), the forward (FUN_003009c0), CONFIRM and REJECT', () => {
  it('asked only while the lobby is up in state 11; each named row kept once, drawn ["%d", name] at longevity 2; the NoResult row (no name) skipped and nothing drawn', async () => {
    const off = rows({ invitations: [{ id: 43, name: 'Carol' }] }, { state: 2 });
    off.run('GetFriendInvitations');
    const down = rows({ invitations: [{ id: 43, name: 'Carol' }] }, { up: false });
    down.run('GetFriendInvitations');
    expect([off.requests, down.requests]).toEqual([[], []]);
    const none = rows();
    none.run('GetFriendInvitations');
    await flush();
    expect([none.ops(), none.value(FRIEND_CONFIRMATION_LIST_VAR)]).toEqual([['friend-invitations'], undefined]);
    const r = rows({ invitations: [{ id: 43, name: 'Carol' }, { id: 44, name: 'dave' }] });
    r.run('GetFriendInvitations');
    r.run('GetFriendInvitations');
    await flush();
    expect(r.value(FRIEND_CONFIRMATION_LIST_VAR)).toEqual({ type: 'array', value: [askRow(43, 'Carol'), askRow(44, 'dave')] });
    expect(r.uiVars.find(FRIEND_CONFIRMATION_LIST_VAR)!.longevity).toBe(2);
  });

  it('the forward: kept on the list and drawn; its line "%s has invited you to join their friends list." -- no name, flag 1, kind 1', () => {
    const r = rows();
    r.c.pushed({ kind: 'forward', accountId: 43, accountName: 'Carol', addType: 0 });
    r.c.pushed({ kind: 'forward', accountId: 43, accountName: 'Carol', addType: 0 });
    expect(r.value(FRIEND_CONFIRMATION_LIST_VAR)).toEqual({ type: 'array', value: [askRow(43, 'Carol')] });
    expect(r.lines).toEqual(new Array(2).fill({ text: 'Carol has invited you to join their friends list.', name: '', flag: 1, kind: 1 }));
  });

  it('CONFIRM: the answer 2 for the row\'s account, its request dropped and the list drawn; AddFriendDirectly: the add back, then the list asked again', async () => {
    const r = rows({ invitations: [{ id: 43, name: 'Carol' }, { id: 44, name: 'dave' }] }, { input: '43' });
    r.run('GetFriendInvitations');
    await flush();
    r.requests.length = 0;
    expect(r.run('ConfirmFriend', 'INPUT_STRING')).toBe(true);
    expect(r.requests).toEqual([{ op: 'friend-answer', body: { accountId: 43, status: 2 } }]);
    expect(r.value(FRIEND_CONFIRMATION_LIST_VAR)).toEqual({ type: 'array', value: [askRow(44, 'dave')] });
    expect(r.run('AddFriendDirectly', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests.slice(1)).toEqual([{ op: 'friend-add', body: { accountId: 43 } }, { op: 'friend-list', body: {} }]);
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(43, 'Carol', '\xaa', '', '')] });
  });

  it('a refused add back says nothing and asks no list; REJECT: -985, the request dropped, nothing else', async () => {
    const refused = rows({ invitations: [{ id: 43, name: 'Carol' }], addStatus: -985 });
    refused.run('AddFriendDirectly', '43');
    await flush();
    expect([refused.ops(), refused.events]).toEqual([['friend-add'], []]);
    const r = rows({ invitations: [{ id: 43, name: 'Carol' }] }, { input: '43' });
    r.run('GetFriendInvitations');
    await flush();
    r.requests.length = 0;
    r.run('RejectFriend', 'INPUT_STRING');
    await flush();
    expect(r.requests).toEqual([{ op: 'friend-answer', body: { accountId: 43, status: -985 } }]);
    expect(r.value(FRIEND_CONFIRMATION_LIST_VAR)).toEqual({ type: 'array', value: [] });
  });
});

describe('the requester\'s side: the answer pushed (FUN_00300be0), and the poll (FRIEND_EVENTS_POLL_MS_ADAPTATION)', () => {
  it('the answer 2 asks the list again; -985 or any other status nothing', async () => {
    const r = rows({ friends: [{ id: 42, name: 'bob', state: IN_ROOM }] });
    r.c.pushed({ kind: 'answer', accountId: 42, accountName: 'bob', status: -985 });
    r.c.pushed({ kind: 'answer', accountId: 42, accountName: 'bob', status: -956 });
    expect(r.requests).toEqual([]);
    r.c.pushed({ kind: 'answer', accountId: 42, accountName: 'bob', status: 2 });
    await flush();
    expect(r.ops()).toEqual(['friend-list']);
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(42, 'bob', '\xa7', 'Alpha', '')] });
  });

  it('frame: /lobby/friend-events once a period while the lobby is up with a ticket, one at a time, a reply taken only under its ticket', async () => {
    let ticket: string | null = null;
    const r = rows({ friends: [{ id: 42, name: 'bob' }], events: [[{ kind: 'forward', accountId: 43, accountName: 'Carol', addType: 0 }], [{ kind: 'answer', accountId: 42, accountName: 'bob', status: 2 }]] }, { ticket: () => ticket });
    r.c.frame(0);
    expect(r.requests).toEqual([]);                                                     // no ticket, no poll
    ticket = 'T1';
    r.c.frame(0);
    r.c.frame(1);                                                                       // one at a time
    await flush();
    expect(r.ops()).toEqual(['friend-events']);
    expect(r.value(FRIEND_CONFIRMATION_LIST_VAR)).toEqual({ type: 'array', value: [askRow(43, 'Carol')] });
    r.c.frame(FRIEND_EVENTS_POLL_MS_ADAPTATION - 1);
    expect(r.ops()).toEqual(['friend-events']);
    r.c.frame(FRIEND_EVENTS_POLL_MS_ADAPTATION);
    ticket = 'T2';                                                                      // the answer lands under another ticket: dropped
    await flush();
    expect(r.ops()).toEqual(['friend-events', 'friend-events']);
    const down = rows({}, { ticket: () => 'T1', up: false });
    down.c.frame(0);
    expect(down.requests).toEqual([]);
  });
});

describe('RemoveFriend (FUN_003016a0, FUN_00301710)', () => {
  it('the row\'s account removed, then the list asked again; a refused remove says nothing and asks nothing', async () => {
    const r = rows({ friends: [{ id: 42, name: 'bob' }, { id: 43, name: 'Carol' }] }, { input: '43' });
    r.run('GetFriendsList');
    await flush();
    r.requests.length = 0;
    expect(r.run('RemoveFriend', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'friend-remove', body: { accountId: 43 } }, { op: 'friend-list', body: {} }]);
    expect(r.value(FRIEND_LIST_VAR)).toEqual({ type: 'array', value: [friendRow(42, 'bob', '\xaa', '', '')] });
    const refused = rows({ removeStatus: -988 }, { input: '43' });
    refused.run('RemoveFriend', 'INPUT_STRING');
    await flush();
    expect([refused.ops(), refused.events]).toEqual([['friend-remove'], []]);
  });
});

describe('PLAYER INFO from the FRIEND origin (ONL-30a\'s GetPlayerInfo, D:L191859-191890)', () => {
  it('asked by the account id; the friends list\'s record of the reply\'s name (case-blind, FUN_00301c40) gives its online state, the position the record\'s own', async () => {
    const f = rows({ friends: [{ id: 42, name: 'bob', state: IN_GAME }] });
    f.run('GetFriendsList');
    await flush();
    expect(f.c.onlineStateByName('BOB')).toEqual(IN_GAME);
    expect(f.c.onlineStateByName('nobody')).toBeNull();
    const asked: unknown[] = [];
    const ladder: LadderService = {
      position: () => new Promise(() => {}), list: () => new Promise(() => {}),
      playerInfo: (q) => { asked.push(q); return Promise.resolve({ status: 0, accountName: 'bob', playerStatus: 3, stats: '' }); },
    };
    const uiVars = new UiVarManager();
    const l = new LadderLobbyCommands({ uiVars, service: ladder, inputString: () => '42', friendState: (n) => f.c.onlineStateByName(n) });
    const c = cmd('GetPlayerInfo', 'INPUT_STRING', 'playerinfo_activate');
    c.bytes[0x10] = PLAYER_INFO_ORIGIN.friend;                                         // dlgFriendList's word at +0x10: 2
    l.GetPlayerInfo(c, {} as never, undefined);
    await flush();
    expect(asked).toEqual([{ accountId: 42 }]);
    const list1 = uiVars.find(PLAYER_INFO_VAR1)!.value as { value: readonly UiVarValue[] };
    const cells = list1.value.map((row) => ((row as { value: readonly UiVarValue[] }).value[0] as { value: string }).value);
    expect(cells.slice(13)).toEqual(['ONLINE:', 'BRIEFING ROOM:', 'GAME:']);           // state 3: the presence lines, not NOT CURRENTLY LOGGED IN
  });
});

describe('the unparked rows', () => {
  it('SOCOM II ONLINE: GetFriendsList is ONL-24\'s body (existing), the FRIENDS row no longer parked; CopyUIVar answers on FRIENDS (on_skb_apply_2); the usage agreement names the body', () => {
    expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === 'GetFriendsList')).toMatchObject({ state: 'existing', task: 'ONL-24' });
    expect(PARKED_ROWS.map((p) => p.control)).not.toContain('friends');
    expect(parkedRowGate({ dialog: WORLD, animation: 'Goto_Friends', argument: null })).toBe(false);
    expect(COPY_UI_VAR_DIALOGS).toContain(FRIEND_LIST);
    expect(USAGE_POLICY_ENTRY_COMMANDS.find((e) => e.name === 'GetFriendInvitations')!.why).toMatch(/FriendListCommands/);
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder('latin1').decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const items = (r: Rig, name: string): string[][] => listbox(r, name).items.map((i) => i.captions);
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));
const PLAYER_NOT_FOUND_TEXT = 'The message cannot be sent because that player is not currently logged in.';

/** A whisper's FindPlayer (ONL-23's `SendMediusChat`) that finds the names given. */
function chat(found: Record<string, number>, sent: unknown[]): LobbyChatService {
  return {
    findPlayer: (q) => { sent.push({ find: q.name }); const id = found[q.name]; return Promise.resolve(id === undefined ? { status: -998, accountId: 0, accountName: q.name } : { status: 0, accountId: id, accountName: q.name }); },
    chat: (q) => { sent.push(q); return Promise.resolve(); }, chatLines: () => Promise.resolve([]),
  };
}

/** SOCOM II ONLINE past SERVER NEWS, the FRIENDS row's CROSS, run to FRIENDS' build. */
async function friendsPage(o: Parameters<typeof server>[0] = {}, extra: { keyboard?: boolean; ladder?: LadderService; whispers?: { found: Record<string, number>; sent: unknown[] }; invitations?: boolean } = {}) {
  const s = server(o);
  const r = worldRig({
    name: ME, announcement: '', friends: s.service, keyboard: extra.keyboard, ladder: extra.ladder,
    register: (host, ctx) => {
      if (extra.whispers) new BriefingRoomChat({ uiVars: ctx.uiVars, lobby: { up: true, state: () => 11, account: () => ME }, service: chat(extra.whispers.found, extra.whispers.sent), rooms: () => [], event: (k) => { ctx.event(k); } }).register(host);
    },
  });
  if (extra.invitations) { r.friends()!.GetFriendInvitations(cmd('GetFriendInvitations', 'NA', 'retrieve_usage'), {} as never, undefined); }
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'friends');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== FRIEND_LIST; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s };
}

describe.skipIf(!HAVE)(`FRIENDS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('SOCOM II ONLINE\'s ONSTART asks the list (get_friend_list) and the FRIENDS row\'s pane draws it (800 / 85 / 15); its CROSS (Goto_Friends) switches to dlgFriendList.rdr', async () => {
    const s = server({ friends: [{ id: 42, name: 'bob', state: IN_ROOM }] });
    const r = worldRig({ name: ME, announcement: '', friends: s.service });
    await r.settle(SETTLED);
    expect(r.calls(WORLD)).toContain('GetFriendsList(NA) table');
    expect(s.ops()).toEqual(['friend-list']);
    r.press('CROSS', 10);
    go(r, 'friends');
    expect([r.node('FriendList')!.visible, items(r, 'FriendList')]).toEqual([true, [['42', 'bob', '\xa7']]]);
    expect(listbox(r, 'FriendList').spec.columns.map((c) => c.position)).toEqual([800, 85, 15]);
    const from = r.outcomes.length;
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== FRIEND_LIST; i++) await r.settle(1);
    expect(quiet(r.calls(WORLD, from))).toEqual(['SwitchMenu(dlgFriendList.rdr) table']);
    expect([r.builds, r.valve('StartMusic')]).toEqual([[WORLD, FRIEND_LIST], 1]);
  });

  it('ONSTART: GetFriendsList, ADD NEW FRIEND activated, both lists disabled; the seeded list drawn by the record\'s five columns; the captions #315, #308-#314, #316-#318', async () => {
    const { r, ops } = await friendsPage({ friends: [{ id: 42, name: 'bob', state: OFF }, { id: 43, name: 'Carol', state: IN_GAME }, { id: 44, name: 'dave', state: ON_MENUS }] });
    expect(quiet(r.calls(FRIEND_LIST)).filter((c) => /Friend|Button/.test(c)).slice(0, 4)).toEqual([
      'GetFriendsList(NA) table', 'ActivateButton(AddNewFriend) table', 'DisableButton(FriendList) table', 'DisableButton(ConfirmationList) table',
    ]);
    expect(ops()).toEqual(['friend-list', 'friend-list']);                                 // the menu's ONSTART, then the page's
    expect(items(r, 'FriendList')).toEqual([['42', 'bob', '\xaa', '', ''], ['43', 'Carol', '\xa7', 'Alpha', 'Night Raid'], ['44', 'dave', '\xa7', 'MAIN MENU', ' ']]);
    expect(listbox(r, 'FriendList').spec.columns.map((c) => c.position)).toEqual([-300, 72, 8, 273, 273]);
    expect(listbox(r, 'ConfirmationList').spec.columns.map((c) => c.position)).toEqual([-500, 100]);
    expect([listbox(r, 'FriendList').enabled, listbox(r, 'ConfirmationList').enabled]).toEqual([false, false]);
    expect(r.text('bar_title')).toEqual([loc(r, 315)]);
    expect([308, 309, 310, 311, 312, 313, 314, 316, 317, 318].map((id) => loc(r, id))).toEqual([
      'ADD NEW FRIEND', 'MESSAGE', 'VIEW INFO', 'REMOVE FRIEND', 'CONFIRM FRIEND', 'REJECT FRIEND', 'RETURN', 'ONLINE', 'PLAYER NAME', 'ROOM NAME/GAME',
    ]);
    expect(r.focused()).toBe('AddNewFriend');
    expect(r.text('DescriptionText')).toEqual([loc(r, 323)]);
  });

  it('ADD NEW FRIEND: the keyboard on PLAYER_FRIEND_NAME; the name typed: the request and OnFriendListConfirmationSent -- #337 with #226', async () => {
    const { r, requests } = await friendsPage({}, { keyboard: true });
    requests.length = 0;
    const from = r.outcomes.length;
    r.press('CROSS', 6);
    expect(quiet(r.calls(FRIEND_LIST, from))).toEqual(['ClearUIVar(PLAYER_FRIEND_NAME) table', 'GetTextInput(PLAYER_FRIEND_NAME) table']);
    expect([r.skb!.keyboard.isOpen, r.skb!.keyboard.request?.uiVar]).toEqual([true, PLAYER_FRIEND_NAME_VAR]);
    r.type('bob');
    await r.settle(10);
    expect(quiet(r.calls(FRIEND_LIST, from))).toContain('AddFriend(NA) table');
    expect(requests).toEqual([{ op: 'friend-request', body: { name: 'bob' } }]);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 337)]);
    r.press('CROSS', 10);
    expect([r.shown(), r.valve('SitAndSpin')]).toEqual([false, 1]);
  });

  it('ADD of one\'s own name: PlayerAlreadyFriend -- #335; nothing sent. ADD of a name not found: PlayerNotFound -- its literal text (74 bytes, the whisper\'s)', async () => {
    const own = await friendsPage({}, { keyboard: true });
    own.requests.length = 0;
    own.r.press('CROSS', 6);
    own.r.type(ME.toUpperCase());
    await own.r.settle(10);
    expect([own.requests, own.r.shown(), popupText(own.r)]).toEqual([[], true, loc(own.r, 335)]);
    const lost = await friendsPage({ requestStatus: -998 }, { keyboard: true });
    lost.r.press('CROSS', 6);
    lost.r.type('nobody');
    await lost.r.settle(10);
    expect([lost.r.shown(), popupText(lost.r)]).toEqual([true, PLAYER_NOT_FOUND_TEXT]);
    expect(PLAYER_NOT_FOUND_TEXT).toHaveLength(74);
  });

  it('CONFIRM FRIEND with no request waiting: its literal line; with one: the list taken, CROSS confirms and asks #336; YES sends the add back and the list is asked again', async () => {
    const empty = await friendsPage();
    go(empty.r, 'ConfirmFriend');
    expect(empty.r.text('DescriptionText')).toEqual([loc(empty.r, 327)]);
    empty.r.press('CROSS', 6);
    expect([empty.r.focused(), empty.r.text('DescriptionText')]).toEqual(['ConfirmFriend', ['No requests awaiting confirmation.']]);
    const { r, requests } = await friendsPage({ invitations: [{ id: 43, name: 'Carol' }] }, { invitations: true });
    go(r, 'ConfirmFriend');
    expect([r.node('ConfirmationList')!.visible, r.node('FriendList')!.visible, items(r, 'ConfirmationList')]).toEqual([true, false, [['43', 'Carol']]]);
    r.press('CROSS', 6);
    expect([r.focused(), r.valve('ConfirmListPurpose')]).toEqual(['ConfirmationList', 1]);
    requests.length = 0;
    r.press('CROSS', 10);
    expect(requests).toEqual([{ op: 'friend-answer', body: { accountId: 43, status: 2 } }]);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 336)]);
    r.press('CROSS', 10);                                                               // YES, the first button
    await r.settle(10);
    expect(requests.slice(1)).toEqual([{ op: 'friend-add', body: { accountId: 43 } }, { op: 'friend-list', body: {} }]);
    expect(items(r, 'FriendList')).toEqual([['43', 'Carol', '\xaa', '', '']]);
  });

  it('CONFIRM, then NO to #336: no add back', async () => {
    const { r, requests } = await friendsPage({ invitations: [{ id: 43, name: 'Carol' }] }, { invitations: true });
    go(r, 'ConfirmFriend');
    r.press('CROSS', 6);
    requests.length = 0;
    r.press('CROSS', 10);
    r.press('RIGHT', 3);
    r.press('CROSS', 10);                                                               // NO, the second
    await r.settle(10);
    expect(requests.map((q) => q.op)).toEqual(['friend-answer']);
    expect(r.shown()).toBe(false);
  });

  it('REJECT FRIEND: CROSS on the request asks the literal "reject?" with NO / YES; YES (the second) sends -985', async () => {
    const { r, requests } = await friendsPage({ invitations: [{ id: 43, name: 'Carol' }] }, { invitations: true });
    go(r, 'RejectFriend');
    expect(r.text('DescriptionText')).toEqual([loc(r, 328)]);
    r.press('CROSS', 6);
    expect([r.focused(), r.valve('ConfirmListPurpose')]).toEqual(['ConfirmationList', 2]);
    requests.length = 0;
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r)]).toEqual([true, 'Are you sure you wish to reject this friend invitation?']);
    r.press('RIGHT', 3);
    r.press('CROSS', 10);
    await r.settle(10);
    expect(requests).toEqual([{ op: 'friend-answer', body: { accountId: 43, status: FRIEND_ANSWER.reject } }]);
  });

  it('REMOVE FRIEND: the list taken (FriendListAction 0); CROSS on a row asks #329 (YES #253 / NO #246); YES removes that account and the list is asked again', async () => {
    const { r, requests } = await friendsPage({ friends: [{ id: 42, name: 'bob' }, { id: 43, name: 'Carol' }] });
    go(r, 'RemoveFriend');
    expect(r.text('DescriptionText')).toEqual([loc(r, 326)]);
    r.press('CROSS', 6);
    expect([r.focused(), listbox(r, 'FriendList').enabled, r.valve('FriendListAction'), r.valve('FriendListActive')]).toEqual(['FriendList', true, 0, 1]);
    r.press('DOWN', 6);
    requests.length = 0;
    r.press('CROSS', 10);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 329)]);
    r.press('CROSS', 10);
    await r.settle(10);
    expect(requests).toEqual([{ op: 'friend-remove', body: { accountId: 43 } }, { op: 'friend-list', body: {} }]);
    expect(items(r, 'FriendList')).toEqual([['42', 'bob', '\xaa', '', '']]);
  });

  it('VIEW INFO with an empty list: "No Friends in your list."; with friends: the focus runs GetFriendInfo; CROSS opens PLAYER INFO from the FRIEND origin, by the account id', async () => {
    const empty = await friendsPage();
    go(empty.r, 'ViewInfo');
    expect(empty.r.text('DescriptionText')).toEqual(["¦ View a Friend's info."]);
    empty.r.press('CROSS', 6);
    expect(empty.r.text('DescriptionText')).toEqual(['No Friends in your list.']);
    const asked: unknown[] = [];
    const ladder: LadderService = {
      position: () => Promise.resolve({ status: 1, ladderPosition: 0, totalRankings: 0 }),
      list: () => Promise.resolve([{ status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: OFF, endOfList: true }]),
      playerInfo: (q) => { asked.push(q); return Promise.resolve({ status: 0, accountName: 'Carol', playerStatus: 3, stats: '' }); },
    };
    const { r } = await friendsPage({ friends: [{ id: 42, name: 'bob' }, { id: 43, name: 'Carol', state: IN_GAME }] }, { ladder });
    go(r, 'ViewInfo');
    r.press('CROSS', 6);
    expect([r.focused(), r.valve('FriendListAction')]).toEqual(['FriendList', 2]);
    r.press('DOWN', 6);
    expect([r.uiVars.find(FRIEND_INFO_VARS.name)?.value, r.uiVars.find(FRIEND_INFO_VARS.game)?.value, r.uiVars.find(FRIEND_INFO_VARS.lobby)?.value]).toEqual([str('Carol'), str('Night Raid'), str('Alpha')]);
    r.press('CROSS', 4);
    await r.settle(20);
    expect(asked).toEqual([{ accountId: 43 }]);
    expect([r.node('pop_missionBack')!.visible, r.focused()]).toEqual([true, 'playerinfo_ctl_desc']);
    expect(items(r, 'playerinfo_list1').slice(13).map((c) => c[0])).toEqual(['ONLINE:', 'BRIEFING ROOM:', 'GAME:']);
    r.press('TRIANGLE', 6);
    expect([r.node('pop_missionBack')!.visible, r.focused()]).toEqual([false, 'FriendList']);
  });

  it('MESSAGE: the list taken (FriendListAction 1); CROSS on a row opens the keyboard on CHATTEXT; the text whispered to FriendInfoName (ONL-23\'s SendMediusChat)', async () => {
    const sent: unknown[] = [];
    const { r } = await friendsPage({ friends: [{ id: 42, name: 'bob', state: IN_ROOM }] }, { keyboard: true, whispers: { found: { bob: 42 }, sent } });
    go(r, 'MessageFriend');
    expect(r.text('DescriptionText')).toEqual([loc(r, 324)]);
    r.press('CROSS', 6);
    expect([r.focused(), r.valve('FriendListAction')]).toEqual(['FriendList', 1]);
    r.press('CROSS', 6);
    expect([r.skb!.keyboard.isOpen, r.skb!.keyboard.request?.uiVar]).toEqual([true, 'CHATTEXT']);
    r.type('hello');
    await r.settle(10);
    expect(sent).toEqual([{ find: 'bob' }, { messageType: 1, targetId: 42, message: 'hello' }]);
  });

  it('the way back: TRIANGLE runs goto_menu(PREVIOUS_SCREEN) with SND_DINK; RETURN\'s CROSS switches back with no sound of its own', async () => {
    const a = await friendsPage();
    const sound = a.r.sound.log.length;
    a.r.press('TRIANGLE', 6);
    for (let i = 0; i < 120 && a.r.current() !== WORLD; i++) await a.r.settle(1);
    expect([a.r.current(), sounds(a.r, sound)]).toEqual([WORLD, ['SND_DINK']]);
    const b = await friendsPage();
    go(b.r, 'return');
    expect(b.r.text('DescriptionText')).toEqual([loc(b.r, 322)]);
    const quietFrom = b.r.sound.log.length;
    b.r.press('CROSS', 6);
    for (let i = 0; i < 120 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect([b.r.current(), sounds(b.r, quietFrom)]).toEqual([WORLD, []]);
  });
});
