import { describe, expect, it } from 'vitest';
import type { UiDrawItem } from '@s2u/ui';
import { UI_PLAN_CODE, planFrame, type UiFramePlan } from '../src/uiFramePlan';
import * as webgl2 from '../src/uiGpuWebgl2';
import { UI_GPU_INSTANCE_LAYOUT, createUiGpuBackend, gpuChannel, type UiGpuBackend } from '../src/uiGpuWebgl2';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import type { UiBitmap, UiTextures } from '../src/uiCompositorView';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

// GM-32 (plan 2026-11-01-gpu-menus, row GM-32; product track, a cost): the backend's per-frame uploads on unchanged
// content -- the T4 profile's `uploadAxis` 31.0 ms, `texSubImage2D` 47.9 ms and `uploadInstances` 18.2 ms over the 4x cold
// switch. The axis table is uploaded only when its f32 bits differ from what the texture holds; the instance records are
// written word by word with the same values. Held on the fake WebGL2 context (unit test; no browser): the frame's bytes
// are the twin's either way. New exports read through the module object, so a missing one fails its own test.

const backendOn = (f: Fake): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false });
  if (!b) throw new Error('no backend');
  return b;
};
const diff = (a: ArrayLike<number>, b: ArrayLike<number>): number => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
const seeded = (w: number, h: number, seed: number): UiBitmap => {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = seed >>> 0;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return { width: w, height: h, data: d };
};
const A = seeded(32, 16, 7);
const textures: UiTextures = (n) => (n === 'a.tif' ? A : null);
const frame = (u0: number, alpha: number): UiDrawItem[] => [
  { kind: 'clear', rgb: [10, 20, 30] } as UiDrawItem,
  { kind: 'sprite', node: 's', texture: 'a.tif', x0: 4, y0: 6, x1: 60, y1: 40, u0, v0: 0.1, u1: u0 + 0.8, v1: 0.9, rgba: [128, 128, 128, alpha], clip: null } as UiDrawItem,
];
/** The axis uploads: `texSubImage2D` of FLOAT data (the only RGBA32F texture the backend writes). */
const axisUploads = (f: Fake): number => f.calls.filter((c) => c[0] === 'texSubImage2D' && c[8] === GL.FLOAT).length;
const stats = (b: UiGpuBackend): { uploads: number; kept: number } => (b as unknown as { axisStats: { uploads: number; kept: number } }).axisStats;

describe('GM-32: the axis table uploaded only when it changed', () => {
  it('the same table again (a fade: the colour moves, the texels not) uploads nothing; a moved texel uploads once; the frames are the twin\'s', () => {
    const f = fakeGl(), b = backendOn(f);
    const plans: UiFramePlan[] = [planFrame(frame(0.1, 128), textures, { scale: 2 }), planFrame(frame(0.1, 96), textures, { scale: 2 }), planFrame(frame(0.1, 64), textures, { scale: 2 }), planFrame(frame(0.2, 64), textures, { scale: 2 }), planFrame(frame(0.2, 32), textures, { scale: 2 })];
    expect(plans[1]!.axis).toEqual(plans[0]!.axis);
    const uploads: number[] = [];
    for (const p of plans) {
      b.draw(p);
      uploads.push(axisUploads(f));
      expect(diff(b.readPixels().data, executeFramePlanOnTwin(p, { divide: false }).frame.data)).toBe(0);
    }
    expect(uploads).toEqual([1, 1, 1, 2, 2]);
    expect(stats(b)).toEqual({ uploads: 2, kept: 3 });
  });

  it('a re-made texture (the table outgrew it, or the context was lost) holds nothing: its first frame uploads', () => {
    const f = fakeGl(), b = backendOn(f);
    const small = planFrame(frame(0.1, 128), textures, { scale: 1 });
    const big = planFrame([...frame(0.1, 128), ...Array.from({ length: 40 }, (_, i) => ({ kind: 'sprite', node: `g${i}`, texture: 'a.tif', x0: 0, y0: i * 10, x1: 600, y1: i * 10 + 9, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null }) as UiDrawItem)], textures, { scale: 4 });
    b.draw(small); b.draw(small);
    expect(axisUploads(f)).toBe(1);
    b.draw(big);                                                              // past the texture's rows: re-made
    expect(axisUploads(f)).toBe(2);
    b.draw(small);                                                            // fits the big texture; its bits differ
    expect(axisUploads(f)).toBe(3);
    expect(diff(b.readPixels().data, executeFramePlanOnTwin(small, { divide: false }).frame.data)).toBe(0);
  });

  it('every GM-03 case drawn twice in a row: the second draw uploads no axis and its frame is the first\'s', () => {
    for (const c of UI_RASTER_CASES) {
      const { items, textures: tx, options } = caseRasterInputs(c, 2, 'opaque');
      const { quadCache: _q, ...rest } = options;
      const p = planFrame(items, tx, { ...rest, blend: 'exact' });
      if (p.verdict !== 'gpu' || !p.axis.length) continue;
      const f = fakeGl(), b = backendOn(f);
      b.draw(p);
      const once = b.readPixels().data.slice(), n = axisUploads(f);
      b.draw(p);
      expect(axisUploads(f), String(c.id)).toBe(n);
      expect(diff(b.readPixels().data, once), String(c.id)).toBe(0);
    }
    // Every GM-03 case rasterised twice on the fake GL: ~6 s alone on an 8-vCPU c7a (gmxbox1f, 2026-11-10), past the 5 s
    // default; the explicit bound of its siblings (uiGpuFallbackCount, uiGpuLoadingParity). A test's own, nothing of the game.
  }, 60_000);
});

describe('GM-32: the instance records written word by word -- the same bytes', () => {
  const value = (webgl2 as Record<string, unknown>).gpuChannelValue as (v: number, c: number) => number;
  const code = (webgl2 as Record<string, unknown>).gpuChannelCode as (v: number, c: number) => number;

  it('gpuChannelValue and gpuChannelCode are gpuChannel\'s two halves over the edges (f32 overflow, infinities, NaN, -0, codes)', () => {
    const vs = [0, -0, 1, -1, 127.5, 255, 1e38, 3.4028235677973366e38, 3.5e38, -3.5e38, Infinity, -Infinity, NaN, 5e-324];
    for (const v of vs) for (const c of [UI_PLAN_CODE.finite, UI_PLAN_CODE.nan, UI_PLAN_CODE.posInf, UI_PLAN_CODE.negInf]) {
      const [gv, gc] = gpuChannel(v, c);
      expect(Object.is(value(v, c), gv), `${v} ${c}`).toBe(true);
      expect(code(v, c), `${v} ${c}`).toBe(gc);
    }
  });

  it('the instance buffer holds, for every quad of every GM-03 case, the record the arrays wrote (rect, gpuChannel numbers and codes, axis, flags)', () => {
    const L = UI_GPU_INSTANCE_LAYOUT;
    let records = 0;
    for (const c of UI_RASTER_CASES) {
      const { items, textures: tx, options } = caseRasterInputs(c, 2, 'opaque');
      const { quadCache: _q, ...rest } = options;
      const p = planFrame(items, tx, { ...rest, blend: 'exact' });
      if (p.verdict !== 'gpu') continue;
      const f = fakeGl(), b = backendOn(f);
      b.draw(p);
      const order = p.steps.flatMap((s) => (s.kind === 'quads' ? s.quads : []));
      if (!order.length) continue;
      const expected = new ArrayBuffer(order.length * L.stride), i32 = new Int32Array(expected), f32 = new Float32Array(expected);
      order.forEach((i, n) => {
        const q = p.quads[i]!, at = n * (L.stride / 4), ch = [0, 1, 2, 3].map((k) => gpuChannel(q.colour[k]!, q.codes[k]!));
        i32.set([q.rect.xs, q.rect.ys, q.rect.xe, q.rect.ye], at + L.a_rect / 4);
        f32.set(ch.map((x) => x[0]!), at + L.a_colour / 4);
        i32.set(ch.map((x) => x[1]!), at + L.a_codes / 4);
        i32.set([q.axis ? q.axis.column / 4 : 0, q.axis ? q.axis.row / 4 : 0, q.texture === null ? 0 : 1, 0], at + L.a_axis / 4);
        i32.set([q.zeroMask, q.blend === 'additive' ? 1 : 0], at + L.a_flags / 4);
      });
      const len = order.length * L.stride, want = Buffer.from(expected);
      const held = f.buffers.some((x) => x.data && x.data.length >= len && Buffer.from(x.data.buffer, x.data.byteOffset, len).equals(want));
      expect(held, String(c.id)).toBe(true);
      records += order.length;
    }
    expect(records).toBeGreaterThan(50);
  });
});
