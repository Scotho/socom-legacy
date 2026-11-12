import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinearSRGBColorSpace, Mesh, PerspectiveCamera, type BufferGeometry, type Color, type Material, type Object3D, type RenderTarget, Scene, type Texture } from 'three';
import { createHash } from 'node:crypto';
import { ENGINE_CONTRACT_VERSION, ENGINE_CONTRACT_VERSIONS, EXTENSION_CODES, PACK_MANIFEST_FILE, PACK_TARGET_US, validatePack, type Diagnostic, type PackHandlerClaim, type PackRef } from '@s2u/creator-contracts';

/**
 * A stand-in for three's WebGPURenderer: every draw recorded, and `info.memory` kept as three keeps it -- a geometry, a
 * material or a texture counted the first time a draw meets it, uncounted at its `dispose` event.
 */
const seen = vi.hoisted(() => ({
  draws: [] as { scene: unknown; target: RenderTarget | null; autoClear: boolean }[],
  memory: { geometries: 0, materials: 0, textures: 0 },
}));
vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  const counted = new WeakSet<object>();
  const count = (thing: { addEventListener(type: 'dispose', fn: () => void): void }, kind: 'geometries' | 'materials' | 'textures'): void => {
    if (counted.has(thing)) return;
    counted.add(thing);
    seen.memory[kind]++;
    const off = (): void => { seen.memory[kind]--; counted.delete(thing); (thing as unknown as { removeEventListener(t: string, f: () => void): void }).removeEventListener('dispose', off); };
    thing.addEventListener('dispose', off);
  };
  class FakeRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: RenderTarget | null = null;
    backend = { isWebGLBackend: true, createRenderPipeline() {} };
    info = { memory: seen.memory };
    async init() {}
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    getRenderTarget() { return this.target; }
    setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(640, 360); }
    render(scene: Object3D) {
      seen.draws.push({ scene, target: this.target, autoClear: this.autoClear });
      scene.traverse((o) => {
        const m = o as Object3D & { geometry?: BufferGeometry; material?: Material };
        if (!o.visible) return;
        if (m.geometry) count(m.geometry, 'geometries');
        if (m.material) {
          count(m.material, 'materials');
          const map = (m.material as Material & { map?: Texture | null }).map;
          if (map) count(map, 'textures');
        }
      });
    }
    async compileAsync() {}
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer, type ViewerRenderer } from '../../src/renderer';
import { visualPostSeams } from '../../src/visualPostSeam';
import { createExtensionHost, systemForClaim } from '../../src/packs/systems/host';
import { VISUAL_TINT_CODES, VISUAL_TINT_PASS, checkVisualTintOptions, visualTintHandler } from '../../src/packs/systems/visualTint';

const PACK: PackRef = { id: 'tint.pack', version: '1.0.0', hash: 'a'.repeat(64) };
const CLAIM = { slot: 'visual.post', handler: visualTintHandler.id };
const codes = (d: readonly Diagnostic[] | undefined): string[] => (d ?? []).map((x) => x.code);

/** The page's composition: the host over the renderer's seam, the tint offered, a pack's claim registered. */
async function compose(options: unknown = { colour: 'ff8000', strength: 0.25 }) {
  const v = await createRenderer({} as HTMLCanvasElement);
  const host = createExtensionHost({ seams: visualPostSeams(v), handlers: [visualTintHandler] });
  const factory = visualTintHandler.system(options);
  if (Array.isArray(factory)) throw new Error(`refused: ${codes(factory).join()}`);
  const reg = host.register(PACK, CLAIM, factory);
  if (Array.isArray(reg)) throw new Error(`refused: ${codes(reg).join()}`);
  return { v, host, id: reg.id };
}
const frame = (v: ViewerRenderer, scene: Scene, camera: PerspectiveCamera): typeof seen.draws => {
  seen.draws = [];
  v.render(scene, camera);
  return seen.draws;
};
/** The pass's own draw: its scene, its one mesh, its material and geometry. */
const passDraw = (draws: typeof seen.draws, world: Scene) => draws.filter((d) => d.scene !== world);

describe('the visual tint (FCW-07b-2): an engine handler on visual.post, claimed by name', () => {
  beforeEach(() => { seen.draws = []; seen.memory.geometries = 0; seen.memory.materials = 0; seen.memory.textures = 0; });

  it('(a) draws the baseline list when the tint is not installed (registered only, or not offered at all)', async () => {
    const world = new Scene(), camera = new PerspectiveCamera();
    const bare = await createRenderer({} as HTMLCanvasElement);
    const baseline = frame(bare, world, camera);
    expect(baseline).toEqual([{ scene: world, target: null, autoClear: true }]);
    const { v } = await compose();
    expect(frame(v, world, camera)).toEqual(baseline);
  });

  it('(b) draws exactly one post pass a frame when enabled, with the pass\'s own objects and the claimed colour and strength', async () => {
    const world = new Scene(), camera = new PerspectiveCamera();
    const { v, host, id } = await compose({ colour: '#3366cc', strength: 0.5 });
    expect((await host.enable(id)).ok).toBe(true);
    for (let i = 0; i < 2; i++) {
      const draws = frame(v, world, camera);
      expect(draws).toHaveLength(2);
      expect(draws[0]).toEqual({ scene: world, target: null, autoClear: true });
      const post = passDraw(draws, world);
      expect(post).toHaveLength(1);
      expect(post[0]).toMatchObject({ target: null, autoClear: false });
      const scene = post[0]!.scene as Scene;
      expect(scene).not.toBe(world);
      expect(scene.children).toHaveLength(1);
      const mesh = scene.children[0] as Mesh;
      expect(mesh).toBeInstanceOf(Mesh);
      expect(mesh.visible).toBe(true);
      const material = mesh.material as Material & { color: Color; opacity: number };
      expect(material.color.getHexString(LinearSRGBColorSpace)).toBe('3366cc');   // written as given: the output is linear
      expect(material.opacity).toBe(0.5);
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
    }
    expect(host.status()[0]!.state).toBe('enabled');
  });

  it('(c) draws nothing more when disabled', async () => {
    const world = new Scene(), camera = new PerspectiveCamera();
    const { v, host, id } = await compose();
    await host.enable(id);
    expect(frame(v, world, camera)).toHaveLength(2);
    expect((await host.disable(id)).status?.state).toBe('disabled');
    expect(frame(v, world, camera)).toEqual([{ scene: world, target: null, autoClear: true }]);
  });

  it('(d) releases every three.js resource it made on dispose: the memory counts back to the baseline', async () => {
    const world = new Scene(), camera = new PerspectiveCamera();
    const { v, host, id } = await compose();
    frame(v, world, camera);
    const baseline = { ...seen.memory };
    await host.enable(id);
    frame(v, world, camera);
    expect(seen.memory.geometries).toBe(baseline.geometries + 1);
    expect(seen.memory.materials).toBe(baseline.materials + 1);
    expect(seen.memory.textures).toBe(baseline.textures);
    expect((await host.dispose(id)).status?.state).toBe('disposed');
    expect(seen.memory).toEqual(baseline);
    expect(frame(v, world, camera)).toEqual([{ scene: world, target: null, autoClear: true }]);
    // Disposed after a disable, and torn down with the host, the same.
    await host.enable(id);
    frame(v, world, camera);
    await host.disable(id);
    await host.dispose(id);
    expect(seen.memory).toEqual(baseline);
    await host.enable(id);
    frame(v, world, camera);
    host.dispose();
    expect(seen.memory).toEqual(baseline);
    expect(frame(v, world, camera)).toEqual([{ scene: world, target: null, autoClear: true }]);
  });

  it('(e) draws again on a second enable after a disable (B2-1 through a real handler)', async () => {
    const world = new Scene(), camera = new PerspectiveCamera();
    const { v, host, id } = await compose();
    await host.enable(id);
    const first = passDraw(frame(v, world, camera), world);
    await host.disable(id);
    expect(passDraw(frame(v, world, camera), world)).toEqual([]);
    expect((await host.enable(id)).ok).toBe(true);
    const again = passDraw(frame(v, world, camera), world);
    expect(again).toHaveLength(1);
    expect(again[0]!.scene).toBe(first[0]!.scene);   // the same instance's pass, its resources kept across the disable
    expect(seen.memory.geometries).toBe(1);
    expect(seen.memory.materials).toBe(1);
  });

  it('(f) refuses a bad option by a named code, never a throw, and builds nothing', () => {
    const bad = [
      undefined, null, 'ff8000', { colour: 'ff8000' }, { strength: 0.5 },
      { colour: 'ff800', strength: 0.5 }, { colour: '#ff80001', strength: 0.5 }, { colour: 'red', strength: 0.5 }, { colour: 0xff8000, strength: 0.5 },
      { colour: 'ff8000', strength: -0.01 }, { colour: 'ff8000', strength: 1.01 }, { colour: 'ff8000', strength: Number.NaN }, { colour: 'ff8000', strength: '0.5' },
      { colour: 'ff8000', strength: 0.5, blend: 'add' },
    ];
    for (const options of bad) {
      let out: ReturnType<typeof visualTintHandler.system> | undefined;
      expect(() => { out = visualTintHandler.system(options); }).not.toThrow();
      expect(Array.isArray(out)).toBe(true);
      const d = out as Diagnostic[];
      expect(d.length).toBeGreaterThan(0);
      expect(d.every((x) => x.code === VISUAL_TINT_CODES.option && x.severity === 'error' && x.source === 'pack')).toBe(true);
    }
    expect(VISUAL_TINT_CODES).toStrictEqual({ option: 'visual.TINT_OPTION' });
    expect(Object.values(EXTENSION_CODES)).not.toContain(VISUAL_TINT_CODES.option);
    const strength = checkVisualTintOptions({ colour: 'ff8000', strength: 2 }) as Diagnostic[];
    expect(strength).toMatchObject([{ field: 'strength', expected: 'a number from 0 to 1', actual: '2' }]);
    expect(checkVisualTintOptions({ colour: '#FF8000', strength: 0 })).toEqual({ colour: 'ff8000', strength: 0 });
    expect(checkVisualTintOptions({ colour: '00ff00', strength: 1 })).toEqual({ colour: '00ff00', strength: 1 });
  });

  it('is offered under its own name on visual.post, and its pass is named for it', async () => {
    expect({ id: visualTintHandler.id, slot: visualTintHandler.slot }).toStrictEqual({ id: 'visual.post.tint', slot: 'visual.post' });
    const { host } = await compose();
    expect(host.catalogue().handlers).toEqual([{ id: 'visual.post.tint', slot: 'visual.post', actions: ['install', 'enable', 'disable', 'dispose'], exclusive: true }]);
    expect(VISUAL_TINT_PASS).toBe('visual.post.tint');
  });
});

describe("the tint's options come from the pack's claim (LATER 458)", () => {
  beforeEach(() => { seen.draws = []; seen.memory.geometries = 0; seen.memory.materials = 0; seen.memory.textures = 0; });
  /** The application's own defaults (this test's): the tint's options when a claim carries none. */
  const DEFAULTS = Object.freeze({ colour: '00ff00', strength: 0.75 });

  /** The page's composition for a claim: the host, the tint offered, its system from the claim; enabled and drawn once. */
  type Drawn = { refused?: Diagnostic[]; colour?: string; strength?: number; host: ReturnType<typeof createExtensionHost> };
  async function drawnFor(claim: PackHandlerClaim, defaults?: unknown): Promise<Drawn> {
    const v = await createRenderer({} as HTMLCanvasElement);
    const host = createExtensionHost({ seams: visualPostSeams(v), handlers: [visualTintHandler] });
    const factory = systemForClaim(visualTintHandler, claim, defaults);
    if (Array.isArray(factory)) return { refused: factory as Diagnostic[], host };
    const reg = host.register(PACK, claim, factory);
    if (Array.isArray(reg)) throw new Error(`refused: ${codes(reg).join()}`);
    expect((await host.enable(reg.id)).ok).toBe(true);
    const world = new Scene();
    const post = passDraw(frame(v, world, new PerspectiveCamera()), world);
    expect(post).toHaveLength(1);
    const material = ((post[0]!.scene as Scene).children[0] as Mesh).material as Material & { color: Color; opacity: number };
    return { colour: material.color.getHexString(LinearSRGBColorSpace), strength: material.opacity, host };
  }

  it("a pack claiming visual.post with {colour: '#ff0000', strength: 0.5} registers, and the system draws with those", async () => {
    const out = await drawnFor({ ...CLAIM, options: { colour: '#ff0000', strength: 0.5 } }, DEFAULTS);
    expect(out).toMatchObject({ colour: 'ff0000', strength: 0.5 });
  });

  it("a claim without options gets the application's defaults", async () => {
    expect(await drawnFor(CLAIM, DEFAULTS)).toMatchObject({ colour: '00ff00', strength: 0.75 });
  });

  it("options the tint refuses stay a refusal (its diagnostics, no throw, nothing registered); the defaults never stand in", async () => {
    for (const options of [{ colour: 'red', strength: 0.5 }, { colour: '#ff0000', strength: 2 }, { colour: '#ff0000', strength: 0.5, blend: 'add' }, {}]) {
      let out: Drawn | undefined;
      await expect((async () => { out = await drawnFor({ ...CLAIM, options }, DEFAULTS); })()).resolves.toBeUndefined();
      expect(out!.refused, JSON.stringify(options)).toBeDefined();
      expect(out!.refused!.every((d) => d.code === VISUAL_TINT_CODES.option && d.severity === 'error')).toBe(true);
      expect(out!.host.status()).toEqual([]);
    }
    const none = await drawnFor(CLAIM);   // no options and no defaults: the tint refuses, as it refuses absent options
    expect(codes(none.refused)).toEqual([VISUAL_TINT_CODES.option]);
  });

  it("a claim as validatePack keeps it: the frozen options feed the tint unchanged", async () => {
    const bytes = new TextEncoder().encode('{}');
    const host = createExtensionHost({ seams: {}, handlers: [visualTintHandler] });
    const manifest = {
      format: 's2u-pack', formatVersion: 2, id: 'tint.pack', version: '1.0.0', name: 'Red tint', target: PACK_TARGET_US,
      contract: `^${ENGINE_CONTRACT_VERSION}`, kinds: ['system'], sides: 'client', dependencies: [],
      files: [{ path: 'systems/tint.json', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, role: 'system' }],
      intents: [{ kind: 'cosmetic', files: ['systems/tint.json'] }],
      handlers: [{ slot: 'visual.post', handler: 'visual.post.tint', options: { colour: '#ff0000', strength: 0.5 } }],
    };
    const v = await validatePack(
      [{ path: PACK_MANIFEST_FILE, bytes: new TextEncoder().encode(JSON.stringify(manifest)) }, { path: 'systems/tint.json', bytes }],
      { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, packs: [], archives: {}, handlers: host.catalogue().handlers, claimedSlots: {} },
    );
    if (!v.ok) throw new Error(v.report.diagnostics.map((d) => d.code).join());
    const claim = v.manifest.handlers![0]!;
    expect(Object.isFrozen(claim.options)).toBe(true);
    expect(await drawnFor(claim, DEFAULTS)).toMatchObject({ colour: 'ff0000', strength: 0.5 });
  });
});
