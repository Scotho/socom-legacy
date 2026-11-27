// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { CLAYMORE_RULES, ITEM, readKitTable, segmentHits, surfaceMaterial, type WorldPoly } from '@s2u/scene';
import { loadSimMap } from '../../viewer/src/simMap';
import { MAX_PLAYERS, TICK_HZ } from '../../viewer/src/net/protocol';
import { blastExposed, blastLine1, blastSeen } from '../../viewer/src/net/blast';
import { blastLine } from '../../viewer/src/sceneHealth';
import { roundAdmits } from '../../viewer/src/round';

/**
 * WM-29, research 430 s7 (the main controller's rulings "build B" and, after the first measured gate was missed, "the
 * gate stays; the worst blast is what a round can hold", 2026-11-15): THE GATE IS MEASURED. In the two blast modes the
 * rule is asked of every polygon of the map (scene `segment.ts` `blastHits`), so its cost is the map's polygon count a
 * line. On the two largest maps by that count (the census of s7.5, box/wm-ffblast-census-d78c9ac36: MP82 19452
 * polygons, MP83 15613 -- of the 22, only MP9's 14658 and MP73's 14162 come near), through the room's own map
 * (`loadSimMap`) and the room's own blast predicates:
 *
 * 1. PER LINE, each line from its OWN start (nothing shared between lines: the cost of a line alone):
 *    `segmentHits(..., 'blast')` with the round's `accept` over `LINES` lines from a spawn slot to a point within an
 *    M67's radius of it -- the mean time a line, the gate `LINE_BUDGET_MS` (0.25 ms, the controller's); the default
 *    one-sided path over the same lines beside it, for scale only.
 * 2. THE WORST WHOLE BLAST A ROUND CAN HOLD, every line from the one blast point, against HALF A TICK of the room's
 *    period, 1000 / `TICK_HZ` / 2 ms (`TICK_HZ` 60: viewer `src/net/protocol.ts`, "the game's tick, the server's loop"),
 *    on the MEDIAN blast (the slowest printed beside it, not gated: one slow blast on a box is noise):
 *    - BODIES: every seat of the room, `MAX_PLAYERS` (16: viewer `src/net/protocol.ts`; the game's own MP limit,
 *      research 91), and every escortee the map lists (`SimMap.escortees`, research 237 s1) -- each asked BOTH of its
 *      lines (`blastLine1`, `blastExposed`: the room's `blastLines`);
 *    - CHARGES at rest, one line each (`blastSeen`): for every seat, ALL THREE of a kit's charges -- C4 (`C4`'s
 *      `Ammo_Capacity` x `NumMags` off the disc's `RUN/ZWEAPON.ZAR`, through `readKitTable`), claymores at most
 *      `CLAYMORE_RULES.maxPlaced` down an owner (4: `FUN_003cc1f0(...) < 4`, D:L475306-475308 -- a count of claymores
 *      alone, D:L474101) AND the PMN's whole ring (`PMN Mine`'s capacity x mags: the PMN's own fire asks the same count
 *      of CLAYMORES, D:L475338-475340, so PMNs are bounded by the ring only). A kit holds each of the three once (r0004's
 *      no-duplicate list, `NO_DUPLICATE_ITEMS_READING`, research 378 s2) and has three equipment slots (viewer
 *      `equipment.ts` `EQUIPMENT_SLOTS`), so one kit can hold all three; which side a map's valves let carry which is
 *      NOT taken off (the claymore is the SEALs' and the PMN the Terrorists' on the maps' valves): every seat is given
 *      all three, inside one radius -- an upper bound no round reaches, by the limits alone (the review of 79d589a7e0:
 *      the first re-cut took the larger of the two mines and so left lines out);
 *    - DESTRUCTIBLES, one line each (`blastLine`): every scene destructible of the map.
 *    Beside it, printed and NOT gated (the controller's word of 2026-11-15): the first cut's blast (16 bodies, 32
 *    charges), and a PLAUSIBLE round's -- every seat's body, and for each seat ONE C4 and its own side's mines only (half
 *    the seats the SEALs' claymores, at most 4 each; half the Terrorists' PMN ring), every destructible: still every
 *    seat's charges in one radius, but no seat carrying the other side's mine. "Plausible" is this file's word, a
 *    construction for scale, not a measured round.
 *
 * The end points are timing stand-ins (a body's two heights over a point of the floor's level, not its posed bones): this
 * measures the port's cost, nothing of the original. BOTH gates are asserted, each on its own (`expect.soft`): a miss of
 * either FAILS the test, the lane stops and the numbers go to the controller. A dev-disc test: skipped without
 * `SOCOM_DISC` (not a pass); a box's timing is that box's, said with its record.
 */

const DISC = process.env.SOCOM_DISC;
const MAPS = [82, 83] as const;
const LINES = 4000, BLASTS = 24;
const RADIUS = 150;                       // the M67's Explosion_Radius as the room tests pin it (`roomBlastOcclusion`)
const LINE_BUDGET_MS = 0.25;
const HALF_TICK_MS = 1000 / TICK_HZ / 2;

type V3 = [number, number, number];

describe.skipIf(!DISC)('WM-29 (research 430 s7): the measured gate of the blast modes\' every-polygon rule (dev-disc)', () => {
  for (const m of MAPS) {
    it(`MP${m}: the time a blast line, against ${LINE_BUDGET_MS} ms; the worst whole blast a round can hold, against half a tick`, { timeout: 900_000 }, async () => {
      expect(existsSync(join(DISC!, `RUN/MP${m}.ZDB`)), `MP${m}.ZDB is not on the disc`).toBe(true);
      const map = await loadSimMap(new FsAssetSource(DISC!), `RUN/MP${m}.ZDB`);
      const grid = map.grid, def = map.defaultMaterial ?? '';
      const polygons = grid.objects.reduce((n, o) => n + (o.kind === 'collision' ? o.polys.length : 0), 0);
      const slots = map.slots.map((s) => s.position as unknown as V3);
      expect(slots.length).toBeGreaterThan(0);

      // The round's limits, off the disc's kit table.
      const kits = readKitTable(new Uint8Array(readFileSync(join(DISC!, 'RUN/ZWEAPON.ZAR'))));
      const ring = (id: number): number => { const r = kits.throwables?.get(id)?.record; expect(r, `no record for item ${id} in the kit table`).toBeDefined(); return r!.capacity * r!.mags; };
      const c4 = ring(ITEM.C4), claymores = Math.min(ring(ITEM.CLAYMORE), CLAYMORE_RULES.maxPlaced), pmn = ring(ITEM.PMN);
      const bodies = MAX_PLAYERS + (map.escortees?.length ?? 0);
      const charges = MAX_PLAYERS * (c4 + claymores + pmn);
      const destructibles = map.meta?.scene?.destructibles ?? [];

      let seed = 7;
      const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const near = (c: V3, up: number): V3 => {
        const angle = r() * Math.PI * 2, reach = r() * RADIUS * 0.95;
        return [c[0] + Math.cos(angle) * reach, c[1] + up, c[2] + Math.sin(angle) * reach];
      };
      const from = (i: number): V3 => { const s = slots[i % slots.length]!; return [s[0], s[1] + 1.1 + i * 1e-3, s[2]]; };   // each i its own start

      // 1. A line alone.
      const lines: [V3, V3][] = Array.from({ length: LINES }, (_, i) => { const a = from(i); return [a, near(a, r() * 20)]; });
      const time = (sides: 'blast' | true): { ms: number; hits: number } => {
        let hits = 0;
        const start = performance.now();
        for (const [a, b] of lines) hits += segmentHits(grid, a, b, roundAdmits, undefined, sides).length;
        return { ms: (performance.now() - start) / LINES, hits };
      };
      time('blast'); time(true);                                    // warm: the kept numbers, the caches, the compiler
      const rule = [time('blast'), time('blast'), time('blast')].sort((x, y) => x.ms - y.ms)[1]!;   // the median of three passes
      const plain = [time(true), time(true), time(true)].sort((x, y) => x.ms - y.ms)[1]!;
      console.log(`(WM-29 bench) MP${m}: ${polygons} collision polygons; a 'blast' line alone ${rule.ms.toFixed(4)} ms mean over ${LINES} lines (${rule.hits} hits), budget ${LINE_BUDGET_MS} ms; the default one-sided path ${plain.ms.toFixed(4)} ms (${plain.hits} hits)`);

      // 2. A whole blast: every line from the one point.
      const penetration = (p: WorldPoly): number => surfaceMaterial(p.material, def).penetration;
      const blast = (i: number, bodyCount: number, chargeCount: number): number => {
        const point = from(i + LINES);
        const feet = Array.from({ length: bodyCount }, () => near(point, -1.1));
        const rest = Array.from({ length: chargeCount }, () => near(point, -1));
        const targets = destructibles.map((d) => ({ path: d.targetPath, to: near(point, r() * 20) }));
        const start = performance.now();
        for (const f of feet) {                                      // the worst case asks both lines of every body
          blastLine1(grid, point, [f[0], f[1] + 10, f[2]], RADIUS, def);
          blastExposed(grid, point, [f[0], f[1] + 18.3, f[2]], def);
        }
        for (const c of rest) blastSeen(grid, point, c);
        for (const t of targets) blastLine(grid, point, t.to, t.path, RADIUS, penetration);
        return performance.now() - start;
      };
      const measure = (bodyCount: number, chargeCount: number): { median: number; slowest: number; lines: number } => {
        for (let i = 0; i < 4; i++) blast(i, bodyCount, chargeCount);   // warm
        const times = Array.from({ length: BLASTS }, (_, i) => blast(i + 4, bodyCount, chargeCount)).sort((x, y) => x - y);
        return { median: times[Math.floor(times.length / 2)]!, slowest: times[times.length - 1]!, lines: bodyCount * 2 + chargeCount + destructibles.length };
      };
      const round = measure(bodies, charges);
      console.log(`(WM-29 bench) MP${m}: THE ROUND'S WORST BLAST, ${round.lines} lines (${bodies} bodies x 2 = ${MAX_PLAYERS} seats + ${map.escortees?.length ?? 0} escortees; ${charges} charges = ${MAX_PLAYERS} seats x (C4 ${c4} + claymores ${claymores} + PMN ${pmn}); ${destructibles.length} destructibles): median ${round.median.toFixed(3)} ms, slowest ${round.slowest.toFixed(3)} ms over ${BLASTS} blasts; half a tick ${HALF_TICK_MS.toFixed(3)} ms (TICK_HZ ${TICK_HZ})`);
      const half = MAX_PLAYERS / 2, plausibleCharges = MAX_PLAYERS * 1 + half * claymores + half * pmn;
      const plausible = measure(MAX_PLAYERS, plausibleCharges);
      console.log(`(WM-29 bench) MP${m}: a plausible round's blast, not gated, ${plausible.lines} lines (${MAX_PLAYERS} bodies x 2; ${plausibleCharges} charges = ${MAX_PLAYERS} C4 + ${half} seats x ${claymores} claymores + ${half} seats x ${pmn} PMN; ${destructibles.length} destructibles): median ${plausible.median.toFixed(3)} ms, slowest ${plausible.slowest.toFixed(3)} ms`);
      const first = measure(16, 32);
      console.log(`(WM-29 bench) MP${m}: the first cut's blast, not gated, ${first.lines} lines (16 bodies x 2, 32 charges, ${destructibles.length} destructibles): median ${first.median.toFixed(3)} ms, slowest ${first.slowest.toFixed(3)} ms`);

      expect.soft(rule.ms, `MP${m}: a 'blast' line alone over its budget`).toBeLessThanOrEqual(LINE_BUDGET_MS);
      expect.soft(round.median, `MP${m}: the median of the round's worst blast over half a tick`).toBeLessThanOrEqual(HALF_TICK_MS);
    });
  }
});
