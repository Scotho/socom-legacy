// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { probeGround, selectFloor } from '@s2u/scene';
import { groundGrid, groundPolygons, STEEP_FLOOR_CONTACT_READING, STEP_PROBE_LIFT_READING, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * MP51-FLOOR-TRAP (research 217 section 2.8): r0004's near-vertical floor push (`FUN_0054f330`'s twin at r4 0x554180).
 * A standing body whose floor is steeper than `n_y` 0.1, whose slide has not started and which faces into the face
 * (its back axis along the face's horizontal normal) is pushed off it along the normal (`FUN_0054a6d0` with 6, the
 * driver D:L416578-416613). The reported spot: Vigilance (MP51), bot 227 of the BCMP's s41 run -- a 0.09-wide sliver
 * of `worldmodel/wc11`'s stair side (n_y 0.018) beside a 0.13-wide hole in the collision before `canal_wc11`, where the
 * slide's step (scaled by n_y) ends over the hole every tick and the body never moved. Disc-backed: skipped without it.
 */
const DISC = process.env.SOCOM_DISC;
/** In the sliver: the only floor under the feet is the stair side's face. */
const SPOT = [1506.714, -68.454, 678.646] as const;
/** The face's horizontal normal (0.919, 0.395), as a yaw the body faces into it (forward = -normal). */
const INTO = (Math.atan2(0.919, 0.395) * 180) / Math.PI;

describe('the near-vertical floor push (r0004)', () => {
  it('is r0004\'s 0.1, the driver\'s 6 and the push\'s 0.7', () => {
    expect(STEEP_FLOOR_CONTACT_READING).toEqual({ normalY: 0.1, distance: 6, gain: 0.7 });
  });

  describe.skipIf(!DISC)('Vigilance\'s stair side (bot 227, s41)', () => {
    let grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>;
    beforeAll(() => {
      const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB');
      grid = groundGrid(map.ground!);
      polys = groundPolygons(map.ground!);
    });
    const body = (yaw: number): Walker => {
      const w = new Walker(grid);
      w.driver = new Traversal(grid, polys);
      expect(w.place(SPOT[0], SPOT[1] + STEP_PROBE_LIFT_READING, SPOT[2])).toBe(true);
      w.state.yaw = yaw;
      return w;
    };

    it('the spot\'s floor is the near-vertical face', () => {
      const floor = selectFloor(probeGround(grid, SPOT[0], SPOT[2]), SPOT[1] + STEP_PROBE_LIFT_READING, SPOT[1]);
      expect(floor?.normal[1]).toBeLessThan(STEEP_FLOOR_CONTACT_READING.normalY);
    });

    for (const off of [0, -40, 40]) {
      it(`facing into the face (${off} degrees off its normal), the body is pushed off it in one tick`, { timeout: 60_000 }, () => {
        const w = body(INTO + off);
        w.tick({ forward: 0, right: 0, boost: false });
        const moved = Math.hypot(w.state.x - SPOT[0], w.state.z - SPOT[2]);
        expect(moved).toBeGreaterThan(3);
        const floor = selectFloor(probeGround(grid, w.state.x, w.state.z), w.state.y + STEP_PROBE_LIFT_READING, w.state.y);
        expect(floor!.normal[1]).toBeGreaterThan(0.9);                // on canal_wc11
      });
    }

    it('facing away from the face, r0004 pushes nothing: the slide holds the body as before', { timeout: 60_000 }, () => {
      const w = body(INTO + 180);
      for (let i = 0; i < 60; i++) w.tick({ forward: 0.85, right: 0, boost: false });
      expect(Math.hypot(w.state.x - SPOT[0], w.state.z - SPOT[2])).toBeLessThan(0.01);
    });

    it('the bot\'s case: held facing its route, freed once it turns into the face (its recovery route\'s heading)', { timeout: 60_000 }, () => {
      const route = (to: readonly [number, number]): number => (Math.atan2(-(to[0] - SPOT[0]), -(to[1] - SPOT[2])) * 180) / Math.PI;
      const w = body(route([1529.8, 696.1]));                         // its patrol leg: away from the face
      for (let i = 0; i < 30; i++) w.tick({ forward: 0.85, right: 0, boost: false });
      expect(Math.hypot(w.state.x - SPOT[0], w.state.z - SPOT[2])).toBeLessThan(0.01);
      w.state.yaw = route([1492.3, 686.1]);                          // its recovery leg: into the face
      w.tick({ forward: 0.85, right: 0, boost: false });
      expect(Math.hypot(w.state.x - SPOT[0], w.state.z - SPOT[2])).toBeGreaterThan(3);
    });
  });
});
