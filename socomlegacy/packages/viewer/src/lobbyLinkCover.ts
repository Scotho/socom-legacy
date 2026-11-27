import './lobbyLinkCover.css';   // the cover's look, by its id (no inline colour or type: the viewer chrome's rule)
import type { WebAudioOut } from './audio';
import { LOAD_IN_LEAVE_MS, LoadInHold, loadInAt, loadInPanelHtml, type LoadInAt } from './loadIn';

/**
 * OT.R121's cover (`./lobbyLinkDirect` `LOBBY_LINK_DIRECT_ADAPTATION`; product track): while a lobby link's login path
 * runs behind it, one page element stands over the front end's canvases -- the software one and the GPU one beside it --
 * so none of the original's login screens is seen; the mount (`./frontEnd`) takes it away at the reveal (the GAME LOBBY,
 * or the screen where the player must act). A browser adaptation's own element: the console had no such screen.
 *
 * WM-37 (`./loadIn` `LOAD_IN_COVER_ADAPTATION`; the owner's "12 b approved on both", 2026-11-15): the element draws the
 * launcher's DEPLOYING panel (`./console/deployPanel`) at the load-in's stage, moved on each frame by the hidden path's
 * screen (`stage`, fed by `./frontEnd` beside the reveal); while it stands the front end's output is held silent by its
 * level (`./loadIn` `LoadInHold`, `data-sound="held"` says so); and at `hide` the hold is let go and the element fades
 * out as it stands (`is-leaving`, `LOAD_IN_LEAVE_MS`) before it is removed -- at the Lobby stage when the GAME LOBBY was
 * its last screen, at the stage it stood at when the reveal came elsewhere.
 */

/** The element's id (one per page). */
export const LOBBY_LINK_COVER_ID = 'lobby-link-cover';
/** Its accessible name. A browser adaptation's own words. */
export const LOBBY_LINK_COVER_LINE = 'Joining the game lobby...';

/**
 * Whether the cover stands on `doc` (the overlay opens nothing meanwhile: `./modern/overlay` `doOpen`, the review's F1).
 * False from the start of the hand-off's fade (`is-leaving`): the GAME LOBBY is the screen then, the leaving cover
 * takes no pointer events (`./lobbyLinkCover.css`), and a Home press there is not lost (the seat's decision, WM-37).
 */
export function lobbyLinkCoverUp(doc: Document): boolean {
  const el = doc.getElementById(LOBBY_LINK_COVER_ID);
  return el !== null && !el.classList.contains('is-leaving');
}

/** The cover's handle: `hide` (once; later calls do nothing), `stage` each frame, `draw` at a stage (a capture's staging). */
export interface LobbyLinkCover {
  hide(): void;
  /** The hidden path's screen (null: none yet) and the front end's output to hold silent (null: none). */
  stage(dialog: string | null, out?: WebAudioOut | null): void;
  draw(at: LoadInAt): void;
}

/** The stage last drawn on a cover element (one per page; a second `showLobbyLinkCover` on it draws on from there). */
const drawnOn = new WeakMap<HTMLElement, string>();

/** The cover over the page, or the one already up (a leaving one is let go and a fresh one made). */
export function showLobbyLinkCover(doc: Document): LobbyLinkCover {
  let el = doc.getElementById(LOBBY_LINK_COVER_ID);
  if (el?.classList.contains('is-leaving')) { el.remove(); el = null; }
  if (!el) {
    el = doc.createElement('div');
    el.id = LOBBY_LINK_COVER_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', LOBBY_LINK_COVER_LINE);
    doc.body.append(el);
  }
  const mine = el;
  const silence = new LoadInHold();
  let gone = false;
  const draw = (at: LoadInAt): void => {
    if (gone) return;
    const key = `${at.stage}:${at.share.toFixed(3)}`;
    const drawn = drawnOn.get(mine);
    if (key === drawn) return;
    const first = drawn === undefined;                              // the panel's entrance on its first draw only
    drawnOn.set(mine, key);
    mine.dataset['stage'] = at.stage;
    mine.innerHTML = loadInPanelHtml(at, { enter: first });
  };
  draw(loadInAt(null));
  return {
    hide: () => {
      if (gone) return;
      // The Lobby stage is drawn only by the GAME LOBBY itself (`stage`, its last screen); a reveal at a screen where the
      // player must act (a popup, the join's bound) fades the cover as it stands (the review's F3).
      gone = true;
      silence.release();
      delete mine.dataset['sound'];
      mine.classList.add('is-leaving');
      setTimeout(() => { mine.remove(); }, LOAD_IN_LEAVE_MS);
    },
    stage: (dialog, out) => {
      if (gone) return;
      if (silence.hold(out)) mine.dataset['sound'] = 'held';
      draw(loadInAt(dialog));
    },
    draw,
  };
}
