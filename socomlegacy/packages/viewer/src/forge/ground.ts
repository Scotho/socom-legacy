import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import { probeGround, uprightFrame, type Grid } from '@s2u/scene';
import { groundPolygons, packGround, type GroundData } from '../mover';
import { walkOrder } from './hide';
import { contentPieceHull, type ContentMiss, type ContentPiece, type ContentResolver } from '../packs/content/collision';

export type { ContentMiss, ContentPiece, ContentResolver } from '../packs/content/collision';

/**
 * FORGE play (a browser adaptation, no original): the ground the walk stands on in a layout. The mover, the probe and
 * the grid are the test room's (`../mover`, `@s2u/scene`); only what they are given is the forge's -- the base map's own
 * hull (`LoadedMap.ground`), or a blank floor, plus each piece's own collision polygons: the disc's `di` polygons of
 * the prototype (socomlegacy/docs/research/72 §6), lifted from one placement the archive's map makes and carried to the
 * piece's matrix.
 */

/** The blank floor's grid cell (the engine's default dimension, `DEFAULT_GRID_PARAMS`). */
const FLOOR_CELL = 640;

/** One square ground polygon (ditype 3) of side `size` at y = 0, centred on the origin: the blank floor's hull. */
export function floorGround(size: number): GroundData {
  const h = size / 2;
  const cells = Math.ceil(size / FLOOR_CELL);
  const grid: GridParams = { atomCount: 8192, posts: 16, cellDim: FLOOR_CELL, cellsX: cells, cellsZ: cells, originX: -cells * FLOOR_CELL / 2, originZ: -cells * FLOOR_CELL / 2 };
  const points = new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]);
  const floor: WorldPoly = { modelName: 'forge_floor', path: 'forge_floor', region: 0, ditype: 3, material: 0, ptcount: 4, cameratype: 0, points };
  return packGround(grid, [floor], [{ modelName: 'forge_floor', path: 'forge_floor', first: 0, count: 1 }]);
}

/**
 * `model`'s collision polygons in its own model space: the polygons of the hull's nodes at or under its first
 * placement (`paths`; a prototype's `di` may sit on the instance node or on a child of it), taken back through that
 * placement's matrix. Every placement of a prototype can carry the same path (Frostfire's 13 `container_blue01` all
 * name `worldmodel/container_blue01=container_blue01`), and the hull's owners follow the scene walk as the placements
 * do, so the owners under a path are shared out in order: the first placement's are the first equal share. FG-31: the
 * placements are taken in the walk's order (`./hide` `walkOrder`), not the draw entries', so the first share is carried
 * back through the walk's first placement's matrix. Null when none of it has any (a prop with no `di`: nothing to stand
 * on or bump into).
 *
 * LATER 146 (web research 313 section 8.10; reading, pending review): each polygon's `frame` is its collider's frame in
 * that model space (`modelFrame`) -- never the base placement's world frame, which `groundPolygons` gives the base's
 * polygons -- for `layoutGround` to compose with the piece's matrix.
 */
export function prototypePolygons(map: LoadedMap, model: string): WorldPoly[] | null {
  if (!map.ground) return null;
  for (const { prop, index } of walkOrder(map, model)) {
    const entry = map.props[prop]!;
    const path = entry.paths![index]!;
    const owners = map.ground.owners.filter((o) => o.count > 0 && (o.path === path || o.path.startsWith(`${path}/`)));
    if (owners.length === 0) continue;
    // Every placement under this path (in this entry and any other of the same name); this one is the walk's first of them.
    const placements = walkOrder(map, model, path).length;
    const share = placements > 1 && owners.length % placements === 0 ? owners.length / placements : owners.length;
    const all = groundPolygons(map.ground);
    const inverse = new Matrix4().fromArray(entry.matrices, index * 16).invert();
    return owners.slice(0, share).flatMap((o) => {
      const frame = modelFrame(o, path, entry.matrices.subarray(index * 16, index * 16 + 16), inverse);
      return all.slice(o.first, o.first + o.count).map(({ frame: _world, ...p }) => ({ ...p, points: carry(p.points, inverse), ...(frame ? { frame } : {}) }));
    });
  }
  return null;
}

/**
 * LATER 146: an owner's collider frame (LATER 142's `CollisionOwner.frame`, row-major as `../climb` `intoFrame` reads it:
 * three's `Matrix4.elements`) in its prototype's model space -- the placement's inverse times the owner's frame. Decided
 * upright by structure, never by a tolerance: the owner the placement node itself (its frame the placement's matrix:
 * the identity in model space), or an owner with no frame under an upright placement, gives none. Where the owner has
 * no frame under a tilted placement, its frame is upright in the world -- a turn about y, a uniform scale and a shift --
 * which moves neither the column nor the cut, so the identity stands in for it. A door's owner carries no `frame` (LATER
 * 142: the walk's is the live world one) but its rest frame (`restFrame`, LATER 146's review F1), read here in its stead:
 * the piece stands still, and the room's raw owners of a library archive carry the same frame as `frame`, so the page's
 * piece and the room's come out alike.
 */
function modelFrame(o: CollisionOwner, path: string, placement: Float32Array, inverse: Matrix4): Float32Array | null {
  const own = o.frame ?? o.restFrame;
  if (o.path === path || (!own && uprightFrame(placement))) return null;
  const local = own ? inverse.clone().multiply(new Matrix4().fromArray(own)) : inverse;
  return Float32Array.from(local.elements);
}

function carry(points: Float32Array, m: Matrix4): Float32Array {
  const out = new Float32Array(points.length);
  const v = new Vector3();
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i]!, points[i + 1]!, points[i + 2]!).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
}

export interface PieceHull {
  /** The piece's owner path (what a probe hit names). */
  owner: string;
  /** Its prototype's polygons in model space (`prototypePolygons`). */
  polys: readonly WorldPoly[];
  /** Its column-major 4x4. */
  m: readonly number[];
}

/**
 * The base's hull and every piece's, one ground: the base's owners as they were, then each piece's -- one owner a run of
 * its polygons that share a model-space frame (`prototypePolygons`), all named by the piece. LATER 146 (web research 313
 * section 8.10; reading, pending review): each owner carries its collider's frame, as the base's hull does (LATER 142):
 * the piece's matrix composed with the run's model-space frame, or the piece's matrix alone where the run has none. None
 * when both are upright -- the piece turning about y alone, read exactly off its stored matrix (`uprightFrame`: three's
 * `compose` leaves the four off-axis terms exactly 0 when the quaternion's x and z are), and no model-space frame.
 *
 * FCW-09 (product track; a browser adaptation): a creator pack's piece (`ContentPiece`, its `content` reference) is
 * turned into its `PieceHull` by `resolveContent` through the content provider (`../packs/content/collision`
 * `contentPieceHull`) and composed as any other piece. One left out -- unresolved, or placed other than by a turn about
 * +Y -- adds no polygon and is pushed onto `missing`, the caller's count of pieces left out (as a missing archive is).
 * A disc piece (`PieceHull`) takes exactly the path it took before.
 */
export function layoutGround(base: GroundData, pieces: readonly (PieceHull | ContentPiece)[], resolveContent: ContentResolver | null = null,
  missing?: ContentMiss[]): GroundData {
  const polys = groundPolygons(base);
  const owners: CollisionOwner[] = base.owners.map((o) => ({ ...o }));
  for (const entry of pieces) {
    let p: PieceHull;
    if ('content' in entry) {
      const got = contentPieceHull(entry, resolveContent);
      if ('missing' in got) { missing?.push({ owner: entry.owner, content: entry.content, reason: got.missing }); continue; }
      if (!got.hull) continue;
      p = got.hull;
    } else p = entry;
    if (p.polys.length === 0) continue;
    const m = new Matrix4().fromArray(p.m as number[]);
    let run: Float32Array | undefined | null = null;
    for (const { frame: local, ...poly } of p.polys) {
      if (run === null || local !== run) {
        run = local;
        const frame = local ? Float32Array.from(m.clone().multiply(new Matrix4().fromArray(local)).elements) : uprightFrame(p.m) ? null : Float32Array.from(p.m);
        owners.push({ modelName: poly.modelName, path: p.owner, first: polys.length, count: 0, ...(frame ? { frame } : {}) });
      }
      owners[owners.length - 1]!.count++;
      polys.push({ ...poly, path: p.owner, points: carry(poly.points, m) });
    }
  }
  return packGround(base.grid, polys, owners);
}

/**
 * Where Play stands the SEAL when no spawn marker is placed: the highest floor under the first of `around` (x, z)
 * that has one at or below `below` (the camera, the disc's slot, the map's middle); else the centre of the hull's first
 * ground polygon (what the walk can stand on, ditype bit 0). Null when the hull has no ground at all. A map with no
 * measured opening stand opens its camera off its own extent (`../matchCore` `standOf`), with nothing under it.
 */
export function standingSpot(grid: Grid, ground: GroundData, around: readonly (readonly [number, number])[], below = Infinity): [number, number, number] | null {
  for (const [x, z] of around) {
    const y = probeGround(grid, x, z).map((h) => h.y).filter((h) => h <= below).sort((a, b) => b - a)[0];
    if (y !== undefined) return [x, y, z];
  }
  for (const p of groundPolygons(ground)) {
    if ((p.ditype & 1) === 0 || p.ptcount < 3) continue;
    let x = 0, z = 0;
    for (let i = 0; i < p.ptcount; i++) { x += p.points[i * 3]!; z += p.points[i * 3 + 2]!; }
    x /= p.ptcount; z /= p.ptcount;
    const y = probeGround(grid, x, z).map((h) => h.y).sort((a, b) => b - a)[0];
    if (y !== undefined) return [x, y, z];
  }
  return null;
}
