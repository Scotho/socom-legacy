// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { groundGrid, groundPolygons, probeLiftOf, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * LATER 994 (Desert Glory's SEAL-building window, `mp6_window_wide`, plane x 1234.5 at z 1768): the original, measured --
 * DG-WINDOW-SWEEP-r0004 (IQ-164, Shadow PC 2, r0004, one-console LAN; a capture of the original, unscored, unreviewed until a
 * second reader): a full-stick running jump from the SAND side goes THROUGH the window only from a take-off 39.39 u off the
 * plane (3 of 3; the pass band lies inside (37.23, 41.55), no other grid point in it), and from every other take-off
 * (28.55-53.13 u, 43.73 3 of 3) is STOPPED against the wall below the window at x 1240.8-1242.5. The port passes on a press
 * at ~42-42.5 u (43.5-44 before VIGIJUMP-A) and stops at x 1240.4-1241.5 elsewhere: the stop matches, the pass band sits ~2-3 u
 * too far out -- row 994's cause, the air head line's look-ahead meeting the wall above the window. The fix is v0.4.33's (the
 * main controller 2026-11-24); this is its RED. Fixture MP6 (no disc).
 */
const PLANE_X = 1234.5, Z = 1768;
/** The committed MP6 fixture; the public export does not carry socomlegacy/test-fixtures, and there this skips, said. */
const MP6 = fixture('RUN/MP6.ZDB');

/** A full-stick run in -x from the sand side, the jump pressed on the first tick at or inside `takeOff` u of the plane. */
function windowJump(grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>, takeOff: number): { through: boolean; restX: number; pressedAt: number } {
  const w = new Walker(grid);
  w.driver = new Traversal(grid, polys);
  expect(w.place(1294.5, probeLiftOf('stand'), Z)).toBe(true);
  w.state.yaw = 90;                                                  // forward = -(sin 90, cos 90): -x
  let jumped = false, pressedAt = NaN;
  for (let n = 0; n < 400; n++) {
    if (!jumped && w.state.x <= PLANE_X + takeOff && !w.airborne) { pressedAt = w.state.x - PLANE_X; jumped = w.jump(); expect(jumped).toBe(true); }
    w.tick({ forward: 1, right: 0, boost: false });
    if (jumped && !w.airborne && (w.state.x < PLANE_X - 10 || w.state.x > PLANE_X + 1)) break;
  }
  return { through: w.state.x < PLANE_X - 10, restX: w.state.x, pressedAt };
}

describe.skipIf(!MP6)(`LATER 994: the running jump through Desert Glory's SEAL-building window from the sand side (DG-WINDOW-SWEEP-r0004)${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>;
  beforeAll(() => {
    const map = simMapFromBytes(MP6!, 'RUN/MP6.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
  });

  it('a take-off far out or close in is stopped against the wall below the window (r0004: x 1240.8-1242.5)', () => {
    for (const d of [30, 35, 50]) {
      const r = windowJump(grid, polys, d);
      expect(r.through, `take-off ${d}`).toBe(false);
      expect(r.restX, `take-off ${d}: stopped at the wall below the window`).toBeGreaterThan(PLANE_X + 4);
      expect(r.restX).toBeLessThan(PLANE_X + 9);
    }
  });

  // RED (LATER 994, v0.4.33): the port's pass band is ~2-3 u further out than r0004's. Flip to `it` when the fix lands.
  it.fails('the original\'s band: THROUGH from 39.39 u, STOPPED from 43.73 u (r0004 3 of 3 each)', () => {
    expect(windowJump(grid, polys, 39.39).through, 'through at 39.39 u').toBe(true);
    expect(windowJump(grid, polys, 43.73).through, 'stopped at 43.73 u').toBe(false);
  });
});
