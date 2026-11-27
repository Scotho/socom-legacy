import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type WorldPoly } from '@s2u/scene';
import { GROUND_WALLS_PER_TICK_READING, Walker } from '../src/mover';

/**
 * LATER 1194 (simulation track; reading, pending review): the walk meets its walls once a game frame, on the frame's
 * move from the frame's start (`GROUND_WALLS_PER_TICK_READING` 'per-frame').
 *
 * The original's segment ends at the feet + 1.1 x 1.4 r along the move plus the WHOLE frame displacement `+0xf44`
 * (`FUN_0054aa30` D:L415157-415166, D:L415395-415402), cast once a 30 Hz frame, and a deepest hit over 1 with more than
 * two hits puts the body back at the tick's start with the displacement zeroed (`FUN_005483d0` D:L413598-413609): a body
 * pressed into a wall a little off its normal HOLDS whenever the frame that first meets the wall reaches more than 1
 * deep -- (1, 2.17] of a run frame's 2.17, about 54 % of the phases, with every frame a whole frame (the original's
 * half-length frames end such a slide after a while; relay-2's separation look, `GROUND_WALLS_PER_TICK_READING`'s note;
 * unmodelled, `GROUND_HALF_STEP_READING`). Cast per 60 Hz tick on the tick's move (1.08 at the
 * run, 'per-tick') the segments are a tick's move shorter, almost never reach 1 deep, and the ordinary slide keeps the
 * run's tangential part: MP81's steel crate, 6.8 u/s along the far wall where the original holds (r0004 rig rows).
 *
 * A synthetic room: a floor at y 0 and one wall face at x 40 facing -x, 80 high, 100 wide. A standing body runs at it
 * at full stick, 6 degrees off its normal (yaw -84, MP81's), from 44 starts 0.05 apart -- one run frame's move -- so the
 * first hit falls at every phase of the frame. A run HOLDS when, from 30 ticks after its stop, its z moves less than
 * 0.5 u over the next 60 ticks (the slide moves 6.8 u in that time).
 */

const WALL_X = 40;
function room() {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-100, 0, -100, -100, 0, 100, 100, 0, 100, 100, 0, -100]) };
  const wall: WorldPoly = { modelName: 'worldmodel', path: 'wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([WALL_X, 0, -50, WALL_X, 0, 50, WALL_X, 80, 50, WALL_X, 80, -50]) };
  const polys = [floor, wall];
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return { grid: buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners), wall };
}

const GO = { forward: 1, right: 0, boost: false };
const REST = { forward: 0, right: 0, boost: false };

function run(startX: number): { held: boolean; stopX: number; drift: number } {
  const { grid } = room();
  const w = new Walker(grid);
  w.stance = 'stand';
  w.place(startX, 0.5, 0);
  w.state.yaw = -84;
  for (let i = 0; i < 30; i++) w.tick(REST);
  let stopAt = -1, lastX = w.state.x;
  for (let t = 0; t < 240 && stopAt < 0; t++) {
    w.tick(GO);
    if (t > 5 && Math.abs(w.state.x - lastX) < 1e-9) stopAt = t;
    lastX = w.state.x;
  }
  for (let t = 0; t < 30; t++) w.tick(GO);
  const z0 = w.state.z;
  for (let t = 0; t < 60; t++) w.tick(GO);
  const drift = Math.abs(w.state.z - z0);
  return { held: drift < 0.5, stopX: w.state.x, drift };
}

describe('LATER 1194: the walk meets its walls once a game frame (the jam at the frame depth)', () => {
  it('the room is as described: the wall faces -x, the floor up', () => {
    const { wall } = room();
    const n = polygonNormal(wall.points)!;
    expect(n[0]).toBeLessThan(0);
    expect(GROUND_WALLS_PER_TICK_READING).toBe('per-frame');
  });

  it('a run pressed into a wall 6 degrees off its normal holds at most phases, and never passes the face', () => {
    const runs = Array.from({ length: 44 }, (_, i) => run(-10 - i * 0.05));
    for (const r of runs) expect(r.stopX).toBeLessThan(WALL_X - 3.5);
    const held = runs.filter((r) => r.held).length;
    // The rule's window is (1, 2.17] of 2.17 (54 %); the port's own ramp and frame phase move the first hit's depth, so
    // the bound is set well under it and well over 'per-tick''s few.
    expect(held, runs.map((r) => `${r.stopX.toFixed(2)}:${r.drift.toFixed(2)}`).join(' ')).toBeGreaterThanOrEqual(15);
  });
});
