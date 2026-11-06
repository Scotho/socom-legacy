import type { ScenicViewMarker, TacPointMarker } from './layout';

/**
 * The layout's placed tactical points and spectator views in the match (a browser adaptation, FG.R2; no original):
 * beside the map's own -- a point on its tactical map (`LoadedMap.tac`, the AIMAPS named points `../tacMap` reads; kind 1
 * the compass's nav mark, `navBitmap` by the name's first letter), a view in its Scenic_Views (`LoadedMap.scenicViews`,
 * the spectator's steps, `../spectatorView`), its roll 0 as every disc view (SCENIC_VIEWS_READING).
 */

type TacPoint = { name: string; kind: number; x: number; z: number };
/** A tactical map as `LoadedMap.tac` holds it (`../tacMap` `TacData`'s members the points read). */
export type Tac = { lines: unknown[]; zones: unknown[]; points: TacPoint[]; bounds: { minX: number; minZ: number; maxX: number; maxZ: number } };
type View = { name: string; at: [number, number, number]; pitch: number; yaw: number; roll: number };

/** A tactical map made for a map with none (the blank floor): this far round its points. An editor's value (FG.R2). */
export const PLACED_TAC_MARGIN = 1000;

/** The NATO words the nav marks' letters name (`navBitmap`: C..Z), in order. */
const NAV_WORDS = ['Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar',
  'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu'];

/** The first nav word whose first letter no name in `taken` begins with (its compass badge free); past Zulu, `Point<n>`. */
export function nextNavName(taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.charAt(0).toUpperCase()));
  return NAV_WORDS.find((w) => !used.has(w.charAt(0))) ?? `Point${taken.length + 1}`;
}

/** The first `View<n>` free against `taken` (case-blind). */
export function nextViewName(taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`view${n}`)) return `View${n}`;
}

/** `map` with the placed points on its tactical map, one made round them where it has none. */
export function withPlacedPoints<T extends { tac?: Tac | null }>(map: T, placed: readonly TacPointMarker[] | undefined): T {
  if (!placed?.length) return map;
  const points: TacPoint[] = placed.map((p) => ({ name: p.name, kind: p.kind, x: p.at[0], z: p.at[2] }));
  if (map.tac) return { ...map, tac: { ...map.tac, points: [...map.tac.points, ...points] } };
  const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
  const bounds = { minX: Math.min(...xs) - PLACED_TAC_MARGIN, minZ: Math.min(...zs) - PLACED_TAC_MARGIN, maxX: Math.max(...xs) + PLACED_TAC_MARGIN, maxZ: Math.max(...zs) + PLACED_TAC_MARGIN };
  return { ...map, tac: { lines: [], zones: [], points, bounds } };
}

/** `map` with the placed views after its own spectator views. */
export function withPlacedViews<T extends { scenicViews?: readonly View[] }>(map: T, placed: readonly ScenicViewMarker[] | undefined): T {
  if (!placed?.length) return map;
  const views: View[] = placed.map((v) => ({ name: v.name, at: [v.at[0], v.at[1], v.at[2]], yaw: v.yaw, pitch: v.pitch, roll: 0 }));
  return { ...map, scenicViews: [...(map.scenicViews ?? []), ...views] };
}
