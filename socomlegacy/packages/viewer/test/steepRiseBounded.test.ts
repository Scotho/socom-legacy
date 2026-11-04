// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEAL_TUNING } from '@s2u/scene';
import { groundGrid, groundPolygons, STEEP_RISE_FACE_MIN_READING, STEP_PROBE_LIFT_READING, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * LATER 590, the owner's interim ruling (2026-10-31, "Take bounded fix"): the grounded step refuses a steep rise only on a
 * face at least `step_height` tall (`STEEP_RISE_FACE_MIN_READING`, research 217 section 2.7). The reported spot: Vigilance
 * (MP51), feet (711.610, 65.773, 1150.560) -- on the low side of `wc18/ground_wc18`'s rounded cap, a bevel 5.5 tall --
 * where the unbounded rule held the body in five of eight headings (OBF-21's replay). Disc-backed: skipped without it.
 */
const DISC = process.env.SOCOM_DISC;
const SPOT = [711.61, 65.773, 1150.56] as const;

describe('the steep-rise bound (LATER 590, interim)', () => {
  it('is the original\'s step height', () => {
    expect(STEEP_RISE_FACE_MIN_READING).toBe(SEAL_TUNING.stepHeight);
  });

  describe.skipIf(!DISC)('Vigilance\'s pocket (the owner\'s report, v0.3.32)', () => {
    let grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>;
    beforeAll(() => {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB');
      grid = groundGrid(map.ground!);
      polys = groundPolygons(map.ground!);
    });
    const walk = (stance: 'stand' | 'crouch', yaw: number, push = 1): number => {
      const w = new Walker(grid);
      w.driver = new Traversal(grid, polys);
      w.place(SPOT[0], SPOT[1] + STEP_PROBE_LIFT_READING, SPOT[2]);
      w.stance = stance; w.state.yaw = yaw;
      for (let i = 0; i < 120; i++) w.tick({ forward: push, right: 0, boost: false });
      for (let i = 0; i < 300 && ((w as unknown as { action_: unknown }).action_ !== null || w.airborne); i++) w.tick({ forward: 0, right: 0, boost: false });
      return Math.hypot(w.state.x - SPOT[0], w.state.z - SPOT[2]);
    };
    // Full-stick crouch moves with the standing run's body (LATER 591), so a half-stick crouch walk is its own case.
    for (const [stance, push] of [['stand', 1], ['crouch', 1], ['crouch', 0.5]] as const) {
      it(`${stance} at stick ${push}: the body leaves the spot in every one of eight headings from the reported yaw (29.206)`, { timeout: 120_000 }, () => {
        const moved = Array.from({ length: 8 }, (_, k) => +walk(stance, (29.206 + 45 * k) % 360, push).toFixed(2));
        for (const [k, d] of moved.entries()) expect(d, `heading ${k} (${moved.join(', ')})`).toBeGreaterThan(1);
      });
    }
  });
});
