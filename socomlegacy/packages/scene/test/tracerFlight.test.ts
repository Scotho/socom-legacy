import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '../src/gameFrame';
import {
  TRACER_ACCEL, TRACER_ANIM, TRACER_DEFAULT_RANGE, TRACER_MIN_SHOT, TRACER_POOL, launchTracer, stepTracer, tracerHead,
  tracerKindFor,
} from '../src/tracerFlight';

/**
 * A tracer's launch and flight, the original's (#425's takeover; research 89 §19): `FUN_003d5030` launches it from the
 * round's tracer branch (`FUN_003cabe0` D:L320537-320553) and the world's projectile tick steps it a game frame at a
 * time (`FUN_003d4bf0` D:L327055-327093). Was (#425 as filed): `½·a·t²` per page frame from the muzzle, every shot.
 */
const at = (r: number) => () => r;

describe("a tracer's launch (FUN_003d5030)", () => {
  it('launches nothing for a shot shorter than 70 units (D:L327195-327196)', () => {
    expect(TRACER_MIN_SHOT).toBe(70);
    expect(launchTracer([0, 0, 0], [0, 0, -69.9], at(0))).toBeNull();
    expect(launchTracer([0, 0, 0], [0, 0, -70], at(0))).not.toBeNull();
  });

  it("starts `(rand() % 990 + 1) / 10` units down the shot -- 0.1 to 99.0 -- at speed 0 (D:L327213-327223, D:L327231)", () => {
    expect(tracerHead(launchTracer([0, 0, 0], [0, 0, -500], at(0))!)).toEqual([0, 0, expect.closeTo(-0.1, 6)]);
    expect(tracerHead(launchTracer([0, 0, 0], [0, 0, -500], at(0.99999))!)).toEqual([0, 0, expect.closeTo(-99, 6)]);
    expect(launchTracer([0, 0, 0], [0, 0, -500], at(0.5))!.speed).toBe(0);
  });

  it("its range is the weapon's (`FUN_003d27f0`), or 300 without one (D:L327232-327236)", () => {
    expect(TRACER_DEFAULT_RANGE).toBe(300);
    expect(launchTracer([0, 0, 0], [0, 0, -500], at(0))!.range).toBe(300);
    expect(launchTracer([0, 0, 0], [0, 0, -500], at(0), 10000)!.range).toBe(10000);
  });
});

describe("a tracer's flight (FUN_003d4bf0), one game frame a step", () => {
  it('each frame: speed += dt x 400, then a step of speed + 1 units toward the end -- not scaled by dt', () => {
    expect(TRACER_ACCEL).toBe(400);
    const f = launchTracer([0, 0, 0], [0, 0, -5000], at(0), 10000)!;   // starts at 0.1
    expect(stepTracer(f, GAME_FRAME_DT)).toBe(false);
    const v1 = 400 * GAME_FRAME_DT;
    expect(f.speed).toBeCloseTo(v1, 6);
    expect(tracerHead(f)[2]).toBeCloseTo(-(0.1 + v1 + 1), 6);
    stepTracer(f, GAME_FRAME_DT);
    expect(tracerHead(f)[2]).toBeCloseTo(-(0.1 + v1 + 1 + 2 * v1 + 1), 6);
  });

  it('a step that would pass the end snaps to it and retires', () => {
    const f = launchTracer([0, 0, 0], [0, 0, -80], at(0), 10000)!;
    let n = 0;
    while (!stepTracer(f, GAME_FRAME_DT) && n < 100) n++;
    expect(tracerHead(f)).toEqual([0, 0, -80]);
    expect(f.done).toBe(true);
    expect(stepTracer(f, GAME_FRAME_DT)).toBe(true);
  });

  it('retires once its speed passes the range, wherever it is', () => {
    const f = launchTracer([0, 0, 0], [0, 0, -1e6], at(0), 20)!;
    let n = 0;
    while (!stepTracer(f, GAME_FRAME_DT)) n++;
    expect(f.speed).toBeGreaterThan(20);
    expect(n).toBe(Math.floor(20 / (400 * GAME_FRAME_DT)));
    expect(tracerHead(f)[2]).toBeGreaterThan(-1e6);
  });

  it('steers toward the end each frame: a start past a short shot walks back to it', () => {
    const f = launchTracer([0, 0, 0], [0, 0, -75], at(0.99999), 10000)!;   // starts at 99, past the end at 75
    while (!stepTracer(f, GAME_FRAME_DT)) { /* the step toward the end */ }
    expect(tracerHead(f)).toEqual([0, 0, -75]);
  });
});

describe("the tracer's zAnim (FUN_003d5030 D:L327199-327211, FUN_003cabe0 D:L320544-320548)", () => {
  it("the model is cleared (`DAT_003e1568` 1 on the disc) and the zAnim plays: the ally's, the enemy's -- and the turret's round (`+0xb4` 1, the enemy model) the enemy's", () => {
    expect(TRACER_ANIM).toEqual({ ally: 'tracer_ally_anim', enemy: 'tracer_enemy_anim', turret: 'tracer_enemy_anim' });
  });

  it("a turret weapon's round is the turret's kind; everyone else's ally on the viewer's side and enemy on the other", () => {
    expect(tracerKindFor(54, true)).toBe('ally');
    expect(tracerKindFor(54, false)).toBe('enemy');
    expect(tracerKindFor(205, true)).toBe('turret');
    expect(tracerKindFor(229, false)).toBe('turret');
    expect(TRACER_POOL).toBe(100);
  });
});
