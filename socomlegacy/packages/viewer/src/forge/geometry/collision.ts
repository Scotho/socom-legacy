import type { CollisionOwner, GridParams } from '@s2u/scene';
import { packGround, type GroundData } from '../../mover';
import { displacementGrid } from './displacement';
import { dot, facePoints, liveFaces, polygonNormal, triangulate, type EditMesh, type Vec3 } from './editMesh';

/**
 * The hull as its own editable layer. The original's collision is separate data from its draws (`GroundData`: the
 * probe's polygons, `worldCollision` order, with their surface words and owners), so it is imported verbatim -- an
 * untouched layer packs back to the very `GroundData` it came from -- and edited on its own, as a level editor's collision is.
 * Geometry made by hand gets a hull from its faces (`hullOfMesh`, a browser adaptation: the original's tools built its
 * hulls by a process not known here).
 */

/** A polygon's surface words, as `packGround` carries them: ditype, material, cameratype, region, app flags (bits 0-2, inside 3, reverb 4). */
export type Surface = [ditype: number, material: number, cameratype: number, region: number, flags: number];

export interface HullPoly { points: Vec3[]; surface: Surface; owner: number }

export interface CollisionMesh {
  grid: GridParams;
  /** The owners, in order; a polygon's `owner` indexes them, -1 for none. `first`/`count` are rewritten by the pack. */
  owners: CollisionOwner[];
  polys: HullPoly[];
  /** FLE-2 (ours; 21331326d7): the map's default soil (`GroundData.defaultMaterial`), carried to the packed ground. */
  defaultMaterial?: number;
}

const FIELDS = 6;

/** A map's hull as an editable layer, polygon for polygon. */
export function importCollision(ground: GroundData): CollisionMesh {
  const count = ground.fields.length / FIELDS;
  const ownerOf = new Int32Array(count).fill(-1);
  ground.owners.forEach((o, oi) => { for (let i = o.first; i < Math.min(count, o.first + o.count); i++) ownerOf[i] = oi; });
  const polys: HullPoly[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const f = i * FIELDS, n = ground.fields[f]!;
    const points: Vec3[] = [];
    for (let k = 0; k < n; k++) points.push([ground.points[at + k * 3]!, ground.points[at + k * 3 + 1]!, ground.points[at + k * 3 + 2]!]);
    at += n * 3;
    polys.push({ points, surface: [ground.fields[f + 1]!, ground.fields[f + 2]!, ground.fields[f + 3]!, ground.fields[f + 4]!, ground.fields[f + 5]!], owner: ownerOf[i]! });
  }
  return { grid: ground.grid, owners: ground.owners.map((o) => ({ ...o })), polys,
    ...(ground.defaultMaterial !== undefined ? { defaultMaterial: ground.defaultMaterial } : {}) };
}

/**
 * The layer packed for the walk. Polygons keep their order; each owner's run is where its polygons stand, so an owner
 * whose polygons are not one run is refused (an edit appends a polygon after its owner's last: `addHullPolys`).
 */
export function packCollision(c: CollisionMesh): GroundData {
  const first = new Map<number, number>(), count = new Map<number, number>();
  c.polys.forEach((p, i) => {
    if (p.owner < 0) return;
    if (!first.has(p.owner)) first.set(p.owner, i);
    else if (first.get(p.owner)! + count.get(p.owner)! !== i) throw new Error(`collision owner ${p.owner}'s polygons are not one run`);
    count.set(p.owner, (count.get(p.owner) ?? 0) + 1);
  });
  const owners = c.owners.map((o, oi) => ({ ...o, first: first.get(oi) ?? o.first, count: count.get(oi) ?? 0 }));
  // `packGround` reads the words as a `WorldPoly`'s fields; the sixth splits back into app flags, inside, reverb.
  const ground = packGround(c.grid, c.polys.map((p) => ({
    modelName: '', path: '', ptcount: p.points.length, ditype: p.surface[0], material: p.surface[1], cameratype: p.surface[2], region: p.surface[3],
    appflags: p.surface[4] & 7, inside: (p.surface[4] >> 3) & 1, reverbZone: (p.surface[4] >> 4) & 1, points: Float32Array.from(p.points.flat()),
  })), owners, c.defaultMaterial);   // FLE-2 (ours): the map's default soil
  // The flag word's bits past the reverb zone, which the split above drops, go back as they were read.
  c.polys.forEach((p, i) => { ground.fields[i * FIELDS + 5] = p.surface[4] >>> 0; });
  return ground;
}

/** Adds polygons under `owner` (a new one when absent), after its last. Returns the owner's index. */
export function addHullPolys(c: CollisionMesh, polys: readonly Omit<HullPoly, 'owner'>[], owner: number | CollisionOwner): number {
  let oi: number;
  if (typeof owner === 'number') oi = owner;
  else { c.owners.push({ ...owner, first: c.polys.length, count: 0 }); oi = c.owners.length - 1; }
  let at = -1;
  c.polys.forEach((p, i) => { if (p.owner === oi) at = i; });
  const add = polys.map((p) => ({ ...p, owner: oi }));
  if (at < 0) c.polys.push(...add); else c.polys.splice(at + 1, 0, ...add);
  return oi;
}

/** Removes every polygon of `owner` (an object's hull rebuilt). */
export function clearOwner(c: CollisionMesh, owner: number): void {
  c.polys = c.polys.filter((p) => p.owner !== owner);
}

/** Removes polygons whose every point lies in the box (clearing the hull under a region rebuilt by hand). */
export function clearHullInBox(c: CollisionMesh, min: readonly number[], max: readonly number[]): number {
  const before = c.polys.length;
  const inBox = (p: Vec3): boolean => p.every((x, k) => x >= min[k]! && x <= max[k]!);
  c.polys = c.polys.filter((p) => !p.points.every(inBox));
  return before - c.polys.length;
}

/**
 * The hull a mesh's faces make, on `surface` -- one set of words for all, or each polygon's own (`surfaceMatcher`): a
 * face flat and convex is one polygon, as it is drawn (the Forge's owner (crispy, OT.R112), 2026-11-15: a box's collision "triangles, but the
 * objects faces are quads ... make them the same"; the disc's hull is mostly such polygons -- of Crossroads' 9,838, 6,544
 * quads, 2,999 triangles, the rest up to 12 corners); a face bent out of its plane, or concave, its drawn triangles; a
 * displacement its grid's triangles. The probe's walls and floors read a polygon's winding and plane as the draw's.
 */
export function hullOfMesh(m: EditMesh, surface: Surface | ((tri: readonly Vec3[]) => Surface), faces: readonly number[] = liveFaces(m)): Omit<HullPoly, 'owner'>[] {
  const out: Omit<HullPoly, 'owner'>[] = [];
  const words = (tri: Vec3[]): Surface => (typeof surface === 'function' ? surface(tri) : [...surface] as Surface);
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    if (face.disp) {
      const g = displacementGrid(m, f);
      for (const [a, b, c] of g.triangles) { const tri = [g.points[a]!, g.points[b]!, g.points[c]!]; out.push({ points: tri, surface: words(tri) }); }
      continue;
    }
    const ps = facePoints(m, f);
    if (ps.length > 3 && flatConvex(ps)) { const poly = ps.map((p) => [...p] as Vec3); out.push({ points: poly, surface: words(poly) }); continue; }
    for (const [a, b, c] of triangulate(ps)) { const tri = [ps[a]!, ps[b]!, ps[c]!]; out.push({ points: tri, surface: words(tri) }); }
  }
  return out;
}

/** A face's points all on one plane (within `FLAT`) and turning one way round it: a polygon the hull holds whole. */
const FLAT = 0.01;
function flatConvex(ps: readonly Vec3[]): boolean {
  const n = polygonNormal(ps);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return false;
  const d = n[0] * ps[0]![0] + n[1] * ps[0]![1] + n[2] * ps[0]![2];
  for (const p of ps) if (Math.abs(n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d) / len > FLAT) return false;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!, b = ps[(i + 1) % ps.length]!, c = ps[(i + 2) % ps.length]!;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const x = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (x[0]! * n[0] + x[1]! * n[1] + x[2]! * n[2] < -1e-9) return false;    // a turn the other way: concave
  }
  return true;
}

/** A triangle within this distance of a disc polygon's plane (units), and inside its box grown by it, lies on it. */
const ON_PLANE = 0.5;
/** A triangle facing within this of a disc polygon's plane (|cos|, either winding) lies along it. */
const ALONG = 0.98;
/** A triangle facing up at least this much (its normal's y, the draw's outward winding) is a floor where no disc polygon says. */
const FLOOR_UP = 0.7;

/** The commonest surface words among `polys` that `keep` takes, or null. */
function commonest(polys: readonly HullPoly[], keep: (s: Surface) => boolean): Surface | null {
  const tally = new Map<string, { s: Surface; n: number }>();
  for (const p of polys) {
    if (!keep(p.surface)) continue;
    const k = p.surface.join(',');
    const e = tally.get(k);
    if (e) e.n++; else tally.set(k, { s: p.surface, n: 1 });
  }
  let best: { s: Surface; n: number } | null = null;
  for (const e of tally.values()) if (!best || e.n > best.n) best = e;
  return best ? [...best.s] as Surface : null;
}

/** Surface words the ground probe stands on: ditype bit 0 (`@s2u/scene` `SURFACE_GROUND`). */
export const isGroundWords = (s: Surface): boolean => (s[0] & 1) === 1;

/**
 * Bug 16 (a browser adaptation, FG.R2: how the original's tools gave a hull its words is not known): a reshaped node's
 * rebuilt hull, its surface words a triangle at a time, from the node's own disc polygons (`polys`) -- a triangle lying
 * on one (along its plane, inside its box) takes its words, so a floor keeps the floor's and a wall the wall's, with
 * their materials; a triangle on none (moved, or new) takes the node's commonest floor words when it faces up, its
 * commonest wall words when not. One word for all (the node's commonest, a wall's on a building: MP72's b2_wc03, 2,22)
 * left the floors no ground: no spawn there, and the walk stopped at its edge.
 */
export function surfaceMatcher(polys: readonly HullPoly[], fallbackGround: Surface | null = null): (tri: readonly Vec3[]) => Surface {
  const planes = polys.flatMap((p) => {
    if (p.points.length < 3) return [];
    const n = polygonNormal(p.points);
    if (!(Math.hypot(n[0], n[1], n[2]) > 0.5)) return [];
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const q of p.points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, q[k]!); max[k] = Math.max(max[k]!, q[k]!); }
    return [{ n, d: dot(n, p.points[0]!), min, max, s: p.surface }];
  });
  const any = commonest(polys, () => true);
  const ground = commonest(polys, isGroundWords) ?? fallbackGround ?? any;
  // A node of floors alone (a terrain section) has no wall words: a wall on its ground's material, as `../hullGeometry`
  // `wordsOf` and `floorOrWall` make one -- not a floor's (the Forge's owner (crispy, OT.R112), 2026-11-17: an extrude's sides read "Floor").
  const side = commonest(polys, (s) => !isGroundWords(s)) ?? (ground ? wallWordsOf(ground) : any);
  return (tri) => {
    const n = polygonNormal(tri);
    const c: Vec3 = [(tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3, (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3, (tri[0]![2] + tri[1]![2] + tri[2]![2]) / 3];
    let best: Surface | null = null, bestD = ON_PLANE;
    for (const p of planes) {
      if (Math.abs(dot(n, p.n)) < ALONG) continue;
      const dist = Math.abs(dot(p.n, c) - p.d);
      if (dist > bestD) continue;
      if (c[0] < p.min[0] - ON_PLANE || c[0] > p.max[0] + ON_PLANE || c[1] < p.min[1] - ON_PLANE || c[1] > p.max[1] + ON_PLANE
        || c[2] < p.min[2] - ON_PLANE || c[2] > p.max[2] + ON_PLANE) continue;
      best = p.s; bestD = dist;
    }
    const s = best ?? (n[1] >= FLOOR_UP ? ground : side) ?? ([3, 0, 0, 0, 0] as Surface);
    return [...s] as Surface;
  };
}

/** The map's commonest surface words among its walkable ground (ditype 3): what a hand-made hull stands on by default, read off the map. */
export function commonGroundSurface(c: CollisionMesh): Surface | null {
  const tally = new Map<string, { s: Surface; n: number }>();
  for (const p of c.polys) {
    if (p.surface[0] !== 3) continue;
    const k = p.surface.join(',');
    const e = tally.get(k);
    if (e) e.n++; else tally.set(k, { s: p.surface, n: 1 });
  }
  let best: { s: Surface; n: number } | null = null;
  for (const e of tally.values()) if (!best || e.n > best.n) best = e;
  return best ? [...best.s] as Surface : null;
}

/**
 * A made face stands as a floor when its normal's up is at least this, else it is a wall (the Forge's owner (crispy, OT.R112), 2026-11-17: "when
 * creating the collision for the shapes, can you try to properly add wall collision for walls and floor for floors"; a
 * browser adaptation, FG.R2: the editor's own split, `../hullGeometry` `wordsOf` alike).
 */
export const FLOOR_NORMAL_Y_MIN = 0.7;

/** `s`'s wall words: `ditype` 2 (the column probe's only: blocks, never stood on), its material and region kept, no climb, not pass-through. */
export const wallWordsOf = (s: Surface): Surface => [2, s[1], s[2] & ~1, s[3], s[4] & ~7];
/** `s`'s floor words: `s` itself when it is ground words, else `ditype` 3 on its material and region. */
export const floorWordsOf = (s: Surface): Surface => ((s[0] & 1) === 1 ? [...s] as Surface : [3, s[1], s[2] & ~1, s[3], s[4] & ~7]);

/** A solid object's words by each face's facing: a floor's (`floorWordsOf`) facing up, a wall's (`wallWordsOf`) else. */
export function floorOrWall(s: Surface): (tri: readonly Vec3[]) => Surface {
  const floor = floorWordsOf(s), wall = wallWordsOf(s);
  return (tri) => {
    const n = polygonNormal(tri);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return [...(n[1] / len >= FLOOR_NORMAL_Y_MIN ? floor : wall)] as Surface;
  };
}
