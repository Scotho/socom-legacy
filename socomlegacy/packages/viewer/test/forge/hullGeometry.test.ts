import { describe, expect, it } from 'vitest';
import type { LoadedMesh } from '../../src/loadMap';
import { packGround } from '../../src/mover';
import { buildHullWith, climbFlagOf, collisionTypeOf, followersOf, hullGeometryOf, meshOfPolys, moveFollower, twinIndexOf, withCollisionType, withTwins } from '../../src/forge/geometry/hullGeometry';
import type { GeoObject } from '../../src/forge/geometry/world';
import { liveFaces } from '../../src/forge/geometry/editMesh';
import type { Surface } from '../../src/forge/geometry/collision';
import { box } from '../../src/forge/geometry/primitives';
import { transformVerts, translation } from '../../src/forge/geometry/ops';
import { buildHull, geometryOfMap, removeObject, transformObject } from '../../src/forge/geometry/world';

/**
 * Collision editing (the owner, 2026-11-15: "it should be like I was just editing another geometry"; a browser
 * adaptation, FG.R2): the hull as editable objects, a node's polygons an object, each face its polygon's surface words
 * and owner; Build takes an edited object as its node's hull, and leaves every other node as it makes it. Measured on
 * the disc (2026-11-15): every node's object marked edited with nothing changed gives the very ground the disc's hull
 * gives, at 3,600 of 3,600 probes on MP51 and MP72.
 */
const base = { lit: true, order: 1, orderEnd: 1, cull: true, alternate: false, scroll: null, fog: true };
const draw = (positions: number[], nodes: number[]): LoadedMesh => ({
  ...base, textureName: 'a', positions: new Float32Array(positions), uvs: new Float32Array(positions.length / 3 * 2), colors: new Float32Array(positions.length / 3 * 4).fill(1),
  normals: null, faceNormals: null, indices: new Uint32Array([...Array(positions.length / 3).keys()]), triNodes: new Uint16Array(nodes),
});
const grid = { minX: 0, minZ: 0, cellSize: 64, cellsX: 1, cellsZ: 1 } as never;
const map = () => ({
  world: [draw([0, 0, 0, 0, 0, 1, 1, 0, 0], [0]), draw([5, 0, 0, 5, 0, 1, 6, 0, 0], [1])],
  worldNodes: [{ key: 'world:hut#0', name: 'hut' }, { key: 'world:yard#0', name: 'yard' }],
  ownerNodes: [0, 1],
  ground: packGround(grid, [
    { modelName: 'worldmodel', path: 'worldmodel/hut', region: 0, ditype: 3, material: 7, ptcount: 3, cameratype: 0, points: new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0]) },
    { modelName: 'worldmodel', path: 'worldmodel/yard', region: 0, ditype: 2, material: 9, ptcount: 3, cameratype: 0, points: new Float32Array([5, 0, 0, 5, 0, 1, 6, 0, 0]) },
  ], [{ modelName: 'worldmodel', path: 'worldmodel/hut', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/yard', first: 1, count: 1 }]),
});

describe('collision editing: the hull as geometry', () => {
  it('makes an object a node, a face a polygon with its words and owner', () => {
    const g = geometryOfMap(map());
    const hull = hullGeometryOf(g, null)!;
    expect(hull.objects.map((o) => [o.name, o.hullNode])).toEqual([['hut', 0], ['yard', 1]]);
    const face = hull.objects[1]!.mesh.faces[0]!;
    expect(face.surface).toEqual([2, 9, 0, 0, 0]);
    expect(face.owner).toBe(1);
  });

  it('builds the hull read while nothing is edited, and while an object is edited with nothing changed', () => {
    const m = map();
    const g = geometryOfMap(m);
    const hull = hullGeometryOf(g, null)!;
    expect(Array.from(buildHullWith(g, hull)!.points)).toEqual(Array.from(buildHull(g)!.points));
    for (const o of hull.objects) o.manual = true;
    const built = buildHullWith(g, hull)!;
    expect(Array.from(built.fields)).toEqual(Array.from(m.ground.fields));
  });

  it('takes an edited object as its node hull, the other node left as Build makes it', () => {
    const g = geometryOfMap(map());
    const hull = hullGeometryOf(g, null)!;
    const yard = hull.objects[1]!;
    transformVerts(yard.mesh, [0, 1, 2], translation([0, 4, 0]));
    yard.manual = true;
    const built = buildHullWith(g, hull)!;
    expect(Array.from(built.points.subarray(0, 9))).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0]);
    expect(Array.from(built.points.subarray(9, 18))).toEqual([5, 4, 0, 5, 4, 1, 6, 4, 0]);
    expect(built.fields[1 * 6 + 2]).toBe(9);                                   // its material kept
  });

  it('leaves a deleted node no hull, and adds an object made in collision editing', () => {
    const g = geometryOfMap(map());
    const hull = hullGeometryOf(g, null)!;
    removeObject(hull, hull.objects[0]!.id);
    hull.clearedNodes = [0];
    hull.objects.push({ id: 'wall', name: 'Box', kind: 'box', mesh: box([0, 0, 0], [1, 1, 1], { textureName: null, size: () => null, scaleTexel: 1 }) });
    const built = buildHullWith(g, hull)!;
    expect(built.owners.filter((o) => o.count > 0).map((o) => o.path).some((p) => p.startsWith('worldmodel/hut'))).toBe(false);
    expect(built.owners.some((o) => o.path.startsWith('forge/collision/wall'))).toBe(true);
    expect(built.fields.length / 6).toBe(1 + 6);                               // the yard's, and the box's six faces
  });

  it('keeps an edited object over a fresh Build of the drawn geometry when collision editing opens again', () => {
    const g = geometryOfMap(map());
    const was = hullGeometryOf(g, null)!;
    was.objects[0]!.manual = true;
    const again = hullGeometryOf(g, was)!;
    expect(again.objects.find((o) => o.hullNode === 0)).toBe(was.objects[0]);
  });
});

describe('collision types: a face set to floor, wall, pass-through or climbable, as the disc words them', () => {
  const s = [3, 22, 0, 5, 0b11000 | 4] as Surface;                              // a floor, inside and reverb set, climb 4
  it('keeps the material, the region and the flags\' other bits; floor, wall and pass-through clear the climb', () => {
    expect(withCollisionType(s, 'wall')).toEqual([2, 22, 0, 5, 0b11000]);
    expect(withCollisionType(s, 'passthrough')).toEqual([2, 22, 1, 5, 0b11000]);
    expect(withCollisionType(s, 'floor')).toEqual([3, 22, 0, 5, 0b11000]);
  });
  it('climbable sets the climb flag chosen, 1 to 5, the face stood on or not as it was; a ladder (2) a wall, as the disc\'s', () => {
    expect(withCollisionType(s, 'climbable', 5)).toEqual([3, 22, 0, 5, 0b11000 | 5]);
    expect(withCollisionType(withCollisionType(s, 'wall'), 'climbable', 4)).toEqual([2, 22, 0, 5, 0b11000 | 4]);
    expect(withCollisionType(s, 'climbable', 2)).toEqual([2, 22, 0, 5, 0b11000 | 2]);
  });
  it('a climbable or a pass-through made a floor again loses its climb flag and its skip bit', () => {
    expect(withCollisionType(withCollisionType(s, 'climbable', 2), 'floor')).toEqual([3, 22, 0, 5, 0b11000]);
    expect(withCollisionType(withCollisionType(s, 'passthrough'), 'floor')).toEqual([3, 22, 0, 5, 0b11000]);
  });
});

describe('collision types reach a face\'s twins', () => {
  it('a face set takes along every face with its very corners, in any object, wound either way', () => {
    const g = geometryOfMap(map());
    const hull = hullGeometryOf(g, null)!;
    const [hut, yard] = hull.objects as [GeoObject, GeoObject];
    // The yard given the hut's triangle wound the other way: a twin under another node.
    const twin = meshOfPolys([{ points: [[1, 0, 0], [0, 0, 1], [0, 0, 0]], surface: [3, 7, 0, 0, 0] }]);
    yard.mesh = twin;
    const got = withTwins(hull, [{ o: hut, f: 0 }]);
    expect(got.map(({ o }) => o.name).sort()).toEqual(['hut', 'yard']);
  });
});

describe('collision painting: Sample reads a face\'s type back, the twin index finds a face\'s twins', () => {
  it('reads each type withCollisionType writes', () => {
    const s = [3, 22, 0, 5, 4] as Surface;
    for (const t of ['floor', 'wall', 'passthrough', 'climbable'] as const) expect(collisionTypeOf(withCollisionType(s, t))).toBe(t);
    for (const flag of [1, 2, 3, 4, 5]) expect(climbFlagOf(withCollisionType(s, 'climbable', flag))).toBe(flag);
  });
  it('answers a face with its twins as withTwins does', () => {
    const g = geometryOfMap(map());
    const hull = hullGeometryOf(g, null)!;
    const [hut, yard] = hull.objects as [GeoObject, GeoObject];
    yard.mesh = meshOfPolys([{ points: [[1, 0, 0], [0, 0, 1], [0, 0, 0]], surface: [3, 7, 0, 0, 0] }]);
    const twins = twinIndexOf(hull)(hut, 0);
    expect(twins.map(({ o }) => o.name).sort()).toEqual(withTwins(hull, [{ o: hut, f: 0 }]).map(({ o }) => o.name).sort());
  });
});

describe('collision editing on a custom map: a solid object\'s collision edited as a node\'s is', () => {
  // A blank base (`page.ts` `blankGeometryMap`): no read hull, no nodes; its floor and its boxes solid objects.
  const blank = () => {
    const g = geometryOfMap({ world: [], ground: packGround(grid, [], []) } as never);
    g.objects.push({ id: 'floor', name: 'Floor', kind: 'plane', mesh: box([0, 0, 0], [4, 1, 4], { textureName: null, size: () => null, scaleTexel: 1 }), solid: [3, 7, 0, 0, 4] });
    return g;
  };
  it('makes the solid object an editable hull object, a face its collision polygon', () => {
    const g = blank();
    const hull = hullGeometryOf(g, null)!;
    expect(hull.objects.map((o) => [o.name, o.hullOf])).toEqual([['Floor', 'floor']]);
    expect(liveFaces(hull.objects[0]!.mesh).length).toBe(6);                 // a box's hull: its six faces, as drawn
  });
  it('takes the edited object over the hull Build makes from the solid object; untouched, the same hull', () => {
    const g = blank();
    const hull = hullGeometryOf(g, null)!;
    expect(Array.from(buildHullWith(g, hull)!.fields)).toEqual(Array.from(buildHull(g)!.fields));
    const o = hull.objects[0]!;
    o.mesh.faces[0]!.surface = withCollisionType(o.mesh.faces[0]!.surface!, 'passthrough');
    o.manual = true;
    const built = buildHullWith(g, hull)!;
    expect(built.fields.length / 6).toBe(6);
    expect(Array.from({ length: built.fields.length / 6 }, (_, i) => built.fields[i * 6 + 3]).filter((c) => c === 1).length).toBe(1);
  });
  it('a deleted solid object\'s collision leaves it none; a deleted drawn object takes its edited collision with it', () => {
    const g = blank();
    const hull = hullGeometryOf(g, null)!;
    removeObject(hull, hull.objects[0]!.id);
    hull.clearedSolids = ['floor'];
    expect(buildHullWith(g, hull)!.fields.length).toBe(0);
    const again = hullGeometryOf(g, { ...hull, objects: [{ ...hullGeometryOf(g, null)!.objects[0]!, manual: true }], clearedSolids: [] });
    g.objects = [];
    expect(hullGeometryOf(g, again)!.objects.length).toBe(0);
  });
});

describe('C1: a shape\'s edited collision follows the shape when it is moved whole', () => {
  it('finds the edited hull object of a solid object, and of a world node; none for one not edited', () => {
    const g = geometryOfMap(map());
    g.objects.push({ id: 'cube', name: 'Box', kind: 'box', mesh: box([0, 0, 0], [1, 1, 1], { textureName: null, size: () => null, scaleTexel: 1 }), solid: [3, 7, 0, 0, 0] });
    const hull = hullGeometryOf(g, null)!;
    const cubeHull = hull.objects.find((o) => o.hullOf === 'cube')!;
    const hut = g.objects.find((o) => o.group === 0)!;
    expect(followersOf(hull, g.objects.find((o) => o.id === 'cube')!)).toEqual([]);   // not edited: Build follows it already
    cubeHull.manual = true;
    hull.objects.find((o) => o.hullNode === 0)!.manual = true;
    expect(followersOf(hull, g.objects.find((o) => o.id === 'cube')!)).toEqual([cubeHull]);
    expect(followersOf(hull, hut).map((o) => o.hullNode)).toEqual([0]);
  });
  it('moves them with the shape: the built collision where the shape now stands', () => {
    const g = geometryOfMap(map());
    g.objects.push({ id: 'cube', name: 'Box', kind: 'box', mesh: box([0, 0, 0], [1, 1, 1], { textureName: null, size: () => null, scaleTexel: 1 }), solid: [3, 7, 0, 0, 0] });
    const hull = hullGeometryOf(g, null)!;
    const cubeHull = hull.objects.find((o) => o.hullOf === 'cube')!;
    cubeHull.manual = true;
    const cube = g.objects.find((o) => o.id === 'cube')!;
    const mat = translation([10, 0, 0]);
    transformObject(cube, mat);
    for (const f of followersOf(hull, cube)) moveFollower(f, mat);
    const built = buildHullWith(g, hull)!;
    const xs: number[] = [];
    for (let i = 0; i < built.points.length; i += 3) xs.push(built.points[i]!);
    expect(Math.min(...xs.slice(-24))).toBeGreaterThanOrEqual(10);             // the box's six quads, at x 10..11
  });
});
