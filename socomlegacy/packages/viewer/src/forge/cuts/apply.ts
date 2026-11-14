import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, WorldPoly } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../../loadMap';
import { under } from '../../mapMeta';
import { groundPolygons, packGround } from '../../mover';
import { propsWithout } from '../hide';
import type { CutMarker } from '../layout';
import { cutCaps } from './caps';
import { placedDoorCuts } from './doors';
import { freeCutBox } from './free';
import { cutMesh, cutPolygon, ownerMoves, reachesAny, worldPart, type CutBox } from './geometry';
import { LINING_PATH, PLACED_DOOR_PATH, PLACED_REVEAL_NODE } from './names';

/**
 * FORGE CUTS, applied to a map (a browser adaptation, FG.R2): the step Play's composition takes after the placed doors
 * (`../composeLayout`), and the one a lobby's room must take the same way so its hull agrees with the page's.
 *
 * - The world's chunks: cut in place (`cutMesh`). A placed door's own doorway lining is never cut.
 * - The props and the placed pieces: a placement that reaches a cut is drawn as world chunks (its parts by its matrix,
 *   its node path kept for the world's state) with theirs cut, the placement itself left out (`../hide`
 *   `propsWithout`). One on a moving node (a door's, a gate's), turned to the camera, banded by range, or an alternate
 *   state keeps its own draw, uncut.
 * - The hull: every static polygon cut, its owner's range re-based on the pieces. A moving owner's (a door's leaf, a
 *   gate, a hook) and the placed doors' own leaves and frames are never cut.
 * - Each hole is lined across the wall's thickness (`./caps`), its hull under an owner of its own (`LINING_PATH`): the
 *   grid files a polygon only by its owner (`@s2u/scene` `buildGrid`), so an ownerless one would stop and carry no one.
 */

/** `map` with `boxes` cut out of it (see the header); `cut` how many draws and hulls changed, the map itself when none. */
export function withCuts(map: LoadedMap, boxes: readonly CutBox[]): { map: LoadedMap; cut: number } {
  if (!boxes.length) return { map, cut: 0 };
  const caps = cutCaps(map, boxes);
  let cut = 0;
  const world = map.world.map((m) => {
    if (m.node && PLACED_REVEAL_NODE.test(m.node)) return m;
    const c = cutMesh(m, boxes);
    if (c !== m) cut++;
    return c;
  });
  const moving = [...(map.doors ?? []).map((d) => d.path), ...(map.gates ?? []).map((g) => g.path)];
  const hidden = new Set<string>();
  const baked: LoadedMesh[] = [];
  const tmp = new Vector3();
  map.props.forEach((prop, pi) => {
    if (prop.facade || prop.lod || prop.alternate) return;
    for (let i = 0; i < prop.matrices.length / 16; i++) {
      const path = prop.paths?.[i];
      if (path && (PLACED_DOOR_PATH.test(path) || moving.some((m) => under(path, m)))) continue;
      const m = new Matrix4().fromArray(Array.from(prop.matrices.subarray(i * 16, i * 16 + 16)));
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const part of prop.parts) for (let v = 0; v < part.positions.length; v += 3) {
        tmp.set(part.positions[v]!, part.positions[v + 1]!, part.positions[v + 2]!).applyMatrix4(m);
        [tmp.x, tmp.y, tmp.z].forEach((x, k) => { min[k] = Math.min(min[k]!, x); max[k] = Math.max(max[k]!, x); });
      }
      if (!reachesAny(boxes, min, max)) continue;
      const placed = prop.parts.map((part) => worldPart(part, m, prop.order, prop.cells?.[i], path));
      const cutParts = placed.map((part) => cutMesh(part, boxes));
      if (cutParts.every((c, k) => c === placed[k])) continue;
      hidden.add(`${pi}:${i}`);
      baked.push(...cutParts);
      cut++;
    }
  });
  const props = hidden.size ? propsWithout(map, hidden) : map.props;
  let ground = map.ground;
  if (map.ground) {
    const polys = groundPolygons(map.ground);
    const count = polys.length;
    const ownerOf: (CollisionOwner | undefined)[] = new Array(count);
    for (const o of map.ground.owners) for (let i = o.first; i < Math.min(count, o.first + o.count); i++) ownerOf[i] = o;
    const out: WorldPoly[] = [];
    const start: number[] = new Array(count + 1);
    let touched = false;
    polys.forEach((poly, i) => {
      start[i] = out.length;
      const owner = ownerOf[i];
      const pieces = ownerMoves(owner) || (owner && PLACED_DOOR_PATH.test(owner.path)) ? null : cutPolygon(poly.points, boxes);
      if (pieces === null) { out.push(poly); return; }
      touched = true;
      for (const pts of pieces) out.push({ ...poly, points: pts, ptcount: pts.length / 3 });
    });
    start[count] = out.length;
    const lining = caps.polys.length ? { modelName: 'worldmodel', path: LINING_PATH, first: out.length, count: caps.polys.length } : null;
    if (lining) { out.push(...caps.polys.map((p) => ({ ...p, modelName: 'worldmodel', path: LINING_PATH }))); touched = true; }
    if (touched) {
      cut++;
      const owners = map.ground.owners.map((o) => {
        const first = start[Math.min(o.first, count)]!;
        return { ...o, first, count: start[Math.min(count, o.first + o.count)]! - first };
      });
      ground = packGround(map.ground.grid, out, lining ? [...owners, lining] : owners);
    }
  }
  if (!cut) return { map, cut: 0 };
  return { map: { ...map, world: [...world, ...baked, ...caps.meshes], props, ...(ground ? { ground } : {}) }, cut };
}

/** `map` with its placed doors' openings and the layout's free cuts cut out: Play's step (`../composeLayout`). */
export function withLayoutCuts(map: LoadedMap, cuts: readonly CutMarker[] | undefined): { map: LoadedMap; cut: number } {
  return withCuts(map, [...placedDoorCuts(map), ...(cuts ?? []).map(freeCutBox)]);
}
