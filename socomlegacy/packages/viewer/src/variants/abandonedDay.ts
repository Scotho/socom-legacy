import { variantTitle } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import type { GlobalLighting } from '@s2u/scene';
import type { VariantProfile } from './profile';

/**
 * DAY-P1b: Abandoned (Day) -- SOCOM II's MP5 drawn with SOCOM (USA)'s own day bake of the same map (the day-mode plan,
 * `socomlegacy/docs/plans/2026-11-23-day-mode.md`; DAY.R1: simulation track). **A browser adaptation, never presented as
 * the original** (NXS.R4): SOCOM II has no daytime Abandoned. Every value is SOCOM (USA) v3.00's MP5 or SOCOM II's own,
 * as the builder (`tools/variants/buildAbandonedDay.ts`, DAY-P1a) wrote them into `./data/MP5-day/`; the sources and
 * their levels are research NNN ("map variants"). This module only assembles the profile from those files -- it holds
 * no value of its own but the file list and the texture names.
 *
 * - `key`: `key.json`, the `worldKey` of SOCOM II's MP5 on the match's own load (DAY.R4).
 * - `colours`: `pack.rgb8` -- the builder's pack behind an 8-byte header (`unpackPack`) -- one RGB8 triple a world vertex
 *   (`./profile`, the pack layout): SOCOM (USA)'s MP5 vertex
 *   colour where a vertex matches by position and normal (exact / nearest), else the gap-fill grade's
 *   (`ABANDONED_DAY_FILL_GRADE_ADAPTATION`), the sky's own bytes where kept. The grade itself is baked into the pack and
 *   is not carried.
 * - `keepTextures`: none (IQ-143). The `sky01.tif` parts take SOCOM (USA)'s sky colour from the pack (its `sky` prop's
 *   one vertex colour, 1.0; the builder's `coverage.json` `sky`): SOCOM II's own sky colours (0 at the rim to 0.25),
 *   kept before, drew a near-black rim under SOCOM (USA)'s day `sky01.tif`.
 * - `propColours`: `props.rgb8` (the same 8-byte header) keyed by `props-key.json` (`./key` `propsKey`): one RGB8 triple
 *   a prop vertex -- SOCOM (USA)'s colour where its prop of the same model holds the vertex (the builder's
 *   `buildPropsPack`), else the gap-fill grade's on an unlit part and the prop's own on a lit one. IQ-143: the unlit
 *   `a_bridge` and `a_jungletree3` props kept SOCOM II's night bake (black bridges, dark trees).
 * - `hideProps`: `sun` -- SOCOM II's MP5 `sun` prop draws `moon.tif` (64 x 64; a fresh `loadMap` of `RUN/MP5.ZDB`, its
 *   `props` entry `modelName` `sun`, both parts `moon.tif`). IQ-143: drawn with SOCOM (USA)'s `sun.tif` on the moon's
 *   geometry and night colours it read as a dark disc. SOCOM (USA)'s own sun (a faint glow, vertex alpha at most 0.16,
 *   another place) is not carried: a known gap, with the light rays.
 * - `night`: SOCOM (USA)'s MP5 `NightMission` is 0 (`settings.json` `nightMission`): no night vision offered. `lens` is
 *   null: SOCOM (USA)'s `LensFX_NVG` on MP5 is three floats (0.2, 0.9, 0.2), not SOCOM II's four, and with the night
 *   flag off the lens is never drawn (`../loadMap` `nightOf` reads it only at 16 bytes or more, as `loadMap` gave it on
 *   SOCOM (USA)'s MP5 through the parked readers: `night.lens` null).
 * - `lightRig`: `settings.json` `globalLighting` (SOCOM (USA)'s three lights and ambient).
 * - `camera`: `settings.json`'s fog fields (`VARIANT_CAMERA_FIELDS`), as the input holds them.
 * - `textureSwaps`: `ABANDONED_DAY_TEXTURE_SWAPS`, SOCOM (USA)'s decoded RGBA8 under SOCOM II's names, each file the
 *   builder's pixels behind a 12-byte header (`unpackTexture`). The builder writes the headers itself (IQ-143), so its
 *   output files are the ones checked in.
 *
 * **The headers** (a browser adaptation of the file format, nothing of either game): `S2UV` in ASCII, then little-endian
 * u32s -- the world vertex count for the pack, width and height for a texture -- then the builder's bytes unchanged.
 * They make the files self-describing and mark them binary (their u32s carry NUL bytes; the leak check reads a file
 * with no NUL in its first 8 KB as text). A wrong magic or count is refused: no profile, the reason said.
 *
 * Not carried (research NNN, "Known gaps"): **no shadow vector** -- DAY-2's `VariantProfile` has no field for it, and
 * SOCOM (USA)'s MP5 `ShadowVector` (`settings.json` `shadowVector`) differs slightly from SOCOM II's, so the drop
 * shadows keep SOCOM II's direction; no light-ray geometry (so no `lightrays.tif`); no SOCOM (USA) sun (so no
 * `sun.tif`); SOCOM (USA)'s sky dome geometry (SOCOM II's dome is drawn with SOCOM (USA)'s `sky01.tif` and sky colour).
 */

/** The data directory's files this profile reads, relative to `./data/MP5-day/`. */
export const ABANDONED_DAY_DATA_FILES = [
  'pack.rgb8', 'key.json', 'props.rgb8', 'props-key.json', 'settings.json', 'provenance.json', 'textures.json',
  'textures/ground01.tif.rgba', 'textures/stone01.tif.rgba', 'textures/sky01.tif.rgba', 'textures/leafbig.tif.rgba',
  'textures/thai3r_palmfrond1.tif.rgba',
] as const;

/**
 * SOCOM II's texture name -> the SOCOM (USA) texture drawn in its place (`textures/<name>.rgba`): the names both discs'
 * MP5 hold with other pixels (the builder's `textures.json`, "changed"). `moon.tif` is not swapped: its prop is hidden
 * (`ABANDONED_DAY_HIDDEN_PROPS`; IQ-143).
 */
export const ABANDONED_DAY_TEXTURE_SWAPS: Readonly<Record<string, string>> = {
  'ground01.tif': 'ground01.tif',
  'stone01.tif': 'stone01.tif',
  'sky01.tif': 'sky01.tif',
  'leafbig.tif': 'leafbig.tif',
  'thai3r_palmfrond1.tif': 'thai3r_palmfrond1.tif',
};

/** The prop models hidden by day: SOCOM II's `sun` prop, which draws the moon (`moon.tif`). IQ-143. */
export const ABANDONED_DAY_HIDDEN_PROPS = ['sun'] as const;

/**
 * The gap-fill grade's rule (research NNN; `tools/variants/README.md`): a 33^3 LUT fitted on the exact pairs (SOCOM II
 * colour -> SOCOM (USA) colour) by a trilinear splat, the points no pair reached filled from their six neighbours, pass
 * by pass; it colours the vertices with no single SOCOM (USA) match (1,553 nearest, by the grade's prediction; 1,072
 * graded). Baked into `pack.rgb8` by the builder; no code here applies it.
 */
export const ABANDONED_DAY_FILL_GRADE_ADAPTATION =
  'a browser adaptation: the gap-fill grade -- a 33^3 colour LUT fitted on the exactly matched vertices (SOCOM II colour -> SOCOM (USA) colour), trilinear splat then six-neighbour fill; it picks among several SOCOM (USA) candidates and colours the unmatched vertices; baked into pack.rgb8' as const;

/** The data files' magic: ASCII `S2UV`. */
export const VARIANT_DATA_MAGIC = 'S2UV';
/** The pack's header bytes (magic, u32 vertex count). */
export const PACK_HEADER_BYTES = 8;
/** A texture file's header bytes (magic, u32 width, u32 height). */
export const TEXTURE_HEADER_BYTES = 12;

const magicOk = (b: Uint8Array) => b.length >= 4 && String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === VARIANT_DATA_MAGIC;
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true);

/** The raw pack (DAY-2's layout) after its header, or the reason it is refused (magic, count, length); the props pack likewise. */
export function unpackPack(file: Uint8Array, vertices: number, name = 'pack.rgb8', keyName = 'key.json'): { rgb8: Uint8Array } | { refused: string } {
  if (file.length < PACK_HEADER_BYTES || !magicOk(file)) return { refused: `${name}: no S2UV header` };
  const n = u32(file, 4);
  if (n !== vertices) return { refused: `${name}: its header says ${n} vertices, ${keyName} ${vertices}` };
  if (file.length !== PACK_HEADER_BYTES + 3 * n) return { refused: `${name}: ${file.length - PACK_HEADER_BYTES} bytes after the header, not ${3 * n}` };
  return { rgb8: file.subarray(PACK_HEADER_BYTES) };
}

/** A texture file's pixels after its header, or the reason it is refused (magic, size against `textures.json`, length). */
export function unpackTexture(name: string, file: Uint8Array, width: number, height: number): Rgba | { refused: string } {
  if (file.length < TEXTURE_HEADER_BYTES || !magicOk(file)) return { refused: `${name}: no S2UV header` };
  const w = u32(file, 4), h = u32(file, 8);
  if (w !== width || h !== height) return { refused: `${name}: its header says ${w} x ${h}, textures.json ${width} x ${height}` };
  const px = file.subarray(TEXTURE_HEADER_BYTES);
  if (px.length !== w * h * 4) return { refused: `${name}: ${px.length} bytes after the header, not ${w * h * 4}` };
  return { width: w, height: h, data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength) };
}

/** Reads one file under `./data/` (`MP5-day/pack.rgb8`); undefined when it is absent (the public export). */
export type DataReader = (name: string) => Promise<Uint8Array | undefined>;

type Setting<T> = { value: T; source: string };
interface Settings {
  nightMission: Setting<boolean>;
  globalLighting: Setting<GlobalLighting>;
  fogColor: Setting<[number, number, number]>;
  fogNear: Setting<number>;
  fogFar: Setting<number>;
  fogTop: Setting<number>;
  fogBottom: Setting<number>;
  fogEnabled: Setting<boolean>;
  fogAltitude: Setting<boolean>;
  fogDirectional: Setting<boolean>;
}
interface TextureRow { name: string; width: number; height: number; bytes: number }

const DIR = 'MP5-day/';

/**
 * Abandoned (Day)'s profile from its data files; undefined when any is absent, or when a header is refused (`refuse`
 * hears the reason; by default the console's warning).
 */
export async function abandonedDayProfile(
  read: DataReader, refuse: (reason: string) => void = (r) => console.warn(`${variantTitle('MP5', 'day')}: ${r}; no profile`),
): Promise<VariantProfile | undefined> {
  const bytes = new Map<string, Uint8Array>();
  for (const f of ABANDONED_DAY_DATA_FILES) {
    const b = await read(DIR + f);
    if (!b) return undefined;
    bytes.set(f, b);
  }
  const text = (f: string) => JSON.parse(new TextDecoder().decode(bytes.get(f)!)) as unknown;
  const key = text('key.json') as { vertices: number; fnv64: string };
  const pkey = text('props-key.json') as { vertices: number; fnv64: string };
  const s = text('settings.json') as Settings;
  const rows = text('textures.json') as TextureRow[];

  const pack = unpackPack(bytes.get('pack.rgb8')!, key.vertices);
  if ('refused' in pack) { refuse(pack.refused); return undefined; }
  const props = unpackPack(bytes.get('props.rgb8')!, pkey.vertices, 'props.rgb8', 'props-key.json');
  if ('refused' in props) { refuse(props.refused); return undefined; }
  const textureSwaps: VariantProfile['textureSwaps'] = {};
  for (const [s2, s1] of Object.entries(ABANDONED_DAY_TEXTURE_SWAPS)) {
    const row = rows.find((r) => r.name === s1);
    if (!row) { refuse(`textures.json has no row for ${s1}`); return undefined; }
    const t = unpackTexture(`textures/${s1}.rgba`, bytes.get(`textures/${s1}.rgba`)!, row.width, row.height);
    if ('refused' in t) { refuse(t.refused); return undefined; }
    textureSwaps[s2] = t;
  }

  return {
    stem: 'MP5',
    variant: 'day',
    key: { vertices: key.vertices, fnv64: key.fnv64 },
    colours: { kind: 'pack', rgb8: pack.rgb8 },   // the bytes after the header: DAY-2's raw layout
    keepTextures: [],
    // SOCOM (USA)'s MP5 NightMission 0; its 3-float LensFX_NVG never drawn with the flag off (see above).
    night: { mission: s.nightMission.value, lens: null },
    lightRig: s.globalLighting.value,
    camera: {
      fogColor: s.fogColor.value, fogNear: s.fogNear.value, fogFar: s.fogFar.value,
      fogTop: s.fogTop.value, fogBottom: s.fogBottom.value,
      fogEnabled: s.fogEnabled.value, fogAltitude: s.fogAltitude.value, fogDirectional: s.fogDirectional.value,
    },
    hideTextures: [],
    propColours: { key: { vertices: pkey.vertices, fnv64: pkey.fnv64 }, rgb8: props.rgb8 },
    hideProps: [...ABANDONED_DAY_HIDDEN_PROPS],
    // No shadow vector: DAY-2's VariantProfile has no field for it (SOCOM (USA)'s MP5 ShadowVector differs slightly from
    // SOCOM II's; settings.json shadowVector) -- a gap for a later task, research NNN.
    textureSwaps,
  };
}
