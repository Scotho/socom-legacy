import { describe, expect, it } from 'vitest';
import { Matrix4, type Mesh } from 'three';
import { buildGrid, DEFAULT_GRID_PARAMS, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Fire } from '../src/fire';
import { GrenadeThrower, THROWABLES } from '../src/grenade';
import { GRENADE_BITMAPS } from '../src/grenadeAssets';
import type { PlaySnapshot } from '../src/walk';
import { MarkClipper } from '../src/markClip';
import { buildWorld, NODE_OFF_MARKS_READING, type WorldView } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';

/**
 * A mark on a door's leaf swings with the leaf (the release review's PL-5; research 92 §6). The game's decal is the hit
 * visual's own: `FUN_003139e0` (213931-213935) hands each visual of the hit node to `FUN_003b3950`, which clips in the
 * node's frame (306470-306483); `FUN_003b3800` (306396-306416) links each kept triangle into that visual's list
 * (`visual + 0x2c`; the list heads, one per part, are made by the loader `FUN_003b2ea0` 306133-306135). Drawn with its
 * node by inference (no draw site cited): so a mark made on a leaf moves with it; one on the world stays.
 */

type V3 = [number, number, number];
const LEAF_PATH = 'worldmodel/door_a/door1=door1/door_slab';
/** The leaf: 10 wide, 20 tall, facing +z, in its own frame; placed with its hinge edge at x = -5, at z = -30. */
const leafPart = (): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 20, 0, 0, 20, 0]), uvs: new Float32Array(8),
  colors: new Float32Array(16).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  textureName: 'door.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
/** The world's own wall at z = -60, x -100..100, y 0..50. */
const wallPart = (): LoadedMesh => ({
  positions: new Float32Array([-100, 0, -60, 100, 0, -60, 100, 50, -60, -100, 50, -60]), uvs: new Float32Array(8),
  colors: new Float32Array(16).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  textureName: 'door.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, world: [wallPart()],
  props: [{ modelName: 'door1', parts: [leafPart()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -5, 10, -30, 1]),
    order: 0, alternate: false, facade: 0, lod: null, paths: [LEAF_PATH] }],
  textures: { 'door.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'door.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
/** The hull: the world's wall and the leaf where it stands (`leafZ`). */
function hull(leafZ: number): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const polys = [quad([-100, 0, -60, 100, 0, -60, 100, 50, -60, -100, 50, -60]), quad([-5, 10, leafZ, 5, 10, leafZ, 5, 30, leafZ, -5, 30, leafZ])];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

function setUp(leafZ = -30) {
  const view: WorldView = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  view.group.updateMatrixWorld(true);
  const grid = hull(leafZ);
  const look = { dir: [0, 0, -1] as V3 };
  const eye: V3 = [0, 20, 0];
  const fire = new Fire({
    grid: () => grid,
    aim: () => ({ eye, far: [eye[0] + look.dir[0] * 1000, eye[1] + look.dir[1] * 1000, eye[2] + look.dir[2] * 1000] }),
    attachToNode: (path, mark) => view.attachToNode(path, mark),
    holdOnNode: (path, gone) => view.holdOnNode(path, gone),
  }, undefined, undefined, () => 0.5);
  fire.setClip(new MarkClipper(view.group));
  const shoot = (dir: V3): Mesh => {
    look.dir = dir;
    fire.update(1);
    expect(fire.shoot()).not.toBeNull();
    const shown = fire.decalMeshes();
    return shown[shown.length - 1]!;
  };
  return { view, fire, shoot };
}

/** A quarter turn about y through the hinge (-5, *, -30), as a column-major delta. */
const TURN = new Matrix4().makeTranslation(-5, 0, -30).multiply(new Matrix4().makeRotationY(Math.PI / 2)).multiply(new Matrix4().makeTranslation(5, 0, 30));
const worldOf = (mesh: Mesh): number[] => { mesh.updateMatrixWorld(true); return mesh.matrixWorld.toArray(); };
const close = (a: number[], b: number[]): void => { a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 5)); };

describe('marks on a door\'s leaf (PL-5, research 92 §6)', () => {
  it('a mark on the leaf follows its swing and comes back with it; a mark on the world wall stays', () => {
    const { view, fire, shoot } = setUp();
    const onLeaf = shoot([0, 0, -1]);
    const onWall = shoot([20 / 60, 0, -1]);                     // past the leaf's edge, onto the wall at z = -60
    expect(fire.state().lastHit!.point[2]).toBeCloseTo(-60, 3);
    expect(fire.marksOnNodes()).toBe(1);
    expect(view.moveNode('worldmodel/door_a', TURN.toArray())).toBe(1);   // the placements moved: the mark rides, uncounted
    close(worldOf(onLeaf), TURN.toArray());
    close(worldOf(onWall), new Matrix4().toArray());
    view.moveNode('worldmodel/door_a', new Matrix4().toArray());
    close(worldOf(onLeaf), new Matrix4().toArray());
  });

  it('a mark made on the leaf while it stands open is carried by the swing since: shut again, it comes with it', () => {
    const slide = new Matrix4().makeTranslation(0, 0, -5);    // the leaf pushed 5 back, the hull with it
    const { view, fire, shoot } = setUp(-35);
    view.moveNode('worldmodel/door_a', slide.toArray());
    view.group.updateMatrixWorld(true);
    const onLeaf = shoot([0, 0, -1]);
    expect(fire.state().lastHit!.point[2]).toBeCloseTo(-35, 3);
    expect(fire.marksOnNodes()).toBe(1);
    close(worldOf(onLeaf), new Matrix4().toArray());          // made where it is: no move yet
    view.moveNode('worldmodel/door_a', new Matrix4().toArray());
    close(worldOf(onLeaf), new Matrix4().makeTranslation(0, 0, 5).toArray());
  });

  it('a new map takes every mark off its node; a recycled mark leaves the node it rode', () => {
    const { view, fire, shoot } = setUp();
    const onLeaf = shoot([0, 0, -1]);
    expect(fire.marksOnNodes()).toBe(1);
    fire.reset();
    expect(fire.marksOnNodes()).toBe(0);
    view.moveNode('worldmodel/door_a', TURN.toArray());
    close(worldOf(onLeaf), new Matrix4().toArray());
  });
});

/**
 * LATER 277 (the owner's playtest list of 2026-10-23: marks hang on shattered windows, ghost doors, the blown bridge and
 * bomb site): a mark is filed in its hit visual's own list (`FUN_003b3800` 306396-306416; research 92 §6), so a node
 * switched off (`setNodeActive`: a pane broken, a bridge or a base blown) takes its marks with it -- removed, the port's
 * `NODE_OFF_MARKS_READING` (`FUN_003b36f0` D:L306328-306347 can free a node's list; whether the switch calls it or only
 * hides the node is unread). Was: a mark followed a moving node only (`attachToNode`), so a hidden
 * node's marks stayed in the air.
 */
describe('LATER 277: a node switched off takes its marks with it', () => {
  it('the leaf switched off: its mark drawn no more, recycled; the world wall\'s mark stays', () => {
    const { view, fire, shoot } = setUp();
    const onLeaf = shoot([0, 0, -1]);
    const onWall = shoot([20 / 60, 0, -1]);
    expect(fire.state().decals).toBe(2);
    expect(view.setNodeActive(LEAF_PATH, false)).toBeGreaterThan(0);
    expect(onLeaf.visible).toBe(false);
    expect(onWall.visible).toBe(true);
    expect(fire.state().decals).toBe(1);
    expect(fire.marksOnNodes()).toBe(0);                          // off the node it rode, too
    // The node back on mid-round: under the reading the mark stays gone. Unread: if the original's switch only hides the
    // node (vtable +0x38, `./world`), the mark shows again. (A round's reset clears every mark anyway: moot there.)
    expect(NODE_OFF_MARKS_READING).toBe('removed');
    view.setNodeActive(LEAF_PATH, true);
    expect(onLeaf.visible).toBe(false);
    expect(fire.state().decals).toBe(1);
  });

  it('a switch above the mark\'s node reaches it (the door\'s root off); a sibling\'s does not', () => {
    const { view, fire, shoot } = setUp();
    const onLeaf = shoot([0, 0, -1]);
    view.setNodeActive('worldmodel/door_b', false);
    expect(onLeaf.visible).toBe(true);
    view.setNodeActive('worldmodel/door_a', false);
    expect(onLeaf.visible).toBe(false);
    expect(fire.state().decals).toBe(0);
  });
});

/**
 * A grenade's scorch on a leaf rides it too (review 2, m-9): `FUN_003b3800` (306396-306416) links the entries of both
 * pools -- the marks' `0x4b5030` and the blast set's `0x4b5050` -- into the hit visual's own list (`visual + 0x2c`).
 * The leaf here lies flat (a trapdoor), so the scorch's column under the grenade meets it.
 */
describe("a scorch on a door's leaf (FUN_003b3800 306396-306416: both pools on the visual's list)", () => {
  const FLAT_PATH = 'worldmodel/door_b/door2=door2/door_slab';
  /** The leaf flat, facing +y: x 0..10, z 0..-10 in its frame; placed at (-5, 10, 5), so x -5..5, z -5..5 at y 10. */
  const flatLeaf = (): LoadedMesh => ({
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 0, -10, 0, 0, -10]), uvs: new Float32Array(8),
    colors: new Float32Array(16).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    textureName: 'door.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
  });
  const flatMap = (): LoadedMap => ({
    ...map(), world: [],
    props: [{ modelName: 'door2', parts: [flatLeaf()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -5, 10, 5, 1]),
      order: 0, alternate: false, facade: 0, lod: null, paths: [FLAT_PATH] }],
  } as LoadedMap);
  const flatHull = (): Grid => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const polys = [quad([-5, 10, 5, 5, 10, 5, 5, 10, -5, -5, 10, -5])];
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    return buildGrid(params, [], [], polys, owners);
  };

  it("rides the leaf's move and comes back with it; a new map takes it off the node", () => {
    const view: WorldView = buildWorld(flatMap());
    for (const task of [...view.revealWorld, ...view.revealProps]) task();
    view.group.updateMatrixWorld(true);
    const grid = flatHull();
    const snap = (): PlaySnapshot => ({
      feet: [0, 10, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
    } as PlaySnapshot);
    let seed = 1;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const g = new GrenadeThrower({
      grid: () => grid, snapshot: snap, view: () => 'third', handPoint: () => [0, 22, 0],
      attachToNode: (path, mark) => view.attachToNode(path, mark),
      holdOnNode: (path, gone) => view.holdOnNode(path, gone),
    }, THROWABLES, random);
    const bitmaps = { [GRENADE_BITMAPS.scorch]: { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(128) } };
    g.setMap(null, { models: [], bitmaps, defaultMaterial: '' });
    g.setClip(new MarkClipper(view.group));
    g.select('Claymore');
    g.pull();
    for (let t = 0; t < 1.5; t += 1 / 60) g.update(1 / 60);
    expect(g.detonateCharges()).toBe(1);
    for (let t = 0; t < 0.1; t += 1 / 60) g.update(1 / 60);
    const scorch = g.scorchMeshes()[0]!;
    expect(scorch).toBeDefined();
    expect(g.scorchesOnNodes()).toBe(1);
    const slide = new Matrix4().makeTranslation(0, 0, -5);
    expect(view.moveNode('worldmodel/door_b', slide.toArray())).toBe(1);
    close(worldOf(scorch), slide.toArray());
    view.moveNode('worldmodel/door_b', new Matrix4().toArray());
    close(worldOf(scorch), new Matrix4().toArray());
    // LATER 277: the scorch's node switched off (a bridge, a base, a pane blown) takes it -- drawn no more, off the node,
    // its permanent pool entries freed: one rule with the marks' (`FUN_003b36f0` D:L306336-306342 frees both together).
    expect(scorch.visible).toBe(true);
    expect(g.stats().scorchTriangles).toBeGreaterThan(0);
    view.setNodeActive(FLAT_PATH, false);
    expect(scorch.visible).toBe(false);
    expect(g.scorchesOnNodes()).toBe(0);
    expect(g.stats().scorchTriangles).toBe(0);
    expect(g.scorchMeshes()).toHaveLength(0);
    g.setMap(null, { models: [], bitmaps, defaultMaterial: '' });
    expect(g.scorchesOnNodes()).toBe(0);
  });
});
