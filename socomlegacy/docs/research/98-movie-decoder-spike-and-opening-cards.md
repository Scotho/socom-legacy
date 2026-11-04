# 98 -- The movie decoder spike and the opening cards (PLAT-19a, BOOT-03)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, ruling W6.R6: this note
holds both tasks). Sections 1-6 are BOOT-03's: what draws the "SONY COMPUTER ENTERTAINMENT AMERICA / PRESENTS" and
"DEVELOPED BY / ZIPPER INTERACTIVE, INC." cards, measured. Section 7 is PLAT-19a's: libmpeg2 0.5.1 built to
WebAssembly and measured against libavcodec and the PCSX2 captures (§7.1 has the answer). [Corrected 2026-10-01: this
sentence said "a stub until that spike runs", then "the libmpeg2 build is owed" while the source was unreachable.]

Sources, all read-only (W6.R8; `SOCOM_PC_ROOT` = `C:/Projects/socom_pc` on this host): the disc tree `game/disc`
(`RUN/MOVIES/COMMON/SONY448.PSS`, 5,701,636 B; `RUN/MOVIES/INTRO_2.PSS`; `RUN/UI/READERC.ZAR`, `RUN/READERC.ZAR`,
`RUN/UIZANIM.ZAR`, `RUN/COMMON/SPLA_*.ZED`), the PCSX2 captures of all ten boot runs under `logs/parity/runs/`
(`pcsx2_mission_{a..g}`, `pcsx2_title1`, `mb10_pcsx2`, `transition_pcsx2`) with their `manifest.json` [corrected
2026-10-01 after review: this listed `pcsx2_mission_{a,b,c,d}` and `pcsx2_title1` only], the title gate's scorer `tools_py/parity/compare.py` and
`tools_py/parity/gate.py`, and the decompilation `game/analysis/socom2_game.elf.decomp.c` (`Lnnn` = its line). The
`.rdr` and zAnim reads use this repository's own readers (`@s2u/archive` `Zar`/`parseRdr`, `@s2u/scene`
`parseUiLayout`/`parseAnimSets`/`decodeUiSet`). Decoded pictures, crops and score logs lived in the git-ignored
`logs/boot03/` of the task's worktree; no picture, disc byte or capture is in git.

## 1. The answer: the cards are pictures of SONY448.PSS

**Movie.** Both opening cards, the typing and the block cursor included, are frames of `RUN/MOVIES/COMMON/SONY448.PSS`,
which `dlgIntroCinematic.rdr` plays as its `MPEG` background. `dlgIntroScreen.rdr` has **no objects at all** -- no
`TEXT`, no `TELETYPE`, nothing to draw (§3) -- so PC research 11 L335's diagnosis ("these are `TEXT` objects of
`dlgIntroScreen.rdr`") is wrong, and is superseded by this section.

**Which evidence carries which half** (added 2026-10-01 after review). "The cards are the movie's" rests on a fact about
the file, independent of any scorer: SONY448's own decoded pictures contain the card text, typed letter by letter
with the cursor (pictures 11-140 and 161-294, below). "And not a TEXT object" rests on §3's read: neither
`dlgIntroScreen.rdr` nor `dlgIntroCinematic.rdr` has an object to draw. The scores below add the third link -- the
PCSX2 captures equal a SONY448 picture, to the typed character -- but they **cannot by themselves exclude a TEXT
overlay**: a font rendering of the same words, at the same place and in the same colour, would score about as high.

Every distinct PCSX2 capture of the two cards in the ten boot runs on record, against SONY448's 310 decoded pictures
(§2 for the method; byte-identical captures, by MD5, are listed once). "Best picture" lists every picture tied at the
least `mad`: `compare.score` rounds `mad` to 4 decimals, so a static card ties across the cursor's blink.
[Corrected 2026-10-01 after review: the table held the 7 distinct captures of runs a-d and `pcsx2_title1` and named
one picture per row, the first of a tie; it now holds all 15 distinct captures of the ten runs, with the ties.]

| PCSX2 frame (= byte-identical) | A: best picture(s) | A: gate score (mad) | A: black | B: best picture(s) | B: text-box score (mad) | B: other card | B: black |
|---|---|---|---|---|---|---|---|
| `mission_a/s02` (= `title1`) | 38-39 | 100.0 (0.0004) | 98.4 | 38-39 | 99.6 (0.0077) | 87.6 | 83.6 |
| `mission_b/s02` (= `c`, `d`) | 32 | 100.0 (0.0008) | 99.0 | 32 | 95.8 (0.0171) | 86.5 | 85.1 |
| `mission_e/s02` | 38-39 | 100.0 (0.0005) | 98.4 | 38-39 | 99.5 (0.0095) | 87.5 | 83.7 |
| `mission_f/s02` | 31 | 100.0 (0.0009) | 99.0 | 31 | **94.6** (0.0192) | 86.7 | 85.2 |
| `mission_g/s02` | 33 | 100.0 (0.0008) | 99.0 | 33 | 96.9 (0.0160) | 87.1 | 84.8 |
| `mb10_pcsx2/s02` | 34 | 100.0 (0.0006) | 99.0 | **118** (picture 34: 98.8) | 97.1 (0.0145) | 86.5 | 84.6 |
| `transition_pcsx2/s02` | 40 | 100.0 (0.0004) | 98.4 | 40 | 99.7 (0.0061) | 87.3 | 84.1 |
| `mission_a/s03` (= `title1`) | 137 | 100.0 (0.0002) | 99.9 | 137 | 99.9 (0.0010) | 99.3 | 99.3 |
| `mission_b/s03` (= `g`, `mb10`) | 132 | 100.0 (0.0002) | 99.7 | 132 | 99.9 (0.0012) | 95.1 | 91.4 |
| `mission_c/s03` (= `d`) | 129 | 100.0 (0.0003) | 99.8 | 129 | 99.9 (0.0013) | 92.1 | 87.9 |
| `mission_e/s03` | 136 | 100.0 (0.0002) | 99.9 | 136 | 99.9 (0.0011) | 98.5 | 98.1 |
| `mission_f/s03` | 128 | 100.0 (0.0003) | 99.8 | 128 | 99.9 (0.0014) | 90.4 | 87.6 |
| `transition_pcsx2/s03` | 138 | 100.0 (0.0001) | 99.9 | 138 | 100.0 (0.0009) | 99.5 | 99.4 |
| `mission_a/s04` (= `b`, `e`, `g`, `title1`, `mb10`, `transition`) | 229-235, 244-250, 259-265 | 100.0 (0.0004) | 97.5 | the same | 99.9 (0.0024) | 80.7 | 82.0 |
| `mission_c/s04` (= `d`, `f`) | 225-228, 236-243, 251-258, 266-267 | 100.0 (0.0004) | 97.3 | the same | 99.9 (0.0023) | 82.5 | 83.3 |

**What the numbers support, and no further** (corrected 2026-10-01 after review: this paragraph opened "The block's
rule is met: every best score is >= 95, under both measures", which is false on the full record). Under A, the gate's
own measure and the block's rule, every distinct capture matches a SONY448 picture at 100.0 -- but these captures are
almost all black, so **an all-black picture scores 97.3-99.9 under A too**, and A alone settles nothing here. Under B,
the same scorer on the capture's text box, the matched picture scores 94.6-99.9 on the bright frames (s02, s04) where
black scores 82.0-85.2 and the other card 80.7-87.6: **14 of the 15 distinct captures reach 95 under B;
`pcsx2_mission_f/s02` reaches 94.6**, still 7.9 above the other card and 9.4 above black. On the s03 captures (the
fade) black scores 87.6-99.4 under B, so B separates them only by `mad` (e.g. `pcsx2_mission_a/s03`: 0.0010 against
black's 0.0139). The conclusion "the captures are SONY448 pictures" holds on every distinct capture as a best match far
above both controls on the bright frames; the >= 95 bar is met under A everywhere and under B on 14 of 15.

**B's weakness** (added 2026-10-01 after review): B cuts the box from the capture's ink, so it does not penalise ink a
picture has *outside* that box -- text typed beyond the capture's extent. On `mb10_pcsx2/s02` (typed to "SONY COMPUTER
ENT") B's least-`mad` picture is 118, a fully typed card, while A picks 34; picture 34 scores 98.8 under B (higher
than 118's 97.1: the `block` term), but `mad` ranks 118 first. And on `pcsx2_mission_f/s02` the cursor's blink phase
leaves B at 94.6. B is a check that the capture's ink equals a picture's; it is not a picture selector. A picks the
picture.

Readings that agree with the scores:

- **The text is the movie's, letter for letter.** A's best pictures are typed to the same character as the capture
  ("SONY COMPUTER ENTERT" with no cursor in `pcsx2_mission_a/s02`, pictures 38-39; the cursor after "PRESENTS"; the
  full Zipper card) -- a contact sheet of every tenth picture shows the typing, the cursor's blink and the fades.
- **The picture index runs at the movie's 30 per second across the s02 press.** s02 (typing) and s03 (the fade) are
  determinate pictures: `pcsx2_mission_a` s02 -> s03 is 3.3 s in the manifest and 98-99 pictures (3.27-3.30 s);
  `pcsx2_mission_b` 3.3 s and 100 pictures (3.33 s); `pcsx2_mission_c` 3.2 s and 97 pictures (3.23 s). The driver
  presses CROSS right after each capture (`tools_py/parity/drive.py` L9), so the s02 press falls between s02 and s03,
  and the movie neither skipped nor paused across it; the s03 press did not skip it either (s04 is still a SONY448
  picture). **s04's picture is not determined**: the full Zipper card is
  static, and the capture ties across 229-265 (or 225-267) with the cursor's blink, so no duration is derived from it.
  [Corrected 2026-10-01 after review: this item gave s03 -> s04 as "3.2 s and 92 pictures (3.07 s)" and "3.3 s / 97
  pictures (3.23 s)", and said the s04 press could not have ended the movie early because INTRO_2 was up "no sooner
  than SONY448's remaining 80 pictures (2.7 s) allow" -- all three built on the first picture of a tie, so not
  measurements. Whether the s04 press ended the movie is §5's "believed".]
- **The s04 press did not end it early either, in the run that sampled it.** [Added 2026-10-01 after the second
  review; the item above called it "believed".] `mb10_pcsx2` carries the driver's per-second wait frames across that
  press (`wNN_mmm.png`, file times from the run's directory): `w04_001` (677.90 s) is SONY448 pictures 177-178 (A
  100.0, mad 0.0002; B 99.9 against black 85.1); `s04_CROSS` (679.70 s, the press follows it) ties 229-265 like every
  s04; `w05_000` (680.13 s) is the same file as `s04_CROSS` (MD5 `0382b488`); `w05_001` (681.18 s) is picture **275**,
  unique (A 100.0, mad 0.0003; B 99.9 against black 83.2); `w05_002` (682.23 s) is black (a picture of the 295-309
  run, or INTRO_2's black start). `w04_001` -> `w05_001` is 3.28 s and 97-98 pictures (3.23-3.27 s at 30/s): straight
  across the press, so the movie neither skipped nor paused there. Re-derived with §2.3's `score.py` (the SONY448
  pictures as PNGs, ffmpeg's rgb24) on `w04_000 w04_001 s04_CROSS w05_000 w05_001 w05_002`. The other nine runs have no
  frame between s04 and s05; their press is the same scripted step of the same deterministic boot.
- **The run's own captures repeat to the byte** across different PCSX2 runs (the "=" column): the same movie picture
  caught at the same point of a deterministic boot.

The picture count is **310**, as PC research 09 L77 and the roadmap's B16 cite: `mpeg2video (Main)`, 640x448,
`[SAR 14:15 DAR 4:3]`, 30 fps, duration 10.33 s. The decode has three black runs (peak channel <= 24): pictures
0-10, 141-160 (the gap between the cards) and 295-309; the Sony card is pictures 11-140, the Zipper card 161-294.

## 2. Method

### 2.1 The decode

ffmpeg 8.1 (`8.1-full_build-www.gyan.dev`), one thread, every picture to PNG at the native 640x448:

```sh
P=C:/Projects/socom_pc/game/disc/RUN/MOVIES/COMMON/SONY448.PSS
ffmpeg -hide_banner -threads 1 -i $P 2>&1 | grep -i "stream\|duration"       # the stream line quoted in section 1
mkdir -p logs/boot03/sony
ffmpeg -v error -threads 1 -i $P -map 0:v:0 -threads 1 -start_number 0 logs/boot03/sony/p%03d.png   # 310 files, no stderr
mkdir -p logs/boot03/intro2                                                    # for section 4.1 only
ffmpeg -v error -threads 1 -i C:/Projects/socom_pc/game/disc/RUN/MOVIES/INTRO_2.PSS -map 0:v:0 -threads 1 \
  -frames:v 150 -start_number 0 logs/boot03/intro2/p%03d.png
```

The colour conversion is libavcodec's default (BT.601 limited range), not the PS2 IPU's; how far those two differ is
PLAT-19a's question (README shared unknown 2). It cannot move these results: the cards are cyan text on black, and the
B scores leave 9.4 points or more between the match and black on the bright frames [corrected 2026-10-01 after review:
said "~10 points"].

### 2.2 The scorer: the title gate's own, and what it cannot see here

`tools_py/parity/compare.score(golden, ours)` (compare.py L19-27): both images converted to RGB and BOX-resized to
320x224, `score = 100 * (1 - 0.5 * mad - 0.5 * block)` where `mad` is the mean absolute RGB difference (0..1) and
`block` the fraction of the 20x14 16-pixel blocks whose mean colour differs by more than 0.08. `gate.py
_score_value` (L189-197) calls it with the golden first and takes `"score"`; `score_title` (L200-238) does nothing
else to the frames -- no crop, no mask, no aspect handling -- and its threshold is `TITLE_MIN_SCORE`. The block's bar
is its own (>= 95), not the gate's.

- **A, the gate's measure:** `compare.score(capture, picture)` exactly as `_score_value` does, golden = the PCSX2
  capture (640x480), ours = the decoded picture (640x448). Both are squeezed to 320x224 whole, which is the gate's
  handling of the size and the aspect: the console's 640x448 frame fills PCSX2's 4:3 window (stretched, not
  letterboxed -- an earlier pass that letterboxed the picture 16 rows top and bottom scored no higher, 100.0 / 100.0 /
  99.9 on `pcsx2_mission_a` s02-s04, and B's 99.9 on the stretched picture confirms the stretch). Because the score rounds to 0.1 and
  ties at 100.0 on these dark frames, the best picture is the one with the **least `mad`** -- and since `compare.score`
  rounds `mad` too (4 decimals), every picture at that least value is reported, not the first [corrected 2026-10-01
  after review: said "least raw `mad`" and took the first of a tie].
- **B, the same scorer on the text box** (the masked measure the dark frames need): the bounding box of the
  capture's pixels whose brightest channel exceeds 0.10, padded by 16 pixels, cut from the capture and from the picture
  resized (bicubic) 640x448 -> 640x480; the two cuts go through `compare.score` unchanged. Everything outside the box is
  masked. The best picture is again the least `mad`. Its two limits (added 2026-10-01 after review; §1): it does not
  penalise ink a picture has outside the capture's box, so it can pick a more fully typed picture (`mb10_pcsx2/s02`);
  and it cannot tell the movie's pixels from a font drawing the same words at the same place -- it tests the
  capture's pixels, not what produced them. [Corrected 2026-10-01 after review: B was introduced as "the settling
  measure" without these limits.]
- **Controls:** an all-black 640x448 picture under A and B, and B's best among the pictures of the *other* card
  (pictures 0-160 vs 161-309, the split read off the decode's black gap, §1).

Python 3.13 with numpy 2.5.3 and Pillow 12.1.1 was present; nothing was installed.

### 2.3 The commands

From the repository root of the worktree (the scratch scripts live in the git-ignored `logs/boot03/`; they stay scratch
because the gate's scorer is Python and a TypeScript tool under `socomlegacy/tools/` could only reimplement it, not use
it -- the measurement is one-off, and the script is recorded here so it can be re-run):

```sh
. scripts/python_env.sh
R=C:/Projects/socom_pc/logs/parity/runs
RUNS="pcsx2_mission_a pcsx2_mission_b pcsx2_mission_c pcsx2_mission_d pcsx2_mission_e pcsx2_mission_f pcsx2_mission_g pcsx2_title1 mb10_pcsx2 transition_pcsx2"
"$PYTHON" logs/boot03/score.py logs/boot03/sony $(for r in $RUNS; do echo $R/$r/s0{2,3,4}_CROSS.png; done)
"$PYTHON" logs/boot03/s05_mad.py $(for r in $RUNS; do echo $R/$r/s05_CROSS.png; done)     # section 4.1
```

[Corrected 2026-10-01 after review: the commands named runs a-d and `pcsx2_title1` only, and `score.py` reported the
first picture of a tie and no MD5; the script below is the corrected one, which produced §1's table.]

`logs/boot03/score.py`, verbatim:

```python
import glob
import hashlib
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.getcwd())
from tools_py.parity import compare  # noqa: E402

INK, PAD = 0.10, 16
CARD_SPLIT = int(os.environ.get("CARD_SPLIT", "161"))  # first picture of the Zipper card


def bbox(g):
    a = np.asarray(g, dtype=np.float32).max(axis=2) / 255.0 > INK
    ys, xs = np.nonzero(a)
    if not len(ys):
        return None
    return (max(0, xs.min() - PAD), max(0, ys.min() - PAD), min(g.width, xs.max() + 1 + PAD), min(g.height, ys.max() + 1 + PAD))


def ties(rs):
    """Every picture whose mad equals the least: compare.score rounds mad to 4 decimals, so a static card ties."""
    m = min(r["mad"] for r in rs)
    idx = [i for i, r in enumerate(rs) if r["mad"] == m]
    runs, s = [], idx[0]
    for a, b in zip(idx, idx[1:] + [None]):
        if b != a + 1:
            runs.append("%d" % s if s == a else "%d-%d" % (s, a))
            s = b
    return idx[0], ",".join(runs)


pics_dir, caps = sys.argv[1], sys.argv[2:]
imgs = [Image.open(p).convert("RGB") for p in sorted(glob.glob(os.path.join(pics_dir, "p*.png")))]
black = Image.new("RGB", imgs[0].size)
for c in caps:
    md5 = hashlib.md5(open(c, "rb").read()).hexdigest()[:8]
    g = Image.open(c).convert("RGB")
    a = [compare.score(g, im) for im in imgs]                       # A: the gate's call, golden first
    ia, ta = ties(a)
    ab = compare.score(g, black)["score"]
    box = bbox(g)
    if box is None:
        print(c, md5, "A", ta, a[ia]["score"], a[ia]["mad"], "black", ab, "no ink")
        continue
    gc = g.crop(box)                                                # B: the same scorer on the text box
    sb = [compare.score(gc, im.resize(g.size, Image.BICUBIC).crop(box)) for im in imgs]
    ib, tb = ties(sb)
    other = [r for i, r in enumerate(sb) if (i < CARD_SPLIT) != (ib < CARD_SPLIT)]
    io = int(np.argmin([r["mad"] for r in other]))
    bb = compare.score(gc, black.resize(g.size).crop(box))
    print(c, md5, "| A", ta, a[ia]["score"], a[ia]["mad"], "black", ab, "| B", tb, sb[ib]["score"], sb[ib]["mad"],
          "A's pick under B", sb[ia]["score"], "other", other[io]["score"], "black", bb["score"])
```

`logs/boot03/s05_mad.py`, verbatim (A's least `mad` over INTRO_2's first 150 pictures and over SONY448, and black's):

```python
import glob
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.getcwd())
from tools_py.parity import compare  # noqa: E402

for c in sys.argv[1:]:
    g = Image.open(c).convert("RGB")
    row = [os.path.basename(os.path.dirname(c))]
    for d in ("logs/boot03/intro2", "logs/boot03/sony"):
        ims = sorted(glob.glob(d + "/p*.png"))
        m = [compare.score(g, Image.open(p))["mad"] for p in ims]
        i = int(np.argmin(m))
        row.append("%s p%03d mad %.4f" % (os.path.basename(d), i, m[i]))
    row.append("black mad %.4f" % compare.score(g, Image.new("RGB", (640, 448)))["mad"])
    print(" | ".join(row))
```

## 3. The layouts: `dlgIntroScreen` draws nothing; `dlgIntroCinematic`'s background is the movie

Read with `parseRdr` from `RUN/UI/READERC.ZAR` (`S2U_TEST_FIXTURES` or the disc tree), from `redotcom`:

```sh
npx tsx --eval "import { readFileSync } from 'node:fs'; import { Zar, parseRdr } from '@s2u/archive'; for (const [a, m] of [['UI/READERC.ZAR', 'dlgIntroScreen.rdr'], ['UI/READERC.ZAR', 'dlgIntroCinematic.rdr'], ['READERC.ZAR', 'splash.rdr']]) { const z = Zar.parse(new Uint8Array(readFileSync(process.env.S2U_TEST_FIXTURES + '/RUN/' + a))); console.log(a, m, JSON.stringify(parseRdr(z.data(z.find(m)!)))); }"
```

| member | `BACKGROUND` | `OBJECTS` | `ANIMATIONS` (event -> animation) | `BUTTONS` |
|---|---|---|---|---|
| `dlgIntroScreen.rdr` (2,200 B) | `TYPE IMAGE`, `FILENAME` blank | **empty** | `ONSTART` -> `do_onstart`; `MEMCARD_ERROR` -> `handle_memcard_error` | empty |
| `dlgIntroCinematic.rdr` (800 B) | `TYPE MPEG`, `run/movies/common/sony448.pss` | **empty** | `ONSTART` -> `TurnOffVagStream`; `ONMPEGEND` -> `switch_menu` (argument `dlgSecondCinematic.rdr`) | no key |

`dlgIntroScreen`'s `SCRIPT_LIBRARY` is `dlgIntroScreen.rdr`, `uianim.rdr`, `UIMemCardAnim.rdr`, `UIHardDiskAnim.rdr`;
its font `font_text_01`. There is no `TEXT` or `TELETYPE` object in either file, and none could be drawn: a dialog's
objects are its `OBJECTS` and `CONTROLS` (`parseUiLayout`), and both are empty.

The zAnim side (`RUN/UIZANIM.ZAR`, `parseAnimSets` + `decodeUiSet`; names and ids only): the `dlgIntroScreen.rdr` set
has four animations -- `do_onstart`, `SwitchToProgressiveVideoE3`, `handle_memcard_error`, `verify_video_dtv_E3`. Its
`do_onstart` runs, in order: `IsControllerConnected` (a `POPUP` node while it is false), a blocking call of
`intro_onstart`, the `HDD_ENABLE` branch (`HardDriveOperation` `OPEN` / `GET_MISSION_DATA`, `DisplayHDDError`), then
`SWITCHMENU` `dlgIntroCinematic.rdr`. Its only on-screen output is `POPUP` dialogs; no command of any of the four
animations names a text object. The `dlgIntroCinematic.rdr` set holds one animation, `TurnOffVagStream`
(`VagStreaming` `OFF`). This agrees with B15's scratch read and replaces nothing in it.

## 4. The second unknown: the warning text, and `splash.rdr`

### 4.1 No warning screen stands between the Zipper card and the menu

`scripts/parity/launch_to_mission.txt` labels its sixth step (`s05`) "intro / warning screen", and the old golden set's
alignment (`scripts/parity/align.json` `s06_CROSS`, `docs/parity/REPORT.md` of 2026-09-07) calls the same frame
"warning / intro screen (animated fade ...)" -- one step later there, because that golden boot had the card notice as
an extra step. In all ten PCSX2 boot runs on record (`pcsx2_mission_a..g`, `pcsx2_title1`, `mb10_pcsx2`,
`transition_pcsx2`) that step is a dark frame and the next one is the main menu; none shows a warning text. [Corrected 2026-10-01 after review: said "all six PCSX2 runs on record",
leaving out `pcsx2_mission_e..g` and `transition_pcsx2`.] The dark frame is **believed** to be INTRO_2's opening fade.
Its least `mad` is at INTRO_2 pictures 2-6 in all ten runs (0.0002-0.0057), below SONY448's best (0.0003-0.0080) and
black's (0.0003-0.0081) -- a margin of 0.0001-0.0024 on frames that dark, so the `mad` alone does not settle it. A
second, independent look (the reviewer's, 2026-10-01, which this writer viewed and agrees with): at 8x gain the s05
captures of runs c and f show the same grid of points and the same light streaks as INTRO_2 picture 6 at 8x, and no
text. That is a visual comparison, not a score; it supports the belief better than the `mad` margin does. The images
are recreated, into any scratch directory, by (from the worktree root, `. scripts/python_env.sh`,
`R=C:/Projects/socom_pc/logs/parity/runs`):

```sh
ffmpeg -v error -threads 1 -i C:/Projects/socom_pc/game/disc/RUN/MOVIES/INTRO_2.PSS -map 0:v:0 -threads 1 -frames:v 7 -start_number 0 i2_p%03d.png
"$PYTHON" -c "import sys; from PIL import Image; [Image.open(p).convert('RGB').point(lambda v: min(255, 8 * v)).save(o) for p, o in zip(sys.argv[1::2], sys.argv[2::2])]" $R/pcsx2_mission_c/s05_CROSS.png s05_c_gain.png $R/pcsx2_mission_f/s05_CROSS.png s05_f_gain.png i2_p006.png i2_p006_gain.png
```

[Corrected 2026-10-01 after the second review: this paragraph cited the reviewer's git-ignored scratch images
(`logs/boot03-review/s05_gain.png`, `i2_p006_gain.png`) as its evidence; the command above makes them; re-made and
viewed by PLAT-19a's writer the same day, they show the same.]

The texts that **do** come before the intro are the boot's popups, reached from `dlgIntroScreen`. [Corrected 2026-10-01
after review: this paragraph placed popups 823, 824 and 825 "on `intro_onstart`'s format path" and had it call
`Ensure_MC_Dirs` on every path; re-decoded by sequence, it reads as follows.] `do_onstart` calls `intro_onstart`
(defined in the `UIanim.rdr` set) before `SWITCHMENU`. `intro_onstart` has four sequences:
- `end_of_screen`, the only one with activation 1 (it starts with the animation; research 95 §1.4): a blocking call of
  `load_initial_config`;
- `old_and_busted` (activation 2): `MC_ChPort`, then `CALL_SEQUENCE` `check_formatted` if a card is inserted, else
  `end_of_screen`;
- `check_formatted` (2): if the card is not formatted, the `AskToFormat` / `AreYouSureYouWantToFormat` /
  `AreYouSureYouDontWantToFormat` loop, which may `CALL_SEQUENCE` `do_formatting`; **else**, when
  `IsSpaceForSaveGameFile` is false, popup **823** -- then `end_of_screen`;
- `do_formatting` (2): popup **824**, `FormatMemCard`, popup **825**, `Ensure_MC_Dirs`, then `end_of_screen`.
  `Ensure_MC_Dirs` is called only here.

No `CALL_SEQUENCE` in all of `RUN/UIZANIM.ZAR` names `old_and_busted` (a search of every set's decoded ops), so on
this decode the three activation-2 sequences are not reached and `intro_onstart` runs `load_initial_config` only (a C
caller starting a sequence by name was not searched). `load_initial_config` is in the `UIMemCardAnim.rdr` set (also in
`dlgIntroScreen`'s script library); its calls include `find_a_memcard`, `DisplayLoadingWarning`, `Ensure_MC_Dirs_Fast`,
`NoSOCOMDataFound2`, `CannotSaveNoSpace`, `LoadConfig` (`BASCUS-97275SOCOMII`), `DisplayErrorLoading` and
`StoreOptions`, and a popup 826 -- B11's "loading" warning and "no SOCOM data found" by name. The controller popup and
the HDD popups are `do_onstart`'s own. So "the warning text before the intro" is, as far as the record goes, the card
popups `dlgIntroScreen` reaches through `load_initial_config` (`DisplayLoadingWarning` among them; which of its calls
run on which card state is BOOT-05's decode); a warning
**screen** of its own is not on any capture.

### 4.2 `splash.rdr` is a SOCOM 1 leftover the boot does not use

`splash.rdr` is a member of **`RUN/READERC.ZAR`**, not `RUN/UI/READERC.ZAR` (304 B). It is a flat record, no
`SCREENS`, no objects: `libname` `splash`, `texname` `splash.TIF`, `loadtexname` `splashload.tif`, `moviename`
`splash.pss`, `winscreen` `winner.TIF`, `lostscreen` `loser.TIF`. reCOM ships the same record for SOCOM 1
(`research/recom/data/s1/common/zrdr/splash.rdr`; `fts_state.h` L141-144 `SetMovie(moviename)`).

In SOCOM II none of it is reached at boot:
- No `splash.pss` exists anywhere on the disc, and no `splash.TIF`, `splashload.tif`, `winner.TIF` or `loser.TIF`: the
  splash library `RUN/COMMON/SPLA_TXR.ZED` holds `LittleBlack.tif`, `backsolid.tif` and `db_back.tif` only.
- The ELF's strings hold none of the record's keys (`moviename`, `loadtexname`, `texname`, `winscreen`, `lostscreen`
  are absent from `socom2_game.elf.strings.txt`), so no code looks them up by name.
- What the ELF does name is the asset library `common/assetlib/splash` (0x3e2a30, 0x3e5360), and only from two
  constructors that are not the boot's: `FUN_001f1d70` (L53506-53533, the state named `ExitState` at 0x3e2a18; the
  library at L53530) and `FUN_00224110` (L76175-76203, `MPExitState` at 0x3e5350; the library at L76199) -- the
  campaign's and multiplayer's end-of-game states.

## 5. Settled, not settled, and what would settle it

**Settled (measured):**
- SONY448.PSS's own pictures carry both cards, typed with the cursor: the Sony card in pictures 11-140, the Zipper card
  in 161-294 (a fact about the file, §1).
- `dlgIntroScreen.rdr` and `dlgIntroCinematic.rdr` have no objects (no TEXT/TELETYPE); `dlgIntroCinematic.rdr`'s
  background is the `MPEG` `run/movies/common/sony448.pss` and it binds no button (§3). With the line above, this is
  what makes the cards the movie and not a TEXT object.
- Every distinct PCSX2 capture of the cards in the ten boot runs equals a SONY448 picture: 100.0 under the gate's
  measure (where black also scores 97.3-99.9), and on the bright frames 94.6-99.9 under the text-box measure against
  82.0-85.2 for black; 14 of the 15 reach 95 under B, `pcsx2_mission_f/s02` 94.6 (§1). [Corrected 2026-10-01 after
  review: said "BOOT-03's >= 95 rule is met on every distinct capture and the text-box measure separates the match from
  black by 10.7-17.9 points", on 7 of the 15 distinct captures.]
- SONY448 decodes to 310 pictures at 30 fps, 640x448, DAR 4:3 (§1, §2.1).
- The CROSS presses after s02 and s03 did not skip SONY448, and the one after s02 did not pause it (the picture index
  keeps 30/s from s02 to s03, §1).
- The CROSS press after s04 did not end SONY448 early, nor pause it, **in `mb10_pcsx2`**, the one run on record with
  frames across that press (picture 177-178 at 677.90 s, picture 275 at 681.18 s, 30/s across the press at ~679.7 s;
  §1). [Corrected 2026-10-01 after the second review: this was moved to "Believed" by the first review because the
  timing of runs a-g cannot decide it; `mb10_pcsx2`'s wait frames do, for its press.]
- `splash.rdr` (`RUN/READERC.ZAR`) names files the disc does not hold and keys the ELF does not look up (§4.2).

[Corrected 2026-10-01 after review: "Settled" also listed "the third [press] does not end it early"; the timing cannot
decide it (s04's picture is a tie; the INTRO_2 load latency is unknown), so it moved to "Believed" below.]

**Believed, not settled:**
- The s04 press did not end SONY448 early in the other nine runs either: they have no frame across it (run a's press
  at about 47.7 s and INTRO_2 up at 51.7 s fit a skip and no skip equally), but it is the same scripted press of the same
  deterministic boot as `mb10_pcsx2`'s, which did not (above), and `dlgIntroCinematic.rdr` binds no button (§3).
  [Corrected 2026-10-01 after the second review: this item said the press as such was undecided, "settled by a capture
  at 1 frame/s or more across that press"; `mb10_pcsx2` has one.]
- The step-5 "intro / warning screen" frame is INTRO_2's opening fade (§4.1: a small `mad` margin on a near-black
  frame). Settled by BOOT-01's >= 2 Hz capture across the SONY448 -> INTRO_2 hand-off, or a recomp `PS2X_MPEG_TRACE`
  with the capture times.
- The "warning text before the intro" is the card popups `dlgIntroScreen` reaches through `load_initial_config`
  (`DisplayLoadingWarning`, `NoSOCOMDataFound2`, ..., §4.1). Settled by BOOT-01's per-card-state captures (BOOT-05
  decodes the popups' texts). [Corrected 2026-10-01 after review: said "`dlgIntroScreen`'s card popups" with §4.1's
  misplaced ids.]
- `intro_onstart`'s activation-2 sequences (`old_and_busted`, `check_formatted`, `do_formatting`) are unreached at
  boot: no zAnim `CALL_SEQUENCE` names `old_and_busted` (§4.1); a C caller was not searched.
- Whether a button can skip SONY448 when a capture pressed one at a moment this record did not sample: the layout
  binds none, and the console did not skip on the presses on record; a global skip outside the dialog is not
  ruled out by this read.

**Not this note's:** the pixel-exact match of a browser decoder to libavcodec and the IPU's colour conversion
(PLAT-19a, §7).

## 6. Placeholders and readings

None. This note names no stand-in value; BOOT-04 builds the boot sequence on §1 and §3.

## 7. The MPEG-2 decoder spike (PLAT-19a) -- libmpeg2 -> wasm passes; the IPU's conversion

Written 2026-10-01. [Corrected the same day: this section was a stub "blocked on the owner's Emscripten call", then
"the conversion settled, the libmpeg2 build owed" while the source was unreachable (§7.1, "The source").] The
libmpeg2 measurements are §7.8-§7.10, after the placeholders, so that the sections the first record numbered keep
their numbers.

### 7.1 The answer, item by item

**libmpeg2 0.5.1 compiled to WebAssembly passes items 1 and 2; PLAT-19b builds on it. The fallback is not needed.**

| item | result | the number |
|---|---|---|
| (1) frame-exact sequence | **pass** | SONY448 310 = 310 pictures; INTRO_2 and MENULOOP 330 = 330 from the cuts, the first 300 compared; the same order -- pinned by the temporal references on INTRO_2, by the decoder's own picture tags against the start codes on the all-intra streams (§7.8); 0 pictures with extra black 16x16 blocks (§7.8) |
| (2) samples, the epsilon | **pass, not bit-identical; attributed to the IDCT (strongly indicated, not proven, §7.9)** | max abs difference **3** per sample (intra-only streams: **1**), worst per-picture mean abs difference **0.0145** (Cr, INTRO_2); the hash-equal pictures 42/310, 1/300, 0/300 (§7.9) |
| (3) the IPU reference | **the IPU's conversion**, on libavcodec's samples and on libmpeg2's | gate score (A) ties at 100.0 on SONY448, 83.9 vs 83.3 on MENULOOP; the stretch-model measure: IPU 65.6-85.6 % of pixels exact, BT.601 2.0-11.7 % (§7.4) |
| (4) size | measured | `libmpeg2.wasm` (-O3) **85,001 B raw, 23,687 B gzip -9** (the build with the review's glue fix; the first was 84,777 / 23,583); no JS glue (a standalone module, one import); -Oz 58,817 / 19,080 B, identical output; decode in Node 0.44-0.93 ms per picture (§7.10) |

**The epsilon PLAT-19b inherits:** per sample, |libmpeg2 - libavcodec| <= **3** in every plane; per picture, the mean
abs difference <= **0.015** in every plane (measured 0.0110 Y, 0.0135 Cb, 0.0145 Cr at worst, INTRO_2's first 300).
Measured on 910 pictures; INTRO_2 beyond picture 300 and MENULOOP's P/B part (if it has one past 330) are not measured
(§7.6). [Corrected 2026-10-02, PLAT-19b: measured on the whole movies (§7.11), the bound is **5 per sample and a
per-picture mean of 0.021**: INTRO_2 reaches 5 at picture 1284 (Cr) and a mean of 0.0209 at picture 2247 (Y);
SONY448 and MENULOOP (all intra, 3732 pictures, not 3790) stay within 1 and 0.0116.]

**The source.** [Corrected 2026-10-01: this part said "Why the build is owed".] The tarball came from Debian's
archive, allowed by the owner after upstream's links failed (below):

- `https://deb.debian.org/debian/pool/main/m/mpeg2dec/mpeg2dec_0.5.1.orig.tar.gz` -- **524,776 B, sha256
  `dee22e893cb5fc2b2b6ebd60b88478ab8556cb3b93f9a0d7ce8f3b61851871d4`** (md5 `0f92c7454e58379b4a5a378485bbd8ef`). It
  unpacks to `libmpeg2-0.5.1/`, whose `include/mpeg2.h` says `MPEG2_RELEASE MPEG2_VERSION (0, 5, 1)`.
- The independent record: `mpeg2dec_0.5.1-11.dsc` (1,572 B, same directory; Debian's current revision, Maintainer
  Debian Multimedia Maintainers) lists the same sha256, size and md5 under `Checksums-Sha256` / `Files`. Its PGP
  signature was not verified (no keyring on this host).
- Debian's own changes, **not applied** (upstream's C files are built as they are): `mpeg2dec_0.5.1-11.debian.tar.xz`
  (10,344 B, sha256 `44387b2adb858acfc2715d3b82399b9cbbb23366248817afaf6a3edb4c8e975b`, as the `.dsc` lists) carries
  `debian/patches/0001-arm-private-symbols.patch`, `0002-global-symbol-test.patch`, `0003-arm-test-with-compiler.patch`
  -- they touch `libmpeg2/motion_comp_arm_s.S`, `test/globals` and `configure.ac` respectively, none of them a file
  this build compiles or runs.

Upstream's own links, tried first, all failed on 2026-10-01:

- `https://libmpeg2.sourceforge.io/files/libmpeg2-0.5.1.tar.gz` -- the link on the upstream pages
  (`https://libmpeg2.sourceforge.io/` and its `downloads.html`, fetched the same day) -- HTTP 404, a 146-byte HTML page;
  the older `http://libmpeg2.sourceforge.net/files/...` redirects to it.
- `https://sourceforge.net/projects/libmpeg2/files/` -- the project page the upstream lists: its file area holds only
  `OldFiles/` (mpeg2dec 0.1.7 and 0.2.0); `.../files/libmpeg2/0.5.1/libmpeg2-0.5.1.tar.gz/download` is a 404.
- `https://trac.videolan.org/libmpeg2/browser` -- the source browser the downloads page lists -- HTTP 404.

[Corrected 2026-10-01: the record of the failed links ended "no `config.h`, glue or build script is in the tree yet"
and named Debian and VideoLAN as candidates; the owner allowed both, Debian answered, VideoLAN was not needed.]

**The build** (`packages/fmv/wasm/`, committed: `build.sh`, `config.h`, `glue.c`, upstream's `COPYING`, a `.gitignore`
for `out/`). `bash packages/fmv/wasm/build.sh <orig.tar.gz>` from `redotcom`, after `source
~/emsdk/emsdk_env.sh`: it fetches nothing, refuses a tarball whose sha256 is not the pinned one,
unpacks it into the ignored `out/src/`, never runs `configure` or any script of the tarball, and compiles with **emcc
6.0.10** (d6c521a7f05449857c76bd99e396895583cf2083) -- the line `build.sh` runs, paths shortened (`out/build.txt`
holds it whole):

```sh
emcc -O3 -std=gnu99 -I packages/fmv/wasm -I out/src/libmpeg2-0.5.1/include -I out/src/libmpeg2-0.5.1/libmpeg2 \
  -sSTANDALONE_WASM=1 --no-entry -sEXPORTED_FUNCTIONS=_s2u_fmv_open,...,_s2u_fmv_close \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4194304 -sFILESYSTEM=0 \
  alloc.c header.c decode.c slice.c motion_comp.c idct.c cpu_accel.c cpu_state.c glue.c -o out/libmpeg2.wasm
```

The sources are `libmpeg2/Makefile.am`'s `libmpeg2_la_SOURCES` plus `cpu_accel.c` and `cpu_state.c`
(`mpeg2_detect_accel`, `mpeg2_cpu_state_init`). The hand-written `config.h` defines no `ARCH_*` and no `ACCEL_DETECT`,
so `mpeg2_idct_init` and `mpeg2_mc_init` take the generic C paths (`mpeg2_idct_copy_c` / `mpeg2_idct_add_c`,
`mpeg2_mc_c`): no SIMD, no threads. Two builds from the same tarball give the same `.wasm`: sha256 `f351bf840ea17eb3a17f143fdc6084a58583c0c033cb373cfe1ab90180806b82` for the
glue in the tree (commit "fix(web/fmv): glue's end latch ..."). [Corrected 2026-10-01 after review: gave the first
build's `51c660b5...2bfae9` (84,777 B), whose glue latched the end of the stream (below); its decodes of the three
streams are byte-identical to the rebuilt one's.]
The module's one import is `env.emscripten_notify_memory_growth` (a notification; the harness stubs it and it is
never needed for the output).

**The glue** (`glue.c`, libmpeg2's state machine as `doc/sample1.c` drives it): `s2u_fmv_open()`; `s2u_fmv_buffer(h,
n)` returns a glue-owned input buffer and `s2u_fmv_feed(h, n)` hands it to `mpeg2_buffer`; `s2u_fmv_next(h)` runs
`mpeg2_parse` until a picture is ready for display (1), more bytes are needed (0) or the stream is invalid (-1);
`s2u_fmv_plane(h, 0..2)` are the decoder's own Y, Cb, Cr buffers (width-strided, no copy, valid until the next
`next`), with `s2u_fmv_index` (display order, 0..), `s2u_fmv_type` (1 I, 2 P, 3 B), `s2u_fmv_temporal_reference`,
`s2u_fmv_nb_fields`, the sizes; `s2u_fmv_flush(h)` feeds a `sequence_end_code` (00 00 01 B7) when the stream does not
end with one, so libmpeg2 completes the last picture and releases the reference picture it holds back;
`s2u_fmv_feed_tagged(h, n, tag)` with `s2u_fmv_tag` / `s2u_fmv_tagged` carry libmpeg2's picture tags
(`mpeg2_tag_picture`: the tag goes to the next picture whose start code follows) -- the harness's order proof (§7.8)
and PLAT-19b's way to pair a displayed picture with its PTS; `s2u_fmv_close(h)`. **The end latch** [corrected 2026-10-01
after review]: the first glue set `ended` at the first `STATE_END` and never cleared it, so in a stream with a
`sequence_end_code` in the middle and none at the end, the flush did nothing and the stream's last pictures were never
shown. Now anything decoded after the end code (a sequence or GOP header, a picture) clears it. Proved on a stream made
of MENULOOP's first 20 coded pictures plus `00 00 01 B7`, then INTRO_2's first 31 with no end (51 picture start codes;
`logs/plat19a/mk2seq.py`): the first build displays **49** (`fmv-spike.ts decode ... --check`: "51 coded pictures ...,
49 displayed: FAIL"), the rebuilt one **51**, in order by tags (PASS), within max 2 of libavcodec's decode of the same
bytes (51 pictures). The source and the `.wasm` are not in
git; the third-party notice of whatever ships (libmpeg2's GPL text and source offer) is PLAT-19b's. [Corrected 2026-10-02,
PLAT-19b: two glue defects found by sprint 6's close review are fixed and `s2u_fmv_reset` added (research 120 §2): a
failed buffer growth is refused rather than written through, and a feed clears the flush latch, which had stopped a
handle fed on after a flush from being flushed again. The rebuilt `.wasm` is 85,364 B raw, 23,835 B gzip -9, sha256
`2dc598cab0ce6fc3edd368bfcc52bbe6cb7462e0ae6f890c9d8cbd5ccb8188ee`; the notice ships beside it (research 120 §6).]

The fail rule did not trigger; the FFmpeg-wasm fallback was not built.

### 7.2 The harness

`tools/fmvPlanes.ts` (pure, `tools/test/fmvPlanes.test.ts`, 11 tests on synthetic pictures): the per-plane compare of
two yuv420p pictures (equal, max |d|, sum |d|), the IPU's colour conversion (`ipuCsc`, §7.4), and the extra-black-block
check (`extraBlackBlocks`): both pictures converted by `ipuCsc`, a 16x16 block "black" when every RGB byte is 0
(`tools_py/parity/movie_blocks.py` `black_mask`, L191-193), a finding when it is black in ours and not in the
reference -- the module's differential `missing = gpu black AND NOT shadow black` (L12, L459) with the reference decode
in the shadow's place, since an absolute black count fires on the movies' own letterbox and fades (PC research 16 §0).

`tools/fmv-spike.ts compare <ours.yuv> <ref.yuv> [--count N] [--out records.json]` reads two raw decodes and prints the
counts, the pictures hash-equal per plane, the worst and mean |d| per plane, the pictures nearer to a neighbouring
reference picture than to their own (a drop, repeat or reorder), and the pictures with extra black blocks; `--out`
writes per-picture records (index, plane hashes both sides, the diff, the blocks) to scratch. `ipuCsc` and the scratch
script's `ipu` (§7.5) give byte-identical RGB on MENULOOP picture 57.

`tools/fmv-spike.ts decode <libmpeg2.wasm> <stream.m2v> <ours.yuv> [--chunk 4096] [--records r.json]` compiles and
instantiates the bare `.wasm` itself (`WebAssembly.compile` / `instantiate`, every import a stub that records a call),
feeds the elementary stream in 4,096-byte pieces through the glue, flushes at the end, and writes every displayed
picture to raw yuv420p in display order; it checks the glue's index against its own count, prints the count, the
coding types, whether the sequence end was in the stream or fed by the flush, the invalid states and the time spent in
the wasm calls (not the file writes), and `--records` writes per picture the index, type, temporal reference, field
count and plane hashes. [Corrected 2026-10-01: this paragraph said the decode mode "waits for the build".]

### 7.3 The reference side (libavcodec)

ffmpeg 8.1 (`8.1-full_build-www.gyan.dev`), one thread; everything under the worktree's git-ignored `logs/plat19a/`:

```sh
S=C:/Projects/socom_pc/game/disc/RUN/MOVIES
ffmpeg -v error -threads 1 -i $S/COMMON/SONY448.PSS  -map 0:v:0 -c copy -f mpeg2video es/sony448.m2v          # 3,537,377 B
ffmpeg -v error -threads 1 -i $S/INTRO_2.PSS         -map 0:v:0 -c copy -frames:v 330 -f mpeg2video es/intro2_330.m2v    # 8,921,885 B
ffmpeg -v error -threads 1 -i $S/COMMON/MENULOOP.PSS -map 0:v:0 -c copy -frames:v 330 -f mpeg2video es/menuloop_330.m2v  # 6,685,847 B
for s in sony448 intro2_330 menuloop_330; do
  ffmpeg -v error -threads 1 -f mpegvideo -i es/$s.m2v -threads 1 -fps_mode passthrough -f rawvideo -pix_fmt yuv420p ref/$s.yuv
done                                     # 310, 330, 330 pictures of 430,080 B, no remainder, no stderr
for s in sony448 menuloop_330; do        # (b) of item 3: ffmpeg's default (BT.601) yuv420p -> rgb24
  ffmpeg -v error -threads 1 -f rawvideo -pix_fmt yuv420p -s 640x448 -i ref/$s.yuv -threads 1 -f rawvideo -pix_fmt rgb24 ref/$s.rgb24
done
```

The 330-picture cuts leave 30 pictures of slack past the 300 the block compares, so a decoder's reorder delay at the
cut cannot reach them. The stream lines: SONY448 and MENULOOP `mpeg2video (Main), yuv420p(tv, bt470bg/bt470m/bt470m,
top first), 640x448 [SAR 14:15 DAR 4:3], 30 fps`; INTRO_2 the same at `29.97 fps`, `progressive`. **The ES cut loses
nothing:** SONY448 decoded from the PSS directly and from the ES are hash-equal on all 310 pictures
(`npx tsx tools/fmv-spike.ts compare ../../logs/plat19a/ref/sony448_frompss.yuv ../../logs/plat19a/ref/sony448.yuv`:
310/310 equal, 0 shifted, 0 extra black).

**FFmpeg 8.1 here, 7.1 in the recomp.** Not compared: no FFmpeg 7.1 executable is on this host (the recomp links 7.1's
DLLs). Whether it matters for `mpeg2video` is not settled by this note; it would be by one 7.1 decode of the three cuts
compared with `fmv-spike.ts compare` (hash-equal or not). The recomp's `PS2X_MPEG_TRACE` count (SONY448 310, PC
research 09 L76-80) agrees with the 8.1 count.

### 7.4 Item 3: the IPU's colour conversion against ffmpeg's BT.601

**(a) the IPU**, as PCSX2 implements it: `pcsx2/IPU/yuv2rgb.cpp` `yuv2rgb_reference` at PCSX2 commit
`81526d4dc7cc70e4ae75abb35a789417456c6d43` (master, 2026-10-01; read over HTTPS from github.com/PCSX2/pcsx2). The file
says it is "the precise documented integer method used by the hardware"; its SSE2 and NEON paths (`yuv2rgb_sse2`,
`yuv2rgb_neon`) compute the same integers. Coefficients in 1/64: `IPU_Y_COEFF 0x95` (1.1640625), `IPU_RCR_COEFF 0xcc`
(1.59375), `IPU_GCR_COEFF -0x68` (-0.8125), `IPU_GCB_COEFF -0x32` (-0.390625), `IPU_BCB_COEFF 0x102` (2.015625);
`lum = (0x95 * max(0, Y - 16)) >> 6`, each chroma term `(coeff * (C - 128)) >> 6` on its own (arithmetic shift),
`R/G/B = clamp((sum + 1) >> 1)`; chroma nearest, one Cb/Cr per 2x2 luma. **(b)** ffmpeg's `-pix_fmt rgb24` from the
same yuv (§7.3). The two differ by 0.60-0.62 levels on average over SONY448's lit pixels and 0.98 on MENULOOP's, at
most 3.

**The pictures.** SONY448: BOOT-03's best pictures for `pcsx2_mission_a/s02..s04` (§1: 38, 137, 229). MENULOOP: the
golden set's s07, the main menu over the movie, is `D:/socom_archive/parity/golden/s07_CROSS.png` (the 2026-09-07
golden set of PC `docs/parity/REPORT.md`, "Golden: PCSX2 2.8.1 (`logs/parity/golden`)", since archived to D:;
640x480, captured at 57.4 s). Its picture is **57** (least mean |d| on the regions below under BT.601, 1.010 levels;
58 1.019, 59 1.202, 56 1.242; under the IPU 57 0.266, 58 0.314); the whole-frame least `mad` picks 57 too (IPU 0.0657, BT.601 0.0671), but with neighbours within 0.001,
because the menu covers the frame.

**The gate's score (A), and the text box (B), as BOOT-03 measured them (§2.2):**

| capture | picture | A: IPU | A: BT.601 | B: IPU (mad) | B: BT.601 (mad) |
|---|---|---|---|---|---|
| `pcsx2_mission_a/s02` | 38 | 100.0 (0.0004) | 100.0 (0.0004) | 99.6 (0.0088) | 99.6 (0.0077) |
| `pcsx2_mission_a/s03` | 137 | 100.0 (0.0001) | 100.0 (0.0002) | 100.0 (0.0005) | 99.9 (0.0010) |
| `pcsx2_mission_a/s04` | 229 | 100.0 (0.0004) | 100.0 (0.0004) | 99.9 (0.0019) | 99.9 (0.0024) |
| golden `s07` (MENULOOP) | 57 | 83.9 (0.0657) | 83.3 (0.0671) | 83.9 (0.0648) | 83.3 (0.0670) |

A cannot decide it: it saturates at 100.0 on the dark SONY448 frames (BOOT-03's warning, §1), and on the menu frame
the menu's own drawing (logo, roller, footer -- not in the movie) holds both near 83. B leans IPU on s03 and s04 by
0.0005 of `mad`, too little alone.

**The measure that separates them: the capture's own geometry.** PCSX2 shows the 640x448 picture stretched to 480
rows. Modelling that stretch as a vertical linear interpolation with pixel centres aligned (`y = (r + 0.5) * 448/480 -
0.5`; `vfit.py`, §7.5) and rounding, then comparing the model to the capture pixel by pixel (lit pixels -- brightest
channel > 0.10 -- for SONY448; for the menu, the regions the menu draws nothing over: x 0-200 and 450-640 at y
280-480, x 0-60 and 590-640 at y 0-280, 108,800 pixels):

| capture | picture | pixels | IPU: mean abs d / signed R,G,B / exact / within 1 | BT.601: mean abs d / signed R,G,B / exact / within 1 |
|---|---|---|---|---|
| `pcsx2_mission_a/s03` | 137 | 3,123 | 0.191 / -0.04, -0.06, -0.04 / **68.4 %** / 93.6 % | 0.614 / 0.40, 0.82, 0.38 / 11.7 % / 84.3 % |
| `pcsx2_mission_a/s04` | 229 | 6,445 | 0.201 / 0.00, -0.03, -0.01 / **65.6 %** / 93.8 % | 0.660 / 0.35, 0.95, 0.48 / 10.1 % / 76.2 % |
| golden `s07` (MENULOOP) | 57 | 108,800 | 0.266 / 0.05, 0.17, 0.18 / **84.5 %** / 96.2 % | 1.010 / 0.87, 1.02, 1.08 / 2.2 % / 84.6 % |
| `pcsx2_mission_a/s06` (menu) | 95 | 108,800 | 0.271 / 0.05, 0.16, 0.19 / **83.8 %** / 96.1 % | 1.019 / 0.86, 1.05, 1.08 / 2.5 % / 84.2 % |
| `pcsx2_mission_b/s06` (menu) | 23 | 108,800 | 0.258 / 0.05, 0.17, 0.18 / **85.6 %** / 96.4 % | 0.992 / 0.87, 1.00, 1.05 / 2.0 % / 84.6 % |

**Verdict: the IPU's conversion.** Under it the capture is reproduced exactly at 65.6-85.6 % of the pixels and within
one level at 93.6-96.4 %, with no bias to speak of (signed means within 0.2 level); under BT.601 the exact share falls
to 2.0-11.7 % and every channel is off by +0.35 to +1.08 levels (signed = capture minus ours: ffmpeg's rgb24 is darker
than what PCSX2 shows). The stretch model is a model: with the centres unaligned (`y = r * 448/480`, `vfit.py`'s fifth
argument 0) the IPU's exact share drops (s03 68.4 -> 51.8 %, s04 65.6 -> 23.3 %) while BT.601's barely moves (s03
11.7 -> 12.1 %, s04 10.1 -> 8.2 %), and the order holds on both. [Corrected 2026-10-01 after review: said "the shares
drop for both", which s03's BT.601 figure contradicts.] `pcsx2_mission_a/s02` does not separate: no picture of
SONY448 reproduces it (picture 38, the best, misses by ~10 levels in G and B under both conversions, mean abs d 7.4 /
6.8) -- a capture between pictures or caught by the display's field handling (the stream is `top first`); not
explained here.

**On libmpeg2's samples the verdict is the same.** [Corrected 2026-10-01: this paragraph said the table above "is
re-run on libmpeg2's samples when the build exists".] The same scripts on the wasm decode (`logs/plat19a/ours/`, its
rgb24 made by the same ffmpeg line as §7.3):

| capture | picture | IPU: mean abs d / exact / within 1 | BT.601: mean abs d / exact / within 1 | gate A: IPU / BT.601 |
|---|---|---|---|---|
| `pcsx2_mission_a/s03` | 137 | 0.180 / **69.9 %** / 94.6 % | 0.606 / 11.7 % / 85.6 % | 100.0 / 100.0 |
| `pcsx2_mission_a/s04` | 229 | 0.197 / **65.9 %** / 93.8 % | 0.653 / 10.1 % / 76.6 % | 100.0 / 100.0 |
| golden `s07` (MENULOOP) | 57 | 0.268 / **84.2 %** / 96.0 % | 1.009 / 2.2 % / 84.7 % | 83.9 / 83.3 |
| `pcsx2_mission_a/s06` (menu) | 95 | 0.272 / **83.6 %** / 96.0 % | 1.017 / 2.5 % / 84.3 % | -- |
| `pcsx2_mission_b/s06` (menu) | 23 | 0.260 / **85.3 %** / 96.2 % | 0.992 / 2.0 % / 84.6 % | -- |

The picture matches are the same (57, 95, 23 by the region search). Between the two decoders the IPU's exact share
moves by at most 1.5 points (s03 68.4 -> 69.9, s07 84.5 -> 84.2), within the IDCT difference of §7.9; neither decoder
is the console's own IDCT, so this does not rank libmpeg2 against libavcodec as a reference of the IPU.

### 7.5 The scratch scripts, verbatim

From the worktree's root (`. scripts/python_env.sh`; Python 3.13, numpy 2.5.3, Pillow 12.1.1, nothing installed):

```sh
L=logs/plat19a/ref; R=C:/Projects/socom_pc/logs/parity/runs; G=D:/socom_archive/parity/golden/s07_CROSS.png
"$PYTHON" logs/plat19a/ipu_score.py $L/sony448.yuv $L/sony448.rgb24 $R/pcsx2_mission_a/s04_CROSS.png 229   # also s02 38, s03 137
"$PYTHON" logs/plat19a/ipu_score.py $L/menuloop_330.yuv $L/menuloop_330.rgb24 $G 57                       # `best` in place of 57: the A search
"$PYTHON" logs/plat19a/vfit.py $L/sony448.yuv $L/sony448.rgb24 $R/pcsx2_mission_a/s04_CROSS.png 229 [0]     # optional 5th: the offset
"$PYTHON" logs/plat19a/region.py $L/menuloop_330.yuv $L/menuloop_330.rgb24 $G best 0,280,200,480 450,280,640,480 0,0,60,280 590,0,640,280
```

`logs/plat19a/ipu_score.py`:

```python
"""PLAT-19a item 3: a decoded picture converted by (a) the IPU's CSC and (b) ffmpeg's BT.601 rgb24, each scored
against a PCSX2 capture. Usage: ipu_score.py <yuv> <rgb24> <capture.png> <picture> [<picture> ...]
(or `best` as the only picture: the least whole-frame mad over every picture, under each conversion)."""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.getcwd())
from tools_py.parity import compare  # noqa: E402

W, H = 640, 448
FRAME = W * H * 3 // 2
INK, PAD = 0.10, 16


def yuv(path, i):
    with open(path, "rb") as f:
        f.seek(i * FRAME)
        b = np.frombuffer(f.read(FRAME), dtype=np.uint8)
    y = b[:W * H].reshape(H, W).astype(np.int32)
    u = b[W * H:W * H + W * H // 4].reshape(H // 2, W // 2).astype(np.int32)
    v = b[W * H + W * H // 4:].reshape(H // 2, W // 2).astype(np.int32)
    return y, u, v


def ipu(y, cb, cr):
    """PCSX2 pcsx2/IPU/yuv2rgb.cpp yuv2rgb_reference (commit 81526d4d): nearest chroma, >>6 per term, (+1)>>1."""
    cb = cb.repeat(2, 0).repeat(2, 1) - 128
    cr = cr.repeat(2, 0).repeat(2, 1) - 128
    lum = (0x95 * np.maximum(0, y - 16)) >> 6
    r = (lum + ((0xcc * cr) >> 6) + 1) >> 1
    g = (lum + ((-0x68 * cr) >> 6) + ((-0x32 * cb) >> 6) + 1) >> 1
    b = (lum + ((0x102 * cb) >> 6) + 1) >> 1
    return Image.fromarray(np.clip(np.stack([r, g, b], 2), 0, 255).astype(np.uint8))


def ff(path, i):
    with open(path, "rb") as f:
        f.seek(i * W * H * 3)
        return Image.fromarray(np.frombuffer(f.read(W * H * 3), dtype=np.uint8).reshape(H, W, 3))


def bbox(g):
    a = np.asarray(g, dtype=np.float32).max(axis=2) / 255.0 > INK
    ys, xs = np.nonzero(a)
    if not len(ys):
        return None
    return (max(0, xs.min() - PAD), max(0, ys.min() - PAD), min(g.width, xs.max() + 1 + PAD), min(g.height, ys.max() + 1 + PAD))


def lit(g, im):
    """On the capture's lit pixels (max channel > INK), ours resized bicubic to the capture's size: mad (0..1) and
    the mean signed difference capture - ours per channel (0..255)."""
    ga = np.asarray(g, dtype=np.float32)
    oa = np.asarray(im.resize(g.size, Image.BICUBIC), dtype=np.float32)
    m = ga.max(axis=2) / 255.0 > INK
    d = ga[m] - oa[m]
    return float(np.abs(d).mean() / 255.0), [round(float(x), 2) for x in d.mean(axis=0)], int(m.sum())


yuv_path, rgb_path, cap = sys.argv[1:4]
g = Image.open(cap).convert("RGB")
n = os.path.getsize(yuv_path) // FRAME
pics = sys.argv[4:]
conv = {"ipu": lambda i: ipu(*yuv(yuv_path, i)), "bt601": lambda i: ff(rgb_path, i)}
if pics == ["best"]:
    for name, f in conv.items():
        m = [compare.score(g, f(i))["mad"] for i in range(n)]
        i = int(np.argmin(m))
        print(cap, name, "best p%03d" % i, "mad %.4f" % m[i], "next", sorted(m)[1:4])
    sys.exit(0)
box = bbox(g)
for p in pics:
    i = int(p)
    ims = {name: f(i) for name, f in conv.items()}
    gm = np.asarray(g, dtype=np.float32).max(axis=2) / 255.0 > INK
    gap = np.abs(np.asarray(ims["ipu"].resize(g.size, Image.BICUBIC), dtype=np.float32)
                 - np.asarray(ims["bt601"].resize(g.size, Image.BICUBIC), dtype=np.float32))[gm]
    print(os.path.basename(os.path.dirname(cap)) + "/" + os.path.basename(cap), "p%03d" % i,
          "ipu-vs-bt601 on the lit pixels: mean %.3f max %d levels" % (gap.mean(), gap.max()))
    for name, im in ims.items():
        a = compare.score(g, im)
        b = compare.score(g.crop(box), im.resize(g.size, Image.BICUBIC).crop(box)) if box else None
        print("  ", name, "A", a, "B", b, "lit", lit(g, im))
```

`logs/plat19a/vfit.py`:

```python
"""Model PCSX2's 448 -> 480 display stretch as a vertical linear interpolation and compare each conversion to the
capture on the lit pixels: the residual (capture - model) per channel, its mean |.| and the share of exact hits."""
import sys, numpy as np
from PIL import Image
exec(open("logs/plat19a/ipu_score.py").read().split("yuv_path, rgb_path, cap")[0])
yuv_path, rgb_path, cap, i = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
off = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
g = np.asarray(Image.open(cap).convert("RGB"), dtype=np.float64)
m = g.max(axis=2) / 255.0 > INK
for name, im in (("ipu", ipu(*yuv(yuv_path, i))), ("bt601", ff(rgb_path, i))):
    o = np.asarray(im, dtype=np.float64)
    y = (np.arange(480) + off) * 448 / 480 - off
    y0 = np.clip(np.floor(y).astype(int), 0, 447); y1 = np.clip(y0 + 1, 0, 447); t = (y - np.floor(y))[:, None, None]
    model = o[y0] * (1 - t) + o[y1] * t
    d = g[m] - np.round(model[m])
    print(name, "off", off, "lit px", int(m.sum()), "mean|d| %.3f" % np.abs(d).mean(), "signed", np.round(d.mean(0), 2),
          "exact %.3f" % (np.abs(d).max(1) == 0).mean(), "within1 %.3f" % (np.abs(d).max(1) <= 1).mean())
```

`logs/plat19a/region.py`:

```python
"""MENULOOP under the menu: score each conversion on capture regions the menu draws nothing over (x0,y0,x1,y1 in the
capture's 640x480), with the same vertical stretch model as vfit.py. `best` finds the picture by the least mean |d|."""
import sys, numpy as np
from PIL import Image
exec(open("logs/plat19a/ipu_score.py").read().split("yuv_path, rgb_path, cap")[0])
yuv_path, rgb_path, cap = sys.argv[1:4]
boxes = [tuple(int(v) for v in b.split(",")) for b in sys.argv[5:]]
g = np.asarray(Image.open(cap).convert("RGB"), dtype=np.float64)
m = np.zeros(g.shape[:2], bool)
for x0, y0, x1, y1 in boxes:
    m[y0:y1, x0:x1] = True
y = (np.arange(480) + 0.5) * 448 / 480 - 0.5
y0 = np.clip(np.floor(y).astype(int), 0, 447); y1 = np.clip(y0 + 1, 0, 447); t = (y - np.floor(y))[:, None, None]
def model(im):
    o = np.asarray(im, dtype=np.float64)
    return np.round(o[y0] * (1 - t) + o[y1] * t)
n = os.path.getsize(yuv_path) // FRAME
def stats(name, im):
    d = g[m] - model(im)[m]
    return "%s mean|d| %.3f signed %s exact %.3f within1 %.3f" % (name, np.abs(d).mean(), np.round(d.mean(0), 2),
                                                                  (np.abs(d).max(1) == 0).mean(), (np.abs(d).max(1) <= 1).mean())
if sys.argv[4] == "best":
    md = [np.abs(g[m] - model(ff(rgb_path, i))[m]).mean() for i in range(n)]
    order = np.argsort(md)[:4]
    print("best by region (bt601):", [(int(i), round(float(md[i]), 3)) for i in order])
    i = int(order[0])
else:
    i = int(sys.argv[4])
print("p%03d px %d" % (i, m.sum()))
print(stats("ipu", ipu(*yuv(yuv_path, i))))
print(stats("bt601", ff(rgb_path, i)))
```

`logs/plat19a/attrib.py` (§7.9; run from the worktree root as `"$PYTHON" logs/plat19a/attrib.py logs/plat19a/ours/$s.yuv
logs/plat19a/ref/$s.yuv logs/plat19a/ours/$s.json 300`, 310 for SONY448):

```python
"""PLAT-19a item 2: where libmpeg2's samples differ from libavcodec's. Per picture (display order): the coding type
(from fmv-spike's --records), the pictures since the last I in decode terms (GOP position), the max and mean |d| per
plane, the share of differing samples, and for I pictures the 8x8-block structure of the differences.
Usage: attrib.py <ours.yuv> <ref.yuv> <records.json> <count>"""
import json
import sys

import numpy as np

W, H = 640, 448
FRAME = W * H * 3 // 2
ours_p, ref_p, rec_p, count = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
recs = json.load(open(rec_p))
o = np.memmap(ours_p, dtype=np.uint8, mode="r")
r = np.memmap(ref_p, dtype=np.uint8, mode="r")


def pl(buf, i):
    b = buf[i * FRAME:(i + 1) * FRAME].astype(np.int16)
    return b[:W * H].reshape(H, W), b[W * H:W * H * 5 // 4].reshape(H // 2, W // 2), b[W * H * 5 // 4:].reshape(H // 2, W // 2)


by_type = {}
since_i = -1
rows = []
for i in range(count):
    t = recs[i]["type"]
    since_i = 0 if t == "I" else since_i + 1
    a, b = pl(o, i), pl(r, i)
    d = [np.abs(x - y) for x, y in zip(a, b)]
    mx = [int(x.max()) for x in d]
    mean = [float(x.mean()) for x in d]
    frac = [float((x > 0).mean()) for x in d]
    by_type.setdefault(t, []).append((mx, mean, frac))
    rows.append((i, t, since_i, mx, mean, frac))

for t, v in sorted(by_type.items()):
    mx = np.array([x[0] for x in v]); mean = np.array([x[1] for x in v]); frac = np.array([x[2] for x in v])
    print("%s: %d pictures; max |d| Y/Cb/Cr %s; mean |d| %s; differing samples (mean share) %s; pictures with any diff %d"
          % (t, len(v), mx.max(0).tolist(), np.round(mean.mean(0), 5).tolist(), np.round(frac.mean(0), 5).tolist(),
             int((mx.max(1) > 0).sum())))

# The difference histogram over all compared pictures, Y plane.
hist = np.zeros(256, np.int64)
for i in range(count):
    a, b = pl(o, i), pl(r, i)
    hist += np.bincount(np.abs(a[0] - b[0]).ravel(), minlength=256)[:256]
nz = [(k, int(c)) for k, c in enumerate(hist) if c]
print("Y |d| histogram:", nz[:12])

# The worst pictures.
worst = sorted(rows, key=lambda x: -max(x[3]))[:5]
for i, t, s, mx, mean, frac in worst:
    print("worst p%03d %s (since I %d): max %s mean %s" % (i, t, s, mx, np.round(mean, 4).tolist()))

# I pictures: are the differences confined to 8x8 blocks (the IDCT's unit), and how many blocks?
for i, t, s, mx, mean, frac in rows:
    if t != "I" or max(mx) == 0:
        continue
    a, b = pl(o, i), pl(r, i)
    dy = np.abs(a[0] - b[0]) > 0
    blocks = dy.reshape(H // 8, 8, W // 8, 8).any(axis=(1, 3))
    print("I p%03d: Y blocks with a difference %d of %d; max %d; samples differing inside them %.3f"
          % (i, int(blocks.sum()), blocks.size, mx[0], dy.sum() / max(1, blocks.sum() * 64)))
    break
```

The review round's runs (2026-10-01), from `redotcom` with `L=../../logs/plat19a` unless marked:

```sh
"$PYTHON" logs/plat19a/mk2seq.py                       # from the worktree root, in logs/plat19a: es/twoseq.m2v
npx tsx tools/fmv-spike.ts decode $L/libmpeg2-51c660b5.wasm $L/es/twoseq.m2v $L/ours/twoseq_old.yuv --check   # the first build (kept in scratch): 49 of 51, FAIL
npx tsx tools/fmv-spike.ts decode packages/fmv/wasm/out/libmpeg2.wasm $L/es/twoseq.m2v $L/ours/twoseq.yuv --check   # rebuilt: 51, PASS
for s in sony448 intro2_330 menuloop_330; do
  npx tsx tools/fmv-spike.ts decode packages/fmv/wasm/out/libmpeg2.wasm $L/es/$s.m2v $L/ours2/$s.yuv --records $L/ours2/$s.json --check
done
for i in int simple simplemmx xvid faani simpleauto; do   # in logs/plat19a, then compare from SOCOM Legacy
  ffmpeg -v error -threads 1 -idct $i -f mpegvideo -i es/menuloop_330.m2v -threads 1 -fps_mode passthrough -f rawvideo -pix_fmt yuv420p alt/menuloop_330_$i.yuv
done
npx tsx tools/fmv-spike.ts compare $L/ours2/menuloop_330.yuv $L/alt/menuloop_330_$i.yuv --count 300
```

`logs/plat19a/mk2seq.py`:

```python
"""Two sequences in one stream (review finding 3): the first 20 coded pictures of MENULOOP's ES ending in a
sequence_end_code, then the first 31 coded pictures of INTRO_2's ES with none. Each cut ends where coded picture n
(or the sequence / GOP header before it) begins, so every kept picture is whole."""
import re


def cut(es, n):
    """es up to the first non-slice start code after coded picture n-1's first slice."""
    pics = [m.start() for m in re.finditer(b"\x00\x00\x01\x00", es)]
    i = pics[n - 1] + 4
    codes = [(m.start(), es[m.start() + 3]) for m in re.finditer(b"\x00\x00\x01", es) if m.start() >= i and m.start() + 3 < len(es)]
    first_slice = next(k for k, (o, c) in enumerate(codes) if 0x01 <= c <= 0xAF)
    end = next((o for o, c in codes[first_slice:] if not 0x01 <= c <= 0xAF), None)
    return es if end is None else es[:end], pics[n] if n < len(pics) else None


a, na = cut(open("es/menuloop_330.m2v", "rb").read(), 20)
b, nb = cut(open("es/intro2_330.m2v", "rb").read(), 31)
a += b"\x00\x00\x01\xb7"
open("es/twoseq.m2v", "wb").write(a + b)
print("A", len(a), "(picture 20 at", na, ")", a[-8:].hex(), "| B", len(b), "(picture 31 at", nb, ")", b[-4:].hex(),
      "|", len(re.findall(b"\x00\x00\x01\x00", a + b)), "picture start codes")
```

### 7.6 What PLAT-19b inherits, and what is not settled

**Inherits (settled):**
- **The decoder:** libmpeg2 0.5.1 as `packages/fmv/wasm/build.sh` builds it (pinned sha256, generic C, a standalone
  `.wasm` with one import), driven through `glue.c`'s API (§7.1): feed bytes, take pictures in display order as three
  planes with index and type, flush at the end of the stream, close. It is frame-exact against libavcodec in count and
  order (§7.8).
- **The epsilon:** per sample <= 3, per picture mean abs <= 0.015, every plane (§7.1, §7.9). Not bit-identical: the
  two decoders' samples differ (attributed to their IDCTs, §7.9; no libavcodec IDCT reproduces libmpeg2's), so
  PLAT-19b's per-picture check against libavcodec's decode of the player's disc compares within the epsilon, not by
  hash.
- **The conversion:** the IPU's -- `ipuCsc` in `tools/fmvPlanes.ts`, the integers of §7.4 -- not BT.601 from a
  library, not a float matrix; chroma nearest, not filtered. [Corrected 2026-10-02, PLAT-19b: `ipuCsc` now lives in
  `packages/fmv/src/ipuCsc.ts`, with the RGBA form the page uses; `tools/fmvPlanes.ts` imports it (research 120 §5).]
- **The size:** 85,001 B raw / 23,687 B gzip -9 at -O3 (58,817 / 19,080 at -Oz, the same output and, here, about the
  same speed, §7.10). The extra-black-block check and the per-plane compare are written and tested (§7.2).

**Not settled, and what settles it:**
- The epsilon past INTRO_2's first 300 pictures: its drift is reset by each I picture (§7.9), but longer GOPs or busier
  scenes later in the movie could reach 4. PLAT-19b's full-movie acceptance measures all 3,836 and 3,732 pictures. [Corrected 2026-10-02: said 3,790 for MENULOOP; PLAT-18's demuxer counts 3732 (research 109).] [Corrected 2026-10-02, PLAT-19b: measured -- it reaches 5 and a mean of 0.0209; §7.11.]
- FFmpeg 8.1 against the recomp's 7.1 on `mpeg2video`: one 7.1 decode of the cuts (§7.3). §7.9 shows libavcodec's own
  IDCT choice moves its output as much as libmpeg2 does, so the version matters only if 7.1's default IDCT differs.
- The decode cost in a browser and on the owner's machine (PLAT-19c); §7.10's Node figures are one shared host.
- `pcsx2_mission_a/s02`, which no SONY448 picture reproduces (§7.4): a capture from a run with the display's
  deinterlacing named, or the recomp's `PS2X_MPEG_TRACE` with the capture time.
- The stretch model (§7.4) is fitted, not read from PCSX2's presenter; it orders the two conversions the same way
  with either centre convention, which is all item 3 needs.

[Corrected 2026-10-01: "Not settled" listed items (1), (2), (4) and the decode time as owed on the source; they are
§7.8-§7.10.]

**The third-party notice** of whatever ships (libmpeg2's GPL text and source offer) is PLAT-19b's, with the `.wasm`;
the spike commits upstream's `COPYING` beside its build script and nothing else of the source.

### 7.7 Placeholders and readings

None. `ipuCsc`'s constants are PCSX2's, cited; the spike names no stand-in value.

### 7.8 Item 1: the picture sequence

From `redotcom`, the lock FREE, after `build.sh` (`L=../../logs/plat19a`; the streams and `ref/` of §7.3):

```sh
for s in sony448 intro2_330 menuloop_330; do
  npx tsx tools/fmv-spike.ts decode packages/fmv/wasm/out/libmpeg2.wasm $L/es/$s.m2v $L/ours/$s.yuv --records $L/ours/$s.json
  npx tsx tools/fmv-spike.ts compare $L/ours/$s.yuv $L/ref/$s.yuv --count 300     # SONY448: no --count (all 310)
done
```

| stream | wasm pictures | libavcodec | types (display order) | sequence end | invalid | compared | shifted | extra black |
|---|---|---|---|---|---|---|---|---|
| SONY448 | 310 | 310 | 310 I | in the stream | 0 | 310 | 0 | 0 |
| INTRO_2 (330 cut) | 330 | 330 | 22 I, 89 P, 219 B | fed by the flush | 0 | 300 | 0 | 0 |
| MENULOOP (330 cut) | 330 | 330 | 330 I | fed by the flush | 0 | 300 | 0 | 0 |

The coding-type sequence of each decode, in display order, equals ffprobe's (`ffprobe -v error -threads 1 -f mpegvideo
-show_entries frame=pict_type -of csv=p=0 es/$s.m2v`, against the `--records` types: equal on 310, 330 and 330).
**What pins the order.** [Corrected 2026-10-01 after review: this paragraph said "'Shifted' ... -- 0, so no picture is
dropped, repeated or reordered", which claims more than that measure shows.]
- **"Shifted"** (`compare`) counts the pictures strictly nearer (sum of |d|) to the reference's picture before or after
  than to the one at their own index. It cannot see a picture that ties with its neighbour: in libavcodec's SONY448 150
  of the 309 adjacent pairs are byte-identical (the static cards and black runs), in MENULOOP's first 300, 53 of 299
  are identical and 118 within 3. A dropped picture paired with a repeated one inside such a run passes it. Its 0 is
  evidence only where neighbours differ -- INTRO_2's first 300 have no identical or within-3 neighbours.
- **INTRO_2: the temporal references.** The decode's 330 pictures fall in 22 runs of 15 whose temporal references are
  0, 1, ..., 14 in display order (from the `--records`), with types equal to ffprobe's in display order. A drop, repeat
  or swap inside a GOP would break a run; together with the count and the 0 shifted on distinct neighbours, this pins
  INTRO_2's order.
- **SONY448 and MENULOOP: all intra, temporal reference 0 on every picture** -- the types and the references say
  nothing about order there. The check that does: `fmv-spike.ts decode --check` reads every picture start code of the
  elementary stream (`tools/fmvStream.ts` `pictureHeaders`), feeds the decoder one coded picture per feed tagged with
  its coding index (`mpeg2_tag_picture` through `s2u_fmv_feed_tagged`), and requires the tags displayed to be exactly
  the standard's display order of those pictures (`displayOrder`; for all-intra, 0, 1, ..., n-1), each with its own
  header's type and temporal reference: every coded picture in, exactly one out, in order, whatever the samples.
  Run on the three streams with the rebuilt wasm (the §7.8 loop with `--check`; the per-picture feeds give output
  byte-identical to the 4,096-byte feeds):

  | stream | picture start codes | displayed | tags in display order | type and temporal reference per picture |
  |---|---|---|---|---|
  | SONY448 | 310 (310 I) | 310 | 0, 1, ..., 309: PASS | equal |
  | INTRO_2 (330 cut) | 330 (22 I, 89 P, 219 B) | 330 | the standard's order: PASS | equal |
  | MENULOOP (330 cut) | 330 (330 I) | 330 | 0, 1, ..., 329: PASS | equal |

  On the all-intra streams this is what proves count and order: each coded picture is displayed exactly once, at the
  position of its own start code. libavcodec's 310 / 330 / 330 match the same counts, so the compared pictures pair
  index for index.

SONY448's 310 is also the recomp's `PS2X_MPEG_TRACE` count (PC research 09 L76-80). SONY448 and MENULOOP's first 330 pictures are **intra-only**; INTRO_2 has P and B pictures. The black check
(`extraBlackBlocks`, §7.2) found no 16x16 block black in libmpeg2's picture and not black in libavcodec's.

### 7.9 Item 2: the samples, and where they differ

`fmv-spike.ts compare` (above) and `attrib.py` (§7.5):

| stream | hash-equal pictures | max abs d Y / Cb / Cr | mean abs d over all, Y / Cb / Cr | worst picture's mean, Y / Cb / Cr |
|---|---|---|---|---|
| SONY448 | 42/310 | 1 / 1 / 1 | 0.00023 / 0.00061 / 0.00068 | 0.00044 / 0.00144 / 0.00204 |
| INTRO_2 (first 300) | 1/300 | 3 / 2 / 2 | 0.00534 / 0.00852 / 0.00940 | 0.01095 / 0.01352 / 0.01452 |
| MENULOOP (first 300) | 0/300 | 1 / 1 / 1 | 0.00178 / 0.00332 / 0.00316 | 0.0037 / 0.00738 / 0.00752 |

**Where it comes from: the IDCT -- a strong attribution, not a proof.** [Corrected 2026-10-01 after review: said "the
IDCT. Shown three ways", and offered "confined to a few 8x8 blocks" as evidence, which does not discriminate: every
sample lies in some 8x8 block. Nothing here swaps libmpeg2's IDCT out.] What is shown:
- **Intra pictures differ by at most 1**, on every stream. On an I picture only the coefficient decode, the inverse
  quantisation (with its mismatch control) and the IDCT run; the first two are exact integer procedures the standard
  defines, the IDCT is the one stage it leaves to an accuracy bound. The differing samples are rare (SONY448 picture
  11: 6 of 4,480 Y 8x8 blocks hold any; MENULOOP picture 0: 229; INTRO_2 picture 17: 405). libmpeg2's generic IDCT is its own fixed-point one (`idct.c`: `W1..W7` =
  2048 * sqrt(2) * cos(k * pi / 16), `idct_row` / `idct_col`); libavcodec's default is its "simple" IDCT. Both are IEEE
  1180-class approximations, which allow exactly this: a rounding difference of 1 in rare samples.
- **Only predicted pictures exceed 1** (INTRO_2's P and B, at most 3; `attrib.py`'s Y histogram over 300 pictures:
  458,430 samples off by 1, 281 by 2, 5 by 3). A +-1 in a reference picture is copied and averaged forward by motion
  compensation, whose half-pel rounding is the standard's in both decoders. The worst pictures are 9-14 pictures after
  an I (176-181), and every I picture of INTRO_2 is back to <= 1: a difference made at the intra stage, carried by
  prediction, reset by each I.
- **The control: libavcodec against itself with another IDCT.** The §7.3 decode line with `-idct int` and with
  `-idct faani` (into `logs/plat19a/alt/`), compared with libavcodec's default by the same `compare`: MENULOOP max
  1 / 1 / 1 for both (mean Y 0.0090 `int`, 0.0024 `faani`); INTRO_2 max 4 / 3 / 3 (`int`) and 3 / 2 / 3 (`faani`),
  mean Y 0.026 and 0.012. Changing nothing but libavcodec's IDCT moves its output as far as libmpeg2 does, or further;
  libmpeg2 (INTRO_2 mean Y 0.0053) sits inside that spread.

- **Whether one of libavcodec's IDCTs reproduces libmpeg2's intra pictures exactly** -- which would make the
  attribution a proof and give PLAT-19b a bit-exact reference: **none does.** MENULOOP's first 300 (all intra),
  libmpeg2 against libavcodec with each x86 `-idct` choice (§7.3's decode line with `-idct <x>`, into
  `logs/plat19a/alt/`; `simpleauto`, `simplemmx` and the default give the same bytes as `simple`):

  | libavcodec `-idct` | hash-equal pictures | max abs d Y / Cb / Cr | mean abs d Y / Cb / Cr |
  |---|---|---|---|
  | `simple` (= default) | 0/300 | 1 / 1 / 1 | 0.00178 / 0.00332 / 0.00316 |
  | `int` | 0/300 | 1 / 1 / 1 | 0.00823 / 0.00057 / 0.00070 |
  | `xvid` | 0/300 | 1 / 1 / 1 | 0.00956 / 0.00537 / 0.00522 |
  | `faani` (float AAN) | 0/300 | 1 / 1 / 1 | 0.00151 / 0.00025 / 0.00020 |

  None is libmpeg2's arithmetic, so the attribution stays an attribution, and PLAT-19b has no bit-exact libavcodec
  reference: it compares within the epsilon. The nearest is `faani`.

So the epsilon is attributed to the IDCT and bounded: **max 3, per-picture mean <= 0.015** (§7.1). The fail rule's
condition -- a failure that cannot be attributed and bounded -- is not met.

### 7.10 Item 4: size and decode time

`out/build.txt` after `build.sh`: **`libmpeg2.wasm` 85,001 B raw, 23,687 B `gzip -9`** at `-O3`. There is no JS glue:
the module is standalone and the harness instantiates it in a few lines of its own (PLAT-19b's worker can do the same).
`S2U_FMV_OPT=-Oz bash packages/fmv/wasm/build.sh ...`: 58,817 B raw, 19,080 B gzip -9, and its INTRO_2 decode is
byte-identical to the -O3 build's (`cmp`). [Corrected 2026-10-01 after review: gave the first build's 84,777 / 23,583
and 58,599 / 18,974; the glue fix and the tag exports added 224 B raw.]

Decode time in Node v24.13.1, single process, the wasm calls only (`fmv-spike.ts decode`'s figure; the file writes
excluded), on this host while it was shared with other work -- one machine, not the owner's:

| stream | pictures | total | per picture |
|---|---|---|---|
| SONY448 (all I) | 310 | 137-145 ms | 0.44-0.47 ms |
| INTRO_2 330 cut (I, P, B) | 330 | 231-306 ms | 0.70-0.93 ms |
| MENULOOP 330 cut (all I) | 330 | 187-199 ms | 0.57-0.60 ms |
| INTRO_2 330 cut, -Oz build | 330 | 247 ms | 0.75 ms |

The ranges are over the runs made with the rebuilt wasm (4,096-byte feeds and the `--check` per-picture feeds; the
higher INTRO_2 figure is a per-picture-fed run). [Corrected 2026-10-01 after review: the table gave the first build's
runs, 0.40-0.75 ms per picture.] At 30 pictures per second a picture has 33 ms; the decode used about
2 % of it here. Instantiation took 0.1-0.2 ms after the module was compiled. The page's cost -- a worker, the transfer,
the conversion, the texture -- is PLAT-19c's.

### 7.11 The whole movies (PLAT-19b, 2026-10-02): the bound raised to 5 and 0.021

Added by PLAT-19b (research 120 §8, where the method, the commands and the full table are). The page's core -- the
rebuilt wasm, fed by PLAT-18's demuxer from the retail image by range -- against libavcodec's decode of the same file
made at test time, every picture (`tools/test/fmvDecodeDisc.test.ts`):

| movie | pictures | max \|d\| (picture, plane) | worst per-picture mean (picture, plane) | pictures over 3 / 0.015 |
|---|---|---|---|---|
| SONY448 | 310 | 1 (11, Y) | 0.00204 (127, Cr) | 0 |
| INTRO_2 | 3836 | **5 (1284, Cr)** | **0.02089 (2247, Y)** | 168 (15 over 3 per sample, 153 over 0.015 only) |
| MENULOOP | 3732 | 1 (0, Y) | 0.01161 (2471, Cr) | 0 |

**The bound moves, on INTRO_2 only, from 3 / 0.015 to 5 / 0.021** (0.0209 rounded up at the third decimal, as §7.1
rounded 0.0145 to 0.015). The attribution of §7.9 holds on the whole movie: every I picture of INTRO_2 is within 1
(the differences enter at the IDCT and are carried by prediction), the pictures over are B (118) and P (46) save 4 I
pictures over on the mean alone, and libavcodec against itself with another IDCT moves further (`-idct faani`: max 5,
worst mean 0.0398, 1,956 pictures over 3 / 0.015; `-idct int`: max 6, 0.0835, 3,601). PLAT-19b's test holds every
picture to 5 / 0.021.

**The extra-black-block count is not 0 on the whole movies**: 87 INTRO_2 and 9 MENULOOP pictures have a 16x16 block
that converts to all-zero RGB in libmpeg2's decode and not in libavcodec's -- in every one the block's samples are
within 1 of libavcodec's and libavcodec's brightest RGB byte there is 1 (dark stretches and fades). libavcodec's own
`faani` decode against its default flags 84 INTRO_2 and 9 MENULOOP pictures the same way. No block is black in ours
where libavcodec's has content beyond the bound (a lost block, the defect `movie_blocks.py` exists for). §7.8's "0
extra black" held on the first 300 pictures; on the whole movies the differential needs the sample bound beside it
(research 120 §8).
