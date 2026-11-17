import {
  add, addCorner, addFace, addVert, cloneCorner, cornerAttrs, edgeKey, edgeMap, faceNormal, faceVerts, lerp, liveFaces, normalize, scale,
  vertFaces, vertPos, type EditMesh, type Vec3,
} from './editMesh';
import { lockMapping, refreshUvs, type TextureSize } from './texturing';

/**
 * The geometry tools (a browser adaptation, after Hammer's mesh tools): each changes the mesh in place and says what it
 * made, so the selection can follow. A face a tool touches loses its disc face normal (the compile computes it anew).
 */

/** A column-major 4x4's action on a point. */
export const applyMat = (mat: ArrayLike<number>, p: readonly number[]): Vec3 => [
  mat[0]! * p[0]! + mat[4]! * p[1]! + mat[8]! * p[2]! + mat[12]!,
  mat[1]! * p[0]! + mat[5]! * p[1]! + mat[9]! * p[2]! + mat[13]!,
  mat[2]! * p[0]! + mat[6]! * p[1]! + mat[10]! * p[2]! + mat[14]!,
];

export const translation = (d: readonly number[]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0]!, d[1]!, d[2]!, 1];

/**
 * Moves `verts` by `mat`. `textureLock`: a face all of whose points move takes its mapping with it (Hammer's texture
 * lock), its uvs rewritten; a face partly moved stretches as Hammer's does. Faces touched lose their disc normal.
 */
export function transformVerts(m: EditMesh, verts: Iterable<number>, mat: ArrayLike<number>, opts: { textureLock?: boolean; size?: TextureSize } = {}): void {
  const moved = new Set(verts);
  for (const v of moved) {
    const p = applyMat(mat, vertPos(m, v));
    m.verts[v * 3] = p[0]; m.verts[v * 3 + 1] = p[1]; m.verts[v * 3 + 2] = p[2];
  }
  // Bug 16: a moved point's corners carry their visual's centroid with it (`LoadedMesh.centre`, per vertex in a merged
  // draw): the alpha pass's far-to-near order and the detail pass's range read it, so a moved piece is drawn where it
  // now stands, not sorted and gated where it was read.
  for (let c = 0; c < m.cVert.length; c++) {
    if (!moved.has(m.cVert[c]!)) continue;
    const q = applyMat(mat, [m.cCentroid[c * 3]!, m.cCentroid[c * 3 + 1]!, m.cCentroid[c * 3 + 2]!]);
    m.cCentroid[c * 3] = q[0]; m.cCentroid[c * 3 + 1] = q[1]; m.cCentroid[c * 3 + 2] = q[2];
  }
  const touched: number[] = [];
  for (const f of liveFaces(m)) {
    const vs = faceVerts(m, f);
    if (!vs.some((v) => moved.has(v))) continue;
    const face = m.faces[f]!;
    face.normal = null;
    if (opts.textureLock && face.mapping && vs.every((v) => moved.has(v))) face.mapping = lockMapping(face.mapping, mat);
    touched.push(f);
  }
  if (opts.size) refreshUvs(m, touched, opts.size);
}

/**
 * Bug 5 (the geometry audit: "Grid snap snaps the selection's centre, not each point, so points end up off-grid. Hammer
 * snaps vertices"): each of `verts` put on the grid of `step` along the axes `axes` says were moved ([x, y, z]), so a
 * move along one axis never nudges the others; the faces touched lose their disc normal and take fresh uvs.
 */
export function snapVerts(m: EditMesh, verts: Iterable<number>, step: number, axes: readonly boolean[], opts: { size?: TextureSize } = {}): void {
  if (!(step > 0)) return;
  const moved = new Set(verts);
  for (const v of moved) for (let k = 0; k < 3; k++) if (axes[k]) m.verts[v * 3 + k] = Math.round(m.verts[v * 3 + k]! / step) * step + 0;
  const touched: number[] = [];
  for (const f of liveFaces(m)) {
    if (!faceVerts(m, f).some((v) => moved.has(v))) continue;
    m.faces[f]!.normal = null;
    touched.push(f);
  }
  if (opts.size) refreshUvs(m, touched, opts.size);
}

/** Deletes faces; their points stay until nothing uses them (the compile leaves an unused point out). */
export function deleteFaces(m: EditMesh, faces: Iterable<number>): void {
  for (const f of faces) m.faces[f] = null;
}

/** Deletes points and every face that uses one. */
export function deleteVerts(m: EditMesh, verts: Iterable<number>): void {
  const gone = new Set(verts);
  for (const f of liveFaces(m)) if (faceVerts(m, f).some((v) => gone.has(v))) m.faces[f] = null;
}

/** Deletes edges: every face along one. */
export function deleteEdges(m: EditMesh, edges: Iterable<[number, number]>): void {
  const em = edgeMap(m);
  for (const [a, b] of edges) for (const f of em.get(edgeKey(a, b))?.faces ?? []) m.faces[f] = null;
}

/** Reverses faces' winding (their front side). */
export function flipFaces(m: EditMesh, faces: Iterable<number>): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    face.corners.reverse();
    face.normal = face.normal && [-face.normal[0], -face.normal[1], -face.normal[2]];
    for (const c of face.corners) for (let k = 0; k < 3; k++) m.cNormal[c * 3 + k] = -m.cNormal[c * 3 + k]!;
  }
}

/**
 * Extrudes a face region by `distance` along its mean normal (Hammer's extrude): the region's points copied and moved,
 * the region's faces put on the copies, and a four-sided wall along every edge of the region's border, its outward
 * side out. Returns the region's faces (now moved) and the walls.
 */
export function extrudeFaces(m: EditMesh, faces: readonly number[], distance: number): { faces: number[]; walls: number[] } {
  const region = faces.filter((f) => m.faces[f]);
  if (!region.length) return { faces: [], walls: [] };
  const n = normalize(region.reduce((s, f) => add(s, faceNormal(m, f)), [0, 0, 0] as Vec3));
  const d = scale(n, distance);
  // The border: a region edge used once inside the region, kept in the winding of the face that has it.
  const inside = edgeMap(m, region);
  const border: { a: number; b: number; ca: number; cb: number; face: number }[] = [];
  for (const f of region) {
    const face = m.faces[f]!;
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
      if (inside.get(edgeKey(a, b))!.faces.length === 1) border.push({ a, b, ca: face.corners[i]!, cb: face.corners[(i + 1) % vs.length]!, face: f });
    }
  }
  const copy = new Map<number, number>();
  for (const f of region) for (const v of faceVerts(m, f)) if (!copy.has(v)) copy.set(v, addVert(m, add(vertPos(m, v), d)));
  // The region's faces onto the copies, with corners of their own.
  const cornerCopy = new Map<number, number>();
  for (const f of region) {
    const face = m.faces[f]!;
    face.corners = face.corners.map((c) => {
      let nc = cornerCopy.get(c);
      if (nc === undefined) { nc = cloneCorner(m, c, copy.get(m.cVert[c]!)!); cornerCopy.set(c, nc); }
      return nc;
    });
    face.normal = null;
    if (face.mapping) face.mapping = lockMapping(face.mapping, translation(d));
  }
  // A wall each border edge a -> b: a, b, b', a' faces out (the region's winding, extruded along its normal).
  const walls: number[] = [];
  for (const e of border) {
    const style = m.faces[e.face]!.style;
    const A = cornerAttrs(m, e.ca), B = cornerAttrs(m, e.cb);
    const corners = [
      addCorner(m, e.a, A), addCorner(m, e.b, B), addCorner(m, copy.get(e.b)!, B), addCorner(m, copy.get(e.a)!, A),
    ];
    const w = addFace(m, corners, style);
    const wn = faceNormal(m, w);
    for (const c of corners) for (let k = 0; k < 3; k++) m.cNormal[c * 3 + k] = wn[k]!;
    walls.push(w);
  }
  return { faces: region, walls };
}

/**
 * Splits edge `a`-`b` at `t` (0 at `a`): a new point there, put into every face along the edge between its two corners,
 * its corner attributes spread from theirs. Returns the new point.
 */
export function splitEdge(m: EditMesh, a: number, b: number, t = 0.5): number {
  const v = addVert(m, lerp(vertPos(m, a), vertPos(m, b), t));
  for (const f of liveFaces(m)) {
    const face = m.faces[f]!;
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) {
      const x = vs[i]!, y = vs[(i + 1) % vs.length]!;
      if (!((x === a && y === b) || (x === b && y === a))) continue;
      const cx = cornerAttrs(m, face.corners[i]!), cy = cornerAttrs(m, face.corners[(i + 1) % vs.length]!);
      const s = x === a ? t : 1 - t;
      const c = addCorner(m, v, { uv: lerp(cx.uv, cy.uv, s), color: lerp(cx.color, cy.color, s), normal: normalize(lerp(cx.normal, cy.normal, s)), centroid: cx.centroid });
      face.corners.splice(i + 1, 0, c);
      face.normal = null;
      break;
    }
  }
  return v;
}

/**
 * Cuts face `f` from its corner `i` to its corner `j` (Hammer's knife between two points of a face): two faces, both
 * keeping its style and mapping. Returns them, or null when the two corners are the same or neighbours.
 */
export function cutFace(m: EditMesh, f: number, i: number, j: number): [number, number] | null {
  const face = m.faces[f];
  if (!face) return null;
  const n = face.corners.length;
  if (i === j || (i + 1) % n === j || (j + 1) % n === i) return null;
  const [lo, hi] = i < j ? [i, j] : [j, i];
  const first = face.corners.slice(lo, hi + 1);
  const second = [...face.corners.slice(hi), ...face.corners.slice(0, lo + 1)];
  face.corners = first;
  face.normal = null;
  const g = addFace(m, second.map((c) => cloneCorner(m, c)), face.style);
  if (face.mapping) m.faces[g]!.mapping = { ...face.mapping };
  return [f, g];
}

/**
 * Merges two faces sharing one edge into one polygon (dissolving the edge), the first's style and mapping kept.
 * Returns the merged face, or null when they share no single edge.
 */
export function mergeFaces(m: EditMesh, f: number, g: number): number | null {
  const F = m.faces[f], G = m.faces[g];
  if (!F || !G || f === g) return null;
  const fv = faceVerts(m, f), gv = faceVerts(m, g);
  for (let i = 0; i < fv.length; i++) {
    const a = fv[i]!, b = fv[(i + 1) % fv.length]!;
    const k = gv.findIndex((v, idx) => v === b && gv[(idx + 1) % gv.length] === a);
    if (k < 0) continue;
    // f's ring up to a, then g's ring from a round to b, then f's on from b.
    const gRing: number[] = [];
    for (let s = 2; s < gv.length; s++) gRing.push(G.corners[(k + s) % gv.length]!);
    F.corners = [...F.corners.slice(0, i + 1), ...gRing, ...F.corners.slice(i + 1)];
    F.normal = null;
    m.faces[g] = null;
    return f;
  }
  return null;
}

/** Welds points into one at their middle (Hammer's merge); faces left with fewer than three points are dropped. */
export function weldVerts(m: EditMesh, verts: readonly number[]): number | null {
  if (verts.length < 2) return null;
  const keep = verts[0]!;
  const mid = scale(verts.reduce((s, v) => add(s, vertPos(m, v)), [0, 0, 0] as Vec3), 1 / verts.length);
  m.verts[keep * 3] = mid[0]; m.verts[keep * 3 + 1] = mid[1]; m.verts[keep * 3 + 2] = mid[2];
  const gone = new Set(verts.slice(1));
  for (let c = 0; c < m.cVert.length; c++) if (gone.has(m.cVert[c]!)) m.cVert[c] = keep;
  for (const f of liveFaces(m)) {
    const face = m.faces[f]!;
    const vs = faceVerts(m, f);
    if (!vs.includes(keep)) continue;
    // Drop corners on the same point back to back.
    face.corners = face.corners.filter((c, i) => m.cVert[c] !== m.cVert[face.corners[(i + 1) % face.corners.length]!]);
    face.normal = null;
    if (face.corners.length < 3) m.faces[f] = null;
  }
  return keep;
}

/** Splits a face's ring off its neighbours: its points copied so it moves alone (Hammer's detach). */
export function detachFaces(m: EditMesh, faces: readonly number[]): void {
  const mine = new Set(faces);
  const users = vertFaces(m);
  const copy = new Map<number, number>();
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    face.corners = face.corners.map((c) => {
      const v = m.cVert[c]!;
      if ((users.get(v) ?? []).every((g) => mine.has(g))) return c;
      let nv = copy.get(v);
      if (nv === undefined) { nv = addVert(m, vertPos(m, v)); copy.set(v, nv); }
      return cloneCorner(m, c, nv);
    });
  }
}

/*
 * Dissolve (Hammer's Backspace in its vertex, edge and face tools; Delete there removes, leaving a hole): the element
 * goes and the faces around it become one, so the surface stays closed.
 */

/** Drops a ring's corners that repeat their neighbour's point (cyclically), as a merge round a point leaves them. */
function tidyRing(m: EditMesh, f: number): void {
  const face = m.faces[f];
  if (!face) return;
  let ring = face.corners;
  const at = (i: number): number => m.cVert[ring[((i % ring.length) + ring.length) % ring.length]!]!;
  let changed = true;
  while (changed && ring.length > 2) {
    changed = false;
    // A point twice in a row: once is enough.
    for (let i = 0; i < ring.length; i++) if (at(i) === at(i + 1)) { ring = ring.filter((_, k) => k !== i); changed = true; break; }
    if (changed) continue;
    // A spike, x y x: an edge in and straight back out, which a merge round a point leaves; y and the second x go.
    for (let i = 0; i < ring.length && ring.length > 3; i++) {
      if (at(i - 1) !== at(i + 1)) continue;
      const drop = new Set([i, (i + 1) % ring.length]);
      ring = ring.filter((_, k) => !drop.has(k));
      changed = true;
      break;
    }
  }
  face.corners = ring;
  if (ring.length < 3) m.faces[f] = null;
}

/** The live face holding the directed or reversed edge a-b, other than `not`. */
function faceAlong(m: EditMesh, a: number, b: number, among: Iterable<number>, not = -1): number | null {
  for (const f of among) {
    if (f === not || !m.faces[f]) continue;
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) {
      const x = vs[i]!, y = vs[(i + 1) % vs.length]!;
      if ((x === a && y === b) || (x === b && y === a)) return f;
    }
  }
  return null;
}

/**
 * Dissolves edges: the two faces each one parts merged into one polygon (Hammer's edge tool, Backspace). An edge on the
 * border (one face) has nothing to merge and stays. Returns the merged faces and how many edges stayed.
 */
export function dissolveEdges(m: EditMesh, edges: Iterable<[number, number]>): { faces: number[]; kept: number } {
  const users = vertFaces(m);
  const merged = new Set<number>();
  let kept = 0;
  for (const [a, b] of edges) {
    const around = new Set([...(users.get(a) ?? []), ...(users.get(b) ?? [])]);
    const f = faceAlong(m, a, b, around);
    const g = f === null ? null : faceAlong(m, a, b, around, f);
    if (f === null) continue;                        // gone already: an earlier merge took it inside its face
    if (g === null) { kept++; continue; }            // a border edge: one face, nothing to merge with
    const into = mergeFaces(m, f, g) ?? mergeFaces(m, g, f);
    if (into === null) { kept++; continue; }
    tidyRing(m, into);
    // The merged face now stands for the face that went, for the next edge.
    const gone = into === f ? g : f;
    for (const v of faceVerts(m, into)) { const l = users.get(v); if (l && !l.includes(into)) l.push(into); }
    for (const l of users.values()) { const i = l.indexOf(gone); if (i >= 0) l.splice(i, 1); }
    merged.delete(gone);
    merged.add(into);
  }
  return { faces: [...merged].filter((f) => m.faces[f]), kept };
}

/**
 * Dissolves points (Hammer's vertex tool, Backspace): a point on a straight run between two others (two edges) is taken
 * out of its faces, which keep their shape; any other has the faces round it merged into one polygon without it. A point
 * whose faces cannot become one (a border fan with a single face) stays. Returns the faces made and the points that stayed.
 */
export function dissolveVerts(m: EditMesh, verts: Iterable<number>): { faces: number[]; kept: number } {
  const made = new Set<number>();
  let kept = 0;
  for (const v of verts) {
    const around = liveFaces(m).filter((f) => faceVerts(m, f).includes(v));
    if (!around.length) continue;
    const spokes = new Set<number>();
    for (const f of around) {
      const vs = faceVerts(m, f);
      vs.forEach((x, i) => { if (x === v) { spokes.add(vs[(i + 1) % vs.length]!); spokes.add(vs[(i + vs.length - 1) % vs.length]!); } });
    }
    if (spokes.size === 2) {
      // A point on a run: out of each face that keeps three corners.
      if (around.some((f) => m.faces[f]!.corners.length <= 3)) { kept++; continue; }
      for (const f of around) { const face = m.faces[f]!; face.corners = face.corners.filter((c) => m.cVert[c] !== v); face.normal = null; made.add(f); }
      continue;
    }
    // The fan merged across its spokes, then the point taken out of the one face left.
    let into = around[0]!;
    let pending = around.slice(1);
    for (let guard = 0; pending.length && guard < around.length * around.length; guard++) {
      const next: number[] = [];
      for (const g of pending) {
        const r = mergeFaces(m, into, g) ?? mergeFaces(m, g, into);
        if (r === null) next.push(g); else into = r;
      }
      if (next.length === pending.length) break;
      pending = next;
    }
    if (pending.length) { kept++; continue; }
    const face = m.faces[into]!;
    face.corners = face.corners.filter((c) => m.cVert[c] !== v);
    face.normal = null;
    tidyRing(m, into);
    if (m.faces[into]) made.add(into);
  }
  return { faces: [...made].filter((f) => m.faces[f]), kept };
}

/**
 * Dissolves faces (Hammer's face tool, Backspace): the selected faces that touch along an edge merged into one polygon
 * each connected group, the first's texture kept. Returns the faces left.
 */
export function dissolveFaces(m: EditMesh, faces: readonly number[]): number[] {
  const live = new Set(faces.filter((f) => m.faces[f]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of [...live]) {
      if (!m.faces[f]) { live.delete(f); continue; }
      for (const g of live) {
        if (g === f || !m.faces[g]) continue;
        const r = mergeFaces(m, f, g) ?? mergeFaces(m, g, f);
        if (r === null) continue;
        tidyRing(m, r);
        live.delete(r === f ? g : f);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return [...live].filter((f) => m.faces[f]);
}
