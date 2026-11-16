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
| R159.5 | **The original's launch is the host's**: READY toggles a seat's minor state (`FUN_002c3fc0`), at most once per 5 s, after a 30 s gate; every player ready with both sides seated launches at once; 80% ready starts an 11 s countdown; the host's force launch is that countdown (*corrected 2026-11-13, §10.1 item 5: the shipped dialog has no host force control; the only ready-or-not launch is the 80% countdown's end*) | `PreMatch`; our server's dedicated rooms keep the owner's 10 s from both sides seated -- a game's room does not (OC-5, H90) | §5 |
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
(`IsSessionMaster`; for the master `EnableButton(Lock)` -- a name no widget of the shipped dialog holds, §10.1 item 5; `Watch45SecClock`), `Enable_SM_Launch` (the buttons by
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
| 80% | no countdown, not all ready, both sides seated, ready >= 0.8 x players, no clan game: MP_EIGHTY_READY (D:L165503-165507) -> `ForceMPLaunch` | the same (`EIGHTY_READY_FRACTION_READING`), decided at a READY, a leave, a switch and a join (§9, 2026-11-13) |
| countdown | now + `mp_x_sec_clock` x 1000 (`FUN_002a6b90` D:L149005-149009), the valve 11 (research 95 §4.1, 91 §18.1); all ready during it launches at once (D:L165461-165462, D:L165509-165511); at its end the host launches (`FUN_0027cbf0` D:L125783-125785) | `LAUNCH_COUNTDOWN_S_READING` 11 on the room's clock (`Room.launch(11)`, the `countdown` event) |
| countdown off | `ForceMPLaunch` again with more than 5 s left (`FUN_0027d070` D:L125806-125810) | the same (`FORCE_CANCEL_MARGIN_MS_READING`) |
| side emptied in it | `mp_team_unbalance` held 0 while it runs (D:L165348-165352): it launches anyway | called off (`COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER`) |
| host's launch (359) | *corrected 2026-11-13 (LOBBY-START, §10.1 item 5): none.* 359 is the body of `OnSMlaunchstart` (P:L7673-7674), an animation no binding runs; the shipped dialog has three buttons (ARMORY, SWITCH TEAMS, READY) and no `Lock`, `ForceLaunch` or `MasterText` widget (a build box's listing and the archive's string pool, ll1 and ll2, at their levels in §10.1 item 5; a capture would prove it) -- so the only ready-or-not launch is the 80% countdown's end. (Was: "the hint of a `Lock` button `Session_master_migration` enables for the master".) | the countdown, the host only, after its gate (`HOST_LAUNCH_READING`, held for the owner, OT.R32) |
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
- The host's force launch's trigger (359) is not read (`HOST_LAUNCH_READING`). *Corrected 2026-11-13 (§10.1 item 5): read -- there is none in the shipped dialog; 359 is an unbound animation's text.*
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
| `FORCE_CANCEL_MARGIN_MS_READING` (`gameLobby.ts`) | 5 000 | `ForceMPLaunch`'s cancel margin (D:L125806-125810) -- as far as read, a branch retail never reaches: `ForceMPLaunch`'s one caller, `launch_10sec_anim`, runs on an event raised only with no countdown; two raises before the animation runs would make the second a cancel (§10.1 item 5) | the script that binds the host's launch; a capture of the original's host lobby |
| `READY_SEATS_READING` (`gameLobby.ts`) | players only | the slots the ready count takes (flag 0x10000 read as a watcher's, D:L165461-165490) | a slot record read with a watcher seated |
| `HOST_LAUNCH_READING` (`gameLobby.ts`) | the forced countdown, the host only, after its gate | the trigger of "Launch all players, ready or not" (359) | the `Lock` binding decoded, or a capture of the host's lobby |
| `COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER` (`gameLobby.ts`) | called off | a side emptied under the countdown; the original launches anyway (D:L165348-165352) | the owner (OC-5), or a classic room that can start with a side empty *2026-11-13 (LOBBY-START, §10): the reading exists -- the original launches at the countdown's end (D:L165348-165352, D:L165461-165462, D:L165509-165511) -- read, built and reviewed on `agent/lobby-start`, and held (LATER 998) until the room can play a side empty.* |
| `EIGHTY_READY_HOST_PAGE_READING` (`packages/ui/src/screens/gameLobbyCommands.ts`) | the host's page runs `launch_10sec_anim` at a new countdown; its `ForceMPLaunch` sends nothing | the countdown's start on the host's own dialog: MP_EIGHTY_READY raised on the host (D:L165503-165506) runs `launch_10sec_anim` there (P:L7631-7648) -- .DINK, `NoTriangle`, `mp_locked_game`, the three buttons disabled at once (LOBBY-START, §10). Reading, pending review | a capture of the host's lobby at an 80 per cent start (the sound and the buttons' first frame) |
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

## 9. LOBBY-REDECIDE: the host's decision re-run at every seat change (2026-11-13T06:02Z; reading, pending review)

Two players reported "the lobby doesn't force start" (v0.4.21, seat redotcom-29's brief for the main controller). The
investigation read it to a gap: the port's `PreMatch.decide(now)` starts the 80% countdown only with a clock, and only a
READY press and the host's force passed one -- a leave decided with none, a switch and a join not at all. This entry
re-reads the original at the source (`socom2_game.elf.decomp.c`) before any code changes. Level: **reading, pending
review** -- transcribed from the decompilation; a fresh reviewer re-reads it at the source.

### 9.1 The re-read

1. **The decision, `FUN_002c3cf0` (D:L165314-165393).** With the game object present (D:L165325) it first recounts the
   sides from every slot's team word (`FUN_002c4500`, D:L165326; the counts SEALs `DAT_00441448`, TERRORISTS
   `DAT_00441450`, D:L165618-165659); sets `mp_team_unbalance` (game +0x54) to 0 when both sides have a player (or the
   game's byte +0xa8, or the short at +0x60, is set -- not read further here), else to 1 -- but back to 0 while a countdown runs (+0xd8) (D:L165328-165353);
   then by the game's major state (+0x113). In state 1, the lobby (D:L165373-165386), and only on the session master
   (`DAT_0045a0c0`, D:L165374), it copies its own major and minor states into its own slot record (D:L165377-165378),
   calls `FUN_002c40c0` (D:L165379), and when that answers 1 and `mp_team_unbalance` is 0 sets major state 2 -- the
   launch (D:L165380-165384). `FUN_002c40c0` (D:L165446-165513): unless a countdown runs and its deadline (+0xe4) has
   passed (D:L165461-165462; then it answers 1, D:L165509-165511 -- the countdown's end launches), it counts the ready
   slots (minor state 2) among those not flagged 0x10000 and whether every one is ready (D:L165467-165490), posts the
   count (D:L165491-165502), and raises MP_EIGHTY_READY (S:0x3f2a40) when no countdown runs (+0xd8 0), not every player
   is ready, both sides have a player, 0.8 x (SEALs + TERRORISTS) <= the ready count, and `FUN_002e99e0` (the clan
   affiliation) is 0 (D:L165503-165506); it answers "every player ready" (D:L165512). **There is no other entry**: the
   countdown is started only by MP_EIGHTY_READY's answer (`launch_10sec_anim` -> `ForceMPLaunch`, §5), whatever called
   `FUN_002c3cf0` -- the same test and the same 11 s on a seat change as on a READY press. **No gate is tested** here:
   the host's 30 s is his READY button's (§5, `READY_GATE_SEATS_READING`), so a seat change can start the countdown
   before the host's gate has run, exactly as another seat's READY press can today. **A countdown already running is
   neither restarted nor extended**: the raise requires +0xd8 0 (D:L165503), and the deadline +0xe4 is not touched here;
   every player ready launches at once under it (D:L165380-165384 with D:L165512).
2. **Its two callers.** `FUN_002c5360` (D:L166183-166213), on a network game (`DAT_0045a0c1`) with the console's own
   slot record found (D:L166194-166196): `FUN_002c3cf0` first (D:L166197), then the console's own major, minor and
   other fields written into its own slot record (D:L166198-166209), then `FUN_002c5010` (D:L166210). `FUN_002c5750`
   (D:L166316-166332): the freed index's table entry cleared (D:L166323-166324) and, unless it is the console's own
   index (D:L166325-166326), `FUN_002c5010` and `FUN_002c3cf0` (D:L166327-166328). **Correction to the investigation's
   word "a recount"**: `FUN_002c5010` (D:L166063-166177, only in minor state 1) builds the lobby's four columns (the two
   sides' rows with their ready dots, the spectators) -- the screen's list, not a count; the side recount is
   `FUN_002c4500` inside `FUN_002c3cf0` (D:L165326). Nothing changes for the decision.
3. **Inference (i): which callback is which -- HOLDS.** The slot type is registered at D:L166453 through
   `FUN_0030ce80` (D:L209706-209715): its third and sixth arguments go to the network library (`FUN_00620f50`
   D:L531073-531096 -> `FUN_00624460` D:L533304-533319) as the type's create callback (`DAT_0067a6e8`), its update
   notifier (`DAT_0067a728`, always 0x30cdf0) and its delete callback (`DAT_0067a768`); its fifth is kept in the session
   at +0x1154 by type (D:L209713). The library calls the create callback when an object's first data arrives
   (`FUN_00615e38` D:L523693-523704, from D:L529701), the update notifier on a field's update (`FUN_00615eb0`
   D:L523709-523721, from the field-update receiver `FUN_0061ed48` D:L529757-529767), the delete callback when an object
   goes (`FUN_00615f50` D:L523726-523737, from `FUN_00615fc8` D:L523759). The session's per-frame update `FUN_0030da00`
   calls the +0x1154 callback for each object index whose byte at session +0x10b+index is set, and clears it
   (D:L210262-210273). So **0x2c5830 is the JOIN** (create), **0x2c5750 the seat FREED** (delete) and **0x2c57d0 the slot
   CHANGED** (update). Two corroborations: the seal type's registration (D:L162712) passes in the sixth place 0x2bef60,
   which the demo build's symbols name `RemoteSealDeletionCallback`; and 0x30cdf0 and 0x30ce80 are named
   `zNetRemoteObjectUpdateCallback` and `zNetRegisterRemoteObjectCallback`
   (`desktop@be557831:docs/research/55-class-inventory.md:324`, a byte-prefix symbol match). **The link the
   decompilation lacks, read from the disc's code** (2026-11-13, after the fresh review; first read by the reviewer,
   re-read by the author): 0x30cdf0's body has no function in the decompilation, so it was read from the disc's
   `socom2_game.elf` itself -- the MIPS words at 0x30cdf0-0x30ce74, decoded by the author with a small script (the vaddr
   mapped to the file through the ELF's loadable segment holding it: file offset 0xd6600 + (vaddr - 0x1e7000), so
   0x30cdf0 at 0x1fc3f0; the same bytes decode to what the decompilation shows for `FUN_0030cde0` at 0x30cde0, a jump to
   0x6233d8, and for `FUN_0030ce80` at 0x30ce80-0x30cee8, the registration and its two stores at +0x1114 and +0x1154).
   The notifier looks the object up by its index (a call to 0x622818, the lookup the per-frame loop uses, D:L210265);
   when found, calls the session's +0x1114 callback for the object's type (0x45a0c0 + 0x1114 addressed absolutely; the
   registration's fourth argument -- for the slot type 0x2c5800, `FUN_002c5800`, a lookup only, D:L166348-166353); and
   then, on both paths, found or not, stores 1 at 0x45a0c0 + 0x10b + the object's index (0x30ce50-0x30ce60). So a
   remote's field update always flags its object for the per-frame dispatch of D:L210262-210273, which runs the
   +0x1154 callback, 0x2c57d0. The byte's only reader is D:L210264, and the decompilation's only other writers clear it
   (D:L210270, D:L210341). The link is now a reading from the disc's code, like the rest of this item; the desktop
   note's name stays as corroboration.
4. **Inference (ii): a remote's side change reaches the host as its slot's change -- HOLDS.** A non-host's SWITCH TEAMS
   (`FUN_002badd0` D:L160265-160285) sends the host message 0x40 (D:L160276); the host's handler (`FUN_002bae70`
   D:L160290-160297) runs `FUN_002c4290` (D:L165518-165569): the host's copy of the slot's team word flipped when the
   other side has fewer than 8 (D:L165538-165566), and `FUN_002baea0` (D:L160302-160321) sends the asker the new side
   (D:L160318). The asker's handler `FUN_002baf30` (D:L160326-160367) takes it -- side 4 is a refusal's text
   (D:L160333-160358) -- and otherwise sets its own side and calls `FUN_002c5360` (D:L160361-160363), which writes the
   team word into its own slot record (D:L166206). That record is the asker's own object (created owned, mode 2, by
   `FUN_002c5450` D:L166230; research 193 §2.4), so the library's send pass sends its changed fields
   (`FUN_0061ba10` D:L527450-527473 -> `FUN_0061a6d8` D:L526713-526753 -> `FUN_0061a488` D:L526669-526693), the host
   receives them (`FUN_0061ed48` D:L529757-529767) and its CHANGED callback runs: `FUN_002c57d0` (D:L166337-166343) ->
   `FUN_002c5360` (D:L166341) -> `FUN_002c3cf0` (D:L166197). The host's own switch: `FUN_002badd0`'s host branch runs
   `FUN_002c4290` on its own index (D:L160279-160282), whose `FUN_002baea0` calls `FUN_002baf30` directly (D:L160313-160315),
   so `FUN_002c5360` and the decision. The host's move itself (`FUN_002c4290`) does not decide.
5. **READY is one more slot change.** `ReadyToLoad` (`FUN_0027caf0` D:L125595-125614) toggles the minor state through
   `FUN_002c3fc0` (D:L165398-165411), which ends in `FUN_002c5360` (D:L165408): on the host the decision at once; on a
   remote its record's minor state (D:L166199), reaching the host by the CHANGED path of item 4. Corroboration: nothing
   else runs the host's decision in the lobby -- `FUN_002c3cf0` has only the two callers of item 2, and the callers of
   `FUN_002c5360` are one-off events (a slot's creation at the lobby's entry, `FUN_002b7a20` D:L158488-158508,
   `FUN_002bbfa0` D:L160919-160942; the load state, `FUN_001f5e70` D:L55702; the countdown run out, `FUN_0027cbf0`
   D:L125783-125785; host migration `FUN_002bc080` D:L160985, D:L161021; the clan swap `FUN_002c0040` D:L162980; others
   not in the lobby) -- so a remote's READY that completes the room reaches the host's launch only by CHANGED. The
   port's READY path and the new paths are one rule: any change of a seat re-runs `decide` with the clock.
6. **A JOIN.** `FUN_002c5830` (D:L166358-166411): the joiner's vote flags cleared and its index kept (D:L166376-166379);
   on the host the join's admission byte checked, a refused one answered side 4 reason 5 (D:L166380-166397); the record
   filed in the table (D:L166398-166401); the mute from the ignore list (D:L166403-166406); then `FUN_002c5360`
   (D:L166409), so the decision. The joiner's record is zeroed at its creation (`FUN_002c5450` D:L166236), so its minor
   state is 0 -- not ready -- and its team word is the console's own side word, `DAT_00441470` (D:L166297; set on a
   joiner by its admission -- not re-read here). So a join that seats the
   second side while 80% of the then-seated players are ready raises MP_EIGHTY_READY: 4 of 4 ready SEALs and a TERRORIST
   joining is 0.8 x 5 = 4 <= 4 -- the countdown.

So in the original a not-ready player leaving 6 of 8 ready (6 of 7: 0.8 x 7 = 5.6 <= 6) starts the countdown, a switch
that seats the second side under an all-ready room launches, and a join can start the countdown; in the port all three
sat until someone pressed READY.

### 9.2 The change (reading, pending review)

- `PreMatch.unseat(accountId, now)` (`packages/match/src/gameLobby.ts`): the countdown called off when the leave empties
  a side stays first (`COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER`), then `decide(now)` -- the 80% test with the clock (item 1,
  `FUN_002c5750` -> `FUN_002c3cf0`). `now` defaults to null, today's launch-only decision, for a caller not passing it
  (the Forge lobby's driver, `forgeGame.ts`: left out, "Not done here" below, LATER 995).
- `PreMatch.seatChanged(now)`: `decide(now)` once a seat's change is in place -- a join (`seat`) and an accepted SWITCH
  TEAMS after the room gave the side (`setTeam`); nothing once launched.
- The carriers -- `packages/match/src/game.ts` (`MatchGame`) and `packages/central/src/bridge.ts` (`GameBridge`) -- pass
  the clock at a leave (the socket's close and a freed pending rejoin), take `seatChanged` at a new seat (not a takeover
  of a held seat: no new slot object) and after a switch's `setTeam`, and act on it as on a READY's (`act`). After a switch
  the bots' reconcile still runs after the decision, so the CPUs move after the human's change is decided; its launch, if
  it answers one, is taken over the switch's own answer.
- A refused switch (the repeat, the countdown, a clan game, the sides) decides nothing.

**Unchanged, and why**: the 0.8 share (`EIGHTY_READY_FRACTION_READING`; 75 per cent is the owner's call, H90) and the
11 s (`LAUNCH_COUNTDOWN_S_READING`) -- item 1 shows the same test and the same countdown on every path; the host's 30 s
gate -- his READY's only, `FUN_002c3cf0` tests none (item 1), so another seat's leave inside it can start the countdown
as another seat's READY already could, and his own READY stays refused; the clan-game exclusion (`FUN_002e99e0`,
D:L165505); READY and SWITCH closed during a countdown (`SWITCH_CLOSED_AT_COUNTDOWN_READING`), and a countdown running
neither restarted nor extended (D:L165503) -- every player ready still launches under it; the bots' list, which keeps
`decide(null)` (`setBots`): CPUs are not the original's, and a CPU taking or leaving a seat starts no countdown
(BOTS-LAND's ruled defect) -- the no-bot reconcile's own "sets nothing and decides nothing" stays pinned by itself in
`packages/match/test/roomBotsGates.test.ts` (:115, "area (b) 1"); the FF lobby's CPU readiness (`readyCpus`) as before.
**The FF lobby is not unchanged as a whole**: there the CPUs count as players (FF.R9.2, "the same rule launches it"),
and a human's leave, join and switch now decide with the clock as in every game's lobby, so the countdown can start at
the human's event where before it waited for the next CPU becoming ready or a human's READY press; the 17
`ffLobbyGame.test.ts` cases pass. No named constant changed; no ledger row.

**Expectations that moved** (found by the build box's whole suites on ad0f81e664; both pinned BOTS-LAND's finding 3 as
the port then read the original -- "a join never decides; a leave decides with no clock" -- a premise item 1 and item 2
reverse for a human's seat):
- match `test/gameBotFolds.test.ts`, "re-read finding 3": a respawn FILL lobby of 6 humans, 4 READY, an unready human
  leaves and a CPU fills the place. Before: `countdown` null. After: 11, one `countdown` event -- the human's leave makes
  4 of 5 = 0.8 x 5 and the freed seat decides (`FUN_002c5750` -> `FUN_002c3cf0`); the CPU's fill adds nothing. What the
  case was written to hold -- a CPU's seat change starts no countdown -- is kept in a new case of the same block: every
  human on the SEALs, 5 of 6 READY (no countdown: a side empty, D:L165503-165504), then TERRORIST BOTS FILL seats the
  other side -- still no countdown (`setBots` -> `decide(null)`). The room then holds at 80 per cent or more ready with
  both sides seated and no countdown until the next human event -- a join (a spectator's too), a leave, a switch or a
  READY press -- which starts it, or launches if every player is ready. That hold is a consequence of the port's bots,
  not something the original does: the original has no CPUs, and so no such state. The humans' share moves only at a
  human's READY or seat change, each of which now decides, so the states in which a CPU change meets an undecided 80
  per cent are: the CPUs seat a side the humans left empty, or the host has called the countdown off (his second press
  with more than 5 s left, `forceLaunch`, `gameLobby.ts` :500-503, `FORCE_CANCEL_MARGIN_MS_READING`) -- a CPU change
  there starts nothing either, and the next human event starts the countdown again. Checked to fail with `setBots`
  deciding on the clock (`expected 11 to be null`).
- central `test/botH315.test.ts`, "a respawn Frostfire game with no bot running": an unready leave from 4 of 6 READY.
  Before: `countdown` null. After: the countdown, one `countdown` event of 11 -- the leave's, as in a classic game. Its
  first point, that the no-bot reconcile decides nothing a classic game would not, stands (the reconcile answers null
  with no controller); at the bridge it is no longer separable from the leave's own decision, which already runs it.

**Not done here**: the clan swap of "Alternate teams" (`FUN_002c0040` ends in `FUN_002c5360`, D:L162980, so the
original decides there too) -- the port's `swapSides` decides only through the bots' reconcile; a swap exchanges the
sides of the same players, so the share is unchanged, and it is the host's FINISH in the lobby a full game returned to
(nobody ready at its opening). **The Forge lobby** (`packages/match/src/forgeGame.ts`, which drives `PreMatch` as is;
the Forge lane's file, not this task's; LATER 995): after this change it still skips the decision at all three seat
changes -- a LEAVE calls `unseat` with no clock (:330, a refused host ticket's seat; :543, a socket's leave), a JOIN
seats with `seat` and never calls `seatChanged` (:508), and a SWITCH gives the side with `setTeam` and never calls
`seatChanged` (:607-611) -- so in a Forge lobby at 6 of 8 ready a not-ready seat leaving starts nothing, where a game's
lobby now starts the countdown. The tests: `packages/match/test/gameLobby.test.ts`
("LOBBY-REDECIDE"), `packages/match/test/lobbyRedecideGame.test.ts`, `packages/central/test/bridgeLobbyRedecide.test.ts`
(fixture MP2).

## 10. LOBBY-START: the 80 per cent countdown's own steps (2026-11-13T07:05Z; reading, pending review)

The owner, 2026-11-13T05:54Z: "We're going for complete accuracy with the original on the lobby start", the launch of
all players ready or not included. This entry re-reads the original at the source before any code changes: the
decompilation (`socom2_game.elf.decomp.c`, `D:L`), the dialog's script in the committed decode
`tools/test/onlineDialogs.pinned.json` (`P:L`, `dlgGameLobby.rdr`), and a build box's listing of the shipped dialog's
widgets made with the repository's dump tool at `agent/v0421` df3af7bd64 (kept outside the tree). Level: **reading,
pending review**.

### 10.1 The re-read

1. **A side emptied under the countdown launches at its end.** `FUN_002c3cf0` sets `mp_team_unbalance` (game +0x54) to 1
   when a side is empty (D:L165342-165347) and back to 0 when the countdown flag (+0xd8) is set (D:L165348-165352), on
   every call; its launch test is `FUN_002c40c0` answering non-zero with the word at 0 (D:L165379-165384).
   `FUN_002c40c0` answers 1 outright once the countdown runs and its deadline (+0xe4) has passed (D:L165461-165462,
   D:L165509-165511); before it, "every player ready" (D:L165463-165490, D:L165512). So while the countdown runs a side
   emptying neither calls it off nor blocks its end: nothing there writes +0xd8. Its writers are `FUN_002a6b90`
   (D:L149015) -- reached from `ForceMPLaunch` (`FUN_0027d070` D:L125802-125810) and from the game-object field handler
   `FUN_002c0850` (D:L163353), which copies the host's countdown bit to the other consoles -- and two resets that
   clear it with the rest of the game object's flags (`FUN_002a75f0` D:L149464, `FUN_002a9ef0` D:L150834); none of
   them is on the leave path as far as read (the resets' callers were not traced). So at the deadline the host launches with a side empty. **The same lines go one step further than the brief's word**: with the word held at 0, every remaining
   player ready launches at once under the countdown with a side empty too (a leave of the last not-ready player that
   also empties his side; D:L165380-165384 with D:L165512) -- the same reading, held with it (§10.2).
2. **Who launches at the deadline in the port.** `PreMatch` holds the deadline but no clock; the room's clock runs the
   countdown (`Room.launch(11)`, `launchAt`) and starts round 1 at its end (`room.ts` `clock`). The room called its own
   countdown off when a side emptied (`callOffCountdown`, at the leave and at each waiting tick), in every room. So the
   reading needs both: `PreMatch` keeps the deadline, and a room under the game lobby's launch (`heldLaunch`) keeps its
   countdown. The dedicated rooms' owner countdown (`OWNER_LAUNCH_COUNTDOWN_S`, OC-5) is unchanged.
3. **What a match launched with a side empty then does -- the room's own rule, not this entry's.** The port's room
   launches into its load hold (`firstRound`; `onLoadHold`, the game marked launched) and its next waiting tick abandons
   a hold with a side empty (`clock`'s hold branch, as `abandonIfSideEmpty` does in play; `ABANDON_TRIGGER_READING`); the
   game's `onAbandon` then closes the game below three players (`ABANDON_BELOW_PLAYERS_READING`) or reopens its lobby
   (`ABANDONED_TO_LOBBY_PLACEHOLDER`). What the original's match does with a side empty from its start is not read (the
   load state `FUN_001f5e70` and the round's end were not re-read here): a two-console capture of a countdown run out
   after a side's last player left would settle it.
4. **The start's steps, `launch_10sec_anim` (P:L7631-7648).** MP_EIGHTY_READY is raised by the host's `FUN_002c40c0`
   (D:L165503-165506) through the network layer's event sink `DAT_0044f3c8`, which posts a named event into the console's
   own dialog (research 146 §InitNetwork, 157 §2) -- so the script runs on the host only, and only when the lobby is the
   dialog standing (the binding is the lobby's, P:L6624). In order: `SOUND .DINK` (P:L7632, before the test, so in both
   branches); with `mp_team_unbalance` 1, popup #356 for 3 s and nothing else (P:L7633-7637); else `STOP
   switch_teams_anim`, `NoTriangle` 1, `mp_locked_game` 1, `ForceMediusStatusReport`, `ForceMPLaunch` (the countdown,
   +0xd8 being 0 when the event was raised), and `DisableButton` of `Glswitchteams`, `weaponselect` and `PlayerReady`
   (P:L7639-7646).
   (a) **When #356 can show.** The raise needs both sides seated (D:L165503-165504), and within the same call the word
   was just set 0 (both counts non-zero, D:L165328-165341), so the popup is met only if the event's animation runs after
   a later `FUN_002c3cf0` call saw a side empty -- a leave between the raise and the script. Whether the dialog host runs
   the animation within the post or on a later frame is not read (`FUN_00367810`, D:L263357-263396, starts it). In the
   port the server decides in one step and no page raises the event (`EIGHTY_READY_SERVER_ADAPTATION`); the page's
   `mp_team_unbalance` is 0 while a countdown runs, so the popup branch is not reached. Settles: a capture of a leave
   inside the frame of an 80 per cent start.
   (b) **BACK on which consoles.** `launch_10sec_anim`'s `NoTriangle` 1 is the host's. But `CountDown`, run on every
   console in `check_loop`'s loop (P:L7116-7118), does the same once `mp_x_sec_clock` is under 11: `KillPopup`, `STOP
   exit_lobby`, `NoTriangle` 1, the counters stopped, the three buttons disabled, #354 / #355 and the frame
   (P:L7464-7484); and `exit_lobby`'s second block FAILs with `NoTriangle` 1 (P:L7745-7746). So BACK is closed and the three buttons disabled on every
   console from the clock's first second under 11, and on the host at once. `RingForceLaunchBell` (.COUNTDOWN) rings
   on the other consoles at 10.
   (c) **A join under the lock.** `mp_locked_game` (S:0x3f61f0) is read by the two status writers, which report the
   game's status as 3 while it is set, else 1 in the lobby and 2 after (`FUN_00303780` D:L203997-204008, `FUN_00303f40`
   D:L204351-204362) -- 3 is the value `MediusWorldStatus` names Closed (`lobby.ts` `WORLD_STATUS`); which report
   carries it is not read (research 309 §4.1). The host's own admission tests no lock: the join handler `FUN_002bc620`
   (D:L161149-161492; research 309 §4.1) and the create callback's admission byte (`FUN_002c5830` D:L166380-166397:
   refused only for a byte 0 or a type outside 1-3) read neither the valve nor +0xd8. So a join under the countdown is
   refused, if at all, by the services answering a status-3 game, not by the host.
5. **The host's "ready or not".** The shipped dialog has three buttons -- `weaponselect`, `Glswitchteams`, `PlayerReady`
   (P:L6601-6603; the listing: three BUTTON widgets) -- and no widget named `Lock`, `ForceLaunch` or `MasterText`: `Lock`
   occurs only in script text (`Session_master_migration`'s `EnableButton(Lock)`, `SetupLateJoiner`'s
   `DisableButton(Lock)`), `OnStartGameLock` is called and defined nowhere, and `OnSMlaunchstart` (P:L7673-7674,
   `DescriptionText.op1(#359)`, "Launch all players, ready or not.") is bound to no widget's event. So text 359 is the
   body of an animation no binding runs, and the retail lobby has no host force control: the only ready-or-not launch
   is the 80 per cent countdown's end (item 1). `ForceMPLaunch`'s second branch -- called again with more than 5 s left,
   the countdown off (`FUN_0027d070` D:L125806-125810, `FORCE_CANCEL_MARGIN_MS_READING`) -- is, as far as read, never
   reached in retail: its one caller, `launch_10sec_anim`, runs on an event raised only with no countdown (D:L165503).
   The reason it is "as far as read": if the dialog runs the animation a frame or more after the raise (item 4 (a), not
   read), two raises before the first animation runs would give two `ForceMPLaunch` calls, the second one with the
   countdown running -- a cancel. **The evidence, at its level.** (1) A build box's listing of the shipped dialog made
   with the repository's dump tool (`agent-mail/evidence/lobby-layout/ll1/keep/lobby-1..4.txt`, at `agent/v0421`
   df3af7bd64): three BUTTON widgets and no object named `Lock`, `ForceLaunch` or `MasterText`; its line 144 is the
   screen's full parsed tree, 66 object names of every type (images, texts, list boxes, buttons), not only the types the
   reader draws. (2) The dialog archive's raw bytes (`agent-mail/evidence/lobby-layout/ll2/keep/lobby-raw.txt`): its one
   string pool (0x31a08 to 0x3317b) holds `Lock` and `ForceLaunch` once each, between `_351_ChatDisabled_MSG` and
   `AreYouSure` / `_352_GameAlreadyStarted_MSG` -- the order in which `SetupLateJoiner` names them (P:L7243-7254) -- so
   they read as symbols the script names, not widget records; an inference from order, not a proof. **The limit**: both
   are the repository's readers over the disc's files; a record the parser does not take as an object would not show,
   which the full tree of every type makes unlikely but does not exclude. A capture of the original's host lobby is
   what would prove it.

### 10.2 What this change ships (reading, pending review)

- **Item 1 is NOT in this change.** Read, built and reviewed at the source on `agent/lobby-start` (to be renamed for
  the hold): a side emptied under the countdown launching at its end, and every remaining player READY then launching
  at once with a side empty. Held, LATER 998, by the main controller's ruling (2026-11-13): after a one-sided launch
  the port's room abandons on its next tick (`ABANDON_TRIGGER_READING`, the port's stand-in; the original, as far as
  read, plays on -- `FUN_002bc530` D:L161109-161146 has no side test, `FUN_002c4500` acts only with both sides empty,
  D:L165674-165677) and below three players closes the game, which is worse than today's call-off and still not the
  original. Here a side emptied under the countdown still calls it off (`COUNTDOWN_EMPTIED_SIDE_PLACEHOLDER`, still a
  placeholder). The at-once launch with both sides seated -- every player seated READY under a running countdown, by
  a leave (D:L165380-165384 with D:L165512) -- is already the port's (`decide`'s first test; `gameLobby.test.ts`,
  "every player ready under a countdown launches at once on a leave"); a READY press under the countdown is refused
  (`SWITCH_CLOSED_AT_COUNTDOWN_READING`).
- **Item 2, the host's page** (ui `packages/ui/src/screens/gameLobbyCommands.ts`, `EIGHTY_READY_HOST_PAGE_READING`):
  when the room's `gameLobby` view brings a new countdown and this seat is the host, its dialog is given
  MP_EIGHTY_READY, so the disc's own `launch_10sec_anim` runs on the host's page -- .DINK, `NoTriangle`,
  `mp_locked_game`, the three buttons disabled at once; that run's `ForceMPLaunch` is the countdown the server already
  started and sends nothing (any later `ForceMPLaunch` sends `launch` as before). The other pages keep `CountDown`'s
  steps as the disc has them. **At the port's call-off** (item 1 held, so a side emptied still calls the countdown
  off): the script has no unlock path -- `mp_locked_game` is set 0 only by `SwapClanSides` (P:L7197), and no script
  sets `NoTriangle` 0 after a countdown (the original never calls one off for an emptied side) -- so the host's page
  is left with `mp_locked_game` 1; nothing reads it (no script test, no page code; `ForceMediusStatusReport` sends
  nothing, the server reports the game itself), and BACK and the three buttons are reopened by LSR.R1's recovery
  (the owner's ruling, `lobbyRecovery.ts`) as on every page. A new countdown runs the animation again
  (`gameLobbyScreen.test.ts`, "LOBBY-STEPS: the room calls the host's countdown off, then starts another"). A call-off that arrives before the queued animation has run (two leaves in one frame) stops it -- the
  recovery's stop list (`lobbyRecovery.ts`) -- and the page keeps its echo flag until a `ForceMPLaunch` takes it, so a
  late run cannot send `launch` (the re-read's F1; "LOBBY-STEPS F1" cases).
- **Item 3**: sections 5, 7 and 8 here and research 165 section 2 corrected (359; three buttons; no host launch
  control); `FORCE_CANCEL_MARGIN_MS_READING`'s and `HOST_LAUNCH_READING`'s docs given pointers (comments only, values
  and use unchanged; the latter on the main controller's word).

**Unchanged, and why**: the server's host-initiated `forceLaunch` and `HOST_LAUNCH_READING`'s value (OT.R32; the owner
has been asked; item 5 says what the disc shows), the 0.8 share, the 11 s, the host's gate, the clan exclusion, the
bots' fill deciding with no clock. **Open, the port as it is**: the game's listing under the countdown -- the bridge
reports Staging until the launch and admits a join under the countdown, as the host does; the services' answer to the
original's status 3 is the open part (item 4 (c); `CLAN_SWAP_LOCK_PLACEHOLDER`'s window is the same question); the
popup #356 branch (item 4 (a)); item 1 (LATER 998).
