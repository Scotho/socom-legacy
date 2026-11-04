# 03 -- Menus (`MENU-`)

The offline front end above the platform: the offline UI commands, the main menu, the campaign entry points' stopping
point, EXTRAS and what hangs off it, the LAN item, and the dialogs whose role is not settled. OPTIONS and the card
screens are segment 04; the online screens are 05; the boot and attract dialogs are 02. The dialog runtime (loader,
scripts, commands table, screens, input, widgets, popups, keyboard, movies, sounds) is 01.

The campaign is out of scope for now ([`../MISSION.md`](../MISSION.md)): the campaign itself gets no tasks. **The
stopping point is ruled (the owner, 2026-10-01, R1): option (a)** -- CROSS on NEW GAME and on LOAD GAME goes straight to
the "available in the desktop recompilation or with emulators" screen (MENU-03). The single-player menus beyond them
(reading (b): rank select, presets, the save prompt, the LOAD GAME list, mission selection, the AOP movies, the
briefings and maps) are **not built**; the group MENU-10..MENU-16 keeps its ids and its research as **future scope** at
the end of this file, with the rest of the campaign in [README](README.md#future-scope-the-campaign). Conventions:
[README](README.md#conventions).

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| M1 | Main menu `dlgMenu.rdr`: background MPEG `run/movies/common/menuloop.pss`; libraries `ui/assetlib/ui2d`, `uibf`; scripts `dlgMenu.rdr uianim.rdr UIMemCardAnim.rdr`, `USES_MEMCARD`. ONSTART: PulseArrows, UiStopAttract, SetMenuValve, has_memcard_changed, CleanupMissionMemory; MEMCARD_ERROR -> handle_memcard_error. Six BUTTONs: `load_game_button` (y300), `new_game_button` (330), `multiplayer_button` (360), `options_button` (390), `Extras_button` and `LAN_button` (both y420); UP/LEFT -> OnMenuBtnUp, DOWN/RIGHT -> OnMenuBtnDown; CROSS -> MainMenuOnLoad / UiprepMission1 / do_multi_or_medius / CallOptions / CallExtras / go_to_LAN_play. NORMAL scale 0.6; ACTIVE 0.75 with TEXT_GLOW 0.3-1 over 0.8 s; PRESSED colour (255,74,8) at scale 0.7 (`load_game_button` alone has ACTIVE 0.7 and PRESSED 0.75: *added by PLAT-06*). SplashLogo.tif at (70,45) 500x195; LEGALEZE `_507`/`_508`/UIVAR `VERSION_STRING`; arrow_top/arrow_botm; the SavedGames LISTBOX (popup_load.tif, 5 columns); MODELS Roller = `mainmenu_roller` (AZIMUTH 0, ELEV -12.5, DISTANCE 60) | web R96 §3.3 (`tools/dump-dialogs.ts --dialog dlgMenu.rdr`) |
| M2 | `mainmenu_roller` lives in `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED`, which S1 decodes in the `'bias'` form | `parse_zar` key scan; web R95 R95.10 |
| M3 | Item order on a card with saves (PCSX2): LOAD GAME / NEW GAME (focused) / ONLINE ...; after DOWNs LAN / OPTIONS / EXTRAS. On an empty card NEW GAME is the top item, then ONLINE, LAN, OPTIONS | `logs/parity/s4_pcsx2/A_04.png`; `scripts/parity/ref_main_menu_ours.pcsx2.png`; `D:/socom_archive/parity/s10_audio_options/s04_CROSS.png`; headers of `scripts/parity/audio_options_explore.txt`, `music_only_mission.txt`, `save_empty_card.txt`; `logs/parity/options_explore_sheet.png` |
| M4 | Main-menu flow: load_game -> MainMenuOnLoad (SavedGames listbox; campaign); new_game -> UiprepMission1 -> dlgSelectRank -> dlgControllerPresetsNewGame -> CS/RG -> AlbaniaCinematic, or dlgSelectRank straight to AlbaniaCinematic (campaign); multiplayer -> do_multi_or_medius -> dlgMPswitch -> dlgNetLogin; LAN -> go_to_LAN_play -> dlgMPswitch -> dlgNetLogin -> dlgLANPlayerName -> dlgLANConnect -> dlgLANBriefingRoom (*corrected by PLAT-06: the scratch read had LAN go straight to dlgNetLogin; both buttons switch to dlgMPswitch*); options -> dlgOptions_Menu; extras -> dlgNetUnlockableExtras; idle -> dlgAttractCinematic | web R96 §0 (the compact graph), §3.3, §3.4 (`tools/dump-dialogs.ts`, the edges; pinned by `tools/test/dialogInventoryDisc.test.ts`) |
| M5 | EXTRAS `dlgNetUnlockableExtras`: WEAPONS, CHARACTERS, ART GALLERY, MOVIES (4 AOP intros + Making the Music), TRAINING VIDEOS (10 titles; `TUT_01..10.PSS`, the files in `RUN/MOVIES/COMMON`; `dlgPlayTutMovies` names `Tut_01..12.pss`, 11 and 12 on no disc: *added by PLAT-06*), JUKEBOX (12 tracks `MUS_JUKE_01..12`), CREDITS. Unlock state reads `incr_miss_51..83`, GameComplete, career stats. Sub-dialogs `dlg_CharUnlock`, `dlg_WeapUnlock` (234 names), `dlgArtGal2` (`ArtGall2.pss`), `dlgPlayTutMovies`, `dlgMakeMusicMovie` (`alb/braz/alg/russ_aop.pss`, `MusVid.pss`), `dlgCredits` (`credits.pss`; ONMPEGEND/CROSS/TRIANGLE -> BackOutWithMusic). Commands SetCareerStatsUIVars, ButtonActive, UpdateMovieData, UpdateJukeText, CKText/CKToGo/CKField INPUT_STRING, BackOutToMainMenu, BackToWherever/InWhichAOP, DontStartExtrasMusic | web R96 §1.2, §3.5, §7 (`tools/dump-dialogs.ts --dialog dlgNetUnlockableExtras.rdr`, `--dialog dlgCredits.rdr`, `--set dlg_WeapUnlock.rdr`) |
| M6 | `dlgExitState.rdr`: class `CExitMenu` 0x3e2c98, EXTZANIM, `common/assetlib/splash`, `db_back.tif`. `dlgHype.rdr` ("YOUR / CREDITS / GO HERE") is named only by `FUN_00365a00`. `dlgStickSetup.rdr` is referenced by `GoToStickSetup` and not on the disc | web R96 §1.1, §3.5 (`dlgHype` is on the disc, in READERC, and named only by the `strstr` at D:L262431; `GoToStickSetup` is started by nothing); D:L262375-262460 |

## Tasks

### MENU-01 -- The offline UI commands
- **Goal:** implement every no-node `UI_COMMAND` the offline dialogs call (the online ones route to segments 05/06).
- **What the original does:** the table of PLAT-08 (dispatch D:L121344-121431). The offline subset: SwitchMenu,
  PopUpDialog, KillPopUp, Activate/Enable/DisableButton, StoreOptions 0x27b960 (D:L125111), InitOptions 0x27b420
  (D:L124947), PlayMPEG 0x27ab30 (D:L124609), PlayMPEGNoFade, BackgroundMPEG 0x27a420 (D:L124410), VagStreaming 0x27a5e0
  (D:L124465), StopAllSounds, FadeAllSounds, RebootIOP, the MC_* family (segment 04), Load/SaveConfig 0x27b0e0/0x27b000
  (D:L124786/L124762), SetControllerConfig, SetStickPreset, SetScreenOrigin, SwitchProgressiveVideo, CheckVideoMode,
  IsControllerConnected, HardDriveOperation, SuspendMenuInput 0x277220 (D:L122805), CopyUIVar, ClearUIVar, TestUIVar,
  PruneUIVarSpaces, CompareValues, GetTextInput, SetCareerStatsUIVars, ClearCareerStats, SetTtySpeedFactor,
  SetCounterSpeedFactor, FlushMenuHistory, SetMenuState, CleanupMissionMemory, SysPostInit.
- **Today:** s5 `uiScript.ts` hands `UiHost.command` the ARMORY's commands only.
- **Gap:** about 45 offline commands.
- **Acceptance:** reading level (now, CI): per command, a unit test whose expected return and UIVar/valve effects are
  transcribed from the decomp body at the cited line. Proven level: a trace comparison like PLAT-10's (call order and IF
  truth values) passes for dlgMenu, options and extras.
- **Proven by:** PLAT-36 (the call trace); PLAT-32.
- **Dependencies:** PLAT-08, PLAT-10, MENU-01a. **Size:** L (each command is a decomp read). *([2026-10-02,
  OT.R6] parked until the online path runs; MENU-01a, its path slice, takes the main menu's and the online entry's
  commands first.)*
- **Unknowns:** the bodies not yet read (all but SwitchMenu and those web R95 read) -- one decomp read each.
- **Owner calls:** none.
- **Merged from:** menus MENU-04 (implementations).

### MENU-01a -- The UI commands `dlgMenu` and the online entry dispatch
- **Slice of:** MENU-01 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): the
  commands the main menu and the online entry (`dlgMPswitch`, then `dlgNetLogin`) dispatch, without the rest of the
  offline subset (OPTIONS', EXTRAS', the card screens', the campaign's), which stays MENU-01's.
- **Goal:** every no-node `UI_COMMAND` that `dlgMenu` and the online entry run answers as the original's body does.
- **What the original does:** from MENU-01: the table of PLAT-08 (dispatch D:L121344-121431) and its offline subset;
  M1 -- `dlgMenu`'s ONSTART (PulseArrows, UiStopAttract, SetMenuValve, has_memcard_changed, CleanupMissionMemory),
  MEMCARD_ERROR -> handle_memcard_error, the six buttons' CROSS bindings; M4 -- ONLINE -> `do_multi_or_medius` ->
  `dlgMPswitch` -> `dlgNetLogin` (web R96 §3.3, §3.4).
- **Today:** PLAT-08's host, `packages/ui/src/uiCommands.ts`, declares every row of the table; four are implemented
  (PLATFORM.md, the command table's row).
- **Gap:** the list of the commands `dlgMenu.rdr` and `dlgMPswitch.rdr` (layouts and sets) dispatch, read from the
  dialogs, and each one's body that no earlier task implements; which entries of M1 are commands and which are
  animations is read here, not assumed.
- **Acceptance:** MENU-01's reading level for each command of the list: a unit test whose return and UIVar/valve
  effects are transcribed from the decomp body at the cited line; the list itself pinned by a test over the two
  dialogs (every command they name implemented here or by an earlier task, none silently ignored). Proven level:
  MENU-01's call-trace comparison for `dlgMenu`.
- **Proven by:** PLAT-36 (the call trace); PLAT-32.
- **Dependencies:** PLAT-08, PLAT-10. **Size:** M. **Then:** MENU-01 (the rest of the offline subset).
- **Unknowns:** which commands `dlgMPswitch`'s set dispatches, and whether it draws the "Select MEMORY CARD slot" popup
  (ONL-01's unknown) -- a read of `dlgMPswitch.rdr` and its set (ONL-33's chapter).
- **Owner calls:** none.
- **Merged from:** sliced from MENU-01 by OT-0 (2026-10-02, OT.R6).

### MENU-02 -- The main menu (`dlgMenu`)
- **Goal:** a 1:1 main menu: roller, items, visibility rules, legalese, arrows, MENULOOP background, focus glow, music
  and cues.
- **What the original does:** M1-M4; ActivateMenuBtns, MenuButtonChanged, new_on...lan_on, GotSaveGames,
  GetNumSavedGames, Ensure_MC_Dirs_Fast, PulseArrows; music `MUS_MENU_THEME`; cues `.TCM_SLIDE`, `.METAL`; RebootIOP.
  *(Corrected 2026-10-03, MENU-MUSIC, web research 152 R152.1: the main menu streams no music -- its sound is MENULOOP's
  own track; `MUS_MENU_THEME` is played only by `dlgMenu`'s `CallMusicPressDemo`, which no binding or call reaches, and
  the recomp's log of the online path starts no stream on the main menu.)*
- **Today:** none.
- **Gap:** all of it.
- **Acceptance:** reading level: SOCOM Legacy vs `logs/parity/s4_pcsx2/A_04.png` and
  `scripts/parity/ref_main_menu_ours.pcsx2.png` (>= 90 after the 4:3 correction, the MENULOOP region masked while
  PLAT-19b is absent); a DOWN walk (`scripts/parity/menu_explore.txt`) gives the item order and capture per step of the
  archived walks (M3). Proven level: the same walk on PCSX2 and SOCOM Legacy on an empty card and on a card with saves, to
  the end (OPT-19); the movie unmasked; music-only capture correlated with `tools_py/parity/audio_corr.py` (KNOWN
  [989snd-decomp]'s bar); cue onsets within one frame at 60 fps (PLAT-23, PLAT-36's audio runs).
- **Proven by:** OPT-19; PLAT-36.
- **Dependencies:** PLAT-05..PLAT-16, PLAT-21, PLAT-22, PLAT-23, PLAT-25, MENU-01, MENU-02a, the UI model renderer
  (S1's `'bias'` path, merged on this branch at `4c6cf5e8`). **Size:** L. **Then:** BOOT-06 (the hand-off into this
  menu). *([2026-10-02, OT.R6] parked until the online path runs; MENU-02a, its path slice, is the menu without its
  streams. Its L is kept (OT.R6) though only the streams' wiring is left in it: re-sized when the path has run.)*
- **Unknowns:** when EXTRAS is visible (the empty-card walk lists NEW GAME, ONLINE, LAN, OPTIONS) -- decode
  SetMenuValve/ActivateMenuBtns and capture an empty-card walk to the end; how the roller carries the item text (the
  buttons' CAPTION is blank; set by script) -- decode OnMenuBtnUp/Down, a PCSX2 burst during a roll; which button opens
  MissionShortcutSKB (MISSION_SHORTCUT, GetTextInput; campaign-related) -- decode the set.
- **Owner calls:** **MENU-OC-4** -- whether ONLINE routes to segment 05's flow from the first release (listed in the
  README's owner's calls); the rest under MENU-03.
- **[2026-10-02, OT.R5]** **ONLINE is the one live branch; the main menu's other items stop at the
  desktop-recompilation screen** (the owner, 2026-10-02: "correct"): NEW GAME and LOAD GAME (MENU-03, ruled (a)),
  OPTIONS and EXTRAS (MENU-03's hook, below) and LAN (MENU-08) each open PLAT-28's screen. MENU-OC-4 is answered by the
  owner's words ("Main menu -> Online -> traditional UI flow"): ONLINE routes to segment 05's flow. The online path
  builds MENU-02a; this block, with its streams, is parked until the path runs (OT.R6).
- **Merged from:** menus MENU-10; menus MENU-08 (main-menu music and cue acceptance).

### MENU-02a -- The main menu (`dlgMenu`) without its streams, for the online path
- **Slice of:** MENU-02 ([2026-10-02, OT.R6, OT.R8]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  the main menu the online path starts at, without what it owes to the parked streams -- the music (`MUS_MENU_THEME`,
  PLAT-22) and the movie in real time with its sound (PLAT-19c, PLAT-20). The path needs nothing of PLAT-22 (the plan:
  "the menu's movie and music owed, not blocking"), so the cut is this slice of MENU-02, not a slice of PLAT-22.
- **Goal:** `dlgMenu` drawn and answering as the original: roller, items, visibility rules, legalese, arrows, focus
  glow and cues, with the MENULOOP background as MENU-02's reading level draws it.
- **What the original does:** from MENU-02: M1-M4; ActivateMenuBtns, MenuButtonChanged, new_on...lan_on, GotSaveGames,
  GetNumSavedGames, Ensure_MC_Dirs_Fast, PulseArrows; cues `.TCM_SLIDE`, `.METAL` (PLAT-23); RebootIOP.
- **Today:** built (2026-10-03, pending review; [research 140](../research/140-the-main-menu-roller-and-its-frame.md)):
  the roller is the 3D pass -- `mainmenu_roller`'s twelve item quads (`new_on` .. `online_off`, `UI_GEO`/`UI_MDL`,
  textures `menu_*_on/off.tif` in `UI_TXR`) placed at (AZIMUTH, ELEV, -DISTANCE) before the menu's camera
  (`FUN_00366730`, D:L54812) and turned 60 degrees a step by `ActivateMenuBtns` (`packages/ui/src/compositor/models.ts`;
  the viewer's drawer rasterises it); the page reads the dialog's libraries, the font atlas, the models and the strings
  (`packages/viewer/src/menuArt.ts`); the DOWN walk, the cues' onsets, the card-with-saves start and the arrows are held
  by `packages/ui/test/screens/mainMenu.test.ts` (CI) and `mainMenuDisc.test.ts` (dev disc); the frame scores 91.1 against
  `s4_pcsx2/A_04.png` with the MENULOOP's blocks masked (81.9 whole), 86.9 / 83.9 against `ref_main_menu_ours.pcsx2.png`
  (`tools/test/mainMenuDisc.test.ts`) over a black movie; with MENULOOP drawn by the decoder in Node (sprint 11's close,
  `tools/test/mainMenuMovie.test.ts`) the same 2.5-s frame scores 96.0 / 97.9 against `A_04` and 95.7 / 97.8 against
  the reference, masked / whole -- both met. The DOWN walk scored step by step against the archived `logs/parity/runs/menu_explore` run (the
  manifest row `menu.main.down-walk`, s01..s08): 90.0, 89.1, 95.7, 90.0, 86.3, 82.5, 82.8, 81.4 masked -- four under the
  bar, the movie's brighter moments (research 140 §5); the CROSS path (`.DINK`, the swell and fade, the switch
  stored) held on the disc rig (2026-10-03, the fix round). The focal length is a reading by fit
  (`UI_MODEL_FOCAL_READING`); the music is MENU-02's (nothing plays).
- **Gap:** MENU-02's, less the music and the movie's real time and sound. Where a press starts music in the original,
  nothing plays yet: owed to MENU-02 (OT.R8), never replaced by another sound.
- **Acceptance:** MENU-02's reading level: SOCOM Legacy vs `logs/parity/s4_pcsx2/A_04.png` and
  `scripts/parity/ref_main_menu_ours.pcsx2.png` (>= 90 after the 4:3 correction, the MENULOOP region masked); a DOWN
  walk (`scripts/parity/menu_explore.txt`) gives the item order and capture per step of the archived walks (M3); cue
  onsets per PLAT-23. Left to MENU-02: the music correlation and the movie unmasked.
- **Proven by:** OPT-19 (the walks on an empty card and on a card with saves).
- **Dependencies:** PLAT-05..PLAT-16, PLAT-21, PLAT-23, PLAT-25, MENU-01a, the UI model renderer (S1's `'bias'` path).
  **Size:** L. **Then:** MENU-02 (the streams); MENU-03, ONL-01.
- **Unknowns:** MENU-02's -- when EXTRAS is visible; how the roller carries the item text; which button opens
  MissionShortcutSKB.
- **Owner calls:** none beyond MENU-02's (MENU-OC-4: below, OT.R1).
- **Merged from:** sliced from MENU-02 by OT-0 (2026-10-02, OT.R6).

### MENU-03 -- The campaign entry points: NEW GAME and LOAD GAME open the desktop-recompilation screen (ruled (a))
- **Goal:** CROSS on NEW GAME and on LOAD GAME opens PLAT-28's screen ("available in the desktop recompilation or with
  emulators") at once and returns; nothing of the chain behind either item is drawn (the owner, 2026-10-01, R1:
  option (a)).
- **What the original does:** M4. NEW GAME -> UiprepMission1 -> `dlgSelectRank` (ENSIGN / LIEUTENANT / COMMANDER,
  `s4_pcsx2/A_03.png`) -> `dlgControllerPresetsNewGame` -> CS/RG -> the Albania AOP cinematic -> briefing. LOAD GAME ->
  MainMenuOnLoad -> the SavedGames listbox (LoadGameOnListBox, LoadSavedGame; `ListSavedGames` 0x2801c0,
  `LoadSavedGame` 0x27fa40, `DoesSlotHaveGame` 0x27dfe0). The NEW GAME chain includes the only captured save flow
  (`D:/socom_archive/parity/s8_save_yes`), whose shared card dialogs OPT-05b..OPT-05h reuse. The hook replaces the
  first command each CROSS runs (`UiprepMission1`, `MainMenuOnLoad`; M1's CROSS list); everything after it is the
  future scope below.
- **Today:** 2026-10-03, pending review (web research 142): the four hooks -- `new_game_button` -> `UiprepMission1`,
  `load_game_button` -> `MainMenuOnLoad`, `options_button` -> `CallOptions`, `Extras_button` -> `CallExtras`
  (`MENU_03_HOOKS`; OPTIONS and EXTRAS marked removable by OPT-09 and MENU-04) -- registered with PLAT-28's harness and
  passing it on the real `dlgMenu` on an empty card and on a card with a save (M3's two orders); none of
  `UiprepMission1`, `MainMenuOnLoad`, `ListSavedGames`, `CallOptions`, `CallExtras` dispatched (a unit test on PLAT-08's
  host interface). The visual acceptance waits for MENU-02a's drawn menu.
- **Gap:** the hook (registered with PLAT-28's harness); nothing of the campaign itself.
- **Acceptance:** PLAT-28's harness: the screen at CROSS on NEW GAME and on LOAD GAME (on an empty card and on a card
  with saves, M3's two item orders), and CONTINUE returns to the main menu with the focus and valves unchanged (a trace
  and a card diff); no command of the chain (`UiprepMission1`, `MainMenuOnLoad`, `ListSavedGames`) is dispatched (a
  unit test on PLAT-08's host interface).
- **Dependencies:** MENU-02a, PLAT-28. **Size:** S. *([2026-10-02, OT.R6] it read "MENU-02"; the hook needs the
  menu, not its streams: MENU-02a.)*
- **Unknowns:** none on the original side (the chain is inventoried).
- **Owner calls:** **MENU-OC-3, ruled (a)** (the owner, 2026-10-01, R1). Reading (b) -- the chain drawn up to the
  mission load, about three to four weeks of work -- is not built; its group, MENU-10..MENU-16, is future scope at the
  end of this file.
- **[2026-10-02, OT.R5]** **OPTIONS and EXTRAS stop at PLAT-28's screen too**, for as long as their screens are
  parked (OPT-09..OPT-18 and MENU-04..MENU-07, OT.R6): CROSS on OPTIONS and on EXTRAS opens PLAT-28's screen by the
  same hook and the same acceptance as NEW GAME and LOAD GAME -- the first command each runs (`CallOptions`,
  `CallExtras`; M1's CROSS list) is replaced and nothing of the chain behind it is dispatched; CONTINUE returns to the
  menu with the focus and valves unchanged. Each of those two hooks is removed when its screens run (OPT-09, MENU-04).
- **Merged from:** menus MENU-OC-3; the scope ruling (new); ruled (a) 2026-10-01.

### MENU-04 -- EXTRAS hub (`dlgNetUnlockableExtras`)
- **Goal:** the extras menu with its lists, descriptions and unlock gating as the original.
- **What the original does:** M5.
- **Today:** none.
- **Gap:** all of it.
- **Acceptance:** SOCOM Legacy vs PCSX2 captures of the hub and each list on (a) a fresh card and (b) a card with campaign
  progress >= 90; the same items enabled and disabled. In the browser, card (b) is a slot record built in the test
  whose valves carry the progress the owner's PCSX2 card holds. **Corrected by R7 (2026-10-01):** (b) read "an
  owner-supplied PCSX2 card, imported through OPT-08"; R7 dropped OPT-08 (no import).
- **Proven by:** OPT-19 (the hub and lists on both card states).
- **Dependencies:** PLAT-15, PLAT-10, MENU-01, PLAT-11, PLAT-25, OPT-02. **Size:** M. *(R7, 2026-10-01: it named
  OPT-08 for card (b); a record with progress is built from OPT-02's valves instead.)*
- **Unknowns:** the unlock predicate per item -- decode the set's IF conditions on `incr_miss_*`/GameComplete; what the
  CK field accepts (likely a code entry) -- decode.
- **Owner calls:** **MENU-OC-11** -- with the campaign skipped, unlocks come only from an imported card, or stay locked
  as on a fresh card. (Importing a real PCSX2 `.ps2` card is in scope since R4, 2026-10-01: OPT-08; whether its
  campaign progress unlocks EXTRAS stays this call.) **Corrected by R7 (2026-10-01):** there is no import (OPT-08 is
  dropped), so a player's card can hold campaign progress only if the port writes it; the call is now whether EXTRAS
  stay locked as on a fresh card, or are unlocked some other way the owner names.
- **Merged from:** menus MENU-21.

### MENU-05 -- Extras movies, art gallery, training videos, credits
- **Goal:** `dlgPlayTutMovies`, `dlgMakeMusicMovie`, `dlgArtGal2`, `dlgCredits` play their PSS and return.
- **What the original does:** M5 (credits back on ONMPEGEND/CROSS/TRIANGLE, BackOutWithMusic; DontStartExtrasMusic).
- **Today:** none.
- **Gap:** the four dialogs on PLAT-21.
- **Acceptance:** the ONMPEGEND/return trace matches the recomp's; the first and last frames match the decoded PSS.
- **Proven by:** PLAT-36 (the ONMPEGEND/return trace).
- **Dependencies:** PLAT-21, MENU-04. **Size:** S.
- **Unknowns:** none beyond PLAT-19a's and PLAT-19b's.
- **Owner calls:** whether `TUT_*.PSS`, `*_AOP.PSS`, `ARTGALL2`, `MUSVID` and `CREDITS` count as front end (reached from
  EXTRAS) or campaign under the skip.
- **Merged from:** menus MENU-22; platform owner call (TUT_*).

### MENU-06 -- The jukebox
- **Goal:** the 12-track jukebox with its names and descriptions.
- **What the original does:** M5 (PlayMusic, Playtrack, Speaker, `MUS_JUKE_01..12`, UpdateJukeText).
- **Today:** none.
- **Gap:** the page on PLAT-22.
- **Acceptance:** track selected -> stream started (name) equals the recomp trace; audio correlation per track at
  MENU-02's bar.
- **Proven by:** PLAT-36 (the stream start and audio runs).
- **Dependencies:** PLAT-22, MENU-04. **Size:** S.
- **Unknowns:** none beyond PLAT-22's. **Owner calls:** none.
- **Merged from:** menus MENU-23.

### MENU-07 -- The unlock viewers (`dlg_CharUnlock`, `dlg_WeapUnlock`)
- **Goal:** the character and weapon unlock screens.
- **What the original does:** M5; dlg_CharUnlock's AOP buttons (AlbCharsAct...RusCharsAct) and Set* commands; character
  names SAS (SABRE), PIUS, FERAL, QUIXADA, SAS (REAVER), VALESKA, ...; dlg_WeapUnlock (234 names, the largest set after
  the ARMORY's).
- **Today:** s5 ARMORY UI-model and portrait renderers (`armoryView.ts`) can be reused.
- **Gap:** the two screens.
- **Acceptance:** captures >= 90 on both card states of MENU-04.
- **Proven by:** OPT-19 (both screens on both card states).
- **Dependencies:** MENU-04, the S1 UI-model path. **Size:** M.
- **Unknowns:** dlg_WeapUnlock's model/preview use -- decode the layout's MODELS.
- **Owner calls:** none.
- **Merged from:** menus MENU-24.

### MENU-08 -- The LAN item
- **Goal:** the main menu's LAN item behaves per the owner's ruling.
- **What the original does:** M4: `go_to_LAN_play` -> dlgNetLogin -> `dlgLANPlayerName` -> `dlgLANConnect` ->
  `dlgLANBriefingRoom` (+ `dlgLAN_Options`, `dlgSetSOP`, `dlgSetTaunts`, `dlgReturnFromNTGUI2LAN`); UIMnLOC 400, 421,
  445, 451, 570.
- **Today:** 2026-10-03, pending review (web research 142): the hook `LAN_button` -> `go_to_LAN_play` (`MENU_08_HOOKS`)
  registered with PLAT-28's harness and passing it on the real `dlgMenu`; `go_to_LAN_play` never started.
- **Gap:** the ruling, then the screens or the hook.
- **Acceptance:** per the ruling: the hook registered with PLAT-28's harness, or the LAN screens compared with recomp
  captures (OPT-19).
- **Dependencies:** PLAT-28; segment 05 if implemented. **Size:** S (desktop-only screen) or L (implemented).
- **Unknowns:** none on the original side beyond the dialogs' scripts.
- **Owner calls:** **MENU-OC-5** -- LAN broadcast / system link cannot run in a browser as such: PLAT-28's screen, or
  LAN mapped to a browser-local match.
- **[2026-10-02, OT.R5]** **The LAN item opens PLAT-28's screen; the LAN plan is paused** (the owner: "We're keeping
  central server and pausing the LAN plan"). This block is the hook -- registered with PLAT-28's harness, its
  acceptance PLAT-28's -- at size S, on the online path beside PLAT-28. The LAN screens (size L) are not built; if the
  LAN plan is reopened, this block and the online segment's dialogs are its brief (the online-path plan, "The LAN path,
  paused"; a browser cannot broadcast on a local network, MENU-OC-5).
- **Merged from:** menus MENU-27; online front end unknown 11.

### MENU-09 -- The unplaced dialogs (`dlgExitState`, `dlgHype`, `dlgStickSetup`)
- **Goal:** settle the role of the dialogs no flow reaches, so none is built or dropped on a guess.
- **What the original does:** M6.
- **Today:** n/a. **Gap:** the facts.
- **Acceptance:** for each, a cited answer: the caller (or "none found" with the search recorded), and a capture where
  one is reachable; the result entered in PLAT-06's note.
- **Dependencies:** PLAT-06. **Size:** S.
- **Unknowns:** `dlgExitState`'s role -- find the `CExitMenu` ctor via string 0x3e2c98 and capture on quitting; what
  `GoToStickSetup` does with the missing dialog (OPTIONS) -- a decomp read and a recomp capture.
- **Owner calls:** none.
- **Merged from:** menus unknowns U10 and F33, F20 (new task).

## Future scope: the former conditional group MENU-10..MENU-16 (reading (b), not built)

**Not built** (the owner, 2026-10-01, R1: MENU-03 is option (a)). These were the dialogs reading (b) would have drawn
between NEW GAME / LOAD GAME and the mission load. They are kept here, ids stable, so their research is not lost and a
later owner ruling can reopen them as written; they are in no sprint and in no dependency map, and their prerequisite
lines are written **Dependencies (if reopened)** so PLAT-01's graph check does not read them as active. Every dialog
name below is a READERC member or a UIZANIM set as web R96 §1 and §3.4 list them (the campaign class; the README's
future-scope inventory), unless another source is cited. The campaign itself (missions, AI, objectives, the
pause menu's REPLAY MISSION and HELP rows, the debriefing) stays in the README's future scope.

### MENU-10 -- (future scope) NEW GAME: rank select (`dlgSelectRank`)
- **Goal:** the rank-select screen 1:1, reached from NEW GAME.
- **What the original does:** M4: NEW GAME -> UiprepMission1 -> `dlgSelectRank`; ENSIGN / LIEUTENANT / COMMANDER
  (`logs/parity/s4_pcsx2/A_03.png`).
- **Today:** none.
- **Gap:** the screen and its hand-off to MENU-11.
- **Acceptance:** reading level: the frame against `A_03.png` >= 90 (PLAT-30, the 4:3 correction); proven level: each
  choice's valve writes equal a recomp trace (PLAT-36) and the next screen's capture (OPT-19).
- **Proven by:** OPT-19; PLAT-36.
- **Dependencies (if reopened):** MENU-03, PLAT-15. **Size:** S.
- **Unknowns:** which valve or UI var holds the rank and whether it reaches the card before a mission loads -- the
  set's read.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision (README future scope, now conditional); future scope by R1 (2026-10-01).

### MENU-11 -- (future scope) NEW GAME: controller presets (`dlgControllerPresetsNewGame`, `-CS`, `-RG`)
- **Goal:** the new-game presets pages 1:1.
- **What the original does:** M4: `dlgSelectRank` -> `dlgControllerPresetsNewGame` -> CS/RG; the OPTIONS presets
  pages are O10 (segment 04).
- **Today:** none.
- **Gap:** the three dialogs, reusing OPT-14's pages.
- **Acceptance:** each page against a recomp capture (OPT-19); the chosen preset's valves equal OPT-14's for the same
  choice.
- **Proven by:** OPT-19.
- **Dependencies (if reopened):** MENU-10, OPT-14. **Size:** S (OPT-14's pages reused).
- **Unknowns:** what `-CS` and `-RG` differ in (only the names are known) -- decode their sets.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision; future scope by R1 (2026-10-01).

### MENU-12 -- (future scope) NEW GAME: the save prompt
- **Goal:** the new game's card prompt and slot flow 1:1.
- **What the original does:** the only captured save flow is this chain's (`D:/socom_archive/parity/s8_save_yes`; O20):
  "Would you like to save to the memory card (8MB)...?" YES/NO -> slot select -> overwrite.
- **Today:** none.
- **Gap:** the prompt's place in the chain; the card dialogs are OPT-05b..OPT-05h's.
- **Acceptance:** the sequence against `s8_save_yes/s00..s05` (dialog-text band, PLAT-30); the card after YES equals
  OPT-01's expectation.
- **Dependencies (if reopened):** MENU-11, OPT-05e, OPT-05h. **Size:** S.
- **Unknowns:** where exactly in the chain the prompt fires (after presets or after the AOP movie) -- the sets' read.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision; future scope by R1 (2026-10-01).

### MENU-13 -- (future scope) LOAD GAME: the SavedGames list and the SaveGame reader
- **Goal:** the load list drawn from the card's `SaveGame<n>` files, as the original lists them.
- **What the original does:** M1: the SavedGames LISTBOX (`popup_load.tif`, 5 columns); MainMenuOnLoad,
  LoadGameOnListBox; `ListSavedGames` 0x2801c0, `LoadSavedGame` 0x27fa40, `DoesSlotHaveGame` 0x27dfe0,
  `GetNumSavedGames`; prompts `_1359`-`_1364`; the dummy `SaveGame<n>` files the options save writes (O12) carry a
  CMission -> MissionData.rdr of 1,432 B (OPT-01).
- **Today:** none; PLAT-27 reads the files. **Corrected by R7 (2026-10-01):** PLAT-27 is dropped; its readers are a dev
  tool under `tools/`, and the browser's `SaveGame<n>` files hold our JSON (PLAT-25's file table).
- **Gap:** the MissionData fields the list shows; the list; CROSS on an entry stops at MENU-03's hook.
- **Acceptance:** the list for the f0 card (seven dummies) and for an owner-supplied card with saves (OPT-08) against
  recomp/PCSX2 captures (OPT-19); each column's value equals `tools_py/card_save.py`'s decode of the same file.
  **Corrected by R7 (2026-10-01):** the card with saves is a slot record built in the test from the owner's card's
  values, read with the dev tool (OPT-08's import is dropped).
- **Proven by:** OPT-19.
- **Dependencies (if reopened):** MENU-03, PLAT-15, PLAT-26. **Size:** M (the MissionData fields are unread). *(R7,
  2026-10-01: it read "MENU-03, PLAT-15, PLAT-27, OPT-08"; both are dropped, and the list reads the card through
  PLAT-26.)*
- **Unknowns:** which MissionData fields fill the five columns -- the `CMission` serialize read; how a dummy lists.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision (README future scope: the LOAD GAME list); future scope by R1 (2026-10-01).

### MENU-14 -- (future scope) Mission selection and the areas of operation (`dlgMISSIONSELECTION`, the four `dlg_areaop_*`)
- **Goal:** the selection screens 1:1, up to choosing a mission.
- **What the original does:** the dialogs are on the disc (names, a reading); their place in the chain is not read.
- **Today:** none.
- **Gap:** the screens.
- **Acceptance:** recomp captures per screen (OPT-19) >= 90.
- **Proven by:** OPT-19.
- **Dependencies (if reopened):** MENU-13, PLAT-15. **Size:** M.
- **Unknowns:** which flow reaches them (NEW GAME after the AOP movie, LOAD GAME, or both) -- the sets' read.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision; future scope by R1 (2026-10-01).

### MENU-15 -- (future scope) The four AOP cinematics
- **Goal:** each area of operation's movie plays from the chain and hands on as the original.
- **What the original does:** the four AOP cinematics with `SetFirstMission` m51/m61/m71/m81 (names, a reading);
  `alb/braz/alg/russ_aop.pss` (M5); M4's AlbaniaCinematic after the presets.
- **Today:** none.
- **Gap:** the dialogs on PLAT-21.
- **Acceptance:** the ONMPEGEND hand-off order against a recomp `PS2X_MPEG_TRACE` (PLAT-36); first and last frames
  against the decoded PSS.
- **Proven by:** PLAT-36.
- **Dependencies (if reopened):** MENU-11, PLAT-21. **Size:** S.
- **Unknowns:** whether a button skips them -- the sets' read.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's); MENU-05's call on the AOP
  movies.
- **Merged from:** the 2026-10-01 revision; future scope by R1 (2026-10-01).

### MENU-16 -- (future scope) The briefing and map screens, and the stop at the mission load
- **Goal:** the twelve briefings and twelve maps drawn and driven as the original; the mission load opens PLAT-28's
  screen (MENU-03's hook, moved there only if (b) is ever ruled).
- **What the original does:** the twelve `dlg_Brief_*`, the twelve `dlg_Map*` (the only MAPCONTROL users), the four
  `Common_*` includes with `Common_Brief_Anims`, `Common_AOP_Anim`, `ObjectiveDisplayAnim` (names, a reading).
- **Today:** none.
- **Gap:** the screens, the MAPCONTROL reader and widget (PLAT-05, PLAT-15), the `Common_*` inclusion, the hook.
- **Acceptance:** recomp captures per briefing and map (OPT-19) >= 90; the hook through PLAT-28's harness at the
  mission load.
- **Proven by:** OPT-19.
- **Dependencies (if reopened):** MENU-14, MENU-15, PLAT-05, PLAT-15, PLAT-28. **Size:** L (twelve of each, a new widget).
- **Unknowns:** the MAPCONTROL reader (PLAT-05's unknown); how `Common_*` includes enter a dialog; which call is
  "entering a mission" (the mission-load command the briefing's script issues) -- the sets' read.
- **Owner calls:** MENU-OC-3 (ruled (a) 2026-10-01; reopening this task is the owner's).
- **Merged from:** the 2026-10-01 revision (README future scope: campaign navigation); future scope by R1 (2026-10-01).
