// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { LoadingSpin } from '@s2u/ui/loading';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel, type LoadingPanelGpu } from '../src/loadingPanel';
import type { UiHdTextures } from '../src/uiCompositorView';
import { UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UI_GPU_STANDBY_CLASS, uiGpuSurfaceWiring, type UiGpuSurfaceLoad } from '../src/uiGpuSurfaceMount';
import type { DeviceClass } from '../src/deviceClass';
import { UiGpuSwitch, type UiGpuSurfaceTable } from '../src/uiGpuSwitch';
import { fakeGl, type Fake, type FakeGlOptions } from './uiGpuFakeGl';

// GM-23 (plan 2026-11-01-gpu-menus, row GM-23; GM.R15, GM.R17, GM.R18, GM.R19; research 380 §5): the loading screen's GPU
// surface -- its own canvas beside the panel's (opaque, as the panel's frame is), resolved through the switch
// (`UiGpuSwitch.resolve('loading', scale)`), the surface imported after the first software frame, the HD options to a
// presenting surface only and every software frame at 1x (GM-28's rule). The panel draws while a match loads (a heavy main
// thread), so the surface adds no stall: its context and links are begun ahead and its frames go to the GPU only once
// every program has linked, polled only where the poll cannot wait (`KHR_parallel_shader_compile`); until then, and for
// the session where the browser has no such extension, the panel draws its 1x software. The context is let go when the
// screen hides. Simulation track by the row; evidence kind: unit tests (jsdom; the surface on the fake WebGL2 context,
// not a GPU) and source inspection of the page's construction. No browser ran.

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]),
    ],
  ],
]]);
function face(): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}
const SPIN: LoadingSpin = { node: 'load_CD_Parent', loops: true, period: 1.5, segments: [] };
const pattern = (w: number, h: number, seed: number): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, 255], i * 4);
  return { width: w, height: h, data };
};
const bitmaps: [string, Rgba][] = [['littleblack.tif', pattern(8, 8, 1)], ['ld_mp2_prog.tif', pattern(16, 8, 2)], ['font_text_01.tif', pattern(64, 8, 4)]];
const screen = (): LoadingScreen => ({
  map: 'RUN/MP2.ZDB', layout, libraries: [], spin: SPIN, fade: null, fonts: [face()], unheld: [], missing: [],
  binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']]) },
  strings: [], bitmaps,
});

/** Every 2D put, by canvas (jsdom has no canvas: each canvas's 2D context is this recorder, one per canvas). */
interface Put { canvas: HTMLCanvasElement; width: number; height: number }
let puts: Put[] = [];
let now = 0;
const contexts = new WeakMap<HTMLCanvasElement, unknown>();
beforeEach(() => {
  puts = []; now = 0;
  vi.spyOn(window.performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, id: string) {
    if (id !== '2d') return null;
    if (!contexts.has(this)) {
      const canvas = this;
      contexts.set(this, {
        canvas,
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (img: { width: number; height: number }) => { puts.push({ canvas, width: img.width, height: img.height }); },
      });
    }
    return contexts.get(this) as RenderingContext;
  } as unknown as HTMLCanvasElement['getContext']);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

const flush = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
const sw = (search = '', table?: UiGpuSurfaceTable): UiGpuSwitch => new UiGpuSwitch({ search, storage: () => null, devTools: false, table });
/** The flip (GM.R18): the landed table is every cell `on`; "the cell off" is this all-off table the test builds. */
const OFF: UiGpuSurfaceTable = { front: { hd: 'off', sd: 'off' }, armory: { hd: 'off', sd: 'off' }, overlay: { hd: 'off', sd: 'off' }, loading: { hd: 'off', sd: 'off' } };
const ON = '?uiGpu=on&uiGpuSurface=loading';
const gpuCanvas = (): HTMLCanvasElement | null => document.querySelector('#original-loading canvas[data-loading-gpu]');
const panelCanvas = (): HTMLCanvasElement => document.querySelector('#original-loading canvas:not([data-loading-gpu])')!;
const HD2 = (): { scale: number; hd?: UiHdTextures } => ({ scale: 2, hd: () => null });
const GPU_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';

/** A panel whose surface is `UiGpuSurfacePresenter` on the fake WebGL2 context (its canvas the fake's, not the mount's). */
function rig(search: string, fo: FakeGlOptions = {}, dev = false) {
  const s = sw(search);
  const f: Fake = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...fo });
  const loads: UiGpuSurfaceLoad[] = [];
  const surfaces: UiGpuSurfacePresenter[] = [];
  const gpu: LoadingPanelGpu = {
    resolveAt: (sc) => s.resolve('loading', sc), dev,
    load: (at) => {
      loads.push(at);
      const surface = new UiGpuSurfacePresenter({
        canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: at.software, transparent: false, surface: 'loading',
        clock: { now: () => now, setTimeout: () => 0, clearTimeout: () => {} }, host: s, shown: at.shown,
      });
      surfaces.push(surface);
      return Promise.resolve(surface);
    },
  };
  const panel = new LoadingPanel(document, HD2, gpu);
  return { s, f, panel, loads, surfaces };
}

describe('GM-23: the loading screen with its cell off (an all-off table; the landed one before the flip) is the 1x software, no GPU canvas', () => {
  it('no GPU canvas, nothing loaded, every frame 640 x 448 even under the pack\'s 2x (GM-28, GM.R19)', () => {
    const load = vi.fn(() => Promise.reject(new Error('never asked')));
    const panel = new LoadingPanel(document, HD2, { resolveAt: (sc) => sw('', OFF).resolve('loading', sc), load });
    panel.show(screen());
    now = 1000; panel.redraw();
    expect(gpuCanvas()).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(puts.length).toBe(2);
    expect(puts.every((p) => p.width === 640 && p.height === 448)).toBe(true);
  });

  it('the flip (GM.R18): the landed table makes the panel GPU canvas; its software while it waits is 1x', () => {
    const panel = new LoadingPanel(document, HD2, { resolveAt: (sc) => sw().resolve('loading', sc), load: () => new Promise(() => {}) });
    panel.show(screen());
    now = 1000; panel.redraw();
    expect(gpuCanvas()).not.toBeNull();
    expect(puts.every((p) => p.width === 640 && p.height === 448)).toBe(true);
  });
});

describe('GM-23: the loading screen\'s GPU surface (?uiGpu=on for loading)', () => {
  it('the first frame is the 1x software and the surface is asked once after it (GM.R15); with KHR_parallel_shader_compile the links run off the frame -- no link status read -- and the frames go to the GPU at the pack\'s scale once linked', async () => {
    const r = rig(ON, { parallelCompile: true });
    expect(gpuCanvas()).not.toBeNull();
    expect(r.loads).toHaveLength(0);
    r.panel.show(screen());
    expect(puts.at(-1)).toMatchObject({ width: 640, height: 448 });
    expect(r.loads).toHaveLength(1);
    expect(r.loads[0]!.canvas).toBe(gpuCanvas());
    await flush();
    now = 100; r.panel.redraw();                                       // the context made, its programs begun: still the software
    expect(r.s.readout().contexts).toBe(1);
    expect(r.surfaces[0]!.state).toBe('compiling');
    expect(puts.at(-1)).toMatchObject({ canvas: panelCanvas(), width: 640, height: 448 });
    now = 200; r.panel.redraw();
    expect(r.f.compile.blockingQueries).toBe(0);                       // no stall on the loading thread
    expect(gpuCanvas()!.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    r.f.compile.finish();
    const softwareBefore = puts.length;
    now = 1000; r.panel.redraw();
    expect(r.surfaces[0]!.state).toBe('ready');
    expect(r.surfaces[0]!.stats.frames.L0).toBe(1);
    expect(puts.length).toBe(softwareBefore);                          // drawn on the GPU, not by the panel's software
    expect([r.f.canvas.width, r.f.canvas.height]).toEqual([1280, 896]);   // the pack's 2x on the GPU
    expect(gpuCanvas()!.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(false);
    expect(r.f.compile.blockingQueries).toBe(0);
    expect(r.panel.readFrame()!.width).toBe(1280);
    r.panel.hide();
  }, 60_000);

  it('without KHR_parallel_shader_compile the page never waits on a link while a match loads: the panel keeps its 1x software and lets the surface go', async () => {
    const r = rig(ON, { parallelCompile: false });
    r.panel.show(screen());
    await flush();
    for (let i = 1; i <= 3; i++) { now = i * 100; r.panel.redraw(); }
    expect(r.f.calls.filter((c) => c[0] === 'getProgramParameter')).toHaveLength(0);
    // Review fold 4: the extension checked before any compile -- no shader compiled, no program linked.
    expect(r.f.names().filter((n) => n === 'compileShader' || n === 'linkProgram')).toEqual([]);
    expect(r.surfaces[0]!.stats.unavailable).toBe('no-parallel-link');
    expect(puts.every((p) => p.width === 640 && p.height === 448)).toBe(true);
    expect(r.s.readout().contexts).toBe(0);
    expect(gpuCanvas()).toBeNull();                                    // the GPU canvas off the page for the session
  });

  it('hidden, the screen lets its context go (a match runs beside at most the overlay\'s); shown again, it asks it back', async () => {
    const r = rig(ON, { parallelCompile: true });
    r.panel.show(screen());
    await flush();
    now = 100; r.panel.redraw();
    r.f.compile.finish();
    now = 1000; r.panel.redraw();
    expect(r.s.readout().contexts).toBe(1);
    r.panel.hide();
    expect(r.s.readout().contexts).toBe(0);
    r.f.events.flush();
    r.panel.show(screen());                                            // the 1x software while the context comes back
    expect(puts.at(-1)).toMatchObject({ width: 640, height: 448 });
    r.f.events.flush();
    expect(r.s.readout().contexts).toBe(1);
    r.panel.hide();
  }, 60_000);

  it('GM.R17: a hidden panel draws nothing on either path', async () => {
    const r = rig(ON, { parallelCompile: true });
    r.panel.show(screen());
    await flush();
    r.panel.hide();
    const n = puts.length, calls = r.f.calls.length;
    now = 500; r.panel.redraw();
    expect(puts.length).toBe(n);
    expect(r.f.calls.length).toBe(calls);
  });
});

// Review fold 1 (blocking): the panel's HD follows ITS mode -- `on`, or `shadow` on a development build. A built page's URL
// `shadow` for `loading` would otherwise raster the pack's scale in software on every frame of a match load (the freeze).
describe('GM-23 fold 1: the panel\'s HD follows its own mode (a built page\'s URL shadow draws 1x)', () => {
  const run = async (dev: boolean) => {
    const r = rig('?uiGpu=shadow&uiGpuSurface=loading', { parallelCompile: true }, dev);
    r.panel.show(screen());
    await flush();
    now = 100; r.panel.redraw();
    r.f.compile.finish();
    now = 1000; r.panel.redraw();
    now = 1100; r.panel.redraw();
    const shadow = r.surfaces[0]!.stats.frames.shadow;
    r.panel.hide();
    return { shadow, last: puts.at(-1)! };
  };
  it('a built page: the shadow surface\'s shown frame is the 1x software', async () => {
    const { shadow, last } = await run(false);
    expect(shadow).toBeGreaterThan(0);
    expect([last.width, last.height]).toEqual([640, 448]);
  }, 60_000);
  it('a development build: the shadow keeps the shown scale for the guard (the pack\'s 2x)', async () => {
    const { shadow, last } = await run(true);
    expect(shadow).toBeGreaterThan(0);
    expect([last.width, last.height]).toEqual([1280, 896]);
  }, 60_000);
});

describe('GM-23: the page hands its loading screen the menus\' HD options and the GPU surface (source inspection)', () => {
  it('`./frontEnd`\'s panel takes `hdMenus`\' options and the loading surface through the switch, opaque; `./main`\'s takes neither', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
    // GM-XBOX1 re-pin (was the option given unconditionally; review F1: then the HD option alone): the panel's HD and GPU
    // options come from one `uiGpuSurfaceWiring('loading', pageDeviceClass(), ...)`, so on the Xbox class both are withheld together.
    expect(src('frontEnd.ts')).toMatch(/\(\(w\) => new LoadingPanel\(doc, w\.hd, w\.gpu\)\)\(uiGpuSurfaceWiring\('loading', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: \(s: number\) => uiGpu\.resolve\('loading', s\), load: uiGpuSurfaceLoader\(\{ surface: 'loading', transparent: false,[^\n]*\}\)\)\)\);/);
    expect(src('loadingPanel.ts')).toMatch(/const panel = new LoadingPanel\(doc\);/);
    expect(src('loadingPanel.ts')).not.toMatch(/^\s*import\s[^;]*from\s+['"][./]*[^'"]*uiGpu(Webgl2|Presenter|Movie)['"]/m);
  });
});

// GM-XBOX1 (the GPU menus plan's Log, 2026-11-10; `UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION`, a browser adaptation): the panel's
// two options from the page's own helper, `uiGpuSurfaceWiring('loading', class, hd, gpu)`, as `./frontEnd` builds them. On
// the Xbox class no GPU canvas, no surface asked (no second WebGL context through the match's load) and -- review F1: the
// HD pack is not refused on Xbox in this tree -- the 1x HD option, so even under a 4x pack every frame is the panel's
// 640 x 448 software, as v0.4.17's. Unit test (jsdom; the landed table, every cell `on`).
describe('GM-XBOX1: on the Xbox device class the loading screen gets no GPU option and the 1x HD option', () => {
  const HD4 = (): { scale: number; hd?: UiHdTextures } => ({ scale: 4, hd: () => null });
  const wired = (cls: DeviceClass, load: LoadingPanelGpu['load']): LoadingPanel => {
    const w = uiGpuSurfaceWiring('loading', cls, HD4, () => ({ resolveAt: (sc: number) => sw().resolve('loading', sc), load }));
    return new LoadingPanel(document, w.hd, w.gpu);
  };

  it('xbox under a 4x pack: no GPU canvas, the surface never asked, every frame the 640 x 448 software (review F1)', async () => {
    const load = vi.fn(() => Promise.reject(new Error('never asked')));
    const panel = wired('xbox', load);
    panel.show(screen());
    await flush();
    for (let i = 1; i <= 3; i++) { now = i * 100; panel.redraw(); }
    expect(gpuCanvas()).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(puts.length).toBeGreaterThan(0);
    expect(puts.every((p) => p.canvas === panelCanvas() && p.width === 640 && p.height === 448)).toBe(true);
    expect([panelCanvas().width, panelCanvas().height]).toEqual([640, 448]);
    panel.hide();
  });

  it('every other class under a 4x pack: the landed table makes the panel\'s GPU canvas, and its software while it waits is 1x, as before', () => {
    for (const cls of ['software', 'touch', 'lowMemory', 'standard', 'high'] as const) {
      puts = [];
      const panel = wired(cls, () => new Promise(() => {}));
      panel.show(screen());
      now = 1000; panel.redraw();
      expect(gpuCanvas(), cls).not.toBeNull();
      expect(puts.every((p) => p.width === 640 && p.height === 448), cls).toBe(true);
      panel.hide();
      document.body.replaceChildren();
    }
  });
});
