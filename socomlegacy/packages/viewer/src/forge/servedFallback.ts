/**
 * FORGE (a browser adaptation, no original): which source the forge reads its maps from when a development build
 * finds none in the served tree. A development build reads the served tree (`public/maps`, which `npm run extract-maps`
 * writes from a disc on disk) unless the address asks for the disc (`?disc`); a release reads the player's disc
 * (FG.R12). A fresh clone has no served tree, so its forge opened an empty floor with the player's disc loaded (the
 * owner's smoke test of the public repository, 2026-11-04): with no map listed there, the forge reads a disc the page
 * ALREADY holds (the launcher's extraction, stored copy or remembered disc, `page.ts` `knownDisc`) -- never a prompt or
 * a card, so a page with no disc keeps its no-maps start at once (f9's proof of e7fbb1bce: waiting on the disc card
 * timed out 84 mounted-forge tests). A served tree that lists maps keeps today's start.
 */
export interface ServedListing {
  /** A development build (`import.meta.env.DEV`). */
  dev: boolean;
  /** The disc is already the source (a release, or `?disc`). */
  readsDisc: boolean;
  /** The served tree's listing threw (no `maps/index.json`, or not JSON). */
  listFailed: boolean;
  /** The maps the served tree listed. */
  listed: number;
}

export function servedTreeFallsBackToDisc(s: ServedListing): boolean {
  return s.dev && !s.readsDisc && (s.listFailed || s.listed === 0);
}
