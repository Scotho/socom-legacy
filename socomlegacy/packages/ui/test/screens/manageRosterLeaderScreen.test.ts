import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiCommandHost, UI_COMMAND_TABLE, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { lobbyEventInto } from '../../src/screens/connectCommands';
import { CLAN_LADDER_POST_PLACEHOLDER, LobbyClan, MANAGE_ROSTER_LEADER, playerNameAndTag } from '../../src/screens/createClanCommands';
import { MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES } from '../../src/screens/clanMessagesCommands';
import { CLAN_RATING_VAR, CLAN_ROSTER_VAR, MANAGE_ROSTER, ManageRosterCommands, rosterMemberOf, type ClanRosterEntry, type MyClansReply } from '../../src/screens/manageRosterCommands';
import {
  CLAN_DISBAND_ERROR_FORMAT, LEADER_CANNOT_REMOVE_SELF_TEXT, MANAGE_ROSTER_LEADER_COMMAND_ROWS, MEDIUS_STATUS_TEXT_UNKNOWN, ManageRosterLeaderCommands, clanDisbandErrorText,
  mediusStatusText, type ManageRosterLeaderService,
} from '../../src/screens/manageRosterLeaderCommands';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-27 (web research 272): the leader's roster (`dlgManageRosterLeader.rdr`) and its four rows of PLAT-08's table --
 * `RemovePlayerFromClan` (ELF 0x27a840 -> `FUN_002e7450` D:L186901-186943, its reply `FUN_002e7580` D:L186946-186967),
 * `TransferLeadership` (ELF 0x277430 -> `FUN_002e81b0` D:L187372-187410, its reply `FUN_002e82a0` D:L187413-187431),
 * `DisbandClan` (ELF 0x27a920 -> `FUN_002e6850` D:L186500-186518, its reply `FUN_002e68e0` D:L186521-186554) and
 * `UpdateClanStats` (`FUN_00277610` -> `FUN_002e7d70` D:L187223-187252, its reply `FUN_002e7e70` D:L187255-187282, the
 * ladder step `FUN_002e7f50` D:L187285-187328) -- over SVC-08's TransferClanLeadership, DisbandClan and UpdateClanStats
 * and SVC-09's RemovePlayerFromClan.
 * - The rows off the machine, over the service's fake.
 * - The page over the machine, built from the disc's layout and set (or the committed fixtures): reached by the leader's
 *   CLAN row; its ONSTART; REMOVE PLAYERS (#487, #495, #492, #493, the literal refusal of one's own row), APPOINT LEADER
 *   (#490, #496, #491, the switch to the member's roster), DISBAND CLAN (#488, #500, #501, the failure's text, the switch),
 *   CLAN TAG (#489, the keyboard `MPPLAYERNAME` #499 3 / 15, the tag posted, the foot), VIEW INFO, RETURN.
 * Synthetic answers; nothing measured on the original running (ONL-32's capture is the proven level).
 */

const SETTLED = 60;
const E = DIALOG_EVENTS;
const cmd = (fn: string, arg = 'NA', anim = 'DoSomething'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const str = (value: string): UiVarValue => ({ type: 'string', value });
const ascii = (b: Uint8Array): string => { const end = b.indexOf(0); return String.fromCharCode(...b.subarray(0, end < 0 ? b.length : end)); };
const OFFLINE = { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' };
const member = (accountId: number, accountName: string, o: Partial<ClanRosterEntry> = {}): ClanRosterEntry => ({
  status: 0, accountId, accountName, stats: '00'.repeat(256), onlineState: { ...OFFLINE }, ladderStat: 0, ladderPosition: 1, totalRankings: 0, endOfList: false, ...o,
});
const roster = (...rows: ClanRosterEntry[]): ClanRosterEntry[] => rows.map((r, i) => ({ ...r, endOfList: i === rows.length - 1 }));
const MEMBERS = (): ClanRosterEntry[] => roster(member(7, 'socomc', { ladderPosition: 2 }), member(8, 'bob', { ladderPosition: 5 }), member(9, 'carol', { ladderPosition: 9 }));

/** A server over the leader's calls. */
function server(o: { removeStatus?: number; transferStatus?: number; disbandStatus?: number; statsStatus?: number } = {}) {
  const requests: { op: string; body: unknown }[] = [];
  const service: ManageRosterLeaderService = {
    remove: (q) => { requests.push({ op: 'remove', body: q }); return Promise.resolve({ status: o.removeStatus ?? 0 }); },
    transferLeadership: (q) => { requests.push({ op: 'transfer-leadership', body: q }); return Promise.resolve({ status: o.transferStatus ?? 0 }); },
    disband: (q) => { requests.push({ op: 'disband', body: q }); return Promise.resolve({ status: o.disbandStatus ?? 0 }); },
    updateStats: (q) => { requests.push({ op: 'update-stats', body: { clanId: q.clanId, stats: ascii(q.stats), length: q.stats.length } }); return Promise.resolve({ status: o.statsStatus ?? 0 }); },
  };
  return { service, requests };
}

function rows(o: Parameters<typeof server>[0] = {}, extra: { lobbyUp?: boolean; lobbyState?: number; ticket?: () => string | null; input?: string | null } = {}) {
  const s = server(o);
  const uiVars = new UiVarManager();
  const clan = new LobbyClan();
  clan.clanId = 12; clan.leader = 7; clan.self = 7; clan.name = 'Tide';
  clan.roster.push(...MEMBERS().map(rosterMemberOf));
  const events: [number, string | null][] = [];
  const asked: string[] = [];
  const base = new ManageRosterCommands({ uiVars, clan, service: { myClans: () => new Promise(() => {}), roster: (q) => { asked.push(`roster ${q.clanId}`); return new Promise(() => {}); }, remove: () => new Promise(() => {}) } });
  const c = new ManageRosterLeaderCommands({
    uiVars, clan, roster: base, service: s.service, event: (kind, text) => { events.push([kind, text]); }, ticket: extra.ticket, accountName: () => 'socomc',
    inputString: () => (extra.input === undefined ? '8' : extra.input),
    ...(extra.lobbyUp !== undefined ? { lobbyUp: () => extra.lobbyUp! } : {}), ...(extra.lobbyState !== undefined ? { lobbyState: () => extra.lobbyState! } : {}),
  });
  const run = (fn: keyof ReturnType<ManageRosterLeaderCommands['entries']>, arg = 'NA'): boolean => c.entries()[fn](cmd(fn, arg), {} as never, undefined);
  const value = (n: string): UiVarValue | undefined => uiVars.find(n)?.value;
  return { ...s, uiVars, clan, events, asked, c, run, value };
}

describe('the rows (PLAT-08\'s table: RemovePlayerFromClan, TransferLeadership, DisbandClan, UpdateClanStats -- ONL-27\'s)', () => {
  it('are the table\'s, by id, function and task; registered by name, each answers 1', () => {
    expect(MANAGE_ROSTER_LEADER_COMMAND_ROWS.map((r) => `${r.id} ${r.name} ${r.fn.toString(16)} ${r.task}`)).toEqual([
      '78 RemovePlayerFromClan 27a840 ONL-27', '115 TransferLeadership 277430 ONL-27', '51 DisbandClan 27a920 ONL-27', '102 UpdateClanStats 277610 ONL-27',
    ]);
    for (const r of MANAGE_ROSTER_LEADER_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.id, t.fn, t.task, t.answer], r.name).toEqual([r.id, r.fn, r.task, true]);
      expect(UI_COMMAND_TABLE[t.index]!.name).toBe(r.name);
    }
    const host = new UiCommandHost();
    rows().c.register(host);
    for (const r of MANAGE_ROSTER_LEADER_COMMAND_ROWS) expect(host.dispatch(cmd(r.name)).kind, r.name).toBe('table');
  });

  it('FUN_002f4300\'s status names (S:0x3f4fd0-0x3f55c0) and the disband\'s error "Clan Disband Error: %s" (S:0x3f3fa0)', () => {
    expect([mediusStatusText(0), mediusStatusText(1), mediusStatusText(4), mediusStatusText(-954), mediusStatusText(-966), mediusStatusText(-971), mediusStatusText(-990), mediusStatusText(-1000)]).toEqual([
      'MediusSuccess', 'MediusNoResult', 'MediusPass', 'MediusIncompatibleAppID', 'MediusFail', 'MediusClanNotFound', 'MediusNotClanLeader', 'MediusBeginSessionFailed',
    ]);
    expect([mediusStatusText(5), mediusStatusText(-1001), MEDIUS_STATUS_TEXT_UNKNOWN]).toEqual(['Unknown/Invalid Medius Status Code', 'Unknown/Invalid Medius Status Code', 'Unknown/Invalid Medius Status Code']);
    expect([CLAN_DISBAND_ERROR_FORMAT, clanDisbandErrorText(-990)]).toEqual(['Clan Disband Error: %s', 'Clan Disband Error: MediusNotClanLeader']);
    expect(LEADER_CANNOT_REMOVE_SELF_TEXT).toBe('You are the leader of this clan, you cannot remove yourself.');
  });
});

describe('RemovePlayerFromClan (ELF 0x27a840 -> FUN_002e7450, FUN_002e7580)', () => {
  it('the running animation\'s input string, not the argument: the row of that name or id -- the request with its account and the clan; MP_SUCCESS and the roster asked again', async () => {
    const r = rows({}, { input: '8' });
    expect(r.run('RemovePlayerFromClan', 'NA')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'remove', body: { playerAccountId: 8, clanId: 12 } }]);
    expect([r.events, r.asked]).toEqual([[[E['MP_SUCCESS'], null]], ['roster 12']]);
    expect(r.clan.roster).toEqual([]);                                                  // FUN_002e69f0 empties it at the request
  });

  it('no such row: MP_PLAYER_NOT_FOUND; the session\'s own row: MP_PLAYER_IS_LEADER; a refusal: MP_PLAYER_NOT_FOUND; the session down: nothing -- 1 each', async () => {
    const none = rows({}, { input: 'nobody' });
    expect(none.run('RemovePlayerFromClan')).toBe(true);
    const self = rows({}, { input: 'SOCOMC' });
    self.run('RemovePlayerFromClan');
    const refused = rows({ removeStatus: -990 }, { input: 'bob' });
    refused.run('RemovePlayerFromClan');
    await flush();
    const down = rows({}, { lobbyState: 3 });
    expect(down.run('RemovePlayerFromClan')).toBe(true);
    expect([none.events, none.requests, self.events, self.requests, refused.events, down.events, down.requests]).toEqual([
      [[E['MP_PLAYER_NOT_FOUND'], null]], [], [[E['MP_PLAYER_IS_LEADER'], null]], [], [[E['MP_PLAYER_NOT_FOUND'], null]], [], [],
    ]);
  });
});

describe('TransferLeadership (ELF 0x277430 -> FUN_002e81b0, FUN_002e82a0)', () => {
  it('the argument, INPUT_STRING replaced: the row\'s account and name sent, with no check of the session; MP_LEADERSHIP_TRANSFER_SUCCESS; the client\'s leader left as it was', async () => {
    const r = rows({}, { input: '9', lobbyUp: false });
    expect(r.run('TransferLeadership', 'INPUT_STRING')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'transfer-leadership', body: { newLeaderAccountId: 9, newLeaderAccountName: 'carol' } }]);
    expect([r.events, r.clan.leader]).toEqual([[[E['MP_LEADERSHIP_TRANSFER_SUCCESS'], null]], 7]);
  });

  it('an empty name or no such row: MP_PLAYER_NOT_FOUND, nothing sent; a refusal: MP_PLAYER_NOT_FOUND', async () => {
    const empty = rows({}, { input: '' });
    empty.run('TransferLeadership', 'INPUT_STRING');
    const none = rows({}, { input: 'nobody' });
    none.run('TransferLeadership', 'INPUT_STRING');
    const refused = rows({ transferStatus: -966 }, { input: 'bob' });
    refused.run('TransferLeadership', 'INPUT_STRING');
    await flush();
    expect([empty.events, empty.requests, none.events, none.requests, refused.events]).toEqual([
      [[E['MP_PLAYER_NOT_FOUND'], null]], [], [[E['MP_PLAYER_NOT_FOUND'], null]], [], [[E['MP_PLAYER_NOT_FOUND'], null]],
    ]);
  });
});

describe('DisbandClan (ELF 0x27a920 -> FUN_002e6850, FUN_002e68e0)', () => {
  it('only online: the clan id sent; its success -- CLANNAMEVAR "", Clan_Description " ", "No clan messages.", the roster drawn empty, the ids -1 and the name zeroed --, then MP_DISBAND_CLAN_SUCCESS', async () => {
    const r = rows();
    expect(r.run('DisbandClan')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'disband', body: { clanId: 12 } }]);
    expect([r.value('CLANNAMEVAR'), r.value('Clan_Description'), r.value(MEDIUS_CLAN_MESSAGES_VAR), r.value(CLAN_ROSTER_VAR), r.value(CLAN_RATING_VAR)]).toEqual([
      str(''), str(' '), str(NO_CLAN_MESSAGES), { type: 'array', value: [] }, { type: 'int', value: 0 },
    ]);
    expect([r.clan.member, r.clan.leader, r.clan.name, r.clan.roster, r.events]).toEqual([false, -1, '', [], [[E['MP_DISBAND_CLAN_SUCCESS'], null]]]);
    const down = rows({}, { lobbyUp: false });
    expect([down.run('DisbandClan'), down.requests]).toEqual([true, []]);
  });

  it('a refusal raises MP_DISBAND_CLAN_FAILURE with "Clan Disband Error: %s" of the status\'s name; the clan stands', async () => {
    const r = rows({ disbandStatus: -990 });
    r.run('DisbandClan');
    await flush();
    expect([r.events, r.clan.member]).toEqual([[[E['MP_DISBAND_CLAN_FAILURE'], 'Clan Disband Error: MediusNotClanLeader']], true]);
  });
});

describe('UpdateClanStats (FUN_00277610 -> FUN_002e7d70, FUN_002e7e70, FUN_002e7f50)', () => {
  it('with no check of the session: "%.3d%.12d%s" of 0, the rating and Clan_Description\'s text into 256 bytes, the clan id; its success writes PLAYER_NAME_AND_TAG; a refusal is silent', async () => {
    const r = rows({}, { lobbyUp: false });
    r.clan.rating = 25;
    r.uiVars.set(r.uiVars.add('Clan_Description', null, 2), str('TDE'));
    expect(r.run('UpdateClanStats')).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'update-stats', body: { clanId: 12, stats: '000000000000025TDE', length: 256 } }]);
    expect(r.value('PLAYER_NAME_AND_TAG')).toEqual(str(playerNameAndTag('TDE', 'socomc')));
    expect(r.uiVars.find('PLAYER_NAME_AND_TAG')!.longevity).toBe(2);
    const refused = rows({ statsStatus: -990 });
    refused.run('UpdateClanStats');
    await flush();
    expect(refused.value('PLAYER_NAME_AND_TAG')).toBeUndefined();
  });

  it('then FUN_002e7f50: the rating recomputed from the roster (0 under eight rows), the ladder post not sent (CLAN_LADDER_POST_PLACEHOLDER)', async () => {
    const r = rows();
    r.clan.rating = 25;
    r.run('UpdateClanStats');
    await flush();
    expect([r.clan.rating, CLAN_LADDER_POST_PLACEHOLDER]).toEqual([0, expect.stringMatching(/not sent/)]);
    expect((r.requests[0]!.body as { stats: string }).stats).toBe('000000000000025');   // the record carries the rating held before the step
  });

  it('a reply after the ticket changed acts on nothing (CLAN_ROSTER_TICKET_ADAPTATION)', async () => {
    let ticket: string | null = 'a';
    const r = rows({}, { ticket: () => ticket });
    r.run('DisbandClan');
    r.run('UpdateClanStats');
    ticket = 'b';
    await flush();
    expect([r.events, r.clan.member, r.value('PLAYER_NAME_AND_TAG')]).toEqual([[], true, undefined]);
  });
});

// ---- the page over the machine ----

type Rig = ReturnType<typeof worldRig>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 14 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const listbox = (r: Rig, name: string): ListboxWidget => r.parts.current!.widgets.get(name) as ListboxWidget;
const help = (r: Rig): string => r.text('DescriptionText').join(' ');
const MINE: MyClansReply = { status: 0, clanId: 12, clanName: 'Tide', leaderAccountId: 7, leaderAccountName: 'socomc', stats: '303030'.padEnd(512, '0'), endOfList: true };

/** SOCOM II ONLINE past SERVER NEWS, the leader's clan from GetMyClans, CLAN's CROSS to the leader's roster. */
async function leaderPage(o: Parameters<typeof server>[0] = {}) {
  const s = server(o);
  const requests: { op: string; body: unknown }[] = [];
  const r = worldRig({
    name: 'socomc', announcement: '', accountName: 'socomc', keyboard: true,
    roster: {
      myClans: (q) => { requests.push({ op: 'my-clans', body: q }); return Promise.resolve([MINE]); },
      roster: (q) => { requests.push({ op: 'roster', body: q }); return Promise.resolve(MEMBERS()); },
      remove: () => new Promise(() => {}),
    },
    register: (host, ctx) => {
      new ManageRosterLeaderCommands({
        uiVars: ctx.uiVars, clan: ctx.world()!.clan, roster: ctx.roster()!, service: s.service, event: lobbyEventInto(() => ctx.machine(), ctx.parts), accountName: () => 'socomc',
        inputString: (c) => ctx.machine().shell()?.inputString(c.anim) ?? null,
      }).register(host);
    },
  });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  await r.settle(10);
  go(r, 'ClanManage');
  const from = r.outcomes.length;
  r.press('CROSS', 2);
  for (let i = 0; i < 120 && r.current() !== MANAGE_ROSTER_LEADER; i++) await r.settle(1);
  await r.settle(SETTLED);
  return { r, ...s, clanRequests: requests, from };
}

/** A roster row's CROSS on the `n`th row (from 0) once the list is active. */
function pick(r: Rig, n: number): void {
  for (let i = 0; i < n; i++) r.press('DOWN', 6);
  r.press('CROSS', 10);
}

describe.skipIf(!HAVE)(`the leader's roster over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('reached by the leader\'s CLAN row; ONSTART -- find_invited_players, OnMRosterLeaderStart (EDIT NEWS active), MRosterLeaderStartData (the roster, the leader\'s messages, the news, the clan ranking); the title, the clan\'s name, the rating, the rows', async () => {
    const { r, from, clanRequests } = await leaderPage();
    const calls = r.calls(MANAGE_ROSTER_LEADER, from);
    const named = calls.map((c) => c.replace(/\(.*$/, ''));                             // ONL-28's and ONL-29's rows are not this rig's: by name
    expect(named).toEqual(expect.arrayContaining(['GetInvitedPlayers', 'GetClanRoster', 'GetLeaderMessages', 'GetMediusAnnouncements', 'GetClanRanking']));
    expect(calls).toContain('GetClanRoster(NA) table');
    expect(named.indexOf('GetClanRoster')).toBeLessThan(named.indexOf('GetLeaderMessages'));
    expect([r.focused(), help(r)]).toEqual(['EditNews', loc(r, 485)]);
    expect(r.text('bar_title')).toEqual(['MANAGE CLAN:']);
    expect(r.text('txtClanName')).toEqual(['Tide']);
    expect(r.text('txtClanRating')).toEqual(['0']);
    expect(listbox(r, 'RosterList').items.map((i) => [i.captions[1], i.captions[4], i.captions[5]])).toEqual([['socomc', '2', '(Leader)'], ['bob', '5', ' '], ['carol', '9', ' ']]);
    expect(clanRequests.filter((q) => q.op === 'roster').length).toBeGreaterThanOrEqual(2);
    expect([475, 476, 477, 478, 479, 480, 483].map((id) => loc(r, id))).toEqual(['EDIT NEWS', 'INVITATIONS', 'REMOVE PLAYERS', 'APPOINT LEADER', 'DISBAND CLAN', 'CLAN TAG', 'INVITED PLAYER']);
  });

  it('REMOVE PLAYERS (#487): its CROSS activates the roster (#495); a member\'s row asks #492 -- YES removes that account and says #493, NO says #389', async () => {
    const a = await leaderPage();
    go(a.r, 'removeplayers');
    expect(help(a.r)).toBe(loc(a.r, 487));
    a.r.press('CROSS', 6);
    expect([a.r.focused(), help(a.r)]).toEqual(['RosterList', loc(a.r, 495)]);
    pick(a.r, 1);
    expect([a.r.shown(), popupText(a.r)]).toEqual([true, loc(a.r, 492)]);
    a.r.press('RIGHT', 6);
    a.r.press('CROSS', 6);
    await a.r.settle(6);
    expect(a.requests).toEqual([{ op: 'remove', body: { playerAccountId: 8, clanId: 12 } }]);
    expect(help(a.r)).toBe(loc(a.r, 493));
    const b = await leaderPage();
    go(b.r, 'removeplayers');
    b.r.press('CROSS', 6);
    pick(b.r, 2);
    b.r.press('CROSS', 6);
    expect([popupText(b.r), b.requests]).toEqual([loc(b.r, 389), []]);
  });

  it('REMOVE PLAYERS on the leader\'s own row: the set\'s literal refusal with its "Continue" button, nothing sent', async () => {
    const { r, requests } = await leaderPage();
    go(r, 'removeplayers');
    r.press('CROSS', 6);
    pick(r, 0);
    expect([r.shown(), popupText(r), requests]).toEqual([true, LEADER_CANNOT_REMOVE_SELF_TEXT, []]);
  });

  it('APPOINT LEADER (#490, #496): a member\'s row asks #491 -- YES transfers to that account and MP_LEADERSHIP_TRANSFER_SUCCESS goes to the member\'s roster; the own row does nothing', async () => {
    const { r, requests } = await leaderPage();
    go(r, 'appointleader');
    expect(help(r)).toBe(loc(r, 490));
    r.press('CROSS', 6);
    expect(help(r)).toBe(loc(r, 496));
    pick(r, 2);
    expect([r.shown(), popupText(r)]).toEqual([true, loc(r, 491)]);
    r.press('RIGHT', 6);
    r.press('CROSS', 4);
    for (let i = 0; i < 200 && r.current() !== MANAGE_ROSTER; i++) await r.settle(1);
    expect(requests).toEqual([{ op: 'transfer-leadership', body: { newLeaderAccountId: 9, newLeaderAccountName: 'carol' } }]);
    expect(r.current()).toBe(MANAGE_ROSTER);
  });

  it('DISBAND CLAN (#488): #500 -- NO says #501; YES disbands and MP_DISBAND_CLAN_SUCCESS returns to SOCOM II ONLINE, the clan forgotten', async () => {
    const a = await leaderPage();
    go(a.r, 'disbandclan');
    expect(help(a.r)).toBe(loc(a.r, 488));
    a.r.press('CROSS', 10);
    expect(popupText(a.r)).toBe(loc(a.r, 500));
    a.r.press('CROSS', 10);
    expect([popupText(a.r), a.requests]).toEqual([loc(a.r, 501), []]);
    const b = await leaderPage();
    go(b.r, 'disbandclan');
    b.r.press('CROSS', 10);
    b.r.press('RIGHT', 6);
    b.r.press('CROSS', 4);
    for (let i = 0; i < 200 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect([b.requests, b.r.current()]).toEqual([[{ op: 'disband', body: { clanId: 12 } }], WORLD]);
  });

  it('a refused disband: MP_DISBAND_CLAN_FAILURE pops its text -- "Clan Disband Error: MediusNotClanLeader"', async () => {
    const { r } = await leaderPage({ disbandStatus: -990 });
    go(r, 'disbandclan');
    r.press('CROSS', 10);
    r.press('RIGHT', 6);
    r.press('CROSS', 4);
    await r.settle(20);
    expect([r.shown(), popupText(r), r.current()]).toEqual([true, 'Clan Disband Error: MediusNotClanLeader', MANAGE_ROSTER_LEADER]);
  });

  it('CLAN TAG (#489): the keyboard MPPLAYERNAME on Clan_Description, titled #499, 3 characters of 15 bytes; ENTER posts the stats with the tag and the foot reads "[tag] name"', async () => {
    const { r, requests } = await leaderPage();
    go(r, 'SetTag');
    expect(help(r)).toBe(loc(r, 489));
    r.press('CROSS', 6);
    const req = r.skb!.keyboard.request!;
    expect([r.skb!.keyboard.isOpen, req.skbName, req.purpose, req.maxChars, req.maxBytes, req.uiVar]).toEqual([true, 'MPPLAYERNAME', '_499_EnterTextTag_MSG', 3, 15, 'Clan_Description']);
    expect(loc(r, 499)).toBe('Enter the Text for Your Clan Tag.');
    r.type('TDEX');
    await r.settle(60);
    expect(requests).toEqual([{ op: 'update-stats', body: { clanId: 12, stats: '000000000000000TDE', length: 256 } }]);
    expect(r.uiVars.find('PLAYER_NAME_AND_TAG')!.value).toEqual(str(playerNameAndTag('TDE', 'socomc')));
  });

  it('VIEW INFO (#471) activates the roster (#472); RETURN (#322) and TRIANGLE go back to SOCOM II ONLINE', async () => {
    const a = await leaderPage();
    go(a.r, 'ViewInfo');
    expect(help(a.r)).toBe(loc(a.r, 471));
    a.r.press('CROSS', 6);
    expect(help(a.r)).toBe(loc(a.r, 472));
    const b = await leaderPage();
    go(b.r, 'return');
    expect(help(b.r)).toBe(loc(b.r, 322));
    b.r.press('CROSS', 4);
    for (let i = 0; i < 200 && b.r.current() !== WORLD; i++) await b.r.settle(1);
    expect(b.r.current()).toBe(WORLD);
  });
});
