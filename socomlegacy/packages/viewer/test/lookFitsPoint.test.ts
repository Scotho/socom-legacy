import { describe, expect, it } from 'vitest';
import { CAM_MARGIN, LEAD_DOWN, localCamera, lookHeight, toWorld } from '../src/cameraRig';
import { rootY } from '../src/mover';
import { C4_LOOK_BOUND_PLACEHOLDER, C4_LOOK_EPSILON, headPoint, lookFitsPoint, ORDER_EYE_BOUND, type AimFrame } from '../src/net/shotCone';

/**
 * LATER 139 (the merge controller's approved plan, 2026-10-21): a named C4 or SWITCH point counts as the camera's aim only
 * where it lies on an aim line the camera's swept locus could have had (`lookFitsPoint`). The page's pass pulls the eye in
 * along its axis and shifts it by its side probes, then re-aims at the target; the aim runs toward the far point 1000
 * out, so every honest line runs along the look through the locus -- the blends, the root's slack, the lead probe.
 */
type V3 = [number, number, number];
const aim = (o: Partial<AimFrame> = {}): AimFrame => ({
  seq: 1, count: 1, yaw: 180, pitch: -20, feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0,
  weapon: 0, swapping: false, motion: null, fire: false, lens: false, scoped: false, rootSlack: 0, ...o,
} as AimFrame);
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
/** A frame's look: its target and the look's unit direction (toward the far point), in the world. */
const look = (f: AimFrame): { target: V3; dir: V3; eye: V3 } => {
  const local = localCamera(f.moveRoot ?? rootY(f.posture), f.pitch, f.peek);
  const target = toWorld(f.feet, f.yaw, local.target), eye = toWorld(f.feet, f.yaw, local.eye);
  const dir = toWorld([0, 0, 0], f.yaw, local.ahead);
  return { target, dir, eye };
};
/** The distance of `p` from the line through `a` along the unit `d`. */
const offLine = (p: readonly number[], a: readonly number[], d: readonly number[]): number => {
  const v = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!], t = v[0]! * d[0]! + v[1]! * d[1]! + v[2]! * d[2]!;
  return Math.hypot(v[0]! - d[0]! * t, v[1]! - d[1]! * t, v[2]! - d[2]! * t);
};

describe('LATER 139: lookFitsPoint, the camera\'s aim lines over its swept locus', () => {
  it('the bound is the eye\'s bound and a small epsilon (the far point\'s convergence, the look\'s quantisation)', () => {
    expect(C4_LOOK_BOUND_PLACEHOLDER).toBeCloseTo(ORDER_EYE_BOUND + C4_LOOK_EPSILON, 12);
    expect(C4_LOOK_EPSILON).toBeLessThan(0.1);
  });

  it('a point on the look, ahead of the eye, counts; 2 across it or behind the eye does not', () => {
    const f = aim(), { target, dir, eye } = look(f);
    expect(lookFitsPoint([f], add(target, scale(dir, 20)))).toBe(true);
    const across: V3 = [dir[2], 0, -dir[0]];                                             // level, across the look
    const n = Math.hypot(...across);
    expect(lookFitsPoint([f], add(add(target, scale(dir, 20)), scale(across, 2 / n)))).toBe(false);
    expect(lookFitsPoint([f], add(eye, scale(dir, -10)))).toBe(false);                 // behind the camera
  });

  it('the side probes\' shift (CAM_MARGIN x sqrt 2 across) is within the bound', () => {
    const f = aim(), { target, dir } = look(f);
    const across: V3 = [dir[2], 0, -dir[0]], n = Math.hypot(...across);
    const shifted = add(target, scale(across, (CAM_MARGIN * Math.SQRT2) / n));
    expect(lookFitsPoint([f], add(shifted, scale(dir, 15)))).toBe(true);
  });

  it('looking down past the lead probe, a look through the target led 8 back counts -- off the unled line by more than the bound', () => {
    const f = aim({ pitch: -50 }), { target, dir } = look(f);
    const back = toWorld([0, 0, 0], f.yaw, [0, 0, 1]);
    const led = add(target, scale(back, Math.abs(LEAD_DOWN)));
    const p = add(led, scale(dir, 12));
    expect(offLine(p, target, dir)).toBeGreaterThan(C4_LOOK_BOUND_PLACEHOLDER);         // the sweep, not the bound, holds it
    expect(lookFitsPoint([f], p)).toBe(true);
  });

  it('the posed root\'s slack: a look through the target raised by the look-at height\'s ramp counts with the slack, not without', () => {
    const r = rootY('stand'), rise = lookHeight(r + 4) - lookHeight(r);
    const f0 = aim({ rootSlack: 0 }), f4 = aim({ rootSlack: 4 }), { target, dir } = look(f0);
    const p = add(add(target, [0, rise, 0]), scale(dir, 15));
    expect(offLine(p, target, dir)).toBeGreaterThan(C4_LOOK_BOUND_PLACEHOLDER);
    expect(lookFitsPoint([f0], p)).toBe(false);
    expect(lookFitsPoint([f4], p)).toBe(true);
  });

  it('a turning switch press: a look between two neighbouring frames counts on their blend, not on the first frame alone', () => {
    const a = aim({ seq: 1, yaw: 180 }), b = aim({ seq: 2, yaw: 196 });
    const mid = aim({ yaw: 188 }), { target, dir } = look(mid);
    const p = add(target, scale(dir, 30));
    expect(lookFitsPoint([a], p)).toBe(false);
    expect(lookFitsPoint([a, b], p)).toBe(true);
  });

  // The review's F2: the head's view is no camera eye. A point on the head's look alone (the scope's) admitted the
  // third-person camera's eye into `c4Line`; the head's own line is `c4Line`'s to judge, so only the camera's locus counts.
  it('a point on the head\'s look alone, off the camera\'s locus, does not count (the review\'s F2)', () => {
    const f = aim({ pitch: -10 }), { target, dir } = look(f), head = headPoint(f);
    const p = add(head, scale(dir, 25));
    expect(offLine(p, target, dir)).toBeGreaterThan(C4_LOOK_BOUND_PLACEHOLDER);         // off the camera's look
    expect(lookFitsPoint([f], p)).toBe(false);
  });

  it('a peek: the look of the peeking frame counts; the same point from the unpeeked frame does not', () => {
    const peeked = aim({ peek: 1 }), level = aim({ peek: 0 }), { target, dir } = look(peeked);
    const p = add(target, scale(dir, 20));
    expect(lookFitsPoint([peeked], p)).toBe(true);
    expect(offLine(p, look(level).target, look(level).dir) > C4_LOOK_BOUND_PLACEHOLDER).toBe(!lookFitsPoint([level], p));
  });
});
