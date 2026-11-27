// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseWorldRoot } from '@s2u/scene';
import { materialsFromArchive } from '@s2u/sound';
import { groundPolygons } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { defaultMaterialIndex } from '../src/soundData';

/**
 * Every map's `DefaultMaterial` through the readers `soundFromDisc` uses (`parseWorldRoot` on `<archive>.ZED`, the
 * SOILS of `RUN/READERC.ZAR` materials.rdr), resolved by `defaultMaterialIndex` -- case-sensitive, as the game's soil
 * lookup (r0001 `FUN_002de9e0` D:L181709-181726; r0004 `FUN_002fb9d0`). The table below is every map with a world
 * root: name, the old case-free index, the exact index. Only Shadow Falls (MP64, `stone`) differs: its byte-0 floors
 * are `UNKNOWN`, silent (`FUN_005a39b0` D:L460419; ATLAS L202). Reading, pending review. The dev disc (`SOCOM_DISC`
 * or `<SOCOM_PC_ROOT>/game/disc`); skipped, and said, without it.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const HAVE = !!RUN && existsSync(join(RUN, 'READERC.ZAR'));
const MAX_SLOPE_NY = 0.6428;                                     // `max_slope` 50 degrees: a walkable floor

/** map -> [DefaultMaterial as written, index matched without case (the old rule), index matched exactly]. */
const TABLE: Record<string, [string, number, number]> = {
  M51: ['DIRT', 8, 8], M52: ['STONE', 7, 7], M53: ['DIRT', 8, 8],
  M61: ['STONE', 7, 7], M62: ['GRASS', 4, 4], M63: ['ASPHALT', 22, 22],
  M71: ['STONE', 7, 7], M72: ['STONE', 7, 7], M73: ['STONE', 7, 7],
  M81: ['SNOW', 17, 17], M82: ['SNOW', 17, 17], M83: ['METAL_THICK', 25, 25],
  MP1: ['SNOW', 17, 17], MP2: ['METAL_THICK', 25, 25], MP5: ['GRASS', 4, 4], MP6: ['SAND', 5, 5],
  MP7: ['SAND', 5, 5], MP8: ['DIRT', 8, 8], MP9: ['GRASS', 4, 4], MP10: ['GRASS', 4, 4],
  MP11: ['none', 0, 0], MP12: ['STONE', 7, 7],
  MP51: ['STONE', 7, 7], MP52: ['WOOD_THICK', 19, 19], MP53: ['STONE', 7, 7],
  MP61: ['STONE', 7, 7], MP62: ['GRASS', 4, 4], MP64: ['stone', 7, 0],
  MP71: ['STONE', 7, 7], MP72: ['ASPHALT', 22, 22], MP73: ['SAND', 5, 5],
  MP81: ['METAL_THICK', 25, 25], MP82: ['SNOW', 17, 17], MP83: ['SNOW', 17, 17],
};

describe.skipIf(!HAVE)(`every map's DefaultMaterial, matched exactly${HAVE ? '' : ' (no dev disc -- skipped)'}`, () => {
  it('the exact match changes only MP64 (stone -> UNKNOWN); every map\'s name and index as the table', async () => {
    const source = new FsAssetSource(DISC);
    const materials = materialsFromArchive(new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))));
    const maps = readdirSync(RUN).filter((f) => /^MP?\d+\.ZDB$/i.test(f)).sort();
    const got: Record<string, [string, number, number]> = {};
    for (const file of maps) {
      const archive = file.replace(/\.ZDB$/i, '').toUpperCase();
      let name: string;
      try { name = parseWorldRoot(Zar.parse(await readZdbMember(source, `RUN/${file}`, `${archive}.ZED`))).defaultMaterial; } catch { continue; }
      const loose = Math.max(0, materials.findIndex((m) => m.name.toUpperCase() === name.toUpperCase()));
      got[archive] = [name, loose > 0 ? loose : 0, defaultMaterialIndex(materials, name)];
    }
    console.log(Object.entries(got).map(([k, v]) => `${k} | ${v[0]} | ${v[1]} -> ${v[2]}`).join('\n'));
    expect(got).toEqual(TABLE);
    const changed = Object.entries(got).filter(([, v]) => v[1] !== v[2]).map(([k]) => k);
    expect(changed).toEqual(['MP64']);
    expect(got.MP64![2]).toBe(0);
    expect(got.MP5![2]).toBe(got.MP5![1]);
    expect(got.MP11).toEqual(['none', 0, 0]);
  }, 600_000);

  it('MP64\'s walkable floors with material byte 0 (the faces the exact match silences)', () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(join(RUN, 'MP64.ZDB'))), 'RUN/MP64.ZDB');
    let zero = 0;
    for (const p of groundPolygons(map.ground)) {
      if (p.material !== 0) continue;
      const pts = p.points;
      const ax = pts[3]! - pts[0]!, ay = pts[4]! - pts[1]!, az = pts[5]! - pts[2]!;
      const bx = pts[6]! - pts[0]!, by = pts[7]! - pts[1]!, bz = pts[8]! - pts[2]!;
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, n = Math.hypot(nx, ny, nz);
      if (n > 0 && Math.abs(ny / n) >= MAX_SLOPE_NY) zero++;
    }
    console.log(`MP64 walkable byte-0 polygons: ${zero}`);
    expect(zero).toBe(9);                                        // ATLAS L202: 9 faces on 7 surfaces
  }, 600_000);
});
