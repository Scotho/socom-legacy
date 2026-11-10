import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';

/**
 * SS-2 (H422 answered (a) by the owner, Craig, 2026-11-07; product track, **a browser adaptation** with no original): the
 * look of the teammates' over-head name tags -- the original's (0.9, no distance term, D:L77539, D:L77427-77433) or the
 * port's adapted ones (`./hudTags` `TEAMMATE_NAME_DISTANCE_ADAPTATION`, LATER 671, OT.R101) -- kept in this browser.
 * Whether the tags are drawn at all is the card's TEAMMATE NAMES (`DISPLAY_MP_TEAM_NAMES` 0 / 1, the original's two
 * values, VIDEO's and ONLINE OPTIONS' strips); this picks only the look. Read once at a match's mount, as the valve is.
 */
export const NAME_TAGS_KEY = 's2u.viewer.nameTags';
export type NameTagsLook = 'original' | 'modern';
/** The looks in the launcher row's order (Display > This browser > Name tags). */
export const NAME_TAGS_LOOKS: readonly NameTagsLook[] = ['original', 'modern'];
export const NAME_TAGS_WORDS: Readonly<Record<NameTagsLook, string>> = { original: 'Original', modern: 'Modern' };
/**
 * The look unset: Modern -- what TEAMMATE NAMES' On drew in v0.4.11 and v0.4.12 (LATER 671, f4f968e50: the card's 1
 * drew the adapted tags), so a player sees no change. A browser adaptation.
 */
export const NAME_TAGS_DEFAULT_ADAPTATION: NameTagsLook = 'modern';

/** The look this browser keeps; unset or unknown, the default. */
export function readNameTags(settings: Settings = pageSettings): NameTagsLook {
  const v = settings.get(NAME_TAGS_KEY);
  return v === 'original' || v === 'modern' ? v : NAME_TAGS_DEFAULT_ADAPTATION;
}

export function saveNameTags(look: NameTagsLook, settings: Settings = pageSettings): void {
  settings.set(NAME_TAGS_KEY, look);
}

/**
 * The value v0.4.11-v0.4.12's launcher wrote for its "Original" Teammate names (LATER 671) -- a value no box of the
 * original writes (VIDEO's and ONLINE OPTIONS' strips write 1 and 0, research 229 §3). Read only to move it.
 */
export const TEAM_NAMES_LEGACY_ORIGINAL_VALUE = 2;
const TEAM_NAMES_VALVE = 'DISPLAY_MP_TEAM_NAMES';

/**
 * SS-2's one-time move of a card holding TEAMMATE NAMES 2 (a browser adaptation, at the card's read: `./originalOptions`
 * `restoreValveModule`, every reader's path): the valve read as 1 (on, as the original's own `!= 0` read it, D:L77558-
 * 77559) and, where this browser has no look chosen yet, the look set to `original` -- so the player who chose Original
 * keeps it -- said once on the console (the key written, the next read finds it set). The card itself holds 1 from its
 * next save. Every other entry is returned as it came.
 */
export function migrateTeamNames(
  entries: readonly [string, number][], settings: Settings = pageSettings, log: (line: string) => void = (l) => console.info(l),
): [string, number][] {
  return entries.map(([name, value]) => {
    if (value !== TEAM_NAMES_LEGACY_ORIGINAL_VALUE || name.toUpperCase() !== TEAM_NAMES_VALVE) return [name, value];
    if (settings.get(NAME_TAGS_KEY) === null) {
      saveNameTags('original', settings);
      log(`[card] ${TEAM_NAMES_VALVE} 2 (the launcher's former "Original") read as 1; this browser's name tags set to Original (SS-2, H422)`);
    }
    return [name, 1];
  });
}
