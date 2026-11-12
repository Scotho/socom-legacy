import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, type RasterOptions, type UiTextures } from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import { GpuUiPresenter, UiGpuSurfacePresenter, upscaleFrameNearest, uiGpuFrameFallbackOptions, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UiGpuSwitch } from '../src/uiGpuSwitch';
import { UI_GPU_OVERSIZE_ROUTE_ADAPTATION, uiGpuOversizeRefusal, uiGpuOversized, uiGpuRefusalKey } from '../src/uiGpuTextures';
import { UiGpuBackend, createUiGpuBackend } from '../src/uiGpuWebgl2';
import type { UiPresenter, UiPresented } from '../src/uiPresenter';
import { GL, fakeGl, type Fake } from './uiGpuFakeGl';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

// GM-14b (plan 2026-11-01-gpu-menus, row GM-14b; GM.R9, GM.R19; research 380 §5, "the large-image route"): case 15 --
// an HD image past the device's `MAX_TEXTURE_SIZE` -- on a faked limit (the fake WebGL2's `maxTexture`, `./uiGpuFakeGl.ts`,
// a model of the call contract, not a GPU). The route, `UI_GPU_OVERSIZE_ROUTE_ADAPTATION`: the frame is L1 at its
// fallback scale (1x under HD, the original frame), no texture past the limit is made, and the frame is counted on the
// read-out (`window.__uiGpu.refusals.counts`) under one key whatever image it was. Evidence kind: unit test; the rendered
// browser run on a real GPU is the boxes' (GM-27's wave), not run here.

const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  if (a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const backendOn = (f: Fake): UiGpuBackend => {
  const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false });
  if (!b) throw new Error('no backend');
  return b;
};
const case15 = UI_RASTER_CASES.find((c) => c.id === 15)!;
const ROUTE = UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason;
/** The L1 frame under HD as the page shows it: the software at the fallback scale, each pixel s x s. */
const l1Reference = (items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions, at: number): Rgba => {
  const s = (options.scale ?? 1) / at;
  const frame = rasterizeUiDrawList(items, textures, uiGpuFrameFallbackOptions(options, at)).frame;
  return s === 1 ? frame : upscaleFrameNearest(frame, s);
};
/** No texture the fake made is past `max` on either side. */
const noTexturePast = (f: Fake, max: number): boolean => f.textures.every((t) => t.w <= max && t.h <= max);
/** Case 15's list with its HD image swapped for a two-halves `w x h` one (A left, B right): an image past a floor limit. */
const case15With = (w: number, h: number): ReturnType<typeof caseRasterInputs> => {
  const base = caseRasterInputs(case15, 2, 'opaque');
  const big: Rgba = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) big.data.set(x < w / 2 ? [30, 60, 90, 255] : [200, 150, 100, 255], (y * w + x) * 4);
  const bitmap = base.textures('bg.tif')!;
  return { ...base, options: { ...base.options, hd: (b) => (b === bitmap ? big : null) } };
};

/** The software presenter the surface falls back to, a recorder (as `uiGpuLifecycle.test.ts`'s). */
class SoftwareRecorder implements UiPresenter {
  readonly kind = 'cpu';
  present(_items: readonly UiDrawItem[], _t: UiTextures, options: RasterOptions = {}): UiPresented {
    const s = options.scale ?? 1;
    return { undrawn: [], width: 640 * s, height: 448 * s };
  }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
}
const clock = { now: () => 1000, setTimeout: () => 0, clearTimeout: () => undefined };

describe('GM-14b: case 15 on a faked MAX_TEXTURE_SIZE (UI_GPU_OVERSIZE_ROUTE_ADAPTATION)', () => {
  it('the route is a named adaptation: L1 at the fallback scale, one read-out key', () => {
    expect(UI_GPU_OVERSIZE_ROUTE_ADAPTATION.route).toBe('frame-fallback');
    expect(UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason).toMatch(/MAX_TEXTURE_SIZE/);
    expect(UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason).toMatch(/UI_GPU_OVERSIZE_ROUTE_ADAPTATION/);
    expect(Object.isFrozen(UI_GPU_OVERSIZE_ROUTE_ADAPTATION)).toBe(true);
  });

  it('uiGpuOversized names the planned textures past a limit: case 15\'s 2048 x 2048 HD image past 1536, none past 2048', () => {
    const { items, textures, options } = caseRasterInputs(case15, 1, 'opaque');
    const plan = planFrame(items, textures, { scale: 1, hd: options.hd });
    expect(uiGpuOversized(plan.textures, 1536)).toEqual([{ name: 'bg.tif', width: 2048, height: 2048, hd: true }]);
    expect(uiGpuOversized(plan.textures, 2048)).toEqual([]);
  });

  it('at 2x on a limit of 1536 (the 1280 x 896 frame fits, the image does not): refused with the route\'s reason, L1 at 1x equal to the software, nothing past the limit made', () => {
    const { items, textures, options } = caseRasterInputs(case15, 2, 'opaque');
    const f = fakeGl({ maxTexture: 1536 }), b = backendOn(f);
    const plan = planFrame(items, textures, { scale: 2, hd: options.hd });
    expect(plan.verdict).toBe('gpu');                       // the planner draws it; only this device's limit refuses it
    const said = `${ROUTE}: bg.tif (HD, 2048 x 2048) past MAX_TEXTURE_SIZE 1536`;   // review F2: the image named
    expect(b.refusal(plan)).toBe(said);
    const p = new GpuUiPresenter(b);
    p.present(items, textures, options);
    expect(p.last).toMatchObject({ path: 'software', why: [said], drawnAt: 1 });
    expect(diff(p.readFrame()!.data, l1Reference(items, textures, options, 1).data)).toBe(0);
    expect(noTexturePast(f, 1536)).toBe(true);
    expect(f.calls.some((c) => c[0] === 'texSubImage2D' && c[7] === GL.RGBA_INTEGER)).toBe(false);   // no bitmap sent
  });

  it('at 2x on a limit of 2048 the same image fits: the route is not taken, the frame is the GPU\'s (L0)', () => {
    const { items, textures, options } = caseRasterInputs(case15, 2, 'opaque');
    const p = new GpuUiPresenter(backendOn(fakeGl({ maxTexture: 2048 })));
    p.present(items, textures, options);
    expect(p.last!.path).toBe('gpu');
  });

  it('at 1x (no HD scale) the route\'s frame is the software at 1x, as GM-14a\'s L1', () => {
    const { items, textures, options } = caseRasterInputs(case15, 1, 'opaque');
    const p = new GpuUiPresenter(backendOn(fakeGl({ maxTexture: 1024 })));
    p.present(items, textures, options);
    expect(p.last).toMatchObject({ path: 'software', why: [`${ROUTE}: bg.tif (HD, 2048 x 2048) past MAX_TEXTURE_SIZE 1024`], drawnAt: 1 });
    expect(diff(p.readFrame()!.data, rasterizeUiDrawList(items, textures, options).frame.data)).toBe(0);
  });

  it('on the surface at the capability floor (4096): images past it are counted on the read-out under one key, L1 each, never L4 or a loss', () => {
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTexture: 4096 });
    const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
    const s = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareRecorder(), transparent: false, surface: 'front', clock, host: swi,
      hdKeys: () => ({ pack: 7, version: 1, gpuKeyOf: (image: Rgba) => `hd|7|w${image.width}` }),   // the page's pack keys, made up
    });
    s.present([{ kind: 'clear', rgb: [1, 2, 3] }], () => null, { scale: 2 });
    expect(s.lastPath).toBe('gpu');
    for (const w of [4100, 8192]) {                         // HD_LIMITS.outputEdge, the largest image a pack may name
      const { items, textures, options } = case15With(w, 4);
      s.present(items, textures, options);
    }
    expect(s.stats.frames).toMatchObject({ L0: 1, L1: 2, L2: 0, L3: 0, L4: 0 });
    expect(s.stats.losses).toBe(0);
    expect(swi.readout().refusals.counts).toEqual({ [ROUTE]: 2 });                // one key, whatever the image
    // Review F2: the last refusal names the image that fired the route -- its pack key, size and the limit.
    expect(swi.readout().refusals.last).toEqual({ surface: 'front', why: [`${ROUTE}: bg.tif (HD hd|7|w8192, 8192 x 4) past MAX_TEXTURE_SIZE 4096`], at: 2 });
    expect(swi.readout().levels.L1).toBe(2);
    expect(noTexturePast(f, 4096)).toBe(true);
  });

  it('review F2: the refusal carries each image (name, HD key or bitmap, size, limit); uiGpuRefusalKey folds it to the one reason', () => {
    const two = uiGpuOversizeRefusal([{ name: 'a.tif', width: 8192, height: 64, hd: true }, { name: 'b.tif', width: 5000, height: 5000, hd: false }], 4096, (i) => (i === 0 ? 'hd|1|k' : null));
    expect(two).toBe(`${ROUTE}: a.tif (HD hd|1|k, 8192 x 64) past MAX_TEXTURE_SIZE 4096; b.tif (bitmap, 5000 x 5000) past MAX_TEXTURE_SIZE 4096`);
    expect(uiGpuRefusalKey(two)).toBe(ROUTE);
    expect(uiGpuRefusalKey('textures uploading: 5 bytes wait for the next frame (HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION)')).toBe('textures uploading: 5 bytes wait for the next frame (HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION)');
    const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
    swi.refused('front', [two]);
    swi.refused('front', [`${ROUTE}: c.tif (HD, 4100 x 4) past MAX_TEXTURE_SIZE 4096`]);
    expect(swi.readout().refusals.counts).toEqual({ [ROUTE]: 2 });
    expect(swi.readout().refusals.last!.why).toEqual([`${ROUTE}: c.tif (HD, 4100 x 4) past MAX_TEXTURE_SIZE 4096`]);
  });
});
