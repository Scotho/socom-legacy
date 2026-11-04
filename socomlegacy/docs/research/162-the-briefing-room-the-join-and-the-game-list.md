# 162 -- BRIEFING ROOM: the join `join_room` runs, the room's game list, the way out, and the chat panel drawn (ONL-12, ONL-23a)

Written 2026-10-05 for ONL-12 (`../roadmap/05-online-front-end.md` "ONL-12") and ONL-23a ("ONL-23a"), wave 3 of
sprints 16 and 17 on the online path's plan (`../plans/2026-10-02-online-path-target.md`, OT.R8, OT.R16, OT.R27; the
waves table's `briefing` row). Sources: the retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT`
(`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted); the retail ELF's strings read by address through
`tools/elfImage.ts` (`S:0x...`); the disc's `dlgMPBriefingRoom.rdr` layout and set (`tools/dump-dialogs.ts --dialog
dlgMPBriefingRoom.rdr --tree`, ONL-33's pin `tools/test/onlineDialogs.pinned.json`) and `global_valves.rdr`
(`RUN/READERC.ZAR`); SVC-06's service as built (`packages/central/src/lobby.ts`, research 154). **No server was
contacted** (R293); no game was run; no browser was run (the host was another session's, the brief's rule). It stands
on research 154 (the endpoint, R154.2, R154.8), 157 (the lobby client, its states and the session lost), 158 (the
menu), 161 (the rooms list, R161.9) and 128 §4.9 (the dialog), and does not restate them.

The code: `packages/ui/src/screens/briefingRoomCommands.ts` (`CanJoinRoom`, `JoinMPRoom`, the lobby's states 19 and
20, `RefreshGameList` with its reply and draw, the gates, the entry list), `packages/ui/src/screens/worldOfSocomCommands.ts`
(the room row's gate lifted, the entry list), `packages/viewer/src/briefingRoomHost.ts` (the four requests with the
bearer, the mount), `packages/viewer/src/frontEnd.ts` (the option, the mount, the page's service). The tests:
`packages/ui/test/screens/briefingRoomCommands.test.ts` (the rows, the join, the reply, the game list's order,
filters and staleness, the gates), `briefingRoomScreen.test.ts` over `briefingRoomRig.ts` (the walk on the disc's own
records: the menu, a room, the briefing room, the way back; a refused join; a lost session; CI on the fixtures),
`worldOfSocomScreen.test.ts` (the row's CROSS with no join rows), `packages/viewer/test/briefingRoomHost.test.ts` (the
bearer, the 401, no ticket), `tools/test/briefingRoomEntryCommands.test.ts` (the entry list against the pin; the two
filter valves on the disc). Confidence: **reading, pending review** for every transcription; nothing is measured
against the original running (§7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R162.1 | **`JoinMPRoom` queues state 19 for a listed room, one request**: `FUN_002e3790` keeps the record's world id in `DAT_0066a538` and queues state 0x13 when it is 0 or more, 0x14 only with none (D:L184839-184845); `FUN_002ed460` installs `FUN_002ee290` (JoinChannel) at 0x13 and `FUN_002ed740` (CreateChannel1) at 0x14 (D:L190211-190216). `FUN_002e3b00` keeps only records with a world id from 0 (D:L184914), so a listed room is joined by JoinChannel alone; research 161 R161.9's "three request pairs" is state 20's chain, not reached from the list | D:L184759-184849, D:L190211-190216 | §1 |
| R162.2 | **State 19**: GAMELISTVAR set to an empty array, JoinChannel with the kept id and the empty password (S:0x3f48d0); a refusal queues state 11 and posts MP_MEDIUS_JOIN_ROOM_FAILURE (S:0x3f4760) with "Cannot join room. It may be full. Please try another." (S:0x3f49a0); a success queues state 16, whose connection's callback queues 11, posts MP_JOIN_ROOM (S:0x3f4b68) and sends the lobby world's filter (field 10, operator 0, baseline 0) | `FUN_002ee290` D:L190668-190701; `FUN_002ee3a0` D:L190704-190776; `FUN_002efc80` D:L191621-191667 | §1 |
| R162.3 | **`CanJoinRoom` is the record by name**: `FUN_0027d690` reads INPUT_STRING (S:0x3ee898) as the animation's input string and asks `FUN_002e34e0`: no record 0 (`join_room` then shows #50); a record 1 unless its rank bits refuse the tier -- not enforced (`ROOM_RANK_NOT_ENFORCED_READING`, research 161) *(retired 2026-10-09, SVC-14: the gate is enforced, research 261 §10)* | D:L126002-126020, D:L184681-184712 | §1 |
| R162.4 | **The room's name is MEDIUS_LOBBY_NAME** (S:0x3f39e0, lobby +0xc0, added PERMANENT by `FUN_002e0450`, D:L182779-182780), written by `JoinMPRoom` (D:L184838) and drawn by the room's `roomname`; the valve `room_rank_bits` (S:0x3f3e00) takes the record's four bits | D:L184790, D:L184824, D:L184838 | §1 |
| R162.5 | **`RefreshGameList` asks page 1 of 256 for the room's record**: `FUN_0027db40` -> `FUN_002e28d0` (the session up, else 0) -> `FUN_002e2920`: the room's games with no player dropped (`FUN_002e4700`), the six filter valves read, the games still unrefreshed since the last request dropped and the rest marked (`FUN_002e4630`, +0x198), GameList_ExtraInfo0 with PageSize 0x100 | D:L126173-126210, D:L184235-184315 | §2 |
| R162.6 | **The reply keeps by name, a failure draws**: `FUN_002e2b00`: a non-success entry draws what is held (unlike the rooms list's); a success with a world id from 0 updates the game of the same name (`FUN_002e4570`, +0x4c) or adds one, the GameStats brought to the 'D' record and GameLevel from byte 8 when 0, the mark cleared; EndOfList draws. A game gone from one answer is drawn once more and dropped at the next request | D:L184318-184388 | §2 |
| R162.7 | **The draw is B_43's row, sorted by GameStats byte 6**: `FUN_002e2ce0` sorts the room's games (`FUN_002e4a90` / `FUN_002e5d90`: byte 6 of the 'D' record -- research 154's `mp_game_sort_order` -- then the name without case), skips a security of -1, applies the client's filters (`FUN_002e3080`) and builds [name, IN, MAX, SPEC, SPEC MAX, ping, pass, clan, rank icons], which the disc's GAMELIST draws in its twelve columns (five text, then ping dots, two boxes, four medals at x 800) | D:L184391-184506, D:L184509-184546 | §2 |
| R162.8 | **The filters pass every game at a fresh card's values**: `global_valves.rdr` gives GamePasswordFilter and LockedFilter 2 PERSIST (the "any"), GameSpeedFilter 65000, GamePlayerFilter 0, FF_FILTER 2, GameTypeFilter 0; LockedFilter 0 would hide every game, so the page seeds the two no path dialog names | `global_valves.rdr`; `BRIEFING_ROOM_GLOBAL_VALVES` | §2 |
| R162.9 | **The way out sends nothing on the console**: `exit_lobby`'s `JoinMPRoom(NONE)` answers 1 before any write (D:L184805-184808), then `ReturnToWorldOfSOCOM`; the page tells our server the room is left (`ROOM_LEAVE_ADAPTATION`) | D:L184805-184808; the set | §3 |
| R162.10 | **ONL-23a**: the room's chat panel is the disc's layout -- `ChatWindowTxt` (#519) over `CHATLIST`, a WRAPPEDTEXT on MEDIUS_CHAT_RECV_VAR (an empty array from the lobby session's start, D:L182204-182208), the help bar's "½ TEXT CHAT" -- drawn as it stands; R1 and a USB keyboard's ENTER (`do_chat`) are gated (`TEXT_CHAT_GATE_READING`) | the layout; `briefingRoomScreen.test.ts` | §4 |

## 1. The join (R162.1 - R162.4)

`join_room` (ROOMLIST's CROSS, research 161 §5) now runs. `CanJoinRoom` (`FUN_0027d690`, D:L126002-126020) reads its
argument through `FUN_0026ed60`; INPUT_STRING (S:0x3ee898) is replaced by the running animation's input string
(`FUN_00272480`) -- the LISTBOX row's caption, the room's name -- and `FUN_002e34e0` (D:L184681-184712) looks the name
up among the client's rooms with `strcmp`: none, 0; found, 1 unless the four bits are non-zero and the tier's bit is
clear. The tier is the ladder's (SVC-13, parked), so the port answers 1 for any record (research 161 §4).

`JoinMPRoom` (0x27d270, the row research 161 read in the ELF) hands its argument, INPUT_STRING replaced the same way,
to `FUN_002e3790` (D:L184759-184849): 0 unless the session's +0x7d is set and its state is 11; `DAT_0066a538` to -1;
"RANDOM" (S:0x3f3df8) takes record `(count - 1) x FUN_00197740() / 2.1474836e+09` (D:L184779-184786); "NONE"
(S:0x3f3e10) answers 1 at once (D:L184805-184808); any other name its record. A record found: its world id
(+0x28) kept, `room_rank_bits` set to its +0x34 & 0xf through the watchers (`FUN_00351ff0`, `FUN_003519f0`). Then the
name into MEDIUS_LOBBY_NAME (`FUN_003862a0(lobby +0xc0, name)`, D:L184838) and state 0x13 queued -- 0x14 with no id --
and 1. The port (`BriefingRoomCommands.JoinMPRoom`) does the same over ONL-07's `LobbyClient` (`queueState`); with no
lobby (a page with no account service) the flag is clear and it answers 0.

**State 19** (`FUN_002ee290`, D:L190668-190701, at its entry): GAMELISTVAR (`DAT_0044f420`) set to an empty array, a
0x4c-byte JoinChannel with the session key, the world id at +0x28 and the password from S:0x3f48d0 (the empty string)
sent with the callback `FUN_002ee3a0`. `join_room`'s WHILE waits while the state is 19. **The reply**
(`FUN_002ee3a0`, D:L190704-190776): a non-success ("JoinRoom", S:0x3f4988, through `FUN_002f42d0`) queues state 11 and
calls the event callback with MP_MEDIUS_JOIN_ROOM_FAILURE and S:0x3f49a0; a success copies the channel's connection
info and queues state 16 (D:L190770-190774), whose entry connects it (`FUN_002efa90`) and whose callback
(`FUN_002efc80`) queues state 11, posts MP_JOIN_ROOM, sends UpdateUserState and the lobby world's filter
(SetGameListFilter0: field 10 at +0x28, operator and baseline zeroed) and VersionServer. On our server there is no
second connection (`ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION`): state 11, MP_JOIN_ROOM and the filter follow the reply at
once. MP_JOIN_ROOM runs the menu's `switch_to_briefing_room` -> `ReturnToBriefingRoom` (UIanim.rdr:
`SWITCHMENU(dlgMPBriefingRoom.rdr)`, ComeFromLan 0); MP_MEDIUS_JOIN_ROOM_FAILURE its `OnJoinRoomFailure` -- the room
list asked again (`ROOMLIST.op3`), the text in a popup for 2 s, `join_room` and the strip stopped, ROOMLIST activated,
#805.

**State 20** (`FUN_002ed740`, D:L190224-190263): the record of MEDIUS_LOBBY_NAME, and CreateChannel1 when found
(research 154 R154.2). Not reached from the list (R162.1); the port finds no record and sends nothing
(`CREATE_CHANNEL_STATE_READING`).

**The contradiction kept open.** `join_room`'s WHILE runs `OnBadJoinState` (#804) for any state but 19 and 20 while it
is not 11 -- state 16 among them, which the console's success passes through for as long as its connection takes.
Whether the console's state-16 connection to the same lobby server answers within the frame, or the event switches the
dialog before the script's next tick, is not read; the port has no state 16 here, so the question does not arise on it
(§7).

## 2. The game list (R162.5 - R162.8)

`autorefresh` (ONSTART: WHILE forever, `auto_refresh_gamelist`, WAIT 30) asks `GAMELIST.op4` -- names[4],
`RefreshGameList`, a table row aimed at a node, as research 158 §2.3 reads `ROOMLIST.op16` -- while
`socom_online_state` is 11 and the list is active; REFRESH LIST's `refresh_gamelist` asks it once with
`PLAYERLIST.op6` (`RefreshRoomPlayerList`), then the 5..1 count. `FUN_0027db40` (D:L126173-126210) with no LAN lobby
calls `FUN_002e28d0` (D:L184233-184252): 0 with the session's flag clear, else `FUN_002e2920` and 1 (the row's own body
is void; the port answers the call's 1).

`FUN_002e2920` (D:L184255-184315): the room's record (`FUN_002e4470`, the name MEDIUS_LOBBY_NAME holds); its games
with +0x20 (players) 0 freed (`FUN_002e4700` / `FUN_002e4790`); the six valves read into `DAT_0044f528` ..
`DAT_0044f550` (S:0x3f3ca0 GameTypeFilter, 0x3f3cb0 GamePlayerFilter, 0x3f3cd0 GameSpeedFilter, 0x3f3ce0
GamePasswordFilter, 0x3f3cf8 FF_FILTER, 0x3f3d08 LockedFilter); its games still marked freed (`FUN_002e4630` /
`FUN_002e46c0`) and the rest marked (+0x198 = 1); the request (PageID 1, PageSize 0x100) sent with `FUN_002e2b00`.
`FUN_002e2b00` (D:L184318-184388): per entry, a non-success ("GameList Callback", S:0x3f3d20) draws the room; a
success with an id from 0 finds the game of that name (`FUN_002e4570`) -- none, a 0x1c4-byte record made from the entry
(`FUN_002e1d50`); found, overwritten (`FUN_002e1e10`, `FUN_002f7d90` into +0x19a, GameLevel from +0x1a2 when 0) -- and
clears its mark; EndOfList draws. `FUN_002e2ce0` (D:L184391-184506) with GAMELISTVAR held: the games sorted in place,
each whose +0x40 is not -1 and that `FUN_002e3080` passes drawn as the row R154.8 transcribes; the array set into
GAMELISTVAR. Research 154's server half (`gameListColumns`) and this client half agree cell for cell on the s4 game:
"test 1 16 0 8", the red dot, two empty boxes, the four medals.

**The filters** (`FUN_002e3080`, D:L184509-184546): a security other than -1 with GamePasswordFilter not 2 -- a
password game hidden at 0, an open game at 1; the game type (`FUN_002e31e0`: 0 passes all,
`GAME_TYPE_FILTER_READING`, retired 2026-10-10: research 265 §2.2 transcribes the rest); players at least GamePlayerFilter; GenericField2 at most GameSpeedFilter; FF_FILTER 2 or
its 1 matching the rules' bit 0; LockedFilter 2, or 1 and a world status not 3 (0 refuses every game). The page reads no
`global_valves.rdr` yet (OPT-02's); ONL-09 seeds the twelve valves the menu's chapter names, and this task the two the
list reads that no path dialog names (`BRIEFING_ROOM_GLOBAL_VALVES`, held to the disc by the tools test).

**The transport (OT.R27).** `fetchBriefingRoomService(base)` posts `/lobby/join-channel`, `/lobby/set-filter`,
`/lobby/leave-channel` and `/lobby/game-list` as JSON at the page's own origin with `authorization: Bearer <ticket>`,
`credentials: 'omit'`, `cache: 'no-store'`; `sessionBriefingRoom` reads the ticket at each request
(`LobbyClient.ticket()`), sends nothing without one and hands a 401's ticket to `LobbyClient.sessionLost` -- state 2,
MP_MEDIUS_ERROR, `OnMultiplayerDisconnect` on either dialog (`BRIEFING_ROOM_HTTP_ADAPTATION`, as research 161 §3).
A reply is taken only for the latest game list request, under the ticket it was sent with and still held
(`GAME_LIST_LATEST_REPLY_ADAPTATION`), and a JoinChannel only after a `/lobby/leave-channel` still in flight is answered
(`ROOM_LEAVE_ADAPTATION`): the review's two findings, 2026-10-05, each held by a test (a reply across a logoff and a
re-login dropped; a quick leave and rejoin sent in order). The join reply's two guards -- the latest join, the state
still 19 -- are each held by a test too (a success after the session is lost; one from before a logoff and a fresh
login).

## 3. The room's screen and the way out (R162.9)

ONSTART: `net_monitor`, `CallMusic`, `autorefresh`, `OnBriefingRoomstart` (the strip reset, eight valves to 0,
`bar_title` #522, PLAYERLIST and GameInfoWindow hidden, JOIN GAME activated with #411, GAMELIST and CHATLIST
disabled), `ClearPlayerList`, `ActivateMedalOfMerit`. The title band's `roomname` shows MEDIUS_LOBBY_NAME; the list's
headers are #401 IN/MAX, #402 SPEC/MAX, #403 GAME, #520 PING, #404 PASS, #521 CLAN. JOIN GAME's and WATCH GAME's CROSS
(`OnJoinBtnPress`) hand GAMELIST the focus when it has rows (#418 and `.NEG` when not); GAMELIST's focus runs
`UpdateGameListInfo` (`GetGameInfo`; parked here, built 2026-11-01: research 154 §7.1). TRIANGLE runs `exit_triage` (`.DINK`, then with
NoExitState 0 `exit_lobby`): CRgame and `join_game` disabled, `JoinMPRoom(NONE)`, StartMusic 1, `ReturnToWorldOfSOCOM`
(`SWITCHMENU(dlgWorldOfSOCOM.rdr)`), whose ONSTART asks the rooms again.

Gated (`BRIEFING_ROOM_GATED`, one gate on the dialog): CREATE GAME's `OnCreateGamePress` (ONL-13), GAMELIST's
`join_game` (ONL-16a: `aux_join_game` queues the lobby's game join and connects the game server -- not one request),
`do_chat` and `playerinfo_send_message` (ONL-23). PLAYER LIST's rows are the room's players, which SVC-06 does not
serve (`ROOM_PLAYER_LIST_PARKED_READING`).

## 4. ONL-23a: the chat panel drawn (R162.10)

The panel is the layout's: `ChatWindowTxt` at (155, 127), #519, and `CHATLIST` at (170, 160), a 384 x 80 WRAPPEDTEXT,
SPACING 20, AUTOSCROLL, on MEDIUS_CHAT_RECV_VAR, with its arrows; the help bar's `InfoTextC` "½ TEXT CHAT" at
(360, 428). The variable is the lobby session's empty array (`lobbySessionStart`, `FUN_002df6a0` D:L182204-182208), so
the panel draws no line, as a room with no chat yet. L1 and L2 (`scroll_chat_down` / `scroll_chat_up`,
`CHATLIST.op5` / `op4`) run on the empty panel. R1 and USBKBD_ENTER (`do_chat`: `GetTextInput(CHATMESSAGE)`) open
nothing (`TEXT_CHAT_GATE_READING`); live chat -- the keyboard, `SendMediusChat`, the lines (SVC-18), the ignore filter
(SVC-17) -- is the parked ONL-23 (OT.R8). The acceptance's comparison with `A_48` is not run (§7).

*2026-10-09 (SVC-18, web sprint 10):* the lines this panel would draw are served -- the room's line and the whisper over
the lobby's HTTP seam (`/lobby/chat`, `/lobby/chat-lines`), the game lobby's line on the game socket -- research
[263](263-chat-the-ignore-list-and-moderation.md) §1-§3, which also reads the panel's per-room list of 11 lines
(`FUN_001f5020`); the panel and `TEXT_CHAT_GATE_READING` stay as above (W10.R4).

*2026-10-10 (ONL-23, web sprint 22):* text chat runs -- R1 and a USB keyboard's ENTER open the chat keyboard, the line
goes out and is drawn, the lines received are polled and drawn, L1 / L2 scroll them; `TEXT_CHAT_GATE_READING` retired
(§6). Research [266](266-the-chat-panels.md) §1.

## 5. The walk the rig holds

`briefingRoomScreen.test.ts`, on the disc's own records (or the fixtures): the menu past SERVER NEWS; BRIEFING ROOMS;
CROSS on Alpha -- `SuspendMenuInput(5.0)`, `CanJoinRoom(INPUT_STRING)`, `.DINK`, `JoinMPRoom(INPUT_STRING)`,
JoinChannel `{ mediusWorldId: 1, lobbyChannelPassword: '' }` then the filter `{ 10, 0, 0 }`, MP_JOIN_ROOM,
`SWITCHMENU(dlgMPBriefingRoom.rdr)`, no #804; the room's ONSTART with "Alpha", #522, JOIN GAME and #411, the game list
asked (page 1 of 256) and B_43's row drawn; the refresh every 30 s and on REFRESH LIST; the chat panel empty and R1
inert; CREATE GAME and a listed game's CROSS inert; TRIANGLE back to the menu with `/lobby/leave-channel`. A refused
JoinChannel (-948) runs `OnJoinRoomFailure` with the client's text and asks the rooms again; a JoinChannel answered 401
drops the ticket, queues state 2 and runs `OnMultiplayerDisconnect` to `SWITCHMENU(REBOOT)`.

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `CREATE_CHANNEL_STATE_READING` (`packages/ui/src/screens/briefingRoomCommands.ts`) | state 20 sends nothing | reached only for a room with no world id, which no kept record lacks (D:L184914), and `CanJoinRoom` refuses a name no record holds; the CreateChannel1 chain is not wired | a room set where a record can lack an id (none on our server), or ONL-32's transcript |
| `ROOM_JOIN_UNANSWERED_READING` (`briefingRoomCommands.ts`) | a JoinChannel never answered leaves state 19 standing | the console's `FUN_002f4080(request, 0x2d)` (D:L190692) is not read: a timeout and what follows it are not known | a read of `FUN_002f4080`; ONL-32's transcript against a silent server |
| `GAME_TYPE_FILTER_READING` (`briefingRoomCommands.ts`) | GameTypeFilter 0 passes all; a non-zero filter passes all | `FUN_002e31e0`'s body for a non-zero filter is not transcribed; the filter is set on AUTOPLAY's page (ONL-15, parked) | **retired 2026-10-10** by ONL-15: `FUN_002e31e0` transcribed (`gameTypePasses`, research 265 §2.2) |
| `GAME_NAME_DRAWN_CUT_READING` (`briefingRoomCommands.ts`) | the name cut at "$~" in the row | the original's text setter cuts at the draw (`FUN_00363830`, research 154 §7); the port's LISTBOX draws a cell as given | the path from the list widget to the setter traced (research 154 §8) |
| `ROOM_PLAYER_LIST_PARKED_READING` (was `briefingRoomCommands.ts`) | PLAYER LIST shows no row | `RefreshRoomPlayerList` (`FUN_0027d900` -> `FUN_002f11f0`) asks for the room's players, which SVC-06 does not serve | **retired 2026-10-12** by SVC-15 (research 268 §3.1): the row's body over `/lobby/room-player-list` |
| `CREATE_GAME_GATE_READING` | -- | CRgame's CROSS not started while CREATE GAME was unbuilt | **retired 2026-10-05** by ONL-16a's merge of ONL-13 (research 165 §5): `OnCreateGamePress` runs |
| `GAME_JOIN_GATE_READING` | -- | GAMELIST's CROSS not started while the game join was unbuilt | **retired 2026-10-05** by ONL-16a (research 165 §1): `join_game` runs |
| `TEXT_CHAT_GATE_READING` (`briefingRoomCommands.ts`) | R1 / ENTER `do_chat` and `playerinfo_send_message` not started | text chat is the parked ONL-23 (OT.R8); the panel is drawn empty (ONL-23a) | **retired 2026-10-10** by ONL-23 (research 266 §1): the gate is gone; R1 and ENTER run `do_chat`, the panel draws the room's lines |
| `ROOM_JOIN_GATE_READING` | -- | research 161 §5's gate on ROOMLIST's CROSS | **retired 2026-10-05** by this task: `join_room` runs (§1) |

Adaptations, named and not ledger suffixes: `ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION`, `ROOM_LEAVE_ADAPTATION`,
`GAME_LIST_LATEST_REPLY_ADAPTATION` (`briefingRoomCommands.ts`), `BRIEFING_ROOM_HTTP_ADAPTATION`
(`packages/viewer/src/briefingRoomHost.ts`). Reused, not added: research 161's `ROOM_RANK_NOT_ENFORCED_READING` (retired 2026-10-09, SVC-14;
the `CanJoinRoom` answer, now `PLAYER_TIER_PARKED_READING`'s: research 261 §10), research 158's `PARKED_ROW_GATE_READING` (the menu's parked rows, unchanged), research 157's
`SESSION_LOST_READING` (the 401) and `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION` (the base).

## 7. Unknowns, what is not done

- **No capture compared.** The acceptance's `briefing_room.png`, `A_48`, `B_43` and the forced errors against a recomp
  capture (ONL-32) are not run: no browser on this host today. B_43's row is matched cell for cell by the unit test,
  not by a frame.
- **State 16 on the console** (§1's contradiction): not read; the port skips it.
- **Every join error of ONL-12's goal** -- the password prompt (#423), "Game already started" (#352/#353), JOINING
  GAME's dots, MP_INVALID_PASSWORD, MP_BANNED_FROM_GAME, MP_EJECT_SPECTATOR -- are the game join's, gated with it
  (ONL-16a); the room join's two (MP_MEDIUS_JOIN_ROOM_FAILURE, and `OnBadJoinState` for a state that is not 19 or 20)
  are built.
- **GAME DETAILS** (`GetGameInfo`, `FUN_002e1f20` D:L183973-184130) and **PLAYER LIST** are parked rows (the entry
  list says why; both built since: PLAYER LIST by SVC-15, research 268 §3, GAME DETAILS on 2026-11-01, research 154 §7.1); the ping thresholds' unknown (ONL-12's) is the row's 300 / 600 of research 154 R154.8.
- **The session's UpdateUserState and VersionServer** that `FUN_002efc80` sends on entering a room are not sent
  (research 154 §10, the session's).
- **Not done here**: `PROCESS.md`'s range (it already ends past 162).
