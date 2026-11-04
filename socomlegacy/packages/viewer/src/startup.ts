/**
 * The input-readiness contract of the launcher's START (OT.R29; MU-F3), kept from the setup page of OT.R28 when CX-9b
 * removed that page with the old launcher's layout (CX.R8, the owner, 2026-10-12: "disposing of the old layout entirely
 * but keeping the plumbing beneath it where useful"): the modern Home's Input fact reads it (`./modern/home`), and the
 * console launcher's START holds the same rule (`./console/adapters/controls.ts`). A browser adaptation: nothing of the
 * game.
 */

/** An input the launcher's START accepts: a standard-layout pad, a touch device's page controls, or a keyboard. */
export type SupportedInput = 'controller' | 'touch' | 'keyboard';

/**
 * A connected standard-layout pad, else a touch device (`./touch` `touchDevice`), else a keyboard. Null: no supported
 * input yet. This is the setup page's rule (kept by the Forge's page); the console launcher's own gate is
 * `./console/adapters/controls` (LR-31, LR.R25: a pad or a touch screen only -- a key or a click no longer counts). The
 * keymap and the game's keys stay a development build's. A browser adaptation.
 */
export function supportedInput(f: { pad: boolean; touch: boolean; keyboard: boolean }): SupportedInput | null {
  return f.pad ? 'controller' : f.touch ? 'touch' : f.keyboard ? 'keyboard' : null;
}
