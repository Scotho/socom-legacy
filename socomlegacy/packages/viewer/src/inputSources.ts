/**
 * XBOX-DIAG's input sources (product track, **an instrument with no original**; `./matchDiag`): which input drove the
 * page, the menus apart from the match -- DOM key presses and pointer presses (capture, passive: read, never taken), the
 * Gamepad API's pads with any input (`./setupPad` `GamePad.poll`, the one reader the menus and the match share), and the
 * `gamepadconnected` / `gamepaddisconnected` events. Edge on Xbox starts in its "Browsing Controls" mode, where the
 * controller moves a cursor (b0's field read and the research behind XBOX-DIAG): a page whose menus counted pointer
 * presses and whose match counted no pad input is that mode in one row. Counts only: no key, no position, no target.
 * Installed once a page, at its entry; no import, so the entry stays small (OT.R12). It changes nothing the page does.
 */

export type InputSource = 'pad' | 'key' | 'ptr';
export type InputPhase = 'menu' | 'match';

/**
 * The counts, by phase and source; the menus' last source; the pad events. Units differ (review F4): `key` and `ptr` count
 * presses, `pad` counts the pad readers' polls that found input (every reader, every frame a stick or a button is held),
 * so `pad` against 0 is the question it answers, not how many presses.
 */
export interface SourcesSnapshot {
  menu: Record<InputSource, number>;
  match: Record<InputSource, number>;
  /** The source of the menus' last input before the match: the press that launched or readied it, at the latest. */
  last: InputSource | null;
  connected: number;
  disconnected: number;
}

const zero = (): Record<InputSource, number> => ({ pad: 0, key: 0, ptr: 0 });
let state: SourcesSnapshot = { menu: zero(), match: zero(), last: null, connected: 0, disconnected: 0 };
let phase: InputPhase = 'menu';

/** One input seen: counted in the phase it came in. */
export function noteInput(source: InputSource): void {
  state[phase][source]++;
  if (phase === 'menu') state.last = source;
}

/** The match began (its counts from zero) or ended (the menus again). */
export function setInputPhase(next: InputPhase): void {
  if (next === 'match') state.match = zero();
  phase = next;
}

export function inputPhase(): InputPhase { return phase; }

/** The counts now, a copy. */
export function inputSources(): SourcesSnapshot {
  return { menu: { ...state.menu }, match: { ...state.match }, last: state.last, connected: state.connected, disconnected: state.disconnected };
}

/** A pad read with any input: a button down or a stick past 0.05 (the room's own activity threshold's order). */
export function padHasInput(pad: { buttons?: ArrayLike<{ pressed?: boolean; value?: number }>; axes?: ArrayLike<number> } | null | undefined): boolean {
  if (!pad) return false;
  const b = pad.buttons, a = pad.axes;
  if (b) for (let i = 0; i < b.length; i++) { const x = b[i]; if (x && (x.pressed || (x.value ?? 0) >= 0.5)) return true; }
  if (a) for (let i = 0; i < a.length; i++) if (Math.abs(a[i] ?? 0) > 0.05) return true;
  return false;
}

interface Listened { addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void; removeEventListener(type: string, fn: (e: Event) => void, opts?: EventListenerOptions): void }
let installed = new WeakSet<object>();

/** The page's listeners: key and pointer presses (capture, passive), the pads' connect and disconnect. Once a window. */
export function installInputSources(win: Listened): () => void {
  if (installed.has(win)) return () => undefined;
  installed.add(win);
  const key = (e: Event): void => { if (!(e as KeyboardEvent).repeat) noteInput('key'); };
  const ptr = (): void => { noteInput('ptr'); };
  const on = (): void => { state.connected++; };
  const off = (): void => { state.disconnected++; };
  const opts = { capture: true, passive: true };
  win.addEventListener('keydown', key, opts);
  win.addEventListener('pointerdown', ptr, opts);
  win.addEventListener('gamepadconnected', on);
  win.addEventListener('gamepaddisconnected', off);
  return () => {
    installed.delete(win);
    win.removeEventListener('keydown', key, { capture: true });
    win.removeEventListener('pointerdown', ptr, { capture: true });
    win.removeEventListener('gamepadconnected', on);
    win.removeEventListener('gamepaddisconnected', off);
  };
}

/** Tests only. */
export function resetInputSourcesForTest(): void {
  state = { menu: zero(), match: zero(), last: null, connected: 0, disconnected: 0 };
  phase = 'menu';
  installed = new WeakSet<object>();
}
