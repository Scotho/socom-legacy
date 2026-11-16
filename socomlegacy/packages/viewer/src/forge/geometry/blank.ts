import type { LoadedMap } from '../../loadMap';
import { commonGroundSurface, importCollision, type Surface } from './collision';
import { importWorld } from './worldMesh';
import { medianTexelScale } from './texturing';

/**
 * A blank base's geometry (bug 17; a browser adaptation, after Hammer's new map, which models from nothing): the floor it
 * opens with is a plane of its own -- editable, displaceable, solid -- and what it looks and stands like is read off the
 * library map the blank base is built from, not chosen:
 * - its texture the library world's most used ground texture (the most area on faces that look up);
 * - its texel scale the library world's own density (`medianTexelScale`), so a texture laid by hand matches the map's;
 * - its surface the library hull's commonest walkable surface words (`commonGroundSurface`).
 */
export interface FloorLook { texture: string | null; texelScale: number | null; surface: Surface | null }

/** The look a blank base's floor takes from its library map. */
export function floorLookOf(lib: LoadedMap): FloorLook {
  const area = new Map<string, number>();
  for (const d of lib.world) {
    const name = d.textureName;
    if (!name || !lib.textures[name] || !d.fog || d.alphaPass || d.vertexAlpha || d.alternate) continue;
    let sum = 0;
    for (let t = 0; t < d.indices.length / 3; t++) {
      const [a, b, c] = [d.indices[t * 3]!, d.indices[t * 3 + 1]!, d.indices[t * 3 + 2]!];
      const p = (i: number): [number, number, number] => [d.positions[i * 3]!, d.positions[i * 3 + 1]!, d.positions[i * 3 + 2]!];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const len = Math.hypot(n[0]!, n[1]!, n[2]!);
      // Ground: a face that looks up (either winding: the disc's floors face up, but a two-sided draw may not).
      if (len > 0 && Math.abs(n[1]!) / len > 0.8) sum += len / 2;
    }
    if (sum > 0) area.set(name, (area.get(name) ?? 0) + sum);
  }
  let texture: string | null = null, best = 0;
  for (const [name, a] of area) if (a > best) { best = a; texture = name; }
  const size = (n: string | null): readonly [number, number] | null => { const t = n ? lib.textures[n] : undefined; return t ? [t.width, t.height] : null; };
  const texelScale = lib.world.length ? medianTexelScale(importWorld(lib.world), size) : null;
  const surface = lib.ground ? commonGroundSurface(importCollision(lib.ground)) : null;
  return { texture, texelScale, surface };
}
