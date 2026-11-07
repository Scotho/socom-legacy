import { Matrix4, Vector3 } from 'three';
import type { CollisionOwner, Footprint, WorldPoly } from '@s2u/scene';
import type { DoorSpec } from '../doors';
import type { LoadedMap } from '../loadMap';
import type { MapAction } from '../mapActions';
import { groundPolygons, packGround } from '../mover';
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
}

const beneath = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);

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
    for (const prop of lib.props) (prop.paths ?? []).forEach((p, index) => { if (beneath(p, spec.path)) pieces.push({ prop, index }); });
    const owners = spec.owners.flatMap((i) => {
      const owner = lib.ground?.owners[i];
      return owner ? [{ owner, polys: polys.slice(owner.first, owner.first + owner.count) }] : [];
    });
    const action = (lib.actions ?? []).find((a) => a.typeCode === 0 && a.node.toLowerCase() === spec.node.toLowerCase()) ?? null;
    return { source, name: spec.node, lib, spec, pieces, owners, action };
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

/** A placed door's node in the match's scene: its own, beneath the world's, numbered in the layout's order. */
export const placedDoorName = (i: number): string => `forge_door_${i + 1}`;

/** The template's props for one copy: moved by `m`, renamed beneath `root`, their textures `<archive>/<name>` when `foreign`. */
function copiedProps(t: DoorTemplate, m: Matrix4, root: string, foreign: boolean): LoadedMap['props'] {
  return t.pieces.map(({ prop, index }) => {
    const world = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    return {
      modelName: prop.modelName, order: prop.order, alternate: prop.alternate, facade: prop.facade, lod: prop.lod,
      parts: prop.parts.map((part) => (foreign && part.textureName !== null ? { ...part, textureName: `${t.lib.archive}/${part.textureName}` } : part)),
      matrices: Float32Array.from(m.clone().multiply(world).elements),
      paths: [`${root}${prop.paths![index]!.slice(t.spec.path.length)}`],
    };
  });
}

/**
 * One copy: its `DoorSpec` (numbered `index`, its owners from `firstOwner` on), its leaf's owners and polygons (their
 * paths beneath `root`, their footprint the hinge's moved, the reach the same), its props and its action.
 */
export function copiedDoor(t: DoorTemplate, m: Matrix4, name: string, index: number, firstOwner: number, foreign = false):
  { spec: DoorSpec; owners: CollisionOwner[]; polys: WorldPoly[]; props: LoadedMap['props']; action: MapAction | null } {
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
  const action = t.action ? { ...t.action, node: name, valve: name, path: root, at: moved(m, t.action.at) } : null;
  return { spec, owners, polys, props: copiedProps(t, m, root, foreign), action };
}

/** The template alone, its hinge at the origin and its own turn: what the editor draws for a placed door (`buildWorld`). */
export function doorModelMap(t: DoorTemplate): LoadedMap {
  const m = doorMove(t, [0, 0, 0], 0);
  return { ...t.lib, world: [], lines: null, props: copiedProps(t, m, 'forge_door', false).map(({ paths: _p, ...rest }) => rest), doors: [], turrets: [] };
}

/**
 * `map` with the layout's doors beside its own: each its template's copy, its leaf's polygons packed into the map's hull
 * after its own owners (every index the map's doors hold kept), its spec after the map's doors, its props drawn with the
 * map's, its action among the map's actions. One whose template is not found is left out and counted (`unplaced`).
 */
export function withPlacedDoors(map: LoadedMap, placed: readonly DoorMarker[] | undefined,
  templateOf: (source: string, name: string) => DoorTemplate | null): { map: LoadedMap; unplaced: number } {
  if (!placed?.length || !map.ground) return { map, unplaced: placed?.length && !map.ground ? placed.length : 0 };
  const polys = groundPolygons(map.ground);
  const owners: CollisionOwner[] = map.ground.owners.map((o) => ({ ...o }));
  const props = [...map.props];
  const doors = [...(map.doors ?? [])];
  const actions = [...(map.actions ?? [])];
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  let unplaced = 0;
  placed.forEach((marker, i) => {
    const t = templateOf(marker.source, marker.name);
    if (!t) { unplaced++; return; }
    const foreign = t.lib.archive !== map.archive;
    if (foreign) {
      for (const { prop } of t.pieces) for (const part of prop.parts) {
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
    doors.push(copy.spec);
    props.push(...copy.props);
    if (copy.action) actions.push(copy.action);
  });
  const ground = packGround(map.ground.grid, polys, owners);
  const meta = map.meta ? { ...map.meta, actions: [...map.meta.actions, ...actions.slice((map.actions ?? []).length)] } : map.meta;
  return {
    map: { ...map, ground, props, doors, actions, textures, textureFlags, ...(textureMips ? { textureMips } : {}), ...(meta ? { meta } : {}) },
    unplaced,
  };
}
