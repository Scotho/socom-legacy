// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, parseSceneGraph, type EffectProgram } from '@s2u/scene';
import { readMapMeta } from '../src/mapMeta';
import { holdsAtCamera } from '../src/worldState';

/**
 * LATER 951 (research 436 s3): every disc map's `OBJECT_TRANSLATE_STATE` held at the camera, read through the
 * repository's readers -- the census the row names (13 multiplayer, 8 campaign maps), and the placements the loader
 * draws apart so the view can carry them (`MapMeta.motion.translated`). The maps are no fixtures: this file reads
 * `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS without them -- a skip is said, never a pass.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP6.ZDB')) && existsSync(join(d, 'RUN/M72.ZDB')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP6 and M72 absent -- skipped (no fixtures)';

type Row = { stem: string; program: string; node: string; flags: number; xyz: readonly number[] };

function census(): Row[] {
  const out: Row[] = [];
  const stems = readdirSync(join(DISC!, 'RUN')).filter((f) => /^M(P)?\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort();
  for (const stem of stems) {
    const b = new Uint8Array(readFileSync(join(DISC!, `RUN/${stem}.ZDB`)));
    const toc = parseZdb(b);
    // The table names members by their disc path (`RUN\MP\MP6\MZANIM.ZAR`); `zdbMember` takes the suffix.
    if (!toc.some((e) => /(^|[\\/])MZANIM\.ZAR$/i.test(e.name))) continue;
    for (const s of parseAnimSets(Zar.parse(zdbMember(b, toc, 'MZANIM.ZAR'))).sets) for (const a of s.anims) {
      let p: EffectProgram;
      try { p = decodeEffectProgram(a); } catch { continue; }
      for (const q of p.sequences) for (const o of q.ops) {
        if (o.op === 'translate' && holdsAtCamera(o, p)) out.push({ stem, program: p.name, node: p.nodes[o.node]!.toLowerCase(), flags: o.flags, xyz: o.xyz });
      }
    }
  }
  return out;
}

function translated(stem: string): string[] {
  const b = new Uint8Array(readFileSync(join(DISC!, `RUN/${stem}.ZDB`)));
  const toc = parseZdb(b);
  return readMapMeta(b, toc, stem, parseSceneGraph(Zar.parse(zdbMember(b, toc, `${stem}_GEO.ZED`)))).motion?.translated ?? [];
}

describe.skipIf(!DISC)(`LATER 951: the skies held at the camera, on the disc${SKIP}`, () => {
  it('26 commands on 13 multiplayer and 8 campaign maps; looped autostarts; none with flag 2; two with a vector', () => {
    const rows = census();
    expect(rows.length).toBe(26);
    const maps = [...new Set(rows.map((r) => r.stem))].sort();
    expect(maps).toEqual(['M51', 'M52', 'M53', 'M62', 'M63', 'M71', 'M72', 'M81',
      'MP12', 'MP51', 'MP52', 'MP53', 'MP6', 'MP71', 'MP72', 'MP73', 'MP8', 'MP81', 'MP82', 'MP83', 'MP9']);
    expect(rows.filter((r) => (r.flags & 2) !== 0)).toEqual([]);
    expect(rows.filter((r) => (r.flags & 1) !== 0).map((r) => [r.stem, r.node, [...r.xyz]])).toEqual([
      ['M72', 'sky_m72', [0, 550, 0]], ['MP81', 'skyplane', [0, -220, 0]],
    ]);
    // Y kept (flag 0x10) -- the row's list, and M62's horizon, MP73's flashes, M71's moon, MP53's sun, MP72's dust.
    expect([...new Set(rows.filter((r) => (r.flags & 0x10) !== 0).map((r) => r.stem))].sort()).toEqual(['M62', 'M71', 'M81', 'MP12', 'MP53', 'MP72', 'MP73', 'MP8', 'MP9']);
    expect(rows.every((r) => (r.flags & ~0x11) === 0)).toBe(true);
  });

  it('the meta lists each map\'s drawn placements of those nodes: a world chunk (MP6) and a prop (M72) alike', () => {
    expect(translated('MP6')).toContain('worldmodel/mp6_skydome');
    expect(translated('MP8').sort()).toEqual(['worldmodel/skydome', 'worldmodel/stars']);
    expect(translated('M72').some((p) => p.startsWith('worldmodel/sky_m72'))).toBe(true);
    expect(translated('MP2')).toEqual([]);   // Frostfire: no program holds a node at the camera
  });
});
