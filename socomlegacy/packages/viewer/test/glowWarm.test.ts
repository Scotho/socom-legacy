import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, type Object3D, type RenderTarget } from 'three';

/**
 * L3lsGcIs fix 1 (product track, a renderer warm-up; seat 70's finding, 2026-11-02): the native picture's first glowing
 * frame draws the whole world into the glow target (`./renderer` `drawFrame`), and three r186 keys a render object on
 * (object, material, render context), the context on the target's attachments, not its size (`RenderContexts.get`:
 * `count:format:type:samples:depthBuffer:stencilBuffer`; WebGPU's `needsRenderUpdate` also compares the colour space and
 * the colour format). The map's warm (`ViewerRenderer.warm`) compiled only the canvas context, so the first flash built
 * every world mesh's render objects inside one frame. The warm now compiles the world under a twin of the glow target as
 * well -- the same attachments at 1 x 1 -- and frees the twin once its compiles settle. No game timing is touched. The
 * renderer below is a fake: it records each `compileAsync` and each `render` with the target then set; no GPU, no browser.
 */

interface Compiled { scene: Object3D; key: string | null; target: RenderTarget | null; shown: number; ortho: boolean }
const seen = vi.hoisted(() => ({
  webgpu: false, failGlow: false,
  compiles: [] as Compiled[],
  draws: [] as { scene: unknown; target: RenderTarget | null }[],
}));

/** three r186's render-context key (`RenderContexts.get`) plus what WebGPU's `needsRenderUpdate` compares beside it. */
function contextKey(t: RenderTarget | null): string | null {
  if (t === null) return null;
  return `${t.textures.length}:${t.texture.format}:${t.texture.type}:${t.samples}:${t.depthBuffer}:${t.stencilBuffer}`
    + `|${String(t.texture.internalFormat)}|${t.texture.colorSpace}`;
}
/** Every mesh under `o` that would draw: visible down its whole chain. */
const shownMeshes = (o: Object3D): number => { let n = 0; o.traverseVisible((c) => { if ((c as Mesh).isMesh) n++; }); return n; };

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: RenderTarget | null = null;
    backend = seen.webgpu
      ? { isWebGPUBackend: true, utils: { getPreferredCanvasFormat: () => 'bgra8unorm' }, createRenderPipeline() {} }
      : { isWebGLBackend: true, createRenderPipeline() {} };
    async init() {} setPixelRatio() {} setSize() {} setClearColor() {}
    getRenderTarget() { return this.target; } setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(1280, 720); }
    render(scene: unknown) { seen.draws.push({ scene, target: this.target }); }
    compileAsync(scene: Object3D, camera: { isOrthographicCamera?: boolean }) {
      const target = this.target;
      seen.compiles.push({ scene, key: contextKey(target), target, shown: shownMeshes(scene), ortho: camera.isOrthographicCamera === true });
      // A glow-context compile that fails (the review's case): only the canvas's own fails the warm.
      if (seen.failGlow && target !== null && target.samples === this.samples) return Promise.reject(new Error('lost'));
      return Promise.resolve();
    }
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer } from '../src/renderer';

/** The target the world is drawn into at a glowing frame in the native picture, and the additive pass drawn onto it. */
function glowFrameOf(v: Awaited<ReturnType<typeof createRenderer>>, scene: Scene, camera: PerspectiveCamera): { target: RenderTarget; up: unknown } {
  seen.draws = [];
  v.setGlow({ passes: 1, fix: 64 });
  v.render(scene, camera);
  const t = seen.draws.find((d) => d.scene === scene)?.target ?? null;
  expect(t, 'the world drawn into the glow target').not.toBeNull();
  const up = seen.draws.find((d) => d.scene !== scene && d.target === t)?.scene;   // `glowOver`'s additive pass onto it
  expect(up, 'the glow\'s additive pass drawn onto the glow target').toBeDefined();
  return { target: t!, up };
}
const glowTargetOf = (v: Awaited<ReturnType<typeof createRenderer>>, scene: Scene, camera: PerspectiveCamera): RenderTarget => glowFrameOf(v, scene, camera).target;
/** A world: one mesh shown, one hidden (an object hidden now that a flash may show), one out of the frustum. */
function world(): Scene {
  const scene = new Scene();
  const g = new Group();
  const a = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
  const b = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
  b.visible = false;
  g.add(a, b);
  scene.add(g);
  return scene;
}

beforeEach(() => { seen.webgpu = false; seen.failGlow = false; seen.compiles = []; seen.draws = []; });

describe('L3lsGcIs fix 1: the map warm compiles the world under the glow target\'s render context', () => {
  it.each([false, true])('native picture (WebGPU %s): the scene and the glow\'s additive pass compiled under the glow target\'s context, every mesh shown; the stand-ins not', async (webgpu) => {
    seen.webgpu = webgpu;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    const twin = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());   // an `extras` object: not in the scene
    await v.warm(scene, camera, [twin]);
    const warmed = seen.compiles;
    const glow = glowFrameOf(v, scene, camera);
    const glowKey = contextKey(glow.target);
    if (webgpu) expect(glowKey).toContain('bgra8unorm');                  // the canvas's format, as the target's
    // The canvas's own warm, as before.
    expect(warmed.some((c) => c.scene === scene && c.key === null)).toBe(true);
    // And the glow's: the same scene under a target whose context is the glow target's, its two meshes shown for it.
    const underGlow = warmed.filter((c) => c.key === glowKey);
    expect(underGlow.find((c) => c.scene === scene)?.shown).toBe(2);
    // The review's finding 1: the fading twins' stand-ins are never drawn into the glow target -- not compiled there.
    expect(underGlow.filter((c) => !c.ortho).map((c) => c.scene)).toEqual([scene]);
    // The review's finding 2: the additive pass (`up`) the first flash draws onto the glow target, warmed there.
    expect(underGlow.some((c) => c.ortho && c.scene === glow.up)).toBe(true);
    // The flags put back: the hidden mesh hidden again.
    expect(shownMeshes(scene)).toBe(1);
    await v.renderer.dispose();
  });

  it('the twin is a 1 x 1 target, not the glow target itself (which the warm leaves unsized until a flash)', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    await v.warm(scene, camera);
    const twin = seen.compiles.find((c) => c.scene === scene && c.key !== null)!.target!;
    expect([twin.width, twin.height]).toEqual([1, 1]);
    const real = glowTargetOf(v, scene, camera);
    expect(real).not.toBe(twin);
    expect([real.width, real.height]).toEqual([1280, 720]);
    await v.renderer.dispose();
  });

  it('frees the twin: its dispose runs after the warm\'s compiles', async () => {
    const dispose = vi.spyOn((await import('three')).RenderTarget.prototype, 'dispose');
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    dispose.mockClear();
    await v.warm(scene, camera);
    await Promise.resolve();
    const twin = seen.compiles.find((c) => c.scene === scene && c.key !== null)!.target!;
    expect(dispose.mock.contexts).toContain(twin);
    dispose.mockRestore();
    await v.renderer.dispose();
  });

  it('a failed glow-context compile never fails the map\'s warm', async () => {
    seen.failGlow = true;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    await expect(v.warm(scene, camera)).resolves.toBeUndefined();
    await v.renderer.dispose();
  });

  it('the review\'s finding 3: warmed in the PS2 picture, the switch to native compiles the scene and the pass under the glow context, once a warm', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.setPresentation('ps2');
    await v.warm(scene, camera);
    seen.compiles = [];
    v.setPresentation('native');                                       // fire-and-forget: nothing awaited by a frame
    const switched = seen.compiles;
    const glow = glowFrameOf(v, scene, camera);
    const glowKey = contextKey(glow.target);
    const underGlow = switched.filter((c) => c.key === glowKey);
    expect(underGlow.find((c) => c.scene === scene)?.shown).toBe(2);   // every mesh shown for the compile
    expect(underGlow.some((c) => c.ortho && c.scene === glow.up)).toBe(true);
    expect(shownMeshes(scene)).toBe(1);                                // the flags put back
    v.setGlow({ passes: 0, fix: 0 });
    seen.compiles = [];
    v.setPresentation('ps2'); v.setPresentation('native');            // once a warm: not again
    expect(seen.compiles).toEqual([]);
    v.setPresentation('ps2');
    await v.warm(scene, camera);                                       // the next map's warm, in the PS2 picture: armed again
    seen.compiles = [];
    v.setPresentation('native');
    expect(seen.compiles.filter((c) => c.key === glowKey && c.scene === scene)).toHaveLength(1);
    await v.renderer.dispose();
  });

  it('the PS2 picture skips it: its world draws into its permanent frame, warmed already', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.setPresentation('ps2');
    await v.warm(scene, camera);
    const worldCompiles = seen.compiles.filter((c) => c.scene === scene);
    expect(worldCompiles.map((c) => [c.target?.width, c.target?.height])).toEqual([[640, 448]]);   // the PS2 frame alone
    await v.renderer.dispose();
  });
});
