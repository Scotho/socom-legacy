# 02 -- Boot (`BOOT-`)

Power-on to the main menu and back: the loader's raw screens, the opening Sony and Zipper cards, the intro movie, the
boot memory-card check, the hand-off to the main menu over MENULOOP, the idle attract loop, the relaunch dialogs, the
locale and the hardware branches. The campaign skip does not touch this segment: all of it runs before any mission.
The movie player, the card store and the dialog runtime it uses are platform pieces (01).

Conventions: [README](README.md#conventions).

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| B1 | `SYSTEM.CNF`: `BOOT2 = cdrom0:\SCUS_972.75;1`, `VER = 1.02`, `VMODE = NTSC` | `game/disc/SYSTEM.CNF` |
| B2 | The loader `main()` is `FUN_001c4cc0`; it loads SIO2MAN, CDVDSTM, SIO2D, DBCMAN, DS2U_S1, MCMAN, MCSERV from `\RUN\IRX\` in retry loops | `game/analysis/SCUS_972.75.decomp.c` L43391-43530; `SCUS_972.75.strings.txt` L300-323 |
| B3 | `\RUN\RAW\PULOADGP.RAW` blitted 640x128 at y=160 (`FUN_001c6570(fd,0x280,0x80,0,0xa0)`) | SCUS L43503-43515 |
| B4 | The loader checks the card for `BASCUS-97275SOCOMII` / `APACHE00.ZDB` | SCUS L43630-43645; strings 0x1d4430, 0x1d4448 |
| B5 | `\RUN\RAW\LOADING.RAW` blitted full screen 640x448 (`FUN_001c6570(fd,0x280,0x1c0,0,0)`), 1,146,880 B = 640x448x4, sent as seven 640x64 CT32 strips | SCUS L43647-43661; KNOWN [raw-strips] (decomp 44718, 45100/45108) |
| B6 | No card patch: `FUN_001c59c0` loads `DNAS.BIN`, then `FTSCORE` + `ZSEALETC` from `cdrom0:\OVERLAY\REL\`. With a patch: `FUN_001c5b30` shows `PUNOTREM`/`PUNOTRE2.RAW` (640x128 at y=160) and loads overlays from the card. `PUPUTBAK`/`PUPUTBA2.RAW` referenced at L43964-43967. All PU*.RAW are 327,680 B | SCUS L43674-43760, L43964 |
| B7 | `CMenuState` ctor `FUN_001e7530` sets the default menu `dlgIntroScreen.rdr` (0x3e1870); states "MenuState" (0x3e1888), "Cinematic" (0x3e1898) | D:L47915-47960 (L47937) |
| B8 | Menu-state init `FUN_001f4860` mounts `run/ui` + readerc, reads `uisounds.rdr` and `sounds.rdr` | D:L54780-54870; web R95 L668-671 |
| B9 | Recomp boot order (call trace): `dlgIntroScreen.rdr` + `UIMemCardAnim.rdr` + `UIHardDiskAnim.rdr` at 3.4 s, `dlgIntroCinematic.rdr` 6.8 s, `run/movies/common/sony448.pss` 7.1 s, `run/movies/Intro_2.pss` 19.2 s | `logs/run_20260924_074500.log` |
| B10 | Shell flow on our exe: `do_onstart`, `intro_onstart`, `load_initial_config` -> START -> `goto_menu` -> `menu_fade_up`, `UiStopAttract`, `SetMenuValve`, `has_memcard_changed`, `Ensure_MC_Dirs_Fast`, `GetNumSavedGames` (SaveGame0..9), a 1.5 s `has_memcard_changed` poll | `docs/archive/STATUS-log-to-2026-09-26.md` L2476-2484 |
| B11 | First run (virgin card), our exe: slot popup -> "loading" warning -> "no SOCOM data found" -> StoreOptions -> SONY448 -> INTRO_2 -> `goto_menu` -> dlgMenu over MENULOOP | STATUS log L2497-2501 |
| B12 | PCSX2 boot captures: s00 logo + LOADING..., s01 "Select MEMORY CARD slot", s02-s03 "SONY COMPUTER ENTERTAINMENT AMERICA / PRESENTS" typed with a block cursor, s04 "DEVELOPED BY / ZIPPER INTERACTIVE, INC." typed, s05 dark (movie), s06 main menu; at 8.4 / 37.2 / 41.2 / 44.5 / 47.7 / 51.7 / 57.3 s. s02-s04 are SONY448.PSS pictures (in run a: s02 38-39, s03 137, s04 not determined -- the static Zipper card ties across 229-265 with the cursor's blink; corrected 2026-10-01 after review, said "38, 137, 229"), the typing and the cursor included; s05 is believed INTRO_2's opening fade; no capture shows a warning screen (web research 98 §1, §4.1) | `logs/parity/runs/pcsx2_mission_a/s00..s06*.png` + `manifest.json`; `pcsx2_title1`, `mb10_pcsx2` (and for s02-s05 also `pcsx2_mission_b..g`, `transition_pcsx2`); web research 98 |
| B13 | Our exe, virgin one-card: black -> "Searching MEMORY CARD slots..." -> "No SOCOM II ... data ... in MEMORY CARD slot 1. X CONTINUE." -> intro movie -> menu; no slot-select | `logs/parity/virgin_card/s00..s04*.png`, `drive.txt` |
| B14 | Our exe, existing card (gate run): LOADING logo, black, "DEVELOPED BY / ZIPPER" typed, menu up by ~22 s | `logs/parity/gate/x51_gate_iop/title/w00_*.png` |
| B15 | `dlgIntroCinematic` plays `sony448.pss`; ONMPEGEND -> `dlgSecondCinematic` (`Intro_2.pss`) -> ONMPEGEND `goto_menu_silent` -> `dlgMenu`; thirteen keys do `goto_menu` (START, CIRCLE, SQUARE, TRIANGLE, CROSS, the d-pad, R1, R2, L1, L2; not SELECT). `dlgIntroScreen` runs IsControllerConnected (popup), the memcard checks (`uianim.rdr` `intro_onstart`), HardDriveOperation, then SWITCHMENU -> dlgIntroCinematic; CheckVideoMode/DTV and its verify popup are `UIMemCardAnim.rdr`'s (`load_initial_config` -> `SwitchToProgressiveVideo`, reached from `intro_onstart`), and once DTV is switched on a 10 s safeguard reverts to NTSC (its `switch_safeguard` sequence: wait 10 s, `KillPopUp`, `SwitchProgressiveVideo(NTSC)`) unless the player accepts first. *Corrected by PLAT-06: the scratch read gave the DTV check to `dlgIntroScreen`; its own copy `SwitchToProgressiveVideoE3` is started by nothing, and "every button" is these thirteen.* *Corrected 2026-10-01 (PLAT-06's review): the reached check keeps its timeout -- the 10 s safeguard is `UIMemCardAnim.rdr`'s too; the unused E3 copy only adds a 15 s wait on the question.* `dlgIntroScreen` has no objects (`OBJECTS` and `BUTTONS` empty, an `IMAGE` background with a blank file name); `dlgIntroCinematic`'s background is `TYPE MPEG` `run/movies/common/sony448.pss`, no objects, no button bound | web R96 §3.2, §7 (`tools/dump-dialogs.ts --dialog dlgIntroScreen.rdr`, `--dialog dlgSecondCinematic.rdr`; the graph pinned by `tools/test/dialogInventoryDisc.test.ts`); the two layouts and the `dlgIntroScreen` set re-read with the repository's own `parseRdr`/`decodeUiSet` (re-runnable command in web research 98 §3) |
| B16 | MENULOOP: 640x448, 30 fps, 3732 pictures (124.40 s; web research 109 -- it read 3790 and ~126 s until PLAT-18's merge, 2026-10-02), not looped: `dlgMenu`'s background is `TYPE MPEG` (1), and its last ~230 pictures are black *(corrected 2026-10-03 by web research 141 §1 after research 121 R121.5: it read "loops on end")*; SONY448 310 pictures (~10.3 s; decoded and counted: 640x448, DAR 4:3, 30 fps, 10.33 s -- the Sony card pictures 11-140, the Zipper card 161-294); INTRO_2 3836 pictures, 29.97 fps | PC research 09 L46, L77; 16 L19-24; web research 98 §1 |
| B17 | Attract: ~110-120 s after the menu settles the menu fades and `dlgAttractCinematic` plays `Intro_2.pss` (flyovers with typed captions); any button -> dlgMenu; ONMPEGEND -> `goto_menu_silent`. Gate s19 (the fade) lands 114.4-114.7 s after s00 (the settled menu); PC research 09 L77-80 has MENULOOP created at 28 s from process start and frame 3600 (the attract switch) at 149 s from process start, i.e. ~121 s after MENULOOP's creation. The two measure the same idle from different origins and agree within ~7 s (the menu settles after MENULOOP is created) | PC research 64 §1; 16 §3, §9.6; 09 L80; `gate/x51_gate_iop/title/s21_none.png`; KNOWN [title-four-captures] |
| B18 | Title gate: s00..s18 the menu (>= 90 vs `scripts/parity/ref_main_menu_ours.png`), s19 the fade (83-90), s20.. the attract (49-74) | `tools_py/parity/gate.py` L80-107, L200-219 |
| B19 | Main-menu footer: `VERSION_STRING` "SOCOM 2 r0001 17:22:21 Oct 11 2003" (0x3e17e0), `_507_DevelopedZipper_MSG`, `_508_Copyright_MSG` | strings; `pcsx2_mission_a/s06_CROSS.png` |
| B20 | Locale: only `RUN/LOCALE/STATES/*.ZAR` on the disc; path forms D:L297101-297105; language setter `FUN_003a44b0` (D:L297630) writes `DAT_004a4018` and the `LanguageChoice` valve | disc listing; decomp |
| B21 | SOCOM 1 (reCOM): `CMenuState` default menu `dlgIntroScreen.rdr`; `StartEngine` shows `RUN\LOADING.RAW` as a raw framebuffer blit | `research/recom/src/Apps/FTS/state/st_menu.cpp` L26-77; PC research 11 L330-334 |
| B22 | `--menu_state <dlg>` picks the start dialog (`FUN_001eabd0`, option string 0x3e1e00); the online logoff relaunches with `dlgAfterErrorReboot.rdr`. `dlgAfterReboot` title `_48_NetworkError_MSG`, an OKValve popup -> dlgMenu; `dlgAfterErrorReboot` shows the HDD error then dlgMenu | PC research 78 §0; KNOWN [logoff-relaunch]; the dialogs' contents: web R96 §7 (`tools/dump-dialogs.ts --dialog dlgAfterReboot.rdr`, `--set dlgAfterReboot.rdr`; both names are in the ELF, R96 §3.5) |

## Tasks

### BOOT-01 -- Reference capture set for boot and attract (PCSX2 and recomp)
- **Goal:** one dense, timed record of the original from power-on to the attract and back, for every card state, that
  every other BOOT task is checked against.
- **What the original does:** known in pieces: B12 (per press, not timed per screen), B13, B14, B17/B18. No 1 Hz PCSX2
  record of a boot without presses, and none for no card, an unformatted card, two cards or an existing save.
- **Today:** nothing in SOCOM Legacy; the drive tooling is `tools_py/parity/drive.py`, `scripts/parity/title_menu.txt`.
- **Gap:** the reference itself.
- **Acceptance:** a manifest of PCSX2 captures at >= 2 Hz with no presses from boot to 30 s past the attract start, for
  each card state (none / virgin formatted / unformatted / existing save / both slots), plus one run with CROSS mashed;
  the same script on the recomp scores each matched step >= 90 with `compare.score`; audio dumped alongside
  (`PS2X_AUDIO_DUMP`; PCSX2 loopback). Rows land in PLAT-31's manifest. The window also takes every boot capture the
  segment's proven levels name: the PULOADGP placement and each screen's hold time (BOOT-02); the screen sequence and
  timings (BOOT-04); each card state's dialogs (BOOT-05); the MENULOOP loop seam (BOOT-06); two attract cycles and a
  press during the attract (BOOT-07); the HDD and video-mode branches (BOOT-09); the `dlgAfterReboot` popup (BOOT-10).
  Traces (call, MPEG, MC, PEEK) are PLAT-36's.
- **Dependencies:** an owner window for game runs (loop lock). **Size:** M (five or six ~4 min runs plus a write-up).
- **Unknowns:** whether PCSX2 instance A can boot with no card or an unformatted one (its card holds the r0004 patch; a
  fresh card dir is needed).
- **Owner calls:** the run window (host load sensitivity).
- **Merged from:** boot BOOT-01.

### BOOT-02 -- The loader's raw screens (PULOADGP.RAW, LOADING.RAW)
- **Goal:** a RAW reader and the loader's screens at the original's positions and in its order.
- **What the original does:** B3, B5, B6, B21. PULOADGP at y=160 after the first IRX loads; LOADING full frame after
  the card check; on the card-patch path PUNOTREM/PUNOTRE2 come before it (BOOT-11). *(Corrected 2026-10-02 by web
  research 130 §3: it read "PUNOTREM/PUNOTRE2 replace it"; the loader draws LOADING after the patch panel on both
  paths, SCUS L43646-43660.)* PCSX2 shows the logo with "LOADING..." at t~8.4 s (`pcsx2_mission_a/s00_CROSS.png`,
  LOADING.RAW: it scores 99.9 against the decoded file, research 130 §4).
- **Today:** *(2026-10-02, pending review)* `packages/ui/src/boot/loaderScreens.ts` (web research 130): the RAW decoder
  at the calls' sizes (read from the loader ELF's instructions), the fades (10 fields out, 11 in), the order and the
  `LoaderScreens` state as PLAT-14 draw lists; LOADING scored 99.9 against both PCSX2 s00 captures and 100.0 against
  the recompiled game's; PULOADGP owed a frame (`state.boot-loader-panel`), the holds placeholders (BOOT-01, H19).
  The third check is **unmet, owed**: no strip-upload trace exists to compare the bytes with (PLAT-36); the test pins
  the strip DBPs, the file order and an exact (mad 0) match to the recompiled game's `w00_000` instead (research 130 §4).
- **Gap:** a `.RAW` decoder and the boot screen that shows the images.
- **Acceptance:** decoded LOADING.RAW through the page's 640x448 path scores >= 98 against `s00_CROSS.png` (on the 448
  lines; the capture is 640x480) and >= 90 against golden s00; the decoder's dimensions come from the loader's call
  arguments (0x280x0x1c0; 0x280x0x80 at 0xa0) in a unit test; the bytes equal the recomp's strip-upload trace. These
  use archived captures (reading level). Proven level: PULOADGP placement and the hold times checked against BOOT-01
  frames. The two capture comparisons and the RAW reads are dev-disc-only (skipped without the disc); the dimension test runs in
  CI on a synthetic RAW.
- **Proven by:** BOOT-01.
- **Dependencies:** PLAT-03, PLAT-14, PLAT-30. **Size:** S (fixed-size blits). *([2026-10-02, OT.R11] on the online
  path: the opener's sprint 24 (it was parked sprint 12's, OT.R6); done on `agent/online`, web research 130.)*
- **Unknowns:** the pixel format (RGBA order; alpha 0x80 = 1.0 or 0xFF) -- read `FUN_001c6570` (SCUS L44009+) and its GS
  upload; what PULOADGP, PUPUTBAK, PUPUTBA2 show and when (BOOT-01; a SCUS caller read near L43964); each screen's hold
  time (BOOT-01 timings).
- **Owner calls:** the hold time in a browser that has no IRX loads -- proposed: PCSX2's measured durations from
  BOOT-01.
- **Merged from:** boot BOOT-03; platform PLAT-21.

### BOOT-03 -- Settle what draws the "SONY ... PRESENTS" and "DEVELOPED BY ZIPPER" cards
- **Goal:** know whether the opening text cards are frames of SONY448.PSS or TEXT/TELETYPE objects of
  `dlgIntroScreen.rdr`, before building either.
- **What the original does:** B12/B14 show typed text with a block cursor. For the movie: SONY448 is opened right after
  `dlgIntroCinematic.rdr` (B9); its 310 pictures (~10.3 s) match PCSX2's s02->s05 span of 10.5 s; the cursor style
  matches INTRO_2's typed captions (B17). For TEXT objects: PC research 11 L335 says they are TEXT objects of
  `dlgIntroScreen.rdr` (an unproven diagnosis written while they rendered black) -- **corrected 2026-10-01 by web
  research 98 §1, §3: that diagnosis is wrong; `dlgIntroScreen.rdr` has no objects at all**. `READERC.ZAR/splash.rdr`
  also names `splash.pss` / `splashload.tif` -- **the member is in `RUN/READERC.ZAR` (not `RUN/UI/`), a SOCOM 1 record
  whose files are not on the disc and whose keys the ELF never looks up (web research 98 §4.2)**.
- **Today:** **settled -- movie** (web research 98 §1). Both cards are SONY448.PSS pictures (the Sony card 11-140, the
  Zipper card 161-294: the file's own pictures carry the text), drawn as `dlgIntroCinematic`'s `MPEG` background, and
  neither intro dialog has an object (§3). Every distinct PCSX2 capture of s02..s04 in the ten boot runs matches a
  decoded picture at 100.0 under the gate's scorer (where black also scores 97.3-99.9, so that score alone cannot tell),
  and on the bright frames (s02, s04) at 94.6-99.9 on the capture's text box, where black scores 82-85: 14 of the 15
  reach 95 there, `pcsx2_mission_f/s02` 94.6. [Corrected 2026-10-01 after review: said "every distinct PCSX2 capture
  ... at >= 95 ... and at 95.8-99.9 on the capture's text box, where black scores 82-85", over 7 captures of 5 runs and
  without the bright-frame qualifier; on the s03 fade captures black scores 87.6-99.4 on the text box.] No
  TEXT/TELETYPE object exists to build. **Gap:** none for this task; the movie player is PLAT-19b/PLAT-21's.
- **Acceptance:** decode SONY448 pictures (offline ffmpeg reference or PLAT-19b) and match them against
  `pcsx2_mission_a/s02..s04`: >= 95 settles "movie". Otherwise read `dlgIntroScreen.rdr` and its UIZANIM set for
  TEXT/TELETYPE objects with `parseRdr`.
- **Dependencies:** none (offline decode). **Size:** S.
- **Unknowns:** ~~this task is the unknown~~ settled (web research 98 §1). Which screen owns the warning text before the
  intro (B12 s06 per `launch_to_mission.txt`): corrected 2026-10-01 -- no capture on record shows a warning screen; the
  script's "intro / warning screen" step is a dark frame believed to be INTRO_2's opening fade, and the texts before the
  intro are `dlgIntroScreen`'s popups (the card popups of `load_initial_config`, reached through `do_onstart` ->
  `intro_onstart`, and the controller and HDD popups) (web research 98 §4.1) [corrected 2026-10-01 after review: said
  "its `do_onstart` -> `intro_onstart` card popups"; `intro_onstart`'s own popups 823-825 sit in sequences
  believed unreached (a search of every decoded op in all 95 UIZANIM sets finds no caller; `old_and_busted` is absent
  from the ELF's strings; a C caller was not searched)] [corrected again 2026-10-01 after the second review: said "sit
  in sequences nothing starts", without the hedge]. Still open: the opening-fade belief, settled by BOOT-01's >= 2 Hz
  capture across the SONY448 -> INTRO_2 hand-off;
  whether anything outside the dialog can end SONY448 early -- the presses after s02, s03 and s04 did not skip it
  (the s04 press measured in `mb10_pcsx2`'s per-second wait frames, 30 pictures per second straight across it; the
  other runs' s04 press is believed the same) (§1, §5) [corrected 2026-10-01 after review: said "the CROSS presses on
  record did not"; corrected again after the second review: said "the s04 press is undecided by the timing"].
- **Owner calls:** none.
- **Merged from:** boot BOOT-08; menus MENU-20 unknown (1).

### BOOT-04 -- The intro shell: dlgIntroScreen -> dlgIntroCinematic -> dlgSecondCinematic -> goto_menu
- **Goal:** run the game's own boot dialogs and scripts in their order, from the menu state's start to the main menu.
- **What the original does:** B7-B11, B15. Recomp times B9.
- **Today:** *(2026-10-02, pending review)* `packages/ui/src/boot/opener.ts` (web research 139): the loader's screens
  (BOOT-02), then the game's own boot dialogs on PLAT-10's machine in the original's order, through the disc's own
  scripts -- `dlgIntroScreen`'s ONSTART chain to `SWITCHMENU dlgIntroCinematic.rdr`, sony448.pss and event 3,
  Intro_2.pss and its end or thirteen keys, `dlgMenu` -- with the card and hardware rows stubbed with cited returns
  for the f0 card (`bootBindings.ts`; BOOT-05 and BOOT-09 replace them), step 4 of the input dispatch for the keys
  (`screenButtons.ts`; PLAT-11 replaces it), the route `/` covering the whole boot (the cinematics pass-throughs). The
  SONY448 frames the page draws score 100.0 against `pcsx2_mission_a/s02..s04` and the recomp's `w00_006`
  (`tools/test/introShellDisc.test.ts`); the timing is the scripts' and the manager's on the transcription (research
  138 §5, against B9). PLAT-10's `screenScripts` was found resolving a binding's animation across the whole archive
  (set 29's `do_onstart` before set 35's), so the boot never left its first dialog: fixed (research 139 §4). In the
  page the movies are black until PLAT-19c's source is handed in and silent until PLAT-20 (`agent/opener-movie`);
  the card-searching popup is not drawn (PLAT-16's content, the textures placeholder: `boot.card-searching` owed).
  Before: `uiLayout.ts`, `uiZanim.ts`, `uiLoc.ts`, `uiFont.ts`; s5 `uiScript.ts`; no boot entry point.
- **Gap:** a boot state that loads these dialogs and runs their bindings (movie play, StoreOptions, valves,
  IsControllerConnected, HardDriveOperation, CheckVideoMode). The card bindings and the hardware bindings are **stubbed
  here with cited returns** -- the card answers "inserted, formatted, holding the f0 save" (KNOWN [card-folder]'s
  empty-folder rule, the f0 card), HardDriveOperation answers "no HDD" and CheckVideoMode "NTSC" (O7) -- and BOOT-05 and
  BOOT-09 replace the stubs, so this task comes before them.
- **Acceptance:** reading level: the screen sequence scored by PLAT-30 against the archived captures
  (`logs/parity/runs/pcsx2_mission_a/s00..s06`, `logs/parity/gate/x51_gate_iop/title/w00_*`; each matched step >= 90;
  `scripts/parity/launch_to_mission.txt` steps 1-8). Proven level: binding-call order parity against a recomp
  `PS2X_CALL_TRACE` on the UI binding dispatcher (`FUN_002745a0`, D:L121344-121431) from boot to the menu (PLAT-36):
  same names, same order; boot-to-menu wall time within BOOT-01's PCSX2 measurement +- BOOT-02's hold-time rule.
- **Proven by:** PLAT-36 (the call trace); BOOT-01.
- **Dependencies:** PLAT-06, PLAT-10, PLAT-21, BOOT-03 (settled 2026-10-01, web research 98 §1, §3: the opening cards
  are SONY448.PSS played as `dlgIntroCinematic`'s background, so this shell draws no text for them and the dialog
  binds no button to skip it). **Size:** L (the UIZANIM payload decode is only partly done, web R95 L697; the boot
  bindings are new). *([2026-10-02, OT.R11] on the online path: the opener's sprint 24 (it was parked sprint 12's,
  OT.R6), in flight; its card and hardware stubs stand, since BOOT-05 and BOOT-09 stay parked -- BOOT-05 a slice or
  owed.)*
- **Unknowns:** where the movie names live (PLAT-06's listing of `RUN/UI/READERC.ZAR`, `RUN/READERC.ZAR`,
  `RUN/UIZANIM.ZAR` settles the members); the "START" in B10 (the recomp drove it with a pad script);
  `dlgIntroScreen`'s controller-check popup text and condition (`IsControllerConnected` 0x277150, a decomp read).
  *Noted 2026-10-02 (PLAT-19c, web research 120 §9, §11):* the page's movie presents picture 0, and fires its event 3,
  one tick later than the console's (`MOVIE_FIRST_PICTURE_TICK_READING`, *note only*): this chain runs two movies, so
  its wall time and the call trace's timing carry two ticks (about 67 ms) unless the source asks for picture 0 at the
  open.
- **Owner calls:** none.
- **Merged from:** boot BOOT-09; menus MENU-20 (intro dialogs).

### BOOT-05 -- The boot memory-card check and the config load (UIMemCardAnim at boot)
- **Goal:** the original's card screens and reads at boot, per card state: searching, slot select, no data, continue,
  load preferences.
- **What the original does:** B10, B11, B13; PCSX2 with two cards asks "Select MEMORY CARD slot"
  (`s4_pcsx2/A_00_boot.png`, `A_01.png`); ours with one slot does not, and a second launch shows no prompt and makes no
  writes (KNOWN [card-folder], `s8_save_second`). Loader `LoadConfig` (`FUN_0027b0e0` D:L124786-124805) through
  `CSaveManager_Load` 0x33d6d0; it then reads UIVAR `AUTOMESSAGES` and calls `FUN_005e7fb0(1|0)`. Boot-time
  UIMemCardAnim names: DiscoverWhichSlot, find_a_memcard, KeepTryingMemcardLoad, memcard_have_loaded_config,
  MainMenuCardSlot(Choice); messages `_827` (Searching MEMORY CARD slots...), `_842`/`_843` (Loading preferences...),
  the NoSOCOMDataFound set.
- **Today:** none.
- **Gap:** the scripts and bindings over PLAT-25's slots, PLAT-26's libmc and what OPT-02/OPT-04 read back (the valves
  and the personas as JSON in the card files' `data`), replacing BOOT-04's card stubs. **Corrected by R7
  (2026-10-01):** this read "over PLAT-25..PLAT-27 and OPT-02/OPT-04's decoders"; R7 dropped PLAT-27 (the card holds
  our JSON, not the game's bytes, so there is nothing to decode).
- **Acceptance:** reading level: the archived states -- virgin one-card (`logs/parity/virgin_card/s00..s04`), two cards
  (`s4_pcsx2/A_00_boot.png`, `A_01.png`), a saved card (`s8_save_second`: no prompt, no writes) -- match (PLAT-30 >= 90
  per screen; string ids equal the UIMnLOC ids read from the script, never retyped). Proven level: every BOOT-01 card
  state matches PCSX2 the same way, and the MC op sequence equals the recomp's `PS2X_MC_TRACE=1` boot sequence
  (PLAT-36).
- **Proven by:** BOOT-01; PLAT-36 (the MC trace).
- **Dependencies:** BOOT-04, PLAT-25, PLAT-26, OPT-02, OPT-05a. **Size:** M. *(R7, 2026-10-01: PLAT-27 left this
  line when R7 dropped it.)*
- **Unknowns:** the slot-select condition (believed two cards present, from captures only; `num_memcards`) -- decode
  DiscoverWhichSlot / MainMenuCardSlot; the no-card and unformatted flows (BOOT-01); the "save this configuration?"
  controller prompt `scripts/parity/title_only.txt` L4-9 reports appearing on boot -- which state triggers it.
- **Owner calls:** none.
- **Merged from:** boot BOOT-11; options OPT-05.

### BOOT-06 -- Main-menu entry: MENULOOP background, fade-up, footer (the boot -> MENU hand-off)
- **Goal:** reach `dlgMenu` over the looping MENULOOP movie with the original fade, footer and version string; the
  menu's own behaviour is MENU-02.
- **What the original does:** B16, B18, B19; `menu_fade_up`; the shell restarts MENULOOP at its end (PLAT-21).
- **Today:** *(2026-10-03, pending review; web research 141)* the hand-off runs on the page's path: `dlgMenu` over
  MENULOOP from picture 0 (no loop: `TYPE MPEG`, so no seam on the disc's data -- the block's "restarts MENULOOP at its
  end" is drift, R141.1), `menu_fade_up` 1 -> 0 in 1.5 s (decoded), a 2D quad's alpha sent as the GS's packed byte
  (`packedAlphaByte`), the footer and version line (MENU-02a's). *(2026-10-03, MENU-FADE, pending review: the owner's
  black flicker as the menu loads in.)* `menu_fade_up` and `SetMenuValve`'s 0.99 -> 0 in 0.75 s both run and sum --
  the op adds (`FUN_0025f880`), MENUFADER is under 0 for a second -- and none of it shows: the fader's quad is
  untextured, the GS blends it by the last bound texture's `ALPHA_1`, and on `dlgMenu` that is the roller's additive
  0x48, so the menu is whole from its build's own frame (`uiCompositorView.ts` carries the register; the page drew a
  ramp, a second of black and a lone lit frame until then).
  `title_menu.txt` through PLAT-30's runner on the page's path with MENULOOP decoded (Node, `tools/test/titleMenuDisc.test.ts`):
  s00..s18 all >= 90 against `ref_main_menu_ours.png`, masked (91.1-97.1) and whole (90.9-97.2), s19 inside B18's band
  (86.8) and s20 black as the gate's; over the black stand-in
  the script's `untilref` cannot match (the crop to content), so the browser run of the script is owed to the page's
  movie source (a `frontEnd.ts` line). Against PCSX2's burst across the key the page's frames are scored
  (`tools/test/menuEntryFadeDisc.test.ts`): the build's own frame 97.7 against burst_010, the menu at MENULOOP's
  pictures 2 .. 36 at 97.2-99.7 against burst_011-016 (`MENU_ENTRY_FADE_READING` resolved); the console's 1.6 s of
  black before the menu is its build of the dialog off the disc, not modelled (BOOT-01). The proven
  level's seam is answered by the data (none): the menu held past the last picture closes MENULOOP and keeps picture
  3,731, unrestarted (`menuHandoffDisc.test.ts`); BOOT-01's capture of the menu past 124.5 s is still owed.
- **Gap:** the hand-off state plus the background loop.
- **Acceptance:** reading level: PLAT-30 runs `title_menu.txt` on the page and every capture s00..s18 scores >= 90
  against `scripts/parity/ref_main_menu_ours.png` with the MENULOOP region masked while PLAT-19b is absent. Proven
  level: the same with the movie drawn (the gate's rule unmasked), and the loop seam (the last picture, index 3731, -> 0; it read "picture 3790" until 2026-10-02) shows no black
  frame beyond the original's (compared with BOOT-01's capture at the seam).
- **Proven by:** BOOT-01.
- **Dependencies:** PLAT-21, BOOT-04, MENU-02a (the menu comes first; this task is the hand-off into it). **Size:** M.
  *([2026-10-02, OT.R11] it read "MENU-02"; the hand-off needs the menu drawn, not its streams: MENU-02a (its reading
  level draws MENULOOP as MENU-02's does, the region masked), and the movie in real time is PLAT-19c's, on the path
  beside this task. On the online path: the opener's sprint 24 (it was parked sprint 12's, OT.R6).)*
- **Unknowns:** the fade-up duration (`menu_fade_up`) -- the UIZANIM read.
- **Owner calls:** none.
- **Merged from:** boot BOOT-12.

### BOOT-07 -- The idle attract loop
- **Goal:** after the original idle time on the main menu, fade out, play the attract movie, and return to the menu
  exactly as the original does.
- **What the original does:** B17, B18; dlgMenu `UiAttractMode` / `UiStopAttract` (called at menu entry, B10) /
  `uiAttractMode` with constants 10.0 and 3.0 in the name table; FadeAllSounds.
- **Today:** none.
- **Gap:** the idle timer, the attract state, the exit on input or at movie end.
- **Acceptance:** PLAT-30 runs `title_menu.txt` with the gate's 23 captures: s00..s18 >= 90, s19 the fade (83-90),
  s20..s22 matching the corresponding INTRO_2 pictures (>= 95 against the ffmpeg reference). Attract start within one
  capture interval (6 s) of the recomp's distribution in PC research 64 and within one second of a PCSX2 stopwatch
  capture. A press during the attract returns to the menu, matching a BOOT-01 capture.
- **Proven by:** BOOT-01 (two cycles and a press); PLAT-36 (the MPEG trace of a 300 s idle).
- **Dependencies:** PLAT-21, BOOT-06. **Size:** M.
- **Unknowns:** the exact idle constant and where it lives. The two numbers on record are not a contradiction:
  114.4-114.7 s from s00 (the settled menu, PC research 64) and 149 - 28 = ~121 s from MENULOOP's creation (PC research
  09 L77-80) agree within ~7 s, the time from MENULOOP's creation to the settled menu. The task hunts the exact constant
  (the name table carries 10.0 and 3.0, neither of them ~114) and its origin (menu entry, MENULOOP creation or the last
  input) -- decode UiAttractMode's WAIT/loop; whether input during the attract returns to the menu or restarts the
  shell; whether the attract always plays INTRO_2 or rotates (`*_AOP.PSS` never seen in an attract capture) -- a long
  BOOT-01 run through two cycles or a recomp `PS2X_MPEG_TRACE` idle 120 s+; whether the timer counts from menu entry or
  the last input.
- **Owner calls:** none.
- **Merged from:** boot BOOT-13; menus MENU-11.

### BOOT-08 -- Region and language
- **Goal:** fix the locale to the original's (NTSC, US English) and hold the language state exactly as the US disc does.
- **What the original does:** B1, B20.
- **Today:** `uiLoc.ts` reads `RUN/LOCALE/STATES/UIMNLOC.ZAR` (`UIMNLOC` constant L21).
- **Gap:** small: the language valve's initial value and whether any boot script reads the PS2 system language.
- **Acceptance:** reading level: the valve's initial value read from the setter's callers (`FUN_003a44b0`) in a unit
  test; no language UI appears in any archived boot capture. Proven level: the page's `LanguageChoice` valve after boot
  equals the recomp's (`PS2X_PEEK` after `load_initial_config`, PLAT-36); no language UI in BOOT-01's captures.
- **Proven by:** PLAT-36 (the PEEK); BOOT-01.
- **Dependencies:** BOOT-04, PLAT-04. **Size:** S.
- **Unknowns:** who calls `FUN_003a44b0` at boot and with what value (a caller read); whether the US build reads the
  BIOS language (believed no).
- **Owner calls:** none.
- **Merged from:** boot BOOT-14.

### BOOT-09 -- Boot-time hardware branches (HDD, video mode, controller)
- **Goal:** represent every boot-time branch that depends on PS2 hardware, with PLAT-28's screen only where the original
  offers that branch.
- **What the original does:** `UIHardDiskAnim.rdr` loads at boot (B9); `DisplayHDDError` (web R95 L606);
  `dlgIntroScreen` searches the HDD when `HDD_ENABLE` is set (PC research 77:32-37); `SwitchProgressiveVideo` /
  `CheckVideoMode` (strings 0x3ee0c0/0x3ee0d8; PC research 11 L351-353); IsControllerConnected (B15).
- **Today:** none.
- **Gap:** the inventory, then the screens.
- **Acceptance:** each branch listed with the script or decomp line that offers it; each substitute registers its hook
  with PLAT-28's harness and appears at the same step as the original's choice in BOOT-01 (proven level); a card with
  `HDD_ENABLE = 1` -- a slot record built in the test (R7, 2026-10-01: it read "imported from the desktop"; there is no
  import) -- does not trigger "Searching the internal hard disk drive..." (OPT-16).
- **Proven by:** BOOT-01.
- **Dependencies:** BOOT-04, BOOT-05, PLAT-28. **Size:** S.
- **Unknowns:** whether boot shows any HDD prompt without an HDD; whether `CheckVideoMode` runs at boot or only from
  OPTIONS -- the script read and BOOT-01; what the recomp's HDD probe returns today (PC research 77:48).
- **Owner calls:** the PS2 BIOS (the PlayStation 2 logo and browser) is Sony's, not the game's: proposed out of scope,
  the port starts at the game's loader screen.
- **Merged from:** boot BOOT-15.

### BOOT-10 -- The relaunch dialogs (dlgAfterReboot, dlgAfterErrorReboot)
- **Goal:** the dialogs the game starts on after a relaunch, reached as the original reaches them.
- **What the original does:** B22; REBOOT in the switch handler -> `FUN_0022ed10` (D:L262375-262460).
- **Today:** none.
- **Gap:** the two dialogs and the start-dialog argument in the reboot equivalent (PLAT-10).
- **Acceptance:** reading level: starting with `menu_state=dlgAfterErrorReboot.rdr` reaches the main menu like
  `logs/parity/s17_q2_logoff/online1/final.png`. Proven level: the dlgAfterReboot popup compared with BOOT-01's recomp
  capture.
- **Proven by:** BOOT-01.
- **Dependencies:** PLAT-10, PLAT-16, BOOT-10a. **Size:** S. *([2026-10-02, OT.R6] parked until the online path
  runs; BOOT-10a, its path slice, takes the logoff's return first.)*
- **Unknowns:** what `dlgAfterErrorReboot` shows on the way back (a script read); when `dlgAfterReboot` is used.
- **Owner calls:** none.
- **Merged from:** menus MENU-20 (relaunch dialogs); online front end ONL-12 unknown.

### BOOT-10a -- The logoff's return: `dlgAfterErrorReboot` to the main menu, without the boot
- **Slice of:** BOOT-10 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): what
  ONL-10's logoff needs -- the start-dialog argument and `dlgAfterErrorReboot` reaching the main menu -- without
  `dlgAfterReboot` (the network-error relaunch) and without whatever of the boot the original's relaunch passes
  through (`s17_q2_logoff/online1/20_then_01..03`), which is the parked boot's (BOOT-02, BOOT-04).
- **Goal:** after the logoff, the page lands where the original's relaunch lands, through `dlgAfterErrorReboot`.
- **What the original does:** from BOOT-10: B22 -- `--menu_state <dlg>` picks the start dialog (`FUN_001eabd0`,
  option string 0x3e1e00); the online logoff relaunches with `dlgAfterErrorReboot.rdr`, which shows the HDD error,
  then dlgMenu; REBOOT in the switch handler -> `FUN_0022ed10` (D:L262375-262460); N17 of the online segment
  (KNOWN [logoff-relaunch]).
- **Today:** the return without the boot (2026-10-04, pending review; web research 160 §3, §4): the reboot relaunches
  on `--menu_state dlgAfterErrorReboot.rdr` (PLAT-10's), whose ONSTART runs the card checks, skips the HDD branch
  (`HDD_ENABLE` 0) and switches to `dlgMenu.rdr` -- no loader, no movie; no music until the menu's own `menuloop.pss`;
  NEW GAME lit with no saved game, as after the boot (`packages/ui/test/screens/logoffScreen.test.ts`). A relaunch drops
  the TEMP valves (`RELAUNCH_VALVES_READING`: `StartMusic` among them) and closes a lobby still up
  (`LOBBY_CLOSED_AT_LAUNCH_ADAPTATION`). Open: the card's re-read on the way back (the console's new process; the page
  keeps `memcard_have_loaded_config`), and the frames against `20_then_01..03` and `final.png`.
- **Gap:** the start-dialog argument in PLAT-10's reboot equivalent, and `dlgAfterErrorReboot` (its layout and set) up
  to dlgMenu.
- **Acceptance:** BOOT-10's reading level: starting with `menu_state=dlgAfterErrorReboot.rdr` reaches the main menu
  like `logs/parity/s17_q2_logoff/online1/final.png`; the frames on the way compared with `20_then_01..03` where they
  are this dialog's.
- **Dependencies:** PLAT-10, PLAT-16. **Size:** S. **Then:** BOOT-10 (`dlgAfterReboot`; the proven level against
  BOOT-01's capture).
- **Unknowns:** BOOT-10's first -- what `dlgAfterErrorReboot` shows on the way back (a script read), and whether its
  HDD error shows at all with HDD disabled (OPT-16; B22's "shows the HDD error" is the dialog's, not a capture's).
- **Owner calls:** none.
- **Merged from:** sliced from BOOT-10 by OT-0 (2026-10-02, OT.R6).

### BOOT-11 -- The loader's memory-card patch path (r0004)
- **Goal:** decide on, and if kept reproduce, the loader's behaviour when the card holds `APACHE00.ZDB` (the online
  revision patch): PUNOTREM/PUNOTRE2, PUPUTBAK/PUPUTBA2, overlays loaded from the card.
- **What the original does:** B4, B6; PCSX2 instance A boots r0004 from its card (`APACHE00.ZDB` + `PATCHFILE.DAT` since
  2026-09-23).
- **Today:** none.
- **Gap:** an owner call first.
- **Acceptance (if kept):** the screen order against a PCSX2 instance-A boot capture; patch detection from the same card
  image.
- **Dependencies:** PLAT-25, BOOT-02, ONL-05 (OC-2 is ruled there; this task follows it). **Size:** M.
- **Unknowns:** what PUPUTBAK/PUPUTBA2 say and when they show (SCUS L43964; caller not read).
- **Owner calls:** **r0001 or r0004** -- the same call as ONL-05. *(Ruled 2026-11-01, OT.R97: r0004 is the
  specification for gameplay and the front end, and the memory-card and download paths stay excluded -- this task
  stays excluded; `plans/r0004-option-b.md`.)*
- **Merged from:** boot BOOT-16.
