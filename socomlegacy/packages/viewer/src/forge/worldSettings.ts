import { SOILS } from '@s2u/scene';
import { LOADING_UIVARS } from '@s2u/ui/loading';
import type { EffectData } from '../effectData';
import type { LoadedMap } from '../loadMap';
import type { LoadingScreen } from '../loadingAssets';
import type { MatchAssets } from '../matchMount';
import { defaultMaterialIndex } from '../soundData';
import type { LayoutSettings, LoadingSetting } from './layout';

/**
 * The layout's world settings over the map's own (`@s2u/creator-contracts` `LayoutSettings`'s `defaultMaterial`,
 * `reverb`, `fov`, `loading`; the owner, 2026-11-10: "I want to be able to define every single map setting"). Each is a
 * value a disc map carries, written over at the place the port already reads it -- nothing of the game's handling of
 * any of them is changed:
 * - **the default surface** (`world_params.DefaultMaterial`, `FUN_002dc1d0` / `FUN_002ddc30`): the page's and the room's
 *   casts (`LoadedMap.grenade.defaultMaterial` -> `../net/loopback` `simMapOfLoaded`), the marks (`EffectData`) and the
 *   steps (`SoundData`), each its own index into its SOILS table, as their readers take the name;
 * - **the reverb** (`mission.rdr` `IndoorReverb` / `OutdoorReverb`, research 81 §9): `SoundData.reverb`'s zones;
 * - **the field of view** (the camera record's `m_hfov` / `m_vfov`): `LoadedMap.camera`, which Play's view and the
 *   accuracy model read (`../matchFirearm`, `../accuracy`);
 * - **the loading screen** (research 125): the screen read off the named map (`./match` `forgeLoadingScreen`), with
 *   its `mission_title` / `mission_description` UiVars the layout's.
 */

/**
 * The SOILS entries a floor may be (`@s2u/scene` `SOILS`, `materials.rdr`'s order): none of the volumes (`_VOL`, the
 * trees), the liquids, the beds under water, nor the entries no floor is -- `ACTION`, `INVISIBLE_DI`, `PERSON`, `ITEM`.
 */
const NOT_A_FLOOR = new Set(['ACTION', 'INVISIBLE_DI', 'PERSON', 'ITEM']);
export const SURFACE_CHOICES: readonly string[] = SOILS
  .filter((m) => !m.volumetric && !m.liquid && !m.underwater && !m.pickup && !NOT_A_FLOOR.has(m.name))
  .map((m) => m.name);
const SOIL_NAMES = new Set(SOILS.map((m) => m.name));

type WorldMap = Partial<Pick<LoadedMap, 'camera' | 'grenade'>>;
type WorldKeys = Pick<LayoutSettings, 'defaultMaterial' | 'fov'>;

/** The map with the layout's default surface and field of view; a surface no SOILS entry names is refused. */
export function withWorldSettings<T extends WorldMap>(map: T, s: WorldKeys): { map: T; refused: string[] } {
  const refused: string[] = [];
  let out = map;
  if (s.defaultMaterial) {
    if (!SOIL_NAMES.has(s.defaultMaterial)) refused.push(`default surface ${s.defaultMaterial}: no SOILS entry of that name`);
    else if (map.grenade) out = { ...out, grenade: { ...map.grenade, defaultMaterial: s.defaultMaterial } };
  }
  if (s.fov && map.camera) out = { ...out, camera: { ...map.camera, hfov: s.fov.h, vfov: s.fov.v } };
  return { map: out, refused };
}

type Extras = { effects: EffectData | null; sound: MatchAssets['sound'] };

/** The match's effects and sound with the layout's default surface (each table's own index) and reverb zones. */
export function withExtrasSettings<T extends Extras>(extras: T, s: Pick<LayoutSettings, 'defaultMaterial' | 'reverb'>): { extras: T } {
  const surface = s.defaultMaterial && SOIL_NAMES.has(s.defaultMaterial) ? s.defaultMaterial : null;
  if (!surface && !s.reverb) return { extras };
  const upper = surface?.toUpperCase();
  const effects = extras.effects && surface
    ? { ...extras.effects, defaultMaterial: Math.max(0, extras.effects.materials.findIndex((m) => m.toUpperCase() === upper)) }
    : extras.effects;
  const sound = extras.sound ? {
    ...extras.sound,
    data: {
      ...extras.sound.data,
      ...(surface ? { defaultMaterial: defaultMaterialIndex(extras.sound.data.materials, surface) } : {}),
      ...(s.reverb ? { reverb: { ...extras.sound.data.reverb, indoor: s.reverb.indoor.map((z) => [z[0], z[1]] as [number, number]), outdoor: s.reverb.outdoor.map((z) => [z[0], z[1]] as [number, number]) } } : {}),
    },
  } : extras.sound;
  return { extras: { ...extras, effects, sound } };
}

/** The loading screen with the layout's title and description (each null: the screen's own). */
export function withLoadingTitle(screen: LoadingScreen, l: LoadingSetting | null | undefined): LoadingScreen {
  if (!l || (l.title === null && l.description === null) || !screen.binding) return screen;
  const vars = new Map(screen.binding.vars);
  if (l.title !== null) vars.set(LOADING_UIVARS.title, l.title);
  if (l.description !== null) vars.set(LOADING_UIVARS.description, l.description);
  return {
    ...screen,
    binding: { ...screen.binding, vars, ...(l.title !== null ? { title: l.title } : {}), ...(l.description !== null ? { description: l.description } : {}) },
  };
}

/** A half-angle (radians) as the panel shows it: the full vertical angle in degrees. */
export const verticalDegrees = (v: number): number => (2 * v * 180) / Math.PI;

/**
 * The half-angles for a full vertical angle of `degrees`, the horizontal kept at the map's own frame (`tan(h) / tan(v)`
 * the map's, as the original's 640 x 448 frame keeps it), so the slider changes the zoom, not the shape.
 */
export function fovForVertical(degrees: number, own: { hfov: number; vfov: number }): { h: number; v: number } {
  const v = (degrees * Math.PI) / 360;
  const ratio = Math.tan(own.hfov) / Math.tan(own.vfov);
  return { h: Math.atan(Math.tan(v) * ratio), v };
}
