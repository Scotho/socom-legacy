import { describe, expect, it } from 'vitest';
import { InstancedMesh, LineSegments, Matrix4, Mesh, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { DEFAULT_GRID_PARAMS, type LodBand } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';

/**
 * CPS H9 step 1 (a CPU-side browser adaptation, product track, CPS.R9 (e): the picture is unchanged): the world's static
 * objects are built with `matrixAutoUpdate` off, their local matrix composed once, so three's `updateMatrixWorld` skips the
 * per-frame `compose` for them; whatever moves keeps it on -- the facade turns (`frame`), the turned line strips, every
 * placement `moveNode` reaches (`movableMesh`: the doors, gates, cranes, turrets). The world matrix each object ends with
 * must be the very one an auto-updating graph gives, element for element.
 */

const tri = (): Float32Array => new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const NORMALS = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
  positions: tri(), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
  indices: new Uint32Array([0, 1, 2]), textureName, fog: true, lit: false, order, orderEnd: order, cull: true,
  alternate: false, scroll: null, ...extra,
});
/** A placement turned about y, scaled and moved: a matrix whose compose is not trivial. */
const placed = (x: number, y: number, z: number, turn: number, scale = 0.93): number[] =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn), new Vector3(scale, scale, scale)).toArray();
const HIGH: LodBand = { nearFade: [0, 0], farFade: [100, 120] };
const rgba = () => ({ data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 });
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const strip = (textureName: string, order: number, turn?: { facade: number; matrix: Float32Array }): NonNullable<LoadedMap['lines']>[number] => ({
  textureName, fog: true, order, positions: Float32Array.from([0, -0.5, 0, 0, -3.25, 0]), uvs: new Float32Array(4),
  colors: new Float32Array(8).fill(1), normals: new Float32Array(6), ...(turn ? { turn } : {}),
});

const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', grid: DEFAULT_GRID_PARAMS, slots: [],
  world: [
    part('ground.tif', 0),                                              // with a detail pass under it
    part('water.tif', 256, { reflect: 1, normals: NORMALS }),           // with an env pass under it
  ],
  lines: [
    strip('rope.tif', 512),                                             // a plain strip: static
    strip('flare.tif', 768, { facade: 2, matrix: Float32Array.from(placed(-30, 40, 60, 0.4, 2)) }),   // turned by `frame`
  ],
  props: [
    // A facade: turned to the camera every frame.
    { modelName: 'lamp', parts: [part('flare.tif', 1024)], matrices: Float32Array.from(placed(10, 5, 20, 0.3)), order: 1024, alternate: false, facade: 2, lod: null, paths: ['worldmodel/lamp'] },
    // One placement under a node path: `moveNode` reaches it (a door's leaf). Its detail pass rides it.
    { modelName: 'leaf', parts: [part('ground.tif', 1280)], matrices: Float32Array.from(placed(12, 0, -4, 0.7)), order: 1280, alternate: false, facade: 0, lod: null, paths: ['worldmodel/door_a/door1'] },
    // One placement with no path: nothing can reach it.
    { modelName: 'rock', parts: [part('wall.tif', 1536)], matrices: Float32Array.from(placed(-8, 1, 3, 1.1)), order: 1536, alternate: false, facade: 0, lod: null },
    // A LOD band, under a node path and without one.
    { modelName: 'tree', parts: [part('wall.tif', 1792)], matrices: Float32Array.from(placed(40, 0, 40, 0.2)), order: 1792, alternate: false, facade: 0, lod: HIGH, paths: ['worldmodel/tree1'] },
    { modelName: 'bush', parts: [part('wall.tif', 2048)], matrices: Float32Array.from(placed(42, 0, 40, 0.9)), order: 2048, alternate: false, facade: 0, lod: HIGH },
    // Two placements, one instanced draw: `moveNode` writes its instance matrices, never the object's own transform.
    { modelName: 'crate', parts: [part('wall.tif', 2304)], matrices: Float32Array.from([...placed(0, 0, 0, 0.5), ...placed(20, 0, 0, 1.5)]), order: 2304, alternate: false, facade: 0, lod: null, paths: ['worldmodel/crate', 'worldmodel/door_b=crate'] },
  ],
  textures: { 'ground.tif': rgba(), 'water.tif': rgba(), 'wall.tif': rgba(), 'flare.tif': rgba(), 'rope.tif': rgba(), 'grain.tif': rgba(), 'sky01.tif': rgba() },
  textureFlags: { 'ground.tif': solid, 'water.tif': solid, 'wall.tif': solid, 'flare.tif': solid, 'rope.tif': solid, 'grain.tif': solid, 'sky01.tif': solid },
  envMaterials: [{ index: 0, rgba: [128, 128, 128, 0], uvScale: 0.5, rimOffset: 0, rimSlope: 1, texture: 'sky01.tif' }],
  detail: { 'ground.tif': { name: 'grain.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' } },
  metersPerUnit: 0.1, lightRig: null, origin: [100, 3, -50],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

/** What moves, by name: the facade, the turned strip, and the placements under a node path. */
const MOVERS = ['lamp (flare)', 'line strips (flare.tif)', 'leaf', 'tree (lod)'];
/** What never moves: the world's parts and their passes, the plain strip, the pathless placements, the instanced draw. */
const STATIC = [
  'ground.tif', 'ground.tif (detail)', 'water.tif', 'water.tif (env)', 'line strips (rope.tif)', 'rock', 'bush (lod)', 'crate',
  'leaf (detail)',                                                      // a mover's pass: identity under it, never written
];

function setUp() {
  const view = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  const scene = new Scene();
  scene.add(view.group);
  const camera = new PerspectiveCamera();
  camera.position.set(130, 20, -10);
  camera.updateMatrixWorld();
  const all: Object3D[] = [];
  view.group.traverse((o) => { if (o !== view.group) all.push(o); });
  const named = (name: string): Object3D => {
    const found = all.filter((o) => o.name === name);
    expect(found, name).toHaveLength(1);
    return found[0]!;
  };
  return { view, scene, camera, all, named };
}

/**
 * Each object's world matrix as it stands, then the same graph with every object auto-updating, recomputed from scratch:
 * element for element the same numbers (`Object.is`, so -0 and +0 differ too).
 */
function expectAutoUpdatingMatch(scene: Scene, all: readonly Object3D[]): void {
  const flags = new Map<Object3D, boolean>();
  scene.traverse((o) => flags.set(o, o.matrixAutoUpdate));
  const now = all.map((o) => [...o.matrixWorld.elements]);
  scene.traverse((o) => { o.matrixAutoUpdate = true; });
  scene.updateMatrixWorld(true);
  all.forEach((o, i) => {
    const fresh = o.matrixWorld.elements;
    for (let k = 0; k < 16; k++) expect(Object.is(now[i]![k], fresh[k]), `${o.name} [${k}]: ${now[i]![k]} vs ${fresh[k]}`).toBe(true);
  });
  for (const [o, f] of flags) o.matrixAutoUpdate = f;
}

describe('buildWorld: the static matrices (CPS H9 step 1, a CPU-side browser adaptation)', () => {
  it('the fixture holds every kind of object, each once', () => {
    const { all, named } = setUp();
    for (const name of [...MOVERS, ...STATIC]) named(name);
    expect(all).toHaveLength(MOVERS.length + STATIC.length);
    expect(named('crate')).toBeInstanceOf(InstancedMesh);
    expect(named('line strips (rope.tif)')).toBeInstanceOf(LineSegments);
    expect(named('leaf (detail)').parent).toBe(named('leaf'));
  });

  it('every static object is built with matrixAutoUpdate off, the world group too; every mover keeps it on', () => {
    const { view, named } = setUp();
    for (const name of STATIC) expect(named(name).matrixAutoUpdate, name).toBe(false);
    expect(view.group.matrixAutoUpdate).toBe(false);
    for (const name of MOVERS) expect(named(name).matrixAutoUpdate, name).toBe(true);
    // Only the local recompose is skipped: three's walk still reaches every child (`matrixWorldAutoUpdate` untouched).
    view.group.traverse((o) => expect(o.matrixWorldAutoUpdate, o.name).toBe(true));
  });

  it('a static object\'s matrix is its own transform, composed once', () => {
    const { named } = setUp();
    for (const name of STATIC) {
      const o = named(name);
      const composed = new Matrix4().compose(o.position, o.quaternion, o.scale).elements;
      o.matrix.elements.forEach((e, k) => expect(Object.is(e, composed[k]), `${name} [${k}]`).toBe(true));
    }
  });

  it('the world matrices are the auto-updating graph\'s: once revealed, after frames, after a door swings and back', () => {
    const { view, scene, camera, all } = setUp();
    scene.updateMatrixWorld();
    expectAutoUpdatingMatch(scene, all);
    view.frame(camera, 1 / 60);                       // the facade and the turned strip turn
    scene.updateMatrixWorld();
    expectAutoUpdatingMatch(scene, all);
    const swing = new Matrix4().makeTranslation(12, 0, -4).multiply(new Matrix4().makeRotationY(Math.PI / 2)).multiply(new Matrix4().makeTranslation(-12, 0, 4));
    expect(view.moveNode('worldmodel/door_a', swing.toArray())).toBe(1);
    expect(view.moveNode('worldmodel/tree1', swing.toArray())).toBe(1);
    expect(view.moveNode('worldmodel/door_b', swing.toArray())).toBe(1);   // the crate's second instance
    camera.position.set(60, 30, 10);
    camera.updateMatrixWorld();
    view.frame(camera, 1 / 60);
    scene.updateMatrixWorld();
    expectAutoUpdatingMatch(scene, all);
    view.setBillboards(false);                         // the facade's pose on disc put back
    for (const path of ['worldmodel/door_a', 'worldmodel/tree1', 'worldmodel/door_b']) view.moveNode(path, new Matrix4().toArray());
    scene.updateMatrixWorld();
    expectAutoUpdatingMatch(scene, all);
  });
});
