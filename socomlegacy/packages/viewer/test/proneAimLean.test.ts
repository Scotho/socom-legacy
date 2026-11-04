import { describe, expect, it } from 'vitest';
import { buildGrid, SEAL_TUNING, type WorldPoly } from '@s2u/scene';
import { PRONE_AIM_LEAN_READING, proneAimLean } from '../src/look';
import { aimPitchLimits, aimPitchLimitsOf } from '../src/net/lookGate';
import { pitchLimits } from '../src/playerCamera';
import { Walker } from '../src/mover';

/**
 * PRONE-TILT-2 (1) (research 217 s7.6; reading, pending review): `FUN_00594600`'s prone branch (D:L452839-452884) leans
 * the prone aim limits by the slope along the facing -- the dot of the floor normal saved at `actor+0x1344..+0x134c`
 * with the model's forward (`DAT_003f6500`, (0, 0, -1)) turned by the actor's matrix, `pi/2 - acos|d|` negated when d is
 * positive, added to both limits. Uphill the limits rise by the slope, downhill they fall, across they stand.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
/** Uphill toward -z (the facing at yaw 0): the normal leans back, +z. */
const UPHILL_20 = [0, Math.cos(rad(20)), Math.sin(rad(20))] as const;
const [PRONE_MIN, PRONE_MAX] = SEAL_TUNING.proneAimPitch;

function plane(n: readonly number[]): { grid: ReturnType<typeof buildGrid>; y: (x: number, z: number) => number } {
  const y = (x: number, z: number): number => -(n[0]! * x + n[2]! * z) / n[1]!;
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, y(-200, 200), 200, 200, y(200, 200), 200, 200, y(200, -200), -200, -200, y(-200, -200), -200]),
  };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
  return { grid, y };
}

describe('the prone aim limits lean with the slope along the facing (FUN_00594600 D:L452839-452884)', () => {
  it('the lean on a 20-degree slope: +20 facing uphill, -20 facing downhill, 0 across; flat ground none', () => {
    expect(PRONE_AIM_LEAN_READING).toBe('saved-floor');
    expect(proneAimLean(UPHILL_20, 0)).toBeCloseTo(20, 9);        // facing -z, up the slope
    expect(proneAimLean(UPHILL_20, 180)).toBeCloseTo(-20, 9);     // facing +z, down it
    expect(proneAimLean(UPHILL_20, 90)).toBeCloseTo(0, 9);        // across
    expect(proneAimLean(UPHILL_20, -90)).toBeCloseTo(0, 9);
    expect(proneAimLean(UPHILL_20, 45)).toBeCloseTo((Math.asin(Math.sin(rad(20)) * Math.SQRT1_2) * 180) / Math.PI, 9);
    expect(proneAimLean([0, 1, 0], 0)).toBe(0);
    expect(proneAimLean([0, 1, 0], 123)).toBe(0);
    // |d| at or past 1 (a normal along the facing): acos is taken as 0, the term a quarter turn (D:L452868-452870)
    expect(proneAimLean([0, 0, 1], 0)).toBeCloseTo(90, 9);
    expect(proneAimLean([0, 0, -1], 0)).toBeCloseTo(-90, 9);
  });

  it('the limits: the prone pair moved by the lean, both ends; the standing pair never; the camera\'s the same numbers', () => {
    expect(aimPitchLimits('prone', 20)).toEqual([PRONE_MIN + 20, PRONE_MAX + 20]);
    expect(aimPitchLimits('prone', -20)).toEqual([PRONE_MIN - 20, PRONE_MAX - 20]);
    expect(aimPitchLimits('prone')).toEqual([PRONE_MIN, PRONE_MAX]);
    expect(aimPitchLimits('stand', 20)).toEqual([...SEAL_TUNING.aimPitch]);
    expect(pitchLimits('prone', 20)).toEqual(aimPitchLimits('prone', 20));
    expect(pitchLimits('crouch', 20)).toEqual(aimPitchLimits('crouch', 20));
  });

  it('a walker keeps the floor normal it stands on (+0x1344) and its prone limits lean by it; standing they do not', () => {
    const { grid, y } = plane(UPHILL_20);
    const w = new Walker(grid);
    expect(w.place(0, y(0, 0) + 5, 0)).toBe(true);
    expect(w.floorNormal[0]).toBeCloseTo(UPHILL_20[0], 6);
    expect(w.floorNormal[1]).toBeCloseTo(UPHILL_20[1], 6);
    expect(w.floorNormal[2]).toBeCloseTo(UPHILL_20[2], 6);
    w.state.yaw = 0;
    expect(aimPitchLimitsOf(w)).toEqual([...SEAL_TUNING.aimPitch]);   // standing: no lean
    w.stance = 'prone';
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(w.posture).toBe('prone');
    const [lo, hi] = aimPitchLimitsOf(w);
    expect(lo).toBeCloseTo(PRONE_MIN + 20, 4);
    expect(hi).toBeCloseTo(PRONE_MAX + 20, 4);
    w.state.yaw = 180;
    expect(aimPitchLimitsOf(w)[0]).toBeCloseTo(PRONE_MIN - 20, 4);
    w.state.yaw = 90;
    expect(aimPitchLimitsOf(w)[1]).toBeCloseTo(PRONE_MAX, 4);
    // crawled up the slope, the saved normal is the slope's still; the kept state carries it -- laid on a walker standing
    // on flat ground (another normal), the slope's normal and its lean come back with it
    w.state.yaw = 0;
    for (let i = 0; i < 60; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.floorNormal[2]).toBeCloseTo(UPHILL_20[2], 6);
    const kept = w.saveState();
    const keptLimits = aimPitchLimitsOf(w);
    expect(keptLimits[0]).toBeCloseTo(PRONE_MIN + 20, 4);
    const flat = new Walker(plane([0, 1, 0]).grid);
    flat.place(0, 5, 0);
    expect(flat.floorNormal).toEqual([0, 1, 0]);
    flat.restoreState(kept);
    expect(flat.floorNormal).toEqual(w.floorNormal);
    expect(aimPitchLimitsOf(flat)).toEqual(keptLimits);
  });

  it('flat ground: the prone limits are the prone pair, whatever the facing', () => {
    const { grid } = plane([0, 1, 0]);
    const w = new Walker(grid);
    expect(w.place(0, 5, 0)).toBe(true);
    w.stance = 'prone';
    for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false });
    for (const yaw of [0, 90, 180, 270, 33]) {
      w.state.yaw = yaw;
      expect(aimPitchLimitsOf(w)).toEqual([PRONE_MIN, PRONE_MAX]);
    }
  });
});
