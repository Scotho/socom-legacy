import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import {
  HD_MENU_SCALE_LIMIT, MOVIE_NO_PICTURE_BLEND, blendAfterBind, clearBytes, clearPacker, columnAxis, coverageBounds,
  pickBitmap, rasterScale, rowAxis, scaleAt, scaleClip, wrap,
} from '../src/uiRasterRules';
import * as view from '../src/uiCompositorView';
import type { UiBitmap } from '../src/uiCompositorView';

/**
 * GM-05: the software drawer's raster rules, moved out of `uiCompositorView.ts` unchanged so the GPU planner can share
 * them. Each export is named here and checked against the expression it was moved from (a no-op refactor: no reading
 * moves, no value changes; the compositor's own tests, GM-03's case table and the `TODAY` pins hold the bytes).
 */
describe('uiRasterRules (GM-05): the compositor\'s rules, moved', () => {
  it('rasterScale: a whole factor of at least 1, bounded by HD_MENU_SCALE_LIMIT; the view re-exports both', () => {
    expect(HD_MENU_SCALE_LIMIT).toBe(4);
    expect([undefined, 0, 1, 1.5, 2, 3, 4, 5, 8, -2, Number.NaN].map(rasterScale)).toEqual([1, 1, 1, 1, 2, 3, 4, 4, 4, 1, 1]);
    expect(view.rasterScale).toBe(rasterScale);
    expect(view.HD_MENU_SCALE_LIMIT).toBe(HD_MENU_SCALE_LIMIT);
  });

  it('scaleAt / scaleClip: identity at scale 1 (the same object back), x s and (x1 + 1) s - 1 above it', () => {
    expect(scaleAt(1)(12.375)).toBe(12.375);
    expect(scaleAt(4)(12.375)).toBe(49.5);
    const clip = { x0: 3, y0: 5, x1: 10, y1: 20 };
    expect(scaleClip(1)(clip)).toBe(clip);
    expect(scaleClip(3)(null)).toBeNull();
    expect(scaleClip(3)(clip)).toEqual({ x0: 9, y0: 15, x1: 32, y1: 62 });
  });

  it('coverageBounds: ceil(min) .. ceil(max), clipped to the frame and the clip (x1 + 1); null when empty', () => {
    expect(coverageBounds(10.25, 4, 2.5, 9.75, 640, 448, null)).toEqual({ xs: 3, ys: 4, xe: 11, ye: 10 });
    expect(coverageBounds(-5, -5, 700, 500, 640, 448, null)).toEqual({ xs: 0, ys: 0, xe: 640, ye: 448 });
    expect(coverageBounds(0, 0, 100, 100, 640, 448, { x0: 2.25, y0: 3.5, x1: 11.5, y1: 12.5 })).toEqual({ xs: 2.25, ys: 3.5, xe: 12.5, ye: 13.5 });
    expect(coverageBounds(9, 0, 9, 20, 640, 448, null)).toBeNull();
    expect(coverageBounds(0, 0, 20, 20, 640, 448, { x0: 30, y0: 0, x1: 40, y1: 10 })).toBeNull();
  });

  it('pickBitmap: the HD replacement keeps the bitmap\'s blend and gives the size ratios; none: the bitmap, 1 and 1', () => {
    const bitmap: UiBitmap = { width: 16, height: 8, data: new Uint8ClampedArray(16 * 8 * 4), blend: 'additive' };
    const hd: Rgba = { width: 64, height: 16, data: new Uint8ClampedArray(64 * 16 * 4) };
    expect(pickBitmap(undefined, bitmap)).toEqual({ tex: bitmap, su: 1, sv: 1 });
    expect(pickBitmap(() => null, bitmap).tex).toBe(bitmap);
    const picked = pickBitmap(() => hd, bitmap);
    expect(picked.su).toBe(4); expect(picked.sv).toBe(2);
    expect(picked.tex).toEqual({ width: 64, height: 16, data: hd.data, blend: 'additive' });
    expect(pickBitmap(() => hd, { width: 16, height: 8, data: bitmap.data }).tex).not.toHaveProperty('blend');
  });

  it('ALPHA_1: a bound bitmap sets its blend (source without one); the no-picture movie quad draws by source', () => {
    expect(blendAfterBind({ width: 1, height: 1, data: new Uint8ClampedArray(4) })).toBe('source');
    expect(blendAfterBind({ width: 1, height: 1, data: new Uint8ClampedArray(4), blend: 'additive' })).toBe('additive');
    expect(MOVIE_NO_PICTURE_BLEND).toBe('source');
  });

  it('clear bytes: (r, g, b, 255) through the clamped byte view, packed in this host\'s order', () => {
    expect([...clearBytes([17, 89.5, 300])]).toEqual([17, 90, 255, 255]);
    expect([...clearBytes([-4, 0.5, 1.5])]).toEqual([0, 0, 2, 255]);
    const pack = clearPacker();
    const word = pack(17, 89.5, 300);
    expect([...new Uint8ClampedArray(new Uint32Array([word]).buffer)]).toEqual([17, 90, 255, 255]);
    expect([...new Uint8ClampedArray(new Uint32Array([pack(0, 0, 0)]).buffer)]).toEqual([0, 0, 0, 255]);
  });

  it('wrap: repeat into 0 .. n - 1 for negative and large indices', () => {
    expect([-17, -16, -1, 0, 15, 16, 33].map((i) => wrap(i, 16))).toEqual([15, 0, 15, 0, 15, 0, 1]);
  });

  it('columnAxis / rowAxis: fillQuad\'s texel axis, multiply then divide, wrapped, bilinear (-0.5) or nearest', () => {
    const count = 6, left = new Float64Array(count), right = new Float64Array(count), fraction = new Float64Array(count);
    const x0 = 2.5, x1 = 8.25, u0 = -1.3, u1 = 2.4, width = 3;
    columnAxis(3, 9, x0, x1 - x0, u0, u1 - u0, width, false, left, right, fraction);
    for (let k = 0, x = 3; x < 9; k++, x++) {
      const tx = u0 + ((u1 - u0) * (x - x0)) / (x1 - x0) - 0.5, base = Math.floor(tx);
      expect(left[k]).toBe((((base % width) + width) % width) * 4);
      expect(right[k]).toBe(((((base + 1) % width) + width) % width) * 4);
      expect(fraction[k]).toBe(tx - base);
    }
    columnAxis(3, 9, x0, x1 - x0, u0, u1 - u0, width, true, left, right, fraction);
    expect(fraction[0]).toBe(u0 + ((u1 - u0) * (3 - x0)) / (x1 - x0) - Math.floor(u0 + ((u1 - u0) * (3 - x0)) / (x1 - x0)));
    const y0 = 1, dy = 4, v0 = 2.2, dv = -2.9, height = 5, w = 3;
    for (const nearest of [false, true]) for (let y = 1; y < 5; y++) {
      const ty = nearest ? v0 + (dv * (y - y0)) / dy : v0 + (dv * (y - y0)) / dy - 0.5, base = Math.floor(ty), fy = ty - base;
      expect(rowAxis(y, y0, dy, v0, dv, height, w, nearest)).toEqual({
        top: (((base % height) + height) % height) * w * 4, bottom: ((((base + 1) % height) + height) % height) * w * 4, fy, iy: 1 - fy,
      });
    }
  });

  it("rowAxis: writes into a caller's object (fillQuad's hot loop allocates none) with the same four values", () => {
    const out = { top: -1, bottom: -1, fy: -1, iy: -1 };
    for (const nearest of [false, true]) for (let y = 1; y < 5; y++) {
      const fresh = rowAxis(y, 1, 4, 2.2, -2.9, 5, 3, nearest);
      expect(rowAxis(y, 1, 4, 2.2, -2.9, 5, 3, nearest, out)).toBe(out);
      expect(out).toEqual(fresh);
    }
  });
});
