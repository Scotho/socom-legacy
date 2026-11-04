// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOBBY_KEEPALIVE_MS, LOGOUT_TIMEOUT_MS, MEDIUS_STATUS, type LobbyService } from '@s2u/ui';
import type { AssetSource } from '@s2u/archive';
import { bootPage, type PageEntry, type PageLoaders } from '../../src/pageEntry';
import type { FrontEndMount } from '../../src/frontEnd';
import { beforeLaunch, launchPending, registerBeforeLaunch } from '../../src/modern/launchGate';
import { createSession, endForLaunch, type ModernSession, type SessionSnapshot } from '../../src/modern/session';
import type { LauncherSnapshot, LauncherState } from '../../src/modern/launcherState';

vi.mock('../../src/touch', () => ({ touchDevice: vi.fn(() => false) }));

/**
 * MU-F2a (dot's compatibility review, 2026-10-10 05:28:33Z P1; re-raised 05:37:26Z): the shared START boundary. The
 * server holds one session per account and refuses a second live login AccountLoggedIn (-997; `central/src/accounts.ts`
 * `login`), so a modern sign-in left live when the original's front end mounts makes the original's own LOGIN of the
 * same account fail. (Since SESSION-TAKEOVER, 2026-10-15, the real server refuses only a session a socket holds and takes
 * over one none holds, `SESSION_TAKEOVER_ADAPTATION`; this test's fake keeps the stricter rule on purpose, so the
 * boundary is still proven to end the modern session before the LOGIN, whichever rule the server keeps.) Every START -- the footer's Start game, the pad's START (both `../../src/startup` `Startup`'s
 * click) and the Lobbies section's Launch (which presses that same click) -- passes `../../src/pageEntry`'s launch,
 * which now awaits the page's before-launch hooks (`../../src/modern/launchGate`, bounded by LOGOUT_TIMEOUT_MS) before
 * the setup page goes and the front end mounts. The modern session registers one (`registerSessionForLaunch`, by the
 * shell in setup mode): its logout awaited, its keep-alive stopped, a sign-in in flight cancelled and the logout of any
 * session the server opened for it awaited. Signed out, offline, or with the modern chunk never loaded, nothing is
 * awaited and START mounts at once, as before. A browser adaptation's wiring (MU.R1): nothing of the game changes.
 * CX-9b (CX.R8): the setup page's START (`Startup`, its footer button and its pad poll) went with the old layout; the
 * plain page's launch -- the image opening, `../../src/pageEntry` `offerDisc` -- passes the same boundary, so the
 * cases below open an image where they pressed START, and the pad's START and the Lobbies section's Launch (which
 * pressed that START, `pageStart`) went with it. CX-25: the modern shell (`mountShell`, whose setup mode registered the
 * session) is retired; the overlay's own session on the disc page registers through `registerBeforeLaunch` over
 * `endForLaunch` (`../../src/modern/overlay/index.ts`, its `startBoundary`). The shell's two cases are named in CX-25's
 * commit and the console plan's Log. CX-26: `registerSessionForLaunch`, the same registration kept for the retired
 * shell, is retired; the cases below hold the overlay's own composition (`register`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../../setup/index.html'), 'utf-8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
/** Generated per run: never a real credential. */
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 8)}`;

/** The session's timers, run by hand (as `modernSession.test.ts`'s clock). */
function clock(): { every: (ms: number, fn: () => void) => () => void; after: (ms: number, fn: () => void) => () => void;
  tick(ms: number): void; live(ms: number): number } {
  const reps: { ms: number; fn: () => void; on: boolean }[] = [];
  const once: { ms: number; fn: () => void; on: boolean }[] = [];
  return {
    every(ms, fn) { const r = { ms, fn, on: true }; reps.push(r); return () => { r.on = false; }; },
    after(ms, fn) { const o = { ms, fn, on: true }; once.push(o); return () => { o.on = false; }; },
    tick(ms) {
      for (const r of reps) if (r.on && r.ms === ms) r.fn();
      for (const o of once) if (o.on && o.ms === ms) { o.on = false; o.fn(); }
    },
    live: (ms) => reps.filter((r) => r.on && r.ms === ms).length + once.filter((o) => o.on && o.ms === ms).length,
  };
}

interface Pending<T> { resolve(v: T): void; reject(e: unknown): void }
/** The account service with every login and logout answered by hand; `events` records the order of what happened. */
function service(events: string[]) {
  const logins: Pending<{ status: number; ticket?: string }>[] = [];
  const logouts: (Pending<{ status: number }> & { ticket: string })[] = [];
  let keepAlives = 0;
  const svc: LobbyService = {
    login: () => new Promise((res, rej) => { logins.push({ resolve: res, reject: rej }); }),
    register: async () => ({ status: MEDIUS_STATUS.Success }),
    logout: (ticket) => new Promise((res, rej) => {
      events.push(`logout sent ${ticket}`);
      logouts.push({ ticket, resolve: (v) => { events.push(`logout answered ${ticket}`); res(v); }, reject: rej });
    }),
    keepAlive: async () => { keepAlives++; return true; },
  };
  return { svc, logins, logouts, keepAlives: () => keepAlives };
}

const fakeState = (disc: LauncherSnapshot['disc'] = 'ready'): LauncherState => ({
  disc: () => disc, isoInserted: () => disc === 'ready', filename: () => 'SOCOM II.iso', onChange: () => () => {},
});

describe('the before-launch registry (`src/modern/launchGate`)', () => {
  it('nothing registered, or every hook with nothing to wait for: null, so START mounts at once', () => {
    expect(beforeLaunch(document)).toBeNull();
    const off = registerBeforeLaunch(document, () => null);
    expect(beforeLaunch(document)).toBeNull();
    off();
  });
  it('a hook\'s wait is awaited; an unregistered hook is not called', async () => {
    let done!: () => void;
    const off = registerBeforeLaunch(document, () => new Promise<void>((r) => { done = r; }));
    const wait = beforeLaunch(document)!;
    expect(wait).not.toBeNull();
    let settled = false;
    void wait.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    done();
    await flush();
    expect(settled).toBe(true);
    off();
    expect(beforeLaunch(document)).toBeNull();
  });
  it('bounded by LOGOUT_TIMEOUT_MS: a wait that never settles is over at the bound; a hook that throws is passed over', async () => {
    const c = clock();
    const offs = [registerBeforeLaunch(document, () => new Promise<void>(() => {})), registerBeforeLaunch(document, () => { throw new Error('x'); })];
    const wait = beforeLaunch(document, c.after)!;
    let settled = false;
    void wait.then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    expect(c.live(LOGOUT_TIMEOUT_MS)).toBe(1);
    c.tick(LOGOUT_TIMEOUT_MS);
    await flush();
    expect(settled).toBe(true);
    for (const off of offs) off();
  });
  it('launchPending (MU-F2c): the held wait from the click until it settles, null with none', async () => {
    expect(launchPending(document)).toBeNull();
    let done!: () => void;
    const off = registerBeforeLaunch(document, () => new Promise<void>((r) => { done = r; }));
    const wait = beforeLaunch(document)!;
    expect(launchPending(document)).toBe(wait);
    done();
    await flush();
    expect(launchPending(document)).toBeNull();
    off();
  });
  it('kept per document: a test\'s document and the page\'s never share hooks', () => {
    const other = document.implementation.createHTMLDocument('other');
    const off = registerBeforeLaunch(other, () => Promise.resolve());
    expect(beforeLaunch(document)).toBeNull();
    expect(beforeLaunch(other)).not.toBeNull();
    off();
  });
});

describe('the shared START boundary: the modern session ends before the front end mounts (MU-F2a, dot P1)', () => {
  let events: string[];
  let s: ReturnType<typeof service>;
  let c: ReturnType<typeof clock>;
  let session: ModernSession;
  let offGate: () => void;
  let entry: PageEntry;
  let mounted: boolean;

  beforeEach(async () => {
    document.body.className = 'panel-collapsed';
    document.body.innerHTML = body();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    events = [];
    s = service(events);
    c = clock();
    session = createSession(s.svc, c);
    offGate = () => {};
    mounted = false;
    const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const fake: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const loaders: PageLoaders = {
      main: async () => {},
      frontEnd: async () => ({ mountFrontEnd: () => { events.push('front end mounted'); mounted = true; return mount; } }),
      openDisc: async () => fake,
    };
    entry = await bootPage('/', document, loaders);
  });
  afterEach(() => { offGate(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

  /** The launch: an image chosen on the page's disc prompt opens, and its launch passes the boundary (`offerDisc`). */
  const choose = (): void => {
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], 'SOCOM II.iso')], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const pageUp = (): boolean => document.getElementById('disc-page') !== null;
  /** Signs in through the session and accepts the agreement: signed in, its keep-alive running. */
  async function signIn(): Promise<string> {
    const ticket = gen('t');
    const p = session.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    s.logins[0]!.resolve({ status: MEDIUS_STATUS.Success, ticket });
    await p;
    session.accept!();
    expect(session.state()).toBe('signed-in');
    expect(c.live(LOBBY_KEEPALIVE_MS)).toBe(1);
    return ticket;
  }
  /** After START with a live session: nothing mounted yet; the session ended here, keep-alive stopped, the logout out. */
  function expectHeldFor(ticket: string): void {
    expect(mounted).toBe(false);
    expect(pageUp()).toBe(true);
    expect(session.state()).toBe('signed-out');
    expect(c.live(LOBBY_KEEPALIVE_MS)).toBe(0);
    expect(s.logouts.map((l) => l.ticket)).toEqual([ticket]);
  }
  /** The overlay's registration at the START boundary (`../../src/modern/overlay/index.ts`, `startBoundary`). */
  const register = (m: ModernSession): (() => void) => registerBeforeLaunch(document, () => endForLaunch(m));
  async function frontEnd(): Promise<void> {
    if (entry.entry !== 'disc') throw new Error(entry.entry);
    await entry.mount;
  }

  it('the opened image: the logout is answered before the front end mounts; no keep-alive remains', async () => {
    const ticket = await signIn();
    offGate = register(session);
    choose();
    await flush();
    expectHeldFor(ticket);
    s.logouts[0]!.resolve({ status: MEDIUS_STATUS.Success });
    await frontEnd();
    expect(events).toEqual([`logout sent ${ticket}`, `logout answered ${ticket}`, 'front end mounted']);
    expect(pageUp()).toBe(false);
    const before = s.keepAlives();
    c.tick(LOBBY_KEEPALIVE_MS);
    await flush();
    expect(s.keepAlives()).toBe(before);                                // no keep-alive after START
    expect(c.live(LOBBY_KEEPALIVE_MS) + c.live(LOGOUT_TIMEOUT_MS)).toBe(0);
  });

  it('a sign-in in flight at START: cancelled; the session the server opened for it is logged out, answered, then the front end mounts', async () => {
    offGate = register(session);
    const attempt = session.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    expect(session.state()).toBe('signing-in');
    choose();
    await flush();
    expect(mounted).toBe(false);
    expect(session.state()).toBe('signed-out');
    const late = gen('t');
    s.logins[0]!.resolve({ status: MEDIUS_STATUS.Success, ticket: late });
    expect(await attempt).toMatchObject({ ok: false });
    await flush();
    expect(mounted).toBe(false);
    expect(s.logouts.map((l) => l.ticket)).toEqual([late]);
    expect(c.live(LOBBY_KEEPALIVE_MS)).toBe(0);                       // the late login never starts a keep-alive
    c.tick(LOBBY_KEEPALIVE_MS);
    await flush();
    expect(s.keepAlives()).toBe(0);
    expect(session.ticket()).toBeNull();
    s.logouts[0]!.resolve({ status: MEDIUS_STATUS.Success });
    await frontEnd();
    expect(events).toEqual([`logout sent ${late}`, `logout answered ${late}`, 'front end mounted']);
  });

  it('a sign-in in flight that the server refuses: nothing to log out; the front end mounts once the refusal is in', async () => {
    offGate = register(session);
    const attempt = session.signIn({ name: gen('n'), password: gen('p') });
    await flush();
    choose();
    await flush();
    expect(mounted).toBe(false);
    s.logins[0]!.resolve({ status: MEDIUS_STATUS.InvalidPassword });
    await attempt;
    await frontEnd();
    expect(s.logouts).toEqual([]);
    expect(events).toEqual(['front end mounted']);
  });

  it('a logout never answered: the front end mounts after LOGOUT_TIMEOUT_MS (the session\'s bound)', async () => {
    const ticket = await signIn();
    offGate = register(session);
    choose();
    await flush();
    expectHeldFor(ticket);
    c.tick(LOGOUT_TIMEOUT_MS);
    await frontEnd();
    expect(events).toEqual([`logout sent ${ticket}`, 'front end mounted']);
  });

  it('a logout the transport rejects: the front end mounts at once after the rejection', async () => {
    const ticket = await signIn();
    offGate = register(session);
    choose();
    await flush();
    expectHeldFor(ticket);
    s.logouts[0]!.reject(new TypeError('Failed to fetch'));
    await frontEnd();
    expect(mounted).toBe(true);
  });

  it('a sign-out just made (its logout still out) is waited for too: the original LOGIN comes after it', async () => {
    const ticket = await signIn();
    offGate = register(session);
    void session.signOut();
    choose();
    await flush();
    expect(mounted).toBe(false);
    s.logouts[0]!.resolve({ status: MEDIUS_STATUS.Success });
    await frontEnd();
    expect(events).toEqual([`logout sent ${ticket}`, `logout answered ${ticket}`, 'front end mounted']);
  });

  it('a sign-in tried during START\'s wait is refused busy: no login is sent, and after the mount the session is signed out with no keep-alive', async () => {
    const ticket = await signIn();
    offGate = register(session);
    choose();
    await flush();
    expectHeldFor(ticket);
    const again = await session.signIn({ name: gen('n'), password: gen('p') });
    expect(again).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(await session.create({ name: gen('n'), password: gen('p') })).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(s.logins).toHaveLength(1);                                  // only the first sign-in's login ever went out
    expect(session.state()).toBe('signed-out');
    s.logouts[0]!.resolve({ status: MEDIUS_STATUS.Success });
    await frontEnd();
    expect(session.state()).toBe('signed-out');
    expect(c.live(LOBBY_KEEPALIVE_MS)).toBe(0);
    expect(await session.signIn({ name: gen('n'), password: gen('p') })).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(s.logins).toHaveLength(1);
  });

  it('signed out (offline, no account): the image mounts at once once it opens, with no wait', async () => {
    offGate = register(session);
    choose();
    await flush();
    expect(mounted).toBe(true);
    expect(pageUp()).toBe(false);
    expect(s.logouts).toEqual([]);
  });

  it('the modern chunk never loaded (nothing registered): the image mounts at once once it opens', async () => {
    choose();
    await flush();
    expect(mounted).toBe(true);
    expect(pageUp()).toBe(false);
  });
});
