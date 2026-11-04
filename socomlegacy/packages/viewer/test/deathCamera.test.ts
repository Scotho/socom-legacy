import { describe, expect, it } from 'vitest';
import { DEATH_ORBIT_RATE, deathEye, newDeathCamera } from '../src/deathCamera';
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
