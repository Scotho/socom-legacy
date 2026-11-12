// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segmentHits, surfaceMaterial } from '@s2u/scene';
import { blastExposed, blastSeen, blastSeesThrough } from '../../viewer/src/net/blast';
import { roundAdmits } from '../../viewer/src/round';
import { roomOn, surfacesOver } from './sceneRoundsDisc';

/**
 * R4B-10 (research 388 s4, the review's P2), dev-disc: the two MP72 browser specs whose lines cross the blast's exposure
 * test -- `e2e/oneFacedWallBlast.spec.ts` and `e2e/crossroadsBaseRound.spec.ts` -- read on the disc's hull through the
 * room's map (`roomOn`: `loadSimMap`, r0004's G1 edits applied), each line as the room draws it (`sightFrom`'s 0.1 lift
 * toward the head; the standing head 18.3). Under the see-through test (`blastExposed`) each line's outcome is the one
 * `blastSeen` gave, so neither spec's text goes stale with it: the face that stops the control is `b1_wc05`'s, of the
 * map's default ASPHALT, not INVISIBLE_DI. It skips without the disc (a skip, not a pass).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP72.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

type V3 = [number, number, number];
const HEAD = 18.3;
/** The room's `sightFrom` (IMPACT_SIGHT_READING, 0.1 toward the head): copied, the room keeps it private. */
const sight = (p: V3, h: V3): V3 => {
  const d = [h[0] - p[0], h[1] - p[1], h[2] - p[2]], k = 0.1 / Math.hypot(d[0]!, d[1]!, d[2]!);
  return [p[0] + d[0]! * k, p[1] + d[1]! * k, p[2] + d[2]! * k];
};

describe.skipIf(!DISC)(`R4B-10: MP72's spec lines under the see-through test (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it("oneFacedWallBlast: the one face met from behind is clear; the two-faced control is stopped by b1_wc05's ASPHALT face, under both tests; crossroadsBaseRound: no planted point near the base's site changes", async () => {
    const s = await roomOn(DISC!, 'MP72');
    const grid = s.map.grid, def = s.map.defaultMaterial ?? '';
    const line = (p: V3, h: V3) => {
      const from = sight(p, h);
      return {
        seen: blastSeen(grid, from, h), exposed: blastExposed(grid, from, h, def),
        hits: segmentHits(grid, from, h, roundAdmits, undefined, true).map((x) => ({ path: x.poly.path, material: surfaceMaterial(x.poly.material, def) })),
      };
    };
    expect(def).toBe('ASPHALT');

    // oneFacedWallBlast.spec.ts' ONE and TWO (its own coordinates).
    const one = line([1375, 50.1, 1800], [1345, 42.5 + HEAD, 1800]);
    expect([one.seen, one.exposed, one.hits]).toEqual([true, true, []]);
    const two = line([1475, 42.6, 1702.3], [1495, 42.5 + HEAD, 1702.3]);
    expect([two.seen, two.exposed]).toEqual([false, false]);
    expect(two.hits.map((h) => [h.path, h.material.name, blastSeesThrough(h.material)])).toEqual([['worldmodel/b1_wc05', 'ASPHALT', false]]);

    // crossroadsBaseRound.spec.ts: the SEAL's site is the base's healthy node; the bomb planted from 10 u east of it (the
    // plant hand within 7 u of the feet, `BOMB_PLANT_HAND_READING`), on the floor (14.3), at lifts 0.1-5; the SEAL's head
    // 160 u south. Every point over a 21 x 21 u square round it: the same outcome under both tests.
    const node = s.origin('terrorist_base/crates_weapons=crates_weapons/healthy') as V3;
    const site = (s.room.bomb as unknown as { sites: { seal: { at: number[] } | null } }).sites.seal!.at;
    expect(site.map((v) => Math.round(v * 1000))).toEqual(node.map((v) => Math.round(v * 1000)));
    const south = surfacesOver(s.map.ground, node[0], node[2] - 160).filter((y) => y <= node[1] + 2).at(-1)!;
    const head: V3 = [node[0], south + HEAD, node[2] - 160];
    let points = 0, differ = 0;
    const blockers = new Set<string>();
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const x = site[0]! + 10 + dx, z = site[2]! + dz;
      for (const y of surfacesOver(s.map.ground, x, z).filter((v) => Math.abs(v - 14.3) < 1)) for (const lift of [0.1, 1, 5]) {
        const r = line([x, y + lift, z], head);
        points++;
        if (r.seen !== r.exposed) differ++;
        if (!r.seen) for (const h of r.hits) blockers.add(`${h.path}:${h.material.name}:${blastSeesThrough(h.material)}`);
      }
    }
    expect([points, differ]).toEqual([2247, 0]);
    expect([...blockers].sort()).toEqual(['worldmodel/warehouse=warehouse/di_intwalls_wh:ASPHALT:false']);
  }, 300_000);
});
