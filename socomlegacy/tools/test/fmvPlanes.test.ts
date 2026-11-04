import { describe, expect, it } from 'vitest';
import { BLACK_FLIP_RGB_READING, blockMaxDiff, comparePlanes, extraBlackBlocks, ipuCsc, lostBlackBlocks, pictureAt, planeDiff } from '../fmvPlanes';

/**
 * PLAT-19a's harness, its pure pieces (research 98 §7): the per-plane compare of two decodes, the IPU's colour
 * conversion (PCSX2 `pcsx2/IPU/yuv2rgb.cpp` `yuv2rgb_reference`, commit 81526d4d), and the extra-black-block check
 * (`tools_py/parity/movie_blocks.py` `black_mask`: a 16x16 block is black when every one of its RGB bytes is 0;
 * a finding is black in ours and not black in the reference). Every picture here is synthetic.
 */

/** A 4:2:0 picture of `w` x `h`, every sample of each plane set to the given value. */
function flat(w: number, h: number, y: number, cb: number, cr: number): Uint8Array {
  const out = new Uint8Array(w * h * 3 / 2);
  out.fill(y, 0, w * h);
  out.fill(cb, w * h, w * h * 5 / 4);
  out.fill(cr, w * h * 5 / 4);
  return out;
}

describe('planeDiff / comparePlanes: two decodes of one picture, plane by plane', () => {
  it('identical planes are equal with a zero bound', () => {
    const a = Uint8Array.of(1, 2, 3, 250);
    expect(planeDiff(a, a.slice())).toEqual({ equal: true, maxAbs: 0, sumAbs: 0, n: 4 });
  });

  it('the bound is the largest |a - b| and the sum is over every sample', () => {
    expect(planeDiff(Uint8Array.of(10, 20, 30, 40), Uint8Array.of(11, 20, 27, 40)))
      .toEqual({ equal: false, maxAbs: 3, sumAbs: 4, n: 4 });
  });

  it('planes of different lengths are refused, not compared short', () => {
    expect(() => planeDiff(new Uint8Array(4), new Uint8Array(5))).toThrow(/length/);
  });

  it('splits a 4:2:0 picture into Y, Cb and Cr at the right offsets', () => {
    const a = flat(32, 16, 100, 120, 140);
    const b = a.slice();
    b[32 * 16 + 3] = 125;                 // one Cb sample
    b[32 * 16 * 5 / 4 + 7] = 130;         // one Cr sample
    const r = comparePlanes(a, b, 32, 16);
    expect(r.y).toEqual({ equal: true, maxAbs: 0, sumAbs: 0, n: 512 });
    expect(r.cb).toEqual({ equal: false, maxAbs: 5, sumAbs: 5, n: 128 });
    expect(r.cr).toEqual({ equal: false, maxAbs: 10, sumAbs: 10, n: 128 });
  });

  it('pictureAt takes the i-th picture of a raw yuv420p stream', () => {
    const s = new Uint8Array(3 * 24);
    s.fill(7, 24, 48);
    expect(pictureAt(s, 1, 4, 4)).toEqual(new Uint8Array(24).fill(7));
    expect(() => pictureAt(s, 3, 4, 4)).toThrow(/picture 3/);
  });
});

describe('ipuCsc: the IPU colour conversion (PCSX2 yuv2rgb_reference)', () => {
  // Hand-computed from the reference's integers: lum = (0x95 * max(0, Y-16)) >> 6; rcr = (0xcc * (Cr-128)) >> 6;
  // gcr = (-0x68 * (Cr-128)) >> 6; gcb = (-0x32 * (Cb-128)) >> 6; bcb = (0x102 * (Cb-128)) >> 6;
  // R = clamp((lum + rcr + 1) >> 1), G = clamp((lum + gcr + gcb + 1) >> 1), B = clamp((lum + bcb + 1) >> 1).
  it('black, white and grey', () => {
    expect(Array.from(ipuCsc(flat(16, 16, 16, 128, 128), 16, 16).subarray(0, 3))).toEqual([0, 0, 0]);
    // Y 235: lum = (149 * 219) >> 6 = 509; (509 + 1) >> 1 = 255.
    expect(Array.from(ipuCsc(flat(16, 16, 235, 128, 128), 16, 16).subarray(0, 3))).toEqual([255, 255, 255]);
    // Y 126: lum = (149 * 110) >> 6 = 256; (256 + 1) >> 1 = 128.
    expect(Array.from(ipuCsc(flat(16, 16, 126, 128, 128), 16, 16).subarray(0, 3))).toEqual([128, 128, 128]);
  });

  it('a saturated colour, with the arithmetic shift rounding toward minus infinity', () => {
    // Y 81, Cb 90, Cr 240: lum = (149*65)>>6 = 151; rcr = (204*112)>>6 = 357; gcr = (-104*112)>>6 = -182;
    // gcb = (-50*-38)>>6 = 29; bcb = (258*-38)>>6 = floor(-153.19) = -154.
    // R = (151+357+1)>>1 = 254; G = (151-182+29+1)>>1 = floor(-0.5) = -1 -> 0; B = (151-154+1)>>1 = -1 -> 0.
    expect(Array.from(ipuCsc(flat(16, 16, 81, 90, 240), 16, 16).subarray(0, 3))).toEqual([254, 0, 0]);
    // Y 100, Cb 200, Cr 100: lum = 195; rcr = floor(-89.25) = -90; gcr = 45; gcb = floor(-56.25) = -57;
    // bcb = 290. R = (195-90+1)>>1 = 53; G = (195+45-57+1)>>1 = 92; B = (195+290+1)>>1 = 243.
    expect(Array.from(ipuCsc(flat(16, 16, 100, 200, 100), 16, 16).subarray(0, 3))).toEqual([53, 92, 243]);
  });

  it('chroma is taken nearest, one sample per 2x2 luma, no filter', () => {
    const p = flat(16, 16, 126, 128, 128);
    p[16 * 16 + 0] = 200;                 // Cb (0,0) covers luma (0..1, 0..1) only
    const rgb = ipuCsc(p, 16, 16);
    const b = (x: number, y: number): number => rgb[(y * 16 + x) * 3 + 2]!;
    expect([b(0, 0), b(1, 0), b(0, 1), b(1, 1)]).toEqual([b(0, 0), b(0, 0), b(0, 0), b(0, 0)]);
    expect(b(0, 0)).toBeGreaterThan(200);
    expect(b(2, 0)).toBe(128);
    expect(b(0, 2)).toBe(128);
  });
});

describe('extraBlackBlocks: movie_blocks.py\'s differential, on 16x16 blocks of the converted picture', () => {
  const W = 48, H = 32;                   // 3 x 2 blocks
  const grey = (): Uint8Array => flat(W, H, 126, 128, 128);
  /** Black out the luma of block (bx, by) -- Y 16 with neutral chroma converts to RGB 0. */
  function blacken(p: Uint8Array, bx: number, by: number): Uint8Array {
    for (let y = 0; y < 16; y++) p.fill(16, (by * 16 + y) * W + bx * 16, (by * 16 + y) * W + bx * 16 + 16);
    return p;
  }

  it('a block black in ours but not in the reference is a finding; the same block black in both is not', () => {
    const ref = blacken(grey(), 2, 1);
    const ours = blacken(blacken(grey(), 2, 1), 0, 1);
    expect(extraBlackBlocks(ours, ref, W, H)).toEqual([{ bx: 0, by: 1 }]);
  });

  it('one non-black sample makes a block not black (every byte must be 0)', () => {
    const ref = grey();
    const ours = blacken(grey(), 1, 0);
    ours[5 * W + 16 + 9] = 30;            // one luma sample inside block (1, 0): RGB > 0 there
    expect(extraBlackBlocks(ours, ref, W, H)).toEqual([]);
  });

  it('a picture that is black where the reference is black has no finding (a fade is not a defect)', () => {
    const black = flat(W, H, 16, 128, 128);
    expect(extraBlackBlocks(black, black.slice(), W, H)).toEqual([]);
  });
});

describe('blockMaxDiff: how far a 16x16 block\'s samples are from the reference\'s (research 98 §7.11)', () => {
  const W = 48, H = 32;
  it('the largest |d| over the block\'s 256 luma and its 64 + 64 chroma samples, nothing outside it', () => {
    const ref = flat(W, H, 17, 128, 128);
    const ours = flat(W, H, 16, 128, 128);            // black after the IPU's conversion; the reference's RGB is 0..1
    // Every block is a finding: black in ours, RGB 1 in the reference (Y 17 -> lum (0x95 * 1) >> 6 = 2, (2 + 1) >> 1 = 1).
    expect(extraBlackBlocks(ours, ref, W, H).length).toBe(6);
    ours[0] = 40;                                     // block (0, 0), off by 23
    ours[W * H + 8 * (W / 2) + 9] = 140;              // a Cb sample of block (1, 1): row 8, column 9 of the chroma plane
    expect(blockMaxDiff(ours, ref, W, H, 0, 0)).toBe(23);
    expect(blockMaxDiff(ours, ref, W, H, 1, 1)).toBe(12);
    expect(blockMaxDiff(ours, ref, W, H, 2, 1)).toBe(1);
  });

  it('separates a black/non-black flip at the black level (within the epsilon) from a lost block', () => {
    const ref = flat(W, H, 17, 128, 128);
    const ours = flat(W, H, 16, 128, 128);
    const lost = flat(W, H, 120, 128, 128);
    for (let y = 0; y < 16; y++) lost.fill(16, y * W, y * W + 16);   // block (0, 0) black where the reference has content
    expect(extraBlackBlocks(ours, ref, W, H).every((b) => blockMaxDiff(ours, ref, W, H, b.bx, b.by) <= 3)).toBe(true);
    expect(extraBlackBlocks(lost, flat(W, H, 120, 128, 128), W, H).map((b) => blockMaxDiff(lost, flat(W, H, 120, 128, 128), W, H, b.bx, b.by))).toEqual([104]);
  });
});

describe('lostBlackBlocks: an extra black block whose reference is more than the black-level flip (PLAT-19b review)', () => {
  const W = 48, H = 32;
  it('a block black in ours over a near-black reference is lost, though every sample is within the epsilon of 5', () => {
    // Reference Y 20 (RGB 5 after the IPU's conversion: lum (0x95 * 4) >> 6 = 9, (9 + 1) >> 1 = 5); ours Y 16 (RGB 0).
    const ref = flat(W, H, 20, 128, 128);
    const ours = flat(W, H, 120, 128, 128);
    for (let y = 0; y < 16; y++) ours.fill(16, y * W, y * W + 16);       // block (0, 0) black
    for (let y = 0; y < 16; y++) ours.fill(20, y * W + 16, y * W + 48);  // the rest equal to the reference
    for (let y = 16; y < 32; y++) ours.fill(20, y * W, y * W + 48);
    expect(blockMaxDiff(ours, ref, W, H, 0, 0)).toBe(4);                 // the per-sample bound would not see it
    expect(lostBlackBlocks(ours, ref, W, H)).toEqual([{ bx: 0, by: 0, refRgbMax: 5 }]);
  });

  it('the black-level flip (reference RGB 1, ours 0) is not lost; the reading is named and is 1', () => {
    expect(BLACK_FLIP_RGB_READING).toBe(1);
    const ref = flat(W, H, 17, 128, 128);
    const ours = flat(W, H, 16, 128, 128);
    expect(extraBlackBlocks(ours, ref, W, H).length).toBe(6);
    expect(lostBlackBlocks(ours, ref, W, H)).toEqual([]);
    expect(lostBlackBlocks(ours, flat(W, H, 18, 128, 128), W, H).length).toBe(6);   // RGB 2: past the flip
  });
});
