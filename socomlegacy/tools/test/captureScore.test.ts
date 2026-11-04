import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { blackFrame, decodePng, rgbToRgba, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import {
  CONTROL_MARGIN_READING, letterboxBox, pyFixed, pyRound, resample, score, judge, controlScore, verdict, thumb,
  thumbDistance, titleVerdict, toGrey, toScoreGrid, TITLE_MIN_SCORE, mean32,
} from '../captureScore';
import { manifestJson, parseSteps, runSteps, type FrameDriver } from '../captureSteps';
import { readPng, scoreTitleDir, writeRun } from '../captureRun';
import { desktopRoot } from '../desktop';

/**
 * The capture harness (PLAT-30; web research 108). Every pinned number and hash below was printed by the code the
 * harness reproduces -- `tools_py/parity/compare.py` `score`, PIL 12.1.1 `Image.resize`, numpy 2.5.3, `drive.thumb`,
 * `gate.score_title` and `json.dump(indent=1)` -- on the synthetic frames `mk` builds (research 108 §2.3 has the
 * script). No game data: the frames are arithmetic; the one committed reference read is the PC project's own
 * `scripts/parity/ref_main_menu_ours.png` (gate.TITLE_REF).
 */

// The desktop checkout (SOCOM_PC_ROOT, else the ref/desktop submodule); with neither, what reads it skips.
const REPO = desktopRoot('scripts/parity/title_menu.txt');
const TITLE_REF = REPO ? join(REPO, 'scripts', 'parity', 'ref_main_menu_ours.png') : '';

function mk(w: number, h: number, fn: (x: number, y: number, c: number) => number): Rgb {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) data[(y * w + x) * 3 + c] = fn(x, y, c) & 255;
  return { width: w, height: h, data };
}
const sha = (b: Uint8Array | Float32Array): string => createHash('sha256').update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const G = mk(640, 480, (x, y, c) => x * 7 + y * 13 + c * 50 + ((x * y) % 31));
const O = mk(640, 448, (x, y, c) => x * 5 + y * 11 + c * 80 + ((x ^ y) % 17));
/** O with a white 80x60 patch at (100, 100). */
const O2: Rgb = (() => {
  const d = O.data.slice();
  for (let y = 100; y < 160; y++) for (let x = 100; x < 180; x++) d.fill(255, (y * 640 + x) * 3, (y * 640 + x) * 3 + 3);
  return { ...O, data: d };
})();
/** A dark frame: one dim row of dotted text on black (research 98 §1's opening cards, in shape). */
const DARK = mk(640, 448, (x, y, c) => (x > 200 && x < 440 && y > 200 && y < 216 && (Math.floor(x / 3) + y) % 4 === 0 ? 40 + c * 30 : 0));
const PANEL = mk(640, 448, (x, y, c) => (x >= 100 && x < 500 && y >= 50 && y < 300 ? (x * 3 + y + c * 60) % 256 : 0));

describe('the PNG reader', () => {
  it('reads back what tools/png.ts writes (RGBA, alpha dropped as PIL convert("RGB") drops it)', () => {
    expect(decodePng(encodePng(640, 448, rgbToRgba(O)))).toEqual(O);
  }, 30_000);                                              // a full frame compared deeply: 0.9 s here, 3.8 s on CI's runner
  it('reads grey, RGB and palette PNGs and every filter', () => {
    const png = (type: number, ch: number, rows: number[][], plte?: number[]): Uint8Array => {
      const chunk = (kind: string, body: Uint8Array): Uint8Array => {
        const out = new Uint8Array(12 + body.length);
        new DataView(out.buffer).setUint32(0, body.length);
        for (let i = 0; i < 4; i++) out[4 + i] = kind.charCodeAt(i);
        out.set(body, 8);
        return out;                                        // the reader checks no CRC
      };
      const ihdr = new Uint8Array(13);
      new DataView(ihdr.buffer).setUint32(0, (rows[0]!.length - 1) / ch);
      new DataView(ihdr.buffer).setUint32(4, rows.length);
      ihdr.set([8, type, 0, 0, 0], 8);
      const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
        ...(plte ? [chunk('PLTE', Uint8Array.from(plte))] : []), chunk('IDAT', deflateSync(Uint8Array.from(rows.flat()))),
        chunk('IEND', new Uint8Array(0))];
      return Uint8Array.from(parts.flatMap((p) => [...p]));
    };
    // grey, 2x2: filter 0 then filter 2 (up): row 1 = row 0 + raw
    expect(decodePng(png(0, 1, [[0, 10, 20], [2, 5, 5]])).data).toEqual(Uint8Array.from([10, 10, 10, 20, 20, 20, 15, 15, 15, 25, 25, 25]));
    // RGB, 2x1, filter 1 (sub)
    expect(decodePng(png(2, 3, [[1, 1, 2, 3, 1, 1, 1]])).data).toEqual(Uint8Array.from([1, 2, 3, 2, 3, 4]));
    // palette, filter 4 (Paeth) on row 1, filter 3 (average) on row 2
    const pal = [0, 0, 0, 255, 0, 0, 0, 255, 0];
    expect(decodePng(png(3, 1, [[0, 1, 2], [4, 1, 0], [3, 0, 0]], pal)).data)
      .toEqual(Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0]));
  });
});

describe('PIL\'s resampler, byte for byte', () => {
  it('BOX to 320x224 from 640x480 and 640x448 (compare._arr)', () => {
    expect(sha(toScoreGrid(G))).toBe('32ebdc7f87c6621a762f787b483c018505cbede619d6593aa77c3e79a691f0cf');
    expect(sha(toScoreGrid(O))).toBe('113c736edc27a5d08f1495e5f5574d62e74cbf920f5e3e6b6332709994ee4e32');
  });
  it('BOX with the 4:3 letterbox box (21.33..618.67 of a 640x448 PCSX2 window: KNOWN [online-7pct])', () => {
    const box = letterboxBox(640, 448);
    expect(box[0]).toBeCloseTo(21.333333, 5);
    expect(box[2]).toBeCloseTo(618.666667, 5);
    expect(sha(toScoreGrid(O, box))).toBe('311313d31e4497cd3d3e9b7c8ff8ccd69067ed7f8275d2c0838a1885a9150679');
  });
  it('the same size and no box is the image itself; 2x BOX is (a + b + 1) >> 1 twice', () => {
    expect(resample({ width: 4, height: 2, channels: 1, data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) }, 4, 2).data)
      .toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    const r = resample({ width: 2, height: 2, channels: 1, data: Uint8Array.from([0, 1, 1, 1]) }, 1, 1);
    expect(r.data[0]).toBe((((0 + 1 + 1) >> 1) + ((1 + 1 + 1) >> 1) + 1) >> 1);
  });
  it('convert("L") and drive.thumb (crop to content, BICUBIC 160x112), and their distance', () => {
    expect(sha(toGrey(O).data)).toBe('33699b0abdcb060ad61979f6ecb85e8536c09138fcff6b667c7d8297e6fd89d9');
    expect(sha(thumb(O))).toBe('bb02c84c432205d453dbebdd8d61b1a21c7e6bd78ebdd4d3e196f6fbe1424d18');
    expect(sha(thumb(PANEL))).toBe('86a799be05db21443f2700927babe12d29a766b8b94e072aa4412a1549edf486');
    expect(thumbDistance(thumb(O), thumb(PANEL))).toBe(43.18605041503906);
  });
});

describe('numpy\'s float32 mean, bit for bit (research 108 §2.2)', () => {
  // An LCG's bytes over 255 in float32 (the shape of compare.score's difference array), numpy 2.5.3's `a[:m].mean()`
  // printed for each length: s = (s*1103515245 + 12345) & 0xffffffff from s = 2, byte (s >> 16) % 256.
  const lcg = (n: number): Float32Array => {
    const a = new Float32Array(n);
    let s = 2;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a[i] = Math.fround(((s >>> 16) % 256) / 255); }
    return a;
  };
  const A = lcg(320 * 224 * 3);
  it('the pairwise order: neither a double sum nor a sequential float32 sum gives these', () => {
    const numpy: readonly [number, number][] = [[5, 0.6109803915023804], [127, 0.49754512310028076], [1003, 0.5054522752761841],
      [100003, 0.4996601641178131], [215040, 0.4996739625930786]];
    for (const [m, v] of numpy) expect([m, mean32(A.slice(0, m))]).toEqual([m, v]);
    // what the other orders print, so the pins above tell them apart (127: both differ; 215040: both differ)
    const dbl = (b: Float32Array): number => { let d = 0; for (const v of b) d += v; return Math.fround(d / b.length); };
    const seq = (b: Float32Array): number => { let q = 0; for (const v of b) q = Math.fround(q + v); return Math.fround(q / b.length); };
    expect([dbl(A.slice(0, 127)), seq(A.slice(0, 127))]).toEqual([0.49754518270492554, 0.4975450336933136]);
    expect([dbl(A), seq(A)]).toEqual([0.4996739327907562, 0.49967479705810547]);
  });
});

describe('compare.score to the last printed digit', () => {
  it('Python\'s round: the exact binary value, an exact tie to the even digit', () => {
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(2.675, 2)).toBe(2.67);           // 2.67499999... in binary
    expect(pyRound(97.25, 1)).toBe(97.2);
    expect(pyRound(98.75, 1)).toBe(98.8);
    expect(pyFixed(90, 1)).toBe('90.0');
  });
  it('scores the synthetic pairs as compare.py does', () => {
    expect(score(G, O)).toEqual({ score: 85.0, mad: 0.2991, block: 0.0 });
    expect(score(O, O2)).toEqual({ score: 98.5, mad: 0.0084, block: 0.0214 });
    expect(score(DARK, blackFrame(640, 448))).toEqual({ score: 100.0, mad: 0.0009, block: 0.0 });
    expect(score(DARK, DARK)).toEqual({ score: 100.0, mad: 0.0, block: 0.0 });
  });
  it.skipIf(!existsSync(TITLE_REF))('planted negative control: a black frame scores under 90 against the lit main-menu reference', () => {
    const ref = readPng(TITLE_REF);
    const s = score(ref, blackFrame(ref.width, ref.height));
    expect(s).toEqual({ score: 60.2, mad: 0.1423, block: 0.6536 });   // compare.py on the same pair
    expect(s.score).toBeLessThan(TITLE_MIN_SCORE);
  });
});

describe('the black control (research 98 §1-2\'s trap)', () => {
  it('a dark golden scores 100 against black: the harness refuses to call that matched', () => {
    expect(controlScore(DARK)).toBe(100.0);
    const j = judge(DARK, DARK);
    expect(j.score).toBe(100.0);
    expect(j.matched).toBe(false);
    expect(j.why).toMatch(/cannot tell this frame from black/);
  });
  it('a lit golden matched by its frame is matched; the margin is counted in tenths', () => {
    const j = judge(PANEL, PANEL);
    expect(j.score).toBe(100.0);
    expect(j.control).toBeLessThan(100 - CONTROL_MARGIN_READING);
    expect(j.matched).toBe(true);
    expect(verdict(95.0, 90.0).matched).toBe(true);            // exactly the margin over the control
    expect(verdict(95.0, 90.1).matched).toBe(false);
    expect(verdict(89.9, 10).matched).toBe(false);              // under the gate's bar
  });
});

describe('the masked-background rule', () => {
  // A movie background region (the dialog's chrome is outside it): x 64..576, y 32..224 of the 640x448 frame.
  const MASK = [[64, 32, 576, 224]] as const;
  const inside = mk(640, 448, (x, y, c) => (x >= 64 && x < 576 && y >= 32 && y < 224 ? 0 : (x + y * 3 + c * 40) % 256));
  const golden = mk(640, 448, (x, y, c) => (x >= 64 && x < 576 && y >= 32 && y < 224 ? (x * y + c) % 256 : (x + y * 3 + c * 40) % 256));
  const outside = mk(640, 448, (x, y, c) => (y >= 400 ? 255 - ((x + y * 3 + c * 40) % 256) : golden.data[(y * 640 + x) * 3 + c]!));
  it('a frame differing only inside the mask scores as identical', () => {
    expect(score(golden, inside)).not.toEqual({ score: 100.0, mad: 0.0, block: 0.0 });   // unmasked, it differs
    expect(score(golden, inside, { mask: MASK })).toEqual({ score: 100.0, mad: 0.0, block: 0.0 });
  });
  it('the mask is rounded outward onto the grid: odd frame edges still leave nothing inside it counted', () => {
    // x 65..575, y 33..223: the grid's column 32 and 287 and rows 16 and 111 each hold frame pixels inside the mask;
    // rounded inward they would be left uncovered and the difference there would be counted (review finding 1).
    const ODD = [[65, 33, 575, 223]] as const;
    const inOdd = (x: number, y: number): boolean => x >= 65 && x < 575 && y >= 33 && y < 223;
    const base = (x: number, y: number, c: number): number => (x + y * 3 + c * 40) % 256;
    const oddGolden = mk(640, 448, (x, y, c) => (inOdd(x, y) ? (x * y + c) % 256 : base(x, y, c)));
    const oddInside = mk(640, 448, (x, y, c) => (inOdd(x, y) ? 0 : base(x, y, c)));
    expect(score(oddGolden, oddInside)).not.toEqual({ score: 100.0, mad: 0.0, block: 0.0 });
    expect(score(oddGolden, oddInside, { mask: ODD })).toEqual({ score: 100.0, mad: 0.0, block: 0.0 });
  });
  it('one differing outside it does not', () => {
    const s = score(golden, outside, { mask: MASK });
    expect(s.score).toBeLessThan(100);
    expect(s.block).toBeGreaterThan(0);
  });

  // The review's case (block-aligned): a 320x224 dialog centred in the frame, x 160..480, y 128..352 (grid blocks
  // 5..15 x 4..11), the four bands round it masked (75% of the frame). The golden's dialog is flat grey 200 over a
  // lit background; ours draws the background black and the dialog's left half at grey 120 (80/255 off: every
  // block of that half over the threshold).
  const DIALOG = [160, 128, 480, 352] as const;
  const inDialog = (x: number, y: number): boolean => x >= DIALOG[0] && x < DIALOG[2] && y >= DIALOG[1] && y < DIALOG[3];
  const AROUND = [[0, 0, 640, 128], [0, 352, 640, 448], [0, 128, 160, 352], [480, 128, 640, 352]] as const;
  const dlgGolden = mk(640, 448, (x, y, c) => (inDialog(x, y) ? 200 : (x * 3 + y * 5 + c * 70) % 256));
  const dlgHalf = mk(640, 448, (x, y) => (inDialog(x, y) ? (x < 320 ? 120 : 200) : 0));
  it('the mask leaves the score of what is outside it: the masked area is not counted as agreeing', () => {
    // mad: half the dialog's pixels 80/255 off, over the dialog's pixels only; block: 35 of the dialog's 70 blocks
    expect(score(dlgGolden, dlgHalf, { mask: AROUND })).toEqual({ score: 67.2, mad: 0.1569, block: 0.5 });
    const j = judge(dlgGolden, dlgHalf, { mask: AROUND });
    expect(j.control).toBe(10.8);                                   // the dialog's 200 against black: mad 0.7843, block 1
    expect(j.matched).toBe(false);
    // the diluted reading (the masked 75% counted as agreeing black) was 91.8, control 77.7: matched
    expect(j.score).toBeLessThan(TITLE_MIN_SCORE);
  });
  it('a block the mask cuts is judged on its uncovered pixels, not diluted by shared black', () => {
    // The mask leaves only the top-left 8x8 grid pixels of one block (640-frame 0..16 x 0..16) uncovered; there
    // ours differs from the golden by 30/255 -- under 0.08 diluted over the block's 256 pixels, over it on its 64.
    const g = mk(640, 448, () => 100), o = mk(640, 448, (x, y) => (x < 16 && y < 16 ? 130 : 100));
    const mask = [[16, 0, 640, 448], [0, 16, 16, 448]] as const;
    expect(score(g, o, { mask })).toEqual({ score: 44.1, mad: 0.1176, block: 1.0 });
  });
  it('a mask over the whole frame leaves nothing to score: refused', () => {
    expect(() => score(dlgGolden, dlgHalf, { mask: [[0, 0, 640, 448]] })).toThrow(/nothing left to score/);
  });
});

describe('gate.score_title, line for line', () => {
  it('reproduces the gate\'s verdict and detail', () => {
    const a = [...Array.from({ length: 16 }, () => 95.0), 89.9, 93.2, 99.4, 84.0, 60.5].map((s, i) => [`s${String(i).padStart(2, '0')}_none.png`, s] as const);
    expect(titleVerdict(a)).toEqual({ ok: false, detail: '18/21 menu captures >= 90.0 (window s00..s18: 18/19); menu capture(s) under 90.0: s16; scores: '
      + 's00=95.0 s01=95.0 s02=95.0 s03=95.0 s04=95.0 s05=95.0 s06=95.0 s07=95.0 s08=95.0 s09=95.0 s10=95.0 s11=95.0 s12=95.0 s13=95.0 s14=95.0 s15=95.0 s16=89.9 s17=93.2 s18=99.4 s19=84.0 s20=60.5' });
    const b = [...[...Array.from({ length: 14 }, () => 95.0), 92.0, 91.0].map((s, i) => [`s${String(i).padStart(2, '0')}_none.png`, s] as const), ['s19_none.png', 90.0] as const];
    expect(titleVerdict(b)).toEqual({ ok: true, detail: '17/17 menu captures >= 90.0 (window s00..s18: 16/16); attract not reached by s19; scores: '
      + 's00=95.0 s01=95.0 s02=95.0 s03=95.0 s04=95.0 s05=95.0 s06=95.0 s07=95.0 s08=95.0 s09=95.0 s10=95.0 s11=95.0 s12=95.0 s13=95.0 s14=92.0 s15=91.0 s19=90.0' });
  });
});

describe('the step-script runner and the run directory', () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it.skipIf(!REPO)('parses drive.py\'s vocabulary (the desktop title script: SOCOM_PC_ROOT or ref/desktop)', () => {
    const steps = parseSteps(readFileSync(join(REPO!, 'scripts', 'parity', 'title_menu.txt'), 'utf8'));
    expect(steps).toHaveLength(23);
    expect(steps[0]).toEqual({ mode: 'untilref(scripts/parity/ref_main_menu_ours.png)', delay: 1.0, buttons: ['CROSS'] });
    expect(steps[1]).toEqual({ mode: 'wait', delay: 6.0, buttons: [] });
    expect(parseSteps('next+0.5:cross+up  # a comment\n\nstable+1:NONE')).toEqual([
      { mode: 'next', delay: 0.5, buttons: ['CROSS', 'UP'] }, { mode: 'stable', delay: 1, buttons: [] }]);
  });

  it('writes manifest.json as json.dump(indent=1) does', () => {
    expect(manifestJson([
      { step: 0, label: 's00_none', t: 22.0, stable: true, waited: 0.0, buttons: [] },
      { step: 1, label: 's01_CROSS+UP', t: 28.3, stable: false, waited: 40.1, buttons: ['CROSS', 'UP'] },
    ])).toBe('[\n {\n  "step": 0,\n  "label": "s00_none",\n  "t": 22.0,\n  "stable": true,\n  "waited": 0.0,\n  "buttons": []\n },\n'
      + ' {\n  "step": 1,\n  "label": "s01_CROSS+UP",\n  "t": 28.3,\n  "stable": false,\n  "waited": 40.1,\n  "buttons": [\n   "CROSS",\n   "UP"\n  ]\n }\n]');
  });

  it('drives a recorded page: settles, presses, captures before each press; the gate\'s re-score reads the directory', async () => {
    // The "page": PANEL until CROSS is pressed, then O (a new screen), on a virtual clock.
    let t = 0, screen: Rgb = PANEL;
    const saved = new Map<string, Rgb>(), pressed: string[] = [];
    const d: FrameDriver = {
      grab: async () => screen,
      press: async (b) => { pressed.push(b); if (b === 'CROSS') screen = O; },
      now: () => t,
      sleep: async (s) => { t += s; },
      save: async (n, img) => { saved.set(n, img); },
      loadRef: async () => O,
    };
    const manifest = await runSteps(parseSteps('stable+0.5:CROSS\nnext+0.5:NONE\nwait+1.0:NONE'), d, { tail: 1 });
    expect(pressed).toEqual(['CROSS']);
    expect(manifest.map((m) => [m.label, m.stable, m.buttons])).toEqual([['s00_CROSS', true, ['CROSS']], ['s01_none', true, []], ['s02_none', true, []]]);
    expect(saved.get('s00_CROSS.png')).toBe(PANEL);               // captured before the press
    expect(saved.get('s01_none.png')).toBe(O);
    expect([...saved.keys()].filter((n) => /^w00_/.test(n)).length).toBeGreaterThan(0);
    expect(saved.has('final.png')).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'capture-run-'));
    dirs.push(dir);
    writeRun(dir, saved, manifest);
    expect(readdirSync(dir)).toContain('manifest.json');
    expect(readPng(join(dir, 's01_none.png'))).toEqual(O);
    // gate.score_title over it, against O as the reference: s00 is the other screen, and three are too few
    const r = scoreTitleDir(dir, join(dir, 's01_none.png'));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/^2\/3 menu captures >= 90\.0 \(window s00\.\.s18: 2\/3\); menu capture\(s\) under 90\.0: s00; only 3 menu-window captures, need 16; scores: s00=\d+\.\d s01=100\.0 s02=100\.0$/);
    // Real work on full 640x448 frames (PNG writes, reads and the gate's scoring): 1.2 s on the dev host, 4.4 to
    // 6.5 s on CI's two-core runner, where the 5 s default failed two runs of three (2026-10-02).
  }, 30_000);
});
