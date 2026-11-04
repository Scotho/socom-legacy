// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { moveClass, throttleSnaps, Walker, type Stance, type WalkInput } from '../src/mover';
import { moveStick } from '../src/moveStick';

/**
 * Parity pins for the walk's speeds and the stick's ramp (web research 88 sections 2-3, the mover's header: `FUN_00586c10`,
 * `FUN_00583350`, `FUN_00584c60`, `FUN_00583500`, `FUN_005858a0`, `FUN_002da930`), unit tier: a flat synthetic floor,
 * no game data. The values are literals or the law computed here from literals (65, 37, 14.8, 13.5, 15, 11, 5.5 a
 * second; `lower/upper_z_accel` 2 and 5; 60 Hz), never the mover's own constants. Research 88's table holds most of these
 * within 2 %; here they are held to the unit's sixth decimal and on both sides of each threshold.
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

const input = (forward: number, right: number): WalkInput => ({ forward, right, boost: false });

/** Per-tick speeds (units a second) over `ticks` ticks of `wish` from rest in `stance`. */
function speeds(wish: WalkInput, ticks: number, stance: Stance = 'stand'): { w: Walker; v: number[] } {
  const w = new Walker(GRID);
  w.place(0, 0, 0);
  w.stance = stance;
  const v: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const x = w.state.x, z = w.state.z;
    w.tick(wish);
    v.push(Math.hypot(w.state.x - x, w.state.z - z) / DT);
  }
  return { w, v };
}
const steady = (wish: WalkInput, stance: Stance = 'stand'): number => speeds(wish, 120, stance).v[119]!;

describe('movement.speed: the stick ramp, tick by tick (FUN_00586c10: lower/upper accel 2 and 5, the 8th power)', () => {
  it('one second of full forward from rest covers 59.042: twelve ticks of the ramp, then 65 a second', () => {
    const { w } = speeds(input(1, 0), 60);
    // the stick moves 5 a second: n / 12 of the band on tick n, full from tick 12
    let law = 0;
    for (let n = 1; n <= 60; n++) law += Math.min(1, n / 12) * 65 * DT;
    expect(law).toBeCloseTo(59.0417, 4);
    expect(Math.hypot(w.state.x, w.state.z)).toBeCloseTo(law, 9);
  });

  it('a light push ramps at lower_accel 2 + 3 (1 - (1 - |t|)^8): the first tick of 0.1 is 4.018 a second, of 0.5 is 5.404', () => {
    const limit = (t: number): number => 2 + 3 * (1 - (1 - t) ** 8);
    expect(speeds(input(0.1, 0), 1).v[0]).toBeCloseTo(limit(0.1) * DT * 65, 9);
    expect(speeds(input(0.1, 0), 1).v[0]).toBeCloseTo(4.0176, 4);
    expect(speeds(input(0.5, 0), 1).v[0]).toBeCloseTo(limit(0.5) * DT * 65, 9);
    expect(speeds(input(0.5, 0), 1).v[0]).toBeCloseTo(5.4040, 4);
    // the lateral axis takes lower/upper_x_accel, the same 2 and 5 (dynamics.rdr)
    expect(speeds(input(0, 0.1), 1).v[0]).toBeCloseTo(4.0176, 4);
    // half a stick reaches its 32.5 on tick 7 (0.5 / (4.988 / 60) = 6.01 ticks), not before
    const half = speeds(input(0.5, 0), 8).v;
    expect(half[5]).toBeLessThan(32.5 - 1e-6);
    expect(half[6]).toBeCloseTo(32.5, 9);
  });

  it('backing up ramps to seal_run_bw\'s 37: 37 x 5 / 60 on the first tick, 37 from tick 12', () => {
    const { v } = speeds(input(-1, 0), 13);
    expect(v[0]).toBeCloseTo(37 * 5 * DT, 9);
    expect(v[10]).toBeLessThan(37);
    expect(v[11]).toBeCloseTo(37, 9);
  });

  it('the snap: forward past 0.9 at more than 9 a second, lateral past 0.78 at more than 7.8, on both sides of each edge', () => {
    expect(throttleSnaps(0.91, 0, 'forward', DT)).toBe(true);
    expect(throttleSnaps(0.89, 0, 'forward', DT)).toBe(false);
    expect(throttleSnaps(1, 1 - 9.1 * DT, 'forward', DT)).toBe(true);
    expect(throttleSnaps(1, 1 - 8.9 * DT, 'forward', DT)).toBe(false);
    expect(throttleSnaps(0.79, 0, 'right', DT)).toBe(true);
    expect(throttleSnaps(0.77, 0, 'right', DT)).toBe(false);
    expect(throttleSnaps(-1, -1 + 7.9 * DT, 'right', DT)).toBe(true);
    expect(throttleSnaps(-1, -1 + 7.7 * DT, 'right', DT)).toBe(false);
  });
});

describe('movement.speed: the stances\' speeds (FUN_00584c60, FUN_00583500, motion.rdr bands)', () => {
  it('crouched under 0.838 of a stick: 14.0 ahead, 12.77 back, 14.19 aside, 19.80 on the diagonal (x 14 / 14.8 of each band)', () => {
    const k = 14 / 14.8;
    expect(steady(input(0.5, 0), 'crouch')).toBeCloseTo(k * 14.8, 6);
    expect(steady(input(0.5, 0), 'crouch')).toBeCloseTo(14.0, 6);
    expect(steady(input(-0.5, 0), 'crouch')).toBeCloseTo(k * 13.5, 6);
    expect(steady(input(0, 0.5), 'crouch')).toBeCloseTo(k * 15, 6);
    expect(steady(input(0, -0.5), 'crouch')).toBeCloseTo(k * 15, 6);
    // FUN_00583350's 1 / sqrt(w^2 + (1 - w)^2) scales the crouch walk's single set: x sqrt 2 at 45 degrees
    expect(steady(input(0.5, 0.5), 'crouch')).toBeCloseTo(k * 14.8 * Math.SQRT2, 6);
    expect(steady(input(0.5, 0.5), 'crouch')).toBeCloseTo(19.80, 2);
  });

  it('crouched at 0.838 of a stick or more it stands and runs: 0.83 crouch-walks at 14.0, 0.84 runs at 54.6', () => {
    expect(steady(input(0.83, 0), 'crouch')).toBeCloseTo(14.0, 6);
    expect(steady(input(0.84, 0), 'crouch')).toBeCloseTo(0.84 * 65, 6);
  });

  it('prone: the crawl 11 ahead and back, the strafe 5.5, and W+D crawls 11 on the class\'s one axis, with no ramp', () => {
    expect(speeds(input(1, 0), 1, 'prone').v[0]).toBeCloseTo(11, 9);    // no FUN_00586c10: full on the first tick
    expect(steady(input(-1, 0), 'prone')).toBeCloseTo(11, 9);
    expect(steady(input(0, 1), 'prone')).toBeCloseTo(5.5, 9);
    expect(steady(input(0, -1), 'prone')).toBeCloseTo(5.5, 9);
    expect(steady(input(1, 1), 'prone')).toBeCloseTo(11, 9);
  });

  it('the direction class (FUN_005858a0): an axis dominates when the other is at most 0.839 of it; between, the last class holds', () => {
    expect(moveClass(0.83, 1, 0)).toBe(1);                  // forward dominates
    expect(moveClass(0.85, 1, 0)).toBe(0);                  // the diagonal band: the last class (right) holds
    expect(moveClass(0.85, 1, 1)).toBe(1);                  // ... and so does forward
    expect(moveClass(1, 0.83, 1)).toBe(0);                  // right dominates
    expect(moveClass(-1, -0.83, 3)).toBe(2);
    expect(moveClass(0, -1, -1)).toBe(3);
    expect(moveClass(0, 0, 2)).toBe(-1);
  });
});

describe('movement.stick: the pad\'s left stick into the walk (FUN_002da930 on the left block, research 88 section 3)', () => {
  it('byte 64 (half a stick) walks 26.006 and byte 32 (three quarters) 58.965; the run is full from 0.795 of the travel', () => {
    const axis = (byte: number): number => (127.5 - byte) * 0.007843138;
    const at = (byte: number): number => steady(input(moveStick(0, axis(byte))[1], 0));
    expect(at(64)).toBeCloseTo(26.006, 3);
    expect(at(32)).toBeCloseTo(58.965, 3);
    expect(moveStick(0, 0.3 + 0.7 / Math.SQRT2 + 1e-9)[1]).toBeCloseTo(1, 9);
    expect(moveStick(0, 0.79)[1]).toBeLessThan(1);
    expect(moveStick(0, 0.2999)[1]).toBe(0);                // 0.3 a side is dead
    expect(moveStick(1, 1)).toEqual([1, 1]);                // a full diagonal is (1, 1): no unit disc
  });
});
