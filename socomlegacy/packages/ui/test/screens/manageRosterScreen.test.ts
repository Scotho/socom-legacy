import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { UiDrawItem } from '../../src/compositor/drawList';
import { layoutText } from '../../src/text/layout';
import { LobbyClan, MANAGE_ROSTER_LEADER, type ClanRosterMember } from '../../src/screens/createClanCommands';
import * as invitedModule from '../../src/screens/invitedPlayersCommands';
import * as messagesModule from '../../src/screens/clanMessagesCommands';
import { ClanMessagesCommands, MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES } from '../../src/screens/clanMessagesCommands';
import { RESPOND_TO_INVITES } from '../../src/screens/respondToInvitesCommands';
import * as worldModule from '../../src/screens/worldOfSocomCommands';
import * as rosterModule from '../../src/screens/manageRosterCommands';
import { PLAYER_NAME_AND_TAG_VAR, WORLD_OF_SOCOM_COMMAND_ROWS, WORLD_OF_SOCOM_ENTRY_COMMANDS, type WorldOfSocomCommands } from '../../src/screens/worldOfSocomCommands';
import {
  CLAN_DISBANDED_OWN_RECORD_READING, CLAN_RATING_ROWS, CLAN_RATING_VAR, CLAN_REQUEST_SESSION_ADAPTATION, CLAN_ROSTER_QUERY,
  CLAN_ROSTER_SORT_READING, CLAN_ROSTER_TICKET_ADAPTATION, CLAN_ROSTER_VAR, CLAN_SELF_BY_NAME_ADAPTATION, MANAGE_ROSTER, MANAGE_ROSTER_COMMAND_ROWS, MY_CLANS_QUERY,
  ManageRosterCommands, ROSTER_ONLINE_GLYPH, clanRosterRating, clanRosterRows, rosterMemberOf, sortClanRoster,
  type ClanRosterEntry, type ManageRosterService, type MyClansReply,
} from '../../src/screens/manageRosterCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-27 (web research 272): the clan client and the member's roster (`dlgManageRoster.rdr`) -- PLAT-08's rows
 * `GetClan` (0x27aa60: `j FUN_002e8a90` D:L187723-187766, GetMyClans' reply `FUN_002e8bd0` D:L187769-187847),
 * `IsMemberOfClan` (`FUN_002e6830`), `IsLeaderOfClan` (`FUN_0027a890` D:L124550-124564 -> `FUN_002e67d0` D:L186474-186488
 * over `FUN_002e9460` D:L188026-188057), `GetClanRoster` (`FUN_0027a390` -> `FUN_002e69f0` D:L186557-186582, its reply
 * `FUN_002e6a90` D:L186585-186598, the rows `FUN_002e6af0` D:L186601-186704), `GetClanMemberInfo` (`FUN_00279a20` ->
 * `FUN_002e6000`) and `QuitClan` (`FUN_00278d00` -> `FUN_002e8ef0` D:L187850-187870, its reply `FUN_002e8f70`
 * D:L187873-187895) -- over SVC-08's GetMyClans and roster and SVC-09's RemovePlayerFromClan.
 * - The rows off the machine, over the service's fake.
 * - The pages over the machine, built from the disc's layouts and sets (or the committed fixtures): SOCOM II ONLINE's
 *   CLAN row for a member and the leader, the member's roster (its ONSTART, the rows, the clan rating, LEAVE CLAN, VIEW
 *   INFO, the two events), the band asked by GetMyClans' success, RESPOND TO INVITES' member branch.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const E = DIALOG_EVENTS;
const cmd = (fn: string, arg = 'NA', anim = 'init_screen'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const hexOf = (text: string): string => Array.from({ length: 256 }, (_, i) => (i < text.length ? text.charCodeAt(i) : 0).toString(16).padStart(2, '0')).join('');
/** A clan stats record as the create posts it ("%.3d%.12d%s", research 271 §2.3): icon 0, the rating, the tag at +15. */
const clanStats = (tag: string, rating = 0): string => hexOf(`000${String(rating).padStart(12, '0')}${tag}`);
/** An account stats record with only its description at +0x9f (research 261 §1). */
const accountStats = (description: string): string => hexOf('E'.padEnd(0x9f, '\0') + description);
const OFFLINE = { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' };

const mine = (o: Partial<MyClansReply> = {}): MyClansReply => ({
  status: 0, clanId: 12, clanName: 'Tide', leaderAccountId: 7, leaderAccountName: 'socomc', stats: clanStats(''), endOfList: true, ...o,
});
const NO_CLAN: MyClansReply = { status: 1, clanId: 0, clanName: '', leaderAccountId: 0, leaderAccountName: '', stats: '00'.repeat(256), endOfList: true };
const member = (accountId: number, accountName: string, o: Partial<ClanRosterEntry> = {}): ClanRosterEntry => ({
  status: 0, accountId, accountName, stats: accountStats(''), onlineState: { ...OFFLINE }, ladderStat: 0, ladderPosition: 1, totalRankings: 0, endOfList: false, ...o,
});
const roster = (...rows: ClanRosterEntry[]): ClanRosterEntry[] => rows.map((r, i) => ({ ...r, endOfList: i === rows.length - 1 }));

/** A server over the service's calls: GetMyClans' replies, the roster's rows, the remove's status. */
function server(o: { clans?: MyClansReply[]; roster?: ClanRosterEntry[]; removeStatus?: number; hold?: boolean } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  const pending: (() => void)[] = [];
  const later = <T>(v: T): Promise<T> => (o.hold ? new Promise<T>((r) => { pending.push(() => r(v)); }) : Promise.resolve(v));
  const service: ManageRosterService = {
    myClans: (q) => { requests.push({ op: 'my-clans', body: q }); return later(o.clans ?? [NO_CLAN]); },
    roster: (q) => { requests.push({ op: 'roster', body: q }); return later(o.roster ?? [{ ...member(0, ''), status: -971, endOfList: true }]); },
    remove: (q) => { requests.push({ op: 'remove', body: q }); return later({ status: o.removeStatus ?? 0 }); },
  };
  return { service, requests, pending, answers: o, release: () => { for (const p of pending.splice(0)) p(); } };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { lobbyUp?: boolean; lobbyState?: number; ticket?: () => string | null; accountName?: string | null; total?: number; position?: number } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const clan = new LobbyClan();
  const events: number[] = [];
  const asked: number[] = [];
  const c = new ManageRosterCommands({
    uiVars, clan, service: s.service, event: (kind) => { events.push(kind); }, ticket: extra.ticket,
    ...(extra.lobbyUp !== undefined ? { lobbyUp: () => extra.lobbyUp! } : {}), ...(extra.lobbyState !== undefined ? { lobbyState: () => extra.lobbyState! } : {}),
    accountName: () => (extra.accountName === undefined ? 'socomc' : extra.accountName), clanMessages: { myClanMessages: () => { asked.push(clan.clanId); } },
    ...(extra.total !== undefined ? { ladderTotal: () => extra.total! } : {}), ...(extra.position !== undefined ? { ladderPosition: () => extra.position! } : {}),
  });
  const run = (fn: keyof ReturnType<ManageRosterCommands['entries']>, arg = 'NA', anim = 'init_screen'): boolean => c.entries()[fn](cmd(fn, arg, anim), {} as never, undefined);
  const value = (n: string): UiVarValue | undefined => uiVars.find(n)?.value;
  return { ...s, uiVars, clan, events, asked, c, run, value };
}

describe('the rows (PLAT-08\'s table: GetClan, IsMemberOfClan, IsLeaderOfClan, GetClanRoster, GetClanMemberInfo, QuitClan -- ONL-27\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each answers through its body', () => {
    expect(MANAGE_ROSTER_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '54 GetClan 27aa60 ONL-27', '52 IsMemberOfClan 27a910 ONL-27', '53 IsLeaderOfClan 27a890 ONL-27', '80 GetClanRoster 27a390 ONL-27',
      '174 GetClanMemberInfo 279a20 ONL-27', '91 QuitClan 278d00 ONL-27',
    ]);
    for (const r of MANAGE_ROSTER_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task], r.name).toEqual([r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of MANAGE_ROSTER_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('SOCOM II ONLINE\'s module no longer holds them: GET_CLAN_STUB_READING retired, the three rows ONL-27\'s existing bodies', () => {
    expect(WORLD_OF_SOCOM_COMMAND_ROWS.map((r) => r.name)).toEqual(['GetMediusAnnouncements', 'RefreshRoomList']);
    expect('GET_CLAN_STUB_READING' in worldModule).toBe(false);
    for (const n of ['GetClan', 'IsMemberOfClan', 'IsLeaderOfClan']) expect(WORLD_OF_SOCOM_ENTRY_COMMANDS.find((e) => e.name === n), n).toMatchObject({ state: 'existing', task: 'ONL-27' });
    expect(['CLAN_ROSTER_UNHELD_READING' in invitedModule, 'MY_CLAN_MESSAGES_ENTRY_READING' in messagesModule]).toEqual([false, false]);
  });

  it('the names: the dialogs, CLAN_ROSTER (S:0x3f3930), ClanRating (S:0x3f4038), the requests\' words, the readings and adaptations', () => {
    expect([MANAGE_ROSTER, MANAGE_ROSTER_LEADER, CLAN_ROSTER_VAR, CLAN_RATING_VAR]).toEqual(['dlgManageRoster.rdr', 'dlgManageRosterLeader.rdr', 'CLAN_ROSTER', 'ClanRating']);
    expect([MY_CLANS_QUERY, CLAN_ROSTER_QUERY, CLAN_RATING_ROWS, ROSTER_ONLINE_GLYPH]).toEqual([
      { start: 1, pageSize: 999 }, { ladderStatIndex: 0, sortOrder: 1 }, 8, { offline: '\xaa', online: '\xa7' },
    ]);
    expect(CLAN_SELF_BY_NAME_ADAPTATION).toMatch(/name/);
    expect(CLAN_REQUEST_SESSION_ADAPTATION).toMatch(/ticket/);
    expect(CLAN_ROSTER_TICKET_ADAPTATION).toMatch(/ticket/);
    expect(CLAN_DISBANDED_OWN_RECORD_READING).toMatch(/record/);
    // CLAN-RECORD-POST: the record's clan fields are the services' (server `clans.ts`, RECORD_CLAN_FIELDS_READING); the page posts no record.
    expect('CLAN_RECORD_POST_PLACEHOLDER' in rosterModule).toBe(false);
    expect(CLAN_ROSTER_SORT_READING).toMatch(/selection/);
  });
});

describe('GetClan: GetMyClans\' state machine (FUN_002e8a90) in place of the stub', () => {
  it('0 on the call that asks -- CLANNAMEVAR and Clan_Description emptied, GetMyClans sent (1 at +0x28, 999 at +0x2c) --, 0 while it is out, 1 once answered, then 0 and a new request', async () => {
    const r = rows({ hold: true });
    expect(r.run('GetClan')).toBe(false);
    expect(r.requests).toEqual([{ op: 'my-clans', body: { start: 1, pageSize: 999 } }]);
    expect([r.value('CLANNAMEVAR'), r.value('Clan_Description')]).toEqual([str(''), str('')]);
    expect(r.uiVars.find('CLANNAMEVAR')!.longevity).toBe(2);
    expect(r.run('GetClan')).toBe(false);
    expect(r.requests).toHaveLength(1);
    r.release();
    await flush();
    expect(r.run('GetClan')).toBe(true);
    expect(r.run('GetClan')).toBe(false);
    expect(r.requests).toHaveLength(2);
  });

  it('with the session down or out of state 11: 1 at once, nothing sent or written; with no service: asked and never answered (0 on)', () => {
    for (const x of [{ lobbyUp: false }, { lobbyState: 3 }]) {
      const r = rows({}, x);
      expect(r.run('GetClan')).toBe(true);
      expect([r.requests, r.value('CLANNAMEVAR')]).toEqual([[], undefined]);
    }
    const none = new ManageRosterCommands({ uiVars: new UiVarManager(), clan: new LobbyClan() });
    const call = (): boolean => none.GetClan(cmd('GetClan'), {} as never, undefined);
    expect([call(), call()]).toEqual([false, false]);
  });

  it('the no-clan reply (FUN_002e8bd0 D:L187786-187802): the ids -1 and the name zeroed, both variables empty, the roster emptied and drawn -- CLAN_ROSTER [] and ClanRating 0 --, PLAYER_NAME_AND_TAG the name (PERMANENT); no MP_CLAN_DISBANDED for a player in no clan at the request', async () => {
    const r = rows();
    r.run('GetClan');
    await flush();
    expect([r.clan.member, r.clan.clanId, r.clan.leader, r.clan.name, r.clan.rating]).toEqual([false, -1, -1, '', 0]);
    expect([r.value(CLAN_ROSTER_VAR), r.value(CLAN_RATING_VAR), r.value(PLAYER_NAME_AND_TAG_VAR)]).toEqual([{ type: 'array', value: [] }, { type: 'int', value: 0 }, str('socomc')]);
    expect([r.uiVars.find(PLAYER_NAME_AND_TAG_VAR)!.longevity, r.uiVars.find(CLAN_RATING_VAR)!.longevity]).toEqual([2, 1]);
    expect([r.events, r.asked, r.requests.map((q) => q.op)]).toEqual([[], [], ['my-clans']]);
  });

  it('a no-clan reply to a request made in a clan raises MP_CLAN_DISBANDED (S:0x3f4550, D:L187795-187800: DAT_0044f790 set at the request) -- the record\'s post after it the services\' (server clans.ts, RECORD_CLAN_FIELDS_READING)', async () => {
    const r = rows();
    r.clan.clanId = 12; r.clan.leader = 99; r.clan.name = 'Tide';
    r.run('GetClan');
    r.clan.clanId = -1;                                                                  // what the request saw is what counts
    await flush();
    expect([r.events, r.clan.member]).toEqual([[E['MP_CLAN_DISBANDED']], false]);
  });

  it('the success (D:L187805-187836): the clan id, the leader id and the name kept; CLANNAMEVAR the name, Clan_Description the tag (the stats\' +15); the roster asked (FUN_002e69f0) and the band (myClanMessages); PLAYER_NAME_AND_TAG "[tag] name"', async () => {
    const r = rows({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss', stats: clanStats('TDE', 5) })] });
    r.run('GetClan');
    await flush();
    expect([r.clan.clanId, r.clan.leader, r.clan.name, r.clan.member, r.clan.leaderIsMine(), r.clan.self]).toEqual([12, 99, 'Tide', true, false, null]);
    expect([r.value('CLANNAMEVAR'), r.value('Clan_Description')]).toEqual([str('Tide'), str('TDE')]);
    expect(r.value(PLAYER_NAME_AND_TAG_VAR)).toEqual(str('#C\x80\x40\x20[TDE] #C\x80\x80\x80socomc'));
    expect(r.requests).toEqual([{ op: 'my-clans', body: { start: 1, pageSize: 999 } }, { op: 'roster', body: { clanId: 12, ladderStatIndex: 0, sortOrder: 1 } }]);
    expect(r.asked).toEqual([12]);                                                       // FUN_002e8bd0 D:L187824-187831, with the clan id just set
  });

  it('a leader\'s reply: the session\'s own id learned by the leader\'s name (CLAN_SELF_BY_NAME_ADAPTATION, case-blind); IsLeaderOfClan 1', async () => {
    const r = rows({ clans: [mine({ leaderAccountId: 7, leaderAccountName: 'SOCOMC' })] });
    r.run('GetClan');
    await flush();
    expect([r.clan.self, r.clan.leader, r.clan.leaderIsMine(), r.run('IsLeaderOfClan'), r.run('IsMemberOfClan')]).toEqual([7, 7, true, true, true]);
  });

  it('MP_MEDIUS_BECAME_LEADER (S:0x3f4530, D:L187804-187807): the leader known and not mine, the reply\'s leader mine; not at the first reply, not when it was mine', async () => {
    const r = rows({ clans: [mine({ leaderAccountId: 7, leaderAccountName: 'socomc' })] });
    r.clan.clanId = 12; r.clan.leader = 99;
    r.run('GetClan');
    await flush();
    expect(r.events).toEqual([E['MP_MEDIUS_BECAME_LEADER']]);
    const first = rows({ clans: [mine()] });
    first.run('GetClan');
    await flush();
    const again = rows({ clans: [mine()] });
    again.clan.clanId = 12; again.clan.leader = 'mine';
    again.run('GetClan');
    await flush();
    expect([first.events, again.events]).toEqual([[], []]);
  });

  it('the account name absent: PLAYERNAMEVAR\'s text; a reply after the ticket changed is dropped and the next GetClan asks afresh (CLAN_REQUEST_SESSION_ADAPTATION)', async () => {
    let ticket: string | null = 'a';
    const r = rows({ clans: [mine()], hold: true }, { ticket: () => ticket, accountName: null });
    r.uiVars.add('PLAYERNAMEVAR', str('persona'), 2);
    expect(r.run('GetClan')).toBe(false);
    ticket = 'b';
    r.release();
    await flush();
    expect([r.clan.member, r.value(PLAYER_NAME_AND_TAG_VAR)]).toEqual([false, undefined]);
    expect(r.run('GetClan')).toBe(false);                                                  // the state reset with the session: a new request
    expect(r.requests.filter((q) => q.op === 'my-clans')).toHaveLength(2);
    r.release();
    await flush();
    expect([r.clan.member, r.value(PLAYER_NAME_AND_TAG_VAR)]).toEqual([true, str('persona')]);
  });
});

describe('GetClanRoster and the roster\'s rows (FUN_002e69f0, FUN_002e6a90, FUN_002e6af0)', () => {
  const held = (...entries: ClanRosterEntry[]): ClanRosterMember[] => entries.map(rosterMemberOf);

  it('the request: only online -- the roster emptied and drawn at once, then the clan id, ladder stat 0, sort 1 (no session key); 1 whatever', () => {
    const r = rows({ hold: true });
    r.clan.clanId = 12;
    r.clan.roster.push(...held(member(1, 'a')));
    expect(r.run('GetClanRoster', 'NA', 'OnMRosterStart')).toBe(true);
    expect([r.requests, r.clan.roster, r.value(CLAN_ROSTER_VAR), r.value(CLAN_RATING_VAR)]).toEqual([
      [{ op: 'roster', body: { clanId: 12, ladderStatIndex: 0, sortOrder: 1 } }], [], { type: 'array', value: [] }, { type: 'int', value: 0 },
    ]);
    const down = rows({}, { lobbyUp: false });
    expect([down.run('GetClanRoster'), down.requests]).toEqual([true, []]);
  });

  it('each Success row kept by its account (FUN_002e9590), drawn when one ends the list; a refusal (ClanNotFound -971) keeps and draws nothing', async () => {
    const r = rows({ roster: roster(member(7, 'socomc'), member(8, 'bob'), member(8, 'bob')) });
    r.clan.clanId = 12; r.clan.leader = 7;
    r.run('GetClanRoster');
    await flush();
    expect(r.clan.roster.map((m) => m.accountId)).toEqual([7, 8]);
    expect(r.clan.self).toBe(7);                                                          // the row of the session's name (CLAN_SELF_BY_NAME_ADAPTATION)
    const none = rows();
    none.clan.clanId = 12;
    none.run('GetClanRoster');
    await flush();
    expect([none.clan.roster, none.value(CLAN_ROSTER_VAR)]).toEqual([[], { type: 'array', value: [] }]);
  });

  it('the rows (D:L186641-186680): [the key VALUE "%d" of the account, the name, ª / §, the description, "%d" of the position, "(Leader)" / " ", the medal, the room, the game]', () => {
    const k = new LobbyClan();
    k.leader = 7;
    const list = held(
      member(7, 'socomc', { onlineState: { connectStatus: 2, lobbyWorldId: 3, gameWorldId: -1, lobbyName: 'Medius Lobby 1', gameName: '' }, ladderPosition: 3 }),
      member(8, 'bob', { stats: accountStats('hi there'), onlineState: { connectStatus: 3, lobbyWorldId: 4, gameWorldId: 9, lobbyName: 'Room A', gameName: 'Game B' }, ladderPosition: 20 }),
      member(9, 'carol'),
    );
    const out = clanRosterRows(list, (id) => k.leaderIs(id), (p) => p * 10);
    const cell = (v: UiVarValue): unknown => (v.type === 'array' ? v.value.map(cell) : v.type === 'none' ? null : v.value);
    expect(out.map(cell)).toEqual([
      [['VALUE', '7'], 'socomc', '\xa7', '', '3', '(Leader)', 30, 'MAIN MENU', ' '],
      [['VALUE', '8'], 'bob', '\xa7', 'hi there', '20', ' ', 200, 'Room A', 'Game B'],
      [['VALUE', '9'], 'carol', '\xaa', '', '1', ' ', 10, '', ''],
    ]);
  });

  it('the order (FUN_002ea240, a selection sort: the largest ladder stat first, the swap moving the displaced row); the rating the mean of the first eight\'s stats with eight or more, truncated, else 0', () => {
    const list = held(...[5, 9, 5, 1].map((s, i) => member(i + 1, `p${i}`, { ladderStat: s })));
    sortClanRoster(list);
    expect(list.map((m) => m.accountId)).toEqual([2, 1, 3, 4]);
    const ties = held(member(1, 'a', { ladderStat: 1 }), member(2, 'b', { ladderStat: 1 }), member(3, 'c', { ladderStat: 2 }));
    sortClanRoster(ties);
    expect(ties.map((m) => m.accountId)).toEqual([3, 2, 1]);                               // the swap of 1 and 3 puts 2 before 1
    expect(clanRosterRating(held(...[1, 2, 3, 4, 5, 6, 7].map((s, i) => member(i, `p${i}`, { ladderStat: s * 100 }))))).toBe(0);
    const nine = held(...[900, 100, 800, 200, 700, 300, 600, 400, 1].map((s, i) => member(i, `p${i}`, { ladderStat: s })));
    sortClanRoster(nine);
    expect(clanRosterRating(nine)).toBe(Math.trunc((900 + 800 + 700 + 600 + 400 + 300 + 200 + 100) / 8));
    expect(clanRosterRating(held(...Array.from({ length: 8 }, (_, i) => member(i, `p${i}`, { ladderStat: i === 0 ? -9 : 0 }))))).toBe(-1);   // (-9 + 7) >> 3
  });

  it('the drawn roster: CLAN_ROSTER the rows in the sorted order, ClanRating the int (TEMPORARY), the medal of each position against my total (ladderTotal)', async () => {
    const r = rows({ roster: roster(...Array.from({ length: 8 }, (_, i) => member(i + 1, `p${i}`, { ladderStat: (i + 1) * 8, ladderPosition: i + 1 }))) }, { total: 100 });
    r.clan.clanId = 12; r.clan.leader = 8;
    r.run('GetClanRoster');
    await flush();
    expect(r.value(CLAN_RATING_VAR)).toEqual({ type: 'int', value: 36 });
    const list = r.value(CLAN_ROSTER_VAR)!;
    expect(list.type === 'array' && list.value.map((x) => (x.type === 'array' ? [x.value[1], x.value[5], x.value[6]] : null))).toEqual([
      [str('p7'), str('(Leader)'), { type: 'int', value: 5 }], ...[6, 5, 4, 3, 2, 1, 0].map((i) => [str(`p${i}`), str(' '), { type: 'int', value: 5 }]),
    ]);
    expect(r.clan.rating).toBe(36);
  });

  it('CLAN-ROSTER-LADDER (research 310 §6 item 1): rows as the server now answers them -- LadderStat the stored rating, the board\'s position, an unranked member 0 -- give ClanRating the mean of the eight best toward zero, 0 at seven, with no page change', async () => {
    // the server's answer to a clan of nine rated members and one off the board (ROSTER_UNRANKED_POSITION_READING 0), the board eleven long
    const ratings = [1500, 1400, 1300, 1200, 1100, 1000, 905, 800, 700];
    const positions = [1, 3, 4, 5, 6, 7, 9, 10, 11];
    const ranked = ratings.map((s, i) => member(i + 1, `m${i}`, { ladderStat: s, ladderPosition: positions[i]!, totalRankings: 11 }));
    const unranked = member(10, 'fresh', { ladderStat: 1000, ladderPosition: 0, totalRankings: 11 });
    const r = rows({ roster: roster(...[...ranked].reverse(), unranked) }, { total: 11 });
    r.clan.clanId = 12; r.clan.leader = 1;
    r.run('GetClanRoster');
    await flush();
    // sorted: 1500 1400 1300 1200 1100 1000 1000 905 | 800 700 -- (9405) / 8 = 1175.625, toward zero 1175 (FUN_002e6af0 D:L186682-186690)
    expect(r.value(CLAN_RATING_VAR)).toEqual({ type: 'int', value: Math.trunc((1500 + 1400 + 1300 + 1200 + 1100 + 1000 + 1000 + 905) / 8) });
    expect(r.value(CLAN_RATING_VAR)).toEqual({ type: 'int', value: 1175 });
    const cellsOf = (v: UiVarValue | undefined): (readonly UiVarValue[])[] => (v?.type === 'array' ? v.value.map((x) => (x.type === 'array' ? x.value : [])) : []);
    const fresh = cellsOf(r.value(CLAN_ROSTER_VAR)).find((c) => JSON.stringify(c[1]) === JSON.stringify(str('fresh')));
    // the unranked row: RANK "0" (D:L186655), the top-ten medal against a players' total of 11 (FUN_002eaee0 D:L188946-188948)
    expect([fresh?.[4], fresh?.[6]]).toEqual([str('0'), { type: 'int', value: 5 }]);
    const seven = rows({ roster: roster(...ranked.slice(0, 7)) }, { total: 11 });
    seven.clan.clanId = 12;
    seven.run('GetClanRoster');
    await flush();
    expect(seven.value(CLAN_RATING_VAR)).toEqual({ type: 'int', value: 0 });
    // with no players' total held the unranked row draws no medal (D:L188942, D:L188946-188947)
    const none = rows({ roster: roster(unranked) });
    none.clan.clanId = 12;
    none.run('GetClanRoster');
    await flush();
    expect(cellsOf(none.value(CLAN_ROSTER_VAR))[0]?.[6]).toEqual({ type: 'int', value: 0 });
  });

  it('a row of position -1 takes my position\'s medal (FUN_002eaee0 D:L188943-188945, DAT_0044f7f8 through ladderPosition; the review\'s F2)', async () => {
    const r = rows({ roster: roster(member(1, 'a', { ladderPosition: -1 }), member(2, 'b', { ladderPosition: 5 })) }, { total: 100, position: 50 });
    r.clan.clanId = 12;
    r.run('GetClanRoster');
    await flush();
    const list = r.value(CLAN_ROSTER_VAR)!;
    expect(list.type === 'array' && list.value.map((x) => (x.type === 'array' ? [x.value[4], x.value[6]] : null))).toEqual([
      [str('-1'), { type: 'int', value: 2 }], [str('5'), { type: 'int', value: 5 }],
    ]);
  });

  it('a roster reply after the ticket changed, or to an older request, is dropped (CLAN_ROSTER_TICKET_ADAPTATION)', async () => {
    let ticket: string | null = 'a';
    const r = rows({ roster: roster(member(1, 'a')), hold: true }, { ticket: () => ticket });
    r.clan.clanId = 12;
    r.run('GetClanRoster');
    ticket = 'b';
    r.release();
    await flush();
    expect(r.clan.roster).toEqual([]);
    r.run('GetClanRoster');
    r.run('GetClanRoster');
    r.pending.shift()!();
    await flush();
    expect(r.clan.roster).toEqual([]);
    r.release();
    await flush();
    expect(r.clan.roster.map((m) => m.name)).toEqual(['a']);
  });
});

describe('IsLeaderOfClan by name or id (FUN_002e67d0 over FUN_002e9460), IsMemberOfClan, GetClanMemberInfo', () => {
  it('a roster row named, or whose account the name\'s strtol is, compared with the leader; no such row, the session\'s own', () => {
    const r = rows();
    r.clan.clanId = 12; r.clan.leader = 8; r.clan.self = 7;
    r.clan.roster.push(rosterMemberOf(member(7, 'socomc')), rosterMemberOf(member(8, 'Bob')));
    expect([r.run('IsLeaderOfClan', 'bob'), r.run('IsLeaderOfClan', '8'), r.run('IsLeaderOfClan', '7'), r.run('IsLeaderOfClan', 'NA'), r.run('IsMemberOfClan')]).toEqual([true, true, false, false, true]);
    r.clan.leader = 'mine';                                                                // the create's mark
    expect([r.run('IsLeaderOfClan', '7'), r.run('IsLeaderOfClan', '8'), r.run('IsLeaderOfClan', 'NA')]).toEqual([true, false, true]);
  });

  it('IsLeaderOfClan(INPUT_STRING) reads the running animation\'s input string (FUN_00272480)', () => {
    const clan = new LobbyClan();
    clan.leader = 8;
    clan.roster.push(rosterMemberOf(member(8, 'bob')));
    const c = new ManageRosterCommands({ uiVars: new UiVarManager(), clan, inputString: () => '8' });
    expect(c.IsLeaderOfClan(cmd('IsLeaderOfClan', 'INPUT_STRING', 'DoSomething'), {} as never, undefined)).toBe(true);
  });

  it('GetClanMemberInfo (FUN_00279a20 -> FUN_002e6000): the roster looked up, nothing kept or sent; 1', () => {
    const r = rows();
    r.clan.roster.push(rosterMemberOf(member(8, 'bob')));
    expect([r.run('GetClanMemberInfo', 'bob'), r.run('GetClanMemberInfo', 'INPUT_STRING'), r.requests, r.events]).toEqual([true, true, [], []]);
  });
});

describe('a new login in the same page session (the review\'s F1): the client\'s clan and the own id reset', () => {
  it('A leads, logs off; B (a member of A\'s clan) logs in: B is never the leader, and QuitClan never carries A\'s id -- the lobby\'s init (D:L182792-182795) and the login\'s DAT_0066a4f0', async () => {
    let ticket: string | null = 'A';
    let name = 'alice';
    const s = server({ clans: [mine({ leaderAccountId: 7, leaderAccountName: 'alice' })], roster: roster(member(7, 'alice'), member(8, 'bob')), hold: true });
    const clan = new LobbyClan();
    const c = new ManageRosterCommands({ uiVars: new UiVarManager(), clan, service: s.service, ticket: () => ticket, accountName: () => name });
    const run = (fn: 'GetClan' | 'IsLeaderOfClan' | 'IsMemberOfClan' | 'QuitClan'): boolean => c.entries()[fn](cmd(fn), {} as never, undefined);
    run('GetClan');
    s.release();
    await flush();
    s.release();                                                                               // and the roster's reply
    await flush();
    expect([clan.self, clan.leader, run('IsLeaderOfClan')]).toEqual([7, 7, true]);           // A is the leader
    ticket = null; name = '';                                                                  // A logs off
    ticket = 'B'; name = 'bob';                                                                // B logs in on the same page
    expect([run('IsMemberOfClan'), run('IsLeaderOfClan'), clan.self, clan.roster]).toEqual([false, false, null, []]);   // reset at the new session's first clan row
    run('GetClan');
    s.release();                                                                               // GetMyClans' reply: A's clan, A its leader
    await flush();
    expect([clan.member, clan.self, run('IsLeaderOfClan')]).toEqual([true, null, false]);    // not B's: the reply names A
    const before = s.requests.filter((q) => q.op === 'remove').length;
    run('QuitClan');
    expect(s.requests.filter((q) => q.op === 'remove').length).toBe(before);                  // B's id unknown yet: nothing sent, never A's
    s.release();                                                                               // the roster's reply: B's row gives B's id
    await flush();
    expect([clan.self, run('IsLeaderOfClan')]).toEqual([8, false]);
    run('QuitClan');
    expect(s.requests.filter((q) => q.op === 'remove').map((q) => q.body)).toEqual([{ playerAccountId: 8, clanId: 12 }]);
  });
});

describe('QuitClan (FUN_002e8ef0, FUN_002e8f70)', () => {
  it('only with the session up (no state test): RemovePlayerFromClan with the session\'s own account and the clan; its success clears the clan -- the variables, "No clan messages.", the roster drawn empty', async () => {
    const r = rows({}, { lobbyState: 3 });
    r.clan.clanId = 12; r.clan.leader = 8; r.clan.name = 'Tide'; r.clan.self = 7;
    r.clan.roster.push(rosterMemberOf(member(7, 'socomc')));
    r.uiVars.set(r.uiVars.add(MEDIUS_CLAN_MESSAGES_VAR, null, 1), str('old'));
    expect(r.run('QuitClan', 'NA', 'leave_clan')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'remove', body: { playerAccountId: 7, clanId: 12 } }]);
    expect([r.clan.member, r.clan.leader, r.clan.name, r.clan.roster, r.value('CLANNAMEVAR'), r.value('Clan_Description'), r.value(MEDIUS_CLAN_MESSAGES_VAR), r.value(CLAN_ROSTER_VAR)]).toEqual([
      false, -1, '', [], str(''), str(''), str(NO_CLAN_MESSAGES), { type: 'array', value: [] },
    ]);
  });

  it('a refused quit changes nothing; the session down, or its own id unknown (CLAN_SELF_BY_NAME_ADAPTATION), sends nothing', async () => {
    const r = rows({ removeStatus: -951 });
    r.clan.clanId = 12; r.clan.self = 7;
    r.run('QuitClan');
    await flush();
    expect([r.requests.length, r.clan.member]).toEqual([1, true]);
    const down = rows({}, { lobbyUp: false });
    down.clan.clanId = 12; down.clan.self = 7;
    const unknown = rows();
    unknown.clan.clanId = 12;
    expect([down.run('QuitClan'), down.requests, unknown.run('QuitClan'), unknown.requests]).toEqual([true, [], true, []]);
  });
});

// ---- the pages over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const help = (r: Rig): string => r.text('DescriptionText').join(' ');

/** SOCOM II ONLINE past SERVER NEWS with the clan's rows over the fake: GetMyClans answers `clans`, the roster `roster`. */
async function world(o: Parameters<typeof server>[0] & { messages?: string[] } = {}) {
  const s = server(o);
  let w!: WorldOfSocomCommands;
  let c!: ManageRosterCommands;
  let band: ClanMessagesCommands | null = null;
  const playerInfo: unknown[] = [];
  const r = worldRig({
    name: 'socomc', announcement: '', accountName: 'socomc', roster: s.service, clanMessages: { myClanMessages: () => { band?.myClanMessages(); } },
    ladder: {
      position: () => Promise.resolve({ status: 1, ladderPosition: 0, totalRankings: 0 }),
      list: () => Promise.resolve([{ status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: { ...OFFLINE }, endOfList: true }]),
      playerInfo: (q) => { playerInfo.push(q); return new Promise(() => {}); },
    },
    register: (host, ctx) => {
      w = ctx.world()!;
      c = ctx.roster()!;
      band = new ClanMessagesCommands({
        uiVars: ctx.uiVars, clan: w.clan, service: {
          myMessages: () => Promise.resolve((o.messages ?? []).map((m, i, a) => ({ status: 0, clanId: 12, message: m, endOfList: i === a.length - 1 }))),
          allMessages: () => Promise.resolve([{ status: 1, clanMessageId: 0, message: '', clanMessageStatus: 0, endOfList: true }]),
          send: () => new Promise(() => {}), modify: () => new Promise(() => {}), delete: () => new Promise(() => {}),
        },
      });
      band.register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  await r.settle(10);
  return { r, ...s, world: () => w, roster: () => c, playerInfo };
}

/** The CLAN row's CROSS, run to the build of `dialog`. */
async function clanRow(r: Rig, dialog: string): Promise<void> {
  go(r, 'ClanManage');
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== dialog; i++) await r.settle(1);
  await r.settle(SETTLED);
}

const MEMBERS = (): ClanRosterEntry[] => roster(
  member(99, 'Boss', { ladderPosition: 2, onlineState: { connectStatus: 2, lobbyWorldId: 3, gameWorldId: -1, lobbyName: 'Room A', gameName: '' } }),
  member(7, 'socomc', { ladderPosition: 4 }),
);

describe.skipIf(!HAVE)(`SOCOM II ONLINE and the member's roster over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('SOCOM II ONLINE\'s arrival asks GetMyClans; a member\'s CLAN row is the member\'s (ClanManageAct) and its CROSS opens dlgManageRoster.rdr', async () => {
    const { r, requests } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    expect(requests[0]).toEqual({ op: 'my-clans', body: { start: 1, pageSize: 999 } });
    expect(r.text('playername')).toEqual(['socomc']);                                    // no tag: "%s" of the name (S:0x3f43b8)
    go(r, 'ClanManage');
    expect(help(r)).not.toBe('¦ Create a clan.');
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER; i++) await r.settle(1);
    expect(r.current()).toBe(MANAGE_ROSTER);
  });

  it('the leader\'s CLAN row opens dlgManageRosterLeader.rdr; no clan, CREATE CLAN', async () => {
    const lead = await world({ clans: [mine()], roster: MEMBERS() });
    await clanRow(lead.r, MANAGE_ROSTER_LEADER);
    expect(lead.r.current()).toBe(MANAGE_ROSTER_LEADER);
    const none = await world();
    await clanRow(none.r, 'dlgCreateClan.rdr');
    expect(none.r.current()).toBe('dlgCreateClan.rdr');
  });

  it('the member\'s roster ONSTART (OnMRosterStart): the list disabled, LEAVE CLAN enabled and active; GetClanRoster, GetClanMessages, GetClan; the title, the column heads, the clan\'s name, the rating 0 and the rows', async () => {
    const { r, requests } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS(), messages: ['Hi'] });
    const from = r.outcomes.length;
    await clanRow(r, MANAGE_ROSTER);
    const calls = r.calls(MANAGE_ROSTER, from);
    expect(calls).toEqual(expect.arrayContaining(['DisableButton(RosterList) table', 'EnableButton(LeaveClan) table', 'ActivateButton(LeaveClan) table', 'GetClanRoster(NA) table', 'GetClanMessages(NA) table', 'GetClan(NA) table']));
    expect(r.focused()).toBe('LeaveClan');
    expect(help(r)).toBe(loc(r, 468));
    expect(r.text('bar_title')).toEqual(['CLAN ROSTER:']);
    expect(r.text('txtClanName')).toEqual(['Tide']);
    expect([r.text('clanrating'), r.text('txtClanRating')]).toEqual([[loc(r, 462)], ['0']]);
    expect([464, 316, 465, 466, 467].map((id) => loc(r, id))).toEqual(['RANK', 'ONLINE', 'MEDAL', 'MEMBER', 'POSITION']);
    const items = listbox(r, 'RosterList').items.map((i) => [i.captions[1], i.captions[2], i.captions[4], i.captions[5]]);
    expect(items).toEqual([['Boss', '\xa7', '2', '(Leader)'], ['socomc', '\xaa', '4', ' ']]);
    expect(requests.filter((q) => q.op === 'roster').length).toBeGreaterThanOrEqual(2);       // GetMyClans' success, then the page's ONSTART
  });

  it('LEAVE CLAN (leave_clan): #473 NO / YES -- NO says #389; YES sends the quit with the session\'s own account, says #474 and returns to SOCOM II ONLINE, the clan forgotten', async () => {
    const a = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(a.r, MANAGE_ROSTER);
    a.r.press('CROSS', 10);
    expect([a.r.shown(), popupText(a.r), loc(a.r, 246), loc(a.r, 253)]).toEqual([true, loc(a.r, 473), 'NO', 'YES']);
    a.r.press('CROSS', 10);
    expect(popupText(a.r)).toBe(loc(a.r, 389));
    const b = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(b.r, MANAGE_ROSTER);
    b.r.press('CROSS', 10);
    b.r.press('RIGHT', 6);
    b.r.press('CROSS', 4);
    await b.r.settle(4);
    expect(b.requests.filter((q) => q.op === 'remove')).toEqual([{ op: 'remove', body: { playerAccountId: 7, clanId: 12 } }]);
    expect(popupText(b.r)).toBe(loc(b.r, 474));
    for (let i = 0; i < 200 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect([b.r.current(), b.world().clan.member]).toEqual([WORLD, false]);
  });

  it('VIEW INFO (#471): its CROSS activates the list (#472); a row\'s CROSS runs playerinfo_activate -- GetPlayerInfo of the row\'s key, the account id, origin CLAN', async () => {
    const { r, playerInfo } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(r, MANAGE_ROSTER);
    go(r, 'ViewInfo');
    expect(help(r)).toBe(loc(r, 471));
    r.press('CROSS', 6);
    expect([r.focused(), help(r)]).toEqual(['RosterList', loc(r, 472)]);
    r.press('CROSS', 10);
    await r.settle(4);
    expect(playerInfo).toEqual([{ accountId: 99 }]);
  });

  it('MP_CLAN_DISBANDED: GetClan at the ONSTART answered with no clan for a member -- #470, then SOCOM II ONLINE', async () => {
    const s = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    s.answers.clans = [NO_CLAN];                                                         // the leader disbands meanwhile
    await clanRow(s.r, MANAGE_ROSTER);
    await s.r.settle(20);
    expect([s.r.shown(), popupText(s.r)]).toEqual([true, loc(s.r, 470)]);
    s.r.press('CROSS', 10);
    for (let i = 0; i < 200 && s.r.current() !== WORLD; i++) await s.r.settle(1);
    expect(s.r.current()).toBe(WORLD);
  });

  it('MP_MEDIUS_BECAME_LEADER: GetClan at the ONSTART answered with this account the leader -- #469, then the leader\'s roster', async () => {
    const s = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    s.answers.clans = [mine({ leaderAccountId: 7, leaderAccountName: 'socomc' })];      // the leader appoints this account meanwhile
    await clanRow(s.r, MANAGE_ROSTER);
    await s.r.settle(20);
    expect([s.r.shown(), popupText(s.r)]).toEqual([true, loc(s.r, 469)]);
    s.r.press('CROSS', 10);
    for (let i = 0; i < 200 && s.r.current() !== MANAGE_ROSTER_LEADER; i++) await s.r.settle(1);
    expect(s.r.current()).toBe(MANAGE_ROSTER_LEADER);
  });

  it('TRIANGLE (goto_menu) and RETURN (#322, check_then_save_and_leave) go back to SOCOM II ONLINE', async () => {
    const a = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(a.r, MANAGE_ROSTER);
    a.r.press('TRIANGLE', 4);
    for (let i = 0; i < 200 && a.r.current() !== WORLD; i++) await a.r.settle(1);
    expect(a.r.current()).toBe(WORLD);
    const b = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(b.r, MANAGE_ROSTER);
    go(b.r, 'return');
    expect(help(b.r)).toBe(loc(b.r, 322));
    b.r.press('CROSS', 4);
    for (let i = 0; i < 200 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect(b.r.current()).toBe(WORLD);
  });

  it('the MESSAGES band is asked by GetMyClans\' success: the clan\'s messages under #775', async () => {
    const { r } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS(), messages: ['Raid at nine.'] });
    expect(r.uiVars.find(MEDIUS_CLAN_MESSAGES_VAR)!.value).toEqual({ type: 'array', value: [str('\n'), str('Raid at nine.')] });
  });

  it('RESPOND TO INVITES\' member branch (ONL-28\'s owed, research 273 §6 item 3): GetMyClans told the client the clan, so OnRespondStart enables and activates LEAVE CLAN', async () => {
    const { r } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await r.switchTo(RESPOND_TO_INVITES);
    await r.settle(SETTLED);
    const calls = r.calls(RESPOND_TO_INVITES);
    expect(calls).toEqual(expect.arrayContaining(['IsLeaderOfClan(NA) table', 'IsMemberOfClan(NA) table', 'EnableButton(LeaveClan) table', 'ActivateButton(LeaveClan) table']));
    expect(calls).not.toContain('DisableButton(LeaveClan) table');
  });

  it('RESPOND TO INVITES\' leader branch: LEAVE CLAN disabled, IsMemberOfClan not asked', async () => {
    const { r } = await world({ clans: [mine()], roster: MEMBERS() });
    await r.switchTo(RESPOND_TO_INVITES);
    await r.settle(SETTLED);
    expect(r.calls(RESPOND_TO_INVITES)).toEqual(expect.arrayContaining(['IsLeaderOfClan(NA) table', 'DisableButton(LeaveClan) table']));
    expect(r.calls(RESPOND_TO_INVITES)).not.toContain('IsMemberOfClan(NA) table');
  });

  // CLAN-DOT (web sprint 41, the owner's "not centered in their row"; research 272): the ONLINE column (#316) is the
  // layout's third text column -- POSITION 57, TOP_OFFSET 6 and its own SCALE 1.2 over the list's 0.8 (loadDialog of
  // dlgManageRoster.rdr). The row's draw `FUN_0037ab90` places the cell (D:L273841) and, the column's +0x18 not 0
  // (D:L273892), calls the text content's vtable +0x28 (0x407b68 -> 0x37adf0) with that SCALE in $f12 (lwc1 $f12, 0x18 at
  // ELF 0x37ad88): `lw v1, 4(a0); jr ra; swc1 $f12, 0x40(v1)` -- the cell's text scale (+0x40) is the column's, at every
  // draw. The glyph's quads are the face's layout at the cell's place in the column's SCALE, not the list's.
  it('CLAN-DOT: the ONLINE glyph is drawn at its column\'s own SCALE (1.2), not the list\'s (0.8) -- FUN_0037ab90 D:L273892-273893, 0x37adf0', async () => {
    const { r } = await world({ clans: [mine({ leaderAccountId: 99, leaderAccountName: 'Boss' })], roster: MEMBERS() });
    await clanRow(r, MANAGE_ROSTER);
    const l = listbox(r, 'RosterList');
    const col = l.spec.columns[2]!;
    expect([col.kind, col.position, col.topOffset]).toEqual([1, 57, 6]);
    expect([col.scale, l.spec.scale].map((s) => Math.round(s * 10) / 10)).toEqual([1.2, 0.8]);
    const drawn = l.draw(176, 105, 1).filter((i): i is Extract<UiDrawItem, { kind: 'glyphs' }> => i.kind === 'glyphs')
      .map((g) => g.quads.filter((q) => !q.shadow).map((q) => [q.left, q.top, q.right, q.bottom]));
    const at = (item: number, scale: number) => {
      const cell = l.placed.cells.find((c) => c.item === item && c.column === 2)!;
      return layoutText(l.face!, l.items[item]!.codes[2]!, cell.x, cell.y, { scale, color: [128, 128, 128], alpha: 128 }).quads
        .filter((q) => !q.shadow).map((q) => [q.left, q.top, q.right, q.bottom]);
    };
    expect(l.items.map((it) => it.captions[2])).toEqual([ROSTER_ONLINE_GLYPH.online, ROSTER_ONLINE_GLYPH.offline]);
    for (const item of [0, 1]) {
      expect(at(item, col.scale)).not.toEqual(at(item, l.spec.scale));
      expect(drawn).toContainEqual(at(item, col.scale));
    }
  });
});

describe('the no-clan answer of the rig\'s default service (Horizon\'s NoResult): the foot is the name', () => {
  it.skipIf(!HAVE)('PLAYER_NAME_AND_TAG "socomc" after the arrival', async () => {
    const r = worldRig({ name: 'socomc', announcement: '' });
    await r.settle(SETTLED);
    expect(r.uiVars.find(PLAYER_NAME_AND_TAG_VAR)!.value).toEqual(str('socomc'));
    expect(r.uiVars.find(MEDIUS_CLAN_MESSAGES_VAR)!.value).toEqual(str(''));
  });
});
