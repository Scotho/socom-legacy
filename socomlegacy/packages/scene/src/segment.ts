import { polygonNormal, surfaceWord, SURFACE_SIDE, type WorldPoly } from './collision';
import { cellsCovering, type CollisionObject, type CollisionOwner, type Grid } from './grid';
import { modelGate, ALL_LAYERS } from './probe';

/**
 * A segment against the hull (web sprint 2, W2.1; W2.5's shot reuses it): the nearest polygon a segment crosses,
 * over the grid's collision owners in every cell the segment's ground-plane box covers.
 *
 * The engine's segment records are type 2 (`DAT_00416050 = 2` in `FUN_0029bf70`; the camera's four probes) and
 * run through the same `FUN_002d3030` loop the ground probe does (research 23 section 1.1): the model gate, then
 * the surfaces with bit 1 set (`(*(byte *)(surf + 8) & 2) != 0`, `FUN_002d2890` at decomp line 174845). Which count is
 * `DAT_0044d758`'s, which `FUN_002d4fd0` sets:
 *
 * - `0` (the movement's probes): a surface with bit 18 (`m_cameratype` bit 0) is skipped -- `SURFACE_SKIP`.
 * - `1` (the camera's probes when not peeking: `FUN_0029bf70` calls `FUN_002d4fd0(DAT_004161c0 == 0)`): a surface
 *   with **bit 19** (`m_cameratype` bit 1) is skipped instead (`((byte10 & 0xf) >> 2) & 2`: `FUN_002d2890` decomp
 *   174852, `FUN_002d3030` 175304; `FUN_002d4fd0` at 176016 is the setter) and the material's flag word
 *   (`0x44f358[m]`) is consulted -- so the bit-18 polygons the mover walks through reach the camera's probes. The
 *   main probe's picker `FUN_0029cd20` then passes over one whose `m_cameratype` is exactly 1 within 2.75 of the
 *   probe's start (the target): those stop the camera only further out (`playerCamera.ts`). `isCameraSurface` is
 *   the bit test. The material half (a VOLUMETRIC entry skipped, the raw byte, no `DefaultMaterial`) is
 *   `isCameraClassSurface` (`viewer/src/mover.ts`), which the camera pass and the headroom cast both pass
 *   (research 230 §3.4). `segmentHit`'s default still accepts every polygon.
 *
 * `FUN_002d4cc0` (decomp 175904) hands back the record's hit nearest its start (its loop over the hit list by
 * squared distance from `rec+4`); `segmentHit` returns that one, `segmentHits` the whole list nearest first, for a
 * picker of its own (`FUN_0029cd20`). The list here is every polygon crossed; the engine's keeps the first per model
 * in surface order (research 23 section 1.1) -- the same nearest hit, a shorter list [reading]. Polygons are taken as convex, as `probe.ts` takes them.
 */

/** Surface word bit 19 (`m_cameratype` bit 1): what the camera's probes skip (`DAT_0044d758 == 1`). */
export const CAMERA_SKIP = 1 << 19;

/** A surface the camera's segment probes test: bit 1 set, bit 19 clear (the header). */
export const isCameraSurface = (p: WorldPoly): boolean =>
  (surfaceWord(p) & (SURFACE_SIDE | CAMERA_SKIP)) === SURFACE_SIDE;

/** Where a segment first meets the hull. */
export interface SegmentHit {
  /** The crossing point, world space. */
  point: [number, number, number];
  /** How far along the segment, 0 at `a` and 1 at `b`. */
  t: number;
  /** The polygon's unit normal (as Newell's sum gives it: either side). */
  normal: [number, number, number];
  poly: WorldPoly;
  owner: CollisionOwner;
}

type V3 = readonly [number, number, number];

/** Whether `q` (on the polygon's plane) is inside the convex polygon, edges included, tested on the plane's widest projection. */
function inside(points: Float32Array, n: V3, q: V3): boolean {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  // Drop the normal's largest axis: (u, v) are the other two.
  const [iu, iv]: [0 | 1 | 2, 0 | 1 | 2] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
  const count = points.length / 3;
  let left = false, right = false;
  for (let i = 0; i < count; i++) {
    const a = i * 3, b = ((i + 1) % count) * 3;
    const eu = points[b + iu]! - points[a + iu]!, ev = points[b + iv]! - points[a + iv]!;
    const cross = eu * (q[iv] - points[a + iv]!) - ev * (q[iu] - points[a + iu]!);
    if (cross > 1e-7) left = true;
    else if (cross < -1e-7) right = true;
    if (left && right) return false;
  }
  return true;
}

/**
 * LATER 250's review F1: the hull test's own sides (micro 290-321 under the side mode 0x20; research 281 §4.3): the raw
 * normal `(p2 - p1) x (p0 - p1)` (micro 279-285, not normalised), each end's distance along it from the plane (taken at
 * `p1`), and an end "behind" only when that distance + 1e-5 is below 0 (the sign flags set at micro 311, masked at 315);
 * a hit needs the start not behind and the end behind.
 */
function frontSides(points: Float32Array, a: V3, d: V3): boolean {
  const p0x = points[0]!, p0y = points[1]!, p0z = points[2]!, p1x = points[3]!, p1y = points[4]!, p1z = points[5]!;
  const ux = points[6]! - p1x, uy = points[7]! - p1y, uz = points[8]! - p1z;  // p2 - p1
  const vx = p0x - p1x, vy = p0y - p1y, vz = p0z - p1z;                        // p0 - p1
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const start = nx * (a[0] - p1x) + ny * (a[1] - p1y) + nz * (a[2] - p1z);
  const end = nx * (a[0] + d[0] - p1x) + ny * (a[1] + d[1] - p1y) + nz * (a[2] + d[2] - p1z);
  return start + 1e-5 >= 0 && end + 1e-5 < 0;
}

/**
 * The segment's crossing of one polygon, as a fraction along a->b, or null. `frontOnly` (LATER 250): only a crossing from
 * in front of the polygon's own normal to behind it -- the hull's one-sided test (research 281 §4.3: `FUN_002d2890` gives a
 * hull collider, `+0x80` bit 1 clear (`FUN_00316e30` D:L215827-215828), the side mode 0x20 (D:L174831-174837), with which
 * the VU0 plane test hits only a start in front and an end behind; its normal micro 279-285, the sign `polygonNormal`
 * gives). A crossing has its ends on opposite sides, so `n . d < 0` is exactly a front entry. Its review's F1: the
 * micro's own sides (`frontSides`) -- an end exactly on the face is not behind, so no hit, where the two-sided test
 * counts it at t = 1.
 */
function crossing(poly: WorldPoly, n: V3 | null, a: V3, d: V3, frontOnly = false): number | null {
  if (n === null) return null;
  const denom = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
  if (Math.abs(denom) < 1e-12) return null;                                  // parallel: the plane is never crossed
  if (frontOnly && (denom > 0 || !frontSides(poly.points, a, d))) return null;   // LATER 250: entered from behind its normal
  const p = poly.points;
  const t = (n[0] * (p[0]! - a[0]) + n[1] * (p[1]! - a[1]) + n[2] * (p[2]! - a[2])) / denom;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  const q: V3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  return inside(p, n, q) ? Math.min(1, Math.max(0, t)) : null;
}

/**
 * CPS collision, 2026-11-03 (plan `2026-11-02-client-performance-sprint.md`, CPS.R9 (e)): `segmentHits` was 0.5 ms a frame
 * of self time in the 16-seat live cell, the eye's rays cast every rendered frame, and each polygon's normal was
 * recomputed on every call. A CPU-side browser adaptation with no original: the same hits in the same order. Each static
 * owner's normals are `polygonNormal`'s own results, computed once per collision object and kept beside its polygons
 * (index for index), so the floats are the ones the call computed before. A moving owner (`CollisionOwner.sweep`: a door,
 * a gate or a crane, whose points `doors.ts`, `gates.ts` and `cranes.ts` rewrite in place -- the only writers of a
 * polygon's points after the build) is never cached: its normals are computed per call as before, as the mover re-reads
 * such an owner's walls every step (`CollisionOwner.sweep`).
 */
interface OwnerCache {
  /** `polygonNormal(poly.points)` for each of the object's polygons, in its order. */
  normals: (V3 | null)[];
  /**
   * Step 2: a box holding every point any of the object's polygons can report a crossing at (`ownerReach`), or null when
   * one of them has a reach this does not bound (the object is then never pruned); `empty` when no polygon can cross.
   */
  reach: { lo: [number, number, number]; hi: [number, number, number]; empty: boolean } | null;
}
const ownerCaches = new WeakMap<CollisionObject, OwnerCache>();

/** `inside`'s tolerance on an edge's cross product: a point within it of an edge's line turns no side. */
const INSIDE_TOLERANCE = 1e-7;

/**
 * CPS collision step 2 (2026-11-03; the same adaptation): the box of every point at which `crossing` can accept a crossing
 * of this polygon, in world space, or null when this does not bound it. `inside` accepts a point within its tolerance
 * of an edge's line on the outer side, so the polygon's own box is not enough: a hit can lie just outside it.
 *
 * On the plane the test is taken in (the normal's largest axis dropped, as `inside` drops it), for a convex polygon with
 * every edge seeing the centre of its points more than four times the tolerance inside (so no point lies within the
 * tolerance of the outer side of every edge, the other arm of `inside`'s test -- the edges' outward normals, weighted by
 * their lengths, sum to zero, so some edge sees any point at least as far inside as the centre): a point that no edge
 * places more than the tolerance outside is within `reach` of the polygon, the largest over its corners of
 * `max(delta_i, delta_j) / cos(phi / 2)` -- `delta` an edge's tolerance as a distance (`2 x 1e-7 / |edge|`, twice for
 * the rounding), `phi` the turn between the corner's two edges (the nearest point of a convex polygon is on an edge,
 * where the distance is at most that edge's `delta`, or a corner, whose normal cone the turn bounds). Edges of no length
 * in the plane turn no side in `inside` and are left out. On the polygon's plane through its first point (`crossing`'s),
 * the third axis moves at most `(|n_u| + |n_v|) / |n_w| x reach` past its range over the corners. Anything else -- not
 * convex, a corner that turns back, a point or normal that is not finite -- is null: never pruned.
 */
function polygonReach(points: Float32Array, n: V3): { lo: [number, number, number]; hi: [number, number, number] } | null {
  if (!Number.isFinite(n[0]) || !Number.isFinite(n[1]) || !Number.isFinite(n[2])) return null;
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [iu, iv]: [0 | 1 | 2, 0 | 1 | 2] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
  const iw = (3 - iu - iv) as 0 | 1 | 2;
  const count = points.length / 3;
  const eu: number[] = [], ev: number[] = [], au: number[] = [], av: number[] = [], len: number[] = [];
  let cu = 0, cv = 0;
  for (let i = 0; i < count; i++) {
    const a = i * 3, b = ((i + 1) % count) * 3;
    const pu = points[a + iu]!, pv = points[a + iv]!;
    if (!Number.isFinite(pu) || !Number.isFinite(pv) || !Number.isFinite(points[a + iw]!)) return null;
    cu += pu; cv += pv;
    const du = points[b + iu]! - pu, dv = points[b + iv]! - pv;
    if (du === 0 && dv === 0) continue;                                       // no length: `inside`'s cross is 0
    eu.push(du); ev.push(dv); au.push(pu); av.push(pv); len.push(Math.hypot(du, dv));
  }
  const m = eu.length;
  if (m < 3) return null;
  cu /= count; cv /= count;
  let side = 0;
  for (let k = 0; k < m; k++) {
    const c = eu[k]! * (cv - av[k]!) - ev[k]! * (cu - au[k]!);
    if (side === 0) side = c < 0 ? -1 : 1;
    if (!(side * c > 4 * INSIDE_TOLERANCE)) return null;
    for (let j = 0; j < count; j++) {
      const qu = points[j * 3 + iu]!, qv = points[j * 3 + iv]!;
      if (side * (eu[k]! * (qv - av[k]!) - ev[k]! * (qu - au[k]!)) < 0) return null;   // not convex
    }
  }
  let reach = 0;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m;
    const half = Math.sqrt(Math.max(0, (1 + (eu[k]! * eu[j]! + ev[k]! * ev[j]!) / (len[k]! * len[j]!)) / 2));
    const delta = (2 * INSIDE_TOLERANCE) / Math.min(len[k]!, len[j]!);
    reach = Math.max(reach, delta / half);
  }
  if (!Number.isFinite(reach)) return null;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const slope = (Math.abs(n[iu]) + Math.abs(n[iv])) / Math.abs(n[iw]);
  for (let j = 0; j < count; j++) {
    const u = points[j * 3 + iu]!, v = points[j * 3 + iv]!;
    const w = points[iw]! - (n[iu] * (u - points[iu]!) + n[iv] * (v - points[iv]!)) / n[iw];   // the plane's, at (u, v)
    lo[iu] = Math.min(lo[iu], u); hi[iu] = Math.max(hi[iu], u);
    lo[iv] = Math.min(lo[iv], v); hi[iv] = Math.max(hi[iv], v);
    lo[iw] = Math.min(lo[iw], w, points[j * 3 + iw]!); hi[iw] = Math.max(hi[iw], w, points[j * 3 + iw]!);
  }
  lo[iu] -= reach; hi[iu] += reach; lo[iv] -= reach; hi[iv] += reach;
  lo[iw] -= slope * reach; hi[iw] += slope * reach;
  for (let k = 0; k < 3; k++) if (!Number.isFinite(lo[k]!) || !Number.isFinite(hi[k]!)) return null;
  return { lo, hi };
}

/** The rounding allowance on an owner's reach, a fraction of its largest coordinate (plus one): far above float64's. */
const REACH_SLACK = 1e-6;
/** How far past its ends the slab test takes the segment: `crossing` accepts t from -1e-9 to 1 + 1e-9. */
const SEGMENT_T_SLACK = 1e-6;

/**
 * The union of the object's polygons' reaches (`polygonReach`), widened by `REACH_SLACK` of its size for the rounding of
 * the crossing point and of the slab test; null when any polygon's is. A polygon with no normal crosses nothing.
 */
function ownerReach(polys: readonly WorldPoly[], normals: readonly (V3 | null)[]): OwnerCache['reach'] {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let empty = true;
  for (let i = 0; i < polys.length; i++) {
    const n = normals[i]!;
    if (n === null) continue;
    const r = polygonReach(polys[i]!.points, n);
    if (r === null) return null;
    empty = false;
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, r.lo[k]!); hi[k] = Math.max(hi[k]!, r.hi[k]!); }
  }
  if (empty) return { lo, hi, empty };
  let size = 0;
  for (let k = 0; k < 3; k++) size = Math.max(size, Math.abs(lo[k]!), Math.abs(hi[k]!));
  const slack = REACH_SLACK * (1 + size);
  for (let k = 0; k < 3; k++) { lo[k] = lo[k]! - slack; hi[k] = hi[k]! + slack; }
  return { lo, hi, empty };
}

/**
 * Whether the segment a + d t, t in [-SEGMENT_T_SLACK, 1 + SEGMENT_T_SLACK], misses the reach (the slab test). A NaN
 * never makes it miss; the caller passes only a finite segment.
 */
function missesReach(r: NonNullable<OwnerCache['reach']>, a: V3, d: V3): boolean {
  if (r.empty) return true;
  let t0 = -SEGMENT_T_SLACK, t1 = 1 + SEGMENT_T_SLACK;
  for (let k = 0; k < 3; k++) {
    const lo = r.lo[k]!, hi = r.hi[k]!, ak = a[k]!, dk = d[k]!;
    if (dk === 0) {
      if (ak < lo || ak > hi) return true;
      continue;
    }
    let ta = (lo - ak) / dk, tb = (hi - ak) / dk;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return true;
  }
  return false;
}

/** The object's cache, made on its first visit; null for a moving owner, which is never cached. */
function cacheOf(object: CollisionObject): OwnerCache | null {
  if (object.owner.sweep) return null;
  let c = ownerCaches.get(object);
  if (!c) {
    const normals = object.polys.map((p) => polygonNormal(p.points));
    c = { normals, reach: ownerReach(object.polys, normals) };
    ownerCaches.set(object, c);
  }
  return c;
}

/**
 * The nearest polygon the segment a->b crosses, or null: every collision owner linked into the cells the segment's
 * ground-plane box covers, gated (`modelGate`, all layers), its footprint against the segment's box, then each
 * polygon `accept` passes (every polygon by default; the camera passes `isCameraSurface`).
 */
export function segmentHit(
  grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean = () => true, layers: number = ALL_LAYERS,
): SegmentHit | null {
  return segmentHits(grid, a, b, accept, layers)[0] ?? null;
}

/** The pad on `segmentHits`' box reject: wider than `crossing`'s own tolerances (its t range, `inside`'s 1e-7). */
const BOX_PAD = 1e-3;
const polyBoxes = new WeakMap<WorldPoly, Float32Array>();
/** A static polygon's box (min x, y, z, max x, y, z), computed once. */
function polyBox(poly: WorldPoly): Float32Array {
  let b = polyBoxes.get(poly);
  if (b) return b;
  const p = poly.points;
  b = Float32Array.from([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k]!, p[i + k]!); b[k + 3] = Math.max(b[k + 3]!, p[i + k]!); }
  }
  polyBoxes.set(poly, b);
  return b;
}

/**
 * Every polygon the segment a->b crosses, nearest `a` first (`segmentHit`'s candidates). `frontOnly` (LATER 250): only a
 * face entered from its front (`crossing`) -- the hull's one-sided test, asked by the throw clearance (`throwCommit.ts`
 * `throwClear`), the walk's segment body and the overhead camera-class casts (viewer `mover.ts`: `cameraClassClear`,
 * INV-WATER-CROUCH); every other caller, and `segmentHit`, stays two-sided.
 */
export function segmentHits(
  grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean = () => true, layers: number = ALL_LAYERS, frontOnly = false,
): SegmentHit[] {
  const box = { minX: Math.min(a[0], b[0]), minZ: Math.min(a[2], b[2]), maxX: Math.max(a[0], b[0]), maxZ: Math.max(a[2], b[2]) };
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  // CPS collision step 2: an owner whose reach the segment misses is skipped -- only for a finite segment.
  const prune = Number.isFinite(a[0] + a[1] + a[2] + d[0] + d[1] + d[2]);
  const seen = new Set<CollisionObject>();
  const out: SegmentHit[] = [];
  for (const cell of cellsCovering(grid, box)) {
    for (const atom of cell.atoms) {
      const object = atom.object;
      if (object.kind !== 'collision' || seen.has(object)) continue;
      seen.add(object);
      const f = object.footprint;
      if (f.maxX < box.minX || f.minX > box.maxX || f.maxZ < box.minZ || f.minZ > box.maxZ) continue;
      if (!modelGate(object.owner, layers)) continue;
      const cache = cacheOf(object);
      if (prune && cache && cache.reach && missesReach(cache.reach, a, d)) continue;
      const polys = object.polys;
      for (let i = 0; i < polys.length; i++) {
        const poly = polys[i]!;
        // A polygon whose box misses the segment's cannot be crossed: rejected before the plane test (SEGMENT-BODY's cost;
        // the same hits in the same order). A moving owner (no cache) has its points changed in place, so its boxes are not kept.
        if (cache) {
          const pb = polyBox(poly);
          if (pb[0]! > box.maxX + BOX_PAD || pb[3]! < box.minX - BOX_PAD || pb[2]! > box.maxZ + BOX_PAD || pb[5]! < box.minZ - BOX_PAD
            || pb[1]! > Math.max(a[1], b[1]) + BOX_PAD || pb[4]! < Math.min(a[1], b[1]) - BOX_PAD) continue;
        }
        if (!accept(poly)) continue;
        const n = cache ? cache.normals[i]! : polygonNormal(poly.points);
        const t = crossing(poly, n, a, d, frontOnly);
        if (t === null) continue;
        // `n` is non-null here (a null normal crosses nothing); the hit gets its own copy, so no caller writes the cache.
        out.push({ point: [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], t, normal: [n![0], n![1], n![2]], poly, owner: object.owner });
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
