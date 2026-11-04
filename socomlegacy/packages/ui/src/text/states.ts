import type { ButtonSpec, ButtonState } from '../dialog';
import { fadd, fdiv, fmul, fsub, f32 } from './f32';

/**
 * A text's colour states and its glow (web research 111 §4). Every text node carries a glow: a flag (+0x68), a period
 * (+0x5c), a top (+0x60) and a bottom (+0x64), and a phase (+0x74, 0 from the constructor `FUN_00363e70`
 * D:L261480, never reset). The text's tick `FUN_00363b30` (D:L261297-261315; vtable+0x38 of the text class
 * `0x406df0`) runs it each frame:
 *
 *   phase += dt / 2; if phase > period: phase -= period;
 *   alpha = (bottom + sin(phase / period x 3.14) x (top - bottom)) x 128      (`FUN_001b3720` is `sinf`)
 *
 * so the alpha rises from `RANGE[0]` to `RANGE[1]` and back over 2 x `TIME` seconds -- a half sine, with the literal
 * 3.14, not pi. That is TEXT_GLOW: an alpha pulse of the caption itself, drawn by the ordinary text path; the face's
 * `glowtexture` (+0x1c) is read and never drawn by it.
 *
 * Who sets it: a BUTTON (and every control built on it) entering a state, `FUN_003773f0` (D:L271967-272000) and the
 * same lines inlined in `Activate` (vtable+0x50 at 0x3766a0, which Ghidra did not split out; read from the ELF's
 * instructions, research 111 §4.2), `Deactivate` `FUN_0036e6b0`, `Press` `FUN_00370c20` and the press timer in the
 * tick `FUN_003723b0`: each calls `FUN_0036e790` (D:L267223-267240) with the state's `TEXT_COLOR`, its glow and its
 * `SCALE`, which sets the caption's colour, sets its alpha to 100 (0x42c80000), raises the glow flag only when the
 * state has a glow, and copies `TIME` to the period, `RANGE[1]` to the top and `RANGE[0]` to the bottom.
 */

/** `FUN_00363b30`'s literal. */
export const GLOW_HALF_TURN = 3.14;
/** The caption's alpha on entering any state (`FUN_0036e790` D:L267233, `FUN_003773f0` D:L271990). */
export const STATE_TEXT_ALPHA = 100;
/** How long PRESSED holds before the tick moves on (`FUN_00370c20` D:L268563: +0x24c = 0x3e4ccccd). */
export const PRESSED_HOLD = f32(0.2);

/** A text's glow fields. */
export interface TextGlow { on: boolean; period: number; top: number; bottom: number; phase: number }

export const noGlow = (): TextGlow => ({ on: false, period: 0, top: 0, bottom: 0, phase: 0 });

/**
 * `FUN_00363b30`: one tick of `dt` seconds. Returns the alpha the glow sets (GS scale, 128 = 1.0), or null when the
 * glow is off (the alpha is left as it was). A zero period divides by zero: no disc state has one (the dev-disc test).
 */
export function stepGlow(g: TextGlow, dt: number): number | null {
  if (!g.on) return null;
  g.phase = fadd(g.phase, fdiv(dt, 2));
  if (g.period < g.phase) g.phase = fsub(g.phase, g.period);
  const s = f32(Math.sin(fmul(fdiv(g.phase, g.period), GLOW_HALF_TURN)));
  return fmul(fadd(g.bottom, fmul(s, fsub(g.top, g.bottom))), 128);
}

export type ButtonStateName = 'NORMAL' | 'ACTIVE' | 'PRESSED' | 'DISABLED';

/** A button's caption look: what the compositor draws the caption with, and the state machine's own fields. */
export interface ButtonTextLook {
  state: ButtonStateName;
  color: [number, number, number];
  alpha: number;
  scale: number;
  glow: TextGlow;
  /** +0x24c, the press timer. */
  pressTimer: number;
  /** Bit 7 of +0x14 (vtable+0x48 reads it): `SetEnabled` `FUN_00377380`. */
  enabled: boolean;
  /** The state's `IMAGE` and `PULSE` (`FUN_0036e840`, `FUN_0036e730`): the compositor's, carried along. */
  image: string | null;
  pulse: number;
}

const stateOf = (spec: ButtonSpec, s: ButtonStateName): ButtonState =>
  s === 'NORMAL' ? spec.normal : s === 'ACTIVE' ? spec.active : s === 'PRESSED' ? spec.pressed : spec.disabled;

/** `FUN_003773f0` / `FUN_0036e790`: enter a state. The glow's phase carries over. */
export function enterButtonState(look: ButtonTextLook, spec: ButtonSpec, s: ButtonStateName): void {
  const st = stateOf(spec, s);
  look.state = s;
  look.image = st.image;
  look.scale = st.scale;
  look.color = [...st.textColor];
  look.alpha = STATE_TEXT_ALPHA;
  look.pulse = st.pulse;
  if (st.glow) {
    look.glow.on = true;
    look.glow.period = st.glow.time;
    look.glow.top = st.glow.range[1];
    look.glow.bottom = st.glow.range[0];
  } else look.glow.on = false;
}

/**
 * BUTTON_START_STATE_READING: a button's caption starts in NORMAL, entered as `Deactivate` enters it. The node's
 * set-up from its spec (thunk_FUN_00376bd0 D:L271345-271500) copies the four states and enters none; the first state
 * change was not traced (the screen's focus pass, PLAT-15). Until one, the text's own alpha would be 128, or the face's
 * opacity x 128 once its font is set (`FUN_00362b20` D:L260714-260723).
 */
export const BUTTON_START_STATE_READING: ButtonStateName = 'NORMAL';

/** A button's caption when the control is built (`BUTTON_START_STATE_READING`). */
export function newButtonLook(spec: ButtonSpec): ButtonTextLook {
  const look: ButtonTextLook = {
    state: 'NORMAL', color: [128, 128, 128], alpha: 128, scale: spec.scale, glow: noGlow(), pressTimer: 0, enabled: true, image: null, pulse: 0,
  };
  enterButtonState(look, spec, BUTTON_START_STATE_READING);
  return look;
}

/**
 * `Activate` (vtable+0x50, 0x3766a0): ACTIVE, when enabled; the press timer is left as it is. (It then runs the
 * button's event bindings -- the dialog runtime's, not the text's.)
 */
export function activateButton(look: ButtonTextLook, spec: ButtonSpec): void {
  if (!look.enabled) return;
  enterButtonState(look, spec, 'ACTIVE');
}

/** `Deactivate` `FUN_0036e6b0` (D:L267182-267200): NORMAL, when enabled; the press timer cleared. */
export function deactivateButton(look: ButtonTextLook, spec: ButtonSpec): void {
  if (!look.enabled) return;
  look.pressTimer = 0;
  enterButtonState(look, spec, 'NORMAL');
}

/** `Press` `FUN_00370c20` (D:L268554-268572): PRESSED for `PRESSED_HOLD`, when enabled. */
export function pressButton(look: ButtonTextLook, spec: ButtonSpec): void {
  if (!look.enabled) return;
  look.pressTimer = PRESSED_HOLD;
  enterButtonState(look, spec, 'PRESSED');
}

/**
 * `SetEnabled` `FUN_00377380` (D:L271949-271962): disabling enters DISABLED; enabling a button that is neither ACTIVE
 * nor PRESSED deactivates it (NORMAL).
 */
export function setButtonEnabled(look: ButtonTextLook, spec: ButtonSpec, enabled: boolean): void {
  look.enabled = enabled;
  if (!enabled) enterButtonState(look, spec, 'DISABLED');
  else if (look.state !== 'ACTIVE' && look.state !== 'PRESSED') deactivateButton(look, spec);
}

/**
 * The tick `FUN_003723b0` (D:L269237-269275): the caption's glow, then the press timer -- when it runs out the button
 * goes to ACTIVE if enabled, else DISABLED. `dt` in seconds, from the caller's clock (PLAT-12's).
 */
export function tickButton(look: ButtonTextLook, spec: ButtonSpec, dt: number): void {
  const a = stepGlow(look.glow, dt);
  if (a !== null) look.alpha = a;
  if (look.pressTimer > 0) {
    if (dt < look.pressTimer) look.pressTimer = fsub(look.pressTimer, dt);
    else {
      look.pressTimer = 0;
      enterButtonState(look, spec, look.enabled ? 'ACTIVE' : 'DISABLED');
    }
  }
}

/**
 * A LISTBOX row's caption (`FUN_0037ab90` D:L273840-273896 and `FUN_0037a810` D:L273691-273737): the selected row
 * takes the list's current colour (+0x154: NORMAL_COLOR when built, `FUN_00376420`), the others NORMAL_COLOR (+0x130);
 * an unselected row's alpha is 80, the selected row's +0xe0 (`LISTBOX_SELECTED_ALPHA_READING`) -- unless the list has
 * an `ACTIVE_COLOR` glow with a non-zero `TIME` and the row is selected while the list holds the focus, when the glow
 * runs with `RANGE` and `TIME` as a button's does.
 */
export function listboxRowLook(
  row: { selected: boolean; focused: boolean },
  list: { normalColor: readonly [number, number, number]; currentColor: readonly [number, number, number]; activeGlow: { range: [number, number]; time: number } | null },
  glow: TextGlow,
): { color: [number, number, number]; alpha: number | null } {
  const color: [number, number, number] = row.selected ? [...list.currentColor] : [...list.normalColor];
  const time = row.selected && list.activeGlow ? list.activeGlow.time : 0;
  if (time === 0 || !row.focused) {
    glow.on = false;
    return { color, alpha: row.selected ? LISTBOX_SELECTED_ALPHA_READING : 80 };
  }
  glow.on = true;
  glow.period = time;
  glow.top = list.activeGlow!.range[1];
  glow.bottom = list.activeGlow!.range[0];
  return { color, alpha: null };
}

/**
 * LISTBOX_SELECTED_ALPHA_READING: the selected row's alpha is the list's +0xe0, which its reset (`FUN_00376420`
 * D:L271267-271290) sets to 80 after using it; its other writers were not traced (PLAT-15).
 */
export const LISTBOX_SELECTED_ALPHA_READING = 80;
