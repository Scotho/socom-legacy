import { PAD_BUTTON, PAD_PRESS, type Input, type PadFlag } from './gamepad';
import { OVERLAY_MAX_BUTTON } from './overlayButtonSetting';
import { SETUP_KEY } from './startupSettings';

/**
 * h59U9CLb: double binds and combo binds -- a **browser adaptation** (the original pad has no extra binds), off by
 * default: the game's pad reader (`./controllerInput` `ControllerInput`, the extras key below) loads them and the front
 * end's match applies them after its pad read (`./matchMount`). Pure: no DOM, no storage; `parsePadExtras` reads only the
 * string or object it is handed. It changes nothing a player without extras sees: nothing stored, the match's input is
 * today's (`test/padExtras.test.ts`, `test/padExtrasWiring.test.ts`).
 *
 * **The owner's rule** (Craig, 2026-11-02, relayed by the controller): "when combo bound it will do the original action
 * then it will do what you tell it". Read with his answers to the scoping's questions (agent-mail
 * `handoffs/2026-11-02/binds-edge-cases-70.md`):
 * - Q1, **the same frame**: the button's own action (the player's bindings, untouched) and the added one on the same
 *   press, the added one ORed in after -- never a timed sequence (a sequence is a macro). Held only: the added action is
 *   held exactly while its trigger is; no timer, pulse, repeat or ordering in time (the fire mode's own .4 s hold stays
 *   the only repeat, `./fireModeInput`).
 * - Q2: any button can be a modifier, and keeps its own action (LT still swaps weapon on every combo press).
 * - Q3: any pair is allowed; a pair one thumb works (`sameThumb`) comes back with `warning: 'same-thumb'`, data only.
 * - Q4: extras target **actions** (`Input`'s lanes), not logical buttons, so they follow the presets and FIRE RATE's
 *   swap (`FUN_00592050` D:L451464-451467, applied to the pad before the lanes).
 *
 * **The buttons** are physical: the standard mapping's indices (`./gamepad` `PAD_BUTTON`, W3C Gamepad "Remapping"; 16
 * the centre button, 17 a PlayStation pad's touchpad, past it a pad's extras such as back paddles), read off the pad
 * before the player's bindings (`./controllerInput` `ControllerInput.view`), up to `OVERLAY_MAX_BUTTON` as a binding.
 *
 * **Where it goes** (the wiring's, not here): after `padInput` and before the lanes, so an added `fireMode` feeds the one
 * `FireModeInput.step` (never a second detector) and an added stance is `stance` / `prone` (never `StancePress`'s
 * pressure path); never while a menu is open.
 *
 * **The storage key** (`padExtrasKeyOf`): `s2u.startup.v1.pad.extras.<profile>` -- the setup store's pad prefix
 * (`./startupSettings` `SETUP_KEY`), one per pad profile, version 1, a key of its own so `parseController` is untouched
 * and a bad entry drops alone. The reader re-validates it at each load (storage is editable).
 */

/** The stored format's version. */
export const PAD_EXTRAS_VERSION = 1;

/** The pad profile prefix (`./controllerInput`'s profile keys, `s2u.startup.v1.pad.<id JSON>`) and the extras' beside it. */
const PROFILE_PREFIX = `${SETUP_KEY}.pad.`;
export const PAD_EXTRAS_PREFIX = `${SETUP_KEY}.pad.extras.`;
/** The extras key of a pad profile's key: `s2u.startup.v1.pad.<id JSON>` -> `s2u.startup.v1.pad.extras.<id JSON>`. */
export function padExtrasKeyOf(profileKey: string): string {
  return PAD_EXTRAS_PREFIX + (profileKey.startsWith(PROFILE_PREFIX) ? profileKey.slice(PROFILE_PREFIX.length) : profileKey);
}

/**
 * The actions an extra may add: the play set. Refused: the fly camera's (`boost`, `mode`), the actions of the buttons
 * the menus need or the d-pad (`action` on Cross, `boost` on Circle, `mode` on START, `zoom` / `zoomOut` / `leanLeft` /
 * `leanRight` on the d-pad: the brief's rule), the sticks, and anything not a lane (TeamCommand has none: the voice
 * reads its button by the preset).
 */
export const PAD_EXTRA_ACTIONS = [
  'jump', 'fire', 'fireMode', 'reload', 'swap1', 'swap2', 'inventory', 'scoreboard', 'stance', 'crouch', 'prone',
] as const satisfies readonly PadFlag[];
export type ExtraAction = (typeof PAD_EXTRA_ACTIONS)[number];

/** A same-thumb pair: allowed (Q3), flagged. */
export type ExtraWarning = 'same-thumb';

/** A double bind: `button` held also holds `action`. */
export interface DoubleBind { button: number; action: ExtraAction }
/** A combo: `button` pressed while `modifier` is already held holds `action`, until either is let go. */
export interface ComboBind { modifier: number; button: number; action: ExtraAction; warning?: ExtraWarning }
export interface PadExtras { readonly doubles: readonly DoubleBind[]; readonly combos: readonly ComboBind[] }

/** No extras: the default. */
export const EMPTY_PAD_EXTRAS: PadExtras = Object.freeze({ doubles: Object.freeze([]), combos: Object.freeze([]) }) as PadExtras;

/**
 * What validation needs of the page: the overlay's opening button (`./modern/overlay/binding` `readOverlayButton`), never
 * part of an extra; `heldBinds`, the physical buttons of the profile's SEPARATE Crouch and Prone binds (empty in
 * COMBINED, `./controllerInput` `poll`), never a modifier.
 */
export interface PadExtrasContext { overlayButton: number; heldBinds: readonly number[] }

/** Why an entry, or the whole store, was dropped. */
export type DropReason = 'version' | 'shape' | 'button' | 'action' | 'self' | 'overlay' | 'held-bind';
export interface PadExtrasParse { extras: PadExtras; dropped: { entry: unknown; reason: DropReason }[] }

const LEFT_THUMB: ReadonlySet<number> = new Set([PAD_BUTTON.L3, PAD_BUTTON.Up, PAD_BUTTON.Down, PAD_BUTTON.Left, PAD_BUTTON.Right]);
const RIGHT_THUMB: ReadonlySet<number> = new Set([PAD_BUTTON.R3, PAD_BUTTON.Cross, PAD_BUTTON.Circle, PAD_BUTTON.Square, PAD_BUTTON.Triangle]);

/**
 * Whether one thumb works both buttons on a standard pad: the left thumb's d-pad and L3, the right thumb's face buttons
 * and R3 (the scoping's edge case 3). The shoulders, the centre buttons and the extras are no thumb's here.
 */
export function sameThumb(a: number, b: number): boolean {
  return (LEFT_THUMB.has(a) && LEFT_THUMB.has(b)) || (RIGHT_THUMB.has(a) && RIGHT_THUMB.has(b));
}

const isButton = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= OVERLAY_MAX_BUTTON;
const isAction = (v: unknown): v is ExtraAction => typeof v === 'string' && (PAD_EXTRA_ACTIONS as readonly string[]).includes(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The stored extras (a JSON string or its object; `null` absent), validated: the whole store is refused only when it is
 * not an object of version 1; each entry is checked alone and a bad one is dropped with its reason, the rest kept in
 * order. A list that is not an array is empty.
 */
export function parsePadExtras(raw: unknown, ctx: PadExtrasContext): PadExtrasParse {
  if (raw === null || raw === undefined) return { extras: EMPTY_PAD_EXTRAS, dropped: [] };
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = undefined; } }
  if (!isRecord(v) || v.version !== PAD_EXTRAS_VERSION) return { extras: EMPTY_PAD_EXTRAS, dropped: [{ entry: raw, reason: 'version' }] };
  const dropped: PadExtrasParse['dropped'] = [];
  const doubles: DoubleBind[] = [], combos: ComboBind[] = [];
  const drop = (entry: unknown, reason: DropReason): void => { dropped.push({ entry, reason }); };
  for (const e of Array.isArray(v.doubles) ? v.doubles : []) {
    if (!isRecord(e)) { drop(e, 'shape'); continue; }
    if (!isButton(e.button)) { drop(e, 'button'); continue; }
    if (e.button === ctx.overlayButton) { drop(e, 'overlay'); continue; }
    if (!isAction(e.action)) { drop(e, 'action'); continue; }
    doubles.push({ button: e.button, action: e.action });
  }
  for (const e of Array.isArray(v.combos) ? v.combos : []) {
    if (!isRecord(e)) { drop(e, 'shape'); continue; }
    if (!isButton(e.modifier) || !isButton(e.button)) { drop(e, 'button'); continue; }
    if (e.modifier === e.button) { drop(e, 'self'); continue; }
    if (e.modifier === ctx.overlayButton || e.button === ctx.overlayButton) { drop(e, 'overlay'); continue; }
    if (ctx.heldBinds.includes(e.modifier)) { drop(e, 'held-bind'); continue; }
    if (!isAction(e.action)) { drop(e, 'action'); continue; }
    const c: ComboBind = { modifier: e.modifier, button: e.button, action: e.action };
    if (sameThumb(c.modifier, c.button)) c.warning = 'same-thumb';
    combos.push(c);
  }
  return { extras: { doubles, combos }, dropped };
}

/** A pad's buttons as down or not, as the reader reads a button (`pressed`, or a value of `PAD_PRESS` and over). */
export function physicalPressed(buttons: readonly { readonly pressed: boolean; readonly value: number }[]): boolean[] {
  return buttons.map((b) => b.pressed || b.value >= PAD_PRESS);
}

/**
 * The modifier state between frames: the physical buttons of the last frame and which combos are on. `reset` at the
 * flush, a blur and a pad change, so no modifier sticks: after it a held button is no fresh press (a combo waits for its
 * button to be let go and pressed again under the modifier).
 */
export class PadExtrasState {
  /** @internal the last frame's physical buttons. */
  last: readonly boolean[] = [];
  /** @internal the combos on, by their index in the extras. */
  on = new Set<number>();
  /** @internal set by `reset`: the next frame takes the pad as it is, every held button not a press. */
  fresh = true;
  reset(): void { this.last = []; this.on.clear(); this.fresh = true; }
}

/**
 * One frame: `input` (the pad's actions this frame, after the player's bindings) with the extras' actions ORed in, off
 * the physical buttons `pressed` (`physicalPressed`). A double bind's action is held while its button is; a combo's from
 * its button's press while its modifier was already down the frame before, until either is let go. While `menuOpen` the
 * input comes back untouched (the same object) and no combo is on after the menu until pressed afresh. Never mutates
 * `input`; empty extras give it back deep-equal.
 *
 * **An added stance is a press, never a hold** (the controller's default pending Craig, 2026-11-02, after the same-frame
 * read found a held trigger read as a held Triangle -- prone): `stance` is down on the frame its trigger is pressed (a
 * double bind's button, a combo's coming on) and up after, so the stance button's machine (`./stanceButton`) reads one
 * tap per trigger press. A trigger held through a reset or a menu is no press. Every other added action is held.
 */
export function applyPadExtras(extras: PadExtras, input: Input, pressed: readonly boolean[], state: PadExtrasState, menuOpen: boolean): Input {
  const now = (b: number): boolean => pressed[b] === true;
  const was = (b: number): boolean => state.last[b] === true;
  const fresh = state.fresh || menuOpen;
  const comboPressed = new Set<number>();
  extras.combos.forEach((c, i) => {
    if (!now(c.button) || !now(c.modifier)) { state.on.delete(i); return; }
    // The press of the button, the modifier already down before it: never after a reset or under a menu, where a held
    // button is the pad as it was, not a press.
    if (!fresh && !was(c.button) && was(c.modifier)) { state.on.add(i); comboPressed.add(i); }
  });
  // The double binds' presses this frame, read before `last` moves on (an added stance acts on them alone).
  const pressedNow = (b: number): boolean => !fresh && now(b) && !was(b);
  const doublePressed = extras.doubles.map((d) => pressedNow(d.button));
  state.last = [...pressed];
  state.fresh = false;
  if (menuOpen) { state.on.clear(); return input; }
  if (extras.doubles.length === 0 && extras.combos.length === 0) return { ...input };
  const out: Input = { ...input };
  extras.doubles.forEach((d, i) => { if (d.action === 'stance' ? doublePressed[i] : now(d.button)) out[d.action] = true; });
  extras.combos.forEach((c, i) => { if (c.action === 'stance' ? comboPressed.has(i) : state.on.has(i)) out[c.action] = true; });
  // #702's review (Codex P2): an added stance is a stance source of its own -- never Triangle's action alone, whatever
  // the Prone button's `stanceOff` (OT.R107; `./gamepad` `stanceLane`), as `mergeInput` keeps an independent source's.
  if (out.stanceOff && (extras.doubles.some((d, i) => d.action === 'stance' && doublePressed[i]) || extras.combos.some((c, i) => c.action === 'stance' && comboPressed.has(i)))) out.stanceOff = false;
  return out;
}
