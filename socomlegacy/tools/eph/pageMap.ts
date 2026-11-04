import { type Button, type ScriptEvent, type StickHalf, ScriptError, isStickHalf } from './script';

/**
 * The original-terms script translated into the page's pad events (EPH-2; da's ruling, 2026-10-30, in
 * docs/specs/2026-10-30-emulator-parity-harness-design.md, "Setting up the same bindings"). Product track (OT.R53): a
 * validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * The page reads no pressure, so a Triangle is played by the moment the original acts (the design note, citing
 * FUN_00594cf0 D:L453336-453351 for the 0.3 split):
 * - a full Triangle (peak >= 0.3) acts as its pressure crosses 0.3: the page presses Prone (the profile puts Prone on
 *   Triangle's physical button) at that moment, and releases it when Triangle releases;
 * - a light Triangle (peak < 0.3) acts on its release: the page holds Crouch (the profile puts it on L3) from
 *   `leadFrames` frames before the release and releases it at the release (PP-5: Crouch acts at its release).
 * Both sides are measured from the act (actMoments). L3 is the page's Crouch bind, so a script line on L3 is refused.
 * Every other button passes through as pressed with value 1; a stick half becomes its axis, y down.
 *
 * The Gamepad indices are the standard mapping the page reads: packages/viewer/src/gamepad.ts:27-28 (buttons) and
 * 384-385 (axes 0/1 the left stick, 2/3 the right) -- restated here, since tools/eph imports no workspace package.
 */

export const GAMEPAD_BUTTON: Readonly<Record<Button, number>> = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15,
};

/** The axis of each stick half, and its sign (y down: up is negative). */
const STICK_AXIS: Readonly<Record<StickHalf, readonly [number, -1 | 1]>> = {
  lleft: [0, -1], lright: [0, 1], lup: [1, -1], ldown: [1, 1],
  rleft: [2, -1], rright: [2, 1], rup: [3, -1], rdown: [3, 1],
};

/** The profile's Prone: Triangle's physical button. */
export const PRONE_BUTTON = GAMEPAD_BUTTON.triangle;
/** The profile's Crouch: L3, which no script line uses. */
export const CROUCH_BUTTON = GAMEPAD_BUTTON.l3;
/** The full / light split of a Triangle press (the design note; FUN_00594cf0 D:L453336-453351). */
export const FULL_TRIANGLE_AT = 0.3;
/** One page frame at 60 Hz, the unit of the light Triangle's lead. */
export const FRAME_MS = 1000 / 60;
export const DEFAULT_LEAD_FRAMES = 3;

export type PageEvent =
  | { readonly t: number; readonly kind: 'button'; readonly index: number; readonly pressed: boolean; readonly value: number; readonly line: number }
  | { readonly t: number; readonly kind: 'axis'; readonly index: number; readonly value: number; readonly line: number };

/** One Triangle press's act: `t` the act, `pressT` the press, `releaseT` the release (null when never released). */
export interface ActMoment {
  readonly kind: 'full' | 'light';
  readonly t: number;
  readonly pressT: number;
  readonly releaseT: number | null;
  readonly line: number;
}

export interface PageMapOptions {
  /** Frames of 1000/60 ms the page holds Crouch before a light Triangle's release (default 3). */
  readonly leadFrames?: number;
  /** The page's Crouch button for a light Triangle (default L3; the owner's own setup has it on R3, 11). */
  readonly crouchButton?: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The translation one event at a time, for a script and for a live pad (./live; the owner's addendum, 2026-10-30).
 * `script` mode is the rule above: a light Triangle's Crouch is held from `leadFrames` before its release. A live pad
 * cannot reach back, so in `live` mode Crouch goes down at the light release and up `leadFrames` later: the page acts
 * `leadFrames` after the original there (a live session's numbers are taken from its replayed live.script).
 */
export class PageTranslator {
  readonly acts: ActMoment[] = [];
  private readonly lead: number;
  private readonly crouch: number;
  private readonly buttons = new Map<Button, boolean>();
  private readonly halves = new Map<StickHalf, number>();
  private readonly axes = new Map<number, number>();
  private tri: { pressT: number; full: Mutable<ActMoment> | null } | null = null;

  constructor(opts: PageMapOptions = {}, readonly mode: 'script' | 'live' = 'script') {
    this.lead = (opts.leadFrames ?? DEFAULT_LEAD_FRAMES) * FRAME_MS;
    this.crouch = opts.crouchButton ?? CROUCH_BUTTON;
  }

  /** The page events for one script event, in the order they were made (a script's light lead reaches back). */
  push(e: ScriptEvent): PageEvent[] {
    const out: PageEvent[] = [];
    if (e.input === 'l3') throw new ScriptError(e.line, 'l3 is the page Crouch bind (the light Triangle); no script line may use it');
    if (e.input === 'triangle') {
      if (e.pressure > 0) {
        this.tri ??= { pressT: e.t, full: null };
        if (!this.tri.full && e.pressure >= FULL_TRIANGLE_AT) {
          this.tri.full = { kind: 'full', t: e.t, pressT: this.tri.pressT, releaseT: null, line: e.line };
          this.acts.push(this.tri.full);
          out.push({ t: e.t, kind: 'button', index: PRONE_BUTTON, pressed: true, value: 1, line: e.line });
        }
      } else if (this.tri) {
        if (this.tri.full) {
          this.tri.full.releaseT = e.t;
          out.push({ t: e.t, kind: 'button', index: PRONE_BUTTON, pressed: false, value: 0, line: e.line });
        } else {
          this.acts.push({ kind: 'light', t: e.t, pressT: this.tri.pressT, releaseT: e.t, line: e.line });
          const [down, up] = this.mode === 'live' ? [e.t, e.t + this.lead] : [Math.max(0, e.t - this.lead), e.t];
          out.push({ t: down, kind: 'button', index: this.crouch, pressed: true, value: 1, line: e.line });
          out.push({ t: up, kind: 'button', index: this.crouch, pressed: false, value: 0, line: e.line });
        }
        this.tri = null;
      }
      return out;
    }
    if (isStickHalf(e.input)) {
      this.halves.set(e.input, e.pressure);
      const [index] = STICK_AXIS[e.input];
      let value = 0;
      for (const [h, [i, sign]] of Object.entries(STICK_AXIS) as [StickHalf, readonly [number, -1 | 1]][]) {
        if (i === index) value += sign * (this.halves.get(h) ?? 0);
      }
      if ((this.axes.get(index) ?? 0) !== value) {
        this.axes.set(index, value);
        out.push({ t: e.t, kind: 'axis', index, value, line: e.line });
      }
      return out;
    }
    const pressed = e.pressure > 0;
    if ((this.buttons.get(e.input) ?? false) !== pressed) {
      this.buttons.set(e.input, pressed);
      out.push({ t: e.t, kind: 'button', index: GAMEPAD_BUTTON[e.input], pressed, value: pressed ? 1 : 0, line: e.line });
    }
    return out;
  }
}

function translate(events: readonly ScriptEvent[], opts: PageMapOptions): { events: PageEvent[]; acts: ActMoment[] } {
  const tr = new PageTranslator(opts, 'script');
  const out = events.flatMap((e) => tr.push(e));
  // A stable sort: a light Triangle's lead can reach back before events already written.
  out.sort((a, b) => a.t - b.t);
  return { events: out, acts: tr.acts };
}

/** The page's pad events for a script, in time order. */
export function pageEvents(events: readonly ScriptEvent[], opts: PageMapOptions = {}): PageEvent[] {
  return translate(events, opts).events;
}

/**
 * One write to the page's pad: every page event at one ms, applied in one `page.evaluate` (`__ephPadWrite`, ./pageSeed).
 * `events` holds each axis and button once, at its last value that ms; `lines` every script line the write carries
 * (a release folded into a press on its axis included), `line` the first of them.
 */
export interface PageWrite {
  readonly t: number;
  readonly line: number;
  readonly lines: readonly number[];
  readonly events: readonly PageEvent[];
}

/**
 * The page events grouped by ms, one write each (the hunt, agent-mail/evidence/eph-hunt-2026-11-01 REPORT D4 and M5:
 * a same-ms release and press on one axis went as two writes, 0 then +-1, each its own page.evaluate, and a walk tick
 * landed between them in 22 of 22 flips; a stick zero and a Square at one ms reached the page on different ticks).
 * The page now takes one ms's events as one change. The PCSX2 side's keys for one ms go as one batch too (./keys
 * KeyInjector.batch: back-to-back posts, or one xdotool call); that they land in one guest frame is not measured. The
 * same axis or button twice in one ms is written once, at its last value: one write is one pad state.
 */
export function pageWrites(events: readonly ScriptEvent[], opts: PageMapOptions = {}): PageWrite[] {
  return groupWrites(pageEvents(events, opts));
}

/** Page events (in time order) grouped into one write per ms. */
export function groupWrites(events: readonly PageEvent[]): PageWrite[] {
  const out: PageWrite[] = [];
  let i = 0;
  while (i < events.length) {
    const t = events[i]!.t;
    const lines: number[] = [];
    const last = new Map<string, PageEvent>();
    for (; i < events.length && events[i]!.t === t; i++) {
      const e = events[i]!;
      if (!lines.includes(e.line)) lines.push(e.line);
      const key = `${e.kind}${e.index}`;
      last.delete(key);   // re-inserted: the write applies in the order of each key's last event
      last.set(key, e);
    }
    out.push({ t, line: lines[0]!, lines, events: [...last.values()] });
  }
  return out;
}

/** Each Triangle press's act moment and kind: both sides are measured from it. */
export function actMoments(events: readonly ScriptEvent[]): ActMoment[] {
  return translate(events, {}).acts.map((a) => ({ ...a }));
}
