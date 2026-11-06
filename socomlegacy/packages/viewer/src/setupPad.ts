import { ControllerInput, connectedPads, padKey } from './controllerInput';
import type { Input, PadLike, PadSource } from './gamepad';
import { readPreference, SETUP_KEY } from './startupSettings';

/**
 * This browser's device choice: "auto" (Automatic selection) or one pad's `index:id` -- the console's Options >
 * Controller; the in-game Settings' Controller (its view retired with CX-26) and the old setup page's picker
 * (`controllerSetup`, gone in CX-9b) wrote the same key.
 */
export const PAD_SELECTION_KEY = `${SETUP_KEY}.pad.selection`;

/**
 * The game's one pad reading (the owner, 2026-10-04: "also please make sure the game retains controller and mic settings
 * as the setup implies"): this browser's saved choices -- the device, the bindings, the dead zone, the crouch shortcut,
 * each pad's under its own profile (`./controllerInput` `ControllerInput`) -- applied wherever the game reads a pad: the
 * menus (`./menuInput` `attachMenuInput`) and the match (`./main` `padFrame`). A chosen pad that is not connected gives
 * way to the automatic choice (the first standard pad). Nothing customised, the logical pad is the physical one -- the
 * original's layout, its 0.15 adapter untouched (`calibrateStick` at the default). The menus read a pad only once every button
 * and stick has been at rest: a button held as they first read it (the launcher's
 * START) is not a fresh press; the match (`waitForRest: false`) flushes it at the loading hold's release instead,
 * as the original's state start does (research 116 R116.13, `FUN_002d9e00`; `./padFlush`).
 * A browser adaptation: settings and wiring, nothing of the game.
 */
export class GamePad {
  readonly input = new ControllerInput();
  /** The device asked for by the caller; null: the stored choice, read at each poll (OBF-12: a device chosen on the mapping
   *  screen over a running match is the match's at once). */
  private readonly fixed: string | null;
  /** `releaseCrouch` false for the menus: the crouch shortcut is the match's, its button stays the menus'. `pressClock`
   *  (MOVE-S6): the clock the stance press steps its game frames by (`ControllerInput.pressClock`). */
  constructor(opts: { wanted?: string | null; releaseCrouch?: boolean; waitForRest?: boolean; pressClock?: () => number } = {}) {
    this.fixed = opts.wanted === undefined ? null : (opts.wanted || 'auto');
    this.input.releaseCrouch = opts.releaseCrouch ?? true;
    this.input.waitForRest = opts.waitForRest ?? true;
    this.input.pressClock = opts.pressClock ?? null;
  }
  /** One frame's read: the chosen (or automatic) pad through its saved profile; null without one, or until at rest. */
  poll(source: PadSource): PadLike | null {
    const wanted = this.fixed ?? (readPreference(PAD_SELECTION_KEY) || 'auto');
    // OBF-12's review, fold 3: the chosen pad back at another index (a Bluetooth pad's drop) is still present when it is
    // the one connected pad with its id -- `ControllerInput.poll` then finds it so (OBF-9's `sameId`); two such, none.
    const pads = connectedPads(source);
    const id = wanted.slice(wanted.indexOf(':') + 1);
    const present = wanted !== 'auto' && (pads.some((p) => padKey(p) === wanted) || pads.filter((p) => p.id === id).length === 1);
    const selection = present ? wanted : 'auto';
    if (this.input.selection !== selection) this.input.select(selection);
    return this.input.poll(source);
  }
  /** The crouch shortcut's button held this frame (the profile's `crouch`, -1 off). */
  get crouch(): boolean { return this.input.crouch; }
  /** PP-5 (OT.R67): the profile's Prone bind held this frame (`prone`, -1 unbound). */
  get prone(): boolean { return this.input.prone; }
  /**
   * h59U9CLb (a browser adaptation, off by default): `input` with the profile's extra binds ORed in, off this frame's
   * read (`ControllerInput.applyExtras`); while `menuOpen`, untouched. Nothing stored, `input` itself.
   */
  extras(input: Input, menuOpen: boolean): Input { return this.input.applyExtras(input, menuOpen); }
  /** h59U9CLb: the extras' modifiers reset at the match's flush (a button held through it is no combo's press). */
  flushExtras(): void { this.input.flushExtras(); }
  /** OT.R107's fold: a menu took the press -- the pending stance press dropped until the button rests (`ControllerInput.cancelStancePress`). */
  cancelStancePress(): void { this.input.cancelStancePress(); }
}
