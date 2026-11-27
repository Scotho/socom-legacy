import {
  add, addVert, cloneCorner, cornerAttrs, cross, dot, edgeKey, faceVerts, length, lerp, liveFaces, normalize, scale, sub, triangulate,
  vertFaces, vertPos, type EditMesh, type Vec3,
} from './editMesh';
import { lockMapping, refreshUvs, type TextureSize } from './texturing';
import { floorOrWall } from './collision';
import { MeshError, transact, type Attrs, type Topo } from './topology';

/**
 * The geometry tools (a browser adaptation, after a level editor's mesh tools): each changes the mesh in place and says what it
 * made, so the selection can follow. Every tool that changes the mesh's shape of faces runs as one transaction over a
 * `./topology` `Topo` (the Forge's owner (crispy, OT.R112), 2026-11-19: "rebuild it as half edge"): built from its few operators, checked at the
 * end, and undone whole where the check fails -- a tool does all its work or none. A face a tool touches loses its disc
 * face normal (the compile computes it anew).
 */

/** A column-major 4x4's action on a point. */
export const applyMat = (mat: ArrayLike<number>, p: readonly number[]): Vec3 => [
  mat[0]! * p[0]! + mat[4]! * p[1]! + mat[8]! * p[2]! + mat[12]!,
  mat[1]! * p[0]! + mat[5]! * p[1]! + mat[9]! * p[2]! + mat[13]!,
  mat[2]! * p[0]! + mat[6]! * p[1]! + mat[10]! * p[2]! + mat[14]!,
];

export const translation = (d: readonly number[]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0]!, d[1]!, d[2]!, 1];

/**
 * Moves `verts` by `mat`. `textureLock`: a face all of whose points move takes its mapping with it (a level editor's texture
 * lock), its uvs rewritten; a face partly moved stretches as a level editor's does. Faces touched lose their disc normal.
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
 * Bug 5 (the geometry audit: "Grid snap snaps the selection's centre, not each point, so points end up off-grid. A level editor
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

/**
 * Points put where `places` says (the reference editor's Snap to Grid, Snap to Vertex and Snap Edges, the Forge's owner (crispy, OT.R112),
 * 2026-11-20): each point moved, nothing joined -- two points brought to one place stay two; the faces touched lose
 * their disc normal and take fresh uvs.
 */
export function placeVerts(m: EditMesh, places: ReadonlyMap<number, readonly number[]>, opts: { size?: TextureSize } = {}): void {
  for (const [v, p] of places) { m.verts[v * 3] = p[0]!; m.verts[v * 3 + 1] = p[1]!; m.verts[v * 3 + 2] = p[2]!; }
  const touched: number[] = [];
  for (const f of liveFaces(m)) {
    if (!faceVerts(m, f).some((v) => places.has(v))) continue;
    m.faces[f]!.normal = null;
    touched.push(f);
  }
  if (opts.size) refreshUvs(m, touched, opts.size);
}

/**
 * `p` on the grid of `step` in the workplane's frame (`origin`, three unit axes square to each other): each of its
 * three coordinates there rounded to the step (the reference editor's Snap to Grid snaps to its workplane; how its
 * snap treats the axis off the plane is not in the source read -- rounding it as the other two is this reading).
 */
export function onFrameGrid(p: readonly number[], origin: readonly number[], axes: readonly (readonly number[])[], step: number): Vec3 {
  const d = sub(p as Vec3, origin as Vec3);
  return axes.reduce<Vec3>((s, ax) => add(s, scale(ax as Vec3, Math.round(dot(d, ax as Vec3) / step) * step)), [origin[0]!, origin[1]!, origin[2]!]);
}

/** Deletes faces; their points stay until nothing uses them (the compile leaves an unused point out). */
export function deleteFaces(m: EditMesh, faces: Iterable<number>): void {
  for (const f of faces) m.faces[f] = null;
}

/**
 * Deletes points as a level editor's vertex Delete does (the Forge's owner (crispy, OT.R112), 2026-11-19: one to one with the
 * reference editor): each face round a point loses that corner -- its two
 * neighbours joined straight across -- and a triangle, which would have only two left, goes. A box's corner deleted
 * leaves its three faces cut back to triangles round a three-sided hole.
 */
export function deleteVerts(m: EditMesh, verts: Iterable<number>): void {
  const list = [...verts];
  transact(m, { open: true, many: true, twice: true, slivers: true }, undefined, (T) => {
    for (const v of list) {
      for (const f of T.facesAt(v)) {
        const ring = T.ring(f);
        if (ring.length <= 3) { T.kill(f); continue; }
        T.setRing(f, m.faces[f]!.corners.filter((c) => m.cVert[c] !== v));
      }
    }
  });
}

/** Deletes edges: every face along one. */
export function deleteEdges(m: EditMesh, edges: Iterable<[number, number]>): void {
  const users = vertFaces(m);
  for (const [a, b] of edges) {
    for (const f of users.get(a) ?? []) {
      if (!m.faces[f]) continue;
      const vs = faceVerts(m, f);
      if (vs.some((x, i) => { const y = vs[(i + 1) % vs.length]; return (x === a && y === b) || (x === b && y === a); })) m.faces[f] = null;
    }
  }
}

/** Reverses faces' winding (their front side). Never refused: a face turned against its neighbours is the owner's call. */
export function flipFaces(m: EditMesh, faces: Iterable<number>): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    face.corners.reverse();
    face.normal = face.normal && [-face.normal[0], -face.normal[1], -face.normal[2]];
    for (const c of new Set(face.corners)) for (let k = 0; k < 3; k++) m.cNormal[c * 3 + k] = -m.cNormal[c * 3 + k]!;
  }
}

/** Welds points into one at their middle (a level editor's merge); faces left with fewer than three points are dropped. */
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

/** Splits a face's ring off its neighbours: its points copied so it moves alone (a level editor's detach). */
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

/* ---------- the operators, one at a time ---------- */

/**
 * Splits edge `a`-`b` at `t` (0 at `a`): a new point there, put into every face along the edge between its two corners,
 * its corner attributes spread from theirs (`Topo.splitEdge`). Returns the new point, or -1 where there is no such edge.
 */
export function splitEdge(m: EditMesh, a: number, b: number, t = 0.5): number {
  return transact(m, {}, -1, (T) => T.splitEdge(a, b, t));
}

/**
 * Cuts face `f` from its corner `i` to its corner `j` (a level editor's knife between two points of a face; `Topo.splitFace`):
 * two faces, both keeping its style, mapping, object and words. Returns them, or null where the two corners are the
 * same or neighbours, or the cut is an edge already.
 */
export function cutFace(m: EditMesh, f: number, i: number, j: number): [number, number] | null {
  return transact<[number, number] | null>(m, {}, null, (T) => {
    if (!T.live(f)) throw new MeshError(`face ${f} is gone`);
    const vs = T.ring(f);
    return T.splitFace(f, vs[i]!, vs[j]!);
  });
}

/**
 * Merges two faces meeting along one run of edges into one polygon (`Topo.joinFaces`), the first's style and mapping
 * kept. Returns the merged face, or null where they do not meet so, or would not make one simple face.
 */
export function mergeFaces(m: EditMesh, f: number, g: number): number | null {
  return transact<number | null>(m, {}, null, (T) => {
    const r = T.joinFaces(f, g);
    if (r === null) throw new MeshError('the faces do not join into one');
    return r;
  });
}

/**
 * Edges each cut into `cuts` + 1 equal pieces (Subdivide on edges; its Cuts, the Forge's owner (crispy, OT.R112), 2026-11-19: "parametric values
 * ... for each edit tool"). Returns the pieces' keys, for the selection.
 */
export function subdivideEdges(m: EditMesh, edges: readonly (readonly [number, number])[], cuts = 1): string[] {
  const n = Math.max(1, Math.round(cuts));
  return transact<string[]>(m, {}, [], (T) => {
    const pieces: string[] = [];
    for (const [a, b] of edges) {
      if (!T.hasEdge(a, b)) continue;
      // From the far end in: a -> b cut at n/(n+1), then a -> that at (n-1)/n, ... each new point the next one's end.
      const pts: number[] = [];
      let end = b;
      for (let k = n; k >= 1; k--) { end = T.splitEdge(a, end, k / (k + 1)); pts.unshift(end); }
      const chain = [a, ...pts, b];
      for (let k = 0; k + 1 < chain.length; k++) pieces.push(edgeKey(chain[k]!, chain[k + 1]!));
    }
    return pieces;
  });
}

/* ---------- extrude ---------- */

/** The extrude inside a transaction (`extrudeFaces`). */
function extrudeIn(T: Topo, faces: readonly number[], distance: number): { faces: number[]; walls: number[] } {
  const m = T.m;
  const region = faces.filter((f) => T.live(f));
  if (!region.length) return { faces: [], walls: [] };
  const n = normalize(region.reduce((s, f) => add(s, T.normal(f)), [0, 0, 0] as Vec3));
  const d = scale(n, distance);
  // The border, with the corners on it, read before any face moves.
  const border = T.border(region).map((e) => {
    const cs = m.faces[e.face]!.corners;
    return { ...e, ca: cs[e.i]!, cb: cs[(e.i + 1) % cs.length]! };
  });
  const copy = new Map<number, number>();
  for (const f of region) for (const v of T.ring(f)) if (!copy.has(v)) copy.set(v, T.addVert(add(T.pos(v), d)));
  // The region's faces onto the copies, with corners of their own.
  const cornerCopy = new Map<number, number>();
  for (const f of region) {
    const face = m.faces[f]!;
    T.setRing(f, face.corners.map((c) => {
      let nc = cornerCopy.get(c);
      if (nc === undefined) { nc = T.cloneCorner(c, copy.get(m.cVert[c]!)!); cornerCopy.set(c, nc); }
      return nc;
    }));
    if (face.mapping) T.setFace(f, { mapping: lockMapping(face.mapping, translation(d)) });
  }
  // A wall each border edge a -> b: a, b, b', a' -- faces out. In the face's object (a map's world is one mesh, its
  // objects its faces' groups: a wall with none would be in no object -- the Forge's owner (crispy, OT.R112), 2026-11-17); its collision words
  // left to its slope (`hullGeometry` `wordsOf`), a wall's, not the floor's it was pulled off.
  const walls: number[] = [];
  for (const e of border) {
    const A = cornerAttrs(m, e.ca), B = cornerAttrs(m, e.cb);
    const corners = [T.addCorner(e.from, A), T.addCorner(e.to, B), T.addCorner(copy.get(e.to)!, B), T.addCorner(copy.get(e.from)!, A)];
    const props = T.propsOf(e.face, { mapping: false });
    const w = T.makeFace(corners, props);
    T.normalsDown(w);
    walls.push(w);
  }
  return { faces: region, walls };
}

/**
 * Extrudes a face region by `distance` along its mean normal (a level editor's extrude): the region's points copied and moved,
 * the region's faces put on the copies, and a four-sided wall along every edge of the region's border, its outward
 * side out. Returns the region's faces (now moved) and the walls. Faces of no area allowed (Shift-drag starts at depth
 * nothing); `extrudeFacesBy` is the Extrude button's.
 */
export function extrudeFaces(m: EditMesh, faces: readonly number[], distance: number): { faces: number[]; walls: number[] } {
  return transact(m, { slivers: true }, { faces: [], walls: [] }, (T) => extrudeIn(T, faces, distance));
}

/** The Extrude button's (not Shift-drag's, which starts at no depth): no face of no area left. */
export function extrudeFacesBy(m: EditMesh, faces: readonly number[], distance: number): { faces: number[]; walls: number[] } {
  return transact(m, {}, { faces: [], walls: [] }, (T) => extrudeIn(T, faces, distance));
}

/* ---------- dissolve ---------- */

/*
 * Dissolve (a level editor's Backspace in its vertex, edge and face tools; Delete there removes, leaving a hole): the element
 * goes and the faces around it become one (`Topo.joinFaces`), so the surface stays closed.
 */

/** a level editor's co-linear tolerance for a dissolve's leftover points. */
const COLINEAR_COS = Math.cos((5 * Math.PI) / 180);
/** a level editor's coplanar tolerance for Combine Faces. */
const COPLANAR_DOT = 1 - 0.01;

/**
 * A point left with two edges taken out of its faces when a level editor's rule says:
 * `colinear` -- its two edges in a line (within 5 degrees); `interiorOrColinear` -- that, or its edges inside the
 * surface (not a border). A point in a triangle stays (taking it out would leave two points). Returns whether it went.
 */
function removeTwoEdgePoint(T: Topo, v: number, rule: 'colinear' | 'interiorOrColinear'): boolean {
  const sp = T.spokes(v);
  if (sp.length !== 2 || !T.facesAt(v).length) return false;
  const [a, b] = sp as [number, number];
  const ua = normalize(sub(T.pos(a), T.pos(v))), ub = normalize(sub(T.pos(b), T.pos(v)));
  const colinear = Math.abs(dot(ua, ub)) > COLINEAR_COS;
  const interior = T.facesOn(v, a).length === 2;
  if (!(colinear || (rule === 'interiorOrColinear' && interior))) return false;
  const faces = T.facesAt(v);
  if (faces.some((f) => T.ring(f).length <= 3)) return false;
  for (const f of faces) T.setRing(f, T.m.faces[f]!.corners.filter((c) => T.m.cVert[c] !== v));
  return true;
}

/**
 * A level editor's  inside a transaction: each edge between two faces joined away (`Topo.joinFaces`) -- with
 * `planar`, only where its two faces lie in one plane -- then each end point left with two edges taken out by `rule`,
 * and the joined faces' co-linear points after it.
 */
function dissolveIn(T: Topo, list: readonly (readonly [number, number])[], planar: boolean, rule: 'colinear' | 'interiorOrColinear'): { faces: number[]; kept: number } {
  const merged = new Set<number>();
  const ends: number[] = [];
  let kept = 0;
  for (const [a, b] of list) {
    const fs = T.facesOn(a, b);
    if (!fs.length) continue;                        // gone already: an earlier join took it inside its face
    if (fs.length !== 2) { kept++; continue; }
    const [f, g] = fs as [number, number];
    if (planar && dot(T.normal(f), T.normal(g)) < COPLANAR_DOT) { kept++; continue; }
    const into = T.joinFaces(f, g) ?? T.joinFaces(g, f);
    if (into === null) { kept++; continue; }
    merged.delete(into === f ? g : f);
    merged.add(into);
    ends.push(a, b);
  }
  for (const v of ends) removeTwoEdgePoint(T, v, rule);
  for (const f of [...merged]) if (T.live(f)) for (const v of T.ring(f)) removeTwoEdgePoint(T, v, 'colinear');
  return { faces: [...merged].filter((f) => T.live(f)), kept };
}

/**
 * Dissolves edges, as a level editor's edge Backspace: the two faces each one parts
 * joined into one polygon, whatever their angle; then a point the join left with two edges goes where they run inside
 * the surface or in a line, so no stray point stays on a side. An edge on the border (one face), or of three faces or
 * more, has nothing to join and stays; so does one whose faces would not make one simple face (they meet along two
 * runs: a ring). Returns the joined faces and how many edges stayed.
 */
export function dissolveEdges(m: EditMesh, edges: Iterable<[number, number]>): { faces: number[]; kept: number } {
  const list = [...edges];
  return transact(m, {}, { faces: [], kept: list.length }, (T) => dissolveIn(T, list, false, 'interiorOrColinear'));
}

/**
 * Dissolves points (a level editor's vertex tool, Backspace): a point of two edges is taken out of its faces, which keep their
 * shape where it lay on a straight run; any other has the faces round it (`Topo.fan`) joined into one polygon without
 * it. A point that cannot go -- its faces no single fan, or a face left with fewer than three points -- stays, the
 * others go. Returns the faces made and the points that stayed.
 */
export function dissolveVerts(m: EditMesh, verts: Iterable<number>): { faces: number[]; kept: number } {
  const list = [...verts];
  return transact(m, {}, { faces: [], kept: list.length }, (T) => {
    const made = new Set<number>();
    let kept = 0;
    for (const v of list) {
      const around = T.facesAt(v);
      if (!around.length) continue;
      const mark = T.savepoint();
      const out = (f: number): void => T.setRing(f, m.faces[f]!.corners.filter((c) => m.cVert[c] !== v));
      if (T.spokes(v).length === 2) {
        if (around.some((f) => T.ring(f).length <= 3)) { kept++; continue; }
        for (const f of around) { out(f); made.add(f); }
        continue;
      }
      const fan = T.fan(v);
      if (!fan) { kept++; continue; }
      let into: number | null = fan.faces[0]!;
      for (const g of fan.faces.slice(1)) { into = T.joinFaces(into, g); if (into === null) break; }
      if (into === null) { T.undoTo(mark); kept++; continue; }
      // A closed fan's last join took the point out; an open one's leaves it on the border, between its two spokes.
      if (T.ring(into).includes(v)) {
        if (T.ring(into).length <= 3) { T.undoTo(mark); kept++; continue; }
        out(into);
      }
      for (const f of fan.faces) made.delete(f);
      made.add(into);
    }
    return { faces: [...made].filter((f) => T.live(f)), kept };
  });
}

/**
 * A level editor's Combine Faces (the face tool's Backspace; ): every edge between two selected faces that lie in
 * one plane joined away, then the co-linear points left on the combined faces' sides taken out. Faces at an angle stay
 * apart -- a box's six faces selected stay six -- and a ring of faces round a hole stays two. Returns the faces left.
 */
export function dissolveFaces(m: EditMesh, faces: readonly number[]): number[] {
  return transact(m, {}, faces.filter((f) => m.faces[f]), (T) => {
    const mine = new Set(faces.filter((f) => T.live(f)));
    const edges: [number, number][] = [];
    const seen = new Set<string>();
    for (const f of mine) {
      const vs = T.ring(f);
      vs.forEach((a, i) => {
        const b = vs[(i + 1) % vs.length]!;
        const k = edgeKey(a, b);
        if (seen.has(k)) return;
        seen.add(k);
        const on = T.facesOn(a, b);
        if (on.length === 2 && on.every((g) => mine.has(g))) edges.push([a, b]);
      });
    }
    dissolveIn(T, edges, true, 'colinear');
    return [...mine].filter((f) => T.live(f));
  });
}

/* ---------- bridge ---------- */

/**
 * A new face of a bridge: its corners on `verts`, each corner's attributes off `from` (its source corner), in `source`'s
 * draw style and object (group). Its collision (the Forge's owner (crispy, OT.R112), 2026-11-18: "make sure to add the collision flags properly"):
 * on a hull object, `source`'s surface words made a floor's or a wall's by the new face's own facing (`floorOrWall`:
 * material, region and the indoor and reverb bits kept); a drawn face carries none, its hull taking its section's words
 * by facing at Build (`surfaceMatcher`), as an extrude's walls do.
 */
function bridgeFace(T: Topo, verts: readonly number[], from: readonly number[], source: number): number {
  const corners = verts.map((v, i) => T.addCorner(v, cornerAttrs(T.m, from[i]!)));
  return T.faceLike(corners, source, { mapping: false });
}

/**
 * A level editor's Bridge on two faces (a browser adaptation; the Forge's owner (crispy, OT.R112), 2026-11-18): the two faces removed and a four-sided face
 * along each pair of their edges joining them -- a tunnel from one to the other. The faces need as many points each
 * and no point in common. Each point of `f` is paired with one of `g`'s, `g`'s taken in the opposite turn (the two
 * faces look at each other across the gap, or away from each other), at the offset whose pairs lie nearest in all.
 * Each new face runs along its `f` edge the way `f` did and along its `g` edge the way `g` did, so it faces as the
 * faces around the two did: out of two boxes, into two rooms. Each takes `f`'s draw style, object and collision
 * (`bridgeFace`). Returns the new faces, or the reason the two cannot be bridged.
 */
export function bridgeFaces(m: EditMesh, f: number, g: number, segments = 1): { faces: number[] } | { error: string } {
  return transact<{ faces: number[] } | { error: string }>(m, {}, (why) => ({ error: `Bridge: ${why}` }), (T) => {
    if (!T.live(f) || !T.live(g) || f === g) return { error: 'Select two faces' };
    const a = T.ring(f), b = T.ring(g);
    const F = m.faces[f]!.corners, G = m.faces[g]!.corners;
    if (a.length !== b.length) return { error: `The faces have ${a.length} and ${b.length} points: Bridge joins faces with as many points each` };
    if (a.some((v) => b.includes(v))) return { error: 'The faces share a point: Bridge joins faces apart' };
    const n = a.length;
    const at = (k: number, i: number): number => (((k - i) % n) + n) % n;     // g's ring index paired with f's point i
    let best = 0, bestD = Infinity;
    for (let k = 0; k < n; k++) {
      let d = 0;
      for (let i = 0; i < n; i++) d += length(sub(T.pos(a[i]!), T.pos(b[at(k, i)]!)));
      if (d < bestD - 1e-9) { bestD = d; best = k; }
    }
    // Faces in one plane (side by side, or face to face with no gap) would be bridged by faces of no area: refused.
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n, j = at(best, i), j2 = at(best, i2);
      const q = [a[i]!, a[i2]!, b[j2]!, b[j]!].map((v) => T.pos(v));
      let s: Vec3 = [0, 0, 0];
      for (let k = 0; k < 4; k++) s = add(s, cross(q[k]!, q[(k + 1) % 4]!));
      const span = Math.max(length(sub(q[0]!, q[1]!)), length(sub(q[1]!, q[2]!)), 1e-9);
      if (length(s) / 2 < span * span * 1e-6) return { error: 'The faces lie in one plane (or touch): Bridge needs a gap between them' };
    }
    const made: number[] = [];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n, j = at(best, i), j2 = at(best, i2);
      // f's edge a[i] -> a[i2] as f ran it, across to g's b[j2] -> b[j] as g ran it.
      made.push(bridgeFace(T, [a[i]!, a[i2]!, b[j2]!, b[j]!], [F[i]!, F[i2]!, G[j2]!, G[j]!], f));
    }
    T.kill(f);
    T.kill(g);
    // Segments (the reference editor's bridge Steps; the Forge's owner (crispy, OT.R112), 2026-11-19: "parametric values"): each long edge from f's
    // point to its g partner cut into `segments` pieces, the cuts joined round the tunnel -- rings along it.
    const steps = Math.max(1, Math.round(segments));
    if (steps > 1) {
      const firstNew = m.faces.length;
      const longs = a.map((v, i) => cutAlong(T, v, b[at(best, i)]!, steps - 1));
      for (let i = 0; i < n; i++) joinAcross(T, longs[i]!, longs[(i + 1) % n]!);
      for (let x = firstNew; x < m.faces.length; x++) if (T.live(x)) made.push(x);
    }
    return { faces: made.filter((x) => T.live(x)) };
  });
}

/** The face that runs edge `a`-`b`, the way it runs it ([from, to]), and the corners on them; null when none does. */
function edgeUse(T: Topo, a: number, b: number): { face: number; from: number; to: number; cFrom: number; cTo: number } | null {
  for (const f of T.facesOn(a, b)) {
    const [from, to] = T.runs(f, a, b) ? [a, b] : [b, a];
    return { face: f, from, to, cFrom: T.cornerAt(f, from), cTo: T.cornerAt(f, to) };
  }
  return null;
}

/** How many faces run edge `a`-`b` (either way): 1 an open edge (a border), 2 an edge between two faces. */
export function edgeFaceCount(m: EditMesh, a: number, b: number): number {
  let n = 0;
  for (const face of m.faces) {
    if (!face) continue;
    const cs = face.corners;
    for (let i = 0; i < cs.length; i++) {
      const x = m.cVert[cs[i]!], y = m.cVert[cs[(i + 1) % cs.length]!];
      if ((x === a && y === b) || (x === b && y === a)) n++;
    }
  }
  return n;
}

/** Why two edges cannot be bridged before any is tried (`bridgeEdges`; the editor greys Bridge with it), or null. */
export function bridgeEdgesBlocked(m: EditMesh, e1: readonly [number, number], e2: readonly [number, number]): string | null {
  if (edgeKey(e1[0], e1[1]) === edgeKey(e2[0], e2[1])) return 'select two different edges';
  const n1 = edgeFaceCount(m, e1[0], e1[1]), n2 = edgeFaceCount(m, e2[0], e2[1]);
  if (!n1 || !n2) return 'select two edges of faces';
  if (n1 !== 1 || n2 !== 1) return BRIDGE_OPEN_ONLY;
  return null;
}

/** Bridge on edges refused for an edge between two faces: what to do instead. */
export const BRIDGE_OPEN_ONLY = 'Bridge joins open edges (a face on one side only): these have faces on both sides -- to join two solids, select their two facing faces and Bridge those';

/**
 * A level editor's Bridge on two edges (a browser adaptation): one face between them -- four-sided, or three where the edges
 * share a point. It runs the first edge the other way from the face that has it (so it continues that surface, as a
 * face across the gap from an open border does) and pairs the second edge's ends so the face does not cross itself.
 * It takes the first edge's face's draw style, object and collision (`bridgeFace`). Open edges only, as a level editor's (the
 * owner, 2026-11-19: "ok lets do it"): an edge between two faces already (a box's corner) would take a third, a
 * one-sided sheet standing on two solids that leaves them no longer solid -- two solids are joined by bridging their
 * facing faces (`bridgeFaces`). Returns the new face, or the reason it cannot be made.
 */
export function bridgeEdges(m: EditMesh, e1: readonly [number, number], e2: readonly [number, number]): { faces: number[] } | { error: string } {
  const blocked = bridgeEdgesBlocked(m, e1, e2);
  if (blocked) return { error: `Bridge: ${blocked}` };
  return transact<{ faces: number[] } | { error: string }>(m, { open: true }, (why) => ({ error: `Bridge: ${why}` }), (T) => bridgeEdgesIn(T, e1, e2));
}

/** One bridge between two open edges inside a transaction (`bridgeEdges`, `bridgeEdgeRuns`). */
function bridgeEdgesIn(T: Topo, e1: readonly [number, number], e2: readonly [number, number]): { faces: number[] } | { error: string } {
  {
    const u1 = edgeUse(T, e1[0], e1[1]), u2 = edgeUse(T, e2[0], e2[1]);
    if (!u1 || !u2) return { error: 'Select two edges of faces' };
    // The first edge reversed: from its face's `to` to its `from`.
    const p = u1.to, q = u1.from, cp = u1.cTo, cq = u1.cFrom;
    const shared = [u2.from, u2.to].find((v) => v === p || v === q);
    if (shared !== undefined) {
      const other = shared === u2.from ? u2.to : u2.from, cOther = shared === u2.from ? u2.cTo : u2.cFrom;
      // A triangle p -> q -> other (shared = q) or other -> p -> q (shared = p): the first edge kept p -> q.
      return { faces: [shared === q ? bridgeFace(T, [p, q, other], [cp, cq, cOther], u1.face) : bridgeFace(T, [other, p, q], [cOther, cp, cq], u1.face)] };
    }
    // After q, the second edge's end nearer q; then its other end, back to p.
    const near = (v: number, w: number): number => length(sub(T.pos(v), T.pos(w)));
    const fromFirst = near(q, u2.from) + near(p, u2.to) <= near(q, u2.to) + near(p, u2.from);
    const [r, s, cr, cs] = fromFirst ? [u2.from, u2.to, u2.cFrom, u2.cTo] : [u2.to, u2.from, u2.cTo, u2.cFrom];
    return { faces: [bridgeFace(T, [p, q, r, s], [cp, cq, cr, cs], u1.face)] };
  }
}

/* ---------- inset ---------- */

/** The inset inside a transaction (`insetFaces`). */
function insetIn(T: Topo, faces: readonly number[], distance: number): { faces: number[]; ring: number[] } {
  const m = T.m;
  const region = faces.filter((f) => T.live(f));
  if (!region.length || !(distance > 0)) return { faces: [], ring: [] };
  // The border as the region runs it, each edge with its face: a point's edge in (u -> v) and edge out (v -> w).
  const into = new Map<number, { from: number; face: number }>(), outOf = new Map<number, { to: number; face: number }>();
  let pinched = false;
  for (const e of T.border(region)) {
    if (outOf.has(e.from) || into.has(e.to)) pinched = true;
    outOf.set(e.from, { to: e.to, face: e.face });
    into.set(e.to, { from: e.from, face: e.face });
  }
  // A region whose outline passes a point twice (faces touching at a point as well as along an edge): one ring cannot
  // go round it, so each face is inset on its own.
  if (pinched && region.length > 1) {
    const out = { faces: [] as number[], ring: [] as number[] };
    for (const f of region) { const r = insetIn(T, [f], distance); out.faces.push(...r.faces); out.ring.push(...r.ring); }
    return out;
  }
  // Each border point's move: the mitre of its two edges' inward sides, `distance` across each -- the distance held so
  // no point moves more than under half its shorter border edge (a thin face, a sharp corner: no ring crossing over).
  const mitre = new Map<number, { dir: Vec3; cos: number }>();
  let held = distance;
  for (const [v, out] of outOf) {
    const inn = into.get(v);
    if (!inn) continue;
    const p = T.pos(v);
    const side = (from: readonly number[], to: readonly number[], face: number): Vec3 => normalize(cross(T.normal(face), sub(to, from)));
    const s1 = side(T.pos(inn.from), p, inn.face), s2 = side(p, T.pos(out.to), out.face);
    const dir = normalize(add(s1, s2));
    const cos = Math.max(0.25, dot(dir, s1));                 // a mitre held at four times the width on a sharp corner
    mitre.set(v, { dir, cos });
    const shorter = Math.min(length(sub(p, T.pos(inn.from))), length(sub(T.pos(out.to), p)));
    held = Math.min(held, 0.45 * shorter * cos);
  }
  const { walls } = extrudeIn(T, region, 0);
  // Each wall a -> b -> b' -> a': its copies moved in; the wall is the ring face between the outlines, in the region's
  // plane, taking its border face's look.
  const moved = new Set<number>();
  for (const w of walls) {
    const [ca, cb, cb2, ca2] = m.faces[w]!.corners as [number, number, number, number];
    for (const [orig, copy] of [[m.cVert[ca]!, m.cVert[ca2]!], [m.cVert[cb]!, m.cVert[cb2]!]] as const) {
      if (moved.has(copy)) continue;
      moved.add(copy);
      const d = mitre.get(orig);
      if (d) T.setPos(copy, add(T.pos(copy), scale(d.dir, held / d.cos)));
    }
  }
  const ring: number[] = [];
  for (const w of walls) {
    const face = m.faces[w]!;
    // The wall's border face: the region face whose border edge a -> b it was raised from.
    const src = outOf.get(m.cVert[face.corners[0]!]!)?.face ?? region[0]!;
    const s = m.faces[src]!;
    if (s.mapping) T.setFace(w, { mapping: { ...s.mapping, u: [...s.mapping.u] as Vec3, v: [...s.mapping.v] as Vec3 } });
    if (s.surface) T.setFace(w, { surface: floorOrWall(s.surface)(T.ring(w).map((v) => T.pos(v))) });
    T.normalsDown(w);
    ring.push(w);
  }
  for (const f of region) T.touchFace(f);
  return { faces: region, ring };
}

/**
 * every modeller's Inset (a browser adaptation; the Forge's owner (crispy, OT.R112), 2026-11-18): the region `faces` make shrunk
 * `distance` inward in its own plane, a ring of new four-sided faces filling the border between the old outline and the
 * new -- an extrude by nothing, its border's copies then moved in. Faces touching each other inset as one region;
 * apart, each its own. At a border point the move is the mitre of its two border edges' inward sides, so the ring keeps
 * one width at a corner. The ring faces take their border face's draw style, object and texture mapping (the texture
 * stays where it lay); on a hull, its collision words by their facing (`floorOrWall`). Returns the region's faces
 * (inside the ring now) and the ring.
 */
export function insetFaces(m: EditMesh, faces: readonly number[], distance: number, steps = 1): { faces: number[]; ring: number[] } {
  // Steps (the reference editor's Inset Steps; the Forge's owner (crispy, OT.R112), 2026-11-19: "parametric values"): `steps` rings, the distance
  // shared evenly between them, each inset from the last.
  const n = Math.max(1, Math.round(steps));
  return transact(m, {}, { faces: [], ring: [] }, (T) => {
    let region = [...faces];
    const ring: number[] = [];
    for (let s = 0; s < n; s++) {
      const r = insetIn(T, region, distance / n);
      if (!r.faces.length) break;
      region = r.faces;
      ring.push(...r.ring);
    }
    return { faces: region, ring };
  });
}

/* ---------- edges pulled out ---------- */

/**
 * Edges pulled out into new faces (ProBuilder's and other modellers' Shift-drag on edges; the Forge's owner (crispy, OT.R112), 2026-11-18): each edge
 * `a`-`b` given a copy of its two points and a four-sided face between them, which runs the edge the other way from the
 * face that has it -- so the new face carries that surface on across the edge, as a face across a border's gap does
 * (`bridgeEdges`). Edges side by side share their copied points: a strip, not loose faces. Each new face takes its
 * edge's face's draw style, object and, on a hull, its collision words by facing (`bridgeFace`). Returns the new faces
 * and the copied edges (the selection the drag then moves), and each new face's edge's faces (`sides`: an edge between
 * two faces is pulled out along one of them, which the drag decides -- `orientPulled`). The surface may open and an
 * edge between two faces gain a third (a fin): that is what pulling an edge out is.
 */
export function extrudeEdges(m: EditMesh, edges: readonly (readonly [number, number])[]): { faces: number[]; edges: [number, number][]; sides: number[][] } {
  return transact(m, { open: true, many: true, slivers: true, twice: true }, { faces: [], edges: [], sides: [] }, (T) => extrudeEdgesIn(T, edges));
}

/** Edges pulled out inside a transaction (`extrudeEdges`, `extendVerts`). */
function extrudeEdgesIn(T: Topo, edges: readonly (readonly [number, number])[]): { faces: number[]; edges: [number, number][]; sides: number[][] } {
  {
    const copy = new Map<number, number>();
    const copyOf = (v: number): number => {
      let c = copy.get(v);
      if (c === undefined) { c = T.addVert(T.pos(v)); copy.set(v, c); }
      return c;
    };
    const faces: number[] = [], out: [number, number][] = [], sides: number[][] = [];
    for (const [a, b] of edges) {
      const use = edgeUse(T, a, b);
      if (!use) continue;
      sides.push(T.facesOn(a, b));
      // The new face: to -> from (the edge run back), then the copies from' -> to'.
      const p = use.to, q = use.from;
      const qc = copyOf(q), pc = copyOf(p);
      faces.push(bridgeFace(T, [p, q, qc, pc], [use.cTo, use.cFrom, use.cFrom, use.cTo], use.face));
      out.push([copyOf(a), copyOf(b)]);
    }
    return { faces, edges: out, sides };
  }
}

/**
 * Edges pulled out along `dir` (`extrudeEdges`, then moved): each new face turned to carry on the face of its edge that
 * lies along the pull -- the one whose normal is most across `dir` (a box's top edge pulled up carries the front wall on,
 * not the top) -- flipped where it faces the other way from it.
 */
export function orientPulled(m: EditMesh, faces: readonly number[], sides: readonly (readonly number[])[], dir: readonly number[]): void {
  const d = normalize([dir[0]!, dir[1]!, dir[2]!]);
  const normal = (f: number): Vec3 => normalize(faceVerts(m, f).map((v) => vertPos(m, v)).reduce((s, p, i, ps) => add(s, cross(p, ps[(i + 1) % ps.length]!)), [0, 0, 0] as Vec3));
  faces.forEach((f, i) => {
    if (!m.faces[f]) return;
    const live = (sides[i] ?? []).filter((s) => m.faces[s]);
    // An edge with one face: the new face already carries that face on (`extrudeEdges`) -- never turned against it.
    if (live.length < 2) return;
    const ref = live.reduce((best, s) => (Math.abs(dot(normal(s), d)) < Math.abs(dot(normal(best), d)) ? s : best));
    if (dot(normal(f), normal(ref)) < 0) flipFaces(m, [f]);
  });
}

/* ---------- subdivide ---------- */

/**
 * A face's four corners as a level editor's Quad Slice finds them:
 * a four-pointed face's own four; any other's, the points where its outline turns by 60 degrees or more -- and where
 * fewer than four do, its four sharpest turns. Ring indices, in its turn; null where there are not exactly four (a
 * triangle, a hexagon): Quad Slice leaves such a face whole.
 */
const CORNER_COS = Math.fround(Math.cos((60 * Math.PI) / 180)) - 1e-9;
function quadCorners(T: Topo, vs: readonly number[]): number[] | null {
  if (vs.length === 4) return [0, 1, 2, 3];
  if (vs.length < 4) return null;
  const turn = vs.map((v, i) => {
    const a = T.pos(vs[(i + vs.length - 1) % vs.length]!), b = T.pos(v), c = T.pos(vs[(i + 1) % vs.length]!);
    return dot(normalize(sub(b, a)), normalize(sub(c, b)));
  });
  // The reference editor's threshold, the cosine of 60 degrees in single precision (just under a half): a turn of
  // exactly 60 degrees (a regular hexagon's) is not past it, whatever the rounding.
  let idx = turn.map((d, i) => (d <= CORNER_COS ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 4) {
    const sharpest = new Set(turn.map((d, i) => ({ d, i })).sort((p, q) => p.d - q.d).slice(0, 4).map((x) => x.i));
    idx = vs.map((_, i) => i).filter((i) => sharpest.has(i));
  }
  return idx.length === 4 ? idx : null;
}

/**
 * The point at `frac` of the way (by length) along face `f`'s side from its corner `A` round to its corner `B`: a point
 * already there taken, else a new one split into the piece of the side it falls in (`Topo.splitEdge`, which the face
 * across that side gains too, so no crack opens).
 */
function pointOnSide(T: Topo, f: number, A: number, B: number, frac: number): number {
  const vs = T.ring(f);
  const run: number[] = [];
  for (let k = vs.indexOf(A); ; k = (k + 1) % vs.length) { run.push(vs[k]!); if (vs[k] === B) break; }
  const cum = [0];
  for (let k = 0; k + 1 < run.length; k++) cum.push(cum[k]! + length(sub(T.pos(run[k + 1]!), T.pos(run[k]!))));
  const total = cum[cum.length - 1]!, target = frac * total, tol = Math.max(total * 1e-6, 1e-9);
  for (let k = 0; k < run.length; k++) if (Math.abs(cum[k]! - target) <= tol) return run[k]!;
  for (let k = 0; k + 1 < run.length; k++) {
    if (target > cum[k]! && target < cum[k + 1]!) return T.splitEdge(run[k]!, run[k + 1]!, (target - cum[k]!) / (cum[k + 1]! - cum[k]!));
  }
  throw new MeshError('a side of a face has no place for a cut');
}

/** The points of face `f`'s ring strictly between `X` and `Y`, going round it its own way. */
function ringBetween(T: Topo, f: number, X: number, Y: number): number[] {
  const vs = T.ring(f);
  const out: number[] = [];
  for (let k = (vs.indexOf(X) + 1) % vs.length; vs[k] !== Y; k = (k + 1) % vs.length) { out.push(vs[k]!); if (out.length > vs.length) break; }
  return out;
}

/**
 * Quad Slice (Ctrl+D in the reference editor's face tool; its Cuts X and Y, the Forge's owner (crispy, OT.R112), 2026-11-19: one to one with it,
 * and "parametric values ... for each edit tool"): each face with four corners (`quadCorners`) cut into a grid of
 * (`cutsX` + 1) x (`cutsY` + 1) quads -- its first and third sides cut `cutsX` times, its second and fourth `cutsY`
 * times, evenly by length, and the cuts joined straight across through points blended from its four sides (a Coons
 * patch: straight cuts on a flat face). A face without four corners (a triangle) is left whole. A point already on a
 * side (the cut a sliced neighbour left there) is part of that side, kept in the piece along it. Each piece keeps its
 * face's style, object, mapping and collision words. Returns the pieces.
 */
export function subdivideFaces(m: EditMesh, faces: readonly number[], cutsX = 1, cutsY = 1): number[] {
  const nx = Math.max(0, Math.round(cutsX)), ny = Math.max(0, Math.round(cutsY));
  return transact<number[]>(m, {}, [], (T) => {
    const made: number[] = [];
    if (!nx && !ny) return made;
    for (const f of faces) {
      if (!T.live(f) || m.faces[f]!.disp) continue;
      const vs0 = T.ring(f);
      const corners = quadCorners(T, vs0);
      if (!corners) continue;
      const [c0, c1, c2, c3] = corners.map((i) => vs0[i]!) as [number, number, number, number];
      const attrs0 = [c0, c1, c2, c3].map((v) => cornerAttrs(m, T.cornerAt(f, v)));
      // The grid's points: G[i][j], i along the first side (c0 -> c1), j along the second (c1 -> c2).
      const G: number[][] = Array.from({ length: nx + 2 }, () => new Array<number>(ny + 2).fill(-1));
      G[0]![0] = c0; G[nx + 1]![0] = c1; G[nx + 1]![ny + 1] = c2; G[0]![ny + 1] = c3;
      for (let i = 1; i <= nx; i++) G[i]![0] = pointOnSide(T, f, c0, c1, i / (nx + 1));
      for (let j = 1; j <= ny; j++) G[nx + 1]![j] = pointOnSide(T, f, c1, c2, j / (ny + 1));
      for (let i = 1; i <= nx; i++) G[i]![ny + 1] = pointOnSide(T, f, c2, c3, 1 - i / (nx + 1));
      for (let j = 1; j <= ny; j++) G[0]![j] = pointOnSide(T, f, c3, c0, 1 - j / (ny + 1));
      const P = (v: number): Vec3 => T.pos(v);
      const n = T.normal(f);
      const inner = new Map<string, number>();   // `${i},${j}` -> its new corner
      for (let i = 1; i <= nx; i++) {
        for (let j = 1; j <= ny; j++) {
          const u = i / (nx + 1), w = j / (ny + 1);
          const lin = (a: readonly number[], b: readonly number[], s: number): Vec3 => add(scale(a, 1 - s), scale(b, s)) as Vec3;
          const across = lin(P(G[i]![0]!), P(G[i]![ny + 1]!), w);            // between the first and third sides
          const along = lin(P(G[0]![j]!), P(G[nx + 1]![j]!), u);            // between the fourth and second
          const bilinear = add(add(scale(P(c0), (1 - u) * (1 - w)), scale(P(c1), u * (1 - w))), add(scale(P(c2), u * w), scale(P(c3), (1 - u) * w)));
          const coons = sub(add(across, along), bilinear);
          const v = T.addVert(coons);
          G[i]![j] = v;
          const bil = (pick: (a: (typeof attrs0)[number]) => readonly number[]): number[] => pick(attrs0[0]!).map((_, k) =>
            pick(attrs0[0]!)[k]! * (1 - u) * (1 - w) + pick(attrs0[1]!)[k]! * u * (1 - w) + pick(attrs0[2]!)[k]! * u * w + pick(attrs0[3]!)[k]! * (1 - u) * w);
          inner.set(`${i},${j}`, T.addCorner(v, { uv: bil((a) => a.uv), color: bil((a) => a.color), normal: n, centroid: attrs0[0]!.centroid }));
        }
      }
      const cornerOf = (i: number, j: number): number => {
        const c = inner.get(`${i},${j}`);
        return c !== undefined ? T.cloneCorner(c) : T.cloneCorner(T.cornerAt(f, G[i]![j]!));
      };
      const borderCorners = (X: number, Y: number): number[] => ringBetween(T, f, X, Y).map((v) => T.cloneCorner(T.cornerAt(f, v)));
      const pieces: number[][] = [];
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= ny; j++) {
          const ring: number[] = [];
          ring.push(cornerOf(i, j));
          if (j === 0) ring.push(...borderCorners(G[i]![0]!, G[i + 1]![0]!));
          ring.push(cornerOf(i + 1, j));
          if (i === nx) ring.push(...borderCorners(G[nx + 1]![j]!, G[nx + 1]![j + 1]!));
          ring.push(cornerOf(i + 1, j + 1));
          if (j === ny) ring.push(...borderCorners(G[i + 1]![ny + 1]!, G[i]![ny + 1]!));
          ring.push(cornerOf(i, j + 1));
          if (i === 0) ring.push(...borderCorners(G[0]![j + 1]!, G[0]![j]!));
          pieces.push(ring);
        }
      }
      // PR #5 D1 (ours): each piece keeps the source's collision words (`propsOf` with its surface), as the knife's do;
      // `faceLike` would make them a floor's or a wall's by facing (a sliced ladder face no longer climbable).
      for (const ring of pieces) { const g = T.makeFace(ring, T.propsOf(f, { surface: true })); T.normalsDown(g); made.push(g); }
      T.kill(f);
    }
    return made;
  });
}

/* ---------- loop cut ---------- */

/**
 * A loop cut (every modeller's; the Forge's owner (crispy, OT.R112), 2026-11-18): the ring of edges `ring` (`./selection` `edgeRing`)
 * each split at its middle (`Topo.splitEdge`), and each four-sided face the ring crosses cut between its two new points
 * (`Topo.splitFace`) -- a new edge loop across the ring. Faces keep their style, object, mapping and collision words.
 * Returns the new loop's edges.
 */
export function loopCut(m: EditMesh, ring: readonly string[]): [number, number][] {
  return transact<[number, number][]>(m, {}, [], (T) => {
    // The faces the ring crosses: four-sided, two of the ring's edges each (read before any split) -- only these are cut,
    // never another face that happens to hold two of the new points (a many-sided face a dissolve left beside the ring).
    const inRing = new Set(ring);
    const crossed = new Set<number>();
    for (const k of ring) {
      const [a, b] = k.split('_').map(Number) as [number, number];
      for (const f of T.facesOn(a, b)) {
        const vs = T.ring(f);
        if (vs.length === 4 && vs.filter((v, i) => inRing.has(edgeKey(v, vs[(i + 1) % 4]!))).length === 2) crossed.add(f);
      }
    }
    const mids = new Set<number>();
    for (const k of ring) {
      const [a, b] = k.split('_').map(Number) as [number, number];
      if (T.hasEdge(a, b)) mids.add(T.splitEdge(a, b, 0.5));
    }
    const out: [number, number][] = [];
    for (const f of crossed) {
      if (!T.live(f)) continue;
      const at = T.ring(f).filter((v) => mids.has(v));
      if (at.length !== 2 || T.hasEdge(at[0]!, at[1]!)) continue;
      for (const g of T.splitFace(f, at[0]!, at[1]!)) T.normalsDown(g);
      out.push([at[0]!, at[1]!]);
    }
    return out;
  });
}

/* ---------- knife ---------- */

/** A knife's point: a point of the mesh, a place along an edge (`t` from `a`), or a place inside face `f` (`at`). */
export type KnifePoint = { v: number } | { a: number; b: number; t: number } | { f: number; at: readonly number[] };

/** Whether the cut from `X` to `Y` (two points of face `f`'s ring) runs inside the face, laid in its plane. */
function insideFace(T: Topo, f: number, X: readonly number[], Y: readonly number[]): boolean {
  const n = T.normal(f);
  const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
  const [i, j] = ax === 0 ? [1, 2] : ax === 1 ? [2, 0] : [0, 1];
  const ring = T.ring(f).map((v) => T.pos(v));
  const inside = (p: readonly number[]): boolean => {
    let c = false;
    for (let k = 0, l = ring.length - 1; k < ring.length; l = k++) {
      const a = ring[k]!, b = ring[l]!;
      if ((a[j]! > p[j]!) !== (b[j]! > p[j]!) && p[i]! < ((b[i]! - a[i]!) * (p[j]! - a[j]!)) / (b[j]! - a[j]!) + a[i]!) c = !c;
    }
    return c;
  };
  return [0.25, 0.5, 0.75].every((t) => inside(lerp(X, Y, t)));
}

/**
 * Where a cut from point `v` toward `target` leaves the faces round `v` (the reference editor's cut walk): in each face,
 * the plane through the line and the face's normal meets the face's edges not at `v`; the nearest crossing ahead is
 * where the line leaves the face -- unless it enters there (a concave face's notch), which rules the face out. Of the
 * faces left, the one whose exit lies nearest the target. Null where none leads on.
 */
function cutExit(T: Topo, v: number, target: readonly number[]): { face: number; a: number; b: number; s: number; at: Vec3 } | null {
  const c = T.pos(v);
  const toward = sub(target, c);
  if (length(toward) < 1e-12) return null;
  const dir = normalize(toward);
  let best: { face: number; a: number; b: number; s: number; at: Vec3; d: number } | null = null;
  for (const f of T.facesAt(v)) {
    const n = T.normal(f);
    if (Math.abs(dot(n, dir)) > 0.5) continue;                // the line runs out of the face's plane
    const cutN = normalize(cross(n, dir));
    const ahead = normalize(cross(cutN, n));                  // the line's way, laid in the face
    const vs = T.ring(f);
    let near = Infinity;
    let exit: { a: number; b: number; s: number; at: Vec3 } | null = null;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
      if (a === v || b === v) continue;
      const pa = T.pos(a), pb = T.pos(b);
      const da = dot(sub(pa, c), cutN), db = dot(sub(pb, c), cutN);
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const s = da / (da - db);
      const at = add(pa, scale(sub(pb, pa), s));
      const d = dot(sub(at, c), ahead);
      if (d < 0 || d > near) continue;
      // Leaving the face here (its edge turning left of the way ahead, about its normal), or coming in.
      if (dot(cross(ahead, sub(pb, pa)), n) > 0) exit = { a, b, s, at };
      else if (d < near) exit = null;
      near = d;
    }
    if (!exit) continue;
    const dist = length(sub(exit.at, target));
    if (!best || dist < best.d) best = { face: f, ...exit, d: dist };
  }
  return best && { face: best.face, a: best.a, b: best.b, s: best.s, at: best.at };
}

/**
 * The reference editor's Edge Cut (the Knife; the Forge's owner (crispy, OT.R112), 2026-11-19: "do the knife on face like [it]"): the points
 * clicked, in order -- each a point of the mesh, a place on an edge, or a place inside a face. From the first point on
 * an edge or a point (a place inside a face cannot start a cut), each next point is reached in a straight line across
 * the faces between (`cutExit`): where the line leaves a face, a point on that edge (or the edge's own end, within a
 * thousandth), and the face cut there (`Topo.splitFace`). A place inside a face lies on the cut across it: that cut
 * goes on through to the face's far side, a point set in it at the place. Where the next step leaves that place by
 * another way, the rest of the cut beyond the place is taken out again (its two faces joined, the points left in a line
 * taken out); a cut ending at a place inside a face keeps its way through. Returns the cut edges, and the steps that
 * found no way across (`missed`).
 */
export function knifeCut(m: EditMesh, points: readonly KnifePoint[]): { edges: [number, number][]; missed: number } {
  return transact(m, {}, { edges: [], missed: Math.max(0, points.length - 1) }, (T) => {
    const edges: [number, number][] = [];
    let missed = 0;
    const TOL = 1e-3;
    const posOf = (p: KnifePoint): Vec3 => {
      if ('v' in p) return T.pos(p.v);
      if ('f' in p) return [p.at[0]!, p.at[1]!, p.at[2]!];
      return add(T.pos(p.a), scale(sub(T.pos(p.b), T.pos(p.a)), p.t));
    };
    /** A start point made a point of the mesh: a point as it is, a place on an edge split in (the piece it lies on). */
    const startAt = (p: KnifePoint): number | null => {
      if ('v' in p) return T.facesAt(p.v).length ? p.v : null;
      if ('f' in p) return null;
      const P = posOf(p);
      let a = p.a, b = p.b;
      if (!T.hasEdge(a, b)) {
        let on: [number, number] | null = null;
        for (const f of new Set([...T.facesAt(a), ...T.facesAt(b)])) {
          const vs = T.ring(f);
          for (let i = 0; i < vs.length && !on; i++) { const x = vs[i]!, y = vs[(i + 1) % vs.length]!; if (onSegment(T.pos(x), T.pos(y), P)) on = [x, y]; }
          if (on) break;
        }
        if (!on) return null;
        [a, b] = on;
      }
      const A = T.pos(a), B = T.pos(b), len = length(sub(B, A));
      const t = len > 1e-9 ? length(sub(P, A)) / len : 0.5;
      if (t <= TOL) return a;
      if (t >= 1 - TOL) return b;
      return T.splitEdge(a, b, t);
    };
    const note = (x: number, y: number): void => { if (!edges.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) edges.push([x, y]); };
    let cur: number | null = null;
    let leftover: [number, number] | null = null;   // the cut beyond a place inside a face, taken out if unused
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (cur === null) { cur = startAt(p); continue; }
      const target = posOf(p);
      const made: [number, number][] = [];
      let reached: number | null = null, beyond: [number, number] | null = null;
      for (let guard = 0; guard < 4096 && reached === null; guard++) {
        if (length(sub(T.pos(cur), target)) <= TOL * Math.max(1, length(target))) { reached = cur; break; }
        const exit = cutExit(T, cur, target);
        if (!exit) break;
        const next = exit.s <= TOL ? exit.a : exit.s >= 1 - TOL ? exit.b : T.splitEdge(exit.a, exit.b, exit.s);
        if (next === cur) break;
        if (!T.hasEdge(cur, next)) {
          if (!insideFace(T, exit.face, T.pos(cur), T.pos(next))) break;
          for (const g of T.splitFace(exit.face, cur, next)) T.normalsDown(g);
        }
        made.push([cur, next]);
        // The target on this stretch: reached (a point inside the face set in it, the rest beyond kept aside).
        const A = T.pos(cur), B = T.pos(next), AB = sub(B, A), L2 = dot(AB, AB);
        const s = L2 > 1e-18 ? dot(sub(target, A), AB) / L2 : 0;
        const off = length(sub(target, add(A, scale(AB, s))));
        if (s > -TOL && s < 1 + TOL && off <= TOL * Math.max(1, Math.sqrt(L2))) {
          if (s <= TOL) reached = cur;
          else if (s >= 1 - TOL) reached = next;
          else {
            const mid = T.splitEdge(cur, next, s);
            made.pop();
            made.push([cur, mid], [mid, next]);
            reached = mid;
            beyond = [mid, next];
          }
          break;
        }
        cur = next;
      }
      // The last place's rest of the cut, taken out where this step left it another way.
      const lo = leftover;
      if (lo && T.hasEdge(lo[0], lo[1]) && !made.some(([x, y]) => edgeKey(x, y) === edgeKey(lo[0], lo[1]))) {
        const fs = T.facesOn(lo[0], lo[1]);
        if (fs.length === 2 && (T.joinFaces(fs[0]!, fs[1]!) ?? T.joinFaces(fs[1]!, fs[0]!)) !== null) {
          for (const v of lo) removeTwoEdgePoint(T, v, 'colinear');
        }
      }
      leftover = null;
      if (reached === null) { missed++; cur = null; continue; }
      const bk = beyond ? edgeKey(beyond[0], beyond[1]) : '';
      for (const [x, y] of made) if (edgeKey(x, y) !== bk) note(x, y);
      if (beyond && 'f' in p) leftover = beyond;
      else if (beyond) note(beyond[0], beyond[1]);
      cur = reached;
    }
    // A cut ending at a place inside a face keeps its way through to the far side.
    if (leftover) note(leftover[0], leftover[1]);
    return { edges: edges.filter(([x, y]) => T.hasEdge(x, y)), missed };
  });
}

const onSegment = (a: readonly number[], b: readonly number[], p: readonly number[]): boolean => {
  const ab = sub(b, a), ap = sub(p, a);
  const len = length(ab);
  if (len < 1e-9) return false;
  const t = dot(ap, ab) / (len * len);
  return t > 1e-6 && t < 1 - 1e-6 && length(sub(ap, scale(ab, t))) < Math.max(1e-4, len * 1e-5);
};

/* ---------- bevel ---------- */

/**
 * Blender's and other modellers' Bevel on edges, one segment -- a chamfer (a browser adaptation; the Forge's owner (crispy, OT.R112), 2026-11-18: "it
 * should look like ... blender ... Fix it for both faces and edges"): the edges `edges` (each between two faces) bevelled
 * together, `width` across, worked out point by point as Blender's is, so bevelled edges meeting at a corner run into it
 * and meet on one seam. At each point of a bevelled edge, every face's corner there becomes:
 * - both its edges at the point bevelled: the place `width` in from both (their mitre);
 * - one bevelled: a place on the other edge, `width` off the bevelled one's line -- the one place every face along that
 *   edge takes, so the strips there share it and close;
 * - neither: the point kept, with the places its edges slid to set in beside it (or in its stead when both edges slid:
 *   a box's side under a bevelled top edge loses its corner).
 * Where two or more bevelled edges meet at a point with a full fan of faces round it (`Topo.fan`), Blender's sectors:
 * the faces between each two bevelled edges in turn take one new place together. A face along each edge (between its
 * two faces' new corners), and a patch closing whatever hole is left round a point (three edges bevelled at a box's
 * corner: a triangle); a patch with no area (a grid's edge carrying straight on) is left out and its middle point set
 * into the face beside it. Places are held under half of every edge they slide along. Each bevel takes its first face's
 * style, object and collision words by facing; a patch its point's first face's. Returns the new faces, the faces
 * reshaped, and how many edges were not between two faces.
 */
export function bevelEdges(m: EditMesh, edges: readonly (readonly [number, number])[], width: number, segments = 1, shape = 1): { faces: number[]; touched: number[]; skipped: number } {
  return transact(m, {}, { faces: [], touched: [], skipped: edges.length }, (T) => bevelIn(T, edges, width, false, Math.max(1, Math.round(segments)), shape));
}

/**
 * A level editor's edge Shift-drag on edges between two faces (:  with
 * a quarter of the grid wide): each edge bevelled `width` across as `bevelEdges`, its own two
 * points and the edge between them kept in the middle of the strip -- which the drag then pulls out, raising a ridge
 * with the surface closed round it (never a fin standing on it). Returns the new faces.
 */
export function extrudeClosedEdges(m: EditMesh, edges: readonly (readonly [number, number])[], width: number): { faces: number[]; touched: number[]; skipped: number } {
  return transact(m, {}, { faces: [], touched: [], skipped: edges.length }, (T) => bevelIn(T, edges, width, true, 1, 0));
}

function bevelIn(T: Topo, edges: readonly (readonly [number, number])[], width: number, keepEdge: boolean, segments: number, shape: number): { faces: number[]; touched: number[]; skipped: number } {
  const m = T.m;
  const B = new Map<string, { a: number; b: number; F1: number; F2: number }>();
  let skipped = 0;
  for (const [x, y] of edges) {
    const k = edgeKey(x, y);
    if (B.has(k)) continue;
    const fs = T.facesOn(x, y);
    const F1 = fs.find((f) => T.runs(f, x, y)), F2 = fs.find((f) => T.runs(f, y, x));
    if (fs.length !== 2 || F1 === undefined || F2 === undefined || F1 === F2) { skipped++; continue; }
    B.set(k, { a: x, b: y, F1, F2 });
  }
  if (!B.size) return { faces: [], touched: [], skipped };
  const verts = new Set([...B.values()].flatMap((e) => [e.a, e.b]));
  // The faces round each point, and each face's ring as it was.
  const around = new Map<number, number[]>();
  const rings = new Map<number, number[]>();
  for (const v of verts) { const fs = T.facesAt(v); around.set(v, fs); for (const f of fs) if (!rings.has(f)) rings.set(f, T.ring(f)); }
  const P = (v: number): Vec3 => T.pos(v);
  const along = (v: number, n: number): { u: Vec3; len: number } => { const d = sub(P(n), P(v)); return { u: normalize(d), len: length(d) }; };
  // A place on edge v -> n, `width` off the bevelled edge v -> o's line (shared by every face along v -> n).
  const slid = new Map<string, number>();
  /** The places slid along an edge of one face (a border): a gap there closes against the border (the patches). */
  const onBorder = new Set<number>();
  const slideTo = (v: number, n: number, o: number): number => {
    const key = `${v}>${n}`;
    const had = slid.get(key);
    if (had !== undefined) return had;
    const e = along(v, n), b = along(v, o);
    const sin = length(cross(e.u, b.u));
    const d = Math.min(sin > 1e-6 ? width / sin : width, e.len * 0.45);
    const s = T.addVert(add(P(v), scale(e.u, d)));
    slid.set(key, s);
    if (T.facesOn(v, n).length === 1) onBorder.add(s);
    return s;
  };
  type Chain = { verts: number[]; attrs: { uv: readonly number[]; color: readonly number[]; normal: readonly number[]; centroid: readonly number[] }[] };
  const chains = new Map<number, Map<number, Chain>>();
  const regionOf = new Map<number, Set<number>>();   // each point's new places, for the patches
  const cornerAt = (f: number, v: number): number => m.faces[f]!.corners[rings.get(f)!.indexOf(v)]!;
  const attrsToward = (f: number, v: number, n: number, x: number): Chain['attrs'][number] => {
    const t = length(sub(P(x), P(v))) / (length(sub(P(n), P(v))) || 1);
    return T.between(cornerAt(f, v), cornerAt(f, n), Math.min(1, t));
  };
  const setChain = (f: number, v: number, chain: Chain): void => {
    let s = regionOf.get(v);
    if (!s) { s = new Set([v]); regionOf.set(v, s); }
    if (chain.verts.length) s.add(chain.verts[0]!);
    let byV = chains.get(f);
    if (!byV) { byV = new Map(); chains.set(f, byV); }
    byV.set(v, chain);
  };
  // Blender's sectors at a point with two or more bevelled edges and a full fan round it.
  for (const v of verts) {
    const fan = T.fan(v);
    if (!fan || !fan.closed) continue;                       // an open fan (a border): the face by face rules below
    const spokes = fan.out, order = fan.faces;
    const bevelled = spokes.map((n, k) => (B.has(edgeKey(v, n)) ? k : -1)).filter((k) => k >= 0);
    if (bevelled.length < 2) continue;
    const N = order.length;
    for (let s = 0; s < bevelled.length; s++) {
      const bi = bevelled[s]!, bj = bevelled[(s + 1) % bevelled.length]!;
      const count = ((bj - bi + N) % N) || N;
      const sector = Array.from({ length: count }, (_, k) => order[(bi + 1 + k) % N]!);
      const inner = Array.from({ length: count - 1 }, (_, k) => spokes[(bi + 1 + k) % N]!);
      let x: number;
      if (count === 1) {
        // One face, both its edges at v bevelled: their mitre in it.
        const g = sector[0]!;
        const e1 = along(v, T.step(g, v, -1)), e2 = along(v, T.step(g, v, 1));
        const sin = length(cross(e1.u, e2.u));
        const d = Math.min(sin > 1e-6 ? width / sin : width, 0.45 * Math.min(e1.len, e2.len));
        x = T.addVert(add(P(v), scale(add(e1.u, e2.u), d)));
      } else {
        // On the inner edge nearest the sector's middle, `width` off both bevelled edges.
        const u1 = along(v, spokes[bi]!).u, u2 = along(v, spokes[bj]!).u;
        let mid = add(u1, u2);
        if (length(mid) < 1e-6) mid = inner.reduce((acc, n) => add(acc, along(v, n).u), [0, 0, 0] as Vec3);
        const pick = inner.reduce((best, n) => (dot(along(v, n).u, mid) > dot(along(v, best).u, mid) ? n : best));
        const e = along(v, pick);
        const sin = Math.min(length(cross(e.u, u1)), length(cross(e.u, u2)));
        const d = Math.min(sin > 1e-6 ? width / sin : width, 0.45 * e.len);
        x = T.addVert(add(P(v), scale(e.u, d)));
      }
      for (const g of sector) setChain(g, v, { verts: [x], attrs: [attrsToward(g, v, T.step(g, v, 1), x)] });
    }
  }
  for (const v of verts) {
    for (const f of around.get(v) ?? []) {
      if (chains.get(f)?.has(v)) continue;                    // a sector's (above)
      const vs = rings.get(f)!;
      const i = vs.indexOf(v);
      const prev = vs[(i + vs.length - 1) % vs.length]!, next = vs[(i + 1) % vs.length]!;
      const bp = B.has(edgeKey(prev, v)), bn = B.has(edgeKey(v, next));
      if (bp && bn) {
        // The mitre: `width` in from both edges.
        const e1 = along(v, prev), e2 = along(v, next);
        const sin = length(cross(e1.u, e2.u));
        const k = Math.min(sin > 1e-6 ? width / sin : width, 0.45 * Math.min(e1.len, e2.len));
        const x = T.addVert(add(P(v), scale(add(e1.u, e2.u), k)));
        const A = cornerAttrs(m, cornerAt(f, v)), Ap = cornerAttrs(m, cornerAt(f, prev)), An = cornerAttrs(m, cornerAt(f, next));
        const s1 = k / (e1.len || 1), s2 = k / (e2.len || 1);
        const mix = (a: readonly number[], p: readonly number[], n: readonly number[]): number[] => a.map((y, j) => y + (p[j]! - y) * s1 + (n[j]! - y) * s2);
        setChain(f, v, { verts: [x], attrs: [{ uv: mix(A.uv, Ap.uv, An.uv), color: mix(A.color, Ap.color, An.color), normal: [...A.normal], centroid: [...A.centroid] }] });
      } else if (bp || bn) {
        // Slid along the edge not bevelled, off the bevelled one.
        const [n, o] = bn ? [prev, next] : [next, prev];
        const x = slideTo(v, n, o);
        setChain(f, v, { verts: [x], attrs: [attrsToward(f, v, n, x)] });
      }
    }
  }
  // Faces with neither edge bevelled at the point. Where the faces close round it (the reference editor's bevel walk
  // round an end point; the Forge's owner (crispy, OT.R112), 2026-11-19: "always match hammer for all tools"): every edge there cut `width` along
  // it (held at 15/16 of the edge, the reference's; under half where its far end is cut too) and the point dropped -- each such face's corner cut off, and the
  // patch below filling the hole round the point (an inset's diagonal at a column's foot: the patch ends on it, no
  // sharp point left inside). On a border, or keeping the edge (Shift-drag): the places their edges slid to, set in
  // beside it (or in its stead where both slid).
  const cutAlongEdge = (v: number, n: number): number => {
    const key = `${v}>${n}`;
    const had = slid.get(key);
    if (had !== undefined) return had;
    const e = along(v, n);
    const s = T.addVert(add(P(v), scale(e.u, Math.min(width, e.len * (verts.has(n) ? 0.45 : 15 / 16)))));
    slid.set(key, s);
    return s;
  };
  for (const v of verts) {
    const closedRound = !keepEdge && !!T.fan(v)?.closed;
    for (const f of around.get(v) ?? []) {
      if (chains.get(f)?.has(v)) continue;
      const vs = rings.get(f)!;
      const i = vs.indexOf(v);
      const prev = vs[(i + vs.length - 1) % vs.length]!, next = vs[(i + 1) % vs.length]!;
      let sp = slid.get(`${v}>${prev}`), sn = slid.get(`${v}>${next}`);
      if (sp === undefined && sn === undefined && !closedRound) continue;
      if (closedRound) {
        sp ??= cutAlongEdge(v, prev);
        sn ??= cutAlongEdge(v, next);
        let region = regionOf.get(v);
        if (!region) { region = new Set([v]); regionOf.set(v, region); }
        region.add(sp); region.add(sn);
      }
      const chain: Chain = { verts: [], attrs: [] };
      if (sp !== undefined) { chain.verts.push(sp); chain.attrs.push(attrsToward(f, v, prev, sp)); }
      if (sp === undefined || sn === undefined) { chain.verts.push(v); chain.attrs.push(cornerAttrs(m, cornerAt(f, v))); }
      if (sn !== undefined) { chain.verts.push(sn); chain.attrs.push(attrsToward(f, v, next, sn)); }
      let byV = chains.get(f);
      if (!byV) { byV = new Map(); chains.set(f, byV); }
      byV.set(v, chain);
    }
  }
  // Keeping the edge: its two points' corners in each of its faces, read before the rings change.
  const edgeCorner = new Map<string, Attrs>();
  if (keepEdge) for (const { a, b, F1, F2 } of B.values()) for (const f of [F1, F2]) for (const v of [a, b]) edgeCorner.set(`${f}:${v}`, cornerAttrs(m, cornerAt(f, v)));
  // The faces' rings rebuilt; each chain's corners new.
  const touched = new Set<number>();
  const placed = new Map<number, Map<number, number[]>>();  // face -> point -> its new corners' points
  for (const [f, byV] of chains) {
    const face = m.faces[f]!;
    const vs = rings.get(f)!;
    const corners: number[] = [];
    vs.forEach((v, i) => {
      const c = byV.get(v);
      if (!c) { corners.push(face.corners[i]!); return; }
      c.verts.forEach((x, j) => corners.push(T.addCorner(x, c.attrs[j]!)));
      let byPoint = placed.get(f);
      if (!byPoint) { byPoint = new Map(); placed.set(f, byPoint); }
      byPoint.set(v, c.verts);
    });
    T.setRing(f, corners);
    touched.add(f);
  }
  const at = (f: number, v: number): number => placed.get(f)?.get(v)?.[0] ?? v;
  const made: number[] = [];
  const cornerFor = (f: number, x: number): number => {
    const face = m.faces[f]!;
    const k = face.corners.findIndex((c) => m.cVert[c] === x);
    return k >= 0 ? face.corners[k]! : face.corners[0]!;
  };
  // A face along each bevelled edge: F1's new corners run back, F2's on -- or, keeping the edge (a level editor's edge extrude,
  // ), two: F1's side up to the edge, the edge back to F2's side.
  const strip = (ring: number[], src: number[], like: number): void => {
    const keep = ring.map((x, i) => ({ x, f: src[i]! })).filter((p, i, arr) => p.x !== arr[(i + 1) % arr.length]!.x);
    if (keep.length < 3) return;
    made.push(T.faceLike(keep.map((p) => T.addCorner(p.x, edgeCorner.get(`${p.f}:${p.x}`) ?? cornerAttrs(m, cornerFor(p.f, p.x)))), like));
  };
  const strips: { ring: [number, number, number, number]; a: number; b: number }[] = [];
  for (const { a, b, F1, F2 } of B.values()) {
    if (keepEdge) {
      strip([at(F1, b), at(F1, a), a, b], [F1, F1, F1, F1], F1);
      strip([b, a, at(F2, a), at(F2, b)], [F2, F2, F2, F2], F2);
    } else {
      const ring: [number, number, number, number] = [at(F1, b), at(F1, a), at(F2, a), at(F2, b)];
      strip(ring, [F1, F1, F2, F2], F1);
      if (new Set(ring).size === 4) strips.push({ ring, a, b });
    }
  }
  // The patches: the runs round each point left open (no face running them back), chained into loops.
  for (const [v, region] of regionOf) {
    const runs = new Map<string, number>();
    for (const x of region) for (const f of T.facesAt(x)) { const vs = T.ring(f); vs.forEach((y, i) => runs.set(`${y}>${vs[(i + 1) % vs.length]}`, f)); }
    const open = new Map<number, number>();
    for (const x of region) for (const y of region) if (x !== y && runs.has(`${x}>${y}`) && !runs.has(`${y}>${x}`)) open.set(x, y);
    const seen = new Set<number>();
    // A gap at a point on the border (an open fan, as the disc's ground ends) is a path, not a loop: from a place slid
    // along the border edge to the point, or back -- closed along the border by the patch (Blender's bevel at a
    // boundary vertex), its closing edge lying on the old border edge.
    const into = new Set(open.values());
    const starts = [...open.keys()].sort((p, q) => Number(into.has(p)) - Number(into.has(q)));
    for (const start of starts) {
      if (seen.has(start)) continue;
      const loop: number[] = [];
      let x: number | undefined = start;
      while (x !== undefined && !seen.has(x)) { seen.add(x); loop.push(x); x = open.get(x); }
      const path = x === undefined && loop.length >= 3 && !into.has(start);
      if (path) {
        const [p0, pk] = [loop[0]!, loop[loop.length - 1]!];
        if (!((p0 === v && onBorder.has(pk)) || (pk === v && onBorder.has(p0)))) continue;
      } else if (x !== start || loop.length < 3) continue;
      const pts = loop.map((y) => P(y));
      let area: Vec3 = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) area = add(area, cross(pts[i]!, pts[(i + 1) % pts.length]!));
      const src = (around.get(v) ?? []).find((f) => T.live(f)) ?? [...B.values()][0]!.F1;
      if (length(area) < 1e-9 * Math.max(1, width * width)) {
        // A loop with no area (v between two places in a line): v set into the face running the two ends' long edge.
        if (loop.length === 3 && loop.includes(v)) {
          const k = loop.indexOf(v);
          const before = loop[(k + 2) % 3]!, after = loop[(k + 1) % 3]!;
          const owner = runs.get(`${after}>${before}`);
          if (owner !== undefined && T.live(owner)) {
            const cs = [...m.faces[owner]!.corners];
            const ia = cs.findIndex((c) => m.cVert[c] === after);
            cs.splice(ia + 1, 0, T.addCorner(v, cornerAttrs(m, cs[ia]!)));
            T.setRing(owner, cs);
            touched.add(owner);
          }
        }
        continue;
      }
      // The patch runs the loop back, closing it.
      made.push(T.faceLike([...loop].reverse().map((y) => T.addCorner(y, cornerAttrs(m, m.faces[src]!.corners[0]!))), src));
    }
  }
  // Segments (the reference editor's bevel Steps and Shape; the Forge's owner (crispy, OT.R112), 2026-11-19: "parametric values ... for each edit
  // tool"): each strip's two ends -- the edges across it, from F1's side to F2's -- cut into `segments` pieces along
  // its profile, from the straight chamfer (shape 0) to the curve through the corner the edge stood on (shape 1, a
  // quadratic curve the strip's sides are tangent to), and the cuts joined along the strip. An end two strips share
  // (bevelled edges meeting at a point) is cut once, both strips taking the same points; a patch beside it gains them.
  if (!keepEdge && segments > 1) {
    const firstNew = m.faces.length;
    const cutsOn = new Map<string, number[]>();   // an end's points, from its lower-numbered point's side
    const pointsOn = (x: number, y: number, corner: number): number[] => {
      const k = edgeKey(x, y);
      let pts = cutsOn.get(k);
      if (!pts) {
        if (!T.hasEdge(x, y)) return [];
        const X = P(x), Y = P(y), C = P(corner);
        const s = Math.min(1, Math.max(0, shape));
        const placed = cutAlong(T, x, y, segments - 1, (i, n) => {
          const t = i / n;
          const lin = add(scale(X, 1 - t), scale(Y, t));
          const curve = add(add(scale(X, (1 - t) * (1 - t)), scale(C, 2 * t * (1 - t))), scale(Y, t * t));
          return add(scale(lin, 1 - s), scale(curve, s));
        });
        pts = x < y ? placed : [...placed].reverse();
        cutsOn.set(k, pts);
      }
      return x < y ? pts : [...pts].reverse();
    };
    for (const { ring: [p0, p1, p2, p3], a, b } of strips) {
      const atA = pointsOn(p1, p2, a), atB = pointsOn(p0, p3, b);
      joinAcross(T, atA, atB);
    }
    for (let f = firstNew; f < m.faces.length; f++) if (T.live(f)) made.push(f);
  }
  for (const f of touched) T.normalsDown(f);
  return { faces: made.filter((f) => T.live(f)), touched: [...touched].filter((f) => T.live(f)), skipped };
}

/* ---------- a level editor's further edge and vertex operations ---------- */

/**
 * A level editor's vertex Shift-drag ( ->  -> : a vertex
 * bevelled keeping itself, the grid wide): each point's edges cut `width` from it (the far point itself on an edge no
 * longer than that), and each face round it cut across between the two cuts beside it -- the point left at the apex of
 * a fan of triangles, which the drag then pulls out into a spike. Returns the points (the selection the drag moves).
 */
export function extrudeVerts(m: EditMesh, verts: readonly number[], width: number): number[] {
  return transact<number[]>(m, {}, [], (T) => {
    const out: number[] = [];
    for (const v of verts) {
      if (!T.facesAt(v).length) continue;
      for (const n of T.spokes(v)) {
        const len = length(sub(T.pos(n), T.pos(v)));
        if (len > width + 1e-9) T.splitEdge(v, n, width / len);
      }
      for (const f of T.facesAt(v)) {
        const ring = T.ring(f);
        if (ring.length <= 3) continue;
        const p = T.step(f, v, -1), q = T.step(f, v, 1);
        if (T.hasEdge(p, q)) continue;
        T.splitFace(f, q, p);
      }
      for (const f of T.facesAt(v)) T.normalsDown(f);
      out.push(v);
    }
    return out;
  });
}

/**
 * A level editor's Connect (V in its edge tool; ): each selected edge sharing a face with another selected edge
 * split at its middle, and every two of the new points that share a face joined by a new edge across it -- a ring of
 * edges (Select Ring) connected is a loop cut. Faces keep their style, object, mapping and words (`Topo.splitFace`).
 * Returns the new edges.
 */
export function connectEdges(m: EditMesh, edges: readonly (readonly [number, number])[]): [number, number][] {
  return transact<[number, number][]>(m, {}, [], (T) => {
    if (edges.length < 2) return [];
    const facesOf = (e: readonly [number, number]): Set<number> => new Set(T.facesOn(e[0], e[1]));
    const cut = edges.filter((e, i) => edges.some((o, j) => j !== i && [...facesOf(e)].some((f) => facesOf(o).has(f))));
    const mids: number[] = [];
    for (const [a, b] of cut) if (T.hasEdge(a, b)) mids.push(T.splitEdge(a, b, 0.5));
    const out: [number, number][] = [];
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) {
        const x = mids[i]!, y = mids[j]!;
        if (T.hasEdge(x, y)) continue;
        const atY = new Set(T.facesAt(y));
        const f = T.facesAt(x).find((g) => {
          if (!atY.has(g)) return false;
          const vs = T.ring(g), n = vs.length, ix = vs.indexOf(x), iy = vs.indexOf(y);
          return (ix + 1) % n !== iy && (iy + 1) % n !== ix;
        });
        if (f === undefined) continue;
        for (const g of T.splitFace(f, x, y)) T.normalsDown(g);
        out.push([x, y]);
      }
    }
    return out;
  });
}

/**
 * Selected edges split into their connected runs (a level editor's ), each run in order along it: an end to an
 * end, or round a closed loop from any point. Null for a run that branches.
 */
function edgeRuns(edges: readonly (readonly [number, number])[]): [number, number][][] | null {
  const left = edges.map((e) => [e[0], e[1]] as [number, number]);
  const runs: [number, number][][] = [];
  while (left.length) {
    const island: [number, number][] = [left.pop()!];
    for (let grew = true; grew;) {
      grew = false;
      for (let i = left.length - 1; i >= 0; i--) {
        const e = left[i]!;
        if (island.some((x) => x.includes(e[0]) || x.includes(e[1]))) { island.push(e); left.splice(i, 1); grew = true; }
      }
    }
    const degree = new Map<number, number>();
    for (const [a, b] of island) { degree.set(a, (degree.get(a) ?? 0) + 1); degree.set(b, (degree.get(b) ?? 0) + 1); }
    if ([...degree.values()].some((d) => d > 2)) return null;
    let at = [...degree].find(([, d]) => d === 1)?.[0] ?? island[0]![0];
    const order: [number, number][] = [];
    const pool = [...island];
    while (pool.length) {
      const i = pool.findIndex((e) => e.includes(at));
      if (i < 0) return null;
      const e = pool.splice(i, 1)[0]!;
      const next = e[0] === at ? e[1] : e[0];
      order.push([at, next]);
      at = next;
    }
    runs.push(order);
  }
  return runs;
}

/**
 * A level editor's Bridge on edges (B;  over ): two runs of open edges, as many in each,
 * bridged edge by edge in order -- each pair by `bridgeEdges` -- the second run taken the way round that pairs its ends
 * nearest the first's; or, the selection two edges that touch (one run), the single triangle between them. Open edges
 * only (`bridgeEdgesBlocked`). Returns the new faces, or the reason.
 */
export function bridgeEdgeRuns(m: EditMesh, edges: readonly (readonly [number, number])[]): { faces: number[] } | { error: string } {
  if (edges.length === 2) return bridgeEdges(m, edges[0] as [number, number], edges[1] as [number, number]);
  const runs = edgeRuns(edges);
  if (!runs || runs.length !== 2) return { error: 'Bridge: select two runs of open edges (or two edges)' };
  const [A, B0] = runs as [[number, number][], [number, number][]];
  if (A.length !== B0.length) return { error: `Bridge: the two runs have ${A.length} and ${B0.length} edges: they need as many each` };
  for (const [a, b] of [...A, ...B0]) if (edgeFaceCount(m, a, b) !== 1) return { error: `Bridge: ${BRIDGE_OPEN_ONLY}` };
  const p = (v: number): Vec3 => vertPos(m, v);
  const far = (x: readonly [number, number][], y: readonly [number, number][]): number => length(sub(p(x[0]![0]), p(y[0]![0]))) + length(sub(p(x.at(-1)![1]), p(y.at(-1)![1])));
  const Brev = [...B0].reverse().map(([a, b]) => [b, a] as [number, number]);
  const B = far(A, B0) <= far(A, Brev) ? B0 : Brev;
  return transact<{ faces: number[] } | { error: string }>(m, { open: true }, (why) => ({ error: `Bridge: ${why}` }), (T) => {
    const made: number[] = [];
    for (let i = 0; i < A.length; i++) {
      const r = bridgeEdgesIn(T, A[i]!, B[i]!);
      if ('error' in r) throw new MeshError(r.error.replace(/^Bridge: /, ''));
      made.push(...r.faces);
    }
    return { faces: made };
  });
}

/** Why `bridgeEdgeRuns` would refuse the edges, before any is tried (the editor greys Bridge with it), or null. */
export function bridgeRunsBlocked(m: EditMesh, edges: readonly (readonly [number, number])[]): string | null {
  if (edges.length === 2) return bridgeEdgesBlocked(m, edges[0] as [number, number], edges[1] as [number, number]);
  const runs = edgeRuns(edges);
  if (!runs || runs.length !== 2) return 'select two runs of open edges (or two edges)';
  if (runs[0]!.length !== runs[1]!.length) return `the two runs have ${runs[0]!.length} and ${runs[1]!.length} edges: they need as many each`;
  for (const [a, b] of edges) if (edgeFaceCount(m, a, b) !== 1) return BRIDGE_OPEN_ONLY;
  return null;
}

/* ---------- parametric cuts ---------- */

/**
 * Points along edge `x` -> `y` (the edge kept, `cuts` new points on it, from `x`'s end): split from the far end in, each
 * new point the next split's end. `place`, given, moves the k-th (1-based of `cuts` + 1) to where it says.
 */
function cutAlong(T: Topo, x: number, y: number, cuts: number, place?: (k: number, n: number) => readonly number[]): number[] {
  const pts: number[] = [];
  let end = y;
  for (let k = cuts; k >= 1; k--) { end = T.splitEdge(x, end, k / (k + 1)); pts.unshift(end); }
  if (place) pts.forEach((v, i) => T.setPos(v, place(i + 1, cuts + 1)));
  return pts;
}

/** Each `k`-th of `from` joined to the `k`-th of `to` across the face they share. Returns the new edges. */
function joinAcross(T: Topo, from: readonly number[], to: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < Math.min(from.length, to.length); k++) {
    const x = from[k]!, y = to[k]!;
    if (T.hasEdge(x, y)) continue;
    const atY = new Set(T.facesAt(y));
    const f = T.facesAt(x).find((g) => {
      if (!atY.has(g)) return false;
      const vs = T.ring(g), n = vs.length, ix = vs.indexOf(x), iy = vs.indexOf(y);
      return (ix + 1) % n !== iy && (iy + 1) % n !== ix;
    });
    if (f === undefined) continue;
    for (const g of T.splitFace(f, x, y)) T.normalsDown(g);
    out.push([x, y]);
  }
  return out;
}

/**
 * A loop cut of `cuts` loops (the Forge's owner (crispy, OT.R112), 2026-11-19: "parametric values ... for each edit tool"): the ring through edge
 * `a`-`b` -- across each even-sided face to the side opposite, among `within` (one object's faces) -- each edge cut into
 * `cuts` + 1 equal pieces, the k-th cut of each edge joined to the k-th of the next across their face: `cuts` new
 * loops, evenly spaced. The ring is walked keeping each edge's ends lined up with the last's (a face's opposite side
 * runs back the other way), so the loops never cross. `at` (the Knife's loop mode, the reference editor's): one loop
 * only, each edge cut that share along from its start's side, through four-sided faces only, as the reference walks.
 * Returns the new edges.
 */
export function loopCutAt(m: EditMesh, a: number, b: number, cuts = 1, within?: readonly number[], at?: number): [number, number][] {
  const n = Math.max(1, Math.round(cuts));
  return transact<[number, number][]>(m, {}, [], (T) => {
    const allow = within ? new Set(within) : null;
    const ok = (f: number): boolean => !allow || allow.has(f);
    if (!T.hasEdge(a, b)) return [];
    // The ring: edges in order, each as [its end on the start's a-side, its other end], and the face after each.
    const step = (x: number, y: number, f: number): { edge: [number, number]; face: number } | null => {
      const vs = T.ring(f), k = vs.length;
      if (k % 2 !== 0 || k < 4 || (at !== undefined && k !== 4)) return null;
      const i = vs.findIndex((v, j) => (v === x && vs[(j + 1) % k] === y) || (v === y && vs[(j + 1) % k] === x));
      if (i < 0) return null;
      const j = (i + k / 2) % k, p = vs[j]!, q = vs[(j + 1) % k]!;
      return { edge: vs[i] === x ? [q, p] : [p, q], face: f };
    };
    const walk = (start: [number, number], first: number): { edges: [number, number][]; faces: number[]; closed: boolean } => {
      const edges: [number, number][] = [], faces: number[] = [];
      let cur = start, f: number | undefined = first;
      const seen = new Set<string>([edgeKey(start[0], start[1])]);
      while (f !== undefined && ok(f)) {
        const s = step(cur[0], cur[1], f);
        if (!s) break;
        faces.push(f);
        const key = edgeKey(s.edge[0], s.edge[1]);
        if (seen.has(key)) return { edges, faces, closed: true };
        seen.add(key);
        edges.push(s.edge);
        const across: number[] = T.facesOn(s.edge[0], s.edge[1]).filter((g) => g !== f && ok(g));
        cur = s.edge;
        f = across.length === 1 ? across[0] : undefined;
      }
      return { edges, faces, closed: false };
    };
    const beside = T.facesOn(a, b).filter(ok);
    if (!beside.length) return [];
    const fwd = walk([a, b], beside[0]!);
    let edges: [number, number][] = [[a, b], ...fwd.edges], faces = fwd.faces;
    if (!fwd.closed && beside[1] !== undefined) {
      const back = walk([a, b], beside[1]);
      edges = [...back.edges.reverse(), ...edges];
      faces = [...back.faces.reverse(), ...faces];
    }
    if (!faces.length) return [];
    const pts = edges.map(([x, y]) => (at !== undefined ? [T.splitEdge(x, y, at)] : cutAlong(T, x, y, n)));
    const out: [number, number][] = [];
    for (let k = 0; k + 1 < pts.length; k++) out.push(...joinAcross(T, pts[k]!, pts[k + 1]!));
    if (fwd.closed) out.push(...joinAcross(T, pts[pts.length - 1]!, pts[0]!));
    return out;
  });
}

/**
 * The reference editor's vertex Shift-drag (the Forge's owner (crispy, OT.R112), 2026-11-19: "yes do the shift drag extend on vertices"): each
 * point on an open border -- two of its edges open, a face on one side only -- extended out of the border, every other
 * point pulled into a spike (`extrudeVerts`). Border points whose open edge between them is selected too (both ends)
 * pull that edge out (`extrudeEdges`: a strip, side by side sharing their copies); a border point alone gets a copy and
 * one four-sided face across its two border edges, from the one neighbour to the other through it and back by the copy
 * -- on the open side, the border's faces carried on. Every new place starts where its point stands (the drag moves
 * it). Returns the points the drag moves (the copies for the border points, the points themselves for spikes), and each
 * lone border point's two triangles (`joinFlatPairs` at the release).
 */
export function extrudeOrExtendVerts(m: EditMesh, verts: readonly number[], width: number): { moving: number[]; pairs: [number, number][] } {
  return transact<{ moving: number[]; pairs: [number, number][] }>(m, { open: true, slivers: true }, { moving: [], pairs: [] }, (T) => {
    const pairs: [number, number][] = [];
    const isOpen = (a: number, b: number): boolean => T.facesOn(a, b).length === 1;
    const border = new Set(verts.filter((v) => T.spokes(v).filter((w) => isOpen(v, w)).length === 2));
    const out: number[] = [];
    // Open edges with both ends selected: pulled out as edges.
    const runs: [number, number][] = [];
    const seen = new Set<string>();
    for (const v of border) for (const w of T.spokes(v)) {
      const k = edgeKey(v, w);
      if (border.has(w) && isOpen(v, w) && !seen.has(k)) { seen.add(k); runs.push([v, w]); }
    }
    const onEdge = new Set(runs.flat());
    if (runs.length) {
      const r = extrudeEdgesIn(T, runs);
      out.push(...new Set(r.edges.flat()));
    }
    // A border point alone: a copy, and a triangle off each of its two border edges to it, on the open side -- never one
    // face through the point's two neighbours, which at a corner of the border (a wall's foot meeting its side) lies
    // across the face already there and folds over it as the copy is pulled (the Forge's owner (crispy, OT.R112), 2026-11-19: "I get this bad
    // geometry"). Where the pull leaves the two in one plane (a point along a straight border), the caller joins them
    // into the one four-sided face the reference editor makes (`pairs`).
    for (const v of border) {
      if (onEdge.has(v)) continue;
      const fan = T.fan(v);
      if (!fan || fan.closed) continue;
      const A = fan.inn[0]!, B = fan.out[fan.out.length - 1]!;     // the border's two spokes: A -> v in the first face, v -> B in the last
      const first = fan.faces[0]!, last = fan.faces[fan.faces.length - 1]!;
      const copy = T.addVert(T.pos(v));
      const t1 = bridgeFace(T, [B, v, copy], [T.cornerAt(last, B), T.cornerAt(last, v), T.cornerAt(last, v)], last);
      const t2 = bridgeFace(T, [v, A, copy], [T.cornerAt(first, v), T.cornerAt(first, A), T.cornerAt(first, v)], first);
      pairs.push([t1, t2]);
      out.push(copy);
    }
    // Every other point: a spike.
    for (const v of verts) {
      if (border.has(v) || !T.facesAt(v).length) continue;
      for (const n of T.spokes(v)) {
        const len = length(sub(T.pos(n), T.pos(v)));
        if (len > width + 1e-9) T.splitEdge(v, n, width / len);
      }
      for (const f of T.facesAt(v)) {
        if (T.ring(f).length <= 3) continue;
        const p = T.step(f, v, -1), q = T.step(f, v, 1);
        if (!T.hasEdge(p, q)) T.splitFace(f, q, p);
      }
      for (const f of T.facesAt(v)) T.normalsDown(f);
      out.push(v);
    }
    return { moving: out, pairs };
  });
}

/**
 * A border point's two triangles (`extrudeOrExtendVerts`' `pairs`) joined into one four-sided face where the pull left
 * them in one plane (a point along a straight border: the reference editor's one face); at an angle, kept two.
 */
export function joinFlatPairs(m: EditMesh, pairs: readonly (readonly [number, number])[]): void {
  for (const [a, b] of pairs) {
    if (!m.faces[a] || !m.faces[b]) continue;
    if (dot(faceNormalOf(m, a), faceNormalOf(m, b)) < 1 - 1e-6) continue;
    mergeFaces(m, a, b);
  }
}
const faceNormalOf = (m: EditMesh, f: number): Vec3 => normalize(faceVerts(m, f).map((v) => vertPos(m, v)).reduce((s, p, i, ps) => add(s, cross(p, ps[(i + 1) % ps.length]!)), [0, 0, 0] as Vec3));

/**
 * Faces left bent -- their points no longer in one plane, a corner moved off it -- split into triangles with real edges
 * (the Forge's owner (crispy, OT.R112), 2026-11-19: "I also get that type of geometry in a lot of other tools, it is like an edge but it is
 * invisible. Please fix on all the tools that do this"): a bent face is drawn as triangles anyway, its fold an edge no
 * one can see or pick; split, the fold is an edge like any other. Each triangle keeps the face's style, object, mapping
 * and its collision words as they were (the same surface, cut). A face within `1e-4` of its size of flat is left whole;
 * a displacement keeps its own grid. Returns each face split and the triangles in its place.
 */
export function splitBentFaces(m: EditMesh, faces: Iterable<number>): Map<number, number[]> {
  const list = [...faces];
  return transact<Map<number, number[]>>(m, {}, new Map(), (T) => {
    const made = new Map<number, number[]>();
    for (const f of list) {
      const face = m.faces[f];
      if (!face || face.disp || face.corners.length < 4) continue;
      if (!isBent(m, f)) continue;
      const ps = T.ring(f).map((v) => T.pos(v));
      const corners = [...face.corners];
      const props = T.propsOf(f, { surface: true });
      const tris: number[] = [];
      for (const [i, j, k] of triangulate(ps)) {
        const g = T.makeFace([corners[i]!, corners[j]!, corners[k]!].map((x) => T.cloneCorner(x)), props);
        T.normalsDown(g);
        tris.push(g);
      }
      T.kill(f);
      made.set(f, tris);
    }
    return made;
  });
}

/** Whether face `f` is bent: four points or more, one off their plane by more than `1e-4` of the face's size. */
export function isBent(m: EditMesh, f: number): boolean {
  const face = m.faces[f];
  if (!face || face.disp || face.corners.length < 4) return false;
  const ps = faceVerts(m, f).map((v) => vertPos(m, v));
  const n = normalize(ps.reduce((s, p, i) => add(s, cross(p, ps[(i + 1) % ps.length]!)), [0, 0, 0] as Vec3));
  const c = scale(ps.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3), 1 / ps.length);
  let size = 0, bend = 0;
  for (const p of ps) { size = Math.max(size, length(sub(p, c))); bend = Math.max(bend, Math.abs(dot(sub(p, c), n))); }
  return bend > Math.max(1e-6, size * 1e-4);
}

/* ---------- thicken faces ---------- */

/** Hollow's refusal where the walls would cross inside the shape. */
/** Thicken's word where no selected island of faces has an open border all round (a closed solid's faces). */
export const THICKEN_NOT_OPEN = 'select faces whose border is all open (a sheet, such as a plane): a closed solid has nothing to thicken';

/**
 * Thicken Faces (the reference editor's, G in Face mode; the Forge's owner (crispy, OT.R112), 2026-11-20: "remove the hollow and add the
 * thicken faces"): each island of `faces` (joined by edges) whose border is open all round -- a sheet, no face beyond
 * it -- given a back `amount` behind it: a copy of its faces turned round and moved back along their normals (as the
 * reference's offset: each point pushed by the normals of the faces round it, then held to each face's moved plane),
 * walls joining the open border to the back's. The faces keep their place; an island with any edge shared with a face
 * outside it (a closed solid's top) is left as it is. New faces take their face's draw style and object, their texture
 * the caller's to world-align (`refreshUvs`); on a hull, collision words by their own facing (`floorOrWall`). Returns
 * the islands thickened (their faces), the backs and the walls; a back turned through itself is refused (`transact`).
 */
export function thickenFaces(m: EditMesh, faces: readonly number[], amount: number): { faces: number[]; back: number[]; walls: number[] } {
  return transact(m, { open: true }, { faces: [], back: [], walls: [] }, (T) => {
    const out = { faces: [] as number[], back: [] as number[], walls: [] as number[] };
    const chosen = new Set(faces.filter((f) => T.live(f)));
    if (!chosen.size || !(amount > 0)) return out;
    // The islands: the chosen faces joined through their shared edges.
    const left = new Set(chosen);
    const islands: number[][] = [];
    while (left.size) {
      const start = left.values().next().value as number;
      left.delete(start);
      const island = [start];
      for (let i = 0; i < island.length; i++) {
        const vs = T.ring(island[i]!);
        vs.forEach((a, k) => { for (const g of T.facesOn(a, vs[(k + 1) % vs.length]!)) if (left.delete(g)) island.push(g); });
      }
      islands.push(island);
    }
    for (const island of islands) {
      const border = T.border(island);
      if (!border.length || border.some((e) => T.facesOn(e.from, e.to).length !== 1)) continue;
      // The back's points: each pushed back by the normal of every face round it, then onto each face's moved plane.
      const normals = new Map<number, Vec3>(island.map((f) => [f, scale(T.normal(f), -1)]));
      const moved = new Map<number, Vec3>();
      for (const f of island) for (const v of T.ring(f)) moved.set(v, add(moved.get(v) ?? T.pos(v), scale(normals.get(f)!, amount)));
      for (const f of island) {
        const n = normals.get(f)!, off = dot(n, T.pos(T.ring(f)[0]!)) + amount;
        for (const v of T.ring(f)) {
          const o = T.pos(v), to = moved.get(v)!, d = dot(n, sub(to, o));
          if (Math.abs(d) > 1e-12) moved.set(v, add(o, scale(sub(to, o), (off - dot(n, o)) / d)));
        }
      }
      const copy = new Map<number, number>();
      for (const [v, p] of moved) copy.set(v, T.addVert(p));
      for (const f of island) {
        const vs = T.ring(f);
        // The back turned through itself: a back edge running against its front one.
        for (let i = 0; i < vs.length; i++) {
          const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
          if (dot(sub(T.pos(copy.get(b)!), T.pos(copy.get(a)!)), sub(T.pos(b), T.pos(a))) <= 0) throw new MeshError('the back would turn through itself: thinner, or fewer bent faces');
        }
        const cs = [...m.faces[f]!.corners].reverse();
        out.back.push(T.faceLike(cs.map((c) => T.addCorner(copy.get(m.cVert[c]!)!, cornerAttrs(m, c))), f, { mapping: false }));
      }
      // A wall on each open border edge: from -> to on the front, the wall to, from, from', to'.
      for (const e of border) {
        const cs = m.faces[e.face]!.corners;
        const A = cornerAttrs(m, cs[e.i]!), B = cornerAttrs(m, cs[(e.i + 1) % cs.length]!);
        out.walls.push(T.faceLike([T.addCorner(e.to, B), T.addCorner(e.from, A), T.addCorner(copy.get(e.from)!, A), T.addCorner(copy.get(e.to)!, B)], e.face, { mapping: false }));
      }
      out.faces.push(...island);
    }
    return out;
  });
}

/* ---------- merge points ---------- */

/**
 * Merge points (a level editor's; the Forge's owner (crispy, OT.R112), 2026-11-19): each group of `groups` made one point, at the group's middle
 * or (`at` 'last') where its last point is -- every face through them put on that point, a corner run onto the same
 * point dropped, a face left with under three points gone (a quad's two corners merged: a triangle). A face that would
 * pass the point twice is split there into its parts (a quad's opposite corners merged: it goes; the reference
 * editor's pre-connect). Edges left with faces the same way round twice refuse the whole merge (`transact`): nothing
 * changes. Returns the points kept, one a group.
 */
export function mergeVerts(m: EditMesh, groups: readonly (readonly number[])[], at: 'centre' | 'last' = 'centre'): number[] {
  return transact<number[]>(m, { open: true }, [], (T) => {
    const kept: number[] = [];
    for (const group of groups) {
      const vs = [...new Set(group)];
      if (vs.length < 2) continue;
      const keep = at === 'last' ? vs[vs.length - 1]! : vs[0]!;
      const where = at === 'last' ? T.pos(keep) : scale(vs.reduce((s, v) => add(s, T.pos(v)), [0, 0, 0] as Vec3), 1 / vs.length);
      const gone = new Set(vs.filter((v) => v !== keep));
      const touched = new Set<number>();
      for (const v of vs) for (const f of T.facesAt(v)) touched.add(f);
      T.setPos(keep, where);
      for (const f of touched) {
        if (!T.live(f)) continue;
        const cs = m.faces[f]!.corners.map((c) => (gone.has(m.cVert[c]!) ? T.cloneCorner(c, keep) : c));
        const ring = cs.filter((c, i) => m.cVert[c] !== m.cVert[cs[(i + 1) % cs.length]!]);
        // A face through the point twice (two of its corners merged that no edge joined) split there, as the reference
        // editor connects them across the face before merging: each part with three points or more kept.
        const parts: number[][] = [];
        const cut = (r: number[]): void => {
          for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
            if (m.cVert[r[i]!] !== m.cVert[r[j]!]) continue;
            cut(r.slice(i, j));
            cut([...r.slice(0, i), ...r.slice(j)]);
            return;
          }
          if (r.length >= 3) parts.push(r);
        };
        cut(ring);
        if (!parts.length) { T.kill(f); continue; }
        T.setRing(f, parts[0]!);
        T.touchFace(f);
        // PR #5 D1 (ours): a split-off part keeps the face's own collision words, as the part kept in `f` does.
        for (const p of parts.slice(1)) T.normalsDown(T.makeFace(p, T.propsOf(f, { surface: true })));
      }
      kept.push(keep);
    }
    return kept;
  });
}

/**
 * The groups a point Merge makes of `verts` (in the order picked), as the reference editor's merge within a distance:
 * `within` null (its Infinite range) one group of them all; else each point not yet taken starts a group, the points
 * not yet taken nearer it than `within` joining it, in the order picked. Merged with `mergeVerts` 'last', each group
 * lands where its last point is -- the reference's, which keeps the merged point's place.
 */
export function mergeGroups(m: EditMesh, verts: readonly number[], within: number | null): number[][] {
  const vs = [...new Set(verts)];
  if (within === null) return [vs];
  const taken = new Set<number>();
  const groups: number[][] = [];
  for (const v of vs) {
    if (taken.has(v)) continue;
    taken.add(v);
    const g = [v];
    for (const w of vs) if (!taken.has(w) && length(sub(vertPos(m, w), vertPos(m, v))) < within) { taken.add(w); g.push(w); }
    groups.push(g);
  }
  return groups;
}

/** An Edge mode Merge's refusals: a selected edge with faces on both sides, or two edges that run the same way. */
export const MERGE_EDGES_NOT_OPEN = 'select open edges (a face on one side only) to weld';
export const MERGE_EDGES_SAME_WAY = 'the two edges run the same way round: their faces would face opposite ways';
/** Three or more open edges merged: their ends this near each other welded (the reference editor's 0.1; an editor value, a browser adaptation, FG.R2). */
export const MERGE_EDGES_WELD_ADAPTATION = 0.1;

/**
 * An Edge mode Merge's point groups (the reference editor's edge Merge): every edge open. Two edges welded into one --
 * each end paired with the other edge's far end (the faces beside them then run opposite ways along it, as a closed
 * surface's do), each pair met at its middle ('centre'); two edges sharing an end just have their other ends met.
 * Three or more: their ends welded where they lie within `MERGE_EDGES_WELD_ADAPTATION` ('last').
 */
export function edgeMergeGroups(m: EditMesh, faces: readonly number[], edges: readonly (readonly [number, number])[]): { groups: number[][]; at: 'centre' | 'last' } | { error: string } {
  const em = new Map<string, number[]>();
  for (const f of faces) {
    if (!m.faces[f]) continue;
    const vs = faceVerts(m, f);
    vs.forEach((a, i) => { const k = edgeKey(a, vs[(i + 1) % vs.length]!); (em.get(k) ?? em.set(k, []).get(k)!).push(f); });
  }
  const runs: [number, number][] = [];
  for (const [x, y] of edges) {
    const on = em.get(edgeKey(x, y)) ?? [];
    if (on.length !== 1) return { error: MERGE_EDGES_NOT_OPEN };
    const vs = faceVerts(m, on[0]!);
    const forward = vs.some((a, i) => a === x && vs[(i + 1) % vs.length] === y);
    runs.push(forward ? [x, y] : [y, x]);
  }
  if (runs.length === 2) {
    const [[a1, a2], [b1, b2]] = runs as [[number, number], [number, number]];
    if (a1 === b1 || a2 === b2) return { error: MERGE_EDGES_SAME_WAY };
    if (a1 === b2) return { groups: [[a2, b1]], at: 'centre' };
    if (a2 === b1) return { groups: [[a1, b2]], at: 'centre' };
    return { groups: [[a1, b2], [a2, b1]], at: 'centre' };
  }
  return { groups: mergeGroups(m, runs.flat(), MERGE_EDGES_WELD_ADAPTATION).filter((g) => g.length > 1), at: 'last' };
}

/* ---------- collapse ---------- */

/**
 * Collapse on edges (the reference editor's Shift+O in Edge mode; the Forge's owner (crispy, OT.R112), 2026-11-20): `edges` in islands -- runs
 * that meet at their ends -- each island's points made one point at their average (`mergeVerts` 'centre'). Returns
 * the point groups, one an island, for `mergeVerts`.
 */
export function collapseEdgeGroups(edges: readonly (readonly [number, number])[]): number[][] {
  const up = new Map<number, number>();
  const root = (v: number): number => { let r = v; while (up.get(r) !== r) r = up.get(r)!; return r; };
  for (const [a, b] of edges) { if (!up.has(a)) up.set(a, a); if (!up.has(b)) up.set(b, b); up.set(root(a), root(b)); }
  const by = new Map<number, number[]>();
  for (const v of up.keys()) (by.get(root(v)) ?? by.set(root(v), []).get(root(v))!).push(v);
  return [...by.values()];
}

/**
 * Collapse on faces (the reference editor's Shift+O in Face mode): each of `faces` in turn, while it stands, made one
 * point at the average of its points (`mergeVerts` 'centre') -- one face at a time, as the reference walks them, so two
 * selected faces side by side collapse the first, then what is left of the second. Returns the points made; empty
 * where a collapse was refused (the caller puts the mesh back).
 */
export function collapseFaces(m: EditMesh, faces: readonly number[]): number[] {
  const made: number[] = [];
  for (const f of faces) {
    if (!m.faces[f]) continue;
    const k = mergeVerts(m, [faceVerts(m, f)], 'centre');
    if (!k.length) return [];
    made.push(...k);
  }
  return [...new Set(made)];
}

/* ---------- extend edges ---------- */

/** Extend's word where no selected edge is open. */
export const EXTEND_NOT_OPEN = 'select open edges (a face on one side only) to extend';

/**
 * Extend Edges (the reference editor's N in Edge mode; the Forge's owner (crispy, OT.R112), 2026-11-20): each open edge of `edges` given a new
 * four-sided face on its open side, its far edge `amount` out in the plane of the edge's face, square to the edge --
 * the face carrying the surface on, with that face's style, object and texture mapping (as the reference copies the
 * mapping), on a hull its collision words by its facing. Edges that meet share their new corner, set so each new edge
 * lies `amount` out from its own (a mitre: the reference's own sum at a shared corner reads as moving a straight run's
 * middle three times as far -- not followed). Edges with a face on both sides are left.
 * Returns the new faces and their far edges.
 */
export function extendEdges(m: EditMesh, edges: readonly (readonly [number, number])[], amount: number): { faces: number[]; edges: [number, number][] } {
  return transact(m, { open: true }, { faces: [], edges: [] }, (T) => {
    const out = { faces: [] as number[], edges: [] as [number, number][] };
    if (!(amount > 0)) return out;
    const open = edges.filter(([a, b]) => T.facesOn(a, b).length === 1);
    const copy = new Map<number, number>();
    const dirs = new Map<number, Vec3[]>();
    const copyOf = (v: number): number => {
      let c = copy.get(v);
      if (c === undefined) { c = T.addVert(T.pos(v)); copy.set(v, c); }
      return c;
    };
    const made: { f: number; a: number; b: number }[] = [];
    for (const [a, b] of open) {
      const use = edgeUse(T, a, b);
      if (!use) continue;
      const pa = T.pos(use.from), pb = T.pos(use.to);
      const n = T.normal(use.face);
      let d = normalize(cross(sub(pb, pa), n));
      // Out of the face: away from its middle.
      const ring = T.ring(use.face).map((v) => T.pos(v));
      const mid = scale(ring.reduce((s2, p) => add(s2, p), [0, 0, 0] as Vec3), 1 / ring.length);
      if (dot(d, sub(mid, scale(add(pa, pb), 0.5))) > 0) d = scale(d, -1);
      for (const v of [use.from, use.to]) (dirs.get(v) ?? dirs.set(v, []).get(v)!).push(d);
      const A = cornerAttrs(m, use.cFrom), B = cornerAttrs(m, use.cTo);
      const fc = copyOf(use.from), tc = copyOf(use.to);
      const f = T.faceLike([T.addCorner(use.to, B), T.addCorner(use.from, A), T.addCorner(fc, A), T.addCorner(tc, B)], use.face);
      made.push({ f, a: fc, b: tc });
    }
    for (const [v, c] of copy) {
      const ds = dirs.get(v) ?? [];
      let o: Vec3 = [0, 0, 0];
      if (ds.length === 1) o = scale(ds[0]!, amount);
      else if (ds.length >= 2) {
        // Each new edge `amount` out from its own: the mitre of the first two (a run's corner has two).
        const [d1, d2] = ds as [Vec3, Vec3];
        const den = Math.max(1 + dot(d1, d2), 0.25);
        o = scale(add(d1, d2), amount / den);
      }
      T.setPos(c, add(T.pos(v), o));
    }
    for (const { f, a, b } of made) { T.normalsDown(f); out.faces.push(f); out.edges.push([a, b]); }
    return out;
  });
}

/* ---------- clip and mirror ---------- */

/** A point this near the clip plane lies on it (game units). */
const CLIP_ON_PLANE = 1e-6;

/**
 * The reference editor's Clipping tool's cut (the Forge's owner (crispy, OT.R112), 2026-11-20: "implement the clipping tool"): `faces` cut by the
 * plane `n` . p = `d` -- each edge across it split where it crosses (its other faces split there too, so nothing
 * cracks), each face across it cut in two between its points on the plane -- then, by `keep`, the faces on one side
 * taken away: 'front' keeps the side `n` points away from (n . p < d; the reference's Keep Front, its plane turned
 * round before it clips), 'back' the side it points to, 'both' every face (the cut only). Faces keep their draw style,
 * object, mapping and collision words (`Topo.splitFace`). Returns the new edges on the plane, and the faces left on
 * each side (`below`: n . p <= d, `above`: n . p >= d). The surface may open where a side goes: the caller caps it.
 */
export function clipFaces(m: EditMesh, faces: readonly number[], n: readonly number[], d: number, keep: 'front' | 'back' | 'both'): { cut: [number, number][]; below: number[]; above: number[] } {
  return transact(m, { open: true }, { cut: [], below: [], above: [] }, (T) => {
    const N = normalize([n[0]!, n[1]!, n[2]!]);
    const sd = (v: number): number => dot(N, T.pos(v)) - d;
    const work = new Set(faces.filter((f) => T.live(f)));
    // Each edge across the plane split where it crosses it.
    const across = new Map<string, [number, number]>();
    for (const f of work) {
      const vs = T.ring(f);
      vs.forEach((a, i) => {
        const b = vs[(i + 1) % vs.length]!;
        const sa = sd(a), sb = sd(b);
        if ((sa > CLIP_ON_PLANE && sb < -CLIP_ON_PLANE) || (sa < -CLIP_ON_PLANE && sb > CLIP_ON_PLANE)) across.set(edgeKey(a, b), [a, b]);
      });
    }
    for (const [a, b] of across.values()) {
      const sa = sd(a), sb = sd(b);
      const v = T.splitEdge(a, b, sa / (sa - sb));
      T.setPos(v, sub(T.pos(v), scale(N, sd(v))));       // exactly on the plane
    }
    // Each face across it cut between its points on the plane (taken along the cut's line, two at a time).
    const cut: [number, number][] = [];
    const todo = [...work];
    const out = new Set<number>();
    while (todo.length) {
      const f = todo.pop()!;
      if (!T.live(f)) continue;
      const vs = T.ring(f);
      const s2 = vs.map(sd);
      const hasAbove = s2.some((x) => x > CLIP_ON_PLANE), hasBelow = s2.some((x) => x < -CLIP_ON_PLANE);
      if (!hasAbove || !hasBelow) { out.add(f); continue; }
      const on = vs.filter((_, i) => Math.abs(s2[i]!) <= CLIP_ON_PLANE);
      const line = normalize(cross(N, T.normal(f)));
      on.sort((x, y) => dot(line, T.pos(x)) - dot(line, T.pos(y)));
      let split = false;
      for (let i = 0; i + 1 < on.length && !split; i++) {
        const x = on[i]!, y = on[i + 1]!;
        const k = vs.indexOf(x), j = vs.indexOf(y);
        if ((k + 1) % vs.length === j || (j + 1) % vs.length === k || T.hasEdge(x, y)) continue;
        const [a, b] = T.splitFace(f, x, y);
        cut.push([x, y]);
        todo.push(a, b);
        split = true;
      }
      if (!split) out.add(f);                            // nothing to cut between (the plane only touches it)
    }
    const below: number[] = [], above: number[] = [];
    for (const f of out) {
      if (!T.live(f)) continue;
      const s2 = T.ring(f).map(sd);
      if (s2.every((x) => x <= CLIP_ON_PLANE) && s2.some((x) => x < -CLIP_ON_PLANE)) below.push(f);
      else if (s2.every((x) => x >= -CLIP_ON_PLANE) && s2.some((x) => x > CLIP_ON_PLANE)) above.push(f);
      else below.push(f);                                // a face lying in the plane: the kept side's, below
    }
    if (keep === 'front') for (const f of above) T.kill(f);
    if (keep === 'back') for (const f of below) T.kill(f);
    return { cut: cut.filter(([x, y]) => T.hasEdge(x, y)), below: keep === 'back' ? [] : below, above: keep === 'front' ? [] : above };
  });
}

/** The 4 x 4 matrix (column-major) reflecting points through the plane `n` . p = `d`. */
export function mirrorMatrix(n: readonly number[], d: number): number[] {
  const [a, b, c] = normalize([n[0]!, n[1]!, n[2]!]);
  return [
    1 - 2 * a * a, -2 * a * b, -2 * a * c, 0,
    -2 * a * b, 1 - 2 * b * b, -2 * b * c, 0,
    -2 * a * c, -2 * b * c, 1 - 2 * c * c, 0,
    2 * d * a, 2 * d * b, 2 * d * c, 1,
  ];
}

/* ---------- fill hole ---------- */

/** Fill Hole's refusal where a selected edge is no open border's. */
export const FILL_NOT_OPEN = 'select an open edge (a face on one side only): the edge of a hole';

/**
 * Fill Hole (every modeller's; the Forge's owner (crispy, OT.R112), 2026-11-19: "do fill hole"; a browser adaptation, the game has no editor):
 * each hole one of `edges` lies on capped with one face. A hole is a loop of open edges (one face each, in the whole
 * mesh -- a map's world section's edge against the next section is no hole); from a selected edge the loop is walked
 * the way the faces beside it do not run, so the cap turns as they do and the surface closes. Several selected edges
 * of one hole fill it once. The cap takes the draw style and object of the face beside its first edge, its corners'
 * attributes from the faces beside each point, its texture world-aligned (`refreshUvs`, the caller's); on a hull,
 * collision words by its own facing (`floorOrWall`). A cap off its plane is the caller's to split (`splitBentFaces`).
 * A loop that passes a point twice (two holes touching at a corner) or an edge that is not open refuses the whole
 * fill. Returns the caps.
 */
export function fillHoles(m: EditMesh, faces: readonly number[], edges: readonly (readonly [number, number])[]): { faces: number[] } | { error: string } {
  return transact<{ faces: number[] } | { error: string }>(m, {}, (why) => ({ error: `Fill: ${why}` }), (T) => {
    // The open edges among `faces`, by the way the cap runs: q -> p where a face runs p -> q.
    const capNext = new Map<number, { to: number; face: number }[]>();
    for (const e of T.border(faces)) {
      if (T.facesOn(e.from, e.to).length !== 1) continue;
      (capNext.get(e.to) ?? capNext.set(e.to, []).get(e.to)!).push({ to: e.from, face: e.face });
    }
    const done = new Set<string>();
    const made: number[] = [];
    for (const [a, b] of edges) {
      if (done.has(edgeKey(a, b))) continue;
      // The cap's edge along a-b: b -> a where a face runs a -> b, else a -> b.
      const start = capNext.get(b)?.some((x) => x.to === a) ? b : capNext.get(a)?.some((x) => x.to === b) ? a : -1;
      if (start < 0) throw new MeshError(FILL_NOT_OPEN);
      const ring: number[] = [];
      const beside: number[] = [];
      let v = start;
      for (;;) {
        const next = capNext.get(v) ?? [];
        if (next.length !== 1) throw new MeshError('the hole passes a point twice (two holes touching at a corner): fill the faces round it by hand');
        ring.push(v);
        beside.push(next[0]!.face);
        done.add(edgeKey(v, next[0]!.to));
        v = next[0]!.to;
        if (v === start) break;
        if (ring.length > capNext.size) throw new MeshError('the hole does not close');
      }
      if (ring.length < 3) throw new MeshError('the hole has under three points');
      const corners = ring.map((p, i) => T.addCorner(p, cornerAttrs(m, T.cornerAt(beside[i]!, p))));
      made.push(T.faceLike(corners, beside[0]!, { mapping: false }));
    }
    return { faces: made };
  });
}
