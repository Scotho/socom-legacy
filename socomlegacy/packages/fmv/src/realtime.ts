/**
 * PLAT-19c, the movies in real time and their budget (web research 120 §11): the worker's stream as PLAT-21's picture
 * source, and the meter that counts, per movie, what real time cost.
 *
 * - **The pace is the game's frame** (research 121 R121.9): the player asks for one picture a tick of the caller's clock
 *   (PLAT-12's `UiClock` at 29.97 Hz), never by PTS. `MovieWorkerSource.next` is `MovieStream.tick`: the picture that
 *   has arrived, `MOVIE_PENDING` when none has, the end.
 * - **A host that cannot keep up** does what the original does when its decoder is slow: the original's tick retries
 *   `sceMpegGetPicture` until it has a picture (`FUN_0030b1d0`, D:L208692-208699), so the frame stalls and the movie
 *   slows; no picture is dropped or repeated, and the PTS are not consulted to catch up (the TIMESTAMP callback's flag
 *   `DAT_00451db0` is read by nothing, D:L208419). A page cannot stall its frame, so a tick with no picture presents
 *   nothing and moves nothing (`MOVIE_PICTURE_LATE_READING`, `player.ts`): the movie slows by that tick, every picture
 *   is still shown once and in order. The meter counts such a tick as late.
 * - **The budget** (`MovieBudget`): start-up (the open to the first picture handed out, and the ticks that waited for
 *   it), the pictures, the late ticks after the first picture, pictures dropped (a gap in the display indices, or fewer
 *   handed out than the decoder showed) or repeated, the decoder's cost per picture in the worker (`decodeMs`,
 *   `readMs`), the worker's decoded queue at each answer, and the presented rate. **Sustained** = no late tick, no
 *   picture dropped or repeated: the block's "29.97/30 fps sustained with 0 dropped pictures".
 *
 * Pure (W6.R2, W9.R10): the clock is a parameter (`now`, ms), the stream a `MovieStreamHandle` (the page's
 * `MovieClient.open(...)`); no browser global.
 */
import type { MovieEndMessage, MovieFrame } from './decodeProtocol';
import { MOVIE_END, MOVIE_PENDING, type MovieNext, type MovieOpenOptions, type MoviePictureSource } from './player';

// ---------------------------------------------------------------------------------------------------------------------
// The budget.

/** What the meter reads off a picture: its display index and, from a worker with a clock, its cost and the queue. */
export interface BudgetPicture { index: number; decodeMs?: number; readMs?: number; queued?: number }

/** A distribution in milliseconds: count, mean, median, 95th percentile (nearest rank), maximum. */
export interface BudgetStats { n: number; mean: number; p50: number; p95: number; max: number }

export interface MovieBudgetReport {
  movie: string;
  /** The open to the first picture handed out, ms; null when none came. */
  startupMs: number | null;
  /** The ticks that found no picture before the first: the start-up's, not late. */
  startupTicks: number;
  /** Pictures handed out. */
  pictures: number;
  /** Every tick that asked: start-up, pictures, late ones, the end's. */
  ticks: number;
  /** Ticks after the first picture that found none (the movie slowed by one tick each). */
  lateTicks: number;
  /** Display indices skipped, plus the decoder's pictures never handed out (its end's count past the last index). */
  dropped: number;
  /** Pictures whose index was not above the one before. */
  repeated: number;
  /** The decoder's time per picture in the worker; null when the frames carried none. */
  decodeMs: BudgetStats | null;
  /** The worker's waits on the disc per picture; null when none carried. */
  readMs: BudgetStats | null;
  /** The worker's decoded queue at each answer. */
  queue: { min: number; max: number; mean: number } | null;
  /** The time between two pictures handed out, ms. */
  intervalMs: BudgetStats | null;
  /** Pictures a second from the first to the last handed out. */
  presentedFps: number | null;
  /** The end as the worker reported it, null before it. */
  end: { pictures: number; error: string | null } | null;
  /** No late tick, no picture dropped or repeated. */
  sustained: boolean;
}

/** `xs`' distribution (nearest-rank percentiles), null when empty. */
export function budgetStats(xs: readonly number[]): BudgetStats | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const rank = (p: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: rank(0.5), p95: rank(0.95), max: s[s.length - 1]! };
}

/** One movie's meter: fed by the source at each open, tick and end, on the source's clock. */
export class MovieBudget {
  private openedAt: number | null = null;
  private firstAt: number | null = null;
  private lastAt: number | null = null;
  private lastIndex = -1;
  private pictures = 0;
  private ticks = 0;
  private startupTicks = 0;
  private lateTicks = 0;
  private dropped = 0;
  private repeated = 0;
  private readonly decode: number[] = [];
  private readonly read: number[] = [];
  private readonly queue: number[] = [];
  private readonly intervals: number[] = [];
  private ended: { pictures: number; error: string | null } | null = null;

  constructor(readonly movie: string) {}

  open(at: number): void { this.openedAt = at; }

  /** A tick that found no picture. */
  late(_at: number): void {
    this.ticks++;
    if (this.pictures === 0) this.startupTicks++;
    else this.lateTicks++;
  }

  /** A tick that handed out `p`. */
  picture(p: BudgetPicture, at: number): void {
    this.ticks++;
    if (p.index <= this.lastIndex) this.repeated++;
    else this.dropped += p.index - this.lastIndex - 1;
    this.lastIndex = Math.max(this.lastIndex, p.index);
    if (this.firstAt === null) this.firstAt = at;
    if (this.lastAt !== null) this.intervals.push(at - this.lastAt);
    this.lastAt = at;
    this.pictures++;
    if (p.decodeMs !== undefined) this.decode.push(p.decodeMs);
    if (p.readMs !== undefined) this.read.push(p.readMs);
    if (p.queued !== undefined) this.queue.push(p.queued);
  }

  /** The tick that found the end. */
  end(e: MovieEndMessage, _at: number): void {
    this.ticks++;
    this.ended = { pictures: e.pictures, error: e.error };
    if (e.pictures > this.lastIndex + 1) this.dropped += e.pictures - this.lastIndex - 1;
  }

  report(): MovieBudgetReport {
    const q = this.queue;
    return {
      movie: this.movie,
      startupMs: this.firstAt !== null && this.openedAt !== null ? this.firstAt - this.openedAt : null,
      startupTicks: this.startupTicks,
      pictures: this.pictures,
      ticks: this.ticks,
      lateTicks: this.lateTicks,
      dropped: this.dropped,
      repeated: this.repeated,
      decodeMs: budgetStats(this.decode),
      readMs: budgetStats(this.read),
      queue: q.length ? { min: Math.min(...q), max: Math.max(...q), mean: q.reduce((a, b) => a + b, 0) / q.length } : null,
      intervalMs: budgetStats(this.intervals),
      presentedFps: this.pictures > 1 && this.firstAt !== null && this.lastAt !== null && this.lastAt > this.firstAt
        ? (this.pictures - 1) / ((this.lastAt - this.firstAt) / 1000) : null,
      end: this.ended,
      sustained: this.lateTicks === 0 && this.dropped === 0 && this.repeated === 0,
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The worker's stream as the player's source.

/** What the source needs of an open movie: `MovieStream`'s per-tick hand-off, its buffer return and its close. */
export interface MovieStreamHandle {
  tick(): MovieFrame | MovieEndMessage | null;
  release(buffer: ArrayBuffer): void;
  close(): void;
}

export interface MovieWorkerSourceOptions {
  /** Open the movie on the worker (the viewer's `client.open(path, disc, wasm)`), superseding the one before. */
  open(name: string, options: MovieOpenOptions): MovieStreamHandle;
  /**
   * Whether the file is on the disc: the original's open fails at once when it is not (`FUN_003098e0` through
   * `FUN_0030bb60`, D:L207783-207818, D:L208973-209032), and the dialog build fires event 3 then (research 121 R121.4).
   * Absent, every name opens, and a missing one ends on its first answer instead.
   */
  exists?(name: string): boolean;
  /** The budget's clock, ms. Absent, no budget is kept. */
  now?: () => number;
}

/**
 * PLAT-21's picture source over PLAT-19b's worker (research 121 §15's interface): `open` starts the worker's stream
 * (the console's open decodes no picture either, research 121 §7), `next` is the per-tick hand-off, `restart` a fresh
 * open of the same file (research 121 §5: the clean seek; research 120 §3), `close` lets the stream go.
 *
 * A picture's buffer goes back to the worker once the next picture is handed out: the sink (`MovieTexture.present`,
 * PLAT-14's layer) holds one picture at a time and has replaced the older one by then.
 */
export class MovieWorkerSource implements MoviePictureSource<MovieFrame> {
  /** One meter per open, in order (with a clock). */
  readonly budgets: MovieBudget[] = [];
  /** The open movie's meter, or null. */
  budget: MovieBudget | null = null;
  /** The last end the worker reported (its counts and error), or null. */
  lastEnd: MovieEndMessage | null = null;
  private stream: MovieStreamHandle | null = null;
  private shown: MovieFrame | null = null;
  private name: string | null = null;
  private options: MovieOpenOptions = { audioStream: 0 };

  constructor(private readonly o: MovieWorkerSourceOptions) {}

  open(name: string, options: MovieOpenOptions): boolean {
    this.close();
    if (this.o.exists && !this.o.exists(name)) return false;
    this.name = name;
    this.options = options;
    this.start();
    return true;
  }

  next(): MovieNext<MovieFrame> {
    const s = this.stream;
    if (!s) return MOVIE_END;
    const r = s.tick();
    const at = this.o.now?.() ?? 0;
    if (r === null) { this.budget?.late(at); return MOVIE_PENDING; }
    if (r.kind === 'end') { this.lastEnd = r; this.budget?.end(r, at); return MOVIE_END; }
    if (this.shown && this.shown.rgba !== r.rgba) s.release(this.shown.rgba);
    this.shown = r;
    this.budget?.picture(r, at);
    return r;
  }

  restart(): void {
    if (this.name === null) return;
    this.stream?.close();
    this.start();
  }

  close(): void {
    this.stream?.close();
    this.stream = null;
    this.shown = null;
    this.budget = null;
  }

  private start(): void {
    this.shown = null;
    this.lastEnd = null;
    if (this.o.now) {
      this.budget = new MovieBudget(this.name!);
      this.budgets.push(this.budget);
      this.budget.open(this.o.now());
    }
    this.stream = this.o.open(this.name!, this.options);
  }
}
