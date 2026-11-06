import { Matrix4, Vector3 } from 'three';
import type { TurretPlacement } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import type { TurretMarker } from './layout';

/**
 * The layout's placed turrets (`Layout.turrets`; a browser adaptation, FG.R2, no original): each a copy of one of a disc
 * map's own manual turrets (`LoadedMap.turrets`, `@s2u/scene` `placeTurrets`, research 215) moved to a new place and
 * facing -- the same definition (`ai_turrets.rdr`: its weapon, limits, mount reach), the same parts and the same drawn
 * props, so the room runs it as it runs the disc's and the world turns its gun by the same paths (`WorldView.moveNode`).
 *
 * A turret's frame is its origin turned to its facing (`TurretPlacement.facing`, the port's yaw: 0 looks down -z, left
 * positive, as three's turn about y). A copy at `at` facing `yaw` moves every matrix and point of the template by
 * `P F^-1` (P the copy's frame, F the template's), and renames every path beneath the template's root to the copy's.
 * Not copied: the turret's own collision polygons, if it has any (the copy stands on the hull without them).
 */

/** One of a library map's turrets, with its drawn props, ready to copy. */
export interface TurretTemplate {
  /** The library archive's stem (`MP72`) and the turret's placed node name (`mp72_turret01`): `TurretMarker`'s. */
  source: string;
  name: string;
  lib: LoadedMap;
  placement: TurretPlacement;
  /** Each drawn placement beneath the turret's root: its prop entry and its index in that entry's matrices. */
  pieces: { prop: LoadedMap['props'][number]; index: number }[];
}

const beneath = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);

/** The library map's turrets, each with the props drawn beneath its root. */
export function turretTemplates(lib: LoadedMap, source: string): TurretTemplate[] {
  return (lib.turrets ?? []).map((placement) => {
    const pieces: TurretTemplate['pieces'] = [];
    for (const prop of lib.props) {
      (prop.paths ?? []).forEach((p, index) => { if (beneath(p, placement.root)) pieces.push({ prop, index }); });
    }
    return { source, name: placement.name, lib, placement, pieces };
  });
}

/** A turret's frame: `at`, turned `yaw` radians about y (three's turn: the port's yaw, left positive). */
export function turretFrame(at: readonly number[], yaw: number): Matrix4 {
  return new Matrix4().makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!);
}

const RAD = Math.PI / 180;
const wrapDegrees = (d: number): number => { const w = ((d + 180) % 360 + 360) % 360 - 180; return w === -180 ? 180 : w + 0; };
const moved = (m: Matrix4, p: readonly number[]): [number, number, number] => {
  const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(m);
  return [v.x, v.y, v.z];
};

/** The move from the template's own place to `at` facing `yaw` (radians): P F^-1. */
export function turretMove(t: TurretTemplate, at: readonly number[], yaw: number): Matrix4 {
  const from = turretFrame(t.placement.origin, t.placement.facing * RAD);
  return turretFrame(at, yaw).multiply(from.invert());
}

/**
 * The template's props for one copy: each of its drawn placements moved by `m`, its path renamed beneath `root`, its
 * textures renamed `<archive>/<name>` when the library is not the map it joins (`foreign`), as the composed pieces' are.
 */
function copiedProps(t: TurretTemplate, m: Matrix4, root: string, foreign: boolean): LoadedMap['props'] {
  const rename = (name: string | null): string | null => (name === null || !foreign ? name : `${t.lib.archive}/${name}`);
  return t.pieces.map(({ prop, index }) => {
    const world = new Matrix4().fromArray(Array.from(prop.matrices.subarray(index * 16, index * 16 + 16)));
    const path = prop.paths![index]!;
    return {
      modelName: prop.modelName, order: prop.order, alternate: prop.alternate, facade: prop.facade, lod: prop.lod,
      parts: prop.parts.map((part) => (foreign ? { ...part, textureName: rename(part.textureName) } : part)),
      matrices: Float32Array.from(m.clone().multiply(world).elements),
      paths: [`${root}${path.slice(t.placement.root.length)}`],
    };
  });
}

/** The copy's `TurretPlacement`: the template's moved by `m`, its parts renamed beneath `root`, facing `yaw` (radians). */
export function copiedPlacement(t: TurretTemplate, m: Matrix4, root: string, id: number, yaw: number): TurretPlacement {
  const p = t.placement;
  const under = (path: string): string => `${root}${path.slice(p.root.length)}`;
  return {
    ...p, id, root, name: root.split('/').pop()!,
    parts: { turret: under(p.parts.turret), gun: under(p.parts.gun), firepoint: under(p.parts.firepoint) },
    origin: moved(m, p.origin), gunOrigin: moved(m, p.gunOrigin), firepointOrigin: moved(m, p.firepointOrigin),
    facing: wrapDegrees(yaw / RAD),
    ...(p.firepointMatrix ? { firepointMatrix: Array.from(m.clone().multiply(new Matrix4().fromArray(p.firepointMatrix)).elements) } : {}),
  };
}

/** The template alone at its own frame's origin facing 0: what the editor draws for a placed turret (`buildWorld`). */
export function turretModelMap(t: TurretTemplate): LoadedMap {
  const m = turretMove(t, [0, 0, 0], 0);
  return { ...t.lib, world: [], lines: null, props: copiedProps(t, m, 'forge_turret', false).map(({ paths: _p, ...rest }) => rest), turrets: [] };
}

/** A placed turret's root in the match's scene: its own, beneath the world's, numbered in the layout's order. */
export const placedTurretRoot = (i: number): string => `worldmodel/forge_turret_${i + 1}`;

/**
 * `map` with the layout's turrets beside its own: each its template's copy (`templateOf` finds it by its marker's source
 * and name), its props drawn with the map's, its placement after the map's, numbered on. One whose template is not
 * found is left out and counted (`unplaced`).
 */
export function withPlacedTurrets(map: LoadedMap, placed: readonly TurretMarker[] | undefined,
  templateOf: (source: string, name: string) => TurretTemplate | null): { map: LoadedMap; unplaced: number } {
  if (!placed?.length) return { map, unplaced: 0 };
  const props = [...map.props];
  const turrets = [...(map.turrets ?? [])];
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
    const m = turretMove(t, marker.at, marker.yaw);
    const root = placedTurretRoot(i);
    props.push(...copiedProps(t, m, root, foreign));
    turrets.push(copiedPlacement(t, m, root, turrets.length, marker.yaw));
  });
  return { map: { ...map, props, turrets, textures, textureFlags, ...(textureMips ? { textureMips } : {}) }, unplaced };
}
