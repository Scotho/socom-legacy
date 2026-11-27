import type { LoadedMesh } from '../../loadMap';

/**
 * The Forge's editable geometry (a browser adaptation, FG.R2 -- the game has no editor; the Forge's owner (crispy, OT.R112), 2026-11-14: a level editor's
 * editable mesh). A polygon mesh of shared points, each face a ring of corners:
 * - a **point** (`verts`) is a position; every face that uses it moves with it, across textures and draws;
 * - a **corner** is a face's use of a point plus what the draw carries per vertex -- uv, the material colour, the vertex
 *   normal, the visual's centroid (`MeshData`) -- so a seam keeps its two uvs on one point;
 * - a **face** is a ring of corners (a triangle off the disc, any polygon a tool makes) in one draw style: the texture and
 *   every flag of the `LoadedMesh` it came from, which the compile (`./compile`) gives back unchanged.
 * Nothing here is the original's: the original is what an untouched mesh compiles back to, exactly (`./worldMesh`).
 */

/** Everything a `LoadedMesh` is beyond its per-vertex and per-triangle arrays: what the compile gives each draw back. */
export type DrawStyle = Omit<LoadedMesh, 'positions' | 'uvs' | 'colors' | 'normals' | 'faceNormals' | 'indices' | 'centroids'>;

/** A draw style and which of the optional arrays its draw carries (`MeshData`: null when a merge lost them). */
export interface StyleSlot {
  style: DrawStyle;
  normals: boolean;
  faceNormals: boolean;
  centroids: boolean;
  /** Where its draw stands in the compile's order: the import's index, a restyled copy just after its source. */
  rank: number;
  /** A restyled copy's source slot (a face retextured keeps every other flag of its draw); absent on a source. */
  base?: number;
  /**
   * The draw's vertices no triangle of it used, as corners (the disc's strips leave a few: 78 over Crossroads' 164
   * draws). They draw nothing; the compile keeps them in their place so an untouched draw's arrays are the disc's.
   */
  unused?: number[];
  /**
   * Bug 16: the grid cells the read draw's own triangles cover (`./worldMesh` `coveredCells`), beside the cells it is
   * filed in (`LoadedMesh.cells`): a cell its triangles reach now that neither holds is one an edit moved it into.
   */
  covered?: number[];
  /** The draw carried its triangles' nodes (`LoadedMesh.triNodes`): the compile writes them back from the faces' groups. */
  triNodes?: boolean;
}

/**
 * A texture laid on a face as a level editor lays one: two texture axes, a scale on each (world units a texel) and a shift on
 * each (texels), so a texel coordinate is `dot(p, u) / scaleU + shiftU` and the uv that over the texture's size
 * (`./texturing` `mappedUv`). A face off the disc has none until it is textured or picked up (`fitMapping`): its
 * corners keep the disc's uvs.
 */
export interface TextureMapping {
  u: [number, number, number];
  v: [number, number, number];
  scaleU: number;
  scaleV: number;
  shiftU: number;
  shiftV: number;
}

/**
 * A displacement on a four-cornered face (Source's displacement map): a grid of `2^power + 1` points a side over the face,
 * each lifted `heights[i]` along the face's normal; the compile draws the grid, not the face.
 */
export interface Displacement {
  power: 2 | 3 | 4;
  /** Row-major, `(n + 1)^2` of them, row `j` from corner 0 toward corner 3, column `i` from corner 0 toward corner 1. */
  heights: number[];
}

export interface Face {
  corners: number[];
  style: number;
  /** The disc's stored face normal (a triangle off the disc), or null: the compile computes it. Dropped on an edit. */
  normal: [number, number, number] | null;
  mapping?: TextureMapping;
  disp?: Displacement;
  /**
   * The world node the face is drawn under (`LoadedMap.worldNodes` index; `LoadedMesh.triNodes`), -1 for none: what
   * makes it part of that node's object (`./world` `GeoObject.group`). Absent in a mesh of its own (a primitive).
   */
  group?: number;
  /**
   * A collision face's surface words (`./collision` `Surface`: ditype, material, cameratype, region, flags), on a hull
   * object's faces (`./hullGeometry`); absent on a drawn face, and on a face a tool made on a hull object (its words
   * then from its object's, by its facing).
   */
  surface?: [number, number, number, number, number];
  /**
   * A collision face's owner in the hull it was read from (`CollisionOwner` index): Build puts it back under that owner,
   * so the probe's one polygon an owner (`probeGround`'s first hit) reads as the disc's. Absent on a face made since.
   */
  owner?: number;
}

export interface EditMesh {
  /** xyz a point. A point no live corner uses is dead, and the compile leaves it out. */
  verts: number[];
  /** Per corner: its point, uv, colour (rgba, 1.0 the PS2's unity), vertex normal, centroid. */
  cVert: number[];
  cUv: number[];
  cColor: number[];
  cNormal: number[];
  cCentroid: number[];
  /** The faces, a deleted one null (its index stays a face's name; `compact` renumbers). */
  faces: (Face | null)[];
  styles: StyleSlot[];
}

export type Vec3 = [number, number, number];

export const emptyMesh = (styles: StyleSlot[] = []): EditMesh => ({ verts: [], cVert: [], cUv: [], cColor: [], cNormal: [], cCentroid: [], faces: [], styles });

export function addVert(m: EditMesh, p: readonly number[]): number {
  m.verts.push(p[0]!, p[1]!, p[2]!);
  return m.verts.length / 3 - 1;
}

export interface CornerAttrs { uv: readonly number[]; color: readonly number[]; normal: readonly number[]; centroid?: readonly number[] }

export function addCorner(m: EditMesh, vert: number, a: CornerAttrs): number {
  m.cVert.push(vert);
  m.cUv.push(a.uv[0]!, a.uv[1]!);
  m.cColor.push(a.color[0]!, a.color[1]!, a.color[2]!, a.color[3]!);
  m.cNormal.push(a.normal[0]!, a.normal[1]!, a.normal[2]!);
  const c = a.centroid ?? [0, 0, 0];
  m.cCentroid.push(c[0]!, c[1]!, c[2]!);
  return m.cVert.length - 1;
}

export function cornerAttrs(m: EditMesh, c: number): Required<CornerAttrs> {
  return {
    uv: [m.cUv[c * 2]!, m.cUv[c * 2 + 1]!],
    color: [m.cColor[c * 4]!, m.cColor[c * 4 + 1]!, m.cColor[c * 4 + 2]!, m.cColor[c * 4 + 3]!],
    normal: [m.cNormal[c * 3]!, m.cNormal[c * 3 + 1]!, m.cNormal[c * 3 + 2]!],
    centroid: [m.cCentroid[c * 3]!, m.cCentroid[c * 3 + 1]!, m.cCentroid[c * 3 + 2]!],
  };
}

/** A copy of corner `c` on point `vert` (its own, so changing it leaves `c` alone). */
export const cloneCorner = (m: EditMesh, c: number, vert = m.cVert[c]!): number => addCorner(m, vert, cornerAttrs(m, c));

export function addFace(m: EditMesh, corners: number[], style: number, normal: Vec3 | null = null): number {
  m.faces.push({ corners, style, normal });
  return m.faces.length - 1;
}

export const vertPos = (m: EditMesh, v: number): Vec3 => [m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!];
export const faceVerts = (m: EditMesh, f: number): number[] => m.faces[f]!.corners.map((c) => m.cVert[c]!);
export const facePoints = (m: EditMesh, f: number): Vec3[] => faceVerts(m, f).map((v) => vertPos(m, v));

/** The live faces' indices. */
export function liveFaces(m: EditMesh): number[] {
  const out: number[] = [];
  m.faces.forEach((f, i) => { if (f) out.push(i); });
  return out;
}

export const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
export const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
export const scale = (a: readonly number[], s: number): Vec3 => [a[0]! * s, a[1]! * s, a[2]! * s];
export const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
export const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
export const length = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
export function normalize(a: readonly number[]): Vec3 {
  const l = length(a);
  return l > 0 ? [a[0]! / l, a[1]! / l, a[2]! / l] : [0, 0, 0];
}
export const lerp = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((x, i) => x + (b[i]! - x) * t);

/** A polygon's normal by Newell's method: right for any simple polygon, planar or not; zero for a degenerate one. */
export function polygonNormal(points: readonly (readonly number[])[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    x += (a[1]! - b[1]!) * (a[2]! + b[2]!);
    y += (a[2]! - b[2]!) * (a[0]! + b[0]!);
    z += (a[0]! - b[0]!) * (a[1]! + b[1]!);
  }
  return normalize([x, y, z]);
}

export const faceNormal = (m: EditMesh, f: number): Vec3 => polygonNormal(facePoints(m, f));
export const faceCentre = (m: EditMesh, f: number): Vec3 => {
  const ps = facePoints(m, f);
  return scale(ps.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3), 1 / ps.length);
};

/**
 * A polygon cut into triangles by ear clipping in its own plane, as corner positions in the ring; a triangle is itself.
 * Winding follows the ring (CCW about its normal, MeshData's front face). A ring ear clipping cannot finish falls back to a fan.
 */
export function triangulate(points: readonly (readonly number[])[]): [number, number, number][] {
  const n = points.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  const nrm = polygonNormal(points);
  // Project onto the plane: the two axes the normal leans least on.
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  const [i0, i1] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [2, 0] : [0, 1];
  const sign = (ax >= ay && ax >= az ? nrm[0] : ay >= az ? nrm[1] : nrm[2]) >= 0 ? 1 : -1;
  const p2 = points.map((p) => [p[i0]!, p[i1]!] as const);
  const area2 = (a: number, b: number, c: number): number =>
    sign * ((p2[b]![0] - p2[a]![0]) * (p2[c]![1] - p2[a]![1]) - (p2[b]![1] - p2[a]![1]) * (p2[c]![0] - p2[a]![0]));
  const inside = (p: number, a: number, b: number, c: number): boolean => area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
  const ring = Array.from({ length: n }, (_, i) => i);
  const out: [number, number, number][] = [];
  let guard = n * n;
  while (ring.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k + ring.length - 1) % ring.length]!, b = ring[k]!, c = ring[(k + 1) % ring.length]!;
      if (area2(a, b, c) <= 0) continue;
      if (ring.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      ring.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (ring.length === 3) { out.push([ring[0]!, ring[1]!, ring[2]!]); return out; }
  // Degenerate or self-crossing: a fan over what is left.
  for (let k = 1; k + 1 < ring.length; k++) out.push([ring[0]!, ring[k]!, ring[k + 1]!]);
  return out;
}

/** An undirected edge's name: its two points, low first. */
export const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const edgeOfKey = (k: string): [number, number] => k.split('_').map(Number) as [number, number];

/** Every edge of the live faces: its two points and the faces that use it. */
export function edgeMap(m: EditMesh, faces: readonly number[] = liveFaces(m)): Map<string, { a: number; b: number; faces: number[] }> {
  const out = new Map<string, { a: number; b: number; faces: number[] }>();
  for (const f of faces) {
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
      if (a === b) continue;
      const k = edgeKey(a, b);
      const e = out.get(k);
      if (e) e.faces.push(f); else out.set(k, { a: Math.min(a, b), b: Math.max(a, b), faces: [f] });
    }
  }
  return out;
}

/** Point -> the live faces that use it. */
export function vertFaces(m: EditMesh): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const f of liveFaces(m)) for (const v of new Set(faceVerts(m, f))) {
    const l = out.get(v);
    if (l) l.push(f); else out.set(v, [f]);
  }
  return out;
}

/** The style slot of a fresh draw: one a tool's new face takes (a browser adaptation; no disc draw stands behind it). */
export function newStyleSlot(textureName: string | null, rank: number): StyleSlot {
  return {
    style: { textureName, fog: true, lit: true, order: Number.MAX_SAFE_INTEGER, orderEnd: Number.MAX_SAFE_INTEGER, cull: true, alternate: false, scroll: null },
    normals: true, faceNormals: true, centroids: false, rank,
  };
}

/** A deep copy (an undo snapshot, a copied object). */
export function cloneMesh(m: EditMesh): EditMesh {
  return {
    verts: [...m.verts], cVert: [...m.cVert], cUv: [...m.cUv], cColor: [...m.cColor], cNormal: [...m.cNormal], cCentroid: [...m.cCentroid],
    faces: m.faces.map((f) => f && { ...f, corners: [...f.corners], normal: f.normal && [...f.normal] as Vec3, ...(f.mapping ? { mapping: { ...f.mapping } } : {}), ...(f.disp ? { disp: { power: f.disp.power, heights: [...f.disp.heights] } } : {}) }),
    styles: m.styles.map((s) => ({ ...s, style: { ...s.style } })),
  };
}

/**
 * The mesh without its dead faces, corners and points, renumbered in the order they stand: what a save writes. The
 * faces' order, and so the compile's, is kept.
 */
export function compact(m: EditMesh): EditMesh {
  const out = emptyMesh(m.styles.map(({ unused: _unused, ...s }) => ({ ...s, style: { ...s.style } })));
  const vMap = new Map<number, number>(), cMap = new Map<number, number>();
  for (const f of m.faces) {
    if (!f) continue;
    const corners = f.corners.map((c) => {
      let nc = cMap.get(c);
      if (nc === undefined) {
        const v = m.cVert[c]!;
        let nv = vMap.get(v);
        if (nv === undefined) { nv = addVert(out, vertPos(m, v)); vMap.set(v, nv); }
        nc = addCorner(out, nv, cornerAttrs(m, c));
        cMap.set(c, nc);
      }
      return nc;
    });
    out.faces.push({ ...f, corners });
  }
  return out;
}
