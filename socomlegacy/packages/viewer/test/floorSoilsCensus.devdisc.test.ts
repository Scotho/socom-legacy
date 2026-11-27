// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember } from '@s2u/archive';
import { materialsFromArchive } from '@s2u/sound';
import { footStepOffset } from '../src/climb';
import { groundPolygons } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';

/**
 * FLE-2's condition 2 (the fall-leave-edge plan; LATER 1095; research 151 s9.1): which soil every map's FLOORS are, read
 * through the repository's readers -- the polygon's material byte indexes the soils table (`materials.rdr`'s SOILS after
 * the engine's two, `parseSoils`; `DAT_0044f358[m]`, `FUN_002dc1d0` D:L180305-180320), and byte 0 takes the map's
 * `DefaultMaterial` (`READERM.ZAR/<map>.rdr` `world_params`; `FUN_002ddc30` D:L181208). Asserted: the climb's table
 * (`footStepOffset`, the hull's 4 and 14-18 at -0.8) gives every non-zero byte on every map the disc's own
 * `FOOT_STEP_OFFSET`; MP12's five rig spots (l-fle2-soil, relay-1, PC 1, r0004, 2026-11-18: the settled altitude minus
 * the floor word -0.800 / -0.800 / 0 / 0 / 0) read those soils. Logged: per map, the floor bytes, their soils and
 * offsets, and byte 0's default soil (a default with an offset stands every byte-0 floor low -- FLE-2 must take it).
 * The dev disc (`SOCOM_DISC` or `<SOCOM_PC_ROOT>/game/disc`); skipped, and said, without it.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const HAVE = !!RUN && existsSync(join(RUN, 'READERC.ZAR'));
const MAX_SLOPE_NY = 0.6428;                                     // `max_slope` 50 degrees: a walkable floor

describe.skipIf(!HAVE)(`FLE-2 condition 2: every map's floor soils through our readers${HAVE ? '' : ' (no dev disc -- skipped)'}`, () => {
  it('the climb\'s offset table is the disc\'s for every floor byte on every map; byte 0 by each map\'s DefaultMaterial', () => {
    const soils = materialsFromArchive(new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))));
    const offOf = (m: number): number => soils[m]?.footStepOffset ?? 0;
    const maps = readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$|^M\d+\.ZDB$/i.test(f)).sort();
    expect(maps.length).toBeGreaterThan(10);
    const rows: string[] = [];
    for (const file of maps) {
      const bytes = new Uint8Array(readFileSync(join(RUN, file)));
      const map = simMapFromBytes(bytes, `RUN/${file}`);
      const seen = new Map<number, number>();
      for (const p of groundPolygons(map.ground)) {
        const pts = p.points;
        const ax = pts[3]! - pts[0]!, ay = pts[4]! - pts[1]!, az = pts[5]! - pts[2]!;
        const bx = pts[6]! - pts[0]!, by = pts[7]! - pts[1]!, bz = pts[8]! - pts[2]!;
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, n = Math.hypot(nx, ny, nz);
        if (!(n > 0) || Math.abs(ny / n) < MAX_SLOPE_NY) continue;
        seen.set(p.material, (seen.get(p.material) ?? 0) + 1);
      }
      let def = 0;
      try {
        const zar = Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR'));
        const stem = file.replace(/\.ZDB$/i, '').toLowerCase();
        const key = zar.root.children.find((k) => k.name.toLowerCase() === `${stem}.rdr`);
        const root = key ? parseRdr(zar.data(key)) : undefined;
        const top = Array.isArray(root) && Array.isArray(root[0]) ? root[0] : root;
        const name = top === undefined ? undefined : rdrGet(rdrGet(top, 'world_params') as never, 'DefaultMaterial');
        if (typeof name === 'string') def = Math.max(0, soils.findIndex((s) => s.name === name));
      } catch { /* no READERM: byte 0 stays UNKNOWN */ }
      for (const m of seen.keys()) if (m !== 0) expect(footStepOffset(m), `${file} byte ${m} (${soils[m]?.name})`).toBe(offOf(m));
      const list = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([m, k]) => `${m}:${soils[m === 0 ? def : m]?.name ?? '?'}${offOf(m === 0 ? def : m) ? `(${offOf(m === 0 ? def : m)})` : ''} x${k}`);
      rows.push(`${file} | default ${soils[def]?.name ?? 'UNKNOWN'}${offOf(def) ? ` (${offOf(def)})` : ''} | ${list.join(' ')}`);
    }
    console.log(['map | byte 0 default | floor bytes: soil (offset) x polygons', ...rows].join('\n'));
  }, 600_000);

  it('MP12\'s five rig spots stand on the soils whose offsets the rig measured (-0.8 / -0.8 / 0 / 0 / 0)', async () => {
    const { probeGround } = await import('@s2u/scene');
    const bytes = new Uint8Array(readFileSync(join(RUN, 'MP12.ZDB')));
    const map = simMapFromBytes(bytes, 'RUN/MP12.ZDB');
    const spots: [string, number, number, number][] = [['A', 699.8, 1785, -0.8], ['B', 560, 1200, -0.8], ['C', 460, 1080, 0], ['D', 900, 1900, 0], ['E', 699.8, 1810, 0]];
    for (const [name, x, z, want] of spots) {
      const hits = probeGround(map.grid, x, z) as { poly: { material: number } }[];
      expect(hits.length, name).toBeGreaterThan(0);
      expect(footStepOffset(hits[0]!.poly.material), `${name} byte ${hits[0]!.poly.material}`).toBe(want);
    }
  });
});
