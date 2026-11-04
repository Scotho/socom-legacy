# 185 -- C6 -- the front end's compositor, widgets, text, frame clock, zanim runtime and movie screen

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C6-frontend-compositor-text.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §11.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** the UI focal 457.0076 -- 457.0074 (V4 #2, §11).

Research agent C6, wave 2026-10-04. Read-only. Every number below comes from a script in `scratch/C6/` (see its
`README.md`; each script's saved output is the `.out` file of the same name) or from a cited decompilation line
(`D:L<n>` in `socom2_game.elf.decomp.c`, r0001). RAM dumps are `C:/Projects/socom_pc/logs/parity/*.rdram`: the
`*_pcsx2` ones are the original running in PCSX2 (`title_pcsx2` is the front end's title screen, `postload_pcsx2` /
`spawn_pcsx2` in game); `menu*`, `title_ours` are the recompilation (the same code, supporting only).

Inventory: the 57 C6 ledger names, 3 *note only* gaps (research 106, 117), 4 unnamed unsure comments in the C6 files
and 2 leads for other clusters' names that live in C6 files (64 rows in `ledger-C6.tsv`). The other unsure comments the
sweep found (`scratch/C6/sweep.out`) are the named items' own doc lines, or descriptive ("not found" meaning a lookup
miss). Names in C6 files owned by other clusters (`MODEL_CAMERA_READING` C4, `MOVIE_HOLD_READING` /
`MOVIE_PICTURE_PERIOD_READING` C7, `NODE_NAME_MATCH_READING` C5a, `TOKEN_TYPE_READING` C5b) are not re-graded here; leads
for them are in the last section.

## 1. Summary

| item | status | grade | one-line answer |
|---|---|---|---|
| ARROW_VISIBILITY_READING | RESOLVED | PROVEN | +0x18 hides, +0x1c shows (the reading stands) |
| BAR_SCALE_ORIGIN_READING | RESOLVED | STRONG | local scale then translation, before the parent: scales from the quad's local origin |
| BUTTON_START_STATE_READING | PARTIAL | STRONG | only the first enabled control is entered (ACTIVE); others keep the constructed look, not NORMAL |
| CALL_SET_SEARCH_READING | RESOLVED | STRONG | first the set last activated/loaded (manager +0x34), not the caller's |
| CAPTION_FACE_DEFAULT_READING | RESOLVED | PROVEN | the dialog's FONT face is handed to every control's create; a spec FONT replaces it |
| CATCHUP_LIMIT_READING | NOT-A-GAP | PROVEN | 0.05 s is the menu shell's dt clamp; the catch-up shape is port policy |
| DIALOG_NODE_STATE_READING | RESOLVED | PROVEN | (XPOS, YPOS, 0), OPACITY (default 1.0), active, identity -- as read |
| DPAD_GLYPH_DIRECTION_READING | NOT-A-GAP | STRONG | settled earlier (research 95 sec 5.4) |
| DROPPED_FRAME_READING | NOT-A-GAP | PROVEN | port policy; the console runs one long tick |
| FONT_DUP_GLYPH_READING | RESOLVED | STRONG | not first-wins: the repeat appends its element to the same glyph; scalars from the last record |
| FRAME_CLEAR_READING | RESOLVED | PROVEN | black: a full-frame black sprite at every menu flip |
| FRONT_END_TEXT_ROWS_READING | RESOLVED | PROVEN | 0 / 0 in the PCSX2 front-end dump |
| GS_ALPHA_FRAME_START_READING | RESOLVED | STRONG | confirmed: only the env packet and texture binds write ALPHA_1 |
| GS_MODULATE_BLEND_READING | RESOLVED | PROVEN | TFX MODULATE, TCC 1 on all 537 UI/font binds; COLCLAMP 1 |
| GS_SPRITE_COVERAGE_READING | RESOLVED | STRONG | whole-pixel corners (offset 1728/1824, scale 1); scaled corners truncated to 1/16 |
| HIDDEN_TAB_READING | NOT-A-GAP | -- | browser-only |
| LISTBOX_ADDED_ITEM_READING | RESOLVED | PROVEN | AddItem uses FUN_0036bbc0 (string -> a String item), not FUN_0036bdd0 |
| LISTBOX_ARRAY_CELL_KEYS_READING | RESOLVED | PROVEN | COLOR and DISABLED are applied |
| LISTBOX_CELL_SCALE_READING | RESOLVED | PROVEN | a column's non-zero SCALE replaces the cell text's scale at each draw |
| LISTBOX_EVENT_AS_BUTTON_READING | RESOLVED | STRONG | confirmed: code and state matched, kind not tested |
| LISTBOX_GET_CONTENTS_PLACEHOLDER | RESOLVED | STRONG | a list per item: int / float / string by full parse; arrays nest |
| LISTBOX_ITEM_ROWS_READING | RESOLVED | PROVEN | 1; wrapped text: its line count (min 1); array: max of its cells |
| LISTBOX_REBUILD_CONTENT_PASS_READING | RESOLVED | PROVEN | identity except TimedText: staggered start times |
| LISTBOX_ROW_ALPHA_START_READING | RESOLVED | PROVEN | 89.6 (face opacity 0.7 x 128), not 128 |
| LISTBOX_ROW_FLAG_READING | RESOLVED | PROVEN | the array item's +0x10: 1, 0 with a DISABLED cell |
| LISTBOX_SELECTED_ALPHA_READING | RESOLVED | PROVEN | 80 (ctor, Deactivate) / 100 (Activate, FUN_00374a50) |
| LOC_TEXT_BYTES_READING | NOT-A-GAP | PROVEN | port-internal; exact on disc |
| MENU_TICK_RATE_READING | RESOLVED | STRONG | two fields: a PCSX2 front-end frame measured 525 HBLANKs |
| MOVIE_PACE_READING | RESOLVED | STRONG | one picture a tick (research 121 sec 9) on the measured tick |
| MOVIE_RECT_READING | RESOLVED | PROVEN | x 0, y = half the spare height rounded to a 32-row page, own size |
| NODE_MATRIX_READING | RESOLVED | STRONG | v.Local.Parent; local = scale diagonal + translation (as read) |
| OPACITY_STACK_BASE_READING | RESOLVED | PROVEN | 1.0, written by the pipe's ctor |
| PAD_PAST_BUTTONS_READING | PARTIAL | BELIEVED | in-object bytes, 0 in every idle dump; writer not found |
| PLAYMPEG_GATE_READING | RESOLVED | PROVEN | the gate object is the network player body; null in the front end -> plays |
| PLAYMPEG_RECORD_INITIAL_PLACEHOLDER | RESOLVED | PROVEN | zero: BSS |
| PROGRESSBAR_UNSET_READING | PARTIAL | STRONG | nothing on the disc or in the ELF names `Load_progress`; capture owed |
| QUAT_PRODUCT_READING | RESOLVED | PROVEN | exact Hamilton product; the "uninitialised word" is a VU0 lane |
| SHORT_GLYPH_CODE_READING | NOT-A-GAP | PROVEN | unreachable; the disc keeps node types anyway |
| SLIDER_HOLD_CADENCE_READING | RESOLVED | STRONG | once per UI tick (29.97 Hz) after 0.4 s |
| SLIDER_KNOB_WHEN_HIDDEN_READING | PARTIAL | STRONG | depends on which hide: node (no knob) vs element (knob drawn) |
| SPIN_SCREEN_SENSE_READING | PARTIAL | BELIEVED | matrix order read; the y spin's sense still owes a capture |
| STATE_CHANGE_FRAME_SYNC_READING | RESOLVED | PROVEN | counter, elapsed, packet buffer, DMA sync; dt not reset |
| TELETYPE_CURSOR_READING | RESOLVED | STRONG | the cursor is grey 128,128,128, not the text colour |
| TEXT_FADE_ALPHA_READING | RESOLVED | PROVEN | at stack top >= 1 nothing is written: the last alpha stays (research 112 sec 4) |
| TEXT_PEN_READING | RESOLVED | PROVEN | the node's matrix (scale included) maps the text's own offset; glyphs unscaled by it |
| UIMNLOC_UTF8_READING | RESOLVED | PROVEN | the decoder is FUN_0039f0c0 (2- and 3-byte); disc has only 2-byte |
| UIVAR_SPEC_TOKEN_READING | RESOLVED | PROVEN | node types are on the disc; 3 VALUEs are float 1.0 the port types int |
| UI_MESH_BIND_READING | UNRESOLVED | -- | VU1 path not read; owed evidence below |
| UI_MODEL_DRAW_ORDER_READING | NOT-A-GAP | STRONG | already read (research 112 R112.2, 141 sec 2) |
| UI_MODEL_FOCAL_READING | RESOLVED | STRONG | 457.0076 px/unit = 320 x cot(35 deg) |
| UI_MODEL_TEXTURE_ROWS_READING | RESOLVED | STRONG | as uploaded; CLAMP REPEAT; the 2D flip is the quads' ST |
| UI_MODEL_ZWRITE_READING | RESOLVED | STRONG | contradicted: alpha test off; alpha-0 texels write depth |
| UI_TEXTURE_FILTER_READING | RESOLVED | PROVEN | bilinear (TEX1_1 0x60) |
| UI_TICK_HZ_READING | RESOLVED | STRONG | 29.97 Hz measured (525 HBLANKs a frame) |
| UNKNOWN_GLYPH_LAST_RESORT_READING | RESOLVED | PROVEN | lowest code (0x20) in 13 maps in PCSX2 RAM |
| UV_REPEAT_READING | RESOLVED | PROVEN | CLAMP_1 REPEAT on every 2D texture |
| WRAPPED_LINE_ALPHA_READING | RESOLVED | STRONG | contradicted: lines keep their own alpha (face opacity x 128) |
| ZANIM_RAND_SOURCE (note only) | RESOLVED | PROVEN | newlib rand(), seeded from the CD clock at boot |
| GLOW_PERIOD_READING (note only) | RESOLVED | STRONG | 2 x TIME seconds, dt-driven |
| WRAP_HASH_B_READING (note only) | RESOLVED | PROVEN | `#B` = glyph alpha x 1.5; carried across wrapped lines |
| unnamed: uiLoc.ts:230 caption vs UIVAR | PARTIAL | BELIEVED | a bound var updates the caption at set-up |
| unnamed: listbox.ts:236 array item selectable | RESOLVED | PROVEN | = the array item's +0x10 |
| unnamed: movieLayer.ts:27 the menu's clear | RESOLVED | STRONG | read: black every menu frame (lead for C7) |
| unnamed: engineOrder.ts:54 ring direction | UNRESOLVED | -- | out of this cluster's scope; lead only |

Counts (64 rows): RESOLVED 49, PARTIAL 6, NOT-A-GAP 7, UNRESOLVED 2 (grades: PROVEN 34, STRONG 24, BELIEVED 3), plus 2 cross-cluster leads RESOLVED (in the TSV,
not counted above). Of the resolved, the readings were **contradicted** for 13: BUTTON_START_STATE (partly),
CALL_SET_SEARCH, FONT_DUP_GLYPH, LISTBOX_ADDED_ITEM, LISTBOX_ARRAY_CELL_KEYS, LISTBOX_ROW_ALPHA_START,
LISTBOX_SELECTED_ALPHA (partly), TELETYPE_CURSOR, TEXT_PEN (refined), UIVAR_SPEC_TOKEN (3 values), UI_MODEL_FOCAL
(455 -> 457.0), UI_MODEL_ZWRITE, WRAPPED_LINE_ALPHA.

---

## 2. Clock

### 2.1 UI_TICK_HZ_READING / MENU_TICK_RATE_READING
`packages/ui/src/clock/uiClock.ts:51`, `packages/ui/src/input/menuInput.ts:48`.
- **Stands for**: the menu tick rate. **Current**: 29.97 (`UI_TICK_RATE` 2997/100); menuInput's 30.
- **Prior search**: read from the flip and its cap word, not measured; PLAT-36 would prove it (research 110 sec 1).
- **What I did**: `clock_rdram.py` reads the flip's own statics (`FUN_003aff30` D:L304745-304767) from every dump:
  `DAT_003e1400` (cap) = 30 (.data and RAM), `DAT_0049e2d8` (RCNT0 -> s) = 6.3556632e-05 (1/15734.0 Hz, HBLANK),
  `DAT_004a4538` = the last frame's RCNT0 count, `DAT_004a449c` its dt.
- **Answer**: PCSX2 `title_pcsx2` (front end), `postload_pcsx2`, `spawn_pcsx2`: **525** HBLANKs, dt **0.033367 s**
  = 29.97 Hz. Two fields per tick. The recompilation dumps read 524 (its own timer), so they are not evidence. STRONG
  (code + three PCSX2 frames; one frame each).
- **Implementation**: keep 29.97 / 2997/100; drop "[reading]" to "read" citing `clock_rdram.out`; `MENU_TICK_RATE_READING`
  in menuInput.ts may be retired as the same fact.
- **Owed**: none for the rate; a longer PCSX2 run of frame counts would settle jitter.

### 2.2 CATCHUP_LIMIT_READING, DROPPED_FRAME_READING, HIDDEN_TAB_READING
`uiClock.ts:66, 72, 77`. The 0.05 s is the menu shell's clamp `min(dt, 0.05)` (`FUN_003654c0` D:L262270-262273):
PROVEN. The console's late frame is one tick with a long dt: the cap loop only waits, and RCNT0 is reset once per flip
(D:L304762-304764), so a long frame measures a long dt; the menu's scripts then see at most 0.05 s. The port's
"at most two fixed ticks" keeps the same script time (2 x 0.03337 >= 0.05), so it is port policy: **NOT-A-GAP**.
HIDDEN_TAB: browser-only, NOT-A-GAP.

### 2.3 STATE_CHANGE_FRAME_SYNC_READING
`uiClock.ts:155`. `FUN_003b05e0` (D:L304875-304886): `DAT_004a44a4` = RCNT0 x scale (elapsed since the last flip),
frame counter +1, `FUN_00350cd0` (swap the scratchpad packet buffer, D:L250152-250171), `FUN_001a21a8(0,0)` (wait for
VIF1/GIF DMA, D:L22456-). It does **not** reset RCNT0 (the resets are D:L304763, D:L51244, D:L304910, D:L304928), so
the first flip after a state's Init measures the Init's time as dt, which the menu shell clamps to 0.05 s. PROVEN.
**Implementation**: keep `frameSync` (counter only); a test that the first tick after a state change advances scripts by
at most 0.05 s is consistent with the console.

### 2.4 MOVIE_PACE_READING
`moviePace.ts:20`. Research 121 sec 9 read one picture per tick, the TIMESTAMP flag unread. With the tick measured
above, SONY448's 310 pictures take 310 x 0.033367 = 10.34 s, the research's figure. STRONG. No change.

### 2.5 GLOW_PERIOD_READING (note only, research 117 sec 12)
`FUN_00363b30` (D:L261297-261315): phase += dt/2, wraps at TIME, alpha = (r0 + sin(3.14 phase/TIME)(r1 - r0)) x 128.
dt-driven, so the period is 2 x TIME seconds however often the tick runs; the menu's dt per frame is 0.033367 s
(above). STRONG. No change; the 5-fps burst only confirms.

### 2.6 SLIDER_HOLD_CADENCE_READING
`slider.ts:31`. The step runs once per input call after 0.4 s (`FUN_00371d00` D:L269099-269124); research 116 sec 3
reads the dispatch `FUN_00368650` once per UI tick, the tick two fields. So a held LEFT steps every 0.03337 s after
0.4 s. STRONG. No change in the module; the caller must dispatch once per tick (already PLAT-11's).

---

## 3. The 2D compositor and the GS

### 3.1 The texture bind packets (UV_REPEAT, UI_TEXTURE_FILTER, GS_MODULATE_BLEND, UI_MODEL_ZWRITE, UI_MODEL_TEXTURE_ROWS)
A texture record keeps a prebuilt bind packet (`FUN_00354f80` D:L252786-252801; research 141 sec 2). `bindpackets.py`
reads it from every texture of the 57 `RUN/UI/*_TXR.ZED` and `RUN/COMMON/FONT_TXR.ZED` (537 textures):

| register | value | meaning | count |
|---|---|---|---|
| ALPHA_1 | 0x44 / 0x48 | (Cs-Cd)As+Cd / Cs As + Cd (the roller's 12) | 525 / 12 |
| TEX1_1 | 0x60 | MMAG LINEAR, MMIN LINEAR, no mipmap | 537 |
| TEX0_1 | TCC 1, TFX 0 | RGBA texture, MODULATE | 537 |
| TEST_1 | 0x5000c | ATE **0** (alpha test off), ZTE 1, ZTST GEQUAL | 537 |
| CLAMP_1 | 0 | REPEAT / REPEAT | 536 (CLAMP: `UI_TXR/specular_map.tif`) |

`gsenv.py` decodes the flip's packets: 0x3e0880 (env: COLCLAMP 1, ALPHA_1 0x44, TEST_1 0x5000d, ZBUF_1 ZMSK 0,
XYOFFSET 1728/1824), 0x3e0980 (per flip: FRAME_1, XYOFFSET_1, SCISSOR 0..639 x 0..447, TEST_1, ZBUF_1 ZMSK 0 -- no
ALPHA_1), 0x3e0a00 (the clear, below). `geo_regs.py`: `RUN/UI/UI_GEO.ZED` holds no A+D register writes, so the meshes
inherit the bind.

- **UV_REPEAT_READING** (`frame.ts:23`): RESOLVED, PROVEN -- CLAMP_1 REPEAT. Together with the quad ctor's ST corners
  (`FUN_00364c50` D:L262025-262030: S 0.01/0.99, T -0.01/-0.99) this is the upright flip. Change the doc to "read".
- **UI_TEXTURE_FILTER_READING** (`uiCompositorView.ts:49`): RESOLVED, PROVEN -- bilinear.
- **GS_MODULATE_BLEND_READING** (`uiCompositorView.ts:72`): RESOLVED, PROVEN -- TFX MODULATE, TCC 1; COLCLAMP 1.
- **UI_MODEL_ZWRITE_READING** (`models.ts:100`): RESOLVED, STRONG, **contradicted**. With ATE 0 an alpha-0 texel
  passes; its colour is left unchanged by either blend (As = 0), but it writes depth (ZTE 1, GEQUAL, ZMSK 0). The
  remaining step: VU1's microcode is assumed not to send its own TEST_1 (the mesh files carry none).
  *Implementation*: in the models' raster, write depth for every covered texel whose depth test passes, alpha 0
  included, and keep the colour unchanged for alpha 0. Test first: two overlapping model quads where the nearer has a
  clear texel -- the farther one must not show through it. The roller's frame is unchanged (its faces never overlap).
- **UI_MODEL_TEXTURE_ROWS_READING** (`models.ts:92`): RESOLVED, STRONG. GS addressing is as uploaded and CLAMP is
  REPEAT; the models' UVs are used as stored. No change.

### 3.2 FRAME_CLEAR_READING (and the unnamed "menu's own clear", movieLayer.ts:27)
`drawList.ts:54`. The flip sends `0x3e0a00` when `DAT_004a4511` != 0 (`FUN_003aff30` D:L304826-304828): TEST_1 ZTST
ALWAYS, PRIM 6 (sprite, no blend), RGBAQ 0, XYZ2 (1728,1824)-(2368,2272) = the whole 640 x 448 frame, then TEST_1
back. `DAT_004a4511` = 1 is set by the menu state's Init (`FUN_001f1bb0` D:L53495, the function that builds the
CGameMenu) and 0 by the game state's (`FUN_001ec480` D:L50953); the PCSX2 title dump reads 1, the in-game dump 0.
**Answer**: black (0,0,0), every menu frame, before anything draws. PROVEN. No change to the constant; doc to "read".
**Consequence for movies** (lead for C7): the movie tick uploads into the draw buffer after this clear
(`FUN_0030b1d0` D:L208733-208746), so a menu tick with no new picture shows black, not the last picture.

### 3.3 GS_SPRITE_COVERAGE_READING
`uiCompositorView.ts:42`. `FUN_003643b0` (D:L261675-261700): corner = `DAT_0049ea00` + x x `DAT_0049e9f0` (same for y),
converted by `vftoi4` (`FUN_001bfee8` D:L40828-40838: x16, truncated). `screenmap_rdram.py`: 1728.0, 1824.0, 1.0, 1.0
in every dump (set at D:L262146-262153 from 640/448). So an untransformed integer quad's corners are whole pixels and
the GS fill rule covers x0 <= x < x1. STRONG (the GS rule itself is hardware, not corpus). *Implementation*: for a
scaled node, truncate corner x 16 toward zero before covering (a sub-pixel corner case), test with a 0.5-scaled quad.

### 3.4 GS_ALPHA_FRAME_START_READING
`uiCompositorView.ts:82`. Confirmed: 0x3e0880 (with ALPHA_1 0x44) is sent only on a display-mode change
(D:L304752-304754); the per-flip packet and the clear sprite (PRIM 6 without ABE) do not touch ALPHA_1. STRONG. No change.

### 3.5 OPACITY_STACK_BASE_READING
`frame.ts:46`. The UI planes are drawn by the pipe at 0x4887c0 (`FUN_00369170` D:L264256-264258 -> `FUN_00336c10`).
Its ctor `FUN_0033c1c0` (D:L238181-238184) allocates the stack, writes **1.0** to entry 0, capacity 0x20, top 0.
`opacity_stack.py`: entry 0 = 1.0 in every dump. PROVEN. Doc to "read".

### 3.6 NODE_MATRIX_READING, BAR_SCALE_ORIGIN_READING
`drawList.ts:63`. The walk pushes `FUN_00307fa0` (D:L206672-206687) = `FUN_001bfc30(new, top, local)`, which computes
local x top in row-vector form (each row of the second argument combines the first's rows, D:L40429-40445): a point is
`v . Local . Parent`. The node's matrix starts as identity (`FUN_001bff28`), its translation is the fourth row
(+0x30/+0x34/+0x38, `FUN_003157d0` D:L215068-215070), its scale the diagonal (research 95's L215015). Quad corners are
the element's local rectangle (+0x24/+0x28, +0x74/+0x78) mapped by the current matrix (`FUN_00308640`). So a quad at
local 0 scales from its left/top edge. Both STRONG (the local matrix's rotation part is unread; no dialog command
rotates). No change.

### 3.7 TEXT_PEN_READING
`drawList.ts:71`. The text node draw `FUN_0037a540` (text vtable 0x407a90 +0x10; D:L273611-273620) maps the text's own
offset (+0xa4, +0xa8, +0xac) through the current matrix and truncates it to int: **pen = int(M x offset)**. So the
node's scale *does* scale the text's offset (not its glyphs -- glyph size is text +0x40 x face +0x34). PROVEN,
**refines** the reading (which adds an unscaled offset). *Implementation*: in `drawList.ts`, transform the text's
offset by the node matrix (including scale) and floor toward zero; glyph scale unchanged. Test: a text child with
offset (10, 0) under a node scaled 2 lands 20 px right of the node.

### 3.8 TEXT_FADE_ALPHA_READING
Defined `viewer/src/armoryLayout.ts:71`, named in `frame.ts:60`. `FUN_0036d8b0` (D:L266737-266746): the 2D adaptor
writes the element's alpha (+0x34) = top x 128 only while the stack top is under 1 (0.99 -> 128); at 1.0 it writes
nothing. A fade ending at 1.0 leaves its last written value. Research 112 sec 4 already reads this; the viewer's
constant ("face opacity at 1.0") is superseded. PROVEN. *Implementation*: retire the viewer constant; the compositor's
rule in `frame.ts` stands.

### 3.9 WRAPPED_LINE_ALPHA_READING
`drawList.ts:78`. **Contradicted**, STRONG. CWrappedText's vtable is 0x4079e0 (typeinfo name "CWrappedText"): +0x34 =
0x1f9150 (`swc1 $f12, 0x54($a0)`: its own +0x54 only), +0x10 = `FUN_003794b0` (D:L273139-273161), which draws each line
text with `FUN_00363a70` and never reads its own +0x54. The lines are texts made by `FUN_00379f70`
(D:L273464-273499): ctor alpha 128 (`FUN_00363e70` D:L261476), then the font set (`FUN_00362b20`) makes it face
opacity x 128 = 89.6. So a WRAPPEDTEXT's lines draw at 89.6 whatever the walk writes: they do not fade with their node.
*Implementation*: in `drawList.ts`, draw wrapped lines at their own alpha (face opacity x 128), not the object's.
Test: a WRAPPEDTEXT under a node at opacity 0.5 draws its lines at 89.6. **Owed** (to make it PROVEN): a PCSX2 frame of
a fading dialog holding a WRAPPEDTEXT (e.g. a briefing text while the menu fader runs).

### 3.10 TELETYPE_CURSOR_READING
Defined `viewer/src/armoryText.ts:50`, named `drawList.ts:144`. CTeleType (vtables 0x4078a0 / 0x407930) is created by
`FUN_003888a0` (D:L281191-281215): its cursor at +0x100 is a 2D quad coloured **128,128,128** (`FUN_00364930`
D:L281206), alpha 128, texture none (`FUN_00378b00` D:L272787-272788). No code of the class recolours it (every
`FUN_00364930` and +0x10c-vtable call in D:L271000-282000 listed: only alpha, D:L272281-272324: 128 while typing,
96 + 32 sin(phase) idle, (1 - fade) x 128). **Answer**: an untextured mid-grey (128) box, not the text colour.
STRONG (exhaustive search of the class's code; no capture). *Implementation*: draw the cursor rgb (128,128,128).

### 3.11 MOVIE_RECT_READING
`movieLayer.ts:43`. The upload is built by `FUN_0030b1d0` (D:L208701-208728) through `FUN_0030b770`
(D:L208866-208921): BITBLTBUF DBW 10 (640), CT32; one 16 x 16 TRXREG per macroblock at (16 i, 16 j); the destination
block = buffer base (FBP 0 or 140, `DAT_00455e40/44` = 140/0 in the title dump) + `iVar1`, `iVar1` = (448 - h) x 5
blocks (`DAT_003df350` = 448 in .data) rounded to the nearest multiple of 320 (one 32-row page row of a 640-wide
buffer), ties down, clamped at 0. **Answer**: x = 0; y = (448 - h)/2 rounded to a multiple of 32 rows; the picture's
own size, no scaling. 640 x 448 -> the origin. PROVEN. *Implementation*: `y = clamp0(round32((448 - h) / 2))`, a tie
rounding down; test: h = 352 -> 48 rows = 480 blocks, 480 % 320 = 160 (not > 160) -> 320 blocks -> y = 32.

### 3.12 PLAYMPEG_GATE_READING
`movieCommands.ts:74`. `DAT_00440c38` is set by `FUN_002b3590` from `CZSealBody_NetworkPlayerCreate`
(`FUN_005442c0` D:L410612, socom2_names.csv) and cleared at `FUN_001eb8c0` D:L50611. `gate_rdram.py`: **0** in the
PCSX2 title dump; in game a body whose +0xe1 bit 0x10 is set. So in the front end both commands play. PROVEN (front
end). No change; doc to "read".

### 3.13 PLAYMPEG_RECORD_INITIAL_PLACEHOLDER
`movieCommands.ts:82`. 0x40871d-0x408750 and 0x408720 lie past the data segment's file size (BSS, zeroed at boot;
`lib.is_bss`), and their only writer is `PlayMPEG`'s (`FUN_0027ab30` D:L124636-124664); `FUN_001eda60` writes only the
record's +0xc and +0x28. **Answer**: zero/false, as the stand-in. PROVEN. Rename to a read constant.

---

## 4. Widgets

### 4.1 BUTTON_START_STATE_READING
`states.ts:93`. **Partial; the reading is wrong for unfocused buttons.** At the build (`FUN_00367950`
D:L263735-263744) the focus index is set to 0 and the first control is Activated (vtable +0x50) if enabled
(+0x48), else `FUN_003670d0` moves on; no other control is entered. A button whose state was never entered keeps the
look its set-up left: caption colour 255,255,255 (text ctor `FUN_00363e70` D:L261473-261475; the set-up
`thunk_FUN_00376bd0` D:L271347-271505 copies the four states and writes no colour), alpha = face opacity x 128 = 89.6
(the font set while alpha is 128, `FUN_00362b20` D:L260718-260720), scale = the spec's (D:L271376). Entering any state
sets alpha 100 and the state's colour (`FUN_0036e790` D:L267230-267235). STRONG. *Implementation*: build unfocused
buttons in a `null` state with that look; the first enabled control ACTIVE. **Owed**: a PCSX2 frame of a text-button
dialog right after its entry (e.g. dlgOptions): an unfocused, never-focused caption should be white at ~89.6 alpha,
and should change when the focus passes over and leaves it.

### 4.2 LISTBOX (eight readings and one placeholder)
Class map from the typeinfo names: CListItemStringTypeImpl (vt 0x407b40), CListItemTimedTextTypeImpl (0x4070a0),
CListItemWrappedTextTypeImpl (0x407140), CListItemArrayTypeImpl (0x407b90), the item record's own vtable 0x407240,
CUIListBox 0x407670 (second base 0x4076e0). Column TYPE 0 builds an image cell, 2 a TimedText, 3 a WrappedText, other a
String (`FUN_0037ae10` D:L273987-274031).

- **LISTBOX_ROW_FLAG_READING** (`listbox.ts:66`): the gate `(*piVar5 + 0x3c)` at D:L273848 is the Array content's +0x3c
  = 0x37ae00 (`lbu $v0, 0x10($a0)`): byte +0x10, set 1 at D:L273954 and 0 when a cell has `DISABLED`
  (D:L274051-274054). PROVEN. *Implementation*: glow only when the row has no DISABLED cell.
- **LISTBOX_CELL_SCALE_READING** (`listbox.ts:58`): at 0x37ad88-0x37ada0 `$f12` = the column's +0x18 (SCALE) and, when
  non-zero, the String cell's +0x28 = `FUN_0037adf0` (`swc1 $f12, 0x40($v1)`) stores it as the text's scale, at every
  draw. Otherwise the scale is the list's, given at the item set-up (`$f12` = list +0xcc at 0x376120). PROVEN.
- **LISTBOX_ITEM_ROWS_READING** (`listbox.ts:51`): the item's rows (+0x2c vtable +0xc = `FUN_0036ba30` D:L265773) ask
  the content's +0x44: String/TimedText 1 (0x36ba60), WrappedText `max(1, +0x114)` (0x37be30; +0x114 = the inner
  wrapped text's line count from its last draw, 0 before), Array the largest of its cells (`FUN_0037cdc0`). PROVEN.
- **LISTBOX_REBUILD_CONTENT_PASS_READING** (`listbox.ts:81`): content +0x30: String and WrappedText return the value
  unchanged (0x36b5d0 `mov.s $f0,$f12`); TimedText (0x37bc30) stores the running value at +0xcc (its start time) and
  returns value + the list's +0x164; Array chains its cells (`FUN_0037cb70` D:L274780-274797). So TimedText rows start
  one after another at list +0x160 + k x +0x164. PROVEN. *Implementation*: carry the pass for TIMED text columns.
- **LISTBOX_GET_CONTENTS_PLACEHOLDER** (`listbox.ts:88`): op 10 (D:L269629-269643) begins a list, calls each item's
  serialiser (+0x2c vtable +8 = 0x36b1d0, a tail call to the content's +0x40), ends the list and assigns it to the var
  (`FUN_00386460`). String content +0x40 (0x37bf40): `strtol(text, &end, 10)`; if `end - text == strlen` push an int
  node (`FUN_00333700`), else `strtod`; if it consumes all push a float (`FUN_00333690`, via `dptofp`), else the string
  (`FUN_00333610`). Array content +0x40 (`FUN_0037cd30` D:L274846-274863) wraps its cells in a sub-list. STRONG
  (`strtol`/`strtod` identified by their newlib `_r` wrapper shape over `_impure_ptr` and base 10; `strlen`/`dptofp`
  named). *Implementation*: write that list into the var. Test: a list of "12", "1.5", "abc" gives [12, 1.5, "abc"].
- **LISTBOX_ARRAY_CELL_KEYS_READING** (`listbox.ts:106`): `COLOR` is applied through content +0x2c (0x37bd60: +0xc8 = 1,
  the text's +0x48/+0x4c/+0x50 = r, g, b) and `DISABLED` clears the item's +0x24 (not selectable) and the row gate
  (D:L274038-274055). PROVEN. *Implementation*: apply both.
- **LISTBOX_ADDED_ITEM_READING** (`listbox.ts:73`): `AddItem` (D:L269545-269574) builds with `FUN_0036bbc0`
  (D:L265829-265907), the same builder as the array-var rebuild: a string element -> a String item whose text is the
  string; an array -> an Array item; appended by `FUN_00373f20`, auto-scrolled when +0xe9. Not `FUN_0036bdd0`'s item.
  PROVEN. *Implementation*: route AddItem through `itemOf` (listbox.ts:231).
- **LISTBOX_ROW_ALPHA_START_READING** (`listbox.ts:45`): **89.6**, not 128: the item set-up (`FUN_0036b920`,
  disassembled: `$a2` = list +0xa0 the face) calls `FUN_0036b810` -> content +0x20 = `j FUN_00362b20` while the text
  alpha is 128, which sets it to face opacity x 128 (fonts.rdr opacity 0.7 for both faces, `faces_opacity.out`).
  PROVEN. *Implementation*: start rows at `face.opacity * 128`.
- **LISTBOX_SELECTED_ALPHA_READING** (`states.ts:182`): +0xe0's writers: 80 at the ctor (`FUN_0037e8b0` D:L275822) and
  in Deactivate (CUIListBox +0x54 = `FUN_00376420` D:L271290); **100** in Activate (+0x50 = `FUN_00374cb0` D:L270546)
  and in `FUN_00374a50` (D:L270468; second base +0x14). Each of these passes the old +0xe0 to the highlight's +0x34 and
  then 100.0, before storing the new value. PROVEN (writers by offset grep over D:L268000-276000). *Implementation*:
  track +0xe0 per state (100 after Activate).
- **LISTBOX_EVENT_AS_BUTTON_READING** (note only): D:L270372-270411 matches each binding's code (+0x42d) and state
  (+0x42c) against `record[1 + code]`; the kind (+0x420) is not tested. STRONG (read). Capture still owed
  (research 117: a PCSX2 RIGHT on an online list).
- **unnamed, listbox.ts:236** ("selectable as its +0x3c answers (not followed, taken true)"): it is the Array
  content's +0x10 (above). RESOLVED, PROVEN.

### 4.3 PAD_PAST_BUTTONS_READING
`pad.ts:41`. The record is `DAT_0044f108`, an object of 0x2d4 bytes (`FUN_002d9d00` D:L179010), so
`record + 1 + code` for codes up to 0x2d is inside it. `padrec_rdram.py`: byte 0 = 1, bytes 1..0x3f all 0 in the
PCSX2 title and in-game dumps (no input held). PARTIAL, BELIEVED (0 = UP when idle; the writer of bytes 15..0x2e not
found). **Owed**: a PCSX2 RAM dump of `DAT_0044f108`'s object while holding a button and the stick on a list dialog.

### 4.4 PROGRESSBAR_UNSET_READING
`progressBar.ts:24`. `grep_disc_strings.py Load_progress` (case-insensitive) over every RUN ZAR/ZED/ZDB and both ELFs:
only dlgLoad's own record in `RUN/UI/READERC.ZAR` (and unrelated `load_progress_*.tif` names in the MP maps); no ELF
string, no script. PARTIAL, STRONG for "nothing names it". **Owed**: a PCSX2 frame of `dlgLoad` mid-load (is the bar
full from the first frame?).

### 4.5 SLIDER_KNOB_WHEN_HIDDEN_READING
`slider.ts:39`. `FUN_00372220` (D:L269214-269230) tests the slider element's own visible bit (`FUN_00364e10`: +0x14 bit
0x40) for the bar and text only; the knob (+0x460) is its own quad with its own bit. The pipe walk skips a node whose
+0x5c bit 0 is clear (`FUN_00336a60` D:L235074). So: a deactivated node draws nothing; a hidden element (vtable +0x18)
still draws its knob. PARTIAL, STRONG. *Implementation*: model the two hides apart if a slider is ever hidden; no disc
dialog is known to (research 117 sec 9).

### 4.6 UIVAR_SPEC_TOKEN_READING (and SHORT_GLYPH_CODE_READING)
`host.ts:121`, `face.ts:151`. The disc's compiled `.rdr` keeps every node's type (1 int, 2 float, 3 string, 4 list;
`rdr_typed.py`; the engine branches on it, e.g. D:L256803-256816, D:L273988-273993); `parseRdr`
(`packages/archive/src/rdr.ts`) reads the type and then drops it. `uivar_value_types.py` over every UI script:
31 string VALUEs, 8 float -- of which **3 are float 1.0 that the spelling rule types int 1**: `SOUND_VOLUME` and
`DIALOG_VOLUME` (dlgOptions_Audio), `BRIGHTNESS` (dlgOptions_Video). RESOLVED, PROVEN. Fonts: all 351 `Code` nodes are
int (`fonts_typed.out`), so SHORT_GLYPH_CODE is unreachable: NOT-A-GAP. *Implementation*: give `parseRdr` a typed mode
(or a sidecar type map) and use it in `uiVarValueOfSpec`; test: `SOUND_VOLUME`'s spec value is a real 1.0.

---

## 5. Text and fonts

### 5.1 UIMNLOC_UTF8_READING
`uiLoc.ts:18`. The decode was outside the searched range: `FUN_0039f0c0` (D:L294576-294595) decodes and
`FUN_0039f160` (D:L294600-294620) gives the length, called by the text measure and draw (`FUN_00362350`,
`FUN_003625e0`, `FUN_00362b70`). Lead < 0xC0: itself (a lone 0x80-0xBF stays); 0xC0-0xDF: (lead - 0xC0) x 0x40 +
(b1 - 0x80), no continuation check; >= 0xE0: lead x 0x1000 + (b1 - 0x80) x 0x40 + (b2 - 0x80) truncated to 16 bits
(so E2 82 AC -> 0x20AC), unless b1 is 0 (then one byte). The fonts carry such codes (0x152, 0x160, 0x178, 0x201E,
0x20AC: `fonts_typed.out`). `loc_utf8_scan.py`: the LOC tables hold 1095 two-byte sequences, all well-formed, no
three-byte, no lone byte. RESOLVED, PROVEN. *Implementation*: replace the reading with the engine's decoder (adds
three-byte sequences; same result on the disc); apply it to captions too, since the text code decodes every string.

### 5.2 FONT_DUP_GLYPH_READING
`uiFont.ts:20`. `FUN_0035bef0` inserts each record with `FUN_0035c3a0`, a find-or-insert (returns the existing node
when the key is equal, D:L256956-256975), and `FUN_0035c2c0` **appends** an element (D:L256901-256909); the scalar
fields (+0x12 baseline, +0x18 texture, colour) are written by each record (D:L256849-256868). So code 96 of
font_text_01 has two elements (UL (118,25), LR.x 127 and 126) drawn on top of each other, its width the larger
(127). `glyphmap_rdram.py`: 13 font_text_01 maps in the PCSX2 title RAM hold **184** entries for 185 records.
RESOLVED, STRONG (the draw of a two-element glyph loops over elements; visually the 127 one dominates).
*Implementation*: merge duplicate codes by appending elements; test: glyph 96 has two elements, width from LR.x 127.

### 5.3 UNKNOWN_GLYPH_LAST_RESORT_READING
`face.ts:210`. In all 13 maps found in the PCSX2 title RAM, `*(map + 0xc)` is the node keyed **0x20**, the minimum key
(`glyphmap_rdram.out`). RESOLVED, PROVEN. No change.

### 5.4 FRONT_END_TEXT_ROWS_READING
`layout.ts:20`. `DAT_0049e9a0` / `DAT_0049e9a8` read 0.0 / 0.0 in the PCSX2 title dump, 5.0 / 6.0 in game
(`textrows_rdram.out`). PROVEN. Doc to "read".

### 5.5 CAPTION_FACE_DEFAULT_READING
`dialogScreen.ts:43` (named in a test). `FUN_003696d0` (D:L264444-264445) calls each record's create (vtable +0x10)
with `menu + 0x210`, the face built from the dialog's FONT (`FUN_00359c40` D:L263505). The creates set it first, e.g.
`FUN_0037d220` (slot 0x407ca0 of vtable 0x407c90; D:L274961) and the text/button creates `FUN_0037de60`,
`FUN_0037e730`, `FUN_00380470` (`FUN_00362b20(text, param_2)`); a spec naming FONT then builds and sets its own face
(`FUN_003792f0` D:L273052-273064). RESOLVED, PROVEN. No change.

### 5.6 ARROW_VISIBILITY_READING
`wrapped.ts:116`. The arrow images' +0x18 = `FUN_00364e50` (clear +0x14 bit 0x40), +0x1c = `FUN_00364e30` (set it);
the 2D draw `FUN_00364950` returns unless the bit is set (D:L261907-261911, `FUN_00364e10` D:L262080). +0x18 hides,
+0x1c shows. PROVEN. Doc to "read".

### 5.7 WRAP_HASH_B_READING (note only)
`#B` toggles the draw state's byte +0x21 (D:L260507-260509, D:L260628-260630); with it set a glyph's alpha is
`(int)(1.5 x alpha)` (`DAT_003e0338` = 1.5 in .data; D:L260652-260655, D:L260702-260705), colour unchanged. A
WRAPPEDTEXT line starts with the flag the previous line left (`FUN_00379f70` D:L273500, D:L273522-273535 -> line +0x8c
-> `FUN_00362900` D:L260683). RESOLVED, PROVEN. *Implementation*: carry the bright flag across wrapped lines (the plain
text layout already applies 1.5, per research 141's "bold -> 247").

### 5.8 LOC_TEXT_BYTES_READING
`codes.ts:48`. Port-internal; exact on the disc (above). NOT-A-GAP.

---

## 6. zanim runtime

### 6.1 QUAT_PRODUCT_READING
`zanimRuntime.ts:154`. `vu0_quat.py` decodes the helpers' VU0 words: cross = VOPMULA/VOPMSUB .xyz then VSUB **.w**
(w = 0); scale = VMULbc **.xyzw** (all four lanes); add = VADD .xyzw; dot = VMUL .xyz + two VADDbc .x (3-component).
`FUN_003070c0`: out = p1 x p2 (w 0); += p2.w p1 (w lane w1w2); += p1.w p2 (w lane 2 w1w2); then `lwc1 $f2, 0x4c($sp)`
reads the second scale's w lane (= w1w2) and `out.w = out.w - (w1w2 + dot3)` = **w1 w2 - v1.v2**. The "uninitialised
word" is that lane. RESOLVED, PROVEN: the Hamilton product p1 x p2 exactly. Doc to "read".

### 6.2 CALL_SET_SEARCH_READING
`zanimRuntime.ts:147`. **Contradicted**, STRONG. `FUN_0026a250` (D:L115027-115072) searches first the set
`(manager+0x34 - manager+0x1c) / 0x34`; the manager is 0x414bb0, so +0x34 is `DAT_00414be4`. Its writers (grep of both
forms): `FUN_0026c600` (a set's activation, D:L116330: `DAT_00414be4 = set`), the loaders `FUN_00267ab0` /
`FUN_00267fa0` (D:L113535, D:L113682: the set just loaded), the clear (D:L113825). So the first set is the one last
activated or loaded -- in the front end the newest dialog's `UIanim` set (activated at its build, research 141) --
not necessarily the caller's. Then every other set in load order; `set::name` names a set (`"::"` at 0x3ed260). The
remaining step: no writer through another pointer was found. *Implementation*: keep a manager-level `currentSet`
updated on set activation and load; search it first. Test: a script of set A calling a name defined in both A and B
after B was activated runs B's.

### 6.3 DIALOG_NODE_STATE_READING
`zanimRuntime.ts:176`. `FUN_003696d0` (D:L264484-264485): position = (float XPOS, float YPOS, 0) via `FUN_003157d0`
(+0x30/+0x34/+0x38), +0x9c = the record's OPACITY (default 1.0, `FUN_00383360` D:L278303-278308). The node ctor
`FUN_00316e30` (D:L215816-215844) sets identity (`FUN_001bff28`), +0x9c 1.0, and `FUN_00317060(n, 0)` sets +0x5c bit 0
= 1 (active, D:L215911-215917). RESOLVED, PROVEN. Doc to "read".

### 6.4 ZANIM_RAND_SOURCE (note only)
`FUN_00197740` is newlib `rand()` (socom2_names.csv): `x = x * 0x5851f42d4c957f2d + 1` (64-bit, `__muldi3`), returns
`(x >> 32) & 0x7fffffff` (D:L14526-14536). `srand` (`FUN_00197728`) is called once at boot with a sum of
`sceCdReadClock` fields, then with `rand()` (D:L249645-249651). The state is shared by 291 call sites. RESOLVED,
PROVEN: replay is impossible (clock-seeded, shared); a caller-supplied random is right. Optionally implement the LCG
for fidelity of distribution.

---

## 7. Models (UI 3D pass)

### 7.1 UI_MODEL_FOCAL_READING
`models.ts:83`. The UI scene loader `FUN_00318da0` (D:L217197-217205) copies the `cameras/camera` record (0x90 bytes,
strings 0x3f6cc8 "cameras", 0x3f6ba8 "camera") into the camera at +0xc0 (record +32 -> +0xe0, +36 -> +0xe4), then calls
`FUN_00291490(0x3f1c61aa, cam, 1)`: **+0xe0 = 0.6108652 rad = 35 deg**, overwriting the record's 0.7854; +0x290 =
+0x4b0 (320) x cot(35 deg) = **457.0076** (D:L137437-137450). The projection (`FUN_00294070` D:L138949-138952) puts
m00 = m11 = +0x470 x +0x290 / +0x4b0 = cot(35 deg) (+0x470 = +0x474 = 1.0). `camera_rdram.py`: the PCSX2 title dump's UI
camera (the one with +0xe4 = 0.54978, the record's value) reads +0xe0 0.610865, +0x290 457.007, m00 = m11 1.42815;
across = m00 x 0x470 x 0x4b0 = 457.0 px/unit. The research's measurement (455 +- 5, both axes) agrees. RESOLVED, STRONG
(the y axis's VU1 viewport factor was not read; the code would give 448 x cot = 640 if it used +0x4b4, which the
measurement rules out). *Implementation*: `UI_MODEL_FOCAL = 320 / Math.tan(0.6108652)` = 457.0076 for both axes;
rescore the main-menu captures.

### 7.2 UI_MESH_BIND_READING
`uiCompositorView.ts:90`. UNRESOLVED. Searched: the bind packet path (`FUN_003c3ce0` UNPACK reference) and UI_GEO's
packets (no register writes). Whether VU1 kicks the bind when all triangles of a mesh are culled is in the VU1
microcode, not read. Moot on the roller (all twelve bind 0x48). **Owed**: a GS dump (`gs_dump`) of the main menu with
an all-culled roller face, or a read of the UI mesh microprogram's kick.

### 7.3 SPIN_SCREEN_SENSE_READING
Defined `viewer/src/armoryView.ts:51`. Research 140 (L110-119) confirmed the frame for rotations about x on the roller.
The matrix order is now read (v.Local.Parent). The y spin's on-screen sense still owes a capture: PARTIAL, BELIEVED.
**Owed**: two PCSX2 frames of the ARMORY preview 0.2 s apart (the near side's direction).

### 7.4 UI_MODEL_DRAW_ORDER_READING
Already read (research 112 R112.2; research 141 sec 2: CMenuState Tick 0x1f4700-0x1f47dc draws backplane, 3D,
foreplane). NOT-A-GAP; retire the viewer constant's "reading" wording.

---

## 8. Unnamed items

- **uiLoc.ts:230** (a drawn object's caption vs its UIVAR): for a BUTTON, the set-up looks the var up
  (`FUN_003857c0` on the registry 0x437e80) and, when bound, refreshes the caption from it (vtable +0x8c,
  `thunk_FUN_00376bd0` D:L271490-271503): the var wins when it exists. PARTIAL, BELIEVED (other classes not read).
- **listbox.ts:236**: RESOLVED (see LISTBOX_ROW_FLAG).
- **movieLayer.ts:27** ("the menu's own clear was not read"): RESOLVED (see FRAME_CLEAR).
- **engineOrder.ts:54** (the ring list near to far): not researched (3D world order); lead: `FUN_00339de0`
  D:L236851-236945.

## 9. Sourced but not implemented (multiplayer-relevant or visible on the online path)

- The **TimedText** list column (TYPE 2) staggers its rows' reveal (start = list +0x160 + k x +0x164): lists on the
  online screens that use TYPE 2 reveal row by row (`LISTBOX_REBUILD_CONTENT_PASS`).
- **GetContents** serialises a list's rows into a var with int/float/string typing -- scripts that read a server list
  back depend on it.
- **DISABLED** and **COLOR** cells on array rows (server/room lists) are applied by the original.
- The options' **SOUND_VOLUME / DIALOG_VOLUME / BRIGHTNESS** vars are reals on the disc.
- **PlayMPEG in game** plays only when the local network body's +0xe1 bit 0x10 is set (`PLAYMPEG_GATE`).

## 10. Leads for other workstreams

- **C7 (`MOVIE_HOLD_READING`)**: in the menu state the flip clears the next draw buffer to black every frame
  (`DAT_004a4511` = 1, packet 0x3e0a00); the movie uploads into it after; so a menu tick with no new picture is black
  under the dialog, not the previous picture. STRONG.
- **C5b (`EE_FPU_ROUNDING_READING`, f32.ts)**: no `madd.s` in `FUN_00362b70`, `FUN_00363c20`, `FUN_0035a7b0`
  (`ee_madd_scan.out`): separate `mul.s` / `add.s`, each rounded.
- **C5b (`TOKEN_TYPE_READING`)**: the compiled `.rdr` keeps node types; `parseRdr` drops them (see UIVAR_SPEC_TOKEN).
- **C5a (`NODE_ACTIVE_FLAG_READING`)**: the 2D node vtable (node+0x60 = 0x4067b0) +0x38 = 0x1ec450 writes +0x5c bit 0
  and returns the old bit -- one flag. STRONG (assuming FUN_00263aa0's vtable is node+0x60's).
- **C4 / armory**: `TEXT_FADE_ALPHA_READING` and `TELETYPE_CURSOR_READING` in the viewer are superseded (above).
- The UI planes, the 3D world and the models all go through the pipe at 0x4887c0 (`FUN_00336c10`), whose opacity
  stack and visual queue (`FUN_003381f0`, `FUN_003374c0`) are shared -- useful for anyone porting world fades.

## 11. Verification (V4, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V4-verify-ui-audio-card.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V4/`). V4 verified C4, C5a, C5b, C6, C7, C8 and C9 (34 claims sampled). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table). V4's tally over its 34 sampled claims: CONFIRMED 29, CONFIRMED-WITH-CORRECTION 5, WRONG 0, UNVERIFIABLE 0.

Verifier V4, research wave 2026-10-04. Read-only. Scripts and their saved outputs are in `scratch/V4/` (README there).
`D:L<n>` is a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). `$PORT` is the
`agent/online` snapshot named in the brief. No decompiled text is quoted.

**Method.** I sampled 34 claims, at least 4 from each report. I took every must-include claim, then the "the port is
wrong" claims and the PROVEN/STRONG rows an implementer would act on. Where I could, I re-derived each one by a
different route from the author's:
- I disassembled the ELF myself instead of trusting the decompiler.
- I read `.data` vtables to fix slot meanings.
- I scanned raw disc bytes instead of using the author's parser.
- I read the cells in the PCSX2 dumps.
- I re-ran the C5b unicorn script and decoded C8's netcnf files with my own key build.

I then checked each claim against `$PORT` to confirm that the port does what the report says.

**Result.** No claim in the sample is wrong. 29 are confirmed as written. 5 are confirmed with a correction:
- In two of them the stated value or answer is right but the reasoning or wording is not. For `CheckTeamStatus`
  (C5b) this matters for the implementation.
- In the other three a detail needs adding.

### 11.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 2 | the same focal (457.0076) replaces the port's fitted 455 | C6 | CONFIRMED | same evidence; `models.ts:83` = 455; the float the game stores is 457.0074 (457.0076 is exact 35 deg), a 4th-decimal nit |
| 18 | no alpha test: alpha-0 texels write depth | C6 | CONFIRMED | 537 TEST_1 = 0x5000c (ATE 0, ZTE 1, GEQUAL) by a raw byte scan; ZBUF ZMSK 0; the only ZMSK=1 packet (0x3e0a80) is gated off (`DAT_003e1408` = 0x80) |
| 19 | a full-screen black clear sprite every menu frame | C6 | CONFIRMED | 0x3e0a00: TEST ALWAYS, PRIM 6 no ABE, RGBAQ 0, XYZF2 (1728,1824)-(2368,2272), Z 0; sent when `DAT_004a4511` = 1 (1 in menu/title dumps, 0 in game) |
| 20 | the teletype cursor is grey 128,128,128, not the text colour | C6 | CONFIRMED | D:L281206 `FUN_00364930(128.0 x3)` writes +0x30..+0x48; no recolour among the class's calls; port `drawList.ts:144` uses the text colour |
| 21 | three UIVAR VALUEs are float 1.0 that the port types int | C6 | CONFIRMED | my typed read: SOUND_VOLUME, DIALOG_VOLUME, BRIGHTNESS are type 2, 1.0; the port's `rdr.ts` prints "1" and `uiVarValueOfSpec` makes it an int |
| 22 | the movie picture lands at y = (448-h)/2 rounded to 32 rows (ties down) | C6 | CONFIRMED | D:L208702-208715 rounds blocks to a multiple of 0x140 with `> 0xa0` rounding up; `DAT_003df350` = 448 |

### 11.2 Claims 1-2: The UI camera's focal (C4 UI_CAMERA / MODEL_CAMERA, C6 UI_MODEL_FOCAL) -- CONFIRMED

- **Independent route.** I disassembled the ELF around the world loader (`v_camera.py`). At 0x3191ec-0x319200 the
  code does `lui $v0,0x3f1c; ori $v0,$v0,0x61aa; ... mtc1 $v0,$f12`, so the first float argument is 0x3f1c61aa
  = 0.6108652 rad = 35.0000 deg. That is the operand the decompiler shows at D:L217205.
- `FUN_00291490` (D:L137431-137451) stores it at +0xe0 and writes +0x290 = +0x4b0 x (1 / tan).
- `FUN_00294070` hands +0x290, +0x470 and +0x474 to `FUN_001c0410`, a view-screen matrix of the
  `sceVu0ViewScreenMatrix` shape (scrz, ax, ay, cx, cy...). With ax = ay = 1, both axes use 457 px per unit in the
  640 x 448 buffer. So the projection is square in buffer pixels.
- **Dump.** menu.rdram, camera 0xd6df20: +0xe0 = 0.6108652, +0x290 = 457.0074, +0x4b0 = 320.
- **Port.** `armoryView.ts:39` has fovY pi/4, which is 224 / tan(pi/8) = 540.78. `ui/compositor/models.ts:83` has 455.
  Both reports are right that the port is wrong.
- **Nit (C6).** C6 writes 457.0076, which is 320 / tan of exactly 35 deg. The game's float32 is 457.0074. Use
  `320 / Math.tan(0.6108652)` and test to 3 decimals.
- **Side note.** The camera's culling planes (+0x1c4..+0x1d4) use a linear 35 x 448/640 = 24.5 deg vertical
  half-angle. That is a frustum approximation, not the projection. C4 mentions it correctly; an implementer should not
  take 24.5 deg as the projection's fovY.

### 11.3 Claim 18: Alpha test off; depth written -- CONFIRMED (STRONG as graded)

- **Independent route.** I scanned the raw bytes of all 58 texture files for A+D qwords with register 0x47, without
  C6's ZAR walker. 537 hits, all 0x5000c: ATE 0, ZTE 1, ZTST 2 (GEQUAL).
- I decoded the ELF packets (`v_gsenv.out`):
  - the env packet (0x3e0880) and the per-flip packet (0x3e0980) set TEST_1 = 0x5000d (ATE 1) and ZBUF_1 ZMSK 0;
  - each texture bind then turns ATE off.
- **What C6 did not mention.** One packet, 0x3e0a80, sets ZBUF ZMSK 1. It is sent only by `FUN_003afba0`, when
  `DAT_003e1408 != 0x80`. That word is 0x80 in the ELF, menu.rdram and title_pcsx2.rdram, so depth writes stay on.
- The remaining assumption is C6's own: VU1 sends no TEST_1 of its own.

### 11.4 Claim 19: The black clear -- CONFIRMED

- 0x3e0a00 decodes to TEST_1 ZTST ALWAYS, PRIM 6 (sprite, ABE 0), RGBAQ 0, XYZF2 (1728,1824) and (2368,2272), Z 0,
  then TEST_1 back.
- D:L304825-304828 sends it after the flip packet when `DAT_004a4511` != 0. That flag is set by the menu Init
  (D:L53495) and cleared by the game Init (D:L50953). I read it as 1 in menu*, rank*, title_ours and title_pcsx2, and
  0 in every in-game dump.
- It also resets depth to 0 each menu frame.

### 11.5 Claim 20: The teletype cursor is grey -- CONFIRMED

- D:L281206 `FUN_00364930(0x43000000 x3, cursor)`, with the body at D:L261882 writing +0x30/+0x34/+0x38 and
  +0x40/+0x44/+0x48. The other calls in D:L271000-282000 are the same 128s on other objects; none recolours +0x100.
- **Caution for the implementer.** This is an untextured quad, so 128 is 128/255 (50 % grey). It is not the "128 = 1.0"
  modulate convention of textured quads. Draw `rgb(128,128,128)`, not white.

### 11.6 Claim 21: Three UIVARs are floats -- CONFIRMED

My own typed walker over `RUN/UI/READERC.ZAR` reads type 2, 1.0 for SOUND_VOLUME, DIALOG_VOLUME and BRIGHTNESS, and
type 2 for MUSIC_VOLUME 0.5 and HEADSET_CONTROLLER 0.75. The port's `archive/src/rdr.ts:30` prints 1.0 as "1", and
`widgets/host.ts:131` turns that into `int`.

Note: C6's out file labels the source `READERC.ZAR`. The file is `RUN/UI/READERC.ZAR`, not `RUN/READERC.ZAR`.

### 11.7 Claim 22: The movie rectangle -- CONFIRMED

D:L208702-208715 computes `(448 - h) x 5` blocks and takes `% 0x140`. A remainder above 0xa0 rounds up, otherwise down
(a tie goes down), then the result is clamped at 0. `.data` 0x3df350 = 448. C6's h = 352 -> y = 32 example checks out.

### 11.8 What an implementer should take from this (the verifier's list, for all seven reports)

- Every sampled "the port is wrong" claim held. The changes the reports propose for the camera, popup focus, `atofF32`,
  `IsNetwork`, the alpha-0 depth write, the cursor colour, UIVAR typing, movie gain, fade stepping, the default range,
  register-2 flooring, netcnf `nic`, the persona key, MC handles, the zoom fog and the zoom LOD can be acted on.
- Two of those need the adjustments above:
  - `CheckTeamStatus`: implement the predicate `w437ce8 && (b45a0c0 || w441470)`, not "no game exists".
  - The cursor: grey means 128/255 on an untextured quad.
- Three small ones:
  - The menu tick is 29.97 Hz.
  - Reuse `SOUND_DEFAULT_RANGE`.
  - Use 457.0074, the game's float, as the focal.
