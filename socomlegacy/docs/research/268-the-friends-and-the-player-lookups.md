# 268 -- The friends and the player lookups: PLAYER INFO's lookup, the friends list, FIND PLAYER (SVC-15a, SVC-16, SVC-15)

- Date: 2026-10-11 (web sprint 18, the players' half, wave 2; the plan
  `../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md`, W18.R2, W18.R4).
- Status: **reading, reviewed** (SVC-15a, 2026-10-11; SVC-16's §2, 2026-10-11; SVC-15's §3, 2026-10-12; each by a fresh reviewer before its merge -- b1124aada, 9bd4210b7, 8d6ed4ca1 -- web sprint 18's Log). Every value of the original below is read from the retail
  decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and the ELF's strings
  (`S:0x<addr>`); our Horizon is cited at the `ref/desktop` pin (`desktop@be557831:...`, read by `git show`), evidence
  of the message's shape, not of Sony's server. Unit-tested against that reading (§1.9, §2.9); nothing here is measured
  on the original running -- ONL-32's lookup transcript is the proven level (the page's capture is ONL-30a's), and its
  two-persona runs the friends' (request, confirm, reject, direct add, remove).
- Stands on research [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§1.1 the record, §3 PLAYER INFO's page,
  §5-§6 the order and the owner's calls, H86 call 9 among them), [261](261-the-stats-record-and-the-ladder.md) (§4 the
  codec, §5 the served fields, §9 the ladder, §11 the one decoder and its (e)), [263](263-chat-the-ignore-list-and-moderation.md)
  (§1-§3 FindPlayer, §4 the ignore list) and [265](265-online-options-and-online-filters.md) (§1.3 PLAYER DESCRIPTION,
  §6 the owed login read), and does not restate them.
- Code: `packages/central/src/playerInfo.ts` (`PlayerInfoService`, `seesWhereabouts`, `seatStatus`, `minutesSince` and
  the four names of §1.8); the route `/lobby/player-info` in `packages/central/src/lobbyHttp.ts`
  (`LOBBY_PLAYER_INFO_PATHS`), mounted in `createServices` (`packages/central/src/bridge.ts`); the session's login time
  (`AccountService.loginAt`, `packages/central/src/accounts.ts`); the ladder's rows under the same privacy test
  (`LadderOptions.sees`, `LadderService.list`'s asker, `packages/central/src/ladder.ts`); the modern route's rows
  (`ModernHttpOptions.playerInfo`, `packages/central/src/modernHttp.ts`); the page's own-stats read
  (`OnlineOptionsCommands.readOwnRecord`, `recordDescription`, `OWN_RECORD_BY_NAME_ADAPTATION` in
  `packages/ui/src/screens/onlineOptionsCommands.ts`; `fetchPlayerInfoService`, `sessionPlayerInfo` and state 11's
  handler in `packages/viewer/src/worldOfSocomHost.ts`; the transport wired in `packages/viewer/src/frontEnd.ts`).
  Section 1 is SVC-15a's; section 2 (the friends, SVC-16) is written (its code: `packages/central/src/friends.ts`, §2);
  section 3 (the room's PLAYER LIST, the lookups' presence, ONL-30a's and SVC-16's owed lines: SVC-15) is written (its
  code: §3's head).

## 1. PLAYER INFO's lookup, without friends (SVC-15a)

*Added 2026-10-11 (web sprint 18, wave 2; W18.R4). Reading, reviewed (at its merge, b1124aada).*

### 1.1 What the original asks, and what its page reads

- **The request** is `PlayerInfo` (Lobby 0x31; its reply 0x32: desktop@be557831:server/horizon-server/RT.Common/Types.cs:623-624),
  **by account id**. PLAYER INFO's poster `FUN_002efe50` (D:L191683-191719) reads the id from a UI variable's text
  (`FUN_00191490`, `strtol` base 10, D:L9969-9978; its one caller `FUN_00279b50` D:L124078-124093), fills the 0x2c-byte
  request (D:L191699-191701) and posts it through `FUN_00648d30` (D:L191717; D:L560860-560880) with PLAYER INFO's
  page `FUN_002f0020` as its callback. The origin list rides in the request's 21-byte MessageID -- BRIEFING
  (S:0x3f4c18, also the default), CLAN (S:0x3f4c28), FRIEND (S:0x3f4c30), LADDER (S:0x3f4c38) (D:L191702-191716;
  research 155 §3's four tags) -- which the reply echoes and the page compares (D:L191791, D:L191825, D:L191859).
  *(Corrected 2026-10-11, SVC-15a's review: the first text named S:0x3f4c28 "a fourth" and the clan's branch the
  friends list.)*
- **The page reads three fields of the reply**: the status (+0x18, Success only, D:L191788), the name (+0x1c,
  D:L191934 / D:L191937) and the record (+0x48, parsed by `FUN_002f9ac0` at D:L191790). The reply's PlayerStatus
  (+0x40 in Horizon's layout, desktop@be557831:server/horizon-server/RT.Models/Lobby/MediusPlayerInfoResponse.cs:19-24)
  is **not read**: the presence lines come from the list the page was opened from -- the ladder's row (D:L191791-191823:
  its online state, and the row's position replacing +0x08 at D:L191821), the clan's list at 0x44f740 through
  `FUN_002e9460` (D:L191825-191857; its entry's +0x1d0 replacing +0x08 at D:L191855), the friends list
  (`FUN_00301c40`, 0x44fdc0; D:L191859-191890), or the room's player list (`FUN_002e4470` / `FUN_002e3610`, 0x44f568;
  D:L191891-191929) -- and an origin with no entry leaves the state 0, NOT CURRENTLY LOGGED IN
  (S:0x3f4dc0, D:L192014-192017); otherwise ONLINE: `%d min.` of the record's +0x0c (S:0x3f4d38, D:L192022) and the
  BRIEFING ROOM / GAME lines (D:L192026-192057).
- **Any other status**: the page's first panel says "Could not retrieve player information." (S:0x3f4ee0), the two
  others a blank (D:L192140-192143). No dialog.
- **The login's own read** is the same request with the session's own account id (`FUN_002fa870` D:L198347-198363, the
  id at D:L198359), asked at each entry into the lobby's state 11 (`FUN_002ee540` D:L190794-190797; §1.7).
- **Horizon** (desktop@be557831:server/horizon-server/Server.Medius/Medius/MLS.cs:1399-1437): a logged-in sender only;
  the account read from the database by id (MLS.cs:1409); found -- Success, the name, the session's status or
  Disconnected, Ethernet, the stored blob whole (MLS.cs:1416-1425); not found -- NoResult alone (MLS.cs:1429-1433).

### 1.2 The answer: the record served live

`PlayerInfoService.lookup(asker, { accountId } | { name })` answers `{ status, accountName, playerStatus, stats }` --
the reply's status, name, PlayerStatus and record (the record as 512 hex digits, as the ladder's rows carry theirs).
The record is the stored blob decoded and encoded by the one codec (`accountStatsCodec.ts`, W18.R2; a blob that is not
`'E'` is the default record, `FUN_002f9ac0` D:L198207-198222) and served (`serveAccountStats`) with:

- **+0x08, the live ladder position**: the ladder's order now (`LadderService.standing`; the order SVC-13 builds and
  SVC-07 keeps against the store's revision), 0 off the board -- what the position answer gives off it
  (`LadderService.position`'s NoResult) -- never the stored +0x08, the poster's last-heard position (`DAT_0044f7f8`,
  `FUN_002fab80` D:L198555; research 261 §11 (e));
- **+0x0c, the live minutes**: whole minutes since the account's current login (`AccountService.loginAt`, the
  session's `born`, kept across a restart), 0 when it is not logged in -- the client's own `(now - login) / 60` at each
  build (`FUN_002fab80` D:L198525-198532), as an unsigned word (`minutesSince`);
- every other field as stored. The tests hold that the bytes the build writes (+0x00..+0xe0) differ from the stored
  blob's at +0x08..+0x0f only (§1.9).

Horizon serves the stored blob whole (MLS.cs:1413-1414, 1424); the two live fields are what the client builds into the
record at every post and what a server that serves the record fills instead (SVC-12c's OT.R18 note, research 261 §5;
`STATS_SERVED_FIELDS_PLACEHOLDER` keeps its row there for the ladder list's minutes, still as stored).

**By name** (the page's own read, §1.7): the store's name lookup (case-folded), the one FindPlayer's search uses
(`chat.ts`'s `accountByName`), without FindPlayer's "on the lobby" gate -- PlayerInfo by id has none (Horizon reads the
database, MLS.cs:1409). The original sends no PlayerInfo by name: its name searches are FindPlayer's.

### 1.3 Not found

- **By id**: `PLAYER_INFO_NOT_FOUND_READING` -- NoResult (1), Horizon's (MLS.cs:1429-1433), with an empty name, status
  Disconnected and no record. The client's half is read: Success or not (D:L191788), every other status drawn alike
  (D:L192140-192143). Which status Sony's server sent is unobserved.
- **By name**: FindPlayer's AccountNotFound (`FIND_PLAYER_NOT_FOUND` -998, desktop@be557831:server/horizon-server/RT.Common/Types.cs:72),
  the name echoed as FindPlayer echoes it (MLS.cs:1370-1379) -- the answer the console reads as MP_PLAYER_NOT_FOUND
  after its FindPlayer (the whisper's `FUN_002f4a20` D:L194614-194619; the ignore list's `FUN_00300db0`
  D:L202258-202262; and the client's own lists' misses, before any request, S:0x3f4130 posted at D:L186870,
  D:L186920, D:L186957 and on).
- **The brief's line** read "an unknown account: the original's not-found status ..., which the page reads as
  MP_PLAYER_NOT_FOUND": the reading is split as above -- the PLAYER INFO page itself shows no MP_PLAYER_NOT_FOUND; that
  dialog is FindPlayer's.

### 1.4 PROFILE-PRIVACY (W18.R4; H86 call 9, answered by OT.R33)

The rule as answered: the record, hometown and description to anyone logged in; where a player is to his friends and
his roommates only; no page on the web site. Built:

- **The record to anyone logged in.** The route answers a bearer only (`identify`, 401 without), and the record goes to
  every asker -- its hometown (+0x60) and description (+0x9f) among it.
- **Where he is: one test, `seesWhereabouts(seats, asker, target, friends)`** -- the player himself; a roommate (the
  asker in the same briefing room, or seated in the same game, by the room service's `roomOf` / `gameOf`); or a friend
  (`friends`, the one hook SVC-16 fills: `PROFILE_FRIENDS_PLACEHOLDER` until it did; now the asker's own list, §2.6). The lookup
  (`PlayerInfoService.sees`) and the ladder's rows (`LadderOptions.sees`, §1.5) read the same function.
- **To one who may**: PlayerStatus the room service's seat (`PLAYER_INFO_STATUS_READING`: in a game InGameWorld 3, in
  a room InChatWorld 2, else Disconnected 0 -- the port's narrowing of Horizon's session status, MLS.cs:1422, as the
  ignore list's `IGNORE_PLAYER_STATUS_READING`) and the live minutes.
- **To anyone else**: PlayerStatus `PLAYER_INFO_WITHHELD_STATUS_READING` -- Disconnected: `MediusPlayerStatus` has no
  "on line, place withheld" (desktop@be557831:server/horizon-server/RT.Common/Types.cs:155-163), and Disconnected is
  the state the page draws as NOT CURRENTLY LOGGED IN (D:L192014-192017) -- and **the minutes 0**, an account not
  logged in's, since live minutes say he is on line. The rest of the record (the live position among it) is the
  same for everyone. The withheld answer tells a stranger no more, here, than an account logged off would; it does
  not make his being on line secret: FindPlayer and the ignore list still tell it (§1.5 item 4).

### 1.5 The deviations (each from the original, which had no privacy rule)

1. **PlayerInfo's presence status** is withheld from a stranger (Horizon answers every asker the session's status,
   MLS.cs:1422). The original page does not read the field (§1.1), so on the console's own page nothing changes; the
   port's page may.
2. **The record's +0x0c** is 0 for a stranger, where it is live for a roommate, a friend and the player himself.
3. **The ladder's rows** (`/lobby/ladder-list`, `LadderService.list(req, asker)`): a row whose account the asker may not
   see the whereabouts of carries the empty online state -- Horizon's every row's (MLS.cs:1120-1123), which a PLAYER
   INFO opened from the ladder draws as NOT CURRENTLY LOGGED IN (D:L191791-191822, D:L192014-192017) -- where the
   original showed every ladder reader the row's state. W18.R4 names the ladder with PLAYER INFO ("what PLAYER INFO and
   the ladder show whom"); without it the page opened from the ladder would show any reader where the player is,
   which the lookup withholds. A call without an asker (`list(req)`) keeps every row's state.
4. **The paths that still tell whether, or where, a player is** (not changed here; for SVC-15, or the owner). *Each
   decided 2026-10-12 by SVC-15 (§3.3): the ignore list's status withheld under the rule (the hook built and wired,
   `bridge.ts:836`, the seat's 378a7f424); FindPlayer kept (no place in its answer); the clan roster left unwired; `/modern/lobby-members`
   unchanged (H190); the PLAYER LIST built for the asker's own room (§3.2).*
   - **The ignore list's PlayerStatus** (`ignore.ts:130`, `IGNORE_PLAYER_STATUS_READING`, research 263 §4): in a game,
     in a room or neither, to the ignorer, as the original's list did; `add` (`ignore.ts:145`) takes any account with
     no "on the lobby" check, so any player can ask it of anyone.
   - **FindPlayer** (`chat.ts:170-174`, `onLobby` at `:229-231`): a name is found only while its account is in a room
     or a game, so its answer says whether the player is on the lobby -- the original's search, as Horizon answers it
     (logged in or not, MLS.cs:1370-1379).
   - **The clan roster** (`clans.ts:588-599`, `roster`): each member's online state from `presence?.(id)`, to any
     asker for any clanId. Nothing is wired today -- `createServices` builds the `ClanService` with no presence
     (`bridge.ts:874`), so every row is offline (`ROSTER_ONLINE_STATE_READING`) -- but once that presence is wired it
     must go through `seesWhereabouts` (owed, §7). It is the CLAN origin's source of PLAYER INFO's presence lines
     (§1.1).
   - **The modern lobby browser** (`/modern/lobby-members`, `modernHttp.ts:96-112`, MU-3; a browser adaptation, MU.R6):
     any bearer is given the names in every briefing room without a password and every open game's seats. What the
     original shows one who is not in the room or the game: the room list's and the game list's rows carry counts
     and names of worlds, not of players (`ChannelListEntry`, `GameListEntry` in `lobby.ts`, SVC-06's transcription,
     research 154); the room's player list is asked by the client for the world it is entering or in -- `FUN_002f1240`
     (D:L192292-192343) posts it at most every 10 s, one at a time, for `DAT_0066a538`, set from the room's reply as it enters one
     (`FUN_002ed850` D:L190310; D:L184784, D:L184822), its reply read by `FUN_002f13f0` (D:L192348-192437, the status at
     D:L192365; *corrected 2026-10-12 by SVC-15, §3.1: the first text named `FUN_002f10b0`, which reads the CLAN_TAGS arm's
     PlayerInfo replies, §3.4*). Whether the lobby server would answer a player list for a room the asker is not in, and whether any
     request names a game's players to one not seated in it, is **unread**. The route goes past what the console's own
     requests ask; it stands on the owner's MU-H3 words (`modernHttp.ts`'s header) and is left to SVC-15 or the owner.
   - The friends' presence and the PLAYER LIST are SVC-15's ("friends' presence by PROFILE-PRIVACY"), and the ignore
     list's rows belong with them.

### 1.6 The modern route (SVC-12e's (e))

`/modern/account` (MU-4, a browser adaptation) lays out the bearer's own record in PLAYER INFO's rows
(`statsRecord.ts`'s `playerInfoLines`). With `ModernHttpOptions.playerInfo` (mounted in `createServices`) it reads the
record as the lookup serves it to its owner: LADDER POSITION the live position (0 off the board), +0x0c the session's
minutes; without it, the stored record (the tests' own handler). The route's ONLINE / NOT CURRENTLY LOGGED IN row
stays out (presence, not the record; the modern UI's layout, MU.R6): the minutes are carried in the served record, not
drawn. `modernHttp.test.ts`'s pin of the stored position is replaced by the live one.

### 1.7 The page's own record at the login (owed from OPT-15, research 265 §6)

- **The original**: at each entry into state 11, LOGGED IN -- the login's first, and every return from a room or a
  game -- `FUN_002ee540` (phase 1, D:L190794-190797) asks the session's own PlayerInfo (`FUN_002fa870`); its callback
  `FUN_002fa8f0` (D:L198367-198405) on Success (`FUN_002f42d0`, the status is 0, D:L194340-194344; at D:L198381)
  parses the record into the session's copy (D:L198383), copies the PLAYERHOMETOWN valve into it (D:L198384-198390),
  sets `LadderRating` from the rating (D:L198392-198398), sets `PlayerDescription` from the copy's +0x9f
  (D:L198401-198402) and posts a record that was not `'E'` back (D:L198403-198405).
- **The port**: the mount (`connectWorldOfSocom`) gives state 11's entry to `OnlineOptionsCommands.readOwnRecord`,
  which asks `/lobby/player-info` with the session's ticket and, on Success, adds `PlayerDescription` and sets it to the
  record's +0x9f -- up to its first NUL or the 66-byte field's end, one character a byte; '' for a record that is not
  `'E'` (the default, zero-filled). Another status, no answer, no ticket or no login: nothing changes. A 401 is the
  session lost (`sessionLost`), as the other ticket-bearing requests.
- **By name** (`OWN_RECORD_BY_NAME_ADAPTATION`, a browser adaptation of the request): the page's login answers a
  ticket and no account id (SVC-03), so it asks by the session's account name, which the services resolve (§1.2).
- **What it fixes**: TRIANGLE's discard after a reload now has the stored text to restore (265 §6's cost);
  `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER` is retired (265 §6).
- **Not built here**: the hometown's copy, `LadderRating`, and the post of a record that was not `'E'` (the page posts
  no record: W22.R1, OT.R18).

### 1.8 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `PLAYER_INFO_NOT_FOUND_READING` (server `playerInfo.ts`) | `LOBBY_STATUS.NoResult` (1) | the status a PlayerInfo by account id answers for no such account: Horizon's NoResult (MLS.cs:1429-1433); the client draws every non-Success alike (`FUN_002f0020` D:L191788, D:L192140-192143), so the value is Horizon's, Sony's unobserved (§1.3) | ONL-32's transcript of a PlayerInfo for an unknown account | reading |
| `PLAYER_INFO_WITHHELD_STATUS_READING` (server `playerInfo.ts`) | `PLAYER_STATUS.Disconnected` (0), and the minutes 0 | PROFILE-PRIVACY's presence for an asker who may not see where the player is: `MediusPlayerStatus` holds no "on line, place withheld" (Types.cs:155-163); Disconnected is the page's NOT CURRENTLY LOGGED IN (D:L192014-192017) (§1.4) | nothing in the original (no privacy rule); the owner, if he rules another neutral answer | reading |
| `PLAYER_INFO_STATUS_READING` (server `playerInfo.ts`) | `'in a game 3, in a room 2, logged in the menus' lobby 2, else Disconnected 0'` | PlayerInfo's PlayerStatus for one who may see it: the room service's seat, and logged in in no room the menus' lobby's status (`seatStatus`'s `loggedIn`, `MAIN_MENU_PRESENCE_PLACEHOLDER`; 2026-10-16, CLAN-DOT, research 272 §12 -- the port's narrowing to Disconnected retired), where Horizon answers the session's status (MLS.cs:1422); the page does not read the field (D:L191791-191929) (§1.4) | ONL-32's transcript of a PlayerInfo for a player on the menus | reading |
| `PROFILE_FRIENDS_PLACEHOLDER` (was server `playerInfo.ts`) | `'no friends until SVC-16'` | who is the asker's friend for PROFILE-PRIVACY: none; `PlayerInfoWorld.friends`, read by `seesWhereabouts`, is the one check SVC-16's list plugs into (§1.4) | SVC-16's friends list | retired 2026-10-11 by SVC-16 (§2.6): `FriendService.isFriend` over the store's lists |
| `OWN_RECORD_BY_NAME_ADAPTATION` (ui `screens/onlineOptionsCommands.ts`) | `'the own record asked by the account name'` | no original: the console asks its own PlayerInfo by account id (`FUN_002fa870` D:L198359); the page holds none (§1.7) | nothing to settle: a labelled adaptation of the request | adaptation |
| `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER` (was ui `screens/onlineOptionsCommands.ts`; research 265 §6) | -- | the login's own-stats read, not built | -- | retired 2026-10-11 by SVC-15a (§1.7): `readOwnRecord` at state 11's entry |

The four server names are §5 exclusions of research 101 (the online services' own; 2026-10-11).

### 1.9 The tests, and the runs (unit tests only; no browser, no capture)

- `packages/central/test/playerInfo.test.ts` (new): a seeded account's answer -- Success, the name, the stored record
  with the live position (2, behind a 1600) and minutes (7 after 7.5) and no other field changed, the build's bytes
  differing at +0x08..+0x0f only; off the board 0, not logged in 0; the position following the order without a write;
  `minutesSince`'s edges; a zero blob served as the default; by name the same answer as by id; an unknown id NoResult,
  an unknown name -998; PROFILE-PRIVACY -- a roommate in the room (InChatWorld, the minutes), a stranger (withheld, 0,
  the record whole), the same game (InGameWorld), himself, the friends hook; the ladder's rows under the same test; the
  route -- the bearer required (401), another Origin 403, nine bodies no page sends 400, absent without the service
  (404); mounted by `createServices` with two logins over a clock -- a stranger's read with the position and no
  minutes, the owner's own by name with 10 minutes, an unknown id NoResult, no bearer 401.
- `packages/central/test/modernHttp.test.ts`: SVC-12e (e)'s pin of the stored position replaced -- without the lookup
  the stored 7; with it 0 off the board, then 2 behind a 1300, the stored +0x08 untouched.
- `packages/ui/test/screens/onlineOptionsScreen.test.ts`: the own-stats read by the account's name sets
  `PlayerDescription` from +0x9f; the field read to its end, a non-`'E'` record's ''; another status, no answer, no
  service or no login leave the variable absent; a reply that lands after another login (the session's ticket
  changed) changes nothing (the review's finding 4, 2026-10-11).
- `packages/viewer/test/worldOfSocomHost.test.ts`: `fetchPlayerInfoService`'s request (`{ name }`, the bearer, no
  credentials, not cached) and its readings (401 the session lost, other refusals and shapes rejected); the mount gives
  state 11's entry (phase 1, not 2) to the read; no ticket no request; a 401 the session lost; a reply after a new
  login changes nothing, and `sessionPlayerInfo` rejects an answer whose ticket is no longer the session's.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 2. The friends, with the original's confirmation (SVC-16)

*Added 2026-10-11 (web sprint 18, wave 2; W18.R5, W18.R4). Reading, reviewed (at its merge, 9bd4210b7).*

Code: `packages/central/src/friends.ts` (`FriendService`, `FRIEND_STATUS`, `FRIEND_MESSAGES` and the names of §2.8); the
store's pending requests (`AccountRecord.friendRequests`, `FriendRequestRecord`, `addFriendRequest` /
`dropFriendRequest` / `acceptFriendRequest`, schema 6's `friend_requests` in `packages/central/src/serviceStore.ts`); the
routes `LOBBY_FRIEND_PATHS` (`packages/central/src/lobbyHttp.ts`); the mount and PROFILE-PRIVACY's friends hook in
`createServices` (`packages/central/src/bridge.ts`; `PlayerInfoWorld.friends`, `packages/central/src/playerInfo.ts`).
Research 97 §2.3 mapped the friends' messages first; this section re-reads each link at the source, corrects it where
it differs (§2.1, last items) and builds the server's half. The page's FRIENDS screen is ONL-24's (research 269).

### 2.1 What the console sends and expects (W18.R5)

The ids are the client's own registrations (`FUN_0064db00` D:L564041-564312, read from the ELF by
`tools/dump-medius-ids.ts --all`: a slot's id is its ordinal in its class, research 97 R97.1), the names Horizon's
(desktop@be557831:server/horizon-server/RT.Common/Types.cs:635-644, :788-789, :836-840), the statuses
`MediusCallbackStatus` (Types.cs:72-138). The dialog is `dlgFriendList.rdr` (`tools/dump-dialogs.ts --dialog
dlgFriendList.rdr`; its program's names in order of first use, `--set 'dlgFriendList\.rdr'`), the captions UIMnLOC
308-337 (read through `parseLocTable`, the reader `dump-dialogs.ts` uses).

| step | the console's side | the message (slot, length; fields) | its reply and the reader | Horizon at the pin |
|---|---|---|---|---|
| ADD NEW FRIEND (308; 323 "Invite someone to your Friends list.") | `OnAddNewFriendPress`: the name typed into `PLAYER_FRIEND_NAME` (S:0x3eee20), `AddFriend` = `UIAddFriend` `FUN_0027a050` D:L124254-124269 -> `FUN_003013c0` D:L202483-202544: the name on its friends list (D:L202500), on its list of requests to it (0x44fe00, the name at +0x1c, D:L202514) or its own (0x66a4f4, the session's account name, research 157; D:L202522) raises **MP_PLAYER_IS_FRIEND** (S:0x3f60b0, D:L202535, D:L202541; `PlayerAlreadyFriend` draws caption 335 "You cannot invite yourself, players whom you have already invited, or players who are already on your Friends list.") and sends nothing; else FindPlayer by name, type 1 (D:L202524-202528) | Lobby 0x39 FindPlayer (`FUN_00648f10`, 0x50) | `FUN_003015d0` D:L202547-202580: a failure raises MP_PLAYER_NOT_FOUND (S:0x3f5fe0, D:L202564; caption 334 "That player does not exist or is not currently logged in."); a success takes the account at +0x48 | `MLS.cs:1346` (FindPlayer) |
| the request | `FUN_003015d0` D:L202569-202576, then at once **MP_FRIEND_CONFIRMATION_REQUESTED** (S:0x3f5f60, D:L202576; caption 337 "An authorization request has been sent to that player.") | **LobbyExt 0x05 AddToBuddyListConfirmation** (`DAT_00686c50`, `FUN_006492d8` D:L561069-561089, 0x30: +0 MessageID, +0x15 SessionKey, **+0x28 the account**, **+0x2c 0**) | **Lobby 0x44** (`DAT_00686c58`, handler `FUN_0064c3f8` D:L562814-562823, 0x40, which calls the callback the builder kept, D:L561081): `FUN_00300be0` D:L202178-202189 -- status (+0x18) **2, RequestAccepted**: the friends list asked again (D:L202185-202186); any other: nothing | **none** (no model for LobbyExt 0x05-0x09) |
| the forward | -- | **LobbyExt 0x06 AddToBuddyListFwdConfirmation** to the invitee (`DAT_00686c38`, handler `FUN_0064c428` D:L562826-562835, 0x40: **+0x18 the requester**, **+0x1c his name**, +0x3c a word) | `FUN_003009c0` D:L202089-202108 -- given at the library's init (`FUN_00300840` D:L202025-202045 -> `FUN_00647318`, D:L559817 files it in `DAT_00656238`, which the handler calls): kept on the list of requests (`FUN_00301db0` D:L202828-202881: one an account by +0x18, a record with no name skipped), "%s has invited you to join their friends list." drawn with the name (S:0x3f5f20, D:L202099) | none |
| CONFIRM FRIEND (312; 327 "Allow someone to add you to their Friends list.") / REJECT FRIEND (313; 328 "Prevent someone from adding you to their Friends list.") | `OnConfirmListPress` on the `ConfirmationList` (`FriendConfirmationListVar`, S:0x3f6120, drawn by `FUN_00301810` D:L202654-202682): CONFIRM sends `ConfirmFriend` and calls `AskToAddFriend`; REJECT asks "Are you sure you wish to reject this friend invitation?" and sends `RejectFriend` (the program's names in that order). `UIConfirmFriend` `FUN_00279eb0` D:L124194-124212 -> `FUN_00300a70` D:L202111-202132; `UIRejectFriend` `FUN_00279e10` D:L124173-124191 -> `FUN_00300af0` D:L202135-202156; each drops the request from its list after sending (D:L202130, D:L202154) | **LobbyExt 0x07 AddToBuddyListFwdConfirmationResponse** (`DAT_00686c40`, `FUN_00649378` D:L561092-561111, 0x38: **+0x18 the answer, 2 or -985** (D:L202125, D:L202149: 0xfffffc27, MediusRequestDenied), +0x1c SessionKey, **+0x30 the requester**, +0x34 0) | **none**: the builder keeps no callback (D:L561092-561111) | none |
| the add back (336 "Would you like to add them to your Friends list?") | `AskToAddFriend`: a YES/NO popup, YES `AddFriendDirectly` for the requester just confirmed = `UIAddFriendDirectly` `FUN_00279fb0` D:L124233-124251 -> `FUN_00300b70` D:L202159-202175; the console sends it nowhere else | **Lobby 0x3f AddToBuddyList** (`DAT_00686c30`, `FUN_00649198` D:L561023-561043, 0x2c: +0x28 the account) | Lobby 0x40 (`FUN_0064c380` D:L562790-562799, 0x1c): `FUN_00300c10` D:L202192-202205, Success the list asked again; else nothing | `MLS.cs:543-583`: adds any account (`DbController.cs:807-843`; simulated, an append, `:815-829`), Success or DBError |
| the requests waiting | GetFriendInvitations (`UIGetFriendInvitations` `FUN_0027a2b0` D:L124343-124350 -> `FUN_003012f0` D:L202435-202454, logged in and in state 11 only), from the usage agreement's `retrieve_usage` after each login (research 156 §1.2; no other dialog names it) | **LobbyExt 0x08 GetBuddyInvitations** (`DAT_00686e94`, `FUN_0064b368` D:L562113-562132, 0x15: MessageID only) | **LobbyExt 0x09** per row (`DAT_00686e98`, handler `FUN_0064dad0` D:L564029-564038, 0x48): `FUN_00301350` D:L202457-202480 keeps **+0x1c the account**, **+0x20 the name**, +0x40 the word, through `FUN_00301db0` (a row with no name skipped); status and end of list not read | none |
| REMOVE FRIEND (311; 326; 329 "Are you sure you wish to remove this player from your Friends list?") | `UIRemoveFriend` `FUN_00279980` D:L124017-124035 -> `FUN_003016a0` D:L202583-202598 | **Lobby 0x41 RemoveFromBuddyList** (`DAT_00686c48`, `FUN_00649238` D:L561046-561066, 0x2c: +0x28 the account) | Lobby 0x42 (`FUN_0064c3b8` D:L562802-562811, 0x1c): `FUN_00301710` D:L202601-202614, Success the list asked again | `MLS.cs:585-625`: off the caller's list only (`DbController.cs:850-887`), Success or DBError |
| the list (FRIENDS' ONSTART `OnFriendListStart`; the lobby's ONSTART `get_friend_list`, `dlgWorldOfSOCOM.rdr`) | `UIGetFriendsList` `FUN_0027a2e0` D:L124353-124360 -> `FUN_00301750` D:L202617-202629: the list emptied, then asked | **Lobby 0xd6 GetBuddyList_ExtraInfo** (`DAT_00686e10`, `FUN_0064ae58` D:L561915-561934, 0x15: MessageID only) | **Lobby 0xd7** per row (`DAT_00686e14`, `FUN_0064d0c0` D:L563510-563519, 0xd0): `FUN_003017a0` D:L202632-202651 -- a Success row kept (`FUN_003020a0` D:L202951+: one an account by +0x1c, the row copied whole), the list drawn at the row ending it (+0xcc) or at any other status (`FUN_00301a70` D:L202724-202778: the id, the name +0x20, one glyph for a +0x40 PlayerStatus of 0 and another for the rest, S:0x3f6140 / S:0x3f6148, then the lobby +0x4c and the game +0x8c -- a lobby named "Medius" (S:0x3f6090, six characters compared) drawn "MAIN MENU" and " " (S:0x3f6098, S:0x3f60a8), D:L202759-202762) | `MLS.cs:627-681`: a Success row per friend with its online state, the last ending the list (:666); none, one NoResult row (:672-679) |
| VIEW INFO, the info window | `GetFriendInfo` = `UIGetFriendInfo` `FUN_00279ab0` D:L124057-124075 -> `FUN_00301140` D:L202393-202432: local, from the list (the name, the game +0x8c, the lobby +0x4c into `FriendInfoName` / `FriendInfoGame` / `FriendInfoLobby`, S:0x3f6058-0x3f6080); PLAYER INFO opened from the FRIEND origin copies the row's online state whole (`FUN_002f0020` D:L191859-191890, §1.1) | -- | -- | -- |

**Corrections to research 97 §2.3** (that note is not edited here): (a) AddFriend with the player's own name is not
"nothing": it raises MP_PLAYER_IS_FRIEND (D:L202522, then D:L202535) -- caption 335's "You cannot invite yourself";
(b) "how the X 0x06 handler reaches `FUN_003009c0` is not traced" -- traced above (`FUN_00300840` -> `FUN_00647318`
D:L559817 -> `DAT_00656238` -> `FUN_0064c428`); (c) the request's reply is Lobby 0x44, read by `FUN_00300be0` (status 2
only), which the row did not name; (d) the list the console checks before a request is its list of requests *to* it
(0x44fe00, filled by the forward and GetBuddyInvitations), not "pending" ones it sent: it keeps none of those.

**Horizon** (W18.R5's point): it has the list, the direct add and the remove (`MLS.cs:543-681`) and no confirmation: no
model or handler for LobbyExt 0x05-0x09 (research 97 R97.3). Its Lobby 0x43-0x46 (`AddToBuddyListConfirmationRequest0`
..., Types.cs:641-644) are registered by the client too (`DAT_00686c54`, `DAT_00686c58`, `DAT_00686c3c`, `DAT_00686c44`)
but no builder sends 0x43 or 0x45; 0x44's handler is the LobbyExt 0x05 reply's reader above.

### 2.2 When the request's reply comes, and the pushes

- `FRIEND_CONFIRMATION_REPLY_READING`: Lobby 0x44's one reader acts on status 2 only, so the reply carries the
  invitee's answer; whether Sony's server also answered at once (with another status, which the console would read as
  nothing) is unread. The port answers `/lobby/friend-request` at once with its status -- Success (kept and forwarded)
  or a refusal (§2.4) -- and tells the requester the invitee's answer when it is made: an `answer` event with 2, -985,
  or the cap's status when his list filled meanwhile (the console does the same with all three: only 2 re-asks the list).
- `FRIEND_EVENTS_POLL_ADAPTATION` (a browser adaptation of the transport, as `CHAT_POLL_ADAPTATION`): the forward
  (LobbyExt 0x06) and the reply (Lobby 0x44) are pushes on the console's connection; the HTTP seam has none, so each
  waits in the receiver's mailbox -- only while he is logged in, at most 64, oldest dropped first -- for
  `/lobby/friend-events`. A mailbox lost (a logout, a restart) loses nothing the console would have kept: the requests
  wait in the store for GetBuddyInvitations, and the list is asked again at every lobby entry.

### 2.3 Mutual or one-way (`FRIEND_LIST_ONE_WAY_READING`)

**One way.** A confirmed request puts the invitee on the **requester's** list: it is the requester's console that asks
its list again on the answer 2 (`FUN_00300be0`). The invitee's own list is not changed by it: its console sends LobbyExt
0x07 with no reply awaited, then asks "Would you like to add them to your Friends list?" (336) and on YES sends the
direct add for the requester -- a question that would be pointless if the confirmation had made the lists mutual. So
each list is its owner's; two players are on each other's lists when the invitee says YES (or asks in turn). The remove
takes the account off the remover's list only (Horizon's, `MLS.cs:585-625`; the console asks only its own list again).
Built: `acceptFriendRequest` adds the invitee to the requester's list and takes the request away in one change;
`FriendService.add` is the add back.

### 2.4 The operations built, and their refusals

| route (`LOBBY_FRIEND_PATHS`) | the message | the answer |
|---|---|---|
| `/lobby/friend-list` `{}` | Lobby 0xd6 -> 0xd7 | `{ entries }`: a Success row per friend in the list's order with its online state (§2.6), the last ending the list; none, one NoResult row; the caller unknown, one DBError row |
| `/lobby/friend-request` `{ accountId }` or `{ name }` | LobbyExt 0x05 -> Lobby 0x44 | `{ status }`: past the requester's rate, `FRIEND_REQUEST_RATE_PLACEHOLDER` (-956; every request counts); by name, FindPlayer's answer first (`FRIEND_REQUEST_BY_NAME_ADAPTATION`: found only on the lobby, caption 334; not found -998, the page's MP_PLAYER_NOT_FOUND); an unknown id AccountNotFound (-998); himself, a friend already, a request already waiting from him or from the account to him, or he is on the account's ignore list (`FRIEND_REQUEST_IGNORED_PLACEHOLDER`): `FRIEND_REQUEST_REFUSED_PLACEHOLDER` (-958, the page's MP_PLAYER_IS_FRIEND); his list or the account's waiting requests full: `FRIEND_LIST_CAP_PLACEHOLDER` (-956); his own requests waiting on 16 accounts: `FRIEND_REQUESTS_OUTSTANDING_PLACEHOLDER` (-956); else Success, the request kept and forwarded |
| `/lobby/friend-answer` `{ accountId, status }` (2 or -985 only) | LobbyExt 0x07 | 204: no reply. None waiting from the account: nothing. 2: the invitee added to the requester's list and the request gone in one change (already there: the request gone; the requester's list full meanwhile: the request gone, no one added, the requester told -956). -985: the request gone. The requester told the outcome (`answer` event) |
| `/lobby/friend-invitations` `{}` | LobbyExt 0x08 -> 0x09 | `{ entries }`: a Success row per waiting request in the order asked (the account, the name, the word 0), the last ending the list; none, one NoResult row with no name (which the console skips) |
| `/lobby/friend-add` `{ accountId }` | Lobby 0x3f -> 0x40 | `{ status }`: either account unknown, DBError (Horizon's store false); already listed, Success, one row; not an account whose list holds the adder -- himself among them -- `FRIEND_DIRECT_ADD_READING` (RequestDenied); his list full, -956; else added, Success |
| `/lobby/friend-remove` `{ accountId }` | Lobby 0x41 -> 0x42 | `{ status }`: either account unknown, DBError; not listed, Success, no change; else off the caller's list only, Success |
| `/lobby/friend-events` `{}` | (the pushes) | `{ events }`: `forward` (LobbyExt 0x06: who asked, the word) and `answer` (Lobby 0x44: whom he asked, the status), oldest first, taken |

Every route answers the bearer only (401 without, `identify`), never a body's account. Every body is exact, as
`/lobby/player-info`'s (`exactBody`, `lobbyHttp.ts`; the fix round of SVC-16's review): no key but its own, an id a
positive safe integer, a name a string that fits the account name's field (31 bytes), the three reads `{}`; a body no
page sends is 400 (a request with both keys or neither, an answer with a status the console does not send, an extra
key, an id of 0 or less).

- **The hardening** (deviations under OT.R26, the original's server unread; added by the fix round of SVC-16's review,
  its F1 and F2). Without them 64 accounts could each ask every account and fill every waiting list, so a genuine
  request would be refused -956, and ask again after each rejection:
  - `FRIEND_REQUESTS_OUTSTANDING_PLACEHOLDER`: one account's requests waiting on others at once, at most 16 -- the one
    client number for invitations one sends (`CanInviteMorePlayersToClan`: the roster and the invitations sent under
    16, research 97 R97.6) -- the next MaxExceeded; an answer frees its place.
  - `FRIEND_REQUEST_RATE_PLACEHOLDER`: one requester's requests, every one counted whatever its answer, at most 10 in 15
    minutes from the window's first -- the login attempt limit's numbers (`LOGIN_ATTEMPTS_PLACEHOLDER`,
    `LOGIN_WINDOW_MS_PLACEHOLDER`), the password tries' windowed counter (`PasswordTries`, `limits.ts`) -- the next
    MaxExceeded until the window ends. **The re-ask after a rejection is kept** (whether Sony's server refused it is
    unread): this limit bounds it.
  - `FRIEND_REQUEST_IGNORED_PLACEHOLDER`: a request from an account on the invitee's ignore list (SVC-17's, `ignore.ts`)
    refused with `FRIEND_REQUEST_REFUSED_PLACEHOLDER` -- the requester cannot tell it from an earlier request of his --
    nothing kept and nothing forwarded. The console's ignore list filters lines only (research 263 §4.2); the port keeps
    an ignored player from pushing requests at the one who ignores him. One way: the ignorer may still ask.

- **The direct add** (`FRIEND_DIRECT_ADD_READING`): AddToBuddyList adds without a confirmation, and the console sends it
  in one place only, `AskToAddFriend`, for the requester it has just let add it. The port accepts it only toward an
  account whose list holds the adder -- what that confirmation has just made -- and refuses any other RequestDenied
  (-985), a failure the console does not show (`FUN_00300c10`). Horizon adds any account; the original's server is
  unread. The narrowing is W18.R4's: where a player is goes to his friends, so a direct add to anyone would make anyone a
  "friend" without his consent.
- **The refusals the console makes itself** (MP_PLAYER_IS_FRIEND for himself, a friend, one who asked him) are made by
  the server too, for a page that is not the console; the one it cannot make -- a second request to the same player,
  caption 335's "players whom you have already invited", since it keeps no list of what it sent -- was the server's, and
  its status is unread (`FRIEND_REQUEST_REFUSED_PLACEHOLDER`: one status, DataAlreadyExists, for the one dialog).
- **The cap** (`FRIEND_LIST_CAP_PLACEHOLDER`): the client has none and no "list full" message (no `MP_FRIEND_*_FULL` in
  the ELF's strings; a refused request or direct add shows nothing). Its friends list is a vector of pointers no boot
  step sizes (`FUN_00402420` D:L328705-328708) that grows with every row (`FUN_003020a0`); its list of requests to it is
  sized to 64 empty records at boot (D:L328717) and grows past them. 64 -- the client's one number, as the ignore list's
  (`IGNORE_LIST_CAP_PLACEHOLDER`, research 263 §4.3) -- for the friends list (the requester's at the request and again at
  the confirmation, the adder's at a direct add) and for the requests waiting on one account; MaxExceeded (-956).

### 2.5 The store: the pending requests and the schema step

- **Where they live.** No existing table holds them: `account_lists` keeps a list's order only, its `kind` checked to
  `'friend'` or `'ignored'` (schema 1) and no time; `clan_invitations` is a clan's. So a schema step, as SVC-03a's: the
  **document's version 4 -> 5** (`SERVICE_STORE_VERSION`), each account's `friendRequests` -- the requests waiting for
  its answer, `{ from, at }` (who asked, when: the store's clock), in the order asked, one a pair, never from itself --
  and the **database's schema 5 -> 6** (`SERVICE_DB_SCHEMA`), the table `friend_requests (account_id, pos, from_id, at)`
  (STRICT; both ids accounts, `from_id <> account_id`, one row a pair), written and read with its account's lists.
- **The migration** (held by `serviceStoreMigration.test.ts`): a schema 5 database is backed up to `services.v4.backup`
  at version 4 (research 131 §5's format) inside the open's write lock, then migrated once, every account with none
  pending; a version 4 document (a `services.json`, a backup) migrated as it is read (`migrateDocument`); every older
  version's backup writer drops the field; a newer version or schema refused (R131).
- **A request's life** (`FRIEND_REQUEST_LIFE_PLACEHOLDER`): kept until its account answers it -- across logouts and
  restarts: the console asks for its waiting requests after every login (§2.1), so the original's server kept them past a
  session. A confirmation or a rejection takes it away; nothing else does. No expiry is read: none built.

### 2.6 PROFILE-PRIVACY's friends, and the list's online state

- **The hook filled** (§1.4; `PROFILE_FRIENDS_PLACEHOLDER` retired): `PlayerInfoWorld.friends` is
  `FriendService.isFriend(asker, target)` -- the asker's own list holding the target. With the confirmation that is a
  player who agreed: he confirmed the asker's request, or asked first himself and was confirmed (the add back). So
  `seesWhereabouts` gives a friend PLAYER INFO's presence status and live minutes, and the ladder's rows their online
  state (§1.5 item 3), where a stranger is answered the withheld state; one way, as the lists: the confirmed requester
  sees the invitee, not the reverse until the add back.
- **The list's online state** (`FRIEND_ONLINE_STATE_READING`): the presence hook's -- in createServices the room
  service's seat (`roomPresence`, as `LADDER_ONLINE_STATE_READING`): in a game InGameWorld, in a room InChatWorld, with the
  world ids and names; else Disconnected, the ids -1 and the names empty (Horizon: the game -1 and the lobby its default
  channel's id, `MLS.cs:652-656`) -- shown only where `sees` lets the asker (PROFILE-PRIVACY's one test; for a row of his
  own list it does). A friend logged in but in no room is Disconnected, where Horizon answers his session's status and
  the original drew "MAIN MENU": the port's narrowing, as `IGNORE_PLAYER_STATUS_READING`.

### 2.7 The deviations

- **From Horizon**: the confirmation itself (W18.R5: LobbyExt 0x05-0x09, none of which Horizon models); the direct add
  narrowed (`FRIEND_DIRECT_ADD_READING`); the refusals (`FRIEND_REQUEST_REFUSED_PLACEHOLDER`) and the cap
  (`FRIEND_LIST_CAP_PLACEHOLDER`), where Horizon appends anything (`DbController.cs:815-829`); an account already listed
  is not listed twice (Horizon's simulated store would add a second row).
- **From the original** (each named): the reply's timing (`FRIEND_CONFIRMATION_REPLY_READING`); the pushes polled
  (`FRIEND_EVENTS_POLL_ADAPTATION`); the request by name in one call (`FRIEND_REQUEST_BY_NAME_ADAPTATION`); a friend on
  the menus Disconnected (`FRIEND_ONLINE_STATE_READING`); and PROFILE-PRIVACY over the list's online state, which the
  original showed every list owner (for a row of one's own list the rule shows it: no difference today).
- **From both, hardening** (OT.R26): the outstanding cap, the rate limit and the ignored requester's refusal (§2.4).
- **Not changed, for the owner** (the original's, kept under the parity rule; confirmed at the client by SVC-16's
  review): a player cannot take himself off another's list. Once he has confirmed, the requester sees where he is until
  the requester removes him; his own REMOVE FRIEND takes the requester off *his* list only. A rule otherwise is the
  owner's to give (it would change what the original did): the plan's H-next d; none is built.

### 2.8 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `FRIEND_LIST_CAP_PLACEHOLDER` (server `friends.ts`) | `{ entries: 64, pending: 64, status: -956 }` | the most friends a list holds and requests waiting on one account, and the status past either: the client has no cap and no message (§2.4); 64 its one number (the requests' boot count, `FUN_00402420` D:L328717), as the ignore list's | ONL-32's transcript of a request past the original's cap | placeholder |
| `FRIEND_REQUEST_REFUSED_PLACEHOLDER` (server `friends.ts`) | `FRIEND_STATUS.DataAlreadyExists` (-958) | the status of a request to himself, a friend, one already asked, or one who asked him: the console refuses all but the third itself (MP_PLAYER_IS_FRIEND, D:L202500-202541) and reads no status (`FUN_00300be0`); caption 335 names the third, so the server refused it, unread (§2.4) | ONL-32's transcript of a second request to the same player | placeholder |
| `FRIEND_LIST_ONE_WAY_READING` (server `friends.ts`) | `'a confirmation puts the invitee on the requester\'s list only'` | the mutual rule: the requester's console re-asks its list on 2 (D:L202185-202186); the invitee's is asked "add them?" (336) and sends the direct add (§2.3) | ONL-32's two-persona transcript of a confirmation and both lists after it | reading |
| `FRIEND_DIRECT_ADD_READING` (server `friends.ts`) | `'only toward an account whose list holds the adder; else RequestDenied'` | when AddToBuddyList is accepted: the console sends it only in `AskToAddFriend`, after its confirmation; Horizon adds any account; W18.R4's narrowing (§2.4) | ONL-32's transcript of a direct add to a stranger | reading |
| `FRIEND_REQUESTS_OUTSTANDING_PLACEHOLDER` (server `friends.ts`) | `{ entries: 16, status: -956 }` | a hardening deviation (OT.R26): one account's requests waiting on others at once, and the status past it; 16 the client's invitations-sent number (`CanInviteMorePlayersToClan`, research 97 R97.6) (§2.4) | the owner, or ONL-32's transcript of many requests | placeholder |
| `FRIEND_REQUEST_RATE_PLACEHOLDER` (server `friends.ts`) | `{ requests: 10, windowMs: 900000, status: -956 }` | a hardening deviation (OT.R26): one requester's requests in a window, every one counted; the login attempt limit's numbers; it bounds the re-ask after a rejection (§2.4) | the owner | placeholder |
| `FRIEND_REQUEST_IGNORED_PLACEHOLDER` (server `friends.ts`) | `'refused as an earlier request; nothing forwarded'` | a deviation: a request from one on the invitee's ignore list refused with `FRIEND_REQUEST_REFUSED_PLACEHOLDER`, nothing kept or forwarded (§2.4) | the owner | placeholder |
| `FRIEND_REQUEST_LIFE_PLACEHOLDER` (server `friends.ts`) | `'kept until answered; no expiry'` | how long a request waits: past a logout (the console asks its waiting ones after each login); no expiry read (§2.5) | ONL-32's transcript of a request left unanswered across days, or the owner | placeholder |
| `FRIEND_CONFIRMATION_REPLY_READING` (server `friends.ts`) | `'the request answered at once; the invitee\'s answer told when made'` | when Lobby 0x44 comes: its reader acts on 2 only, so it carries the answer; an immediate reply unread (§2.2) | ONL-32's transcript of a request and its confirmation | reading |
| `FRIEND_ONLINE_STATE_READING` (server `friends.ts`) | `'the room service\'s seat; logged in in no room the menus\' lobby; offline Disconnected, ids -1, names empty'` | a list row's online state: the room service's seat; a friend logged in and in no room the menus' lobby, which the original draws "MAIN MENU" (D:L202759-202762; `roomPresence`'s `loggedIn`, the three `MAIN_MENU_*_PLACEHOLDER`s below; 2026-10-16, CLAN-DOT, research 272 §12 -- the port's narrowing to Disconnected retired) (§2.6) | ONL-32's transcript of a list with a friend on the menus | reading |
| `MAIN_MENU_PRESENCE_PLACEHOLDER` (server `ladder.ts`; the friends' `roomPresence` in `bridge.ts`) | `PLAYER_STATUS.InChatWorld` (2) | the status a logged-in account in no room and no game answers: the console on the menus sits in a lobby world the roster's builder (`FUN_002e6af0` D:L186670) and the friend list's (D:L202759-202762) draw MAIN MENU; the value a reimplementation's -- Horizon's session status, logged in and not in a game InChatWorld (`desktop@be557831 Server.Medius/Medius/Models/ClientObject.cs:300-309`, its roster `MLS.cs:1702`) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript of a roster or friend row for a member on the menus | placeholder: a reimplementation's figure |
| `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (server `ladder.ts`) | `'Medius'` | that account's lobby world's name: both builders test its first six characters against "Medius" (S:0x3f4020, S:0x3f6090) and draw MAIN MENU; Sony's name for the world is not on the disc (Horizon's default channel "Default", `Models/Channel.cs:27` at be557831, would not draw it) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `MAIN_MENU_LOBBY_WORLD_ID_PLACEHOLDER` (server `ladder.ts`) | `-1` | that world's id (+0x144): Horizon's for a client in no channel (`MLS.cs:1706` at be557831, a reimplementation); no list draws it, PLAYER INFO copies it (D:L191830-191854) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `FRIEND_ADD_TYPE_READING` (server `friends.ts`) | `0` | the word at the request's +0x2c (0, D:L202571), the forward's +0x3c and the waiting row's +0x40 (kept, never read: D:L202477, `FUN_00301db0`): carried as sent | ONL-32's transcript of a request | reading |
| `FRIEND_EVENTS_POLL_ADAPTATION` (server `friends.ts`) | `'the receiver\'s pushes wait for its poll'` | no original: LobbyExt 0x06 and Lobby 0x44 are pushes; the HTTP seam polls (§2.2) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `FRIEND_REQUEST_BY_NAME_ADAPTATION` (server `friends.ts`) | `'a name resolved by FindPlayer\'s rule'` | no original: the console's FindPlayer then LobbyExt 0x05 in one call (§2.4) | nothing to settle: a labelled adaptation of the request | adaptation |
| `PROFILE_FRIENDS_PLACEHOLDER` (was server `playerInfo.ts`; §1.8) | -- | PROFILE-PRIVACY's friends, none | -- | retired 2026-10-11 by SVC-16 (§2.6): `FriendService.isFriend` over the store's lists |

The eleven server names are §5 exclusions of research 101 (the online services' own; 2026-10-11: eight, then three
with the fix round).

### 2.9 The tests, and the runs (unit tests only; no browser, no capture)

- `packages/central/test/friends.test.ts` (new): the vocabulary (the statuses, the seven messages' ids and lengths, the
  named values); request -> confirm (the requester's list holds the invitee, the invitee's not; the forward and the
  answer told once); the add back (both lists; a second add one row); request -> reject (neither; -985 told; asked again
  afterwards); an answer with nothing waiting; the four refusals; an unknown id; by name only on the lobby; the cap at
  the request and filled before the confirmation; the cap on waiting requests; a request kept across the store's reopen
  with its time and answered after it; no push to an account logged off, its request kept; the direct add refused
  toward a stranger and himself, DBError for an unknown, and refused once the target removed the adder; the remove one
  way; the hardening (the fix round) -- the outstanding cap refusing the 17th and freed by an answer, the rate limit
  refusing a burst's 11th, per requester, admitting again after the window, the re-ask after rejections bounded by it,
  an ignored requester refused with nothing pushed or kept (the ignorer still may ask); the list -- NoResult, the rows in order, the
  online state from the room service, nothing shown where `sees` refuses; the endpoint -- the seven paths, the flow over
  HTTP for the bearer, 403 / 401 / 405, the 400s of the exact bodies (extra keys, ids of 0 or less, a name past 31
  bytes or empty, a read with a key), absent without the service (404); mounted by `createServices` with three
  logins: a request by name, the forward, the confirmation, the list's state, PLAYER INFO's presence for the friend and
  withheld for a stranger and for the invitee, then after the add back shown to the invitee.
- `packages/central/test/playerInfo.test.ts`: SVC-16's hook from the store's lists -- a request alone shows nothing, the
  confirmed requester sees the invitee's room and minutes, a stranger the withheld state and no minutes, the invitee not
  the requester (one way).
- `packages/central/test/serviceStoreMigration.test.ts`: the versions 5 and 6 and the table; a schema 5 database backed
  up at version 4 and migrated once (friends and chains kept, none pending), reopened untouched, the backup restored; a
  version 4 document migrated; a request's round trip (the rows, a reopen, a backup and its restore), its refusals (twice,
  from itself, an unknown account), the confirmation's one change, a raw row from no account refused at the open; and
  every earlier migration's test at the new versions.
- `serviceStore.test.ts`, `serviceStoreSqlite.test.ts`, `sessionsPersist.test.ts`: their version pins moved (5, 6); the
  hand-made version-1 database drops the new table too.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 3. The room's player list and the lookups' presence (SVC-15)

*Added 2026-10-12 (web sprint 18, wave 3; W18.R4). Reading, reviewed (at its merge, 8d6ed4ca1).*

Code: `packages/central/src/roomPlayers.ts` (`roomPlayerList`, `ROOM_PLAYER_MESSAGES`, the names of §3.7) and its route
`/lobby/room-player-list` (`LOBBY_ROOM_PLAYER_PATHS`, `packages/central/src/lobbyHttp.ts:167`, :412-:415: the room
service's own, answered with the lobby the handler is given, as SVC-06's -- so `createServices` mounts it with no change
to `bridge.ts`); the ladder's rows' +0x20 (`LadderRow.accountId`, `ladder.ts`) and the bearer's own position
(`lobbyHttp.ts:366-:371`); the ignore list's `sees` (`ignore.ts:137`); the friend request's order (`friends.ts:305`).
The page: `packages/ui/src/screens/briefingRoomCommands.ts` (`RefreshRoomPlayerList`, `playerListRow`,
`roomPlayerState`, the names of §3.7; `BRIEFING_ROOM_COMMAND_ROWS` with row 43), `ladderLobbyCommands.ts` (`roomState`,
the rows keyed and PLAYER INFO asked by the account id, the position asked with no account),
`packages/viewer/src/briefingRoomHost.ts` (`roomPlayerListOf`, the transport, the page's clock handed in),
`ladderLobbyHost.ts` (the one position request), `frontEnd.ts` (the BRIEFING origin wired to the briefing room's rows).

### 3.1 What the console asks and reads

- **The row** `RefreshRoomPlayerList` (PLAT-08 row 43, `FUN_0027d900` D:L126105-126146), aimed at the node PLAYERLIST in
  `dlgMPBriefingRoom.rdr`'s set (`tools/dump-online-dialogs.ts --dialog dlgMPBriefingRoom.rdr`; the names the set's
  animations index, `tools/dump-dialogs.ts --set 'dlgMPBriefingRoom\.rdr'`, research 158 §2.3's rule): OnPlayerListAct
  (the PLAYER LIST button's ONACTIVATE) asks it with NA when ROOMPLAYERLISTVAR holds nothing (`PLAYERLIST.op5`);
  `auto_refresh_gamelist` (every 30 s, while the node is active) and `refresh_gamelist` (REFRESH LIST) with NA
  (`PLAYERLIST.op6`); OnPlayerListStart (the list's ONACTIVATE) and OnPlayerListScrollEnd (its ONSCROLL_END and
  ON_UPDATE_UIVAR) with CLAN_TAGS (`.op6`, `.op3`). The argument -- INPUT_STRING the running animation's (S:0x3ee898,
  D:L126116-126118) -- other than CLAN_TAGS (S:0x3ef370, compared without case, D:L126119) runs `FUN_002f11f0`
  (D:L192271-192290: 0 unless the session is up, else `FUN_002f1240` and 1); CLAN_TAGS runs `FUN_002f0ea0` (§3.4).
- **The request** (`FUN_002f1240` D:L192307-192340): only with no request out (`DAT_0044f9f0`) and the frame clock
  (`DAT_004a44a0`, the frames' seconds summed, `FUN_003aff30` D:L304766) past `DAT_0044f9f8`, which is set 10.0 s on
  before anything else (D:L192307-192308); the room's record by MEDIUS_LOBBY_NAME (`FUN_002e4470`, D:L192309-192313) --
  none, nothing more; the request marked out (D:L192315), every held row's state (+0x40) set to 0 (D:L192318-192322),
  ROOMPLAYERLISTVAR set to the one string "Retrieving player list from server..." (S:0x3f4f20) while it holds no row
  (D:L192324-192335); GetLobbyPlayerNames_ExtraInfo -- Lobby 0xdc (`DAT_00686e20`, `tools/dump-medius-ids.ts`), 0x1c bytes
  zeroed (D:L192336: the MessageID empty), +0x18 the world joined (`DAT_0066a538`, D:L192337) -- posted by `FUN_0064af78`
  (D:L561961-561976) with `FUN_002f13f0`.
- **The reply** (Lobby 0xdd, 0xd0 bytes a row, `FUN_0064d130` D:L563537-563543) read by `FUN_002f13f0`
  (D:L192348-192437), a row at a time: a status not Success draws what is held and frees the request (D:L192428-192431);
  a Success, the room's record by MEDIUS_LOBBY_NAME (D:L192366-192371; none, nothing -- and the request stays out): the
  held row of the same account (+0x1c, D:L192378) takes the reply's online state whole -- the status +0x40, the two
  world ids +0x44 / +0x48, the lobby's name +0x4c, the game's +0x8c (D:L192382-192403) -- or the reply's row is kept whole
  (`FUN_002f2d90`, D:L192407-192409); at the row ending the list (+0xcc, D:L192411) every row whose state is still 0 is
  dropped (`FUN_002f2740`, D:L192412-192422: those the reply did not name, **and those it named Disconnected**), the
  list drawn and the request freed (D:L192423-192424).
- **The draw** (`FUN_002f1670` D:L192442-192520): the rows sorted by name (`FUN_002f1980` with `FUN_002f1950`,
  D:L192470: strcmp of +0x20, ascending); each row `["%d" (S:0x3f4cc0) of the account, the name, the state's cell, the
  tag cell]` -- the state's cell the game's name for 3, "In Lobby" (S:0x3f4da0) keyed with the colour 91, 72, 36 for 2
  (D:L192475-192477, D:L192491-192496), "Logging In" (S:0x3f4d88) for 1, "Disconnecting" (S:0x3f4d78) for 0, no cell for
  any other; the tag cell keyed with 128, 64, 32 (D:L192472-192474), its text "" (S:0x3f4cb8) when the row's +0 is 1, else
  the row's +0 (D:L192503-192510) -- into ROOMPLAYERLISTVAR (`FUN_00386460`, D:L192517; lobby +0xb8, S:0x3f38b0,
  `FUN_002df6a0` D:L182202-182203). "Disconnecting" is so drawn only for rows held when a reply fails.
- **PLAYER INFO's BRIEFING origin** (`FUN_002f0020` D:L191891-191929, the reply's tag BRIEFING or any other, research 269
  §2.2): the room's record by MEDIUS_LOBBY_NAME (`FUN_002e4470`, D:L191896), its row of the reply's name (`FUN_002e3610`
  D:L184719-184735, strcmp: case kept; D:L191899) and that row's online state copied whole; the position stays the
  record's own +0x08.

### 3.2 The server: the asker's own room only

- **Horizon** (desktop@be557831:server/horizon-server/Server.Medius/Medius/MLS.cs:2952-2998): a logged-in sender only
  (:2955-2960); the request's world id is not read -- the sender's current channel is answered (:2962); none, one NoResult
  row ending the list (:2963-2970); else a Success row per connected client of the channel with its id, name and online
  state (the session's status, its channel's and game's names and ids, -1 for none, :2974-2989), the last ending the
  list (:2991-2992). Horizon so never names another room's players.
- **Built** (`roomPlayerList`): the world asked is the bearer's room -- a Success row per member in join order (the
  room service's members, `RoomService.lobbyView`, each with the name his session joined with) and its online state
  (`ROOM_PLAYER_ONLINE_STATE_READING`), the last ending the list; any other world, or the bearer in no room, one NoResult
  row (`ROOM_PLAYER_LIST_OTHER_WORLD_READING`), Horizon's answer to one with no channel. The client sends the world it
  joined, so the two agree for every request it makes; one asking another room is answered as a stranger to it.
- **PROFILE-PRIVACY (W18.R4)**: every row is a roommate of the asker's, whom `seesWhereabouts` shows where each is (the
  test holds it): the rows carry the state whole.
- **The rate**: the client's (one in flight, 10 s apart); the server bounds the route no more than the door's request
  rate (HARD-FLOOD), as Horizon bounds it not at all. Exactly `{ mediusWorldId }` (a safe integer), else 400.

### 3.3 The presence paths of §1.5 item 4, each decided (W18.R4)

W18.R4 rules **where** a player is (to friends and roommates only); whether he is on line is not withheld by it (§1.4's
last line). Each path, read and decided:

1. **The ignore list's PlayerStatus** (`ignore.ts:137`): the status says room (2) or game (3), a place, to an ignorer
   who need be neither a friend nor a roommate. **Decided: withheld** -- `IgnoreOptions.sees`, PLAYER INFO's
   `seesWhereabouts`, and a row the owner may not see carries `PLAYER_INFO_WITHHELD_STATUS_READING` (Disconnected), as
   PLAYER INFO and the ladder's rows withhold it (`ignore.test.ts`). A deviation from the original on its own page: the
   list's glyph (research 269 §1.2: one for a status of 0, another for the rest) shows such a player off line. **Wired**
   *(at the merge, 2026-10-12)*: the hook is built; `createServices` gives it at `bridge.ts:836` with the one option `sees: (asker, target) =>
   playerInfo.sees(asker, target)` (the closure reads `playerInfo`, made at :847, only when asked), wired by the seat at
   the merge (378a7f424; held by `bridge.test.ts`'s "the ignore list over the services shows a stranger no status": Kilo
   seated in a game reads the withheld status to Oscar, 3 without the hook).
2. **FindPlayer's "on the lobby" answer** (`chat.ts:170`): its reply is the status, the id and the name -- no place
   (Horizon's, MLS.cs:1370-1379) -- and it is the same whoever asks. **Decided: kept** (the original's search): it tells
   whether a player is on the lobby, which W18.R4 does not withhold, and the whisper and the friend request stand on it
   (research 263 §1-§3, §2.1 here). `chat.test.ts` pins the three fields for a player in a room and one in a game.
3. **The clan roster's presence** (`clans.ts:588-599`): **left unwired** -- `createServices` builds the `ClanService` with
   no presence (`bridge.ts:897`), so every row is offline (`ROSTER_ONLINE_STATE_READING`, pinned by `clans.test.ts`'s
   test of it). Wiring it is a `bridge.ts` change and a `sees` in `ClanServiceOptions` (as the ladder's and the ignore
   list's); not in reach of this brief. Owed with ONL-27's roster (§7).
4. **The modern lobby browser** (`/modern/lobby-members`): H190's, the owner's -- unchanged, its default as built.
5. **The room's player list** (new, §3.2): the asker's own room only -- roommates, under the rule.

### 3.4 CLAN_TAGS: the tag cell (`ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER`)

`FUN_002f0ea0` (D:L192151-192214; D:L126143): for each row the PLAYERLIST box shows -- from its first visible row (+0xb8)
as many as its height holds (+0x78 / +0xac, D:L192177-192179) -- whose +0 byte is 0 (not yet asked), PlayerInfo by the
row's id (`"%d"` in the MessageID, D:L192200-192202), its reply `FUN_002f10b0` (D:L192219-192266) writing `[%s]`
(S:0x3f4f18) of the record's clan tag into the row's +0 and drawing again (D:L192249-192254), or marking the row asked
with no tag (+0 = 1, D:L192257). A row's command is handed no widget here, so the arm answers as its body does (0 unless
the session is up, else 1) and sends nothing: every tag cell draws the reply's empty +0, "" -- what a row without a tag
draws; a clan member's `[TAG]` is not drawn. Settles: the box's visible rows handed to the row (a shell seam) and SVC-15a's
lookup asked for each.

### 3.5 PLAYER INFO from the list (the BRIEFING origin)

PLAYERLIST's CROSS runs `playerinfo_activate` -- `GetPlayerInfo(INPUT_STRING)` with the word 0, BRIEFING (research 269
§2.1) -- so the request is by the account id `strtol` reads of the row's first cell (`"%d"` of +0x1c), and the page
(`LadderLobbyCommands`, ONL-30a's) reads the presence lines from the room's rows: `BriefingRoomCommands.roomPlayerState`
handed in as `roomState` (`frontEnd.ts`; the menu rig's and the briefing rig's alike). A player in the list shows ONLINE,
BRIEFING ROOM and GAME from his row; one not in it NOT CURRENTLY LOGGED IN. `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` is
narrowed to the CLAN origin (ONL-27's roster): research 269 §2.5 (since retired, 2026-10-15, by PLAYER-INFO-CLAN).

### 3.6 ONL-30a's two server lines, and SVC-16's two owed lines

- **The ladder row's +0x20 is the account id** (research 269 §2.4 item 2, the finding against research 155 §2.2): the
  console keeps it at +0xa4 (`FUN_002ebe50` D:L189584), prints `%d` of it in the page's first cell, drawn nowhere
  (`FUN_002eb900` D:L189390), and asks PlayerInfo by it as an account id (`FUN_002efe50` D:L191699). `LadderRow.accountId`
  replaces `ladderStat` (`ladder.ts`'s comment corrected; Horizon's newer form carries a LadderStat at +0x20 and the
  AccountID after it, MediusLadderList_ExtraInfoResponse.cs:19-26, where the console's form has room for one int); the
  page's key cell is `%d` of it and PLAYER INFO from the ladder asks `{ accountId }`. `LADDER_ROW_KEY_ADAPTATION` retired.
  PROFILE-PRIVACY on the rows' online state unchanged (§1.5 item 3).
- **The position is the bearer's own**: 0xf1 carries the session's account (`DAT_0066a4f0` at +0x18, `FUN_002eafb0`
  D:L188987, `FUN_002eb2c0` D:L189109) and no other, so `/lobby/ladder-position` answers the bearer's (`identify`'s)
  standing for `{ ladderStatIndex: 0, sortOrder: 1 }`; an `accountId` in the body is the bearer's or the body is one no
  console sends (400). The page asks it in one request. `LADDER_POSITION_BY_NAME_ADAPTATION` retired.
- **N1 (ONL-24's review): FindPlayer, then the rate** (`friends.ts:305`): a request by name asks FindPlayer first, as the
  console's (`FUN_003013c0` D:L202524-202528, its reply `FUN_003015d0` D:L202564), so past the rate an unknown name answers
  -998 -- the not-found the page shows, where it showed #337 for the rate's -956; a found one is then held to the rate.
  A name not found is not counted (§2.4's "every request counts" now reads: every request that reaches the rate).
- **N2**: `friends.ts`'s `FRIEND_REQUEST_REFUSED_PLACEHOLDER` doc and `friends.test.ts`'s title no longer call -958 "the
  page's MP_PLAYER_IS_FRIEND": the console raises it only before it sends; the page shows #337 for -958
  (`FRIEND_REQUEST_EVENT_READING`, research 269 §3.6 item 1). §2.4's table cell with the same words is corrected by this
  line (§2 is not edited).

### 3.7 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `ROOM_PLAYER_LIST_OTHER_WORLD_READING` (server `roomPlayers.ts`; *its other-world half has no source in the original and Horizon answers the sender's own room -- a placeholder in all but its name, the review's F5*) | `'no room, or not the asker\'s: one NoResult row ending the list'` | the answer to a player list asked for a world the asker is not in, or by one in none: Horizon's no-channel NoResult (MLS.cs:2963-2970); Horizon reads no world and answers the sender's channel (:2962); the client reads Success only (D:L192365) (§3.2) | ONL-32's transcript of a player list asked from a room | reading |
| `ROOM_PLAYER_ONLINE_STATE_READING` (server `roomPlayers.ts`) | `'the room service\'s seat: in a game 3, else in the room 2'` | a row's online state: the room service's seat (`roomPresence`), where Horizon answers each client's session status (MLS.cs:2980-2987) (§3.2) | ONL-32's transcript of a player list with a member in a game | reading |
| `ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER` (ui `screens/briefingRoomCommands.ts`) | `'CLAN_TAGS sends nothing: ...; every tag cell ""'` | the list's tag cells: `FUN_002f0ea0`'s PlayerInfo per visible row and `FUN_002f10b0`'s `[%s]` (§3.4) | the box's visible rows handed to the row, and the lookup asked per row | placeholder |
| `ROOM_PLAYER_LIST_SESSION_ADAPTATION` (ui `screens/briefingRoomCommands.ts`) | `'a list reply taken only under its ticket; the lobby\'s reset frees a request out'` | no original: the console's replies come on its one connection and only a reply frees `DAT_0044f9f0` (D:L192424, D:L192430); a request never answered holds it until the lobby's reset | nothing to settle: a labelled adaptation of the transport | adaptation |
| `ROOM_PLAYER_LIST_PARKED_READING` (was ui `screens/briefingRoomCommands.ts`; research 162 §6) | -- | PLAYER LIST shows no row: `RefreshRoomPlayerList` not served | -- | retired 2026-10-12 by SVC-15 (§3.1): the row's body over `/lobby/room-player-list` |

ONL-30a's `LADDER_ROW_KEY_ADAPTATION` and `LADDER_POSITION_BY_NAME_ADAPTATION` are retired in research 269 §2.5, and
`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` narrowed there (since retired, 2026-10-15, by PLAYER-INFO-CLAN: research 269 §2.5).
The two server names are §5 exclusions of research 101 (the online services' own; 2026-10-12).

### 3.8 The tests, and the runs (unit tests and the page over the machine; no browser, no capture)

- `packages/central/test/roomPlayers.test.ts` (new): the message's ids and lengths; the asker's room -- a row per member in
  join order with its state (in the room, in a game), PROFILE-PRIVACY's roommates; another room, none, an unknown world
  and a left room NoResult; the route -- its path, the bearer's room, another's NoResult, 403 / 401 / 405, six bodies no
  page sends 400; mounted by `createServices` with three logins (the session's names and ids, NoResult for another room,
  401 without a bearer).
- `ladder.test.ts`: the rows' +0x20 the account ids (no rating, no `ladderStat`), the empty page's 0; the position
  without an account the bearer's, another account's 400, mounted the bearer's own for two logins.
- `friends.test.ts`: N1 both ways (past the rate an unknown name -998, a found one -956; twelve names not found count
  nothing and a found one after them is sent); N2's title.
- `ignore.test.ts`: the `sees` hook -- a row the owner may not see withheld, one he may his seat, asked for the owner.
- `chat.test.ts`: FindPlayer's three fields alike for a player in a room and in a game (the kept path's pin).
- `resultsNegative.test.ts`: `LOBBY_ROOM_PLAYER_PATHS` swept, its valid body asserted (the bearer's room after a rejoin,
  another room's NoResult).
- `packages/ui/test/screens/briefingRoomCommands.test.ts`: row 43 held to the table; the request for the room joined and
  "Retrieving..." while empty; the draw sorted by strcmp with the four state cells and the keyed colours; the 10 s period
  and one in flight; a held row updated, a new one added, the unnamed and the Disconnected dropped at the end; a status
  not Success drawing what is held and freeing the request; down 0, no room nothing sent; CLAN_TAGS nothing sent; a
  reply after the ticket changed dropped and the reset freeing the request; `roomPlayerState` (strcmp, the state whole).
- `ladderLobbyScreen.test.ts`: the key cell the account id, PLAYER INFO from the ladder by `{ accountId }` (the page
  and the machine), my position asked with no account, the retired names gone; the BRIEFING origin's lines from
  `roomState`, none NOT CURRENTLY LOGGED IN, the CLAN origin still none.
- `briefingRoomScreen.test.ts` (over the machine): REFRESH LIST's `PLAYERLIST:REFRESHROOMPLAYERLIST(NA) table`; the PLAYER
  LIST button's ONACTIVATE asking the room's players, the rows drawn sorted with their cells and colours, CROSS twice to
  PLAYER INFO by the id with the BRIEFING origin's ONLINE / BRIEFING ROOM / GAME.
- `packages/viewer/test/briefingRoomHost.test.ts`: the request's path, body and bearer, the rows checked field by field,
  401 the session lost, the mount's request and draw; `ladderLobbyHost.test.ts`: the one position request, the rows'
  +0x20 required. The menu rig, the briefing rig and `friendListScreen.test.ts`'s fake: the rows' `accountId`.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 7. What is left

- **SVC-16** (friends, W18.R5): done at the reading level, reviewed (§2). Owed: ~~ONL-24, the page's FRIENDS screen
  over `LOBBY_FRIEND_PATHS` (research 269), its poll of `/lobby/friend-events` and its own MP_PLAYER_IS_FRIEND /
  MP_PLAYER_NOT_FOUND / MP_FRIEND_CONFIRMATION_REQUESTED from the statuses of §2.4~~ *(ONL-24 built, merged at a6ae27b6f
  2026-10-12: research 269 §3)*; ONL-32's two-persona transcripts of
  §2.8's readings; the owner's word if a player is to be able to take himself off another's list (§2.7, the last item).
- **SVC-15** (§3): done at the reading level, reviewed. Merged 2026-10-12 (the ignore list's `sees` wired by the seat,
  `bridge.ts:836`). Owed: the tag cells (`ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER`: a
  shell seam for a box's visible rows, then SVC-15a's lookup per row); ONL-32's transcripts of a player list asked from a
  room, with a member in a game (§3.7's two readings); `/modern/lobby-members` stays the owner's (H190).
- **The clan roster's presence** (owed; §1.5 item 4, §3.3 item 3): when `ClanService`'s `presence` is wired
  (`ROSTER_ONLINE_STATE_READING`, `bridge.ts:897` builds it with none today), each row's online state through
  `seesWhereabouts` for the asker, as the ladder's rows and the ignore list's (`clans.ts:588-599`); with ONL-27's roster,
  which also fills PLAYER INFO's CLAN origin (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`, research 269 §2.5) -- *built
  2026-10-15 by PLAYER-INFO-CLAN, the placeholder retired (research 272 §5)*.
- **ONL-30a** (PLAYER RANKING, PLAYER INFO on CROSS): built (research 269 §2); its two server lines settled by SVC-15
  (§3.6).
- **The proven level**: ONL-32's transcript of a PlayerInfo for a known account, an unknown one and a player on the
  menus (the three readings of §1.8).
