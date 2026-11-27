import { describe, expect, it } from 'vitest';
import { aiMapsFromZdb, M67 } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { HostagePathPlanner } from '../src/hostagePath';
import { fleeCell, fleeDepth, HOSTAGE_FLEE_FALLBACK_PLACEHOLDER, HOSTAGE_FLEE_POINT_READING } from '../src/hostageDanger';

/**
 * LATER 1224 (b) (research 445 s5; dev-disc; the port's flee search at Q24c's spot on MP71, against the capture -- Q24c
 * M1 and M2, PC 1, r0004, a memory-read capture of the original, hand-scored, n = 1 each):
 * - M1: an M67 at rest 34 u from a following hostage; the original's 0x1b held sub 6 for one frame, then 7 with no move
 *   child -- every one of case 3's searches failed (D:L423219-423335) and it held;
 * - M2: the round at rest 138 u WEST, thrown west by a thrower west of the hostage; the original RAN 125 u west, toward
 *   the threat, holding sub 6 with one child. The 8-way walk goes AWAY from the threat; a run toward it fits the
 *   fallback `FUN_0053a160` -- since read and built as the COVER search (LATER 1226, research 445 s5).
 * LATER 1226: this test calls `fleeCell` with NO landing, so it pins the walk and the third attempt only -- a path the room
 * no longer takes (it passes the landing; `hostageCoverMp71.devdisc.test.ts` pins the cover search against l1226-dir).
 * Q24c's landings were not recorded, so these spots are not a cover pin.
 * Pinned here, as the port is: at both spots the 8-way walk finds no cell at depth n - 2 (as the original's first search
 * failed), and the port's last resort -- the walk's own cell at any depth -- answers one cell (about 11 u) east. Against
 * the capture: M1 held (the original's own last resort failed there, why unread), M2 ran west. The positions are the capture's rest points; the original searched
 * from its prediction at the push, mid-flight (`FUN_0055cdc0`; the port's HOSTAGE_FLEE_LANDING_PLACEHOLDER).
 */

const data = fixture('RUN/MP71.ZDB');

describe.skipIf(!data)('LATER 1224 (b): the port\'s flee search at Q24c\'s MP71 spot (dev-disc)', () => {
  const cases = [
    { name: 'M1', hostage: [2188.1, 179.1, 801.8], round: [2168.96, 179.1, 830.11] },
    { name: 'M2', hostage: [2183.11, 179.1, 804.32], round: [2045.43, 179.1, 814.18] },
  ] as const;
  for (const c of cases) {
    it(`${c.name}: no cell at depth n - 2; the port's last resort answers one cell east (the original: ${c.name === 'M1' ? 'held' : 'ran 125 u west'})`, () => {
      expect(HOSTAGE_FLEE_FALLBACK_PLACEHOLDER).toBe('the walk cell');
      const planner = new HostagePathPlanner(aiMapsFromZdb(data!));
      const here = planner.locate([...c.hostage]);
      expect(here).not.toBeNull();
      const away: [number, number] = [c.hostage[0] - c.round[0], c.hostage[2] - c.round[2]];
      const n = fleeDepth(M67.explosionRadius);
      expect(n).toBe(18);                                           // int(150 x 1.2 x 0.1)
      const cell = fleeCell(planner, here!, away, n, 'frag');
      expect(cell).not.toBeNull();
      const steps = Math.max(Math.abs(cell!.x - here!.x), Math.abs(cell!.z - here!.z));
      expect(steps, 'far short of n - 2: the walk failed, the last resort answered').toBeLessThan(n - HOSTAGE_FLEE_POINT_READING.accept);
      expect(steps).toBe(1);
      const to = planner.point(cell!), from = planner.point(here!);
      expect(to[0] - from[0], 'east').toBeGreaterThan(0);
    });
  }
});
