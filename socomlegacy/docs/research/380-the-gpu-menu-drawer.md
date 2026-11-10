# 380 -- The GPU menu drawer

**GM, 2026-11-01 (the GPU menus lane; plan [`../plans/2026-11-01-gpu-menus.md`](../plans/2026-11-01-gpu-menus.md); the
owner's words, relayed through the workflow request: "rebuild our menu systems to use GPUs. Production grade.").**
This note is the **skeleton** GM-00 lands: the contract the GPU drawer is held to and the rules it reproduces, carried
from the plan's understanding notes and the code's own constants. Nothing in it is new evidence. **Every row of §2 is
reading, pending review**: it counts as a reading only once the reviewer of the task that implements it has re-read
its citation at the source (eight of the decompilation citations were checked for existence only -- the function at
the cited `D:L`, within 0-2 lines -- by the plan's critique, none for what it shows). Sections §1, §3 and §6 are
filled by the tasks the plan names; until then they say so. §3 is GM-04's, §4 GM-05b's (2026-11-01).

What the drawer is: the menus' software compositor (`packages/viewer/src/uiCompositorView.ts`,
`rasterizeUiDrawList`) is the repository's transcription of the GS rules the original's menus draw through (research
112, research 185 §3, research 141). The GPU drawer reproduces **that transcription**, not the GS itself: byte-identity
with the GS (`GS_INTEGER_RASTER`: the integer `>>7` blend, 1/16 bilinear weights, 1/16 corners, the Z buffer at its format, unread) is a later
simulation-track task, done in the reference first (GM.R14). A change to a rule here changes both drawers, in one task.

"Software line" below is `packages/viewer/src/uiCompositorView.ts` on `main` at `cbe52f724` (unchanged there since
`agent/hd-ui4x`'s `855bc5df0`, against which the rows were first written).

## 1. The equality contract

Four classes of equality against `rasterizeUiDrawList` on the same list, textures and options:

- **E (exact):** 0 bytes differ.
- **E\* (exact, near-tie caveat):** asserted 0 bytes; a failure is a **finding**, explained as an f32/f64 near-tie or
  fixed; the bound is never widened.
- **B (bounded):** within `GPU_RASTER_TOLERANCE_ADAPTATION`: max |Δ| per channel and the counts of pixels at |Δ| ≥ 1,
  2, 3.
- **C (capture):** every pinned `judge` row reproduces to its printed digit when the GPU frame is scored instead of the
  software frame, by the same scorer functions in Node (GM-11c), from a frame the browser wrote out.

The tolerance, per class -- the software rasterisers and the GPUs (GM.R5; GM-27 review finding 1): **provisional** --
max(the f32 twin, SwiftShader), measured in GM-11b, gates no flip; **pinned** -- per class, max(twin, that class's
runs): the software rasterisers' class from SwiftShader and llvmpipe, the GPUs' from every run (each real backend's), GM-27,
dated, with the host and `UNMASKED_RENDERER_WEBGL` named ("one backend only" said where only one ran). The twin's leg is measured (§1.1).

**Pinned, GM-27, 2026-11-09 (reading: the re-pin's review PASS WITH FINDINGS, high, reproduced byte for byte, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`): one vendor only (NVIDIA: D3D11 x2, Vulkan x1) plus SwiftShader
and llvmpipe** -- the owner's ruling, 2026-11-09T01:41Z in seat redotcom-46: "NVIDIA only, said" (AWS offers this
account no AMD GPU; the host's Intel iGPU is off). `GPU_RASTER_TOLERANCE_ADAPTATION` (`packages/viewer/src/uiGpuTolerance.ts`,
its data `uiGpuToleranceData.ts` written by `tools/gm-pin-tolerance.ts`) holds two classes (GM-27 review finding 1), each
per run key (case@scale/mode/blend, the 312 of GM-03's table at 1, 2 and 4), field by field: **`software`**, the max over
every line's f32 twin and the SwiftShader and llvmpipe records; **`gpu`**, the max over the twin and every record (a
software record enters it only where it exceeds the hardware's). The parity spec holds a run to the class its renderer
names (`isSoftwareAdapter`, `uiGpuSwitch.ts`: SwiftShader, llvmpipe, Microsoft Basic Render Driver are software; any
other renderer, AMD and Intel included, the GPUs'). Nine parity records, each named with its host, renderer and sha:

| backend | renderer (`UNMASKED_RENDERER_WEBGL`) | host, head | max \|Δ\| | largest count at \|Δ\| >= 1 |
|---|---|---|---|---|
| ANGLE D3D11 | NVIDIA RTX A4500 (0x00002232) | the owner's second PC, `7a1a4f1c6` (2026-11-09) | 1 (R, G, B) | 5931 (13.warm/hot@4x ff) |
| ANGLE D3D11 | NVIDIA GeForce RTX 4070 SUPER (0x00002783) | the owner's host, `c438dd514` (2026-11-04; models then L1) | 1 (R, G, B) | 5931 |
| ANGLE Vulkan | NVIDIA Tesla T4 (0x00001EB8), Vulkan 1.4.329 | AWS g4dn.xlarge, `21df7aeb0` (2026-11-09) | 1 (R, G, B) | 5931 |
| SwiftShader | SwiftShader Device (Subzero), Vulkan 1.3.0 | the same three hosts, and the AWS box `932f4d986` | 1 (R, G, B) | 176 (13.warm/hot@4x ff) |
| llvmpipe | Mesa llvmpipe (LLVM 20.1.2), OpenGL 4.5 | the AWS box, `932f4d986` and `a34cb3c09` | 1 (R, G, B) | 167 (13.warm/hot@4x exact) |

**The `software` class** is the twin's and the software rasterisers' own: non-zero on the same 40 keys, cases 6 and 13
(`ff` 6@2x 60, 6@4x 162; 13.cold 14 / 28 / 64 and 13.warm/hot 43 / 84 / 176 at 1x / 2x / 4x; `exact` 13.cold 7 / 16 / 33,
13.warm/hot 44 / 79 / 167), so a software-rasteriser regression is no longer hidden under NVIDIA's counts. **The `gpu`
class:** the three NVIDIA runs agree to the pixel count on every key: the pinned bound is theirs where it exceeds the twin and
the software rasterisers, on cases 6 and 13 under `ff` (6@2x 72, 6@4x 216; 13.cold 354 / 1437 / 5826 and 13.warm/hot
370 / 1461 / 5931 at 1x / 2x / 4x) and case 13's `exact` legs (13.cold@4x 40, 13.warm/hot@1x 48): NVIDIA's
fixed-function blend and filtering rounding one unit apart from the software on textured HD pixels, never more. Every
other key is the twin's (its largest 168, 13.warm/hot@4x ff) or 0; max |Δ| is 1 on every key, alpha 0 on every key. Each of the other 22 parity records
under the evidence root (the T4's earlier runs, the GM-14a/15a/15c boxes) gives the same pin, both classes, field for field. **Re-pinned 2026-11-09** (`agent/gm-repin`; the plan's Log
2026-11-09T18:35Z) with four more records at `cf124a15c` carrying GM-30's loading leg (the A4500 and the 4070 SUPER on
D3D11, each with its host's SwiftShader; now NVIDIA: D3D11 x4, Vulkan x1): GM-03's 312 keys unchanged, and the loading
leg's 18 keys (exact only) added, the same in both classes, max |Δ| 1 (`loading.black` 0) and at most 1814 pixels at
|Δ| >= 1 (`loading.alpha192@4x`).

Its guard (the lane holder's ruling, GM-27): a pin past |Δ| 1 on any channel of any key, or counting a pixel at |Δ| >= 2,
is refused at load with the key named (`checkTolerancePin`, `UI_GPU_TOLERANCE_MAX_ABS` = 1), never taken as a wider bound;
both classes are checked; an E or E\* run under `exact` must pin 0 in both, and the parity spec asserts its 0 bytes
whatever the bound. The parity spec holds every run to the pin's class when no `S2U_UI_GPU_PARITY_BOUND` is given, and
to the named file when one is; GM-30's loading leg is held to the pin's loading keys since the re-pin above (a loading
run a pin lacks runs with its B recorded unjudged, "B unjudged: no pinned bound yet"), and a file bound must still
hold its runs. Evidence kind: the pin is read from rendered browser runs on real GPUs and on the software rasterisers
(`summary.jsonl`, `renderer.json`); the spec's default bound is written and unit-tested, and the flip's runs held J3p to
the pin on the RTX 4070 (D3D11) and the T4 (the plan's Log 2026-11-09T10:12Z, 13:27Z); no capture comparison. Not measured: a second vendor (ruled out above), a low-end iGPU, GM-04's
corpus on a real GPU.

What every rendered browser run must hold: E 0 bytes; E\* 0 bytes or a written finding; B within the pinned bound; C
every pinned row unchanged (`uiCompositorScore` 95.8/60.2/true, 98.1/38.2/true, 97.1/63.8/true; CREATE GAME
98.1/75.2/true and 97.9/73.9/true; every other pinned row, from the one shared table of GM-11c). Absent references are
skipped by name: `mb10_pcsx2`, `s4_pcsx2`, `menu_explore`, `pcsx2_mission_*`, `SOCOM_PARITY_ARCHIVE`.

**How a C row is scored on a GPU frame (GM-11c, 2026-11-09; the instrument, reading: its fresh review PASS WITH FINDINGS, folded, the GPU menus plan's Log 2026-11-09T06:23Z).** The scorer's
functions are one module, `socomlegacy/tools/test/menuCaptureScore.ts`, moved without a change of number from
`uiCompositorScore.test.ts` (PLAT-14's `crop` and `inPcsx2Window`, W7.R7; the score is `captureScore.ts` `judge`); its
`MENU_C_ROWS` is the one shared score table: per row the frame it scores, the reference under `SOCOM_PC_ROOT`
(`scripts/parity/`), the view (as drawn, or squeezed into PCSX2's 4:3 box), band, mask and the pinned digits (95.8/60.2/
true, 98.1/38.2/true, 79.4, 97.1/63.8/true, 94.9, 80.7/false, 98.1/75.2/true, 88.2, 97.9/73.9/true). **A frame writer
must name its frames exactly as `MENU_C_FRAMES` (exported there): `dlgMenu.rdr`, `dlgMenu.rdr hide LoadGameBack` (that
node's `visible` false) and `dlgCreateGame.rdr`, each drawn as built with MENUFADER at 0, scale 1, opaque, in the
header's `dialog`.** `uiCompositorScore.test.ts` scores through the rows, its literals unchanged, its frames drawn by
the moved `menuCaptureFrames.ts` (`drawDialog`). `tools/menu-gpu-compare.ts --frames <dir>` reads each GM-11b frame
file's header line (`e2e/uiGpuParityRecord.ts`, `s2u-ui-frame/1`), scores every frame whose `dialog` is a row's frame --
each blend and each of `gpu`/`cpu` its own line, renderer and presenter path (`software` for an L1 frame) beside it --
by `scoreCRow`, and writes the table (the pin as the software score, this frame's, the delta, the result). **A row
passes when every field it pins is equal at the scorer's printed digit** (`judge` rounds to one decimal). No root, no
reference, another scale or transparent, or no frame naming the dialog: skipped by name. An unreadable frame file, a
truncated frame, a wrong-size reference: an `error` line by name. Exit (review F1-F4): 2 usage (no or empty `--frames`,
an `--out` inside the root), 1 a fail, 4 an error, 3 nothing scored, 0 only when a row scored and none failed. Held by
`tools/test/menuGpuCompare.test.ts`: a software frame drawn in Node by the reference path, written as a frame file,
reproduces all nine (dev-disc); the rules on a synthetic reference (no data). **The writer (GM-31, written, not run):**
`e2e/uiGpuMenuFrames.spec.ts` draws the three `MENU_C_FRAMES` as `drawDialog` does (no tick, so no tick matching) through
the front end's GPU surface and its software path, asserts the GPU frames L0, writes them and runs this tool, failing on
any exit but 0; until a box runs it **no C row has been scored on a GPU frame** (the 4070's files hold cases only). The other
capture scorers (`widgetScore`, `popupPlaceScore`, `netLoginScore`, `personaScore`, `connectScore`, `universeScore`,
`usagePolicyScore`, `worldOfSocomScore`, `mainMenuDisc`, `mainMenuMovie`, `menuEntryFadeDisc`, `titleMenuDisc`) score a
dialog driven to a state by a script, a movie or a rig, which no frame file names; they join the table when the parity
spec writes those states (owed, GM-11c's row).

### 1.1 The f32 twin's leg (GM-08, 2026-11-02; reading, pending review)

`packages/viewer/src/uiGpuTwin.ts` runs a plan as the shaders and the fixed-function blender will: every operation
rounded to f32, in the software's operand order, step-tagged S1-S13 (quads) and T1-T12 (models), each tag mapped to
its P/M row, its software line and its readings (`UI_GPU_TWIN_STEPS`; `uiGpuShaderTwin.test.ts` pins the order and
each step's arithmetic as source text, and compares the GLSL's tags once GM-11a-2 writes it). The fixed-function
blender is a model (`UI_GPU_TWIN_UNORM_ADAPTATION`: f32 blend of [0, 1] values, one round to nearest even), not a
measurement; correctly rounded division and no FMA contraction (the plan's risk 4 is measured against the GPU in
GM-11b/GM-27). Evidence kinds apart: **unit tests** (the case table, seeded lists) and a **dev-disc test** (GM-04's
corpus); no browser, no GPU.

- **The exact class** (an untextured quad with f32-exact integer colour and alpha byte, or a non-finite code; a clear;
  a whole overwrite at alpha byte 128): **0 differing bytes** on every case at 1, 2, 4, opaque and transparent, under
  `ff` and `exact`, on 12 seeded lists, and on the corpus (226,615,051 / 180,205,532 / 720,837,328 class pixels at
  1/2/4 under each table; 226,929,451 / 180,222,300 / 720,904,400 at GM-08's 0e0cc6e44, before CPS-4b). Model pixels
  are outside the class (M2-M5 B; GM-06b review F1's ruling owed).
- **Layered == sequential** (GM.R7): every case, every seeded list, and the corpus's 11,260 runs with programmable
  batches: 0 differing.
- **B on the case table:** 0 on every case but 13.cold/.warm/.hot (the HD texture): max |Δ| 1, 112-582 pixels at
  |Δ| = 1 over the case's 12 runs (pinned, `TWIN_B` in `uiGpuTwin.test.ts`).
- **B on the corpus** (1x every distinct frame, 6,538; 2x and 4x 348 frames each, sampled: every entry's first and last
  distinct frame, dlgMenu, CREATE GAME and the ARMORY every 8th; `UI_GPU_TWIN_CORPUS_B`):

  | Scale, table | max \|Δ\| (R/G/B/A) | pixels at \|Δ\| ≥ 1 / 2 / 3 | ppm ≥ 1 | outside model boxes: max \|Δ\|, ≥ 1 / 2 / 3 |
  |---|---|---|---|---|
  | 1x exact | 123/112/76/1 | 3,621,874 / 3,550 / 1,685 | 1932.10 | 3/3/3/1; 3,614,560 / 1,785 / 34 |
  | 1x ff | 123/112/76/1 | 10,266,546 / 3,550 / 1,685 | 5476.73 | 3/3/3/1; 10,258,757 / 1,785 / 34 |
  | 2x exact | 29/29/29/1 | 1,242,458 / 67 / 36 | 3113.04 | 2/2/2/1; 1,239,670 / 23 / 0 |
  | 2x ff | 29/29/29/1 | 2,488,382 / 67 / 36 | 6234.76 | 2/2/2/1; 2,485,330 / 23 / 0 |
  | 4x exact | 82/52/40/1 | 4,958,106 / 272 / 185 | 3105.69 | 2/2/2/1; 4,946,793 / 60 / 0 |
  | 4x ff | 82/52/40/1 | 9,977,372 / 272 / 185 | 6249.70 | 2/2/2/1; 9,964,848 / 60 / 0 |

  The table and `UI_GPU_TWIN_CORPUS_B` were re-pinned 2026-11-06 (GM-08 measured them at 0e0cc6e44: 1x exact
  1929.46 ppm, each leg 0.27 to 9.04 ppm lower than now), measured on origin/main 13cdc9a48 (the tally on the host, the
  twin on box s1f), the same excess on GM-15b's branch; the cause is CPS-4b's VIDEO OPTIONS rows (40e037620, 10ff4f3a8):
  more 2D quads, unchanged model columns, 0 differing pixels, exact class 0 bytes. These pins are readings of the port's
  own output, not the original's.

  Outside the model boxes the twin is within |Δ| 3 (|Δ| ≥ 3 on 34 pixels at 1x, none at HD; where those pixels lie was
  not traced -- the transparent overlay's divide, P22, which magnifies a 1 in the alpha, is a guess, not a finding). The large |Δ| are all inside model
  boxes: **finding 1** below.
- **Finding 1 -- the software's depth tie is per pixel, not "the first drawn wins".** The software stores `invW` as f32
  and tests the next triangle's f64 `invW` against it (`uiCompositorView.ts:437`). dlgMenu's roller draws each label's
  `_on` and `_off` faces on one geometry, additive; where the f32 store rounded down the second face draws again (the
  pixel doubles), where it rounded up it does not -- a speckle (dlgMenu.rdr frame 2 at 1x: 2,103 differing pixels, up to
  |Δ| 84). The ARMORY's worst frames (the corpus's worst at 1x and 2x/4x `exact`) are inside model boxes too; whether
  they are the same tie was not traced. A GPU's f32 depth with `GREATER` never draws the second face; the GS's `ZTST GEQUAL`
  (research 185 §3.1, pending review) would always draw it. Neither reproduces the software. Held by a unit test
  (`uiGpuTwin.test.ts`, "finding: the software's tie ..."). `UI_MODEL_DEPTH_FORMAT_READING`'s correction is its own
  simulation-track task, software first (GM.R14); until it, these pixels are B and their |Δ| sets the models' bound.
  *Resolved by GM-15d (2026-11-09; the plan's Log, R1 resolved by (a)):* the software, the twin and the GPU now test
  the f32 depth `>=` the f32 store (`TEST_1` ZTST GEQUAL), so the second face draws at every pixel it covers on all
  three, and the speckle is gone (M3 below; the unit test is now "GM-15d: coplanar triangles ..."). The twin's B record
  (`UI_GPU_TWIN_CORPUS_B`) was measured before it and is re-measured by the next dev-disc run.
- **Finding 2 -- an opaque frame's alpha is not always 255** (P14 × P23). A quad whose alpha is NaN or infinite stores
  the alpha 0 on an opaque frame too, and later quads raise it by `A + (255 − A)·min(1, a)`; P14's "alpha `colorMask`
  off" cannot follow (seeded lists: alpha |Δ| up to 223 masked). The twin models `ONE_MINUS_DST_ALPHA, ONE` on both
  frames (255 exactly over A = 255), held by a unit test; P14's GPU column is for GM-11a-2 and the reviewer to change.
- **GM-07 review F2's two mutations:** the depth tie `<` for `<=` is caught by four seeded tie lists (exact dyadic ties,
  counted) on the executor and the twin; the modulate `r (c / 128)` for `(r c) / 128` is an identity in IEEE arithmetic
  (division by 2^7 is exact), shown over every texel byte in f64 and f32 -- no frame can catch it.

## 2. The parity contract

Each row: the GS rule as the software transcribes it, its source in the original (carried, **reading, pending
review**), the software line, how the GPU reproduces it, its class (scale 1 defaults to `exact`, HD to `ff`, GM.R6),
and the test that holds it. `cases` is `test/uiRasterCases.ts` (GM-03), `exec` is `test/uiFramePlan.test.ts` (the f64
CPU executor equals the reference, GM-06a/b), `twin` is `test/uiGpuTwin.test.ts` with `uiGpuShaderTwin.test.ts`
(GM-08, §1.1).

### 2.1 The 2D rules

| # | GS rule (as the software transcribes it) | Source in the original (carried) | Software line | GPU reproduction | Class | Test that holds it | Level |
|---|---|---|---|---|---|---|---|
| P1 | Draw order: clear, movie, backplane, 3D pass, foreplane; tree order, no z-sort | `FUN_00369170` D:L264251-264259; walk `FUN_00336a60` D:L235063-235110; research 112 R112.2 | `drawList.ts` L11-23; :333-399 | Steps in plan order; runs merge only consecutive quads with the same (path, blend, texture); no sort, no atlas | E | exec (order); cases; parity spec | reading, pending review |
| P2 | ALPHA_1 carried through the list: a textured bind sets it; an untextured quad uses it as it stands; a missing bitmap or the no-picture movie quad leaves it; a models item's per-triangle bind leaves it as the software leaves it for the next quad | `FUN_00354f80` D:L252772-252832 → `FUN_003c3ce0` D:L315838-315872; `FUN_003643b0` D:L261658-261707; env packet 0x3e0880 (research 141 §2); `GS_ALPHA_FRAME_START_READING`, `UI_MESH_BIND_READING` | :352-399, :418-440 | Resolved on the CPU in `uiRasterRules`; each step carries its blend | E | exec (`plan.registerAfter`); cases 10, 12, 18 | reading, pending review |
| P3 | Coverage `ceil(min) <= x < ceil(max)` at integer pixels | GS sprite rule as transcribed; 1/16 corner truncation pending review (research 185 §3.3); `GS_SPRITE_COVERAGE_READING` | :208 | CPU f64 integer rectangle | E | exec; cases 7, 14; parity spec | reading, pending review |
| P4 | Clip inclusive, scaled to `x0·s .. (x1+1)·s − 1` | as P3 | :209-210, :346 | Folded into P3's rectangle (no GL scissor) | E | exec; case 14 | reading, pending review |
| P5 | Texel at the integer pixel: `u = uv0 + du·(x − x0)/dx`, f64, multiply then divide | sprite ST `FUN_00364c50` D:L262025-262030, `FUN_00364830` D:L261808-261817 | :250-254, :275 | Axis table (GM.R3) | indices E; weights B | exec; twin; parity spec | reading, pending review |
| P6 | Bilinear at `u − .5`; neighbours wrapped `((i % n) + n) % n` | `TEX1_1` 0x60, REPEAT (research 185 §3.1, pending review); `UI_TEXTURE_FILTER_READING`, `UV_REPEAT_READING` | `sample` :165-176; :255-299 | Four `texelFetch` taps on `RGBA8UI`, in the reference's order (S6/S7) | B | twin + drift; case 6; parity spec | reading, pending review |
| P7 | Nearest (dev `uiSampling` only), `floor(u)` | none: an adaptation (research 260) | :255, the nearest branch | Axis table without −0.5 (GM-14d) | B | until GM-14d: the software frame at the shown scale, dev only (GM.R9) | reading, pending review |
| P8 | Modulate: RGB `min(255, t·c/128)`, alpha `(ta/255)·(ca/128)` unclamped | MODULATE `TCC` 1 (research 185 §3.1); `GS_MODULATE_BLEND_READING` | :301-302 | The same formula in f32 on integer texels | B (E\* untextured) | twin; cases 1, 5 | reading, pending review |
| P9 | Untextured colour as it stands, alpha `rgba[3]/128`; skipped only when the colour is finite and the alpha exactly 0 | the alpha byte, `vftoi0` in `FUN_001bfef8` D:L40841-40853 | :214-231 (:217) | Skip in the planner; `* 0.0078125` | E / E\* | exec; cases | reading, pending review |
| P10 | Source blend 0x44 `C + (r − C)·a`, `a` may exceed 1 | env packet 0x3e0880 (research 141 §2) | :313-317 | `exact`: programmable. `ff`: `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` only when `0 ≤ a ≤ 1` is provable, else programmable | prog E\*; ff B | cases 1, 11; twin | reading, pending review |
| P11 | Additive 0x48 `C + r·a` | as P10 | :309-312 | `exact`: programmable. `ff`: `ONE, ONE` with `min(1, r·a/255)` for finite `a ≥ 0`, else programmable | prog E\*; ff B | cases; twin | reading, pending review |
| P12 | Store: round half to even, clamp 0..255, NaN to 0, after every quad | `COLCLAMP` 1 (research 185 §3.1); `DTHE` unread (`GS_BLEND_ROUNDING_READING`, §4) | `Uint8ClampedArray` (:336) | prog: `roundEven(clamp())`; ff: unorm, implementation-defined | prog E\*; ff B | twin; parity spec, both legs | reading, pending review |
| P13 | Untextured fractional fades (MENUFADER, the entry fades) | captures `mb10_pcsx2/s06_burst_010..016` (research 141 R141.7; absent on this host) | :214-231 | Always programmable, at every scale | E\* | twin; case 20 (a fade ramp, every step); `menuEntryFadeDisc` on the GPU frame through GM-11c on a host holding `mb10_pcsx2`, else "fade C evidence: none" said | reading, pending review |
| P14 | Frame alpha bookkeeping `A + (255 − A)·min(1, a)` | no source: an adaptation for the transparent overlay | :308, :192, :220 | Opaque and transparent alike: programmable, or ff `ONE_MINUS_DST_ALPHA, ONE` on the frame's alpha (`UI_GPU_FF_BLEND`, `uiGpuShaders.ts`; the twin's `S10ff_alpha`), as the CPU executor (`uiFramePlanCpu.ts` :105, on both frames) and the software (`uiCompositorView.ts` :196, :204, :234, :314, on both frames) blend it; so on an opaque frame a `prog` quad's NaN alpha stored as 0 (P23, `uiFramePlanCpu.ts` :104) is raised by a later `ff` quad there too. The opaque canvas has no alpha channel (`UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION`, `alpha` false), so no displayed pixel depends on it (controller ruling, GM-08 review F1; was alpha `colorMask` off, refiled 2026-11-04) | prog E\*; ff B; opaque and transparent alike | case 4 over source alpha 0, 64, 128, 192, 255 (case 19), against the pre-divide buffer | reading, pending review |
| P15 | `clear`: packed bytes, alpha 255 even on a transparent frame | the frame, `FUN_003b1200(0)` D:L305271-305395 | :355-359 | Bytes from `uiRasterRules`; `clearColor(k/255)` | E | case 9 | reading, pending review |
| P16 | Movie with no picture: a black untextured quad, alpha 128, source blend, the register untouched | `MOVIE_HOLD_READING` (contradicted, §7) | :360-373 | A quads step not touching the register | E | case 10; exec | reading, pending review |
| P17 | Movie picture: an RGB copy at the origin, alpha untouched, nearest `s×s` | `MOVIE_RECT_READING` (contradicted, §7) | :364-371 | `texelFetch(movie, p / s)`; `colorMask(rgb)`; blending off | E | case 8; the movie upload test (GM-11a-3) | reading, pending review |
| P18 | Glyphs: a per-quad bind, texel corners as given, `su, sv` under HD, the item clip, `RIGHT_EDGE_SUBTEXEL` 15/16 | `FUN_003635c0` D:L261089-261169, `FUN_00361bd0` D:L260235-260474, `FUN_00364f30` D:L262144-262154, `DAT_003e0340` D:L260407-260408 | :383-392; `layout.ts` | Integer corners (E); texels through the axis table; bold alpha 192 is programmable | coverage E; texels B | exec; cases 1, 11, 12 | reading, pending review |
| P19 | A `widget` is not drawn and is named in `undrawn` | -- | :393-395 | Planner | E | exec | reading, pending review |
| P20 | A missing bitmap is not drawn; the register is unchanged | -- | :377, :386, :429-431 | Planner | E | case 10 | reading, pending review |
| P21 | Scale 1 is the original transcription; `at` is the identity | HD-3/HD-4 (OT.R92, HD.R8): the scale is a browser adaptation | :345 | `s = 1`, no `·s` arithmetic | as above | exec at 1 | reading, pending review |
| P22 | A transparent result divided back to straight RGB for `putImageData` | none: an adaptation | :403-406 | Not done: a premultiplied canvas (`UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`); compared against the pre-divide buffer | E/B pre-divide | case 4 | reading, pending review |
| P23 | NaN, ±∞ and out-of-range colours sanitised | none (the software's behaviour) | the store | `zeroMask` and the closed code table on the CPU; such quads are programmable | E | case 5 | reading, pending review |

### 2.2 The models (the roller, the ARMORY)

| # | Rule | Source (carried) | Software line | GPU | Class | Test | Level |
|---|---|---|---|---|---|---|---|
| M1 | Drop zero-area triangles; cull when the mesh culls; a per-triangle bind | `UI_MESH_BIND_READING` | :418-440 | Planner, the same f64 numbers | E | exec; case 18 | reading, pending review |
| M2 | Bounding box `ceil(min)..ceil(max)`; barycentrics at the integer pixel; **the GS's top-left fill rule** (GM-15d): a pixel whose edge function is 0 is the triangle's only on a left edge (the interior at +x) or a top edge (horizontal, the interior at +y), the winding's sign applied (`modelEdgeOwns`); before GM-15d inclusive on every edge | the GS's fill rule, hardware, in no repository source (`UI_MODEL_EDGE_RULE_READING`, §4); the port's own GS reading for its 2D quads is the same half-open rule (research 185 §3.3) | `drawModels` (the three edge functions and `modelEdgeOwns`) | Integer box; the three edge functions in the software's order; `discard` unless `owns()` on each (T3; `T3_inside`/`T3_owns`) | B (f32 edge ties) | case 2 (a shared edge drawn once, by its top/left owner, at equal `invW` and where the later triangle is nearer; GM-15d re-pinned its "twice"); case 17 (the hypotenuse out); the seam squares (every seam pixel once at 0.7 and the dyadic depths; on a real GPU, GM-31's `e2e/uiGpuSeams.spec.ts`, written, not run); twin T2-T3 | reading (GM-15d's fresh review PASS WITH FINDINGS, folded; the GPU menus lane batch review, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`) |
| M3 | Depth: the f32 of `invW`, tested **GEQUAL** against the f32 store (GM-15d), 0 = empty; the later of two equal depths wins; before GM-15d an f64 `invW` strictly greater than the f32 store, the first winning (the R1 artefact, §5) | `TEST_1` 0x5000c: ZTE 1, ZTST GEQUAL (research 185 §3.1, re-read §11.3); `ZBUF_1` 0x3a000118: ZBP 0x118, PSMZ16S, ZMSK 0, at ELF 0x3e0940 (the env packet 0x3e0880) and 0x3e09f0 (the per-flip packet 0x3e0980), not patched at run time (`FUN_003aff30` patches FRAME_1 and XYOFFSET only, D:L304822-304823; its pointers set by `FUN_003b1180` at D:L305249-305250); the 16-bit store not modelled (`UI_MODEL_DEPTH_FORMAT_READING`, `UI_MODEL_DEPTH_QUANTISE_READING`, §4) | `drawModels` (`z >= depth[i]`) | `DEPTH_COMPONENT32F`, `GEQUAL`, cleared to 0, a power-of-two `depthScale` | B (ties) | case 3 (the later wins); the coplanar faces doubled on all three; twin T4-T5 | reading (GM-15d's fresh review PASS WITH FINDINGS, folded; the GPU menus lane batch review, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`) |
| M4 | Perspective-correct texel and colour | the colour has no source (`UI_MODEL_GOURAUD_READING`, §4) | :447-450 | From the barycentrics and the three `invW`, in the shader | B | twin T6-T7 | reading, pending review |
| M5 | Texture at `(u·W, (1 − v)·H)`, REPEAT, `sample()`'s lerp form | `UI_MODEL_TEXTURE_ROWS_READING`, `UV_REPEAT_READING` | `sample` :165-176 | T8, in its own order | B | twin; drift | reading, pending review |
| M6 | `al <= 0` writes no colour and no depth | `UI_MODEL_ZWRITE_READING` (contradicted, §7) | :458 | `discard` before any write | E (rule) | case 16: an alpha-0 texel in front of an opaque triangle -- the opaque one shows and its depth wins | reading, pending review |
| M7 | The frame alpha is not raised | -- | :460-474 | Alpha `colorMask` off | E | case 17: a model over a transparent frame -- the frame's alpha bytes unchanged | reading, pending review |
| M8 | Focal 455 | `UI_MODEL_FOCAL_READING` (contradicted, §7) | `models.ts` L83 | Upstream, unchanged | -- | `packages/ui` tests | reading, pending review |

## 3. The G0 tally

*GM-04, 2026-11-01 (dev disc; reading, pending review).* `packages/viewer/test/uiGpuTally.disc.test.ts` walks the
menus' draw lists as the page makes them from the disc and counts, at the scales 1, 2 and 4, what the GPU drawer's
fixed-function blend cannot take. It writes the tables below between the markers (`GM04_TALLY_WRITE=1`) and, in its
ordinary run, fails when they differ from what it computes. It skips without the disc, naming it.

**The corpus.** The 114 members of READERC and READERX -- 110 names, READERX's four (`dlgExitState`,
`dlgMultiplayerFinal`, `dlgMultiplayerFinalReally`, `dlgMultiplayerRound`) being READERC members too, which a deep
link builds (`dialogLookup`, READERC first) -- each a deep link run 60 frames at 30 Hz, a row named by its start
dialog (an ONSTART may switch within the 60 frames); `dlgMenu` with MENULOOP, 300 frames (the two fades, the roller's
turn); CREATE GAME through the rig's PLAY LIST, each of its four maps focused (`packages/ui/test/screens/createGameRig`);
the shared ARMORY on MP51 for each side, opened as the lobby opens it (`LobbyArmory.open`), 60 frames and then into the
kit's rows (the weapons' models shown); the in-match Settings overlay, its first page and down and into its rows; the
loader screens' whole sequence. The movie's pictures are the black stand-in (`BlackPictureSource`): a picture is a copy
step, whatever its pixels.

**The routing counted** (the planner's, under `ff`: `quadRoute` in `packages/viewer/src/uiFramePlan.ts`, GM-06a): a
quad is programmable for *colour* (P23: a non-finite value, a negative RGB, an untextured RGB over 255, a non-finite
alpha), for a *negative* alpha (P10, P11), for an alpha *over 1* under the source blend (P10: `rgba[3] > 128`), or as a
*fade* (P13: an untextured quad whose alpha byte is neither 0 nor 128); the first that holds. GM-04 first counted P13
as 0 < `rgba[3]` < 128, which left dlgMenu's MENUFADER packed to 254 under the roller's additive on `ff` (GM-04 review
F1); GM-06a's planner routes it a fade, and the tally now calls the planner's routing. The tables below did not change
with it: they count each frame's most, and dlgMenu's fading frames already held one full-frame fade. The
`ALPHA_1` each quad and triangle is drawn under is walked as the software walks it (`GS_ALPHA_FRAME_START_READING`,
`blendAfterBind`, `UI_MESH_BIND_READING`). A model triangle is counted by the same rules over its three vertices. At
scale 1 every quad takes the programmable path anyway (GM.R6, `exact`); the counts are what `ff` at HD would hand on.

**What it finds** (the numbers are the tables'):

- **Programmable quads: fades only.** No quad needs the programmable path for its colour, a negative alpha or a source
  alpha over 1: under the source blend no alpha byte exceeds 128 anywhere in the corpus (no bold glyph, P18's 192, is
  drawn in its states). The largest byte, 254, is `dlgMenu`'s MENUFADER under 0, packed (`packedAlphaByte`, research
  141 §2), drawn under the roller's additive bind. Every entry whose MENUFADER fades has one programmable full-frame
  quad in its fading frames; the cinematics have two (MENUFADER and the TELETYPE cursor). The counts are the same at
  every scale; only the pixels grow (times 4, times 16).
- **Model triangles: none programmable.** The ARMORY draws up to 228 in a frame, the roller 12; no vertex alpha exceeds
  128 and none is negative. **GM-26 is not needed by this corpus**: no frame of it drops to L1 for its models. A state
  outside the corpus (another map's weapons, a script's fade of a model) is not counted.
- **Alpha bytes that are not whole numbers** come from three paths that do not pack the alpha: the ARMORY's quads
  (`armoryLayout.ts` L376, L398, L403: `alpha * 128`; the smallest 12.800000190734863, Float32 0.1 x 128); the TELETYPE
  cursor (`@s2u/ui` `drawList.ts`, TELETYPE_CURSOR_READING: the cinematics' `Mission_title`, `dlg_Map82`'s
  `teletype_text`); and the loader screens' fade (`loaderScreens.ts` L292, 128 x (scale - ALP) / scale). The dialogs'
  quads and glyphs are whole (`packedAlphaByte`; `layout.ts` `packedWords`). Where the original's quad goes through
  `FUN_003643b0` its alpha is `vftoi0`'s whole byte (D:L261694, D:L261699; `FUN_001bfef8` D:L40841-40853, re-read
  2026-11-01): if the ARMORY's quads and the TELETYPE cursor take that path, the port's fractional bytes contradict it
  -- which path each takes is not read here, and a correction is its own simulation task (GM.R14). The loader's fade is
  the display's PMODE `ALP` blend, not a GS quad (research 130), so `vftoi0` does not apply to it.
- **The write-mask probe holds at every scale.** On each entry's last frame the software drawer, given a probe list
  made of the frame's quads (each through its own fill loop, textured or untextured, on an additive white texel), writes
  exactly the pixels `coverageBounds`' rectangles cover, as many times as they cover them: 0 pixels differ at 1, 2 and
  4. The movie's picture copy and the models are not probed.

- **Re-filed 2026-11-06:** dlgOptions_Video.rdr's quads 465 -> 566, the Settings overlay's 463 -> 568, and the probe's
  pixels written (30289170 / 121156680 / 484626720 -> 30293362 / 121173448 / 484693792), measured on origin/main
  13cdc9a48 (the tally on the host, the twin on box s1f), the same excess on GM-15b's branch; the cause is CPS-4b's
  VIDEO OPTIONS rows (40e037620, 10ff4f3a8): more 2D quads, unchanged model columns, 0 differing pixels, exact class 0
  bytes. These pins are readings of the port's own output, not the original's.

<!-- GM-04 tally: begin (written by packages/viewer/test/uiGpuTally.disc.test.ts) -->

| Over the corpus | Scale 1 | Scale 2 | Scale 4 |
|---|---|---|---|
| Entries | 116 | 116 | 116 |
| Entries with a programmable quad | 100 | 100 | 100 |
| Programmable quads, most in one frame, by reason | fade 2 | fade 2 | fade 2 |
| Programmable pixels, most in one frame | 286848 | 1147392 | 4589568 |
| Model triangles, most in one frame / programmable | 228 / 0 | same | same |
| Largest alpha byte (2D) / model vertex alpha | 254 / 128 | same | same |
| Quads with a fractional alpha byte (quad-frames) | dlgAlbaniaCinematic.rdr (29); dlgAlgeriaCinematic.rdr (29); dlgBrazilCinematic.rdr (29); dlgRussiaCinematic.rdr (29); dlg_Map82.rdr (13); ARMORY (MP51, seal) (172260); ARMORY (MP51, terrorist) (166793); Loader screens (the sequence) (19) | same | same |
| Probe on each entry's last frame: pixels written / differing | 30293362 / 0 | 121173448 / 0 | 484693792 / 0 |

| Entry | Frames | Quads (most in a frame) | Alpha byte min .. max | Fractional alpha bytes | Programmable quads, most in a frame, by reason (scale 1 / 2 / 4) | Programmable pixels, most in a frame (1 / 2 / 4) | Model triangles (most) | Programmable triangles | Model alpha max | Probe px differing (1 / 2 / 4) |
|---|---|---|---|---|---|---|---|---|---|---|
| Common_AOP_Obj.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| Common_AOP_Stars.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| Common_Brief_Btn.rdr | 60 | 1 | 128 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| Common_Brief_Obj.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgAfterErrorReboot.rdr | 60 | 270 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgAfterReboot.rdr | 60 | 297 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgAlbaniaCinematic.rdr | 60 | 395 | 0 .. 128 | 29 | fade 2 | 286848 / 1147392 / 4589568 | 0 | 0 | -- | 0 |
| dlgAlgeriaCinematic.rdr | 60 | 411 | 0 .. 128 | 29 | fade 2 | 286848 / 1147392 / 4589568 | 0 | 0 | -- | 0 |
| dlgArtGal2.rdr | 60 | 1093 | 25 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgAttractCinematic.rdr | 60 | 1 | 0 .. 125 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgBrazilCinematic.rdr | 60 | 401 | 0 .. 128 | 29 | fade 2 | 286848 / 1147392 / 4589568 | 0 | 0 | -- | 0 |
| dlgCareerStats.rdr | 60 | 590 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgClanLadderLobby.rdr | 60 | 174 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgControllerPresets.rdr | 60 | 255 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgControllerPresetsCS.rdr | 60 | 158 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgControllerPresetsNewGame.rdr | 60 | 601 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgControllerPresetsRG.rdr | 60 | 174 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgControllerSelection.rdr | 60 | 518 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgCreateClan.rdr | 60 | 972 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgCreateGame.rdr | 60 | 700 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgCredits.rdr | 60 | 292 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgDebriefing.rdr | 60 | 95 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgDownloadPatch.rdr | 60 | 496 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgExitState.rdr | 60 | 832 | 25 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgFriendList.rdr | 60 | 345 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgGameComplete.rdr | 60 | 57 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgGameLobby.rdr | 60 | 352 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgHype.rdr | 60 | 38 | 89 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgIgnoreList.rdr | 60 | 195 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgIntroCinematic.rdr | 60 | 1 | 0 .. 125 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgIntroScreen.rdr | 60 | 270 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgInvitedPlayers.rdr | 60 | 253 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLadderLobby.rdr | 60 | 397 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLANBriefingRoom.rdr | 60 | 336 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLANConnect.rdr | 60 | 82 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLANPlayerName.rdr | 60 | 172 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLAN_Options.rdr | 60 | 251 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgLoad.rdr | 60 | 40 | 89 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgMakeMusicMovie.rdr | 60 | 1093 | 25 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgManageRoster.rdr | 60 | 231 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgManageRosterLeader.rdr | 60 | 396 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgMenu.rdr | 60 | 250 | 0 .. 254 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 12 | 0 | 128 | 0 |
| dlgMISSIONSELECTION.rdr | 60 | 328 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgMPBriefingRoom.rdr | 60 | 440 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgMPswitch.rdr | 60 | 421 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgMultiplayerFinal.rdr | 60 | 258 | 34 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgMultiplayerFinalReally.rdr | 60 | 580 | 28 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgMultiplayerRound.rdr | 60 | 234 | 34 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgNetAbandoned.rdr | 60 | 1062 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetAbort.rdr | 60 | 94 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetAuthenticate.rdr | 60 | 95 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetBanned.rdr | 60 | 166 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetConnect.rdr | 60 | 138 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetError.rdr | 60 | 1062 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetLogin.rdr | 60 | 421 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetPlayerName.rdr | 60 | 296 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetServerSelect.rdr | 60 | 275 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgNetUnlockableExtras.rdr | 60 | 624 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgOnlineFilters.rdr | 60 | 497 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgOnlineOptions.rdr | 60 | 358 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgOptions_Audio.rdr | 60 | 349 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgOptions_Menu.rdr | 60 | 271 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgOptions_Video.rdr | 60 | 566 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgPlayTutMovies.rdr | 60 | 1093 | 25 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgRespondToInvites.rdr | 60 | 280 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgReturnFromNTGUI2.rdr | 60 | 270 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgReturnFromNTGUI2LAN.rdr | 60 | 270 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgRussiaCinematic.rdr | 60 | 381 | 0 .. 128 | 29 | fade 2 | 286848 / 1147392 / 4589568 | 0 | 0 | -- | 0 |
| dlgScreenAdjust.rdr | 60 | 235 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgSecondCinematic.rdr | 60 | 1 | 0 .. 125 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgSelectRank.rdr | 60 | 232 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgSetSOP.rdr | 60 | 472 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgSetTaunts.rdr | 60 | 260 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgUsagePolicy.rdr | 60 | 234 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlgWorldOfSOCOM.rdr | 60 | 1062 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_areaop_albania.rdr | 60 | 431 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_areaop_Algeria.rdr | 60 | 443 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_areaop_brazil.rdr | 60 | 415 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_areaop_russia.rdr | 60 | 395 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alb51.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alb52.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alb53.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alg71.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alg72.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Alg73.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Brazil61.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Brazil62.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Brazil63.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Russia81.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Russia82.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Brief_Russia83.rdr | 60 | 217 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_CharUnlock.rdr | 60 | 614 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_equipment_main.rdr | 60 | 367 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_equipment_mp.rdr | 60 | 163 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map51.rdr | 60 | 280 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map52.rdr | 60 | 296 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map53.rdr | 60 | 274 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map61.rdr | 60 | 268 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map62.rdr | 60 | 232 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map63.rdr | 60 | 280 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map71.rdr | 60 | 282 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map72.rdr | 60 | 268 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map73.rdr | 60 | 270 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map81.rdr | 60 | 238 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map82.rdr | 60 | 266 | 0 .. 128 | 13 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_Map83.rdr | 60 | 280 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| dlg_WeapUnlock.rdr | 60 | 614 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| mp_rooms.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| UiParams.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| uisounds.rdr | 60 | 0 | 0 .. 0 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| dlgMenu + MENULOOP (300 frames) | 300 | 250 | 0 .. 254 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 12 | 0 | 128 | 0 |
| CREATE GAME (PLAY LIST, four maps) | 121 | 1142 | 0 .. 128 | 0 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |
| ARMORY (MP51, seal) | 270 | 703 | 12.800000190734863 .. 128 | 172260 | 0 | 0 / 0 / 0 | 228 | 0 | 128 | 0 |
| ARMORY (MP51, terrorist) | 270 | 657 | 12.800000190734863 .. 128 | 166793 | 0 | 0 / 0 / 0 | 198 | 0 | 128 | 0 |
| Settings overlay (in match) | 184 | 568 | 25 .. 128 | 0 | 0 | 0 / 0 / 0 | 0 | 0 | -- | 0 |
| Loader screens (the sequence) | 96 | 2 | 0.5019607843137255 .. 128 | 19 | fade 1 | 286720 / 1146880 / 4587520 | 0 | 0 | -- | 0 |

<!-- GM-04 tally: end -->

Re-filed 2026-11-07 (V13-2, OT.R58 as amended by #723): CREATE GAME's "Quads (most in a frame)" 1084 -> 1102 (+18).
The PLAY LIST holds five rows (The Ruins the fifth); the corpus still focuses its first four, and the most-quads frame
draws THE RUINS' extra row (the list's glyph quads 94 -> 116 in a probe's raw count of the rig's frames, +22; the tally counts +18). No
other cell changed.

Re-filed 2026-11-08 (V13-3, Blizzard the sixth): CREATE GAME's "Quads (most in a frame)" 1102 -> 1118 (+16), the
tally's own write mode on agent/v13-3e; no other cell changed. The sixth row, 1 BLIZZARD, is the only change to the
frame; no glyph probe was run this time (+16 against The Ruins' +18 fits a row of one glyph fewer -- an inference).

Re-filed 2026-11-08 (DF-14, Fish Hook and Desert Glory the seventh and eighth): CREATE GAME's "Quads (most in a
frame)" 1118 -> 1142 (+24), the tally's own write mode (`GM04_TALLY_WRITE=1`) on agent/df-14-offer with `SOCOM_DISC`;
no other cell changed. The list's window now holds seven of the eight rows at the opening; no glyph probe was run.

Re-filed 2026-11-09 (agent/fix-gate-reds, the 0b6cf4a17 data view's red): the CREATE GAME row's label back to
"four maps" -- the DF-14 review fold (b2833137b) wrote "eight maps" here but not in the corpus, whose case is named
"PLAY LIST, four maps" (`packages/viewer/test/uiGpuCorpus.ts`) and focuses the list's first four rows of its eight; the
count, 1142, is DF-14's and unchanged (the tally re-run on 617f6451f with `SOCOM_DISC`). No other cell changed.

Filed as `UI_QUAD_ALPHA_RANGE_READING` (§4), reading, pending review.

## 4. Readings: the unknowns forced into the open

*GM-05b, 2026-11-01.* The software already decided each of these without a source; each is now a constant in
`packages/viewer/src/uiRasterRules.ts` equal to today's behaviour (nothing in the drawer changed), named where the code
does it (`uiRasterRules.ts`, `uiCompositorView.ts`), and held by `packages/viewer/test/uiRasterReadings.test.ts`, which
drives the software and shows the behaviour each value names (and, where the GS's rule would give another byte, that
byte). **Each is reading, pending review**: the decompilation citations are the author's, not yet re-read by a reviewer.
"Unread" means the rule is the GS's hardware (or VU1's microcode), which no line of the decompilation shows. The
spellings were checked against research 112 and 185 first: neither names any of the nine.

| Name | What the software does today (the value) | Where the original stands | What would settle it | Status |
|---|---|---|---|---|
| `GS_BLEND_ROUNDING_READING` | Float64 blend (0x44 `C + (r - C) a`, 0x48 `C + r a`), stored through `Uint8ClampedArray` after every quad: clamp 0..255, round half to even, NaN to 0 | the GS's integer blend `((A - B) C >> 7) + D`, `COLCLAMP` 1 (0x3e0880, research 185 §3.1); `DTHE` written by the per-flip 0x3e0980 (`FUN_003aff30` D:L304731-304835, research 141 §2), its value in no note; the arithmetic unread | the GS's `>> 7` blend transcribed at its source, and a console capture of a fader ramp (`mb10_pcsx2/s06_burst_*`, absent on this host) scored byte for byte | reading, pending review |
| `GS_BILINEAR_WEIGHT_READING` | the texel coordinate's full Float64 fraction (`columnAxis`, `rowAxis`, `sample`) | `TEX1_1` 0x60 LINEAR on every UI bind (research 185 §3.1); the weight's 1/16 step is the hardware's, unread | the GS's 1/16 fraction, and a capture of a scaled sprite | reading, pending review |
| `GS_SPRITE_SUBPIXEL_READING` | the corners stay Float64 into `coverageBounds` | `FUN_003643b0` maps each corner (`DAT_0049ea00` + x `DAT_0049e9f0`, D:L261689-261690, D:L261696-261697) and sends it through `vftoi4` (`FUN_001bfee8` D:L40826-40838; D:L261695, D:L261700): x 16, truncated -- a 1/16 corner (research 185 §3.3). An untransformed quad's position is an int (D:L261675-261679), so its corners are whole either way | a reviewer's re-read of the two functions, and a capture of a scaled node's quad (a 0.5-scaled one, research 185 §3.3) | reading, pending review |
| `UI_MODEL_EDGE_RULE_READING` | **GM-15d:** the GS's top-left rule -- a pixel of the box whose three edge functions, times the winding's sign, are not negative, and on an edge (a function exactly 0) only a left edge (the interior at +x) or a top edge (horizontal, the interior at +y) (`modelEdgeOwns`, `uiRasterRules.ts`); before GM-15d inclusive on every edge | the meshes reach the GS through VU1; the GS's triangle fill rule is the hardware's, in no repository source. The port's own GS reading for its 2D quads is the half-open rule (research 185 §3.3), and `drawModels`' doc already said "top-left" while its code was inclusive (the R1 report, 2026-11-09). Filed as the lane holder's choice between readings (the plan's Log, GM-15d), both values recorded: inclusive (the port's before) and top-left (now) | a GS dump of the roller's and the terrorist ARMORY's first frames, replayed draw by draw (whether a shared-edge pixel is written by one triangle), then a console capture scored | reading (GM-15d's fresh review PASS WITH FINDINGS, folded; the GPU menus lane batch review, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`; a capture owed) |
| `UI_MODEL_DEPTH_FORMAT_READING` | **GM-15d:** invW computed in f32, each operation rounded (`modelDepthF32`, the GPU's arithmetic; the disc fold), in a Float32 buffer per pass, 0 empty; a pixel draws when its f32 depth is `>=` the stored f32 (GEQUAL), so the later of two equal depths wins; before GM-15d the f64 invW had to be strictly greater, the first winning | the bind packets' `TEST_1` 0x5000c, ZTE 1, ZTST GEQUAL (research 185 §3.1, re-read §11.3); `ZBUF_1` 0x3a000118 = ZBP 0x118, **PSMZ16S**, ZMSK 0, read off the ELF at 0x3e0940 (in the env packet 0x3e0880) and 0x3e09f0 (in the per-flip packet 0x3e0980), and not patched at run time: `FUN_003aff30` (D:L304731-304835) patches only FRAME_1's FBP and XYOFFSET's y (D:L304822-304823) through the pointers `FUN_003b1180` sets at D:L305249-305250 (the R1 report, 2026-11-09; this note's "format stated by no note" is corrected). The GEQUAL test is the original's; the 16-bit store is the next row's | a reviewer's re-read of the two packets and the per-flip function; a GS dump of two overlapping model faces | reading (GM-15d's fresh review PASS WITH FINDINGS, folded; the GPU menus lane batch review, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`) |
| `UI_MODEL_DEPTH_QUANTISE_READING` | **GM-15d:** none -- the f32 invW is compared as it stands, no 16-bit quantisation and no Z scale | the GS stores a 16-bit Z (PSMZ16S, the row above) of the integer Z each vertex's XYZF2 carries (`FTOI4`; desktop research 12 at `desktop@be5578311:docs/research/12-vu1-entry0-ui-path.md` L530-626, the recompilation's VU1 dumps); the menus' own VU1 lists, so their Z scale, are unread, and with them which f32 depths one Z unit merges (a tie band far wider than an f32 ulp: the later triangle wins inside it) | the menus' VU1 lists decoded for their viewport's Z scale, or a GS dump of the roller and the ARMORY giving each vertex's Z | reading (GM-15d's fresh review PASS WITH FINDINGS, folded; the GPU menus lane batch review, `agent-mail/evidence/mega/REVIEW-GM27-AND-GM-BATCH.md`) |
| `UI_MODEL_GOURAUD_READING` | a model's vertex colour interpolated perspective-correctly (by 1/w), as its texel | the GS interpolates colour screen-linearly and only STQ by 1/w; the meshes' PRIM is VU1's, unread | the meshes' PRIM (IIP) read, and a capture of a lit roller face | reading, pending review |
| `UI_2D_QUAD_Z_READING` | a 2D quad carries no depth: list order only, never tested against the 3D pass | each quad's XYZ2 carries a Z: `DAT_004a44e0` untransformed (`FUN_003643b0` D:L261681-261683), the transformed point's otherwise (`FUN_00308640`, D:L261686-261687), the first corner's for both (D:L261691); `TEST_1` ZTE 1 GEQUAL on the binds (research 185 §3.1). `DAT_004a44e0`'s value unread | `DAT_004a44e0` read, and a capture of a 2D quad over the roller | reading, pending review |
| `UI_TEXTURE_WRAP_READING` | every bitmap repeats on both axes (`wrap`; `UiBitmap` carries no clamp) | each texture's `CLAMP_1` in its bind packet (`FUN_00354f80` D:L252786-252801 for `FUN_003c3ce0`); research 185 §3.1: REPEAT on 536 of 537 binds, CLAMP on `UI_TXR/specular_map.tif` | whether the menus draw `specular_map.tif`, and a per-texture clamp where one does | reading, pending review |
| `UI_QUAD_ALPHA_RANGE_READING` | the alpha taken as it stands, `rgba[3] / 128`, unclamped and possibly fractional (255 gives 1.9921875); GM-04's tally (§3): the menus send 0 .. 254, whole on the dialogs' quads and glyphs, fractional on the ARMORY's quads, the TELETYPE cursor and the loader's PMODE fade | `vftoi0` (`FUN_001bfef8` D:L40841-40853; `FUN_003643b0` D:L261694, D:L261699) into a PACKED RGBAQ whose alpha is the low byte (research 141 R141.5): a whole 0..255 | the tally reviewed; which draw path the ARMORY's quads and the TELETYPE cursor take in the original (a whole byte there would make the port's fractional bytes a contradiction, its own task under GM.R14) | reading, pending review |

| `LOADING_PANEL_ALPHA_CLAMP_READING` | since GM-22's code step (2026-11-09) the loading panel draws its quads as `UiDrawItem`s (`loadingPanel.ts` `loadingDrawList`) through the menus' rasteriser behind the presenter seam (`CpuUiPresenter`): the alpha as it stands, `rgba[3] / 128`, unclamped (P8-P10, `UI_QUAD_ALPHA_RANGE_READING`), the fader an untextured MENUFADER quad. Until then it drew each quad through Canvas 2D at `globalAlpha = min(1, alpha / 128)` (`loadingPanel.ts` L207, L219; the fader L197, on `855bc5df0`): an alpha over 128 clamped to 1 | **the menus' own path, so no clamp**: LoadState's Init builds its `dlgLoad.rdr` screen as MenuState builds a menu -- the same `CGameMenu` constructor `FUN_00369b60` and builder `FUN_00368570` (LoadState `FUN_001f6660` D:L55818, D:L55826; MenuState `FUN_001f4860` D:L54824, D:L54856) -- and its Tick `FUN_001f5e70` draws it with `FUN_003691c0` (D:L55769), which hands the screen object itself to the walker `FUN_00336c10(0x4887c0, ...)` (D:L264266-264274) -- the walker and context MenuState's foreplane draw `FUN_00369170` uses, though that one hands it the sub-object `*(param_1+200)` (D:L264251-264262; walk `FUN_00336a60`, P1) -- then flips with `FUN_003aff30(1, 1)` (D:L55775), the per-flip function that sends the env packet 0x3e0880 only when the setting changed (`DAT_004a44f5 != DAT_004a44f4`, D:L304752-304754; otherwise the blend state carries over; research 141 §2; P10's source blend). No step of that path clamps the alpha byte; the one rule is P9/P10's | a reviewer's re-read of the cited lines (done, 2026-11-01: it settles which rule at the reading level); GM-22's code step (done, 2026-11-09: the clamp removed, the quads drawn through the compositor); **to proven**: a console capture of the loading screen (`s4_pcsx2/A_ready012.png`, Vigilance; none of the shipped screen's quads exceeds 128, so the clamp itself has no pixel there) scored against the panel's compositor frame | reading (re-read at the source by GM-22's reviewer, 2026-11-01); the clamp removed by GM-22's code step (2026-11-09; the code step a reading: GM-22's re-review PASS WITH FINDINGS, high, `agent-mail/evidence/gpu-menus/gm22-rereview/REVIEW.md`), so no constant holds it; proven owed: `A_ready012.png` scored against the panel's frame |

*GM-22, the reading step, 2026-11-01.* The original draws the loading screen through the menus' own path (the row
above), so the loading panel's clamp is not the original's rule: the menus' unclamped alpha is. It is filed as a
reading the citation contradicts, its value today's clamp, unchanged until the review (O5); nothing in the panel changed.
What it costs today: nothing on the disc's own screen. `packages/viewer/test/loadingPanelAlphaReading.test.ts` reads
`dlgLoad.rdr` on all 22 MP maps through `loadingFromDisc` and `loadingQuads`, over a whole `SpinLoadingCD` turn
(31 instants, 0 to 1.5 s), and finds no quad over 128 (dev-disc test); LoadState's own fades write `(1 - f) x 128` with
`f` held to 0..1 (D:L55675, D:L55762), so the fader never exceeds 128 either. The clamp acts only on a quad over 128,
which the same test builds by hand (a face at opacity 1.5, glyph alpha 192, drawn at `globalAlpha` 1, where the
compositor would blend at 1.5): that pins today's clamp. The rest of the panel's drawing (Canvas 2D's own filtering and
coverage against P3 and P6, `tintTexels`' `Math.round` against P8's) differs from the menus' rules too and moves with
the code step, which re-pins `loadingPanelHd.test.ts`'s `TODAY`.

*GM-22, the code step, 2026-11-09 (reading: GM-22's re-review PASS WITH FINDINGS, high, `agent-mail/evidence/gpu-menus/gm22-rereview/REVIEW.md`).* The panel follows the reading: `loadingPanel.ts`
`loadingDrawList` makes each of `loadingQuads`' quads a sprite of its bitmap (`armoryRaster.ts` `armoryDrawList`, the
lobby ARMORY's conversion: texels over the bitmap's size, the GS colour and alpha as they stand) and appends MENUFADER, an
untextured black quad over the frame at `loadingFaderAlpha`, blended by the register the last bind left (P2); the
list goes through `CpuUiPresenter` (`rasterizeUiDrawList`, then `putImageData`; GM-09's seam, where GM-23's GPU
presenter plugs in). So the clamp is gone (P8-P10), and the rest of the panel's drawing moved with it onto the menus'
rules: the bilinear filter and integer coverage (P3, P6) for Canvas 2D's own, P8's float modulate for `tintTexels`'
`Math.round` (removed). HD-4 is kept: the page's scale, lookup and raster cache go to the compositor as the menus'
do (HD-3), the canvas following the frame's size. The re-pins (unit): `loadingPanelHd.test.ts`'s `TODAY`, the sha of
the Canvas 2D calls, became the sha of the scale-1 frame's bytes; `loadingPanelAlphaReading.test.ts` holds no clamp
(a glyph at 192 blended at 1.5); `loadingPanelCompositor.test.ts` holds the panel's frame equal to the compositor's
for a list built from the rules on its own, at scale 1, at 2x with a replaced bitmap, and over 128.

What it did not change, each its own question: the quads are still `loadingLayout`'s (the ARMORY's layout and text
rules), not `@s2u/ui`'s `composeScreen` of `dlgLoad.rdr`; their alphas stay fractional (opacity x 128: 89.6 for the
face's 0.7), where the original's `FUN_003643b0` sends a whole byte through `vftoi0` (`UI_QUAD_ALPHA_RANGE_READING`):
the loading screen joins the three paths that do not pack, a correction being its own task (GM.R14). The loading
screen's bitmaps blend by `source`, today's behaviour, named `LOADING_TEXTURE_BLEND_READING` (below). Evidence: unit
tests and source inspection only; no rendered browser run and no capture was scored. §6.1's loading-screen row
measured the Canvas 2D panel (p50 0.1-0.2 ms a draw at every scale); the compositor's draw was not measured, and at
an HD scale it is a software raster of the whole frame each animation frame -- GM-28 keeps the panel at scale 1 until
its surface is on the GPU (GM-23).

| Name | What the software does today (the value) | Where the original stands | What would settle it | Status |
|---|---|---|---|---|
| `LOADING_TEXTURE_BLEND_READING` | the loading screen's bitmaps blend by `source`, `ALPHA_1` 0x44 (P10): set on each bitmap by `loadingBitmap` from the constant (`loadingPanel.ts`; GM-22 review F3), which a settled reading changes | they come from the map archive's own `<stem>_TXR.ZED` libraries (`loadingAssets.ts`), whose bind packets' `ALPHA_1` no tally has read; `GS_MODULATE_BLEND_READING`'s tally (0x44 on every texture but the main menu roller's twelve; `tools/test/menuEntryFadeDisc.test.ts`) covers `FONT_TXR` and the 57 `RUN/UI/*_TXR.ZED` libraries only | a tally of those libraries' bind packets over the 22 MP maps (the reader `menuEntryFadeDisc` uses) | reading (GM-22's re-review PASS WITH FINDINGS, high) |

The existing readings the GPU drawer reproduces unchanged are listed in their own notes (research 112 §9, 185, 95,
121, 110): the 2D quads' coverage, filter, wrap and modulate; the frame-start blend; the mesh bind; the models'
texture rows, depth write and focal; the movie's rectangle and hold; the clock's catch-up limit; and the glyphs'
`RIGHT_EDGE_SUBTEXEL`. No `*_PLACEHOLDER` is needed: a dialog whose alpha path cannot be read (GM-04), or a
loading-screen path that cannot be read (GM-22), is filed as one there.

## 5. Adaptations

No original stands behind these; each bounds the browser's hosting of the drawer and changes nothing the game does.
They carry the `_ADAPTATION` suffix, which the placeholder ledger does not read; each gets a one-line "no original;
bounds the browser's ..." comment where it is defined.

- switch and modes: `UI_GPU_SURFACES_ADAPTATION`, `UI_GPU_BLEND_ADAPTATION` (scale 1 `exact`; HD `ff`, the loading screen escalated to `exact` by the flip's 4070 evidence, GM.R5); GM-16b's `UI_GPU_DEV_SURFACES_ADAPTATION` (pages the Vite dev server serves only -- DEV and MODE `development`; every built page, the nightly's `NODE_ENV=development` build included, reads the landed table). **The flip** (GM-17, GM-18, GM-19a/b, GM-21, GM-23 in one change, `agent/gm-flip`; approved 2026-11-09T14:28Z on the owner's word, MEGA.R7, and merged into `agent/mega` at `de632e9ac`; GM-16 met on the shadow PC's A4500 after GM-32, `33002ed6d`; GM.R18, the owner's word in the seat, 2026-11-09): every cell of `UI_GPU_SURFACES_ADAPTATION` `on` -- front, armory, overlay and loading, `hd` and `sd` -- and `UI_GPU_DEV_SURFACES_ADAPTATION` the same cells (was `front.hd` `shadow`; the guard stays reachable on the dev server by `?uiGpuGuard=on`, a `shadow` frame by `?uiGpu=shadow`); the blend table as GM.R6 sets it (scale 1 `exact`, HD `ff`), the loading screen since escalated to `exact` at HD by the 4070 evidence (GM.R5; the Log). `on` asks for the GPU: the capability gate still sends no WebGL2, a software adapter (SwiftShader, llvmpipe, the Basic Render Driver; `?uiGpuAllowSoftwareAdapter=1` the only opt-in), `MAX_TEXTURE_SIZE < 4096` and a link failure to the software at 1x (L4, GM-28, GM.R19), the loss limit and a guard trip to it for the session (L3); `?uiGpu=off` and the storage kill `s2u.uiGpu = 'off'` stay the rollback (GM.R13). Since the flip `&uiGpuSurface=` no longer isolates a surface -- the unnamed ones fall through to the table, `on` -- and `?uiGpuAllowSoftwareAdapter=1` applies page-wide (review F4). The front end's path is the page's 1x software whenever its surface cannot present (L4, L3; review F3), and its L4 or L3 lets the menus' HD pack go for the session (review F2);
- tolerance and fallback: `GPU_RASTER_TOLERANCE_ADAPTATION` (GM-27, `uiGpuTolerance.ts`, its data written by
  `tools/gm-pin-tolerance.ts`: class B's bound per class -- software rasterisers and GPUs, by the renderer -- and run key, pinned 2026-11-09 on NVIDIA D3D11 x2 and Vulkan x1 plus
  SwiftShader and llvmpipe, §1; refused past |Δ| 1; the parity spec's default bound), `UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`,
  `UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION` (GM-14a, `uiFramePlan.ts`, carried on each plan as `fallback`: an L1 frame
  under HD drawn by the software at 1x with no HD lookup or quad cache and shown each pixel `s x s` by one NEAREST blit,
  `UiGpuBackend.uploadFrame` at a scale -- the owner's O2, H375, default yes; under dev `uiSampling` other than bilinear,
  at the shown scale. An L1 frame under HD is therefore the 1x frame, not the shown scale's: the parity spec holds it
  against that, byte for byte, and records the executor's statistics for it without asserting them);
- guard and shadow (GM-16, `uiGpuGuard.ts`, the surface in `uiGpuPresenter.ts`; start values with no measurement under
  them, recorded by the GPU leg and GM-16b's dev shadow period): `UI_GPU_GUARD_SAMPLE_ADAPTATION` (one compare in
  flight; a new one at least 1000 ms after the last ended, for a frame whose plan hash differs from the last compared,
  or the same frame 10 000 ms after its compare began -- a movie's pictures are not in the hash; idle slices of at most
  8 ms, 16 frame rows a step; the last 64 records kept) and `UI_GPU_GUARD_TRIP_ADAPTATION` (the first trip escalates the
  surface to `exact` for the session, GM.R5/R6; a trip on a frame drawn at `exact`, or the second trip, is the
  session kill `guard-trip`, today's path). A trip is an exact-class pixel that differs (E/E\*: 0 bytes), or B beyond
  a bound the guard is given; the guard is given none yet (GM-27's pin is in the code, `uiGpuTolerance.ts`, and
  holds the parity spec; wiring it into the guard is not GM-27's) so B is recorded with the renderer, never judged. The compare runs in idle callbacks, its frames out of
  `lostSeconds` (GM.R11); the read-back is a pack buffer and a fence, polled, never waited on;
- the perf instrument (GM-16, `uiGpuPerf.ts`): `UI_PERF_COLD_SWITCH_ADAPTATION` (GM-02b's cold-switch target carried
  as numbers, §6.2: no animation frame over 50.0 ms and 0.00 s lost, printed to two digits, at 2x and 4x, judged on the
  GPU leg by `coldSwitchVerdict`; GM-13b's 33.4 ms aim reported beside it, never judged);
- presentation and loss: `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`, `UI_GPU_LOSS_FALLBACK_ADAPTATION`,
  `UI_GPU_LOSS_LIMIT_ADAPTATION`, `UI_GPU_RESTORE_WAIT_MS_ADAPTATION` (GM-12a, `uiGpuPresenter.ts`: the software frame
  at scale 1 with no HD lookup or quad cache while the GPU is lost; 3 losses in 5 minutes; 5000 ms for a restore).
  GM-28 (GM.R19, the owner's "the original 1x frame") widens `UI_GPU_LOSS_FALLBACK_ADAPTATION` to every state that
  does not present: L4, waiting for the links, released in a match, before the surface's module lands, a guard trip
  and `off`. It and `uiGpuLossFallbackOptions` now live in `uiGpuSwitch.ts`, re-exported by `uiGpuPresenter.ts`, so the
  page's frame loop draws its own software frames at 1x by the same rule (`uiGpuFront.ts` `uiGpuFrontFrameOptions`).
  Only dev `shadow` and GM-02's `?uiPerfHd` keep the shown scale, both development builds only.
  GM-19a defines `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION` (`uiGpuWebgl2.ts`; GM-11a-1 review F3). The overlay's canvas
  is `premultipliedAlpha: true`, and its frame target holds the software's bytes before the divide (P14/P22). A channel
  there can exceed the alpha, because the software clamps each channel of its premultiplied sum on its own (P12), and a
  premultiplied canvas composites such a pixel undefined (WebGL 1.0 §5.2.1). So a transparent frame, L0 or L1, reaches
  the canvas by a draw, not a blit: one triangle through the `present` program, each colour channel `min(channel,
  alpha)` (`uiGpuPremultipliedPresent`, the same rule on the CPU), flipped once as the blit flips. That is what the 2D
  canvas composites of the software's straight frame (each channel divided and clamped at 255, then multiplied back by
  the browser), within the browser's rounding of 1 (`test/uiGpuPremultipliedPresent.test.ts` over every value and
  alpha). The frame target keeps the pre-divide bytes, which `readPixels`, `readFrame` and the parity spec read. An
  opaque surface is blitted as before. Unit evidence only (the fake WebGL2); a real composite is the GPU boxes'.
  GM-19a and GM-23 put the overlay and the loading screen on their own GPU surfaces through one mount
  (`uiGpuSurfaceMount.ts`, factored from GM-12b's `FrontEndGpu`). The mount holds the canvas, its standby, the
  tick-boundary swap and the surface's `import()` after the first software frame (GM.R15). GM-28's rule holds there
  too, per surface (review fold 1, `uiGpuSurfaceHd`): the HD options go to a surface only when its own mode is `on`, or
  `shadow` on the dev server; a built page's URL `shadow` is handed 1x. Every software frame is the 1x frame. The
  overlay's twin is hidden while its transparent GPU frame shows (`UI_GPU_UNDER_CLASS`, a CSS class). The overlay's
  context is made at its first open and disposed at the match's end (`NativeSettings.interrupt`; a released context
  would stay live where the browser has no `WEBGL_lose_context`). The loading screen's context is let go when the
  screen hides. Both send frames to the GPU only once every program has linked (`UiGpuSurfacePresenter.prepare`, polled
  only under `KHR_parallel_shader_compile`); the extension is checked when the context is made, before any compile
  (`no-parallel-link`). Without it the surface keeps its 1x software for the session and lets the GPU go, so no link
  status is read on the page's frames;
- the context (GM-11a-1, `uiGpuWebgl2.ts`): `UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION` (the WebGL2 context's attributes:
  `alpha` only on a transparent surface -- the overlay; `#front-end-gpu` is opaque -- `premultipliedAlpha`, no MSAA (a
  blit into a multisampled default framebuffer is an INVALID_OPERATION, and nothing here is anti-aliased), no depth or
  stencil on the canvas (the models' depth is the frame target's, GM-11a-3), the drawing buffer not preserved (every
  present blits a whole frame));
- one context on Xbox (GM-XBOX1, 2026-11-10; `uiGpuSurfaceMount.ts` `gpuSurfaceAllowed` and `uiGpuSurfaceWiring`, the
  latter called by `frontEnd.ts` and `main.ts`): `UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION` (the loading screen and the
  overlay: on the Xbox device class, `deviceClass.ts` `pageDeviceClass() === 'xbox'`, the page hands neither surface its
  GPU option and hands each the 1x HD option with it -- `() => ({ scale: 1 })`, what v0.4.17 handed both -- so each draws
  the original 640 x 448 software frame with no GPU canvas and no WebGL context; the front end and the ARMORY keep
  theirs). No original; bounds the browser's live WebGL contexts on one device class: the shadow PC's Xbox GPU trace
  (mega 7cd782a5f against v0.4.17, the Xbox preset) found the loading screen's surface (about 3.1 MB) live beside the
  match's context through the load, released only when the panel hides at the match's start -- two live contexts at
  READY where v0.4.17 held one -- and the overlay's a second beside the match's at its first open; Xbox Edge already
  loses contexts. The front end's (9.3 MB) is released at `leave`, before the match makes its own, so it is not gated.
  The 1x HD option goes with the withheld GPU option because the menus' HD pack is **not** refused on the Xbox class
  in this tree (`autoQuality.ts`: that refusal is owed to a later lane merge); without it a withheld surface's software
  would raster the pack's scale itself, up to 4x every frame through the load (the review's F1). What shows: with no
  HD pack, the same frame (scale 1, where `UI_GPU_BLEND_ADAPTATION` is `exact` and the GPU's frames equal the
  software's); with an HD pack chosen, these two surfaces show the 1x frame on Xbox, as v0.4.17 did, where mega's GPU
  surfaces showed the pack's scale. The class is read when each surface is built (the panel once a page, the test
  room's overlay at the page's load), so a manual Xbox pick mid-session takes effect at the next page load (review F2).
  Unit tests and source inspection (`test/uiGpuXboxOneContext.test.ts`; the "GM-XBOX1" cases of `loadingPanelGpu` and
  `nativeSettingsGpu`, under a 4x pack);
  no Xbox run;
- HD textures (GM-13, `uiGpuTextures.ts`, start values to be measured on the box): `HD_UI_RESIDENCY_ADAPTATION` (1800
  drawn frames a texture stays unused; one frame is one tick, a `stage` and its draw counted once, GM-13 review F1), `HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION` (32 MiB uploaded a frame; the rest
  waits, that frame L1), `HD_UI_VRAM_BYTES_ADAPTATION` (256 MiB, least recently used first); and the HD replacement
  loads' bytes at their peak, `HD_UI_LOAD_BYTES_ADAPTATION` (256 MiB, `uiGpuLoadBudget.ts`; agent/hd-subrect review F3; a replaced lookup's waiting
  loads are dropped unrun, GM-13 review F2);
- the front end's textures decoded ahead (GM-29, `frontEndAssets.ts`, `frontEndTextureWorker.ts`; no original -- the
  original has every bank in memory before a dialog's first draw): `UI_TEXTURE_PREFETCH_ADAPTATION` (at most 32 MiB of
  decoded RGBA prefetched; every bank the page loads is 26,159,104 bytes decoded, GM-29's dev-disc count). After the
  page's first frame, at idle, the page reads the lazy banks and hands each bank's names not yet decoded to a module
  worker that runs the page's own decode (the same functions, so the same bytes), caching each answer unless the lookup
  decoded it first; a name asked before its answer is decoded synchronously, so no dialog draws later. With the GPU
  surface it also seeds the texture cache's content hash (`seedUiGpuTextureKey`, the worker's `fnv1a64` of the same
  bytes). A bank's arrival no longer clears the decode cache: the same name resolves to the same bank, the same bytes
  and now the same object. Decides when a bitmap is decoded and hashed, never its bytes;
- the menus' art decoded ahead (GM-32, `menuArt.ts`; no original, the same reason): `MENU_ART_PREFETCH_ADAPTATION` (at
  most 16 MiB of decoded RGBA; the art the page reads -- dlgMenu's UI2D and UIBF, FONT, UI -- is 133 bitmaps, 10,657,024
  bytes decoded, none of whose decodes says anything, GM-32's dev-disc count). The page's lookup asks the art before the
  banks, so the banks' prefetch never reached the names both hold (`multplay_back.tif`, `font_titlebar_01.tif`: OPTIONS'
  first frame). Run first in the same prefetch on the same worker (`chainUiTexturePrefetch`), it keeps each answer for
  the lookup's first ask only where the decode said nothing (the worker answers its diagnostic lines when asked); a name
  whose decode says anything, or one asked first, is the lookup's, decoded synchronously as before. With the bank
  prefetch the page holds about 37 MB of front-end bitmaps decoded ahead. Decides when a bitmap is decoded, never its
  bytes;
- a movie's decoded sound kept across opens (GM-32, `movieSound.ts` `MovieSoundKeep`, the feed's in `frontEndMovies.ts`;
  no original -- the original streams the sound off the disc at every play): `MOVIE_SOUND_KEEP_ADAPTATION` (the last
  track read whole, at most 32 MiB of PCM; MENULOOP's is 5,951,744 frames, 23,806,976 bytes of 16-bit stereo, 124.0 s,
  GM-32's dev-disc count; replayed one piece -- about 1 s of sound -- every 250 ms). The next open of the same file hands
  the same pieces to its new sound, then its timeline, instead of reading and decoding the file again; the sound starts
  at picture 0 from frame 0 with the same samples, as a re-read's does. A read cut short by a close is never kept. The
  pieces are the ones the open sound already holds while it plays, so the cost is that track kept while another
  front-end dialog shows: the front end's sleep, its hand-off to a match and its stop let it go (GM-32 review F1). Decides when the sound is decoded, never what plays;
- the large-image route (GM-14b, case 15; `uiGpuTextures.ts`, `UiGpuBackend.refusal` in `uiGpuWebgl2.ts`):
  `UI_GPU_OVERSIZE_ROUTE_ADAPTATION` -- a frame whose plan samples an image (a bitmap or its HD replacement) past the
  device's `MAX_TEXTURE_SIZE` is **L1 at its fallback scale**: 1x under HD, the original frame (GM.R9, GM.R19), shown
  `s x s`; no texture past the limit is made or sent; the frame counted on `window.__uiGpu.refusals.counts` under the
  route's one reason, whatever the image or the limit. Where it can fire: the capability floor is 4096
  (`UI_GPU_MIN_MAX_TEXTURE_SIZE`, `uiGpuSwitch.ts`) and the HD pack may name an image up to `HD_LIMITS.outputEdge`
  (8192 a side, `hdTexturePack.ts`); a 4x replacement of a source at `HD_LIMITS.sourceEdge` (1024) is 4096 and fits,
  so on a device past the gate only a replacement at a larger ratio, or a placement composite (HD.R9) past 4096, takes
  it; the frame (2560 x 1792 at 4x) always fits. Why this route and not the two others the brief named (the plan and
  this note documented none before): a downscaled-to-fit copy, or the 1x bitmap drawn on the GPU, would each put on the
  canvas a picture that the reference at the shown scale -- `rasterizeUiDrawList` with the pack's image, the frame §1's
  B bound and the guard compare against -- does not draw, so the frame would leave the contract (and trip the guard in
  shadow); the L1 frame is the 1x software's byte for byte, which the parity spec already holds. The price: such a frame
  loses HD whole, not only the one image. An exact alternative that keeps HD -- the image split into tiles each within
  the limit, a quad's columns and rows planned per tile with REPEAT's wrap across tiles -- is not built (it changes the
  planner's runs and the programs; no pack measured to need it). Unit evidence only (`test/uiGpuOversize.test.ts`, the
  fake WebGL2's `maxTexture`); the rendered browser run is owed to the GPU boxes;
- the movie and the GPU timer (GM-11a-3): `UI_GPU_MOVIE_TEXTURES_ADAPTATION` (two `RGBA8UI` pictures, uploaded in
  the render that first shows each, keyed on the picture object), `UI_GPU_TIMER_PENDING_ADAPTATION` (timer queries in
  flight). The quads' instancing (`UI_GPU_INSTANCE_LAYOUT`) is no adaptation: it carries GM-11a-2's uniform values per
  instance, flat, and decides no byte.
- not an adaptation (GM-15a): the models' `depthScale` (`UiPlanPass.depthScale`, `passDepthScale` in `uiFramePlan.ts`; GM.R10) -- the largest power of two at most 1 that brings every vertex's f32 `invW` of the pass to at most 1, written as `gl_FragDepth = clamp(invW * depthScale, 0, 1)` -- decides no byte (a power of two scales an f32 exactly unless it underflows, GM-15b's edge), so it has no constant; the models' instancing (`UI_GPU_TRIANGLE_LAYOUT`) likewise.
- not an adaptation (GM-15b, `uiFramePlan.ts`): `depthScale` now brings every vertex's f32 `invW` to at most 1/2 (a pixel's f32 `invW` can pass its largest vertex's by an ulp; at 1/2 no depth reaches the clamp at 1); `UI_GPU_MODEL_DEPTH_FLOOR` (2^-100, and a `depthScale` of at least 2^-126) and `UI_GPU_MODEL_TEXEL_RANGE` (2^30 on a vertex's `|u W|`, `|(1 - v) H|`) bound the range in which the GPU's f32 and int arithmetic is the twin's -- a pass or triangle outside is the software's (L1, named), so neither decides a byte and neither is a game value.
- not an adaptation, a measurement (GM-15c, R1; the controller's ruling, b6 2026-11-06): **the seam double adds on the
  corpus** (M3). *Superseded by GM-15d (2026-11-09; the plan's Log, R1 resolved by (a)):* the counts below are the
  port's artefact -- an f64 `invW` compared against its own f32 store under a strict `>`, with inclusive edges -- not the
  original's rule (the R1 report, 2026-11-09: the GS keeps the later of two equal Z under GEQUAL and gives a shared-edge
  pixel to one triangle). The software now carries the GS's rules (M2 top-left, M3 GEQUAL on the f32 store), the twin
  and the GPU follow, and R1's instrument counts the ties on which the software and the twin decide differently: 0 on
  every unit case (the seam squares at 0.7 and the dyadic depths, the coplanar faces, GM-03's cases at 1, 2 and 4),
  and pinned at 0 per corpus entry as GM-17's precondition (measured: the disc fold below). Under the new rules a coplanar face adds at every pixel both faces write, on the software and the GPU alike
  (equal f32 depth, GEQUAL), as the GS would draw it; a shared edge adds once on both. The table is kept as the
  artefact's record: The software tests a pixel's f64 `invW` against the f32 it stored, so where its own f32 equals the store
  but the f64 is above it, it draws again (the texel added twice); an f32 GREATER test (the twin, a GPU) draws once.
  Counted by `test/uiGpuSeamCount.ts` over every distinct model frame of GM-04's corpus at 1, 2 and 4
  (`test/uiGpuModelsCorpus.disc.test.ts`, which pins the table), each hit classed by the triangle that stored the depth:
  `seam` (two shared vertices, GM-15b's case), `coplanar` (all three: the same face again, GM-08's roller finding),
  `other`. One mechanism, all three classes under R1. Reading, pending review -- of the port's own output, not the
  original's; the count is the software's side (where it doubles), not a measured GPU difference. 85 of 2,256 frames
  (752 distinct model frames x 3 scales) hit:

  | entry | seam | coplanar | other | frames hit |
  |---|---|---|---|---|
  | `dlgMenu.rdr` (deep link) | 0 | 43,823 | 0 | frame 2 only (1x 2,181, 2x 8,312, 4x 33,330) |
  | dlgMenu + MENULOOP | 0 | 43,823 | 0 | frame 2 only (the same) |
  | ARMORY (MP51, seal) | 0 | 0 | 81 | frames 90-101 |
  | ARMORY (MP51, terrorist) | 3,622 | 819 | 733 | frames 72-80, 95-101, 123-132, 248-250 |
  | **corpus** | **3,622** | **88,465** | **814** | |

  Pinned and deferred (GM-15c): no refusal is added; "hits = 0" stays an open precondition of GM-17's gate, where matching the
  double add on the GPU or sending those frames to L1 is chosen with GM-27's real-GPU reading. *GM-15d:* that choice
  is moot -- neither side doubles a seam now, and both double a coplanar face -- and the precondition reads "software
  and twin agree on every tie" (`test/uiGpuSeamCount.ts`, redefined; `test/uiGpuModelsCorpus.disc.test.ts`'s
  `GM15D_TIE_DISAGREEMENTS`). What it does not see: a tie a 16-bit Z would make and f32 does not
  (`UI_MODEL_DEPTH_QUANTISE_READING`).
  *GM-15d's disc fold (dev-disc test, the owner's host):* the first run at `4d62d9c02` read seam 1,479 / coplanar 53 /
  other 410 on the ARMORY (61 of 2,256 frames; dlgMenu 0), every one a depth tie: the software computed its edge
  functions, weights and `invW` in f64 and rounded only the stored depth, while the twin rounds each operation. The
  reference now decides coverage and depth in the GPU's f32 arithmetic (`modelEdgeF32`, `modelDepthF32`,
  `uiRasterRules.ts`: the twin's T2-T4 step for step), its attributes still f64; no case hash, `TODAY` or
  `experimentalMenu` pin moved. The re-run at `4d014b66a`: 0 / 0 / 0 on every entry, 0 of 2,256 frames (dlgMenu depth ties
  86,880; seal ARMORY 62, terrorist 7,196). The twin against the software, filtered runs (`S2U_TWIN_ONLY`): the ARMORY's
  max |Δ| 1 at 1, 2 and 4 under both tables, dlgMenu's 1 -- the whole-corpus `UI_GPU_TWIN_CORPUS_B` (max |Δ| 123/29/82,
  the model boxes') is not re-measured: its default run takes about an hour, past the seat's 10-minute cap.
  *GM-15d review F1:* since the fold the instrument's software side runs the same f32 helpers as the twin's steps and
  never `drawModels` or the executor, so the corpus 0 / 0 / 0 is a consistency check of the two transcriptions, not an
  independent measure. GM-17's R1 precondition rests on the whole-corpus `uiFramePlan.disc` (executor = software, 0
  bytes) and `uiGpuTwin.disc` (twin against software, B within its record) and the fake-GL byte compares; both
  whole-corpus runs are owed in a long slot (the lane holder's). *Review F2:* the one-owner property of a shared edge
  holds in IEEE arithmetic; a GPU that contracts the edge functions into FMAs can double-write or drop a seam pixel, and
  GLSL ES 3.00 has no qualifier against it (`precise` is ES 3.20) -- GM-27 measures the model seams on real GPUs.

## 6. Performance

*GM-02's baseline is §6.1 (2026-11-02); GM-02b's targets, set from it, are §6.2.* Before GM-02 the plan's figures were Node
microbench numbers (a dlgMenu-like frame at 4x about 55 ms warm, about 68 ms with MENULOOP; the first draw of a dialog
about 220 ms; the 3D pass 104 ms for an 800x800 model box at 4x). Why it matters for parity: `UiClock` drops any time
past `CATCHUP_LIMIT_READING` = 0.05 s (`packages/ui/src/clock/uiClock.ts`; `FUN_003654c0` D:L262270-262273, research
110 §3), so a slow frame runs the menus slower than the original while the movie's sound keeps time. Kinds apart: perf
from a rendered browser run, Node microbench, and never a parity claim. **No figure in §6.1 is a target**; §6.2 has
the targets GM-02b set from them.

### 6.1 GM-02: the software path's browser baseline

**The run.** `packages/viewer/e2e/uiGpuPerf.spec.ts` (`playwright.perf.config.ts`, the job's Vite) at build
`a41df62fd` (`dirty: false`), on a spare AWS box: c7a.2xlarge, AMD EPYC 9R14 x8, 15.2 GB, Linux 7.0.0-1014-aws,
Chromium 153.0.8010.12 headed under `xvfb-run`, viewport 1280x720, dwell 20 s. Two legs, one per renderer:
- **SwiftShader**: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`,
  2026-11-02T00:10:46Z;
- **llvmpipe**: `ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL 4.5)` (`--use-gl=angle --use-angle=gl
  --ignore-gpu-blocklist`), 2026-11-02T00:17:49Z.

Each leg: Playwright 4 passed (7.1 / 7.0 min); every scale's walk error list empty; no segment SUSPECT. The record is
the box's `gm02.md`, `gm02.json` and `gm02-scale{1,2,4}.json` (agent-mail `evidence/gpu-menus/gm02/results/run2/`,
`gm02-out-2` and `gm02-out-native-2`). **Evidence kind: rendered browser run (perf) on software renderers -- not a
player's GPU, never a parity claim.** Scale 1 is today's path for every player (`?uiPerf`, `hdMenuScale=1`, nothing of
the HD pack fetched); scales 2 and 4 are the menus' HD path reached by the devmode-only `?uiPerfHd` (HD-HOLD stands:
`VIDEO_PICTURE_HD_OFFERED` false; nothing set, stored or offered), canvas 1280x896 and 2560x1792. CREATE GAME is
opened by a deep link (no login or server); the loading screen is a `LoadingPanel` the page makes as `frontEnd.ts`
does for a lobby match, not one a lobby match launched.

**Per segment** (SwiftShader / llvmpipe; lost = `UiClock.lostSeconds` per wall minute; ms are animation-frame and
raster p50 / p95):

| scale | segment | lost s/min | frame ms p50 / p95 | raster ms p50 / p95 | compose / shells ms per tick | pictures/s | heap MB |
|---|---|---|---|---|---|---|---|
| 1 | dlgMenu idle (MENULOOP + roller) | 0.00 / 0.00 | 16.7 / 16.7 | 8.6 / 8.9 | 0.20 / 0.30 | 30.0 | 124 / 133 |
| 1 | dialogs (OPTIONS ... main menu) | 0.37 / 0.32 | 16.7 / 16.8 | 10.9 / 15.5 | 0.12 / 0.40 | 5.8 | 282 / 179 |
| 1 | dlgCreateGame idle | 0.00 / 0.00 | 16.7 / 16.7 | 14.6 / 15.1 | 0.27 / 0.52 | 0 | 148 / 153 |
| 1 | CREATE GAME PLAY LIST (four maps) | 4.12 / 4.42 | 16.7 / 66.7 | 14.7 / 60.6 | 0.30 / 0.56 | 0 | 181 / 186 |
| 2 | dlgMenu idle | 0.11 / 0.11 | 33.4 / 50.1 | 37.2 / 40.6 | 0.22 / 0.25 | 24.2 | 213 / 239 |
| 2 | dialogs | 7.15 / 7.23 | 50.0 / 66.7 | 46.4 / 62.3 | 0.13 / 0.33 | 4.3 | 634 / 699 |
| 2 | dlgCreateGame idle | 13.72 / 13.65 | 66.7 / 66.8 | 59.8 / 63.6 | 0.26 / 0.47 | 0 | 302 / 314 |
| 2 | CREATE GAME PLAY LIST | 20.62 / 20.60 | 66.7 / 116.7 | 60.2 / 109.4 | 0.30 / 0.54 | 0 | 484 / 510 |
| 4 | dlgMenu idle | 39.33 / 39.21 | 150.0 / 150.1 | 130.5 / 134.7 | 0.90 / 0.31 | 6.9 | 412 / 412 |
| 4 | dialogs | 43.23 / 43.19 | 166.7 / 233.3 | 151.3 / 204.5 | 0.16 / 0.56 | 1.1 | 666 / 621 |
| 4 | dlgCreateGame idle | 43.58 / 43.55 | 183.3 / 216.6 | 164.3 / 191.9 | 0.30 / 0.58 | 0 | 602 / 588 |
| 4 | CREATE GAME PLAY LIST | 49.11 / 49.12 | 183.3 / 950.0 | 165.2 / 930.3 | 0.36 / 0.88 | 0 | 607 / 553 |

Frame, raster and the per-tick columns are SwiftShader's; llvmpipe's frame and raster figures are within about 4% of
them on every row, and its per-tick figures (each segment's mean a tick) are 0.11-0.89 ms (compose) and 0.25-0.85 ms
(shells) (both records in full in `gm02.md`). Present (`putImageData`) p50: 0.6 ms at 1, 2.4-2.5 ms at 2, 9.7-11.7 ms at 4.

**Cold dialog switches** (cold = the dialog's first visit on the page; settle = to the last HD answer; SwiftShader /
llvmpipe):

| scale | switch | HD answers | settle ms | max frame ms | lost s | first raster ms |
|---|---|---|---|---|---|---|
| 1 | dlgMenu -> OPTIONS | 0 | 0 | 49.9 / 49.9 | 0.00 / 0.00 | 10.4 / 10.2 |
| 1 | OPTIONS -> VIDEO | 0 | 0 | 16.8 / 33.3 | 0.00 / 0.00 | 7.9 / 8.5 |
| 1 | OPTIONS -> CONTROLLER | 0 | 0 | 16.8 / 16.8 | 0.00 / 0.00 | 7.9 / 8.3 |
| 2 | dlgMenu -> OPTIONS | 8 | 1633 / 1717 | 599.9 / 616.7 | 1.18 / 1.23 | 42.2 / 42.0 |
| 2 | OPTIONS -> VIDEO | 3 | 850 / 817 | 150.0 / 183.3 | 0.38 / 0.37 | 44.4 / 47.4 |
| 2 | OPTIONS -> CONTROLLER | 0 | 0 | 83.3 / 83.4 | 0.10 / 0.10 | 36.3 / 36.4 |
| 4 | dlgMenu -> OPTIONS | 9 | 3516 / 3483 | 833.3 / 833.3 | 3.53 / 3.50 | 189.3 / 188.7 |
| 4 | OPTIONS -> VIDEO | 3 | 2617 / 2583 | 300.0 / 300.1 | 2.75 / 2.73 | 109.0 / 109.5 |
| 4 | OPTIONS -> CONTROLLER | 0 | 0 | 166.7 / 166.7 | 0.87 / 0.87 | 111.1 / 112.0 |

The warm return OPTIONS -> dlgMenu also waits on 2 HD answers: settle 1267 / 1250 ms at 2 and 2433 / 2417 ms at 4
(max frame 300 ms and 450 ms). The record gives the switch's time to its last HD answer and its frames, not the decode
apart from the upload.

**Loading screen** (`LoadingPanel` over the held menus, MP72; about 15 s a scale; SwiftShader / llvmpipe):

| scale | panel draw ms p50 / max | panel interval ms p50 / p95 | intervals > 33.4 ms | held menus drawn/s | held menus lost s/min |
|---|---|---|---|---|---|
| 1 | 0.2 / 8.3 ; 0.1 / 7.1 | 17.0 / 33.4 ; 20.8 / 33.3 | 38 ; 29 | 29.9 ; 30.0 (raster p50 14.7) | 0.00 ; 0.00 |
| 2 | 0.2 / 33.5 ; 0.2 / 33.7 | 16.8 / 19.0 ; 16.7 / 18.1 | 2 ; 2 | 0 ; 0 | 1.35 ; 1.35 |
| 4 | 0.2 / 25.7 ; 0.2 / 25.7 | 38.6 / 45.2 ; 16.8 / 18.1 | 374 ; 2 | 0 ; 0 | 1.55 ; 1.35 |

At scale 1 the page draws the held menus every tick under the panel (`frontEnd.ts` `drawsMenuFrame`), so the panel's
interval carries their raster; at 2 and 4 the held menus are not drawn under it, and their lost seconds come from two
long tasks of about 250 ms each.

**What the baseline shows** (each line read off the tables above; derived lines say so):
- **Scale 1 keeps the original's pace at idle** (0.00 s lost a minute, frames at 16.7 ms, MENULOOP at 30.0 pictures/s);
  it loses 0.32-0.37 s a minute over the dialogs walk and 4.1-4.4 s a minute while CREATE GAME's PLAY LIST is
  scrolled (raster p95 about 61 ms).
- **Scale 4 does not.** dlgMenu idle loses 39.2-39.3 s a minute (frames about 150 ms, raster p50 about 130 ms,
  MENULOOP at 6.9 pictures/s); derived, the menus' clock advances about 21 s per wall minute -- **about 35% of the
  original's pace**, slower than the 57% the plan derived from Node numbers. CREATE GAME's PLAY LIST loses 49.1 s.
- **The raster dominates.** `composeScreen` is 0.12-0.90 ms a tick and the shells 0.25-0.88 ms a tick at every scale;
  the software raster is 8.6-165 ms (p50) and `putImageData` up to 11.7 ms -- the part the GPU drawer replaces.
- **The cold HD switch is a cost apart**: at 4x the first OPTIONS waits 3.5 s and 9 HD answers, one frame of 833 ms,
  3.5 s lost; at 2x 1.6-1.7 s. GM-13b owns the decode.
- **The renderer is not a settled variable.** SwiftShader and llvmpipe agree within about 5% on each segment's frame
  and raster p50/p95 and on the switches' settle times. They differ elsewhere
  (SwiftShader / llvmpipe, read off both records): a switch's max frame (OPTIONS -> VIDEO cold at 2x 150.0 / 183.3 ms,
  at 1x 16.8 / 33.3 ms); the loading screen's panel interval (p50 at 1x 17.0 / 20.8 ms, 38 / 29 intervals over
  33.4 ms; at 4x 38.6 / 16.8 ms, 374 / 2 over 33.4 ms), and at 4x the held menus under it (frame p50 33.4 / 16.7 ms,
  lost 1.55 / 1.35 s/min) -- the 4x pair is not explained by this record; and heap (1x dialogs 282 / 179 MB). A target
  set from these numbers (GM-02b) names its renderer.
- **The loading panel's own draw is not a cost**: p50 0.1-0.2 ms at every scale (GM-23's motive stays "one presenter",
  no perf claim, unless the 4x SwiftShader interval above is traced to the panel).
- **Heap** peaks at 699 MB with HD (scale 2's dialogs, llvmpipe; 666 MB at 4, SwiftShader) against 124-282 MB at 1;
  recorded before GM-20.

**Not measured here, owed:** the ARMORY and the overlay (in the protocol, not in this walk); a GPU leg (none exists
yet); GPU time per frame (no timer query on these renderers); a real GPU (the owner's `d3d11`, O3); the decode apart
from the upload; a lobby-launched loading screen; CREATE GAME reached through login. Run 1 (`gm02-out`, at
`f1476ab60`) had walk errors and is superseded by run 2.

### 6.2 GM-02b: the targets

Set 2026-11-02 from §6.1 (the plan's "Performance", "The targets", holds the per-row table and the reasons; this is
the summary). A product-track ruling of the controller, for the owner to overturn; perf, never a parity claim. **Each
target stands on a measured number**: today's software path on the same host, renderer and walk. They bind **the GPU
path**; no GPU leg exists yet, so none is met or missed.

- **Why the 1x figure is the basis.** `UiClock` loses `max(0, dt - 0.05 s)` a frame (`uiClock.ts:140`,
  `CATCHUP_LIMIT_READING`; `FUN_003654c0` D:L262270-262273, research 110 §3). Today's scale 1 keeps pace at idle; the
  GPU path at 2x and 4x is held to it, so HD costs no pace scale 1 does not.
- **`lostSeconds` per wall minute, GPU path, at 1, 2 and 4:** dlgMenu idle (MENULOOP + roller) ≤ 0.1 s; the dialogs
  walk ≤ 0.4 s; dlgCreateGame idle ≤ 0.1 s; CREATE GAME PLAY LIST ≤ 4.5 s -- the 1x software figures (0.00; 0.32-0.37;
  0.00; 4.12-4.42) rounded up to the next 0.1 s. Today at 4x: 39.2-49.1 s.
- **Window and host:** GM-02's walk (`uiGpuPerf.spec.ts`, dwell 20 s a segment, about 2.3 wall minutes a scale) on the
  c7a.2xlarge (headed Chromium 153 under `xvfb-run`, 1280x720), on **ANGLE SwiftShader and ANGLE Mesa llvmpipe**, both
  legs held to one figure a segment: the higher leg's 1x figure, rounded up. The owner's ANGLE D3D11 (O3) has no baseline; its leg is recorded and a d3d11 target
  waits for one.
- **Excluded frames, named in the record:** the cold switches that wait on HD answers -- dlgMenu -> OPTIONS (8 at 2x,
  9 at 4x), OPTIONS -> VIDEO (3), the return OPTIONS -> dlgMenu (2) -- until GM-13b lands; the guard's frames (GM.R11).
  A switch with no HD answer is counted. The loading screen, the ARMORY and the overlay are outside the scenario.
- **The cold HD switches, from GM-13b on:** at 2x and 4x, no animation frame over 50.0 ms and 0.00 s lost (basis: the
  same switches at 1x, max frame 49.9 / 49.9 ms on dlgMenu -> OPTIONS and 16.8 / 33.3 ms on OPTIONS -> VIDEO, 0.00 s
  lost; 50.0 ms is also the clock's catch-up limit; today at 4x 833.3 ms and 3.50-3.53 s on dlgMenu -> OPTIONS); the
  settle time is recorded, not targeted (the decode apart from the upload is not measured). GM-13b's own acceptance,
  no frame over 33.4 ms, is kept as an aim with no measured basis: today's 1x software misses it.
- **Where it is asserted (GM-16):** on the GPU leg of `uiGpuPerf.spec.ts` (`S2U_UI_PERF_LEG=gpu`), its own test, by
  `UI_PERF_COLD_SWITCH_ADAPTATION` (§5) -- every cold switch with HD answers at 2x and 4x, the GPU path checked to have
  drawn at each scale; the aim reported per switch in `gm16-cold.json`. Written, not run yet (unrun: the box).
- **Other targets:** MENULOOP 29.97 ± 0.5 pictures a wall second at dlgMenu idle at 1, 2, 4 (one a tick, R110.1,
  R110.6; 1x 30.0, 4x 6.9); `composeScreen` and the shells each ≤ 1.0 ms a tick, the segment's mean a tick
  (`uiGpuPerf.ts:188`; measured, SwiftShader 0.12-0.90 and 0.25-0.88, llvmpipe 0.11-0.89 and 0.25-0.85); the first
  frame of a new dialog, no frame over 50.0 ms at 1, 2, 4 (basis the 1x switches' max frame, 49.9 ms; 33.4 ms kept as
  an aim; decode excluded until GM-13b); after GM-20,
  each segment's heap at 2x and 4x ≤ its §6.1 figure on the same renderer (the v1 "< 64 MiB" dropped: the 1x baseline
  is 124-282 MB).
- **Dropped as targets, still recorded:** frames waiting on a shader link, prog copies, frame-sized allocations,
  context restore, GPU texture bytes, live contexts, L1 frames on a promoted surface, GPU time on a UHD 620-class iGPU
  -- none measured, or an invariant or rollout check rather than a perf number.
- **Owed:** GPU-path CPU per frame (plan + axis + encode + upload), set when GM-06a's axis microbench exists; the
  ARMORY's and the overlay's targets, once a walk measures them; a d3d11 baseline (O3).

### 6.3 GM-29: the cold switch's main-thread work (2026-11-09; built, reviewed PASS WITH FINDINGS, folded)

Perf, never a parity claim; product track. From the T4's CPU profile of the cold dlgMenu -> dlgOptions_Menu switch
(`agent-mail/evidence/gpu-menus/gm-f1-t4p/PROFILE.md`, a rendered browser run under the profiler, diagnostic only):
- **The long frame** (137-162 ms, about 650 ms after the press): the dialog's palettized bank decode (`palettized`,
  `palettized4`, 57 ms) and the GPU cache's content hash (`fnv1a64`) on the main thread. Its cause in the source: UIOP,
  OPTIONS' lazy bank, arrived and `pageUiTextures` cleared its whole decode cache, so every bitmap on the screen was
  decoded, hashed and looked up in the HD pack again on the next frame. GM-29 keeps the cache (§5) and decodes every
  bank ahead in a worker (`UI_TEXTURE_PREFETCH_ADAPTATION`, §5).
- **The planner on every frame** (`addQuad`, `reserve`, `done`, `nums`, `wrap`, `rowAxis`, `columnAxis`: 525 ms over
  the 2x window): the axis table sized from the last plan and handed out without a copy, no per-quad throwaway arrays,
  `wrapIndex` (`wrap` without the division for an index in range). Every GM-03 case's whole plan is pinned to its base's
  bytes (`uiFramePlanStable.test.ts`), and the dev disc's dlgMenu and dlgOptions_Menu frames plan to the same digest.
- **Node microbench** (`planFrame` over 60 consecutive frames at 60 Hz after 150, the disc's banks, MENULOOP the black
  stand-in; Node on the owner's host through the seat's runner; recorded, not asserted; `uiFramePlan.bench.ts` holds
  the same frames for `vitest bench`), base -> GM-29 in ms a frame, two pairs (the host's load moved between them):
  dlgMenu 2x 1.79 -> 0.81 and 1.18 -> 0.49, 4x 2.46 -> 1.16 and 1.68 -> 0.84; dlgOptions_Menu 2x 2.41 -> 0.93 and
  1.50 -> 0.73, 4x 3.53 -> 1.41 and 2.13 -> 1.03 -- about 2.0-2.6 times less.
- **Not measured here:** the rendered cold switch (no browser ran); the lane holder's on the shadow PC and the T4.

### 6.4 GM-32: the cold switch's second pass (2026-11-09; built, reviewed PASS WITH FINDINGS, folded)

Perf, never a parity claim; product track. From the T4's CPU profile at `82ef1260f` (after GM-29;
`agent-mail/evidence/gpu-menus/gm-flip-t4/PROFILE.md`, a rendered browser run under the profiler, diagnostic only),
with the judged run beside it (`RECORD.md`, J1: the cold dlgMenu -> dlgOptions_Menu switch 66.6 ms / 0.02 s at 2x,
83.4 ms / 0.03 s at 4x, 66.6 ms at 1x; the warm return 116.7 ms at every scale):
- **The longest stretch** (88.5 ms, about 651 ms into the 4x cold switch): `planFrame` -> the lookup -> `menuArt`'s
  `textures` -> `decode` -> `decodeNamedTextures` -> `decodeTexture`, 48.4 ms on the stack. Its cause in the source: the
  page's lookup asks MENU-02a's art before ONL-01's banks, the art read the libraries dlgMenu names (UI2D, UIBF, FONT,
  UI), and OPTIONS' first frame asks it for names it holds and dlgMenu never drew -- `multplay_back.tif` and
  `font_titlebar_01.tif` (512 x 512 each, 7.0 and 6.9 ms each in Node), `brown_back*.tif`, `op_check*.tif`,
  `backsolid.tif`, `font_special_01.tif` (a dev-disc count of the first asks). GM-29's prefetch decoded the banks' copies,
  which the art shadows. `planFrame` decodes once per name, not every frame: both readers cache by lower-cased name.
  GM-32 decodes the art ahead in the same worker (`MENU_ART_PREFETCH_ADAPTATION`, §5).
- **The planner** (`addQuad` 221.2 ms self, `rowAxis` 31.5, `wrapIndex` 19.5, `columnAxis` 17.0): each quad's column and
  row entries kept from one plan to the next and copied in where every input that decides them is the same bit for bit
  (two generations, at most two plans' tables); every GM-03 plan is still its base's bytes (`uiFramePlanStable`), and the
  warm plan equals the cold one on every case (`uiFramePlanMemo`).
- **The uploads** (`uploadAxis` 31.0 ms, `texSubImage2D` 47.9 ms, `uploadInstances` 18.2 ms): the axis table is uploaded
  only when its f32 bits differ from the texture's (a fade changes colours, not texels); the instance records are written
  word by word, the same bytes (`uiGpuUploads`). The bitmaps' uploads were already under
  `HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION` (GM-13).
- **The warm return**: MENULOOP's sound is kept decoded across the round trip (`MOVIE_SOUND_KEEP_ADAPTATION`, §5). The
  profile's `musicStream next` (55.2 ms over the 4x window) is the menu music's VPK stream (`@s2u/sound`
  `musicStream.ts`, `menuMusic.ts`), decoded a buffer at a time while it plays -- not MENULOOP's sound and not kept here.
- **Node microbench** (`planFrame` over 60 consecutive frames at 60 Hz after 150, the disc's banks and art, MENULOOP the
  black stand-in; recorded, not asserted), base -> GM-32 in ms a frame (median of five passes): see the plan's Log
  2026-11-09 GM-32 entry for the numbers.
- **Not measured here:** the rendered cold switch and warm return (no browser ran); the lane holder's on the shadow PC
  and the T4.

## 7. The contradicted readings: not changed by this port

Eight readings in the code are contradicted by pending-review research (185, 206). The GPU drawer reproduces today's
software for each (GM.R14); each correction is its own simulation-track task, software first, then the GPU.

| Constant | The code does | Research 185/206 says (pending review) |
|---|---|---|
| `UI_MODEL_ZWRITE_READING` (`models.ts` L100; compositor :458) | an alpha-0 texel writes no depth | the alpha test is off (ATE 0): alpha-0 texels write depth |
| `UI_MODEL_FOCAL_READING` (`models.ts` L83) | 455 | 457.0074 (`320/tan(0.6108652)`); the ARMORY already uses it |
| `TEXT_PEN_READING` (`drawList.ts` L71, L110-111) | the offset unscaled | `pen = int(M · offset)`, the scale included |
| `WRAPPED_LINE_ALPHA_READING` (`drawList.ts` L78, L116) | the object's (fading) alpha | the lines keep their own 89.6 |
| `TELETYPE_CURSOR_READING` (`drawList.ts` L144-148) | the text colour | grey 128,128,128 |
| `MOVIE_RECT_READING` (`movieLayer.ts` L37-42) | the origin | y = (448 − h)/2 rounded to 32 rows, ties down |
| `MOVIE_HOLD_READING` (`movieLayer.ts` L27-31) | the last picture held | the per-frame clear makes a tick with no new picture black (185 §3.2) |
| `GS_SPRITE_COVERAGE_READING` (compositor L109-114) | float corners, ceil | corners truncated to 1/16 (`vftoi4`) before the fill rule |

Each is a LATER row (the plan's LATER list), one task each.
