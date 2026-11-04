# 128 -- The online dialogs read from the disc: the path to SOCOM II ONLINE and on to the match, every online dialog's layout, scripts and flow (ONL-33, PLAT-06's online chapter)

Written 2026-10-02 for ONL-33 (the block is `../roadmap/05-online-front-end.md` "ONL-33", on the segment's facts
N1-N22), under the owner's target of the day (the central server, "Main menu -> Online -> traditional UI flow", the
DNAS and LOGIN screens to match the original; the plan `docs/plans/2026-10-02-online-path-target.md` on the branch
`agent/lan-target`, rulings OT.R1-OT.R8). Read-only research plus a tool and its tests; no engine code. Sources: the US
disc tree (`SOCOM_DISC`, `C:/Projects/socom_pc/game/disc`) read with the repository's readers (`@s2u/archive` `Zar`,
`parseRdr`; `@s2u/scene` `parseAnimSets`, `decodeUiProgram`, `parseUiLayout`, `parseLocTable`; `tools/dialogInventory.ts`
`bindingsOf`, `resolveSets`, `buildGraph`), the retail ELF `socom2_game.elf` beside it (strings by address through its
program headers, `tools/elfImage.ts`), the retail decompilation `game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its
line; every address retail), the UI command table (`packages/ui/src/uiCommands.ts`, research 107), and two PCSX2
captures of the original on our Horizon (`logs/parity/s4_pcsx2/A_30.png`, `A_31.png` under `SOCOM_PC_ROOT`, not in the
tree). It stands on research 96 (the inventory and the graph), 104 (valves), 105 (the dialog loader), 106 (the zAnim
runtime), 107 (the command table), 117 (the widgets), 118 (popups) and 119 (the software keyboard), and does not restate
them. Names, ids, counts and the scripts' ops as decoded; a literal caption the scripts spell is kept as its length
only; no caption text, no decompiled text.

**The tool and the tests.** `tools/dump-online-dialogs.ts` prints each chapter (`--dialog <name>` one; `--rooms`
`mp_rooms.rdr`; `--pin` rewrites the pin). Its pure half is `tools/onlineDialogs.ts` (the listing of a script op by op,
the POPUP record's line, what a listing names, the command's row, `mp_rooms.rdr`'s table), unit-tested in CI on made-up
input by `tools/test/onlineDialogs.test.ts`, which also holds the path's flow edges from the pin. The pin is
`tools/test/onlineDialogs.pinned.json` (36 chapters, the 40 library animations they reach listed once, the pairs, the
rooms); `tools/test/onlineDialogsDisc.test.ts` (dev disc only; it skips with `SOCOM_DISC`/`SOCOM_PC_ROOT` unset)
re-derives all of it from the disc and compares it chapter by chapter. A listing's line is one op: `Fn(arg)` a bound
function, `node.opN(#id|arg)` a node command, `POPUP #text [buttons #a/#b -> valve] [TRIANGLE] [keep]` a POPUP record
(research 118 §2), `IF`/`ELSEIF`/`ELSE`/`ENDIF`/`WHILE`/`END_WHILE` indented two spaces a level, `CALL x (blocking)`,
`STOP x`, `CALL_SEQUENCE x`, `WAIT s`, `SHOW`/`HIDE node`, `MOVE node s`, `OPACITY node a->b s`, `SOUND name`,
`VALVE name op operand`; a several-sequence animation heads each `== <name> (<activation>)`.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R128.1 | **The path is seven script switches.** ONLINE (`dlgMenu` `multiplayer_button` CROSS `do_multi_or_medius`) -> `dlgMPswitch` (ONSTART `StopStreaming`) -> `dlgNetLogin` (`login_btn` CROSS `proceed_net_login`, argument `dlgNetAuthenticate.rdr` through `SWITCHMENU(INPUT_STRING)`) -> `dlgNetAuthenticate` (ONSTART `init_socom_online`) -> `dlgNetServerSelect` (event `MP_SUCCESS` `server_connected`, after `SERVERLIST` CROSS `select_server`'s `LobbyConnect`) -> `dlgNetPlayerName` (`connect_btn` CROSS `register_new_account`) -> `dlgNetConnect` (ONSTART `init_socom_online`, on `socom_online_state` 11) -> `dlgUsagePolicy` (`YesAccept` CROSS `ForceUsagePolicyReturn`) -> `dlgWorldOfSOCOM`. The unit test holds each edge | the pin | §1 |
| R128.2 | **`dlgMPswitch` draws nothing**: no object, no control, one binding (ONSTART -> `StopStreaming`: `VagStreaming(OFF)`, `SWITCHMENU(dlgNetLogin.rdr)`). It is a pass-through, not the slot popup | `dlgMPswitch.rdr` and its set | §2.1 |
| R128.3 | **The "Select MEMORY CARD slot" popup (`A_30`) is `UIMemCardAnim.rdr`'s `choose_memcard_slot`**: `POPUP #828 buttons #510/#511 -> MainMenuCardSlotChoice` (`_828_SelectMemCardSlot_MSG`, `_510_Slot1_MSG`, `_511_Slot2_MSG`), reached through `load_initial_config` -> `find_a_memcard` only when `memcard_have_loaded_config` is 0, `memcard_already_selected` is 0 and **both** slots hold a card. Its callers are the boot screens' `intro_onstart` (`dlgIntroScreen`, `dlgAfterReboot`, `dlgAfterErrorReboot`, `dlgReturnFromNTGUI2`, `dlgReturnFromNTGUI2LAN`) and `has_memcard_changed`, **not the ONLINE path**: in the s4 capture it follows the reboot back from EDIT NETWORK CONFIGURATIONS (`A_29_backtogame` -> `A_30`), where `dlgReturnFromNTGUI2`'s `do_onstart` runs `intro_onstart` and then switches to `dlgNetLogin`. N4's "ONLINE -> Select MEMORY CARD slot" is corrected | `UIMemCardAnim.rdr`, `UIanim.rdr` | §2.2 |
| R128.4 | **`_573_CheckingAdapter` and `_572_LoadingNetwork` are raised and killed in one frame**: `OnLoginRoomstart` shows #572 when the port's card is in and formatted, else #573 (both `keep`, no buttons), then `KILLPOPUP` with no WAIT or not-done command between -- by research 106 §2 they never reach a drawn frame. **`_574_NoAdapterDetected` shows only when `NetGetInterfaceList(NETDEVICE_LIST)` leaves `NETDEVICE_LIST` empty** (`TestUIVar` false) after `NetCnfInit` and a 2-s WAIT: a popup whose button record has no visible button (`buttons none -> NeedNetAdapter`), waited on, then `exit_net_login` to the main menu | `dlgNetLogin.rdr` `OnLoginRoomstart` | §2.3 |
| R128.5 | **The configuration rows are the UI variable `NETCNF_DB`**, filled by `NetCnfOpen(mc0:)`/`(mc1:)` (`FUN_00277dd0` D:L123168-123237) from the eznetcnf IOP module's combination list (RPC function 1, `FUN_001e8740` D:L48670): per valid entry, a row of three columns -- the entry's number + 1, its name at entry +0x28 (`%s`, or its first 32 characters and `...` from 31 characters on), and the string at entry +0x48. `COMBOLIST` shows columns 1-2 (`COLUMNS` 0, 40: "1 Setting 1"); `HWLIST`, a 5-px `NOSELECT` list at (145, 313), puts columns 1-2 at x 700 (off screen) and column 3 at 0: **the HARDWARE line is column 3 of the focused row** (`HWLIST.op7(SELECTED_COMBO)`, `op7(tmp_idx)` on focus). The slot line is `Slot_title` (`_559_MemCardSlot1_MSG`, `#577`, or a 18-character literal for slot 2) and the `MemoryCard` RADIOSTRIP's checkboxes `S1` (`_564`), `S2` (`_565`), `S0` (`_566`, at x 900) | `dlgNetLogin.rdr`, `FUN_00277dd0` | §2.4 |
| R128.6 | **The recomp's eznetcnf answer contradicts the reader**: it writes the hardware name at entry +8 and the setting at +40 (= +0x28) and nothing at +0x48, but the EE reads entry +8 as the combination's **key** (`NetCnfCurrCombo` `FUN_00277bf0` D:L123125 compares it with the default's; `NetCnfSelectCombo` `FUN_00277ab0` D:L123082 hands it to RPC function 2) and the HARDWARE column from +0x48. With that answer the list shows "1 Setting 1" and the HARDWARE line is blank (N5 reports both empty on an older run) | `desktop@be55783:third_party/ps2recomp/ps2xIOP/src/modules/eznetcnf.cpp:16-17`, `:184-185` | §2.4 |
| R128.7 | **The DNAS screen's captions, in order** (`dlgNetAuthenticate` `init_socom_online`): title `#448` `_448_ConnectingNoDots_MSG` replaces the layout's `_533_AUTHENTICATING_MSG` and the state line `#534` `_534_ConnectingInternet_MSG` replaces `_446_START_MSG` on the first step; `InitNetwork(success)` holds the sequence until its worker ends, then `WAIT 2`; `#535` `_535_AuthenticatingDnas_MSG` with the DNAS logo and `_532_DnasLogotype_MSG` fading in over 0.8 s; `DNASAuthenticate` holds until its worker ends; logo and trademark fade out; `DMEInit`, `MediusInit` (immediate; `#535` set again); title `#536` `_536_LocatingUniverses_MSG`, state `#537` `_537_LocatingAvailUnivs_MSG`; `GetServerList` holds; `SWITCHMENU(dlgNetServerSelect.rdr)`. A 90-s watchdog (`monitor_timeout`) raises `#450` and reboots | `dlgNetAuthenticate.rdr`'s set; §3's commands | §3 |
| R128.8 | **The host commands of the DNAS screen**: `InitNetwork` `FUN_00276dc0` (D:L122649-122690), `DNASAuthenticate` `FUN_002cc670` (D:L170469-170513) and `GetServerList` `FUN_002fb080` (D:L198609-198652) each start a worker on the first tick and answer 0 (not done: the sequence waits, research 106 R106.3) until it ends, then 1; `DMEInit` `FUN_00276ce0` (D:L122614-122646) and `MediusInit` `FUN_00276c60` (D:L122586-122611) answer 1 at once and write their result into the valve the argument names (`success`). `DNASAuthenticate` reads no argument: its result is the valve `DNAS_ERROR_CODE` (0x3f33e0, zeroed at the start), its errors the event `MP_DNAS_ERROR` (codes 201 and 204 pass; 200-299 and 700-799 popup and go on; any other halts) | the bodies | §3 |
| R128.9 | **Under the bypass the screen is visible**: with `DNASAuthenticate` done on its first tick (`socom2_DnasTickDone`) the CONNECTING / CONNECTING TO INTERNET pair still stands for `InitNetwork`'s time plus the 2-s WAIT, then AUTHENTICATING DNAS DATA for one `Ensure_MC_Dirs_Fast`, then LOCATING ... for `GetServerList`'s time. `socom_online_initialized`, the guard of the whole sequence, is only ever set to 0 (five scripts) and named by no code: the guard always passes | the set; the ELF | §3 |
| R128.10 | **`SWITCHMENU(PREVIOUS_SCREEN)` is a fourth kind of target** research 96's graph does not walk: `SwitchMenu` itself (`FUN_0027e720` D:L126571) compares its argument with `PREVIOUS_SCREEN` (0x3ef3a0) and pops the menu history; `FUN_00365a00`'s five states are not the only non-dialog targets. `dlgUsagePolicy`'s ACCEPT uses it when `UsagePolicyReturnScreen` is not 1 (the agreement opened from elsewhere) | `FUN_0027e720` | §1, §6 |
| R128.11 | **`mp_rooms.rdr` is a table, not a dialog**: 12 rooms (`ROOMNAME`, `LIMIT` 256, a `GAMELIST` of `GAMENAME`/`FRIENDLYFIRE`/`MAXPLAYERS`/`MISSION_SEQUENCE`), pinned. No string of the ELF names `mp_rooms` or `ROOMNAME`/`MISSION_SEQUENCE`: no reader was found (`MP_ROOMS_READER_READING`) | `RUN/UI/READERC.ZAR` | §5 |
| R128.12 | **The keyboards** of the online dialogs (`GetTextInput`'s UI variables, per dialog in §4) and their caps are research 119's (§5 there: 30 call sites with `MaxChars`/`MaxBytes`/`SkbName`); this chapter lists which dialog opens which, nothing more | research 119 | §4 |
| R128.13 | **No `clan_icon_NN` exists on the disc**: the ELF's one format `clan_icon_%.2d.tif` (0x3f4310) is formatted by `FUN_002e7b80`/`FUN_002e7d70` (index 0, then overwritten by the stats string `%.3d%.12d%s`, its icon field 0) and `FUN_002e8bd0` (D:L187819-187822, into a buffer nothing reads); none of the 142 ZAR/ZED archives under `RUN/` has a member of that name, and no loose file holds the string (`CLAN_ICON_INDEX_READING`) | the ELF; the archives | §4.15 |
| R128.14 | **AUTOPLAY belongs here, as `dlgWorldOfSOCOM`'s third row, not a dialog**: ONACTIVATE `aplaytext` shows the filters (`dlgOnlineFilters`' valves, §4.14) in place; CROSS `join_random_game` -> `JoinMPGame(RANDOM)` (`FUN_0027d730`); `MP_MEDIUS_READY_TO_CONNECT` -> `join_game` -> `ConnectToGameServer`, `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`, no briefing room between | `dlgWorldOfSOCOM.rdr`'s set | §4.15 |

**The level.** Everything here is the reading level: the disc's layouts and scripts through the readers, the
decompilation and the ELF. Two frames were looked at (not scored): `A_30` shows the #828 popup with its two buttons
over a black screen (consistent with R128.3: `dlgReturnFromNTGUI2` has no background) and `A_31` the LOGIN rows of
R128.5. The proven level -- each caption against ONL-32's captures, the DNAS caption order against a 1 frame/s recomp
capture (ONL-03's acceptance) -- is owed to ONL-32.

## 1. The path, edge by edge

The edges are `tools/dialogInventory.ts`'s rule (`buildGraph`, research 96 §3) over each dialog alone; "(library)"
marks a switch found in a library set (`UIanim.rdr`, `UIMemCardAnim.rdr`), real but conditional on state the library
tests. `tools/test/onlineDialogs.test.ts` holds every row of this table against the pin.

| from | owner, trigger, animation | to | what the script waits on first |
|---|---|---|---|
| `dlgMenu` | `multiplayer_button` CROSS `do_multi_or_medius` | `dlgMPswitch` | three sequences: `ComeFromLan` = 0, `SuspendMenuInput(1.75)`, the button's motion and fade, `CurrentMission` = 0 |
| `dlgMPswitch` | SCREEN ONSTART `StopStreaming` | `dlgNetLogin` | nothing |
| `dlgNetLogin` | `login_btn` CROSS `proceed_net_login` (argument `dlgNetAuthenticate.rdr`) | `dlgNetAuthenticate` | `NetCnfSelectCombo(SELECTED_COMBO)` true, `NetCnfUnInit`, `RebootIOP(MULTIPLAYER)`; with `ComeFromLan` 1 it goes to `dlgLANPlayerName` instead; false re-runs `OnLoginRoomstart` |
| `dlgNetAuthenticate` | SCREEN ONSTART `init_socom_online` | `dlgNetServerSelect` | §3 |
| `dlgNetServerSelect` | SCREEN `MP_SUCCESS` `server_connected` | `dlgNetPlayerName` | `SERVERLIST` CROSS `select_server`: `VerifyPatchLevel(INPUT_STRING)` (false: `dlgDownloadPatch`), popup #614, clear `PLAYERNAMEVAR`/`PLAYERPASSWORD`/`PLAYERHOMETOWN`, `PLAYERGENDER` 0, `LobbyConnect(INPUT_STRING)`; the event then switches |
| `dlgNetPlayerName` | `connect_btn` CROSS `register_new_account` | `dlgNetConnect` | with `PasswordChanged` 1 the popup #606 (`_606_WriteDownName_MSG`, `buttons #457`), then `memcard_operations` (blocking) |
| `dlgNetConnect` | SCREEN ONSTART `init_socom_online` | `dlgUsagePolicy` | `LobbyLogin(NA)`, then a WHILE on `socom_online_state` (12, 7, 3, 8, 4, 9, 5: a literal status caption each; 10: the register popup and `LobbyRegister`; 6: fail; 11: on), `DownloadCharacterProfile`, WAIT 1 |
| `dlgUsagePolicy` | `YesAccept` CROSS `ForceUsagePolicyReturn` | `dlgWorldOfSOCOM` | `UsagePolicyReturnScreen` = 1 (set by `dlgNetConnect`); else `PREVIOUS_SCREEN` (R128.10) |
| `dlgWorldOfSOCOM` | SCREEN `MP_JOIN_ROOM` `switch_to_briefing_room` (library) | `dlgMPBriefingRoom` | `ROOMLIST` CROSS `join_room`: `CanJoinRoom(INPUT_STRING)`, `JoinMPRoom(INPUT_STRING)`, a WHILE until `socom_online_state` 11 |
| `dlgMPBriefingRoom` | `CRgame` CROSS `OnCreateGamePress` | `dlgCreateGame` | nothing |
| `dlgMPBriefingRoom` | `GAMELIST` CROSS `join_game` | `dlgGameLobby` | `WatchOrJoin` picks `JoinAsSpectator`, then `aux_join_game` |
| `dlgCreateGame` | SCREEN SQUARE `create_game` | `dlgGameLobby` | `PLAYLISTVAR` and `GAMENAMEVAR` set (else #303 / #304), `CreateMPGame`, a WHILE until `socom_online_state` 17, `ConnectToGameServer`, `SetMPMissionSeq(PLAYLISTVAR)`, `JoinGameServer` |
| `dlgGameLobby` | SCREEN ONSTART `check_loop` | `LOAD_SCREEN` (`dlgLoad`) | `AdvanceMPMission` (unless back from the ARMORY), a WHILE until `mp_major_game_state` 2 (`CheckForcedLaunch`, `CountDown`), `SetMPWeaponValves` |
| `dlgGameLobby` | `weaponselect` CROSS `goto_eq_mp_set_return_valve` (argument `dlg_equipment_mp.rdr`) | the ARMORY | -- |

The ways back: TRIANGLE on LOGIN runs `exit_net_login` (`NetCnfUnInit`, `RebootIOP(MAINMENU)`, `SWITCHMENU(dlgMenu.rdr)`);
TRIANGLE on DNAS and the universe list, DECLINE on the agreement (after #763) and TRIANGLE on SOCOM II ONLINE (after
the logoff popup #793, research 118 R118.7) end in `SWITCHMENU(REBOOT)`; `dlgReturnFromNTGUI2`'s `do_onstart` (the
return from EDIT NETWORK CONFIGURATIONS) runs `intro_onstart` and switches to `dlgNetLogin`.

## 2. The first screens: ONL-01's unknowns

### 2.1 `dlgMPswitch`

Zero objects, zero controls, background `IMAGE` with no file; `SCRIPT_LIBRARY` `dlgMPswitch.rdr`, `uianim.rdr`; one
binding (SCREEN ONSTART -> `StopStreaming`); its set one animation: `VagStreaming(OFF)` (`FUN_0027a5e0`),
`SWITCHMENU(dlgNetLogin.rdr)` (`SwitchMenu` `FUN_0027e720`). Both run in its first frame.

### 2.2 The slot popup (`A_30`)

`UIMemCardAnim.rdr` `choose_memcard_slot` (UIZANIM): `MainMenuCardSlotChoice` = 0, `PopUpDialog`, the record `#828`
with buttons `#510`/`#511` into `MainMenuCardSlotChoice`, `WHILE MainMenuCardSlotChoice == 0`, then a record `#829`
(`keep`) and `MC_ChPort(0)` or `(1)` with `MainMenuCardSlot` 0 or 1. Its cancellable twin `choose_memcard_slot_cancellable`
(#830, TRIANGLE answers 66) serves `save_and_leave`. The chain: a boot screen's `do_onstart` -> `UIanim.rdr`
`intro_onstart` (its first three sequences idle at activation 2; `end_of_screen`, activation 1, runs) ->
`load_initial_config` (only while `memcard_have_loaded_config` is 0) -> `find_a_memcard` (popup #827 `keep`, WAIT 1,
count the cards in ports 0 and 1) -> `choose_memcard_slot` when `num_memcards` > 1. `dlgMenu`'s
`GetSlotToLoadFrom` (#509) is the LOAD GAME list's, not this one.

### 2.3 `OnLoginRoomstart` (LOGIN's ONSTART)

In order: `SuspendMenuInput(3.0)`, `ClearUIVar(NETCNF_DB)`, `NetCnfIsInited` = 0, `login_btn`, `COMBOLIST`, `HWLIST`,
`selectBtn` disabled, `CameFromOther` = 0, `PopUpDialog`, `ActivateButton(MemoryCard)`; `IF IsMemCardInserted AND
IsMemCardFormatted` the record #572 `keep`, else (with `NETCNF_REQUIRED` != 0 `login_btn` disabled) the record #573
`keep`; `KILLPOPUP`; `NetCnfInit` (`FUN_00278040`); WAIT 2; `NetGetInterfaceList(NETDEVICE_LIST)` (`FUN_00277970`);
`NetCnfIsInited` = 1; `IF NOT TestUIVar(NETDEVICE_LIST)`: `NeedNetAdapter` = 0, the record #574 (buttons flagged, both
widths 0), `WHILE NeedNetAdapter == 0`, `CALL exit_net_login (blocking)`; then `CALL OpenCardOne (blocking)`. Every
command up to `KILLPOPUP` is timeless and done on its tick, so #572 and #573 are hidden before the frame is drawn
(research 106 §2; `NETLOGIN_CHECKING_POPUP_READING`). A browser's `NetGetInterfaceList` answers the adapter OC-1 rules.

`OpenCardOne` / `OpenCardTwo` (the slot checkboxes' ONCHECK, and the first call): `MemcardOpen` = 1 / 2; the port;
no card -> for slot 1, a card in slot 2 moves the strip (`MemoryCard.op4`), else #576; for slot 2, #580; `Slot_title` #577; unformatted -> a literal popup
(the "not formatted" notice of ONL-01's `netcfg` frames, `buttons #226 -> SitHere`), LOGIN and SELECT disabled, EDIT
NETWORK CONFIGURATIONS active; else `Slot_title` #559 (slot 2: a literal), `NetCnfClose`, `NetCnfOpen(mc0:|mc1:)`, and
`TestUIVar(netcnf_db)` false -> #578 / #581 (no configuration); true -> `NetCnfCurrCombo(SELECTED_COMBO)`,
`COMBOLIST.op7` / `HWLIST.op7(SELECTED_COMBO)`, `DescriptionText` #579, `PasswordSecurity`, `.DINK`, SELECT enabled,
LOGIN active. A `NETCNF_ERROR` event (posted by `NetCnfOpen` with `NETCNF_ERRNO` = the error, D:L123199-123206) runs
`OnNetCnfError`: errno 15 -> #585, else #586.

### 2.4 The configuration rows, the slot and the HARDWARE line

R128.5 and R128.6. The entry layout as the EE reads it (`DAT_00457c40`: a 48-byte head, the default index at +4,
then entries of 0x68 bytes): +0 the flags (a row only when >= 0), +8 the combination's key, +0x28 the display name,
+0x48 the third column. `NetCnfOpen` builds row i as (i + 1 by `FUN_00333700`, the formatted name, the +0x48 string)
(D:L123214-123224) and stores the list as `NETCNF_DB` (0x3eeba8; `FUN_003857c0` D:L123234). `NetCnfClose`
(`FUN_00277d50`) stores an empty list and clears the path.

## 3. The DNAS screen (`dlgNetAuthenticate`): ONL-03's unknowns

Layout (29 objects, no control): `DescFieldMid`, `Window`, the title and lower bars, `InfoTextT` (`_149_Back_MSG`),
`DNASLogo` (`DNASLogo.tif`), `DNASTrademark1` (`_532_DnasLogotype_MSG`), `bar_title` (`_533_AUTHENTICATING_MSG`),
`ONLINE_LOBBY_STATE` (`_446_START_MSG`), `ConnectingAnim`, `ConnectBackAnim`, and the progress strip `Progress_dummy`
with 17 descendants (`goldstreak.tif`, `backsolid.tif`, `LittleBlack.tif`). Bindings: TRIANGLE `exit_connect_screen`;
ONSTART `init_socom_online`, `Connect_flash`, `monitor_timeout`; `MP_DNAS_ERROR` `OnDNASError`; `MP_MEDIUS_ERROR`
`OnNetError`. `Connect_flash` runs `ScaleProgress`, the strip's endless 0.3-s steps (`LOOP forever`).

`init_socom_online` (R128.7) and its commands (R128.8): `InitNetwork` -> `FUN_00276dc0`; `DNASAuthenticate` ->
`FUN_002cc670`; `DMEInit` -> `FUN_00276ce0`; `MediusInit` -> `FUN_00276c60`; `GetServerList` -> `FUN_002fb080`;
`SWITCHMENU` -> `FUN_0027e720`; the library `Ensure_MC_Dirs_Fast` (`MC_Exists` `FUN_0027b1c0`, `MC_ChDir`
`FUN_0027b300`). The captions change only by the set's node commands: `bar_title.op1` (#448, #536) and
`ONLINE_LOBBY_STATE.op1` (#534, #535, #535, #537). `_538_ConnectFailureCaps_MSG` and the error ranges 1105-1144,
1232-1235 are named by neither layout nor set: the DNAS errors reach the screen as `INPUT_STRING` popups
(`OnDNASErrorContinue`, `OnDNASErrorHalt`, `OnNetError`), their text the event's. `exit_connect_screen` hides
`ConnectAnim`, a node this layout does not have (`dlgNetConnect`'s does: the set reads as copied from it).

The logo under the bypass: `TurnOnLogo` / `TurnOnTrademark1` (0 -> 1 in 0.8 s) are started without blocking and
`TurnOffLogo` / `TurnOffTrademark1` (1 -> 0 in 0.8 s) about a frame later when `DNASAuthenticate` is done at once: two
opacity motions on one node at a time. Which one the frame shows was not read (`DNAS_LOGO_OVERLAP_READING`). Whether
the first drawn frame shows the layout's `_533`/`_446` or the script's #448/#534 depends on ONSTART running before the
first draw (`DNAS_FIRST_FRAME_READING`).

## 4. Each dialog

Every chapter in full -- the widgets in file order (objects, then controls) with their captions, UI variables and
files; every binding with the set that defines its animation; the own set listed; the library animations reached;
the edges; the commands with their rows' functions; UI variables, valves, sounds and `UIMnLOC` ids -- is the pin's
`chapters[]` entry. Below, what each is for, in the order of the path.

### 4.1 `dlgNetLogin` -- LOGIN TO SOCOM II ONLINE

29 widgets (19 objects, 10 controls). Controls: `login_btn` (`_561_LOGIN_MSG`), `selectBtn` (`_562_SelectNetwork_MSG`),
`MemoryCard` RADIOSTRIP (`_563_SelectSlot_MSG`; `S1`, `S2`, `S0`), `configureBtn` (`_567_EditNetwork_MSG`),
`COMBOLIST` and `HWLIST` (`NETCNF_DB`). The ten `SOP1..5`/`TAUNT1..5` texts at x -600 bind `MPLOCALSOP1..5` /
`MPTAUNTMSG1..5` (off screen). Bindings: TRIANGLE `exit_net_login`; ONSTART `OnLoginRoomstart`; `ON_STATE_POP`
`menu_fade_up` (UIanim); `MP_MEDIUS_ERROR` `OnMultiplayerDisconnect` (UIanim); `NETCNF_ERROR` `OnNetCnfError`;
`MEMCARD_ERROR` `handle_memcard_error`; each control's ONACTIVATE sets `DescriptionText` (#569/#571 by `ComeFromLan`,
#575, #582, #583) and the title (#568 or #570); `configureBtn` CROSS `launchNTGUI2` (`SwitchMenu(SHUTDOWN)`: EDIT
NETWORK CONFIGURATIONS, N18). Sounds `.DINK`. Valves: `ComeFromLan`, `MemcardOpen`, `NetCnfIsInited`, `NeedNetAdapter`,
`AcceptNoFormat`, `SitHere`, `SelectedDifCombo`, `NETCNF_REQUIRED`, `NETCNF_ERRNO`, `net_config_is_init`.

### 4.2 `dlgNetAuthenticate` -- the DNAS screen

§3.

### 4.3 `dlgNetServerSelect` -- SELECT UNIVERSE

16 widgets: `bar_title` `_609_SelectUniverse_MSG`, `DescriptionTextLow` `_610`, `UnivText` `_611_UniverseNews_MSG`,
`SNText` `_612_UniverseName_MSG`, `OLText` `_316_ONLINE_MSG`, `UMUText` `_613_UsersMaxUsers_MSG`, `server_news`
WRAPPEDTEXT (`SERVER_NEWS`), `SERVERLIST` LISTBOX (`SERVER_LIST`). ONSTART `enter_server_select` (`LobbyDisconnect`,
`ChangeServerFocus`: `SERVERLIST.op6(SELECTED_SERVER)`, `UpdateServerInfo(SELECTED_SERVER)`); L1/L2 scroll the news
(each bound twice, as `dlgUsagePolicy`'s UP/DOWN); `MP_SUCCESS` `server_connected`; `MP_MEDIUS_ERROR` `OnNetError`
(REBOOT). The popup #614 (`_614_ConnectingToServer_MSG`) is `keep`. Sound `SND_DINK` (the only `SND_` spelling among the path's sounds).

### 4.4 `dlgNetPlayerName` -- the persona

26 widgets: `playername_btn` (`_317_PlayerName_MSG`), `passwd_btn` (`_251_PASSWORD_MSG`), `Store_Password` RADIOSTRIP
(`_588_SavePassword_MSG`), `hometown_btn` (`_591_HomeTown_MSG`), `gender_btn` (`_592_GENDER_MSG`), `connect_btn`
(`_452_CONNECT_MSG`), a SECURETEXT, and `PersonaList` (`PLAYERPERSONALIST`, a child of `MENUFADER`, `popupOp.tif`).
Keyboards: `PLAYERNAMEVAR`, `PLAYERPASSWORD`, `PLAYERHOMETOWN` (research 119 §5). Events: ONSTART (four),
`ON_SKB_APPLY`, `MEMCARD_ERROR`, `LOADED_FROM_MEMCARD`, `MP_MEDIUS_ERROR`, `MP_SYSTEM_MESSAGE`. Commands of note:
`GetMUISPersonaInfo`, `MUISPersonaExists`, `DeleteMUISPersona`, `NetCensorText`, `UpdateAcctInfo`, `LobbyLogout`.
The TRIANGLE (`leave_player_name_screen`) reaches `dlgAlbaniaCinematic` only through a library animation (the card
save's return, research 96 §3).

### 4.5 `dlgNetConnect` -- CONNECT TO SOCOM II

28 widgets (27 objects, 1 control: `ConnectAnim`, the last widget, a TEXT with a blank caption, which no binding
names and `exit_connect_screen` hides): `bar_title` `_448`, `ConnectingAnim` `_542_ConnectingSocom_MSG`, `playername`
(`PLAYERNAMEVAR`), `ONLINE_LOBBY_STATE` (a literal), and the DNAS screen's progress strip. Events: ONSTART `init_socom_online`,
`Connect_flash`, `monitor_timeout` (WAIT 90, `notify_unknown_failure`); `MP_MEDIUS_ERROR`, `MP_SYSTEM_MESSAGE`,
`MP_INVALID_PASSWORD`, `MP_PLAYER_LOGGED_IN` (#543), `MP_FILTER_FAILURE`, `MP_MEDIUS_FILE_DOES_NOT_EXIST`
(`StopProfileDownload`). Commands: `LobbyLogin` `FUN_0027dd20`, `LobbyRegister` `FUN_0027dde0`, `CharacterProfile`.
Its status captions are literals of the set (one per `socom_online_state`: 12, 7, 3, 8, 4, 9, 5, 10, 6, 11), not
`UIMnLOC` ids; `MP_PLAYER_LOGGED_IN` raises #543 (`_543_AccountInfoAlready_MSG`); the connect errors are 543-548 (N21).

### 4.6 `dlgUsagePolicy` -- USER AGREEMENT

14 widgets: three WRAPPEDTEXTs (`usage_policy` on `UsagePolicy`, `_762_RetrievingAgreement_MSG`; `UpDownText`
`_761`; `ContentChangeTxt`, a literal), `YesAccept` and `NoAccept` (literal captions `ACCEPT`, `DECLINE`). ONSTART
`retrieve_usage` (`RefreshRoomList`, `GetFriendInvitations`, `GetUsagePolicy` `FUN_002797c0`); UP/DOWN scroll;
LEFT/RIGHT move between the two buttons; NoAccept CROSS -> #763 (`buttons #246/#253`) and, on YES, log off and REBOOT.

### 4.7 `dlgWorldOfSOCOM` -- SOCOM II ONLINE

95 widgets; the eleven rows N6 lists (`newsandmessages` `_776` .. `Ignore` `_370`), seven lists (`LADDER_LEADERS`,
`CLAN_LADDER_LEADERS`, `CLAN_ROSTER`, `IgnoreListVar`, `FriendListVar`, `ROOMLISTVAR`, `MY_CLAN_INVITES`), `motd`
(`MEDIUS_MOTD`) with `ClanMessages` (`MEDIUS_CLAN_MESSAGES`), `playername` (`PLAYER_NAME_AND_TAG`), the news popup
`popup_motd_button` (`_780`). ONSTART runs eight animations, `UIanim.rdr`'s `net_monitor` among them (the network dot);
`init_screen` shows the news popup once (`PopupNewsOnce`), `GetMediusAnnouncements`, `CheckMyInvites`,
`ROOMLIST.op16`, a 30-s room-list refresh (`roomlist_autorefresh`, `LOOP forever`), `GetClan`. Music: `CallMusic` --
`VagStreaming(ON)` and `SOUND MUS_ONLINE_MENU` unless `StartMusic` is 1 (ONL-31). Events: `MP_JOIN_ROOM`,
`MP_MEDIUS_JOIN_GAME_FAILURE`, `MP_MEDIUS_READY_TO_CONNECT` (-> `dlgGameLobby`: the AUTOPLAY path), `MP_MEDIUS_BECAME_LEADER`,
`MP_MEDIUS_JOIN_ROOM_FAILURE`, `MP_CLAN_DISBANDED`, `ON_LADDER_REFRESH`, `MP_SYSTEM_MESSAGE`, `MP_RANDOM_GAME_FOUND`.
Rows -> dialogs: CLAN -> `dlgCreateClan` / `dlgManageRoster` / `dlgManageRosterLeader`; PLAYER RANKING ->
`dlgLadderLobby`; CLAN RANKING -> `dlgClanLadderLobby`; INVITATIONS -> `dlgRespondToInvites`; OPTIONS ->
`dlgOnlineOptions`; FRIENDS -> `dlgFriendList`; IGNORE -> `dlgIgnoreList`; BRIEFING ROOMS opens `ROOMLIST` in place.
Five animations bound on `RosterList` and `InvitedPlayers` are defined by no visible set (`DoSomething`, `OnMRosterLeaderStart`,
`OnRosterListScroll`, `BackToButtons`, `revoke_invite`): no-ops (research 95 §1.4).

### 4.8 `mp_rooms.rdr`

§5.

### 4.9 `dlgMPBriefingRoom` -- BRIEFING ROOM

91 widgets: `CRgame` `_242_CREATE_GAME_MSG`, `JoinGame` `_405`, `WatchGame` `_406`, `Player_list_button` `_523`,
`refreshlist` `_407`; lists `PLAYERLIST` (`ROOMPLAYERLISTVAR`), `GAMELIST` (`GAMELISTVAR`); `CHATLIST`
(`MEDIUS_CHAT_RECV_VAR`); `GameInfoText` (`GAME_INFO_DETAILS`); the player-info popup (`PLAYER_INFO_*`). R1 `do_chat`
(keyboard `CHATMESSAGE`); game passwords by keyboard (`PlayerGamePassword`, `SpectatorGamePassword`). Events: `USBKBD_ENTER`,
`ON_SKB_APPLY`/`2`/`CANCEL`, `MP_MEDIUS_JOIN_GAME_FAILURE`, `MP_INVALID_PASSWORD`, `MP_VERSION_NUMBER_ERROR`,
`MP_BANNED_FROM_GAME`, `MP_EJECT_SPECTATOR`, `MP_SYSTEM_MESSAGE`, `MP_MEDIUS_ERROR`. Commands of note: `JoinMPGame`,
`ConnectToGameServer`, `JoinGameServer`, `GetGameInfo`, `GameHasPassword`, `GameRejectsRank`, `SendMediusChat`,
`AddToIgnore`. Sounds `.DINK`, `.NEG`, `MUS_ONLINE_MENU`.

### 4.10 `dlgCreateGame` -- CREATE GAME

126 widgets; the thirteen rows of N10 as buttons `_227` .. `_239` in that order (`gamename_btn` .. `SelectGames`), the
play list (`PLAYLIST_MAIN` on `PLAYLISTVAR`; the map popup's `AVAILABLE_MISSIONS` on `AVAILABLE_MP_MISSIONS_VAR` and
`SELECTED_MISSIONS`), two SECURETEXTs on the passwords. SQUARE `create_game` (§1); TRIANGLE `create_game_exit`; each
row's CROSS steps its valve (`incr_num_players`, `SetNR_valve`, `SetRT_valve`, `set_FF_valve`, `SetEQ_limit_valve`,
`SpectatorSet`, `SetDefaultStatus`, `set_respawn_valve`, `incr_rank_restriction`, `FiddleClanAffiliation`). Keyboards:
`GAMENAMEVAR`, `PlayerGamePassword`, `SpectatorGamePassword`. Events: `MP_MEDIUS_JOIN_GAME_FAILURE`,
`MP_GAME_NAME_EXISTS`, `MP_SYSTEM_MESSAGE`, `MP_MEDIUS_ERROR`. Commands of note: `CreateMPGame`, `HostLANGame`,
`SetMPMissionSeq`, `GetAvailableMPMissions`, `RemoveNonSuppressionMaps`, `NetCensorText`.

### 4.11 `dlgGameLobby` -- the game lobby

56 widgets: `weaponselect` `_345_ARMORY_MSG`, `Glswitchteams` `_346_SwitchTeams_MSG`, `PlayerReady` `_347_READY_MSG`;
`B_SPECLIST`, `B_SEALLIST`, `B_REDLIST` (`BSPECLISTVAR`, `BSEALLISTVAR`, `BTERRLISTVAR`), `B_CHATLIST`
(`BCHATLISTVAR`), `TalkerName` (`PLAYERTACOVAR`), `GameInfoText`. Its sets: its own, `UICharacterProfile.rdr`,
`uianim.rdr`, `UIHardDiskAnim.rdr`. Buttons: TRIANGLE `exit_lobby`, CIRCLE (team voice: `do_team_button_down/up`,
`do_circle_button_down`), SQUARE, R1 `do_chat` (`CHATTEXT`). Events: `ON_SKB_APPLY`/`2`, `USBKBD_ENTER`,
`ON_FORCE_NEW_DB`, `MP_VERSION_NUMBER_ERROR`, `MP_EJECT_SPECTATOR`, `MP_EIGHTY_READY`, `MP_SYSTEM_MESSAGE`,
`HDD_ERROR`, `MP_MEDIUS_ERROR`. Sounds `.COUNTDOWN`, `.DINK`. Commands of note: `CheckForcedLaunch`, `ForceMPLaunch`,
`ReadyToLoad`, `IsSessionMaster`, `SwitchSides`, `IsSwitchTeamsOK`, `CheckTeamStatus`, `ForceMediusStatusReport`,
`InitializeOnlineArmory`, the `Choose*` and `DoAllSelCharsHave*` of the ARMORY (research 95), `VCButton`, `SendChatText`.

### 4.12 `dlgLoad` -- the loading screen

Nine widgets (research 125 §1); `SCRIPT_LIBRARY` names only `dlgLoad.rdr`, which no zAnim archive of `RUN/` holds
(each map's `LDZANIM.ZAR` does, research 125 R125.3): the chapter's own set is empty and its six bindings
(`SpinLoadingCD`, `OnMenuStart`, `WatchForHDDError`, `ON_LOAD_COMPLETE` `load_complete`, `MP_VERSION_NUMBER_ERROR` and
TRIANGLE `exit_load_screen`) resolve to `none` here. UI variables `load_picture`, `Load_progress`, `mission_title`,
`mission_description`; `_2000_ToReturn_MSG`.

### 4.13 The rest of N1

widgets / controls (BUTTON, LISTBOX, RADIOSTRIP, SECURETEXT ...); bindings; own animations; the screen's events; what
its edges reach; the keyboards' UI variables.

| dialog | widgets / controls | bindings | animations | events | reaches | keyboards |
|---|---|---|---|---|---|---|
| dlgOnlineOptions | 26 / 8 | 27 | 20 | ONSTART, MP_MEDIUS_ERROR, ON_SKB_APPLY, MP_SYSTEM_MESSAGE, LOADED_FROM_MEMCARD | dlgSetSOP, dlgSetTaunts, dlgOnlineFilters, dlgWorldOfSOCOM; library: dlgAlbaniaCinematic, REBOOT | PlayerDescription |
| dlgOnlineFilters | 29 / 8 | 26 | 25 | ONSTART, MP_MEDIUS_ERROR, MP_SYSTEM_MESSAGE | dlgOnlineOptions; library: REBOOT; (`return`: `PREVIOUS_SCREEN`, R128.10) | -- |
| dlgSetSOP | 32 / 6 | 18 | 7 | ONSTART, ON_SKB_APPLY, MP_MEDIUS_ERROR, MEMCARD_ERROR, MP_SYSTEM_MESSAGE | library: REBOOT | `$1` |
| dlgSetTaunts | 32 / 6 | 16 | 5 | ONSTART, MP_MEDIUS_ERROR, MP_SYSTEM_MESSAGE | library: REBOOT | `$1` |
| dlgFriendList | 59 / 12 | 44 | 38 | ONSTART, MP_MEDIUS_ERROR, ON_SKB_APPLY2, MP_PLAYER_NOT_FOUND, MP_PLAYER_IS_FRIEND, MP_FRIEND_CONFIRMATION_REQUESTED, MP_SYSTEM_MESSAGE | library: REBOOT | CHATMESSAGE, CHATTEXT, PLAYER_FRIEND_NAME |
| dlgIgnoreList | 23 / 4 | 19 | 14 | ONSTART, MP_MEDIUS_ERROR, MP_PLAYER_NOT_FOUND, MP_IGNORE_LIST_FULL, MP_SYSTEM_MESSAGE, PLAYER_IS_IGNORED | library: REBOOT | PLAYER_IGNORE_NAME |
| dlgCreateClan | 21 / 2 | 14 | 9 | ONSTART, MP_CREATE_CLAN_SUCCESS, MP_CREATE_CLAN_FAILURE, MP_FILTER_FAILURE, MP_MEDIUS_ERROR, ON_SKB_APPLY, MP_SYSTEM_MESSAGE | dlgManageRosterLeader; library: REBOOT | `$1` |
| dlgManageRoster | 53 / 7 | 19 | 18 | ONSTART, MP_MEDIUS_ERROR, MP_MEDIUS_BECAME_LEADER, MP_CLAN_DISBANDED, MP_SYSTEM_MESSAGE | dlgWorldOfSOCOM, dlgManageRosterLeader; library: REBOOT | CHATMESSAGE |
| dlgManageRosterLeader | 63 / 14 | 47 | 37 | ONSTART, ON_SKB_APPLY2, MP_DISBAND_CLAN_SUCCESS, MP_DISBAND_CLAN_FAILURE, MP_MEDIUS_ERROR, MP_PLAYER_IS_LEADER, MP_LEADERSHIP_TRANSFER_SUCCESS, CLAN_MESSAGE_ID_ERR, CLAN_MESSAGE_EMPTY, MP_SYSTEM_MESSAGE | dlgWorldOfSOCOM, dlgManageRoster, dlgInvitedPlayers; library: REBOOT | CHATMESSAGE, SEND_CLAN_MESSAGE, Clan_Description |
| dlgInvitedPlayers | 28 / 5 | 21 | 15 | ONSTART, MP_PLAYER_NOT_FOUND, MP_MEDIUS_ERROR, MP_PLAYER_ALREADY_MEMBER, MP_PLAYER_ALREADY_INVITED, MP_PLAYER_IS_LEADER, ON_SKB_APPLY, MP_CLAN_FULL, MP_SYSTEM_MESSAGE | library: REBOOT | PLAYER_INVITE_NAME |
| dlgRespondToInvites | 27 / 5 | 17 | 11 | ONSTART, MP_MEDIUS_ERROR, MP_SYSTEM_MESSAGE | dlgWorldOfSOCOM; library: REBOOT | -- |
| dlgLadderLobby | 67 / 5 | 19 | 13 | ONSTART, MP_MEDIUS_ERROR, ON_LADDER_REFRESH, MP_SYSTEM_MESSAGE, MP_PLAYER_NOT_FOUND | library: REBOOT | CHATMESSAGE |
| dlgClanLadderLobby | 27 / 2 | 16 | 5 | ONSTART, MP_MEDIUS_ERROR, ON_LADDER_REFRESH, MP_SYSTEM_MESSAGE | library: REBOOT | -- |
| dlgNetError | 2 / 0 | 3 | 3 | ONSTART, MP_MEDIUS_ERROR | REBOOT; library: dlgWorldOfSOCOM, dlgLANBriefingRoom | -- |
| dlgNetAbort | 4 / 0 | 4 | 3 | ONSTART, MP_MEDIUS_ERROR | library: dlgWorldOfSOCOM, dlgLANBriefingRoom, REBOOT | -- |
| dlgNetAbandoned | 0 / 0 | 3 | 3 | ONSTART, MP_MEDIUS_ERROR | library: dlgWorldOfSOCOM, dlgLANBriefingRoom, REBOOT | -- |
| dlgNetBanned | 3 / 0 | 3 | 2 | ONSTART, MP_MEDIUS_ERROR | library: dlgWorldOfSOCOM, dlgLANBriefingRoom, REBOOT | -- |
| dlgDownloadPatch | 33 / 2 | 12 | 13 | ONSTART, MP_MEDIUS_ERROR, MP_DOWNLOAD_ERROR | REBOOT | -- |
| dlgReturnFromNTGUI2 | 0 / 0 | 1 | 1 | ONSTART | dlgNetLogin | -- |
| dlgAfterErrorReboot | 0 / 0 | 1 | 1 | ONSTART | dlgMenu | -- |
| dlgAfterReboot | 1 / 0 | 1 | 1 | ONSTART | dlgMenu | -- |
| dlgMultiplayerRound (READERX) | 87 / 2 | 4 | 24 | ONSTART | dlgNetBanned, dlgNetError, dlgUsagePolicy, REBOOT, dlgLANBriefingRoom, dlgMPBriefingRoom, dlgWorldOfSOCOM, dlgMISSIONSELECTION | -- |
| dlgMultiplayerFinal (READERX) | 88 / 2 | 3 | 22 | ONSTART | dlgMultiplayerFinalReally, dlgNetError, dlgUsagePolicy, REBOOT, dlgLANBriefingRoom, dlgMPBriefingRoom, dlgWorldOfSOCOM, dlgMISSIONSELECTION | -- |
| dlgMultiplayerFinalReally (READERX) | 75 / 8 | 5 | 27 | ONSTART | dlgGameLobby, dlgNetBanned, dlgNetError, dlgUsagePolicy, REBOOT, dlgLANBriefingRoom, dlgMPBriefingRoom, dlgWorldOfSOCOM, dlgMISSIONSELECTION | -- |

`$1` is the keyboard's UI variable as the script names it in `dlgSetSOP`, `dlgSetTaunts` and `dlgCreateClan`
(`do_chat`, `SetVariable`): a parameter the calling binding fills, not a variable of that name. The three READERX
screens resolve their sets in `MPZANIM.ZAR` first (`resolveSets`); their many targets are the round's end in each mode.

### 4.14 `dlgOnlineFilters` -- ONLINE FILTERS (OPTIONS -> FILTERS; AUTOPLAY's filters)

29 widgets (21 objects, 8 controls); `SCRIPT_LIBRARY` `dlgOnlineFilters.rdr`, `uianim.rdr`; background
`multplay_back.tif`. Title `bar_title` `_638_OnlineFilters_MSG`; `playername` (`PLAYER_NAME_AND_TAG`) with the five
medal images; `game_type_desc` (`MissionNameUIVar`), `game_player_desc`, `game_speed_desc`; the network dot. Controls in
order: `gamestype` `_639_MapType_MSG`, `NumPlayersTab` `_640_LbOfPlayers_MSG`, `responsetime`
`_641_ResponseTime_MSG`, `FF` RADIOSTRIP `_232_FriendlyFire_MSG` (`FF_ON`, `FF_OFF`, `FF_NOPREF`), `Pword` RADIOSTRIP
`_251_PASSWORD_MSG` (`EN`, `DIS`, `NoPref`), `resetFilters` `_647_ResetFilters_MSG`, `return` `_67_RETURN_MSG`.
Bindings (26): ONSTART `net_monitor`, `ActivateGames` (zero the change valves, copy each filter into its `TEMP*` twin,
`ActivateButton(gamestype)`), `ActivateMedalOfMerit`; TRIANGLE `OnFiltersBack` (with any change, a literal popup
`buttons #246/#253 -> AreYouSure`; NO restores the `TEMP*` copies; then `SWITCHMENU(dlgOnlineOptions.rdr)`);
`MP_MEDIUS_ERROR` `OnMultiplayerDisconnect`, `MP_SYSTEM_MESSAGE` `OnSystemMessage` (UIanim); each control's
ONACTIVATE its help line; CROSS `increment_game_filter` (`GameTypeMapIndex` 0 -> 251 -> 250 -> 252 -> 249 -> 248 -> 1
.. `NumMultiMissions` -> 0, `GetMissionInformation` per map), `increment_player_filter` (`GamePlayerFilter` 0, 2, 4 ..
14, 0), `increment_speed_filter` (`GameSpeedFilter` 65000 -> 300 -> 600 -> 1200 -> 65000); the strips' NONE bindings
set `FF_FILTER` 1/0/2 and `GamePasswordFilter` 0/1/2; `resetFilters` CROSS `OnResetBtnDwn` (type 0, players 0, speed
65000, `FF_FILTER`, `LockedFilter`, `GamePasswordFilter` 2; `DescriptionText` #648); `return` CROSS
`goto_menu(PREVIOUS_SCREEN)` (UIanim: the R128.10 target, so the graph shows no edge for it). The filter valves are
the ones `dlgWorldOfSOCOM`'s AUTOPLAY row shows (R128.14). Sounds `.DINK`, `SND_DINK`. `UIMnLOC` ids 638-672 with 67,
68, 149, 150, 232, 251 (the pin's `locs`). Commands: `ActivateButton`, `GetMissionInformation` `FUN_00275ef0`,
`PopUpDialog`, `SwitchMenu`, and the disconnect path's `LobbyBailout`, `UnInitNetwork`, `NetCnfClose`, `NetCnfUninit`,
`StopAllSounds`, `VagStreaming`. The screen is ONL-15's.

### 4.15 AUTOPLAY and the clan icons (the block's Gap and Unknowns)

**AUTOPLAY belongs here, as a row of `dlgWorldOfSOCOM`, not a dialog of its own (R128.14).** The row `autoplay`
(`_778_AUTOPLAY_MSG`, the third of N6's eleven): ONACTIVATE `aplaytext` shows the filters panel in place (`O_filters`
#783, `DescriptionText` #784, the other panels hidden; `refresh_filter_screen` fills it from the valves of §4.14);
CROSS `join_random_game`: `StartMusic` = 1, `.DINK`, popup #801 (`keep`), the progress strip, `JoinAsSpectator` = 0,
`JoinMPGame(RANDOM)` (`FUN_0027d730`). The server's answer is one of three screen events of the same chapter:
`MP_RANDOM_GAME_FOUND` -> `random_game_found` (a literal popup, `keep`); `MP_MEDIUS_JOIN_GAME_FAILURE` ->
`OnRandomGameFailure` (#803, the strip stopped); `MP_MEDIUS_READY_TO_CONNECT` -> `join_game` (wait for
`socom_online_state` 17, `ConnectToGameServer` `FUN_0027e4c0`, `CheckJoinMP` while `mp_join_game` is 9,
`JoinGameServer` `FUN_0027e380`, WAIT 2, `SWITCHMENU(dlgGameLobby.rdr)`; a 30-s `monitor_timeout` aborts). So AUTOPLAY
ends in the same lobby as JOIN GAME, with no briefing room between; its pick rule is the server's (ONL-15's unknown).

**No `clan_icon_NN` file exists on the disc (R128.13).** The ELF names one format, `clan_icon_%.2d.tif` (0x3f4310), and
formats it in three places: `FUN_002e7b80` (D:L187209) and `FUN_002e7d70` (D:L187242) with index 0 into a buffer they
then overwrite with the clan stats string `%.3d%.12d%s` (0x3f4328), whose first field -- the icon index -- they write as
0; `FUN_002e8bd0` (the `GetMyClans` answer, D:L187819-187822) with the `atoi` of the stats' first three characters
(V6), into a stack buffer nothing reads afterwards. Of the 142 ZAR/ZED archives under `RUN/` (every one parsed with
`Zar`), no member is named `clan_icon*`, and no loose file of the disc tree holds the string; the only other names are
`dlgManageRosterLeader.rdr`'s `ClanIcon` (a string of the layout's file, no widget of it; its set's six `SHOW ClanIcon`,
in `OnEditNewsBtn`, `OninvitedplayersBtn`, `OnremoveplayersBtn`, `OnViewInfoBtn`, `OndisbandclanBtn` and
`OnappointleaderBtn`, name a node the layout does not have) and `_145_ClanIcons_MSG`, which no chapter here names. The
set of existing icons is therefore empty, and the two writers read write the index as 0; whether another client (or a
server) ever wrote a non-zero index is not a disc question (`CLAN_ICON_INDEX_READING`).

## 5. `mp_rooms.rdr`

A list of 12 rooms in file order, each `LIMIT` 256: four test rooms first (`ZIPPER`, `RTime TEST`, `SONY TEST` and a
developer's keep-out room), then eight regional rooms (US CENTRAL, US EAST, US WEST, EU EAST, EU WEST, AUSTRALIA, ASIA
EAST, ASIA WEST); each with a game list (medleys and per-map games, `FRIENDLYFIRE` 0 or 1 -- the regional rooms
alternate 1 and 0 from US CENTRAL on --, `MAXPLAYERS` 16, a `MISSION_SEQUENCE` of map ids). The pin
holds every room and game (`mpRooms`). No reader is known (R128.11); our Horizon's room names (N8) do not come from it.

*2026-10-17 (SA-1): R128.11 settled at the reading level (reviewed 2026-10-17, PASS WITH FINDINGS, folded) -- the retail ELF has no reader of
`mp_rooms.rdr` (no string, no built name, no `.rdr` load handed it), the disc names it only in READERC's own key table,
and the table looks like a development leftover carried from SOCOM 1: research 342 §1 (it answers §8's
`MP_ROOMS_READER_READING`).*

## 6. What this changes elsewhere

- **N4** (segment 05): "ONLINE -> Select MEMORY CARD slot (`A_30`) -> LOGIN" -- the popup belongs to the boot path's
  `intro_onstart`, seen in s4 after the return from EDIT NETWORK CONFIGURATIONS (R128.3); from the main menu with the
  configuration loaded, ONLINE reaches LOGIN with no slot popup.
- **N5**: the HARDWARE line's source is entry +0x48, which the recomp's eznetcnf answer leaves empty (R128.6).
- **N7**: the caption order and the commands are R128.7-R128.8; `_538` and the DNAS error ids are confirmed named by
  neither layout nor set.
- **ONL-01's unknowns**: answered by R128.2-R128.5; whether `netcfg1..7` are PCSX2's or the recomp's is not a disc
  question and stays ONL-32's.
- **ONL-03's unknowns**: the caption order (R128.7) and visibility under the bypass (R128.9) at the reading level.
- **Research 96** (PLAT-06's): `SWITCH_STATES` misses `PREVIOUS_SCREEN`, handled in `SwitchMenu` itself (R128.10); the
  graph therefore has no edge for `dlgUsagePolicy`'s return to a previous screen, nor for `dlgOnlineFilters`' `return`
  (`goto_menu(PREVIOUS_SCREEN)`, §4.14). Not changed here (`tools/dialogInventory.ts` is PLAT-06's): owed to PLAT-06's
  rule, and a stream that walks the graph misses these edges until then.
- **ONL-15** (filters and AUTOPLAY): the screen and the row are §4.14-§4.15 (R128.14); the pick rule stays its unknown.
- **SVC-08 / V6** (clan icons): R128.13.

## 7. The tool's rules

- A chapter is built for one dialog with `resolveSets`' visible sets (research 96 §8, `SET_RESOLUTION_READING`); the
  library animations are those its bindings and its own animations call, followed through `CALL`, first definition
  wins.
- UI variables: the layout's `UIVAR`s, then the arguments of every bound function whose name contains `UIVar`
  (`ClearUIVar`, `TestUIVar`, `CopyUIVar` ...), sorted -- not every variable a command reads by convention
  (`NetGetInterfaceList`'s `NETDEVICE_LIST` is not in the list; the listing shows it).
- A command's row is found by the dispatcher's key (`uiCommandKey`, the ASCII fold): `SWITCHMENU` cites `SwitchMenu`;
  `NA` (a node-less command naming no function, `init_socom_online`'s failure branch) has no row and answers 1.
- A literal caption or popup text the scripts spell is kept as `<text N>`; a single word (`ACCEPT`) stands as a name.

## 8. Readings

| name | what is not read | what would settle it | status |
|---|---|---|---|
| `NETLOGIN_CHECKING_POPUP_READING` | that #572/#573 never reach a drawn frame (raised and killed in one script step) | a 1 frame/s recomp capture of LOGIN's first second, or PLAT-36's call trace of `PopUpDialog`/`KillPopUp` with the frame number | *note only* (open) |
| `DNAS_LOGO_OVERLAP_READING` | which of two concurrent opacity motions on `DNASLogo` the frame shows when `DNASAuthenticate` is done at once | the runtime's motion order (research 106 §2 per instance) read for `OBJECT_OPACITY_FROM_TO`, or ONL-32's capture | *note only* (open) |
| `DNAS_FIRST_FRAME_READING` | whether the first drawn frame of the DNAS screen shows the layout's `_533`/`_446` or the script's #448/#534 | the menu's load order (research 115) against ONSTART's first tick, or a capture | *note only* (open) |
| `CLAN_ICON_INDEX_READING` | whether any clan stats string ever carries a non-zero icon index (the two writers read, `FUN_002e7b80`/`FUN_002e7d70`, write 0; no `clan_icon_NN.tif` is on the disc) | SVC-08's clan records on the local stack, or a capture of a clan page | *note only* (open) |
| `MP_ROOMS_READER_READING` | what reads `mp_rooms.rdr` (no ELF string names it) | a search of the ELF for the member read by index or by a built name; a Medius server's channel config | resolved by research 342 §1 (no reader in the retail ELF; reading, reviewed 2026-10-17) |

## 9. Regenerating

`SOCOM_DISC=<disc tree> npx tsx tools/dump-online-dialogs.ts --pin` rewrites the pin; the dev-disc test then passes and
the diff says what moved. The unit test's path edges are written out by hand: a pin that loses one fails in CI.
