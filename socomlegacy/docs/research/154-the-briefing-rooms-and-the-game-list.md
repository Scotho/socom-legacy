# 154 -- The briefing rooms and the game list: the service side (SVC-06)

Written 2026-10-04 for SVC-06 (`../roadmap/06-online-services.md`, "SVC-06 -- Rooms and the game list: create, list,
details, join, filters"), wave 1 of sprints 16 and 17 on the online path's plan (`../plans/2026-10-02-online-path-target.md`,
OT.R16, OT.R17). The shape is R6's (`../MISSION.md`; research 97 §7): the services live inside the match server,
`packages/server`. The code: `packages/central/src/lobby.ts` (the room set, the nine operations, the bridge's calls, the
client's reading of the two lists) and `packages/central/src/lobbyHttp.ts` (the endpoint). The tests:
`packages/central/test/lobby.test.ts` (one block per pair, over a service built in the test) and
`packages/central/test/lobbyHttp.test.ts` (the endpoint on a local port). Sources: the retail decompilation r0001
(`D:L<line>`, every address retail; cited, never pasted), the retail ELF's strings (`S:0x...`), the message ids read by
`tools/dump-medius-ids.ts` from the ELF, our Horizon's sources read as files at the `ref/desktop` pin
(`desktop@be557831:server/horizon-server/...`; `MLS.cs` is `Server.Medius/Medius/MLS.cs`, `Types.cs`
`RT.Common/Types.cs`, `Constants.cs` `RT.Common/Constants.cs`, `MediusManager.cs`, `Channel.cs`, `Game.cs`,
`ClientObject.cs` and `GameListFilter.cs` under `Server.Medius/Medius/`, the models under `RT.Models/Lobby/`), and the
`s4_pcsx2` captures and Medius slice (`logs/parity/s4_pcsx2/`: `A_47_rooms.png`, `B_43_gameslist.png`,
`slice-Medius.log`). **No server was contacted** (R293). Every value here is **reading, pending review**: transcribed
from the decompilation and Horizon's sources, not yet measured running (ONL-32's transcripts are the proven level).
Revised 2026-10-04 by the review's fix round (its findings 1-12): the GAME row's rank icons, games that end with their
host seated or not, the watcher's password and seats, OT.R16 through GameStats, the report checked as the create, a
game made from a room only, the row's name cut at `$~`, the hardening before the mount, and what the next streams are
owed (§10).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R154.1 | **The room set (OC-4) is made in Horizon's code**: on the 1.50 client's room list (Lobby 0xec), when no lobby channel exists for the app, `MLS.cs:3383-3384` (at the pin; `:3403-3404` at the desktop's head 4db792fc) adds four: "Alpha", "Bravo", "Charlie", "Delta", each `MaxPlayers = 64`, with `Channel`'s defaults -- no password, SecurityLevel none, GenericField1 0 (`Channel.cs:28-31`). No rank limit is set (GenericField1 0 means every rank, R154.3). The simulated database's own "Channel 1" (`DbController.cs:2396-2404`, `SimulatedChannelName`) is app 0: the four are made only when SOCOM II's app group (`MediusManager.cs:695-698`, from the database's app ids) holds no lobby channel, and `A_47` shows "Channel 1", the other case (§3) | `HORIZON_DEFAULT_ROOMS` (was: retired 2026-10-19 by SA-17 -- SA.R4 supersedes OT.R17's OC-4, the room set the disc table's eight regional rooms, `packages/central/src/rooms.ts`, research 342 §4); the world ids from 1 (`ROOM_WORLD_ID_FIRST_READING`) | §3 |
| R154.2 | **Entering a room is three pairs, not one**: `FUN_002ed740` sends CreateChannel1 (LobbyExt 0x00, 0x94 bytes) with the row's name; ChannelNameExists (-974) sends FindWorldByName (Lobby 0x37, type 1) and its reply's world id (+0x44) is joined with JoinChannel (Lobby 0x25); then `FUN_002efc80` sets the lobby-world game filter. Our Horizon has no handler for LobbyExt 0x00 (its CreateChannel is LobbyExt 0x14) nor for FindWorldByName | all three are answered; a name outside the set makes no room (`NEW_ROOM_STATUS_PLACEHOLDER`) | §2 |
| R154.3 | **The rooms list is drawn from GenericField1**: `FUN_002e3cc0` shows each room's name, players and four rank icons -- every icon when the low four bits are 0, else one per bit (D:L185011-185046) -- hides names opening "Medius" and every "+Clan - " room but the player's own clan's, in `FUN_002e3f80`'s order (GenericField1's high half, the name's length, the name without case: Alpha, Bravo, Delta, Charlie) | SVC-14a reads what each bit admits; ONL-11 draws `roomListRows` | §3 |
| R154.4 | **The filters the screen offers are the client's**: the game type, players, speed, password and locked filters are UI values `FUN_002e2920` reads before each list (S:0x3f3ca0..0x3f3d08) and `FUN_002e3080` applies to the list it got (D:L184509-184546). The server's filters are two: the room's lobby-world filter (field 10) and AUTOPLAY's players filter (field 1, >= 1), cleared by FilterID 1 | ONL-15's unknown "client- or server-side filtering" is answered: client side, beside two server filters the service answers | §2, §6 |
| R154.5 | **GAME DETAILS sends nothing**: `FUN_002e1f20` (D:L183973-184130) draws the selected list record's GameStats; GameInfo0 (Lobby 0x33, `FUN_00648dd0`) is registered but no caller reaches its builder | no details pair; `game(id)` serves the bridge | §2 |
| R154.6 | **The client tells few join errors apart**: JoinGame's reader names -978 (MP_INVALID_PASSWORD) and -972 (MP_BANNED_FROM_GAME), every other failure MP_MEDIUS_JOIN_GAME_FAILURE (`FUN_002edba0` D:L190423-190437); CreateGame1's names -975 (MP_GAME_NAME_EXISTS) only (`FUN_002ee090` D:L190605-190614); JoinChannel's and the room's FindWorldByName's any failure. Not-found and full are numbered as Horizon numbers them: GameNotFound -977, WorldIsFull -948 (`MediusManager.cs:318-342`) | the statuses are Horizon's names; the three our Horizon never sends are named readings or placeholders | §2, §9 |
| R154.7 | **The map is not in CreateGame1**: the client sends GameLevel 0 (+0x34, D:L190561) and the map comes with the host's world report, GameLevel = atoi of the map stem past "MP" (`FUN_002ef590` D:L191385-191390; the s4 slice: GameLevel 51 for Vigilance, line 14) | OT.R16's refusal holds at both: a create naming a map not offered and a report naming one | §2, §4 |
| R154.8 | **B_43's row is a reading of seven fields**: the name up to `$~` (`FUN_00363830` D:L261214-261243), IN = min(players - spectators, MAX), MAX = min(MaxPlayers - spectator slots, 16) (D:L184423-184426), SPEC = min(spectators, slots), the slots and the spectators from the GameStats 'D' record's bytes 4 and 3, PING by GenericField2 (<300, <600, else the red dot: D:L184438-184452), PASS by SecurityLevel bit 0 (D:L184453-184458), CLAN by GenericField3 (D:L184459-184464), the rank icons by the whole of GameStats byte 7 -- every icon only when the byte is 0, so a byte of high bits draws none, unlike the rooms list's nibble (D:L184465-184492) (`FUN_002e2ce0` D:L184391-184506). The s4 game (`test$~Channel 1`, players 1, MaxPlayers 24, slots 8, GF2 65000) draws "1 16 / 0 8 / test / red dot / box / box", B_43 exactly | `gameListColumns`, pinned by the test (the cap 16 and the bound 300 each held) | §7 |

## 1. What is built

`RoomService` (`lobby.ts`) holds the rooms, the games and each account's session state (its room, its game seat, its
game-list filters), and answers the nine pairs below with the replies' fields by name. `lobbyHandler`
(`lobbyHttp.ts`) puts them beside the WebSocket as `POST /lobby/<op>`, in the shape of SVC-05's `textsHandler`: the
Origin checked before the body is read, JSON in and out, `no-store`, one log line per request (operation, HTTP status,
address; never a field). A browser adaptation of the console's Medius requests: the transport is ours, the fields are
the original's.

| path | operation | body (the request's fields) | answer |
|---|---|---|---|
| `/lobby/channel-list` | `channelList(pageId, pageSize)` | `{ pageId, pageSize }` | `{ entries: [{ status, mediusWorldId, playerCount, maxPlayers, securityLevel, genericField1, lobbyName, endOfList }] }` |
| `/lobby/create-channel` | `createChannel` | `{ applicationId, maxPlayers, lobbyName, lobbyPassword }` | `{ status, mediusWorldId }` |
| `/lobby/find-world` | `findWorldByName` | `{ name, worldType }` | `{ status, mediusWorldId }` |
| `/lobby/join-channel` | `joinChannel` | `{ mediusWorldId, lobbyChannelPassword }` | `{ status, mediusWorldId }` |
| `/lobby/set-filter` | `setGameListFilter` | `{ filterField, comparisonOperator, baselineValue }` | `{ status, filterId }` |
| `/lobby/clear-filter` | `clearGameListFilter` | `{ filterId }` | `{ status }` |
| `/lobby/game-list` | `gameList(pageId, pageSize)` | `{ pageId, pageSize }` | `{ entries: [{ status, mediusWorldId, playerCount, minPlayers, maxPlayers, gameLevel, playerSkillLevel, rulesSet, genericField1, genericField2, genericField3, securityLevel, worldStatus, gameHostType, gameName, gameStats (512 hex), endOfList }] }` |
| `/lobby/create-game` | `createGame` | CreateGame1's fields (§2) | `{ status, mediusWorldId }` |
| `/lobby/join-game` | `joinGame` | `{ mediusWorldId, joinType, gamePassword }` | `{ status, gameHostType, mediusWorldId }` |
| `/lobby/leave-game` | `leaveGame` | `{}` | `{ status: 0 }` -- BACK out of a game's lobby; the host's leave ends its game |
| `/lobby/leave-channel` | `leaveRoom` | `{}` | `{ status: 0 }` -- BACK out of a briefing room |

An empty page of either list is one entry with status NoResult (1) ending the list, as Horizon answers
(`MLS.cs:2526-2533`, `:3386-3395`); the client takes a non-zero status as "redraw what you have"
(`FUN_002e2b00` D:L184330-184340), so the list shows empty. Pages are Horizon's: PageID from 1 (`MediusManager.cs:461-471`).
The endpoint takes PageID and PageSize from 1 and PageSize at most `PAGE_SIZE_MAX_READING` (999, the most the client
asks: the rooms `FUN_002e3aa0` D:L184891, AUTOPLAY's games D:L197581; the room's games ask 256, D:L184292), 400 past it.

**The `identify` contract** (`lobbyHttp.ts`'s doc; held by `test/lobbyHttp.test.ts`): the mounting code names the
account from a server-side session the request carries, never from the body (a body's `accountId` is not read); null
is 401 with no body read; a throwing `identify` is 500 with no body, the log line naming the error's class only (no
message, no stack), and the endpoint goes on serving.

## 2. The pairs: what the client sends and what it reads

| pair | the client's request (builder; caller; fields) | the reply the client reads (reader; offsets) | refusals |
|---|---|---|---|
| ChannelList_ExtraInfo0, Lobby 0xec -> 0xed | `FUN_0064b098` D:L562005-562024, 0x1a; `FUN_002e3aa0` D:L184880-184897: PageID 1, PageSize 999 | `FUN_002e3b00` D:L184900-184971: status +0x18 (a success), world id +0x1c (>= 0), players +0x20, max +0x22, security +0x24, GenericField1 +0x28, the name +0x2c:64 (a room of the same name is updated in place), EndOfList +0x6c, which draws the list (`FUN_002e3cc0`) | none |
| CreateChannel1, LobbyExt 0x00 -> Lobby 0x22 | `FUN_00648840` D:L560671-560695, 0x94; `FUN_002ed740` D:L190223-190263: app 0x28e8 +0x28, the row's max players +0x2c, its name +0x30:64, its password +0x70:32 | `FUN_002ed850` D:L190266-190325: status +0x18; success keeps the world id +0x1c and joins (event 0x13 -> `FUN_002ee290`); -974 (`-0x3ce`) asks FindWorldByName type 1; any other failure "Cannot join this room. Please try another." (S:0x3f4780) | ChannelNameExists -974 with the id for a room of the set (`MLS.cs:3106-3115`); `NEW_ROOM_STATUS_PLACEHOLDER` for another name |
| FindWorldByName, Lobby 0x37 -> 0x38 | `FUN_00648fb8` D:L560955-560976, 0x6c: the name +0x26:64, the type +0x68 (1 from `FUN_002ed850`, 0 from cbCreateGame's persistent-game path D:L190605-190633) | `FUN_002ed9c0` D:L190328-190352 (the room): status +0x18; success keeps the world id at +0x44 and joins; failure "Cannot join this room right now. Please try again in a few minutes." (S:0x3f47c0). `FUN_002ee210` D:L190648-190669 (the game) the same offsets | `FIND_WORLD_NOT_FOUND_READING` |
| JoinChannel, Lobby 0x25 -> 0x26 | `FUN_00648a08` D:L560746-560767, 0x4c; `FUN_002ee290` D:L190672-190701: the world +0x28 (the id kept above), the password +0x2c:32 (copied from S:0x3f48d0) | `FUN_002ee3a0` D:L190704-190776: status +0x18; failure MP_MEDIUS_JOIN_ROOM_FAILURE with "Cannot join room. It may be full. Please try another." (S:0x3f4760, S:0x3f49a0); success copies the connection info +0x1c.. (the DME's addresses and keys, `NetConnectionInfo`), event 0x10 | ChannelNotFound -976 (`MLS.cs:3147-3156`), InvalidPassword -978 (`:3158-3165`), `ROOM_FULL_STATUS_READING` |
| SetGameListFilter0, Lobby 0x4e -> 0x4f | `FUN_00649960` D:L561320-561340, 0x34: field +0x28, operator +0x2c, baseline +0x30 (`MediusSetGameListFilterRequest0.cs`). `FUN_002efc80` D:L191655-191656, on entering a room: field 10, operator 0, baseline 0. `FUN_002f8e50` D:L197547-197550, AUTOPLAY: field 1, operator 3 (>=), baseline 1 | the AUTOPLAY reply goes on to the list (`FUN_002f8ed0`); the room's reply is not read (its callback, 0x2efe10, is a 16-byte routine before `FUN_002efe20` that the decompilation does not name) | Fail for a field the record does not answer (Horizon's `IsMatch` default, `GameListFilter.cs:38`) |
| ClearGameListFilter0, Lobby 0x50 -> 0x51 | `FUN_00649a00` D:L561343-561363, 0x2c: FilterID +0x28 -- 1 from AUTOPLAY's end (`FUN_002f8fd0` D:L197617-197618, D:L197651-197652), also `FUN_002f83b0` | the callback `FUN_002f9210` | none: success, as Horizon (`MLS.cs:2759-2766`) |
| GameList_ExtraInfo0, Lobby 0xea -> 0xeb | `FUN_0064b008` D:L561983-562002, 0x1a; `FUN_002e2920` D:L184258-184315: PageID 1, PageSize 256 (AUTOPLAY's `FUN_002f8ed0` 999) | `FUN_002e2b00` D:L184318-184388 copies each entry whole (`FUN_002e1d50` / `FUN_002e1e10` D:L183873-183970: status +0x18, id +0x1c, players +0x20, min +0x22, max +0x24, level +0x28, skill +0x2c, rules +0x30, GF1 +0x34, GF2 +0x38, GF3 +0x3c, security +0x40, world status +0x44, host type +0x48, the name +0x4c:64, GameStats +0x8c:256, EndOfList +0x18c) into the record matched by name; the GameStats into the 'D' record at +0x19a (`FUN_002f7d90`); EndOfList draws the rows (`FUN_002e2ce0`) | none |
| CreateGame1, Lobby 0xf4 -> 0x1e | `FUN_006485b8` D:L560570-560595, 0xd0; `FUN_002edda0` D:L190492-190585 (`MediusCreateGameRequest1.cs`): app 0x28e8 +0x28, MinPlayers 2 +0x2c, MaxPlayers +0x30 (MaxPlayersValve, plus MaxSpectatorsValve when it is on), GameLevel 0 +0x34, the name +0x38:64 ("testgame" when none, S:0x3f48c0), PlayerGamePassword +0x78:32 when PasswordValve is on, SpectatorGamePassword +0x98:32 when spectators are on, skill 0 +0xb8, rules 0 +0xbc, GF1 the room +0xc0, GF2 65000 +0xc4, GF3 `FUN_002e99f0()` +0xc8, host type 0 +0xcc | cbCreateGame `FUN_002ee090` D:L190588-190645: status +0x18; success keeps the world id +0x1c (event 0xf: JoinGame, `FUN_002eda60`); -975 (`-0x3cf`) MP_GAME_NAME_EXISTS; other failures MP_MEDIUS_JOIN_GAME_FAILURE (with `mp_persistent` off) | Fail with no room or a GF1 other than the room's id (the client sends `DAT_0066a538`, kept from CreateChannel1's or FindWorldByName's reply, D:L190310, D:L190345); Fail for a field that does not fit (as Horizon's name filter, `MLS.cs:2816-2824`; MinPlayers and MaxPlayers 16-bit, as the list carries them); `MAP_NOT_OFFERED_STATUS_PLACEHOLDER` (OT.R16); GameNameExists -975 for a live game's name (`MediusManager.cs:256-268`); NumGameWorldsPerLobbyWorldExceeded -945 past `GAMES_PER_ROOM_PLACEHOLDER`; past every check the account's game before it ends (`GAMES_PER_HOST_PLACEHOLDER`) |
| JoinGame, Lobby 0xf3 -> 0x24 | `FUN_006488f8` D:L560698-560743, 0xc4; `FUN_002eda60` D:L190355-190404: the game +0x28 (kept from the create or the list), join type +0x2c (1 when watching, `FUN_002f6d00`), the password +0x30:32 -- SpectatorGamePassword when watching, else PlayerGamePassword | `FUN_002edba0` D:L190407-190487: status +0x18; -978 (`-0x3d2`) MP_INVALID_PASSWORD; -972 (`-0x3cc`) MP_BANNED_FROM_GAME; other failures MP_MEDIUS_JOIN_GAME_FAILURE; success copies the connection info from +0x20 on (D:L190440-190482; GameHostType +0x1c, Horizon's field, is not read) | GameNotFound -977 (also a pending game asked by anyone but its host: it is not listed yet), PlayerBanned -972, InvalidPassword -978 (a watcher against `SPECTATOR_PASSWORD_READING`'s password), WorldIsFull -948 (every seat taken, or a watcher past the spectator slots of GameStats byte 4, the row's SPEC MAX) (`MediusManager.cs:318-342`) |

The ids are the slots' registration order (`tools/dump-medius-ids.ts --all`): `DAT_00686e38` Lobby 0xec,
`DAT_00686bb0` LobbyExt 0x00, `DAT_00686c10` Lobby 0x37, `DAT_00686bc8` Lobby 0x25, `DAT_00686c8c` Lobby 0x4e,
`DAT_00686c94` Lobby 0x50, `DAT_00686e30` Lobby 0xea, `DAT_00686ba0` Lobby 0xf4, `DAT_00686bc0` Lobby 0xf3 -- each in
`tools/dump-medius-ids.ts`'s `NOTE_SLOTS`, so the dev-disc test (`tools/test/dumpMediusIds.test.ts`) holds them
against the ELF. The reply ids are Horizon's names for them (`Types.cs:604-818`). Horizon files
ClearGameListFilterRequest0 under LobbyExt; the client sends it on Lobby (class 1).

**The two other posts on entering a room.** `FUN_002efc80` (D:L191614-191667) posts two more beside the filter:
before it, Lobby 0x49 UpdateUserState (`FUN_00647c60` D:L560224-560240, 0x18 bytes, slot `DAT_00686c7c`) with
UserAction 1, JoinedChatWorld (`Types.cs:272-277`), and no callback -- the message has no reply; after it, Lobby 0x86
VersionServer (`FUN_00647548` D:L559889-559905, 0x26 bytes, slot `DAT_00686cac`), its reply read by 0x2efe00, a 16-byte
routine the decompilation does not name (the same as the filter's). Neither is the room service's: our Horizon takes
UpdateUserState and does nothing for JoinedChatWorld (`MLS.cs:1440-1465`: KeepAlive only), and has no VersionServer
handler at all; the client also sends VersionServer at login (`FUN_002ee830` D:L190876-190896). They are the
session's -- owed to SVC-07a / ONL-07 (§10) -- and both slots are pinned in `NOTE_SLOTS` beside the nine.

## 3. The room set (OC-4) and the rooms list

**As found**: `desktop@be557831:server/horizon-server/Server.Medius/Medius/MLS.cs:3373-3418` is the 1.50 room list's
handler (commit 3a46ff0e, the README's row `server/README.md:309`, "four rooms made when none exist"). It asks the
manager for the app's lobby channels (page 1 of 999) and, finding none, adds `new Channel() { ApplicationId, Name,
Type = Lobby, MaxPlayers = 64 }` for each of "Alpha", "Bravo", "Charlie", "Delta" (`:3383-3384`). A `Channel`'s other
defaults (`Channel.cs:28-31`): `Password = null`, `SecurityLevel = WORLD_SECURITY_NONE`, `GenericField1 = 0`. The
count is four, the limit 64 players each, no rank limit, no password. Their ids come from `Channel.IdCounter`
(`Channel.cs:20, :47`), which the start's simulated "Channel 1" (app 0, id 0: `DbController.cs:2396-2404`, loaded by
`Program.cs:398-420`) has already advanced, so the four are 1..4 -- our ids, and the client only carries them back.
Whether a server lists the four or "Channel 1" turns on whether SOCOM II's app group (`MediusManager.cs:695-698`, the
groups read from the database's app ids) holds app 0; the code that makes the four is the default the owner named.

**What the console showed**: `A_47_rooms.png` (PCSX2 on an earlier configuration of our Horizon) lists "Channel 1", 2
players, all four rank icons; `B_43_gameslist.png`'s title band names the room "Channel 1". The owner chose the
default names (OT.R17), not the capture's.

**The rows** (`roomListRows`, for ONL-11): R154.3. The four default rooms draw in the order Alpha, Bravo, Delta,
Charlie (length before letters), each with the four icons.

**Rank limits** (SVC-14a, parked behind OT.R6 for the gate): GenericField1 is carried on each room record with
Horizon's default 0; its low four bits are the icons the list draws; what each bit refuses is SVC-14's.

## 4. The transport, the identity, and how the next waves call it

The transport is SVC-05's (R6's shape (c), mounted as `textsHandler` is): a handler for `MatchServer`'s `http` list.
Every lobby operation is a logged-in player's -- Horizon throws each request without a session -- so
`lobbyHandler(lobby, { allowedOrigins, log, trustProxy, identify })` takes `identify(req) => { accountId, name } |
null` from the code that mounts it, and answers 401 when it names no one. **It is not mounted in `main.ts` by this
task**: the server has no logged-in session to identify yet (SVC-03's `AccountService` is not mounted there, and its
login ticket is the socket's, claimed once within 60 s). The session the lobby needs is ONL-07's connect and
SVC-07a's identity on join.

- **SVC-07a (the bridge)** constructs `new RoomService({ maps: allowlist.maps, livePlayers })` beside the texts in
  `main.ts` (the same `MAPS` allowlist the match server takes; empty offers every map, `main.ts`'s convention, so **the
  first release's deployment MUST set `MAPS=MP2,MP7,MP51,MP72`** (OT.R16; MP7 since OT.R45, 2026-10-12), the value `deploy/env.example` now documents),
  mounts `lobbyHandler` with its session's `identify` (the contract of §1),
  and calls: `reportGame(hostAccountId, id, report)` with the host's world report (the record's name, players, level,
  rules, GF1-GF3, GameStats, world status; a game is listed once reported staging or active, as Horizon creates its
  games pending, `Game.cs:96`, and lists staging and active ones, `MediusManager.cs:235`); `livePlayers(id)` to give
  each listed game its match room's live count (USERS's way: research 147 §1); `game(id)` and `members(id)` (each
  seat's account, name and join type) to make the match room and seat the accounts; `gameOf(accountId)` /
  `roomOf(accountId)`; `gamesHostedBy(accountId)` (the games an account hosts, seated in or not); `leaveGame` (the
  seat goes and every game the account hosts ends), `endGame`, `leaveRoom`, `logoff` on the socket's close and logoff;
  `banFromGame(id, accountId)` when the vote removes a player (V22; SVC-23); `offersLevel(level)` and `levelStem`.
- **ONL-11 (the briefing rooms list)** posts `/lobby/channel-list` `{ pageId: 1, pageSize: 999 }` and draws
  `roomListRows(entries)`; BACK posts `/lobby/leave-channel` `{}`; CROSS on a row posts `/lobby/create-channel` with the row's name and max players, then on
  -974 `/lobby/find-world` `{ name, worldType: 1 }`, then `/lobby/join-channel` `{ mediusWorldId, lobbyChannelPassword:
  '' }`, then `/lobby/set-filter` `{ filterField: 10, comparisonOperator: 0, baselineValue: 0 }` -- the client's own
  order (§2).
- **ONL-12 (the briefing room)** posts `/lobby/game-list` `{ pageId: 1, pageSize: 256 }` and draws each entry's
  `gameListColumns(entry)`; the entry's map is `levelStem(gameEntryLevel(entry))` (GameLevel, else GameStats byte 8);
  GAME DETAILS draws from the same entry's GameStats (no request).
- **ONL-13 (CREATE GAME)** posts `/lobby/create-game` with CreateGame1's fields as `FUN_002edda0` fills them (§2; the
  room's id as `genericField1`), then `/lobby/join-game` `{ mediusWorldId, joinType: 0, gamePassword }` as the
  client's event 0xf does; JOIN GAME and WATCH GAME post `/lobby/join-game` with join type 0 or 1; BACK from a game's
  lobby posts `/lobby/leave-game` `{}`.

## 5. Persistence and the live counts

Nothing of SVC-06 outlives a restart. The rooms are configuration -- Horizon makes them in memory at the first list
(R154.1) -- and a game is a world that lives with its host's connection: Horizon's games end with their host
(`MediusManager.cs:256-257`, a name freed when the host is gone; `Game.cs:202`, a game closed when its host never
reaches it) and a Medius server's restart ends every world. Here the host's leave or logoff ends every game it hosts,
seated in it or not -- a game created and never joined (the page closed between CREATE GAME's two posts) too; the
match server's own rooms are not kept either. So SVC-04's store is not used. A room's players are the accounts that
joined it and have not left or logged off; a game's are its seats, or the match server's live count when the bridge
gives one (`livePlayers`).

## 6. Departures from our Horizon

- CreateChannel1 (LobbyExt 0x00) and FindWorldByName are answered; Horizon answers neither (R154.2).
- A room is refused when full (`ROOM_FULL_STATUS_READING`); Horizon joins any number.
- A watcher's password is checked against the game's spectator password when it has one, else against the game's
  (`SPECTATOR_PASSWORD_READING`): the client sends SpectatorGamePassword when watching (D:L190376-190395) and an empty
  one whenever spectators are off (D:L190545-190547), so an empty spectator password must not open a private game;
  Horizon checks every join against the game's password (`MediusManager.cs:327`). Watchers are bounded by the
  spectator slots of the host's GameStats (byte 4, the row's SPEC MAX, D:L184437): none before the report. *(2026-10-14,
  WATCH-JOIN W2: retired -- the services bound a watcher by MaxPlayers only, the players and the spectator slots
  together, and the match room refuses one past the slots "Too many spectators", as the host does
  (`WATCH_SLOTS_HOST_REFUSAL_READING`, research 314 §3.2); a pending game is still not found to a watcher. The same
  task sets the security level's `SpectatorPassword` (4) for a game with a spectator password, which this list carried
  as `PlayerPassword` or `None` only (`SPECTATOR_PASSWORD_SECURITY_BIT_READING`, research 314 §2.2).)*
- A pending game (created, not yet reported) is joined by its host only; Horizon finds any game by id
  (`MediusManager.cs:318`), but the client only joins what the list shows.
- A game is created from a room only, with GF1 the room's id, as the client always sends it (D:L190576); Horizon takes
  the session's channel whatever GF1 says (`MediusManager.cs:288`).
- One game per host account (`GAMES_PER_HOST_PLACEHOLDER`): a next create ends the one before; Horizon sets no limit.
- A world report is checked as the create is (16-bit MinPlayers and MaxPlayers, the statuses the host sends, GF1 the
  room, no rename onto another live game's name, the map by GameLevel or GameStats byte 8); Horizon copies it whole
  (`Game.cs:368-403`).
- One filter per field, the FilterID the field (`FILTER_ID_READING`); filters compared `field <op> baseline`
  (`FILTER_COMPARISON_READING`); a game listed when every filter keeps it (Horizon's list keeps a game when any does,
  `MediusManager.cs:236`); the lobby-world filter keeps the session's room's games (`LOBBY_WORLD_FILTER_READING`;
  Horizon compares the game's own id, `GameListFilter.cs:32`).
- A world report is taken from the game's host only; Horizon takes every member's but keeps only the host's name
  (`Game.cs:349-361`). The host's leaving ends the game. *(2026-10-04, S17-SERVER: replaced before the launch by
  SVC-07b. The host's role passes to the next player by join order, and the game ends only when no player is left;
  research 159 §2, `HOST_SUCCESSOR_READING`.)*
- Game names are unique among the live games, a closed world's name free again (Horizon: among games whose host is
  connected and whose world is not closed or inactive, `MediusManager.cs:257`).
- The JoinGame and JoinChannel replies carry no connection info (§2): the page reaches the match room over the match
  server's own socket.
- CreateGame1 has no text filter (Horizon's `TextFilterContext.GAME_NAME` is configuration, V24); only the field's fit.

## 7. The game list's columns and the GameStats record

`gameListColumns(entry)` transcribes `FUN_002e2ce0` (R154.8); `gameStatsD(hex)` transcribes `FUN_002f7d90`
(D:L196759-196877), which brings an older GameStats up to the 'D' record of 0x28 bytes: 'D' (0x44) as is; 'C' (0x43,
0x27 bytes) gains a zero byte 7; 'B' (0x42, 0x26) a zero byte 6; 'A' (0x41, 0x25) a zero byte 5; any other first byte
is the oldest form, bytes 0, 1, 3, 4 and 5..0x24 made an 'A'. What the lists read of 'D': byte 3 (the spectators in
the game), byte 4 (the spectator slots), byte 7 (the rank bits), byte 8 (the map, copied to the record's GameLevel
when the entry's is 0, `FUN_002e1d50` D:L183890-183891); GAME DETAILS reads more (`FUN_002e1f20`). The rest of the
layout -- the play list, the round count and time that B_43's GAME DETAILS shows (VIGILANCE, MEDLEY, 11, 6) -- is
written by the host's `FUN_002f7c40` into the world report (`FUN_002ef590` D:L191323-191413) and is SVC-07a's to read;
the service stores the 256 bytes as reported and returns them.

The s4 game (`slice-Medius.log` line 14: MaxPlayers 24, GameLevel 51, GenericField2 0xFDE8 = 65000, GF1 0 the room
"Channel 1"'s id, GF3 0) with one player and eight spectator slots draws B_43's row: 1 16 / 0 8 / test / PING 3 (B_43's
red dot) / PASS 1 (B_43's empty box) / CLAN 1 (its empty box). That world report's name is `test$~Channel 1`, the room's
name after `$~`. **The cut**: the engine's text setter `FUN_00363830` copies a text up to the first `$~` and ends it
there (D:L261214-261243), and B_43 shows "test"; `drawnName` transcribes it and `gameListColumns` draws the name
through it (the test holds `test$~Channel 1` -> "test"). That the list's cell reaches this setter is the reading: the
call from the list widget (`FUN_00386460`, given the row by `FUN_002e2ce0` D:L184500) is through a table the
decompilation does not resolve. The review's lead, D:L128300, is another `$~` test: `FUN_00281d40`'s console-command
parser skipping an argument that opens with `$~`, not the row's name. Which code appends the suffix is not traced
(§8); the service stores the name as sent, and its uniqueness is of the whole name.

*GAME-PING (2026-11-01; product track, a browser adaptation):* the page now draws the PING cell from its own round trip
to the room's host door, under the same <300 / <600 bounds (viewer `gamePing.ts`; research 343 §4.1); the entry, its
GenericField2 of 65000 and `gameListColumns` / `gameListRow` above are unchanged -- the original's band of the field
stands wherever no page measurement replaces it.

**The rank icons, the two lists apart**: the rooms list tests GenericField1's low four bits (every icon when they are
0: `FUN_002e3cc0` D:L185011-185046); the GAME row tests GameStats byte 7 whole (every icon only when the byte is 0:
D:L184465-184492), so a byte of high bits alone (0x10, 0x80) draws no icon there. Two helpers, each tested.

### 7.1 GAME DETAILS: what `FUN_002e1f20` reads of the record (MU-13d, 2026-10-10)

`gameDetails(entry, missions)` (`packages/ui/src/screens/briefingRoomCommands.ts`, additive: the original's owed
`GetGameInfo`, ONL-12, and the modern lobby's detail panel both read it) transcribes `FUN_002e1f20` (D:L183973-184130),
which fills GAME_INFO_DETAILS (S:0x3f3b00) from the selected record (`FUN_002e4570`, D:L184006). The record is
`FUN_002e1d50`'s (D:L183873-183896): the entry copied at its own offsets (`FUN_002e1e10` D:L183911-183966: GameLevel
+0x28, RulesSet +0x30), the 'D' record at +0x19a, GameLevel from 'D'[8] when 0. The play list is +0x1a2 ('D'[8..]):
the record's vtable (0x4066b0, D:L183879) names at +8 the routine 0x2e24c0, two words the decompilation leaves out
(`jr ra; addiu v0, a0, 0x1a2`, read off the ELF's bytes); the loops read at most 0x20 bytes, ending at a 0.

- **The check** (D:L184010-184021): every play-list byte must be a mission of the table with MULTIPLAYER
  (`FUN_002c9040(0x441650, byte, 1)`, D:L168663-168679: NUMBER at the mission's +0x10, the MULTIPLAYER key's flag at
  +0xc, `FUN_002c9540` D:L168865-168875); else MISSION_AVAILABLE (S:0x3f3b20) 0 and the caption "UNAVAILABLE"
  (S:0x3f3c20) alone. An empty play list passes.
- **The caption** (each part ended by "\n", S:0x3f3b38): GameLevel's NAME (`FUN_002c8ae0(.., 1)` D:L168474-168495; the
  first record of that number with MULTIPLAYER, "unknown" S:0x3f2e10 when none); the type word -- MEDLEY (S:0x3f3b40)
  when any play-list entry's type (`FUN_002c8b80` D:L168498-168519, the mission's +0x14) differs from the first's,
  else **GameLevel's** type, not the play list's (D:L184050): BREACH, DEMOLITION, ESCORT, EXTRACTION, SUPPRESSION
  (S:0x3f3b78, 0x3f3b48, 0x3f3b80, 0x3f3b58, 0x3f3b68), any other UNKNOWN (S:0x3f3b88); "ROUND COUNT:" (S:0x3f3b90)
  'D'[1] by "%d" (S:0x3f3ba0); "ROUND TIME:" (S:0x3f3ba8) 'D'[2] by the same "%d" -- the minutes (`FUN_002f83b0`
  writes 'D'[2] x 60 into `mp_max_round_time`, D:L197176-197300); FRIENDLY FIRE (S:0x3f3bb8) when RulesSet bit 0,
  RESPAWN (S:0x3f3bc8) when bit 1 (D:L184079-184086); for an EQlimit 'D'[5] other than 0, PISTOLS ONLY, SHOTGUNS ONLY
  or SNIPERS ONLY (S:0x3f3bd0, 0x3f3be0, 0x3f3bf0) for 1, 2, 3 -- a larger value draws the line's ending alone.
- **The rank icons**: `game_info_rank_restrictions` (S:0x3f3c00) set to 'D'[7] (D:L184100-184112).
- **A correction to research 192 §3.11**: "%d min." (S:0x3f3c58) is the own game's caption (`FUN_002e24d0`, its
  `mp_max_round_time` / 60); the list path prints the bare number, as B_43's "ROUND TIME:6" shows.
- **Not drawn by GAME DETAILS**: the spectators, the password and the clan (the row's, R154.8) -- the modern panel
  keeps showing them from the row.
- **The mission table is the disc's** (`missionlist.rdr` of `RUN/READERC.ZAR`, read by `@s2u/ui` `missionRecords`, the
  reader CREATE GAME's PLAY LIST uses): without it the settings stand alone (`missions` null). Two edges of that reader
  against `FUN_002c9540`: a record with no NAME is dropped there, where the original keeps it with an empty name
  (D:L168858-168864), and a record with no NUMBER is dropped too, where the original defaults it to 0
  (D:L168865-168866); either would read UNAVAILABLE here. Neither occurs on the retail disc: the MU-13d review read its
  `missionlist.rdr` (22 records, each with NAME, NUMBER and TYPE; the review's count, 2026-10-10).

The modern lobby (MU-13d; since CX-LOBBIES the console's game detail, `packages/viewer/src/console/adapters/lobbies.ts`
`gameDetail`, the modern section's `view.ts` retired) shows these as facts: the map's name and the
mode only with the disc in (MU.R3, `../plans/2026-10-09-modern-ui-parallel.md`), the stem `MP<level>` before; FRIENDLY
FIRE and RESPAWN as On or Off (the bit the original's line stands for); "Unavailable" and no settings when the check
fails, as the original. **Reading, pending review**: transcribed and unit-tested
(`packages/ui/test/screens/gameDetails.test.ts`), not measured against the original running; B_43's
"VIGILANCE / MEDLEY / ROUND COUNT:11 / ROUND TIME:6" is the one capture of it (research 192 §3.11), not scored. No
placeholder or reading is added.

**`GetGameInfo`, the row (2026-11-01; ONL-12, the table's id 172, row 170).** Until now the row was declared and parked,
so GAME_INFO_DETAILS was never written and the GAME DETAILS panel (GameInfoWindow's WRAPPEDTEXT GameInfoText) was empty
in both dialogs that show it. It is now `BriefingRoomCommands.GetGameInfo` (`packages/ui/src/screens/briefingRoomCommands.ts`):

- **`FUN_00279d50` (D:L124148-124170)**: the argument (`FUN_0026ed60`), INPUT_STRING (S:0x3ee898, compared exactly by
  `FUN_00198f18`, D:L124157) replaced by the running animation's input string (`FUN_00272480`, D:L124158); with none,
  nothing is written (D:L124160). 'CurrentGame' (S:0x3eede8, compared without case by `FUN_00198b80`, D:L124161) runs
  `FUN_002e24d0` on the lobby (0x44f370); any other name `FUN_002e1f20`. The answer is 1 always (D:L124169).
- **The list path, `FUN_002e1f20`** (above): GAME_INFO_DETAILS added TEMPORARY and emptied first (S:0x3f3b18 is "",
  read off the ELF; D:L183993-183994) and MISSION_AVAILABLE acquired TEMP (D:L183995), so a name the room does not hold
  leaves the panel empty. The room is the record of MEDIUS_LOBBY_NAME (D:L183996-184004; the LAN lobby's branch,
  `FUN_003045b0(0x44fe10)`, is not taken, OT.R1). The game is found by the drawn name the port's row carries, as
  `JoinMPGame` finds it (`GAME_JOIN_BY_DRAWN_NAME_READING`, `gameLobbyCommands.ts`; the original's strcmp at +0x4c,
  D:L184006, compares the whole name its row holds). MISSION_AVAILABLE is written through its watchers (1 at
  D:L184024-184029, 0 at D:L184114-184119); game_info_rank_restrictions only when available (D:L184100-184112). Called
  by `UpdateGameListInfo` (GAMELIST's ONFOCUS and ONACTIVATE), whose script then shows the rank icons by the two valves.
- **The own game, `FUN_002e24d0` (D:L184131-184228)**: GAME_INFO_DETAILS added TEMPORARY and emptied (D:L184150-184151),
  then, each part ended by "\n" (S:0x3f3b38), **no map line**:
  - the type word: MEDLEY (S:0x3f3b40) when any entry of the play list the lobby holds at +0x84 (`FUN_002f82e0`
    D:L197073-197098, 0x20 bytes), from the second up to its first 0, has a type (`FUN_002c8b80`) other than the first
    entry's (D:L184155-184167); else the type of the current mission (`FUN_0027f800` D:L127147-127153, the name at
    0x414e00; `FUN_002c8a00` D:L168442-168471: a name longer than two characters, its number read past the first two
    by atoi, the first MULTIPLAYER record's type) -- BREACH, DEMOLITION, ESCORT, EXTRACTION, SUPPRESSION, any other
    UNKNOWN (D:L184169-184188);
  - "ROUND COUNT:" (S:0x3f3b90) and `mp_max_rounds` (S:0x3f3c30) by "%d" (S:0x3f3ba0), D:L184191-184195 -- the u16
    (`lhu` at 0x2e26d8, read off the ELF);
  - "ROUND TIME:" (S:0x3f3ba8) and `mp_max_round_time` (S:0x3f3c40) / 60, truncated, by "%d min." (S:0x3f3c58),
    D:L184196-184200;
  - FRIENDLY FIRE (S:0x3f3bb8) when `mp_friendly_fire` (S:0x3f3c60) is not 0 (D:L184201-184205), then RESPAWN
    (S:0x3f3bc8) when `mp_allow_respawn` (S:0x3f3c80) is not 0 (D:L184206-184210);
  - for an `EQlimit` (S:0x3f3c98) other than 0, PISTOLS ONLY, SHOTGUNS ONLY or SNIPERS ONLY for 1, 2, 3, any other
    value the line's ending alone (D:L184211-184225).
  It writes neither MISSION_AVAILABLE nor game_info_rank_restrictions; `show_game_details` (the game lobby's SELECT)
  shows the rank icons by `mp_rank_restrictions`. So the 24/7 respawn lobby, 1 round of 10 minutes (FF.R13,
  `../plans/2026-10-27-ff-respawn-247-lobby.md`), reads "SUPPRESSION\nROUND COUNT:1\nROUND TIME:10 min.\nRESPAWN\n" when
  its mission is a suppression map.
- **Where the page holds the lobby's half**: the play list at +0x84 is the held game's 'D'[8..0x28) -- the join copies
  it there from the record (`FUN_002f83b0` D:L197313-197325), the create from its list (`FUN_002f8270`
  D:L197045-197070), and the page's created record carries the list in its GameStats (`GameLobbyCommands.created`) --
  and 0x414e00 is `GameLobbyCommands`' mission ("mp%d", S:0x3f59b8, `FUN_0027f810` D:L197344-197345; the welcome's
  rotation sets it on the page). `GameLobbyCommands.currentGame()` hands both to the row; before any game is held, the
  play list is zeros (`FUN_002e0710` D:L182874-182885) and there is no mission (UNKNOWN). Which mission the console's
  0x414e00 holds between the lobby's entry and the first match is the one open edge (`LOADOUT_MISSION_READING`,
  `armoryProfileCommands.ts`); it only matters for a play list of one type, where every entry gives the same word.
- **Tests**: `packages/ui/test/screens/getGameInfo.test.ts` (the row, both paths, MEDLEY, FRIENDLY FIRE, EQlimit 0-4,
  UNAVAILABLE, a name not held, no argument) and `gameLobbyScreen.test.ts` (over the disc's dialogs: GAMELIST's focus
  runs `GetGameInfo(INPUT_STRING)`; the lobby's SELECT runs `GetGameInfo(CurrentGame)`; both fill GAME_INFO_DETAILS).
  **Reading, pending review**: `FUN_00279d50` and `FUN_002e24d0` transcribed and unit-tested, not measured against the
  original running. No placeholder or reading constant is added.

## 8. Unknowns

- What the original servers answered where our Horizon has no handler (CreateChannel1 for a new name, FindWorldByName
  not finding, a full room) -- ONL-32's transcripts, or unobservable for Sony's servers.
- The lobby-world filter's meaning on the original server: the reading (`LOBBY_WORLD_FILTER_READING`) is the only one
  under which the client's request keeps any game.
- The full GameStats layout (map and rules): bytes 3, 4, 7, 8 read here, and GAME DETAILS' 1, 2, 5 and the play list
  8.. (§7.1); the rest is the host's writer, SVC-07a's.
- The `$~<room>` suffix of a game's name in the world report: its writer is not traced; the row's cut is the text
  setter's (`FUN_00363830`, §7), the path from the list widget to it is not.
- A request-rate limit on the endpoint: the server has no limiter to reuse (SVC-03's attempt limit is the login's own,
  inside `AccountService`; SVC-05's texts have none) -- owed to SVC-23 (§10).
- `FUN_002e99f0`, CreateGame1's GF3 (the clan value: clan games are parked, OT.R6) and the room's GenericField1 bits
  (SVC-14a).
- CreateChannel1's last four bytes (+0x90, zero from `FUN_002ed740`'s memset) are not named.
- The `mp_persistent` path (cbCreateGame's FindWorldByName type 0 on a create failure): answered, not on the path.

## 9. Placeholders and readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `ROOM_WORLD_ID_FIRST_READING` (`packages/central/src/lobby.ts`) | 1 | the first room's world id: central's own (SA-17 re-cited it, 2026-10-19) -- the client keeps a room only for an id from 0 (D:L184914) and only carries it back, so any id from 0 reads alike (research 342 §4); 1 was Horizon's counter after its simulated "Channel 1" (§3), kept | nothing the client shows; ONL-32's transcript of the room list |
| `NEW_ROOM_STATUS_PLACEHOLDER` (`lobby.ts`) | -966 (Fail) | CreateChannel1 for a name outside the room set: no room is made (OT.R17); the client shows "Cannot join this room" for any status but -974 | ONL-32 against the local stack, or the owner allowing player-made rooms |
| `ROOM_FULL_STATUS_READING` (`lobby.ts`) | -948 (WorldIsFull) | the refusal of a room at its MaxPlayers, which Horizon never sends; the client's text says "It may be full" | ONL-32's transcript of a full room |
| `FIND_WORLD_NOT_FOUND_READING` (`lobby.ts`) | game -973, lobby -976 | FindWorldByName finding no world: Horizon has no handler; the client tells only success from failure | ONL-32's transcript |
| `FILTER_ID_READING` (`lobby.ts`) | 'field' | the FilterID SetGameListFilter0 answers, read from AUTOPLAY's set-field-1-clear-id-1 (Horizon: a per-session counter from 0) | ONL-32's AUTOPLAY transcript; C8's 2026-10-04 reading below: the decompilation does not settle it |
| `FILTER_COMPARISON_READING` (`lobby.ts`) | 'field-op-baseline' | the direction of a filter's comparison (Horizon: baseline op field) | ONL-32's AUTOPLAY transcript |
| `LOBBY_WORLD_FILTER_READING` (`lobby.ts`) | 'session-room' | what the room's lobby-world filter (field 10, operator 0, baseline 0) keeps | ONL-32's transcript of two rooms' lists |
| `MAP_NOT_OFFERED_STATUS_PLACEHOLDER` (`lobby.ts`) | -966 (Fail) | OT.R16's refusal of a map the release does not offer, which the original never makes; the client draws MP_MEDIUS_JOIN_GAME_FAILURE. *(2026-10-04, S17-SERVER:)* the allowed set is `FIRST_RELEASE_MAPS` (MP2, MP51, MP72; OT.R16, OT.R32), and it holds whatever `MAPS` says. `dlgCreateGame.rdr` binds MP_MEDIUS_JOIN_GAME_FAILURE to `create_game_failure`, which shows UIMnLOC #295 `_295_CreateGameFailed_MSG` "Create Game Failed!" and returns to the briefing room (`tools/dump-dialogs.ts --dialog dlgCreateGame.rdr`; #294, the name in use, is MP_GAME_NAME_EXISTS's). Fail is the nearest status that reaches it | the owner's word on the refusal's text, or the release's end |
| `GAMES_PER_ROOM_PLACEHOLDER` (`lobby.ts`) | 256 | the games a room holds at once (the client's page size); refusal NumGameWorldsPerLobbyWorldExceeded -945 | SVC-23's abuse limits; the owner |
| `GAMES_PER_HOST_PLACEHOLDER` (`lobby.ts`) | 1 | the games one account hosts at once, a next create ending the one before; Horizon sets none (`MediusManager.cs:241-314`), the client uses one (create, then its own JoinGame) | SVC-23's abuse limits; ONL-32's transcript of a second create |
| `SPECTATOR_PASSWORD_READING` (`lobby.ts`) | 'spectator-else-game' | the password a watcher's JoinGame is checked against: the spectators' when set, else the game's (the client sends an empty spectator password whenever spectators are off, D:L190545-190547; Horizon checks the game's, `MediusManager.cs:327`) | ONL-32's transcript of WATCH GAME on a private game, spectators on and off |
| `PAGE_SIZE_MAX_READING` (`lobby.ts`) | 999 | the largest PageSize the endpoint takes, the most the client asks (D:L184891, D:L197581) | SVC-23's abuse limits; the original servers' bound (unobservable) |

## 10. Owed to the next streams

What this task's endpoint and calls give the next streams is in §4; what it does not, by owner:

| owed to | what | where it stands |
|---|---|---|
| SVC-07a | mount `lobbyHandler` in `main.ts` with the session's `identify` (§1's contract); call `logoff` on the socket's close (it ends every game the account hosts, seated or not, `gamesHostedBy`); construct the service with the `MAPS` allowlist -- **set to `MP2,MP51,MP72` for the first release** (OT.R16; `deploy/env.example`) | the calls exist and are tested here; the mount is the bridge's. **Amended 2026-10-04 (SVC-07a, web research 159 §1):** the bridge does not call `logoff` on a socket's close, deliberately -- a close only frees the seat (`releaseSeat`) and ends an unstarted game its host's socket held (`gamesHostedBy`); `logoff` is called by the session's end (`AccountService`'s `onEnd`: LOGOFF, or the session idle with no socket), so a reload or a dropped socket does not log the account off the room service |
| SVC-07a / ONL-07 | Lobby 0x49 UpdateUserState (JoinedChatWorld on entering a room, KeepAlive) and Lobby 0x86 VersionServer (on entering a room and at login): the session's messages, neither answered by our Horizon's lobby (§2) | not built; the page need not post them to reach a game (no reply is read for either that gates the flow) |
| SVC-07a | the world report's writer (`FUN_002f7c40`, GameStats past bytes 3, 4, 7, 8) and the `$~<room>` suffix's writer | §7, §8 |
| SVC-23 | a request-rate limit on `/lobby/*` (no reusable limiter exists); the numbers of `GAMES_PER_ROOM_PLACEHOLDER`, `GAMES_PER_HOST_PLACEHOLDER`, `PAGE_SIZE_MAX_READING` | §8, §9 |
| ONL-11 | the rooms list: `/lobby/channel-list`, `roomListRows`, the three posts into a room and the filter (§4), BACK as `/lobby/leave-channel` | the endpoint answers all of them |
| ONL-12 | the room's games: `/lobby/game-list`, `gameListColumns` (the name cut, the icons by the whole of byte 7), the map by `gameEntryLevel` | the endpoint answers it |
| ONL-13 | CREATE GAME: `/lobby/create-game` from the room (GF1 the room's id), then `/lobby/join-game`; WATCH GAME's join type 1; BACK as `/lobby/leave-game` | the endpoint answers all of them |

**2026-10-04 (C8-FIX, from `C8-card-online-services.md` (research wave 2026-10-04; held outside the tree, at the controller's) #33-34; no code changed).** The two client filters read in opposite directions under one
literal reading, and the decompilation does not settle which: the client builds AUTOPLAY's `(PlayerCount field 1, operator
3, baseline 1)` (D:L197547-197549) and the room filter `(field 10, operator and baseline zeroed by a memset)`
(D:L191655-191660) but only *sends* them; the comparison is the server's, and the client's only check is its own pass for
a non-zero count (D:L197630-197635). Reading A, `field <op> baseline` (the port's `FILTER_COMPARISON_READING`): AUTOPLAY keeps
games with players, and the room filter `(id < 0)` keeps nothing, hence the invented `LOBBY_WORLD_FILTER_READING`
'session-room'. Reading B, `baseline <op> field` (Horizon's): AUTOPLAY keeps only games of at most one player, and the room
filter `(0 < id)` keeps every game. Horizon also ORs a session's filters, where the port ANDs them. Each pair is
self-consistent and neither is evidence of Sony's server. **What would settle them:** a wire capture of the original
client against a Sony-era server (none exists), or a second Medius title's server-side filter code; failing both, the
owner's or controller's ruling on the pair together. Both constants stay as they are, in the ledger above.
