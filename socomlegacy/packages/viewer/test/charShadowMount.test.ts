import { describe, expect, it } from 'vitest';
import {
  Bone, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, Skeleton, SkinnedMesh,
  Uint16BufferAttribute, Vector2, type Camera, type ColorRepresentation, type Material, type Object3D, type RenderTarget } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { mountCharShadow, shadowDrawnBy, SHADOW_LAYER, SHADOW_MAP_SIZE, type ShadowRenderer } from '../src/charShadow';
import { shadowRendererOf, type MatchPrepareOptions, type MatchRenderer } from '../src/matchRenderer';
import type { ViewerRenderer } from '../src/renderer';

/**
 * PAR-6 (web sprint PARITY-1, audit A.6; research 255 s1): the characters' shadow (`./charShadow`, research 82 round 4)
 * mounted as `/testroom` mounts it -- the map's vector at the show, the warm-up, the per-frame update before the
 * world's render, and (the menu page's own) the teardown -- through one helper both pages call, on the renderer
 * contract's new home (`./matchRenderer`), widened by the render-target capability `CharacterShadow.update` draws through.
 */

// The contract, at the typecheck (`tsc -p packages/viewer`): the menu's renderer (`./renderer` `createRenderer`'s
// `ViewerRenderer`) is a `MatchRenderer`, and the three.js renderer it carries has the shadow's render targets.
export const viewerIsMatchRenderer = (v: ViewerRenderer): MatchRenderer => v;
export const webgpuHasShadowTargets = (r: WebGPURenderer): ShadowRenderer => r;

interface Draw { target: RenderTarget | null; camera: Camera; override: Material | null; background: unknown; clear: [number, number] }

/** three's renderer as far as the shadow and the HUD use it: render targets, the clear colour, `render`. */
class FakeTargets implements ShadowRenderer {
  autoClear = true;
  target: RenderTarget | null = null;
  clearColor = new Color(0x204060);
  clearAlpha = 1;
  cleared = 0;
  readonly draws: Draw[] = [];
  getRenderTarget(): RenderTarget | null { return this.target; }
  setRenderTarget(t: RenderTarget | null): void { this.target = t; }
  getClearColor(c: Color): Color { return c.copy(this.clearColor); }
  getClearAlpha(): number { return this.clearAlpha; }
  setClearColor(c: ColorRepresentation, a = 1): void { this.clearColor = new Color(c); this.clearAlpha = a; }
  clear(): void { this.cleared++; }
  render(scene: Object3D, camera: Camera): void {
    const s = scene as Scene;
    this.draws.push({ target: this.target, camera, override: s.overrideMaterial, background: s.background, clear: [this.clearColor.getHex(), this.clearAlpha] });
  }
  getDrawingBufferSize(v: Vector2): Vector2 { return v.set(640, 448); }
}

/** A SEAL-sized actor on the ground: a box 8 x 18 x 8. */
const actor = (): Group => {
  const g = new Group();
  const m = new Mesh(new BoxGeometry(8, 18, 8), new MeshBasicMaterial());
  m.position.set(0, 9, 0);
  g.add(m);
  g.position.set(100, 0, -50);
  return g;
};

const matchRenderer = (renderer: MatchRenderer['renderer']): MatchRenderer =>
  ({ render: () => {}, resize: () => {}, setClearColor: () => {}, renderer });

describe('PAR-6: the renderer contract (./matchRenderer) and its render-target capability', () => {
  it("shadowRendererOf: the three.js renderer when it has render targets; null for a renderer without (the tests' fakes)", () => {
    const t = new FakeTargets();
    expect(shadowRendererOf(matchRenderer(t))).toBe(t);
    const hudOnly = { autoClear: true, render: () => {}, getDrawingBufferSize: (v: Vector2) => v.set(640, 448) };
    expect(shadowRendererOf(matchRenderer(hudOnly))).toBeNull();
    expect(shadowRendererOf(null)).toBeNull();
  });
});

describe("PAR-6: mountCharShadow -- the shadow both pages mount (main.ts's show, warm-up and frame lines)", () => {
  it('each frame the visible actor is drawn as a silhouette into the 256x256 map on its layer, before the world; the target, clear colour and scene put back', () => {
    const s = mountCharShadow();
    s.setMap({ shadowVector: [-0.811, -0.2, 0.55] });              // Frostfire's ShadowVector (MP2)
    const t = new FakeTargets(), scene = new Scene(), a = actor();
    scene.add(a);
    scene.background = new Color(1, 0, 0);
    s.frame(t, scene, a);
    expect(t.draws).toHaveLength(1);
    const d = t.draws[0]!;
    expect(d.target).toBe(s.shadow.target);
    expect([d.target!.width, d.target!.height]).toEqual([SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]);
    expect(d.camera).toBeInstanceOf(OrthographicCamera);
    expect(d.camera.layers.mask).toBe(1 << SHADOW_LAYER);           // the map's layer alone
    expect(d.override).not.toBeNull();                               // VU1 0x40: the silhouette
    expect(d.background).toBeNull();                                 // the map starts empty
    expect(d.clear).toEqual([0, 0]);
    expect(t.cleared).toBe(1);
    expect(t.target).toBeNull();                                     // the canvas again
    expect(scene.overrideMaterial).toBeNull();
    expect((scene.background as Color).getHex()).toBe(0xff0000);
    expect([t.clearColor.getHex(), t.clearAlpha]).toEqual([0x204060, 1]);
    let onLayer = 0;
    a.traverse((o) => { if (o instanceof Mesh && o.layers.isEnabled(SHADOW_LAYER)) onLayer++; });
    expect(onLayer).toBe(1);                                         // the actor's own mesh is a caster
  });

  it('no draw while the actor is hidden or absent, or on a renderer without render targets', () => {
    const s = mountCharShadow();
    s.setMap(null);                                                  // no map vector: the constructor's (1,-1,1)
    const t = new FakeTargets(), scene = new Scene(), a = actor();
    a.visible = false;
    s.frame(t, scene, a);
    s.frame(t, scene, null);
    a.visible = true;
    s.frame(null, scene, a);
    expect(t.draws).toHaveLength(0);
    expect(t.cleared).toBe(0);
  });

  it("the warm-up compiles the actor for the map: its camera, the map as the target, the silhouette as the override (main.ts's warmWalk)", async () => {
    const s = mountCharShadow();
    const scene = new Scene(), a = actor();
    scene.add(a);
    const asked: { objects: readonly Object3D[]; scene: Scene; camera: Camera; options: MatchPrepareOptions | undefined }[] = [];
    const stale = (): boolean => false;
    await s.warm(a, scene, (objects, sc, camera, options) => { asked.push({ objects, scene: sc, camera, options }); return Promise.resolve(); }, stale);
    expect(asked).toHaveLength(1);
    const q = asked[0]!;
    expect(q.objects).toEqual([a]);
    expect(q.scene).toBe(scene);
    expect(q.camera.layers.mask).toBe(1 << SHADOW_LAYER);
    expect(q.options?.target).toBe(s.shadow.target);
    expect(q.options?.override).toBeDefined();
    expect(q.options?.stale).toBe(stale);
    // The frame draws with the program the warm-up compiled: the same override.
    const t = new FakeTargets();
    s.frame(t, scene, a);
    expect(t.draws[0]!.override).toBe(q.options?.override);
    // No prepare (a renderer that warms nothing) or no actor: nothing asked, nothing thrown.
    await expect(s.warm(a, scene, undefined)).resolves.toBeUndefined();
    await expect(s.warm(null, scene, () => Promise.reject(new Error('never asked')))).resolves.toBeUndefined();
  });

  it("teardown frees the shadow: the silhouette and the map's target disposed; no draw after", async () => {
    const s = mountCharShadow();
    const scene = new Scene(), a = actor();
    let override: Material | undefined;
    await s.warm(a, scene, (_o, _s, _c, options) => { override = options?.override; return Promise.resolve(); });
    const freed: string[] = [];
    override!.addEventListener('dispose', () => { freed.push('silhouette'); });
    s.shadow.target.addEventListener('dispose', () => { freed.push('target'); });
    s.dispose();
    expect(freed.sort()).toEqual(['silhouette', 'target']);
    const t = new FakeTargets();
    s.frame(t, scene, a);
    expect(t.draws).toHaveLength(0);
    s.dispose();                                                     // twice: nothing more
    expect(freed).toHaveLength(2);
  });

  it("teardown releases what the idle skip's caches and the map's owner held: no module reference to a disposed match's actor, renderer or scene (Codex P2 on #638)", () => {
    // CPS H8 step 2's caches (`boxInputs`, `drawInputs`) record the actor's objects, geometries, materials, the renderer and
    // the scene, and the module's `drawnBy` names the shadow that last drew the map. A match left for the menus must not
    // keep them reachable through this module while no later shadow draws.
    const s = mountCharShadow();
    const scene = new Scene(), a = actor();
    scene.add(a);
    const t = new FakeTargets();
    s.frame(t, scene, a);
    expect(t.draws).toHaveLength(1);
    expect(shadowDrawnBy()).toBe(s.shadow);
    expect(s.shadow.retains()).toBeGreaterThan(0);
    // Another shadow draws the map: the owner is that one; the first's dispose then releases its own caches and leaves
    // the live owner alone (the `drawnBy === this` guard: an unconditional release would cost the live one a redraw).
    const s2 = mountCharShadow();
    s2.frame(new FakeTargets(), scene, a);
    expect(shadowDrawnBy()).toBe(s2.shadow);
    s.dispose();
    expect(shadowDrawnBy()).toBe(s2.shadow);
    expect(s.shadow.retains()).toBe(0);
    s2.dispose();
    expect(shadowDrawnBy()).toBeNull();
    expect(s2.shadow.retains()).toBe(0);
    // A shadow disposed while it owns the map releases it.
    const s3 = mountCharShadow();
    s3.frame(new FakeTargets(), scene, a);
    expect(shadowDrawnBy()).toBe(s3.shadow);
    s3.dispose();
    expect(shadowDrawnBy()).toBeNull();
  });
});

describe('CPS H8: the shadow pass renders without three\'s whole-scene matrix update', () => {
  /** A renderer that records, at its `render`, the scene's auto-update flag and the actor's mesh's world matrix. */
  class Watching extends FakeTargets {
    seen: { auto: boolean; world: number[] }[] = [];
    fail = false;
    constructor(private readonly mesh: Mesh) { super(); }
    override render(scene: Object3D, camera: Camera): void {
      this.seen.push({ auto: scene.matrixWorldAutoUpdate, world: this.mesh.matrixWorld.toArray() });
      if (this.fail) throw new Error('lost context');
      super.render(scene, camera);
    }
  }

  /** The actor under a holder: the holder's move left unflushed, as a frame's scene update would have caught it. */
  const staged = () => {
    const scene = new Scene(), holder = new Group(), a = actor();
    scene.add(holder);
    holder.add(a);
    scene.updateMatrixWorld();
    holder.position.set(3, 1, -2);                                   // moved since the last update
    a.position.set(110, 0, -40);
    a.rotation.y = 0.7;
    const mesh = a.children[0] as Mesh;
    return { scene, holder, a, mesh };
  };

  it("the scene's matrixWorldAutoUpdate is false during the shadow's render and true after; the actor's chain updated before it", () => {
    const s = mountCharShadow();
    const { scene, a, mesh } = staged();
    const t = new Watching(mesh);
    s.frame(t, scene, a);
    expect(t.seen).toHaveLength(1);
    expect(t.seen[0]!.auto).toBe(false);                             // three skips its scene.updateMatrixWorld()
    expect(scene.matrixWorldAutoUpdate).toBe(true);                  // the main render updates the scene as before
    scene.updateMatrixWorld();                                       // what three's own update would have made
    expect(t.seen[0]!.world).toEqual(mesh.matrixWorld.toArray());    // the silhouette drawn where it was
  });

  it("the flag is put back when the render throws", () => {
    const s = mountCharShadow();
    const { scene, a, mesh } = staged();
    const t = new Watching(mesh);
    t.fail = true;
    expect(() => s.frame(t, scene, a)).toThrow('lost context');
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });

  it("a scene whose auto-update its page turned off stays off", () => {
    const s = mountCharShadow();
    const { scene, a, mesh } = staged();
    scene.matrixWorldAutoUpdate = false;
    const t = new Watching(mesh);
    s.frame(t, scene, a);
    expect(t.seen[0]!.auto).toBe(false);
    expect(scene.matrixWorldAutoUpdate).toBe(false);
  });
});

describe('CPS H8 step 2: the own shadow skips its box and map on an unchanged pose (exact equality, not a tolerance)', () => {
  /** A skinned SEAL-like actor: three bones, one skinned part, a rigid item in the hand. */
  const skinnedActor = () => {
    const g = new Group();
    const bones = [new Bone(), new Bone(), new Bone()];
    g.add(bones[0]!); bones[0]!.add(bones[1]!); bones[1]!.add(bones[2]!);
    bones[1]!.position.set(0, 6, 0); bones[2]!.position.set(0, 6, 0);
    g.updateMatrixWorld(true);
    const geo = new BufferGeometry();
    const pos: number[] = [], idx: number[] = [], wt: number[] = [];
    for (let i = 0; i < 12; i++) { pos.push((i % 3) - 1, i * 1.5, ((i * 7) % 5) - 2); idx.push(i % 3, (i + 1) % 3, 0, 0); wt.push(0.7, 0.3, 0, 0); }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
    const body = new SkinnedMesh(geo, new MeshBasicMaterial());
    g.add(body);
    body.bind(new Skeleton(bones));
    const held = new Mesh(new BoxGeometry(1, 1, 6), new MeshBasicMaterial());
    bones[2]!.add(held);
    g.position.set(100, 0, -50);
    return { g, bones, body, held };
  };
  const staged = () => {
    const s = mountCharShadow();
    s.setMap({ shadowVector: [-0.811, -0.2, 0.55] });
    const scene = new Scene(), a = skinnedActor(), t = new FakeTargets();
    scene.add(a.g);
    return { s, scene, a, t };
  };

  it('two frames of the same pose render the map once; the second is skipped (no box, no clear, no render)', () => {
    const { s, scene, a, t } = staged();
    s.frame(t, scene, a.g);
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(1);
    expect(t.cleared).toBe(1);
    expect(t.target).toBeNull();
  });

  it('a bone moved by 1e-9 renders again', () => {
    const { s, scene, a, t } = staged();
    s.frame(t, scene, a.g);
    a.bones[1]!.position.x += 1e-9;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);                                 // and still again skipped
  });

  it('the actor moved, the held item moved or swapped, or hidden, renders again', () => {
    const { s, scene, a, t } = staged();
    s.frame(t, scene, a.g);
    a.g.position.z += 1;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);
    a.held.rotation.y = 0.25;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(3);
    a.held.geometry = new BoxGeometry(1, 1, 7);                      // another rifle, the same place
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(4);
    a.held.visible = false;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(5);
  });

  it("another shadow vector, another renderer or scene, or another shadow drawing into the page's one map, renders again", () => {
    const { s, scene, a, t } = staged();
    s.frame(t, scene, a.g);
    s.setMap(null);
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);
    const t2 = new FakeTargets();
    s.frame(t2, scene, a.g);
    expect(t2.draws).toHaveLength(1);
    const other = mountCharShadow();                                 // the module's one target, drawn by another
    other.frame(t2, scene, a.g);
    s.frame(t2, scene, a.g);
    expect(t2.draws).toHaveLength(3);
  });

  it('the warm-up leaves no stale skip behind; a frame with the actor hidden leaves the map as it was, so the next is skipped', async () => {
    const { s, scene, a, t } = staged();
    s.frame(t, scene, a.g);
    await s.warm(a.g, scene, () => Promise.resolve());
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);                                 // the warm-up re-fitted the camera: redrawn
    a.g.visible = false;
    s.frame(t, scene, a.g);                                          // `clear()`: the receivers take none; the map untouched
    a.g.visible = true;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(2);                                 // the map still holds this pose's picture
  });

  it('counts its full draws and its skips, monotonic (CPS H9, 2026-11-03T01:58Z: charShadow 0.15% with the skip in)', () => {
    // CPS H9, 2026-11-03T01:58Z (the owner's PC): `charShadow.ts` fell to 0.15% of the main thread while the seat's pad
    // script walked and fired -- whether the idle skip took moving frames is what these counts read live.
    const { s, scene, a, t } = staged();
    expect(s.shadow.stats()).toEqual({ drawn: 0, skipped: 0 });
    s.frame(t, scene, a.g);
    s.frame(t, scene, a.g);                                          // the same pose
    expect(s.shadow.stats()).toEqual({ drawn: 1, skipped: 1 });
    a.bones[1]!.rotation.z = 0.1;                                    // a moved bone
    s.frame(t, scene, a.g);
    expect(s.shadow.stats()).toEqual({ drawn: 2, skipped: 1 });
    a.g.visible = false;
    s.frame(t, scene, a.g);                                          // hidden: neither (no update ran)
    expect(s.shadow.stats()).toEqual({ drawn: 2, skipped: 1 });
    expect(t.draws).toHaveLength(2);                                 // the counts are the renders the fake saw
    const read = s.shadow.stats();
    read.drawn = 99;                                                 // a copy: the reader cannot change the counts
    expect(s.shadow.stats()).toEqual({ drawn: 2, skipped: 1 });
  });

  it('a render that throws counts no draw', () => {
    const { s, scene, a } = staged();
    class Failing extends FakeTargets { override render(): void { throw new Error('lost'); } }
    expect(() => s.frame(new Failing(), scene, a.g)).toThrow('lost');
    expect(s.shadow.stats()).toEqual({ drawn: 0, skipped: 0 });
  });

  it('the render throwing leaves no skip: the next frame draws', () => {
    const { s, scene, a } = staged();
    class Failing extends FakeTargets { fail = true; override render(sc: Object3D, c: Camera): void { if (this.fail) throw new Error('lost'); super.render(sc, c); } }
    const t = new Failing();
    expect(() => s.frame(t, scene, a.g)).toThrow('lost');
    t.fail = false;
    s.frame(t, scene, a.g);
    expect(t.draws).toHaveLength(1);
  });
});
