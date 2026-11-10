import { describe, expect, it } from 'vitest';
import {
  DEATH_CAM_SPIN_ADAPTATION, DEATH_KILLER_FOLLOW_S_ADAPTATION, DEATH_ORBIT_RATE, DEATH_STICK_RATE, DEATH_STICK_TAKEOVER,
  DEATH_STICK_TILT_READING, DEATH_STICK_TURN_SIGN_READING, DEATH_TILT_MAX, DEATH_TILT_MIN, deathEye, deathFar, deathStickOf,
  newDeathCamera, takeDeathControl, type DeathCamera,
} from '../src/deathCamera';
import { FULL_AXIS, MAX_YAW_RATE } from '../src/look';
import { SOLO_IS_NETWORK_READING } from '../src/net/loopback';

/**
 * The death camera's mode by the network flag (`FUN_002980d0` 141363-141375): with `DAT_0045a0c1` clear the game runs
 * mode 2 -- no orbit turn at all in `FUN_00297a30` (141143-141221 has branches for 3, 6 and 7 only) -- and online
 * mode 6 (turning on its own, which OT.R116 takes out) or 3 (toward the killer's far side). SOLO_IS_NETWORK_READING
 * (`net/loopback.ts`): the page's single-player match runs the network branch, so the page never builds mode 2.
 */

const EYE = [0, 5, 30];

describe('the death camera by the network flag (SOLO_IS_NETWORK_READING)', () => {
  it('the page reads its single-player match as a network game', () => {
    expect(SOLO_IS_NETWORK_READING).toBe(true);
  });

  it('with no killer the camera is mode 6, whose own turn OT.R116 takes out: the orbit holds still with no stick', () => {
    expect(DEATH_ORBIT_RATE).toBe(0.8725);                          // the original's own turn, kept cited (141217)
    expect(DEATH_CAM_SPIN_ADAPTATION).toBe(0);                      // OT.R116: no self-turn
    const cam = newDeathCamera();
    for (let i = 0; i < 120; i++) deathEye(cam, EYE, [0, 0, 0], 0, 1 / 60);
    expect(cam.yaw).toBe(0);
    expect(cam.manual).toBe(false);
  });

  it('the reading forced false is the game\'s mode 2: the orbit holds still over a second, a killer or none', () => {
    const cam = newDeathCamera(() => [100, 0, 0], false);
    for (let i = 0; i < 60; i++) deathEye(cam, EYE, [0, 0, 0], 0, 1 / 60);
    expect(cam.yaw).toBe(0);
    const lone = newDeathCamera(null, false);
    for (let i = 0; i < 60; i++) deathEye(lone, EYE, [0, 0, 0], 0, 1 / 60);
    expect(lone.yaw).toBe(0);
  });
});

/**
 * OT.R104 (the owner's ruling against the original, 2026-11-05): the death camera follows the killer for
 * DEATH_KILLER_FOLLOW_S_ADAPTATION from its reset, then goes on as mode 6 about the body -- which, by OT.R116
 * (2026-11-09, DEATH_CAM_SPIN_ADAPTATION), holds still. The original's online state 3 reads the killer's place (+0x154)
 * for as long as the player is dead (`FUN_00297a30` D:L141145-141215, `FUN_002980d0` D:L141369-141376; research 314
 * §5.4 item 4). The tick is the page's (`./playerCamera`): `deathEye`, then `deathFar`.
 */
describe('OT.R104: the death camera follows the killer for 5 s, then holds still about the body (mode 6, OT.R116)', () => {
  const DT = 1 / 60;
  const FEET = [0, 0, 0];
  const AIM: [number, number, number] = [0, 0, -1000];
  /** A killer that walks +x at 50 a second, from (200, 0, -200); `drift` moves it differently after `from` seconds. */
  const walker = (clock: { t: number }, drift = 0, from = Infinity) => (): [number, number, number] =>
    [200 + 50 * clock.t + (clock.t >= from ? drift * (clock.t - from) : 0), 0, -200];
  /** Runs the page's tick to `seconds`, calling `each` with the time, the camera and the look's far point after every tick. */
  function run(seconds: number, drift = 0, from = Infinity, each?: (t: number, cam: ReturnType<typeof newDeathCamera>, far: number[]) => void) {
    const clock = { t: 0 };
    const cam = newDeathCamera(walker(clock, drift, from));
    const n = Math.round(seconds * 60);
    let far: number[] = AIM;
    for (let i = 1; i <= n; i++) {
      clock.t = i / 60;
      deathEye(cam, EYE, FEET, 0, DT);
      far = deathFar(cam, AIM, DT);
      each?.(clock.t, cam, far);
    }
    return { cam, far, clock };
  }

  it('the limit is 5 s (OT.R104)', () => {
    expect(DEATH_KILLER_FOLLOW_S_ADAPTATION).toBe(5);
  });

  it('a 6 s death with a moving killer: at 4.9 s the look is on the killer\'s live place; from 5.0 s never; then still (OT.R116)', () => {
    const yaws: Array<[number, number]> = [];
    run(6, 0, Infinity, (t, cam, far) => {
      const live = [200 + 50 * t, 0, -200];
      if (Math.abs(t - 4.9) < 1e-9) for (let a = 0; a < 3; a++) expect(far[a]).toBeCloseTo(live[a]!, 9);
      if (t >= 5 - 1e-9) {
        expect(far).toEqual(AIM);                                   // the aim, never the killer's place
        expect(cam.killer).toBeNull();
        yaws.push([t, cam.yaw]);
      }
    });
    expect(yaws.length).toBe(61);                                   // 5.0 s .. 6.0 s
    for (let i = 1; i < yaws.length; i++) expect(yaws[i]![1]).toBe(yaws[i - 1]![1]);   // OT.R116: no own turn
  });

  it('the yaw carries over at 5 s with no snap: the first mode-6 tick leaves the turn mode 3 left as it was (OT.R116)', () => {
    let before = NaN, after = NaN;
    run(5.1, 0, Infinity, (t, cam) => {
      if (Math.abs(t - (5 - DT)) < 1e-9) before = cam.yaw;
      if (Math.abs(t - 5) < 1e-9) after = cam.yaw;
    });
    expect(before).not.toBe(0);                                     // mode 3 turned toward the killer's far side
    expect(after).toBe(before);
  });

  it('after 5 s the killer\'s moves change nothing', () => {
    const a = run(6), b = run(6, 400, 5);                          // b's killer runs off at 400 a second from 5 s
    expect(b.cam.yaw).toBe(a.cam.yaw);
    expect(b.cam.tilt).toBe(a.cam.tilt);
    expect(b.far).toEqual(a.far);
    const ea = deathEye(a.cam, EYE, FEET, 0, DT), eb = deathEye(b.cam, EYE, FEET, 0, DT);
    expect(eb).toEqual(ea);
  });

  it('a death shorter than 5 s (respawn at 3 s) is unchanged: still mode 3 on the killer\'s live place', () => {
    const { cam, far, clock } = run(3);
    expect(cam.killer).not.toBeNull();
    expect(far[0]).toBeCloseTo(200 + 50 * clock.t, 9);
    expect(cam.blend).toBe(1);
  });

  it('the lone death and the classic ghost (mode 6, no killer) hold still past 5 s (OT.R116)', () => {
    const cam = newDeathCamera();
    for (let i = 0; i < 6 * 60; i++) { deathEye(cam, EYE, FEET, 0, DT); expect(deathFar(cam, AIM, DT)).toEqual(AIM); }
    expect(cam.yaw).toBe(0);
  });
});

/**
 * State 7, the stick's manual orbit (`FUN_002980d0` D:L141595-141627 takes over: either controller channel `+0x10`,
 * `+0x14` at |v| >= 0.01 while the bound actor is dead sets state 7, which only the reset `FUN_00299150` D:L141657
 * writes back; `FUN_00297a30` D:L141219-141221 turns the orbit by `+0x10 x 2 x dt` and tilts it by `+0x14 x 2 x dt`,
 * the dead's clamp after, D:L141242-141252). `+0x10` is the look stick's turn axis (`FUN_005966a0` D:L453858; 1.118 at
 * full push, `look.ts` `FULL_AXIS`), so a full push turns the orbit at the living look's 2.236 rad a second.
 */
describe('state 7: the stick takes over the death camera (the original\'s manual orbit)', () => {
  const DT = 1 / 60;
  const FEET = [0, 0, 0];
  const AIM: [number, number, number] = [0, 0, -1000];
  const full = { turn: FULL_AXIS, tilt: 0 };
  const none = { turn: 0, tilt: 0 };
  const ticks = (cam: DeathCamera, seconds: number, stick = none) => {
    let far: number[] = AIM, eye: number[] = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) { eye = deathEye(cam, EYE, FEET, 0, DT, stick); far = deathFar(cam, AIM, DT); }
    return { far, eye };
  };

  it('the constants: the takeover at 0.01 (D:L141612-141613), the rate 2 (D:L141220-141221)', () => {
    expect(DEATH_STICK_TAKEOVER).toBe(0.01);
    expect(DEATH_STICK_RATE).toBe(2);
    expect(DEATH_STICK_TILT_READING).toBe('pitch axis');
    expect(DEATH_STICK_TURN_SIGN_READING).toBe(1);
  });

  it('no turn without input: a lone death with the stick at rest stays mode 6 and still', () => {
    const cam = newDeathCamera();
    ticks(cam, 3, none);
    expect(cam.manual).toBe(false);
    expect(cam.yaw).toBe(0);
  });

  it('a full push for 1 s takes over and turns the orbit 2.236 rad; released, it holds, and never turns on its own again', () => {
    const cam = newDeathCamera();
    ticks(cam, 0.5, none);
    ticks(cam, 1, full);
    expect(cam.manual).toBe(true);
    expect(cam.yaw).toBeCloseTo(MAX_YAW_RATE * 1, 6);
    expect(cam.yaw).toBeCloseTo(2.236, 6);
    const held = cam.yaw;
    ticks(cam, 2, none);
    expect(cam.yaw).toBe(held);
    expect(cam.manual).toBe(true);
  });

  it('a push during the killer follow drops the killer at once: the look is the aim the same tick, no height or reach, a later move nothing', () => {
    const clock = { t: 0 };
    const killer = (): [number, number, number] => [200 + 400 * clock.t, 0, -200];
    const cam = newDeathCamera(killer), twin = newDeathCamera(killer);
    for (let i = 1; i <= 60; i++) { clock.t = i / 60; deathEye(cam, EYE, FEET, 0, DT); deathFar(cam, AIM, DT); }
    expect(cam.killer).not.toBeNull();
    const yaw0 = cam.yaw;
    clock.t += DT;
    const eye = deathEye(cam, EYE, FEET, 0, DT, { turn: 0.5, tilt: 0 });
    expect(cam.manual).toBe(true);
    expect(cam.killer).toBeNull();
    expect(cam.lastKiller).toBeNull();
    expect(deathFar(cam, AIM, DT)).toEqual(AIM);
    expect(cam.yaw).toBeCloseTo(yaw0 + 0.5 * DEATH_STICK_RATE * DT, 12);
    // No mode-3 height ease nor reach push: the eye is the plain orbit of the local eye.
    twin.yaw = cam.yaw; twin.tilt = cam.tilt; twin.killer = null; twin.manual = true;
    expect(eye).toEqual(deathEye(twin, EYE, FEET, 0, 0, none));
    const before = { yaw: cam.yaw, tilt: cam.tilt };
    for (let i = 0; i < 120; i++) { clock.t += DT; deathEye(cam, EYE, FEET, 0, DT, none); expect(deathFar(cam, AIM, DT)).toEqual(AIM); }
    expect(cam.yaw).toBe(before.yaw);
    expect(cam.tilt).toBe(before.tilt);
  });

  it('the threshold: |0.009| takes nothing over, |0.01| does, on either channel (D:L141612-141613)', () => {
    for (const v of [0.009, -0.009]) {
      const a = newDeathCamera(); deathEye(a, EYE, FEET, 0, DT, { turn: v, tilt: 0 });
      const b = newDeathCamera(); deathEye(b, EYE, FEET, 0, DT, { turn: 0, tilt: v });
      expect(a.manual).toBe(false); expect(a.yaw).toBe(0);
      expect(b.manual).toBe(false);
    }
    for (const v of [0.01, -0.01]) {
      const a = newDeathCamera(); deathEye(a, EYE, FEET, 0, DT, { turn: v, tilt: 0 });
      const b = newDeathCamera(); deathEye(b, EYE, FEET, 0, DT, { turn: 0, tilt: v });
      expect(a.manual).toBe(true); expect(a.yaw).toBeCloseTo(v * DEATH_STICK_RATE * DT, 12);
      expect(b.manual).toBe(true); expect(b.yaw).toBe(0);
    }
  });

  it('the manual tilt is held to the dead\'s clamp [-1, -0.2] (D:L141242-141252)', () => {
    const cam = newDeathCamera();
    ticks(cam, 2, { turn: 0, tilt: -FULL_AXIS });
    expect(cam.tilt).toBe(DEATH_TILT_MIN);
    ticks(cam, 0.1, { turn: 0, tilt: FULL_AXIS });
    expect(cam.tilt).toBeCloseTo(DEATH_TILT_MIN + 0.1 * FULL_AXIS * DEATH_STICK_RATE, 6);
    ticks(cam, 2, { turn: 0, tilt: FULL_AXIS });
    expect(cam.tilt).toBe(DEATH_TILT_MAX);
  });

  it('the reset (a new camera: the respawn, `FUN_00299150` D:L141657) is not manual; `takeDeathControl` is state 7 at once', () => {
    expect(newDeathCamera().manual).toBe(false);
    const cam = newDeathCamera(() => [100, 0, 0]);
    takeDeathControl(cam);
    expect(cam.manual).toBe(true);
    expect(cam.killer).toBeNull();
    ticks(cam, 1, none);
    expect(cam.yaw).toBe(0);
  });

  it('the stick off the walk\'s look: the turn is the look\'s turn over turn_maxrate (left positive), the tilt its pitch axis', () => {
    expect(deathStickOf({ turnRate: -MAX_YAW_RATE, axis: [FULL_AXIS, 0.5] })).toEqual({ turn: -FULL_AXIS, tilt: 0.5 });
    expect(deathStickOf({ turnRate: 0 })).toEqual({ turn: 0, tilt: 0 });
    expect(deathStickOf(undefined)).toEqual({ turn: 0, tilt: 0 });
  });
});
