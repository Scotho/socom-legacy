import { PAD_BUTTON_NAMES, readPreference, savePreference, SETUP_KEY } from './startupSettings';
import { controllerLabelFamily, isSteamFamily, steamButtonName } from './controllerLabels';

/**
 * The overlay's opening button as it is kept (MU2-16, a **browser adaptation**: the original has no overlay) -- the
 * saved value alone, without the overlay. Its rules, its writer and its readers' subscription stay with the overlay
 * (`./modern/overlay/binding`, which re-exports these); this module holds only what a page reads of the setting
 * without loading the overlay: the console's pad adapter (`./console/adapters/pad`, SEP-SHOW's free-touchpad check),
 * since under `console/` only the START hand-over loads the overlay (MU2-10c, `test/pageOverlaySeam.test.ts`).
 */

/** The default opening button: the standard mapping's 16 (Home / PS / Guide), which the original never reads. */
export const OVERLAY_HOME_BUTTON = 16;

/** Where the opening button is kept: the pad bindings' prefix of this browser's setup store. */
export const OVERLAY_BUTTON_KEY = `${SETUP_KEY}.pad.overlay`;

/** The highest button a binding may name (as `parseController`'s bindings: 0-31). */
export const OVERLAY_MAX_BUTTON = 31;

/** The opening button this browser keeps; absent or unreadable, 16. */
export function readOverlayButton(): number {
  const raw = readPreference(OVERLAY_BUTTON_KEY);
  if (raw === null || !/^\d+$/.test(raw)) return OVERLAY_HOME_BUTTON;
  const b = Number(raw);
  return b <= OVERLAY_MAX_BUTTON ? b : OVERLAY_HOME_BUTTON;
}

const subs = new Set<(button: number) => void>();

/** Keeps `button` as the opening button and tells every mounted reader (the overlay follows it without a remount). */
export function saveOverlayButton(button: number): void {
  if (!Number.isInteger(button) || button < 0 || button > OVERLAY_MAX_BUTTON) return;
  savePreference(OVERLAY_BUTTON_KEY, String(button));
  for (const cb of [...subs]) { try { cb(button); } catch (e) { console.error('overlay: a binding reader failed', e); } }
}

/** Calls `cb` with each new opening button saved on this page; answers the unsubscribe. */
export function onOverlayButtonChange(cb: (button: number) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/**
 * The button's name as the controller page named a binding (its view retired with CX-26; `../../padBinding` names them
 * alike: the PS2 pad's names, an Xbox pad's own, else "Button <n>"), and 16 the centre button.
 */
export function overlayButtonName(button: number, padId = ''): string {
  const family = controllerLabelFamily(padId);
  if (isSteamFamily(family)) return steamButtonName(button) ?? `Button ${button + 1}`;
  const xbox = family === 'xbox';
  if (button === OVERLAY_HOME_BUTTON) return xbox ? 'Guide' : 'Home (PS / Xbox Guide)';
  if (xbox) {
    const names = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'];
    if (names[button]) return names[button]!;
  }
  return PAD_BUTTON_NAMES[button] ?? `Button ${button + 1}`;
}
