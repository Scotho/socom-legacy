import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../../src/loadMap';
import { propsKey, worldKey } from '../../src/variants/key';
import { withVariant } from '../../src/variants/withVariant';
import {
  RATS_NEST_DAY_DATA_FILES, RATS_NEST_DAY_HIDDEN_TEXTURES, RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER, RATS_NEST_DAY_TEXTURE_SWAPS,
  ratsNestDayProfile,
} from '../../src/variants/ratsNestDay';
import {
  ACCEPTED_VARIANT_DATA_DIRS, createVariantRegistry, isAcceptedVariantData, variantDataFiles, variantDataOn, type VariantDataReader,
} from '../../src/variants/profiles';
import { VARIANT_CAMERA_FIELDS } from '../../src/variants/profile';

/**
 * DAY-RN1 B3 (simulation track: what a match on Rat's Nest (Day) draws, DAY.R1). The profile is assembled from the
 * builder's MP8 output (`tools/variants/buildAbandonedDay.ts --stem MP8`). The owner named MP8-day's data an exception as
 * MP5-day's (MISSION OT.R158), so it ships with every build and the public export once committed: the assembly is tested
 * on a synthetic data set built here (no game data), and against the real files where `src/variants/data/MP8-day/` holds them.
 */
const header = (u32s: number[], body: Uint8Array) => {
  const out = new Uint8Array(4 + 4 * u32s.length + body.length);
  out.set([0x53, 0x32, 0x55, 0x56]);
  u32s.forEach((v, i) => new DataView(out.buffer).setUint32(4 + 4 * i, v, true));
  out.set(body, 4 + 4 * u32s.length);
  return out;
};
const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const setting = <T>(value: T) => ({ value, source: 'synthetic' });
const LIGHTS = { directions: [[0, 1, 0], [0, 0, 0], [1, 0, 0]], colours: [[0.5, 0.5, 0.5], [0, 0, 0], [0.1, 0.1, 0.1]], ambient: [0.25, 0.25, 0.25] };

/** A synthetic MP8-day data set: 2 world vertices, 1 prop vertex, a 1 x 1 texture for each swap, a 2 x 1 sky. */
function synthetic(over: Record<string, Uint8Array> = {}): VariantDataReader {
  const files: Record<string, Uint8Array> = {
    'key.json': enc({ vertices: 2, fnv64: '0123456789abcdef' }),
    'props-key.json': enc({ vertices: 1, fnv64: 'fedcba9876543210' }),
    'pack.rgb8': header([2], new Uint8Array([128, 128, 128, 64, 64, 64])),
    'props.rgb8': header([1], new Uint8Array([10, 20, 30])),
    'settings.json': enc({
      mapName: setting('synthetic'), nightMission: setting(false), shadowVector: setting([0, -1, 0]), globalLighting: setting(LIGHTS),
      fogColor: setting([17, 18, 23]), fogNear: setting(500), fogFar: setting(599), fogTop: setting(800), fogBottom: setting(500),
      fogEnabled: setting(true), fogDirectional: setting(true), fogAltitude: setting(false),
    }),
    'provenance.json': enc({ what: 'synthetic' }),
    'textures.json': enc([
      ...Object.values(RATS_NEST_DAY_TEXTURE_SWAPS).map((name) => ({ name, width: 1, height: 1, bytes: 4 })),
      { name: 'gen_cloudy_blue_sky.tif', width: 2, height: 1, bytes: 8 },
    ]),
    'textures/gen_cloudy_blue_sky.tif.rgba': header([2, 1], new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2])),
  };
  for (const s1 of Object.values(RATS_NEST_DAY_TEXTURE_SWAPS)) files[`textures/${s1}.rgba`] = header([1, 1], new Uint8Array([1, 2, 3, 255]));
  Object.assign(files, over);
  return async (name) => (name.startsWith('MP8-day/') ? files[name.slice('MP8-day/'.length)] : undefined);
}

describe("Rat's Nest (Day)'s profile (DAY-RN1 B3)", () => {
  it('reads every file it names, and swaps the three textures both discs\' MP8 hold with other pixels', () => {
    expect(RATS_NEST_DAY_TEXTURE_SWAPS).toEqual({ 'cratewood1.tif': 'cratewood1.tif', 'ground.tif': 'ground.tif', 'rockwall2.tif': 'rockwall2.tif' });
    for (const s1 of Object.values(RATS_NEST_DAY_TEXTURE_SWAPS)) expect(RATS_NEST_DAY_DATA_FILES).toContain(`textures/${s1}.rgba`);
    // SOCOM II's MP8 draws its night stars as world parts textured star.tif (172 vertices, unfogged): dropped by day
    expect(RATS_NEST_DAY_HIDDEN_TEXTURES).toEqual(['star.tif']);
  });

  it("swaps SOCOM II's night dome texture for the owner's sky, MP2's cuba1a_sky01.tif (a browser adaptation; OT.R158: \"Sky MP2\")", () => {
    expect(RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER).toEqual({ map: 'RUN/MP2.ZDB', texture: 'cuba1a_sky01.tif', as: 'gen_cloudy_blue_sky.tif' });
    expect(RATS_NEST_DAY_DATA_FILES).toContain('textures/gen_cloudy_blue_sky.tif.rgba');
    // the swap is not a same-name S1 texture: it is SOCOM II's own, another map's
    expect(Object.keys(RATS_NEST_DAY_TEXTURE_SWAPS)).not.toContain('gen_cloudy_blue_sky.tif');
  });

  it('assembles from the data files: key, pack, props pack, night off, the rig and fog as settings.json holds them', async () => {
    const p = (await ratsNestDayProfile(synthetic()))!;
    expect(p.stem).toBe('MP8');
    expect(p.variant).toBe('day');
    expect(p.key).toEqual({ vertices: 2, fnv64: '0123456789abcdef' });
    expect(p.colours).toEqual({ kind: 'pack', rgb8: new Uint8Array([128, 128, 128, 64, 64, 64]) });
    expect(p.propColours).toEqual({ key: { vertices: 1, fnv64: 'fedcba9876543210' }, rgb8: new Uint8Array([10, 20, 30]) });
    expect(p.night).toEqual({ mission: false, lens: null });
    expect(p.lightRig).toEqual(LIGHTS);
    expect(p.camera).toEqual({ fogColor: [17, 18, 23], fogNear: 500, fogFar: 599, fogTop: 800, fogBottom: 500, fogEnabled: true, fogAltitude: false, fogDirectional: true });
    expect(Object.keys(p.camera).sort()).toEqual([...VARIANT_CAMERA_FIELDS].sort());
    expect(p.keepTextures).toEqual([]);
    expect(p.hideTextures).toEqual(['star.tif']);
    expect(p.hideProps).toEqual([]);
    expect(Object.keys(p.textureSwaps).sort()).toEqual(['cratewood1.tif', 'gen_cloudy_blue_sky.tif', 'ground.tif', 'rockwall2.tif']);
    expect(p.textureSwaps['ground.tif']).toMatchObject({ width: 1, height: 1 });
    expect(p.textureSwaps['gen_cloudy_blue_sky.tif']).toEqual({ width: 2, height: 1, data: new Uint8ClampedArray([9, 8, 7, 6, 5, 4, 3, 2]) });
    expect(p.addParts).toBeUndefined();
  });

  it('no profile when a file is absent; a refused header says why', async () => {
    const none: VariantDataReader = async () => undefined;
    expect(await ratsNestDayProfile(none)).toBeUndefined();
    const reasons: string[] = [];
    expect(await ratsNestDayProfile(synthetic({ 'pack.rgb8': header([3], new Uint8Array(6)) }), (r) => reasons.push(r))).toBeUndefined();
    expect(reasons).toEqual(['pack.rgb8: its header says 3 vertices, key.json 2']);
    const sky: string[] = [];
    expect(await ratsNestDayProfile(synthetic({ 'textures/gen_cloudy_blue_sky.tif.rgba': header([1, 1], new Uint8Array(4)) }), (r) => sky.push(r))).toBeUndefined();
    expect(sky).toEqual(['textures/gen_cloudy_blue_sky.tif.rgba: its header says 1 x 1, textures.json 2 x 1']);
  });

  it('through the registry: MP8 day is a profile with the development switch off as well (accepted, OT.R158)', async () => {
    expect(variantDataOn('MP8', 'day', false)).toBe(true);
    const off = createVariantRegistry({ variantData: false, read: synthetic() });
    const q = await off.load('MP8', 'day');
    expect(q?.stem).toBe('MP8');
    expect(off.profileFor('MP8', 'day')).toBe(q);
    const on = createVariantRegistry({ variantData: true, read: synthetic() });
    const p = await on.load('mp8', 'day');
    expect(p?.stem).toBe('MP8');
    expect(on.profileFor('MP8', 'day')).toBe(p);
  });

  // The real output, where src/variants/data/MP8-day holds it (OT.R158: committed by the data's own step)
  const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/data');
  const HAVE = existsSync(join(DATA, 'MP8-day', 'key.json'));
  it.skipIf(!HAVE)(`the builder's MP8 output assembles${HAVE ? '' : ' -- skipped: src/variants/data/MP8-day absent'}`, async () => {
    const read: VariantDataReader = async (name) => (existsSync(join(DATA, name)) ? new Uint8Array(readFileSync(join(DATA, name))) : undefined);
    const p = (await ratsNestDayProfile(read))!;
    expect(p.key).toEqual(JSON.parse(readFileSync(join(DATA, 'MP8-day', 'key.json'), 'utf8')));
    expect(p.night.mission).toBe(false);
    expect(p.camera.fogColor).toEqual([17, 18, 23]);
  });
});

/**
 * OT.R158 (product track: an adaptation, the owner's exception as H490/H491's for MP5-day; DAY-R1b's cases for MP8 day):
 * MP8 day is accepted, so its data switch is on in every build, the release glob names `./data/MP8-day/**` literally,
 * and a release build reaches its files. Pure (bar the data-present case), so it runs in the public export as well.
 */
describe("Rat's Nest (Day)'s data in every build (OT.R158; DAY-R1b's pattern)", () => {
  it('MP8 day is on with the dev switch off, any case; MP8 night is no pair', () => {
    expect(variantDataOn('MP8', 'day', false)).toBe(true);
    expect(variantDataOn('mp8', 'day', false)).toBe(true);
    expect(variantDataOn('MP8', 'night', false)).toBe(false);
  });

  it('MP8-day is an accepted data directory, and a release build reaches its files and no neighbour', () => {
    expect(ACCEPTED_VARIANT_DATA_DIRS).toContain('MP8-day');
    expect(isAcceptedVariantData('MP8-day/pack.rgb8')).toBe(true);
    expect(isAcceptedVariantData('MP8-day/textures/gen_cloudy_blue_sky.tif.rgba')).toBe(true);
    for (const name of ['MP8-night/pack.rgb8', 'MP8-day-extra/pack.rgb8', 'MP8-day/../MP64-day/pack.rgb8', 'MP8-day']) {
      expect(isAcceptedVariantData(name), name).toBe(false);
    }
  });

  it('the release glob names every accepted directory literally, MP8-day among them (the bundler emits what its literal reaches)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/profiles.ts'), 'utf8');
    const globs = [...src.matchAll(/import\.meta\.glob<string>\('\.\/data\/([^']*)'/g)].map((m) => m[1]!);
    const release = globs.filter((g) => g !== '**/*');
    for (const d of ACCEPTED_VARIANT_DATA_DIRS) expect(release, d).toContain(`${d}/**/*`);
    expect(release).toContain('MP8-day/**/*');
  });

  const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/data');
  const HAVE = existsSync(join(DATA, 'MP8-day', 'key.json'));
  it.skipIf(!HAVE)(`with the dev switch off: MP8 day loads from its files, and a release build's MP8-day files are the profile's${HAVE ? '' : ' -- skipped: src/variants/data/MP8-day absent'}`, async () => {
    const reads: string[] = [];
    const read: VariantDataReader = async (name) => { reads.push(name); return existsSync(join(DATA, name)) ? new Uint8Array(readFileSync(join(DATA, name))) : undefined; };
    const reg = createVariantRegistry({ variantData: false, read });
    const p = await reg.load('MP8', 'day');
    expect(p?.stem).toBe('MP8');
    expect(reg.profileFor('MP8', 'day')).toBe(p);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.startsWith('MP8-day/'))).toBe(true);
    expect(variantDataFiles(false).filter((f) => f.startsWith('MP8-day/')).sort()).toEqual(RATS_NEST_DAY_DATA_FILES.map((f) => `MP8-day/${f}`).sort());
  });
});

// B3 review F1: the profile applied to the match's own MP8 load, where a seat copied the data (untracked) and the disc is
// present: no diagnostic (the keys agree), the stars gone, every other part kept, the sky at SOCOM (USA)'s colour.
const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/variants/data');
const HAVE_MP8_DATA = existsSync(join(DATA_DIR, 'MP8-day', 'key.json'));
const DISC = process.env.SOCOM_DISC;
const HAVE_MP8 = !!DISC && existsSync(join(DISC, 'RUN', 'MP8.ZDB'));
describe.skipIf(!HAVE_MP8 || !HAVE_MP8_DATA)(`Rat's Nest (Day) on a fresh MP8 load${HAVE_MP8 ? '' : ' -- skipped: SOCOM_DISC with RUN/MP8.ZDB absent'}${HAVE_MP8_DATA ? '' : ' -- skipped: src/variants/data/MP8-day absent'}`, () => {
  it('withVariant applies it with no diagnostic: the stars are dropped, the sky is 1.0, the props keep their 24 entries', async () => {
    const map = await loadMap(new FsAssetSource(DISC as string), 'RUN/MP8.ZDB');
    const read: VariantDataReader = async (name) => (existsSync(join(DATA_DIR, name)) ? new Uint8Array(readFileSync(join(DATA_DIR, name))) : undefined);
    const p = (await ratsNestDayProfile(read))!;
    expect(worldKey(map)).toEqual(p.key);
    expect(propsKey(map)).toEqual(p.propColours!.key);
    const out = withVariant(map, p);
    expect(out.diagnostic).toBeUndefined();
    expect(out.map.night).toEqual({ mission: false, lens: null });
    expect(out.map.camera?.fogColor).toEqual([17, 18, 23]);
    const stars = map.world.filter((q) => q.textureName === 'star.tif');
    expect(stars.reduce((n, q) => n + q.positions.length / 3, 0)).toBe(172);
    expect(out.map.world.some((q) => q.textureName === 'star.tif')).toBe(false);
    expect(out.map.world.length).toBe(map.world.length - stars.length);
    let sky = 0;
    for (const part of out.map.world.filter((q) => q.textureName === 'gen_cloudy_blue_sky.tif')) {
      for (let v = 0; v < part.colors.length / 4; v++, sky++) expect([part.colors[v * 4], part.colors[v * 4 + 1], part.colors[v * 4 + 2]]).toEqual([1, 1, 1]);
    }
    expect(sky).toBe(264);
    expect(out.map.props.filter((e) => e.modelName === 'lightbulb')).toHaveLength(24);
    expect(out.map.textures['ground.tif']).toBe(p.textureSwaps['ground.tif']);
    expect(out.map.textures['gen_cloudy_blue_sky.tif']).toBe(p.textureSwaps['gen_cloudy_blue_sky.tif']);
  }, 300_000);
});
