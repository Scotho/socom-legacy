import { DEFAULT_LIGHTING } from '../lighting';
import type { FogSettings } from '../fog';
import type { LoopbackOptions } from '../net/loopback';
import { DEFAULT_SETTINGS, NPC_BEHAVIOURS, SETTINGS_BOUNDS, type LayoutSettings, type NpcBehaviour } from './layout';

/**
 * FORGE (FG-24, FG.R18; the owner, 2026-10-14: "a map settings that includes day/night slider, fog distance slider, max
 * players (up to 32 max), and anything else in that vain"): what the layout's settings (`./layout` `LayoutSettings`) do
 * to the editor's light and fog, to Play's composed map (`./matchMap` `withSettings`) and to the page's room. A browser
 * adaptation with no original: at the disc's values (`DEFAULT_SETTINGS`) each of these is the identity, and none of
 * them is a new behaviour of the game's -- the light is the brighten uniform's own factor (`../lighting` `brightenOf`),
 * the fog the fog's own uniforms (`../fog`), and the room's options the room's own (`RoomOptions`).
 */

/**
 * The day / night slider's floor (an adaptation, no original): at `light` 0 the frame is this fraction of the disc's
 * light -- a night, dark but still read, never the black the brighten uniform would reach at a factor of 0.
 */
export const LIGHT_FLOOR = 0.1;

/** The factor `light` puts on the disc's light: LIGHT_FLOOR at 0, 1 at 1, a straight line between. */
export const lightGain = (light: number): number => (light >= 1 ? 1 : LIGHT_FLOOR + (1 - LIGHT_FLOOR) * Math.max(0, light));

/**
 * The brighten (`Lighting.brighten`, the pass's `FIX`) whose factor `1 + FIX / 128` (`brightenOf`) is the disc's
 * (`disc`) times `lightGain(light)`: below the disc's light it goes negative, which the uniform takes as a dimming.
 */
export const brightenFor = (disc: number, light: number): number => {
  const gain = lightGain(light);
  return gain === 1 ? disc : 128 * ((1 + disc / 128) * gain - 1);
};

/**
 * The match's brighten for the layout's light (`../matchMount` `MatchMountOptions.brighten`): the editor's dimming over
 * the match's own (`DEFAULT_LIGHTING`, no brighten) -- so Play dims everything as the editor does. Undefined at the
 * disc's light: the match mounts as it always has.
 */
export const matchBrightenOf = (s: Pick<LayoutSettings, 'light'> & Partial<Pick<LayoutSettings, 'timeOfDay'>>): number | undefined =>
  (s.timeOfDay != null || lightGain(s.light) === 1 ? undefined : brightenFor(DEFAULT_LIGHTING.brighten, s.light));

/** `../fog` `fogForExtent`'s near and far over the extent: the ratio a fog with no span of its own takes. */
const EXTENT_RATIO = 0.35 / 0.95;

/** The near a fog of far distance `far` takes: the disc's own near-to-far ratio, else `fogForExtent`'s. */
export function nearFor(discNear: number, discFar: number, far: number): number {
  const ratio = discFar > 0 && discNear >= 0 && discNear < discFar ? discNear / discFar : EXTENT_RATIO;
  return Math.round(far * ratio);
}

/**
 * The fog with the layout's far distance: `fogFar` null, the disc's (a copy); else its far there, its near at the disc's
 * ratio to it, and on (a distance set is a fog to see; the two maps whose disc fog is off, MP51 and MP81, `CameraParams`,
 * get one only when the slider is moved). Colour and altitude band stay the disc's.
 */
export function fogWithFar(disc: FogSettings, fogFar: number | null): FogSettings {
  const out: FogSettings = { ...disc, color: [...disc.color], altitude: disc.altitude ? { ...disc.altitude } : null };
  if (fogFar === null) return out;
  return { ...out, enabled: true, near: nearFor(disc.near, disc.far, fogFar), far: fogFar };
}

/** The fog slider's steps (an adaptation): `fogFar`'s bounds on a log scale, three decades in this many. */
export const FOG_SLIDER_STEPS = 1000;
const FOG = SETTINGS_BOUNDS.fogFar;
const snapFog = (v: number): number => Math.min(FOG.max, Math.max(FOG.min, Math.round(v / FOG.step) * FOG.step));

/** The far distance at slider position `t` (0..FOG_SLIDER_STEPS), in whole steps of the bound. */
export const fogOfSlider = (t: number): number => snapFog(FOG.min * (FOG.max / FOG.min) ** (Math.min(FOG_SLIDER_STEPS, Math.max(0, t)) / FOG_SLIDER_STEPS));

/** The slider position of far distance `far`. */
export const sliderOfFog = (far: number): number =>
  Math.round((Math.log(Math.min(FOG.max, Math.max(FOG.min, far)) / FOG.min) / Math.log(FOG.max / FOG.min)) * FOG_SLIDER_STEPS);

/** The numeric settings a field or a pad row edits. */
export type NumericSetting = keyof typeof SETTINGS_BOUNDS;

/** A typed value held to its field's bounds and snapped to its step from the least (players even, light by 0.05). */
export function boundSetting(key: NumericSetting, v: number): number {
  const b = SETTINGS_BOUNDS[key];
  if (!Number.isFinite(v)) return b.min;
  const steps = Math.round((Math.min(b.max, Math.max(b.min, v)) - b.min) / b.step);
  const out = Math.min(b.max, b.min + steps * b.step);
  return Number(out.toFixed(4));                                       // 0.05's float error off the light's steps
}

/** The pad's fog step (an adaptation): a quarter more or less of the distance, from the map's own when unset. */
export const FOG_STEP_RATIO = 1.25;

/**
 * One pad step of `key` by `dir` (left -1, right 1), held at its bounds; the fog from `discFar` (the map's own
 * distance) when the layout names none, and always a move of at least one step; friendly fire toggled either way.
 */
export function stepSetting(s: LayoutSettings, key: NumericSetting | 'friendlyFire' | 'npcBehaviour', dir: 1 | -1, discFar: number): LayoutSettings {
  if (key === 'timeOfDay') return timeSetting(s, boundSetting('timeOfDay', (s.timeOfDay ?? 1) + dir * SETTINGS_BOUNDS.timeOfDay.step));
  if (key === 'friendlyFire') return { ...s, friendlyFire: !s.friendlyFire };
  if (key === 'npcBehaviour') {                                      // NPB-6: through the words, wrapping either way
    const at = NPC_BEHAVIOURS.indexOf(s.npcBehaviour);
    return { ...s, npcBehaviour: NPC_BEHAVIOURS[(at + dir + NPC_BEHAVIOURS.length) % NPC_BEHAVIOURS.length]! };
  }
  if (key === 'fogFar') {
    const from = s.fogFar ?? snapFog(discFar);
    let next = snapFog(dir > 0 ? from * FOG_STEP_RATIO : from / FOG_STEP_RATIO);
    if (next === from) next = snapFog(from + dir * FOG.step);
    return { ...s, fogFar: next };
  }
  const out = { ...s };
  out[key] = boundSetting(key, s[key] + dir * SETTINGS_BOUNDS[key].step);
  return out;
}

/** NPB-6: the words the panel and the pad show for each NPC behaviour (an adaptation, no original). */
export const NPC_BEHAVIOUR_LABEL: Readonly<Record<NpcBehaviour, string>> = Object.freeze({
  sentry: 'Sentries (hold position)', patrol: 'Patrol (the bots’ brain)',
});

/** The settings as the layout keeps them: only the fields that differ from the disc's values. */
export function settingsDelta(s: LayoutSettings): Partial<LayoutSettings> {
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof LayoutSettings)[];
  const out = Object.fromEntries(keys.filter((k) => s[k] !== DEFAULT_SETTINGS[k]).map((k) => [k, s[k]])) as Partial<LayoutSettings>;
  // A new empty map's own light rig (no default of the disc's to differ from): kept whenever it is set.
  if (s.lightRig) out.lightRig = s.lightRig;
  if (s.fogColor) out.fogColor = s.fogColor;                 // its fog colour and shadow direction likewise
  if (s.shadowVector) out.shadowVector = s.shadowVector;
  if (s.skyFrom) out.skyFrom = s.skyFrom;
  if (s.fog) out.fog = s.fog;
  if (s.night) out.night = s.night;
  return out;
}

/**
 * The page's room's options from the settings: the room's own (`RoomOptions.maxRounds`, `roundSeconds`,
 * `allowFriendlyFire`, `maxPlayers`), passed through -- at the disc's values the room's own defaults (11 rounds, 6
 * minutes, no friendly fire, 16 players). Above 16 players this page's own Play room's sides still hold 8 each
 * (`../net/lobby` `TEAM_SIZE`); a forge lobby's room on the match server seats them all, half a side (FG-29's team
 * size, the server's `forgeLobby.ts`), with the start points for them (FG-37, `forgeSimMap.ts`).
 */
export const roomOptionsOf = (s: LayoutSettings): Pick<LoopbackOptions, 'maxRounds' | 'roundSeconds' | 'allowFriendlyFire' | 'maxPlayers'> => ({
  maxRounds: s.rounds, roundSeconds: s.roundSeconds, allowFriendlyFire: s.friendlyFire, maxPlayers: s.players,
});

/** Saved Forge adaptation: a new time edit always removes the legacy dimmer. */
export const timeSetting = (s: LayoutSettings, timeOfDay: number | null): LayoutSettings => ({ ...s, timeOfDay, light: 1 });
export const lightingLabel = (s: LayoutSettings): string => s.timeOfDay !== null ? `${Math.round(s.timeOfDay * 100)}%` : s.light < 1 ? `${Math.round(s.light * 100)}% · legacy brightness` : 'Original';
