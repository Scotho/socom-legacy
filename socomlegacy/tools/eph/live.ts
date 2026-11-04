import { GAMEPAD_BUTTON } from './pageMap';
import { pressureKey } from './padIni';
import { BUTTONS, type Button, type Input, type ScriptEvent, ScriptError, isStickHalf } from './script';
import { runTimeline, type RunTimelineOptions } from './timeline';

/**
 * The emulator parity harness's input sources (EPH-2 step 3; the owner's addendum, 2026-10-30: "designed as a test
 * harness AND as an automated harness ... players [can] get in there and mess with it too"). Product track (OT.R53): a
 * browser adaptation and a validation instrument, never in a build and never changing the game's behaviour.
 *
 * Two sources give the same events, `(t_ms, input, pressure)` in the script's terms, to the same translation:
 * - ScriptSource: a parsed script on a clock (the guest clock or the page tick, ./timeline);
 * - LivePadSource: one physical pad a person holds, read once by the harness through the headed page's Gamepad API
 *   (the real `getGamepads` the page's stub keeps as `__ephRealPads`, ./pageSeed), polled each frame; each change is an
 *   event sent at once to both clients -- PCSX2 by the key injector, the page by the stub pad. Neither client reads the
 *   pad itself: native reading could not apply ./pageMap's Prone/L3 translation or the light Triangle.
 *
 * The light Triangle on a live pad: a pad's face buttons are digital to the browser, so a plain Triangle is pressure 1
 * and a light one is a chord -- the modifier (L2 by default) held as Triangle goes down gives the chord's pressure
 * (0.2, the prepared light Triangle, ./padIni PREPARED). The pressure is fixed at the press. The modifier is the
 * chord's alone: it is never sent to either client, so a script that uses it for itself is refused beside the chord.
 * L3 is the page's Crouch bind (./pageMap) and is dropped. A stick half is on (pressure 1) at |axis| >= STICK_ON_AT,
 * as the keyboard-bound PCSX2 [Pad1] has no half push but the prepared ones.
 *
 * Every live event is kept and written as `live.script` in the script grammar, timed from the session's zero, so a
 * player's session replays as an automated run.
 */

export interface Chord {
  /** The button held to make `input` light. */
  readonly modifier: Button;
  readonly input: 'triangle';
  /** The pressure the chord gives: a prepared one (./padIni). */
  readonly pressure: number;
}

/** L2 held with Triangle: Triangle at 0.2, the prepared light press (under the 0.3 split, FUN_00594cf0 D:L453336-453351). */
export const DEFAULT_CHORD: Chord = { modifier: 'l2', input: 'triangle', pressure: 0.2 };

/** A stick half is pressed (pressure 1) at or past this deflection. An adaptation's threshold, not the game's. */
export const STICK_ON_AT = 0.5;

/** The chord checked: its modifier a button that is not Triangle nor L3, its pressure prepared, and unused by `script`. */
export function checkChord(chord: Chord, script: readonly ScriptEvent[] = []): void {
  if (!(BUTTONS as readonly string[]).includes(chord.modifier)) throw new Error(`EPH chord: the modifier "${chord.modifier}" is not a pad button`);
  if (chord.modifier === chord.input) throw new Error('EPH chord: the modifier cannot be the button it modifies');
  if (chord.modifier === 'l3') throw new Error('EPH chord: l3 is the page Crouch bind (./pageMap); pick another modifier');
  pressureKey(chord.input, chord.pressure);
  const clash = script.find((e) => e.input === chord.modifier);
  if (clash) throw new ScriptError(clash.line, `the script uses ${chord.modifier}, the live chord's modifier`);
}

/** A Gamepad snapshot as the harness reads it (standard mapping). */
export interface PadSnapshot {
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

const STICK: readonly [Input, number, -1 | 1][] = [
  ['lleft', 0, -1], ['lright', 0, 1], ['lup', 1, -1], ['ldown', 1, 1],
  ['rleft', 2, -1], ['rright', 2, 1], ['rup', 3, -1], ['rdown', 3, 1],
];

const roundMs = (t: number): number => Math.round(t * 1000) / 1000;

/**
 * Which physical button (standard-mapping index) plays each PS2 button in live mode. One table for both clients: the
 * harness reads the pad once and sends the same PS2 button to PCSX2 and the page, so a layout here never splits them.
 * `machete`: a player's PCSX2 binds the owner asked for (2026-10-31, a Discord screenshot): Select on Create/Back,
 * Start on PS/Guide (16 -- a browser may not report an Xbox pad's Guide), Circle on Options/Start, R3 on the Circle/B
 * button, the physical R3 unbound. A browser adaptation of the input only (a playtest preference): no game value moves.
 */
export type PadLayout = Readonly<Record<Button, number>>;
export const PAD_LAYOUTS: Readonly<Record<'standard' | 'machete', PadLayout>> = {
  standard: GAMEPAD_BUTTON,
  machete: { ...GAMEPAD_BUTTON, start: 16, circle: 9, r3: 1 },
};
export type PadLayoutName = keyof typeof PAD_LAYOUTS;

/** Gamepad snapshots to script events: one per change, the buttons in pad order, then the stick halves. */
export class LivePadReader {
  /** The comment lines liveScriptText writes ahead of the events: event n (1-based) is on line HEADER_LINES + n. */
  static readonly HEADER_LINES = 3;
  private readonly held = new Map<Input, number>();
  private next = LivePadReader.HEADER_LINES + 1;
  private last = 0;

  constructor(readonly chord: Chord = DEFAULT_CHORD, readonly layout: PadLayout = PAD_LAYOUTS.standard) {
    checkChord(chord);
  }

  read(pad: PadSnapshot, tMs: number): ScriptEvent[] {
    const t = Math.max(roundMs(tMs), this.last);
    const out: ScriptEvent[] = [];
    const down = (b: Button): boolean => pad.buttons[this.layout[b]]?.pressed ?? false;
    const emit = (input: Input, pressure: number): void => {
      if ((this.held.get(input) ?? 0) === pressure) return;
      if ((this.held.get(input) ?? 0) !== 0 && pressure !== 0) return;   // fixed at the press: no change while held
      if (pressure === 0) this.held.delete(input);
      else this.held.set(input, pressure);
      out.push({ t, input, pressure, line: this.next++ });
    };
    for (const b of [...BUTTONS].sort((x, y) => GAMEPAD_BUTTON[x] - GAMEPAD_BUTTON[y])) {
      if (b === this.chord.modifier || b === 'l3') continue;
      if (b === this.chord.input) emit(b, down(b) ? (down(this.chord.modifier) && !this.held.has(b) ? this.chord.pressure : this.held.get(b) ?? 1) : 0);
      else emit(b, down(b) ? 1 : 0);
    }
    for (const [half, axis, sign] of STICK) {
      if (!isStickHalf(half)) continue;
      const v = (pad.axes[axis] ?? 0) * sign;
      emit(half, v >= STICK_ON_AT ? 1 : 0);
    }
    this.last = t;
    return out;
  }
}

/** A live session as a script: LivePadReader.HEADER_LINES comment lines, then one event per line. */
export function liveScriptText(events: readonly ScriptEvent[], chord: Chord): string {
  const head = [
    '# EPH live session: a person on one pad, recorded by the harness (replay it with --script).',
    `# light Triangle chord: ${chord.modifier} held with ${chord.input} = ${chord.input} at ${chord.pressure}`,
    '# t_ms input pressure, from the session zero',
  ];
  if (head.length !== LivePadReader.HEADER_LINES) throw new Error('EPH live: the header lines changed without HEADER_LINES');
  return [...head, ...events.map((e) => `${e.t} ${e.input} ${e.pressure}`), ''].join('\n');
}

/** Where a run's events come from. `run` sends each event to `emit` (awaited) until the source ends or is stopped. */
export interface InputSource {
  readonly kind: 'script' | 'live';
  run(emit: (e: ScriptEvent) => Promise<void>): Promise<void>;
  stop(): void;
}

/**
 * Wall ms a script's clock may stand still before ScriptSource stops with an error (./timeline stallMs): PCSX2 paused
 * or gone, or the page frozen. An adaptation, the instrument's bound, not a game value; generous beside a guest frame
 * on the slowest box the design note allows (a software renderer under real time).
 */
export const SCRIPT_CLOCK_STALL_MS = 10_000;

/** A parsed script played on `clock` (ms since the run's zero). */
export class ScriptSource implements InputSource {
  readonly kind = 'script' as const;
  private stopped = false;

  constructor(private readonly events: readonly ScriptEvent[], private readonly clock: () => number | Promise<number>) {}

  /** Plays the script; a stalled clock (SCRIPT_CLOCK_STALL_MS unless `opts` says otherwise) or `opts.signal` ends it. */
  async run(emit: (e: ScriptEvent) => Promise<void>, opts: RunTimelineOptions = {}): Promise<void> {
    await runTimeline(this.events, async () => (this.stopped ? Infinity : this.clock()), async (e) => { if (!this.stopped) await emit(e); },
      { stallMs: SCRIPT_CLOCK_STALL_MS, ...opts });
  }

  stop(): void { this.stopped = true; }
}

export interface LivePadSourceOptions {
  /** The physical pad now, or null when none is connected (that read is skipped). */
  readonly read: () => Promise<PadSnapshot | null>;
  /** Ms since the session's zero. */
  readonly now: () => number;
  /** Between polls; the default yields one 60 Hz frame. */
  readonly wait?: () => Promise<void>;
  readonly chord?: Chord;
  readonly layout?: PadLayout;
}

/** One physical pad, polled until stopped; every event it emits is kept in `recorded` for live.script. */
export class LivePadSource implements InputSource {
  readonly kind = 'live' as const;
  readonly recorded: ScriptEvent[] = [];
  private readonly reader: LivePadReader;
  private stopped = false;

  constructor(private readonly opts: LivePadSourceOptions) {
    this.reader = new LivePadReader(opts.chord ?? DEFAULT_CHORD, opts.layout ?? PAD_LAYOUTS.standard);
  }

  get chord(): Chord { return this.reader.chord; }

  async run(emit: (e: ScriptEvent) => Promise<void>): Promise<void> {
    const wait = this.opts.wait ?? (() => new Promise<void>((done) => setTimeout(done, 1000 / 60)));
    while (!this.stopped) {
      const snap = await this.opts.read();
      const t = this.opts.now();
      if (snap) {
        for (const e of this.reader.read(snap, t)) {
          this.recorded.push(e);
          await emit(e);
        }
      }
      if (!this.stopped) await wait();
    }
  }

  stop(): void { this.stopped = true; }
}
