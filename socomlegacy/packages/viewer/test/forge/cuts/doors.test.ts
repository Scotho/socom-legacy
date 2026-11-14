import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { cutMesh, cutPolygon, DOOR_CUT_FACES_ADAPTATION as DOOR_CUT_FACES, makeCutBox as makeCut, subtractBox, withLayoutCuts, placedDoorCuts, type CutBox as DoorCut } from '../../../src/forge/cuts';
import type { LoadedMap, LoadedMesh } from '../../../src/loadMap';

/**
 * FORGE door cut-outs (a browser adaptation, FG.R2): a placed door opens a hole in the wall it stands in -- the world's
 * and the props' triangles and the hull's static polygons inside its opening are clipped away; nothing outside it moves.
 * The geometry is unit-tested here; the disc-backed half (`SOCOM_ISO`) sets a door into Frostfire's barracks wall and
 * walks through it.
 */

const area = (pts: number[][]): number => {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i]!.map((v, k) => v - pts[0]![k]!), b = pts[i + 1]!.map((v, k) => v - pts[0]![k]!);
    x += a[1]! * b[2]! - a[2]! * b[1]!; y += a[2]! * b[0]! - a[0]! * b[2]!; z += a[0]! * b[1]! - a[1]! * b[0]!;
  }
  return Math.hypot(x, y, z) / 2;
};
const inside = (cut: DoorCut, p: readonly number[], eps = 1e-3): boolean => {
  const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(cut.local);
  return [v.x, v.y, v.z].every((x, k) => x > cut.lo[k]! + eps && x < cut.hi[k]! - eps);
};

/** A wall: a 10 x 10 quad in the plane z = 0, two triangles, uv running 0..1 across it. */
function wall(): LoadedMesh {
  return {
    positions: Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
    uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    colors: new Float32Array(16).fill(0.5),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    faceNormals: Float32Array.from([0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    textureName: 'wall.tif', fog: true, lit: true, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
  } as LoadedMesh;
}
/** A hole 4 wide (x 3..7), 6 tall (y 2..8), through z -1..1, in the world's frame. */
const hole = (): DoorCut => makeCut(new Matrix4(), [3, 2, -1], [7, 8, 1]);

describe('subtractBox', () => {
  it('keeps a polygon the box never reaches as it is (null) and drops one wholly inside ([])', () => {
    expect(subtractBox([[20, 0, 0], [30, 0, 0], [30, 10, 0]], [3, 2, -1], [7, 8, 1])).toBeNull();
    expect(subtractBox([[4, 3, 0], [6, 3, 0], [6, 7, 0]], [3, 2, -1], [7, 8, 1])).toEqual([]);
  });
  it('leaves the pieces outside the box: their area the polygon\'s less the hole\'s, none inside it', () => {
    const quad = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
    const pieces = subtractBox(quad, [3, 2, -1], [7, 8, 1])!;
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(100 - 4 * 6, 6);
    for (const p of pieces) {
      const c = [0, 1, 2].map((k) => p.reduce((s, v) => s + v[k]!, 0) / p.length);
      expect(c[0]! > 3 && c[0]! < 7 && c[1]! > 2 && c[1]! < 8, `piece centre ${c}`).toBe(false);
    }
  });
});

describe('cutMesh', () => {
  it('returns the same mesh when no cut reaches it', () => {
    const m = wall();
    expect(cutMesh(m, [makeCut(new Matrix4(), [20, 0, -1], [25, 5, 1])])).toBe(m);
  });
  it('opens the hole: area less 24, no triangle inside, uv carried linearly, the kept vertices untouched', () => {
    const m = wall();
    const c = cutMesh(m, [hole()]);
    expect(c).not.toBe(m);
    const tri = (t: number) => [0, 1, 2].map((j) => Array.from(c.positions.subarray(c.indices[t * 3 + j]! * 3, c.indices[t * 3 + j]! * 3 + 3)));
    let sum = 0;
    for (let t = 0; t < c.indices.length / 3; t++) {
      const p = tri(t);
      sum += area(p);
      const centre = [0, 1, 2].map((k) => (p[0]![k]! + p[1]![k]! + p[2]![k]!) / 3);
      expect(inside(hole(), centre), `triangle ${t} at ${centre}`).toBe(false);
    }
    expect(sum).toBeCloseTo(76, 5);
    // u = x / 10 and v = y / 10 on this wall, at every vertex the cut made.
    for (let i = 0; i < c.positions.length / 3; i++) {
      expect(c.uvs[i * 2]!).toBeCloseTo(c.positions[i * 3]! / 10, 5);
      expect(c.uvs[i * 2 + 1]!).toBeCloseTo(c.positions[i * 3 + 1]! / 10, 5);
      expect(Math.hypot(c.normals![i * 3]!, c.normals![i * 3 + 1]!, c.normals![i * 3 + 2]!)).toBeCloseTo(1, 5);
    }
    expect(Array.from(c.positions.subarray(0, 12))).toEqual(Array.from(m.positions));
    expect(c.faceNormals!.length).toBe(c.indices.length);
  });
});

describe('which surfaces a cut takes (its X / Y / Z faces)', () => {
  /** The hole, taking walls only: a door's faces. */
  const doorHole = (): DoorCut => makeCut(new Matrix4(), [3, 2, -1], [7, 8, 1], DOOR_CUT_FACES);
  const FLOOR = [0, 4, -5, 10, 4, -5, 10, 4, 5, 0, 4, 5];
  it("a door's opening keeps a floor crossing it whole, mesh and hull alike; a steep ramp face it cuts", () => {
    const floor = { ...wall(), positions: Float32Array.from(FLOOR) } as LoadedMesh;
    expect(cutMesh(floor, [doorHole()])).toBe(floor);
    expect(cutPolygon(FLOOR, [doorHole()])).toBeNull();
    // A surface 60 degrees from level (its normal mostly across, not up) is a wall to it.
    const steep = [0, 0, -1, 10, 0, -1, 10, 10, 1 / Math.sqrt(3) * 10 - 1, 0, 10, 1 / Math.sqrt(3) * 10 - 1];
    expect(cutPolygon(steep, [makeCut(new Matrix4(), [3, 2, -10], [7, 8, 10], DOOR_CUT_FACES)])).not.toBeNull();
  });
  it('a free cut with all three faces takes the floor too; one with y alone takes the floor and leaves the wall', () => {
    expect(cutPolygon(FLOOR, [hole()])).not.toBeNull();
    const hatch = makeCut(new Matrix4(), [3, 2, -1], [7, 8, 1], { x: false, y: true, z: false });
    expect(cutPolygon(FLOOR, [hatch])).not.toBeNull();
    expect(cutPolygon([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0], [hatch])).toBeNull();
  });
  it("faces are read in the cut's own frame: a box turned a quarter takes the wall by its x switch", () => {
    const turned = new Matrix4().makeRotationY(Math.PI / 2).setPosition(5, 5, 0);
    const xOnly = makeCut(turned, [-1, -3, -2], [1, 3, 2], { x: true, y: false, z: false });
    const zOnly = makeCut(turned, [-1, -3, -2], [1, 3, 2], { x: false, y: false, z: true });
    const WALL = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0];       // facing z in the world: x in the turned box's frame
    expect(cutPolygon(WALL, [xOnly])).not.toBeNull();
    expect(cutPolygon(WALL, [zOnly])).toBeNull();
  });
});

describe('cutPolygon', () => {
  it('null for a polygon outside every cut; the pieces of one crossing it, the hole left open', () => {
    expect(cutPolygon([20, 0, 0, 30, 0, 0, 30, 10, 0], [hole()])).toBeNull();
    const pieces = cutPolygon([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0], [hole()])!;
    const total = pieces.reduce((s, p) => s + area(Array.from({ length: p.length / 3 }, (_, i) => Array.from(p.subarray(i * 3, i * 3 + 3)))), 0);
    expect(total).toBeCloseTo(76, 4);
  });
});

describe('withLayoutCuts', () => {
  it('leaves a map with no placed door as it is', () => {
    const map = { world: [wall()], props: [], doors: [], ground: undefined } as unknown as LoadedMap;
    expect(withLayoutCuts(map, undefined)).toEqual({ map, cut: 0 });
  });
});

// ---- On the disc: a door set into Frostfire's barracks wall ------------------------------------------------------------

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("a door set into Frostfire's barracks wall (SOCOM_ISO)", () => {
  /**
   * The barracks' wall between x 585 and 647 at z 1001 (one face) and 1004 (the other), floor y 142 on both sides
   * (the hull's own polygons 223 and 224). bdoor_4 copied into it, turned so its leaf runs along x, its middle at x 616.
   */
  const setUp = async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../../tools/fmv-spike');
    const { loadMap } = await import('../../../src/loadMap');
    const { doorTemplates, doorMove, doorHinge, withPlacedDoors } = await import('../../../src/forge/placedDoors');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP2.ZDB');
    const t = doorTemplates(map, 'MP2').find((d) => d.name === 'bdoor_4')!;
    // The turn that lays the leaf along x, and the hinge that puts its middle at (616, 142, 1002.5).
    let best = { yaw: 0, at: [0, 0, 0] as [number, number, number] };
    for (const yaw of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
      const m = doorMove(t, [0, 0, 0], yaw);
      const pts = t.owners.flatMap((o) => o.polys.flatMap((p) => Array.from({ length: p.points.length / 3 }, (_, i) => new Vector3(p.points[i * 3], p.points[i * 3 + 1], p.points[i * 3 + 2]).applyMatrix4(m))));
      const xs = pts.map((v) => v.x), zs = pts.map((v) => v.z), ys = pts.map((v) => v.y);
      if (Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs) && Math.max(...xs) + Math.min(...xs) > 0) {
        best = { yaw, at: [616 - (Math.max(...xs) + Math.min(...xs)) / 2, 142 - Math.min(...ys), 1002.5 - (Math.max(...zs) + Math.min(...zs)) / 2] };
        break;
      }
    }
    void doorHinge;
    const placed = withPlacedDoors(map, [{ source: 'MP2', name: 'bdoor_4', at: best.at, yaw: best.yaw }], () => t).map;
    return { map, placed };
  };
  const walkThrough = async (map: LoadedMap): Promise<number> => {
    const { DoorSet } = await import('../../../src/doors');
    const { groundGrid, Walker } = await import('../../../src/mover');
    const doors = new DoorSet(map.doors!, map.ground!, {});
    const mine = map.doors!.length - 1;
    expect(doors.use(mine, [616, 142, 996], 1, 0)).toBe(true);
    for (let i = 0; i < 300 && doors.state(mine).busy; i++) doors.step(1 / 30);
    expect(doors.state(mine).open).toBe(true);
    const w = new Walker(groundGrid(map.ground!));
    expect(w.place(616, 150, 990)).toBe(true);
    w.state.yaw = 180;                                   // +z, into the wall
    for (let i = 0; i < 18; i++) w.tick({ forward: 0, right: 0, boost: false });
    for (let i = 0; i < 150; i++) w.tick({ forward: 1, right: 0, boost: false });
    return w.state.z;
  };

  it('without the cut the wall stands behind the open door; with it the doorway walks through and the floor stays', async () => {
    const { placed } = await setUp();
    // Cut first: a walk swings the door's leaf in the hull it is given, and the opening is measured off the leaf at rest.
    const opened = withLayoutCuts(placed, undefined);
    expect(opened.cut).toBeGreaterThan(0);
    expect(await walkThrough(placed), 'the wall still there').toBeLessThan(1001);
    expect(await walkThrough(opened.map), 'through the doorway').toBeGreaterThan(1010);
  }, 180_000);

  it("the door brings its doorway's own lining (Frostfire's a_steel23 jambs, head and threshold), uncut; the hole adds only its collision", async () => {
    // Dropped by the wall as the editor drops it: snapped, its frame centred in the wall (`snapDoor`).
    const { map } = await setUp();
    const { cutCaps, snapDoor, wallFaces } = await import('../../../src/forge/cuts');
    const { doorFramePoints, doorMove, doorTemplates, withPlacedDoors } = await import('../../../src/forge/placedDoors');
    const t = doorTemplates(map, 'MP2').find((d) => d.name === 'bdoor_4')!;
    const s = snapDoor([609.5, 142, 1000], Math.PI, (at, yaw) => doorMove(t, at, yaw), t.owners.flatMap((o) => o.polys), wallFaces(map.ground!), doorFramePoints(t))!;
    const placed = withPlacedDoors(map, [{ source: 'MP2', name: 'bdoor_4', at: s.at, yaw: s.yaw }], () => t).map;
    const lining = placed.world.filter((m) => m.node === 'forge_door_1_reveal');
    expect(lining.map((m) => m.textureName)).toEqual(['a_steel23.tif']);
    expect(lining[0]!.indices.length / 3).toBe(8);                       // two triangles each: two jambs, the head, the plate
    // Across the wall's thickness, z 1001 to 1004, where the barracks wall stands.
    const zs = Array.from({ length: lining[0]!.positions.length / 3 }, (_, i) => lining[0]!.positions[i * 3 + 2]!);
    expect(Math.min(...zs)).toBeCloseTo(1001, 0);
    expect(Math.max(...zs)).toBeCloseTo(1004, 0);
    const [box] = placedDoorCuts(placed);
    expect(box!.lined).toBe(true);
    const caps = cutCaps(placed, [box!]);
    expect(caps.meshes).toEqual([]);
    expect(caps.polys.length).toBeGreaterThanOrEqual(3);
    const opened = withLayoutCuts(placed, undefined).map;
    expect(opened.world.filter((m) => m.node === 'forge_door_1_reveal')).toEqual(lining);
  }, 180_000);

  it('a door set 3 cm into the floor (its hole down to the floor) still gets a threshold plate across the wall, at the floor', async () => {
    const { map } = await setUp();
    const { doorTemplates, withPlacedDoors } = await import('../../../src/forge/placedDoors');
    const { cutCaps } = await import('../../../src/forge/cuts');
    const t = doorTemplates(map, 'MP2').find((d) => d.name === 'bdoor_4')!;
    const sunk = withPlacedDoors(map, [{ source: 'MP2', name: 'bdoor_4', at: [609.5, 141.7, 1002.76], yaw: Math.PI }], () => t).map;
    const caps = cutCaps(sunk, placedDoorCuts(sunk).map((b) => ({ ...b, lined: false })));
    const plates = caps.polys.filter((p) => p.ditype === 3);
    expect(plates.length).toBe(1);
    const ys = Array.from({ length: 4 }, (_, i) => plates[0]!.points[i * 3 + 1]!);
    expect(Math.min(...ys)).toBeCloseTo(142, 1);
    expect(Math.max(...ys)).toBeCloseTo(142, 1);
  }, 180_000);

  it('no triangle is left inside the opening, the leaf and the floor under it are kept, nothing far away changes', async () => {
    const { placed } = await setUp();
    const [cut] = placedDoorCuts(placed);
    expect(cut).toBeDefined();
    // The area of every drawn triangle that lies inside the opening (its area less its pieces outside it).
    const tmp = new Vector3();
    const areaInside = (tri: number[][]): number => {
      const local = tri.map((p) => { tmp.set(p[0]!, p[1]!, p[2]!).applyMatrix4(cut!.local); return [tmp.x, tmp.y, tmp.z]; });
      // Only the wall's own faces (facing through the opening): the hole's lining stands on its sides, facing in.
      const u = local[1]!.map((x, k) => x - local[0]![k]!), w = local[2]!.map((x, k) => x - local[0]![k]!);
      const nz = u[0]! * w[1]! - u[1]! * w[0]!, len = Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, nz);
      if (len === 0 || Math.abs(nz) / len < 0.9) return 0;
      const out = subtractBox(local, cut!.lo, cut!.hi);
      return out === null ? 0 : area(local) - out.reduce((s, p) => s + area(p), 0);
    };
    const trianglesInside = (m: LoadedMap): number => {
      let n = 0;
      for (const mesh of m.world) for (let t = 0; t < mesh.indices.length / 3; t++) {
        n += areaInside([0, 1, 2].map((j) => Array.from(mesh.positions.subarray(mesh.indices[t * 3 + j]! * 3, mesh.indices[t * 3 + j]! * 3 + 3))));
      }
      for (const p of m.props) for (let i = 0; i < p.matrices.length / 16; i++) {
        if (p.paths?.[i]?.startsWith('worldmodel/forge_door_')) continue;
        const mm = new Matrix4().fromArray(Array.from(p.matrices.subarray(i * 16, i * 16 + 16)));
        for (const part of p.parts) for (let t = 0; t < part.indices.length / 3; t++) {
          n += areaInside([0, 1, 2].map((j) => new Vector3().fromArray(part.positions, part.indices[t * 3 + j]! * 3).applyMatrix4(mm).toArray()));
        }
      }
      return n;
    };
    expect(trianglesInside(placed), 'the wall drawn across the doorway before').toBeGreaterThan(0);
    const opened = withLayoutCuts(placed, undefined).map;
    expect(trianglesInside(opened)).toBeLessThan(1e-2);
    // The door's own leaf is drawn and solid as before.
    expect(opened.props.filter((p) => p.paths?.some((q) => q.startsWith('worldmodel/forge_door_1'))).length)
      .toBe(placed.props.filter((p) => p.paths?.some((q) => q.startsWith('worldmodel/forge_door_1'))).length);
    const { groundPolygons } = await import('../../../src/mover');
    const leaf = (m: LoadedMap) => m.doors!.at(-1)!.owners.map((i) => m.ground!.owners[i]!.count);
    expect(leaf(opened)).toEqual(leaf(placed));
    // The door brought Frostfire's own frame (dfram2), drawn and solid, and the cut left it whole.
    const frameProps = (m: LoadedMap) => m.props.filter((p) => p.paths?.some((q) => q.startsWith('worldmodel/forge_door_1_frame')));
    expect(frameProps(placed).map((p) => p.modelName)).toEqual(['dfram2']);
    expect(frameProps(opened).length).toBe(1);
    const frameHull = (m: LoadedMap) => m.ground!.owners.filter((o) => o.path.startsWith('worldmodel/forge_door_1_frame')).map((o) => o.count);
    expect(frameHull(placed).length).toBeGreaterThan(0);
    expect(frameHull(opened)).toEqual(frameHull(placed));
    // The floor under the doorway: every polygon below the cut's floor clearance is kept.
    const low = (m: LoadedMap) => groundPolygons(m.ground!).filter((p) => p.ditype === 3 && p.path !== 'worldmodel/forge_cut_lining' && Array.from(p.points).some((v, k) => k % 3 === 1 && v < 142.3)).length;
    expect(low(opened)).toBe(low(placed));
    // A world mesh nowhere near the door is the same object.
    const far = placed.world.findIndex((m) => { let minX = Infinity; for (let i = 0; i < m.positions.length; i += 3) minX = Math.min(minX, m.positions[i]!); return minX > 1500; });
    if (far >= 0) expect(opened.world[far]).toBe(placed.world[far]);
  }, 180_000);
});
