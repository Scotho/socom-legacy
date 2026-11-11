/**
 * The probe's closed-loop yaw turns (`probe.ts --yaw-turns`): at each `t` ms of the case, hold the right stick toward
 * `case start yaw + rel` until the sampled raiseYaw is within `tol`, then correct any overshoot with short taps. The
 * ENEMY-RAISE O-runs turn the player instead of walking (the 80-degree cone, FUN_005cc120); 30's call (2026-11-09):
 * an exact, repeatable turn back beats speed. The sign is measured: rleft raises raiseYaw (the pilot, 180.0 -> 245.1).
 * Product track (OT.R53): an instrument, never in a build.
 */
export interface YawTurn { readonly t: number; readonly rel: number; readonly tol: number }

export function parseYawTurns(spec: string): YawTurn[] {
  let last = -Infinity;
  return spec.split(',').map((part) => {
    const [a, b, c] = part.split(':').map((v) => v.trim());
    const t = Number(a), rel = Number(b), tol = c === undefined ? 2 : Number(c);
    if (a === undefined || b === undefined || a === '' || b === '' || !Number.isFinite(t) || !Number.isFinite(rel) || !(tol > 0)) throw new Error(`--yaw-turns: "${part}" is not t_ms:deg[:tol]`);
    if (t < last) throw new Error(`--yaw-turns: out of order at ${t}`);
    last = t;
    return { t, rel, tol };
  });
}

/** An angle difference wrapped into (-180, 180]. */
export function wrap180(d: number): number {
  const w = ((d % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
}

/**
 * The absolute target for a turn `rel` degrees from `startYaw`, wrapped into (-180, 180]. raiseYaw itself is
 * 2 atan2(q.y, q.w), so it lies in (-360, 360] (a facing of 210 reads 210, not -150): every comparison with it goes
 * through wrap180 (turnKey), never a raw difference.
 */
export const yawTarget = (startYaw: number, rel: number): number => wrap180(startYaw + rel);

/** The stick half to hold: rleft raises raiseYaw, rright lowers it; null once within `tol`. */
export function turnKey(yaw: number, target: number, tol: number): 'rleft' | 'rright' | null {
  const err = wrap180(target - yaw);
  if (Math.abs(err) <= tol) return null;
  return err > 0 ? 'rleft' : 'rright';
}

/** Wall ms a turn may take before it gives up and says so (an instrument's bound, an adaptation). */
export const YAW_TURN_GIVE_UP_MS = 6000;
/**
 * An overshoot tap's hold: YAW_TAP_MS_PER_DEG ms a degree of error left, clamped to [YAW_TAP_MIN_MS, YAW_TAP_MAX_MS].
 * The batch review of fb1a34b4c: a fixed 40 ms full-push tap hunted 10-11 presses at +/-0.5 degrees and once gave up
 * 0.8 off. An instrument's tuning (an adaptation, not a game value): a tap shorter than a game frame (30 Hz) may not
 * register, and the loop presses again.
 */
export const YAW_TAP_MIN_MS = 15;
export const YAW_TAP_MAX_MS = 60;
export const YAW_TAP_MS_PER_DEG = 10;

export function yawTapMs(err: number): number {
  return Math.max(YAW_TAP_MIN_MS, Math.min(YAW_TAP_MAX_MS, Math.abs(err) * YAW_TAP_MS_PER_DEG));
}
