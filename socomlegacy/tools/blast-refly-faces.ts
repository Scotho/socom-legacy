/**
 * WM-29: for chosen rows of the hub query v2's CSV, the faces on the straight line from the re-flown burst's lift to
 * the body's line-1 end and to its head, each with its owner path, material, PENETRATION, whether line 1 admits it
 * and which side the line meets (BLAST_REFLY_ADAPTATION, `./blast-refly`). Usage:
 * `npx tsx tools/blast-refly-faces.ts <query2.csv> <killTick> [<killTick> ...]` with SOCOM_DISC.
 */
import { readFileSync } from 'node:fs';
import { FsAssetSource } from '../packages/archive/src/fsAssetSource';
import { loadSimMap } from '../packages/viewer/src/simMap';
import { gridCast, HE, launchGrenade, M67, stepGrenade, segmentHits, surfaceMaterial, type ThrowableRecord } from '@s2u/scene';
import { roundAdmits } from '../packages/viewer/src/round';
import { GAME_FRAME_DT } from '../packages/scene/src/gameFrame';
import { BLAST_HEAD_OVER_READING, BLAST_LINE1_END_PLACEHOLDER, blastPoint } from '../packages/viewer/src/net/blast';

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const RECORDS: Record<string, ThrowableRecord> = { M67, HE };
const disc = process.env.SOCOM_DISC!;
const rows = readFileSync(process.argv[2]!, 'utf8').trim().split(/\r?\n/);
const head = rows.shift()!.split(',');
const want = new Set(process.argv.slice(3));
for (const line of rows) {
  const r = line.split(','), col = (k: string): string => r[head.indexOf(k)]!, num = (k: string): number => Number(col(k));
  if (!want.has(col('killTick'))) continue;
  const rec = RECORDS[col('weapon')]!;
  const map = await loadSimMap(new FsAssetSource(disc), `RUN/${col('map')}.ZDB`), def = map.defaultMaterial ?? '';
  const g = launchGrenade([num('fromX'), num('fromY'), num('fromZ')], [num('velX'), num('velY'), num('velZ')], rec);
  const cast = gridCast(map.grid, def);
  let burst: V3 | null = null;
  for (let i = 0; i < 2000 && !burst; i++) for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) if (e.kind === 'explode') burst = [e.point[0], e.point[1], e.point[2]];
  const feet: V3 = [num('victimX'), num('victimY'), num('victimZ')], stance = col('victimStance') as Stance;
  const lifted = blastPoint(burst!);
  console.log(`== ${col('map')} kill ${col('killTick')} killer ${col('killer')} victim ${col('victim')} ${col('weapon')} ${stance} burst ${burst!.map((v) => v.toFixed(1))} feet ${feet}`);
  for (const [label, h] of [['line1', BLAST_LINE1_END_PLACEHOLDER[stance]], ['head', BLAST_HEAD_OVER_READING[stance]]] as const) {
    const end: V3 = [feet[0], feet[1] + h, feet[2]];
    const d: V3 = [end[0] - lifted[0], end[1] - lifted[1], end[2] - lifted[2]];
    const fronts = new Set(segmentHits(map.grid, lifted, end, () => true, undefined, true).map((x) => x.poly));
    for (const hit of segmentHits(map.grid, lifted, end, () => true, undefined, false)) {
      const p = hit.poly;
      const n = hit.normal;
      const facing = fronts.has(p) ? 'front' : 'back';
      const m = surfaceMaterial(p.material, def);
      console.log(`  ${label} t=${hit.t.toFixed(3)} ${p.path} material=${m.name ?? p.material} pen=${m.penetration} admitted=${roundAdmits(hit.poly)} side=${facing} normal=${n.map((v) => v.toFixed(2))}`);
    }
  }
}
