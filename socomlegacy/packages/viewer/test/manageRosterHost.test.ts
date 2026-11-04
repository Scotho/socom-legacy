import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LobbyClan, UiCommandHost, UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { MANAGE_ROSTER_SESSION_LOST, connectManageRoster, fetchManageRosterService, myClansOf, rosterEntriesOf, sessionManageRoster } from '../src/manageRosterHost';

/**
 * ONL-27's page half (web research 272 §4): the clan's roster requests -- SVC-08's `/clan/my-clans`, `/clan/roster`,
 * `/clan/transfer-leadership`, `/clan/disband`, `/clan/update-stats` and SVC-09's `/clan/remove`
 * (`packages/central/src/clans.ts`, `CLAN_PATHS`, `CLAN_MEMBERSHIP_PATHS`) -- at the page's own origin with the bearer; a
 * 401 the session lost, handed to the lobby client; any other refusal or shape a request never answered; no ticket, no
 * request. And the session's mount of `@s2u/ui`'s clan client and leader's rows over the client's clan.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const routed = (bodies: Record<string, unknown>, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); const p = new URL(url).pathname; return new Response(JSON.stringify(bodies[p] ?? {}), { status: p in bodies ? 200 : 404 }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const STATS = '00'.repeat(256);
/** SVC-08's MyClansReply (`clans.ts` `myClans`). */
const MINE = { status: 0, clanId: 12, applicationId: 10472, clanName: 'Tide', leaderAccountId: 7, leaderAccountName: 'socomc', stats: STATS, clanStatus: 0, endOfList: true };
const ONLINE = { connectStatus: 2, lobbyWorldId: 3, gameWorldId: -1, lobbyName: 'Room A', gameName: '' };
/** SVC-08's RosterEntry (`clans.ts` `roster`). */
const ROW = { status: 0, accountId: 7, accountName: 'socomc', stats: STATS, onlineState: ONLINE, ladderStat: 0, ladderPosition: 1, totalRankings: 0, endOfList: true };

describe('fetchManageRosterService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached; the stats as 512 hex digits', async () => {
    const calls: Call[] = [];
    const t = fetchManageRosterService('https://socom.example', routed({
      '/clan/my-clans': MINE, '/clan/roster': { entries: [ROW] }, '/clan/remove': { status: 0 }, '/clan/transfer-leadership': { status: 0 },
      '/clan/disband': { status: 0 }, '/clan/update-stats': { status: 0 },
    }, calls));
    const stats = new Uint8Array(256); stats.set([0x30, 0x41]);
    expect(await t.myClans({ start: 1, pageSize: 999 }, 'T1')).toEqual([{ status: 0, clanId: 12, clanName: 'Tide', leaderAccountId: 7, leaderAccountName: 'socomc', stats: STATS, endOfList: true }]);
    expect(await t.roster({ clanId: 12, ladderStatIndex: 0, sortOrder: 1 }, 'T1')).toEqual([ROW]);
    expect(await t.remove({ playerAccountId: 8, clanId: 12 }, 'T1')).toEqual({ status: 0 });
    expect(await t.transferLeadership({ newLeaderAccountId: 9, newLeaderAccountName: 'carol' }, 'T1')).toEqual({ status: 0 });
    expect(await t.disband({ clanId: 12 }, 'T1')).toEqual({ status: 0 });
    expect(await t.updateStats({ clanId: 12, stats }, 'T1')).toEqual({ status: 0 });
    expect(calls.map((c) => [new URL(c.url).pathname, c.init.method, (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['/clan/my-clans', 'POST', 'Bearer T1', 'omit', 'no-store'], ['/clan/roster', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['/clan/remove', 'POST', 'Bearer T1', 'omit', 'no-store'], ['/clan/transfer-leadership', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['/clan/disband', 'POST', 'Bearer T1', 'omit', 'no-store'], ['/clan/update-stats', 'POST', 'Bearer T1', 'omit', 'no-store'],
    ]);
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([
      { start: 1, pageSize: 999 }, { clanId: 12, ladderStatIndex: 0, sortOrder: 1 }, { playerAccountId: 8, clanId: 12 },
      { newLeaderAccountId: 9, newLeaderAccountName: 'carol' }, { clanId: 12 }, { clanId: 12, stats: `3041${'00'.repeat(254)}` },
    ]);
  });

  it('the replies checked field by field: another shape throws', () => {
    expect(myClansOf(MINE)).toHaveLength(1);
    expect(() => myClansOf({ ...MINE, clanName: 3 })).toThrow();
    expect(() => myClansOf({ ...MINE, endOfList: 'yes' })).toThrow();
    expect(rosterEntriesOf({ entries: [ROW] })).toEqual([ROW]);
    expect(() => rosterEntriesOf({ entries: [{ ...ROW, onlineState: { ...ONLINE, lobbyName: 1 } }] })).toThrow();
    expect(() => rosterEntriesOf({ entries: [{ ...ROW, ladderStat: 'x' }] })).toThrow();
    expect(() => rosterEntriesOf({ rows: [] })).toThrow();
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    const t401 = fetchManageRosterService('http://x', fetching(401, {}));
    for (const p of [t401.myClans({ start: 1, pageSize: 999 }, 'T'), t401.roster({ clanId: 1, ladderStatIndex: 0, sortOrder: 1 }, 'T'), t401.disband({ clanId: 1 }, 'T')]) {
      expect(await p).toBe(MANAGE_ROSTER_SESSION_LOST);
    }
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchManageRosterService('http://x', fetching(status, { status: 0 })).remove({ playerAccountId: 1, clanId: 1 }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchManageRosterService('http://x', fetching(200, { status: 'x' })).transferLeadership({ newLeaderAccountId: 1, newLeaderAccountName: 'a' }, 'T')).rejects.toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionManageRoster(fetchManageRosterService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.myClans({ start: 1, pageSize: 999 })).rejects.toThrow();
    await expect(s.updateStats({ clanId: 1, stats: new Uint8Array(256) })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.roster({ clanId: 1, ladderStatIndex: 0, sortOrder: 1 })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
  });
});

describe('connectManageRoster: the clan client\'s and the leader\'s rows on the session over the transport', () => {
  it('GetClan asks GetMyClans with the bearer; the success keeps the clan, asks the roster and the band; the leader\'s disband goes out with it', async () => {
    const calls: Call[] = [];
    const host = new UiCommandHost();
    const clan = new LobbyClan();
    const band: number[] = [];
    const m = connectManageRoster(host, {
      uiVars: new UiVarManager(), clan, ticket: () => 'T1', sessionLost: () => {}, event: () => {}, inputString: () => null,
      service: fetchManageRosterService('http://own', routed({ '/clan/my-clans': MINE, '/clan/roster': { entries: [ROW] }, '/clan/disband': { status: 0 } }, calls)),
      clanMessages: { myClanMessages: () => { band.push(clan.clanId); } }, ladderTotal: () => 0, lobby: { up: true, state: () => 11, account: () => 'socomc' },
    });
    expect(host.dispatch(cmd('GetClan')).kind).toBe('table');
    await flush();
    expect([clan.clanId, clan.name, clan.self, clan.roster.map((r) => r.name), band]).toEqual([12, 'Tide', 7, ['socomc'], [12]]);
    host.dispatch(cmd('DisbandClan'));
    await flush();
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/clan/my-clans', '/clan/roster', '/clan/disband']);
    expect(calls.every((c) => (c.init.headers as Record<string, string>)['authorization'] === 'Bearer T1')).toBe(true);
    expect([clan.member, typeof m.roster.GetClan, typeof m.leader.DisbandClan]).toEqual([false, 'function', 'function']);
  });

  it('the lobby\'s state: down, GetClan answers 1 and sends nothing; no transport, every request never answered', async () => {
    const calls: Call[] = [];
    const host = new UiCommandHost();
    connectManageRoster(host, {
      uiVars: new UiVarManager(), clan: new LobbyClan(), ticket: () => 'T1', sessionLost: () => {}, event: () => {}, inputString: () => null,
      service: fetchManageRosterService('http://own', fetching(200, MINE, calls)), lobby: { up: false, state: () => 11 },
    });
    expect(host.dispatch(cmd('GetClan'))).toMatchObject({ kind: 'table', answer: true });
    await flush();
    expect(calls).toHaveLength(0);
    const bare = new UiCommandHost();
    connectManageRoster(bare, { uiVars: new UiVarManager(), clan: new LobbyClan(), ticket: () => null, sessionLost: () => {}, event: () => {}, inputString: () => null });
    expect(bare.dispatch(cmd('GetClan'))).toMatchObject({ kind: 'table', answer: false });
  });
});


describe('frontEnd.ts mounts it (ONL-27; the seat\'s claim of the four hunks, HANDOFF §3)', () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');

  it('imports the host\'s mount and transport after the clan messages\' host; the session option manageRoster is a ManageRosterTransport', () => {
    const line = "import { connectManageRoster, fetchManageRosterService, type ManageRosterTransport } from './manageRosterHost';";
    expect(src).toContain(line);
    expect(src.indexOf(line)).toBeGreaterThan(src.indexOf("from './clanMessagesHost';"));
    expect(src).toContain([
      '  clanMessages?: ClanMessagesTransport;',
      "  /** ONL-27: SVC-08's GetMyClans, roster, leadership, disband and stats and SVC-09's removal (./manageRosterHost); absent, never answered. */",
      '  manageRoster?: ManageRosterTransport;',
    ].join('\n'));
  });

  it('keeps the clan messages\' and the ladder\'s handles, the calls\' text unchanged, and mounts the rosters after the ladder over them', () => {
    expect(src).toContain('const clanMessages = connectClanMessages(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.clanMessages, ');
    expect(src).toContain('const ladder = connectLadderLobby(this.host, { uiVars: this.uiVars, valves: () => this.opener.valves, service: o.ladder, ');
    const call = 'connectManageRoster(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.manageRoster, '
      + 'ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), '
      + 'inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null, clanMessages, ladderTotal: () => ladder.state().myTotal, ladderPosition: () => ladder.state().myPosition });';
    expect(src).toContain(call);
    expect(src.indexOf(call)).toBeGreaterThan(src.indexOf('const ladder = connectLadderLobby('));
    expect(src.indexOf(call)).toBeLessThan(src.indexOf('this.gameLobby = connectGameLobby('));
  });

  it('the page hands the transport at its own origin with the session\'s bearer, after the clan messages\' transport', () => {
    expect(src).toMatch(/manageRoster: fetchManageRosterService\(accountServiceBase\(search, win\.location, devBuild\(\)\)\),/);
    expect(src.indexOf('manageRoster: fetchManageRosterService(')).toBeGreaterThan(src.indexOf('clanMessages: fetchClanMessagesService('));
  });
});
