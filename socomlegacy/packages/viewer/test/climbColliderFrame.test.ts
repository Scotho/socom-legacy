import { describe, expect, it } from 'vitest';
import { buildGrid, DEFAULT_GRID_PARAMS, transformPoint, type CollisionOwner, type WorldPoly } from '@s2u/scene';
import { CLIMB_EDGE_INSET_PLACEHOLDER, contactOf, planClimb } from '../src/climb';
import { groundPolygons, packGround } from '../src/mover';
import { forkGround } from '../src/worldState';

/**
 * LATER 142 (research 313 section 8.10; reading, pending review): a climb face's column and cut in the collider's own
 * frame (`FUN_002dbfb0` D:L180187-180212, `FUN_002dc090` D:L180218-180248; the frame `FUN_003109f0` D:L212151, inverted
 * by `FUN_00308160` D:L206756, carried out by `FUN_00308640` D:L206996). Synthetic: a 20 x 10 wall in its node's frame
 * (x along it, y up, z its normal), the node rolled 30 degrees about its normal and moved to (100, 50, 200) -- in the
 * world its top edge slopes, in its frame it is level. A hit at local (2, 3): the column along the local up axis meets
 * the top at local (2, 10); the world's vertical meets the sloped top elsewhere. The cut at the local height 3 is the
 * local line y = 3, the world's cut at the hit's height a level line across the slope.
 */

const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
/** Row-major (`flattenScene`'s `world`): rows the local x, y, z axes in the world, then the shift. */
const FRAME = new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 100, 50, 200, 1]);
const LOCAL = [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0]];
const out = (l: readonly number[]) => transformPoint(FRAME, l[0]!, l[1]!, l[2]!);
const wall = (frame?: Float32Array): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/fence', region: 0, ditype: 2, material: 0, ptcount: 4, cameratype: 0, appflags: 5,
  points: Float32Array.from(LOCAL.flatMap(out)), ...(frame ? { frame } : {}),
});
const HIT = out([2, 3, 0]);
/** The body 3 in front of the hit (the face's normal is +z), facing it. */
const BODY = [HIT[0], 50, HIT[2] + 3] as const;

describe('movement.climb: LATER 142 -- the column and the cut in the collider\'s own frame', () => {
  it('the column top is the local top over the hit (local (2, 10)), not the world\'s vertical over the sloped top', () => {
    const top = out([2, 10, 0])[1];                                          // 2 s + 10 c + 50 = 59.66
    const worldTop = 50 + 10 * c + ((HIT[0] - (100 - 10 * s)) / (20 * c)) * 20 * s;   // the sloped top edge at the hit's x: 61.68
    expect(top).toBeCloseTo(59.66, 2);
    expect(worldTop).toBeCloseTo(61.68, 2);
    expect(contactOf(wall(), 5, BODY[0], BODY[2], HIT)!.top).toBeCloseTo(worldTop, 4);      // no frame: the world's, as before
    const framed = contactOf(wall(FRAME), 5, BODY[0], BODY[2], HIT)!;
    expect(framed.top).toBeCloseTo(top, 4);                                   // RED before the build: 61.68
    expect(framed.bottom).toBeCloseTo(out([2, 0, 0])[1], 4);
    expect([framed.x, framed.y, framed.z]).toEqual([HIT[0], HIT[1], HIT[2]]); // the contact's point stays the hit
  });

  it('the cut is the local line y = 3 carried out, and the push\'s target 3 in from its near end (FUN_005b3a60) at the local top', () => {
    const framed = contactOf(wall(FRAME), 5, BODY[0], BODY[2], HIT)!;
    const ends = [out([0, 3, 0]), out([20, 3, 0])];                          // (98.5, 200) and (115.82, 200)
    const xs = [framed.edge![0], framed.edge![2]].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(ends[0]![0], 4);                               // RED before the build: 97.92 (the world's cut)
    expect(xs[1]).toBeCloseTo(ends[1]![0], 4);
    const grid = buildGrid(DEFAULT_GRID_PARAMS, [], [], [framed.poly]);
    const plan = planClimb(grid, framed, BODY[0], BODY[1], BODY[2], 0, -1)!;
    expect(plan.kind).toBe('over');
    expect(plan.target[0]).toBeCloseTo(ends[0]![0] + 3, 4);                   // 101.5; the world frame's 100.92
    expect(plan.target[1]).toBeCloseTo(out([2, 10, 0])[1], 4);
  });

  it('a hit at its cut\'s end is taken CLIMB_EDGE_INSET_PLACEHOLDER inside it: the same as there, and as just inside', () => {
    // The world's cut at the hit's height: the left edge's point (local x 0 side) is its near end.
    const y = HIT[1], t = (y - 50) / (10 * c), end = [100 - 10 * s * t, y, 200];          // on the edge (100, 50) -> (95, 58.66)
    const inset = [end[0]! + CLIMB_EDGE_INSET_PLACEHOLDER, y, 200];
    const atEnd = contactOf(wall(FRAME), 5, end[0]!, 203, end)!, inside = contactOf(wall(FRAME), 5, inset[0]!, 203, inset)!;
    expect(CLIMB_EDGE_INSET_PLACEHOLDER).toBe(0.01);
    expect(atEnd.top).toBeCloseTo(inside.top, 6);
    expect(atEnd.edge).not.toBeNull();
    const nearer = contactOf(wall(FRAME), 5, end[0]! + 0.001, 203, [end[0]! + 0.001, y, 200])!;
    expect(nearer.top).toBeCloseTo(inside.top, 6);
  });

  it('a hit outside the cut\'s first two crossings (a non-convex face\'s other arm) is taken as it is, not moved onto that pair\'s end', () => {
    // LATER 142's review (F1): a U-shaped wall in the plane z = 0, its right arm's top sloped from (20, 10) to (30, 14). The
    // cut at y 7 crosses it four times; a hit on the right arm at x 25 lies outside the first pair's interval in one of
    // the two windings, and the inset (`CLIMB_EDGE_INSET_PLACEHOLDER`) is for a hit within it of an end only: the column
    // at the hit is the right arm's, 12 (`columnTop` there). LATER 147 holds the rest of a non-convex face's cut.
    const xy: [number, number][] = [[0, 0], [30, 0], [30, 14], [20, 10], [20, 5], [10, 5], [10, 10], [0, 10]];
    for (const order of [xy, [...xy].reverse()]) {
      const points = Float32Array.from(order.flatMap(([x, y]) => [x, y, 0]));
      const u: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/u', region: 0, ditype: 2, material: 0, ptcount: order.length, cameratype: 0, appflags: 4, points };
      const side = contactOf(u, 4, 25, 3, [25, 7, 0]) ? 3 : -3;              // the face is met from its front only
      const c = contactOf(u, 4, 25, side, [25, 7, 0])!;
      expect(c.top).toBeCloseTo(12, 4);                                      // RED before the fold (clockwise): 10
    }
  });

  it('the frame travels with the hull: an owner\'s frame reaches its polygons through the pack, and a room\'s fork keeps it', () => {
    const polys = [wall(), wall()];
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/upright', first: 0, count: 1 },
      { modelName: 'worldmodel', path: 'worldmodel/fence', first: 1, count: 1, frame: FRAME },
    ];
    const ground = packGround(DEFAULT_GRID_PARAMS, polys, owners);
    const back = groundPolygons(ground);
    expect('frame' in back[0]!).toBe(false);                                 // upright: no frame, the world path as before
    expect(back[1]!.frame).toBe(FRAME);                                       // RED before the build: undefined
    expect(groundPolygons(forkGround(ground))[1]!.frame).toBe(FRAME);
  });
});
