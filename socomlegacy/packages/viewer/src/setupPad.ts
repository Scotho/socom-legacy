import { ControllerInput, connectedPads, padKey } from './controllerInput';
import { PAD_BUTTON, PAD_PRESS, type Input, type PadLike, type PadSource } from './gamepad';
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
/**
 * OA-3's review fold F2 (the operator announcement plan; a browser adaptation, no original): a Cross the operator's say
 * toast takes (`./operatorToast`) never reaches the game. While a taker is registered (`takeCrossPress`), the first poll
 * of any reader that sees the logical Cross down FRESH -- after some poll saw it up since the registration, so a Cross
 * already held is the game's -- takes it: the taker is called once (and let go), and from that edge every reader's poll
 * reports Cross up until the physical release, so neither the round's Action nor the START menu's row (taken on CROSS let
 * go) nor a menu's focused button sees a press or a release. The one seam every game reader goes through
 * (`GamePad.poll`); a reader made with `ownsCross` (the toast's own) is never masked.
 */
const crossSeam: { taker: (() => void) | null; armed: boolean; held: boolean; pad: number } = { taker: null, armed: false, held: false, pad: -1 };

/** OA-3 fold 2 F3: a taken Cross still held (masked until the taken pad shows it up). */
export function crossTaken(): boolean { return crossSeam.held; }

/** OA-3 fold F2: register `f` to take the next fresh Cross (one shot); the answer lets it go. One taker at a time (the toast). */
export function takeCrossPress(f: () => void): () => void {
  crossSeam.taker = f;
  crossSeam.armed = false;
  return () => { if (crossSeam.taker === f) crossSeam.taker = null; };
}

/** OA-3 fold F2: one poll's pad through the seam -- the take, the mask while the taken press is held, the release. */
function crossThroughSeam(p: PadLike | null, owns: boolean): PadLike | null {
  if (!p) return p;
  const b = p.buttons[PAD_BUTTON.Cross];
  const down = b !== undefined && (b.pressed || b.value >= PAD_PRESS);
  // Fold 2 F2: the taken press is its pad's (`index`) -- only that pad's Cross up lets go of it, and only it is masked.
  if (!down) { if (p.index === crossSeam.pad) crossSeam.held = false; if (crossSeam.taker) crossSeam.armed = true; return p; }
  if (!crossSeam.held && crossSeam.taker && crossSeam.armed) {
    const f = crossSeam.taker;
    crossSeam.taker = null;
    crossSeam.armed = false;
    crossSeam.held = true;
    crossSeam.pad = p.index;
    f();
  }
  if (!crossSeam.held || owns || p.index !== crossSeam.pad) return p;
  const buttons = p.buttons.map((x, i) => (i === PAD_BUTTON.Cross ? { pressed: false, value: 0 } : x));
  return {
    id: p.id, index: p.index, connected: p.connected, mapping: p.mapping, axes: p.axes, buttons,
    ...(p.nativePressure !== undefined ? { nativePressure: p.nativePressure } : {}),
    ...(p.stanceCancelled !== undefined ? { stanceCancelled: p.stanceCancelled } : {}),
    ...(p.stanceOff !== undefined ? { stanceOff: p.stanceOff } : {}),
  };
}

export class GamePad {
  readonly input = new ControllerInput();
  /** The device asked for by the caller; null: the stored choice, read at each poll (OBF-12: a device chosen on the mapping
   *  screen over a running match is the match's at once). */
  private readonly fixed: string | null;
  /** `releaseCrouch` false for the menus: the crouch shortcut is the match's, its button stays the menus'. `pressClock`
   *  (MOVE-S6): the clock the stance press steps its game frames by (`ControllerInput.pressClock`). */
  /** OA-3 fold F2: the operator toast's own reader -- never masked by a taken Cross (`takeCrossPress`). */
  private readonly ownsCross: boolean;
  constructor(opts: { wanted?: string | null; releaseCrouch?: boolean; waitForRest?: boolean; pressClock?: () => number; ownsCross?: boolean } = {}) {
    this.fixed = opts.wanted === undefined ? null : (opts.wanted || 'auto');
    this.ownsCross = opts.ownsCross ?? false;
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
    // OA-3: a taken Cross whose pad is gone (no connected pad at its index) is let go -- else the mask and the toast's poll never end.
    if (crossSeam.held && !pads.some((p) => p.index === crossSeam.pad)) crossSeam.held = false;
    const id = wanted.slice(wanted.indexOf(':') + 1);
    const present = wanted !== 'auto' && (pads.some((p) => padKey(p) === wanted) || pads.filter((p) => p.id === id).length === 1);
    const selection = present ? wanted : 'auto';
    if (this.input.selection !== selection) this.input.select(selection);
    return crossThroughSeam(this.input.poll(source), this.ownsCross);   // OA-3 fold F2: a Cross the toast took, up for the game
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
