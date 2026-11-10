# 164 -- The PLAY LIST: CREATE GAME's map popup, its 24 rows, and three maps for the first release (ONL-14)

Written 2026-10-05 for ONL-14 (`../roadmap/05-online-front-end.md` "ONL-14"), wave 4 of sprints 16 and 17 on the online
path's plan (`../plans/2026-10-02-online-path-target.md`, OT.R16, OT.R32 H90; the waves table's `maps` row). The PLAY LIST
is not a dialog of its own: it is `dlgCreateGame.rdr`'s popup (`pop_missionBack`, the LISTBOXes `AVAILABLE_MISSIONS` and
`SELECTED_MISSIONS`, the main screen's `PLAYLIST_MAIN`), so this note is the second half of
[163](163-create-game.md), which holds the screen, the create and the sources; the waves table gives the popup its own
number. Sources as 163's, and the retail ELF's instructions where the decompilation folds a routine away (0x37bd60,
0x36b1d0, 0x37cd30, 0x37bf40). It stands on research 185 (C6: the three LISTBOX reads it calls PROVEN; reading, pending
review there, re-read here at the source), 192 §1 and 203 §14 (the mission table, Medley and Random), 117 §6 (the LISTBOX
and its argument rule) and 147 §2 (the list's UIVAR), and does not restate them.

The code: `packages/ui/src/screens/createGameCommands.ts` (`missionRecords`, `availableMissionRows`, `GetAvailableMPMissions`,
`playListNumbers`, `FIRST_RELEASE_MAPS`, `playListSets`), `packages/ui/src/widgets/listbox.ts` (the keyed cell's
`COLOR` and `DISABLED`, `AddItem` through `itemOf`, `GetContents`), `packages/viewer/src/createGameHost.ts`
(`missionsFromReaderc`). The tests: `packages/ui/test/screens/createGameScreen.test.ts` (the popup's rows on the disc's
record, the three rows, every list binding on every row, CROSS in any order and SQUARE into PLAYLISTVAR),
`createGameCommands.test.ts` (the mission list, the rows and `playListSets`), `packages/ui/test/widgets/listboxUiVar.test.ts`
(the three LISTBOX reads), `packages/viewer/test/createGameHost.test.ts` (`missionsFromReaderc` on the fixture).
Confidence: **reading, pending review**; nothing is measured against the original
running (§5).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R164.1 | **The rows**: `GetAvailableMPMissions(AVAILABLE_MP_MISSIONS_VAR)` (`FUN_00274940` D:L121473-121555) builds [0xfe, "Medley"] and [0xff, "Random"] first when respawn is off (S:0x3ee8c8, S:0x3ee8d0), then [number, name] for each mission of the game's table flagged multiplayer whose archive is present (`FUN_002c94f0`) -- SUPPRESSION only with respawn on -- in `missionlist.rdr`'s order: 24 rows on the retail disc, VIGILANCE (51) to THE RUINS (12) | D:L121503-121547; `missionlist.rdr` | §1 |
| R164.2 | **The LISTBOX can draw a row that cannot be taken**: a cell that is itself an array is read by key (`FUN_0037ae10` D:L274032-274056) -- `DISABLED` clears the item's +0x24 (not selectable: its CROSS starts nothing), `COLOR` goes to the text content's +0x2c, 0x37bd60, which sets its +0xc8 and its colour, so the row's draw (`FUN_0037ab90` D:L273836-273845) no longer paints the row's colour over it. Research 185 had read both; now applied | `LISTBOX_ARRAY_CELL_KEYS_READING` | §2 |
| R164.3 | **OT.R16's three maps, the owner's three-map list (2026-10-07); four since OT.R45 (2026-10-12)**: the list holds only Vigilance (51), Crossroads (72), Frostfire (2) and Night Stalker (7), in `missionlist.rdr`'s order (of its 22 multiplayer records the 1st, 8th, 14th and 17th), as plain rows; every other row, Medley and Random included, is left out at the source, as the original's `GetAvailableMPMissions` leaves out the maps a game cannot play (D:L121528-121530) rather than disabling them. The owner chose it over keeping the 21 not offered as grey `DISABLED` rows (applied 2026-10-05 to 2026-10-07, §3) | `PLAY_LIST_FIRST_RELEASE_READING` | §3 |
| R164.7 | **Every row answers every binding; row 0 is not Medley**: the owner chose the three-map list, 2026-10-07, so no row swallows a press -- CROSS (`add_a_mission`), SQUARE (`accept_play_list`), TRIANGLE (`Back_out_from_play_list`) and RIGHT (`missiondel_activate`) act on every row, ONFOCUS's `DisplayGamePic` shows each row's picture, and the popup opens with its title and help (#814, #812, #815). (Until then the grey rows took those presses and started nothing, the LISTBOX's argument rule, research 117 §6.2 step 2: the owner's "had to mash square".) The set's `add_a_mission` reads row 0 as Medley whenever respawn is off; with no Medley row that test is retired, one byte (`PLAY_LIST_NO_MEDLEY_ROW_READING`), so the maps (three, four since OT.R45) can be added in any order | `PLAY_LIST_FIRST_RELEASE_READING`, `PLAY_LIST_NO_MEDLEY_ROW_READING` | §3 |
| R164.4 | **The popup's flow is its set's**: CHOOSE GAMES opens it on row 0; CROSS adds the focus row to SELECTED MAPS LIST (`AddItem`, at most 12: `num_missions < 12`), RIGHT / LEFT move between the lists, CROSS on a selected row removes it, SQUARE (`accept_play_list`) writes the selected list into PLAYLISTVAR (`GetContents`) and closes, TRIANGLE asks #811 and on YES clears PLAYLISTVAR | the set | §4 |
| R164.5 | **`AddItem` and `GetContents` were not the original's in the widget**: `AddItem` (op 8, D:L269545-269574) builds with `FUN_0036bbc0`, the var rebuild's builder (an array element a column item, not one string); `GetContents` (op 10, D:L269629-269643) has each item serialise itself (0x36b1d0 -> its content's +0x40: a column item a sub-list, 0x37cd30; a text cell an int, a real or its string, 0x37bf40). PLAYLISTVAR so holds [[51, "VIGILANCE"], ...] | `LISTBOX_ADDED_ITEM_READING`, `LISTBOX_GET_CONTENTS_READING` | §2 |
| R164.6 | **The picture follows the id cell**: `DisplayGamePic` (ONFOCUS / ONACTIVATE) compares INPUT_STRING -- the focus row's first caption, its number -- with "51", "1", ... "255" (`CompareValues`) and shows `CGBack` and `CGPic<n>` (258 x 130 at 25, 245); Medley cycles the four suppression shots and #818, Random #819 (neither listed in the first release, R164.3). **The bitmap** `mp<n>MissPic.tif` is held by `RUN/UI/UICG_TXR.ZED` alone -- `ui/assetlib/uicg`, the bank the dialog's `LIBRARIES` name beside `uimp` -- and the page loads it with its banks (`FRONT_END_TEXTURE_STEMS`); until 2026-10-06 it did not, and the box was drawn empty (the owner's report). `A_51_choosegames.png` shows the Medley cycle's `CGSS71` (mp71MissPic) at about half opacity in that box | the set; `frontEndAssets.ts` | §4 |

## 1. The rows (R164.1)

`FUN_00274940` (D:L121473-121555): the argument named by the command (`FUN_0026ed60`; INPUT_STRING replaced by the input
string) is added TEMPORARY (`FUN_003857c0(.., 0, 1)`); `bVar2` is the valve `mp_allow_respawn` (S:0x3ee8b0) == 1. A builder
opens; with respawn off two rows are written (D:L121503-121512): [0xfe, "Medley"] and [0xff, "Random"]. Then for each
record of the mission table (`DAT_00441658`, count `DAT_00441654`) -- kept: the byte at +0xc (multiplayer) set and, with
respawn on, the byte at +0x14 equal to 5 (SUPPRESSION, D:L121528-121530), and `FUN_002c94f0(record)` not 0 (the archive
present, D:L121535) -- a row [the record's +0x10 number, its name (inline at +1, or the pointer at +8)] (D:L121538-121547).
The whole is set into the variable (`FUN_00386460`) and the row answers 1.

The table is `missionlist.rdr` (`RUN/READERC.ZAR`) as `FUN_002c9540` parses it (research 192 §1: NUMBER, NAME, TYPE,
MULTIPLAYER; TYPE's five words, anything else 0). On the retail disc it holds the 22 multiplayer maps, in this order: 51
VIGILANCE, 52 THE MIXER, 53 FOXHUNT, 61 SUJO, 62 ENOWAPI, 64 SHADOW FALLS, 71 FISH HOOK, 72 CROSSROADS, 73 SANDSTORM, 81
CHAIN REACTION, 82 GUIDANCE, 83 REQUIEM, 1 BLIZZARD, 2 FROSTFIRE, 5 ABANDONED, 6 DESERT GLORY, 7 NIGHT STALKER, 8 RAT'S
NEST, 9 BITTER JUNGLE, 10 BLOOD LAKE, 11 DEATH TRAP, 12 THE RUINS -- research 203 §14's RAM list. With Medley and Random,
24 rows: the roadmap's "24-entry list". `missionRecords` reads the file; `missionsFromReaderc` reads it off the disc's
`RUN/READERC.ZAR` for the page (`MISSION_ARCHIVE_PRESENT_READING`: every map present, as on the player's own disc).

The two LISTBOXes have two columns: the number at POSITION -400 (off the list) and the name at 60 (`AVAILABLE_MISSIONS`,
277 x 120, SPACING 20) or 50 (`SELECTED_MISSIONS`, 285 x 260); `PLAYLIST_MAIN` (NOSELECT, at 92) shows PLAYLISTVAR on the
main screen.

## 2. The LISTBOX reads (R164.2, R164.5)

Three readings of the widget (PLAT-08, research 117) were short of the original, and the PLAY LIST needs each.

**The keyed cell.** `FUN_0037ae10` (D:L273903-274067) builds a column item from an array element, one cell per column.
A cell whose element is an array (type 4) is read by key (D:L274032-274056): `VALUE` (0x3f9410) through `FUN_0032ee10`
its text; `COLOR` (0x3f9188) through `FUN_0032de80` three numbers, handed as ints to the content's vtable +0x2c; `DISABLED`
(0x3f9418), whatever its value, clears the item's +0x24 and the container's row flag (D:L274051-274054). The content's
+0x2c is 0x37bd60 (the text content's vtable 0x407b40 +0x2c), a routine the decompilation does not give; its words:
`addiu v1, zero, 1`; `sb v1, 0xc8(a0)`; then a1, a2, a3 converted to floats into the text's +0x48, +0x4c, +0x50 --
the colour, and the flag +0xc8 set. The row's draw writes the row's colour into a content only while that flag is 0
(`FUN_0037ab90` D:L273836-273845, `piVar7[0x32]`), so a coloured cell keeps its colour at every draw. A non-selectable
item's CROSS starts nothing: the list's binding takes the argument rule, and a non-selectable item without ARGUMENT gives
none (research 117 §6.1). `LISTBOX_ARRAY_CELL_KEYS_READING` now applies both (it was "VALUE as the text; COLOR and DISABLED
not applied").

**`AddItem`** (op 8, D:L269545-269574): the valve's index into the named var (the command's +0x10), the element handed to
`FUN_0036bbc0` (D:L265829-265908) -- the var rebuild's builder -- then, for a string element, its text set again, and the
item appended (`FUN_00373f20`), the focus to the last with AUTOSCROLL. `LISTBOX_ADDED_ITEM_READING` now builds through
`itemOf` (it took the element's string only, so a [number, name] row came in empty).

**`GetContents`** (op 10, D:L269629-269643): an existing var only (`FUN_00385900`); a builder opened; each item's vtable
(0x407240) +8 -- 0x36b1d0: `lw a0, 0x28(a0); lw t9, 0(a0); lw t9, 0x40(t9); jr t9`, its content's +0x40 -- with the
builder; closed and set into the var. A column container's +0x40 (vtable 0x407b90: 0x37cd30) opens a sub-list
(`FUN_003339b0`) and calls each cell's +8; a text content's +0x40 (0x37bf40) takes its text by `strtol` (base 10) when
that consumes it whole, else `strtod`, else the string (research 185's read; the routine's head re-read here). An IMAGE
cell's content (vtable 0x407050) was not followed: the port writes nothing for it, and no list here has one.
`LISTBOX_GET_CONTENTS_READING` replaces `LISTBOX_GET_CONTENTS_PLACEHOLDER` ("the var left as it was").

## 3. Three maps (R164.3, R164.7, OT.R16)

The owner's words: "can select maps (FF/VIG/CROSSROADS) (the rest are disabled for the first release)"; and on
2026-10-07, asked whether to keep the 21 maps not offered as grey rows or list only the three: "Only the 3 maps". The
original lists 24 rows, every one selectable. `PLAY_LIST_FIRST_RELEASE_READING`: `GetAvailableMPMissions` lists the
three maps of `FIRST_RELEASE_MAPS` (the server's own set, `lobby.ts`) as plain [number, name] rows in
`missionlist.rdr`'s order -- 51 VIGILANCE, 72 CROSSROADS, 2 FROSTFIRE -- and writes no other row. That is the original's
own way with a row a game cannot take: `FUN_00274940` leaves it out of the list, never disables it -- with respawn on,
every mission not SUPPRESSION (D:L121528-121530); any mission whose archive is absent (D:L121535). The server refuses
any other map at the report regardless (`MAP_NOT_OFFERED_STATUS_PLACEHOLDER`, research 159 §3.4), so a modified page
gains nothing. Four since 2026-10-12 (OT.R45): §7.

**Medley and Random are left out.** `FUN_00274940` writes them whenever respawn is off (D:L121503-121512), before its
mission filter and outside it, so the original's filter never drops them on the path (respawn stays off, OT.R21). They
are not maps, and they would play maps the release does not offer: `SetMPMissionSeq` expands Medley over every present
multiplayer mission in `missionlist.rdr`'s order, 51, 52, 53, 61 ... -- 29 entries, all 22 maps (`FUN_002c8db0`) -- and
Random writes one map drawn by `FUN_002c8840` (M1's bag) at creation, research 203 §14. The page answers no
`SetMPMissionSeq` either (`CREATE_GAME_ENTRY_COMMANDS`: parked), so a Medley would reach the report as 254 and be
refused. `availableMissionRows` lists them only when the offered set holds them (`offered`).

**Row 0 is not Medley (`PLAY_LIST_NO_MEDLEY_ROW_READING`).** The set's `add_a_mission` (CROSS on AVAILABLE MAPS) tests
`IF tmp_idx == 0 AND mp_allow_respawn == 0` -- row 0 with respawn off -- and takes it for Medley: `IsMedleyGame` 1, the
selection cleared, the row added alone, the focus moved to SELECTED MAPS LIST and held there (`missionadd_activate`
sends it back while `IsMedleyGame` is 1). The original never meets a map there: its list holds Medley first exactly
when respawn is off. With the three-row list row 0 is VIGILANCE: run as the disc has it, adding CROSSROADS then
VIGILANCE left [VIGILANCE] alone and FROSTFIRE could not be added (seen in the rig, 2026-10-07). `playListSets` retires
the test while no Medley row is listed: the IF's first token's op byte (+12) `==` (2) becomes `<` (4), so `tmp_idx < 0`
never holds; one byte of `dlgCreateGame.rdr`'s set, every other command the disc's (`createGameCommands.test.ts` counts
the bytes). The menu's sets go through it where `FrontEndMachine` takes them, so the page and every rig run the same
script.

What the player sees: three rows in the list's normal colour; the popup opens on VIGILANCE with its picture, the title
CREATE GAME PLAY LIST (#814) and the help lines (#812, #815); the picture follows the focus; CROSS adds the focus row
beside the others in any order, repeats included; SQUARE accepts from any row on one press; RIGHT moves to the selected
list; TRIANGLE asks #811.

**History: the grey rows (2026-10-05 to 2026-10-07).** Until the owner's call the 24 rows were listed and the 21 not
offered keyed `DISABLED` with a `COLOR` (the LISTBOX's own keyed cell, §2): on such a row CROSS, SQUARE, TRIANGLE and
RIGHT were swallowed and ONFOCUS showed no picture (the LISTBOX's argument rule, research 117 §6.2 step 2,
`FUN_003745e0` D:L270384-270395), and the popup, opening on Medley, waited for an offered row before its title and help
changed -- the owner's "had to mash square to get it to finish. It looked stuck." Kept as research, not applied: the
colour. The cell's `COLOR` was first `AVAILABLE_MISSIONS`' own `DISABLED_COLOR` 128 128 128, which no LISTBOX reader
takes (research 105; `dialogLoaderDisc.test.ts`); a text colour is the GS's vertex colour, 128 = 1.0, so over the font's
full-white texels 128 and the list's `NORMAL_COLOR` 255 (2.0, clamped) draw the same white (`GS_MODULATE_BLEND_READING`,
`packages/viewer/src/uiCompositorView.ts`; the screens' own normal text is `TEXT_COLOR` 128). Drawn with the page's banks
and the disc's faces, VIGILANCE and THE MIXER peaked at the same brightness, 167.7 / 255, and the owner read the list as
stuck on the map he had added ("I could add more crossroads but no others"). It was then the dialog's disabled text,
50 50 50 -- the `DISABLED` `TEXT_COLOR` of all thirteen BUTTONs of `dlgCreateGame.rdr` (RESPAWN's among them, OT.R21)
and of a disabled button in 55 of the 61 dialogs of `RUN/UI/READERC.ZAR` that give one (one gives 128 128 128, six the
gold 91 72 36) -- for a grey row should one ever be wanted again.

## 4. The popup's flow (R164.4, R164.6)

From the set (`tools/dump-online-dialogs.ts --dialog dlgCreateGame.rdr`):

- **CHOOSE GAMES** (`open_missionsel_popup`): `missionadd_activate` (the selected list's highlight off, AVAILABLE enabled
  and activated), the focus to row 0 (`valve_zero`), `GetAvailableMPMissions`, the popup and its pulsing arrows shown.
  AVAILABLE's ONACTIVATE: #812 in DescriptionText, CREATE GAME PLAY LIST (#814) in the title, #815 at the foot.
- **CROSS on AVAILABLE** (`add_a_mission`): with fewer than 12 selected, the focus row added to SELECTED by index (`AddItem`);
  row 0 (Medley) with respawn off clears the selection, adds Medley alone and moves to the selected list (`IsMedleyGame` 1)
  -- retired in the first release, whose row 0 is VIGILANCE (`PLAY_LIST_NO_MEDLEY_ROW_READING`, §3).
- **RIGHT / LEFT** (`missiondel_activate`, `missionadd_activate`): to the selected list when it has rows, back to the
  available list. **CROSS on SELECTED** (`remove_a_mission`): the row removed; an emptied list hands back to AVAILABLE.
- **SQUARE** (`accept_play_list`): `SELECTED_MISSIONS.op10` -- GetContents into PLAYLISTVAR -- then PLAYLISTVAR_SAVE
  cleared and the popup closed (`close_missionsel_popup`: the pictures hidden, the lists disabled, the focus on CHOOSE
  GAMES, the title #242).
- **TRIANGLE** (`Back_out_from_play_list`): #811 "Pressing ¬ from this list will clear out your selected games. Are you
  sure you want to do this?" NO / YES; YES clears PLAYLISTVAR and the selection and closes.
- **The picture** (`DisplayGamePic`): the `CompareValues` chain against "51", "1", "2", ... "83", "254", "255" (the set's
  names), `CGBack` and `CGPic<n>` (`mp<n>MissPic.tif`) shown; 254 runs `DisplayGameCycle` with #818, 255 with #819. The
  22 bitmaps are in `RUN/UI/UICG_TXR.ZED` and no other bank (the disc's `UI*_TXR.ZED` read name by name), the library
  `dlgCreateGame.rdr` names as `ui/assetlib/uicg`; the page's banks (`packages/viewer/src/frontEndAssets.ts`
  `FRONT_END_TEXTURE_STEMS`) lacked UICG until 2026-10-06, so the script showed `CGPic<n>` and the drawer had no bitmap
  for it ("CGPic51: no bitmap mp51MissPic.tif"): the owner's "missing the map images". Pinned by
  `createGameScreen.test.ts` (the node per map), `frontEndAssets.test.ts` (the bank), `tools/test/createGamePictureDisc.test.ts`
  (the frame drawn with the page's banks) and `e2e/createGamePicture.spec.ts` (the page). Against `A_51_choosegames.png`
  (Medley focused, its cycle running): the box's pixels fit `mp71MissPic.tif` at 0.49 and `mp52MissPic.tif` at 0.17 over
  the dark back with a mean residual of 11.8 / 255 -- the same bitmaps, in the same box, mid-fade.

PLAYLISTVAR holds the selected rows as GetContents writes them; `playListNumbers` takes their numbers for the hand-off
(163 §5). Its expansion (`SetMPMissionSeq`) and the rotation after each game (ONL-14's unknown) are the game lobby's and
the match's, after state 17.

## 5. Unknowns, contradictions, what is not done

- **No capture scored.** `title_play_list.png` and the 24 `map_<slug>.png` rows (the acceptance) were not scored; the
  picture's box alone was compared with `A_51_choosegames.png` (§4, 2026-10-06). The three-row list has no capture of
  its own in the original (OT.R16's deviation); the original's own short list is the respawn one (SUPPRESSION only).
- **The order of the rows on the page's disc**: the archive check (`FUN_002c94f0`) is taken true for every map; a disc
  image missing a map's `.ZDB` would list it on the page where the console would not.
- **An IMAGE cell's serialisation** (`GetContents`) is not read; no list on the path serialises one.
- **The rotation** of a multi-map play list after each match stays ONL-14's unknown (a two-match capture), not touched.
- **The rows not offered: the owner chose the three-map list, 2026-10-07** (R164.3, R164.7). Asked whether to keep the
  21 not offered as grey rows or list only the three, the owner chose "Only the 3 maps". The grey rows (2026-10-05 to
  2026-10-07) had swallowed SQUARE, TRIANGLE and RIGHT by the LISTBOX's own argument rule, an explained behaviour the
  fresh review recorded here pending that call; they are gone, with the tests that pinned them.
- **The Medley test retired** (`PLAY_LIST_NO_MEDLEY_ROW_READING`): a one-byte change to the disc's set, made where the
  menu's sets are taken (`FrontEndMachine`), while no Medley row is listed. If the owner opens Medley (the server's
  `FIRST_RELEASE_MAPS` and a `SetMPMissionSeq` with it), `playListSets` returns the sets as the disc's.

## 5b. Every dialog's banks (FE-SWEEP, 2026-10-06)

R164.6's gap -- a bank a dialog's `LIBRARIES` name that the page did not load -- swept over every record of
`RUN/UI/READERC.ZAR` (110) and `RUN/UI/READERX.ZAR` (4) through PLAT-05's loader (`dialogTextureStems`,
`frontEndAssets.ts`): 51 stems (UISK, the soft keyboard's, is named by none). Each is loaded at the start (`FRONT_END_TEXTURE_STEMS`), loaded when a dialog naming it is
built (`FRONT_END_LAZY_TEXTURE_STEMS`, through `FrontEndSessionOptions.dialogBuilt`), or listed with why not
(`FRONT_END_BANKS_NOT_LOADED`); `frontEndAssets.test.ts` refuses any other, and a `later` bank named by a dialog on the
page's path. The review's tightening (2026-10-06): every bank a reachable dialog names -- every dialog the sources of
`packages/ui` and `packages/viewer` name, research 114's three unplaced aside, plus the OPTIONS pages -- is loaded at the
start, lazily, by a named module that names it (`FRONT_END_BANKS_ELSEWHERE`, the file read), or on no file of the disc
(`FRONT_END_BANKS_ABSENT`). The list is derived from the sources' names; the dialogs' own switch references are not
followed. Sizes are the TXR and PAL pair's bytes on the disc.

| bank | dialogs | reached | bytes | on the page |
|---|---|---|---|---|
| UIMP, UI2D, UIBF, UISK, UICG | the path's (research 144 §5, R164.6) | now | 628,400; 1,334,896; 1,845,568; 1,622,896; 775,936 | at the start, as before |
| UIOP | `dlgOptions_Menu`, `_Audio`, `_Video`, the five controller pages | by deep link today (the main menu's OPTIONS is MENU-03's desktop notice until OPT-09) | 872,672 | **added, lazily**: read when one of them is built, again after a failed read; ready for OPT-09. Their `op_slider`, `op_knob`, `spectrum`, `contpic1-4`, `op_background`, `op_controller`, `op_windowact` are in no other bank: until now the page left them undrawn |
| UICI | `dlgCreateClan` (beside `uimp`) | now (WORLD OF SOCOM's CREATE CLAN; clans: sprint 18) | none: no file | nothing to load (`MISSING_UI_LIBRARY_READING`); its eleven bitmaps are all UIMP's |
| HYPE | `dlgHype` (unplaced, research 114) | never | none: no file | nothing to load |
| WSMP, WSLC | `dlg_equipment_mp` (the ARMORY); WSLC also `dlg_CharUnlock` (the campaign's, not reached) | now | 118,592; 474,800 | another module's: `armoryData.ts`, from the map archive (no loose WSMP) |
| LOAD | `dlgLoad` (`common/assetlib/loading`) | now | 6,608 | another module's: `loadingAssets.ts`, from the map archive |
| SPMP | the three round screens (READERC and READERX) | in a match | 264,336 (`RUN/COMMON`) | another module's: `roundScreens.ts` draws their two bitmaps from UIMP's byte-equal copies |
| SPLA | `dlgExitState` (unplaced) | never | 265,184 (`RUN/COMMON`) | listed |
| UIGC | `dlgGameComplete` (the campaign's end) | later | 396,736 | listed |
| WSSP | `dlg_equipment_main`, `dlg_WeapUnlock` | later | 97,776 | listed |
| EQ51-EQ83, BF51-BF83 | the twelve `dlg_Brief_*` (BF51 also `dlg_WeapUnlock`) | later | about 71 KB and 463,872 each | listed (per-mission banks: the page's one name space would need a per-dialog lookup first) |
| UIMM, MM51-MM83 | the twelve `dlg_Map*` | later | 415,120; about 1.6 MB each, in M51-M83.ZDB only | listed |

The start's cost is unchanged (UICG's 775,936 stays eager: the PLAY LIST's picture on CREATE GAME's first frame); UIOP's
872,672 is paid only on OPTIONS. Not done: UICG made lazy too (the owner's report of 2026-10-06 was settled with it
eager); the campaign's banks, until the single-player front end reaches them.

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `PLAY_LIST_FIRST_RELEASE_READING` (`packages/ui/src/screens/createGameCommands.ts`) | only Vigilance, Fish Hook, Crossroads, Blizzard, Frostfire, Desert Glory, Night Stalker and The Ruins listed, in `missionlist.rdr`'s order; every other row, Medley and Random included, left out at the source (until 2026-10-07: the 24 rows, the 21 not offered keyed `DISABLED` in grey; until 2026-10-12: the three without Night Stalker; until V13-2, 2026-11-07: the four without Blizzard and The Ruins; until V13-3: the five without Blizzard; until DF-14, 2026-11-08: the six without Fish Hook and Desert Glory) | OT.R16; the owner's three-map list, 2026-10-07; OT.R45's fourth, 2026-10-12; OT.R58 amended 2026-11-07, the fifth (V13-2) and sixth (V13-3), and 2026-11-08, the seventh and eighth (DF-14, pending the owner's confirmation at the merge, H429) (§7); the original's own filter leaves rows out (§3) | the owner opening more maps (the server's `FIRST_RELEASE_MAPS` with it) |
| `PLAY_LIST_NO_MEDLEY_ROW_READING` (`createGameCommands.ts`, `playListSets`; applied in `frontEndMachine.ts`) | `add_a_mission`'s `tmp_idx == 0` read as `tmp_idx < 0` (never): row 0 is not Medley | the set takes row 0 for Medley whenever respawn is off; the first release lists no Medley (§3) | Medley listed again (then the disc's set as it is) |
| `MISSION_ARCHIVE_PRESENT_READING` (`createGameCommands.ts`) | every multiplayer mission present | `FUN_002c94f0`'s archive check; the player's own disc holds all 22 | a page that knows which `.ZDB` its disc image lacks |
| `LISTBOX_GET_CONTENTS_READING` (`packages/ui/src/widgets/listbox.ts`) | each item serialised: a column item a sub-list, a text cell an int, a real or its string; an image cell nothing | op 10's serialisers read in the ELF (§2); the image cell's not followed | the image content's +0x40 (vtable 0x407050), when a list serialises one |
| `LISTBOX_GET_CONTENTS_PLACEHOLDER` | the var left as it was | research 117's | replaced 2026-10-05 by `LISTBOX_GET_CONTENTS_READING` |
| `MISSING_UI_LIBRARY_READING` (`packages/viewer/src/frontEndAssets.ts`) | a `LIBRARIES` bank with no file (`uici`, `hype`) loads nothing; the dialog's other banks hold its bitmaps | read off the disc's contents (§5b): no loose pair, no map archive's member; `dlgCreateClan`'s eleven bitmaps all in UIMP | `FUN_003199c0`'s failure path read, or a capture of CREATE CLAN |

Changed, listed in their own notes' tables: `LISTBOX_ADDED_ITEM_READING` (research 117: `FUN_0036bbc0`'s item) and
`LISTBOX_ARRAY_CELL_KEYS_READING` (research 147: `COLOR` and `DISABLED` applied). Reused: research 117's argument rule.

## 7. The record

As 163 §9: the tests above, one group at a time, with `SOCOM_DISC` and `SOCOM_PC_ROOT` set; the two typechecks; the three
document tests. The counts are the task's report's.

**Four since 2026-10-12 (OT.R45, MAPS-4).** The owner: "Include NIGHT STALKER in the default list of 3 maps to now make
it 4, visible from the CREATE GAME ui in the normal match flow." `FIRST_RELEASE_MAPS` is MP2, MP7, MP51, MP72 (the
server's and `@s2u/ui`'s), so the rows are 51 VIGILANCE, 72 CROSSROADS, 2 FROSTFIRE, 7 NIGHT STALKER -- the order is
still the file's, read off the disc's `missionlist.rdr` (`createGameCommands.test.ts`; Night Stalker is its 17th
multiplayer record, after Desert Glory, MP6), never chosen. Its picture is `CGPic7`, `mp7MissPic.tif` in UICG
(`createGamePictureDisc.test.ts`, `frontEndAssets.test.ts`). OT.R42's "only the 3 maps" is superseded; the rule of
§3 -- the rows not offered left out, never greyed -- is unchanged. The default list bounds CREATE GAME and a
created game only: the match server's own map rooms play every map its source holds (`server.ts` `playedMaps`,
`GET /maps`).

**Six since V13-3 (V13-2 made it five, The Ruins; V13-3 the sixth, Blizzard -- the owner, 2026-11-07: "ruins tonight, blizzard in the next one"; OT.R58 amended, the v0.4.13 plan's V13.R1-R2).** `FIRST_RELEASE_MAPS` is
MP1, MP2, MP7, MP12, MP51, MP72 -- one list, `@s2u/ui`'s numbers, from which central's `lobby.ts` derives its stems --
so the rows are 51 VIGILANCE, 72 CROSSROADS, 1 BLIZZARD, 2 FROSTFIRE, 7 NIGHT STALKER, 12 THE RUINS: Blizzard the
file's 13th multiplayer record and The Ruins its 22nd (`createGameCommands.test.ts`, off the disc). Both are TYPE 2,
DEMOLITION (`viewer/test/rules.test.ts`), so with RESPAWN on `FUN_00274940`'s own filter leaves them out at the source
(D:L121528-121530), as Crossroads and Night Stalker; the original has no other per-map type to refuse -- a mission's
type is its record's -- and a respawn game named on either plays classic (`playedRules`, `FUN_002a7560`
D:L149405-149431), as on the other two DEMOLITION maps.

**Eight since DF-14 (Fish Hook and Desert Glory -- the owner's word of 2026-11-08, "would like to release them this
week", read as OT.R58's second amendment, the DF plan's DF.R1, confirmed by him 2026-11-09 (H429, MEGA.R10 2); reading
(DF-14's review FAIL then PASS, high, `agent-mail/evidence/dg-fishhook-readiness-2026-11-08/REVIEW-DF-14-1.md`).** `FIRST_RELEASE_MAPS` is MP1, MP2, MP6, MP7, MP12, MP51, MP71, MP72 -- the same one list, central's
stems derived from it -- so the rows are 51 VIGILANCE, 71 FISH HOOK, 72 CROSSROADS, 1 BLIZZARD, 2 FROSTFIRE, 6 DESERT
GLORY, 7 NIGHT STALKER, 12 THE RUINS: Fish Hook the file's 7th multiplayer record and Desert Glory its 16th
(`createGameCommands.test.ts`, off the disc), every row after VIGILANCE moved down by Fish Hook. Both are TYPE 4,
EXTRACTION (`FUN_002c9540` D:L168877-168906; research 192 G2: EXT 6, 10, 11, 71), so with RESPAWN on `FUN_00274940`'s
filter leaves them out at the source (D:L121528-121530; the respawn list stays 51, 2) and a respawn game named on either
plays classic (`playedRules`, `FUN_002a7560` D:L149405-149431) -- V13.R2 extended from DEMOLITION to EXTRACTION by the
same code (DF.R2), no new code. Their pictures are `CGPic71` and `CGPic6`, `mp71MissPic.tif` and `mp6MissPic.tif` in
UICG (`createGamePictureDisc.test.ts` with `SOCOM_DISC`: both drawn, nothing undrawn). With eight rows the list's window
no longer holds every row at the opening: the dev-disc picture check draws rows 0-6 with the focus on VIGILANCE and THE
RUINS only once the focus has walked down and the window scrolled (`ListboxWidget.top`) -- the LISTBOX's own scroll, the
popup's layout unchanged. `add_a_mission`'s `num_missions < 12` bound on the selection is untouched. The match
server's own rooms are unchanged: they play every map their source holds.
