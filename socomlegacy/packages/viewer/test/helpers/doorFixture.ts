import { probeFloor, segmentHit, type V3 } from '@s2u/scene';
import { DoorSet, doorInReach } from '../../src/doors';
import { groundGrid, Walker, TICK, type WalkInput } from '../../src/mover';
import { PROBE_LIFT } from '../../src/sim';
import type { SimMap } from '../../src/simMap';

/**
 * A crossing through one door of a real map's hull, for a door test (ported from Chris's browser-beta-v5,
 * `chris/browser-beta-integration` d578f347: `tools/chain-door-fixture.mjs`, as a typed test helper). The search runs on
 * a copy of the hull's points, so the map handed in is not changed.
 *
 * Every number here is the test's geometry, not the game's: the offsets 10 / 15 / 20 either side of the leaf, the
 * 4-unit floor difference allowed between the two ends, the line 10 over the feet and the 600-step cap on a swing are
 * what make a crossing a fair test of the door, and none of them is read from the original.
 */
export interface DoorFixture {
  index: number;
  node: string;
  /** The two ends of the crossing, each on the probe's floor. */
  from: V3;
  to: V3;
  /** The leaf's box centre, the ground axis it is crossed along (0 x, 2 z) and the side `from` is on (+1 / -1). */
  center: V3;
  axis: 0 | 2;
  sign: 1 | -1;
  offset: number;
}

/** The fixture's offsets from the leaf's centre, the floor difference allowed, the line's height (test geometry). */
const OFFSETS = [10, 15, 20] as const;
const FLOOR_DIFFERENCE = 4;
const LINE_OVER_FEET = 10;
/** Steps of `TICK` a swing is given to come to rest (10 s: every door on the disc swings in 0.7-1.0 s, research 92 §2). */
export const SWING_STEPS = 600;
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

/** Runs the door's animation to rest, at most `SWING_STEPS` ticks. */
export function swingToRest(doors: DoorSet, index: number): void {
  for (let k = 0; k < SWING_STEPS && doors.state(index).busy; k++) doors.step(TICK);
}

/** The yaw that faces from `a` toward `b` (`camera.ts`: the camera looks down its own -z). */
export const yawToward = (a: V3, b: V3): number => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])) * 180 / Math.PI;

/**
 * Walks a fresh SEAL from `from` toward `to` for `ticks` ticks on `grid`'s hull, and returns how far past the leaf's
 * centre it ended toward `to`: negative while it is still on `from`'s side.
 */
export function crossing(map: { ground: SimMap['ground'] }, f: DoorFixture, ticks: number, grid = groundGrid(map.ground)): number {
  const w = new Walker(grid);
  if (!w.place(f.from[0], f.from[1] + PROBE_LIFT, f.from[2])) throw new Error(`door ${f.index}: no floor at the crossing's start`);
  w.state.yaw = yawToward(f.from, f.to);
  for (let k = 0; k < ticks; k++) w.tick(FORWARD);
  const at = f.axis === 0 ? w.state.x : w.state.z;
  return (at - f.center[f.axis]) * f.sign;
}

/**
 * A crossing for door `index` of `map`: both ends on a floor within `FLOOR_DIFFERENCE` of each other and in the door's
 * reach (`doorInReach`), the line between them blocked while the door is shut and clear once it has swung open.
 * Throws when no offset on either side gives one.
 */
export function doorFixture(map: SimMap, index: number): DoorFixture {
  const ground = { ...map.ground, points: Float32Array.from(map.ground.points) };
  const doors = new DoorSet(map.doors ?? [], ground);
  const grid = groundGrid(ground);
  const all = doors.leaf(index).flatMap((p) => Array.from({ length: p.length / 3 }, (_, i): V3 => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]));
  if (all.length === 0) throw new Error(`door ${index}: no leaf polygons`);
  const min = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k]!))) as V3;
  const max = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k]!))) as V3;
  const center = min.map((n, k) => (n + max[k]!) / 2) as V3;
  const axis: 0 | 2 = max[0] - min[0] < max[2] - min[2] ? 0 : 2;
  const line = (p: V3): V3 => [p[0], p[1] + LINE_OVER_FEET, p[2]];
  for (const sign of [1, -1] as const) {
    for (const offset of OFFSETS) {
      const from: V3 = [...center], to: V3 = [...center];
      from[axis] -= sign * offset;
      to[axis] += sign * offset;
      const f = probeFloor(grid, from[0], min[1] + 2, from[2]);
      const t = probeFloor(grid, to[0], min[1] + 2, to[2]);
      if (!f || !t || Math.abs(f.y - t.y) > FLOOR_DIFFERENCE) continue;
      from[1] = f.y;
      to[1] = t.y;
      if (!doorInReach(doors, index, from) || !doorInReach(doors, index, to)) continue;
      if (!segmentHit(grid, line(from), line(to))) continue;      // not blocked shut: not a crossing through the leaf
      doors.use(index);
      swingToRest(doors, index);
      const open = segmentHit(grid, line(from), line(to));
      doors.use(index);
      swingToRest(doors, index);
      if (open) continue;                                         // still blocked open: the leaf is not what blocked it
      return { index, node: map.doors![index]!.node, from, to, center, axis, sign, offset };
    }
  }
  throw new Error(`door ${index}: no floor-valid crossing blocked shut and clear open`);
}
