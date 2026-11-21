import { add, cross, dot, faceVerts, length, normalize, scale, sub, triangulate, vertPos, type EditMesh, type Vec3 } from './editMesh';
import type { KnifePoint } from './ops';

/**
 * The Knife's snapping (the owner, 2026-11-20: "when I use the knife tool, why can't I snap the vertex to the grid";
 * a browser adaptation, the game has no editor; after the reference editor's edge cut, as every tool is -- "always match
 * hammer for all tools"). With the grid snap on, a Knife point is the nearest to the pointer's place on the face under
 * it of: the face's points; each of its edges' middles; each edge's nearest place, moved along it to the nearest world
 * grid plane it crosses; and, once the cut has a point on that object, where each edge crosses the workplane's three
 * planes through that point (aligned: the cut runs straight along the workplane) or the plane square to the edge that
 * point is on (aligned: the cut leaves square to it), and where the grid lines of the pointer's workplane cell pierce
 * the face (a point inside it, on the grid). Shift, with a point already made: only the aligned places.
 */

/** Two snap places nearer than this are one (the reference editor's 0.01, a reading). */
export const KNIFE_SNAP_MIN_GAP_READING = 0.01;
/** An edge spanning less than this across an aligning plane gives no aligned place (the reference's 0.125 / 2, a reading). */
export const KNIFE_ALIGN_MIN_SPAN_READING = 0.0625;

/** The workplane's frame: its origin and its three axes (its grid's), unit and square to each other. */
export interface KnifeFrame { origin: Vec3; axes: readonly [Vec3, Vec3, Vec3] }
/** The cut's last point so far: where it is, and the edge it is on (`a` to `b`), if one. */
export interface KnifePrev { at: Vec3; edge?: readonly [number, number] }
/** A snap place: the Knife point it makes, where it is, and whether it lines up with the last point. */
export interface KnifeSnap { p: KnifePoint; at: Vec3; aligned: boolean }

const closestOnSegment = (p: Vec3, a: Vec3, b: Vec3): Vec3 => {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 < 1e-10 ? 0 : Math.min(1, Math.max(0, dot(d, sub(p, a)) / l2));
  return add(a, scale(d, t));
};

/** From `origin` toward `end`, the first world grid plane (a multiple of `step` on an axis) crossed, if one before `end`. */
function rayOnGrid(origin: Vec3, end: Vec3, step: number): Vec3 | null {
  const dir = sub(end, origin);
  let best = 1, hit = false;
  for (let k = 0; k < 3; k++) {
    const d = dir[k]!;
    if (d === 0) continue;
    const plane = Math.floor(origin[k]! / step) * step + (d > 0 ? step : 0);
    const t = (plane - origin[k]!) / d;
    if (t > 0 && t <= best) { best = t; hit = true; }
  }
  return hit ? add(origin, scale(dir, best)) : null;
}

/** The edge's nearest place to `p`, moved along it to the nearer grid crossing toward either end. */
function edgeOnGrid(p: Vec3, a: Vec3, b: Vec3, step: number): Vec3 | null {
  const on = closestOnSegment(p, a, b);
  const ga = rayOnGrid(on, a, step), gb = rayOnGrid(on, b, step);
  if (ga && gb) return length(sub(gb, on)) < length(sub(ga, on)) ? gb : ga;
  return ga ?? gb;
}

/** Where segment `a`-`b` crosses the plane through `through` square to `n`, if the edge spans the plane enough. */
function planeOnEdge(n: Vec3, through: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const d = sub(a, b);
  if (length([d[0] * n[0], d[1] * n[1], d[2] * n[2]]) < KNIFE_ALIGN_MIN_SPAN_READING) return null;
  return segmentOnPlane(n, dot(n, through), a, b);
}

function segmentOnPlane(n: Vec3, off: number, a: Vec3, b: Vec3): Vec3 | null {
  const den = dot(n, sub(b, a));
  if (Math.abs(den) < 1e-12) return null;
  const t = (off - dot(n, a)) / den;
  return t < 0 || t > 1 ? null : add(a, scale(sub(b, a), t));
}

/** Where segment `a`-`b` passes through the polygon `ps` (its triangles), if it does. */
function segmentThroughPolygon(ps: readonly Vec3[], a: Vec3, b: Vec3): Vec3 | null {
  const eps = 1e-7;
  for (const [i, j, k] of triangulate(ps)) {
    const v0 = ps[i]!, v1 = ps[j]!, v2 = ps[k]!;
    const raw = cross(sub(v1, v0), sub(v2, v0));
    if (dot(raw, raw) < 1e-8) continue;
    const n = normalize(raw);
    const p = segmentOnPlane(n, dot(n, v0), a, b);
    if (!p) continue;
    const inside = dot(cross(sub(v1, v0), sub(p, v0)), n) >= -eps && dot(cross(sub(v2, v1), sub(p, v1)), n) >= -eps && dot(cross(sub(v0, v2), sub(p, v2)), n) >= -eps;
    if (inside) return p;
  }
  return null;
}

/** The Knife point at `at` on edge `a`-`b`: its end where it lies on one. */
function edgePoint(m: EditMesh, a: number, b: number, at: Vec3): KnifePoint {
  const pa = vertPos(m, a), ab = sub(vertPos(m, b), pa), l2 = dot(ab, ab);
  const t = l2 > 1e-18 ? dot(sub(at, pa), ab) / l2 : 0.5;
  if (t <= 1e-6) return { v: a };
  if (t >= 1 - 1e-6) return { v: b };
  return { a, b, t };
}

/** Every snap place on face `f` for a pointer at `target` on it (in order: points, edges, the face's grid). */
export function knifeSnaps(m: EditMesh, f: number, target: Vec3, step: number, frame: KnifeFrame, prev: KnifePrev | null, alignedOnly = false): KnifeSnap[] {
  const all: KnifeSnap[] = [];
  const vs = faceVerts(m, f);
  for (const v of vs) all.push({ p: { v }, at: vertPos(m, v), aligned: false });
  const perp = prev?.edge ? normalize(sub(vertPos(m, prev.edge[1]), vertPos(m, prev.edge[0]))) : null;
  vs.forEach((a, i) => {
    const b = vs[(i + 1) % vs.length]!;
    const pa = vertPos(m, a), pb = vertPos(m, b);
    const put = (at: Vec3 | null, aligned: boolean): void => { if (at) all.push({ p: edgePoint(m, a, b, at), at, aligned }); };
    put(scale(add(pa, pb), 0.5), false);
    put(edgeOnGrid(target, pa, pb, step), false);
    if (!prev) return;
    for (const n of frame.axes) put(planeOnEdge(n, prev.at, pa, pb), true);
    if (perp) put(planeOnEdge(perp, prev.at, pa, pb), true);
  });
  if (prev) {
    // The grid lines round the pointer's cell of the workplane's grid, each a little past the cell, through the face.
    const ps = vs.map((v) => vertPos(m, v));
    const local = frame.axes.map((ax) => dot(sub(target, frame.origin), ax));
    const lo = local.map((x) => Math.floor(x / step) * step), hi = local.map((x) => Math.ceil(x / step) * step);
    const world = (l: readonly number[]): Vec3 => frame.axes.reduce((s, ax, k) => add(s, scale(ax, l[k]!)), frame.origin);
    for (let k = 0; k < 3; k++) {
      const [i, j] = [(k + 1) % 3, (k + 2) % 3];
      for (const ci of [lo[i]!, hi[i]!]) for (const cj of [lo[j]!, hi[j]!]) {
        const s: number[] = [0, 0, 0], e: number[] = [0, 0, 0];
        s[k] = lo[k]! - 1; e[k] = hi[k]! + 1; s[i] = e[i] = ci; s[j] = e[j] = cj;
        const at = segmentThroughPolygon(ps, world(s), world(e));
        if (at) all.push({ p: { f, at }, at, aligned: false });
      }
    }
  }
  const out: KnifeSnap[] = [];
  for (const s of all) {
    if (alignedOnly && prev && !s.aligned) continue;
    if (out.some((o) => length(sub(o.at, s.at)) < KNIFE_SNAP_MIN_GAP_READING)) continue;
    out.push(s);
  }
  return out;
}

/** The snap place nearest the pointer's `target` (the first, where two are as near), or null with none. */
export function knifeSnapped(m: EditMesh, f: number, target: Vec3, step: number, frame: KnifeFrame, prev: KnifePrev | null, alignedOnly = false): KnifeSnap | null {
  let best: KnifeSnap | null = null, bd = Infinity;
  for (const s of knifeSnaps(m, f, target, step, frame, prev, alignedOnly)) {
    const d = length(sub(s.at, target));
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
