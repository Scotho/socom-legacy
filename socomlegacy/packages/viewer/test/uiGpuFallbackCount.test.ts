// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots } from '@s2u/card';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { LoadingSpin } from '@s2u/ui/loading';
import { ControllerConfigs } from '../src/controllerConfigs';
import { readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel, type LoadingGpuSurface, type LoadingPanelGpu } from '../src/loadingPanel';
import { pageNativeOptionsState } from '../src/nativeOptionsState';
import { NativeSettings, type NativeSettingsGpu } from '../src/nativeSettings';
import type { UiBitmap } from '../src/uiCompositorView';
import { UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { uiGpuFallbackFrame, uiGpuSurfaceLoader, type UiGpuFallbackState, type UiGpuMountSurface, type UiGpuSurfaceLoad } from '../src/uiGpuSurfaceMount';
import { UI_GPU_SURFACES, UiGpuSwitch, type UiGpuSurface } from '../src/uiGpuSwitch';
import { fakeGl, type Fake, type FakeGlOptions } from './uiGpuFakeGl';

// GM-30 item 1 (plan 2026-11-01-gpu-menus, row GM-30; "The fallback ladder": "Each level is counted on `window.__uiGpu`";
// the re-review of GM-19a/GM-23, its remaining finding). PRODUCT TRACK, a test and playtest instrument (a browser
// adaptation): it counts which drawer made a frame, never a byte of it. The overlay's and the loading panel's mount
// (`UiGpuCanvasMount.readyOn`) sends a frame to the page's own 1x software while the surface is not ready -- L4 (its
// capability reason, `no-parallel-link` included), L2/L3, waiting -- and the surface's own `software()`, which counts
// levels, never sees those frames: the read-out showed 0 for them. Here the mount counts them through the switch, per
// surface (`readout().surfaces`, a new key; every older key's shape and the front end's counting unchanged).
// Evidence kind: unit tests (jsdom; the surface on the fake WebGL2 context or the page's own loader on a jsdom canvas
// with no WebGL2; not a GPU). No browser ran.

const sw = (search = ''): UiGpuSwitch => new UiGpuSwitch({ search, storage: () => null, devTools: false });
const flush = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
const GPU_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

describe('GM-30: the switch counts frames per surface, the aggregate as before', () => {
  it('count(level) with no surface: the aggregate only, every surface at 0 (the front end\'s call, unchanged)', () => {
    const s = sw();
    s.count('L0'); s.count('L4');
    const r = s.readout();
    expect(r.levels).toEqual({ L0: 1, L1: 0, L2: 0, L3: 0, L4: 1 });
    for (const surface of UI_GPU_SURFACES) {
      expect(r.surfaces[surface]).toEqual({ levels: { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 }, waiting: 0, reasons: {}, last: null });
    }
  });

  it('count(level, surface): the aggregate and that surface\'s levels; last names the level, no reason', () => {
    const s = sw();
    s.count('L1', 'overlay');
    const r = s.readout();
    expect(r.levels.L1).toBe(1);
    expect(r.surfaces.overlay.levels.L1).toBe(1);
    expect(r.surfaces.overlay.last).toEqual({ level: 'L1', reason: null });
    expect(r.surfaces.loading.levels.L1).toBe(0);
  });

  it('fallback(surface, level, reason): a ladder level counted in the aggregate and the surface, its reason keyed `<level>:<reason>`', () => {
    const s = sw();
    s.fallback('loading', 'L4', 'no-parallel-link');
    s.fallback('loading', 'L4', 'no-parallel-link');
    s.fallback('loading', 'L2', null);
    const r = s.readout();
    expect(r.levels).toEqual({ L0: 0, L1: 0, L2: 1, L3: 0, L4: 2 });
    expect(r.surfaces.loading.levels).toEqual({ L0: 0, L1: 0, L2: 1, L3: 0, L4: 2 });
    expect(r.surfaces.loading.reasons).toEqual({ 'L4:no-parallel-link': 2 });
    expect(r.surfaces.loading.last).toEqual({ level: 'L2', reason: null });
  });

  it('a waiting frame is the surface\'s alone: no aggregate level moves (`levels` keeps its five keys)', () => {
    const s = sw();
    s.fallback('overlay', 'waiting', 'links');
    const r = s.readout();
    expect(r.levels).toEqual({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 });
    expect(r.surfaces.overlay.waiting).toBe(1);
    expect(r.surfaces.overlay.reasons).toEqual({ 'waiting:links': 1 });
  });

  it('the read-out keeps every older key; `surfaces` is added; a snapshot is a copy', () => {
    const s = sw();
    s.fallback('front', 'L3', 'loss-limit');
    const r = s.readout();
    expect(Object.keys(r).sort()).toEqual(['blend', 'contexts', 'guard', 'kills', 'levels', 'modes', 'refusals', 'storageKill', 'surfaces', 'url']);
    (r.surfaces.front.reasons as Record<string, number>)['L3:loss-limit'] = 99;
    (r.surfaces.front.levels as Record<string, number>)['L3'] = 99;
    expect(s.readout().surfaces.front.reasons['L3:loss-limit']).toBe(1);
    expect(s.readout().surfaces.front.levels.L3).toBe(1);
  });

  it('hostFor(surface): the switch as one surface\'s host -- its counts per surface, every other call the switch\'s own', () => {
    const s = sw('?uiGpu=on&uiGpuSurface=overlay');
    const h = s.hostFor('overlay');
    h.count('L0');
    h.fallback('L4', 'software-adapter');
    h.adjustContexts(1);
    h.refused('overlay', ['why']);
    h.kill('loss-limit', 'overlay');
    const r = s.readout();
    expect(r.levels).toEqual({ L0: 1, L1: 0, L2: 0, L3: 0, L4: 1 });
    expect(r.surfaces.overlay.levels).toEqual({ L0: 1, L1: 0, L2: 0, L3: 0, L4: 1 });
    expect(r.surfaces.overlay.reasons).toEqual({ 'L4:software-adapter': 1 });
    expect(r.contexts).toBe(1);
    expect(r.refusals.last).toEqual({ surface: 'overlay', why: ['why'], at: 0 });            // `at`: the L1 count (none here)
    expect(r.kills).toEqual([{ reason: 'loss-limit', surface: 'overlay' }]);
    expect(h.resolve('overlay', 1)).toEqual(s.resolve('overlay', 1));
    expect(h.guardOn('overlay')).toBe(false);
    expect(h.guardPlant('overlay')).toBeNull();
  });
});

describe('GM-30: uiGpuFallbackFrame -- the level and the reason of a frame the mount sends to the page\'s software', () => {
  const on = { mode: 'on', source: 'url', requested: 'on' } as const;
  const at = (x: Partial<UiGpuFallbackState>): UiGpuFallbackState => ({ resolved: on, surface: null, refused: null, gone: false, afterLoss: false, ...x });
  it.each([
    ['before the module lands', at({}), { level: 'waiting', reason: 'module' }],
    ['links running, no loss', at({ surface: { state: 'compiling', unavailable: null } }), { level: 'waiting', reason: 'links' }],
    ['links running after a loss', at({ surface: { state: 'compiling', unavailable: null }, afterLoss: true }), { level: 'L2', reason: null }],
    ['the context lost', at({ surface: { state: 'lost', unavailable: null } }), { level: 'L2', reason: null }],
    ['released in a match', at({ surface: { state: 'released', unavailable: null } }), { level: 'waiting', reason: 'released' }],
    ['L4, its capability reason', at({ surface: { state: 'unavailable', unavailable: 'software-adapter' } }), { level: 'L4', reason: 'software-adapter' }],
    ['the surface let go for no-parallel-link', at({ refused: 'no-parallel-link', gone: true }), { level: 'L4', reason: 'no-parallel-link' }],
    ['a failed load', at({ refused: 'load-failed' }), { level: 'L4', reason: 'load-failed' }],
    ['the surface\'s own session kill (dead)', at({ resolved: { mode: 'off', source: 'session', requested: 'on', reason: 'loss-limit' }, surface: { state: 'dead', unavailable: null } }), { level: 'L3', reason: 'loss-limit' }],
    ['a guard trip: the page\'s software for the session', at({ resolved: { mode: 'off', source: 'session', requested: 'shadow', reason: 'guard-trip' } }), { level: 'L3', reason: 'guard-trip' }],
  ] as const)('%s', (_name, input, want) => {
    expect(uiGpuFallbackFrame(input)).toEqual(want);
  });
  it.each([
    ['off by the table (not the ladder)', at({ resolved: { mode: 'off', source: 'table', requested: 'off' } })],
    ['off by the URL', at({ resolved: { mode: 'off', source: 'url', requested: 'off' } })],
    ['disposed (the page let it go)', at({ gone: true })],
    ['a disposed surface', at({ surface: { state: 'disposed', unavailable: null } })],
  ] as const)('not counted: %s', (_name, input) => {
    expect(uiGpuFallbackFrame(input)).toBeNull();
  });
});

// ---- the loading panel ------------------------------------------------------------------------------------------------

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
const screen = (): LoadingScreen => ({
  map: 'RUN/MP2.ZDB', layout, libraries: [], spin: SPIN, fade: null, fonts: [face()], unheld: [], missing: [],
  binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']]) },
  strings: [], bitmaps: [['littleblack.tif', pattern(8, 8, 1)], ['ld_mp2_prog.tif', pattern(16, 8, 2)], ['font_text_01.tif', pattern(64, 8, 4)]],
});

let now = 0;
const contexts = new WeakMap<HTMLCanvasElement, unknown>();
beforeEach(() => {
  now = 0;
  vi.spyOn(window.performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, id: string) {
    if (id !== '2d') return null;                                   // jsdom: no WebGL2 on any canvas
    if (!contexts.has(this)) {
      const canvas = this;
      contexts.set(this, {
        canvas,
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: () => {},
      });
    }
    return contexts.get(this) as RenderingContext;
  } as unknown as HTMLCanvasElement['getContext']);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

/** A loader as the page's (`uiGpuSurfaceLoader`) is: the surface on the fake WebGL2, its host and ladder the switch's for `surface`. */
function fakeLoader<S extends UiGpuMountSurface>(s: UiGpuSwitch, surface: UiGpuSurface, f: Fake, transparent: boolean, made: UiGpuSurfacePresenter[]) {
  const host = s.hostFor(surface);
  return Object.assign((at: UiGpuSurfaceLoad): Promise<S> => {
    const p = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: at.software, transparent, surface,
      clock: { now: () => now, setTimeout: () => 0, clearTimeout: () => {} }, host, shown: at.shown,
    });
    made.push(p);
    return Promise.resolve(p as unknown as S);
  }, { ladder: host });
}

const ON_LOADING = '?uiGpu=on&uiGpuSurface=loading';
function panelRig(fo: FakeGlOptions) {
  const s = sw(ON_LOADING);
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...fo });
  const made: UiGpuSurfacePresenter[] = [];
  const gpu: LoadingPanelGpu = { resolveAt: (sc) => s.resolve('loading', sc), load: fakeLoader<LoadingGpuSurface>(s, 'loading', f, false, made) };
  const panel = new LoadingPanel(document, () => ({ scale: 2 }), gpu);
  return { s, f, panel, made };
}

describe('GM-30: the loading panel\'s fallback frames counted on the switch, per surface', () => {
  it('L4 (a software adapter): every frame after the surface lands counted L4 with its reason; the first frame waiting for the module', async () => {
    const r = panelRig({ parallelCompile: true, unmaskedRenderer: SWIFTSHADER });
    r.panel.show(screen());                                           // the first frame: no surface yet
    await flush();
    for (let i = 1; i <= 3; i++) { now = i * 100; r.panel.redraw(); }
    expect(r.made[0]!.stats.unavailable).toBe('software-adapter');
    const ro = r.s.readout();
    expect(ro.levels.L4).toBe(3);
    expect(ro.surfaces.loading.levels).toEqual({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 3 });
    expect(ro.surfaces.loading.waiting).toBe(1);
    expect(ro.surfaces.loading.reasons).toEqual({ 'waiting:module': 1, 'L4:software-adapter': 3 });
    expect(ro.surfaces.loading.last).toEqual({ level: 'L4', reason: 'software-adapter' });
    r.panel.hide();
  });

  it('no-parallel-link: the frame that lets the surface go and every later one counted L4 no-parallel-link (no longer only in a disposed surface\'s stats)', async () => {
    const r = panelRig({ parallelCompile: false });
    r.panel.show(screen());
    await flush();
    for (let i = 1; i <= 3; i++) { now = i * 100; r.panel.redraw(); }
    const ro = r.s.readout();
    expect(ro.levels.L4).toBe(3);
    expect(ro.surfaces.loading.reasons).toEqual({ 'waiting:module': 1, 'L4:no-parallel-link': 3 });
    expect(ro.surfaces.loading.last).toEqual({ level: 'L4', reason: 'no-parallel-link' });
    r.panel.hide();
  });

  it('waiting on the links, then L0 on the GPU (the surface\'s own count, per surface through hostFor), then L2 after a loss and while the restored links run', async () => {
    const r = panelRig({ parallelCompile: true });
    r.panel.show(screen());
    await flush();
    now = 100; r.panel.redraw();                                       // the context made, links begun
    now = 200; r.panel.redraw();
    r.f.compile.finish();
    now = 300; r.panel.redraw();                                       // on the GPU
    expect(r.made[0]!.stats.frames.L0).toBe(1);
    r.f.loss.lose(); r.f.events.flush();
    now = 400; r.panel.redraw();                                       // lost: the panel's software, L2
    r.f.loss.restore(); r.f.events.flush();
    now = 500; r.panel.redraw();                                       // restored, links running after the loss: L2
    const ro = r.s.readout();
    expect(ro.surfaces.loading.levels).toEqual({ L0: 1, L1: 0, L2: 2, L3: 0, L4: 0 });
    expect(ro.surfaces.loading.waiting).toBe(3);
    expect(ro.surfaces.loading.reasons).toEqual({ 'waiting:module': 1, 'waiting:links': 2 });
    expect(ro.levels).toEqual({ L0: 1, L1: 0, L2: 2, L3: 0, L4: 0 });
    r.panel.hide();
  });

  it('the page\'s own loader (`uiGpuSurfaceLoader`) on a canvas with no WebGL2: L4 no-webgl2, counted for `loading`', async () => {
    const s = sw(ON_LOADING);
    const load = uiGpuSurfaceLoader({ surface: 'loading', transparent: false, sw: s, win: window });
    expect(load.ladder).toBeDefined();
    const panel = new LoadingPanel(document, () => ({ scale: 1 }), { resolveAt: (sc) => s.resolve('loading', sc), load });
    panel.show(screen());
    for (let i = 1; i <= 50 && s.readout().surfaces.loading.levels.L4 === 0; i++) { await flush(); now = i * 100; panel.redraw(); }
    const ro = s.readout();
    expect(ro.surfaces.loading.levels.L4).toBeGreaterThan(0);
    expect(ro.levels.L4).toBe(ro.surfaces.loading.levels.L4);
    expect(ro.surfaces.loading.reasons['L4:no-webgl2']).toBe(ro.surfaces.loading.levels.L4);
    expect(ro.surfaces.loading.last).toEqual({ level: 'L4', reason: 'no-webgl2' });
    panel.hide();
  }, 60_000);

  it('a panel whose loader carries no ladder (a test\'s plain function) counts nothing, as before', async () => {
    const s = sw(ON_LOADING);
    const f = fakeGl({ unmaskedRenderer: SWIFTSHADER, parallelCompile: true });
    const made: UiGpuSurfacePresenter[] = [];
    const laddered = fakeLoader<LoadingGpuSurface>(s, 'loading', f, false, made);
    const panel = new LoadingPanel(document, () => ({ scale: 1 }), { resolveAt: (sc) => s.resolve('loading', sc), load: (at) => laddered(at) });
    panel.show(screen());
    await flush();
    for (let i = 1; i <= 3; i++) { now = i * 100; panel.redraw(); }
    expect(s.readout().levels).toEqual({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 });
    panel.hide();
  });
});

// ---- the overlay --------------------------------------------------------------------------------------------------------

const ovPattern = (w: number, h: number, seed: number): Rgba => pattern(w, h, seed);
const ovBitmaps = new Map<string, Rgba>();
const ovTextures = (name: string): UiBitmap | null => {
  const k = name.toLowerCase();
  if (!ovBitmaps.has(k)) ovBitmaps.set(k, ovPattern(8, 8, [...k].reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 255, 7)));
  return ovBitmaps.get(k)!;
};
let disc: FrontEndDisc | null = null;
async function overlay(gpu: NativeSettingsGpu) {
  disc ??= await readFrontEndDisc(new FsAssetSource(resolve(import.meta.dirname, '../../../test-fixtures')));
  const d = disc;
  const state = pageNativeOptionsState(d, new CardSlots(() => null, () => {}), new ControllerConfigs());
  const settings = new NativeSettings({ doc: document, load: async () => ({ assets: { disc: d, textures: ovTextures }, state }), hd: () => ({ scale: 2 }), gpu });
  await settings.preload();
  return { settings, state };
}

describe.skipIf(!existsSync(resolve(import.meta.dirname, '../../../test-fixtures')))('GM-30: the overlay\'s fallback frames counted on the switch, per surface', () => {
  it('L4 (a software adapter): counted for `overlay` with its reason, the panel\'s surface untouched', async () => {
    const s = sw('?uiGpu=on&uiGpuSurface=overlay');
    const f = fakeGl({ unmaskedRenderer: SWIFTSHADER, parallelCompile: true });
    const made: UiGpuSurfacePresenter[] = [];
    const { settings, state } = await overlay({ resolveAt: (sc) => s.resolve('overlay', sc), load: fakeLoader<UiGpuMountSurface>(s, 'overlay', f, true, made) });
    settings.open();
    settings.frame(1000, new Set());
    await flush();
    for (let i = 1; i <= 3; i++) settings.frame(1000 + i * 16.7, new Set());
    const ro = s.readout();
    expect(ro.surfaces.overlay.levels.L4).toBe(3);
    expect(ro.surfaces.overlay.reasons).toEqual({ 'waiting:module': 1, 'L4:software-adapter': 3 });
    expect(ro.surfaces.loading.levels.L4).toBe(0);
    expect(ro.levels.L4).toBe(3);
    settings.dispose(); state.dispose?.();
  }, 60_000);
});
