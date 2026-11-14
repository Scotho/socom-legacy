import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, Footprint, WorldPoly } from '@s2u/scene';
import type { DoorSpec } from '../doors';
import type { LoadedMap, LoadedMesh } from '../loadMap';
import type { MapAction } from '../mapActions';
import { under } from '../mapMeta';
import { groundPolygons, packGround } from '../mover';
import { DOOR_GATE_WIRE_SLOTS } from '../net/codec';
import { leafFrame } from './cuts/doors';
import { placedDoorName, placedFrameRoot, placedRevealNode } from './cuts/names';
import type { DoorMarker } from './layout';

/**
 * The layout's placed doors (`Layout.doors`; a browser adaptation, FG.R2, no original): each a copy of one of a disc
 * map's own doors (`LoadedMap.doors`, `../doors` `readDoors`, research 92) moved to a new place and turn -- its drawn
 * props, its leaf's collision polygons (the hull's owners beneath its node, each with its swing's footprint), its
 * `DoorSpec` (the swing and kick programs, its reach, its node's matrices) and its `DOOR` context action -- so the room
 * swings it as it swings the disc's (`DoorSet`: the polygons turned in place, the leaf drawn by `WorldView.moveNode`).
 *
 * A door's frame is its hinge (its node's world origin); a copy at `at` turned `yaw` (radians, about y, from the disc
 * door's own turn) moves every matrix, point and polygon by `T(at) Ry(yaw) T(-hinge)`. Its node, valve and paths are
 * renamed `forge_door_<n>`, so each copy keeps its own state (the valve the door's program reads and sets, by context).
 */

/** One of a library map's doors, with what a copy carries. */
export interface DoorTemplate {
  /** The library archive's stem (`MP2`) and the door's node name (`bdoor_4`): `DoorMarker`'s. */
  source: string;
  name: string;
  lib: LoadedMap;
  spec: DoorSpec;
  /** Each drawn placement beneath the door's node: its prop entry and its index in that entry's matrices. */
  pieces: { prop: LoadedMap['props'][number]; index: number }[];
  /** Its leaf's owners in the library's hull and their polygons (world space, at rest). */
  owners: { owner: CollisionOwner; polys: WorldPoly[] }[];
  /** Its `DOOR` context action (the prompt's place and bitmap), if the map lists one. */
  action: MapAction | null;
  /**
   * Its frame, when the map draws one as a prop of its own around the leaf (`doorFrames`: Frostfire's `dfram*`,
   * Vigilance's `door_frame`, Fish Hook's `door_frame01`, Requiem's `door_pointy`), with that prop's hull owners. A copy
   * carries it, still, so the hole the door cuts (`./cuts`) is lined as the disc's doorways are. Empty where the
   * map builds its doorways into the walls themselves.
   */
  frame?: { pieces: { prop: LoadedMap['props'][number]; index: number }[]; owners: { owner: CollisionOwner; polys: WorldPoly[] }[] };
  /**
   * Its doorway's lining, when the map draws one inside the frame (`doorReveal`): the world's own faces round the opening
   * across the wall's thickness -- Frostfire's `a_steel23` jambs, head and threshold plate. A copy carries them, so the
   * hole it cuts is lined as the disc's doorway is (`./cuts` then lines it no further).
   */
  reveal?: LoadedMesh[];
}

/**
 * A framed door's doorway lining in its map: every world triangle within its frame's extent (`DOOR_FRAME_FIT_ADAPTATION`
 * past it) that does not face the way through the wall (`DOOR_REVEAL_FACING_ADAPTATION`) -- the jambs, the head and the
 * threshold, never the wall's own faces.
 */
export function doorReveal(lib: Pick<LoadedMap, 'world'>, frame: readonly (readonly [number, number, number])[]): LoadedMesh[] {
  const f = leafFrame(frame);
  if (!f) return [];
  const lo = [0, 1, 2].map((k) => Math.min(...frame.map((p) => p[k]!)) - DOOR_FRAME_FIT_ADAPTATION);
  const hi = [0, 1, 2].map((k) => Math.max(...frame.map((p) => p[k]!)) + DOOR_FRAME_FIT_ADAPTATION);
  const out: LoadedMesh[] = [];
  for (const mesh of lib.world) {
    const p = mesh.positions;
    const keep: number[] = [];
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const ids = [mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!];
      if (!ids.every((i) => [0, 1, 2].every((k) => p[i * 3 + k]! >= lo[k]! && p[i * 3 + k]! <= hi[k]!))) continue;
      const a = new Vector3().fromArray(p, ids[0]! * 3), b = new Vector3().fromArray(p, ids[1]! * 3), c = new Vector3().fromArray(p, ids[2]! * 3);
      const n = b.sub(a).cross(c.sub(a));
      if (n.lengthSq() === 0 || Math.abs(n.normalize().x * f.n[0] + n.z * f.n[1]) > DOOR_REVEAL_FACING_ADAPTATION) continue;
      keep.push(t);
    }
    if (keep.length) out.push(subMesh(mesh, keep));
  }
  return out;
}

/** `mesh`'s triangles `tris` alone, their vertices compacted, every lane kept. */
function subMesh(mesh: LoadedMesh, tris: readonly number[]): LoadedMesh {
  const map = new Map<number, number>();
  const order: number[] = [];
  const indices = new Uint32Array(tris.length * 3);
  tris.forEach((t, j) => {
    for (let k = 0; k < 3; k++) {
      const i = mesh.indices[t * 3 + k]!;
      let at = map.get(i);
      if (at === undefined) { at = order.length; map.set(i, at); order.push(i); }
      indices[j * 3 + k] = at;
    }
  });
  const lanes = (a: Float32Array, n: number): Float32Array => {
    const out = new Float32Array(order.length * n);
    order.forEach((i, j) => out.set(a.subarray(i * n, i * n + n), j * n));
    return out;
  };
  const { cells: _c, switchPath: _s, scrollPath: _sp, ...rest } = mesh;
  return {
    ...rest, positions: lanes(mesh.positions, 3), uvs: lanes(mesh.uvs, 2), colors: lanes(mesh.colors, 4),
    normals: mesh.normals ? lanes(mesh.normals, 3) : null,
    faceNormals: mesh.faceNormals ? Float32Array.from(tris.flatMap((t) => [mesh.faceNormals![t * 3]!, mesh.faceNormals![t * 3 + 1]!, mesh.faceNormals![t * 3 + 2]!])) : null,
    ...(mesh.centroids ? { centroids: lanes(mesh.centroids, 3) } : {}), indices,
  };
}

/** A world chunk moved by `m`: its positions, normals and centroids; its texture `<archive>/<name>` when `foreign`. */
function movedChunk(mesh: LoadedMesh, m: Matrix4, archive: string, foreign: boolean, node: string): LoadedMesh {
  const turn = new Matrix4().extractRotation(m);
  const by = (a: Float32Array, mm: Matrix4): Float32Array => movedPoints(mm, a);
  return {
    ...mesh, positions: by(mesh.positions, m), normals: mesh.normals ? by(mesh.normals, turn) : null,
    faceNormals: mesh.faceNormals ? by(mesh.faceNormals, turn) : null, ...(mesh.centroids ? { centroids: by(mesh.centroids, m) } : {}),
    ...(foreign && mesh.textureName !== null ? { textureName: `${archive}/${mesh.textureName}` } : {}), node,
  };
}

/**
 * A browser adaptation's tolerances (no original), in world units (about 10 cm each): how far a frame's extent may
 * fall short of the leaf's and still be its frame, and how far its origin may stand from the leaf's middle.
 */
export const DOOR_FRAME_FIT_ADAPTATION = 1.5;
export const DOOR_FRAME_REACH_ADAPTATION = 15;
/** How many times its leaf's size a frame's drawn extent may be (a whole building holds a leaf too). */
export const DOOR_FRAME_SIZE_ADAPTATION = 2;
/** How far a face's unit normal may lean towards the way through the wall and still be the doorway's lining. */
export const DOOR_REVEAL_FACING_ADAPTATION = 0.5;

/**
 * The props framing a door's leaf: placements on no node of the door's own, standing within
 * `DOOR_FRAME_REACH_ADAPTATION` of the leaf's middle, whose drawn extent holds the leaf's (less
 * `DOOR_FRAME_FIT_ADAPTATION`) across and up, and is at most `DOOR_FRAME_SIZE_ADAPTATION` times its size.
 */
export function doorFrames(lib: LoadedMap, doorPath: string, leaf: readonly WorldPoly[]): { prop: LoadedMap['props'][number]; index: number }[] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of leaf) for (let i = 0; i + 2 < p.points.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k]!, p.points[i + k]!); hi[k] = Math.max(hi[k]!, p.points[i + k]!);
  }
  if (!(lo[0]! <= hi[0]!)) return [];
  const mid = [0, 1, 2].map((k) => (lo[k]! + hi[k]!) / 2);
  const size = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
  const out: { prop: LoadedMap['props'][number]; index: number }[] = [];
  const v = new Vector3();
  for (const prop of lib.props) {
    if (prop.alternate || prop.facade) continue;
    for (let index = 0; index < prop.matrices.length / 16; index++) {
      const path = prop.paths?.[index];
      if (path && under(path, doorPath)) continue;
      const m = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
      if (Math.hypot(m.elements[12]! - mid[0]!, m.elements[14]! - mid[2]!) > DOOR_FRAME_REACH_ADAPTATION) continue;
      const fl = [Infinity, Infinity, Infinity], fh = [-Infinity, -Infinity, -Infinity];
      for (const part of prop.parts) for (let i = 0; i + 2 < part.positions.length; i += 3) {
        v.set(part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!).applyMatrix4(m);
        [v.x, v.y, v.z].forEach((x, k) => { fl[k] = Math.min(fl[k]!, x); fh[k] = Math.max(fh[k]!, x); });
      }
      const holds = [0, 2].every((k) => fl[k]! <= lo[k]! + DOOR_FRAME_FIT_ADAPTATION && fh[k]! >= hi[k]! - DOOR_FRAME_FIT_ADAPTATION) && fh[1]! >= hi[1]! - DOOR_FRAME_FIT_ADAPTATION;
      if (holds && Math.hypot(fh[0]! - fl[0]!, fh[1]! - fl[1]!, fh[2]! - fl[2]!) <= size * DOOR_FRAME_SIZE_ADAPTATION) out.push({ prop, index });
    }
  }
  return out;
}

/** The points of the frame a door brings (world space, at the template's own place): what a snap centres in the wall. */
export function doorFramePoints(t: Pick<DoorTemplate, 'frame'>): [number, number, number][] {
  const out: [number, number, number][] = [];
  const v = new Vector3();
  for (const { prop, index } of (t.frame?.pieces ?? [])) {
    const m = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    for (const part of prop.parts) for (let i = 0; i + 2 < part.positions.length; i += 3) {
      v.set(part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!).applyMatrix4(m);
      out.push([v.x, v.y, v.z]);
    }
  }
  return out;
}

export { placedDoorName, placedFrameRoot, placedRevealNode };

/** The door's hinge: its node's world origin (`local` then `parent`, row-vector; three's column-major order alike). */
export function doorHinge(spec: Pick<DoorSpec, 'local' | 'parent'>): [number, number, number] {
  const w = new Matrix4().fromArray(spec.parent).multiply(new Matrix4().fromArray(spec.local));
  return [w.elements[12]!, w.elements[13]!, w.elements[14]!];
}

/** The library map's doors, each with its props, its leaf's polygons and its action. */
export function doorTemplates(lib: LoadedMap, source: string): DoorTemplate[] {
  const polys = lib.ground ? groundPolygons(lib.ground) : [];
  return (lib.doors ?? []).map((spec) => {
    const pieces: DoorTemplate['pieces'] = [];
    for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (under(p, spec.path)) pieces.push({ prop, index }); });
    const owners = spec.owners.flatMap((i) => {
      const owner = lib.ground?.owners[i];
      return owner ? [{ owner, polys: polys.slice(owner.first, owner.first + owner.count) }] : [];
    });
    const action = (lib.actions ?? []).find((a) => a.typeCode === 0 && a.node.toLowerCase() === spec.node.toLowerCase()) ?? null;
    const framePieces = doorFrames(lib, spec.path, owners.flatMap((o) => o.polys));
    const framePaths = framePieces.map(({ prop, index }) => prop.paths?.[index]).filter((p): p is string => !!p);
    // The frame's own hull: owners under its node, and of those only what stands at this frame -- a map's frames can
    // share one node name (Vigilance's and Fish Hook's `door_frame`s), and another frame's polygons copied here would
    // stand as unseen walls wherever that one stood, and turn the hole the frame squares.
    const drawn = doorFramePoints({ frame: { pieces: framePieces, owners: [] } });
    const fLo = [0, 1, 2].map((k) => Math.min(...drawn.map((q) => q[k]!)) - DOOR_FRAME_FIT_ADAPTATION);
    const fHi = [0, 1, 2].map((k) => Math.max(...drawn.map((q) => q[k]!)) + DOOR_FRAME_FIT_ADAPTATION);
    const atFrame = (p: WorldPoly): boolean => {
      for (let i = 0; i + 2 < p.points.length; i += 3) for (let k = 0; k < 3; k++) if (p.points[i + k]! < fLo[k]! || p.points[i + k]! > fHi[k]!) return false;
      return true;
    };
    const frameOwners = (lib.ground?.owners ?? []).flatMap((owner) => {
      if (!framePaths.some((fp) => under(owner.path, fp))) return [];
      const own = polys.slice(owner.first, owner.first + owner.count).filter(atFrame);
      return own.length ? [{ owner, polys: own }] : [];
    });
    const frame = { pieces: framePieces, owners: frameOwners };
    const reveal = framePieces.length ? doorReveal(lib, doorFramePoints({ frame })) : [];
    return { source, name: spec.node, lib, spec, pieces, owners, action, frame, ...(reveal.length ? { reveal } : {}) };
  });
}

/** The move from the template's hinge to `at`, turned `yaw` radians about y: T(at) Ry(yaw) T(-hinge). */
export function doorMove(t: DoorTemplate, at: readonly number[], yaw: number): Matrix4 {
  const h = doorHinge(t.spec);
  return new Matrix4().makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!).multiply(new Matrix4().makeTranslation(-h[0], -h[1], -h[2]));
}

const moved = (m: Matrix4, p: readonly number[]): [number, number, number] => {
  const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(m);
  return [v.x, v.y, v.z];
};
const movedPoints = (m: Matrix4, points: ArrayLike<number>): Float32Array => {
  const out = new Float32Array(points.length);
  const v = new Vector3();
  for (let i = 0; i < points.length; i += 3) {
    v.set(points[i]!, points[i + 1]!, points[i + 2]!).applyMatrix4(m);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
  }
  return out;
};


/** The template's props for one copy: moved by `m`, renamed beneath `root`, their textures `<archive>/<name>` when `foreign`. */
function copiedProps(t: DoorTemplate, m: Matrix4, root: string, foreign: boolean): LoadedMap['props'] {
  return [...copiedPieces(t, t.pieces, m, foreign, (p) => `${root}${p.slice(t.spec.path.length)}`),
    ...copiedPieces(t, (t.frame?.pieces ?? []), m, foreign, (_p, k) => `${root}_frame/${k}`)];
}
function copiedPieces(t: DoorTemplate, pieces: DoorTemplate['pieces'], m: Matrix4, foreign: boolean, rename: (path: string, k: number) => string): LoadedMap['props'] {
  return pieces.map(({ prop, index }, k) => {
    const world = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    return {
      modelName: prop.modelName, order: prop.order, alternate: prop.alternate, facade: prop.facade, lod: prop.lod,
      parts: prop.parts.map((part) => (foreign && part.textureName !== null ? { ...part, textureName: `${t.lib.archive}/${part.textureName}` } : part)),
      matrices: Float32Array.from(m.clone().multiply(world).elements),
      paths: [rename(prop.paths?.[index] ?? '', k)],
    };
  });
}

/**
 * One copy: its `DoorSpec` (numbered `index`, its owners from `firstOwner` on), its leaf's owners and polygons (their
 * paths beneath `root`, their footprint the hinge's moved, the reach the same), its props and its action.
 */
export function copiedDoor(t: DoorTemplate, m: Matrix4, name: string, index: number, firstOwner: number, foreign = false):
  { spec: DoorSpec; owners: CollisionOwner[]; polys: WorldPoly[]; frameOwners: CollisionOwner[]; framePolys: WorldPoly[]; reveal: LoadedMesh[]; props: LoadedMap['props']; action: MapAction | null } {
  const root = `worldmodel/${name}`;
  const rename = (p: string): string => `${root}${p.slice(t.spec.path.length)}`;
  const hinge = moved(m, doorHinge(t.spec));
  const reach = (t.spec.sweep.maxX - t.spec.sweep.minX) / 2;
  const sweep: Footprint = { minX: hinge[0] - reach, maxX: hinge[0] + reach, minZ: hinge[2] - reach, maxZ: hinge[2] + reach };
  const owners: CollisionOwner[] = [];
  const polys: WorldPoly[] = [];
  for (const { owner, polys: own } of t.owners) {
    const { frame: _f, restFrame: _r, ...rest } = owner as CollisionOwner & { restFrame?: unknown };
    owners.push({ ...rest, path: rename(owner.path), first: -1, count: own.length, sweep });
    for (const { frame: _pf, ...poly } of own as (WorldPoly & { frame?: unknown })[]) polys.push({ ...poly, path: rename(owner.path), points: movedPoints(m, poly.points) });
  }
  const spec: DoorSpec = {
    ...t.spec, index, node: name, path: root, valve: name,
    parent: Array.from(m.clone().multiply(new Matrix4().fromArray(t.spec.parent)).elements),
    owners: owners.map((_, k) => firstOwner + k), sweep,
  };
  // The frame's own owners, still (no sweep), their paths beneath the frame's node beside the door's.
  const frameOwners: CollisionOwner[] = [];
  const framePolys: WorldPoly[] = [];
  (t.frame?.owners ?? []).forEach(({ owner, polys: own }, k) => {
    const path = `${placedFrameRoot(name)}/${k}`;
    const { frame: _f, restFrame: _r, sweep: _s, ...rest } = owner as CollisionOwner & { restFrame?: unknown };
    frameOwners.push({ ...rest, path, first: -1, count: own.length });
    for (const { frame: _pf, ...poly } of own as (WorldPoly & { frame?: unknown })[]) framePolys.push({ ...poly, path, points: movedPoints(m, poly.points) });
  });
  const action = t.action ? { ...t.action, node: name, valve: name, path: root, at: moved(m, t.action.at) } : null;
  const reveal = (t.reveal ?? []).map((r) => movedChunk(r, m, t.lib.archive, foreign, placedRevealNode(name)));
  return { spec, owners, polys, frameOwners, framePolys, reveal, props: copiedProps(t, m, root, foreign), action };
}

/** The template alone, its hinge at the origin and its own turn: what the editor draws for a placed door (`buildWorld`). */
export function doorModelMap(t: DoorTemplate): LoadedMap {
  const m = doorMove(t, [0, 0, 0], 0);
  return { ...t.lib, world: (t.reveal ?? []).map((r) => movedChunk(r, m, t.lib.archive, false, 'forge_door_reveal')), lines: null, props: copiedProps(t, m, 'forge_door', false).map(({ paths: _p, ...rest }) => rest), doors: [], turrets: [] };
}

/**
 * `map` with the layout's doors beside its own: each its template's copy, its leaf's polygons packed into the map's hull
 * after its own owners (every index the map's doors hold kept), its spec after the map's doors, its props drawn with the
 * map's, its action among the map's actions. One whose template is not found is left out and counted (`unplaced`).
 * FP-1a (Codex on #745): the snapshot carries `DOOR_GATE_WIRE_SLOTS` doors and gates (`../net/codec`), the map's own
 * first; a found one past them is left out and counted (`pastBound`) -- the room refuses a layout with any
 * (`match/src/forgeSimMap.ts` `ForgeDoorsPastWire`), the page's Check says it (`./validate`, `door-bound`).
 */
export function withPlacedDoors(map: LoadedMap, placed: readonly DoorMarker[] | undefined,
  templateOf: (source: string, name: string) => DoorTemplate | null): { map: LoadedMap; unplaced: number; pastBound: number } {
  if (!placed?.length || !map.ground) return { map, unplaced: placed?.length && !map.ground ? placed.length : 0, pastBound: 0 };
  const polys = groundPolygons(map.ground);
  const owners: CollisionOwner[] = map.ground.owners.map((o) => ({ ...o }));
  const props = [...map.props];
  const world = [...map.world];
  const doors = [...(map.doors ?? [])];
  // The composed metadata's actions where the map has them (Play's objectives write the layout's bomb sites there,
  // `./objectives` `applyForgeObjectives`), the copies' after them; `map.actions` and `meta.actions` the same list.
  const actions = [...(map.meta?.actions ?? map.actions ?? [])];
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  let unplaced = 0, pastBound = 0;
  const gates = map.gates?.length ?? 0;
  placed.forEach((marker, i) => {
    const t = templateOf(marker.source, marker.name);
    if (!t) { unplaced++; return; }
    if (doors.length + gates >= DOOR_GATE_WIRE_SLOTS) { pastBound++; return; }
    const foreign = t.lib.archive !== map.archive;
    if (foreign) {
      for (const part of t.reveal ?? []) {
        const name = part.textureName;
        if (name === null) continue;
        const key = `${t.lib.archive}/${name}`;
        if (t.lib.textures[name]) textures[key] = t.lib.textures[name]!;
        if (t.lib.textureFlags[name]) textureFlags[key] = t.lib.textureFlags[name]!;
        if (textureMips && t.lib.textureMips?.[name]) textureMips[key] = t.lib.textureMips[name]!;
      }
      for (const { prop } of [...t.pieces, ...(t.frame?.pieces ?? [])]) for (const part of prop.parts) {
        const name = part.textureName;
        if (name === null) continue;
        const key = `${t.lib.archive}/${name}`;
        if (t.lib.textures[name]) textures[key] = t.lib.textures[name]!;
        if (t.lib.textureFlags[name]) textureFlags[key] = t.lib.textureFlags[name]!;
        if (textureMips && t.lib.textureMips?.[name]) textureMips[key] = t.lib.textureMips[name]!;
      }
    }
    const copy = copiedDoor(t, doorMove(t, marker.at, marker.yaw), placedDoorName(i), doors.length, owners.length, foreign);
    for (const o of copy.owners) { o.first = polys.length; polys.push(...copy.polys.filter((p) => p.path === o.path)); owners.push(o); }
    for (const o of copy.frameOwners) { o.first = polys.length; polys.push(...copy.framePolys.filter((p) => p.path === o.path)); owners.push(o); }
    doors.push(copy.spec);
    props.push(...copy.props);
    world.push(...copy.reveal);
    if (copy.action) actions.push(copy.action);
  });
  const ground = packGround(map.ground.grid, polys, owners);
  const meta = map.meta ? { ...map.meta, actions } : map.meta;
  return {
    map: { ...map, ground, world, props, doors, actions, textures, textureFlags, ...(textureMips ? { textureMips } : {}), ...(meta ? { meta } : {}) },
    unplaced, pastBound,
  };
}
