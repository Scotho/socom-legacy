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
 * - `prepare`'s world draws in the native picture are compiled under the glow's render context as well as the canvas's
 *   (FLASH-GLOW-BODIES, 2026-11-08: the owner's "1-2s full freeze on full lobbies" at a flashbang, live v0.4.14). A body,
 *   its weapon, its tag, a tracer appear after the map's warm, so a first flash in a full lobby built every one of their
 *   render objects under the glow context inside one frame -- a cost that scales with the lobby, which the solo d3d11
 *   profile that dropped 82de41e83's twin (6 pipelines either way, 2026-11-07) could not see. The compiles go under one
 *   1 x 1 twin of the glow target kept for the renderer's life, each its own queue job behind the canvas's;
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
  /** The context keys each mesh has a render object for, and each object a draw had to build. */
  built: new WeakMap<object, Set<string | null>>(),
  builds: [] as { mesh: Object3D; key: string | null }[],
  /** Held compiles: none settle until released, the most in flight at once counted. */
  hold: false, pending: 0, maxPending: 0, release: [] as (() => void)[],
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
    setDrawingBufferSize(w: number, h: number, r: number) { this.setPixelRatio(r); this.setSize(w, h); }
    getRenderTarget() { return this.target; } setRenderTarget(t: RenderTarget | null) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(Math.floor(this.width * this.ratio), Math.floor(this.height * this.ratio)); }
    initRenderTarget(t: RenderTarget) { seen.inits.push({ target: t, width: t.width, height: t.height }); }
    // A draw meeting a mesh with no render object for the target's context builds one there (three r186
    // `RenderObjects.get`, keyed on the render context): counted per context key.
    render(scene: Object3D) {
      seen.draws.push({ scene, target: this.target });
      const key = contextKey(this.target);
      scene.traverseVisible((m) => { if ((m as Mesh).isMesh && !seen.built.get(m)?.has(key)) seen.builds.push({ mesh: m, key }); });
    }
    compileAsync(scene: Object3D) {
      const key = contextKey(this.target);
      seen.compiles.push({ scene, key, target: this.target });
      scene.traverseVisible((m) => { if ((m as Mesh).isMesh) { const k = seen.built.get(m) ?? new Set<string | null>(); k.add(key); seen.built.set(m, k); } });
      if (!seen.hold) return Promise.resolve();
      seen.pending++; seen.maxPending = Math.max(seen.maxPending, seen.pending);
      return new Promise<void>((resolve) => { seen.release.push(() => { seen.pending--; resolve(); }); });
    }
    async dispose() {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});
import { createRenderer } from '../src/renderer';
import { glowHeld } from '../src/glowHold';
import { readFileSync } from 'node:fs';

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

beforeEach(() => {
  seen.webgpu = false; seen.compiles = []; seen.draws = []; seen.inits = [];
  seen.built = new WeakMap(); seen.builds = []; seen.hold = false; seen.pending = 0; seen.maxPending = 0; seen.release = [];
});
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

describe('FLASH-GLOW-BODIES: `prepare` compiles a world draw under the glow context too, so a full lobby\'s first flash builds nothing', () => {
  /** A body joining after the warm: a group with a mesh, prepared (parked) and then put in the scene, as `main.ts` does. */
  const joined = async (v: Viewer, scene: Scene, camera: PerspectiveCamera): Promise<Mesh> => {
    const body = new Group(), part = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    body.add(part);
    await v.prepare([body], scene, camera);
    scene.add(body);
    return part;
  };

  it.each([false, true])('native (WebGPU %s): a body prepared after the warm has its render object for the glow context before the first flash', async (webgpu) => {
    seen.webgpu = webgpu;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    seen.compiles = [];
    const part = await joined(v, scene, camera);
    seen.builds = [];
    const glowKey = contextKey(flashFrame(v, scene, camera));
    expect(seen.builds.filter((b) => b.mesh === part && b.key === glowKey).length, 'render objects the late body built at the first glowing frame').toBe(0);
    expect(seen.compiles.filter((c) => c.scene === part).map((c) => c.key)).toEqual([null, glowKey]);   // the canvas's first
    await v.renderer.dispose();
  });

  it('one 1 x 1 twin for the warm and every prepare, kept through the match, freed with the renderer', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    await joined(v, scene, camera);
    await joined(v, scene, camera);
    const twins = new Set(seen.compiles.filter((c) => c.target?.samples === 4 && c.target.depthBuffer).map((c) => c.target!));   // the glow's attachments
    expect(twins.size).toBe(1);
    const twin = [...twins][0]!;
    expect([twin.width, twin.height]).toEqual([1, 1]);
    const freed: RenderTarget[] = [];
    twin.addEventListener('dispose', () => { freed.push(twin); });
    await Promise.resolve();
    expect(freed).toEqual([]);                                         // not after its compiles: the match keeps it
    await v.renderer.dispose();
    expect(freed).toEqual([twin]);
  });

  it('the PS2 picture, the HUD\'s passes and a target of their own: never compiled under the glow context', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    const shadow = new RenderTarget(8, 8, { samples: 0, depthBuffer: true });
    await v.warm(scene, camera);
    const glowKey = contextKey(flashFrame(v, scene, camera));
    v.setGlow({ passes: 0, fix: 0 });
    const part = (): Mesh => new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    const hud = part(), shadowed = part(), ps2 = part();
    seen.compiles = [];
    await v.prepare([hud], scene, camera, { screen: true });
    await v.prepare([shadowed], scene, camera, { target: shadow });
    v.setPresentation('ps2');
    await v.prepare([ps2], scene, camera);
    expect(seen.compiles.filter((c) => c.key === glowKey)).toEqual([]);
    await v.renderer.dispose();
  });

  /** Releases held compiles until none is left (and none starts), the queue drained. */
  const drain = async (): Promise<void> => {
    for (let n = 0; n < 200; n++) {
      const r = seen.release.splice(0);
      for (const f of r) f();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (r.length === 0 && seen.release.length === 0) return;
    }
  };
  /** A body of `n` parts, each its own kind (none deduplicated). */
  const bodyOf = (name: string, n: number): Group => {
    const g = new Group();
    for (let i = 0; i < n; i++) { const m = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()); m.material.name = `${name}${i} x.tif`; g.add(m); }
    return g;
  };

  it('review F1: the glow compiles are the queue\'s tail -- a later call\'s canvas compiles run before an earlier call\'s glow ones', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    const first = bodyOf('a', 2), second = bodyOf('b', 2);            // two parts each: the 2 lanes full with canvas jobs
    void v.prepare([first], scene, camera);
    void v.prepare([second], scene, camera);
    await drain();
    const at = (o: Object3D, glow: boolean): number => seen.compiles.findIndex((c) => c.scene === o && (c.key !== null) === glow);
    const secondCanvas = Math.max(...second.children.map((p) => at(p, false)));
    const firstGlow = Math.min(...first.children.map((p) => at(p, true)));
    expect(firstGlow).toBeGreaterThan(-1);
    expect(secondCanvas, 'the second call\'s last canvas compile before the first call\'s first glow compile').toBeLessThan(firstGlow);
    await v.renderer.dispose();
  });

  it('review F1, warmWalk\'s order: the body, then its shadow map and the HUD -- their canvas compiles before the body\'s glow ones', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    const shadow = new RenderTarget(8, 8, { samples: 0, depthBuffer: true });
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    const body = bodyOf('body', 3), cast = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()), hud = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    void v.prepare([body], scene, camera);
    void v.prepare([cast], scene, camera, { target: shadow });
    void v.prepare([hud], scene, camera, { screen: true });
    await drain();
    const firstGlow = seen.compiles.findIndex((c) => c.key !== null && body.children.includes(c.scene));
    expect(firstGlow).toBeGreaterThan(-1);
    for (const o of [cast, hud]) expect(seen.compiles.findIndex((c) => c.scene === o)).toBeLessThan(firstGlow);
    await v.renderer.dispose();
  });

  it('review F2: a body prepared in the PS2 picture is glow-compiled when the picture goes native', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);                                       // native: glowOwed spent
    v.setPresentation('ps2');
    const part = await joined(v, scene, camera);                       // joins in PS2: its glow compile skipped
    seen.compiles = [];
    v.setPresentation('native');
    await drain();
    seen.builds = [];
    const glowKey = contextKey(flashFrame(v, scene, camera));
    expect(seen.compiles.filter((c) => c.scene === part && c.key === glowKey), 'the PS2-joined body compiled under the glow context at the switch').toHaveLength(1);
    expect(seen.builds.filter((b) => b.mesh === part).length).toBe(0);
    v.setGlow({ passes: 0, fix: 0 });
    seen.compiles = [];
    v.setPresentation('ps2'); v.setPresentation('native');            // owed once: not again
    await drain();
    expect(seen.compiles.filter((c) => c.scene === part)).toEqual([]);
    await v.renderer.dispose();
  });

  it("fold F1: a replaced body's skipped glow jobs are dropped in the PS2 picture, not held for the map's life", async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    v.setPresentation('ps2');
    let goneA = false;
    const a = new Group(); a.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial()));
    await v.prepare([a], scene, camera, { stale: () => goneA });
    expect(v.glowOwed?.()).toBe(1);
    goneA = true;                                                      // body A replaced (a rebuild, a kit change)
    const b = new Group(); b.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial()));
    await v.prepare([b], scene, camera, { stale: () => false });
    expect(v.glowOwed?.(), "A's stale job pruned at the next push; B's kept").toBe(1);
    let goneC = true;
    const c = new Group(); c.add(new Mesh(new PlaneGeometry(), new MeshBasicMaterial()));
    await v.prepare([c], scene, camera, { stale: () => goneC });   // already stale when pushed: never kept
    expect(v.glowOwed?.()).toBe(1);
    goneC = false;
    await v.renderer.dispose();
  });

  // WM-17 (the main controller's ruling (a'), 2026-11-15): NOT CLOSED, held as a known failure -- a body that joins with
  // no flashbang in the air (or after the throw, its compile unfinished when the flash lands) is still built by the
  // flash's own frame; `promoteGlow` shortens the window to the fuse, it cannot close it for a flash at the join. The
  // bench's d3d11 baseline says whether that costs a visible stall (a LATER row with the measured stall if it does).
  it.fails('WM-17 (LATER 772): a body joining in a wave, the wave\'s glow jobs ahead of its own, builds nothing in the next flash\'s frame', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    // A join wave: B (four parts) is prepared first, then A. The queue runs every canvas compile before any glow one
    // (the tail), so A is in the scene once its canvas compile is done while B's four glow compiles still lead the tail.
    const b = bodyOf('b', 4), a = bodyOf('a', 1);
    void v.prepare([b], scene, camera).then(() => { scene.add(b); });
    let joinedA = false;
    void v.prepare([a], scene, camera).then(() => { joinedA = true; scene.add(a); });   // `main.ts`: in the scene once prepared
    const aCanvas = (): boolean => seen.compiles.some((c) => c.scene === a.children[0] && c.key === null);
    // Release the held compiles one at a time, oldest first, until A's canvas compile has been released.
    for (let n = 0; n < 50 && !joinedA; n++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const asked = aCanvas();
      const r = seen.release.shift();
      r?.();
      if (asked && seen.compiles.findIndex((c) => c.scene === a.children[0] && c.key === null) >= 0 && !r) break;
    }
    for (let n = 0; n < 20 && !joinedA; n++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(joinedA, 'A prepared (its canvas compile) and in the scene').toBe(true);
    // The window: A's glow job waits behind the wave's earlier glow jobs (held), so it has not been asked.
    const glowAsked = seen.compiles.filter((c) => c.scene === a.children[0] && c.key !== null).length;
    expect(glowAsked, 'A\'s glow compile not asked before the flash (the window exists)').toBe(0);
    seen.builds = [];
    const glowKey = contextKey(flashFrame(v, scene, camera));          // a flash lands now
    expect(seen.builds.filter((x) => x.mesh === a.children[0] && x.key === glowKey).length,
      'render objects the joined body built under the glow context in the flash\'s frame').toBe(0);
    for (let n = 0; n < 50 && seen.release.length > 0; n++) { for (const f of seen.release.splice(0)) f(); await new Promise((resolve) => setTimeout(resolve, 0)); }
    await v.renderer.dispose();
  });

  it('WM-17 (a\'): a flashbang thrown over a join wave -- `promoteGlow` brings the drawn bodies\' glow jobs first, so the flash after the fuse builds nothing', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    // The wave: B (four parts), then A; and C, a fifth body still being prepared (parked, not in the scene).
    const b = bodyOf('b', 4), a = bodyOf('a', 1), c = bodyOf('c', 2);
    let joinedA = false;
    void v.prepare([b], scene, camera).then(() => { scene.add(b); });
    void v.prepare([a], scene, camera).then(() => { joinedA = true; scene.add(a); });
    for (let n = 0; n < 50 && !joinedA; n++) {               // release oldest first until A is in the scene
      await new Promise((resolve) => setTimeout(resolve, 0));
      seen.release.shift()?.();
    }
    for (let n = 0; n < 20 && !joinedA; n++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(joinedA).toBe(true);
    void v.prepare([c], scene, camera);                      // C's canvas jobs queued; C not in the scene yet
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.compiles.filter((x) => x.scene === a.children[0] && x.key !== null), 'the window: A\'s glow not asked').toHaveLength(0);
    // The throw: every glow job whose draw is in the scene goes to the head of the ordinary queue -- A's ahead of C's
    // canvas jobs; C's own glow jobs (C parked) are not promoted.
    expect(v.promoteGlow!()).toBeGreaterThan(0);
    // The fuse: the held compiles run out one at a time, oldest first, as lanes free.
    for (let n = 0; n < 200 && seen.release.length > 0; n++) {
      for (const f of seen.release.splice(0)) f();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const at = (o: Object3D, glow: boolean): number => seen.compiles.findIndex((x) => x.scene === o && (x.key !== null) === glow);
    expect(at(a.children[0]!, true), 'A\'s glow compile before C\'s canvas compiles').toBeLessThan(Math.max(...c.children.map((p) => at(p, false))));
    for (const p of c.children) expect(at(p, true), 'C (parked at the throw) not promoted: its glow after its own canvas').toBeGreaterThan(at(p, false));
    seen.builds = [];
    const glowKey = contextKey(flashFrame(v, scene, camera));          // the flash lands after the fuse
    expect(seen.builds.filter((x) => x.mesh === a.children[0] && x.key === glowKey).length,
      'render objects the joined body built under the glow context in the flash\'s frame').toBe(0);
    await v.renderer.dispose();
  });

  it('WM-17 (a\'), the batch review\'s F1: a body put in the scene before its canvas compiles are done (a remote spawn) is not promoted ahead of them', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    const b = bodyOf('b', 2), r = bodyOf('r', 2);
    scene.add(b);
    void v.prepare([b], scene, camera);                      // B's two canvas compiles fill the two lanes
    scene.add(r);                                            // `RemotePlayers`: the body in the scene at its spawn ...
    void v.prepare([r], scene, camera);                      // ... and prepared after, not awaited
    await new Promise((resolve) => setTimeout(resolve, 0));
    v.promoteGlow!();                                        // a flashbang in the air now: R's canvas compiles still wait
    for (let n = 0; n < 200 && seen.release.length > 0; n++) {
      for (const f of seen.release.splice(0)) f();
      await new Promise((resolve) => setTimeout(resolve, 0));
      v.promoteGlow!();                                      // called every frame while it flies
    }
    const at = (o: Object3D, glow: boolean): number => seen.compiles.findIndex((x) => x.scene === o && (x.key !== null) === glow);
    for (const p of r.children) expect(at(p, true), 'R\'s glow compile after its own canvas compile').toBeGreaterThan(Math.max(...r.children.map((q) => at(q, false))));
    await v.renderer.dispose();
  });

  it('WM-17 (a\'): with no flashbang in the air the queue keeps the review-F1 order (`promoteGlow` never called: canvas first)', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    const first = bodyOf('a', 2), second = bodyOf('b', 2);
    void v.prepare([first], scene, camera).then(() => { scene.add(first); });
    void v.prepare([second], scene, camera);
    await drain();
    const at = (o: Object3D, glow: boolean): number => seen.compiles.findIndex((x) => x.scene === o && (x.key !== null) === glow);
    expect(Math.max(...second.children.map((p) => at(p, false)))).toBeLessThan(Math.min(...first.children.map((p) => at(p, true))));
    await v.renderer.dispose();
  });

  it('a wave of 16 bodies keeps `prepare`\'s cap: at most PREPARE_LANES (2) compiles in flight, the glow\'s included', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    await v.warm(scene, camera);
    seen.compiles = [];
    seen.hold = true;
    const bodies = Array.from({ length: 16 }, (_, i) => {
      const g = new Group(), m = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
      m.material.name = `body${i} x.tif`;                              // sixteen kinds: none deduplicated
      g.add(m);
      return g;
    });
    const done = v.prepare(bodies, scene, camera);
    let settled = false;
    void done.then(() => { settled = true; });
    let glowAtSettle = -1;
    for (let n = 0; n < 200 && (seen.release.length > 0 || !settled); n++) {
      if (settled && glowAtSettle < 0) glowAtSettle = seen.compiles.filter((c) => c.key !== null).length;
      for (const f of seen.release.splice(0)) f();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(settled).toBe(true);
    expect(glowAtSettle, 'glow compiles begun when the call resolved: it waits on its canvas jobs only').toBeLessThan(16);
    expect(seen.maxPending).toBeLessThanOrEqual(2);
    expect(seen.compiles.filter((c) => c.key !== null)).toHaveLength(16);   // each body under the glow context, once
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

describe('LATER 938: on the Xbox class the glow twin\u2019s prepare compiles wait for a flash or an idle point (`holdGlow`)', () => {
  const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
  const joined = async (v: Viewer, scene: Scene, camera: PerspectiveCamera): Promise<Mesh> => {
    const body = new Group(), part = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    body.add(part);
    await v.prepare([body], scene, camera);
    scene.add(body);
    return part;
  };

  it('held: a body prepared in play gets its canvas compile and NO glow compile; it is owed', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    v.holdGlow!(true);
    seen.compiles = [];
    const part = await joined(v, scene, camera);
    await settle();
    expect(seen.compiles.filter((c) => c.scene === part).map((c) => c.key), 'the canvas only').toEqual([null]);
    expect(v.glowOwed?.()).toBe(1);
    await v.renderer.dispose();
  });

  it('released (a flash or an idle point): the held glow jobs compile, once', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    v.holdGlow!(true);
    const part = await joined(v, scene, camera);
    await settle();
    seen.compiles = [];
    v.holdGlow!(false);
    await settle();
    const glow = seen.compiles.filter((c) => c.scene === part && c.key !== null);
    expect(glow, 'the held glow compile, at the release').toHaveLength(1);
    expect(v.glowOwed?.()).toBe(0);
    seen.compiles = [];
    v.holdGlow!(true); v.holdGlow!(false);                             // released once: nothing owed twice
    await settle();
    expect(seen.compiles.filter((c) => c.scene === part)).toEqual([]);
    await v.renderer.dispose();
  });

  it('a glow job queued before the hold and reached while held is kept, not compiled', async () => {
    seen.hold = true;
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    const warmed = v.warm(scene, camera);
    for (let i = 0; i < 50 && seen.release.length === 0; i++) await new Promise((r) => setTimeout(r, 0));
    for (const f of seen.release.splice(0)) f();
    await warmed;
    // Two parts of two kinds: two canvas compiles fill `prepare`'s two lanes, so the glow jobs wait on the tail.
    const body = new Group(), part = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()), other = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    part.material.name = 'a x.tif'; other.material.name = 'b x.tif';
    body.add(part, other);
    const canvas = v.prepare([body], scene, camera);                    // both lanes busy, the glow jobs queued
    scene.add(body);
    v.holdGlow!(true);                                                  // the hold comes before the glow job runs
    seen.hold = false;
    for (let n = 0; n < 50; n++) { for (const f of seen.release.splice(0)) f(); await new Promise((r) => setTimeout(r, 0)); }
    await canvas;
    await settle();
    expect(seen.compiles.filter((c) => (c.scene === part || c.scene === other) && c.key !== null), 'no glow compile while held').toEqual([]);
    expect(seen.compiles.filter((c) => c.scene === part || c.scene === other).map((c) => c.key), 'the two canvas compiles ran').toEqual([null, null]);
    expect(v.glowOwed?.()).toBe(2);
    await v.renderer.dispose();
  });

  it('review F1: a held job released while its own canvas compiles still wait is not promoted ahead of them (WM-17 F1 kept)', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = world(), camera = new PerspectiveCamera();
    v.resize(1280, 720);
    await v.warm(scene, camera);
    seen.hold = true;
    v.holdGlow!(true);
    // Three parts of three kinds: two canvas compiles in flight (the two lanes), the third waiting; the glow jobs kept.
    const body = new Group();
    const parts = ['a', 'b', 'c'].map((n) => { const m = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()); m.material.name = `${n} x.tif`; body.add(m); return m; });
    const canvas = v.prepare([body], scene, camera);
    scene.add(body);                                                    // a remote body is in the scene before its compiles end
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    v.holdGlow!(false);                                                 // a flashbang in the air: released ...
    expect(v.promoteGlow?.(), '... and not promoted while its own canvas compile waits').toBe(0);
    seen.hold = false;
    for (let n = 0; n < 50; n++) { for (const f of seen.release.splice(0)) f(); await new Promise((r) => setTimeout(r, 0)); }
    await canvas;
    await settle();
    const order = seen.compiles.filter((c) => parts.some((m) => m === c.scene)).map((c) => c.key === null ? 'canvas' : 'glow');
    expect(order.slice(0, 3), 'every canvas compile before any glow one').toEqual(['canvas', 'canvas', 'canvas']);
    expect(order.filter((k) => k === 'glow')).toHaveLength(3);
    await v.renderer.dispose();
  });

});
