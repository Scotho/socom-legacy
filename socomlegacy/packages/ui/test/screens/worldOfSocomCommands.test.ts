import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, type DialogDesign } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  ACCOUNT_NAME_READING, ANNOUNCEMENT_QUERY, LOBBY_SESSION_VARS, MEDIUS_MOTD_BUDGET, MEDIUS_MOTD_VAR, MOTD_NO_MESSAGES,
  MOTD_RETRIEVING, MOTD_SEPARATOR, PARKED_ROWS, PARKED_ROW_GATE, PARKED_ROW_GATE_READING, PLAYER_NAME_AND_TAG_VAR, ROOM_LIST_QUERY, ROOM_LIST_VAR, ROOM_LIST_LATEST_REPLY_ADAPTATION, ELIGIBLE_RANKS, WORLD_LOBBY_STATE_READING,
  WORLD_OF_SOCOM, WORLD_OF_SOCOM_COMMAND_ROWS, WORLD_OF_SOCOM_GLOBAL_VALVES, WorldOfSocomCommands, lobbySessionStart, parkedRowGate,
  roomEligibleRanks, seedWorldOfSocomValves, type AnnouncementReply, type AnnouncementService, type ChannelListEntry, type RoomListService,
} from '../../src/screens/worldOfSocomCommands';

/**
 * ONL-09's rows (web research 158 §3): `GetMediusAnnouncements` (`FUN_0027d1f0` D:L125862-125869 -> `FUN_002f7710`
 * D:L196520-196540, the reply `FUN_002f77a0` D:L196542-196627) transcribed over a fake announcement service, and
 * `RefreshRoomList` (ONL-11). `GetClan`, `IsMemberOfClan` and `IsLeaderOfClan` are ONL-27's (`./manageRosterScreen.test.ts`).
 * Synthetic replies; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'init_screen'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const call = (c: ZAnimUiCommand) => [c, uiCommandRowByName(c.fn!)!, undefined] as const;
const str = (s: string): UiVarValue => ({ type: 'string', value: s });
const arr = (...s: string[]): UiVarValue => ({ type: 'array', value: s.map(str) });
const ok = (announcement: string, status = 0): AnnouncementReply => ({ status, announcementId: 1, announcement, endOfList: true });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function rig(o: { reply?: AnnouncementReply | null; lobbyUp?: boolean; lobbyState?: number; name?: string | null; accountName?: string } = {}) {
  const uiVars = new UiVarManager();
  if (o.name !== null) uiVars.add('PLAYERNAMEVAR', str(o.name ?? 'socomc'), 2);
  const queries: unknown[] = [];
  let answer!: (r: AnnouncementReply) => void;
  const service: AnnouncementService = {
    announcement: (q) => {
      queries.push(q);
      if (o.reply === null) return new Promise((r) => { answer = r; });
      return Promise.resolve(o.reply ?? ok('Welcome.'));
    },
  };
  const c = new WorldOfSocomCommands({
    uiVars, service,
    lobbyUp: o.lobbyUp === undefined ? undefined : () => o.lobbyUp!, lobbyState: o.lobbyState === undefined ? undefined : () => o.lobbyState!,
    accountName: o.accountName === undefined ? undefined : () => o.accountName!,
  });
  return { uiVars, c, queries, answer: (r: AnnouncementReply) => answer(r), value: (n: string) => uiVars.find(n)?.value };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('are the table\'s rows 51 GetMediusAnnouncements (ONL-09) and 41 RefreshRoomList (ONL-11); the clan rows ONL-27\'s since its GetMyClans', () => {
    expect(WORLD_OF_SOCOM_COMMAND_ROWS.map((r) => `${r.row} ${r.id} ${r.name} ${r.task} ${r.state}`)).toEqual([
      '51 49 GetMediusAnnouncements ONL-09 here', '41 42 RefreshRoomList ONL-11 here',
    ]);
    for (const r of WORLD_OF_SOCOM_COMMAND_ROWS) {
      const row = uiCommandRowByName(r.name)!;
      expect([row.index, row.id, row.fn, row.task], r.name).toEqual([r.row, r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('registers the five bodies in the host; a dispatch by name reaches them', () => {
    const r = rig();
    const host = new UiCommandHost();
    r.c.register(host);
    for (const n of WORLD_OF_SOCOM_COMMAND_ROWS.map((x) => x.name)) expect(host.dispatch(cmd(n)).kind, n).toBe('table');
    expect(r.queries).toHaveLength(1);
  });
});

describe('the lobby session\'s UI variables (FUN_002df6a0 D:L182187-182232)', () => {
  it('thirteen names added TEMPORARY in the body\'s order; MEDIUS_CHAT_RECV_VAR an empty array, MEDIUS_MOTD and MEDIUS_CLAN_MESSAGES the empty string, the rest no value', () => {
    expect(LOBBY_SESSION_VARS.map((v) => v.name)).toEqual([
      'GAMELISTVAR', 'ROOMLISTVAR', 'ROOMPLAYERLISTVAR', 'MEDIUS_CHAT_RECV_VAR', 'MEDIUS_MOTD', 'MEDIUS_CLAN_MESSAGES', 'INVITED_PLAYERS', 'CLAN_ROSTER',
      'MY_CLAN_INVITES', 'LADDER_LEADERS', 'LADDER_RANKING', 'CLAN_LADDER_LEADERS', 'CLAN_LADDER_RANKING',
    ]);
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    expect(uiVars.all().map((v) => `${v.name} ${v.longevity} ${v.value.type}`)).toEqual([
      'GAMELISTVAR 1 none', 'ROOMLISTVAR 1 none', 'ROOMPLAYERLISTVAR 1 none', 'MEDIUS_CHAT_RECV_VAR 1 array', 'MEDIUS_MOTD 1 string', 'MEDIUS_CLAN_MESSAGES 1 string',
      'INVITED_PLAYERS 1 none', 'CLAN_ROSTER 1 none', 'MY_CLAN_INVITES 1 none', 'LADDER_LEADERS 1 none', 'LADDER_RANKING 1 none', 'CLAN_LADDER_LEADERS 1 none',
      'CLAN_LADDER_RANKING 1 none',
    ]);
    expect([uiVars.find('MEDIUS_MOTD')!.value, uiVars.find('MEDIUS_CLAN_MESSAGES')!.value, uiVars.find('MEDIUS_CHAT_RECV_VAR')!.value]).toEqual([str(''), str(''), arr()]);
  });

  it('a held name keeps its value unless it is temporary (CUIVarManager_Add): a second start resets the two texts', () => {
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    uiVars.set(MEDIUS_MOTD_VAR, arr('News.', '\n'));
    lobbySessionStart(uiVars);
    expect(uiVars.find(MEDIUS_MOTD_VAR)!.value).toEqual(str(''));
  });
});

describe('GetMediusAnnouncements (FUN_0027d1f0 -> FUN_002f7710)', () => {
  it('names the request, the variable and the three texts (ELF 0x3f38e8, 0x3f57c0, 0x3f5810, 0x3f5808) and the 800-byte budget', () => {
    expect(ANNOUNCEMENT_QUERY).toEqual({ applicationId: 0x28e8 });
    expect([MEDIUS_MOTD_VAR, MOTD_RETRIEVING, MOTD_NO_MESSAGES, MOTD_SEPARATOR, MEDIUS_MOTD_BUDGET])
      .toEqual(['MEDIUS_MOTD', 'Retrieving messages from server...', 'No server messages.', '\n', 800]);
  });

  it('with the session up in state 11: MEDIUS_MOTD "Retrieving messages from server...", one request; answer 1', () => {
    const r = rig({ reply: null });
    expect(r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')))).toBe(true);
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(str(MOTD_RETRIEVING));
    expect(r.queries).toEqual([{ applicationId: 10472 }]);
  });

  it('with the session down, or the lobby in another state than 11: nothing set, nothing sent; the answer is still 1', () => {
    for (const o of [{ lobbyUp: false }, { lobbyState: 9 }]) {
      const r = rig({ reply: null, ...o });
      expect(r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')))).toBe(true);
      expect(r.value(MEDIUS_MOTD_VAR)).toBeUndefined();
      expect(r.queries).toEqual([]);
    }
    expect(WORLD_LOBBY_STATE_READING).toMatch(/11/);
  });

  it('a success reply (FUN_002f77a0): the text then the separator, an array of two strings', async () => {
    const r = rig({ reply: ok('Horizon Medius Server\nSource available on GitHub\n') });
    r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    await flush();
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('Horizon Medius Server\nSource available on GitHub\n', '\n'));
  });

  it('a fresh server\'s reply -- success with an empty text (Horizon\'s MLS.cs:385-396, SVC-05\'s) -- leaves the empty text and the separator', async () => {
    const r = rig({ reply: ok('') });
    r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    await flush();
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('', '\n'));
  });

  it('a failure status: "No server messages."', async () => {
    const r = rig({ reply: ok('ignored', -1) });
    r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    await flush();
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(str(MOTD_NO_MESSAGES));
  });

  it('a request never answered: "Retrieving messages from server..." stays', async () => {
    const uiVars = new UiVarManager();
    const c = new WorldOfSocomCommands({ uiVars, service: { announcement: () => Promise.reject(new Error('no server')) } });
    c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    await flush();
    expect(uiVars.find(MEDIUS_MOTD_VAR)!.value).toEqual(str(MOTD_RETRIEVING));
  });

  it('a second request resets the variable to the retrieving text, so its reply starts a new array', async () => {
    const r = rig({ reply: ok('First.') });
    r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    await flush();
    r.c.GetMediusAnnouncements(...call(cmd('GetMediusAnnouncements')));
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(str(MOTD_RETRIEVING));
    await flush();
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('First.', '\n'));
  });

  it('a reply that finds an array (two replies with no request between): the new text first, then the held strings that fit 800 bytes, counted from the last', () => {
    const r = rig();
    r.uiVars.add(MEDIUS_MOTD_VAR, null, 1);
    r.c.announcementReply(ok('one'));
    r.c.announcementReply(ok('two'));
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('two', '\n', 'one', '\n'));
    // The budget: 800 - (the new text's bytes + two a held element); the walk from the last element back stops at the
    // first that takes it under 0, and what follows that one is kept.
    r.uiVars.set(MEDIUS_MOTD_VAR, arr('a'.repeat(400), 'b'.repeat(300), 'c'.repeat(90)));
    r.c.announcementReply(ok('x'.repeat(5)));                    // 800 - (5 + 3 * 2) = 789; c: 699; b: 399; a: -1 -> a dropped
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('x'.repeat(5), '\n', 'b'.repeat(300), 'c'.repeat(90)));
    r.uiVars.set(MEDIUS_MOTD_VAR, { type: 'array', value: [str('kept'), { type: 'int', value: 7 }, str('too')] });
    r.c.announcementReply(ok('y'));                              // an element that is no string is passed over, both ways
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('y', '\n', 'kept', 'too'));
  });

  it('the budget counts bytes (strlen): a two-byte character costs two', () => {
    const r = rig();
    r.uiVars.add(MEDIUS_MOTD_VAR, arr('é'.repeat(396)), 1);    // 792 bytes
    r.c.announcementReply(ok('123456'));                         // 800 - (6 + 1 * 2) = 792; the held one: 0 -> kept
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('123456', '\n', 'é'.repeat(396)));
    r.uiVars.set(MEDIUS_MOTD_VAR, arr('é'.repeat(396)));
    r.c.announcementReply(ok('1234567'));                        // 791 - 792 < 0 -> dropped
    expect(r.value(MEDIUS_MOTD_VAR)).toEqual(arr('1234567', '\n'));
  });
});

describe('RefreshRoomList (ONL-11, research 161 §2: FUN_0027daa0 D:L126149-126170 -> FUN_002e3a30 D:L184852-184875 -> FUN_002e3aa0 D:L184878-184895)', () => {
  const room = (lobbyName: string, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
    status: 0, mediusWorldId: 1, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
  });
  /** Horizon's four (desktop@be557831 MLS.cs:3383-3384), as SVC-06's channelList answers them: ids 1..4, the last ending the list. */
  const HORIZON = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((n, i) => room(n, { mediusWorldId: i + 1, endOfList: i === 3 }));
  const row = (name: string, players: number, ...icons: number[]): UiVarValue => ({ type: 'array', value: [str(name), { type: 'int', value: players }, ...icons.map((v) => ({ type: 'int' as const, value: v }))] });
  const rooms = (...rows: UiVarValue[]): UiVarValue => ({ type: 'array', value: rows });
  const names = (v: UiVarValue): UiVarValue[] => (v as { value: readonly UiVarValue[] }).value.map((x) => (x as { value: readonly UiVarValue[] }).value[0]!);
  function listRig(o: { entries?: readonly ChannelListEntry[] | 'never' | 'reject'; lobbyUp?: boolean; clan?: string } = {}) {
    const asked: unknown[] = [];
    let up = o.lobbyUp ?? true;
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    const roomList: RoomListService = {
      channelList: (q) => {
        asked.push(q);
        if (o.entries === 'never') return new Promise(() => {});
        if (o.entries === 'reject') return Promise.reject(new Error('no answer'));
        return Promise.resolve(o.entries ?? HORIZON);
      },
    };
    const c = new WorldOfSocomCommands({
      uiVars, service: { announcement: () => new Promise(() => {}) }, roomList, lobbyUp: () => up,
      clanName: o.clan === undefined ? undefined : () => o.clan!,
    });
    const refresh = () => c.RefreshRoomList(...call({ ...cmd('RefreshRoomList'), node: 'ROOMLIST' }));
    return { uiVars, c, asked, refresh, down: () => { up = false; }, list: () => uiVars.find(ROOM_LIST_VAR)!.value };
  }

  it('online (state 11): the client\'s rooms cleared, ChannelList_ExtraInfo0 asked with PageID 1, PageSize 999, answer 1; not online: 0, nothing asked', () => {
    const r = listRig({ entries: 'never' });
    expect(r.refresh()).toBe(true);
    expect(r.asked).toEqual([{ pageId: 1, pageSize: 999 }]);
    expect(ROOM_LIST_QUERY).toEqual({ pageId: 1, pageSize: 999 });
    const off = listRig({ lobbyUp: false });
    expect(off.refresh()).toBe(false);
    expect(off.asked).toEqual([]);
    expect(rig({ lobbyState: 12 }).c.RefreshRoomList(...call(cmd('RefreshRoomList')))).toBe(false);
  });

  it('the reply (FUN_002e3b00) draws on EndOfList (FUN_002e3cc0): Horizon\'s four in FUN_002e3f80\'s order -- Alpha, Bravo, Delta, Charlie -- each [name, players, 1, 2, 3, 4]', async () => {
    const r = listRig();
    r.refresh();
    await flush();
    expect(r.list()).toEqual(rooms(row('Alpha', 0, 1, 2, 3, 4), row('Bravo', 0, 1, 2, 3, 4), row('Delta', 0, 1, 2, 3, 4), row('Charlie', 0, 1, 2, 3, 4)));
    expect(r.c.rooms().map((x) => x.lobbyName)).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie']);   // the sort is in place (FUN_002e5150 over the records)
    expect(r.uiVars.find(ROOM_LIST_VAR)!.longevity).toBe(1);
  });

  it('SVC-14a: the ELIGIBLE RANKS icons are GenericField1\'s low four bits, one icon value per bit set (1 ENSIGN .. 4 CAPTAIN), every one when the four are 0 (D:L185011-185046); the high half sorts first', async () => {
    const r = listRig({ entries: [
      room('Alpha', { genericField1: 0b0101, playerCount: 7 }), room('Bravo', { genericField1: 0b1000 }), room('Zed', { genericField1: 0x10000 }),
      room('Charlie', { genericField1: 0xf0 }), room('Delta', { genericField1: 0b1111, endOfList: true }),
    ] });
    r.refresh();
    await flush();
    expect(r.list()).toEqual(rooms(row('Alpha', 7, 1, 3), row('Bravo', 0, 4), row('Delta', 0, 1, 2, 3, 4), row('Charlie', 0, 1, 2, 3, 4), row('Zed', 0, 1, 2, 3, 4)));
    expect([0, 1, 0b0110, 0x1f].map(roomEligibleRanks)).toEqual([[1, 2, 3, 4], [1], [2, 3], [1, 2, 3, 4]]);
    expect(ELIGIBLE_RANKS.map((e) => `${e.icon} ${e.bit} ${e.rank} ${e.medal}`)).toEqual(['1 1 ENSIGN Medal_Blue', '2 2 LIEUTENANT Medal_Bronze', '3 4 LT. COMMANDER Medal_Silver', '4 8 CAPTAIN Medal_Gold']);
  });

  it('a name opening "Medius" is not drawn; a "+Clan - " room only when it is the player\'s own clan\'s ("+Clan - %s" of the clan\'s name, a member only, D:L184996-185006)', async () => {
    const entries = [room('Medius Lobby'), room('Alpha'), room('+Clan - Ours'), room('+Clan - Theirs'), room('+Other', { endOfList: true })];
    const r = listRig({ entries });
    r.refresh();
    await flush();
    expect(names(r.list())).toEqual([str('Alpha'), str('+Other')]);
    const ours = listRig({ entries, clan: 'Ours' });
    ours.refresh();
    await flush();
    expect(names(ours.list())).toEqual([str('Alpha'), str('+Other'), str('+Clan - Ours')]);
  });

  it('a room of the same name is updated in place (the name compared whole, D:L184914-184961); an entry with a world id below 0 is not kept; nothing is drawn before EndOfList', () => {
    const r = listRig({ entries: 'never' });
    r.refresh();
    r.c.roomListReply([room('Alpha', { playerCount: 3 }), room('Alpha', { playerCount: 5, maxPlayers: 32 }), room('Bravo', { mediusWorldId: -1 })]);
    expect(r.list()).toEqual({ type: 'none' });
    expect(r.c.rooms().map((x) => `${x.lobbyName} ${x.playerCount} ${x.maxPlayers}`)).toEqual(['Alpha 5 32']);
    r.c.roomListReply([room('Charlie', { mediusWorldId: -1, endOfList: true })]);
    expect(r.list()).toEqual(rooms(row('Alpha', 5, 1, 2, 3, 4)));
  });

  it('empty: Horizon\'s NoResult entry (status 1) is not a success -- nothing kept, nothing drawn, so a fresh session\'s list stays with no row and a drawn one keeps its rows', async () => {
    const empty = [room('', { status: 1, mediusWorldId: 0, maxPlayers: 0, endOfList: true })];
    let answer: readonly ChannelListEntry[] = empty;
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    const c = new WorldOfSocomCommands({ uiVars, service: { announcement: () => new Promise(() => {}) }, roomList: { channelList: () => Promise.resolve(answer) } });
    const refresh = () => c.RefreshRoomList(...call(cmd('RefreshRoomList')));
    refresh();
    await flush();
    expect([uiVars.find(ROOM_LIST_VAR)!.value, c.rooms()]).toEqual([{ type: 'none' }, []]);
    answer = HORIZON;
    refresh();
    await flush();
    expect(names(uiVars.find(ROOM_LIST_VAR)!.value)).toHaveLength(4);
    answer = empty;
    refresh();                                                                    // the records cleared by the request (FUN_002e4140), the var not rewritten
    await flush();
    expect([names(uiVars.find(ROOM_LIST_VAR)!.value).length, c.rooms()]).toEqual([4, []]);
  });

  it('error: a request never answered (the service rejects) changes nothing; a reply after the session went down is dropped', async () => {
    const r = listRig({ entries: 'reject' });
    r.refresh();
    await flush();
    expect(r.list()).toEqual({ type: 'none' });
    const d = listRig();
    d.refresh();
    d.down();
    await flush();
    expect(d.list()).toEqual({ type: 'none' });
  });

  /** A service whose answers the test releases by hand, in any order; the session's ticket a variable. */
  function manualRig() {
    const pending: Array<(e: readonly ChannelListEntry[]) => void> = [];
    let ticket: string | null = 'T1';
    const uiVars = new UiVarManager();
    lobbySessionStart(uiVars);
    const c = new WorldOfSocomCommands({
      uiVars, service: { announcement: () => new Promise(() => {}) }, ticket: () => ticket,
      roomList: { channelList: () => new Promise((r) => { pending.push(r); }) },
    });
    const refresh = () => c.RefreshRoomList(...call(cmd('RefreshRoomList')));
    return { uiVars, c, pending, refresh, setTicket: (t: string | null) => { ticket = t; }, list: () => uiVars.find(ROOM_LIST_VAR)!.value };
  }

  it('ROOM_LIST_LATEST_REPLY_ADAPTATION: request A in flight, request B sent and answered, A answered late -- the list shows B\'s rows', async () => {
    const r = manualRig();
    r.refresh();                                                                  // A: the 30 s refresh, slow
    r.refresh();                                                                  // B: REFRESH LIST
    r.pending[1]!([room('Alpha', { playerCount: 4, endOfList: true })]);
    await flush();
    r.pending[0]!([room('Alpha', { playerCount: 1 }), room('Gone', { endOfList: true })]);
    await flush();
    expect(r.list()).toEqual(rooms(row('Alpha', 4, 1, 2, 3, 4)));
    expect(r.c.rooms().map((x) => x.lobbyName)).toEqual(['Alpha']);
    expect(ROOM_LIST_LATEST_REPLY_ADAPTATION).toMatch(/latest/);
  });

  it('a reply for a session that no longer holds its ticket is dropped: request in flight, logoff (no ticket), late reply -- ROOMLISTVAR untouched; a new login\'s ticket drops it too', async () => {
    const r = manualRig();
    r.refresh();
    r.setTicket(null);                                                            // the logoff, or the session lost
    r.pending[0]!(HORIZON);
    await flush();
    expect([r.list(), r.c.rooms()]).toEqual([{ type: 'none' }, []]);
    const s = manualRig();
    s.refresh();
    s.setTicket('T2');                                                            // a logoff and a new login in between
    s.pending[0]!(HORIZON);
    await flush();
    expect(s.list()).toEqual({ type: 'none' });
  });

  it('with no room service the request is never answered: 1 online, no row', () => {
    const r = rig();
    lobbySessionStart(r.uiVars);
    expect(r.c.RefreshRoomList(...call(cmd('RefreshRoomList')))).toBe(true);
    expect(r.value('ROOMLISTVAR')).toEqual({ type: 'none' });
  });
});

describe('the account name (0x66a4f4) the clan rows print', () => {
  it('is the session\'s; absent the hook, PLAYERNAMEVAR\'s text (ACCOUNT_NAME_READING) -- GetMyClans\' reply and the clan rows are ONL-27\'s (./manageRosterScreen.test.ts)', () => {
    expect(ACCOUNT_NAME_READING).toMatch(/PLAYERNAMEVAR/);
    expect(Object.keys(rig().c.entries())).toEqual(['GetMediusAnnouncements', 'RefreshRoomList']);
    expect(rig().value(PLAYER_NAME_AND_TAG_VAR)).toBeUndefined();
  });
});

describe('the valves global_valves.rdr gives the dialog\'s set (RUN/READERC.ZAR; CValve_Open at PERM, FUN_00351d40)', () => {
  it('PopupNewsOnce 0 PERM; the AUTOPLAY filters PERSIST with GameSpeedFilter 65000 and FF_FILTER 2; the rest 0 PERM', () => {
    expect(WORLD_OF_SOCOM_GLOBAL_VALVES).toEqual([
      { name: 'ComeFromLan', value: 0, type: 'PERM' }, { name: 'GameTypeFilter', value: 0, type: 'PERM' }, { name: 'socom_online_state', value: 0, type: 'PERM' },
      { name: 'socom_online_initialized', value: 0, type: 'PERM' }, { name: 'LadderMedalOfMerit', value: 0, type: 'PERM' }, { name: 'mp_join_game', value: 0, type: 'PERM' },
      { name: 'JoinAsSpectator', value: 0, type: 'PERM' }, { name: 'GamePlayerFilter', value: 0, type: 'PERSIST' }, { name: 'GameSpeedFilter', value: 65000, type: 'PERSIST' },
      { name: 'FF_FILTER', value: 2, type: 'PERSIST' }, { name: 'PopupNewsOnce', value: 0, type: 'PERM' }, { name: 'GameTypeMapIndex', value: 0, type: 'PERSIST' },
    ]);
  });

  it('a launch\'s seed: each valve at the table\'s value and type; a launch after the news was shown starts at 0 again', () => {
    const valves = new ValveStore();
    seedWorldOfSocomValves(valves);
    expect([valves.find('PopupNewsOnce')!.value, valves.find('PopupNewsOnce')!.type]).toEqual([0, VALVE_TYPE.PERM]);
    expect([valves.find('GameSpeedFilter')!.value, valves.find('GameSpeedFilter')!.type]).toEqual([65000, VALVE_TYPE.PERSIST]);
    valves.set('PopupNewsOnce', 1, VALVE_TYPE.TEMP);
    seedWorldOfSocomValves(valves);
    expect(valves.find('PopupNewsOnce')!.value).toBe(0);
  });
});

describe('the parked rows\' gate (OT.R8: drawn and inert)', () => {
  const design = {} as DialogDesign;
  const start = (animation: string, dialog = WORLD_OF_SOCOM) => ({ dialog, design, animation, argument: null });

  it('names each parked row\'s CROSS animation with its task and what the original\'s script runs -- none since ONL-30 (CLAN RANKING, research 311)', () => {
    expect(PARKED_ROWS.map((p) => `${p.control} ${p.animation} ${p.task}`)).toEqual([]);
    expect(parkedRowGate(start('Goto_ClanLadder')), 'CLAN RANKING: unparked by ONL-30 (research 311)').toBe(false);
    expect(parkedRowGate(start('Goto_Invites')), 'INVITATIONS: unparked by ONL-28 (research 273 §4)').toBe(false);
    expect(parkedRowGate(start('create_modify_clan')), 'CLAN: unparked by ONL-26 (research 271)').toBe(false);
    expect(parkedRowGate(start('Goto_Ignore')), 'IGNORE: unparked by ONL-25 (research 269 §1)').toBe(false);
    expect(parkedRowGate(start('Goto_Ladder')), 'PLAYER RANKING: unparked by ONL-30a (research 269 §2)').toBe(false);
    expect(parkedRowGate(start('Goto_Friends')), 'FRIENDS: unparked by ONL-24 (research 269 §3)').toBe(false);
    for (const p of PARKED_ROWS) expect(p.original, p.control).toBeTruthy();
    expect(PARKED_ROW_GATE_READING).toMatch(/OT\.R8/);
  });

  it('takes the start of exactly those animations on dlgWorldOfSOCOM.rdr, and nothing else -- ROOMLIST\'s CROSS join_room runs (ONL-12\'s join, research 162)', () => {
    for (const p of PARKED_ROWS) expect(parkedRowGate(start(p.animation)), p.animation).toBe(true);
    for (const a of ['join_random_game', 'join_room', 'PressBriefingRoombtn', 'refresh_roomlist', 'exit_lobby', 'popup_motd_response', 'OnNewsbtn', 'OnBadJoinState', 'init_screen']) expect(parkedRowGate(start(a)), a).toBe(false);
    expect(parkedRowGate(start('Goto_Options', 'dlgOnlineOptions.rdr'))).toBe(false);
    expect(parkedRowGate(start('Goto_Options')), 'OPTIONS: unparked by TAUNTS (the OPT-15 slice, research 301 §6)').toBe(false);
  });

  it('is registered with the rows (UiCommandHost.setBindingGate), under its own name -- its list empty, it takes no start', () => {
    const r = rig();
    const host = new UiCommandHost();
    const owners: string[] = [];
    const set = host.setBindingGate.bind(host);
    host.setBindingGate = (owner, gate) => { if (gate) owners.push(owner); set(owner, gate); };
    r.c.register(host);
    expect(owners).toContain(PARKED_ROW_GATE);
    expect(host.bindingStart(start('Goto_ClanLadder'))).toBe(false);
    expect(host.bindingStart(start('refresh_roomlist'))).toBe(false);
  });
});

describe('the event names the dialog binds exist in the event table', () => {
  it('ON_LADDER_REFRESH, MP_JOIN_ROOM and MP_MEDIUS_HAS_INVITES are named events', () => {
    for (const n of ['ON_LADDER_REFRESH', 'MP_JOIN_ROOM', 'MP_MEDIUS_HAS_INVITES']) expect(DIALOG_EVENTS[n], n).toBeGreaterThan(0);
  });
});
