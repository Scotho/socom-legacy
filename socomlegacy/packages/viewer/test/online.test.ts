// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isLocalHost, LOCAL_SERVER, LOCAL_START, NO_ROOMS_ROUTE, NO_SHARED_ROOM, NO_SUCH_MAP, roomRetryStatus, STACK_START, ONLINE_KEY, LOCAL_STACK_SERVER, onlineChoice, onlineChoices, onlineLine, onlineToast, pageIsLocal, readOnline, resolveOnline, sharedServer, withRefusalMap, writeOnline,
} from '../src/online';
import { LOCAL_RETRY_MS, retryDelayMs, retryDueAt } from '../src/netPage';

/** The panel's Online setting (owner, 2026-09-29): Off, Shared or Local; the URL's `&mp` / `&server=` over it. */
const HTTP = { protocol: 'http:', host: 'localhost:5173' };
const HTTPS = { protocol: 'https:', host: 'socomunzipped.com' };

describe('the Online setting: the servers', () => {
  it('Shared is this site\'s own service (TRS-1: a deployed page\'s origin, a local page\'s local stack) and Local the static server on this machine', () => {
    expect(sharedServer(HTTPS)).toBe('wss://socomunzipped.com/ws');   // was the retired SHARED_SERVER, the dead mp host
    expect(sharedServer(HTTP)).toBe(LOCAL_STACK_SERVER);
    expect(LOCAL_SERVER).toBe('ws://localhost:8787/ws');
  });

  it('reads a stored value back as one of the three, Off for anything else', () => {
    expect(onlineChoice('shared')).toBe('shared');
    expect(onlineChoice('local')).toBe('local');
    for (const v of [null, '', 'off', 'on', 'SHARED', '1']) expect(onlineChoice(v), String(v)).toBe('off');
  });
});

/**
 * The Local option is a developer's (owner, 2026-09-29: "Make sure the localhost option is only visible locally, never
 * on the deployed site"): offered only on a page served from this machine -- localhost, 127.0.0.1, [::1] or a
 * `.localhost` name.
 */
describe('the Local option: a local page only', () => {
  it('knows a local host by its name, with or without a port', () => {
    for (const h of ['localhost', 'localhost:5173', '127.0.0.1', '127.0.0.1:8787', '[::1]', '[::1]:5173', 'viewer.localhost', 'a.b.localhost:5192', 'LOCALHOST']) {
      expect(isLocalHost(h), h).toBe(true);
    }
    for (const h of ['socomunzipped.com', 'mp.socomunzipped.com', 'localhost.example.com', '127.0.0.2', '203.0.113.5:5173', 'notlocalhost', '', '[::2]']) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });

  it('offers Off / Shared / Local locally and Off / Shared elsewhere', () => {
    expect(onlineChoices(true)).toEqual(['off', 'shared', 'local']);
    expect(onlineChoices(false)).toEqual(['off', 'shared']);
    expect(pageIsLocal(HTTP)).toBe(true);
    expect(pageIsLocal(HTTPS)).toBe(false);
    expect(pageIsLocal({ host: '[::1]:5173' })).toBe(true);
  });

  it('reads a stored Local as Off where Local is not offered', () => {
    expect(onlineChoice('local', false)).toBe('off');
    expect(onlineChoice('shared', false)).toBe('shared');
    expect(onlineChoice('local', true)).toBe('local');
  });
});

describe('resolveOnline: the URL first, then the stored choice', () => {
  it('with nothing in the URL takes the stored choice: Off (no server), Shared, Local', () => {
    expect(resolveOnline('', null, HTTP)).toEqual({ choice: 'off', url: null, fromUrl: false });
    expect(resolveOnline('?map=MP2&mode=play', 'off', HTTP)).toEqual({ choice: 'off', url: null, fromUrl: false });
    expect(resolveOnline('', 'shared', HTTP)).toEqual({ choice: 'shared', url: LOCAL_STACK_SERVER, fromUrl: false });
    expect(resolveOnline('?map=MP2', 'local', HTTP)).toEqual({ choice: 'local', url: LOCAL_SERVER, fromUrl: false });
  });

  it('a remembered or linked Local on a page that is not local falls back to Off (a page that is not local has no Local)', () => {
    expect(resolveOnline('?map=MP2', 'local', HTTPS)).toEqual({ choice: 'off', url: null, fromUrl: false });
    expect(resolveOnline('?lag=50', 'local', HTTPS).simulate).toBeUndefined();
    expect(resolveOnline('', 'shared', HTTPS)).toMatchObject({ choice: 'shared', url: 'wss://socomunzipped.com/ws' });
  });

  it('&mp overrides it with this page own host, ws or wss by the page protocol -- on a deployed page that is its Shared service (TRS-1)', () => {
    expect(resolveOnline('?mode=play&mp', 'off', HTTP)).toEqual({ choice: 'url', url: 'ws://localhost:5173/ws', fromUrl: true });
    expect(resolveOnline('?mp', 'local', HTTPS)).toEqual({ choice: 'shared', url: 'wss://socomunzipped.com/ws', fromUrl: true });   // was 'url'
  });

  it('&server= names the server, and shows as the matching choice when it is Shared or Local', () => {
    expect(resolveOnline('?mp&server=ws://127.0.0.1:9000/ws', 'shared', HTTP)).toMatchObject({ choice: 'url', url: 'ws://127.0.0.1:9000/ws', fromUrl: true });
    expect(resolveOnline(`?server=${LOCAL_SERVER}`, 'off', HTTP)).toMatchObject({ choice: 'local', url: LOCAL_SERVER, fromUrl: true });
    expect(resolveOnline(`?mp&server=${LOCAL_STACK_SERVER}`, null, HTTP)).toMatchObject({ choice: 'shared', url: LOCAL_STACK_SERVER, fromUrl: true });
  });

  it('carries the latency injector with a server, from the URL or the setting, and not with Off', () => {
    expect(resolveOnline('?mp&lag=100&loss=2', null, HTTP).simulate).toEqual({ latencyMs: 100, jitterMs: 20, loss: 0.02 });
    expect(resolveOnline('?lag=50', 'local', HTTP).simulate).toEqual({ latencyMs: 50, jitterMs: 10, loss: 0 });
    expect(resolveOnline('?lag=50', 'off', HTTP).simulate).toBeUndefined();
  });
});

describe('the remembered choice', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('is Off on a first visit, and what was written after', () => {
    expect(resolveOnline('', readOnline(), HTTP).choice).toBe('off');
    writeOnline('local');
    expect(localStorage.getItem(ONLINE_KEY)).toBe('local');
    expect(resolveOnline('', readOnline(), HTTP)).toMatchObject({ choice: 'local', url: LOCAL_SERVER });
    writeOnline('off');
    expect(resolveOnline('', readOnline(), HTTP).url).toBeNull();
  });

  it('survives a storage that throws: Off, and no exception', () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('private window'); };
    Storage.prototype.setItem = () => { throw new Error('private window'); };
    try {
      expect(readOnline()).toBeNull();
      expect(() => writeOnline('shared')).not.toThrow();
    } finally {
      Storage.prototype.getItem = get;
      Storage.prototype.setItem = set;
    }
  });
});

describe('the connection line, and the retry', () => {
  it('says off, the offline match, connecting, online with the players, unreachable with the wait, refused with the reason', () => {
    const base = { players: 0, retryIn: 0, watching: false };
    expect(onlineLine({ ...base, state: 'off' })).toEqual({ text: 'single player: no server', lamp: null });
    // the offline match running (`./net/loopback`) is a match, not "single player": the line says which
    expect(onlineLine({ ...base, state: 'offline', players: 1 })).toEqual({ text: 'offline match · no server', lamp: null });
    expect(onlineLine({ ...base, state: 'connecting' })).toEqual({ text: 'connecting ...', lamp: null });
    expect(onlineLine({ ...base, state: 'online', players: 1 })).toEqual({ text: 'online · 1 player', lamp: 'up' });
    expect(onlineLine({ ...base, state: 'online', players: 5, watching: true })).toEqual({ text: 'online · 5 players · watching', lamp: 'up' });
    // the countdown rides beside the line, not in it: the line sits in a polite live region, and a text that changed
    // every second would be announced every second (review 2 m-11)
    expect(onlineLine({ ...base, state: 'retrying', retryIn: 3.2 })).toEqual({ text: 'server unreachable · retrying', lamp: 'down', countdown: 'in 4 s' });
    expect(onlineLine({ ...base, state: 'retrying', retryIn: 0 }).countdown).toBe('in 1 s');
    expect(onlineLine({ ...base, state: 'refused', reason: 'The game is full.' })).toEqual({ text: 'refused: The game is full.', lamp: 'down' });
  });

  it('keeps the live line stable while the retry counts down: only the countdown changes (review 2 m-11)', () => {
    const base = { players: 0, watching: false, state: 'retrying' as const };
    const lines = [1, 4, 59].map((retryIn) => onlineLine({ ...base, retryIn }));
    expect(new Set(lines.map((l) => l.text))).toEqual(new Set(['server unreachable · retrying']));
    expect(lines.map((l) => l.countdown)).toEqual(['in 1 s', 'in 4 s', 'in 59 s']);
    for (const state of ['off', 'offline', 'connecting', 'online', 'refused'] as const) {
      expect(onlineLine({ ...base, state, retryIn: 3 }).countdown, state).toBeUndefined();
    }
  });

  it('reconnects a reached match at once, then 2, 4 ... 10 s, and 2, 4 ... 60 s to a server never reached', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => retryDelayMs(n, true))).toEqual([0, 2000, 4000, 8000, 10000, 10000]);
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => retryDelayMs(n, false))).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });

  // 2026-09-30, the owner's play test: Online = Local with no server on 8787 read only "server unreachable".
  it('a local server never reached: retried every 3 s (no backoff); once reached, at once then 2 ... 10 s', () => {
    expect(LOCAL_RETRY_MS).toBe(3000);
    expect([0, 1, 2, 5, 20].map((n) => retryDelayMs(n, false, true))).toEqual([3000, 3000, 3000, 3000, 3000]);
    expect([0, 1, 4].map((n) => retryDelayMs(n, true, true))).toEqual([0, 2000, 10000]);
    // 0 is "not scheduled yet": a wait of 0 at clock 0 must still come due, or the page reschedules forever.
    expect(retryDueAt(0, 0)).toBeGreaterThan(0);
    expect(retryDueAt(1_000, 0)).toBe(1_000);
    expect(retryDueAt(1_000, 1_000)).toBe(2_000);
  });

  it('says in plain words what to do when the local server is not running -- the line and the toast', () => {
    const base = { players: 0, retryIn: 2.5, watching: false, state: 'retrying' as const };
    expect(onlineLine({ ...base, local: true })).toEqual({
      text: `no local match server · start it with ${LOCAL_START}`, lamp: 'down', countdown: 'in 3 s',
    });
    expect(LOCAL_START).toBe('npm start -w @s2u/central');
    expect(onlineToast({ ...base, local: true })).toBe('Online: no local match server -- start it with npm start -w @s2u/central; the page joins it once it is up');
    expect(onlineToast(base)).toBe('Online: the match server is unreachable; retrying');
    expect(onlineToast({ ...base, state: 'online' })).toBe('Online: in the match');
    expect(onlineToast({ ...base, state: 'online', watching: true })).toBe('Online: watching the match');
    for (const state of ['off', 'offline', 'connecting', 'refused'] as const) expect(onlineToast({ ...base, state }), state).toBeNull();
  });

  it('TRS-2: Shared on a local page with no local stack says how to start it -- the line and the toast', () => {
    const base = { players: 0, retryIn: 2.5, watching: false, state: 'retrying' as const, stack: true };
    expect(STACK_START).toBe('npm run dev:stack');
    expect(onlineLine(base)).toEqual({ text: 'no local stack · start it with npm run dev:stack', lamp: 'down', countdown: 'in 3 s' });
    expect(onlineToast(base)).toBe('Online: no local stack -- start it with npm run dev:stack; the page joins it once it is up');
    expect(onlineLine({ ...base, state: 'refused', reason: NO_SHARED_ROOM })).toEqual({ text: 'refused: no shared room is up right now', lamp: 'down' });
  });

  it("LATER 262: the stack's start line only while the stack's /rooms is not read; once read, a failed pass is the server's line", () => {
    const at = (stack: boolean, listed: boolean) => roomRetryStatus(4000, { stack, listed, watching: false });
    expect(at(true, false)).toEqual({ state: 'retrying', players: 0, retryIn: 4, watching: false, stack: true });
    expect(onlineLine(at(true, false)).text).toBe('no local stack · start it with npm run dev:stack');
    // the stack up, its /rooms read, the pass refused or failed (a page on another port than 5342: the origin check)
    expect(at(true, true)).toEqual({ state: 'retrying', players: 0, retryIn: 4, watching: false });
    expect(onlineLine(at(true, true)).text).toBe('server unreachable · retrying');
    for (const listed of [false, true]) expect(at(false, listed), `deployed, listed ${listed}`).toEqual({ state: 'retrying', players: 0, retryIn: 4, watching: false });
    expect(roomRetryStatus(2000, { stack: false, listed: true, watching: true }).watching).toBe(true);
  });

  it("LATER 263: a server that does not serve /rooms says so -- refused, the route named, no countdown", () => {
    expect(NO_ROOMS_ROUTE).toContain('/rooms');
    expect(onlineLine({ state: 'refused', reason: NO_ROOMS_ROUTE, players: 0, retryIn: 0, watching: false })).toEqual({ text: `refused: ${NO_ROOMS_ROUTE}`, lamp: 'down' });
  });
});

/**
 * TR-2 (the test room's maps plan, TR.R3; research 307; the owner's playtest, 2026-10-12: "When in testroom mode, LOCAL
 * online just says 'no such map'."): the server refuses a hello for a map outside its `MAPS` with code 4004 and the
 * reason 'no such map', its log's detail `{ map }` the hello's map (`packages/match/src/server.ts` :806); the frame the
 * page hears carries the reason only (:918). The page names the map its refused hello asked for after the server's words,
 * on the Online line and in a toast; every other refusal keeps today's words.
 */
describe('TR-2: a refusal for a map the server does not play names the map', () => {
  const base = { players: 0, retryIn: 0, watching: false, state: 'refused' as const };

  it('the server\'s words, verbatim', () => {
    expect(NO_SUCH_MAP).toBe('no such map');
  });

  it('the line and the toast: the server\'s reason, then the map', () => {
    const s = withRefusalMap({ ...base, reason: 'no such map' }, { reason: 'no such map', map: 'MP6' });
    expect(s.map).toBe('MP6');
    expect(onlineLine(s)).toEqual({ text: 'refused: no such map (MP6)', lamp: 'down' });
    expect(onlineToast(s)).toBe('Online: refused: no such map (MP6)');
  });

  it('other refusals keep today\'s words: the line unchanged, no toast, no map carried', () => {
    for (const reason of ['The game is full.', 'no such rules', 'no hello', 'server closing']) {
      const s = withRefusalMap({ ...base, reason }, { reason, map: 'MP6' });
      expect(s.map, reason).toBeUndefined();
      expect(onlineLine(s), reason).toEqual({ text: `refused: ${reason}`, lamp: 'down' });
      expect(onlineToast(s), reason).toBeNull();
    }
    expect(onlineLine({ ...base })).toEqual({ text: 'refused: by the server', lamp: 'down' });
  });

  it('no map without the client\'s refusal, or with another refusal than the status\'s, or in another state', () => {
    expect(withRefusalMap({ ...base, reason: 'no such map' }, null).map).toBeUndefined();
    expect(withRefusalMap({ ...base, reason: 'no such map' }, { reason: 'The game is full.', map: 'MP6' }).map).toBeUndefined();
    const retrying = { ...base, state: 'retrying' as const };
    expect(withRefusalMap(retrying, { reason: 'no such map', map: 'MP6' })).toBe(retrying);
    expect(onlineLine({ ...base, reason: 'no such map' })).toEqual({ text: 'refused: no such map', lamp: 'down' });
    expect(onlineToast({ ...base, reason: 'no such map' })).toBeNull();
  });
});
