import type { GridParams } from '@s2u/scene';
import type { LoadedMesh } from '../../loadMap';
import { displacementGrid } from './displacement';
import {
  addCorner, addFace, addVert, emptyMesh, faceNormal, facePoints, triangulate, type DrawStyle, type EditMesh, type Face, type StyleSlot, type Vec3,
} from './editMesh';

/**
 * A map's world draws (`LoadedMap.world`, as `../../loadMap` merges them) into one editable mesh, and the mesh back into
 * draws. The import is lossless and the compile its inverse: an untouched mesh compiles to the very draws it was read
 * from -- the same arrays, value for value and in order (`compileMesh(importWorld(w))` equals `w`), so a map opened for
 * editing and not edited is the original (the parity rule). Positions shared bit for bit across draws are one point, so
 * a seam between two textures moves as one.
 */

const GEOMETRY = new Set(['positions', 'uvs', 'colors', 'normals', 'faceNormals', 'indices', 'centroids', 'triNodes']);
export const NO_NODE = 0xffff;

function styleOf(d: LoadedMesh): DrawStyle {
  const style: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (!GEOMETRY.has(k)) style[k] = v;
  return style as DrawStyle;
}

/** A float32 position's exact identity: its three words' bits (so -0 and 0 stay apart, as the draw holds them). */
function positionKeys(positions: Float32Array): Uint32Array {
  return new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
}

/**
 * Bug 16 (the engine files a world part in every grid cell its placements cover, `LoadedMesh.cells`, and its draw order
 * walks the cells near to far, `../../engineOrder`): an edited draw's cells, its read ones and every cell its triangles
 * now cover (each triangle's x-z box), so a piece moved across the map is drawn in its new place's ring. Null when the
 * read cells hold them all already -- an untouched draw keeps the very cells it was read with.
 */
export function refiledCells(read: readonly number[], positions: readonly number[], indices: readonly number[], grid: GridParams,
  covered: readonly number[] = []): number[] | null {
  const now = coveredCells(positions, indices, grid);
  const known = new Set([...read, ...covered]);
  const extra = now.filter((c) => !known.has(c));
  return extra.length ? [...new Set([...read, ...extra])].sort((a, b) => a - b) : null;
}

/** The grid cells a draw's triangles cover (each triangle's x-z box), in order. */
export function coveredCells(positions: ArrayLike<number>, indices: ArrayLike<number>, grid: GridParams): number[] {
  const have = new Set<number>();
  const cellOf = (v: number, origin: number, count: number): number => Math.min(count - 1, Math.max(0, Math.floor((v - origin) / grid.cellDim)));
  for (let t = 0; t + 2 < indices.length; t += 3) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = indices[t + k]! * 3;
      x0 = Math.min(x0, positions[i]!); x1 = Math.max(x1, positions[i]!);
      z0 = Math.min(z0, positions[i + 2]!); z1 = Math.max(z1, positions[i + 2]!);
    }
    const cx0 = cellOf(x0, grid.originX, grid.cellsX), cx1 = cellOf(x1, grid.originX, grid.cellsX);
    const cz0 = cellOf(z0, grid.originZ, grid.cellsZ), cz1 = cellOf(z1, grid.originZ, grid.cellsZ);
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) have.add(x + z * grid.cellsX);
  }
  return [...have].sort((a, b) => a - b);
}

/** The world draws as one mesh: a style each draw, a corner each of its vertices, a face each of its triangles. */
export function importWorld(world: readonly LoadedMesh[], grid?: GridParams): EditMesh {
  const m = emptyMesh();
  const weld = new Map<string, number>();
  world.forEach((d, di) => {
    const slot: StyleSlot = {
      style: styleOf(d), normals: d.normals !== null, faceNormals: d.faceNormals !== null, centroids: !!d.centroids, rank: di,
      ...(d.triNodes ? { triNodes: true } : {}),
      ...(grid && d.cells ? { covered: coveredCells(d.positions, d.indices, grid) } : {}),
    };
    m.styles.push(slot);
    const bits = positionKeys(d.positions);
    const n = d.positions.length / 3;
    const first = m.cVert.length;
    // A tagged load welds within a node only: two nodes touching (a building on the terrain) stay two pieces, as the
    // scene graph has them, so moving one leaves the other. A vertex takes the node of the first triangle that uses it.
    const vertNode = new Int32Array(n).fill(-1);
    if (d.triNodes) for (let t = d.indices.length / 3 - 1; t >= 0; t--) for (let k = 0; k < 3; k++) vertNode[d.indices[t * 3 + k]!] = d.triNodes[t]!;
    for (let i = 0; i < n; i++) {
      const key = `${vertNode[i]}_${bits[i * 3]}_${bits[i * 3 + 1]}_${bits[i * 3 + 2]}`;
      let v = weld.get(key);
      if (v === undefined) { v = addVert(m, d.positions.subarray(i * 3, i * 3 + 3) as unknown as number[]); weld.set(key, v); }
      addCorner(m, v, {
        uv: [d.uvs[i * 2]!, d.uvs[i * 2 + 1]!],
        color: [d.colors[i * 4]!, d.colors[i * 4 + 1]!, d.colors[i * 4 + 2]!, d.colors[i * 4 + 3]!],
        normal: d.normals ? [d.normals[i * 3]!, d.normals[i * 3 + 1]!, d.normals[i * 3 + 2]!] : [0, 0, 0],
        ...(d.centroids ? { centroid: [d.centroids[i * 3]!, d.centroids[i * 3 + 1]!, d.centroids[i * 3 + 2]!] } : {}),
      });
    }
    for (let t = 0; t < d.indices.length / 3; t++) {
      const fn = d.faceNormals ? [d.faceNormals[t * 3]!, d.faceNormals[t * 3 + 1]!, d.faceNormals[t * 3 + 2]!] as Vec3 : null;
      const f = addFace(m, [first + d.indices[t * 3]!, first + d.indices[t * 3 + 1]!, first + d.indices[t * 3 + 2]!], di, fn);
      if (d.triNodes) m.faces[f]!.group = d.triNodes[t] === NO_NODE ? -1 : d.triNodes[t]!;
    }
    const used = new Set(d.indices);
    const unused: number[] = [];
    for (let i = 0; i < n; i++) if (!used.has(i)) unused.push(first + i);
    if (unused.length) slot.unused = unused;
  });
  return m;
}

const nodeOf = (f: Face): number => (f.group === undefined || f.group < 0 ? NO_NODE : f.group);

/** Growable per-draw arrays the compile fills. */
class DrawBuild {
  positions: number[] = []; uvs: number[] = []; colors: number[] = []; normals: number[] = []; centroids: number[] = [];
  faceNormals: number[] = []; indices: number[] = []; nodes: number[] = [];
  vertex(p: readonly number[], uv: readonly number[], color: readonly number[], normal: readonly number[], centroid: readonly number[]): number {
    this.positions.push(p[0]!, p[1]!, p[2]!);
    this.uvs.push(uv[0]!, uv[1]!);
    this.colors.push(color[0]!, color[1]!, color[2]!, color[3]!);
    this.normals.push(normal[0]!, normal[1]!, normal[2]!);
    this.centroids.push(centroid[0]!, centroid[1]!, centroid[2]!);
    return this.positions.length / 3 - 1;
  }
}

/**
 * The mesh as draws: one a style with a live face, in the styles' rank order; in each, the faces in their order, a
 * polygon cut into triangles (`triangulate`), a displaced face drawn as its grid (`displacementGrid`). The corners a
 * draw's faces use are its vertices, in corner order -- the import's, so an untouched draw keeps its indices.
 */
/**
 * Where each vertex of a compiled draw came from (the geometry editor's live drag, `./editor`): the point it stands on,
 * by the draw's vertex order, or -1 for one a displacement's grid made (its place depends on the whole grid).
 */
export type DrawSources = Map<LoadedMesh, { mesh: EditMesh; verts: Int32Array }>;

export function compileMesh(m: EditMesh, skip?: (face: Face) => boolean, sources?: DrawSources, grid?: GridParams): LoadedMesh[] {
  const byStyle = new Map<number, number[]>();
  m.faces.forEach((f, i) => {
    if (!f || skip?.(f)) return;
    const l = byStyle.get(f.style);
    if (l) l.push(i); else byStyle.set(f.style, [i]);
  });
  const order = [...byStyle.keys()].sort((a, b) => m.styles[a]!.rank - m.styles[b]!.rank || a - b);
  const out: LoadedMesh[] = [];
  for (const s of order) {
    const slot = m.styles[s]!;
    const faces = byStyle.get(s)!;
    const build = new DrawBuild();
    // The plain faces' corners, in corner order.
    const used = new Set<number>();
    for (const f of faces) if (!m.faces[f]!.disp) for (const c of m.faces[f]!.corners) used.add(c);
    for (const c of slot.unused ?? []) used.add(c);
    const local = new Map<number, number>();
    const fromVert: number[] = [];
    for (const c of [...used].sort((a, b) => a - b)) {
      const v = m.cVert[c]!;
      fromVert.push(v);
      local.set(c, build.vertex(
        [m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!], [m.cUv[c * 2]!, m.cUv[c * 2 + 1]!],
        [m.cColor[c * 4]!, m.cColor[c * 4 + 1]!, m.cColor[c * 4 + 2]!, m.cColor[c * 4 + 3]!],
        [m.cNormal[c * 3]!, m.cNormal[c * 3 + 1]!, m.cNormal[c * 3 + 2]!], [m.cCentroid[c * 3]!, m.cCentroid[c * 3 + 1]!, m.cCentroid[c * 3 + 2]!],
      ));
    }
    for (const fi of faces) {
      const f = m.faces[fi]!;
      if (f.disp) {
        const g = displacementGrid(m, fi);
        const base = build.positions.length / 3;
        g.points.forEach((p, i) => { build.vertex(p, g.uvs[i]!, g.colors[i]!, g.normals[i]!, g.centroid); fromVert.push(-1); });
        g.triangles.forEach(([a, b, c], t) => {
          build.indices.push(base + a, base + b, base + c);
          build.faceNormals.push(...g.triangleNormals[t]!);
          build.nodes.push(nodeOf(f));
        });
        continue;
      }
      const tris = f.corners.length === 3 ? [[0, 1, 2] as [number, number, number]] : triangulate(facePoints(m, fi));
      const fn = f.normal ?? faceNormal(m, fi);
      for (const [a, b, c] of tris) {
        build.indices.push(local.get(f.corners[a]!)!, local.get(f.corners[b]!)!, local.get(f.corners[c]!)!);
        build.faceNormals.push(fn[0], fn[1], fn[2]);
        build.nodes.push(nodeOf(f));
      }
    }
    const draw: LoadedMesh = {
      ...slot.style,
      positions: Float32Array.from(build.positions),
      uvs: Float32Array.from(build.uvs),
      colors: Float32Array.from(build.colors),
      normals: slot.normals ? Float32Array.from(build.normals) : null,
      faceNormals: slot.faceNormals ? Float32Array.from(build.faceNormals) : null,
      indices: Uint32Array.from(build.indices),
      ...(slot.centroids ? { centroids: Float32Array.from(build.centroids) } : {}),
      ...(slot.triNodes ? { triNodes: Uint16Array.from(build.nodes) } : {}),
    };
    if (grid && slot.style.cells) {
      const cells = refiledCells(slot.style.cells, build.positions, build.indices, grid, slot.covered);
      if (cells) draw.cells = cells;
    }
    sources?.set(draw, { mesh: m, verts: Int32Array.from(fromVert) });
    out.push(draw);
  }
  return out;
}
