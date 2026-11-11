// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { drawsMenuFrame, frontGpuMayDraw, hdMenusApplier } from '../src/frontEnd';
import { UiQuadRasterCache, type RasterOptions, type UiTextures } from '../src/uiCompositorView';
import { FrontEndGpu, uiGpuFrontFrameOptions, type FrontEndGpuSurface } from '../src/uiGpuFront';
import { UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UI_GPU_SURFACES_ADAPTATION, UiGpuSwitch, uiGpuPageTable, type UiGpuStorage, type UiGpuSurfaceTable } from '../src/uiGpuSwitch';
import type { UiPresented, UiPresenter } from '../src/uiPresenter';
import { fakeGl, type FakeGlOptions } from './uiGpuFakeGl';

// GM-28 (plan 2026-11-01-gpu-menus, GM.R19: "the original 1x frame" whenever the GPU path does not present; GM.R9, GM.R18;
// research 380 §5): every software frame the HD menus draw while the GPU does not present is the 640 x 448 frame -- scale 1,
// no HD lookup, no quad cache -- never the 4x software frame (GM-02: 150-183 ms a frame). PRODUCT TRACK, a browser
// adaptation: it decides at which scale the fallback drawer runs, never a byte of the original frame. Evidence kind: unit
// tests on the fake WebGL2 context (`./uiGpuFakeGl.ts`, not a GPU) and source inspection of the page's loop; no browser.

const clearItem: UiDrawItem = { kind: 'clear', rgb: [10, 20, 30] };
const noTextures: UiTextures = () => null;
const GPU_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

/** The 2D canvas's software presenter: a recorder of the options each frame was drawn with. */
class SoftwareRecorder implements UiPresenter {
  readonly kind = 'cpu';
  readonly seen: RasterOptions[] = [];
  present(_i: readonly UiDrawItem[], _t: UiTextures, options: RasterOptions = {}): UiPresented {
    this.seen.push({ ...options });
    const s = options.scale ?? 1;
    return { undrawn: [], width: 640 * s, height: 448 * s };
  }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
}

const clock = { now: () => 1000, setTimeout: () => 0, clearTimeout: () => undefined };

const surfaceRig = (fo: FakeGlOptions = {}, search = '', so: Partial<UiGpuSurfaceOptions> = {}) => {
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...fo });
  const sw = new SoftwareRecorder();
  const host = new UiGpuSwitch({ search, storage: () => null, devTools: false });
  const s = new UiGpuSurfacePresenter({
    canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: sw, transparent: false, surface: 'front', clock, host, ...so,
  });
  return { f, s, sw, host };
};

/** The HD options the page hands a frame at 2x (an HD scale; the fake's pixel loops make 4x slow). */
const hdOptions = (): RasterOptions => ({ scale: 2, hd: () => null, quadCache: new UiQuadRasterCache() });

const expectOriginal = (o: RasterOptions | undefined): void => {
  expect(o).toBeDefined();
  expect(o!.scale).toBe(1);
  expect(o!.hd).toBeUndefined();
  expect(o!.quadCache).toBeUndefined();
};

describe('GM-28: the surface draws every software frame at 1x under HD (GM.R19), not only after a loss', () => {
  it('(a) L4 -- no WebGL2, a software adapter, MAX_TEXTURE_SIZE under 4096, a program that does not link: 1x, no HD lookup', () => {
    for (const fo of [{ noContext: true }, { unmaskedRenderer: SWIFTSHADER }, { maxTexture: 2048 }, { failLink: true }] as FakeGlOptions[]) {
      const r = surfaceRig(fo);
      r.s.present([clearItem], noTextures, hdOptions());
      expect(r.s.state).toBe('unavailable');
      expect(r.sw.seen).toHaveLength(1);
      expectOriginal(r.sw.seen[0]);
      expect(r.s.stats.frames.L4).toBe(1);
    }
  });

  it('(b) waiting for the links (KHR_parallel_shader_compile, not complete): 1x, still counted as waiting', () => {
    const r = surfaceRig({ parallelCompile: true });
    r.s.create();
    r.s.present([clearItem], noTextures, hdOptions());
    expect(r.s.state).toBe('compiling');
    expectOriginal(r.sw.seen[0]);
    expect(r.s.stats.frames.waiting).toBe(1);
  });

  it('(c) released (a match after `leave`, until the relink): 1x', () => {
    const r = surfaceRig();
    r.s.present([clearItem], noTextures, hdOptions());
    expect(r.s.lastPath).toBe('gpu');
    expect(r.sw.seen).toHaveLength(0);                       // L0: the HD options went to the GPU, no software frame
    r.s.release();
    r.s.present([clearItem], noTextures, hdOptions());
    expect(r.s.state).toBe('released');
    expectOriginal(r.sw.seen[0]);
  });

  it('a scale-1 frame is the same frame either way (no pack: nothing changes)', () => {
    const r = surfaceRig({ noContext: true });
    r.s.present([clearItem], noTextures, { scale: 1 });
    expect(r.sw.seen[0]!.scale).toBe(1);
  });

  it('dev shadow keeps the shown scale while the surface can draw (the guard compares HD frames); an L4 surface in shadow draws 1x', () => {
    const ok = surfaceRig({}, '?uiGpu=shadow');
    const o = hdOptions();
    ok.s.present([clearItem], noTextures, o);
    expect(ok.sw.seen[0]!.scale).toBe(2);
    expect(ok.sw.seen[0]!.hd).toBe(o.hd);
    expect(ok.sw.seen[0]!.quadCache).toBe(o.quadCache);
    const l4 = surfaceRig({ noContext: true }, '?uiGpu=shadow');
    l4.s.present([clearItem], noTextures, hdOptions());
    expectOriginal(l4.sw.seen[0]);
  });
});

/** A surface stand-in for the page's swap: `lastPath` as the test sets it. */
class SurfaceStandIn implements FrontEndGpuSurface {
  readonly kind = 'gpu-surface';
  lastPath: 'gpu' | 'software' | null = null;
  present(): UiPresented { return { undrawn: [], width: 640, height: 448 }; }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
  release(): void { /* nothing */ }
  returned(): void { /* nothing */ }
  dispose(): void { /* nothing */ }
}

const place = (el: HTMLCanvasElement): void => { el.style.position = 'fixed'; };
const twin = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.id = 'front-end'; c.width = 640; c.height = 448;
  document.body.append(c);
  return c;
};
const pageSwitch = (search = '', table?: UiGpuSurfaceTable, storage: UiGpuStorage = () => null): UiGpuSwitch =>
  new UiGpuSwitch({ search, storage, devTools: false, table });

afterEach(() => { document.body.replaceChildren(); });

describe('GM-28: the page\'s own software frame (pre-import, a guard trip, `off`) is the 1x frame', () => {
  const chosen = { scale: 4, hd: () => null, quadCache: new UiQuadRasterCache(), version: 3 };

  it('uiGpuFrontFrameOptions: HD only to a frame the surface draws; any other frame 1x, no HD lookup, no quad cache', () => {
    expect(uiGpuFrontFrameOptions(chosen, true)).toBe(chosen);
    const sw = uiGpuFrontFrameOptions(chosen, false);
    expectOriginal(sw as RasterOptions);
    const one = { scale: 1 };
    expect(uiGpuFrontFrameOptions(one, false)).toBe(one);    // no pack: the same options, no copy a frame
  });

  it('(d) before the surface\'s import() lands: the switch on, no surface yet -- the page draws 1x', () => {
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: pageSwitch('?uiGpu=on'), place, load: () => new Promise(() => {}) })!;
    expect(g).not.toBeNull();
    expect(g.drawsOn(4)).toBe(false);
    expectOriginal(uiGpuFrontFrameOptions(chosen, g.drawsOn(4)) as RasterOptions);
  });

  it('(e) a guard trip (session kill `guard-trip`): the page\'s path, 1x', () => {
    const s = pageSwitch('?uiGpu=on');
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: s, place, load: () => new Promise(() => {}) })!;
    g.attach(new SurfaceStandIn());
    expect(g.drawsOn(4)).toBe(true);
    s.kill('guard-trip', 'front');
    expect(g.drawsOn(4)).toBe(false);
    expectOriginal(uiGpuFrontFrameOptions(chosen, g.drawsOn(4)) as RasterOptions);
  });

  it('(f) `?uiGpu=off`, the storage kill, a table cell off: no surface, 1x, and the menus\' HD pack never asked', () => {
    const offs = [
      pageSwitch('?uiGpu=off'),
      pageSwitch('', undefined, () => ({ getItem: () => 'off' })),
      pageSwitch('', { ...UI_GPU_SURFACES_ADAPTATION, front: { hd: 'off', sd: 'off' } }),   // the flip (GM.R18): the landed cells are on
    ];
    for (const s of offs) {
      expect(FrontEndGpu.mount({ doc: document, twin: twin(), sw: s, place, load: () => Promise.reject(new Error('never')) })).toBeNull();
      expectOriginal(uiGpuFrontFrameOptions(chosen, false) as RasterOptions);
      expect(frontGpuMayDraw(s, false)).toBe(false);
      expect(frontGpuMayDraw(s, true)).toBe(false);
    }
  });

});

describe('GM-28: the load gate -- the menus\' HD pack loads while the front may draw on the GPU (GM-HDCAP\'s gate, shadow restored in dev)', () => {
  it('`on` (URL or table) loads; a session kill does not; the development table\'s `shadow` loads on the dev server only', () => {
    expect(frontGpuMayDraw(pageSwitch('?uiGpu=on'), false)).toBe(true);
    expect(frontGpuMayDraw(pageSwitch('', { ...UI_GPU_SURFACES_ADAPTATION, front: { hd: 'on', sd: 'off' } }), false)).toBe(true);
    const killed = pageSwitch('?uiGpu=on');
    killed.kill('loss-limit', 'front');
    expect(frontGpuMayDraw(killed, false)).toBe(false);
    const shadow = { ...UI_GPU_SURFACES_ADAPTATION, front: { hd: 'shadow', sd: 'off' } } as const;   // GM-16b's development cell
    expect(frontGpuMayDraw(pageSwitch('', shadow), true)).toBe(true);                   // the dev server's shadow keeps the HD menus
    expect(frontGpuMayDraw(pageSwitch('', shadow), false)).toBe(false);                 // a built page's shadow cannot
    // The flip (GM.R18; was false on a built page): both page tables are `on`, so the HD pack loads for the GPU surface,
    // whose non-presenting states (L4 -- a software adapter -- waiting, released) still draw 1x (GM-28's per-frame options).
    expect(frontGpuMayDraw(pageSwitch('', uiGpuPageTable(false)), false)).toBe(true);
    expect(frontGpuMayDraw(pageSwitch('', uiGpuPageTable(true)), true)).toBe(true);
    expect(frontGpuMayDraw(pageSwitch('?uiGpu=shadow'), false)).toBe(false);           // a built page's URL shadow: no 4x software
  });
});

describe('GM-28: the page\'s readers of the menus\' HD (source inspection: the loop needs a 2D canvas jsdom lacks)', () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
  const loop = src.slice(src.indexOf('const step = (now: number): boolean => {'));
  const body = loop.slice(0, loop.indexOf('const frontGuard = new FrameGuard();'));

  it('the loop: the pack\'s options chosen, the path decided at its scale, then the frame\'s options -- HD to the surface, 1x to the page\'s software', () => {
    expect(body).toMatch(/const chosen = hdMenus\?\.options\(\) \?\? \{ scale: 1 \};/);
    expect(body).toMatch(/const gpu = gpuFront\?\.drawsOn\(chosen\.scale\) \?\? false;/);
    expect(body).toMatch(/const hd = uiGpuFrontFrameOptions\(chosen, gpu \|\| uiPerf\.hd\);/);
    expect(body).not.toMatch(/const hd = hdMenus\?\.options\(\)/);
  });

  it('the overlay and the loading panel take the menus\' options beside their GPU surfaces (GM-19a, GM-23: only the surface draws them)', () => {
    // GM-19a re-pin (was `hd: () => ({ scale: 1 })`): the overlay's own GPU surface takes the HD options and every
    // software frame is 1x inside `NativeSettings` (`nativeSettingsGpu.test.ts`), the same rule as the loop's above.
    // GM-XBOX1 re-pin (was `hd: ..., gpu: {`; review F1): the menus' options and the GPU option from one `uiGpuSurfaceWiring`
    // per surface, the 1x option where the GPU's is withheld (the Xbox class); here and below.
    expect(src).toMatch(/new NativeSettings\(\{ doc, load: [^\n]*, \.\.\.uiGpuSurfaceWiring\('overlay', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: \(s: number\) => uiGpu\.resolve\('overlay', s\)/);
    // The lane holder's amendment (2026-11-09): GM-22 makes the panel a whole-frame software raster every animation
    // frame, so its software takes no HD options even while the front end presents on the GPU -- only its own surface
    // may. GM-23 re-pin (was `() => ({ scale: 1 })` and no `hdMenus`): that surface is wired now, and the 1x rule for
    // the panel's software is inside `LoadingPanel` (`loadingPanelGpu.test.ts`).
    expect(src).toMatch(/new LoadingPanel\(doc, w\.hd, w\.gpu\)\)\(uiGpuSurfaceWiring\('loading', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: \(s: number\) => uiGpu\.resolve\('loading', s\)/);
  });

  it('the load gate reads frontGpuMayDraw with the dev server\'s answer, and no more once the front surface is down (flip review F2)', () => {
    expect(src).toMatch(/gpu: !frontGpuDown && frontGpuMayDraw\(uiGpu, uiGpuDevBuild\(\)\)/);
  });
});

/** A surface stand-in in a given lifecycle state (`UiGpuSurfacePresenter.state`), with its L4 reason. */
class StatedSurface extends SurfaceStandIn {
  constructor(public state: string, readonly stats = { losses: 0, unavailable: state === 'unavailable' ? 'software-adapter' : null }) { super(); }
}

// The flip's review F3 (GM.R17; GM-28): a surface that cannot present -- L4 (`unavailable`), L3 (`dead`), let go, or no
// surface -- is not the GPU path: the page draws its own 1x software, and GM.R17's GPU-only skip of a hidden frame binds
// only a surface that can present, so the held menus are drawn at scale 1 "as they always have".
describe('the flip review F3: the front end\'s path is the page\'s software whenever its surface cannot present', () => {
  it('unavailable (L4) and dead (L3): drawsOn false at every scale; ready, lost, compiling: the surface\'s', () => {
    for (const [state, presents] of [['unavailable', false], ['dead', false], ['disposed', false], ['ready', true], ['lost', true], ['compiling', true], ['unmade', true]] as const) {
      const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: pageSwitch('?uiGpu=on'), place, load: () => new Promise(() => {}) })!;
      g.attach(new StatedSurface(state));
      for (const scale of [1, 2, 4]) expect(g.drawsOn(scale), `${state} ${scale}x`).toBe(presents);
      document.body.replaceChildren();
    }
  });

  it('GM.R17 then draws the held menus at scale 1 on the page\'s software when the surface is at L4', () => {
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: pageSwitch('?uiGpu=on'), place, load: () => new Promise(() => {}) })!;
    g.attach(new StatedSurface('unavailable'));
    expect(drawsMenuFrame({ menusHidden: true }, 1, g.drawsOn(1))).toBe(true);
    g.attach(new StatedSurface('ready'));
    expect(drawsMenuFrame({ menusHidden: true }, 1, g.drawsOn(1))).toBe(false);     // a presenting surface draws no hidden frame
  });
});

// The flip's review F2: a page whose front surface reaches L4 (no WebGL2, a software adapter, ...) or L3 (the loss limit)
// lets the menus' HD pack go -- its images can never show there. The mount says so once (`down`), and the page re-runs
// its HD decision with the GPU counted out for the session.
describe('the flip review F2: the front surface\'s L4 or L3 is said once, and the page lets the menus\' HD pack go', () => {
  it('down(level, reason) once at L4, once at L3; never for a surface that presents', () => {
    for (const [state, level, reason] of [['unavailable', 'L4', 'software-adapter'], ['dead', 'L3', null]] as const) {
      const down = vi.fn();
      const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: pageSwitch('?uiGpu=on'), place, load: () => new Promise(() => {}), down })!;
      g.attach(new StatedSurface('ready'));
      g.drawsOn(4);
      expect(down).not.toHaveBeenCalled();
      g.attach(new StatedSurface(state));
      g.drawsOn(4); g.drawsOn(1);
      expect(down).toHaveBeenCalledTimes(1);
      expect(down).toHaveBeenCalledWith(level, reason);
      document.body.replaceChildren();
    }
  });

  it('the page: the mount\'s down sets frontGpuDown and re-runs applyHdMenus, whose gate then answers false (source inspection)', () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
    expect(src).toMatch(/let frontGpuDown = false;/);
    expect(src).toMatch(/down: \(\) => \{ frontGpuDown = true; applyHdMenus\(\); \}/);
    expect(src).toMatch(/const applyHdMenus = hdMenusApplier\(\{ on: menusHd,/);
  });
});

// The flip's re-check, finding 3: once the front surface is down, a later pack-choice notice or picture change re-runs
// the HD decision with the GPU counted out -- the pack stays let go: no `set(true)`, no new load (no fetch).
describe('the flip re-check 3: after down, a pack-choice notice or a picture change keeps the menus\' HD pack let go', () => {
  const rig = () => {
    let down = false;
    const sets: boolean[] = [];
    const load = vi.fn(() => Promise.resolve({ set: (on: boolean) => { sets.push(on); } }));
    const apply = hdMenusApplier({ on: () => !down && true, running: () => true, choice: () => 'hd:pack', load });
    return { apply, load, sets, goDown: () => { down = true; } };
  };

  it('loaded, then down: set(false) once; every later notice set(false) again, never set(true); loaded once', async () => {
    const r = rig();
    r.apply(); await flushAll();
    expect(r.sets).toEqual([true]);
    r.goDown(); r.apply(); await flushAll();                   // the mount's down: frontGpuDown, then applyHdMenus
    r.apply(); r.apply(); await flushAll();                    // a pack-choice notice, a picture change
    expect(r.sets).toEqual([true, false, false, false]);
    expect(r.load).toHaveBeenCalledTimes(1);
  });

  it('down before the pack was ever loaded (L4 at boot): a later notice loads nothing', async () => {
    const r = rig();
    r.goDown();
    r.apply(); r.apply(); await flushAll();
    expect(r.load).not.toHaveBeenCalled();
    expect(r.sets).toEqual([]);
  });
});

const flushAll = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

// The flip's re-check, finding 2 (GM-30's rule for the front end): while the front surface is down, every frame the page's
// own software draws is counted on `__uiGpu` with the level and reason `down` carried -- as the overlay's and the panel's
// are -- in the aggregate `levels` and in `surfaces.front`. A frame the surface itself counted is not counted again.
describe('the flip re-check 2: the front end\'s fallback frames after down are counted per surface with their reason', () => {
  const run = (state: 'unavailable' | 'dead', kill?: 'loss-limit') => {
    const s = pageSwitch('?uiGpu=on');
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: s, place, load: () => new Promise(() => {}), ladder: s.hostFor('front') })!;
    if (kill) s.kill(kill, 'front');
    g.attach(new StatedSurface(state));
    for (let i = 0; i < 5; i++) { const gpu = g.drawsOn(4); g.drawn(gpu); g.commit(); }
    return s.readout();
  };

  it('L4 at boot, then 5 frames: surfaces.front.levels.L4 5, reasons L4:software-adapter 5; the aggregate the same', () => {
    const r = run('unavailable');
    expect(r.surfaces.front.levels.L4).toBe(5);
    expect(r.surfaces.front.reasons).toEqual({ 'L4:software-adapter': 5 });
    expect(r.levels.L4).toBe(5);
  });

  it('L3 after the loss limit, then 5 frames: surfaces.front.levels.L3 5, reasons L3:loss-limit 5', () => {
    const r = run('dead', 'loss-limit');
    expect(r.surfaces.front.levels.L3).toBe(5);
    expect(r.surfaces.front.reasons).toEqual({ 'L3:loss-limit': 5 });
    expect(r.levels.L3).toBe(5);
  });

  it('a GPU frame (the one the surface counted itself) is not counted by the mount', () => {
    const s = pageSwitch('?uiGpu=on');
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: s, place, load: () => new Promise(() => {}), ladder: s.hostFor('front') })!;
    g.attach(new StatedSurface('ready'));
    g.drawn(g.drawsOn(4));
    expect(s.readout().surfaces.front.levels).toEqual({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 });
  });
});
