import { readPreference, savePreference } from './startupSettings';

/**
 * **The detail distance -- a browser adaptation, no original** (ruling PF.R60; the owner, Craig, 2026-10-27, on the
 * Forge's Frostfire floor losing its detail layer beyond ~300 units: "it appears to be a detail textures issue at a certain
 * distance. I'd like to roughly double it", then "please make this a slider, and for modern mode, double the default. ps2
 * mode keeps the original.").
 *
 * What the original does is untouched: PF-30's per-visual gate (ruling PF.R50; `FUN_003374c0` D:L235405-235418,
 * `DETAIL_SWITCH_READING`) switches a visual's detail pass on when its centroid's range², over the magnification, is `<=`
 * the visual's range off the disc (`detail_buff`, already squared: a_floor 90,000, floor_oilgrime's 250,000) -- those
 * ranges stay the reading. This factor is a distance multiplier laid on top: the world view multiplies each visual's range
 * by factor² (`WorldView.setDetailDistance`, `./world`), so 2 reaches twice as far.
 *
 * - The PS2 picture keeps the original: its factor is 1 whatever is stored (`detailDistanceFor`).
 * - Modern and Experimental take the stored factor, by default `DETAIL_DISTANCE_MODERN_DEFAULT` (2); under Experimental
 *   its own "Distance" (`./experimentalGraphics` `detailRange`, default 1.6) stacks on top: 2 x 1.6 = 3.2 by default there.
 * - The slider's range, 1.0 to 4.0 by 0.1 (1 = the original), is this adaptation's own choice; nothing in the original sets it.
 *
 * One stored setting (`DETAIL_DISTANCE_KEY`, through the page's one storage door) read by the front end's launcher Options
 * (`./console/adapters/options`), its match (`./matchMount`), the Forge's View panel and menu (`./forge/page`) and the
 * test room (`./main`).
 */
export const DETAIL_DISTANCE_ADAPTATION = 'PF.R60: a detail distance factor over the original per-visual detail gate (PF.R50)' as const;
/** The page key: one value for the front end and the Forge. */
export const DETAIL_DISTANCE_KEY = 's2u.viewer.detailDistance';
/** Modern's (and Experimental's) default: double the original's distance -- the owner's "for modern mode, double the default". */
export const DETAIL_DISTANCE_MODERN_DEFAULT = 2;
/** The slider's bounds and step: the adaptation's own choice (1 = the original), no original. */
export const DETAIL_DISTANCE_MIN = 1;
export const DETAIL_DISTANCE_MAX = 4;
export const DETAIL_DISTANCE_STEP = 0.1;

/** The picture a factor is resolved under (`@s2u/ui` `VideoPicture`'s words, named here so `./matchMount` imports nothing of `@s2u/ui`). */
export type DetailDistancePicture = 'modern' | 'ps2' | 'experimental';

const TENTHS_MIN = Math.round(DETAIL_DISTANCE_MIN / DETAIL_DISTANCE_STEP);
const TENTHS_MAX = Math.round(DETAIL_DISTANCE_MAX / DETAIL_DISTANCE_STEP);

/** Into [1, 4] on the 0.1 grid; a value that is not a finite number reads the Modern default. */
export function clampDetailDistance(v: number): number {
  if (!Number.isFinite(v)) return DETAIL_DISTANCE_MODERN_DEFAULT;
  return Math.max(TENTHS_MIN, Math.min(TENTHS_MAX, Math.round(v / DETAIL_DISTANCE_STEP))) / 10;
}

/** The factor the world draws with: 1 (the original) under the PS2 picture, else the stored one. */
export function detailDistanceFor(picture: DetailDistancePicture, stored: number): number {
  return picture === 'ps2' ? 1 : clampDetailDistance(stored);
}

/** The slider's words, '1.0×' .. '4.0×' (31). */
export const formatDetailDistance = (v: number): string => `${clampDetailDistance(v).toFixed(1)}×`;
export const DETAIL_DISTANCE_VALUES: readonly string[] = Array.from({ length: TENTHS_MAX - TENTHS_MIN + 1 }, (_, i) => formatDetailDistance((TENTHS_MIN + i) / 10));
/** A factor's index in `DETAIL_DISTANCE_VALUES`, and back. */
export const detailDistanceIndex = (v: number): number => Math.round(clampDetailDistance(v) * 10) - TENTHS_MIN;
export const detailDistanceOfIndex = (i: number): number => clampDetailDistance((TENTHS_MIN + i) / 10);

/** The stored factor: nothing stored, or garbage, reads the Modern default; a stored value out of range clamps. */
export function readDetailDistance(read: (key: string) => string | null = readPreference): number {
  const raw = read(DETAIL_DISTANCE_KEY);
  return raw === null || raw.trim() === '' ? DETAIL_DISTANCE_MODERN_DEFAULT : clampDetailDistance(Number(raw));
}

/** Every keeper of this page hears a change made through any other (the Forge's row, the launcher's). */
const pageHeard = new Set<(v: number) => void>();

/** The stored factor, set (clamped, stored, heard) and stepped by the slider's 0.1. */
export function detailDistanceKeeper(read: (key: string) => string | null = readPreference, write: (key: string, value: string) => void = savePreference) {
  const heard = new Set<(v: number) => void>();
  const shared = read === readPreference;
  let value = readDetailDistance(read);
  const keeper = {
    get: (): number => (shared ? readDetailDistance(read) : value),
    set(v: number): void {
      const to = clampDetailDistance(v);
      if (to === keeper.get()) return;
      value = to;
      write(DETAIL_DISTANCE_KEY, String(to));
      for (const f of [...(shared ? pageHeard : heard)]) f(to);
    },
    step(d: -1 | 1): void { keeper.set(keeper.get() + d * DETAIL_DISTANCE_STEP); },
    /** Called at each change; the returned function stops it. */
    observe(f: (v: number) => void): () => void {
      const set = shared ? pageHeard : heard;
      set.add(f);
      return () => { set.delete(f); };
    },
  };
  return keeper;
}
export type DetailDistanceKeeper = ReturnType<typeof detailDistanceKeeper>;
