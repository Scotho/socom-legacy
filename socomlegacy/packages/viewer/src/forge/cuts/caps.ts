import { Matrix4, Vector3 } from 'three';
import type { WorldPoly } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../../loadMap';
import { groundPolygons } from '../../mover';
import { newell, ownerMoves, triples, worldPart, type CutBox } from './geometry';
import { PLACED_DOOR_PATH, PLACED_FRAME_PATH } from './names';

/**
 * FORGE CUTS, a hole's lining (a browser adaptation, FG.R2). Cutting a wall opens it between its two faces: what was
 * inside the wall shows, and a body could step into it. The disc's doorways are built with their reveals (the
 * wall-thick faces round an opening, the floor running through under them) and a disc door frame is only trim over
 * them, so a cut hole is lined here: across the wall's thickness, on each side of the box the wall goes on past (its
 * jambs, its head, its sill or threshold plate), solid in the hull. A placed door's hole is lined in its frame's look,
 * any other hole in the cut wall's own; a sill or threshold plate wears the floor beside it.
 *
 * A wall is read off the hull: the static upright faces the box cuts whose normals run along one of its level axes
 * (`z` the way through, else `x`) and whose planes stand between `CUT_CAP_THINNEST_ADAPTATION` and
 * `CUT_CAP_THICKEST_ADAPTATION` apart. A single face (no thickness) is not lined.
 */

/** The thickest wall a hole is lined through (about 80 cm), world units; faces farther apart are two walls. */
export const CUT_CAP_THICKEST_ADAPTATION = 8;
/** The thinnest wall a hole is lined through (about 2.5 cm); faces nearer than this are one sheet. */
export const CUT_CAP_THINNEST_ADAPTATION = 0.25;
/** How square to the box's axis a face must be to be the wall's: its unit normal's share along the axis. */
export const CUT_CAP_SQUARE_ADAPTATION = 0.95;
/** How far round a box (world units) the lining looks for the wall's, the frame's or the floor's look and the floor's hull. */
export const CUT_CAP_LOOK_REACH_ADAPTATION = 10;
/** How far off a sill's height a face may stand and still be the floor beside it. */
export const CUT_CAP_LEVEL_ADAPTATION = 0.5;
/** The texels a world unit when a look's face gives none (a degenerate face): about the disc walls' own. */
export const CUT_CAP_TEXELS_ADAPTATION = 0.05;

export interface CutCaps { meshes: LoadedMesh[]; polys: WorldPoly[] }

/** The lining `boxes` need in `map` (read before the cut: the faces it cuts). */
export function cutCaps(map: Pick<LoadedMap, 'world' | 'ground' | 'props'>, boxes: readonly CutBox[]): CutCaps {
  const out: CutCaps = { meshes: [], polys: [] };
  if (!map.ground || !boxes.length) return out;
  // The placed doors' frames, drawn as world chunks: the look a door's lining takes when its box reaches one.
  const frames: LoadedMesh[] = [];
  for (const prop of map.props) prop.paths?.forEach((path, i) => {
    if (!PLACED_FRAME_PATH.test(path)) return;
    const m = new Matrix4().fromArray(Array.from(prop.matrices.subarray(i * 16, i * 16 + 16)));
    for (const part of prop.parts) frames.push(worldPart(part, m, prop.order, undefined));
  });
  const polys = groundPolygons(map.ground);
  const moving = new Set<number>();
  for (const o of map.ground.owners) if (ownerMoves(o)) for (let i = o.first; i < o.first + o.count; i++) moving.add(i);
  const v = new Vector3();
  const R = CUT_CAP_LOOK_REACH_ADAPTATION;
  for (const box of boxes) {
    for (const [a, b] of [[2, 0], [0, 2]] as const) {
      if (!(a === 2 ? box.faces.z : box.faces.x)) continue;
      // The wall's faces along axis `a`: their plane's place on it, their extent along `b` and up (the box's frame).
      const planes: number[] = [];
      let bLo = Infinity, bHi = -Infinity, yLo = Infinity, yHi = -Infinity;
      let source: WorldPoly | null = null;
      polys.forEach((p, i) => {
        if (moving.has(i) || PLACED_DOOR_PATH.test(p.path)) return;
        const local = triples(p.points).map((q) => { v.set(q[0]!, q[1]!, q[2]!).applyMatrix4(box.local); return [v.x, v.y, v.z]; });
        const n = newell(local);
        if (!n || Math.abs(n[a]!) < CUT_CAP_SQUARE_ADAPTATION) return;
        const at = local.reduce((s, q) => s + q[a]!, 0) / local.length;
        if (at < box.lo[a]! || at > box.hi[a]!) return;
        const pb = local.map((q) => q[b]!), py = local.map((q) => q[1]!);
        if (Math.max(...pb) <= box.lo[b]! || Math.min(...pb) >= box.hi[b]! || Math.max(...py) <= box.lo[1] || Math.min(...py) >= box.hi[1]) return;
        planes.push(at);
        bLo = Math.min(bLo, ...pb); bHi = Math.max(bHi, ...pb);
        yLo = Math.min(yLo, ...py); yHi = Math.max(yHi, ...py);
        source ??= p;
      });
      if (planes.length < 2 || !source) continue;
      const wall: WorldPoly = source;
      const w0 = Math.min(...planes), w1 = Math.max(...planes);
      if (w1 - w0 < CUT_CAP_THINNEST_ADAPTATION || w1 - w0 > CUT_CAP_THICKEST_ADAPTATION) continue;
      const look = bestLook(frames, (pts) => pts.every((q) => [0, 1, 2].every((k) => q[k]! > box.min[k]! - 2 && q[k]! < box.max[k]! + 2)))
        ?? bestLook(map.world, (pts) => {
          const local = pts.map((q) => { v.set(q[0]!, q[1]!, q[2]!).applyMatrix4(box.local); return [v.x, v.y, v.z]; });
          const n = newell(local);
          if (!n || Math.abs(n[a]!) < CUT_CAP_SQUARE_ADAPTATION) return false;
          const at = local.reduce((s, q) => s + q[a]!, 0) / 3;
          return at >= w0 - CUT_CAP_LEVEL_ADAPTATION && at <= w1 + CUT_CAP_LEVEL_ADAPTATION
            && local.some((q) => q[b]! > box.lo[b]! - R && q[b]! < box.hi[b]! + R && q[1]! > box.lo[1] - R && q[1]! < box.hi[1] + R);
        });
      // Each side the wall goes on past: a quad across its thickness, facing into the hole.
      const yA = Math.max(box.lo[1], yLo), yB = Math.min(box.hi[1], yHi);
      const sA = Math.max(box.lo[b]!, bLo), sB = Math.min(box.hi[b]!, bHi);
      const sides: { axis: number; at: number; inward: 1 | -1; span: [number, number]; spanAxis: number }[] = [];
      if (bLo < box.lo[b]! && yB > yA) sides.push({ axis: b, at: box.lo[b]!, inward: 1, span: [yA, yB], spanAxis: 1 });
      if (bHi > box.hi[b]! && yB > yA) sides.push({ axis: b, at: box.hi[b]!, inward: -1, span: [yA, yB], spanAxis: 1 });
      if (yHi > box.hi[1] && sB > sA) sides.push({ axis: 1, at: box.hi[1], inward: -1, span: [sA, sB], spanAxis: b });
      // The sill: on what is left of the wall under the hole; or, when the box leaves floors whole (its y faces off) and
      // cuts the wall to its foot, a threshold plate at the foot -- inside a wall there is no floor of its own.
      if (sB > sA && (yLo < box.lo[1] || !box.faces.y)) sides.push({ axis: 1, at: Math.max(box.lo[1], yLo), inward: 1, span: [sA, sB], spanAxis: b });
      for (const side of sides) {
        // The quad's corners in the box's frame, wound counter-clockwise seen from the hole (`inward`).
        const corner = (t: number, s: number): number[] => {
          const q = [0, 0, 0];
          q[side.axis] = side.at; q[a] = t; q[side.spanAxis] = s;
          return q;
        };
        let quad = [corner(w0, side.span[0]), corner(w1, side.span[0]), corner(w1, side.span[1]), corner(w0, side.span[1])];
        if (Math.sign(newell(quad)![side.axis]!) !== side.inward) quad = quad.reverse();
        const world = quad.map((q) => { v.set(q[0]!, q[1]!, q[2]!).applyMatrix4(box.world); return [v.x, v.y, v.z] as [number, number, number]; });
        const normal = new Vector3(...newell(world)!);
        const sill = side.axis === 1 && side.inward === 1;
        const y = world[0]![1];
        // A sill is floor: it takes the floor's own fields beside it (its region, material, flags), so the walk counts it
        // as the floor it joins; a jamb or a head takes the cut wall's.
        const kind = sill ? floorPolyNear(polys, moving, box, y) ?? wall : wall;
        out.polys.push({ ...kind, points: Float32Array.from(world.flat()), ptcount: 4, ditype: sill ? kind.ditype | 1 : 2, appflags: 0 });
        if (box.lined) continue;
        const own = sill ? bestLook(map.world, (pts) => {
          if (!pts.every((q) => Math.abs(q[1]! - y) < CUT_CAP_LEVEL_ADAPTATION)) return false;
          const n = newell(pts);
          return !!n && n[1] > CUT_CAP_SQUARE_ADAPTATION
            && pts.some((q) => q[0]! > box.min[0] - R && q[0]! < box.max[0] + R && q[2]! > box.min[2] - R && q[2]! < box.max[2] + R);
        }) ?? look : look;
        if (own) out.meshes.push(capMesh(own, world, sill ? world.map((q) => [q[0], q[2]]) : quad.map((q) => [q[a]!, q[side.spanAxis]!]), normal));
      }
    }
  }
  return out;
}

/** A static level floor polygon at height `y` reaching within `CUT_CAP_LOOK_REACH_ADAPTATION` of a box: the floor a sill joins. */
function floorPolyNear(polys: readonly WorldPoly[], moving: ReadonlySet<number>, box: CutBox, y: number): WorldPoly | null {
  const R = CUT_CAP_LOOK_REACH_ADAPTATION;
  let best: WorldPoly | null = null, bestArea = 0;
  polys.forEach((p, i) => {
    if (moving.has(i) || !(p.ditype & 1)) return;
    const pts = triples(p.points);
    if (!pts.every((q) => Math.abs(q[1]! - y) <= CUT_CAP_LEVEL_ADAPTATION)) return;
    const xs = pts.map((q) => q[0]!), zs = pts.map((q) => q[2]!);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (!(x1 > box.min[0] - R && x0 < box.max[0] + R && z1 > box.min[2] - R && z0 < box.max[2] + R)) return;
    const area = (x1 - x0) * (z1 - z0);
    if (area > bestArea) { bestArea = area; best = p; }
  });
  return best;
}

/** A look to line with: the world chunk a face is drawn in, the face's colour and its texels per world unit. */
interface Look { mesh: LoadedMesh; colour: [number, number, number, number]; texels: number }

/** The look of the largest textured triangle of `meshes` that `accept` takes (given its three corners), or null. */
function bestLook(meshes: readonly LoadedMesh[], accept: (pts: number[][]) => boolean): Look | null {
  let best: Look | null = null, bestArea = 0;
  for (const mesh of meshes) {
    if (mesh.textureName === null) continue;
    const p = mesh.positions, uv = mesh.uvs, c = mesh.colors;
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const ids = [mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!];
      const pts = ids.map((i) => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!]);
      const e = [0, 1, 2].map((k) => {
        const i = ids[k]!, j = ids[(k + 1) % 3]!;
        return { pos: Math.hypot(p[i * 3]! - p[j * 3]!, p[i * 3 + 1]! - p[j * 3 + 1]!, p[i * 3 + 2]! - p[j * 3 + 2]!), uv: Math.hypot(uv[i * 2]! - uv[j * 2]!, uv[i * 2 + 1]! - uv[j * 2 + 1]!) };
      });
      const area = e[0]!.pos * e[1]!.pos;
      if (area <= bestArea || !accept(pts)) continue;
      const total = e.reduce((s, x) => s + x.pos, 0);
      bestArea = area;
      best = {
        mesh, texels: total > 0 ? e.reduce((s, x) => s + x.uv, 0) / total : CUT_CAP_TEXELS_ADAPTATION,
        colour: [0, 1, 2, 3].map((k) => ids.reduce((s, i) => s + c[i * 4 + k]!, 0) / 3) as [number, number, number, number],
      };
    }
  }
  return best;
}

/** One lining quad as a world chunk in its look: the texture tiled at the look's density over `plane`, its colour. */
function capMesh(look: Look, corners: readonly (readonly [number, number, number])[], plane: readonly (readonly number[])[], normal: Vector3): LoadedMesh {
  const { centroids: _c, centre: _ce, cells: _cells, switchPath: _s, scrollPath: _sp, ...rest } = look.mesh;
  return {
    ...rest,
    positions: Float32Array.from(corners.flat()),
    uvs: Float32Array.from(plane.flatMap((q) => [q[0]! * look.texels, q[1]! * look.texels])),
    colors: Float32Array.from([0, 1, 2, 3].flatMap(() => look.colour)),
    normals: Float32Array.from([0, 1, 2, 3].flatMap(() => [normal.x, normal.y, normal.z])),
    faceNormals: Float32Array.from([normal.x, normal.y, normal.z, normal.x, normal.y, normal.z]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    scroll: null,
  };
}
