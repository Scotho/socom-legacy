// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../../packages/viewer/src/loadMap';
import { propsKey, worldKey } from '../../packages/viewer/src/variants/key';
import { buildAbandonedDay, S1_INPUT_FILES } from '../variants/buildAbandonedDay';

/**
 * DAY-P1a (product track: a tool; its output is reviewed in DAY-P1b): the Abandoned (Day) builder, on the dev disc.
 * SOCOM II's MP5 from `SOCOM_DISC` (a fresh `loadMap` with no `LoadMapOptions`, the match's own load); SOCOM (USA)'s
 * MP5 from `SOCOM1_MP5_DIR`, the study's extracted input directory (`tools/variants/README.md`). Skipped -- and said
 * so -- without either.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const S1 = process.env.SOCOM1_MP5_DIR ? resolve(process.env.SOCOM1_MP5_DIR) : '';
const MISSING = [
  ...(DISC && existsSync(join(DISC, 'RUN', 'MP5.ZDB')) ? [] : ['SOCOM_DISC (RUN/MP5.ZDB)']),
  ...(S1 && S1_INPUT_FILES.every((f) => existsSync(join(S1, f))) ? [] : ['SOCOM1_MP5_DIR (the study\'s input files)']),
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

describe.skipIf(!READY)(`DAY-P1a: the Abandoned (Day) pack keyed to the LoadedMap world${WHY}`, () => {
  it('keys the fresh MP5 load, covers it at the study\'s exact share, carries SOCOM 1\'s settings, and builds the same bytes twice', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP5.ZDB');
    const key = worldKey(map);
    const outA = mkdtempSync(join(tmpdir(), 'day-p1a-a-'));
    const outB = mkdtempSync(join(tmpdir(), 'day-p1a-b-'));
    dirs.push(outA, outB);
    // A: the test's own fresh load handed in; B: the builder loads MP5 itself.
    const a = await buildAbandonedDay({ disc: DISC, s1Dir: S1, out: outA, map });
    const b = await buildAbandonedDay({ disc: DISC, s1Dir: S1, out: outB });

    const pk = propsKey(map);
    for (const out of [outA, outB]) {
      expect(JSON.parse(readFileSync(join(out, 'key.json'), 'utf8'))).toEqual(key);
      expect(JSON.parse(readFileSync(join(out, 'props-key.json'), 'utf8'))).toEqual(pk);
      // IQ-143: the builder writes the S2UV headers itself (8 bytes: magic, u32 count), so its output is the check-in
      const pack = readFileSync(join(out, 'pack.rgb8'));
      expect(pack.length).toBe(8 + 3 * key.vertices);
      expect(pack.subarray(0, 4).toString('latin1')).toBe('S2UV');
      expect(pack.readUInt32LE(4)).toBe(key.vertices);
      const props = readFileSync(join(out, 'props.rgb8'));
      expect(props.length).toBe(8 + 3 * pk.vertices);
      expect(props.subarray(0, 4).toString('latin1')).toBe('S2UV');
      expect(props.readUInt32LE(4)).toBe(pk.vertices);
      const leaf = readFileSync(join(out, 'textures', 'leafbig.tif.rgba'));
      expect([leaf.subarray(0, 4).toString('latin1'), leaf.readUInt32LE(4), leaf.readUInt32LE(8), leaf.length]).toEqual(['S2UV', 64, 64, 12 + 64 * 64 * 4]);
    }
    const coverage = JSON.parse(readFileSync(join(outA, 'coverage.json'), 'utf8'));
    expect(coverage.exact.count + coverage.nearest.count + coverage.graded.count + coverage.sky.count).toBe(key.vertices);
    expect(coverage.exact.shareOfNonSky).toBeGreaterThanOrEqual(0.86);

    // IQ-143 fault 2: the sky01.tif parts take SOCOM 1's sky colour (its `sky` prop: every vertex 1.0 = byte 128)
    expect(coverage.sky.colour).toEqual([1, 1, 1]);
    expect(coverage.sky.count).toBe(map.world.filter((p) => p.textureName === 'sky01.tif').reduce((n, p) => n + p.positions.length / 3, 0));
    const packA = readFileSync(join(outA, 'pack.rgb8')).subarray(8);
    let v = 0;
    for (const part of map.world) {
      const n = part.positions.length / 3;
      if (part.textureName === 'sky01.tif') for (let j = 0; j < n * 3; j++) expect(packA[(v * 3) + j]).toBe(128);
      v += n;
    }
    // IQ-143 faults 3, 4: the props pack -- every prop vertex by rule; the unlit bridge and jungle-tree props matched
    const pc = coverage.props;
    expect(pc.vertices).toBe(pk.vertices);
    expect(pc.matched.count + pc.graded.count + pc.own.count).toBe(pk.vertices);
    for (const name of ['a_bridge', 'a_jungletree3']) {
      const m = pc.byModel[name];
      expect(m.matched / m.vertices, name).toBeGreaterThanOrEqual(0.9);
    }

    const settings = JSON.parse(readFileSync(join(outA, 'settings.json'), 'utf8'));
    expect(settings.nightMission.value).toBe(false);
    expect(settings.fogColor.value).toEqual([150, 155, 165]);
    expect(settings.fogNear.value).toBe(100);
    expect(settings.fogFar.value).toBe(800);
    expect(settings.fogColor.source).toMatch(/s1-MP5\.json/);

    const ha = outputHash(outA), hb = outputHash(outB);
    expect(ha.files).toEqual(hb.files);
    expect(ha.hash).toBe(hb.hash);
    const pa = JSON.parse(readFileSync(join(outA, 'provenance.json'), 'utf8'));
    const pb = JSON.parse(readFileSync(join(outB, 'provenance.json'), 'utf8'));
    expect(typeof pa.generated).toBe('string');
    delete pa.generated; delete pb.generated;
    expect(pa).toEqual(pb);

    console.log(`DAY-P1a: ${key.vertices} vertices, key ${key.fnv64}; ${JSON.stringify(a.coverage)}; outputs ${outA} (${ha.files.length} files, both builds ${hb.hash.slice(0, 16)}, b exact ${b.coverage.exact.count}); files ${a.files.map((f) => `${f.name}=${f.bytes}`).join(' ')}; ${JSON.stringify({ s1Vertices: coverage.s1Vertices, normals: coverage.normals, grade: coverage.grade })}`);
  }, 600_000);
});
