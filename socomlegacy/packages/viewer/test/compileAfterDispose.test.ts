import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, type Object3D } from 'three';

/**
 * WEBGPU-DEPTHFMT (product track, a renderer warm-up; `../src/renderer` `prepare`). RC1's GPU view: the refused pipelines
 * came right after `play.stop`, the match's teardown -- the renderer disposed (its targets freed) while `prepare`'s queue
 * still held jobs. A job that has not started when the renderer is disposed starts no compile: its work is for a renderer
 * that will never draw again, and its `compileAsync` would remake the freed targets' GPU textures after the teardown. The
 * renderer below is a fake: it records each `compileAsync` and holds it until released; no GPU, no browser.
 */

const seen = vi.hoisted(() => ({
  compiles: 0, disposed: false, afterDispose: 0,
  release: [] as (() => void)[],
  /** The pipelines that reached three's backend (the take-2 review's F3: the skip installed by `createRenderer`). */
  pipelines: 0,
}));

vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 0; stencil = false; outputColorSpace = ''; autoClear = true; target: unknown = null;
    backend = {
      isWebGPUBackend: true, utils: { getPreferredCanvasFormat: () => 'bgra8unorm' },
      // A backend with no texture records: every attachment reads as freed.
      has: () => false, get: () => ({}),
      createRenderPipeline() { seen.pipelines++; },
    };
    async init() {} setClearColor() {} setPixelRatio() {} setSize() {}
    getRenderTarget() { return this.target; } setRenderTarget(t: unknown) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(1280, 720); }
    initRenderTarget() {} render() {}
    compileAsync() {
      seen.compiles++;
      if (seen.disposed) seen.afterDispose++;
      return new Promise<void>((resolve) => { seen.release.push(resolve); });
    }
    async dispose() { seen.disposed = true; }
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer } from '../src/renderer';
import { freedCompilesSkipped } from '../src/freedAttachments';

beforeEach(() => { seen.compiles = 0; seen.disposed = false; seen.afterDispose = 0; seen.release = []; seen.pipelines = 0; });

/** Six draws of six kinds: more jobs than the queue's lanes, so most wait behind the first. */
function body(): Group {
  const g = new Group();
  for (let i = 0; i < 6; i++) g.add(new Mesh(i % 2 ? new BoxGeometry() : new SphereGeometry(), new MeshBasicMaterial({ color: i })));
  return g;
}

describe('WEBGPU-DEPTHFMT: `createRenderer` installs the freed-attachment skip on its WebGPU backend', () => {
  it('a compile\'s pipeline for a freed target reaches no backend; the skip is counted', async () => {
    const v = await createRenderer({} as HTMLCanvasElement);
    const before = freedCompilesSkipped();
    const backend = v.renderer.backend as unknown as { createRenderPipeline(o: unknown, p: unknown[] | null): unknown };
    backend.createRenderPipeline({ context: { textures: [{}], depth: true, depthTexture: {} } }, []);
    expect(seen.pipelines).toBe(0);
    expect(freedCompilesSkipped() - before).toBe(1);
    await v.renderer.dispose();
  });
});

describe('WEBGPU-DEPTHFMT: `prepare`\'s waiting jobs start no compile once the renderer is disposed', () => {
  it('the jobs in flight at the teardown settle; none queued behind them is compiled', async () => {
    const v = await createRenderer({} as HTMLCanvasElement);
    v.resize(1280, 720);
    const scene = new Scene(), camera = new PerspectiveCamera();
    const parts: Object3D = body();
    scene.add(parts);
    const done = v.prepare([parts], scene, camera);
    const started = seen.compiles;
    expect(started, 'the queue runs only its lanes at once').toBeGreaterThan(0);
    expect(started).toBeLessThan(6);
    await v.renderer.dispose();                                         // the match's teardown (play.stop)
    // Release everything, including whatever a waiting job would still start.
    for (let i = 0; i < 20 && seen.release.length > 0; i++) {
      const pending = seen.release.splice(0);
      for (const r of pending) r();
      await new Promise((r) => setTimeout(r, 0));
    }
    await done;
    expect(seen.afterDispose, 'compiles started after the dispose').toBe(0);
  });

  it('before a dispose the queue compiles every job, as before', async () => {
    const v = await createRenderer({} as HTMLCanvasElement);
    v.resize(1280, 720);
    const scene = new Scene(), camera = new PerspectiveCamera();
    const parts = body();
    scene.add(parts);
    const done = v.prepare([parts], scene, camera);
    for (let i = 0; i < 40 && (seen.release.length > 0 || seen.compiles < 6); i++) {
      const pending = seen.release.splice(0);
      for (const r of pending) r();
      await new Promise((r) => setTimeout(r, 0));
    }
    await done;
    expect(seen.compiles).toBeGreaterThanOrEqual(6);                   // the canvas's six (the glow twin's on the tail beside)
    await v.renderer.dispose();
  });
});
