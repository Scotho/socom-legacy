import { describe, expect, it } from 'vitest';
import {
  buildGrid, clutterCollision, clutterFiled, collisionOwners, IDENTITY, movedWalk, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, segmentHits,
  worldCollision, ALL_LAYERS, NODE_BOX_FREE, type ClutterInstance, type CollisionOwner, type CollisionPoly, type GridParams, type SceneNode,
  type WorldPoly,
} from '../src/index';

/**
 * LATER 1094 (research 430 s8; the review of fc0cb0622b, S3): the production code that gives each owner its walk -- the
 * node chain and the filing -- on synthetic graphs, no disc. `collisionOwners` (the worldmodel's children are the filed
 * nodes; an instance node and its realised model root are one node, `INSTANCE_NODE_BOX_READING`), `clutterCollision`
 * (the master root on the chain, the instance's matrix through every frame, filed by `clutterFiled` and the cover rule),
 * and `movedWalk` (a Forge copy).
 */

function tri(points: number[]): CollisionPoly {
  return { region: 0, refcount: 0x2d, ditype: 2, ptcount: 3, material: 7, cameratype: 0, appflags: 0, inside: 0, shadow: 0, reverbZone: 0, points: Float32Array.from(points) };
}
function node(name: string, over: Partial<SceneNode> = {}): SceneNode {
  return {
    name, modelName: null, type: NODE_GENERIC, flags: 0x80801071, matrix: Float32Array.from(IDENTITY),
    bbox: new Float32Array(6), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
  };
}
const translate = (x: number, y: number, z: number): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const box = (...v: number[]): Float32Array => Float32Array.from(v);
const TRI = [0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('LATER 1094: each owner\'s walk, as the production code builds it', () => {
  it('collisionOwners: the chain runs from the world\'s child down to the owner; the root is not on it; filed by the child\'s box', () => {
    const b = node('b', { matrix: translate(0, 2, 0), bbox: box(-1, 0, -1, 1, 1, 1), collision: [tri(TRI)] });
    const free = node('f', { flags: (0x80801071 | NODE_BOX_FREE) >>> 0, bbox: box(0, 0, 0, 1, 1, 1), collision: [tri(TRI)] });
    const a = node('a', { matrix: translate(100, 0, 0), bbox: box(-5, 0, -5, 5, 10, 5), children: [b, free] });
    const world = node('worldmodel', { type: NODE_MODEL, bbox: box(-999, -999, -999, 999, 999, 999), children: [a] });
    const owners = collisionOwners([world]);
    const ob = owners.find((o) => o.path === 'worldmodel/a/b')!, of = owners.find((o) => o.path === 'worldmodel/a/f')!;
    expect(ob.nodes!.map((n) => n.bbox)).toEqual([a.bbox, b.bbox]);
    expect(Array.from(ob.nodes![0]!.world)).toEqual(Array.from(translate(100, 0, 0)));
    expect(Array.from(ob.nodes![1]!.world)).toEqual(Array.from(translate(100, 2, 0)));
    expect(ob.filed).toEqual({ minX: 95, minZ: -5, maxX: 105, maxZ: 5 });
    expect(ob.nodes!.some((n) => n.free)).toBe(false);
    expect(of.nodes!.map((n) => n.free ?? false)).toEqual([false, true]);
  });

  it('collisionOwners: an instance node and its realised model root are ONE node, the instance node\'s (INSTANCE_NODE_BOX_READING)', () => {
    const c = node('c', { matrix: translate(0, 1, 0), bbox: box(-1, 0, -1, 1, 1, 1), collision: [tri(TRI)] });
    const proto = node('proto', { type: NODE_MODEL, bbox: box(-9, -9, -9, 9, 9, 9), collision: [tri(TRI)], children: [c] });
    const x = node('X', { type: NODE_INSTANCE, modelName: 'proto', matrix: translate(50, 0, 0), bbox: box(-3, 0, -3, 3, 3, 3) });
    const world = node('worldmodel', { type: NODE_MODEL, children: [x] });
    const owners = collisionOwners([world, proto]);
    const root = owners.find((o) => o.path === 'worldmodel/X=proto')!, child = owners.find((o) => o.path === 'worldmodel/X=proto/c')!;
    expect(root.nodes!.map((n) => n.bbox)).toEqual([x.bbox]);
    expect(child.nodes!.map((n) => n.bbox)).toEqual([x.bbox, c.bbox]);
    expect(Array.from(child.nodes![0]!.world)).toEqual(Array.from(translate(50, 0, 0)));
    expect(child.filed).toEqual({ minX: 47, minZ: -3, maxX: 53, maxZ: 3 });
  });

  it('clutterCollision: the master root on the chain, every frame through the instance\'s matrix; filed unturned, scaled, by the cover rule', () => {
    const x = node('x', { matrix: translate(0, 10, 0), bbox: box(0, 0, 0, 1, 1, 1), collision: [tri(TRI)] });
    const tree = node('tree', { type: NODE_MODEL, bbox: box(-1, 0, -2, 1, 3, 2), collision: [tri(TRI)], children: [x] });
    const world = node('worldmodel', { type: NODE_MODEL });
    // Turned a quarter about y, scaled 2 (scale_inverse 0.5), at (100, 5, 200).
    const m = Float32Array.from([0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 100, 5, 200, 1]);
    const inst: ClutterInstance = { modelName: 'tree', matrix: m, scaleInverse: 0.5, dynamic: false, repelMaxAngle: null };
    const { owners } = clutterCollision([world, tree], [inst], 0);
    const root = owners.find((o) => o.path === 'clutter/tree#0')!, child = owners.find((o) => o.path === 'clutter/tree#0/x')!;
    expect(root.nodes!.map((n) => n.bbox)).toEqual([tree.bbox]);
    expect(Array.from(root.nodes![0]!.world)).toEqual(Array.from(m));
    expect(child.nodes!.map((n) => n.bbox)).toEqual([tree.bbox, x.bbox]);
    expect(child.nodes![1]!.world[13]).toBe(25);                                // (0, 10, 0) through m: y 5 + 2 x 10
    // FUN_002d55c0: the corners x 2, plus the translation, NOT turned: x 98..102, z 196..204.
    expect(root.filed).toEqual({ minX: 98, minZ: 196, maxX: 102, maxZ: 204 });
    expect(clutterFiled(tree.bbox, m, 0.5)).toEqual(root.filed);
    expect(root.filedByCover).toBe(true);
  });

  it('the cover rule files a clutter box edge 5e-5 under a cell\'s edge into that next cell; the grid insert does not (the review\'s N2)', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    // A wall at x 150 (cell 3), filed by a box whose x maximum is 99.99995: by FUN_002d6c40's +0.0001 that is cell 3.
    const wall: WorldPoly = { modelName: 'clutter', path: 'clutter/w#0', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([150, 0, -50, 150, 0, 50, 150, 50, 50, 150, 50, -50]) };
    const filed = { minX: 50, minZ: -50, maxX: 99.99995, maxZ: 50 };
    const owner = (cover: boolean): CollisionOwner => ({ modelName: 'clutter', path: 'clutter/w#0', first: 0, count: 1, filed, ...(cover ? { filedByCover: true as const } : {}) });
    const a: [number, number, number] = [140, 20, 10], b: [number, number, number] = [170, 20, 10];
    expect(segmentHits(buildGrid(params, [], [], [wall], [owner(true)]), a, b, undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    expect(segmentHits(buildGrid(params, [], [], [wall], [owner(false)]), a, b, undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
  });

  it('movedWalk: a Forge copy\'s chain is its template\'s moved by the copy\'s matrix, and filed where it stands (the review\'s B1)', () => {
    const template: CollisionOwner = {
      modelName: 'worldmodel', path: 'worldmodel/gate', first: 0, count: 1,
      nodes: [{ bbox: box(-2, 0, -2, 2, 4, 2), world: translate(1, 0, 0) }], filed: { minX: -1, minZ: -2, maxX: 3, maxZ: 2 },
    };
    const moved = movedWalk(template, translate(500, 0, 300));
    expect(Array.from(moved.nodes![0]!.world)).toEqual(Array.from(translate(501, 0, 300)));
    expect(moved.filed).toEqual({ minX: 499, minZ: 298, maxX: 503, maxZ: 302 });
    expect(movedWalk({ modelName: 'worldmodel', path: 'p', first: 0, count: 1 }, translate(1, 2, 3))).toEqual({});
    // Through the walk: a copy's wall at x 510 is met where the copy stands, by a line beside it.
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 20, cellsZ: 20, originX: -1000, originZ: -1000 };
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/gate', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([502, 0, 298, 502, 0, 302, 502, 4, 302, 502, 4, 298]) };
    const copy: CollisionOwner = { ...template, ...moved };
    const g = buildGrid(params, [], [], [wall], [copy]);
    expect(segmentHits(g, [499, 2, 300], [505, 2, 300], undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    const stale = buildGrid(params, [], [], [wall], [template]);                // the template's chain and filing, unmoved
    expect(segmentHits(stale, [499, 2, 300], [505, 2, 300], undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
  });

  it('FORGE_COPY_POLY_CELLS_ADAPTATION: a copy turned 45 degrees is found in its polygons\' cells, where its filed box does not reach (the second review\'s F1)', () => {
    // The second review's input: the template's first node box (-50,0,-5)-(50,30,5), a wall along x -50..50 at z 0; the copy
    // turned 45 degrees about y and placed at (500, 0, 33), on 180-unit cells from -1800.
    const c = Math.SQRT1_2;
    const m = Float32Array.from([c, 0, -c, 0, 0, 1, 0, 0, c, 0, c, 0, 500, 0, 33, 1]);   // row vectors: x' = x c + z c, z' = -x c + z c
    const at = (x: number, y: number, z: number): number[] => [x * c + z * c + 500, y, -x * c + z * c + 33];
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/barrier', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([...at(-50, 0, 0), ...at(50, 0, 0), ...at(50, 30, 0), ...at(-50, 30, 0)]) };
    const template: CollisionOwner = { modelName: 'worldmodel', path: 'worldmodel/barrier', first: 0, count: 1, nodes: [{ bbox: box(-50, 0, -5, 50, 30, 5), world: Float32Array.from(IDENTITY) }] };
    const moved = movedWalk(template, m);
    expect(moved.filedWithPolys).toBe(true);
    expect(moved.filed!.minZ).toBeGreaterThan(0);                                // the two corners' box: z 1.18..64.82, row 10 only
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 180, cellsX: 20, cellsZ: 20, originX: -1800, originZ: -1800 };
    const a: [number, number, number] = [529, 10, -1.5], b: [number, number, number] = [539, 10, -1.5];   // row 9: the wall's end only
    const copy: CollisionOwner = { ...template, ...moved };
    // LATER 1252: crossed from the wall's front (b to a), the one blast mode being one-sided (was 'blast-scene', two-sided).
    expect(segmentHits(buildGrid(params, [], [], [wall], [copy]), b, a, undefined, ALL_LAYERS, 'blast')).toHaveLength(1);
    const { filedWithPolys: _w, ...narrow } = copy;                             // the filed box alone: the line misses it
    expect(segmentHits(buildGrid(params, [], [], [wall], [narrow]), b, a, undefined, ALL_LAYERS, 'blast')).toHaveLength(0);
  });

  it('the world\'s polygons and the owners agree on first and count with the chain added (worldCollision order unchanged)', () => {
    const b = node('b', { collision: [tri(TRI), tri(TRI)] });
    const world = node('worldmodel', { type: NODE_MODEL, children: [node('a', { children: [b] })] });
    const owners = collisionOwners([world]);
    expect(owners.map((o) => [o.first, o.count])).toEqual([[0, 2]]);
    expect(worldCollision([world])).toHaveLength(2);
  });
});
