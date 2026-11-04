import type { PadLike } from './gamepad';

/**
 * LATER 380 (the owner's word, 2026-10-23; product track, a browser adaptation with no original): a pad whose `mapping`
 * is not `standard` -- a PS2 pad on a USB adapter, some pads on Firefox -- read through a layout taught by press, as a
 * standard pad. Pure rules, no DOM: what counts as a press of a raw button, a trigger axis or a hat-switch d-pad; the one
 * input moved from rest (the pass's step); the standard view the launcher and the match read (`./controllerInput`); and
 * the hold that takes a binding (the reading of the owner's "hold button style remapping", the console launcher plan's
 * Log, 2026-10-24). Nothing of the game's behaviour: the match reads the same logical buttons a standard pad gives.
 */

/**
 * A binding is taken from the one input held this long, never a tap (0.6-1 s asked; the plan's Log says how to change it).
 * The port's own choice (a browser adaptation, LATER 380; the original binds no buttons).
 */
export const HOLD_TO_BIND_MS_ADAPTATION = 800;

/** The standard layout's buttons (the W3C order: Cross .. R3, the d-pad, the centre button) and its four axes. */
export const STANDARD_BUTTON_COUNT = 17;
export const STANDARD_AXIS_COUNT = 4;

/** A raw input read as a standard button: a raw button; an axis toward `to` from its rest `from`; a hat's direction. */
export type RawSource = { button: number } | { axis: number; from: number; to: number } | { axis: number; to: number; hat: true };
/** A raw axis read as a standard stick axis, inverted when the pad's positive is the standard's negative. */
export interface RawAxis { axis: number; invert: boolean }
/** A pad's taught layout: the raw input behind each standard button (null untaught) and each stick axis. */
export interface PadLayout { version: 1; buttons: (RawSource | null)[]; axes: (RawAxis | null)[] }

/** One step of the pass: a standard button or stick direction, its words, and whether the pass may skip it. */
export interface TeachStep { name: string; kind: 'button' | 'axis'; target: number; required: boolean }

/**
 * The pass's order: the menus' buttons first (`./controllerInput` `MENU_REQUIRED`: Cross, Circle, START -- the pass cannot
 * finish without them), then the d-pad and both sticks (the menus' walk and the match's movement), all required; then
 * the rest of the face, shoulder and stick buttons, each of which may be skipped.
 */
export const TEACH_STEPS: readonly TeachStep[] = [
  { name: 'Cross', kind: 'button', target: 0, required: true },
  { name: 'Circle', kind: 'button', target: 1, required: true },
  { name: 'START', kind: 'button', target: 9, required: true },
  { name: 'D-pad up', kind: 'button', target: 12, required: true },
  { name: 'D-pad down', kind: 'button', target: 13, required: true },
  { name: 'D-pad left', kind: 'button', target: 14, required: true },
  { name: 'D-pad right', kind: 'button', target: 15, required: true },
  { name: 'Left stick right', kind: 'axis', target: 0, required: true },
  { name: 'Left stick down', kind: 'axis', target: 1, required: true },
  { name: 'Right stick right', kind: 'axis', target: 2, required: true },
  { name: 'Right stick down', kind: 'axis', target: 3, required: true },
  { name: 'Square', kind: 'button', target: 2, required: false },
  { name: 'Triangle', kind: 'button', target: 3, required: false },
  { name: 'L1', kind: 'button', target: 4, required: false },
  { name: 'R1', kind: 'button', target: 5, required: false },
  { name: 'L2', kind: 'button', target: 6, required: false },
  { name: 'R2', kind: 'button', target: 7, required: false },
  { name: 'SELECT', kind: 'button', target: 8, required: false },
  { name: 'L3', kind: 'button', target: 10, required: false },
  { name: 'R3', kind: 'button', target: 11, required: false },
];

/** A raw pad as the rules read it (`PadLike`'s buttons and axes). */
type RawPad = Pick<PadLike, 'buttons' | 'axes'>;

const down = (b: { pressed: boolean; value: number } | undefined): boolean => !!b && (b.pressed || b.value >= 0.5);
const axisOf = (p: RawPad, i: number): number => { const v = p.axes[i]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };

/** A hat switch's eight directions are -1 + k·2/7 (k = 0 up, clockwise); its rest lies outside [-1, 1]. */
const HAT_STEP = 2 / 7;
/** How far past [-1, 1] an axis reads as a hat at rest, not a direction (the port's own margin, LATER 380). */
export const HAT_REST_MARGIN_ADAPTATION = 0.05;
/** How near a direction's value a hat reads as that direction (the port's own tolerance, LATER 380). */
export const HAT_TOLERANCE_ADAPTATION = 0.05;
/** A hat axis's direction 0-7 (up, up-right, ... up-left), or -1 at rest or between directions. */
export function hatIndex(v: number): number {
  if (!Number.isFinite(v) || Math.abs(v) > 1 + HAT_REST_MARGIN_ADAPTATION) return -1;
  const k = Math.round((v + 1) / HAT_STEP);
  return k >= 0 && k <= 7 && Math.abs(v - (-1 + k * HAT_STEP)) < HAT_TOLERANCE_ADAPTATION ? k : -1;
}
/** An axis whose rest is a hat's (outside [-1, 1]). */
const hatRest = (v: number): boolean => Number.isFinite(v) && Math.abs(v) > 1 + HAT_REST_MARGIN_ADAPTATION;

/** A raw input's press: a button down; an axis past halfway from its rest toward its pressed value; a hat within one step. */
export function sourcePressed(s: RawSource, p: RawPad): boolean {
  if ('button' in s) return down(p.buttons[s.button]);
  const v = axisOf(p, s.axis);
  if ('hat' in s) {
    const at = hatIndex(v), want = hatIndex(s.to);
    if (at < 0 || want < 0) return false;
    const d = Math.abs(at - want) % 8;
    return Math.min(d, 8 - d) <= 1;                                   // a diagonal presses both its neighbours
  }
  const span = s.to - s.from;
  return span !== 0 && (v - s.from) / span > AXIS_MOVED_ADAPTATION;
}

/**
 * The press as a button's value (a trigger axis's travel, 0-1, and 0 until it is pressed: an untouched trigger reads 0
 * in Chromium, halfway on a -1..1 axis, which a value read would take for held).
 */
function sourceValue(s: RawSource, p: RawPad): number {
  if ('button' in s) return p.buttons[s.button]?.value ?? 0;
  if ('hat' in s || !sourcePressed(s, p)) return sourcePressed(s, p) ? 1 : 0;
  const span = s.to - s.from;
  return span === 0 ? 0 : Math.max(0, Math.min(1, (axisOf(p, s.axis) - s.from) / span));
}

/** How far an axis moved from its rest for it to count, taught or pressed (halfway; the port's own choice, LATER 380). */
export const AXIS_MOVED_ADAPTATION = 0.5;

/**
 * The one raw input moved from `rest` (the pad as it lay when the pass began): a button pressed, a hat's direction, or an
 * axis moved past halfway (a trigger's travel; its rest kept); null for none, or for more than one at once -- except
 * that one trigger axis moved with buttons is that axis: an Xbox-style pad read without the standard mapping presses a
 * digital twin of its trigger early in the pull (the GameSir-G7 HE on macOS Chromium: L2 axis 3 with button 8), and the
 * axis keeps the trigger's travel.
 */
export function detectSource(p: RawPad, rest: RawPad): RawSource | null {
  const found: RawSource[] = [];
  p.buttons.forEach((b, i) => { if (down(b) && !down(rest.buttons[i])) found.push({ button: i }); });
  p.axes.forEach((_, i) => {
    const v = axisOf(p, i), r = axisOf(rest, i);
    if (hatRest(r)) { const k = hatIndex(v); if (k >= 0) found.push({ axis: i, to: -1 + k * HAT_STEP, hat: true }); return; }
    if (Math.abs(v - r) > AXIS_MOVED_ADAPTATION) found.push({ axis: i, from: r, to: v > r ? 1 : -1 });
  });
  if (found.length === 1) return found[0]!;
  const axes = found.filter((s) => 'from' in s);
  return axes.length === 1 && found.every((s) => s === axes[0] || 'button' in s) ? axes[0]! : null;
}

/**
 * A trigger taught from a rest misread: Chromium reports a trigger axis as 0 until it is first touched, and at its true
 * rest (-1) once let go. An axis read past halfway beyond its taught rest, away from its pressed end, rests at the other
 * end: the source with that rest, or null when it reads as taught.
 */
export function settledTrigger(s: RawSource, p: RawPad): RawSource | null {
  if (!('from' in s)) return null;
  const dir = Math.sign(s.to - s.from), v = axisOf(p, s.axis);
  return dir !== 0 && (v - s.from) * dir < -AXIS_MOVED_ADAPTATION && s.from !== -s.to ? { axis: s.axis, from: -s.to, to: s.to } : null;
}

/** A stick direction: the non-hat axis moved furthest past halfway from rest, inverted when it moved negative. */
export function detectAxis(p: RawPad, rest: RawPad): RawAxis | null {
  let best: RawAxis | null = null, far = AXIS_MOVED_ADAPTATION;
  p.axes.forEach((_, i) => {
    const r = axisOf(rest, i);
    if (hatRest(r)) return;
    const d = axisOf(p, i) - r;
    if (Math.abs(d) > far) { far = Math.abs(d); best = { axis: i, invert: d < 0 }; }
  });
  return best;
}

/** Two sources are the same raw input (a hat's direction is its own). */
export function sameSource(a: RawSource, b: RawSource): boolean {
  if ('button' in a || 'button' in b) return 'button' in a && 'button' in b && a.button === b.button;
  if (a.axis !== b.axis) return false;
  return 'hat' in a && 'hat' in b ? hatIndex(a.to) === hatIndex(b.to) : !('hat' in a) && !('hat' in b) && Math.sign(a.to - a.from) === Math.sign(b.to - b.from);
}

/** The raw pad read through its layout: a standard pad of seventeen buttons and four axes (an untaught one, at rest). */
export function standardView(p: PadLike, layout: PadLayout): PadLike {
  const buttons = Array.from({ length: STANDARD_BUTTON_COUNT }, (_, i) => {
    const s = layout.buttons[i];
    return s ? { pressed: sourcePressed(s, p), value: sourceValue(s, p) } : { pressed: false, value: 0 };
  });
  const axes = Array.from({ length: STANDARD_AXIS_COUNT }, (_, i) => {
    const a = layout.axes[i];
    if (!a) return 0;
    const v = axisOf(p, a.axis);
    return a.invert ? -v : v;
  });
  return { id: p.id, index: p.index, connected: p.connected, mapping: 'standard', buttons, axes };
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseSource(v: unknown): RawSource | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if ('button' in o) return isInt(o['button'], 0, 63) ? { button: o['button'] } : undefined;
  if (!isInt(o['axis'], 0, 31) || !isNum(o['to'])) return undefined;
  if (o['hat'] === true) return hatIndex(o['to']) >= 0 ? { axis: o['axis'], to: o['to'], hat: true } : undefined;
  return isNum(o['from']) && o['from'] !== o['to'] ? { axis: o['axis'], from: o['from'], to: o['to'] } : undefined;
}

/** A saved layout, or null when it is not one (a profile's `layout` field; `./startupSettings` `parseController`). */
export function parseLayout(v: unknown): PadLayout | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o['version'] !== 1 || !Array.isArray(o['buttons']) || !Array.isArray(o['axes'])) return null;
  if (o['buttons'].length !== STANDARD_BUTTON_COUNT || o['axes'].length !== STANDARD_AXIS_COUNT) return null;
  const buttons = o['buttons'].map(parseSource);
  if (buttons.some((b) => b === undefined)) return null;
  const axes: (RawAxis | null)[] = [];
  for (const a of o['axes'] as unknown[]) {
    if (a === null) { axes.push(null); continue; }
    const x = a as Record<string, unknown>;
    if (!x || typeof x !== 'object' || !isInt(x['axis'], 0, 31) || typeof x['invert'] !== 'boolean') return null;
    axes.push({ axis: x['axis'], invert: x['invert'] });
  }
  return { version: 1, buttons: buttons as (RawSource | null)[], axes };
}
