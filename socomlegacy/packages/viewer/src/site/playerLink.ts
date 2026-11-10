/**
 * LCM-12 (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R10, the owner: "make all player
 * names clickable in our subviews that takes you to a /player/name page"): the one helper every site page draws a
 * player's name with -- the match page (`../matchPage.ts` `playerName`), the leaderboard
 * (`../leaderboard/leaderboardPage.ts` `playerName`) and the player page (`../playerPage.ts`).
 *
 * Product track (OT.R53): a browser adaptation with no original -- the game has no web pages. The segment is the site
 * table's (`@s2u/ui` `PLAYER_PAGE_SEGMENT`, held equal by `test/playerLink.test.ts`), written here so the leaderboard's
 * own document does not load the whole `@s2u/ui` index for one word.
 */

/** An adaptation: the player page's address prefix (`@s2u/ui` `PLAYER_PAGE_SEGMENT` between slashes), root-relative as the match page's links. */
export const PLAYER_HREF_PREFIX_ADAPTATION = '/player/';

/** The player page's address of `name`: the prefix and the name, encoded as one path segment. */
export function playerHref(name: string): string {
  return PLAYER_HREF_PREFIX_ADAPTATION + encodeURIComponent(name);
}

/**
 * LCM-18d: the names no address reaches -- a name that is a whole dot segment. A browser's URL parser resolves "." and
 * ".." as the path's own steps, and their percent forms ("%2E", ".%2E", "%2E%2E", any case) too, so `/player/..` opens
 * `/` and no encoding of these two reaches central's `/player/<name>`. Three dots or more are an ordinary segment.
 */
const DOT_SEGMENT_NAMES_ADAPTATION: ReadonlySet<string> = new Set(['.', '..']);

/** Whether `name` has a page address that reaches it (every name but "." and ".."; `DOT_SEGMENT_NAMES_ADAPTATION`). */
export function hasPlayerPage(name: string): boolean {
  return name !== '' && !DOT_SEGMENT_NAMES_ADAPTATION.has(name);
}

/**
 * A player's name as a link to its page -- its text set by `textContent`, never parsed as markup. A null or empty name
 * (no player) is a plain `<span>` with no text; a name no address reaches (`hasPlayerPage`) a `<span>` with its text.
 */
export function playerLink(doc: Document, name: string | null, className = ''): HTMLElement {
  if (name === null || !hasPlayerPage(name)) {
    const span = doc.createElement('span');
    if (className) span.className = className;
    if (name) span.textContent = name;
    return span;
  }
  const a = doc.createElement('a');
  if (className) a.className = className;
  a.setAttribute('href', playerHref(name));
  a.textContent = name;
  return a;
}

/** LCM-16: the identity block's three sizes -- a table row, a card or tile, a page head. */
export type IdentSize = 'sm' | 'md' | 'lg';

/**
 * LCM-16 (LCM.R15 (a)): the medal's drawn size per identity size, whole multiples of the disc's 16 x 16 so the pixels stay
 * even (1x, 2x, 3x; `site.css` draws them at `--s2u-icon-16`, `--s2u-space-8`, `--s2u-space-12`, pixelated).
 */
export const PLAYER_MEDAL_PX_ADAPTATION: Readonly<Record<IdentSize, number>> = { sm: 16, md: 32, lg: 48 };

/** LCM-16: a clan tag as every page prints it, "[TAG]" -- a tag that already carries its brackets keeps one pair. */
export function clanTagText(tag: string | null | undefined): string {
  const bare = (tag ?? '').trim().replace(/^\[(.*)\]$/, '$1');
  return bare === '' ? '' : `[${bare}]`;
}

/** Who an identity block draws: the name, the clan tag, the game's medal (1..5; anything else none), a bot (no page). */
export interface Identity { readonly name: string | null; readonly tag?: string | null; readonly medal?: number | null; readonly bot?: boolean }

/**
 * LCM-16 (LCM.R11: "every identity is one block: the medal left, the clan tag as a small line above the name, both
 * left-aligned"): the one identity block of the match, leaderboard and player pages. In a table (the default,
 * `medalSlot: 'fixed'`) the medal slot is always there, so rows align with or without a medal; a medal that fails to load
 * is removed (never a broken image), its slot kept. LCM-20: a single identity -- an award, a card, a page head --
 * passes `medalSlot: 'fit'`, and without a medal (or when it fails to load) has no slot (`project-ident--no-medal`), so its
 * name is not indented away from the card's label line. The
 * name is a link to its page (a bot's, text), cut by the stylesheet with the whole name in its title; `nameAs: 'h1'` makes
 * it the page's title (the player page's head). Every text by `textContent`.
 */
export function playerIdent(doc: Document, who: Identity, size: IdentSize, o: { nameAs?: 'h1'; medalSlot?: 'fixed' | 'fit' } = {}): HTMLElement {
  const box = doc.createElement('div');
  box.className = `project-ident project-ident--${size}`;
  const fit = o.medalSlot === 'fit';
  const slot = doc.createElement('span');
  slot.className = 'project-ident-medal';
  /** LCM-20: a fitted identity without a medal has no slot -- the tag and the name take the block's left edge. */
  const bare = (): void => { slot.remove(); box.classList.add('project-ident--no-medal'); };
  const medal = who.medal ?? 0;
  const hasMedal = Number.isInteger(medal) && medal >= 1 && medal <= 5;
  if (hasMedal) {
    const img = doc.createElement('img');
    img.src = `/api/medals/${medal}.png`;
    img.alt = '';
    img.width = PLAYER_MEDAL_PX_ADAPTATION[size];
    img.height = PLAYER_MEDAL_PX_ADAPTATION[size];
    img.decoding = 'async';
    img.addEventListener('error', () => (fit ? bare() : img.remove()), { once: true });
    slot.append(img);
  }
  box.append(slot);
  if (fit && !hasMedal) bare();
  const tag = clanTagText(who.tag);
  if (tag !== '') {
    const t = doc.createElement('span');
    t.className = 'project-ident-tag';
    t.textContent = tag;
    box.append(t);
  }
  let name: HTMLElement;
  if (o.nameAs === 'h1') {
    name = doc.createElement('h1');
    name.className = 'project-ident-name';
    name.textContent = who.name ?? '';
  } else if (who.bot === true || who.name === null || who.name === '') {
    name = doc.createElement('span');
    name.className = 'project-ident-name';
    name.textContent = who.name ?? '';
  } else {
    name = playerLink(doc, who.name, 'project-ident-name');
  }
  if (who.name) name.title = who.name;
  box.append(name);
  return box;
}
