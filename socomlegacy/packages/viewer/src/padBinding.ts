import { pressurePad, PRESSURE_PAD_ID, PRESSURE_PAD_INDEX } from './pressurePad';
import { pressureConnectOffered } from './pressureDetect';
import { ControllerInput, MENU_REQUIRED, buttonDown, padHasTouchpad, resolveConflict } from './controllerInput';
import { readOverlayButton } from './modern/overlay/binding';
import { padFamily } from './padFamily';
import type { PadLike, PadSource } from './gamepad';
import {
  HOLD_TO_BIND_MS_ADAPTATION, STANDARD_AXIS_COUNT, STANDARD_BUTTON_COUNT, TEACH_STEPS, detectAxis, detectSource, sameSource,
  settledTrigger, type PadLayout, type RawAxis, type RawSource,
} from './padLayout';
import { PAD_SELECTION_KEY } from './setupPad';
import { PAD_BUTTON_NAMES, controllerStanceMode, defaultController, readPreference, savePreference } from './startupSettings';
import { EMPTY_PAD_EXTRAS, parsePadExtras, type DropReason, type ExtraAction, type ExtraWarning } from './padExtras';

/**
 * The pad-binding machine, with no DOM (CX-14 of `docs/plans/2026-10-11-console-launcher.md`; CX.R13, OT.R60): the
 * plumbing the setup page's Controller view (`mountControllerView`, retired with CX-26) held, lifted out so the console
 * launcher's button mapping screen (`./console/render/remap`, the grammar's pushed screen) drives the same rules over the
 * same keys. A browser adaptation with no original (MU.R1, OT.R28): settings and wiring, nothing of the
 * game's own behaviour.
 *
 * **The same keys.** It holds its own `./controllerInput` `ControllerInput` -- the class the game's `./setupPad`
 * `GamePad` reads through -- so every value goes where the game reads it: the device choice under `PAD_SELECTION_KEY`
 * (through `store`, the page's one storage door by default, `./startupSettings`), the bindings, dead zone and crouch
 * shortcut under the chosen pad's profile (`ControllerInput.save`, `s2u.startup.v1.pad.<profile>`, through the same door).
 *
 * **The same rules.** A binding is listened for only once every button is released, then taken from the one button
 * pressed; a button already bound asks Swap / Replace / Cancel (`resolveConflict`, which refuses to unbind Cross,
 * Circle, START or a d-pad direction, the question then staying); L1 + R1 together, 12 s with no press (`LISTEN_MS`), a lost window, a pad
 * that leaves or stops being standard-layout end it; Restore defaults writes `defaultController()`; the bindings, the dead
 * zone and the crouch shortcut change only with a standard-layout pad chosen (its profile is what they are saved under).
 *
 * The machine says what happened (`onChange`, one `BindingEvent` each); its host draws the words. Its frame is the
 * host's: `poll` reads the pads, `step` advances a listen, `frame` is both.
 */

/** The listen's timeout, as the setup page's (`ControllerSetup.listen`: 12000 ms). */
export const LISTEN_MS = 12000;
/** LATER 380: the teach pass ends when the pad has sent nothing this long (the way out; the port's own choice). */
export const TEACH_IDLE_MS_ADAPTATION = 20000;

/** Where the device choice is read and written. */
export interface PadBindingStore {
  read(key: string): string | null;
  save(key: string, value: string): void;
}
/** The page's one storage door (`./startupSettings`). */
export const PAGE_BINDING_STORE: PadBindingStore = { read: readPreference, save: savePreference };

export interface PadBindingOptions {
  /** The pads (`navigator` in a page). */
  pads?: PadSource;
  /** The clock of the listen timeout (`performance.now` in a page; the frame's `now` is on the same base). */
  now?: () => number;
  store?: PadBindingStore;
  /** LATER 380: how long the one button is held before it binds (`HOLD_TO_BIND_MS_ADAPTATION`; 0 takes the press at once). */
  holdMs?: number;
}

export type Resolution = 'swap' | 'replace' | 'cancel';

/** The conflict's question: the button pressed for `action` already drives `occupied`; `refused` once a Replace was refused. */
export interface BindingQuestion { action: number; physical: number; occupied: number; refused: string | null }

/** Why a listen ended without a binding. `idle`: the host stopped it (a lost window, a new device, Restore, hidden). */
export type BindingEnd = 'idle' | 'cancelled' | 'timeout' | 'disconnected';

export type BindingEvent =
  | { kind: 'listen'; action: number }
  | { kind: 'released'; action: number }
  | { kind: 'conflict'; question: BindingQuestion }
  | { kind: 'refused'; question: BindingQuestion; words: string }
  | { kind: 'bound'; action: number; physical: number }
  | { kind: 'end'; action: number; why: BindingEnd }
  | { kind: 'restored' }
  | { kind: 'config' }
  | { kind: 'device' }
  /** LATER 380: the teach pass's step `step` (`TEACH_STEPS`) waits for its input; `taught`: the layout saved. */
  | { kind: 'teach'; step: number }
  | { kind: 'taught' }
  /** h59U9CLb: an extra bind added (`listenExtra`), one removed, or all cleared. */
  | { kind: 'extra'; change: 'added' | 'removed' | 'cleared' };

/** One logical button (`PAD_BUTTON_NAMES`' order) and the physical button that drives it (-1 unbound). */
export interface BindingAction { index: number; name: string; physical: number; custom: boolean }

/**
 * PP-5 (OT.R67; PP.R1: "bind prone and crouch as two separate keybinds, as those who use emulators do"): the Crouch and
 * Prone binds are listened for as the sixteen are (`listen`), by these ids after them. A bind takes a button an action
 * uses without a question -- the match masks it (`./controllerInput`, as the crouch shortcut did) -- and asks Swap /
 * Replace / Cancel when the other bind holds it. Each is unbound by default.
 */
export const CROUCH_BIND = 16;
export const PRONE_BIND = 17;
/**
 * h59U9CLb (a browser adaptation, off by default): the extra binds' listens, by these ids after the binds -- a double bind
 * (the one button held, as an action's listen) and a combo (the modifier held alone, then the button with it, both held
 * the hold's time). Each saves an extra (`../padExtras`) under the profile's extras key, validated as the match reads it;
 * no button's own action changes (Q2). L1 and R1 together cancel, as every listen.
 */
export const EXTRA_DOUBLE_LISTEN = 18;
export const EXTRA_COMBO_LISTEN = 19;
/** h59U9CLb: one extra as the mapping screen lists it (the doubles first, then the combos); `modifier` -1 for a double. */
export interface ExtraRow { kind: 'double' | 'combo'; modifier: number; button: number; action: ExtraAction; warning?: ExtraWarning }

const XBOX_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'];
/** OBF-10: the standard mapping's centre button (16), the Xbox pad's Guide (`../modern/overlay/binding` names it so). */
const XBOX_GUIDE = 16;
/**
 * OBF-10 (the owner: "playstation pad rebinding on the menu"; a browser adaptation): a PlayStation pad's own print for the
 * buttons it names otherwise than the PS2 pad -- 8 Share (Create on a DualSense), 9 Options, 16 the PS button, 17 the
 * touchpad's click -- where the PS2's words (Select, Start) or "Button 17 / 18" named them on the mapping screen, its
 * toast and its question. The sixteen actions keep the PS2's names (`PAD_BUTTON_NAMES`); only the physical button's
 * label changes, as an Xbox pad's does.
 */
const PLAYSTATION_NAMES: Readonly<Record<number, string>> = { 8: 'Share', 9: 'Options', 16: 'PS', 17: 'Touchpad' };
/** The DualSense pads (and the Edge), whose button 8 is printed Create: by name, or Sony's products 0ce6 and 0df2. */
const DUALSENSE_ID = /dualsense|0ce6|0df2/i;

export class PadBinding {
  readonly input = new ControllerInput();
  private readonly pads: PadSource;
  private readonly clock: () => number;
  private readonly store: PadBindingStore;
  private readonly subs = new Set<(e: BindingEvent) => void>();
  private at = -1;
  private wasReleased = false;
  private until = 0;
  private asked: BindingQuestion | null = null;
  private readonly holdMs: number;
  /** The one button held toward a binding, and since when (-1 none). */
  private holdPhysical = -1;
  private holdSince = 0;
  /** LATER 380's pass: the step (-1 none), the pad at rest, the layout taught so far, the input held, a release awaited. */
  private teachAt = -1;
  private teachRest: Pick<PadLike, 'buttons' | 'axes'> | null = null;
  private teachLayout: PadLayout | null = null;
  private teachHeld: RawSource | RawAxis | null = null;
  private teachWait = false;
  private teachIdle = 0;
  /** h59U9CLb: the extra listened for -- its action, and a combo's modifier held so far (-1 none); the last one added. */
  private extraAction: ExtraAction = 'fire';
  private extraMod = -1;
  private extraLast: ExtraRow | null = null;
  /** h59U9CLb, the mapping screen's own: the Extra binds row opened, and the action each Add row offers now. */
  extrasOpen = false;
  readonly addAction: { double: ExtraAction; combo: ExtraAction } = { double: 'fire', combo: 'fire' };

  constructor(o: PadBindingOptions = {}) {
    this.pads = o.pads ?? ((globalThis.navigator ?? {}) as PadSource);
    this.clock = o.now ?? ((): number => globalThis.performance?.now() ?? Date.now());
    this.store = o.store ?? PAGE_BINDING_STORE;
    this.holdMs = o.holdMs ?? HOLD_TO_BIND_MS_ADAPTATION;
    this.input.select(this.store.read(PAD_SELECTION_KEY) || 'auto');   // the device chosen on an earlier visit
  }

  /** Says each change; answers the unsubscribe. */
  onChange(cb: (e: BindingEvent) => void): () => void { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  private emit(e: BindingEvent): void { for (const cb of [...this.subs]) cb(e); }

  /* ---------- reads ---------- */

  /** The pad read this frame (the chosen one, or the automatic choice), raw; null without one. */
  get raw(): PadLike | null { return this.input.raw; }
  /** A standard-layout pad is chosen. */
  standard(): boolean { return this.input.raw?.mapping === 'standard'; }
  /** The chosen pad reads as the standard layout -- a standard pad, or one of another layout taught (LATER 380): the
   *  bindings, dead zone and binds can change. */
  usable(): boolean { return !!this.input.raw && (this.standard() || !!this.input.layout()); }
  /** A pad of another layout is chosen, taught or not: the pass can teach it (LATER 380). */
  teachable(): boolean { return !!this.input.raw && !this.standard(); }
  /** The chosen pad has a touchpad's click (a Sony pad of the standard layout with more than 17 buttons). */
  touchpad(): boolean { return padHasTouchpad(this.input.raw); }
  /** A listen's name: an action's (`PAD_BUTTON_NAMES`), or Crouch and Prone (PP-5). */
  bindName(action: number): string {
    return action === CROUCH_BIND ? 'Crouch' : action === PRONE_BIND ? 'Prone'
      : action === EXTRA_DOUBLE_LISTEN ? 'Double bind' : action === EXTRA_COMBO_LISTEN ? 'Combo bind' : PAD_BUTTON_NAMES[action] ?? '';
  }
  /** h59U9CLb: the profile's extra binds, validated as the match reads them: the doubles, then the combos. */
  extraList(): ExtraRow[] {
    const x = this.input.extras;
    return [
      ...x.doubles.map((d): ExtraRow => ({ kind: 'double', modifier: -1, button: d.button, action: d.action })),
      ...x.combos.map((c): ExtraRow => ({ kind: 'combo', modifier: c.modifier, button: c.button, action: c.action, ...(c.warning ? { warning: c.warning } : {}) })),
    ];
  }
  /** h59U9CLb: a combo's modifier held so far in its listen (-1 none). */
  extraModifier(): number { return this.at === EXTRA_COMBO_LISTEN ? this.extraMod : -1; }
  /** h59U9CLb: the extra the last listen added (the host's words), or null. */
  lastExtra(): ExtraRow | null { return this.extraLast; }
  /** The sixteen logical buttons with their bindings. */
  actions(): BindingAction[] {
    const b = this.input.config.bindings;
    return PAD_BUTTON_NAMES.map((name, index) => ({ index, name, physical: b[index] ?? -1, custom: b[index] !== index }));
  }
  /** A physical button's name for the chosen pad (an Xbox or a PlayStation pad's own words, OBF-10; `Unbound` for -1). */
  label(physical: number): string {
    if (physical < 0) return 'Unbound';
    const id = this.input.raw?.id ?? '';
    const family = padFamily(id);
    if (family === 'xbox') return physical === XBOX_GUIDE ? 'Guide' : XBOX_NAMES[physical] ?? PAD_BUTTON_NAMES[physical] ?? `Button ${physical + 1}`;
    if (family === 'playstation' && PLAYSTATION_NAMES[physical]) return physical === 8 && DUALSENSE_ID.test(id) ? 'Create' : PLAYSTATION_NAMES[physical]!;
    return PAD_BUTTON_NAMES[physical] ?? `Button ${physical + 1}`;
  }
  /** Browser adaptation: opt into real pressure; an on/off device cannot synthesize it. Research 373. */
  async connectPressure(): Promise<boolean> {
    if (!await pressurePad.connect()) return false;
    this.select(`${PRESSURE_PAD_INDEX}:${PRESSURE_PAD_ID}`);
    return true;
  }
  /** PS2P: the WebHID Connect row is offered -- Chromium (WebHID) with a 054c:0268 pad connected (`./pressureDetect`). */
  pressureConnectable(): boolean { return pressureConnectOffered(this.input.devices); }
  /**
   * PS2P: the chosen pad is pressure-capable and SEPARATE's Crouch and Prone share one button -- its light and its firm
   * press (`ControllerInput.poll`, `StancePress`); the mapping's two rows say which.
   */
  pressureSplit(): boolean { const c = this.input.config; return c.prone >= 0 && c.crouch === c.prone && this.input.pressureCapable(); }
  /**
   * PS2P fold (seat 5d, 2026-11-01): the physical button whose light press is Crouch's while pressure is active -- SEPARATE,
   * a pressure-capable pad, Prone bound (`ControllerInput.poll`'s `StancePress` reads Prone's button) -- else -1.
   */
  pressureLight(): number {
    const c = this.input.config;
    return controllerStanceMode() === 'separate' && c.prone >= 0 && this.input.pressureCapable() ? c.prone : -1;
  }
  deadZone(): number { return this.input.config.deadZone; }
  crouch(): number { return this.input.config.crouch; }
  prone(): number { return this.input.config.prone; }
  selection(): string { return this.input.selection; }
  /** The logical button listened for, or -1. */
  listening(): number { return this.at; }
  /** Every button has been released since the listen began (the next single press is taken). */
  released(): boolean { return this.at >= 0 && this.wasReleased; }
  /** The listen's time left in ms (0 when none). */
  remaining(now = this.clock()): number { return this.at < 0 ? 0 : Math.max(0, this.until - now); }
  /** The conflict's question, while it is asked. */
  question(): BindingQuestion | null { return this.asked; }
  /** A binding is being listened for and no question is asked, or the pass runs: the host's pad walker stands down. */
  capturing(): boolean { return (this.at >= 0 && !this.asked) || this.teachAt >= 0; }
  /** How far the hold toward a binding has come, 0-1 (LATER 380: the ring round the button). */
  holdProgress(now = this.clock()): number {
    if ((this.at < 0 && this.teachAt < 0) || (this.holdPhysical < 0 && !this.teachHeld)) return 0;
    return this.holdMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - this.holdSince) / this.holdMs));
  }
  /** The physical button held toward a binding (-1 none): the ring is drawn round it. */
  holding(): number { return this.at >= 0 ? this.holdPhysical : -1; }
  /** The physical buttons down this frame on the pad read as the standard layout (none without one). */
  down(): number[] { return (this.input.view?.buttons ?? []).flatMap((b, i) => (buttonDown(b) ? [i] : [])); }
  /** The pass's step while it runs: its index, words, whether it may be skipped, the steps in all, the hold's progress. */
  teachState(now = this.clock()): { step: number; name: string; required: boolean; total: number; progress: number; waiting: boolean; taught: readonly boolean[] } | null {
    const s = this.teachAt >= 0 ? TEACH_STEPS[this.teachAt] : undefined;
    // Each step's own: taught (its source in the layout being built), else skipped or still to come.
    const l = this.teachLayout;
    const taught = TEACH_STEPS.map((x) => !!l && (x.kind === 'button' ? l.buttons[x.target] : l.axes[x.target]) != null);
    return s ? { step: this.teachAt, name: s.name, required: s.required, total: TEACH_STEPS.length, progress: this.holdProgress(now), waiting: this.teachWait, taught } : null;
  }

  /* ---------- the frame ---------- */

  /** Reads the pads (the host's frame, before it draws the device list). Answers the chosen pad, raw. */
  poll(pads: PadSource = this.pads): PadLike | null { this.input.poll(pads); return this.input.raw; }

  /** Advances a listen by one frame at `now` (after `poll`). */
  step(now: number): void {
    if (this.teachAt >= 0) { this.teachStep(now); return; }
    if (this.at < 0) return;
    if (!this.usable() || !this.input.view) { this.finish('disconnected'); return; }
    if (this.asked) return;
    const pad = this.input.view;
    if (pad.buttons[4] && pad.buttons[5] && buttonDown(pad.buttons[4]) && buttonDown(pad.buttons[5])) { this.finish('cancelled'); return; }
    if (now > this.until) { this.finish('timeout'); return; }
    const down = pad.buttons.map((b, i) => (buttonDown(b) ? i : -1)).filter((i) => i >= 0);
    if (!down.length && !this.wasReleased) {
      this.wasReleased = true;
      this.emit({ kind: 'released', action: this.at });
    }
    if (!this.wasReleased) return;
    if (this.at === EXTRA_DOUBLE_LISTEN || this.at === EXTRA_COMBO_LISTEN) { this.extraStep(down, now); return; }
    // LATER 380 ("hold button style"): the one button held `holdMs` binds; a release, or a second button, starts over.
    if (down.length !== 1) { this.holdPhysical = -1; return; }
    const physical = down[0]!;
    if (physical !== this.holdPhysical) { this.holdPhysical = physical; this.holdSince = now; }
    if (now - this.holdSince < this.holdMs) return;
    this.holdPhysical = -1;
    const c = this.input.config;
    const bindListen = this.at === CROUCH_BIND || this.at === PRONE_BIND;
    // The batch review's F1: a bind would mask its button in the match, so it never takes one the menus need (Cross,
    // Circle, START, the d-pad: `MENU_REQUIRED`): refused, the listen kept for another button.
    const menu = bindListen ? c.bindings.findIndex((b, i) => b === physical && MENU_REQUIRED[i] !== undefined) : -1;
    if (menu >= 0) {
      const words = `${MENU_REQUIRED[menu]} must stay a menu button: Crouch and Prone cannot take Cross, Circle, START or the d-pad. Hold another button.`;
      this.wasReleased = false;
      this.emit({ kind: 'refused', question: { action: this.at, physical, occupied: menu, refused: words }, words });
      return;
    }
    // A bind's button held by the other bind asks; an action's it takes (masked). An action's held by another action
    // asks, as before; one held by a bind asks too (the batch review's F4: masked, the action would be dead in a match).
    const bindHolding = c.crouch === physical ? CROUCH_BIND : c.prone === physical ? PRONE_BIND : -1;
    const occupied = this.at === CROUCH_BIND ? (c.prone === physical ? PRONE_BIND : -1)
      : this.at === PRONE_BIND ? (c.crouch === physical ? CROUCH_BIND : -1)
        : ((i) => (i >= 0 ? i : bindHolding))(c.bindings.findIndex((b, i) => b === physical && i !== this.at));
    if (occupied >= 0) {
      this.asked = { action: this.at, physical, occupied, refused: null };
      this.emit({ kind: 'conflict', question: this.asked });
    } else this.bind(physical);
  }

  /** One frame: `poll` then `step`. */
  frame(now = this.clock(), pads: PadSource = this.pads): void { this.poll(pads); this.step(now); }

  /* ---------- the actions ---------- */

  /** Listens for logical button `action`'s new binding; refused (false) unless the pad reads as the standard layout. */
  listen(action: number): boolean {
    if (!this.usable() || this.teachAt >= 0) return false;
    this.at = action; this.wasReleased = false; this.until = this.clock() + LISTEN_MS; this.asked = null; this.holdPhysical = -1;
    this.emit({ kind: 'listen', action });
    return true;
  }

  /**
   * h59U9CLb: listens for an extra bind adding `action` -- a double bind (`kind` 'double') or a combo ('combo'); refused
   * (false) as `listen` is, unless the pad reads as the standard layout.
   */
  listenExtra(kind: 'double' | 'combo', action: ExtraAction): boolean {
    if (!this.listen(kind === 'double' ? EXTRA_DOUBLE_LISTEN : EXTRA_COMBO_LISTEN)) return false;
    this.extraAction = action; this.extraMod = -1;
    return true;
  }
  /** h59U9CLb: the extra at `index` of `extraList` removed, under the profile. */
  removeExtra(index: number): void {
    const rows = this.extraList();
    if (!rows[index]) return;
    this.saveExtraRows(rows.filter((_, i) => i !== index));
    this.emit({ kind: 'extra', change: 'removed' });
  }
  /** h59U9CLb: every extra bind removed, under the profile. */
  clearExtras(): void {
    this.finish('idle');
    this.input.saveExtras(EMPTY_PAD_EXTRAS);
    this.emit({ kind: 'extra', change: 'cleared' });
  }

  /** The conflict's answer. Cancel ends the listen; a refused Replace keeps the question (Swap or Cancel). */
  answer(r: Resolution): void {
    if (r === 'cancel') { this.finish('cancelled'); return; }
    const q = this.asked;
    if (!q) return;
    if (q.action === CROUCH_BIND || q.action === PRONE_BIND) {
      // Between the two binds: Swap gives the other this one's button, Replace unbinds it.
      this.setBind(q.occupied, r === 'swap' ? this.bindOf(q.action) : -1, false);
      this.bind(q.physical);
      return;
    }
    if (q.occupied === CROUCH_BIND || q.occupied === PRONE_BIND) {
      // An action onto a bind's button: Swap gives the bind the action's old button, Replace unbinds the bind.
      this.setBind(q.occupied, r === 'swap' ? (this.input.config.bindings[q.action] ?? -1) : -1, false);
      this.bind(q.physical);
      return;
    }
    const out = resolveConflict(this.input.config.bindings, this.at, q.occupied, r);
    if (out.refused) { q.refused = out.refused; this.emit({ kind: 'refused', question: q, words: out.refused }); return; }
    this.input.config.bindings = out.bindings;
    this.bind(q.physical);
  }

  /** Cancels (the player's: a Cancel control, Escape, Circle). */
  cancel(): void { this.finish('cancelled'); }

  /** The host stops a listen or the pass (hidden, closed); nothing when neither runs. */
  stop(): void { if (this.at >= 0 || this.teachAt >= 0) this.finish('idle'); }

  /** The window lost: a listen or the pass ends, and the pad is not read until it is back (`focus`). */
  blur(): void { if (this.at >= 0 || this.teachAt >= 0) this.finish('idle'); this.input.focus(false); }
  focus(): void { this.input.focus(true); }

  /** Chooses the device (`auto` or a pad's `index:id`) and keeps the choice. */
  select(key: string): void {
    this.finish('idle');
    this.input.select(key);
    this.store.save(PAD_SELECTION_KEY, key);
    this.emit({ kind: 'device' });
  }

  /**
   * Restore defaults: `defaultController()` under the chosen pad's profile. STM.R1 with the review's F1: in SEPARATE the
   * clone is made again (Prone on Triangle's button, Crouch unbound: STM.R1a), so a restore ends where entering SEPARATE
   * does -- on a pressure pad Crouch on the same button too (PS2P, `bindPressureCrouch`; LATER 663); a touchpad's Crouch
   * stays the mode change's alone (SEP-SHOW). In COMBINED Prone stays unbound. A browser adaptation (OT.R28).
   */
  restoreDefaults(): void {
    this.finish('idle');
    const layout = this.input.config.layout;       // a taught pad stays taught (LATER 380): its layout is no binding
    this.input.config = { ...defaultController(), ...(layout ? { layout } : {}) };
    this.input.save();
    if (controllerStanceMode() === 'separate') {
      this.input.cloneTriangleToProne();
      this.input.bindPressureCrouch();                         // PS2P: as `enterSeparate` (LATER 663)
    }
    // h59U9CLb: the extra binds cleared with the rest (written only where the profile holds any record of them).
    if (this.input.hasStoredExtras()) this.input.saveExtras(EMPTY_PAD_EXTRAS);
    this.emit({ kind: 'restored' });
  }

  /** The stick dead zone, 0-0.4 (`parseController`'s range), under the profile. */
  setDeadZone(v: number): void {
    this.input.config.deadZone = Math.max(0, Math.min(0.4, v));
    this.input.save();
    this.emit({ kind: 'config' });
  }

  /** The Crouch bind's physical button (-1 unbound), under the profile. */
  setCrouch(v: number): void { this.setBind(CROUCH_BIND, v); }
  /** PP-5: the Prone bind's physical button (-1 unbound), under the profile. */
  setProne(v: number): void { this.setBind(PRONE_BIND, v); }
  /**
   * STM.R1: SEPARATE entered -- an unbound Prone takes Triangle's button (`ControllerInput.cloneTriangleToProne`), said.
   * SEP-SHOW: then a touchpad pad's unbound Crouch takes a free touchpad (`ControllerInput.bindTouchpadCrouch`, the
   * overlay's button read as it is kept). Answers whether Crouch was bound so (the caller's toast).
   */
  enterSeparate(): boolean {
    const cloned = this.input.cloneTriangleToProne();
    const pressure = this.input.bindPressureCrouch();          // PS2P: a pressure pad's Crouch on Prone's Triangle (light)
    const crouch = this.input.bindTouchpadCrouch(readOverlayButton());
    if (cloned || pressure || crouch) this.emit({ kind: 'config' });
    return crouch;
  }

  private bindOf(id: number): number { return id === CROUCH_BIND ? this.input.config.crouch : this.input.config.prone; }
  private setBind(id: number, v: number, save = true): void {
    if (id === CROUCH_BIND) this.input.config.crouch = v; else this.input.config.prone = v;
    if (!save) return;
    this.input.save();
    this.emit({ kind: 'config' });
  }

  dispose(): void { this.subs.clear(); }

  /* ---------- LATER 380: the teach pass ---------- */

  /**
   * Teaches the chosen pad of another layout: each of `TEACH_STEPS` in turn waits for the pad let go, then the one input
   * held `holdMs` (a raw button, a trigger axis, a hat's direction; for a stick step, its axis), refusing one already
   * taught; the last step saves the layout under the pad's profile. False without such a pad, or while a listen runs.
   */
  teach(): boolean {
    const raw = this.input.raw;
    if (!raw || this.standard() || this.at >= 0) return false;
    // At rest every button is up; the axes as they lie now (a hat's rest is outside [-1, 1], a trigger's at one end).
    this.teachRest = { buttons: raw.buttons.map(() => ({ pressed: false, value: 0 })), axes: [...raw.axes] };
    this.teachLayout = { version: 1, buttons: Array.from({ length: STANDARD_BUTTON_COUNT }, () => null), axes: Array.from({ length: STANDARD_AXIS_COUNT }, () => null) };
    // A button still held from what began the pass is let go first; a pad at rest is listened to at once.
    this.teachAt = 0; this.teachHeld = null; this.teachWait = raw.buttons.some(buttonDown); this.teachIdle = this.clock();
    this.emit({ kind: 'teach', step: 0 });
    return true;
  }

  /** Skips the pass's step when it may be skipped (not the menus' buttons, the d-pad or the sticks). */
  skipStep(): boolean {
    const s = this.teachAt >= 0 ? TEACH_STEPS[this.teachAt] : undefined;
    if (!s || s.required) return false;
    this.nextStep();
    return true;
  }

  private nextStep(): void {
    this.teachAt++; this.teachHeld = null; this.teachWait = true;
    if (this.teachAt < TEACH_STEPS.length) { this.emit({ kind: 'teach', step: this.teachAt }); return; }
    this.input.config = { ...this.input.config, layout: this.teachLayout! };
    this.input.save();
    this.teachAt = -1; this.teachLayout = null; this.teachRest = null;
    this.emit({ kind: 'taught' });
  }

  private teachStep(now: number): void {
    const pad = this.input.raw, layout = this.teachLayout!;
    let rest = this.teachRest!;
    if (!pad || this.standard()) { this.finish('disconnected'); return; }
    const s = TEACH_STEPS[this.teachAt]!;
    // A trigger taught from its untouched 0 rests at -1 once let go: its source and the pass's rest follow, so the pad
    // reads as let go and the trigger's travel spans its whole pull. L2 and R2 only (standard buttons 6, 7): a d-pad or
    // another button on a plain axis resting at 0 is pressed both ways, and its other direction is no settle (B178).
    layout.buttons.forEach((b, i) => {
      const settled = b && (i === 6 || i === 7) ? settledTrigger(b, pad) : null;
      if (settled && 'from' in settled) {
        layout.buttons[i] = settled;
        rest = this.teachRest = { ...rest, axes: rest.axes.map((v, a) => (a === settled.axis ? settled.from : v)) };
      }
    });
    const moved = pad.buttons.some(buttonDown) || detectSource(pad, rest) !== null || detectAxis(pad, rest) !== null;
    if (moved) this.teachIdle = now;
    else if (now - this.teachIdle > TEACH_IDLE_MS_ADAPTATION) { this.finish('timeout'); return; }
    if (this.teachWait) { if (!moved) this.teachWait = false; return; }
    const found = s.kind === 'button' ? detectSource(pad, rest) : detectAxis(pad, rest);
    if (!found) {
      // A tap (let go before the hold) of the button taught as Circle skips a step that may be skipped: the pad itself.
      const circle = layout.buttons[1];
      const tap = !s.required && !!circle && !!this.teachHeld && !('invert' in this.teachHeld) && sameSource(this.teachHeld, circle);
      this.teachHeld = null;
      if (tap) this.nextStep();
      return;
    }
    const same = (a: RawSource | RawAxis, b: RawSource | RawAxis): boolean => ('invert' in a || 'invert' in b)
      ? 'invert' in a && 'invert' in b && a.axis === b.axis && a.invert === b.invert
      : sameSource(a as RawSource, b as RawSource);
    if (!this.teachHeld || !same(this.teachHeld, found)) { this.teachHeld = found; this.holdSince = now; }
    if (now - this.holdSince < this.holdMs) return;
    // Refused when already taught: the same raw input for another button, the same axis for another stick direction.
    const taken = s.kind === 'button'
      ? layout.buttons.findIndex((b) => b !== null && sameSource(b, found as RawSource))
      : layout.axes.findIndex((a) => a !== null && a.axis === (found as RawAxis).axis);
    if (taken >= 0) {
      const other = TEACH_STEPS.find((t) => t.kind === s.kind && t.target === taken)?.name ?? 'taught';
      const words = `That is already ${other}. Hold another ${s.kind === 'button' ? 'button' : 'stick direction'} for ${s.name}.`;
      this.teachHeld = null; this.teachWait = true;
      this.emit({ kind: 'refused', question: { action: -1, physical: -1, occupied: taken, refused: words }, words });
      return;
    }
    if (s.kind === 'button') layout.buttons[s.target] = found as RawSource;
    else layout.axes[s.target] = found as RawAxis;
    this.nextStep();
  }

  /**
   * h59U9CLb: one frame of an extra's listen, the pad let go since it began. A double bind: the one button held the hold's
   * time. A combo: the first button down alone is the modifier; with it held, one more button held the hold's time is
   * the combo -- two at once, or the modifier let go, starts over.
   */
  private extraStep(down: number[], now: number): void {
    let modifier = -1, button: number;
    if (this.at === EXTRA_DOUBLE_LISTEN) {
      if (down.length !== 1) { this.holdPhysical = -1; return; }
      button = down[0]!;
    } else {
      if (this.extraMod < 0 || !down.includes(this.extraMod)) { this.extraMod = down.length === 1 ? down[0]! : -1; this.holdPhysical = -1; return; }
      const others = down.filter((b) => b !== this.extraMod);
      if (others.length !== 1) { this.holdPhysical = -1; return; }
      modifier = this.extraMod; button = others[0]!;
    }
    if (button !== this.holdPhysical) { this.holdPhysical = button; this.holdSince = now; }
    if (now - this.holdSince < this.holdMs) return;
    this.holdPhysical = -1;
    this.addExtra(modifier, button);
  }

  /** h59U9CLb: the extra listened for, validated as the match will read it; refused with its reason, the listen kept. */
  private addExtra(modifier: number, button: number): void {
    const action = this.extraAction;
    const entry = modifier < 0 ? { button, action } : { modifier, button, action };
    const one = parsePadExtras({ version: 1, ...(modifier < 0 ? { doubles: [entry] } : { combos: [entry] }) }, this.input.extrasContext());
    const dropped = one.dropped[0];
    if (dropped) {
      const words = this.extraRefusal(dropped.reason, modifier, button);
      this.wasReleased = false; this.extraMod = -1;
      this.emit({ kind: 'refused', question: { action: this.at, physical: button, occupied: -1, refused: words }, words });
      return;
    }
    const row: ExtraRow = { kind: modifier < 0 ? 'double' : 'combo', modifier, button, action, ...(one.extras.combos[0]?.warning ? { warning: one.extras.combos[0].warning } : {}) };
    const rows = this.extraList();
    const same = rows.some((r) => r.kind === row.kind && r.modifier === modifier && r.button === button && r.action === action);
    if (!same) this.saveExtraRows([...rows, row]);
    this.extraLast = row;
    this.at = -1; this.asked = null; this.extraMod = -1;
    this.input.reset();
    this.emit({ kind: 'extra', change: 'added' });
  }

  private extraRefusal(reason: DropReason, modifier: number, button: number): string {
    if (reason === 'overlay') return `${this.label(modifier >= 0 && modifier === this.input.extrasContext().overlayButton ? modifier : button)} opens the overlay: hold another button.`;
    if (reason === 'held-bind') return `${this.label(modifier)} is a SEPARATE stance bind: it cannot be a modifier. Hold another.`;
    return 'That cannot be an extra bind. Hold another button.';
  }

  /**
   * The shown extras written under the profile. SEP-ROWS's settings-loss fix (the owner, 2026-11-11: "don't lose existing
   * settings"; the loss came from h59U9CLb, 80e60d8c2f): with them, the stored combos SEPARATE sets aside, each in its
   * stored place (`ControllerInput.combosToStore`; the review's F1), which the list shown never held -- an add or a remove
   * no longer erases or reorders them, and COMBINED reads them again. Clear and Restore defaults still write none
   * (`clearExtras`, `restoreDefaults`).
   */
  private saveExtraRows(rows: readonly ExtraRow[]): void {
    this.input.saveExtras({
      doubles: rows.filter((r) => r.kind === 'double').map((r) => ({ button: r.button, action: r.action })),
      combos: this.input.combosToStore(rows.filter((r) => r.kind === 'combo').map((r) => ({ modifier: r.modifier, button: r.button, action: r.action }))),
    });
  }

  private bind(physical: number): void {
    const action = this.at;
    if (action === CROUCH_BIND || action === PRONE_BIND) this.setBind(action, physical, false);
    else this.input.config.bindings[action] = physical;
    this.input.save();
    this.at = -1; this.asked = null;
    this.input.reset();
    this.emit({ kind: 'bound', action, physical });
  }

  private finish(why: BindingEnd): void {
    const action = this.at;
    this.at = -1; this.asked = null; this.holdPhysical = -1; this.extraMod = -1;
    this.teachAt = -1; this.teachLayout = null; this.teachRest = null; this.teachHeld = null;
    this.input.reset();
    this.emit({ kind: 'end', action, why });
  }
}
