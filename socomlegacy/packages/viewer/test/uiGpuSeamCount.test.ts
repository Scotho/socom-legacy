import { describe, expect, it } from 'vitest';
import type { UiDrawItem, UiModelTriangle } from '@s2u/ui';
import { rasterizeUiDrawList, type UiTextures } from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { seamDoubleAdds } from './uiGpuSeamCount';
import { UI_RASTER_CASES, UI_RASTER_CASE_SCALES, UI_SEAM_CLEAR, UI_SEAM_TEXEL, caseRasterInputs, seamPixels, seamSquares } from './uiRasterCases';

/**
 * R1's instrument (`uiGpuSeamCount.ts`), held to the software's and the twin's own frames before it counts the corpus
 * (`uiGpuModelsCorpus.disc.test.ts`). GM-15c counted the software's double adds; GM-15d (the plan's Log, R1 resolved by
 * (a): the GS's top-left fill rule and `TEST_1` GEQUAL on an f32 store, in the software, the twin and the GPU) redefined
 * it: the ties on which the software and the twin decide differently. A test instrument: unit test only, nothing the
 * port draws changes.
 */

const once = UI_SEAM_CLEAR + UI_SEAM_TEXEL, twice = UI_SEAM_CLEAR + 2 * UI_SEAM_TEXEL;
const DYADIC = [0.5, 0.75, 1, 1.5, 2, 0.375];
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

describe('GM-15d: R1, the ties on which the software and the twin disagree', () => {
  it('a seam at dyadic depths: no disagreement, every seam pixel a tie the top-left rule decides, each covered pixel written once, at 1, 2 and 4', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, (_, k) => DYADIC[k % DYADIC.length]!));
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, textures, { scale, blend: 'ff' });
      const got = seamDoubleAdds(p), frame = executeFramePlanOnCpu(p).frame;
      let drawn = 0;
      for (let q = 0; q < frame.width * frame.height; q++) if (frame.data[q * 4] !== UI_SEAM_CLEAR) drawn++;
      const seams = squares.reduce((n, sq) => n + seamPixels(sq, scale).length, 0);
      expect(got, `${scale}x`).toMatchObject({ seam: 0, coplanar: 0, other: 0, depthTies: 0, passes: 1, triangles: 48 });
      expect(got.edgeTies, `${scale}x: at least both triangles' evaluations of every seam pixel`).toBeGreaterThanOrEqual(2 * seams);
      expect(got.writes, `${scale}x: writes = the pixels the software draws (each once)`).toBe(drawn);
    }
  });

  it('a seam at invW 0.7 (f32 rounds down): no disagreement, every seam pixel drawn once by the software and the twin, at 1, 2 and 4 -- the double add GM-15c counted here is gone', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, () => 0.7));
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, textures, { scale, blend: 'ff' });
      const got = seamDoubleAdds(p), frame = rasterizeUiDrawList(items, textures, { scale }).frame;
      let doubled = 0, drawn = 0;
      for (let q = 0; q < frame.width * frame.height; q++) {
        const v = frame.data[q * 4]!;
        if (v === twice) doubled++;
        if (v !== UI_SEAM_CLEAR) drawn++;
      }
      expect(once).toBe(70);
      expect(got, `${scale}x`).toMatchObject({ seam: 0, coplanar: 0, other: 0, depthTies: 0 });
      expect(doubled, `${scale}x: the software's doubled pixels (GM-15c: every seam pixel, ${squares.reduce((n, sq) => n + seamPixels(sq, scale).length, 0)})`).toBe(0);
      expect(got.writes, `${scale}x: writes = drawn pixels`).toBe(drawn);
      expect(same(executeFramePlanOnTwin(p).frame.data, frame.data), `${scale}x: the twin's frame is the software's`).toBe(0);
    }
  });

  it('coplanar faces (GM-08\'s roller finding): the second face is a depth tie at every pixel it writes, both sides draw it (GEQUAL), no disagreement -- every covered pixel doubled', () => {
    const tri = (x: number, invW: number): UiModelTriangle => ({ node: 'n', texture: null, cull: false,
      a: { x, y: 0.3, invW, u: 0, v: 0, rgba: [60, 60, 60, 128] }, b: { x: x - 7.7, y: 29.1, invW: invW * 1.37, u: 0, v: 0, rgba: [60, 60, 60, 128] },
      c: { x: x + 23.3, y: 31.9, invW: invW * 0.71, u: 0, v: 0, rgba: [60, 60, 60, 128] } });
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [10, 10, 10] }, { kind: 'sprite', node: 'add', texture: 'a.tif', x0: 0, y0: 0, x1: 1, y1: 1, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, 0], clip: null },
      { kind: 'models', triangles: [tri(20.4, 0.0170164), tri(20.4, 0.0170164)] }];
    const textures: UiTextures = (n) => (n === 'a.tif' ? { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]), blend: 'additive' } : null);
    const frame = rasterizeUiDrawList(items, textures, {}).frame;
    let doubled = 0, single = 0;
    for (let i = 0; i < frame.data.length; i += 4) { if (frame.data[i] === 130) doubled++; else if (frame.data[i] === 70) single++; }
    const got = seamDoubleAdds(planFrame(items, textures, { blend: 'exact' }));
    expect(doubled).toBeGreaterThan(0);
    expect(single, 'no pixel the first face alone covers').toBe(0);
    expect(got).toMatchObject({ seam: 0, coplanar: 0, other: 0, depthTies: doubled, writes: 2 * doubled });
  });

  it('a permuted coplanar face (the same face listed b, c, a): no disagreement, and the software\'s frame is the twin\'s byte for byte -- one f32 arithmetic for the edges and the depth (GM-15d\'s disc fold)', () => {
    // The dev-disc run at 4d62d9c02 found the ARMORY's ties decided differently (seam 1,479 / coplanar 53 / other 410,
    // every one a depth tie): the software computed its edge functions, weights and invW in f64 and rounded only the
    // stored depth, the twin rounds every operation to f32 (T2-T5), so two depths an ulp apart on one side were equal
    // on the other. A face listed in another vertex order sums its depth in another order: f32 per operation (now both
    // sides) can land it on the first face's depth or an ulp off it, the same way on both.
    let ties = 0;
    for (let k = 0; k < 40; k++) {
      const v = (x: number, y: number, invW: number) => ({ x, y, invW, u: 0, v: 0, rgba: [60, 60, 60, 128] as [number, number, number, number] });
      const A = v(3.1 + k * 0.37, 1.7, 0.0137 + k * 1e-4), B = v(1.3, 27.9 + k * 0.11, 0.0291), C = v(29.7, 25.1, 0.0213 + k * 3e-5);
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [
        { node: 'n', texture: null, cull: false, a: A, b: B, c: C }, { node: 'n', texture: null, cull: false, a: B, b: C, c: A }] }];
      for (const scale of UI_RASTER_CASE_SCALES) {
        const p = planFrame(items, () => null, { scale, blend: 'exact' });
        const got = seamDoubleAdds(p);
        ties += got.depthTies;
        expect(got.seam + got.coplanar + got.other, `k ${k} ${scale}x`).toBe(0);
        expect(same(executeFramePlanOnTwin(p).frame.data, rasterizeUiDrawList(items, () => null, { scale }).frame.data), `k ${k} ${scale}x: twin = software`).toBe(0);
      }
    }
    expect(ties, 'the sweep meets depth ties').toBeGreaterThan(0);
  });

  it('the model cases (GM-03): no disagreement at 1, 2 and 4 (case 3\'s tie: the later wins on both sides)', () => {
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) {
      const { items, textures, options } = caseRasterInputs(c, scale, 'opaque');
      const got = seamDoubleAdds(planFrame(items, textures, { scale: options.scale, blend: 'ff' }));
      expect(got.seam + got.coplanar + got.other, `${c.key}@${scale}x`).toBe(0);
    }
  });
});
