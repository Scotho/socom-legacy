import { describe, expect, it } from 'vitest';
import {
  buildGrid, isCameraSurface, segmentHit, segmentHits, ALL_LAYERS, CAMERA_SKIP,
  type CollisionOwner, type GridParams, type WorldPoly,
} from '../src/index';

/**
 * `segmentHit` (web sprint 2, W2.1): the nearest polygon along a segment, over the grid -- the camera's probes
 * (`FUN_0029bf70`, `FUN_0029cbb0`) and W2.5's shot. Synthetic worlds only: the camera's fixture test is the viewer's.
 */

function quad(points: number[], ditype = 2, cameratype = 0): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype, points: Float32Array.from(points) };
}
/** A vertical wall across x at `z`, from x0 to x1 and y0 to y1. */
const wallZ = (z: number, x0: number, x1: number, y0: number, y1: number, cameratype = 0): WorldPoly =>
  quad([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 2, cameratype);
const floorAt = (y: number): WorldPoly => quad([-200, y, -200, 200, y, -200, 200, y, 200, -200, y, 200], 3);

function world(polys: WorldPoly[]) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

describe('segmentHit (W2.1)', () => {
  it('finds the nearest of two walls along a segment, with the point, the fraction and the polygon', () => {
    const near = wallZ(10, -50, 50, 0, 50), far = wallZ(20, -50, 50, 0, 50);
    const grid = world([far, near]);
    const hit = segmentHit(grid, [0, 20, 0], [0, 20, 30])!;
    expect(hit).not.toBeNull();
    expect(hit.point[0]).toBeCloseTo(0, 9);
    expect(hit.point[1]).toBeCloseTo(20, 9);
    expect(hit.point[2]).toBeCloseTo(10, 6);
    expect(hit.t).toBeCloseTo(1 / 3, 6);
    expect(hit.poly).toBe(near);
    // Short of the wall, nothing; beside it, nothing; the far end exactly on it counts.
    expect(segmentHit(grid, [0, 20, 0], [0, 20, 9.9])).toBeNull();
    expect(segmentHit(grid, [60, 20, 0], [60, 20, 30])).toBeNull();
    expect(segmentHit(grid, [0, 20, 0], [0, 20, 10])!.point[2]).toBeCloseTo(10, 6);
  });

  it('crosses cells: a segment over two cells finds a wall in the second', () => {
    const grid = world([wallZ(150, -50, 50, 0, 50)]);
    const hit = segmentHit(grid, [0, 20, 50], [0, 20, 180]);
    expect(hit?.point[2]).toBeCloseTo(150, 6);
  });

  it('takes a floor from above, and a segment parallel to a polygon misses it', () => {
    const grid = world([floorAt(0)]);
    expect(segmentHit(grid, [5, 10, 5], [5, -10, 5])?.point[1]).toBeCloseTo(0, 9);
    expect(segmentHit(grid, [5, 0, 5], [50, 0, 5])).toBeNull();
  });

  it('the camera\'s surfaces: bit 19 (m_cameratype bit 1) is skipped, bit 18 is tested (FUN_002d3030 with DAT_0044d758 = 1)', () => {
    const skip = wallZ(10, -50, 50, 0, 50, 2), camOnly = wallZ(20, -50, 50, 0, 50, 1);
    expect(CAMERA_SKIP).toBe(1 << 19);
    expect(isCameraSurface(skip)).toBe(false);
    expect(isCameraSurface(camOnly)).toBe(true);
    const grid = world([skip, camOnly]);
    expect(segmentHit(grid, [0, 20, 0], [0, 20, 30], isCameraSurface)?.poly).toBe(camOnly);
    expect(segmentHit(grid, [0, 20, 0], [0, 20, 30])?.poly).toBe(skip);          // no filter: every polygon
  });
});

/**
 * LATER 250 (research 281 §4.3; reading, pending review): the hull's segment test is one-sided -- `FUN_002d2890` gives a
 * hull collider (its `+0x80` bit 1 clear, `FUN_00316e30` D:L215827-215828) the side mode 0x20 (D:L174831-174837), with
 * which the polygon's VU0 plane test hits only a start in front of the face's own normal (micro 279-285: the sign
 * `polygonNormal` gives) and an end behind it. `segmentHits`' `frontOnly` counts only those; the default stays two-sided
 * for every caller but the throw clearance.
 */
describe('LATER 250: segmentHits\' front-entry flag (FUN_002d2890 side mode 0x20)', () => {
  it('frontOnly counts a face entered from its front only; the default counts both ways', () => {
    const wall = wallZ(10, -50, 50, 0, 50);                                   // wound so its normal is +z
    const grid = world([wall]);
    // From in front (z 30, on the normal's side) to behind (z 0): a front entry, counted both ways.
    expect(segmentHits(grid, [0, 20, 30], [0, 20, 0], () => true, ALL_LAYERS, true).map((h) => h.poly)).toEqual([wall]);
    expect(segmentHits(grid, [0, 20, 30], [0, 20, 0]).map((h) => h.poly)).toEqual([wall]);
    // From behind (z 0) out through the front (z 30): a back entry -- no hit one-sided, a hit two-sided (as before).
    expect(segmentHits(grid, [0, 20, 0], [0, 20, 30], () => true, ALL_LAYERS, true)).toEqual([]);
    expect(segmentHits(grid, [0, 20, 0], [0, 20, 30]).map((h) => h.poly)).toEqual([wall]);
    expect(segmentHit(grid, [0, 20, 0], [0, 20, 30])!.poly).toBe(wall);        // segmentHit: two-sided, unchanged
  });

  it("its review's F1: an end exactly on the face is not behind it -- no hit one-sided (micro 311-321), a hit two-sided at t = 1", () => {
    const wall = wallZ(10, -50, 50, 0, 50);
    const grid = world([wall]);
    expect(segmentHits(grid, [0, 20, 30], [0, 20, 10], () => true, ALL_LAYERS, true)).toEqual([]);
    expect(segmentHits(grid, [0, 20, 30], [0, 20, 10])[0]!.t).toBeCloseTo(1, 9);
    // A start exactly on the face, the end behind: a hit at t = 0, one-sided too (the start is not behind).
    expect(segmentHits(grid, [0, 20, 10], [0, 20, 0], () => true, ALL_LAYERS, true).map((h) => h.t)).toEqual([0]);
  });
});
