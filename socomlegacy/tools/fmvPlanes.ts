/**
 * The pure pieces of PLAT-19a's decoder spike (`tools/fmv-spike.ts`; the record is research 98 §7): two decodes of a
 * movie compared plane by plane, and the extra-black-block check over the IPU's colour conversion (which lives in
 * `@s2u/fmv` since PLAT-19b). No I/O here.
 *
 * Pictures are raw yuv420p, the layout `ffmpeg -f rawvideo -pix_fmt yuv420p` writes and the spike's glue returns:
 * the Y plane (w*h), then Cb (w/2 * h/2), then Cr.
 */

import { ipuCsc } from '@s2u/fmv';

/** The difference of two planes: equal, the largest |a - b|, the sum of |a - b| and the sample count. */
export interface PlaneDiff {
  equal: boolean;
  maxAbs: number;
  sumAbs: number;
  n: number;
}

export function planeDiff(a: Uint8Array, b: Uint8Array): PlaneDiff {
  if (a.length !== b.length) throw new Error(`planeDiff: plane length ${a.length} != ${b.length}`);
  let maxAbs = 0;
  let sumAbs = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!);
    sumAbs += d;
    if (d > maxAbs) maxAbs = d;
  }
  return { equal: maxAbs === 0, maxAbs, sumAbs, n: a.length };
}

/** Y, Cb and Cr of a yuv420p picture of `w` x `h`, as views (no copy). */
export function planes(p: Uint8Array, w: number, h: number): { y: Uint8Array; cb: Uint8Array; cr: Uint8Array } {
  const ys = w * h;
  const cs = (w >> 1) * (h >> 1);
  if (p.length !== ys + 2 * cs) throw new Error(`planes: ${p.length} bytes is not a ${w}x${h} yuv420p picture`);
  return { y: p.subarray(0, ys), cb: p.subarray(ys, ys + cs), cr: p.subarray(ys + cs, ys + 2 * cs) };
}

export function comparePlanes(a: Uint8Array, b: Uint8Array, w: number, h: number): { y: PlaneDiff; cb: PlaneDiff; cr: PlaneDiff } {
  const pa = planes(a, w, h);
  const pb = planes(b, w, h);
  return { y: planeDiff(pa.y, pb.y), cb: planeDiff(pa.cb, pb.cb), cr: planeDiff(pa.cr, pb.cr) };
}

/** The `i`-th picture (a view) of a raw yuv420p stream of `w` x `h` pictures. */
export function pictureAt(stream: Uint8Array, i: number, w: number, h: number): Uint8Array {
  const size = w * h * 3 / 2;
  if ((i + 1) * size > stream.length) throw new Error(`pictureAt: picture ${i} is past the end (${stream.length / size} pictures)`);
  return stream.subarray(i * size, (i + 1) * size);
}

/**
 * The IPU's colour space conversion to packed RGB (research 98 §7.4): moved into `@s2u/fmv` by PLAT-19b (`ipuCsc.ts`,
 * research 120 §5), since the page converts its pictures with it and no package may import from `tools/`. Re-exported
 * here for the harness and its tests.
 */
export { ipuCsc };

/** Per 16x16 block (row-major, whole blocks only): true when every RGB byte of the block is 0 (`movie_blocks.py`). */
export function blackBlocks(rgb: Uint8Array, w: number, h: number): boolean[] {
  const bw = Math.floor(w / 16);
  const bh = Math.floor(h / 16);
  const out: boolean[] = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let black = true;
      for (let y = by * 16; y < by * 16 + 16 && black; y++) {
        const row = (y * w + bx * 16) * 3;
        for (let k = 0; k < 48; k++) if (rgb[row + k] !== 0) { black = false; break; }
      }
      out.push(black);
    }
  }
  return out;
}

/**
 * The largest |ours - ref| over the samples of 16x16 block (`bx`, `by`): its 256 luma and the 8x8 Cb and Cr samples
 * behind it. What tells an extra black block that is a decode loss (the block's content missing: far beyond the
 * epsilon) from one that is the two IDCTs' rounding at the black level (a block whose reference converts to RGB 1 and
 * ours to 0, within the epsilon) -- research 98 §7.11.
 */
export function blockMaxDiff(ours: Uint8Array, ref: Uint8Array, w: number, h: number, bx: number, by: number): number {
  const a = planes(ours, w, h);
  const b = planes(ref, w, h);
  const cw = w >> 1;
  let max = 0;
  for (let y = by * 16; y < by * 16 + 16; y++) {
    for (let x = bx * 16; x < bx * 16 + 16; x++) max = Math.max(max, Math.abs(a.y[y * w + x]! - b.y[y * w + x]!));
  }
  for (let y = by * 8; y < by * 8 + 8; y++) {
    for (let x = bx * 8; x < bx * 8 + 8; x++) {
      max = Math.max(max, Math.abs(a.cb[y * cw + x]! - b.cb[y * cw + x]!), Math.abs(a.cr[y * cw + x]! - b.cr[y * cw + x]!));
    }
  }
  return max;
}

/**
 * The blocks black in `ours` and not black in `ref` -- `tools_py/parity/movie_blocks.py`'s differential (its
 * `missing = gpu black AND NOT shadow black`, with the reference decode in the shadow's place), on both pictures
 * converted by the IPU's CSC. An absolute black count would fire on the movies' own letterbox and fades (PC research
 * 16 §0); only the differential is a finding.
 */
export function extraBlackBlocks(ours: Uint8Array, ref: Uint8Array, w: number, h: number): { bx: number; by: number }[] {
  const a = blackBlocks(ipuCsc(ours, w, h), w, h);
  const b = blackBlocks(ipuCsc(ref, w, h), w, h);
  const bw = Math.floor(w / 16);
  const out: { bx: number; by: number }[] = [];
  a.forEach((black, k) => { if (black && !b[k]) out.push({ bx: k % bw, by: Math.floor(k / bw) }); });
  return out;
}

/**
 * The reference block's brightest RGB byte at which an extra black block is still the two IDCTs' rounding at the black
 * level and not a lost block: 1. Research 98 §7.11 measured it on the whole movies -- every block black in ours and not
 * in libavcodec's has libavcodec's RGB max 1 (one sample of Y 17 over 16 converts to RGB 1 through the IPU's CSC, and
 * libavcodec against itself with `-idct faani` flags the same kind) -- so a block over RGB 2 or more is lost content,
 * whatever its samples' distance (a lost block over a near-black reference stays within the epsilon of 5).
 * [reading: measured on SONY448, INTRO_2 and MENULOOP against one libavcodec, not taken from the game; a block lost over
 * a reference whose RGB max is 1 passes unseen. Research 120 §9.]
 */
export const BLACK_FLIP_RGB_READING = 1;

/** The largest RGB byte of 16x16 block (`bx`, `by`) of packed RGB `rgb`, `w` pixels wide. */
export function blockRgbMax(rgb: Uint8Array, w: number, bx: number, by: number): number {
  let max = 0;
  for (let y = by * 16; y < by * 16 + 16; y++) {
    const row = (y * w + bx * 16) * 3;
    for (let k = 0; k < 48; k++) if (rgb[row + k]! > max) max = rgb[row + k]!;
  }
  return max;
}

/**
 * The lost blocks: black in `ours` (every RGB byte 0 after the IPU's CSC), and brighter than `BLACK_FLIP_RGB_READING`
 * in `ref`. Independent of the per-sample bound: it is what fails on a block lost over a dark reference. Each carries the
 * reference's RGB max.
 */
export function lostBlackBlocks(ours: Uint8Array, ref: Uint8Array, w: number, h: number, flip = BLACK_FLIP_RGB_READING): { bx: number; by: number; refRgbMax: number }[] {
  const a = blackBlocks(ipuCsc(ours, w, h), w, h);
  const rgb = ipuCsc(ref, w, h);
  const bw = Math.floor(w / 16);
  const out: { bx: number; by: number; refRgbMax: number }[] = [];
  a.forEach((black, k) => {
    if (!black) return;
    const bx = k % bw, by = Math.floor(k / bw);
    const refRgbMax = blockRgbMax(rgb, w, bx, by);
    if (refRgbMax > flip) out.push({ bx, by, refRgbMax });
  });
  return out;
}
