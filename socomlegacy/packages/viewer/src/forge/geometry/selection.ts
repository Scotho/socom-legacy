import {
  add, cross, dot, edgeKey, edgeMap, edgeOfKey, faceVerts, facePoints, length, liveFaces, scale, sub, triangulate, vertFaces, vertPos,
  type EditMesh, type Vec3,
} from './editMesh';
import { displacementGrid } from './displacement';
import { Topo } from './topology';
import { objectFaces, objectVerts, type GeoObject, type WorldGeometry } from './world';

/**
 * Selection in a level editor's four modes (a browser adaptation; the Forge's owner (crispy, OT.R112), 2026-11-14: "an object mode, point mode, edge
 * mode, and face mode"): a whole object, its points, its edges, its faces. Picking is by a ray (the camera's through the
 * cursor): the nearest face it hits, and in point and edge mode the point or edge of that hit nearest the ray within
 * `tolerance` world units. A selection converts between modes as a level editor's does (`selectionVerts`).
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

/** Möller-Trumbore: the ray's distance to triangle a b c, or null (both sides hit, as a level editor picks a face from behind). */
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

/**
 * How a click takes what it hits (the Forge's owner (crispy, OT.R112), 2026-11-16: "holding shift + click should be additive not toggle selection.
 * ctrl + click should be toggleable"): `only` it alone (a plain click; a miss clears), `add` it added (Shift: never taken
 * out), `toggle` it in or out (Ctrl). `true` / `false` are the older `toggle` / `only`.
 */
export type PickOp = 'only' | 'add' | 'toggle';
export const pickOpOf = (how: PickOp | boolean): PickOp => (how === true ? 'toggle' : how === false ? 'only' : how);

/** Picks in the selection's mode and takes what was hit as `how` says (`PickOp`); a plain click's miss clears. */
export function pick(world: WorldGeometry, sel: Selection, ray: Ray, tolerance: number, how: PickOp | boolean = 'only', index?: PickIndex | null): boolean {
  const op = pickOpOf(how);
  const flip = (set: Set<number | string>, k: number | string): void => { if (op === 'toggle' && set.has(k)) set.delete(k); else set.add(k); };
  const itemsOf = (id: string): Set<number | string> => {
    let s = sel.items.get(id);
    if (!s) { s = new Set(); sel.items.set(id, s); }
    sel.objects.add(id);
    return s;
  };
  if (op === 'only') { sel.objects.clear(); sel.items.clear(); }
  if (sel.mode === 'object' || sel.mode === 'face') {
    const hit = pickFace(world, ray, index);
    if (!hit) return false;
    if (sel.mode === 'object') {
      if (op === 'toggle' && sel.objects.has(hit.object.id)) sel.objects.delete(hit.object.id); else sel.objects.add(hit.object.id);
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

/** A selection carried to another mode, as a level editor converts one: faces to their points or edges, points to the faces they close, and so on. */
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

/**
 * Grow or Shrink selection (every modeller's; the Forge's owner (crispy, OT.R112), 2026-11-19: "implement the grow shrink selection"; a browser
 * adaptation, the game has no editor): one object's `items` in `mode`, among `faces`, a step bigger or smaller.
 * As the reference editor's (the Forge's owner (crispy, OT.R112), 2026-11-19: "always match hammer for all tools"): Grow adds a point's
 * neighbours along its edges, the edges meeting a selected edge's ends, and the faces across a selected face's edges
 * (not those touching at a corner alone). Shrink takes off the border: a point with an unselected neighbour, an edge
 * with an end that an unselected edge meets, a face with an edge whose far side is unselected or open -- a selected
 * plane's own rim faces go too.
 */
export function growSelection(m: EditMesh, faces: readonly number[], mode: 'point' | 'edge' | 'face', items: ReadonlySet<number | string>, how: 'grow' | 'shrink'): Set<number | string> {
  const edges = [...edgeMap(m, faces).values()];
  if (mode === 'point') {
    const near = new Map<number, number[]>();
    for (const e of edges) { (near.get(e.a) ?? near.set(e.a, []).get(e.a)!).push(e.b); (near.get(e.b) ?? near.set(e.b, []).get(e.b)!).push(e.a); }
    const sel = items as ReadonlySet<number>;
    if (how === 'grow') return new Set([...sel, ...[...sel].flatMap((v) => near.get(v) ?? [])]);
    return new Set([...sel].filter((v) => (near.get(v) ?? []).every((w) => sel.has(w))));
  }
  if (mode === 'edge') {
    const at = new Map<number, string[]>();
    for (const e of edges) { const k = edgeKey(e.a, e.b); for (const v of [e.a, e.b]) (at.get(v) ?? at.set(v, []).get(v)!).push(k); }
    const sel = new Set([...items].filter((k) => typeof k === 'string' && at.has(edgeOfKey(k)[0]))) as Set<string>;
    const ends = (k: string): number[] => edgeOfKey(k);
    if (how === 'grow') return new Set([...sel, ...[...sel].flatMap((k) => ends(k).flatMap((v) => at.get(v) ?? []))]);
    return new Set([...sel].filter((k) => ends(k).every((v) => (at.get(v) ?? []).every((x) => sel.has(x)))));
  }
  // Faces: across their edges only, as the reference editor's (a face touching at a corner alone is not taken); on
  // shrink a face stays only where every edge has a selected face on its far side -- an open edge is a border.
  const sel = new Set([...items].filter((f) => typeof f === 'number' && m.faces[f])) as Set<number>;
  const byKey = new Map<string, number[]>();
  for (const e of edges) byKey.set(edgeKey(e.a, e.b), e.faces);
  const across = (f: number): number[][] => {
    const vs = faceVerts(m, f);
    return vs.map((a, i) => (byKey.get(edgeKey(a, vs[(i + 1) % vs.length]!)) ?? []).filter((g) => g !== f));
  };
  if (how === 'grow') return new Set([...sel, ...[...sel].flatMap((f) => across(f).flat())]);
  return new Set([...sel].filter((f) => across(f).every((far) => far.length > 0 && far.every((g) => sel.has(g)))));
}

/**
 * Select Ribs (the reference editor's Ctrl+G in Edge mode; the Forge's owner (crispy, OT.R112), 2026-11-20): the selected edges, one run or one
 * loop (the spine; anything else gives nothing), and from each spine edge on both its sides a walk across four-sided
 * faces -- each face's two edges beside the one walked in from (the ribs) taken, then on through its opposite edge
 * into the face beyond -- until a face is not four-sided, the walk runs off the mesh or comes back round. The ribs
 * alone are the new selection, among `faces` (one object's).
 */
export function edgeRibs(m: EditMesh, faces: readonly number[], spine: readonly (readonly [number, number])[]): Set<string> {
  const out = new Set<string>();
  const em = edgeMap(m, faces);
  const keys = [...new Set(spine.map(([a, b]) => edgeKey(a, b)))].filter((k) => em.has(k));
  if (!keys.length) return out;
  // One run or one loop: no point with three spine edges, and all of them joined.
  const at = new Map<number, string[]>();
  for (const k of keys) for (const v of edgeOfKey(k)) (at.get(v) ?? at.set(v, []).get(v)!).push(k);
  if ([...at.values()].some((l) => l.length > 2)) return out;
  const reached = new Set<string>([keys[0]!]);
  const todo = [keys[0]!];
  while (todo.length) for (const v of edgeOfKey(todo.pop()!)) for (const k of at.get(v) ?? []) if (!reached.has(k)) { reached.add(k); todo.push(k); }
  if (reached.size !== keys.length) return out;
  for (const k of keys) {
    const [x0, y0] = edgeOfKey(k);
    for (const f0 of em.get(k)!.faces) {
      let f: number | undefined = f0, x = x0, y = y0;
      const seen = new Set<number>();
      while (f !== undefined && !seen.has(f)) {
        const vs = faceVerts(m, f);
        if (vs.length !== 4) break;
        const i = vs.findIndex((v, j) => (v === x && vs[(j + 1) % 4] === y) || (v === y && vs[(j + 1) % 4] === x));
        if (i < 0) break;
        seen.add(f);
        const p = vs[i]!, q = vs[(i + 1) % 4]!, r = vs[(i + 2) % 4]!, w = vs[(i + 3) % 4]!;
        out.add(edgeKey(w, p));
        out.add(edgeKey(q, r));
        const here: number = f;
        f = em.get(edgeKey(r, w))?.faces.find((g) => g !== here);
        x = r; y = w;
      }
    }
  }
  return out;
}

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

/**
 * The edge loop through edge `a`-`b` among `faces` (every modeller's loop select; the Forge's owner (crispy, OT.R112), 2026-11-18): from
 * each end, on to the edge that carries straight on -- through a point with an even number of edges, the one halfway
 * round its fan (a grid's four: the one sharing no face with the edge arrived on; a sphere's pole: the meridian
 * opposite); along an open border, the next border edge -- until a point where none does (an odd number of edges, a
 * corner of a border), or back at the start. Returns its edges' keys, `a`-`b`'s first.
 *
 * Where it goes on from neither end (each end a corner of three or five edges: every edge of a box -- the Forge's owner (crispy, OT.R112),
 * 2026-11-18: "I create a cube ... double click an edge, doesn't select a loop"), the loop is the border of `side`, the
 * face beside the edge the pointer was on (or the one facing the camera), as modellers loop a box's face: a cube's top
 * edge double-clicked from above, its four top edges.
 */
export function edgeLoop(m: EditMesh, faces: readonly number[], a: number, b: number, side?: number): string[] {
  const t = new Topo(m, faces);
  const start = edgeKey(a, b);
  if (!t.hasEdge(a, b)) return [];
  const out = [start];
  const seen = new Set(out);
  /** The edge carrying on from `u` -> `v` through `v` (as `[v, w]`), or null where none does. */
  const next = (u: number, v: number): number | null => {
    if (t.facesOn(u, v).length === 1) {
      const border = t.spokes(v).filter((w) => w !== u && t.facesOn(v, w).length === 1);
      return border.length === 1 ? border[0]! : null;
    }
    // Through a point whose faces go all the way round it in one fan (`Topo.fan`) with an even number of edges: the edge
    // halfway round -- straight across a grid's four, through a sphere's pole to the meridian opposite (the Forge's owner (crispy, OT.R112),
    // 2026-11-18: "shouldn't an edge loop go around the full circle not just half way?"). An odd count (a box's corner)
    // stops it.
    const fan = t.fan(v);
    if (!fan || !fan.closed) return null;
    const N = fan.out.length;
    const i = fan.out.indexOf(u);
    if (N % 2 !== 0 || N < 2 || i < 0) return null;
    const w = fan.out[(i + N / 2) % N]!;
    return t.facesOn(v, w).length === 2 ? w : null;
  };
  for (const [from, end] of [[a, b], [b, a]] as const) {
    let u: number = from, v: number = end;
    for (;;) {
      const w = next(u, v);
      if (w === null) break;
      const k = edgeKey(v, w);
      if (seen.has(k)) break;
      seen.add(k);
      if (end === b) out.push(k); else out.splice(1, 0, k);
      u = v; v = w;
    }
  }
  // No loop goes on from the edge: the outline of the face beside it with more sides; of two alike, `side` (the face
  // the pointer was over), else the first.
  const beside = t.facesOn(a, b);
  if (out.length === 1 && beside.length) {
    const most = Math.max(...beside.map((f) => t.ring(f).length));
    const widest = beside.filter((f) => t.ring(f).length === most);
    const face = side !== undefined && widest.includes(side) ? side : widest[0]!;
    const vs = faceVerts(m, face);
    const ring = vs.map((v, i) => edgeKey(v, vs[(i + 1) % vs.length]!));
    const at0 = ring.indexOf(start);
    return [...ring.slice(at0), ...ring.slice(0, at0)];
  }
  return out;
}

/**
 * The edge ring through edge `a`-`b` among `faces` (ring select): across each four-sided face beside it to the edge
 * opposite, and on across that edge's other face, until a face that is not four-sided, an open border, or back at the
 * start. Returns its edges' keys, `a`-`b`'s first.
 */
export function edgeRing(m: EditMesh, faces: readonly number[], a: number, b: number): string[] {
  const t = new Topo(m, faces);
  const start = edgeKey(a, b);
  const first = t.facesOn(a, b);
  if (!first.length) return [];
  const out = [start];
  const seen = new Set(out);
  for (const f0 of first) {
    let x = a, y = b, f: number | undefined = f0;
    while (f !== undefined) {
      // Across a face of an even number of sides to the side opposite (a quad's facing side, a hexagon's third on).
      const vs = t.ring(f);
      const n = vs.length;
      if (n % 2 !== 0 || n < 4) break;
      const i = vs.findIndex((v, j) => edgeKey(v, vs[(j + 1) % n]!) === edgeKey(x, y));
      if (i < 0) break;
      const p = vs[(i + n / 2) % n]!, q = vs[(i + n / 2 + 1) % n]!;
      const opp = edgeKey(p, q);
      if (seen.has(opp)) break;
      seen.add(opp);
      out.push(opp);
      const from: number = f;
      // On across the opposite edge, where it has one face more (an edge of three faces or more ends the ring).
      const across = t.facesOn(p, q).filter((g) => g !== from);
      f = across.length === 1 ? across[0] : undefined;
      x = p; y = q;
    }
  }
  return out;
}
