import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';

/**
 * LATER 1177(b) (product track, **a browser adaptation** with no original): the launcher's ambience volume -- a gain on
 * the ambience the mission's scripts start, and on nothing else: the beds and the emitters (`./audio` `GameAudio`'s
 * loops) and the scripts' one-shot layers, the gusts (the main controller's ruling, 2026-11-18). Weapons, steps, voice and
 * the ladder slide's loop stay as they are. The original has no such option: every placed sound sits under its
 * SOUND_VOLUME master and nothing is set per category (`FUN_00342670` D:L241913-241955; LATER 1177's finding X9), so 100%,
 * the default, is the original's mix byte for byte. Kept in this browser under the launcher's Audio > This browser;
 * read at each match's ambience start. The owner, Craig, 2026-11-18, relayed by the main controller (INTAKE 180),
 * verbatim: "yes, add it as a launcher option for all maps and a later item for the ingame portion (dont want to mess
 * with that ui atm)" -- the in-game settings portion is LATER 1182.
 *
 * **The floor, 50%** (product track, the owner's taste, not the original's): the owner, Craig, 2026-11-18, relayed by the
 * main controller, verbatim: "set a min volume on the ambiance to 50% that is in launcher atm". The row runs 50-100% in
 * tens; a value v0.4.26 stored below 50% (its 0-40% tens) reads as 50%; and the mixer never applies a gain below 0.5
 * (`ambienceGainOf`, and `./audio` `GameAudio` at each ambience start and `setAmbienceVolume`).
 */
export const AMBIENCE_VOLUME_ADAPTATION = "a gain on the ambience loops and gusts only, 50%-100% (the owner's floor), the original mix at 100%" as const;

export const AMBIENCE_VOLUME_KEY = 's2u.viewer.ambienceVolume';
/** The floor, percent: the owner's taste (2026-11-18), not the original's. */
export const AMBIENCE_VOLUME_MIN_ADAPTATION = 50;
/** The values in the launcher row's order: percent, in tens, from the floor. */
export const AMBIENCE_VOLUME_VALUES: readonly number[] = [50, 60, 70, 80, 90, 100];
/** What v0.4.26 could store below the floor (its row ran 0-100% in tens): read as the floor. */
const BELOW_FLOOR_STORED: readonly string[] = ['0', '10', '20', '30', '40'];
/** Unset: 100% -- the original's mix (gain 1). A browser adaptation. */
export const AMBIENCE_VOLUME_DEFAULT_ADAPTATION = 100;

/**
 * The percent this browser keeps, stored as its decimal string (`Settings` keeps strings: "50"); one of v0.4.26's values
 * below the floor ("0".."40"), the floor; unset, or anything else not written as `saveAmbienceVolume` writes it, the default.
 */
export function readAmbienceVolume(settings: Settings = pageSettings): number {
  const v = settings.get(AMBIENCE_VOLUME_KEY);
  if (typeof v === 'string' && BELOW_FLOOR_STORED.includes(v)) return AMBIENCE_VOLUME_MIN_ADAPTATION;
  const n = AMBIENCE_VOLUME_VALUES.find((p) => String(p) === v);
  return n ?? AMBIENCE_VOLUME_DEFAULT_ADAPTATION;
}

export function saveAmbienceVolume(percent: number, settings: Settings = pageSettings): void {
  settings.set(AMBIENCE_VOLUME_KEY, String(percent));
}

/** The lowest gain the mixer applies: the floor's (the owner's taste). */
export const AMBIENCE_GAIN_FLOOR_ADAPTATION = AMBIENCE_VOLUME_MIN_ADAPTATION / 100;

/** A linear gain held at the floor: never below 0.5 (anything not a number above it, the floor). */
export function flooredAmbienceGain(gain: number): number {
  return gain > AMBIENCE_GAIN_FLOOR_ADAPTATION ? gain : AMBIENCE_GAIN_FLOOR_ADAPTATION;
}

/** A percent as the linear gain the ambience plays at (amplitude: 50% is half), never below the floor. */
export function ambienceGainOf(percent: number): number {
  return flooredAmbienceGain(percent / 100);
}
