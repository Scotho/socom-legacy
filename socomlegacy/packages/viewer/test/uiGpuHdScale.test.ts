import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, type RasterOptions, type UiTextures } from '../src/uiCompositorView';
import { UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION, UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION, planFrame } from '../src/uiFramePlan';
import {
  GpuUiPresenter, UiGpuSurfacePresenter, upscaleFrameNearest, uiGpuFrameFallbackOptions, type UiGpuSurfaceOptions,
} from '../src/uiGpuPresenter';
import { uiGpuKeyCounts, type UiGpuHdKeys } from '../src/uiGpuTextures';
import { UiGpuBackend, createUiGpuBackend } from '../src/uiGpuWebgl2';
import type { UiPresenter, UiPresented } from '../src/uiPresenter';
import { HdMenuTextures } from '../src/hdMenuTextures';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

// GM-14a (plan 2026-11-01-gpu-menus, row GM-14a; GM.R9; research 380 §5) and GM-13's owed wiring (its review F3): HD on
// the GPU at 2 and 4 -- an L1 frame under HD drawn by the software at 1x (`UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`) and
// uploaded scaled (one NEAREST blit to the shown size), the dev sampling exception at the shown scale
// (`UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION`), and the page's HD keys (`HdMenuTextures`) and texture options set on every
// build of the backend. PRODUCT TRACK adaptations: which drawer makes a frame and at what scale, never a rule of the
// game. Held on the fake WebGL2 (`./uiGpuFakeGl.ts`, a model of the call contract, not a GPU). Evidence kind: unit test;
// the browser legs are `e2e/uiGpuParity.spec.ts` at `S2U_UI_GPU_PARITY_SCALES=1,2,4` (the box's).

const seeded = (w: number, h: number, seed: number): Rgba => {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = seed >>> 0;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return { width: w, height: h, data: d };
};
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const backendOn = (f: Fake, transparent = false, textures?: Parameters<typeof createUiGpuBackend>[1]['textures']): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent, textures });
  if (!b) throw new Error('no backend');
  return b;
};
const byKey = (key: string) => UI_RASTER_CASES.find((c) => c.key === key)!;
/**
 * GM-15a: a list's models moved behind the eye (every vertex's `invW` negated, so <= 0): a plan the GPU still leaves L1,
 * named by the planner -- the L1 frame these tests need now that the model cases are drawn on the GPU.
 */
const behindTheEye = (items: readonly UiDrawItem[]): UiDrawItem[] => items.map((it) => (it.kind === 'models' && it.triangles
  ? { ...it, triangles: it.triangles.map((t) => ({ ...t, a: { ...t.a, invW: -t.a.invW }, b: { ...t.b, invW: -t.b.invW }, c: { ...t.c, invW: -t.c.invW } })) }
  : it));
/** The L1 frame under HD as the page shows it: the software at the fallback scale, each pixel s x s (the reference). */
const l1Reference = (items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions, at: number): Rgba => {
  const s = (options.scale ?? 1) / at;
  const frame = rasterizeUiDrawList(items, textures, uiGpuFrameFallbackOptions(options, at)).frame;
  return s === 1 ? frame : upscaleFrameNearest(frame, s);
};

describe('GM-14a: the fallback scales are named adaptations (GM.R9)', () => {
  it('UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION is 1x; UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION is the shown scale', () => {
    expect(UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION.scale).toBe(1);
    expect(UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION.scale).toBe('shown');
  });

  it('the plan names its L1 scale: 1 at every scale; the shown scale under dev sampling other than bilinear', () => {
    const { items, textures, options } = caseRasterInputs(byKey('13.hot'), 2, 'opaque');
    for (const scale of [1, 2, 4]) {
      expect(planFrame(items, textures, { ...options, scale }).fallback, `${scale}x`).toEqual({ scale: 1, why: 'frame' });
      for (const mode of ['nearest', 'integer', 'sharpen'] as const) {
        const uiSampling = { enabled: true, mode, sharpness: 0.5, snap: 1 };
        expect(planFrame(items, textures, { ...options, scale, uiSampling }).fallback, `${scale}x ${mode}`).toEqual({ scale, why: 'dev-sampling' });
      }
      const bilinear = { enabled: true, mode: 'bilinear' as const, sharpness: 0.5, snap: 1 };
      expect(planFrame(items, textures, { ...options, scale, uiSampling: bilinear }).fallback).toEqual({ scale: 1, why: 'frame' });
    }
  });

  it('uiGpuFrameFallbackOptions: at a lower scale the HD lookup and the quad cache dropped (they are the HD scale\'s); at the shown scale unchanged', () => {
    const o: RasterOptions = { scale: 4, hd: () => null, quadCache: {} as never, transparent: true, movie: () => null };
    const at1 = uiGpuFrameFallbackOptions(o, 1);
    expect(at1.scale).toBe(1);
    expect(at1.hd).toBeUndefined();
    expect(at1.quadCache).toBeUndefined();
    expect(at1.transparent).toBe(true);
    expect(at1.movie).toBe(o.movie);
    expect(uiGpuFrameFallbackOptions(o, 4)).toBe(o);
  });

  it('upscaleFrameNearest repeats each pixel s x s, rows top first', () => {
    const f = seeded(3, 2, 7), up = upscaleFrameNearest(f, 2);
    expect([up.width, up.height]).toEqual([6, 4]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) for (let c = 0; c < 4; c++) {
      expect(up.data[(y * 6 + x) * 4 + c]).toBe(f.data[((y >> 1) * 3 + (x >> 1)) * 4 + c]);
    }
    expect(upscaleFrameNearest(f, 1)).toBe(f);
  });
});

describe('GM-14a: the scaled upload (UiGpuBackend.uploadFrame at a scale)', () => {
  it('uploads the small frame once and blits it NEAREST to s x its size: the target is the shown frame, each pixel s x s', () => {
    for (const transparent of [false, true]) for (const s of [2, 4]) {
      const f = fakeGl(), b = backendOn(f, transparent), frame = seeded(40, 28, s + (transparent ? 9 : 0));
      b.uploadFrame(frame, transparent, s);
      expect(b.frameSize).toEqual({ width: 40 * s, height: 28 * s });
      const up = f.calls.filter((c) => c[0] === 'texSubImage2D');
      expect(up).toHaveLength(1);
      expect([up[0]![5], up[0]![6]]).toEqual([40, 28]);
      const blit = f.calls.find((c) => c[0] === 'blitFramebuffer')!;
      expect(blit.slice(1)).toEqual([0, 0, 40, 28, 0, 0, 40 * s, 28 * s, GL.COLOR_BUFFER_BIT, GL.NEAREST]);
      expect(diff(b.readPixels().data, upscaleFrameNearest(frame, s).data), `${s}x ${transparent}`).toBe(0);
    }
  });

  it('at 1 it is the 1:1 upload it was (no blit); a scale that is not a whole number >= 1 is refused', () => {
    const f = fakeGl(), b = backendOn(f), frame = seeded(16, 8, 3);
    b.uploadFrame(frame, false, 1);
    expect(f.names()).not.toContain('blitFramebuffer');
    expect(diff(b.readPixels().data, frame.data)).toBe(0);
    for (const bad of [0, 1.5, -2, Number.NaN]) expect(() => b.uploadFrame(frame, false, bad), String(bad)).toThrow(/scale/);
  });

  it('keeps the small frame\'s texture across frames of one size, deletes it on dispose; abandon makes no GL call', () => {
    const f = fakeGl(), b = backendOn(f);
    b.uploadFrame(seeded(16, 8, 1), false, 2);
    const made = f.calls.filter((c) => c[0] === 'createTexture').length;
    b.uploadFrame(seeded(16, 8, 2), false, 2);
    expect(f.calls.filter((c) => c[0] === 'createTexture').length).toBe(made);
    const before = f.calls.filter((c) => c[0] === 'deleteTexture').length;
    b.dispose();
    expect(f.calls.filter((c) => c[0] === 'deleteTexture').length - before).toBe(2);   // the frame target and the small frame
    const g = fakeGl(), c = backendOn(g);
    c.uploadFrame(seeded(16, 8, 1), false, 2);
    const n = g.calls.length;
    c.abandon();
    expect(g.calls.length).toBe(n);
  });
});

describe('GM-14a: L1 at 1x under HD through the presenter (GM.R9)', () => {
  it('a frame the GPU does not draw at 2 and 4 (case 2\'s models behind the eye: the planner\'s named L1; GM-15a draws case 2 itself) is the software at 1x, shown at the HD size', () => {
    for (const s of [2, 4] as const) {
      const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
      const { items: drawn, textures, options } = caseRasterInputs(byKey('2'), s, 'opaque');
      const items = behindTheEye(drawn);
      const out = p.present(items, textures, options);
      expect(p.last!.path).toBe('software');
      expect(p.last!.drawnAt).toBe(1);
      expect([out.width, out.height]).toEqual([640 * s, 448 * s]);
      expect([f.canvas.width, f.canvas.height]).toEqual([640 * s, 448 * s]);
      const up = f.calls.find((c) => c[0] === 'texSubImage2D')!;
      expect([up[5], up[6]]).toEqual([640, 448]);
      expect(diff(p.readFrame()!.data, l1Reference(items, textures, options, 1).data), `${s}x`).toBe(0);
    }
  });

  it('at 1 an L1 frame is the software at 1 as before (drawnAt 1, no blit into the target)', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
    const { items: drawn, textures, options } = caseRasterInputs(byKey('2'), 1, 'opaque');
    const items = behindTheEye(drawn);                       // GM-15a: case 2 itself is drawn on the GPU now
    p.present(items, textures, options);
    expect(p.last!.path).toBe('software');
    expect(p.last!.drawnAt).toBe(1);
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(items, textures, options).frame.data)).toBe(0);
  });

  it('a transparent L1 frame at 2 (case 17\'s model behind the eye; GM-15a draws case 17 itself): the 1x software before its divide, scaled; readFrame divides it (P22)', () => {
    const c = UI_RASTER_CASES.find((x) => x.id === 17)!;
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f, true));
    const { items: drawn, textures, options } = caseRasterInputs(c, 2, 'transparent');
    const items = behindTheEye(drawn);
    p.present(items, textures, options);
    expect(p.last!.path).toBe('software');
    const pre = rasterizeUiDrawList(items, textures, { ...uiGpuFrameFallbackOptions(options, 1), preDivide: true }).frame;
    expect(diff(p.backend.readPixels().data, upscaleFrameNearest(pre, 2).data)).toBe(0);
    expect(diff(p.readFrame()!.data, l1Reference(items, textures, options, 1).data)).toBe(0);
  });

  it('a cold HD frame whose textures wait for the upload budget is the 1x software without the HD lookup, then the GPU', () => {
    const f = fakeGl(), p = new GpuUiPresenter(backendOn(f, false, { uploadBytesPerFrame: 1 }));
    const { items, textures, options } = caseRasterInputs(byKey('13.hot'), 2, 'opaque');
    p.present(items, textures, options);
    expect(p.last!.path).toBe('software');
    expect(p.last!.why.join(' ')).toMatch(/textures uploading/);
    expect(p.last!.drawnAt).toBe(1);
    const ref = l1Reference(items, textures, options, 1);
    expect(diff(p.readFrame()!.data, ref.data)).toBe(0);
    // The 1x frame is the original's: with the HD lookup at 1 the software would sample the HD images (a different frame).
    const withHd = upscaleFrameNearest(rasterizeUiDrawList(items, textures, { ...options, scale: 1, quadCache: undefined }).frame, 2);
    expect(diff(withHd.data, ref.data)).toBeGreaterThan(0);
    p.present(items, textures, options);
    expect(p.last!.path).toBe('gpu');
    expect(p.last!.drawnAt).toBeUndefined();
  });

  it('dev sampling (the exception, UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION): drawn by the software at the shown scale', () => {
    for (const mode of ['nearest', 'sharpen'] as const) {
      const f = fakeGl(), p = new GpuUiPresenter(backendOn(f));
      const { items, textures, options } = caseRasterInputs(byKey('13.warm'), 2, 'opaque');
      const o: RasterOptions = { ...options, uiSampling: { enabled: true, mode, sharpness: 0.5, snap: 1 } };
      p.present(items, textures, o);
      expect(p.last!.path).toBe('software');
      expect(p.last!.drawnAt).toBe(2);
      // No scaled upload: every blit is the present's 1:1.
      for (const c of f.calls.filter((x) => x[0] === 'blitFramebuffer')) expect([(c[3] as number) - (c[1] as number), Math.abs((c[4] as number) - (c[2] as number))]).toEqual([(c[7] as number) - (c[5] as number), Math.abs((c[8] as number) - (c[6] as number))]);
      const up = f.calls.find((c) => c[0] === 'texSubImage2D')!;
      expect([up[5], up[6]]).toEqual([1280, 896]);
      expect(diff(p.readFrame()!.data, rasterizeUiDrawList(items, textures, o).frame.data), mode).toBe(0);
    }
  });
});

// ---- GM-13 review F3: the HD keys and the texture options on every build --------------------------------------------

class SoftwareStub implements UiPresenter {
  readonly kind = 'cpu';
  present(_i: readonly UiDrawItem[], _t: UiTextures, options: RasterOptions = {}): UiPresented {
    const s = options.scale ?? 1;
    return { undrawn: [], width: 640 * s, height: 448 * s };
  }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
}

const solid = (w: number, h: number, rgba: [number, number, number, number]): Rgba => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
  return { width: w, height: h, data: d };
};

describe('GM-13 review F3 (owed to GM-14a): the page\'s HD keys and texture options reach every backend the surface builds', () => {
  const base = { a: solid(4, 4, [10, 20, 30, 255]), b: solid(4, 4, [40, 50, 60, 255]) };
  const hd = { a: solid(16, 16, [200, 20, 30, 255]), b: solid(16, 16, [40, 200, 60, 255]) };
  const bitmaps: Record<string, Rgba> = { 'a.tif': base.a, 'b.tif': base.b };
  const textures: UiTextures = (n) => bitmaps[n] ?? null;
  const sprite = (texture: string, x: number): UiDrawItem =>
    ({ kind: 'sprite', node: texture, texture, x0: x, y0: 0, x1: x + 32, y1: 32, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null });
  const items: UiDrawItem[] = [{ kind: 'clear', rgb: [0, 0, 0] }, sprite('a.tif', 0), sprite('b.tif', 40)];
  const lookup = (b: Rgba): Rgba | null => (b === base.a ? hd.a : b === base.b ? hd.b : null);
  const options: RasterOptions = { scale: 2, hd: lookup };

  it('an HD image is keyed by the pack (never hashed) on the first build and after a restore; the budget option holds on both', () => {
    const asked: Rgba[] = [];
    const keys: UiGpuHdKeys = { pack: 7, version: 1, gpuKeyOf: (img) => { asked.push(img); return img.data === hd.a.data ? 'hd|7|a' : img.data === hd.b.data ? 'hd|7|b' : null; } };
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined };
    const s = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareStub(), transparent: false, surface: 'front', clock,
      hdKeys: () => keys, textures: { uploadBytesPerFrame: 1 },
    });
    const hashed = uiGpuKeyCounts.hashed;
    s.present(items, textures, options);
    expect(s.stats.frames.L1).toBe(1);                 // the budget option: one texture up, the other waits (L1 at 1x)
    s.present(items, textures, options);
    expect(s.stats.frames.L0).toBe(1);
    expect(asked.map((x) => x.data)).toContain(hd.a.data);
    expect(asked.map((x) => x.data)).toContain(hd.b.data);
    expect(uiGpuKeyCounts.hashed - hashed, 'no HD image hashed on the first build').toBe(0);

    f.loss.lose(); f.events.flush();
    expect(f.loss.restore()).toBe(true);
    f.events.flush();
    asked.length = 0;
    s.present(items, textures, options);
    s.present(items, textures, options);
    expect(s.stats.frames.L1, 'the rebuilt backend kept the budget option').toBe(2);
    expect(s.stats.frames.L0).toBe(2);
    expect(asked.map((x) => x.data)).toContain(hd.a.data);
    expect(uiGpuKeyCounts.hashed - hashed, 'no HD image hashed after the restore').toBe(0);
  });

  it('the keys are asked at each frame: HD off (null) and a new pack reach the next frame', () => {
    let keys: UiGpuHdKeys | null = { pack: 1, version: 0, gpuKeyOf: (img) => (img.data === hd.a.data ? 'hd|1|a' : img.data === hd.b.data ? 'hd|1|b' : null) };
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined };
    const s = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareStub(), transparent: false, surface: 'front', clock,
      hdKeys: () => keys,
    });
    s.present(items, textures, options);
    const deleted = (): number => f.calls.filter((c) => c[0] === 'deleteTexture').length;
    const before = deleted();
    keys = { pack: 2, version: 0, gpuKeyOf: (img) => (img.data === hd.a.data ? 'hd|2|a' : img.data === hd.b.data ? 'hd|2|b' : null) };
    s.present(items, textures, options);
    expect(deleted() - before, 'the old pack\'s two textures freed at once').toBeGreaterThanOrEqual(2);
  });
});

describe('GM-14a: the HD keys meet the plan\'s textures', () => {
  it('HdMenuTextures.gpuKeyOf keys the image the planner hands the GPU (pickBitmap\'s copy of the kept replacement, sharing its pixels)', async () => {
    const src = solid(2, 2, [1, 2, 3, 255]), out = solid(8, 8, [9, 8, 7, 255]);
    const t = new HdMenuTextures({ replacement: async () => ({ width: out.width, height: out.height, data: out.data.slice() }) });
    t.lookup(src); await t.settled();
    const kept = t.lookup(src)!;
    expect(kept).not.toBeNull();
    const items: UiDrawItem[] = [{ kind: 'sprite', node: 'q', texture: 'a.tif', x0: 0, y0: 0, x1: 16, y1: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null }];
    const plan = planFrame(items, (n) => (n === 'a.tif' ? src : null), { scale: 2, hd: t.lookup });
    expect(plan.textures).toHaveLength(1);
    expect(plan.textures[0]!.hd).toBe(true);
    expect(t.gpuKeyOf(plan.textures[0]!.image)).toBe(t.gpuKeyOf(kept));
    expect(t.gpuKeyOf(plan.textures[0]!.image)).toMatch(new RegExp(`^hd\\|${t.pack}\\|[0-9a-f]{64}$`));
    expect(t.gpuKeyOf({ width: 8, height: 8, data: kept.data.slice() }), 'equal bytes in another array are not the kept image').toBeNull();
  });
});

describe('GM-14a: the page hands the HD keys to the front end\'s surface', () => {
  const src = readFileSync(resolve(fileURLToPath(new URL('.', import.meta.url)), '../src/frontEnd.ts'), 'utf8');
  it('frontEnd.ts builds the surface with hdKeys from the menus\' HD lookup (HdMenus.keys)', () => {
    expect(src).toMatch(/hdKeys: \(\) => hdMenus\?\.keys\(\) \?\? null/);
  });
});
