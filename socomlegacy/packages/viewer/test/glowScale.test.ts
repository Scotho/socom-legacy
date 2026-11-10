import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinearSRGBColorSpace, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, type RenderTarget } from 'three';
import {
  GLOW_CAP_FLOOR_MS_ADAPTATION, GLOW_FLOOR_SHARE_ADAPTATION, GLOW_FRAME_WINDOW_ADAPTATION, GLOW_SCALE_HALF_ADAPTATION, GLOW_SCALE_KEY,
  GLOW_SLOW_FRAME_MS_ADAPTATION, GLOW_TARGET_SCALE_ADAPTATION, glowScale, slowFrames, glowScaleLine, glowScaleOverride, readGlowScale, saveGlowScale, softwareAdapterOf,
} from '../src/glowScale';
import { GlowFrame, type MainPass } from '../src/glowTarget';
import { FrameSampler, pageFrameSampler, resetPageFrameSamplerForTest } from '../src/frameSampler';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * GLOW-STEPDOWN (product track, `GLOW_TARGET_SCALE_ADAPTATION`, a labelled browser adaptation with no original): on a
 * no-GPU client (SwiftShader, 2 vCPU, ~275 ms a frame) a flashbang's glow frames cost 1.25-1.65x a plain frame for ~10 s;
 * the native glow's world target acquired at half the drawing buffer put them at or below the plain frame (the ladder,
 * `agent-mail/evidence/flash-lag-2026-11-08/REVIEW-GLOW-BODIES-1.md`: glow-window mean 284 vs 448 ms). So a weak GPU --
 * a software adapter, or a page whose recent frames are slow -- gets the half target; a GPU that draws the glow keeps
 * the full one, the look unchanged. The precedence is the graphics backend's (the fold, 2026-11-08): `?glowscale=` first, so a probe or a tester can force
 * either on any page, then the browser setting, then auto.
 */

describe('glowScale(): the policy, its inputs and their precedence', () => {
  const fps60 = Array.from({ length: 120 }, () => 16.7);
  const auto = { setting: 'auto' as const, override: null, softwareAdapter: false, recentFrames: fps60 as readonly number[] | null };

  it('is labelled, and its numbers are the brief\'s and the review\'s: half each way; the median of 120 over max(25 ms, 1.5 x the floor)', () => {
    expect(GLOW_TARGET_SCALE_ADAPTATION).toMatch(/no original/);
    expect([GLOW_SCALE_HALF_ADAPTATION, GLOW_SLOW_FRAME_MS_ADAPTATION, GLOW_FRAME_WINDOW_ADAPTATION]).toEqual([0.5, 25, 120]);
    expect([GLOW_FLOOR_SHARE_ADAPTATION, GLOW_CAP_FLOOR_MS_ADAPTATION]).toEqual([1.5, 34.5]);
  });

  it('auto on a hardware adapter with fast frames: full (the look unchanged)', () => {
    expect(glowScale(auto)).toEqual({ scale: 1, reason: 'auto' });
    expect(glowScale({ ...auto, recentFrames: null })).toEqual({ scale: 1, reason: 'auto' });     // no frames measured yet
    expect(glowScale({ ...auto, recentFrames: [] })).toEqual({ scale: 1, reason: 'auto' });
    expect(glowScale({ ...auto, recentFrames: [16.7, 25, 25] }).scale).toBe(1);                    // at the bound: not over it
  });

  it('auto on a software adapter: half', () => {
    expect(glowScale({ ...auto, softwareAdapter: true })).toEqual({ scale: 0.5, reason: 'software adapter' });
  });

  it('auto with slow frames: a sustained 40 ms is half, its median named', () => {
    expect(glowScale({ ...auto, recentFrames: Array.from({ length: 120 }, () => 40) })).toEqual({ scale: 0.5, reason: 'slow frames 40 ms' });
    expect(glowScale({ ...auto, recentFrames: [16.7, 31.2, 31.2] })).toEqual({ scale: 0.5, reason: 'slow frames 31 ms' });   // a 60 Hz floor: over 25
  });

  it('review F1: a frame-capped page (30 Hz: 33.3 ms intervals) is not slow -- its floor is the cap, the bound 50 ms', () => {
    expect(slowFrames(Array.from({ length: 120 }, () => 33.3))).toBeNull();
    expect(slowFrames(Array.from({ length: 120 }, (_, i) => (i % 2 ? 33.2 : 33.5)))).toBeNull();
    expect(glowScale({ ...auto, recentFrames: Array.from({ length: 120 }, () => 33.3) })).toEqual({ scale: 1, reason: 'auto' });
    // A floor above the 30 Hz cap is no cap: the page is merely slow, the bound the 60 Hz page's 25 ms.
    expect(slowFrames(Array.from({ length: 120 }, () => 40))).toBe(40);
  });

  it('review F2: one stall (a load\'s first frames, a spawn\'s compile) inside the window on a good GPU is not slow', () => {
    const stalled = [...Array.from({ length: 119 }, () => 16.7), 1100];
    expect(slowFrames(stalled)).toBeNull();
    expect(glowScale({ ...auto, recentFrames: stalled })).toEqual({ scale: 1, reason: 'auto' });
  });

  it('the query switch over auto: half or full whatever the adapter and the frames; `auto` leaves it to them', () => {
    expect(glowScale({ ...auto, override: 'half' })).toEqual({ scale: 0.5, reason: 'address' });
    expect(glowScale({ ...auto, override: 'full', softwareAdapter: true, recentFrames: [300] })).toEqual({ scale: 1, reason: 'address' });
    expect(glowScale({ ...auto, override: 'auto', softwareAdapter: true }).reason).toBe('software adapter');
  });

  it('the address first: half or full wins over the saved setting; `?glowscale=auto` or none leaves it to the setting', () => {
    expect(glowScale({ ...auto, setting: 'full', override: 'half' })).toEqual({ scale: 0.5, reason: 'address' });
    expect(glowScale({ ...auto, setting: 'half', override: 'full', softwareAdapter: true, recentFrames: [300] })).toEqual({ scale: 1, reason: 'address' });
    expect(glowScale({ ...auto, setting: 'half', override: 'auto' })).toEqual({ scale: 0.5, reason: 'setting' });
  });

  it('the setting next: Full or Half wins over the detection; Automatic defers to it', () => {
    expect(glowScale({ ...auto, setting: 'full', softwareAdapter: true, recentFrames: [300] })).toEqual({ scale: 1, reason: 'setting' });
    expect(glowScale({ ...auto, setting: 'half' })).toEqual({ scale: 0.5, reason: 'setting' });
    expect(glowScale({ ...auto, setting: 'auto', softwareAdapter: true }).reason).toBe('software adapter');
  });

  it('the decision\'s debug line', () => {
    expect(glowScaleLine({ scale: 0.5, reason: 'software adapter' })).toBe('glow target: half (software adapter)');
    expect(glowScaleLine({ scale: 0.5, reason: 'slow frames 31 ms' })).toBe('glow target: half (slow frames 31 ms)');
    expect(glowScaleLine({ scale: 1, reason: 'auto' })).toBe('glow target: full (auto)');
  });
});

describe('the address switch `?glowscale=`', () => {
  it('reads half, full and auto; anything else or nothing is no switch', () => {
    expect(glowScaleOverride('?glowscale=half')).toBe('half');
    expect(glowScaleOverride('?devmode&glowscale=full')).toBe('full');
    expect(glowScaleOverride('?glowscale=auto')).toBe('auto');
    expect(glowScaleOverride('?glowscale=quarter')).toBeNull();
    expect(glowScaleOverride('')).toBeNull();
  });
});

describe('the browser setting `s2u.viewer.glowScale`', () => {
  it('round-trips through the page\'s store; nothing stored or garbage reads auto; the key is the page\'s', () => {
    const m = new Map<string, string>();
    const read = (k: string): string | null => m.get(k) ?? null, write = (k: string, v: string): void => { m.set(k, v); };
    expect(readGlowScale(read)).toBe('auto');
    saveGlowScale('half', write);
    expect(m.get(GLOW_SCALE_KEY)).toBe('half');
    expect(readGlowScale(read)).toBe('half');
    saveGlowScale('full', write);
    expect(readGlowScale(read)).toBe('full');
    m.set(GLOW_SCALE_KEY, 'ultra');
    expect(readGlowScale(read)).toBe('auto');
    expect(GLOW_SCALE_KEY).toBe('s2u.viewer.glowScale');
    expect(PAGE_SETTING_KEYS).toContain(GLOW_SCALE_KEY);
  });
});

describe('the software adapter, as each backend reports it', () => {
  const gl = (renderer: string) => ({
    RENDERER: 0x1f01,
    getExtension: (n: string) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    getParameter: (p: number) => (p === 0x9246 ? renderer : 'WebKit WebGL'),
  });
  it('WebGL2: the unmasked renderer naming a software rasteriser', () => {
    expect(softwareAdapterOf({ isWebGLBackend: true, gl: gl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)') })).toBe(true);
    expect(softwareAdapterOf({ isWebGLBackend: true, gl: gl('llvmpipe (LLVM 15.0.7, 256 bits)') })).toBe(true);
    expect(softwareAdapterOf({ isWebGLBackend: true, gl: gl('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)') })).toBe(true);
    expect(softwareAdapterOf({ isWebGLBackend: true, gl: gl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)') })).toBe(false);
    expect(softwareAdapterOf({ isWebGLBackend: true })).toBe(false);                               // no context to ask
  });
  it('WebGPU: the device\'s adapter info, `isFallbackAdapter` or a software architecture', () => {
    expect(softwareAdapterOf({ isWebGPUBackend: true, device: { adapterInfo: { isFallbackAdapter: true } } })).toBe(true);
    expect(softwareAdapterOf({ isWebGPUBackend: true, device: { adapterInfo: { vendor: 'google', architecture: 'swiftshader' } } })).toBe(true);
    expect(softwareAdapterOf({ isWebGPUBackend: true, device: { adapterInfo: { vendor: 'nvidia', architecture: 'lovelace', isFallbackAdapter: false } } })).toBe(false);
    expect(softwareAdapterOf({ isWebGPUBackend: true, device: {} })).toBe(false);
  });
});

describe('the frame sampler\'s recent intervals (the last N frames)', () => {
  it('the last n intervals pushed, oldest first; all held when fewer; empty with none', () => {
    const s = new FrameSampler(8);
    expect(s.recent(4)).toEqual([]);
    for (const ms of [10, 11, 12, 13, 40, 41]) s.push(ms);
    expect(s.recent(2)).toEqual([40, 41]);
    expect(s.recent(4)).toEqual([12, 13, 40, 41]);
    expect(s.recent(100)).toEqual([10, 11, 12, 13, 40, 41]);                                      // fewer held: all of them
    for (const ms of [50, 51, 52, 53]) s.push(ms);                                                 // the ring wraps
    expect(s.recent(4)).toEqual([50, 51, 52, 53]);
    expect(s.recent(8)).toEqual([12, 13, 40, 41, 50, 51, 52, 53]);
  });
});

describe('GlowFrame.acquire at a scale', () => {
  const MAIN: MainPass = { samples: 4, stencil: false, outputColorSpace: LinearSRGBColorSpace, canvasFormat: null };
  it('half: half the drawing buffer each way (floored, at least 1); full: the buffer; the scale held to the flash\'s end', () => {
    const f = new GlowFrame(MAIN);
    const t = f.acquire(1281, 721, 0.5);
    expect([t.width, t.height]).toEqual([640, 360]);
    expect([f.acquire(1281, 721, 1).width, t.height]).toEqual([640, 360]);                         // mid-flash: kept
    f.release();
    expect([f.acquire(1280, 720).width, f.acquire(1280, 720).height]).toEqual([1280, 720]);       // the default: full
    f.release();
    expect([f.acquire(1, 1, 0.5).width, f.acquire(1, 1, 0.5).height]).toEqual([1, 1]);
  });
});

// The renderer's own acquisition, through a fake three (as `flashWarm.test.ts`): no GPU, no browser.
const seen = vi.hoisted(() => ({
  draws: [] as { scene: unknown; target: RenderTarget | null }[],
  glRenderer: null as string | null,
}));
vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: RenderTarget | null = null;
    width = 1280; height = 720; ratio = 1;
    backend = {
      isWebGLBackend: true, createRenderPipeline() {},
      gl: seen.glRenderer === null ? undefined : {
        RENDERER: 0x1f01, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }), getParameter: () => seen.glRenderer,
      },
    };
    async init() {} setClearColor() {}
    setPixelRatio(r: number) { this.ratio = Number.isFinite(r) ? r : 1; }
    setSize(w: number, h: number) { this.width = w; this.height = h; }
    getRenderTarget() { return this.target; } setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(Math.floor(this.width * this.ratio), Math.floor(this.height * this.ratio)); }
    initRenderTarget() {}
    render(scene: unknown) { seen.draws.push({ scene, target: this.target }); }
    compileAsync() { return Promise.resolve(); }
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer } from '../src/renderer';

describe('the renderer acquires the native glow target at the policy\'s scale, decided once a flash', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    seen.draws = []; seen.glRenderer = null; store.clear();
    resetPageFrameSamplerForTest();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }, key: () => null, length: 0, clear: () => { store.clear(); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetPageFrameSamplerForTest(); });

  /** One flash's first glowing frame: the target the world was drawn into, its size. */
  async function flashTarget(): Promise<[number, number]> {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    scene.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial()));
    v.resize(1280, 720);
    v.setGlow({ passes: 1, fix: 64 });
    v.render(scene, camera);
    const t = seen.draws.find((d) => d.scene === scene)?.target ?? null;
    expect(t, 'the world drawn into the glow target').not.toBeNull();
    const size: [number, number] = [t!.width, t!.height];
    v.setGlow({ passes: 0, fix: 0 });
    await v.renderer.dispose();
    return size;
  }

  it('a hardware adapter, fast frames, nothing set: full (as before)', async () => {
    seen.glRenderer = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)';
    for (let i = 0; i < 200; i++) pageFrameSampler().sampler.push(16.7);
    expect(await flashTarget()).toEqual([1280, 720]);
  });

  it('a software adapter: half, said once at debug level', async () => {
    seen.glRenderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(await flashTarget()).toEqual([640, 360]);
    expect(debug.mock.calls.filter((c) => String(c[0]).startsWith('glow target:')).map((c) => c[0])).toEqual(['glow target: half (software adapter)']);
  });

  it('slow frames (the page\'s last 120, a sustained 40 ms): half; a 30 Hz-capped page or one stall: full', async () => {
    for (let i = 0; i < 300; i++) pageFrameSampler().sampler.push(i < 180 ? 16.7 : 40);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(await flashTarget()).toEqual([640, 360]);
    for (let i = 0; i < 120; i++) pageFrameSampler().sampler.push(33.3);
    expect(await flashTarget()).toEqual([1280, 720]);
    for (let i = 0; i < 120; i++) pageFrameSampler().sampler.push(i === 60 ? 1100 : 16.7);
    expect(await flashTarget()).toEqual([1280, 720]);
  });

  it('`?glowscale=half` and the setting Half: half; the setting Full over a software adapter: full; the address over the setting', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal('location', { search: '?glowscale=half' });
    expect(await flashTarget()).toEqual([640, 360]);
    vi.stubGlobal('location', { search: '' });
    saveGlowScale('half');
    expect(await flashTarget()).toEqual([640, 360]);
    saveGlowScale('full');
    seen.glRenderer = 'llvmpipe (LLVM 15.0.7, 256 bits)';
    expect(await flashTarget()).toEqual([1280, 720]);
    vi.stubGlobal('location', { search: '?glowscale=half' });                                     // the address over Full
    expect(await flashTarget()).toEqual([640, 360]);
    saveGlowScale('half');
    vi.stubGlobal('location', { search: '?glowscale=full' });                                     // and over Half
    expect(await flashTarget()).toEqual([1280, 720]);
  });
});
