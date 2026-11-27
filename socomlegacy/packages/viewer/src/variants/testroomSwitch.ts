import { MAP_VARIANTS, mapVariant, variantTitle, type MapVariant } from '@s2u/archive';
import type { LoadedMap } from '../loadMap';
import type { VariantProfile } from './profile';
import { loadVariantProfile, profileFor } from './profiles';
import { withVariant } from './withVariant';

/**
 * DAY-3: `?variant=day|night` on the test room (`../main` `show`) and the xbox-renderer page (`../xboxPrototype/main`),
 * read off the page's own query string. **A browser adaptation and a development instrument** (product track, DAY.R1):
 * it shows one of the table's labelled variants (`@s2u/archive` `MAP_VARIANTS`) so a profile can be looked at; the
 * original has no time-of-day variants, and nothing here is a reading of SOCOM II. It is never reachable from the game
 * path (`../matchMount`, `../frontEnd`, `../netPage` reach no import of it: `test/variants/testroomSwitch.test.ts`).
 * Offline only (DAY-FIX2, the batch 2 review's F3): a page that will join a real room passes `{ online: true }` and the
 * switch refuses, so one client never sees a variant in a match the others see as decoded. The test room's status line
 * it writes is replaced once the world is on screen (`../main` `show`'s `say`); the line persists in the
 * map's diagnostics, and `show`'s own line once the world is drawn ends on it too (DAY-3b, the review's F4).
 * DAY-3b: the profile is fetched before the switch asks for it (`variantProfileWait` on the test room, which `../main`
 * awaits before `show`; `prepareTestroomVariant` on the xbox-renderer page), and a variant map is marked so that turning
 * Online on reloads it as decoded (`variantBlocksOnline`, asked by `../main` `connectNet`): no variant reaches a room.
 */
export const VARIANT_TESTROOM_ADAPTATION =
  'a browser adaptation and a development instrument: ?variant=day|night on the test room and the xbox-renderer page shows a table variant\'s profile; never on the game path' as const;

/** The registry the switch asks (`./profiles` `profileFor` by default; a test passes its own). */
export type VariantRegistry = (stem: string, variant: MapVariant) => VariantProfile | undefined;

/** Where the page stands: `online` true when it will join a real room (the test room's `NET.url`, the xbox page's lobby or server). */
export interface TestroomVariantOptions {
  online?: boolean;
}

/** What the switch did: the map to build, whether a profile was applied, and the line the page says. */
export interface TestroomVariant {
  /**
   * The map to build: the variant's (`withVariant`) when applied; otherwise the decoded map's own content, shallow-copied.
   * Either way its `diagnostics` end on `line`, so the page's diagnostics list keeps it after the status line moves on.
   */
  map: LoadedMap;
  applied: boolean;
  /** Plain words for the page's status line. */
  line: string;
}

/** How a variant's profile is loaded (`./profiles` `loadVariantProfile` by default; a test passes its own). */
export type VariantLoader = (stem: string, variant: MapVariant) => Promise<VariantProfile | undefined>;

/**
 * The mark the switch leaves on a map it drew as a variant: the pair (`MP5 day`). An own enumerable symbol property, so a
 * spread copy (`withVariant`, a page's re-mark) keeps it; never posted to a worker (a variant map stays on the page).
 */
const VARIANT_MARK = Symbol('s2u.testroomVariant');

/** The pair a map was drawn as (`MP5 day`), or undefined for a decoded map (one the switch refused included). */
export function variantOf(map: LoadedMap): string | undefined {
  return (map as LoadedMap & { [VARIANT_MARK]?: string })[VARIANT_MARK];
}

/**
 * DAY-3b (the batch 2 review's F3 remainder): true when the page is about to join a real room (`online`) with a map the
 * switch drew as a variant -- the page then reloads the map as decoded instead (`../main` `connectNet`), and the reload's
 * switch, now online, refuses the variant. A decoded map, or any map offline, never blocks.
 */
export function variantBlocksOnline(map: LoadedMap, online: boolean): boolean {
  return online && variantOf(map) !== undefined;
}

const TABLE = MAP_VARIANTS.map((v) => `${v.stem} ${v.variant}`).join(', ');

/**
 * The switch: `search` is the page's query string (`location.search`). No `variant` (or an empty one) is null -- the
 * page changes nothing. A word that is no time, a pair off the table (`mapVariant` undefined: `day` on MP2), a profile
 * not built yet (`registry` undefined: today every pair, `./profiles`) or `withVariant`'s diagnostic (a key mismatch)
 * leaves the map as decoded, with the line saying which. `opts.online` refuses any word first, the registry never asked.
 */
export function testroomVariant(search: string, map: LoadedMap, registry: VariantRegistry = profileFor, opts: TestroomVariantOptions = {}): TestroomVariant | null {
  const asked = new URLSearchParams(search).get('variant')?.trim().toLowerCase();
  if (!asked) return null;
  const stem = map.archive.toUpperCase();
  const decoded = (line: string): TestroomVariant => ({ map: { ...map, diagnostics: [...map.diagnostics, line] }, applied: false, line });
  if (opts.online) return decoded(`?variant=${asked}: a variant is shown only offline in the test room (DAY-3); this room is drawn as decoded`);
  if (asked !== 'day' && asked !== 'night') {
    return decoded(`?variant="${asked}" is not a time this switch knows (day or night); ${stem} drawn as decoded`);
  }
  if (!mapVariant(stem, asked)) {
    return decoded(`?variant=${asked}: ${stem} has no ${asked} variant (the variants are ${TABLE}); drawn as decoded`);
  }
  const profile = registry(stem, asked);
  if (!profile) return decoded(`?variant=${asked}: the ${stem} ${asked} profile is not built yet; drawn as decoded`);
  const out = withVariant(map, profile);
  if (out.diagnostic) return decoded(`?variant=${asked}: ${out.diagnostic}`);
  const line = `?variant=${asked}: ${stem} drawn as ${variantTitle(stem, asked)} -- a development instrument, not the original`;
  const shown: LoadedMap & { [VARIANT_MARK]?: string } = { ...out.map, diagnostics: [...out.map.diagnostics, line] };
  shown[VARIANT_MARK] = `${stem} ${asked}`;
  return { map: shown, applied: true, line };
}

/** The pair `search` asks for on `map`, when the switch would ask the registry for it (offline, a time, on the table). */
function tablePair(search: string, map: LoadedMap, opts: TestroomVariantOptions): { stem: string; variant: MapVariant } | null {
  if (opts.online) return null;
  const asked = new URLSearchParams(search).get('variant')?.trim().toLowerCase();
  if (asked !== 'day' && asked !== 'night') return null;
  const stem = map.archive.toUpperCase();
  return mapVariant(stem, asked) ? { stem, variant: asked } : null;
}

/**
 * DAY-3b: what a page awaits before the switch. A promise of the profile only when the switch would ask for a pair the
 * registry does not hold yet (offline, `?variant=` a time on the table); null otherwise, so a page with no variant (or
 * one already loaded) goes on at once, as before. Never rejects: a failed load is warned and resolves undefined, and the
 * switch then draws the map as decoded with its line. (`loadVariantProfile` answers undefined with the data switch off
 * or a data file missing: the same.)
 */
export function variantProfileWait(search: string, map: LoadedMap, opts: TestroomVariantOptions = {}, load: VariantLoader = loadVariantProfile,
  registry: VariantRegistry = profileFor): Promise<VariantProfile | undefined> | null {
  const pair = tablePair(search, map, opts);
  if (!pair || registry(pair.stem, pair.variant)) return null;
  return load(pair.stem, pair.variant).catch((e: unknown) => {
    console.warn(`?variant=${pair.variant}: the ${pair.stem} ${pair.variant} profile would not load:`, e instanceof Error ? e.message : String(e));
    return undefined;
  });
}

/** DAY-3b: the switch after its profile is awaited (`variantProfileWait`), for a page whose load path is already async. */
export async function prepareTestroomVariant(search: string, map: LoadedMap, opts: TestroomVariantOptions = {}, load: VariantLoader = loadVariantProfile,
  registry: VariantRegistry = profileFor): Promise<TestroomVariant | null> {
  const got = await variantProfileWait(search, map, opts, load, registry);
  return testroomVariant(search, map, (stem, variant) => registry(stem, variant) ?? got ?? undefined, opts);   // `got` is null when no wait was needed
}
