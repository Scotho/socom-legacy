/**
 * The forge editor's keys (OT.R68, the owner 2026-10-21: keyboard and mouse for everything in the forge's creation UI,
 * not once its matches have started), pure: a key and the page's state in, the editor's action out. A browser
 * adaptation with no original; the page (`./page`) wires it in every build. Which key does what is the shortcut list's
 * (`./shortcuts`; the Forge's owner (crispy, OT.R112), 2026-11-20: every command's keys editable in Edit > Preferences), never written here.
 * The fly camera's and the walk's own keys are theirs (`../camera`, `../walk`).
 */
import type { MenuInput } from './padMenu';
import { chordOf, isShortcut, keyLabel, keysPaused, commandsOn, SHORTCUT_COMMANDS, type ShortcutScope } from './shortcuts';

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
  /**
   * Geometry mode is on (`./geometry/editor`): its own keys are its, and the page keeps only the commands every mode
   * shares (the shortcut list's General commands). Absent: off.
   */
  geometry?: boolean;
  /**
   * Geometry mode's scopes in force (its selection mode, a running tool): a key one of its own commands has there is
   * the mode's, never a General command's (the Forge's owner (crispy, OT.R112), 2026-11-20: "give them to geometry modes"). Absent: none.
   */
  geometryScopes?: readonly ShortcutScope[];
  /** The Outliner has the focus: its keys (the shortcut list's Outliner commands) are its. Absent: no. */
  outliner?: boolean;
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
   * (the panel reads its own); a card over it still closes on Escape. R3-A: Escape (and the menu's key, where it has
   * one) is its way out (`forgeLeaseExit`).
   */
  leased?: boolean;
  /**
   * The camera navigates (`../camera` `FlyCamera.navigating`: RMB held to fly, a pan, an orbit, a dolly): its fly keys
   * (the shortcut list's Camera commands) are the camera's then, never the editor's.
   */
  navigating?: boolean;
}

/** R3-A: what a key does to a held focus lease -- `release` lets it go; `menu` lets it go, then opens the menu. */
export type ForgeLeaseExit = 'release' | 'menu';

/**
 * R3-A (the FUI-2 review's finding 5; a browser adaptation): the focus lease's keyboard exit. While a panel holds the
 * lease every editor key is the panel's (`forgeKeyAction` answers null), so Escape lets the lease go -- as the pad's
 * Circle does when the panel does not take it -- and the menu's key (none by default) lets it go and then opens the
 * menu. Null for any other key, or when no lease is held or a field, a match, the menu or a card has the keys.
 */
export function forgeLeaseExit(e: ForgeKeyEvent, s: ForgeKeyState): ForgeLeaseExit | null {
  if (keysPaused()) return null;
  if (!s.leased || s.typing || s.match || s.menu || s.card) return null;
  if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) return 'release';
  return isShortcut('app.menu', e) ? 'menu' : null;
}

/** The placing tools, in the tools row's order (`./page` `modeSection`): their keys the shortcut list's `forge.tool.*`. */
export const FORGE_TOOL_ORDER = [
  'spawnA', 'spawnB', 'respawnA', 'respawnB', 'door', 'ladder', 'turret', 'barrier', 'switch', 'gate', 'flare',
  'bomb', 'siteSeal', 'siteTerrorist', 'hostage', 'zone', 'point', 'view', 'npc',
] as const;
export type ForgeToolKey = 'select' | (typeof FORGE_TOOL_ORDER)[number];

/** The keyed tools: Select, then the placing tools (`FORGE_TOOL_ORDER`). */
const KEYED_TOOLS: readonly ForgeToolKey[] = ['select', ...FORGE_TOOL_ORDER];

/** A tool's key as its tooltip shows it (`1`, `Shift+2`), or null for one with none. */
export function forgeToolKeyLabel(tool: string): string | null {
  return keyLabel(`forge.tool.${tool}`) || null;
}

/** The help card's tool row: each keyed tool's key beside its name (`nameOf`), read from the shortcut list. */
export function forgeToolKeyHelp(nameOf: (tool: ForgeToolKey) => string): [string, string][] {
  const keyed = KEYED_TOOLS.flatMap((t) => { const k = forgeToolKeyLabel(t); return k ? [`${k} ${nameOf(t)}`] : []; });
  return keyed.length ? [['Tools', keyed.join(', ')]] : [];
}

export type ForgeKeyAction =
  | 'undo' | 'redo' | 'copy' | 'paste' | 'cut' | 'openLayout' | 'saves' | 'walk' | 'play' | 'stopWalk' | 'door' | 'closeCard'
  | { tool: ForgeToolKey } | 'translate' | 'rotate' | 'scale' | 'snap'
  | 'delete' | 'frame' | 'docks' | 'deselect' | 'space' | 'group' | 'ungroup' | 'selectAll' | 'invert'
  | 'prevAsset' | 'nextAsset' | 'turnLeft' | 'turnRight' | 'menu'
  | { menu: MenuInput };

/** The forge menu's own keys (fixed: its cursor, as the pad's d-pad, cross and circle). */
const MENU_KEYS: Readonly<Record<string, MenuInput>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Space: 'select', Escape: 'back',
};

/** Whether `e` is one of the camera's fly keys (the shortcut list's Camera commands), with Shift or none. */
function flyKey(e: ForgeKeyEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;       // Ctrl+Z is undo while flying; Shift flies faster
  const plain = chordOf({ ...e, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  return !!plain && commandsOn(plain, ['fly']).length > 0;
}

/** The General commands' actions, in the list's order (each tried where it applies, Geometry mode too). */
const GENERAL: readonly [string, ForgeKeyAction][] = [
  ['app.undo', 'undo'], ['app.redo', 'redo'], ['app.open', 'openLayout'], ['app.saves', 'saves'],
  ['app.docks', 'docks'], ['app.translate', 'translate'], ['app.rotate', 'rotate'], ['app.scale', 'scale'], ['app.space', 'space'],
  ['app.menu', 'menu'],
];
/** The Forge editor's own (outside Geometry mode). */
const FORGE: readonly [string, ForgeKeyAction][] = [
  ['app.cut', 'cut'], ['app.copy', 'copy'], ['app.paste', 'paste'],
  ['forge.selectAll', 'selectAll'], ['forge.invert', 'invert'], ['forge.frame', 'frame'], ['forge.group', 'group'], ['forge.ungroup', 'ungroup'], ['forge.delete', 'delete'],
  ['forge.prevAsset', 'prevAsset'], ['forge.nextAsset', 'nextAsset'], ['forge.turnLeft', 'turnLeft'], ['forge.turnRight', 'turnRight'],
];

/** The editor's action for a key, or null (the key is someone else's, or nothing's). */
export function forgeKeyAction(e: ForgeKeyEvent, s: ForgeKeyState): ForgeKeyAction | null {
  if (s.typing || s.match || keysPaused()) return null;   // the shortcut editor reads every key while it is open
  if (s.menu) {
    if (isShortcut('app.menu', e)) return { menu: 'close' };
    return e.ctrlKey || e.metaKey || e.altKey ? null : (MENU_KEYS[e.code] ? { menu: MENU_KEYS[e.code]! } : null);
  }
  if (s.card) return e.code === 'Escape' ? 'closeCard' : null;    // FUI-2: the top card's way back (`./shell/cards`)
  if (s.leased) return null;
  // Geometry mode first: a key one of its own commands has in its scopes now is its (Hammer's V, P, M and F there).
  const chord = chordOf(e);
  if (s.outliner && chord && commandsOn(chord, ['outliner']).length) return null;   // the focused Outliner's own
  if (s.geometry && isShortcut('geo.frame', e)) return 'frame';           // Geometry mode's Frame: the page frames
  if (s.geometry && chord && s.geometryScopes && commandsOn(chord, s.geometryScopes).some((c) => !c.scopes.includes('forge'))) return null;
  if (s.navigating && flyKey(e)) return null;                    // the camera's while it navigates
  // Walk and Play: their keys (none by default) start them and stop them.
  if (isShortcut('app.walk', e)) return s.playing ? 'stopWalk' : 'walk';
  if (isShortcut('app.play', e)) return s.playing ? 'stopWalk' : 'play';
  if (s.playing) {
    if (isShortcut('walk.stop', e)) return s.pointerLocked && e.code === 'Escape' ? null : 'stopWalk';
    return isShortcut('walk.use', e) && !e.repeat ? 'door' : null;          // the test room's action key (a door)
  }
  for (const [id, a] of GENERAL) if (isShortcut(id, e)) return a;
  if (s.geometry) return null;                                   // the rest is Geometry mode's own
  if (isShortcut('forge.deselect', e)) return s.pointerLocked && e.code === 'Escape' ? null : 'deselect';
  for (const t of KEYED_TOOLS) if (isShortcut(`forge.tool.${t}`, e)) return { tool: t };
  for (const [id, a] of FORGE) if (isShortcut(id, e)) return a;
  return null;
}

/** Every command id the page answers (the shortcut list's General, Forge editor, Forge tools and Walk commands). */
export const PAGE_COMMAND_IDS: readonly string[] = SHORTCUT_COMMANDS.filter((c) => /^(app|forge|walk)\./.test(c.id)).map((c) => c.id);
