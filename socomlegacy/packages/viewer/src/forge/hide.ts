import type { CollisionOwner, WorldPoly } from '@s2u/scene';
import type { DoorSpec } from '../doors';
import type { LoadedMap } from '../loadMap';
import { groundPolygons, packGround, type GroundData } from '../mover';
import { placementKey } from './layout';
import { isWorldFacadeProp } from '../worldFacadeProps';

/**
 * FORGE (FG-17; the owner, 2026-10-13: "manipulating the existing props where possible by effectively hiding them on
 * the requested maps"; a browser adaptation, no original): a base map's own placement hidden in a layout. It is named
 * by `placementKey` (model and place), found among the map's props as `<prop entry>:<placement>` (the key `world.ts`
 * files each placement's switch under), and taken out of what draws and what stands: the match's props, the hull.
 */

export interface Placement { prop: number; index: number; key: string }

const KEY_OF = (model: string, m: ArrayLike<number>, at = 0): string => placementKey(model, m[at + 12]!, m[at + 13]!, m[at + 14]!);

/** The placement of `model` at the matrix `m` (its place, whole units), or null when the map makes none there. */
export function placementOf(map: Pick<LoadedMap, 'props'>, model: string, m: ArrayLike<number>): Placement | null {
  const key = KEY_OF(model, m);
  for (const [prop, p] of map.props.entries()) {
    if (p.modelName !== model || isWorldFacadeProp(p)) continue;   // FACADES-2: the world's own facade nodes are not a base prop
    for (let i = 0; i < p.matrices.length / 16; i++) if (KEY_OF(model, p.matrices, i * 16) === key) return { prop, index: i, key };
  }
  return null;
}

/** The hidden keys as `<prop entry>:<placement>` (every entry of a model at that place: a LOD pair's both copies). */
export function placementsOf(map: Pick<LoadedMap, 'props'>, keys: Iterable<string>): Set<string> {
  const want = new Set(keys);
  const out = new Set<string>();
  if (want.size === 0) return out;
  for (const [prop, p] of map.props.entries()) {
    if (isWorldFacadeProp(p)) continue;   // FACADES-2: as the server's `archiveParts`, which reads none
    for (let i = 0; i < p.matrices.length / 16; i++) if (want.has(KEY_OF(p.modelName, p.matrices, i * 16))) out.add(`${prop}:${i}`);
  }
  return out;
}

/**
 * FG-36 (FG-32's report; a browser adaptation): the map's line strips without the hidden placements' own -- each line
 * group's spans (`LoadedLineGroup.spans`, by the walk they are filed under: the placement's place in the walk,
 * `LoadedMap.props[].walk`, or for a strips-only node its placement's entry's, LATER 141) dropped from its
 * arrays and the kept spans renumbered; a group left with no point goes. The world's own strips (no span) stay. The
 * loaded map is not touched; with nothing hidden, or no lines, the map's own is returned.
 */
export function linesWithout(map: Pick<LoadedMap, 'props' | 'lines'>, hidden: ReadonlySet<string>): LoadedMap['lines'] {
  if (hidden.size === 0 || !map.lines) return map.lines;
  const walks = new Set<number>();
  for (const key of hidden) {
    const [prop, index] = key.split(':').map(Number) as [number, number];
    const w = map.props[prop]?.walk?.[index];
    if (w !== undefined) walks.add(w);
  }
  if (walks.size === 0) return map.lines;
  const out: NonNullable<LoadedMap['lines']> = [];
  for (const g of map.lines) {
    const drop = (g.spans ?? []).filter((sp) => walks.has(sp.walk));
    if (drop.length === 0) { out.push(g); continue; }
    const points = g.positions.length / 3;
    const keep = new Uint8Array(points).fill(1);
    for (const sp of drop) keep.fill(0, sp.first, sp.first + sp.count);
    const kept = keep.reduce((n, k) => n + k, 0);
    if (kept === 0) continue;
    const take = (a: Float32Array): Float32Array => {
      const stride = a.length / points;
      const b = new Float32Array(kept * stride);
      let j = 0;
      for (let i = 0; i < points; i++) if (keep[i]) { b.set(a.subarray(i * stride, i * stride + stride), j * stride); j++; }
      return b;
    };
    // A kept span moves down by the points dropped before it.
    const before = (first: number): number => { let n = 0; for (let i = 0; i < first; i++) n += keep[i] ? 0 : 1; return n; };
    const spans = (g.spans ?? []).filter((sp) => !walks.has(sp.walk)).map((sp) => ({ ...sp, first: sp.first - before(sp.first) }));
    out.push({ ...g, positions: take(g.positions), uvs: take(g.uvs), colors: take(g.colors), normals: take(g.normals), ...(spans.length ? { spans } : { spans: [] }) });
  }
  return out;
}

/** The map's props without the hidden placements (an entry left with none goes); the loaded map is not touched. */
export function propsWithout(map: Pick<LoadedMap, 'props'>, hidden: ReadonlySet<string>): LoadedMap['props'] {
  if (hidden.size === 0) return map.props;
  const out: LoadedMap['props'] = [];
  for (const [prop, p] of map.props.entries()) {
    const keep: number[] = [];
    for (let i = 0; i < p.matrices.length / 16; i++) if (!hidden.has(`${prop}:${i}`)) keep.push(i);
    if (keep.length === p.matrices.length / 16) { out.push(p); continue; }
    if (keep.length === 0) continue;
    const matrices = new Float32Array(keep.length * 16);
    keep.forEach((i, k) => matrices.set(p.matrices.subarray(i * 16, i * 16 + 16), k * 16));
    const { cells, paths, walk, ...rest } = p;
    out.push({
      ...rest, matrices, ...(cells ? { cells: keep.map((i) => cells[i]!) } : {}), ...(paths ? { paths: keep.map((i) => paths[i]!) } : {}),
      ...(walk ? { walk: keep.map((i) => walk[i]!) } : {}),
    });
  }
  return out;
}

/**
 * FG-31: every placement of `model` (on `path` when given) as `{ prop, index }`, in the scene walk's order -- the order
 * the hull's owners follow. The page's entries are draw groups (`LoadedMap.props`: a model split by node, lighting,
 * state and shade), so one path's placements can sit in several entries in an order unlike the walk's; each carries its
 * place in the walk (`walk`, the loader's) and is ordered by it. An entry without one (the server's `archiveParts`,
 * one entry a model already in the walk's order; a synthetic map) is taken in the entries' order, then its own.
 */
export function walkOrder(map: Pick<LoadedMap, 'props'>, model: string, path?: string): { prop: number; index: number }[] {
  const out: { prop: number; index: number; walk: number | undefined }[] = [];
  for (const [prop, q] of map.props.entries()) {
    if (q.modelName !== model || !q.paths) continue;
    q.paths.forEach((qp, index) => { if (path === undefined || qp === path) out.push({ prop, index, walk: q.walk?.[index] }); });
  }
  if (out.every((o) => o.walk !== undefined)) out.sort((a, b) => a.walk! - b.walk!);   // stable: the entries' order on a tie
  return out.map(({ prop, index }) => ({ prop, index }));
}

/**
 * The hull without the hidden placements' own polygons: each placement's owners are those at or under its path, and a
 * path every placement of a prototype names is shared out in walk order (the placement k-th among those of its path in
 * the walk, `walkOrder`, takes the k-th equal share), as `./ground` `prototypePolygons` reads it. The loaded ground is
 * not touched.
 */
/**
 * The hull's owners a placement (`<prop entry>:<placement>`) holds -- its own collision, what hiding it takes out of the
 * hull (`groundWithout`). None where the disc files the placement's polygons under no node of its own: a prop with no
 * collision, or one whose collision is baked into the world's (the owner, 2026-11-06: the Delete's warning).
 */
export function placementOwners(map: Pick<LoadedMap, 'props'>, ground: GroundData, key: string): CollisionOwner[] {
  const [prop, index] = key.split(':').map(Number) as [number, number];
  const p = map.props[prop];
  const path = p?.paths?.[index];
  if (!p || !path) return [];
  const eq = path.lastIndexOf('='), slash = path.lastIndexOf('/');
  const own = eq > slash ? `${path.slice(0, eq)}/` : null;
  const owners = ground.owners.filter((o) => o.count > 0 && !o.switchedOff && (o.path === path || o.path.startsWith(`${path}/`) || (own !== null && o.path.startsWith(own))));
  if (owners.length === 0) return [];
  const order = walkOrder(map, p.modelName, path);
  const k = order.findIndex((o) => o.prop === prop && o.index === index), n = order.length;
  const share = n > 1 && owners.length % n === 0 ? owners.length / n : owners.length;
  return n > 1 && owners.length % n === 0 ? owners.slice(k * share, k * share + share) : owners;
}

export function groundWithout(map: Pick<LoadedMap, 'props'>, ground: GroundData, hidden: ReadonlySet<string>): GroundData {
  if (hidden.size === 0) return ground;
  const drop = new Set<CollisionOwner>();
  for (const key of hidden) {
    const [prop, index] = key.split(':').map(Number) as [number, number];
    const p = map.props[prop];
    const path = p?.paths?.[index];
    if (!p || !path) continue;
    // A placement drawn as an instance's model (`flattenScene`'s `node=model` path) also owns the instance node's own
    // children: R4B-09's MP72 crate caps, `AddChild`ed to the crate (r4 0x2d719c; research 383). None on the disc as read.
    const eq = path.lastIndexOf('='), slash = path.lastIndexOf('/');
    const own = eq > slash ? `${path.slice(0, eq)}/` : null;
    // LATER 707 (review 1's F1): an owner switched off at load (r0004's, `CollisionOwner.switchedOff`) has no drawn
    // placement -- the draw's gate drops it (`placeInstances`) -- so it is no placement's share.
    const owners = ground.owners.filter((o) => o.count > 0 && !o.switchedOff && (o.path === path || o.path.startsWith(`${path}/`) || (own !== null && o.path.startsWith(own))));
    if (owners.length === 0) continue;
    // This placement's place among every placement of its path, across the map's entries of its model, in walk order.
    const order = walkOrder(map, p.modelName, path);
    const k = order.findIndex((o) => o.prop === prop && o.index === index), n = order.length;
    const share = n > 1 && owners.length % n === 0 ? owners.length / n : owners.length;
    const mine = n > 1 && owners.length % n === 0 ? owners.slice(k * share, k * share + share) : owners;
    for (const o of mine) drop.add(o);
  }
  if (drop.size === 0) return ground;
  const all = groundPolygons(ground);
  const polys = [];
  const owners: CollisionOwner[] = [];
  for (const o of ground.owners) {
    if (drop.has(o)) continue;
    owners.push({ ...o, first: polys.length });
    for (let i = o.first; i < o.first + o.count; i++) polys.push(all[i]!);
  }
  return packGround(ground.grid, polys, owners);
}

/**
 * The base's doors over the hull with its hidden placements taken out: a door names its polygons by index into the
 * hull's owners (`DoorSpec.owners`), and `groundWithout` packs the owners left anew, so each index is moved to its
 * owner's new place and an owner hidden is dropped from the door's list (the door itself kept: its number is the wire's).
 * The owners left keep their order; each is matched by its path, its count and its first point.
 * FG-31: moved here from the server's `forgeSimMap.ts` so the page's Play (`./matchMap` `composeMatchMap`) and the
 * server's room remap alike. `after` may carry owners past the base's (`./ground` `layoutGround` appends the pieces'
 * after them, keeping the base's owners, order and first points as they were): a piece's owner (`forge/piece_<i>`) never
 * matches a base owner's path, so no door is moved onto one.
 */
export function doorsAfter(before: GroundData, after: GroundData, doors: readonly DoorSpec[]): DoorSpec[] {
  if (before === after || doors.length === 0) return [...doors];
  const polysBefore = groundPolygons(before), polysAfter = groundPolygons(after);
  const sign = (polys: WorldPoly[], o: GroundData['owners'][number]): string => {
    const p = polys[o.first]?.points;
    return `${o.path}|${o.count}|${p ? `${p[0]},${p[1]},${p[2]}` : ''}`;
  };
  const moved = new Map<number, number>();
  let j = 0;
  before.owners.forEach((o, i) => {
    const next = after.owners[j];
    if (next && sign(polysBefore, o) === sign(polysAfter, next)) { moved.set(i, j); j++; }
  });
  return doors.map((d) => ({ ...d, owners: d.owners.flatMap((i) => (moved.has(i) ? [moved.get(i)!] : [])) }));
}
