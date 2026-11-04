/**
 * The replay's clock (web sprint 35 PT-18; spec 4.8; research 244 §1). REPLAY_ADAPTATION: a browser adaptation with no
 * original -- SOCOM II plays no recording back -- so nothing here is a game value, and nothing here changes one (PT.R3).
 *
 * Pure: the wall clock is injected (`now`, milliseconds), never read here. The replay's tick runs at the recording's
 * own rate (the header's `tickHz`) times the speed, from where it was last set (a play, a pause, a speed, a seek, a
 * step), clamped to the recording's span. Paused, the tick does not move whatever the wall says -- so two frames drawn
 * while paused are the same frame (the plan's review focus 4).
 */

/** The speed's range, the spec's (4.8: "speed (0.25-4x)"). */
export const REPLAY_SPEED_MIN = 0.25;
export const REPLAY_SPEED_MAX = 4;
/**
 * The steps `[` and `]` walk (`faster`, `slower`): a chosen table with no source -- the spec names the range only,
 * not its steps; doubling from 0.25 to 4 is this port's choice (research 244, "Placeholders").
 */
export const REPLAY_SPEEDS_PLACEHOLDER: readonly number[] = [0.25, 0.5, 1, 2, 4];

export interface ReplayClockOptions {
  /** The recording's tick rate (its header's `tickHz`). */
  tickHz: number;
  /** The first and the last tick the recording holds. */
  start: number; end: number;
  /** The snapshots' ticks, ascending (`step` moves between them). */
  snaps: readonly number[];
  /** The wall clock, ms. */
  now: () => number;
}

export class ReplayClock {
  playing = false;
  rate = 1;
  /** The tick at `baseAt` (wall ms): every change of play, speed or place rebases here. */
  private base: number;
  private baseAt: number;
  /** The seeks and steps made, and the count `dtScale` last saw (F2: a jump is no elapsed time). */
  private jumps = 0;
  private jumpsSeen = 0;

  constructor(private readonly o: ReplayClockOptions) {
    this.base = o.start;
    this.baseAt = o.now();
  }

  get start(): number { return this.o.start; }
  get end(): number { return this.o.end; }

  /** The replay's tick at wall time `now`. */
  tick(now: number = this.o.now()): number {
    if (!this.playing) return this.base;
    const t = this.base + ((now - this.baseAt) / 1000) * this.o.tickHz * this.rate;
    return Math.max(this.o.start, Math.min(this.o.end, t));
  }

  /** Whether the tick stands at the recording's last. */
  atEnd(now: number = this.o.now()): boolean {
    return this.tick(now) >= this.o.end;
  }

  private rebase(tick: number): void {
    this.base = Math.max(this.o.start, Math.min(this.o.end, tick));
    this.baseAt = this.o.now();
  }

  play(): void {
    if (this.playing) return;
    this.rebase(this.base);
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.rebase(this.tick());
    this.playing = false;
  }

  toggle(): boolean {
    if (this.playing) this.pause(); else this.play();
    return this.playing;
  }

  /** The speed, 0.25-4x; anything else is refused (RangeError). */
  speed(rate: number): number {
    if (!(rate >= REPLAY_SPEED_MIN && rate <= REPLAY_SPEED_MAX)) throw new RangeError(`replay speed ${rate}: 0.25-4x only`);
    this.rebase(this.tick());
    this.rate = rate;
    return rate;
  }

  /** The next speed up the table (`REPLAY_SPEEDS_PLACEHOLDER`), the last kept at the top. */
  faster(): number {
    const next = REPLAY_SPEEDS_PLACEHOLDER.find((s) => s > this.rate);
    return this.speed(next ?? this.rate);
  }

  /** The next speed down the table, the first kept at the bottom. */
  slower(): number {
    const next = [...REPLAY_SPEEDS_PLACEHOLDER].reverse().find((s) => s < this.rate);
    return this.speed(next ?? this.rate);
  }

  /** The tick set (clamped to the recording), playing or paused as before; returns it. */
  seek(tick: number): number {
    this.rebase(tick);
    this.jumps++;
    return this.base;
  }

  /**
   * F2 (PT-19; research 244 §3): what the page's frame multiplies its wall-clock `dt` by for the bodies' animation --
   * the replay's elapsed time per wall second: the speed while playing; 0 paused, or at the recording's end (the tick
   * stands still there as it does paused); and 0 for the first reading after a seek or a step (the jump is no elapsed
   * time: no gait, flinch, death clip or fade runs across it). Read once a frame (`NetPage.frame`): the reading takes
   * the jump.
   */
  dtScale(now: number = this.o.now()): number {
    if (this.jumps !== this.jumpsSeen) { this.jumpsSeen = this.jumps; return 0; }
    return this.playing && this.tick(now) < this.o.end ? this.rate : 0;
  }

  /**
   * One snapshot on (`+1`: the first snapshot after the tick now) or back (`-1`: the last before it), paused there;
   * nothing past the first or the last. Returns the tick.
   */
  step(dir: 1 | -1): number {
    const t = this.tick();
    const s = this.o.snaps;
    let to = t;
    if (dir > 0) { const i = firstAfter(s, t); if (i < s.length) to = s[i]!; }
    else { const i = firstAtOrAfter(s, t) - 1; if (i >= 0) to = s[i]!; }
    this.playing = false;
    this.rebase(to);
    this.jumps++;
    return this.base;
  }
}

/** The index of the first of `sorted` greater than `t` (its length when none). */
export function firstAfter(sorted: readonly number[], t: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid]! > t) hi = mid; else lo = mid + 1; }
  return lo;
}

/** The index of the first of `sorted` not less than `t` (its length when none). */
export function firstAtOrAfter(sorted: readonly number[], t: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid]! >= t) hi = mid; else lo = mid + 1; }
  return lo;
}
