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
  /**
   * The camera navigates (`../camera` `FlyCamera.navigating`: RMB held to fly, a pan, an orbit, a dolly): its fly
   * letters (`FLY_LETTERS`) are the camera's then, never the editor's -- W / E / R would change the gizmo's mode mid-flight.
   */
  navigating?: boolean;
}

/** The letters the Forge's camera flies on (and its RMB C / Z field of view): the camera's alone while it navigates. */
const FLY_LETTERS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC']);

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

/**
 * The placing tools' keys (the owner, 2026-11-06; a browser adaptation, FG.R2): Q the Select tool, and the number keys
 * the placing tools in the tools row's order (`./page` `modeSection`: Spawn, Objects, Demolition, Escort and Extraction,
 * Info, Other) -- 1 to 9 then 0 the first ten, Shift with 1 to 8 the rest. The Place tool has none: choosing a prop places.
 */
export const FORGE_TOOL_ORDER = [
  'spawnA', 'spawnB', 'respawnA', 'respawnB', 'door', 'gate', 'barrier', 'ladder', 'turret', 'flare',
  'bomb', 'siteSeal', 'siteTerrorist', 'hostage', 'zone', 'point', 'view', 'npc',
] as const;
export type ForgeToolKey = 'select' | (typeof FORGE_TOOL_ORDER)[number];

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;

/** A tool's key as its tooltip shows it (`Q`, `3`, `Shift+2`), or null for one with none. */
export function forgeToolKeyLabel(tool: string): string | null {
  if (tool === 'select') return 'Q';
  const i = (FORGE_TOOL_ORDER as readonly string[]).indexOf(tool);
  if (i < 0 || i >= DIGITS.length * 2) return null;
  const digit = DIGITS[i % DIGITS.length]!.slice(5);
  return i < DIGITS.length ? digit : `Shift+${digit}`;
}

/**
 * The help card's tool rows (FP-1b; a browser adaptation, FG.R2): Q and the Select tool, then the plain number keys' tools
 * and the Shift ones', each named by `nameOf` beside its key -- read from `FORGE_TOOL_ORDER` and `forgeToolKeyLabel`, so
 * the card says what the keys do, never a list written beside them.
 */
export function forgeToolKeyHelp(nameOf: (tool: ForgeToolKey) => string): [string, string][] {
  const keyed = FORGE_TOOL_ORDER.flatMap((t) => { const k = forgeToolKeyLabel(t); return k ? [{ t, k }] : []; });
  const rows: [string, string][] = [['Q', `Tool: ${nameOf('select')}`]];
  for (const group of [keyed.filter((x) => !x.k.startsWith('Shift+')), keyed.filter((x) => x.k.startsWith('Shift+'))]) {
    if (group.length) rows.push([`${group[0]!.k} … ${group[group.length - 1]!.k}`, `Tools: ${group.map((x) => `${x.k} ${nameOf(x.t)}`).join(', ')}`]);
  }
  return rows;
}

/** The tool a key chooses (`forgeToolKeyLabel`'s inverse), or null. */
function toolOfKey(e: ForgeKeyEvent): ForgeToolKey | null {
  if (e.code === 'KeyQ' && !e.shiftKey) return 'select';
  const d = (DIGITS as readonly string[]).indexOf(e.code);
  if (d < 0) return null;
  return FORGE_TOOL_ORDER[d + (e.shiftKey ? DIGITS.length : 0)] ?? null;
}

export type ForgeKeyAction =
  | 'undo' | 'redo' | 'copy' | 'paste' | 'walk' | 'play' | 'stopWalk' | 'door' | 'closeCard'
  | { tool: ForgeToolKey } | 'translate' | 'rotate' | 'scale' | 'snap'
  | 'duplicate' | 'delete' | 'frame' | 'docks' | 'deselect' | 'cancelPlace'
  | 'prevAsset' | 'nextAsset' | 'turnLeft' | 'turnRight' | 'menu'
  | { menu: MenuInput };

const MENU_KEYS: Readonly<Record<string, MenuInput>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Space: 'select', Escape: 'back', KeyM: 'back',
};

const EDITOR_KEYS: Readonly<Record<string, ForgeKeyAction>> = {
  KeyH: 'docks', KeyF: 'frame',
  // The tools' keys are `toolOfKey`'s (Q and the number keys, `FORGE_TOOL_ORDER`).
  // The gizmo's modes on W, E, R, as an engine editor's: the fly camera's W and E (and its R) move it only while RMB is
  // held, and the camera keeps them from the editor then (`../camera` `onKeyDown`).
  KeyW: 'translate', KeyE: 'rotate', KeyR: 'scale', KeyG: 'snap', KeyC: 'duplicate', Delete: 'delete', Backspace: 'delete',
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
  if (s.navigating && FLY_LETTERS.has(e.code)) return null;   // the camera's while it navigates
  if (e.code === 'KeyV') return s.playing ? 'stopWalk' : 'walk';     // FG-50: Walk and Edit, the camera kept
  if (e.code === 'KeyP') return s.playing ? 'stopWalk' : 'play';
  if (s.playing) {
    if (e.code === 'Escape') return s.pointerLocked ? null : 'stopWalk';
    return e.code === 'KeyX' && !e.repeat ? 'door' : null;          // the test room's action key (a door)
  }
  if (e.code === 'Escape') return s.pointerLocked ? null : s.queued ? 'cancelPlace' : 'deselect';   // FUI-22 (D4): the queue first
  const tool = toolOfKey(e);
  if (tool) return { tool };
  return EDITOR_KEYS[e.code] ?? null;
}
