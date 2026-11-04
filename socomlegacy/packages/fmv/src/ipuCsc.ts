/**
 * The IPU's colour space conversion (PLAT-19b; moved here from `tools/fmvPlanes.ts`, which now imports it): research 98
 * §7.4 chose it over BT.601 by the PCSX2 captures, and research 120 §5 applies it to the page's pictures.
 *
 * The integers are PCSX2's `pcsx2/IPU/yuv2rgb.cpp` `yuv2rgb_reference` (commit 81526d4dc7cc70e4ae75abb35a789417456c6d43;
 * its SSE2 and NEON paths compute the same): coefficients in 1/64 -- Y 0x95 (1.1640625), R-Cr 0xcc (1.59375), G-Cr
 * -0x68 (-0.8125), G-Cb -0x32 (-0.390625), B-Cb 0x102 (2.015625); `lum = (0x95 * max(0, Y - 16)) >> 6`, each chroma
 * term shifted right by 6 on its own (an arithmetic shift, toward minus infinity), the sum rounded `(s + 1) >> 1` and
 * clamped to 0..255; chroma taken nearest, one Cb/Cr per 2x2 luma, no filter.
 *
 * Pure and DOM-free (W6.R2). The terms are tabled once (256 entries each); the result is the formula's, sample for
 * sample (`test/ipuCsc.test.ts` holds it to the formula written out).
 */

/**
 * The alpha of every converted pixel: opaque. [reading] The IPU's CSC command can also give a pixel an alpha (its
 * TH0/TH1 thresholds), not read here nor in research 98 §7.4, which compares RGB only; the game uploads the picture
 * straight into the frame buffer under the dialog (research 121 R121.10). Listed in research 120 §9.
 */
export const MOVIE_ALPHA_READING = 255;

const LUM = new Int32Array(256);
const R_CR = new Int32Array(256);
const G_CR = new Int32Array(256);
const G_CB = new Int32Array(256);
const B_CB = new Int32Array(256);
for (let v = 0; v < 256; v++) {
  LUM[v] = (0x95 * Math.max(0, v - 16)) >> 6;
  R_CR[v] = (0xcc * (v - 128)) >> 6;
  G_CR[v] = (-0x68 * (v - 128)) >> 6;
  G_CB[v] = (-0x32 * (v - 128)) >> 6;
  B_CB[v] = (0x102 * (v - 128)) >> 6;
}

/**
 * Y, Cb, Cr planes of a `w` x `h` 4:2:0 picture to `channels` bytes per pixel (3: packed RGB; 4: RGBA with
 * `MOVIE_ALPHA_READING`). `chromaStride` is the chroma planes' row length (`w >> 1` unless the decoder pads them).
 */
function convert(y: Uint8Array, cb: Uint8Array, cr: Uint8Array, w: number, h: number, out: Uint8Array, channels: 3 | 4, chromaStride: number): Uint8Array {
  const ch = (h + 1) >> 1;
  if (y.length < w * h) throw new Error(`ipuCsc: the Y plane holds ${y.length} bytes, not ${w}x${h}`);
  if (cb.length < chromaStride * (ch - 1) + ((w + 1) >> 1) || cr.length < chromaStride * (ch - 1) + ((w + 1) >> 1)) {
    throw new Error(`ipuCsc: a chroma plane is too short for ${w}x${h} at stride ${chromaStride}`);
  }
  if (out.length < w * h * channels) throw new Error(`ipuCsc: the output holds ${out.length} bytes, not ${w * h * channels}`);
  // A clamped view: storing an integer below 0 or above 255 stores 0 or 255, which is the formula's clamp.
  const o8 = new Uint8ClampedArray(out.buffer, out.byteOffset, out.length);
  for (let j = 0; j < h; j++) {
    const crow = (j >> 1) * chromaStride;
    let o = j * w * channels;
    let yi = j * w;
    for (let i = 0; i < w; i++, yi++, o += channels) {
      const c = crow + (i >> 1);
      const vb = cb[c]!;
      const vr = cr[c]!;
      const lum = LUM[y[yi]!]!;
      o8[o] = (lum + R_CR[vr]! + 1) >> 1;
      o8[o + 1] = (lum + G_CR[vr]! + G_CB[vb]! + 1) >> 1;
      o8[o + 2] = (lum + B_CB[vb]! + 1) >> 1;
      if (channels === 4) o8[o + 3] = MOVIE_ALPHA_READING;
    }
  }
  return out;
}

/** The three planes of a `w` x `h` yuv420p picture laid end to end (the layout ffmpeg's rawvideo and the harness use). */
function planesOf(p: Uint8Array, w: number, h: number): { y: Uint8Array; cb: Uint8Array; cr: Uint8Array } {
  const ys = w * h;
  const cs = (w >> 1) * (h >> 1);
  if (p.length !== ys + 2 * cs) throw new Error(`ipuCsc: ${p.length} bytes is not a ${w}x${h} yuv420p picture`);
  return { y: p.subarray(0, ys), cb: p.subarray(ys, ys + cs), cr: p.subarray(ys + cs, ys + 2 * cs) };
}

/** A yuv420p picture (Y, Cb, Cr end to end) to packed RGB, `w * h * 3` bytes: the harness's form (research 98 §7.2). */
export function ipuCsc(p: Uint8Array, w: number, h: number): Uint8Array {
  const { y, cb, cr } = planesOf(p, w, h);
  return convert(y, cb, cr, w, h, new Uint8Array(w * h * 3), 3, w >> 1);
}

/**
 * The planes to RGBA, `w * h * 4` bytes, rows top first: the texture's form (research 120 §5). Writes into `out` when
 * given (a recycled buffer), else a new one.
 */
export function ipuCscRgba(y: Uint8Array, cb: Uint8Array, cr: Uint8Array, w: number, h: number, out?: Uint8Array, chromaStride = w >> 1): Uint8Array {
  return convert(y, cb, cr, w, h, out ?? new Uint8Array(w * h * 4), 4, chromaStride);
}

/** Black as the conversion gives it (Y 16, Cb = Cr = 128: RGB 0) with its alpha, `w * h * 4` bytes: a movie layer before its first picture. */
export function ipuBlackRgba(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = MOVIE_ALPHA_READING;
  return out;
}
