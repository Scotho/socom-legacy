import type { WorldPoly } from '@s2u/scene';

type V3 = readonly [number, number, number];

/**
 * LATER 1167 (product track: the floorless-edge census, a test instrument; the main controller's ruling of 2026-11-18
 * before 03:53Z): whether a body's step crossed a wall FACE -- its polygon, not its bounding line. The census counted a
 * pass when a step crossed the face's whole extent in plan with the feet under its top, which counts a slanted strip's
 * open side (MP61's `access5` beams; the re-trace, reviews/later1167-mp61-retrace.md: CONFIRMED, open space).
 *
 * The test is the step's whole BAND, not a few heights (the review of 07a32c0052, finding 1: four heights miss a face
 * crossed only between two of them): the parallelogram the step sweeps from `low` over the feet to `high` over the feet
 * (the census: 2 to the walker's head line for the tick) -- the feet's start and end raised by each -- meets the polygon
 * when an edge of either crosses the other (two planar polygons that are not coplanar), from either side, with no grid
 * query (so no layer filter can hide a face). Where a polygon is there inside the band, it is counted: not weaker than
 * the old test there.
 */
export function stepCrossesFace(face: WorldPoly, from: V3, to: V3, low: number, high: number): boolean {
  return stepCrossing(face, from, to, low, high) !== null;
}

/**
 * The side(s) a step's band enters the face from (the main controller's ruling of 2026-11-18, a choice between
 * readings logged for the owner: the census gate counts FRONT entries, as the hull's one-sided test collides -- research
 * 281 s4.3, a reading -- and lists every BACK entry beside it). Each place the band meets the polygon (a band edge
 * through the face, or a face edge through the band) is judged by the step's DIRECTION against the face's normal (its
 * own winding's, the hull's sides), as the hull judges it (`segment.ts` `crossing`: a move along the normal is entered
 * from behind): the plane distance falling from the step's start to its end (n . (to - from) < 0, the same at every
 * height) is a front entry, rising a back entry, unchanged no entry (a body standing against the face). A body placed
 * with its band already through a leaning face counts once it moves (the re-read of 444f3b0665, finding 1: it can only
 * over-count). Judging by the start's side alone failed for a
 * glancing contact on a steep overhang (MP8 land54/g3036: the start 0.001 in front, moving out of the face).
 * Null when the band does not meet it, or meets it with no move against or along the normal.
 */
export function stepCrossing(face: WorldPoly, from: V3, to: V3, low: number, high: number): { front: boolean; back: boolean } | null {
  const quad: V3[] = [[from[0], from[1] + low, from[2]], [to[0], to[1] + low, to[2]], [to[0], to[1] + high, to[2]], [from[0], from[1] + high, from[2]]];
  const poly = facePoints(face), n = normalOf(poly);
  if (!n) return null;
  const p0 = poly[0]!;
  const sides = new Set<'front' | 'back'>();
  const sideAt = (h: number): void => {
    const d0 = dot(sub([from[0], from[1] + h, from[2]], p0), n), d1 = dot(sub([to[0], to[1] + h, to[2]], p0), n);
    if (d1 < d0) sides.add('front'); else if (d1 > d0) sides.add('back');
  };
  // a band edge through the face: its crossing point's height over the step's feet
  for (let i = 0; i < 4; i++) {
    const x = segmentPolygonPoint(quad[i]!, quad[(i + 1) % 4]!, poly);
    if (x) sideAt(heightOver(x, from, to));
  }
  // a face edge through the band
  for (let i = 0; i < poly.length; i++) {
    const x = segmentPolygonPoint(poly[i]!, poly[(i + 1) % poly.length]!, quad);
    if (x) sideAt(heightOver(x, from, to));
  }
  return sides.size ? { front: sides.has('front'), back: sides.has('back') } : null;
}

/** A point's height over the step's feet line at its place along the step (the band's own height coordinate). */
function heightOver(x: V3, from: V3, to: V3): number {
  const dx = to[0] - from[0], dz = to[2] - from[2], l2 = dx * dx + dz * dz;
  const f = l2 > 0 ? Math.max(0, Math.min(1, ((x[0] - from[0]) * dx + (x[2] - from[2]) * dz) / l2)) : 0;
  return x[1] - (from[1] + (to[1] - from[1]) * f);
}

/** The face's points as triples. */
export function facePoints(face: WorldPoly): V3[] {
  const p = face.points, out: V3[] = [];
  for (let j = 0; j < p.length / 3; j++) out.push([p[j * 3]!, p[j * 3 + 1]!, p[j * 3 + 2]!]);
  return out;
}

/**
 * Whether segment a-b meets the planar polygon `poly` (its plane crossed or touched between a and b, at a point inside
 * the polygon or on its edge). A segment lying in the polygon's plane counts as not meeting it (the other polygon's
 * edges decide that case).
 */
export function segmentMeetsPolygon(a: V3, b: V3, poly: readonly V3[]): boolean {
  return segmentPolygonPoint(a, b, poly) !== null;
}

/** Where segment a-b meets the planar polygon (as `segmentMeetsPolygon`), or null. */
function segmentPolygonPoint(a: V3, b: V3, poly: readonly V3[]): V3 | null {
  const n = normalOf(poly);
  if (!n) return null;
  const p0 = poly[0]!;
  const da = dot(sub(a, p0), n), db = dot(sub(b, p0), n);
  if (da * db > 0) return null;
  if (da === 0 && db === 0) return null;
  const f = da / (da - db);
  const x: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  return insidePlanar(x, poly, n) ? x : null;
}

/** Point-in-polygon for a point on the polygon's plane: projected to the plane's two widest axes (edges count inside). */
function insidePlanar(x: V3, poly: readonly V3[], n: V3): boolean {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [u, v] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
  const px = x[u]!, py = x[v]!, eps = 1e-9;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![u]!, yi = poly[i]![v]!, xj = poly[j]![u]!, yj = poly[j]![v]!;
    // on the edge: counted
    const cross = (xj - xi) * (py - yi) - (yj - yi) * (px - xi);
    if (Math.abs(cross) <= eps * Math.hypot(xj - xi, yj - yi) && Math.min(xi, xj) - eps <= px && px <= Math.max(xi, xj) + eps
      && Math.min(yi, yj) - eps <= py && py <= Math.max(yi, yj) + eps) return true;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function normalOf(poly: readonly V3[]): V3 | null {
  // Newell's method: robust for any planar polygon
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z);
  return l > 1e-12 ? [x / l, y / l, z / l] : null;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The census's band over the feet: from 2 (below the walker's low line) to the walker's head line for the tick. */
export const CENSUS_BAND_LOW = 2;
