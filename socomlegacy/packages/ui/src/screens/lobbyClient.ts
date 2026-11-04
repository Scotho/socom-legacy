import { DIALOG_EVENTS } from '../dialog';
import { locTextBytes } from '../text/codes';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { PersonaLobby } from './personaCommands';

/**
 * The client's Medius lobby object (0x44f370) as the connect and the login use it (ONL-07; web research 157 §2): the
 * session flag, the state byte with its queue and the valve the scripts read it through, and the handlers of the
 * states `LobbyConnect`, `LobbyLogin`, `LobbyRegister` and `LobbyLogout` pass through. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; an address is the retail ELF's. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The object.** +0x7d the session flag (a connection was started and not torn down); +0x60 the state byte
 * (`DAT_0044f3d0`); +0x64 a queue of state bytes (its count +0x78); +0x80 the valve `socom_online_state` (0x3f3a40),
 * acquired PERM by the lobby's init (`FUN_002e0450` D:L182796); slots +4n the handler of state n, called with 1 at
 * the state's entry, 2 each step it stands, 3 at its exit (`FUN_002ed460` D:L190161-190218 fills them;
 * `FUN_002dfe10` D:L182502-182514 calls one). The lobby's event callback `DAT_0044f3c8(name, argument)` posts a
 * named event into the dialog host.
 *
 * **The step** (`FUN_002dfe50` D:L182517-182587, called once a frame by the network update `FUN_0030da00`
 * D:L210249 / D:L210256, and once by a connect that could not start): nothing while the flag is clear; with the queue
 * empty, the standing state's handler with 2; else the standing handler with 3, the state byte takes the queue's
 * front, that handler with 1, and the valve takes the byte -- through its watchers only when it differs
 * (D:L182546-182556). One queued state a call. (The step's tail, a UI variable counted down at +0xec, is another
 * screen's and is not here.)
 *
 * **The states this module holds** (the others' handlers are their tasks': `setHandler`):
 *
 * | state | the set's caption | entry | reply |
 * |---|---|---|---|
 * | 12 | STATE: SESSION BEGIN | `FUN_002ee830` D:L190874-190897: with no session key, SessionBegin | `FUN_002ee910` D:L190900-190924: success -- the key kept, **MP_SUCCESS posted** (the string at 0x3f4a10, D:L190919); failure -- state 10 |
 * | 7 | STATE: ACCOUNT LOGIN | `FUN_002eede0` D:L191093-191144: AccountLogin, the name and the password 32 bytes each | `FUN_002eefa0` D:L191147-191283: -998 state 10; -997 MP_PLAYER_LOGGED_IN; -978 MP_INVALID_PASSWORD; any other failure MP_MEDIUS_ERROR "Login Failure"; success state 16 |
 * | 10 | STATE: LOGIN FAILURE (and the set's register question) | nothing (0x2ee6c0 is `jr ra`) | -- |
 * | 3 | STATE: ACCOUNT REGISTRATION | `FUN_002ee9b0` D:L190926-190947: the text filter on the name | `FUN_002eea70` D:L190950-190982: result < 0 MP_FILTER_FAILURE and state 6, else AccountRegistration; `FUN_002eeb50` D:L190984-191012: failure state 6, success AccountLogin again; `FUN_002eec10` D:L191015-191090: failure state 6, success state 16 |
 * | 6 | STATE: REGISTRATION FAILURE | nothing (0x2ee6d0 is `jr ra`) | -- |
 * | 16 | (none) | `FUN_002efa90` D:L191516-191616: the transport closed, the lobby server of the login's reply connected | `FUN_002efc80` D:L191621-191667: -1 state 2; else state 11 and MP_JOIN_ROOM (0x3f4b68) -- or state 15 when a game join is pending, another task's |
 * | 11 | STATE: LOGGED IN | `FUN_002ee540` D:L190777-190801: the lobby world's housekeeping (ONL-09's; not here) | -- |
 * | 2 | (none) | `FUN_002ee610` D:L190804-190820: the transport closed, MP_MEDIUS_ERROR with UIMnLOC 450's text | -- |
 * | 0x12 | (none) | `FUN_002ee6e0` D:L190823-190847: no session key -- state 0; else SessionEnd | `FUN_002ee7b0` D:L190850-190871: the key cleared, state 0 on either status |
 *
 * Every status is read as `FUN_002f42d0` reads it: success is 0 (research 97 §1.3).
 *
 * **The transport is ours** (a browser adaptation: the console spoke Medius over its own connections): the requests go
 * through `LobbyService`, the page's being SVC-03's account endpoint (`packages/viewer/src/connectHost.ts`). A request
 * whose promise rejects is a request never answered: nothing is queued and nothing posted, and the screen's own
 * watchdog decides, as it does on the console with a silent server. A reply that arrives after `disconnect` or a new
 * `connect` is dropped (the console's closed connection delivers none).
 *
 * **The password (OT.R17).** The original copies the name and the password into the lobby's own buffers (0x66a4f4,
 * 0x66a514) and leaves them there. Here the copy is kept only until the request that needs it is answered
 * (`PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION`), and `settled` tells the page the login is over so that it drops its own.
 *
 * **The session ticket.** A login's success carries the service's `ticket` (SVC-03's; SVC-07a's session): kept here in
 * memory, never in storage or the address, and read by the later screens through `ticket()` -- the seam (research 157 §6).
 * While it is held the service's `keepAlive` renews it every `LOBBY_KEEPALIVE_MS`, a game socket holding it or not
 * (`KEEPALIVE_THROUGH_MATCH_ADAPTATION`, NU-16); a 401 is the session lost (`SESSION_LOST_READING`).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The valve the scripts read the state through (the string at 0x3f3a40; `FUN_002e0450` D:L182796 acquires it PERM). */
export const SOCOM_ONLINE_STATE_VALVE = 'socom_online_state';

/** The states this module's handlers stand for, named as `dlgNetConnect.rdr`'s set captions them where it does. */
export const LOBBY_STATE = {
  NONE: 0,
  /** `FUN_002ee610`: a connection that failed. */
  CONNECT_FAILURE: 2,
  /** "STATE: ACCOUNT REGISTRATION". */
  ACCOUNT_REGISTRATION: 3,
  /** "STATE: REGISTRATION FAILURE". */
  REGISTRATION_FAILURE: 6,
  /** "STATE: ACCOUNT LOGIN". */
  ACCOUNT_LOGIN: 7,
  /** The login's -998, and a refused SessionBegin: the set captions it "STATE: LOGIN FAILURE" and asks whether to register. */
  ACCOUNT_NOT_FOUND: 10,
  /** "STATE: LOGGED IN". */
  LOGGED_IN: 11,
  /** "STATE: SESSION BEGIN". */
  SESSION_BEGIN: 12,
  /** `FUN_002efa90`: the lobby server of the login's reply being connected. */
  LOBBY_SERVER: 16,
  /** `FUN_002ee6e0`: the logout. */
  LOGGING_OUT: 0x12,
} as const;

/** The `MediusCallbackStatus` values the callbacks tell apart or the service answers (our Horizon's `RT.Common/Types.cs:68-136`). */
export const MEDIUS_STATUS = {
  Success: 0, BeginSessionFailed: -1000, AccountAlreadyExists: -999, AccountNotFound: -998, AccountLoggedIn: -997, LoginFailed: -995,
  RegistrationFailed: -994, InvalidPassword: -978, Fail: -966,
} as const;

/** MP_MEDIUS_ERROR's argument for a login refused with any other status (the string at 0x3f4aa8, D:L191181). */
export const LOGIN_FAILURE_TEXT = 'Login Failure';
/** The UIMnLOC id whose text state 2 posts with MP_MEDIUS_ERROR (`FUN_00361b40(0x1c2)`, D:L190814): `_450_Connectfailure_MSG`. */
export const CONNECT_FAILURE_LOC = 0x1c2;

/**
 * SESSION_BEGIN_ADAPTATION: state 12's SessionBegin with no `sessionBegin` in the service. The console opens a session
 * on the authentication server before any account is named; SVC-03's endpoint has no such step (a session begins at
 * the login, with its ticket), so the request is answered Success where it would be sent, and MP_SUCCESS follows as
 * the reply's callback posts it. A browser adaptation of the transport; the state, its order and the event are the
 * original's.
 */
export const SESSION_BEGIN_ADAPTATION = 'no request: answered Success where SessionBegin would be sent' as const;

/**
 * LOBBY_SERVER_ADAPTATION: state 16's second connection with no `enterLobby` in the service. The console leaves the
 * authentication server and connects to the lobby server named in the login's reply; on our server both are the one
 * host that answered the login, so the connection stands at once and state 11 follows with MP_JOIN_ROOM. The bridge's
 * session (SVC-07a) is presented here when the service has the step (`enterLobby(ticket)`). A browser adaptation.
 */
export const LOBBY_SERVER_ADAPTATION = 'no second server: the connection stands at once' as const;

/**
 * NAME_FILTER_PLACEHOLDER: state 3's text filter on a new name (`FUN_00648678`, its reply `FUN_002eea70`: a result
 * below 0 is MP_FILTER_FAILURE, UIMnLOC 544). The filter is SVC-23's and the name rules are the owner's (HUMAN_TASKS
 * H80; OT.R17: meanwhile no rule beyond the keyboard's caps); with no `filterName` in the service every name passes
 * and the registration is sent. [placeholder]
 */
export const NAME_FILTER_PLACEHOLDER = 'no text filter: every name passes' as const;

/**
 * PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION: the owner's ruling OT.R17 (2026-10-04), not the original's behaviour: the
 * client's copy of the typed password (the console's buffer at 0x66a514, which it keeps) is dropped when the login
 * that carries it is answered -- for a registration, when the login after it is answered or the chain fails -- and at
 * a disconnect. JavaScript cannot erase a string: "dropped" is the last reference from this object let go.
 */
export const PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION = 'the copy is let go when its request is answered (OT.R17)' as const;

/**
 * LOBBY_KEEPALIVE_MS: how often the page renews its session while it holds a ticket -- since NU-16 whether or not a
 * game socket holds it too (`KEEPALIVE_THROUGH_MATCH_ADAPTATION`). The server's session (the bridge's, research 159 §1,
 * `agent/bridge`) ends `SESSION_SILENT_MS_READING` (300 s since NU-16b; 60 s before) after its last use
 * unless a match socket holds it; `/lobby/update-user-state` with `{ userAction: 1 }` is a use (204). Half of the 60 s it
 * was, and a tenth of 300 s, so that one request lost or late does not end it: a player reading USER AGREEMENT for minutes reaches the SOCOM II
 * ONLINE menu with a live ticket. A browser adaptation: the console holds a TCP connection to its lobby server for the
 * session (Horizon times a silent client out after 300 s, research 159 §1); the page has no standing connection besides
 * the match socket, so it renews.
 */
export const LOBBY_KEEPALIVE_MS = 30_000;

/**
 * KEEPALIVE_THROUGH_MATCH_ADAPTATION (NU-16, the owner's playtest server log of 2026-10-15): the keep-alive runs while
 * the session is up with a ticket, whether or not a game socket holds the session too (`socketHolds` is kept as the
 * seam's record and no longer stops it). Was (the fix round's N3, research 157 §6 item 2): stopped while a socket held
 * the session and started again at the hold's release -- and the page learns of a socket's close only on its next
 * animation frame (viewer `gameLobbyHost.ts` `GameSocketHost.frame`, `netPage.ts` `retry`, `lobbyMatch.ts`
 * `LobbyMatch.frame`), while the server lets the session go at the close itself (`detach`: its idle clock,
 * `SOCKET_TICKET_MS`, from then). A window hidden when its game ended draws no frame (`requestAnimationFrame` stops), so
 * it renewed nothing and its player was logged off 60 s later (server `AccountService.loginAt` null: the presence NU-14's
 * AccountGetID reads; viewer `sessionAfterMatch.test.ts`). The console's session never waits on its game's connection:
 * its lobby connection (the object 0x44f370) stays up through the game -- the game's leave, `DisconnectFromGameServer`
 * (`FUN_0027e420` D:L126431-126451), still uses it (`FUN_002f80c0`, `FUN_002e3730`; `FUN_002df6a0` binds the lobby's UI
 * variables, research 133 / 158) -- and the game neither opens nor closes it: it is closed by `UnInitNetwork` with the DME
 * layer (`FUN_0027e5c0` D:L126505-126515; research 160 R160.4), by `LobbyDisconnect` (`FUN_00274d60` D:L121608) and by
 * the error teardowns (`FUN_002f4090` D:L194303, `FUN_002f4240` D:L194331), none of them at a game's start or end
 * (NU-16's review, L2; was: "sends and queues through it ... closed only by `UnInitNetwork`").
 * A use while a socket holds the session changes nothing on the server (`/lobby/update-user-state` answers 204, its one
 * effect the use; server `lobbyHttp.ts`). The cost: a request each `LOBBY_KEEPALIVE_MS` through the match. A browser
 * adaptation of the transport; nothing the console shows changes.
 */
export const KEEPALIVE_THROUGH_MATCH_ADAPTATION = 'the keep-alive runs while the session holds a ticket, a game socket holding it or not' as const;

/**
 * SESSION_LOST_READING: what the page does when the keep-alive is answered 401 (the server holds no session for the
 * ticket). The console's equivalent is its lobby connection dropping; the event its client posts for a lobby
 * connection that fails is state 2's (`FUN_002ee610` D:L190804-190820): the transport closed and MP_MEDIUS_ERROR posted
 * with UIMnLOC 450's text (`_450_Connectfailure_MSG`, `FUN_00361b40(0x1c2)` D:L190814) -- the event's string (0x3f49e0)
 * is posted from that site and from the login's "Login Failure" (D:L191181) only. So a 401 drops the ticket and the
 * logged-in flag, stops the keep-alive and queues state 2; what shows is the built dialog's binding of
 * MP_MEDIUS_ERROR: `dlgNetConnect` and `dlgNetPlayerName` `OnNetError`, `dlgWorldOfSOCOM` `UIanim.rdr`'s
 * `OnMultiplayerDisconnect` (ONL-33's pin) -- and on `dlgUsagePolicy`, which binds none, nothing, as on the console.
 * Which site the console's Medius library reaches on a drop in mid-session (its socket's callback) is not traced: a
 * reading. [reading]
 */
export const SESSION_LOST_READING = "a 401 keep-alive queues state 2: MP_MEDIUS_ERROR with UIMnLOC 450's text (FUN_002ee610)" as const;

/**
 * LOGOUT_SILENCES_SESSION_LOST_ADAPTATION: a keep-alive answered "session lost" after `LobbyLogout` has queued state
 * 0x12 and before its reply ends the session posts nothing -- the player chose to leave, and an error popup over the
 * logout would be the page's own race (the console has no keep-alive to race). The logout ends the session as it would.
 */
export const LOGOUT_SILENCES_SESSION_LOST_ADAPTATION = 'a session-lost keep-alive answer during a logout posts nothing; the logout ends the session' as const;

/**
 * LOBBY_CLOSE_AT_STOP_ADAPTATION: when the page's front end stops (`mountFrontEnd`'s `stop`), the client sends the
 * service's logout for a held ticket without waiting and disconnects -- so no keep-alive outlives the front end, and
 * the server does not hold a session that would refuse the next login with -997 (AccountLoggedIn). The console's
 * session ends with its power or its lobby connection; the page has neither to end it.
 */
export const LOBBY_CLOSE_AT_STOP_ADAPTATION = "the front end's stop logs out (best effort, not awaited) and disconnects the lobby" as const;

/**
 * LOGOUT_UNANSWERED_ADAPTATION: state 0x12's SessionEnd that the service does not answer -- its request rejected (the
 * server unreachable: `fetch`'s TypeError) or never returned within `LOGOUT_TIMEOUT_MS` -- ends the session here, as a
 * failed status would: the reply `FUN_002ee7b0` (D:L190850-190871) clears the key and queues state 0 on either status,
 * and the entry `FUN_002ee6e0` (D:L190823-190847) ignores the send's own failure. What the console did when no reply
 * ever came is the Medius library's timeout, not recorded. Without it `LobbyLogout` answered 0 forever: the logoff sat
 * on #422 "Logging off" with the ticket held and the keep-alive renewing the session the player ended. A browser
 * adaptation of the transport.
 */
export const LOGOUT_UNANSWERED_ADAPTATION = 'a rejected or unanswered logout (timeout LOGOUT_TIMEOUT_MS) ends the session here, as a failed status' as const;

/**
 * LOGOUT_TIMEOUT_MS: the bound on the logout's answer (`LOGOUT_UNANSWERED_ADAPTATION`). Five seconds: the account
 * endpoint answers a logout in milliseconds on a working connection, so the bound is never met there; the player
 * watches #422 for at most this long; and a session the server never hears ended expires on its own
 * (`SESSION_SILENT_MS_READING`, 300 s after its last use since NU-16b, research 159 §1), so giving up costs the server
 * nothing -- the player's cost: that name's login answered AccountLoggedIn (-997) until then. A browser
 * adaptation; no source gives the console's figure.
 */
export const LOGOUT_TIMEOUT_MS = 5_000;

/** A handler's call: 1 the state's entry, 2 a step it stands, 3 its exit. */
export type LobbyStatePhase = 1 | 2 | 3;
export type LobbyStateHandler = (phase: LobbyStatePhase) => void;

/** The service's answer to a login: the Medius status and, on success, the session's ticket. */
export interface LobbyLoginReply { status: number; ticket?: string }

/**
 * The requests the states send, as the page's service answers them (the transport is ours; each status is the Medius
 * status the console's callback reads). A rejection is a request never answered.
 */
export interface LobbyService {
  /** State 12's SessionBegin. Absent: `SESSION_BEGIN_ADAPTATION`. */
  sessionBegin?(): Promise<{ status: number }>;
  /** State 7's AccountLogin (and the login after a registration): the name and the password, once. */
  login(q: { name: string; password: string }): Promise<LobbyLoginReply>;
  /** State 3's text filter on the name: `result` below 0 refuses it. Absent: `NAME_FILTER_PLACEHOLDER`. */
  filterName?(name: string): Promise<{ result: number }>;
  /** State 3's AccountRegistration. */
  register(q: { name: string; password: string }): Promise<{ status: number }>;
  /** State 16's connection to the lobby server with the session's ticket: false is the callback's -1. Absent: `LOBBY_SERVER_ADAPTATION`. */
  enterLobby?(ticket: string | null): Promise<boolean>;
  /** State 0x12's SessionEnd for a session that holds a ticket. Absent: ended here only. */
  logout?(ticket: string): Promise<{ status: number }>;
  /**
   * The session renewed (`LOBBY_KEEPALIVE_MS`): true while the server holds it (or may: an answer that proves
   * nothing), false when it holds none (the page's reading of the answer: 401, and 403 / 404, `./connectHost`'s
   * `KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`; `SESSION_LOST_READING`). A rejection is a request never answered: nothing changes. Absent: no keep-alive.
   */
  keepAlive?(ticket: string): Promise<boolean>;
  /**
   * SESSION-TAKEOVER's fold (the merge controller's condition, 2026-10-15): asked once after a session is lost, why the
   * server ended it -- `'taken-over'` when a login elsewhere took the account's session over (the server's
   * `SESSION_TAKEN_OVER_REASON`), else null (any other end, or no answer). The page's own line beside the original's
   * dialog reads it (viewer `connectHost.ts`, `SIGNED_IN_ELSEWHERE_ADAPTATION`); this module never does: state 2 is
   * queued as `SESSION_LOST_READING` says, whatever the reason. Absent: never asked.
   */
  sessionEndedWhy?(ticket: string): Promise<SessionEndReason | null>;
}

/** SESSION-TAKEOVER's fold: the one reason the server tells for a session's end (`LobbyService.sessionEndedWhy`). */
export type SessionEndReason = 'taken-over';

export interface LobbyClientOptions {
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  service: LobbyService;
  /** `DAT_0044f3c8(name, argument)`: a named event into the dialog host, with its argument or null. */
  event: (kind: number, text: string | null) => void;
  /**
   * `FUN_00361b40`: a UIMnLOC string by id (state 2's 450), as the caption tables decode it; the event carries the
   * table's own bytes (`locTextBytes`: the popup's `INPUT_STRING` text is walked a byte a character). Absent, or no
   * such id: the event carries no argument.
   */
  locText?: (id: number) => string | null;
  /** The login is over -- answered with a success or a refusal, or its registration chain ended (OT.R17: the page drops its password). */
  settled?: () => void;
  /** A repeating timer (`LOBBY_KEEPALIVE_MS`) answering its stop. Absent: the global `setInterval` / `clearInterval`. */
  every?: (ms: number, fn: () => void) => () => void;
  /** A one-shot timer (`LOGOUT_TIMEOUT_MS`) answering its cancel. Absent: the global `setTimeout` / `clearTimeout`. */
  after?: (ms: number, fn: () => void) => () => void;
}

const afterTimeout = (ms: number, fn: () => void): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

const everyInterval = (ms: number, fn: () => void): (() => void) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

/** The client's lobby object (0x44f370): see the module's header. */
export class LobbyClient implements PersonaLobby {
  /** +0x7d. */
  up = false;
  private stateByte = 0;
  private readonly queue: number[] = [];
  private readonly handlers = new Map<number, LobbyStateHandler>();
  /** The address `LobbyConnect` connected to (0x66a9b0, 0x66aab0). */
  private address: { host: string; port: number } | null = null;
  /** SessionBegin answered (the console's session key at 0x66a4d0 is non-empty). */
  private sessionBegun = false;
  /** 0x66a4f4. */
  private name: string | null = null;
  /** 0x66a514 (`PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION`). */
  private password: string | null = null;
  /** 0x66a8e0: a login succeeded on this session. */
  private logged = false;
  private sessionTicket: string | null = null;
  /** Replies of an earlier connection are dropped. */
  private epoch = 0;
  /** A game socket holds the session (`socketHolds`), as last told: recorded, the keep-alive runs either way (NU-16). */
  private socketHeld = false;
  /** The running keep-alive's stop, or null. */
  private stopKeepAlive: (() => void) | null = null;
  /** A logout asked (state 0x12 queued) and not yet ended: a keep-alive's 401 then posts nothing (`LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`). */
  private loggingOut = false;

  constructor(private readonly o: LobbyClientOptions) {
    this.install();
  }

  /** `DAT_0044f3d0`. */
  state(): number { return this.stateByte; }
  /** 0x66a8e0: logged in. */
  loggedIn(): boolean { return this.logged; }
  /** The session's ticket (the seam for the later screens' requests), or null: no login, a service that issues none, a logout. */
  ticket(): string | null { return this.sessionTicket; }
  /** The account's name of the session logged in, or null. */
  account(): string | null { return this.logged ? this.name : null; }
  /** Whether a typed password is held for a request not yet answered. */
  holdsPassword(): boolean { return this.password !== null; }
  /** The HOST and PORT the session was connected to, or null. */
  connectedTo(): { host: string; port: number } | null { return this.up && this.address ? { ...this.address } : null; }

  /**
   * The seam for the match's socket (agent/bridge's `attach` / `detach`): whether a socket presents the ticket, the server
   * then keeping the session itself. Recorded only: since NU-16 the keep-alive runs either way
   * (`KEEPALIVE_THROUGH_MATCH_ADAPTATION`), so a close the page has not yet heard costs no renewal.
   */
  socketHolds(held: boolean): void { this.socketHeld = held; }
  /** Whether a game socket was last told to hold the session (`socketHolds`). */
  socketHolding(): boolean { return this.socketHeld; }
  /** Whether the keep-alive is running. */
  keepingAlive(): boolean { return this.stopKeepAlive !== null; }

  /** The ticket set or dropped, and the keep-alive started or stopped to match. */
  private setTicket(ticket: string | null): void { this.sessionTicket = ticket; this.syncKeepAlive(); }

  /**
   * `LOBBY_KEEPALIVE_MS`: running while the session is up with a ticket and the service renews -- a socket holding it or
   * not (`KEEPALIVE_THROUGH_MATCH_ADAPTATION`).
   */
  private syncKeepAlive(): void {
    const want = this.up && this.sessionTicket !== null && this.o.service.keepAlive !== undefined;
    if (want && this.stopKeepAlive === null) this.stopKeepAlive = (this.o.every ?? everyInterval)(LOBBY_KEEPALIVE_MS, () => this.keepAlive());
    else if (!want && this.stopKeepAlive !== null) { this.stopKeepAlive(); this.stopKeepAlive = null; }
  }

  /**
   * One renewal; a 401 for the ticket still held is the session lost (`SESSION_LOST_READING`) -- unless the player has
   * asked to log out (`LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`). An answer for a ticket since dropped or replaced (a
   * logout and a new login on the same connection) is ignored.
   */
  private keepAlive(): void {
    const ticket = this.sessionTicket;
    if (ticket === null || !this.o.service.keepAlive) return;
    this.ask(this.o.service.keepAlive(ticket), (alive) => { if (!alive) this.sessionLost(ticket); });
  }

  /**
   * The session lost (`SESSION_LOST_READING`): a request carrying `ticket` was answered 401 -- the keep-alive's, or a
   * later screen's (ONL-11's room list, research 161 §3). For the ticket still held, while the session is up and no
   * logout is asked (`LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`): the ticket and the logged-in flag dropped, the
   * keep-alive stopped and state 2 queued. A stale ticket's answer is ignored.
   */
  sessionLost(ticket: string): void {
    if (!this.up || ticket !== this.sessionTicket || this.loggingOut) return;
    this.logged = false;
    this.setTicket(null);
    this.queueState(LOBBY_STATE.CONNECT_FAILURE);
  }

  /** A state's handler set (`FUN_002ed460`'s slots): a later task's states (the rooms, the games) register theirs. */
  setHandler(state: number, handler: LobbyStateHandler): void { this.handlers.set(state & 0xff, handler); }

  private readonly resets: (() => void)[] = [];
  /**
   * A later task's part of the lobby's own resets, run at `connect` (the console's lobby init, `FUN_002e0450`
   * D:L182776-182778) and at `disconnect` (`FUN_002df8e0`, the lists' reset, D:L182283): ONL-15's random-join flag.
   */
  onReset(fn: () => void): void { this.resets.push(fn); }

  /** `FUN_002efe20` (D:L191670-191680): a state byte appended to the queue. */
  queueState(state: number): void { this.queue.push(state & 0xff); }

  private post(event: string, text: string | null = null): void { this.o.event(DIALOG_EVENTS[event]!, text); }
  private call(state: number, phase: LobbyStatePhase): void { this.handlers.get(state)?.(phase); }
  /** The client's copy of the typed password let go (`PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION`); a request still out then ends unanswered here. */
  forgetPassword(): void { this.password = null; }
  private settle(): void { this.forgetPassword(); this.o.settled?.(); }

  /** A request sent on this connection: its reply handled only while the connection it was sent on stands. */
  private ask<T>(request: Promise<T>, reply: (r: T) => void): void {
    const epoch = this.epoch;
    request.then((r) => { if (epoch === this.epoch && this.up) reply(r); }, () => { /* never answered */ });
  }

  /**
   * `FUN_002e0030` (D:L182591-182762): with the flag clear -- the flag set, the session key, the logged-in byte and
   * the state byte cleared, the address kept, the queue emptied, the handlers installed (`FUN_002ed460`), the
   * connection started with the callback at 0x2e0440, which queues state 12 (`j FUN_002efe20` with 12); answer 1.
   * With it set, answer 0. (A connection that cannot start queues state 2 and steps once, D:L182752-182755: the
   * page's requests need no connection opened first, so that branch has no trigger here.)
   */
  connect(host: string, port: number): boolean {
    if (this.up) return false;
    this.up = true;
    this.epoch++;
    this.sessionBegun = false;
    this.logged = false;
    this.loggingOut = false;
    this.setTicket(null);
    this.name = null;
    this.forgetPassword();
    this.address = { host, port };
    this.stateByte = 0;
    this.queue.length = 0;
    this.queueState(LOBBY_STATE.SESSION_BEGIN);
    for (const fn of this.resets) fn();
    return true;
  }

  /**
   * `FUN_002dfdd0` (D:L182488-182499), `LobbyDisconnect`'s call: with the flag set -- the flag cleared, the transport
   * closed (`FUN_00300680`), the lobby's lists reset (`FUN_002df8e0`: the rooms', the games', the clan's: their
   * tasks'). The state byte and the valve stay as they stand until the next connect.
   */
  disconnect(): void {
    if (!this.up) return;
    this.up = false;
    this.epoch++;
    this.queue.length = 0;
    this.sessionBegun = false;
    this.logged = false;
    this.loggingOut = false;
    this.setTicket(null);
    this.forgetPassword();
    for (const fn of this.resets) fn();
  }

  /**
   * The page leaving (`LOBBY_CLOSE_AT_STOP_ADAPTATION`): the service's logout sent once for a held ticket, not waited
   * for and its answer or failure ignored, then `disconnect` -- the keep-alive stopped, the ticket and the password let
   * go. With the session down, nothing.
   */
  close(): void {
    if (!this.up) return;
    const ticket = this.sessionTicket, svc = this.o.service;
    if (ticket !== null && svc.logout) {
      try { svc.logout(ticket).catch(() => { /* best effort */ }); } catch { /* best effort */ }
    }
    this.disconnect();
  }

  /** `FUN_002dfe50` (D:L182517-182587): the module's header, "The step". */
  step(): void {
    if (!this.up) return;
    if (this.queue.length === 0) { this.call(this.stateByte, 2); return; }
    this.call(this.stateByte, 3);
    this.stateByte = this.queue.shift()!;
    this.call(this.stateByte, 1);
    const valves = this.o.valves();
    const valve = valves.acquire(SOCOM_ONLINE_STATE_VALVE, VALVE_TYPE.PERM);
    if (valve.value !== this.stateByte) valves.set(SOCOM_ONLINE_STATE_VALVE, this.stateByte, VALVE_TYPE.PERM);
  }

  /**
   * `FUN_002fa5a0` (D:L198285-198325), `LobbyLogin`'s call: with the flag clear, 0; else the account id reset, the
   * name and the password kept (0x20 bytes each: the keyboards cap both at 31), state 7 queued; 1.
   */
  login(name: string, password: string): boolean {
    if (!this.up) return false;
    this.name = name;
    this.password = password;
    this.queueState(LOBBY_STATE.ACCOUNT_LOGIN);
    return true;
  }

  /** `FUN_002fa320` (D:L198228-198267), `LobbyRegister`'s call: as `login`, with state 3 queued. */
  register(name: string, password: string): boolean {
    if (!this.up) return false;
    this.name = name;
    this.password = password;
    this.queueState(LOBBY_STATE.ACCOUNT_REGISTRATION);
    return true;
  }

  /** `FUN_002fa560` (D:L198270-198282), `LobbyLogout`'s call: with the flag set, state 0x12 queued; the flag is the answer. */
  logout(): boolean {
    if (this.up) { this.loggingOut = true; this.queueState(LOBBY_STATE.LOGGING_OUT); }
    return this.up;
  }

  /** `FUN_002eefa0`'s and `FUN_002eec10`'s success (D:L191184-191281, D:L191034-191088): the session's data kept, state 16 queued. */
  private loginSucceeded(r: LobbyLoginReply): void {
    this.logged = true;
    this.setTicket(typeof r.ticket === 'string' && r.ticket !== '' ? r.ticket : null);
    this.queueState(LOBBY_STATE.LOBBY_SERVER);
    this.settle();
  }

  /** The handlers `FUN_002ed460` installs, for the states this module holds. */
  private install(): void {
    const svc = this.o.service;
    // State 12 (FUN_002ee830): SessionBegin while no session key is held; its reply FUN_002ee910.
    this.setHandler(LOBBY_STATE.SESSION_BEGIN, (phase) => {
      if (phase !== 1 || this.sessionBegun) return;
      const reply = (r: { status: number }): void => {
        if (r.status !== MEDIUS_STATUS.Success) { this.queueState(LOBBY_STATE.ACCOUNT_NOT_FOUND); return; }   // D:L190909-190912
        this.sessionBegun = true;
        this.post('MP_SUCCESS');                                                                            // D:L190918-190920
      };
      this.ask(svc.sessionBegin ? svc.sessionBegin() : Promise.resolve({ status: MEDIUS_STATUS.Success }), reply);   // SESSION_BEGIN_ADAPTATION
    });
    // State 7 (FUN_002eede0): AccountLogin; its reply FUN_002eefa0.
    this.setHandler(LOBBY_STATE.ACCOUNT_LOGIN, (phase) => {
      if (phase !== 1 || this.name === null || this.password === null) return;
      this.ask(svc.login({ name: this.name, password: this.password }), (r) => {
        if (r.status === MEDIUS_STATUS.Success) { this.loginSucceeded(r); return; }
        if (r.status === MEDIUS_STATUS.AccountNotFound) { this.forgetPassword(); this.queueState(LOBBY_STATE.ACCOUNT_NOT_FOUND); return; }   // D:L191165-191168
        if (r.status === MEDIUS_STATUS.AccountLoggedIn) this.post('MP_PLAYER_LOGGED_IN');                    // D:L191169-191173
        else if (r.status === MEDIUS_STATUS.InvalidPassword) this.post('MP_INVALID_PASSWORD');               // D:L191174-191178
        else this.post('MP_MEDIUS_ERROR', LOGIN_FAILURE_TEXT);                                               // D:L191179-191182
        this.settle();
      });
    });
    // State 3 (FUN_002ee9b0): the filter, the registration, the login again (FUN_002eea70, FUN_002eeb50, FUN_002eec10).
    this.setHandler(LOBBY_STATE.ACCOUNT_REGISTRATION, (phase) => {
      if (phase !== 1 || this.name === null || this.password === null) return;
      const name = this.name;
      const failed = (): void => { this.queueState(LOBBY_STATE.REGISTRATION_FAILURE); this.settle(); };
      this.ask(svc.filterName ? svc.filterName(name) : Promise.resolve({ result: 0 }), (f) => {           // NAME_FILTER_PLACEHOLDER
        if (f.result < 0) { this.post('MP_FILTER_FAILURE'); failed(); return; }                             // D:L190961-190966
        if (this.password === null) return;
        this.ask(svc.register({ name, password: this.password }), (reg) => {
          if (reg.status !== MEDIUS_STATUS.Success || this.password === null) { failed(); return; }         // D:L190996-190999
          this.ask(svc.login({ name, password: this.password }), (r) => {
            if (r.status !== MEDIUS_STATUS.Success) { failed(); return; }                                   // D:L191029-191032
            this.loginSucceeded(r);
          });
        });
      });
    });
    // State 16 (FUN_002efa90): the lobby server connected; its callback FUN_002efc80.
    this.setHandler(LOBBY_STATE.LOBBY_SERVER, (phase) => {
      if (phase !== 1) return;
      this.ask(svc.enterLobby ? svc.enterLobby(this.sessionTicket) : Promise.resolve(true), (ok) => {       // LOBBY_SERVER_ADAPTATION
        if (!ok) { this.queueState(LOBBY_STATE.CONNECT_FAILURE); return; }                                  // D:L191636-191639
        this.queueState(LOBBY_STATE.LOGGED_IN);                                                             // D:L191651-191652
        this.post('MP_JOIN_ROOM');                                                                          // D:L191653-191655
      });
    });
    // State 2 (FUN_002ee610): MP_MEDIUS_ERROR with UIMnLOC 450's text.
    this.setHandler(LOBBY_STATE.CONNECT_FAILURE, (phase) => {
      if (phase !== 1) return;
      const text = this.o.locText?.(CONNECT_FAILURE_LOC) ?? null;
      this.post('MP_MEDIUS_ERROR', text === null ? null : locTextBytes(text));
    });
    // State 0x12 (FUN_002ee6e0): the session ended; its reply FUN_002ee7b0 queues state 0 on either status.
    this.setHandler(LOBBY_STATE.LOGGING_OUT, (phase) => {
      if (phase !== 1) return;
      const ticket = this.sessionTicket;
      const ended = (): void => { this.sessionBegun = false; this.logged = false; this.loggingOut = false; this.setTicket(null); this.queueState(LOBBY_STATE.NONE); };
      if (ticket === null || !svc.logout) { ended(); return; }                                              // D:L190833-190836: nothing to end at the service
      // LOGOUT_UNANSWERED_ADAPTATION: a rejection is a failed status, and the wait is bounded by LOGOUT_TIMEOUT_MS.
      const epoch = this.epoch;
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        cancel();
        if (epoch === this.epoch && this.up) ended();
      };
      const cancel = (this.o.after ?? afterTimeout)(LOGOUT_TIMEOUT_MS, finish);
      let request: Promise<unknown>;
      try { request = svc.logout(ticket); } catch (e) { request = Promise.reject(e); }
      request.then(finish, finish);
    });
  }
}
