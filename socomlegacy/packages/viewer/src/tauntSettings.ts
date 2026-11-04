import { Libmc, PersonaCard, UI_VAR_MODULE } from '@s2u/card';
import type { UiVarManager } from '@s2u/ui';
import { pageCard } from './pageStore';
import { TAUNT_SLOTS } from './taunts';

/**
 * Where the five custom taunts live (web research 301 §6): the persistent (longevity 3) UI variables `MPTAUNTMSG1..5`,
 * saved on the emulated memory card in the `CUIVarManager` module of `BASCUS-97275SOCOMII` (`./personaHost`, the
 * original's `CUIVarManager_Serialize`; research 102 R102.9), shared by every persona on that card. No key of their own:
 * the page's card is the only store (owner ruling R7).
 */
export const TAUNT_VARS: readonly string[] = Array.from({ length: TAUNT_SLOTS }, (_, i) => `MPTAUNTMSG${i + 1}`);

/** A string var's value, else null. */
function stringOf(v: unknown): string | null {
  return typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'string' && typeof (v as { value?: unknown }).value === 'string'
    ? (v as { value: string }).value : null;
}

/**
 * The five as a session's variables hold them (the card's, else `dlgNetLogin`'s defaults); null for one not held.
 * `names`: the five variables (`TAUNT_VARS`; SETUP MESSAGING's `MPLOCALSOP1..5`, `./messageSettings`).
 */
export function tauntTexts(vars: Pick<UiVarManager, 'find'> | null, names: readonly string[] = TAUNT_VARS): (string | null)[] {
  return names.map((name) => stringOf(vars?.find(name)?.value));
}

/** The five as a card's `CUIVarManager` part holds them (`PersonaCard.part`); null for one it does not. */
export function cardTauntTexts(part: unknown, names: readonly string[] = TAUNT_VARS): (string | null)[] {
  const module = typeof part === 'object' && part !== null && !Array.isArray(part) ? part as Record<string, unknown> : {};
  return names.map((name) => stringOf(module[name]));
}

/**
 * The page's card's five, for `/testroom` (which runs no front end): the save file of slot 1, else slot 2 -- the
 * front end's `PERSONA_LOAD_ADAPTATION` -- read through libmc as `PersonaCard.load` reads it. Nulls with no card or no file.
 */
export function readCardTaunts(libmc: Libmc | null, names: readonly string[] = TAUNT_VARS): (string | null)[] {
  if (!libmc) return cardTauntTexts(undefined, names);
  for (const port of [0, 1] as const) {
    const card = new PersonaCard(libmc, port);
    if (card.load().result >= 0) return cardTauntTexts(card.part(UI_VAR_MODULE), names);
  }
  return cardTauntTexts(undefined, names);
}

/** `readCardTaunts` over the page's own card (`./pageStore` `pageCard`): `/testroom`'s five. */
export function pageCardTaunts(names: readonly string[] = TAUNT_VARS): (string | null)[] {
  return readCardTaunts(new Libmc(pageCard, { log: () => {} }), names);   // a missing file's FAILED line is no news here
}

/**
 * HudCLOC's key in a variable (`_60762_ThisBulletMightSting_MSG`): what `dlgNetLogin`'s ONSTART writes and what the
 * game-written cards hold until a taunt is edited (`one.bin`, `two.bin`: web research 301 §6). The id, or null.
 */
export function locKeyId(value: string): number | null {
  const m = /^_(\d+)_\w*_MSG$/.exec(value);
  return m ? Number(m[1]) : null;
}

/**
 * A slot's text for the match: the variable's -- a HudCLOC key resolved to its caption (`captions` by id) -- else the
 * disc's default (`TauntData.defaults`). The key is resolved on the
 * sender, so the room carries text; where the original resolves it was not traced (web research 301 §10).
 */
export function tauntText(value: string | null, captions: Readonly<Record<string, string>>, fallback: string): string {
  if (value === null) return fallback;
  const id = locKeyId(value);
  return id === null ? value : captions[String(id)] ?? fallback;
}
