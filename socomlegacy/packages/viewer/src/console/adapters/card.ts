import type { CardSlots } from '@s2u/card';
import { pageCard } from '../../pageStore';
import { cardProfileEdits } from '../../modern/profile/cardEdits';
import type { Adapters } from '../state';

/**
 * The console launcher's memory card (slice 2, part d): the slot and the personas as the page's card readers read them
 * -- `../../modern/profile/cardEdits` `cardProfileEdits`, the reader Home's card (`../../modern/home` `readPageCard`)
 * and the profile use: the persona form's file, slot 1's else slot 2's; a card with no file yet reads as slot 1, empty
 * (the original's first SaveConfig makes it there); a malformed file or a failing card does not read. The two virtual
 * slots are the page's (`pageCard`, `s2u.card.v1.slot1/2` on localStorage). Read once and held until `reload` (another
 * writer saved). The persona names are the card's, never invented. A browser adaptation with no original (OT.R28).
 */
export type LiveCard = Adapters['card'] & { names(): readonly string[]; readable(): boolean; reload(): void };

export interface CardDeps {
  /** The card's slots; absent, the page's. */
  slots?: CardSlots;
}

interface Reading { readable: boolean; slot: number | null; names: string[] }

export function liveCard(deps: CardDeps = {}): LiveCard {
  let held: Reading | null = null;
  const read = (): Reading => {
    if (held) return held;
    const card = cardProfileEdits(deps.slots ?? pageCard);
    const readable = card.usable();
    held = { readable, slot: readable ? card.slot() : null, names: readable ? card.personas().map((p) => p.NAME) : [] };
    return held;
  };
  return {
    readable: () => read().readable,
    slot: () => read().slot ?? 0,
    personas: () => read().names.length,
    persona: () => read().names[0] ?? '',
    names: () => read().names,
    reload(): void { held = null; },
  };
}
