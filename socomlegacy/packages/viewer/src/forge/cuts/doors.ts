import { Matrix4, Vector3 } from 'three';
import type { LoadedMap } from '../../loadMap';
import { groundPolygons } from '../../mover';
import { makeCutBox, type CutBox, type CutFaces } from './geometry';
import { PLACED_DOOR_NODE, placedFrameRoot, placedRevealNode } from './names';

/**
 * FORGE CUTS, a placed door's opening (a browser adaptation, FG.R2). A door the layout places (`../placedDoors`,
 * `forge_door_<n>`) opens a hole in what it stands in: a box as wide and as tall as its leaf at rest
 * (`DOOR_CUT_PAD_ADAPTATION` past it), from just below the leaf's foot (`DOOR_CUT_FLOOR_CLEAR_ADAPTATION`, so no sliver
 * of wall is left across the doorway), reaching `DOOR_CUT_HALF_DEPTH_ADAPTATION` either side of the wall's middle so
 * both its faces open. It takes walls only (`DOOR_CUT_FACES_ADAPTATION`): a floor, a step or a ceiling stays whole.
 */

/** How far past the leaf's own width and top the hole reaches, so its edges leave no slivers (world units, ~10 cm each). */
export const DOOR_CUT_PAD_ADAPTATION = 0.2;
/**
 * How far below the leaf's foot the hole reaches: through the wall's foot, so no sliver of wall is left across the
 * doorway to stop a body (the walls' test takes any upright face, however low). The floor is never cut: a door's box
 * takes no level faces.
 */
export const DOOR_CUT_FLOOR_CLEAR_ADAPTATION = 0.1;
/** How far the hole reaches either side of the wall's middle: through the thickest wall a door is set into (~50 cm). */
export const DOOR_CUT_HALF_DEPTH_ADAPTATION = 5;
/** A door's opening takes the surfaces facing along it (x) and through it (z), never those facing up or down (y). */
export const DOOR_CUT_FACES_ADAPTATION: CutFaces = { x: true, y: false, z: true };

/**
 * A leaf's level frame: the direction it runs (`u`), the way through it (`n`, `u` turned a quarter), its middle, its
 * foot and top, its half width and half thickness. Its plane seen from above is the level direction across which it is
 * thinnest (half-degree steps), so a handle standing off its face does not tip it. Measured on `orient` when given: a
 * door's frame, which stands square in its wall, so a framed door is squared and its hole cut by its frame.
 */
export interface LeafFrame { u: [number, number]; n: [number, number]; c: [number, number, number]; y: [number, number]; half: [number, number] }
export function leafFrame(points: readonly (readonly [number, number, number])[], orient: readonly (readonly [number, number, number])[] = points): LeafFrame | null {
  if (points.length < 2 || orient.length < 2) return null;
  let ux = 1, uz = 0, thinnest = Infinity;
  for (let s = 0; s < 360; s++) {
    const t = (s / 360) * Math.PI, cx = Math.cos(t), cz = Math.sin(t);
    let lo = Infinity, hi = -Infinity;
    for (const p of orient) { const d = -cz * p[0] + cx * p[2]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    if (hi - lo < thinnest - 1e-9) { thinnest = hi - lo; ux = cx; uz = cz; }
  }
  const nx = -uz, nz = ux;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    [ux * p[0] + uz * p[2], p[1], nx * p[0] + nz * p[2]].forEach((v, k) => { lo[k] = Math.min(lo[k]!, v); hi[k] = Math.max(hi[k]!, v); });
  }
  const mu = (lo[0]! + hi[0]!) / 2, mn = (lo[2]! + hi[2]!) / 2;
  return {
    u: [ux, uz], n: [nx, nz], c: [ux * mu + nx * mn, (lo[1]! + hi[1]!) / 2, uz * mu + nz * mn], y: [lo[1]!, hi[1]!],
    half: [(hi[0]! - lo[0]!) / 2, (hi[2]! - lo[2]!) / 2],
  };
}

/** The points of polygons (xyz, flat), each moved by `m` when given. */
export function pointsOf(polys: readonly { points: ArrayLike<number> }[], m?: Matrix4): [number, number, number][] {
  const v = new Vector3();
  const out: [number, number, number][] = [];
  for (const p of polys) for (let i = 0; i + 2 < p.points.length; i += 3) {
    v.set(p.points[i]!, p.points[i + 1]!, p.points[i + 2]!);
    if (m) v.applyMatrix4(m);
    out.push([v.x, v.y, v.z]);
  }
  return out;
}

/** Points moved by `m`. */
const moved = (pts: readonly (readonly [number, number, number])[], m: Matrix4): [number, number, number][] => {
  const v = new Vector3();
  return pts.map((p) => { v.set(p[0], p[1], p[2]).applyMatrix4(m); return [v.x, v.y, v.z]; });
};

/**
 * A door's opening, from its leaf's polygons at rest (world space) and, when it brings one, its frame's points. A framed
 * door's hole is squared by its frame and centred through the wall on it (a disc leaf hangs flush with one of its
 * frame's faces); its size stays the leaf's, the frame's inner opening, so the frame's jambs and head line the cut.
 */
export function doorCutBox(leaf: readonly { points: ArrayLike<number> }[], frame: readonly (readonly [number, number, number])[] = []): CutBox | null {
  const points = pointsOf(leaf);
  const f = leafFrame(points, frame.length ? frame : points);
  if (!f) return null;
  // The box's frame: x along the leaf, y up, z through the wall (x cross y); its origin the leaf's middle at y 0.
  const world = new Matrix4().makeBasis(new Vector3(f.u[0], 0, f.u[1]), new Vector3(0, 1, 0), new Vector3(f.n[0], 0, f.n[1]));
  world.setPosition(f.c[0], 0, f.c[2]);
  let mid = 0;
  if (frame.length) {
    const inv = world.clone().invert();
    const zs = moved(frame, inv).map((p) => p[2]);
    mid = (Math.min(...zs) + Math.max(...zs)) / 2;
  }
  return makeCutBox(world,
    [-f.half[0] - DOOR_CUT_PAD_ADAPTATION, f.y[0] - DOOR_CUT_FLOOR_CLEAR_ADAPTATION, mid - DOOR_CUT_HALF_DEPTH_ADAPTATION],
    [f.half[0] + DOOR_CUT_PAD_ADAPTATION, f.y[1] + DOOR_CUT_PAD_ADAPTATION, mid + DOOR_CUT_HALF_DEPTH_ADAPTATION],
    DOOR_CUT_FACES_ADAPTATION);
}

/**
 * The opening a door copied from `t` opens when its template is moved by `m` (`../placedDoors` `doorMove`), `frame` its
 * frame's points at the template's place: what the editor previews. Lined when the door brings its doorway's lining.
 */
export function doorCutAt(t: { owners: readonly { polys: readonly { points: ArrayLike<number> }[] }[]; reveal?: readonly unknown[] }, m: Matrix4,
  frame: readonly (readonly [number, number, number])[] = []): CutBox | null {
  const box = doorCutBox(t.owners.flatMap((o) => o.polys).map((p) => ({ points: pointsOf([p], m).flat() })), moved(frame, m));
  return box && t.reveal?.length ? { ...box, lined: true } : box;
}

/**
 * The openings of `map`'s placed doors: each read off its leaf's polygons at rest in the hull and its frame's hull
 * (`placedFrameRoot`), lined when its doorway's lining stands in the world (`placedRevealNode`): Play's.
 */
export function placedDoorCuts(map: Pick<LoadedMap, 'doors' | 'ground'> & Partial<Pick<LoadedMap, 'world'>>): CutBox[] {
  if (!map.ground) return [];
  const ground = map.ground;
  const polys = groundPolygons(ground);
  const out: CutBox[] = [];
  for (const spec of map.doors ?? []) {
    if (!PLACED_DOOR_NODE.test(spec.node)) continue;
    const leaf = spec.owners.flatMap((i) => { const o = ground.owners[i]; return o ? polys.slice(o.first, o.first + o.count) : []; });
    const frameRoot = `${placedFrameRoot(spec.node)}/`;
    const frame = ground.owners.filter((o) => o.path.startsWith(frameRoot)).flatMap((o) => pointsOf(polys.slice(o.first, o.first + o.count)));
    const box = doorCutBox(leaf, frame);
    const lined = map.world?.some((w) => w.node === placedRevealNode(spec.node)) ?? false;
    if (box) out.push(lined ? { ...box, lined: true } : box);
  }
  return out;
}
