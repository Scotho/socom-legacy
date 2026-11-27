/**
 * WM-29: one recorded blast kill's re-flown burst (BLAST_REFLY_ADAPTATION, `./blast-refly`), its two lines asked with
 * the room's start (`sightFrom`: BOUNCE_LIFT toward the end) and with the start at the lifted point itself, and the
 * re-flight's last frames (where the round came to rest). Usage: `npx tsx tools/blast-refly-start.ts <csv> <killTick>`.
 */
import { readFileSync } from 'node:fs';
import { FsAssetSource } from '../packages/archive/src/fsAssetSource';
import { loadSimMap } from '../packages/viewer/src/simMap';
import { BOUNCE_LIFT, gridCast, HE, launchGrenade, M67, stepGrenade, segmentHits, type ThrowableRecord } from '@s2u/scene';
import { roundAdmits } from '../packages/viewer/src/round';
import { GAME_FRAME_DT } from '../packages/scene/src/gameFrame';
import { BLAST_HEAD_OVER_READING, BLAST_LINE1_END_PLACEHOLDER, blastExposed, blastLine1, blastPoint } from '../packages/viewer/src/net/blast';

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const RECORDS: Record<string, ThrowableRecord> = { M67, HE };
const sight = (p: V3, e: V3, k0: number): V3 => {
  const d: V3 = [e[0] - p[0], e[1] - p[1], e[2] - p[2]], l = Math.hypot(...d);
  if (!(l > k0) || k0 === 0) return p;
  const k = k0 / l;
  return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
};
const rows = readFileSync(process.argv[2]!, 'utf8').trim().split(/\r?\n/);
const head = rows.shift()!.split(',');
for (const line of rows) {
  const r = line.split(','), col = (k: string): string => r[head.indexOf(k)]!, num = (k: string): number => Number(col(k));
  if (col('killTick') !== process.argv[3]) continue;
  const rec = RECORDS[col('weapon')]!;
  const map = await loadSimMap(new FsAssetSource(process.env.SOCOM_DISC!), `RUN/${col('map')}.ZDB`), def = map.defaultMaterial ?? '';
  const g = launchGrenade([num('fromX'), num('fromY'), num('fromZ')], [num('velX'), num('velY'), num('velZ')], rec);
  const cast = gridCast(map.grid, def);
  let burst: V3 | null = null;
  const trail: string[] = [];
  for (let i = 0; i < 2000 && !burst; i++) {
    for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) {
      if (e.kind === 'explode') burst = [e.point[0], e.point[1], e.point[2]];
      else if (e.kind === 'bounce' || e.kind === 'rest') trail.push(`${e.kind}@${i} (${e.point.map((v) => v.toFixed(2))})${'normal' in e ? ` n(${e.normal.map((v) => v.toFixed(2))})` : ''}`);
    }
  }
  console.log(`burst ${burst!.map((v) => v.toFixed(3))} state ${g.state}`);
  console.log(`contacts: ${trail.slice(-6).join('; ')}`);
  const feet: V3 = [num('victimX'), num('victimY'), num('victimZ')], stance = col('victimStance') as Stance;
  const lifted = blastPoint(burst!);
  const e1: V3 = [feet[0], feet[1] + BLAST_LINE1_END_PLACEHOLDER[stance], feet[2]], eh: V3 = [feet[0], feet[1] + BLAST_HEAD_OVER_READING[stance], feet[2]];
  for (const k of [BOUNCE_LIFT, 0, 0.01]) {
    const l1 = blastLine1(map.grid, sight(lifted, e1, k), e1, rec.explosionRadius, def), l2 = blastExposed(map.grid, sight(lifted, eh, k), eh, def);
    console.log(`start offset ${k}: line1 ${l1} line2 ${l2}`);
  }
  // The faces round the burst: every admitted face within 2 u of the lifted point along six axes.
  for (const ax of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3[]) {
    const b: V3 = [lifted[0] + ax[0] * 3, lifted[1] + ax[1] * 3, lifted[2] + ax[2] * 3];
    const hits = segmentHits(map.grid, lifted, b, roundAdmits, undefined, false).map((h) => `${h.poly.path}@${(h.t * 3).toFixed(3)}`);
    console.log(`axis ${ax}: ${hits.join(', ') || '-'}`);
  }
}
