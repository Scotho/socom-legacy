import type { LoadedMap } from '../../loadMap';
import { commonGroundSurface, importCollision, type Surface } from './collision';
import { importWorld } from './worldMesh';
import { medianTexelScale } from './texturing';

/**
 * A blank base's geometry (bug 17; a browser adaptation, after a level editor's new map, which models from nothing): the floor it
 * opens with is a plane of its own -- editable, displaceable, solid -- and what it looks and stands like is read off the
 * library map the blank base is built from, not chosen:
 * - no texture (the owner, 2026-11-17: "when I create an empty map, then go to geometry mode, the ground immediately gets a
 *   default texture. can we not set a default texture on the ground plane"): it is the map maker's to texture;
 * - its texel scale the library world's own density (`medianTexelScale`), so a texture laid by hand matches the map's;
 * - its surface the library hull's commonest walkable surface words (`commonGroundSurface`).
 */
export interface FloorLook { texture: string | null; texelScale: number | null; surface: Surface | null }

/** The look a blank base's floor takes from its library map. */
export function floorLookOf(lib: LoadedMap): FloorLook {
  const texture: string | null = null;
  const size = (n: string | null): readonly [number, number] | null => { const t = n ? lib.textures[n] : undefined; return t ? [t.width, t.height] : null; };
  const texelScale = lib.world.length ? medianTexelScale(importWorld(lib.world), size) : null;
  const surface = lib.ground ? commonGroundSurface(importCollision(lib.ground)) : null;
  return { texture, texelScale, surface };
}
