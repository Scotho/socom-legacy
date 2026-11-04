# 344 -- CONTROLLER PRESETS: the four pages, `SetControllerConfig` and the pad's map (OPT-14, issue #87)

- Date: 2026-10-18. OPT-14 (`docs/roadmap/04-options-memory-card.md`, O8-O11), issue #87; simulation track. Branch
  `agent/opt-14` from `origin/main` 79d6ecb95 with the seat's claim on `gamepad.ts`. The scope is the seat's proposal,
  approved by the merge controller; it settles research [270](270-open-issues-evidence-sweep.md)'s open question (which
  displayed page is which internal config).
- Status: **reading, pending review.** The game's code is read from the retail decompilation
  (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`; never pasted) and its strings file
  (`socom2_game.elf.strings.txt`, by address); the disc through the repository's readers: `tools/dump-dialogs.ts
  --dialog dlgControllerPresets.rdr` (`RUN/UI/READERC.ZAR`, `RUN/UIZANIM.ZAR`), `decodeUiProgram` (`@s2u/scene`) for
  the scripts' statements, `parseLocTable` for UIMnLOC's texts, `parseRdr` over `RUN/READERC.ZAR :: controller.rdr`,
  `readGlobalValves` for the valves' defaults. Names, ids and decoded values only (RS.R8). Nothing here is measured on
  the original running: the captures `runs/presets_explore/s09`, `s10` (pages 1-2) and the owed pages 3-4 (OPT-19), and
  a `PS2X_HOST_GAMEPAD` input trace per preset (PLAT-36), are the proven level, not claimed.
- Stands on research [302](302-original-options-and-communications.md) §4 (OPTIONS on main, the parked rows),
  [229](229-the-options-and-personas-json.md) §3 (`PressPreset<n>`'s valves), [197](197-w2-r-input-voice-integration.md)
  §2 (the 13 results, TeamCommand and SwapWeapon2 per preset), [85](85-grenades.md) §9 (the results' order),
  [230](230-gameplay-feel-parity-audit.md) (the pad's sampled states, `FUN_002d9ff0`) and does not restate them.
- Code: `packages/viewer/src/controllerConfigs.ts` (new: the four configs, the record, the console's controller-config
  state), `packages/viewer/src/gamepad.ts` (the pad's map off the active config), `packages/ui/src/screens/optionsCommands.ts`
  (the row unparked, `SetControllerConfig`), `packages/viewer/src/frontEnd.ts`, `matchOptions.ts`, `startMenu.ts`,
  `matchTaunts.ts`, `matchTouch.ts`, `touch.ts` (the wiring, §7). Tests: `packages/viewer/test/controllerConfigs.test.ts`,
  `packages/ui/test/screens/optionsScreen.test.ts` (the page over the machine), `tools/test/controllerPresetsDisc.test.ts`
  (dev-disc), `packages/viewer/e2e/controllerPresets.spec.ts` (the browser walk, owed its run).

## 0. The answers

| row | answer | where |
|---|---|---|
| R344.1 | **Why OPTIONS' CONTROLLER PRESETS opened nothing**: a gate of the port, not the runtime. `OPTIONS_PARKED_ROWS`' first row parks `dlgOptions_Menu.rdr`'s `GoToPresets` (`packages/ui/src/screens/optionsCommands.ts` :108, the 2026-10-07 settings' OT.R8 park), and `optionsRowGate` (:129-131, registered :179) refuses that binding's start, so `GoToPresets` (`.DINK`, `SWITCHMENU(dlgControllerPresets.rdr)`) never runs. Every command the screen's scripts run is the generic runtime's (`SuspendMenuInput`, `ActivateButton`, `SWITCHMENU`, the valves, the moves and opacities) but `SetControllerConfig`, which the table declared and nothing implemented (`uiCommands.ts` row 96). | §1 |
| R344.2 | **`SetControllerConfig`** (`FUN_0027fb40`, D:L127194-127206) takes the command's argument name (the record's +8, `FUN_0026ed60`; `INPUT_STRING` replaced by the context's input string, D:L127200-127202) and calls `FUN_002c5d60` with it (D:L127204); it answers 1. `FUN_002c5d60` (D:L166503-166537) walks the configs loaded from `controller.rdr` and, on the first whose name equals the argument (`FUN_00198b80`, case-blind), makes it the active config (`DAT_004415a8`, and the writable alias `DAT_004415b0`) and sets the stick flags of the controller object `DAT_0044f108` (+0x2a8/+0x2a9/+0x2d0/+0x2d1 from the config's rotate and pitch sticks); no match changes nothing. **No re-read of the disc**: the four configs are parsed once at the game's start (`FUN_002c5e70` D:L166542-166598, from D:L152666) and the command swaps the active pointer. `UIStoreOptions` (`FUN_0027b960`) reaches the same function (D:L125232-125247). | §3 |
| R344.3 | **The four `ControllerConfigs`** (`controller.rdr`, read with `parseRdr`): Default, Reverse, Goldeneye, Config4 in the file's order, 14/14/15/14 mappings -- each mapping's button or stick to its result in §4's table. `tools/test/controllerPresetsDisc.test.ts` holds the port's transcription (`CONTROLLER_CONFIGS_READING`) to the disc. | §4 |
| R344.4 | **Page -> config** (both sources agree): 1 PRECISION SHOOTER `Default`, 2 LEFTY `Reverse`, 3 SCOUT `Config4`, 4 SURE SHOT `Goldeneye` -- the dialog's `PressPreset<n>` (`SetControllerConfig(<name>)`, `SelectedControllerConfig = n`) and `UIStoreOptions`' table (`SelectedControllerConfig` 4 Goldeneye, 3 Config4, 2 Reverse, 1 and any other Default: D:L125232-125247, the strings 0x3ef0f8 "Default", 0x3ef100 "Reverse", 0x3ef108 "Config4", 0x3ef110 "Goldeneye"). | §2 |
| R344.5 | **`check_then_save_and_leave`'s popup** is the text 161 ("Controller preset selection is complete. ..."), shown only when `CameFromNewGameButton == 1` and `OptionsMenuChanged == 1`; then `save_and_leave`. **From OPTIONS the branch is never taken**: on the disc every script that writes `CameFromNewGameButton` writes 0 (`dlgControllerPresetsRG`/`CS`' presses, OPTIONS' own `check_then_save_and_leave`, ONLINE and LAN OPTIONS' `OnStartAct`, `UIMemCardAnim`'s `save_and_leave`), `global_valves.rdr` has no row for it and the ELF's strings do not name it. So TRIANGLE and CROSS both set `BeenPastOptions = 1`, wait 0.5 s and switch back to OPTIONS: **the page saves nothing itself**; the choice reaches the card at OPTIONS' RETURN (`save_and_leave`: `StoreOptions`, then the save question), as the other pages' do. | §2.3 |
| R344.6 | **`CPstart`'s texts** (ONSTART and LOADED_FROM_MEMCARD): `DescriptionText` 156 "¦ SELECT  ¬ BACK"; `DescriptionPulseText` the selected page's 157-160 ("N - ... preset is currently selected", by `SelectedControllerConfig` 1-4), then the page shown is the selected one (`OnPreset1`, `OnPreset1R`, `OnPreset2R`, `OnPreset3R`; any other value page 1 with no pulse text). The title bar starts at 154 "PRECISION SHOOTER PRESET" (`OnPreset1`), and each LEFT/RIGHT step writes a literal: "1 - PRECISION SHOOTER PRESET", "2 - LEFTY PRESET", "3 - SCOUT PRESET", "4 - SURE SHOT PRESET". A CROSS writes 162-165 ("N - ... preset has been selected") into `DescriptionTextWayLow`. The low hint is 155 "View Controller Presets with £¯". | §2.2 |
| R344.7 | **The pictures** `ContPic1`-`ContPic4` (`ContPic<n>.tif`, 580x290 at 25,115, `LIBRARIES ui/assetlib/uiop`) are in `RUN/UI/UIOP_TXR.ZED` / `UIOP_PAL.ZED` and decode through the front end's lazy bank (`frontEndAssets.ts` `FRONT_END_LAZY_TEXTURE_STEMS`, `pageUiTextures`); the dev-disc test decodes the four. | §5 |
| R344.8 | **A finding beyond the proposal: the fire-rate swap lives on a config.** `FUN_00592050` (D:L451458-451469) swaps the buttons of results 3 (FireMode) and 12 (TACMAP) in the active config's own table (`FUN_002c6430` / `FUN_002c6460` on `DAT_004415b0`); `DAT_0044d500` only records whether the option is on. `UIStoreOptions` runs that swap on the active config when FIRE RATE's valve differs from `DAT_0044d500` (D:L125173-125183) **before** it switches to `SelectedControllerConfig`'s config (D:L125232-125247), and the round's START menu row 9 flips `DAT_0044d500` and swaps the active config (`FUN_002041e0` D:L61823-61825). So a config other than the one active at the swap is not swapped: with FIRE RATE on SELECT, choosing LEFTY leaves LEFTY unswapped (L3 still FireMode's), and so does the next boot's store (Default swapped, then LEFTY made active). The port follows the code (§6). | §6 |

## 1. The way in

OPTIONS (`dlgOptions_Menu.rdr`) has two controller rows (research 302 §4; roadmap 04 O1, O2): CONTROLLER OPTIONS
(`ControlOpBtn`, `ToControlOpt`) and CONTROLLER PRESETS (`ControlPresetBtn`, `_704_ControllerPresets_MSG`), whose CROSS
runs `GoToPresets`: `.DINK` and `SWITCHMENU(dlgControllerPresets.rdr)` (the set's two statements, `decodeUiProgram`).
The port parked the row (R344.1). Unparked, the front end's own runtime builds the dialog: its layout, its `uiop` bank,
its three script sets.

## 2. The screen (`dlgControllerPresets.rdr`)

### 2.1 The layout

13 objects on `multplay_back.tif` (`tools/dump-dialogs.ts --dialog dlgControllerPresets.rdr`): the title back
`eq_title_back`, `eq_Lower_back`, `TabSmWindow`, `GreenBack` (610x296 at 16,100); the texts `bar_title` (30,65),
`DescriptionPulseText` and `DescriptionTextWayLow` (320,93), `DescriptionText` (535,432), `DescriptionTextLow` (25,430);
the pictures `ContPic1`-`4` (580x290 at 25,115); four full-panel buttons `Preset1Btn`-`Preset4Btn` (610x296 at 16,100).
Scripts: `dlgControllerPresets.rdr` (17 animations), `uianim.rdr`, `UIMemCardAnim.rdr`; font `font_text_01`.

### 2.2 The scripts

| binding | animation | what it does |
|---|---|---|
| SCREEN ONSTART, LOADED_FROM_MEMCARD | `CPstart` | `BeenPastOptions = 1`; the texts of R344.6; the selected page |
| SCREEN ONSTART | `PulseDescTextHigh` | the pulse text's opacity 0.2 -> 0.99 -> 0.2 over 0.6 s each way, looped |
| SCREEN ONSTART | `has_memcard_changed` | `UIMemCardAnim`'s card poll (the other pages' too) |
| `Preset<n>Btn` LEFT / RIGHT | `OnPreset<n>L` / `R` | `SuspendMenuInput(0.2)`, `.SLIDE`, the pictures slid 0.2 s, the title's literal, `ActivateButton` of the next page: RIGHT 1->2->3->4->1, LEFT 1->4->3->2->1 |
| `Preset<n>Btn` CROSS | `PressPreset<n>` | stop the pulse; `ChosePresetOnce = 1`, `OptionsMenuChanged = 1`; the pulse text off; 161+n into `DescriptionTextWayLow`; `SetControllerConfig(<name>)`; `SelectedControllerConfig = n`; `check_then_save_and_leave`, not blocking |
| SCREEN TRIANGLE | `check_then_save_and_leave` | R344.5 |
| SCREEN UP, DOWN | NULL | no set defines them |

### 2.3 `check_then_save_and_leave`

`.DINK`; `IF CameFromNewGameButton == 1`: `IF OptionsMenuChanged == 1` the fader up, `POPUPDIALOG`, the popup record
(text 161), `WHILE SitHere == 0`, the fader down, `OptionsMenuChanged = 0`, `save_and_leave`; else
`SWITCHMENU(dlgOptions_Menu.rdr)`. `ELSE`: `BeenPastOptions = 1`, `WAIT 0.5`, `SWITCHMENU(dlgOptions_Menu.rdr)`.
R344.5 reads the first branch as unreachable from the disc's scripts.

## 3. `SetControllerConfig` and the config record

`FUN_002c5e70` (D:L166542-166598) opens `controller.rdr` in `data/common` (0x3f2c18, 0x3f2c28), walks its
`ControllerConfigs` list (0x3f2c40) and parses each entry with `FUN_002c67f0` (D:L167088-167237), appending a 0x20-byte
record to the list `DAT_004415d0` (count `DAT_004415cc`); then `FUN_002c5d60("Default")` (D:L166581). With no Default
it makes an empty `NoDefaultDummy` (D:L166582-166596). The record (`FUN_002c67f0`):

| field | what | from |
|---|---|---|
| +0x00 | the `Name` | `FUN_002c6060` |
| +0x0c | the MoveLong stick: 1 `LeftStickVert`, 2 `RightStickVert` | D:L167156-167166 |
| +0x0d | the Strafe stick: 1 `LeftStickHoriz`, 2 `RightStickHoriz`; 0 none | D:L167215-167225 |
| +0x0e | the Rotate stick: 1 `LeftStickHoriz`, 2 `RightStickHoriz` | D:L167201-167211 |
| +0x0f | the Pitch sticks while AimMode is held (bits: 1 left, 2 right): a Pitch mapping whose `AimMode` is absent or not `Off` | D:L167174-167198 |
| +0x10 | the Pitch sticks otherwise: a Pitch mapping whose `AimMode` is absent or `Off` | the same |
| +0x11 | MoveLong is cut while AimMode is held: a MoveLong mapping with `AimMode Off` | D:L167168-167171 |
| +0x12..+0x1e | each of the 13 results' button slot (`FUN_002c6670`, D:L167011-167083: the control's name to its slot; 0x10 unmapped) | D:L167143-167152 |

The results, in the table's order at 0x3f2be0 (research 85 §9): 0 Action, 1 AimMode, 2 Fire, 3 FireMode, 4 Inventory,
5 Jump, 6 Reload, 7 StrafeLeft, 8 StrafeRight, 9 SwapWeapon1, 10 SwapWeapon2, 11 TeamCommand, 12 TACMAP. A result
read is `FUN_002c64e0` (D:L166917-166931): the configured button's sampled state (0 rest, 1 first down, 2 held, 3
first up: `FUN_002d9ff0`, research 230). `Triangle` and the d-pad are not among `FUN_002c6670`'s names: the stance and
the d-pad are read off the pad directly by the player update (`FUN_00594cf0`), the same in every config.

The axes, each off the active record:

| axis | function | rule |
|---|---|---|
| MoveLong | `FUN_002c6290` D:L166782-166814 | 0 when +0x11 and AimMode's state is 2; else +0x0c's stick's vertical |
| Strafe | `FUN_002c6110` D:L166690-166721 | +0x0d's stick's horizontal; with +0x0d 0, StrafeLeft held -1.0, else StrafeRight held +1.0, else 0 |
| Rotate | `FUN_002c6230` D:L166754-166767 | +0x0e's stick's horizontal |
| Pitch | `FUN_002c65b0` D:L166969-167006 | AimMode's state 2: +0x0f's sticks, else +0x10's; the verticals summed and clamped to [-1, 1] |

`FUN_002c5c90` (D:L166460-166484) sets the controller object's per-stick flags from +0x0f on AimMode's first down and
from +0x10 on its first up, as `FUN_002c5d60` does from +0x0e and +0x10 at a switch: which stick the look's tuners take
(OPT-13's two tuner sets, O4, O9; not built, §7).

## 4. The four configs (`controller.rdr`)

| control | Default (1) | Reverse (2) | Config4 (3) | Goldeneye (4) |
|---|---|---|---|---|
| LeftStickVert | MoveLong | Pitch | MoveLong | MoveLong (AimMode Off); Pitch (AimMode) |
| LeftStickHoriz | Strafe | Rotate | Rotate | Rotate |
| LeftStickTap (L3) | FireMode | Reload | FireMode | FireMode |
| RightStickVert | Pitch | MoveLong | Pitch | Pitch |
| RightStickHoriz | Rotate | Strafe | Strafe | -- |
| RightStickTap (R3) | Reload | FireMode | Reload | Reload |
| L1 | SwapWeapon1 | SwapWeapon1 | SwapWeapon1 | AimMode |
| L2 | SwapWeapon2 | SwapWeapon2 | SwapWeapon2 | StrafeLeft |
| R1 | Fire | Fire | Fire | Inventory |
| R2 | Inventory | Inventory | Inventory | StrafeRight |
| X | Action | Action | Action | Fire |
| Square | Jump | Jump | Jump | TeamCommand |
| Circle | TeamCommand | TeamCommand | TeamCommand | Action; Jump |
| Select | TACMAP | TACMAP | TACMAP | TACMAP |

Goldeneye has no SwapWeapon1/2 and no analogue strafe; with L1 held its left stick pitches and no longer moves. Research
197 §2's TeamCommand and SwapWeapon2 per preset (`talkInput.ts` `VOICE_ROUND_TALK_BUTTON_READING`) agree, and the
dev-disc test holds the two together.

## 5. The pictures

`ContPic1.tif`-`ContPic4.tif` are in `RUN/UI/UIOP_TXR.ZED` (palettes `UIOP_PAL.ZED`), the bank the dialog's
`LIBRARIES ui/assetlib/uiop` names; the front end reads it when a dialog naming it is built (`PageUiTextures.need`). The
dev-disc test decodes all four through `pageUiTextures` (a decoded image of each; the sizes are the test's output, not
restated here). Their placement and slides are the scripts' (`OnPreset<n>`, `OnPreset<n>L/R`: x 25 shown, 650 / -655 /
1300 off-screen, y 103).

## 6. The fire-rate swap and the config (R344.8)

The game's state is three things: the loaded configs, each with its own result table; the active one; and
`DAT_0044d500`. The port keeps the same three (`controllerConfigs.ts` `ControllerConfigs`): `select` is `FUN_002c5d60`,
`store` is `FUN_0027b960`'s two steps in their order (the swap on the active config when FIRE RATE differs from the
flag, D:L125173-125183; then the config of `SelectedControllerConfig`, D:L125232-125247), `toggleFireModeSwap` the START
menu's row 9 (D:L61823-61825). The pad's map is the active config's table as it stands, so FIRE RATE's swap is the map's
(the lane swap `matchOptions.ts` applied before is gone), and the firearm's setting stays `DAT_0044d500`'s
(`fireModeSetting`). The quirk is the original's by this reading and is kept: with FIRE RATE on SELECT, a preset chosen
afterwards keeps L3 as FireMode until FIRE RATE is changed again, and changing it then swaps the new config.

## 7. What the port takes, and what it leaves

- **The pad's map** (`gamepad.ts` `padInput`, when no layout is passed): the active config's results onto the port's
  lanes -- Action `action`, Jump `jump`, Fire `fire`, FireMode `fireMode`, Inventory `inventory`, Reload `reload`,
  SwapWeapon1 `swap1`, SwapWeapon2 `swap2`, TACMAP `scoreboard` (research 87 §12); MoveLong / Strafe the move pair,
  Rotate / Pitch the look pair, each pair through the existing dead zone and rescale (`padStick`), so the walk's
  `padRaw` still recovers each axis; AimMode as §3's table; StrafeLeft / StrafeRight a full push on the move pair's x.
  The rows no config holds stay as `PAD_LAYOUT` has them in every config: Triangle the stance, d-pad Up / Down the zoom,
  Left / Right the peek, Start the walk/fly switch, Circle the fly camera's boost (the viewer's, `assumed`). Default's
  map equals `PAD_LAYOUT` (a unit test).
- **TeamCommand** stays the voice's (`talkInput.ts`), now fed the active config's name (`matchTaunts.ts`) instead of
  Default.
- **The keyboard** (a development build's only, OT.R29) keeps its keys: a preset changes the pad's map only.
- **The touch layer** (a browser adaptation, MP-1 FI.R3: a touch button means what the controller's button means): its
  buttons follow the active map; its two floating sticks stay move and look, as placed under the thumbs (no original;
  Goldeneye's L2 / R2 strafe on touch moves nothing, and neither does its L1 (AimMode: held on touch it neither stops
  the move nor makes the left stick pitch), since the floating sticks read through `PAD_LAYOUT` (`touch.ts`) and the
  layer copies the lanes' button flags only (`matchTouch.ts`); the review's F2).
- **Persistence**: `SelectedControllerConfig` and `ChosePresetOnce` are PERSIST valves already (`global_valves.rdr`: 1
  and 0, PERSIST), saved in the card's `CValveSaveManager` module and read back at the boot; the boot's store applies
  the saved config (the front end's `StoreOptions`; `/testroom`'s card read, `pageCardPlayOptions`). No browser key.
- **Left out, named**: the campaign's `dlgControllerPresetsRG` / `CS` / `NewGame` variants (the new game's and the
  rank's flow: LATER); CONTROLLER OPTIONS' inert rows (OPT-13's); the stick flags of `FUN_002c5d60` / `FUN_002c5c90`
  (OPT-13's tuner sets); the screens that read pad buttons directly rather than the lanes (WEAPON EXCHANGE's R2, the
  Chat menu's d-pad, the menus' own CROSS / TRIANGLE), which no config remaps in the original either for the menus;
  the in-round START menu has no layout row (`07-match.md` T1/T2: H241, the owner's).

## 8. Readings and placeholders

| Name | What it stands for | Status |
|---|---|---|
| CONTROLLER_CONFIGS_READING | The four `ControllerConfigs` of `controller.rdr`, transcribed (§4) | in code (`packages/viewer/src/controllerConfigs.ts`); held to the disc by `tools/test/controllerPresetsDisc.test.ts`; reading, pending review |
| STRAFE_DIGITAL_SIGN_READING | Goldeneye's StrafeLeft as a push left (-1 on the move pair's x, the port's right-positive frame) and StrafeRight right, by the results' names. `FUN_002c6110` gives StrafeLeft -1.0 (D:L166702-166713) while the analogue strafe is the stick's x negated (`FUN_002c6520` D:L166959-166961); the pad block's x sign (`FUN_002da930`'s write) was not read | in code (`packages/viewer/src/controllerConfigs.ts`); settled by the pad block's write or a capture of Goldeneye's L2 |
| AIM_MODE_HELD_READING | AimMode, and the digital strafes StrafeLeft / StrafeRight (`FUN_002c61e0` D:L166724 tests state 2), counted while the port's held boolean is true; the original's reads take its state 2 (held after the first sample), one sample later (research 230's general note on held lanes; the review's F3) | note only |
| CAME_FROM_NEW_GAME_READING | R344.5: `CameFromNewGameButton` is never 1 on the disc, so the popup branch is not taken from OPTIONS | note only; the port runs the script as it stands (nothing forced) |
