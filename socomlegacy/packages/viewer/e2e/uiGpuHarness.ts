import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import type { ArmoryQuad } from '../src/armoryLayout';
import { loadingBitmap, loadingDrawList } from '../src/loadingPanel';
import { rasterizeUiDrawList, type RasterOptions, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
import { planFrame, type UiPlanBlendMode } from '../src/uiFramePlan';
import { executeFramePlanOnCpu } from '../src/uiFramePlanCpu';
import { GpuUiPresenter, UI_GPU_BASE_STEPS, uiGpuFrameFallbackOptions, upscaleFrameNearest } from '../src/uiGpuPresenter';
import type { UiSamplingMode } from '../src/experimentalUiSampling';
import { executeFramePlanOnTwin, twinStats, type UiGpuTwinStats } from '../src/uiGpuTwin';
import { createUiGpuBackend, uiGpuPremultipliedPresent, type UiGpuBackend } from '../src/uiGpuWebgl2';
import { clearBytes } from '../src/uiRasterRules';
import { UI_RASTER_CASES, UI_SEAM_CLEAR, UI_SEAM_TEXEL, caseRasterInputs, seamPixels, seamSquares, type UiRasterMode, type UiRasterScale, type UiSeamSquare } from '../test/uiRasterCases';

/**
 * GM-11a-1 (the GPU menus plan; product track, a test instrument -- never shipped, nothing of the game changed): the
 * GPU harness page, `/?uiGpuHarness`. `./uiGpuHarness.spec.ts` serves it in place of the app (a routed document whose
 * module script imports this file from the run's Vite server and calls `installUiGpuHarness`), so the page holds two
 * canvases and the WebGL2 base, and nothing else of the app runs. The hook (`window.__uiGpuHarness`) draws on the real
 * GPU the browser gives and compares with the software (`rasterizeUiDrawList`) in the same page, byte for byte; every
 * comparison returns its counts and the first differing byte, never only a verdict. GM-11b made it the parity
 * spec's page too (`parityRun`: GM-03's cases on both drawers, the frames handed back for `./uiGpuParity.spec.ts` to
 * write out); GM-04's corpus is read from the dev disc in Node and is not in this page yet. GM-30 adds GM-23's leg, the
 * loading panel's frame (`loadingParityRun`: synthetic quads through `../src/loadingPanel` `loadingDrawList`, since this
 * page loads no map archive).
 */

export const UI_GPU_HARNESS_HOOK = '__uiGpuHarness';

/** One comparison: the bytes compared, how many differ, the first that differs (index, GPU's, software's). */
export interface UiGpuHarnessCompare {
  name: string;
  path: 'gpu' | 'software' | 'base';
  why: string[];
  width: number;
  height: number;
  bytes: number;
  differ: number;
  first: { index: number; x: number; y: number; channel: number; gpu: number; software: number } | null;
}

export interface UiGpuHarness {
  ready: true;
  /** The renderer strings: `RENDERER`, and `UNMASKED_RENDERER_WEBGL` where `WEBGL_debug_renderer_info` is exposed. */
  renderer(): { renderer: string | null; unmasked: string | null; vendor: string | null; version: string | null };
  /** One clear of the bytes of `(k, 255 - k, 37 k mod 256)` for every k, each read back: 256 frames of one pixel compared. */
  clearSweep(mode: UiRasterMode): UiGpuHarnessCompare;
  /** Case 9's clear alone, drawn by the presenter (path `gpu`), against the software's frame of the same list. */
  case9Clear(scale: UiRasterScale, mode: UiRasterMode): UiGpuHarnessCompare;
  /** A GM-03 case whole through the presenter (on the GPU where the base draws it, else L1, uploaded). */
  presentCase(id: number, scale: UiRasterScale, mode: UiRasterMode): UiGpuHarnessCompare;
  /** A seeded frame of every byte value uploaded and read back from the frame target. */
  roundTrip(scale: UiRasterScale, mode: UiRasterMode, seed: number): UiGpuHarnessCompare;
  /** A seeded opaque frame uploaded and presented; the canvas's default framebuffer read at once (RGB; its row H - 1 is the page's top). */
  presentOrientation(scale: UiRasterScale, seed: number): UiGpuHarnessCompare;
  /**
   * GM-19a (the overlay's leg; `UI_GPU_PREMULTIPLIED_PRESENT_ADAPTATION`): a seeded transparent frame -- every byte value,
   * most pixels with a channel over their alpha, as the software's pre-divide bytes can be -- uploaded (as an L1 frame is)
   * and presented on the premultiplied canvas. The canvas's default framebuffer is read at once against the rule (each
   * channel at most its alpha, flipped once: `shown`), the frame target against the frame (the pre-divide bytes kept:
   * `target`), and the canvas's pixels with a channel over their alpha counted (`overAlpha`, held at 0).
   */
  premultipliedPresent(scale: UiRasterScale, seed: number): { shown: UiGpuHarnessCompare; target: UiGpuHarnessCompare; overAlpha: number };
  /**
   * GM-11a-3: a movie of `pictures` seeded pictures (each its own buffer, as the worker hands them), each shown for two
   * renders, through the presenter at `scale`: every frame against the software; the uploads counted per render.
   */
  movieRun(scale: UiRasterScale, pictures: number): UiGpuHarnessCompare & { uploadsPerRender: number[] };
  /**
   * GM-11a-3: GPU time by `EXT_disjoint_timer_query_webgl2` on a fresh backend: `frames` draws of GM-03's case `id`, a
   * frame apart, then up to 60 frames of polling. `available` false where the browser has no such extension.
   */
  gpuTime(id: number, scale: UiRasterScale, frames: number): Promise<{ available: boolean; ms: number[]; stats: { timed: number; skipped: number; disjoint: number; pending: number } | null }>;
  /**
   * GM-11b: one parity run -- GM-03's case `key` at `scale`, `mode` and `blend` -- drawn by the f64 CPU executor
   * (`executeFramePlanOnCpu`) and by the WebGL2 backend through the presenter, in this page, and compared byte for byte.
   */
  parityRun(key: string, scale: UiRasterScale, mode: UiRasterMode, blend: UiPlanBlendMode): UiGpuHarnessParity;
  /**
   * GM-14a (GM.R9's exception, `UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION`): GM-03's case `key` under dev sampling `sampling`
   * (`?expMenu`'s modes other than bilinear) through the presenter: L1 drawn by the software at the shown scale, compared
   * with the software's frame of the same options.
   */
  devSamplingRun(key: string, scale: UiRasterScale, mode: UiRasterMode, sampling: UiSamplingMode): UiGpuHarnessL1Run;
  /**
   * GM-14a (GM.R9, `UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`): GM-03's case `key` on a fresh backend whose per-frame upload
   * budget is 1 byte, so a frame naming two or more textures waits for them (L1): its first frame is the software at 1x
   * under HD, shown s x s, compared with that; then presented until its textures are up (at most 16 presents).
   */
  /**
   * GM-30 (GM-23's parity leg): the loading panel's frame -- synthetic panel quads (`loadingPanelInputs`) through the
   * panel's own `loadingDrawList` and `loadingBitmap`, opaque as the panel is -- drawn by the f64 CPU executor and by the
   * WebGL2 backend through the presenter, compared as `parityRun` compares a GM-03 case.
   */
  loadingParityRun(params: UiGpuLoadingParams, scale: UiRasterScale, blend: UiPlanBlendMode): UiGpuHarnessParity;
  coldUploadRun(key: string, scale: UiRasterScale, mode: UiRasterMode): UiGpuHarnessL1Run & {
    textures: number; presents: number; finalPath: 'gpu' | 'software';
    /** GM-14a review F2: a first frame drawn on the GPU, against the CPU executor through the twin's mask (and the twin's own); null on L1. */
    gpu: UiGpuTwinStats | null; twin: UiGpuTwinStats | null;
    /** GM-14a re-review (1): a transparent GPU first frame's exact class before its divide (P14/P22); null otherwise. */
    preExactDiffering: number | null;
  };
  /**
   * GM-31 (leg 2: GM-27's real-GPU seam count; GM-15d review F2): GM-15b's seam list `list` (`seamSquares`, 24 squares
   * each split along a shared edge, an additive texel over a clear) at `scale` and `blend`, drawn through the models pass
   * by the presenter on the opaque backend, read back; every seam pixel counted on the GPU's frame (`classifySeamPixels`:
   * once, twice, a hole, other; and equal to the software's) and on the software's (`rasterizeUiDrawList`).
   */
  seamRun(list: UiGpuSeamList, scale: UiRasterScale, blend: UiPlanBlendMode): UiGpuHarnessSeams;
}

/** GM-31: one seam run's result. `frames` (base64, the GPU's and the software's) only when a GPU seam pixel is not once. */
export interface UiGpuHarnessSeams {
  list: UiGpuSeamList; scale: UiRasterScale; blend: UiPlanBlendMode;
  path: 'gpu' | 'software'; why: string[];
  /** The plan is one the base draws (verdict `gpu`, every step in `UI_GPU_BASE_STEPS`). */
  expectGpu: boolean;
  refusal: string | null;
  presents: number;
  squares: number;
  gpu: UiGpuSeamClass;
  software: UiGpuSeamClass;
  /** The whole GPU frame against the software's (B: recorded, not held). */
  frame: UiGpuHarnessCompare;
  frames: { gpu: string; cpu: string } | null;
}

/** GM-14a: one L1 run -- the path, its reasons, the scale the software drew at, and the frame against the L1 reference. */
export interface UiGpuHarnessL1Run {
  key: string; scale: UiRasterScale; mode: UiRasterMode;
  path: 'gpu' | 'software'; why: string[]; drawnAt: number | null;
  compare: UiGpuHarnessCompare;
}

/**
 * GM-11b: one parity run's result. `shown` compares the frames as the page shows them (`readFrame()`, P22's divide
 * applied on a transparent frame; the CPU executor divides the same way); `pre` the transparent frame before its divide
 * (`readPixels()` against the software's `preDivide` frame, the buffer P14/P22 name), null on an opaque frame. `gpu`
 * and `twin` are B statistics against the CPU executor's frame through the f32 twin's exact-class mask (research 380
 * §1.1): `exactDiffering` is the E/E* count, held at 0. `frames` are the two shown frames, base64, for the files.
 */
export interface UiGpuHarnessParity {
  key: string;
  scale: UiRasterScale;
  mode: UiRasterMode;
  blend: UiPlanBlendMode;
  /** The presenter's path for the frame, and its reasons (an L1 frame's). */
  path: 'gpu' | 'software';
  why: string[];
  /** The plan is one the base draws (verdict `gpu`, every step in `UI_GPU_BASE_STEPS`): the GPU must draw it. */
  expectGpu: boolean;
  /** What the backend refuses in the plan (`UiGpuBackend.refusal`), or null. */
  refusal: string | null;
  /** Presents until the frame's textures were up (GM-13's per-frame budget). */
  presents: number;
  /** GM-14a: an L1 frame's scale as the software drew it (`GpuPresentRecord.drawnAt`); null on a GPU frame. */
  drawnAt: number | null;
  /**
   * GM-14a: an L1 frame against the L1 reference -- the software at `drawnAt` with the fallback's options, each pixel
   * `scale / drawnAt` times (`upscaleFrameNearest`) -- 0 bytes differ; null on a GPU frame. Under HD an L1 frame is the 1x
   * frame (GM.R9), not the executor's at the shown scale, so `shown`, `gpu` and the bound do not hold it.
   */
  l1: UiGpuHarnessCompare | null;
  width: number;
  height: number;
  shown: UiGpuHarnessCompare;
  pre: (UiGpuHarnessCompare & { exactDiffering: number }) | null;
  gpu: UiGpuTwinStats;
  twin: UiGpuTwinStats;
  frames: { gpu: string; cpu: string };
}

/**
 * GM-30: one synthetic loading-panel frame's parameters (the case table is `./uiGpuParityRecord` `UI_GPU_LOADING_CASES`):
 * the fader (MENUFADER's alpha, 0..128 on the GS's scale, `loadingDrawList`'s `fader`), the alpha of the picture's and the
 * title's quads (over 128 is not clamped, P8) and their GS colour (128 the identity modulate).
 */
export interface UiGpuLoadingParams { key: string; fader: number; alpha: number; rgb: [number, number, number] }

/** A seeded bitmap: every byte from the seed's LCG, alpha too unless `opaque` (then 255). */
function seededBitmap(w: number, h: number, seed: number, opaque: boolean): Rgba {
  const data = seeded(w * h * 4, seed);
  if (opaque) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: w, height: h, data };
}

/**
 * GM-30 (a test instrument; nothing of the game): a loading panel's frame made up of the quads its layout gives
 * (`./loadingLayout` `loadingQuads`' kinds, in its order) -- the background over the whole frame (opaque texels, the
 * identity colour, alpha 128), the map's picture (580 x 210 at (30, 120), the layout's box), the title's glyphs at
 * fractional places from a font atlas whose texels carry every alpha, and the disc -- with `params`' alpha and colour on
 * the picture, the title and the disc, through the panel's own `loadingDrawList` (MENUFADER last at `params.fader`) and
 * its bitmaps as `loadingBitmap` makes them (`LOADING_TEXTURE_BLEND_READING`). Opaque, at `scale`, no HD lookup (this page
 * holds no pack): the frame the panel hands its presenter (`LoadingPanel.draw`).
 */
export function loadingPanelInputs(params: UiGpuLoadingParams, scale: UiRasterScale): { items: UiDrawItem[]; textures: UiTextures; options: RasterOptions } {
  const bitmaps = new Map<string, UiBitmap>([
    ['littleblack.tif', loadingBitmap(seededBitmap(8, 8, 5101, true))],
    ['ld_test_prog.tif', loadingBitmap(seededBitmap(16, 8, 5102, true))],
    ['font_text_01.tif', loadingBitmap(seededBitmap(64, 8, 5103, false))],
    ['load_cd.tif', loadingBitmap(seededBitmap(32, 32, 5104, false))],
  ]);
  const sizes = Object.fromEntries([...bitmaps].map(([n, b]) => [n, { width: b.width, height: b.height }]));
  const { alpha, rgb } = params;
  const quad = (texture: string, object: string, x: number, y: number, w: number, h: number, uv: [number, number, number, number], c: [number, number, number], a: number): ArmoryQuad =>
    ({ texture, object, x, y, w, h, u0: uv[0], v0: uv[1], u1: uv[2], v1: uv[3], rgb: c, alpha: a });
  const quads: ArmoryQuad[] = [
    quad('littleblack.tif', 'BACKGROUND', 0, 0, 640, 448, [0, 0, 8, 8], [128, 128, 128], 128),
    quad('ld_test_prog.tif', 'LoadingPicture', 30, 120, 580, 210, [0, 0, 16, 8], rgb, alpha),
    ...[0, 1, 2, 3, 4, 5].map((i) => quad('font_text_01.tif', 'mission_title', 40.3 + i * 12.25, 60.25, 10, 25, [i * 10, 0, i * 10 + 10, 8], rgb, alpha)),
    quad('load_cd.tif', 'load_CD_Parent', 560, 380, 48, 48, [0, 0, 32, 32], rgb, alpha),
  ];
  const items = loadingDrawList(quads, sizes, params.fader);
  return { items, textures: (name) => bitmaps.get(name) ?? null, options: { scale, transparent: false } };
}

/** GM-14a: the frame an L1 present shows -- the software at `at` (`uiGpuFrameFallbackOptions`), each pixel `scale / at` times. */
const l1Reference = (items: readonly UiDrawItem[], textures: Parameters<typeof rasterizeUiDrawList>[1], options: RasterOptions, at: number): Rgba =>
  upscaleFrameNearest(rasterizeUiDrawList(items, textures, uiGpuFrameFallbackOptions(options, at)).frame, (options.scale ?? 1) / at);

const seeded = (n: number, seed: number): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return d;
};

/** Bytes as base64, in chunks (a frame at 4x is 18 MiB). */
const base64 = (d: Uint8Array | Uint8ClampedArray): string => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};

function compare(name: string, path: UiGpuHarnessCompare['path'], why: string[], gpu: Rgba, software: Rgba, channels = 4): UiGpuHarnessCompare {
  const base = { name, path, why, width: software.width, height: software.height };
  if (gpu.width !== software.width || gpu.height !== software.height) {
    return { ...base, bytes: 0, differ: -1, first: null };
  }
  let differ = 0, first: UiGpuHarnessCompare['first'] = null, bytes = 0;
  for (let i = 0; i < software.data.length; i++) {
    const channel = i % 4;
    if (channel >= channels) continue;
    bytes++;
    if (gpu.data[i] === software.data[i]) continue;
    differ++;
    if (!first) { const p = i >> 2; first = { index: i, x: p % software.width, y: Math.floor(p / software.width), channel, gpu: gpu.data[i]!, software: software.data[i]! }; }
  }
  return { ...base, bytes, differ, first };
}

/** Installs `window.__uiGpuHarness` over two canvases in `root` (opaque and transparent). Throws where there is no WebGL2. */
export function installUiGpuHarness(root: HTMLElement = document.body): UiGpuHarness {
  const backends = new Map<UiRasterMode, UiGpuBackend>();
  for (const mode of ['opaque', 'transparent'] as const) {
    const canvas = document.createElement('canvas');
    canvas.id = `ui-gpu-harness-${mode}`;
    root.appendChild(canvas);
    const b = createUiGpuBackend(canvas, { transparent: mode === 'transparent' });
    if (!b) throw new Error('uiGpuHarness: no WebGL2 context');
    backends.set(mode, b);
  }
  const backend = (mode: UiRasterMode): UiGpuBackend => backends.get(mode)!;
  const presenter = (mode: UiRasterMode): GpuUiPresenter => new GpuUiPresenter(backend(mode));
  const present = (name: string, mode: UiRasterMode, items: readonly UiDrawItem[], textures: Parameters<typeof rasterizeUiDrawList>[1], options: RasterOptions): UiGpuHarnessCompare => {
    const p = presenter(mode);
    p.present(items, textures, options);
    // GM-14a: an L1 frame is the software at the scale it was drawn at, shown s x s (GM.R9).
    const ref = p.last!.path === 'software' ? l1Reference(items, textures, options, p.last!.drawnAt ?? options.scale ?? 1) : rasterizeUiDrawList(items, textures, options).frame;
    return compare(name, p.last!.path, p.last!.why, p.readFrame()!, ref);
  };

  /**
   * GM-11b's parity run, shared by GM-03's cases (`parityRun`) and GM-30's loading panel (`loadingParityRun`): `make`'s
   * inputs (fresh at each call; `make(true)` the transparent frame before its divide) planned with `blend`, drawn by the
   * f64 CPU executor, the f32 twin and the WebGL2 backend through the presenter, and compared.
   */
  const parityOf = (name: string, key: string, scale: UiRasterScale, mode: UiRasterMode, blend: UiPlanBlendMode,
    make: (preDivide: boolean) => { items: UiDrawItem[]; textures: UiTextures; options: RasterOptions }): UiGpuHarnessParity => {
    const transparent = mode === 'transparent';
    // The plan the presenter makes (the same inputs and the same blend), run by the f64 CPU executor and the f32 twin.
    const inputs = make(false);
    const plan = planFrame(inputs.items, inputs.textures, { scale, transparent, hd: inputs.options.hd, movie: inputs.options.movie, blend });
    const cpu = executeFramePlanOnCpu(plan).frame;
    const twin = executeFramePlanOnTwin(plan);
    const expectGpu = plan.verdict === 'gpu' && plan.steps.every((s) => UI_GPU_BASE_STEPS.has(s.kind));
    const b = backend(mode);
    const refusal = b.refusal(plan);
    // The GPU: through the presenter, as a surface draws; presented again while its textures wait for the budget.
    const p = new GpuUiPresenter(b, { blend });
    const shownInputs = make(false);
    let presents = 0;
    do { p.present(shownInputs.items, shownInputs.textures, shownInputs.options); presents++; }
    while (presents < 16 && p.last!.path === 'software' && p.last!.why.some((w) => w.startsWith('textures uploading')));
    const gpu = p.readFrame()!;
    const shown = compare(name, p.last!.path, p.last!.why, gpu, cpu);
    // GM-14a: an L1 frame against what L1 shows (the software at drawnAt, s x s); null on a GPU frame.
    const drawnAt = p.last!.path === 'software' ? p.last!.drawnAt ?? scale : null;
    const l1 = drawnAt === null ? null : compare(`${name} L1 @${drawnAt}x`, 'software', p.last!.why, gpu, l1Reference(shownInputs.items, shownInputs.textures, shownInputs.options, drawnAt));
    let pre: UiGpuHarnessParity['pre'] = null;
    if (transparent) {
      const pr = make(true);
      const ref = drawnAt === null ? rasterizeUiDrawList(pr.items, pr.textures, pr.options).frame : l1Reference(pr.items, pr.textures, pr.options, drawnAt);
      const raw = b.readPixels();
      pre = { ...compare(`${name} pre-divide`, p.last!.path, p.last!.why, raw, ref), exactDiffering: twinStats(raw, ref, twin.exact, twin.models).exactDiffering };
    }
    return {
      key, scale, mode, blend, path: p.last!.path, why: p.last!.why.slice(), expectGpu, refusal, presents, drawnAt, l1,
      width: cpu.width, height: cpu.height, shown, pre,
      gpu: twinStats(gpu, cpu, twin.exact, twin.models),
      twin: twinStats(twin.frame, cpu, twin.exact, twin.models),
      frames: { gpu: base64(gpu.data), cpu: base64(cpu.data) },
    };
  };

  const hook: UiGpuHarness = {
    ready: true,
    renderer() {
      const gl = backend('opaque').gl;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
      return {
        renderer: str(gl.getParameter(gl.RENDERER)),
        unmasked: info ? str(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null,
        vendor: str(gl.getParameter(gl.VENDOR)),
        version: str(gl.getParameter(gl.VERSION)),
      };
    },
    clearSweep(mode) {
      const b = backend(mode), transparent = mode === 'transparent';
      const gpu = new Uint8ClampedArray(256 * 4), want = new Uint8ClampedArray(256 * 4);
      for (let k = 0; k < 256; k++) {
        const bytes = clearBytes([k, 255 - k, (k * 37) % 256]);
        b.begin(1, 1, transparent);
        b.clear([...bytes]);
        gpu.set(b.readPixels().data.subarray(0, 4), k * 4);
        want.set(bytes, k * 4);
      }
      return compare(`clear sweep (${mode})`, 'base', [], { width: 256, height: 1, data: gpu }, { width: 256, height: 1, data: want });
    },
    case9Clear(scale, mode) {
      const c = UI_RASTER_CASES.find((x) => x.id === 9)!;
      const { items, textures, options } = caseRasterInputs(c, scale, mode);
      const clear = items.filter((i) => i.kind === 'clear');
      return present(`case 9's clear @${scale}x/${mode}`, mode, clear, textures, options);
    },
    presentCase(id, scale, mode) {
      const c = UI_RASTER_CASES.find((x) => x.id === id);
      if (!c) throw new Error(`uiGpuHarness: no case ${id}`);
      const { items, textures, options } = caseRasterInputs(c, scale, mode);
      return present(`case ${id} @${scale}x/${mode}`, mode, items, textures, options);
    },
    roundTrip(scale, mode, seed) {
      const b = backend(mode), W = 640 * scale, H = 448 * scale;
      const frame: Rgba = { width: W, height: H, data: seeded(W * H * 4, seed) };
      b.uploadFrame(frame, mode === 'transparent');
      return compare(`upload round trip @${scale}x/${mode} seed ${seed}`, 'base', [], b.readPixels(), frame);
    },
    presentOrientation(scale, seed) {
      const b = backend('opaque'), gl = b.gl, W = 640 * scale, H = 448 * scale;
      const frame: Rgba = { width: W, height: H, data: seeded(W * H * 4, seed) };
      b.uploadFrame(frame, false);
      b.present();
      // GM-11b box fold: a GL error at the present named in the result (the box read an all-zero canvas at 5650fe4fc).
      const error = gl.getError();
      // Read the canvas's own framebuffer in the same task (before the browser composites and clears it).
      const shown = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, shown);
      const topFirst = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) topFirst.set(shown.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      const why = error === gl.NO_ERROR ? [] : [`GL error 0x${error.toString(16)} after the present`];
      return compare(`present orientation @${scale}x seed ${seed}`, 'base', why, { width: W, height: H, data: topFirst }, frame, 3);
    },
    premultipliedPresent(scale, seed) {
      const b = backend('transparent'), gl = b.gl, W = 640 * scale, H = 448 * scale;
      const frame: Rgba = { width: W, height: H, data: seeded(W * H * 4, seed) };
      b.uploadFrame(frame, true);
      b.present();
      const error = gl.getError();
      // The canvas's own framebuffer, read in the same task (before the browser composites and clears it).
      const shown = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, shown);
      const topFirst = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) topFirst.set(shown.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      const want = frame.data.slice();
      uiGpuPremultipliedPresent(want);
      let overAlpha = 0;
      for (let i = 0; i < topFirst.length; i += 4) if (topFirst[i]! > topFirst[i + 3]! || topFirst[i + 1]! > topFirst[i + 3]! || topFirst[i + 2]! > topFirst[i + 3]!) overAlpha++;
      const why = error === gl.NO_ERROR ? [] : [`GL error 0x${error.toString(16)} after the present`];
      return {
        shown: compare(`premultiplied present @${scale}x seed ${seed}`, 'base', why, { width: W, height: H, data: topFirst }, { width: W, height: H, data: want }),
        target: compare(`premultiplied present's target @${scale}x seed ${seed}`, 'base', [], b.readPixels(), frame),
        overAlpha,
      };
    },
    movieRun(scale, pictures) {
      const p = presenter('opaque'), uploadsPerRender: number[] = [];
      const options: RasterOptions = { scale, movie: (pic) => pic.image as Rgba };
      let worst: UiGpuHarnessCompare | null = null;
      for (let k = 0; k < pictures; k++) {
        const w = 160, h = 112;
        const image: Rgba = { width: w, height: h, data: seeded(w * h * 4, 3000 + k) };
        const picture = { width: w, height: h, image };
        const items: UiDrawItem[] = [{ kind: 'movie', picture, x0: 0, y0: 0, x1: 640, y1: 448 }];
        for (let r = 0; r < 2; r++) {
          p.present(items, () => null, options);
          uploadsPerRender.push(p.backend.movieStats.uploadsLastFrame);
          const c = compare(`movie picture ${k} render ${r} @${scale}x`, p.last!.path, p.last!.why, p.readFrame()!, rasterizeUiDrawList(items, () => null, options).frame);
          if (!worst || (worst.differ === 0 && worst.path === 'gpu')) worst = c;   // the first failing frame, else the last
        }
      }
      return { ...worst!, uploadsPerRender };
    },
    async gpuTime(id, scale, frames) {
      const canvas = document.createElement('canvas');
      root.appendChild(canvas);
      const b = createUiGpuBackend(canvas, { transparent: false, timeQueries: true });
      if (!b) throw new Error('uiGpuHarness: no WebGL2 context');
      try {
        const c = UI_RASTER_CASES.find((x) => x.id === id)!;
        const { items, textures, options } = caseRasterInputs(c, scale, 'opaque');
        const p = new GpuUiPresenter(b);
        const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
        const ms: number[] = [];
        for (let k = 0; k < frames; k++) { p.present(items, textures, options); ms.push(...b.timer!.takeMs()); await frame(); }
        for (let k = 0; k < 60 && b.timer!.stats.pending > 0; k++) { await frame(); b.timer!.poll(); ms.push(...b.timer!.takeMs()); }
        return { available: b.timer!.available, ms, stats: b.timer!.stats };
      } finally {
        b.dispose();
        canvas.remove();
      }
    },
    parityRun(key, scale, mode, blend) {
      const c = UI_RASTER_CASES.find((x) => x.key === key);
      if (!c) throw new Error(`uiGpuHarness: no case ${key}`);
      return parityOf(`case ${key} @${scale}x/${mode}/${blend}`, key, scale, mode, blend, (preDivide) => caseRasterInputs(c, scale, mode, preDivide));
    },
    loadingParityRun(params, scale, blend) {
      // GM-30: the panel is opaque (its frame and its GPU canvas), so the leg has no transparent run and no pre-divide frame.
      return parityOf(`loading ${params.key} @${scale}x/opaque/${blend}`, params.key, scale, 'opaque', blend, () => loadingPanelInputs(params, scale));
    },
    devSamplingRun(key, scale, mode, sampling) {
      const c = UI_RASTER_CASES.find((x) => x.key === key);
      if (!c) throw new Error(`uiGpuHarness: no case ${key}`);
      const { items, textures, options } = caseRasterInputs(c, scale, mode);
      const o: RasterOptions = { ...options, uiSampling: { enabled: true, mode: sampling, sharpness: 0.5, snap: 1 } };
      const p = presenter(mode);
      p.present(items, textures, o);
      const drawnAt = p.last!.path === 'software' ? p.last!.drawnAt ?? scale : null;
      const ref = rasterizeUiDrawList(items, textures, o).frame;
      return { key, scale, mode, path: p.last!.path, why: p.last!.why.slice(), drawnAt, compare: compare(`case ${key} @${scale}x/${mode} dev ${sampling}`, p.last!.path, p.last!.why, p.readFrame()!, ref) };
    },
    coldUploadRun(key, scale, mode) {
      const c = UI_RASTER_CASES.find((x) => x.key === key);
      if (!c) throw new Error(`uiGpuHarness: no case ${key}`);
      const canvas = document.createElement('canvas');
      root.appendChild(canvas);
      const b = createUiGpuBackend(canvas, { transparent: mode === 'transparent', textures: { uploadBytesPerFrame: 1 } });
      if (!b) throw new Error('uiGpuHarness: no WebGL2 context');
      try {
        const { items, textures, options } = caseRasterInputs(c, scale, mode);
        const p = new GpuUiPresenter(b);
        p.present(items, textures, options);
        const first = { path: p.last!.path, why: p.last!.why.slice(), drawnAt: p.last!.path === 'software' ? p.last!.drawnAt ?? scale : null };
        // GM-14a review F2: a first frame drawn on the GPU is compared with the CPU executor (the main leg's reference) and
        // its exact class and B returned; an L1 first frame with what L1 shows.
        const plan = planFrame(items, textures, { scale, transparent: mode === 'transparent', hd: options.hd, movie: options.movie });
        const shownFrame = p.readFrame()!;
        let gpu: UiGpuTwinStats | null = null, twinOwn: UiGpuTwinStats | null = null, preExactDiffering: number | null = null, ref: Rgba;
        if (first.drawnAt === null) {
          ref = executeFramePlanOnCpu(plan).frame;
          const tw = executeFramePlanOnTwin(plan);
          gpu = twinStats(shownFrame, ref, tw.exact, tw.models);
          twinOwn = twinStats(tw.frame, ref, tw.exact, tw.models);
          if (mode === 'transparent') {
            // GM-14a re-review (1): before the divide too, as the main leg's `pre` (read now, before any later present).
            const pr = caseRasterInputs(c, scale, mode, true);
            preExactDiffering = twinStats(b.readPixels(), rasterizeUiDrawList(pr.items, pr.textures, pr.options).frame, tw.exact, tw.models).exactDiffering;
          }
        } else ref = l1Reference(items, textures, options, first.drawnAt);
        const cmp = compare(`case ${key} @${scale}x/${mode} cold upload, first frame`, first.path, first.why, shownFrame, ref);
        const n = new Set(b.textureKeys(plan)).size;
        let presents = 1;
        while (presents < 16 && p.last!.path === 'software' && p.last!.why.some((w) => w.startsWith('textures uploading'))) { p.present(items, textures, options); presents++; }
        return { key, scale, mode, ...first, compare: cmp, textures: n, presents, finalPath: p.last!.path, gpu, twin: twinOwn, preExactDiffering };
      } finally {
        b.dispose();
        canvas.remove();
      }
    },
    seamRun(list, scale, blend) {
      const { items, textures, squares } = seamSquares(uiGpuSeamInvWs(list));
      const options: RasterOptions = { scale };
      const plan = planFrame(items, textures, { scale, transparent: false, blend });
      const expectGpu = plan.verdict === 'gpu' && plan.steps.every((s) => UI_GPU_BASE_STEPS.has(s.kind));
      const b = backend('opaque');
      const refusal = b.refusal(plan);
      const p = new GpuUiPresenter(b, { blend });
      let presents = 0;
      do { p.present(items, textures, options); presents++; }
      while (presents < 16 && p.last!.path === 'software' && p.last!.why.some((w) => w.startsWith('textures uploading')));
      const gpu = p.readFrame()!;
      const software = rasterizeUiDrawList(items, textures, options).frame;
      const pixels = uiGpuSeamListPixels(squares, scale);
      const o = { clear: UI_SEAM_CLEAR, texel: UI_SEAM_TEXEL };
      const gpuClass = classifySeamPixels(gpu, pixels, o, software);
      return {
        list, scale, blend, path: p.last!.path, why: p.last!.why.slice(), expectGpu, refusal, presents, squares: squares.length,
        gpu: gpuClass, software: classifySeamPixels(software, pixels, o),
        frame: compare(`seams ${list} @${scale}x/${blend}`, p.last!.path, p.last!.why, gpu, software),
        frames: gpuClass.once === gpuClass.total ? null : { gpu: base64(gpu.data), cpu: base64(software.data) },
      };
    },
  };
  (window as unknown as Record<string, unknown>)[UI_GPU_HARNESS_HOOK] = hook;
  return hook;
}

// ---- GM-31 leg 2: the model seams on a real GPU (GM-27's owed seam count; GM-15d review F2) ------------------------------

/** The two seam lists of GM-15b (`../test/uiRasterCases.ts` `seamSquares`): the dyadic depths, and invW 0.7 (f32 rounds it). */
export const UI_GPU_SEAM_LISTS = Object.freeze(['dyadic', '0.7'] as const);
export type UiGpuSeamList = (typeof UI_GPU_SEAM_LISTS)[number];
/** GM-15b's dyadic depths, in the order its tests take them (`uiGpuSeamCount.test.ts`, `uiGpuWebgl2.test.ts`, `uiGpuTwin.test.ts`). */
const SEAM_DYADIC: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 0.375];
/** The 24 squares' invW of a list, as GM-15b's tests build them. */
export const uiGpuSeamInvWs = (list: UiGpuSeamList): number[] => Array.from({ length: 24 }, (_, k) => (list === 'dyadic' ? SEAM_DYADIC[k % SEAM_DYADIC.length]! : 0.7));
/**
 * GM-31 review F3: `S2U_UI_GPU_SEAMS_SCALES` read -- comma-separated, each one of 1, 2, 4; unset or empty, all three. An
 * unknown value is refused by name, so a typo cannot make a run with no seam test.
 */
export function uiGpuSeamsScales(raw: string | undefined): UiRasterScale[] {
  const given = (raw ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (!given.length) return [1, 2, 4];
  for (const s of given) if (s !== '1' && s !== '2' && s !== '4') throw Error(`S2U_UI_GPU_SEAMS_SCALES: ${JSON.stringify(s)} is not one of 1, 2, 4`);
  return ([1, 2, 4] as const).filter((n) => given.includes(String(n)));
}
/** Every seam pixel of a list's squares at a scale (`seamPixels`, square by square). */
export const uiGpuSeamListPixels = (squares: readonly UiSeamSquare[], scale: number): [number, number][] => squares.flatMap((sq) => seamPixels(sq, scale));

/**
 * How far (per channel, in store bytes) a seam pixel may sit from a class's value and still be counted in it: the B class's
 * known max |Δ| is 1 on every backend measured (the Log, the T4 and the 4070); the classes are `UI_SEAM_TEXEL` (60) apart,
 * so no pixel can fall within the tolerance of two. A test instrument's own threshold, no original.
 */
export const UI_GPU_SEAM_CLASS_TOLERANCE = 2;
export type UiGpuSeamPixelClass = 'once' | 'twice' | 'hole' | 'other';
/** A seam pixel count: drawn once (clear + texel), twice (a double add), not at all (a hole: the clear), or other. */
export interface UiGpuSeamClass {
  total: number;
  once: number;
  twice: number;
  hole: number;
  other: number;
  /** Seam pixels whose RGB equals the reference's exactly; null when no reference was given. */
  equalToReference: number | null;
  /** The first 8 seam pixels not drawn once, in the order walked. */
  first: { x: number; y: number; rgb: [number, number, number]; class: UiGpuSeamPixelClass }[];
}

interface FrameLike { width: number; height: number; data: ArrayLike<number> }

/**
 * GM-31: each seam pixel of `frame` (RGBA, top row first) named by the value it holds -- every RGB channel within
 * `tolerance` (default `UI_GPU_SEAM_CLASS_TOLERANCE`) of `clear + texel` is once, of `clear + 2 texel` twice, of `clear`
 * a hole, anything else other -- and, given `reference` (the software's frame), the seam pixels equal to it.
 */
export function classifySeamPixels(frame: FrameLike, pixels: readonly (readonly [number, number])[], o: { clear: number; texel: number; tolerance?: number }, reference?: FrameLike | null): UiGpuSeamClass {
  if (reference && (reference.width !== frame.width || reference.height !== frame.height)) {
    throw Error(`classifySeamPixels: a reference of size ${reference.width} x ${reference.height} for a frame of ${frame.width} x ${frame.height}`);
  }
  const tol = o.tolerance ?? UI_GPU_SEAM_CLASS_TOLERANCE;
  const classes: [UiGpuSeamPixelClass, number][] = [['once', o.clear + o.texel], ['twice', o.clear + 2 * o.texel], ['hole', o.clear]];
  const out: UiGpuSeamClass = { total: 0, once: 0, twice: 0, hole: 0, other: 0, equalToReference: reference ? 0 : null, first: [] };
  for (const [x, y] of pixels) {
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) throw Error(`classifySeamPixels: (${x}, ${y}) is outside the ${frame.width} x ${frame.height} frame`);
    const i = (y * frame.width + x) * 4;
    const rgb: [number, number, number] = [frame.data[i]!, frame.data[i + 1]!, frame.data[i + 2]!];
    const c = classes.find(([, v]) => rgb.every((ch) => Math.abs(ch - v) <= tol))?.[0] ?? 'other';
    out.total++;
    out[c]++;
    if (c !== 'once' && out.first.length < 8) out.first.push({ x, y, rgb, class: c });
    if (reference && reference.data[i] === rgb[0] && reference.data[i + 1] === rgb[1] && reference.data[i + 2] === rgb[2]) out.equalToReference!++;
  }
  return out;
}
