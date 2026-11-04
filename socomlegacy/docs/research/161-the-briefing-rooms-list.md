# 161 -- BRIEFING ROOMS: the room list `RefreshRoomList` asks and draws, and a room's eligible ranks (ONL-11, SVC-14a)

Written 2026-10-05 for ONL-11 (`../roadmap/05-online-front-end.md` "ONL-11") and SVC-14a
(`../roadmap/06-online-services.md` "SVC-14a"), wave 3 of sprints 16 and 17 on the online path's plan
(`../plans/2026-10-02-online-path-target.md`, OT.R16, OT.R17, OT.R27; the waves table's `rooms-list` row). Sources: the
retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line, `FUN_<addr>` its functions;
cited, never pasted); the retail ELF read by address (its strings, `S:0x...`, and the instructions of `JoinMPRoom` at
0x27d270, which the decompilation does not give as a function); the names of the C library's routines from
`recomp/socom2_names.csv` (0x198f18 `strcmp`, 0x199648 `strncmp`, 0x199288 `strlen`); the disc's `dlgWorldOfSOCOM.rdr`
layout and set through the repository's readers (`tools/dump-dialogs.ts --dialog dlgWorldOfSOCOM.rdr --tree`, ONL-33's
pin `tools/test/onlineDialogs.pinned.json`); SVC-06's service as built (`packages/central/src/lobby.ts`, research 154).
**No server was contacted** (R293); no game was run; no browser was run (the host was another session's, the brief's
rule). It stands on research 154 (the rooms' service, R154.1 and R154.3), 155 §2.3 (the rank tiers and their icons),
157 (the lobby client, its ticket and the session lost), 158 (the menu, R158.10 and R158.11) and 116/117 (the focus
rule, the LISTBOX), and does not restate them.

The code: `packages/ui/src/screens/worldOfSocomCommands.ts` (`RefreshRoomList`'s body, the reply, the client's rooms,
the draw, `ELIGIBLE_RANKS`, the room row's gate), `packages/ui/src/screens/lobbyClient.ts` (`sessionLost(ticket)`),
`packages/viewer/src/worldOfSocomHost.ts` (`fetchRoomListService`, `sessionRoomList`, the mount's three options),
`packages/viewer/src/frontEnd.ts` (the option, the mount's ticket and session-lost hooks, the page's service),
`packages/central/src/lobby.ts` (`ROOM_RANK_BITS`, `roomEligibleRanks`, `ROOM_RANK_NOT_ENFORCED_READING` *(retired 2026-10-09, SVC-14: the gate is enforced, research 261 §10)*). The tests:
`packages/ui/test/screens/worldOfSocomCommands.test.ts` (the request, the reply, the order, the filters, the icons, the
empty and error states), `worldOfSocomScreen.test.ts` over `worldOfSocomRig.ts` (the disc's own record: the list
filled, its medals, the focus and the rows, the refresh, empty and error; CI on the fixtures),
`lobbyClient.test.ts` (one case: `sessionLost`), `packages/viewer/test/worldOfSocomHost.test.ts` (the bearer, the
401, no ticket), `packages/central/test/lobby.test.ts` (SVC-14a's three), `tools/test/worldOfSocomEntryCommands.test.ts`
(the entry list's states). Confidence: **reading, pending review** for every transcription; nothing is measured
against the original running (§6).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R161.1 | **`RefreshRoomList` is one request and a clear**: `FUN_0027daa0` reads the node's list off `ROOMLIST` and hands it to `FUN_002e3a30`, which answers 0 unless the lobby is up in state 11; then `FUN_002e3aa0` clears the client's rooms (`FUN_002e4140(0x44f568)`) and sends ChannelList_ExtraInfo0 with PageID 1 and PageSize 999 (the callback `FUN_002e3b00`), and the row answers 1. The node's list is not used: `FUN_002e3aa0` takes no argument | D:L126149-126170, D:L184852-184895 | §1 |
| R161.2 | **The reply keeps successes only and draws on EndOfList**: each 0xed entry whose status is a success (`FUN_002f42d0`: 0) and whose world id is not negative is kept -- the room of the same name (`strcmp`) updated in place, else a record added (`FUN_002e4240`); EndOfList then draws. A non-success entry -- Horizon's NoResult for an empty page -- keeps and draws nothing, so ROOMLISTVAR keeps what it held | D:L184900-184971 | §2.2 |
| R161.3 | **The draw**: the rooms sorted in place by `FUN_002e3f80` (GenericField1's high half, the name's length, the name without case: Horizon's four as Alpha, Bravo, Delta, Charlie); a room with no name, a "+Clan - " room that is not the member's own clan's, and a name opening "Medius" are skipped; each row is the array [name, players, then the integer 1..4 of each eligible rank], set into ROOMLISTVAR (lobby +0xb4, `DAT_0044f424`) | D:L184974-185056, D:L185059-185088; D:L182198-182199 | §2.3 |
| R161.4 | **The disc's `ROOMLIST` draws those arrays as A_47's columns**: six columns -- the name at 0, the players at 250, four IMAGE columns at 300, 320, 340, 360 (16 x 16) whose `TEXTURES` are `null.tif`, `Medal_Blue.tif`, `Medal_Bronze.tif`, `Medal_Silver.tif`, `Medal_Gold.tif`, `Medal_Black.tif`, each cell its `TEXTURES[value]`. A room admitting fewer ranks fills the first image columns: bits 0b0110 draw Bronze and Silver at 300 and 320 | the layout; `worldOfSocomScreen.test.ts` | §2.4 |
| R161.5 | **SVC-14a, the bits' layout**: GenericField1's low four bits; bit n-1 admits rank tier n (`CanJoinRoom`'s body `FUN_002e34e0`: 1 when the four bits are 0 or bit `tier - 1` is set, the tier `FUN_002eae20`'s); icon n is that tier's medal -- ENSIGN, LIEUTENANT, LT. COMMANDER, CAPTAIN (research 155 §2.3). The server carries the bits on each room record (Horizon's 0 on the four) and the page draws them | D:L184681-184712; research 155 §2.3 | §4 |
| R161.6 | **A room's rank restriction is drawn, not enforced.** The original refuses on the client, in `CanJoinRoom`, by the ladder's tier; the ladder is not built (SVC-13) and SVC-14 is parked (OT.R6), so neither the page nor the server refuses a join by rank. Our four rooms carry 0, so nothing on the path is restricted | `ROOM_RANK_NOT_ENFORCED_READING` (both packages) *(retired 2026-10-09, SVC-14: the gate is enforced, research 261 §10)* | §4 |
| R161.7 | **The refresh**: `init_screen` asks at ONSTART and its second sequence `roomlist_autorefresh` every 30 s; REFRESH LIST's `refresh_roomlist` asks once (then the 5..1 count of R158.11); `OnBadJoinState` and `OnJoinRoomFailure` ask after a failed join -- the same row each time, so each redraws from the server's answer | the set; `worldOfSocomScreen.test.ts` | §2.5 |
| R161.8 | **The transport (OT.R27)**: the page posts `{ pageId: 1, pageSize: 999 }` to SVC-06's `/lobby/channel-list` at the page's own origin with `Authorization: Bearer <the session's ticket>`; a 401 is the session lost, handed to the lobby client's `sessionLost` (state 2: MP_MEDIUS_ERROR with UIMnLOC 450, `OnMultiplayerDisconnect` on this dialog), as the keep-alive's 401; any other refusal is a request never answered; with no ticket no request is sent | `worldOfSocomHost.ts`; research 157 §6 | §3 |
| R161.9 | **CROSS on a room row is ONL-12's and is gated**: `join_room` runs `CanJoinRoom`, `.DINK`, the JOINING strip and `JoinMPRoom`, whose body (0x27d270 -> `FUN_002e3790`) sets the valve `room_rank_bits` (S:0x3f3e00) to the room's four bits, writes its name and queues the lobby's state 19 or 20 -- a chain of three request pairs (research 154 R154.2), not one request. The gate takes `join_room`'s start whole until the briefing room is built | D:L184759-184849; the ELF at 0x27d270 | §5 |

## 1. The request (R161.1)

`RefreshRoomList` is the table's row 41 (`FUN_0027daa0`, D:L126149-126170). The set aims it at the node `ROOMLIST`
(R158.10); the row's body asks the node's object for its list and hands the list's word (+0x68) to `FUN_002e3a30`
(D:L184852-184875). That function answers 0 unless the lobby's flag (+0x7d) is set and its state byte (+0x60) is 11;
then it calls `FUN_002e3aa0` and answers 1. `FUN_002e3aa0` (D:L184878-184895) is declared with no argument: it clears
the client's rooms (`FUN_002e4140(0x44f568)`, D:L185173-185192: each record freed, the count to 0), zeroes a 0x1a-byte
request, sets PageID 1 at +0x16 and PageSize 999 at +0x18, and sends it through `FUN_0064b098` (ChannelList_ExtraInfo0,
Lobby 0xec; research 154 §2) with the callback `FUN_002e3b00`. The handed list is not read.

The port (`WorldOfSocomCommands.RefreshRoomList`): online by `WORLD_LOBBY_STATE_READING` (research 158 §8), the
records emptied, `ROOM_LIST_QUERY` (`{ pageId: 1, pageSize: 999 }`) handed to the page's `RoomListService`, answer 1;
not online, 0 and nothing sent. A reply that arrives after the session went down is dropped (the console's callback
dies with its connection).

## 2. The client's rooms and the list

### 2.1 The records

The client keeps its rooms at 0x44f568 (the count `DAT_0044f56c`, the record pointers `DAT_0044f570`); each record holds
the 0xed entry from +0xc (the status at +0x18 of the entry is the record's +0x24 and so on: the world id at record +0x28,
the players at +0x2c, GenericField1 at +0x34, the name at +0x38). `WorldOfSocomCommands.rooms()` holds them as the
entries' copies.

### 2.2 The reply (R161.2)

`FUN_002e3b00` (D:L184900-184971) is called once per 0xed entry: `FUN_002f42d0("RoomList", status)` (S:0x3f3e18; the
function is `status == 0`, D:L194338-194343). On a success: a world id from 0 (D:L184914) looks the name up among the
records with `strcmp` (D:L184917-184925) -- found, the record is overwritten with the entry (D:L184930-184961); not
found, `FUN_002e4240` adds one (D:L184928). Then, still inside the success, EndOfList (+0x6c) calls the draw
(D:L184964-184965). A non-success is skipped whole: nothing kept, nothing drawn. SVC-06 answers an empty page with one
NoResult entry (research 154 §1), so **the empty state** is the list as it stood: no row on a fresh session (ROOMLISTVAR
`none`, as the lobby session's start leaves it, research 158 §3.3), and the last drawn rows when a refresh finds no
room -- the records are cleared by the request, the variable is not. **The error state** is a request never answered:
nothing changes.

### 2.3 The draw (R161.3)

`FUN_002e3cc0` (D:L184974-185056): the records sorted in place (`FUN_002e5150` with `FUN_002e3f80`, D:L184988); a
builder opened (`FUN_00333ae0`, `FUN_003339b0`); for each record: an empty name is skipped; a name opening '+' and
"+Clan - " (`strncmp` 8, S:0x3f3e28) is kept only when `FUN_002e6830` says the player is in a clan and the name is
"+Clan - %s" (S:0x3f3e38) of the clan's name at 0x44f5a4 (D:L184996-185003); a name opening "Medius" (`strncmp` 6,
S:0x3f3e48, D:L185006) is skipped; else a row is opened, the name appended (`FUN_00333610`), the players (`FUN_00333700`
of the record's 16-bit +0x2c), then for each of the bits 1, 2, 4, 8 -- or for all four when the low four bits are 0 --
the integer 1, 2, 3, 4 (D:L185011-185046), and the row closed (`FUN_00333770`, which appends the finished array to its
parent). The whole is set into `DAT_0044f424` (D:L185051) -- ROOMLISTVAR, the variable `FUN_002df6a0` added at lobby
+0xb4 (D:L182198-182199).

`FUN_002e3f80` (D:L185059-185088): GenericField1 >> 16 ascending, then `strlen` ascending, then `FUN_00198b80` (the
names with A-Z folded) -- Alpha, Bravo, Delta, Charlie for Horizon's four. The port: `roomListRows(records, clanName)`
over the records sorted by the same order (`Array.prototype.sort` is stable where `FUN_002e5150` need not be; names are
unique in the records, so no two compare equal). The clan's name is the mount's `clanName` hook, absent while clans are
parked (ONL-27): no "+Clan - " room is drawn, as for a player in no clan.

### 2.4 What `ROOMLIST` shows (R161.4)

The disc's LISTBOX `ROOMLIST` (178, 116; 447 x 270) on ROOMLISTVAR has six columns: two text (at 0 and 250, 20 high)
and four IMAGE (at 300, 320, 340, 360; 16 x 16; top offset -20), each image column with `TEXTURES` `null.tif`,
`Medal_Blue.tif`, `Medal_Bronze.tif`, `Medal_Silver.tif`, `Medal_Gold.tif`, `Medal_Black.tif`. The LISTBOX's own
reading of an array element (research 117 §6; `FUN_0037ae10`) draws an IMAGE cell as `TEXTURES[value % count]`, so the
row [Alpha, 2, 1, 2, 3, 4] shows "Alpha", "2" and the four medals Blue to Gold; a room with bits 0b0110 shows Bronze
and Silver in the first two image columns and nothing in the last two. The headers above it (#767-769, ROOM NAME /
# of PLAYERS / ELIGIBLE RANKS) are the menu's (research 158 §1). The rig test reads the items off the disc's record.

**The focus and the rows.** BRIEFING ROOMS' CROSS (`PressBriefingRoombtn`) activates `ROOMLIST`; with rows the list
takes the pad (R158.11 had it empty, taking none): DOWN and UP step its focus row, TRIANGLE runs its binding
`OnBriefingRoomstart` back to MESSAGES, CROSS is the room row's (§5). A redraw while the list holds the focus keeps
the LISTBOX's own handling of a rebuilt item list (PLAT-08's widget, `LISTBOX_REBUILD_CONTENT_PASS_READING`).

### 2.5 The refresh (R161.7)

The set asks the row from four places, every one the same handler: `init_screen` at ONSTART and its second sequence
`roomlist_autorefresh` (WAIT 30, ask, LOOP), REFRESH LIST's `refresh_roomlist`, and `OnBadJoinState` /
`OnJoinRoomFailure` after a failed join (both `ROOMLIST.op3`, R158.10). The rig holds the first three: one request at
arrival, one more 31 s on, one on REFRESH LIST, each redrawing the players the fake service answers. The two join
paths are not reached here: `join_room` is gated (§5) and no service raises MP_MEDIUS_JOIN_ROOM_FAILURE yet (ONL-12).

## 3. The page (R161.8)

`fetchRoomListService(base)` posts the query as JSON to `<base>/lobby/channel-list` with `authorization: Bearer
<ticket>`, `credentials: 'omit'`, `cache: 'no-store'`. The base is `accountServiceBase` -- the page's own origin
(`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, research 157 §5: `server=` only under `?devmode` on a development build),
because the request carries the session's live ticket. `channelListOf` checks the answer's `entries` field by field.
`sessionRoomList(transport, ticket, sessionLost)` is the client's `RoomListService`: the ticket read at each request
from the lobby (`FrontEndSession.lobby?.ticket()`, ONL-07's seam), a 401 handed to `LobbyClient.sessionLost(ticket)`
-- the keep-alive's own path (`SESSION_LOST_READING`), now public: for the ticket still held, while the session is up
and no logout is asked, the ticket and the flag dropped and state 2 queued, which posts MP_MEDIUS_ERROR with UIMnLOC
450's text and so runs this dialog's `OnMultiplayerDisconnect` -- as connect handles a lost session.

- `ROOM_LIST_HTTP_ADAPTATION`: 2xx the entries; 401 the session lost; 403, 404, 429, 5xx, another shape, no answer: a
  request never answered (the list keeps its rows). The keep-alive reads 403 and 404 as a loss
  (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`); the room list does not, the keep-alive meeting a misconfigured deploy
  within 30 s anyway.
- `ROOM_LIST_NO_TICKET_ADAPTATION`: no ticket, no request. The console sends its request on its lobby connection
  whatever its login; the page's request with no bearer would be a 401 and a session lost that never began (a deep
  link to the menu has no login).

The server side is SVC-06's `channelList` behind SVC-07a's `bearerIdentify` (research 154 §1, 159): no server code
changed for the transport.

## 4. SVC-14a: a room's eligible ranks (R161.5, R161.6)

**The layout.** `CanJoinRoom` (`FUN_0027d690`, D:L126002-126020) finds the room by its INPUT_STRING name and asks
`FUN_002e34e0` (D:L184681-184712): with the room found, the tier `FUN_002eae20(-1)` (research 155 §2.3: four tiers,
4 for everyone while the ladder holds 1 to 11) and the low four bits of GenericField1 (record +0x34); the answer is 1
unless the bits are non-zero and bit `tier - 1` is clear (D:L184706-184712). So bit 0 admits tier 1, bit 1 tier 2,
bit 2 tier 3, bit 3 tier 4, and 0 admits every tier. The list draws icon n for the same bit (§2.3), whose medal is
`TEXTURES[n]` (§2.4); research 155 §2.3 names the four tiers by their medals: ENSIGN (Blue), LIEUTENANT (Bronze),
LT. COMMANDER (Silver), CAPTAIN (Gold). The join's `FUN_002e3790` copies the same four bits into the valve
`room_rank_bits` (S:0x3f3e00; D:L184790, D:L184824) for the room's screen. D:L197287, named by the roadmap beside them,
is the game's counterpart: `FUN_002f83b0`'s (JoinMPGame's body, from D:L197114) copy of a game record's GameStats byte 7 (record +0x1a1) into the valve
`mp_rank_restrictions` (S:0x3f5910) -- the game list's, ONL-12's and SVC-14's, not the rooms'.

**Carried.** Server: `RoomConfig.genericField1` on each room, listed at the 0xed entry's +0x28 by `channelList`
(research 154 §1); `ROOM_RANK_BITS` names the layout and `roomEligibleRanks` the icons (`lobby.ts`); Horizon's four
carry 0 (OC-4, OT.R17). Client: `ELIGIBLE_RANKS` and `roomEligibleRanks` (`worldOfSocomCommands.ts`), the rows' icon
integers, the disc's medals.

**Not enforced, plainly.** No join is refused by a room's rank bits, on the page or on the server
(`ROOM_RANK_NOT_ENFORCED_READING`, in both packages). The original's refusal is the client's own `CanJoinRoom` over the
ladder's tier; the ladder (SVC-13) and the gate (SVC-14) are parked (OT.R6), and the room row's CROSS is gated (§5), so
`CanJoinRoom` is not reached. With every room at 0 the question does not arise on the path; a room set with rank bits
would draw its medals and admit anyone.
*2026-10-09 (SVC-14, W10.R3): enforced on the services -- `joinChannel` and `joinGame` judge the bits by the stored
tier; `ROOM_RANK_NOT_ENFORCED_READING` retired (§7). The rule, the code (#525 / #50 are texts, not statuses), where
the original checks and where the port does, and the tier at the edges: research 261 §10.*

## 5. CROSS on a room row (R161.9)

`ROOMLIST`'s CROSS binding is `join_room`: `SuspendMenuInput(5.0)`; `IF CanJoinRoom(INPUT_STRING)` -- `.DINK`,
`ScaleProgress`, `playername` hidden, `join_flash`, `JoinMPRoom(INPUT_STRING)`, then `WHILE socom_online_state != 11`
(19 and 20 wait; any other state runs `OnBadJoinState`: #804 for 2 s and the list asked again) -- `ELSE` #50 in the
JOINING strip for 2.5 s. The event MP_JOIN_ROOM then runs `switch_to_briefing_room` -> `ReturnToBriefingRoom`
(`SWITCHMENU(dlgMPBriefingRoom.rdr)`).

`JoinMPRoom` is row `FUN_0027d270`, which the decompilation folds away (it sits between `FUN_0027d220` and
`FUN_0027d310`). Read in the ELF at 0x27d270: the argument by `FUN_0026ed60`, INPUT_STRING (S:0x3ee898) replaced by
the list's input string (`FUN_00272480`), "RANDOM" (S:0x3ef348) passed as no name, then the call of
`FUN_002e3790(0x44f370, name)`. `FUN_002e3790` (D:L184759-184849): with the lobby up in state 11 -- "RANDOM" picks a
random record, "NONE" (S:0x3f3e10) answers 1 at once, else the record of that name -- the world id kept in
`DAT_0066a538`, `room_rank_bits` set to its four bits, the name written to the variable at lobby +0xc0, and state 19
queued (state 20 with no id), answer 1. States 19 and 20 send CreateChannel1, FindWorldByName and JoinChannel
(research 154 R154.2). It is not one request, and the screen it leads to is ONL-12's, so per the brief nothing of it
is wired: `ROOM_JOIN_GATE_READING` takes `join_room`'s start whole on this dialog (the parked rows' gate, extended:
`ROOM_JOIN`), so CROSS on a row plays nothing, suspends nothing and builds nothing. `CanJoinRoom` and `JoinMPRoom` stay
the table's (parked, with the reason in `WORLD_OF_SOCOM_ENTRY_COMMANDS`). ONL-12 removes the gate's line.

## 6. Unknowns, contradictions, what is not done

- **No capture compared.** `A_47_rooms.png` (PCSX2 against an earlier Horizon) lists "Channel 1", 2 players and the
  four icons; the owner chose the default names (OT.R17), so the port's rows differ from it by design, and no score
  was run (no browser on this host today). The acceptance's capture comparison stays owed (ONL-32 for the proven
  level).
- **The session start's request.** `FUN_002df6a0` ends by asking the room list once unless the LAN lobby is up
  (D:L182227-182230). The port adds the variables when the session is made, before any login, where the request would
  carry no ticket; it is not sent there (`lobbySessionStart`'s doc). It belongs with `LobbyConnect`'s move (ONL-07's).
- **`RefreshRoomList` on the agreement.** `dlgUsagePolicy`'s ONSTART asks the room list too (research 156); the row is
  registered on the session, so on the page that request now goes out there as well, as on the console, and its
  rows are ready when the menu opens. The agreement's own test registers its modules only and is unchanged.
- **The LISTBOX on a redraw while focused**: which row keeps the focus after the items are rebuilt is the widget's
  (PLAT-08), not re-read here.
- **The sort's stability**: `FUN_002e5150` is not read; equal keys need equal names, which the records never hold.
- **Not done here**: the corpus (the controller's rebuild, W6.R7 -- run by this task as the brief asked: §8);
  `PROCESS.md`'s range (it already ends past 161).

## 7. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `ROOM_JOIN_GATE_READING` (`packages/ui/src/screens/worldOfSocomCommands.ts`) | `join_room`'s start taken on `dlgWorldOfSOCOM.rdr`: a room row's CROSS does nothing | the join is a chain of lobby states and three request pairs leading to the briefing room, ONL-12's; the brief leaves the transition stubbed and named | **retired 2026-10-05** by ONL-12 (research 162 §1): `join_room` runs, and a listed room is joined by JoinChannel alone (state 19), not three pairs |
| `ROOM_RANK_NOT_ENFORCED_READING` (`worldOfSocomCommands.ts`; and `packages/central/src/lobby.ts`) | the rank bits drawn as the original draws them; no join refused by rank | the original's gate is `CanJoinRoom` over the ladder's tier (`FUN_002e34e0`, `FUN_002eae20`); the ladder and SVC-14 are parked (OT.R6) | **retired 2026-10-09** by SVC-14 (W10.R3; research 261 §10): the services judge both joins by the stored tier; the page's own check waits for its tier (`PLAYER_TIER_PARKED_READING`, research 165 §6) |
| `ROOM_LIST_LATEST_REPLY_ADAPTATION` (`worldOfSocomCommands.ts`; an adaptation, added by the review 2026-10-05) | a reply taken only for the latest request, under the ticket it was sent with and still held | the page's HTTP replies can arrive out of order and after a logoff or a lost session, where the console's come in order on one connection that dies with the session | nothing of the original: kept while the transport is HTTP |
| `ROOM_LIST_STUB_READING` | -- | research 158 §8's stub of `RefreshRoomList` | **retired 2026-10-05** by this task's body (§1-§3) |

Adaptations, named and not ledger suffixes: `ROOM_LIST_HTTP_ADAPTATION` and `ROOM_LIST_NO_TICKET_ADAPTATION`
(`packages/viewer/src/worldOfSocomHost.ts`, §3); `ROOM_LIST_LATEST_REPLY_ADAPTATION` (`worldOfSocomCommands.ts`, the
review's two findings of 2026-10-05: each request numbered with its ticket; a reply that is not the latest request's,
or whose ticket is gone or replaced -- a logoff, a lost session, a new login -- is dropped, since on the page the
session's `lobbyUp` is not handed in and `WORLD_LOBBY_STATE_READING` counts the menu as online throughout). Reused, not added: research 158's `WORLD_LOBBY_STATE_READING` (online
means up in state 11) and `PARKED_ROW_GATE_READING` (the gate extended by one animation); research 157's
`SESSION_LOST_READING` (the 401's path, now reached through `LobbyClient.sessionLost`) and
`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION` (the base); research 117's `LISTBOX_REBUILD_CONTENT_PASS_READING`.

## 8. The record

The tests named above, run one file group at a time (`--maxWorkers=1`, at most three files a call) on the dev host
with `SOCOM_DISC` and `SOCOM_PC_ROOT` set; the typechecks `npx tsc -b packages/ui`, `npx tsc --noEmit -p
packages/viewer` and `-p packages/server`; `tools/test/docs.test.ts`, `conventions.test.ts` and
`placeholderLedger.test.ts`. The counts are the task's report's, not repeated here.
