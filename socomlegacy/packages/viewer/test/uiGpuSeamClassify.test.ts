import { describe, expect, it } from 'vitest';
import { rasterizeUiDrawList } from '../src/uiCompositorView';
import { UI_GPU_SEAM_CLASS_TOLERANCE, UI_GPU_SEAM_LISTS, classifySeamPixels, uiGpuSeamInvWs, uiGpuSeamListPixels, uiGpuSeamsScales } from '../e2e/uiGpuHarness';
import { UI_RASTER_CASE_SCALES, UI_SEAM_CLEAR, UI_SEAM_TEXEL, seamPixels, seamSquares } from './uiRasterCases';

/**
 * GM-31 leg 2 (the GPU menus plan, row GM-31; GM-27's owed real-GPU seam count, GM-15d review F2): the seam pixel
 * classifier the parity harness's `seamRun` hook counts a GPU frame with (`e2e/uiGpuHarness.ts`), held here in Node. A
 * test instrument (product track): it judges our GPU frame against our own software frame and decides no pixel of either.
 * Evidence kind: unit test.
 */

const ONCE = UI_SEAM_CLEAR + UI_SEAM_TEXEL, TWICE = UI_SEAM_CLEAR + 2 * UI_SEAM_TEXEL;
const opts = { clear: UI_SEAM_CLEAR, texel: UI_SEAM_TEXEL };

/** A 4 x 1 frame of the given grey values (alpha 255). */
const row = (...grey: number[]): { width: number; height: number; data: Uint8ClampedArray } => {
  const data = new Uint8ClampedArray(grey.length * 4);
  grey.forEach((g, i) => data.set([g, g, g, 255], i * 4));
  return { width: grey.length, height: 1, data };
};
const at = (n: number): [number, number][] => Array.from({ length: n }, (_, i): [number, number] => [i, 0]);

describe('GM-31: the seam pixel classifier (drawn once, twice, not at all)', () => {
  it('names each seam pixel by the value it holds: the clear (a hole), clear + texel (once), clear + 2 texels (a double add), anything else (other)', () => {
    const got = classifySeamPixels(row(ONCE, TWICE, UI_SEAM_CLEAR, 200), at(4), opts);
    expect(got).toMatchObject({ total: 4, once: 1, twice: 1, hole: 1, other: 1, equalToReference: null });
    expect(got.first.map((f) => f.class)).toEqual(['twice', 'hole', 'other']);
    expect(got.first[0]).toMatchObject({ x: 1, y: 0, rgb: [TWICE, TWICE, TWICE] });
  });

  it('every pixel once: once = total and nothing listed', () => {
    const got = classifySeamPixels(row(ONCE, ONCE, ONCE), at(3), opts);
    expect(got).toMatchObject({ total: 3, once: 3, twice: 0, hole: 0, other: 0 });
    expect(got.first).toEqual([]);
  });

  it(`a channel within ${UI_GPU_SEAM_CLASS_TOLERANCE} of a class keeps it (a B rounding); one past it is other; one channel off alone decides`, () => {
    expect(UI_GPU_SEAM_CLASS_TOLERANCE).toBe(2);
    const f = row(ONCE + 2, ONCE - 2, TWICE + 1, ONCE + 3);
    f.data[4 * 3 + 1] = ONCE;   // the fourth pixel: R and B 3 off, G exact -- still other
    const got = classifySeamPixels(f, at(4), opts);
    expect(got).toMatchObject({ once: 2, twice: 1, other: 1 });
    const g = row(ONCE);
    g.data[2] = ONCE + 3;       // blue alone past the tolerance
    expect(classifySeamPixels(g, at(1), opts)).toMatchObject({ once: 0, other: 1 });
  });

  it('counts the seam pixels equal to a reference frame (RGB), when one is given', () => {
    const got = classifySeamPixels(row(ONCE, ONCE + 1, TWICE), at(3), opts, row(ONCE, ONCE, ONCE));
    expect(got).toMatchObject({ equalToReference: 1, once: 2, twice: 1 });
  });

  it('lists at most 8 pixels that are not once, in the order walked', () => {
    const got = classifySeamPixels(row(...Array.from({ length: 12 }, () => TWICE)), at(12), opts);
    expect(got.twice).toBe(12);
    expect(got.first.map((f) => f.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('refuses a pixel outside the frame and a reference of another size', () => {
    expect(() => classifySeamPixels(row(ONCE), [[1, 0]], opts)).toThrow(/outside/);
    expect(() => classifySeamPixels(row(ONCE), at(1), opts, row(ONCE, ONCE))).toThrow(/size/);
  });
});

describe('GM-31: the two seam lists the harness draws (GM-15b\'s, `test/uiRasterCases.ts` `seamSquares`)', () => {
  it('24 squares each: the dyadic depths in GM-15b\'s order, and invW 0.7 throughout', () => {
    expect(UI_GPU_SEAM_LISTS).toEqual(['dyadic', '0.7']);
    expect(uiGpuSeamInvWs('dyadic')).toEqual([0.5, 0.75, 1, 1.5, 2, 0.375, 0.5, 0.75, 1, 1.5, 2, 0.375, 0.5, 0.75, 1, 1.5, 2, 0.375, 0.5, 0.75, 1, 1.5, 2, 0.375]);
    expect(uiGpuSeamInvWs('0.7')).toEqual(Array.from({ length: 24 }, () => 0.7));
  });

  it('every seam pixel of the software\'s frame is drawn once at 1, 2 and 4, on both lists (the reference the GPU is held to)', () => {
    for (const list of UI_GPU_SEAM_LISTS) {
      const { items, textures, squares } = seamSquares(uiGpuSeamInvWs(list));
      for (const scale of UI_RASTER_CASE_SCALES) {
        const pixels = uiGpuSeamListPixels(squares, scale);
        expect(pixels.length, `${list} @${scale}x`).toBe(squares.reduce((n, sq) => n + seamPixels(sq, scale).length, 0));
        const frame = rasterizeUiDrawList(items, textures, { scale }).frame;
        const got = classifySeamPixels(frame, pixels, opts, frame);
        expect(got, `${list} @${scale}x`).toMatchObject({ total: pixels.length, once: pixels.length, twice: 0, hole: 0, other: 0, equalToReference: pixels.length });
      }
    }
  });
});

describe('GM-31 review F3: S2U_UI_GPU_SEAMS_SCALES', () => {
  it('unset or empty: 1, 2, 4; a list: those, in scale order, duplicates once', () => {
    expect(uiGpuSeamsScales(undefined)).toEqual([1, 2, 4]);
    expect(uiGpuSeamsScales(' ')).toEqual([1, 2, 4]);
    expect(uiGpuSeamsScales('4, 1,1')).toEqual([1, 4]);
  });

  it('an unknown value is refused by name, never a run with no seam test', () => {
    expect(() => uiGpuSeamsScales('1,3')).toThrow(/S2U_UI_GPU_SEAMS_SCALES: "3"/);
    expect(() => uiGpuSeamsScales('2x')).toThrow(/"2x"/);
  });
});
