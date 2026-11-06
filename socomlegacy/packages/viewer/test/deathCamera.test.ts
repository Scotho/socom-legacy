import { describe, expect, it } from 'vitest';
import { DEATH_KILLER_FOLLOW_S_ADAPTATION, DEATH_ORBIT_RATE, deathEye, deathFar, newDeathCamera } from '../src/deathCamera';
import { SOLO_IS_NETWORK_READING } from '../src/net/loopback';

/**
 * The death camera's mode by the network flag (`FUN_002980d0` 141363-141375): with `DAT_0045a0c1` clear the game runs
 * mode 2 -- no orbit turn at all in `FUN_00297a30` (141143-141221 has branches for 3, 6 and 7 only) -- and online
 * mode 6 (turning on its own) or 3 (toward the killer's far side). SOLO_IS_NETWORK_READING (`net/loopback.ts`): the
 * page's single-player match runs the network branch, so the page never builds mode 2.
 */

const EYE = [0, 5, 30];

describe('the death camera by the network flag (SOLO_IS_NETWORK_READING)', () => {
  it('the page reads its single-player match as a network game', () => {
    expect(SOLO_IS_NETWORK_READING).toBe(true);
  });

  it('with no killer the camera is mode 6: the orbit turns at DEATH_ORBIT_RATE (141217)', () => {
    const cam = newDeathCamera();
    const dt = 1 / 60;
    deathEye(cam, EYE, [0, 0, 0], 0, dt);
    expect(cam.yaw).toBeCloseTo(dt * DEATH_ORBIT_RATE, 12);
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
 * DEATH_KILLER_FOLLOW_S_ADAPTATION from its reset, then goes on as mode 6 about the body. The original's online state 3
 * reads the killer's place (+0x154) for as long as the player is dead (`FUN_00297a30` D:L141145-141215, `FUN_002980d0`
 * D:L141369-141376; research 314 §5.4 item 4). The tick is the page's (`./playerCamera`): `deathEye`, then `deathFar`.
 */
describe('OT.R104: the death camera follows the killer for 5 s, then orbits the body (mode 6)', () => {
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

  it('a 6 s death with a moving killer: at 4.9 s the look is on the killer\'s live place; from 5.0 s never; then mode 6\'s own turn', () => {
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
    for (let i = 1; i < yaws.length; i++) {
      let d = yaws[i]![1] - yaws[i - 1]![1];
      if (d < -Math.PI) d += 2 * Math.PI;
      expect(d).toBeCloseTo(DT * DEATH_ORBIT_RATE, 12);             // the body's own orbit, 0.8725 rad a second
    }
  });

  it('the yaw carries over at 5 s with no snap: the first mode-6 tick adds only dt x 0.8725 to the turn mode 3 left', () => {
    let before = NaN, after = NaN;
    run(5.1, 0, Infinity, (t, cam) => {
      if (Math.abs(t - (5 - DT)) < 1e-9) before = cam.yaw;
      if (Math.abs(t - 5) < 1e-9) after = cam.yaw;
    });
    expect(after - before).toBeCloseTo(DT * DEATH_ORBIT_RATE, 12);
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

  it('the lone death and the classic ghost (mode 6, no killer) are unchanged past 5 s', () => {
    const cam = newDeathCamera();
    for (let i = 0; i < 6 * 60; i++) { deathEye(cam, EYE, FEET, 0, DT); expect(deathFar(cam, AIM, DT)).toEqual(AIM); }
    let expected = 6 * 60 * DT * DEATH_ORBIT_RATE;
    while (expected > Math.PI) expected -= 2 * Math.PI;
    expect(cam.yaw).toBeCloseTo(expected, 9);
  });
});
