/**
 * Whether a reload would drop a player out of a match (PWA-4). A browser adaptation: it only reads signals the
 * page already publishes. The front end's lobby match (`LobbyMatch.phase`) is in a match while `loading` or `match`.
 * The test room is in one while `__viewer.net()` answers a room, waiting lobby included. The forge is in one while
 * its body carries the match mark.
 */

/** The forge's match class (`../forge/matchState` `FORGE_MATCHING_CLASS`). A literal, so this module does not import the forge. */
export const FORGE_MATCH_MARK = 'is-matching';

export const LIVE_MATCH_PHASES = ['loading', 'match'] as const;

export interface MatchSignals {
  frontEndPhase?: string | null;
  /** Set when the test room's hook answers a room. */
  room?: { waiting: boolean } | null;
  forgeMatching?: boolean;
}

export function inMatch(s: MatchSignals): boolean {
  if (s.forgeMatching) return true;
  if (s.frontEndPhase && (LIVE_MATCH_PHASES as readonly string[]).includes(s.frontEndPhase)) return true;
  return s.room != null;
}

interface FrontEndHook { session?: { match?: { phase?: string } } }
interface ViewerHook { net?: () => { waiting?: boolean } | null }

/** Read the signals off the window. A missing hook, or a hook that throws, is "not in a match". */
export function readMatchSignals(win: Window): MatchSignals {
  const w = win as Window & { __frontEnd?: FrontEndHook; __viewer?: ViewerHook };
  let frontEndPhase: string | null = null;
  try { frontEndPhase = w.__frontEnd?.session?.match?.phase ?? null; } catch { frontEndPhase = null; }
  let room: { waiting: boolean } | null = null;
  try {
    const net = w.__viewer?.net?.() ?? null;
    if (net) room = { waiting: net.waiting === true };
  } catch { room = null; }
  let forgeMatching = false;
  try { forgeMatching = win.document?.body?.classList.contains(FORGE_MATCH_MARK) ?? false; } catch { forgeMatching = false; }
  return { frontEndPhase, room, forgeMatching };
}

export function pageInMatch(win: Window): boolean {
  return inMatch(readMatchSignals(win));
}

/** The mark the console sets on `<html>` while an edit is unsaved (the loadout editor). A literal, so this module imports no console. */
export const UNSAVED_EDIT_MARK = 'data-unsaved-edit';

/**
 * Whether a reload would cost the page what it holds outside a match (CX.R18): the game's front end mounted (its menus,
 * lobby and room; the page's `__frontEnd` hook, `../frontEnd` `FRONT_END_WINDOW_HOOK`), or an unsaved edit
 * (`UNSAVED_EDIT_MARK`). A held page shows the update notice and waits for Restart, as over a file-picked disc.
 */
export interface HoldSignals {
  frontEnd?: boolean;
  unsavedEdit?: boolean;
}

export function reloadHeld(s: HoldSignals): boolean {
  return s.frontEnd === true || s.unsavedEdit === true;
}

/** Read the holds off the window. A missing hook, or one that throws, holds nothing. */
export function readHoldSignals(win: Window): HoldSignals {
  const w = win as Window & { __frontEnd?: unknown };
  let frontEnd = false;
  try { frontEnd = w.__frontEnd != null; } catch { frontEnd = false; }
  let unsavedEdit = false;
  try { unsavedEdit = win.document?.documentElement?.hasAttribute(UNSAVED_EDIT_MARK) ?? false; } catch { unsavedEdit = false; }
  return { frontEnd, unsavedEdit };
}

export function pageReloadHeld(win: Window): boolean {
  return reloadHeld(readHoldSignals(win));
}
