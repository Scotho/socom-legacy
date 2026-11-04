import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, IGNORE_LIST_VAR, PLAYER_IGNORE_NAME_VAR, UiCommandHost, UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { IGNORE_LIST_SESSION_LOST, connectIgnoreList, fetchIgnoreListService, ignoreListOf, sessionIgnoreList } from '../src/ignoreListHost';

/**
 * ONL-25's page half (web research 269 §1): the ignore list's requests -- SVC-17's `/lobby/ignore-list`,
 * `/lobby/ignore-add`, `/lobby/ignore-remove` and AccountGetID's `/lobby/account-id` (the add's lookup, NU-14; it was
 * SVC-18's `/lobby/find-player`) -- at the page's own origin with the session's ticket as the bearer; a 401 the session
 * lost, handed to the lobby client; any other refusal or shape a request never answered; no ticket, no request. And the
 * session's mount of `@s2u/ui`'s `IgnoreListCommands`.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'OnIgnoreListStart', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const row = { status: 0, ignoreAccountId: 42, ignoreAccountName: 'bob', playerStatus: 2, endOfList: true };

describe('fetchIgnoreListService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached', async () => {
    const calls: Call[] = [];
    const t = fetchIgnoreListService('https://socom.example', fetching(200, { status: 0, accountId: 42, entries: [row] }, calls));
    expect(await t.list('T1')).toEqual([row]);
    expect(await t.accountId({ name: 'bob' }, 'T1')).toEqual({ status: 0, accountId: 42 });
    expect(await t.add({ ignoreAccountId: 42 }, 'T1')).toEqual({ status: 0 });
    expect(await t.remove({ ignoreAccountId: 42 }, 'T1')).toEqual({ status: 0 });
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body), (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/ignore-list', 'POST', '{}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/account-id', 'POST', '{"accountName":"bob"}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/ignore-add', 'POST', '{"ignoreAccountId":42}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/ignore-remove', 'POST', '{"ignoreAccountId":42}', 'Bearer T1', 'omit', 'no-store'],
    ]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchIgnoreListService('http://x', fetching(401, {})).list('T')).toBe(IGNORE_LIST_SESSION_LOST);
    expect(await fetchIgnoreListService('http://x', fetching(401, {})).add({ ignoreAccountId: 1 }, 'T')).toBe(IGNORE_LIST_SESSION_LOST);
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchIgnoreListService('http://x', fetching(status, { entries: [] })).list('T'), String(status)).rejects.toThrow();
    await expect(fetchIgnoreListService('http://x', fetching(200, { status: 'x' })).add({ ignoreAccountId: 1 }, 'T')).rejects.toThrow();
    await expect(fetchIgnoreListService('http://x', fetching(200, { status: 0 })).accountId({ name: 'a' }, 'T')).rejects.toThrow();
  });

  it('the list is checked row by row: every field of the 0xc1 row, or it throws', () => {
    expect(ignoreListOf({ entries: [row] })).toEqual([row]);
    expect(() => ignoreListOf({ entries: [{ ...row, ignoreAccountName: 7 }] })).toThrow();
    expect(() => ignoreListOf({ entries: [{ ...row, endOfList: 1 }] })).toThrow();
    expect(() => ignoreListOf({ rows: [] })).toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionIgnoreList(fetchIgnoreListService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.list()).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.remove({ ignoreAccountId: 3 })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
  });
});

describe('connectIgnoreList: the rows on the session over the transport', () => {
  it('GetIgnoreList asks with the ticket and draws IgnoreListVar; AddToIgnore looks the name up and adds; a not-found raises MP_PLAYER_NOT_FOUND', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [], events: number[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith('/account-id') ? { status: -998, accountId: 0 } : url.endsWith('/ignore-list') ? { entries: [row] } : { status: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    connectIgnoreList(host, { uiVars, service: fetchIgnoreListService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {}, inputString: () => null, event: (k) => { events.push(k); } });
    expect(host.dispatch(cmd('GetIgnoreList')).kind).toBe('table');
    await flush();
    expect(uiVars.find(IGNORE_LIST_VAR)!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [{ type: 'string', value: '42' }, { type: 'string', value: 'bob' }, { type: 'string', value: '\xa7' }] }] });
    uiVars.set(uiVars.add(PLAYER_IGNORE_NAME_VAR, null, 1), { type: 'string', value: 'nobody' });
    expect(host.dispatch(cmd('AddToIgnore')).kind).toBe('table');
    await flush(); await flush();
    expect(calls.map((c) => c.url.replace('http://own', ''))).toEqual(['/lobby/ignore-list', '/lobby/account-id']);
    expect(events).toEqual([DIALOG_EVENTS.MP_PLAYER_NOT_FOUND]);
  });

  it('NU-14: a known player logged in, in no briefing room -- the services\' FindPlayer -998, AccountGetID his account -- is added: the lookup is /lobby/account-id, then the add and the list; no MP_PLAYER_NOT_FOUND', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [], events: number[] = [];
    const lima = { status: 0, ignoreAccountId: 77, ignoreAccountName: 'Lima', playerStatus: 1, endOfList: true };
    let listed = false;
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const op = url.slice(url.lastIndexOf('/') + 1);
      const body = op === 'find-player' ? { status: -998, accountId: 0, accountName: 'Lima' }               // chat.ts findPlayer: not on the lobby
        : op === 'account-id' ? { status: 0, accountId: 77 }                                                // accountGetId.ts: logged in, in no room
          : op === 'ignore-add' ? (listed = true, { status: 0 }) : { entries: listed ? [lima] : [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const c = connectIgnoreList(host, { uiVars, service: fetchIgnoreListService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {}, inputString: () => null, event: (k) => { events.push(k); } });
    uiVars.set(uiVars.add(PLAYER_IGNORE_NAME_VAR, null, 1), { type: 'string', value: 'Lima' });
    host.dispatch(cmd('AddToIgnore'));
    for (let i = 0; i < 8; i++) await flush();
    expect(calls.map((x) => [x.url.replace('http://own', ''), JSON.parse(String(x.init.body)) as unknown])).toEqual([
      ['/lobby/account-id', { accountName: 'Lima' }], ['/lobby/ignore-add', { ignoreAccountId: 77 }], ['/lobby/ignore-list', {}],
    ]);
    expect([events, c.records().map((r) => r.ignoreAccountName)]).toEqual([[], ['Lima']]);
  });

  it('with no transport every request is never answered: the rows answer, nothing is sent or drawn', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager();
    connectIgnoreList(host, { uiVars, ticket: () => 'T1', sessionLost: () => {}, inputString: () => null, event: () => {} });
    expect(host.dispatch(cmd('GetIgnoreList')).kind).toBe('table');
    await flush();
    expect(uiVars.find(IGNORE_LIST_VAR)).toBeUndefined();
  });
});
