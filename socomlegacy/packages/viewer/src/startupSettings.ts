import { pageSettings } from './pageStore';
import { parseLayout, type PadLayout } from './padLayout';
import type { StanceMode } from './stanceButton';
/** Browser setup preferences, separate from the game's own options and memory card. */
export const SETUP_KEY = 's2u.startup.v1';
/**
 * The Picture setting (Modern or PS2) the test room's `./ui` `Ui.onLook` reads; the in-game Settings' Visuals page wrote it
 * (its view retired with CX-26), and the setup page's radios until CX-9b.
 */
export const VIEWER_LOOK_KEY = 's2u.viewer.look';
/**
 * The sixteen logical buttons of a `ControllerConfig`'s bindings, in the standard mapping's order (0 Cross .. 15 Right):
 * the names `./padBinding` and the overlay's binding read (`./modern/overlay/binding`); the mountable Controller view
 * (LU-3) showed them until CX-26, and the setup page's binding list, `controllerSetup` with its own copy, until CX-9b. A browser adaptation's labels (MU.R1).
 */
export const PAD_BUTTON_NAMES: readonly string[] = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];
/**
 * A pad profile: the sixteen bindings, the dead zone, and (PP-5, OT.R67) the Crouch and Prone binds -- a physical button
 * each, -1 unbound. `crouch` is the crouch shortcut's field, its saved values (-1, L3, L2, the touchpad) read as they
 * were; `prone` is new, absent from a profile saved before it (read as unbound). `layout` (LATER 380) is a pad of another
 * layout's taught raw-to-standard map (`./padLayout`), absent for a standard pad and for one not taught.
 */
export interface ControllerConfig { version: 1; bindings: number[]; deadZone: number; crouch: number; prone: number; nativePressure?: boolean; layout?: PadLayout }
export const defaultController = (): ControllerConfig => ({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, prone: -1 });
/**
 * The logical buttons the menus need to proceed: Cross, Circle, START (the review's last round), and the d-pad's four
 * directions (task W2ibPC6c: the START menu's leave and abort confirms start on NO and reach YES only by d-pad Left,
 * `./startMenu`; its rows walk by Up and Down -- a Replace that unbound one locked a player in the match). A browser
 * adaptation's guard: the menus read the logical pad (`./setupPad` `GamePad`), so a direction bound is one they read.
 * `./controllerInput` re-exports it (`resolveConflict`, `./padBinding`); defined here so the profile's load reads it
 * without an import cycle.
 */
export const MENU_REQUIRED: Readonly<Record<number, string>> = {
  0: 'Cross', 1: 'Circle', 9: 'START', 12: 'D-pad up', 13: 'D-pad down', 14: 'D-pad left', 15: 'D-pad right',
};
/**
 * Task W2ibPC6c's repair of a profile saved before the guard: a menu button (`MENU_REQUIRED`) left unbound is bound again
 * on load, by the controller's rule (2026-11-02), touching at most the one action that holds its button:
 * 1. its default button (the standard order's own, `defaultController`) free: restored there;
 * 2. else held by action X whose own default button is free: X back on its default, the slot on its own (the lockout as
 *    it happened: a Replace gave X the slot's button) -- only when no stance bind masks the slot's own button (PR #644's
 *    review: in SEPARATE a Crouch or Prone bind on it would leave the slot dead again), else (3);
 * 3. else the lowest standard button (0-15) free -- the button the Replace freed is not in the profile, and X's own
 *    default is held by (2)'s failing;
 * 4. else left as it is (Swap or Restore defaults).
 * A button is free when no action holds it and, in SEPARATE, neither the Crouch nor the Prone bind does: a bind masks its
 * button in the match in SEPARATE only (`./controllerInput` `poll`'s `taken`; the batch review's N1), so there a menu slot
 * put on it would still be dead in the START menu. Rules 1 and 2 run over every
 * unbound slot first, so (3) never takes another unbound slot's default. Each repair is said once (`console.info`, the
 * `[pad]` prefix as `[hd]`'s). Not written back: the load repairs each time, to the same result, and the profile's next
 * save (`ControllerInput.save`) stores it. A browser adaptation.
 */
function repairMenuBindings(bindings: number[], crouch: number, prone: number): number[] {
  const name = (physical: number): string => PAD_BUTTON_NAMES[physical] ?? `button ${physical}`;
  const separate = controllerStanceMode() === 'separate';
  const masked = (physical: number): boolean => separate && (physical === crouch || physical === prone);
  const free = (physical: number): boolean => !bindings.includes(physical) && !masked(physical);
  const said = (slot: number, what: string): void => { console.info(`[pad] ${MENU_REQUIRED[slot]} was unbound: ${what}`); };
  const rest: number[] = [];
  for (const slot of Object.keys(MENU_REQUIRED).map(Number)) {
    if (bindings[slot] !== -1) continue;
    if (free(slot)) { bindings[slot] = slot; said(slot, `restored to its default button (${name(slot)})`); continue; }
    const holder = bindings.indexOf(slot);
    if (holder >= 0 && free(holder) && !masked(slot)) {
      bindings[holder] = holder;
      bindings[slot] = slot;
      said(slot, `${name(holder)} moved back to its default button (${name(holder)}), and ${MENU_REQUIRED[slot]} restored to ${name(slot)}`);
      continue;
    }
    rest.push(slot);
  }
  for (const slot of rest) {
    const to = Array.from({ length: 16 }, (_, i) => i).find(free);
    if (to === undefined) continue;
    bindings[slot] = to;
    said(slot, `bound to ${name(to)} (its default button, ${name(slot)}, is held)`);
  }
  return bindings;
}
export function parseController(raw: string | null): ControllerConfig {
  try {
    const c = JSON.parse(raw ?? 'null') as (Omit<ControllerConfig, 'prone'> & { prone?: unknown }) | null;
    const prone = c?.prone === undefined ? -1 : c.prone;
    if (c?.version !== 1 || !Array.isArray(c.bindings) || c.bindings.length !== 16
      || c.bindings.some((v) => !Number.isInteger(v) || v < -1 || v > 31)
      || new Set(c.bindings.filter((v) => v !== -1)).size !== c.bindings.filter((v) => v !== -1).length
      || !Number.isFinite(c.deadZone) || c.deadZone < 0 || c.deadZone > 0.4
      || !Number.isInteger(c.crouch) || c.crouch < -1 || c.crouch > 31
      || typeof prone !== 'number' || !Number.isInteger(prone) || prone < -1 || prone > 31) return defaultController();
    const layout = parseLayout((c as { layout?: unknown }).layout);
    return { version: 1, bindings: repairMenuBindings([...c.bindings], c.crouch, prone), deadZone: c.deadZone, crouch: c.crouch, prone, ...(typeof c.nativePressure === 'boolean' ? { nativePressure: c.nativePressure } : {}), ...(layout ? { layout } : {}) };
  } catch { return defaultController(); }
}
/**
 * PP-5 (OT.R67; PP.R1, the owner: "It should be the default option. the fallback option should be having the ability to
 * bind prone and crouch as two separate keybinds"): this browser's stance mode -- COMBINED (`'pop'`, the prone-pop,
 * `../stanceButton` `PRONE_POP_ADAPTATION`) unless SEPARATE (`'separate'`) is chosen, one setting for every pad (the binds
 * are each pad profile's). The game reads it each frame (`main.ts`, `matchMount.ts`: `WalkMode.setStanceMode`; the pad's
 * reader, `./controllerInput` `poll`, for the binds). The key and its two values are the ones PP-5 saved, so a choice
 * made before STM.R1 still reads. A browser adaptation.
 */
export const STANCE_MODE_KEY = 's2u.startup.v1.stanceMode';
/** STM.R1 (the owner, 2026-10-30: "our two triangle modes. COMBINED and SEPARATE"): the Stance mode's words, the roller's (Options > Controller, Button mapping). */
export const STANCE_MODE_WORDS: Readonly<Record<StanceMode, string>> = { pop: 'COMBINED', separate: 'SEPARATE' };
/**
 * STM.R1 ("There should be tooltips explaining these two modes concicesly"): the Stance mode row's tooltip, one line per
 * mode -- the row's `about`, which the console shows in its side panel (it has no hover): Options > Controller's row and
 * the Button mapping's alike. SEPARATE's line is STM.R1's Prone on Triangle's button (`./controllerInput`
 * `cloneTriangleToProne`) and Triangle's stance disabled while Prone is bound (`./controllerInput` `poll`, the review's
 * F1); Crouch unbound until chosen (STM.R1a).
 */
export const STANCE_MODE_ABOUT = 'COMBINED: Triangle does it all -- tap to crouch, hold to go prone or dive; press Square during the drop or dive to pop back up. '
  + 'SEPARATE: Crouch and Prone get their own buttons; Prone takes Triangle\'s button, and Triangle stops changing stance while Prone is bound.';
/**
 * The saved stance mode: SEPARATE when chosen, else COMBINED. STM.R1 (the owner, 2026-10-30, reversing OBF-11's
 * `STANCE_SEPARATE_OFFERED_ADAPTATION`, which answered COMBINED whatever was saved): SEPARATE is offered again, so the
 * saved value is read as saved.
 */
export function controllerStanceMode(): StanceMode {
  return readPreference(STANCE_MODE_KEY) === 'separate' ? 'separate' : 'pop';
}
export function setControllerStanceMode(mode: StanceMode): void { savePreference(STANCE_MODE_KEY, mode); }
/**
 * SEP-ROWS (the owner, 2026-11-11: "that alias should now show a tooltip when viewing that setting and a warning icon when
 * separate is on and crouch and prone are not set. the tooltip saying they must be mapped in controller bindings"): the
 * Options > Controller Stance mode row's tip, and its warning mark's words. A browser adaptation.
 */
export const STANCE_SEPARATE_BINDS_TIP = 'SEPARATE needs Crouch and Prone mapped in Button mapping.';
/**
 * SEP-ROWS: whether SEPARATE leaves a stance out of reach on this profile -- Prone unbound, or Crouch unbound and not
 * reached by the light press of Prone's button on a pressure pad (PS2P: `./padBinding` `pressureLight`). Either one is
 * enough: a stance with no button is one the player cannot take. A browser adaptation.
 */
export function stanceBindsMissing(c: Pick<ControllerConfig, 'crouch' | 'prone'>, pressureCapable: boolean): boolean {
  return c.prone < 0 || (c.crouch < 0 && !pressureCapable);
}
/**
 * The picture's preset: the view, and the detail pass -- on under both. The PS2 picture draws it because the original does
 * (research 232 §4, PF-30: `FUN_003b6e10` D:L308360-308392, gated per visual by vparams bit 14 and its own range;
 * DETAIL_SWITCH_READING, DETAIL_BIT14_READING); the 2026-10-03 plan's "Detail textures off" for PS2 rested on research
 * 72's belief that `detail_buff` was dead on disc, which PF-30 read otherwise (OT.R79's parity fix, 2026-10-23: the
 * test room's PS2 button and the front end's alike).
 */
export function resolveVisuals(address: 'modern' | 'ps2' | null, stored: string | null): { view: 'modern' | 'ps2'; detail: boolean } {
  const view = address ?? (stored === 'ps2' ? 'ps2' : 'modern');
  return { view, detail: true };
}
/** This browser's choices (`SETUP_KEY`'s), through the page's one storage door (pageStore.ts; a missing or refused store reads null). */
export function readPreference(key: string): string | null {
  try { return pageSettings.get(key); } catch { return null; }
}
export function savePreference(key: string, value: string): void {
  try { pageSettings.set(key, value); } catch { /* Settings still work for this visit. */ }
}
