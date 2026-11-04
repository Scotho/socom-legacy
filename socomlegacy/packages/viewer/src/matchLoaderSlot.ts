/**
 * Browser adaptation (no original; product track, PR #631's Xbox memory work): the front end's match loader
 * (`./matchMount` `matchLoader`: its worker and the last mission's decoded assets -- the map, the sound, the clips) made
 * on demand and let go when the match returns to the menus, instead of when the page goes away. A device with about
 * 1 GB for the whole browser (the Xbox's Edge) cannot carry the last match's ~250 MB under the menus and the next match.
 * The next match makes a fresh loader; a rematch on the same map decodes again. Nothing the game does changes.
 */
export interface MatchLoaderSlot<L extends { dispose(): void }> {
  /** The loader, made at the first call and the same one until `release`. */
  get(): Promise<L>;
  /** Disposes the loader, if one was made, and forgets it; a failed make is let go quietly. */
  release(): void;
  /** IP3's lobby prepare (`./lobbyPrepare`): the loader if one is made and not released, else null -- never makes one. */
  held(): Promise<L> | null;
}

export function matchLoaderSlot<L extends { dispose(): void }>(make: () => Promise<L>): MatchLoaderSlot<L> {
  let current: Promise<L> | null = null;
  return {
    get: () => (current ??= make()),
    release: () => {
      const held = current;
      current = null;
      void held?.then((l) => { l.dispose(); }, () => {});
    },
    held: () => current,
  };
}

/**
 * Scoped to the Xbox preset (#627's opt-in, `./graphicsBackend`): only there is the last match let go at the return. Every
 * other player keeps it, so a rematch on the same map does not decode again.
 */
export function releasesMatchOnReturn(graphics: string): boolean {
  return graphics === 'xbox';
}
