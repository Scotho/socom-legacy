# 118 -- Popup dialogs: PopUpDialog, the POPUP record, the buttons and the default, the input, KillPopUp, and every offline popup (web sprint 9, PLAT-16)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, task PLAT-16, W9.R7;
the task's block is `../roadmap/01-platform.md` "PLAT-16", its unknown "the full record beyond the text id -- read
`UIPopUpDialog` (D:L126642)"). Read-only research: no code changes here; the PLAT-16 implementer transcribes it.
Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line;
every address **retail**), the retail ELF on the disc (`game/disc/socom2_game.elf`: strings, vtables and a few
instructions read by address through its program headers), the disc's `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR`,
`RUN/MPZANIM.ZAR` and `RUN/UI/READERC.ZAR` read with the repository's `@s2u/archive` (`Zar`, `parseRdr`), `@s2u/scene`
(`parseAnimSets`, `decodeUiProgram`) and `tools/dialogInventory.ts` (`scriptLibrary`, `bindingsOf`, the pin's
`classes`) by probes outside the repository, and four archived captures of the recompiled game (§8). Names, ids,
counts and short constants only: no caption text, no game bytes in git.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R118.1 | **A popup is two commands, not one.** `PopUpDialog` (binding row 13, id 14, `FUN_0027eb10` D:L126642-126652) shows the menu's `POPUP` node and plays `.METAL` (`FUN_0027eff0` D:L126860-126904); the **content** is a `ui::UI_COMMAND` aimed at the node `POPUP`, whose 220-byte record the popup object's command handler `FUN_0036da20` (D:L266787-267160) reads. Every one of the 285 records on the disc follows a `PopUpDialog` in its sequence | `FUN_0027eff0`, `FUN_0036da20` | §1 |
| R118.2 | **`PopUpDialog`'s argument is unused**: all 252 calls pass `NA`; the name goes into a type-3 entry of the UI manager's command queue (0x414ed0), which the menu's update pops with no effect (D:L262288-262347, `FUN_0027f460` D:L127020-127024) | §1 | §1 |
| R118.3 | **There is one popup per menu and no stack.** The popup object (0xbf0 bytes, held at the UI manager's +0xe40 = `DAT_00415d10`) is made at each menu's load and hung, hidden, as the node `POPUP` after `MENUFADER` (D:L263670-263688); the menu's teardown destroys it (`FUN_00369210` D:L264301-264308). A popup over a popup **replaces** it; no popup survives a `SWITCHMENU` | §1, §6 | §1, §6 |
| R118.4 | **The record, every field** (§2's table): +2 s16 the text id; +4 the panel bitmap; +8/+12 x, y; +16 h; +20 w; **+24 the text's y offset, +28 its x offset** (the reverse of sprint 5's decode); +32 f32 and +36..+44 the text object's scale word and colour; +64 TRIANGLE answers; +65 keep open on CROSS; **+66 the popup has buttons (not "the focus")**; +67 the answer valve; two 76-byte button slots at +68 and +144 (three bitmaps: focused, normal, pressed; x, y, w, h; the label; its offset; three colours; a centred flag; the label scale) | `FUN_0036da20` | §2 |
| R118.5 | **The layout**, settled against three captures to the pixel (§8): the panel at (x, y), w x h, the record's bitmap (`popupOp.tif` in all 285), **opaque**; the text from (x + [+28], y + [+24]), wrapped to w - 2 x [+28] (D:L267148), line i's pen at y + [+24] + 20 i - 3 (D:L273144), **pitch 20** (`FUN_00370610` D:L268382); each button at (x + bx, y + by), a centred one shifted left by half its width (`FUN_0037c220` D:L274566-274572); its label's pen at the button's (+tdx, +tdy) | §3 | §3 |
| R118.6 | **The default is always the record's first button.** Applying a record with buttons focuses button 1 and sets the answer to 1 (D:L266863, D:L267136-267137). LEFT or RIGHT toggles to the other button only when its width is above 0, with the `SELECTION` sound; CROSS writes the answer (1 or 2) into the valve through its watchers, shows the pressed state and closes the popup unless +65 is set; TRIANGLE, only when +64 is set, writes **66** and closes (`FUN_00370990` D:L268476-268549) | §4 | §4 |
| R118.7 | **The logoff popup** (`dlgWorldOfSOCOM` `exit_lobby`, text 793): button 1 is 246 (NO) at x 225, button 2 is 253 (YES) at x 65 -- it opens on NO, LEFT (or RIGHT) moves to YES, YES answers 2 and the script logs off. Seen in the capture (§8.1). The ARMORY's confirm (1245) is laid out the same way: **it opens on NO**, not YES | §4, §8 | §4, §8 |
| R118.8 | **The popup takes all input.** While the `POPUP` node is visible the menu's input handler hands every pad event to the popup and returns (`FUN_00368650` D:L263850-263855): no binding of the dialog under it runs, CIRCLE, SQUARE and START are swallowed, and the soft keyboard is told the popup is up (D:L262357-262361). Scripts keep running; they wait on the valve (`WHILE valve == 0`) | §5 | §5 |
| R118.9 | **`KillPopUp`** (row 14, id 15, `FUN_0027d190` D:L125846-125859) only hides the `POPUP` node when the popup object exists: no valve write, no text change. Nothing in the popup times out: every timeout and every script close is the script's own (`WAIT n` then `KillPopUp`, another popup, or a `SWITCHMENU`) | §6 | §6 |
| R118.10 | **The inventory**: 285 records in 195 sequences of 179 animations of 53 sets, counted by index (by name: 183 sequences, 170 animations; UIZANIM 240 in 47, EXTZANIM 15 in 2, MPZANIM 30 in 4); 252 `PopUpDialog`, 48 `KillPopUp` (spelled `KillPopup` 25, `KILLPOPUP` 17, `KillPopUp` 6). **75 records are reached from an offline dialog's bindings** (68 keys by set, animation, sequence and text id, which folds a sequence's literal-text records into one), 73 of them outside the campaign (R1), each listed in §7 | §7 | §7 |
| R118.11 | **What this changes in sprint 5's ARMORY reading** (W9.R7: PLAT-34 applies it): `ARMORY_POPUP_LAYOUT_READING` settled with five corrections (the text offsets swapped, the wrap, the pitch 20 and the -3, the opaque panel, the button bitmaps and colours); `ARMORY_POPUP_FOCUS_READING` **wrong** (NO, not YES); `ARMORY_CONFIRM_VALUE_READING` confirmed (YES 2, NO 1) | §9 | §9 |

**The level.** Everything here is the reading level (the decompilation, the disc and the tallies), with the layout's
numbers and the default selection seen on recompiled-game captures (§8). The proven level is PLAT-16's acceptance:
each popup captured on PCSX2 and SOCOM Legacy scored, and PLAT-36's call trace of `PopUpDialog` / `KillPopUp`.

## 1. The two halves: `PopUpDialog` and the POPUP record

**`PopUpDialog`** -- the UI binding table (0x3dd4d0, web research 96 §4) row 13, id 14, fn 0x27eb10, no fn2;
`KillPopUp` is row 14, id 15, fn 0x27d190. No code calls either function directly (the only references are the table
and `FUN_0027eb10`'s own call); every popup on the disc is raised by a script.

1. `FUN_0027eb10` (D:L126642-126652) resolves the command's +8 name and calls `FUN_0027eff0(0x414ed0, name)`.
2. `FUN_0027eff0` (D:L126860-126904): `INPUT_STRING` (0x3ee898) is replaced by the context's input string; the name is
   stored in a new entry of the UI manager's queue (entry type 3, D:L126884-126890); the `POPUP` node (string 0x3ef340)
   is found in the current menu (`DAT_00414e40`, its node table +0x60, slot +0x24) and **shown** (the node's slot
   +0x38 with 1, D:L126896); the sound `.METAL` (0x3ef3c0) is played (`FUN_00344f30`, its slot +0x1c with 1, 0, 0xff,
   D:L126897-126900).
3. The menu's update (`FUN_003654c0` D:L262241-262371) pops the queue each frame: types 8, 7, 6, 5 and 2 do work
   (D:L262291-262340); type 3 falls through to the plain pop `FUN_0027f460` (D:L262341-262346; its case 3 at
   D:L127020-127024 marks the entry free). So the argument is never read. On the disc every call passes `NA`.

**The record** is a `ui::UI_COMMAND` with a node (research 95 §1.2): +4 the node `POPUP`, and the dispatcher
`FUN_002745a0` (D:L121344-121431) calls the node's UI object's slot +100 (D:L121384). The `POPUP` node's object is the
popup (D:L263670-263688), its vtable at +0xc is 0x4073a0, and slot +0x64 (0x407404) is **`FUN_0036da20`**. It does not
test the opcode byte: any command on `POPUP` is a record (the disc's 285 are all op 0, byte +6 = 0). The command is 236
bytes: the 16-byte header the dispatcher reads, then the 220-byte record (`UiCommand.extra` in `@s2u/scene`; all 285
are 220 bytes).

**The popup object** (`FUN_0027f190` D:L126907-126934): made once per UI manager (stored at 0x414ed0 + 0xe40, the
`DAT_00415d10` `KillPopUp` tests), 0xbf0 bytes: a base 2D object (`FUN_0020cd50`), a text object at +0xb0
(`FUN_0027f250` D:L126937-126981, vtable 0x4079e0), a sub-object at +0x314, two buttons at +0x340 and +0x790
(`FUN_00377800` D:L272105, vtable 0x407790). The menu's load (D:L263670-263688) gives it the menu's font
(+0x300 = menu +0x210; `FUN_00370610` D:L268371-268385 sets it on the text and both labels, the text scale word 1.0,
the wrap width 100 and the **line height 20.0** at +0x16c), adds it to the menu's 2D root as a node named `POPUP`
(0x3f8df8) after `MENUFADER` (D:L263614-263625), and hides it (D:L263688). Its vtable slots: +0x10 draw
`FUN_00370690`, +0x38 update `FUN_00370920`, +0x44 input `FUN_00370990`, +0x64 the record `FUN_0036da20`.

## 2. The POPUP record (220 bytes; `FUN_0036da20` D:L266787-267160)

Offsets are into the record (the command's +0x10 on); the command offset is in brackets. "Disc" is the tally over the
285 records. A name index resolves through the animation's name table (`FUN_0026ed60`); a text id through UIMnLOC
(`FUN_00361b40`).

| rec | cmd | width | meaning | read at | how established |
|---|---|---|---|---|---|
| +0 | +0x10 | u8 | the text as a name (used when +2 is 0); `INPUT_STRING` is replaced by the context's input string | D:L266832-266843 | decomp; disc: 114 records with id 0, 36 of them `INPUT_STRING` (the net errors, `OnSystemMessage`, `OnMultiplayerDisconnect`) |
| +1 | +0x11 | u8 | not read | -- | decomp |
| +2 | +0x12 | s16 | the text's UIMnLOC id; 0 = the name at +0 | D:L266833-266838 | decomp (research 95's "u16 at +18") |
| +4 | +0x14 | u8 | the panel's bitmap (a name), looked up in the menu's library (`FUN_0036a230`) | D:L266832, D:L267156-267157 | decomp; disc: `popupOp.tif` in all 285 |
| +5..+7 | +0x15 | -- | not read | -- | decomp |
| +8, +12 | +0x18, +0x1c | i32 x2 | the panel's x, y on the 640 x 448 screen: the `POPUP` node's position (`FUN_003157d0`), set when the node's name is `POPUP` (0x3f9130) | D:L266844-266848 | decomp; captures §8 |
| +16 | +0x20 | i32 | the panel's height (popup +0x310) | D:L266851, D:L267157 | decomp; captures |
| +20 | +0x24 | i32 | the panel's width (popup +0x30c) | D:L266850, D:L267157 | decomp; captures |
| +24 | +0x28 | i32 | **the text's y offset** in the panel (popup +0x308) | D:L266853, D:L268448 | decomp; captures (y 45: tops at 202) |
| +28 | +0x2c | i32 | **the text's x offset** and its side margin (popup +0x304): the wrap width is w - 2 x this | D:L266852, D:L267148, D:L268447 | decomp; captures (x 25: text from 175) |
| +32 | +0x30 | f32 | the text object's word +0x40 (popup +0xf0; 1.0 by default, D:L268380): read as its scale | D:L267147 | decomp; disc: 1.0 in all 285 (`POPUP_TEXT_SCALE_READING`) |
| +36, +40, +44 | +0x34..+0x3c | i32 x3 | the text's colour, r g b (popup +0xf8..+0x100; 128 = full on the PS2) | D:L267151-267155 | decomp; disc: 128, 128, 128 in all 285 |
| +48..+63 | +0x40..+0x4f | -- | not read | -- | decomp; disc: all zero |
| +64 | +0x50 | u8 | TRIANGLE answers (popup +0x339): writes 66 and closes | D:L266854, D:L268514-268526 | decomp; disc: 5 records |
| +65 | +0x51 | u8 | **keep open on CROSS** (popup +0xbe0): set, CROSS answers but the popup stays until the script removes it | D:L266855, D:L268507, D:L268520 | decomp; disc: 54 records (30 without buttons) |
| +66 | +0x52 | u8 | **the popup has buttons**: non-zero, the valve at +67 is made, focus and answer reset to button 1, both slots read; zero, no valve (popup +0x330 = 0) and nothing else of +67..+219 is read | D:L266856-266863, D:L267137 | decomp; disc: 213 records (72 with button 1's width 0, 83 with one button, 58 with two) |
| +67 | +0x53 | u8 | the answer valve (a name), find-or-made at TEMP (`FUN_00351ff0(name, 2)`, research 104 §3) | D:L266860-266862 | decomp |
| +68 | +0x54 | 76 | button 1 (popup +0x340), the slot below | D:L266864-266934 etc. | decomp |
| +144 | +0xa0 | 76 | button 2 (popup +0x790), the same slot | D:L267006-267135 | decomp |

**A button slot** (76 bytes at +68 and +144; b = the slot's start):

| b | width | meaning | button 1 / button 2 read at | disc |
|---|---|---|---|---|
| +0 | u8 | the **focused** bitmap (a name): the state at button +0xfc, shown by the focus slot +0x50 | D:L266898-266934 / D:L267028-267064 | `active_back.tif` |
| +1 | u8 | the **normal** bitmap: the state at +0x130, shown by the unfocus slot +0x54 (`FUN_0036e6b0` D:L267180-267201) | D:L266935-266968 / D:L267065-267098 | `pop_butt.tif` |
| +2 | u8 | the **pressed** bitmap: the state at +0xc8, shown by the press slot +0x74 for 0.2 s (`FUN_00370c20` D:L268552-268572) | D:L266969-267002 / D:L267099-267132 | `pop_butt.tif` |
| +3 | -- | not read | -- | -- |
| +4, +8 | i32 x2 | x, y in the panel (popup +0x780/+0x784, +0xbd0/+0xbd4) | D:L266880-266881 / D:L267022-267023; drawn D:L268437-268444 | captures |
| +12, +16 | i32 x2 | w, h (the button's quad size, +0x240/+0x244; `FUN_0036e840` D:L267254-267262). **A width of 0 makes the button unreachable** (the LEFT/RIGHT test, D:L268529, D:L268536) and invisible | D:L266876-266878 / D:L267018-267020 | h 25 in every present button |
| +20 | u8 | the label as a name (used when +22 is 0) | D:L266864-266866 / D:L267006-267008 | |
| +22 | s16 | the label's UIMnLOC id | D:L266864-266870 / D:L267006-267012 | 246, 253, 226, 510, 511, 589, 590, or a name |
| +24, +28 | i32 x2 | the label's pen offset in the button (+0xb4/+0xb8; 10, 5 by default, D:L272118-272119) | D:L266882-266885 / D:L267024-267027; drawn `FUN_00377aa0` D:L272234-272236 | tdy 25 in 188 present buttons, 24 in 10, 26 in 1 |
| +32, +44, +56 | i32 x3 each | the label's colour in the focused, normal and pressed state (each state's +0x24; `FUN_0036e790` D:L267221-267241 writes it to the button's +0x64..+0x6c) | D:L266910-266912, D:L266947-266949, D:L266981-266983 | (91, 72, 36), (128, 128, 128), (102, 87, 38) in every present button |
| +68 | u8 | **centred**: 1 sets button +0xbc and +0x85 -- the quad is drawn shifted left by half its width (`FUN_0037c220` D:L274566-274572) and the label is centred on x | D:L267003-267005 / D:L267133-267135 | 23 present buttons; captures §8.3 |
| +69..+71 | -- | not read | -- | -- |
| +72 | f32 | the label's scale (button +0x5c, 1.5 by default; each state's +0x30) | D:L266879, D:L266913 / D:L267021 | 0.9 in 189 present buttons, 1.0 in 10 |

The focused state also carries a flag 1 and the constants 0.5, 1.0, 0.5 (D:L266914-266917), which `FUN_0036e790`
stores at the button's +0x84 and +0x78..+0x80; the normal and pressed states carry the flag 0. The captures show the
focused label at two shades in two frames (§8.1), consistent with a pulse; its curve was not read
(`POPUP_FOCUS_PULSE_READING`).

## 3. The layout (`FUN_00370690` D:L268388-268459, the text's draw `FUN_003794b0` D:L273082-273191)

The popup's draw, from its node's origin (the record's x, y):

1. **The panel**: the popup's own quad, set by the record to (0, 0)-(w, h) with the +4 bitmap (D:L267156-267157),
   drawn by the base draw `FUN_00364950` (D:L268434) at the base object's colour (its default; not read) --
   **opaque** in every capture (§8).
2. **The buttons**, only when the record has buttons (popup +0x330 non-zero, D:L268435): button 1 at (x + bx1, y +
   by1), button 2 at (x + bx2, y + by2) (D:L268437-268444), each through `FUN_00377aa0` (D:L272216-272240): the quad
   (`FUN_0037c220`: a centred button's quad starts at bx - bw/2), then the label at the button's (+tdx, +tdy) when it
   has one.
3. **The text**, last: at (x + [+28], y + [+24]) (D:L268446-268453), through the text object's draw `FUN_003794b0`:
   line i's pen at y + [+24] + i x 20 - 3.0 (D:L273144; the line height is the object's +0xbc, returned by its slot
   +0x88 at 0x36afb0 -- `lwc1 f0, 0xbc(a0)` -- which `FUN_00370610` sets to 20.0), wrapped to w - 2 x [+28]
   (D:L267148, popup +0x170 = the object's +0xc0). The draw's scissor (D:L273115-273138) applies only when the
   object's +0xc4 is positive; the popup's text object starts it at -1 (`FUN_0027f250` D:L126950), so no clip.

| quantity | rule | logoff (793; 150, 180, 340 x 130) | save prompt (831; 155, 180, 350 x 120) |
|---|---|---|---|
| panel | (x, y) to (x + w - 1, y + h - 1) | 150..489, 180..309 measured | 155..504, 180..299 measured |
| text left | x + [+28] | 175: the first glyph at 177 (its bearing) | -- |
| first line | the pen y + [+24] - 3; the tall glyphs' tops 20 rows above it | pen 222, tops at 202 | pen 217, tops at 197 |
| pitch | 20 | tops 202, 222, 242 | tops 197, 217 |
| wrap | w - 2 x [+28] | 290: the text spans 177..451 | -- |
| buttons | (x + bx, y + by), w x h | NO 375..424 x 270..294, YES 215..264 | YES 220..269 x 258..282 |
| a label | the button's (x + tdx, y + tdy) pen; tops 18 rows above (20 x 0.9) | NO 393: glyphs 394..408 x 277..288 | -- |

The briefing's leave popup (889; 140, 180, 340 x 120, centred buttons at bx 70 and 260, bw 80) draws its boxes at
170..249 and 360..439 and centres the labels on 210 and 400 (§8.3).

**Draw order**: the `POPUP` node is the last node the menu's load adds to its 2D root, after `MENUFADER` (D:L263614-263625,
D:L263674-263688), so a popup draws over the dialog and the fader. The dimming behind a popup is **the script's**
(`OBJECT_OPACITY_FROM_TO MENUFADER 0 -> 0.7` in 0.05 s before `PopUpDialog`, e.g. `exit_lobby`,
`OnEquipWeaponBtnDefault`), not the popup's: the briefing's popup has none and its frames are not dimmed (§8.3).

## 4. The buttons, the default and the answer (`FUN_00370990` D:L268476-268549)

The pad event the popup reads is a byte per button, the binding index + 1 (`FUN_0036a5d0` D:L264986-265079 maps the
names: START 0, SELECT 1, RIGHT 2, LEFT 3, UP 4, DOWN 5, TRIANGLE 6, CIRCLE 7, SQUARE 8, CROSS 9, R1 10, R2 11, L1 12,
L2 13; a binding reads byte index + 1, D:L266558): byte +3 RIGHT, +4 LEFT, +7 TRIANGLE, +10 CROSS, each tested for 1.

| event | state | effect | lines |
|---|---|---|---|
| the record applied | has buttons | answer := 1; button 1 focused (+0x50), button 2 normal (+0x54); the valve made at TEMP | D:L266860-266863, D:L267136-267137 |
| the record applied | no buttons | no valve; the answer, the focus and the widths keep their last values (`POPUP_STALE_FOCUS_READING`) | D:L266856-266859 |
| LEFT or RIGHT | answer 1, button 2's width > 0 | answer := 2; button 1 normal, button 2 focused; `SELECTION` sound | D:L268527-268534 |
| LEFT or RIGHT | answer 2, button 1's width > 0 | answer := 1; button 1 focused, button 2 normal; `SELECTION` | D:L268536-268541 |
| LEFT or RIGHT | the other button's width 0 | nothing, no sound | D:L268529, D:L268536 |
| CROSS | a valve | the valve := the answer, through the watchers (event 1 when non-zero; research 104 §2); the answered button's pressed state | D:L268488-268506 |
| CROSS | keep (+65) 0 | the text set empty and the `POPUP` node hidden (`FUN_0027ed90`); `SELECTION` | D:L268507-268512 |
| CROSS | keep 1 | the popup stays; `SELECTION` | D:L268507, D:L268512 |
| TRIANGLE | +64 set | the valve := 66 (no watcher call when it already held 66); closes as CROSS unless keep; `SELECTION` | D:L268514-268526 |
| TRIANGLE | +64 clear | nothing | D:L268514 |
| any other button, UP, DOWN, the sticks | -- | nothing (swallowed: §5) | -- |

- **The answer is the button's slot, not its label**: 1 for the record's first button, 2 for its second. Whether YES is
  1 or 2 is the record's: of the 58 two-button records, 36 are (246, 253) -- NO first, YES answers 2 -- and 11 are
  (253, 246) -- YES first and the default (`AskToLoadData`, `AreYouSureYouDontWantToFormat`, `save_and_leave`, ...);
  button 1 is the right-hand one in 40 and the left-hand one in 18.
- **CROSS with no visible button**: 72 records have buttons with button 1's width 0 (e.g. `dlgMenu` `MainMenuOnLoad`'s
  513/514 over `CannotLoadNoFormat`, `dlgNetAuthenticate`'s 450 over `ConfirmPopup`): CROSS writes 1 and closes -- the
  game's "press X to continue" without a button drawn.
- **A popup without buttons** (72 records): no valve, so CROSS answers nothing, but one without keep (42 records) is
  still closed by CROSS; one with keep (30) cannot be closed by the player.
- **Sounds**: the open plays `.METAL` (D:L126897-126900); a move and an answer play the UI's `SELECTION` sound
  (`FUN_0036a2c0` D:L264853-264862, `DAT_00408564`: `uisounds.rdr`'s `SOUNDS` / `SELECTION`, D:L55196-55216).
- **The logoff** (`dlgWorldOfSOCOM` `exit_lobby`): `MENUFADER` 0 -> 0.7, `AreYouSure` := 0, `PopUpDialog`, the record
  (793; button 1 = 246 at 225, 90; button 2 = 253 at 65, 90; both 50 x 25), `WHILE AreYouSure == 0`; 2 -> a second
  popup (422, no buttons), the logout and `SWITCHMENU REBOOT`; otherwise `KILLPOPUP` and the fader back. PC research 78
  §0's "NO selected; LEFT selects YES" is this record: NO is button 1, YES lies to its left.

## 5. The focus and the input

- **The popup is modal.** `FUN_00368650` (the menu's input, D:L263804-) begins: when the menu's `POPUP` node is
  visible (its +0x5c bit 0), the popup's input slot +0x44 (`FUN_00370990`) is called and the function **returns**
  (D:L263850-263855). The dialog's bindings, its focus walk and its own controls see nothing until the popup is
  hidden; every button the popup does not test is dropped.
- **The soft keyboard** is passed a "no popup" flag every frame (D:L262357-262361: `FUN_0038d8f0`, in the `zui_skb`
  range): it takes the pad only while no popup is up.
- **The popup updates while hidden**: the menu's update calls the popup's slot +0x38 every frame (D:L262348-262350;
  `FUN_00370920` D:L268462-268473 updates both buttons).
- **What reaches the input at all**: the menu's update calls `FUN_00368650` only when its countdown +0x900 is spent and
  +0x8fc is negative (D:L262262-262269). `SuspendMenuInput` (0x277220) writes the timer object at 0x408538; whether
  that is the +0x900 countdown, and so whether a suspended menu also deafens its popup, was not traced
  (`POPUP_SUSPEND_READING`).
- **The scripts are not suspended**: a script raising a popup goes on to `WHILE valve == 0 / END_WHILE` and branches
  on the answer -- 186 of the 213 records with a valve are followed by that loop in their own sequence; the rest wait
  in a caller or test the valve later.

## 6. `KillPopUp`, closing, timeouts, popups over popups

| what | effect | lines |
|---|---|---|
| `KillPopUp` (`FUN_0027d190`) | when `DAT_00415d10` (the popup object) is non-null: the `POPUP` node of the current menu hidden (node slot +0x38 with 0). No valve, no text, no queue | D:L125846-125859 |
| the popup's own close (CROSS / TRIANGLE without keep) | the text set empty (0x3f9220), then `FUN_0027ed90`, the same hide | D:L268508-268510, D:L126731-126744 |
| `SWITCHMENU` | the old menu's teardown hides and drops its `POPUP` node and destroys the popup object (`FUN_0027ef10`); the new menu's load makes a new one, hidden | D:L264301-264308, D:L263670-263688 |
| a second `PopUpDialog` + record while one is up | the node shown again (already shown), `.METAL` again, the record replaces the text, the panel and the buttons, the focus back to button 1 | §1, §4 |
| a second record without `PopUpDialog` | the content changes in place (the record applied to the shown popup). 33 records follow another record in their sequence with no `PopUpDialog` between: alternatives in `IF` branches (`DisplayLoadingWarning`'s two slots, `MainMenuOnLoad`'s 513 / 514) or a change in place; the split was not counted | disc |

**Timeouts are scripts.** No timer in the popup; the disc's timed popups:

| script | the wait | what follows |
|---|---|---|
| `UIMemCardAnim.rdr` `SwitchToProgressiveVideo` (sequence 2, started beside the question) | `WAIT 10` | `KillPopUp`, `SwitchProgressiveVideo(NTSC)`, popup 723 (one button, 226) |
| `dlgIntroScreen.rdr` `SwitchToProgressiveVideoE3` (no binding reaches it; research 96 §3.2) | `WAIT 10`; its `timeout_video_choice` sequence | the same with literal texts |
| `dlgNetAuthenticate.rdr` `monitor_timeout` | `WAIT 90` | popup 450 (a hidden button over `ConfirmPopup`) |
| `dlg_equipment_mp.rdr` `UiBackToLobby` | popup 47 (no buttons, no keep), `WAIT 5` | the switch to the lobby removes it (CROSS would close it earlier) |
| `UIMemCardAnim.rdr` `DisplayLoadingWarning`, `dlgIntroScreen.rdr` `do_onstart`'s disk read, `dlgMenu.rdr` `MainMenuOnLoad` (512) | `WAIT 0.3` / `0.5` and the operation | `KillPopup`, another popup, or the switch |

**Closed by script**: 48 `KillPopUp` calls; the keep-open popups (54) are the "working..." notices the card and disk
operations raise (`do_formatting` 836-839, `save_and_leave` 832-835, `find_a_memcard` 827, `choose_memcard_slot` 829 ...)
and are taken down by the next popup, a `KillPopUp` or the switch.

## 7. Every popup the offline front end raises

**How it was read.** For each READERC `dlg*` layout, its `SCRIPT_LIBRARY` sets resolved as `tools/dialogInventory.ts`
`resolveSets` does (the dialog's own archive first), its bindings (`bindingsOf`) followed through `CALL_ANIMATION`;
every POPUP record of an animation so reached is credited to the dialog, and the dialog's class is the PLAT-06 pin's
(research 96 §3.4; offline = boot, main menu, options, extras, campaign). Like research 96's edges this is "can raise",
not "raises": an `IF` on a valve is not evaluated, and library animations are followed wherever they are called.
"The ten" below are the ten offline dialogs every `UIMemCardAnim.rdr` / `UIanim.rdr` card path is reachable from:
`dlgControllerPresets`, `dlgControllerPresetsCS`, `dlgControllerPresetsNewGame`, `dlgControllerPresetsRG`,
`dlgControllerSelection`, `dlgIntroScreen`, `dlgMenu`, `dlgOptions_Audio`, `dlgOptions_Menu`, `dlgOptions_Video`.
Buttons are "button 1 / button 2" by label id (the default first); "hidden" a button of width 0; "lit" a literal name
in place of an id, "lit x n" n records with literal texts (each its own name) in the same sequence and the same row's
fields. Keep = +65, Tri = +64.

| set, animation | text | buttons | valve | keep | tri | reached from (offline) |
|---|---|---|---|---|---|---|
| `UIanim.rdr` `intro_onstart` | 823 | 226 | `SitHere` | 0 | 0 | boot, main menu, options, campaign: the ten |
| `UIanim.rdr` `intro_onstart` | 824, 825 | hidden | `AreYouSure` | 1 | 0 | the ten |
| `UIMemCardAnim.rdr` `load_initial_config` | lit x 2 | 226 | `AcceptNoData` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `load_initial_config` | lit x 2 | 226 | `AcceptNotInserted` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `load_initial_config` | 826 | 246 / 253 | `AcceptNotInserted` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `find_a_memcard` | 827 | none | -- | 1 | 0 | the ten |
| `UIMemCardAnim.rdr` `choose_memcard_slot` | 828 | 510 / 511 | `MainMenuCardSlotChoice` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `choose_memcard_slot` | 829 | none | -- | 1 | 0 | the ten |
| `UIMemCardAnim.rdr` `choose_memcard_slot_cancellable` | 830 | 510 / 511 | `MainMenuCardSlotChoice` | 0 | 1 | options, campaign: `dlgOptions_Menu`, `dlgControllerPresets`, `-CS`, `-RG` |
| `UIMemCardAnim.rdr` `choose_memcard_slot_cancellable` | 829 | none | -- | 1 | 0 | the same four |
| `UIMemCardAnim.rdr` `AskToFormat` | 850, 851 | 246 / 253 | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `AreYouSureYouWantToFormat` | 848, 849 | 246 / 253 | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `AreYouSureYouDontWantToFormat` | 846, 847 | 253 / 246 | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `do_formatting` | lit | hidden | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `do_formatting` | 836, 837, 838, 839 | hidden | `AreYouSure` | 1 | 0 | the ten |
| `UIMemCardAnim.rdr` `AskToLoadData` | lit x 2 | 253 / 246 | `AreYouSure` | 0 | 0 | the ten but `dlgIntroScreen` |
| `UIMemCardAnim.rdr` `DisplayLoadingWarning` | 842, 843 | none | -- | 1 | 0 | the ten |
| `UIMemCardAnim.rdr` `DisplayErrorLoading` | 841 | hidden | `ConfirmError` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `NoSOCOMDataFound2` | 844, 845 | hidden | `AcceptNoData` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `CannotSaveNoSpace` | 855, 856 | 226 | `SitHere` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `CannotSaveNoMemcard` | 860, 861 | 226 | `SitHere` | 0 | 0 | the four of `choose_memcard_slot_cancellable` |
| `UIMemCardAnim.rdr` `CannotSaveNotFormatted` | 858, 859 | 226 | `SitHere` | 0 | 0 | the four |
| `UIMemCardAnim.rdr` `AskToOverwrite` | 857 | 246 / 253 | `AreYouSure` | 0 | 0 | the four |
| `UIMemCardAnim.rdr` `save_and_leave` | 831 | 253 / 246 | `AreYouSure` | 0 | 0 | the four |
| `UIMemCardAnim.rdr` `save_and_leave` | 832, 833, 834, 835 | none | -- | 1 | 0 | the four |
| `UIMemCardAnim.rdr` `DisplayErrorSaving` | 840 | hidden | `ConfirmError` | 0 | 0 | the four |
| `UIMemCardAnim.rdr` `verify_video_dtv` | 854 | 246 / 253 | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `SwitchToProgressiveVideo` | 721 | 246 / 253 | `AreYouSure` | 0 | 0 | the ten |
| `UIMemCardAnim.rdr` `SwitchToProgressiveVideo` | 722, 723 | 226 | `AreYouSure` | 0 | 0 | the ten |
| `UIHardDiskAnim.rdr` `DisplayHDDError` | lit x 3 | lit | `memcard_error_spin` | 0 | 0 | boot, options: `dlgIntroScreen`, `dlgOptions_Menu` |
| `dlgIntroScreen.rdr` `do_onstart` | lit | lit | `ControllerConnected` | 0 | 0 | boot: `dlgIntroScreen` (the controller check) |
| `dlgIntroScreen.rdr` `do_onstart` | lit | none | -- | 1 | 0 | boot: `dlgIntroScreen` (the disk read) |
| `dlgMenu.rdr` `GetSlotToLoadFrom` | 509 | 510 / 511 | `MainMenuCardSlotChoice` | 0 | 1 | main menu (LOAD GAME: R1) |
| `dlgMenu.rdr` `MainMenuOnLoad` | 512 | none | -- | 0 | 0 | main menu (LOAD GAME: R1) |
| `dlgMenu.rdr` `MainMenuOnLoad` | 513, 514 | hidden | `CannotLoadNoFormat` | 0 | 0 | main menu (LOAD GAME: R1) |
| `dlgMenu.rdr` `LoadGameOnListBox` | 513, 514 | hidden | `CannotLoadNoFormat` | 0 | 0 | main menu (the LOAD GAME list: R1) |
| `dlgMenu.rdr` `LoadGameOnListBox` | 515 | none | -- | 1 | 0 | the same |
| `dlgMenu.rdr` `LoadGameOnListBox` | 516 | hidden | `LoadedPopupResult` | 0 | 0 | the same |
| `dlgMenu.rdr` `LoadGameOnListBox` | 517 | 226 | `CannotLoadNoFormat` | 0 | 0 | the same |
| `dlgOptions_Menu.rdr` `Triangle_Back` | lit | 246 / 253 | `AreYouSure` | 0 | 0 | options: `dlgOptions_Menu` |
| `dlgOptions_Menu.rdr` `Enable_HDD`, `Disable_HDD` | lit | 246 / 253 | `CheckHDDEnable` | 0 | 0 | options: `dlgOptions_Menu` |
| `dlgOptions_Audio.rdr` `OnAudioBack` | lit | 246 / 253 | `AreYouSure` | 0 | 0 | options: `dlgOptions_Audio` |
| `dlgOptions_Video.rdr` `OnVideoBack` | lit | 246 / 253 | `AreYouSure` | 0 | 0 | options: `dlgOptions_Video` |
| `dlgOptions_Video.rdr` `video_dtv` | 721 | 246 / 253 | `AreYouSure` | 0 | 0 | options: `dlgOptions_Video` |
| `dlgOptions_Video.rdr` `video_dtv` | 722, 723 | 226 | `AreYouSure` | 0 | 0 | options: `dlgOptions_Video` |
| `dlgScreenAdjust.rdr` `leave_screen_no_save` | lit | 246 / 253 | `exit_adjust` | 0 | 0 | options: `dlgScreenAdjust` |
| `dlgControllerSelection.rdr` `OnContSelectBack` | lit | 246 / 253 | `AreYouSure` | 0 | 0 | options: `dlgControllerSelection` |
| `dlgControllerPresets.rdr` `check_then_save_and_leave` | 161 | lit | `SitHere` | 0 | 0 | options: `dlgControllerPresets` |
| `Common_Brief_Anims.rdr` `UiBackWhere` | 889 | 590 / 589 | `AreYouSure` | 0 | 0 | campaign only: the twelve `dlg_Brief_*` (R1: not built) |
| `ShowAndSpin.rdr` `OnEquipWeaponBtnDefault` | 1245 | 246 / 253 | `AreYouSure` | 0 | 0 | campaign `dlg_equipment_main` (R1); online `dlg_equipment_mp` |

That is **75 records**, **73 outside the campaign-only two**; the extras dialogs reach none. Keyed by set, animation,
sequence and text id they are 68 keys (66 outside the campaign): a key folds the literal-text records (id 0) of one
sequence together -- `load_initial_config`'s four into one, `DisplayHDDError`'s three, `AskToLoadData`'s two and
`do_onstart`'s two. Keyed with a literal's name index in place of the id, all 75 stay distinct. A count of the
offline popups is the 75. The LOAD GAME rows are the campaign's under R1 (LOAD GAME goes to the desktop screen), so
the offline front end the port builds raises the rest: the card and boot checks, the options' leave prompts and the
video and disk questions.

**Reached from no READERC binding** (60 records, 50 keys; the key here takes the archive, an animation and a sequence
by index as below -- 41 without the archive, 42 with it but by name, the only count of this section that moves): the `INPUT_STRING` popups `OnSystemMessage` and
`OnMultiplayerDisconnect` in `UIanim.rdr`'s EXTZANIM and MPZANIM copies (the UIZANIM ones are reached, from the online
dialogs) and in the four READERX-named dialogs' sets (started by code events or by those dialogs, which the walk does
not open), `UIanim.rdr` `intro_onstart`'s EXTZANIM / MPZANIM copies and the READERX sets' own `intro_onstart`,
`UIMemCardAnim.rdr` `NoSOCOMDataFound` (844, 845) and `VerifyNoSave` (852), `dlgIntroScreen.rdr`'s E3 copies,
`dlgMenu.rdr` `CallMissionSelection`, `dlgSelectRank.rdr` `PopupTester` (509, TRIANGLE-enabled), and four online
ones (`dlgManageRosterLeader` 505 / 506, `dlgNetConnect` 546, `dlgDownloadPatch` `OnMemcardStatus`'s three). The other
150 records (144 keys) are reached only from online or code dialogs (research 96's online and code classes; ONL-33's
chapter): 75 + 150 + 60 = 285.

**Regenerating it.** The probes were throwaway scripts outside the tree; the walk is `tools/dialogInventory.ts`'s
(`scriptLibrary`, `bindingsOf`, `resolveSets`' order) with `decodeUiProgram` over each reached animation, keeping the
`POPUP` commands (`command.node === 'POPUP'`; the record is `command.extra`) and the `PopUpDialog` / `KillPopUp` calls
(`command.fn`, matched without case). A sequence and an animation are counted by their index in their parent (two
animations of one set may share a name, as may two sequences of one animation). PLAT-16's dev-disc test is the place
to pin the counts above: records (75 offline), with the key named wherever a distinct count is pinned (archive, set,
animation index, sequence index, text id: 68 offline, 144 online / code, 50 unreached).

## 8. The captures

No PCSX2 capture of a front-end popup is archived; the four sets below are of the **recompiled game** (MISSION's
source 4), which runs the original's code. The gate's `ref_popup_prompt_ours.png` and the
`D:/socom_archive/parity/s5_t2_death*/popup_*.png` frames are the in-mission objective popup ("PRESS X TO CONTINUE",
the HUD's), not this component.

1. **The logoff** -- `C:/Projects/socom_pc/logs/parity/s17_q0/online1/20_then_01_triangle.png` (TRIANGLE in the
   lobby) and `20_then_02_left.png` (LEFT), PC research 78 run `online1`. Popup 793. Confirms: the panel at (150,
   180), 340 x 130, to the pixel; its interior one colour over a varying lobby (opaque); the text from x 175 (the
   record's +28 = 25), tops at 202 / 222 / 242 (the +24 = 45, the -3, the pitch 20), wrapped inside 290; NO (button
   1) focused at open, YES after LEFT; the focused box `active_back.tif`'s teal, the normal `pop_butt.tif`'s dark;
   the normal label near white (202, 203, 203), the focused label gold (94, 92, 57) and (126, 107, 58) in the two
   frames; the dialog behind at 0.25-0.30 of its level (the script's `MENUFADER` 0.7).
2. **The controller presets' save prompt** -- `C:/Projects/socom_pc/scripts/parity/ref_save_prompt_ours.png` (the PC
   gate's pinned reference). Popup 831 (`UIMemCardAnim.rdr` `save_and_leave`, from `dlgControllerPresets*`).
   Confirms: the one record at (155, 180), 350 x 120, to the pixel; the text's tops at 197 / 217 (+24 = 40); **YES,
   button 1 of this record, focused at open** -- the default is the first slot, whatever its label.
3. **The briefing's leave popup** -- `C:/Projects/socom_pc/logs/parity/s17_q0/mission/s16_none.png` (and the sheet
   `sheet_exit.png`). Popup 889 (`Common_Brief_Anims.rdr` `UiBackWhere`, campaign). Confirms: the panel at (140, 180),
   340 x 120; the **centred** buttons (bx 70 and 260, bw 80) drawn at 170..249 and 360..439, their labels centred on
   210 and 400; NO (button 1) focused; no dimming (the script has no fader).
4. **The in-game abort prompt** -- `C:/Projects/socom_pc/logs/parity/s17_q0/sheet_ingame2.png`: a different
   component (centred text, a narrower panel; the pause menu's), not the POPUP record. Not read here.

## 9. What this changes in sprint 5's reading (for PLAT-34, W9.R7)

`packages/viewer/src/armoryLayout.ts` `decodePopup` and the frame's popup block, and `armoryState.ts`, read the
ARMORY's two records (1245 and 47) before this note. Not edited here (W9.R7); PLAT-34 applies:

| sprint 5 (`armoryLayout.ts` L279-321, L437-456; `armoryState.ts` L93-98) | the original |
|---|---|
| +24 the text's x offset, +28 its y | **+28 x, +24 y** (D:L266852-266853, D:L268447-268448; capture §8.1) |
| the wrap w - 2 x (+24) | w - 2 x (+28) (D:L267148) |
| the first line at y + (+24), `POPUP_LINE_PITCH` 19 | the pen at y + (+24) - 3, the pitch **20** (D:L273144, D:L268382; capture) |
| the panel `popupop.tif` at `POPUP_PANEL_OPACITY` 0.85 (or `backsolid.tif`) | the record's bitmap (`popupOp.tif`), **opaque** (capture §8.1, §8.2) |
| +66 "the button the popup opens on" (1: YES); `ARMORY_POPUP_FOCUS_READING` = `'yes'` | +66 = **has buttons**; the popup opens on **button 1**, which in 1245 is **NO** (246) (D:L267136-267137) |
| buttons found by the tag bytes 7 8 8 0 | +68/+69/+70 are the three bitmaps' name indices (the same in both ARMORY sets by chance); the two slots are fixed at +68 and +144, read when +66 is set |
| the focused button `brown_back_real.tif` at 0.7, the others `backsolid.tif` at 0.35 | the slot's focused bitmap (`active_back.tif`) and normal bitmap (`pop_butt.tif`), opaque |
| the label in `rgb[1]` when focused, `rgb[0]` when not | **`rgb[0]` (+32) focused, `rgb[1]` (+44) normal**, `rgb[2]` (+56) pressed (0.2 s) |
| `ARMORY_CONFIRM_VALUE_READING`: YES 2, NO 1 | confirmed: CROSS writes the focused slot's number (D:L268488-268496) and YES is slot 2 |
| research 95 §1.2: "the button records follow" the text id | the full record, §2 |

The ARMORY's TRIANGLE inside the popup answers nothing (1245's +64 is 0): sprint 5's "Triangle in the popup answers NO
[inferred]" is not the original.

## 10. What is not known, and what would settle it

- **The focused label's pulse**: the flag and 0.5 / 1.0 / 0.5 the focused state stores (D:L266914-266917) and how the
  button's update uses them (`FUN_0036e790`'s fields; the update slot +0x38 `FUN_003723b0` not read). Settled by a
  5-fps capture of a popup held still, or a read of `FUN_003723b0` (`POPUP_FOCUS_PULSE_READING`).
- **The label colour's blend**: the focused label measures (94..126, 92..107, 57..58) against the record's (91, 72,
  36); the font's own colour and the GS blend give it, not read.
- **The text scale word** +32 (the text object's +0x40): 1.0 everywhere, its use not read (`POPUP_TEXT_SCALE_READING`).
- **`SuspendMenuInput` and the popup** (§5, `POPUP_SUSPEND_READING`).
- **The stale focus after a buttonless record** (§4, `POPUP_STALE_FOCUS_READING`): LEFT/RIGHT on a buttonless popup
  that follows a two-button one would toggle unseen slots and play `SELECTION`; read from the lines, not seen.
- **The event values**: the popup tests each event byte for 1 (a press); where the bytes are filled and whether the
  stick's directions set +3 / +4 was not read.
- **The font**: the menu's +0x210 (the popup's +0x300) -- which face of the dialog it is was not traced.
- **The popup's +0x32c delegate**: when set, it takes the draw, the update and the input (D:L268455-268457,
  D:L268469-268471, D:L268545-268547); nothing found writes it but its zeroing (D:L126924, D:L267145).
- **The proven level**: PCSX2 frames of each offline popup (OPT-19's window, PLAT-31's manifest) and PLAT-36's trace
  of `PopUpDialog` / `KillPopUp` order; the four captures here are recompiled-game frames.

## 11. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `ARMORY_POPUP_LAYOUT_READING` (`packages/viewer/src/armoryLayout.ts`, sprint 5) | the popup record past its text id and its layout | settled by this note (§2, §3; captures §8); its five corrections are §9's, for PLAT-34 to apply (W9.R7) | open in the code until PLAT-34; resolved in research |
| `ARMORY_POPUP_FOCUS_READING` (`packages/viewer/src/armoryState.ts`, sprint 5) | the button the ARMORY's confirm opens on | read as YES from +66; the original opens on button 1, NO (§4, §9) | open in the code until PLAT-34; answered (wrong) in research |
| `ARMORY_CONFIRM_VALUE_READING` (`packages/viewer/src/armoryState.ts`, sprint 5) | which button writes `AreYouSure` 1 or 2 | confirmed: CROSS writes the focused slot's number; NO is slot 1, YES slot 2 (D:L268488-268496) | open in the code until PLAT-34; confirmed in research |
| `POPUP_FOCUS_PULSE_READING` | the focused label's pulse | the focused state's flag and 0.5 / 1.0 / 0.5 (D:L266914-266917) are a TEXT_GLOW: bottom 0.5, top 1.0, period 0.5 (`FUN_003773f0`'s state +0x10 / +0x14 / +0x20; §12.2) | resolved 2026-10-02 by PLAT-16 (`POPUP_FOCUS_GLOW`) |
| `POPUP_TEXT_SCALE_READING` | the record's +32 | the text object's +0x40, 1.0 by default and on all 285 records; reading: the text's scale | open: `packages/ui/src/popup/popup.ts` (PLAT-16) |
| `POPUP_SUSPEND_READING` | whether `SuspendMenuInput` silences a popup | the menu's input runs only when +0x900 is spent (D:L262262-262269); the link from 0x408538 not traced; reading: it does | *note only* |
| `POPUP_STALE_FOCUS_READING` | LEFT/RIGHT on a popup without buttons | the answer and the widths are kept from the last record with buttons (D:L266856-266863); reading: as the lines say, a sound and an unseen toggle | open: `packages/ui/src/popup/popup.ts` (PLAT-16) |
| `POPUP_FONT_READING` (added 2026-10-02, PLAT-16) | the face the popup's text and labels draw in | the popup's +0x300 points at the menu's +0x210 (D:L263670-263672), set on the text and both labels by `FUN_00370610` (D:L268377-268379); what fills +0x210 (`FUN_0038dea0`) not traced; reading: the dialog's `FONT` | open: `packages/ui/src/popup/popup.ts` (PLAT-16) |

## 12. The implementation, and what it read past this note (PLAT-16, 2026-10-02)

Added 2026-10-02 by PLAT-16's implementer (reading level, pending review). The component is
`packages/ui/src/popup/` (`record.ts` the record, `popup.ts` the popup); its tests are
`packages/ui/test/popup/popup.test.ts` (transcription units) and `packages/ui/test/popup/popupDisc.test.ts` (dev disc).
Every line this section cites was re-read at the source; four findings extend or correct the sections above.

### 12.1 What the component is

- `readPopupRecord` reads §2's table whole (both slots; +68 "centred" only when the byte equals 1, D:L267003).
- `Popup` is the object of §1: made hidden per menu (`FUN_0027f190`), `show` is PopUpDialog's half
  (`FUN_0027eff0` D:L126894-126900: the node shown, `.METAL`), `command` is `FUN_0036da20` in its order, `input` is
  `FUN_00370990` (CROSS, then TRIANGLE, then LEFT / RIGHT, each its own test), `tick` is `FUN_00370920`, `draw` is
  `FUN_00370690` (panel, buttons when there is a valve, text). `killPopUp` is `FUN_0027d190`; `routePopupInput` is the
  head of the menu's input `FUN_00368650` (D:L263850-263855). The buttons are PLAT-15's `ButtonWidget` (`C2DButton`,
  vtable 0x407790), their states written from the slots.
- The valve is written through the store's `=` (watchers on a change, event 1 or 2), which is what D:L268488-268499
  and D:L268515-268519 do by hand.

### 12.2 Findings past §1-§11

1. **The focused label glows** (settles `POPUP_FOCUS_PULSE_READING`). The focused state's block is built with +0x10 =
   0.5, +0x14 = 1.0, +0x18 = 1, +0x1c = 0, +0x20 = 0.5 (D:L266914-266917 and the stores at D:L266918-266926). The state
   apply `FUN_003773f0` (D:L271967-272000) copies +0x20 to the label's +0x78 (the period), +0x14 to +0x7c (the top),
   +0x10 to +0x80 (the bottom) and +0x18 to +0x84 (the flag) -- research 111's TEXT_GLOW fields. So the focused label's
   alpha runs (0.5 + sin(phase / 0.5 x 3.14) x 0.5) x 128, 64 to 128 and back over 1 s, by the button's tick
   `FUN_003723b0` (PLAT-13's `stepGlow`). The normal and pressed states carry the flag 0: steady at 100. The two shades
   of §8.1 fit; the curve against a 5-fps capture is owed to OPT-19 with PLAT-15's.
2. **An empty text changes nothing** (corrects §4 and §6's "the text set empty"). The text's setter `FUN_00379f70`
   returns at once when its text is null or its first byte is 0 (D:L273439). CROSS's and TRIANGLE's close pass ""
   (0x3f9220) and so leave the lines as they are; a record whose text is null or empty (an id the tables lack, a name
   index past the table, `INPUT_STRING` with no input string) keeps the last record's lines.
3. **The text's colour lags one record** (new). The record's colour (+36..+44) is written to the text object's
   +0x48..+0x50 after the setter (D:L267149 the setter, D:L267151-267155 the colour), and the setter makes each line in
   the object's colour of that moment (`FUN_00379f70`, research 111 §5). The object starts at 255, 255, 255
   (`FUN_0037a770` D:L273681-273683; `FUN_00370610` does not touch it), so **the first popup of each menu draws its
   text at 255** and every later one at the previous record's colour -- 128 on the disc, since all 285 records hold
   128. On the PS2 a vertex colour of 255 is about twice the texture's brightness; whether the first popup's text in a
   capture is brighter than the next one's is a check for OPT-19 (it fits §8.1's near-white text but was not measured).
   *(Measured 2026-10-05, ONL-07, research 157 §8: it is not. `A_41` (#606, the persona form's first popup) and
   `A_42` (#831, its second) peak at the same 191 of 255. And the lines' alpha was misread: the setter gives each line
   node the object's font through `FUN_00362b20` (D:L273492), which rewrites an alpha of 128 to the face's opacity x
   128 -- so a popup's text draws at 0.7 like every text, where the port drew it at 128, white. `POPUP_TEXT_ALPHA`'s
   doc carries the correction; the lag of the colour stands and is invisible at that alpha.)*
4. **The panel's colour is read** (closes §3's "its default; not read"). The base `FUN_0020cd50` (D:L65834-65852)
   sets the quad's colour to 128 thrice and its alpha to 128, and its image name (+0x84) to none, so the draw's
   name-refresh branch (D:L268418-268433) never runs: the panel is `popupOp.tif` at 128 / 128, opaque, as §8 measured.
   The walk's fade reaches the panel only: the popup's vtable +0x34 is 0x364860, the 2D object's alpha setter (read in
   the ELF at 0x4073d4), while the buttons' is `jr ra` (PLAT-15) and the text's lines are their own nodes at 128
   (`FUN_00363e70` D:L261476).
5. Smaller reads: the popup's text object's vtable +0xa0, called after the setter (D:L267150) and at the menu's load
   (D:L268383), is 0x37a630 = `jr ra` (read in the ELF); the text the constructor sets (0x3ef8d0) is ""; the label's
   pointer (button +0x18) is written whether or not the label resolves (D:L266864-266870), so a slot without a label
   draws none -- every hidden button on the disc has label id 0 and a name index past its table (the dev-disc test);
   the answer (+0x334) is not written by the constructor, but every reader before the first record with buttons is
   gated by the valve (null) or a width (0, `FUN_00377800` D:L272189-272190), so its first value is never seen.

### 12.3 What it settles for the ARMORY (W9.R7; PLAT-34 applies it, `armoryLayout.ts` is not edited here)

`ARMORY_POPUP_LAYOUT_READING` (`packages/viewer/src/armoryLayout.ts:312`) is settled by §2-§3 and §9, now unit-pinned
by `popup.test.ts` and pinned on the disc's own logoff record by `popupDisc.test.ts` (panel 150..489 x 180..309, NO
375..424 x 270..294, YES 215..264, the text's first pen (175, 222), pitch 20). PLAT-34 takes §9's corrections plus two
from §12.2: the focused label glows (finding 1) and the text's lines take the colour held before the record (finding
3). `ARMORY_POPUP_FOCUS_READING` stays answered (wrong: the confirm opens on NO, button 1) and
`ARMORY_CONFIRM_VALUE_READING` confirmed. The simplest form of PLAT-34's change is to hold this component in place of
`popupOf`.

### 12.4 The tallies, pinned on the disc

`popupDisc.test.ts` pins every count of §0 and §2 it can reach without the dialog walk: 285 records (UIZANIM 240,
EXTZANIM 15, MPZANIM 30), all op 0 and 220 bytes; 252 `PopUpDialog` (207, 15, 30) and 48 `KillPopUp` (UIZANIM only);
`popupOp.tif`, scale 1.0 and colour 128 on all 285; 213 with buttons, 54 keep (30 without buttons), 5 TRIANGLE; 114
literal texts, 36 of them `INPUT_STRING`; 72 records with button 1 hidden, 83 with one button, 58 with two; 199
present buttons, every one 25 high with `active_back.tif` / `pop_butt.tif` / `pop_butt.tif` and the colours (91, 72,
36), (128, 128, 128), (102, 87, 38); label scale 0.9 on 189 and 1.0 on 10; 23 centred; tdy 25 / 24 / 26 on 188 / 10
/ 1; of the 58 two-button records 36 are (246, 253) and 11 (253, 246), button 1 the right-hand one in 40. All agree
with §2, §4 and §7. The offline 75 (§7) need the dialog walk and are not pinned here.

### 12.5 What is owed (W9.R8)

- **Scored:** none. The four captures of §8 are the recompiled game's; no PCSX2 frame of a front-end popup is
  archived, so each popup's score >= 90 is **owed to OPT-19** (offline) and **ONL-32** (online), the manifest's rows
  (PLAT-31) to be named there; the logoff layout above is checked against §8.1's measured numbers, not scored.
- **The PopUpDialog / KillPopUp order** against the recompiled game's call trace is **owed to PLAT-36**.
- **The connection:** PLAT-10 holds the popup in its overlay slot; the entry points are `new Popup(ctx)` at the menu's
  load, `popup.show(host)` for `PopUpDialog`, `popup.command(cmd)` as the node handler of `POPUP` (any op), `popup.tick`
  every frame, `routePopupInput` at the head of the menu's input, `popup.draw(opacity)` as the last node after
  `MENUFADER`, `killPopUp(popup)` for `KillPopUp` and the menu's teardown dropping the object. *[Connected 2026-10-02 by sprint
  9's connecting lines (S9-WIRE; research 115 §16.1): the page's front end holds `SlotPopup` (this `Popup` wrapped as
  M's object) in PLAT-10's slot, made per build in that dialog's context; `popup.command` is the `POPUP` node's handler;
  `popup.tick` runs on A6; `drawIn` draws it last at the node's place. `popup.show` is not called: PopUpDialog's two
  effects are the shell's (`MenuShell.popUp` shows the node and plays `.METAL` once, `FUN_0027eff0` D:L126894-126900),
  and the node is the one visibility both read. `routePopupInput` is reached through `SlotPopup.input`, which PLAT-11
  calls at the head of the menu's input.]*
