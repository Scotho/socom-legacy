# 315 -- Leaving a game and the network errors (ONL-22)

- Date: 2026-10-13 (web sprint 19's online seat; roadmap 05 "ONL-22 -- Leaving and network errors" and its slice
  "ONL-22a -- Leaving a game and coming back"; written before its build, no code changed with it).
- Status: **reading** (reviewed twice 2026-10-14: the first review FAILED on one misread caption, the second on its leftover -- both folded with their lows; a fresh reviewer re-reads it at the source before it counts as a reading). Every
  value of the original below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`,
  `FUN_<addr>`; cited, never pasted), the ELF's strings (`socom2_game.elf.strings.txt`, `S:0x<addr>`), the disc's
  scripts as the repository's pinned dump holds them (`tools/test/onlineDialogs.pinned.json`, cited `P:L<n>`:
  `dlgNetError.rdr`, `dlgNetAbort.rdr`, `dlgNetAbandoned.rdr`, `dlgNetBanned.rdr`, `dlgGameLobby.rdr`,
  `dlgMPBriefingRoom.rdr`, the three round screens, and `UIanim.rdr`'s library entries the dump carries), and the
  captions' ids as the loc reader's golden pins them (`packages/scene/test/golden/locTables.json`). **The captions'
  texts** are a byte read of `RUN/LOCALE/STATES/UIMNLOC.ZAR` (each the string stored after its `MSG_ID`), and
  `dlgNetError.rdr`'s three popup literals a byte read of `RUN/UI/READERC.ZAR` at the set's offset 0x71000 (research
  179's) -- source inspection, not a reader's run; `tools/dump-online-dialogs.ts --dialog dlgNetError.rdr` and
  `parseLocTable` are the readers that confirm them. **No test was run for this note** (source inspection only; no
  node, no browser). Nothing here is measured on the original running -- ONL-32's captures are the proven level.
- Stands on research [266](266-the-chat-panels.md) (§8.10 ABORT and `dlgNetAbort.rdr`, §8.10.5
  `MATCH_ABORT_OTHERS_READING`), [263](263-chat-the-ignore-list-and-moderation.md) (§5.2 the vote kick's point,
  `VOTE_KICK_POINT_READING`), [264](264-the-results-path-and-the-ladders-guards.md) (§4.2 VOTE ALL, the spectators'
  eject), [231](231-the-join-as-built.md) (§5 the abandon as built, PF-27), [166](166-the-loading-screen-from-the-lobby-to-the-match.md)
  (§4 the load state's way back, `MATCH_NET_ERROR_DIALOG_READING`), [165](165-the-game-lobby-to-the-launch.md) (§3 the
  game socket's closes, R165.8), [159](159-the-bridge-to-the-match-start.md) (§2 the host handed on, §8 the dialogs'
  ids), [179](179-c1-match-server.md) (§6.2 the round screens' kick test, §6.18 and §10 `TimeoutMonitor`),
  [187](187-c8-card-online-services.md) (§7.4 the host's leave, #528), [193](193-m2-mp-net-replication.md) (§6, §12.7
  the abandon count), [118](118-popup-dialogs.md) (R118.3 no popup survives a switch), [157](157-connecting-to-socom-ii-online-the-lobby-client-and-the-login.md)
  (R157.6 the connect's 90 s, #548 named by no dialog), [91](91-the-round.md) (§18 §2.4 and §3, the screens' 90 s),
  [309](309-clan-games-the-swap-after-a-game.md) (R309.8 a host migration's index) and
  [314](314-watch-game-spectating.md) (§4.2 the game object's +0xcc as the late flag, §6 how a watcher leaves), and does
  not restate them.
- Code as read (nothing changed): `packages/viewer/src/lobbyMatch.ts` (`returnDialog`, `MATCH_NET_ERROR_DIALOG_READING`,
  `MATCH_ABANDONED_DIALOG`, `MATCH_KICKED_DIALOG`, `MATCH_ABORT_DIALOG`, `finalCloseDialog`); `packages/viewer/src/netPage.ts`
  (`GAME_FINAL_CLOSES`, `GAME_SOCKET_CLOSED_DIALOG_READING`, `GAME_ENDED_DIALOG_READING`, `GAME_KICKED_DIALOG_READING`,
  `endGame`, the `abandoned` and `kicked` cases); `packages/ui/src/screens/gameLobbyCommands.ts`
  (`NET_ERRNO_DISCONNECTED_READING`, `seatEnded`, `CheckTeamStatus`); `packages/viewer/src/roundScreens.ts`
  (`ROUND_SCREEN_TIMEOUT_S`, `screenTimedOut`); `packages/viewer/src/matchAbort.ts`; `packages/central/src/bridge.ts`
  (`leave`, `onAbandon`, `ABANDON_BELOW_PLAYERS_READING`, `ABANDON_TRIGGER_READING`, `ABANDONED_TO_LOBBY_PLACEHOLDER`,
  `HOST_SUCCESSOR_READING`); `packages/central/src/lobby.ts` (`LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`, `hostGone`);
  `packages/match/src/room.ts` (the closes 4001, 4002, the protocol refusal); `packages/viewer/src/net/protocol.ts`
  (`kicked` :1178, `abandoned` :1196 -- the roadmap's ":495, 511" are stale); `packages/ui/src/uiCommands.ts` (row 84
  `LobbyBailout`); `packages/ui/src/screens/briefingRoomCommands.ts`, `createGameCommands.ts`, `worldOfSocomCommands.ts`
  (`LobbyBailout` parked for ONL-22).
- 2026-10-14, BAILOUT (§6 E5, sprint 19's second half): `LobbyBailout` built -- `packages/ui/src/screens/logoffCommands.ts`
  (`LobbyBailout`, `LOGOFF_COMMAND_ROWS` row 48 id 84) and the three screens' entries `existing` for ONL-22; the
  sentences above about its parking are kept as the state they recorded. Reading, pending review (the implementer's
  re-read at the source agrees with R315.7; §3.7 says what it adds).
- 2026-10-14, ROUND-90 (§6 E1, sprint 19's second half): the round screens' 90 s built in viewer `lobbyMatch.ts`
  (`ROUND_SCREEN_TIMEOUT_RETURN_READING`, the return `timeout`) over `roundScreens.ts`' `heldScreen`; the read that
  changed the row (the timeout writes no errno) is §10. Reading, pending review; the sentences above that call the
  90 s unwired are kept as the state they recorded.
- 2026-10-14, VERSION-ABORT (§6 E3, sprint 19's second half): a hello refused for its protocol version posts
  MP_VERSION_NUMBER_ERROR in ui `gameLobbyCommands.ts` `seatEnded` (`VERSION_REFUSAL_ABORT_READING`), the refusal's text
  one spelling (`versionRefusalText` / `isVersionRefusal`, sent by server `room.ts`); the re-read and what it adds (the
  BRIEFING ROOM's `version_failure_1`) are §11. Reading, pending review; the sentences above that call the version path
  unbuilt are kept as the state they recorded.
- 2026-10-14, WATCH-DOCS (§6 E6, sprint 19's second half): roadmap 05's ONL-22 and ONL-22a ("Today", "Gap",
  "Unknowns", the landings of §1) and SPRINTS' sprint 23 line for ONL-22a brought up to what the half built; the
  protocol cite re-read -- `kicked` and `abandoned` are now `protocol.ts` :1196 and :1214 (the ":1178, :1196" above is
  the state this note recorded); research 266 §8.10.5's `MATCH_ABORT_OTHERS_READING` row and research 101's A43 told
  of §3.3's +0xcc reading. (2026-10-15, NU-17: §3.3's below three narrowed to the late seats in server `bridge.ts`,
  `ABANDON_LATE_JOINER_READING` in code; the read and the owner's log are §12. Reading, pending review.)
  (2026-10-16, NU-17-LOWS: every writer of +0xcc and network message 4 are §12.1 -- eight writers, not one; the
  bridge's `late` matches but for a late seat still loading at the return. Reading, pending review.)
  (2026-10-17, AD-12 (web sprint 40, C07-C09): §10's two gaps closed in viewer `lobbyMatch.ts` -- the retried client
  followed (C08), a late console's screens timed from its own level start (C09, `LATE_SCREENS_OPEN_READING`) -- and the
  page's held last screen in viewer `netPage.ts` (C07, the merge controller's option B, RE-3's digest re-pinned); the
  re-reads and the build are §13.
  Reading, pending review.)
  `NET_ERRNO_DISCONNECTED_READING`'s doc in `gameLobbyCommands.ts` -- held by the implementer
  (outside the task's one source edit) -- was changed by the seat at 27b695079 ("its one writer, `FUN_002f4090`, is
  read; which library code is 32 is not"), with research 165 §6's row. Reading, pending review.

## 1. The answers

| row | answer | where |
|---|---|---|
| R315.1 | **Each way out, where it lands** (online; on a LAN each "SOCOM II ONLINE" is the LAN BRIEFING ROOM, `ReturnToWorldOfSOCOM` P:L15688-15693): ABORT -> `dlgNetAbort.rdr`, 3 s, SOCOM II ONLINE; the vote kick and VOTE ALL's eject -> `dlgNetBanned.rdr`, 4 s, SOCOM II ONLINE; the abandon -> `dlgNetAbandoned.rdr`, #528, SOCOM II ONLINE at once; a network failure in the load, the match or a round screen -> `dlgNetError.rdr`: with `mp_net_errno` 32 a popup and MAIN MENU -> REBOOT, else a popup and SOCOM II ONLINE at once; in the GAME LOBBY a network failure -> `OnNetError`: errno 32 #365 -> REBOOT, else the event's text -> the BRIEFING ROOM; a team error #367 -> the BRIEFING ROOM; a version mismatch -> `dlgNetAbort.rdr`; BACK -> #362 / #363 -> the BRIEFING ROOM; the lobby connection lost on most other online screens -> `OnMultiplayerDisconnect` -> REBOOT (some screens have their own handler, R315.7); the match's end -> the same game's GAME LOBBY (ONL-20b); the host's leave -> no screen (the role migrates). | §2 |
| R315.2 | **ABORT** (`dlgNetAbort.rdr`, S:0x3f1380): #529 "ABORTING MISSION." over #531 "RETURNING TO SOCOM II ONLINE" (#530 on a LAN), `DisconnectFromGameServer`, `WAIT 3`, `ReturnToWorldOfSOCOM`; TRIANGLE at once (P:L12342-12372). Reached from the START menu's confirm 3 s after YES (`FUN_002a9b30` D:L150614-150627; 266 §8.10.2) and from the GAME LOBBY's MP_VERSION_NUMBER_ERROR (`version_failure_2`, P:L6622, P:L7699-7700). **Built** for the confirm (MATCH-02; `matchAbort.test.ts`'s landing on `dlgWorldOfSOCOM.rdr`); the version path is not (§3.4). | §3.1 |
| R315.3 | **The kick** (`dlgNetBanned.rdr`, S:0x3f26a0): #541 "ABORTING MISSION" title, #539 "YOU HAVE BEEN KICKED FROM THIS GAME", #540 "RETURNING TO SOCOM II ONLINE..."; `DisconnectFromGameServer`, `WAIT 4`, `ReturnToWorldOfSOCOM`; TRIANGLE at once (P:L12478-12497). Two triggers: the team vote at ROUND COMPLETE's or GAME COMPLETE's start on the victim's console (`HaveBeenBannedFromGame`, `BanSelfFromGame`, `WAIT 0.5`; 263 §5.2, 179 §6.2), and VOTE ALL's eject on every spectator at once (D:L159607-159610, `FUN_002b9d80` D:L159631-159634; 264 §4.2). The room's half and the route are **built** (`kicked` 'vote', close 4002 -> #539 -> `MATCH_KICKED_DIALOG`, `lobbyMatch.test.ts`); the dialog's landing is untested. A rejoin is refused -972 #443 (SVC-23e, built). | §3.2 |
| R315.4 | **The abandon** (`dlgNetAbandoned.rdr`): `DisconnectFromGameServer`, POPUP #528 "All players left the game before you were able to join. Please try again." with no button and no wait, `ReturnToWorldOfSOCOM` at once (P:L12419-12436) -- so #528 shows only until the switch (R118.3; `NET_POPUP_BEFORE_SWITCH_READING`). Three triggers in the original: a leave that leaves fewer than three while the game object's +0xcc is set (`FUN_002bc530` D:L161130-161141); the session master with both sides empty, the game in states 2..5 and spectators present (`FUN_002c4500` D:L165674-165676); the load state for a console whose +0xcc is set finding the game over or back in its lobby, or itself the master (`FUN_001f5e70` D:L55730-55745). **+0xcc is the late flag** (`FUN_002a7340` D:L149273-149280 writes it with the valve `late_joiner`; 314 §4.2), which supports research 187's and MATCH-02's reading of `FUN_002bc530` -- the below-three #528 is a late joiner's, a seated console only refreshing the record -- against the server's (`ABANDON_BELOW_PLAYERS_READING` on every leave of a launched game); #528's own words agree. Not changed here (`ABANDON_LATE_JOINER_READING`, §3.3). The port's two triggers and the route are **built** (PF-27; `frontEndMatch.test.ts`: `dlgNetAbandoned.rdr` on screen). | §3.3 |
| R315.5 | **The network error** (`dlgNetError.rdr`, "NET ERROR"): ONSTART `DisconnectFromGameServer`; with `mp_net_errno` 32 the popup "You have been disconnected from SOCOM II Online." (corrected, §9: the record's text is
one name, "You"; a script literal, stored word by word in READERC: `You|have|been|disconnected|from|SOCOM|II|Online.`, bytes 463460-463508 -- corrected at the review; not #365's words) with MAIN MENU (#45), then `SWITCHMENU(REBOOT)`; else the popup "You have been disconnected from SOCOM II Online." ("... SOCOM II LAN." on a LAN), no button, `ReturnToWorldOfSOCOM` at once (P:L12262-12299). `mp_net_errno` (S:0x3f4fa8) has one writer, `FUN_002f4090` (D:L194249-194306): it stores the network library's error code and, when the handler at +0x5c answers 0 (D:L194273-194276), posts MP_MEDIUS_ERROR with #1067 "Disconnected from Game" or #1068 "Disconnected from Network" by the lobby object's state (D:L194276-194293); which failure gives 32 is not read. Entered from: the load state's net failure (S:0x3e2f60, `FUN_001f5e70` D:L55710-55721), the in-level hook `FUN_002a45f0` (S:0x3f0a80, D:L147799-147842; installed online at the level's start, D:L55837), the round screens' `TimeoutMonitor` (§4), and the player-state builder with no stored id (`DAT_00441470` == 0, set at D:L164834 -- not the client index of `FUN_0030d5a0`; S:0x3f2ae0, `FUN_002c5450` D:L166307-166309). **The port** routes every final close and a retry-less drop in the load or match to `dlgNetError.rdr` (`returnDialog`), but writes `mp_net_errno` only in the GAME LOBBY (32, `seatEnded`): the match's error therefore shows the not-32 branch while the page's own dialog number for it is #365, the GAME LOBBY's `OnNetError` caption (P:L7796), not `dlgNetError.rdr`'s words (`NET_ERRNO_BY_CLOSE_READING`, §3.5). | §3.4-3.5 |
| R315.6 | **The GAME LOBBY's own** (P:L6621-6627): `OnNetError` -- errno 32: #365 "You have been disconnected from SOCOM Online." with #366 (MAIN MENU, a shared string), REBOOT; else the event's text (#1067 / #1068) with #364 (BRIEFING ROOM, a shared string), `DisconnectFromGameServer`, the names and passwords cleared, `ReturnToBriefingRoom` (P:L7785-7824); `team_monitor` with `CheckTeamStatus` false -- #367 "Team Assignment Error. X Exit to the Briefing Room.", `ReturnToBriefingRoom` (P:L7858-7882); MP_VERSION_NUMBER_ERROR (posted by `FUN_002c0850` when a peer's version is not 0x47 -- 0x817 when `DAT_00437dd4` is 1 or 2 -- D:L163322-163326) -> `dlgNetAbort.rdr`; MP_EJECT_SPECTATOR (314 §3.2); BACK (165 §3). **Built**: errno 32 (`seatEnded`), BACK, the spectator's refusal; `CheckTeamStatus` answers the socket's state; the not-32 branch and the version path are not reached by any close. *Since 2026-10-14 (VERSION-ABORT, E3)*: the version path built -- a hello refused for its protocol version posts MP_VERSION_NUMBER_ERROR, no errno (§11). | §3.6 |
| R315.7 | **The lobby connection lost elsewhere** (WORLD OF SOCOM, the BRIEFING ROOM (which also runs `halt_join`, P:L4093), CREATE GAME and seventeen more sets -- login, filters, SOP, taunts, friends, ignore, the clan screens, both ladders, and the four net end dialogs `dlgNetError` P:L12267, `dlgNetAbort` P:L12351, `dlgNetAbandoned` P:L12421 and `dlgNetBanned` P:L12485 (so a lobby loss during `dlgNetError`'s popup or `dlgNetBanned`'s 4 s goes through `OnMultiplayerDisconnect` to REBOOT -- corrected, §9: during `dlgNetBanned`'s 4 s only if CROSS comes within the wait, its `WAIT 4` still switching to SOCOM II ONLINE; E4's tests pin both) -- bind MP_MEDIUS_ERROR to `UIanim.rdr`'s `OnMultiplayerDisconnect`; `dlgOnlineOptions` binds its own `OnMultiplayerDisconnectFromOptions`, P:L8751, and `dlgNetAuthenticate`, `dlgNetServerSelect`, `dlgNetPlayerName`, `dlgNetConnect` and `dlgDownloadPatch` their own `OnNetError`; corrected at the review): the event's text with MAIN MENU, `LobbyBailout`, `UnInitNetwork`, `NetCnfClose`, `NetCnfUnInit`, REBOOT (P:L15659-15672). `LobbyBailout` (`FUN_0027dc90` D:L126213-126220) is not "the constant 1" the port's rows say: it calls `FUN_002f4240(0x44f370)` (D:L194312-194335), which, with the lobby object's +0x7d set, leaves the game session and resets the lobby object, then answers 1. **Built**: the lobby session's loss posts MP_MEDIUS_ERROR with #450 (`SESSION_LOST_READING`, ONL-07); `LobbyBailout` is parked for ONL-22 in three command files. *Since 2026-10-14 (BAILOUT, E5)*: `LobbyBailout` built on the logoff module (`logoffCommands.ts`) over the page's one lobby teardown (`LobbyClient.disconnect`, `UnInitNetwork`'s), gated by the flag, answering 1; the three entries `existing`. | §3.7 |
| R315.8 | **The host's leave.** In the GAME LOBBY the role migrates with no message: `Session_master_migration` (P:L7437-7461) waits until the console is the session master, then gives it the host's buttons and the launch clock (187 §7.4; 309 R309.8 for its clan-swap index). In a launched game the network library migrates the session (research 193 row 9, `FUN_002bc080`; 159 §2); no dialog. ABORT by the host is a leave like any other (266 §8.10.2: `DisconnectFromGameServer` tells the lobby the game is over only when the master is its last client, D:L126438-126440). **Built**: SVC-07b's hand-on before the launch (`HOST_SUCCESSOR_READING`); after it, `LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`. | §3.8 |
| R315.9 | **The timeouts the scripts set**: 90 s on each round screen (`TimeoutMonitor`: `WAIT 90`, `GameStatePopCommand(dlgNetError.rdr)`, P:L13758-13760, P:L14207-14209, P:L14664-14666); 30 s on the BRIEFING ROOM's join (#440, P:L4708-4714) and WORLD OF SOCOM's (no text, P:L3741-3743); 90 s on the DNAS screen (#450, P:L1282-1290) and on CONNECTING (`notify_unknown_failure`, P:L2418-2420; 157 R157.6's #547). The GAME LOBBY and the load state have none (the load waits on its barrier; 179 §6.23). Fixed waits: ABORT 3 s, the kick 4 s, the kick test's 0.5 s, the abort's 3 s before the switch. **The port**: the 90 s rule ships pure and unwired (`screenTimedOut`, H105, PF.R23); the 30 s and the login's 90 s are the page's scripts, run as they stand. | §4 |
| R315.10 | **ONL-22a, its slice, is built in parts by earlier rows**: the routes to `dlgNetAbort.rdr` (MATCH-02), `dlgNetAbandoned.rdr` (ONL-18, PF-27), `dlgNetBanned.rdr` and `dlgNetError.rdr` (ONL-18's `returnDialog`), each dialog then run by the menu state from the disc's set; the landing tested for ABORT and, from the lobby side, the abandon (`gameLobbyScreen.test.ts:281-288`: `seatEnded(4007)` through `dlgNetAbandoned.rdr` to `dlgWorldOfSOCOM.rdr`, #528 on screen). Roadmap 05's two "Today" lines ("no dialogs") are stale. What is left is §6. | §5 |

## 2. The captions

Ids from `locTables.json`; texts the byte read of UIMNLOC's stored strings, `C2 A6` (the cross, `UIMNLOC_UTF8_READING`)
marked "X".

| id | MSG_ID | text | used by |
|---|---|---|---|
| 45 | `_45_MainMenu_MSG` | MAIN MENU | the button of `dlgNetError`'s errno-32 popup (P:L12278) and of `OnMultiplayerDisconnect` (P:L15664) |
| 362 | `_362_ReturningWillRemove_MSG` | Returning to the Briefing Room will remove you from this game. Are you sure you want to do this? | the GAME LOBBY's BACK (165 §3) |
| 363 | `_363_PleaseWaitDisconnect_MSG` | Please wait a moment while you are disconnected from the game and returned to the Briefing Room. | the same, after YES |
| 364 | `_364_BriefingRoom_MSG` | (no string stored after the name; read as a shared string, "BRIEFING ROOM" as `_46_BriefingRoom_MSG`'s) | `OnNetError`'s not-32 button (P:L7798) |
| 365 | `_365_BeenDisconnected_MSG` | You have been disconnected from SOCOM Online. | `OnNetError`, errno 32 (P:L7796) |
| 366 | `_366_MainMenu_MSG` | (no string stored; read as shared, "MAIN MENU") | #365's button |
| 367 | `_367_TeamAssignErr_MSG` | Team Assignment Error. X Exit to the Briefing Room. | `team_monitor` (P:L7866) |
| 528 | `_528_AllPlayersLeft_MSG` | All players left the game before you were able to join. Please try again. | `dlgNetAbandoned` (P:L12430) |
| 529 | `_529_AbortingMission_MSG` | ABORTING MISSION. | `dlgNetAbort`'s title (P:L12344) |
| 530 | `_530_ReturningLan_MSG` | RETURNING TO LAN BRIEFING ROOM | `dlgNetAbort` on a LAN (P:L12364) |
| 531 | `_531_ReturningSocom_MSG` | RETURNING TO SOCOM II ONLINE | `dlgNetAbort` online (P:L12366) |
| 539 | `_539_YouveBeenKicked_MSG` | YOU HAVE BEEN KICKED FROM THIS GAME | `dlgNetBanned` (P:L12478) |
| 540 | `_540_ReturningSocomEll_MSG` | RETURNING TO SOCOM II ONLINE... | `dlgNetBanned` (P:L12479) |
| 541 | `_541_AbortingMissionNoDot_MSG` | ABORTING MISSION | `dlgNetBanned`'s title (P:L12480) |
| 548 | `_548_DisconnectedNetwork_MSG` | Disconnected due to a network error. X CONTINUE. | **no online script** (157 R157.6); no `FUN_00361b40(0x224)` in the decompilation either |
| 1067 | `_1067_MEDIUS_DISCONNECTED_GAME_MSG` | Disconnected from Game | MP_MEDIUS_ERROR's text from `FUN_002f4090` (the lobby object's +0x60 = 0x11, D:L194277-194281) |
| 1068 | `_1068_MEDIUS_DISCONNECTED_NETWORK_MSG` | Disconnected from Network | the same, any other state (D:L194283-194293) |

`dlgNetError.rdr`'s own literals (READERC at 0x71000; the dump prints them `You`, `<text 45>`, `<text 48>`): its
title "NET ERROR"; errno 32 "You have been disconnected from SOCOM II Online." (corrected, §9: the popup's text is the one
name "You"; stored word by word in the set, READERC bytes
463460-463508: "II" can only be this popup's own; the same words as the not-32 online literal, **not** #365 -- #365 is
the GAME LOBBY's `OnNetError`, P:L7796; corrected at the review); else on a LAN "You have been disconnected from SOCOM II LAN." (45 characters), online "You have been
disconnected from SOCOM II Online." (48). Who uses #548, if anyone, is not read (`tools/dump-dialogs.ts --msg-users 548`).

## 3. Each way out

### 3.1 ABORT (`dlgNetAbort.rdr`)

R315.2; research 266 §8.10 reads the confirm, the 3 s and the landing, and MATCH-02 built them. The set's ONSTART runs
`onstart_handler` (`StopAllSounds`, `VagStreaming(OFF)`, `DisconnectFromGameServer`, `WAIT 3`, `exit_lobby`) and
`LANorMPAbortCaption` together (P:L12348-12368). The others see a leave (`MATCH_ABORT_OTHERS_READING`, 266 §8.10.5).

### 3.2 The kick (`dlgNetBanned.rdr`)

R315.3. The set has no popup: three static captions (P:L12478-12480), the 4 s and TRIANGLE (P:L12483-12497). The team
vote's removed player reaches it from the round screen's `ExitOnStart` after `BanSelfFromGame` and 0.5 s (263 §5.2;
`VOTE_KICK_POINT_READING`); an ejected spectator from VOTE ALL's handler at once (the console's `MaxSpectatorsValve` 0
first, D:L159602-159606). **The port**: the room removes at the screen's start (`voteKickAt`) and at once for VOTE ALL,
each with `kicked` 'vote' and close 4002 (`room.ts` :5409, :5474); `NetPage` ends the seat on #539 (`netPage.ts`
:1564), `returnDialog` gives `dlgNetBanned.rdr` (`lobbyMatch.ts` :121), and the menu state runs the set. No test
follows the set to SOCOM II ONLINE (O4).

### 3.3 The abandon (`dlgNetAbandoned.rdr`)

R315.4. The port's triggers (`ABANDON_TRIGGER_READING`, `bridge.ts` :775): the match room's side left empty in a
classic round (`abandoned`, which `NetPage` ends on #528 in a game, `netPage.ts` :1494) and the bridge's below three
on any leave of a launched game (`bridge.ts` :499, :630; the others' sockets closed 4007 -> #528). Against the
original as read:

- `FUN_002bc530`'s below-three applies only with +0xcc set (D:L161134-161141). +0xcc is written by `FUN_002a7340`
  (D:L149273-149280), the setter of the valve `late_joiner`, and the load state clears it once loaded
  (D:L55711-55716; 314 §4.2; *2026-10-16: every writer, and the release at the host's return, are §12.1*). A
  seated player's console, +0xcc clear, only refreshes the game's record
  (`FUN_002c00f0`, the master's). So the 266 §8.10.5 conflict leans to MATCH-02's reading: in a round, a leave that
  leaves two players shows **no** #528 on their consoles. What the round does then -- a side emptied, or two left -- is
  not read (the mission's win test with an empty side; `CLASSIC_WAITING_PLACEHOLDER` is the room's stand-in).
- `FUN_002c4500`'s empty sides with spectators: only the session master switches (`DAT_0045a0c0`, D:L165674-165675);
  what the spectators then see (the master's leave, a migration to one of them, or `dlgNetAbandoned` by another path) is
  not read. The port abandons for everyone on a side emptied.
- The load state's #528 (D:L55730-55745) is the late joiner's too: a game found over (state 6) or back in its lobby
  (state 1), or the late joiner become the master.

So the port's below-three on every leave is the departure the reading points at, but the replacement -- what a round
with too few players does -- is unread; ONL-22 does not change the server on this reading alone
(`ABANDON_LATE_JOINER_READING`; ONL-32's capture B, owner list 5, settles both).

### 3.4 The network error's entries (`dlgNetError.rdr`)

R315.5. Where the console writes it as the next dialog: the load state, which copies S:0x3e2f60 into the menu state's start
dialog for a late joiner whose game byte +0x112 is 3 (D:L55710-55713) and for a failed session join (`FUN_002b83e0`
answering 0, D:L55717-55721); the in-level hook `FUN_002a45f0` (D:L147799-147842: by the
game's state +0x114 it ends the session and switches the menu state to `dlgNetError.rdr`, S:0x3f0a80; installed as
`DAT_0044f3cc` at an online level's start, D:L55837, cleared by ABORT's switch, D:L150623, and at teardown,
D:L151538; one direct call when the state goes from 6 to 5, D:L163345, its other callers through the hook not traced);
the three round screens' `TimeoutMonitor` (`GameStatePopCommand`); and `FUN_002c5450`'s switch when the stored id
`DAT_00441470` is 0 (D:L166307-166309, S:0x3f2ae0). **The port**: `returnDialog` maps every dialog number but 528, 539 and
ABORT's to `dlgNetError.rdr` (`lobbyMatch.ts` :119-124), so a final close (4006, 4008, 1011), a refused hello, the idle
kick (OT.R41's adaptation, 4001 -> #365) and a retry-less drop all land there (`frontEndMatch.test.ts`: on screen).

### 3.5 Its two branches and `mp_net_errno`

`dlgNetError.rdr`'s `displayNews` reads `mp_net_errno` (P:L12277): 32 -> the popup with MAIN MENU, wait for it,
`SWITCHMENU(REBOOT)` (P:L12278-12285); else the buttonless popup and `exit_lobby` at once (P:L12286-12293). The GAME
LOBBY's `OnNetError` branches on the same valve (P:L7795, P:L7805). Its only writer is `FUN_002f4090` (the one use of
S:0x3f4fa8, D:L194261-194270), called with the network library's codes (D:L210113 with 0x14d; D:L210215, D:L210247,
D:L210254 with the library's returns); which failure is 32 is not read -- the PS2 network stack's code table is the read
that would say (`NET_ERRNO_DISCONNECTED_READING`'s "writer not read" narrowed to "its codes not read").

**The port** writes 32 in one place: the GAME LOBBY's `seatEnded` for every close but 4007 (`gameLobbyCommands.ts`
:985). In the load and the match nothing writes it (but `seatEnded` writes it as a PERM valve, `gameLobbyCommands.ts`
:532-536, and whether REBOOT clears it is not read -- an earlier lobby close may leave 32 behind; E2 and E4's tests
state the valve's starting value), so `dlgNetError.rdr` takes the not-32 branch -- "You have been
disconnected from SOCOM II Online." and SOCOM II ONLINE -- while the page names that same end #365 (`GAME_SOCKET_CLOSED_DIALOG_READING`),
which is the GAME LOBBY's `OnNetError` caption (P:L7796), not `dlgNetError.rdr`'s -- online the two branches show the
same words and differ only in MAIN MENU then REBOOT against an immediate SOCOM II ONLINE; the same server close reboots from the lobby and returns to SOCOM II ONLINE from the match. The
original writes one errno per failure wherever the console stands. Either both are 32 (the lobby's reading, research
159 §8) or the codes split by failure; the page should give one close one errno (`NET_ERRNO_BY_CLOSE_READING`, E2).

### 3.6 The GAME LOBBY's own

R315.6. `OnNetError` stops the lobby's sequences first and runs once (`AlreadyHandlingError`, P:L7786-7792). Its
not-32 branch shows MP_MEDIUS_ERROR's own text -- from `FUN_002f4090`, #1067 or #1068 -- and returns to the BRIEFING
ROOM with the session's game left. The version mismatch (`FUN_002c0850` D:L163322-163326, S:0x3f28c0) is a peer's
message, not a close. **The port**: every close but 4007 is errno 32; a hello refused for its protocol version
(`room.ts` :1507, "protocol N, this server speaks M") is a refused hello like any other -> errno 32 -> #365 -> REBOOT,
where the original's version mismatch goes to `dlgNetAbort.rdr` and SOCOM II ONLINE (`VERSION_REFUSAL_ABORT_READING`,
E3). `CheckTeamStatus` answers the socket's state, so #367 shows when the seat is gone mid-count -- its original test
(`FUN_002772c0`: the game object and the master byte or the host's connection, the command's doc) is not re-read here.

*Built 2026-10-14 (VERSION-ABORT, E3; reading, pending review)*: the version refusal no longer takes errno 32 -- §11.

**R4B-00 source correction (2026-11-04; reading, pending review).** The peer's game-version word is distinct from
`PATCH_LEVEL`: retail `FUN_002c00f0` writes `0x47` (D:L163070-163072), and `FUN_002c0850` compares the peer's
`+0x14` word to `0x47` / mode-1/2 `0x817` (D:L163320-163326). r0004 loads `0x49` in its writer at `0x2c1e3c`
and reader at `0x2c2620`, adds the same `0x7d0` in modes 1/2, and posts the mismatch event through
`0x2c2638-0x2c2658` (event string `0x41dd60`). Re-read in the PINE aggregate
`game/overlays_r0004/socom2_game_r0004.elf` and pristine `game/r0004/served/ftscore.bin`.
This is O1's source explanation for research 343's cross-revision walk-back; those logs are a recomp capture,
not an original-runtime comparison. The patch token's `VerifyPatchLevel` is the earlier universe-select gate
(`FUN_002fd6e0`, D:L199829-199850; research 153 R153.7), not this peer event. The port's protocol-hello refusal is
its documented stand-in (§11), not a new transcription of the original GameObject wire (OT.R27); R4B-23 owns the
eventual version-value switch.

### 3.7 The lobby connection elsewhere

R315.7. Built through ONL-07's lobby client (state 2's MP_MEDIUS_ERROR with #450) and the sets' own
`OnMultiplayerDisconnect`. `LobbyBailout`'s rows (`uiCommands.ts` row 84 'declared'; parked in the three screens'
tables) describe its body as answering 1; `FUN_0027dc90` first calls `FUN_002f4240` (R315.7). The page's
`UnInitNetwork` (ONL-10) already leaves the game and the lobby (`FUN_0027e5c0` D:L126505-126515), so the bailout adds
nothing the page lacks; its rows' doc is what is wrong (E5).

*Built 2026-10-14 (BAILOUT, E5; reading, pending review).* Re-read at the source: `FUN_0027dc90` calls
`FUN_002f4240(0x44f370)` (D:L126218) and answers 1 whatever it answers (D:L126219). `FUN_002f4240` answers 0 with the
lobby's +0x7d clear (D:L194319-194320); with it set -- `DAT_0045a0c1` (the DME object's on-line byte +1):
`FUN_00300680` and `thunk_FUN_00647698` (D:L194323-194326; the thunk not read); `DAT_0045a0c5` (its +5):
`FUN_0030d770(0x45a0c0)` and `FUN_0030e3a0(0x45a0c0, 0)` (D:L194327-194330); then `FUN_002dfdd0(0x44f370)`
(D:L194331), which clears +0x7d (D:L182493-182496) -- and answers 1. "Leaves the game session and resets the lobby
object" above is these: the DME halves and the lobby's disconnect. So `UnInitNetwork` after it finds +0x7d clear
(`FUN_002dfdd0` does nothing) and the DME's +1 clear (`FUN_0030d770` does nothing, D:L210124): the lobby is left
once. The page maps the DME halves onto `UnInitNetwork`'s `networkDown` (`NETWORK_TEARDOWN_READING`, not given by
the page's mount) and the lobby's onto `LobbyClient.disconnect`, both behind `LobbyClient.up` (+0x7d); state 2's entry
(`FUN_002ee610` D:L190804-190820) leaves +0x7d set on both, so on MP_MEDIUS_ERROR the bailout is what leaves the
lobby. Held by `packages/ui/test/screens/logoffCommands.test.ts` (unit) and `worldOfSocomScreen.test.ts` (the
popup with #450's text and MAIN MENU, then `LobbyBailout`, `UnInitNetwork` finding the lobby left, the NetCnf rows,
the reboot; the disc's set or the committed fixtures). Not measured on the original running.

### 3.8 The host's leave

R315.8. Nothing to build for ONL-22: the lobby's migration is SVC-07b's, the launched game's is
`LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER`'s (159 §2), and neither shows a dialog in the original.

## 4. The timeouts

R315.9. Only the round screens' 90 s leads to `dlgNetError.rdr`; it is the screens' stall guard (research 91 §18 §2.4,
179 §10), and the room drives the port's screens by its own `roundOver.screens` seconds, so the port reaches 90 s only
if the room stalls. The 30 s waits end a join, not a game (314 §3.1). Roadmap 05's "the disconnect timeouts other than
90 s" are these: there is no in-game disconnect timer in the scripts; the network library's own (the DME's) is not read.

## 5. ONL-22a and the port today

| way out | the original | the port | evidence held |
|---|---|---|---|
| ABORT | `dlgNetAbort`, 3 s, SOCOM II ONLINE | built (MATCH-02) | `matchAbort.test.ts` (unit, the landing); MATCH-02's rendered run (266 §8.10) |
| kick, eject | `dlgNetBanned`, 4 s, SOCOM II ONLINE | route built (SVC-23d-f); the landing pinned (NET-ERRNO, E4) | `lobbyMatch.test.ts` (the mapping); `matchAbort.test.ts` (dev-disc: #541/#539/#540, the 4 s, TRIANGLE) -- was: "the landing untested" |
| abandon | `dlgNetAbandoned`, #528, at once | route built (PF-27); triggers depart (§3.3); the landing pinned (NET-ERRNO, E4) | `frontEndMatch.test.ts` (on screen), `netPageRound.test.ts`, `matchAbort.test.ts` (dev-disc: #528, then SOCOM II ONLINE) |
| net error, load or match | `dlgNetError`, by errno | route built (ONL-18); errno 32 written by the close (NET-ERRNO, E2; was: "errno unwritten", §3.5) | `lobbyMatch.test.ts` (the write before the return), `frontEndMatch.test.ts` (on screen; dev-disc: MAIN MENU, then REBOOT), `matchAbort.test.ts` (dev-disc: errno 0 and 32) |
| round screen 90 s | `dlgNetError` | not wired (H105) | `roundScreens.test.ts` (the pure rule) |
| round screen 90 s (since ROUND-90) | `dlgNetError`, the errno untouched (§10) | built: each screen 90 s from its own open, the return `timeout`, no errno (`LobbyMatch`); the page's own drawing of a held last screen is LATER 52 | `roundScreens.test.ts` (`heldScreen`), `lobbyMatch.test.ts`, `frontEndMatch.test.ts` (unit; dev-disc: errno 0 -> SOCOM II ONLINE, 32 -> MAIN MENU, REBOOT) |
| GAME LOBBY net error | `OnNetError`, by errno | errno 32 always | `gameLobbyScreen.test.ts` :281 |
| version mismatch | `dlgNetAbort` | #365, REBOOT | none |
| version mismatch (since VERSION-ABORT) | `dlgNetAbort`, 3 s, SOCOM II ONLINE; the BRIEFING ROOM's too (§11) | built: MP_VERSION_NUMBER_ERROR posted, no errno; the room's text shared (`versionRefusalText`) | `gameLobbyScreen.test.ts` (dev-disc: the GAME LOBBY and the BRIEFING ROOM, the 3 s, the valve unchanged when absent and from a leftover 32 (was: "from 0" -- the test runs the valve absent, not 0; the review's finding 2)); `room.test.ts` (the shared text, a text read of `room.ts`) |
| host's leave | migration, no dialog | built (SVC-07b; after launch a placeholder) | `hostHandover.test.ts` |

## 6. What ONL-22 builds

The smallest rows, each with its failing test first. **About 6 points** (the roadmap's M): E1-E6 are S, 1 each. Every
row is the simulation track's but E6 (docs).

1. **E1 -- the round screens' 90 s (S, 1).** The page's round-screen host: a screen up `ROUND_SCREEN_TIMEOUT_S` with no
   next screen or return ends the match on `dlgNetError.rdr` (`GameStatePopCommand`), on all three screens; H105
   closed. *Test first*: `packages/viewer/test/frontEndMatch.test.ts` (ROUND COMPLETE held by a silent room: at 89.9 s
   still up, at 90 s `dlgNetError.rdr` on screen, the client closed); the same for FINAL ROUND and GAME COMPLETE.
   **Touches the screens' exit beside ONL-20b's return** (`matchReturned`, GAME COMPLETE's): after it, or a shared
   hot-file claim.
   *Built by ROUND-90 (2026-10-14, reading, pending review), changed by its read (§10): the timeout writes no errno, so
   it is its own return (`timeout`) in viewer `lobbyMatch.ts`, not NET-ERRNO's; the FINAL ROUND case replaced by GAME
   COMPLETE from its own open (FINAL ROUND never reaches 90 s, P:L14205); the page's held last screen is LATER 52.*
2. **E2 -- one errno for one close (S, 1).** *Built by NET-ERRNO (2026-10-14, reading, pending review): `NET_ERRNO_BY_CLOSE_READING` and the port `netErrno` in viewer `lobbyMatch.ts`; the page's write is the reported `frontEnd.ts` hunk (§9).* `lobbyMatch.ts`: a load or match ended on #365 writes `mp_net_errno`
   `NET_ERRNO_DISCONNECTED_READING` (32) before the menu state opens `dlgNetError.rdr`, as `seatEnded` does in the
   lobby (`NET_ERRNO_BY_CLOSE_READING`), so the same close REBOOTs on MAIN MENU from the match as it does from the lobby (the words are the same either way online, §2).
   A choice between readings, the controller's: the best-evidenced is the lobby's existing one (research 159 §8); ONL-32's
   capture of a cable pull in a round settles it. *Test first*: `frontEndMatch.test.ts` (a final close in the match:
   `dlgNetError.rdr`, the popup's MAIN MENU, X -> REBOOT; a drop with no retry: the same); `lobbyMatch.test.ts` (the
   valve written before `back`); each test states the valve's starting value (0, not a 32 left by an earlier lobby close, §3.5). The idle kick (OT.R41) lands there with it -- flagged for the owner's list, not changed.
3. **E3 -- a version refusal aborts (S, 1).** `gameLobbyCommands.ts` `seatEnded`: a hello refused for its protocol
   version posts MP_VERSION_NUMBER_ERROR (the set's `version_failure_2`: `dlgNetAbort.rdr`, 3 s, SOCOM II ONLINE), not
   errno 32 (`VERSION_REFUSAL_ABORT_READING`); the room's refusal text a shared constant. *Test first*:
   `packages/ui/test/screens/gameLobbyScreen.test.ts` (the refusal: `dlgNetAbort.rdr`, then `dlgWorldOfSOCOM.rdr`);
   `packages/central/test/room.test.ts` (the text).
   *Built by VERSION-ABORT (2026-10-14, reading, pending review): ui `gameLobbyCommands.ts` (`VERSION_REFUSAL_ABORT_READING`,
   `versionRefusalText`, `isVersionRefusal`, `seatEnded`'s branch) and server `room.ts` (the text from the shared
   function); posted whichever dialog holds the seat, so the BRIEFING ROOM's join takes it too (§11).*
4. **E4 -- the three dialogs' landings pinned (S, 1).** *Pinned by NET-ERRNO (2026-10-14, `matchAbort.test.ts`, dev-disc; no code needed); two readings of this note corrected by the run, §9.* No code expected: tests that the menu state on each set lands
   where §1 says -- `dlgNetBanned.rdr` (#541, #539, #540; 4 s; TRIANGLE at once) and `dlgNetAbandoned.rdr` (#528, at
   once; the lobby side already pinned, `gameLobbyScreen.test.ts:281-288` -- the match side only) on `dlgWorldOfSOCOM.rdr`; `dlgNetError.rdr` with errno 0 on `dlgWorldOfSOCOM.rdr`, with 32 on REBOOT after MAIN
   MENU. *Test first*: `packages/viewer/test/matchAbort.test.ts`'s pattern, one case each (dev-disc where the set is read
   from the disc, the pin otherwise); a failure here is a runtime gap to fix in the row.
   Also: MP_MEDIUS_ERROR arriving on `dlgNetError`'s popup and on `dlgNetBanned`'s wait goes through
   `OnMultiplayerDisconnect` -- MAIN MENU, REBOOT (R315.7).
5. **E5 -- `LobbyBailout` answered (S, 1).** `uiCommands.ts` row 84 and the three screens' rows: 'built', its body
   `FUN_0027dc90` -> `FUN_002f4240(0x44f370)` (D:L126213-126220, D:L194312-194335) as the page's lobby teardown (the
   session's game left, the lobby object reset; idempotent beside `UnInitNetwork`), answering 1; the "constant 1" docs
   corrected. *Test first*: `tools/test/briefingRoomEntryCommands.test.ts` and its two siblings (the row built);
   `packages/ui/test/screens/worldOfSocomScreen.test.ts` (MP_MEDIUS_ERROR: the popup, MAIN MENU, REBOOT, the lobby
   left once). *Built 2026-10-14 (BAILOUT; reading, pending review)*: the body on `logoffCommands.ts`, which the
   session already mounts, so no page file changed; the table's row 84 needed no change (`declared`, ONL-22, its
   answer 1 already right); the create game's entry is held in `createGameCommands.test.ts` (no
   `tools/test` entry test exists for it). §3.7 has the re-read.
6. **E6 -- the docs (S, 1).** Roadmap 05: ONL-22's and ONL-22a's "Today" (§5's table), the cite `protocol.ts:495, 511`
   -> :1178, :1196, the unknowns (§4: no other in-game timeout; the errno's codes), SPRINTS' sprint 23 line for ONL-22a;
   `NET_ERRNO_DISCONNECTED_READING`'s doc (the writer `FUN_002f4090` read, its codes not); research 266 §8.10.5's row
   and research 101's A43 told of §3.3's +0xcc reading. *Done 2026-10-14 (WATCH-DOCS; `NET_ERRNO_DISCONNECTED_READING`'s
   code doc by the seat at 27b695079); the cite now reads `protocol.ts:1196, 1214`.*

**Flagged, not counted**:
- **The abandon's scope** (`ABANDON_LATE_JOINER_READING`): after a read of what a round does with a side emptied or two
  players left (and what the spectators see after `FUN_002c4500`), the bridge's below-three narrowed to a late joiner and
  the room's side-empty abandon re-read -- M, 3, its own row once read; ONL-32's capture B settles it.
- **The GAME LOBBY's not-32 branch** (#1067 / #1068 -> the BRIEFING ROOM): reachable once the errno codes are read.
- **ONL-20b** (the return to the GAME LOBBY after a full game, sprint 19's first half): E1 shares its file; a watcher's
  and a player's return are its tests (314 §6).
- **SVC-23** (moderation): built for what ONL-22 needs (the vote kick's removal, the eject, -972 #443); E4 only pins the
  page's landing. A change to the kick's point or the ban's life is SVC-23's.

## 7. Placeholders and readings

Proposed for ONL-22; none is in code yet, so each is *note only* until the build carries it (the ledger's rule).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `NET_ERRNO_BY_CLOSE_READING` (proposed: viewer `lobbyMatch.ts`, beside ui `NET_ERRNO_DISCONNECTED_READING`) | `'every close the page names #365 writes mp_net_errno 32, in the lobby and the load and match alike'` | `FUN_002f4090` (D:L194249-194306) writes the network library's code wherever the console stands; which failure is 32 is unread; the page writes it in the lobby only | a read of the network library's codes behind D:L210113-210254; ONL-32's capture of a cable pull in a GAME LOBBY and in a round (the popup and where it lands) | in code (NET-ERRNO, 2026-10-14: viewer `lobbyMatch.ts`, the number 32 taken from ui `NET_ERRNO_DISCONNECTED_READING`; reading, pending review) -- was *note only* (proposed) |
| `VERSION_REFUSAL_ABORT_READING` (proposed: ui `gameLobbyCommands.ts`) | `'a game hello refused for its protocol version posts MP_VERSION_NUMBER_ERROR'` | the original's peer version test (`FUN_002c0850` D:L163322-163326) and the GAME LOBBY's `version_failure_2` (P:L7699-7700); the port's protocol version is its own stand-in for the game version | ONL-32's transcript of two consoles of different versions in one game, if a pair exists; else it stays a reading | in code (VERSION-ABORT, 2026-10-14: ui `gameLobbyCommands.ts`, `seatEnded`; reading, pending review) -- was *note only* (proposed) |
| `NET_POPUP_BEFORE_SWITCH_READING` (proposed: note only) | `'#528 and dlgNetError's buttonless popup show until the switch they precede'` | `dlgNetAbandoned`'s and `dlgNetError`'s POPUP with no button and no wait before `ReturnToWorldOfSOCOM` (P:L12428-12432, P:L12286-12293); no popup survives a switch (R118.3); how many frames the switch takes is not read | ONL-32's capture of an abandon and of a match-side net error, frame by frame | *note only* (proposed) |
| `ROUND_SCREEN_TIMEOUT_RETURN_READING` (viewer `lobbyMatch.ts`) | `'each round screen 90 s from its own open, the last held; dlgNetError.rdr, no errno written'` | each screen's `TimeoutMonitor` (P:L13758-13760, P:L14207-14209, P:L14664-14666) from its own ONSTART; `GameStatePopCommand` = `FUN_00278df0` (D:L123731-123745), no `FUN_002f4090`; the last screen held as a client's is (179 §6.18) | ONL-32's capture of a round screen held 90 s (the popup and where it lands) | in code (ROUND-90, 2026-10-14; reading, pending review; AD-12 2026-10-17: counted on the retried client too, a late console's open by `LATE_SCREENS_OPEN_READING`, §13) |
| `LATE_SCREENS_OPEN_READING` (viewer `lobbyMatch.ts`) | `'a late console\'s screens open at its own level start: the later of the room\'s open and the match shown'` | each screen's `TimeoutMonitor` from its ONSTART (P:L13474, P:L13936, P:L14371); a client opens the screens when its Mission tick finds the host's told +0x113 at 4 or 6 (`FUN_002aa490` D:L151127-151135, the exit state 0x4086c8; the task registered at D:L152101), so a late console still loading opens them at its level start; a load completing with the host at 6 opens none -- W6 leaves for `dlgNetAbandoned.rdr` (LATER 241, §15); one completing at 4 opens ROUND COMPLETE at its level start (its first Mission tick, D:L151127-151135), and the page draws it from there (LATER 74, §16) | ONL-32's capture of a late joiner loading in during the round screens (which screen it opens, when its `dlgNetError.rdr` comes) | in code (AD-12, 2026-10-17; §13; reading, pending review) |
| `LATE_RETURN_RECORD_UPDATE_READING` (viewer `lobbyMatch.ts`) | `'any gameLobby view after the returned view is a record update: dlgNetAbandoned.rdr at the load\'s end; none, dlgNetError.rdr'` | which of W5 and W6 (§12.1) ends a late console's load when its host returned during it: the original decides at run time by whether a record update (`FUN_002c0850` D:L163415-163416, the master's +0x112 reset to 1 by `FUN_002aa490` D:L151123-151126) came before the load's end; the page counts the room's next `gameLobby` view (central `bridge.ts` `tell`, match `game.ts` `tell`; a refused request elsewhere re-sends it unchanged) as that update; a load ended before the return is W6 (the review's F1). Not read: the master's publishing cadence against the room's; a relaunch's view during the load (the told state 2..5), taken as an update; W6's operands +0xb0 at least 0 (D:L55732-55733, `LOAD_NET_HOLD_READING`) and the session's join (`FUN_002b83e0` D:L55718-55721) | ONL-32's capture of a late joiner loading at a game's end, with and without a lobby change during its load | in code (LATER 238, 2026-10-21; §14; reading, pending review) |
| `ABANDON_LATE_JOINER_READING` (proposed: server `bridge.ts`, beside `ABANDON_BELOW_PLAYERS_READING`) | `'the below-three #528 is a late joiner\'s (+0xcc, late_joiner); a seated console refreshes the record'` | `FUN_002bc530` D:L161134-161141 under +0xcc, written by `FUN_002a7340` (D:L149273-149280); the load state's #528 (D:L55730-55745); #528's words; the round's outcome with a side emptied or two players left is unread | a read of the mission's win test with an empty side; ONL-32's capture B (owner list 5: a 2v1 with one leaving; players all leaving while spectators watch) | in code (NU-17, 2026-10-15: server `bridge.ts`, `GameBridge.leave` and the seat's `late` flag; §12; reading, pending review) -- was *note only* (proposed) |

The names this note leans on are each listed, retired or *note only*, where they live: `NET_ERRNO_DISCONNECTED_READING`
(ui `gameLobbyCommands.ts`), `GAME_SOCKET_CLOSED_DIALOG_READING`, `GAME_ENDED_DIALOG_READING`,
`GAME_KICKED_DIALOG_READING` (viewer `netPage.ts`; research 159), `MATCH_NET_ERROR_DIALOG_READING` (research 166),
`MATCH_ABORT_OTHERS_READING` (note only in research 266), `MATCH_ABORT_WAIT_READING`, `ABORT_LINES_READING` (research 266 §8.10.5),
`ABANDON_BELOW_PLAYERS_READING`, `ABANDON_TRIGGER_READING`, `ABANDONED_TO_LOBBY_PLACEHOLDER`, `HOST_SUCCESSOR_READING`
(server `bridge.ts`), `LAUNCHED_GAME_OUTLIVES_HOST_PLACEHOLDER` (server `lobby.ts`), `VOTE_KICK_POINT_READING`
(research 263), `SESSION_LOST_READING` (ui `lobbyClient.ts`), `CLASSIC_WAITING_PLACEHOLDER` (research 101's ledger, viewer `net/protocol.ts`),
`UIMNLOC_UTF8_READING` (`uiLoc.ts`).

## 8. What is left

- **Captions to dump** (`tools/dump-online-dialogs.ts --dialog dlgNetError.rdr`; `parseLocTable` over UIMNLOC): the
  reader's confirmation of §2's texts, #364's and #366's shared strings, `dlgNetError`'s three literals; who uses #548
  (`tools/dump-dialogs.ts --msg-users 548`).
- **Not read here**: the network library's codes behind `mp_net_errno` (which is 32); `FUN_002a45f0`'s callers through
  its hook; what a round does with a side emptied or two players left, and what spectators see after the master's
  `FUN_002c4500` switch (§3.3); `CheckTeamStatus`'s original test (`FUN_002772c0`); how long a buttonless popup shows
  before a switch.
- **The proven level**: ONL-32's captures -- ABORT's landing (266), a vote kick and VOTE ALL's eject through
  `dlgNetBanned`, an abandon (capture B), a cable pull in the GAME LOBBY and in a round, a round screen held 90 s, a host
  leaving in the lobby and in a launched game.

## 9. NET-ERRNO's run (2026-10-14)

Sprint 19's second half, the row NET-ERRNO (E2 and E4; W19.R9). Reading, pending review; the evidence is unit and
dev-disc tests (`packages/viewer/test/lobbyMatch.test.ts`, `frontEndMatch.test.ts`, `matchAbort.test.ts`), no capture.

- **E2.** A load or match ended on a return to `dlgNetError.rdr` (every close the page names #365, a retry-less drop, the
  match's end with its client gone) writes `mp_net_errno` 32 before the return (`NET_ERRNO_BY_CLOSE_READING`; the port
  `LobbyMatchPorts.netErrno`, the page's `writeNetErrno`: the valve found or made PERM and set through its watchers, as
  `FUN_002f4090` does, D:L194261-194272). The abandon, the kick, ABORT, the match's end and the session's stop write
  nothing. The page's wiring of the port is one line in `frontEnd.ts` (a hot file: reported to the seat before the
  edit). The idle kick (OT.R41, 4001 -> #365) now lands with it: MAIN MENU, then REBOOT (H222, unchanged).
- **E4.** The landings hold as §1 says for `dlgNetBanned.rdr` (#541, #539, #540; the switch requested at 4 s; TRIANGLE at once),
  `dlgNetAbandoned.rdr` (#528 until the switch; SOCOM II ONLINE at once), `dlgNetError.rdr` with errno 0 (the online
  literal; SOCOM II ONLINE at once) and with 32 (the popup with MAIN MENU waits; CROSS -> REBOOT), and MP_MEDIUS_ERROR on
  `dlgNetError`'s popup (`OnMultiplayerDisconnect`'s popup with the event's text and MAIN MENU; CROSS -> REBOOT).
- **Two corrections to this note, from the run and a re-read at the source** (flagged for the controller; the note's
  §1 and §2 rows above are left as written):
  1. *The errno-32 popup's text is `You`, not the whole sentence* (R315.5, §2). The POPUP record's text is one name, its
     +0x10 byte through `FUN_0026ed60` (`FUN_0036da20` D:L266833-266834); the set stores the unquoted sentence as one
     name a word (READERC bytes 463460-463508: `You`, `have`, `been`, `disconnected`, `from`, `SOCOM`, `II`, `Online.`,
     each NUL-ended), so the record names `You` alone (the pinned dump prints it `POPUP You buttons #45`, where a literal
     with spaces prints `<text N>`). The page shows `You`; whether the console does is ONL-32's capture to settle.
  2. *A lobby loss during `dlgNetBanned`'s 4 s reboots only on CROSS within the wait* (R315.7's parenthesis).
     `OnMultiplayerDisconnect` stops no animation (P:L15659-15672), so the set's `onstart_handler` runs on beside it:
     at its WAIT 4's end `ReturnToWorldOfSOCOM` switches to SOCOM II ONLINE and the popup goes with the switch (R118.3).
     The page does exactly this; CROSS before the 4 s end reboots.
- **LATER 52 (ROUND-90, 2026-10-14; the merge controller's ruling):** the page drops its last round screen once the
  room's seconds run out (`netPage.ts` `roundScreen()`), where the original's client stays on it until the host moves on
  (179 §6.18) -- a `netPage.ts` viewer row, RE-3's `netPageClock` the risk; filed, not built (§10).

## 10. ROUND-90's run (2026-10-14)

Sprint 19's second half, the row ROUND-90 (E1); the merge controller's amended brief. Reading, pending review; the
evidence is unit and dev-disc tests (`packages/viewer/test/roundScreens.test.ts`, `lobbyMatch.test.ts`,
`frontEndMatch.test.ts`), no capture. ONL-32's capture of a round screen held 90 s is the proven level.

- **The read that changed the row: the timeout writes no errno.** `TimeoutMonitor` is `WAIT 90`, then
  `GameStatePopCommand(dlgNetError.rdr)` on all three screens (P:L13758-13760, P:L14207-14209, P:L14664-14666).
  `GameStatePopCommand` is `FUN_00278df0` (D:L123731-123745; row 85 id 87): the dialog's name copied into the menu
  state's start dialog 0x408568 (D:L123737-123741), the game state popped (`FUN_002cf2f0(0x4084c0,0)`, D:L123742), the
  menu state switched to (`FUN_002cf410`, D:L123743) -- no call to `FUN_002f4090`, the valve's one writer, whose four
  callers are the network library's: `FUN_0030d670` (D:L210113, a failed send), `FUN_0030d9b0` (D:L210215, polled by
  the network thread `FUN_002ce930`, D:L171851) and `FUN_0030da00` (D:L210247, D:L210254, from `FUN_002ce9e0`,
  D:L171875), each on a library error code only. `dlgNetError`'s ONSTART `DisconnectFromGameServer` (`FUN_0027e420`,
  D:L126431-126451) does not reach them. So `displayNews` (P:L12277) reads what the network library last wrote: a
  room silent on a live connection leaves it unwritten -- 0, the buttonless popup and SOCOM II ONLINE (P:L12286-12293),
  or a 32 an earlier lobby close left PERM (§3.5), MAIN MENU then REBOOT (P:L12277-12285). Not a choice between
  readings: W19.R9 (`NET_ERRNO_BY_CLOSE_READING`) covers the closes the page names #365, and a timeout is no close.
- **Each screen's own 90 s.** Each dialog's `TimeoutMonitor` starts at its own ONSTART, so the count runs from that
  screen's open. FINAL ROUND never reaches it: its `CountDown` switches to GAME COMPLETE at 10 s (P:L14205), before its
  `WAIT 90` (P:L14207); GAME COMPLETE's 90 s runs from its own open. The last screen is held until the host moves on
  (a client's `ReplayMission` and `CloseAndSwitch` do nothing; 179 §6.18).
- **Built** (`ROUND_SCREEN_TIMEOUT_RETURN_READING`): `roundScreens.ts` `heldScreen` (which screen is up and since when,
  the last held) and `ROUND_SCREENS_AFTER_S` (the engine's read, 3 s, `FUN_002a9b30` D:L150631-150669, pinned equal to
  `netPage.ts`' private `ENGINE_READ_S` by a text read); `LobbyMatch` keeps the screens from the `roundOver` (or a
  welcome's standing result, `join.result.at`; a late joiner's hand-off welcome), clears them on a `roundStart`, the
  abandon, a welcome with no result and the return, and ends the match with the return `timeout` on `dlgNetError.rdr`
  -- `back` writes no errno for it. Counted only while the client `LobbyMatch` hears is open: no false timeout after a
  reconnect, but **after a page retry the 90 s never runs again for that match** (the retry's client is one `LobbyMatch`
  does not hear; a `NetClient` never reopens) -- the review's F1, filed with LATER 52 (was: "the match's own retry ...
  takes over"). A late joiner's screens are timed from the room's result, not from its own screen open after the load
  (the review's F2; the original's `TimeoutMonitor` starts at the console's ONSTART) -- a residual, ONL-32 settles it.
  `netPage.ts` and `frontEnd.ts` unchanged.
- **Pinned by tests**: ROUND COMPLETE held by a silent room -- up at 89.9 s, at 90 s `dlgNetError.rdr`, the client
  closed, the hold let go, the valve as it was (0, and a leftover 32); GAME COMPLETE the same from its own open; a
  `roundStart` or the return at 89 s ends nothing; on the disc, errno 0 lands on `dlgWorldOfSOCOM.rdr` with no button
  and a leftover 32 shows MAIN MENU, CROSS -> REBOOT (`dlgAfterErrorReboot.rdr`).
- **Left**: the page's drawing of the held last screen (LATER 52, §9); H105's row is closed by the merge controller at
  the landing (W19.R11).

## 11. VERSION-ABORT's run (2026-10-14)

Sprint 19's second half, the row VERSION-ABORT (E3). Reading, pending review; the evidence is unit and dev-disc tests
(`packages/ui/test/screens/gameLobbyScreen.test.ts`, `packages/central/test/room.test.ts`), no capture. ONL-32's
transcript of two consoles of different versions, if a pair exists, is the proven level.

- **Re-read at the source, agreeing with §3.6.** `FUN_002c0850` (D:L163253) takes the version field's update: the
  expected value 0x47 (D:L163321), 0x817 when `DAT_00437dd4` is 1 or 2 (D:L163322-163324); a peer's field at +0x14 that
  differs posts MP_VERSION_NUMBER_ERROR (S:0x3f28c0) through `DAT_0044f3c8` -- the current dialog's event, as the eject's
  (D:L163325-163326). This note's "D:L163322-163326" starts one line after the expected value is set; the same lines.
  The GAME LOBBY's `version_failure_2` is SWITCHMENU(dlgNetAbort.rdr) (P:L6622, P:L7699-7700); `dlgNetAbort.rdr` leaves
  the game, waits 3 s and returns to SOCOM II ONLINE (P:L12342-12372). No `FUN_002f4090` on this path: no errno.
- **What it adds: the BRIEFING ROOM binds the same event** -- `version_failure_1`, SWITCHMENU(dlgNetAbort.rdr)
  (P:L4097, P:L4418-4419) -- and `dlgLoad.rdr` its `exit_load_screen` (P:L8223). The event goes to whichever dialog is
  current, so the page posts it as it posts the eject (MP_EJECT_SPECTATOR), before the lobby's own test: a hello refused
  for its version during the BRIEFING ROOM's join lands on `dlgNetAbort.rdr` too, where before it waited out the join
  (#427). Not a different reading of §3.6, which names the GAME LOBBY only; `dlgLoad.rdr`'s case is not built (the load
  and the match are viewer `LobbyMatch`'s, outside this row's files).
- **Built** (`VERSION_REFUSAL_ABORT_READING`): `seatEnded` posts MP_VERSION_NUMBER_ERROR for a refusal `isVersionRefusal`
  accepts and writes no `mp_net_errno`; every other refusal is as before (the three Game Signal texts MP_EJECT_SPECTATOR;
  any other text in the lobby errno 32 and #365). The refusal's text, "protocol N, this server speaks M", is one spelling
  in ui `gameLobbyCommands.ts` beside the page's other refusal texts (`versionRefusalText`, matched by
  `isVersionRefusal`); server `room.ts` `hello` sends it from there (`@s2u/ui`, which the server already loads through
  viewer `victoryData.ts`'s `fadd`), its own spelling removed. The other refusals stay twins pinned by tests
  (`TOO_MANY_SPECTATORS` and `TOO_MANY_SPECTATORS_TEXT`, viewer `gameLobbyHost.test.ts`), unchanged here.
- **Pinned by tests**: in the GAME LOBBY, the refusal -> `version_failure_2`'s one SWITCHMENU, no popup; `dlgNetAbort.rdr`
  still up 2.9 s after its ONSTART and `dlgWorldOfSOCOM.rdr` at 3 s (90 ticks); its DisconnectFromGameServer (the socket
  closed, the game left, the lobby's state 11); `mp_net_errno` unchanged from its starting value -- absent, and a
  leftover 32 (§3.5), which no longer REBOOTs this way out; a "The game is full." refusal still errno 32 and #365. In the
  BRIEFING ROOM's join (no welcome yet): `version_failure_1`'s SWITCHMENU, `dlgNetAbort.rdr`, then `dlgWorldOfSOCOM.rdr`,
  the valve absent throughout. The room's refusal equals `versionRefusalText(9, PROTOCOL_VERSION)`, and a text read of
  `room.ts` finds no spelling of it there.

## 12. NU-17's run (2026-10-15): the abandon's scope, from the owner's three-seat game

The next-update checklist's row NU-17 (the owner's batch 2): a three-seat game with a late joiner ended on
`dlgNetAbandoned.rdr` (4007) for both seated pages. Reading, pending review; the evidence is the owner's server log
(outside the tree, routes, statuses and times only), source inspection and the server tests in
`packages/central/test/bridge.test.ts` (real sockets, the fixtures' MP2), no capture. ONL-32's capture B is the proven level.

- **What the log shows** (times UTC, 2026-10-15). One match, serial 1, from 00:21:30Z with two players; the third seat
  (the late joiner) joined at 00:27:44Z, during the match's third round. The room's round results came at 00:24:10,
  00:26:31, 00:30:33, 00:33:37 and 00:37:10. At 00:38:30.407 the late joiner's socket closed (`left`); 1 ms later the
  game ended (`game ended`: the bridge's below three); the other two seats left at .413 and .425 (4007), and the room
  reported a round emptied by a leave (.417, `reportEmptied`, whose phase is `play` or `decided`). So the **match was
  in a round in play, about 72 s into its sixth round** (the fifth's result at 00:37:10 plus its 8 s of screens), not
  at its end or its return: the row's "at its return" is the page-side reading of what followed.
- **Who closed the late joiner's socket** -- narrowed, not settled. Not the room: its kicks (the idle kick, the vote, a
  watcher's idle) leave the seat before they close it (`Room.idle`, `Room.leave` -> `drop`), and a socket the room has
  left logs no `left` (server `server.ts`, the close handler's `connOf` test); a `left` was logged. Not the bridge: its
  4007 / 4008 closes come after a leave or a lobby event, and none preceded it. Not a lapsed session: every lobby request
  is a use (`AccountService.sessionOf`) and the three pages polled the lobby until .401, with no answer other than 200 in
  the whole log. So the close was the late joiner's page's own, or a transport drop. The page then ran a net end
  dialog: three `leave-game` (the dialogs' `DisconnectFromGameServer`, `GAME_LEAVE_ADAPTATION`) at .517, .607 and .609,
  the first 110 ms after its close; and only **two** pages entered WORLD OF SOCOM (00:38:34.27 and .31, the two 4007
  pages through `dlgNetAbandoned.rdr`, which switches at once). The third stayed until a fresh login at 00:42:44 -- what
  `dlgNetError.rdr`'s errno-32 branch does (the popup with MAIN MENU, then REBOOT; P:L12277-12285). The page paths that
  close an open match socket and open a dialog are ROUND-90's `timeout` (no errno written: SOCOM II ONLINE unless a 32
  was left PERM, §3.5), ABORT (`dlgNetAbort.rdr`, 3 s, SOCOM II ONLINE) and `NetPage.endGame` on the room's own events
  (each of which the room sends with a close of its own, excluded above). None of them, as the code reads, closes a
  late joiner's socket ~80 s after a round's result while the next round runs: ROUND-90's screens are cleared by the
  next `roundStart` (`LobbyMatch.event`), and the hand-off passes a `roundOver` only when it is newer than the round
  handed on (`GameSocketHost.handOff`). The page's own close is **LATER 62** (an instrument: the page's return `why` and
  close code posted to the server in a development build, or the owner's repeat with the console open). The instrument is
  built (2026-10-21, `CLOSE_REPORT_ADAPTATION`): a development page with ?devmode posts each non-`match-over` return's
  `why`, its `LobbyMatch` call site and its socket's state and close code to `/dev/close-report`, which the server
  (`CLOSE_REPORT=1`) and a placed game's door take against a close heard from that seat at that address, logging one
  `close report` line; which path closed the page's socket waits for a run with it on.
- **The original's rule** (re-read at the source). `FUN_002bc530` (D:L161109-161146), the game's leave handler on every
  console: for another console's leave it clears the leaver's slot and counts the occupied slots (D:L161119-161132);
  then, with the game object present (D:L161133), **+0xcc clear: `FUN_002c00f0` only** -- the game's record refreshed
  (D:L161134-161135) -- and **+0xcc set: the count test, then `FUN_002a47b0(0x4364e0, "dlgNetAbandoned.rdr")`**
  (D:L161137-161141; S:0x3f2780). +0xcc is written only by `FUN_002a7340` (D:L149273-149290, the `late_joiner` valve's
  setter, research 314 §4.2) and cleared by the load state at D:L55711 and D:L55715-55716, inside its branch for a
  console whose load is done (D:L55678; the done flag set at D:L55657-55659). So a seated console -- a player in the
  launch, or a late joiner past its load -- never shows #528 for a leave; only a late joiner still in its lobby or its
  load does, which #528's words say ("All players left the game before you were able to join"). The load state's own
  #528 (D:L55731-55745) is the late joiner's too. **A game at its end is no exception and needs none**: a seated
  console is not abandoned by a leave at any point of the match, GAME COMPLETE's return included.
- **Built** (`ABANDON_LATE_JOINER_READING`, server `bridge.ts`): each seat of a game carries `late` -- set when it is
  seated in a launched game (a takeover keeps the older socket's), cleared by the page's `loaded` (sent when its assets
  are in, `CLIENT_ROUND_WAIT_READING`: the load state's done) and when the game is back in its lobby (`onMatchReturn`,
  the side-empty `reopen`). A launched game still ends when its last seat goes; a player's leave that leaves fewer than
  `ABANDON_BELOW_PLAYERS_READING` players now closes (4007) only the late seats -- the GAME LOBBY page's `seatEnded`
  and the load's `LobbyMatch` already turn 4007 into `dlgNetAbandoned.rdr` and #528 -- and the seated play on, told the
  game as it stands (`report`, `tell`: `FUN_002c00f0`'s refresh). In the owner's game the two seated pages would have
  played the match on, 1v1, and returned to the GAME LOBBY (ONL-20b).
- **Not changed** (flagged, as §3.3 and §6 have it): the room's side-empty abandon and the bridge's `onAbandon` below
  three (a classic round with a side emptied ends for everyone on #528, PF-27; what the original's round does with an
  empty side is unread, `CLASSIC_WAITING_PLACEHOLDER`, `ABANDONED_TO_LOBBY_PLACEHOLDER`); the count's operands
  (`ABANDON_BELOW_PLAYERS_READING`'s doc, research 159 §8); whether a spectator's leave runs the count (the bridge counts
  a player's leave only, as before). The page is unchanged.
- **Pinned by tests** (`bridge.test.ts`, "NU-17"): a 1v1 launched, a late player joining as a ghost, played to its end
  -- all three pages back in the GAME LOBBY, none closed (green before the change: the acceptance's pin); the late
  joiner's leave mid-match -- the seated two play on and return (was: both closed 4007); a 2v1 whose SEAL leaves during
  GAME COMPLETE -- the others return (was: 4007); a leave to two players with a late watcher still in its lobby (no
  `loaded`) and one loaded -- the first closed 4007, the second and the seated play on. B2 (a 2v1 losing one) and
  ONL-18b's last step re-pinned to the reading (were: the game ended below three).

### 12.1 NU-17-LOWS' read (2026-10-16): every writer of +0xcc, and network message 4

LATER 64 and 65 (NU-17's review, lows 1 and 4). **Reading, pending review**: source inspection of the decompilation
(`D:L<n>`, `FUN_<addr>`, cited, never pasted) and the ELF's strings (`S:0x<addr>`), beside research 203 §5 (the Game
Signal's codes, named from the SOCOM 1 demo's enums) and 314 §4.2 (+0x114 `mp_major_game_state`, +0x115 the minor,
`ReadyToLoad`); the pins are server tests (`bridge.test.ts`, "LATER 65", three cases, real sockets on the fixtures' MP2).
No capture; ONL-32's capture B is still the proven level. This entry corrects one sentence of §12 above ("+0xcc is
written only by `FUN_002a7340` ... cleared by the load state at D:L55711 and D:L55715-55716, inside its branch for a
console whose load is done"): the flag has eight writers, and D:L55711 is not the load's ordinary clear but the branch
for a late console whose host returned to its lobby during the load, when +0x112 still reads 3 at the load's end (W5
below). §12's other findings stand.

**How the list was made.** The game object is the word `DAT_00437ce8`, the same as `*(0x4364e0 + 0x1808)` that the
record's init and reset take (0x4364e0 + 0x1808 = 0x437ce8; the 0x14c-byte record made at D:L152590-152602). Every store
in the decompilation at byte +0xcc, at int index 0x33, or at `undefined4 *` + 0x33 was listed and kept where the pointer
is that record; the other records' +0xcc stores (`FUN_0027f250` D:L126952, `FUN_002d6c40`, `FUN_0030e290`,
`FUN_002f1980` and its neighbours, and the rest of the scan) are other objects. No `memcpy` over the record and no store
through a wider type covering +0xcc was found in the functions that hold it.

| | writer | writes | when, in a late joiner's life |
|---|---|---|---|
| W1 | `FUN_002a76d0` D:L149572 (the record's init) | 0, with the `late_joiner` valve (S:0x3f10f8) made at +0x2c and zeroed around it (D:L149565-149577) | once at start-up (`FUN_002ad290` D:L152600, from `FUN_001e7430` D:L47893 in the main thread's start `FUN_001e7040`) and at every `ConnectToGameServer` (`FUN_0027e4c0` D:L126462; LAN `FUN_0027e540` D:L126489; both through `FUN_002a9f00` D:L150860): a join starts clear |
| W2 | `FUN_002b9150` D:L159264 (through `FUN_002a7340`) | 0 | the host's answer to the join, the Game Signal (S:0x3f2468), with +0xc -- the host's `mp_major_game_state` (+0x114, D:L161248, D:L161452) -- below 2: a game in its lobby. A refusal (+0xd 4) zeroes +0xc first (D:L159229) and comes here too |
| W3 | `FUN_002b9150` D:L159282 | **1** | the same answer with +0xc 2 or more and not 13 or 14 (203 §5: LOADING .. GAMEOVER, PLAY): a join of a launched game. With it the console's told state +0x113 and its major state +0x114 are written 1 (D:L159302-159303), so the late joiner waits in its lobby at major 1; the host marks the slot 0x40 in `DAT_00441580` when its own +0x113 is 2 or more at the join, 0x80 otherwise (D:L161460-161471) |
| W4 | `FUN_002bbfa0` D:L160946 -- **network message 4** | 0 (only if set, D:L160945) | message 4 is the game's own net-event queue (`FUN_0030d870` posts, `FUN_0030d7d0` D:L210136-210157 drains into `FUN_002bbfa0`). Its one poster is `FUN_002b9150` D:L159247-159248 (message 5 after it, D:L159249-159250) on the Game Signal 13 (GAMELOBBY), and only with +0xcc set (D:L159234) and the console's own major state 1 (D:L159235): a late console still in its lobby, READY never pressed (`ReadyToLoad`'s late branch writes major 2, 314 §4.2). Signal 13's one sender is the host's `SetMenuState` (UI command 29, `FUN_0027c9f0`): to every slot marked 0x40 (D:L125578-125586), which the host's GAME LOBBY runs at its entry and at each return (203 §5; research 170). Message 4 runs `FUN_002b83e0` (D:L160944: the console joins the game's session, D:L158829-158880) and then clears the flag |
| W5 | `FUN_001f5e70` D:L55711 | 0 | the load state's done branch (D:L55678) with +0x112 3 and the flag set (D:L55710). +0x112 3 is written by that same signal 13 to a late console that is no longer at major 1 -- READY pressed, its load running (D:L159252-159253) -- and W5 then sends the load to `dlgNetError.rdr` (S:0x3e2f60, D:L55712-55713). But +0x112 has two more writers on that console (the review's F1, re-read at the source): the record receiver `FUN_002c0850` (registered at D:L163593) copies the master's +0x112 on each record update in the block opened at D:L163333 (D:L163415-163416), and the master publishes its own, which its online tick `FUN_002aa490` resets to 1 (D:L151123-151126; the record built at `FUN_002c00f0` D:L163083). An update between signal 13 and the load's end makes D:L55710 fail and W6 run instead -- with the told state 1, `dlgNetAbandoned.rdr` (D:L55735-55740). **Which dialog the load ends on is unread**: both readings stand until a capture -- the page models the condition (LATER 238, §14) |
| W6 | `FUN_001f5e70` D:L55716 | 0 | the same branch otherwise: the late console's load is done with no return seen -- +0xcd 1 and `FUN_002b83e0` (the session joined, D:L55717-55718), the ghost flag +0xd2 for a non-spectator (D:L55725-55727); a told state 6 or 1 found then still switches to `dlgNetAbandoned.rdr` (D:L55731-55740) |
| W7 | `FUN_002a9ef0` D:L150832 (the record's reset) | 0 | `DisconnectFromGameServer` (`FUN_0027e420` D:L126445) and a failed connect (`FUN_0027e4c0` D:L126466, `FUN_0027e540` D:L126494): the console leaving any game |
| W8 | `FUN_002a75f0` D:L149462 | 0 | the same field reset as W7 on a record passed in; no caller in the decompilation (an indirect call or unused), so placed nowhere in the life |

`FUN_002a7340` (D:L149273-149290) is the setter W2-W6 call -- the byte and the valve together; W1, W7 and W8 store the
byte directly. The readers, for the life: `JoinGameServer` (`FUN_0027e380` D:L126414-126416) joins the session at once
only for a console not late (a late one joins it at W4 or W6); `ReadyToLoad` (`FUN_0027caf0` D:L125606-125608) takes the
late branch; `FUN_002bc530` (D:L161133-161141) abandons on the count only with the flag set; the load state reads it at
D:L55680, D:L55705, D:L55710, D:L55715.

**A late joiner's life, in order.** `ConnectToGameServer` (W1: clear) -> the host's answer (W3: set; the host marks it
late) -> `JoinGameServer` (no session yet) -> the GAME LOBBY's `SetupLateJoiner` (#352 / #353) -> either **READY**: major
2, the load, and at its end W6 (clear) -- or, if the host returned meanwhile, W5 (`dlgNetError.rdr`) or W6 with the told
state 1 (`dlgNetAbandoned.rdr`), which of the two unread (W5's row) -- or **never READY**:
the flag kept through the whole match, until the host re-enters its GAME LOBBY and its signal 13 releases the console
(W4: clear, the session joined, a seated console of the lobby) -> any leave (W7).

**Message 4 and LATER 64's question.** Message 4 never runs during the match: its only poster is signal 13, which only
the host's GAME LOBBY sends, and only to a late console that never pressed READY. So it cannot clear +0xcc before a late
console's load in a running game; through the match a late console in its lobby or its load keeps the flag, and a leave
below three shows it #528 (`FUN_002bc530`) -- as the bridge closes it 4007. The possible gap LATER 64 names does not
exist.

**The bridge's `late` (server `bridge.ts` `SeatEntry.late`) against the list:**
- *the set* (a seat seated into a launched game, `live.pre.launched`): W3 -- the host's major state 2 or more, from its
  launch through GAME COMPLETE to its return. Matches at this level; the instant between the host's launch and the
  port's `launchedNow` (the load hold) is not compared.
- *`loaded`*: W6. Matches.
- *the match's return* (`onMatchReturn`): W4 for a late seat that never pressed READY -- matches (pinned: LATER 65, the
  first case). **Departs** for a late seat that pressed READY and is still loading at the return: the original keeps
  +0xcc until that load's end (signal 13 only writes +0x112 3), cleared there by W5 or W6 and the console sent to
  `dlgNetError.rdr` or `dlgNetAbandoned.rdr` (which, unread: W5's row); the bridge clears
  `late` at the return. **The scenario:** a 2v1 with a late watcher who presses READY late in the last round, so its
  load still runs when GAME COMPLETE returns the room to its lobby; a player leaves (three to two) before the load ends.
  The original shows that console #528 at once (`FUN_002bc530`, the flag still set); had nobody left, its load's end
  would show `dlgNetError.rdr` or `dlgNetAbandoned.rdr` (unread, above) -- the departure stands either way, as +0xcc
  stays set until W5 or W6. The bridge does not close it (4007); what its page then does (a late seat handed off on
  READY whose game returns during its load: viewer `lobbyMatch.ts`) is not read here. The window is the load's length.
  The server cannot tell this seat from a never-READY one: `ReadyToLoad`'s late branch sends nothing (314 §4.2,
  `READY_LOADS_LATE_JOINER_READING`), so no `bridge.ts`-only change can follow W5 -- the page would have to tell its
  load's start (a wire change), after a read of the page's own path. **Closed by LATER 64 (2026-10-21; reading, pending
  review):** the page tells it (`lateLoad`, additive: the room ignores it; sent at `LobbyMatch.start` for a late seat's
  hand-off, its READY), the bridge keeps `late` across the return and the reopen for that seat until its `loaded`
  (`SeatEntry.loading`), and its below-three abandon reaches a late seat outside a launch -- the late console's own
  leave handler counts whatever the host's state (`FUN_002bc530`). Pinned: `bridge.test.ts`, "LATER 64", two cases. The
  page's own end of that load (W5 or W6, never the lobby) is LATER 238 (built, §14).
- *the side-empty reopen* (`onAbandon` with three or more left): the same reading as the return -- the host back in its
  lobby, `SetMenuState`, signal 13 -- with the reopen's own trigger unread (`ABANDONED_TO_LOBBY_PLACEHOLDER`); matches for
  a never-READY late seat (pinned: the second case), the same departure for a loading one.
- *a takeover* (a reload of the same account; the original has none, so a port adaptation): the new socket keeps the
  older's flag -- nothing in the original resets +0xcc for a console short of W7, its leave. Matches by construction
  (pinned both ways: a loaded seat reloaded stays seated, a late watcher reloaded stays late).
- *the 4007 close* (a player's leave, launched, fewer than `ABANDON_BELOW_PLAYERS_READING`, the late seats only):
  `FUN_002bc530` under +0xcc, unchanged from §12 with its open operands (`ABANDON_BELOW_PLAYERS_READING`, whether a
  spectator's leave counts).
- Not read: a host migration mid-match (`FUN_002bc080`, message 2) and the 0x40 marks -- signal 13 comes from the
  master's own table, and a console that becomes master re-runs the join answer for the joins it has recorded
  (`FUN_002b83e0` D:L158862-158875; `FUN_002bc080` D:L161022-161033), but whether a migrated master marks and releases a late console is not read; the
  bridge hands no launched game on, so no port path reaches it.

**Pinned** (server `bridge.test.ts`, "LATER 65"; each reads the bridge's own flag before and after, so none passes on a
seat that was never late; all three passed at once -- they pin today's behaviour): a late watcher never READY nor
loaded, played to the return, then the next match's below-three leave -- not closed (the return's clear); the side-empty
reopen, then the next match's below-three leave -- not closed (the reopen's clear); a takeover of a loaded seat and of a
late watcher, then a below-three leave -- the first not closed, the second closed 4007 (the carry). Each places the leave
in the next launched match because the bridge's below three is a launched game's: a leave in the reopened lobby itself
could not tell a kept flag from a cleared one.

**Owed:** the departure above, for the seat's word (a read of the page's path first; a wire change). *The `bridge.ts`
docs named here at first were brought up to this list at 61a5ae7cd.*

## 13. AD-12's run (2026-10-17): the last screen held, the retry's 90 s, the late joiner's clock

Web sprint 40's AD-12 (the reconciliation's claims C07, C08, C09; LATER 52; §10's two gaps, ROUND-90's review F1 and F2).
**Reading, pending review**: source inspection of the decompilation (`D:L<n>`, `FUN_<addr>`, cited, never pasted) and the
pinned scripts (`P:L<n>`); the evidence is unit tests (`packages/viewer/test/lobbyMatch.test.ts`,
`packages/viewer/test/netPageHeldScreen.test.ts`), no capture. ONL-32's captures of a round screen held 90 s and of a
late joiner loading in during the screens are the proven level.

**Re-read at the source** (each cite the claims build on; agreed unless said):
- *C07.* `FUN_00280040` (`ReplayMission`, D:L127379-127395): offline it pops the game state (D:L127387-127388); online
  only the session master (`DAT_0045a0c0`) writes game state 5 and re-sends the game object (D:L127390-127392); a client
  does nothing -- agreed (research 115's row, 179 §6.18). `FUN_00281a70` (`CloseAndSwitch`, D:L128101-128133): the
  dialog's name copied into the menu state's start dialog on every console (D:L128114); online only the master moves
  (state 5 with +0xd4 clear, else the pop and the switch, then `FUN_002c00f0`, D:L128122-128131); a client nothing more --
  agreed (research 115 gives D:L128101-128135, the closing lines; the same function). On a client ROUND COMPLETE's
  `CountDown` ends on #2111 "GO" (P:L13741) and its `ExitOnStart` waits 5 s, then loops `ReplayMission` (P:L13751-13755),
  and GAME COMPLETE's client `CloseAndSwitch(dlgGameLobby.rdr)` (P:L14616, P:L14648) only names the dialog: the last screen
  stays, at GO, until the host's move reaches the console -- the next round's start, the return, or a way out.
- *C08.* The review's reading, at today's lines: `NetPage.retry` replaces the client (`netPage.ts` :846-847, `this.client
  = this.open()`; the brief's ~:809-813 is an older numbering), while `LobbyMatch.start` listened to the hand-off client
  only (`lobbyMatch.ts` :345 before this row) and `screenHeldOut` counted on it only (:404-408 before) -- agreed: after a
  retry the controller heard a closed client, so no 90 s ran and the room's returned view on the new socket went unheard
  by it. Nothing of the original to read: the retry is the port's (M9's reconnect; the original has none), the 90 s rule
  is ROUND-90's (§10).
- *C09.* Each screen's `TimeoutMonitor` starts at its ONSTART (P:L13474 ROUND COMPLETE, P:L13936 FINAL ROUND, P:L14371
  GAME COMPLETE) -- agreed with §10. What ONSTART is on a client, read here: the "Mission" task (`FUN_002aab00` ->
  `FUN_002aa490`, registered by the mission's set-up `FUN_002ac410`, D:L152101; the name S:0x3f1610) on a non-master
  (`DAT_0045a0c0` 0) whose told game state +0x113 is 4 or 6 runs `FUN_002a9b30` and pushes the exit state 0x4086c8 at once
  (D:L151127-151135); the master writes 4 or 6 only after its own 3.0 s read (`FUN_002a9b30`: +0xe4 = +0xe0 + 3.0 at
  D:L150631, the result and +0x113 at D:L150633-150666, the push D:L150670). The exit state (`CMPExitState`,
  `FUN_00223970`) opens ROUND COMPLETE, or FINAL ROUND for a game over (research 91 §2.4, §3). So a console in the match
  opens its screens when the host's state reaches it -- the port's `ROUND_SCREENS_AFTER_S` after the `roundOver`, as
  ROUND-90 built -- and a late console, which runs no Mission tick before its level, opens its **first** screen at its
  level's start after its load, its later screens from there. The brief's "research 315 :390" is §10's F2 sentence
  (now :407-408).

**Built** (viewer `lobbyMatch.ts` and, for C07, `netPage.ts`; `matchMount.ts` and `roundScreens.ts` unchanged):
- *C08.* `MatchHandle.net` -- the match's page, whose `client` is the one it holds now; `deferredMatch` forwards it, and
  `./matchMount`'s `MountedMatch.net` already answers its `NetPage`, so the mounted match gives it with no change there.
  `LobbyMatch.frame` follows it after the match's own frame (`follow`: the old client's listener let go, the new one's
  added), so the retried client's welcome (its standing result's open, `join.result.at`), `roundOver`, `roundStart`,
  `abandoned` and the room's returned view count as the hand-off client's did, and its state gates the count. The 90 s
  therefore runs on after a retry, the return (`match-over`, the retried client handed back to the lobby) and the abandon
  keep their own ways out. Where the follow runs (corrected by the review's F1): in the front end the page's frame --
  and its retry -- runs in the mount's own loop (`./matchMount`, its handle has no `frame`), not inside
  `LobbyMatch.frame`, so a follow at the controller's next frame can come after the room's first words on the new
  socket (`NetClient.on` replays nothing): a welcome into GAME COMPLETE missed leaves the game's end unheard and, with
  C07, GAME COMPLETE held. So the page tells its new client at the retry itself (`onClient`, which `LobbyMatch`
  subscribes to when the page has it; the `netPage.ts` side is drafted for the gameplay seat), and the frame's follow
  stays for a page without it. (Was: "opened inside the match's frame and followed at that frame's end, before any
  word of the room's on its socket can arrive" -- true of the tests' handle, not of the front end's mount.)
- *C09.* `LATE_SCREENS_OPEN_READING`: the screens' open on this console is the later of the room's
  (`ROUND_SCREENS_AFTER_S` after the `roundOver`, or a welcome's standing result) and the match shown (`LobbyMatch.begin`,
  the load released -- the level's start); the room's list runs from there, so a late console in GAME COMPLETE times its
  own FINAL ROUND's 10 s, then GAME COMPLETE's 90 s. A page in the match before the result, and a page's retry (its match
  shown long before), keep the room's open. The ordinary round clock (LATER 25's complaint, closed by LATE-WATCH) is not
  touched.
- *C07.* `netPage.ts` `roundScreen()` holds the last screen past the room's seconds -- `secondsLeft` 0 (GO), its
  `elapsed` running on -- until the room moves on: `roundStart` and `abandoned` clear the page's screens, a rejoin's
  welcome sets them again, the return lets the page go (`NetPage.release`); a replay holds too, until the record's
  `roundStart`, `abandoned` or rejoin. Unconditional (the merge controller's ruling, option B; the hunk cleared by the
  gameplay seat): a draft that held for a game's page only, to keep RE-3's digest, was set aside. RE-3's digest
  (`netPageClock.test.ts`) moves for it -- its 'screens done' and 'score, no clock' reads, 0.5 s after ROUND COMPLETE's
  5 s with no `roundStart` yet, draw ROUND COMPLETE at GO (`screenUp` true, two `performance.now` reads more each --
  the frame's `setRoundScreen` and the read's `screenUp()`, each for TIME PLAYED) where they drew null; nothing else in its sequence moves -- and is re-pinned:
  0dc8bbe8fbc0d6b89ff6c8d82c46d91a82f04b83c5f92412aded48c3f5d2a4dd (7397c20ed) ->
  e88ad2b289689050a1f04fcab26202c5766f4ba9d4187a1b3d56de816da1e365. Its replay-clock cases are unchanged.

**Pinned by tests**: the retried client's welcome into the standing result -- up at 89.9 s, at 90 s `timeout` on
`dlgNetError.rdr`, no errno, the retried client closed (`lobbyMatch.test.ts`, and through a real `NetPage`'s retry on a
new socket, `netPageHeldScreen.test.ts`); a round started and ended on the retried client, timed from its own open; the
room's returned view on the retried client -- `match-over`, the retried client handed back open; its abandon -- no
timeout; a late hello in ROUND COMPLETE with a minute's load -- nothing at the room's open + 90 s, the timeout 90 s after
the match shown; a late hello in GAME COMPLETE with a 30 s load -- the timeout 100 s after the match shown. Two earlier
cases moved with C09 (their scenarios had the result older than the match shown): N1 (was: the timeout from round 2's
`roundOver` arrival, 143 s; now 90 s after the match shown, ~60.5 s) and "a welcome again during the screens" (its page
now in the match 20 s before the result, so the result's open stands). C07 (`netPageHeldScreen.test.ts`): ROUND COMPLETE
held at GO past its 5 s until the `roundStart`; GAME COMPLETE held past its 10 s until the release; the abandon letting
it go; a rejoin's welcome into a result older than its screens; and in `netPageClock.test.ts`, beside the hash, the
held ROUND COMPLETE at 'screens done' and the match's end up to the abandon.

**Left**: the page draws a late console's screens at the room's age (`./netPage` `roundScreen`, `join.result.at`), where
the original's late console would open its own first screen at its level start (above) -- drawn GAME COMPLETE where it
would show FINAL ROUND first; not this row's (the brief's C09 is the timeout's clock), filed as LATER 74 (the review's F3). LATER 52
is struck by AD-12 (C07 and C08).

## 14. LATER 238's run (2026-10-21): a late console's load ended by its host's return

**Reading, pending review**: source inspection of the decompilation (`D:L<n>`, `FUN_<addr>`, cited, never pasted), on
§12.1's W5 / W6 (themselves reading, pending review); the pins are unit tests (`lobbyMatch.test.ts`, "LATER 238",
three cases, a real `GameSocketHost` over a fake socket). No capture; no browser run.

**What the original does** (§12.1, re-read for this run at `FUN_001f5e70` D:L55677-55745). The load state's done branch
opens on its own load done (D:L55678, `param_2` +0xd) -- no host barrier in it -- so a late console's load ends at its
own pace whatever its host does meanwhile. A late console (+0xcc set) READY and loading when its host returned to its
GAME LOBBY holds the return signal's +0x112 3 (signal 13, D:L159252-159253). At its load's end: +0x112 still 3 -> W5,
the flag cleared and the start dialog `dlgNetError.rdr` written (D:L55710-55713) with no call to `FUN_002f4090`, so no
errno; +0x112 set back to 1 by a record update first (the receiver `FUN_002c0850` D:L163415-163416 copying the master's,
which its online tick `FUN_002aa490` resets to 1, D:L151123-151126) -> W6, the session joined (D:L55715-55718) and,
with the told state 1, `dlgNetAbandoned.rdr` (D:L55731-55740). Never the game's lobby.

**The call** (the merge controller's, 2026-10-21, a choice between readings; logged in LATER 238's row): the original
decides at run time, so neither dialog is picked -- the page models the condition, and our central's own publishing
decides it as the original's master did. `LATE_RETURN_RECORD_UPDATE_READING` names what counts as the update: any
`gameLobby` view the room sends after its returned view (central `bridge.ts` `tell`, and the placed game's match
`game.ts` `tell`, at each change of the game's lobby -- a seat's arrival or leave, a team, a READY, the countdown -- and
at another seat's refused request, the view then unchanged: the review's F3).

**Built** (viewer `lobbyMatch.ts`): the returned view reaching a late page's load (`LobbyMatch.event`, the hand-off's
`lateJoiner`) no longer calls `matchOver` -- the page stays on its loading screen and notes the return
(`returnedInLoad`), and every later `gameLobby` view marks it updated. At its load's end (`frame`: the assets in; a
failed load, the page's own with no original, ends there too) it closes its socket and leaves on `dlgNetError.rdr` with
the return `late-return` (no errno written, as ROUND-90's `timeout`) or, updated, on `dlgNetAbandoned.rdr` (`abandoned`,
as a 4007). No `loaded` is sent and no match starts; the server's kept `late && loading` (LATER 64, `SeatEntry.loading`)
ends with the socket's close. A page whose assets were in before the return had ended its load first (the review's
F1): W5 needs +0x112 still 3 at the done branch, so the return before the load's end; a load done before it ran W6
then, and with the told state 6 (GAME COMPLETE) or 1 (its join's, D:L159302-159303) left for `dlgNetAbandoned.rdr`
(D:L55731-55740) -- so that page leaves on `dlgNetAbandoned.rdr` at its next frame, the original's dialog at the
return rather than at its load's end (that moment, and the port's release of a late joiner into GAME COMPLETE's
screens, are LATER 241). A close for good or the room's `abandoned` during that wait keeps its own path (checked
first, as before).

**Restated**: `LATE_JOINER_RETURN_FROM_LOADING_READING` now covers a page **not late** still loading at the return (a
seated console past the room's load ceiling): it leaves for the lobby as before; the done branch for a console whose
+0xcc is clear (D:L55680-55687, D:L55704-55709, the +0xcd block D:L55730-55745) against the host's return stays unread
(research 309 §8).

**Pinned** (`lobbyMatch.test.ts`, RED first: all three failed with the page back in the lobby, `match-over`): W5 --
the return, the load still running a second later, then the assets: `dlgNetError.rdr`, `late-return`, errno 0, no
`loaded`, the socket closed 1000, the hold let go, no match; W6 -- one more view after the return: `dlgNetAbandoned.rdr`,
`abandoned`; and, the review's F1, with the assets in before the return, `dlgNetAbandoned.rdr` at the next frame
with a later view or none. The case for a page not late ("ONL-20b (review)", its title now saying so: the review's
F4) is unchanged. The review (PASS WITH FINDINGS) re-read W5, W6, the receiver, the reset and the not-late lines at
the source.

**Left**: the master's publishing cadence against the room's -- the tick behind the cited reset is a mission-life
task (registered at D:L152101 from the mission's load, `FUN_001ea720` D:L49730; removed by `FUN_002ab3f0`
D:L151636), and in its lobby the master publishes at its UI commands (`FUN_002c00f0` at SetMenuState, D:L125577, just
before signal 13), which fits the page's next lobby change better than a tick (the review's note); a relaunch's view
during the load (W6 with the told state 2..5 would take the console into the new launch; the page takes it as an
update); W6's two other operands (the review's F2): +0xb0 at least 0 (D:L55732-55733; negative, no dialog and the load
holds; +0xb0 unread, `LOAD_NET_HOLD_READING`) and the session's join succeeding (`FUN_002b83e0`, D:L55718-55721;
failed, `dlgNetError.rdr`; the port's central joins every seat): all in the reading's row (§7), for ONL-32's capture.
And **LATER 241** (the review's F1, the merge controller's number): a late load that ends while the host's told state
is 6 (GAME COMPLETE) or 1 goes to `dlgNetAbandoned.rdr` at that moment (D:L55731-55740), where the port releases the
late joiner into GAME COMPLETE's screens (its welcome's phase `over` passes the barrier, LOAD-HOLD) or holds it to the
return -- built, §15.

## 15. LATER 241's run (2026-10-21): a late load ending in the game over

**Reading, pending review**: source inspection of the decompilation (`D:L<n>`, `FUN_<addr>`, cited, never pasted); the
pins are unit tests (`lobbyMatch.test.ts`, "LATER 241", three cases, and two older pins re-pinned). No capture; no
browser run.

**What the original does.** The host writes its told state +0x113 4 (a round's result) or 6 (the game over) 3.0 s after
the result: `FUN_002a9b30` sets its +0xe4 3.0 s ahead (D:L150631) and at its passing reads the result and writes 4, or
6 at the match's end (D:L150633-150666; research 203 §5 names 6 the game over). A late console (+0xcc set) whose load
ends with no return signal runs the load state's W6 (`FUN_001f5e70` D:L55715-55718: the flag cleared, the session
joined), then, with the told state 6 or 1 and +0xb0 at least 0 (D:L55732-55733; +0xb0 unread, §14, the review's F2),
writes `dlgNetAbandoned.rdr` at once (D:L55731-55740) -- never the level. At any other told state (3 in play, 4 a round's
result) it goes on into the level. That test sits inside the block that runs on every frame while the load is done
(D:L55678-55747), and the 0.5 s load-out fade runs only after it (D:L55748-55755), so a 6 that comes during the fade
still abandons (the review's F1).

**Built** (viewer `lobbyMatch.ts`, the merge controller's design, 2026-10-21): the page's clock for the told 6 is the
screens' open it already keeps -- `ROUND_SCREENS_AFTER_S` (3 s, the same read) after a `roundOver` with `matchOver`, or a
late welcome's standing result (`welcomeScreens`) -- and its load's end the assets' arrival (`assetsAt`, the controller's
clock, as LATER 238 takes it). A late page (`lateJoiner`) still loading when that open comes, its assets in no more
than the 0.5 s fade (`LOAD_STATE_FADE_SECONDS`) before it -- the game over reaching its load's end or its fade -- ends at
once on `dlgNetAbandoned.rdr` (`abandoned`, as a 4007; the close report's path `late-load-game-over`): no match, no
`loaded`, no errno. One whose fade ended before it (the told state still 3) enters as before, and nothing ends it at the
6; a round's result (the told 4) enters. The assets' time and the fade decide, not a barrier's hold: a page held for the
barrier with its assets in long before the 6 is not abandoned (the original's console had entered).

**Two pins the original's code overturns** (re-pinned, not weakened): `lobbyMatch.test.ts` "N1: round 2 ended the
match in the lobby" (was: GAME COMPLETE's screens, then the room's return the match's end; READY 10 s into round 2's
GAME COMPLETE, so the load ends after its 6) and AD-12's "C09: a late hello in GAME COMPLETE, a load of 30 s" (was:
this console's own FINAL ROUND first, the timeout 100 s after the match shown). Both now end on `dlgNetAbandoned.rdr` at
the load's end. C09's own claim -- the screens from this console's level start -- stays held by its ROUND COMPLETE case
(a load ending at the told 4). "F-1: a late hello in GAME COMPLETE … READY before anything newer" stands: its load ends
in the 3 s window (its assets at once), so it enters and the room's return ends its match.

**Restated**: `LATE_SCREENS_OPEN_READING` -- a load completing at the told 6 opens no screen (this run); one
completing at 4 opening ROUND COMPLETE at its level start stays unread.

**Pinned** (RED first: the abandon and the heard-roundOver case failed with the page in the match): a late hello in
GAME COMPLETE whose load ends after the 6 -- `dlgNetAbandoned.rdr`, no match, no `loaded`, errno 0, the socket closed
1000, the close report's path; a load ended in the 3 s window enters, nothing at the 6 (passing before the change, a
guard); a `roundOver` heard during the load -- `matchOver`, the abandon; a round's result, the match; and the review's
F1, the fade: assets 0.3 s before the 6, the abandon in the fade; 1 s before, entered before the 6, nothing at it.

The review (PASS WITH FINDINGS) re-read `FUN_002a9b30`'s 3.0 s and W6 at the told 6 at the source; its F1 (the fade
window, about 0.5 s, unnamed and unpinned) is built and pinned above, its F2 (+0xb0) named.

**Left**: +0xb0 (W6's other operand, §14); the told 1 at a late load's end outside a return (the console's own +0x113 from its join, D:L159302-159303,
before any record update): the port's welcome and the room's events stand in for those updates, so no such case is
modelled; and the instant of the told 6 is the page's screens' open, not a told state on the wire.

## 16. LATER 74's run (2026-10-21): a late joiner's round screen drawn from its own start

**Reading, pending review**: source inspection of the decompilation (`D:L<n>`, `FUN_<addr>`, cited, never pasted); the
pins are unit tests (`netPageHeldScreen.test.ts`, "LATER 74", three cases and one re-pinned). No capture; no browser
run.

**What the original does.** A client's Mission tick (`FUN_002aa490`, the task registered at the mission's set-up,
D:L152101) runs `FUN_002a9b30` and pushes the exit state 0x4086c8 -- the round screens, ROUND COMPLETE first (research 91
§2.4) -- at once when the host's told state +0x113 is 4 or 6 and the console is not the master (D:L151127-151135). Since
LATER 241 (§15) a late load ending at the told 6 abandons; one ending at the told 4 enters the level (W6, the told state
not 6 or 1), and its first Mission tick finds the 4 and opens ROUND COMPLETE then -- at **its own level start**, its
CountDown from there.

**What disagreed** (LATER 74, AD-12's review F3): `LobbyMatch` already timed the screens' 90 s from the match shown
(`LATE_SCREENS_OPEN_READING`), and the screen drawn was the same (ROUND COMPLETE), but the page drew it at the room's
age (`netPage.ts` `roundScreen`, a welcome's `join.result.at`): a hello well into the room's 5 s showed GO at once. The
"two screens apart" case (FINAL ROUND against GAME COMPLETE) went with LATER 241: a late load ending in the game over
no longer reaches the screens.

**Built** (viewer `netPage.ts`, `joinSinks`' `screens` sink; the merge controller cleared the hunk, the gameplay seat
holds nothing there): a welcome's standing result older than the page opens at the page's start --
`max(start, joinedAt - ENGINE_READ_S * 1000)`, in ms, since the page opens the screens `ENGINE_READ_S` (3 s) after
`start` -- the master's read (`FUN_002a9b30` D:L150629-150631, under `DAT_0045a0c0`); a client's push has none, so a
late console's open at its level start is the page's at `joinedAt` (the review's F5) -- for a live page only (a replay keeps the record's clock). A page in the match
when the result came, or a rejoin of one (its `joinedAt` kept across its retries), keeps the room's clock. The drops'
sweep reads the same clock (`sweepDrops`, `DROP_SWEEP_AT_RESULT_READING`: a client sweeps on the host's 4 or 6,
D:L151127-151131, here its first tick), so a late page's sweep lands at its opened start. The ARMORY's clock
(`nextRoundIn`, `ARMORY_CLOCK_READING`) keeps the room's start (`roomStart`): the next round is the room's (`room.ts`
`nextAt`, from its result), so popup 47 and the send-now window stay on the room's time (the review's F1, RED first).

**Pinned** (RED first: the late page drew GO at once): a late page welcomed into a 30 s old ROUND COMPLETE -- its 5 s
from its own start, then held; a page in the match at the result -- the read, then the room's 5 s; a rejoin by a page
there at the result -- held at GO (the earlier case "a rejoin's welcome into a standing result older than its
screens", whose page was fresh -- a late page under this reading -- re-pinned to a page up a minute first); a late
page's drops swept once at its opened start (the gameplay seat's ask; a guard, passing before).

**Left**: the page's start (`joinedAt`, the page's construction) stands for the console's level start; the instant
between `LobbyMatch`'s match shown and the page's construction is not compared. The review's F2 (an older gap this run
does not close): in the hand-off, the welcome and any `roundOver` heard during the load are replayed at the page's
construction and timed by that moment, not by their arrival -- a welcome that came within the room's read, or a
`roundOver` heard mid-load, opens the screens up to `ENGINE_READ_S` after the page's start where `LobbyMatch` (and the
original) open at once; so "a result older than the page opens at its start" holds for a result already past the read
when the page is built. The review's F3: `/testroom` (no `LobbyMatch`, so no LATER 241 abandon) now draws a fresh
page's GAME COMPLETE result from its own start (FINAL ROUND first) where it drew GAME COMPLETE at once; the original
abandons at the told 6, so neither matches it -- the test room's.
