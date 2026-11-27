/**
 * WM-PACK-2 RUNTIME's picture mode (a test instrument, product track; no original): the pure parts the browser check's
 * second test uses to show the owner the block path beside the RGBA path -- a SYNTHETIC strong-gradient texture
 * hand-encoded as BC1 or BC3 blocks (no HD pack on the box: no pack art), the amplified difference image and the
 * side-by-side composite. Unit-tested in `test/hdPackBlocksPicture.test.ts`.
 */

/** How much the difference image multiplies |a - b| per channel, so a 1-in-255 rounding shows. A test instrument. */
export const PICTURE_DIFF_GAIN_ADAPTATION = 32;

const to565 = (r: number, g: number, b: number): number => ((Math.round(r * 31 / 255) << 11) | (Math.round(g * 63 / 255) << 5) | Math.round(b * 31 / 255));
/** The gradient's colour at a texel: red ramps across, green down, blue along the diagonal; all opaque. */
const gradient = (x: number, y: number, w: number, h: number): [number, number, number] =>
  [x * 255 / (w - 1), y * 255 / (h - 1), (x + y) * 255 / (w + h - 2)];

/**
 * `w` x `h` (multiples of 4) of a strong gradient as BC1 (opaque four-colour) or BC3 (alpha 255) blocks: each block's
 * endpoints the gradient at its left and right columns, its texels indexed by column, so every block holds interpolated
 * texels -- the ones a hardware decoder rounds. A hand encoder: it is meant to show the decoders, not to be optimal.
 */
export function gradientBlocks(kind: 'bc1' | 'bc3', w: number, h: number): Uint8Array {
  const size = kind === 'bc1' ? 8 : 16, out = new Uint8Array((w / 4) * (h / 4) * size);
  for (let by = 0; by < h / 4; by++) for (let bx = 0; bx < w / 4; bx++) {
    let o = (by * (w / 4) + bx) * size;
    if (kind === 'bc3') { out[o] = 255; out[o + 1] = 255; o += 8; }               // alpha endpoints 255: every code 255
    const y = by * 4 + 1.5, lo = to565(...gradient(bx * 4, y, w, h)), hi = to565(...gradient(bx * 4 + 3, y, w, h));
    // Four-colour order: c0 > c1. Code 0 is c0, 1 is c1, 2 is 2/3 c0 + 1/3 c1, 3 is 1/3 c0 + 2/3 c1.
    const [c0, c1, cols] = hi > lo ? [hi, lo, [1, 3, 2, 0]] : hi < lo ? [lo, hi, [0, 2, 3, 1]] : [hi, lo, [0, 0, 0, 0]];
    out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
    let idx = 0; for (let t = 0; t < 16; t++) idx |= cols[t & 3]! << (2 * t);
    for (let k = 0; k < 4; k++) out[o + 4 + k] = (idx >>> (8 * k)) & 255;
  }
  return out;
}

/** |a - b| times `gain` per colour channel, clamped to 255; alpha 255 (an RGBA image to look at). */
export function amplifiedDiff(a: ArrayLike<number>, b: ArrayLike<number>, gain = PICTURE_DIFF_GAIN_ADAPTATION): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (i & 3) === 3 ? 255 : Math.abs(a[i]! - b[i]!) * gain;
  return out;
}
/** The largest per-channel difference over the colour channels (alpha is not drawn). */
export function maxChannelDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}
/** Images of `w` x `h` RGBA side by side, left to right. */
export function sideBySide(w: number, h: number, images: readonly ArrayLike<number>[]): { width: number; height: number; data: Uint8ClampedArray } {
  const width = w * images.length, data = new Uint8ClampedArray(width * h * 4);
  images.forEach((img, k) => { for (let y = 0; y < h; y++) for (let i = 0; i < w * 4; i++) data[(y * width + k * w) * 4 + i] = img[y * w * 4 + i]!; });
  return { width, height: h, data };
}
/**
 * A render target's read-back as tight rows of `w` x 4 bytes. three r186's WebGPU read-back
 * (`WebGPUTextureUtils.copyTextureToBuffer`) copies each row at a 256-byte stride and returns the buffer with its
 * padding -- (h - 1) x stride + w x 4 bytes -- where WebGL's `readPixels` is tight; either is accepted, anything else refused.
 */
export function tightRows(data: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const row = w * 4, stride = Math.ceil(row / 256) * 256;
  if (data.length === row * h) return Uint8ClampedArray.from(data);
  if (data.length !== (h - 1) * stride + row) throw new Error(`a read-back of ${data.length} bytes is neither ${row * h} (tight) nor ${(h - 1) * stride + row} (rows at ${stride}-byte strides)`);
  const out = new Uint8ClampedArray(row * h);
  for (let y = 0; y < h; y++) for (let i = 0; i < row; i++) out[y * row + i] = data[y * stride + i]!;
  return out;
}
/** Rows reversed: a WebGL read-back is bottom row first, a PNG top row first. */
export function flipRows(w: number, h: number, data: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let i = 0; i < w * 4; i++) out[(h - 1 - y) * w * 4 + i] = data[y * w * 4 + i]!;
  return out;
}

/**
 * The browser check's first test's blocks: four of each kind (an 8x8 image, blocks row by row) whose decode's alpha is
 * 255 everywhere (exact as blocks: the rescale is identity), with wide endpoint spans -- where PC 2's decoder measured
 * bc1 5, bc2 6, bc3 5 apart from ours. Both tests read them from here.
 */
export function patternBlocks(kind: 'bc1' | 'bc2' | 'bc3' | 'bc7'): Uint8Array {
  const size = kind === 'bc1' ? 8 : 16, b = new Uint8Array(4 * size);
  const colour = (o: number, c0: number, c1: number, idx: number) => { b[o] = c0 & 255; b[o + 1] = c0 >> 8; b[o + 2] = c1 & 255; b[o + 3] = c1 >> 8; for (let k = 0; k < 4; k++) b[o + 4 + k] = (idx >>> (8 * k)) & 255; };
  for (let i = 0; i < 4; i++) {
    const o = i * size;
    if (kind === 'bc1') colour(o, 0xf81f - i, 0x07e0 + i, (0xe4e41b1b ^ (i * 0x01010101)) >>> 0);
    else if (kind === 'bc2') { b.fill(0xff, o, o + 8); colour(o + 8, 0x001f + i, 0xffe0 - i, 0x1be4e41b); }
    else if (kind === 'bc3') { b[o] = 255; b[o + 1] = 255; colour(o + 8, 0xf800 + i, 0x07ff - i, 0x4e4e1b1b); }
    else {
      let pos = 0; const put = (v: number, n: number) => { for (let k = 0; k < n; k++, pos++) if ((v >> k) & 1) b[o + (pos >> 3)]! |= 1 << (pos & 7); };
      put(64, 7); const e0 = [100 + i, 10, 60, 127], e1 = [5, 120 - i, 90, 127];
      for (let c = 0; c < 4; c++) { put(e0[c]!, 7); put(e1[c]!, 7); } put(1, 1); put(1, 1);
      for (let t = 0; t < 16; t++) put((t * 5 + i) & (t === 0 ? 7 : 15), t === 0 ? 3 : 4);
    }
  }
  return b;
}
/**
 * The picture mode's worst case: `patternBlocks(kind)`'s 2x2 blocks tiled over a `w` x `h` panel (multiples of 8), so
 * its decode is the first test's 8x8 decode repeated -- the texels PC 2's decoder put furthest from ours, big enough to see.
 */
export function worstCaseBlocks(kind: 'bc1' | 'bc2' | 'bc3', w: number, h: number): Uint8Array {
  const size = kind === 'bc1' ? 8 : 16, pat = patternBlocks(kind), bw = w / 4, out = new Uint8Array(bw * (h / 4) * size);
  for (let by = 0; by < h / 4; by++) for (let bx = 0; bx < bw; bx++) {
    const i = (by % 2) * 2 + (bx % 2);
    out.set(pat.subarray(i * size, (i + 1) * size), (by * bw + bx) * size);
  }
  return out;
}
/** How much the picture's enlarged copies scale each texel (nearest), so a 64x64 panel is read on a board. A test instrument. */
export const PICTURE_UPSCALE_ADAPTATION = 4;
/** `w` x `h` RGBA with each texel a `k` x `k` square. */
export function upscaleNearest(w: number, h: number, data: ArrayLike<number>, k: number): Uint8ClampedArray {
  const W = w * k, out = new Uint8ClampedArray(W * h * k * 4);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < W; x++) {
    const s = ((Math.floor(y / k) * w) + Math.floor(x / k)) * 4, o = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = data[s + c]!;
  }
  return out;
}
/** A panel's PNG name: SYNTHETIC, the panel, the kind, what it shows. */
export const panelName = (panel: 'gradient' | 'worst-case', kind: string, what: string): string => `synthetic-${panel}-${kind}-${what}.png`;
/** The side-by-side's name, its caption: the three columns left to right and the panel's measured max diff. */
export const sideBySideName = (panel: 'gradient' | 'worst-case', kind: string, max: number, scale: number): string =>
  `synthetic-${panel}-${kind}-side-by-side${scale === 1 ? '' : `-${scale}x`}--rgba-path--block-path--absdiff-x32--max-diff-${max}.png`;
