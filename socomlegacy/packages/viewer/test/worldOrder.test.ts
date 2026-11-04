import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh, OneMinusSrcAlphaFactor, PerspectiveCamera, SrcAlphaFactor, Vector2, type Material } from 'three';
import type { GridParams, LodBand } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';

/**
 * The engine order wired into `buildWorld` (W1.2), without a GPU. A 3 x 3 grid of 100-unit cells (cell
 * `x + 3z`, the centre is 4) holding a ground that covers every cell and carries a detail pass, a blended
 * glow in the centre, a wall in the far corner, a crate placed twice (instanced) in the other two corners,
 * and a drop shadow in the centre.
 */
const GRID: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 3, cellsZ: 3, originX: 0, originZ: 0 };

const part = (textureName: string, order: number, cells?: number[]): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName, fog: true, lit: false, order, orderEnd: order, cull: true, alternate: false, scroll: null,
  ...(cells ? { cells } : {}),
});
const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const ramp: TextureFlags = { bilinear: true, transparent: true, graded: true, opaque: false, gs: null };
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** With the engine order off, a draw's `renderOrder` is its walk order at this scale (`world.ts` `REST_WALK_SCALE`). */
const S = 2 ** -24;

const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: GRID, slots: [],
  world: [
    part('ground.tif', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]),
    part('shadow.tif', 5, [4]),
    part('wall.tif', 10, [8]),
    part('glow.tif', 20, [4]),
  ],
  props: [{
    modelName: 'crate', parts: [part('wall.tif', 30)], matrices: new Float32Array([...identity, ...identity]),
    order: 30, alternate: false, facade: 0, lod: null, cells: [[2], [6]],
  }],
  textures: { 'ground.tif': rgba(255), 'wall.tif': rgba(255), 'glow.tif': rgba(128), 'shadow.tif': rgba(128), 'grain.tif': rgba(255) },
  textureFlags: { 'ground.tif': solid, 'wall.tif': solid, 'glow.tif': ramp, 'shadow.tif': ramp, 'grain.tif': solid },
  detail: { 'ground.tif': { name: 'grain.tif', uv: 4, range: 10000, bmode: 'COLORBLEND' } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
});

function setUp() {
  const view = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  view.setBlendGraded(true);                          // the panel's default: ramps blend as the disc asks
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const byName = (name: string): Mesh => meshes.find((m) => m.name === name)!;
  const ground = byName('ground.tif'), shadow = byName('shadow.tif'), wall = byName('wall.tif'), glow = byName('glow.tif');
  const crate = byName('crate');
  const detail = ground.children[0] as Mesh;
  const camera = new PerspectiveCamera();
  const at = (x: number, z: number) => { camera.position.set(x, 15, z); camera.updateMatrixWorld(); view.frame(camera, 0); };
  const orders = () => [ground, glow, wall, crate, shadow].map((m) => m.renderOrder);
  return { view, ground, shadow, wall, glow, crate, detail, at, orders };
}

const state = (m: Mesh) => { const x = m.material as Material; return [x.transparent, x.depthWrite]; };

describe('buildWorld: the engine draw order', () => {
  // NU-15 B1 (research 330): the walk's blends write depth in three's order too (`ZMSK` 0, `FUN_003b7150(0)` D:L236792).
  // Was "blends in the transparent list with no depth written", and `state(glow)` [true, false] below.
  it('is off by default: the walk\'s order, blends in the transparent list with depth written; the shadow after the world', () => {
    const { ground, glow, crate, detail, at, orders } = setUp();
    at(150, 150);
    // The walk's own order, scaled (research 82 round 5): ground 0, glow 20, wall 10, crate 30; the drop shadow is
    // the engine's alpha pass, held at 1, after every draw of the walk.
    expect(orders()).toEqual([0, 20 * S, 10 * S, 30 * S, 1]);
    expect(crate).toBeInstanceOf(InstancedMesh);
    expect(detail.name).toBe('ground.tif (detail)');
    expect(detail.renderOrder).toBe(0.5);
    expect(state(glow)).toEqual([true, true]);           // NU-15 B1: depth written under the walk's blend (was [true, false])
    expect(state(ground)).toEqual([false, true]);
  });

  it('on, numbers every draw by its place in the walk from the camera\'s cell, the shadow last, and writes depth under blends', () => {
    const { view, glow, shadow, detail, at, orders } = setUp();
    view.setEngineOrder(true);
    at(150, 150);
    // ground (ring 0, walk 0), glow (ring 0, walk 20), wall (ring 2, walk 10), crate (ring 2, walk 30), shadow.
    expect(orders()).toEqual([0, 1, 2, 3, 4]);
    expect(detail.renderOrder).toBe(0.5);                // right behind its base, ahead of the next draw
    expect(state(glow)).toEqual([false, true]);          // research 26 section 2: ZMSK = 0 under the blend
    expect(state(shadow)).toEqual([true, false]);        // the decal pass stays a decal pass
  });

  it('recomputes the order when the camera crosses into another cell, not every frame', () => {
    const { view, wall, at, orders } = setUp();
    view.setEngineOrder(true);
    at(150, 150);
    wall.renderOrder = 99;                              // a frame in the same cell leaves the numbers alone
    at(160, 140);
    expect(wall.renderOrder).toBe(99);
    at(250, 250);                                       // into the wall's corner cell: the wall comes second
    expect(orders()).toEqual([0, 2, 1, 3, 4]);
  });

  it('off again, returns every draw to the walk\'s order; on again, reorders at once from the last camera seen', () => {
    const { view, glow, detail, at, orders } = setUp();
    view.setEngineOrder(true);
    at(250, 250);
    view.setEngineOrder(false);
    expect(orders()).toEqual([0, 20 * S, 10 * S, 30 * S, 1]);
    expect(detail.renderOrder).toBe(0.5);
    expect(state(glow)).toEqual([true, true]);           // NU-15 B1: depth written under the walk's blend (was [true, false])
    view.setEngineOrder(true);
    expect(orders()).toEqual([0, 2, 1, 3, 4]);
  });

  /**
   * RENDER-VIG (research 82 round 5). A packet whose vertices carry an alpha ramp over a solid texture -- Vigilance's
   * grass laid on the courtyard cobbles -- blends: the GS blends by `At x Af` with `PRIM.ABE` set, so it is a blended
   * draw in either order (the transparent list under three's, the opaque list under the engine's, depth written in
   * both -- NU-15 B1, research 330; was "with no depth written under three's"), and its own material beside the
   * texture's opaque one.
   */
  it('blends a draw whose vertices carry alpha below unity, over a solid texture, in either order', () => {
    const overlay = { ...part('ground.tif', 3, [4]), vertexAlpha: true, colors: new Float32Array([1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 1, 1]) };
    const view = buildWorld({ ...map(), world: [part('ground.tif', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]), overlay] });
    for (const task of view.revealWorld) task();
    view.setBlendGraded(true);
    const [plain, ramped] = view.group.children.filter((c): c is Mesh => c instanceof Mesh && c.name === 'ground.tif');
    expect(plain!.material).not.toBe(ramped!.material);
    expect(state(plain!)).toEqual([false, true]);
    expect(state(ramped!)).toEqual([true, true]);        // NU-15 B1: the transparent list, depth written (was [true, false])
    const m = ramped!.material as Material & { blendSrc: number; blendDst: number };
    expect([m.blendSrc, m.blendDst]).toEqual([SrcAlphaFactor, OneMinusSrcAlphaFactor]);
    view.setEngineOrder(true);
    expect(state(ramped!)).toEqual([false, true]);        // the walk's own place, depth written under the blend
    expect(state(plain!)).toEqual([false, true]);
    view.setBlendGraded(false);                            // the escape hatch: a cutout at half, as every ramp
    expect(state(ramped!)).toEqual([false, true]);
    expect((ramped!.material as Material).alphaTest).toBe(0.5);
  });

  /**
   * The engine's alpha pass (`LoadedMesh.alphaPass`, the visual's `vparams` bit 0): the flares, glows, windows and
   * shadows are not drawn where the walk reaches them but after it, far to near by the range to the camera
   * (`FUN_003374c0`, `FUN_00336cb0`). Under the engine order they take the numbers after the last ring and are
   * re-sorted every frame; under three's they sit at 1, after every other transparent draw, where three's own
   * back-to-front sort is the console's.
   */
  it('holds an alpha-pass draw after the walk: at 1 under three\'s order, after the last ring and far to near under the engine\'s', () => {
    const glowAt = (order: number, x: number, z: number) => ({
      ...part('glow.tif', order, [4]), alphaPass: true,
      positions: new Float32Array([x, 0, z, x + 1, 0, z, x, 1, z]),
    });
    const view = buildWorld({ ...map(), world: [part('ground.tif', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]), glowAt(20, 150, 150), glowAt(21, 250, 250), part('wall.tif', 10, [8])] });
    for (const task of view.revealWorld) task();
    view.setBlendGraded(true);
    const [near, far] = view.group.children.filter((c): c is Mesh => c instanceof Mesh && c.name === 'glow.tif');
    const ground = view.group.children.find((c) => c.name === 'ground.tif') as Mesh;
    const wall = view.group.children.find((c) => c.name === 'wall.tif') as Mesh;
    expect([ground.renderOrder, wall.renderOrder, near!.renderOrder, far!.renderOrder]).toEqual([0, 10 * S, 1, 1]);
    const camera = new PerspectiveCamera();
    const at = (x: number, z: number) => { camera.position.set(x, 15, z); camera.updateMatrixWorld(); view.frame(camera, 0); };
    view.setEngineOrder(true);
    at(150, 150);
    // The walk: ground (ring 0), wall and the crate (ring 2); then the pass, the far glow before the near one.
    expect([ground.renderOrder, wall.renderOrder, far!.renderOrder, near!.renderOrder]).toEqual([0, 1, 3, 4]);
    expect(state(near!)).toEqual([false, false]);         // numbered after the walk, blended, no depth written (ZMSK = 1)
    at(160, 140);                                          // the same cell: the pass is re-sorted all the same
    expect([far!.renderOrder, near!.renderOrder]).toEqual([3, 4]);
    at(250, 250);                                          // from the far corner the near glow is the far one
    expect([near!.renderOrder, far!.renderOrder]).toEqual([3, 4]);
    view.setEngineOrder(false);
    expect([ground.renderOrder, wall.renderOrder, near!.renderOrder, far!.renderOrder]).toEqual([0, 10 * S, 1, 1]);
  });

  it('keeps a fading LOD copy on its blended twin in the transparent list, numbered in the walk like any draw (W1.3)', () => {
    // Frostfire's railings pair at one spot in cell 0 (worldLod.test.ts): both copies fade at 110 units.
    const band = (nearFade: [number, number], farFade: [number, number]): LodBand => ({ nearFade, farFade });
    const lodProp = (modelName: string, order: number, lod: LodBand) => ({
      modelName, parts: [part('wall.tif', order)], matrices: identity.slice(), order, alternate: false, facade: 0, lod, cells: [[0]],
    });
    const view = buildWorld({ ...map(), world: [], props: [lodProp('railhi', 1, band([0, 0], [100, 120])), lodProp('raillo', 2, band([100, 120], [420, 440]))] });
    for (const task of view.revealProps) task();
    const [high, low] = ['railhi (lod)', 'raillo (lod)'].map((n) => view.group.children.find((c) => c.name === n) as Mesh);
    const rest = high!.material;
    view.setEngineOrder(true);
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 110);
    camera.updateMatrixWorld();
    view.frame(camera, 0);
    expect(high!.material).not.toBe(rest);
    expect([state(high!), state(low!)]).toEqual([[true, false], [true, false]]);
    expect([high!.renderOrder, low!.renderOrder]).toEqual([0, 1]);
  });

  /**
   * The pass writes no depth (`FUN_003b7150(1)` at `FUN_00336cb0`'s start, D:L235137; `alphaPassState`): a pane of the
   * pass drawn before a glow behind it must not cut the glow, in either order. A solid texture drawn in the pass (a
   * cutout window) is the same draw's state, and under three's order joins the transparent list, so that `restOrder`'s 1
   * holds it after every draw of the walk; the same texture drawn in the walk keeps its own opaque material.
   */
  it('writes no depth for a draw of the pass in either order; a cutout of the pass sits in the transparent list after the walk', () => {
    const base = map();
    const pane = { ...part('pane.tif', 22, [4]), alphaPass: true, positions: new Float32Array([150, 0, 150, 151, 0, 150, 150, 1, 150]) };
    const glow = { ...part('glow.tif', 23, [4]), alphaPass: true, positions: new Float32Array([250, 0, 250, 251, 0, 250, 250, 1, 250]) };
    const view = buildWorld({
      ...base, world: [part('ground.tif', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]), part('pane.tif', 2, [0]), pane, glow],
      textures: { ...base.textures, 'pane.tif': rgba(255) }, textureFlags: { ...base.textureFlags, 'pane.tif': solid },
    });
    for (const task of view.revealWorld) task();
    view.setBlendGraded(true);
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const [wallPane, passPane] = meshes.filter((m) => m.name === 'pane.tif');
    const glowMesh = meshes.find((m) => m.name === 'glow.tif')!;
    expect(wallPane!.material).not.toBe(passPane!.material);                       // one material per (texture, pass)
    expect([state(wallPane!), wallPane!.renderOrder]).toEqual([[false, true], 2 * S]);
    expect([state(passPane!), passPane!.renderOrder]).toEqual([[true, false], 1]);
    expect([state(glowMesh), glowMesh.renderOrder]).toEqual([[true, false], 1]);
    const camera = new PerspectiveCamera();
    camera.position.set(150, 15, 150);
    camera.updateMatrixWorld();
    view.setEngineOrder(true);
    view.frame(camera, 0);
    // The walk (ground, the wall's pane), then the pass far to near: the glow at 250 before the pane at 150.
    expect([state(wallPane!), state(passPane!), state(glowMesh)]).toEqual([[false, true], [false, false], [false, false]]);
    expect(glowMesh.renderOrder).toBeLessThan(passPane!.renderOrder);
    expect(wallPane!.renderOrder).toBeLessThan(glowMesh.renderOrder);
    view.setEngineOrder(false);
    expect([state(passPane!), passPane!.renderOrder, state(glowMesh)]).toEqual([[true, false], 1, [true, false]]);
  });
});

/** The `Vector2` uniforms in a node graph, each once: walked through every node-valued property from its root. */
function vec2Uniforms(root: unknown): Vector2[] {
  const seen = new Set<object>(), out: Vector2[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const o = n as { isNode?: boolean; isUniformNode?: boolean; value?: unknown };
    if (!o.isNode) return;
    if (o.isUniformNode && o.value instanceof Vector2) out.push(o.value);
    for (const v of Object.values(n)) walk(v);
  };
  walk(root);
  return out;
}

describe('buildWorld: the texture scroll (FUN_003c0120 from FUN_00313c60, research 82)', () => {
  it('steps a band\'s uv offset by du x the frame time, du per second, kept modulo 1', () => {
    const base = map();
    const view = buildWorld({
      ...base,
      world: [part('ground.tif', 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]), { ...part('sea.tif', 1, [4]), scroll: [0.25, 0] }],
      textures: { ...base.textures, 'sea.tif': rgba(255) }, textureFlags: { ...base.textureFlags, 'sea.tif': solid },
    });
    for (const task of view.revealWorld) task();
    const sea = view.group.children.find((c): c is Mesh => c instanceof Mesh && c.name === 'sea.tif')!;
    const [offset, ...more] = vec2Uniforms((sea.material as unknown as { colorNode: unknown }).colorNode);
    expect(more).toEqual([]);
    expect([offset!.x, offset!.y]).toEqual([0, 0]);
    const camera = new PerspectiveCamera();
    camera.position.set(150, 15, 150);
    camera.updateMatrixWorld();
    view.frame(camera, 1);
    expect(offset!.x).toBeCloseTo(0.25, 12);                          // one second: du of a texture width
    expect(offset!.y).toBe(0);
    view.frame(camera, 0.5);
    expect(offset!.x).toBeCloseTo(0.375, 12);                         // half a second: half of du
    view.frame(camera, 3);
    expect(offset!.x).toBeCloseTo(0.125, 12);                         // 1.125 wrapped: kept in 0..1
  });
});
