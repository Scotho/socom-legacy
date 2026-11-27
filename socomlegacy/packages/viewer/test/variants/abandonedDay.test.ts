import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../../src/loadMap';
import {
  ABANDONED_DAY_DATA_FILES, ABANDONED_DAY_FILL_GRADE_ADAPTATION, ABANDONED_DAY_TEXTURE_SWAPS, abandonedDayProfile,
  unpackPack, unpackTexture,
} from '../../src/variants/abandonedDay';
import { MAP_VARIANTS } from '@s2u/archive';
import {
  ACCEPTED_VARIANT_DATA_DIRS, VARIANT_DATA_ADAPTATION, createVariantRegistry, isAcceptedVariantData, profileFor,
  variantDataFiles, variantDataOn, type VariantDataReader,
} from '../../src/variants/profiles';
import { VARIANT_CAMERA_FIELDS } from '../../src/variants/profile';
import { withVariant } from '../../src/variants/withVariant';
import { propsKey } from '../../src/variants/key';

/**
 * DAY-P1b (simulation track: what a match on Abandoned (Day) draws). The profile is assembled from the builder's output
 * checked in under `src/variants/data/MP5-day/` (DAY.R9's default: the private repository only), read here from the
 * files themselves, and compared with those files: the key (`key.json`), the night flag and the light rig and fog
 * (`settings.json`, SOCOM (USA)'s MP5 as the builder copied them, each with its field path), the pack's bytes, and the
 * swapped textures (`textures.json`'s sha256 of each). The switch (`VITE_S2U_VARIANT_DATA`) is the registry's option.
 */
const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/data');
const HAVE_DATA = existsSync(join(DATA, 'MP5-day', 'key.json'));
const file = (name: string) => new Uint8Array(readFileSync(join(DATA, name)));
const jsonOf = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;
/** The data files from disk, counting each read: the reader a page's fetch stands for. */
function diskReader(): { read: VariantDataReader; reads: string[] } {
  const reads: string[] = [];
  return { reads, read: async (name) => { reads.push(name); return existsSync(join(DATA, name)) ? file(name) : undefined; } };
}
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

type Setting<T> = { value: T; source: string };

describe.skipIf(!HAVE_DATA)(`Abandoned (Day)'s profile (DAY-P1b)${HAVE_DATA ? '' : ' (src/variants/data/MP5-day absent: the public export)'}`, () => {
  it('with the switch on: the key is key.json, the night is off, the rig and fog are settings.json\'s', async () => {
    const { read } = diskReader();
    const reg = createVariantRegistry({ variantData: true, read });
    expect(reg.profileFor('MP5', 'day')).toBeUndefined();            // nothing until it is loaded
    const p = (await reg.load('mp5', 'day'))!;
    expect(p).toBeDefined();
    expect(reg.profileFor('MP5', 'day')).toBe(p);
    expect(reg.profileFor('mp5', 'day')).toBe(p);
    expect(p.stem).toBe('MP5');
    expect(p.variant).toBe('day');
    expect(p.key).toEqual(jsonOf('MP5-day/key.json'));

    const s = jsonOf<Record<string, Setting<unknown>>>('MP5-day/settings.json');
    expect(s.nightMission!.value).toBe(false);
    expect(p.night).toEqual({ mission: false, lens: null });
    expect(p.lightRig).toEqual(s.globalLighting!.value);
    expect(p.lightRig.colours[0]).toEqual([0.9599999785423279, 0.9300000071525574, 0.8600000143051147]);
    for (const f of VARIANT_CAMERA_FIELDS) expect(p.camera[f], f).toEqual(s[f]!.value);
    expect(p.camera).toEqual({
      fogColor: [150, 155, 165], fogNear: 100, fogFar: 800, fogTop: 10, fogBottom: 5,
      fogEnabled: true, fogAltitude: true, fogDirectional: false,
    });
    expect(Object.keys(p.camera).sort()).toEqual([...VARIANT_CAMERA_FIELDS].sort());
    // IQ-143: the sky takes SOCOM (USA)'s sky colour from the pack (no part kept at SOCOM II's night colours); SOCOM
    // II's `sun` prop (it draws moon.tif) is hidden; the props take the props pack.
    expect(p.keepTextures).toEqual([]);
    expect(p.hideTextures).toEqual([]);
    expect(p.hideProps).toEqual(['sun']);
    expect(p.propColours?.key).toEqual(jsonOf('MP5-day/props-key.json'));
    expect(p.addParts).toBeUndefined();
  });

  it('carries the pack byte for byte after its 8-byte header (S2UV, u32 vertex count), one RGB triple a world vertex', async () => {
    const p = (await createVariantRegistry({ variantData: true, read: diskReader().read }).load('MP5', 'day'))!;
    expect(p.colours?.kind).toBe('pack');
    const rgb8 = p.colours?.kind === 'pack' ? p.colours.rgb8 : new Uint8Array();
    expect(rgb8.length).toBe(3 * p.key!.vertices);
    const f = file('MP5-day/pack.rgb8');
    expect(Buffer.from(f.subarray(0, 8)).toString('hex')).toBe('53325556ca4d0000');   // 'S2UV', 19,914 LE
    expect(Buffer.from(rgb8).equals(Buffer.from(f.subarray(8)))).toBe(true);
  });

  it('carries the props pack byte for byte after its 8-byte header (S2UV, u32 prop vertex count), one RGB triple a prop vertex', async () => {
    const p = (await createVariantRegistry({ variantData: true, read: diskReader().read }).load('MP5', 'day'))!;
    const pc = p.propColours!;
    const n = jsonOf<{ vertices: number }>('MP5-day/props-key.json').vertices;
    expect(pc.key.vertices).toBe(n);
    expect(pc.rgb8.length).toBe(3 * n);
    const f = file('MP5-day/props.rgb8');
    expect(Buffer.from(f.subarray(0, 4)).toString('latin1')).toBe('S2UV');
    expect(new DataView(f.buffer, f.byteOffset).getUint32(4, true)).toBe(n);
    expect(Buffer.from(pc.rgb8).equals(Buffer.from(f.subarray(8)))).toBe(true);
    // a wrong count is refused through the profile, the reason said
    const bad = f.slice(); new DataView(bad.buffer).setUint32(4, n + 1, true);
    const reasons: string[] = [];
    const read: VariantDataReader = async (name) => (name === 'MP5-day/props.rgb8' ? bad : diskReader().read(name));
    expect(await abandonedDayProfile(read, (r) => reasons.push(r))).toBeUndefined();
    expect(reasons).toEqual([`props.rgb8: its header says ${n + 1} vertices, props-key.json ${n}`]);
  });

  it('every data binary holds a NUL in its first 8 KB (its header), so the leak check reads it as binary', () => {
    for (const f of ABANDONED_DAY_DATA_FILES.filter((n) => !n.endsWith('.json'))) {
      const b = file(`MP5-day/${f}`);
      expect(Buffer.from(b.subarray(0, 4)).toString('latin1'), f).toBe('S2UV');
      expect(b.subarray(0, 8192).includes(0), f).toBe(true);
    }
  });

  it('a bad magic or a wrong count is refused: no profile, the reason said', async () => {
    const good = file('MP5-day/pack.rgb8');
    const n = jsonOf<{ vertices: number }>('MP5-day/key.json').vertices;
    expect('rgb8' in unpackPack(good, n)).toBe(true);
    const badMagic = good.slice(); badMagic[0] = 0x58;
    expect(unpackPack(badMagic, n)).toEqual({ refused: 'pack.rgb8: no S2UV header' });
    expect(unpackPack(good, n + 1)).toEqual({ refused: `pack.rgb8: its header says ${n} vertices, key.json ${n + 1}` });
    const wrongCount = good.slice(); new DataView(wrongCount.buffer).setUint32(4, n - 1, true);
    expect(unpackPack(wrongCount, n)).toEqual({ refused: `pack.rgb8: its header says ${n - 1} vertices, key.json ${n}` });
    expect(unpackPack(good.subarray(0, good.length - 3), n)).toEqual({ refused: `pack.rgb8: ${3 * n - 3} bytes after the header, not ${3 * n}` });

    const leaf = file('MP5-day/textures/leafbig.tif.rgba');
    expect(unpackTexture('leaf', leaf, 64, 64)).toMatchObject({ width: 64, height: 64 });
    const leafBad = leaf.slice(); leafBad[3] = 0;
    expect(unpackTexture('leaf', leafBad, 64, 64)).toEqual({ refused: 'leaf: no S2UV header' });
    expect(unpackTexture('leaf', leaf, 32, 64)).toEqual({ refused: 'leaf: its header says 64 x 64, textures.json 32 x 64' });

    // through the profile: the bad pack is no profile, and the reason reaches `refuse`
    const reasons: string[] = [];
    const read: VariantDataReader = async (name) => (name === 'MP5-day/pack.rgb8' ? badMagic : diskReader().read(name));
    expect(await abandonedDayProfile(read, (r) => reasons.push(r))).toBeUndefined();
    expect(reasons).toEqual(['pack.rgb8: no S2UV header']);
    const reasons2: string[] = [];
    const read2: VariantDataReader = async (name) => (name === 'MP5-day/pack.rgb8' ? wrongCount : diskReader().read(name));
    expect(await abandonedDayProfile(read2, (r) => reasons2.push(r))).toBeUndefined();
    expect(reasons2[0]).toMatch(/header says 19913 vertices, key.json 19914/);
  });

  it('swaps the five changed textures by name; moon.tif is not swapped (its prop is hidden, IQ-143)', async () => {
    const p = (await createVariantRegistry({ variantData: true, read: diskReader().read }).load('MP5', 'day'))!;
    expect(ABANDONED_DAY_TEXTURE_SWAPS).toEqual({
      'ground01.tif': 'ground01.tif', 'stone01.tif': 'stone01.tif', 'sky01.tif': 'sky01.tif',
      'leafbig.tif': 'leafbig.tif', 'thai3r_palmfrond1.tif': 'thai3r_palmfrond1.tif',
    });
    expect(Object.keys(p.textureSwaps).sort()).toEqual(Object.keys(ABANDONED_DAY_TEXTURE_SWAPS).sort());
    const rows = jsonOf<{ name: string; width: number; height: number; sha256: string }[]>('MP5-day/textures.json');
    for (const [s2, s1] of Object.entries(ABANDONED_DAY_TEXTURE_SWAPS)) {
      const row = rows.find((r) => r.name === s1)!;
      const t = p.textureSwaps[s2]!;
      expect(t.width, s2).toBe(row.width);
      expect(t.height, s2).toBe(row.height);
      expect(t.data).toBeInstanceOf(Uint8ClampedArray);
      expect(t.data.length, s2).toBe(row.width * row.height * 4);
      expect(sha256(new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength)), s2).toBe(row.sha256);
    }
    expect(p.textureSwaps['moon.tif']).toBeUndefined();
    expect(p.textureSwaps['lightrays.tif']).toBeUndefined();          // no light-ray geometry is carried
  });

  it('the checked-in files are the profile\'s and no more (no grade.lut33, no lightrays.tif, no sun.tif)', () => {
    for (const f of ABANDONED_DAY_DATA_FILES) expect(existsSync(join(DATA, 'MP5-day', f)), f).toBe(true);
    expect(existsSync(join(DATA, 'MP5-day', 'grade.lut33'))).toBe(false);
    expect(existsSync(join(DATA, 'MP5-day', 'textures', 'lightrays.tif.rgba'))).toBe(false);
    expect(existsSync(join(DATA, 'MP5-day', 'textures', 'sun.tif.rgba'))).toBe(false);
    // the page's lazy glob sees the same files (dev and the test room have the switch on)
    expect(variantDataFiles().filter((f) => f.startsWith('MP5-day/')).sort()).toEqual(ABANDONED_DAY_DATA_FILES.map((f) => `MP5-day/${f}`).sort());
  });

  it('with the dev switch off (a release build): MP5 day, accepted, still loads; MP64 day and MP6 night read nothing (DAY-R1b)', async () => {
    const { read, reads } = diskReader();
    const reg = createVariantRegistry({ variantData: false, read });
    const p = await reg.load('MP5', 'day');
    expect(p).toBeDefined();
    expect(reg.profileFor('MP5', 'day')).toBe(p);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.startsWith('MP5-day/'))).toBe(true);
    const before = reads.length;
    for (const [stem, v] of [['MP64', 'day'], ['MP6', 'night'], ['MP5', 'night']] as const) {
      expect(await reg.load(stem, v)).toBeUndefined();
      expect(reg.profileFor(stem, v)).toBeUndefined();
    }
    expect(reads.length).toBe(before);
  });

  it('a release build\'s data files are MP5-day\'s, every one, beside the other accepted directories\' (variantDataFiles with the dev switch off; OT.R158: MP8-day)', () => {
    expect(variantDataFiles(false).filter((f) => f.startsWith('MP5-day/')).sort()).toEqual(ABANDONED_DAY_DATA_FILES.map((f) => `MP5-day/${f}`).sort());
    for (const f of variantDataFiles(false)) expect(isAcceptedVariantData(f), f).toBe(true);
  });

  it('MP5 night and MP2 day are no profile, switch on, and read nothing', async () => {
    const { read, reads } = diskReader();
    const reg = createVariantRegistry({ variantData: true, read });
    expect(await reg.load('MP5', 'night')).toBeUndefined();
    expect(await reg.load('MP2', 'day')).toBeUndefined();
    expect(reg.profileFor('MP5', 'night')).toBeUndefined();
    expect(reg.profileFor('MP2', 'day')).toBeUndefined();
    expect(reads).toEqual([]);
  });

  it('a missing data file (the public export) is no profile, not an error', async () => {
    const reg = createVariantRegistry({ variantData: true, read: async () => undefined });
    expect(await reg.load('MP5', 'day')).toBeUndefined();
    expect(reg.profileFor('MP5', 'day')).toBeUndefined();
  });

  it('the default registry answers undefined until a profile is loaded', () => {
    expect(profileFor('MP5', 'day')).toBeUndefined();
  });

  it('names the gap-fill grade as an adaptation', () => {
    expect(ABANDONED_DAY_FILL_GRADE_ADAPTATION).toMatch(/adaptation/);
    expect(ABANDONED_DAY_FILL_GRADE_ADAPTATION).toMatch(/gap-fill/);
  });
});

/**
 * DAY-R1b (product track: an adaptation, the owner's H490/H491 exception): the data switch is on, in every build, for a
 * variant whose `MAP_VARIANTS` row is accepted, and only in a development build (or `VITE_S2U_VARIANT_DATA=on`) for any
 * other. Pure, so it runs in the public export as well.
 */
describe('the variant-data switch by acceptance (DAY-R1b)', () => {
  it('an accepted pair is on with the dev switch off; a pair not accepted is on only with it on', () => {
    expect(variantDataOn('MP5', 'day', false)).toBe(true);
    expect(variantDataOn('mp5', 'day', false)).toBe(true);
    expect(variantDataOn('MP64', 'day', false)).toBe(false);
    expect(variantDataOn('MP6', 'night', false)).toBe(false);
    expect(variantDataOn('MP5', 'night', false)).toBe(false);
    expect(variantDataOn('MP64', 'day', true)).toBe(true);
    expect(variantDataOn('MP5', 'day', true)).toBe(true);
  });

  it('the accepted data directories are MAP_VARIANTS\' accepted rows, MP5-day and MP8-day today (OT.R158)', () => {
    expect([...ACCEPTED_VARIANT_DATA_DIRS].sort()).toEqual(MAP_VARIANTS.filter((v) => v.accepted).map((v) => `${v.stem}-${v.variant}`).sort());
    expect(ACCEPTED_VARIANT_DATA_DIRS).toEqual(['MP5-day', 'MP8-day']);
  });

  it('a release build reaches an accepted directory\'s files and no other (a future MP64-day/ stays out until accepted)', () => {
    expect(isAcceptedVariantData('MP5-day/pack.rgb8')).toBe(true);
    expect(isAcceptedVariantData('MP5-day/textures/ground01.tif.rgba')).toBe(true);
    for (const name of ['MP64-day/pack.rgb8', 'MP6-night/key.json', 'MP5-night/pack.rgb8', 'MP5-day-extra/pack.rgb8',
      'MP5-day/../MP64-day/pack.rgb8', 'loose.json', 'MP5-day']) expect(isAcceptedVariantData(name), name).toBe(false);
  });

  it('the release glob names only accepted directories (the bundler emits what its literal reaches)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/profiles.ts'), 'utf8');
    const globs = [...src.matchAll(/import\.meta\.glob<string>\('\.\/data\/([^']*)'/g)].map((m) => m[1]!);
    const release = globs.filter((g) => g !== '**/*');
    expect(release.length).toBeGreaterThan(0);
    for (const g of release) expect(ACCEPTED_VARIANT_DATA_DIRS.map((d) => `${d}/**/*`), g).toContain(g);
  });

  it('names the switch an adaptation and cites the owner\'s exception', () => {
    expect(VARIANT_DATA_ADAPTATION).toMatch(/adaptation/);
    expect(VARIANT_DATA_ADAPTATION).toMatch(/H490/);
    expect(VARIANT_DATA_ADAPTATION).toMatch(/H491/);
    expect(VARIANT_DATA_ADAPTATION).toMatch(/accepted/);
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_MP5 = !!DISC && existsSync(join(DISC, 'RUN', 'MP5.ZDB'));

describe.skipIf(!HAVE_MP5 || !HAVE_DATA)(`Abandoned (Day) on a fresh MP5 load${HAVE_MP5 ? '' : ' (SOCOM_DISC with RUN/MP5.ZDB absent)'}${HAVE_DATA ? '' : ' (no variant data)'}`, () => {
  it('withVariant applies it with no diagnostic: world colours change, the sky is SOCOM (USA)\'s, the moon prop is gone, the unlit props are lit by day (IQ-143)', async () => {
    const map = await loadMap(new FsAssetSource(DISC as string), 'RUN/MP5.ZDB');
    const p = (await createVariantRegistry({ variantData: true, read: diskReader().read }).load('MP5', 'day'))!;
    expect(propsKey(map)).toEqual(p.propColours!.key);
    const out = withVariant(map, p);
    expect(out.diagnostic).toBeUndefined();
    expect(out.map.night).toEqual({ mission: false, lens: null });
    expect(out.map.camera?.fogColor).toEqual([150, 155, 165]);
    expect(out.map.world.length).toBe(map.world.length);

    let changed = 0, sky = 0;
    map.world.forEach((part, i) => {
      const after = out.map.world[i]!;
      if (part.textureName === 'sky01.tif') {
        sky++;
        // IQ-143 fault 2 (the near-black rim): SOCOM (USA)'s sky colour (its `sky` prop, every vertex 1.0), alpha kept
        for (let v = 0; v < after.colors.length / 4; v++) {
          expect([after.colors[v * 4], after.colors[v * 4 + 1], after.colors[v * 4 + 2]]).toEqual([1, 1, 1]);
          expect(after.colors[v * 4 + 3]).toBe(part.colors[v * 4 + 3]);
        }
        return;
      }
      if (after.colors.some((c, k) => c !== part.colors[k])) changed++;
    });
    expect(sky).toBeGreaterThan(0);
    expect(changed).toBeGreaterThan(map.world.length / 2);
    // IQ-143 fault 1 (the moon): SOCOM II's `sun` prop draws moon.tif; hidden by day
    expect(map.props.some((e) => e.modelName === 'sun')).toBe(true);
    expect(out.map.props.some((e) => e.modelName === 'sun')).toBe(false);
    expect(out.map.textures['moon.tif']).toBe(map.textures['moon.tif']);
    expect(out.map.textures['ground01.tif']).toBe(p.textureSwaps['ground01.tif']);
    // IQ-143 faults 3 and 4 (black bridges, dark trees): the unlit props' mean colour, night against day
    const mean = (m: typeof map, name: string) => {
      let sum = 0, n = 0;
      for (const e of m.props.filter((x) => x.modelName === name)) for (const q of e.parts) {
        for (let v = 0; v < q.colors.length / 4; v++) { sum += q.colors[v * 4]! + q.colors[v * 4 + 1]! + q.colors[v * 4 + 2]!; n += 3; }
      }
      return sum / n;
    };
    for (const name of ['a_bridge', 'a_jungletree3']) {
      const night = mean(map, name), day = mean(out.map, name);
      expect(night, `${name} night`).toBeLessThan(0.15);
      expect(day, `${name} day`).toBeGreaterThan(Math.max(0.2, 2 * night));
    }
    expect(map.textures['moon.tif']!.width).toBe(64);                // the decode untouched
  }, 120_000);
});
