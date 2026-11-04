/**
 * FORGE: the layout opened at load, and whether the earlier autosave may be written over (#348's re-review). A browser
 * adaptation with no original.
 *
 * `first` is what the load found -- a share link's layout (`shared`) or, without one, the autosave -- and whether this
 * disc holds its base (`held`; a blank floor always is). `earlier` is the autosave the load found beside a share.
 * - `first` held: it opens.
 * - A share this disc cannot open: the earlier layout opens instead when this disc holds it.
 * - Neither opens here: a fallback map opens, and when the earlier autosave has work it is kept (`keepEarlier`) until
 *   the player edits -- a fallback's own autosave would otherwise replace it.
 */
import type { Layout } from './layout';
import { autosaveUnreadable, savedLayoutHasWork } from './record';
import { layoutOfAuthoring, readForgeAuthoring } from './rulesAuthoring';
import { AUTOSAVE_NAME } from './saves';

export type Held = 'none' | 'held' | 'unheld';

export interface BootChoice {
  open: 'first' | 'earlier' | 'fallback';
  keepEarlier: boolean;
}

export function bootChoice(o: { first: Held; shared: boolean; earlier: Held; earlierHasWork: boolean }): BootChoice {
  if (o.first === 'held') return { open: 'first', keepEarlier: false };
  if (o.first === 'none') return { open: 'fallback', keepEarlier: false };
  if (o.shared && o.earlier === 'held') return { open: 'earlier', keepEarlier: false };
  return { open: 'fallback', keepEarlier: o.earlier !== 'none' && o.earlierHasWork };
}

export interface JoinerReturn {
  /** The joiner's own layout, to open again; null when there is none, it cannot be read, or this disc lacks its base. */
  open: Layout | null;
  /** The autosave is kept until the player edits (the page's `keepEarlier`): the host's layout stays open over it. */
  keepEarlier: boolean;
  /** An autosave this build cannot read, set aside now or already (`setAsideAutosave`). */
  aside: boolean;
  /** One it could not set aside (the list full, a refused write): held in place. */
  held: boolean;
  /** Its own layout read, on a base this disc does not hold. */
  unheld: boolean;
}

/**
 * LATER 215: a lobby joiner back from the lobby (`./page` `ownLayoutBack`). The join opened the host's layout with the
 * autosave off; back here the autosave comes on again, so an own autosave the page does not open would be replaced by
 * the host's layout's next write (a camera move, an edit). `text` is the autosave as kept, `holds` whether this disc
 * holds a layout's base. The load's rules, here too: an autosave this build cannot read is set aside first (LATER 193,
 * `setAsideAutosave`) or, refused, held in place; one with work this disc cannot open is kept until the player edits
 * (#348's re-review, `bootChoice`'s `keepEarlier`). R3-B (FCW-07a part 2): `setAside` is the page's -- `setAsideAutosave`
 * on its lists, written through the saves store and awaited; true when the text is kept aside.
 */
export async function ownLayoutOnReturn(text: string | null, holds: (l: Layout) => boolean, setAside: (text: string) => Promise<boolean>): Promise<JoinerReturn> {
  const unreadable = autosaveUnreadable(text);
  const aside = unreadable && await setAside(text!);
  const held = unreadable && !aside;
  let own: Layout | null = null;
  // FCW-32: an autosave of a layout with rules opens with them (`./rulesAuthoring` `readForgeAuthoring`)
  if (text && !unreadable) { try { own = layoutOfAuthoring(readForgeAuthoring(text, AUTOSAVE_NAME)); } catch { own = null; } }
  if (own && holds(own)) return { open: own, keepEarlier: false, aside, held, unheld: false };
  return { open: null, keepEarlier: held || (!!text && !aside && savedLayoutHasWork(text)), aside, held, unheld: !!own };
}
