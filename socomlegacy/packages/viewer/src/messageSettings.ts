import { pageCardTaunts, tauntTexts } from './tauntSettings';
import type { UiVarManager } from '@s2u/ui';

/**
 * Where the five team messages live (web research 302 §3): SETUP MESSAGING (`dlgSetSOP.rdr`, ONLINE OPTIONS) edits the
 * persistent (longevity 3) UI variables `MPLOCALSOP1..5`, whose defaults `dlgNetLogin`'s ONSTART sets (HudCLOC
 * 60757-60761). They are saved on the emulated memory card beside the taunts, in the `CUIVarManager` module of
 * `BASCUS-97275SOCOMII` (`./personaHost`, `CUIVarManager_Serialize`; research 102 R102.9). No key of their own: the
 * page's card is the only store (owner ruling R7). The Chat menu's MESSAGES sends them (`./matchChat`).
 */
export const MESSAGE_VARS: readonly string[] = [1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`);

/** The five as a session's variables hold them (the card's, else `dlgNetLogin`'s defaults); null for one not held. */
export function messageTexts(vars: Pick<UiVarManager, 'find'> | null): (string | null)[] {
  return tauntTexts(vars, MESSAGE_VARS);
}

/** The page's card's five, for `/testroom` (which runs no front end): slot 1's save file, else slot 2's. */
export function pageCardMessages(): (string | null)[] {
  return pageCardTaunts(MESSAGE_VARS);
}
