import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle, UiModelVertex } from '@s2u/ui';
import { rasterizeUiDrawList, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
import { columnAxis, rowAxis } from '../src/uiRasterRules';
import {
  UI_GPU_MODEL_DEPTH_FLOOR, UI_GPU_MODEL_TEXEL_RANGE, UI_PLAN_CODE, passDepthScale, planFrame, quadRoute, triangleRoute, type UiFramePlan,
  type UiFramePlanOptions, type UiPlanBlendMode, type UiPlanQuad, type UiPlanTriangle,
} from '../src/uiFramePlan';
import { T2_third, T4_invW } from '../src/uiGpuTwin';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import {
  UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, UI_RASTER_SOFTWARE_SHA256, caseRasterInputs, caseRunKey, pattern, solid,
  type UiRasterCase, type UiRasterMode, type UiRasterScale,
} from './uiRasterCases';

// GM-06a (plan 2026-11-01-gpu-menus, research 380 §2.1): the 2D planner (`uiFramePlan.ts`) and its f64 CPU executor
// (`uiFramePlanCpu.ts`). The executor runs the plan's steps -- clears, destination copies, runs of quads through the
// axis tables, programmable batches read from their copy (layered) -- and must give the software rasteriser's bytes
// (`rasterizeUiDrawList`, GM-03's pinned SHA-256) on every 2D case at 1, 2 and 4, opaque and transparent, under both
// blend tables. Unit tests: no disc, no browser.

const sha = (f: Rgba): string => createHash('sha256').update(f.data).digest('hex');
const BLENDS: readonly UiPlanBlendMode[] = ['ff', 'exact'];

/** GM-06b plans these: the 3D pass (2, 3, 16, 17, 18) and a movie picture (8). Every other case is 2D. */
const GM_06B = new Set([2, 3, 8, 16, 17, 18]);
const TWO_D = UI_RASTER_CASES.filter((c) => !GM_06B.has(c.id));

function plan(c: UiRasterCase, scale: UiRasterScale, mode: UiRasterMode, blend?: UiPlanBlendMode): UiFramePlan {
  const { items, textures, options } = caseRasterInputs(c, scale, mode);
  const { quadCache: _cache, ...rest } = options;
  return planFrame(items, textures, { ...rest, ...(blend ? { blend } : {}) });
}
const caseOf = (key: string): UiRasterCase => UI_RASTER_CASES.find((c) => c.key === key)!;
const drawnQuads = (p: UiFramePlan): UiPlanQuad[] => p.quads;

describe('GM-06a: the executor equals the software on every 2D case (the pinned hashes)', () => {
  it('the 2D set is every case but GM-06b\'s', () => {
    expect([...new Set(TWO_D.map((c) => c.id))]).toEqual([1, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 19, 20]);
  });
  for (const c of TWO_D) {
    it(`case ${c.key}: ${c.name}`, () => {
      for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
        const p = plan(c, scale, mode, blend);
        const k = `${caseRunKey(c, scale, mode)} ${blend}`;
        expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
        const { frame, undrawn } = executeFramePlanOnCpu(p);
        expect([frame.width, frame.height], k).toEqual([640 * scale, 448 * scale]);
        expect(undrawn, `${k} undrawn`).toEqual(c.undrawn ?? []);
        expect(sha(frame), k).toBe(UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, scale, mode)]);
      }
    });
  }
});

/**
 * Seeded lists the cases do not reach: modulate colours other than 128 (where `(t c)/128` and `t (c/128)` round apart),
 * fractional corners and UVs, blend changes, overlapping programmable quads, glyphs with HD factors, non-finite colours.
 * Compared live with the software (no pin): the operand order and the batching under arbitrary input.
 */
function fuzzList(seed: number): { items: UiDrawItem[]; textures: UiTextures; hd: (b: UiBitmap) => Rgba | null } {
  let s = seed >>> 0;
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(v: readonly T[]): T => v[Math.floor(rnd() * v.length)]!;
  const bitmap = (w: number, h: number, blend: UiBitmap['blend']): UiBitmap => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
    return blend ? { width: w, height: h, data, blend } : { width: w, height: h, data };
  };
  const bank: Record<string, UiBitmap> = { 'a.tif': bitmap(5, 3, 'source'), 'b.tif': bitmap(7, 9, 'additive'), 'c.tif': bitmap(16, 16, undefined) };
  const hdImage = bitmap(32, 32, undefined);
  const colour = (): number => pick([128, 64, 96, 127, 129, 200, 255, 77.3, 0, 300, -20, NaN, Infinity]);
  const alpha = (): number => pick([128, 64, 0, 1, 127, 129, 192, 254, 255, 12.8, -10, NaN]);
  const items: UiDrawItem[] = [{ kind: 'clear', rgb: [rnd() * 255, rnd() * 255, rnd() * 255] }];
  for (let k = 0; k < 40; k++) {
    const x0 = rnd() * 60 - 4, y0 = rnd() * 40 - 4, x1 = x0 + rnd() * 30, y1 = y0 + rnd() * 30;
    const rgba: [number, number, number, number] = [colour(), colour(), colour(), alpha()];
    const clip = rnd() < 0.2 ? { x0: Math.floor(rnd() * 20), y0: Math.floor(rnd() * 20), x1: 20 + Math.floor(rnd() * 40), y1: 20 + Math.floor(rnd() * 30) } : null;
    const kind = rnd();
    if (kind < 0.35) items.push({ kind: 'sprite', node: `f${k}`, texture: null, x0, y0, x1, y1, u0: 0, v0: 0, u1: 1, v1: 1, rgba, clip });
    else if (kind < 0.8) items.push({ kind: 'sprite', node: `s${k}`, texture: pick(['a.tif', 'b.tif', 'c.tif', 'gone.tif']), x0, y0, x1, y1, u0: rnd() * 2 - 0.5, v0: rnd() * 2 - 0.5, u1: rnd() * 2 - 0.5, v1: rnd() * 2 - 0.5, rgba, clip });
    else items.push({ kind: 'glyphs', node: `g${k}`, clip, quads: Array.from({ length: 3 }, (_, j) => ({ code: 65, texture: pick(['a.tif', 'b.tif', 'c.tif']), shadow: false, left: x0 + j * 5, top: y0, right: x0 + j * 5 + 7.5, bottom: y1, u0: rnd() * 4, v0: rnd() * 4, u1: rnd() * 16, v1: rnd() * 16, rgba })) });
  }
  return { items, textures: (n) => bank[n] ?? null, hd: (b) => (b === bank['c.tif'] ? hdImage : null) };
}

describe('GM-06a: the executor equals the live software on seeded lists the cases do not reach', () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`seed ${seed}`, () => {
      const { items, textures, hd } = fuzzList(seed);
      for (const scale of UI_RASTER_CASE_SCALES) for (const transparent of [false, true]) for (const blend of BLENDS) {
        const o = { scale, transparent, hd };
        const p = planFrame(items, textures, { ...o, blend });
        expect(p.verdict, p.why.join('; ')).toBe('gpu');
        const want = rasterizeUiDrawList(items, textures, o);
        const got = executeFramePlanOnCpu(p);
        expect(got.undrawn).toEqual(want.undrawn);
        expect(sha(got.frame), `seed ${seed} x${scale} ${transparent ? 'transparent' : 'opaque'} ${blend}`).toBe(sha(want.frame));
      }
    });
  }
});

describe('GM-06a: verdict and why', () => {
  it('dev sampling (nearest, integer, sharpen) is software at the shown scale (GM.R9); bilinear or off plans', () => {
    const c = caseOf('6');
    for (const mode of ['nearest', 'integer', 'sharpen'] as const) {
      const { items, textures, options } = caseRasterInputs(c, 2, 'opaque');
      const settings = { enabled: true, mode, sharpness: 0.5, snap: 1 };
      const p = planFrame(items, textures, { scale: 2, movie: options.movie, uiSampling: settings });
      expect(p.verdict, mode).toBe('software');
      expect(p.why.join(' ')).toMatch(/dev sampling/);
      expect(p.target.scale).toBe(2);
      const want = rasterizeUiDrawList(items, textures, { scale: 2, uiSampling: settings });
      expect(sha(executeFramePlanOnCpu(p).frame), mode).toBe(sha(want.frame));
    }
    const { items, textures } = caseRasterInputs(c, 1, 'opaque');
    expect(planFrame(items, textures, { uiSampling: { enabled: true, mode: 'bilinear', sharpness: 0.5, snap: 1 } }).verdict).toBe('gpu');
    expect(planFrame(items, textures, { uiSampling: { enabled: false, mode: 'nearest', sharpness: 0.5, snap: 1 } }).verdict).toBe('gpu');
  });
  it('a clip that is not whole pixels is software (the GPU draws integer rectangles only), and equals the reference', () => {
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] },
      { kind: 'sprite', node: 'f', texture: null, x0: 0, y0: 0, x1: 16, y1: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 0, 0, 128], clip: { x0: 2.5, y0: 0, x1: 9, y1: 9 } }];
    const p = planFrame(items, () => null, {});
    expect(p.verdict).toBe('software');
    expect(p.why.join(' ')).toMatch(/clip/);
    expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(rasterizeUiDrawList(items, () => null).frame));
  });
  it('undrawn as the software names it: a widget, a missing bitmap, a models marker without triangles', () => {
    const items: UiDrawItem[] = [
      { kind: 'widget', node: 'w', record: { type: 'slider' } as never, x: 0, y: 0, opacity: 1 },
      { kind: 'sprite', node: 'q', texture: 'gone.tif', x0: 0, y0: 0, x1: 4, y1: 4, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null },
      { kind: 'models' },
    ];
    const p = planFrame(items, () => null, {});
    expect(p.verdict).toBe('gpu');
    expect(p.undrawn).toEqual(rasterizeUiDrawList(items, () => null).undrawn);
    expect(p.undrawn).toEqual(['widget w (slider)', 'q: no bitmap gone.tif', 'models']);
  });
});

describe('GM-06a: the register (P2, P16, P20) -- registerAfter and each quad\'s blend', () => {
  it('registerAfter is the ALPHA_1 the list leaves', () => {
    expect(plan(caseOf('10'), 1, 'opaque').registerAfter).toBe('additive');  // the glow bind; missing, no-picture leave it
    expect(plan(caseOf('12'), 1, 'opaque').registerAfter).toBe('additive');  // the last glyph bound glowfont
    expect(plan(caseOf('11'), 1, 'opaque').registerAfter).toBe('source');
    expect(plan(caseOf('7'), 1, 'opaque').registerAfter).toBe('source');    // GS_ALPHA_FRAME_START_READING
    expect(plan(caseOf('18'), 1, 'opaque').registerAfter).toBe('source');   // after the models: the plain sprite's bind
  });
  it('case 10: the fader under the glow\'s additive, the no-picture movie quad by source, the last fill still additive', () => {
    const q = plan(caseOf('10'), 1, 'opaque').quads;
    expect(q.map((x) => [x.node, x.blend])).toEqual([['q', 'additive'], ['MENUFADER', 'additive'], ['movie', 'source'], ['f', 'additive']]);
  });
});

describe('GM-06a: routing per the blend table (GM.R6, research 380 P10, P11, P13, P23)', () => {
  it('exact (the scale-1 default) routes every drawn quad programmable', () => {
    for (const c of TWO_D) {
      const p = plan(c, 1, 'opaque');
      expect(p.blend, c.key).toBe('exact');
      for (const q of drawnQuads(p)) expect([q.path, q.why], `${c.key} ${q.node}`).toEqual(['prog', 'exact']);
    }
  });
  it('HD defaults to ff', () => {
    expect(plan(caseOf('1'), 2, 'opaque').blend).toBe('ff');
    expect(plan(caseOf('1'), 4, 'opaque').blend).toBe('ff');
  });
  it('ff: a source alpha over 1 is programmable (case 1: sprite, untextured, glyph)', () => {
    expect(plan(caseOf('1'), 2, 'opaque').quads.map((q) => [q.path, q.why])).toEqual(Array(4).fill(['prog', 'over1']));
  });
  it('ff: P23 colours and negative alphas (case 5)', () => {
    expect(plan(caseOf('5'), 2, 'opaque').quads.map((q) => q.why)).toEqual(['colour', 'colour', 'colour', 'colour', 'colour', 'negative', 'negative']);
  });
  it('ff: the fade ramp (case 20) -- every untextured fractional alpha programmable, alpha 128 and the ground ff, alpha 0 not drawn', () => {
    const q = plan(caseOf('20'), 2, 'opaque').quads;
    expect(q).toHaveLength(129);                                  // the ground + bytes 1..128 (0 is skipped, P9)
    expect([q[0]!.path, q[0]!.why]).toEqual(['ff', null]);
    for (let k = 1; k < 128; k++) expect([q[k]!.path, q[k]!.why], `alpha ${k}`).toEqual(['prog', 'fade']);
    expect([q[128]!.path, q[128]!.why]).toEqual(['ff', null]);
  });
  it('ff: GM-04 review F1 -- MENUFADER packed to 254 under the roller\'s additive is a fade (P13: always programmable)', () => {
    expect(quadRoute({ textured: false, rgba: [0, 0, 0, 254], blend: 'additive' }, 'ff')).toBe('fade');
    expect(quadRoute({ textured: false, rgba: [0, 0, 0, 192], blend: 'additive' }, 'ff')).toBe('fade');
    expect(quadRoute({ textured: false, rgba: [0, 0, 0, 128], blend: 'additive' }, 'ff')).toBe(null);
    expect(quadRoute({ textured: false, rgba: [0, 0, 0, 254], blend: 'source' }, 'ff')).toBe('over1');
  });
  it('ff: a textured additive alpha over 1 stays fixed-function (P11 ff, min(1, r a / 255)); a textured fraction too', () => {
    expect(quadRoute({ textured: true, rgba: [128, 128, 128, 250], blend: 'additive' }, 'ff')).toBe(null);
    expect(quadRoute({ textured: true, rgba: [128, 128, 128, 12.800000190734863], blend: 'source' }, 'ff')).toBe(null);
    expect(quadRoute({ textured: true, rgba: [128, 128, 128, 128], blend: 'source' }, 'exact')).toBe('exact');
  });
});

describe('GM-06a: runs and programmable batches (GM.R7)', () => {
  it('a run merges only consecutive quads with the same path, blend, texture and batch (case 12: a blend change inside a glyph item)', () => {
    const p = plan(caseOf('12'), 2, 'opaque');
    const runs = p.steps.filter((s) => s.kind === 'quads');
    for (const r of runs) {
      if (r.kind !== 'quads') continue;
      for (const i of r.quads) {
        const q = p.quads[i]!;
        expect([q.path, q.blend, q.texture, q.batch]).toEqual([r.path, r.blend, r.texture, r.batch]);
      }
    }
    // font, glowfont, font, the fill, glowfont, the fill: six runs, none merged across a change
    expect(runs.length).toBe(6);
  });
  it('the quads of a programmable batch never overlap, each batch opens with its copy, and the copy covers them (every case, both tables)', () => {
    for (const c of TWO_D) for (const scale of UI_RASTER_CASE_SCALES) for (const blend of BLENDS) {
      const p = plan(c, scale, 'opaque', blend);
      const seen = new Set<number>();
      let open: number | null = null;
      for (const s of p.steps) {
        if (s.kind === 'copy') { expect(seen.has(s.batch), `${c.key} batch ${s.batch} copied twice`).toBe(false); seen.add(s.batch); open = s.batch; continue; }
        if (s.kind !== 'quads') { open = null; continue; }
        if (s.path === 'ff') { expect(s.batch).toBe(null); open = null; continue; }
        expect(s.batch, `${c.key} a prog run inside its batch`).toBe(open);
      }
      for (const b of p.batches) {
        const qs = b.quads.map((i) => p.quads[i]!);
        for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
          const a = qs[i]!.rect, d = qs[j]!.rect;
          expect(a.xs < d.xe && d.xs < a.xe && a.ys < d.ye && d.ys < a.ye, `${c.key}@${scale} ${blend}: batch ${b.id} overlaps`).toBe(false);
        }
        for (const q of qs) expect(q.rect.xs >= b.copy.xs && q.rect.ys >= b.copy.ys && q.rect.xe <= b.copy.xe && q.rect.ye <= b.copy.ye).toBe(true);
      }
    }
  });
  it('case 11 (overlapping bold glyphs) splits into three batches; case 20\'s 127 fade cells are one', () => {
    expect(plan(caseOf('11'), 2, 'opaque').batches.map((b) => b.quads.length)).toEqual([1, 1, 1]);
    expect(plan(caseOf('20'), 2, 'opaque').batches.map((b) => b.quads.length)).toEqual([127]);
    // exact: the ground under every cell is a batch of its own, then the 128 drawn cells together
    expect(plan(caseOf('20'), 1, 'opaque').batches.map((b) => b.quads.length)).toEqual([1, 128]);
  });
  it('a batch\'s quads are read from its copy (layered): an executor reading the live frame instead gives the same bytes', () => {
    for (const k of ['11', '20', '4', '19.a192']) {
      const p = plan(caseOf(k), 2, 'transparent', 'exact');
      expect(sha(executeFramePlanOnCpu(p, { sequential: true }).frame), k).toBe(sha(executeFramePlanOnCpu(p).frame));
    }
  });
});

describe('GM-06a: colours as the GPU can carry them -- the closed code table and zeroMask (P23)', () => {
  it('case 5: a non-finite channel carries its code and an encoded 0; a NaN channel is in zeroMask; a NaN alpha zeroes all four', () => {
    const q = plan(caseOf('5'), 1, 'opaque').quads;
    for (const x of q) for (const v of x.colour) expect(Number.isFinite(v), x.node).toBe(true);
    expect([q[0]!.colour, q[0]!.codes, q[0]!.zeroMask]).toEqual([[0, 50, 300, 128], [UI_PLAN_CODE.nan, 0, 0, 0], 0b0001]);
    expect([q[1]!.colour, q[1]!.codes, q[1]!.zeroMask]).toEqual([[-50, 0, 0, 64], [0, UI_PLAN_CODE.posInf, UI_PLAN_CODE.negInf, 0], 0]);
    expect([q[2]!.codes, q[2]!.zeroMask]).toEqual([[UI_PLAN_CODE.nan, 0, 0, 0], 0b0001]);        // [NaN, 0, 0, 0]: drawn, not skipped
    expect([q[3]!.codes, q[3]!.zeroMask]).toEqual([[0, 0, 0, UI_PLAN_CODE.nan], 0b1111]);         // NaN alpha
    expect([q[4]!.codes, q[4]!.zeroMask]).toEqual([[UI_PLAN_CODE.nan, 0, 0, 0], 0b0001]);         // textured, NaN red
  });
  it('a finite quad has codes 0 and zeroMask 0', () => {
    for (const q of plan(caseOf('12'), 1, 'opaque').quads) expect([q.codes, q.zeroMask]).toEqual([[0, 0, 0, 0], 0]);
  });
});

describe('GM-06a: the axis tables (GM.R3) -- the software\'s columnAxis and rowAxis, f64, texel indices', () => {
  it('case 6 (repeat, negative and above-1 UVs, a 3 x 6 bitmap) at 1, 2, 4', () => {
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = plan(caseOf('6'), scale, 'opaque');
      const q = p.quads.find((x) => x.texture !== null)!;
      const t = p.textures[q.texture!]!;
      const { xs, xe, ys, ye } = q.rect;
      const n = xe - xs, left = new Float64Array(n), right = new Float64Array(n), fraction = new Float64Array(n);
      columnAxis(xs, xe, q.x0, q.x1 - q.x0, q.uv[0], q.uv[2] - q.uv[0], t.width, false, left, right, fraction);
      for (let k = 0; k < n; k++) {
        const o = q.axis!.column + k * 4;
        expect([...p.axis.subarray(o, o + 4)], `x ${xs + k} at ${scale}`).toEqual([left[k]! / 4, right[k]! / 4, fraction[k]!, 1 - fraction[k]!]);
      }
      for (let y = ys; y < ye; y++) {
        const r = rowAxis(y, q.y0, q.y1 - q.y0, q.uv[1], q.uv[3] - q.uv[1], t.height, t.width, false);
        const o = q.axis!.row + (y - ys) * 4;
        expect([...p.axis.subarray(o, o + 4)], `y ${y} at ${scale}`).toEqual([r.top / (t.width * 4), r.bottom / (t.width * 4), r.fy, r.iy]);
      }
    }
  });
  it('an untextured quad has no axis; the table holds exactly the textured quads\' columns and rows', () => {
    const p = plan(caseOf('1'), 2, 'opaque');
    let entries = 0;
    for (const q of p.quads) {
      if (q.texture === null) expect(q.axis).toBe(null);
      else entries += (q.rect.xe - q.rect.xs) + (q.rect.ye - q.rect.ys);
    }
    expect(p.axis.length).toBe(entries * 4);
  });
  it('case 13 hot: the HD replacement is the planned texture, its texel coordinates scaled by the sizes\' ratio', () => {
    const p = plan(caseOf('13.hot'), 2, 'opaque');
    expect(p.textures.map((t) => [t.name, t.width, t.height, t.hd])).toEqual([['bg.tif', 32, 32, true], ['panel.tif', 16, 16, true]]);
  });
});

describe('GM-06a: 2D quads keep no depth (UI_2D_QUAD_Z_READING; GM-05b review F3)', () => {
  it('no step of a 2D plan carries a depth test or a depth buffer', () => {
    for (const c of TWO_D) {
      const p = plan(c, 2, 'opaque');
      expect(p.target.depth, c.key).toBe(false);
      for (const s of p.steps) if (s.kind === 'quads') expect(s.depth, c.key).toBe('none');
    }
  });
});

describe('GM-06a: the plan hash', () => {
  it('the same list gives the same hash (16 hex digits); a colour, a scale, a mode or the blend table changes it', () => {
    const c = caseOf('12');
    const h = plan(c, 2, 'opaque').hash;
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(plan(c, 2, 'opaque').hash).toBe(h);
    expect(plan(c, 4, 'opaque').hash).not.toBe(h);
    expect(plan(c, 2, 'transparent').hash).not.toBe(h);
    expect(plan(c, 2, 'opaque', 'exact').hash).not.toBe(h);
    const { items, textures, options } = caseRasterInputs(c, 2, 'opaque');
    const moved = items.map((it) => (it.kind === 'sprite' && it.texture === null ? { ...it, rgba: [0, 0, 0, 127] as [number, number, number, number] } : it));
    expect(planFrame(moved, textures, { scale: 2, movie: options.movie }).hash).not.toBe(h);
  });
  it('a quad dropped for a clip off whole pixels is still hashed: its colour, corners, clip, texture and UV change it (GM-06a review F1)', () => {
    const base = { kind: 'sprite', node: 'f', texture: null, x0: 0, y0: 0, x1: 16, y1: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 0, 0, 128], clip: { x0: 2.5, y0: 0, x1: 9, y1: 9 } } as const;
    const list = (over: Partial<Extract<UiDrawItem, { kind: 'sprite' }>>): UiDrawItem[] => [{ kind: 'clear', rgb: [0, 0, 0] }, { ...base, ...over } as UiDrawItem];
    const tex: UiTextures = () => solid(4, 4, [1, 2, 3, 255]);
    const h = (items: UiDrawItem[]): string => {
      const p = planFrame(items, tex, {});
      expect(p.verdict).toBe('software');
      return p.hash;
    };
    const h0 = h(list({}));
    expect(h(list({}))).toBe(h0);
    const variants: UiDrawItem[][] = [
      list({ rgba: [0, 0, 128, 128] }),
      list({ x1: 15 }),
      list({ clip: { x0: 3.5, y0: 0, x1: 9, y1: 9 } }),
      list({ texture: 'a.tif' }),
    ];
    const hashes = variants.map(h);
    for (const v of hashes) expect(v).not.toBe(h0);
    expect(h(list({ texture: 'a.tif', u1: 0.5 }))).not.toBe(hashes[3]);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
  it('a texture whose pixels change under the same name and size keeps the hash (the texture cache owns contents)', () => {
    const items: UiDrawItem[] = [{ kind: 'sprite', node: 'q', texture: 'a.tif', x0: 0, y0: 0, x1: 4, y1: 4, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null }];
    const a: UiBitmap = solid(4, 4, [1, 2, 3, 255]), b: UiBitmap = solid(4, 4, [9, 9, 9, 255]);
    const ta: UiTextures = () => a, tb: UiTextures = () => b;
    expect(planFrame(items, ta, {}).hash).toBe(planFrame(items, tb, {}).hash);
  });
});

describe('GM-06a: options', () => {
  it('the plan\'s target is the frame the software draws', () => {
    const o: UiFramePlanOptions = { scale: 4, transparent: true };
    const p = planFrame([], () => null, o);
    expect(p.target).toEqual({ width: 2560, height: 1792, scale: 4, transparent: true, depth: false });
    expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(rasterizeUiDrawList([], () => null, o).frame));
    expect(sha(executeFramePlanOnCpu(planFrame([], () => null, {})).frame)).toBe(sha(rasterizeUiDrawList([], () => null).frame));
  });
});

// ---- GM-06b: the models list and the movie step -------------------------------------------------------------------

/** The plan row's cases: the 3D pass (2, 3, 16, 17, 18), a movie picture (8) and the no-picture movie quad (10). */
const GM_06B_ROW = [2, 3, 8, 10, 16, 17, 18];

describe('GM-06b: the executor equals the software on cases 2, 3, 8, 10, 16, 17, 18 (the pinned hashes)', () => {
  it('the row\'s cases are in the table', () => {
    expect(GM_06B_ROW.map((id) => UI_RASTER_CASES.filter((c) => c.id === id).length)).toEqual(GM_06B_ROW.map(() => 1));
  });
  for (const id of GM_06B_ROW) {
    const c = UI_RASTER_CASES.find((x) => x.id === id)!;
    it(`case ${c.key}: ${c.name}`, () => {
      for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
        const p = plan(c, scale, mode, blend);
        const k = `${caseRunKey(c, scale, mode)} ${blend}`;
        expect(p.verdict, `${k}: ${p.why.join('; ')}`).toBe('gpu');
        const { frame, undrawn } = executeFramePlanOnCpu(p);
        expect(undrawn, `${k} undrawn`).toEqual(c.undrawn ?? []);
        expect(sha(frame), k).toBe(UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, scale, mode)]);
      }
    });
  }
  it('every case of the table now plans on the GPU at 1, 2 and 4, both modes, both tables, and equals its pin', () => {
    let runs = 0;
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
      const p = plan(c, scale, mode, blend);
      expect(p.verdict, `${c.key}: ${p.why.join('; ')}`).toBe('gpu');
      expect(sha(executeFramePlanOnCpu(p).frame), `${caseRunKey(c, scale, mode)} ${blend}`).toBe(UI_RASTER_SOFTWARE_SHA256[caseRunKey(c, scale, mode)]);
      runs++;
    }
    expect(runs).toBe(UI_RASTER_CASES.length * 12);
  });
});

describe('GM-06b: the models list (research 380 M1-M7)', () => {
  it('a models item is a pass: its depth step, then runs of triangles with one blend and texture; target.depth set', () => {
    const p = plan(caseOf('2'), 2, 'opaque');
    expect(p.target.depth).toBe(true);
    expect(p.steps.map((s) => s.kind)).toEqual(['clear', 'pass', 'triangles']);
    const run = p.steps[2]!;
    if (run.kind !== 'triangles') throw new Error('not a run');
    expect([run.pass, run.blend, run.path, run.depth, run.triangles]).toEqual([0, 'additive', 'ff', 'pass', [0, 1, 2, 3]]);
    expect(p.passes).toEqual([{ id: 0, item: 1, triangles: [0, 1, 2, 3], depthScale: 0.25 }]);   // GM-15b: invW 2 to 1/2
    expect(p.stats.triangles).toBe(4);
    expect(plan(caseOf('1'), 2, 'opaque').target.depth).toBe(false);
  });
  it('vertices on the target\'s grid (times the scale, the software\'s order), the integer box ceil(min)..ceil(max), the area', () => {
    const p = plan(caseOf('2'), 4, 'opaque');
    const t = p.triangles[3]!;
    expect([t.a.x, t.a.y, t.b.x, t.b.y, t.c.x, t.c.y]).toEqual([112, 0, 80, 32, 112, 32]);
    expect([t.a.invW, t.b.invW, t.c.invW]).toEqual([2, 2, 2]);
    expect(t.box).toEqual({ xs: 80, ys: 0, xe: 112, ye: 32 });
    expect(t.area).toBe((80 - 112) * (32 - 0) - (112 - 112) * (32 - 0));
    expect(t.texture).toBe(0);
    expect(p.textures[0]!.name).toBe('roll.tif');
  });
  it('case 18: zero-area, culled and missing-bitmap triangles are not drawn and bind nothing (M1, UI_MESH_BIND_READING)', () => {
    const p = plan(caseOf('18'), 1, 'opaque');
    expect(p.triangles.map((t) => [t.node, t.texture === null ? null : p.textures[t.texture]!.name, t.blend])).toEqual([['new_on', 'glow.tif', 'additive']]);
    expect(p.passes.map((x) => x.triangles.length)).toEqual([1, 0]);
    expect(p.steps.filter((s) => s.kind === 'pass')).toHaveLength(1);       // an empty pass draws nothing: no step
    expect(p.quads.map((q) => [q.node, q.blend])).toEqual([['q', 'source'], ['MENUFADER', 'additive'], ['q', 'source'], ['MENUFADER', 'source']]);
    expect(p.undrawn).toEqual(['m: no bitmap gone.tif']);
    expect(p.registerAfter).toBe('source');
  });
  it('case 3: an untextured triangle takes the register as it stands (the frame start, source)', () => {
    const p = plan(caseOf('3'), 1, 'opaque');
    expect(p.triangles.map((t) => [t.texture, t.blend])).toEqual([[null, 'source'], [null, 'source']]);
  });
  it('2D quads still keep no depth beside a pass (UI_2D_QUAD_Z_READING; GM-05b review F3)', () => {
    for (const k of ['17', '18']) for (const s of plan(caseOf(k), 2, 'opaque').steps) if (s.kind === 'quads') expect(s.depth, k).toBe('none');
  });
  it('a pass ends a programmable batch: quads after it read a copy taken after it (layered === sequential on 2, 8, 17, 18)', () => {
    const p = plan(caseOf('18'), 1, 'opaque', 'exact');
    const kinds = p.steps.map((s) => s.kind);
    const pass = kinds.indexOf('pass');
    expect(kinds[pass + 2]).toBe('copy');
    for (const k of ['2', '17', '18', '8']) for (const mode of UI_RASTER_CASE_MODES) {
      const q = plan(caseOf(k), 2, mode, 'exact');
      expect(sha(executeFramePlanOnCpu(q, { sequential: true }).frame), `${k} ${mode}`).toBe(sha(executeFramePlanOnCpu(q).frame));
    }
  });
  it('a triangle the fixed-function blend cannot take is software until GM-26, named; the executor gives the reference', () => {
    const over = (rgba: [number, number, number, number], textured: boolean) => {
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [10, 20, 30] }, { kind: 'models', triangles: [{ node: 'n', texture: textured ? 'add.tif' : null, cull: false,
        a: { x: 0, y: 0, invW: 1, u: 0, v: 0, rgba }, b: { x: 0, y: 9, invW: 1, u: 0, v: 1, rgba }, c: { x: 9, y: 0, invW: 1, u: 1, v: 0, rgba } }] }];
      const tex: UiTextures = () => solid(2, 2, [50, 60, 70, 255], 'additive');
      return { p: planFrame(items, tex, {}), want: rasterizeUiDrawList(items, tex) };
    };
    const rows: [[number, number, number, number], boolean, string][] = [
      [[128, 0, 0, 192], false, 'over1'], [[128, 0, 0, -1], false, 'negative'], [[300, 0, 0, 64], false, 'colour'],
      [[NaN, 0, 0, 64], false, 'colour'], [[-1, 0, 0, 64], true, 'colour'],
    ];
    for (const [rgba, textured, reason] of rows) {
      const { p, want } = over(rgba, textured);
      expect(p.verdict, String(rgba)).toBe('software');
      expect(p.why.join(' ')).toMatch(/GM-26/);
      expect(p.triangles[0]!.why).toBe(reason);
      expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(want.frame));
    }
    expect(triangleRoute({ textured: true, rgba: [[128, 128, 128, 250], [128, 128, 128, 250], [128, 128, 128, 250]], blend: 'additive' })).toBe(null);
    expect(over([128, 0, 0, 128], false).p.verdict).toBe('gpu');
  });
  it('a vertex not finite, or at invW <= 0 (the depth clear\'s 0 is the software\'s "empty"), is software, named', () => {
    const v = (x: number, y: number, invW = 1): UiModelVertex => ({ x, y, invW, u: 0, v: 0, rgba: [128, 128, 128, 128] });
    const rows: [UiModelVertex, RegExp][] = [[v(0, 0, 0), /invW/], [v(0, 0, -1), /invW/], [v(NaN, 0), /not finite/], [{ ...v(0, 0), u: Infinity }, /not finite/]];
    for (const [a, re] of rows) {
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [{ node: 'n', texture: null, cull: false, a, b: v(0, 9), c: v(9, 0) }] }];
      const p = planFrame(items, () => null, {});
      expect(p.verdict, String(re)).toBe('software');
      expect(p.why.join(' ')).toMatch(re);
      expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(rasterizeUiDrawList(items, () => null).frame));
    }
  });
  it('GM-15a/15b: each pass carries its depthScale, the largest power of two <= 1 that brings every vertex\'s f32 invW to at most 1/2 (GM.R10; GM-15b: headroom under the clamp at 1)', () => {
    let passes = 0;
    for (const c of UI_RASTER_CASES) for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
      const p = plan(c, scale, mode, blend);
      for (const pass of p.passes) {
        passes++;
        const k = `${caseRunKey(c, scale, mode)} ${blend} pass ${pass.id}`;
        expect(Number.isInteger(Math.log2(pass.depthScale)), `${k}: ${pass.depthScale} a power of two`).toBe(true);
        expect(pass.depthScale, k).toBeLessThanOrEqual(1);
        const max = Math.max(0, ...pass.triangles.flatMap((i) => [p.triangles[i]!.a, p.triangles[i]!.b, p.triangles[i]!.c].map((v) => Math.fround(v.invW))));
        expect(Math.fround(max * pass.depthScale), `${k}: every invW times it at most 1/2`).toBeLessThanOrEqual(0.5);
        // The largest such: twice it would take the largest invW past 1/2 (or past the scale's cap, 1).
        if (pass.depthScale < 1) expect(max * pass.depthScale * 2, k).toBeGreaterThan(0.5);
      }
    }
    expect(passes).toBeGreaterThan(0);
    expect(plan(caseOf('2'), 1, 'opaque').passes.map((x) => x.depthScale)).toEqual([0.25]);    // the nearer triangle's invW 2
    expect(plan(caseOf('16'), 1, 'opaque').passes.map((x) => x.depthScale)).toEqual([1]);      // invW 1/10, 1/20, 1/50
    expect(plan(caseOf('18'), 1, 'opaque').passes.map((x) => x.depthScale)).toEqual([0.5, 1]); // invW 1; the empty pass: 1
    expect(passDepthScale([], [])).toBe(1);
  });
  it('GM-15a: depthScale is not hashed (a function of the vertices, which are): the hash section names no depthScale and its version is unchanged', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'uiFramePlan.ts'), 'utf8');
    const at = src.indexOf('hasher.str(\'GM-06b plan 2\');'), end = src.indexOf('const prog = quads.filter', at);
    expect(at).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(at);
    expect(src.slice(at, end)).not.toMatch(/depthScale/);
    for (const m of src.matchAll(/hasher\.\w+\(([^)]*)\)/g)) expect(m[1], 'no hasher call reads depthScale').not.toMatch(/depthScale/);
  });
  it('an HD replacement is the triangle\'s texture (the software samples the pack\'s image)', () => {
    const w: [number, number, number, number] = [128, 128, 128, 128];
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [{ node: 'n', texture: 'a.tif', cull: false,
      a: { x: 0, y: 0, invW: 1, u: 0, v: 0, rgba: w }, b: { x: 0, y: 9, invW: 0.5, u: 0, v: 1, rgba: w }, c: { x: 9, y: 0, invW: 1, u: 1, v: 0, rgba: w } }] }];
    const a = pattern(4, 4, 3), big = pattern(16, 16, 9);
    const o = { scale: 2, hd: (b: UiBitmap) => (b === a ? big : null) };
    const p = planFrame(items, () => a, o);
    expect(p.textures.map((t) => [t.width, t.hd])).toEqual([[16, true]]);
    expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(rasterizeUiDrawList(items, () => a, o).frame));
  });
});

// ---- GM-15b: the models pass's edges (the GM-15 row's 15b; GM-06b review F3, GM-15a review F2) ------------------------

describe('GM-15b: the models pass\'s edges -- what the software draws there, and the plan refusing (L1, named) what a GPU cannot hold', () => {
  type Q4 = [number, number, number, number];
  const RED: Q4 = [128, 0, 0, 128], GREEN: Q4 = [0, 128, 0, 128];
  /** The corner triangle (dx, 0), (dx, 16), (dx + 16, 0) (counter-clockwise on the frame), every vertex at one invW and colour, untextured. */
  const corner = (invW: number, rgba: Q4, dx = 0): UiModelTriangle => {
    const v = (x: number, y: number): UiModelVertex => ({ x, y, invW, u: 0, v: 0, rgba });
    return { node: 'n', texture: null, cull: false, a: v(dx, 0), b: v(dx, 16), c: v(dx + 16, 0) };
  };
  const list = (...triangles: UiModelTriangle[]): UiDrawItem[] => [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles }];
  const px = (f: Rgba, x: number, y: number): number[] => [...f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4)];
  const DEPTH = /UI_GPU_MODEL_DEPTH_FLOOR/, TEXEL = /UI_GPU_MODEL_TEXEL_RANGE/;
  /** A stand-in triangle for `passDepthScale`, which reads the three invW only. */
  const atDepth = (m: number): UiPlanTriangle => ({ a: { invW: m }, b: { invW: m }, c: { invW: m } }) as unknown as UiPlanTriangle;

  it('item 4, "0 = empty": a positive invW whose f32 is 0 -- the software draws the triangle and leaves its depth empty, so a farther one draws over it; refused at every scale', () => {
    expect(Math.fround(1e-46)).toBe(0);
    const items = list(corner(1e-46, RED), corner(1e-47, GREEN));
    // drawModels (uiCompositorView.ts): the depth is a Float32Array, the f32 depth z tested GEQUAL (skipped when
    // `z < depth[i]`), the store `depth[i] = z` (GM-15d): 1e-46 is 0 in f32, so the green triangle's 0 passes over it.
    expect(px(rasterizeUiDrawList(items, () => null).frame, 1, 1), 'the farther triangle drew over the nearer').toEqual([0, 128, 0, 255]);
    // The same pair at depths f32 holds: the farther fails the nearer's depth, and the GPU draws that list.
    const held = list(corner(0.5, RED), corner(0.25, GREEN));
    expect(px(rasterizeUiDrawList(held, () => null).frame, 1, 1)).toEqual([128, 0, 0, 255]);
    expect(planFrame(held, () => null, {}).verdict).toBe('gpu');
    // A GPU's highp arithmetic may flush such depths (ESSL 3.00 section 4.5.1) and its depth buffer with them, so its
    // bytes are not held to the software's here. The plan refuses the pass; the frame is the software's (L1).
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = planFrame(items, () => null, { scale });
      expect(p.verdict, `${scale}x`).toBe('software');
      expect(p.why.join(' '), `${scale}x`).toMatch(DEPTH);
      expect(sha(executeFramePlanOnCpu(p).frame), `${scale}x: the executor is the software`).toBe(sha(rasterizeUiDrawList(items, () => null, { scale }).frame));
    }
  });

  it('item 1: a positive invW whose f32 is subnormal -- the software stores it (not empty) and the farther triangle fails; a GPU may flush it to 0 (ESSL 3.00 section 4.5.1): refused', () => {
    const v = Math.fround(1e-40);
    expect(v > 0 && v < 2 ** -126, 'a subnormal f32').toBe(true);
    const items = list(corner(1e-40, RED), corner(1e-41, GREEN));
    expect(px(rasterizeUiDrawList(items, () => null).frame, 1, 1)).toEqual([128, 0, 0, 255]);
    const p = planFrame(items, () => null, {});
    expect(p.verdict).toBe('software');
    expect(p.why.join(' ')).toMatch(DEPTH);
  });

  it('item 1: the floor is UI_GPU_MODEL_DEPTH_FLOOR = 2^-100, on each vertex\'s f32 invW times the pass\'s depthScale (after the scale, not before)', () => {
    expect(UI_GPU_MODEL_DEPTH_FLOOR).toBe(2 ** -100);
    const planOf = (...t: UiModelTriangle[]): UiFramePlan => planFrame(list(...t), () => null, {});
    // Alone (its invW at most 1/2, the scale 1): the floor itself is drawn, the power of two under it is not.
    expect(planOf(corner(2 ** -100, RED)).passes[0]!.depthScale).toBe(1);
    expect(planOf(corner(2 ** -100, RED)).verdict).toBe('gpu');
    const alone = planOf(corner(2 ** -101, RED));
    expect(alone.verdict).toBe('software');
    expect(alone.why.join(' ')).toMatch(DEPTH);
    // Beside a triangle at invW 1 the pass's depthScale is 1/2: 2^-99 lands on the floor, 2^-100 under it.
    const near = corner(1, RED, 40);
    expect(planOf(near, corner(2 ** -99, GREEN)).passes[0]!.depthScale).toBe(0.5);
    expect(planOf(near, corner(2 ** -99, GREEN)).verdict).toBe('gpu');
    const under = planOf(near, corner(2 ** -100, GREEN));
    expect(under.verdict).toBe('software');
    expect(under.why.join(' ')).toMatch(DEPTH);
    // A vertex at invW <= 0 keeps its own why (GM-06b's), and adds no floor's.
    const behind = planOf(corner(-1, RED));
    expect(behind.why.join(' ')).toMatch(/invW <= 0/);
    expect(behind.why.join(' ')).not.toMatch(DEPTH);
  });

  it('item 1: a depthScale under f32\'s normal range (2^-126) is refused too -- the uniform itself could be flushed to 0', () => {
    expect(passDepthScale([atDepth(2 ** 127)], [0])).toBe(2 ** -128);
    const p = planFrame(list(corner(2 ** 127, RED)), () => null, {});
    expect(p.verdict).toBe('software');
    expect(p.why.join(' ')).toMatch(DEPTH);
    expect(planFrame(list(corner(2 ** 125, RED)), () => null, {}).verdict).toBe('gpu');   // depthScale 2^-126
  });

  it('item 2, the clamp above 1: no planned pass can reach a depth past 1 -- a pixel\'s f32 invW can exceed its largest vertex\'s by rounding (a witness), so the scale keeps a factor of 2', () => {
    // A witness (T2_third, T4_invW: the twin's and the GLSL's arithmetic): three vertices at invW 0.75; the f32 sum is
    // one ulp above 0.75. Under GM-15a's scale (the largest vertex brought to at most 1) a pass whose largest vertex
    // lands at or one ulp under 1 could so reach a depth past 1, where the clamp ties depths the software keeps apart.
    const w0 = Math.fround(0.8175441026687622), w1 = Math.fround(0.15435118973255157), w2 = T2_third(w0, w1);
    expect(w2).toBe(0.028104707598686218);
    expect(T4_invW(w0, w1, w2, 0.75, 0.75, 0.75)).toBeGreaterThan(0.75);
    // GM-15b's scale brings the largest vertex to at most 1/2; f32 rounding moves a pixel by a few ulps, never by 2x
    // (the per-pixel sweep is `uiGpuTwin.test.ts`'s): the clamp's upper bound is never reached on a planned pass.
    const rows: [number, number][] = [[0.5, 1], [0.25, 1], [0.75, 0.5], [1, 0.5], [2, 0.25], [3, 0.125], [Math.fround(1 - 2 ** -24), 0.5], [2 ** 100, 2 ** -101]];
    for (const [m, s] of rows) {
      expect(passDepthScale([atDepth(m)], [0]), `invW ${m}`).toBe(s);
      expect(Math.fround(m) * s, `invW ${m}`).toBeLessThanOrEqual(0.5);
    }
    // A vertex whose f32 is infinite (a finite f64 past f32's range): no loop, a scale of 0, and the plan refuses it.
    expect(passDepthScale([atDepth(1e39)], [0])).toBe(0);
    const inf = planFrame(list(corner(1e39, RED)), () => null, {});
    expect(inf.verdict).toBe('software');
    expect(inf.why.join(' ')).toMatch(DEPTH);
  });

  it('item 5 (GM-15a review F2): a textured triangle whose |u W| or |(1 - v) H| reaches UI_GPU_MODEL_TEXEL_RANGE (2^30) is refused -- T8\'s int(floor()) and wrapRepeat\'s -i - 1 stay in the int range', () => {
    expect(UI_GPU_MODEL_TEXEL_RANGE).toBe(2 ** 30);
    // 2^31 - 1 itself cannot be the boundary: its f32 is 2^31 (past INT_MAX), and a pixel's interpolated u can exceed
    // its largest vertex's by a few ulps; 2^30 leaves a factor of 2.
    expect(Math.fround(2 ** 31 - 1)).toBe(2 ** 31);
    const tex = solid(4, 4, [50, 60, 70, 255]);
    const textured = (u: number, v: number): { items: UiDrawItem[]; p: UiFramePlan } => {
      const vx = (x: number, y: number): UiModelVertex => ({ x, y, invW: 1, u, v, rgba: [128, 128, 128, 128] });
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [{ node: 'n', texture: 'a.tif', cull: false, a: vx(0, 0), b: vx(0, 16), c: vx(16, 0) }] }];
      return { items, p: planFrame(items, () => tex, {}) };
    };
    const rows: [number, number, 'gpu' | 'software', string][] = [
      [(2 ** 30 - 1) / 4, 0, 'gpu', 'u W = 2^30 - 1'],
      [2 ** 28, 0, 'software', 'u W = 2^30'],
      [-(2 ** 30 - 1) / 4, 0, 'gpu', 'u W = -(2^30 - 1)'],
      [-(2 ** 28), 0, 'software', 'u W = -2^30'],
      [(2 ** 31 - 1) / 4, 0, 'software', 'u W = 2^31 - 1'],
      [2 ** 29, 0, 'software', 'u W = 2^31'],
      [-(2 ** 29), 0, 'software', 'u W = -2^31 (INT_MIN: -i - 1 overflows)'],
      [0, 1 - (2 ** 30 - 1) / 4, 'gpu', '(1 - v) H = 2^30 - 1'],
      [0, 1 - 2 ** 28, 'software', '(1 - v) H = 2^30'],
      [0, 1 + (2 ** 30 - 1) / 4, 'gpu', '(1 - v) H = -(2^30 - 1)'],
      [0, 1 + 2 ** 28, 'software', '(1 - v) H = -2^30'],
      [0, 1 + 2 ** 29, 'software', '(1 - v) H = -2^31'],
    ];
    for (const [u, v, verdict, what] of rows) {
      const { items, p } = textured(u, v);
      expect(p.verdict, what).toBe(verdict);
      if (verdict === 'software') expect(p.why.join(' '), what).toMatch(TEXEL);
      else expect(p.why, what).toEqual([]);
      expect(sha(executeFramePlanOnCpu(p).frame), `${what}: the executor is the software`).toBe(sha(rasterizeUiDrawList(items, () => tex).frame));
    }
    // Untextured, u and v reach no sampler: no refusal.
    const flat: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [{ ...corner(1, RED), a: { ...corner(1, RED).a, u: 2 ** 40, v: -(2 ** 40) } }] }];
    expect(planFrame(flat, () => null, {}).verdict).toBe('gpu');
  });

  it('item 5: the range is the sampled image\'s -- an HD replacement 4 x wider moves the boundary 4 x nearer', () => {
    const a = solid(4, 4, [50, 60, 70, 255]), big = pattern(16, 16, 9);
    const at = (u: number): UiFramePlan => {
      const vx = (x: number, y: number): UiModelVertex => ({ x, y, invW: 1, u, v: 0, rgba: [128, 128, 128, 128] });
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, { kind: 'models', triangles: [{ node: 'n', texture: 'a.tif', cull: false, a: vx(0, 0), b: vx(0, 16), c: vx(16, 0) }] }];
      return planFrame(items, () => a, { scale: 2, hd: (b: UiBitmap) => (b === a ? big : null) });
    };
    expect(at((2 ** 30 - 1) / 16).textures.map((t) => [t.width, t.hd])).toEqual([[16, true]]);
    expect(at((2 ** 30 - 1) / 16).verdict).toBe('gpu');
    expect(at(2 ** 26).verdict).toBe('software');
    expect(at(2 ** 26).why.join(' ')).toMatch(TEXEL);
  });
});

describe('GM-06b: the movie step (research 380 P16, P17)', () => {
  it('case 8: a picture is one movie step at the origin, nearest s x s, its rectangle the picture times the scale', () => {
    for (const scale of UI_RASTER_CASE_SCALES) {
      const p = plan(caseOf('8'), scale, 'opaque');
      expect(p.steps.map((s) => s.kind)).toEqual(['movie']);
      const st = p.steps[0]!;
      if (st.kind !== 'movie') throw new Error('not a movie');
      expect([st.movie, st.rect]).toEqual([0, { xs: 0, ys: 0, xe: 4 * scale, ye: 3 * scale }]);
      expect([p.movies[0]!.width, p.movies[0]!.height]).toEqual([4, 3]);
      expect(p.volatile).toBe(true);
      expect(p.stats.movies).toBe(1);
    }
  });
  it('a picture larger than the frame is clipped to it', () => {
    const image = pattern(700, 500, 1);
    const items: UiDrawItem[] = [{ kind: 'movie', picture: { width: 700, height: 500, image }, x0: 0, y0: 0, x1: 640, y1: 448 }];
    const o = { scale: 2, movie: (pic: { image: unknown }) => pic.image as Rgba };
    const p = planFrame(items, () => null, o);
    const st = p.steps[0]!;
    expect(st.kind === 'movie' ? st.rect : null).toEqual({ xs: 0, ys: 0, xe: 1280, ye: 896 });
    expect(sha(executeFramePlanOnCpu(p).frame)).toBe(sha(rasterizeUiDrawList(items, () => null, o).frame));
  });
  it('a movie step and a clear end a programmable batch: a later quad never reads a copy taken before them', () => {
    const fill = (node: string, x0: number, y0: number): UiDrawItem =>
      ({ kind: 'sprite', node, texture: null, x0, y0, x1: x0 + 8, y1: y0 + 8, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [200, 100, 50, 64], clip: null });
    const movie: UiDrawItem = { kind: 'movie', picture: { width: 8, height: 8, image: pattern(8, 8, 4) }, x0: 0, y0: 0, x1: 640, y1: 448 };
    const o = { movie: (pic: { image: unknown }) => pic.image as Rgba };
    for (const [between, kind] of [[movie, 'movie'], [{ kind: 'clear', rgb: [9, 99, 199] } as UiDrawItem, 'clear']] as const) {
      const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, fill('a', 100, 100), between, fill('b', 0, 0)];
      const p = planFrame(items, () => null, { ...o, blend: 'exact' });
      expect(p.batches.map((b) => b.quads), kind).toEqual([[0], [1]]);
      expect(sha(executeFramePlanOnCpu(p).frame), kind).toBe(sha(rasterizeUiDrawList(items, () => null, o).frame));
    }
  });
  it('case 10: the no-picture movie stays a quad by source, and the register is not touched (P16)', () => {
    const p = plan(caseOf('10'), 1, 'opaque');
    expect(p.movies).toEqual([]);
    expect(p.volatile).toBe(false);
    expect(p.quads.find((q) => q.node === 'movie')!.blend).toBe('source');
  });
  it('the picture\'s pixels are not in the hash; its size is', () => {
    const items = (w: number, seed: number): UiDrawItem[] => [{ kind: 'movie', picture: { width: w, height: 3, image: pattern(w, 3, seed) }, x0: 0, y0: 0, x1: 640, y1: 448 }];
    const o = { movie: (pic: { image: unknown }) => pic.image as Rgba };
    const h = planFrame(items(4, 1), () => null, o).hash;
    expect(planFrame(items(4, 2), () => null, o).hash).toBe(h);
    expect(planFrame(items(5, 1), () => null, o).hash).not.toBe(h);
  });
});

describe('GM-06b: the plan hash covers the models', () => {
  it('a vertex, a cull flag or a node changes it', () => {
    const { items, textures, options } = caseRasterInputs(caseOf('2'), 2, 'opaque');
    const tris = (items[1] as Extract<UiDrawItem, { kind: 'models' }>).triangles!;
    type Tri = (typeof tris)[number];
    const hash = (f: (t: Tri) => Tri): string =>
      planFrame([items[0]!, { kind: 'models', triangles: [f(tris[0]!), ...tris.slice(1)] }], textures, { scale: 2, movie: options.movie }).hash;
    const h = planFrame(items, textures, { scale: 2, movie: options.movie }).hash;
    expect(hash((t) => t)).toBe(h);
    expect(hash((t) => ({ ...t, a: { ...t.a, invW: 1.5 } }))).not.toBe(h);
    expect(hash((t) => ({ ...t, a: { ...t.a, u: 0.25 } }))).not.toBe(h);
    expect(hash((t) => ({ ...t, cull: false }))).not.toBe(h);
    expect(hash((t) => ({ ...t, node: 'other' }))).not.toBe(h);
  });
});

/** Seeded lists with model passes and movie pictures among GM-06a's 2D lists, compared live with the software. */
function fuzzModels(seed: number): { items: UiDrawItem[]; textures: UiTextures; hd: (b: UiBitmap) => Rgba | null } {
  const base = fuzzList(seed);
  let s = (seed * 7919) >>> 0;
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(v: readonly T[]): T => v[Math.floor(rnd() * v.length)]!;
  const vertex = (x: number, y: number): UiModelVertex => ({
    x, y, invW: pick([1, 0.5, 2, 0.1, rnd() * 3 + 0.01]), u: rnd() * 2 - 0.5, v: rnd() * 2 - 0.5,
    rgba: [pick([128, 64, 200, 255, 0, 77.3]), pick([128, 0, 96]), pick([128, 255, 13]), pick([128, 64, 0, 1, 127, 12.8])],
  });
  const pass = (): UiDrawItem => ({
    kind: 'models',
    triangles: Array.from({ length: 12 }, (_, k) => {
      const x = rnd() * 60 - 4, y = rnd() * 40 - 4;
      const a = vertex(x, y), b = vertex(x + rnd() * 30 - 10, y + rnd() * 30), c = rnd() < 0.1 ? { ...b } : vertex(x + rnd() * 30, y + rnd() * 20 - 10);
      return { node: `m${k % 3}`, texture: pick([null, 'a.tif', 'b.tif', 'c.tif', 'gone.tif']), cull: rnd() < 0.5, a, b, c };
    }),
  });
  const items = base.items.slice();
  items.splice(10, 0, pass());
  items.splice(25, 0, pass());
  if (rnd() < 0.5) items.splice(5, 0, { kind: 'movie', picture: { width: 6, height: 4, image: pattern(6, 4, seed) }, x0: 0, y0: 0, x1: 640, y1: 448 });
  items.push(pass());
  return { ...base, items };
}

describe('GM-06b: the executor equals the live software on seeded lists with model passes and movie pictures', () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`seed ${seed}`, () => {
      const { items, textures, hd } = fuzzModels(seed);
      let drawn = 0;
      for (const scale of UI_RASTER_CASE_SCALES) for (const transparent of [false, true]) for (const blend of BLENDS) {
        const o = { scale, transparent, hd, movie: (pic: { image: unknown }) => pic.image as Rgba };
        const p = planFrame(items, textures, { ...o, blend });
        expect(p.verdict, p.why.join('; ')).toBe('gpu');
        drawn += p.triangles.length;
        const want = rasterizeUiDrawList(items, textures, o);
        const got = executeFramePlanOnCpu(p);
        expect(got.undrawn).toEqual(want.undrawn);
        expect(sha(got.frame), `seed ${seed} x${scale} ${transparent ? 'transparent' : 'opaque'} ${blend}`).toBe(sha(want.frame));
        if (blend === 'exact') expect(sha(executeFramePlanOnCpu(p, { sequential: true }).frame), `seed ${seed} sequential`).toBe(sha(got.frame));
      }
      expect(drawn).toBeGreaterThan(0);
    });
  }
});
