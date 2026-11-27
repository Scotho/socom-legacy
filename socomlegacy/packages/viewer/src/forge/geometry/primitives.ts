import {
  addCorner, addFace, addVert, emptyMesh, faceNormal, newStyleSlot, normalize, sub, type EditMesh, type Vec3,
} from './editMesh';
import { refreshUvs, worldAligned, type TextureSize } from './texturing';

/**
 * New geometry from primitives (a browser adaptation, after a level editor's block tool; the Forge's owner (crispy, OT.R112), 2026-11-14: "create new
 * geometry from cubes, spheres, planes"). Each is a mesh of its own in world space -- shared points, a corner each face
 * so each face shades flat and maps its own texture -- textured world-aligned at `scaleTexel` world units a texel (the
 * map's own density, `./texturing` `medianTexelScale`, when the caller has it). Faces wind CCW seen from outside.
 */

/**
 * The material colour a new face's corners carry: the PS2's unity, the texel unchanged before the light
 * (`MeshData.colors`). The disc's prelit worlds average about 0.29 of it; no disc value stands behind a hand-made face,
 * so this is named, not chosen to match: an editor default, a browser adaptation (FG.R2).
 */
export const NEW_GEOMETRY_COLOR_ADAPTATION: readonly [number, number, number, number] = [1, 1, 1, 1];
/**
 * A blank map's floor plane's vertex colour, untextured (the Forge's owner (crispy, OT.R112), 2026-11-17: "make the ground floor a mid gray color
 * then so that it doesnt blow out the grid"; "make it a darker gray"): a dark grey, drawn so in the Forge and in a match alike. A browser adaptation
 * with no original (the disc has no untextured floor); a texture laid on it puts the face back to
 * `NEW_GEOMETRY_COLOR_ADAPTATION` (`./texturing` `applyTexture`).
 */
export const UNTEXTURED_FLOOR_COLOR_ADAPTATION: readonly [number, number, number, number] = [0.15, 0.15, 0.15, 1];

export interface PrimitiveOptions {
  textureName: string | null;
  size: TextureSize;
  scaleTexel: number;
  /** Every corner's vertex colour (`NEW_GEOMETRY_COLOR_ADAPTATION` unless given). */
  color?: readonly [number, number, number, number];
}

/** A mesh of `points` and polygon `rings` (point indices, CCW from outside), textured as `opts` says. */
export function meshOf(points: readonly Vec3[], rings: readonly number[][], opts: PrimitiveOptions): EditMesh {
  const m = emptyMesh([newStyleSlot(opts.textureName, 0)]);
  const vs = points.map((p) => addVert(m, p));
  const faces: number[] = [];
  for (const ring of rings) {
    const corners = ring.map((i) => addCorner(m, vs[i]!, { uv: [0, 0], color: opts.color ?? NEW_GEOMETRY_COLOR_ADAPTATION, normal: [0, 1, 0] }));
    const f = addFace(m, corners, 0);
    const n = faceNormal(m, f);
    for (const c of corners) m.cNormal.splice(c * 3, 3, n[0], n[1], n[2]);
    m.faces[f]!.mapping = worldAligned(n, opts.scaleTexel);
    faces.push(f);
  }
  refreshUvs(m, faces, opts.size);
  return m;
}

/** A box between two corners (a level editor's block). */
export function box(min: readonly number[], max: readonly number[], opts: PrimitiveOptions): EditMesh {
  const [x0, y0, z0] = [Math.min(min[0]!, max[0]!), Math.min(min[1]!, max[1]!), Math.min(min[2]!, max[2]!)];
  const [x1, y1, z1] = [Math.max(min[0]!, max[0]!), Math.max(min[1]!, max[1]!), Math.max(min[2]!, max[2]!)];
  const p: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], // bottom
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], // top
  ];
  return meshOf(p, [
    [0, 1, 2, 3], // bottom, facing -y
    [4, 7, 6, 5], // top, +y
    [0, 4, 5, 1], // -z
    [2, 6, 7, 3], // +z
    [1, 5, 6, 2], // +x
    [0, 3, 7, 4], // -x
  ], opts);
}

/** A flat plane at `centre`, `width` along x and `depth` along z, facing +y, cut `divisions` a side (a displacement base). */
export function plane(centre: readonly number[], width: number, depth: number, divisions: number, opts: PrimitiveOptions): EditMesh {
  const n = Math.max(1, Math.floor(divisions));
  const p: Vec3[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) p.push([centre[0]! - width / 2 + (width * i) / n, centre[1]!, centre[2]! - depth / 2 + (depth * j) / n]);
  const rings: number[][] = [];
  const at = (i: number, j: number): number => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) rings.push([at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)]);
  return meshOf(p, rings, opts);
}

/** A UV sphere: `segments` round, `rings` pole to pole; quads between, triangles at the poles. */
export function sphere(centre: readonly number[], radius: number, segments: number, rings: number, opts: PrimitiveOptions): EditMesh {
  const seg = Math.max(3, Math.floor(segments)), rng = Math.max(2, Math.floor(rings));
  const p: Vec3[] = [[centre[0]!, centre[1]! + radius, centre[2]!]];
  for (let r = 1; r < rng; r++) {
    const phi = (Math.PI * r) / rng;
    for (let s = 0; s < seg; s++) {
      const th = (2 * Math.PI * s) / seg;
      p.push([centre[0]! + radius * Math.sin(phi) * Math.cos(th), centre[1]! + radius * Math.cos(phi), centre[2]! + radius * Math.sin(phi) * Math.sin(th)]);
    }
  }
  const bottom = p.length;
  p.push([centre[0]!, centre[1]! - radius, centre[2]!]);
  const at = (r: number, s: number): number => 1 + (r - 1) * seg + (s % seg);
  const faces: number[][] = [];
  for (let s = 0; s < seg; s++) faces.push([0, at(1, s + 1), at(1, s)]);
  for (let r = 1; r < rng - 1; r++) for (let s = 0; s < seg; s++) faces.push([at(r, s), at(r, s + 1), at(r + 1, s + 1), at(r + 1, s)]);
  for (let s = 0; s < seg; s++) faces.push([bottom, at(rng - 1, s), at(rng - 1, s + 1)]);
  const m = meshOf(p, faces, opts);
  // A sphere shades smooth: each corner's normal its point's direction from the centre.
  for (let c = 0; c < m.cVert.length; c++) {
    const v = m.cVert[c]!;
    const n = normalize(sub([m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!], centre));
    m.cNormal.splice(c * 3, 3, n[0], n[1], n[2]);
  }
  return m;
}

/** An upright cylinder on `base`, `sides` round. */
export function cylinder(base: readonly number[], radius: number, height: number, sides: number, opts: PrimitiveOptions): EditMesh {
  const n = Math.max(3, Math.floor(sides));
  const p: Vec3[] = [];
  for (let s = 0; s < n; s++) {
    const th = (2 * Math.PI * s) / n;
    p.push([base[0]! + radius * Math.cos(th), base[1]!, base[2]! + radius * Math.sin(th)]);
  }
  for (let s = 0; s < n; s++) p.push([p[s]![0], base[1]! + height, p[s]![2]]);
  const rings: number[][] = [];
  rings.push(Array.from({ length: n }, (_, s) => s)); // bottom: CCW about -y
  rings.push(Array.from({ length: n }, (_, s) => n + (n - 1 - s))); // top
  for (let s = 0; s < n; s++) rings.push([s, n + s, n + ((s + 1) % n), (s + 1) % n]);
  return meshOf(p, rings, opts);
}
