// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blastLine1, blastPoint, BLAST_LINE1_END_PLACEHOLDER } from '../../viewer/src/net/blast';
import { roomOn } from './sceneRoundsDisc';

/**
 * LATER 991 (research 400 s9-s10; simulation track, placeholder, pending review): `BLAST_LINE1_END_PLACEHOLDER` standing
 * moves from the root stand-in 11.48 to 11.3, the top of the bracket the captures allow -- not a body point (which SEAL
 * node line 1 aims at, `FUN_003c7ee0` D:L319049-319056 after `FUN_003c7af0`'s partition, is unread).
 *
 * The evidence, the Shadow rig on r0004, 2026-11-13 (research 400 s10): C1's ladder wall on MP6 (`building_wc1/wc1di1`,
 * top 10.25, near face x ~1566), the revised near step's throws 3 and 4 -- bursts (1506.02, 31.10, 2016.63) and
 * (1504.14, 31.10, 2016.76), the victim's feet both at (1573.39, 30, 2017.50), 67.4 and 69.3 u -- both SPARED, where
 * line 1 to 11.48 clears the wall's top (the port hurt). The ~70 u open control hurt 2 of 3, so fragments arrive there;
 * the corrected count (FRAG-COUNT) gives no fragment on 17.6 % (67.4 u) and 21.2 % (69.3 u) of throws, both spared by the
 * count alone 3.7 %: at ~96 % at least one is line 1 shut, its end under ~11.35 (under 11.31 if both) -- the cut-offs on the disc's hull, the cap sloping to ~10.22 at the crossing.
 *
 * Red on the base: line 1 to the standing end is OPEN at 11.48 on both throws, so the room hurts him.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP6.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));
type V3 = [number, number, number];
type Thrown = { record: { explosionRadius: number; explosionDamage: number; name: string; id: number }; piercing: number; fragments: boolean };

/** The two throws, each the rig's burst (the lifted point, the floor + 1.1) and the victim's settled feet. */
const THROWS: { id: string; burst: V3; feet: V3 }[] = [
  { id: 'throw 3 (cut-off 11.346)', burst: [1506.02, 31.10, 2016.63], feet: [1573.39, 30, 2017.50] },
  { id: 'throw 4 (cut-off 11.313)', burst: [1504.14, 31.10, 2016.76], feet: [1573.39, 30, 2017.50] },
];
/** The room's lift toward the end (`sightFrom`, IMPACT_SIGHT_READING 0.1), copied: the room keeps it private. */
const sight = (p: V3, h: V3): V3 => {
  const d = [h[0] - p[0], h[1] - p[1], h[2] - p[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(l > 0.1)) return p;
  const k = 0.1 / l;
  return [p[0] + d[0]! * k, p[1] + d[1]! * k, p[2] + d[2]! * k];
};

describe.skipIf(!DISC)('LATER 991: line 1 ends at the bracket\'s top on a standing body (MP6, the C1 near step\'s throws 3 and 4)', () => {
  it('RED: line 1 to the standing end is shut by the wall on both throws (open at the old 11.48)', async () => {
    const s = await roomOn(DISC!, 'MP6');
    const grid = s.map.grid, def = s.map.defaultMaterial ?? '';
    for (const t of THROWS) {
      const at = (h: number): V3 => [t.feet[0], t.feet[1] + h, t.feet[2]];
      expect(blastLine1(grid, sight(t.burst, at(11.48)), at(11.48), 150, def), `${t.id}: the old 11.48 clears the wall`).toBe(true);
      const end = at(BLAST_LINE1_END_PLACEHOLDER.stand);
      expect(blastLine1(grid, sight(t.burst, end), end, 150, def), `${t.id}: the standing end is shut`).toBe(false);
    }
  });

  it('RED: the room spares him on both throws (`blastPlayers` from the rest point, the room\'s own path)', async () => {
    const s = await roomOn(DISC!, 'MP6');
    const room = s.room as unknown as {
      thrown(kind: string): Thrown | null;
      blastPlayers(t: Thrown, point: V3, ownerOf: () => null, facing: undefined, name: string): void;
      combat: (a: unknown, q: unknown, data: { status: string }) => void;
      kill: (...args: unknown[]) => void;
    };
    const t = room.thrown('M67')!;
    let report: { status: string } | null = null;
    room.combat = (_a, q, data) => { if (q === s.player(2)) report = data; };
    room.kill = () => {};
    for (const th of THROWS) {
      const victim = s.place(2, th.feet) as unknown as { alive: boolean; sim: { walker: { state: { x: number; y: number; z: number } } } };
      victim.alive = true;
      Object.assign(victim.sim.walker.state, { x: th.feet[0], y: th.feet[1], z: th.feet[2] });
      s.place(1, [th.feet[0] + 2000, th.feet[1], th.feet[2]]);
      const rest: V3 = [th.burst[0], th.burst[1] - 1, th.burst[2]];      // the node: the lifted burst less the lift
      expect(blastPoint(rest)[1]).toBeCloseTo(th.burst[1], 9);
      report = null;
      room.blastPlayers(t, rest, () => null, undefined, 'P1');
      expect((report as { status: string } | null)?.status ?? 'none', th.id).not.toBe('applied');
    }
  });
});
