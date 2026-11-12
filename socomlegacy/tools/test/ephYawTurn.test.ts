import { describe, expect, it } from 'vitest';
import { YAW_TAP_MAX_MS, YAW_TAP_MIN_MS, YAW_TAP_MS_PER_DEG, YAW_TURN_GIVE_UP_MS, parseYawTurns, turnKey, wrap180, yawTapMs, yawTarget } from '../eph/yawTurn';

/**
 * The probe's closed-loop turns (`--yaw-turns`, the ENEMY-RAISE O-runs; 30's call 2026-11-09: away to slot 5's yaw + 70
 * +/- 3, back to it +/- 2). The sign: the right stick's left half (rleft) raises raiseYaw (the pilot of 2026-11-09:
 * 180.0 -> 245.1 under rleft). Product track: an instrument.
 */
describe('the probe: closed-loop yaw turns', () => {
  it('reads "<t_ms>:<relative deg>[:<tol deg>]" turns in time order', () => {
    expect(parseYawTurns('1000:+70:3,10750:0:2')).toEqual([{ t: 1000, rel: 70, tol: 3 }, { t: 10750, rel: 0, tol: 2 }]);
    expect(parseYawTurns('500:-40')).toEqual([{ t: 500, rel: -40, tol: 2 }]);
    expect(() => parseYawTurns('1000')).toThrow(/t_ms:deg/);
    expect(() => parseYawTurns('2000:10,1000:0')).toThrow(/order/);
  });

  it('wraps an angle difference into (-180, 180]', () => {
    expect(wrap180(190)).toBeCloseTo(-170, 9);
    expect(wrap180(-190)).toBeCloseTo(170, 9);
    expect(wrap180(180)).toBeCloseTo(180, 9);
  });

  it('turns toward the target: rleft raises the yaw, rright lowers it, none inside the tolerance', () => {
    expect(turnKey(180, 250, 3)).toBe('rleft');
    expect(turnKey(250, 180, 2)).toBe('rright');
    expect(turnKey(181, 180, 2)).toBeNull();
    expect(turnKey(-178, 178, 2)).toBe('rright');   // across the wrap: -178 is 182, so lower it
  });

  it('puts the target relative to the case start, wrapped into (-180, 180]', () => {
    expect(yawTarget(180, 70)).toBeCloseTo(-110, 9);
    expect(yawTarget(173.8, 0)).toBeCloseTo(173.8, 9);
  });

  it('scales an overshoot tap with the error left (the batch review: fixed 40 ms taps hunted at +/-0.5 degrees), 15..60 ms', () => {
    expect([YAW_TAP_MIN_MS, YAW_TAP_MAX_MS, YAW_TAP_MS_PER_DEG, YAW_TURN_GIVE_UP_MS]).toEqual([15, 60, 10, 6000]);
    expect(yawTapMs(0.5)).toBe(15);
    expect(yawTapMs(-3)).toBe(30);
    expect(yawTapMs(4.5)).toBe(45);
    expect(yawTapMs(-20)).toBe(60);
    expect(yawTapMs(1)).toBeLessThan(yawTapMs(-5));
  });

  it("compares raiseYaw's (-360, 360] (2 atan2) with a (-180, 180] target through the wrap", () => {
    expect(turnKey(200, yawTarget(180, 20), 2)).toBeNull();     // 200 is -160
    expect(turnKey(-340, yawTarget(0, 20), 2)).toBeNull();      // -340 is 20
    expect(turnKey(350, yawTarget(0, 0), 2)).toBe('rleft');     // 350 is -10: raise it
  });
});
