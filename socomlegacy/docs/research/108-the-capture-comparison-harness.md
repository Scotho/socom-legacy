# 108 -- The capture comparison harness: compare.py to the last digit, the black control, the mask, the page's frame (web sprint 7, PLAT-30)

Written 2026-10-01 for web sprint 7 (task PLAT-30; its block is `../roadmap/01-platform.md` "PLAT-30"). Sources: the
PC project's parity tools -- `tools_py/parity/compare.py` (the scorer), `tools_py/parity/gate.py` (`_score_value`
L189-197, `score_title` L200-221, `TITLE_MIN_SCORE` L105), `tools_py/parity/drive.py` (the step scripts' runner) --
run as they stand with PIL 12.1.1 and numpy 2.5.3 under Python 3.13 on the dev host; the archived captures under
`C:/Projects/socom_pc/logs/parity/` and `D:/socom_archive/parity/` (read in place, never copied into the tree); KNOWN
[online-7pct]; web research 98 §1-2 (the dark-frame trap). The code is `tools/captureImage.ts` (the PNG reader),
`tools/captureScore.ts` (the scorer, the control, the mask, the title verdict, the thumbnail), `tools/captureRefs.ts`
(the dialog-text band and the crop references, §5a), `tools/captureLock.ts` (the host lock, §7), `tools/captureSteps.ts`
(the step-script runner), `tools/captureRun.ts` (run directories and reports), and the two commands
`tools/capture-harness.ts` (scores directories) and `tools/capture-page.ts` (the page's frame, in Playwright). Tests:
`tools/test/captureScore.test.ts`, `captureRefs.test.ts`, `captureLock.test.ts` (CI) and
`tools/test/captureScoreDev.test.ts` (dev host, against Python). Revised 2026-10-02 after the review (§5 the mask, §5a,
§7 the lock, the pins of §2.2 and the skips of §2.4).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R108.1 | **compare.score is reproduced to the last printed digit**: PIL's BOX resampler in its 22-bit fixed point, numpy's float32 reduction orders, Python's `round`. On **55 archived pairs** (the recomp's title-gate captures against PCSX2's menu, PCSX2's 640x480 title run against the recomp's by step, research 98's dark cards against black, eight 640x448 crop pairs with and without the 4:3 box) every `score`, `mad` and `block` equals Python's | `captureScore.ts` `score` | §2 |
| R108.2 | **gate --score-title accepts the harness's directory**: the recomp's 23 title captures, decoded and re-encoded by the harness with drive.py's `manifest.json`, PASS the gate with the very detail line the harness computes (19/23, window 19/19) | `captureRun.ts` `writeRun`, `scoreTitleDir` | §2.4 |
| R108.3 | **The negative control is planted**: a black frame scores **60.2** against the lit main-menu reference (`scripts/parity/ref_main_menu_ours.png`; mad 0.1423, block 0.6536, as compare.py prints) -- under 90 | `captureScore.test.ts` | §4 |
| R108.4 | **The dark-frame trap is built in**: every row carries the golden scored against black; a frame is *matched* only at score >= 90 **and** score >= control + `CONTROL_MARGIN_READING` (5.0). PCSX2's dark opening card `pcsx2_mission_a/s03` scores 99.9 against another run's and 99.9 against black: refused | `verdict`, `judge` | §4 |
| R108.5 | **The masked-background rule** (rectangles of the 640x448 frame; the numbers taken over the uncovered pixels and blocks only): a frame differing only inside the mask scores 100.0 / 0.0 / 0.0, one differing outside does not, and the covered area neither raises nor lowers the score (a half-wrong dialog with 75% of the frame masked: 67.2, not matched) | `ScoreOptions.mask`, `scoreGrids` | §5 |
| R108.6 | **The 4:3 correction** reads only the PCSX2 picture (x 21.33..618.67 of a 640x448 window) through PIL's `box`; on KNOWN's own lobby frame the title glyphs land at x 34..594 against ours' 31..595 (KNOWN). The gate applies no correction, so it is off unless asked | `letterboxBox` | §3 |
| R108.8 | **The two other reference methods**: the dialog-text band (`save_empty_card.txt`: thumbnail rows 47:62 x columns 36:125, under 8) and the crop references of `refs.json` (`online_login_ours.Shell.diff`, `is_screen`), ported; on the login run 5 frames x 11 references = **55 distances equal to Python's** to the last digit, and every is_screen verdict | `captureRefs.ts` | §5a |
| R108.7 | **The page's frame**: `capture-page.ts` pins the canvas to 640x448 CSS pixels in the PS2 presentation and captures the drawing buffer pixel for pixel; one MP2 frame captured on the dev host (640x448), scoring 55.8 against the menu reference -- the page draws the map viewer, not the front end | `capture-page.ts` | §7 |

## 1. What the gate scores

`compare.score(golden, ours)` (compare.py L19-27): both images `convert("RGB")`, `resize((320, 224), Image.BOX)`
(`_arr`, L15-16; `SIZE` L12), `np.asarray(..., dtype=float32) / 255.0`; `mad` the mean of `|g - o|`; `block` the
share of the 14x20 blocks of 16x16 whose per-channel mean differs by more than `block_thresh` 0.08 averaged over the
three channels; `score = round(max(0, min(100, 100 * (1 - 0.5*mad - 0.5*block))), 1)`, `mad` and `block` rounded to 4.
`gate._score_value` (L189-197) opens the two paths, golden first, and keeps `score`. `gate.score_title` (L200-221)
globs `s[0-9][0-9]_*.png` without `burst`, scores each against `TITLE_REF`, and passes when every capture of the
window s00..s18 scores >= `TITLE_MIN_SCORE` 90.0 and the window holds at least 16 (`TITLE_MIN_MATCHES`). Nothing in
either crops, masks or corrects the aspect: two frames of any sizes are squeezed whole to 320x224.

## 2. The scorer, reproduced

### 2.1 The PNG reader

The archive's PNGs (11,733 surveyed under `logs/parity/runs`, `logs/parity/gate/*/title` and `scripts/parity`) are
8-bit RGB (640x448: 10,797; 640x480: 825; a few crops and sheets) and 8-bit grey crops; none is 16-bit, interlaced or
carries a gamma or ICC chunk. `decodePng` reads 8-bit grey, grey+alpha, RGB, RGBA and palette with the five filters
and converts as PIL's `convert("RGB")` does (grey copied, alpha dropped, palette looked up); 16-bit and interlaced are
refused by name. The writer is `tools/png.ts` (RGBA, alpha 255): the gate's `convert("RGB")` gives back the pixels.

### 2.2 The arithmetic

- **The resize** is Pillow's `ImagingResample` (`src/libImaging/Resample.c`): `precompute_coeffs` in double (BOX
  support 0.5, BICUBIC 2.0 with a = -0.5, scaled by the downscale factor; `xmin = (int)(center - support + 0.5)`),
  `normalize_coeffs_8bpc` to 22-bit fixed point (`PRECISION_BITS = 32 - 8 - 2`, rounded away from zero), a
  horizontal pass to an 8-bit image over the rows the vertical pass needs, then the vertical pass, each sum starting
  at `1 << 21` and clipped to 0..255 after the shift. A pass is skipped as Pillow skips it (`xsize != imIn->xsize ||
  box[0] || box[2] != xsize`), and the same size with no box is Pillow's copy. The box's coordinates are C floats.
  For 640x448 to 320x224 it is `(a + b + 1) >> 1` across, then down; for 640x480 the vertical weights are 2.14 rows.
- **The float32 steps**, measured against numpy 2.5.3 bit for bit on random frames (a probe outside the tree, 30
  blocks and 5 whole-frame means, every one equal): the division `v / 255` in float32 (a table of 256); the
  whole-frame `mean` is **one pairwise sum** (`pairwise_sum_FLOAT`: eight accumulators over blocks of up to 128, split
  at `n/2` rounded down to a multiple of 8) over the flattened (row, column, channel) array, plus 0, then a float32
  division by the count; a block's `mean(axis=(1, 3))` is a **sequential** float32 sum in row-then-column order (the
  iterator's inner loop is the channel axis, not a reduction), divided by 256; the channel mean of the block
  difference a sequential sum of three over 3; the threshold the float32 of 0.08 (NEP 50: a Python float meets a
  float32 array as float32). `block` is a count over 280 in double. The pairwise order is pinned in CI on numpy's own
  printed means of an LCG array at five lengths (5..215040): a double sum and a sequential float32 sum give other
  values (both are in the test), so a scorer that drifts from numpy's order fails there, not only on the archive.
- **The rounding** is Python's `round(x, n)`: the double's exact decimal value, an exact tie to the even digit (98.75
  rounds to 98.8, 97.25 to 97.2) -- `toFixed` breaks ties upward, so `pyRound` reads the exact expansion itself.

### 2.3 The CI pins

`captureScore.test.ts` pins numbers and SHA-256 hashes printed by Python on synthetic frames (arithmetic patterns, no
game data): the BOX grids of a 640x480 and a 640x448 frame, the 4:3 box's grid, `convert("L")`, `drive.thumb` and a
thumbnail distance, four `compare.score` results, `json.dump(indent=1)` of a manifest and two `gate.score_title`
details (run with `_score_value` and `glob` patched). The script, run from the repository root with `PYTHONPATH=.`:

```python
import hashlib, numpy as np
from PIL import Image
from tools_py.parity import compare, drive
def mk(w, h, fn):
    y, x = np.mgrid[0:h, 0:w]
    return Image.fromarray((np.stack([fn(x, y, c) for c in range(3)], axis=2) & 255).astype(np.uint8), 'RGB')
G = mk(640, 480, lambda x, y, c: x*7 + y*13 + c*50 + (x*y) % 31)
O = mk(640, 448, lambda x, y, c: x*5 + y*11 + c*80 + (x ^ y) % 17)
H = lambda a: hashlib.sha256(np.asarray(a).tobytes()).hexdigest()
print(compare.score(G, O), H(G.resize((320, 224), Image.BOX)), H(O.resize((320, 224), Image.BOX)))
x0 = (640 - 640*448/480) / 2
print(H(O.resize((320, 224), Image.BOX, box=(x0, 0, 640 - x0, 448))), H(O.convert('L')), H(drive.thumb(O)))
```

### 2.4 The calibration on the archive (dev host)

`captureScoreDev.test.ts` spawns Python once through the PC project's `scripts/python_env.sh` (cwd `SOCOM_PC_ROOT`)
on 55 pairs: the 23 captures of `logs/parity/gate/x51_gate_iop/title` against `scripts/parity/ref_main_menu_ours.pcsx2.png`
(PCSX2's main menu as the golden); `logs/parity/runs/pcsx2_title1`'s 21 (640x480) against the recomp's of the same
step; `pcsx2_mission_a` s02-s04 against black; and the four 340x40 lobby title crops of `scripts/parity/refs/lobby`
(PCSX2 against the recomp), each with and without the 4:3 box. **55 of 55 equal** in all three numbers, and the
thumbnail distances of six consecutive title captures equal `drive.thumb`'s. Then it writes the 23 title captures
through the harness into a temporary directory with a manifest and runs `python -m tools_py.parity.gate --score-title`
on it: `PASS title (19/23 menu captures >= 90.0 (window s00..s18: 19/19); scores: s00=99.0 ... s22=62.0)`, equal to
the harness's own line. The test bites: with Pillow's rounding offset (`1 << 21`) removed from the resampler, 25 of
the 55 agree and the gate's line differs (the mutant run of 2026-10-01). When bash or the Python cannot run (a spawn
error, or an exit other than 0 or 1 -- `socom_require_python`'s 2), the tests report **skipped** with the reason
(`ctx.skip`), never passed.

## 3. The 4:3 correction

KNOWN [online-7pct]: PCSX2 shows the console's 448 lines at the TV's 4:3 inside its 640x448 window -- 640 x 448/480 =
597.33 px wide, centred, 21.33 px bars. `letterboxBox(640, 448)` is that rectangle and `score(..., { pcsx2Letterbox })`
resizes the golden from it (PIL's `box`), so the PCSX2 picture lands on our pixel-exact frame. On KNOWN's own pair
(`mixed2_ours_hosts_b/pcsx2/B_miss_join_enter_1.png`, now under `D:/socom_archive/parity/`) the title row's bright
columns (luma > 100, rows 8..40) are x 53..576 uncorrected and **34..594 corrected**, against KNOWN's 31..595 on ours.
Its whole-frame score against `s8_hosted_kill/A_16_game_lobby.png` moves 87.4 -> 86.3: those two frames differ in
content (another lobby's rows), so the score does not measure the correction; the column extents do. A 640x480 PCSX2
capture is the stretched picture (research 98 §2.2) and takes no correction.

## 4. The black control

Research 98 §1-2: on almost-black frames the whole-frame score saturates -- an all-black picture scores 97.3-99.9
against PCSX2's opening cards. So every harness row carries `control = compare.score(golden, black)`, with the same
options, and `matched` needs both `score >= 90` and `score - control >= CONTROL_MARGIN_READING` (in tenths, so
95.0 against 90.0 passes and 90.1 does not). Measured (compare.py's numbers):

| golden | control (vs black) | a matching frame | gap |
|---|---|---|---|
| `scripts/parity/ref_main_menu_ours.png` (the recomp's lit menu) | 60.2 | 93.2-99.4 (the title window) | 33+ |
| `scripts/parity/ref_main_menu_ours.pcsx2.png` | 63.8 | -- | -- |
| `runs/pcsx2_title1` s07..s20 (the menu, 640x480) | 77.1 | -- | -- |
| `runs/pcsx2_title1` s01 / s00 | 93.6 / 84.9 | -- | -- |
| research 98's cards, whole frame (A): `pcsx2_mission_a` s02, s03, s04 | 98.4, 99.9, 97.5 | 100.0 | 0.1-2.7: refused |
| research 98's cards, text box (B), bright frames | 82.0-85.1 | 95.8-99.9 | 10.7-17.9 |

The margin is a choice from that record: it must exceed 2.7 (the dark cards, which only a text-box measure settles)
and stay under 10.7 (the smallest gap research 98 accepted); 5.0 is inside. It is `CONTROL_MARGIN_READING` (§9).

## 5. The masked-background rule

A screen whose background is a movie (dlgMenu over MENULOOP) is scored before the page decodes movies (PLAT-19b) by
excluding the background from both frames. `mask` is a list of rectangles in the 640x448 frame (x0, y0 inclusive; x1,
y1 exclusive); each is mapped onto the 320x224 grid (halved, outward to whole pixels), and compare.score's arithmetic
is taken over what is left (`scoreGrids`): `mad` the float32 mean of the uncovered differences (one pairwise sum over
them in the flattened order), a block's channel means over its uncovered pixels, `block` the share of the blocks with
any uncovered pixel. A pixel inside counts nothing, a block wholly inside is not a block of the score, a block the
mask cuts is judged on its uncovered pixels alone, and a mask over the whole frame is refused. Without a mask it is
compare.score exactly (the 55 pairs of §2.4).

The first version set the masked pixels to black in both grids and kept them in the counts. Every masked score was
then pulled toward 100 in proportion to the area covered, while the 90 bar and the control margin (§4), set on whole
frames, were applied unchanged (the review of 2026-10-01): a 320x224 dialog centred in the frame, the four bands round
it masked (75%), ours drawing the left half of the dialog wrong, scored **91.8** (control 77.7) and was called matched.
Taken over the uncovered area it scores **67.2** (mad 0.1569, block 0.5; control 10.8), as the dialog scored on its
own would; for a dialog not on the block grid (y 112..336, a textured golden) the masked score is 63.4 against 63.5
for the dialog cropped out and scored alone (the crop is resized 1:1, the frame 2:1). So the bar and the margin mean
on a masked score what they mean on a whole frame.

The rule is pinned: a frame differing from its golden only inside the mask scores exactly 100.0 / 0.0 / 0.0 (and does
not without the mask); one differing in a band outside it scores under 100 with blocks over the threshold; the
half-wrong dialog scores 67.2 / 0.1569 / 0.5 and is not matched; a block cut to its uncovered 8x8 corner is judged on
those 64 pixels (30/255 off: over the threshold, where diluted over 256 it was not); a whole-frame mask is refused.
Which rectangle a screen's background is -- the region left when the dialog's chrome is drawn -- is each screen's
(PLAT-31, the BOOT and MENU tasks), not this task's.

## 5a. The dialog-text band and the crop references

PLAT-30's block names two more reference methods the PC project uses beside compare.score; both are ported in
`tools/captureRefs.ts` so the BOOT, MENU and ONL tasks find them.

- **The dialog-text band** (`scripts/parity/save_empty_card.txt`: `untilref(<png>,47,62,36,125,14,8)` and
  `ifref(<png>,47,62,36,125,8)`, read by drive.py's untilref and ifref): the mean |difference| of two `drive.thumb`
  thumbnails over rows 47:62 x columns 36:125 (numpy slices: rows 47..61, columns 36..124 -- the dialog's text; its
  buttons are rows 63..75, so a highlight move leaves the band alone), matched under 8. `DIALOG_TEXT_BAND`,
  `DIALOG_TEXT_THRESH`, `dialogTextMatch`; the runner's untilref and ifref already take the same region from a script.
- **The crop references** (`scripts/parity/refs/refs.json`, read by `tools_py/parity/online_login_ours.py`
  `Shell.diff`, `ref_scales`, `is_screen`): the frame `convert("L")`-ed and resized to 320x224 (PIL's default
  BICUBIC); the reference crop resized to five widths (x0.90, 0.93, 0.96, 1.0, 1.04 by Python's half-even `round`:
  245 x 0.90 = 220.5 gives 220); both brightness/contrast normalised (`(v - mean) / (std + 1e-6)`); the best mean
  |difference| over the offsets dy -6..6, dx -20..20 of the box's top-left (the code's range; its docstring says +-3
  and +-12), a crop of std under 2 skipped. `is_screen`: at most 0.45 (0.5 for write_down, save_card, card_slot) and
  no other reference with the same box nearer. `refs.json`'s `thresh` (8.0 in every entry) is read by nothing, and
  is_screen's own `thresh` argument reaches only `main_menu` (compare.score >= 90). `screenGrey`, `refScales`,
  `cropRefDistance`, `isScreen`.

The float64 arithmetic is numpy's: a contiguous array's sum one pairwise sum; a crop of the 320-wide frame is a strided
view, which numpy copies into its 8192-element iterator buffer and sums as one pairwise sum -- measured on 153 random
crops of up to 8192 elements, every one equal to the flattened pairwise sum (summed row by row, 67 of 200 equal); a
larger crop is summed in another order (169 of 247 equal to the flattened sum) and is refused by name
(`NUMPY_BUFSIZE`; refs.json's largest crop, x1.04, is 255 x 24 = 6,120). CI pins Python's printed numbers on synthetic
crops (the BICUBIC grid's hash, the five widths and their hash, three `Shell.diff` distances, a strided crop's mean and
std, the is_screen verdicts); the dev test runs `Shell.diff` itself on the login run `logs/parity/blop_c` (00_login,
01_universe, 07_write_down, 08_eula, 09_lobby) against all 11 references: **55 of 55 distances equal**, and the
is_screen verdicts equal those taken from Python's distances. Four mutants (the crop summed row by row, the widths
rounded half-up, is_screen without the nearer rule, the band's threshold) each fail a CI test.

## 6. The step scripts

`parseSteps` is `drive.parse` (L217-227): `<mode>+<delay>:<BTN>[+<BTN>]`, `#` comments, `NONE` dropped; the committed
`scripts/parity/title_menu.txt` parses to its 23 steps. `runSteps` is `drive.run_steps` (L466-661) over a
`FrameDriver` (grab, press, clock, save, reference): `stable`, `long`, `next` (`wait_stable` L347-375 on the 160x112
grey thumbnail of the content rectangle, `drive.thumb` L256-258 with `crop_to_content` L240-253 and Pillow's default
BICUBIC; stable under 1.0, changed over 0.3, polled every 0.25 s), the `wNN_<k>.png` captures of a wait
(`wait_capturer`), `wait`, `idle`, `hold`, `burst`/`ifburst`, `ifref(...)`, `until(...)` (`highlighted`: G over R by
25) and `untilref(...)` with the **fixed-count** pacing (the Windows instrument: at most `<loops>` presses on settled
screens). It captures `sNN_<btn>.png` before each press and `final.png` after the tail, and `manifestJson` writes
drive.py's `manifest.json` byte for byte (`json.dump(indent=1)`, Python's floats). **Not ported:** the paced
wall-clock budget (`paced_press_times`, the slow host's), `ifpopup` and untilref's `lit` flag (both read gameplay
frames: `sp_death_probe.screen_state`, `screen_bands.gameplay_band`) -- refused by name.

**Settle detection on animated screens** stays the task's unknown: the runner's "stable" is drive.py's (a thumbnail
distance under 1.0 for `--settle` seconds), which a fade or a movie background never meets within `--maxwait` (PC
research 64: the fade timing makes s06 vary). Same rule on both sides, so the page's frames align with the console's
by step as the recomp's do; whether that is enough for a menu over MENULOOP is measured when such a screen exists.

## 7. The page's frame

`capture-page.ts` checks the host lock first (`captureLock.askHostLock`: the PC project's `scripts/loop_lock.sh
check` under `SOCOM_PC_ROOT`, else `C:/Projects/socom_pc`; anything but FREE refuses, exit 3 -- and so does a lock
that cannot be asked, no script found or bash not run; the first version skipped the check without `SOCOM_PC_ROOT`,
the review of 2026-10-01), starts its own Vite server on port 5301 by default (the developer's 5181 and 8787 refused through
`e2e/ports.ts`), opens `/?mode=play&fly&map=MP2&devmode` in headless Chromium (ANGLE over SwiftShader), turns on the
PS2 presentation (`#ps2look`) -- whose drawing buffer is 640x448 (`main.ts` `fit`, `resize(PS2_FRAME...)`) -- pins the
canvas's CSS box to 640x448 at device scale 1, and screenshots the element: the buffer pixel for pixel, any other size
refused. With `--script` it drives the page through `runSteps`, pressing `PAGE_KEYS_READING`'s keys. Run on the dev
host 2026-10-01 (lock FREE): one 640x448 frame of Frostfire, scoring 55.8 (control 60.2) against the menu reference --
correctly not matched, since the page draws the map viewer: the title scripts reach no menu until PLAT-05..PLAT-17.

## 8. What is settled, what is not

- **Settled (proven against the reference code):** the scorer's three numbers on 55 archived pairs and the synthetic
  pins; the title verdict and detail; the manifest format; the thumbnail; gate --score-title on a harness directory;
  the crop references' distances and verdicts on the login run (§5a).
- **Settled by construction, pinned by tests:** the control and its verdict; the mask rule; the 4:3 box; the
  dialog-text band.
- **Not settled:** settle detection on animated screens (§6); the margin's value (a reading, §4); which rectangle is
  each screen's background (§5); the page's keys for START and SELECT (PLAT-11); `ifpopup` and untilref's `lit` (§6).
  The page side is a single frame of the map viewer until the front end draws screens.
- **Owed to BOOT, not this verdict:** a black or near-black golden can never be *matched* under the control margin
  (§4: research 98's cards are refused; an all-black golden scores 100 against black, control 100). BOOT's black and
  fade screens need a structural check of their own -- the PC project has one, `tools_py/parity/black_rows.py` --
  not compare.score's verdict.

## 9. Placeholders and readings

Two readings are named in the tools; no placeholder.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `CONTROL_MARGIN_READING` (`tools/captureScore.ts`) | how far over its black control a score must sit to be called matched | no source gives a margin; research 98 §1's record bounds it to (2.7, 10.7) (§4). Reading: 5.0 | open |
| `PAGE_KEYS_READING` (`tools/capture-page.ts`) | the page's key for each PS2 button a step script presses | the ARMORY's menu keys (`ARMORY_MENU_KEYS_READING`, `packages/viewer/src/armory.ts`), the page's only menu keys; START and SELECT have none and are refused. The front end's keyboard map is PLAT-11's | open |
