import { variantTitle } from '@s2u/archive';
import type { GlobalLighting } from '@s2u/scene';
import { unpackPack, unpackTexture, type DataReader } from './abandonedDay';
import type { VariantProfile } from './profile';

/**
 * DAY-RN1 B3: Rat's Nest (Day) -- SOCOM II's MP8 drawn with SOCOM (USA)'s own bake of the same map, as Abandoned (Day)
 * draws MP5 (`./abandonedDay`; the owner, 2026-11-24 ~17:52Z: "prepare the day version the same way we did abandoned").
 * DAY.R1: simulation track. **A browser adaptation, never presented as the original** (NXS.R4): SOCOM II has no daytime
 * Rat's Nest. Every value is SOCOM (USA) v3.00's MP8 or SOCOM II's own, as the builder (`tools/variants/
 * buildAbandonedDay.ts --stem MP8`, DAY-RN1 B2) wrote them into `./data/MP8-day/`; the sources and their levels are
 * research NNN ("map variants"), section 8. This module only assembles the profile from those files.
 *
 * **Accepted** (`MAP_VARIANTS` (8, 'day') `accepted: true`; the owner from its stills, MISSION OT.R158, 2026-11-25): its
 * data is read with the development switch off as well (`./profiles` `variantDataOn`), and is COMMITTED under the owner's
 * named exception (MISSION OT.R158): `./data/MP8-day/` holds exactly `RATS_NEST_DAY_DATA_FILES`, the builder's output at
 * c1199459eb (its `provenance.json`), as DAY-R1b did for MP5-day.
 *
 * As `./abandonedDay`, with three differences, each read off the two discs' MP8 (the study's render sets):
 * - `textureSwaps`: the three names both discs' MP8 hold with other pixels (the builder's `textures.json`, "changed"),
 *   and the sky swap: SOCOM II's dome texture `gen_cloudy_blue_sky.tif` (its night sky; no namesake in SOCOM (USA)'s
 *   MP8, whose dome is its `sky` prop) drawn with another SOCOM II map's sky texture, `RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER`
 *   -- a browser adaptation's art choice, not a reading -- under SOCOM (USA)'s sky colour (the pack: 1.0, `'mode'`).
 * - `hideTextures`: `star.tif` -- SOCOM II's MP8 draws its night stars as world parts (172 vertices, unfogged); by day
 *   they are dropped, as Abandoned (Day) drops its moon prop.
 * - `hideProps`: none -- SOCOM II's MP8 props are its 24 `lightbulb` entries only (no sun or moon prop).
 * Not carried, as on MP5: the shadow vector (no `VariantProfile` field), SOCOM (USA)'s sky dome geometry.
 */

/**
 * The day sky: the SOCOM II map and texture whose pixels the builder writes under SOCOM II MP8's dome texture name
 * (`as`), so the dome draws a day sky in place of its night one. **A browser adaptation's art choice, product track
 * preference** (SOCOM II has no daytime Rat's Nest, so no original names a day sky for it): the owner's pick, MP2's
 * `cuba1a_sky01.tif` (MISSION OT.R158, 2026-11-25, verbatim: "rats nest day: accepted, using 5. Sky MP2, foc
 * current[17,18,23] option" -- the fog stays the one `settings.json` carries). Until then MP82's `mp82_skycap.tif` was
 * built as a candidate (D20, the sheet `next-sprint/day-stills/sky-sheet-ratsnest`). The texture is copied at its native
 * size, as the repository's reader (`loadMap`'s `textures`) decodes it. Research NNN ("map variants"), section 8.1.
 */
export const RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER = { map: 'RUN/MP2.ZDB', texture: 'cuba1a_sky01.tif', as: 'gen_cloudy_blue_sky.tif' } as const;

/** The data directory's files this profile reads, relative to `./data/MP8-day/`. */
export const RATS_NEST_DAY_DATA_FILES = [
  'pack.rgb8', 'key.json', 'props.rgb8', 'props-key.json', 'settings.json', 'provenance.json', 'textures.json',
  'textures/cratewood1.tif.rgba', 'textures/ground.tif.rgba', 'textures/rockwall2.tif.rgba',
  `textures/${RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER.as}.rgba`,
] as const;

/** SOCOM II's texture name -> the SOCOM (USA) texture drawn in its place: the names both discs' MP8 hold with other pixels. */
export const RATS_NEST_DAY_TEXTURE_SWAPS: Readonly<Record<string, string>> = {
  'cratewood1.tif': 'cratewood1.tif',
  'ground.tif': 'ground.tif',
  'rockwall2.tif': 'rockwall2.tif',
};

/** The world textures dropped by day: SOCOM II's MP8 night stars. */
export const RATS_NEST_DAY_HIDDEN_TEXTURES = ['star.tif'] as const;

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

const DIR = 'MP8-day/';

/**
 * Rat's Nest (Day)'s profile from its data files; undefined when any is absent, or when a header is refused (`refuse`
 * hears the reason; by default the console's warning).
 */
export async function ratsNestDayProfile(
  read: DataReader, refuse: (reason: string) => void = (r) => console.warn(`${variantTitle('MP8', 'day')}: ${r}; no profile`),
): Promise<VariantProfile | undefined> {
  const bytes = new Map<string, Uint8Array>();
  for (const f of RATS_NEST_DAY_DATA_FILES) {
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
  // the same-name S1 textures, then the sky swap (its file is named by SOCOM II's dome texture, `as`)
  const sky = RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER.as;
  for (const [s2, file] of [...Object.entries(RATS_NEST_DAY_TEXTURE_SWAPS), [sky, sky] as const]) {
    const row = rows.find((r) => r.name === file);
    if (!row) { refuse(`textures.json has no row for ${file}`); return undefined; }
    const t = unpackTexture(`textures/${file}.rgba`, bytes.get(`textures/${file}.rgba`)!, row.width, row.height);
    if ('refused' in t) { refuse(t.refused); return undefined; }
    textureSwaps[s2] = t;
  }

  return {
    stem: 'MP8',
    variant: 'day',
    key: { vertices: key.vertices, fnv64: key.fnv64 },
    colours: { kind: 'pack', rgb8: pack.rgb8 },
    keepTextures: [],
    // SOCOM (USA)'s MP8 NightMission 0 (settings.json): no night vision, the lens never drawn.
    night: { mission: s.nightMission.value, lens: null },
    lightRig: s.globalLighting.value,
    camera: {
      fogColor: s.fogColor.value, fogNear: s.fogNear.value, fogFar: s.fogFar.value,
      fogTop: s.fogTop.value, fogBottom: s.fogBottom.value,
      fogEnabled: s.fogEnabled.value, fogAltitude: s.fogAltitude.value, fogDirectional: s.fogDirectional.value,
    },
    hideTextures: [...RATS_NEST_DAY_HIDDEN_TEXTURES],
    propColours: { key: { vertices: pkey.vertices, fnv64: pkey.fnv64 }, rgb8: props.rgb8 },
    hideProps: [],
    textureSwaps,
  };
}
