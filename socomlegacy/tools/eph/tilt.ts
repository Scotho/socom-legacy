import type { CsvRow } from './analyze';

/**
 * EPH-TILT: the prone body's tilt, per side, from the harness's two series -- PCSX2's root quaternion and normals
 * (./sampler TILT_ADDRESSES, `FUN_00548090` D:L413181-413287) and the page's `Walker.rootTilt` (viewer `ephFrame.ts`).
 * Product track (OT.R53): a measurement instrument, an adaptation, never in a build and never changing the game's
 * behaviour. It is built to settle PRONE-TILT's open readings (research 217 s7.5 on agent/prone-tilt): whether the
 * settled prone body eases to the full slope ('root-up') or stops at 20% ('world-up'), whether a standing or crouched
 * body tilts, and whether the build-up is 0.2 a call.
 *
 * Frames and conventions, each an assumption of the instrument:
 * - **The root's up** is the reference up (0, 1, 0) turned by the root quaternion (x, y, z, w; three.js's convention,
 *   as PRONE-TILT's `rotateByQuat`). It is in the body's frame (x right, y up, z behind): the rule writes the arc to a
 *   body-frame target (D:L413260-413274). The page's `rootTilt.up` is the same vector, read directly.
 * - **The floor normal** is in world axes on both sides (actor+0x410; `Walker.tiltNormal`). Into the body's frame:
 *   PCSX2 by the conjugate of the actor's quaternion (+0x50, as the rule turns it, D:L413260-413264), the page by its
 *   yaw (PRONE-TILT's `worldToBody`). If the PS2's quaternion turns the other way from three.js's, `tiltUpNormalDeg` on
 *   PCSX2 reads wrong; the frame-free measures (`tiltFinalDeg`, `tiltSlopeDeg`, `tiltOverSlope`) do not depend on it.
 * - **Pitch and roll** split the up in the body's frame: pitch = atan2(-z, y), positive when the up leans toward the
 *   facing (-z); roll = atan2(x, y), positive when it leans to the body's right (+x).
 */

export type Vec3 = [number, number, number];

/** The reference up (`DAT_003f64e0`, (0, 1, 0), research 215:864-870 via PRONE-TILT's TILT_REFERENCE_UP). */
export const WORLD_UP: Vec3 = [0, 1, 0];
/** Settled: within this many degrees of the window's final tilt (the brief's 1 degree; an instrument tolerance). */
export const SETTLE_DEG = 1;
/** Each side's step, ms: the PS2 runs the rule once a 30 Hz game frame (FUN_005506a0 D:L417863; FINDINGS 2026-10-31 Q2,
 *  proven by capture), the page once a 60 Hz walk tick. */
export const PS2_STEP_MS = 1000 / 30;
export const PAGE_STEP_MS = 1000 / 60;

const DEG = 180 / Math.PI;

/** A vector turned by a unit quaternion (x, y, z, w), three.js's convention (PRONE-TILT `rotateByQuat`). */
export function rotateByQuat(q: readonly number[], v: readonly number[]): Vec3 {
  const [x, y, z, w] = q as [number, number, number, number];
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
}

/** A world vector into the body's frame by the yaw (degrees, `Pose.yaw`): PRONE-TILT `worldToBody`. */
export function worldToBody(yaw: number, v: readonly number[]): Vec3 {
  const r = yaw / DEG, c = Math.cos(r), s = Math.sin(r);
  return [v[0]! * c - v[2]! * s, v[1]!, v[0]! * s + v[2]! * c];
}

/** The angle between two vectors, degrees (null when either is zero). */
export function angleDeg(a: readonly number[], b: readonly number[]): number | null {
  const la = Math.hypot(a[0]!, a[1]!, a[2]!), lb = Math.hypot(b[0]!, b[1]!, b[2]!);
  if (!(la > 0) || !(lb > 0)) return null;
  const c = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
}

/** The tilt: the angle between the root's up and world up, degrees. */
export const tiltDeg = (up: readonly number[]): number => angleDeg(up, WORLD_UP) ?? 0;
/** Pitch in the body's frame: positive leaning toward the facing (-z). */
export const pitchDeg = (up: readonly number[]): number => Math.atan2(-up[2]!, up[1]!) * DEG;
/** Roll in the body's frame: positive leaning to the body's right (+x). */
export const rollDeg = (up: readonly number[]): number => Math.atan2(up[0]!, up[1]!) * DEG;

/** One sample's tilt: the root's up (body frame), the floor normal (world, and body frame), PCSX2's ease basis. */
export interface TiltSample {
  readonly up: Vec3 | null;
  readonly normal: Vec3 | null;
  readonly normalBody: Vec3 | null;
  /** PCSX2's `DAT_0066acd0..d8` (the root's last up the ease starts from); the page: null. */
  readonly basis: Vec3 | null;
  /** PCSX2: the action id (+0x534) is Stand -> Prone 0x19 or Crouch -> Prone 0x13, when the rule does not ease
   *  (D:L413265-413266). The page's transition is its sample's `busy`. */
  readonly transition?: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function cols(r: CsvRow, keys: readonly string[]): number[] | null {
  const out = keys.map((k) => num(r[k]));
  return out.every((x) => x !== null) ? (out as number[]) : null;
}

/** PCSX2's tilt off a pcsx2.csv row; undefined in a run before EPH-TILT (no tilt column at all). */
export function pcsx2TiltOf(r: CsvRow): TiltSample | undefined {
  if (!('rootQw' in r)) return undefined;
  const q = cols(r, ['rootQx', 'rootQy', 'rootQz', 'rootQw']);
  const n = cols(r, ['floorNx', 'floorNy', 'floorNz']) as Vec3 | null;
  const aq = cols(r, ['actorQx', 'actorQy', 'actorQz', 'actorQw']);
  return {
    up: q ? rotateByQuat(q, WORLD_UP) : null,
    normal: n,
    normalBody: n && aq ? rotateByQuat([-aq[0]!, -aq[1]!, -aq[2]!, aq[3]!], n) : null,
    basis: cols(r, ['easeX', 'easeY', 'easeZ']) as Vec3 | null,
    transition: r.actionId === 0x19 || r.actionId === 0x13,
  };
}

/** The page's tilt off a page.csv row (its up read, else turned from its quaternion); undefined before EPH-TILT. */
export function pageTiltOf(r: CsvRow): TiltSample | undefined {
  if (!('rootUpY' in r) && !('rootQw' in r)) return undefined;
  const upRead = cols(r, ['rootUpX', 'rootUpY', 'rootUpZ']) as Vec3 | null;
  const q = cols(r, ['rootQx', 'rootQy', 'rootQz', 'rootQw']);
  const n = cols(r, ['tiltNx', 'tiltNy', 'tiltNz']) as Vec3 | null;
  const yaw = num(r.yaw);
  return {
    up: upRead ?? (q ? rotateByQuat(q, WORLD_UP) : null),
    normal: n,
    normalBody: n && yaw !== null ? worldToBody(yaw, n) : null,
    basis: null,
  };
}

/** The measures of one window, in order (analysis.csv's metric names). */
export const TILT_METRICS = [
  'tiltBeforeDeg', 'tiltFinalDeg', 'tiltPitchDeg', 'tiltRollDeg', 'tiltUpNormalDeg', 'tiltSlopeDeg', 'tiltOverSlope',
  'tiltSettleMs', 'tiltEasePerStep', 'tiltEasePerSecond', 'tiltBasisDeg',
] as const;
export type TiltMetric = (typeof TILT_METRICS)[number];

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * One side's tilt over the window [from, to] (the act on that side's clock to the next act or the run's end):
 * - tiltBeforeDeg: the tilt at the act (the last sample at or before `from`) -- the standing or crouched body's;
 * - tiltFinalDeg, tiltPitchDeg, tiltRollDeg: at the window's last sample;
 * - tiltUpNormalDeg: the final up against the floor normal, both in the body's frame;
 * - tiltSlopeDeg: the floor normal's angle from world up; tiltOverSlope = final tilt over it (1: the full slope, about
 *   0.2: PRONE-TILT's 'world-up');
 * - tiltSettleMs: from `from` to the first sample after which every sample of the window stays within SETTLE_DEG of the
 *   final up (the angle between the ups);
 * - tiltEasePerStep, tiltEasePerSecond: the median share of the remaining angle closed per the side's own step
 *   (`stepMs`: the PS2's 30 Hz game frame, FUN_005506a0 runs the rule once an actor tick; the page's 60 Hz walk tick)
 *   and per second, over the steps while over SETTLE_DEG remain, counted only after the last sample in the prone
 *   transition (PCSX2 action 0x19 / 0x13, the page an action holding the mover), when the rule eases -- the angle's
 *   share, which for the rule's vector lerp is close to, not exactly, the lerp's;
 * - tiltBasisDeg: PCSX2's ease basis DAT_0066acd0's angle from world up at the window's end (the page: none).
 * A measure with no tilt sample to stand on is null.
 */
export function measureTilt(s: readonly { t: number; tilt?: TiltSample | null; busy?: boolean }[], from: number, to: number, stepMs = 1000 / 60): Record<TiltMetric, number | null> {
  const m = Object.fromEntries(TILT_METRICS.map((k) => [k, null])) as Record<TiltMetric, number | null>;
  const withUp = s.filter((x) => x.tilt?.up) as { t: number; tilt: TiltSample & { up: Vec3 }; busy?: boolean }[];
  const before = [...withUp].reverse().find((x) => x.t <= from);
  if (before) m.tiltBeforeDeg = tiltDeg(before.tilt.up);
  const win = withUp.filter((x) => x.t > from && x.t <= to);
  const last = win[win.length - 1];
  if (!last) return m;
  const up = last.tilt.up;
  m.tiltFinalDeg = tiltDeg(up);
  m.tiltPitchDeg = pitchDeg(up);
  m.tiltRollDeg = rollDeg(up);
  if (last.tilt.normalBody) m.tiltUpNormalDeg = angleDeg(up, last.tilt.normalBody);
  if (last.tilt.normal) {
    m.tiltSlopeDeg = tiltDeg(last.tilt.normal);
    if (m.tiltSlopeDeg > 0) m.tiltOverSlope = m.tiltFinalDeg / m.tiltSlopeDeg;
  }
  const rem = win.map((x) => angleDeg(x.tilt.up, up) ?? 0);
  let settle = win.length - 1;
  while (settle > 0 && rem[settle - 1]! <= SETTLE_DEG) settle--;
  m.tiltSettleMs = win[settle]!.t - from;
  let lastTrans = -1;
  win.forEach((x, i) => { if (x.tilt.transition === true || x.busy === true) lastTrans = i; });
  const perStep: number[] = [], perSecond: number[] = [];
  for (let i = Math.max(0, lastTrans); i + 1 < win.length; i++) {
    const a = rem[i]!, b = rem[i + 1]!, dt = win[i + 1]!.t - win[i]!.t;
    if (a > SETTLE_DEG && b < a && dt > 0) {
      perStep.push(1 - Math.pow(b / a, stepMs / dt));
      perSecond.push(1 - Math.pow(b / a, 1000 / dt));
    }
  }
  m.tiltEasePerStep = median(perStep);
  m.tiltEasePerSecond = median(perSecond);
  const basis = [...win].reverse().find((x) => x.tilt.basis)?.tilt.basis;
  if (basis) m.tiltBasisDeg = tiltDeg(basis);
  return m;
}
