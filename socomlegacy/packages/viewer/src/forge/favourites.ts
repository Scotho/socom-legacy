import { pageSettings } from '../pageStore';
import { parseAssetId } from './layout';
import type { PaletteEntry } from './library';

/**
 * FORGE (a browser adaptation, no original): the builder's favourite props, kept in this browser by asset id
 * (`<archive>:<prototype>`), so a favourite from one archive is at hand while another fills the palette.
 */

/** The key the favourites live under (`../pageStore` `PAGE_SETTING_KEYS`; its name kept as first written: migrate in place). */
export const FAVOURITES_KEY = 's2u-forge-favourites';

/** The page's store as the favourites use it: `../pageStore` `pageSettings` (its private-window and quota rules). */
export interface Store { get(key: string): string | null; set(key: string, value: string): unknown }

export type AssetFilter = 'all' | 'favs';

export interface ShownAsset {
  asset: string;
  model: string;
  archive: string;
  /** How often its archive's map places it; null for a favourite from an archive not in the palette now. */
  placed: number | null;
  fav: boolean;
}

export function readFavourites(store: Store = pageSettings): Set<string> {
  try {
    const raw = store.get(FAVOURITES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && parseAssetId(x) !== null) : []);
  } catch {
    return new Set();
  }
}

export function writeFavourites(favs: ReadonlySet<string>, store: Store = pageSettings): void {
  try { store.set(FAVOURITES_KEY, JSON.stringify([...favs].sort())); } catch { /* the store says why once (`pageReport`) */ }
}

/** A new set with `asset` in or out. */
export function toggleFavourite(favs: ReadonlySet<string>, asset: string): Set<string> {
  const next = new Set(favs);
  if (!next.delete(asset)) next.add(asset);
  return next;
}

/**
 * What the assets list shows. `all`: the palette's archive, its favourites first and the rest after, each in palette
 * order. `favs`: every favourite from every archive, by id. The query matches the model's name, any case.
 */
export function assetsShown(palette: readonly PaletteEntry[], favs: ReadonlySet<string>, filter: AssetFilter, query: string): ShownAsset[] {
  const q = query.trim().toLowerCase();
  const hit = (model: string): boolean => !q || model.toLowerCase().includes(q);
  const of = (p: PaletteEntry): ShownAsset => ({ asset: p.asset, model: p.model, archive: parseAssetId(p.asset)!.archive, placed: p.placed, fav: favs.has(p.asset) });
  if (filter === 'favs') {
    const known = new Map(palette.map((p) => [p.asset, p]));
    return [...favs].sort().flatMap((asset) => {
      const id = parseAssetId(asset);
      if (!id || !hit(id.model)) return [];
      const p = known.get(asset);
      return [p ? of(p) : { asset, model: id.model, archive: id.archive, placed: null, fav: true }];
    });
  }
  const shown = palette.filter((p) => hit(p.model)).map(of);
  return [...shown.filter((s) => s.fav), ...shown.filter((s) => !s.fav)];
}

/**
 * The other tabs' starred tiles (the owner, 2026-11-13: "add the favorite button for all the asset types, not just
 * props"; a browser adaptation): each tile's own id as the asset browser gives it (`door.MP2:bdoor_4`, a sound's
 * `ambient.MP1:=sound:...`, a ladder's prop id), kept apart from the props' so neither list takes the other's.
 */
export const OBJECT_FAVOURITES_KEY = 's2u-forge-object-favourites';

export function readObjectFavourites(store: Store = pageSettings): Set<string> {
  try {
    const raw = store.get(OBJECT_FAVOURITES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200) : []);
  } catch {
    return new Set();
  }
}

export function writeObjectFavourites(favs: ReadonlySet<string>, store: Store = pageSettings): void {
  try { store.set(OBJECT_FAVOURITES_KEY, JSON.stringify([...favs].sort())); } catch { /* the store says why once (`pageReport`) */ }
}
