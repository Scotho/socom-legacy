import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner } from '@s2u/scene';
import type { LoadedMesh } from '../../loadMap';

/**
 * FORGE CUTS, the geometry (a browser adaptation, FG.R2: the game has no editor, and nothing in it is ever cut). A cut
 * is a box -- a frame (where it stands and how it is turned) and an extent in that frame -- and the switches saying
 * which surfaces it takes: a surface is cut when its normal, seen in the box's frame, runs mostly along an axis whose
 * switch is on (a door's box cuts the walls it stands in, x and z, never the floor under it, y). Anything outside every
 * box is kept as it was, byte for byte; a triangle or polygon that crosses one is split into the convex pieces outside
 * it, every vertex attribute (uv, colour, normal, centroid) interpolated along the cut.
 */

/** Twice the area under which a clipped piece is dropped as a sliver (world units squared). An adaptation's value. */
export const CUT_SLIVER_AREA_ADAPTATION = 1e-4;

/** Which surfaces a cut takes, by the axis of its own frame their normals run along. */
export interface CutFaces { x: boolean; y: boolean; z: boolean }
export const ALL_FACES: CutFaces = { x: true, y: true, z: true };

/** A cut: its frame (`world`, and `local` its inverse), its extent in that frame, its world extent, its faces. */
export interface CutBox {
  world: Matrix4;
  local: Matrix4;
  lo: [number, number, number];
  hi: [number, number, number];
  /** The box's world extent: what a quick test rejects against. */
  min: [number, number, number];
  max: [number, number, number];
  faces: CutFaces;
  /**
   * A hole already lined: a placed door that brought its source doorway's own lining (`../placedDoors` `reveal`). The
   * generated lining (`./caps`) then adds its hull only, no drawn faces.
   */
  lined?: boolean;
}

/** A cut from a frame, its extent in that frame and its faces. */
export function makeCutBox(world: Matrix4, lo: [number, number, number], hi: [number, number, number], faces: CutFaces = ALL_FACES): CutBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const v = new Vector3();
  for (let c = 0; c < 8; c++) {
    v.set(c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]).applyMatrix4(world);
    [v.x, v.y, v.z].forEach((x, k) => { min[k] = Math.min(min[k]!, x); max[k] = Math.max(max[k]!, x); });
  }
  return { world: world.clone(), local: world.clone().invert(), lo, hi, min, max, faces };
}

/** A polygon's unit normal by Newell's method (any planar polygon, either winding's sense), or null when it has none. */
export function newell(pts: readonly (readonly number[])[]): [number, number, number] | null {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    x += (p[1]! - q[1]!) * (p[2]! + q[2]!); y += (p[2]! - q[2]!) * (p[0]! + q[0]!); z += (p[0]! - q[0]!) * (p[1]! + q[1]!);
  }
  const l = Math.hypot(x, y, z);
  return l === 0 ? null : [x / l, y / l, z / l];
}

/** A flat xyz list's points as triples. */
export const triples = (points: ArrayLike<number>): number[][] =>
  Array.from({ length: Math.floor(points.length / 3) }, (_, i) => [points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!]);

/** An owner that moves (a door's leaf, a gate, a hook: a `sweep`) or is posed by a frame: never cut, never a wall to snap to. */
export function ownerMoves(o: CollisionOwner | undefined): boolean {
  return !!o && (o.sweep !== undefined || o.frame !== undefined || o.restFrame !== undefined);
}

/** A vertex being clipped: its position first, then every attribute it carries. */
type V = number[];

function clip(poly: readonly V[], axis: number, value: number, below: boolean): V[] {
  const out: V[] = [];
  const keep = (v: V): boolean => (below ? v[axis]! <= value : v[axis]! >= value);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ka = keep(a), kb = keep(b);
    if (ka) out.push(a);
    if (ka !== kb) {
      const t = (value - a[axis]!) / (b[axis]! - a[axis]!);
      out.push(a.map((x, k) => x + (b[k]! - x) * t));
    }
  }
  return out;
}

/** Twice the area of a polygon, from its first three lanes. */
function area2(poly: readonly V[]): number {
  let x = 0, y = 0, z = 0;
  const o = poly[0]!;
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[i]!, b = poly[i + 1]!;
    const ax = a[0]! - o[0]!, ay = a[1]! - o[1]!, az = a[2]! - o[2]!;
    const bx = b[0]! - o[0]!, by = b[1]! - o[1]!, bz = b[2]! - o[2]!;
    x += ay * bz - az * by; y += az * bx - ax * bz; z += ax * by - ay * bx;
  }
  return Math.hypot(x, y, z);
}

/**
 * A convex polygon (positions in the box's frame) less the box `lo`..`hi`: the convex pieces outside it, in the
 * polygon's own winding. `null` when the polygon never enters the box (keep it as it is); `[]` when it is wholly inside.
 */
export function subtractBox(poly: readonly V[], lo: readonly number[], hi: readonly number[]): V[][] | null {
  for (let axis = 0; axis < 3; axis++) {
    if (poly.every((v) => v[axis]! <= lo[axis]!) || poly.every((v) => v[axis]! >= hi[axis]!)) return null;
  }
  const pieces: V[][] = [];
  let rest: V[] = [...poly];
  for (let axis = 0; axis < 3; axis++) {
    for (const [value, outsideBelow] of [[lo[axis]!, true], [hi[axis]!, false]] as const) {
      const outside = clip(rest, axis, value, outsideBelow);
      if (outside.length >= 3 && area2(outside) > CUT_SLIVER_AREA_ADAPTATION) pieces.push(outside);
      rest = clip(rest, axis, value, !outsideBelow);
      if (rest.length < 3 || area2(rest) <= CUT_SLIVER_AREA_ADAPTATION) return pieces;
    }
  }
  return pieces;
}

/** Whether a world-space extent reaches `box`. */
export const overlaps = (box: CutBox, min: readonly number[], max: readonly number[]): boolean =>
  min[0]! < box.max[0] && max[0]! > box.min[0] && min[1]! < box.max[1] && max[1]! > box.min[1] && min[2]! < box.max[2] && max[2]! > box.min[2];

/** Whether a world-space extent reaches any of `boxes`. */
export function reachesAny(boxes: readonly CutBox[], min: readonly number[], max: readonly number[]): boolean {
  return boxes.some((b) => overlaps(b, min, max));
}

/** Whether `box` takes a surface with this (world) normal: the axis it runs most along, in the box's frame, is switched on. */
function takes(box: CutBox, normal: readonly number[] | null): boolean {
  if (!normal) return false;
  const n = new Vector3(normal[0], normal[1], normal[2]).transformDirection(box.local);
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  return ay >= ax && ay >= az ? box.faces.y : ax >= az ? box.faces.x : box.faces.z;
}

/** `pieces` (world space) less `box`, every lane past the position carried; `hit` when the box reached any. */
function subtractAll(pieces: V[][], box: CutBox, tmp: Vector3): { pieces: V[][]; hit: boolean } {
  const next: V[][] = [];
  let hit = false;
  for (const piece of pieces) {
    const local = piece.map((v) => { tmp.set(v[0]!, v[1]!, v[2]!).applyMatrix4(box.local); return [tmp.x, tmp.y, tmp.z, ...v.slice(3)]; });
    const out = subtractBox(local, box.lo, box.hi);
    if (out === null) { next.push(piece); continue; }
    hit = true;
    for (const o of out) next.push(o.map((v) => { tmp.set(v[0]!, v[1]!, v[2]!).applyMatrix4(box.world); return [tmp.x, tmp.y, tmp.z, ...v.slice(3)]; }));
  }
  return { pieces: next, hit };
}

/** `mesh` (world positions) with what `boxes` take cut out; the same object when none touches it. */
export function cutMesh<M extends LoadedMesh>(mesh: M, boxes: readonly CutBox[]): M {
  const p = mesh.positions, uv = mesh.uvs, col = mesh.colors, nrm = mesh.normals, cen = mesh.centroids;
  const vertex = (i: number): V => {
    const v = [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, uv[i * 2]!, uv[i * 2 + 1]!, col[i * 4]!, col[i * 4 + 1]!, col[i * 4 + 2]!, col[i * 4 + 3]!];
    if (nrm) v.push(nrm[i * 3]!, nrm[i * 3 + 1]!, nrm[i * 3 + 2]!);
    if (cen) v.push(cen[i * 3]!, cen[i * 3 + 1]!, cen[i * 3 + 2]!);
    return v;
  };
  const tris = mesh.indices.length / 3;
  const replaced: (V[][] | null)[] = new Array(tris).fill(null);
  let touched = false;
  const tmp = new Vector3();
  for (let t = 0; t < tris; t++) {
    const ids = [mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const i of ids) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[i * 3 + k]!); max[k] = Math.max(max[k]!, p[i * 3 + k]!); }
    const near = boxes.filter((b) => overlaps(b, min, max));
    if (!near.length) continue;
    const normal = newell(ids.map((i) => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]));
    let pieces: V[][] = [ids.map(vertex)];
    let hit = false;
    for (const box of near) {
      if (!takes(box, normal)) continue;
      const r = subtractAll(pieces, box, tmp);
      pieces = r.pieces;
      hit ||= r.hit;
    }
    if (hit) { replaced[t] = pieces; touched = true; }
  }
  if (!touched) return mesh;
  // The kept triangles first, then the cut pieces' (fans): the face normals follow `faceOf` in the same order.
  const kept: number[] = [], extra: V[] = [], extraTris: number[] = [], faceOf: number[] = [];
  const baseVerts = p.length / 3;
  for (let t = 0; t < tris; t++) {
    const r = replaced[t];
    if (!r) { kept.push(mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!); faceOf.push(t); continue; }
    for (const piece of r) {
      const first = baseVerts + extra.length;
      extra.push(...piece);
      for (let k = 1; k + 1 < piece.length; k++) { extraTris.push(first, first + k, first + k + 1); faceOf.push(t); }
    }
  }
  const nv = baseVerts + extra.length;
  const positions = new Float32Array(nv * 3); positions.set(p);
  const uvs = new Float32Array(nv * 2); uvs.set(uv);
  const colors = new Float32Array(nv * 4); colors.set(col);
  const normals = nrm ? new Float32Array(nv * 3) : null; if (normals && nrm) normals.set(nrm);
  const centroids = cen ? new Float32Array(nv * 3) : undefined; if (centroids && cen) centroids.set(cen);
  extra.forEach((v, j) => {
    const i = baseVerts + j;
    positions.set([v[0]!, v[1]!, v[2]!], i * 3);
    uvs.set([v[3]!, v[4]!], i * 2);
    colors.set([v[5]!, v[6]!, v[7]!, v[8]!], i * 4);
    let at = 9;
    if (normals) {
      const l = Math.hypot(v[at]!, v[at + 1]!, v[at + 2]!) || 1;
      normals.set([v[at]! / l, v[at + 1]! / l, v[at + 2]! / l], i * 3);
      at += 3;
    }
    if (centroids) centroids.set([v[at]!, v[at + 1]!, v[at + 2]!], i * 3);
  });
  const indices = Uint32Array.from([...kept, ...extraTris]);
  let faceNormals: Float32Array | null = null;
  if (mesh.faceNormals) {
    const fn = mesh.faceNormals;
    faceNormals = new Float32Array(faceOf.length * 3);
    faceOf.forEach((t, j) => faceNormals!.set([fn[t * 3]!, fn[t * 3 + 1]!, fn[t * 3 + 2]!], j * 3));
  }
  return { ...mesh, positions, uvs, colors, normals, faceNormals, indices, ...(centroids ? { centroids } : {}) };
}

/** A hull polygon (xyz, flat, world space) less what `boxes` take: null when none takes it, else its pieces' points. */
export function cutPolygon(points: ArrayLike<number>, boxes: readonly CutBox[]): Float32Array[] | null {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < points.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, points[i + k]!); max[k] = Math.max(max[k]!, points[i + k]!); }
  const near = boxes.filter((b) => overlaps(b, min, max));
  if (!near.length) return null;
  let pieces: V[][] = [triples(points)];
  const normal = newell(pieces[0]!);
  let hit = false;
  const tmp = new Vector3();
  for (const box of near) {
    if (!takes(box, normal)) continue;
    const r = subtractAll(pieces, box, tmp);
    pieces = r.pieces;
    hit ||= r.hit;
  }
  return hit ? pieces.map((piece) => Float32Array.from(piece.flat())) : null;
}

/**
 * A prop's part placed by `m` as a world chunk: its positions, normals and centroids in world space. `path` (its
 * placement's node path) is kept as the chunk's `switchPath`, so the world's state still shows and hides it by that node
 * (`../../world` `setNodeActive`: a destructible's intact state, a switched prop) once it is drawn as a world chunk.
 */
export function worldPart(part: LoadedMesh, m: Matrix4, order: number, cells: number[] | undefined, path?: string): LoadedMesh {
  const v = new Vector3();
  const moved = (a: ArrayLike<number>, by: Matrix4): Float32Array => {
    const out = new Float32Array(a.length);
    for (let i = 0; i + 2 < a.length; i += 3) { v.set(a[i]!, a[i + 1]!, a[i + 2]!).applyMatrix4(by); out.set([v.x, v.y, v.z], i); }
    return out;
  };
  const turn = new Matrix4().extractRotation(m);
  const centre = part.centre ? (v.set(...part.centre).applyMatrix4(m), [v.x, v.y, v.z] as [number, number, number]) : undefined;
  const { node: _node, ...rest } = part;
  return {
    ...rest, positions: moved(part.positions, m), normals: part.normals ? moved(part.normals, turn) : null,
    faceNormals: part.faceNormals ? moved(part.faceNormals, turn) : null, order, orderEnd: order,
    ...(part.centroids ? { centroids: moved(part.centroids, m) } : {}), ...(centre ? { centre } : {}), ...(cells ? { cells } : {}),
    ...(path ? { switchPath: path } : {}),
  };
}
