import type { Settings } from '@s2u/card';
import { pageSettings } from './pageStore';

/**
 * PSR-5 (product track, **a browser adaptation** with no original; it changes nothing the game does): the clan tag in the
 * in-play name labels -- the info box, the teammates' over-head tags, the reticle's target, the spectator's title, the
 * speaker's line and GAME COMPLETE's MVP caption (the owner's word, 2026-11-23) -- kept or dropped by this browser. The scoreboard's tag column is not a label and is not touched.
 */
export const CLAN_TAGS_ADAPTATION =
  'R4P.R11 (the owner, 2026-11-23): "clan tags dropped from name labels -- client option, off by default"; a browser adaptation, never parity. The default is r0004\'s "[TAG] name".';

export const CLAN_TAGS_KEY = 's2u.viewer.clanTagsInLabels';
export type ClanTagsInLabels = 'shown' | 'hidden';
/** The choices in the launcher row's order (Display > This browser > Clan tags in names). */
export const CLAN_TAGS_CHOICES: readonly ClanTagsInLabels[] = ['shown', 'hidden'];
export const CLAN_TAGS_WORDS: Readonly<Record<ClanTagsInLabels, string>> = { shown: 'Shown', hidden: 'Hidden' };
/** The choice unset: Shown -- r0004's "[TAG] name" (R4P.R11: off by default means the option to drop them is off). */
export const CLAN_TAGS_DEFAULT_ADAPTATION: ClanTagsInLabels = 'shown';

/** The choice this browser keeps; unset or unknown, the default. */
export function readClanTags(settings: Settings = pageSettings): ClanTagsInLabels {
  const v = settings.get(CLAN_TAGS_KEY);
  return v === 'shown' || v === 'hidden' ? v : CLAN_TAGS_DEFAULT_ADAPTATION;
}

/**
 * The labels are drawn each frame, so the page's choice is read once and kept: `saveClanTags` to the page's settings
 * updates it, so a change shows at once in this tab; a page load reads the stored key afresh.
 */
let live: ClanTagsInLabels | null = null;

export function saveClanTags(choice: ClanTagsInLabels, settings: Settings = pageSettings): void {
  settings.set(CLAN_TAGS_KEY, choice);
  if (settings === pageSettings) live = choice;
}

/** For tests: forget the kept choice, so the next label reads the stored key. */
export function resetClanTagsCache(): void { live = null; }

/** True while the labels carry the tag (the default). */
export function clanTagsShown(): boolean {
  if (live === null) {
    try { live = readClanTags(); } catch { return true; }
  }
  return live === 'shown';
}

/** The one decision point: a label's clan tag as the option leaves it -- unchanged when shown, '' when hidden. */
export function labelTag(tag: string | null | undefined): string | null | undefined {
  return clanTagsShown() ? tag : '';
}
