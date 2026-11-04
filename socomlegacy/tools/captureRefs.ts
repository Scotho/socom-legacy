import type { Rgb } from './captureImage';
import { pyRound, resample, thumbDistance, toGrey, type Plane, type Rect } from './captureScore';

/**
 * The PC project's two other reference methods, beside compare.score (PLAT-30's block, "What the original does";
 * web research 108 §5a):
 *
 * - **The dialog-text band** (`scripts/parity/save_empty_card.txt`: `untilref(<png>,47,62,36,125,14,8)` and
 *   `ifref(<png>,47,62,36,125,8)`): the mean |difference| of two `drive.thumb` thumbnails over rows 47:62 x columns
 *   36:125 (numpy slices: rows 47..61, columns 36..124 -- the dialog's text; rows 63..75 are its buttons, so a
 *   highlight move leaves the band alone), matched under 8.
 * - **The crop references** (`scripts/parity/refs/refs.json`, read by `tools_py/parity/online_login_ours.py`
 *   `Shell.diff`, `ref_scales`, `is_screen`): the frame `convert("L")`-ed and resized to 320x224 (PIL's default
 *   BICUBIC); each reference crop resized to five widths (x0.90, 0.93, 0.96, 1.0, 1.04); both brightness/contrast
 *   normalised; the best mean |difference| over offsets dy -6..6, dx -20..20 of the box's top-left; a screen is on
 *   when its distance is at most 0.45 (0.5 for the three prompt notices) and no other reference sharing its box is
 *   nearer. refs.json's `thresh` (8.0 for every entry) is read by nothing there; `main_menu` is compare.score >= 90.
 *
 * The float64 arithmetic is numpy's: a contiguous array's sum is one pairwise sum (`pairwiseSum64`); a crop of the
 * 320-wide frame is a strided view, which numpy copies into its 8192-element iterator buffer and sums as one pairwise
 * sum (measured: 153 of 153 random crops up to 8192 elements equal; larger ones are refused, `NUMPY_BUFSIZE`); `std`
 * is numpy `_var`'s: the mean, the squared deviations as a new array, their pairwise sum over the count, sqrt.
 */

// ---------------------------------------------------------------------------------------------------------------
// the dialog-text band

/** The band of `save_empty_card.txt`'s untilref and ifref, as `thumbDistance`'s region [c0, r0, c1, r1]. */
export const DIALOG_TEXT_BAND: Rect = [36, 47, 125, 62];
/** Its threshold: matched when the distance is under 8 (`save_empty_card.txt`; drive.py `dist < thresh`). */
export const DIALOG_TEXT_THRESH = 8;

/** The dialog-text band's distance between two `thumb`s and drive.py's verdict on it. */
export function dialogTextMatch(frameThumb: Float32Array, refThumb: Float32Array): { dist: number; matched: boolean } {
  const dist = thumbDistance(frameThumb, refThumb, DIALOG_TEXT_BAND);
  return { dist, matched: dist < DIALOG_TEXT_THRESH };
}

// ---------------------------------------------------------------------------------------------------------------
// numpy's float64 reductions

/** numpy's `pairwise_sum` for float64 (numpy/_core/src/umath/loops_utils.h.src): 8 accumulators, blocks of 128. */
export function pairwiseSum64(a: Float64Array, start = 0, n = a.length - start): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[start + i]!;
    return res;
  }
  if (n <= 128) {
    const r = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 8; j++) r[j] = a[start + j]!;
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] = r[j]! + a[start + i + j]!;
    let res = ((r[0]! + r[1]!) + (r[2]! + r[3]!)) + ((r[4]! + r[5]!) + (r[6]! + r[7]!));
    for (; i < n; i++) res += a[start + i]!;
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum64(a, start, n2) + pairwiseSum64(a, start + n2, n - n2);
}

/** A float64 grey image, row-major. */
export interface Grey64 { readonly width: number; readonly height: number; readonly data: Float64Array }

/** `arr.mean()` and `arr.std()` of a contiguous float64 array (numpy `_mean`, `_var`). */
function meanStd(a: Float64Array): { mean: number; std: number } {
  const mean = (0 + pairwiseSum64(a)) / a.length;
  const sq = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) { const x = a[i]! - mean; sq[i] = x * x; }
  return { mean, std: Math.sqrt((0 + pairwiseSum64(sq)) / a.length) };
}

/**
 * numpy's iterator buffer (`NPY_BUFSIZE`, 8192 elements): a strided view up to this size is summed as one pairwise sum
 * of its elements copied into the buffer in order; a larger one is summed in an order not reproduced here.
 */
export const NUMPY_BUFSIZE = 8192;

/** The same of the strided view `img[y0:y0+h, x0:x0+w]` (`buf` and `out` hold w*h). */
export function viewMeanStd(img: Grey64, x0: number, y0: number, w: number, h: number, buf: Float64Array, out: Float64Array): { mean: number; std: number } {
  const n = w * h;
  if (w !== img.width && n > NUMPY_BUFSIZE) {
    throw new Error(`captureRefs: a ${w}x${h} crop exceeds numpy's ${NUMPY_BUFSIZE}-element buffer; its sum order is not reproduced`);
  }
  for (let y = 0; y < h; y++) buf.set(img.data.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + w), y * w);
  const mean = (0 + pairwiseSum64(buf, 0, n)) / n;
  for (let i = 0; i < n; i++) { const v = buf[i]! - mean; out[i] = v * v; }
  return { mean, std: Math.sqrt((0 + pairwiseSum64(out, 0, n)) / n) };
}

// ---------------------------------------------------------------------------------------------------------------
// the crop references

/** One `refs.json` entry: the box's top-left (x0, y0) on the 320x224 grey frame (x1, y1 are not read by Shell.diff). */
export interface CropRef { readonly box: readonly [number, number, number, number]; readonly thresh: number }
/** `Shell.PROMPT_THRESH` and is_screen's default (online_login_ours.py). */
export const PROMPT_THRESH: Readonly<Record<string, number>> = { write_down: 0.5, save_card: 0.5, card_slot: 0.5 };
export const SCREEN_THRESH = 0.45;
/** `ref_scales`' horizontal scales of a reference crop. */
export const REF_SCALES = [0.90, 0.93, 0.96, 1.0, 1.04] as const;

const toGrey64 = (p: Plane): Grey64 => ({ width: p.width, height: p.height, data: Float64Array.from(p.data) });

/** `np.asarray(frame.convert("L").resize((320, 224)), dtype=float)` -- is_screen's `arr`. */
export function screenGrey(img: Rgb): Grey64 {
  return toGrey64(resample(toGrey(img), 320, 224, 'bicubic'));
}

/** `ref_scales(name)`: the reference crop (8-bit grey) resized to each REF_SCALES width, as float64. */
export function refScales(ref: Plane): Grey64[] {
  return REF_SCALES.map((sc) => toGrey64(resample(ref, Math.max(4, pyRound(ref.width * sc, 0)), ref.height, 'bicubic')));
}

/** `Shell.diff`: the best normalised mean |difference| of the box's band to the reference over the offsets. */
export function cropRefDistance(arr: Grey64, scales: readonly Grey64[], box: CropRef['box']): number {
  const [x0, y0] = box;
  let best = 1e9;
  for (const ref of scales) {
    const { width: w, height: h } = ref;
    const r = meanStd(ref.data), rd = r.std + 1e-6;
    const rn = new Float64Array(w * h);
    for (let i = 0; i < rn.length; i++) rn[i] = (ref.data[i]! - r.mean) / rd;
    const buf = new Float64Array(w * h), tmp = new Float64Array(w * h), d = new Float64Array(w * h);
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        const ax0 = x0 + dx, ay0 = y0 + dy;
        if (ax0 < 0 || ay0 < 0 || ax0 + w > arr.width || ay0 + h > arr.height) continue;
        const c = viewMeanStd(arr, ax0, ay0, w, h, buf, tmp);
        if (c.std < 2.0) continue;
        const cd = c.std + 1e-6;
        for (let i = 0; i < d.length; i++) d[i] = Math.abs((buf[i]! - c.mean) / cd - rn[i]!);
        const v = (0 + pairwiseSum64(d)) / d.length;
        if (v < best) best = v;
      }
    }
  }
  return best;
}

/**
 * `Shell.is_screen(name)` for a crop reference: the distance at most its threshold, and no other reference sharing the
 * box nearer (is_screen's `thresh` argument reaches only main_menu, so there is none here). `refs` maps each name to
 * its entry and its `refScales`. (`main_menu` is compare.score's, not a crop.)
 */
export function isScreen(arr: Grey64, name: string,
  refs: ReadonlyMap<string, { meta: CropRef; scales: readonly Grey64[] }>): { matched: boolean; dist: number } {
  const me = refs.get(name);
  if (!me) throw new Error(`captureRefs: no crop reference '${name}'`);
  const dist = cropRefDistance(arr, me.scales, me.meta.box);
  if (dist > (PROMPT_THRESH[name] ?? SCREEN_THRESH)) return { matched: false, dist };
  for (const [other, o] of refs) {
    if (other === name || o.meta.box.join() !== me.meta.box.join()) continue;
    if (cropRefDistance(arr, o.scales, o.meta.box) < dist) return { matched: false, dist };
  }
  return { matched: true, dist };
}
