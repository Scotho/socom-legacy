# 140 -- The main menu: the roller, its items and its frame (MENU-02a)

Written 2026-10-03 for MENU-02a (`../roadmap/03-menus.md` "MENU-02a", the online path's slice of MENU-02; the plan
`../plans/2026-10-02-online-path-target.md`, OT.R5, OT.R6, OT.R8). Sources: `dlgMenu.rdr` of `RUN/UI/READERC.ZAR` and
its own set of `RUN/UIZANIM.ZAR`, read with the repository's readers (`parseRdr`, `loadDialog`, `parseAnimSets`,
`decodeUiProgram`: the ops below are decoded data, RS.R8); the model `mainmenu_roller` of `RUN/UI/UI_GEO.ZED` +
`UI_MDL.ZED` through `weaponLibrary` in the `'bias'` form (research 95 §5.3) and its textures in `RUN/UI/UI_TXR.ZED`;
the camera record of `RUN/UI/UI.ZED`; the retail decompilation `C:/Projects/socom_pc/game/analysis/
socom2_game.elf.decomp.c` (`D:L<n>` = its line; cited, never pasted) and the game ELF's strings (`tools/elfImage.ts`);
reCOM's `zCamera/zcam.h` as evidence for the camera record's layout; the archived captures `logs/parity/s4_pcsx2/
A_04.png` and `scripts/parity/ref_main_menu_ours.pcsx2.png` (the manifest's `menu.main` row, which cites both already);
research 96 §3.3, 106, 112, 115 §14-§16, 117, 138, 139.

The code: `packages/ui/src/compositor/models.ts` (the 3D pass: a dialog's `MODELS` placed, its nodes for the scripts,
the projection), the `models` list on the screen (`scene.ts`), the build's step 3b (`dialogScreen.ts`), the draw list's
`models` item with its triangles (`drawList.ts`), the scripts' node lookup over the model's nodes
(`screens/screenScripts.ts`), a TEXT's UIVAR told at its attach (`widgets/widgetSet.ts`), the main's `VERSION_STRING`
(`screens/launch.ts`); in the viewer the software triangle rasteriser (`uiCompositorView.ts`), the page's art
(`menuArt.ts`: the libraries, the font atlas, the models, the strings), `menuCommandsHost.ts` registering the main's
variable, and five lines of `frontEnd.ts`. The tests: `packages/ui/test/compositor/models.test.ts`,
`packages/ui/test/widgets/objects.test.ts` (the UIVAR case), `packages/ui/test/screens/mainMenu.test.ts` (CI: the set
transcribed, the walk over the machine), `packages/ui/test/screens/mainMenuDisc.test.ts` (dev disc: the real set, the CROSS path),
`packages/viewer/test/uiCompositorView.test.ts` (the triangles), `packages/viewer/test/menuArt.test.ts` (CI and dev
disc), `tools/test/mainMenuDisc.test.ts` (dev disc and the captures: the frame, the DOWN walk step by step),
`tools/test/mainMenuMovie.test.ts` (the same, the wasm too: the frame with MENULOOP drawn). Confidence: **reading,
pending review** for every transcription; the frame and the walk are **capture-scored** (§5) with the numbers under the
bar named; §6 lists the readings. Revised 2026-10-03 after review: the walk's archived captures exist and are scored
(§3, §5), the CROSS path is held (§1), a clear texel writes no depth (§6), `USEMODELUIVAR` is made (§7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R140.1 | **The roller carries the item text.** The six buttons' captions are a space; the words are `mainmenu_roller`, a hexagonal drum about x of twelve quads at radius 5.7 -- one lit (`new_on` .. `online_on`, `menu_*_on.tif`, the glow baked in) and one dim (`*_off`) per item, 27.4 x 4.5 units each, every node's matrix the identity -- turned to the front item's face by `ActivateMenuBtns` (k x 60 degrees about x: 1 NEW GAME, 2 LOAD GAME, 3 EXTRAS, 4 OPTIONS, 5 LAN, 6 ONLINE) and that item's `_on` shown, the others' `_off` | `models.ts`; `mainMenu.test.ts` | §1, §2 |
| R140.2 | **The valve `MenuButtonChanged` is the front item**: `SetMenuValve` sets it 2 when `GotSaveGames > 0` (a counted save, research 138 R138.4) else 1; `OnMenuBtnDown` takes 1 off (0 wraps to 6), `OnMenuBtnUp` adds 1 (7 wraps to 1); each then stops and calls `ActivateMenuBtns`, which also activates that item's button and disables the five others. So the DOWN walk on an empty card is NEW GAME, ONLINE, LAN, OPTIONS, EXTRAS, LOAD GAME, NEW GAME (M3's order), and a card with a counted save starts on LOAD GAME | the same | §1, §3 |
| R140.3 | **EXTRAS is always on the drum**: no script hides an item for the card's state; it is seen when its face is within 60 degrees of the front (LOAD GAME or OPTIONS lit), on the back otherwise -- MENU-02's "when EXTRAS is visible" unknown | `mainMenuDisc.test.ts` | §1 |
| R140.4 | **A `MODELS` entry sits at (AZIMUTH, ELEV, -DISTANCE) before the menu's camera**: `FUN_00366730` (D:L262800-262856, called by the build at D:L263661) makes the model at `(AZIMUTH + 320, ELEV, 320 - DISTANCE)`, named by the entry's NAME, and the menu state's camera node is placed at `(320, 0, 320)` at its Init (D:L54812) -- research 95's `MODEL_CAMERA_READING`, now read | `models.ts` | §2 |
| R140.5 | **The projection's focal length is 455 px per unit at unit depth, square**, a reading by fit: the camera record's half angles (0.7854 across, 0.5498 down = x 448/640, `FUN_002911b0` D:L137370-137372) would give 320 and 365, which no capture shows; both captures put the roller's items at 455 +- 5 (`UI_MODEL_FOCAL_READING`) | `models.ts` | §2 |
| R140.6 | **The cues**: `ActivateMenuBtns` plays `.TCM_SLIDE` and `.METAL` as it starts turning, `.METAL` 0.15 s on, `.TCM_SLIDE` at 0.30, `.METAL` at 0.45, through PLAT-23's host; `CallMusicPressDemo` (`MUS_MENU_THEME` after an IOP reboot) is started by nothing on the disc and the menu's music stays MENU-02's: nothing plays for it | `mainMenu.test.ts` | §1 |
| R140.7 | **The frame**: the logo, the arrows, the legalese and the version line (`VERSION_STRING`, the build string `SOCOM 2 r0001 17:22:21 Oct 11 2003` at 0x3e17e0, registered by the main D:L47871-47872) and the roller draw with nothing undrawn, in Node and in the browser; against `A_04.png` **91.1 with the MENULOOP's blocks masked** (81.9 whole), against `ref_main_menu_ours.pcsx2.png` **86.9 masked, under the bar** (83.9 whole) -- the movie is black in the frame; **with MENULOOP drawn** (2026-10-03, sprint 11's close: the decoder in Node) the same 2.5-s frame scores **96.0 masked against `A_04`** (97.9 whole) and **95.7 masked against the reference** (97.8 whole), both met (`tools/test/mainMenuMovie.test.ts`). **The DOWN walk step by step** against the archived `menu_explore` run (s01..s08): 90.0, 89.1, 95.7, 90.0, 86.3, 82.5, 82.8, 81.4 masked -- four at or over the bar, four under, the movie's brighter moments (the same NEW GAME face scores 90.0 at s01 and 82.8 at s07) | `tools/test/mainMenuDisc.test.ts` | §5 |
| R140.9 | **The CROSS path on the roller**: `.DINK` once (flags 0x82; `go_to_LAN_play` twice), the lit quad to scale 1.6 and opacity 0 together in 0.1 s (`do_multi_or_medius` 0.15), `Roller` and both arrows hidden, `SuspendMenuInput 1.75` (a DOWN inside it lost), the valves, and `SWITCHMENU` stored by the shell and landed after its fade (`FUN_00365a00`) while the menu's nodes finish -- the three or four sequences start together | `mainMenuDisc.test.ts` | §1 |
| R140.8 | **Two drifts found in earlier code**: a TEXT's UIVAR was attached but not told at the build (`FUN_003792f0` D:L273072-273077 tells it: the version line was blank), fixed; and `frontEnd.ts` registers MENU-01a's card rows before the opener's `BootStubs`, so on the page the stubs answer the card rows (research 139 §3's f0 card), not the virtual card -- left for its owner | §7 | §7 |

## 1. `dlgMenu.rdr`'s own set (decoded; the ops the path runs)

The layout (M1; research 96 §3.3): six `BUTTON`s at x 256 (`load_game_button` y 300, `new_game_button` 330,
`multiplayer_button` 360, `options_button` 390, `Extras_button` and `LAN_button` 420), `CAPTION " "`, `HCENTERED`, the
states NORMAL scale 0.6 colour (30, 30, 50), ACTIVE 0.75 (12, 68, 78) with `TEXT_GLOW` 0.3-1 over 0.8 s, PRESSED 0.7
(255, 74, 8), DISABLED 0.6 (15, 30, 45) (`load_game_button` ACTIVE 0.7 / PRESSED 0.75); each UP / LEFT -> `OnMenuBtnUp`,
DOWN / RIGHT -> `OnMenuBtnDown`, CROSS its own; the IMAGEs `LoadGameBack` (`popup_bg.tif`, 640 x 448 at the origin),
`SplashLogo` (`SplashLogo.tif`, (70, 45) 500 x 195), `arrow_up` (`arrow_top.tif`, (293, 240) 50 x 50) with `arrow_dwn`
under it at (0, 112); the TEXTs `LEGALEZE` (`_507_DevelopedZipper_MSG`, (320, 405), scale 0.8, centred) with `LEGALEZE1`
(`_508_Copyright_MSG`, +18) and `VERSION` (`UIVAR VERSION_STRING`, +36) under it; the LISTBOX `SavedGames` at (200,
-350); the model `Roller` = `mainmenu_roller` (AZIMUTH 0, ELEV -12.5, DISTANCE 60). Libraries `ui/assetlib/ui2d`,
`ui/assetlib/uibf`; the font library; `FONT font_text_01`; the background MPEG `run/movies/common/menuloop.pss`.

The animations (`decodeUiProgram` over set 38 of `UIZANIM.ZAR`, 23 animations; the branches the path takes):

- **`SetMenuValve`** (ONSTART), two sequences. First: `CameFromExtras = 0`, `BeenPastOptions = 0`, `SuspendMenuInput
  0.75`, `SavedGames` and `LoadGameBack` hidden, `MENUFADER` 0.99 -> 0 in 0.75 s. Second: `CALL Ensure_MC_Dirs_Fast`
  (blocking; research 138), `GetNumSavedGames GotSaveGames`, `IF GotSaveGames > 0` `MenuButtonChanged = 2` `ELSE` `= 1`
  `ENDIF`, `CALL ActivateMenuBtns`, every `*_on` hidden, `ComeFromLan = 0`, `OptionsMenuChanged = 0`, `BackFromBrief =
  0`, `InWhichAOP = 0`, `FlushMenuHistory`, `MenuSpot = 1`, `SavedGames` moved (65, 400) -> (65, 88) in 0.1 s.
- **`OnMenuBtnDown`**: `SuspendMenuInput 0.15`, every `*_on` hidden, every `*_off` shown, `MenuButtonChanged -= 1`,
  `IF < 1` `= 6`, `STOP_ANIMATION ActivateMenuBtns`, `CALL ActivateMenuBtns`. **`OnMenuBtnUp`** the same with `+= 1`
  and `IF > 6` `= 1` (the hides and shows before the valve there).
- **`ActivateMenuBtns`**: `IF MenuButtonChanged == 1` `Roller` turned to (0, 0, 0, 1) in 0.15 s (flags 0x40: from where
  it is), `CALL_SEQUENCE new_action`; `ELSEIF == 2` -> (0.5, 0, 0, 0.866) `load_action`; `== 3` -> (0.866, 0, 0, 0.5)
  `extras_action`; `== 4` -> (1, 0, 0, -4.37e-8) `options_action`; `== 5` -> (0.866, 0, 0, -0.5) `lan_action`; `== 6`
  -> (0.5, 0, 0, -0.866) `online_action`; `ENDIF`; then `SOUND .TCM_SLIDE`, `SOUND .METAL`, `WAIT 0.15`, `SOUND .METAL`,
  `WAIT 0.15`, `SOUND .TCM_SLIDE`, `WAIT 0.15`, `SOUND .METAL` (flags 0x90, new plays, unplaced). Each `<item>_action`
  (activation 2: by the call alone): `<item>_on` shown, `<item>_off` hidden, `ActivateButton` and `EnableButton` of its
  button, `DisableButton` of the five others, then the lit quad's scale 1 -> 1.4 in 0.1 s, -> 1 in 0.15, -> 1.15 in
  0.15, -> 1 in 0.2, -> 1.03 in 0.15, -> 1 in 0.15 (flags 0x300).
- **`PulseArrows`** (ONSTART): `arrow_up` 0.2 -> 0.99 in 0.75 s, 0.99 -> 0.2 in 0.75, `WAIT 0.15`, `LOOP` for ever
  (`arrow_dwn` is its child and fades with it, `pushOpacity`). **`UiStopAttract`** / **`UiAttractMode`**: the 120-s idle
  into the attract (BOOT-07, not this task). **`CleanupMissionMemory`**, **`handle_memcard_error`**: research 138.
- The CROSS animations: `UiprepMission1` (NEW GAME), `do_multi_or_medius` (ONLINE), `go_to_LAN_play`, `CallOptions`,
  `CallExtras` -- three sequences (`CallExtras` four) that start together (activation 1): `SOUND .DINK` (flags 0x82, a
  new play; `go_to_LAN_play` plays it in two sequences, `CallOptions` and `CallExtras` in the switching one) with the lit
  quad's scale 1 -> 1.6 in 0.1 s (`do_multi_or_medius` 0.15) and `SuspendMenuInput 1.75`; the quad's opacity 1 -> 0 over
  the same time, then `Roller`, `arrow_up` and `arrow_dwn` hidden; the valves (`CameFromDebriefing = 1` and the
  mission flags for NEW GAME, `ComeFromLan = 0` and `CurrentMission = 0` for ONLINE and LAN) and `SWITCHMENU` to
  `dlgSelectRank.rdr`, `dlgMPswitch.rdr` (ONLINE and LAN), `dlgOptions_Menu.rdr`, `dlgNetUnlockableExtras.rdr`, which
  the shell stores, covers with its fader and lands after the countdown (`FUN_00365a00`, PLAT-10) while the menu's own
  nodes finish. It is `.DINK` the set plays, not `.METAL`: PLAT-23's selection cue is the code side's, a different
  thing. Held on the disc rig for NEW GAME and ONLINE (research 138 R138.3; MENU-03 / PLAT-28 / ONL-01 take the
  destinations). `CallMusicPressDemo` (`VagStreaming
  OFF`, `RebootIOP`, `VagStreaming ON`, `SOUND MUS_MENU_THEME`) is bound to nothing; `MissionShortcutSKB` likewise
  (research 138 §1: the debug shortcut, `LOAD_SCREEN`).

The sequence `word`: a sequence whose low byte is 2 (activation 1) starts with its animation, one whose low byte is 4
(activation 2) by `CALL_SEQUENCE` alone (`zanimRuntime.ts` L297; the action sequences are the latter -- the CI test's
first draft had them auto-started and every quad lit at once).

## 2. The roller, the camera and the projection

**The model** (`weaponLibrary(UI_GEO, UI_MDL, 'bias').decode('mainmenu_roller')`): the root, a point `main_buttons`,
and twelve visual nodes, each one mesh of four vertices and two triangles with `cull` set, unlit, the vertex colours
unity: `new_on` / `new_off` at y -1.25 .. 3.19, z 4.875 .. 5.69 (the front, facing +z and a little up); `load_*` at y
4.25 .. 5.81, z -0.25 .. 4.0 (above, 60 degrees on); `extras_*` y 2.63 .. 5.56, z -5.13 .. -1.63 (120); `options_*` y
-3.13 .. 1.31, z -5.63 .. -4.81 (180, the back); `lan_*` y -5.75 .. -4.19, z -3.94 .. 0.31 (240); `online_*` y -5.5 ..
-2.56, z 1.69 .. 5.19 (300). Every node's composed matrix is the identity (`flattenScene`'s `world`: the origins all at
0), so a quad's scale pulse is about the model's origin, as the original's node matrix makes it. The textures are 128 x
32 (`menu_newgame_on.tif`: the letters with their glow over the whole height, stored bottom row first; `_off`: the dim
letters on rows 8-23). The u of the front, back and LAN quads runs 0 -> -1 (the texture repeating).

**The placement** (R140.4). `FUN_00366730` walks the entries (0x34 bytes each: NAME, MODEL, AZIMUTH +0x18, ELEV +0x1c,
DISTANCE +0x20 default 20, the ROT field, the `USEMODELUIVAR` flag; the loader `FUN_003812b0` D:L277104-277195) and for
each: the model by MODEL (or by the UI variable's string when the flag is set), made at `(AZIMUTH + 320.0, ELEV, 320.0 -
DISTANCE)` (the position D:L262819-262821; `FUN_00317c20(name, &pos, 0)` D:L262842), `FUN_00314320(node, 1, 1)`, named by NAME
(`FUN_00314ee0`), added to the world (the scene's vtable +0x18), shown (`FUN_00312f20(node, 1)`), turned by the ROT
field (`FUN_00315760`), and pushed onto G's list at +0x8ec. The menu state's camera node is `DAT_0045c380 + 0x128`, which
MS's Init places at `(320.0, 0, 320.0)` (D:L54812: `FUN_003157d0(0x43a00000, 0, 0x43a00000, node)`) before
`FUN_00290700` (the far plane from the world's extent) and `FUN_00294070` (the projection). So the entry stands at
`(AZIMUTH, ELEV, -DISTANCE)` before a camera at the origin: `UI_MODEL_CAMERA`. Its orientation is the node's default; y
up and -z forward is the frame in which `ActivateMenuBtns`' +60 degrees about x brings `load_*` (at +y) to the front
(+z, toward the camera) -- which is what every capture of LOAD GAME lit shows, so research 95's
`SPIN_SCREEN_SENSE_READING` is confirmed for this axis.

**The projection** (R140.5, `UI_MODEL_FOCAL_READING`). `RUN/UI/UI.ZED`'s `cameras/camera` record (144 bytes) carries
0.7854 at +32 and 0.54978 at +36 -- reCOM's `tag_CAMERA_PARAMS` lays the record out as the quaternion, the fog colour,
then `m_hfov`, `m_vfov` (half angles: `SetHalfHorizontalFOVRadians`), the near 4.0, mid 100, far 100 -- and the engine
rewrites the vertical half angle as the horizontal x 448 / 640 (`FUN_002911b0` D:L137370-137372, `DAT_004a44c8` /
`DAT_004a44c4` the frame's 448 and 640, `FUN_003b1200` D:L305276-305277), keeping sin, cos and tan at +0x1c4 / +0x1cc
/ +0x1d4. As half angles they give 320 px per unit across and 365 down, which is not the console's frame:

| item (quad centre, model space) | depth before the camera | rows under the frame's middle | `A_04` (448-space) | `ref` | px / unit |
|---|---|---|---|---|---|
| NEW GAME lit (y 0.97, z 5.28) | 54.7 | 11.53 units | 97.1 (mid 321.1) | 97.0 | 461 |
| LOAD GAME dim (y 5.03, z 1.88) | 58.1 | 7.47 units | 58.3 (mid 282.3) | 58.5 | 453 |
| NEW GAME's letters (85 of 128 texels = 18.2 units wide) | 54.7 | -- | 150 px wide | 140 (x 640 / 597 = 150) | 451 |

The rows were measured on the captures' lit pixels (the rows over a brightness of 90 between y 250 and 440 of the
640 x 480 picture, scaled by 448 / 480; the 640 x 448 reference letterboxed, its x by 640 / 597). One focal length,
455, fits the three within 1.5 %, and with it the drawn items land within 1 px of the captures (ours: LOAD GAME mid
282.0, NEW GAME 320.0, 146 / 152 px wide). The matrix the engine builds (`FUN_00294070` D:L138868-139100: the viewport
scales at +0x470 / +0x474, +0x290 and +0x4b0 into +0x370 / +0x384, then `FUN_001c0410`) was not read to the number, so
the value is a reading chosen from the measurement; what settles it is that read, or a burst of the original's roller
at two depths (the CROSS animation's scale 1.6 would do).

**The draw** (`projectModels`, `drawModels`). Every active part of an active entry, each vertex through the part's
scale and rotation, the entry's scale, rotation and place, into the camera's frame and onto 640 x 448 at the focal
length (a point at or behind the camera drops its triangle); the viewer fills each triangle's pixels at their integer
centres (the quads' rule, `GS_SPRITE_COVERAGE_READING`), the texel and the colour perspective-correct (by 1 / w), the
texture addressed as stored (`UI_MODEL_TEXTURE_ROWS_READING`: the 2D path's bitmaps are flipped top row first for the
drawer, so v is flipped back), modulated and blended as the quads are (`GS_MODULATE_BLEND_READING`), a depth buffer for
the pass, a clockwise face dropped when the mesh culls (every roller quad does). The alpha is the vertex's times the
part's and the entry's opacity, which the CROSS animations fade (`OBJECT_OPACITY_FROM_TO` on `new_on`, on `Roller` in
`UiAttractMode`).

## 3. The walk over the machine, and what the tests hold

`mainMenu.test.ts` (CI) assembles the five programs of §1 that the path runs -- `SetMenuValve`'s second sequence and
the first's hides and fade, `OnMenuBtnUp`, `OnMenuBtnDown`, `ActivateMenuBtns` whole, `PulseArrows` -- in the disc's
layouts (research 106 §4) over a made-up `dlgMenu` with M1's six buttons, the arrows, the list and a roller of twelve
one-triangle parts named as the file names them, on PLAT-10's machine with PLAT-11's dispatcher and MENU-01a's rows (the
card a stub), and holds: on the empty card every `_on` hidden at the build, NEW GAME's lit after the 0.15 s turn, the
five `_off` shown, `new_game_button` activated, the roller on face 1, `SavedGames` and `LoadGameBack` hidden, MENUFADER
0; the five cues at 0, 0, 0.15, 0.30, 0.45 s of the turn's end and nothing for the music; the arrows' loop; the DOWN
walk 1, 6, 5, 4, 3, 2, 1 with the lit quad, the activated button and the face's quaternion at each step, at 1.5 s a step
as `menu_explore.txt` walks it (`stable+1.5:DOWN`); UP the other way with a press inside `SuspendMenuInput 0.15` lost; a
counted save -> LOAD GAME first; the lit quad's scale pulse. `mainMenuDisc.test.ts` runs the disc's own `dlgMenu.rdr`
and set the same way (the roller stood in by the same twelve names) and holds the walk's order, the faces, the cues
through PLAT-23's `UiSoundCues`, EXTRAS' faces (2, 3, 4 within 60 degrees of the front), the card-with-saves start,
that MENUFADER sits under 0 until 1.5 s -- the two fades research 139 §9 found (`menu_fade_up` and `SetMenuValve`'s), not
changed here -- and the CROSS path on NEW GAME and ONLINE (§1, R140.9).

The archived DOWN walk (`scripts/parity/menu_explore.txt`: `untilref(ref_main_menu_ours.png)+1.0:CROSS`, then seven
`stable+1.5:DOWN`, a capture before each press) is on this host: `logs/parity/runs/menu_explore/s00_none.png` ..
`s08_none.png` with its `manifest.json` (2026-09-10, the recompiled game's, 640 x 448 the picture whole, as
`options_explore`'s -- whose `s04_CROSS` the manifest's `menu.main.options-lit` row cites). `s00` is the menu before the
script's CROSS (the same state as `s01`); `s01` is NEW GAME lit before the first DOWN, `s02` ONLINE, `s03` LAN, `s04`
OPTIONS, `s05` EXTRAS, `s06` LOAD GAME, `s07` NEW GAME, `s08` ONLINE -- M3's order with the wrap. The manifest row
`menu.main.down-walk` cites the eight; `tools/test/mainMenuDisc.test.ts` walks the session the same way (a DOWN for one
frame through PLAT-11's source, 1.5 s a step) and scores each step (§5). The first draft of this note said no such
run existed and owed the captures to OPT-19: that was wrong, and is withdrawn.

## 4. The page's art (`menuArt.ts`)

`FRONT_END_TEXTURES_PLACEHOLDER` (research 115 §15) said which bank a `LIBRARIES` entry and the font library resolve
to was not settled. It is: an asset library's file is the path's last segment cut to four characters and upper-cased
(`FUN_003199c0`; research 95 §5.1; `assetLibStem`), so `ui/assetlib/ui2d` is `RUN/UI/UI2D_TXR.ZED` (21 bitmaps: the
arrows, `SplashLogo.tif`, `popup_load.tif`, `font_titlebar_01.tif` ...) and `ui/assetlib/uibf` `RUN/UI/UIBF_TXR.ZED` (24:
`popup_bg.tif`, the rank and unlock pictures); the font library every dialog without `NOFONTLIB` loads is
`common/assetlib/font` (research 105 §1), `RUN/COMMON/FONT_TXR.ZED` (`font_text_01.tif`, `font_special_01.tif`); the
`MODELS` are `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED` with `RUN/UI/UI_TXR.ZED` (87: the twelve `menu_*` and the weapons').
Each library's textures cite its own `_PAL` (research 72's caveat); a bitmap comes from the first library in the
layout's order that holds it (as the ARMORY's, `armoryData.ts`); the 2D ones are flipped top row first for the drawer.
The strings are PLAT-04's `LocService` over the loose tables (`UIMn` holds 507 and 508; `UILd` is a map archive's and
is not read). `withMenuArt(source, disc)` adds `art` and the captions to `readFrontEndDisc`'s disc; the session reads
`disc.art.textures` and `disc.art.model` (two of the five `frontEnd.ts` lines; the import, the field and `mountFrontEnd`'s
call the other three -- five, not the brief's two: each a one-liner, claimed in HANDOFF §3). The placeholder constant
stays declared: a session without art still draws the dialog's quads untextured, as before.

The main registers `VERSION_STRING` with the build string before the first frame (D:L47871-47872: `FUN_003857c0(0x437e80,
"VERSION_STRING", 0, 2)`, `FUN_003862a0(var, "SOCOM 2 r0001 17:22:21 Oct 11 2003")`; the strings at 0x3e17c8 and
0x3e17e0 of `socom2_game.elf`): `MAIN_UI_VARS` / `registerMainUiVars` in `launch.ts`, called by `connectMenuCommands`
-- the page's first hook that holds the one manager. For it to show, a TEXT's UIVAR must be told at its attach, which
`FUN_003792f0` does (D:L273072-273077: `FUN_00385df0`, then the attachment's vtable +0xc with the var) and
`WidgetSet.follow` did not (R140.8; the button's own attach already did, research 117 §2): fixed, held by
`objects.test.ts`.

## 5. The frame and its scores

`tools/test/mainMenuDisc.test.ts` runs `FrontEndSession` as the page does, on the disc through `withMenuArt`, 75 ticks
of PLAT-12's (2.5 s: SetMenuValve's fade over, NEW GAME lit, the arrows mid-pulse), rasterises it, and scores it by
PLAT-30's `judge`. The MENULOOP movie is not decoded in Node (no built wasm; the page's `MOVIE_SOURCE_PLACEHOLDER` on
this branch too), so the frame is black where the movie would show. "The MENULOOP region masked" is read as every
32 x 32 block of our frame that holds no lit pixel -- where nothing of the dialog draws -- computed from the frame
(`menuloopMask`: 149 of 280 blocks), never hand-picked; inside the dialog's own blocks the movie still shows through and
counts against us. The 4:3 correction: `A_04.png` is 640 x 480, the picture whole, which the scorer squeezes onto its
grid; the reference is a 640 x 448 window with the picture letterboxed, so ours is squeezed into its box (`letterboxBox`,
as PLAT-14's test does).

| capture | correction | mask | score | control | matched |
|---|---|---|---|---|---|
| `logs/parity/s4_pcsx2/A_04.png` | the 640 x 480 picture whole | the MENULOOP blocks | **91.1** | 41.6 | yes |
| the same | the same | none | 81.9 | 58.7 | no (under 90: the movie's dark brown against our black) |
| `scripts/parity/ref_main_menu_ours.pcsx2.png` | ours in the 4:3 box | the MENULOOP blocks | **86.9** | 44.0 | **no (under 90)** |
| the same | the same | none | 83.9 | 63.8 | no |

**The walk, step by step** (the `menu.main.down-walk` row; ours at 2.5 s, then each DOWN for one frame and 1.5 s on,
each frame's own mask -- 149 to 155 blocks):

| step | lit | capture | masked score | control | matched |
|---|---|---|---|---|---|
| s01 | NEW GAME | `runs/menu_explore/s01_DOWN.png` | **90.0** | 41.4 | yes |
| s02 | ONLINE | `s02_DOWN.png` | 89.1 | 42.2 | no (under by 0.9) |
| s03 | LAN | `s03_DOWN.png` | **95.7** | 46.2 | yes |
| s04 | OPTIONS | `s04_DOWN.png` | **90.0** | 43.9 | yes |
| s05 | EXTRAS | `s05_DOWN.png` | 86.3 | 42.3 | no |
| s06 | LOAD GAME | `s06_DOWN.png` | 82.5 | 39.7 | no |
| s07 | NEW GAME | `s07_DOWN.png` | 82.8 | 39.3 | no |
| s08 | ONLINE | `s08_none.png` | 81.4 | 40.7 | no |

The lit word, its dim neighbours (LAN above and EXTRAS below OPTIONS; EXTRAS above and NEW GAME below LOAD GAME) and
their rows match the archive's frames; the cause of the four under the bar is the movie: the same NEW GAME face
scores 90.0 at s01 and 82.8 at s07, the same ONLINE face 89.1 at s02 and 81.4 at s08, and the run's later frames are
the MENULOOP's brighter moments (the rig and the sky through the dialog's own blocks, where the mask does not reach).
Not rounded, not met by another frame: the four stand until the movie draws. **The score does not tell the roller's
faces apart**: a frame stuck on NEW GAME (a first run where the session's `press` did not reach the buttons, §7)
still scored 92.1 masked against the LAN-lit `s03` -- the lit word is one 32 x 32 row of a mostly-masked frame. The
face is held by the test's `lit` assertion and the machine walk; a 91 is not proof of the face.

The browser (2026-10-03, the fix round: headless Chromium on the dev server at port 5311, seven `ArrowDown` keys 1.5 s
apart through PLAT-11's keys, the canvas read back at each step) lights the same eight faces (`MenuButtonChanged` 1,
6, 5, 4, 3, 2, 1, 6, nothing undrawn) and scores 90.0, 89.1, 95.7, 90.0, 86.3, 82.9, 83.2, 82.2 -- the last three 0.4
to 0.8 over Node's, the arrows' phase at the browser's moment; its first frame 91.2 / 81.9 against `A_04` and 86.9 /
83.9 against the reference, as before.

The reference's loss is the movie's too: its frame shows the rig and the sky bright at the left and through the logo's
and the items' blocks (the diff's failing blocks are those; the items' and the legalese's rows match), where `A_04`'s
movie moment is darker. Not rounded, not met by another frame: the 86.9 stands until the movie draws (PLAT-19c's source
in the page, a decoder in Node), when both numbers are to be taken again.
> Taken again 2026-10-03 (sprint 11's close review, finding 3) -- the paragraph above is the black run's record, kept.

**With MENULOOP drawn** (`tools/test/mainMenuMovie.test.ts`; the disc, the captures and the built `libmpeg2.wasm`,
`S2U_FMV_WASM`, skipping visibly without): the same session on `dlgMenu` handed `NodeMovieSource` over PLAT-19b's
decoder core, as `titleMenuDisc.test.ts` is, so MENULOOP plays from picture 0 at the build (picture = tick - 2). The
mask is the black run's rule applied to the same draw list with its movie item drawn black: the same 149 blocks.
Neither capture records which MENULOOP picture it shows (the PCSX2 runs kept no clock), so two frames are scored -- the
2.5-s frame (picture 73), the moment of the black run's pins, and the picture nearest `A_04` by a sweep:

| frame | capture | correction | masked (control) | whole (control) | matched |
|---|---|---|---|---|---|
| 2.5 s, picture 73 | `A_04.png` | the 640 x 480 picture whole | **96.0** (41.6) | 97.9 (58.7) | yes, both |
| the same | `ref_main_menu_ours.pcsx2.png` | ours in the 4:3 box | **95.7** (44.0) | 97.8 (63.8) | yes, both |
| picture 202 (tick 204), the sweep's nearest to `A_04` | `A_04.png` | the same | **96.1** (41.6) | 98.1 (58.7) | yes, both |
| the same | `ref_main_menu_ours.pcsx2.png` | the same | **95.6** (44.0) | 97.8 (63.8) | yes, both |

The sweep (every third tick from 60 to the switch to `dlgAttractCinematic` at tick 3,627; a probe in the implementer's
scratch, nothing of it in the tree) shows how weakly the score tells MENULOOP's moments apart: against `A_04` whole
every frame from 2 s to 100 s scores 91.1-98.1, the best 98.1 at picture 202; masked, 1,180 of 1,184 scored frames are
at or over 90 against `A_04` and 1,124 against the reference, the ones under it all in MENULOOP's own fade to black
(`A_04`'s four from picture 3,598 on, the reference's sixty from picture 3,427 on; 45.4 / 46.2 at picture 3,607). So "the picture the capture shows" is not identified by the score; the 2.5-s frame is
the record, the nearest picture beside it. Both references are met with the movie drawn: the 86.9 was the movie's,
as the paragraph above said. With the movie the masked score sits under the whole one (the masked blocks were the
movie's best-matched dark ones). The DOWN walk's eight steps (above) are still the black run's; re-scoring them with
the movie drawn is owed (the `menu_explore` run's movie moment per step, its 1.5-s cadence from the script's CROSS).

A finding on the way, not changed here: `titleMenuDisc.test.ts`'s mask (`dialogOnly`) clears `s.layer` and draws again,
but the frame's draw list already holds the movie picture, so that frame is the movie frame again and its mask covers
only the blocks the movie itself leaves dark (1-2 here where the movie run's probe used that method, against 149) --
which is why its masked pins equal its whole ones to within 0.3. Its owner's to fix (research 141 §4): mask with the
movie item drawn black, as `mainMenuMovie.test.ts` does. The browser run (2026-10-03, headless Chromium
on the dev server at port 5310 with a copy of the files the front end reads under `public/maps/`, git-ignored; the
canvas's own 640 x 448 pixels read back through `toDataURL`): `?devmode&menuflow=dlgMenu.rdr` builds `dlgMenu` on the
first frame, nothing undrawn, NEW GAME lit, the fader 0 at 2.6 s; the same scorer on that canvas gives 91.2 / 81.9
against `A_04` and 86.9 / 83.9 against the reference (the 0.1 the arrows' phase). PLAT-14's 97.1 (research 112 §7) was
the dialog as built with `popup_bg.tif` standing in for the movie and the items undrawn; this frame is the menu as the
original's scripts leave it, with that bitmap hidden.

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `UI_MODEL_FOCAL_READING` (`ui/src/compositor/models.ts`) | 455 px per unit at unit depth, square | §2: the record's half angles give 320 / 365, the captures 455 +- 5; `FUN_00294070`'s matrix not read to the number | the projection matrix's build read (+0x470 / +0x474, +0x290, +0x4b0, `FUN_001c0410`), or a burst of the original's roller at two depths |
| `UI_MODEL_TEXTURE_ROWS_READING` (`ui/src/compositor/models.ts`) | a model's texture addressed as stored, v 0 the first row | the roller's quads carry v 1 at their top and the `_on` bitmaps hold their letters bottom row first; the ARMORY draws the same way; the packets' `CLAMP_1` / row order not read | a model whose texture is not symmetric under the flip, against a capture |
| `UI_MODEL_ZWRITE_READING` (`ui/src/compositor/models.ts`; the viewer's rasteriser) | a texel of alpha 0 writes neither colour nor depth | the depth was written at every covered pixel before the texel's alpha was known, so a quad's clear texels occluded whatever stood behind (found in review; harmless for the roller's six non-overlapping faces, the pinned scores unchanged by the fix); the GS's z-write under the alpha test (TEST.ATE / ATST / AFAIL) is not read from the UI models' packets | the packets' TEST register read, or a dialog whose MODELS parts overlap in depth against a capture |
| `UI_MODEL_CAMERA` (`ui/src/compositor/models.ts`) | (320, 0, 320) | not a reading: D:L54812 and D:L262819-262821 | -- |
| `FRONT_END_TEXTURES_PLACEHOLDER` (`ui/src/screens/frontEndMachine.ts`, research 115 §15) | still declared | replaced for the main menu by the page's art (§4): a session given no art draws no bitmap, as before | its removal when every front-end dialog's art is read the same way -- retired 2026-10-03 at the merge: ONL-01's texture banks and captions (`frontEndAssets.ts`, research 144 §8) replaced it |
| `MOVIE_SOURCE_PLACEHOLDER` (`viewer/src/frontEnd.ts`, research 139 §8) | black | reused: the movie behind the menu is black in the page and in the scored frame (§5) | PLAT-19c's source handed to the session -- retired 2026-10-03 at the merge: MOVIE-WIRE's worker source (`frontEndMovies.ts`, research 120 §11) replaced it |

Reused, not added: research 112 §9's drawer readings (the triangle rasteriser shares them), 138 §5's, 139 §8's.

## 7. What is not done, where the sources disagree, what was found

- **The score against the reference is under the bar** (86.9 masked): the movie. Owed to the movie in the frame (§5).
  Settled 2026-10-03 (sprint 11's close): with MENULOOP drawn the frame scores 95.7 masked against it, 96.0 against
  `A_04` (§5, `tools/test/mainMenuMovie.test.ts`); the DOWN walk with the movie is still owed.
- **M3's reading "on a card with saves (PCSX2): LOAD GAME / NEW GAME (focused) / ONLINE"** describes `A_04`, which has
  NEW GAME lit -- the script lights LOAD GAME when `GotSaveGames > 0`, and a save counts only when its `zSaveHeader`
  text begins with `m` and is not the dummy (research 138 R138.4); the PCSX2 card of that run held none that counted,
  or none at all. The frame is the empty-card state; M3's label is the drift.
- **The focal length is by fit** (R140.5); the half angles the record holds and the engine keeps do not reproduce the
  capture as a pinhole over 640 x 448, so a scale the matrix build applies is unread.
- **On the page the card rows are the opener's stubs**: `FrontEndSession` connects MENU-01a's `MenuCommands` before it
  makes the `Opener`, whose `BootStubs.register` sets the same rows last (research 139 §8: the last `setHandler` wins).
  The browser run's log shows `stub: MC_Exists BASCUS-97275SOCOMII -> true` (the f0 card) where the virtual card would
  answer false. Not changed here (the hot file's budget; BOOT-05's and the controller's order to settle): the menu's
  own behaviour is the same on either, `GotSaveGames` 0.
- **MENUFADER under 0 for a second** (research 139 §9's two fades): seen again, held by the disc test as it is.
- **The music**: `MUS_MENU_THEME` is MENU-02's; nothing plays for it (OT.R8). The cues go through PLAT-23's host; on a
  page without `BNKSTORE.ZAR` served they are silent and the page says so.
- **`MissionShortcutSKB`** stays bound to nothing on the disc (research 138): the block's third unknown is answered by
  that -- no button opens it.
- **The DOWN walk's captures** exist and are scored (§3, §5; the first draft's "owed to OPT-19" withdrawn); the
  arrows' phase at a capture's moment is not known, so a frame's arrows are wherever the loop is at its time.
- **`FrontEndSession.press()` is not the menu's pad**: BOOT-04's tap hook feeds the opener's step-4 input only, so
  started at `dlgMenu` it leaves NEW GAME lit through seven DOWNs; a walk through the session drives
  `session.input.source` (PLAT-11's reader) as the ui tests do -- `tools/test/mainMenuDisc.test.ts` does. Not changed
  (`frontEnd.ts` is hot and over its budget); BOOT-04's owner to fold or rename it.
- **`USEMODELUIVAR`** (`FUN_00366730`'s branch, D:L262822-262841): `makeModelInstance` takes the variable's string as the
  model's name through `BuildOptions.uiVarString`; `dlgMenu` does not set the flag, the preview dialogs that do will
  find it made. Found in review; held by `models.test.ts`. The round-2 review's correction (2026-10-03): the null
  name is the found-but-not-a-string branch (D:L262835-262839); a variable `FUN_00385900` does not find leaves the
  default name, the empty string at 0x3f8c90, and `FUN_00317c20` is called with it -- the page makes no model there
  on the assumption an empty name loads nothing (the loader's answer to an empty name not read).
- **A clear texel's depth** (`UI_MODEL_ZWRITE_READING`, §6): fixed in the rasteriser, held by `uiCompositorView.test.ts`.
- **The remaining main-menu work** is MENU-02's: the streams (the movie in real time behind the menu, the music), and
  the proven level (PLAT-36's call trace, OPT-19's walks).
- `frontEnd.ts` changed by five lines, not two (§4); unchanged in the fix round.
