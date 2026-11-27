// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type Stance, type TickDriver, type WalkInput } from '../src/mover';

/**
 * B-26 (the slope-and-stances read, atlas-waves, reading pending review; research 86 s5.3): the stick scale
 * `FUN_005bbb00` (r0004; r0001 `FUN_005b56c0`) has exactly three callers -- stand (D4:L485527), crouch walk
 * (D4:L484825) and crouch run (D4:L484835); r0001 D:L444163 / 444173 / 444865. Prone never calls it: `ProneControl`
 * `FUN_00588b00` takes the raw axes (D4:L484566) and reads no floor normal, so a prone crawl or strafe up a face keeps
 * its flat speed. Unit tier: a flat synthetic floor and a stubbed driver whose `stickScale` is the uphill law
 * (`1 - d^2` for `d < 0`, per axis past 0.03) against a fixed face normal; no game data, not a capture.
 */

const DT = 1 / 60;

function world(): Grid {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
  const owners: CollisionOwner[] = [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}
const GRID = world();

/** The capture's uphill face (B-26's crouched-strafe face): rising to the walker's right at yaw 0. */
const FACE: readonly [number, number, number] = [-0.641, 0.755, 0.140];
/** At yaw 0 forward is world -z and right world +x (the camera's -z, `mover.ts` step60). */
const dRight = FACE[0];                                          // n . (1, 0, 0) = -0.641: uphill to the right
const dForward = -FACE[2];                                       // n . (0, 0, -1) = -0.140: uphill ahead
const CUT_RIGHT = 1 - dRight * dRight;                           // 0.589
const CUT_FORWARD = 1 - dForward * dForward;                     // 0.980

/** A driver that never owns the tick and scales the stick as `Traversal.stickScale` does on `FACE`, at yaw 0. */
function sloped(): TickDriver {
  const uphill = (v: number, d: number): number => {
    if (Math.abs(v) < 0.03) return v;
    const s = Math.sign(v) * d;
    return s >= 0 ? v : v * (1 - s * s);
  };
  return {
    tick: () => false,
    stickScale: (_w: Walker, forward: number, right: number): [number, number] => [uphill(forward, dForward), uphill(right, dRight)],
  };
}

const input = (forward: number, right: number): WalkInput => ({ forward, right, boost: false });

/** Per-tick horizontal speeds over `ticks` ticks of `wish` from rest in `stance`, on the face or on flat ground. */
function speeds(wish: WalkInput, ticks: number, stance: Stance, face: boolean): number[] {
  const w = new Walker(GRID);
  if (face) w.driver = sloped();
  w.place(0, 0, 0);
  w.state.yaw = 0;
  w.stance = stance;
  const v: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const x = w.state.x, z = w.state.z;
    w.tick(wish);
    v.push(Math.hypot(w.state.x - x, w.state.z - z) / DT);
  }
  return v;
}
const steady = (wish: WalkInput, stance: Stance, face: boolean): number => speeds(wish, 120, stance, face)[119]!;

describe('B-26: prone takes the raw stick; the slope scale is stand and crouch only (FUN_00588b00, D4:L484566)', () => {
  it('the stub face is uphill on both axes (the law the guard below reads)', () => {
    expect(CUT_RIGHT).toBeCloseTo(0.589, 3);
    expect(CUT_FORWARD).toBeCloseTo(0.980, 3);
  });

  it('a prone strafe at full push up the face keeps the flat 5.5, with no 1 - d^2 cut', () => {
    expect(steady(input(0, 1), 'prone', false)).toBeCloseTo(5.5, 9);
    expect(speeds(input(0, 1), 1, 'prone', true)[0]).toBeCloseTo(5.5, 9);   // no ramp: full on the first tick
    expect(steady(input(0, 1), 'prone', true)).toBeCloseTo(5.5, 9);           // was 5.5 x 0.589 = 3.24
  });

  it('a prone crawl at full push up the face keeps the flat 11', () => {
    expect(steady(input(1, 0), 'prone', false)).toBeCloseTo(11, 9);
    expect(steady(input(1, 0), 'prone', true)).toBeCloseTo(11, 9);            // was 11 x 0.980 = 10.78
  });

  it('control: a standing strafe up the same face IS cut by 1 - d^2 (FUN_005bbb00 from the stand, D4:L485527)', () => {
    const flat = steady(input(0, 1), 'stand', false);
    const face = steady(input(0, 1), 'stand', true);
    expect(face).toBeLessThan(flat * 0.9);
    expect(face).toBeCloseTo(steady(input(0, CUT_RIGHT), 'stand', false), 3);
  });
});
