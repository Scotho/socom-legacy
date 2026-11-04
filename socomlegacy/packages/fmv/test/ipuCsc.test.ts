import { describe, expect, it } from 'vitest';
import { MOVIE_ALPHA_READING, ipuBlackRgba, ipuCsc, ipuCscRgba } from '../src/ipuCsc';

/**
 * The IPU's colour conversion in the package (moved from `tools/fmvPlanes.ts` by PLAT-19b; research 98 §7.4, research
 * 120 §5): PCSX2's `yuv2rgb_reference` integers, as packed RGB (the harness's) and as RGBA for the texture.
 */

/** The reference: research 98 §7.4's formula, sample by sample, written out with no table. */
function reference(y: number, cb: number, cr: number): [number, number, number] {
  const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
  const vb = cb - 128;
  const vr = cr - 128;
  const lum = (0x95 * Math.max(0, y - 16)) >> 6;
  return [
    clamp((lum + ((0xcc * vr) >> 6) + 1) >> 1),
    clamp((lum + ((-0x68 * vr) >> 6) + ((-0x32 * vb) >> 6) + 1) >> 1),
    clamp((lum + ((0x102 * vb) >> 6) + 1) >> 1),
  ];
}

describe('ipuCscRgba: the planes to RGBA by the IPU\'s integers', () => {
  it('equals the formula on every Y, and Cb/Cr across their range (2x2 luma per chroma sample, nearest)', () => {
    // 256 luma columns by 2 rows, one Cb/Cr pair per 2x2 block: every (Y, Cb, Cr) with Cb = Cr's mirror.
    const w = 256, h = 2;
    for (const step of [0, 37, 101, 199]) {
      const y = Uint8Array.from({ length: w * h }, (_, i) => i % w);
      const cb = Uint8Array.from({ length: (w / 2) * (h / 2) }, (_, i) => (i * 2 + step) & 255);
      const cr = Uint8Array.from({ length: (w / 2) * (h / 2) }, (_, i) => (255 - i * 2 + step) & 255);
      const out = ipuCscRgba(y, cb, cr, w, h);
      expect(out.length).toBe(w * h * 4);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const c = (j >> 1) * (w / 2) + (i >> 1);
          const o = (j * w + i) * 4;
          expect([out[o], out[o + 1], out[o + 2], out[o + 3]]).toEqual([...reference(y[j * w + i]!, cb[c]!, cr[c]!), MOVIE_ALPHA_READING]);
        }
      }
    }
  });

  it('honours a chroma stride wider than half the width (a decoder\'s padded planes) and fills a given buffer', () => {
    const w = 4, h = 2;
    const y = Uint8Array.of(16, 100, 200, 235, 50, 60, 70, 80);
    const cb = Uint8Array.of(90, 160, 0, 0);     // stride 4, two used
    const cr = Uint8Array.of(240, 16, 0, 0);
    const into = new Uint8Array(w * h * 4);
    const out = ipuCscRgba(y, cb, cr, w, h, into, 4);
    expect(out).toBe(into);
    expect([...out.subarray(4, 7)]).toEqual(reference(100, 90, 240));
    expect([...out.subarray(8, 11)]).toEqual(reference(200, 160, 16));
  });

  it('packed RGB (the harness\'s ipuCsc) is the same conversion without the alpha', () => {
    const w = 16, h = 4;
    const p = Uint8Array.from({ length: w * h * 3 / 2 }, (_, i) => (i * 53 + 7) & 255);
    const rgb = ipuCsc(p, w, h);
    const rgba = ipuCscRgba(p.subarray(0, w * h), p.subarray(w * h, w * h * 5 / 4), p.subarray(w * h * 5 / 4), w, h);
    for (let k = 0; k < w * h; k++) expect([...rgb.subarray(k * 3, k * 3 + 3)]).toEqual([...rgba.subarray(k * 4, k * 4 + 3)]);
  });

  it('ipuBlackRgba is the conversion of black (Y 16, Cb = Cr = 128): RGB 0, the alpha the conversion gives', () => {
    const w = 8, h = 4;
    expect(ipuBlackRgba(w, h)).toEqual(ipuCscRgba(new Uint8Array(w * h).fill(16), new Uint8Array(w * h / 4).fill(128), new Uint8Array(w * h / 4).fill(128), w, h));
  });

  it('refuses a picture the wrong size', () => {
    expect(() => ipuCsc(new Uint8Array(10), 4, 4)).toThrow(/yuv420p/);
    expect(() => ipuCscRgba(new Uint8Array(15), new Uint8Array(4), new Uint8Array(4), 4, 4)).toThrow(/plane/);
  });
});
