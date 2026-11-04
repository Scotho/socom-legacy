# 159 -- The bridge up to the match's start: a game is a match room, seated by accounts, launched (SVC-07a)

Written 2026-10-05 for SVC-07a (`../roadmap/06-online-services.md`, "SVC-07a -- The bridge up to the match's start"),
wave 2 of sprints 16 and 17 (`../plans/2026-10-02-online-path-target.md`, OT.R16, OT.R21, OT.R22; OT.R6-OT.R8). It
stands on research 154 (SVC-06: the room service and its endpoint, §4 and §10 "owed to SVC-07a"), 132 (SVC-03: the
accounts, the login's ticket), 131 (the store), 133 and 156 (how the texts and the invitations are mounted), 91 (the
round; §17 the abandon, §18 the lobby's clocks, §19 the classic room), 95 §4.1 (the lobby's clocks as the ARMORY sees
them) and 128 §4.11 (`dlgGameLobby`), and does not restate them; 155 §4.1-4.2 (the results the later bridge hands
over) is left room for, not built. Sources: the retail decompilation r0001 (`D:L<line>`, `FUN_<addr>`; cited, never
pasted), the retail ELF's strings (`S:0x...`), the US disc's `dlgGameLobby.rdr` layout and set through
`tools/dump-dialogs.ts --dialog dlgGameLobby.rdr --tree` and its `UIMnLOC.rdr` (`@s2u/scene` `parseLocTable`), and our
Horizon's sources read as files at the `ref/desktop` pin (`desktop@be557831:server/horizon-server/...`; `MLS.cs` is
`Server.Medius/Medius/MLS.cs`, `ClientObject.cs` `Server.Medius/Medius/Models/ClientObject.cs`, `AppSettings.cs`
`Server.Medius/Config/AppSettings.cs`). **No server was contacted** (R293); no game was run.

The code: `packages/central/src/bridge.ts` (`GameBridge`, `createServices`), `gameLobby.ts` (`PreMatch`), and changes to
`lobby.ts` (SVC-06's review items, OT.R21, the events, `keepsGame`), `lobbyHttp.ts` (`bearerIdentify`, three paths),
`accounts.ts` (the session's bearer), `room.ts` (a game's room), `server.ts` (the `games` hook), `main.ts` (the mount),
`packages/viewer/src/net/protocol.ts` (additive: the hello's `game` and `ticket`, three requests, `gameLobby`),
`client.ts` (the `game` option) and `lobby.ts` (`switchTeam`). The tests, all under `packages/server/test/`:
`lobbyBridge.test.ts`, `sessions.test.ts`, `lobbyHttpBridge.test.ts`, `gameLobby.test.ts`, `roomLaunch.test.ts`,
`bridge.test.ts` (real sockets and HTTP on the fixtures' MP2), `mainServices.test.ts` (`main.ts` itself, started).
Confidence: every transcription here is **reading, pending review**; the proven level is ONL-32's transcripts.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R159.1 | **Nothing tied a request or a socket to an account**: SVC-03's login answered a ticket the socket was to claim once within 60 s, and nothing was mounted | the ticket is the session's bearer: `Authorization: Bearer <ticket>` on `/lobby/*`, `ticket` in the match socket's hello; the account's name comes from the store | §1 |
| R159.2 | **The host's world report is the original's registration**: the host posts WorldReport0 every 25 s (every 5 s until it has a map) with the game's name, MinPlayers 2, MaxPlayers (players + spectators), GameLevel (atoi of the map stem past "MP"), RulesSet (bit 1 `mp_allow_respawn`, bit 0 `mp_friendly_fire`), GF1-GF3, GameStats and the world status -- closed when ending, staging in the game lobby, active after (`FUN_002ef590` D:L191321-191411) | the page posts the report's fields once it has a map; the server makes the room and from then reports the world status and the spectators itself | §2 |
| R159.3 | **CREATE GAME's name and the report's are one variable**: both read the UI string at `DAT_0044f434`, "testgame" when none (`FUN_002edda0` D:L190531-190533, D:L190564-190566; `FUN_002ef590` D:L191356-191358, D:L191370); the s4 report's `test$~Channel 1` was therefore the create's name too | ONL-13 sends `<name>$~<room>` on both | §3.3 |
| R159.4 | **Respawn is RulesSet bit 1 of the report**, never in CreateGame1 (which sends RulesSet 0, D:L190575) nor in GameStats (`FUN_002f7c40` D:L196715-196755: rounds, minutes, spectators, slots, EQlimit, sort order, rank bits, the play list) | OT.R21: a create or report with bit 1 is refused (`RESPAWN_REFUSED_STATUS_PLACEHOLDER`) | §3.4 |
| R159.5 | **The original's launch is the host's**: READY toggles a seat's minor state (`FUN_002c3fc0`), at most once per 5 s, after a 30 s gate; every player ready with both sides seated launches at once; 80% ready starts an 11 s countdown; the host's force launch is that countdown | `PreMatch`; our server's dedicated rooms keep the owner's 10 s from both sides seated -- a game's room does not (OC-5, H90) | §5 |
| R159.6 | **Lobby 0x49 has no reply, Lobby 0x86 none from our Horizon** | both answer 204; the page waits for neither | §4 |
| R159.7 | **A launched game's room carries the match**: on the console the host carries it and the DME migrates it to a new session master (`Session_master_migration`); Horizon ends a game with its host | a launched game plays on through its host's leave while seated (`LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`); fewer than three left abandons it, as the original (`FUN_002bc530`) | §2 |

## 1. Identity: the session, the seat, the name (OT.R22)

**As found.** `AccountService.login` answered a 32-byte random ticket and kept the session in memory; `claimTicket`
took it once within `SOCKET_TICKET_MS` (60 s, a server policy); nothing called either, and neither `/account/*` nor
`/lobby/*` was mounted (research 132 §6, 154 §4).

**Built** (`accounts.ts`, `lobbyHttp.ts`, `bridge.ts`, `main.ts`):

- `sessionOf(ticket)` names the live session's account and the account's own name from the store; every use restarts
  its idle clock. `bearerIdentify` reads it from `Authorization: Bearer <ticket>` only -- never a cookie, never a body
  (a body's `accountId` is ignored: `lobbyHttpBridge.test.ts`).
- `attach(ticket)` / `detach(ticket)`: a match socket's hello holds the session; while any socket holds it, it never
  idles out; the last close starts its clock again from then.
- A session no socket holds ends `SOCKET_TICKET_MS` after its last use (the login, a lobby request, a socket's close);
  `sweepSessions` runs once a second from `main.ts`. A page in a briefing room keeps its session by its requests; the
  keep-alive is `/lobby/update-user-state` (§4), a browser adaptation (the console holds a TCP session; Horizon times a
  silent client out after `ClientLongTimeoutSeconds`, 300 s, `AppSettings.cs:101`, `ClientObject.cs:151-153`).
  **NU-16b, 2026-10-15** (the merge controller's word, option (a)): an account's session no socket holds and none
  claimed now ends `SESSION_SILENT_MS_READING` (300 s, Horizon's figure above, recorded as a reimplementation's; §8)
  after its last use, not `SOCKET_TICKET_MS`; a guest's (FG-28) keeps 60 s. The owner's invitee's window, frozen by the
  browser after a match, had been logged off 60 s after its last request (research 157 §11,
  `KEEPALIVE_HIDDEN_TAB_READING`). The page logs its session off at a non-persisted `pagehide` with the logout sent
  `keepalive` (viewer `connectHost.ts`, `PAGEHIDE_LOGOUT_ADAPTATION`), so a reload is not answered -997 for the 300 s
  -- the transport is built, and the `pagehide` listener (`frontEnd.ts`, the gameplay lane's file) was cleared by that
  seat and applied at addee21d5.
  **SESSION-TAKEOVER, 2026-10-15** (the owner's word, in the merge controller's seat): that logout is best-effort (a
  whole-browser close, a crash, a phone backgrounding, sleep, a back/forward-cache keep lose it), and the owner met -997
  on reopening the browser. A login whose secret is right -- a password (typed or browser-filled) or a remember token --
  for an account holding a
  session no socket holds (`sockets === 0`: no match socket, no map seat; the lobby page holds none, it renews by
  requests) now ends that session, told as an expiry is told (`onEnd`: the room service's logoff, the maps' seat, chat
  and friends forget it; its row dropped with the sweep's batch), and logs in; one a socket holds is still -997.
  `SESSION_TAKEOVER_ADAPTATION` (`accounts.ts`), a service adaptation (§8, below the table). The displaced ticket's next
  `/lobby/*` request is a 401 carrying `{ reason: 'taken-over' }` (`SESSION_TAKEN_OVER_REASON`, remembered in memory one
  per account until that session's absolute end; `bearerIdentify` notes it, the lobby endpoint answers it), so its page
  says the account signed in elsewhere beside the original's state 2 dialog (research 157 §6 item 3). A claimed session
  (`claimTicket`) is taken over the same way. Read in the code at the takeover: `expireTickets`'s idle rule does skip a
  claimed session (`!s.claimed`), so one would end only at `SESSION_ABSOLUTE_LIFETIME_MS` -- but no production path
  calls `claimTicket` (the bridge holds a session by `attach` / `detach`, which leave `claimed` false), so after a match
  a session idles on `SESSION_SILENT_MS_READING` from its socket's close, as `sessionSilent.test.ts` holds.
- Every end of a session -- a logout, its expiry -- is told (`onEnd`), and `createServices` logs the account off the
  room service (`RoomService.logoff`): its seat goes, every game it hosts ends (unless kept, §2). **A second login of
  one account** stays AccountLoggedIn (-997, MP_PLAYER_LOGGED_IN, UIMnLOC 543) while the first lives with a socket
  holding it (SESSION-TAKEOVER, above: a first session no socket holds is taken over), as SVC-03
  transcribes the console's login callback (`FUN_002eefa0` D:L191163-191182); once the first has ended -- and been
  logged off -- the second succeeds. This is the reading of the review's "logoff on a second login": the first
  session's end, which a second login can only follow, calls `logoff` (`sessions.test.ts`).
- The hello's `game` with its `ticket`: the bridge attaches the session, requires the account's seat in that game (made
  by `/lobby/join-game` first), and seats the page in the game's match room under the **account's name** (the hello's
  `name` is not read; the room refuses `name` events: `fixedNames`) and as the seat's join type (the hello's `watch` is
  not read). The account's second socket in its game (a reload, a second tab) takes the seat over in place: each
  account's every socket in a game says hello under the server's own room token for it (`LiveGame.tokens`, never the
  page's), so the room's takeover (S2 round 4, `Room.hello`) hands the newer socket the seat whole -- the player, its
  side, its name, its game-lobby READY -- and closes the older (4006); nothing leaves, so nothing is abandoned or ended
  (the review's fix round, B3; under a classic round in play the newer socket is the room's reconnect, a ghost until
  the next round, as every takeover). A seat given in a game that ended before the page was seated is closed (4007)
  and its session detached: no page is held in a dropped room.
- A socket's close frees its seat in the room service; the host's close ends its unstarted game (`gamesHostedBy`).
- **HARD-SEAT, 2026-10-04 (research 169 measure 1).** A **maps' hello that carries a ticket** is the account's too
  (`GameBridge.mapSeat`, `server.ts`): seated under the persona name and the server's own room token for the account in
  that room (so its second socket there takes the seat over, 4006, as in a game); a `name` event from that seat is
  dropped; a ticket that names no live session is refused (`not logged in`), never seated as a guest. **One live seat
  an account across every room**: a hello in a maps' room while the account is seated in a game's room, or in another
  maps' room, and a game's hello while it is seated in a maps' room, are refused (`already seated`,
  `ALREADY_SEATED`). A hello without a ticket is a guest's, allowed in the maps' rooms only, where no result counts
  (`GUEST_SEATS_IN_UNCOUNTED_ROOMS_DEFAULT`, true, an owner's default under OT.R26); a game made through the list
  takes none. A session's end (logout, idle, absolute) closes its maps' seat (4008), as the room service's logoff
  closes its game's. A session also ends `SESSION_ABSOLUTE_LIFETIME_MS` (12 h, an owner's default) after its login,
  whatever holds it. A watcher's leave never ends a launched game (the `player &&` gate in `leave`, now held by
  `accountSeat.test.ts`). The page's game socket stops on 4006 / 4007 / 4008 / 1011 instead of retrying (the review's
  N-1: two tabs of one account no longer take the seat from each other for ever) and hands the front end its dialog
  (§8, the research wave's card C7: #528 for a game ended, 4007; #365 for the others and a kick that is not a vote;
  #539 for the vote kick only).
- **HARD-SEAT's review fix round, 2026-10-04.** A game hello waiting on its room's load is a hold the maps' side sees
  (`GameBridge.gameJoins`, from the checks to the seat given or refused), and after the load the join re-checks the
  session (`SessionKeeper.isLive`), the account's game and any maps' seat; a maps' hello whose room loads after its
  session ended, or after the account sat elsewhere, is closed at once (4008), never left seated untracked. A hello the
  server fails to answer closes `JOIN_FAILED_CLOSE` (4010, `net/protocol.ts`), retried by the page, not 1011, which
  stays the room's own failure. A game's socket opens only a `pinnedMatchSocket` URL; `NetPage` refuses any other
  (`accountSeat.test.ts`, `netPageGame.test.ts`).

**What a modified page can still do through this bridge** (plainly, for research 169 / OT-13): it holds its own ticket
and may use it as any page would, so everything below is the account's own reach, not another's.
1. Send any request the client could send, in any order and as fast as the endpoint answers: there is **no per-account
   request rate** on `/lobby/*` (SVC-03's limiter counts login failures inside `AccountService` and cannot be shared;
   owed to SVC-23, §6).
2. Post a world report with values the screen would never make -- any GameStats bytes (rounds and minutes up to 255,
   rank bits, a play list), any GF2/GF3 -- within the checks (the field fits, OT.R16's maps, OT.R21's respawn, GF1 the
   room, the statuses); the server's own world status and spectator byte overwrite the page's.
3. Toggle READY, ask SWITCH TEAMS and launch as the buttons would, but without the screen's disabled states: the server
   holds the gates (READY's 30 s and 5 s, the switch's 5 s, the host-only launch, the sides), not the page.
4. Keep its session alive indefinitely by keep-alives -- since SESSION-TAKEOVER (§1) holding its account "logged in"
   (-997) against its own other devices only while a socket holds it (a match socket or a map seat; a login with the
   right secret takes over a session held by keep-alives alone) -- and hold one game per host account (`GAMES_PER_HOST_PLACEHOLDER`), each create ending its previous.
5. Spend the server's work: each world report naming a map loads it (a map's parse is shared and kept per process).
What it cannot do: act as another account (the ticket is 256 random bits from the CSPRNG, known only to its login's
answer), name its seat, sit in a game it did not join, report another's game, or launch another's.
**The ticket is a bearer**: anything that reads it (a page script on the same origin, an extension, a log) can act as
the account until the session ends; it is never logged by the server (the log lines name the operation, the status
and the address), and it travels in the WebSocket's first frame, not its URL.

## 2. Registration: the game in the list is its match room

**What the original's host sends, and when** (`FUN_002ef590` D:L191321-191411; the s4 slice's line 14): WorldReport0
with the game's name (the UI string `DAT_0044f434`, "testgame" when none, D:L191356-191358, D:L191370), MinPlayers 2, MaxPlayers
`MaxPlayersValve` + `MaxSpectatorsValve` (8 when unset, D:L191359-191364), GameStats from `FUN_002f7c40`, GameLevel
the map stem past "MP" by `atoi` (0 with no map, D:L191385-191390), RulesSet (D:L191375-191384), GF1 the room
(`DAT_0066a538`), GF2 `DAT_0066a838` (65000), GF3 the clan value (`FUN_002e99f0`), and the world status: 3 (closed)
when its caller asks, else 1 (staging) while the game state +0x113 is 1 (the lobby), else 2 (active)
(D:L191397-191407). It answers its next delay: 25 000 ms, or 5 000 while it has no map (D:L191391-191393).

**Here the server is the host's reporter** (`bridge.ts`): the host's page posts the report's fields once
(`/lobby/world-report`; never the world status, which is 400); the room service checks them as the create (research
154 §6: the fields' fit, OT.R16's maps by GameLevel or GameStats byte 8, GF1 the room, a rename onto a live name) and
OT.R21's respawn; the first report naming a map makes the game's match room (`MatchServer.makeRoom`: the map's parse
shared as the maps' rooms share it), and from then the bridge reports at each change -- world status staging once the
room is loaded, active at its first round; GameStats byte 3, the spectators in the game, from the room (`FUN_002f7c40`
D:L196729 writes the host's own count there). The list's player count is the room's players and watchers
(`livePlayers`), so IN and SPEC (`gameListColumns`, B_43's columns) are the room's. A game is unlisted until its room
is loaded, as Horizon creates a game pending and lists staging and active ones (research 154 §4). Once made, the
room's map is fixed (`REPORT_MAP_CHANGE_PLACEHOLDER`).

**The room is made with the game's limits** (`roomOptions`): classic (OT.R21: the original's game type,
`RESPAWN_RULES_ENABLED` off); held for the game lobby's launch; the accounts' names; players its IN MAX
(`playerSeats`: min(MaxPlayers - slots, 16)), watchers its spectator slots (byte 4); `mp_max_rounds` and
`mp_max_round_time` from bytes 1 and 2 (D:L196725-196728), the server's defaults where 0.

**A room ends -> the game leaves the list**: before the launch, the host's socket closing (or its BACK, or its logoff)
ends the game (Horizon's rule); after it, the room's last seat leaving ends it; a player's leave -- any leave, a side
emptied or not (the fix round, B2) -- that leaves fewer than three players abandons it (a departure is a leave: `FUN_002bc530` D:L161109-161146, below three only a late joiner's console, +0xcc, D:L161137-161141; research 315 §3.3, §12.1; `dlgNetAbandoned`; `ABANDON_BELOW_PLAYERS_READING`) -- the
others' sockets are closed (4007, `GAME_ENDED_CLOSE`). A launched game whose host leaves with three or more left plays
on (`LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`); one whose side empties with three or more left goes back to its lobby
(`ABANDONED_TO_LOBBY_PLACEHOLDER`). The room service tells the bridge each seat freed and each game ended as it
happens (`LobbyEvent`): no polling.

*(2026-10-04, S17-SERVER, SVC-07b: the host handed on before the launch.)* The host's leave before the launch no longer
ends the game. The original hands the host's role on with no message: `dlgGameLobby.rdr`'s `Session_master_migration`
gives the new session master the host's buttons (`Lock`, `OnStartGameLock`, `Watch45SecClock`) and carries no message
id (the research wave's C7 card §1.4, confirmed by C8 Q4). A console becomes the master when its own client index
(`FUN_0030d560`) equals the session's master index (`FUN_0030d5a0`) (`FUN_002bc080` D:L160972-160977; the session's
start sets it the same way, D:L158860-158864). The network library chooses that index, and nobody has decoded how, so
the next player by join order takes the role (`HOST_SUCCESSOR_READING`, `bridge.ts`). Watchers never take it.
`RoomService.hostGone` runs on the host's BACK (`/lobby/leave-game`), its logoff and its socket's close. It moves the
record's `hostAccountId` and raises the `host` event. The bridge then moves `PreMatch`'s host (`setHost`: the star in
`gameLobby`, the host's launch) and closes no page. The new host's world report is taken (the settings; the room's
map stays fixed) and the old host's is refused. The game stays listed. GameList_ExtraInfo0's entry carries no host
name (0xeb, research 154 §2), so "listed under the new host" means the record's host and the lobby's star. The game
ends only when no player is left. After the launch (world status active) today's rule stands: `keepsGame`, and the
abandon below three (`ABANDON_BELOW_PLAYERS_READING`). Tests: `test/hostHandover.test.ts` (the room service, `PreMatch`,
and two cases over real sockets), with `bridge.test.ts`, `lobbyBridge.test.ts` and `lobby.test.ts` changed to the
new rule.

*(2026-10-04, S17-SERVER, the review's two findings.)* (1) A successor never hosts two games. The console is in one
game at a time, so when the role passes to an account that also hosts another game it is not seated in (one it
created and never entered), that game is left as a host leaves it: handed on to its own next player, or ended with no
player in it. A host's next create (`GAMES_PER_HOST_PLACEHOLDER`) likewise hands its unstarted game on instead of ending
it under its seated players. Only a game with no player to take it ends, and only that one frees its name and its
place in the room. (2) The successor is preferably a player whose page is seated in the match room (the bridge's
`hasSeat`, the room service's `liveSeat`). The lobby's join order is used only when no player is seated, so a member
whose page never said hello cannot hold a role it could neither show nor use. Tests: four more in
`test/hostHandover.test.ts`, the reviewer's probe sequence among them.

*(2026-10-21, LATER 225, the gameplay seat: a placed game's host freed before its door; reading, pending review.)*
**The original, re-read at the source.** The console makes no hand-over of its own. `dlgGameLobby.rdr`'s
`Session_master_migration` (P:L7437-7461 of `tools/test/onlineDialogs.pinned.json`) only waits until its own console is
the session master, then gives it the host's buttons. A console becomes the master when its own client index
(`FUN_0030d560`) equals the session's master index (`FUN_0030d5a0`): `FUN_002bc080` D:L160971-160977. The leaving
master's own leave (`FUN_0027e420`, `DisconnectFromGameServer`, research 266 §8.10.2) tells the lobby the game is over
only when it is the session's last client (D:L126438-126440). With others in the game, its leave ends nothing and the
game goes on under a new master. Which console that is, and when, the network library and the server decide; neither is
on the console, and neither is read (`HOST_SUCCESSOR_READING`, settled by the same capture as before: a host leaving a
lobby of three). The console's code shows no state in which a game's host is a member outside its session (the port's
host who never reached the door). What the original's server did with such a game is not read either; the same capture,
with its host backing out before the session, would settle it.

**The port.** The unplaced path already hands such a game on, for a host seated in it or not (`RoomService.hostGone`;
finding 1 above). Under the split, central frees a placed game's host seat (`seatFreed`) and leaves the hand-over to
the game's match server (SA.R13; `hostGone`'s `placed`). Until LATER 225, the match server's `seatFreed` only closed
the socket of the seat it freed. A host with no socket there (its BACK before the door; LATER 224's unseen-unseat)
therefore handed nothing on, and nobody seated could launch. Since LATER 225, `MatchGame`'s `seatFreed`
(`packages/match/src/game.ts`) runs `hostGone` for the unlaunched game's host when it holds no socket there. The pick is
a seated host's leave's: the first player in central's join order seated here, else the first player member; never a
watcher, never the leaver; with none the game ends (`host-gone`). Central is told (`hostHandOver`, mirrored by
`RoomService.mirrorHost`). A seated host's own socket close still hands the game on, once. A launched game's host freed
hands nothing on (`LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`). No value changed: the placed path now does what the
unplaced path does. Tests: `packages/match/test/matchGame.test.ts`, the three "LATER 225" cases. LATER 224's host
exemption (`Placement.onReport`, `packages/central/src/placement.ts`) stands: its file is claimed by another lane
(HANDOFF §3, SA-38), so lifting it is left to a later change.

**The rooms per map of today** (a hello by `map`, the test room's `?mp`) are unchanged: a hello without `game` never
reaches the bridge, `/rooms` lists only them, and `bridge.test.ts` holds one such join.

**Left room for the results bridge** (research 155 §4.1-4.2): `onRoundStart` is told each round's start; the room's
`roundOver` and its scores are where SVC-12d's counters will be read; nothing is enqueued yet.

## 3. SVC-06's round-2 review list, where it is the bridge's

| finding | answer | test |
|---|---|---|
| players not capped at MaxPlayers minus the spectator slots | `playerSeats` caps the players' joins at min(MaxPlayers - slots, 16) (`FUN_002e2ce0` D:L184423-184426); SVC-06's full-game test now sends MaxPlayers 10 (2 players + 8 slots), as the client counts it (D:L190542-190550) | `lobbyBridge.test.ts` |
| a closed game joinable by id, found by name ahead of the live one | JoinGame on a closed world is GameNotFound; FindWorldByName skips a closed or inactive world | `lobbyBridge.test.ts` |
| games end without the bridge being told | `LobbyEvent` (`unseated`, `ended`), raised as it happens; a session's end logs off (§1) | `lobbyBridge.test.ts`, `sessions.test.ts`, `bridge.test.ts` |
| the host-moves test holds nothing | pinned: the host seated in another's game creates its own; the old seat goes only when it joins its own; the other game lives on | `lobbyBridge.test.ts` |
| CREATE GAME must carry the `$~<room>` name | §3.3 | `lobbyBridge.test.ts`, `bridge.test.ts` |
| the two session posts (0x49, 0x86) | §4 | `lobbyHttpBridge.test.ts`, `mainServices.test.ts` |
| the endpoint's hardening before the mount | the mount uses `bearerIdentify`; the Origin check, the body limit (4096), the page bounds and one game a host stand; a request rate is owed (§6) | `lobbyHttpBridge.test.ts` |

### 3.3 The `$~<room>` name -- what ONL-13 sends

CreateGame1's name and the world report's are read from the same UI string (R159.3), so the s4 report's
`test$~Channel 1` was its create's name too: the suffix is in the variable before the create. Which code appends
`$~<room>` to the typed name is not traced (the `$~` text is not a string of the ELF's strings dump: it is built,
research 154 §8). **ONL-13 sends `gameName: "<typed name>$~<the room's name>"`** on `/lobby/create-game` and the same on
`/lobby/world-report` (`test$~Alpha` in a room "Alpha"); the list's row draws the name up to `$~` (`drawnName`), so the
row reads "test". Uniqueness is of the whole name (research 154 §7), so two rooms may each hold a "test".

### 3.4 OT.R21: respawn refused

The report's RulesSet bit 1 is `mp_allow_respawn` (S:0x3f4b30), bit 0 `mp_friendly_fire` (S:0x3f4b50)
(`FUN_002ef590` D:L191375-191384; the same computation `FUN_002ef9f0` D:L191496-191512). The client's CreateGame1 sends
RulesSet 0 (D:L190575), so only a modified page asks at the create; ONL-13's screen asks through the report. Both are
refused with `RESPAWN_REFUSED_STATUS_PLACEHOLDER` (Fail, -966): cbCreateGame draws any failure but GameNameExists as
MP_MEDIUS_JOIN_GAME_FAILURE (`FUN_002ee090` D:L190605-190614), the original's nearest; a report has no reply on the
console, so ONL-13 must read the endpoint's status. Friendly fire alone is taken.

*(2026-10-18, FRIENDLY-FIRE, web sprint 41; reading, pending review.)* Taken, and now passed on: until today the
record kept RulesSet bit 0 and `roomOptions` dropped it, so every lobby game's room refused friendly damage whatever
its host chose. `roomOptions` now passes `allowFriendlyFire` from the game's RulesSet bit 0 (`mp_friendly_fire`,
`FUN_002ef590` D:L191375-191384), read once at the room's make -- at the host's first report naming a map, which
carries the bit (`gameLobbyCommands.ts` `report`). A later report's flip changes the record and not the room (a known edge, not
refused; research 219 s5 says why the original cannot reach it). Off when no report set it (CreateGame1's RulesSet 0,
D:L190575).

*(2026-10-04, S17-SERVER: the three maps and the standard rules, OT.R32 H90.)* `FIRST_RELEASE_MAPS` (`lobby.ts`: MP2
Frostfire, MP51 Vigilance, MP72 Crossroads, OT.R16; MP7 Night Stalker the fourth since 2026-10-12, OT.R45, MAPS-4) now holds in the room service whatever the `MAPS` allowlist says,
including when it is empty. A create, and every world report naming a map by GameLevel or GameStats byte 8, is refused
on any other map with `MAP_NOT_OFFERED_STATUS_PLACEHOLDER` (Fail). The bridge's launch follows from the report only:
a refused report makes no room. This respawn refusal is the standard-rules rule, and it covers both paths that carry
RulesSet: the create, and the report, the bridge's included (`worldReport` goes through `reportGame`). The bridge's
own reports send no RulesSet, and a game's room is always made `classic` (`roomOptions`). The status the original
shows for both refusals is read in research 154 §8's row (#295). Tests: `test/firstReleaseMaps.test.ts`.

## 4. The API the pages call, call by call

All POST, JSON, the page's `Origin` among `ALLOWED_ORIGINS`, mounted only with `DATA_DIR` (`main.ts`). `T` is the
login's ticket.

- **ONL-07 (connect)**: `POST /account/login` `{ name, password, savePassword }` (or the remember cookie, research
  132) -> `{ status, ticket }`; status 0 keeps `ticket` in page memory (never stored, never logged). `POST
  /account/logout` `{ ticket }` at LOGOFF (ONL-10) ends the session (the room service logs the account off).
- **Every lobby call**: header `Authorization: Bearer T`; no live session is 401 (the page goes back to LOGIN). Keep
  the session while idle: `POST /lobby/update-user-state` `{ userAction: 1 }` (JoinedChatWorld, as the room entry posts
  it) or any later call, within 60 s (`SOCKET_TICKET_MS`) of the last; answers 204.
- **ONL-11 (the rooms list)**: research 154 §4's calls, with the bearer; on entering a room, beside the filter, the
  two session posts as the client makes them (`FUN_002efc80` D:L191614-191667): `/lobby/update-user-state` `{ userAction:
  1 }` before it and `/lobby/version-server` `{}` after it -- both 204, no body, nothing to wait for (Lobby 0x49 has no
  reply; our Horizon answers 0x86 with nothing, `MLS.cs:4073-4077`).
- **ONL-12 (the briefing room)**: `/lobby/game-list` `{ pageId: 1, pageSize: 256 }`; each entry's `gameListColumns`
  (IN / SPEC now the room's), its map `levelStem(gameEntryLevel(entry))`; `worldStatus` 1 staging, 2 active (a late
  joiner: ghost or spectator, UIMnLOC 352-353).
- **ONL-13 (CREATE GAME)**: `/lobby/create-game` with CreateGame1's fields (`gameName` `<name>$~<room>`, `rulesSet` 0,
  `maxPlayers` players + spectators), then `/lobby/join-game` `{ mediusWorldId, joinType: 0, gamePassword }`, then
  `/lobby/world-report` `{ mediusWorldId, gameName, minPlayers: 2, maxPlayers, gameLevel, rulesSet, genericField1,
  genericField2, genericField3, gameStats }` (never `worldStatus`) -- `{ status: 0 }`, or -966 (map not offered,
  respawn, not the host, a field) -- then opens the match socket (ONL-16a). JOIN / WATCH GAME: `/lobby/join-game` with
  join type 0 or 1, then the socket. BACK from the lobby: `/lobby/leave-game` `{}` (the bridge closes the socket, 4008).
- **ONL-16a (the game lobby)**: `new NetClient({ url, map, name, game: { id: mediusWorldId, ticket: T }, ... })` -- the
  hello carries `game` and `ticket`. Refusals (`refused` then close 4003): `not logged in`, `no such game`, `no seat in
  that game`, `the game has no room yet`. Then `welcome` (its `name` the account's; the host's `team` SEALs) and
  `gameLobby` events on each change: `seats` (`id` the room's, `name`, `team` or null, `ready`, `host`, `readyIn` whole
  seconds), `countdown`, `launched`, and to a refused requester `refused` (`gate`, `repeat`, `spectator`, `launched`,
  `host`, `sides`). The page sends `{ type: 'lobbyReady' }` (READY, a toggle), `{ type: 'switchTeams' }` (SWITCH TEAMS:
  the page takes its new side from its `gameLobby` seat) and `{ type: 'launch' }` (the host's launch; again with more
  than 5 s left calls the countdown off). The room's `countdown` event carries "GAME STARTS IN n SECONDS"; the launch is
  the room's `roundStart` to every seat. A closed socket: 4006 replaced by the account's newer socket (a reload),
  4007 the game ended (the host left before the launch, fewer than three left, or its room failed), 4008 the seat
  freed. The `/ws` upgrade itself is refused 403 from a page origin not in `ALLOWED_ORIGINS` when that is set.

## 5. Readiness and launch: the original's game lobby, transcribed

`dlgGameLobby`'s set (`tools/dump-dialogs.ts --dialog dlgGameLobby.rdr --tree`): ONSTART runs `Session_master_migration`
(`IsSessionMaster`; for the master `EnableButton(Lock)`; `Watch45SecClock`), `Enable_SM_Launch` (the buttons by
`IsSessionMaster` and `IsSwitchTeamsOK`; `ArmButtonClock`; locs 350-353), `check_loop` (`AdvanceMPMission`,
`CheckForcedLaunch` in a loop until `mp_major_game_state` 2, then `SWITCHMENU(LOAD_SCREEN)`; `CountDown`, locs 354-355),
`FromBriefing`; READY's CROSS runs `ready_anim` (`ReadyToLoad`, `CycleReadyButton`); SWITCH TEAMS' runs
`switch_teams_anim` (`SwitchSides`, `CountButtonFiveST`); MP_EIGHTY_READY runs `launch_10sec_anim` (`ForceMPLaunch`;
loc 356); ARMORY's runs `goto_eq_mp_set_return_valve`; `ArmButtonClock` keeps ARMORY off 10 s (`TenCountWS` 10..1,
research 95 §4.1). The texts (UIMnLOC): 347 READY, 348/349 the hint, 350 "The READY button will be available in 30
seconds. There must be players on both teams to launch.", 354/355 "GAME STARTS IN" / "SECONDS", 356 "There must be
players on both teams to launch.", 359 "Launch all players, ready or not.", 367 "Team Assignment Error."

| rule | the original | here (`PreMatch`, `Room`) |
|---|---|---|
| who decides | the session master's `FUN_002c3cf0` (D:L165312-165395) over every slot's record: major state +0x40, minor +0x41 (2 READY), posted by each client (`FUN_002c5360` D:L166181-166213) | the match server for every game (`bridge.ts`) |
| READY gate | `AdvanceMPMission` sets the lobby deadline to now + 30 s, 45 s after a match (`mp_game_over`; D:L123857-123862); `CheckForcedLaunch` counts it down into `mp_45_sec_clock` (D:L125682-125729) | 30 s from each seat's entry (`READY_GATE_MS_READING`); the 45 s lobby after a match is not on the path |
| READY | a toggle of the minor state 1 <-> 2 (`FUN_002c3fc0` D:L165402-165406), at most once per 5 s (`FUN_0027caf0` D:L125601-125611) | the same (`READY_REPEAT_MS_READING`) |
| launch | every player ready (the slots not flagged 0x10000, D:L165461-165490) and both sides seated (`mp_team_unbalance` 0, D:L165328-165352): major state 2 at once (D:L165373-165384) | the same: `Room.launch(0)`, round 1 for every seat (`READY_SEATS_READING`), a running countdown cut short; `PreMatch` is launched only when the room starts round 1 (the fix round, B1) |
| 80% | no countdown, not all ready, both sides seated, ready >= 0.8 x players, no clan game: MP_EIGHTY_READY (D:L165503-165507) -> `ForceMPLaunch` | the same (`EIGHTY_READY_FRACTION_READING`) |
| countdown | now + `mp_x_sec_clock` x 1000 (`FUN_002a6b90` D:L149005-149009), the valve 11 (research 95 §4.1, 91 §18.1); all ready during it launches at once (D:L165461-165462, D:L165509-165511); at its end the host launches (`FUN_0027cbf0` D:L125783-125785) | `LAUNCH_COUNTDOWN_S_READING` 11 on the room's clock (`Room.launch(11)`, the `countdown` event) |
| countdown off | `ForceMPLaunch` again with more than 5 s left (`FUN_0027d070` D:L125806-125810) | the same (`FORCE_CANCEL_MARGIN_MS_READING`) |
| side emptied in it | `mp_team_unbalance` held 0 while it runs (D:L165348-165352): it launches anyway | called off (`COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER`) |
| host's launch (359) | the hint of a `Lock` button `Session_master_migration` enables for the master; the layout has no `Lock` control | the countdown, the host only, after its gate (`HOST_LAUNCH_READING`) |
| SWITCH TEAMS | once per 5 s (`FUN_0027d100` D:L125824-125828); the host moves the slot to the other side when it has fewer than 8 (`FUN_002c4290` D:L165538-165568); `IsSwitchTeamsOK` refuses clan types 1, 2, 4 (`FUN_002f8ce0` D:L197459-197476; clan games parked, OT.R6) | the same (`SWITCH_REPEAT_MS_READING`, `Room.switchTeam`, `Lobby.switchTeam`); READY kept |
| the host's side | the host takes the SEALs (`FUN_002c5450` L166238-166262) | the hello's `host` (`Lobby.join`) |
| idle kick | none (V22) | none while the room waits (`heldLaunch`) or holds round 1 for the load, its idle clock held with it; W3.R13's in the match from round 1's start, as every room (OC-5; 2026-10-07: the clock had run on through the wait, so a seat 4 min in the game lobby was kicked, 4001, on round 1's first tick and the game ended below three -- the owner's 2026-10-06 playtest) |
| watchers | not waited for | the same |

**Where our server differs, for the owner (OC-5)**: the dedicated rooms (the test room, `?mp`) keep the owner's 10 s
countdown from both sides seated (`OWNER_LAUNCH_COUNTDOWN_S`), W3.R13's idle kick and the 16-player queue; a game's
room runs the original's READY gate, all-ready launch, 80% and host countdown instead, no idle kick before its launch,
and W3.R13's idle kick after it. The block's "Owner calls: none here" is wrong for the launch: OC-5 asks exactly
whether the owner's rulings stand against the original's 30 s READY gate and host launch -- HUMAN_TASKS H90.

## 6. The limits a hostile client meets

One game a host account (`GAMES_PER_HOST_PLACEHOLDER`), 256 a room (`GAMES_PER_ROOM_PLACEHOLDER`), list pages at most
999 (`PAGE_SIZE_MAX_READING`), bodies at most 4096 bytes, the Origin list (the `/ws` upgrade's too, when set: a
page on another origin is refused 403, a client sending no Origin passes -- not a browser), the bearer; the room
token an account's sockets are seated under is the server's, so no page can take another's seat by naming a token; the world report checked as the
create, respawn refused, the map fixed once the room is made; the socket's existing frame rates (120 binary / 40 text a
second), payload 4096, the hello timeout; the game lobby's gates on the server. **Not here: a per-account request rate
on `/lobby/*`** -- SVC-03's limiter is the login's failure count inside `AccountService` (its keys and windows private,
counting failures, not requests), so it cannot be shared without rebuilding it; owed to SVC-23 (with research 154 §8).

## 7. Unknowns, contradictions, what is not done

- **The proven level**: no transcript of a game's registration, a lobby's READY states or a launch exists (ONL-32;
  ONL-16's two-instance ready-state capture). N14's contradiction stands (`A_ready006` shows the host green and the
  other red at "NOT READY 5"): the count shown by the READY button, not the launch countdown's, is ONL-16a's to read.
- `mp_x_sec_clock`'s 11 is research 95's and 91's reading of the scripts, not re-read here (the dump prints a set's
  commands, not its valves).
- What enables READY at the gate (`Watch45SecClock`, `CountButtonFive`, `FLcountR` 45..11) is not decoded; the 30 s
  is UIMnLOC 350's word and `AdvanceMPMission`'s deadline.
- The flag 0x10000 a slot record carries is read as a watcher's (`READY_SEATS_READING`).
- The host's force launch's trigger (359) is not read (`HOST_LAUNCH_READING`).
- `ReadyToLoad`'s other branch (game +0xcc set: major 0, minor 1, D:L125606-125608) is the in-match case, not the
  lobby's: not transcribed.
- After a match the original returns everyone to the game lobby for the play list's next map (`MPZANIM.ZAR`
  `return_to_gamelobby`, `AdvanceMPMission` +45 s); the room starts its next match itself as before -- after the
  match's start, not this block's (OT.R7).
- The page's own match start (the loading screen, ONL-18): the room's round starts at the launch; the pages load the
  map meanwhile -- ONL-18 and ONL-16a decide what the page shows (the original's `check_loop` switches to the load
  screen at major state 2).
- **The deploy**: `/account/*` and `/lobby/*` are mounted with `DATA_DIR` only; the public surface (`/health`, `/rooms`,
  `/ws`, OWNER-4; `test/deployEnv.test.ts`), the Caddyfile route and the tunnel's ingress are the owner's (HUMAN_TASKS
  H32), unchanged. No new environment variable: `DATA_DIR`, `ALLOWED_ORIGINS`, `TRUST_PROXY` and `MAPS` (the first
  release's `MP2,MP51,MP72`, `deploy/env.example`) serve. The warning owed with the mount when `/account/*` is served
  behind a proxy without `TRUST_PROXY` (research 132 §6 (b)) is not added: nothing on the host can tell a proxy.
- The results after the match (SVC-07, research 155 §4): not built; `onRoundStart` and the room's `roundOver` are where
  they will hook.

## 8. Placeholders and readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `RESPAWN_REFUSED_STATUS_PLACEHOLDER` (`packages/central/src/lobby.ts`) | -966 (Fail) | OT.R21's refusal of a create or report asking for respawn, which the original never makes | the owner's word on its text, or respawn's return |
| `LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER` (`lobby.ts`) | plays on while seated | a launched game whose host leaves: the original migrates the session master, Horizon ends the game (before the launch the role is handed on since 2026-10-04: `HOST_SUCCESSOR_READING`) | ONL-32's transcript of a host leaving a launched game |
| `READY_GATE_MS_READING` (`packages/match/src/gameLobby.ts`) | 30 000 | the READY gate from the seat's lobby entry (D:L123857-123862, UIMnLOC 350) -- the session master's alone since 2026-10-05 (research 165 §8, `READY_GATE_SEATS_READING`) | a capture of the READY button's count from a lobby's entry |
| `READY_REPEAT_MS_READING` (`gameLobby.ts`) | 5 000 | READY's repeat (D:L125601-125611) | the same capture, READY pressed twice |
| `SWITCH_REPEAT_MS_READING` (`gameLobby.ts`) | 5 000 | SWITCH TEAMS' repeat (D:L125824-125828) | a capture of SWITCH TEAMS pressed twice |
| `EIGHTY_READY_FRACTION_READING` (`gameLobby.ts`) | 0.8 | MP_EIGHTY_READY's share (D:L165503-165507) | ONL-16's two-instance ready-state capture with five players |
| `LAUNCH_COUNTDOWN_S_READING` (`gameLobby.ts`) | 11 | `mp_x_sec_clock` for the launch countdown (D:L149005-149009; research 95 §4.1) | the countdown's frames from its first number |
| `FORCE_CANCEL_MARGIN_MS_READING` (`gameLobby.ts`) | 5 000 | `ForceMPLaunch`'s cancel margin (D:L125806-125810) | the script that binds the host's launch |
| `READY_SEATS_READING` (`gameLobby.ts`) | players only | the slots the ready count takes (flag 0x10000 read as a watcher's, D:L165461-165490) | a slot record read with a watcher seated |
| `HOST_LAUNCH_READING` (`gameLobby.ts`) | the forced countdown, the host only, after its gate | the trigger of "Launch all players, ready or not" (359) | the `Lock` binding decoded, or a capture of the host's lobby |
| `COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER` (`gameLobby.ts`) | called off | a side emptied under the countdown; the original launches anyway (D:L165348-165352) | the owner (OC-5), or a classic room that can start with a side empty |
| `HOST_SUCCESSOR_READING` (`packages/central/src/bridge.ts`) | the next player by join order | whom an unstarted game's host role passes to when its host leaves (SVC-07b, 2026-10-04): the original's new session master is the console whose client index equals the session's master index (`FUN_002bc080` D:L160972-160977), an index the network library chooses and nobody has decoded; watchers never. Refined on review (2026-10-04): a player seated in the match room first, the lobby's order only when none is; the successor's other games handed on in their turn. Since LATER 225 (2026-10-21, §2) a placed game's match server applies it too when central frees the host's seat and the host holds no socket there (`packages/match/src/game.ts` `seatFreed` -> `hostGone`) | the DME's master choice decoded (`FUN_0030d5a0`'s writer), or a two-console capture of a host leaving a lobby of three (and one whose host backs out before it enters the session) |
| `REPORT_MAP_CHANGE_PLACEHOLDER` (`packages/central/src/bridge.ts`) | -966 (Fail) | a report changing a made room's map | the return to the lobby after a match (the play list's next map) |
| `ABANDON_BELOW_PLAYERS_READING` (`bridge.ts`) | 3 | the abandon of a launched game by a leave (`FUN_002bc530` D:L161130-161141). Weaker than "fewer than three left" reads (the review's N1): the test at D:L161139 is `FUN_0030d510(0x45a0c0)` less the count of non-zero slots of `DAT_00440ec0` (the leaver's cleared first) below 3, in the match only (game +0xcc set); `FUN_0030d510` (D:L209985) is a thin wrapper whose value is filled by a network-library routine over the session object's +0xf4 (`FUN_00623090` -> `FUN_00615160`, entries flagged at +0x28) that is not decoded, and what `DAT_00440ec0`'s slots hold is not read either -- "the players left, fewer than three" is research 91 §17.2's interpretation. Still a reading | ONL-32's transcript of a leave with two left and one with three; or `FUN_00615160`'s count and `DAT_00440ec0`'s writer decoded |
| `ABANDONED_TO_LOBBY_PLACEHOLDER` (`bridge.ts`) | the game lobby again | a launched room whose side empties with three or more left (the original plays on) | a classic room that can play a side empty (CLASSIC_WAITING_PLACEHOLDER's owner, ONL-16) |
| `SESSION_SILENT_MS_READING` (`packages/central/src/accounts.ts`; NU-16b, 2026-10-15) | 300 000 ms | the idle of an account's session no socket holds and none claimed, from its last use (the login, a lobby request, a socket's close), past which it ends and the account is logged off the room service (§1). Horizon's `ClientLongTimeoutSeconds`, 300 s (desktop@be557831:server/horizon-server/Server.Medius/Config/AppSettings.cs:101; `LongTimeoutSeconds`, `LongTimedout`, `IsConnected`, Server.Medius/Medius/Models/ClientObject.cs:152-153, set at :229, :385) -- a reimplementation's figure, recorded as one: the original server's own is unread. It replaced `SOCKET_TICKET_MS` (60 s) for these sessions on the merge controller's word (option (a), the plan's NU-16b): the owner's invitee's window, frozen by the browser, was logged off 60 s after its last request (NU-16's read, research 157 §11 `KEEPALIVE_HIDDEN_TAB_READING`). Guests keep 60 s. Its cost, a page gone without its logout holding its name -997 for up to 300 s, is met by the page's logout at a non-persisted `pagehide`, sent `keepalive` (viewer `connectHost.ts`, `PAGEHIDE_LOGOUT_ADAPTATION`, a browser adaptation) | ONL-32's transcript: how long the original's lobby server keeps a client that sends nothing (a console's lobby connection left silent, timed to its logoff) |

| `GAME_SOCKET_CLOSED_DIALOG_READING` (`packages/viewer/src/netPage.ts`) | 365 | the dialog a game's seat ended by the server shows (4006, 4008, 1011) and any kick that is not a vote: `_365_BeenDisconnected_MSG`, the lobby's only network-loss message (`MP_MEDIUS_ERROR -> OnNetError`); the original has no idle or lag kick. The research wave's reading (card C7 §1.1, cross-checked by C8, 2026-10-04; HARD-SEAT) | a two-console capture of a disconnect in a game lobby |
| `GAME_ENDED_DIALOG_READING` (`netPage.ts`) | 528 | the dialog a game ended under the seat shows (4007): `_528_AllPlayersLeft_MSG` on `dlgNetAbandoned.rdr` (`FUN_002bc530` D:L161109-161146, one of three paths); not #529, the version error's (`dlgNetAbort.rdr`). The research wave's reading (card C7 §1.1; C8; HARD-SEAT); the host-gone end shares it unread | ONL-32's transcript of a leave with two left; the host-gone case read |
| `GAME_KICKED_DIALOG_READING` (`netPage.ts`) | 539 | reserved for the vote kick (`kicked` 'vote'): `_539_YouveBeenKicked_MSG` with 541 and 540, 4 s on `dlgNetBanned.rdr`, the team-majority vote at the round-end screen (`FUN_002c3550` D:L164913-165086). The research wave's reading (card C7 §1.1; C8; HARD-SEAT) | the vote's +0x48 writer traced; a capture of the screen |

`SOCKET_TICKET_MS` (60 s) now also bounds an idle session's life (§1): a server policy with no original, like the
ticket's 32 bytes; *2026-10-15 (NU-16b): an account's unclaimed session idles on `SESSION_SILENT_MS_READING` (300 s,
its row in the first table above) instead; `SOCKET_TICKET_MS` bounds a guest's (FG-28) only.* *2026-10-15
(SESSION-TAKEOVER): `SESSION_TAKEOVER_ADAPTATION` (`accounts.ts`) -- a login with the right secret ends its account's
session no socket holds and logs in; a session a socket holds is still -997 (§1). A service adaptation (OT.R27), no
ledger row: the original server's rule for a second login is unread (ONL-32's transcript of a second console logging
in under a live name would show it); it adds no figure.* `GAME_ENDED_CLOSE` (4007) and `SEAT_FREED_CLOSE` (4008) are the transport's close codes, ours.
