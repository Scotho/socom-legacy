import { describe, expect, it } from 'vitest';
import type { UiDrawItem } from '@s2u/ui';
import * as plan from '../src/uiFramePlan';
import type { UiBitmap, UiTextures } from '../src/uiCompositorView';
import { columnAxis, rowAxis } from '../src/uiRasterRules';
import { UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, caseRasterInputs, caseRunKey } from './uiRasterCases';

// GM-32 (plan 2026-11-01-gpu-menus, row GM-32; product track, a cost): the planner keeps each quad's column and row
// entries from one plan to the next (`AxisMemo`) and copies them in where every input that decides them is the same bit
// for bit -- the T4 profile's `addQuad` / `rowAxis` / `columnAxis` / `wrapIndex` over the 4x cold switch. The plans must
// be byte for byte as before: `uiFramePlanStable.test.ts` pins every GM-03 plan at GM-29's base; this holds the warm plan
// equal to the cold one on every case, and a near miss (one ulp, the other axis, another texture size) never shares a run.
// Unit test: no disc, no browser. The memo's counts are read through the module object (the RED's counts).

const counts = (): { hits: number; misses: number; runs: number } =>
  ((plan as Record<string, unknown>).uiFramePlanAxisMemoCounts as () => { hits: number; misses: number; runs: number })();
const bytes = (a: Float64Array): Buffer => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
/** Two empty plans: both generations dropped, so the next plan is cold. */
const cold = (): void => { plan.planFrame([], () => null); plan.planFrame([], () => null); };

const bitmap = (w: number, h: number): UiBitmap => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const sprite = (u0: number, v0: number, texture = 'a.tif'): UiDrawItem =>
  ({ kind: 'sprite', node: 's', texture, x0: 10, y0: 20, x1: 74, y1: 52, u0, v0, u1: u0 + 0.75, v1: v0 + 0.5, rgba: [128, 128, 128, 128], clip: null }) as UiDrawItem;

/** The axis the planner writes for one textured quad, from the axis functions themselves (no planner, no memo). */
function reference(p: plan.UiFramePlan): Float64Array {
  const out: number[] = [];
  const left = new Float64Array(4096), right = new Float64Array(4096), fraction = new Float64Array(4096), r = { top: 0, bottom: 0, fy: 0, iy: 0 };
  for (const q of p.quads) {
    if (q.texture === null) continue;
    const t = p.textures[q.texture]!, cols = q.rect.xe - q.rect.xs;
    columnAxis(q.rect.xs, q.rect.xe, q.x0, q.x1 - q.x0, q.uv[0], q.uv[2] - q.uv[0], t.width, false, left, right, fraction);
    for (let k = 0; k < cols; k++) out.push(left[k]! / 4, right[k]! / 4, fraction[k]!, 1 - fraction[k]!);
    for (let y = q.rect.ys; y < q.rect.ye; y++) {
      rowAxis(y, q.y0, q.y1 - q.y0, q.uv[1], q.uv[3] - q.uv[1], t.height, t.width, false, r);
      out.push(r.top / (t.width * 4), r.bottom / (t.width * 4), r.fy, r.iy);
    }
  }
  return new Float64Array(out);
}

describe('GM-32: the planner\'s axis memo -- plans byte for byte as before', () => {
  it('every GM-03 case at 1, 2 and 4, opaque and transparent, ff and exact: the warm plan (all hits) is the cold plan, hash and axis bytes', () => {
    let checked = 0;
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of ['ff', 'exact'] as const) {
      const { items, textures, options } = caseRasterInputs(c, scale, mode);
      const { quadCache: _cache, ...rest } = options;
      cold();
      const first = plan.planFrame(items, textures, { ...rest, blend });
      const before = counts();
      const second = plan.planFrame(items, textures, { ...rest, blend });
      const after = counts();
      const key = `${caseRunKey(c, scale, mode)} ${blend}`;
      expect(second.hash, key).toBe(first.hash);
      expect(bytes(second.axis).equals(bytes(first.axis)), key).toBe(true);
      expect(bytes(first.axis).equals(bytes(reference(first))), `${key}: the axis functions' own entries`).toBe(true);
      expect(second.quads.map((q) => q.axis)).toEqual(first.quads.map((q) => q.axis));
      const textured = second.quads.filter((q) => q.texture !== null).length;
      expect(after.misses - before.misses, `${key}: the warm plan computes nothing`).toBe(0);
      expect(after.hits - before.hits, key).toBe(textured * 2);
      checked++;
    }
    expect(checked).toBe(UI_RASTER_CASES.length * UI_RASTER_CASE_SCALES.length * UI_RASTER_CASE_MODES.length * 2);
  });

  it('a near miss never shares a run: u0 one ulp apart, v0 one ulp apart, another texture size -- each plan is its own axis functions\' entries', () => {
    const a = bitmap(64, 32), b = bitmap(128, 32);
    const textures: UiTextures = (n) => (n === 'a.tif' ? a : n === 'b.tif' ? b : null);
    const up = (x: number): number => { const f = new Float64Array([x]), u = new BigInt64Array(f.buffer); u[0]! += 1n; return f[0]!; };
    cold();
    for (const scale of [1, 2, 4]) {
      const frames: UiDrawItem[][] = [[sprite(0.125, 0.25)], [sprite(up(0.125), 0.25)], [sprite(0.125, up(0.25))], [sprite(0.125, 0.25, 'b.tif')], [sprite(0.125, 0.25)]];
      for (const items of frames) {
        const p = plan.planFrame(items, textures, { scale });
        expect(bytes(p.axis).equals(bytes(reference(p))), `${scale}x ${JSON.stringify(items[0])}`).toBe(true);
      }
    }
  });

  it('two generations: a run the plan before used is found; one neither it nor this plan used is dropped (planned again: a miss)', () => {
    const a = bitmap(64, 32);
    const textures: UiTextures = (n) => (n === 'a.tif' ? a : null);
    cold();
    plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 2 });
    let c0 = counts();
    plan.planFrame([sprite(0.25, 0.5)], textures, { scale: 2 });             // its column misses, its row (same v) hits
    let c1 = counts();
    expect([c1.hits - c0.hits, c1.misses - c0.misses]).toEqual([1, 1]);
    c0 = counts();
    plan.planFrame([sprite(0.25, 0.5)], textures, { scale: 2 });             // the plan before used both: found
    c1 = counts();
    expect([c1.hits - c0.hits, c1.misses - c0.misses]).toEqual([2, 0]);
    c0 = counts();
    plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 2 });              // its column was last used three plans ago: dropped
    c1 = counts();
    expect([c1.hits - c0.hits, c1.misses - c0.misses]).toEqual([1, 1]);
    cold();
    c0 = counts();
    plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 2 });
    c1 = counts();
    expect([c1.hits - c0.hits, c1.misses - c0.misses]).toEqual([0, 2]);
  });
});

describe('GM-32 review F2: the memo let go when the GPU front end is released (a match) and at the page\'s stop', () => {
  const a = bitmap(64, 32);
  const textures: UiTextures = (n) => (n === 'a.tif' ? a : null);
  const warm = (): void => { plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 4 }); expect(counts().runs).toBeGreaterThan(0); };
  const release = (): void => ((plan as Record<string, unknown>).releaseUiFramePlanMemo as () => void)();

  it('releaseUiFramePlanMemo holds nothing after; the next plan is planned cold, its axis the same bytes', () => {
    warm();
    const before = plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 4 });
    release();
    expect(counts().runs).toBe(0);
    const c0 = counts();
    const after = plan.planFrame([sprite(0.5, 0.5)], textures, { scale: 4 });
    const c1 = counts();
    expect([c1.hits - c0.hits, c1.misses - c0.misses]).toEqual([0, 2]);
    expect(bytes(after.axis).equals(bytes(before.axis))).toBe(true);
  });

  it('the front end\'s GPU surface: its release (the match\'s leave) and its dispose (the page\'s stop) let the memo go', async () => {
    const { UiGpuSurfacePresenter } = await import('../src/uiGpuPresenter');
    const { fakeGl } = await import('./uiGpuFakeGl');
    const make = () => new UiGpuSurfacePresenter({
      canvas: fakeGl().canvas as never, software: {} as never, transparent: false, surface: 'front',
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    });
    warm();
    make().release();
    expect(counts().runs).toBe(0);
    warm();
    make().dispose();
    expect(counts().runs).toBe(0);
  });
});
