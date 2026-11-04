import { LOBBY_KEEPALIVE_MS, LOGOUT_TIMEOUT_MS, MEDIUS_STATUS, type LobbyService } from '@s2u/ui';
import { pageAccountService, type AccountRequestOptions } from '../connectHost';

/**
 * The modern UI's session (MU-2 of `docs/plans/2026-10-09-modern-ui-parallel.md`): sign in, create an account, sign
 * out, and the signed-in state the later screens read (lobbies, profile, launch). A browser adaptation (MU.R1): the
 * original has no such screen; the account, the routes, the statuses and the ticket are the original page's.
 *
 * **The wire is the original page's.** Every request goes through `fetchAccountService` (`../connectHost`, the
 * `LobbyService` the original's LOGIN and REGISTER use, ONL-07): `POST /account/login` `{ name, password,
 * savePassword: false }`, `/account/create` `{ name, password }`, `/account/logout` `{ ticket }`, the keep-alive
 * `/lobby/update-user-state` with the ticket as bearer -- at the page's own origin (`ACCOUNT_SERVICE_OWN_ORIGIN_
 * ADAPTATION`), `credentials: 'omit'`. No second codec: an HTTP answer with no status reads as that module reads it
 * (`ACCOUNT_HTTP_REFUSAL_ADAPTATION`, MediusFail).
 *
 * **Where the session is kept: where the original page keeps it -- in memory.** What the original's LOGIN reads and
 * writes (the reading behind MU-2's cookie proposal, MU.R6):
 * - it reads the name and the password typed on its keyboard, and the card's persona record for the server
 *   (`../personaHost`); SAVE PASSWORD: YES is honoured through the server's remember cookie (MISSION OT.R61, the owner,
 *   2026-10-17; the online seat's half): a YES record keeps SAVEPASSWORD 1 and the password's length only;
 * - under NO it posts with `credentials: 'omit'` and `savePassword: false` (`fetchAccountService`), so it neither presents
 *   nor receives the remember cookie (`s2u_remember_<id>`, `HttpOnly; Secure; SameSite=Strict; Path=/account`,
 *   `accountHttp.ts` / `accounts.ts`); under YES it logs in through the remember service (`AccountRequestOptions`) -- the
 *   cookie is never readable by the page's script;
 * - it keeps the login's ticket in `LobbyClient`'s memory only (`@s2u/ui` lobbyClient's header; `../connectHost`,
 *   "The session's ticket: the seam"): never `localStorage`, `sessionStorage`, a cookie or the address. The
 *   `s2u.session:<origin>` key of `../net/session` is not the login: it is the match socket's per-tab reconnect
 *   token, written by the net page, and this module never touches it.
 * So the modern session keeps its ticket in this object's memory and nowhere else, as the original does.
 *
 * **Reaching the original's LOGIN.** The server holds one session per account: a second login while this one is live
 * is answered AccountLoggedIn (-997, MP_PLAYER_LOGGED_IN; `accounts.ts` `loginCounted`). Until a hand-over seam exists
 * the modern session must end before the original's front end logs in: at every START, `end()` awaited at the page's
 * START boundary (MU-F2a, `./launchGate`; the Lobbies' Launch also awaits `signOut()` first, MU-6), and at `pagehide`
 * `close()` (as `LOBBY_CLOSE_AT_STOP_ADAPTATION`: the logout sent, not awaited). After START's `end()` no attempt starts
 * (busy), so nothing re-opens a session behind the mount.
 * **The known edge** (`docs/HAZARDS.md`, "server"): START's wait is bounded by LOGOUT_TIMEOUT_MS (`./launchGate`). A
 * sign-in whose login hangs past that bound is still logged out when its answer finally comes, but if the original's
 * LOGIN reaches the server before that late logout, it is answered AccountLoggedIn (-997); a retry after the late
 * logout lands succeeds. A logout that timed out is not a revocation: if the server never processes it, the session
 * stands until the server's own idle expiry (`SESSION_SILENT_MS_READING`, 300 s since its last use since NU-16b, `central/src/accounts.ts`;
 * the keep-alive has stopped), and the original's LOGIN is refused -997 until then. The player then signs in again on the
 * original's LOGIN. "Already signed in" across the two is OT.R61's (the owner, 2026-10-17; H179 answered (b)): not a page
 * seam, but the remember cookie -- this session's remembered sign-in keeps the token, START's plain logout keeps it, and
 * the original's LOGIN, its screens still shown, signs in with it under SAVE PASSWORD: YES (the online seat's half).
 * OT.R17's "password isn't saved" stands amended: the password itself is still never saved.
 *
 * **The USER AGREEMENT at every connect (MU-13a; parity audit F12; MU.R12, MU.R14).** The original reaches SOCOM II
 * ONLINE only through `dlgUsagePolicy`: `dlgNetConnect`'s login -> the agreement -> ACCEPT's `ForceUsagePolicyReturn`
 * -> `dlgWorldOfSOCOM` (research 128 R128.1, the table's `dlgNetConnect` and `dlgUsagePolicy` rows; research 156
 * R156.6), on every connect, and nothing records an acceptance (neither the console's flow nor the port's server:
 * research 156 §1.4, the audit's §6). So a login that succeeds leaves the session in `agreement`, not `signed-in`: the
 * server's session is up (the keep-alive runs, a sign-out logs it out) but `ticket()` answers null and the sections,
 * which read `signed-in`, wait. `accept()` is ACCEPT (to `signed-in`); DECLINE's YES is `signOut()` (R156.7's
 * `LobbyLogout`, the logoff). Every sign-in passes it again here; the console launcher's session adapter accepts it at
 * once for an account that accepted the same text on this browser earlier (`../console/adapters/session`
 * AGREEMENT-ONCE, MU.R14 amended by the owner, 2026-10-19). The screen is `./agreement`, mounted by `./signIn`.
 *
 * **Remember me (MU-H2; MISSION OT.R61, the owner, 2026-10-17).** On (`MU_REMEMBER_ME_ENABLED`): the console's sign-in
 * offers it ticked by default (PERSONA-PERSIST (a)), over the remember cookie's contract (SVC-03a,
 * `packages/central/src/accountHttp.ts` steps 1 to 7) through the two services `SessionOptions.services` names -- built
 * by `pageSession` with `../connectHost` `AccountRequestOptions`: a ticked sign-in and the load's quick sign-in through
 * the remember service (`credentials` `'include'`: `savePassword: true`, the credentials included), Forget this
 * device through the forget service (`{ forget: true }`: `{ ticket, forget: true }`). Everything else goes through the
 * plain service as before -- an unticked sign-in (a NO login never shows the cookie: it would drop the chain), the
 * plain sign-out, the pagehide's `close`, START's `end` (a plain logout keeps the token, step 5). The token is the
 * browser's HttpOnly cookie: this module never reads `document.cookie`, and keeps no password; the ticket stays in
 * memory only, as above. A session made without the services remembers nothing (`remembers()` false).
 */

/** MU-H2, OT.R61 (b): "Remember me" is offered, ticked by default (the console's sign-in). A browser adaptation. */
export const MU_REMEMBER_ME_ENABLED = true;

/**
 * MU_UNREACHABLE_SAID_AT_ONCE_ADAPTATION: a request that gets no answer (the fetch rejects: no server, no network) is
 * said at once, "Server unreachable". The original's screen leaves it to its 90 s watchdog; the modern panel has no
 * watchdog to wait on. A browser adaptation.
 */
export const MU_UNREACHABLE_SAID_AT_ONCE_ADAPTATION = 'a request with no answer is said at once as unreachable' as const;

/** `agreement`: logged in, the USER AGREEMENT not yet accepted (MU-13a); the sections treat it as not signed in. */
export type SessionState = 'signed-out' | 'signing-in' | 'agreement' | 'signed-in';

export type SignInErrorCode =
  | 'not-found' | 'logged-in' | 'bad-password' | 'failed'
  | 'name-taken' | 'not-accepted' | 'create-failed'
  | 'unreachable' | 'session-lost' | 'signed-in-elsewhere' | 'missing' | 'busy';

export interface SignInError {
  code: SignInErrorCode;
  /** The Medius status the server answered, or null for none (no answer, a local check). */
  status: number | null;
  /** The modern words for it: never the number. */
  message: string;
}

export interface SessionAccount { name: string }
export interface SessionSnapshot { state: SessionState; account: SessionAccount | null; error: SignInError | null }
export type SignInResult = { ok: true } | { ok: false; error: SignInError };

export interface SignInRequest { name: string; password: string; remember?: boolean }

export interface ModernSession {
  state(): SessionState;
  account(): SessionAccount | null;
  /** The login's ticket, the bearer of the later screens' requests (memory only), or null -- null until the agreement is accepted. */
  ticket(): string | null;
  /** The last refusal, cleared by the next attempt. */
  error(): SignInError | null;
  /** Whether a sign-in may remember (`MU_REMEMBER_ME_ENABLED`, and a remember service given). */
  remembers(): boolean;
  /** Calls `cb` on every change; answers the unsubscribe. */
  onChange(cb: (s: SessionSnapshot) => void): () => void;
  signIn(q: SignInRequest): Promise<SignInResult>;
  /**
   * OT.R61: the quick sign-in (SVC-03a step 2) through the remember service -- `{ name, savePassword: true }`, no
   * password, the credentials included: the browser presents the cookie. As `signIn` otherwise (the agreement after a
   * success; refused while signing in or signed in). Optional so that a test double need not carry it.
   */
  quickSignIn?(name: string): Promise<SignInResult>;
  /** The original's registration chain: AccountRegistration, then the login. */
  create(q: SignInRequest): Promise<SignInResult>;
  /**
   * Logs out (awaited, bounded by LOGOUT_TIMEOUT_MS) and ends signed out whatever the answer. `forget` (OT.R61): Forget
   * this device, through the forget service (step 6); else the plain logout, the token kept (step 5).
   */
  signOut(opts?: { forget?: boolean }): Promise<void>;
  /** Ends the session here and sends the logout without waiting (`pagehide`). */
  close(): void;
  /**
   * The START boundary's end (MU-F2a; `./launchGate`): null when nothing is live or under way (signed out, no attempt in
   * flight, no logout out) -- START need not wait. Else it ends the session here (the keep-alive stopped, a sign-in in
   * flight cancelled) and answers a wait for: the logout of the ticket held, the attempt in flight (whose login, should
   * the server open a session for it, is logged out at once, `login`'s generation check) and every logout still out --
   * each logout bounded by LOGOUT_TIMEOUT_MS. From then on every `signIn` / `create` answers busy and sends nothing: the
   * front end is mounting, and a session opened now would outlive the mount. Optional so that a test double need not carry it (`endForLaunch` falls
   * back to `signOut`); `createSession` always does.
   */
  end?(): Promise<void> | null;
  /**
   * The USER AGREEMENT's ACCEPT (MU-13a): `agreement` -> `signed-in`; anything else, nothing. Optional so that a test
   * double of the sections (which never reaches `agreement`) need not carry it; `createSession` always does.
   */
  accept?(): void;
}

/**
 * The words for the original's statuses. The login's are the AccountLogin callback's branches (`FUN_002eefa0`
 * D:L191163-191182: AccountNotFound to state 10, AccountLoggedIn MP_PLAYER_LOGGED_IN, InvalidPassword
 * MP_INVALID_PASSWORD, any other "Login Failure"); the registration's callback reads success or failure only
 * (`FUN_002eeb50` D:L190998-191010), and the modern panel names the two failures the server tells apart.
 */
const LOGIN_WORDS: Record<number, [SignInErrorCode, string]> = {
  [MEDIUS_STATUS.AccountNotFound]: ['not-found', 'No account by that name'],
  [MEDIUS_STATUS.AccountLoggedIn]: ['logged-in', 'That account is already signed in'],
  [MEDIUS_STATUS.InvalidPassword]: ['bad-password', 'Wrong password'],
};
const CREATE_WORDS: Record<number, [SignInErrorCode, string]> = {
  [MEDIUS_STATUS.AccountAlreadyExists]: ['name-taken', 'That name is taken'],
  [MEDIUS_STATUS.RegistrationFailed]: ['not-accepted', 'That name or password is not accepted'],
};
/**
 * MU_SIGNED_IN_ELSEWHERE_ADAPTATION (SESSION-TAKEOVER's fold, the merge controller's condition, 2026-10-15): a session the
 * server ended because the same account signed in elsewhere (its takeover, server `accounts.ts`
 * `SESSION_TAKEOVER_ADAPTATION`; the renewal's 401 says so, `LobbyService.sessionEndedWhy`) is said as that, not as a
 * session that ended for no reason: the panel's words `WORDS['signed-in-elsewhere']`, the classic page's line's
 * (`../connectHost`, `SIGNED_IN_ELSEWHERE_ADAPTATION`) in the panel's voice. Any other loss, or no answer to the why,
 * stays 'session-lost'. A browser adaptation, as the modern panel is.
 */
export const MU_SIGNED_IN_ELSEWHERE_ADAPTATION = 'a session taken over by a sign-in elsewhere is said as that' as const;

const WORDS: Record<'failed' | 'create-failed' | 'unreachable' | 'session-lost' | 'signed-in-elsewhere' | 'missing' | 'busy', string> = {
  failed: 'Sign-in failed. Try again',
  'create-failed': 'The account could not be made. Try again',
  unreachable: 'Server unreachable. Check the connection',
  'session-lost': 'Signed out: the session ended',
  'signed-in-elsewhere': 'Signed out: this account signed in elsewhere',
  missing: 'Enter a name and a password',
  busy: 'Already signing in',
};

const loginError = (status: number): SignInError => {
  const w = LOGIN_WORDS[status];
  return w ? { code: w[0], status, message: w[1] } : { code: 'failed', status, message: WORDS.failed };
};
const createError = (status: number): SignInError => {
  const w = CREATE_WORDS[status];
  return w ? { code: w[0], status, message: w[1] } : { code: 'create-failed', status, message: WORDS['create-failed'] };
};
const plain = (code: keyof typeof WORDS): SignInError => ({ code, status: null, message: WORDS[code] });

/**
 * OT.R61 (PERSONA-PERSIST (a)): the account services beside the plain one -- `remember` (`../connectHost`
 * `AccountRequestOptions`, `credentials` `'include'`) for a ticked sign-in and the quick sign-in, `forget`
 * (`{ forget: true }`) for Forget this device. Absent: the session remembers nothing.
 */
export interface SessionServices { remember?: LobbyService; forget?: LobbyService }

export interface SessionOptions {
  /** OT.R61: the remember and forget services (`SessionServices`). */
  services?: SessionServices;
  /** A repeating timer (LOBBY_KEEPALIVE_MS) answering its stop. Absent: `setInterval`. */
  every?: (ms: number, fn: () => void) => () => void;
  /** A one-shot timer (LOGOUT_TIMEOUT_MS) answering its cancel. Absent: `setTimeout`. */
  after?: (ms: number, fn: () => void) => () => void;
}

export function createSession(service: LobbyService, opts: SessionOptions = {}): ModernSession {
  const remembering = opts.services?.remember ?? null;
  const forgetting = opts.services?.forget ?? null;
  const every = opts.every ?? ((ms, fn) => { const id = setInterval(fn, ms); return () => clearInterval(id); });
  const after = opts.after ?? ((ms, fn) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); });
  let state: SessionState = 'signed-out';
  let account: SessionAccount | null = null;
  let ticket: string | null = null;
  let error: SignInError | null = null;
  /** Bumped by every sign-out: a reply to an older attempt is dropped (as the original client drops one after a disconnect). */
  let generation = 0;
  let stopKeepAlive: (() => void) | null = null;
  /** The logout last sent, until it is answered (or LOGOUT_TIMEOUT_MS): the next attempt's login waits for it. */
  let pendingLogout: Promise<void> | null = null;
  /** The attempt in flight (`signIn` / `create`), until it settles: an attempt begun after a sign-out waits for it. */
  let inFlight: Promise<SignInResult> | null = null;
  /**
   * Set by `end()` (the page's START, MU-F2a) and never cleared: the front end is mounting, so no new attempt may open a
   * session that would outlive the mount and hold the account against the original's LOGIN (-997).
   */
  let launched = false;
  const subs = new Set<(s: SessionSnapshot) => void>();

  const snapshot = (): SessionSnapshot => ({ state, account, error });
  const notify = (): void => { const s = snapshot(); for (const cb of [...subs]) cb(s); };
  const set = (next: SessionState, acc: SessionAccount | null, t: string | null, err: SignInError | null): void => {
    state = next; account = acc; ticket = t; error = err;
    notify();
  };

  const endLocal = (err: SignInError | null): string | null => {
    const held = ticket;
    generation++;
    stopKeepAlive?.(); stopKeepAlive = null;
    set('signed-out', null, null, err);
    return held;
  };

  /**
   * Sends the logout of `held` and records it as `pendingLogout`, so that the next login reaches the server after it
   * (else AccountLoggedIn, -997). LOGOUT_UNANSWERED_ADAPTATION (the original client's): a rejected or unanswered
   * logout is over after LOGOUT_TIMEOUT_MS.
   */
  const logOut = (held: string, via: LobbyService = service): Promise<void> => {
    if (!via.logout) return Promise.resolve();
    const sent = new Promise<void>((done) => {
      const cancel = after(LOGOUT_TIMEOUT_MS, done);
      via.logout!(held).then(() => { cancel(); done(); }, () => { cancel(); done(); });
    });
    const tracked: Promise<void> = sent.then(() => { if (pendingLogout === tracked) pendingLogout = null; });
    pendingLogout = tracked;
    return sent;
  };

  const startKeepAlive = (gen: number, held: string): void => {
    if (!service.keepAlive) return;
    stopKeepAlive = every(LOBBY_KEEPALIVE_MS, () => {
      service.keepAlive!(held).then((alive) => {
        if (alive || gen !== generation) return;
        endLocal(plain('session-lost'));
        // MU_SIGNED_IN_ELSEWHERE_ADAPTATION: the server asked why once, the session already ended here (an unanswered why
        // never holds it); a takeover's answer re-words the loss while nothing has happened since.
        const ended = generation;
        if (!service.sessionEndedWhy) return;
        service.sessionEndedWhy(held).then((r) => {
          if (r === 'taken-over' && ended === generation && state === 'signed-out' && error?.code === 'session-lost') {
            set('signed-out', null, null, plain('signed-in-elsewhere'));
          }
        }, () => { /* no answer: the loss stands as said */ });
      }, () => { /* a request never answered: nothing changes, the next period tries again */ });
    });
  };

  /** The login, as the original's state 7 sends it; `gen` the attempt's generation; `via` the service (OT.R61). */
  const login = async (gen: number, name: string, password: string, via: LobbyService = service): Promise<SignInResult> => {
    let reply: { status: number; ticket?: string };
    try {
      reply = await via.login({ name, password });
    } catch {
      if (gen !== generation) return { ok: false, error: plain('busy') };
      const e = plain('unreachable');
      set('signed-out', null, null, e);
      return { ok: false, error: e };
    }
    if (gen !== generation) {
      // Signed out while the login was out: a session the server opened for it is ended, not left to idle out.
      if (reply.status === MEDIUS_STATUS.Success && reply.ticket) void logOut(reply.ticket);
      return { ok: false, error: plain('busy') };
    }
    if (reply.status === MEDIUS_STATUS.Success && reply.ticket) {
      set('agreement', { name }, reply.ticket, null);   // MU-13a: the USER AGREEMENT before SOCOM II ONLINE (R128.1)
      startKeepAlive(gen, reply.ticket);
      return { ok: true };
    }
    const e = loginError(reply.status);
    set('signed-out', null, null, e);
    return { ok: false, error: e };
  };

  /**
   * An attempt: refused at once while one is signing in or signed in, or with a field empty; else it waits for the
   * attempt still in flight from before a sign-out and for the logout last sent (both reach the server first, or the
   * login is refused AccountLoggedIn), then runs `body` -- unless a sign-out came meanwhile.
   */
  const attempt = (q: SignInRequest, body: (gen: number) => Promise<SignInResult>, needsPassword = true): Promise<SignInResult> => {
    if (launched || state !== 'signed-out') return Promise.resolve({ ok: false, error: plain('busy') });
    if (!q.name || (needsPassword && !q.password)) {
      const e = plain('missing');
      set('signed-out', null, null, e);
      return Promise.resolve({ ok: false, error: e });
    }
    const gen = generation;
    const before = inFlight;
    set('signing-in', null, null, null);
    const run = (async (): Promise<SignInResult> => {
      if (before) await before;
      while (pendingLogout) await pendingLogout;
      if (gen !== generation) return { ok: false, error: plain('busy') };
      return body(gen);
    })();
    inFlight = run;
    void run.then(() => { if (inFlight === run) inFlight = null; });
    return run;
  };

  return {
    state: () => state,
    account: () => account,
    ticket: () => (state === 'signed-in' ? ticket : null),
    error: () => error,
    remembers: () => MU_REMEMBER_ME_ENABLED && remembering !== null,
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },

    signIn(q) {
      // OT.R61: ticked, through the remember service (step 1); else the plain one (savePassword false, omitted).
      const via = q.remember === true && MU_REMEMBER_ME_ENABLED && remembering ? remembering : service;
      return attempt(q, (gen) => login(gen, q.name, q.password, via));
    },

    quickSignIn(name) {
      // OT.R61: step 2 -- the empty password is the service's cue to send none ('include' presents the cookie).
      if (!remembering) return Promise.resolve({ ok: false, error: plain('missing') });
      const r = remembering;
      return attempt({ name, password: '' }, (gen) => login(gen, name, '', r), false);
    },

    create(q) {
      return attempt(q, (gen) => register(gen, q));
    },

    async signOut(o) {
      const held = endLocal(null);
      // OT.R61: Forget this device through the forget service (step 6); else plain, the token kept (step 5).
      if (held !== null) await logOut(held, o?.forget === true && forgetting ? forgetting : service);
    },

    close() {
      const held = endLocal(null);
      if (held !== null) void logOut(held);
    },

    end() {
      launched = true;                                               // no attempt after START (see `launched`)
      const before = inFlight;
      const held = state !== 'signed-out' ? endLocal(null) : null;   // a sign-in in flight is cancelled by the generation
      if (held === null && !before && !pendingLogout) return null;
      if (held !== null) void logOut(held);                          // recorded as `pendingLogout`, awaited below
      return (async (): Promise<void> => {
        if (before) await before;                                    // its late success sends its logout (`login`)
        while (pendingLogout) await pendingLogout;
      })();
    },

    accept() {
      // ACCEPT's `ForceUsagePolicyReturn` -> `dlgWorldOfSOCOM` (research 156 R156.6): the lobby features open.
      if (state === 'agreement') set('signed-in', account, ticket, null);
    },
  };

  /** The original's registration chain: AccountRegistration, then the login. */
  async function register(gen: number, q: SignInRequest): Promise<SignInResult> {
    let status: number;
    try {
      status = (await service.register({ name: q.name, password: q.password })).status;
    } catch {
      if (gen !== generation) return { ok: false, error: plain('busy') };
      const e = plain('unreachable');
      set('signed-out', null, null, e);
      return { ok: false, error: e };
    }
    if (gen !== generation) return { ok: false, error: plain('busy') };
    if (status !== MEDIUS_STATUS.Success) {
      const e = createError(status);
      set('signed-out', null, null, e);
      return { ok: false, error: e };
    }
    return login(gen, q.name, q.password);
  }
}

/**
 * The session's end at the page's START (MU-F2a): `session.end()`, or for a double without it, `signOut()` unless it is
 * signed out. The overlay registers it at the page's START boundary (`./overlay/index`, `./launchGate`
 * `registerBeforeLaunch`), so every START waits for the session's end before the original's front end mounts and the
 * original's LOGIN of the same account is not refused AccountLoggedIn (-997). (CX-26 retired `registerSessionForLaunch`,
 * the same registration for the retired shell's setup mode.)
 */
export function endForLaunch(session: ModernSession): Promise<void> | null {
  if (session.end) return session.end();
  return session.state() === 'signed-out' ? null : session.signOut();
}

let page: ModernSession | null = null;

/** OT.R61: fetch's credentials mode of the remember service (`../connectHost` `AccountRequestOptions`). */
const REMEMBER_FETCH_MODE = 'include' as const;

/**
 * The page's one session, made on first use over the original page's account service at the page's own origin
 * (`pageAccountService`, the same call `../frontEnd` makes for the original's LOGIN), and closed at `pagehide`.
 */
export function pageSession(win: Window = window): ModernSession {
  if (page) return page;
  const dev = (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;   // as `../frontEnd`'s `devBuild`
  const account = (o: AccountRequestOptions = {}): LobbyService => pageAccountService(win.location.search, win.location, dev, undefined, undefined, undefined, o);
  // OT.R61: the plain service (the original's), the remember one (a ticked and the quick sign-in) and the forget one.
  const s = createSession(account(), { services: { remember: account({ credentials: REMEMBER_FETCH_MODE }), forget: account({ forget: true }) } });
  win.addEventListener('pagehide', () => { s.close(); });
  page = s;
  return s;
}
