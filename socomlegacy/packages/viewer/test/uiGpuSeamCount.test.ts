import { describe, expect, it } from 'vitest';
import type { UiDrawItem, UiModelTriangle } from '@s2u/ui';
import { rasterizeUiDrawList, type UiTextures } from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import { seamDoubleAdds } from './uiGpuSeamCount';
import { UI_RASTER_CASES, UI_RASTER_CASE_SCALES, UI_SEAM_CLEAR, UI_SEAM_TEXEL, caseRasterInputs, seamPixels, seamSquares } from './uiRasterCases';

/**
 * GM-15c (the GM-15 row's 15c; the Log 2026-11-05T02:00Z, R1, with GM-15b review F1's correction): the seam double-add
 * instrument (`uiGpuSeamCount.ts`) held to the software's own frame before it counts the corpus
 * (`uiGpuModelsCorpus.disc.test.ts`). A test instrument: unit test only, nothing the port draws changes.
 */

const once = UI_SEAM_CLEAR + UI_SEAM_TEXEL, twice = UI_SEAM_CLEAR + 2 * UI_SEAM_TEXEL;
const DYADIC = [0.5, 0.75, 1, 1.5, 2, 0.375];

describe('GM-15c: the seam double-add count, held to the software', () => {
  it('a seam at dyadic depths: 0 double adds at 1, 2 and 4, and every write the software\'s (each covered pixel once)', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, (_, k) => DYADIC[k % DYADIC.length]!));
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, textures, { scale, blend: 'ff' });
      const got = seamDoubleAdds(p), frame = executeFramePlanOnCpu(p).frame;
      let drawn = 0;
      for (let q = 0; q < frame.width * frame.height; q++) if (frame.data[q * 4] !== UI_SEAM_CLEAR) drawn++;
      expect(got, `${scale}x`).toMatchObject({ seam: 0, coplanar: 0, other: 0, passes: 1, triangles: 48 });
      expect(got.writes, `${scale}x: writes = the pixels the software draws`).toBe(drawn);
      expect(squares.length).toBe(24);
    }
  });

  it('a seam at invW 0.7 (f32 rounds down): every seam pixel counted as a seam double add, and nothing else, at 1, 2 and 4 -- the pixels the software draws twice', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, () => 0.7));
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, textures, { scale, blend: 'ff' });
      const got = seamDoubleAdds(p), frame = rasterizeUiDrawList(items, textures, { scale }).frame;
      const seams = squares.reduce((n, sq) => n + seamPixels(sq, scale).length, 0);
      let doubled = 0, drawn = 0;
      for (let q = 0; q < frame.width * frame.height; q++) {
        const v = frame.data[q * 4]!;
        if (v === twice) doubled++;
        if (v !== UI_SEAM_CLEAR) drawn++;
      }
      expect(once).toBe(70);
      expect(got, `${scale}x`).toMatchObject({ seam: seams, coplanar: 0, other: 0 });
      expect(doubled, `${scale}x: the software's doubled pixels`).toBe(seams);
      expect(got.writes, `${scale}x: writes = drawn pixels + the second adds`).toBe(drawn + seams);
    }
  });

  it('coplanar faces (GM-08\'s roller finding): the same face drawn twice at an invW f32 cannot hold counts as coplanar, pixel for pixel the software\'s doubled ones', () => {
    const tri = (x: number, invW: number): UiModelTriangle => ({ node: 'n', texture: null, cull: false,
      a: { x, y: 0.3, invW, u: 0, v: 0, rgba: [60, 60, 60, 128] }, b: { x: x - 7.7, y: 29.1, invW: invW * 1.37, u: 0, v: 0, rgba: [60, 60, 60, 128] },
      c: { x: x + 23.3, y: 31.9, invW: invW * 0.71, u: 0, v: 0, rgba: [60, 60, 60, 128] } });
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [10, 10, 10] }, { kind: 'sprite', node: 'add', texture: 'a.tif', x0: 0, y0: 0, x1: 1, y1: 1, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, 0], clip: null },
      { kind: 'models', triangles: [tri(20.4, 0.0170164), tri(20.4, 0.0170164)] }];
    const textures: UiTextures = (n) => (n === 'a.tif' ? { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]), blend: 'additive' } : null);
    const frame = rasterizeUiDrawList(items, textures, {}).frame;
    let doubled = 0;
    for (let i = 0; i < frame.data.length; i += 4) if (frame.data[i] === 130) doubled++;
    const got = seamDoubleAdds(planFrame(items, textures, { blend: 'exact' }));
    expect(doubled).toBeGreaterThan(0);
    expect(got).toMatchObject({ seam: 0, coplanar: doubled, other: 0 });
  });

  it('the model cases (GM-03): 0 double adds at 1, 2 and 4 (case 3\'s tie is equal in f64 too: the first wins)', () => {
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) {
      const { items, textures, options } = caseRasterInputs(c, scale, 'opaque');
      const got = seamDoubleAdds(planFrame(items, textures, { scale: options.scale, blend: 'ff' }));
      expect(got.seam + got.coplanar + got.other, `${c.key}@${scale}x`).toBe(0);
    }
  });
});
