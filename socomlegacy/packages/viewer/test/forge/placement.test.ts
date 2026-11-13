import { describe, expect, it } from 'vitest';
import { floorMesh } from '../../src/forge/matchMap';
import { floorGround } from '../../src/forge/ground';
import {
  blankFloorGrid, boundStep, clipOf, DEFAULT_GRID_STEP, DEFAULT_TURN_STEP, offsetsFromCentre, pastedPlaces, placeClickKind,
  mountOnWall, placementGridOf, restingPoint, restingY, snapTo, snapYawRadians, surfaceYs,
} from '../../src/forge/placement';
import { BoxGeometry, Mesh, Vector3 } from 'three';

/**
 * FORGE placement aids (FG-5, FG-49; a browser adaptation, no original): the grid and the turn, the hull a piece rests
 * on, and a paste that keeps the group's offsets. The blank floor's hull is `floorGround`; the match draws that same
 * square with `floorMesh`.
 */

describe('FORGE placement: the steps', () => {
  it('snaps to the nearest multiple, and leaves a value alone when the step is not positive', () => {
    expect(snapTo(37, 25)).toBe(25);
    expect(snapTo(38, 25)).toBe(50);
    expect(snapTo(-13, 25)).toBe(-25);
    expect(snapTo(-12, 25)).toBe(0);
    expect(snapTo(10, 0)).toBe(10);
    expect(snapTo(Number.NaN, 25)).toBeNaN();
  });

  it('holds a typed step inside its bounds, whole, and keeps the fallback when it is not a number', () => {
    expect(boundStep(25.4, 1, 500, DEFAULT_GRID_STEP)).toBe(25);
    expect(boundStep(0, 1, 500, DEFAULT_GRID_STEP)).toBe(1);
    expect(boundStep(900, 1, 500, DEFAULT_GRID_STEP)).toBe(500);
    expect(boundStep(Number.NaN, 1, 180, DEFAULT_TURN_STEP)).toBe(DEFAULT_TURN_STEP);
  });

  it('snaps a yaw to the turn step', () => {
    const step = (DEFAULT_TURN_STEP * Math.PI) / 180;
    expect(snapYawRadians(step * 0.6, DEFAULT_TURN_STEP)).toBeCloseTo(step);
    expect(snapYawRadians(step * 0.4, DEFAULT_TURN_STEP)).toBeCloseTo(0);
    expect(snapYawRadians(1, 0)).toBe(1);
  });
});

describe('FORGE placement: resting on the hull', () => {
  const grid = blankFloorGrid(2000);

  it('the blank floor\'s hull is y = 0, and the match draws that same square at y = 0', () => {
    expect(surfaceYs(grid, 300, -700)).toEqual([0]);
    const drawn = floorMesh(2000);
    const ys = [...drawn.positions].filter((_, i) => i % 3 === 1);
    expect(ys).toEqual([0, 0, 0, 0]);
  });

  it('a hit on the drawn plane, half a unit under the hull, rests on the hull', () => {
    const at = restingPoint({ x: 12, y: -0.5, z: -40 }, (x, z) => surfaceYs(grid, x, z), null);
    expect(at.x).toBe(12);
    expect(at.z).toBe(-40);
    expect(at.y).toBeCloseTo(0);
    // The ray's intersection with the drawn plane can sit a hair under -0.5.
    expect(restingY(-0.5000001, [0])).toBeCloseTo(0);
  });

  it('snaps x and z, then probes the cell the piece lands in', () => {
    const at = restingPoint({ x: 37, y: -0.5, z: -13 }, (x, z) => surfaceYs(grid, x, z), 25);
    expect(at.x).toBe(25);
    expect(at.z).toBe(-25);
    expect(at.y).toBeCloseTo(0);
  });

  it('with no hull under the hit, the hit\'s own height stands', () => {
    expect(restingY(4, [])).toBe(4);
    expect(restingPoint({ x: 1, y: 4, z: 2 }, () => [], null)).toEqual({ x: 1, y: 4, z: 2 });
  });

  it('picks the highest surface at or below the hit, not one above it', () => {
    expect(restingY(10, [0, 40, 8])).toBe(8);
    expect(restingY(0, [0, 40])).toBe(0);
  });

  it('a placed piece\'s top is in the probe, so a click on it stacks and a miss stays on the floor', () => {
    const top = 80;
    const points = new Float32Array([-40, top, -40, 40, top, -40, 40, top, 40, -40, top, 40]);
    const grid = placementGridOf(floorGround(2000), [{
      owner: 'forge/piece_0',
      polys: [{ modelName: 'box', path: 'box', region: 0, ditype: 3, material: 0, ptcount: 4, cameratype: 0, points }],
      m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    }]);
    const probe = (x: number, z: number): number[] => surfaceYs(grid, x, z);
    const onTop = restingPoint({ x: 0, y: top, z: 0 }, probe, null);
    expect(onTop.y).toBeCloseTo(top);
    const beside = restingPoint({ x: 500, y: -0.5, z: 0 }, probe, null);
    expect(beside.y).toBeCloseTo(0);
    // A hit on the side, below the roof, does not climb onto it.
    expect(restingPoint({ x: 0, y: 20, z: 0 }, probe, null).y).toBeCloseTo(0);
  });
});

describe('FORGE placement: a click on the gizmo', () => {
  it('a click places; a drag that began on the gizmo does not', () => {
    expect(placeClickKind(0, true)).toBe('place');
    expect(placeClickKind(3.9, true)).toBe('place');
    expect(placeClickKind(4, true)).toBe('gizmo');
    expect(placeClickKind(20, false)).toBe('place');
  });
});

describe('FORGE placement: paste keeps the group', () => {
  const points: [number, number, number][] = [[10, 0, 0], [40, 0, 10], [10, 5, -20]];

  it('offsets are from the centre, and a paste at the cursor adds them back', () => {
    const offsets = offsetsFromCentre(points);
    expect(offsets).toHaveLength(3);
    const again = pastedPlaces(offsets, [20, 5 / 3, -10 / 3]);
    again.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(points[i]![0]);
      expect(p[1]).toBeCloseTo(points[i]![1]);
      expect(p[2]).toBeCloseTo(points[i]![2]);
    });
    const moved = pastedPlaces(offsets, [100, 0, -50]);
    for (let i = 1; i < points.length; i++) {
      expect(moved[i]![0] - moved[0]![0]).toBeCloseTo(points[i]![0] - points[0]![0]);
      expect(moved[i]![1] - moved[0]![1]).toBeCloseTo(points[i]![1] - points[0]![1]);
      expect(moved[i]![2] - moved[0]![2]).toBeCloseTo(points[i]![2] - points[0]![2]);
    }
  });

  it('the turns are copied with the offsets', () => {
    const turns = [[0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1]] as const;
    const clip = clipOf(points, turns);
    expect(clip.map((c) => c.q)).toEqual(turns.map((q) => [...q]));
    expect(pastedPlaces(clip.map((c) => c.offset), [0, 0, 0])).toHaveLength(3);
  });

  it('an empty selection pastes nothing', () => {
    expect(offsetsFromCentre([])).toEqual([]);
    expect(pastedPlaces([], [1, 2, 3])).toEqual([]);
  });
});

/**
 * A placement seated on the surface (the owner, 2026-11-06; a browser adaptation, FG.R2): the bottom of its bounding
 * box on the point placed, never under the floor, whatever its origin (a door's is its hinge, part way up its leaf).
 */
describe('seatOn', () => {
  it("puts the bottom of the object's box on the point: one whose geometry reaches below its origin is lifted", async () => {
    const { BoxGeometry, Group, Mesh, Vector3 } = await import('three');
    const { seatOn } = await import('../../src/forge/placement');
    const leaf = new Mesh(new BoxGeometry(10, 80, 2));        // its origin at its middle: 40 below it
    const door = new Group(); door.add(leaf);
    seatOn(door, new Vector3(5, 100, -3));
    expect([door.position.x, door.position.y, door.position.z]).toEqual([5, 140, -3]);
    const raised = new Group(); const m = new Mesh(new BoxGeometry(2, 2, 2)); m.position.y = 11; raised.add(m);   // its box from 10 up
    seatOn(raised, new Vector3(0, 0, 0));
    expect(raised.position.y).toBeCloseTo(-10);
  });

  it('a turned object is seated by its turned box; one with no geometry stands at the point', async () => {
    const { BoxGeometry, Group, Mesh, Vector3 } = await import('three');
    const { seatOn } = await import('../../src/forge/placement');
    const bar = new Mesh(new BoxGeometry(2, 2, 40)); bar.rotation.x = Math.PI / 2;   // 40 tall once turned
    const g = new Group(); g.add(bar);
    seatOn(g, new Vector3(0, 0, 0));
    expect(g.position.y).toBeCloseTo(20);
    const empty = new Group();
    seatOn(empty, new Vector3(1, 2, 3));
    expect([empty.position.x, empty.position.y, empty.position.z]).toEqual([1, 2, 3]);
  });
});

/**
 * A wall mount (the owner, 2026-11-10: a switch, a ladder, a prop placed on a wall takes the wall's turn): its front out
 * along the wall's normal, the back of its box on the wall, a mount at the cursor's height, a stand on the floor below.
 */
describe('mountOnWall', () => {
  // A box 2 wide, 4 tall and 1 deep, its origin at its bottom middle (z from -0.5 to 0.5).
  const block = (): Mesh => { const m = new Mesh(new BoxGeometry(2, 4, 1)); m.geometry.translate(0, 2, 0); return m; };
  it('turns +Z out of a wall facing +X, its back on the wall, its middle at the cursor', () => {
    const o = block();
    mountOnWall(o, new Vector3(10, 5, 3), new Vector3(1, 0, 0));
    expect(o.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect(o.position.x).toBeCloseTo(10.55, 6);       // half its depth out, and the gap
    expect(o.position.z).toBeCloseTo(3, 6);
    expect(o.position.y).toBeCloseTo(3, 6);           // its middle (2 up from its origin) at the cursor's 5
  });
  it("a stand (a ladder) is on the floor below; its own front (a quarter off) turned out", () => {
    const o = block();
    mountOnWall(o, new Vector3(0, 30, 0), new Vector3(0, 0, -1), [1, 0], 'stand', () => 7);
    expect(o.rotation.y).toBeCloseTo(Math.PI - Math.PI / 2, 6);   // local +X now points to -Z
    expect(o.position.y).toBeCloseTo(7, 6);
    expect(o.position.z).toBeCloseTo(-1.05, 6);       // half its width (it backs onto the wall across x) and the gap
  });
  it('a level normal (a floor) leaves it as it was', () => {
    const o = block();
    o.position.set(1, 2, 3);
    mountOnWall(o, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    expect(o.position.toArray()).toEqual([1, 2, 3]);
  });
});
