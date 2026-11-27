import { GAME_FRAME_DT, GameFrameAccumulator } from '@s2u/scene';
import { pressurePad } from './pressurePad';
import { PRESSURE_SEPARATE_TOAST, pressureDetector, recordPressureDefault, takePressureDefault } from './pressureDetect';
import { activePadMap, PAD_BUTTON, PAD_DEAD_ZONE, type Input, type PadButton, type PadLike, type PadMap, type PadSource } from './gamepad';
import { knownLayout } from './padKnownLayouts';
import { padFamily } from './padFamily';
import { standardView, type PadLayout } from './padLayout';
import { STANCE_FULL_PRESS_READING, STANCE_PRESS_ACTIVE_PLACEHOLDER, STANCE_PRESS_REARM_READING } from './stanceButton';
import { readOverlayButton } from './overlayButtonSetting';
import {
  applyPadExtras, EMPTY_PAD_EXTRAS, PAD_EXTRAS_VERSION, PadExtrasState, padExtrasKeyOf, parsePadExtras, physicalPressed, type ComboBind, type PadExtras,
  type PadExtrasContext,
} from './padExtras';
import {
  controllerStanceMode, defaultController, MENU_REQUIRED, PAD_BUTTON_NAMES, parseController, readPreference, savePreference,
  setControllerStanceMode, SETUP_KEY, STANCE_MODE_KEY,
} from './startupSettings';

/**
 * PAD-DS3 part 5 (reading, pending review; the key job's non-author re-read at r0004, 2026-11-23): the buttons whose
 * pressure the original feeds the grenade throw's power. The pressure read (r0004 `0x2c8040`, its one caller 0x59b948;
 * r0001 `FUN_002c6350` D:L166819-166835, called at D:L453481) picks the pad report's field by the button the control map
 * gives Fire (the map's byte `+0x14`, action 2): button 0xa (R1) -> field 0x1d, button 9 (X) -> field 0x1a, any other
 * button -> 0.0. The byte times `PRESSURE_SCALE` (1/255, r0004 0x64edd8 = 0x3b808081; r0001 `DAT_00650660`) is the
 * chase's target (`@s2u/scene` `stepThrowPower`). That `+0x14` is Fire's, that 0xa is R1 and 9 is X (the input-name
 * parser r0004 0x2c8360), that the pad update pairs field 0x1d with R1's digital bit and 0x1a with X's (0x2f8824-0x2f8898),
 * and the report's packing (the descriptor filler 0x1bdd58, the reader 0x1bda78) are re-read at r0004 by the fresh review
 * (keyjob-r1-throw-review.md, section (d), 2026-11-23); only the pad's own byte order (DualShock 2 / 3) rests outside
 * the disc. Still a reading, pending review: no capture (research 373, section 7).
 */
export const THROW_PRESSURE_BUTTONS_READING: readonly PadButton[] = ['R1', 'Cross'];
export const padKey = (pad: PadLike): string => `${pad.index}:${pad.id}`;
const profileKey = (pad: PadLike): string => `${SETUP_KEY}.pad.${JSON.stringify([pad.id, pad.mapping, pad.buttons.length, pad.axes.length])}`;
export const buttonDown = (b: { pressed: boolean; value: number }): boolean => b.pressed || b.value >= 0.5;
export function connectedPads(source: PadSource): PadLike[] {
  try {
    const pads = Array.from(source.getGamepads?.() ?? []).filter((p): p is PadLike => !!p?.connected);
    const pressure = pressurePad.read();
    return pressure && !pads.some((p) => p.id === pressure.id && p.index === pressure.index) ? [...pads, pressure] : pads;
  } catch { return []; }
}
/**
 * The browser's Pad dead zone (this browser) on one stick: a pure drift guard (PZG, finding 14; a browser adaptation).
 * Inside the zone the pair is zero; past it the pair is the pad's own, unchanged -- no floor, no rescale, the corners
 * kept. The zone rides on to the shaping (`./gamepad` `padStick`, the pad's `stickZone`) and its inverse (`padRaw`), so
 * the game reads the push itself, and the original's own per-axis zone stays the only one past it. At the default
 * (`PAD_DEAD_ZONE`) the pair is untouched, as before PZG: the 0.15 adapter guards the walk, and the menus' readers keep
 * their raw pair. Before PZG a zone off the default floored every push past it at 0.15 (0.15 + 0.85 (d - z) / (1 - z)).
 */
export function calibrateStick(x: number, y: number, zone: number): [number, number] {
  if (zone === PAD_DEAD_ZONE) return [x, y];
  return Math.hypot(x, y) <= zone ? [0, 0] : [x, y];
}

/**
 * SEP-SHOW (the owner, 2026-10-31, seat 5d: "Yes, with those defaults"; a browser adaptation, OT.R28): the standard
 * mapping's touchpad click on a PlayStation pad, the 18th button (W3C Gamepad, "Remapping"; `./padBinding`'s
 * `PLAYSTATION_NAMES` names it Touchpad) -- a button none of the default bindings names.
 */
export const TOUCHPAD_BUTTON = 17;
/** SEP-SHOW: the console's toast when entering SEPARATE gave Crouch the touchpad (`ControllerInput.bindTouchpadCrouch`). */
export const TOUCHPAD_CROUCH_TOAST = 'Crouch bound to Touchpad';
/** The pad has a touchpad's click: a Sony pad of the standard layout with more than 17 buttons (`PadBinding.touchpad`). */
export function padHasTouchpad(raw: PadLike | null): boolean {
  return raw?.mapping === 'standard' && padFamily(raw.id) === 'playstation' && raw.buttons.length > TOUCHPAD_BUTTON;
}

/** The logical buttons the menus need (`./startupSettings` `MENU_REQUIRED`, where the profile's load repairs them too). */
export { MENU_REQUIRED };

/**
 * The bindings dialog's answer to a conflict: the button pressed for `listening` already drives `occupied`. A swap gives
 * `occupied` the listening slot's old button; a replace leaves `occupied` unbound -- refused when `occupied` is a button
 * the menus need (Cross, Circle, START, the d-pad: `MENU_REQUIRED`), so a player can never bind themselves out of the menus.
 * The batch review's F2 (h59U9CLb's batch): a swap from a listening slot that is itself unbound would hand `occupied` that
 * -1 -- the same lock-out -- so it is refused for a menu button too. Pure; the caller binds the listening slot itself.
 */
export function resolveConflict(bindings: readonly number[], listening: number, occupied: number, resolution: 'swap' | 'replace'): { bindings: number[]; refused?: string } {
  const out = [...bindings];
  if (resolution === 'replace' && MENU_REQUIRED[occupied]) {
    return { bindings: out, refused: `${MENU_REQUIRED[occupied]} must stay bound: the menus need it. Swap instead, or cancel.` };
  }
  if (resolution === 'swap' && MENU_REQUIRED[occupied] && (out[listening] ?? -1) < 0) {
    return { bindings: out, refused: `${MENU_REQUIRED[occupied]} must stay bound: the menus need it, and this action has no button to give it. Cancel, or hold another button.` };
  }
  out[occupied] = resolution === 'swap' ? out[listening]! : -1;
  return { bindings: out };
}

/**
 * PS2P (the owner, 2026-11-01, via seat 5d: "Keep our separate logic"): one button's pressure read as the original reads
 * the stance button's -- `FUN_00594cf0` D:L453331-453428 (research 373 §1, research 180 §1.9; reading, pending review).
 * Armed only from an idle frame (D:L453332-453333: the pad record's press state `+7` at 0 -- MOVE-S6: not on the release
 * frame, `+7` = 3, but `STANCE_PRESS_REARM_READING` frames at rest after it); armed, the press's peak (`DAT_0066b410`) is followed and the press
 * is decided on the frame its pressure reaches `STANCE_FULL_PRESS_READING` (the full press, D:L453337-453341) or first
 * falls below its peak (D:L453343-453345) -- then the light press when the peak stayed under it (D:L453351), else the
 * full (D:L453380); decided, it is disarmed until the button rests again (D:L453347-453349) and the peak cleared
 * (D:L453428). It decides nothing of the stance: the light press is the Crouch bind's one-frame press and the full the
 * Prone bind's (`ControllerInput.poll`), and B193's lanes take them as they take two buttons' (`./matchLanes`).
 * A cancelled frame (the WebHID reader's stall, the overlay's synthetic neutral: `stanceCancelled`) is no release: the
 * press under way is dropped undecided and the next waits for a rest (a browser adaptation, research 373 §2).
 * One `step` is one game frame (`ControllerInput.pressClock`).
 */
export class StancePress {
  private armed = false;
  private peak = 0;
  /** The game frames at rest in a row -- the pad's own history (`+7`), kept through `reset`; at rest before the first. */
  private rest = Infinity;
  step(pressure: number, cancelled = false): 'light' | 'full' | null {
    const v = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0;
    if (cancelled) { this.reset(); return null; }
    this.rest = v <= STANCE_PRESS_ACTIVE_PLACEHOLDER ? this.rest + 1 : 0;
    // `+7` reads 0 on a frame at rest after the release frame (3): the release frame is the first at rest.
    if (!this.armed) { this.armed = this.rest > STANCE_PRESS_REARM_READING; return null; }
    let decided = false;
    if (v > this.peak) { this.peak = v; decided = v >= STANCE_FULL_PRESS_READING; }
    else if (v < this.peak) decided = true;
    if (!decided) return null;
    const press = this.peak < STANCE_FULL_PRESS_READING ? 'light' : 'full';
    this.reset();
    return press;
  }
  reset(): void { this.armed = false; this.peak = 0; }
}

/**
 * PS2P (the owner, 2026-11-01: "default to the new separate mode we have with the two states bound"), at the front end's
 * console frame only (`ConsoleController.remapFrame`, never the overlay's over a match): a pending default
 * (`./pressureDetect` `recordPressureDefault`) is applied when no Stance mode is stored then -- SEPARATE set, Prone cloned
 * from Triangle and Crouch put on the same button under that pad's profile -- and its line answered, once; a mode stored
 * since is kept and the default dropped. 5d's fold (2026-11-01): the line says what is bound -- the two-states line only
 * when `bindPressureCrouch` bound them; where it declined (a Crouch the profile already holds), the profile's real binds.
 * A browser adaptation (OT.R28).
 */
export function applyPressureDefault(): string | null {
  const pad = takePressureDefault();
  if (!pad || readPreference(STANCE_MODE_KEY) !== null) return null;
  const input = new ControllerInput();
  input.waitForRest = false;
  input.select(padKey(pad));
  input.poll({ getGamepads: () => [pad] });
  setControllerStanceMode('separate');
  input.cloneTriangleToProne();
  if (input.bindPressureCrouch()) return PRESSURE_SEPARATE_TOAST;
  const name = (b: number): string => (b === TOUCHPAD_BUTTON ? 'Touchpad' : PAD_BUTTON_NAMES[b] ?? `Button ${b + 1}`);
  const { prone, crouch } = input.config;
  return `Pressure controller: SEPARATE on; Prone ${prone >= 0 ? `on ${name(prone)}` : 'unbound'}, Crouch ${crouch >= 0 ? `on ${name(crouch)}` : 'unbound'}`;
}

export class ControllerInput {
  config = defaultController();
  /** The crouch shortcut takes its button from the pad (the match); the menus keep it (L2 is the disc's scroll-down). */
  releaseCrouch = true;
  /** A pad read only once every button and stick has been at rest (the menus: the setup page's START held is no fresh
   *  press); false for the match, whose state start flushes the pad instead (research 116 R116.13, `FUN_002d9e00`: a
   *  button held through it is held, not pressed; `./padFlush`), and where a pad connected mid-match is a press. */
  waitForRest = true;
  selection = 'auto';
  raw: PadLike | null = null;
  /** The chosen pad as the standard layout (LATER 380: a pad of another layout through its taught layout); null when it
   *  cannot be read so -- none chosen, or one of another layout not taught. Its buttons are physical, before the bindings. */
  view: PadLike | null = null;
  devices: PadLike[] = [];
  /** The profile's Crouch bind held this frame (`config.crouch`, -1 unbound); in SEPARATE only (STM.R1a). */
  crouch = false;
  /** PP-5: the profile's Prone bind held this frame (`config.prone`, -1 unbound); in SEPARATE only (STM.R1a). */
  prone = false;
  /** PS2P: the Prone bind's button's pressure, in SEPARATE on a pressure-capable pad (`StancePress`). */
  private readonly press = new StancePress();
  /** OT.R107's fold: the polls read, the poll the Prone button went down on (its raw value, this poll's: null at rest),
   *  and the menu's take of Triangle -- the poll it began on and the last poll it was told (`cancelStancePress`). */
  private polls = 0;
  private proneDownAt: number | null = null;
  private takeFrom = -1;
  private takeAt = -2;
  /**
   * MOVE-S6: the clock (ms) the stance press is stepped by -- once a 30 Hz game frame (`GAME_FRAME_DT`), as the original
   * reads the pad record (`FUN_00594cf0` runs once a game frame); the match's page sets `performance.now`. Null: each
   * poll is one game frame (a caller stepping its own frames).
   */
  pressClock: (() => number) | null = null;
  private readonly pressFrames = new GameFrameAccumulator();
  private pressAt: number | null = null;
  private identity = '';
  private neutral = true;
  private focused = true;
  private profile = '';
  /** The profile's stored text the config was read from (or last saved): a change to it is read again (OBF-12). */
  private stored: string | null = null;
  /**
   * h59U9CLb (a browser adaptation, off by default): the profile's extra binds (`./padExtras`), validated at each load;
   * empty with nothing stored. Read again whenever what is stored under `padExtrasKeyOf(profile)` changes, or what
   * validation reads (the overlay's button, SEPARATE's held binds) does.
   */
  extras: PadExtras = EMPTY_PAD_EXTRAS;
  private extrasRead = '';
  private readonly extrasState = new PadExtrasState();
  /** The physical buttons this frame's standard read saw (before the bindings), for the extras; null with none read. */
  private extrasPressed: boolean[] | null = null;

  select(key: string): void { this.selection = key; this.identity = ''; this.reset(); }
  reset(): void { this.neutral = true; this.crouch = false; this.prone = false; this.press.reset(); this.extrasState.reset(); }
  /** MOVE-S6: the game frames the stance press steps this poll (`pressClock`; without one, one). */
  private pressSteps(): number {
    if (!this.pressClock) return 1;
    const now = this.pressClock(), dt = this.pressAt === null ? GAME_FRAME_DT : (now - this.pressAt) / 1000;
    this.pressAt = now;
    return this.pressFrames.advance(dt);
  }
  /** h59U9CLb: the extras' modifier state reset alone -- the match's flush (`./padFlush`), where a held button is held. */
  flushExtras(): void { this.extrasState.reset(); }
  /**
   * OT.R107's fold: the stance button's press under way (`StancePress`) dropped undecided, the next armed only after the
   * button's rest -- a press a menu took as Triangle is no light or full press after the menu has gone. Called by the
   * pages on each frame a menu holds the pad's Triangle (`./main`, `./matchMount`: the pad's `stance` the game did not get).
   * The fold's re-review: decided off this poll's raw value of the Prone button, never the stepped rest (a poll at 60 Hz
   * or more can step no 30 Hz game frame), and only for a press as old as the take -- the press the menu took. A press
   * begun while the take was already under way (Triangle's own button held past a menu's close) is no menu's; at rest
   * nothing is dropped, so a press that starts on the next poll arms as any. Dropped, the press cannot arm again before the
   * button has stepped at rest (`StancePress`: armed only after `STANCE_PRESS_REARM_READING` frames at rest).
   */
  cancelStancePress(): void {
    if (this.takeAt !== this.polls && this.takeAt !== this.polls - 1) this.takeFrom = this.polls;
    this.takeAt = this.polls;
    if (this.proneDownAt !== null && this.proneDownAt <= this.takeFrom) this.press.reset();
  }
  /**
   * h59U9CLb: this frame's `input` with the profile's extras ORed in (`./padExtras` `applyPadExtras`), off the physical
   * buttons the last `poll` read; `menuOpen`, untouched. With no extras, or no standard pad read, `input` itself.
   */
  applyExtras(input: Input, menuOpen: boolean): Input {
    if (!this.extrasPressed) { this.extrasState.reset(); return input; }
    if (this.extras.doubles.length === 0 && this.extras.combos.length === 0) return input;
    return applyPadExtras(this.extras, input, this.extrasPressed, this.extrasState, menuOpen);
  }
  focus(on: boolean): void { this.focused = on; this.reset(); }
  save(): void {
    if (this.profile) {
      savePreference(this.profile, JSON.stringify(this.config));
      // OBF-12's review, fold 1: what storage now holds, not what was meant -- a write it refused (full, unreachable)
      // leaves the text as it was, so the next poll keeps this config for the visit instead of reading the old one back.
      this.stored = readPreference(this.profile);
    }
    this.reset();
  }
  /**
   * STM.R1 (the owner, 2026-10-30: "The original triangle button (prone) gets disabled for this mode and the button bound to
   * is cloned over to PRONE in the separate binds"): entering SEPARATE, an unbound Prone takes the physical button
   * Triangle's binding drives now (`config.bindings[3]`, `PAD_BUTTON.Triangle`; a rebound Triangle's button, not the
   * button printed Triangle), saved under the profile. STM.R1a: a Prone already bound is kept (SEPARATE again brings back
   * what the player set), and Crouch is given nothing (unbound: L3 stays the fire mode, research 84 s6). Nothing without a
   * profile (no pad read yet), with Triangle unbound, or where Crouch already holds that button (the two binds never
   * share one, `./padBinding`'s conflict). Answers whether the profile changed. A browser adaptation (OT.R28).
   */
  cloneTriangleToProne(): boolean {
    const triangle = this.config.bindings[PAD_BUTTON.Triangle] ?? -1;
    if (!this.profile || this.config.prone >= 0 || triangle < 0 || triangle === this.config.crouch) return false;
    this.config.prone = triangle;
    this.save();
    return true;
  }
  /**
   * SEP-SHOW (the owner, 2026-10-31, seat 5d: "Yes, with those defaults"): entering SEPARATE, a pad with a touchpad
   * (`padHasTouchpad`) gets Crouch on the touchpad's click (`TOUCHPAD_BUTTON`), saved under the profile -- only when Crouch
   * is unbound and the touchpad is free: none of the sixteen bindings drives it, Prone's bind is not on it, and it is not
   * the overlay's opening button (`overlayButton`, `../modern/overlay/binding` `readOverlayButton`). Called after
   * `cloneTriangleToProne`, at the mode change only (never at a pad connected later). Answers whether Crouch was bound.
   * A browser adaptation (OT.R28).
   */
  bindTouchpadCrouch(overlayButton: number): boolean {
    const c = this.config;
    if (!this.profile || !padHasTouchpad(this.raw) || c.crouch >= 0) return false;
    if (c.bindings.includes(TOUCHPAD_BUTTON) || c.prone === TOUCHPAD_BUTTON || overlayButton === TOUCHPAD_BUTTON) return false;
    c.crouch = TOUCHPAD_BUTTON;
    this.save();
    return true;
  }
  /**
   * PS2P: the chosen pad gives its face buttons' pressure -- the profile's explicit `nativePressure` (Phil's field, kept
   * by `parseController`; no row sets it now), else `./pressureDetect`'s detection. A browser adaptation.
   */
  pressureCapable(): boolean { return this.config.nativePressure ?? pressureDetector.capable(this.raw); }
  /**
   * PAD-DS3 part 5 (reading, pending review; research 373, section 7): the pressure, 0..1, of the pad button Fire is on,
   * for the grenade throw's power (`./grenadeCore` `GrenadeSource.firePressure`) -- only where the original would read one:
   * the active preset's Fire (`map`, the original's control map) on R1 or X (`THROW_PRESSURE_BUTTONS_READING`). Null --
   * the throw feeds 1, exactly as before (the controller's ruling F5 = option A, a browser adaptation: the port's
   * rebinding and a digital pad have no original) -- on a pad not pressure-capable (`pressureCapable`), with no standard
   * pad read or the page unfocused, with the preset's Fire on any other button or on more than one, with the profile
   * driving that logical button from another physical one (rebound), or with SEPARATE's Crouch or Prone bound to that
   * physical button in the match (taken from the game, `poll`; the review's F2). The value is the button's own as the reader gives it:
   * the WebHID reader's byte / 255 (`./pressurePad`, `PRESSURE_SCALE`'s scale), or the Gamepad API's analog value (the
   * browser's scale; an adaptation).
   */
  firePressure(map: PadMap = activePadMap()): number | null {
    const pad = this.view;
    if (!pad || !this.focused || !this.pressureCapable()) return null;
    const fire = map.lanes.filter(([, lane]) => lane === 'fire');
    if (fire.length !== 1 || !THROW_PRESSURE_BUTTONS_READING.includes(fire[0]![0])) return null;
    const logical = PAD_BUTTON[fire[0]![0]];
    if ((this.config.bindings[logical] ?? -1) !== logical) return null;
    // Review F2: SEPARATE's Crouch or Prone bind on that physical button takes it from the game in the match (`poll`'s
    // `taken`, the same test): it cannot fire, so a throw another input starts while it is held feeds 1.
    // Comparing the LOGICAL index with the binds (physical buttons) is valid only because the unrebound guard above makes
    // physical == logical here; an edit to that guard must revisit this line.
    const c = this.config;
    if (this.releaseCrouch && controllerStanceMode() === 'separate' && (logical === c.crouch || logical === c.prone)) return null;
    const v = pad.buttons[logical]?.value;
    return v !== undefined && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
  }
  /**
   * PS2P (the owner, 2026-11-01: "default to the new separate mode we have with the two states bound"): entering SEPARATE
   * on a pressure-capable pad, an unbound Crouch takes the button Prone was cloned onto (Triangle's, `cloneTriangleToProne`):
   * one button, light and firm (`StancePress`). Called after `cloneTriangleToProne` and before `bindTouchpadCrouch` (which
   * then finds Crouch bound). Answers whether Crouch was bound. A browser adaptation (OT.R28).
   */
  bindPressureCrouch(): boolean {
    const c = this.config;
    if (!this.profile || !this.pressureCapable() || c.crouch >= 0 || c.prone < 0 || c.prone !== c.bindings[PAD_BUTTON.Triangle]) return false;
    c.crouch = c.prone;
    this.save();
    return true;
  }
  /** The chosen pad's layout: one taught on its profile, else a built-in one; null for a standard pad or an unknown one. */
  layout(): PadLayout | null {
    if (!this.raw || this.raw.mapping === 'standard') return null;
    return this.config.layout ?? knownLayout(this.raw);
  }
  /**
   * OBF-9 (a browser adaptation): a chosen pad that drops and returns -- a Bluetooth pad sleeping or leaving range does -- comes
   * back at another index, so its key (`index:id`) no longer matches. The one connected pad with the chosen pad's id is that
   * pad; with two such (identical pads) nothing is guessed.
   */
  /**
   * h59U9CLb: the extras read again when what is stored, the overlay's button or SEPARATE's held binds changed -- one
   * string compare a frame, beside OBF-12's profile read; parsed (re-validated, `parsePadExtras`) only on a change, the
   * modifier state reset with it. Storage is editable: a bad entry drops alone.
   */
  private readExtras(separate: boolean): void {
    const raw = this.profile ? readPreference(padExtrasKeyOf(this.profile)) : null;
    const { overlayButton, heldBinds } = this.extrasContext(separate);
    const read = `${overlayButton}|${heldBinds.join(',')}|${raw ?? ''}`;
    if (read === this.extrasRead) return;
    this.extrasRead = read;
    this.extras = parsePadExtras(raw, { overlayButton, heldBinds }).extras;
    this.extrasState.reset();
  }
  /**
   * h59U9CLb: what validating an extra reads now -- the overlay's opening button, and in SEPARATE the Crouch and Prone
   * binds' buttons (never a modifier) -- for this reader's load and the mapping screen's listen alike.
   */
  extrasContext(separate = controllerStanceMode() === 'separate'): PadExtrasContext {
    return { overlayButton: readOverlayButton(), heldBinds: separate ? [this.config.crouch, this.config.prone].filter((b) => b >= 0) : [] };
  }
  /**
   * SEP-ROWS's settings-loss fix (the owner, 2026-11-11: "don't lose existing settings"; the loss came from h59U9CLb,
   * 80e60d8c2f): the combos to store for the `shown` ones -- with the stored combos this reader set aside only because
   * their modifier is a SEPARATE stance bind's button (`parsePadExtras`'s 'held-bind'; valid otherwise, read again in
   * COMBINED), each in its stored place (the review's F1). The stored list is walked: a set-aside combo is kept; a shown
   * one is kept while `shown` still holds it (a removed one dropped); the shown combos not stored (an added one) follow.
   */
  combosToStore(shown: readonly ComboBind[]): ComboBind[] {
    const plain = ({ modifier, button, action }: ComboBind): ComboBind => ({ modifier, button, action });
    const { heldBinds } = this.extrasContext();
    if (!this.profile || heldBinds.length === 0) return shown.map(plain);
    const raw = readPreference(padExtrasKeyOf(this.profile));
    const stored = parsePadExtras(raw, { overlayButton: readOverlayButton(), heldBinds: [] }).extras.combos;
    const same = (a: ComboBind, b: ComboBind): boolean => a.modifier === b.modifier && a.button === b.button && a.action === b.action;
    const rest = [...shown];
    const out: ComboBind[] = [];
    for (const c of stored) {
      if (heldBinds.includes(c.modifier)) { out.push(plain(c)); continue; }
      const at = rest.findIndex((x) => same(x, c));
      if (at >= 0) out.push(plain(rest.splice(at, 1)[0]!));
    }
    return [...out, ...rest.map(plain)];
  }
  /** h59U9CLb: the profile holds an extras record (any, empty included). */
  hasStoredExtras(): boolean { return !!this.profile && readPreference(padExtrasKeyOf(this.profile)) !== null; }
  /** h59U9CLb: `extras` kept under the profile's extras key (version 1; the warnings are the reader's, not stored), read back at once. */
  saveExtras(x: PadExtras): void {
    if (!this.profile) return;
    savePreference(padExtrasKeyOf(this.profile), JSON.stringify({
      version: PAD_EXTRAS_VERSION,
      doubles: x.doubles.map(({ button, action }) => ({ button, action })),
      combos: x.combos.map(({ modifier, button, action }) => ({ modifier, button, action })),
    }));
    this.readExtras(controllerStanceMode() === 'separate');
  }
  private sameId(): PadLike | undefined {
    const id = this.selection.slice(this.selection.indexOf(':') + 1);
    const same = this.devices.filter((p) => p.id === id);
    return same.length === 1 ? same[0] : undefined;
  }
  poll(source: PadSource): PadLike | null {
    this.polls++;
    const proneDownAt = this.proneDownAt;
    this.proneDownAt = null;                           // OT.R107's fold: set again below while the pressure-read Prone is down
    this.devices = connectedPads(source);
    const chosen = this.selection === 'auto'
      ? this.devices.find((p) => padKey(p) === this.identity && p.mapping === 'standard') ?? this.devices.find((p) => p.mapping === 'standard') ?? this.devices[0]
      : this.devices.find((p) => padKey(p) === this.selection) ?? this.sameId();
    this.raw = chosen ?? null;
    this.view = null;
    this.extrasPressed = null;
    this.crouch = false;
    this.prone = false;
    const identity = chosen ? padKey(chosen) : '';
    const moved = identity !== this.identity;
    if (moved) { this.identity = identity; this.profile = chosen ? profileKey(chosen) : ''; }
    // Identical pads cannot safely share an inferred identity: keep defaults until selected/configured.
    const ambiguous = chosen && this.devices.filter((p) => profileKey(p) === this.profile).length > 1;
    // OBF-12 (the owner, 2026-10-30: a Restore defaults "persisted despite the ui for prone saying disabled"): the profile
    // is read again whenever what is stored under it changes, not only when the pad changes -- the mapping screen's own
    // reader (`./padBinding`) writes it while the match's (`./setupPad` `GamePad`, made once at the mount) reads on, the
    // modern overlay drawing that screen over a running match. One string compare a frame; parsed only on a change.
    const stored = this.profile && !ambiguous ? readPreference(this.profile) : null;
    // The batch review: while identical pads make the profile ambiguous, only a new pad reloads -- never every frame (a
    // bind made then is kept, and a second identical pad plugged in leaves the first's config as it was).
    if (moved || (!ambiguous && stored !== this.stored)) {
      this.stored = stored;
      this.config = parseController(stored);
      this.reset();
    }
    // PS2P: the pad's pressure seen (`./pressureDetect`), at its first detection with no Stance mode stored the default is
    // only recorded -- never applied here, where the reader may be the match's (5d's fold, 2026-11-01: "The mode must never
    // change under the player in a match"); the front end's console applies it (`applyPressureDefault`).
    if (chosen && pressureDetector.observe(chosen) && !ambiguous && readPreference(STANCE_MODE_KEY) === null) recordPressureDefault(chosen);
    if (!chosen) return null;
    // LATER 380: a pad of another layout taught by press (`./padLayout`, its profile's `layout`), or else one whose layout
    // is built in (`./padKnownLayouts`), is read through it as a standard pad -- the bindings, the calibration and the
    // binds below as for any standard pad.
    const layout = this.layout();
    const pad = chosen.mapping !== 'standard' && layout ? standardView(chosen, layout) : chosen;
    if (pad.mapping === 'standard') this.view = pad;
    if (!this.focused) return null;
    if (this.neutral && this.waitForRest) {
      if (pad.buttons.some(buttonDown) || pad.axes.some((a) => Math.abs(a) > 0.45)) return null;
      this.neutral = false;
    }
    // A pad without the standard mapping and not taught is read as main read it before: its own layout, no bindings, no
    // calibration (the bindings are written in the standard positions; the review's last round).
    if (pad.mapping !== 'standard') return chosen;
    const axes = [...pad.axes];
    for (const start of [0, 2]) {
      const [x, y] = calibrateStick(Number.isFinite(axes[start]) ? axes[start]! : 0, Number.isFinite(axes[start + 1]) ? axes[start + 1]! : 0, this.config.deadZone);
      axes[start] = x; axes[start + 1] = y;
    }
    const released = { pressed: false, value: 0 };
    const held = (b: number): boolean => b >= 0 && !!pad.buttons[b] && buttonDown(pad.buttons[b]!);
    // STM.R1/STM.R1a (the owner, 2026-10-30: "only when SEPARATE is selected should the two separate bindings show";
    // leaving SEPARATE, "Kept, hidden"): the Crouch and Prone binds act in SEPARATE only. In COMBINED they stay in the
    // profile but are neither read nor masked -- their buttons are the game's own (Triangle's again, where Prone was
    // cloned from it). The mode is read here, each poll, beside OBF-12's profile read (one storage read; a change of mode
    // over a running match is taken at once), rather than handed in by each of the readers' callers.
    // Research 373: the reader's values are pressure (the WebHID pad's, or the profile's word) -- carried to `padInput`'s
    // `stancePressure`; it decides nothing there.
    const nativePressure = this.config.nativePressure ?? pad.nativePressure ?? false;
    const separate = controllerStanceMode() === 'separate';
    this.readExtras(separate);
    // PS2P (the owner, 2026-11-01: "Keep our separate logic"): in SEPARATE on a pressure-capable pad the Prone bind's
    // button is read by its pressure (`StancePress`): the full press is Prone's one-frame press, the light press Crouch's --
    // as two buttons would be pressed; a Crouch on a button of its own is held as on any pad. A Crouch sharing Prone's
    // button on a pad read without pressure is no Crouch (Prone's alone: one button cannot be both). COMBINED is B193's.
    const c = this.config;
    if (separate && c.prone >= 0 && this.pressureCapable()) {
      const value = pad.buttons[c.prone]?.value ?? 0;
      const raw = pad.buttons[c.prone];
      if (raw && (buttonDown(raw) || value > STANCE_PRESS_ACTIVE_PLACEHOLDER)) this.proneDownAt = proneDownAt ?? this.polls;
      let press: 'light' | 'full' | null = null;
      if (pad.stanceCancelled === true) this.press.step(value, true);
      else for (let n = this.pressSteps(); n > 0; n--) press = this.press.step(value) ?? press;
      this.prone = press === 'full';
      this.crouch = press === 'light' || (c.crouch !== c.prone && held(c.crouch));
    } else {
      this.press.reset();
      this.crouch = separate && c.crouch !== c.prone && held(c.crouch);
      this.prone = separate && held(c.prone);
    }
    // STM.R1 ("The original triangle button (prone) gets disabled for this mode"), as the review's F1 settled it (the
    // controller's call, 2026-10-30): in SEPARATE Triangle's stance is off only while the profile's Prone is bound, so no
    // way into SEPARATE -- a Separate saved under PP-5, one chosen with no pad read, a pad never read since, Restore
    // defaults -- leaves the pad without a stance; with Prone unbound Triangle keeps the original's tap and hold
    // (`./stanceButton` `PAD_STANCE_SEPARATE`, H338). Here, not in `./matchLanes`: this reader is where the mode and the
    // profile are both known. Off, Triangle's logical button is taken from the game as a bind's button is (in the match
    // only, `releaseCrouch`; the menus keep it); with Prone cloned on it (`cloneTriangleToProne`) it is Prone's already.
    // OT.R107 (below): taken from the stance lane only -- the Prone button serves Triangle's action everywhere else.
    const triangleOff = separate && this.config.prone >= 0;
    // The Crouch and Prone binds take their buttons from the pad in the match (`releaseCrouch`), as the shortcut did.
    const taken = (physical: number, logical: number): boolean => this.releaseCrouch
      && ((separate && (physical === this.config.crouch || physical === this.config.prone)) || (triangleOff && logical === PAD_BUTTON.Triangle));
    this.extrasPressed = physicalPressed(pad.buttons);
    const buttons = this.config.bindings.map((physical, logical) => physical >= 0 && taken(physical, logical) ? released : pad.buttons[physical] ?? released);
    // OT.R107 (the owner, 2026-11-06: "everywhere that people have assigned prone when in separate mode should also serve
    // the action of triangle"): in the match, with Triangle's stance off, the logical Triangle is held by the Prone bind's
    // button -- on a pressure pad any press, light or full (`STANCE_PRESS_ACTIVE_PLACEHOLDER`, `StancePress`'s rest) -- and
    // by Triangle's own button where it is not Crouch's, for every reader of Triangle but the stance lane: the pad says
    // `stanceOff` and `./gamepad` `stanceLane` takes none of it. So the START menu's close on its release (`FUN_002041e0`
    // D:L61669-61671), its confirm's BACK (D:L61878-61882), WEAPON EXCHANGE's back, the ARMORY's, the Chat menu's, the R2
    // inventory's close and the spectator's jump read it as the original's Triangle; the press stays Prone's in the game.
    // The fold (b6's call): the front end's reader (`releaseCrouch` false: no stance lane, nothing taken) has the Prone
    // button hold the logical Triangle too, Triangle's own button kept -- only where no logical button is bound to the
    // Prone button (the fold's review F1: the console dispatches every logical button down, so a button with its own job
    // keeps it alone; cloned on Triangle's own button, nothing changes).
    // LATER 1175 (X7; the owner, 2026-11-18: "approved, assign" to "should the touchpad (the Crouch bind) close menus the
    // way Triangle does?", then "it should be any bound control to crouch not just touch pad"): the Crouch bind's button
    // -- whatever the live profile binds it to, SEP-SHOW's touchpad or a remap -- holds the logical Triangle the same way,
    // under the same `stanceOff` (the press stays Crouch's in the game: `this.crouch`), and in the front end only where no
    // logical button is bound to it, as Prone's. Only with Triangle's stance off: with Prone unbound Triangle is the
    // stance's, and a Crouch held as Triangle would be a stance press.
    const free = (b: number): boolean => this.releaseCrouch || !c.bindings.some((ph, lg) => ph === b && lg !== PAD_BUTTON.Triangle);
    const proneFree = free(c.prone);
    const crouchDown = c.crouch >= 0 && c.crouch !== c.prone && free(c.crouch) && held(c.crouch);
    let triangleFromProneOnly = false;
    if (triangleOff && (proneFree || crouchDown)) {
      const p = pad.buttons[c.prone];
      const proneDown = proneFree && !!p && (buttonDown(p) || (this.pressureCapable() && p.value > STANCE_PRESS_ACTIVE_PLACEHOLDER));
      const own = c.bindings[PAD_BUTTON.Triangle] ?? -1;
      const ownDown = own >= 0 && (!this.releaseCrouch || (own !== c.prone && own !== c.crouch)) && held(own);
      triangleFromProneOnly = (proneDown || crouchDown) && !ownDown;
      buttons[PAD_BUTTON.Triangle] = proneDown ? { pressed: true, value: p!.value } : crouchDown ? pad.buttons[c.crouch]!
        : ownDown ? pad.buttons[own]! : proneFree ? released : buttons[PAD_BUTTON.Triangle]!;
    }
    return { ...pad, id: pad.id, index: pad.index, connected: pad.connected, mapping: pad.mapping, nativePressure, stanceCancelled: pad.stanceCancelled, axes,
      stickZone: this.config.deadZone,   // PZG: the zone the sticks were guarded with, for `padStick` and `padRaw`
      ...(this.releaseCrouch && triangleOff ? { stanceOff: true } : {}),
      ...(this.releaseCrouch && triangleFromProneOnly ? { triangleFromProneOnly: true } : {}), buttons };
  }
}
