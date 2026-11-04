import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, RenderTarget, Scene } from 'three';
import type { PackRef } from '@s2u/creator-contracts';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';

const seen = vi.hoisted(() => ({ draws: [] as { scene: unknown; target: RenderTarget | null; autoClear: boolean }[] }));
vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: RenderTarget | null = null;
    backend = { isWebGLBackend: true, createRenderPipeline() {} };
    async init() {}
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    getRenderTarget() { return this.target; }
    setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(640, 360); }
    render(scene: unknown) { seen.draws.push({ scene, target: this.target, autoClear: this.autoClear }); }
    async compileAsync() {}
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer, type ViewerRenderer } from '../src/renderer';
import { createPostSlot, visualPostSeams } from '../src/visualPostSeam';
import { createExtensionHost, type SystemFactory } from '../src/packs/systems/host';

const PACK: PackRef = { id: 'tint.pack', version: '1.0.0', hash: 'a'.repeat(64) };
const CLAIM = { slot: 'visual.post', handler: 'visual.post.test' };
const HANDLERS = [{ id: 'visual.post.test', slot: 'visual.post' }];

/** A host over the renderer's seam, as the page composes it, with one test system whose pass is `pass`. */
async function hosted(v: ViewerRenderer, pass: { id: string; scene: Scene }) {
  const host = createExtensionHost({ seams: visualPostSeams(v), handlers: HANDLERS });
  const factory: SystemFactory = (seam) => {
    let off: (() => void) | null = null;
    return { install() {}, enable() { off = seam.install(pass); }, disable() { off?.(); off = null; }, dispose() { off?.(); off = null; } };
  };
  const reg = host.register(PACK, CLAIM, factory);
  if (Array.isArray(reg)) throw new Error('refused');
  return { host, id: reg.id };
}

describe('the visual post slot (the seam alone)', () => {
  it('holds one pass; uninstall restores the exact prior state, once, and a stale uninstall never removes a newer pass', () => {
    const slot = createPostSlot(() => ({ presentation: 'native' }));
    const before = slot.seam.snapshot();
    expect(before).toEqual({ presentation: 'native', post: null });
    const a = { id: 'a', scene: new Scene() };
    const offA = slot.seam.install(a);
    expect(slot.current()).toBe(a);
    expect(() => slot.seam.install({ id: 'b', scene: new Scene() })).toThrow();
    offA();
    expect(slot.seam.snapshot()).toEqual(before);
    const b = { id: 'b', scene: new Scene() };
    slot.seam.install(b);
    offA();
    expect(slot.current()).toBe(b);
  });
});

describe('the seam is reached only through the seam module and the host (B2-4)', () => {
  beforeEach(() => { seen.draws = []; });
  it('keeps no post property on the renderer, at the type and at run time', async () => {
    const v = await createRenderer({} as HTMLCanvasElement);
    expect('post' in v).toBe(false);
    // @ts-expect-error -- ViewerRenderer has no `post`: the raw seam is not a property any caller can install through.
    expect(v.post).toBeUndefined();
    await v.renderer.dispose();
  });
  it('hands the seam to one claimant: visualPostSeams once per renderer, the host then the only install path', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    const pass = { id: 'tint', scene: new Scene() };
    const { host, id } = await hosted(v, pass);
    expect(() => visualPostSeams(v)).toThrow(/already claimed/);
    expect(() => visualPostSeams({} as ViewerRenderer)).toThrow(/claimed no/);
    v.render(scene, camera);
    expect(seen.draws).toEqual([{ scene, target: null, autoClear: true }]);
    await host.enable(id);
    seen.draws = [];
    v.render(scene, camera);
    expect(seen.draws).toEqual([{ scene, target: null, autoClear: true }, { scene: pass.scene, target: null, autoClear: false }]);
    await v.renderer.dispose();
  });
});

describe('the renderer claims the visual post seam at the end of render (without a browser or GPU)', () => {
  beforeEach(() => { seen.draws = []; });
  it('draws nothing more with no pass installed: the ordinary frame is the same draw list', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    v.render(scene, camera);
    expect(seen.draws).toEqual([{ scene, target: null, autoClear: true }]);
    await v.renderer.dispose();
  });
  it('draws an installed pass last, over the canvas with autoClear off, then puts autoClear back', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    const pass = { id: 'tint', scene: new Scene() };
    const { host, id } = await hosted(v, pass);
    await host.enable(id);
    v.render(scene, camera);
    expect(seen.draws).toEqual([{ scene, target: null, autoClear: true }, { scene: pass.scene, target: null, autoClear: false }]);
    expect(v.renderer.autoClear).toBe(true);
    await host.disable(id);
    seen.draws = [];
    v.render(scene, camera);
    expect(seen.draws).toEqual([{ scene, target: null, autoClear: true }]);
    await v.renderer.dispose();
  });
  it('draws the pass after the PS2 copy and after the experimental picture, on the canvas', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    const pass = { id: 'tint', scene: new Scene() };
    const { host, id } = await hosted(v, pass);
    await host.enable(id);
    v.setPresentation('ps2');
    v.render(scene, camera);
    expect(seen.draws).toHaveLength(3);
    expect(seen.draws.at(-1)).toEqual({ scene: pass.scene, target: null, autoClear: false });
    v.setPresentation('native');
    v.setExperimental({ ...EXPERIMENTAL_DEFAULTS, enabled: true });
    seen.draws = [];
    v.render(scene, camera);
    expect(seen.draws.at(-1)).toEqual({ scene: pass.scene, target: null, autoClear: false });
    await v.renderer.dispose();
  });
  it('leaves the draw configuration deep-equal to before after install and uninstall, and the snapshot follows it', async () => {
    const v = await createRenderer({} as HTMLCanvasElement);
    const seam = visualPostSeams(v)['visual.post'];
    const before = seam.snapshot();
    const off = seam.install({ id: 'tint', scene: new Scene() });
    expect(seam.snapshot()).not.toEqual(before);
    v.render(new Scene(), new PerspectiveCamera());
    off();
    expect(seam.snapshot()).toEqual(before);
    v.setPresentation('ps2');
    expect(seam.snapshot()).not.toEqual(before);
    v.setPresentation('native');
    v.setGlow({ passes: 1, fix: 64 });
    expect(seam.snapshot()).not.toEqual(before);
    v.setGlow({ passes: 0, fix: 0 });
    expect(seam.snapshot()).toEqual(before);
    await v.renderer.dispose();
  });
});
