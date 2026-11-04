import { abortError, sleep } from './abort';
import type { ScriptEvent } from './script';

/**
 * The runner's timeline (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md, "Where it runs": an event at
 * 300 ms fires when the clock has advanced 300 ms -- PCSX2's guest clock over PINE, or the page's own game tick --
 * however long the host took). Product track (OT.R53): a validation instrument, an adaptation, never in a build and
 * never changing the game's behaviour.
 *
 * The clock is ms since the run's zero. Each event fires once the clock reads at least its time, in script order,
 * never ahead of an earlier one; the reading it fired at, and how late that was, are kept for the run record.
 */

/** What the timeline plays: a script event, a PCSX2 key action or a page pad event -- anything timed and lined. */
export interface Timed {
  readonly t: number;
  readonly line: number;
}

export interface Fired<E extends Timed = ScriptEvent> {
  readonly event: E;
  /** The clock reading the event fired at. */
  readonly at: number;
  /** at - event.t: how late the clock reading came (the poll's granularity, or a slow host on a guest clock). */
  readonly lateBy: number;
}

/** The pure part: given a clock reading, which events are due now. */
export class Timeline<E extends Timed = ScriptEvent> {
  private next = 0;
  private lastNow = -Infinity;

  constructor(private readonly events: readonly E[]) {
    for (let i = 1; i < events.length; i++) {
      if (events[i]!.t < events[i - 1]!.t) throw new Error(`EPH timeline: script line ${events[i]!.line} goes back in time`);
    }
  }

  get done(): boolean { return this.next >= this.events.length; }

  /** The next event still to fire, if any. */
  get upcoming(): E | undefined { return this.events[this.next]; }

  poll(now: number): Fired<E>[] {
    if (now < this.lastNow) throw new Error(`EPH timeline: the clock went back from ${this.lastNow} to ${now}`);
    this.lastNow = now;
    const out: Fired<E>[] = [];
    while (this.next < this.events.length && this.events[this.next]!.t <= now) {
      const event = this.events[this.next++]!;
      out.push({ event, at: now, lateBy: now - event.t });
    }
    return out;
  }
}

export interface RunTimelineOptions {
  /** Called between polls that found nothing due (a short sleep, or the next PINE sample); the default yields 1 ms. */
  readonly wait?: () => Promise<void>;
  /** Consecutive polls with nothing due before the run stops with an error; default unbounded. */
  readonly maxPolls?: number;
  /**
   * Wall ms the clock may read one value before the run stops with an error (a stalled clock: PCSX2 paused or gone,
   * the page frozen); default unbounded. Unlike maxPolls it never trips on a slow clock that still moves.
   */
  readonly stallMs?: number;
  /** The wall clock stallMs is counted on; default Date.now. */
  readonly wallNow?: () => number;
  /** The run's abort: the timeline stops at its next poll or wait, with the abort's error (./abort). */
  readonly signal?: AbortSignal;
}

/**
 * Plays `events` on `clock`: polls it, fires each due event in order (awaiting `fire` before the next), waits when
 * nothing is due, and returns every firing with its reading.
 */
export async function runTimeline<E extends Timed = ScriptEvent>(
  events: readonly E[],
  clock: () => number | Promise<number>,
  fire: (event: E, at: number) => void | Promise<void>,
  opts: RunTimelineOptions = {},
): Promise<Fired<E>[]> {
  const signal = opts.signal;
  const wait = opts.wait ?? (() => sleep(1, signal));
  const maxPolls = opts.maxPolls ?? Infinity;
  const stallMs = opts.stallMs ?? Infinity;
  const wallNow = opts.wallNow ?? Date.now;
  const tl = new Timeline<E>(events);
  const log: Fired<E>[] = [];
  let idle = 0;
  let stood: { value: number; since: number } | null = null;
  // A firing is bounded too (fold round 2, finding E): one that never settles -- a page.evaluate on a frozen page --
  // ends at the abort or after stallMs of wall time, waiting on `wait` meanwhile; its failure still passes on.
  const settle = async (r: void | Promise<void>, event: E): Promise<void> => {
    if (!r || typeof (r as Promise<void>).then !== 'function') return;
    const p = r as Promise<void>;
    let done = false;
    const marked = p.then(() => { done = true; }, () => { done = true; });
    const t0 = wallNow();
    while (!done) {
      if (signal?.aborted) throw abortError(signal);
      if (wallNow() - t0 >= stallMs) throw new Error(`EPH timeline: firing script line ${event.line} did not settle in ${stallMs} ms of wall time`);
      const w = wait();
      w.catch(() => undefined);
      await Promise.race([marked, w]);
    }
    await p;
  };
  while (!tl.done) {
    if (signal?.aborted) throw abortError(signal);
    const now = await clock();
    if (signal?.aborted) throw abortError(signal);
    if (!stood || stood.value !== now) stood = { value: now, since: wallNow() };
    const due = tl.poll(now);
    for (const f of due) {
      await settle(fire(f.event, f.at), f.event);
      log.push(f);
    }
    if (tl.done) break;
    if (due.length > 0) { idle = 0; continue; }
    if (++idle >= maxPolls) {
      const up = tl.upcoming!;
      throw new Error(`EPH timeline: the clock read ${now} after ${idle} polls with nothing due, short of the next event at ${up.t} (script line ${up.line})`);
    }
    if (wallNow() - stood.since >= stallMs) {
      const up = tl.upcoming!;
      throw new Error(`EPH timeline: the clock stood at ${now} for ${stallMs} ms of wall time, short of the next event at ${up.t} (script line ${up.line})`);
    }
    await wait();
  }
  return log;
}
