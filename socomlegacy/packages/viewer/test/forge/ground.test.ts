import { describe, expect, it } from 'vitest';
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { probeGround } from '@s2u/scene';
import { groundGrid, groundPolygons, packGround } from '../../src/mover';
import type { LoadedMap } from '../../src/loadMap';
import { floorGround, layoutGround, prototypePolygons, standingSpot } from '../../src/forge/ground';

/**
 * FORGE play (a browser adaptation, no original): the walk stands on the base's own hull, plus each piece's own
 * collision polygons -- the disc's, lifted from a placement the archive's map makes and carried to the piece's matrix.
 */
const grid = { atomCount: 8192, posts: 16, cellDim: 640, cellsX: 4, cellsZ: 4, originX: -1280, originZ: -1280 };
/** A crate's top, 20 units square at y = 10 in its model space, ground (ditype 3). */
const top = (dx: number, dz: number, y: number) => new Float32Array([dx - 10, y, dz - 10, dx + 10, y, dz - 10, dx + 10, y, dz + 10, dx - 10, y, dz + 10]);
const poly = (modelName: string, path: string, points: Float32Array) =>
  ({ modelName, path, region: 0, ditype: 3, material: 0, ptcount: points.length / 3, cameratype: 0, points });
/** A map that places `crate` once at (100, 0, 200), its hull's polygon in world space there. */
const translate = (x: number, y: number, z: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const map = {
  archive: 'MP2', grid,
  props: [{ modelName: 'crate', parts: [{}], matrices: translate(100, 0, 200), order: 0, alternate: false, facade: 0, lod: null, paths: ['worldmodel/crate_3'] }],
  ground: packGround(grid, [poly('crate', 'worldmodel/crate_3', top(100, 200, 10))], [{ modelName: 'crate', path: 'worldmodel/crate_3', first: 0, count: 1 }]),
} as unknown as LoadedMap;

describe('FORGE play: where Play stands with no marker', () => {
  const g = layoutGround(floorGround(1000), []);
  it('the floor under the first point that has one, below the camera', () => {
    expect(standingSpot(groundGrid(g), g, [[5000, 5000], [100, 200]], 300)).toEqual([100, 0, 200]);
    expect(standingSpot(groundGrid(g), g, [[100, 200]], -10)).toEqual([0, 0, 0]);        // none below: the hull's own
  });
  it('else the centre of the hull’s first ground polygon; null with no ground', () => {
    expect(standingSpot(groundGrid(g), g, [[9000, 9000]])).toEqual([0, 0, 0]);
    const walls = packGround(g.grid, [{ ...poly('w', 'w', top(0, 0, 5)), ditype: 2 }], [{ modelName: 'w', path: 'w', first: 0, count: 1 }]);
    expect(standingSpot(groundGrid(walls), walls, [[0, 0]])).toBeNull();
  });
});

describe('FORGE play: the ground', () => {
  it('the blank floor is one ground polygon at y = 0 the probe stands on anywhere inside it', () => {
    const g = floorGround(2000);
    const hits = probeGround(groundGrid(g), 300, -700);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.y).toBeCloseTo(0);
  });

  it('a prototype\'s polygons come back in its model space, from the placement that owns them', () => {
    const polys = prototypePolygons(map, 'crate')!;
    expect(polys).toHaveLength(1);
    expect([...polys[0]!.points]).toEqual([...top(0, 0, 10)]);
    expect(prototypePolygons(map, 'tank')).toBeNull();
  });

  it('takes the polygons a child node of the placement carries (a prototype’s di below its instance node)', () => {
    const child = {
      ...map,
      ground: packGround(grid, [poly('crate_col', 'worldmodel/crate_3/col', top(100, 200, 10))], [{ modelName: 'crate_col', path: 'worldmodel/crate_3/col', first: 0, count: 1 }]),
    } as unknown as LoadedMap;
    expect([...prototypePolygons(child, 'crate')![0]!.points]).toEqual([...top(0, 0, 10)]);
  });

  it('shares out the owners of a path every placement names, in walk order: the first placement takes the first share', () => {
    const P = 'worldmodel/crate=crate';
    const twice = {
      ...map,
      props: [{ ...map.props[0]!, matrices: new Float32Array([...translate(100, 0, 200), ...translate(-300, 0, 0)]), paths: [P, P] }],
      ground: packGround(grid, [poly('crate', `${P}/climb`, top(100, 200, 10)), poly('crate', `${P}/climb`, top(-300, 0, 10))],
        [{ modelName: 'crate', path: `${P}/climb`, first: 0, count: 1 }, { modelName: 'crate', path: `${P}/climb`, first: 1, count: 1 }]),
    } as unknown as LoadedMap;
    const polys = prototypePolygons(twice, 'crate')!;
    expect(polys).toHaveLength(1);
    expect([...polys[0]!.points]).toEqual([...top(0, 0, 10)]);
  });

  it('FG-31: takes the walk\'s first placement\'s share, carried by that placement\'s matrix, whichever draw entry holds it', () => {
    const P = 'worldmodel/crate=crate';
    const split = {
      ...map,
      props: [
        { ...map.props[0]!, matrices: translate(-300, 0, 0), paths: [P], walk: [5] },
        { ...map.props[0]!, matrices: translate(100, 0, 200), paths: [P], walk: [2], order: 1 },
      ],
      ground: packGround(grid, [poly('crate', `${P}/climb`, top(100, 200, 10)), poly('crate', `${P}/climb`, top(-300, 0, 10))],
        [{ modelName: 'crate', path: `${P}/climb`, first: 0, count: 1 }, { modelName: 'crate', path: `${P}/climb`, first: 1, count: 1 }]),
    } as unknown as LoadedMap;
    const polys = prototypePolygons(split, 'crate')!;
    expect(polys).toHaveLength(1);
    expect([...polys[0]!.points]).toEqual([...top(0, 0, 10)]);
  });

  it('a layout\'s ground is the base\'s plus each piece\'s polygons at its matrix, owned by the piece', () => {
    const g = layoutGround(floorGround(2000), [{ owner: 'piece 0', polys: prototypePolygons(map, 'crate')!, m: [...translate(-500, 5, 40)] }]);
    expect(groundPolygons(g)).toHaveLength(2);
    expect(g.owners.at(-1)).toMatchObject({ modelName: 'crate', path: 'piece 0', count: 1 });
    const hits = probeGround(groundGrid(g), -500, 40).map((h) => h.y).sort((a, b) => b - a);
    expect(hits[0]).toBeCloseTo(15);                       // the crate's top, 10 over its origin at y = 5
    expect(hits[1]).toBeCloseTo(0);                        // the floor under it
  });
});

/**
 * LATER 146 (research 313 section 8.10; reading, pending review): a piece's collision owner carries its collider's frame,
 * as LATER 142's hull does (`CollisionOwner.frame`, the climb's column and cut, `../../src/climb` `contactOf`): the
 * piece's matrix composed with the polygon's frame in its prototype's model space (`prototypePolygons`' `frame`, the
 * base owner's frame carried back through the placement's matrix). Upright by structure, never by a tolerance: no frame
 * when the piece turns about y alone (`uprightFrame` on its stored matrix -- three's `compose` leaves the four off-axis
 * terms exactly 0 when the quaternion's x and z are) and its polygons' model-space frame is absent.
 */
describe('LATER 146: a forge piece carries its collider frame', () => {
  const tilt = (axis: [number, number, number], deg: number, at: [number, number, number]): number[] => {
    const o = new Object3D();
    o.quaternion.setFromAxisAngle(new Vector3(...axis), (deg * Math.PI) / 180);
    o.position.set(...at);
    o.updateMatrix();
    return Array.from(o.matrix.elements);
  };
  const near = (a: ArrayLike<number> | undefined, b: ArrayLike<number>): void => {
    expect(a).toBeDefined();
    for (let i = 0; i < 16; i++) expect(a![i]!).toBeCloseTo(b[i]!, 5);
  };
  const piece = (m: number[], from = map) => layoutGround(floorGround(2000), [{ owner: 'piece 0', polys: prototypePolygons(from, 'crate')!, m }]);

  it('a piece tilted about x carries its own matrix as its frame (the owner is the placement node: its model-space frame is the identity)', () => {
    const m = tilt([1, 0, 0], 10, [-500, 5, 40]);
    const g = piece(m);
    near(g.owners.at(-1)!.frame, m);
    near(groundPolygons(g).at(-1)!.frame, m);
  });

  it('a piece turned about y alone through three\'s own API carries none: its off-axis terms are exactly 0', () => {
    const m = tilt([0, 1, 0], 37, [-500, 5, 40]);
    expect([m[1], m[4], m[6], m[9]]).toEqual([0, 0, 0, 0]);
    const turned = new Object3D();
    turned.matrix.fromArray(m).decompose(turned.position, turned.quaternion, turned.scale);
    turned.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4));
    turned.updateMatrix();
    const e = turned.matrix.elements;
    expect([e[1], e[4], e[6], e[9]]).toEqual([0, 0, 0, 0]);                         // a gizmo turn about y, premultiplied
    expect(piece(m).owners.at(-1)!.frame).toBeUndefined();
    expect(piece(Array.from(e)).owners.at(-1)!.frame).toBeUndefined();
  });

  /** The crate placed upright at (100, 0, 200), its di on a child node tilted 5 degrees about z, and an upright child. */
  const C = tilt([0, 0, 1], 5, [100, 0, 200]);
  const P = 'worldmodel/crate_3';
  const child = {
    ...map,
    ground: packGround(grid, [poly('crate', `${P}/col`, top(100, 200, 10)), poly('crate', `${P}/col`, top(100, 200, 12)), poly('crate', `${P}/lid`, top(100, 200, 14))],
      [{ modelName: 'crate', path: `${P}/col`, first: 0, count: 2, frame: Float32Array.from(C) }, { modelName: 'crate', path: `${P}/lid`, first: 2, count: 1 }]),
  } as unknown as LoadedMap;
  const L = new Matrix4().fromArray(translate(100, 0, 200)).invert().multiply(new Matrix4().fromArray(C)).elements;

  it("prototypePolygons gives each polygon its frame in the prototype's model space, never the base placement's world frame", () => {
    const polys = prototypePolygons(child, 'crate')!;
    near(polys[0]!.frame, L);
    near(polys[1]!.frame, L);
    expect(polys[2]!.frame).toBeUndefined();
    expect(prototypePolygons(map, 'crate')![0]!.frame).toBeUndefined();
    const framed = { ...map, ground: packGround(grid, [poly('crate', P, top(100, 200, 10))], [{ modelName: 'crate', path: P, first: 0, count: 1, frame: Float32Array.from(tilt([1, 0, 0], 8, [100, 0, 200])) }]) } as unknown as LoadedMap;
    expect(groundPolygons(framed.ground!)[0]!.frame).toBeDefined();               // the base's world frame ...
    expect(prototypePolygons(framed, 'crate')![0]!.frame).toBeUndefined();          // ... not spread onto model-space points
  });

  // LATER 146's review (F1): a door's owner carries no `frame` (LATER 142: the walk's frame is the live world one) but
  // keeps its rest frame (`restFrame`) for the forge, whose pieces stand still -- read where `frame` is absent, never
  // taken as upright, and never given to the walk's polygons.
  it("a door owner's rest frame under a tilted placement gives its model-space frame, not the placement's inverse alone", () => {
    const M = tilt([1, 0, 0], 2, [100, 0, 200]), R = tilt([1, 0, 0], 2, [100, 0, 200]);
    const door = {
      ...map,
      props: [{ ...map.props[0]!, matrices: Float32Array.from(M) }],
      ground: packGround(grid, [poly('crate', `${P}/door`, top(100, 200, 10))],
        [{ modelName: 'crate', path: `${P}/door`, first: 0, count: 1, sweep: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, restFrame: Float32Array.from(R) } as never]),
    } as unknown as LoadedMap;
    expect(groundPolygons(door.ground!)[0]!.frame).toBeUndefined();               // the walk's polygon: no frame
    const want = new Matrix4().fromArray(M).invert().multiply(new Matrix4().fromArray(R)).elements;
    near(prototypePolygons(door, 'crate')![0]!.frame, want);                         // the rest frame's model-space frame: the identity here
    expect(piece(tilt([0, 1, 0], 30, [-500, 5, 40]), door).owners.at(-1)!.frame).toBeDefined();   // computed, consistent with the room
  });

  // LATER 146's re-review (G3): an owner with no frame and no rest frame under a tilted placement is upright in the
  // world, so its model-space frame is the placement's inverse alone (the identity standing in for the upright frame).
  it('a frameless owner under a tilted placement gives the placement\'s inverse as its model-space frame', () => {
    const M = tilt([1, 0, 0], 3, [100, 0, 200]);
    const leaning = {
      ...map,
      props: [{ ...map.props[0]!, matrices: Float32Array.from(M) }],
      ground: packGround(grid, [poly('crate', `${P}/col`, top(100, 200, 10))], [{ modelName: 'crate', path: `${P}/col`, first: 0, count: 1 }]),
    } as unknown as LoadedMap;
    near(prototypePolygons(leaning, 'crate')![0]!.frame, new Matrix4().fromArray(M).invert().elements);
    const back = piece(M, leaning).owners.at(-1)!.frame;                              // placed back where it stood: upright
    near(back, new Matrix4().elements);
  });

  it("a piece of a sub-node-tilted prototype: one owner per frame, the piece's matrix composed with the model-space frame", () => {
    const m = tilt([0, 1, 0], 30, [-500, 5, 40]);
    const g = piece(m, child);
    const own = g.owners.slice(-2);
    expect(own.map((o) => [o.path, o.count])).toEqual([['piece 0', 2], ['piece 0', 1]]);
    near(own[0]!.frame, new Matrix4().fromArray(m).multiply(new Matrix4().fromArray(L)).elements);
    expect(own[1]!.frame).toBeUndefined();
  });
});
