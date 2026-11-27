// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, groundPolygons, packGround, probeLiftOf, Walker } from '../src/mover';
import { Traversal } from '../src/traversal';

/**
 * Kill item 1's side stand-off (pilot/kill/keyjob-side-standoff-read.md, seat-kill's Fable read; reading, pending review):
 * r0004's segment fan (0x54f700) is built on the frame's MOVE, not the facing, so a strafe meets a wall with the same lines
 * as a forward walk; on a wide, tall face a depth over 1 always comes with 3-4 hits, which zero the displacement (r0004
 * 0x54d894-0x54d8ec), so the "depth less 1" push does not run and the rest is the FIRST HIT: anywhere in [5.39, 5.39 + v),
 * v the frame's move (2.17 at 65 u/s), by the start distance modulo one frame's move. IQ-152 capture 2 (r0004, a capture,
 * unscored: 5.684 strafing right into MP51 wc23A), the port's 7.392 at the same face (`standoffWc23aDisc.test.ts`) and
 * research 217's 6.78 are points of that band. The port runs the same rule (`resolveSegments`, the jam; r0001
 * `FUN_005483d0` D:L413601-413614). This pins the band and that strafing equals walking forward; no behaviour change.
 */
const WALL_X = 40;
function wallGround() {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const q = (path: string, pts: number[]): WorldPoly => ({ modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts) });
  const polys = [
    q('worldmodel/floor', [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    q('worldmodel/wall', [WALL_X, 0, -500, WALL_X, 0, 500, WALL_X, 60, 500, WALL_X, 60, -500]),
  ];
  return packGround(params, polys, [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: polys.length }] as CollisionOwner[]);
}

/** The rest from the wall's plane after 2 s of full stick from `startX`, strafing right (yaw 0) or walking forward (yaw -90). */
function rest(startX: number, how: 'strafe' | 'forward'): number {
  const g = wallGround(), grid = groundGrid(g);
  const w = new Walker(grid);
  w.driver = new Traversal(grid, groundPolygons(g));
  expect(w.place(startX, probeLiftOf('stand'), 0)).toBe(true);
  w.state.yaw = how === 'strafe' ? 0 : -90;
  for (let i = 0; i < 120; i++) w.tick(how === 'strafe' ? { forward: 0, right: 1, boost: false } : { forward: 1, right: 0, boost: false });
  return WALL_X - w.state.x;
}

describe('the side stand-off is the first hit, in [5.39, 5.39 + one frame\'s move), strafing as forward (Kill item 1)', () => {
  const starts = Array.from({ length: 8 }, (_, i) => -20 + i * 0.3);       // 0.3 u apart: one frame's move and more
  it('every start rests within the band, and r0004\'s 5.684 and the port\'s 7.045 lie in it', () => {
    const rests = starts.map((x) => rest(x, 'strafe'));
    for (const r of rests) { expect(r).toBeGreaterThanOrEqual(5.39 - 0.05); expect(r).toBeLessThan(5.39 + 2.17 + 0.05); }
    expect(Math.max(...rests) - Math.min(...rests)).toBeGreaterThan(1);    // the band is swept, not one point
  });
  it('strafing right and walking forward rest at the same distance from every start (the fan follows the move)', () => {
    for (const x of starts) expect(rest(x, 'strafe')).toBeCloseTo(rest(x, 'forward'), 6);
  });
});
