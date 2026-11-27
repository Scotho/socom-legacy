import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { loadSimMap } from '../src/simMap';
import { probeLiftOf, Walker } from '../src/mover';

/**
 * L208's sweep (atlas-parity's check of e20dd22f29, finding 1): every start and respawn record on every map, spawned as the
 * room spawns (`match/src/room.ts` `spawn`: the record's CELL y lifted a unit, `SPAWN_LIFT`, facing `-step x 45`), once by the old
 * `place` (a pick at the seed column from the feet + the standing lift) and once by `seed` (L208), each then still for
 * REST_TICKS. A row for each record whose rest differs by more than MOVE_EPS. Runs with SPAWN_SEED_SWEEP (1, or a path for
 * the TSV) and the dev disc; the moves the sweep finds are pinned one by one in spawn181Disc / probeOrigin with a reason.
 */
const DISC = process.env.SOCOM_DISC ?? '';
const OUT = process.env.SPAWN_SEED_SWEEP ?? '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const REST_TICKS = 120;
const MOVE_EPS = 0.01;
/**
 * Every record the sweep finds moving, with WHY (seat-kill's per-row read, pilot/kill/keyjob-l208-small-rows.md, and the
 * two big rows' read; readings, pending review). The test fails on a moved record not listed here, or a listed one that
 * no longer moves. 'putout-*': the first frame's wall put-out run from the SEED's height (r0004's order, L208) where place
 * ran it from the picked floor's; a body seeded at place's floor height rests where place does (0.0000), so the height
 * accounts for it whole; the line whose end is deepest named. 'slide-phase': no line hits at the seed; the record stands on
 * a steep floor (MP11 land_52, n.y 0.591-0.593, under MAX_SLOPE_COS) and the body slides downhill in both runs; the seed
 * starts the slide three ticks later (the held first frame), on the other phase of the port's two-tick game frame
 * (THROTTLE-FRAME, a browser adaptation), so NEITHER rest is the original's -- place with its tick count poked +1 or +3
 * lands on the seed's to 0.0000. 'fix': the L208 record. 'cell-seed-held' (MP8 0/326; seat-kill's read,
 * kill/keyjob-l208-mp8-mp64-read.md): the record's CELL y is 18.096 where placeSpawnSlots' pick fell back to a near-vertical
 * face at 102.862; seeded at 19.096 no line hits and the pick is null, so the miss branch holds the body at the seed
 * (r0004 0x5b63d0-0x5b6468) -- place's 19.58 rest was near it by accident, the floor-seed's 109.75 had no support; a capture
 * proves it (a walking player there may be stuck; LATER 1419). 'putout-centre-side' (MP64 1/95): the centre line at depth 1.038 and a
 * side line at 4.489 on jungletree_skinny, put out 3.489 along (0.878, -0.479) onto walkable_terrain_2490 -- the read's
 * answer to 0.008 (close-run: the side line's r0004 construction unread).
 */
const KNOWN: Record<string, string> = {
  'MP64 respawn 0/181': 'fix',
  'MP8 respawn 0/326': 'cell-seed-held',
  'MP64 respawn 1/95': 'putout-centre-side',
  'MP64 respawn 0/129': 'putout-head',
  'MP51 respawn 1/135': 'putout-side',
  'MP64 respawn 1/210': 'putout-side',
  'MP8 respawn 0/194': 'putout-side',
  'MP8 respawn 1/218': 'putout-side',
  'MP8 respawn 1/261': 'putout-centre',
  'MP11 start 0/14': 'slide-phase',
  'MP11 start 0/23': 'slide-phase',
  'MP11 respawn 0/14': 'slide-phase',
  'MP11 respawn 0/15': 'slide-phase',
};
/** Each named record's seeded rest (the second delta review's F5: the keys alone let a named record move elsewhere). */
const SEED_REST: Record<string, readonly [number, number, number]> = {
  'MP11 start 0/14': [836.428, 115.614, 1600.205],
  'MP11 start 0/23': [897.409, 137.961, 1590.945],
  'MP11 respawn 0/14': [833.879, 114.688, 1600.189],
  'MP11 respawn 0/15': [899.513, 138.737, 1589.986],
  'MP51 respawn 1/135': [659.584, 83.014, 374.809],
  'MP64 respawn 0/129': [1617.531, 9.321, 1766.807],
  'MP64 respawn 0/181': [1387.825, 9.321, 2436.290],
  'MP64 respawn 1/95': [659.269, 61.030, 413.234],
  'MP64 respawn 1/210': [674.631, 27.336, 593.716],
  'MP8 respawn 0/194': [1225.030, 57.289, 444.694],
  'MP8 respawn 0/326': [1065.848, 19.096, 484.239],
  'MP8 respawn 1/218': [494.361, 109.809, 1352.986],
  'MP8 respawn 1/261': [393.623, 122.081, 726.519],
};
const REST_EPS = 0.01;
const wrapYaw = (y: number): number => ((((y + 180) % 360) + 360) % 360) - 180;
const STILL = { forward: 0, right: 0, boost: false };

describe.skipIf(!OUT || !RUN || !existsSync(RUN))(`L208: place vs seed over every spawn record${OUT && RUN ? '' : ' (SPAWN_SEED_SWEEP and SOCOM_DISC: skipped)'}`, () => {
  it('lists every record whose rest moves', async () => {
    const stems = readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$|^M\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort();
    const rows = ['map\tkind\tside\tindex\tyaw\tplaceX\tplaceY\tplaceZ\tseedX\tseedY\tseedZ\tacross\tdy'];
    let records = 0;
    const moved: string[] = [], failed: string[] = [], off: string[] = [];
    for (const stem of stems) {
      let map;
      try { map = await loadSimMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`); } catch (e) { failed.push(`${stem}: ${String(e).slice(0, 80)}`); continue; }
      for (const [kind, list] of [['start', map.slots], ['respawn', map.respawns]] as const) {
        for (const r of list) {
          records++;
          const yaw = wrapYaw(-((r as unknown as { step?: number }).step ?? 0) * 45);
          // place: the old spawn (the slot's floor y + 1, picked from there + the standing lift); seed: Room.spawn's (the CELL
          // y + 1, `SpawnSlot.cellY`, else the slot's y + 1).
          const [x, y, z] = [r.position[0], r.position[1] + 1, r.position[2]], seedY = (r.cellY ?? r.position[1]) + 1;
          const a = new Walker(map.grid), b = new Walker(map.grid);
          const okA = a.place(x, y + probeLiftOf('stand'), z), okB = b.seed(x, seedY, z);
          a.state.yaw = yaw; b.state.yaw = yaw;
          for (let i = 0; i < REST_TICKS; i++) { if (okA) a.tick(STILL); if (okB) b.tick(STILL); }
          const across = Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z), dy = b.state.y - a.state.y;
          if (okA !== okB || across > MOVE_EPS || Math.abs(dy) > MOVE_EPS) {
            const key = `${stem} ${kind} ${r.side}/${r.index}`;
            moved.push(key);
            const want = SEED_REST[key];
            if (want && Math.hypot(b.state.x - want[0], b.state.y - want[1], b.state.z - want[2]) > REST_EPS) off.push(`${key}: (${b.state.x.toFixed(3)}, ${b.state.y.toFixed(3)}, ${b.state.z.toFixed(3)})`);
            rows.push([stem, kind, r.side, r.index, yaw, a.state.x, a.state.y, a.state.z, b.state.x, b.state.y, b.state.z, across, dy]
              .map((v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v))).join('\t') + (okA !== okB ? `\trefused ${okA ? 'seed' : 'place'}` : ''));
          }
        }
      }
    }
    const tsv = rows.join('\n') + '\n';
    if (OUT !== '1') writeFileSync(OUT, tsv);
    console.log(`SPAWN-SEED-SWEEP records ${records} moved ${rows.length - 1}\n${tsv}`);
    expect(records).toBeGreaterThan(0);
    expect(failed, 'a map that failed to load').toEqual([]);
    expect(off, 'a named record resting elsewhere').toEqual([]);
    expect(moved.filter((k) => !(k in KNOWN)), 'a moved record with no reason named').toEqual([]);
    expect(Object.keys(KNOWN).filter((k) => !moved.includes(k)), 'a named record that no longer moves').toEqual([]);
  }, 3_600_000);
});
