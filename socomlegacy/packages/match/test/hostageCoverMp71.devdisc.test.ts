import { describe, expect, it } from 'vitest';
import { aiMapsFromZdb, M67 } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { HostagePathPlanner } from '../src/hostagePath';
import { fleeCell, fleeDepth, HOSTAGE_FLEE_POINT_READING } from '../src/hostageDanger';

/**
 * LATER 1226 (research 445 s5; simulation track, reading, pending review; dev-disc; checked against a capture of the
 * original -- `l1226-dir`, PC 1, r0004, MP71 Fish Hook, four trials E1 / W1 / E2 / W2, memory reads of the host every row,
 * hand-scored; evidence/later1226-dir/, sha256 c07dbac1...95f1): the flight's second search, `FUN_0053a160`
 * (D:L404384-404460) through the flood fill `FUN_00536c80` (D:L402793-403000) and its callback 0x53a5e0 -- COVER, the
 * nearest open cell with a blocker (kind 0, 8 or 10) directly between it and the predicted landing.
 *
 * Each case is a hostage the capture pushed into 0x1b: its spawn, the original's predicted landing (G+0x70..78, the very
 * point the second search takes, D:L423290) and the run it made (its net displacement). At every one the port's 8-way
 * walk finds no cell at n - 2 (as the original's first search must have failed: it ran toward the threat's side), so
 * case 3's second attempt decides. Before 1226 the port skipped it and took the walk's own cell (its third attempt):
 * straight east or west along x, against the capture in most cases. Pinned: the port's flee cell lies within 35 degrees
 * of the original's run in eight of the nine runs. E2's east hostage is the ninth: from the same spawn and nearly the
 * same landing the original ran south-east in E1 (48 degrees) and south-west in E2 (136 degrees); a deterministic search
 * answers one of them -- the port's matches E1 -- and E2's difference (the mid-flight prediction's timing, the runtime
 * visited bits `FUN_00518180` leaves, list 0x66a0b8's objects) is unread.
 */

const data = fixture('RUN/MP71.ZDB');

type Case = { name: string; hostage: readonly [number, number, number]; landing: readonly [number, number, number]; run: readonly [number, number] };
const EAST = [2124.58, 179, 791.81] as const, WEST = [2094.58, 179, 781.81] as const, SOUTH = [2114.58, 179, 761.81] as const;
const E1 = [2174.01, 179.68, 797.40] as const, W1 = [1941.50, 159.98, 794.12] as const, E2 = [2170.63, 178.74, 797.46] as const, W2 = [1993.74, 171.29, 792.77] as const;
const CASES: Case[] = [
  { name: 'E1 east', hostage: EAST, landing: E1, run: [16.6, -14.7] },
  { name: 'E1 west', hostage: WEST, landing: E1, run: [10.3, -18.4] },
  { name: 'W1 east', hostage: EAST, landing: W1, run: [11.1, -63.8] },
  { name: 'W1 west', hostage: WEST, landing: W1, run: [-36.4, 21.7] },
  { name: 'W1 south', hostage: SOUTH, landing: W1, run: [13.4, -33.0] },
  { name: 'W2 east', hostage: EAST, landing: W2, run: [-19.1, -25.0] },
  { name: 'W2 west', hostage: WEST, landing: W2, run: [-36.2, 20.1] },
  { name: 'W2 south', hostage: SOUTH, landing: W2, run: [-40.0, -35.2] },
];
const angle = (a: readonly [number, number], b: readonly [number, number]): number => {
  const d = Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])) * (180 / Math.PI);
  return d > 180 ? 360 - d : d;
};

describe.skipIf(!data)('LATER 1226: the flight\'s cover search against the l1226-dir capture on MP71 (dev-disc)', () => {
  const planner = data ? new HostagePathPlanner(aiMapsFromZdb(data)) : null;
  const flee = (c: Case) => {
    const here = planner!.locate([...c.hostage])!;
    const away: [number, number] = [c.hostage[0] - c.landing[0], c.hostage[2] - c.landing[2]];
    const cell = fleeCell(planner!, here, away, fleeDepth(M67.explosionRadius), 'frag', c.landing);
    const from = planner!.point(here), to = planner!.point(cell!);
    return { here, cell, move: [to[0] - from[0], to[2] - from[2]] as [number, number] };
  };

  it.each(CASES)('$name: the flee cell lies within 35 degrees of the original\'s run', (c) => {
    const { here, cell, move } = flee(c);
    expect(here).not.toBeNull();
    expect(cell).not.toBeNull();
    expect(Math.hypot(...move), 'a real move').toBeGreaterThan(10);
    expect(angle(move, c.run), `port ${move.map((v) => v.toFixed(0))} vs capture ${c.run}`).toBeLessThan(35);
  });

  it('at every case the walk alone finds no cell at n - 2 (so the second search decides, as the capture\'s runs toward the threat say)', () => {
    for (const c of CASES) {
      const here = planner!.locate([...c.hostage])!;
      const away: [number, number] = [c.hostage[0] - c.landing[0], c.hostage[2] - c.landing[2]];
      const walk = fleeCell(planner!, here, away, fleeDepth(M67.explosionRadius), 'frag');   // no landing: no cover search
      const steps = walk ? Math.max(Math.abs(walk.x - here.x), Math.abs(walk.z - here.z)) : 0;
      expect(steps, c.name).toBeLessThan(fleeDepth(M67.explosionRadius) - HOSTAGE_FLEE_POINT_READING.accept);
    }
  });

  it('E2 east (named, not matched): the port answers E1\'s south-east for the same spawn; the original ran south-west in E2', () => {
    const { move } = flee({ name: 'E2 east', hostage: EAST, landing: E2, run: [-12.7, -15.7] });
    expect(angle(move, [16.6, -14.7]), 'as E1').toBeLessThan(35);
  });
});
