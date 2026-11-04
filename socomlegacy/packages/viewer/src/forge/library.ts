import type { LoadedMap } from '../loadMap';
import { assetId } from './layout';
import { isWorldFacadeProp } from '../worldFacadeProps';

/**
 * FORGE (a browser adaptation, no original): the palette a loaded archive offers. Its props are the disc's own
 * prototypes (`MP<N>_MDL.ZED`, placed by `MP<N>_GEO.ZED`; socomlegacy/docs/research/72 §2), each already decoded once by
 * `loadMap` with a matrix per placement -- a piece is one of them drawn again where the builder puts it.
 */

export interface PaletteEntry {
  asset: string;
  model: string;
  /** How many times the archive's own map places it (every model-node of the name summed). */
  placed: number;
}

/** Each prototype with geometry once, sorted by name. */
export function palette(map: LoadedMap): PaletteEntry[] {
  const placed = new Map<string, number>();
  for (const p of map.props) {
    if (p.parts.length === 0 || isWorldFacadeProp(p)) continue;   // FACADES-2: the world's own facade nodes are no prototype
    placed.set(p.modelName, (placed.get(p.modelName) ?? 0) + p.matrices.length / 16);
  }
  return [...placed].sort(([a], [b]) => a.localeCompare(b)).map(([model, n]) => ({ asset: assetId(map.archive, model), model, placed: n }));
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * `model` as a map of its own for `buildWorld`: no world, no line strips, its first model-node of the name placed
 * once at the identity in its opening state (`alternate` off: a destructible's debris is not part of the piece), with
 * none of the map's grid cells or node paths. Null when the archive has no such prototype with geometry.
 */
export function prototypeMap(map: LoadedMap, model: string): LoadedMap | null {
  const prop = map.props.find((p) => p.modelName === model && p.parts.length > 0 && !isWorldFacadeProp(p));   // FACADES-2
  if (!prop) return null;
  const { cells: _cells, paths: _paths, ...rest } = prop;
  return { ...map, world: [], lines: null, props: [{ ...rest, matrices: IDENTITY.slice(), order: 0, alternate: false }] };
}
