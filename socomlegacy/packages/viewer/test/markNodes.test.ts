// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstancedMesh, Matrix4, Mesh, Vector3, type BufferAttribute, type BufferGeometry, type Object3D } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, DEFAULT_GRID_PARAMS, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { DECAL_OFFSET, Fire } from '../src/fire';
import { loadMap, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { MarkClipper, markClipGeometry, markFrame } from '../src/markClip';
import { buildWorld, type WorldView } from '../src/world';

/**
 * OBF-22 (marks left floating on the blown bridge, a blown bomb site, ghost doors once opened and a destroyed object;
 * LATER 277's remaining half). The original marks the hit node's own visuals and files each kept triangle in that
 * visual's list (`FUN_003139e0` D:L213931-213935 per visual of the hit node; `FUN_003b3800` D:L306396-306416), and frees a
 * node's lists with its children's (`FUN_00313620` D:L213798-213827) -- a mark is the scene node's, not the model's.
 * The port keyed a prop's node by its model name and place (`markClip.ts` `entryOf`), so the placements of one model at
 * one place -- a door's root, its slab and its pane (Frostfire's `door1`), a crate's `parts_good/visual`, its
 * `parts_good/shadow` and its `parts_good/dinode` (Desert Glory) -- were one node, and the mark took whichever path was
 * indexed last: a pane's mark filed on the door's root stayed in the air when the pane broke, and a crate's filed on its
 * `parts_good/shadow` (crate06's and crate07's, before the fix) would not be the visual's. And a world chunk the world's state switches (`switchPath`,
 * Desert Glory's `access1/good_parts`) carried no path at all, so its marks were held on nothing.
 */

type V3 = [number, number, number];
const ROOT = 'worldmodel/door_a/door1=door1';
const SLAB = `${ROOT}/door_slab`;
const PANE = `${SLAB}/pane1`;
const CHUNK = 'worldmodel/access1/good_parts';

const quadPart = (positions: number[], world = false): LoadedMesh => ({
  positions: new Float32Array(positions), uvs: new Float32Array(8), colors: new Float32Array(16).fill(1), normals: null,
  faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), textureName: 'door.tif', fog: true, lit: false, order: 0,
  orderEnd: 0, cull: !world, alternate: false, scroll: null,
});
/** A quad facing +z in the xy plane: x0..x1, y0..y1, at z. */
const face = (x0: number, x1: number, y0: number, y1: number, z = 0): number[] => [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z];
/** The world's own wall at z = -60, x -100..100, y 0..50. */
const WALL = face(-100, 100, 0, 50, -60);
const PLACE = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -5, 10, -30, 1]);
const prop = (path: string, positions: number[]) => ({
  modelName: 'door1', parts: [quadPart(positions)], matrices: PLACE, order: 0, alternate: false, facade: 0, lod: null, paths: [path],
});

const base = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, world: [quadPart(WALL, true)], props: [],
  textures: { 'door.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'door.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

/** One model, three placements at one place (Frostfire's `door1`): the root's lintel, the slab (left), the pane (right). */
const doorMap = (): LoadedMap => ({
  ...base(),
  props: [prop(ROOT, face(0, 10, 20, 25)), prop(SLAB, face(0, 5, 0, 20)), prop(PANE, face(5, 10, 0, 20))],
} as LoadedMap);
/** A world chunk the world's state switches (`switchPath`), x -5..5, y 10..30 at z = -30, before the world's wall. */
const chunkMap = (): LoadedMap => ({
  ...base(),
  world: [quadPart(WALL, true), { ...quadPart(face(-5, 5, 10, 30, -30), true), switchPath: CHUNK }],
} as LoadedMap);

const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function hull(): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const polys = [quad(WALL), quad(face(-5, 5, 10, 35, -30))];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

function setUp(map: LoadedMap) {
  const view: WorldView = buildWorld(map);
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  view.group.updateMatrixWorld(true);
  const grid = hull();
  const look = { dir: [0, 0, -1] as V3 };
  const eye: V3 = [0, 20, 0];
  const fire = new Fire({
    grid: () => grid,
    aim: () => ({ eye, far: [eye[0] + look.dir[0] * 1000, eye[1] + look.dir[1] * 1000, eye[2] + look.dir[2] * 1000] }),
    attachToNode: (path, mark) => view.attachToNode(path, mark),
    holdOnNode: (path, gone) => view.holdOnNode(path, gone),
  }, undefined, undefined, () => 0.5);
  fire.setClip(new MarkClipper(view.group));
  /** A round at `x` across the plane z = -30 (or past it, on the wall at z = -60). */
  const shoot = (x: number, z = -30): Mesh => {
    look.dir = [x / -z, 0, -1];
    fire.update(1);
    expect(fire.shoot()).not.toBeNull();
    expect(fire.state().lastHit!.point[2]).toBeCloseTo(z, 3);
    const shown = fire.decalMeshes();
    return shown[shown.length - 1]!;
  };
  return { view, fire, shoot };
}

describe('OBF-22: a mark is its scene node\'s, not its model\'s', () => {
  it('a pane broken takes the pane\'s mark and leaves the slab\'s, though one model draws both at one place', () => {
    const { view, fire, shoot } = setUp(doorMap());
    const onSlab = shoot(-2.5);
    const onPane = shoot(2.5);
    expect(fire.state().decals).toBe(2);
    view.setNodeActive(PANE, false);
    expect(onPane.visible).toBe(false);
    expect(onSlab.visible).toBe(true);
    expect(fire.state().decals).toBe(1);
    view.setNodeActive(SLAB, false);
    expect(onSlab.visible).toBe(false);
    expect(fire.state().decals).toBe(0);
  });

  it('the slab switched off takes the pane\'s mark too (a child node); the root\'s swing carries both', () => {
    const { view, shoot } = setUp(doorMap());
    const onSlab = shoot(-2.5);
    const onPane = shoot(2.5);
    const turn = new Matrix4().makeTranslation(0, 0, -5);
    expect(view.moveNode('worldmodel/door_a', turn.toArray())).toBe(3);
    for (const m of [onSlab, onPane]) { m.updateMatrixWorld(true); expect(m.matrixWorld.elements[14]).toBeCloseTo(-5, 5); }
    view.setNodeActive(SLAB, false);
    expect(onSlab.visible).toBe(false);
    expect(onPane.visible).toBe(false);
  });

  it('a world chunk the world\'s state switches holds its marks; the world\'s own wall beside it keeps its', () => {
    const { view, fire, shoot } = setUp(chunkMap());
    const onChunk = shoot(0);
    const onWall = shoot(20, -60);                              // past the chunk's edge, onto the wall
    expect(fire.state().decals).toBe(2);
    view.setNodeActive('worldmodel/access1', false);            // a switch above the chunk's path (a base blown)
    expect(onChunk.visible).toBe(false);
    expect(onWall.visible).toBe(true);
    expect(fire.state().decals).toBe(1);
  });
});

/**
 * On the game's own maps (the fixtures; skipped -- and said so -- without them): a mark clipped square onto a placement's
 * largest triangle reports that placement's own path -- Frostfire's three door panes (the slab and the door's root are
 * the same model at the same place), Desert Glory's crates (`parts_good/visual` beside `parts_good/shadow` and `parts_good/dinode`,
 * one model at one place) and its `access1/good_parts` world chunk (MAP-02's switch path).
 */
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const ABSENT = fixture('RUN/MP2.ZDB') === null || fixture('RUN/MP6.ZDB') === null;
/** Each case alone (its review, 2026-10-30): the map, and the placements whose marks must report their own path. */
const CASES: { name: string; stem: string; paths: string[] }[] = [
  { name: "MP2: Frostfire's three door panes", stem: 'MP2',
    paths: ['worldmodel/bdoor_4/door1=door1/door_slab/pane1', 'worldmodel/wdoor_1/door1=door1/door_slab/pane1', 'worldmodel/wdoor_2/door1=door1/door_slab/pane1'] },
  { name: "MP6: Desert Glory's crates (`parts_good/visual`)", stem: 'MP6', paths: [
    'worldmodel/crate02/mp6_boxbig1=mp6_boxbig1/parts_good/visual', 'worldmodel/crate06/mp6_crate_wstraps=mp6_crate_wstraps/parts_good/visual',
    'worldmodel/crate03/mp6_boxbig2=mp6_boxbig2/parts_good/visual', 'worldmodel/crate07/mp6_cratebox1=mp6_cratebox1/parts_good/visual',
  ] },
  { name: "MP6: Desert Glory's `access1/good_parts` world chunk (its switch path)", stem: 'MP6', paths: [CHUNK] },
];

/** Each drawn placement of `path`: its geometry and its world matrix (a mesh's, or an instance's under it). */
function placements(group: Object3D, path: string): { geometry: BufferGeometry; matrix: Matrix4 }[] {
  const out: { geometry: BufferGeometry; matrix: Matrix4 }[] = [];
  group.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return;
    if (o instanceof InstancedMesh) {
      ((o.userData.nodePaths as string[] | undefined) ?? []).forEach((p, i) => {
        if (p !== path) return;
        const m = new Matrix4();
        o.getMatrixAt(i, m);
        out.push({ geometry: o.geometry, matrix: m.premultiply(o.matrixWorld) });
      });
    } else if (o.userData.nodePath === path || o.userData.switchPath === path) out.push({ geometry: o.geometry, matrix: o.matrixWorld.clone() });
  });
  return out;
}

/** The largest triangle of a placement, in world space: its centre and its face normal (the clipper's winding rule). */
function largest(geometry: BufferGeometry, matrix: Matrix4): { centre: V3; normal: V3 } {
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const idx = geometry.getIndex();
  const tris = (idx ? idx.count : pos.count) / 3;
  const flip = matrix.determinant() < 0 ? -1 : 1;
  let best = { area: -1, centre: [0, 0, 0] as V3, normal: [0, 0, 1] as V3 };
  const v = [new Vector3(), new Vector3(), new Vector3()];
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) v[k]!.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(matrix);
    const n = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
    const area = n.length();
    if (area <= best.area) continue;
    n.multiplyScalar(flip / area);
    const c = v[0]!.clone().add(v[1]!).add(v[2]!).divideScalar(3);
    best = { area, centre: [c.x, c.y, c.z], normal: [n.x, n.y, n.z] };
  }
  return best;
}

describe.skipIf(ABSENT)(`OBF-22 on the maps: a mark reports its own placement's path${ABSENT ? ' (no fixtures -- skipped)' : ''}`, () => {
  for (const { name, stem, paths } of CASES) {
    it(name, async () => {
      const view = buildWorld(await loadMap(new FsAssetSource(FIXTURES), `RUN/${stem}.ZDB`));
      for (const task of [...view.revealWorld, ...view.revealProps]) task();
      view.group.updateMatrixWorld(true);
      const clipper = new MarkClipper(view.group);
      // Every placement's reported path gathered first, so a failure names them all.
      const got: Record<string, (string | null)[]> = {}, want: Record<string, string[]> = {};
      for (const path of paths) {
        const found = placements(view.group, path);
        expect(found.length, path).toBeGreaterThan(0);
        got[path] = []; want[path] = [];
        for (const { geometry, matrix } of found) {
          const { centre, normal } = largest(geometry, matrix);
          const kept = clipper.clip(markFrame(centre, normal, [-normal[0], -normal[1], -normal[2]], 1), markClipGeometry(), DECAL_OFFSET);
          expect(kept, path).toBeGreaterThan(0);
          got[path]!.push(clipper.lastNodePath);
          want[path]!.push(path);
        }
      }
      expect(got).toEqual(want);
    }, 300000);
  }
});
