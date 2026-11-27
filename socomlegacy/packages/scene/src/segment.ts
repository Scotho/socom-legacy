import { polygonNormal, surfaceWord, SURFACE_SIDE, type WorldPoly } from './collision';
import { cellRange, cellsCovering, chopF32, cvtW, type CellRange, type CollisionObject, type CollisionOwner, type Footprint, type Grid, type NodeBox } from './grid';
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
 * GRENADE-ONE-SIDED: whether a crossing the two-sided test found from `a` along `d` enters the polygon from its FRONT,
 * decided on the plane the crossing was found on -- the Newell normal `n` (`polygonNormal`, the hit's own) through p0,
 * `crossing`'s -- so every hit the two-sided cast lists is front or back, never neither: `n . d < 0` (a crossing has its
 * ends on opposite sides of that plane, within its t tolerances). For a caller that keeps the two-sided list and sorts
 * the one-sided hits out of it per hit (`projectile.ts` `gridCast`, the grenade's flight; its only caller).
 * The drop sweep's cause B (seat-kill, 2026-11-25; `viewer/test/helpers/grenadeDropSweep.ts`): this took the side on the
 * micro's plane (`frontSides`, `(p2 - p1) x (p0 - p1)` through p1) while the crossing is on the Newell plane through p0;
 * on a WARPED face (0.05-0.38 u on the disc's hulls) a frame ending in the sliver between the two planes met the face in
 * neither frame (1,534 real-map throws). One plane is a port fix, not a value: the original's VU0 test finds its crossing
 * and its sides on one plane. Left on the Newell plane: the micro's "an end exactly on the face is not behind"
 * (`frontSides`' 1e-5) -- on the crossing's plane it would reopen a 1e-5 u sliver (the next frame's start then behind by
 * more than `crossing`'s t tolerance), so an end within it is met that frame, at the same point, not the next.
 * `crossing(.., true)` (the hull's one-sided test for every other caller: the throw clearance, `segmentHits(.., true)`)
 * is unchanged and keeps `frontSides`.
 */
export function entersFront(n: V3, d: V3): boolean {
  return n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0;
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
/**
 * A static polygon's box (min x, y, z, max x, y, z), computed once: its points and, on the axis `inside` drops (the
 * normal `n`'s largest), its plane through p0 at each corner -- `crossing`'s plane, which on a WARPED polygon leaves the
 * points' range (GRENADE-ONE-SIDED's drop sweep, cause B: a 0.2 u warp puts it 0.08 u under every vertex; the points'
 * box alone dropped hits the uncached code finds). On that plane the crossing's dropped coordinate is linear in the two
 * kept ones, so over the polygon (within `inside`'s tolerance, under `BOX_PAD`) its extremes are at the corners.
 */
function polyBox(poly: WorldPoly, n: V3 | null): Float32Array {
  let b = polyBoxes.get(poly);
  if (b) return b;
  const p = poly.points;
  b = Float32Array.from([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k]!, p[i + k]!); b[k + 3] = Math.max(b[k + 3]!, p[i + k]!); }
  }
  if (n !== null) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const [iu, iv]: [0 | 1 | 2, 0 | 1 | 2] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
    const iw = 3 - iu - iv;
    for (let i = 0; i < p.length; i += 3) {
      const w = p[iw]! - (n[iu] * (p[i + iu]! - p[iu]!) + n[iv] * (p[i + iv]! - p[iv]!)) / n[iw]!;
      b[iw] = Math.min(b[iw]!, w); b[iw + 3] = Math.max(b[iw + 3]!, w);
    }
  }
  polyBoxes.set(poly, b);
  return b;
}

/**
 * WM-29 (research 430 s3.1, s7; simulation track, READING, pending review): the blast's ray query as 8f read the
 * original's VU0 microprogram (instructions 288-333 and the edge program 336-361, identical in r0001 and r0004; r1 file
 * 0x2c6b50, r4 file 0x2f1cf0; hub reviews/research-430-micro-boundaries-addendum.md and -redecode-addendum-2.md). Per
 * polygon, with n the UNNORMALISED (p2-p1)x(p0-p1) of its first three vertices (280-286, as `frontSides`) and L its LAST
 * vertex: ds = n.(start-L), de = n.(end-L). One-sided ('blast'), a hit iff ds + 9.99999975e-6 >= 0 (the start in front,
 * inclusive: 0xb727c5ac at 290) and de + 1.0013580322e-5 < 0 (the end behind, strict: 0xbf800054 + 1.0 at 296, 307).
 * t = ds / (ds - de) (318, 324) used as computed: NO window, NO clamp -- it lies in (-Bs / (Be - Bs), 1). The point is then tested per edge in vertex order: (point - the edge's first vertex) . (n x edge) +
 * 9.99999975e-6 >= 0, the edge normal unnormalised. Kept apart, named: the port computes in doubles where the original
 * rounds single precision toward zero (8f's re-decode s5); the edge test measures from each edge's START vertex where the
 * original measures from its END vertex on edges 2 to n (the same in exact arithmetic; 8f's check of 6a7587928a, note 4);
 * no hit when ds - de = 0 (no infinite t). Every blast line is this one-sided rule (LATER 1087 (b): the scene's too, the
 * batch's 0x20 on the hull, `FUN_002d3030` D:L175277-175282; research 430 s3.1). The port's two-sided departure,
 * 'blast-scene', was retired by LATER 1252; the original's 0x30 mode (bit-1 colliders only, its per-edge flip at micro
 * 354-358) is not built, the port having no bit-1 collider on a blast line.
 *
 * WHICH POLYGONS ARE ASKED (LATER 1094, research 430 s8; it replaces the ruling "build B" of 2026-11-15, s7): the
 * original's own walk -- the cells the line marks and the node boxes on the way down (`blastCells`, `nodeRefuses`; the
 * block above `blastHits`). Not the port's default broad phase: for any polygon the points this rule can report are a
 * convex region of the plane through its LAST vertex, bounded by the half-planes of its edges PROJECTED along n -- not the
 * box of its vertices (on the disc 4950 of 201608 collision polygons have the last vertex more than 1e-3 off the plane of
 * the first three, the largest 28.89; s7.5, measured) -- and the original does not bound that region either: it refuses a
 * line by its CELLS and its NODES' boxes, and asks the rule of every polygon of an owner they let through. B (the rule
 * of every polygon of the grid) is the oracle the walk is tested against. Within an admitted owner, what is refused is
 * refused by the rule's own sums (`modelGate` as the default path asks it). A
 * static object's raw normals and last vertices are kept flat, and the start's sums while the start is the same
 * (`BlastKept`): the same numbers the sums would take, so the sums are bit for bit the rule's; n.L is NOT kept -- a kept
 * constant would round the sums otherwise than the rule does. A moving owner (`sweep`: its points change in place) keeps
 * nothing: its numbers and its polygon normals are reckoned each call, as the default path reckons its normals. `accept` is asked after the plane test and before the edge test,
 * an owner's polygons in the owner's order (the blast lines keep an owner's first OFFERED polygon). The default path
 * (`frontOnly` true or false) never comes here: `segmentHits` branches before its scratch is taken. As the default
 * path, it does not guard a start or end that is not a number: two-sided, such a line passes both tests on every
 * polygon (every comparison with NaN is false) -- the callers pass finite points.
 */
const BLAST_START_BIAS = 9.99999975e-6;
const BLAST_END_BIAS = 1.0013580322e-5;
/**
 * WM-29 (research 430 s6; the review of 720e78fd46, Q1) [placeholder]: what a blast hit reports as its NORMAL. The
 * original's ray record holds something at +0x10 (the record's layout: `FUN_002d2890` D:L174876-174884; the point at
 * +0, the polygon at +0xc, the owner at +0x1c), written by the polygon class's ray function, which is not in the
 * decompilation -- UNREAD. The vertical-column test beside it writes the unit normal of the first three vertices there
 * (`FUN_002dd8e0` D:L181111-181113, `FUN_002dd030` D:L180713-180763), which suggests, without showing, the same of the
 * ray. The port reports the polygon's own normal (`polygonNormal`, as its default path does) and, for a polygon that has
 * none, the raw normal's direction: the port's own choice, not a reading. Nothing reads it: neither the original's
 * blast (`FUN_003c80e0` D:L319096-319143, `FUN_005a0e70` D:L459142-459186: the point, the polygon's material, the
 * owner) nor the port's (`blastSeen`, `blastExposed`, `blastLine1`, `blastLine`). A consumer added later (a decal at a
 * blast hit) must read the original first. [These lines are the reviewer's finding, not yet re-read by a second reader.]
 */
export const BLAST_HIT_NORMAL_PLACEHOLDER = 'the polygon normal, else the raw normal\'s direction' as const;
/**
 * What is kept for a STATIC object's polygons (the controller's ruling of 2026-11-15 after the measured gate was missed,
 * research 430 s7.7: B kept, made cheaper with NO geometric reject):
 * - `flat`, six doubles a polygon, made once: the raw normal (p2 - p1) x (p0 - p1) and the LAST vertex -- the very
 *   numbers the rule's sums take from the polygon's points, read in one pass instead of from each point array;
 * - for the START the sums were last asked from (`ax`, `ay`, `az`): `ds` of every polygon, and `front`, the polygons
 *   whose start is in front (ds + 9.99999975e-6 >= 0), in the object's order. Every line of one blast starts at the same
 *   lifted point, so the start's sum is reckoned once a blast point; one-sided, a polygon whose start is not in front is
 *   out for every line of that blast.
 * The sums are the same expressions on the same numbers as when nothing is kept, bit for bit. The start's sums are used
 * only by the outermost blast query (`blastDepth` 1): a query made from inside another's `accept` reckons its own and
 * writes nothing, so it cannot disturb the outer's. A moving owner (`sweep`) keeps nothing.
 */
interface BlastKept { flat: Float64Array; ax: number; ay: number; az: number; ds: Float64Array; front: Int32Array; fronts: number }
const blastKeptOf = new WeakMap<CollisionObject, BlastKept>();
let blastDepth = 0;
/** The raw normal and the last vertex of each polygon, six doubles a polygon. */
function blastFlat(polys: readonly WorldPoly[]): Float64Array {
  const out = new Float64Array(polys.length * 6);
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i]!.points;
    const p1x = p[3]!, p1y = p[4]!, p1z = p[5]!;
    const ux = p[6]! - p1x, uy = p[7]! - p1y, uz = p[8]! - p1z;  // p2 - p1
    const vx = p[0]! - p1x, vy = p[1]! - p1y, vz = p[2]! - p1z;  // p0 - p1
    const o = i * 6, last = p.length - 3;
    out[o] = uy * vz - uz * vy; out[o + 1] = uz * vx - ux * vz; out[o + 2] = ux * vy - uy * vx;
    out[o + 3] = p[last]!; out[o + 4] = p[last + 1]!; out[o + 5] = p[last + 2]!;   // the plane through the LAST vertex
  }
  return out;
}
function blastKept(object: CollisionObject): BlastKept {
  let k = blastKeptOf.get(object);
  if (!k) {
    const n = object.polys.length;
    k = { flat: blastFlat(object.polys), ax: NaN, ay: NaN, az: NaN, ds: new Float64Array(n), front: new Int32Array(n), fronts: 0 };
    blastKeptOf.set(object, k);
  }
  return k;
}
/** The start's sums for this object, reckoned when the start is not the one they were last asked from. */
function blastStart(k: BlastKept, a: V3): void {
  // The SAME start: the same three numbers, to the sign of a zero (`Object.is`: +0 is not -0 -- from x = -0 the sum of
  // a polygon in the plane x = 0 is the other zero, and t and the point carry its sign; the review of 79d589a7e0).
  if (Object.is(k.ax, a[0]) && Object.is(k.ay, a[1]) && Object.is(k.az, a[2])) return;
  const flat = k.flat, ds = k.ds, front = k.front, n = ds.length;
  let fronts = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const s = flat[o]! * (a[0] - flat[o + 3]!) + flat[o + 1]! * (a[1] - flat[o + 4]!) + flat[o + 2]! * (a[2] - flat[o + 5]!);
    ds[i] = s;
    if (s + BLAST_START_BIAS >= 0) front[fronts++] = i;
  }
  k.fronts = fronts; k.ax = a[0]; k.ay = a[1]; k.az = a[2];
}

/**
 * LATER 1094 (research 430 s8; the controller's ruling of 2026-11-18 after the review of 79d589a7e0 FAILED; reading,
 * pending review): WHICH collision objects a blast line is asked of -- the original's batch walk, `FUN_002d3cf0`, for
 * the line's own record, and the node box, `FUN_003124f0`, on the way down to each owner's polygons. B (every polygon of
 * the grid) stays the ORACLE: what this asks is B's rule on a subset of B's polygons.
 *
 * THE CELLS (`blastCells`). A segment record (type 2) is handed to `FUN_002d6800` with a count of 2 and the flag 1 (the
 * call in `FUN_002d3cf0`, D:L175582: Ghidra drops both arguments; the disassembly sets $a2 = 2 at 0x2d41a8 and $a3 = 1 at
 * 0x2d4178), which sets the line up (`FUN_002d6c40`: each end's cell `(int)(invCellDim x (p - origin + 0.0001))`, clamped
 * to the grid, D:L177260-177297; the two edges a->b and b->a, each with its unit normal in x-z, D:L177104-177111) and
 * marks each cell of the ends' cell box (x outer, z inner: `FUN_002d6430`) unless `FUN_002d66b0` refuses it: the cell's
 * centre lies more than `grid+0x40` from the line on either side (D:L177059-177067; the flag 1 asks the far side).
 * `grid+0x40` is half a cell's diagonal (research 204: 127.279 on 180-unit cells, 113.137 on 160;
 * `GRID_COVER_HALF_WIDTH_READING`). All in float32, each step chopped toward zero as the EE rounds (`chopF32`, research
 * 25; the review of fc0cb0622b, N1); the products' sums are FUSED (`mula.s` + `madd.s`: the refusal's dot product at 0x2d6770-0x2d6774, each
 * normal's squared length at 0x2d68a0-0x2d68a4 and 0x2d6a10-0x2d6a14; the second review of 1094, F2), and how the EE rounds
 * inside `madd.s` is not read: the port chops each product and the sum apart (`BLAST_COVER_MADD_READING`). An end-on line
 * (its two ends one point in x-z) has normals of 0 and every cell of its box. The marked cells are then WALKED z outer,
 * x inner (D:L175613-175720), the order `blastCells` returns.
 *
 * THE OBJECTS. Each marked cell's atoms in order, each atom once a walk (`+0xa4` against the walk's count,
 * D:L175631), an owner found in the cells its FILED node covers (`CollisionOwner.filed`, turned into cells by the grid
 * insert's rule or, for clutter, `FUN_002d6c40`'s: `filedByCover`; else the object's own footprint). The port asks each
 * owner once; the original walks a CLUTTER instance once per marked cell it is filed in (`BLAST_CLUTTER_PER_CELL_READING`).
 * The frame's other records are named, not built: `BLAST_BATCH_CELLS_READING`.
 *
 * THE NODE BOX (`nodeRefuses`). On each node of `CollisionOwner.nodes`, the line's two ends are put into the node's frame
 * (the node's matrix pushed and the stack's top inverted, D:L175103-175108; `FUN_003085c0`, D:L175248). The inverse is
 * `FUN_00308160`'s (D:L206756-206800, VU0): the 3x3 transposed and divided by the squared length of its FIRST row, the
 * translation carried through it -- exact for a turn times a uniform scale, not for any other frame, and the port takes
 * the same (`inverseOf`; the review of fc0cb0622b, S1). The record is refused when both lie
 * strictly below a face's minimum or strictly above its maximum on one axis (D:L213184-213239), unless the node's flag
 * bit 30 is set (D:L213184). A refused record is done for the node's whole subtree (marked at D:L175249-175275, cleared only when that node's walk
 * ends, D:L175396-175402; a node whose every record is done is not walked into at all, D:L175102), so a refusal on
 * any node of the chain refuses the owner. The port puts the ends into the frame in doubles where the original rounds
 * in float32 (a line within float32's rounding of a face can differ). A MOVING owner (`sweep`: a door, a gate, a crane)
 * is asked no box: its frame turns with it and the port keeps none live (`BLAST_SWEEP_NODE_BOX_READING`).
 */
export const GRID_COVER_HALF_WIDTH_READING = 'half a cell diagonal: f32(f32(cellDim / 2) x f32(sqrt 2))' as const;
/**
 * LATER 1094 [reading]: the queue (`FUN_0031dd90`) is flushed ONCE A FRAME (`FUN_0031de30`, a periodic task registered at
 * D:L152100), so every segment queued that frame -- each body's step, each round's line, each blast's line -- is ONE
 * batch, and its cells are the union of every record's marks. The cell's mask of records is loaded and never applied
 * (the disassembly at 0x2d30c0-0x2d30e8 tests `1 << i` alone, which is never 0; Ghidra prints the same), so every object
 * of every marked cell is offered to every record of the frame. The port walks the line's OWN cells only: a line can
 * meet an owner the original found through another record's cell, where the node box lets it pass. Settling it is the
 * frame's whole batch, not this query.
 */
export const BLAST_BATCH_CELLS_READING = 'the line\'s own cells; the frame\'s other records\' cells not added' as const;
/** LATER 1094 [placeholder]: a moving owner's node boxes are not asked (the port keeps no live frame for them). */
export const BLAST_SWEEP_NODE_BOX_READING = 'no node box asked of a moving owner' as const;
/**
 * LATER 1094 (the review of fc0cb0622b, S4) [reading]: a clutter instance is linked into EVERY cell its box covers, through
 * each cell's own holder (`FUN_002d55c0` adds it to each, D:L176344 on), and the `+0xa4` stamp is on the cell's atom, the
 * holder (D:L175631), so a batch walks one instance once per marked cell it is filed in, and each walk can add its hits
 * again (D:L175353-175371). The port asks each owner once. The blast keeps the first offered polygon an owner
 * (`REACH_HITS_READING`), so a repeat changes nothing there; a consumer that counts every hit would differ.
 */
export const BLAST_CLUTTER_PER_CELL_READING = 'each owner asked once a line' as const;
/**
 * LATER 1094 (the second review, F2) [reading]: `FUN_002d66b0`'s dot product and `FUN_002d6800`'s squared lengths are fused
 * multiply-adds on the EE (`mula.s` + `madd.s`); how the EE rounds inside them is not read, and the port chops each product
 * and the sum apart. A cell centre within float32's last place of the half-width could be marked by one and not the other.
 */
export const BLAST_COVER_MADD_READING = 'each product and the sum chopped apart' as const;
/**
 * LATER 1094 (the second review's F1; the main controller's yes of 2026-11-18) -- a BROWSER ADAPTATION: a Forge copy (a
 * placed gate, barrier, switch look, turret or door: `movedWalk`, `CollisionOwner.filedWithPolys`) has no original. Filed
 * by its first node's box carried by two corners alone (a world node's rule), a copy turned near 45 degrees is filed in
 * fewer cells than its polygons stand in, and a blast line in one of those cells would pass a placed barrier. So a copy
 * is also found in the cells its polygons cover (the object's own `cells`). A world node and clutter keep the original's
 * filing alone.
 */
export const FORGE_COPY_POLY_CELLS_ADAPTATION = 'a Forge copy is found in its polygons\' cells as well as its filed node\'s' as const;

const f32 = Math.fround;
const c = chopF32;
const COVER_EPS = f32(0.0001);
/** `FUN_002d6c40`'s cell of one coordinate: `(int)` truncates (`cvt.w.s`; a NaN or an overflow reads 0x7fffffff); clamped to 0..n-1. */
function coverIndex(p: number, origin: number, inv: number, n: number): number {
  const i = cvtW(c(inv * c(c(p - origin) + COVER_EPS)));
  return i < 0 ? 0 : i > n - 1 ? n - 1 : i;
}
/** The cells a footprint covers by `FUN_002d6c40`'s rule (a clutter instance's filing, `filedByCover`). */
function coverRange(grid: Grid, f: Footprint): CellRange {
  const { cellsX, cellsZ, originX, originZ } = grid.params, inv = grid.invCellDim;
  const ax = coverIndex(f32(f.minX), f32(originX), inv, cellsX), bx = coverIndex(f32(f.maxX), f32(originX), inv, cellsX);
  const az = coverIndex(f32(f.minZ), f32(originZ), inv, cellsZ), bz = coverIndex(f32(f.maxZ), f32(originZ), inv, cellsZ);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}
/** The cells a blast line marks (`FUN_002d6c40`, `FUN_002d6800`, `FUN_002d66b0` with the count 2 and the flag 1), z outer and x inner. */
export function blastCells(grid: Grid, a: V3, b: V3): number[] {
  const { cellsX, cellsZ, cellDim } = grid.params;
  const ox = f32(grid.params.originX), oz = f32(grid.params.originZ), inv = grid.invCellDim, cell = f32(cellDim);
  const px = [f32(a[0]), f32(b[0])], pz = [f32(a[2]), f32(b[2])];
  const xa = coverIndex(px[0]!, ox, inv, cellsX), xb = coverIndex(px[1]!, ox, inv, cellsX);
  const za = coverIndex(pz[0]!, oz, inv, cellsZ), zb = coverIndex(pz[1]!, oz, inv, cellsZ);
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  // Each edge's normal (D:L177104-177111): its x factor (+0x8c) = z' - z, its z factor (+0x94) = x - x', unit when not 0.
  const nx: number[] = [], nz: number[] = [];
  for (let e = 0; e < 2; e++) {
    const o = 1 - e;
    let fz = c(px[e]! - px[o]!), fx = c(pz[o]! - pz[e]!);
    const len = c(Math.sqrt(c(c(fz * fz) + c(fx * fx))));
    if (len !== 0) { const r = c(1 / len); fz = c(fz * r); fx = c(fx * r); }
    nx.push(fx); nz.push(fz);
  }
  const w = f32(f32(cell * 0.5) * f32(Math.SQRT2));                 // grid+0x40: GRID_COVER_HALF_WIDTH_READING
  const half = c(cell * 0.5);
  const out: number[] = [];
  for (let z = z0; z <= z1; z++) {
    const cz = c(half + c(oz + c(z * cell)));                     // half + (origin + i x cell): 0x2d6730-0x2d6744
    for (let x = x0; x <= x1; x++) {
      const cx = c(half + c(ox + c(x * cell)));                   // 0x2d670c-0x2d671c (the second review's N-a)
      let refused = false;
      for (let e = 0; e < 2 && !refused; e++) {
        const v = c(c(c(cz - pz[e]!) * nz[e]!) + c(c(cx - px[e]!) * nx[e]!));
        if (v < -w || w < v) refused = true;
      }
      if (!refused) out.push(x + z * cellsX);
    }
  }
  return out;
}

/** Per grid: each cell's collision objects as the blast walk files them (`CollisionOwner.filed`), in the grid's order. */
const blastFilings = new WeakMap<Grid, CollisionObject[][]>();
function blastFiling(grid: Grid): CollisionObject[][] {
  let cells = blastFilings.get(grid);
  if (cells) return cells;
  const made: CollisionObject[][] = grid.cells.map(() => []);
  for (const object of grid.objects) {
    if (object.kind !== 'collision') continue;
    const o = object.owner;
    const r: CellRange = o.filed && !o.sweep ? (o.filedByCover ? coverRange(grid, o.filed) : cellRange(grid, o.filed)) : object.cells;
    const filedHere = new Set<number>();
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) { const c = x + z * grid.params.cellsX; filedHere.add(c); made[c]!.push(object); }
    // FORGE_COPY_POLY_CELLS_ADAPTATION: a Forge copy is also found in its polygons' own cells.
    if (o.filedWithPolys && o.filed && !o.sweep) {
      const q = object.cells;
      for (let z = q.z0; z <= q.z1; z++) for (let x = q.x0; x <= q.x1; x++) { const c = x + z * grid.params.cellsX; if (!filedHere.has(c)) made[c]!.push(object); }
    }
  }
  blastFilings.set(grid, made);
  return made;
}
/** Each nesting depth's seen-stamps (a query from inside another's `accept` takes the next). */
const blastSeenAt: { seen: WeakMap<CollisionObject, number>; stamp: number }[] = [];
/** The objects a blast line is asked of: its marked cells' objects, each once, in the walk's order. */
function blastWalk(grid: Grid, a: V3, b: V3, depth: number): CollisionObject[] {
  const filing = blastFiling(grid);
  const scratch = blastSeenAt[depth] ??= { seen: new WeakMap(), stamp: 0 };
  if (scratch.stamp >= SEGMENT_STAMP_LIMIT) { scratch.seen = new WeakMap(); scratch.stamp = 0; }
  const stamp = ++scratch.stamp;
  const out: CollisionObject[] = [];
  for (const c of blastCells(grid, a, b)) {
    for (const object of filing[c]!) {
      if (scratch.seen.get(object) === stamp) continue;
      scratch.seen.set(object, stamp);
      out.push(object);
    }
  }
  return out;
}

/**
 * A node's frame inverted as `FUN_00308160` inverts it (D:L206756-206800): Q = 1 / |first row|^2, the 3x3 TRANSPOSED times
 * Q, the translation carried through it -- local = (world - T) x M^T x Q for row vectors. Nine numbers, then T; kept per
 * frame array. Exact for a turn times a uniform scale; for any other frame it is the original's answer, not the inverse.
 */
const inverses = new WeakMap<Float32Array, Float64Array>();
function inverseOf(m: Float32Array): Float64Array {
  let r = inverses.get(m);
  if (r) return r;
  const q = 1 / (m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!);
  r = Float64Array.from([
    m[0]! * q, m[4]! * q, m[8]! * q,
    m[1]! * q, m[5]! * q, m[9]! * q,
    m[2]! * q, m[6]! * q, m[10]! * q,
    m[12]!, m[13]!, m[14]!,
  ]);
  inverses.set(m, r);
  return r;
}
/** Whether a node box on the owner's chain refuses the line (`FUN_003124f0`): both ends beyond one face, in the node's frame. */
export function nodeRefuses(owner: CollisionOwner, a: V3, b: V3): boolean {
  const nodes = owner.nodes;
  if (!nodes || owner.sweep) return false;                          // BLAST_SWEEP_NODE_BOX_READING
  for (const node of nodes) if (boxRefuses(node, a, b)) return true;
  return false;
}
function boxRefuses(node: NodeBox, a: V3, b: V3): boolean {
  if (node.free) return false;
  const r = inverseOf(node.world), box = node.bbox;
  const ax = a[0] - r[9]!, ay = a[1] - r[10]!, az = a[2] - r[11]!, bx = b[0] - r[9]!, by = b[1] - r[10]!, bz = b[2] - r[11]!;
  for (let k = 0; k < 3; k++) {
    const la = ax * r[k]! + ay * r[3 + k]! + az * r[6 + k]!, lb = bx * r[k]! + by * r[3 + k]! + bz * r[6 + k]!;
    if ((la < box[k]! && lb < box[k]!) || (box[k + 3]! < la && box[k + 3]! < lb)) return true;
  }
  return false;
}

function blastHits(grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean, layers: number): SegmentHit[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const ex = b[0], ey = b[1], ez = b[2];                       // the end itself: the rule's second sum is of the end point
  const out: SegmentHit[] = [];
  // One polygon past the plane test: `accept`, then t, the edge program, the hit. `ds` and `de` are the rule's two sums.
  const rest = (object: CollisionObject, cache: OwnerCache | null, i: number, nx: number, ny: number, nz: number, ds: number, de: number): void => {
    if (ds - de === 0) return;                                 // no infinite t, no not-a-number point
    const poly = object.polys[i]!, p = poly.points;
    if (!accept(poly)) return;
    const t = ds / (ds - de);
    const qx = a[0] + dx * t, qy = a[1] + dy * t, qz = a[2] + dz * t;
    // The edge program (336-361): per edge in vertex order, its normal n x edge (unnormalised); no test of t.
    const count = p.length / 3;
    for (let j = 0; j < count; j++) {
      const j0 = j * 3, j1 = ((j + 1) % count) * 3;
      const gx = p[j1]! - p[j0]!, gy = p[j1 + 1]! - p[j0 + 1]!, gz = p[j1 + 2]! - p[j0 + 2]!;
      const mx = ny * gz - nz * gy, my = nz * gx - nx * gz, mz = nx * gy - ny * gx;
      if ((qx - p[j0]!) * mx + (qy - p[j0 + 1]!) * my + (qz - p[j0 + 2]!) * mz + BLAST_START_BIAS < 0) return;
    }
    // A polygon with no polygon normal (`polygonNormal` null, its Newell length 1e-9 or less: 16 on the disc, research
    // 430 s7.5) is still a polygon to the rule, which is handed only the first three vertices (`FUN_002dd130`
    // D:L180767-180781, called at D:L174866-174868; no test of a degenerate polygon before it, D:L174845-174868): it
    // is NOT skipped (the review of dee83b8f95, Q1). What its hit reports as a normal is BLAST_HIT_NORMAL_PLACEHOLDER.
    // A raw normal of 0 never comes here: both sums are 0 and the end is never behind.
    const kept = cache ? cache.normals[i]! : polygonNormal(p);
    const length = Math.hypot(nx, ny, nz);
    const normal: [number, number, number] = kept ? [kept[0], kept[1], kept[2]] : [nx / length, ny / length, nz / length];
    out.push({ point: [qx, qy, qz], t, normal, poly, owner: object.owner });
  };
  blastDepth++;
  try {
    const outermost = blastDepth === 1;
    for (const object of blastWalk(grid, a, b, blastDepth)) {         // LATER 1094: the line's cells, not the whole grid
      if (!modelGate(object.owner, layers)) continue;
      if (nodeRefuses(object.owner, a, b)) continue;                  // LATER 1094: a node box on the way down refuses it
      const cache = cacheOf(object);
      // A moving owner: nothing kept, its six numbers a polygon reckoned from its points as they stand now.
      const k = object.owner.sweep ? null : blastKept(object);
      const flat = k ? k.flat : blastFlat(object.polys);
      const n = object.polys.length;
      if (k && outermost) {
        blastStart(k, a);
        const sums = k.ds;
        // Only the polygons whose start is in front, in the object's order; a hit needs the end behind.
        const front = k.front, fronts = k.fronts;
        for (let f = 0; f < fronts; f++) {
          const i = front[f]!, o = i * 6;
          const nx = flat[o]!, ny = flat[o + 1]!, nz = flat[o + 2]!;
          const de = nx * (ex - flat[o + 3]!) + ny * (ey - flat[o + 4]!) + nz * (ez - flat[o + 5]!);
          if (de + BLAST_END_BIAS < 0) rest(object, cache, i, nx, ny, nz, sums[i]!, de);
        }
        continue;
      }
      // A moving owner, or a query made from inside another's `accept`: both sums reckoned here, nothing kept or read.
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        const nx = flat[o]!, ny = flat[o + 1]!, nz = flat[o + 2]!;
        const ds = nx * (a[0] - flat[o + 3]!) + ny * (a[1] - flat[o + 4]!) + nz * (a[2] - flat[o + 5]!);
        const de = nx * (ex - flat[o + 3]!) + ny * (ey - flat[o + 4]!) + nz * (ez - flat[o + 5]!);
        const startFront = ds + BLAST_START_BIAS >= 0, endBehind = de + BLAST_END_BIAS < 0;
        if (startFront && endBehind) rest(object, cache, i, nx, ny, nz, ds, de);
      }
    }
  } finally {
    blastDepth--;
  }
  return out.sort(byT);
}

/** `segmentHits`' sides: false two-sided, true the hull's one-sided test (`crossing`), 'blast' the blast's own one-sided rule (`blastHits`). */
export type SegmentSides = boolean | 'blast';

/**
 * Every polygon the segment a->b crosses, nearest `a` first (`segmentHit`'s candidates). `frontOnly` (LATER 250): only a
 * face entered from its front (`crossing`) -- the hull's one-sided test, asked by the throw clearance (`throwCommit.ts`
 * `throwClear`), the walk's segment body, the overhead camera-class casts (viewer `mover.ts`: `cameraClassClear`,
 * INV-WATER-CROUCH) and the third-person pass's probes (viewer `cameraRig.ts` `cameraPass`, LATER 1057); every other
 * caller, and `segmentHit`, stays two-sided. WM-29: 'blast' is the blast lines' own one-sided rule (LATER 1087, 1252), asked of the
 * polygons the original's cell walk and node boxes let through (`blastHits`).
 */
export function segmentHits(
  grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean = ACCEPT_ALL, layers: number = ALL_LAYERS, frontOnly: SegmentSides = false,
): SegmentHit[] {
  if (frontOnly === 'blast') return blastHits(grid, a, b, accept, layers);   // WM-29
  // PAGE-ALLOC-A: this call's scratch, one set a nesting depth (`SEGMENT_SCRATCH`), given back however the call ends.
  const scratch = SEGMENT_SCRATCH[segmentDepth] ??= { seen: new WeakMap(), stamp: 0, box: { minX: 0, minZ: 0, maxX: 0, maxZ: 0 }, d: [0, 0, 0] };
  segmentDepth++;
  try {
    if (scratch.stamp >= SEGMENT_STAMP_LIMIT) { scratch.seen = new WeakMap(); scratch.stamp = 0; }
    return segmentHitsWith(scratch, ++scratch.stamp, grid, a, b, accept, layers, frontOnly);
  } finally {
    segmentDepth--;
  }
}

/**
 * PAGE-ALLOC-A (LATER 867 (A); a CPU-side browser adaptation): `segmentHits`' per-call scratch -- the owners it has seen,
 * the segment's ground-plane box and its travel -- kept and rewritten where each call made a `Set`, a box and a tuple
 * (13 MB of its own and 15.8 MB under `Set.prototype.add` in 10 s of shadow's X2c profile). An owner is seen in this call
 * when its stamp is the call's; a call made from inside another (an `accept` that casts) takes the next depth's scratch,
 * so neither disturbs the other's. The same owners visited in the same order: the same hits, the same numbers.
 */
interface SegmentScratch {
  seen: WeakMap<CollisionObject, number>;
  stamp: number;
  box: { minX: number; minZ: number; maxX: number; maxZ: number };
  d: [number, number, number];
}
const SEGMENT_SCRATCH: SegmentScratch[] = [];
let segmentDepth = 0;
/** The stamps stay small integers: past this the depth's map is made afresh and the count restarts. */
const SEGMENT_STAMP_LIMIT = 0x3fffffff;
const ACCEPT_ALL = (): boolean => true;
const byT = (x: SegmentHit, y: SegmentHit): number => x.t - y.t;

function segmentHitsWith(
  scratch: SegmentScratch, stamp: number,
  grid: Grid, a: V3, b: V3, accept: (p: WorldPoly) => boolean, layers: number, frontOnly: boolean,
): SegmentHit[] {
  const box = scratch.box;
  box.minX = Math.min(a[0], b[0]); box.minZ = Math.min(a[2], b[2]); box.maxX = Math.max(a[0], b[0]); box.maxZ = Math.max(a[2], b[2]);
  const d = scratch.d;
  d[0] = b[0] - a[0]; d[1] = b[1] - a[1]; d[2] = b[2] - a[2];
  // CPS collision step 2: an owner whose reach the segment misses is skipped -- only for a finite segment.
  const prune = Number.isFinite(a[0] + a[1] + a[2] + d[0] + d[1] + d[2]);
  const seen = scratch.seen;
  const out: SegmentHit[] = [];
  for (const cell of cellsCovering(grid, box)) {
    for (const atom of cell.atoms) {
      const object = atom.object;
      if (object.kind !== 'collision' || seen.get(object) === stamp) continue;
      seen.set(object, stamp);
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
          const pb = polyBox(poly, cache.normals[i] ?? null);
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
  return out.sort(byT);
}
