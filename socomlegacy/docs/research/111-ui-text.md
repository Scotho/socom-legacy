# 111 -- UI text: the faces as the engine loads them, the glyph quads, TEXT_GLOW and the colour states, WRAPPEDTEXT and TELETYPE (web sprint 7, PLAT-13)

Written 2026-10-02 for PLAT-13 (the block is `../roadmap/01-platform.md` "PLAT-13"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line), the retail
ELF `game/disc/socom2_game.elf` (key strings and float constants read by address through its program headers: virtual
address = file offset + 0x110a00 for the data and the code past 0x1e7000; three functions Ghidra did not split out read
from their instructions), the disc's `RUN/READERC.ZAR/fonts.rdr`, `RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR` and the LOC
archives, read with `@s2u/archive`, `@s2u/scene` (`LocService`, PLAT-04) and `@s2u/ui` (`loadDialog`, PLAT-05). Names,
counts and short constants only: no disc bytes, no decompiled text. reCOM (`research/recom`, SOCOM 1) is cited only for
the block's TICKERTAPETEXT (§7.2).

The code is `packages/ui/src/text/` (`face.ts`, `codes.ts`, `layout.ts`, `states.ts`, `wrapped.ts`, `teletype.ts`,
`captions.ts`, `f32.ts`), exported from `@s2u/ui` as data a compositor draws (W7.R3): glyph quads in frame pixels,
texel corners and GS colours; every timed rule takes its `dt` (no clock is read; PLAT-12 owns the clock). The CI tests
are `packages/ui/test/text/*.test.ts` (each expected number worked by hand from the lines cited), the dev-disc test
`packages/ui/test/text/textDisc.test.ts`.

## 0. Answers

| # | finding | section |
|---|---|---|
| R111.1 | **TEXT_GLOW is an alpha pulse of the caption itself.** The text class's tick `FUN_00363b30` (D:L261297-261315) runs `phase += dt / 2` (wrapped by the period) and sets the alpha to `(RANGE[0] + sin(phase / TIME x 3.14) x (RANGE[1] - RANGE[0])) x 128`: from RANGE[0] up to RANGE[1] and back over 2 x TIME seconds, a half sine with the literal 3.14. No second texture or pass: the face's `glowtexture` key is read (+0x1c) and never drawn by the text path, and no face on the disc has one | §4 |
| R111.2 | **Entering any button state sets the caption's alpha to 100** (of 128), its `TEXT_COLOR` and its `SCALE`, and raises the glow only for a state that has one (`FUN_0036e790` D:L267223-267240). PRESSED lasts 0.2 s, then ACTIVE (or DISABLED when the button is disabled). On the disc 299 ACTIVE states glow: 293 at 0.5-1 over 0.5 s, 6 (dlgMenu's) at 0.3-1 over 0.8 s | §4 |
| R111.3 | **A code listed twice is one glyph** with both elements, drawn twice: the glyph map is filled through `operator[]` (`FUN_0035c3a0`), which returns the existing node, and the element vector is appended to (`FUN_0035c2c0`). `font_text_01`'s code 96 is that glyph. `@s2u/scene`'s first-wins reading is contradicted | §1.2, §8 |
| R111.4 | **The text's frame is 640 x 448, unscaled.** The corners go to the GS through `FUN_00364f30` with x factor 640/640 and y factor `DAT_004a44ac`, which the front end's video mode (`FUN_003b1200(0)`, D:L249656) sets to 1.0. The viewer's fitted 448/480 on glyph rows is contradicted | §3.3, §8 |
| R111.5 | **The character reader is found**: `FUN_0039f0c0` / `FUN_0039f160` (D:L294576-294620) decode UTF-8 (one, two or three bytes) for every text reader -- the code path research 103 §2 did not find. On the disc's LOC tables it agrees byte for byte with `decodeLocText` (no 0xC0, 0xC1 or 0xE0+ lead: dev-disc test) | §2 |
| R111.6 | **An unknown code draws a letter**: `FUN_0035a3a0` falls back to the glyph of `'A' + code % 26` (then to the map's first), so nothing is ever blank except 0x0D. Every caption of the 114 dialogs (1,555, through `LocService`: 894 table strings, 661 literals, none unresolved) lays out with no code its face lacks (dev-disc test) | §1.3, §7 |
| R111.7 | **TICKERTAPETEXT is SOCOM 1's.** Neither SOCOM II factory makes it and the ELF has no such string; the block's "TICKERTAPETEXT scrollSpeed" is reCOM's `CTickerSpec`. Nothing to build | §7.2 |
| R111.8 | **WRAPPEDTEXT's lines sit 3 rows above their row** (`- 3.0`, D:L273138), each its own text node; a word wider than WIDTH overflows rather than breaking; `#Crgb` colours the next line; a TELETYPE's lines sit on their rows (pitch only). The viewer's -5 lift on the ARMORY's WRAPPEDTEXT is contradicted | §5, §6, §8 |
| R111.9 | **A plain TEXT's line pitch is 0**: `\n` returns the pen to the node's x and does not move it down (the text class's vtable+0x88 at 0x1fe1a0 returns 0). A centred multi-line text is offset by half the SUM of its lines' widths, and its later lines start at the node's x | §3 |
| R111.10 | **The scored item is owed to PLAT-30** (W7.R6): PLAT-30's scorer is not merged in this base. The reference crops are `SOCOM_PC_ROOT/scripts/parity/refs/{login,universe,persona,eula,rooms,write_down,save_card,card_slot}.png` with their boxes and threshold 8.0 in `refs.json` there | §7.3 |

## 1. The faces (`face.ts`)

### 1.1 The face (`FUN_00359c40`, D:L255324-255480)

A dialog's face is loaded by name: the `faces` list of `fonts.rdr` (the root `FUN_0027ef60` returns), then the record
under the name. A name the file lacks leaves every lookup null: a face with no textures and no glyphs, whose text draws
nothing. Keys (strings at 0x3f8868-0x3f88f8): `texture` then `textures` (+0x10; `FUN_0032f200`, which searches the
face's own list only), `opacity` (+0x30, default 1), `scale` (+0x34, default 1), `glowtexture` (+0x1c), `charoffsets`,
`Korean` (+0x38, a Hangul composition table for 0xAC00-0xD7A3, `FUN_003599d0`), `boty` (+0x24), `topy` (+0x20),
`xspacing` (+0x28), `dropshadow` (+0x3c flag; `offset` truncated to ints +0x40/+0x44, `color` +0x48, `opacity` +0x54
default 1; its `baseline` is not read). The defaults are `FUN_0035a650`'s (D:L255847-255861).

On the disc: `font_titlebar_01` (texture `font_titlebar_01.tif`, 166 glyphs, shadow offset 3,3 opacity 0.65) and
`font_text_01` (`font_text_01.tif` and `font_special_01.tif`, 184 glyphs from 185 records, shadow offset 1,1 -- 1.5
truncated -- opacity 0.75, topy 0, boty 15); both opacity 0.7, scale 1, xspacing 0, no `glowtexture`, no `Korean`.

### 1.2 The glyphs (`FUN_0035bef0` D:L256760-256886, `FUN_0035bd80`, `FUN_0035c2c0` D:L256891-256910, `FUN_0035aa80` D:L256009-256041)

A record with `Code` (0x3f89f8) adds each `Elems` element; one without is the short form (the record's first element
the code -- an int node its value, a string its first byte, any other node 0, D:L256806-256820; `parseRdr` drops the
node types, so the port reads an integer-spelled token as an int, another number as a float, the rest as strings:
`SHORT_GLYPH_CODE_READING`, unreachable on the disc, whose 351 records all carry `Code` -- the second and third UL
and LR). The map node is fetched with `operator[]` (`FUN_0035c3a0`), so a second
record of a code appends its element to the first's and writes `texture`, `baseline`, the kerning and `color` over
(R111.3). Fields: `texture` 1-based (+0x18), `baseline` (+0x12), `lKerning` (+0x14), `rKerning` (+0x16), the advance
override +0x10 (-1, and 8 for code 0x20, D:L256869-256871; read only by the TELETYPE's append `FUN_00362e00`), `color`
(+0x1a flag, +0x20 RGB as ints, alpha 0x80). An element keeps `UL.x` (+0), the width `LR.x - UL.x` (+2), `texH - UL.y
- 1` (+4) and `texH - LR.y` (+6) -- the atlas addressed bottom row first -- so its quad is `LR.y - UL.y - 1` rows tall and
samples rows `UL.y + 1 .. LR.y - 1`; `DispPos` as ints with y stored negated (+10 = -DispPos.y); `HorScale`, `VertScale`
(default 1). The disc's faces carry no kerning.

`FUN_0035a7b0` (D:L255868-255889): a glyph's width W is the largest `int(DispPos.x + width x HorScale)` of its elements.

### 1.3 The lookup (`FUN_0035a3a0`, D:L255682-255798)

The map's glyph for the code; none for 0x0D; a Hangul syllable through `Korean` when there is one; else the glyph of
`'A' + code % 26`; else the map's first node (`UNKNOWN_GLYPH_LAST_RESORT_READING`). Every letter A-Z is in both disc
faces, so the last resort never runs.

### 1.4 Single precision

The steps are floats truncated by `(int)`: `int((W - 1) x S + 0.5)` falls either side of a whole number by one float
step. At SCALE 0.9 (`0.89999998f`) a glyph with W = 6 gives `4.4999995 + 0.5`: 4 rounding toward zero, 5 to nearest.
`f32.ts` rounds every step toward zero in the decompiled order (`EE_FPU_ROUNDING_READING`).

## 2. The characters (`codes.ts`)

Every reader takes one character at a time through `FUN_0039f0c0` (the code) and `FUN_0039f160` (its length): below
0xC0 one byte, its own code; a lead 0xC0-0xDF and the next byte (unchecked) `(lead - 0xC0) x 64 + next - 0x80`; a lead
0xE0+ and two more `lead x 0x1000 + (b1 - 0x80) x 64 + (b2 - 0x80)` kept to 16 bits -- or the lead alone before the
terminator. A dialog's literal is its own bytes through this reader (`engineCodes`); a table string comes decoded from
`LocService` (`decodeLocText`), which agrees with it on every lead 0xC2-0xDF -- the only leads above 0xBF in the five
front-end tables (dev-disc test). A setter that walks bytes rather than characters (WRAPPEDTEXT's, §5) needs a table
string's bytes back: `locTextBytes` re-encodes 0x80-0x7FF as two bytes (`LOC_TEXT_BYTES_READING`), and the dev-disc
test round-trips every string of the five tables through `decodeLocText` and back to its own bytes; `captionBytes`
gives a caption's bytes either way.

## 3. The draw (`layout.ts`)

### 3.1 The pen and the measure

`FUN_00362900` (D:L260664-260709): the pen is `int(node x + offset)`, `int(node y + offset)` (+0x90/+0x7c, +0x94/+0x80;
the string's offsets are 0); HCENTERED (+0x69) takes `int(width x 0.5)` off x, RIGHT_JUSTIFIED (+0x6a) the width; the
start state of `#B` is +0x8c. `FUN_00362b70` (D:L260728-260811) measures: per glyph `line = int(line + S x (W - 1) +
0.5) + xspacing`; a break adds the line to the total (+0x3c), so a text of several lines measures as the SUM of its
lines; a space opening a later line is skipped; a code with no glyph adds nothing; `#B` is measured as two glyphs.
`FUN_00363c20` (D:L261330-261373), the pen's step: `int((W - 1) x S + 0.5) + xspacing`. S is +0x40 (the object's
SCALE) x +0x78 (1: every translated text sets it, `FUN_003631f0` D:L261029) x the face's `scale`.

### 3.2 The glyph loop and the quads

`FUN_003635c0` (D:L261089-261169) runs `FUN_00362350` (find the next drawable glyph: `\n` returns the pen to the node's x
and moves it down `int(pitch)`, skipping one space after; `#B` at a glyph's start is skipped and toggles), then per
element `FUN_00361bd0` (the quad) and `FUN_003625e0` (next: the glyph's own pass after its shadow, the next element,
or the next character). A glyph without `color` on a face with a drop shadow is drawn twice per element: the shadow
(colour the shadow's, alpha `min(alpha, int(opacity x 128))`, displaced by the offset x S), then itself (the text's
colour, alpha x 1.5 while `#B` is on: `DAT_003e0338` = 1.5). A glyph with `color` is drawn once in it at the text's
alpha. After a glyph, a `#B` is skipped and the pen moves by the width of the `B`, not of the glyph before it (the step
decodes the character at the pointer the recursion left, D:L260624-260639). The pitch is the class's vtable+0x88:
**0 for TEXT** (0x1fe1a0), `SPACING` (+0xbc) for the TELETYPE and the wrapped lines (0x36afb0).

A quad (D:L260367-260446), with dy = baseline + DispPos.y and h the element's rows:

| corner | term (times S, plus the pen) |
|---|---|
| left | DispPos.x |
| right | width x HorScale + DispPos.x - 1, + 0.5 |
| foot | dy - h + h x VertScale, + 0.5 + `DAT_0049e9a0` |
| head | dy - h, + `DAT_0049e9a8` |

each through the GS mapping (§3.3) and `(int)`. The texels: u from UL.x to UL.x + width - 1 + 15/16 (`DAT_003e0340` =
15 sixteenths), v from UL.y + 1 to LR.y.

The HUD's pad glyphs (viewer `hudFont.ts` `layoutText`, the `font_special_01.tif` glyphs of `FONT_SPECIAL_01`) follow
this mapping since OBF-33 (2026-10-31; **reading, pending review**), the right edge's 15 sixteenths shared with this
package's `RIGHT_EDGE_SUBTEXEL`, and their quad is h = LR.y - UL.y - 1 rows tall (the element's +4 - +6, D:L260388,
D:L260431-260432; `face.ts`'s `height`); the HUD's letters keep `UL.x + width - 1`, `UL.y` and LR.y - UL.y rows, which
their fit was made on, and are open in LATER 594 (with the first column's sampling).

### 3.3 The frame

`FUN_00364f30` (D:L262144-262154): x to `2048 - W/2 + (W/640) x`, y to `2048 - H/2 + DAT_004a44ac x y`; `FUN_003b1200`
(D:L305271-305395), called with 0 (D:L249656), sets W 640, H 448 and `DAT_004a44ac` = 1.0 (the PAL mode, 1, would set
8/7). So a text's corners are whole pixels of the 640 x 448 frame, unscaled both ways (R111.4). `DAT_0049e9a0` and
`DAT_0049e9a8` are 5 and 6 while the in-game HUD lives (`FUN_001fa360` D:L57280-57281: `DAT_003dc388`, `DAT_003dc390`)
and 0 after its teardown (`FUN_001fbae0` D:L57797-57798); the front end's are 0 (`FRONT_END_TEXT_ROWS_READING`). The
in-round ARMORY runs while the HUD lives, so its text carries the HUD's 5 and 6.

## 4. TEXT_GLOW and the colour states (`states.ts`)

### 4.1 The glow (`FUN_00363b30`, D:L261297-261315)

Every text node carries the glow fields (+0x5c period, +0x60 top, +0x64 bottom, +0x68 flag, +0x74 phase, 0 from the
constructor `FUN_00363e70` and never reset). The tick (vtable+0x38 of the text class 0x406df0) runs the rule in
R111.1; `FUN_001b3720` is `sinf`; the alpha goes to +0x54 through vtable+0x34 (`FUN_001f9150`). That is the whole
algorithm: no separate glow pass or texture. A zero TIME would divide by zero; no disc state has one.

### 4.2 Who raises it

`FUN_0036e790(time, range0, range1, node, colour, flag)` (D:L267223-267240) is called with a state's fields on every
state change of a BUTTON-based control: `Deactivate` `FUN_0036e6b0` (NORMAL, when enabled; press timer cleared),
`Press` `FUN_00370c20` (PRESSED for 0.2 s, +0x24c = 0x3e4ccccd), the tick `FUN_003723b0` (D:L269237-269275: the press
timer's end, to ACTIVE when enabled else DISABLED), `SetEnabled` `FUN_00377380` (disabled: DISABLED through
`FUN_003773f0`; enabled and neither ACTIVE nor PRESSED: `Deactivate`), and `Activate` at 0x3766a0 (vtable+0x50; Ghidra
folded it into thunk_FUN_00376bd0 -- read from its instructions: when enabled, ACTIVE, then the button's event
bindings). It sets the caption's colour to the state's `TEXT_COLOR` (or `<STATE>_COLOR`), the alpha to 100, the
caption's scale to the state's `SCALE` (`FUN_0036e830`), the glow's flag from the state's, and TIME, RANGE[1], RANGE[0]
into period, top, bottom. The node's four state blocks are copied from the spec by thunk_FUN_00376bd0
(D:L271345-271500); the first state change after that was not traced (`BUTTON_START_STATE_READING`).

A LISTBOX row (`FUN_0037ab90` D:L273840-273896, `FUN_0037a810` D:L273691-273737): unselected rows in NORMAL_COLOR at
alpha 80; the selected row in the list's current colour at +0xe0 (`LISTBOX_SELECTED_ALPHA_READING`), or glowing with
ACTIVE_COLOR's RANGE/TIME when TIME is not 0 and the list holds the focus. No disc listbox has a TIME (all 0), so no row
glows on the disc.

## 5. WRAPPEDTEXT (`wrapped.ts`)

The setter `FUN_00379f70` (D:L273409-273555; vtable+0x70 of 0x4079e0 and of SCROLLINGTEXT's 0x4072f0) makes one text
node per line (scale = SCALE x the face's scale, the parent's colour, the line's `#B` start state): leading spaces and
breaks skipped; bytes appended while the measured width is under `WIDTH` (`<=` ends it, D:L273510) or no space has been
seen; `\n` ends the line unkept; `#C` with three bytes after it sets the next line's colour (signed bytes) and ends the
line; `#B` stays in the text; a line that reached WIDTH after a space is cut back to it (`FUN_00362dc0` removes one
byte and never a line's first). The loop walks bytes, not characters: `FUN_00362e00` appends one and `FUN_00362b70`
re-measures after each, so a two-byte character's lead is measured alone first (the terminator its next byte: a lead
0xC0-0xDF reads as `(lead - 0xC0) x 64 - 0x80`, 0 for 0xC2, drawn as `A`) and can end a line a character early; the
`#C` test `i + 4 < n` counts bytes and its colour bytes are single signed bytes at any value. `wrapLines` takes the
caption's bytes (`captionBytes`). A word wider than WIDTH overflows. With AUTOSCROLL the scroll resets.

The draw `FUN_003794b0` (D:L273084-273195): line k at `(x, int(y' + k x SPACING - 3.0))`, y' the pen less the scroll --
or, with AUTOSCROLL and the rows overflowing HEIGHT, plus the scroll less the overflow; drawn only with its y in (0,
448) (`DAT_004a44c8`); with HEIGHT > 0 a scissor from `(x, -4 + y - SPACING)` to `(x + WIDTH, -4 + y + HEIGHT -
SPACING)` (`DAT_003e0370` = -4), reset to 640 x 448 after; `DISPLAY_ONE_LINE` keeps every line on row 0, each after the
last one's width. The arrows follow the scroll (`ARROW_VISIBILITY_READING`); `Scroll_Up` / `Scroll_Down`
(`FUN_00379b10`) step one pitch within `[0, rows x SPACING - HEIGHT]`.

## 6. TELETYPE (`teletype.ts`)

The class 0x4078a0; research 95 §3.8 read it for the ARMORY, and this transcribes it whole. The typed text is the
node's own (+0x1c); the source (+0xc0), its length (+0xd0) and the index (+0xd4) apart. The tick `FUN_00377b80`
(D:L272245-272532): a pause counts down while the cursor pulses (`sin(phase) x 32 + 96`, phase at PULSERATE rad/s,
wrapped at 6.2831855); typed out, the cursor pulses or, with FADECURSOR, fades `(1 - phase) x 128` and holds; else the
next word is measured in a scratch node and, if it would carry the line past MAXLENGTH, the index steps back onto the
space before it; the distance grows by `dt x INTERVAL x SCALE x face scale` (`DAT_003e0388` = 1.0); the line breaks
(a `\n` appended, the line's width moved from the distance to the line's start, the space skipped, a re-tick with dt 0
-- `mtc1 $zero, $f12` at 0x378058) when the word did not fit, or when the distance passed MAXLENGTH on a space of a
full line; otherwise `\n` and `#N` break (distance 0.01), `#P<n>` pauses n seconds (atof), another `#` is dropped, and
one character (all its bytes) is appended while the typed width is under the distance plus the line's start, with the
type sound when dt > 0 and it is not the first, `ON_TTY_DONE` (0x15) after the last, and a re-tick with dt 0; last the
text's glow. MAXLENGTH 0 is 100000; PULSERATE 0 is 1. The setter `FUN_00378a10` empties the typed text; an empty caption then
zeroes only the length (+0xd0) and the index (+0xd4) and leaves the held caption (+0xc0) in place, so the next tick's
typed-out branch (D:L272281-272309), finding a non-NUL byte at the index, appends the whole old caption at once, with
the type sound when the index ends past 0 and the sound is on (no dt test there): the console re-shows the old caption
where a cleared field might be expected. The ops (`FUN_00378600`): `Continue` ends a pause; `scroll_up`
/ `scroll_down` move the scroll once all is typed; `finish` ticks with dt 100000 and the sound off until done. The draw
`FUN_00378c00` (D:L272797-272889) lays the typed text out with pitch SPACING (its lines on their rows), skips whole
lines from the top while the breaks x SPACING pass MAXHEIGHT, clips while scrolled (`DAT_003e03a0` = -11), and puts the
cursor 2 px after where the text's pen ended (+0x70, written by the draw), 8 x S wide, from `-5 + y + row x SPACING + 1`
up to `(boty - topy) x S` above `-5 + y + row x SPACING`, unless NOCURSOR or the text opens on a space.

## 7. The captions, the acceptance

### 7.1 Every caption lays out (`captions.ts`, dev-disc test)

`dialogCaptions` lists every caption of a design (texts, buttons and the controls built on them, a RADIOSTRIP's
subordinates, a HANDLERBUTTON's, a MAPCONTROL's elements, each LISTBOX option's cells -- a RADIOSTRIP with no CAPTION of
its own finds its first subordinate's, the lookups being depth-first). Over the 114 dialogs: 1,555 captions; 94 name
`font_titlebar_01`, 1 `font_text_01`, 1,460 none -- and every dialog names `font_text_01` (`FONT`), the face loaded at
menu +0x210 (D:L263505); that a widget without FONT draws in the dialog's face is `CAPTION_FACE_DEFAULT_READING` (the
hand-over to the nodes not traced). Through `LocService`: 894 table strings, 661 literals, none unresolved; every code
of every one is in its face. Rules a caption meets once drawn: SECURETEXT shows one `*` a character (`FUN_0036aff0`).

### 7.2 TICKERTAPETEXT

reCOM's `CTickerSpec` (`zui.h:120`, `zui_spec.cpp:99`) is SOCOM 1's. SOCOM II's object factory `FUN_00382070` and
control factory `FUN_00382890` know no such type (research 105 R105.3), the ELF holds no `TICKER` string and no disc
dialog names it (dev-disc test). The block's "ticker tape" has nothing to port.

### 7.3 Owed: the caption crops (W7.R6)

The block's "caption crops compared to console frames at threshold 8.0" needs PLAT-30's scorer (`tools/capture*.ts`,
on `agent/web-s7-harness`, in review, not in this base) and PLAT-14's drawer. Owed to PLAT-30 (and PLAT-14), against
`SOCOM_PC_ROOT/scripts/parity/refs/` `login.png`, `universe.png`, `persona.png`, `eula.png` (box 5,8-250,32),
`rooms.png` (90,36-300,50), `write_down.png` (87,92-228,101), `save_card.png` (90,100-210,108), `card_slot.png`
(87,102-190,110), thresholds 8.0 (`refs.json`). The first crop to score settles `EE_FPU_ROUNDING_READING`, which
stays open until then. W7.R6's three cross-stream items do not include these crops and the plan's task row does not
mark them owed: the controller records them in the sprint Log as owed to PLAT-30 / PLAT-14 at the merge.

### 7.4 What the drawer (PLAT-14) and the widgets (PLAT-15) take over

This task gives data; these are left to the callers, named so they are not lost:

- PLAT-14: the mapping from a dialog widget's text spec (`XPOS`/`YPOS`, `SCALE`, `COLOR`, `HCENTERED`,
  `RIGHT_JUSTIFIED`, `FONT` with the dialog's `FONT` as fallback) to a `TextStyle` and the pen; the face opacity rule
  of `FUN_00362b20` (alpha = opacity x 128 when the alpha is 128; 0.7 on both disc faces), which `layoutText` does not
  apply; the quads' texel rows are top-first and the atlas is addressed bottom row first, so the drawer maps one onto
  the other; the scissors `placeWrapped` and `teletypeDraw` return; the TELETYPE's type sound (`sound` of a tick).
- PLAT-15: the first focus pass (`BUTTON_START_STATE_READING`); the listbox's +0xe0 writers
  (`LISTBOX_SELECTED_ALPHA_READING`); the arrow image's vtable+0x18/+0x1c (`ARROW_VISIBILITY_READING`); drawing the
  states' `IMAGE` and `PULSE`; a RADIOSTRIP with no `CAPTION` of its own picks up its first subordinate's (the lookups
  are depth-first), so `dialogCaptions` lists that caption twice -- once for the strip, once for the subordinate --
  which is two text nodes in the engine too; the widget pass decides whether both draw. A WRAPPEDTEXT or
  SCROLLINGTEXT caption enters `wrapLines` as its bytes (`captionBytes`), never as `captionCodes`: the wrap walks
  bytes, and a two-byte table string fed as characters would end a line a character late (§5). Neither `wrapLines`
  nor `captionBytes` has a caller outside the tests yet.

## 8. Contradictions with earlier notes and code

- `FONT_DUP_GLYPH_READING` (research 95 §5.4, `@s2u/scene` `uiFont.ts`: the first of a repeated code wins) -- the map's
  `operator[]` makes one glyph of both records (R111.3). `uiFont.ts` is not this task's to change.
- The viewer's `TEXT_V` = 448/480 on glyph rows (`viewer/src/hudFont.ts`, research 87 §3, research 95 §5.4's
  "`DAT_0049e9f4` the frame's 448/480") -- `DAT_0049e9f4` is `DAT_004a44ac` = 1.0 in the NTSC mode the game sets
  (R111.4). The viewer's ARMORY text calibration absorbed the difference into its fit.
- Research 95 §5.4's element height "LR.y - UL.y" -- the element is one row less (§1.2), and `DispPos.y` enters with a
  plus sign (stored negated).
- The viewer's `LINE_LIFT` = -5 for the ARMORY's WRAPPEDTEXT (`MULTILINE_LIFT_READING`, measured) -- the WRAPPEDTEXT
  draw's own lift is 3 (§5); the -5 is the TELETYPE cursor's.
- Research 103 §2 / `UIMNLOC_UTF8_READING` ("the code path that does it was not found") -- `FUN_0039f0c0` (§2).
- The HUD's fitted pen offsets (research 87 §6, `PEN_NUDGE`): the HUD's corner terms are the code's 5 and 6 (§3.3).

None of these files is edited here (the scene's and the viewer's are other tasks'); the new `@s2u/ui` code follows the
source.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `EE_FPU_ROUNDING_READING` (`packages/ui/src/text/f32.ts`) | the float rounding of the text's steps | the EE's FPU rounds toward zero (PCSX2's default EE mode "Chop / Zero" reproduces it); each step rounded in the decompiled order; a `madd.s` would round once (instructions not read). Settled by the first scored caption crop | reading |
| `UNKNOWN_GLYPH_LAST_RESORT_READING` (`packages/ui/src/text/face.ts`) | the glyph when neither the code nor its letter is in the map | the map header's +0xc read as the tree's leftmost node (lowest code). Unreachable on the disc's faces | reading |
| `FRONT_END_TEXT_ROWS_READING` (`packages/ui/src/text/layout.ts`) | `DAT_0049e9a0` / `DAT_0049e9a8` in the front end | 0: their start value, and the HUD's teardown writes 0 (D:L57797-57798); the HUD sets 5 and 6 | reading |
| `BUTTON_START_STATE_READING` (`packages/ui/src/text/states.ts`) | a button's caption before its first state change | NORMAL; the spec copy enters none, the first change (the screen's focus pass) not traced -- PLAT-15 | reading |
| `LISTBOX_SELECTED_ALPHA_READING` (`packages/ui/src/text/states.ts`) | the selected row's alpha (+0xe0) | 80, the reset's value (`FUN_00376420` D:L271267-271290); other writers not traced -- PLAT-15 | reading |
| `ARROW_VISIBILITY_READING` (named in `packages/ui/src/text/wrapped.ts`) | which of the arrow image's vtable+0x18 / +0x1c hides | +0x18 hide, +0x1c show: the only reading under which the up arrow is hidden at scroll 0 | reading |
| `SHORT_GLYPH_CODE_READING` (`packages/ui/src/text/face.ts`) | the code of a short-form glyph record (no `Code`) | the engine takes an int node's value, a string's first byte, else 0 (D:L256806-256820); `parseRdr` drops the types, so an integer-spelled token reads as an int, another number as a float (0), the rest as strings. Unreachable on the disc (all 351 records carry `Code`) | reading |
| `LOC_TEXT_BYTES_READING` (`packages/ui/src/text/codes.ts`) | a table string's bytes, from the decoded text | 0x80-0x7FF re-encoded as two bytes; a lone 0x80-0xBF byte would not round-trip. Exact on the five front-end tables (the dev-disc test round-trips every string) | reading |
| `CAPTION_FACE_DEFAULT_READING` (named in `packages/ui/test/text/textDisc.test.ts`) | the face of a widget with no `FONT` | the dialog's `FONT` face (menu +0x210, D:L263505); the hand-over to the nodes not traced | note only |
