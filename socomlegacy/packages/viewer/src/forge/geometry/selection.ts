import {
  add, cross, dot, edgeKey, edgeMap, edgeOfKey, faceVerts, facePoints, length, liveFaces, scale, sub, triangulate, vertFaces, vertPos,
  type EditMesh, type Vec3,
} from './editMesh';
import { displacementGrid } from './displacement';
import { objectFaces, objectVerts, type GeoObject, type WorldGeometry } from './world';

/**
 * Selection in Hammer's four modes (a browser adaptation; the owner, 2026-11-14: "an object mode, point mode, edge
 * mode, and face mode"): a whole object, its points, its edges, its faces. Picking is by a ray (the camera's through the
 * cursor): the nearest face it hits, and in point and edge mode the point or edge of that hit nearest the ray within
 * `tolerance` world units. A selection converts between modes as Hammer's does (`selectionVerts`).
 */

export type SelectMode = 'object' | 'point' | 'edge' | 'face';

export interface Selection {
  mode: SelectMode;
  /** The objects, by id, a selection's items belong to (object mode: the selected objects). */
  objects: Set<string>;
  /** Per object id: point indices (point mode), edge keys (edge mode), face indices (face mode). */
  items: Map<string, Set<number | string>>;
}

export const emptySelection = (mode: SelectMode = 'object'): Selection => ({ mode, objects: new Set(), items: new Map() });

export interface Ray { origin: readonly number[]; dir: readonly number[] }

/** Möller-Trumbore: the ray's distance to triangle a b c, or null (both sides hit, as Hammer picks a face from behind). */
export function rayTriangle(ray: Ray, a: readonly number[], b: readonly number[], c: readonly number[]): number | null {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(ray.dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const t0 = sub(ray.origin, a);
  const u = dot(t0, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(t0, e1);
  const v = dot(ray.dir, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  return t > 0 ? t : null;
}

export interface Hit { object: GeoObject; face: number; t: number; at: Vec3 }

/** The nearest face of any visible object the ray hits. */
export function pickFace(world: WorldGeometry, ray: Ray, index?: PickIndex | null): Hit | null {
  if (index) return index.pick(ray);
  let best: Hit | null = null;
  // Each mesh walked once, a face's object found by its group (the world's nodes share one mesh).
  const meshes = new Map<EditMesh, Map<number | undefined, GeoObject>>();
  for (const object of world.objects) {
    if (object.hidden) continue;
    let byGroup = meshes.get(object.mesh);
    if (!byGroup) { byGroup = new Map(); meshes.set(object.mesh, byGroup); }
    byGroup.set(object.group, object);
  }
  for (const [m, byGroup] of meshes) {
    const whole = byGroup.get(undefined);
    for (let f = 0; f < m.faces.length; f++) {
      const face = m.faces[f];
      if (!face) continue;
      const object = whole ?? byGroup.get(face.group);
      if (!object) continue;
      let tris: Vec3[][];
      if (face.disp) {
        const g = displacementGrid(m, f);
        tris = g.triangles.map(([a, b, c]) => [g.points[a]!, g.points[b]!, g.points[c]!]);
      } else {
        const ps = facePoints(m, f);
        tris = triangulate(ps).map(([a, b, c]) => [ps[a]!, ps[b]!, ps[c]!]);
      }
      for (const [a, b, c] of tris) {
        const t = rayTriangle(ray, a!, b!, c!);
        if (t !== null && (!best || t < best.t)) best = { object, face: f, t, at: add(ray.origin, scale(ray.dir, t)) };
      }
    }
  }
  return best;
}

/** A point's distance from the ray's line. */
const rayDistance = (ray: Ray, p: readonly number[]): number => {
  const d = sub(p, ray.origin);
  const t = Math.max(0, dot(d, ray.dir) / dot(ray.dir, ray.dir));
  return length(sub(d, scale(ray.dir, t)));
};

/** The point of the hit face nearest the ray's hit, if within `tolerance`. */
export function pickPoint(world: WorldGeometry, ray: Ray, tolerance: number): { object: GeoObject; vert: number } | null {
  const hit = pickFace(world, ray);
  if (!hit) return null;
  let best: { object: GeoObject; vert: number; d: number } | null = null;
  for (const v of faceVerts(hit.object.mesh, hit.face)) {
    const d = rayDistance(ray, vertPos(hit.object.mesh, v));
    if (d <= tolerance && (!best || d < best.d)) best = { object: hit.object, vert: v, d };
  }
  return best && { object: best.object, vert: best.vert };
}

/** A segment's distance from the ray's hit point. */
function segmentDistance(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const ab = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / Math.max(1e-12, dot(ab, ab))));
  return length(sub(p, add(a, scale(ab, t))));
}

/** The edge of the hit face nearest the hit, if within `tolerance`. */
export function pickEdge(world: WorldGeometry, ray: Ray, tolerance: number): { object: GeoObject; edge: string } | null {
  const hit = pickFace(world, ray);
  if (!hit) return null;
  const vs = faceVerts(hit.object.mesh, hit.face);
  let best: { edge: string; d: number } | null = null;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
    const d = segmentDistance(hit.at, vertPos(hit.object.mesh, a), vertPos(hit.object.mesh, b));
    if (d <= tolerance && (!best || d < best.d)) best = { edge: edgeKey(a, b), d };
  }
  return best && { object: hit.object, edge: best.edge };
}

/** Picks in the selection's mode and adds (or with `toggle`, flips) what was hit; a miss without `toggle` clears. */
export function pick(world: WorldGeometry, sel: Selection, ray: Ray, tolerance: number, toggle = false, index?: PickIndex | null): boolean {
  const flip = (set: Set<number | string>, k: number | string): void => { if (toggle && set.has(k)) set.delete(k); else set.add(k); };
  const itemsOf = (id: string): Set<number | string> => {
    let s = sel.items.get(id);
    if (!s) { s = new Set(); sel.items.set(id, s); }
    sel.objects.add(id);
    return s;
  };
  if (!toggle) { sel.objects.clear(); sel.items.clear(); }
  if (sel.mode === 'object' || sel.mode === 'face') {
    const hit = pickFace(world, ray, index);
    if (!hit) return false;
    if (sel.mode === 'object') {
      if (toggle && sel.objects.has(hit.object.id)) sel.objects.delete(hit.object.id); else sel.objects.add(hit.object.id);
    } else flip(itemsOf(hit.object.id), hit.face);
    return true;
  }
  if (sel.mode === 'point') {
    const hit = pickPoint(world, ray, tolerance);
    if (!hit) return false;
    flip(itemsOf(hit.object.id), hit.vert);
    return true;
  }
  const hit = pickEdge(world, ray, tolerance);
  if (!hit) return false;
  flip(itemsOf(hit.object.id), hit.edge);
  return true;
}

/** The points a selection moves in an object: an object's every point, a face's, an edge's two, a point itself. */
export function selectionVerts(sel: Selection, object: GeoObject): Set<number> {
  const m = object.mesh;
  if (sel.mode === 'object') return sel.objects.has(object.id) ? objectVerts(object) : new Set();
  const items = sel.items.get(object.id);
  if (!items) return new Set();
  if (sel.mode === 'point') return new Set([...items] as number[]);
  if (sel.mode === 'edge') return new Set([...items].flatMap((k) => edgeOfKey(k as string)));
  return new Set([...items].flatMap((f) => (m.faces[f as number] ? faceVerts(m, f as number) : [])));
}

/** A selection carried to another mode, as Hammer converts one: faces to their points or edges, points to the faces they close, and so on. */
export function convertSelection(world: WorldGeometry, sel: Selection, mode: SelectMode): Selection {
  const out = emptySelection(mode);
  for (const object of world.objects) {
    if (!sel.objects.has(object.id)) continue;
    const m = object.mesh;
    const verts = selectionVerts(sel, object);
    if (mode === 'object') { out.objects.add(object.id); continue; }
    let items: Set<number | string>;
    if (mode === 'point') items = new Set(verts);
    else if (mode === 'edge') items = new Set([...edgeMap(m, objectFaces(object)).values()].filter((e) => verts.has(e.a) && verts.has(e.b)).map((e) => edgeKey(e.a, e.b)));
    else {
      const mine = new Set(objectFaces(object));
      const users = vertFaces(m);
      const faces = new Set<number>();
      for (const v of verts) for (const f of users.get(v) ?? []) if (mine.has(f) && faceVerts(m, f).every((x) => verts.has(x))) faces.add(f);
      items = faces;
    }
    if (items.size) { out.objects.add(object.id); out.items.set(object.id, items); }
  }
  return out;
}

/** A selection's middle: where the gizmo stands. */
export function selectionCentre(world: WorldGeometry, sel: Selection): Vec3 | null {
  let sum: Vec3 = [0, 0, 0], n = 0;
  for (const object of world.objects) for (const v of selectionVerts(sel, object)) { sum = add(sum, vertPos(object.mesh, v)); n++; }
  return n ? scale(sum, 1 / n) : null;
}

/** The faces a face selection holds in one object (what the texture tools act on). */
export const selectedFaces = (sel: Selection, id: string): number[] =>
  sel.mode === 'face' ? [...(sel.items.get(id) ?? [])].filter((x): x is number => typeof x === 'number') : [];

export type { EditMesh };

/**
 * A pick index over the visible objects (the occluded-pick fix, 2026-11-15): each object's triangles in world space and
 * their box, rebuilt when the geometry changes. A ray tests only the objects whose box it passes, so a pick and the
 * visibility tests the point and edge picks make (`visible`) cost a few objects' triangles, not the whole map's.
 */
export class PickIndex {
  private constructor(private readonly entries: { object: GeoObject; min: Vec3; max: Vec3; tris: Float32Array; faces: Int32Array }[]) {}

  static build(world: WorldGeometry): PickIndex {
    const entries: { object: GeoObject; min: Vec3; max: Vec3; tris: Float32Array; faces: Int32Array }[] = [];
    for (const object of world.objects) {
      if (object.hidden) continue;
      const m = object.mesh;
      const tris: number[] = [], faces: number[] = [];
      for (const f of objectFaces(object)) {
        const face = m.faces[f]!;
        let list: Vec3[][];
        if (face.disp) {
          const g = displacementGrid(m, f);
          list = g.triangles.map(([a, b, c]) => [g.points[a]!, g.points[b]!, g.points[c]!]);
        } else {
          const ps = facePoints(m, f);
          list = triangulate(ps).map(([a, b, c]) => [ps[a]!, ps[b]!, ps[c]!]);
        }
        for (const t of list) { for (const p of t) tris.push(p[0], p[1], p[2]); faces.push(f); }
      }
      if (!faces.length) continue;
      const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, tris[i + k]!); max[k] = Math.max(max[k]!, tris[i + k]!); }
      entries.push({ object, min, max, tris: Float32Array.from(tris), faces: Int32Array.from(faces) });
    }
    return new PickIndex(entries);
  }

  /** The ray's entry into a box, or null when it misses it (slab test); 0 from inside. */
  private static boxT(ray: Ray, min: Vec3, max: Vec3): number | null {
    let t0 = 0, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      const o = ray.origin[k]!, d = ray.dir[k]!;
      if (Math.abs(d) < 1e-12) { if (o < min[k]! || o > max[k]!) return null; continue; }
      let a = (min[k]! - o) / d, b = (max[k]! - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0;
  }

  /** The nearest face the ray hits, as `pickFace`; an object `skip` answers true for left out (a dragged one's own). */
  pick(ray: Ray, skip?: (o: GeoObject) => boolean): Hit | null {
    let best: Hit | null = null;
    for (const e of this.entries) {
      if (skip?.(e.object)) continue;
      const tb = PickIndex.boxT(ray, e.min, e.max);
      if (tb === null || (best && tb > best.t)) continue;
      const t = e.tris;
      for (let i = 0; i < e.faces.length; i++) {
        const o = i * 9;
        const h = rayTriangle(ray, [t[o]!, t[o + 1]!, t[o + 2]!], [t[o + 3]!, t[o + 4]!, t[o + 5]!], [t[o + 6]!, t[o + 7]!, t[o + 8]!]);
        if (h !== null && (!best || h < best.t)) best = { object: e.object, face: e.faces[i]!, t: h, at: add(ray.origin, scale(ray.dir, h)) };
      }
    }
    return best;
  }

  /**
   * Whether `p` is seen from `eye`: nothing the index holds lies between them, short of `p` by a small allowance (the
   * point stands on faces of its own, which a ray to it meets at its own range).
   */
  visible(eye: readonly number[], p: readonly number[]): boolean {
    const d = sub(p, eye);
    const len = length(d);
    if (len < 1e-9) return true;
    const ray: Ray = { origin: eye, dir: scale(d, 1 / len) };
    const reach = len - Math.max(len * 2e-3, 0.05);
    for (const e of this.entries) {
      const tb = PickIndex.boxT(ray, e.min, e.max);
      if (tb === null || tb > reach) continue;
      const t = e.tris;
      for (let i = 0; i < e.faces.length; i++) {
        const o = i * 9;
        const h = rayTriangle(ray, [t[o]!, t[o + 1]!, t[o + 2]!], [t[o + 3]!, t[o + 4]!, t[o + 5]!], [t[o + 6]!, t[o + 7]!, t[o + 8]!]);
        if (h !== null && h < reach) return false;
      }
    }
    return true;
  }
}
