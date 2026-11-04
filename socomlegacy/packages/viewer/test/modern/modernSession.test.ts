// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOBBY_KEEPALIVE_MS, LOGOUT_TIMEOUT_MS, MEDIUS_STATUS } from '@s2u/ui';
import { fetchAccountService } from '../../src/connectHost';
import { SESSION_STORAGE_KEY } from '../../src/net/session';
import { MU_REMEMBER_ME_ENABLED, MU_SIGNED_IN_ELSEWHERE_ADAPTATION, createSession, type SessionSnapshot } from '../../src/modern/session';

/**
 * MU-2's session store (`src/modern/session.ts`): a browser adaptation (MU.R1) over the original page's own account
 * client (`../../src/connectHost` `fetchAccountService`, the service the original's LOGIN uses). The wire is that
 * module's; these tests hold what the modern store does with it, through a mocked `fetch`.
 */

const BASE = 'https://lobby.test';
/** Generated per run: never a real credential. */
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 8)}`;

interface Call { url: string; init: RequestInit; body: Record<string, unknown> | null }
type Answer = { http?: number; body?: unknown } | 'reject' | 'hang';

function fakeFetch(answers: Partial<Record<string, Answer[]>>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ url, init, body });
    const path = url.slice(BASE.length);
    const a = answers[path]?.shift() ?? { http: 200, body: { status: 0 } };
    if (a === 'reject') throw new TypeError('Failed to fetch');
    if (a === 'hang') return new Promise<Response>(() => {});
    const http = a.http ?? 200;
    return new Response(a.body === undefined || http === 204 ? null : JSON.stringify(a.body), { status: http });
  }) as typeof fetch;
  return { fetch: fn, calls };
}

/** Timers a test runs by hand. */
function clock(): { every: (ms: number, fn: () => void) => () => void; after: (ms: number, fn: () => void) => () => void;
  tick(ms: number): void; repeating: Map<number, number> } {
  const repeating = new Map<number, number>();
  const reps: { ms: number; fn: () => void; on: boolean }[] = [];
  const once: { ms: number; fn: () => void; on: boolean }[] = [];
  return {
    repeating,
    every(ms, fn) { const r = { ms, fn, on: true }; reps.push(r); repeating.set(ms, (repeating.get(ms) ?? 0) + 1); return () => { r.on = false; repeating.set(ms, repeating.get(ms)! - 1); }; },
    after(ms, fn) { const o = { ms, fn, on: true }; once.push(o); return () => { o.on = false; }; },
    tick(ms) {
      for (const r of reps) if (r.on && r.ms === ms) r.fn();
      for (const o of once) if (o.on && o.ms === ms) { o.on = false; o.fn(); }
    },
  };
}
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe('the modern session store', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('starts signed out, with no account and no ticket', () => {
    const s = createSession(fetchAccountService(BASE, fakeFetch({}).fetch));
    expect(s.state()).toBe('signed-out');
    expect(s.account()).toBeNull();
    expect(s.ticket()).toBeNull();
    expect(s.error()).toBeNull();
  });

  it('signs in through the original client: signed-out -> signing-in -> agreement -> (Accept) signed-in, the login body as the original posts it', async () => {
    const name = gen('n'); const password = gen('p'); const ticket = gen('t');
    const f = fakeFetch({ '/account/login': [{ body: { status: MEDIUS_STATUS.Success, ticket } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const seen: SessionSnapshot['state'][] = [];
    s.onChange((snap) => seen.push(snap.state));
    const r = await s.signIn({ name, password });
    expect(r).toEqual({ ok: true });
    // MU-13a: the USER AGREEMENT comes between the login and the signed-in state, the ticket held back until Accept.
    expect(seen).toEqual(['signing-in', 'agreement']);
    expect(s.state()).toBe('agreement');
    expect(s.account()).toEqual({ name });
    expect(s.ticket()).toBeNull();
    s.accept!();
    expect(seen).toEqual(['signing-in', 'agreement', 'signed-in']);
    expect(s.state()).toBe('signed-in');
    expect(s.ticket()).toBe(ticket);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe(`${BASE}/account/login`);
    expect(f.calls[0]!.init.method).toBe('POST');
    expect(f.calls[0]!.body).toEqual({ name, password, savePassword: false });
  });

  it.each([
    [MEDIUS_STATUS.AccountNotFound, 'not-found'],
    [MEDIUS_STATUS.AccountLoggedIn, 'logged-in'],
    [MEDIUS_STATUS.InvalidPassword, 'bad-password'],
    [MEDIUS_STATUS.LoginFailed, 'failed'],
    [MEDIUS_STATUS.Fail, 'failed'],
  ])('a login answered %i reads as %s, signed out, with words and no number', async (status, code) => {
    const f = fakeFetch({ '/account/login': [{ body: { status } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const r = await s.signIn({ name: gen('n'), password: gen('p') });
    expect(r.ok).toBe(false);
    expect(s.state()).toBe('signed-out');
    expect(s.error()?.code).toBe(code);
    expect(s.error()?.status).toBe(status);
    expect(s.error()?.message).not.toMatch(/-?\d{3}/);
    expect(s.ticket()).toBeNull();
  });

  it('an HTTP refusal with no status reads as the original client reads it (MediusFail), and no answer as unreachable', async () => {
    const f = fakeFetch({ '/account/login': [{ http: 403 }, 'reject'] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(s.error()).toMatchObject({ code: 'failed', status: MEDIUS_STATUS.Fail });
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(s.error()).toMatchObject({ code: 'unreachable', status: null });
    expect(s.state()).toBe('signed-out');
  });

  it('create posts /account/create, then logs in as the original registration chain does', async () => {
    const name = gen('n'); const password = gen('p'); const ticket = gen('t');
    const f = fakeFetch({ '/account/create': [{ body: { status: 0 } }], '/account/login': [{ body: { status: 0, ticket } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    expect(await s.create({ name, password })).toEqual({ ok: true });
    expect(f.calls.map((c) => c.url)).toEqual([`${BASE}/account/create`, `${BASE}/account/login`]);
    expect(f.calls[0]!.body).toEqual({ name, password });
    expect(s.state()).toBe('agreement');   // MU-13a: the agreement follows the registration's login too
    s.accept!();
    expect(s.state()).toBe('signed-in');
    expect(s.ticket()).toBe(ticket);
  });

  it.each([
    [MEDIUS_STATUS.AccountAlreadyExists, 'name-taken'],
    [MEDIUS_STATUS.RegistrationFailed, 'not-accepted'],
    [MEDIUS_STATUS.Fail, 'create-failed'],
  ])('a create answered %i reads as %s and does not log in', async (status, code) => {
    const f = fakeFetch({ '/account/create': [{ body: { status } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const r = await s.create({ name: gen('n'), password: gen('p') });
    expect(r.ok).toBe(false);
    expect(s.error()?.code).toBe(code);
    expect(f.calls).toHaveLength(1);
    expect(s.state()).toBe('signed-out');
  });

  it('sign out posts /account/logout with the ticket and ends signed out', async () => {
    const ticket = gen('t');
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    await s.signIn({ name: gen('n'), password: gen('p') });
    await s.signOut();
    expect(f.calls[1]!.url).toBe(`${BASE}/account/logout`);
    expect(f.calls[1]!.body).toEqual({ ticket });
    expect(s.state()).toBe('signed-out');
    expect(s.account()).toBeNull();
    expect(s.ticket()).toBeNull();
  });

  it('a logout the server never answers ends the session here after LOGOUT_TIMEOUT_MS (as the original client)', async () => {
    const c = clock();
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }], '/account/logout': ['hang'] });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    const out = s.signOut();
    expect(s.state()).toBe('signed-out');
    c.tick(LOGOUT_TIMEOUT_MS);
    await out;
    expect(s.state()).toBe('signed-out');
  });

  it('keeps the session alive every LOBBY_KEEPALIVE_MS with the ticket as bearer; a 401 is the session lost', async () => {
    const c = clock(); const ticket = gen('t');
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket } }], '/lobby/update-user-state': [{ http: 204 }, { http: 401 }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(1);   // from the login: the session is up under the agreement
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(f.calls[1]!.url).toBe(`${BASE}/lobby/update-user-state`);
    expect((f.calls[1]!.init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${ticket}`);
    expect(s.state()).toBe('signed-in');
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(s.state()).toBe('signed-out');
    expect(s.error()?.code).toBe('session-lost');
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(0);
  });

  it('MU_SIGNED_IN_ELSEWHERE_ADAPTATION: a 401 the server says was a takeover (the why asked once) is said as signed in elsewhere', async () => {
    expect(MU_SIGNED_IN_ELSEWHERE_ADAPTATION.length).toBeGreaterThan(0);
    const c = clock(); const ticket = gen('t');
    const f = fakeFetch({
      '/account/login': [{ body: { status: 0, ticket } }],
      '/lobby/update-user-state': [{ http: 401, body: { reason: 'taken-over' } }, { http: 401, body: { reason: 'taken-over' } }],
    });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(f.calls.filter((x) => x.url.endsWith('/lobby/update-user-state'))).toHaveLength(2);   // the renewal, then the why
    expect(s.state()).toBe('signed-out');
    expect(s.error()).toEqual({ code: 'signed-in-elsewhere', status: null, message: 'Signed out: this account signed in elsewhere' });
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(0);
  });

  it('MU_SIGNED_IN_ELSEWHERE_ADAPTATION: no reason, or no answer to the why, stays session-lost', async () => {
    for (const why of [{ http: 401 }, 'reject'] as Answer[]) {
      const c = clock();
      const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }], '/lobby/update-user-state': [{ http: 401 }, why] });
      const s = createSession(fetchAccountService(BASE, f.fetch), c);
      await s.signIn({ name: gen('n'), password: gen('p') });
      s.accept!();
      c.tick(LOBBY_KEEPALIVE_MS); await flush();
      expect(s.error()?.code).toBe('session-lost');
    }
  });

  it('close() logs out without waiting and stops the keep-alive (before the original front end logs in)', async () => {
    const c = clock(); const ticket = gen('t');
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket } }], '/account/logout': ['hang'] });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    s.close();
    expect(s.state()).toBe('signed-out');
    expect(f.calls.at(-1)!.body).toEqual({ ticket });
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(0);
  });

  it('keeps the ticket where the original page keeps it -- memory only: no storage, no cookie, the match token untouched', async () => {
    const ticket = gen('t'); const name = gen('n');
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket } }] });
    const cookieBefore = document.cookie;
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    await s.signIn({ name, password: gen('p') });
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    for (let i = 0; i < sessionStorage.length; i++) expect(sessionStorage.key(i)!.startsWith(SESSION_STORAGE_KEY)).toBe(false);
    expect(document.cookie).toBe(cookieBefore);
    expect(f.calls[0]!.init.credentials).toBe('omit');
  });

  it('OT.R61: Remember me is on (MU_REMEMBER_ME_ENABLED), but a session made without a remember service remembers nothing: savePassword false, omitted', async () => {
    expect(MU_REMEMBER_ME_ENABLED).toBe(true);
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    expect(s.remembers()).toBe(false);
    await s.signIn({ name: gen('n'), password: gen('p'), remember: true });
    expect(f.calls[0]!.body!['savePassword']).toBe(false);
    expect(f.calls[0]!.init.credentials).toBe('omit');
  });

  /** OT.R61 (PERSONA-PERSIST (a)): a session over the three services `pageSession` builds (`AccountRequestOptions`). */
  const INCLUDE = 'include' as const;
  const threeServices = (f: ReturnType<typeof fakeFetch>) => createSession(fetchAccountService(BASE, f.fetch), {
    ...clock(), services: {
      remember: fetchAccountService(BASE, f.fetch, undefined, undefined, { credentials: INCLUDE }),
      forget: fetchAccountService(BASE, f.fetch, undefined, undefined, { forget: true }),
    },
  });

  it('OT.R61: ticked, the remember service (step 1: savePassword true, included); unticked, the plain one (savePassword false, omitted)', async () => {
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }, { body: { status: 0, ticket: gen('t') } }] });
    const s = threeServices(f);
    expect(s.remembers()).toBe(true);
    const pw = gen('p');
    await s.signIn({ name: 'a', password: pw, remember: true });
    await s.signOut();
    await s.signIn({ name: 'a', password: pw, remember: false });
    await s.signOut();
    await s.signIn({ name: 'a', password: pw });
    const ins = f.calls.filter((c) => c.url.endsWith('/account/login'));
    expect(ins.map((c) => [c.init.credentials, c.body!['savePassword']])).toEqual([['include', true], ['omit', false], ['omit', false]]);
  });

  it('OT.R61: the quick sign-in is one request, no password, the credentials included (step 2); -978 is said as a wrong password with its status', async () => {
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }, { body: { status: MEDIUS_STATUS.InvalidPassword } }] });
    const s = threeServices(f);
    expect(await s.quickSignIn!('a')).toEqual({ ok: true });
    expect(s.state()).toBe('agreement');                             // the agreement, as every sign-in
    await s.signOut();
    const r = await s.quickSignIn!('a');
    expect(r.ok ? null : [r.error.code, r.error.status]).toEqual(['bad-password', MEDIUS_STATUS.InvalidPassword]);
    const ins = f.calls.filter((c) => c.url.endsWith('/account/login'));
    expect(ins.map((c) => [c.init.credentials, c.body])).toEqual([['include', { name: 'a', savePassword: true }], ['include', { name: 'a', savePassword: true }]]);
    // A session without the remember service tries none.
    const g = fakeFetch({});
    expect((await createSession(fetchAccountService(BASE, g.fetch), clock()).quickSignIn!('a')).ok).toBe(false);
    expect(g.calls).toEqual([]);
  });

  it('OT.R61: signOut({ forget }) is step 6 through the forget service; a plain sign-out, the pagehide close and START\'s end are step 5, whichever service signed in', async () => {
    const outs = async (run: (s: ReturnType<typeof threeServices>) => Promise<void> | void): Promise<unknown[]> => {
      const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: 'tkt' } }] });
      const s = threeServices(f);
      await s.signIn({ name: 'a', password: gen('p'), remember: true });
      await run(s);
      await flush();
      return f.calls.filter((c) => c.url.endsWith('/account/logout')).map((c) => [c.init.credentials, c.body]);
    };
    expect(await outs((s) => s.signOut({ forget: true }))).toEqual([['include', { ticket: 'tkt', forget: true }]]);
    expect(await outs((s) => s.signOut())).toEqual([['omit', { ticket: 'tkt' }]]);
    expect(await outs((s) => s.signOut({ forget: false }))).toEqual([['omit', { ticket: 'tkt' }]]);
    expect(await outs((s) => { s.close(); })).toEqual([['omit', { ticket: 'tkt' }]]);
    expect(await outs((s) => s.end!() ?? undefined)).toEqual([['omit', { ticket: 'tkt' }]]);
  });

  it('OT.R61: the session never reads document.cookie, and keeps no password in either storage', async () => {
    const get = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!.get!;
    let reads = 0;
    Object.defineProperty(document, 'cookie', { configurable: true, get() { reads++; return get.call(document) as string; }, set() { /* none */ } });
    try {
      const pw = gen('p');
      const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }, { body: { status: 0, ticket: gen('t') } }] });
      const s = threeServices(f);
      await s.signIn({ name: 'a', password: pw, remember: true });
      await s.signOut();
      await s.quickSignIn!('a');
      await s.signOut({ forget: true });
      expect(reads).toBe(0);
      for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) expect(st.getItem(st.key(i)!)).not.toContain(pw);
    } finally { delete (document as unknown as Record<string, unknown>)['cookie']; }
  });

  it('a second sign-in while one is in flight is refused, and a reply after sign out is dropped', async () => {
    let answer: (r: Response) => void = () => {};
    const fn = ((url: string) => (url.endsWith('/account/login')
      ? new Promise<Response>((ok) => { answer = ok; })
      : Promise.resolve(new Response(JSON.stringify({ status: 0 }))))) as unknown as typeof fetch;
    const s = createSession(fetchAccountService(BASE, fn), clock());
    const first = s.signIn({ name: gen('n'), password: gen('p') });
    expect((await s.signIn({ name: gen('n'), password: gen('p') })).ok).toBe(false);
    await s.signOut();
    answer(new Response(JSON.stringify({ status: 0, ticket: gen('t') })));
    await first;
    expect(s.state()).toBe('signed-out');
    expect(s.ticket()).toBeNull();
  });

  /** A fetch whose answers to one path are released by hand; every other path answers `{ status: 0 }` at once. */
  function heldFetch(held: string): { fetch: typeof fetch; calls: Call[]; release(body: unknown): void; pending(): number } {
    const calls: Call[] = [];
    const waiting: ((r: Response) => void)[] = [];
    const fn = ((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
      if (url.endsWith(held)) return new Promise<Response>((ok) => { waiting.push(ok); });
      return Promise.resolve(new Response(JSON.stringify({ status: 0 })));
    }) as typeof fetch;
    return { fetch: fn, calls, release: (body) => { waiting.shift()!(new Response(JSON.stringify(body))); }, pending: () => waiting.length };
  }

  it('a login that succeeds after sign out is logged out, and the next sign-in waits for that logout', async () => {
    const stale = gen('t'); const fresh = gen('t');
    const f = heldFetch('/account/login');
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const first = s.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    await s.signOut();                                   // no ticket yet: nothing to log out
    expect(f.calls.filter((c) => c.url.endsWith('/account/logout'))).toHaveLength(0);
    f.release({ status: 0, ticket: stale });
    await first;
    const outs = f.calls.filter((c) => c.url.endsWith('/account/logout'));
    expect(outs.map((c) => c.body)).toEqual([{ ticket: stale }]);
    expect(s.state()).toBe('signed-out');
    expect(s.ticket()).toBeNull();
    // The next sign-in's login goes out only after that logout.
    const second = s.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    const order = f.calls.map((c) => c.url.slice(BASE.length));
    expect(order.lastIndexOf('/account/login')).toBeGreaterThan(order.indexOf('/account/logout'));
    f.release({ status: 0, ticket: fresh });
    expect(await second).toEqual({ ok: true });
    s.accept!();
    expect(s.ticket()).toBe(fresh);
  });

  it('a create whose login succeeds after sign out is logged out too', async () => {
    const stale = gen('t');
    const f = heldFetch('/account/login');
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const first = s.create({ name: gen('n'), password: gen('p') });
    await flush();
    expect(f.pending()).toBe(1);                         // the create answered; its login waits
    await s.signOut();
    f.release({ status: 0, ticket: stale });
    await first;
    expect(f.calls.filter((c) => c.url.endsWith('/account/logout')).map((c) => c.body)).toEqual([{ ticket: stale }]);
    expect(s.state()).toBe('signed-out');
  });

  it('a sign-in after a sign out during signing-in waits for the first attempt instead of racing it', async () => {
    const f = heldFetch('/account/login');
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const first = s.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    await s.signOut();
    const second = s.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    expect(f.calls.filter((c) => c.url.endsWith('/account/login'))).toHaveLength(1);   // the second waits
    f.release({ status: MEDIUS_STATUS.InvalidPassword });                                 // the first ends, refused
    await first;
    await flush();
    expect(f.calls.filter((c) => c.url.endsWith('/account/login'))).toHaveLength(2);   // now the second goes
    const fresh = gen('t');
    f.release({ status: 0, ticket: fresh });
    expect(await second).toEqual({ ok: true });
    s.accept!();
    expect(s.ticket()).toBe(fresh);
    expect(s.error()).toBeNull();
  });

  it('onChange answers its unsubscribe', async () => {
    const s = createSession(fetchAccountService(BASE, fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }] }).fetch), clock());
    let n = 0;
    const off = s.onChange(() => { n++; });
    off();
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(n).toBe(0);
  });
});

/**
 * MU2-2 (`docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`): the states the row names, held at the store -- the
 * server's HTTP refusals of `/account/login` and `/account/create` (`packages/central/src/accountHttp.ts`
 * `accountHandler`: 403 a refused Origin with no body, 400 a malformed body with none, 429 a limited attempt with the
 * status the service gave it) read as the body's status, or MediusFail with none (`ACCOUNT_HTTP_REFUSAL_ADAPTATION`);
 * the session lost and signed in again; each state's snapshot as `onChange` reports it.
 */
describe('the modern session store, state by state (MU2-2)', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it.each([
    ['login', 429, { status: MEDIUS_STATUS.LoginFailed }, 'failed', MEDIUS_STATUS.LoginFailed],
    ['login', 403, undefined, 'failed', MEDIUS_STATUS.Fail],
    ['login', 400, undefined, 'failed', MEDIUS_STATUS.Fail],
    ['create', 429, { status: MEDIUS_STATUS.RegistrationFailed }, 'not-accepted', MEDIUS_STATUS.RegistrationFailed],
    ['create', 403, undefined, 'create-failed', MEDIUS_STATUS.Fail],
    ['create', 400, undefined, 'create-failed', MEDIUS_STATUS.Fail],
  ] as const)('/account/%s answered HTTP %i: read as the status its body carries, else MediusFail; signed out, nothing more sent', async (route, http, body, code, status) => {
    const f = fakeFetch({ [`/account/${route}`]: [{ http, ...(body ? { body } : {}) }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    const q = { name: gen('n'), password: gen('p') };
    const r = route === 'login' ? await s.signIn(q) : await s.create(q);
    expect(r).toEqual({ ok: false, error: s.error() });
    expect(s.error()).toMatchObject({ code, status });
    expect(s.state()).toBe('signed-out');
    expect(f.calls.map((c) => c.url)).toEqual([`${BASE}/account/${route}`]);
  });

  it('each refusal has its own words, none a number, and one code to one wording', async () => {
    const statuses = [MEDIUS_STATUS.AccountNotFound, MEDIUS_STATUS.AccountLoggedIn, MEDIUS_STATUS.InvalidPassword, MEDIUS_STATUS.LoginFailed];
    const seen = new Map<string, string>();
    for (const status of statuses) {
      const s = createSession(fetchAccountService(BASE, fakeFetch({ '/account/login': [{ body: { status } }] }).fetch), clock());
      await s.signIn({ name: gen('n'), password: gen('p') });
      seen.set(s.error()!.code, s.error()!.message);
    }
    for (const status of [MEDIUS_STATUS.AccountAlreadyExists, MEDIUS_STATUS.RegistrationFailed, MEDIUS_STATUS.Fail]) {
      const s = createSession(fetchAccountService(BASE, fakeFetch({ '/account/create': [{ body: { status } }] }).fetch), clock());
      await s.create({ name: gen('n'), password: gen('p') });
      seen.set(s.error()!.code, s.error()!.message);
    }
    const missing = createSession(fetchAccountService(BASE, fakeFetch({}).fetch), clock());
    await missing.signIn({ name: '', password: '' });
    seen.set(missing.error()!.code, missing.error()!.message);
    expect([...seen.keys()].sort()).toEqual(['bad-password', 'create-failed', 'failed', 'logged-in', 'missing', 'name-taken', 'not-accepted', 'not-found']);
    expect(new Set(seen.values()).size).toBe(seen.size);
    for (const m of seen.values()) expect(m).not.toMatch(/\d/);
  });

  it('the session lost, then signed in again: a new login, a new keep-alive, the old one stopped', async () => {
    const c = clock(); const first = gen('t'); const second = gen('t'); const name = gen('n');
    const f = fakeFetch({
      '/account/login': [{ body: { status: 0, ticket: first } }, { body: { status: 0, ticket: second } }],
      '/lobby/update-user-state': [{ http: 401 }, { http: 204 }],
    });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    const seen: SessionSnapshot[] = [];
    s.onChange((snap) => seen.push(snap));
    await s.signIn({ name, password: gen('p') });
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(s.state()).toBe('signed-out');
    expect(s.error()).toMatchObject({ code: 'session-lost', status: null });
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(0);
    expect(f.calls.filter((x) => x.url.endsWith('/account/logout'))).toHaveLength(0);   // the server ended it: nothing to log out
    expect(await s.signIn({ name, password: gen('p') })).toEqual({ ok: true });
    s.accept!();
    expect(s.ticket()).toBe(second);
    expect(s.error()).toBeNull();
    expect(c.repeating.get(LOBBY_KEEPALIVE_MS)).toBe(1);
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect((f.calls.at(-1)!.init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${second}`);
    expect(seen.map((x) => x.state)).toEqual(['signing-in', 'agreement', 'signed-in', 'signed-out', 'signing-in', 'agreement', 'signed-in']);
    expect(seen.map((x) => x.error?.code ?? null)).toEqual([null, null, null, 'session-lost', null, null, null]);
  });

  it('a keep-alive with no answer (rejected) or a 5xx changes nothing: the session stands', async () => {
    const c = clock();
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket: gen('t') } }], '/lobby/update-user-state': ['reject', { http: 503 }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(s.state()).toBe('signed-in');
    expect(s.error()).toBeNull();
  });

  it('a sign-out during the agreement (DECLINE, YES) logs the held ticket out and ends signed out with no refusal', async () => {
    const ticket = gen('t');
    const f = fakeFetch({ '/account/login': [{ body: { status: 0, ticket } }] });
    const s = createSession(fetchAccountService(BASE, f.fetch), clock());
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(s.state()).toBe('agreement');
    await s.signOut();
    expect(f.calls.at(-1)).toMatchObject({ url: `${BASE}/account/logout`, body: { ticket } });
    expect(s.state()).toBe('signed-out');
    expect(s.error()).toBeNull();
    s.accept!();                                     // ACCEPT after it does nothing
    expect(s.state()).toBe('signed-out');
  });
});
