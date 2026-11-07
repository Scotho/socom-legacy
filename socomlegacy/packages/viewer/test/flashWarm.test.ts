import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RenderTarget, Scene, type Object3D } from 'three';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * FLASH-WARM (product track, a renderer warm-up; no game timing touched -- the white-out's wash and glow are uniforms
 * and its timer runs on real time, `./matchThrow`): Cobra89's report (live v0.4.9, "the game just locks up for a couple
 * seconds" at a flashbang) and the owner's measurement at bb133165e (`e2e/flashProfile.spec.ts`, WebGL2 native: the
 * first Mark141's longest frame 533 ms with no new program but 4 textures and 4 geometries made, the second's 117 ms
 * with 3 textures and 4.7 MB re-made; WebGPU native: 6 pipelines built on the first flash's frame). So:
 * - the glow's world target stays a flash's own, as before: made at its first glowing frame, freed at its end (the
 *   controller's cut, 2026-11-07: holding it from the warm-up cost ~85 MB for a first flash the real GPU drew in
 *   ~100 ms, `e2e/flashProfile.spec.ts` on d3d11);
 * - `prepare`'s draws are compiled for the canvas only, as on main: 82de41e83 compiled them under the glow context too,
 *   and the d3d11 profile found the first WebGPU flash's 6 pipelines with or without it (and 6 in the PS2 picture, which
 *   it never covered: most likely the flash's own passes, not yet named);
 * - the map's throwable models (the hand's and the thrown copies' templates) are in the throw's warm-up set, so their
 *   geometries and bitmaps are uploaded with the map, not at the first selection or throw.
 * The renderer below is a fake: it records each `compileAsync`, `render` and `initRenderTarget` with the target then
 * set; no GPU, no browser.
 */

interface Compiled { scene: Object3D; key: string | null; target: RenderTarget | null }
const seen = vi.hoisted(() => ({
  webgpu: false,
  compiles: [] as Compiled[],
  draws: [] as { scene: unknown; target: RenderTarget | null }[],
  inits: [] as { target: RenderTarget; width: number; height: number }[],
}));

/** three r186's render-context key (`RenderContexts.get`) plus what WebGPU's `needsRenderUpdate` compares beside it. */
function contextKey(t: RenderTarget | null): string | null {
  if (t === null) return null;
  return `${t.textures.length}:${t.texture.format}:${t.texture.type}:${t.samples}:${t.depthBuffer}:${t.stencilBuffer}`
    + `|${String(t.texture.internalFormat)}|${t.texture.colorSpace}`;
}

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: RenderTarget | null = null;
    width = 1280; height = 720; ratio = 1;
    backend = seen.webgpu
      ? { isWebGPUBackend: true, utils: { getPreferredCanvasFormat: () => 'bgra8unorm' }, createRenderPipeline() {} }
      : { isWebGLBackend: true, createRenderPipeline() {} };
    async init() {} setClearColor() {}
    setPixelRatio(r: number) { this.ratio = Number.isFinite(r) ? r : 1; }
    setSize(w: number, h: number) { this.width = w; this.height = h; }
    getRenderTarget() { return this.target; } setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(Math.floor(this.width * this.ratio), Math.floor(this.height * this.ratio)); }
    render(scene: unknown) { seen.draws.push({ scene, target: this.target }); }
    initRenderTarget(t: RenderTarget) { seen.inits.push({ target: t, width: t.width, height: t.height }); }
    compileAsync(scene: Object3D) {
      seen.compiles.push({ scene, key: contextKey(this.target), target: this.target });
      return Promise.resolve();
    }
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer } from '../src/renderer';

type Viewer = Awaited<ReturnType<typeof createRenderer>>;
const world = (): Scene => { const s = new Scene(); s.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial())); return s; };
/** The multisampled, depth-buffered target `initRenderTarget` was handed: the glow's world target. */
const glowInits = () => seen.inits.filter((i) => i.target.samples === 4 && i.target.depthBuffer);
/** The single-sampled, depthless one: the glow's half-size buffer. */
const halfInits = () => seen.inits.filter((i) => i.target.samples === 0 && !i.target.depthBuffer);
/** One glowing frame: the target the world was drawn into. */
function flashFrame(v: Viewer, scene: Scene, camera: PerspectiveCamera): RenderTarget {
  seen.draws = [];
  v.setGlow({ passes: 1, fix: 64 });
  v.render(scene, camera);
  const t = seen.draws.find((d) => d.scene === scene)?.target ?? null;
  expect(t, 'the world drawn into the glow target').not.toBeNull();
  return t!;
}

beforeEach(() => { seen.webgpu = false; seen.compiles = []; seen.draws = []; seen.inits = []; });
afterEach(() => { vi.restoreAllMocks(); });

describe('FLASH-WARM: the glow target is a flash\'s own, never held from the warm-up (the ~85 MB keep reverted)', () => {
  it.each([false, true])('the warm (WebGPU %s) uploads no glow target; a flash makes it and its end frees it', async (webgpu) => {
    seen.webgpu = webgpu;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    expect(glowInits()).toEqual([]);
    expect(halfInits()).toEqual([]);
    const t = flashFrame(v, scene, camera);
    const freed: RenderTarget[] = [];
    t.addEventListener('dispose', () => { freed.push(t); });
    v.setGlow({ passes: 0, fix: 0 });                                  // the flash's end
    expect(freed).toEqual([t]);
    await v.renderer.dispose();
  });
});

describe('FLASH-WARM: `prepare` compiles once, for the canvas -- no glow-context twin (measured, dropped)', () => {
  // The d3d11 profile (2026-11-07): WebGPU's first flash built 6 pipelines with the twin and 6 without, the PS2 picture
  // (which the twin never covered) 6 as well -- most likely the flash's own passes, not named -- while the twin added a
  // compile per prepared draw. Kept as main's.
  it.each([false, true])('native (WebGPU %s): a prepared draw is compiled for the canvas only', async (webgpu) => {
    seen.webgpu = webgpu;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    const body = new Group();
    body.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial()));
    seen.compiles = [];
    await v.prepare([body], scene, camera);
    expect(seen.compiles.filter((c) => c.scene === body.children[0]).map((c) => c.key)).toEqual([null]);
    await v.renderer.dispose();
  });
});

describe('FLASH-WARM: the map\'s throwable models are in the throw\'s warm-up set', () => {
  it('`warmObjects` holds every model template the map gave, so a first selection or throw uploads nothing', () => {
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => null as unknown as PlaySnapshot, view: () => 'third', handPoint: () => [0, 0, 0] });
    const model = (name: string): Group => { const m = new Group(); m.name = name; m.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial())); return m; };
    const templates = { flashbang: model('flashbang'), frag: model('frag') };
    g.setMap(templates, { models: [], bitmaps: {}, defaultMaterial: '' });
    const warm = g.warmObjects();
    expect(warm).toEqual(expect.arrayContaining([templates.flashbang, templates.frag]));
    expect(templates.flashbang.parent).toBeNull();                     // not put in the scene: `prepare` parks it
    g.setMap(null, null);
    expect(g.warmObjects()).not.toContain(templates.flashbang);         // the next map's own, not the last's
  });
});
