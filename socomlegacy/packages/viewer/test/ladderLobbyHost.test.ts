import { describe, expect, it } from 'vitest';
import { CLAN_LADDER_RANKING_VAR, DIALOG_EVENTS, LADDER_LEADERS_VAR, LADDER_RANKING_VAR, LobbyClan, UiCommandHost, UiVarManager, ValveStore, type ZAnimUiCommand } from '@s2u/ui';
import { LADDER_SESSION_LOST, clanLadderListOf, connectLadderLobby, fetchLadderService, ladderListOf, playerInfoOf, sessionLadder } from '../src/ladderLobbyHost';

/**
 * ONL-30a's page half (web research 269 §2): PLAYER RANKING's and PLAYER INFO's requests -- SVC-13's
 * `/lobby/ladder-position` and `/lobby/ladder-list`, SVC-15a's `/lobby/player-info` -- at the page's own origin with the
 * session's ticket as the bearer; my position in one request, the bearer's own (SVC-15 retired
 * `LADDER_POSITION_BY_NAME_ADAPTATION`); the rows keyed by the account id at +0x20 (SVC-15 retired
 * `LADDER_ROW_KEY_ADAPTATION`); a 401 the session lost, handed to the lobby client; any other refusal or shape a request
 * never answered; no ticket, no request; an answer under a ticket no longer held never answered. And the session's
 * mount of `@s2u/ui`'s `LadderLobbyCommands`.
 */
type Call = { url: string; init: RequestInit };
const cmd = (fn: string, mode = 0, arg = 'NA'): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x14);
  bytes[0x10] = mode;
  return { anim: 'get_ladder_top_10', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes };
};
const flush = async (n = 4): Promise<void> => { for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0)); };
/** An `'E'` record with its +0x08 (the live position) set, as hex. */
const record = (position: number): string => {
  const b = new Uint8Array(256);
  b[0] = 0x45;
  new DataView(b.buffer).setInt32(0x08, position, true);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};
const STATE = { connectStatus: 2, lobbyWorldId: 4, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' };
const row = (position: number, name: string, endOfList: boolean) => ({ status: 0, ladderPosition: position, accountId: 1000 + position, accountName: name, stats: record(position), onlineState: STATE, endOfList });

/** The match server's routes over a board of `size`, me (the bearer) at `me` (0: off it). */
function server(size: number, me: number, calls: Call[] = [], status = 200) {
  const names = Array.from({ length: size }, (_, i) => (i + 1 === me ? 'socomc' : `p${i + 1}`));
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = JSON.parse(String(init.body)) as Record<string, number | string>;
    let reply: unknown;
    if (url.endsWith('/total-rankings')) reply = { status: 0, totalRankings: size };
    else if (url.endsWith('/clan-ladder-position')) {
      // CLAN-BOARD-SERVER's 0xd4 (`ladder.ts` `clanPosition`): clan 500 + n at position n, the tag echoed; off the board ClanNotFound
      const p = Number(body['clanId']) - 500, tag = String(body['tag'] ?? '');
      reply = p >= 1 && p <= size ? { tag, status: 0, ladderPosition: p, totalRankings: size } : { tag, status: -971, ladderPosition: 0, totalRankings: 0 };
    } else if (url.endsWith('/clan-ladder-list')) {
      const start = Number(body['startPosition']), n = Math.max(0, Math.min(Number(body['pageSize']), size - start + 1)), tag = String(body['tag']);
      reply = { entries: n === 0 ? [{ tag, status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }]
        : Array.from({ length: n }, (_, k) => ({ tag, status: 0, clanId: 500 + start + k, clanName: `c${start + k}`, ladderPosition: start + k, endOfList: k === n - 1 })) };
    }
    else if (url.endsWith('/ladder-position')) reply = me > 0 ? { status: 0, ladderPosition: me, totalRankings: size } : { status: 1, ladderPosition: 0, totalRankings: 0 };
    else if (url.endsWith('/player-info')) {
      // by name, or by the account id the rows carry (1000 + position)
      const name = body['accountId'] !== undefined ? names[Number(body['accountId']) - 1001] ?? '' : String(body['name'] ?? ''), i = names.indexOf(name);
      reply = i >= 0 ? { status: 0, accountName: name, playerStatus: 2, stats: record(i + 1) }
        : name === 'socomc' ? { status: 0, accountName: name, playerStatus: 0, stats: record(0) }     // an account off the board: +0x08 is 0
          : { status: -998, accountName: name, playerStatus: 0, stats: '' };
    } else {
      const start = Number(body['startPosition']), n = Number(body['pageSize']);
      const page = names.slice(start - 1, start - 1 + n);
      reply = { entries: page.length ? page.map((nm, k) => row(start + k, nm, k === page.length - 1)) : [{ ...row(0, '', true), status: 1, stats: '' }] };
    }
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}

describe('fetchLadderService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached; my position in one request, the bearer\'s own (0xf1, FUN_002eafb0 D:L188986)', async () => {
    const calls: Call[] = [];
    const t = fetchLadderService('https://socom.example', server(30, 20, calls));
    expect(await t.position('T1')).toEqual({ status: 0, ladderPosition: 20, totalRankings: 30 });
    const page = await t.list({ ladderStatIndex: 0, sortOrder: 1, startPosition: 18, pageSize: 14 }, 'T1');
    expect(page === LADDER_SESSION_LOST ? [] : page.map((r) => [r.ladderPosition, r.accountName, r.endOfList])).toEqual(Array.from({ length: 13 }, (_, i) => [18 + i, 18 + i === 20 ? 'socomc' : `p${18 + i}`, i === 12]));
    expect(page === LADDER_SESSION_LOST ? [] : page.map((r) => r.accountId)).toEqual(Array.from({ length: 13 }, (_, i) => 1018 + i));   // the +0x20 key
    expect(await t.playerInfo({ name: 'p3' }, 'T1')).toEqual({ status: 0, accountName: 'p3', playerStatus: 2, stats: record(3) });
    await t.playerInfo({ accountId: 7 }, 'T1');
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body), (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/ladder-position', 'POST', '{"ladderStatIndex":0,"sortOrder":1}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/ladder-list', 'POST', '{"ladderStatIndex":0,"sortOrder":1,"startPosition":18,"pageSize":14}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/player-info', 'POST', '{"name":"p3"}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/player-info', 'POST', '{"accountId":7}', 'Bearer T1', 'omit', 'no-store'],
    ]);
  });

  it('off the board: the server\'s NoResult passed on as it is, as 0xf1 answers off the board', async () => {
    expect(await fetchLadderService('http://x', server(30, 0)).position('T')).toEqual({ status: 1, ladderPosition: 0, totalRankings: 0 });
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchLadderService('http://x', server(3, 1, [], 401)).list({ ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 10 }, 'T')).toBe(LADDER_SESSION_LOST);
    expect(await fetchLadderService('http://x', server(3, 1, [], 401)).position('T')).toBe(LADDER_SESSION_LOST);
    expect(await fetchLadderService('http://x', server(3, 1, [], 401)).playerInfo({ name: 'p2' }, 'T')).toBe(LADDER_SESSION_LOST);
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchLadderService('http://x', server(3, 1, [], status)).playerInfo({ name: 'p2' }, 'T'), String(status)).rejects.toThrow();
    const odd = (async () => new Response(JSON.stringify({ status: 0, accountName: 'p', playerStatus: 0, stats: 'zz' }), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchLadderService('http://x', odd).playerInfo({ name: 'p' }, 'T')).rejects.toThrow();
  });

  it('the page and the reply are checked field by field, or they throw', () => {
    const ok = row(1, 'p1', true);
    expect(ladderListOf({ entries: [ok] })).toEqual([ok]);
    expect(() => ladderListOf({ entries: [{ ...ok, accountId: '1' }] })).toThrow();
    const noKey: Record<string, unknown> = { ...ok };
    delete noKey['accountId'];
    expect(() => ladderListOf({ entries: [noKey] })).toThrow();                        // SVC-15: the +0x20 key is required
    expect(() => ladderListOf({ entries: [{ ...ok, onlineState: { ...STATE, lobbyName: 3 } }] })).toThrow();
    expect(() => ladderListOf({ entries: [{ ...ok, stats: 'ab' }] })).toThrow();
    expect(() => ladderListOf({ rows: [] })).toThrow();
    expect(playerInfoOf({ status: -998, accountName: 'x', playerStatus: 0, stats: '' })).toEqual({ status: -998, accountName: 'x', playerStatus: 0, stats: '' });
    expect(() => playerInfoOf({ status: 0, accountName: 'x', stats: '' })).toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost; an answer after the ticket changed never answered', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionLadder(fetchLadderService('http://own', server(3, 1, calls, 401)), () => ticket, (t) => { lost.push(t); });
    await expect(s.playerInfo({ name: 'p2' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.list({ ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 10 })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
    let held: string | null = 'T1';
    const later = sessionLadder(fetchLadderService('http://own', (async (url: string, init: RequestInit) => { held = 'T2'; return server(3, 1)(url, init); }) as unknown as typeof fetch), () => held, () => {});
    await expect(later.playerInfo({ name: 'p2' })).rejects.toThrow(/another session/);
  });
});

describe('fetchLadderService: the clans\' three requests (ONL-30, research 311 §8.2 item 3; the server\'s `lobbyHttp.ts` clan-ladder-position, total-rankings, clan-ladder-list)', () => {
  it('posts each body as the server reads it, with the bearer: 0xd4 with its tag or none, 0xd8 type 1, 0xd2 with its tag', async () => {
    const calls: Call[] = [];
    const t = fetchLadderService('https://socom.example', server(30, 0, calls));
    expect(await t.clanPosition({ tag: 'GetSurrounding', clanId: 520, ladderStatIndex: 0, sortOrder: 1 }, 'T1')).toEqual({ tag: 'GetSurrounding', status: 0, ladderPosition: 20, totalRankings: 30 });
    expect(await t.clanPosition({ clanId: 520, ladderStatIndex: 0, sortOrder: 1 }, 'T1')).toEqual({ tag: '', status: 0, ladderPosition: 20, totalRankings: 30 });
    expect(await t.clanTotal('T1')).toEqual({ status: 0, totalRankings: 30 });
    const page = await t.clanList({ tag: 'ClanLadderList', ladderStatIndex: 0, sortOrder: 1, startPosition: 20, pageSize: 14 }, 'T1');
    expect(page === LADDER_SESSION_LOST ? [] : page.map((r) => [r.tag, r.clanId, r.clanName, r.ladderPosition, r.endOfList])).toEqual(Array.from({ length: 11 }, (_, i) => ['ClanLadderList', 520 + i, `c${20 + i}`, 20 + i, i === 10]));
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body), (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/clan-ladder-position', 'POST', '{"clanId":520,"ladderStatIndex":0,"sortOrder":1,"tag":"GetSurrounding"}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/clan-ladder-position', 'POST', '{"clanId":520,"ladderStatIndex":0,"sortOrder":1}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/total-rankings', 'POST', '{"ladderType":1}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/clan-ladder-list', 'POST', '{"tag":"ClanLadderList","ladderStatIndex":0,"sortOrder":1,"startPosition":20,"pageSize":14}', 'Bearer T1', 'omit', 'no-store'],
    ]);
  });

  it('a clan off the board: ClanNotFound passed on as it is; past the end the one NoResult row', async () => {
    const t = fetchLadderService('http://x', server(30, 0));
    expect(await t.clanPosition({ tag: 'GetSurrounding', clanId: 999, ladderStatIndex: 0, sortOrder: 1 }, 'T')).toEqual({ tag: 'GetSurrounding', status: -971, ladderPosition: 0, totalRankings: 0 });
    expect(await t.clanList({ tag: 'ClanLadderList', ladderStatIndex: 0, sortOrder: 1, startPosition: 31, pageSize: 14 }, 'T')).toEqual([{ tag: 'ClanLadderList', status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }]);
  });

  it('each reply checked field by field, or it throws; 401 is the session lost', async () => {
    const ok = { tag: 'ClanLadderLeaders', status: 0, clanId: 501, clanName: 'c1', ladderPosition: 1, endOfList: true };
    expect(clanLadderListOf({ entries: [ok] })).toEqual([ok]);
    expect(() => clanLadderListOf({ entries: [{ ...ok, clanId: '501' }] })).toThrow();
    expect(() => clanLadderListOf({ entries: [{ ...ok, tag: 3 }] })).toThrow();
    expect(() => clanLadderListOf({ entries: [{ ...ok, clanName: null }] })).toThrow();
    expect(() => clanLadderListOf({ entries: [{ ...ok, endOfList: 1 }] })).toThrow();
    const noPosition: Record<string, unknown> = { ...ok };
    delete noPosition['ladderPosition'];
    expect(() => clanLadderListOf({ entries: [noPosition] })).toThrow();
    expect(() => clanLadderListOf({ rows: [] })).toThrow();
    const reply = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchLadderService('http://x', reply({ status: 0, ladderPosition: 3, totalRankings: 9 })).clanPosition({ clanId: 1, ladderStatIndex: 0, sortOrder: 1 }, 'T')).rejects.toThrow();   // no tag
    await expect(fetchLadderService('http://x', reply({ status: 0 })).clanTotal('T')).rejects.toThrow();
    for (const call of [
      (t: ReturnType<typeof fetchLadderService>) => t.clanPosition({ clanId: 501, ladderStatIndex: 0, sortOrder: 1 }, 'T'), (t: ReturnType<typeof fetchLadderService>) => t.clanTotal('T'),
      (t: ReturnType<typeof fetchLadderService>) => t.clanList({ tag: 'ClanLadderList', ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 14 }, 'T'),
    ]) expect(await call(fetchLadderService('http://x', server(3, 0, [], 401)))).toBe(LADDER_SESSION_LOST);
    await expect(fetchLadderService('http://x', server(3, 0, [], 500)).clanTotal('T')).rejects.toThrow();
  });

  it('the session\'s service carries the three: a 401 handed to sessionLost; an answer after the ticket changed never answered', async () => {
    const lost: string[] = [];
    const s = sessionLadder(fetchLadderService('http://own', server(3, 0, [], 401)), () => 'T7', (t) => { lost.push(t); });
    await expect(s.clanTotal!()).rejects.toThrow();
    expect(lost).toEqual(['T7']);
    let held: string | null = 'T1';
    const later = sessionLadder(fetchLadderService('http://own', (async (url: string, init: RequestInit) => { held = 'T2'; return server(3, 0)(url, init); }) as unknown as typeof fetch), () => held, () => {});
    await expect(later.clanList!({ tag: 'ClanLadderList', ladderStatIndex: 0, sortOrder: 1, startPosition: 1, pageSize: 14 })).rejects.toThrow(/another session/);
  });
});

describe('connectLadderLobby: the rows on the session over the transport', () => {
  it('ONL-30: the session\'s clan handed in -- mode 6 asks its position "GetSurrounding", the clans\' total and the podium, then the list from its position; my row tinted', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [], events: number[] = [];
    const clan = { clanId: 520, member: true, find: () => null };
    connectLadderLobby(host, {
      uiVars, valves: () => new ValveStore(), service: fetchLadderService('http://own', server(30, 0, calls)), ticket: () => 'T1', sessionLost: () => {},
      inputString: () => null, event: (k) => { events.push(k); }, clan,
    });
    host.dispatch(cmd('GetLadderInfo', 6));
    await flush(8);
    expect(calls.map((c) => `${c.url.replace('http://own', '')} ${String(c.init.body)}`)).toEqual([
      '/lobby/clan-ladder-position {"clanId":520,"ladderStatIndex":0,"sortOrder":1,"tag":"GetSurrounding"}', '/lobby/total-rankings {"ladderType":1}',
      '/lobby/clan-ladder-list {"tag":"ClanLadderLeaders","ladderStatIndex":0,"sortOrder":1,"startPosition":1,"pageSize":10}',
      '/lobby/clan-ladder-list {"tag":"ClanLadderList","ladderStatIndex":0,"sortOrder":1,"startPosition":20,"pageSize":14}',
    ]);
    const ranking = uiVars.find(CLAN_LADDER_RANKING_VAR)!.value;
    expect(ranking.type === 'array' ? ranking.value.length : 0).toBe(11);
    expect(ranking.type === 'array' ? ranking.value[0] : null).toEqual({ type: 'array', value: [
      { type: 'array', value: [{ type: 'string', value: 'VALUE' }, { type: 'string', value: '20' }, { type: 'string', value: 'COLOR' }, { type: 'array', value: [91, 72, 36].map((value) => ({ type: 'real', value })) }] },
      { type: 'array', value: [{ type: 'string', value: 'VALUE' }, { type: 'string', value: 'c20' }, { type: 'string', value: 'COLOR' }, { type: 'array', value: [91, 72, 36].map((value) => ({ type: 'real', value })) }] },
      { type: 'int', value: 2 },
    ] });
    expect(events).toEqual([DIALOG_EVENTS['ON_LADDER_REFRESH']]);
    // no clan handed in: no clan held -- the list from 1 before the total
    const bare = new UiCommandHost(), bareCalls: Call[] = [];
    connectLadderLobby(bare, { uiVars: new UiVarManager(), valves: () => new ValveStore(), service: fetchLadderService('http://own', server(30, 0, bareCalls)), ticket: () => 'T1', sessionLost: () => {}, inputString: () => null, event: () => {} });
    bare.dispatch(cmd('GetLadderInfo', 6));
    expect(bareCalls.map((c) => c.url.replace('http://own/lobby/', ''))).toEqual(['clan-ladder-list', 'total-rankings', 'clan-ladder-list']);
  });

  it('GetLadderInfo (mode 0) asks my position and the podium with the ticket, opens the page, writes the valves and raises ON_LADDER_REFRESH; a 401 is the session lost', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore(), calls: Call[] = [], events: number[] = [], lost: string[] = [];
    for (const v of [LADDER_LEADERS_VAR, LADDER_RANKING_VAR]) uiVars.add(v, null, 1);
    connectLadderLobby(host, {
      uiVars, valves: () => valves, service: fetchLadderService('http://own', server(30, 20, calls)), ticket: () => 'T1', sessionLost: (t) => { lost.push(t); },
      inputString: () => null, event: (k) => { events.push(k); }, lobby: { up: true, state: () => 11, account: () => 'socomc' },
    });
    expect(host.dispatch(cmd('GetLadderInfo', 0)).kind).toBe('table');
    await flush();
    expect(calls.map((c) => `${c.url.replace('http://own', '')} ${String(c.init.body)}`)).toEqual([
      '/lobby/ladder-position {"ladderStatIndex":0,"sortOrder":1}', '/lobby/ladder-list {"ladderStatIndex":0,"sortOrder":1,"startPosition":1,"pageSize":10}',
      '/lobby/ladder-list {"ladderStatIndex":0,"sortOrder":1,"startPosition":18,"pageSize":14}',
    ]);
    const ranking = uiVars.find(LADDER_RANKING_VAR)!.value;
    expect(ranking.type === 'array' ? ranking.value.length : 0).toBe(13);
    expect([valves.find('LadderMedalOfMerit')!.value, valves.find('LadderRankRestriction')!.value, events]).toEqual([1, 1, [DIALOG_EVENTS['ON_LADDER_REFRESH']]]);
    const gone = new UiCommandHost();
    connectLadderLobby(gone, {
      uiVars: new UiVarManager(), valves: () => new ValveStore(), service: fetchLadderService('http://own', server(3, 1, [], 401)), ticket: () => 'T5', sessionLost: (t) => { lost.push(t); },
      inputString: () => null, event: () => {}, lobby: { up: true, state: () => 11, account: () => 'socomc' },
    });
    gone.dispatch(cmd('GetLadderInfo', 1));
    await flush();
    expect(lost).toContain('T5');
  });

  it('PLAYER-INFO-CLAN: the session\'s clan handed in -- a roster row\'s VIEW INFO (the CLAN origin, 1) reads the roster (LobbyClan.find, FUN_002e9460 D:L188026-188056): the row\'s online state and +0x1d0; a name not on it NOT CURRENTLY LOGGED IN and the record\'s +0x08', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager();
    const clan = new LobbyClan();
    clan.clanId = 520;
    const game = { connectStatus: 3, lobbyWorldId: 4, gameWorldId: 9, lobbyName: 'Alpha', gameName: 'Night Raid' };
    clan.roster.push({ accountId: 1005, name: 'P5', description: '', online: game, ladderStat: 1500, ladderPosition: 3, totalRankings: 30 });   // the name case-blind (FUN_00198b80)
    let input = '1005';
    connectLadderLobby(host, {
      uiVars, valves: () => new ValveStore(), service: fetchLadderService('http://own', server(30, 0)), ticket: () => 'T1', sessionLost: () => {},
      inputString: () => input, event: () => {}, clan,
    });
    const cells = (): string[][] => {
      const v = uiVars.find('PLAYER_INFO_VAR1')!.value;
      return v.type === 'array' ? v.value.map((row) => (row.type === 'array' ? row.value.map((c) => (c.type === 'string' ? c.value : c.type === 'array' ? 'cell' : c.type === 'none' ? '' : String(c.value))) : [])) : [];
    };
    host.dispatch(cmd('GetPlayerInfo', 1, 'INPUT_STRING'));
    await flush();
    expect(cells()[4]).toEqual(['LADDER POSITION:', '3']);                                   // +0x1d0, not the record's +0x08 (5)
    expect(cells().slice(13)).toEqual([['ONLINE:', '0 min.'], ['BRIEFING ROOM:', 'Alpha'], ['GAME:', 'Night Raid']]);
    input = '1006';                                                                       // p6: not on the roster
    host.dispatch(cmd('GetPlayerInfo', 1, 'INPUT_STRING'));
    await flush();
    expect(cells()[4]).toEqual(['LADDER POSITION:', '6']);
    expect(cells().slice(13)).toEqual([['NOT CURRENTLY LOGGED IN\n', ' ']]);
  });

  it('with no transport every request is never answered: the rows answer, nothing is drawn', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager();
    connectLadderLobby(host, { uiVars, valves: () => new ValveStore(), ticket: () => 'T1', sessionLost: () => {}, inputString: () => 'p1', event: () => {} });
    expect([host.dispatch(cmd('GetLadderInfo', 1)).kind, host.dispatch(cmd('GetPlayerInfo', 3, 'INPUT_STRING')).kind]).toEqual(['table', 'table']);
    await flush();
    expect([uiVars.find(LADDER_LEADERS_VAR), uiVars.find('PLAYER_INFO_VAR1')!.value]).toEqual([undefined, { type: 'string', value: 'Retrieving Player Info' }]);
  });
});
