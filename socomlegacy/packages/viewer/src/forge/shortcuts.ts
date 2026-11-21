/**
 * The Forge's keyboard shortcuts, every one in one list (the owner, 2026-11-20: "we need to overhaul all shortcuts for
 * all things ... fully customize what shortcuts they can use for each command"; a browser adaptation, the game has no
 * editor). Each command has an id, a name, where it applies (`scopes`), the layer it sits on (a running tool's keys
 * come before the mode's, the camera's while it flies before the editor's), and its default keys -- the reference
 * editor's in Geometry mode (the owner: "for the geometry editing tools, we should try to stay consistent with the
 * hammer shortcuts"). The page, Geometry mode, the camera, the Outliner, the menus' key column and the tooltips all
 * read their keys from here, so a key changed in Edit > Preferences is changed everywhere.
 *
 * A key is stored by where it sits on the keyboard (`KeyboardEvent.code`: `KeyZ`, `Digit1`, `NumpadAdd`), so a set works
 * on any layout; Ctrl and Cmd are one modifier. A chord is written `Ctrl+Alt+Shift+Code`, modifiers in that order.
 * Custom keys are kept in this browser only (the owner: "store it ... locally in their browser cache ... don't store it
 * in the map"), and can be exported to a file and imported again.
 */

/** Where a command applies. `forge`: the Forge editor outside Geometry mode; `geo:*`: Geometry mode's selection modes. */
export type ShortcutScope =
  | 'forge' | 'geo:object' | 'geo:point' | 'geo:edge' | 'geo:face' | 'walk' | 'fly' | 'outliner'
  | 'tool:knife' | 'tool:line' | 'tool:clip' | 'tool:create' | 'tool:polygon' | 'tool:paint';

/** The layers, first to take a key first: a running tool, the camera while it flies, a focused panel, then the mode. */
export type ShortcutLayer = 'tool' | 'fly' | 'panel' | 'mode';

export interface ShortcutCommand {
  id: string;
  label: string;
  /** The heading it is listed under in the editor. */
  group: string;
  scopes: readonly ShortcutScope[];
  layer: ShortcutLayer;
  defaults: readonly string[];
  /** Shown under the command in the editor. */
  note?: string;
}

const GEO_ALL: readonly ShortcutScope[] = ['geo:object', 'geo:point', 'geo:edge', 'geo:face'];
const GEO_ELEMENTS: readonly ShortcutScope[] = ['geo:point', 'geo:edge', 'geo:face'];
const EVERYWHERE: readonly ShortcutScope[] = ['forge', ...GEO_ALL];

const c = (id: string, label: string, group: string, scopes: readonly ShortcutScope[], defaults: readonly string[], layer: ShortcutLayer = 'mode', note?: string): ShortcutCommand =>
  ({ id, label, group, scopes, layer, defaults, ...(note ? { note } : {}) });

/** The placing tools on the number keys, in the tools row's order (`./keys` `FORGE_TOOL_ORDER`), with their names. */
const PLACING: readonly [string, string][] = [
  ['spawnA', 'Spawn A'], ['spawnB', 'Spawn B'], ['respawnA', 'Respawn A'], ['respawnB', 'Respawn B'], ['door', 'Door'],
  ['ladder', 'Ladder'], ['turret', 'Turret'], ['barrier', 'Barrier'], ['switch', 'Switch'], ['gate', 'Gate'], ['flare', 'Flare'],
  ['bomb', 'Bomb'], ['siteSeal', 'Site seal'], ['siteTerrorist', 'Site terrorist'], ['hostage', 'Hostage'], ['zone', 'Zone'],
  ['point', 'Point'], ['view', 'View'], ['npc', 'NPC'],
];
const DIGIT_KEYS = ['Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'Shift+Digit1', 'Shift+Digit2', 'Shift+Digit3', 'Shift+Digit4', 'Shift+Digit5', 'Shift+Digit6', 'Shift+Digit7', 'Shift+Digit8', 'Shift+Digit9', 'Shift+Digit0'];

/** Every command, in the order the editor lists them. */
export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
  // Everywhere in the editor.
  c('app.undo', 'Undo', 'General', EVERYWHERE, ['Ctrl+KeyZ']),
  c('app.redo', 'Redo', 'General', EVERYWHERE, ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ']),
  c('app.cut', 'Cut', 'General', EVERYWHERE, ['Ctrl+KeyX']),
  c('app.copy', 'Copy', 'General', EVERYWHERE, ['Ctrl+KeyC']),
  c('app.paste', 'Paste', 'General', EVERYWHERE, ['Ctrl+KeyV']),
  c('app.open', 'Open…', 'General', EVERYWHERE, ['Ctrl+KeyO']),
  c('app.saves', 'Saves…', 'General', EVERYWHERE, ['Ctrl+KeyS']),
  c('app.docks', 'Show / hide the docks', 'General', EVERYWHERE, ['KeyH']),
  c('app.translate', 'Gizmo: Move', 'General', EVERYWHERE, ['KeyW']),
  c('app.rotate', 'Gizmo: Rotate', 'General', EVERYWHERE, ['KeyE']),
  c('app.scale', 'Gizmo: Scale', 'General', EVERYWHERE, ['KeyR']),
  c('app.space', 'Gizmo: World / Local', 'General', EVERYWHERE, ['KeyQ']),
  c('app.walk', 'Walk on / off', 'General', EVERYWHERE, []),
  c('app.play', 'Play on / off', 'General', EVERYWHERE, []),
  c('app.menu', 'Forge menu', 'General', EVERYWHERE, []),
  // The Forge editor (placing), outside Geometry mode.
  c('forge.deselect', 'Deselect, back to the Select tool', 'Forge editor', ['forge'], ['Escape']),
  c('forge.delete', 'Delete', 'Forge editor', ['forge'], ['Delete', 'Backspace']),
  c('forge.frame', 'Frame selection', 'Forge editor', ['forge'], ['KeyF', 'Shift+KeyA']),
  c('forge.selectAll', 'Select all', 'Forge editor', ['forge'], ['Ctrl+KeyA']),
  c('forge.invert', 'Invert selection', 'Forge editor', ['forge'], ['Ctrl+KeyI']),
  c('forge.group', 'Group into a folder', 'Forge editor', ['forge'], ['KeyG']),
  c('forge.ungroup', 'Ungroup', 'Forge editor', ['forge'], ['Shift+KeyG']),
  c('forge.prevAsset', 'Previous asset', 'Forge editor', ['forge'], ['BracketLeft']),
  c('forge.nextAsset', 'Next asset', 'Forge editor', ['forge'], ['BracketRight']),
  c('forge.turnLeft', 'Turn left by the step', 'Forge editor', ['forge'], ['Comma']),
  c('forge.turnRight', 'Turn right by the step', 'Forge editor', ['forge'], ['Period']),
  c('forge.tool.select', 'Tool: Select', 'Forge tools', ['forge'], ['Digit1']),
  ...PLACING.map(([id, name], i) => c(`forge.tool.${id}`, `Tool: ${name}`, 'Forge tools', ['forge'], [DIGIT_KEYS[i]!])),
  // Walk and Play.
  c('walk.stop', 'Stop Walk / Play', 'Walk and Play', ['walk'], ['Escape']),
  c('walk.use', 'Use (open a door)', 'Walk and Play', ['walk'], ['KeyX']),
  // The camera while it flies (right mouse held).
  c('fly.forward', 'Fly forward', 'Camera (right mouse held)', ['fly'], ['KeyW'], 'fly'),
  c('fly.back', 'Fly back', 'Camera (right mouse held)', ['fly'], ['KeyS'], 'fly'),
  c('fly.left', 'Fly left', 'Camera (right mouse held)', ['fly'], ['KeyA'], 'fly'),
  c('fly.right', 'Fly right', 'Camera (right mouse held)', ['fly'], ['KeyD'], 'fly'),
  c('fly.up', 'Fly up', 'Camera (right mouse held)', ['fly'], ['KeyE', 'Space'], 'fly'),
  c('fly.down', 'Fly down', 'Camera (right mouse held)', ['fly'], ['KeyQ'], 'fly'),
  c('fly.rise', "Fly up the view's own up", 'Camera (right mouse held)', ['fly'], ['KeyR'], 'fly'),
  c('fly.sink', "Fly down the view's own up", 'Camera (right mouse held)', ['fly'], ['KeyF'], 'fly'),
  c('fly.zoomOut', 'Widen the view (zoom out)', 'Camera (right mouse held)', ['fly'], ['KeyZ'], 'fly'),
  c('fly.zoomIn', 'Narrow the view (zoom in)', 'Camera (right mouse held)', ['fly'], ['KeyC'], 'fly'),
  // Geometry mode.
  c('geo.mode.point', 'Vertex mode', 'Geometry: modes and selection', GEO_ALL, ['Digit1']),
  c('geo.mode.edge', 'Edge mode', 'Geometry: modes and selection', GEO_ALL, ['Digit2']),
  c('geo.mode.face', 'Face mode', 'Geometry: modes and selection', GEO_ALL, ['Digit3']),
  c('geo.mode.object', 'Object mode', 'Geometry: modes and selection', GEO_ALL, ['Digit4']),
  c('geo.back', 'Deselect, then back to Object mode', 'Geometry: modes and selection', GEO_ALL, ['Escape']),
  c('geo.frame', 'Frame selection', 'Geometry: modes and selection', GEO_ALL, ['Shift+KeyA']),
  c('geo.selectAll', 'Select all', 'Geometry: modes and selection', GEO_ALL, ['Ctrl+KeyA']),
  c('geo.invert', 'Invert selection', 'Geometry: modes and selection', GEO_ALL, ['Ctrl+KeyI']),
  c('geo.grow', 'Grow selection', 'Geometry: modes and selection', GEO_ELEMENTS, ['NumpadAdd']),
  c('geo.shrink', 'Shrink selection', 'Geometry: modes and selection', GEO_ELEMENTS, ['NumpadSubtract']),
  c('geo.loop', 'Select edge loop', 'Geometry: modes and selection', ['geo:edge'], ['KeyL']),
  c('geo.ring', 'Select edge ring', 'Geometry: modes and selection', ['geo:edge'], ['KeyG']),
  c('geo.ribs', 'Select ribs', 'Geometry: modes and selection', ['geo:edge'], ['Ctrl+KeyG']),
  c('geo.delete', 'Delete', 'Geometry: edit', GEO_ALL, ['Delete']),
  c('geo.dissolve', 'Dissolve / Combine Faces', 'Geometry: edit', GEO_ELEMENTS, ['Backspace']),
  c('geo.knife', 'Knife', 'Geometry: edit', GEO_ELEMENTS, ['KeyC']),
  c('geo.connect', 'Connect', 'Geometry: edit', ['geo:point', 'geo:edge'], ['KeyV']),
  c('geo.merge', 'Merge', 'Geometry: edit', ['geo:point', 'geo:edge'], ['KeyM']),
  c('geo.mergeMeshes', 'Merge Meshes', 'Geometry: edit', ['geo:object'], ['KeyM']),
  c('geo.fill', 'Fill Hole', 'Geometry: edit', ['geo:edge'], ['KeyP']),
  c('geo.quadSlice', 'Quad Slice', 'Geometry: edit', ['geo:face'], ['Ctrl+KeyD']),
  c('geo.bevel', 'Bevel', 'Geometry: edit', ['geo:edge', 'geo:face'], ['Alt+KeyF']),
  c('geo.quickBevel', 'Quick Bevel', 'Geometry: edit', ['geo:edge'], ['KeyF']),
  c('geo.flip', 'Flip', 'Geometry: edit', ['geo:face', 'geo:object'], ['KeyF']),
  c('geo.bridgeEdges', 'Bridge edges', 'Geometry: edit', ['geo:edge'], ['KeyB']),
  c('geo.bridge', 'Bridge', 'Geometry: edit', ['geo:edge', 'geo:face'], ['Alt+KeyB']),
  c('geo.inset', 'Inset', 'Geometry: edit', ['geo:face'], ['Shift+KeyI']),
  c('geo.thicken', 'Thicken Faces', 'Geometry: edit', ['geo:face'], ['KeyG']),
  c('geo.extend', 'Extend edges', 'Geometry: edit', ['geo:edge'], ['KeyN']),
  c('geo.collapse', 'Collapse', 'Geometry: edit', ['geo:edge', 'geo:face'], ['Shift+KeyO']),
  c('geo.separate', 'Separate (Extract Faces)', 'Geometry: edit', ['geo:face'], ['Alt+KeyN']),
  c('geo.snapGrid', 'Snap to Grid', 'Geometry: edit', GEO_ELEMENTS, ['Ctrl+KeyB']),
  c('geo.snapVertex', 'Snap to Vertex', 'Geometry: edit', ['geo:point'], ['KeyB']),
  c('geo.snapEdges', 'Snap Edges', 'Geometry: edit', ['geo:edge'], ['KeyI']),
  c('geo.clip', 'Clipping tool', 'Geometry: edit', ['geo:object', 'geo:face'], ['Shift+KeyX']),
  c('geo.mirror', 'Mirror tool', 'Geometry: edit', ['geo:object', 'geo:face'], ['Shift+KeyF']),
  // Running tools.
  c('knife.apply', 'Knife: cut', 'Running tools', ['tool:knife'], ['Enter'], 'tool'),
  c('knife.back', 'Knife: take back the last point', 'Running tools', ['tool:knife'], ['Delete'], 'tool'),
  c('knife.cancel', 'Knife: let the points go, then leave', 'Running tools', ['tool:knife'], ['Escape'], 'tool'),
  c('knife.loop', 'Knife: loop mode on / off', 'Running tools', ['tool:knife'], ['KeyV'], 'tool'),
  c('line.apply', 'Clip / Mirror: apply and leave', 'Running tools', ['tool:line'], ['Enter'], 'tool'),
  c('line.applyStay', 'Clip / Mirror: apply and stay', 'Running tools', ['tool:line'], ['Space'], 'tool'),
  c('line.cancel', 'Clip / Mirror: let the line go, then leave', 'Running tools', ['tool:line'], ['Escape'], 'tool'),
  c('clip.cycle', 'Clip: cycle Keep (Front, Back, Both)', 'Running tools', ['tool:clip'], ['Shift+KeyX'], 'tool'),
  c('create.make', 'Create: make the shape', 'Running tools', ['tool:create'], ['Enter'], 'tool'),
  c('create.cancel', 'Create: cancel, then leave', 'Running tools', ['tool:create'], ['Escape'], 'tool'),
  c('polygon.close', 'Polygon: close the outline, then make it', 'Running tools', ['tool:polygon'], ['Enter'], 'tool'),
  c('polygon.back', 'Polygon: take back the last point', 'Running tools', ['tool:polygon'], ['Backspace'], 'tool'),
  c('polygon.cancel', 'Polygon: cancel', 'Running tools', ['tool:polygon'], ['Escape'], 'tool'),
  c('paint.back', 'Paint / Sample: back to Select', 'Running tools', ['tool:paint'], ['Escape'], 'tool'),
  // The Outliner, while it has the focus (its arrow keys taken out again: the owner, 2026-11-20).
  c('outliner.rename', 'Rename', 'Outliner (when focused)', ['outliner'], ['F2'], 'panel'),
];

/** Keys that are not commands and stay as they are: shown in the editor, greyed, so nothing is hidden. */
export const FIXED_KEYS: readonly { label: string; keys: string }[] = [
  { label: 'Forge menu: move, choose, back', keys: 'Arrows, Enter or Space, Esc' },
  { label: 'Forge menu: previous / next section', keys: 'Page Up / Page Down' },
  { label: 'Snap flipped while held (any drag)', keys: 'Ctrl' },
  { label: 'Knife: in-line points only, while held', keys: 'Shift' },
  { label: 'Paint: sample while held', keys: 'Shift' },
  { label: 'Copy while dragging the gizmo', keys: 'Alt + drag' },
  { label: 'Camera: look, pan, orbit, move', keys: 'Right drag, middle drag, Alt + left drag, wheel' },
  { label: 'Walk / Play: move, jump, stance, walk or fly', keys: 'W A S D, Space, C or Ctrl, G' },
  { label: 'Close a menu, card, sheet or popup', keys: 'Esc' },
];

const BY_ID = new Map(SHORTCUT_COMMANDS.map((cmd) => [cmd.id, cmd]));
export const shortcutCommand = (id: string): ShortcutCommand | undefined => BY_ID.get(id);

/* ---------- chords ---------- */

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'OSLeft', 'OSRight']);

/** The parts of a key event a chord is read from. */
export interface ChordEvent { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }

/** The chord a key event makes (`Ctrl+Shift+KeyX`), or null for a modifier pressed alone. */
export function chordOf(e: ChordEvent): string | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  return `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.code}`;
}

/** A chord's key code (its last part) and modifiers. */
export function chordParts(chord: string): { code: string; ctrl: boolean; alt: boolean; shift: boolean } {
  const parts = chord.split('+');
  const code = parts[parts.length - 1]!;
  return { code, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift') };
}

const NAMED: Record<string, string> = {
  Escape: 'Esc', Delete: 'Del', Backspace: 'Backspace', Enter: 'Enter', Space: 'Space', Tab: 'Tab',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', PageUp: 'Page Up', PageDown: 'Page Down',
  Home: 'Home', End: 'End', Insert: 'Insert', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/',
  Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=',
  NumpadAdd: 'Numpad +', NumpadSubtract: 'Numpad −', NumpadMultiply: 'Numpad *', NumpadDivide: 'Numpad /', NumpadDecimal: 'Numpad .', NumpadEnter: 'Numpad Enter',
};
/** The user's own keyboard's letter for a code, where the browser says (`navigator.keyboard.getLayoutMap`). */
let layout: Map<string, string> | null = null;
export function loadKeyboardLayout(nav: { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } } | undefined): void {
  nav?.keyboard?.getLayoutMap?.().then((m) => { layout = m; emit(); }).catch(() => { /* not offered: the US letters stand */ });
}

/** A key code as a person reads it (`KeyZ` → `Z`, `Digit1` → `1`, `NumpadAdd` → `Numpad +`). */
export function codeLabel(code: string): string {
  const own = layout?.get(code);
  if (own && own.length === 1 && /^Key|^Digit/.test(code)) return own.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && /^Numpad\d$/.test(code)) return `Numpad ${code.slice(6)}`;
  return NAMED[code] ?? code;
}

/** A chord as a person reads it (`Ctrl+Shift+X`); Cmd in place of Ctrl on a Mac. */
export function chordLabel(chord: string, mac = isMac()): string {
  const p = chordParts(chord);
  return `${p.ctrl ? (mac ? 'Cmd+' : 'Ctrl+') : ''}${p.alt ? (mac ? 'Option+' : 'Alt+') : ''}${p.shift ? 'Shift+' : ''}${codeLabel(p.code)}`;
}
const isMac = (): boolean => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

/* ---------- the set in force ---------- */

const STORE_KEY = 's2u-forge-shortcuts';
/** The user's changes: a command's keys where they differ from its defaults. */
let custom: Record<string, string[]> = readStore();
const listeners = new Set<() => void>();
function emit(): void { for (const f of listeners) f(); }
/** Called whenever a key changes (the menus, tooltips and the editor redraw). Returns the unsubscribe. */
export function onShortcutsChange(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f); }

function readStore(): Record<string, string[]> {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; keys?: Record<string, unknown> };
    return sanitize(parsed.keys ?? {});
  } catch { return {}; }
}
function writeStore(): void {
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify({ version: 1, keys: custom })); } catch { /* storage refused: kept for this visit */ }
}
function sanitize(keys: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(keys)) {
    if (!BY_ID.has(id) || !Array.isArray(v)) continue;
    out[id] = v.filter((x): x is string => typeof x === 'string' && /^(Ctrl\+)?(Alt\+)?(Shift\+)?[A-Za-z0-9]+$/.test(x)).slice(0, 2);
  }
  return out;
}

/** A command's keys now (its defaults unless changed), at most two. */
export function keysOf(id: string): readonly string[] {
  return custom[id] ?? BY_ID.get(id)?.defaults ?? [];
}
/** Whether a command's keys differ from its defaults. */
export function isCustom(id: string): boolean {
  const cmd = BY_ID.get(id);
  return !!cmd && id in custom && custom[id]!.join() !== cmd.defaults.join();
}
/** Whether key event `e` is one of command `id`'s keys. */
export function isShortcut(id: string, e: ChordEvent): boolean {
  const ch = chordOf(e);
  return !!ch && keysOf(id).includes(ch);
}
/** A command's first key as a person reads it, or '' with none (the menus' key column, the tooltips). */
export function keyLabel(id: string): string {
  const k = keysOf(id)[0];
  return k ? chordLabel(k) : '';
}
/** A command's keys as a person reads them, joined ("F, Shift+A"), or '' with none. */
export function keysLabel(id: string): string {
  return keysOf(id).map((k) => chordLabel(k)).join(', ');
}

/** The commands whose keys include `chord`, in `scopes` (any of them), on `layer` (any, when absent). */
export function commandsOn(chord: string, scopes?: readonly ShortcutScope[], layer?: ShortcutLayer): ShortcutCommand[] {
  return SHORTCUT_COMMANDS.filter((cmd) => keysOf(cmd.id).includes(chord) && (!scopes || cmd.scopes.some((s) => scopes.includes(s))) && (!layer || cmd.layer === layer));
}

/* ---------- changing keys ---------- */

const history: Record<string, string[]>[] = [];
function remember(): void { history.push(structuredClone(custom)); if (history.length > 10) history.shift(); }
function commit(): void { writeStore(); emit(); }

/** A command's keys set (at most two; the same key twice taken once). */
export function setKeys(id: string, keys: readonly string[]): void {
  const cmd = BY_ID.get(id);
  if (!cmd) return;
  remember();
  const next = [...new Set(keys)].slice(0, 2);
  if (next.join() === cmd.defaults.join()) delete custom[id]; else custom[id] = next;
  commit();
}
/** Several commands' keys set as one change (one step of the editor's Undo): a key moved from one command to another. */
export function setKeysTogether(changes: readonly { id: string; keys: readonly string[] }[]): void {
  if (!changes.length) return;
  remember();
  for (const { id, keys } of changes) {
    const cmd = BY_ID.get(id);
    if (!cmd) continue;
    const next = [...new Set(keys)].slice(0, 2);
    if (next.join() === cmd.defaults.join()) delete custom[id]; else custom[id] = next;
  }
  commit();
}

/**
 * The editor's shortcuts held while the shortcut editor is open (its key slots read every key, Ctrl+Z among them):
 * the page, Geometry mode and the camera answer no key then (`keysPaused`).
 */
let paused = false;
export const keysPaused = (): boolean => paused;
export function pauseKeys(on: boolean): void { paused = on; }

/** A key taken off a command (the other command keeps it: `setKeys` on that one). */
export function removeKey(id: string, chord: string): void { setKeys(id, keysOf(id).filter((k) => k !== chord)); }
/** A command's keys back to its defaults. */
export function resetKeys(id: string): void { if (!(id in custom)) return; remember(); delete custom[id]; commit(); }
/** Every command's keys back to its defaults. */
export function resetAllKeys(): void { if (!Object.keys(custom).length) return; remember(); custom = {}; commit(); }
/** The last change taken back (up to ten); false with none left. */
export function undoKeyChange(): boolean { const was = history.pop(); if (!was) return false; custom = was; commit(); return true; }
export const canUndoKeyChange = (): boolean => history.length > 0;
/** How many commands differ from their defaults. */
export const customCount = (): number => SHORTCUT_COMMANDS.filter((cmd) => isCustom(cmd.id)).length;

/** The set as a file's text (the changes only), to keep or move to another browser. */
export function exportShortcuts(): string {
  return JSON.stringify({ format: 'forge-shortcuts', version: 1, keys: custom }, null, 2);
}
/** A set read from a file's text: its changes replace these (every other command back to its default). */
export function importShortcuts(text: string): { ok: true; count: number } | { ok: false; error: string } {
  let parsed: { format?: string; keys?: Record<string, unknown> };
  try { parsed = JSON.parse(text) as typeof parsed; } catch { return { ok: false, error: 'That file is not a shortcut set (it is not JSON).' }; }
  if (parsed.format !== 'forge-shortcuts' || !parsed.keys || typeof parsed.keys !== 'object') return { ok: false, error: 'That file is not a Forge shortcut set.' };
  remember();
  custom = sanitize(parsed.keys);
  commit();
  return { ok: true, count: Object.keys(custom).length };
}

/* ---------- warnings ---------- */

/** Another command that answers the same key at the same time (a clash), or in another mode or tool (a note). */
export interface KeyClash { command: ShortcutCommand; kind: 'clash' | 'shadow' }

/** The other commands `chord` would meet if given to command `id`. */
export function clashesFor(id: string, chord: string): KeyClash[] {
  const me = BY_ID.get(id);
  if (!me) return [];
  const out: KeyClash[] = [];
  for (const other of SHORTCUT_COMMANDS) {
    if (other.id === id || !keysOf(other.id).includes(chord)) continue;
    const together = other.scopes.some((s) => me.scopes.includes(s)) && other.layer === me.layer;
    out.push({ command: other, kind: together ? 'clash' : 'shadow' });
  }
  return out;
}

/** What the browser or the system does with a key: refused (it never reaches the page), or a warning. */
export interface KeyIssue { level: 'refuse' | 'strong' | 'warn' | 'note'; text: string }

const BROWSER_KEEPS: Record<string, string> = {
  'Ctrl+KeyW': 'close the tab', 'Ctrl+KeyT': 'open a new tab', 'Ctrl+KeyN': 'open a new window', 'Ctrl+Shift+KeyN': 'open a private window',
  'Ctrl+Shift+KeyT': 'reopen a closed tab', 'Ctrl+Tab': 'switch tabs', 'Ctrl+Shift+Tab': 'switch tabs', 'Alt+F4': 'close the window',
  'Ctrl+Shift+KeyW': 'close the window', 'Ctrl+Shift+KeyQ': 'quit the browser',
};
const SYSTEM_KEEPS: Record<string, string> = { 'Alt+Tab': 'switch windows', 'Ctrl+Alt+Delete': 'the system menu', 'Alt+Space': 'the window menu' };
const BROWSER_LOSES: Record<string, string> = {
  'Ctrl+KeyS': 'save the page', 'Ctrl+KeyP': 'print', 'Ctrl+KeyF': 'find on the page', 'Ctrl+KeyG': 'find the next match', 'Ctrl+KeyH': 'history',
  'Ctrl+KeyJ': 'downloads', 'Ctrl+KeyL': 'the address bar', 'Ctrl+KeyD': 'bookmark the page', 'Ctrl+KeyE': 'the address bar', 'Ctrl+KeyK': 'the address bar',
  'Ctrl+KeyU': 'view the page source', 'Ctrl+KeyO': 'open a file', 'Ctrl+KeyA': 'select all the page text', 'Ctrl+KeyB': 'bookmarks (some browsers)',
  'Ctrl+KeyI': 'page info (some browsers)', 'Ctrl+Shift+KeyB': 'the bookmarks bar', 'Ctrl+Shift+KeyI': 'the developer tools', 'Ctrl+Shift+KeyJ': 'the console',
  'Ctrl+Shift+KeyC': 'inspect an element', 'Ctrl+Shift+KeyDelete': 'clear browsing data', F1: 'help', F3: 'find the next match',
  F6: 'the address bar', F7: 'caret browsing', F10: 'the browser menu', F11: 'full screen', F12: 'the developer tools',
  'Alt+ArrowLeft': 'go back a page', 'Alt+ArrowRight': 'go forward a page', 'Ctrl+Equal': 'zoom in', 'Ctrl+Minus': 'zoom out', 'Ctrl+Digit0': 'reset the zoom',
  'Ctrl+NumpadAdd': 'zoom in', 'Ctrl+NumpadSubtract': 'zoom out', Space: 'scroll the page', 'Shift+Space': 'scroll the page up',
  PageUp: 'scroll the page', PageDown: 'scroll the page', Home: 'scroll to the top', End: 'scroll to the bottom',
};
const RELOADS: Record<string, string> = { F5: 'reload the page', 'Ctrl+KeyR': 'reload the page', 'Ctrl+Shift+KeyR': 'reload the page', 'Ctrl+F5': 'reload the page', 'Shift+F5': 'reload the page', 'Alt+Home': 'go to the home page' };
const FLY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC']);

/** What giving `chord` to command `id` would run into outside the command list, worst first. */
export function keyIssues(id: string, chord: string): KeyIssue[] {
  const out: KeyIssue[] = [];
  const p = chordParts(chord);
  const label = chordLabel(chord);
  if (SYSTEM_KEEPS[chord]) out.push({ level: 'refuse', text: `${label} is your system's (${SYSTEM_KEEPS[chord]}): the Forge never sees it.` });
  if (BROWSER_KEEPS[chord]) out.push({ level: 'refuse', text: `Your browser keeps ${label} (${BROWSER_KEEPS[chord]}): the Forge never sees it.` });
  if (/^(Meta|OS)/.test(p.code)) out.push({ level: 'refuse', text: 'The Windows / Cmd key is the system\'s.' });
  if (RELOADS[chord]) out.push({ level: 'strong', text: `${label} is your browser's ${RELOADS[chord]}. The Forge takes it while it has the keys, but if a text field or the address bar has the focus, the browser gets it and unsaved work is lost.` });
  else if (BROWSER_LOSES[chord]) out.push({ level: 'warn', text: `${label} is your browser's "${BROWSER_LOSES[chord]}". The Forge takes it over while it has the keys; with a text field focused, the browser's runs instead.` });
  const cmd = BY_ID.get(id);
  if (cmd && cmd.layer === 'mode' && !p.ctrl && !p.alt && FLY_CODES.has(p.code)) out.push({ level: 'note', text: `While the right mouse button is held, ${label} flies the camera; it does this command only when the mouse isn't held.` });
  if (!p.ctrl && !p.alt && cmd?.layer !== 'panel') out.push({ level: 'note', text: 'Does nothing while a text field has the focus.' });
  if (p.code.startsWith('Numpad')) out.push({ level: 'note', text: 'Numpad keys need Num Lock on.' });
  return out;
}
