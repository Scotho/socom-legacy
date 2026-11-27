/**
 * WM-29 (report 107, "grenades through walls"): the blast-kill re-fly -- for each blast kill a recording of the PORT
 * holds (the wm-ffblast hub query v2's CSV: the kill, the victim's last feet and stance, the killer's throw whose fuse
 * ends at the kill), fly the throw again over the map's own collision with the room's own flight (`launchGrenade`,
 * `stepGrenade` over `gridCast`, a game frame at a time) to its burst, then ask TODAY's room test of the two blast lines
 * (`blastPoint`, `blastLine1` to `BLAST_LINE1_END_PLACEHOLDER`, `blastExposed` to `BLAST_HEAD_OVER_READING`, from the
 * room's `sightFrom` lift) whether the victim is reached.
 *
 * BLAST_REFLY_ADAPTATION: a measuring instrument of ours (no original; it changes nothing the game does). What it
 * says is about the PORT: a recorded death that today's code would refuse is "already fixed" (class ii); one today's
 * code still lands, with a solid face on a straight line between the burst and the body, is a case (class iii) -- of
 * the port, never a value of the original.
 *
 * Its limits, said in the output: the flight is re-run from the recorded launch (the room's own code at this tree,
 * not the recorded build's), the doors and destructibles as the map loads (not as they stood), and its burst is
 * checked against the kill: a burst more than the radius from the victim, or a fuse that does not end within 6 ticks
 * of the kill, is "not told". The victim's body is his last snapshot before the kill (up to 2 ticks old) and his
 * posture its stance code.
 *
 * Usage: `npx tsx tools/blast-refly.ts <query2.csv>` from `socomlegacy/`, with SOCOM_DISC (RUN/<map>.ZDB).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '../packages/archive/src/fsAssetSource';
import { loadSimMap } from '../packages/viewer/src/simMap';
import { BOUNCE_LIFT, gridCast, HE, launchGrenade, M67, stepGrenade, segmentHits, type ThrowableRecord } from '@s2u/scene';
import { roundAdmits } from '../packages/viewer/src/round';
import { GAME_FRAME_DT } from '../packages/scene/src/gameFrame';
import { BLAST_HEAD_OVER_READING, BLAST_LINE1_END_PLACEHOLDER, blastExposed, blastLine1, blastPoint } from '../packages/viewer/src/net/blast';

export const BLAST_REFLY_ADAPTATION = 'BLAST_REFLY_ADAPTATION: a measuring instrument over recordings of the port; no original';

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const RECORDS: Record<string, ThrowableRecord> = { M67, HE };
const TICK_HZ = 60;

/** The room's `sightFrom` (`match/src/room.ts`, module-private): `IMPACT_SIGHT_READING` = BOUNCE_LIFT toward the end. */
function sightFrom(point: V3, end: V3): V3 {
  const d: V3 = [end[0] - point[0], end[1] - point[1], end[2] - point[2]], l = Math.hypot(...d);
  if (!(l > BOUNCE_LIFT)) return point;
  const k = BOUNCE_LIFT / l;
  return [point[0] + d[0] * k, point[1] + d[1] * k, point[2] + d[2] * k];
}

const disc = process.env.SOCOM_DISC;
if (!disc) { console.error('SOCOM_DISC is not set'); process.exit(2); }
const rows = readFileSync(process.argv[2]!, 'utf8').trim().split(/\r?\n/);
const head = rows.shift()!.split(',');
const col = (r: string[], k: string): string => r[head.indexOf(k)]!;
const maps = new Map<string, Awaited<ReturnType<typeof loadSimMap>>>();
const counts = { ii: 0, iii: 0, open: 0, notTold: 0, placed: 0 };
console.log('file,map,killTick,killer,victim,weapon,stance,burstX,burstY,burstZ,fuseEndVsKill,dist,line1,line2,straightFaces,class');
for (const line of rows) {
  const r = line.split(',');
  const weapon = col(r, 'weapon'), rec = RECORDS[weapon];
  const out = [col(r, 'file'), col(r, 'map'), col(r, 'killTick'), col(r, 'killer'), col(r, 'victim'), weapon, col(r, 'victimStance')];
  if (!rec) { counts.placed++; console.log([...out, '-', '-', '-', '-', '-', '-', '-', '-', 'placed or other: not re-flown'].join(',')); continue; }
  if (col(r, 'throwTick') === '-' || col(r, 'victimX') === '-') { counts.notTold++; console.log([...out, '-', '-', '-', '-', '-', '-', '-', '-', 'not told: no throw or no body'].join(',')); continue; }
  const stem = col(r, 'map');
  if (!maps.has(stem)) maps.set(stem, await loadSimMap(new FsAssetSource(disc), `RUN/${stem}.ZDB`));
  const map = maps.get(stem)!, def = map.defaultMaterial ?? '';
  const num = (k: string): number => Number(col(r, k));
  const g = launchGrenade([num('fromX'), num('fromY'), num('fromZ')], [num('velX'), num('velY'), num('velZ')], rec);
  const cast = gridCast(map.grid, def);
  let burst: V3 | null = null, frames = 0;
  for (; frames < 2000 && !burst; frames++) {
    for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) if (e.kind === 'explode') burst = [e.point[0], e.point[1], e.point[2]];
    if (g.state === 'removed') break;
  }
  const feet: V3 = [num('victimX'), num('victimY'), num('victimZ')];
  const stance = (col(r, 'victimStance') as Stance);
  if (!burst) { counts.notTold++; console.log([...out, '-', '-', '-', '-', '-', '-', '-', '-', 'not told: no burst'].join(',')); continue; }
  const fuseEnd = Math.round(frames * GAME_FRAME_DT * TICK_HZ) - num('gap');
  const dist = Math.hypot(feet[0] - burst[0], feet[1] - burst[1], feet[2] - burst[2]);
  const lifted = blastPoint(burst);
  const end1: V3 = [feet[0], feet[1] + BLAST_LINE1_END_PLACEHOLDER[stance], feet[2]];
  const headPt: V3 = [feet[0], feet[1] + BLAST_HEAD_OVER_READING[stance], feet[2]];
  const l1 = blastLine1(map.grid, sightFrom(lifted, end1), end1, rec.explosionRadius, def);
  const l2 = blastExposed(map.grid, sightFrom(lifted, headPt), headPt, def);
  // Any admitted face, either side, on the straight line burst -> body middle: "something between".
  const mid: V3 = [feet[0], feet[1] + BLAST_LINE1_END_PLACEHOLDER[stance], feet[2]];
  const faces = segmentHits(map.grid, lifted, mid, roundAdmits, undefined, false).length;
  let cls: string;
  if (dist >= rec.explosionRadius || Math.abs(fuseEnd) > 6) { cls = 'not told: the re-flight does not meet the kill'; counts.notTold++; }
  else if (!(l1 && l2)) { cls = 'ii: today refuses'; counts.ii++; }
  else if (faces > 0) { cls = 'iii: today lands through a face'; counts.iii++; }
  else { cls = 'open: nothing between'; counts.open++; }
  console.log([...out, burst.map((v) => v.toFixed(1)).join(','), fuseEnd, dist.toFixed(1), l1, l2, faces, cls].join(','));
}
console.log(`# ${BLAST_REFLY_ADAPTATION}`);
console.log(`# counts ${JSON.stringify(counts)} (disc ${join(disc, 'RUN')} as present; this tree's flight, not the recorded build's)`);
