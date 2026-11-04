/**
 * The forge editor's keys (OT.R68, the owner 2026-10-21: keyboard and mouse for everything in the forge's creation UI,
 * not once its matches have started), pure: a key and the page's state in, the editor's action out. A browser
 * adaptation with no original; the page (`./page`) wires it in every build. Development builds read the same map (it was
 * their shortcuts since FG.R9); the pad's actions that had no key take one (`[` `]` the prop, `,` `.` the turn by the
 * step, M the forge menu -- the merge controller's call (c)). The fly camera's and the walk's own keys (WASD, Space,
 * Shift, Q, E, C) are theirs (`../camera`, `../walk`).
 */
import type { MenuInput } from './padMenu';

/** The parts of a `KeyboardEvent` the map reads. */
export interface ForgeKeyEvent {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

/** What the page is showing. */
export interface ForgeKeyState {
  /** A field has the keyboard (FG.R23: the lobby chat's typing, the docks' fields). */
  typing: boolean;
  /** A match runs (the Play match or a lobby's): keyless (OT.R68). */
  match: boolean;
  /** The forge menu (`./padMenu`) is open. */
  menu: boolean;
  /** A card is over the page (a question, the controls). */
  card: boolean;
  /** The Walk on the layout (the merge controller's call (a): the editor's own preview). */
  playing: boolean;
  /** The mouse is captured: Escape is the camera's (it lets the mouse go). */
  pointerLocked: boolean;
  /**
   * FUI-2: a panel holds the focus lease (`./shell/context` `ForgeFocus`): the editor's keys are none of the editor's
   * (the panel reads its own); a card over it still closes on Escape. R3-A: Escape and M are its way out
   * (`forgeLeaseExit`).
   */
  leased?: boolean;
  /**
   * FUI-22 (D4, the owner 2026-10-27: "Esc to cancel selection" ... "when you have an item queued to place"): a prop is
   * queued to place (the Place tool with a prop chosen). Escape cancels it first (`cancelPlace`), then deselects.
   */
  queued?: boolean;
}

/** R3-A: what a key does to a held focus lease -- `release` lets it go; `menu` lets it go, then opens the menu as M does. */
export type ForgeLeaseExit = 'release' | 'menu';

/**
 * R3-A (the FUI-2 review's finding 5; a browser adaptation): the focus lease's keyboard exit. While a panel holds the
 * lease every editor key is the panel's (`forgeKeyAction` answers null), so Escape lets the lease go -- as the pad's
 * Circle does when the panel does not take it -- and M, the menu key, lets it go and then opens the menu. The page reads
 * this after the holding panel's own handlers (the bubble phase): a key the panel took (`defaultPrevented`) stays the
 * panel's. Null for any other key, or when no lease is held or a field, a match, the menu or a card has the keys.
 */
export function forgeLeaseExit(e: ForgeKeyEvent, s: ForgeKeyState): ForgeLeaseExit | null {
  if (!s.leased || s.typing || s.match || s.menu || s.card) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return e.code === 'Escape' ? 'release' : e.code === 'KeyM' ? 'menu' : null;
}

export type ForgeKeyAction =
  | 'undo' | 'redo' | 'copy' | 'paste' | 'walk' | 'play' | 'stopWalk' | 'door' | 'closeCard'
  | 'select' | 'place' | 'spawnA' | 'spawnB' | 'npc' | 'bomb' | 'siteSeal' | 'siteTerrorist' | 'translate' | 'rotate' | 'snap'
  | 'duplicate' | 'delete' | 'frame' | 'docks' | 'deselect' | 'cancelPlace'
  | 'prevAsset' | 'nextAsset' | 'turnLeft' | 'turnRight' | 'menu'
  | { menu: MenuInput };

const MENU_KEYS: Readonly<Record<string, MenuInput>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Space: 'select', Escape: 'back', KeyM: 'back',
};

const EDITOR_KEYS: Readonly<Record<string, ForgeKeyAction>> = {
  KeyH: 'docks', KeyF: 'frame',
  Digit1: 'select', Digit2: 'place', Digit3: 'spawnA', Digit4: 'spawnB', Digit5: 'npc',
  Digit6: 'bomb', Digit7: 'siteSeal', Digit8: 'siteTerrorist',                // FG-51: the bomb's start and the two plant sites
  KeyT: 'translate', KeyR: 'rotate', KeyG: 'snap', KeyC: 'duplicate', Delete: 'delete', Backspace: 'delete',
  BracketLeft: 'prevAsset', BracketRight: 'nextAsset', Comma: 'turnLeft', Period: 'turnRight', KeyM: 'menu',
};

/** The editor's action for a key, or null (the key is someone else's, or nothing's). */
export function forgeKeyAction(e: ForgeKeyEvent, s: ForgeKeyState): ForgeKeyAction | null {
  if (s.typing || s.match) return null;
  if (s.menu) return e.ctrlKey || e.metaKey || e.altKey ? null : (MENU_KEYS[e.code] ? { menu: MENU_KEYS[e.code]! } : null);
  if (s.card) return e.code === 'Escape' ? 'closeCard' : null;    // FUI-2: the top card's way back (`./shell/cards`)
  if (s.leased) return null;
  const chord = e.ctrlKey || e.metaKey;
  if (chord && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) return e.code === 'KeyY' || e.shiftKey ? 'redo' : 'undo';
  if (chord && !e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyV')) return e.code === 'KeyC' ? 'copy' : 'paste';
  if (chord || e.altKey) return null;
  if (e.code === 'KeyV') return s.playing ? 'stopWalk' : 'walk';     // FG-50: Walk and Edit, the camera kept
  if (e.code === 'KeyP') return s.playing ? 'stopWalk' : 'play';
  if (s.playing) {
    if (e.code === 'Escape') return s.pointerLocked ? null : 'stopWalk';
    return e.code === 'KeyX' && !e.repeat ? 'door' : null;          // the test room's action key (a door)
  }
  if (e.code === 'Escape') return s.pointerLocked ? null : s.queued ? 'cancelPlace' : 'deselect';   // FUI-22 (D4): the queue first
  return EDITOR_KEYS[e.code] ?? null;
}
