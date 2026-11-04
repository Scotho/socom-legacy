import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { TICK } from '../src/mover';
import { RemotePlayers } from '../src/remotePlayers';
import { PRONE_TILT_EASE, rootTiltStart, worldToBody, type RootTiltState } from '../src/rootTilt';

/**
 * PRONE-TILT-2 ease fix, review F2 (research 217 s7.11): the page's copy of another body (`RemotePlayers` `remoteTilt`)
 * steps the rule once a 30 Hz game frame (`GAME_FRAME_DT`), as the walker's `tiltClock` -- the original's
 * `FUN_005506a0` runs `FUN_00548090` once an actor tick (D:L417863), and the EPH capture closes 0.200 a guest frame.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
const UPHILL_20 = [0, Math.cos(rad(20)), Math.sin(rad(20))] as const;
const angle = (a: readonly number[], b: readonly number[]): number =>
  (Math.acos(Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;

describe('the page\'s copy of a prone body on a slope eases once a game frame (remoteTilt)', () => {
  it('a second of 60 Hz frames writes the root 29 or 30 times, each closing 0.2 of what is left, never 60', () => {
    const remote = new RemotePlayers(new Scene());
    // the body's tilt record with the slope's normal already picked (no map loaded: the pick keeps it)
    const r = { tilt: { acc: 0, state: rootTiltStart() as RootTiltState, normal: [...UPHILL_20] } };
    const snap = {
      feet: [0, 0, 0], yaw: 0, stance: 'prone', action: null, hold: null, traversal: null, airborne: false,
    };
    const step = (remote as unknown as { remoteTilt(r: unknown, s: unknown, dt: number): unknown }).remoteTilt.bind(remote);
    const left: number[] = [];
    let last = angle(r.tilt.state.up, worldToBody(0, UPHILL_20));
    for (let i = 0; i < 60; i++) {
      step(r, snap, TICK);
      const now = angle(r.tilt.state.up, worldToBody(0, UPHILL_20));
      if (Math.abs(now - last) > 1e-12) left.push(now);
      last = now;
    }
    expect(PRONE_TILT_EASE).toBe(0.2);
    expect(left.length).toBeGreaterThanOrEqual(29);
    expect(left.length).toBeLessThanOrEqual(30);
    for (let n = 1; n < left.length; n++) expect(left[n]! / left[n - 1]!).toBeCloseTo(0.8, 2);
  });
});
