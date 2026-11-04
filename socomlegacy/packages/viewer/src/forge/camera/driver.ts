import type { CameraShotEnded, CameraShotPoint, CameraShotSpec, CameraShotStatus, CameraVec3 } from '@s2u/forge-agent-protocol';
import type { Pose } from '../../camera';

/**
 * R5-A (a browser adaptation, no original): the agent's cinematic camera driver. An agent submits a shot ONCE
 * (`camera.shot`: its points and its duration) and the page plays it smoothly, a pose a rendered frame, instead of the
 * per-command teleport loop that looked janky. The driver holds one shot at a time; it never touches the game's own
 * camera, Play, or any simulation value -- it only hands the page's fly-camera setter (`apply`) a pose in the page's
 * own shape (`../../camera` `Pose`, as `FlyCamera.lookFrom` makes one).
 *
 * The page's frame loop (round 5b, not this module) calls `frame(dt)` each rendered frame while `active()`, and ends the
 * shot at each of its seams:
 * - `stop('manual')` on any manual camera input (the fly keys, the mouse, the pad's look, a touch look);
 * - `stop('mode')` on a mode change (Walk, Play, a lobby's hold);
 * - `stop('map')` on a map change (a new base, a loaded layout on another map);
 * - `stop('stopped')` from the agent chip's "Stop camera" and Circle (the facade's `camera.stop` uses it too);
 * - `stop('revoked')` on a revoked permission, `stop('disconnected')` on a disconnect or the page's teardown.
 * Only the first reason is kept: a later stop of an ended shot is a no-op answering null.
 */
export type ShotSpec = CameraShotSpec;
export type ShotPoint = CameraShotPoint;
export type ShotEnded = CameraShotEnded;
export type ShotStatus = CameraShotStatus;
export type Vec3 = CameraVec3;
/** Where the camera stands and the point it looks at, at seconds `t` into a shot. */
export type ShotSampler = (spec: ShotSpec, t: number) => ShotPoint;
/** The map's world box the facade checks a shot against (game units). */
export interface ShotBounds { min: Vec3; max: Vec3 }
export interface ShotDriverOptions {
  /** The motion law (dot's `./shot` `sampleShot` once it lands; `linearShotSampler` until then). */
  sampler: ShotSampler;
  /**
   * The page's camera setter: the pose in the page's own shape, and the sample it came from. Returning `false` says
   * the page can no longer take a pose (the camera is not the fly camera any more): the shot ends with `mode`.
   */
  apply: (pose: Pose, sample: ShotPoint) => void | boolean;
  /** Milliseconds, for a `frame()` called without its dt. */
  now?: () => number;
  /**
   * R5-B: the page's admission check with the map's scale (dot's `checkShot(spec, metersPerUnit)` through the page's
   * closure, `./pageShot`): the first finding's words, or null. The facade and the room refuse INVALID_ARGUMENT on one,
   * before the bounds walk. Absent: no finding.
   */
  check?: (spec: ShotSpec) => string | null;
}
export interface ShotDriver {
  /** Begin `spec` as `shotId`; answers the id of the shot it replaced, or null. */
  start(spec: ShotSpec, shotId: string): string | null;
  /** End the running shot for `reason`; answers its id, or null when none ran. */
  stop(reason: ShotEnded): string | null;
  /** One rendered frame: advance by `dt` seconds (or the clock's), apply the pose; true when it drove the camera. */
  frame(dt?: number): boolean;
  status(): ShotStatus;
  /** A shot is running (the page skips its own fly update and the agent's per-frame camera save while it is). */
  active(): boolean;
  /** The sampler this driver plays, so a facade checks the exact path the page will draw. */
  sample(spec: ShotSpec, t: number): ShotPoint;
  /** R5-B: the page's admission check (`ShotDriverOptions.check`): a finding's words, or null. */
  check(spec: ShotSpec): string | null;
}

/** A shot's whole length in seconds: its motion and its hold. */
export function shotLengthOf(spec: ShotSpec): number { return spec.seconds + (spec.hold ?? 0); }

const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
/**
 * The fallback motion law (a browser adaptation): straight segments between the points, each an equal share of
 * `seconds`, `t` clamped to the shot, the last point held. Continuous in position, exact at every point.
 * TODO(R5b): the page injects dot's `sampleShot` (packages/viewer/src/forge/camera/shot.ts, not landed on 2026-10-25) in its place.
 */
export function linearShotSampler(spec: ShotSpec, t: number): ShotPoint {
  const points = spec.points, last = points.length - 1;
  const at = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), spec.seconds);
  const u = (at / spec.seconds) * last, i = Math.min(Math.floor(u), last - 1), f = u - i;
  if (f <= 0) return { at: [...points[i]!.at], look: [...points[i]!.look] };
  if (f >= 1) return { at: [...points[i + 1]!.at], look: [...points[i + 1]!.look] };
  return { at: lerp(points[i]!.at, points[i + 1]!.at, f), look: lerp(points[i]!.look, points[i + 1]!.look, f) };
}

/**
 * The page's pose of a sample: the position, and the yaw and pitch in degrees as `FlyCamera.lookFrom` (`../../camera`)
 * turns a from/to pair into them (the camera looks down its own -z). A look on the point itself has no direction: the
 * previous facing is kept; a look straight up or down has no heading: the previous yaw is kept (no mid-shot snap).
 */
export function poseOfShot(sample: ShotPoint, previous?: Pose | null): Pose {
  const [x, y, z] = sample.at;
  const dx = sample.look[0] - x, dy = sample.look[1] - y, dz = sample.look[2] - z;
  const flat = Math.hypot(dx, dz);
  if (flat === 0 && dy === 0) return { x, y, z, yaw: previous?.yaw ?? 0, pitch: previous?.pitch ?? 0 };
  const deg = 180 / Math.PI;
  const yaw = flat === 0 ? previous?.yaw ?? 0 : Math.atan2(-dx, -dz) * deg + 0;
  return { x, y, z, yaw, pitch: Math.atan2(dy, flat) * deg + 0 };
}

/** The motion sampled for the bounds check: 30 samples a second (a browser adaptation's own step). */
const PATH_SAMPLES_PER_SECOND = 30;
/**
 * R5-B (a browser adaptation): the most path samples one admission takes -- 30 a second up to a 40 s shot, 10 a second
 * at the 120 s bound -- so a long shot never holds the main thread for seconds (dot's sampler costs ~0.7 ms a sample at
 * 64 points, the camera module's review of 2026-10-25 17:07Z: 3600 samples would be ~2.5 s, 1200 are ~0.8 s).
 */
export const SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION = 1200;
const pathSteps = (seconds: number): number => Math.max(1, Math.min(Math.ceil(seconds * PATH_SAMPLES_PER_SECOND), SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION));
const inside = (p: Vec3, b: ShotBounds): boolean => p.every((v, k) => v >= b.min[k]! && v <= b.max[k]!);
/**
 * Why a shot leaves the map's box, or null: every point's `at` and `look` first, then the path the sampler draws
 * between them (a cubic can overshoot its points).
 */
export function shotOutsideBounds(spec: ShotSpec, bounds: ShotBounds, sample: ShotSampler): string | null {
  for (const [i, p] of spec.points.entries()) {
    if (!inside(p.at, bounds)) return `point ${i}'s at lies outside the map's bounds`;
    if (!inside(p.look, bounds)) return `point ${i}'s look lies outside the map's bounds`;
  }
  const steps = pathSteps(spec.seconds);
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * spec.seconds, s = sample(spec, t);
    if (!inside(s.at, bounds) || !inside(s.look, bounds)) return `the path at ${t.toFixed(2)} s lies outside the map's bounds`;
  }
  return null;
}

/**
 * The steepest look a shot may take, in degrees (a browser adaptation): `FlyCamera` clamps its pitch at 89.9, so a
 * look past this would not be drawn as asked. The page's admission refuses such a shot (round 5b, the camera-module
 * freeze of 2026-10-25 15:21Z); the look law itself is unchanged.
 */
export const SHOT_PITCH_LIMIT_DEGREES_ADAPTATION = 89;
const pitchOf = (s: ShotPoint): number => {
  const dx = s.look[0] - s.at[0], dy = s.look[1] - s.at[1], dz = s.look[2] - s.at[2];
  return dx === 0 && dy === 0 && dz === 0 ? 0 : Math.abs(Math.atan2(dy, Math.hypot(dx, dz))) * 180 / Math.PI;
};
/** Why a shot looks steeper than `limit` degrees, or null: every point first, then the sampled path (as the bounds). */
export function shotPastPitchLimit(spec: ShotSpec, sample: ShotSampler, limit = SHOT_PITCH_LIMIT_DEGREES_ADAPTATION): string | null {
  for (const [i, p] of spec.points.entries()) if (pitchOf(p) > limit) return `point ${i}'s look is steeper than ${limit} degrees`;
  const steps = pathSteps(spec.seconds);
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * spec.seconds;
    if (pitchOf(sample(spec, t)) > limit) return `the path at ${t.toFixed(2)} s looks steeper than ${limit} degrees`;
  }
  return null;
}

/** R5-B: why admission refuses a shot -- off the map's box, or a look past the pitch limit -- or null. */
export interface ShotAdmissionRefusal { code: 'OUT_OF_BOUNDS' | 'OUT_OF_RANGE'; message: string }
/**
 * R5-B: the admission walk, once: every point's bounds, then every point's pitch, then the path the sampler draws --
 * each instant sampled ONCE for both checks, at `pathSteps` (at most `SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION` samples).
 * The words are `shotOutsideBounds`' and `shotPastPitchLimit`'s.
 */
export function shotAdmission(spec: ShotSpec, bounds: ShotBounds, sample: ShotSampler, limit = SHOT_PITCH_LIMIT_DEGREES_ADAPTATION): ShotAdmissionRefusal | null {
  for (const [i, p] of spec.points.entries()) {
    if (!inside(p.at, bounds)) return { code: 'OUT_OF_BOUNDS', message: `point ${i}'s at lies outside the map's bounds` };
    if (!inside(p.look, bounds)) return { code: 'OUT_OF_BOUNDS', message: `point ${i}'s look lies outside the map's bounds` };
  }
  for (const [i, p] of spec.points.entries()) if (pitchOf(p) > limit) return { code: 'OUT_OF_RANGE', message: `point ${i}'s look is steeper than ${limit} degrees` };
  const steps = pathSteps(spec.seconds);
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * spec.seconds, s = sample(spec, t);
    if (!inside(s.at, bounds) || !inside(s.look, bounds)) return { code: 'OUT_OF_BOUNDS', message: `the path at ${t.toFixed(2)} s lies outside the map's bounds` };
    if (pitchOf(s) > limit) return { code: 'OUT_OF_RANGE', message: `the path at ${t.toFixed(2)} s looks steeper than ${limit} degrees` };
  }
  return null;
}

const finitePoint = (s: ShotPoint): boolean => [...s.at, ...s.look].every(Number.isFinite);
/** The frames' sum can fall a rounding short of the length: within this, the shot is at its end. */
const END_EPSILON = 1e-9;

export function createShotDriver(options: ShotDriverOptions): ShotDriver {
  const { sampler, apply, check } = options;
  const now = options.now ?? (() => performance.now());
  let running: { id: string; spec: ShotSpec; t: number; length: number } | null = null;
  let last: { id: string; t: number; ended: ShotEnded } | null = null;
  let clock: number | null = null;
  let pose: Pose | null = null;
  const end = (reason: ShotEnded): string | null => {
    if (!running) return null;
    const id = running.id;
    last = { id, t: running.t, ended: reason };
    running = null; clock = null;
    return id;
  };
  return {
    start(spec, shotId) {
      const replaced = running?.id ?? null;
      running = { id: shotId, spec, t: 0, length: shotLengthOf(spec) };
      last = null; clock = now();
      return replaced;
    },
    stop: end,
    frame(dt) {
      if (!running) return false;
      const at = now();
      const step = dt === undefined ? (at - (clock ?? at)) / 1000 : dt;
      clock = at;
      running.t = Math.min(running.t + (Number.isFinite(step) && step > 0 ? step : 0), running.length);
      if (running.length - running.t <= END_EPSILON) running.t = running.length;
      const sample = sampler(running.spec, running.t);
      if (!finitePoint(sample)) { end('stopped'); return false; }
      pose = poseOfShot(sample, pose);
      if (apply(pose, sample) === false) { end('mode'); return false; }
      if (running.t >= running.length) end('done');
      return true;
    },
    status() {
      if (running) return { shot: running.id, t: running.t };
      return last ? { shot: last.id, t: last.t, ended: last.ended } : { shot: null, t: 0 };
    },
    active: () => running !== null,
    sample: (spec, t) => sampler(spec, t),
    check: (spec) => check?.(spec) ?? null,
  };
}
