import {
  ConnectCommands, LobbyClient, MEDIUS_STATUS, PLAYER_PASSWORD_VAR, SECURE_PASSWORD_VALVE, lobbyEventInto, locTextOf,
  type AcctDb, type CaptionSource, type DialogPartsHost, type FrontEndMachine, type LobbyLoginReply, type LobbyService, type SoftKeyboardFrontEnd,
  type UiCommandHost, type UiVarManager, type ValveStore,
} from '@s2u/ui';
import { playedRules } from './net/rules';
import { isSavedPasswordStandIn, savedAtSuccess, standInRefused } from './personaHost';
import { devSwitches } from './source';
import { universeServiceBase } from './universeHost';

/**
 * ONL-07's page half (web research 157 §5): the connect and the login on the page -- `@s2u/ui`'s lobby client (the
 * console's lobby object, its states and the valve the connecting screen reads) over the match server's account
 * endpoint, and `LobbyLogin` / `LobbyRegister` registered in PLAT-08's host.
 *
 * **The service is SVC-03's, as it answers today** (`packages/central/src/accountHttp.ts`, research 132 §4): `POST
 * <base>/account/login` with `{ name, password, savePassword }` answers `{ status, ticket? }` (200; 429 past the
 * attempt limit), `POST <base>/account/create` with `{ name, password }` answers `{ status }`, `POST
 * <base>/account/logout` with `{ ticket }` answers `{ status }` -- `status` the Medius status the console's callback
 * reads. The base is the page's own origin (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`: `server=` only under the
 * developer's `?devmode` on a development build). The transport is ours (a browser adaptation); the statuses and what
 * the client does with each are the original's.
 *
 * **What the login exposes** (OT.R22; research 157 §7 says it whole). The typed password is in the page's memory from
 * the keyboard's ENTER until the login is answered (`@s2u/ui`'s `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`), and crosses
 * the network in this request's body: over TLS when the page and the server are served over HTTPS, in clear when they
 * are not (a LAN or local run over `http:`). It is never put in the address, in storage, in a cookie or in a log line
 * of the page's. A typed password under SAVE PASSWORD: NO goes with no credentials (`credentials: 'omit'`): no cookie
 * is shown or set. Under YES, and for a saved password, the login is the remember cookie's (MISSION OT.R61; the
 * server's HttpOnly token, which no page script reads): `pageLoginService`, `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`.
 * *Was, until 2026-10-17: every login went 'omit', the remember token unbuilt (OT.R17).*
 *
 * **The session's ticket: the seam.** A login's success carries the server's `ticket`. It is kept in the lobby
 * client's memory only (`LobbyClient.ticket()`), never in `localStorage`, `sessionStorage`, a cookie or the address: a
 * reload ends the page's hold on the session. The screens after the login (ONL-09 on) read it from the session's
 * lobby -- `FrontEndSession.lobby?.ticket()` -- and present it as the bearer of their requests (`/lobby/*`, the
 * WebSocket's join: SVC-07a's session, `agent/bridge`). `LobbyService.enterLobby(ticket)`, absent here, is where a
 * step that proves the ticket to the lobby before the menu opens would go (the console's second connection, state 16).
 * `keepAlive` posts `<base>/lobby/update-user-state` `{ userAction: 1 }` with the ticket as its bearer (the bridge's
 * endpoint, research 159 §4; not on this base: the controller reconciles), which the client sends every
 * `LOBBY_KEEPALIVE_MS` while no game socket holds the session; a 401, 403 or 404 is the session lost (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`; the lobby client's reading, `@s2u/ui`).
 */

/**
 * ACCOUNT_HTTP_REFUSAL_ADAPTATION: how an HTTP answer that carries no Medius status reads -- a refused `Origin` (403),
 * no endpoint mounted (404), a server fault (5xx), a body that is not `{ status: <integer> }`. The console has no such
 * answer (its transport carries a status or nothing); the server did answer, and not with a success, -998, -997 or
 * -978, so it is read as MediusFail (-966, `RT.Common/Types.cs:104`): the login callback's "any other status" branch,
 * MP_MEDIUS_ERROR "Login Failure" (`FUN_002eefa0` D:L191179-191182); for a registration, a failure (state 6). A request
 * that gets no answer at all (the fetch rejects: no server, no network) is a request never answered, and the screen's
 * 90 s watchdog decides, as on the console. A browser adaptation of the transport.
 */
export const ACCOUNT_HTTP_REFUSAL_ADAPTATION = 'an HTTP answer with no Medius status reads as MediusFail (-966); no answer at all is a request never answered' as const;

/**
 * ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION (OT.R22; research 157 §5, §7): the account requests -- `/account/login`,
 * `/account/create`, `/account/logout`, and the session's keep-alive, which carries the ticket -- go only to the page's
 * own origin. ONL-04's `universeServiceBase` takes the address's `server=` with any host, so a crafted link to the
 * genuine page (`?server=https://evil.example`) would make it post the name and the typed password a player gives it
 * to another host. The universe list and the match keep honouring `server=`; the account requests honour it only under
 * the developer's dev-tools switch (`./source` `devSwitches`' `tools`: `?devtools`, or `?devmode` which includes it; OT.R14's
 * convenience) on a development build (Vite's `import.meta.env.DEV`), never in a
 * production build, whatever its address says. The console has no such parameter: its server is its network
 * configuration's. A browser adaptation. *Since OT.R47 (2026-10-12) one served page is a development build: the
 * nightly, behind its gate -- and the testers who hold the gate's cookie are the very players a crafted link would
 * reach, so the nightly is built with `VITE_S2U_ACCOUNT_ORIGIN_ONLY=1` (`accountOriginOnly` below), which keeps the
 * account base on the page's own origin even there (the NB-6 review's M-1; the owner's row in the nightly plan).*
 */
export const ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION = "the account requests go to the page's own origin; server= only under ?devtools (or ?devmode, which includes it) on a development build" as const;

/**
 * KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION (review of ONL-07, 2026-10-05): how the keep-alive's HTTP answer reads. 2xx: the
 * session held. 401: the session gone (the lobby client's session-lost reading, `@s2u/ui`). 403 (the page's origin refused) and 404 (no endpoint at
 * the page's origin) are a deploy's misconfiguration that no retry mends: also the session lost, so the player sees
 * state 2's error now rather than a session that dies silently 300 s later (`SESSION_SILENT_MS_READING`; 60 s before NU-16b). Anything else -- 5xx, 429 and the other
 * statuses -- is alive-unknown: nothing changes and the next period tries again, as a request that gets no answer at
 * all (the fetch rejects) does. A browser adaptation of the transport.
 */
export const KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION = '2xx alive; 401, 403 and 404 the session lost; 5xx and the rest alive-unknown, retried next period' as const;

/**
 * ACCOUNT_SERVICE_ABSENT_ADAPTATION (web sprint 37, PTT-3; issue #100; research 157 §5, §11): what the page says, in
 * a line of its own, when the account base (`accountServiceBase`, ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION's) answers a
 * login screen's account request -- `/account/login`, or `/account/create` (the register question's YES) -- with 404
 * and a body that carries no integer Medius `status`. That is an origin with no account service behind it: Vite's dev
 * server (7.3.6's `vite404Middleware`: a bare 404), a static host, or a match server started with no `DATA_DIR` **only
 * when it is reached at the page's own origin** (the review's F2). Under `?devmode&server=` -- cross-origin, PTT-1's
 * link -- such a server answers the JSON POST's preflight `OPTIONS` with the same bare 404 (`server.ts` :956, no CORS
 * headers: no account handler is mounted), so the browser rejects the fetch, no line shows, and the connecting screen
 * waits on its 90 s watchdog (`monitor_timeout`, #547), as for any request never answered. SVC-03's handler never
 * answers 404 itself (`packages/central/src/accountHttp.ts` `accountHandler`: 403, 204, 405, 415, 400,
 * 200, 429, 500), and the match server's own 404 for a path no handler takes has no body (`server.ts` :956), so a 404
 * that does carry `{ status: <integer> }` is a service's own answer and reads as that status with no line. The reply the
 * lobby client gets is unchanged (MediusFail, ACCOUNT_HTTP_REFUSAL_ADAPTATION), so the original's MP_MEDIUS_ERROR
 * "Login Failure" (`FUN_002eefa0` D:L191179-191182) still shows; the line is the page's, beside it, labelled
 * `ACCOUNT_SERVICE_ABSENT_LABEL`, never on the game's screen and never one of its strings. The keep-alive's 404 stays
 * KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION's (the session lost), the logout's is silent as before, and nothing the page
 * sends changes. The console has no such answer (its transport carries a status or nothing). A browser adaptation.
 */
export const ACCOUNT_SERVICE_ABSENT_ADAPTATION = 'no account service at this origin' as const;

/**
 * PAGEHIDE_LOGOUT_ADAPTATION (NU-16b, 2026-10-15; the merge controller's word, option (a); research 157 §7 item 3,
 * 159 §1): the page going away -- a reload, a close, a navigation: a `pagehide` that is not `persisted` (not the
 * back/forward cache, from which the page may come back with its session) -- stops the front end (`mountFrontEnd`'s
 * listener, `frontEnd.ts`), whose session's close sends the lobby's logout (`LobbyClient.close`,
 * `LOBBY_CLOSE_AT_STOP_ADAPTATION`); this transport sends that logout with `keepalive: true`, so the browser carries it
 * through the page's unload. The server then ends the session at once, and the reloaded page's login is answered at
 * once, never AccountLoggedIn (-997, UIMnLOC 543) while the old session waits out the services' idle for a session no
 * socket holds (server `accounts.ts`, `SESSION_SILENT_MS_READING`, 300 s: the cost the merge controller named). The
 * logout is same-origin (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`), so its JSON body needs no preflight, which a
 * keepalive request may not get -- except on a development link naming another server (`?devmode&server=`, the owner's
 * local playtest), where the logout is cross-origin and a browser may drop it at the unload: there a reload can still be
 * answered -997 for up to 300 s (NU-16b's review, low; research 157 §7); the login, the create and the keep-alive are not keepalive. The console's session ends
 * with its lobby connection; the page has none to drop. A browser adaptation of the transport: nothing the game's
 * screens do changes.
 */
export const PAGEHIDE_LOGOUT_ADAPTATION = "a non-persisted pagehide stops the front end; its logout is sent keepalive, so the session ends at the unload" as const;

/** The line's label: the page's own words, never the game's (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`). */
export const ACCOUNT_SERVICE_ABSENT_LABEL = 'This page, not the game (a browser adaptation): ' as const;

/** The line's element id (one line at most on the page). */
export const ACCOUNT_SERVICE_ABSENT_LINE_ID = 'account-service-absent' as const;

/**
 * RV-10 (LATER 27; research 276 §12): the line's width cap, a browser adaptation with no original (the console has no
 * such line). The window less the line's own 8 px gutter on each side: `right` is 8 px, and the cap keeps 8 px on the
 * left too, so on a narrow window the line no longer runs to the window's left edge. The front end's page, where the
 * line shows, has no playtest badge (only `/testroom` mounts it), and the badge exports no width. To be confirmed or
 * changed by the first browser run of `e2e/accountNotice.spec.ts` at 375 x 812.
 */
export const ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION = 'calc(100vw - 16px)' as const;

/**
 * LATER 27 (a) (the merge controller's call, product taste, 2026-10-19; a browser adaptation): on a window wider than the
 * front end's frame (`./frontEnd` the 640 x 448 canvas, `object-fit: contain`) the line goes into the right-hand letterbox
 * bar, capped to the bar less its 8 px gutters, so it never lies over the frame's dialog title (on a phone held sideways,
 * 812 x 375, a second row over the title at y 54-65); with no bar at least this wide (px) it stays at the window's top
 * right under RV-10's cap. The exact 640 x 448 window has no bar: its overlap is known (LATER 27).
 */
export const ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION = 96;

/**
 * The line's width cap for this window (`ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION`): the right bar's, else RV-10's. The
 * bar is measured from the front end's canvas box when it is on the page (`#front-end`: its insets, a cutout's on one
 * side, and the touch layout's picture height already in it -- its review's F1), the 640 x 448 frame contained and
 * centred in that box; without the canvas, from the window as if the frame were centred in it.
 */
function absentLineWidth(doc: Document): string {
  const win = doc.defaultView;
  if (!win) return ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION;
  const box = doc.getElementById('front-end')?.getBoundingClientRect();
  const right = box && box.width > 0 && box.height > 0
    ? box.left + (box.width + Math.min(box.width, box.height * 640 / 448)) / 2
    : (win.innerWidth + Math.min(win.innerWidth, win.innerHeight * 640 / 448)) / 2;
  const bar = Math.floor(win.innerWidth - right - 16);
  return bar >= ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION ? `${bar}px` : ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION;
}

/** Where `ACCOUNT_SERVICE_ABSENT_ADAPTATION`'s line is shown: `show` at an absent service's 404, `clear` at an answer with a status. */
export interface AccountServiceAbsentLine {
  show(base: string): void;
  clear(): void;
}

/**
 * `ACCOUNT_SERVICE_ABSENT_ADAPTATION`'s line on the page: one `<p>` over the front end's canvas (z-index 1000), the
 * design system's `s2u-notice` (placement only here: `test/chrome_classes.test.ts`), its label in `<b>`, then the words
 * and the base. It takes no pointer, so the canvas's input is untouched. **Its place, the window's top right** (the
 * review's F1): the 640 x 448 frame's top band (`eq_title_back`, (16, 15) 610 x 46) holds nothing on either screen the
 * line meets -- `dlgNetConnect`'s title is at (30, 65), its state line at (325, 118); `dlgNetPlayerName`'s title at
 * (30, 65) -- while the foot holds `dlgNetConnect`'s `playername` (25, 428) and the form's BACK and SELECT legends
 * (470, 428), (540, 428) (`RUN/UI/READERC.ZAR`, the two layouts through `tools/dump-dialogs.ts --dialog`); the Login
 * Failure popup (`OnNetError`'s record, `RUN/UIZANIM.ZAR`) is the panel at (150, 180) 340 x 200, then #515's at (150,
 * 180) 340 x 80, mid-frame; and the playtest badge, its mark and its grace line hold the top left (`./playtestSession`).
 */
export function accountServiceAbsentLine(doc: Document): AccountServiceAbsentLine {
  // LATER 27 (a): the line placed again when the window changes (a phone turned), while it is shown.
  const place = (): void => {
    const el = doc.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID);
    if (el) el.style.maxWidth = absentLineWidth(doc);
    else doc.defaultView?.removeEventListener('resize', place);
  };
  return {
    show: (base) => {
      let el = doc.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID);
      if (!el) {
        el = doc.createElement('p');
        el.id = ACCOUNT_SERVICE_ABSENT_LINE_ID;
        el.className = 's2u-notice';
        el.setAttribute('role', 'status');
        el.dataset['adaptation'] = 'ACCOUNT_SERVICE_ABSENT_ADAPTATION';
        el.style.position = 'fixed';
        el.style.top = '8px';
        el.style.right = '8px';
        el.style.maxWidth = absentLineWidth(doc);      // LATER 27 (a): the right bar's, else RV-10's cap
        el.style.overflowWrap = 'anywhere';                     // a long base (one unbroken URL) wraps inside the cap
        el.style.margin = '0';
        el.style.zIndex = '1001';
        el.style.pointerEvents = 'none';
        doc.body.append(el);
        doc.defaultView?.addEventListener('resize', place);
      }
      const label = doc.createElement('b');
      label.textContent = ACCOUNT_SERVICE_ABSENT_LABEL;
      el.replaceChildren(label, `${ACCOUNT_SERVICE_ABSENT_ADAPTATION} (${base})`);
    },
    clear: () => { doc.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID)?.remove(); doc.defaultView?.removeEventListener('resize', place); },
  };
}

/**
 * SIGNED_IN_ELSEWHERE_ADAPTATION (SESSION-TAKEOVER's fold, the merge controller's condition, 2026-10-15; research 157
 * §6 item 3): what the page says when its session was ended by a login of the same account elsewhere -- the server's
 * takeover (server `accounts.ts`, `SESSION_TAKEOVER_ADAPTATION`), told by the lobby endpoint's 401 carrying
 * `{ reason: 'taken-over' }` (`SESSION_TAKEN_OVER_REASON`). The original's own flow is unchanged: the session lost queues
 * state 2, MP_MEDIUS_ERROR with UIMnLOC 450's text (`SESSION_LOST_READING`, `@s2u/ui`), the console's dialog for a lobby
 * connection that fails. No caption of the original says the account was signed in elsewhere (research 315 §2: #365 "You
 * have been disconnected from SOCOM Online." is the GAME LOBBY's errno-32 popup, #548 "Disconnected due to a network
 * error." no script's, #1067 / #1068 the network library's), so these words are the page's, in a line of its own beside
 * the dialog (`signedInElsewhereLine`), labelled `ACCOUNT_SERVICE_ABSENT_LABEL`, never on the game's screen and never one
 * of its strings. Shown once the lobby client has taken the session as lost and the service has said why
 * (`LobbyService.sessionEndedWhy`, one request with the dead ticket), while the lobby connection that lost it stands (an
 * answer after its disconnect is dropped); cleared at the lobby's disconnect (MAIN MENU's teardown, the page's stop) and
 * at the next login's or registration's answer with a status. A browser adaptation: nothing the game's screens do changes.
 */
export const SIGNED_IN_ELSEWHERE_ADAPTATION = 'this account signed in elsewhere, so its session here ended' as const;

/** `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line's element id (one line at most on the page). */
export const SIGNED_IN_ELSEWHERE_LINE_ID = 'signed-in-elsewhere' as const;

/** Where `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line is shown: `show` once the session was taken over, `clear` at a login's answer. */
export interface SignedInElsewhereLine {
  show(): void;
  clear(): void;
}

/**
 * `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line on the page: as `accountServiceAbsentLine`'s -- one `<p>` over the canvas, the
 * design system's `s2u-notice`, its label in `<b>`, no pointer, the window's top right (the frame's top band holds nothing
 * on the screens state 2's dialog meets, the absent line's F1) -- with its own id.
 */
export function signedInElsewhereLine(doc: Document): SignedInElsewhereLine {
  return {
    show: () => {
      let el = doc.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID);
      if (!el) {
        el = doc.createElement('p');
        el.id = SIGNED_IN_ELSEWHERE_LINE_ID;
        el.className = 's2u-notice';
        el.setAttribute('role', 'status');
        el.dataset['adaptation'] = 'SIGNED_IN_ELSEWHERE_ADAPTATION';
        el.style.position = 'fixed';
        el.style.top = '8px';
        el.style.right = '8px';
        el.style.maxWidth = ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION;
        el.style.overflowWrap = 'anywhere';
        el.style.margin = '0';
        el.style.zIndex = '1001';
        el.style.pointerEvents = 'none';
        doc.body.append(el);
      }
      const label = doc.createElement('b');
      label.textContent = ACCOUNT_SERVICE_ABSENT_LABEL;
      el.replaceChildren(label, SIGNED_IN_ELSEWHERE_ADAPTATION);
    },
    clear: () => { doc.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID)?.remove(); },
  };
}

/**
 * SAVED_PASSWORD_REGISTER_LINE_ADAPTATION (LATER 332, research 365; the merge controller's (b), 2026-10-24, after the
 * owner's ask for failure text that says what failed): what the page says when the register question's YES handed
 * the registration a saved password's stand-in, which cannot register (`SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION`):
 * the original registers with the saved password itself; the page holds none, so it asks for one. The original's state
 * 6 is unchanged ("STATE: REGISTRATION FAILURE", WAIT 1, back, no popup); these words are the page's, in a line of its
 * own as `signedInElsewhereLine`'s, labelled `ACCOUNT_SERVICE_ABSENT_LABEL`, never on the game's screen. Shown at that
 * refusal's answer; taken down at the next login or registration asked, and at the lobby's disconnect. With it the
 * form's PLAYERPASSWORD and the record's stand-in are let go (`connectLobby`, `standInRefused`), so the original's own
 * form script lights PASSWORD and keeps CONNECT dark until one is typed. A browser adaptation.
 */
export const SAVED_PASSWORD_REGISTER_LINE_ADAPTATION = 'a saved password cannot register a new Player Name: type a password, then CONNECT' as const;

/** `SAVED_PASSWORD_REGISTER_LINE_ADAPTATION`'s line's element id (one line at most on the page). */
export const SAVED_PASSWORD_REGISTER_LINE_ID = 'saved-password-register' as const;

/**
 * SAVED_PASSWORD_LOGIN_LINE_ADAPTATION (LOGIN-CRASH, Trello k3r8P8nY, bug 2; product track, beside LATER 332's line):
 * what the page says when a saved password's quick sign-in (the stand-in, `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`: the
 * remember cookie, no password) is answered InvalidPassword (-978). The stand-in's secret is the cookie, and -978 to it
 * says this browser holds none that signs in -- cleared, expired, or another browser or device -- so the stand-in can
 * never sign in here again. Kept (as #545 kept it), every CONNECT sent it again, was refused, and counted against the
 * login limit. Now, at that answer, the form's PLAYERPASSWORD and the record's stand-in are let go (`connectLobby`,
 * `standInRefused`, as LATER 332's): the original's own form script lights PASSWORD and keeps CONNECT dark until one is
 * typed, and a typed login under SAVE PASSWORD: YES saves anew (`savedAtSuccess`). The game's MP_INVALID_PASSWORD popup
 * is unchanged; these words are the page's, in a line of their own, labelled `ACCOUNT_SERVICE_ABSENT_LABEL`, never on
 * the game's screen; taken down at the next login or registration asked, and at the lobby's disconnect. A typed
 * password's -978 and any other refusal of the stand-in (-997 among them) are as before. A browser adaptation.
 */
export const SAVED_PASSWORD_LOGIN_LINE_ADAPTATION = 'this browser no longer holds the saved password: type the password, then CONNECT' as const;

/** `SAVED_PASSWORD_LOGIN_LINE_ADAPTATION`'s line's element id (one line at most on the page). */
export const SAVED_PASSWORD_LOGIN_LINE_ID = 'saved-password-login' as const;

/** Where `SAVED_PASSWORD_REGISTER_LINE_ADAPTATION`'s line is shown: `show` at the refusal, `clear` at the next attempt. */
export interface SavedPasswordRegisterLine {
  show(): void;
  clear(): void;
}

/** `SAVED_PASSWORD_REGISTER_LINE_ADAPTATION`'s line on the page: as `signedInElsewhereLine`'s, with its own id. */
export function savedPasswordRegisterLine(doc: Document): SavedPasswordRegisterLine {
  return savedPasswordLine(doc, SAVED_PASSWORD_REGISTER_LINE_ID, 'SAVED_PASSWORD_REGISTER_LINE_ADAPTATION', SAVED_PASSWORD_REGISTER_LINE_ADAPTATION);
}

/** `SAVED_PASSWORD_LOGIN_LINE_ADAPTATION`'s line on the page: as the register line, with its own id and words. */
export function savedPasswordLoginLine(doc: Document): SavedPasswordRegisterLine {
  return savedPasswordLine(doc, SAVED_PASSWORD_LOGIN_LINE_ID, 'SAVED_PASSWORD_LOGIN_LINE_ADAPTATION', SAVED_PASSWORD_LOGIN_LINE_ADAPTATION);
}

/** A saved password's page line (`savedPasswordRegisterLine`, `savedPasswordLoginLine`): one element by `id`. */
function savedPasswordLine(doc: Document, id: string, adaptation: string, words: string): SavedPasswordRegisterLine {
  return {
    show: () => {
      let el = doc.getElementById(id);
      if (!el) {
        el = doc.createElement('p');
        el.id = id;
        el.className = 's2u-notice';
        el.setAttribute('role', 'status');
        el.dataset['adaptation'] = adaptation;
        el.style.position = 'fixed';
        el.style.top = '8px';
        el.style.right = '8px';
        el.style.maxWidth = ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION;
        el.style.overflowWrap = 'anywhere';
        el.style.margin = '0';
        el.style.zIndex = '1001';
        el.style.pointerEvents = 'none';
        doc.body.append(el);
      }
      const label = doc.createElement('b');
      label.textContent = ACCOUNT_SERVICE_ABSENT_LABEL;
      el.replaceChildren(label, words);
    },
    clear: () => { doc.getElementById(id)?.remove(); },
  };
}

/** `KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`: false (the session lost) for 401, 403 and 404; true otherwise. */
function keepAliveAnswer(status: number): boolean {
  return status !== 401 && status !== 403 && status !== 404;
}

/** The build-time flag that keeps the account base on the page's own origin even in a development build. */
export const ACCOUNT_ORIGIN_ONLY_ENV = 'VITE_S2U_ACCOUNT_ORIGIN_ONLY';

/**
 * Whether this build keeps the account requests on the page's own origin whatever `?devmode&server=` says: `1` only
 * (`deploy/nightly.sh` sets it for the nightly, a development build behind a gate, and `deploy/pages/publish.sh` for the
 * page on Pages, one hostname with central (SA.R3, SA-10); every other build leaves it unset).
 */
export function accountOriginOnly(env: Record<string, string | undefined> | undefined =
  import.meta.env as Record<string, string | undefined> | undefined): boolean {
  return env?.[ACCOUNT_ORIGIN_ONLY_ENV] === '1';
}

/** The base of the account requests for this page (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`). */
export function accountServiceBase(search: string, location: { protocol: string; host: string; origin?: string }, devBuild: boolean,
  originOnly: boolean = accountOriginOnly()): string {
  const own = location.origin ?? `${location.protocol}//${location.host}`;
  return devBuild && devSwitches(search, devBuild).tools && !originOnly ? universeServiceBase(search, location) : own;
}

/**
 * HARD-SEAT, research 169 measure 7 (weak point 11; OT.R26): the match socket whose hello carries the login's ticket
 * (a game's, `NetPageDeps.game`; the session's live bearer) goes where the account requests go -- the page's own
 * origin, at `/ws`, `wss:` on an `https:` page -- by the same rule (`accountServiceBase`: `server=` only under the
 * developer's `?devtools` -- which `?devmode` sets -- on a development build), so a crafted `server=` link never sends a live bearer to another
 * host. A socket without a ticket (the maps' rooms of `?mp`, `/testroom`) keeps `server=` (`netSettings`). A browser
 * adaptation of the transport, as `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`.
 */
export function matchSocketUrl(search: string, location: { protocol: string; host: string; origin?: string }, devBuild: boolean,
  originOnly: boolean = accountOriginOnly()): string {
  const base = new URL(accountServiceBase(search, location, devBuild, originOnly));
  return `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}/ws`;
}

/**
 * HARD-SEAT (the review's (4)): a match socket URL made by `matchSocketUrl` and nothing else -- the only URL a game's
 * socket (`NetPageDeps.game.pinned`) may open; `NetPage` refuses any other at its construction. Made only by
 * `pinnedMatchSocket` (the class is not exported).
 */
class PinnedSocketUrl {
  /**
   * SA-6b (`GAME_DOOR_ADAPTATION`): `devDoors`, whether this page may follow a placed game's loopback door -- by the
   * rule `server=` follows (`accountServiceBase`: a development build under the dev-tools switch, not origin-only), decided once
   * where the page's own socket is pinned.
   */
  constructor(readonly url: string, readonly devDoors: boolean) { Object.freeze(this); }
}
export type { PinnedSocketUrl };

/** The page's pinned match socket (`matchSocketUrl`), for a socket whose hello carries the ticket. */
export function pinnedMatchSocket(search: string, location: { protocol: string; host: string; origin?: string }, devBuild: boolean,
  originOnly: boolean = accountOriginOnly()): PinnedSocketUrl {
  return new PinnedSocketUrl(matchSocketUrl(search, location, devBuild, originOnly), devBuild && devSwitches(search, devBuild).tools && !originOnly);
}

/** Whether `v` was made by `pinnedMatchSocket` (`NetPage`'s guard). */
export function isPinnedSocket(v: unknown): v is PinnedSocketUrl {
  return v instanceof PinnedSocketUrl;
}

/**
 * GAME_DOOR_ADAPTATION (the server split, SA.R22 (3)-(4), (6); OT.R27; a browser adaptation of the transport, no
 * original): a **placed** lobby game -- one central placed on a validated host (SA-6) -- is joined at the **door**
 * central's join or world report names, `wss://<host>.play.socom2legacy.com/g/<gameId>` (H251: the host 1-32 letters,
 * digits and hyphens, not starting or ending with one, lower case), or in devmode only (`PinnedSocketUrl.devDoors`) the
 * loopback `ws://127.0.0.1:<5343-5349>/g/<gameId>` -- central's `doorAccepted` (`packages/central/src/placement.ts`)
 * mirrored exactly, the game the one joined; any other scheme, host, port, path, query or credentials is refused. The
 * door is held as a `PinnedGameDoor`, made only by `pinnedGameDoor` over central's answer. Its hello carries the game
 * token central issued in place of the login's ticket; the login's bearer stays pinned to the page's origin (SA.R5)
 * and never goes to a door, a token never to the pinned socket (`GameSeat`). A **local** game (no door, no token) is
 * joined as before, on the pinned socket with the ticket. A placed forge lobby follows its door the same way
 * (LATER 275, `pinnedForgeDoor`: central's create or token answer, the hello's forge token); a forge lobby central runs
 * itself, and the maps' rooms, keep the pinned socket (SA.R14; a host-run standing room, `ROOM_DOOR_ADAPTATION`).
 */
export const GAME_DOOR_ADAPTATION = 'a placed game at its door (*.play.socom2legacy.com/g/<id>, the devmode loopback) with its game token; the login bearer never at a door' as const;

/**
 * The production door: `wss://<host>.play.socom2legacy.com/g/<id>` (H251). The host is central's `HOST_NAME`
 * (`packages/central/src/directory.ts`, SA-6f: one DNS label, 1-32 letters, digits and hyphens, not starting or ending
 * with one), lower-cased as `doorAccepted` writes it -- mirrored here, not imported (the page shares no code with central).
 */
const PRODUCTION_DOOR = /^wss:\/\/[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.play\.socom2legacy\.com\/g\/([1-9][0-9]{0,15})$/;
/** The devmode door: the loopback, a match server's port 5343-5349 (central's `DEV_DOOR_PORTS`). */
const DEVMODE_DOOR = /^ws:\/\/127\.0\.0\.1:534[3-9]\/g\/([1-9][0-9]{0,15})$/;

/** A placed game's door (`GAME_DOOR_ADAPTATION`), made only by `pinnedGameDoor` and `pinnedForgeDoor` (the class is not exported). */
class PinnedGameDoor {
  constructor(readonly url: string, readonly game: number) { Object.freeze(this); }
}
export type { PinnedGameDoor };

/** Central's `door` for `game` pinned, or null when it is not one the page follows (`GAME_DOOR_ADAPTATION`); never throws. */
export function pinnedGameDoor(raw: unknown, game: number, devDoors: boolean): PinnedGameDoor | null {
  if (typeof raw !== 'string' || !Number.isSafeInteger(game) || game <= 0) return null;
  const m = PRODUCTION_DOOR.exec(raw) ?? (devDoors ? DEVMODE_DOOR.exec(raw) : null);
  return m && Number(m[1]) === game ? new PinnedGameDoor(raw, game) : null;
}

/**
 * LATER 275 (SA-7i's page half, `GAME_DOOR_ADAPTATION`): a placed forge lobby's `door` (central's create or token answer)
 * pinned, its game id read from the door's own `/g/<id>` -- the page knows the lobby by its string id, central placed it
 * under a number -- by the same two forms as a game's door; null when it is not one the page follows. Never throws.
 */
export function pinnedForgeDoor(raw: unknown, devDoors: boolean): PinnedGameDoor | null {
  if (typeof raw !== 'string') return null;
  const m = PRODUCTION_DOOR.exec(raw) ?? (devDoors ? DEVMODE_DOOR.exec(raw) : null);
  const game = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(game) && game > 0 ? new PinnedGameDoor(raw, game) : null;
}

/** Whether `v` was made by `pinnedGameDoor` (or LATER 275's `pinnedForgeDoor`). */
export function isPinnedDoor(v: unknown): v is PinnedGameDoor {
  return v instanceof PinnedGameDoor;
}

/**
 * ROOM_DOOR_ADAPTATION (SA-7h S5; the server split, SA.R14, SA.R22 (3)-(4); OT.R27; a browser adaptation of the
 * transport, no original): the test room's `?mp` page joins a **host-run standing room** -- one central's `/rooms` lists
 * with `hosted: true` (`hostedRoom`), on the page's own origin (`ownOriginRoomSocket`: the bare `?mp`, and since TRS-1 a
 * deployed page's Online = Shared) or, TRS-2, a local page's Shared at the local stack's central (`./online`
 * `LOCAL_STACK_SERVER`, its loopback doors); never `local` or a `server=` -- through central's room pass (`askRoomPass`, `POST /lobby/room-pass`): the door it
 * hands is pinned (`pinnedRoomDoor`: `wss://<host>.play.socom2legacy.com/r/<MAP>/classic`, or in devmode only the loopback
 * `ws://127.0.0.1:<5343-5349>/r/<MAP>/classic` -- central's `roomDoorAccepted` mirrored, the room the one asked) and its
 * token goes in the hello in place of a ticket; the login's bearer goes only to the page's origin, never to a door. Every
 * connect and reconnect asks a fresh pass (the token lives 60 s). Any other room or server keeps today's path exactly.
 */
/**
 * #421 review F6, the merge controller's (b): a host-run standing room is classic (standing respawn rooms are LATER 313), so
 * a respawn ask (OT.R71, the test room's Rules) is seated in the map's classic standing room and the page says so.
 */
export const STANDING_ROOM_CLASSIC_LINE = 'Respawn isn\'t offered in the online test room yet: this room plays classic' as const;
export const ROOM_DOOR_ADAPTATION = 'a host-run standing room at its door (*.play.socom2legacy.com/r/<MAP>/classic, the devmode loopback) with a room pass\'s token; the login bearer never at a door' as const;

/** A standing room's key, `MP<n>/classic` (central's `ROOM_KEY`). */
const ROOM_KEY = /^MP\d{1,2}\/classic$/;
const PRODUCTION_ROOM_DOOR = /^wss:\/\/[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.play\.socom2legacy\.com\/r\/(MP\d{1,2}\/classic)$/;
const DEVMODE_ROOM_DOOR = /^ws:\/\/127\.0\.0\.1:534[3-9]\/r\/(MP\d{1,2}\/classic)$/;

/** A standing room's door (`ROOM_DOOR_ADAPTATION`), made only by `pinnedRoomDoor` (the class is not exported). */
class PinnedRoomDoor {
  constructor(readonly url: string, readonly room: string) { Object.freeze(this); }
}
export type { PinnedRoomDoor };

/** Central's `door` for `room` pinned, or null when it is not one the page follows (`ROOM_DOOR_ADAPTATION`); never throws. */
export function pinnedRoomDoor(raw: unknown, room: string, devDoors: boolean): PinnedRoomDoor | null {
  if (typeof raw !== 'string' || !ROOM_KEY.test(room)) return null;
  const m = PRODUCTION_ROOM_DOOR.exec(raw) ?? (devDoors ? DEVMODE_ROOM_DOOR.exec(raw) : null);
  return m && m[1] === room ? new PinnedRoomDoor(raw, room) : null;
}

/** Whether `v` was made by `pinnedRoomDoor`. */
export function isPinnedRoomDoor(v: unknown): v is PinnedRoomDoor {
  return v instanceof PinnedRoomDoor;
}

/** A standing room's seat: its pinned door and the pass's token. */
export interface RoomSeat { readonly pinned: PinnedRoomDoor; readonly token: string }

/** Whether `v` is a `RoomSeat` of `room` (`NetPage`'s guard): a pinned room door of that room and a token's form. */
export function isRoomSeatOf(v: unknown, room: string): v is RoomSeat {
  if (!v || typeof v !== 'object') return false;
  const s = v as { pinned?: unknown; token?: unknown };
  return isPinnedRoomDoor(s.pinned) && s.pinned.room === room && isGameToken(s.token);
}

/**
 * A pass's answer as the page reads it: a seat; a refusal -- `already seated` (409: the account seated in a game or
 * another room), `no room` (404: no placeable host runs it), `unavailable` (503: the host's door not one central hands
 * out), `rejected` (any other refusal -- 400, 401, 403 --, an answer of another shape or a door the page does not follow),
 * `name` (a guest's name central would refuse: none asked); or `failed` (a 5xx, a 429, the network), the backoff's. On a
 * reconnect `no room` and `unavailable` are the backoff's too (a host restarting, `NetPage`); `rejected` never is.
 */
export type RoomPass =
  | { readonly kind: 'seat'; readonly seat: RoomSeat }
  | { readonly kind: 'refused'; readonly why: 'already seated' | 'no room' | 'unavailable' | 'rejected' | 'name' }
  | { readonly kind: 'failed' };

/**
 * The line a refused pass shows (the page's status, the HUD's): `already seated` as the match server's own refusal reads;
 * the others the page's own words. An adaptation.
 */
export function roomRefusalLine(why: Extract<RoomPass, { kind: 'refused' }>['why']): string {
  return why === 'already seated' ? 'already seated' : why === 'no room' ? 'the room is not running'
    : why === 'name' ? 'set a name to join this room' : 'the room could not be joined';
}

/**
 * The standing room's 4003 reasons one fresh pass may answer, once between welcomes (the review's F3): another room's or
 * another host's token, and a token the room could not take (`standing.ts`: `no seat in that room`, `not logged in`).
 */
export const ROOM_REPASS_REASONS: ReadonlySet<string> = new Set(['no seat in that room', 'not logged in']);

/**
 * SA-41 (the release review's H7): a placed game's 4003 reasons one fresh re-token may answer, once between welcomes --
 * the match process's held hello timed out before its `admit` or the rotated key reached it (`match/src/game.ts`:
 * `no seat in that game`, `not logged in`), as a standing room's are (`ROOM_REPASS_REASONS`).
 */
export const GAME_RETOKEN_REASONS: ReadonlySet<string> = new Set(['no seat in that game', 'not logged in']);

/** A standing room's one pass provider: every connect and reconnect asks it first. */
export interface RoomSeatProvider {
  readonly room: string;
  pass(): Promise<RoomPass>;
}

/** A guest's typed name as central takes it (`roomPass.ts` `GUEST_NAME`): 1-32 printable ASCII, not blank. */
const ROOM_GUEST_NAME = /^[\x20-\x7e]{1,32}$/;

/**
 * Central's room pass for `room` (`POST <base>/lobby/room-pass`, JSON): signed in, the `bearer` and exactly `{ room }` --
 * a 401 (a stale bearer, a forge guest's ticket) asks once again as the typed-name guest; a guest, no `Authorization` and
 * exactly `{ room, name }`. Never rejects.
 */
export async function askRoomPass(o: {
  base: string; room: string; name: string; bearer?: string | null; devDoors: boolean; fetch?: typeof globalThis.fetch; signal?: AbortSignal;
}): Promise<RoomPass> {
  const f = o.fetch ?? globalThis.fetch;
  const ask = async (bearer: string | null): Promise<RoomPass | 401> => {
    let res: Response;
    try {
      res = await f(`${o.base}/lobby/room-pass`, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(bearer ? { room: o.room } : { room: o.room, name: o.name }),
        ...(o.signal ? { signal: o.signal } : {}),
      });
    } catch { return { kind: 'failed' }; }
    if (res.status === 401 && bearer) return 401;
    if ((res.status >= 500 && res.status !== 503) || res.status === 429) return { kind: 'failed' };   // 429: rate limited, transient
    if (res.status === 409) return { kind: 'refused', why: 'already seated' };
    if (res.status === 404) return { kind: 'refused', why: 'no room' };
    if (res.status === 503) return { kind: 'refused', why: 'unavailable' };
    if (res.status !== 200) return { kind: 'refused', why: 'rejected' };
    let body: { status?: unknown; door?: unknown; token?: unknown };
    try { body = await res.json() as typeof body; } catch { return { kind: 'refused', why: 'rejected' }; }
    const pinned = body && body.status === 0 ? pinnedRoomDoor(body.door, o.room, o.devDoors) : null;
    return pinned && isGameToken(body.token) ? { kind: 'seat', seat: { pinned, token: body.token } } : { kind: 'refused', why: 'rejected' };
  };
  const guest = (): Promise<RoomPass> | RoomPass => (ROOM_GUEST_NAME.test(o.name) && o.name.trim() !== '' ? ask(null) as Promise<RoomPass> : { kind: 'refused', why: 'name' });
  if (!o.bearer) return guest();
  const r = await ask(o.bearer);
  return r === 401 ? guest() : r;
}

/**
 * The standing room's key for a map room of `stem` under `rules`, or null (respawn has no standing room). LATER 229: keyed
 * by the rules the room will play (`playedRules`, LATER 153) off the map's type (`gameType`, the page's own read of the
 * mission list, `kitGameType`), as the server keys its rooms (LATER 212) -- a respawn page on a type 1-4 map asks the
 * classic room it shares.
 */
export function roomKeyOf(stem: string, rules: string, gameType?: number): string | null {
  const played = rules === 'respawn' || rules === 'classic' ? playedRules(rules, gameType) : rules;
  const key = `${stem.toUpperCase()}/${played}`;
  return played === 'classic' && ROOM_KEY.test(key) ? key : null;
}

/** Whether central's `/rooms` body lists `room` as a host-run standing room (`hosted: true`, SA-7h S5). */
export function hostedRoom(body: unknown, room: string): boolean {
  if (!Array.isArray(body)) return false;
  return body.some((r: unknown) => {
    const e = r as { map?: unknown; rules?: unknown; hosted?: unknown } | null;
    return !!e && typeof e.map === 'string' && typeof e.rules === 'string' && `${e.map.toUpperCase()}/${e.rules}` === room && e.hosted === true;
  });
}

/** Whether `url` is the page's own origin's `/ws` -- the bare `?mp`'s socket, the one target that may ask a pass. */
export function ownOriginRoomSocket(url: string, location: { protocol: string; host: string }): boolean {
  return url === `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** A fetch cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION` (the review's F1: no request of the join waits for ever); `stop` aborts it. */
function boundedFetch(f: typeof globalThis.fetch, stop?: AbortSignal): typeof globalThis.fetch {
  return (async (url: string, init: RequestInit = {}) => {
    const ctl = new AbortController();
    const cut = setTimeout(() => { ctl.abort(); }, GAME_RETOKEN_WAIT_MS_ADAPTATION);
    const off = (): void => { ctl.abort(); };
    stop?.addEventListener('abort', off);
    try { return await f(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(cut); stop?.removeEventListener('abort', off); }
  }) as typeof globalThis.fetch;
}

/** What a join tells the page (`startRoomJoin`), each at most once but `retrying`, never after its `cancel`. */
export interface RoomJoinAnswers {
  /** Not a hosted room, or `/rooms` unreadable without an `unlisted` answer: today's path. */
  today(): void;
  /** The first pass's seat, and the provider every reconnect asks. */
  seat(seat: RoomSeat, provider: RoomSeatProvider): void;
  /** The first pass refused: its line, no retry, no fall back to `/ws`. */
  refused(why: Extract<RoomPass, { kind: 'refused' }>['why']): void;
  /** The first pass failed (a 5xx, the network, no answer within the bound): asked again in `ms`. */
  retrying(ms: number): void;
  /**
   * TRS-2 (the TRS review's F1): given, `/rooms` unreadable (a 5xx, the network, no answer within the bound) is no answer
   * yet -- listed again in `ms` (the backoff) -- instead of today's path: Online = Shared, whose server not reached is not
   * "no shared room".
   */
  unlisted?(ms: number): void;
  /**
   * LATER 263: given, a 404 on `/rooms` -- the route not served (O29's tunnel rule) -- or a 2xx that is not JSON by its
   * type (a static host's fallback page) is its own answer: once, no retry, no pass. Without it, unreadable, as before.
   */
  noRoute?(): void;
}

/**
 * The test room's join of `room` (SA-7h S5): central's `/rooms` on the page's origin; a room listed `hosted` is passed --
 * its seat, and the provider every reconnect asks; a pass refused is the page's refusal (no fall back to `/ws`); a pass
 * failed waits `delayMs(attempt)` (the page's backoff) and asks again (the review's F1); not hosted, or `/rooms`
 * unreadable, today's path -- unreadable with an `unlisted` answer (TRS-2), listed again after the backoff; a 404 with
 * a `noRoute` answer (LATER 263), that answer, no retry. Every request is cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION`. `cancel` (a connect superseded)
 * ends it: no answer after it, no request in flight, no retry.
 */
export function startRoomJoin(o: {
  base: string; room: string; name: () => string; bearer?: () => string | null; devDoors: boolean; fetch?: typeof globalThis.fetch;
  delayMs: (attempt: number) => number;
}, answer: RoomJoinAnswers): { cancel(): void } {
  const stop = new AbortController();
  const f = o.fetch ?? globalThis.fetch;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const provider: RoomSeatProvider = {
    room: o.room,
    pass: () => askRoomPass({ base: o.base, room: o.room, name: o.name(), bearer: o.bearer?.() ?? null, devDoors: o.devDoors, fetch: boundedFetch(f) }),
  };
  const first = (attempt: number): void => {
    void askRoomPass({ base: o.base, room: o.room, name: o.name(), bearer: o.bearer?.() ?? null, devDoors: o.devDoors, fetch: boundedFetch(f, stop.signal) }).then((r) => {
      if (!live) return;
      if (r.kind === 'seat') { live = false; answer.seat(r.seat, provider); return; }
      if (r.kind === 'refused') { live = false; answer.refused(r.why); return; }
      const ms = o.delayMs(attempt);
      answer.retrying(ms);
      timer = setTimeout(() => { if (live) first(attempt + 1); }, ms);
    });
  };
  const list = async (attempt: number): Promise<void> => {
    let listed: unknown = null, missing = false;
    try {
      const res = await boundedFetch(f, stop.signal)(`${o.base}/rooms`, { credentials: 'omit', cache: 'no-store' });
      // LATER 263: a 404, or a 2xx that is not JSON by its type (a static host's fallback page), is the route not served;
      // a JSON list that fails to parse (cut short) is unreadable, and retried.
      missing = res.status === 404 || (res.ok && !/^application\/json\b/i.test(res.headers.get('content-type') ?? ''));
      listed = res.ok && !missing ? await res.json() : null;
    } catch { listed = null; }
    if (!live) return;
    if (missing && answer.noRoute) { live = false; answer.noRoute(); return; }   // LATER 263
    if (listed === null && answer.unlisted) {   // TRS-2: not read -- listed again after the backoff
      const ms = o.delayMs(attempt);
      answer.unlisted(ms);
      timer = setTimeout(() => { if (live) void list(attempt + 1); }, ms);
      return;
    }
    if (!hostedRoom(listed, o.room)) { live = false; answer.today(); return; }
    first(0);
  };
  void list(0);
  return { cancel: () => { live = false; clearTimeout(timer); stop.abort(); } };
}

/**
 * TRS-1 (the TRS review's F2): the test room's path for a target -- `ask` central's `/rooms` (a room key, and a room base:
 * the page's own origin or the local stack); otherwise `none` for Online = Shared chosen in the panel (`shared`: the
 * standing rooms alone, no fall back to `/ws`, so a room no standing room can hold -- respawn, a stem not `MP<n>` -- says
 * `NO_SHARED_ROOM`), and `today` (the page's `/ws` path) for every other target.
 */
export function roomPathOf(o: { shared: boolean; roomBase: string | null; room: string | null }): 'ask' | 'none' | 'today' {
  if (o.roomBase !== null && o.room !== null) return 'ask';
  return o.shared ? 'none' : 'today';
}

/**
 * REPLAY_DOOR_ADAPTATION (the server split, SA.R21 (d), SA.R24; SA-9b; OT.R27; a browser adaptation of the transport,
 * no original): a **hosted** replay -- one central lists from a host (SA-9) -- is fetched at the door central's grant
 * names (`POST /replays/grant`, `packages/central/src/replays.ts` `replayUrlOf`): `https://<host>.play.socom2legacy.com
 * /replays/<16 hex>` (the host as `PRODUCTION_DOOR`'s), or in devmode only (`replayDevDoors`) the loopback
 * `http://127.0.0.1:<5343-5349>/replays/<16 hex>`, the id the Watched entry's; anything else is refused. The door is
 * held as a `PinnedReplayDoor`, made only by `pinnedReplayDoor` over the grant's answer, and fetched with the grant as
 * its bearer (`./replay/load`); the login's bearer never goes to it, and the grant lives in memory for that Watch only.
 */
export const REPLAY_DOOR_ADAPTATION = 'a hosted replay at its door (*.play.socom2legacy.com/replays/<id>, the devmode loopback) with its grant; the login bearer never at a door' as const;

/** The production replay door (`replayUrlOf`'s): the host as `PRODUCTION_DOOR`'s, then `/replays/<id>`. */
const PRODUCTION_REPLAY_DOOR = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.play\.socom2legacy\.com\/replays\/([0-9a-f]{16})$/;
/** The devmode replay door: the loopback, a host's port 5343-5349 (central's `DEV_DOOR_PORTS`). */
const DEVMODE_REPLAY_DOOR = /^http:\/\/127\.0\.0\.1:534[3-9]\/replays\/([0-9a-f]{16})$/;

/** A hosted replay's door (`REPLAY_DOOR_ADAPTATION`), made only by `pinnedReplayDoor` (the class is not exported). */
class PinnedReplayDoor {
  constructor(readonly url: string, readonly id: string) { Object.freeze(this); }
}
export type { PinnedReplayDoor };

/**
 * Whether the page follows a grant's loopback door: a development build under the developer's dev-tools switch, the account
 * requests not pinned to the origin -- `pinnedMatchSocket`'s rule; a production build (`import.meta.env.DEV` folded to
 * false) never.
 */
export function replayDevDoors(search: string, devBuild: boolean, originOnly: boolean = accountOriginOnly()): boolean {
  return devBuild && devSwitches(search, devBuild).tools && !originOnly;
}

/** The grant's `url` for replay `id` pinned, or null when it is not a door the page fetches; never throws. */
export function pinnedReplayDoor(raw: unknown, id: string, devDoors: boolean): PinnedReplayDoor | null {
  if (typeof raw !== 'string' || !/^[0-9a-f]{16}$/.test(id)) return null;
  const m = PRODUCTION_REPLAY_DOOR.exec(raw) ?? (devDoors ? DEVMODE_REPLAY_DOOR.exec(raw) : null);
  return m && m[1] === id ? new PinnedReplayDoor(raw, id) : null;
}

/** Whether `v` was made by `pinnedReplayDoor`. */
export function isPinnedReplayDoor(v: unknown): v is PinnedReplayDoor {
  return v instanceof PinnedReplayDoor;
}

/**
 * Whether `raw` is an address on a door's host, whatever the mode -- any `*.play.socom2legacy.com`, or the loopback at a
 * host's port 5343-5349 by any of its names (`127.0.0.1`, `localhost`, `[::1]`: the review's F3) -- what `./replay/load`
 * never fetches without its pinned door (no ticket, no plain fetch). The pinned dev form stays `127.0.0.1` alone,
 * as central writes it.
 */
export function replayDoorShaped(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  return url.hostname.endsWith('.play.socom2legacy.com') || (loopback && /^534[3-9]$/.test(url.port));
}

/**
 * The longest game token the page takes, in characters: the match server's `TOKEN_MAX_LENGTH`
 * (`packages/match/src/ticket.ts`), mirrored (the packages share no code). An adaptation, as the token is.
 */
export const GAME_TOKEN_CHARS_MAX = 16_384;
const GAME_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Whether `v` has a game token's form (SA-4's envelope: three base64url parts and their dots, at most `GAME_TOKEN_CHARS_MAX`). */
export function isGameToken(v: unknown): v is string {
  return typeof v === 'string' && v.length <= GAME_TOKEN_CHARS_MAX && GAME_TOKEN.test(v);
}

/**
 * How a game's socket is opened (`GAME_DOOR_ADAPTATION`): the page's pinned socket with the login's ticket (a local
 * game; the forge's hand-off, its ticket ''), or a placed game's pinned door with its game token -- never mixed.
 */
export type GameSeat =
  | { readonly pinned: PinnedSocketUrl; readonly ticket: string; readonly token?: never }
  | { readonly pinned: PinnedGameDoor; readonly token: string; readonly ticket?: never };

/**
 * Whether `v` is a `GameSeat` (`NetPage`'s guard): a pinned socket with a string ticket and no token, or a pinned door
 * with a game token and no ticket -- the door naming the seat's `id` when it has one. A mixed seat or an unpinned URL of
 * either kind is none.
 */
export function isGameSeat(v: unknown): v is GameSeat {
  if (!v || typeof v !== 'object') return false;
  const s = v as { pinned?: unknown; ticket?: unknown; token?: unknown; id?: unknown; reseat?: unknown };
  // SA-6c: a seat's provider, when it carries one, is a provider of the seat's own game.
  if (s.reseat !== undefined && !isSeatProvider(s.reseat, s.id)) return false;
  if (isPinnedSocket(s.pinned)) return typeof s.ticket === 'string' && s.token === undefined;
  if (isPinnedDoor(s.pinned)) return isGameToken(s.token) && s.ticket === undefined && (typeof s.id !== 'number' || s.id === s.pinned.game);
  return false;
}

/** The socket's URL and the hello's game for a seat: the pinned URL and the ticket, or the door and the token. */
export function gameSeatOpen(seat: GameSeat, id: number): { url: string; game: { id: number; ticket: string } | { id: number; token: string } } {
  return seat.token !== undefined ? { url: seat.pinned.url, game: { id, token: seat.token } } : { url: seat.pinned.url, game: { id, ticket: seat.ticket } };
}

/** The seat's two fields of a hand-off (`GameLobbyHandOff`), nothing else carried. */
export function gameSeatOf(h: GameSeat): GameSeat {
  return h.token !== undefined ? { pinned: h.pinned, token: h.token } : { pinned: h.pinned, ticket: h.ticket };
}

/**
 * VOICE-LATE-3's report (`./voice/voiceReport`, a devmode playtest instrument) for a seat: the pinned socket's URL for a
 * local game; SA-7d (VOICE-REPORT-DOOR): a placed game's pinned door (`PinnedGameDoor`, made only from central's answer),
 * whose game path the voice report's URL keeps (`/g/<id>/dev/voice-report`) and the door forwards to that game's process.
 */
export function voiceReportSocket(h: GameSeat): string | null {
  return h.pinned.url;                                // SA-7d: the pinned socket's server, or the placed game's pinned door
}

/**
 * GAME_RETOKEN_ADAPTATION (SA-6c; the server split, SA.R22 (5), (7) as amended 2026-10-18, SA.R18, SA.R21 (a); OT.R27; a
 * browser adaptation of the transport, no original): a **placed** lobby game's seat -- one opened on a pinned door with a
 * game token (`GAME_DOOR_ADAPTATION`) -- asks central for a fresh door and token before **every** reconnect, the lobby's
 * (`GameSocketHost.frame`) and the match's (`NetPage.retry`) alike: `POST /lobby/game-token` with the login bearer on the
 * page's own origin (the account base, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`) and the body exactly `{ game }`, never to a
 * door (`fetchGameLobbyService.gameToken`). No socket opens until it answers; one request is out at a time (the seat's one
 * provider, `gameSeatProvider`, handed on with the socket at the match's start); the backoff waits while it is out, and a
 * request that hangs is cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION`. Central's answer (`packages/central/src/bridge.ts`
 * `retoken`, `gameToken.ts` `RETOKEN_STATUS`, all over HTTP 200):
 * - `{ status: 0, door, token }`: the seat opens on that door with that token, the door pinned as the join's was
 *   (`pinnedGameDoor`; under SA.R13 it does not move, and a different door is followed only when it passes the pin);
 * - `{ status: 0 }` alone: the game is no longer placed, and the seat reconnects as a local game -- the page's pinned
 *   socket and the login ticket read at the answer -- and from then on asks no more;
 * - -977 (GameNotFound, the game gone) ends the seat as `GAME_ENDED_CLOSE` (4007, #528) does; -972 (PlayerBanned) and -966
 *   (Fail: no seat held there now, `SEAT_HELD_ELSEWHERE_STATUS_ADAPTATION`), any other refusal, and a broken status-0
 *   answer (a door without a token or a token without a door, a door that fails the pin, a token not of its form) end it
 *   as `SEAT_FREED_CLOSE` (4008, #365) does -- no retry loop against a refused door;
 * - HTTP 401: the session lost (`lobby.sessionLost`), the page's signed-out path;
 * - anything else -- a network failure, a 5xx, 400, 403, 415, 429, a body that is not the shape, and **404, a central
 *   without the split**, where the route is not mounted (`packages/central/src/lobbyHttp.ts` `LOBBY_GAME_TOKEN_PATHS`;
 *   the default today) -- goes back into the backoff, and the next attempt asks again.
 * A **local** seat (no door) never asks: it reconnects as today. No token is kept between reconnects: each asks afresh, so
 * a token's expiry (central's `GAME_TOKEN_LIFETIME_PLACEHOLDER`, 60 s, `packages/central/src/tickets.ts`, cited here, not
 * re-valued) is never the seat's end. Nothing the game does changes.
 */
export const GAME_RETOKEN_ADAPTATION = "a placed seat's every reconnect awaits POST /lobby/game-token on the page's origin; -977 ends it as 4007, -972/-966 as 4008; a local seat as today" as const;

/**
 * GAME_RETOKEN_WAIT_MS_ADAPTATION (SA-6c, the controllers' condition 2026-10-18): the longest a re-token is waited for --
 * the provider's request aborted, and each reconnect path's wait answered as the backoff -- so a request that hangs never
 * freezes the retries. The page's own bound (the original has no such request); 10 s, a third of the 30 s a door's connect
 * is given (`DOOR_CONNECT_WAIT_MS_READING`, central `tickets.ts`). An adaptation.
 */
export const GAME_RETOKEN_WAIT_MS_ADAPTATION = 10_000;

/**
 * GAME_HELLO_WAIT_MS_ADAPTATION (SA-55; product track, a browser adaptation): the longest a game socket is given from its
 * connect to its welcome before the page takes it as a drop -- the original's own connect wait, 30 s (research 343
 * R343.7, `DOOR_CONNECT_WAIT_MS_READING`); its whole account is at its re-export in `./gameLobbyHost`. Defined here so
 * the lobby's socket (`GameSocketHost.frame`, SA-55) and the match's (`NetPage.helloWait`, SA-57) read the one value
 * (`./netPage` cannot import `./gameLobbyHost`, which imports it).
 */
export const GAME_HELLO_WAIT_MS_ADAPTATION = 30_000;

/** SA-55, SA-57: the host of a socket's URL for its console line (no path or query; nothing secret travels in the URL). */
export function socketHost(url: string): string {
  try { return new URL(url).host; } catch { return '?'; }
}

/** Central's re-token answer as the transport reads it: the body's status and its door and token as sent, or the session lost. */
export type GameTokenReply = { status: number; door?: unknown; token?: unknown } | 'session-lost';

/** What a reconnect does next (`GameSeatProvider.reseat`, `GAME_RETOKEN_ADAPTATION`). */
export type Reseat =
  | { readonly kind: 'open'; readonly seat: GameSeat }
  | { readonly kind: 'ended'; readonly close: 4007 | 4008 }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'backoff' };

/** A placed seat's one provider (`GAME_RETOKEN_ADAPTATION`): made at the open, handed on at the match's start. */
export interface GameSeatProvider {
  readonly game: number;
  /** The reconnect's next step; a call while a request is out answers that request's. Never rejects. */
  reseat(): Promise<Reseat>;
}

export interface GameSeatProviderOptions {
  game: number;
  /** The page's pinned socket: a local answer's URL, and the devmode rule a door is pinned by. */
  pinned: PinnedSocketUrl;
  /** Whether the seat is placed (opened on a door) now; a local seat never asks. */
  placed: boolean;
  /** The login ticket (`LobbyClient.ticket()`), read at each ask and at a local answer. */
  ticket(): string | null;
  /** `fetchGameLobbyService.gameToken`; rejects for the backoff's cases. */
  ask(game: number, ticket: string, signal: AbortSignal): Promise<GameTokenReply>;
  /** `LobbyClient.sessionLost`: a 401's session gone. */
  sessionLost(ticket: string): void;
}

const BACKOFF: Reseat = { kind: 'backoff' };
const SIGNED_OUT: Reseat = { kind: 'signed-out' };
const FREED: Reseat = { kind: 'ended', close: 4008 };
/** Central's GameNotFound (`packages/central/src/lobby.ts` `LOBBY_STATUS`, `RETOKEN_STATUS.gameGone`): the game gone. */
const GAME_GONE_STATUS = -977;

/**
 * SA-6c (`GAME_RETOKEN_ADAPTATION`, the merge controller's condition): whether a re-tokened seat `v` is a `GameSeat` of
 * game `game` by its own identity, never one lent it -- `isGameSeat` on its own, a pinned door's game (its `/g/<id>`) the
 * game, and any id it carries the game. Both reconnect paths take a re-token's seat only through it.
 */
export function isSeatOf(v: unknown, game: number): v is GameSeat {
  if (!isGameSeat(v)) return false;
  const id = (v as { id?: unknown }).id;
  return (!isPinnedDoor(v.pinned) || v.pinned.game === game) && (id === undefined || id === game);
}

/** Whether `v` is a seat provider (of game `id` when one is named). */
function isSeatProvider(v: unknown, id: unknown): v is GameSeatProvider {
  if (!v || typeof v !== 'object') return false;
  const p = v as { game?: unknown; reseat?: unknown };
  return typeof p.reseat === 'function' && typeof p.game === 'number' && (typeof id !== 'number' || p.game === id);
}

/** The seat's one provider (`GAME_RETOKEN_ADAPTATION`): central's answer read into the reconnect's next step. */
export function gameSeatProvider(o: GameSeatProviderOptions): GameSeatProvider {
  let placed = o.placed;
  let out: Promise<Reseat> | null = null;
  const local = (): Reseat => { const ticket = o.ticket(); return ticket === null ? SIGNED_OUT : { kind: 'open', seat: { pinned: o.pinned, ticket } }; };
  const read = (reply: GameTokenReply, ticket: string): Reseat => {
    if (reply === 'session-lost') { o.sessionLost(ticket); return SIGNED_OUT; }
    if (reply.status !== 0) return reply.status === GAME_GONE_STATUS ? { kind: 'ended', close: 4007 } : FREED;
    if (reply.door === undefined && reply.token === undefined) { placed = false; return local(); }
    const door = pinnedGameDoor(reply.door, o.game, o.pinned.devDoors);
    return door && isGameToken(reply.token) ? { kind: 'open', seat: { pinned: door, token: reply.token } } : FREED;
  };
  const ask = (): Promise<Reseat> => {
    if (!placed) return Promise.resolve(local());
    const ticket = o.ticket();
    if (ticket === null) return Promise.resolve(SIGNED_OUT);
    const ctl = new AbortController();
    return new Promise<Reseat>((resolve) => {
      const timer = setTimeout(() => { ctl.abort(); resolve(BACKOFF); }, GAME_RETOKEN_WAIT_MS_ADAPTATION);
      let asked: Promise<GameTokenReply>;
      try { asked = o.ask(o.game, ticket, ctl.signal); } catch (e: unknown) { asked = Promise.reject(e); }
      asked.then((r) => read(r, ticket), () => BACKOFF).then((r) => { clearTimeout(timer); resolve(r); });
    });
  };
  return {
    game: o.game,
    reseat: () => out ??= ask().finally(() => { out = null; }),
  };
}

/**
 * The review's F1: each account service's line (`fetchAccountService`'s `absent`), and whether it may show -- by
 * default always; once `connectLobby` takes the service, only while its lobby's connection stands (`LobbyClient.up`).
 * The lobby's `disconnect` -- `LobbyDisconnect` (the player backing out of the online screens) and the lobby's `close`
 * (`FrontEndSession.close`, which the front end's `stop` calls) -- takes the line down, so it never outlives the
 * connection whose login met the 404, and a 404 that lands after it shows nothing.
 */
const ABSENT_LINES = new WeakMap<LobbyService, { line: AccountServiceAbsentLine; live: () => boolean }>();

/** Each account service's `SIGNED_IN_ELSEWHERE_ADAPTATION` line (`fetchAccountService`'s `elsewhere`), shown by `connectLobby`'s client. */
const ELSEWHERE_LINES = new WeakMap<LobbyService, SignedInElsewhereLine>();

/**
 * The page's account service: `fetchAccountService` at `accountServiceBase`, its absent-service line
 * (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`) and its signed-in-elsewhere line (`SIGNED_IN_ELSEWHERE_ADAPTATION`) on the page's
 * document unless one is handed in (null: none). `opts`: `fetchAccountService`'s (OT.R61: the console's sign-in, and the
 * 'include' half of the game's LOGIN, `pageLoginService`).
 */
export function pageAccountService(
  search: string, location: { protocol: string; host: string; origin?: string }, devBuild: boolean, fetchFn?: typeof fetch,
  absent: AccountServiceAbsentLine | null = typeof document === 'undefined' ? null : accountServiceAbsentLine(document),
  elsewhere: SignedInElsewhereLine | null = typeof document === 'undefined' ? null : signedInElsewhereLine(document),
  opts: AccountRequestOptions = {},
): LobbyService {
  return fetchAccountService(accountServiceBase(search, location, devBuild), fetchFn, absent ?? undefined, elsewhere ?? undefined, opts);
}

/**
 * OT.R61's console half (MISSION OT.R61, the owner, 2026-10-17; the console launcher plan's PERSONA-PERSIST (a)): the
 * remember cookie's requests (SVC-03a, `packages/central/src/accountHttp.ts`'s contract for a client, steps 1 to 7). A
 * browser adaptation of the console's sign-in, and the transport of the game's LOGIN's SAVE PASSWORD (OT.R61's game
 * half, SAVE-PASSWORD): the original's LOGIN (`./frontEnd`) uses `pageLoginService`, which picks per login between a
 * service with no option and one with `credentials` `'include'` (`SAVED_PASSWORD_BY_COOKIE_ADAPTATION`).
 */
export interface AccountRequestOptions {
  /**
   * fetch's credentials mode for `/account/login` alone; default `'omit'` -- the original's (the login
   * `savePassword: false`): the cookie is neither shown nor set. `'include'` is the console's remembered sign-in's and
   * the game's LOGIN's for a saved password or one typed under YES (`pageLoginService`), and it brings the contract's
   * body with it, so the mode and the body cannot disagree: `{ name, password, savePassword: true }`
   * (step 1), or with no password the quick sign-in `{ name, savePassword: true }` (step 2). A login under NO that showed
   * the cookie would drop that account's remember chain, which only Forget this device may do: an unticked sign-in goes
   * through a service without the option.
   */
  credentials?: 'omit' | 'include';
  /**
   * The logout is Forget this device -- `{ ticket, forget: true }`, credentials included (step 6) -- only with this set;
   * else it is the plain logout `{ ticket }`, omitted, the token kept (step 5), whatever `credentials` says: a remember
   * service's logout, and every pagehide's, is plain by construction. Default off.
   */
  forget?: boolean;
}

/**
 * The body's `status` when it is an integer, else MediusFail (`ACCOUNT_HTTP_REFUSAL_ADAPTATION`); the body; and
 * whether the answer is an absent service's (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`: 404 with no integer status) or
 * carried a status (a service answered).
 */
async function statusOf(res: Response): Promise<{ status: number; body: Record<string, unknown> | null; absent: boolean; carried: boolean }> {
  let body: Record<string, unknown> | null = null;
  try {
    const v: unknown = await res.json();
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) body = v as Record<string, unknown>;
  } catch { /* no body, or not JSON */ }
  const s = body?.['status'];
  const carried = Number.isSafeInteger(s);
  return { status: carried ? s as number : MEDIUS_STATUS.Fail, body, absent: res.status === 404 && !carried, carried };
}

/**
 * The account service over the match server's `POST <base>/account/*` (SVC-03). By default `savePassword` is false
 * and no credentials are sent, so the endpoint's cookie is neither shown nor set (the game's LOGIN picks this service or
 * an 'include' one per login: `pageLoginService`, SAVE-PASSWORD). `absent`, when given, is told of the login screen's
 * answers (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`): shown at an absent service's 404, cleared at an answer with a status.
 * `elsewhere`, when given, is `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line: `connectLobby`'s client shows it, and a login's
 * or a registration's answer with a status clears it. `opts` (`AccountRequestOptions`) is OT.R61's console half:
 * `credentials` `'include'` the remembered login and the quick sign-in, `forget` the logout that is Forget this device.
 * The registration and the keep-alive stay `'omit'` under either.
 */
export function fetchAccountService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a), absent?: AccountServiceAbsentLine,
  elsewhere?: SignedInElsewhereLine, opts: AccountRequestOptions = {}): LobbyService {
  const remember = opts.credentials === 'include';
  const forget = opts.forget === true;
  const post = (path: string, body: Record<string, unknown>, keepalive = false, credentials: RequestCredentials = 'omit'): Promise<Response> => fetchFn(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials, cache: 'no-store',
    ...(keepalive ? { keepalive: true } : {}),
  });
  const held = absent ? { line: absent, live: () => true } : null;
  /** `/lobby/update-user-state` `{ userAction: 1 }` with the ticket as its bearer (N3, the session's renewal). */
  const renew = (ticket: string): Promise<Response> => fetchFn(`${base}/lobby/update-user-state`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify({ userAction: 1 }),
    credentials: 'omit', cache: 'no-store',
  });
  /** The login screen's routes: the answer read, and the absent-service line told (ACCOUNT_SERVICE_ABSENT_ADAPTATION). */
  const asked = async (path: string, body: Record<string, unknown>, credentials: RequestCredentials = 'omit'): Promise<{ status: number; body: Record<string, unknown> | null }> => {
    const r = await statusOf(await post(path, body, false, credentials));
    if (r.absent) { if (held?.live()) held.line.show(base); } else if (r.carried) { held?.line.clear(); elsewhere?.clear(); }
    return r;
  };
  const service: LobbyService = {
    login: async ({ name, password }): Promise<LobbyLoginReply> => {
      // OT.R61 (`AccountRequestOptions`): under 'include' the contract's step 1, or with no password its step 2.
      const { status, body } = remember
        ? await asked('/account/login', password ? { name, password, savePassword: true } : { name, savePassword: true }, 'include')
        : await asked('/account/login', { name, password, savePassword: false });
      const ticket = body?.['ticket'];
      return status === MEDIUS_STATUS.Success && typeof ticket === 'string' && ticket !== '' ? { status, ticket } : { status };
    },
    register: async ({ name, password }) => ({ status: (await asked('/account/create', { name, password })).status }),
    // NU-16b (PAGEHIDE_LOGOUT_ADAPTATION): keepalive, so the pagehide's logout outlives the page's unload.
    // OT.R61: with `forget` Forget this device (the contract's step 6); else the plain logout, the token kept (step 5).
    logout: async (ticket) => ({ status: (await statusOf(await post('/account/logout', forget ? { ticket, forget: true } : { ticket }, true, forget ? 'include' : 'omit'))).status }),
    // N3 (LOBBY_KEEPALIVE_MS): the bridge's session renewed -- KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION reads the answer.
    keepAlive: async (ticket) => keepAliveAnswer((await renew(ticket)).status),
    // SIGNED_IN_ELSEWHERE_ADAPTATION: the dead ticket's renewal once more -- its 401's `reason`, the server's takeover or nothing.
    sessionEndedWhy: async (ticket) => {
      try {
        const res = await renew(ticket);
        if (res.status !== 401) return null;
        const body: unknown = await res.json();
        return typeof body === 'object' && body !== null && (body as Record<string, unknown>)['reason'] === 'taken-over' ? 'taken-over' : null;
      } catch { return null; }
    },
  };
  if (held) ABSENT_LINES.set(service, held);
  if (elsewhere) ELSEWHERE_LINES.set(service, elsewhere);
  return service;
}

/**
 * SAVED_PASSWORD_BY_COOKIE_ADAPTATION (SAVE-PASSWORD, MISSION OT.R61's game half; web research 153 §8): which of the
 * server's two logins the original's LOGIN sends. The original's AccountLogin carries the name and the password alone
 * (`FUN_002eede0` D:L191138-191139): SAVE PASSWORD never goes over the wire, it decides only what the card keeps
 * (`FUN_002fc440` D:L199263-199266). The page's card keeps a saved password's length, held as its stand-in
 * (`./personaHost` `SAVED_PASSWORD_STAND_IN_ADAPTATION`), and the secret it stands for is the server's remember cookie
 * (SVC-03a, `packages/central/src/accountHttp.ts`'s contract). So, per login (`pageLoginService`):
 * - a saved password (the stand-in, not retyped) is the quick sign-in, the 'include' service with no password
 *   (`{ name, savePassword: true }`, step 2) -- whatever the strip says now: NO after YES logs in with the saved
 *   password, as the original's PLAYERPASSWORD still holds it, and the card's next write forgets it (the seat's word);
 * - a typed password under YES is the remembered login, 'include' (`{ name, password, savePassword: true }`, step 1);
 * - a typed password under NO goes 'omit' (`{ name, password, savePassword: false }`): the cookie is never shown, so a
 *   remembered console sign-in on the same account stays (the merge controller's ruling (a), product track).
 * The strip is the `SecurePassword` valve at the press (`connectLobby` reads it). A transport adaptation (OT.R27): what
 * the game shows and does is the original's.
 */
export const SAVED_PASSWORD_BY_COOKIE_ADAPTATION = "a saved password logs in by the remember cookie ('include', no password); a typed one 'include' under YES, 'omit' under NO" as const;

/**
 * SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION: a saved password's stand-in handed to the registration (state 10's
 * "register?" YES after a -998, `LobbyRegister` `FUN_0027dde0` reading PLAYERPASSWORD). The original registers with the
 * saved password itself; the page holds none to register with, so the registration is answered RegistrationFailed (-994)
 * without a request -- the client's state 6, REGISTRATION FAILURE (`FUN_002eeb50` D:L190996-190999), and the player
 * retypes. A browser adaptation.
 */
export const SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION = 'a saved password never registers: the registration answers -994 with no request' as const;

/** fetch's credentials mode of the game's remember service (`AccountRequestOptions`). */
const REMEMBERED = 'include' as const;

/** The SAVE PASSWORD strip each game login service reads (`connectLobby` sets it to the `SecurePassword` valve). */
const SAVE_STRIPS = new WeakMap<LobbyService, { read: () => boolean }>();

/**
 * The game's LOGIN over two account services (`SAVED_PASSWORD_BY_COOKIE_ADAPTATION`): `plain` (the default's, 'omit')
 * and `remember` (its credentials mode included), picked per login; the registration refuses a stand-in
 * (`SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION`); the logout, the keep-alive and the rest are `plain`'s (the plain logout,
 * step 5: the token kept). The two share their absent-service and signed-in-elsewhere lines (`pageLoginService`), which
 * this service carries for `connectLobby`.
 */
export function savedPasswordLogin(plain: LobbyService, remember: LobbyService): LobbyService {
  const strip = { read: (): boolean => false };
  const service: LobbyService = {
    ...plain,
    login: (q) => {
      if (isSavedPasswordStandIn(q.password)) return remember.login({ name: q.name, password: '' });
      return strip.read() ? remember.login(q) : plain.login(q);
    },
    register: (q) => (isSavedPasswordStandIn(q.password) ? Promise.resolve({ status: MEDIUS_STATUS.RegistrationFailed }) : plain.register(q)),
  };
  SAVE_STRIPS.set(service, strip);
  // The review's F1 for both halves: `connectLobby` gates the absent-service line by setting `live` on this service's.
  const p = ABSENT_LINES.get(plain), r = ABSENT_LINES.get(remember);
  if (p) {
    ABSENT_LINES.set(service, {
      line: p.line,
      get live() { return p.live; },
      set live(f: () => boolean) { p.live = f; if (r) r.live = f; },
    });
  }
  const elsewhere = ELSEWHERE_LINES.get(plain);
  if (elsewhere) ELSEWHERE_LINES.set(service, elsewhere);
  return service;
}

/**
 * The original LOGIN's account service on the page (`./frontEnd`): `savedPasswordLogin` over two `pageAccountService`s
 * -- the default's and the credentials mode included -- on one absent-service line and one signed-in-elsewhere line.
 */
export function pageLoginService(
  search: string, location: { protocol: string; host: string; origin?: string }, devBuild: boolean, fetchFn?: typeof fetch,
  absent: AccountServiceAbsentLine | null = typeof document === 'undefined' ? null : accountServiceAbsentLine(document),
  elsewhere: SignedInElsewhereLine | null = typeof document === 'undefined' ? null : signedInElsewhereLine(document),
): LobbyService {
  return savedPasswordLogin(
    pageAccountService(search, location, devBuild, fetchFn, absent, elsewhere),
    pageAccountService(search, location, devBuild, fetchFn, absent, elsewhere, { credentials: REMEMBERED }),
  );
}

export interface ConnectHostOptions {
  /** The valve registry (the machine's). */
  valves: () => ValveStore;
  uiVars: UiVarManager;
  /** The account service (`fetchAccountService`; a test's fake). */
  service: LobbyService;
  /** The lobby's event callback into the dialog host (`@s2u/ui`'s `lobbyEventInto` over the session's machine and parts). */
  event: (kind: number, text: string | null) => void;
  /** `FUN_00361b40`: a UIMnLOC string by id (`locTextOf` over the caption tables). */
  locText?: (id: number) => string | null;
  /** The built dialog's name, for the password's end when the connecting screen is left. */
  dialog: () => string | null;
  /** The client's account list (the persona connection's), asked when the password is dropped. */
  db?: () => AcctDb | null | undefined;
  /** The page's other holder of the typed text (the soft keyboard), told to let it go. */
  forget?: () => void;
  /** LATER 332: `SAVED_PASSWORD_REGISTER_LINE_ADAPTATION`'s line; absent, the page's document's; null, none. */
  registerLine?: SavedPasswordRegisterLine | null;
  /** k3r8P8nY: `SAVED_PASSWORD_LOGIN_LINE_ADAPTATION`'s line; absent, the page's document's; null, none. */
  loginLine?: SavedPasswordRegisterLine | null;
}

/** What `connectLobby` answers: the lobby (the session's ticket: `lobby.ticket()`), the rows, and the frame's call. */
export interface LobbyConnection {
  lobby: LobbyClient;
  commands: ConnectCommands;
  /** Once a frame, before the front end's: the lobby's step and the password's end (`ConnectCommands.frame`). */
  frame(): void;
}

/**
 * The page's lobby client: `@s2u/ui`'s, whose `disconnect` (and so `close`) also takes down the service's
 * absent-service line (`ABSENT_LINES`, the review's F1) and its signed-in-elsewhere line, and whose session lost -- when it took the ticket held -- is
 * told to the page (`lost`: `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line). Nothing else differs: state 2 is the original's.
 */
class PageLobbyClient extends LobbyClient {
  /** SAVE-PASSWORD: the saved password's stand-in the last login or registration was handed, else null. */
  private standIn: string | null = null;
  /** SAVE-PASSWORD: the name the last login or registration was handed (the review's F1: whose typed password a success saves). */
  private handedName: string | null = null;
  /** LATER 332: the last attempt was a registration handed a stand-in (`SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION`). */
  private standInRegistration = false;
  /** k3r8P8nY: the status the last login was answered, else null (`answered`, through `connectLobby`'s service). */
  private loginStatus: number | null = null;
  constructor(o: ConstructorParameters<typeof LobbyClient>[0], private readonly gone: () => void, private readonly lost: (ticket: string) => void,
    private readonly asked: () => void = () => {}) { super(o); }
  override login(name: string, password: string): boolean { this.note(name, password, false); return super.login(name, password); }
  override register(name: string, password: string): boolean { this.note(name, password, true); return super.register(name, password); }
  private note(name: string, password: string, registering: boolean): void {
    this.handedName = name; this.standIn = isSavedPasswordStandIn(password) ? password : null;
    this.standInRegistration = registering && this.standIn !== null;
    this.loginStatus = null;
    this.asked();
  }
  /** LATER 332: the registration just answered was handed a stand-in, which cannot register. */
  registeredStandIn(): boolean { return this.standInRegistration; }
  /** k3r8P8nY: a login's answer, told by the service `connectLobby` hands this client. */
  answered(status: number): void { this.loginStatus = status; }
  /** k3r8P8nY (`SAVED_PASSWORD_LOGIN_LINE_ADAPTATION`): the login just answered was a stand-in's, refused -978. */
  refusedStandIn(): boolean {
    return this.standIn !== null && !this.standInRegistration && this.loginStatus === MEDIUS_STATUS.InvalidPassword && !this.loggedIn();
  }
  /** The stand-in the form's PLAYERPASSWORD held when the login was asked, else null. */
  handedStandIn(): string | null { return this.standIn; }
  /** The name the login was asked with, else null. */
  loginName(): string | null { return this.handedName; }
  override disconnect(): void { super.disconnect(); this.gone(); }
  override sessionLost(ticket: string): void {
    const held = this.ticket();
    super.sessionLost(ticket);
    if (held === ticket && this.ticket() === null) this.lost(ticket);
  }
}

/** The lobby client made over the service and `LobbyLogin` / `LobbyRegister` registered in `host`. */
export function connectLobby(host: UiCommandHost, o: ConnectHostOptions): LobbyConnection {
  let commands: ConnectCommands | null = null;
  const held = ABSENT_LINES.get(o.service);
  const elsewhere = ELSEWHERE_LINES.get(o.service);
  // SIGNED_IN_ELSEWHERE_ADAPTATION: the session lost, the service asked why once; a takeover shows the page's line -- only
  // while the lobby connection that lost it still stands (the re-review's F1: an answer after its disconnect, or after a
  // new connect, is dropped), and the disconnect takes the line down with the absent-service line.
  let connection = 0;
  const lost = (ticket: string): void => {
    if (!elsewhere || !o.service.sessionEndedWhy) return;
    const asked = connection;
    o.service.sessionEndedWhy(ticket).then((why) => {
      if (why === 'taken-over' && asked === connection && lobby.up) elsewhere.show();
    }, () => { /* no answer: no line */ });
  };
  const gone = (): void => { connection++; held?.line.clear(); elsewhere?.clear(); };
  // SAVE-PASSWORD (the review's F1): at the answer, a success first keeps the typed YES password as its stand-in
  // (`savedAtSuccess`) -- only the record of the HOST and PORT logged into (`connectedTo()`, SAVED-AT-SUCCESS-HOST,
  // LATER 101); then the answer lets every typed password go (PASSWORD_DROPPED_AT_ANSWER_ADAPTATION).
  // SAVED_PASSWORD_REGISTER_LINE_ADAPTATION (LATER 332): the page's line, unless one is handed in (null: none).
  const registerLine = o.registerLine === undefined ? (typeof document === 'undefined' ? null : savedPasswordRegisterLine(document)) : o.registerLine;
  // SAVED_PASSWORD_LOGIN_LINE_ADAPTATION (k3r8P8nY): the page's line for a stand-in refused -978, unless one is handed in.
  const loginLine = o.loginLine === undefined ? (typeof document === 'undefined' ? null : savedPasswordLoginLine(document)) : o.loginLine;
  const settled = (): void => {
    const db = o.db?.(), name = lobby.loginName();
    if (db && name !== null && lobby.loggedIn()) savedAtSuccess(db, lobby.connectedTo(), name);
    // LATER 332: a stand-in's registration refused -- the record lets it go and the page says why (the form's below).
    if (lobby.registeredStandIn()) { if (db && name !== null) standInRefused(db, lobby.connectedTo(), name); registerLine?.show(); }
    // k3r8P8nY: a stand-in's login refused -978 (no remember cookie here that signs in) -- let go as LATER 332's.
    if (lobby.refusedStandIn()) { if (db && name !== null) standInRefused(db, lobby.connectedTo(), name); loginLine?.show(); }
    commands?.forgetPassword();
  };
  // k3r8P8nY: the game's service, each login's answer told to the client before its reply is read (`refusedStandIn`).
  const service: LobbyService = { ...o.service, login: async (q) => { const r = await o.service.login(q); lobby.answered(r.status); return r; } };
  const clearLines = (): void => { registerLine?.clear(); loginLine?.clear(); };
  const lobby = new PageLobbyClient({ valves: o.valves, service, event: o.event, locText: o.locText, settled },
    () => { gone(); clearLines(); }, lost, clearLines);
  if (held) held.live = () => lobby.up;
  // SAVE-PASSWORD (SAVED_PASSWORD_BY_COOKIE_ADAPTATION): the game's service reads the strip at the login.
  const strip = SAVE_STRIPS.get(o.service);
  if (strip) strip.read = () => (o.valves().find(SECURE_PASSWORD_VALVE)?.value ?? 0) !== 0;
  /**
   * PASSWORD_DROPPED_AT_ANSWER_ADAPTATION narrowed to typed passwords (SAVE-PASSWORD; OT.R61): when the answer drops the
   * form's password, a saved one's stand-in is put back -- the original's PLAYERPASSWORD keeps the saved password, so
   * after #545 the form shows it again with CONNECT lit (`dlgNetConnect.rdr`'s `OnInvalidPassword`, `exit_connect_screen`).
   */
  const keepSaved = (): void => {
    const s = lobby.handedStandIn();
    // LATER 332: not after a stand-in's refused registration -- the original's form then asks for a password; k3r8P8nY:
    // nor after a stand-in's login refused -978 (SAVED_PASSWORD_LOGIN_LINE_ADAPTATION).
    if (s === null || lobby.registeredStandIn() || lobby.refusedStandIn()) return;
    o.uiVars.set(o.uiVars.find(PLAYER_PASSWORD_VAR) ?? o.uiVars.add(PLAYER_PASSWORD_VAR, null, 1), { type: 'string', value: s });
  };
  commands = new ConnectCommands({ uiVars: o.uiVars, lobby, db: o.db, forget: () => { o.forget?.(); keepSaved(); } });
  commands.register(host);
  const rows = commands;
  return { lobby, commands: rows, frame: () => rows.frame(o.dialog()) };
}

/** The parts of a `FrontEndSession` the lobby is wired over. */
export interface SessionLobbyParts {
  machine: () => FrontEndMachine;
  uiVars: UiVarManager;
  parts: DialogPartsHost;
  /** The caption tables (state 2's UIMnLOC 450). */
  captions: CaptionSource | null;
  /** PLAT-17's keyboard: its last typed text is let go with the password. */
  keyboard: SoftKeyboardFrontEnd;
  /** The persona connection's account list, once it is made. */
  db: () => AcctDb | null | undefined;
}

/**
 * `./frontEnd`'s one line: `connectLobby` over the session's parts -- the events into the dialog built now
 * (`lobbyEventInto`), the built dialog's name, the caption tables -- or null with no account service (a session with
 * no server: the tests', ONL-06's placeholders).
 */
export function sessionLobby(host: UiCommandHost, s: SessionLobbyParts, service: LobbyService | undefined): LobbyConnection | null {
  if (!service) return null;
  return connectLobby(host, {
    valves: () => s.machine().valves, uiVars: s.uiVars, service, event: lobbyEventInto(s.machine, s.parts), locText: locTextOf(s.captions),
    dialog: () => s.machine().shell()?.currentName ?? null, db: s.db, forget: () => s.keyboard.keyboard.forgetText(),
  });
}
