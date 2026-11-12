# 165 -- GAME LOBBY to the launch: a listed game's join, the lobby over the bridge, its closes, the hand-off (ONL-16a)

Written 2026-10-05 for ONL-16a (`../roadmap/05-online-front-end.md` "ONL-16a"), wave 4 of sprints 16 and 17 on the online
path's plan (`../plans/2026-10-02-online-path-target.md`, OT.R6, OT.R8, OT.R25, OT.R27, OT.R32 H90; the waves table's
`lobby` row). Sources: the retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line,
`FUN_<addr>` its functions; cited, never pasted); the retail ELF's strings read by address through `tools/elfImage.ts`
(`S:0x...`); the disc's `dlgGameLobby.rdr`, `dlgMPBriefingRoom.rdr`, `dlgCreateGame.rdr` and `dlgNetAbandoned.rdr`
layouts and sets (`tools/dump-dialogs.ts --dialog ... --tree`, and the sets' programs through `@s2u/scene`'s
`decodeUiProgram`); SVC-07a's bridge as built (`packages/match/src/gameLobby.ts`, `bridge.ts`, research 159).
**No server was contacted** (R293); no game was run; no browser was run (the host was another session's). It stands on
research 159 (the bridge, its rules and closes), 162 (the briefing room), 163 (CREATE GAME), 157 §6 (`socketHolds`),
169 (HARD-SEAT: the pinned socket) and 128 §4.11 (the dialog), and does not restate them.

The code: `packages/ui/src/screens/gameLobbyCommands.ts` (`GameLobbyCommands`: the join's rows, the lobby's rows, the
lobby's states 15 and 17, the valves from `gameLobby`, the closes, the gates; the entry `enterGameLobby` and CREATE
GAME's `created`), `briefingRoomCommands.ts` (the join's and CREATE GAME's gates removed; `roomWorldId()`),
`createGameCommands.ts` (`created` answering true keeps the screen going to the lobby), `screenScripts.ts`
([research 363](363-native-ui-call-inputs.md)'s per-instance CALL inputs), `packages/viewer/src/gameLobbyHost.ts` (the three requests with the bearer, the game
socket, the hand-off, the mount), `frontEnd.ts` (the mounts of ONL-16a and ONL-13, the page's services). The tests:
`packages/ui/test/screens/gameLobbyScreen.test.ts` over `gameLobbyRig.ts` (the walk on the disc's own records, CI on
the fixtures), `briefingRoomScreen.test.ts` and `briefingRoomCommands.test.ts` (the gates), `packages/viewer/test/
gameLobbyHost.test.ts` (the socket, its holds, its closes, the pinned refusal, the hand-off, the requests).
Confidence: **reading, pending review** for every transcription; nothing is measured against the original running (§7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R165.1 | **A listed game's join is `aux_join_game`**: the clan, rank and password checks, the keyboard for a private game (`KeyboardCameBack` set by `send_chat` / `keyboard_closed`), `JoinMPGame(INPUT_STRING)` -> state 15, a wait for state 17, `mp_join_game` 9, `ConnectToGameServer`, `CheckJoinMP` until it leaves 9, `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`; a 30 s `monitor_timeout` (#440) and `join_after_a_while` (33.3 s) bound the waits | the set; `FUN_002f83b0` D:L197114-197390 | §1 |
| R165.2 | **`JoinMPGame` keeps the game's settings in valves** -- mp_game_sort_order 'D'[6], MaxPlayersValve, MaxSpectatorsValve 'D'[4], mp_friendly_fire / mp_allow_respawn (RulesSet bits 0 / 1), EQlimit 'D'[5], mp_max_rounds 'D'[1], mp_max_round_time 'D'[2] x 60, mp_rank_restrictions 'D'[7] -- the first mission "mp<'D'[8]>", GAMENAMEVAR, the three side lists emptied; a name no record holds is CREATE GAME's (state 13) | D:L197176-197390; S:0x3f58f0, 0x3f5930, 0x3f58d0, 0x3f5940, 0x3f5960, 0x3f58e8, 0x3f5898, 0x3f58b0, 0x3f5910 | §1 |
| R165.3 | **JoinGame's refusals are three events**: -978 MP_INVALID_PASSWORD (`join_game_failure_password`: "Password incorrect. "), -972 MP_BANNED_FROM_GAME (`banned_from_game`: #443, #444), any other MP_MEDIUS_JOIN_GAME_FAILURE (`join_game_failure`: #441) -- full and not found among them; the lobby to state 11 | `FUN_002edba0` D:L190405-190431; S:0x3f4860, 0x3f4880, 0x3f48a0 | §1 |
| R165.4 | **"Already started" is not a refusal**: the join succeeds and the lobby's `SetupLateJoiner` shows #351 and #352 / #353 (ghost or spectator) by `late_joiner` | the set; research 159 §1 | §2 |
| R165.5 | **The lobby reads valves the game object writes each frame** (`mp_major_game_state`, `mp_minor_game_state`, `mp_45_sec_clock`, `mp_x_sec_clock`, `player_team`, `mp_team_unbalance`); here they are written from the bridge's `gameLobby` (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`), each clock counted down on the page as `CheckForcedLaunch` truncates `(deadline - now) x 0.001` | `FUN_0027cbf0` D:L125642-125789 | §2 |
| R165.6 | **READY toggles the console's own record at once** (`ReadyToLoad` -> `FUN_002c3fc0`), which `CycleReadyButton` reads in the same tick; the page toggles `mp_minor_game_state`, sends `lobbyReady`, keeps `ReadyToLoad`'s 5 s, and the bridge's answer is the seat's READY | `FUN_0027caf0` D:L125593-125614 | §2 |
| R165.7 | **The host's launch has no control in the layout**: only MP_EIGHTY_READY's `launch_10sec_anim` calls `ForceMPLaunch`; the server raises the 80% countdown itself, so no page raises the event (`EIGHTY_READY_SERVER_ADAPTATION`); the binding sends `launch` when given the event (#356 with a side empty) | the set; `FUN_0027d070` D:L125792-125813 | §2 |
| R165.8 | **The bridge's closes**: 4007 switches to `dlgNetAbandoned.rdr`, whose ONSTART pops #528 and returns to SOCOM II ONLINE, as the core switches on an abandon; any other final close writes `mp_net_errno` 32 and posts MP_MEDIUS_ERROR, whose `OnNetError` pops #365 and reboots | `FUN_002bc530` D:L161109-161146 -> `FUN_002a47b0`, S:0x3f2780; `OnNetError` | §3 |
| R165.9 | **The launch's hand-off**: `check_loop` waits for the major state 2, then `SWITCHMENU(LOAD_SCREEN)`; the page sets it when the bridge's `gameLobby` says `launched` (the room started round 1) and hands the open socket to ONL-18 (`GAME_LOBBY_MATCH_START`) | the set; research 159 §5 | §4 |
| R165.10 | **CREATE GAME's success is the entry's second caller**: cbCreateGame queues state 15; the screen's `create_game` waits for state 17 and calls `ConnectToGameServer`, `SetMPMissionSeq`, `JoinGameServer` with no `CheckJoinMP` -- the creator hosts (`CREATOR_MASTER_READING`); its world report makes the room the socket joins | `FUN_002ee090` D:L190637-190641; `FUN_0027e380` D:L126407-126428; `FUN_002ef590` D:L191321-191411; `FUN_002f7c40` D:L196715-196755 | §5 |

## 1. The join (R165.1 - R165.3)

GAMELIST's CROSS (`join_game`, ungated now) runs `SuspendMenuInput(60)` and `aux_join_game` with JoinAsSpectator from
WatchOrJoin. Both branches CALL `aux_join_game` with flags `0x201`: flag 1 copies the caller instance's inputs and
`0x200` waits for the callee (`FUN_0025d5c0` D:L107577-107592, D:L107763-107770; `FUN_0025d550`
D:L107473-107481). `INPUT_STRING` reads the current animation instance's first type-8 input, through
`FUN_00272480` D:L119977-120010; `DAT_00414be8` is the instance saved and restored by `FUN_00270220`
D:L118623-118662 and `FUN_0026d870` D:L117109-117124. This corrects the former screen-wide/latest-binding claim:
the keyboard's independent APPLY text belongs to `send_chat` and cannot replace the waiting `aux_join_game`'s game
name. [Research 363](363-native-ui-call-inputs.md) records the source reread and archive fields, **reviewed reading**
(2026-10-23, MLS-PASS; source/code PASS at `864603c5f`). This promotion covers the revised CALL/input ownership
claims here, not this note's other transcriptions. The checks:
`ClanGameClosed` (`FUN_0027d4c0` -> `FUN_002f8c60` D:L197433-197455, `FUN_002e9940` D:L188215-188244: a clan game of
a clan not the client's clan id `DAT_0044f59c` -- GetMyClans' since ONL-27, the page's `LobbyClan.clanId` since
CLAN-ID-WIRE, 2026-10-13, research 272 §3), `GameRejectsRank` (`FUN_002f8bc0`, `PLAYER_TIER_PARKED_READING`: 0),
`GameHasPassword` (`FUN_002f8dd0` D:L197505-197527: security bit 0) or `GameHasSpectatorPassword` (`FUN_002f8d50`
D:L197479-197501: bit 2; both cites corrected 2026-10-13, CLAN-ID-WIRE -- they read D:L196998-197016 and none). A password
opens `GetTextInput(PlayerGamePassword)` and waits on `KeyboardCameBack`: the keyboard's APPLY runs `send_chat`, which
with KeyboardPurpose 2 sets 1; its cancel runs `keyboard_closed` (2), which stops `aux_join_game`.

`JoinMPGame` (0x27d730 -> `FUN_002f83b0` D:L197114-197390): 0 unless the session is up in state 11; "RANDOM" is
AUTOPLAY's (ONL-15, 0 here); the room by MEDIUS_LOBBY_NAME, the game by the caption (`GAME_JOIN_BY_DRAWN_NAME_READING`),
`MISSION_AVAILABLE_READING` for the play list (`FUN_002e33e0`); a watcher's join of a game with no slot answers 1 at
once (the script's #424 follows); else R165.2's valves and state 15. State 15 (`FUN_002eda60` D:L190353-190402) sends
JoinGame -- the world id, the join type, the password of that type -- as `/lobby/join-game` with the bearer; the reply
(`FUN_002edba0`) is R165.3 or state 17. `ConnectToGameServer` (`FUN_0027e4c0` D:L126454-126477) opens the game socket
(`GAME_JOIN_NO_DME_ADAPTATION`; 0, #425, with no socket); `CheckJoinMP` (`FUN_0027e2b0` D:L126377-126404) writes
`mp_join_game` 10 once the room's `welcome` came; `JoinGameServer` (`FUN_0027e380`) answers 1 once seated.

## 2. The lobby (R165.4 - R165.7)

ONSTART: `net_monitor`, `Session_master_migration` (a watcher: `WHILE not IsSessionMaster WAIT 1`, then the host's
buttons), `Enable_SM_Launch` (the host's #350 popup on a first entry, `SetupSessionMaster` / `SetupLateJoiner` /
`SetupNormalJoiner`, `ArmButtonClock`'s ARMORY count 10..1), `check_loop` (`AdvanceMPMission`, then `CheckForcedLaunch`
and `CountDown` until the major state is 2), `FromBriefing`, `hide_game_details`, `FadeMusic`. The rows:
`IsSessionMaster` (0x27e6e0: the network and master bytes) is the seat's star in `gameLobby`; `IsSwitchTeamsOK`
(`FUN_002f8ce0` D:L197459-197476) 1 with no clan game; `CheckTeamStatus` (0x2772c0) the seat held; `AdvanceMPMission`
(`FUN_00279490` D:L123842-123884) and `ForceMediusStatusReport` (D:L122948-122955) the server's (the deadline, the
report) -- *2026-11-06, LOBBY-MAPNAME (§9): but for `AdvanceMPMission`'s last step, the current mission's load, whose
UiVars half gives the title bar its map name*; `RefreshGamePlayerList` (`FUN_0027d820` -> `FUN_002f6ec0`) redraws the lists (`GAME_PLAYER_LIST_PUSH_ADAPTATION`):
SEALS and TERRORISTS [name, tier medal, ready dot, clan] (`FUN_002f7020` D:L196331-196496; `READY_DOT_READING`),
SPECTATORS [name]. `SwitchSides` (`FUN_0027d100` D:L125816-125831) sends `switchTeams` once per 5 s; the side comes back
in `gameLobby` (`player_team` 0 / 8 / 16). `mp_team_unbalance` is 1 with a side empty, 0 while a countdown runs
(D:L165348-165352). A countdown called off leaves `mp_x_sec_clock` where it stood (`FUN_002a6b90` with 0,
D:L149013-149016, stops its writes), so the original keeps Switch Teams, Ready and Armory locked; SOCOM Legacy departs from this by the owner's ruling LSR.R1 (2026-10-30, a playtest preference the original does not support, plan 2026-10-29-lobby-switch-recovery): the cancelled countdown re-enables them. The countdown is drawn by `CountDown`: #354 "GAME STARTS IN", the number, #355
"SECONDS", the frame up below 11, the number each second, 0 then blank; `RingForceLaunchBell` (.COUNTDOWN) for a
non-host at 10. A late joiner (`late_joiner` from a first `gameLobby` already launched) sees #351 and #352 / #353, and
goes to the match at the room's next round (`LATE_JOINER_NEXT_ROUND_READING`). *2026-10-14, LATE-WATCH (W19.R12; research
314 §4.2): YES only waits; the late seat's READY loads it into the round in progress (`ReadyToLoad`'s late branch,
`READY_LOADS_LATE_JOINER_READING`), the late player as the ghost, seated from the next round; reading, pending review.*

**A host handed on (SVC-07b)**: the bridge moves the star; `IsSessionMaster` turns true and `Session_master_migration`'s
watcher gives the seat the host's buttons (`EnableButton(Lock)` -- the layout has no `Lock` control --, `OnStartGameLock`,
`Watch45SecClock`), with no message, as research 159 §2 reads it.

## 3. The closes (R165.8)

The page's game socket (`GameSocketHost`, `gameLobbyHost.ts`) holds the session from its accepted hello and lets it go
at every close (research 157 §6). A final close (`GAME_FINAL_CLOSES`: 4006, 4007, 4008, 1011) or a refused hello ends
the seat once and is never retried; any other close -- a drop, `JOIN_FAILED_CLOSE` 4010 -- is opened again on `NetPage`'s
backoff (`retryDelayMs`), the seat not counted until the next welcome. In the lobby the end shows the research wave's
dialogs (research 159 §8, `GAME_ENDED_DIALOG_READING` 528, `GAME_SOCKET_CLOSED_DIALOG_READING` 365): 4007 the
`dlgNetAbandoned.rdr` switch (#528 "All players left the game before you were able to join. Please try again.", then
`exit_lobby` -> `ReturnToWorldOfSOCOM`); the others `mp_net_errno` 32 and MP_MEDIUS_ERROR (`NET_ERRNO_DISCONNECTED_READING`:
#365, then `SWITCHMENU(REBOOT)`). During the join an end stops `CheckJoinMP`, and the script's own waits end it (#440 or
#427). BACK (TRIANGLE, `exit_lobby`): #362, yes -> #363, `DisconnectFromGameServer` (`FUN_0027e420` D:L126431-126451:
the socket closed, `/lobby/leave-game`, state 11 -- `GAME_LEAVE_ADAPTATION`), `ReturnToBriefingRoom`.

## 4. The hand-off (R165.9)

When the bridge's `gameLobby` says `launched` (the room started round 1; SVC-07a marks it at the room's round start),
the page sets the major state 2 and calls the commands' `matchStart`; `check_loop` then asks `SWITCHMENU(LOAD_SCREEN)`
(the load state, ONL-18's). The page's host hands ONL-18 the open `NetClient` with the game, its first mission, the
ticket and pinned URL, the `welcome` and the `roundStart` if it came -- the event `GAME_LOBBY_MATCH_START`
(`GameLobbyHandOff`), the socket kept and still holding the session, the lobby no longer its listener. The client's walk
is idle until the match gives its own (`LOBBY_IDLE_WALK_ADAPTATION`).

## 5. CREATE GAME into the lobby (R165.10)

The entry both paths call is `GameLobbyCommands.enterGameLobby(game)` (R165.2's valves and variables). A listed game's
join calls it from `JoinMPGame`; CREATE GAME's success calls `GameLobbyCommands.created(game)` -- the mount's `created`
(ONL-13's `mountCreateGame`, research 163 §5) -- which builds the host's GameStats as `FUN_002f7c40` does (the screen's
valves, the play list from 'D'[8]), calls the entry -- but for MaxPlayersValve, which the create path leaves as the screen
set it (LATER 232, 2026-10-21: only a listed join copies the record's total, `FUN_002f83b0` D:L197193-197205; `cbCreateGame`
writes no valve) -- marks the page as the game's host and queues state 15; it answers
true, so CREATE GAME no longer returns to its caller (`GAME_LOBBY_GATE_READING` is now only the fallback of a mount
with no lobby). After JoinGame's success the host posts its world report (`FUN_002ef590`: MinPlayers 2, MaxPlayers the
two valves' sum, GameLevel the mission's number, RulesSet, GF1 the room -- `BriefingRoomCommands.roomWorldId()` --, GF2
65000, GF3 `FUN_002e99f0()` (D:L191396: the clan field CREATE sent, from the affiliation and clan id `FUN_002e9840`
latched at the create; it read "GF3 0" until CLAN-ID-WIRE's review, 2026-10-13), GameStats), which makes the game's match room, and state 17 is queued only once the report is settled
(`HOST_REPORT_BEFORE_JOIN_ADAPTATION`). Accepted: `ConnectToGameServer` opens the socket and `JoinGameServer` passes the
creator at once (`CREATOR_MASTER_READING`). Refused (-966: a map not offered, respawn), rejected, or unanswered past
`HOST_REPORT_WAIT_READING`: no socket is opened, `JoinGameServer` answers 0, and `create_game`'s own tail runs --
`DisconnectFromGameServer` (`/lobby/leave-game`) and `create_game_failure` (#295) -- as the disc has it (the review's
follow-up, 2026-10-05). CRgame's CROSS is ungated
(`CREATE_GAME_GATE_READING` retired, research 162 §6).

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `GAME_JOIN_BY_DRAWN_NAME_READING` (`packages/ui/src/screens/gameLobbyCommands.ts`) | the game found by its drawn name | the port's row carries the name cut at "$~" (`GAME_NAME_DRAWN_CUT_READING`), the original's the whole name | the list widget's cut traced (research 154 §8) |
| `MISSION_AVAILABLE_READING` (`gameLobbyCommands.ts`) | every listed game passes | `FUN_002e33e0` over `FUN_002c9040` refuses a play list naming a mission not held; the server lists only offered maps (OT.R16) | a map outside the first release offered |
| `OWN_CLAN_NONE_READING` (`gameLobbyCommands.ts`) | the player holds no clan | `ClanGameClosed` compares GF3's clan with `DAT_0044f59c`; clans are SVC-11's, parked | *retired 2026-10-13 (CLAN-ID-WIRE): GetMyClans keeps the clan id (`FUN_002e8bd0` D:L187810-187812, research 272 §3) and `ClanGameClosed` compares the client's (`LobbyClan.clanId`) -- the member's own clan game open, another clan's closed; a reading, reviewed (CLAN-ID-WIRE, three fresh passes, the last PASS, high; merged at 32a8b70be, the clans' plan's Log)* |
| `PLAYER_TIER_PARKED_READING` (`gameLobbyCommands.ts`) | no rank refusal | the tier is the ladder's (SVC-13, parked): `FUN_002eae20`, `FUN_002eaee0`; *2026-10-09: also the room's `CanJoinRoom` (`briefingRoomCommands.ts`), named by research 161's retired `ROOM_RANK_NOT_ENFORCED_READING` until SVC-14; the services judge both joins (research 261 §10)*; *2026-10-12, ONL-34 (research 269 §4.4): narrowed to the rank refusal -- it read "no rank refusal; no medal drawn"; the lists' medal column is drawn from SEAT-TOLD now (`LOBBY_MEDAL_TOLD_READING`, research 269 §4.7)* | SVC-13; the rows reading the tier (the position is asked only on SOCOM II ONLINE and PLAYER RANKING, research 269 §4.3) |
| `READY_DOT_READING` (`gameLobbyCommands.ts`) | green ready, red not | the list reply writes 0 (D:L196438-196441); the writer that changes the dot is not read; A_ready006 agrees | the writer read, or ONL-32's two-instance capture |
| `NET_ERRNO_DISCONNECTED_READING` (`gameLobbyCommands.ts`) | 32 | `OnNetError` shows #365 only at errno 32; its one writer `FUN_002f4090` (D:L194249-194306) is read, which library code is 32 is not (research 315 §3.5; *was, until 2026-10-14: "the network library's writer is not read"*) | which library code is 32 (the writer `FUN_002f4090` is read; *was: "the writer read"*); a capture of a disconnect in a lobby |
| `LATE_JOINER_NEXT_ROUND_READING` (`gameLobbyCommands.ts`) | a late player loads on its READY as the ghost of the round in play and plays from the next round (*was, until 2026-10-14: the match at the room's next round start*) | the console's writer that ends `late_joiner` is not read; *2026-10-14, LATE-WATCH (W19.R12; research 314 §4.2, reading pending review): read -- the late seat's READY loads it (`READY_LOADS_LATE_JOINER_READING`, `FUN_0027caf0` D:L125606-125608), the level clears the flag once loaded (`FUN_001f5e70` D:L55715-55716) and sets the ghost flag for a non-spectator (D:L55725-55727); the room seats the ghost until the next round (`welcome.ghost`)* | a late join captured (ONL-32) |
| `CREATE_BY_JOIN_GATE_READING` (`gameLobbyCommands.ts`) | ONL-13's hook, else 0 | `JoinMPGame` with an unknown name starts a create (state 13), CREATE GAME's path | ONL-13 wiring `createGame` if a path needs it |
| `CREATOR_MASTER_READING` (`gameLobbyCommands.ts`) | the creator is the master until the first `gameLobby` | `create_game` calls `JoinGameServer` with no `CheckJoinMP`; the host passes `FUN_0027e380` | a capture of a create's lobby entry |
| `HOST_REPORT_WAIT_READING` (`gameLobbyCommands.ts`) | 30 000 ms | the host's report unanswered is taken as not accepted; WorldReport0 has no reply and `create_game` waits on state 17 unbounded, so `aux_join_game`'s `monitor_timeout` (`WAIT 30`, #440) is the bound taken | a server that never answers a report (none of ours); ONL-32's create transcript |
| `ARMORY_FROM_LOBBY_GATE_READING` (`gameLobbyCommands.ts`) | weaponselect's CROSS not started | the ARMORY from the lobby is ONL-17's | retired 2026-10-05 by ONL-17 (research 167 §1) |
| `LOBBY_TEXT_CHAT_GATE_READING` (`gameLobbyCommands.ts`) | R1 / ENTER `do_chat` and `send_chat` not started; the panels drawn | text chat is ONL-23's, voice SVC-22's (OT.R8) | **retired 2026-10-10** by ONL-23 (research 266 §1): `do_chat` and `send_chat` run, `SendChatText` on the game socket |
| `SWITCH_CLOSED_AT_COUNTDOWN_READING` (`packages/match/src/gameLobby.ts`) | SWITCH TEAMS and READY refused from the countdown's start to the launch, for every seat | `launch_10sec_anim` (the countdown's start) runs `ForceMPLaunch` then `DisableButton(Glswitchteams)`, `(weaponselect)`, `(PlayerReady)`, and `CountDown` disables the same three on every console once `mp_x_sec_clock` is under 11; neither `SwitchSides` (`FUN_0027d100` D:L125818-125831), the host's move (`FUN_002c4290` D:L165518-165569) nor `IsSwitchTeamsOK` (`FUN_002f8ce0` D:L197461-197476) tests the countdown (§8) | a capture of a lobby's countdown with a switch pressed |
| `READY_GATE_SEATS_READING` (`packages/match/src/gameLobby.ts`) | the session master's READY alone waits 30 s; a joiner's only its 5 s repeat | `SetupSessionMaster` holds PlayerReady `WHILE mp_45_sec_clock != 0`, `SetupNormalJoiner` holds nothing from the briefing room; `ReadyToLoad` (`FUN_0027caf0` D:L125595-125611) tests only its repeat (§8) | a capture of a joiner's READY taken at once (ONL-32's two-instance lobby) |
| `MISSION_VARS_ASYNC_ADAPTATION` (`gameLobbyCommands.ts`) | the mission's `UiVars` added when the page's read of the map's `READERM.ZAR` resolves, and only while the lobby still stands on that mission in the same game (the world id the read started in); D:L123856's test (the seat held, or the creator the master) is the call's, not the resolution's -- *corrected 2026-11-11, LOBBY-MAP-STALE (§9): the resolution tested the seat too, and dropped the next map's entries when they landed in the rotation's 4021 gap* | an adaptation (2026-11-06, LOBBY-MAPNAME, §9): `FUN_002acc10` reads `mission.rdr` synchronously inside `AdvanceMPMission` (D:L123881); the page reads the archive asynchronously (the shared ARMORY's kept read, `frontEnd.ts`' `armoryRead`), so `MPgamename` is empty for the frames the read takes | not a stand-in: the same entries and the same Add; a capture of the lobby's first frames (ONL-32) would show how long the original's title takes, if anyone asks |
| `INPUT_STRING_CALLED_READING` (`packages/ui/src/screens/screenScripts.ts`) | an animation with none of its own read the latest binding's argument | the former reading mistook `DAT_00414be8` for the screen; it is the current animation instance | **retired 2026-10-23 (MLS-PASS)**: CALL flag 1 copies the caller's inputs; per-instance lookup replaces the fallback, reviewed reading at `864603c5f` ([research 363](363-native-ui-call-inputs.md) §§1-3) |

Adaptations, named and not ledger suffixes: `GAME_LOBBY_SERVER_MASTER_ADAPTATION`, `GAME_JOIN_NO_DME_ADAPTATION`,
`GAME_LEAVE_ADAPTATION`, `GAME_PLAYER_LIST_PUSH_ADAPTATION`, `EIGHTY_READY_SERVER_ADAPTATION`,
`HOST_REPORT_BEFORE_JOIN_ADAPTATION` (`gameLobbyCommands.ts`),
`GAME_LOBBY_HTTP_ADAPTATION`, `LOBBY_IDLE_WALK_ADAPTATION` (`packages/viewer/src/gameLobbyHost.ts`). Reused: research
159's `READY_GATE_MS_READING`, `HOST_LAUNCH_READING`, `GAME_ENDED_DIALOG_READING`, `GAME_SOCKET_CLOSED_DIALOG_READING`;
research 162's `GAME_NAME_DRAWN_CUT_READING`; research 163's `GAME_LOBBY_GATE_READING` (now the fallback).

## 7. Unknowns, what is not done

- **No capture compared**: `game_lobby.png`, `title_game_lobby.png`, `A_53`, `A_55`, `A_ready000..008` and the
  "NOT READY 5, 4..." sequence (ONL-32) are not run; no browser on this host today.
- **No new protocol field**: the existing `hello.game`, `hello.ticket`, `lobbyReady`, `switchTeams`, `launch` and
  `gameLobby` serve. A refusal's `refused` reason is not shown: the original's client has no such dialog.
- **The host's star**: the layout's lists have no star column; the host shows only by the buttons
  (`IsSessionMaster`), so nothing marks the host in the lists.
- **The ARMORY** from the lobby (ONL-17), **GAME DETAILS** (`GetGameInfo`, SELECT; built 2026-11-01, research 154
  §7.1), **text chat** and **voice** are gated or parked; `CharacterProfile` / `ChangeCharacterType` (PLAT-34) answer the table's stand-ins.
- **The world report** is sent once, between JoinGame and state 17; the console repeats it every 25 s (the server reports
  the room's status itself from then, research 159 §2).

## 8. The joiner's READY and the room's gate (2026-10-05)

ONL-18c's two-page walk (research 166 §8) found the joiner's READY and SWITCH TEAMS usable at once on the page while
the room refused READY as `gate` for 30 s after the seat's entry. Which side is the original's, read again:

- **The clock.** `AdvanceMPMission` (`FUN_00279490`, the lobby's `check_loop` on its entry) sets game +200
  (`mp_45_sec_clock`) to now + 30 s (45 s after a match) on every online console -- its test is `DAT_0045a0c1`,
  `IsNetwork` (research 107), not the host's byte (D:L123855-123862).
- **Who waits on it.** `dlgGameLobby`'s `Enable_SM_Launch` shows #350 ("The READY button will be available in 30
  seconds") only under `IsSessionMaster`, and calls `SetupSessionMaster`, which keeps `PlayerReady` disabled
  `WHILE mp_45_sec_clock != 0` and enables it after; a normal joiner takes `SetupNormalJoiner`, which waits on no
  clock (its READY held only for its own 10 s `ClientDAReadyButton` when `ComeFromBriefing == 0` -- the first entry from
  the BRIEFING ROOM, whose `OnBriefingRoomstart` sets it 0, and the lobby a match returned to alike; corrected
  2026-10-14, research 309 R309.2: this had read "disables nothing when it came from the briefing room ... only ... a
  lobby a match returned to"). SWITCH TEAMS is enabled by `IsSwitchTeamsOK` alone, for host and joiner.
- **The command.** `ReadyToLoad` (`FUN_0027caf0` D:L125595-125611) tests no deadline: only its own 5 s repeat
  (`DAT_00414e98`), then the minor state 2 (`FUN_002c3fc0`) or, in a launched game, the late load. `SwitchSides`
  (`FUN_0027d100` D:L125824-125828) likewise only its 5 s repeat.

So the page was right and the room's every-seat gate was ours. The room now holds the 30 s gate on the session
master's READY and forced launch alone (`READY_GATE_SEATS_READING`, a reading; the host's gate kept where the host's
screen keeps it -- the room is the host here, so the rule is held there, an adaptation of where, not of what), and a
joiner's READY only to its 5 s repeat (`READY_REPEAT_MS_READING`): a modified page still cannot spam it. The view's
`readyIn` is 0 for a joiner. SVC-07b's handed-on host is gated from its own entry, as before. Tests:
`packages/match/test/gameLobby.test.ts` (the host gated, a joiner at once and its repeat, a new host's own gate),
`bridge.test.ts` (the joiner READY at once over real sockets, the host's refused before its gate); the two-page walk
(`e2e/twoPagesMatch.spec.ts`) no longer waits the gate out and ran green in a browser again (2.4 min).

**SWITCH TEAMS during the countdown (2026-10-05, the close review's pass 3).** The room refused a switch only once
launched, while `bridge.ts` (`STORED_LOADOUT_AT_LAUNCH_ADAPTATION`) reads the stored kits at the countdown's start as the
moment SWITCH TEAMS closes: a modified page could switch during the countdown, be re-seated with a fresh kit after the
stored one was applied, and -- emptying a side -- call off the host's countdown every 5 s. The original's rule:
`launch_10sec_anim`, the countdown's start (MP_EIGHTY_READY's answer, or the host's `ForceMPLaunch`), disables
`Glswitchteams` and nothing enables it before the launch; `SwitchSides`, the host's move and `IsSwitchTeamsOK` test no
countdown (the citations in §6). The room now refuses a switch from the countdown's start (`countdown`;
`SWITCH_CLOSED_AT_COUNTDOWN_READING`, a reading -- the screen's rule kept by the room, as the host's READY gate is).
A READY seat's button is disabled too (`CycleReadyButton`), the page's script; the room does not refuse that one.
Tests: `packages/match/test/gameLobby.test.ts` (refused during the countdown, the countdown kept) and `bridge.test.ts`
(over real sockets: the host's countdown, a Terrorist's switch refused, the sides and the countdown unchanged).

**READY during the countdown (2026-10-05, the close review's pass 4).** The same scripts close READY: `launch_10sec_anim`
disables `PlayerReady` with SWITCH TEAMS and the ARMORY (research 179 §6.9), and `CountDown` -- run on every console as
`mp_x_sec_clock` counts down -- disables all three once the clock is under 11, stopping `CycleReadyButton` and
`ClientDAReadyButton` that would enable READY again. So under the countdown no seat readies or takes its READY back;
the host's "all ready launches at once" (D:L165379-165384) is reached only by seats ready before it. No page raises
MP_EIGHTY_READY here (`EIGHTY_READY_SERVER_ADAPTATION`), but our pages run `CountDown` from the room's `gameLobby` view
(the view's countdown sets `mp_x_sec_clock`), so an unmodified page's READY and SWITCH TEAMS close at the room's
countdown (`packages/ui/test/screens/gameLobbyScreen.test.ts`: both enabled before, both disabled under it -- passing on
the code as it stood; no page change was needed). The room now refuses READY under the countdown too (`countdown`, the
same reading); the SVC-07a fix round's B1 tests that readied under the countdown ready before it now, and the unit test
of a last READY cutting the countdown short became its refusal.

## 9. The map's name in the title bar (LOBBY-MAPNAME, 2026-11-06)

A player's report: the GAME LOBBY does not show the current map's name, though the ARMORY does. The lobby's title-bar
text `MPgamename` (`dlgGameLobby.rdr`, the same control and `UIVAR mission_title` as the ARMORY's, research 95 §2.2) draws
the UI variable `mission_title`, and nothing in the port wrote it: the shared ARMORY answers it from its own roster
(`packages/viewer/src/armory.ts`' `uivar`), the lobby has no such path.

**The original.** `check_loop`'s `AdvanceMPMission` (`FUN_00279490`) ends, with the game object and the network up
(D:L123856), on the current mission's load `FUN_002acc10(0x4364e0, 0x414e00)` (D:L123881; 0x414e00 the mission name the
join set, "mp<n>"). Its UiVars half (D:L152356-152381) walks the `mission.rdr` key at 0x3f19f8 (`UiVars`) entry by entry:
each through `CUIVariableSpec` (`FUN_00386ff0`, D:L280284-280350) -- its NAME, its VALUE node copied (a one-element list
taken as its element, D:L280305-280312), its longevity TEMPORARY unless a LONGEVITY word names another (D:L280328-280346)
-- and `CUIVarManager_Add` (`FUN_003857c0(0x437e80, name, value, longevity)`, D:L152380; research 104 §4, "Mission
vars"). `mission_title` is one of those entries, so the lobby's title bar draws the map's title from the first
`check_loop`.

**The disc.** Every MP map's `mission.rdr` `UiVars` entry is a NAME and a one-node VALUE, none naming a LONGEVITY
(checked over the 22 maps of the dev disc on the raw node types, `packages/ui/test/loading.test.ts`): each is added
TEMPORARY, the spec's default. The VALUE node is a string on every entry but `LOAD_PROGRESS`, a FLOAT node (type 2) on
the 12 maps that carry it (MP51-53, MP61, MP62, MP64, MP71-73, MP81-83), which `CUIVariableSpec` copies with its type
(`FUN_0032f390`, D:L280324): a real. MP2's `mission_title` is FROSTFIRE. *Corrected 2026-11-06 (the review's F2): this
paragraph first read every VALUE as one string and the port added each as a string -- `parseRdr` flattens ints and
floats to text, so `LOAD_PROGRESS` went in as text; the port now reads the nodes typed (`parseRdrTyped`).*

**The port.** `AdvanceMPMission` (`packages/ui/src/screens/gameLobbyCommands.ts`) now does that UiVars half for the
lobby's mission through the option `missionVars`, with the entries as `CUIVariableSpec` reads them -- NAME, the VALUE
node with its type, the LONGEVITY word (`missionUiVarEntries` over `parseRdrTyped`, `packages/scene/src/armoryCharacters.ts`
and `packages/archive/src/rdr.ts`) -- added through `UiVarManager.loadUiVars` (each at its word's longevity); it still
answers 1. D:L123856's test (the game object and the network byte) is held as `inSession`: the seat held (`connected`,
the welcome) or the creator let in as the session master before any welcome (`creatorMaster`, `CREATOR_MASTER_READING`,
the test `JoinGameServer` lets it in by) -- *corrected 2026-11-06 (the review's F1): the first version tested `connected`
alone, so the creator, whose `check_loop` runs before its welcome, never drew the map's name*. The page
(`packages/viewer/src/frontEnd.ts` through `gameLobbyHost.ts`' mount) hands it the entries from the shared ARMORY's kept
read of the same mission (`armoryRead`; `ArmoryData.missionUiVars`, `packages/viewer/src/armoryData.ts`) -- the read the
lobby's ARMORY already makes on the lobby's entry, so no second decode. The read is asynchronous
(`MISSION_VARS_ASYNC_ADAPTATION`, §6). **Not done**: the load's Valves half (D:L152384-152420) and the rest of
`FUN_002acc10` -- the lobby draws nothing else from them that the port lacks today.

Tests: `packages/ui/test/screens/gameLobbyScreen.test.ts` (LOBBY-MAPNAME: `MPgamename` draws FROSTFIRE on MP2 at
TEMPORARY; the creator's lobby, its welcome after `check_loop`; MP72's `LOAD_PROGRESS` a real; the asynchronous read
resolving later, and a read for a mission the lobby has left adding nothing),
`packages/ui/test/screens/gameLobbyMapTitle.test.ts` (LOBBY-ONE-BEHIND and LOBBY-MAP-STALE, below),
`packages/viewer/test/gameLobbyHost.test.ts` (the mount hands `missionVars` to the row), `packages/ui/test/loading.test.ts`
(the disc's entries and their node types, every map). Confidence: **reading, pending review**; no capture of the lobby compared.

**LOBBY-MAP-STALE (2026-11-11).** A player's report (Cobra89, relayed by the owner): after a match the returned lobby
still shows the last map's name, while the ARMORY shows the right one. The cause was the port's: at the end of a match
the room sends the returned view with the next map, then rotates and closes every seat with 4021. The view's `nextMap`
moved the lobby's mission and started the next map's asynchronous read (LOBBY-ONE-BEHIND, research 309 §2.2); when
4021 dropped the seat before the read landed, the resolution's guard, which also tested the seat (`inSession`), threw
the entries away, and the new room's welcome on that same map loaded nothing again (`moveMission` returned on the same
name). `mission_title`, TEMPORARY and never cleared, kept the last map's title; the ARMORY keys on the moved mission and
draws its own title, so it was right. A joined seat met it; the creator mostly did not (its `creatorMaster` survives a
4021). The original never holds a mission apart from its load: `FUN_00279490` writes the next map into 0x414e00 and
loads it at once (D:L123864-123881), as does the lobby's other map writer, `FUN_0027eb50` (D:L126673-126674), so no
socket state stands between the call's network test (D:L123856) and the Add. The port now (a) tests D:L123856 at the
call only, and at the resolution only that the lobby still stands on that mission in the same game (the world id the
read started in), and (b) records which mission's entries landed (`varsLoaded`, cleared when a game is held) and lets a
move onto the mission already held load it again when they have not -- the entries of a read dropped by a move, or of a
failed one, are asked for again at the same map's welcome. Asked for, not read again: the page's read is the kept one
(`keepMissionRead`, `viewer/src/roundScreens.ts`), which hands back the same promise for the mission it holds, so a read
that landed in the 4021 gap is added at the welcome, while a read that failed (null, no world for the map, or rejected)
stays failed until the lobby moves to another mission -- open: the kept read forgetting a failure is a separate task.
The owner's note that a trip to the ARMORY and back puts the title right is not
borne out by the code: the ARMORY's way back skips `AdvanceMPMission` (`check_loop`'s `GoneToArmory`, P:L7109-7113) and
no ARMORY path writes `mission_title`; a later return whose read beat the 4021 looks the same. Tests:
`packages/ui/test/screens/gameLobbyMapTitle.test.ts` (the read landing in the 4021 gap kept, the welcome on that map
drawing it; a failed read asked for again at the same map's welcome -- the stub makes a fresh promise at each call, so
the test holds the lobby's ask, not the page's kept read; a left game's read adding nothing to the next game on the same
mission), unit tests with a stub read -- no socket, no page, no browser. A live playtest of a joined seat across a
rotation, not run, would confirm the fix end to end (open). Confidence: **reading, pending review**.
