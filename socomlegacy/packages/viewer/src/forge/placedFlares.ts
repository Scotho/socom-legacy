import type { LoadedMap } from '../loadMap';
import { isWorldFacadeProp } from '../worldFacadeProps';
import type { FlareMarker } from './layout';

/**
 * The layout's placed flares (the owner, 2026-11-06; a browser adaptation, FG.R2, no original): each a copy of one of a
 * disc map's facade nodes -- the glow alone, not the lamp it hangs on. `loadMap` files a model's nodes as their own prop
 * entries, keyed by model, node and facade (`loadMap` LATER 120), so a lamp's body (`m_facade` 0) and its glow
 * (`m_facade` non-zero: the quad the engine turns to the camera, `../facade` `turnFacade`) are two entries of one model
 * name. A flare is named by its node (its first placement's path, the scene walk's last step): what its record keeps.
 */
export interface FlareTemplate {
  /** The archive it is copied from. */
  source: string;
  /** Its node's name: the dropdown's choice and the record's. */
  name: string;
  /** The prop entry: the facade node's geometry, its facade value. */
  prop: LoadedMap['props'][number];
  lib: LoadedMap;
}

/** A node's own name: its path's last step, before any `=<model>` (`loadMap`'s `scroll` reads it the same way). */
const nodeName = (path: string | undefined): string => path?.split('/').pop()?.split('=')[0] ?? '';

/** The record's bound on a flare's name (`FlareMarker.name`): letters, digits, `_`, `.`, `-` and spaces, 1-48. */
export const FLARE_NAME = /^[A-Za-z0-9_ .-]{1,48}$/;

/**
 * A map's flares: every facade entry with geometry (the world model's own facade nodes are the world's, no prototype:
 * `isWorldFacadeProp`), each once by its node's name -- `<model>_<n>` where its path names none the record can keep.
 */
export function flareTemplates(lib: LoadedMap, source: string): FlareTemplate[] {
  const out: FlareTemplate[] = [];
  const taken = new Set<string>();
  for (const prop of lib.props) {
    if (prop.facade === 0 || prop.parts.length === 0 || isWorldFacadeProp(prop)) continue;
    let name = nodeName(prop.paths?.[0]);
    if (!FLARE_NAME.test(name) || taken.has(name)) {
      let n = 1;
      do name = `${prop.modelName}_${n++}`.slice(0, 48); while (taken.has(name));
    }
    taken.add(name);
    out.push({ source, name, prop, lib });
  }
  return out;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A flare as a map of its own for `buildWorld` (as `./library` `prototypeMap`): its facade node alone, at the origin. */
export function flareModelMap(t: FlareTemplate): LoadedMap {
  const { cells: _c, paths: _p, walk: _w, ...rest } = t.prop;
  return { ...t.lib, world: [], lines: null, props: [{ ...rest, matrices: IDENTITY.slice(), order: 0, alternate: false }] };
}

/**
 * `map` with the layout's flares beside its own props: each its facade node drawn at its place (a translation alone --
 * the engine's turn sets its pose every frame), its textures carried from a foreign archive as a turret's are
 * (`./turrets` `withPlacedTurrets`). One whose template is not found is left out and counted (`unplaced`).
 */
export function withPlacedFlares(map: LoadedMap, placed: readonly FlareMarker[] | undefined,
  templateOf: (source: string, name: string) => FlareTemplate | null): { map: LoadedMap; unplaced: number } {
  if (!placed?.length) return { map, unplaced: 0 };
  const props = [...map.props];
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  let order = props.reduce((m, p) => Math.max(m, p.order), 0) + 1;
  let unplaced = 0;
  for (const f of placed) {
    const t = templateOf(f.source, f.name);
    if (!t) { unplaced++; continue; }
    const foreign = t.lib.archive !== map.archive;
    const rename = (name: string | null): string | null => (name === null || !foreign ? name : `${t.lib.archive}/${name}`);
    if (foreign) {
      for (const part of t.prop.parts) {
        const name = part.textureName;
        if (name === null) continue;
        const key = rename(name)!;
        if (t.lib.textures[name]) textures[key] = t.lib.textures[name]!;
        if (t.lib.textureFlags[name]) textureFlags[key] = t.lib.textureFlags[name]!;
        if (textureMips && t.lib.textureMips?.[name]) textureMips[key] = t.lib.textureMips[name]!;
      }
    }
    const matrices = IDENTITY.slice();
    matrices[12] = f.at[0]; matrices[13] = f.at[1]; matrices[14] = f.at[2];
    props.push({
      modelName: t.prop.modelName, order: order++, alternate: false, facade: t.prop.facade, lod: null, matrices,
      parts: t.prop.parts.map((part) => (foreign ? { ...part, textureName: rename(part.textureName) } : part)),
    });
  }
  return { map: { ...map, props, textures, textureFlags, ...(textureMips ? { textureMips } : {}) }, unplaced };
}
