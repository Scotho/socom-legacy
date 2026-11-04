# 130 -- Accounts and personas on the service side: the hash, the console's statuses, the remember token (SVC-03)

Written 2026-10-02 for SVC-03 (`../roadmap/06-online-services.md`, "SVC-03 -- Accounts and personas (the service
side)"), on the online path the owner set the same day (Main menu -> Online -> LOGIN -> DNAS -> ... -> the match's
start). The ruling is R7 with its section 7 item 5 (`../specs/2026-10-01-web-r7-account-and-card-design.md`): a plain
name and password, an argon2id (or scrypt) hash on the server, SAVE PASSWORD: YES a remember token in an HttpOnly
cookie, never the password. Built on SVC-04's store (research 131). The code is `packages/central/src/accounts.ts`
(the operations) and `packages/central/src/accountHttp.ts` (the login endpoint); the test is
`packages/central/test/accounts.test.ts`. Sources: the retail decompilation r0001 (`D:L<line>`), the disc's
`RUN/LOCALE/STATES/UIMNLOC.ZAR` (`UIMnLOC.rdr`, through `parseLocTable`), our Horizon's sources (`RT.Common/Types.cs`,
`RT.Common/Constants.cs`, `Server.Medius/Medius/MAS.cs` under `server/horizon-server/` of `SOCOM_PC_ROOT`) and research
97. **No server was contacted** (R293): the tests run the service and its endpoint on 127.0.0.1 in a temporary
directory; every name and password in them is invented.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R132.1 | **The login callback tells three failures apart** (a reading): `FUN_002eefa0`, the AccountLogin callback, on a failure (D:L191163-191182) posts its state 10 for -998 `MediusAccountNotFound`, raises MP_PLAYER_LOGGED_IN for -997 `MediusAccountLoggedIn` and MP_INVALID_PASSWORD for -978 `MediusInvalidPassword`, and MP_MEDIUS_ERROR "Login Failure" for any other status. Research 97 R97.5 named this callback among the lobby's few that test codes | the service answers a wrong password or token with -978, an unknown name with -998, a second login with -997, the attempt limit with -995 (an "other") | §2 |
| R132.2 | **The persona connect errors** are `dlgNetConnect`'s UIMnLOC 542-547 (`tools/dump-dialogs.ts --msg-users 540 548`; 548 is named by no dialog): 543 "The account information you provided is already logged in ..." (`_543_AccountInfoAlready_MSG`), 544 "... could not be registered due to questionable content in the name ..." (`_544_PlayerNameQuestable_MSG`), 545 "The password supplied does not match the registered password for this player name ..." (`_545_PasswordNotMatch_MSG`), 546 "Could not connect to the SOCOM II server ...", 547 "A valid link could not be established ...". Which event opens which text is the dialog's script (ONL-07); by their words 543 is MP_PLAYER_LOGGED_IN's and 545 MP_INVALID_PASSWORD's | the service's -997 and -978 are what bring up 543 and 545; 544 follows the registration's text filter (§2), SVC's filter task, not this one | §2 |
| R132.3 | **Registration reads success or failure only**: `FUN_002eeb50` (D:L190984-191012) on success logs in again (`AccountLoginAfterRegister`, `FUN_002eec10`), on any failure posts its state 6; before it, `FUN_002eea70` (D:L190950-190982) refuses a name the text filter scores below 0 with MP_FILTER_FAILURE | a create for a taken name answers -999 `MediusAccountAlreadyExists` (the block's acceptance; our Horizon's, MAS.cs:425), a create whose fields do not fit -994 `MediusRegistrationFailed`; the console reads both as a failure | §2 |
| R132.4 | **The widths**: the login request (`FUN_002eede0` D:L191136-191140, 0x66 bytes) carries the name in +0x26:32 and the password in +0x46:32; ACCOUNTNAME_MAXLEN and PASSWORD_MAXLEN are 32 (`Constants.cs:11`, `:16`); the builders put the NUL at width - 1 (research 131 R131.1) | a name or password past 31 bytes, or empty, is refused (create: -994; login: -978) | §2 |
| R132.5 | **The hash**: argon2id, 19 MiB, 2 passes, 1 lane, a 16-byte salt and a 32-byte tag (`ARGON2ID_PARAMS`), a PHC string in the store; the console kept the password plain on its card and Sony's storage is unobservable, so this is R7's policy, not a reading | a test reads `services.json` after a create and finds the hash and no password | §3 |
| R132.6 | **SAVE PASSWORD: YES** issues a 256-bit token (`REMEMBER_TOKEN_BYTES`) whose SHA-256 alone is stored (SVC-04's `tokens`), set as `s2u_remember_<account id>=...; Max-Age; Path=/account; HttpOnly; Secure; SameSite=Strict`; a later login with the cookie and no password succeeds; an idle token and every token of an account whose password changed are refused (-978) | each acceptance line has its test (§4) | §4 |
| R132.7 | **The endpoint** `POST /account/create`, `/account/login`, `/account/logout` refuses a request whose `Origin` is not on its list (403, before the body is read) and a login past the attempt limit (429, status -995); its log line holds the operation, the name, the status and the address, never a password, a token or a cookie | tested; the endpoint is a handler not yet mounted on the match server (§6) | §4, §6 |
| R132.8 | **The remember token rolls, rotates and is capped** (2026-10-11, SVC-03a, W18.R9; a server policy, no original): a 30-day idle window each use extends, a rotation at a use 24 h or more after the token's issue with a 60 s grace, the whole chain dropped when a rotated-out token comes back after its grace, a 90-day cap from the password login that began the chain, and `forget: true` on sign-out; HttpOnly, Secure, SameSite=Strict, `Path=/account` unchanged | unit-tested with a fake clock (`accounts.test.ts`, the store's three files); the store's schema 5 / document version 4 carry each token's chain | §8 |

## 1. What the block asks, and what is built

The block's Gap, line by line: an account store with the password hash (SVC-04's `passwordHash`, written by
`hashPassword`); create and login by name and password (`AccountService.create`, `.login`); the login errors as the
console words them (§2); the remember token -- issue at a login with SAVE PASSWORD: YES, check, idle expiry, drop on a
password change, only its hash kept (§4); an HTTPS login endpoint beside the WebSocket that sets the cookie
(`accountHandler`, §4); the Origin check on it; a limit on login attempts. No credential list, no revocation screen
(R7). Log out ends the session (`logout`); the remember token outlives it, as SAVE PASSWORD outlives a session on the
console.

The block's open design point is taken as it suggests: the cookie is presented **only** to the login endpoint (its
`Path=/account`), which answers a success with a short-lived **ticket** for the socket (`claimTicket`, once, within
`SOCKET_TICKET_MS`), so the WebSocket handshake needs no Origin rule of its own.

## 2. The console's statuses: the readings

The client reads every status through `FUN_002f42d0`, `status == 0` in retail (research 97 §1.3), and on a failure
raises an `MP_*` event or moves its login state machine (`FUN_002ed460`, D:L190161-190200: the handler of state n at
`+4n`; state 3 the text filter and registration `FUN_002ee9b0`, state 7 the login `FUN_002eede0`, states 6 and 10 two
labels Ghidra did not make functions of, `LAB_002ee6d0` and `LAB_002ee6c0`). The login path:

| step | request | callback | what the callback does with the status |
|---|---|---|---|
| filter the new name | `FUN_00648678` (D:L190943) | `FUN_002eea70` D:L190950-190982 | result < 0: MP_FILTER_FAILURE, state 6; else the registration |
| register | `FUN_00648140` (D:L190977), name and password 32 bytes each | `FUN_002eeb50` D:L190984-191012 | success: AccountLogin again (`FUN_00647f48`, cb `FUN_002eec10` D:L191015-191090); failure: state 6 |
| log in | `FUN_00647f48` (D:L191140), 0x66 bytes: +0x26:32 the name, +0x46:32 the password | `FUN_002eefa0` D:L191147-191283 | -998: state 10; -997: MP_PLAYER_LOGGED_IN; -978: MP_INVALID_PASSWORD; else MP_MEDIUS_ERROR "Login Failure" (D:L191163-191182); success: the session's data copied, state 16 (D:L191275-191276) |

The labels and events are the ELF's strings (`0x3f4a40` AccountRegistration, `0x3f4a60` AccountLoginAfterRegister,
`0x3f4a80` AccountLogin, `0x3f4a90` MP_PLAYER_LOGGED_IN, `0x3f4860` MP_INVALID_PASSWORD, `0x3f49e0` MP_MEDIUS_ERROR,
`0x3f4aa8` "Login Failure", `0x3f4a20` MP_FILTER_FAILURE); the numbers are `MediusCallbackStatus`'s
(`Types.cs:68-136`). So the service answers:

| case | status | the console's reading |
|---|---|---|
| create, the name taken (case folded, research 131's `NAME_KEY_CASE_FOLD_PLACEHOLDER`) | -999 AccountAlreadyExists | a registration failure: state 6 |
| create, a name or password empty or past 31 bytes | -994 RegistrationFailed | a registration failure: state 6 |
| login, no such name | -998 AccountNotFound | state 10 |
| login, a wrong password, or a remember token unknown, idle-expired, another account's or dropped | -978 InvalidPassword | MP_INVALID_PASSWORD (545 by its words) |
| login, the account already logged in (checked after the secret) | -997 AccountLoggedIn | MP_PLAYER_LOGGED_IN (543 by its words) |
| login, past the attempt limit | -995 LoginFailed | MP_MEDIUS_ERROR "Login Failure" |

Every row is a **reading, pending review**: the code's branch is read; which UIMnLOC text each event opens, and what
states 6 and 10 then do, are the dialog's (ONL-07), and the statuses Sony's servers sent are ONL-32's transcript. A
wrong-token login answers -978 because the token stands in for the password; a persona's saved login that fails thus
shows the console's "password does not match" text, which is what the player would fix.

**The order of the checks.** Our Horizon checks "logged in" before the password (`MAS.cs:590-605`), so it tells anyone
that a name is in use. The service checks the secret first; with the right secret the answer is the same. Sony's order
is unobservable.

## 3. The hash

`hashPassword` is argon2id through `hash-wasm` (4.12.0, MIT; `THIRD_PARTY_NOTICES.md`), a WebAssembly build, chosen
because the deploy image is `node:22` (no `crypto.argon2` before Node 24.7) and needs no native build. The parameters
are OWASP's Password Storage Cheat Sheet's first argon2id line (m = 19456 KiB, t = 2, p = 1) with RFC 9106's 16-byte
salt and 32-byte tag; they are written into each PHC string, so raising them later re-hashes nothing by force. One hash
costs about 30 ms on the development machine. `verifyPassword` reads only `$argon2id$`: SVC-04's store also admits
`$scrypt$` (R7's alternative), which nothing writes.

The WebAssembly runs synchronously on the calling thread: four concurrent hashes blocked the event loop for about
95 ms in the SVC-03 review's probe. Hashes and verifies therefore go one at a time, each after a `setImmediate`
(`oneHashAtATime`), so the match server's sockets and room ticks turn between any two (the test drives four at once and
sees a turn between each); the create limit (section 4) bounds how many one address can ask for. A worker thread, or
Node's own `crypto.argon2` once the image is Node 24.7 or later, would take the hash off the loop entirely; neither is
done here (the deploy image and its bundle are the owner's).

## 4. The remember token and the endpoint

- **Issue.** A login with SAVE PASSWORD: YES and the right password drops a token the request showed for that account
  and issues a new one: 32 bytes of `crypto.randomBytes`, base64url; the store keeps its SHA-256 with its issue and
  last-use times (research 131 §2). The cookie is per account (`rememberCookieName`), so a card's personas on one host
  keep a token each.
- **Check.** A login with no password presents the cookie; the token's SHA-256 must be one of that account's
  (compared in constant time), and its last use within `REMEMBER_TOKEN_IDLE_MS_OWNER` (named a placeholder until
  2026-10-11); it is then touched and the cookie re-set, which slides its `Max-Age`. *(2026-10-11, SVC-03a: the token
  now also rotates and its chain is capped; §8 is the rule, this bullet its first half.)*
- **Expiry and drop.** An idle token is refused and dropped at its next login, and `sweep()` drops every idle one; a new
  password (`setPassword`, an operator's tool: no screen of the original changes a password) drops every token of the
  account (the store's `setPasswordHash`). A SAVE PASSWORD: NO login that is shown a token forgets it and clears the
  cookie: NO stores nothing.
- **The cookie.** `HttpOnly` (no page script reads it), `Secure` (never over plain HTTP: TLS is the proxy's, Caddy),
  `SameSite=Strict` and `Path=/account` (shown to the login endpoint only). The response body carries the status and
  the ticket, never the token. A page on another site than the match server's host gets no SameSite cookie, so there
  YES behaves as NO (R7's default). Safari's cap on such a cookie stays the block's to confirm on the deployed hosts.
- **Origin.** The endpoint answers only the origins it is given (`allowedOrigins`), with CORS and credentials; any
  other `Origin`, or none, is a 403 before the body is read, preflight included.
- **The attempt limit.** Failed logins (not found, wrong password or token) are counted per address and per name from
  that address (an IPv6 address as its /64, `limitAddressKey`; LATER 381, 2026-10-24 -- before it, per name across
  every address); at `LOGIN_ATTEMPTS_PLACEHOLDER` within `LOGIN_WINDOW_MS_PLACEHOLDER` of a key's first failure, that
  key is refused (429, -995) until the window ends, the right password included -- a remember cookie of a live chain
  of the named account excepted, which is never refused by it (still counted). Each login counts its attempt against both keys **before
  any await** (as a create does), so a parallel burst sees every earlier request's slot: at most
  `LOGIN_ATTEMPTS_PLACEHOLDER` logins per key reach the hash or wait in its queue, and the rest are refused at once
  (the SVC-03 review's blocking finding: 40 parallel wrong guesses had all been checked, none refused; the test fires
  the limit + 7 with `Promise.all`). A failure keeps its slot. A login whose secret is right gives both slots back:
  a success, as before, never counts and clears the name's count, the address keeping the failures it had; an
  AccountLoggedIn (-997) counts nothing. While a burst is in flight its slots refuse the key even to the right
  password; failures still in flight when a success clears the name are not added back to the name (the address
  keeps them). The hash queue is bounded apart from the count: a key is also refused while
  `LOGIN_ATTEMPTS_PLACEHOLDER` of its logins are in flight (past the check, not yet answered), so neither the window's
  end nor a success's reset, which forget the count, lets a second limit's worth queue behind the first (the SVC-03
  fix review's third point; the tests: a burst across the window's end, a burst from one address over more names than
  the limit, and a success then a whole limit of failures from another address, none refused). In memory: a restart clears it. Once per window every key whose window has ended is forgotten, so distinct names and addresses never
  checked again do not grow the map beyond one window's worth.
- **The create limit.** Creates are counted per address in the same window, whatever their outcome; at
  `CREATE_ATTEMPTS_PLACEHOLDER` the address's next create is refused (429, -994: the registration callback reads it as a
  failure, `FUN_002eeb50`) before any hash. It bounds what one address can cost in hashing and in `services.json`
  rows; many addresses still can, which is the deploy's (a proxy's rate limit) to bound.
- **Logs.** One line per request: `{ msg: 'account', op, status, address, name }` and whether a cookie was set or
  cleared. The test drives a create, a saved login, a wrong password and a cookie login and finds neither password,
  the token nor its hash in any line. The service and the store never log.

## 5. Sessions

A success opens a session in memory: one per account, keyed by its ticket. The ticket (32 random bytes) waits
`SOCKET_TICKET_MS` for the socket's `claimTicket`; unclaimed, the session ends, so a page closed between the login and
the socket does not leave the account "logged in". `logout(ticket)` ends it (the socket's close is meant to call it).
A restart of the match server ends every session.

## 6. What is not done here

- **The endpoint is not mounted on the match server.** `accountHandler` returns false for any other path, so mounting
  it is one line in `MatchServer.request`, plus `main.ts`'s data directory (SVC-04's store, research 131 §7) and its
  allowed origins from the environment. Not done: the public surface `/health`, `/rooms`, `/ws` is the owner's ruling
  (OWNER-4, pinned by `test/deployEnv.test.ts` and `deploy/README.md`), and adding `/account/*` to it, the volume in
  `deploy/compose.yaml` and the Caddyfile route are a deploy change -- the owner's. The socket's use of the ticket
  (claim at hello, logout at close) comes with that mount.
- **The client side**: the page's calls, the LOGIN screens and their error dialogs are ONL-06 / ONL-07; the persona
  record (SAVEPASSWORD and the password's length) is OPT-04.
- **The questionable-name filter** (544, MP_FILTER_FAILURE) is the text filter's task, not this one.
- **Whether a stranger's first login is a create** (V23; our Horizon's `CreateAccountOnNotFound`): the service answers
  -998 and leaves the create to the client's registration; what the console's state 10 does after -998 is ONL-07's
  unknown (a debug-level Medius log of one login).
- **(a) The name key's lockout** (the SVC-03 review, non-blocking): failures counted per name across every address
  let any client lock a player's name out for a window with `LOGIN_ATTEMPTS_PLACEHOLDER` wrong passwords (from one
  address or rotating ones), the right password and a valid remember cookie included. **Changed 2026-10-24** (LATER
  381, SA-47's per-tier read F1, the merge controller's call): the name is counted with the address, and a live
  remember cookie is never refused by the limit; the shape and its numbers stay the owner's call,
  [`HUMAN_TASKS.md`](../HUMAN_TASKS.md) H30, the default meanwhile this shape with 10 failures in 15 minutes per
  key (section 7).
- **(b) The address key behind the proxy** (the SVC-03 review, non-blocking): the login and create limits key on the
  client's address, which `accountHttp.ts` takes from `clientAddress` (`server.ts`): behind the deploy's TLS proxy
  (Caddy, cloudflared) every client has the proxy's address unless `TRUST_PROXY=1` is set, and then one client's
  failures refuse every login for the window. The setting is documented in `deploy/README.md` ("Client address") and
  `deploy/env.example`; `compose.yaml` already sets it. The server does **not** refuse to start with the limiter on a
  proxied bind without it: neither the block nor the R7 spec asks for that, and the endpoint is not mounted (above).
  Owed with the mount and the deploy change: a start-up refusal, or a warning, when `/account/*` is served behind a
  proxy without `TRUST_PROXY`.
- **(c) A wrong name answers at once, a wrong password after a hash** (the SVC-03 review, non-blocking; accepted
  under parity): an unknown name answers before any verify, a wrong password after one (about 25 ms). The original's
  login callback `FUN_002eefa0` already tells the two apart by status -- -998 `MediusAccountNotFound` posts its
  state 10, -978 `MediusInvalidPassword` raises MP_INVALID_PASSWORD (D:L191163-191182) -- so the timing tells nothing
  the status does not; the reviewer read the callback and accepts the difference under the parity rule. A dummy
  verify would matter only if the two statuses were merged.
- **Until the mount**, nothing calls `logout` at a socket's close: a claimed session stays logged in (-997) for the life
  of the process. The mount (above) owes the socket's claim at hello and logout at close.
- **Proven level**: ONL-32's login/create transcript replayed against this service, the same statuses.

## 7. Placeholders and readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `REMEMBER_TOKEN_IDLE_MS_PLACEHOLDER` (retired 2026-10-11) | 30 days | how long a remember token may go unused (R7 section 7 item 5: "a period"); no original (the console kept the password on its card) | replaced by `REMEMBER_TOKEN_IDLE_MS_OWNER` (SVC-03a): the owner's direction on H178 (W18.R9), the figure the seat's under it, now a rolling window (§8.1) |
| `REMEMBER_LOOPBACK_SECURE_COOKIE_READING` (*note only*) | -- | whether a browser keeps a `Secure` cookie that `http://127.0.0.1` or `http://localhost` sets (plain HTTP on the loopback), so that a local launcher's "remember me" works without TLS; a browser's behaviour, not the original's, and not tested here (§8.6) | a browser run per engine (Chromium, Firefox, WebKit) against a local server on both loopback names over plain HTTP: the cookie set, kept and presented at the quick sign-in |
| `LOGIN_ATTEMPTS_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 10 | the failed logins a name or an address may make in a window before it is refused | the owner's call (SVC-03's Owner calls: "the attempt limit's numbers"). *Kept, 2026-10-21: the owner in the deploy seat redotcom-31, verbatim, "keep the placeholders." -- after the first live load runs on the split (one address: the door refused 7 of 15 bots past 8 sockets; 15 bot accounts tripped 10 failed logins / 10 creates and locked the address 15 min). So a household or LAN group behind one address caps at 8 sockets per host, and a group registering together hits 10 creates; a bot run from one address raises the host's `SOCKETS_PER_ADDRESS` for the run instead.* |
| `LOGIN_WINDOW_MS_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 15 min | the attempt limit's window, from a key's first failure; the create limit's too | the same call |
| `CREATE_ATTEMPTS_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 10 | the creates an address may make in a window before its next is refused | the same call. *Kept, 2026-10-21: the owner in the deploy seat redotcom-31, verbatim, "keep the placeholders." -- after the first live load runs on the split (one address: the door refused 7 of 15 bots past 8 sockets; 15 bot accounts tripped 10 failed logins / 10 creates and locked the address 15 min). So a household or LAN group behind one address caps at 8 sockets per host, and a group registering together hits 10 creates; a bot run from one address raises the host's `SOCKETS_PER_ADDRESS` for the run instead.* |
| `GUEST_PER_ADDRESS_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 10 | FG-28 (OT.R55; product track): the forge's guests one address may be given in a window before its next ask is refused (OT.R26: "rate-limited per address"); no original (a service of our own server); the figure follows the create limit's | the owner's call, with the attempt limit's numbers |
| `GUEST_WINDOW_MS_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 15 min | FG-28: the guest limit's window, from an address's first ask | the same call |
| `GUEST_LIVE_TOTAL_PLACEHOLDER` (`packages/central/src/accounts.ts`) | 256 | FG-28 (OT.R55; OT.R26, beside `D9_CREATES_TOTAL_PLACEHOLDER`): the forge's guests live at once, whatever their addresses; past it an ask is refused `full` until one ends; the seat's judgement (eight 32-seat forge rooms of guests) | the owner's call, with the flood limits' (research 169 §9) |

The statuses of §2 are readings of the client's code, held by `accounts.test.ts`'s vocabulary test against
`Types.cs`; their proven level is ONL-32's. `ARGON2ID_PARAMS`, `REMEMBER_TOKEN_BYTES` and `SOCKET_TICKET_MS` are
server policies with no original, not stand-ins for one; so are §8's four `REMEMBER_*_OWNER` figures, the owner's
direction with the seat's numbers, and `REMEMBER_RETIRED_MAX`, derived from two of them. FG-28's `GUEST_NAME_PREFIX`
(OT.R55's words) and `GUEST_NAME_TRIES` (one ask's bound on its draws) are a ruling's text and a server policy, not stand-ins.

## 8. The rolling, rotating token (SVC-03a, W18.R9) -- 2026-10-11

Written 2026-10-11 for SVC-03a REMEMBER-ROTATE (web sprint 18, wave 1; [the plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md),
ruling W18.R9 and its settled line; `../roadmap/06-online-services.md`, "SVC-03a"). **No reading of the original is in
it**: the remember token is a server policy with no original behind it -- the console kept its password on the memory
card (R7) -- so this is a labelled adaptation under OT.R27 (the modern network keeps the original's appearance and
function only). What the console reads is unchanged: every refusal below is -978 InvalidPassword, as an idle token's
was (§2). The owner, 2026-10-11, on H178 (relayed by the merge controller, quoted as W18.R9 quotes it): *"yes, give
cookies a longer rotating duration (whatever is commonly accepted and somewhat secure)"*. The figures are the seat's
under those words; the merge controller settled W18.R9 as written, SameSite=Strict included. The code is
`packages/central/src/accounts.ts` (the policy), `accountHttp.ts` (the cookie, the logout's `forget`, the contract in its
header) and `serviceStore.ts` (the chain's rows); the tests `accounts.test.ts`, `serviceStore.test.ts`,
`serviceStoreSqlite.test.ts`, `serviceStoreMigration.test.ts` and `sessionsPersist.test.ts`, every one on a fake clock.
Level: **reading, pending review** in the sense the project uses for its own policies -- unit-tested against this
text; nothing of it can be proven against the original, which has none.

### 8.1 The figures

| constant (`accounts.ts`) | figure | what it does | the practice it follows |
|---|---|---|---|
| `REMEMBER_TOKEN_IDLE_MS_OWNER` | 30 days | a chain unused this long is refused and dropped; each accepted use extends it, and the cookie's `Max-Age` is re-sent at each use so the browser's copy rolls with it | the idle timeout of the OWASP Session Management Cheat Sheet ("Session Expiration"); the figure the seat's |
| `REMEMBER_ROTATE_AFTER_MS_OWNER` | 24 h | a token presented this long or more after its own issue (`created`) is replaced at that login by a fresh token of the same chain | the rotating persistent-login token (a new token for each use of the old, the series kept, reuse detected); refresh-token rotation in the OAuth 2.0 Security Best Current Practice (RFC 9700). Once a day, not at every use, so parallel tabs seldom race a rotation |
| `REMEMBER_ROTATE_GRACE_MS_OWNER` | 60 s | the token a rotation replaced is still accepted this long after it, answered with the chain's newest, never rotated twice | W18.R9's "a short grace (60 s, parallel tabs)" |
| `REMEMBER_CHAIN_MAX_MS_OWNER` | 90 days | a chain lives at most this long from the password login that began it (`chainBorn`, carried through every rotation); then the password is asked again | the absolute timeout of the same cheat sheet; the figure the seat's |
| `REMEMBER_RETIRED_MAX` (`serviceStore.ts`) | 90 | the rotated-out hashes a chain keeps | derived: 90 days / 24 h; the test pins the quotient |

### 8.2 A presented token, in order

1. **The chain.** The cookie's SHA-256 is looked for among the account's chains, as a live token or as one rotated out
   of a chain, compared in constant time (`chainOf`).
2. **The theft signal.** A rotated-out hash that is not the last one rotated out, or is the last one but presented
   60 s or more after that rotation (the chain's current token's `created`), drops the **whole chain** -- whatever
   secret came with it -- and the cookie is cleared: a token login is refused (-978); a password login goes on by its
   password (and with SAVE PASSWORD: YES begins a new chain). Both a stolen token and the victim's copy are then dead;
   the player signs in again with the password.

   **A browser that never received the rotated cookie is treated the same way.** If a rotation's reply is lost and the
   browser comes back after the grace still holding the old token, the server cannot tell it from a thief replaying a
   stolen copy: it is a reuse, its chain is dropped and the password is asked once. That is the accepted practice's
   fail-safe -- revoke on reuse because the server cannot tell which holder is the honest one (the refresh-token reuse
   detection of the OAuth 2.0 Security Best Current Practice, RFC 9700). *(2026-10-11, F1 of SVC-03a's review: the
   case is narrowed.)* A retry inside the grace now always gets the newest token: before the fix, such a retry met the
   lost reply's session, still open for `SOCKET_TICKET_MS` (60 s, as long as the grace), and was answered
   AccountLoggedIn (-997) with no cookie, so the browser never got the newest and any later attempt was a reuse; now
   the -997 carries the newest token as its cookie. The fail-safe is left for a browser that does not retry within the
   60 s of the rotation, or retries only after a server restart inside the grace (the newest is held in memory only,
   item 4).
3. **The cap and the idle window.** A token login on a chain at or past 90 days from `chainBorn`, or idle more than
   30 days (`lastUsed` before now - 30 days: exactly 30 days is still accepted), is refused (-978), the chain dropped,
   the cookie cleared.
4. **A success with SAVE PASSWORD: YES.** The live token at 24 h or more after its issue rotates: a fresh 256-bit token,
   the store's row replaced (`rotateRememberToken`: issued and used now, the chain and `chainBorn` kept, the old hash
   appended to `retired`), the new value set in the same cookie. Before 24 h it is touched (the idle window rolls) and
   re-sent with its `Max-Age`. The last rotated-out token inside its grace is touched on the chain's current row and
   answered with the newest token -- which only this process holds, in memory, for the grace (`rotatedTo`; never in
   the store, which keeps hashes only); after a restart inside the grace it is accepted with no `Set-Cookie`, the
   browser keeping what the rotation set. A password login begins a new chain (`chainBorn` its time) and drops the chain
   it was shown, if any. With SAVE PASSWORD: NO the chain it was shown is dropped and the cookie cleared, as before.
   *(F1, 2026-10-11)* When the account is already logged in (-997), the answer still carries a cookie where one is
   owed: the newest token for a graced presentation, the clear for a reuse. *(F5, 2026-10-11)* A password login waits
   on the hash; were its chain dropped meanwhile by another request (idle, cap, reuse), dropping it again counts as done
   rather than failing the login with a 500. *(N1 of the re-review, 2026-10-11)* The chain is dropped by its id
   (`dropRememberChain`), stable across rotations: were it rotated meanwhile by a quick sign-in, the password login
   still drops it whole (the newer token refused after, one chain left), not only the copy's older hash; "done" is when
   no token carries that id. The chain ids are unique over every account (the whole-document check). *(F4)* The newest token is held for its grace only: the one-second
   `sweepSessions` forgets it once the 60 s are over.
5. **Unchanged.** HttpOnly, Secure, SameSite=Strict, `Path=/account`; one cookie per account (`s2u_remember_<id>`); only
   hashes stored; a password change drops every chain (`setPasswordHash`); the attempt limits; the statuses of §2. The
   tests pin the edges: a use at 23 h 59 m keeps its token, one at 24 h rotates; the old token at 1 ms, 30 s and
   59.999 s after a rotation is answered with the newest, at 61 s it drops the chain (another browser's chain kept);
   a token rotated out twice is refused inside the later grace; a chain at 90 days less 1 ms signs in, at 90 days it is
   refused, its 89 rotated-out hashes with it.

*SameSite=Strict, not Lax* (W18.R9): for the `fetch` POSTs these routes take, Lax and Strict send the cookie in exactly
the same same-site cases and both withhold it cross-site, so Lax buys nothing and would loosen top-level navigations;
the merge controller suggested Lax and accepted Strict on this reason.

### 8.3 Sign-out: plain, or forget

`POST /account/logout` `{ ticket }` is the logoff of §5: the session ends, the token stays (the original's logoff kept
SAVE PASSWORD). It needs a live ticket (else -995) and never touches the cookie.

`{ ticket, forget: true }` reads the request's cookies (only then: the route parses the `Cookie` header for a `forget`
alone), drops the chain the presented remember cookie names -- by its live token or one rotated out of it -- and
answers `Set-Cookie` with `Max-Age=0` (`AccountService.signOut`), **whether the ticket is live or not** *(2026-10-11, F3
of SVC-03a's review; it first needed a live ticket, so on a shared computer whose session had ended the HttpOnly cookie
survived the sign-out)*. Holding the token is the authority to revoke it; SameSite=Strict and the Origin check keep the
request off other sites. With a live ticket the session's account's cookie is cleared, and the chain dropped when the
request shows it; status Success. With a dead ticket the account is read from each remember cookie's name
(`s2u_remember_<id>`) and the chain from its token's hash: every remember cookie the request carries is cleared and its
chain dropped (a token that is not the named account's drops nothing), and the status is -995, the logoff itself having
failed. A browser that keeps several personas' cookies and forgets with a dead ticket so forgets all of them, the safe
side on a shared computer. Sent without its cookies there is nothing to drop: with a live ticket the clear is still
sent; with a dead ticket and no remember cookie, nothing is set *(2026-10-11, N2 of the re-review: this read "the clear
is still sent" for both)*.

### 8.4 The store: schema 5, document version 4

Each token row gains its chain: `chain` (the SHA-256 of the chain's first token, 64 hex digits), `chainBorn` (ms) and
`retired` (the rotated-out hashes, oldest first; a JSON list in SQLite's `remember_tokens.retired`). The document's
version moves 3 -> 4 (`SERVICE_STORE_VERSION`), the database's schema 4 -> 5 (`SERVICE_DB_SCHEMA`; `SCHEMA_V5` adds the
three columns and fills them in the same step). The migration is research 131's and SVC-07's: a schema 4 database is
backed up to `services.v3.backup` at version 3 inside the open's write lock, then migrated once; a version 3 document
(a legacy `services.json`, a backup) is migrated as it is read (`migrateDocument`); in each, an existing token becomes
the first of its own chain -- `chain` its hash, `chainBorn` its `created`, nothing rotated out. The whole-document check
refuses a chain whose name is no hash, a `chainBorn` after its token's `created`, a rotated-out list that is no list,
longer than `REMEMBER_RETIRED_MAX`, or holding a hash any token holds, live or rotated out, on any account; a new or
rotated token's hash is refused (`taken`) the same way.

**How long a rotated-out hash is kept, and how bounded.** For its chain's life, and no longer: it goes with the chain
(the theft signal, the cap, the idle window, a forget, a password login shown the chain, a password change, the sweep).
A chain rotates at most once a day and lives at most 90 days, so it rotates at most 89 times and its list holds at most
89 hashes, under `REMEMBER_RETIRED_MAX` (90); were a clock set back, a rotation past the bound lets the oldest go (only
its theft signal is lost). At 64 hex digits each that is under 6 KB per chain. How many chains an account holds is not
bounded by this task: one per browser that saved its password, each expiring by its idle window or its cap -- at its
next presentation, or by `AccountService.sweep()`. *(2026-10-11, F4 of SVC-03a's review: closed, inside
`accounts.ts`.)* `sweep()` was on no timer (`main.ts:157` runs the services' `sweep`, which is `sweepSessions` only,
`bridge.ts:809`); `sweepSessions`, which that timer runs each second, now also runs `sweep()` at most once each
`REMEMBER_SWEEP_EVERY_MS` (an hour; the first an hour after the start), so a chain whose browser never comes back leaves
the store within an hour of its idle window's or cap's end. A sweep with nothing due writes nothing, and a refused one
is logged once and tried again an hour later; neither throws from the timer.

### 8.5 The contract for a client (the launcher's; written once here and in `accountHttp.ts`'s header)

1. **Sign-in with "remember me":** `POST /account/login` `{ name, password, savePassword: true }`, sent with fetch's
   credentials mode set to include. A success sets `s2u_remember_<account id>` (HttpOnly, Secure, SameSite=Strict,
   `Path=/account`, `Max-Age` 30 days); the body never carries the token.
2. **The quick sign-in, without a password:** the same route, `{ name, savePassword: true }`, credentials as in 1: the
   browser presents the cookie; Success with a ticket, and the cookie re-sent with a fresh `Max-Age`.
3. **The rotated cookie:** a quick sign-in 24 h or more after the token's issue answers with a new value in the same
   cookie; the browser replaces it. The old value is honoured for 60 s (answered with the newest; a retry that meets
   the lost reply's still-open session is answered -997 AccountLoggedIn with the newest as its cookie), then refused.
   A browser that never received the rotated cookie and did not retry within the 60 s is then a reuse: see 4. After
   a server restart inside the grace the retry is answered with no cookie (the newest was held in memory only: -997
   while the lost reply's session lives, else Success), and the browser's next try after the grace is a reuse: -978,
   the chain dropped, the password asked once *(2026-10-11, N3 of the re-review; §8.2 item 2 said it already)*.
4. **The refusal:** an idle, capped, rotated-out-and-reused or revoked token answers -978 InvalidPassword with the
   cookie cleared (`Max-Age=0`): the client asks for the password, once (for a reuse, the fail-safe of §8.2 item 2).
5. **The plain logout:** `POST /account/logout` `{ ticket }` ends the session and keeps the token; it needs a live
   ticket (else -995) and never touches the cookie.
6. **`forget: true`:** `POST /account/logout` `{ ticket, forget: true }`, credentials as in 1, clears the remember
   cookie and drops the chain the presented cookie names, whether the ticket is live or not: a live ticket, its
   account's cookie, status Success; a dead one, every remember cookie the request carries, status -995. Sent without
   the cookie there is nothing to drop: with a live ticket the clear is still sent; with a dead ticket and no remember
   cookie, nothing is set (N2, 2026-10-11). *(2026-10-11, F3: it read "drops this
   browser's token (its chain) and clears the cookie; without the cookie it is the plain logout", and a dead ticket
   forgot nothing.)*
7. **"Remember me" on by default is the client's** (the launcher's; the modern UI's `MU_REMEMBER_ME_ENABLED`): the routes
   take `savePassword` as before. **Same site only:** the client and the server on one host over HTTPS, or 127.0.0.1 /
   localhost locally; on another site SameSite=Strict keeps the cookie off and YES behaves as NO (§4).

### 8.5a Who uses which step (2026-10-17)

- **The console's sign-in** (OT.R61 (b), the console launcher plan's PERSONA-PERSIST (a)): steps 1, 2, 5 and 6, through
  `fetchAccountService`'s `AccountRequestOptions` (viewer `connectHost.ts`).
- **The original's LOGIN** (OT.R61 (a), SAVE-PASSWORD; research 153 §8): step 2 for a persona the card saved under SAVE
  PASSWORD: YES and not retyped (the record's length held as a stand-in, sent as the cookie in its place, whatever the
  strip says now), step 1 for a password typed under YES, and the plain login `{ name, password, savePassword: false }`
  with credentials omitted for one typed under NO (the merge controller's ruling: the cookie is never shown, so a
  remembered console sign-in on the account stays); step 5 at its logoff (`pageLoginService`,
  `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`). A -978 on step 2 shows the original's #545 and returns to the form with the
  saved password still drawn, as the original's PLAYERPASSWORD keeps it; the cookie is cleared, so CONNECT is refused
  again until the password is retyped -- as a wrong saved password is on the console. A quick sign-in by the cookie is
  a right secret for `SESSION_TAKEOVER_ADAPTATION` (`accounts.ts` :555-576; `sessionTakeover.test.ts` :120-131). A
  refused quick sign-in counts toward the attempt limit as a wrong password does (the review's F4, pinned in
  `accounts.test.ts`; the lockout kept by the merge controller's ruling): ten stale-cookie CONNECTs lock the name and
  the address for `LOGIN_WINDOW_MS_PLACEHOLDER`, the right password included (research 153 §5a).

### 8.6 Not tested here

- **A `Secure` cookie on plain-HTTP loopback** (`REMEMBER_LOOPBACK_SECURE_COOKIE_READING`, §7): whether a browser keeps
  a `Secure` cookie set by `http://127.0.0.1` or `http://localhost` is the browser's behaviour, not tested here (no
  browser run in this task); where it does not, a local launcher over plain HTTP gets YES-behaves-as-NO, as a page over
  plain HTTP on a LAN address does (W18.R9).
- **Safari's cap** on a cookie whose host resolves to another network than the site's (§4) stays the deployed hosts'
  check.
- **Evidence kinds:** unit tests on a fake clock (the service, the route over a local socket, the store, the migration);
  no browser run, no physical playtest, no capture (there is no original to capture).
