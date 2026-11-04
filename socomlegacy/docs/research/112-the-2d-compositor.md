# 112 -- The 2D compositor: the menu's two planes, the walk that draws them, the quad, the opacity stack, the movie layer (web sprint 7, PLAT-14)

Written 2026-10-02 for PLAT-14 (the block is `../roadmap/01-platform.md` "PLAT-14"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line), the retail
ELF `game/disc/socom2_game.elf` (strings, vtables and floats read by address through its program headers: virtual
address = file offset + 0x110a00 past 0x1e7000; `CMenuState`'s Tick 0x1f4640, which the decompiler did not emit, read
from its instructions), the disc's `RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR`, `RUN/READERC.ZAR/fonts.rdr`, the UI
texture libraries and the LOC archives, read with `@s2u/archive`, `@s2u/scene` and `@s2u/ui` (PLAT-05's loader,
PLAT-13's text). Names, counts and short constants only: no disc bytes, no decompiled text. Research 115 (PLAT-10's,
the screen manager) read the screen's build and its fader; this note reads the draw.

The code is `packages/ui/src/compositor/` (`frame.ts`, `scene.ts`, `dialogScreen.ts`, `movieLayer.ts`, `drawList.ts`),
exported from `@s2u/ui` as data the viewer draws (W7.R3), and its one viewer file `packages/viewer/src/uiCompositorView.ts`
(the drawer). The CI tests are `packages/ui/test/compositor/compositor.test.ts` and
`packages/viewer/test/uiCompositorView.test.ts`; the dev-disc tests `packages/ui/test/compositor/compositorDisc.test.ts`
and `tools/test/uiCompositorScore.test.ts` (the scores).

## 0. Answers

| # | finding | section |
|---|---|---|
| R112.1 | **The draw order is the tree's order, not a z field** (the block's unknown). The 2D pass walks a plane depth first -- a visible node's adaptors, then its children in their vector's order (`FUN_00336a60` D:L235063-235110) -- with the renderer's flag +0x711 set, under which every adaptor draws at once (`FUN_003374c0` D:L235373+): nothing is deferred to the depth-sorted list. A child is appended to that vector (`FUN_00315f40` D:L215327-215365), so a dialog draws in the order its nodes were added. The one z in the screen is the foreplane's 65534 (`DAT_004a44e0` - 1, D:L264668; `DAT_004a44e0` = 65535.0, D:L305298), which agrees with the foreplane drawing last | §3 |
| R112.2 | **Two planes, drawn apart, the 3D between them.** CMenuState's Tick draws the backplane (G+0xc4: the background, then every control with its subordinates, then every object) at 0x1f4700-0x1f4734, then the models' 3D pass, then the foreplane (G+0xc8: MENUFADER, then POPUP) through `FUN_00369170` (D:L264251-264259). Research 115's "controls and objects on the foreplane" is contradicted: `Add2dNode`'s fallback parent is G+0xc4 (D:L264467-264468). Research 95's `UI_MODEL_DRAW_ORDER_READING` (the preview after the objects, under the fader and the popup) is so by source | §2, §3 |
| R112.3 | **Opacity is inherited, multiplied.** A node under 127/128 pushes its opacity times the stack's top (`FUN_00336a10` D:L235048-235058, `FUN_00336980` D:L235028-235043); the 2D adaptor (`FUN_0036d8b0` D:L266729-266747) then SETS the object's alpha to f x 128 when f < 1 (0.99 drawn as 128) and leaves it alone when f >= 1 -- so a fade's last alpha stays. Research 95's `CHILD_OPACITY_INHERIT_READING` ("an object's opacity is its own") is contradicted | §4 |
| R112.4 | **A 2D bitmap stands upright by its texture corners.** Every quad samples S 0.01 .. 0.99 across and T -0.01 .. -0.99 down (`FUN_00364c50` D:L262025-262030; the setter `FUN_00364830` negates T too, D:L261813-261816): with the texture repeating (`UV_REPEAT_READING`), the quad's top samples the stored texture's last rows -- the image's top, since 2D bitmaps are stored bottom row first (research 95 §5.2). The 1% inset on every side is the source's, not a fit | §1 |
| R112.5 | **The fader is a black 640 x 448 quad whose alpha is MENUFADER's opacity, an input.** No clock in the package: the switch's code and the scripts write the node's opacity (research 115 §3, §5), the walk turns it into the alpha. A dialog opens with it clear (D:L263689-263691) only when nothing set `DAT_0049eaa0`: neither its own `ANIMATIONS` nor a widget's own list (§2 steps 2, 4 and 7) | §4 |
| R112.6 | **The movie layer is the bottom of the frame**, under the backplane (research 121 R121.10); `MovieLayer` holds the last picture its writer presented (`MOVIE_HOLD_READING`) and is black before one. PLAT-21's player writes it through `MovieLayerSink` (`present`, `clear`); PLAT-19b supplies the player's pictures and never writes it | §5 |
| R112.7 | **The scored items run** (PLAT-30's scorer is in this base, W7.R6): dlgMenu as built (no script run, no BUTTON rows, the movie black) scores **95.8** against `main_menu.png` (control 60.2), **98.1** on the logo with the rest masked; dlgCreateGame's title band scores **98.0** against PCSX2's with the 4:3 correction (88.2 without; control 75.2) and **97.8** against the recompiled game's. The block's bar -- a full-screen PCSX2 menu frame >= 90, 4:3 corrected -- is met by the console's full main-menu frame (`scripts/parity/ref_main_menu_ours.pcsx2.png`, 640 x 448): **97.1** corrected (94.9 without; control 63.8), a score that, like the 95.8, does not see the undrawn rows (§7). The owner's ARMORY captures are not on this host: owed | §7 |

## 1. The quad (`FUN_00364c50` D:L262007-262051)

Every 2D bitmap, the background, the fader and a text's caption box share one object: the 2D quad (base
`FUN_00365100` D:L262184-262204). Its fields: the rectangle +0x24 x, +0x28 y, +0x74 w, +0x78 h (ints, set by
`FUN_003646d0` D:L261746-261769 as corners and stored as a size); the corner colours +0x30 and +0x40 (128.0 each:
the GS's 1.0); the alpha +0x3c (128.0 through vtable +0x34); the texture corners +0x50 (S0, T0) and +0x60 (S1, T1),
Q 1.0; the texture +0x70. Its flags +0x14: bit 6 drawn, bit 3 textured (set by the base, cleared by vtable +0x20,
`FUN_00364bf0` D:L261989-262005), bit 2 alpha-blended (vtable +0x28, `FUN_00364b50` D:L261971-261987). The GIF PRIM
is SPRITE (6) with TME and ABE from those flags (`FUN_00364d60` D:L262053-262073).

The draw (`FUN_00364950` D:L261897-261932): a textured quad without a texture is not drawn (and loses bit 0); else
`FUN_003643b0` (D:L261637-261708) sends one SPRITE of two vertices, each with its ST, its colour and its XYZ: the
corners (x, y) and (x + w, y + h) through the current matrix (`FUN_00308640`) and then the frame's mapping
(`DAT_0049ea00` + x `DAT_0049e9f0`: research 111 §3.3's 640 / 640 and 1.0). So a quad is placed by its node's matrix
-- a child relative to its parent (research 95 §2.1) -- and scaled with it (`NODE_MATRIX_READING`).

The texture corners (R112.4): S0 = 0.01, T0 = -0.01, S1 = 0.99, T1 = -0.99. `stToImage` turns them into the upright
image's 0.01 .. 0.99 both ways. On a 128-row bitmap the inset is 1.3 texels a side; on a 256-wide one 2.6 -- part of
why the ARMORY's gold frame (`ACT_FRAME_BORDER_READING`, research 95) drew wider than the console's is now a sourced
candidate, not settled here.

**The IMAGE** (`FUN_00382ff0` D:L278129-278185, `FUN_00379080` D:L272917-272946): a quad of `SIZE` at the node's
origin, its texture the bitmap `FILENAME` names -- or, with a `UIVAR`, the variable's string, re-read at each draw
(`FUN_00379160` D:L272948-272971). `PULSE` sets +0x88 and the period +0x8c; the tick `FUN_00378fc0`
(D:L272892-272914) moves the phase by dt / PULSE x 2 pi (wrapped) and sets the alpha to sin(phase) x 64 + 64
(`stepImagePulse`, dt the caller's).

## 2. The tree (`CGameMenu`, `FUN_00369b60` D:L264593-264680; the build `FUN_00367950` D:L263398-263775)

The screen is a node with two children, appended in this order: the backplane (+0xc4, named "CGameMenu backplane",
0x3f8e20) and the foreplane (+0xc8, "CGameMenu foreplane", 0x3f8e40; positioned at z 65534). The fader quad (+0x170)
is made black, untextured, alpha 128, 640 x 448 at the origin (D:L264670-264673).

The build, in its order (`buildDialogScreen`; research 115 §4.3 reads the same function for the manager):

1. The background, when the type is IMAGE and the bitmap is found: `FUN_003646d0(0, 0, 640, 448, G+0xd0, tex)`, its node
   (`Add2dNode`, unnamed) appended to the **backplane** (D:L263541-263579). A movie background makes no node.
2. The event records (D:L263580-263611): one per `ANIMATIONS` binding; any at all sets `DAT_0049eaa0` (D:L263607; the flag
   is cleared at D:L264676 and D:L264348).
3. MENUFADER: the fader quad's node appended to the **foreplane** (D:L263612-263626).
4. Every control (`FUN_003696d0`), then its subordinates (the control's vtable +0x1c / +0x20 / +0x18); then every
   object (D:L263627-263659). A widget's constructor, run by `Add2dNode`'s factory (D:L264444), sets `DAT_0049eaa0` too
   when the widget's own `ANIMATIONS` is not empty: a button's `FUN_00376bd0` (D:L271713-271716; BUTTON via D:L276671,
   CHECKBOX D:L275465, SLIDERBAR D:L275791, RADIOSTRIP D:L280459, HANDLERBUTTON D:L280874), LISTBOX's `FUN_00375e20`
   (D:L271190-271192, via D:L275863), MAPCONTROL's `FUN_0036d140` (D:L266510-266512, via D:L275093). The dialog-level
   lookup is depth-first (`FUN_0032f0e0`), so a dialog with no list of its own already reads the first widget's as its
   own; the widget rule decides only when the first list found is empty and a later widget's is not. On the disc's 114
   dialogs both rules give the same fader.
5. The subclass's hook; `FUN_00366730`; MENUFADER removed and appended again (D:L263660-263665).
6. The 3D hook; the popup object wrapped as the node `POPUP`, appended to the **foreplane**, hidden (D:L263666-263688).
7. `DAT_0049eaa0` still 0 (no event records and no widget list, steps 2 and 4): the fader's alpha 0 (D:L263689-263691).

`Add2dNode` (`FUN_003696d0` D:L264427-264492): the widget object from its spec (vtable +0x10), then its parent -- the
node the record's `CHILDOF` names, searched in the whole screen (`FUN_00315d00` D:L215253-215290: the children by name,
`strcmp`, then each child's search in turn), else G+0xc4. The node (`FUN_00312c20` "Add2dNode", an adaptor
`FUN_00370160` D:L268212-268222 wrapping the object, `FUN_003164e0` D:L215505-215532) is appended to that parent, placed
at (`XPOS`, `YPOS`, 0) (`FUN_003157d0` D:L215063-215073), its opacity +0x9c the record's `OPACITY`, its name the
record's. A `CHILDOF` naming a node not yet made -- a later object, or the record itself (`dlgOptions_Menu`'s
`HDDOnOff`) -- finds nothing, and the node goes on the backplane.

### 2.3 Research 115's planes

Research 115 §1.2 and §4.3 put the controls and objects on the foreplane with MENUFADER and POPUP, and its "Draw order"
line reads "controls, objects, MENUFADER, then POPUP" on one plane. The draw order it gives is right; the plane is not:
`Add2dNode` falls back to +0xc4, and the Tick draws +0xc4 apart from +0xc8 with the 3D pass between them (§3). The
difference shows where research 115 §4.1 hides "the backplane" for three frames of a switch: that hides the whole
dialog -- its background and every widget -- behind the opaque fader, not the background alone.

## 3. The walk and the order

CMenuState's Tick (0x1f4640, research 115 §7), read from its instructions: after G's tick and the system messages it
stores G+0xc4 at the renderer's +0x630 (0x488df0), sets +0x711 (0x488ed1) to 1, and calls `FUN_00336c10(0x4887c0,
G+0xc4)` (0x1f4700-0x1f4734); then the 3D scene when a model is set; then `FUN_00369170` (0x1f47d8), the same for G+0xc8.

`FUN_00336c10` (D:L235111-235123) pushes an identity matrix and calls `FUN_00336a60` (D:L235063-235110): a node whose
+0x5c bit 0 is clear is passed over with everything under it; otherwise its matrix is pushed (`FUN_00307fa0`), its
opacity maybe pushed (§4), its adaptors drawn (`FUN_003374c0` when it has any, +0x88), then each child in the vector's
order (+0x70, +0x6c), recursively. In `FUN_003374c0` an adaptor draws at once -- its vtable +0xc with the matrix --
when +0x711 is set (or the camera node's flag, or +0x714, or it is opaque); otherwise it is queued by depth
(`FUN_003371b0`, the sorted insert `FUN_00336f60`). The UI pass sets +0x711, so none is queued.

The draw list (`composeScreen`) is that order: a black clear (`FRAME_CLEAR_READING`), the movie layer (§5), the
backplane's walk, a `models` item where the 3D pass stands, the foreplane's walk. dlgMenu's (dev disc):

`clear movie widget:new_game_button widget:load_game_button widget:multiplayer_button widget:options_button
widget:Extras_button widget:LAN_button sprite:LoadGameBack sprite:SplashLogo glyphs:LEGALEZE glyphs:LEGALEZE1
sprite:arrow_up sprite:arrow_dwn widget:SavedGames glyphs:SavedGameWarning glyphs:InfoTextT glyphs:InfoTextX models
sprite:MENUFADER` -- the hidden POPUP draws nothing; the `VERSION` text (a UIVAR) has no caption until the runtime sets
one.

**Popups (PLAT-16)**: the `POPUP` node is the foreplane's last child, so whatever PLAT-16 hangs under it, or puts in its
content, draws over the dialog and the fader. **Widgets (PLAT-15)**: a control this package does not draw comes out as
a `widget` item at its node's place in the order, with the opacity the walk carries there; PLAT-15 draws it through the
same primitives -- a `sprite` (a quad: texture, rectangle, ST, colour, alpha) and `glyphs` (PLAT-13's quads), each with
an optional scissor -- by giving the node a `group` content of sprites and texts, or by drawing the item itself.

## 4. Opacity and the fader

The stack (the renderer's +0x668 / +0x670): `FUN_00336a10` pushes when the node's opacity is under 0.9921875, the new
top being opacity x top (`FUN_00336980`); the walk pops after the children. Its bottom entry was not found
(`OPACITY_STACK_BASE_READING`: 1). The 2D adaptor's draw `FUN_0036d8b0` reads the top f: f < 1 -> the object's alpha is
set through vtable +0x34 to f x 128, or 128 when f is 0.99; f >= 1 -> nothing written. A text's +0x34 writes its +0x54,
which `layoutText` takes; so a TEXT whose face set its alpha to 0.7 x 128 (`FUN_00362b20` D:L260712-260723, research
111 §7.4) draws at 89 until a fade writes it, and at the fade's last value after (research 95's
`TEXT_FADE_ALPHA_READING`, "a fade ending at 1.0 draws at the face's opacity again", is not what this reads: a fade that
ends at 1.0 writes its last value under 1 and then nothing).

MENUFADER is a node like the others: its quad black, untextured, 640 x 448; the switch's code (research 115 §3 A4) and
the scripts' `OBJECT_OPACITY_FROM_TO MENUFADER` write its opacity (`setFaderOpacity`); the walk turns it into the
quad's alpha. Measured cases (CI): opacity 2/3 -> alpha 85.33 (f32), 0.99 -> 128, 0 -> 0, a new dialog with bindings
128, without 0; with only a widget's list (the dialog's own empty) 128.

## 5. The movie layer, and the two movie interfaces

`MovieLayer` (`packages/ui/src/compositor/movieLayer.ts`) is the draw side. The interface PLAT-21's player fills is
**`MovieLayerSink`**: `present(picture: MoviePicture)` -- `{ width, height, image }`, `image` opaque to `@s2u/ui` (the
viewer's canvas, bitmap or RGBA buffer) -- and `clear()`. `buildDialogScreen` takes the layer as `BuildOptions.movie`
and makes a black one when none is given; `composeScreen` reads `picture()` each frame and emits
`{ kind: 'movie', picture, x0, y0, x1, y1 }` first, black (`picture` null) until something is presented
(`MOVIE_HOLD_READING`, research 121), at the origin at its own size (`MOVIE_RECT_READING`). PLAT-21 hands its player
the screen's `movie` layer; PLAT-19b's decoder is the player's picture source and never writes the layer. A dialog has
a layer only when its background is MPEG or MPEG_LOOPING (G+0x279): 9 of the 114.

**Owed at the wiring (PLAT-10's `frontEnd.ts` line; not a defect of the layer).** PLAT-21's player takes its layer as
`MoviePictureSink<P>` (`packages/fmv/src/player.ts`). With `P` = PLAT-19b's `MovieFrame` (`{ width, height, rgba }`,
no `image`), `MovieLayer` does not type-check as that sink. The line hands the player an adapter
(`present: (f) => layer.present({ width: f.width, height: f.height, image: f })`), or the player is made with
`P = MoviePicture`. The drawer reads a picture's pixels as `Rgba` through `RasterOptions.movie`. PLAT-19b's
`MovieTexture` (`packages/viewer/src/movieTexture.ts`) holds a three.js `DataTexture`, so the callback reads the frame's
`rgba` buffer, not the texture.

## 6. The drawer (`packages/viewer/src/uiCompositorView.ts`)

`rasterizeUiDrawList(items, textures, { movie })` draws the list into a fresh 640 x 448 RGBA frame in software, as the
GS draws the 2D quads: a quad covers x0 <= x < x1 at integer pixel centres (`GS_SPRITE_COVERAGE_READING`), samples
bilinear with the texture repeating (`UI_TEXTURE_FILTER_READING`), modulates texel by colour / 128 and blends
Cd + (Cs - Cd) x alpha / 128 (`GS_MODULATE_BLEND_READING`; *since 2026-10-03 the blend is the last bound texture's
`ALPHA_1` -- this one for every UI texture but the roller's twelve, which add: research 141 §2*); an untextured quad
is its colour as it stands; a scissor
keeps both its corners. It takes bitmaps top row first (`flipRows` of the disc's), and reports what it did not draw
(the widgets, the models, a missing bitmap). `presentUiFrame(target, frame)` puts the frame on a canvas target
(`createImageData` / `putImageData`; `CanvasRenderingContext2D` fits, a test passes a fake), and `drawDialogFrame` is the
dev entry: a built screen composed, rasterised and presented in one call. Nothing in `main.ts` calls it (PLAT-10 wires
the front end, sprint 9). A three.js pass can take the RGBA frame as a `DataTexture`, as the ARMORY's does.

**Its cost, measured once (the review round, 2026-10-02; Node under vitest on the dev host, not a browser; the mean of
30 `rasterizeUiDrawList` calls on a composed list, bitmaps cached)**: dlgMenu 16.3 ms, dlgOptions_Menu 13.3 ms,
dlgCreateGame 69.2 ms per frame. The 30-per-second frame (`MOVIE_PICTURE_PERIOD_READING`, 33.4 ms) does not hold for
the heavier dialogs. The software drawer, with a closure per sample, is a reference and a scoring tool, not the page's
path as it stands. PLAT-10 measures it in the page before wiring it, and moves the quads to the GPU if it does not fit.

**Handed on.** PLAT-15: 477 `widget` items that nothing draws on the disc's 114 dialogs, of eight types -- BUTTON 298,
LISTBOX 66, CHECKBOX 42, MAPCONTROL 36, RADIOSTRIP 18, SLIDERBAR 8, COUNTER 8, PROGRESSBAR 1 (pinned in
`compositorDisc.test.ts`; COUNTER and PROGRESSBAR are objects, not buttons) -- dlgMenu's six rows among them. The `models` item is always emitted, while the Tick runs the 3D pass only when a model
is set (the `beqz` at 0x1f4774); it is a slot, and harmless. Nothing calls `stepImagePulse` yet (PLAT-12's clock) or
writes MENUFADER's opacity (`setFaderOpacity`; PLAT-10's switch and the scripts).

## 7. The acceptance, the scores, the disc

**Unit (CI)**: 25 tests in `@s2u/ui` (the quad's constants, the opacity rule and stack, the tree's add / remove /
find, the build's order and CHILDOF, the fader (a widget's own list and a subordinate's included), the movie layer, the relative positions and scale, the ST mapping,
hidden nodes and the popup's place, a text's pen and alpha, the IMAGE pulse), 10 in the viewer (coverage, blend,
upright bitmaps, texel alpha, the scissor, glyphs, the movie, the undrawn list, the presenter, the dev entry).

**Dev disc** (`compositorDisc.test.ts`): all 114 dialogs build and compose -- 4,368 nodes on their backplanes, 9 movie
layers, 94 background images; 2,320 sprite items, 947 glyph runs, 477 widget items (by type, §6). dlgMenu's and dlgOptions_Menu's
trees are pinned.

**The scored items** (W7.R6; `tools/test/uiCompositorScore.test.ts`, PLAT-30's `judge` and `letterboxBox`), with the
disc's bitmaps (the dialog's `LIBRARIES`, UIMP, the map archive's FONT) and MENUFADER at 0:

| frame | reference | correction | score | control | matched | what the frame lacks |
|---|---|---|---|---|---|---|
| dlgMenu, as built | `scripts/parity/ref_main_menu_ours.pcsx2.png` (PCSX2's 640 x 448 window, the console's lit menu) | ours squeezed into the 4:3 box | 97.1 | 63.8 | yes | ONSTART not run; the three lit rows (PLAT-15); the movie black |
| the same, uncorrected | the same | none | 94.9 | 63.8 | yes | (the correction's effect) |
| the same without `LoadGameBack` | the same | 4:3 | 80.7 | 63.8 | no | `popup_bg.tif` carries the match, as below |
| dlgMenu, as built | `scripts/parity/refs/main_menu.png` (320 x 224) | none: the scorer's grid, not a 640 x 448 window (W7.R7) | 95.8 | 60.2 | yes | ONSTART not run; the six BUTTON rows (PLAT-15); the movie black (PLAT-19b / PLAT-21) |
| dlgMenu, the logo only (the rest masked, research 108 §5) | the same | none | 98.1 | 38.2 | yes | -- |
| dlgMenu without `LoadGameBack` | the same | none | 79.4 | 60.2 | no | the full-frame `popup_bg.tif` is what stands in the movie's place above |
| dlgCreateGame's title band (20, 18)-(360, 58) | `lobby/title_create_game.pcsx2.png` (a 640 x 448 PCSX2 window's crop) | ours squeezed into the 4:3 box, 21.33 px bars | 98.0 | 75.2 | yes | -- |
| the same, uncorrected | the same | none | 88.2 | 75.2 | no | (the correction's effect) |
| the same | `lobby/title_create_game.png` (the recompiled game's) | none | 97.8 | 73.9 | yes | -- |

Read with care: the whole-frame score does not see the six BUTTON rows (95.8 with none drawn), and `main_menu.png`
carries a "Runtime Debug" label at its foot, which PCSX2 does not draw -- it reads as the recompiled game's frame. Its
control (60.2) is research 108 §4's for `ref_main_menu_ours.png`. The CREATE GAME band is the compositor's cleanest
check: the titlebar face and its drop shadow over the dialog's own bitmaps against PCSX2's pixels, and the W7.R7
correction measured on this set (88.2 -> 98.0).

**The block's bar: met by one frame, with its blind spot named.** PLAT-14's acceptance is a full-screen score >= 90
against a PCSX2 menu frame with the 4:3 correction. `main_menu.png` is full-screen but reads as the recompiled game's
frame (no correction applies), and the CREATE GAME reference is a 340 x 40 crop. The console's own lit main menu,
`scripts/parity/ref_main_menu_ours.pcsx2.png` (the per-target sibling the PC project's `drive.py` reads; pinned in its
`pins_refs.json`; research 108 §4's control 63.8), is the full PCSX2 frame: dlgMenu as built scores **97.1** against it
corrected, 94.9 without. The score does not see the three lit rows (not drawn) nor tell the black movie from the dim
oil rig behind `popup_bg.tif` (without that bitmap: 80.7, unmatched) -- the bar is met at the scorer's resolution, not
row by row; the rows are PLAT-15's to score. The owner's ARMORY frames stay owed (below).

**Owed**: the owner's `orig-armory-*.png` (research 95 §2.8) are not on this host -- the ARMORY's score through this
compositor is PLAT-34's (sprint 13) when the ARMORY joins the runtime. The main menu's frame after ONSTART (PLAT-07's
item: its runtime bound to this tree, PLAT-10) and the gate's "static dialog frame with the movie masked" (the
controller names the frame and the mask, W7.R6) wait on that binding; the CREATE GAME band above is a candidate.
PLAT-13's caption crops (research 111 §7.3: `login`, `universe`, `persona`, `eula`, `rooms`, `write_down`, `save_card`,
`card_slot`) can now run through `drawDialog` in the score test: not run here (the controller records them, research
111 §7.3).

## 8. Contradictions with earlier notes and code

- Research 115 §1.2, §4.3: the controls and objects on the foreplane -- they are on the backplane (§2.3).
- Research 95 `CHILD_OPACITY_INHERIT_READING` ("own"), and `viewer/src/armoryLayout.ts`: opacity multiplies down the
  tree under 127/128 (§4): a parent faded by a script fades its children with it.
- Research 95 `TEXT_FADE_ALPHA_READING`: the last alpha a fade writes stays (§4).
- Research 95 `UI_DRAW_ORDER_READING`: right on controls before objects and CHILDOF; MENUFADER is moved last (research
  115) and the planes are drawn apart with the 3D between (§3). `UI_MODEL_DRAW_ORDER_READING`: confirmed by the Tick.
- `viewer/src/armoryLayout.ts` maps each bitmap whole (`u0` 0 .. its width, `v0` 0 .. its height): the quads' own
  corners are 0.01 .. 0.99 (§1).

None of these files is edited here (W7.R4 keeps the ARMORY's; the notes are their tasks'); the new code follows the
source.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UV_REPEAT_READING` (`packages/ui/src/compositor/frame.ts`) | the 2D quads' texture wrap | `CLAMP_1` for the 2D packets not read; REPEAT is the reading under which T -0.01 samples the stored texture's top-of-image rows, as the ARMORY's bitmaps (proven upright against the owner's captures) need | reading |
| `OPACITY_STACK_BASE_READING` (`packages/ui/src/compositor/frame.ts`) | the opacity stack's bottom entry | the renderer 0x4887c0's +0x668[0] writer not found; 1.0 | reading |
| `MOVIE_RECT_READING` (`packages/ui/src/compositor/movieLayer.ts`) | where the movie's picture lands | the upload `FUN_0030b740` (research 121) not read for its rectangle; the origin at the picture's size (640 x 448 for the decoded movies) | reading |
| `FRAME_CLEAR_READING` (`packages/ui/src/compositor/drawList.ts`) | what the frame shows where nothing draws | the menu's clear not read; black. A background image or a movie layer covers it | reading |
| `NODE_MATRIX_READING` (`packages/ui/src/compositor/drawList.ts`) | a node's matrix | parent x translate x scale; `FUN_00307fa0` not read, no rotation | reading |
| `TEXT_PEN_READING` (`packages/ui/src/compositor/drawList.ts`) | a text's pen | the node's place, the node's scale not applied to glyphs; +0x90/+0x94's writer not traced; the ARMORY's texts stand so (research 95 §2.7-§2.8) | reading |
| `WRAPPED_LINE_ALPHA_READING` (`packages/ui/src/compositor/drawList.ts`) | a WRAPPEDTEXT line's alpha | the object's, written by the walk; how it reaches the line nodes not read | reading |
| `GS_SPRITE_COVERAGE_READING` (`packages/viewer/src/uiCompositorView.ts`) | which pixels a quad covers and where it samples | x0 <= x < x1 at integer centres; the 1/16 corners not followed | reading |
| `UI_TEXTURE_FILTER_READING` (`packages/viewer/src/uiCompositorView.ts`) | the 2D quads' texture filter | `TEX1_1` not read; bilinear, which the 1% inset suggests | reading |
| `GS_MODULATE_BLEND_READING` (`packages/viewer/src/uiCompositorView.ts`) | the quads' colour | `TEX0_1` TFX not read: MODULATE, the result clamped (`COLCLAMP` 1, the ELF's packet at 0x3e0880). *Narrowed 2026-10-03 (MENU-FADE): the blend left this reading -- `ALPHA_1` is read, the last bound texture's (research 141 §2): (Cs - Cd) x As + Cd, 0x44, for every UI texture but the main menu roller's twelve, 0x48, Cs x As + Cd; an untextured quad draws with the last bind's* | reading |
| `UI_CAMERA_READING` (research 95) | the UI camera record (the block's second unknown) | not needed by the 2D compositor: the 3D pass is a `models` item between the planes, the preview's camera is the ARMORY's (`viewer/src/armoryView.ts`) and PLAT-34's | note only (here) |
