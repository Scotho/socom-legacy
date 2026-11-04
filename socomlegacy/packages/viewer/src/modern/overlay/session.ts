import type { ModernSession, SessionSnapshot, SessionState } from '../session';

/**
 * MU2-10 (MU2-9's finding (a); MU2.R1 "ensuring the ui state is in sync with the logged in persona"): the session the
 * overlay's sections read over a page. One truth: **the game's own signed-in persona** when the page's game holds one --
 * the front end's lobby client, which the original's LOGIN drives (`./page` `overlayPageReads`) -- else the overlay's
 * own modern session (`../session` `pageSession`), whose sign-in works as before. Why the game's: the console's START
 * hands the window to the original's front end and ends the launcher's session for good (`src/console/adapters/launch.ts`
 * `session.end()`, `../session` `launched`, MU-F2a: the server holds one session per account, so the original's LOGIN
 * must find the account free, -997 otherwise); from then on the game's persona is the one signed in, and the overlay
 * reads it rather than a second login of its own.
 *
 * - **Read, never driven.** The game's lobby client is read (`loggedIn`, `ticket`, `account`); the overlay neither signs
 *   it in nor out -- the original's LOGIN and its LOGOFF (#793) are its own menus' (MU2.R3: the overlay never changes the
 *   game's behaviour). While the game holds the persona the overlay's sign-in answers busy and its sign-out does nothing.
 * - **One persona.** When the game signs in while the overlay's own session is signed in, the overlay's own is signed out
 *   (its logout sent): the page holds one persona, the game's.
 * - **The game's LOGIN begins** (MU2-10's review F1; MU2.R3): at the game's `LobbyConnect` -- its lobby client connected
 *   (`LobbyClient.connectedTo`, `@s2u/ui` `personaCommands` `LobbyConnect`: `select_server`'s way into the LOGIN form) --
 *   the overlay's own session is signed out at once (its logout sent before any LOGIN the player can type), and while
 *   the game's lobby stays up the overlay's sign-in and create answer busy: the server holds one session per account,
 *   and an overlay sign-in left live would have the game's LOGIN of the same account refused AccountLoggedIn (-997).
 *   The disc page's START boundary (`../session` `registerSessionForLaunch`) ends it before the front end mounts; this
 *   is the boundary on every page whose game has a lobby -- the front end reached through the entry or the console's
 *   START, and the disc page's front end after its START. When the game's lobby is down again (its LOGOFF), the
 *   overlay's sign-in works again.
 * - **Followed.** The game's client has no change event; `sync()` -- called on each of the overlay's frames -- compares
 *   what it reads and tells the subscribers when it changed.
 * - The game's login reads as signed in from its ticket on: the original's USER AGREEMENT is the front end's own screen
 *   after the login (R128.1), and its DECLINE logs the client off (R156.7), which `sync()` follows.
 * A browser adaptation's wiring (MU.R1).
 */
export interface GameAccount {
  /** The client logged in (`LobbyClient.loggedIn`, 0x66a8e0). */
  loggedIn(): boolean;
  /** The login's ticket (`LobbyClient.ticket`), or null. */
  ticket(): string | null;
  /** The account's name of the session logged in (`LobbyClient.account`), or null. */
  account(): string | null;
  /**
   * MU2-10's review F1: the lobby the client is connected to (`LobbyClient.connectedTo`), or null -- non-null from the
   * game's `LobbyConnect` on, its online session begun. Absent (a reader with no lobby connection), never begun.
   */
  connectedTo?(): unknown;
}

export interface OverlaySession {
  /** What the sections read. */
  session: ModernSession;
  /** Whether the game's persona is the one shown (the game logged in with a ticket and a name). */
  gameHolds(): boolean;
  /** One frame's read of the game's client: subscribers told of a change, the overlay's own signed out under the game's. */
  sync(): void;
}

const BUSY = { ok: false as const, error: { code: 'busy' as const, status: null, message: 'Already signing in' } };

export function overlaySession(own: ModernSession, game: () => GameAccount | null): OverlaySession {
  const held = (): { name: string; ticket: string } | null => {
    const g = game();
    if (!g || !g.loggedIn()) return null;
    const ticket = g.ticket(), name = g.account();
    return ticket !== null && name !== null ? { name, ticket } : null;
  };
  /** MU2-10's review F1: the game's online session begun -- its persona held, or its lobby connected (its LOGIN form). */
  const begun = (): boolean => {
    if (held()) return true;
    try { return (game()?.connectedTo?.() ?? null) !== null; } catch { return false; }
  };
  const subs = new Set<(s: SessionSnapshot) => void>();
  const state = (): SessionState => (held() ? 'signed-in' : own.state());
  const snapshot = (): SessionSnapshot => {
    const g = held();
    return g ? { state: 'signed-in', account: { name: g.name }, error: null } : { state: own.state(), account: own.account(), error: own.error() };
  };
  let last = '';
  const key = (s: SessionSnapshot): string => `${s.state}\u0000${s.account?.name ?? ''}\u0000${held()?.ticket ?? ''}`;
  /** Tells the subscribers: on the own session's every change (`always`: a refusal's words repeat on the same state), else when the read changed. */
  const tell = (always = false): void => {
    const s = snapshot();
    const k = key(s);
    if (k === last && !always) return;
    last = k;
    for (const cb of [...subs]) cb(s);
  };
  let offOwn: (() => void) | null = null;
  const watchOwn = (): void => { if (!offOwn && subs.size) offOwn = own.onChange(() => { tell(true); }); };
  last = key(snapshot());

  const session: ModernSession = {
    state,
    account: () => snapshot().account,
    ticket: () => held()?.ticket ?? own.ticket(),
    error: () => (held() ? null : own.error()),
    remembers: () => own.remembers(),
    onChange(cb) {
      subs.add(cb);
      watchOwn();
      return () => { subs.delete(cb); if (!subs.size) { offOwn?.(); offOwn = null; } };
    },
    signIn: (q) => (begun() ? Promise.resolve(BUSY) : own.signIn(q)),
    // OT.R61: the console tries no quick sign-in over a game page; held here as the own session's, the same gate.
    quickSignIn: (name) => (begun() || !own.quickSignIn ? Promise.resolve(BUSY) : own.quickSignIn(name)),
    create: (q) => (begun() ? Promise.resolve(BUSY) : own.create(q)),
    signOut: (o) => (held() ? Promise.resolve() : own.signOut(o)),
    close: () => { own.close(); },
    end: () => (own.end ? own.end() : own.state() === 'signed-out' ? null : own.signOut()),
    accept: () => { own.accept?.(); },
  };
  return {
    session,
    gameHolds: () => held() !== null,
    sync(): void {
      if (begun() && own.state() !== 'signed-out') void own.signOut();  // one persona: the game's (F1: from its LobbyConnect)
      tell();
    },
  };
}
