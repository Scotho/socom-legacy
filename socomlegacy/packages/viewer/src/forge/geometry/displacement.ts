import {
  add, cornerAttrs, cross, dot, faceNormal, facePoints, lerp, normalize, sub, type EditMesh, type Vec3,
} from './editMesh';

/**
 * Displacements (a browser adaptation, after Source's: the Forge's owner (crispy, OT.R112), 2026-11-14, "apply textures to faces, displacement").
 * A four-cornered face becomes a grid of `2^power + 1` points a side, each lifted along the face's normal by its own
 * height; the compile (`./worldMesh`) draws the grid in the face's place. Corner 0 is the grid's (0, 0), corner 1 its
 * (n, 0), corner 2 (n, n), corner 3 (0, n), so the grid keeps the face's winding. Corner attributes (uv, colour,
 * centroid) are spread over it bilinearly, as the base face's own; the normals are the grid surface's.
 */

export const DISPLACEMENT_POWERS = [2, 3, 4] as const;
export const gridSide = (power: number): number => (1 << power) + 1;

/** Makes face `f` a flat displacement of `power`; false when it is not four-cornered. */
export function makeDisplacement(m: EditMesh, f: number, power: 2 | 3 | 4 = 3): boolean {
  const face = m.faces[f];
  if (!face || face.corners.length !== 4) return false;
  const side = gridSide(power);
  face.disp = { power, heights: new Array(side * side).fill(0) };
  face.normal = null;
  return true;
}

export function removeDisplacement(m: EditMesh, f: number): void {
  const face = m.faces[f];
  if (face) delete face.disp;
}

/** A displaced face's base point (i, j): the bilinear spread of its four corners. */
function basePoint(ps: readonly Vec3[], s: number, t: number): Vec3 {
  const a = lerp(ps[0]!, ps[1]!, s), b = lerp(ps[3]!, ps[2]!, s);
  return lerp(a, b, t) as Vec3;
}

export interface DisplacementGrid {
  points: Vec3[];
  uvs: number[][];
  colors: number[][];
  normals: Vec3[];
  centroid: readonly number[];
  triangles: [number, number, number][];
  triangleNormals: Vec3[];
}

/** A displaced face's drawn grid. */
export function displacementGrid(m: EditMesh, f: number): DisplacementGrid {
  const face = m.faces[f]!;
  const disp = face.disp!;
  const side = gridSide(disp.power), n = side - 1;
  const ps = facePoints(m, f);
  const nrm = faceNormal(m, f);
  const attrs = face.corners.map((c) => cornerAttrs(m, c));
  const bil = (key: 'uv' | 'color', s: number, t: number): number[] =>
    lerp(lerp(attrs[0]![key], attrs[1]![key], s), lerp(attrs[3]![key], attrs[2]![key], s), t);
  const points: Vec3[] = [], uvs: number[][] = [], colors: number[][] = [];
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    const s = i / n, t = j / n;
    points.push(add(basePoint(ps, s, t), [nrm[0] * disp.heights[j * side + i]!, nrm[1] * disp.heights[j * side + i]!, nrm[2] * disp.heights[j * side + i]!]));
    uvs.push(bil('uv', s, t));
    colors.push(bil('color', s, t));
  }
  const at = (i: number, j: number): number => j * side + i;
  const triangles: [number, number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    // Source's alternating diagonal, so a slope reads the same either way across the grid.
    if ((i + j) % 2 === 0) triangles.push([a, b, c], [a, c, d]);
    else triangles.push([a, b, d], [b, c, d]);
  }
  const triangleNormals = triangles.map(([a, b, c]) => normalize(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!))));
  const normals: Vec3[] = points.map(() => [0, 0, 0]);
  triangles.forEach((t, k) => { for (const v of t) normals[v] = add(normals[v]!, triangleNormals[k]!); });
  return { points, uvs, colors, normals: normals.map(normalize), centroid: attrs[0]!.centroid, triangles, triangleNormals };
}

/** A displacement's grid point (i, j) where it stands now. */
export function displacementPoint(m: EditMesh, f: number, i: number, j: number): Vec3 {
  const disp = m.faces[f]!.disp!;
  const side = gridSide(disp.power), n = side - 1;
  const nrm = faceNormal(m, f);
  const h = disp.heights[j * side + i]!;
  return add(basePoint(facePoints(m, f), i / n, j / n), [nrm[0] * h, nrm[1] * h, nrm[2] * h]);
}

export type SculptMode = 'raise' | 'lower' | 'smooth' | 'flatten';

/**
 * A brush stroke over displaced faces: each grid point within `radius` of `centre` (on the face's plane) is moved by
 * `amount` times a smooth falloff -- raised, lowered, smoothed toward its neighbours, or flattened toward the base.
 */
export function sculpt(m: EditMesh, faces: readonly number[], centre: readonly number[], radius: number, amount: number, mode: SculptMode): number {
  let touched = 0;
  for (const f of faces) {
    const face = m.faces[f];
    if (!face?.disp) continue;
    const disp = face.disp, side = gridSide(disp.power), n = side - 1;
    const ps = facePoints(m, f), nrm = faceNormal(m, f);
    const before = [...disp.heights];
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
      const p = basePoint(ps, i / n, j / n);
      const off = sub(p, centre);
      const planar = sub(off, [nrm[0] * dot(off, nrm), nrm[1] * dot(off, nrm), nrm[2] * dot(off, nrm)]);
      const d = Math.hypot(...planar);
      if (d > radius) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / radius)) * amount;
      const k = j * side + i;
      if (mode === 'raise') disp.heights[k] = before[k]! + w;
      else if (mode === 'lower') disp.heights[k] = before[k]! - w;
      else if (mode === 'flatten') disp.heights[k] = before[k]! * (1 - Math.min(1, w));
      else {
        const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([x, y]) => x! >= 0 && y! >= 0 && x! < side && y! < side);
        const mean = nb.reduce((s, [x, y]) => s + before[y! * side + x!]!, 0) / nb.length;
        disp.heights[k] = before[k]! + (mean - before[k]!) * Math.min(1, w);
      }
      touched++;
    }
  }
  return touched;
}
