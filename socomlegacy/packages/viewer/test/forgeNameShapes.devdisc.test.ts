// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import { parseAnimSets, parseSceneGraph } from '@s2u/scene';
import { readMapMeta } from '../src/mapMeta';
import { sceneProgramsOf } from '../src/sceneHealth';
import { isForgeScriptValve } from '../src/worldState';

/**
 * FC2-6 item 3 (ours; the room hunk's review, 2026-11-13; product track, a browser adaptation -- FG.R2, MISSION OT.R112):
 * the contributor's Forge code takes two NAME SHAPES as its own, safe for the disc's maps only if no disc map uses them:
 * - a valve `forge_switch_<N>_valve` or starting `forge_flag_` (`../src/worldState` `isForgeScriptValve`: a Forge
 *   switch's own valve or a script's flag, whose set is presented even where a disc valve's is not);
 * - a node reference holding a `/` (`../src/sceneHealth` `placeRefs`, FORGE_PATH_REF_ADAPTATION: read as a placed PATH,
 *   where a disc reference is a node's NAME looked up among the placements).
 * Over every map archive of the disc the repository's readers open (`RUN/*.ZDB` holding `MZANIM.ZAR` and its
 * `<stem>_GEO.ZED`): every valve the map names -- its actions' (`actions.rdr`'s `valve`, `readMapMeta`) and every one its
 * programs test, set or execute by -- matches neither Forge shape, and no program's node reference (`placeRefs`' `names`:
 * `sceneProgramsOf(...).program.nodes`, what every caller passes it) holds a `/`. A failure names the map and the name.
 * The maps are no fixtures: this file reads `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS without them -- a
 * skip is said, never a pass. Written without a run (the host short of memory): its first run is owed on a runner with
 * the disc, expected green.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/ absent -- skipped (the maps are no fixtures)';

/** The one TOC entry whose path ends with `suffix` (as `zdbMember` finds it), else false. */
const holds = (toc: readonly ZdbEntry[], suffix: string): boolean => toc.some((e) => e.name.toUpperCase().endsWith(suffix.toUpperCase()));

/** Every valve name `o` (a decoded program's sequences) holds: a `valve` field at any depth, an `EXECUTE_ACTION`'s action. */
function valvesIn(o: unknown, out: Set<string>): void {
  if (Array.isArray(o)) { for (const v of o) valvesIn(v, out); return; }
  if (!o || typeof o !== 'object') return;
  const r = o as Record<string, unknown>;
  if (typeof r['valve'] === 'string') out.add(r['valve']);
  if (r['op'] === 'executeAction' && typeof r['anim'] === 'string') out.add(r['anim']);
  for (const v of Object.values(r)) if (v && typeof v === 'object') valvesIn(v, out);
}

/** A Forge valve shape, as written or lower-cased (a disc valve may be compared without case elsewhere). */
const forgeShaped = (name: string): boolean => isForgeScriptValve(name) || isForgeScriptValve(name.toLowerCase());

describe.skipIf(!DISC)(`no disc map uses the Forge's own name shapes (dev-disc)${SKIP}`, () => {
  it('every map: no valve named forge_switch_<N>_valve or forge_flag_..., no program node reference holding a /', () => {
    const run = join(DISC!, 'RUN');
    const files = readdirSync(run).filter((n) => /\.ZDB$/i.test(n)).sort();
    const read: string[] = [], passed: string[] = [];
    const valveHits: string[] = [], pathHits: string[] = [];
    for (const file of files) {
      const stem = file.replace(/\.ZDB$/i, '');
      const bytes = new Uint8Array(readFileSync(join(run, file)));
      const toc = parseZdb(bytes);
      if (!holds(toc, 'MZANIM.ZAR') || !holds(toc, `${stem}_GEO.ZED`)) { passed.push(file); continue; }
      const anims = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
      const meta = readMapMeta(bytes, toc, stem, parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`))), anims);
      const valves = new Set(meta.actions.map((a) => a.valve));
      for (const sp of sceneProgramsOf(anims)) {
        valvesIn(sp.program.sequences, valves);
        for (const name of sp.program.nodes) if (name.includes('/')) pathHits.push(`${stem}: program ${sp.program.name}'s node reference ${name}`);
      }
      for (const v of valves) if (forgeShaped(v)) valveHits.push(`${stem}: valve ${v}`);
      read.push(stem);
    }
    console.info(`forgeNameShapes: ${read.length} map(s) read (${read.join(', ')}); ${passed.length} other archive(s) passed over (${passed.join(', ')})`);
    expect(read.length, 'at least one map read off the disc').toBeGreaterThan(0);
    expect(valveHits, "a disc valve in a Forge shape (worldState's isForgeScriptValve)").toEqual([]);
    expect(pathHits, "a disc node reference placeRefs reads as a path (sceneHealth's FORGE_PATH_REF_ADAPTATION)").toEqual([]);
  }, 600_000);
});
