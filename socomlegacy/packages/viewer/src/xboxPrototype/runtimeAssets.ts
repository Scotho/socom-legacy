import type { LoadedBody } from '../body';
import type { LoadedMap } from '../loadMap';
import type { WeaponPoint } from '@s2u/scene';

/** CPU simulation ownership after GPU upload. Never pass the decoded graphics
 * container into frame/input/audio closures: that keeps every upload source alive.
 * Borrow only collision, animation rig and loadout data the walking runtime needs.
 */
export type WalkingMap = Pick<LoadedMap, 'ground' | 'origin' | 'metersPerUnit' | 'camera' | 'arsenal' | 'doors' | 'gates' | 'meta' | 'night'> & {
  weaponPoints?: Readonly<Record<string, readonly WeaponPoint[]>>;
  defaultMaterial?: string;
  /** Only identifies controls whose crane presentation is still unmounted. */
  craneValves?: readonly string[];
  /** The throwables' model names the renderer uploaded (`./model`), for `./walkingGrenades`' placements. */
  throwableModels?: readonly string[];
  /** The uploaded model's index for each side's character types (`typedModels`), by the type's number; absent, the side's first for all. */
  typeModels?: { readonly seal: readonly number[]; readonly terrorist: readonly number[] };
};
export type BodyRig = Pick<LoadedBody, 'model' | 'parts' | 'at' | 'height' | 'carries'> & {
  fittings: Pick<LoadedBody['fittings'][number], 'name' | 'model' | 'part' | 'offset'>[];
};

/**
 * The bodies a match draws, each once: the SEAL's and the Terrorist's first (indices 0 and 1, as before), then each
 * side's other character types the map decoded (`LoadedMap.types`, the ARMORY's columns: protocol 9's `char`), and for
 * each side the uploaded index by type. A type the map did not decode, or one over the renderer's bone limit, reads as
 * its side's first. The regional appearances (`LoadedMap.characters`) are not drawn.
 */
export function typedModels(map: LoadedMap, boneLimit: number): { models: LoadedBody[]; types: { seal: number[]; terrorist: number[] } } {
  const models: LoadedBody[] = map.terrorist ? [map.body!, map.terrorist] : [map.body!];
  const index = (body: LoadedBody | null | undefined, fallback: number): number => {
    if (!body || body.parts.length > boneLimit) return fallback;
    const held = models.indexOf(body);
    return held >= 0 ? held : models.push(body) - 1;
  };
  const other = map.terrorist ? 1 : 0;
  return { models, types: { seal: (map.types?.seal ?? []).map(body => index(body, 0)), terrorist: (map.types?.terrorist ?? []).map(body => index(body, other)) } };
}

export function walkingAssets(map: LoadedMap, models: readonly LoadedBody[], typeModels?: WalkingMap['typeModels']): { map: WalkingMap; models: BodyRig[] } {
  const { ground, origin, metersPerUnit, camera, arsenal, doors, gates, night } = map;
  const meta = map.meta ? { stem: map.meta.stem, actions: map.meta.actions, instances: map.meta.instances,
    instanceByPath: map.meta.instanceByPath, initial: map.meta.initial, diagnostics: [], scene: map.meta.scene,
    autostart: map.meta.autostart, worlds: map.meta.worlds, motion: map.meta.motion, fireNodes: map.meta.fireNodes } : undefined;
  const weaponPoints = Object.fromEntries(Object.entries(map.weapons ?? {}).map(([name, weapon]) => [name, weapon.points]));
  return { map: { ground, origin, metersPerUnit, camera, arsenal, doors, gates, meta, night, weaponPoints, defaultMaterial: map.grenade?.defaultMaterial,
      craneValves: map.cranes?.map(crane => crane.control.valve), throwableModels: map.grenade?.models.map(model => model.name) ?? [], ...(typeModels ? { typeModels } : {}) },
    models: models.map(({ model, parts, at, height, carries, fittings }) => ({ model, parts, at, height, carries,
      fittings: fittings.map(({ name, model, part, offset }) => ({ name, model, part, offset })) })) };
}
