import type { Page } from '@playwright/test';
import type {} from '../src/hook';

/**
 * NET-LOOK (OT.R38 / H115, "Controller only"; web research 223 §8): in a match -- any page with the match connection, the
 * offline Play room (`/testroom?mode=play` without `&fly` or `&nomatch`) included -- the room holds every look to the
 * stick's law (128.1 degrees a second at full push) and the page's prediction holds its body the same. A snap of the
 * camera through the debug hook (`setCamera`, the front end's `aimAt`) is no input a player can make: the body turns to
 * it over up to 1.4 s, and a spec that moves or fires at once goes down the body's old facing (a steering loop circles
 * its point; a round misses). **A networked spec turns within the law (`turnTo`, `steer`) or waits `SNAP_SETTLE_MS`
 * after a snap before it moves or fires.** Specs without the match connection (`&fly`, `&nomatch`, Explore) have no gate.
 */

/** The stick's full-push turn, degrees a second (`MAX_YAW_RATE`, research 83). */
export const LOOK_LAW_DEG_S = 128.1;
/** What the harness turns at: under the law, with room for the frame's jitter. */
export const STEER_RATE = 110;
/** A half turn at the law, and a margin: what a spec waits after a snap before it moves or fires. */
export const SNAP_SETTLE_MS = 1_500;

/** The short turn from yaw `a` to `b`, degrees in [-180, 180). */
export const turnOf = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * A steering step: from `yaw` toward `want`, at most `STEER_RATE` x the time since the last step (`dtMs`). The caller
 * keeps `yaw` (the camera's, as it set it) and calls this once a loop.
 */
export function steer(yaw: number, want: number, dtMs: number): number {
  const step = (STEER_RATE * Math.max(0, dtMs)) / 1000;
  return yaw + Math.max(-step, Math.min(step, turnOf(yaw, want)));
}

/** Turns `p`'s look to `yaw` (and `pitch`) at `STEER_RATE`, standing, and waits for the body to be on it. */
export async function turnTo(p: Page, yaw: number, pitch = 0): Promise<void> {
  const start = (await p.evaluate(() => window.__viewer.pose())) as { yaw: number; pitch: number };
  let now = start.yaw, tilt = start.pitch;
  for (let at = Date.now(); Math.abs(turnOf(now, yaw)) > 0.5 || Math.abs(tilt - pitch) > 0.5;) {
    await p.waitForTimeout(30);
    const t = Date.now(), dt = t - at;
    at = t;
    now = steer(now, yaw, dt);
    const tiltStep = (STEER_RATE * 0.42 * dt) / 1000;               // the pitch's law: pitch_rate / turn_maxrate of the turn
    tilt += Math.max(-tiltStep, Math.min(tiltStep, pitch - tilt));
    await p.evaluate(([y, q]) => window.__viewer.setCamera({ yaw: y, pitch: q }), [now, tilt] as const);
  }
  await p.waitForTimeout(200);
}

/** A point or a body's feet, (x, y, z). */
export type V3 = [number, number, number];

/** The look's yaw from `from` toward `to`, degrees (the body faces -z at yaw 0). */
export const yawToward = (from: readonly number[], to: readonly number[]): number =>
  (Math.atan2(-(to[0]! - from[0]!), -(to[2]! - from[2]!)) * 180) / Math.PI;

/**
 * The cap on `aimToward`'s turns. It is small on purpose. A half turn slides the feet 1.4-2.8 u, so at 15 u the second
 * turn is 6-11 degrees, the third a fraction of one, and the fourth only confirms the aim. A body that is still off
 * after that is moving for some other reason, and the aim fails loudly instead of spinning.
 */
export const AIM_PASSES_MAX = 4;
/**
 * The yaw change under which the aim holds, degrees. COARSE on purpose: every corrective turn slides the feet again
 * (R4P-301's foot plant, fc1506c838, the original's), up to ~2.5 u on an ~8 degree turn on the gate boxes, so a fine
 * tolerance chases the slide (the release check, 2026-11-26: 0.5 degrees failed to settle in 4 passes). 3 degrees stays on
 * a hostage's body out to `AIM_REACH_MAX` (half its width is ~3.4 degrees at 25 u). The main controller's ruling.
 */
export const AIM_SETTLED_DEG = 3;
/** The farthest a target may stand from the feet when the aim settles, u: beyond it 3 degrees could graze, so it fails. */
export const AIM_REACH_MAX = 25;

/**
 * Aims a body at `target` when its feet move while it turns. Each pass reads the feet, takes the yaw toward the target
 * from them, and turns to it. The aim stops once a pass's yaw differs from the last turn's by under `AIM_SETTLED_DEG` (3 degrees, coarse because each
 * corrective turn slides the feet again), and only for a target within `AIM_REACH_MAX`.
 * It returns the yaw the body faces. R4P-301's foot plant (fc1506c838; it is the original's, r0004 FUN_00553870)
 * slides the feet on a standing turn (about 0.01-0.015 u a degree), so a yaw taken once before the turn ends 6-11
 * degrees off a point 15 u away. The aim is therefore re-taken after each turn. This is a test instrument (product
 * track) and changes nothing in the game.
 */
/** The settled yaw, once the target is within `AIM_REACH_MAX` of the feet (level distance); else a loud failure. */
function settled(yaw: number, f: readonly number[], target: readonly number[]): number {
  const dist = Math.hypot(target[0]! - f[0]!, target[2]! - f[2]!);
  if (dist > AIM_REACH_MAX) {
    throw new Error(`aimToward: the target is ${dist.toFixed(1)} u from the feet, beyond AIM_REACH_MAX ${AIM_REACH_MAX}: a ${AIM_SETTLED_DEG}-degree aim could graze it`);
  }
  return yaw;
}

export async function aimToward(target: readonly number[], feet: () => Promise<readonly number[]>, turn: (yaw: number) => Promise<void>): Promise<number> {
  let last: number | null = null;
  const bearings: string[] = [];
  for (let pass = 0; pass < AIM_PASSES_MAX; pass++) {
    const f = await feet();
    const want = yawToward(f, target);
    bearings.push(`${want.toFixed(2)} from ${f.map((v) => v.toFixed(2)).join(',')}`);
    if (last !== null && Math.abs(turnOf(last, want)) < AIM_SETTLED_DEG) return settled(last, f, target);
    await turn(want);
    last = want;
  }
  const f = await feet();
  const want = yawToward(f, target);
  if (last !== null && Math.abs(turnOf(last, want)) < AIM_SETTLED_DEG) return settled(last, f, target);
  throw new Error(`aimToward: not converged in ${AIM_PASSES_MAX} turns; last bearing ${want.toFixed(2)} from ${f.map((v) => v.toFixed(2)).join(',')}, facing ${last?.toFixed(2)}; the passes ${bearings.join(' | ')}`);
}

/**
 * Turns `p` toward `target` within the law (`turnTo`, standing, at `pitch`), re-taking the aim after each turn's foot
 * slide (`aimToward`), and returns the yaw. The feet are the match connection's (`net().feet`), the ones the specs stand
 * by. The caller reads the feet again after this, because the turn has moved them.
 */
export async function turnToward(p: Page, target: readonly number[], pitch = 0): Promise<number> {
  const feet = async (): Promise<readonly number[]> => {
    const f = (await p.evaluate(() => window.__viewer.net!()?.feet ?? null)) as number[] | null;
    if (!f) throw new Error('turnToward: the page has no feet (no match connection)');
    return f;
  };
  return aimToward(target, feet, (yaw) => turnTo(p, yaw, pitch));
}
