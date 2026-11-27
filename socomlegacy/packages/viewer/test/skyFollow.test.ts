// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Mesh, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_GRID_PARAMS, type CollisionOwner, type EffectOp, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { mergeWorld, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { groundGrid, packGround } from '../src/mover';
import {
  bareMeta, CAMERA_NODE_READING, SCENE_TRANSLATE_OFFSET_FRAME_READING, SCENE_TRANSLATE_TICK_ORDER_READING, WorldState,
} from '../src/worldState';
import { buildWorld } from '../src/world';

/**
 * LATER 951 (research 436): a sky a scene program holds at the camera. The original's `OBJECT_TRANSLATE_STATE` (18; tick
 * `FUN_00263890` D:L111288-111346) sets its target node's (+6) translation each tick to the reference node's (+7) world
 * place plus the record's vector (+8): the vector alone (flag 1) or added to the target's own translation (flag 4), plus
 * the context's place (flag 2), carried through the reference's matrix (`FUN_00310980` D:L212139-212147); the target
 * keeps its own value on an axis where flag 8 / 0x10 / 0x20 is set, and the setter writes the rest (`FUN_003157d0`
 * D:L215063-215071). With the reference `camera` in a looped autostart the sky stands at the camera every tick. The port
 * ran nothing (`case 'translate': return`), so every such sky stood where it was placed.
 *
 * Two shapes taken from the disc (research 436 s3): Desert Glory's `translate_sky` (flag 1, vector 0, every axis
 * written) and Chain Reaction's `skyplane` (MP81: flag 1, vector (0, -220, 0)); Sandstorm's Y kept (flag 0x10, MP73).
 */

type Translate = Extract<EffectOp, { op: 'translate' }>;
const translate = (over: Partial<Translate> = {}): Translate => ({ op: 'translate', node: 1, ref: 2, flags: 1, xyz: [0, 0, 0], ...over });
const loop = (): EffectOp => ({ op: 'loop', count: null, seconds: null });

const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Row-major 4x4 with translation `t` (the scene graph's `node.matrix` / `world`, `flattenScene`). */
const at = (t: [number, number, number]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];

/** A world whose autostart holds `sky` (placed at `rest`) with `ops`; `refs` its program's node names after `sky`. */
function world(ops: EffectOp[], rest: [number, number, number] = [0, 0, 0], refs: string[] = ['camera'], extra: Record<string, number[]> = {}) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-10, 0, 10, 10, 0, 10, 10, 0, -10, -10, 0, -10]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: 0x1001 }];
  const ground = packGround(params, [poly], owners);
  const program: EffectProgram = {
    name: 'translate_sky', root: 0, flags: 0x21, nodes: ['NA', 'sky', ...refs],
    sequences: [{ name: 's0', activation: 1, ops }] as EffectProgram['sequences'],
  };
  const paths = ['worldmodel', 'worldmodel/floor', 'worldmodel/sky', ...Object.keys(extra)];
  const meta = {
    ...bareMeta('SYN'),
    instances: paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path })),
    scene: { destructibles: [], programs: [{ program, search: [0, 0, 0] }] },
    motion: { scrolled: [], translated: ['worldmodel/sky'], frames: new Map([['worldmodel/sky', { own: at(rest), world: at(rest) }]]) },
    worlds: new Map<string, readonly number[]>([['worldmodel/sky', at(rest)], ...Object.entries(extra)]),
  };
  meta.instanceByPath = new Map(meta.instances.map((i) => [i.path, i.id]));
  const moves: [string, number[]][] = [];
  const w = new WorldState(meta, ground, groundGrid(ground), { translate: (path, delta) => { moves.push([path, Array.from(delta)]); } });
  w.runAutostartPrograms = true;
  return { world: w, moves };
}
/** The translation of a column-major 4x4 (`WorldHooks.translate`'s delta, `WorldView.moveNode`'s). */
const shift = (m: number[]): number[] => [m[12]!, m[13]!, m[14]!];

describe('the world runs OBJECT_TRANSLATE_STATE at the camera (LATER 951)', () => {
  it('names its readings', () => {
    expect(CAMERA_NODE_READING).toBe('theGameCamera');
    expect(SCENE_TRANSLATE_TICK_ORDER_READING).toBe('cameraOfThisFrame');
    expect(SCENE_TRANSLATE_OFFSET_FRAME_READING).toBe('cameraTurn');
  });

  it('a looped translate_sky stands the sky at the camera every tick, and follows it', () => {
    const { world: w, moves } = world([translate(), loop()], [0, 0, 0]);
    w.setCamera([120, 45, -300]);
    w.applyInitial();
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toEqual([120, 45, -300]);
    expect(moves.at(-1)![0]).toBe('worldmodel/sky');
    expect(shift(moves.at(-1)![1])).toEqual([120, 45, -300]);
    w.setCamera([-50, 10, 900]);
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toEqual([-50, 10, 900]);
    expect(shift(moves.at(-1)![1])).toEqual([-50, 10, 900]);
  });

  it('the move is the change from the node\'s rest: a sky placed off the origin moves by camera - rest', () => {
    const { world: w, moves } = world([translate(), loop()], [500, 0, 500]);
    w.setCamera([600, 20, 400]);
    w.applyInitial();
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toEqual([600, 20, 400]);
    expect(shift(moves.at(-1)![1])).toEqual([100, 20, -100]);
  });

  it('flag 1 adds the vector (MP81\'s (0, -220, 0)) at the camera; with no turn handed in, unturned', () => {
    const { world: w } = world([translate({ xyz: [0, -220, 0] }), loop()]);
    w.setCamera([10, 300, 20]);
    w.applyInitial();
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toEqual([10, 80, 20]);
  });

  /**
   * LATER 1183 (SCENE_TRANSLATE_OFFSET_FRAME_READING): the tick carries the vector through the camera's matrix
   * (`FUN_00310980` -> `FUN_00308640`, a point transform), and the camera's 3x3 is the view's whole turn (`FUN_00294070`
   * builds the view from it each frame; PC 1's capture logged it pitching with the view). So a held sky stands at
   * eye + R x vector: MP81's plane slides along the view and rises as the view pitches; it never tilts (only the
   * translation is written).
   */
  for (const pitch of [0, 30, -45, 60]) {
    it(`MP81's (0, -220, 0) turns with the camera: pitched ${pitch} deg and turned 35 deg, the plane stands at eye + R x vector`, () => {
      const { world: w } = world([translate({ xyz: [0, -220, 0] }), loop()]);
      const cam = new PerspectiveCamera(49, 1.5, 1, 5000);
      cam.position.set(10, 300, 20);
      cam.rotation.order = 'YXZ';
      cam.rotation.set((pitch * Math.PI) / 180, (35 * Math.PI) / 180, 0);
      cam.updateMatrixWorld();
      w.setCamera([10, 300, 20], cam.matrixWorld.elements);
      w.applyInitial();
      w.step(1 / 60);
      const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const want = [10 - 220 * up.x, 300 - 220 * up.y, 20 - 220 * up.z];
      const got = w.nodeTranslation('worldmodel/sky')!;
      for (let k = 0; k < 3; k++) expect(got[k]!).toBeCloseTo(want[k]!, 6);
      // Looking up 60 degrees: 220 sin 60 = 190.5 ahead, 220 cos 60 = 110 below (the port before: 220 straight below).
      if (pitch === 60) {
        expect(got[1]!).toBeCloseTo(300 - 110, 6);
        expect(Math.hypot(got[0]! - 10, got[2]! - 20)).toBeCloseTo(220 * Math.sin(Math.PI / 3), 6);
      }
    });
  }

  it("M72's (0, 550, 0) the same way, and flag 4's own translation + vector is turned whole (FUN_00310980 takes v)", () => {
    const cam = new PerspectiveCamera(49, 1.5, 1, 5000);
    cam.rotation.order = 'YXZ';
    cam.rotation.set((30 * Math.PI) / 180, 0, 0);
    cam.position.set(0, 0, 0);
    cam.updateMatrixWorld();
    const m72 = world([translate({ xyz: [0, 550, 0] }), loop()]);
    m72.world.setCamera([0, 0, 0], cam.matrixWorld.elements);
    m72.world.applyInitial();
    m72.world.step(1 / 60);
    const t = m72.world.nodeTranslation('worldmodel/sky')!;
    expect(t[1]!).toBeCloseTo(550 * Math.cos(Math.PI / 6), 6);
    expect(t[2]!).toBeCloseTo(550 * Math.sin(Math.PI / 6), 6);                      // behind: up tilts back looking up
    const own = world([translate({ flags: 4, xyz: [1, 0, 0] }), loop()], [5, 6, 7]);
    own.world.setCamera([10, 20, 30], cam.matrixWorld.elements);
    own.world.applyInitial();
    const v = new Vector3(6, 6, 7).applyQuaternion(cam.quaternion);
    const o = own.world.nodeTranslation('worldmodel/sky')!;
    expect(o[0]!).toBeCloseTo(10 + v.x, 6); expect(o[1]!).toBeCloseTo(20 + v.y, 6); expect(o[2]!).toBeCloseTo(30 + v.z, 6);
  });

  /**
   * PROVEN (LATER 1183; research 436 s8): PC 3's memory read of the ORIGINAL (r0004, MP81, 2026-11-18 08:46Z) -- the
   * camera's matrix as read (rows = its x, y, z axes and the eye) and the `skyplane` node's translation at three pitches.
   * The port, handed the same matrix (column-major: the rows become three's columns), stands the plane where the original
   * did, within 0.002 u.
   */
  const MP81_READ: { pose: string; rows: number[][]; sky: number[] }[] = [
    { pose: 'level', rows: [[1, 0.000015, 0.000088], [-0.000001, 0.987227, -0.159319], [-0.000089, 0.159319, 0.987227], [1253.495117, 263.904694, 1256.446777]], sky: [1253.495239, 46.714691, 1291.496704] },
    { pose: 'up', rows: [[1, 0.000148, -0.000085], [0, 0.500737, 0.865599], [0.000170, -0.865599, 0.500737], [1253.495117, 246.790543, 1241.610107]], sky: [1253.495117, 136.629517, 1051.177612] },
    { pose: 'down', rows: [[1, -0.000222, -0.000081], [0, 0.341233, -0.939979], [0.000236, 0.939979, 0.341233], [1253.495117, 274.338043, 1229.383911]], sky: [1253.495117, 199.264938, 1436.178467] },
  ];
  for (const r of MP81_READ) {
    it(`proven: MP81's skyplane at the original's camera matrix, ${r.pose} (PC 3's memory read, within 0.002 u)`, () => {
      const { world: w } = world([translate({ xyz: [0, -220, 0] }), loop()]);
      const m = [...r.rows[0]!, 0, ...r.rows[1]!, 0, ...r.rows[2]!, 0, ...r.rows[3]!, 1];
      w.setCamera([r.rows[3]![0]!, r.rows[3]![1]!, r.rows[3]![2]!], m);
      w.applyInitial();
      w.step(1 / 60);
      const got = w.nodeTranslation('worldmodel/sky')!;
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - r.sky[k]!), `${r.pose} axis ${k}`).toBeLessThan(0.002);
    });
  }

  it('flags 0 (most skies): a turn changes nothing -- eye + R x 0 is the eye', () => {
    const cam = new PerspectiveCamera(49, 1.5, 1, 5000);
    cam.rotation.set(0.7, 1.1, 0, 'YXZ');
    cam.updateMatrixWorld();
    const bare = world([translate({ flags: 0 }), loop()], [5, 6, 7]);
    bare.world.setCamera([10, 20, 30], cam.matrixWorld.elements);
    bare.world.applyInitial();
    bare.world.step(1 / 60);
    expect(bare.world.nodeTranslation('worldmodel/sky')).toEqual([10, 20, 30]);
  });

  it('flags 8 / 0x10 / 0x20 keep the node\'s own X / Y / Z (Sandstorm\'s Y kept, flag 0x10)', () => {
    const { world: w } = world([translate({ flags: 0x11 }), loop()], [0, 75, 0]);
    w.setCamera([10, 300, 20]);
    w.applyInitial();
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toEqual([10, 75, 20]);
    const all = world([translate({ flags: 0x39 }), loop()], [1, 2, 3]);
    all.world.setCamera([10, 300, 20]);
    all.world.applyInitial();
    all.world.step(1 / 60);
    expect(all.world.nodeTranslation('worldmodel/sky')).toEqual([1, 2, 3]);
  });

  it('flags 0 (most skies): no vector, the camera\'s place alone; flag 4 adds the vector to the node\'s own translation first', () => {
    const bare = world([translate({ flags: 0 }), loop()], [5, 6, 7]);
    bare.world.setCamera([10, 20, 30]);
    bare.world.applyInitial();
    bare.world.step(1 / 60);
    expect(bare.world.nodeTranslation('worldmodel/sky')).toEqual([10, 20, 30]);
    const own = world([translate({ flags: 4, xyz: [1, 0, 0] }), loop()], [5, 6, 7]);
    own.world.setCamera([10, 20, 30]);
    own.world.applyInitial();
    expect(own.world.nodeTranslation('worldmodel/sky')).toEqual([16, 26, 37]);
  });

  it('a translate whose reference is not the camera, or none, moves nothing (SCENE_NODE_TRANSFORM_PLACEHOLDER)', () => {
    const placed = world([translate({ ref: 2, xyz: [0, 5, 0] }), loop()], [0, 0, 0], ['post'], { 'worldmodel/post': at([30, 0, 40]) });
    placed.world.setCamera([1, 2, 3]);
    placed.world.applyInitial();
    placed.world.step(1 / 60);
    expect(placed.world.nodeTranslation('worldmodel/sky')).toBeNull();
    expect(placed.moves).toEqual([]);
    const none = world([translate({ ref: 0, flags: 1 }), loop()]);
    none.world.setCamera([1, 2, 3]);
    none.world.applyInitial();
    none.world.step(1 / 60);
    expect(none.moves).toEqual([]);
  });

  it('with no camera given (the room\'s world, a test) a camera translate moves nothing', () => {
    const { world: w, moves } = world([translate(), loop()]);
    w.applyInitial();
    w.step(1 / 60);
    expect(w.nodeTranslation('worldmodel/sky')).toBeNull();
    expect(moves).toEqual([]);
  });

  it('the room\'s world (no autostart programs) moves nothing', () => {
    const { world: w, moves } = world([translate(), loop()]);
    w.runAutostartPrograms = false;
    w.setCamera([1, 2, 3]);
    w.applyInitial();
    w.step(1 / 60);
    expect(moves).toEqual([]);
  });
});

describe('the drawing: a translated node\'s world chunks drawn apart and moved by moveNode (unrendered)', () => {
  const FLAGS = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
  const tri = (over: Partial<LoadedMesh> = {}): LoadedMesh => ({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), uvs: new Float32Array(6),
    colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
    textureName: 'sky.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null, ...over,
  });

  it('the merge keeps a translated path\'s chunks apart, by path', () => {
    const merged = mergeWorld([tri(), tri({ movePath: 'worldmodel/sky' }), tri({ movePath: 'worldmodel/stars' }), tri()], { 'sky.tif': FLAGS }, {});
    expect(merged.map((m) => [m.movePath ?? null, m.positions.length / 3])).toEqual([[null, 6], ['worldmodel/sky', 3], ['worldmodel/stars', 3]]);
  });

  it('moveNode reaches the world chunks at or under a translated path, and only those', () => {
    const map = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, props: [],
      world: [tri({ movePath: 'worldmodel/sky' }), tri({ movePath: 'worldmodel/stars', order: 1, orderEnd: 1 }), tri({ order: 2, orderEnd: 2 })],
      textures: { 'sky.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
      textureFlags: { 'sky.tif': FLAGS }, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {},
      grid: DEFAULT_GRID_PARAMS, collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 }, slots: [],
      diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
    } as unknown as LoadedMap;
    const view = buildWorld(map);
    for (const task of view.revealWorld) task();
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    expect(meshes.length).toBe(3);
    const [sky, stars, still] = meshes as [Mesh, Mesh, Mesh];
    const delta = [...ID];
    delta[12] = 100; delta[13] = 20; delta[14] = -100;
    expect(view.moveNode('worldmodel/sky', delta)).toBe(1);
    expect(sky.position.toArray()).toEqual([100, 20, -100]);
    expect(stars.position.toArray()).toEqual([0, 0, 0]);
    expect(still.position.toArray()).toEqual([0, 0, 0]);
    expect(view.moveNode('worldmodel', delta)).toBe(2);
    expect(still.position.toArray()).toEqual([0, 0, 0]);
  });

  it("a facade under a translated node moves with it: MP71's sun `worldmodel/skydome/flare` with its dome (the review's F1)", () => {
    // The loader sends a world-model node with facade bits to the facade props (`loadMap.ts` `place`): MP53's and MP71's
    // `sunglow.tif` suns (`worldFacadeDisc.test.ts`). Not movable, MP71's dome would slide away from its own sun.
    const map = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
      props: [
        { modelName: 'worldmodel', parts: [tri()], matrices: new Float32Array(at([5, 6, 7])), order: 0, alternate: false, facade: 2, lod: null, paths: ['worldmodel/skydome/flare'] },
        { modelName: 'worldmodel', parts: [tri()], matrices: new Float32Array(at([0, 0, 0])), order: 1, alternate: false, facade: 2, lod: null, paths: ['worldmodel/lamp/flare'] },
      ],
      meta: { motion: { scrolled: [], translated: ['worldmodel/skydome'], frames: new Map() } },
      textures: { 'sky.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
      textureFlags: { 'sky.tif': FLAGS }, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {},
      grid: DEFAULT_GRID_PARAMS, collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 }, slots: [],
      diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
    } as unknown as LoadedMap;
    const view = buildWorld(map);
    for (const task of view.revealProps) task();
    const sun = view.group.children.find((c) => c.userData.nodePath === 'worldmodel/skydome/flare');
    expect(sun).toBeTruthy();
    expect(view.group.children.some((c) => c.userData.nodePath === 'worldmodel/lamp/flare')).toBe(false);
    const delta = [...ID];
    delta[12] = 100; delta[13] = 20; delta[14] = -100;
    expect(view.moveNode('worldmodel/skydome', delta)).toBe(1);
    expect(sun!.position.toArray()).toEqual([105, 26, -93]);
    view.dispose();
  });
});
