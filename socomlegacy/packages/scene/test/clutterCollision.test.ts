import { describe, expect, it } from 'vitest';
import {
  clutterCollision, IDENTITY, mapCollision, NODE_GENERIC, NODE_MODEL, placeClutter, r0004DropsClutter, worldCollision, collisionOwners,
  type ClutterInstance, type CollisionPoly, type SceneNode,
} from '../src/index';

/**
 * CLT-2 (plan `docs/plans/clutter.md`; research 422; reading, pending review): the clutter the original walks for
 * collision -- `FUN_002d3cf0` over each cell's clutter list (D:L175686-175710), `FUN_002d3030` on the instance's model
 * through the instance's matrix -- carried into the hull. Synthetic graphs; no disc.
 */

function tri(points: number[], material = 7): CollisionPoly {
  return {
    region: 0, refcount: 0x2d, ditype: 2, ptcount: 3, material, cameratype: 0, appflags: 0, inside: 0, shadow: 0, reverbZone: 0,
    points: Float32Array.from(points),
  };
}
function node(name: string, over: Partial<SceneNode> = {}): SceneNode {
  return {
    name, modelName: null, type: NODE_GENERIC, flags: 0x80801071, matrix: Float32Array.from(IDENTITY),
    bbox: new Float32Array(6), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
  };
}
const translate = (x: number, y: number, z: number): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

/** The tree: its root carries one triangle, a child `x` (lifted 10) another. */
function models(): SceneNode[] {
  const child = node('x', { matrix: translate(0, 10, 0), collision: [tri([0, 0, 0, 1, 0, 0, 0, 1, 0], 9)] });
  const tree = node('tree', { type: NODE_MODEL, collision: [tri([1, 0, 0, 0, 2, 0, 0, 0, 3])], children: [child] });
  const floor = node('floor', { collision: [tri([0, 0, 0, 100, 0, 0, 0, 0, 100], 3)] });
  const world = node('worldmodel', { type: NODE_MODEL, children: [floor] });
  return [world, tree];
}
const instance = (modelName: string, matrix: Float32Array): ClutterInstance => ({ modelName, matrix, scaleInverse: 1, dynamic: false, repelMaxAngle: null });

/** 90 degrees about y, row-vector: (x, y, z) -> (z, y, -x), then (10, 0, 0) on. */
const YAW = Float32Array.from([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 0, 0, 1]);
/** 90 degrees about z, row-vector: (x, y, z) -> (-y, x, z): a tilted instance, whose frame is not upright. */
const ROLL = Float32Array.from([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const NOT_AFFINE = Float32Array.from([1, 0, 0, 0.5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const list = (): ClutterInstance[] => [
  instance('tree', translate(100, 5, 200)),   // record 0
  instance('tree', YAW),                      // record 1
  instance('ghost', translate(1, 1, 1)),      // record 2: not in the graph
  instance('tree', NOT_AFFINE),               // record 3: not affine, skipped as the drawing skips it (CLT.R1)
  instance('tree', ROLL),                     // record 4
];

describe('CLT-2: clutterCollision', () => {
  it('carries each placed instance\'s polygons through its matrix, with per-instance owners after firstPoly (CLT.R1-R3)', () => {
    const { polys, owners } = clutterCollision(models(), list(), 50);
    expect(polys).toHaveLength(6);
    expect(owners.map((o) => [o.path, o.first, o.count])).toEqual([
      ['clutter/tree#0', 50, 1], ['clutter/tree#0/x', 51, 1],
      ['clutter/tree#1', 52, 1], ['clutter/tree#1/x', 53, 1],
      ['clutter/tree#4', 54, 1], ['clutter/tree#4/x', 55, 1],
    ]);
    expect(owners.every((o) => o.modelName === 'tree')).toBe(true);
    expect(polys.map((p) => p.path)).toEqual(owners.map((o) => o.path));
    expect(polys.map((p) => p.material)).toEqual([7, 9, 7, 9, 7, 9]);
    // record 0: translated
    expect([...polys[0]!.points]).toEqual([101, 5, 200, 100, 7, 200, 100, 5, 203]);
    expect([...polys[1]!.points]).toEqual([100, 15, 200, 101, 15, 200, 100, 16, 200]);
    // record 1: turned about y, (x, y, z) -> (z + 10, y, -x)
    expect([...polys[2]!.points].map((v) => v + 0)).toEqual([10, 0, -1, 10, 2, 0, 13, 0, 0]);
    // record 4: rolled about z, (x, y, z) -> (-y, x, z); the child's lift of 10 goes to -x
    expect([...polys[4]!.points].map((v) => v + 0)).toEqual([0, 1, 0, -2, 0, 0, 0, 0, 3]);
    expect([...polys[5]!.points].map((v) => v + 0)).toEqual([-10, 0, 0, -10, 1, 0, -11, 0, 0]);
  });

  it('gives a frame only where the composed matrix is not upright, and the node\'s flags', () => {
    const { owners } = clutterCollision(models(), list(), 0);
    expect(owners[0]!.frame).toBeUndefined();          // translated
    expect(owners[2]!.frame).toBeUndefined();          // a yaw about y is upright (`uprightFrame`)
    expect([...owners[4]!.frame!]).toEqual([...ROLL]);
    expect([...owners[5]!.frame!].map((v) => v + 0)).toEqual([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, -10, 0, 0, 1]);
    expect(owners.every((o) => o.flags === 0x80801071 && !o.switchedOff)).toBe(true);
  });

  it('skips a model the graph does not hold and names it', () => {
    const { missing, owners } = clutterCollision(models(), list(), 0);
    expect(missing).toEqual(['ghost']);
    expect(owners.some((o) => o.path.includes('ghost'))).toBe(false);
  });
});

describe('CLT-2: mapCollision -- the worldmodel\'s hull, then the clutter\'s appended (CLT.R2)', () => {
  const zarOf = (): Uint8Array => { throw new Error('no such member'); };

  it('leaves every worldmodel polygon and owner index unchanged and appends the clutter after them', () => {
    const m = models();
    const { polys, owners, notes } = mapCollision(m, 'MP1', () => list());
    const world = worldCollision(m), worldOwners = collisionOwners(m);
    expect(polys.slice(0, world.length)).toEqual(world);
    expect(owners.slice(0, worldOwners.length)).toEqual(worldOwners);
    expect(owners[worldOwners.length]!.path).toBe('clutter/tree#0');
    expect(owners[worldOwners.length]!.first).toBe(world.length);
    expect(polys).toHaveLength(world.length + 6);
    expect(notes).toEqual(['clutter collision: ghost named by CLUTTER.ZAR but not in the scene graph']);
  });

  it('a CLUTTER.ZAR that will not read leaves the worldmodel hull alone, with a note, never a throw', () => {
    const m = models();
    const { polys, owners, notes } = mapCollision(m, 'MP1', () => zarOf() as never);
    expect(polys).toEqual(worldCollision(m));
    expect(owners).toEqual(collisionOwners(m));
    expect(notes).toEqual(['clutter collision: no such member -- the hull holds the worldmodel alone']);
  });
});

describe('CLT-2: r0004 drops Sujo\'s barrel_open at (614, 30, 1134) (r0004 r4 0x2f2108-0x2f2304, research 422 s4)', () => {
  it('on mp61, barrel_open within 1 of the point on every axis: dropped', () => {
    expect(r0004DropsClutter('MP61', 'barrel_open', translate(614, 30, 1134))).toBe(true);
    expect(r0004DropsClutter('MP61', 'barrel_open', translate(614.9, 30.6, 1133.5))).toBe(true);
  });
  it('1.5 away on one axis, another map or another model: kept', () => {
    expect(r0004DropsClutter('MP61', 'barrel_open', translate(615.5, 30, 1134))).toBe(false);
    expect(r0004DropsClutter('MP61', 'barrel_open', translate(614, 31.5, 1134))).toBe(false);
    expect(r0004DropsClutter('MP61', 'barrel_open', translate(614, 30, 1132.5))).toBe(false);
    expect(r0004DropsClutter('MP6', 'barrel_open', translate(614, 30, 1134))).toBe(false);
    expect(r0004DropsClutter('MP1', 'barrel_open', translate(614, 30, 1134))).toBe(false);
    expect(r0004DropsClutter('MP61', 'barrel_closed', translate(614, 30, 1134))).toBe(false);
  });
  it('clutterCollision applies it on the map it is given, keeping the other records\' indices', () => {
    const m = models();
    m[1]!.name = 'barrel_open';
    const two = [instance('barrel_open', translate(614, 30, 1134)), instance('barrel_open', translate(0, 0, 0))];
    expect(clutterCollision(m, two, 0, 'MP61').owners.map((o) => o.path)).toEqual(['clutter/barrel_open#1', 'clutter/barrel_open#1/x']);
    expect(clutterCollision(m, two, 0, 'MP62').owners).toHaveLength(4);
  });
  it('placeClutter takes the same test as its keep filter, so the page draws no barrel it does not collide (CLT.R5)', () => {
    const m = models();
    m[1]!.name = 'barrel_open';
    m[1]!.visuals = 1;                                    // a drawn root, so placeInstances places it
    const two = [instance('barrel_open', translate(614, 30, 1134)), instance('barrel_open', translate(0, 0, 0))];
    const all = placeClutter(m, two).placed;
    const kept = placeClutter(m, two, (c) => !r0004DropsClutter('MP61', c.modelName, c.matrix)).placed;
    expect(all.length).toBeGreaterThan(0);
    expect(kept.length * 2).toBe(all.length);
    expect(kept.every((p) => p.rowMajor[12] === 0)).toBe(true);
  });
});
