# 160 -- The logoff: SOCOM II ONLINE's way out, and the return to the main menu without the boot (ONL-10, BOOT-10a)

Written 2026-10-04 for ONL-10 (`../roadmap/05-online-front-end.md`, "ONL-10 -- Logoff") and BOOT-10a
(`../roadmap/02-boot.md`, "BOOT-10a -- The logoff's return"), wave 3 of sprints 16 and 17, carried into web sprint 17
(`../plans/2026-10-02-online-path-target.md`, OT.R6, OT.R16, OT.R27, OT.R35). Sources: `dlgWorldOfSOCOM.rdr`'s and
`dlgAfterErrorReboot.rdr`'s layouts and sets as the repository's readers decode them
(`tools/dump-online-dialogs.ts --dialog <name>`; ONL-33's pin `tools/test/onlineDialogs.pinned.json`), `dlgMenu.rdr`'s
likewise, `global_valves.rdr` of `RUN/READERC.ZAR`, the US disc's `UIMnLOC.rdr`; the retail decompilation
`socom2_game.elf.decomp.c` (`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted); the recomp's archived
frames `20_then_00_triangle.png`, `20_then_01_triangle.png`, `20_then_02_left.png`, `20_then_03_cross.png` and
`final.png` (`logs/parity/s17_q2_logoff/online1/` of the PC project, looked at, not copied). **No server was
contacted.** It stands on research 157 (the lobby client: its states, `logout`, `disconnect`, `close`, the ticket and
the keep-alive), 158 (the menu; §2.10 transcribed `exit_lobby` and left YES to this task), 115 §9 (the relaunch), 139
(the boot's card checks, `BootStubs`), 152 (the music), 104 (valves) and 107 (the command table), and does not restate
them.

The code: `packages/ui/src/screens/logoffCommands.ts` (`LobbyLogout`, `UnInitNetwork`, the launch's close);
`packages/ui/src/screens/lobbyClient.ts` (state 0x12's logout bounded: the review's fix, §5);
`packages/ui/src/screens/frontEndMachine.ts` (the relaunch drops the TEMP valves); `packages/viewer/src/worldOfSocomHost.ts`
(the two rows mounted over the session's lobby, closed at every launch); `packages/viewer/src/frontEnd.ts` (one
argument: the lobby handed to the mount); `packages/ui/src/screens/worldOfSocomCommands.ts` (`UnInitNetwork` moved from
parked to existing). The tests: `packages/ui/test/screens/logoffCommands.test.ts` (10),
`packages/ui/test/screens/logoffScreen.test.ts` (5: the walk over the disc's own records through ONL-09's rig, from the
disc or the committed fixtures -- it runs without a disc), `packages/viewer/test/logoffSession.test.ts` (4: the
session's wiring), and `tools/test/worldOfSocomEntryCommands.test.ts`'s counts. Confidence: **reading, pending review**
for every transcription; the walk is held by the rig on the disc's records; no frame of the port was scored against the
captures (§5).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R160.1 | **The way out is TRIANGLE on the screen, `exit_lobby`**: three animations stopped, the fader to 0.7, `AreYouSure` 0, the popup #793 "You will be logging off of SOCOM II Online. Are you sure you want to do this?" with #246 NO and #253 YES, a wait on the valve. NO lit first; LEFT lights YES (`20_then_00`, `20_then_02`). There is no row for it among the eleven | `dlgWorldOfSOCOM.rdr`'s set; the captures | §1 |
| R160.2 | **YES runs, in order**: `StopAllSounds`, `VagStreaming(OFF)`, the popup #422 "Logging off", `LobbyLogout` (held), `UnInitNetwork`, `socom_online_initialized` 0, `NetCnfClose`, `NetCnfUnInit`, `SWITCHMENU(REBOOT)`, `KILLPOPUP`, the fader back. Pinned over the machine | the set; `logoffScreen.test.ts` | §1 |
| R160.3 | **`LobbyLogout` holds the chain until the session has ended**: `FUN_0027dcc0` answers 1 only at state 0; at any other state but 0x12 it queues the logout (`FUN_002fa560`, state 0x12) and answers 0; the statement is asked again each tick until SessionEnd's reply (`FUN_002ee7b0`) returns the state to 0. On the page that is `/account/logout` with the ticket, the ticket dropped and the keep-alive stopped at its answer | D:L126223-126238, D:L198270-198282, D:L190850-190871 | §2.1 |
| R160.4 | **`UnInitNetwork` is not "the constant 1"**: `FUN_0027e5c0` clears the lobby's event callback, disconnects the lobby (`FUN_002dfdd0`: the flag +0x7d cleared, the transport closed, the lists reset), stops the DME layer and clears its on-line byte, then answers 1. Earlier notes and three modules' lists read the row by its answer alone. Left parked, the lobby's flag stayed set and the next `LobbyConnect` answered 0: **a second ONLINE entry after a logoff could not connect** | D:L126505-126515, D:L182488-182499, D:L182633 | §2.2 |
| R160.5 | **The return is PLAT-10's relaunch on `--menu_state dlgAfterErrorReboot.rdr`** (`FUN_0022ed10`): that dialog has no background; its ONSTART `do_onstart` runs `intro_onstart` (the card checks), the HDD branch only with `HDD_ENABLE` 1, then `SWITCHMENU(dlgMenu.rdr)`. No loader screen and no movie of the boot is passed through (BOOT-10a); the captures show black (`20_then_03`) then the main menu (`final`) | the set; D:L81077-81096 | §3.1 |
| R160.6 | **The music**: `exit_lobby` stops the stream (MUS_ONLINE_MENU) before the reboot; `dlgAfterErrorReboot` and `dlgMenu` start none -- the main menu's sound is `menuloop.pss`'s own track (research 152 R152.1). So the return is silent until the menu's movie plays, as after the boot | the sets; research 152 | §3.2 |
| R160.7 | **The focus**: `dlgMenu`'s `SetMenuValve` gives `MenuButtonChanged` 2 with a saved game, else 1, and `ActivateMenuBtns` lights LOAD GAME or NEW GAME -- the same as after the boot. With the f0 card (no saved game) NEW GAME, as `final.png` shows | `dlgMenu.rdr`'s set; the capture | §3.3 |
| R160.8 | **A relaunch drops the TEMP valves** (`RELAUNCH_VALVES_READING`): on the console `LoadExecPS2` is a new process and no valve survives; the page keeps one store, so it drops every TEMP valve (`StartMusic` among them: research 158 §7's owed item, the next login's music) and keeps PERM and PERSIST | `FUN_00352500` D:L251228-251308; research 104 §6 | §4.2 |
| R160.9 | **A lobby still up at a launch is closed** (`LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`): the page's lobby object outlives the relaunch, where the console's connection does not | -- (an adaptation) | §4.3 |

## 1. The walk

`dlgWorldOfSOCOM.rdr` binds `SCREEN BUTTON TRIANGLE -> exit_lobby` (the set's own animation). Its statements:
`STOP create_modify_clan`, `STOP goto_menu`, `STOP menu_fade_up`; `OPACITY MENUFADER 0 -> 0.7` in 0.05 s;
`VALVE AreYouSure = 0`; `POPUPDIALOG(NA)`; `POPUP #793 buttons #246/#253 -> AreYouSure`; `WHILE AreYouSure == 0`. Then
`IF AreYouSure == 2` (YES, the second button): `StopAllSounds(NA)`, `VagStreaming(OFF)`, `POPUPDIALOG(NA)`, `POPUP #422`,
`LobbyLogout(NA)`, `UnInitNetwork(NA)`, `VALVE socom_online_initialized = 0`, `NetCnfClose(NA)`, `NetCnfUnInit(NA)`,
`SWITCHMENU(REBOOT)`, `KILLPOPUP(NA)`, `OPACITY MENUFADER 0.7 -> 0`. Else `KILLPOPUP(NA)` and the fader back (ONL-09's test
holds NO).

The captions are the disc's: #793 the question, #246 NO, #253 YES, #422 "Logging off". The frames: `20_then_00` and
`20_then_01` (TRIANGLE) show the popup over the dimmed menu with YES left of NO and NO lit; `20_then_02` (LEFT) YES lit;
`20_then_03` (CROSS) black. The rig reaches YES with LEFT and runs the chain on CROSS; whether the port draws YES on the
left was not scored (§5).

A row aimed at the logoff does not exist: none of the eleven BUTTONs binds `exit_lobby`. The ROOMLIST's TRIANGLE is its
own (`OnBriefingRoomstart`); with no room it takes no pad and the screen's binding answers (research 158 §2.4).

## 2. The rows

### 2.1 `LobbyLogout` (R160.3)

`FUN_0027dcc0` (D:L126223-126238): the lobby's state byte `DAT_0044f3d0` -- 0 answers 1; 0x12 answers 0 and asks
nothing; any other calls `FUN_002fa560(0x44f370)` (D:L198270-198282: with the flag +0x7d set, `FUN_002efe20` queues
0x12) and answers 0. A UI command answering 0 holds its sequence and is asked again the next tick, so `exit_lobby` stays
on the row. State 0x12's entry (`FUN_002ee6e0` D:L190823-190847) sends SessionEnd with the session key, or goes to 0 at
once with none; the reply (`FUN_002ee7b0` D:L190850-190871) clears the key and queues 0 on either status. The next ask
answers 1 and the chain goes on.

The page: `LobbyClient.logout` queues 0x12; its handler posts the service's `logout(ticket)` (`/account/logout`, SVC-03's)
and, at the answer, drops the ticket -- which stops the keep-alive (`LOBBY_KEEPALIVE_MS`) -- and queues 0. A keep-alive
answered "session lost" in between posts nothing (`LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`, research 157). A logout
the server does not answer -- rejected, or not answered within `LOGOUT_TIMEOUT_MS` -- ends the session here as a failed
status would (`LOGOUT_UNANSWERED_ADAPTATION`, §5). ONL-08 and
ONL-06 registered the same answer as stand-ins (`LOBBY_LOGOUT_STUB_READING`, `LOBBY_STATE_PLACEHOLDER`); the session now
registers this body after them.

### 2.2 `UnInitNetwork` (R160.4)

`FUN_0027e5c0` (D:L126505-126515): `DAT_0044f3c8 = 0` (the lobby's event callback, through which every lobby event
reaches the dialog host), `FUN_002dfdd0(0x44f370)` (D:L182488-182499: with the flag set -- the flag cleared,
`FUN_00300680` the transport closed, `FUN_002df8e0` the rooms', games' and clan's lists reset; the state byte left as it
stands), `FUN_0030d770(0x45a0c0)` (D:L210119-210133: with the on-line byte +1 set, `FUN_00620810`, the buffer
`DAT_0045b328` freed, the bytes +5 and +2 cleared, `FUN_0030c030`) and `FUN_0030e3a0(0x45a0c0, 0)` (D:L210590-210597:
the byte +1, `DAT_0045a0c1`, cleared); answer 1.

The page: `LobbyClient.disconnect` (the flag cleared; the queue emptied; the ticket and the password let go; the
keep-alive stopped; a reply that arrives later is dropped, which stands for the callback's clearing). The DME half has
no object on the page (`NETWORK_TEARDOWN_READING`). Why it matters: `FUN_002e0030` (`LobbyConnect`'s call) starts a
connection only with the flag clear (D:L182633) and answers 0 otherwise (D:L182761). The session test shows the bug
this closes: after a logoff with the row parked, `connect` answered false.

The same row is reached from `OnMultiplayerDisconnect` (UIanim.rdr, MP_MEDIUS_ERROR on this dialog), from DECLINE's
`ReturnToMMenu` on USER AGREEMENT and from the DNAS screen's TRIANGLE: one body for all of them, mounted on the session.
The lists of `dnasCommands.ts`, `personaCommands.ts`, `universeCommands.ts` and `usagePolicyCommands.ts` still describe
it as declared for ONL-10 (§5).

## 3. The return (BOOT-10a)

### 3.1 The relaunch and `dlgAfterErrorReboot` (R160.5)

`SWITCHMENU(REBOOT)` is the switch handler's REBOOT (`FUN_00365a00` D:L262375-262458, research 115 §9) into
`FUN_0022ed10` (D:L81077-81096): `LoadExecPS2` of the game's ELF with the three arguments at 0x3dc9d0 --
`--menu_state`, `dlgAfterErrorReboot.rdr`, the empty string (`REBOOT_LAUNCH`). PLAT-10's relaunch was already in
place: the open dialog released and a new boot on the named dialog, with no loader screen and no opener (BOOT-02's and
BOOT-04's, parked).

`dlgAfterErrorReboot.rdr` (`RUN/UI/READERC.ZAR`): no background, scripts `dlgAfterErrorReboot.rdr`, `uianim.rdr`,
`UIMemCardAnim.rdr`; `SCREEN EVENT ONSTART -> do_onstart`: `CALL intro_onstart` (blocking: the card's port checks and
`load_initial_config` while `memcard_have_loaded_config` is 0), `IF HDD_ENABLE == 1` the HDD check with its error,
then `SWITCHMENU(dlgMenu.rdr)`. The block's unknown "whether its HDD error shows at all with HDD disabled": not with
`HDD_ENABLE` 0, which the f0 card holds (research 139 R139.4) -- nothing of the HDD is shown. The rig runs it with the
boot's card answers (`BootStubs`, the f0 card) and pins: the builds `dlgWorldOfSOCOM.rdr`, `dlgAfterErrorReboot.rdr`,
`dlgMenu.rdr`; the launch `REBOOT_LAUNCH`; no `HardDriveOperation`; the last statement `SWITCHMENU(dlgMenu.rdr)`.

### 3.2 The music (R160.6)

`exit_lobby`'s `StopAllSounds` and `VagStreaming(OFF)` stop MUS_ONLINE_MENU (`CallMusic`'s, research 158 §2.9) before
the popup #422. `dlgAfterErrorReboot`'s sets name no SOUND and no streaming row; `dlgMenu`'s ONSTART starts none
(research 152 R152.1: the main menu's sound is `menuloop.pss`'s track, played with its background). The rig pins: after
YES, `stopAll` then `streaming false`, and no MUS_ONLINE_MENU and no `streaming true` to the main menu; `dlgMenu`'s
background is `menuloop.pss`.

### 3.3 The focus (R160.7)

`dlgMenu`'s ONSTART `SetMenuValve`: `GetNumSavedGames(GotSaveGames)`, `MenuButtonChanged` 2 when it is above 0 else 1,
`CALL ActivateMenuBtns`. After the return it runs as after the boot. The rig (the f0 card's answers: no saved game)
settles on `new_game_button` with `MenuButtonChanged` 1; `final.png` shows NEW GAME lit.

## 4. The page

### 4.1 The mount

`connectWorldOfSocom` (`packages/viewer/src/worldOfSocomHost.ts`) registers `LogoffCommands` over the session's lobby
(`FrontEndSession.connect.lobby`, ONL-07's client; one argument added in `frontEnd.ts`). Registered after ONL-08's and
ONL-06's stand-ins, its `LobbyLogout` is the one in force. With no account service there is no lobby: `LobbyLogout`
answers 1 at once and `UnInitNetwork` tears nothing down.

### 4.2 The relaunch's valves (R160.8)

`FrontEndMachine.relaunch` drops the TEMP valves (`ValveStore.remove(TEMP)`, `FUN_00352500`'s teardown by type) before
the new boot (`RELAUNCH_VALVES_READING`). On the console the whole registry is new: `global_valves.rdr` read at PERM
(`CValve_Open`, `FUN_00351d40` D:L250922-250959) and the card's values restored by `load_initial_config`. The page
loads neither at a relaunch, so it keeps PERM and PERSIST (the player's settings) and drops only what no new process
holds. The online menu's twelve valves of `global_valves.rdr` are seeded again by its mount at every launch (research
158 §3.4). The test: `StartMusic` (TEMP, set 1 by BRIEFING ROOMS) is gone after the relaunch, `PopupNewsOnce` is 0
again, a PERM and a PERSIST valve stand.

### 4.3 The lobby at a launch (R160.9)

At every `LoadExecPS2` the mount's `launch` calls `LobbyClient.close` (`LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`): a session
still up -- a reboot with no logoff before it, an error path -- is logged out (not awaited) and disconnected, as the
page's stop does (`LOBBY_CLOSE_AT_STOP_ADAPTATION`). After the logoff's chain the lobby is down and nothing is sent.

### 4.4 A second ONLINE entry

After the logoff the lobby's flag is clear and its ticket gone: `LobbyConnect` starts a new connection, LOGIN answers a
new ticket and the keep-alive runs again; the old ticket is never sent again (`logoffCommands.test.ts`,
`logoffSession.test.ts`). The persona form's own walk to LOGIN is ONL-06's and ONL-07's, unchanged.

## 5. Unknowns, contradictions, what is not done

- **Not scored.** The walk is held by the rig on the disc's records; no frame of the port was compared with
  `20_then_00..03` or `final.png` (no browser on this task: the host was held). The roadmap's acceptance stands owed:
  the popup's frames and the main menu's against those captures (ONL-32's walk, or a score like ONL-09's).
- **The card on the way back.** The console's new process finds `memcard_have_loaded_config` 0 and re-reads the card
  on `dlgAfterErrorReboot` (#827 "Searching MEMORY CARD slots ...", #842 "Loading preferences ..."); the page keeps the
  valve at 1 and skips it (`RELAUNCH_VALVES_READING`). Whether the recomp's run showed those popups between
  `20_then_03` and `final` is not on record (no frame between them). A launch from a new store -- the table whole,
  then the card -- is OPT-02's and BOOT-05's.
- **The contradiction corrected.** Research 158 §3 lists `UnInitNetwork` as parked with "its body answers the constant
  1", and so did the `why` texts in `dnasCommands.ts`, `personaCommands.ts`, `universeCommands.ts` and
  `usagePolicyCommands.ts`: the answer is 1, but the body tears the connection down (R160.4). This task moved the row to
  existing in the online menu's list and, at the review (2026-10-04), reworded the four `why` texts to name the body
  and this note; their state stays `declared` in those lists (the dialogs' own pins).
- **A logout the server does not answer (the review's finding, 2026-10-04).** With the server unreachable at YES the
  logout's request rejected, `ask` dropped the rejection as never answered, the state stood at 0x12, `LobbyLogout`
  answered 0 forever: the logoff sat on #422 with the ticket held and the keep-alive renewing the session the player
  ended (its session-lost answer silenced by `LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`). Now a rejection is a failed
  status and the wait is bounded by `LOGOUT_TIMEOUT_MS` (5 s): the session ends here, the ticket dropped, the
  keep-alive stopped, and the chain goes on to `UnInitNetwork` and the relaunch (`LOGOUT_UNANSWERED_ADAPTATION`). The
  original: the reply `FUN_002ee7b0` queues state 0 on either status, and the entry `FUN_002ee6e0` ignores the send's
  failure; what the console did when no reply ever came is the Medius library's timeout, not recorded. Tests: the walk
  with the logout's fetch rejected reaches the main menu; a never-answered logout ends at the bound and not before
  (fake timers).
- **The DME layer** (`NETWORK_TEARDOWN_READING`): nothing on the page; nothing shown on the console.
- **`AreYouSure` after YES.** The script's popup wait is the same valve every popup uses; it is TEMP and gone after the
  relaunch, as on the console.
- **Not done here**: the corpus is rebuilt by this branch (W6.R7); research 101 (no name of this task is in the round's
  packages).

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `NETWORK_TEARDOWN_READING` (`packages/ui/src/screens/logoffCommands.ts`) | the host's `networkDown` told; nothing else | `UnInitNetwork`'s DME half (`FUN_0030d770`, `FUN_0030e3a0(.., 0)`) has no object on the page: the network is ours (MISSION R6, OT.R27) and nothing of it shows | a page DME layer, should one ever exist |
| `RELAUNCH_VALVES_READING` (`packages/ui/src/screens/frontEndMachine.ts`) | TEMP valves dropped at a relaunch; PERM and PERSIST kept; no `global_valves.rdr`, no card re-read | the console's relaunch is a new process with a new registry; the page keeps one store and loads neither the table nor the card at a relaunch | OPT-02 and BOOT-05: a launch that reads `global_valves.rdr` whole, then the card |
| `LOGOUT_UNANSWERED_ADAPTATION` and `LOGOUT_TIMEOUT_MS` (`packages/ui/src/screens/lobbyClient.ts`) | a rejected logout is a failed status; an unanswered one ends after 5,000 ms; either way the session ends here (state 0, the ticket dropped, the keep-alive stopped) | a browser adaptation (not a ledger name): the console's bound is its Medius library's unrecorded timeout; 5 s is never met on a working connection, and a session the server never hears ended expires by itself 60 s after its last use (research 159 §1) | -- |
| `LOBBY_CLOSED_AT_LAUNCH_ADAPTATION` (`packages/ui/src/screens/logoffCommands.ts`) | a lobby still up at a `LoadExecPS2` logged out (not awaited) and disconnected | a browser adaptation (not a ledger name): the console's connection ends with its process | -- |
