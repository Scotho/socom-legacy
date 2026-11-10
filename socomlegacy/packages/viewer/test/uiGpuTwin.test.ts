import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle, UiModelVertex } from '@s2u/ui';
import { rasterizeUiDrawList, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
import { UI_GPU_MODEL_DEPTH_FLOOR, planFrame, type UiFramePlan, type UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_MODEL_DEPTH_FORMAT_READING } from '../src/uiRasterRules';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import {
  S10_frameAlpha, S11_additive, S11_source, S11ff_source, S12_store, S12ff_unorm, S6_horizontal, S7_vertical, S8_modulate, S9_modulateAlpha,
  T2_edge, T2_third, T2_weight, T3_inside, T4_invW, T5_depthPasses, T6_perspective, T8_lerp, executeFramePlanOnTwin, twinStats, type UiGpuTwinStats,
} from '../src/uiGpuTwin';
import {
  UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, UI_RASTER_SOFTWARE_SHA256, UI_SEAM_CLEAR, UI_SEAM_TEXEL, caseRasterInputs, caseRunKey,
  seamPixels, seamSquares, type UiRasterCase, type UiRasterMode, type UiRasterScale,
} from './uiRasterCases';

// GM-08 (plan 2026-11-01-gpu-menus, GM-08's row; GM.R4, GM.R5, GM.R7; research 380 §1, §2): the f32 twin of the GPU
// drawer (`uiGpuTwin.ts`). It runs a `UiFramePlan` as the shaders and the fixed-function blender will -- every operation
// rounded to f32 (`Math.fround`), in the software's operand order, step-tagged S1-S13 (quads) and T1-T12 (models) --
// and is held here to: the exact class 0 bytes against the software (`rasterizeUiDrawList`, GM-03's pinned SHA-256);
// `layered === sequential` byte for byte; the B statistics per case at 1, 2 and 4 under `ff` and `exact`, recorded and
// pinned (a drift guard on the twin's arithmetic, not a tolerance: GM-11b/GM-27 set the tolerance). Unit tests: no disc,
// no browser, no GPU.

const sha = (f: Rgba): string => createHash('sha256').update(f.data).digest('hex');
const f = Math.fround;
const BLENDS: readonly UiPlanBlendMode[] = ['ff', 'exact'];

function plan(c: UiRasterCase, scale: UiRasterScale, mode: UiRasterMode, blend: UiPlanBlendMode): { plan: UiFramePlan; want: Rgba } {
  const { items, textures, options } = caseRasterInputs(c, scale, mode);
  const want = rasterizeUiDrawList(items, textures, options).frame;
  const { quadCache: _cache, ...rest } = options;
  return { plan: planFrame(items, textures, { ...rest, blend }), want };
}

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

/** Per case and blend table: the worst channel |Δ| over its runs (1/2/4 x opaque/transparent) and the pixels at |Δ| >= 1, 2, 3. */
type CaseB = { max: number; ge1: number; ge2: number; ge3: number };
const fold = (acc: CaseB, s: UiGpuTwinStats): CaseB => ({
  max: Math.max(acc.max, ...s.maxAbs), ge1: acc.ge1 + s.atLeast[0], ge2: acc.ge2 + s.atLeast[1], ge3: acc.ge3 + s.atLeast[2],
});

/**
 * The twin's B statistics on the case table, as the twin at GM-08's commit gives them (a drift pin: a change to the
 * twin's arithmetic or to a plan changes a row and must say why). `max` is the worst channel |Δ| over the case's
 * twelve runs (scales 1, 2, 4; opaque, transparent); `ge1..3` the pixels at |Δ| >= 1, 2, 3 summed over them.
 */
const TWIN_B: Record<string, Record<UiPlanBlendMode, CaseB>> = {
  '1': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '2': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '3': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '4': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '5': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '6': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '7': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '8': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '9': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '10': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '11': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '12': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '14': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '15': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '16': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '17': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '18': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '20': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '13.cold': { ff: { max: 1, ge1: 116, ge2: 0, ge3: 0 }, exact: { max: 1, ge1: 112, ge2: 0, ge3: 0 } },
  '13.warm': { ff: { max: 1, ge1: 582, ge2: 0, ge3: 0 }, exact: { max: 1, ge1: 580, ge2: 0, ge3: 0 } },
  '13.hot': { ff: { max: 1, ge1: 582, ge2: 0, ge3: 0 }, exact: { max: 1, ge1: 580, ge2: 0, ge3: 0 } },
  '19.a0': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '19.a64': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '19.a128': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '19.a192': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
  '19.a255': { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } },
};

describe('GM-08: the f32 twin on every case of the table, at 1, 2 and 4, opaque and transparent, under ff and exact', () => {
  const got: Record<string, Record<UiPlanBlendMode, CaseB>> = {};
  for (const c of UI_RASTER_CASES) {
    it(`case ${c.key}: exact class 0 bytes; layered === sequential; B recorded`, () => {
      const row = { ff: { max: 0, ge1: 0, ge2: 0, ge3: 0 }, exact: { max: 0, ge1: 0, ge2: 0, ge3: 0 } };
      for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
        const k = `${caseRunKey(c, scale, mode)} ${blend}`;
        const { plan: p, want } = plan(c, scale, mode, blend);
        expect(sha(want), `${k}: the reference is GM-03's pinned frame`).toBe(UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, scale, mode)]);
        expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
        const layered = executeFramePlanOnTwin(p);
        const sequential = executeFramePlanOnTwin(p, { sequential: true });
        expect(layered.software, k).toBe(false);
        expect(layered.undrawn, `${k} undrawn`).toEqual(c.undrawn ?? []);
        expect(same(layered.frame.data, sequential.frame.data), `${k}: layered === sequential (GM.R7)`).toBe(0);
        const st = twinStats(layered.frame, want, layered.exact);
        expect(st.exactDiffering, `${k}: exact-class pixels differing (of ${st.exactPixels})`).toBe(0);
        row[blend] = fold(row[blend], st);
      }
      got[c.key] = row;
    }, 120_000);
  }
  it('the B statistics per case equal the pinned table (TWIN_B)', () => {
    // eslint-disable-next-line no-console
    console.log(`GM-08 twin B per case (max |Δ|, pixels at >= 1/2/3 over 12 runs):\n${Object.entries(got).map(([k, r]) =>
      `  ${k.padEnd(6)} ff ${r.ff.max}/${r.ff.ge1}/${r.ff.ge2}/${r.ff.ge3}  exact ${r.exact.max}/${r.exact.ge1}/${r.exact.ge2}/${r.exact.ge3}`).join('\n')}`);
    expect(got).toEqual(TWIN_B);
  });
});

describe('GM-08: the exact class is a real class (not empty, not everything)', () => {
  it('case 20 (the fade ramp, P13, programmable at every scale) is wholly in the class and equal byte for byte', () => {
    const c = UI_RASTER_CASES.find((x) => x.key === '20')!;
    for (const scale of UI_RASTER_CASE_SCALES) for (const blend of BLENDS) {
      const { plan: p, want } = plan(c, scale, 'opaque', blend);
      const t = executeFramePlanOnTwin(p);
      expect(t.exact.every((v) => v === 1), `20@${scale}x ${blend}: every pixel exact`).toBe(true);
      expect(same(t.frame.data, want.data), `20@${scale}x ${blend}`).toBe(0);
    }
  });
  it('case 6 (bilinear, P6) leaves its textured pixels out of the class; the clear around them stays in', () => {
    const c = UI_RASTER_CASES.find((x) => x.key === '6')!;
    const { plan: p } = plan(c, 1, 'opaque', 'exact');
    const t = executeFramePlanOnTwin(p);
    const q = p.quads.find((x) => x.texture !== null)!;
    const W = p.target.width;
    expect(t.exact[q.rect.ys * W + q.rect.xs], 'a textured pixel').toBe(0);
    expect(t.exact[(p.target.height - 1) * W + (W - 1)], 'the far corner (cleared)').toBe(1);
  });
  it('a model pass leaves its triangles\' boxes out of the class (models are B, research 380 M2-M5; GM-06b review F1 owed)', () => {
    const c = UI_RASTER_CASES.find((x) => x.key === '3')!;
    const { plan: p } = plan(c, 1, 'opaque', 'exact');
    const t = executeFramePlanOnTwin(p);
    expect(t.exact[1 * p.target.width + 1]).toBe(0);
    expect(t.exact[100 * p.target.width + 100]).toBe(1);
  });
});

describe('GM-08: the step functions keep the software\'s operand order (a witness for each: the other order differs)', () => {
  // Each witness is searched over a fixed grid: the twin's form against the pinned expression, and a named alternative
  // that a GPU author might write, which must give another f32 value on at least one input -- so a swap is caught here
  // (and by `uiGpuShaderTwin.test.ts`'s source pin), not only where a case happens to round across a byte.
  const fracs = Array.from({ length: 64 }, (_, i) => f(((i * 0.6180339887) % 1)));
  function witness(name: string, ours: (a: number, b: number, w: number) => number, pinned: (a: number, b: number, w: number) => number,
    other: (a: number, b: number, w: number) => number): void {
    let found = 0;
    for (let a = 0; a < 256; a += 7) for (let b = 0; b < 256; b += 11) for (const w of fracs) {
      expect(ours(a, b, w), `${name}(${a}, ${b}, ${w})`).toBe(pinned(a, b, w));
      if (ours(a, b, w) !== other(a, b, w)) found++;
    }
    expect(found, `${name}: inputs where the alternative order differs`).toBeGreaterThan(0);
  }
  it('S6: d[l] ix + d[r] fx, not the lerp d[l] + (d[r] - d[l]) fx', () => {
    witness('S6', (l, r, fx) => S6_horizontal(l, r, f(1 - fx), fx), (l, r, fx) => f(f(l * f(1 - fx)) + f(r * fx)), (l, r, fx) => f(l + f(f(r - l) * fx)));
  });
  it('S7: top iy + lower fy, not mix(top, lower, fy)', () => {
    witness('S7', (t, b, fy) => S7_vertical(f(t + fy), f(b + fy), f(1 - fy), fy), (t, b, fy) => f(f(f(t + fy) * f(1 - fy)) + f(f(b + fy) * fy)),
      (t, b, fy) => f(f(t + fy) + f(f(f(b + fy) - f(t + fy)) * fy)));
  });
  it('S9: (ta / 255) alpha, not (ta alpha) / 255', () => {
    witness('S9', (ta, _b, w) => S9_modulateAlpha(f(ta + w), f(w * 2)), (ta, _b, w) => f(f(f(ta + w) / 255) * f(w * 2)), (ta, _b, w) => f(f(f(ta + w) * f(w * 2)) / 255));
  });
  it('S10: A + (255 - A) min(1, a)', () => {
    witness('S10', (A, _b, a) => S10_frameAlpha(A, a), (A, _b, a) => f(A + f(f(255 - A) * Math.min(1, a))), (A, _b, a) => f(f(A * f(1 - a)) + f(255 * a)));
  });
  it('S11: source C + (c - C) a, not C (1 - a) + c a; additive C + c a', () => {
    witness('S11', (C, c, a) => S11_source(C, f(c + a), a), (C, c, a) => f(C + f(f(f(c + a) - C) * a)), (C, c, a) => f(f(C * f(1 - a)) + f(f(c + a) * a)));
    for (let C = 0; C < 256; C += 5) for (const a of fracs) expect(S11_additive(C, 77.25, a)).toBe(f(C + f(77.25 * a)));
  });
  it('T8: sample()\'s own lerp form (a(1 - fx) + b fx)(1 - fy) + (e(1 - fx) + g fx) fy', () => {
    witness('T8', (a, b, fx) => T8_lerp(a, b, fx), (a, b, fx) => f(f(a * f(1 - fx)) + f(b * fx)), (a, b, fx) => f(a + f(f(b - a) * fx)));
  });
  it('T2/T4/T6: the edge function, invW and the perspective weights in drawModels\' order', () => {
    expect(T2_weight(8, 0, 0, 8, 3, 2, f(1 / -64))).toBe(f(f(f(f(8 - 3) * f(8 - 2)) - f(f(0 - 3) * f(0 - 2))) * f(1 / -64)));
    expect(T4_invW(0.25, 0.5, 0.25, 0.1, 0.7, 0.3)).toBe(f(f(f(0.25 * 0.1) + f(0.5 * 0.7)) + f(0.25 * 0.3)));
    expect(T6_perspective(f(0.3), f(0.7), f(0.45))).toBe(f(f(0.3) * f(f(0.7) / f(0.45))));
  });
  it('S12: the store is roundEven(clamp(v, 0, 255)), NaN to 0 -- the Uint8ClampedArray store (GS_BLEND_ROUNDING_READING)', () => {
    const u8 = new Uint8ClampedArray(1);
    for (const v of [-1, 0, 0.5, 1.5, 2.5, 127.5, 128.5, 254.5, 254.49, 255, 300, NaN, Infinity, -Infinity, 3.7, 77.5000001]) {
      u8[0] = v;
      expect(S12_store(v), String(v)).toBe(u8[0]);
    }
  });
  it('S11ff / S12ff: the fixed-function blender\'s model (UI_GPU_TWIN_UNORM_ADAPTATION): unorm in [0, 1], one rounding to the byte', () => {
    expect(S12ff_unorm(S11ff_source(f(200 / 255), 1, 37))).toBe(200);   // a = 1: the source
    expect(S12ff_unorm(S11ff_source(f(200 / 255), 0, 37))).toBe(37);    // a = 0: the destination
    expect(S12ff_unorm(2)).toBe(255);
    expect(S12ff_unorm(-1)).toBe(0);
  });
});

describe('GM-07 review F2: the two mutations the corpus did not catch', () => {
  /**
   * Overlapping constant-depth triangles on dyadic numbers (integer corners, legs a power of two, invW in {0.5, 1, 2}),
   * so the software's f64 and the twin's f32 both land on exact ties: the first drawn must win every tie (M3,
   * `UI_MODEL_DEPTH_FORMAT_READING`). The executor and the twin are compared with the software over the whole frame;
   * the ties are counted, so the case is not vacuous.
   */
  function tieList(seed: number): { items: UiDrawItem[]; textures: UiTextures; ties: number } {
    let s = seed >>> 0;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const pick = <T>(v: readonly T[]): T => v[Math.floor(rnd() * v.length)]!;
    const v = (x: number, y: number, invW: number, rgba: [number, number, number, number]): UiModelVertex => ({ x, y, invW, u: 0, v: 0, rgba });
    const triangles: UiModelTriangle[] = [];
    for (let k = 0; k < 24; k++) {
      const x = Math.floor(rnd() * 40), y = Math.floor(rnd() * 40), n = pick([8, 16, 32]), w = pick([0.5, 1, 2]);
      const rgba: [number, number, number, number] = [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256), 128];
      // Counter-clockwise on the frame (front faces): the right angle at one of four corners.
      const corners = pick([
        [v(x, y, w, rgba), v(x, y + n, w, rgba), v(x + n, y, w, rgba)],
        [v(x + n, y, w, rgba), v(x, y + n, w, rgba), v(x + n, y + n, w, rgba)],
        [v(x, y, w, rgba), v(x, y + n, w, rgba), v(x + n, y + n, w, rgba)],
        [v(x, y, w, rgba), v(x + n, y + n, w, rgba), v(x + n, y, w, rgba)],
      ]);
      triangles.push({ node: `t${k}`, texture: null, cull: true, a: corners[0]!, b: corners[1]!, c: corners[2]! });
    }
    // Count the ties by hand in f64: a later triangle covering a pixel first written at its own invW.
    const first = new Map<number, number>();
    let ties = 0;
    for (const t of triangles) {
      const { a, b, c } = t;
      const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (area >= 0) continue;
      for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
        const w0 = ((b.x - x) * (c.y - y) - (c.x - x) * (b.y - y)) / area, w1 = ((c.x - x) * (a.y - y) - (a.x - x) * (c.y - y)) / area;
        if (w0 < 0 || w1 < 0 || 1 - w0 - w1 < 0) continue;
        const k = y * 1000 + x, d = first.get(k);
        if (d === undefined) first.set(k, a.invW); else if (d === a.invW) ties++; else if (a.invW > d) first.set(k, a.invW);
      }
    }
    return { items: [{ kind: 'clear', rgb: [20, 40, 60] }, { kind: 'models', triangles }], textures: () => null, ties };
  }
  for (const seed of [1, 2, 3, 4]) {
    it(`depth ties (<= kept, not <): seed ${seed}, executor and twin equal the software at 1, 2 and 4`, () => {
      const { items, textures, ties } = tieList(seed);
      expect(ties, 'tied pixels in the list').toBeGreaterThan(0);
      for (const scale of [1, 2, 4]) for (const blend of BLENDS) {
        const want = rasterizeUiDrawList(items, textures, { scale }).frame;
        const p = planFrame(items, textures, { scale, blend });
        expect(p.verdict, p.why.join('; ')).toBe('gpu');
        expect(same(executeFramePlanOnCpu(p).frame.data, want.data), `executor ${scale}x ${blend}`).toBe(0);
        expect(same(executeFramePlanOnTwin(p).frame.data, want.data), `twin ${scale}x ${blend}`).toBe(0);
      }
    });
  }
  it('GM-15d: coplanar triangles at an invW f32 cannot hold -- the second face adds at every pixel both write, on the software and the twin alike (GEQUAL, f32 against f32)', () => {
    // dlgMenu's roller draws each label's `_on` and `_off` faces on the same geometry, additive (the corpus, GM-08's
    // Log). Before GM-15d the software tested its f64 invW against its f32 store (strictly greater) and doubled about half
    // of the pixels, a speckle, while the twin doubled none: R1's "coplanar" class, a port artefact. Now both compare the
    // f32 depth with the f32 store under GEQUAL (TEST_1 ZTST GEQUAL, research 185 §3.1): identical vertices give
    // identical depths, so the second face passes everywhere it covers, as the GS would draw it (the R1 report, §1.3).
    const tri = (x: number, invW: number): UiModelTriangle => ({ node: 'n', texture: null, cull: false,
      a: { x, y: 0.3, invW, u: 0, v: 0, rgba: [60, 60, 60, 128] }, b: { x: x - 7.7, y: 29.1, invW: invW * 1.37, u: 0, v: 0, rgba: [60, 60, 60, 128] },
      c: { x: x + 23.3, y: 31.9, invW: invW * 0.71, u: 0, v: 0, rgba: [60, 60, 60, 128] } });
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [10, 10, 10] }, { kind: 'sprite', node: 'add', texture: 'a.tif', x0: 0, y0: 0, x1: 1, y1: 1, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, 0], clip: null },
      { kind: 'models', triangles: [tri(20.4, 0.0170164), tri(20.4, 0.0170164)] }];
    const textures: UiTextures = (n) => (n === 'a.tif' ? { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]), blend: 'additive' } : null);
    const want = rasterizeUiDrawList(items, textures, {}).frame;
    const p = planFrame(items, textures, { blend: 'exact' });
    expect(same(executeFramePlanOnCpu(p).frame.data, want.data), 'the executor is the software').toBe(0);
    const t = executeFramePlanOnTwin(p);
    let doubled = 0, single = 0;
    for (let i = 0; i < want.data.length; i += 4) { if (want.data[i] === 130) doubled++; else if (want.data[i] === 70) single++; }
    expect(doubled, 'pixels the software draws twice').toBeGreaterThan(0);
    expect(single, 'pixels it draws once: none, every covered pixel takes both faces').toBe(0);
    expect(same(t.frame.data, want.data), 'the twin is the software, every pixel').toBe(0);
  });
  it('T5: a GEQUAL test on f32 depth (GM-15d) -- an equal depth passes (the later drawn wins); case 3 shows the second triangle', () => {
    expect(T5_depthPasses(f(0.5), f(0.5))).toBe(true);
    expect(T5_depthPasses(f(0.5), f(0.75))).toBe(false);
    expect(T5_depthPasses(f(0.5), 0)).toBe(true);
    const c = UI_RASTER_CASES.find((x) => x.key === '3')!;
    for (const scale of UI_RASTER_CASE_SCALES) {
      const { plan: p } = plan(c, scale, 'opaque', 'exact');
      const t = executeFramePlanOnTwin(p).frame.data, o = (1 * scale * p.target.width + 1 * scale) * 4;
      expect([...t.subarray(o, o + 4)], `3@${scale}x`).toEqual([0, 128, 0, 255]);
    }
  });
  it('T3: the top-left rule (GM-15d) -- a pixel on an edge is the triangle\'s only on a left edge, or a top one, either winding', () => {
    // The corner (0,0) (0,8) (8,0), counter-clockwise on the frame (area < 0): x = 0 left, y = 0 top, the hypotenuse
    // x + y = 8 its right-bottom edge. The edges as `T2_edge` gives them for w0 (b c), w1 (c a), w2 (a b).
    const owns = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, x: number, y: number, s: number): boolean =>
      T3_inside(T2_edge(bx, by, cx, cy, x, y), T2_edge(cx, cy, ax, ay, x, y), T2_edge(ax, ay, bx, by, x, y), ax, ay, bx, by, cx, cy, s);
    for (const [x, y, want] of [[0, 0, true], [0, 4, true], [4, 0, true], [3, 3, true], [4, 4, false], [7, 1, false], [1, 7, false], [9, 0, false]] as const) {
      expect(owns(0, 0, 0, 8, 8, 0, x, y, -1), `ccw ${x},${y}`).toBe(want);
      expect(owns(0, 0, 8, 0, 0, 8, x, y, 1), `cw ${x},${y}`).toBe(want);
    }
    // The square's two halves share the diagonal: every point of it belongs to exactly one.
    for (let k = 0; k <= 8; k++) {
      const first = owns(0, 0, 0, 8, 8, 0, k, 8 - k, -1), second = owns(8, 0, 0, 8, 8, 8, k, 8 - k, -1);
      if (k > 0 && k < 8) expect([first, second], `diagonal ${k}`).toEqual([false, true]);
    }
  });
  it('the modulate as r (c / 128) for (r c) / 128 is an identity in IEEE arithmetic: no frame can catch it (said, not tested around)', () => {
    // Dividing by 128 = 2^7 is exact in binary floating point (no subnormal here), so fl(fl(r c) / 128) = fl(r c) 2^-7
    // = fl(r (c 2^-7)) = fl(r fl(c / 128)), in f64 and in f32 alike. The mutation GM-07 named is therefore equivalent:
    // shown here over every texel byte and a fractional sweep, both precisions. The twin keeps the software's spelling
    // (S8, `uiGpuShaderTwin.test.ts` pins it), so a shader written either way is equal.
    const colours = [0, 1, 64, 77.3, 127, 128, 129, 200, 255, 300, -20, 1e6];
    for (let t = 0; t < 256; t++) for (const c of colours) {
      expect((t * c) / 128, `f64 ${t} ${c}`).toBe(t * (c / 128));
      expect(f(f(t * f(c)) / 128), `f32 ${t} ${c}`).toBe(f(t * f(f(c) / 128)));
    }
    for (const w of [0.1, 0.33, 0.5001, 0.999]) for (let t = 0; t < 256; t += 3) for (const c of colours) {
      const tf = t + w;
      expect((tf * c) / 128).toBe(tf * (c / 128));
      expect(S8_modulate(f(tf), f(c))).toBe(Math.min(255, f(f(f(tf) * f(c)) / 128)));
    }
  });
});

describe('GM-08: seeded lists the cases do not reach (textured, fractional, blend changes, overlaps, non-finite)', () => {
  function fuzz(seed: number): { items: UiDrawItem[]; textures: UiTextures } {
    let s = seed >>> 0;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const pick = <T>(v: readonly T[]): T => v[Math.floor(rnd() * v.length)]!;
    const bitmap = (w: number, h: number, blend: UiBitmap['blend']): UiBitmap => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
      return blend ? { width: w, height: h, data, blend } : { width: w, height: h, data };
    };
    const bank: Record<string, UiBitmap> = { 'a.tif': bitmap(5, 3, 'source'), 'b.tif': bitmap(7, 9, 'additive'), 'c.tif': bitmap(16, 16, undefined) };
    const colour = (): number => pick([128, 64, 96, 127, 129, 200, 255, 77.3, 0, 300, -20, NaN, Infinity]);
    const alpha = (): number => pick([128, 64, 0, 1, 127, 129, 192, 254, 255, 12.8, -10, NaN]);
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [rnd() * 255, rnd() * 255, rnd() * 255] }];
    for (let k = 0; k < 40; k++) {
      const x0 = rnd() * 60 - 4, y0 = rnd() * 40 - 4, x1 = x0 + rnd() * 30, y1 = y0 + rnd() * 30;
      const rgba: [number, number, number, number] = [colour(), colour(), colour(), alpha()];
      const texture = rnd() < 0.4 ? null : pick(Object.keys(bank));
      items.push({ kind: 'sprite', node: `f${k}`, texture, x0, y0, x1, y1, u0: rnd() - 0.5, v0: rnd() - 0.5, u1: rnd() * 2, v1: rnd() * 2, rgba, clip: null });
    }
    return { items, textures: (n) => bank[n] ?? null };
  }
  const stats: string[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    it(`seed ${seed}: exact class 0 bytes, layered === sequential, at 1, 2, 4 opaque and transparent, ff and exact`, () => {
      const { items, textures } = fuzz(seed);
      for (const scale of [1, 2, 4]) for (const transparent of [false, true]) for (const blend of BLENDS) {
        const want = rasterizeUiDrawList(items, textures, { scale, transparent }).frame;
        const p = planFrame(items, textures, { scale, transparent, blend });
        const k = `seed ${seed} ${scale}x ${transparent ? 'transparent' : 'opaque'} ${blend}`;
        expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
        const t = executeFramePlanOnTwin(p), q = executeFramePlanOnTwin(p, { sequential: true });
        expect(same(t.frame.data, q.frame.data), `${k}: layered === sequential`).toBe(0);
        const st = twinStats(t.frame, want, t.exact);
        expect(st.exactDiffering, `${k}: exact-class pixels differing`).toBe(0);
        if (scale === 1 && !transparent) stats.push(`${k}: max ${st.maxAbs.join('/')}, >=1 ${st.atLeast[0]}, exact ${st.exactPixels}`);
      }
    });
  }
  it('records the seeded statistics', () => {
    // eslint-disable-next-line no-console
    console.log(`GM-08 twin, seeded lists at 1x opaque:\n  ${stats.join('\n  ')}`);
    expect(stats.length).toBe(24);
  });
});

describe('GM-08 finding: an opaque frame\'s alpha after a NaN-alpha quad (research 380 P14 x P23)', () => {
  it('ff quads over a pixel whose alpha the software stored 0 raise it as the software does (the alpha blended, not masked)', () => {
    // P23: a NaN alpha stores all four channels 0 (zeroMask bit 3) -- on an opaque frame too. The software then raises
    // the alpha by A + (255 - A) min(1, a); P14's "alpha colorMask off" would leave it 0 (the twin, masked: |Δ| 255).
    const textures: UiTextures = (n) => (n === 'g.tif' ? { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(200) } : null);
    const items: UiDrawItem[] = [
      { kind: 'clear', rgb: [10, 20, 30] },
      { kind: 'sprite', node: 'nan', texture: null, x0: 0, y0: 0, x1: 32, y1: 32, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [50, 50, 50, NaN], clip: null },
      { kind: 'sprite', node: 'flat', texture: null, x0: 0, y0: 0, x1: 16, y1: 32, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [90, 60, 30, 128], clip: null },
      { kind: 'sprite', node: 'tex', texture: 'g.tif', x0: 16, y0: 0, x1: 32, y1: 32, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 64], clip: null },
    ];
    for (const scale of [1, 2, 4]) for (const blend of BLENDS) {
      const want = rasterizeUiDrawList(items, textures, { scale }).frame;
      const p = planFrame(items, textures, { scale, blend });
      expect(want.data[3], 'the software\'s alpha under the flat quad').toBe(255);
      expect(want.data[(16 * scale) * 4 + 3], 'the software\'s alpha under the textured quad: 255 (200/255)(64/128) = 100').toBe(100);
      const t = executeFramePlanOnTwin(p);
      expect(same(t.frame.data, want.data), `${scale}x ${blend}`).toBe(0);
    }
  });
});

describe('GM-08 review F3: the exact class does not lean on quadRoute', () => {
  it('an untextured ff quad at an alpha byte other than 0 or 128 (a relaxed fade rule) leaves the class', () => {
    // quadRoute (P13 `fade`) sends this quad programmable; the plan is altered to the ff path to stand for a relaxed
    // rule. Over C = 5 with c = 197 at alpha byte 1 the blender's model gives 7 and the software 6: the pixel is B.
    const items: UiDrawItem[] = [
      { kind: 'clear', rgb: [5, 5, 5] },
      { kind: 'sprite', node: 'q', texture: null, x0: 0, y0: 0, x1: 16, y1: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [197, 197, 197, 1], clip: null },
    ];
    const want = rasterizeUiDrawList(items, () => null, {}).frame;
    const p = planFrame(items, () => null, { blend: 'exact' });
    expect(p.quads.map((q) => q.path)).toEqual(['prog']);
    const ff: UiFramePlan = {
      ...p,
      quads: p.quads.map((q) => ({ ...q, path: 'ff' as const, batch: null })),
      steps: p.steps.filter((s) => s.kind !== 'copy').map((s) => (s.kind === 'quads' ? { ...s, path: 'ff' as const, batch: null } : s)),
    };
    const t = executeFramePlanOnTwin(ff);
    expect(t.frame.data[0], 'the twin (ff)').toBe(7);
    expect(want.data[0], 'the software').toBe(6);
    expect(t.exact[0], 'the quad\'s pixel is out of the class').toBe(0);
    expect(t.exact[16], 'beside the quad: the clear, in the class').toBe(1);
    expect(twinStats(t.frame, want, t.exact).exactDiffering).toBe(0);
  });
});

describe('GM-08: the statistics and the software verdict', () => {
  it('twinStats counts per channel and per pixel, and the exact class apart', () => {
    const a: Rgba = { width: 2, height: 1, data: new Uint8ClampedArray([10, 10, 10, 255, 0, 0, 0, 255]) };
    const b: Rgba = { width: 2, height: 1, data: new Uint8ClampedArray([11, 13, 10, 255, 0, 0, 0, 253]) };
    const st = twinStats(a, b, new Uint8Array([0, 1]), new Uint8Array([1, 0]));
    expect(st).toEqual({ pixels: 2, differing: 2, maxAbs: [1, 3, 0, 2], atLeast: [2, 2, 1], exactPixels: 1, exactDiffering: 1, quads: { maxAbs: [0, 0, 0, 2], atLeast: [1, 1, 0] } });
  });
  it('a plan whose verdict is software is drawn by the reference (L1), flagged, every pixel in the class', () => {
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [1, 2, 3] }, { kind: 'sprite', node: 'q', texture: null, x0: 0, y0: 0, x1: 16, y1: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [9, 9, 9, 128], clip: { x0: 2.5, y0: 0, x1: 9, y1: 9 } }];
    const p = planFrame(items, () => null, {});
    expect(p.verdict).toBe('software');
    const t = executeFramePlanOnTwin(p);
    expect(t.software).toBe(true);
    expect(same(t.frame.data, rasterizeUiDrawList(items, () => null, {}).frame.data)).toBe(0);
  });
});

// ---- GM-15b: seams, ties and the depth's range on the twin (the GM-15 row's 15b; research 380 M2, M3) -------------------

describe('GM-15b: seams and ties on the twin, pixel for pixel the software\'s; the depth before its clamp stays inside (0, 1)', () => {
  /** A pixel's four bytes as one number (pixel index q), and a colour packed the same way. */
  const rgbaAt = (frame: Rgba, q: number): number => { const d = frame.data, o = q * 4; return ((d[o]! * 256 + d[o + 1]!) * 256 + d[o + 2]!) * 256 + d[o + 3]!; };
  const pack = (r: number, g: number, b: number, a: number): number => ((r * 256 + g) * 256 + b) * 256 + a;
  const once = UI_SEAM_CLEAR + UI_SEAM_TEXEL, twice = UI_SEAM_CLEAR + 2 * UI_SEAM_TEXEL;
  const ONCE = pack(once, once, once, 255), TWICE = pack(twice, twice, twice, 255);
  /** Dyadic invW (a few bits each): with the squares' power-of-two sides, every weight, invW and depth is exact in f64 and f32. */
  const DYADIC = [0.5, 0.75, 1, 1.5, 2, 0.375];

  it('a seam at dyadic depths (24 squares, invW 0.375 .. 2): every seam pixel drawn once, by the software, the executor and the twin, at 1, 2 and 4 under ff and exact', () => {
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, (_, k) => DYADIC[k % DYADIC.length]!));
    for (const scale of [1, 2, 4]) for (const blend of BLENDS) {
      const k = `${scale}x ${blend}`;
      const want = rasterizeUiDrawList(items, textures, { scale }).frame;
      const p = planFrame(items, textures, { scale, blend });
      expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
      const t = executeFramePlanOnTwin(p).frame;
      expect(same(executeFramePlanOnCpu(p).frame.data, want.data), `${k}: the executor`).toBe(0);
      expect(same(t.data, want.data), `${k}: the twin, the whole frame`).toBe(0);
      let seams = 0, notOnce = 0;
      for (const sq of squares) for (const [x, y] of seamPixels(sq, scale)) {
        seams++;
        const q = y * want.width + x;
        if (rgbaAt(want, q) !== ONCE || rgbaAt(t, q) !== ONCE) notOnce++;
      }
      expect(seams, k).toBe(squares.reduce((n, sq) => n + sq.n * scale - 1, 0));
      expect(notOnce, `${k}: seam pixels not drawn exactly once (${once})`).toBe(0);
    }
  }, 120_000);

  it('GM-15d: a seam whose invW f32 rounds down (0.7) -- every seam pixel drawn once, by the software and the twin alike (top-left: one owner, no depth test reached)', () => {
    // Before GM-15d drawModels' inclusive edges put each seam pixel in both triangles, and its f64 invW passed the f32
    // 0.699999988 the first stored, so the software added the texel twice where the twin added it once (R1's "seam"
    // class, a port artefact). Under the top-left rule the diagonal is the second triangle's left edge and the first's
    // right-bottom one: one triangle covers it, in both implementations, whatever the depths.
    expect(Math.fround(0.7)).toBeLessThan(0.7);
    const { items, textures, squares } = seamSquares(Array.from({ length: 24 }, () => 0.7));
    for (const scale of [1, 2, 4]) {
      const want = rasterizeUiDrawList(items, textures, { scale }).frame;
      const p = planFrame(items, textures, { scale, blend: 'ff' });
      expect(p.verdict, `${scale}x`).toBe('gpu');
      const t = executeFramePlanOnTwin(p).frame;
      let seams = 0, softwareOnce = 0, twinOnce = 0;
      for (const sq of squares) for (const [x, y] of seamPixels(sq, scale)) {
        const q = y * want.width + x;
        seams++;
        if (rgbaAt(want, q) === ONCE) softwareOnce++;
        if (rgbaAt(t, q) === ONCE) twinOnce++;
      }
      expect(softwareOnce, `${scale}x: the software draws every seam pixel once`).toBe(seams);
      expect(twinOnce, `${scale}x: the twin draws every seam pixel once`).toBe(seams);
      expect(same(t.data, want.data), `${scale}x: the twin is the software, every pixel`).toBe(0);
    }
  }, 120_000);

  it('a tie (case 3, equal invW): the later triangle wins every pixel the two share, on the software and the twin, at 1, 2 and 4 -- GEQUAL on the f32 store (UI_MODEL_DEPTH_FORMAT_READING; GM-15d, the strict test kept the first)', () => {
    expect(UI_MODEL_DEPTH_FORMAT_READING).toBe('float32 invW, GEQUAL (the later of two equal depths wins), 0 empty');
    const c = UI_RASTER_CASES.find((x) => x.key === '3')!;
    for (const scale of UI_RASTER_CASE_SCALES) for (const blend of BLENDS) {
      const { plan: p, want } = plan(c, scale, 'opaque', blend);
      const t = executeFramePlanOnTwin(p).frame;
      expect(same(t.data, want.data), `3@${scale}x ${blend}`).toBe(0);
      let red = 0, green = 0;
      const RED = pack(128, 0, 0, 255), GREEN = pack(0, 128, 0, 255);
      for (let q = 0; q < want.width * want.height; q++) {
        const s = rgbaAt(want, q);
        if (s === RED) red++;
        else if (s === GREEN) green++;
      }
      expect(green, `3@${scale}x: pixels the tie covers, the second triangle's`).toBeGreaterThan(0);
      expect(red, `3@${scale}x: none of the first triangle's`).toBe(0);
    }
  }, 120_000);

  /** Every inside pixel of a drawn plan's triangles, as T2-T5 compute it before the clamp: f32 invW times the pass's depthScale. */
  function depthRange(p: UiFramePlan): { max: number; min: number; pixels: number } {
    let max = 0, min = Infinity, pixels = 0;
    for (const pass of p.passes) for (const i of pass.triangles) {
      const t = p.triangles[i]!, inv = f(1 / t.area), { box } = t;
      const ax = f(t.a.x), ay = f(t.a.y), bx = f(t.b.x), by = f(t.b.y), cx = f(t.c.x), cy = f(t.c.y);
      const aw = f(t.a.invW), bw = f(t.b.invW), cw = f(t.c.invW);
      for (let y = box.ys; y < box.ye; y++) for (let x = box.xs; x < box.xe; x++) {
        const w0 = T2_weight(bx, by, cx, cy, x, y, inv), w1 = T2_weight(cx, cy, ax, ay, x, y, inv), w2 = T2_third(w0, w1);
        if (!T3_inside(T2_edge(bx, by, cx, cy, x, y), T2_edge(cx, cy, ax, ay, x, y), T2_edge(ax, ay, bx, by, x, y), ax, ay, bx, by, cx, cy, inv < 0 ? -1 : 1)) continue;
        const z = f(T4_invW(w0, w1, w2, aw, bw, cw) * pass.depthScale);
        pixels++;
        if (z > max) max = z;
        if (z < min) min = z;
      }
    }
    return { max, min, pixels };
  }
  /** Seeded passes: arbitrary geometry, and per pass either one invW shared by every vertex (the case a pixel overshoots) or three apiece. */
  function depthList(seed: number): { items: UiDrawItem[]; textures: UiTextures } {
    let s = seed >>> 0;
    const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const pick = <T>(v: readonly T[]): T => v[Math.floor(rnd() * v.length)]!;
    const shared = [Math.fround(1 - 2 ** -24), 0.9999, 0.75, 1.9999999, 0.7, 3.3, 1, 2, 1e-3, 1e3];
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }];
    for (let k = 0; k < 4; k++) {
      const one = k % 2 === 0 ? pick(shared) : null;
      const v = (x: number, y: number): UiModelVertex => ({ x, y, invW: one ?? pick(shared) * (0.5 + rnd()), u: 0, v: 0, rgba: [128, 128, 128, 128] });
      const triangles: UiModelTriangle[] = Array.from({ length: 12 }, (_, j) => {
        const x = rnd() * 60, y = rnd() * 40;
        return { node: `d${j}`, texture: null, cull: false, a: v(x, y), b: v(x + rnd() * 30 - 10, y + rnd() * 30), c: v(x + rnd() * 30, y + rnd() * 20 - 10) };
      });
      items.push({ kind: 'models', triangles });
    }
    return { items, textures: () => null };
  }

  it('item 2: no pixel\'s depth before the clamp reaches 1 (at most 1/2 and a few ulps), nor falls under UI_GPU_MODEL_DEPTH_FLOOR: every case, the seam lists, seeded passes, at 1, 2 and 4', () => {
    const lists: [string, { items: UiDrawItem[]; textures: UiTextures }][] = [
      ['seams dyadic', seamSquares(Array.from({ length: 24 }, (_, k) => DYADIC[k % DYADIC.length]!))],
      ['seams 0.7', seamSquares(Array.from({ length: 24 }, () => 0.7))],
      ...[1, 2, 3, 4, 5, 6].map((seed): [string, { items: UiDrawItem[]; textures: UiTextures }] => [`seed ${seed}`, depthList(seed)]),
    ];
    let max = 0, min = Infinity, pixels = 0;
    const take = (p: UiFramePlan, k: string): void => {
      expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
      const r = depthRange(p);
      max = Math.max(max, r.max); min = Math.min(min, r.min); pixels += r.pixels;
    };
    for (const c of UI_RASTER_CASES.filter((x) => x.data().items.some((i) => i.kind === 'models'))) for (const scale of UI_RASTER_CASE_SCALES) {
      const { items, textures, options } = caseRasterInputs(c, scale, 'opaque');
      const { quadCache: _cache, ...rest } = options;
      take(planFrame(items, textures, { ...rest, blend: 'ff' }), caseRunKey(c, scale, 'opaque'));
    }
    for (const [name, { items, textures }] of lists) for (const scale of [1, 2, 4]) take(planFrame(items, textures, { scale }), `${name} ${scale}x`);
    expect(pixels, 'model pixels swept').toBeGreaterThan(10_000);
    expect(max, 'the largest depth before the clamp').toBeLessThanOrEqual(0.5 * (1 + 2 ** -20));
    expect(min, 'the smallest').toBeGreaterThanOrEqual(UI_GPU_MODEL_DEPTH_FLOOR);
    expect(UI_GPU_MODEL_DEPTH_FLOOR).toBe(2 ** -100);
    // eslint-disable-next-line no-console
    console.log(`GM-15b depth sweep: ${pixels} pixels, depth before the clamp in [${min}, ${max}]`);
  }, 120_000);
});
