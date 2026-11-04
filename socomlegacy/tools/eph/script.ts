/**
 * The emulator parity harness's shared input script (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md,
 * "How one input reaches both clients"). Product track (OT.R53): a validation instrument, an adaptation, never in a
 * build and never changing the game's behaviour.
 *
 * One line per event, `<t_ms> <input> <pressure>`, in the original's pad terms: an input is a PS2 pad button or a stick
 * half-axis, a pressure is 0..1 (0 = released). `#` starts a comment; blank lines are skipped; times never go back.
 */

export const BUTTONS = ['cross', 'circle', 'square', 'triangle', 'l1', 'l2', 'r1', 'r2', 'l3', 'r3',
  'select', 'start', 'up', 'down', 'left', 'right'] as const;
export const STICK_HALVES = ['lup', 'ldown', 'lleft', 'lright', 'rup', 'rdown', 'rleft', 'rright'] as const;

export type Button = (typeof BUTTONS)[number];
export type StickHalf = (typeof STICK_HALVES)[number];
export type Input = Button | StickHalf;

export const INPUTS: readonly Input[] = [...BUTTONS, ...STICK_HALVES];

export function isStickHalf(input: Input): input is StickHalf {
  return (STICK_HALVES as readonly string[]).includes(input);
}

/** One script event; `line` is its 1-based line in the script text, for every later refusal to name. */
export interface ScriptEvent {
  readonly t: number;
  readonly input: Input;
  readonly pressure: number;
  readonly line: number;
}

export class ScriptError extends Error {
  constructor(readonly line: number, what: string) {
    super(`script line ${line}: ${what}`);
    this.name = 'ScriptError';
  }
}

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function parseScript(text: string): ScriptEvent[] {
  const out: ScriptEvent[] = [];
  let last = -Infinity;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const hash = raw.indexOf('#');
    const body = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (body === '') return;
    const f = body.split(/\s+/);
    if (f.length !== 3) throw new ScriptError(line, `expected "<t_ms> <input> <pressure>", got "${body}"`);
    const [ts, name, ps] = f as [string, string, string];
    const t = NUMBER.test(ts) ? Number(ts) : NaN;
    if (!Number.isFinite(t) || t < 0) throw new ScriptError(line, `time "${ts}" is not a non-negative number of ms`);
    if (t < last) throw new ScriptError(line, `time ${t} is before the previous event's ${last}`);
    const input = name.toLowerCase() as Input;
    if (!INPUTS.includes(input)) throw new ScriptError(line, `unknown input "${name}" (one of ${INPUTS.join(' ')})`);
    const pressure = NUMBER.test(ps) ? Number(ps) : NaN;
    if (!(pressure >= 0 && pressure <= 1)) throw new ScriptError(line, `pressure "${ps}" is not in 0..1`);
    last = t;
    out.push({ t, input, pressure, line });
  });
  return out;
}
