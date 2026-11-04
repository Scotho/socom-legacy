# 139 -- The intro shell: dlgIntroScreen -> dlgIntroCinematic -> dlgSecondCinematic -> dlgMenu, its stubs, its timing and its route (BOOT-04)

Written 2026-10-02 for BOOT-04 (`../roadmap/02-boot.md` "BOOT-04"; facts B7-B11, B15, B9's times; the owner's
"proceed agentically through creating the entire game opener zipper text -> trailer -> menu"). Its number: 134-136 are
the card slices' on `agent/online` and 137 is `agent/opener-movie`'s movie-audio note (both merged there after this
branch was cut at 51389ad5) and 138 is MENU-01a's (`agent/menu`, merged there 2026-10-03), so 139 is the next free one
above them (this note was 137 until its first review found the clash, then 138 until the merge found the second; the
range line in `../PROCESS.md` is the controller's).
Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line;
cited, never pasted); the retail ELF's strings read by address with `tools/elfImage.ts`; the disc's `RUN/UI/READERC.ZAR`
and `RUN/UIZANIM.ZAR` through the repository's readers (`parseRdr`, `parseAnimSets`, `decodeUiProgram`; the ops below
are decoded data, RS.R8); the f0 card's options save (`$SOCOM_PC_ROOT/logs/parity/f0/mc0/BASCUS-97275SOCOMII/`,
decoded with the desktop's `tools_py/card_save.py` `unscramble` + `parse_zar` and `parseRdr`); the archived captures
(`logs/parity/runs/pcsx2_mission_a/`, `logs/parity/gate/x51_gate_iop/title/`); research 96 §3.2, 98 §1, 115, 116, 121
§10, 129, 130. The desktop's KNOWN is evidence (`desktop@be557831:docs/KNOWN.md:72`, the card-folder row).

The code: `packages/ui/src/boot/opener.ts` (the opener: the loader's screens, then the game's boot through PLAT-10's
machine), `bootBindings.ts` (the stubbed card and hardware rows), `screenButtons.ts` (step 4 of the input dispatch);
the fix in `packages/ui/src/screens/screenScripts.ts` (§4); the route table's pass-throughs
(`packages/ui/src/routes/menuRoutes.ts`) and the adapter's drive (`packages/viewer/src/menuRoutes.ts`); the page's
entry `packages/viewer/src/frontEnd.ts`. The tests: `packages/ui/test/boot/introShell.test.ts` (CI: the sequence and
its ticks on a synthetic clock with a fake movie source, over synthetic programs that transcribe §2),
`bootBindings.test.ts`, `screenButtons.test.ts`, `packages/ui/test/screens/screenScripts.test.ts` (§4's regression),
`packages/ui/test/routes/menuRoutes.test.ts` and `packages/viewer/test/menuRoutes.test.ts` (§6),
`packages/viewer/test/frontEnd.test.ts`, and `tools/test/introShellDisc.test.ts` (dev disc + the built wasm + the
captures: the whole opener on the disc's own scripts with the page's decoder, scored, §7). Confidence: **reading,
pending review** for every transcription; the three SONY448 frames are **capture-scored** (§7); the stubs are
placeholders by the block's own words (§3, §8).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R139.1 | **The opener runs end to end in the original's order on the disc's own scripts**: the loader's PULOADGP and LOADING (research 130), `dlgIntroScreen`'s ONSTART (`do_onstart` -> `intro_onstart` -> `load_initial_config` -> `find_a_memcard`, `DisplayLoadingWarning`, `Ensure_MC_Dirs_Fast`, `LoadConfig`, `ListSavedGames`, `StoreOptions`) -> `SWITCHMENU dlgIntroCinematic.rdr`; `sony448.pss` from its build, event 3 -> `switch_menu dlgSecondCinematic.rdr`; `Intro_2.pss`, its end -> `goto_menu_silent dlgMenu.rdr` or any of thirteen keys -> `goto_menu dlgMenu.rdr`; `dlgMenu` over `menuloop.pss` | `Opener`; `introShell.test.ts`, `introShellDisc.test.ts` | §1, §2, §5 |
| R139.2 | **The boot never left `dlgIntroScreen` before this task**: PLAT-10's `screenScripts` built the runtime over all 95 sets of `RUN/UIZANIM.ZAR` in archive order, and `FUN_0026a250`'s by-name search found `do_onstart` in `dlgAfterErrorReboot.rdr` (set 29, not loaded) before `dlgIntroScreen.rdr`'s (set 35), so the ONSTART start was refused. The original's context holds the dialog's `SCRIPT_LIBRARY` sets alone, loaded in order (`LOADED_SETS_READING`) | `screenScripts.ts`; `screenScripts.test.ts` | §4 |
| R139.3 | **Sixteen rows stubbed with cited returns for one state** -- the f0 card in slot 1 (inserted, formatted, holding the options save and seven saves), nothing in slot 2, a controller connected, no hard disk, NTSC: `IsControllerConnected`, `IsMemCardInserted`, `IsMemCardFormatted`, `MC_ChPort`, `MC_ChSlot`, `MC_Exists`, `MC_ChDir`, `MC_MkDir`, `LoadConfig`, `ListSavedGames`, `IsSpaceForSaveGameFile`, `MC_Changed`, `StoreOptions`, `HardDriveOperation`, `CheckVideoMode`, `SwitchProgressiveVideo`. BOOT-05 replaces the card's, BOOT-09 the hardware's | `bootBindings.ts` | §3 |
| R139.4 | **The f0 card's `video_mode` and `HDD_ENABLE` are both 0** (its `PersistentValves.rdr`, decoded): the DTV check (`load_initial_config`'s `video_mode == 1`) and the HDD branch (`do_onstart`'s `HDD_ENABLE == 1`) are not taken on this state | §3 | §3 |
| R139.5 | **The timing is the scripts' and the manager's, measured on the transcription at PLAT-12's tick (1001/30000 s)**: the loader 96 ticks (3.20 s: research 130's placeholders); `dlgIntroScreen`'s ONSTART 55 ticks to the switch (`find_a_memcard`'s 1 s, two 0.3 s waits, the fader's 0.05 s, a tick per blocking call and command); a switch to a build 18 ticks after the switch's frame (15 of fade, 3 of countdown, the dispatch); SONY448 313 ticks from its open to the next switch (310 pictures, the empty tick, the event's, the switch's A5); Intro_2 3839 the same way. The main menu builds at tick 4357 (145.4 s) unskipped, or 18 ticks after a key | `introShell.test.ts` | §5 |
| R139.6 | **Against B9 (the recomp's call trace)**: ours reads `dlgIntroScreen` at 3.20 s (B9 3.4), `dlgIntroCinematic` at 5.64 s (B9 6.8), opens SONY448 the same tick (B9 7.1, 0.3 s after its dialog), Intro_2 at 16.68 s (B9 19.2). The differences -- 1.0 s across the card checks, 1.1 s across SONY448 -- are the recomp's card reads, file opens and CD stream starts, which are not constants of the code; the console's own are BOOT-01's | §5 | §5 |
| R139.7 | **The route `/` covers the whole boot**: the two cinematics are pass-throughs of `dlgMenu`'s route (`through`), so no address is written while they play, `/main` replays them into M's history as the original's forward switches leave it, and the adapter drives Forward through both in order | `menuRoutes.ts` (both) | §6 |
| R139.8 | **The frames the page draws while SONY448 plays match the captures at 100.0**: pictures 38, 137 and 232 through the opener, PLAT-21's player, the layer and PLAT-14's drawer against `pcsx2_mission_a/s02`, `s03`, `s04` (mad 0.0002, 0.0001, 0.0004) and the recompiled game's `w00_006` (0.0001) -- research 98 §1's decoded-picture matches, now through the page's whole path | `introShellDisc.test.ts` | §7 |
| R139.9 | **What the main menu's first frame holds** (MENU-02a's from here): the MENULOOP picture (black with the page's stand-in source, §8), MENUFADER from 0.99 to 0 over 0.75 s (`SetMenuValve`'s `OBJECT_OPACITY_FROM_TO`), and 94 undrawn items -- six widgets, three textured sprites (SplashLogo, LEGALEZE ...), two glyph runs, the roller model: PLAT-15's widgets and the textures placeholder (research 115 §15) | `frontEnd.ts`; a scratch run | §7 |

## 1. The order (B7-B11, B15; research 96 §3.2)

1. The loader `SCUS_972.75`: PULOADGP, then LOADING (research 130 §3; `LoaderScreens`). The game ELF starts and the
   game object's constructor writes `dlgIntroScreen.rdr` as the menu state's default dialog (`FUN_001e7530`
   D:L47915-47968, B7); CG's first request switches to MS (`FUN_002d04d0`, research 115 §7), whose Init builds it.
2. `dlgIntroScreen` (`TYPE IMAGE`, a blank file name, no object, no button): `SCRIPT_LIBRARY dlgIntroScreen.rdr,
   uianim.rdr, UIMemCardAnim.rdr, UIHardDiskAnim.rdr`; `EVENT ONSTART do_onstart`, `EVENT MEMCARD_ERROR
   handle_memcard_error`. Its ONSTART ends in `SWITCHMENU dlgIntroCinematic.rdr` (§2).
3. `dlgIntroCinematic` (`TYPE MPEG run/movies/common/sony448.pss`, no object, no button): ONSTART `TurnOffVagStream`
   (`VagStreaming OFF`), then the movie opens at build step 9 (research 121 rows 4-5); 310 pictures, one a tick; at
   its end event 3 -> `switch_menu` with the binding's `ARGUMENT dlgSecondCinematic.rdr` (`SWITCHMENU INPUT_STRING`,
   research 115 §2's wrappers; the argument carried by PLAT-10's `startBinding`).
4. `dlgSecondCinematic` (`TYPE MPEG run/movies/Intro_2.pss`, `SCRIPT_LIBRARY uianim.rdr` alone): `EVENT ONMPEGEND
   goto_menu_silent dlgMenu.rdr`; `BUTTON` START, CIRCLE, SQUARE, TRIANGLE, CROSS, UP, DOWN, RIGHT, LEFT and `TRIGGER`
   R1, R2, L1, L2 -> `goto_menu dlgMenu.rdr` (`SND_DINK`, `menu_fade_up` stopped, the switch). SELECT is not bound.
5. `dlgMenu` (`TYPE MPEG run/movies/common/menuloop.pss`): its ONSTART `PulseArrows`, `UiStopAttract`, `SetMenuValve`
   (which flushes M's history), `has_memcard_changed` (a 1.5 s poll of `MC_Changed`, B10), `CleanupMissionMemory`.
   The menu itself is MENU-02a's.

## 2. The scripts' ops on the f0 path (decoded with `decodeUiProgram`; the branches the state takes)

`dlgIntroScreen.rdr/do_onstart` (one auto-start sequence): `IF NOT(IsControllerConnected)` -- `ControllerConnected = 0`,
`POPUPDIALOG`, the POPUP node command (text id 0: PLAT-16's), `WHILE ControllerConnected == 0` (a wait on the pad) --
`ENDIF`; `CALL intro_onstart` (blocking); `IF HDD_ENABLE == 1` -- `hard_disk_error_code = 0`, `POPUPDIALOG`, `WAIT 0.3`,
`IF HardDriveOperation(OPEN)` -- `hard_disk_error_code = 0`, `HardDriveOperation(GET_MISSION_DATA)`, `IF
hard_disk_error_code != 0` -- `CALL DisplayHDDError`, `HDD_ENABLE = 0` -- `ELSE` `CALL DisplayHDDError`, `HDD_ENABLE =
0` -- `ENDIF`; `SWITCHMENU dlgIntroCinematic.rdr`. (The set's `SwitchToProgressiveVideoE3`, `verify_video_dtv_E3`
and `handle_memcard_error` are started by nothing on this path; B15.)

`UIanim.rdr/intro_onstart`: four sequences; the one that starts with the animation is `end_of_screen`: `CALL
load_initial_config` (blocking). (`old_and_busted`, `check_formatted` and `do_formatting` are `CALL_SEQUENCE`
targets nothing on this path reaches -- research 98 §4.1's "believed unreached".)

`UIMemCardAnim.rdr/load_initial_config`: `IF memcard_have_loaded_config == 0` -- `KeepTryingMemcardLoad = 1`; `WHILE
KeepTryingMemcardLoad == 1` -- `KeepTryingMemcardLoad = 0`; `IF memcard_already_selected == 0` `CALL find_a_memcard`
`ENDIF`; `IF IsMemCardInserted` -- `IF NOT(IsMemCardFormatted) AND IsMemCardInserted` (the format loop: `AskToFormat`,
`AreYouSureYouWantToFormat`, `do_formatting`; not taken) `ENDIF`; `IF IsMemCardFormatted` -- `CALL
DisplayLoadingWarning`; `MemcardAlreadyHasData = 0`; `CALL Ensure_MC_Dirs_Fast`; `IF MemcardAlreadyHasData == 0 AND
IsMemCardInserted` (the no-data branch: `NoSOCOMDataFound2` / `CannotSaveNoSpace`; not taken) `ELSE` --
`memcard_error = 0`, `LoadConfig BASCUS-97275SOCOMII`, `ListSavedGames`, `WAIT 0.3`, `IF memcard_error == 1` (`CALL
DisplayErrorLoading`; not taken) `ELSE` `IF video_mode == 1` `IF NOT(CheckVideoMode DTV)` `CALL
SwitchToProgressiveVideo` `ENDIF` `ENDIF` `ENDIF` -- `ENDIF` -- `ELSE` (the unformatted card's `AcceptNoData` popup;
not taken) `ENDIF` -- `ELSE` (no card: the MENUFADER dim to 0.7, the `AcceptNotInserted` popups 826 ...; not taken)
`ENDIF`; `KILLPOPUP`; `memcard_have_loaded_config = 1`; `OBJECT_OPACITY_FROM_TO MENUFADER 0.7 -> 0 in 0.05 s` --
`END_WHILE` -- `ENDIF`; `StoreOptions`.

`UIMemCardAnim.rdr/find_a_memcard`: `num_memcards = 0`; `POPUPDIALOG` (text 827, "Searching MEMORY CARD slots ...");
`WAIT 1`; `MainMenuCardSlot = 0`; `MC_ChPort 0`; `IF IsMemCardInserted` `num_memcards += 1` `ENDIF`; `MainMenuCardSlot =
1`; `MC_ChPort 1`; `IF IsMemCardInserted` `num_memcards += 1` `ELSE` `MainMenuCardSlot = 0`, `MC_ChPort 0` `ENDIF`; `IF
num_memcards > 1` `CALL choose_memcard_slot` (the slot select, B12 s01; not taken with one card) `ENDIF`.

`UIMemCardAnim.rdr/DisplayLoadingWarning`: `POPUPDIALOG`; the POPUP node command with text 842 (slot 1) or 843
(slot 2) by `MainMenuCardSlot`; `WAIT 0.3`. `Ensure_MC_Dirs_Fast`: `IF MC_Exists ..` `MC_ChDir ..` `ENDIF`; `IF
MC_Exists BASCUS-97275SOCOMII` `MemcardAlreadyHasData = 1`, `MC_ChDir BASCUS-97275SOCOMII` `ENDIF`.

`UIanim.rdr`: `goto_menu` = `SOUND SND_DINK`, `STOP_ANIMATION menu_fade_up`, `CALL_SEQUENCE switch` (= `SWITCHMENU
INPUT_STRING`); `goto_menu_silent` the same without the sound; `switch_menu` = `SWITCHMENU INPUT_STRING`;
`menu_fade_up` (flags 0x21, auto-start) = `OBJECT_OPACITY_FROM_TO MENUFADER 1 -> 0 in 1.5 s`.
`dlgIntroCinematic.rdr/TurnOffVagStream` = `VagStreaming OFF`.

The CI test's synthetic programs (`introShell.test.ts`) assemble exactly the ops above that the f0 path executes, with
the disc's waits and the IFs on the stubs, and leave out the branches it does not take and the POPUP node commands.
The dev-disc test runs the disc's own programs and lands on the same ticks (§5).

## 3. The stubs (`BootStubs`; each the body's answer for the modelled state)

The state: the f0 card -- `desktop@be557831:docs/KNOWN.md:72`'s rule (an empty or missing card folder is an inserted,
formatted PS2 card; `sceMcGetInfo` is asked one thing, is the type 2) and the folder the desktop's run left
(`logs/parity/f0/mc0/BASCUS-97275SOCOMII/`: `BASCUS-97275SOCOMII` 4,784 B, `icon.sys` 964, `LIST.ICO` 50,234,
`PATCHFILE.DAT` 2,048,000, `SaveGame0..6` 1,952 each, `SCRATCHPAD.DAT` 944,128; research 99 §7.2: 2,993 clusters,
5,007 free) -- in slot 1 (port 0); nothing in slot 2; a controller; no HDD; NTSC (B1).

| row | body | the original's answer | the stub's | replaced by |
|---|---|---|---|---|
| `IsControllerConnected` | `FUN_00277150` D:L122778-122802 | the argument parsed as a number (`NA` is 0): with 0, the pad object `DAT_0044f108`'s word +0xdc == 1; with a non-zero argument no object, false | true for `NA`/`0`, false for a port | BOOT-09 (PLAT-11's pad) |
| `IsMemCardInserted` | 0x27e1b0 -> `FUN_003a1650` D:L295921-295953 | `sceMcGetInfo(port, slot)` up to twice; result > -10 and type 2; an error fires `MEMCARD_ERROR` (0x3fbc78) into MS | port 0 true, port 1 false | BOOT-05 |
| `IsMemCardFormatted` | 0x27e1a0 -> `FUN_003a1580` D:L295886-295918 | `sceMcGetInfo`'s formatted flag | port 0 true, port 1 false | BOOT-05 |
| `MC_ChPort`, `MC_ChSlot` | `FUN_0027b260` D:L124858-124874, `FUN_0027b200` D:L124839-124855 | the argument >= 0 into the card object's port (`DAT_00436480`) / slot (`DAT_00436484`); 1 | the same, on `BootCardState` | BOOT-05 |
| `MC_Exists` | `FUN_0027b1c0` D:L124826-124836 -> `FUN_003a0950` | the card's exists | at the root: `BASCUS-97275SOCOMII` only; in the folder: `..` and the twelve names; nothing in port 1 | BOOT-05 |
| `MC_ChDir`, `MC_MkDir` | `FUN_0027b300` D:L124890-124900 -> `FUN_003a07d0`; `FUN_0027b2c0` D:L124877-124887 -> `FUN_003a0890` | the directory change / mkdir (their answers, the decompiler shows no return) | into the folder or `..` to the root; mkdir nothing (the folder exists); 1 | BOOT-05 |
| `LoadConfig` | `FUN_0027b0e0` D:L124789-124813 | `CSaveManager_Load` (`FUN_003a1730`) of the folder, then the UI variable `AUTOMESSAGES` read and `FUN_005e7fb0(1 or 0)`; 1 | the two boot valves written (`video_mode` 0, `HDD_ENABLE` 0: the f0 card's `PersistentValves.rdr`, decoded); the other 63 and the account records not (`LOAD_CONFIG_VALVES_PLACEHOLDER`); 1 | BOOT-05, OPT-02 |
| `ListSavedGames` | `FUN_002801c0` D:L127435-127556 | the `SavedGames` list filled from the card; 1 | 1 | MENU-13 |
| `IsSpaceForSaveGameFile` | `FUN_0027b3d0` D:L124930-124944 | free KB (`FUN_003a1210`), plus the save's size when under 2999, above 2999 | 5,007 > 2999: true; false with no card | BOOT-05 |
| `MC_Changed` | `FUN_0027b340` D:L124903-124927 | `FUN_003a1370(card, 1, &slot)`'s changed flag; `mc_changed_slot` (0x3eef30) written with the slot | false, `mc_changed_slot` 0 (the desktop's second launch on the same folder: no prompt, KNOWN L72 `s8_save_second`) | BOOT-05 |
| `StoreOptions` | `FUN_0027b960` D:L125111-125258 | the options valves applied to the game's globals (02-boot O11); 1 | nothing applied; 1 | OPT-02 |
| `HardDriveOperation` | `FUN_00278980` D:L123579-123656 | `OPEN` (0x3eed20): `FUN_0039d050`'s status into `DAT_00414eb0`; 0: the `HDD_ERROR` callback, `DAT_004a37b0` = 1, answers 1; else `hard_disk_error_code` (0x3eed30) = 1, 2, 3 by the status or 5, answers 0. `GET_MISSION_DATA`: the `.ZDB` entries marked; `CLOSE`: closed; both 1 | `OPEN` false with `hard_disk_error_code` = `HDD_ABSENT_STATUS_READING` (1: `FUN_0039d050` D:L293424-293506 answers 1 when `DAT_0049e2dc` is set, 0 on a mount, 2 on a failed mount; which non-zero a console without an HDD gives was not traced); the others 1 | BOOT-09 |
| `CheckVideoMode` | `FUN_0027c070` D:L125309-125332 | `NTSC` (0x3ef140): `DAT_004a44f5 == 0`; `DTV` (0x3ef148): `== 2`; else true (O7) | the mode NTSC: `NTSC` true, `DTV` false | BOOT-09 |
| `SwitchProgressiveVideo` | `FUN_0027bf90` D:L125281-125306 | `NTSC` -> `DAT_004a44f4` = 0, `DTV` -> 2; 1 | nothing switched; 1 | BOOT-09 |

Not stubbed, left to PLAT-08's table answers: `VagStreaming OFF` (`FUN_0027a5e0` D:L124465-124490, 1; PLAT-23's
stream), and the menu rows PLAT-10 registered. On the f0 path the stubs answer, in order: `IsControllerConnected(NA)`,
`MC_ChPort(0)`, `IsMemCardInserted` (true), `MC_ChPort(1)`, `IsMemCardInserted` (false), `MC_ChPort(0)`,
`IsMemCardInserted`, `IsMemCardFormatted`, `IsMemCardInserted`, `IsMemCardFormatted`, `MC_Exists(..)` (false),
`MC_Exists(BASCUS-97275SOCOMII)`, `MC_ChDir(BASCUS-97275SOCOMII)`, `IsMemCardInserted`, `LoadConfig`, `ListSavedGames`,
`StoreOptions`; then on `dlgMenu` `MC_Exists` twice, `MC_ChDir`, `MC_Changed` every 1.5 s (pinned by both tests).

The block's third unknown -- `dlgIntroScreen`'s controller-check popup text and condition -- is half read: the
condition is `IsControllerConnected`'s (the pad object's state word == 1); the popup's text id is 0 in the POPUP node
command (its record's words 6, 7, 150, 180: PLAT-16's record decode, research 118), not read here.

## 4. The loaded sets (`LOADED_SETS_READING`; a drift found in PLAT-10)

Build step 8 (`FUN_00367950` D:L263692-263734) walks the dialog's `SCRIPT_LIBRARY`: each name is opened from the
archive into the zAnim context at 0x414bb0 (`FUN_00268250(ctx, path, name)`), found (`FUN_0026a100`) and activated
(`FUN_0026c600`); the unload (step 1, `FUN_00369210`) stops and releases them. `FUN_0026a250` (D:L115013-115072),
which every binding and `CALL` goes through, searches that context's set list: the current set (`DAT_00414be4`, the
last activated: after a build the library's last; the review of 2026-10-03 read it at D:L115029-115049), then the others in
load order (research 106 §8's `CALL_SET_SEARCH_READING`). So the sets a dialog's scripts can reach are its library's,
in its order.

`screenScripts.ts` gave the runtime all 95 sets of `RUN/UIZANIM.ZAR` in the archive's order and activated the
library's. A name two sets share then resolved to the first in the archive: `do_onstart` is in
`dlgAfterErrorReboot.rdr` (set 29), `dlgIntroScreen.rdr` (35), `dlgReturnFromNTGUI2.rdr` (65), `dlgReturnFromNTGUI2LAN.rdr`
(66) and `dlgAfterReboot.rdr` (67); `handle_memcard_error` in eleven sets from `dlgControllerPresetsRG.rdr` (32) on. The
boot's ONSTART found set 29's, inactive, and `start` refused it: `menu_fade_up` ran (one copy, in `UIanim.rdr`), the
fader reached 0, and nothing else happened -- which is what PLAT-10's disc test checked (the fade) and research 115 §14
recorded as the boot opening. Fixed: the runtime is built over the library's sets in order (a name the archive lacks
skipped, as `FUN_0026a100`'s null is at D:L263713). The regression test is `screenScripts.test.ts`'s last case; every
other test of `packages/ui` passes unchanged (693).

## 5. The sequence and its timing

Measured on the transcription at PLAT-12's tick (`UI_TICK_SECONDS` = 1001/30000 s), the same on the CI test's
synthetic programs and on the disc's (`introShellDisc.test.ts`); the ticks are from the opener's first frame:

| step | tick | seconds | what sets it |
|---|---|---|---|
| the loader's screens | 0-95 | 0-3.20 | research 130: `LOADING_HOLD_PLACEHOLDER` 2.5 s + 21 fields of fades + 0 s placeholders |
| `dlgIntroScreen` built; ONSTART | 96 | 3.20 | CG's switch to MS on the first game frame |
| `SWITCHMENU dlgIntroCinematic.rdr` consumed | 151 | 5.04 | 55 ticks: `find_a_memcard`'s `WAIT 1`, `DisplayLoadingWarning`'s 0.3, `LoadConfig`'s 0.3, the fader's 0.05 (49.4 ticks) + a tick per blocking `CALL` and the commands between |
| `dlgIntroCinematic` built, SONY448 opened | 169 | 5.64 | 18 ticks: the fade to black at 2 x min(dt, 0.05) per frame (15 at 29.97 Hz; research 115 §4.1 n = 15 at 1/30), the three-frame countdown, the dispatch |
| event 3, `switch_menu` consumed | 482 | 16.08 | 313 ticks: 310 pictures, one a tick (research 121 §9), the empty tick (row 6), the event's tick (row 8), the switch's A5 on the next |
| `dlgSecondCinematic` built, Intro_2 opened | 500 | 16.68 | 18 ticks |
| event 3, `goto_menu_silent` consumed | 4339 | 144.8 | 3839 ticks: 3836 pictures + 3 |
| `dlgMenu` built, MENULOOP opened | 4357 | 145.4 | 18 ticks |
| a key during Intro_2 | k | | `goto_menu` the same frame (A1 before A3); the switch consumed on that frame's A5; the build 18 ticks later -- fewer when `menu_fade_up` has not finished (the fader's opacity is already high: 4 ticks at picture 3 in the disc test) |

**Against B9** (`logs/run_20260924_074500.log`, the recomp's file reads): `dlgIntroScreen.rdr` 3.4 s (ours built at
3.20), `dlgIntroCinematic.rdr` 6.8 s (ours 5.64), `sony448.pss` 7.1 s (ours 5.64, the same tick as its dialog),
`Intro_2.pss` 19.2 s (ours 16.68). The intervals: the card checks 3.4 s there, 2.44 s here (the recomp's `sceMcGetInfo`
on the IOP, its save-folder reads and the overlay's file opens are time the stubs do not spend; the 1 s `WAIT` and two
0.3 s waits are the scripts' and common to both); SONY448's open to Intro_2's 12.1 s there, 11.04 s here (310 pictures
at 29.97/s = 10.34 s, the end's two ticks, the switch's 0.63 s; the recomp's extra second is its CD stream start and
file open before picture 0, research 121 §7's "the first picture is presented by the next tick"). None of the
difference is a constant of the code, so no `*_READING` stands for it: the console's times are BOOT-01's (a PCSX2 boot
at >= 2 Hz) and the hold rule BOOT-02's (H19). The block's "proven level" -- the binding-call order against a recomp
`PS2X_CALL_TRACE` on `FUN_002745a0` from boot to the menu -- is PLAT-36's; §3's order is what it will be compared with.

The input (research 116 §3): the opener runs step 4 of `FUN_00368650` alone -- the screen's BUTTON bindings against
the pad record, the first match fires, one per frame, a match with no animation consumes (`SCREEN_BUTTONS_STEP_READING`)
-- in the shell's A1 slot (no switch in flight, no `SuspendMenuInput`). The two cinematic dialogs have no control and
no popup for steps 1-3 to act on; the stick's flick as a press is not modelled. Since the merge of 2026-10-03 PLAT-11's
dispatcher is the page's input: the `Opener` runs the machine's `input` first on every frame and fires this step-4
call after it, on a test's `tap` alone. The test's pad record is the caller's: the page's `FrontEndSession.press(name)`
taps one button (FALLING on one frame, RISING on the next, R116.1) -- a test hook and a browser adaptation; the
page's own pad is PLAT-11's reader (`input.read`).

## 6. The route `/` (research 129)

The routes stream's root is `dlgIntroScreen.rdr` ("the loading screen, the boot's first dialog"). The two cinematics
are now pass-throughs of `dlgMenu`'s route (`through: ['dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr']`): they are the
boot's own (research 96 §3.4's class "boot"), shown by their movies' time, never navigated to, and each forward switch
pushes the screen it leaves (research 115 §1.2), so M's history at `dlgMenu`'s build holds the three -- which
`/main`'s replay now rebuilds exactly (then `dlgMenu`'s `SetMenuValve` flushes it, as on the boot). While they play
the address stays `/`; at `dlgMenu` it becomes `/main`. The adapter's two changes: the mirror no longer skips a frame
whose top is a pass-through (the key already drops it: `/` across the cinematics, `/main` across `dlgMPswitch`, no
write either way), and the Forward drive steps through a route's pass-throughs in order, as many as are already on
top of the stack having been gone through (one before: `dlgMPswitch` alone). The edge-pin test skips edges under the
root (the boot's script, not an online edge). `routeCanonicalStack('dlgMenu.rdr')` and the unknown-path plan carry the
three; the tests' pinned stacks were updated with them.

## 7. The scores, and what is owed by row

`tools/test/introShellDisc.test.ts` runs `FrontEndSession` as the page does -- the disc's dialogs, sets and loader
pictures; PLAT-21's host over a Node picture source on the page's decoder core (`MovieDecoder` on `libmpeg2.wasm`,
RGBA out, one picture primed before each tick as the worker would have it) -- and rasterises the frame through
PLAT-14's drawer at the pictures research 98 §1 matched to the captures, scored by `judge` (the gate's whole-frame rule,
the 640x480 captures squeezed onto the grid; no mask). The one run feeds two tests kept apart: the sequence (the ticks
below) and the captures; the capture test skips VISIBLY, naming the missing file, unless all four archived captures are
under `SOCOM_PC_ROOT/logs/parity/`, and when it runs it asserts all four rows scored (the first review found it
returning silently with `SOCOM_PC_ROOT` unset: 1 passed, nothing scored -- a host without the archive could report the
acceptance met). Measured 2026-10-02:

| manifest row | capture | picture | score | mad |
|---|---|---|---|---|
| `boot.sony-card-typing` | `logs/parity/runs/pcsx2_mission_a/s02_CROSS.png` | 38 | **100.0** | 0.0002 |
| `boot.sony-card-fade` | `pcsx2_mission_a/s03_CROSS.png` | 137 | **100.0** | 0.0001 |
| `boot.zipper-card` | `pcsx2_mission_a/s04_CROSS.png` | 232 (the tie 229-265) | **100.0** | 0.0004 |
| `boot.zipper-card` | `logs/parity/gate/x51_gate_iop/title/w00_006.png` (recomp, 640x448) | 232 | **100.0** | 0.0001 |
| `boot.loading-logo` | `pcsx2_mission_a/s00_CROSS.png`, `w00_000.png` | the LOADING hold | 99.9 / 100.0 | research 130 §4 (unchanged) |

The bar is the block's 90; all exceed it, and the whole-frame score cannot tell a dark frame from black (W7.R8), so
the s03 row's 100.0 is the match's `mad` 0.0001 against black's 0.0004-level rivals, as research 98 §1 found. The
test pins 100 and mad <= 0.001 on each.

**Owed by row** (no frame of ours to score, or none of the original's):

| row | state | why, and whose |
|---|---|---|
| `boot.card-searching` (`virgin_card/s00`) | `dlgIntroScreen` during `find_a_memcard`'s 1 s | the popup (text 827) is `POPUPDIALOG` + a POPUP node command: the page's entry has no popup component connected (`POPUP_COMPONENT_PLACEHOLDER`, PLAT-16) and no glyphs (`FRONT_END_TEXTURES_PLACEHOLDER`), so the frame is black under MENUFADER. Owed to PLAT-16's connection and the textures; the capture is the recomp's, PCSX2's is BOOT-01's |
| `boot.card-slot-select` (`golden/s01`, `s4_pcsx2/A_01`) | two cards | not this state (one card); BOOT-05's |
| `boot.card-no-data` (`golden/s02`, `virgin_card/s01`) | a virgin card | not this state; BOOT-05's |
| `boot.intro2-opening` (`pcsx2_mission_a/s05`, `virgin_card/s02`, `golden/s06`) | `dlgSecondCinematic` | no picture index is matched to the dark `s05` (research 98 §4.1's "believed the opening fade") and `virgin_card/s02` / `golden/s06` are flyover frames at unknown pictures; a match by picture is owed to research 98's method on Intro_2 (PLAT-19c's / BOOT-01's timed boot); the page draws Intro_2's pictures through the same path as SONY448's |
| `menu.main` (title `s00`, the first menu frame) | `dlgMenu` | MENU-02a's: §0 R139.9 says what is drawn |

In the page itself (`?devmode&menuflow` at `/`) the movies were black until 2026-10-03: the session's picture source
was `BlackPictureSource`. Since MOVIE-WIRE (2026-10-03, `agent/movie-wire`) `mountFrontEnd` hands the session
PLAT-19c's `MovieWorkerSource` over the served tree, its pictures drawn by PLAT-14's drawer (`movieFramePicture`), with
PLAT-20's sound (`viewer/src/frontEndMovies.ts`; research 120 §11 and research 137 §5, the dated paragraphs). The
sequence, the ticks and the dialogs are the same with either source; a late picture slows the movie by its tick
(research 121 §15), so a switch on ONMPEGEND comes that much later. Held by `viewer/test/frontEndMovies.test.ts` and
the rendered run `viewer/e2e/openerMovies.spec.ts`.

## 8. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `BOOT_CARD_STUB_PLACEHOLDER` (`ui/src/boot/bootBindings.ts`) | the eleven card rows answering from a table for the f0 card in slot 1, slot 2 empty | §3; the simulated card (PLAT-25, PLAT-26) is not behind them; BOOT-05 replaces every one | open |
| `BOOT_HARDWARE_STUB_PLACEHOLDER` | `IsControllerConnected` connected, `HardDriveOperation OPEN` no HDD, `CheckVideoMode` NTSC, `SwitchProgressiveVideo` nothing | §3; BOOT-09 replaces them (PLAT-28's screen where the original offers the branch) | open |
| `LOAD_CONFIG_VALVES_PLACEHOLDER` | what `LoadConfig` restores | the f0 card's `video_mode` 0 and `HDD_ENABLE` 0 written; the other 63 persistent valves, the UI variables and the account records not; BOOT-05 / OPT-02 | open |
| `HDD_ABSENT_STATUS_READING` | `FUN_0039d050`'s status with no hard disk | 1 (`DAT_0049e2dc` set) or 2 (a failed mount): the flag's writer not read; 1 stands; BOOT-09 | open |
| `SCREEN_BUTTONS_STEP_READING` (`ui/src/boot/screenButtons.ts`) | the input dispatch reduced to its step 4 on the cinematic dialogs | §5; since the merge of 2026-10-03 PLAT-11's whole dispatcher runs first and this call fires on a test's `tap` alone | open |
| `LOADED_SETS_READING` (`ui/src/screens/screenScripts.ts`) | the sets a dialog's scripts search | §4: the `SCRIPT_LIBRARY` sets in order (build step 8, `FUN_0026a250`); the context pointer `+0x34` ("current set") was not traced beyond research 106 §8 | open |
| `MOVIE_SOURCE_PLACEHOLDER` (`viewer/src/frontEnd.ts`) | the page's movie picture source | `BlackPictureSource` until PLAT-19c's worker source (`FrontEndSessionOptions.source`) | resolved 2026-10-03 (MOVIE-WIRE): `mountFrontEnd` hands the session PLAT-19c's `MovieWorkerSource` with PLAT-20's sound (`viewer/src/frontEndMovies.ts`); the constant removed |

Reused, not added: research 130's five placeholders and readings (the loader's holds), research 115's and 121's.

**How a stream replaces a stub row** (for BOOT-05, BOOT-09, OPT-02): `Opener`'s constructor builds `BootStubs` and
registers all sixteen rows into the host (`BootStubs.register` -> `UiCommandHost.setHandler`) with no option to omit
one; a replacement is `opener.host.setHandler(name, handler)` after the Opener is built -- PLAT-08's registry keeps one
body per row and the last `setHandler` wins (`uiCommands.ts`: "fill (or replace) a row's body after construction"), so
a stream swaps its rows in place and leaves the others answering as §3 says. `opener.stubs` stays the stubs' log for
the rows not yet replaced. An option on `OpenerOptions` to leave rows unregistered is not added here: the first stream
that needs a row absent rather than replaced adds it (none does on this state's path, every row called is answered).

## 9. Settled, not settled, owed

- **Settled at the reading level**: the chain and its scripts (§1, §2); the stubs' bodies and the state they answer for
  (§3); the loaded-set rule (§4); the sequence's ticks on the transcription (§5); the route (§6). **Capture-scored**: the
  three SONY448 frames through the page's path (§7).
- **Found, not this task's** (MENU-02a's, PLAT-07's / PLAT-14's): at `dlgMenu`'s build two fades run on MENUFADER at
  once -- `menu_fade_up` (1 -> 0 in 1.5 s, auto-started with `UIanim.rdr`) and `SetMenuValve`'s `OBJECT_OPACITY_FROM_TO
  0.99 -> 0 in 0.75 s` -- each stepping the node by its own rate (-2.0 per s together), so the opacity passes 0 at
  about 0.5 s and sits near -0.38 until `menu_fade_up` writes its 0 at 1.5 s (seen in the browser run: `fader -0.38`
  0.73 s after the build). The 2D adaptor sets the quad's alpha to f x 128 for any f < 1 (`drawnAlpha`), and the
  drawer blends with that alpha unclamped, which would *brighten* a non-black picture beneath; what the original's
  alpha byte does with a negative product was not read. With the black stand-in source nothing shows; with PLAT-19c's
  pictures it would. A clamp at the adaptor, or the original's conversion, is the owner of those files' to settle.
  *(Since MOVIE-WIRE, 2026-10-03, the page draws MENULOOP's pictures under `dlgMenu`, so the brightening is in reach of
  a rendered run for the menu's first 1.5 s; not measured there.)*
- **The browser run** (2026-10-02, headless Chromium on the dev server at port 5313 with a partial served tree --
  the five files the entry reads under `public/maps/`, git-ignored): `/?devmode&menuflow` runs the loader (LOADING
  drawn), `dlgIntroScreen` at opener t 3.20 s, the switch at 5.04, `dlgIntroCinematic` + sony448 at 5.64, the end at
  16.08, `dlgSecondCinematic` + Intro_2 at 16.68, START (the window hook `__frontEnd.press`) at 17.55 -> `dlgMenu`
  built at 17.98 with the address `/` -> `/main`; no clock loss; the menu's first frame black (§0 R139.9). The page's
  own `?devmode` playtest overlay draws over the front end's canvas (the page's, not this task's). Reproduced on the
  review's fix round (2026-10-02, the same path on port 5304, a Playwright script in the agent's scratch folder): the
  same four dialogs at 3.20 / 5.64 / 16.68 s, START at ~17.7 -> `dlgMenu` at 18.28 s, 23 stub calls, one button, the
  address `/main`, the canvas's 640 x 448 all black at the menu's first frame (`getImageData`: 0 non-black pixels),
  21.3 s of wall time. Without a key the run sits in `dlgSecondCinematic` past 60 s: the stand-in source plays Intro_2
  to its own end, so a browser run that wants the menu presses START as the disc test does.
- **Not settled**: the controller popup's text (§3); `FUN_0039d050`'s status without an HDD; the console's wall time
  from power-on to the menu (B9 is the recomp's; BOOT-01); whether anything outside the dialog ends SONY448 early
  (research 98 §5, 121 §12: the player has no skip and the dialog binds none -- the page honours that; PLAT-11's
  shell-wide handler read is what is left).
- **Owed, and whose**: the pictures and the sound in the page (PLAT-19c, PLAT-20) -- *connected 2026-10-03 by
  MOVIE-WIRE (§7)*; the input (PLAT-11: the pad reader, the keyboard, the whole dispatcher); the card popups'
  content and the `SND_DINK` on a key skip (PLAT-16, PLAT-23: the host's `sound` callback is not wired in the entry);
  the card's real screens and reads (BOOT-05), the hardware branches (BOOT-09); the proven level (PLAT-36's call
  trace, BOOT-01's timed boot); `boot.intro2-opening`'s picture match (§7); the main menu (MENU-02a).
