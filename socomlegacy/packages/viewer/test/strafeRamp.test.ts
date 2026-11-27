import { describe, expect, it } from 'vitest';
import { buildGrid, GAME_FRAME_DT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker, type Stance } from '../src/mover';

/**
 * LATER 1164 (simulation track; the owner's priority 2026-11-18, "with equal settings the two clients should move the
 * same when strafing"; the main controller's ruling ~02:55Z: within MISSION R8, parity clause 6). The original raises
 * the stick throttle one 1/6 step a game frame (`FUN_00586c10`, `upper_x_accel` / `upper_z_accel` 5 a second in
 * `dynamics.rdr`; R8.1's Q12 proved the read interval and the 1/6-a-frame ramp) and moves the WHOLE frame at the
 * frame's new value: r0004's own strafe from rest moves 0.363, 0.722, 1.084, 1.445, 1.807 and then 2.166 a frame (EPH
 * run eph-run-ac/runs/20261118T022816Z, 30 holds of 300 ms or more, the median per frame after the frame that first
 * reads the stick: a capture comparison, unscored). So after k frames of the ramp the body has moved
 * 65 x GAME_FRAME_DT x k(k + 1) / 12. The port runs the ramp continuously at 60 Hz (R8); at n/12 after tick n it moved
 * 0.271, 0.904, 1.898, 3.253, 4.970, 7.049 at those frame ends -- half a step behind, 0.54 short at the top, a tick
 * later to 90 %. Read half a tick ahead the continuous ramp lands on the original's frame ends (frames 1-5 to 0.01; the
 * sixth 0.05 short, where the read is capped at the stick) and keeps R8's 60 Hz running and its per-second totals.
 * Unit tier: a flat synthetic floor, no game data.
 */
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);
const STILL = { forward: 0, right: 0, boost: false };
/** The run's top speed both ways (the standing bands, `STANCE.stand.bands`). */
const TOP = 65;
/** r0004's frame-end distance after k frames of the ramp from rest: the frame's 1/6 step, then the whole frame moved. */
/** The port's 60 Hz ticks against the original's 525/15734 s frame: 0.1 % (0.006 at the fifth frame). */
const NEAR = 0.01;
const original = (k: number): number => TOP * GAME_FRAME_DT * (Math.min(k, 6) * (Math.min(k, 6) + 1) / 12 + Math.max(0, k - 6));

function placed(stance: Stance = 'stand'): Walker {
  const w = new Walker(GRID);
  w.place(0, 20, 0);
  w.state.yaw = 0;
  w.stance = stance;
  // LATER 1194B (the walls trial, 2026-11-21): rest to the end of a game frame, so the first press tick STARTS one and
  // each pair below is a frame (`throttleFrameEnds`: ends at 3, 5, 7 ... counted from the placing). LATER 1219 reads a
  // press from rest at a frame's start (`Walker.idleRead`), as the original copies the pad's axes once a frame; after 60
  // rest ticks the press tick (61) ended a frame, its read was held to 62, and the pairs (61-62, 63-64) straddled the frames.
  for (let i = 0; i < 59; i++) w.tick(STILL);
  return w;
}

/** The distance from rest after each pair of ticks (a game frame at 60 Hz) under a held stick. */
function frameEnds(w: Walker, input: { forward: number; right: number }, frames: number): number[] {
  const x0 = w.state.x, z0 = w.state.z, out: number[] = [];
  for (let k = 1; k <= frames; k++) {
    w.tick({ ...input, boost: false }); w.tick({ ...input, boost: false });
    out.push(Math.hypot(w.state.x - x0, w.state.z - z0));
  }
  return out;
}

describe('LATER 1164: the stick ramp lands on the original\'s frame ends (standing; R8, read half a tick ahead)', () => {
  it('a strafe from rest: 0.361, 1.084, 2.169, 3.615, 5.422 at frames 1-5 (r0004 0.363, 0.722, 1.084, 1.445, 1.807 a frame)', () => {
    for (const right of [-1, 1]) {
      const got = frameEnds(placed(), { forward: 0, right }, 10);
      for (let k = 1; k <= 5; k++) expect(Math.abs(got[k - 1]! - original(k)), `right ${right}, frame ${k}: ${got[k - 1]}`).toBeLessThan(NEAR);
      expect(got[5], `right ${right}, frame 6: the read capped at the stick`).toBeGreaterThan(original(6) - 0.06);
      expect(got[5]).toBeLessThanOrEqual(original(6) + 0.01);
      // At the top a frame is the run's whole frame (65 x two ticks), as r0004's 2.166.
      expect(got[9]! - got[8]!).toBeCloseTo(TOP * 2 * TICK, 3);
    }
  });

  it('a run forward from rest takes the same ramp (`upper_z_accel` 5 a second, as `upper_x_accel`)', () => {
    const got = frameEnds(placed(), { forward: 1, right: 0 }, 6);
    for (let k = 1; k <= 5; k++) expect(Math.abs(got[k - 1]! - original(k)), `frame ${k}: ${got[k - 1]}`).toBeLessThan(NEAR);
  });

  it('a reversal through a centre: the snap stops it at once, then the ramp from rest lands as from rest', () => {
    const w = placed();
    frameEnds(w, { forward: 0, right: -1 }, 10);
    w.tick(STILL); w.tick(STILL);
    const got = frameEnds(w, { forward: 0, right: 1 }, 5);
    for (let k = 1; k <= 5; k++) expect(Math.abs(got[k - 1]! - original(k)), `frame ${k}: ${got[k - 1]}`).toBeLessThan(NEAR);
  });
});
