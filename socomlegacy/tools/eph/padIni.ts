import { PCSX2_VK } from './keys';
import { type Input, type ScriptEvent, INPUTS, ScriptError } from './script';

/**
 * The emulator parity harness's PCSX2 [Pad1] (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md, "How one
 * input reaches both clients"). Product track (OT.R53): a validation instrument, an adaptation, never in a build and
 * never changing the game's behaviour.
 *
 * Every script input is bound to a keyboard key (keys.ts, PCSX2_VK), and a [Pad1] `Macro<N>` binds a further key to
 * one input at a fixed pressure, for each prepared non-full pressure. Ported from the desktop recompilation, read only:
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:97-101 -- LIGHT_MACROS (Triangle on Keyboard/7 as Macro15,
 *   LUp on Keyboard/8 as Macro16), LIGHT_STICK 0.5, LIGHT_TRIANGLE 0.2, DEFAULT_AXIS_SCALE 1.33;
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:172-184 -- _ini_pad1 (refuses an ini without [Pad1]);
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:187-214 -- light_plan (the macro pressures; their range
 *   checks, with seal_speed_fit.py:74 CROUCH_WALK_BELOW 0.838);
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:220-246 -- light_ini_text (line ends kept; a harness key
 *   bound elsewhere in the ini is refused, 236-239);
 * - desktop@be5578311:tools_py/parity/seal_speed_probe.py:77-87 -- PAD1_BINDING, PCSX2's names for the keys
 *   ("Triangle = Keyboard/I", "LUp = Keyboard/W").
 * The [Pad1] settings, bind names and their order are those of the desktop's tools/pcsx2/inis/PCSX2.ini (its PCSX2
 * copy, outside its git), read 2026-10-30; its binds there are an XInput pad, replaced here by keys.
 */

/** [Pad1] settings written ahead of the binds: the desktop ini's own values (AxisScale = the probe's 1.33). */
export const PAD1_SETTINGS: readonly (readonly [string, string])[] = [
  ['Type', 'DualShock2'], ['InvertL', '0'], ['InvertR', '0'], ['Deadzone', '0'], ['AxisScale', '1.33'],
  ['LargeMotorScale', '1'], ['SmallMotorScale', '1'], ['ButtonDeadzone', '0'], ['PressureModifier', '0.5'],
];
export const AXIS_SCALE = 1.33;

/** PCSX2's [Pad1] name for each script input, in the desktop ini's order. */
export const PAD1_NAME: Readonly<Record<Input, string>> = {
  up: 'Up', right: 'Right', down: 'Down', left: 'Left', triangle: 'Triangle', circle: 'Circle', cross: 'Cross',
  square: 'Square', select: 'Select', start: 'Start', l1: 'L1', l2: 'L2', r1: 'R1', r2: 'R2', l3: 'L3', r3: 'R3',
  lup: 'LUp', lright: 'LRight', ldown: 'LDown', lleft: 'LLeft', rup: 'RUp', rright: 'RRight', rdown: 'RDown', rleft: 'RLeft',
};

/** PCSX2's `Keyboard/<name>` for a virtual key the harness uses. */
export function pcsx2KeyName(vk: number): string {
  const named: Record<number, string> = { 0x0d: 'Return', 0x08: 'Backspace', 0x26: 'Up', 0x28: 'Down', 0x25: 'Left', 0x27: 'Right' };
  if (named[vk]) return named[vk]!;
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  throw new Error(`EPH [Pad1]: no PCSX2 key name for virtual key ${vk}`);
}

/** light_plan's Triangle: raw = int(pressure x 255), aimed at raw + 0.5, for a light press under 0.3. */
export function lightTrianglePressure(triangle: number): number {
  if (!(triangle > 0 && triangle < 0.3)) throw new Error(`EPH [Pad1]: a light Triangle is a pressure in (0, 0.3), not ${triangle}`);
  return (Math.trunc(triangle * 255) + 0.5) / 255;
}

const CROUCH_WALK_BELOW = 0.838;

/** light_plan's stick: d = round(push x 128), raw = 2d - 1, the pressure aimed at raw + 0.5 over AxisScale x 255. */
export function lightStickPressure(stick: number, axisScale: number = AXIS_SCALE): number {
  if (!(stick >= 0.05 && stick < CROUCH_WALK_BELOW)) {
    throw new Error(`EPH [Pad1]: a light stick push is in [0.05, ${CROUCH_WALK_BELOW}), not ${stick}`);
  }
  const raw = 2 * Math.round(stick * 128) - 1;
  return (raw + 0.5) / (axisScale * 255);
}

/** A prepared pressure: the script's `input` at `pressure` is the key `key` (vk), [Pad1] Macro`macro` at `iniPressure`. */
export interface PreparedPressure {
  readonly input: Input;
  readonly pressure: number;
  readonly key: string;
  readonly vk: number;
  readonly macro: number;
  readonly iniPressure: number;
}

/**
 * The probe's two (LIGHT_MACROS): the light Triangle and the light left stick up; then the movement campaign's two
 * sideways pushes (tools/eph/scripts/movement-campaign.sh, the quick prone drop and pop), on spare keys 9 and 0 and
 * the spare Macro13/Macro14, through the same light_plan arithmetic: the left stick left at 0.2, inside the move
 * stick's per-axis dead zone 0.3 (pad +0x288, `FUN_002da930` D:L179566-179592, as packages/viewer/src/moveStick.ts
 * `LEFT_DEAD_ZONE` reads it), and at 0.5, past it and under the crouch walk's 0.838 (seal_speed_fit.py:74).
 */
export const PREPARED: readonly PreparedPressure[] = [
  { input: 'triangle', pressure: 0.2, key: '7', vk: 0x37, macro: 15, iniPressure: lightTrianglePressure(0.2) },
  { input: 'lup', pressure: 0.5, key: '8', vk: 0x38, macro: 16, iniPressure: lightStickPressure(0.5, AXIS_SCALE) },
  { input: 'lleft', pressure: 0.2, key: '9', vk: 0x39, macro: 13, iniPressure: lightStickPressure(0.2, AXIS_SCALE) },
  { input: 'lleft', pressure: 0.5, key: '0', vk: 0x30, macro: 14, iniPressure: lightStickPressure(0.5, AXIS_SCALE) },
  // The parity matrix's analog speed curve (tools/eph/scripts/movement-campaign.sh, matrix): forward just past the
  // dead zone (0.35), between (0.65), and just past the standing run's knee 0.795 (0.8: `0.3 + 0.7 / sqrt 2`, the
  // circle's sqrt 2 step, packages/viewer/src/moveStick.ts, D:L179594-179634) while still under the crouch walk's
  // 0.838; back and right at 0.5 for the direction pairs. Spare keys 5, 6, U, O, P (R is in PCSX2's Shift & R hotkey).
  { input: 'lup', pressure: 0.35, key: '5', vk: 0x35, macro: 8, iniPressure: lightStickPressure(0.35, AXIS_SCALE) },
  { input: 'lup', pressure: 0.65, key: '6', vk: 0x36, macro: 9, iniPressure: lightStickPressure(0.65, AXIS_SCALE) },
  { input: 'lup', pressure: 0.8, key: 'U', vk: 0x55, macro: 10, iniPressure: lightStickPressure(0.8, AXIS_SCALE) },
  { input: 'ldown', pressure: 0.5, key: 'O', vk: 0x4f, macro: 11, iniPressure: lightStickPressure(0.5, AXIS_SCALE) },
  { input: 'lright', pressure: 0.5, key: 'P', vk: 0x50, macro: 12, iniPressure: lightStickPressure(0.5, AXIS_SCALE) },
];

/** The harness [Pad1] body: the settings, one key per input, then a Macro<N> triple per prepared pressure. */
export function pad1Lines(prepared: readonly PreparedPressure[] = PREPARED): string[] {
  const keys = new Set(INPUTS.map((i) => PCSX2_VK[i]));
  for (const p of prepared) {
    if (keys.has(p.vk)) throw new Error(`EPH [Pad1]: the macro key Keyboard/${p.key} is already a plain bind`);
    keys.add(p.vk);
    if (!(p.macro >= 1 && p.macro <= 16)) throw new Error(`EPH [Pad1]: Macro${p.macro} is outside 1..16`);
  }
  if (new Set(prepared.map((p) => p.macro)).size !== prepared.length) throw new Error('EPH [Pad1]: a macro number repeats');
  const order = Object.keys(PAD1_NAME) as Input[];
  return [
    ...PAD1_SETTINGS.map(([k, v]) => `${k} = ${v}`),
    ...order.map((i) => `${PAD1_NAME[i]} = Keyboard/${pcsx2KeyName(PCSX2_VK[i])}`),
    ...prepared.flatMap((p) => [
      `Macro${p.macro} = Keyboard/${p.key}`, `Macro${p.macro}Binds = ${PAD1_NAME[p.input]}`,
      `Macro${p.macro}Pressure = ${p.iniPressure.toFixed(6)}`,
    ]),
  ];
}

/**
 * `iniText` with its [Pad1] body replaced by the harness's (pad1Lines); every other line kept byte for byte, the line
 * ends kept. Refused when there is no [Pad1] (_ini_pad1), and when a harness key is bound outside [Pad1]: a macro key
 * anywhere in a chord (light_ini_text), a plain key bound alone (a chord such as Alt & Return does not fire on Return).
 */
export function replacePad1(iniText: string, prepared: readonly PreparedPressure[] = PREPARED): string {
  const lines = iniText.split(/(?<=\n)/);
  const eol = lines[0]?.endsWith('\r\n') ? '\r\n' : '\n';
  const plain = new Set(INPUTS.map((i) => `Keyboard/${pcsx2KeyName(PCSX2_VK[i])}`));
  const macro = new Set(prepared.map((p) => `Keyboard/${p.key}`));
  const out: string[] = [];
  let section: string | null = null;
  let start = -1;
  let lastBody = -1;
  for (const ln of lines) {
    const s = ln.trim();
    if (s.startsWith('[')) {
      section = s;
      if (s === '[Pad1]') {
        if (start >= 0) throw new Error('EPH [Pad1]: the PCSX2 ini has two [Pad1] sections');
        out.push(ln.endsWith('\n') ? ln : ln + eol);
        start = out.length;
        lastBody = out.length;
        continue;
      }
    }
    if (section === '[Pad1]') {
      if (s !== '') lastBody = out.length + 1;
      out.push(ln);
      continue;
    }
    const eq = s.indexOf('=');
    if (eq >= 0) {
      const tokens = s.slice(eq + 1).split('&').map((t) => t.trim());
      const clash = tokens.find((t) => macro.has(t)) ?? (tokens.length === 1 && plain.has(tokens[0]!) ? tokens[0] : undefined);
      if (clash) throw new Error(`EPH [Pad1]: ${clash} is already bound (${s}): the harness needs it spare`);
    }
    out.push(ln);
  }
  if (start < 0) throw new Error('EPH [Pad1]: no [Pad1] section in the PCSX2 ini');
  const body = pad1Lines(prepared).map((l) => l + eol);
  return [...out.slice(0, start), ...body, ...out.slice(lastBody)].join('');
}

/** The key that plays `input` at exactly `value`: 1 is the plain bind, 0 a release (null), else a prepared macro key. */
export function pressureKey(input: Input, value: number, prepared: readonly PreparedPressure[] = PREPARED): { key: string; vk: number } | null {
  if (value === 0) return null;
  if (value === 1) return { key: pcsx2KeyName(PCSX2_VK[input]), vk: PCSX2_VK[input] };
  const p = prepared.find((q) => q.input === input && q.pressure === value);
  if (!p) {
    const have = prepared.filter((q) => q.input === input).map((q) => q.pressure);
    throw new Error(`${input} at ${value} is not prepared (prepared: 0, 1${have.length ? ', ' + have.join(', ') : ''}); never rounded`);
  }
  return { key: p.key, vk: p.vk };
}

/** The whole script checked at load: every pressure is one the ini carries. */
export function checkPrepared(events: readonly ScriptEvent[], prepared: readonly PreparedPressure[] = PREPARED): void {
  for (const e of events) {
    try {
      pressureKey(e.input, e.pressure, prepared);
    } catch (err) {
      throw new ScriptError(e.line, (err as Error).message);
    }
  }
}

export interface KeyAction {
  readonly t: number;
  readonly line: number;
  readonly action: 'down' | 'up';
  readonly vk: number;
}

/** The script as PCSX2 key downs and ups: a pressure change releases the input's held key before pressing the next. */
export function keyActions(events: readonly ScriptEvent[], prepared: readonly PreparedPressure[] = PREPARED): KeyAction[] {
  checkPrepared(events, prepared);
  const held = new Map<Input, number>();
  const out: KeyAction[] = [];
  for (const e of events) {
    const next = pressureKey(e.input, e.pressure, prepared)?.vk ?? null;
    const cur = held.get(e.input) ?? null;
    if (next === cur) continue;
    if (cur !== null) out.push({ t: e.t, line: e.line, action: 'up', vk: cur });
    if (next !== null) out.push({ t: e.t, line: e.line, action: 'down', vk: next });
    if (next === null) held.delete(e.input);
    else held.set(e.input, next);
  }
  return out;
}
