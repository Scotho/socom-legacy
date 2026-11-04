import type { LauncherState } from '../../modern/launcherState';
import type { Adapters, DiscState } from '../state';
import { KEPT_DISC_TITLE } from './disc';

/**
 * OVERLAY-CONSOLE (CX.R13, OT.R60; MU2-12, MU2.R6): the disc as the console reads it in the overlay over a game page --
 * the disc store's, followed (`../../modern/launcherState`, the store the console's own disc adapter and the game page
 * write, and the opened request its `label` names), never chosen: the game opened the disc at its boot, so the overlay
 * has no picker, no drop, no source and no kept disc of its own (the console's locks, `../state` `OVERLAY_LOCK_WORDS`).
 * `in-game` (the front end has the window) reads as `ready`, as the console's own disc adapter reads it. The served tree
 * (a development build's `?devmode` front end, no disc published) is named as the overlay's Home named it (MU2-12). A
 * browser adaptation with no original (OT.R28).
 */
export type OverlayDisc = Adapters['disc'] & { dispose(): void };

/** The served tree's words (MU2-12's, which the overlay's Home said; its `discLine` retired with CX-26). */
export const SERVED_TREE_WORDS = 'The served tree (a development build’s files)';

/**
 * Batch B's review F2 (the seat's frames F-B): the kept read set under the game (the console's START from storage, which
 * publishes `KEPT_DISC_TITLE` as the disc's name and no opened request) in the page's own words for a stored request
 * (`../../discSource` `requestLabel`, DX-3), so the overlay's Disc line names it as it names an image or a folder.
 */
export const OVERLAY_KEPT_WORDS = 'the disc kept in this browser';

export function overlayDisc(state: LauncherState, notify: () => void, served: () => boolean = () => false): OverlayDisc {
  const off = state.onChange(() => { notify(); });
  const now = (): DiscState => { const d = state.disc(); return d === 'in-game' ? 'ready' : d; };
  return {
    state: now,
    title: () => state.filename() ?? 'SOCOM II',
    choose: () => Promise.resolve(false),
    kind: () => state.kind?.() ?? null,
    // The disc in by the opened request's words (`discLabel`), else its name; while it is read, its name; no disc, the
    // served tree where the page reads it.
    label: () => {
      const d = now();
      if (d === 'ready') { const name = state.label?.() || state.filename() || ''; return name === KEPT_DISC_TITLE ? OVERLAY_KEPT_WORDS : name; }
      if (d === 'reading') return state.filename() ?? '';
      return d === 'empty' && served() ? SERVED_TREE_WORDS : '';
    },
    error: () => (now() === 'error' ? state.refusal?.() ?? '' : ''),
    dispose: off,
  };
}
