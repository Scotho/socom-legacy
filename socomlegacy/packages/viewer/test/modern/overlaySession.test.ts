// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { overlaySession, type GameAccount } from '../../src/modern/overlay/session';
import { MEDIUS_STATUS } from '@s2u/ui';
import { createSession, type ModernSession, type SessionSnapshot, type SessionState, type SignInError } from '../../src/modern/session';

/**
 * MU2-10 (MU2-9's finding (a)): the session the overlay's sections read -- the game's own persona while the page's game
 * holds one (read, never driven), else the overlay's own session, every change of which still reaches the sections.
 */
function own(start: SessionState = 'signed-out'): ModernSession & { emit(state: SessionState, error?: SignInError | null): void } {
  let state = start; let error: SignInError | null = null;
  const subs = new Set<(s: SessionSnapshot) => void>();
  const snap = (): SessionSnapshot => ({ state, account: state === 'signed-in' ? { name: 'Own' } : null, error });
  return {
    state: () => state, account: () => snap().account, ticket: () => (state === 'signed-in' ? 'own-ticket' : null), error: () => error,
    remembers: () => false, onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    signIn: vi.fn(async () => ({ ok: true as const })), create: vi.fn(async () => ({ ok: true as const })),
    signOut: vi.fn(async () => { state = 'signed-out'; for (const cb of [...subs]) cb(snap()); }), close: vi.fn(),
    emit(s, e = null) { state = s; error = e; for (const cb of [...subs]) cb(snap()); },
  };
}
const game = (name: string | null): GameAccount & { set(n: string | null): void } => {
  let now = name;
  return { loggedIn: () => now !== null, ticket: () => (now === null ? null : 'game-ticket'), account: () => now, set(n) { now = n; } };
};

describe('MU2-10: the overlay\'s session', () => {
  it('no game account: the own session\'s reads and calls, as before', async () => {
    const o = own('signed-in');
    const { session, gameHolds } = overlaySession(o, () => null);
    expect([session.state(), session.account()?.name, session.ticket(), gameHolds()]).toEqual(['signed-in', 'Own', 'own-ticket', false]);
    await session.signIn({ name: 'a', password: 'b' });
    expect(o.signIn).toHaveBeenCalledTimes(1);
    await session.signOut();
    expect(o.signOut).toHaveBeenCalledTimes(1);
  });

  it('the game holds the persona: its name and ticket; sign-in answers busy and sign-out does nothing (the game\'s LOGOFF is its own)', async () => {
    const o = own('signed-out');
    const { session, gameHolds } = overlaySession(o, () => game('GAMEPERSONA'));
    expect([session.state(), session.account()?.name, session.ticket(), gameHolds()]).toEqual(['signed-in', 'GAMEPERSONA', 'game-ticket', true]);
    expect((await session.signIn({ name: 'a', password: 'b' })).ok).toBe(false);
    expect(o.signIn).not.toHaveBeenCalled();
    await session.signOut();
    expect(o.signOut).not.toHaveBeenCalled();
  });

  it('a game client logged in without a ticket or a name (mid-login) is not a persona', () => {
    const g: GameAccount = { loggedIn: () => true, ticket: () => null, account: () => 'X' };
    expect(overlaySession(own(), () => g).gameHolds()).toBe(false);
  });

  it('every change of the own session reaches the subscribers -- a refusal repeated on the same state too', () => {
    const o = own('signed-out');
    const { session } = overlaySession(o, () => null);
    const seen: (string | undefined)[] = [];
    session.onChange((s) => { seen.push(s.error?.code); });
    const missing: SignInError = { code: 'missing', status: null, message: 'Enter a name and a password' };
    o.emit('signed-out', missing);
    o.emit('signed-out', missing);
    expect(seen).toEqual(['missing', 'missing']);
  });

  it('sync() follows the game: told once per change, the own session signed out under the game\'s (one persona)', () => {
    const o = own('signed-in');
    const g = game(null);
    const { session, sync } = overlaySession(o, () => g);
    const seen: string[] = [];
    session.onChange((s) => { seen.push(`${s.state}:${s.account?.name ?? ''}`); });
    sync();
    expect(seen).toEqual([]);                                      // nothing changed
    g.set('GAMEPERSONA');
    sync(); sync();
    expect(o.signOut).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe('signed-in:GAMEPERSONA');
    g.set(null);
    sync();
    expect(seen.at(-1)).toBe('signed-out:');
  });
});

/**
 * MU2-10's review F1 (MU2.R3: the overlay never changes the game's outcome): over the front end -- reached through the
 * entry (`/setup?devmode`, `/?devmode`, a deep route) or the console's START -- the overlay's own session had no START
 * boundary, so an account signed in through the overlay was still held by the server when the game's own LOGIN logged
 * the same account in: AccountLoggedIn (-997). The game's online session begins at its `LobbyConnect` (the lobby client
 * connected, `LobbyClient.connectedTo`; `select_server`'s way into the LOGIN form, `@s2u/ui` personaCommands): from then
 * the overlay's own session is signed out (its logout sent before any LOGIN the player can type) and its sign-in answers
 * busy until the game's lobby is down again.
 */
describe('MU2-10 review F1: the game\'s LOGIN begins, the overlay\'s own session ends', () => {
  /**
   * One session per account, as the server held them (`central/src/accounts.ts` `login`): a second live login is -997.
   * Stricter than the real server on purpose since SESSION-TAKEOVER (2026-10-15, `SESSION_TAKEOVER_ADAPTATION`): the
   * server now refuses only a session a socket holds and takes over one that none holds; this fake refuses every live
   * one, so the test still proves the overlay's session is ended before the game's LOGIN, whichever rule the server keeps.
   */
  function server() {
    const live = new Map<string, string>();
    let n = 0;
    const svc = {
      login: vi.fn(async (q: { name: string; password: string }) => {
        if ([...live.values()].includes(q.name)) return { status: MEDIUS_STATUS.AccountLoggedIn };
        const ticket = `t${++n}`; live.set(ticket, q.name);
        return { status: MEDIUS_STATUS.Success, ticket };
      }),
      register: vi.fn(async () => ({ status: MEDIUS_STATUS.Success })),
      logout: vi.fn(async (ticket: string) => { live.delete(ticket); return { status: MEDIUS_STATUS.Success }; }),
    };
    return { svc, holds: (name: string) => [...live.values()].includes(name) };
  }
  /** The front end's lobby client as the overlay reads it (`LobbyClient` by its shape), its LOGIN sent to `srv`. */
  function lobby(srv: ReturnType<typeof server>) {
    let up = false, name: string | null = null, ticket: string | null = null;
    return {
      loggedIn: () => ticket !== null, ticket: () => ticket, account: () => (ticket !== null ? name : null),
      connectedTo: () => (up ? { host: 'lobby.test', port: 10075 } : null),
      connect() { up = true; },
      disconnect() { up = false; ticket = null; },
      async login(n: string, password: string): Promise<number> {
        const r = await srv.svc.login({ name: n, password });
        if (r.status === MEDIUS_STATUS.Success) { name = n; ticket = r.ticket ?? null; }
        return r.status;
      },
    };
  }
  const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const noTimers = { every: () => () => {}, after: () => () => {} };

  it('signed in X through the overlay on the front end; the game connects and its LOGIN of X is not refused (-997)', async () => {
    const srv = server();
    const own = createSession(srv.svc, noTimers);
    const g = lobby(srv);
    const o = overlaySession(own, () => g);
    expect((await o.session.signIn({ name: 'MU2X', password: 'pw' })).ok).toBe(true);
    expect(srv.holds('MU2X')).toBe(true);
    g.connect();                                                   // LobbyConnect: the game's online session begins
    o.sync();                                                      // the overlay's frame
    await flush();
    expect(own.state()).toBe('signed-out');
    expect(srv.svc.logout).toHaveBeenCalledTimes(1);
    expect(await g.login('MU2X', 'pw')).toBe(MEDIUS_STATUS.Success);
  });

  it('while the game\'s lobby is up (its LOGIN form), the overlay\'s sign-in and create answer busy; once it is down, they work again', async () => {
    const srv = server();
    const own = createSession(srv.svc, noTimers);
    const g = lobby(srv);
    const o = overlaySession(own, () => g);
    g.connect(); o.sync();
    const r = await o.session.signIn({ name: 'MU2Y', password: 'pw' });
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.error.code).toBe('busy');
    expect((await o.session.create({ name: 'MU2Y', password: 'pw' })).ok).toBe(false);
    expect(srv.svc.login).not.toHaveBeenCalled();
    g.disconnect(); o.sync();                                      // the game's LOGOFF / its lobby gone
    expect((await o.session.signIn({ name: 'MU2Y', password: 'pw' })).ok).toBe(true);
  });

  it('a game client without the read (a page that hands no lobby connection) is as before: no change', async () => {
    const o = own('signed-in');
    const { sync } = overlaySession(o, () => game(null));
    sync();
    expect(o.signOut).not.toHaveBeenCalled();
  });
});
