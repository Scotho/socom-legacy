import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Rgb } from '../captureImage';
import type { Plane } from '../captureScore';
import { thumb } from '../captureScore';
import {
  DIALOG_TEXT_BAND, cropRefDistance, dialogTextMatch, isScreen, refScales, screenGrey, viewMeanStd, type CropRef, type Grey64,
} from '../captureRefs';

/**
 * The PC project's dialog-text band and crop references (PLAT-30; web research 108 §5a). Every pinned number was
 * printed by the code ported -- `drive.thumb` sliced as `save_empty_card.txt`'s untilref/ifref slice it, and
 * `online_login_ours.Shell.diff` / `ref_scales` (PIL 12.1.1, numpy 2.5.3), with `REFS` pointed at a temporary
 * directory holding the synthetic crops below as 8-bit grey PNGs. No game data: the frames are arithmetic.
 */

function mk(w: number, h: number, fn: (x: number, y: number, c: number) => number): Rgb {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) data[(y * w + x) * 3 + c] = fn(x, y, c) & 255;
  return { width: w, height: h, data };
}
const sha = (b: Uint8Array | Float64Array): string => createHash('sha256').update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const O = mk(640, 448, (x, y, c) => x * 5 + y * 11 + c * 80 + ((x ^ y) % 17));
const PANEL = mk(640, 448, (x, y, c) => (x >= 100 && x < 500 && y >= 50 && y < 300 ? (x * 3 + y + c * 60) % 256 : 0));
/** A title band of dotted text over a gradient. */
const F = mk(640, 448, (x, y, c) => (y >= 16 && y < 70 && x >= 16 && x < 520
  ? ((Math.floor(x / 3) + Math.floor(y / 2)) % 5) * 50 + c * 10 : Math.floor((x + y) / 8) + c));

/** `g8[r0:r0+24, c0:c0+245]` mapped through `fn(value, column)` to 8 bits: the synthetic reference crops. */
function crop(g8: Uint8Array, r0: number, c0: number, fn: (v: number, x: number) => number): Plane {
  const data = new Uint8Array(24 * 245);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 245; x++) data[y * 245 + x] = fn(g8[(r0 + y) * 320 + c0 + x]!, x) & 255;
  return { width: 245, height: 24, channels: 1, data };
}

describe('the dialog-text band (save_empty_card.txt)', () => {
  it('rows 47:62 x columns 36:125 of drive.thumb, matched under 8', () => {
    expect(DIALOG_TEXT_BAND).toEqual([36, 47, 125, 62]);
    expect(dialogTextMatch(thumb(O), thumb(PANEL))).toEqual({ dist: 41.994754791259766, matched: false });
    expect(dialogTextMatch(thumb(PANEL), thumb(PANEL))).toEqual({ dist: 0, matched: true });
  });
});

describe('the crop references (refs.json, Shell.diff and is_screen)', () => {
  const arr = screenGrey(F);
  const g8 = Uint8Array.from(arr.data);
  const box: CropRef['box'] = [5, 8, 250, 32];
  const login = crop(g8, 9, 8, (v, x) => v + (x % 3));
  const universe = crop(g8, 30, 40, (v) => Math.floor((v * 3) / 4) + 20);
  const persona = crop(g8, 9, 8, (v, x) => v + ((x * 7) % 23));
  const refs = new Map<string, { meta: CropRef; scales: readonly Grey64[] }>(
    ([['login', login], ['universe', universe], ['persona', persona]] as const)
      .map(([n, p]) => [n, { meta: { box, thresh: 8.0 }, scales: refScales(p) }]));

  it('the frame convert("L") and BICUBIC-resized to 320x224; the reference at five widths (round half-even)', () => {
    expect(sha(g8)).toBe('b17f4c2560f3177d5272382c6fa231c9c9b61dbc4b012e96727463a9ed6773c8');
    const s = refs.get('login')!.scales;
    expect(s.map((r) => [r.height, r.width])).toEqual([[24, 220], [24, 228], [24, 235], [24, 245], [24, 255]]);
    const all = new Float64Array(s.reduce((n, r) => n + r.data.length, 0));
    s.reduce((at, r) => { all.set(r.data, at); return at + r.data.length; }, 0);
    expect(sha(all)).toBe('2d5b3e4a25e43dfb7a0927c381c853a217f331a3e59a3904aeded030a380ef6b');
  });

  it('a strided crop\'s mean and std as numpy takes them (one pairwise sum through the iterator buffer)', () => {
    // An LCG's bytes over 7.0 on the 320x224 grid (s from 3; numpy 2.5.3's c.mean(), c.std() of each crop). Summed row
    // by row the first two crops' means end ...388 and ...29 instead.
    const g = new Float64Array(320 * 224);
    let s = 3;
    for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; g[i] = ((s >>> 16) % 256) / 7.0; }
    const img: Grey64 = { width: 320, height: 224, data: g };
    const at = (x0: number, y0: number, w: number, h: number) => viewMeanStd(img, x0, y0, w, h, new Float64Array(w * h), new Float64Array(w * h));
    expect(at(8, 9, 245, 24)).toEqual({ mean: 18.153304178814384, std: 10.580074957084896 });
    expect(at(3, 50, 200, 30)).toEqual({ mean: 18.355714285714285, std: 10.626105928837918 });
    expect(() => at(0, 0, 300, 30)).toThrow(/8192-element buffer/);
  });

  it('Shell.diff to the last digit', () => {
    expect(cropRefDistance(arr, refs.get('login')!.scales, box)).toBe(0.011588565494300831);
    expect(cropRefDistance(arr, refs.get('universe')!.scales, box)).toBe(0.9514772445865705);
    expect(cropRefDistance(arr, refs.get('persona')!.scales, box)).toBe(0.09962188831500353);
  });

  it('is_screen: under 0.45, and no reference sharing the box nearer', () => {
    expect(isScreen(arr, 'login', refs).matched).toBe(true);
    expect(isScreen(arr, 'universe', refs).matched).toBe(false);          // 0.95: over the threshold
    expect(isScreen(arr, 'persona', refs)).toEqual({ matched: false, dist: 0.09962188831500353 });   // login is nearer
  });
});
