import { MAP_VARIANTS, mapVariant, variantName, type MapInfo, type MapVariant } from '@s2u/archive';

/**
 * DAY-PICK (VARIANT_TESTROOM_ADAPTATION, `./testroomSwitch`; product track, a browser adaptation): the test room's map
 * picker (`../ui` `setMaps`) offers each accepted `MAP_VARIANTS` row as a map of its own, right after its parent. Its
 * value is the parent's path with the pair after a `#` (`RUN/MP5.ZDB#MP5:day`); `../main` `onMapChange` loads the parent
 * through the existing `?variant=` switch (`variantSearch`), and a plain pick clears it. Read off the table, never a stem
 * named here; the original has no time-of-day variants.
 */

/** One picker option: the archive's map, and the variant it is shown as (none for the plain map). */
export interface PickerEntry {
  map: MapInfo;
  variant: MapVariant | null;
  /** The option's value: the map's path, plus `#<stem>:<variant>` for a variant. */
  value: string;
  /** The variant's name in the disc's caps (`variantName`), or the map's own (`MapInfo.name`). */
  name: string;
}

/** A variant option's value. */
export function variantPickValue(path: string, stem: string, variant: MapVariant): string {
  return `${path}#${stem.toUpperCase()}:${variant}`;
}

/** The option list: each map, then its accepted variants in the table's order. */
export function pickerEntries(maps: readonly MapInfo[]): PickerEntry[] {
  return maps.flatMap((m) => {
    const stem = m.archive.toUpperCase();
    const own: PickerEntry = { map: m, variant: null, value: m.path, name: m.name };
    const days = MAP_VARIANTS.filter((v) => v.accepted && v.stem === stem)
      .map((v): PickerEntry => ({ map: m, variant: v.variant, value: variantPickValue(m.path, stem, v.variant), name: variantName(stem, v.variant)! }));
    return [own, ...days];
  });
}

/** What a picked value asks for: the path to load and the accepted pair, or no variant (a plain map, or a pair off the table). */
export function pickedVariant(value: string): { path: string; stem: string | null; variant: MapVariant | null } {
  const hash = value.lastIndexOf('#');
  if (hash < 0) return { path: value, stem: null, variant: null };
  const path = value.slice(0, hash);
  const [stem, word] = value.slice(hash + 1).split(':');
  const row = stem && (word === 'day' || word === 'night') ? mapVariant(stem, word) : undefined;
  return row?.accepted ? { path, stem: row.stem, variant: row.variant } : { path, stem: null, variant: null };
}

/** `search` with `?variant=` set to `variant`, or removed for none; every other parameter kept. */
export function variantSearch(search: string, variant: MapVariant | null): string {
  const params = new URLSearchParams(search);
  if (variant) params.set('variant', variant); else params.delete('variant');
  const out = params.toString();
  return out ? `?${out}` : '';
}

/** The option to show selected for a map drawn as `variant` (a word, the switch's mark or `?variant=`): its own, if accepted. */
export function shownPickValue(path: string, stem: string, variant: string | null | undefined): string {
  if (variant !== 'day' && variant !== 'night') return path;
  return mapVariant(stem, variant)?.accepted ? variantPickValue(path, stem, variant) : path;
}

/** The picker's last pick: the load it started (`../main` `wantedMap`), the stem a variant pick names (none for a plain pick), and its variant. */
export interface VariantPick { load: number; stem: string | null; variant: MapVariant | null }

/**
 * The query string the `?variant=` switch reads for load `load` of `stem`: the pick's (`variantSearch` over the page's)
 * only for the load the picker started -- and, for a variant pick, only for that stem; every other load (a custom map's
 * disc load, `__viewer.loadMap`, a mod reload, the list's first load) reads exactly the page's, as before the picker.
 */
export function loadVariantSearch(pageSearch: string, pick: VariantPick | null, load: number, stem: string): string {
  if (!pick || pick.load !== load) return pageSearch;
  if (pick.stem !== null && pick.stem !== stem.toUpperCase()) return pageSearch;
  return variantSearch(pageSearch, pick.variant);
}
