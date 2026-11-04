import { readPreference, SETUP_KEY } from './startupSettings';

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
