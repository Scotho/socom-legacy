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
