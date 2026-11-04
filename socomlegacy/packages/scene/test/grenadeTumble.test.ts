import { describe, expect, it } from 'vitest';
import {
  GAME_FRAME_DT, grenadeSpinRates, launchGrenade, M67, stepGrenade, TUMBLE, TUMBLE_START_PLACEHOLDER, tumbleEulerY, tumbleQuaternion,
  type HullCast, type HullHit, type ThrowableRecord, type V3,
} from '../src/index';

/**
 * The hand grenade's tumble (PF-07a; research 202 §2.6 item 20 and its V5 §7.2, overriding C3/V1 by research 206 §1.1):
 * the free-flight step `FUN_003c9530` (D:L319776-319845) turns a category-0x79 projectile's model by the distance it
 * moved this step, up to 50 half-turns a second, through three angles (`+0x9c`, `+0xa0`, `+0xa4`) built into a
 * quaternion by `FUN_00307360` (D:L206242-206268) and set on the model's node (`FUN_00315790` -> `FUN_00307170`).
 */

const nothing: HullCast = () => [];
const close = (a: readonly number[], b: readonly number[], digits = 9): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
};

describe('the rates by the step\'s distance (FUN_003c9530 D:L319790-319822)', () => {
  it('a step over 15 units spins at the most: 10, 2.5 and 50 half-turns a second', () => {
    close(grenadeSpinRates(20, 0), [10, 2.5, 50]);
    close(grenadeSpinRates(15.0001, 0), [10, 2.5, 50]);            // the code's `15.0 < d`: the jump back to the most
    expect(TUMBLE.max).toEqual([10, 2.5, 50]);
  });

  it('from half a unit to 15 the rates fall linearly by t = (d - 0.5) / 15: 10 - 9.5t, 2.5 - 2t, 50 - 49.5t', () => {
    close(grenadeSpinRates(0.5, 0), [10, 2.5, 50]);
    close(grenadeSpinRates(1, 0), [10 - 9.5 / 30, 2.5 - 2 / 30, 50 - 49.5 / 30]);
    close(grenadeSpinRates(10, 0), [10 - 9.5 * (9.5 / 15), 2.5 - 2 * (9.5 / 15), 50 - 49.5 * (9.5 / 15)]);
    close(grenadeSpinRates(15, 0), [10 - 9.5 * (14.5 / 15), 2.5 - 2 * (14.5 / 15), 50 - 49.5 * (14.5 / 15)]);   // (0.82, 0.57, 2.15)
  });

  it('under half a unit it settles with a wobble while |the Euler y| > 0.2: (1 - y) x (0.1, 0.4, 0.02); else, and at 0, none', () => {
    close(grenadeSpinRates(0.3, 0.5), [0.05, 0.2, 0.01]);
    close(grenadeSpinRates(0.3, -1), [0.2, 0.8, 0.04]);
    expect(grenadeSpinRates(0.3, 0.2)).toEqual([0, 0, 0]);            // the test is `0.2 < |y|`
    expect(grenadeSpinRates(0.3, -0.1)).toEqual([0, 0, 0]);
    expect(grenadeSpinRates(0, 3)).toEqual([0, 0, 0]);                // `d != 0`
  });
});

describe('the angles into the model\'s turn (FUN_00307360, FUN_00307170, FUN_00308020)', () => {
  it('builds the quaternion from half-angles: the first angle turns about y, the second about x, the third about z', () => {
    const a = 0.7;
    close(tumbleQuaternion([a, 0, 0]), [0, Math.sin(a / 2), 0, Math.cos(a / 2)]);
    close(tumbleQuaternion([0, a, 0]), [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]);
    close(tumbleQuaternion([0, 0, a]), [0, 0, Math.sin(a / 2), Math.cos(a / 2)]);
  });

  it('composes the three as FUN_00307360 writes them, a unit quaternion', () => {
    const [x, y, z] = [0.4, 1.1, 2.3];
    const sx = Math.sin(x / 2), cx = Math.cos(x / 2), sy = Math.sin(y / 2), cy = Math.cos(y / 2), sz = Math.sin(z / 2), cz = Math.cos(z / 2);
    const q = tumbleQuaternion([x, y, z]);
    close(q, [sx * cy * sz + cx * sy * cz, sx * cy * cz - cx * sy * sz, cx * cy * sz - sx * sy * cz, sx * sy * sz + cx * cy * cz]);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });

  it('reads the Euler y back off the node\'s matrix: atan2(m8, m10), the first angle when it is the only one', () => {
    expect(tumbleEulerY(tumbleQuaternion([0.6, 0, 0]))).toBeCloseTo(0.6, 9);
    expect(tumbleEulerY(tumbleQuaternion([-1.2, 0, 0]))).toBeCloseTo(-1.2, 9);
    expect(tumbleEulerY(tumbleQuaternion([0, 0.5, 2]))).toBeCloseTo(0, 9);
    expect(tumbleEulerY([0, 0, 0, 1])).toBe(0);
  });
});

describe('the free step turns a hand grenade, once per game frame (stepGrenade)', () => {
  it('starts at the placeholder\'s angles and advances each by rate x pi x dt for the step\'s own distance', () => {
    const g = launchGrenade([0, 500, 0], [300, 0, 0], M67);
    expect(g.tumble).toEqual([...TUMBLE_START_PLACEHOLDER]);
    const start: V3 = [...g.pos];
    stepGrenade(g, GAME_FRAME_DT, nothing);
    const d = Math.hypot(g.pos[0] - start[0], g.pos[1] - start[1], g.pos[2] - start[2]);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(15);
    const r = grenadeSpinRates(d, 0);
    close(g.tumble, r.map((v) => v * Math.PI * GAME_FRAME_DT));
  });

  it('wraps an angle past 2 pi by one turn, as the code does', () => {
    const g = launchGrenade([0, 500, 0], [600, 0, 0], M67);                // 20 units a frame: the most
    g.tumble = [0, 0, 2 * Math.PI - 0.01];
    stepGrenade(g, GAME_FRAME_DT, nothing);
    expect(g.tumble[2]).toBeCloseTo(2 * Math.PI - 0.01 + 50 * Math.PI * GAME_FRAME_DT - 2 * Math.PI, 9);
  });

  it('a bounce does not run the free step; at rest nothing turns; a round that is no hand grenade never tumbles', () => {
    const floor: HullHit = {
      point: [0, 0, 0], normal: [0, 1, 0], t: 0.5,
      material: { name: 'STONE', penetration: 0, elasticity: 0.5, impactRadiusMod: 1, volumetric: false, liquid: false, underwater: false, pickup: false },
    };
    const g = launchGrenade([0, 5, 0], [0, -300, 0], M67);
    g.tumble = [1, 2, 3];
    const events = stepGrenade(g, GAME_FRAME_DT, () => [floor]);
    expect(events.some((e) => e.kind === 'bounce')).toBe(true);
    expect(g.tumble).toEqual([1, 2, 3]);
    g.state = 'rest';
    stepGrenade(g, GAME_FRAME_DT, nothing);
    expect(g.tumble).toEqual([1, 2, 3]);
    const round: ThrowableRecord = { ...M67, name: 'M203 FRAG', id: 175 };
    const r = launchGrenade([0, 500, 0], [300, 0, 0], round);
    stepGrenade(r, GAME_FRAME_DT, nothing);
    expect(r.tumble).toEqual([...TUMBLE_START_PLACEHOLDER]);
  });
});
