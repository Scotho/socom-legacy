import './lobbyLinkCover.css';   // the cover's look, by its id (no inline colour or type: the viewer chrome's rule)

/**
 * OT.R121's cover (`./lobbyLinkDirect` `LOBBY_LINK_DIRECT_ADAPTATION`; product track): while a lobby link's login path
 * runs behind it, one page element stands over the front end's canvases -- the software one and the GPU one beside it --
 * so none of the original's login screens is seen; the mount (`./frontEnd`) takes it away at the reveal (the GAME LOBBY,
 * or the screen where the player must act). A browser adaptation's own element: the console had no such screen.
 */

/** The element's id (one per page). */
export const LOBBY_LINK_COVER_ID = 'lobby-link-cover';
/** Its one line. A browser adaptation's own words. */
export const LOBBY_LINK_COVER_LINE = 'Joining the game lobby...';

/** Whether the cover stands on `doc` (the overlay opens nothing meanwhile: `./modern/overlay` `doOpen`, the review's F1). */
export function lobbyLinkCoverUp(doc: Document): boolean {
  return doc.getElementById(LOBBY_LINK_COVER_ID) !== null;
}

/** The cover over the page, or the one already up; `hide` takes it away (once; later calls do nothing). */
export function showLobbyLinkCover(doc: Document): { hide(): void } {
  let el = doc.getElementById(LOBBY_LINK_COVER_ID);
  if (!el) {
    el = doc.createElement('div');
    el.id = LOBBY_LINK_COVER_ID;
    el.setAttribute('role', 'status');
    el.textContent = LOBBY_LINK_COVER_LINE;
    doc.body.append(el);
  }
  const mine = el;
  return { hide: () => { mine.remove(); } };
}
