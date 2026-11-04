import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, FRIEND_CONFIRMATION_LIST_VAR, FRIEND_LIST_VAR, PLAYER_FRIEND_NAME_VAR, UiCommandHost, UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import {
  FRIEND_LIST_SESSION_LOST, connectFriendList, fetchFriendListService, friendEventsOf, friendInvitationsOf, friendListOf, sessionFriendList,
} from '../src/friendListHost';

/**
 * ONL-24's page half (web research 269 §3): SVC-16's seven `/lobby/friend-*` paths at the page's own origin with the
 * session's ticket as the bearer; a 401 the session lost, handed to the lobby client; the answer's 204 its no reply;
 * any other refusal or shape a request never answered; no ticket, no request. And the session's mount of `@s2u/ui`'s
 * `FriendListCommands`, with the pushes' poll.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(status === 204 ? null : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'OnFriendListStart', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const state = { connectStatus: 2, lobbyWorldId: 7, gameWorldId: -1, lobbyName: 'Alpha', gameName: '' };
const row = { status: 0, accountId: 42, accountName: 'bob', onlineState: state, endOfList: true };
const ask = { status: 0, accountId: 43, accountName: 'Carol', addType: 0, endOfList: true };
const forward = { kind: 'forward' as const, accountId: 43, accountName: 'Carol', addType: 0 };
const answered = { kind: 'answer' as const, accountId: 42, accountName: 'bob', status: 2 };

describe('fetchFriendListService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached; the answer\'s 204 is its no reply', async () => {
    const calls: Call[] = [];
    const t = fetchFriendListService('https://socom.example', fetching(200, { status: 0, entries: [row], events: [forward] }, calls));
    expect(await t.list('T1')).toEqual([row]);
    expect(await t.request({ name: 'bob' }, 'T1')).toEqual({ status: 0 });
    expect(await t.add({ accountId: 43 }, 'T1')).toEqual({ status: 0 });
    expect(await t.remove({ accountId: 42 }, 'T1')).toEqual({ status: 0 });
    expect(await t.events('T1')).toEqual([forward]);
    expect(await fetchFriendListService('https://socom.example', fetching(204, null, calls)).answer({ accountId: 43, status: 2 }, 'T1')).toBeUndefined();
    expect(await fetchFriendListService('https://socom.example', fetching(200, { entries: [ask] }, calls)).invitations('T1')).toEqual([ask]);
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body), (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/friend-list', 'POST', '{}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-request', 'POST', '{"name":"bob"}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-add', 'POST', '{"accountId":43}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-remove', 'POST', '{"accountId":42}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-events', 'POST', '{}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-answer', 'POST', '{"accountId":43,"status":2}', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/lobby/friend-invitations', 'POST', '{}', 'Bearer T1', 'omit', 'no-store'],
    ]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchFriendListService('http://x', fetching(401, {})).list('T')).toBe(FRIEND_LIST_SESSION_LOST);
    expect(await fetchFriendListService('http://x', fetching(401, {})).answer({ accountId: 1, status: 2 }, 'T')).toBe(FRIEND_LIST_SESSION_LOST);
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchFriendListService('http://x', fetching(status, { entries: [] })).list('T'), String(status)).rejects.toThrow();
    await expect(fetchFriendListService('http://x', fetching(200, {})).answer({ accountId: 1, status: 2 }, 'T')).rejects.toThrow();   // not the 204
    await expect(fetchFriendListService('http://x', fetching(200, { status: 'x' })).request({ name: 'a' }, 'T')).rejects.toThrow();
  });

  it('the rows and the pushes are checked field by field, or it throws', () => {
    expect(friendListOf({ entries: [row] })).toEqual([row]);
    expect(() => friendListOf({ entries: [{ ...row, onlineState: { ...state, lobbyName: 3 } }] })).toThrow();
    expect(() => friendListOf({ entries: [{ ...row, endOfList: 1 }] })).toThrow();
    expect(() => friendListOf({ rows: [] })).toThrow();
    expect(friendInvitationsOf({ entries: [ask] })).toEqual([ask]);
    expect(() => friendInvitationsOf({ entries: [{ ...ask, addType: 'x' }] })).toThrow();
    expect(friendEventsOf({ events: [forward, answered] })).toEqual([forward, answered]);
    expect(() => friendEventsOf({ events: [{ ...answered, kind: 'other' }] })).toThrow();
    expect(() => friendEventsOf({ events: [{ ...answered, status: null }] })).toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionFriendList(fetchFriendListService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.list()).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.remove({ accountId: 3 })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
  });
});

describe('connectFriendList: the rows on the session over the transport', () => {
  it('GetFriendsList draws FriendListVar; AddFriend requests by name and raises MP_FRIEND_CONFIRMATION_REQUESTED; the poll keeps a forward and draws its line', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [], events: number[] = [], lines: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith('/friend-list') ? { entries: [row] } : url.endsWith('/friend-events') ? { events: [forward] } : { status: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    let now = 0;
    const m = connectFriendList(host, {
      uiVars, service: fetchFriendListService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {}, inputString: () => null,
      event: (k) => { events.push(k); }, lobby: { up: true, state: () => 11, account: () => 'socomc' }, line: (text) => { lines.push(text); }, now: () => now,
    });
    expect(host.dispatch(cmd('GetFriendsList')).kind).toBe('table');
    await flush();
    expect(uiVars.find(FRIEND_LIST_VAR)!.value).toEqual({ type: 'array', value: [{ type: 'array', value: ['42', 'bob', '\xa7', 'Alpha', ''].map((value) => ({ type: 'string', value })) }] });
    uiVars.set(uiVars.add(PLAYER_FRIEND_NAME_VAR, null, 1), { type: 'string', value: 'dave' });
    expect(host.dispatch(cmd('AddFriend')).kind).toBe('table');
    await flush();
    expect(events).toEqual([DIALOG_EVENTS.MP_FRIEND_CONFIRMATION_REQUESTED]);
    m.frame();
    await flush();
    now = 500;
    m.frame();                                                                          // inside the period: no second poll
    expect(calls.map((c) => c.url.replace('http://own', ''))).toEqual(['/lobby/friend-list', '/lobby/friend-request', '/lobby/friend-events']);
    expect(uiVars.find(FRIEND_CONFIRMATION_LIST_VAR)!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [{ type: 'string', value: '43' }, { type: 'string', value: 'Carol' }] }] });
    expect(lines).toEqual(['Carol has invited you to join their friends list.']);
  });

  it('a 401 is the session\'s loss (sessionLost with the ticket); with no transport every request is never answered', async () => {
    const lost: string[] = [];
    const host = new UiCommandHost(), uiVars = new UiVarManager();
    connectFriendList(host, { uiVars, service: fetchFriendListService('http://own', fetching(401, {})), ticket: () => 'T1', sessionLost: (t) => { lost.push(t); }, inputString: () => null, event: () => {} });
    host.dispatch(cmd('GetFriendsList'));
    await flush();
    expect([lost, uiVars.find(FRIEND_LIST_VAR)]).toEqual([['T1'], undefined]);
    const bare = new UiCommandHost(), vars = new UiVarManager();
    const m = connectFriendList(bare, { uiVars: vars, ticket: () => 'T1', sessionLost: () => {}, inputString: () => null, event: () => {} });
    expect(bare.dispatch(cmd('GetFriendsList')).kind).toBe('table');
    m.frame();
    await flush();
    expect(vars.find(FRIEND_LIST_VAR)).toBeUndefined();
  });
});
