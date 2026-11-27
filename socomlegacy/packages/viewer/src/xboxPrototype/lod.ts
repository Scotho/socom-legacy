import { Vector3 } from 'three';
import { lodIsLast, lodOpacity, scaledRangeSq, type LodBand } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';

export interface PrototypeLod { band: LodBand; at: Vector3; last: boolean }
/** Same placement grouping as world.ts: copies within 5 scene units share a spot.
 * This adapter reuses the current port's band rules, including its owner-approved
 * last-copy retention; it does not establish console parity for that deviation.
 * Only small numeric metadata survives upload, never a prop's geometry/matrices.
 */
export function lodPlacements(props: LoadedMap['props']): Map<LoadedMap['props'][number], PrototypeLod[]> {
  const byProp = new Map<LoadedMap['props'][number], PrototypeLod[]>();
  const all: PrototypeLod[] = [];
  for (const prop of props) {
    // world.ts constructs alternate LOD entries before visibility, but its
    // facade branch continues before LOD construction. Group the same entries.
    if (!prop.lod || prop.facade !== 0 || prop.parts.length === 0) continue;
    const entries: PrototypeLod[] = [];
    for (let i = 0; i < prop.matrices.length; i += 16) {
      const item = { band: prop.lod, at: new Vector3(prop.matrices[i + 12]!, prop.matrices[i + 13]!, prop.matrices[i + 14]!), last: false };
      entries.push(item); all.push(item);
    }
    byProp.set(prop, entries);
  }
  for (const item of all) item.last = lodIsLast(item.band,
    all.filter(other => other !== item && other.at.distanceToSquared(item.at) < 5 * 5).map(other => other.band));
  return byProp;
}

/** world.frame's camera range and magnification, using the existing scene helper. */
export function placementOpacity(lod: PrototypeLod | undefined, eye: Vector3, magnification: number): number {
  return lod ? lodOpacity(lod.band, scaledRangeSq(lod.at.distanceToSquared(eye), magnification), lod.last) : 1;
}
