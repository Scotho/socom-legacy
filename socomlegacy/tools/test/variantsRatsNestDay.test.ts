// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../../packages/viewer/src/loadMap';
import { propsKey, worldKey } from '../../packages/viewer/src/variants/key';
import { buildDayVariant, DAY_STEMS } from '../variants/buildAbandonedDay';
import { RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER as SKY } from '../../packages/viewer/src/variants/ratsNestDay';

/**
 * DAY-RN1 B2 (product track: a tool, DAY.R1): Rat's Nest (Day), MP8, by Abandoned (Day)'s builder, on the dev disc.
 * SOCOM II's MP8 from `SOCOM_DISC` (a fresh `loadMap`, no `LoadMapOptions`); SOCOM (USA)'s MP8 from `SOCOM1_MP8_DIR`,
 * the study's package (`tools/variants/README.md`). Skipped -- and said so -- without either. Its output stays outside
 * the repository: the owner has not named MP8-day's data (H490/H491 name MP5-day's only).
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const S1 = process.env.SOCOM1_MP8_DIR ? resolve(process.env.SOCOM1_MP8_DIR) : '';
const FILES = Object.keys(DAY_STEMS.MP8.inputs);
const MISSING = [
  ...(DISC && existsSync(join(DISC, 'RUN', 'MP8.ZDB')) ? [] : ['SOCOM_DISC (RUN/MP8.ZDB)']),
  ...(DISC && existsSync(join(DISC, SKY.map)) ? [] : [`SOCOM_DISC (${SKY.map}, the sky swap's)`]),
  ...(S1 && FILES.every((f) => existsSync(join(S1, f))) ? [] : ['SOCOM1_MP8_DIR (the study\'s MP8 package)']),
];
const READY = MISSING.length === 0;
const WHY = READY ? '' : ` -- skipped: no ${MISSING.join(', no ')}`;

/** Every output file's bytes, hashed in path order; provenance.json is left out (it carries the run's date). */
function outputHash(dir: string): { hash: string; files: string[] } {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p); else files.push(relative(dir, p).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  const h = createHash('sha256');
  for (const f of files.filter((f) => f !== 'provenance.json')) { h.update(f); h.update('\0'); h.update(readFileSync(join(dir, f))); }
  return { hash: h.digest('hex'), files };
}

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe.skipIf(!READY)(`DAY-RN1 B2: the Rat's Nest (Day) pack keyed to the LoadedMap world${WHY}`, () => {
  it('keys the fresh MP8 load, covers every vertex by rule, takes SOCOM 1\'s sky and settings, and builds the same bytes twice', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP8.ZDB');
    const key = worldKey(map);
    const pk = propsKey(map);
    const outA = mkdtempSync(join(tmpdir(), 'day-rn1-a-'));
    const outB = mkdtempSync(join(tmpdir(), 'day-rn1-b-'));
    dirs.push(outA, outB);
    const skyMap = await loadMap(new FsAssetSource(DISC), SKY.map);
    const a = await buildDayVariant('MP8', { disc: DISC, s1Dir: S1, out: outA, map, skyMap });
    await buildDayVariant('MP8', { disc: DISC, s1Dir: S1, out: outB });

    for (const out of [outA, outB]) {
      expect(JSON.parse(readFileSync(join(out, 'key.json'), 'utf8'))).toEqual(key);
      expect(JSON.parse(readFileSync(join(out, 'props-key.json'), 'utf8'))).toEqual(pk);
      const pack = readFileSync(join(out, 'pack.rgb8'));
      expect([pack.subarray(0, 4).toString('latin1'), pack.readUInt32LE(4), pack.length]).toEqual(['S2UV', key.vertices, 8 + 3 * key.vertices]);
      const props = readFileSync(join(out, 'props.rgb8'));
      expect([props.subarray(0, 4).toString('latin1'), props.readUInt32LE(4), props.length]).toEqual(['S2UV', pk.vertices, 8 + 3 * pk.vertices]);
    }
    const coverage = JSON.parse(readFileSync(join(outA, 'coverage.json'), 'utf8'));
    expect(coverage.exact.count + coverage.nearest.count + coverage.graded.count + coverage.sky.count).toBe(key.vertices);
    expect(coverage.s1SkyVerticesLeftOut).toBe(0); // SOCOM 1's MP8 world holds no sky part: its dome is a prop

    // the sky: SOCOM II's gen_cloudy_blue_sky.tif parts take SOCOM 1's `sky` prop colour on most of its vertices (1.0)
    expect(coverage.sky.colour).toEqual([1, 1, 1]);
    const skyN = map.world.filter((p) => p.textureName === 'gen_cloudy_blue_sky.tif').reduce((n, p) => n + p.positions.length / 3, 0);
    expect(skyN).toBeGreaterThan(0);
    expect(coverage.sky.count).toBe(skyN);
    const packA = readFileSync(join(outA, 'pack.rgb8')).subarray(8);
    let v = 0;
    for (const part of map.world) {
      const n = part.positions.length / 3;
      if (part.textureName === 'gen_cloudy_blue_sky.tif') for (let j = 0; j < n * 3; j++) expect(packA[(v * 3) + j]).toBe(128);
      v += n;
    }
    expect(coverage.props.matched.count + coverage.props.graded.count + coverage.props.own.count).toBe(pk.vertices);

    // SOCOM 1's MP8 as its JSON holds it: a lit map (night off) with a near-black fog from 500 to 599
    const settings = JSON.parse(readFileSync(join(outA, 'settings.json'), 'utf8'));
    expect(settings.mapName.value).toBe("SOCOM (USA): RAT'S NEST");
    expect(settings.nightMission.value).toBe(false);
    expect(settings.fogColor.source).toMatch(/s1-MP8\.json/);
    expect([settings.fogColor.value, settings.fogNear.value, settings.fogFar.value]).toEqual([[17, 18, 23], 500, 599]);

    // the textures SOCOM II's MP8 also has with other pixels, and SOCOM 1's sky prop's own
    const tex = JSON.parse(readFileSync(join(outA, 'textures.json'), 'utf8')) as { name: string; why: string }[];
    expect(tex.filter((t) => t.why.startsWith('changed')).map((t) => t.name)).toEqual(['cratewood1.tif', 'ground.tif', 'rockwall2.tif']);
    expect(tex.filter((t) => t.why.startsWith('SOCOM 1 only')).map((t) => t.name)).toEqual(['gen_cloud_n_sun_256x256.tif', 'gen_sky_base.tif', 'gen_sky_top.tif']);

    // the sky swap (a browser adaptation; the owner's pick, MP2's cuba1a_sky01.tif, MISSION OT.R158): SOCOM II's dome
    // texture name now carries the chosen map's sky texture, its pixels as the repository's reader decodes them, at its
    // native size
    const src = skyMap.textures[SKY.texture]!;
    expect(src).toBeDefined();
    const row = tex.filter((t) => t.why.startsWith('sky swap')) as unknown as { name: string; width: number; height: number; bytes: number; why: string }[];
    expect(row.map((t) => t.name)).toEqual([SKY.as]);
    expect([row[0]!.width, row[0]!.height, row[0]!.bytes]).toEqual([src.width, src.height, src.data.length]);
    expect(row[0]!.why).toContain(`${SKY.map} ${SKY.texture}`);
    expect(tex.length).toBe(7);
    for (const out of [outA, outB]) {
      const f = readFileSync(join(out, 'textures', `${SKY.as}.rgba`));
      expect([f.subarray(0, 4).toString('latin1'), f.readUInt32LE(4), f.readUInt32LE(8), f.length]).toEqual(['S2UV', src.width, src.height, 12 + src.width * src.height * 4]);
      expect(Buffer.compare(f.subarray(12), Buffer.from(src.data.buffer, src.data.byteOffset, src.data.byteLength))).toBe(0);
    }

    const prov = JSON.parse(readFileSync(join(outA, 'provenance.json'), 'utf8'));
    expect(prov.socom2.file).toBe('RUN/MP8.ZDB');
    expect(prov.socom1.dir).toBe('SOCOM1_MP8_DIR');
    expect(Object.keys(prov.socom1.files)).toEqual(FILES);
    expect(prov.skySwap).toMatchObject({ file: SKY.map, texture: SKY.texture, as: SKY.as });
    expect(prov.skySwap.sha256).toMatch(/^[0-9a-f]{64}$/);

    const ha = outputHash(outA), hb = outputHash(outB);
    expect(ha.files).toEqual(hb.files);
    expect(ha.hash).toBe(hb.hash);

    console.log(`DAY-RN1 B2: ${key.vertices} vertices, key ${key.fnv64}; ${JSON.stringify(a.coverage)}; outputs ${ha.files.length} files, ${ha.hash.slice(0, 16)}; ${JSON.stringify({ s1Vertices: coverage.s1Vertices, normals: coverage.normals, grade: coverage.grade, settings })}`);
  }, 600_000);
});
