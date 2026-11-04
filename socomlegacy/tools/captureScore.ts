import type { Rgb } from './captureImage';
import { blackFrame } from './captureImage';

/**
 * The capture harness's scorer (PLAT-30; web research 108): `tools_py/parity/compare.py` `score` (L19-27) as the title
 * gate calls it (`tools_py/parity/gate.py` `_score_value` L189-197, `score_title` L200-221), reproduced to the last
 * printed digit, plus the two things the gate does not have -- the black control and the masked-background rule.
 *
 * compare.score: both frames `convert("RGB")`, BOX-resized to 320x224 (PIL's two-pass fixed-point resampler, `resample`
 * below), divided by 255 in float32; `mad` the float32 mean of |golden - ours| (numpy's pairwise sum, `pairwiseSum32`);
 * `block` the share of the 20x14 16-pixel blocks whose float32 mean colour differs by more than 0.08 averaged over the
 * channels; `score = round(100 * (1 - 0.5*mad - 0.5*block), 1)` clamped to 0..100, `mad` and `block` rounded to 4
 * places by Python's `round` (`pyRound`). Every float32 step is the one numpy takes (research 108 §2.2 measured the
 * reduction orders against numpy 2.5.3 bit for bit): the whole-frame mean is one pairwise sum over the flattened
 * (row, column, channel) array, a block's mean a sequential sum in row-then-column order, the channel mean of the
 * block difference a sequential sum of three.
 */

/** compare.SIZE: the grid every score is taken on (compare.py L12). */
export const SCORE_SIZE = { width: 320, height: 224 } as const;
/** compare.score's `block_thresh` default (compare.py L19). */
export const BLOCK_THRESH = 0.08;
/** gate.TITLE_MIN_SCORE (gate.py L105): a capture at or over it matched the main-menu reference. */
export const TITLE_MIN_SCORE = 90.0;
/** gate.TITLE_MENU_WINDOW (gate.py L106): s00..s18 are the menu on every clean run; s19.. the attract sequence. */
export const TITLE_MENU_WINDOW = 19;
/** gate.TITLE_MIN_MATCHES (gate.py L107): at least this many menu-window captures must exist. */
export const TITLE_MIN_MATCHES = 16;
/** The frame the game presents (drive.py `FRAME_W, FRAME_H`; the page's PS2 target, `viewer/src/accuracy.ts` PS2_FRAME). */
export const FRAME = { width: 640, height: 448 } as const;

/**
 * CONTROL_MARGIN_READING: how far over its black control a score must sit before the harness calls the frame matched
 * (research 108 §4). Chosen from a measurement, not read from a source: on research 98 §1's dark opening cards the
 * gate's whole-frame score put the matched picture 0.1-2.7 points over an all-black picture (100.0 against 97.3-99.9)
 * -- those must be refused -- while the frames research 98 settled by its text-box measure sit 10.7-17.9 over black,
 * and the title gate's menu captures 15+ over theirs (research 108 §4's table). Any margin in (2.7, 10.7) separates
 * that record; 5.0 is the round number inside it.
 */
export const CONTROL_MARGIN_READING = 5.0;

// ---------------------------------------------------------------------------------------------------------------
// Python's round(x, n): the double's exact decimal value rounded to n places, an exact tie to the even digit.

/** Python 3's `round(x, ndigits)` on a double (correctly rounded, ties to even), back as the nearest double. */
export function pyRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const neg = x < 0;
  const exact = Math.abs(x).toFixed(100);                 // the double's exact value: <= 100 fractional digits here
  const [whole, frac] = exact.split('.') as [string, string];
  const keep = frac.slice(0, ndigits), rest = frac.slice(ndigits);
  let n = BigInt(whole + keep);
  const half = '5'.padEnd(rest.length, '0');
  if (rest > half || (rest === half && (n & 1n) === 1n)) n += 1n;
  const digits = n.toString().padStart(ndigits + 1, '0');
  const text = ndigits > 0 ? `${digits.slice(0, -ndigits)}.${digits.slice(-ndigits)}` : digits;
  const v = Number(text);
  return neg ? -v : v;
}

/** Python's `'%.1f' % x` and friends: the double's exact value rounded half-even to `digits` places, as text. */
export function pyFixed(x: number, digits: number): string {
  const r = pyRound(x, digits);
  return r.toFixed(digits);
}

// ---------------------------------------------------------------------------------------------------------------
// PIL's resampler (Pillow src/libImaging/Resample.c, `ImagingResample` for 8-bit images): coefficients in double,
// normalised to 22-bit fixed point, a horizontal pass to an 8-bit image, then a vertical pass.

type Filter = { support: number; fn: (x: number) => number };
const BOX: Filter = { support: 0.5, fn: (x) => (x > -0.5 && x <= 0.5 ? 1 : 0) };
const BICUBIC: Filter = {
  support: 2,
  fn: (x0) => {
    const a = -0.5, x = Math.abs(x0);
    if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
    if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
    return 0;
  },
};
const PRECISION_BITS = 32 - 8 - 2;
const ONE = 2 ** PRECISION_BITS;

/** A grey or RGB 8-bit image of any channel count, as the resampler sees it. */
export interface Plane { readonly width: number; readonly height: number; readonly channels: number; readonly data: Uint8Array }

function coeffs(inSize: number, in0: number, in1: number, outSize: number, f: Filter): { bounds: Int32Array; k: Int32Array; ksize: number } {
  const scale = (in1 - in0) / outSize;
  const filterscale = scale < 1 ? 1 : scale;
  const support = f.support * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const k = new Int32Array(outSize * ksize);
  const w = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = in0 + (xx + 0.5) * scale;
    const ss = 1 / filterscale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) { w[x] = f.fn((x + xmin - center + 0.5) * ss); ww += w[x]!; }
    for (let x = 0; x < ksize; x++) {
      const v = x < xmax ? (ww !== 0 ? w[x]! / ww : w[x]!) : 0;
      k[xx * ksize + x] = v < 0 ? Math.trunc(-0.5 + v * ONE) : Math.trunc(0.5 + v * ONE);
    }
    bounds[xx * 2] = xmin; bounds[xx * 2 + 1] = xmax;
  }
  return { bounds, k, ksize };
}

const clip8 = (ss: number): number => { const v = Math.floor(ss / ONE); return v < 0 ? 0 : v > 255 ? 255 : v; };

/**
 * PIL's `Image.resize((w, h), filter, box)` on an 8-bit image. `box` (x0, y0, x1, y1) is the source rectangle, in
 * PIL's float32 coordinates; omitted, the whole image. Same size and no box returns the image (PIL's copy).
 */
export function resample(img: Plane, outW: number, outH: number, filter: 'box' | 'bicubic' = 'box',
  box?: readonly [number, number, number, number]): Plane {
  const f = filter === 'box' ? BOX : BICUBIC;
  const [x0, y0, x1, y1] = (box ?? [0, 0, img.width, img.height]).map((v) => Math.fround(v)) as [number, number, number, number];
  if (!box && outW === img.width && outH === img.height) return img;
  const c = img.channels;
  const needH = outW !== img.width || x0 !== 0 || x1 !== outW;
  const needV = outH !== img.height || y0 !== 0 || y1 !== outH;
  const h = coeffs(img.width, x0, x1, outW, f);
  const v = coeffs(img.height, y0, y1, outH, f);
  let cur = img;
  let yOffset = 0;
  if (needH) {
    const first = v.bounds[0]!, last = v.bounds[outH * 2 - 2]! + v.bounds[outH * 2 - 1]!;
    const rows = last - first;
    const out = new Uint8Array(outW * rows * c);
    for (let yy = 0; yy < rows; yy++) {
      const src = (yy + first) * img.width * c;
      for (let xx = 0; xx < outW; xx++) {
        const xmin = h.bounds[xx * 2]!, xmax = h.bounds[xx * 2 + 1]!, kb = xx * h.ksize;
        for (let ch = 0; ch < c; ch++) {
          let ss = ONE / 2;
          for (let x = 0; x < xmax; x++) ss += img.data[src + (x + xmin) * c + ch]! * h.k[kb + x]!;
          out[(yy * outW + xx) * c + ch] = clip8(ss);
        }
      }
    }
    cur = { width: outW, height: rows, channels: c, data: out };
    yOffset = first;
  }
  if (needV) {
    const out = new Uint8Array(cur.width * outH * c);
    for (let yy = 0; yy < outH; yy++) {
      const ymin = v.bounds[yy * 2]! - yOffset, ymax = v.bounds[yy * 2 + 1]!, kb = yy * v.ksize;
      for (let xx = 0; xx < cur.width; xx++) {
        for (let ch = 0; ch < c; ch++) {
          let ss = ONE / 2;
          for (let y = 0; y < ymax; y++) ss += cur.data[((y + ymin) * cur.width + xx) * c + ch]! * v.k[kb + y]!;
          out[(yy * cur.width + xx) * c + ch] = clip8(ss);
        }
      }
    }
    cur = { width: cur.width, height: outH, channels: c, data: out };
  }
  return cur;
}

const asPlane = (img: Rgb): Plane => ({ width: img.width, height: img.height, channels: 3, data: img.data });

// ---------------------------------------------------------------------------------------------------------------
// numpy's float32 arithmetic

/** `np.float32(v) / 255.0` for each byte (compare.py L16): float32 division, correctly rounded. */
const F32: Float32Array = Float32Array.from({ length: 256 }, (_, v) => Math.fround(v / 255));
const f = Math.fround;

/** numpy's `pairwise_sum` for float32 (numpy/_core/src/umath/loops_utils.h.src): 8 accumulators, blocks of 128. */
export function pairwiseSum32(a: Float32Array, start = 0, n = a.length - start): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res = f(res + a[start + i]!);
    return res;
  }
  if (n <= 128) {
    const r = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 8; j++) r[j] = a[start + j]!;
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] = f(r[j]! + a[start + i + j]!);
    let res = f(f(f(r[0]! + r[1]!) + f(r[2]! + r[3]!)) + f(f(r[4]! + r[5]!) + f(r[6]! + r[7]!)));
    for (; i < n; i++) res = f(res + a[start + i]!);
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return f(pairwiseSum32(a, start, n2) + pairwiseSum32(a, start + n2, n - n2));
}

/** `arr.mean()` of a float32 array: `0 + pairwise_sum`, then a float32 division by the count. */
export function mean32(a: Float32Array): number {
  return f(f(0 + pairwiseSum32(a)) / a.length);
}

// ---------------------------------------------------------------------------------------------------------------
// the score

export interface Score {
  /** compare.score's three printed numbers: the score to 0.1, mad and block to 4 places (Python's round). */
  readonly score: number;
  readonly mad: number;
  readonly block: number;
}

/** A rectangle of the 640x448 frame, x0 y0 inclusive, x1 y1 exclusive. */
export type Rect = readonly [number, number, number, number];

export interface ScoreOptions {
  /**
   * The masked-background rule (research 108 §5): rectangles of the 640x448 frame excluded from both frames. They are
   * mapped onto the 320x224 grid (halved, outward to whole pixels) and the numbers are taken over the pixels outside
   * them only (`scoreGrids`): a difference inside the mask counts nothing, a block wholly inside is not a block of the
   * score, a block the mask cuts is judged on its uncovered pixels. So the score is the one of what is left -- the
   * covered area neither raises it nor lowers it -- and the bar and the control margin keep their meaning. A mask over
   * the whole frame is refused. The rectangles are in our frame's 640x448 coordinates and are applied on the grid:
   * a golden of another size (a 640x480 PCSX2 capture) is squeezed onto the grid whole (compare._arr), so its masked
   * area is the squeezed one -- y scaled by 480/448 on the golden's screen -- not the same screen pixels.
   */
  readonly mask?: readonly Rect[];
  /**
   * The 4:3 correction (KNOWN [online-7pct]; research 108 §3): the golden is a PCSX2 capture at 640x448 whose picture
   * is the 4:3 TV shape letterboxed inside the window -- 640 x 448/480 = 597.33 px wide, centred. With it, the
   * golden's resize reads only that picture (PIL's `box`), so it lands on our pixel-exact frame's coordinates. The gate
   * applies no such correction; it is off unless asked for.
   */
  readonly pcsx2Letterbox?: boolean;
}

/** The PCSX2 picture's box in a 640x448 window (KNOWN [online-7pct]: 21.33 px bars each side). */
export function letterboxBox(width: number, height: number): Rect {
  const pic = (width * height) / 480;
  const x0 = (width - pic) / 2;
  return [x0, 0, x0 + pic, height];
}

function maskGrid(mask: readonly Rect[]): Uint8Array {
  const m = new Uint8Array(SCORE_SIZE.width * SCORE_SIZE.height);
  const sx = SCORE_SIZE.width / FRAME.width, sy = SCORE_SIZE.height / FRAME.height;
  for (const [x0, y0, x1, y1] of mask) {
    const a = Math.max(0, Math.floor(x0 * sx)), b = Math.min(SCORE_SIZE.width, Math.ceil(x1 * sx));
    const c = Math.max(0, Math.floor(y0 * sy)), d = Math.min(SCORE_SIZE.height, Math.ceil(y1 * sy));
    for (let y = c; y < d; y++) m.fill(1, y * SCORE_SIZE.width + a, y * SCORE_SIZE.width + b);
  }
  return m;
}

/** compare._arr (L15-16) before the division: the frame `convert("RGB")`-ed and BOX-resized to 320x224. */
export function toScoreGrid(img: Rgb, box?: Rect): Uint8Array {
  return resample(asPlane(img), SCORE_SIZE.width, SCORE_SIZE.height, 'box', box).data;
}

/** compare.score(golden, ours) to the last printed digit; `options` adds the mask and the 4:3 correction. */
export function score(golden: Rgb, ours: Rgb, options: ScoreOptions = {}): Score {
  const gBox = options.pcsx2Letterbox ? letterboxBox(golden.width, golden.height) : undefined;
  const g = toScoreGrid(golden, gBox), o = toScoreGrid(ours);
  return scoreGrids(g, o, options.mask?.length ? maskGrid(options.mask) : undefined);
}

/**
 * The numbers from two 320x224 RGB byte grids (compare.score L20-27). With `mask` (one byte per grid pixel, nonzero =
 * excluded) the same arithmetic is taken over the pixels outside it only: `mad` the float32 mean of the uncovered
 * differences (one pairwise sum over them in the flattened order), a block's channel means over its uncovered pixels,
 * and `block` the share of the blocks with any uncovered pixel. Without a mask it is compare.score exactly.
 */
export function scoreGrids(g: Uint8Array, o: Uint8Array, mask?: Uint8Array): Score {
  const W = SCORE_SIZE.width, H = SCORE_SIZE.height, n = W * H * 3;
  let d: Float32Array;
  if (mask) {
    let kept = 0;
    for (let i = 0; i < W * H; i++) if (!mask[i]) kept++;
    if (kept === 0) throw new Error('captureScore: the mask covers the whole frame -- nothing left to score');
    d = new Float32Array(kept * 3);
    let k = 0;
    for (let i = 0; i < W * H; i++) {
      if (mask[i]) continue;
      for (let c = 0; c < 3; c++, k++) d[k] = Math.abs(f(F32[g[i * 3 + c]!]! - F32[o[i * 3 + c]!]!));
    }
  } else {
    d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.abs(f(F32[g[i]!]! - F32[o[i]!]!));
  }
  const mad = mean32(d);
  // g.reshape(14, 16, 20, 16, 3).mean(axis=(1, 3)): per block and channel, a float32 sum in row-then-column order.
  const thresh = f(BLOCK_THRESH);
  let over = 0, blocks = 0;
  for (let by = 0; by < H / 16; by++) {
    for (let bx = 0; bx < W / 16; bx++) {
      let count = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!mask?.[(by * 16 + y) * W + bx * 16 + x]) count++;
      if (count === 0) continue;                         // wholly under the mask: not a block of the score
      blocks++;
      let chans = 0;
      for (let c = 0; c < 3; c++) {
        let sg = 0, so = 0;
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const p = (by * 16 + y) * W + bx * 16 + x;
            if (mask?.[p]) continue;
            const k = p * 3 + c;
            sg = f(sg + F32[g[k]!]!); so = f(so + F32[o[k]!]!);
          }
        }
        chans = f(chans + Math.abs(f(f(sg / count) - f(so / count))));
      }
      if (f(chans / 3) > thresh) over++;
    }
  }
  const block = over / blocks;
  const raw = 100 * (1 - 0.5 * mad - 0.5 * block);
  return { score: pyRound(Math.max(0, Math.min(100, raw)), 1), mad: pyRound(mad, 4), block: pyRound(block, 4) };
}

// ---------------------------------------------------------------------------------------------------------------
// the control and the verdict (research 98 §1-2's trap: a dark golden scores high against anything dark)

export interface Judged extends Score {
  /** The golden scored against an all-black frame of its size, with the same options. */
  readonly control: number;
  /** score >= the bar and score - control >= CONTROL_MARGIN_READING. */
  readonly matched: boolean;
  /** Why not matched, or '' when matched. */
  readonly why: string;
}

/** The black control: compare.score(golden, black) -- what a frame that drew nothing would score. */
export function controlScore(golden: Rgb, options: ScoreOptions = {}): number {
  return score(golden, blackFrame(golden.width, golden.height), options).score;
}

/** The verdict on two numbers: the gate's bar, and the control's margin (research 108 §4). */
export function verdict(s: number, control: number, bar = TITLE_MIN_SCORE, margin = CONTROL_MARGIN_READING): { matched: boolean; why: string } {
  if (s < bar) return { matched: false, why: `score ${pyFixed(s, 1)} under ${pyFixed(bar, 1)}` };
  // The difference of two 1-decimal numbers, compared in tenths so 95.0 - 90.0 is not 4.999...
  if (Math.round(s * 10) - Math.round(control * 10) < Math.round(margin * 10)) {
    return { matched: false, why: `black scores ${pyFixed(control, 1)}, within ${pyFixed(margin, 1)} of ${pyFixed(s, 1)}: the score cannot tell this frame from black` };
  }
  return { matched: true, why: '' };
}

/** Score, control and verdict together: the harness's row for one frame. */
export function judge(golden: Rgb, ours: Rgb, options: ScoreOptions = {}, bar = TITLE_MIN_SCORE): Judged {
  const s = score(golden, ours, options);
  const control = controlScore(golden, options);
  return { ...s, control, ...verdict(s.score, control, bar) };
}

// ---------------------------------------------------------------------------------------------------------------
// gate.score_title, line for line (gate.py L200-221)

/** `gate.score_title`'s (ok, detail) over (basename, score) pairs already scored against the title reference. */
export function titleVerdict(scores: readonly (readonly [string, number])[]): { ok: boolean; detail: string } {
  if (scores.length === 0) return { ok: false, detail: 'no captures' };
  const step = (n: string): number => Number(n.slice(1, 3));
  const good = scores.filter(([, s]) => s >= TITLE_MIN_SCORE).length;
  const window = scores.filter(([n]) => step(n) < TITLE_MENU_WINDOW);
  const tail = scores.filter(([n]) => step(n) >= TITLE_MENU_WINDOW);
  const lost = window.filter(([, s]) => s < TITLE_MIN_SCORE).map(([n]) => n.slice(0, 3));
  const ok = lost.length === 0 && window.length >= TITLE_MIN_MATCHES;
  const notes: string[] = [];
  const bar = pyFixed(TITLE_MIN_SCORE, 1);
  if (lost.length) notes.push(`menu capture(s) under ${bar}: ${lost.join(' ')}`);
  if (window.length < TITLE_MIN_MATCHES) notes.push(`only ${window.length} menu-window captures, need ${TITLE_MIN_MATCHES}`);
  if (tail.length && tail.every(([, s]) => s >= TITLE_MIN_SCORE)) notes.push(`attract not reached by s${String(step(tail[tail.length - 1]![0])).padStart(2, '0')}`);
  const detail = `${good}/${scores.length} menu captures >= ${bar} (window s00..s${String(TITLE_MENU_WINDOW - 1).padStart(2, '0')}: `
    + `${window.length - lost.length}/${window.length})${notes.map((x) => `; ${x}`).join('')}; scores: `
    + scores.map(([n, s]) => `${n.slice(0, 3)}=${pyFixed(s, 1)}`).join(' ');
  return { ok, detail };
}

/** gate.score_title's capture set: `s[0-9][0-9]_*.png` without `burst`, sorted (gate.py L201-202). */
export function titleCaptures(names: readonly string[]): string[] {
  return names.filter((n) => /^s[0-9][0-9]_.*\.png$/.test(n) && !n.includes('burst')).sort();
}

// ---------------------------------------------------------------------------------------------------------------
// the drive's thumbnail (tools_py/parity/drive.py `thumb`, `crop_to_content`): settle detection and untilref

/** PIL `convert("L")` of an RGB frame: L = (R*19595 + G*38470 + B*7471 + 0x8000) >> 16 (Pillow Convert.c `L24`). */
export function toGrey(img: Rgb): Plane {
  const n = img.width * img.height, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (img.data[i * 3]! * 19595 + img.data[i * 3 + 1]! * 38470 + img.data[i * 3 + 2]! * 7471 + 0x8000) >>> 16;
  return { width: img.width, height: img.height, channels: 1, data: out };
}

/** drive.crop_to_content: the rows and columns whose grey max is over 8; an all-black frame unchanged. */
export function cropToContent(grey: Plane, thresh = 8): Plane {
  const { width: w, height: h, data } = grey;
  let r0 = -1, r1 = -1, c0 = w, c1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]! > thresh) { if (r0 < 0) r0 = y; r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x; }
    }
  }
  if (r0 < 0) return grey;
  const cw = c1 - c0 + 1, ch = r1 - r0 + 1, out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) out.set(data.subarray((y + r0) * w + c0, (y + r0) * w + c0 + cw), y * cw);
  return { width: cw, height: ch, channels: 1, data: out };
}

/** drive.thumb: the 160x112 grey thumbnail of the content rectangle (PIL's default BICUBIC). */
export function thumb(img: Rgb): Float32Array {
  return Float32Array.from(resample(cropToContent(toGrey(img)), 160, 112, 'bicubic').data);
}

/** `float(np.abs(a - b).mean())` over two thumbnails, or over rows r0..r1 x columns c0..c1 of them. */
export function thumbDistance(a: Float32Array, b: Float32Array, region: Rect = [0, 0, 160, 112]): number {
  const [c0, r0, c1, r1] = region;
  const d = new Float32Array((r1 - r0) * (c1 - c0));
  let k = 0;
  for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) d[k++] = Math.abs(f(a[y * 160 + x]! - b[y * 160 + x]!));
  return mean32(d);
}
