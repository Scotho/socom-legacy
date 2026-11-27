/**
 * CPS-5 (product track, **a browser adaptation with no original**): the page's frame sampler behind the player's
 * performance line (`./perfLine`). The 2026-11-02 playtest's "runnin slow" reports carried no numbers; this keeps the
 * last frame intervals the page drew and says what they were. It measures the page only: it sets no frame rate, draws
 * nothing and changes nothing the game does.
 *
 * - **The ring** (`FrameSampler`): the last `FRAME_RING_ADAPTATION` intervals (3600: about a minute at 60 Hz, 22 s at
 *   165 Hz -- the line says the span it covers), one `push(ms)` a frame, and `stats()` over them (`frameStats`, pure).
 * - **Long tasks** (`longTaskCounter`): a `PerformanceObserver` on `longtask` where the browser offers the entry type
 *   (Chromium's); null where it does not, so the line prints "?" rather than a zero it did not measure.
 * - **The page's one sampler** (`pageFrameSampler`, one per page as `./picture` `pagePicture`): fed at the frame tail of the
 *   front end's match (`./matchMount`) and the test room (`./main`), the line after `AdaptiveRatio.frame`, with the
 *   frame's real milliseconds (`./frameTime` `FrameTime.real`, unclamped) and the references the line reads (the
 *   renderer's backend, the canvas, the map's name, the room's rows). It keeps primitives and a weak reference to the
 *   canvas only, so a match that ended is not held in memory by it.
 * - **The match's own record** (`MatchFrameRecord`, LATER 883's first part): the whole match, not the ring's last
 *   minute -- each drawn frame's main-thread work time and the interval between drawn frames, in fixed histograms with
 *   like-for-like percentiles, the display's own interval (the most common raw frame interval), and the match's first,
 *   middle and last third by time. Not wired yet, and it sends nothing.
 */

/** The ring's size: about a minute of 60 Hz frames. A browser adaptation. */
export const FRAME_RING_ADAPTATION = 3600;
/** A frame longer than this many ms is counted as a hitch (two 60 Hz frames are 33.3 ms). A browser adaptation. */
export const FRAME_HITCH_MS_ADAPTATION = 33;
/** A frame longer than this many ms is counted as a stall. A browser adaptation. */
export const FRAME_STALL_MS_ADAPTATION = 100;
/** How many long-task start times are kept (the oldest let go first). A browser adaptation. */
export const LONG_TASK_RING_ADAPTATION = 1024;

/** What the ring says; the field names are the line's report keys. */
export interface FrameStats {
  frames: number;
  /** The intervals' sum: the time the ring covers. */
  span_ms: number;
  /** Frames over that time. */
  fps_mean: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
  /** The shortest interval (the display's refresh, `./perfLine` `refreshOf`). */
  min_ms: number;
  /** Intervals over `FRAME_HITCH_MS_ADAPTATION`. */
  over33: number;
  /** Intervals over `FRAME_STALL_MS_ADAPTATION`. */
  over100: number;
}

/** The nearest-rank percentile of sorted values (as `./playtestReport` `summary`'s p95). */
const rank = (sorted: readonly number[], p: number): number => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;

/** The statistics of a set of intervals (pure); null with none -- no frame rate, never a zero one. */
export function frameStats(intervals: readonly number[]): FrameStats | null {
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  let span = 0, over33 = 0, over100 = 0;
  for (const ms of sorted) {
    span += ms;
    if (ms > FRAME_HITCH_MS_ADAPTATION) over33++;
    if (ms > FRAME_STALL_MS_ADAPTATION) over100++;
  }
  return {
    frames: sorted.length, span_ms: span, fps_mean: (sorted.length * 1000) / span,
    p50_ms: rank(sorted, 0.5), p95_ms: rank(sorted, 0.95), p99_ms: rank(sorted, 0.99),
    max_ms: sorted[sorted.length - 1]!, min_ms: sorted[0]!, over33, over100,
  };
}

/** The last `size` frame intervals, in a fixed array (no allocation a frame). */
export class FrameSampler {
  private readonly ring: Float64Array;
  private next = 0;
  private count = 0;
  private skip = false;
  /** Every interval counted since the sampler was made (VS-8 review F3: a match marks it at its attach). */
  private total = 0;

  constructor(size = FRAME_RING_ADAPTATION) { this.ring = new Float64Array(Math.max(1, Math.floor(size))); }

  /** One frame's interval, ms. A first frame (0), a clock that ran back, or no finite number is no interval. */
  push(ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    if (this.skip) { this.skip = false; return; }
    this.ring[this.next] = ms;
    this.next = (this.next + 1) % this.ring.length;
    if (this.count < this.ring.length) this.count++;
    this.total++;
  }

  /** How many intervals were counted since the sampler was made: a mark for `statsSince`. */
  frames(): number { return this.total; }

  /**
   * VS-8 review F3: the statistics of the intervals counted since `mark` (a `frames()` read), capped by the ring -- a span
   * longer than the ring gives its last `size` intervals; null with none since, or a mark this sampler never reached.
   */
  statsSince(mark: number): FrameStats | null {
    const n = Math.min(this.total - mark, this.count);
    if (!(n > 0) || mark > this.total) return null;
    const out: number[] = [];
    for (let i = n; i >= 1; i--) out.push(this.ring[(this.next - i + this.ring.length) % this.ring.length]!);
    return frameStats(out);
  }

  /** The next interval is not counted: it spans a page that was hidden (no frame was drawn). */
  skipNext(): void { this.skip = true; }

  /** The ring's statistics; null while it holds none. */
  stats(): FrameStats | null {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.ring[i]!);
    return frameStats(out);
  }

  /** GLOW-STEPDOWN (`./glowScale`): the last `n` intervals pushed, oldest first (all held when fewer). Read at a flash's start. */
  recent(n: number): number[] {
    const k = Math.min(this.count, Math.max(0, Math.floor(n)));
    const out: number[] = [];
    for (let i = k; i >= 1; i--) out.push(this.ring[(this.next - i + this.ring.length) % this.ring.length]!);
    return out;
  }

  clear(): void { this.next = 0; this.count = 0; this.skip = false; this.total = 0; }
}

/** `MatchFrameRecord`'s fine work histogram: its bucket width, ms. A browser adaptation. */
export const MATCH_WORK_FINE_MS_ADAPTATION = 0.5;
/** The fine work histogram's top, ms: a frame's work at or over it falls in the overflow bucket, read as this. A browser adaptation. */
export const MATCH_WORK_FINE_MAX_MS_ADAPTATION = 64;
/** The report's work histogram's edges, ms: 8 buckets, the last 24 and over. A browser adaptation. */
export const MATCH_WORK_EDGES_MS_ADAPTATION: readonly number[] = [2, 4, 6, 8, 12, 16, 24];
/**
 * The report's drawn-interval histogram's edges, ms: the midpoints between multiples of a 60 Hz refresh (1, 2, 3, 4, 5
 * frames), then 100 and 250; 8 buckets, the last 250 and over. A browser adaptation.
 */
export const MATCH_INTERVAL_EDGES_MS_ADAPTATION: readonly number[] = [12.5, 25, 41.7, 58.3, 75, 100, 250];
/** `MatchFrameRecord`'s fine drawn-interval histogram: its bucket width, ms (the work's rule). A browser adaptation. */
export const MATCH_INTERVAL_FINE_MS_ADAPTATION = 0.5;
/** The fine drawn-interval histogram's top, ms: an interval at or over it falls in the overflow, read as this. A browser adaptation. */
export const MATCH_INTERVAL_FINE_MAX_MS_ADAPTATION = 128;
/** The display-interval histogram's bucket width, ms (buckets centred on its multiples). A browser adaptation. */
export const MATCH_REFRESH_STEP_MS_ADAPTATION = 0.1;
/** The display-interval histogram's floor, ms (250 Hz): a raw interval under it is not fed. A browser adaptation. */
export const MATCH_REFRESH_MIN_MS_ADAPTATION = 4;
/** The display-interval histogram's top, ms (20 Hz): a raw interval over it is not fed. A browser adaptation. */
export const MATCH_REFRESH_MAX_MS_ADAPTATION = 50;
/**
 * A raw interval over this many ms is a skip, never data (a hidden tab that did not call `skipNext`, or a wiring that
 * passed the time since the page loaded): as if `skipNext()` had been called before it. A browser adaptation.
 */
export const MATCH_INTERVAL_MAX_MS_ADAPTATION = 1000;
/** The length of one time bin behind the match's thirds, ms of counted interval. A browser adaptation. */
export const MATCH_BIN_MS_ADAPTATION = 2000;
/**
 * A drawn interval at or over this many ms is a long frame (over two and a half 60 Hz refreshes; the `intHist` edge): a
 * 30 fps cap is a whole number of refreshes -- 33.3 ms at 60 Hz, 34.7 at 144, 36.4 at 165, 40 at 75 -- and none is long.
 * A browser adaptation.
 */
export const MATCH_LONG_MS_ADAPTATION = 41.7;

/** One third of the match by time: `[frames, spanMs, long, meanWorkMs]` (`long`: drawn intervals of `MATCH_LONG_MS_ADAPTATION` and over). */
export type MatchThird = [number, number, number, number];

/** What `MatchFrameRecord` says of a match. */
export interface MatchFrameSummary {
  /** The drawn frames counted. */
  drawn: number;
  /** The work time's median and 95th percentile (nearest rank), ms: the fine bucket's upper edge; the overflow reads 64. */
  wp50: number;
  wp95: number;
  /**
   * The drawn interval's median and 95th percentile by the same rule (0.5 ms buckets, the upper edge; the overflow reads
   * 128): what `wp95` is held against -- a long interval with short work is the GPU side, with long work the main thread.
   * Null with no interval counted.
   */
  ip50: number | null;
  ip95: number | null;
  /** Counts by `MATCH_WORK_EDGES_MS_ADAPTATION` (8). */
  workHist: number[];
  /** Counts of drawn intervals by `MATCH_INTERVAL_EDGES_MS_ADAPTATION` (8). */
  intHist: number[];
  /**
   * The display's own interval, ms, to 0.1: the most common raw interval of every frame, drawn or not (a cap does not
   * read as the display, nor one short interval after a stall); ties to the shorter; null with none from 4 to 50 ms.
   */
  refreshMs: number | null;
  /** The first, middle and last third of the match by time (`MATCH_BIN_MS_ADAPTATION` bins, by their start). */
  thirds: [MatchThird, MatchThird, MatchThird];
}

const WORK_FINE = Math.round(MATCH_WORK_FINE_MAX_MS_ADAPTATION / MATCH_WORK_FINE_MS_ADAPTATION);
const INT_FINE = Math.round(MATCH_INTERVAL_FINE_MAX_MS_ADAPTATION / MATCH_INTERVAL_FINE_MS_ADAPTATION);
const RATE_BASE = Math.round(MATCH_REFRESH_MIN_MS_ADAPTATION / MATCH_REFRESH_STEP_MS_ADAPTATION);
const RATE_BUCKETS = Math.round(MATCH_REFRESH_MAX_MS_ADAPTATION / MATCH_REFRESH_STEP_MS_ADAPTATION) - RATE_BASE + 1;
/** A bin's fields in `MatchFrameRecord.bins`: its start (ms of counted interval), frames, span, long frames, work sum. */
const BIN_STRIDE = 5;
const tenth = (x: number): number => Math.round(x * 10) / 10;
/**
 * The nearest-rank percentile `p` of `count` values in a fine histogram of `buckets` buckets of `step` ms and an overflow:
 * the bucket's upper edge, ms; the overflow reads `max`.
 */
const fineRank = (hist: Float64Array, buckets: number, count: number, p: number, step: number, max: number): number => {
  const target = Math.max(1, Math.ceil(count * p));
  let seen = 0;
  for (let i = 0; i < buckets; i++) {
    seen += hist[i]!;
    if (seen >= target) return tenth((i + 1) * step);
  }
  return max;
};
/** The bucket of `v` under ascending `edges`: a value on an edge goes in the higher bucket. */
const bucketOf = (v: number, edges: readonly number[]): number => {
  let i = 0;
  while (i < edges.length && v >= edges[i]!) i++;
  return i;
};

/**
 * LATER 883 (product track, **a browser adaptation with no original**): one match's frame record, over the whole match.
 * One `frame()` an animation frame; fixed arrays only, but for the time bins, a plain array that grows by at most one bin
 * a call (one every `MATCH_BIN_MS_ADAPTATION` of counted interval, 1800 an hour; time with no drawn frame opens none) --
 * nothing is allocated a frame. Work counts drawn frames only, and an interval is the time between two drawn frames (the
 * undrawn frames' intervals carried into the next drawn one), so under a 30 fps cap on a 60 Hz display the drawn
 * intervals read 33.3 ms, not 16.7; the display's own interval is read from every frame's raw interval instead. A raw
 * interval over `MATCH_INTERVAL_MAX_MS_ADAPTATION` is a skip. It measures the page only.
 */
export class MatchFrameRecord {
  /** The fine work histogram: `WORK_FINE` buckets and the overflow. */
  private readonly fine = new Float64Array(WORK_FINE + 1);
  /** The fine drawn-interval histogram: `INT_FINE` buckets and the overflow. */
  private readonly intFine = new Float64Array(INT_FINE + 1);
  /** The raw intervals from 4 to 50 ms, in 0.1 ms buckets centred on the tenths. */
  private readonly rate = new Float64Array(RATE_BUCKETS);
  private readonly work = new Float64Array(MATCH_WORK_EDGES_MS_ADAPTATION.length + 1);
  private readonly ints = new Float64Array(MATCH_INTERVAL_EDGES_MS_ADAPTATION.length + 1);
  /** The time bins, `BIN_STRIDE` numbers each, in order of their start. */
  private readonly bins: number[] = [];
  private drawn = 0;
  /** The drawn intervals counted (a drawn frame with interval 0 has none). */
  private intervals = 0;
  /** The undrawn frames' intervals since the last drawn frame. */
  private pending = 0;
  /** The counted interval time: where the next frame falls among the bins. */
  private elapsed = 0;
  private skip = false;

  /**
   * One animation frame of the match: the time since the previous frame, the main-thread time its callback took, and
   * whether it was drawn (a frame cap skips draws). A non-finite or negative interval drops the frame; one over
   * `MATCH_INTERVAL_MAX_MS_ADAPTATION` is a skip (`skipNext`). A drawn frame with a non-finite or negative work time
   * counts no work, its interval carried to the next drawn frame. A drawn frame with no interval (the match's first, 0)
   * counts its work and no interval.
   */
  frame(intervalMs: number, workMs: number, drawn: boolean): void {
    if (!(Number.isFinite(intervalMs) && intervalMs >= 0)) return;
    if (intervalMs > MATCH_INTERVAL_MAX_MS_ADAPTATION) this.skip = true;
    if (this.skip) {
      this.pending = 0;
      if (drawn) this.skip = false;
      return;
    }
    if (intervalMs >= MATCH_REFRESH_MIN_MS_ADAPTATION && intervalMs <= MATCH_REFRESH_MAX_MS_ADAPTATION) {
      this.rate[Math.round(intervalMs / MATCH_REFRESH_STEP_MS_ADAPTATION) - RATE_BASE]!++;
    }
    this.pending += intervalMs;
    if (!drawn || !(Number.isFinite(workMs) && workMs >= 0)) return;
    const ms = this.pending;
    this.pending = 0;
    this.drawn++;
    this.fine[Math.min(WORK_FINE, Math.floor(workMs / MATCH_WORK_FINE_MS_ADAPTATION))]!++;
    this.work[bucketOf(workMs, MATCH_WORK_EDGES_MS_ADAPTATION)]!++;
    const start = Math.floor(this.elapsed / MATCH_BIN_MS_ADAPTATION) * MATCH_BIN_MS_ADAPTATION;
    let b = this.bins.length - BIN_STRIDE;
    if (b < 0 || this.bins[b] !== start) {
      this.bins.push(start, 0, 0, 0, 0);
      b = this.bins.length - BIN_STRIDE;
    }
    this.bins[b + 1]!++;
    this.bins[b + 4]! += workMs;
    if (ms > 0) {
      this.intervals++;
      this.ints[bucketOf(ms, MATCH_INTERVAL_EDGES_MS_ADAPTATION)]!++;
      this.intFine[Math.min(INT_FINE, Math.floor(ms / MATCH_INTERVAL_FINE_MS_ADAPTATION))]!++;
      this.elapsed += ms;
      this.bins[b + 2]! += ms;
      if (ms >= MATCH_LONG_MS_ADAPTATION) this.bins[b + 3]!++;
    }
  }

  /**
   * The next interval is not counted, nor its work (the page was hidden, or a hold ended): under a frame cap, every
   * frame up to and including the next drawn one, the undrawn time before it dropped. Called twice, it skips once.
   */
  skipNext(): void { this.skip = true; }

  /** How many time bins the record holds (tests: its one growing array). */
  binCount(): number { return this.bins.length / BIN_STRIDE; }

  /** The display's interval: the centre of the most populated raw-interval bucket, ties to the shorter; null with none. */
  private refreshMs(): number | null {
    let best = -1, most = 0;
    for (let i = 0; i < RATE_BUCKETS; i++) if (this.rate[i]! > most) { most = this.rate[i]!; best = i; }
    return best < 0 ? null : tenth((best + RATE_BASE) * MATCH_REFRESH_STEP_MS_ADAPTATION);
  }

  /**
   * The match's record; null while no drawn frame was counted. With T the counted interval time, third k takes the bins
   * whose start lies in [k T / 3, (k + 1) T / 3); with fewer than three bins all are the first third's, the later two
   * `[0, 0, 0, 0]`. Undrawn time not yet carried into a drawn frame is not counted.
   */
  summary(): MatchFrameSummary | null {
    if (!this.drawn) return null;
    // T to a microsecond: a float sum of 1000 / 60 must not move a bin that starts on a third's edge across it.
    const t = Math.round(this.elapsed * 1000) / 1000;
    const all = this.binCount() < 3 || !(t > 0);
    const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let at = 0; at < this.bins.length; at += BIN_STRIDE) {
      const s = this.bins[at]!;
      const k = all || s < t / 3 ? 0 : s < (2 * t) / 3 ? 1 : 2;
      for (let f = 0; f < 4; f++) acc[k * 4 + f]! += this.bins[at + 1 + f]!;
    }
    const third = (k: number): MatchThird => {
      const frames = acc[k * 4]!;
      return [frames, tenth(acc[k * 4 + 1]!), acc[k * 4 + 2]!, frames ? tenth(acc[k * 4 + 3]! / frames) : 0];
    };
    const ip = (p: number): number | null => (this.intervals
      ? fineRank(this.intFine, INT_FINE, this.intervals, p, MATCH_INTERVAL_FINE_MS_ADAPTATION, MATCH_INTERVAL_FINE_MAX_MS_ADAPTATION)
      : null);
    return {
      drawn: this.drawn,
      wp50: fineRank(this.fine, WORK_FINE, this.drawn, 0.5, MATCH_WORK_FINE_MS_ADAPTATION, MATCH_WORK_FINE_MAX_MS_ADAPTATION),
      wp95: fineRank(this.fine, WORK_FINE, this.drawn, 0.95, MATCH_WORK_FINE_MS_ADAPTATION, MATCH_WORK_FINE_MAX_MS_ADAPTATION),
      ip50: ip(0.5),
      ip95: ip(0.95),
      workHist: Array.from(this.work),
      intHist: Array.from(this.ints),
      refreshMs: this.refreshMs(),
      thirds: [third(0), third(1), third(2)],
    };
  }
}

/** The long tasks the browser reported, by start time (`performance.now()`'s clock). */
export interface LongTaskCounter { count(sinceMs: number): number; dispose(): void }

interface ObserverCtor {
  new (cb: (list: { getEntries(): { startTime: number }[] }) => void): { observe(o: unknown): void; disconnect(): void };
  supportedEntryTypes?: readonly string[];
}

/** A counter of `longtask` entries, or null where the window has no observer for them. */
export function longTaskCounter(win: typeof globalThis | undefined = globalThis): LongTaskCounter | null {
  const PO = (win as { PerformanceObserver?: ObserverCtor } | undefined)?.PerformanceObserver;
  if (!PO || !(PO.supportedEntryTypes ?? []).includes('longtask')) return null;
  const starts: number[] = [];
  let observer: { observe(o: unknown): void; disconnect(): void };
  try {
    observer = new PO((list) => {
      for (const e of list.getEntries()) {
        starts.push(e.startTime);
        if (starts.length > LONG_TASK_RING_ADAPTATION) starts.shift();
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch { return null; }
  return {
    count: (sinceMs) => { let n = 0; for (const t of starts) if (t >= sinceMs) n++; return n; },
    dispose: () => { observer.disconnect(); },
  };
}

/** Where the frames are drawn: a front-end match or the test room. */
export type FrameKind = 'match' | 'test room';

/** What the last frame named, as the line reads it. */
export interface FrameSource {
  kind: FrameKind;
  backend: string | null;
  map: string | null;
  /** The room's rows (`NetPage.rows`): its seats; null with no room (the test room offline). */
  seats: number | null;
  /** When the last frame was pushed (`performance.now()`). */
  at: number;
  /** The canvas, while it lives. */
  canvas(): HTMLCanvasElement | null;
}

export interface PageFrameSampler {
  readonly sampler: FrameSampler;
  /**
   * One frame at the page's frame tail: its real interval (ms) and what drew it. Primitives are kept, the canvas weakly;
   * nothing is allocated unless the canvas changed.
   */
  frame(
    ms: number, kind: FrameKind, renderer: { backend?: string } | null | undefined, canvas: HTMLCanvasElement | null | undefined,
    map: { name?: string } | null | undefined, net: { rows: readonly unknown[] } | null | undefined,
  ): void;
  /** The last frame's source; null before any frame. */
  source(): FrameSource | null;
  /** The long tasks since `sinceMs`; null where the browser does not report them. */
  longTasks(sinceMs: number): number | null;
}

let shared: PageFrameSampler | null = null;
let unhook: (() => void) | null = null;

/** The page's one sampler (made at the first call). */
export function pageFrameSampler(): PageFrameSampler {
  if (shared) return shared;
  const sampler = new FrameSampler();
  const tasks = longTaskCounter(globalThis);
  let kind: FrameKind | null = null, backend: string | null = null, map: string | null = null, seats: number | null = null, at = 0;
  let canvasRef: WeakRef<HTMLCanvasElement> | null = null;
  const doc = globalThis.document as Document | undefined;
  const onVisibility = (): void => { sampler.skipNext(); };
  doc?.addEventListener('visibilitychange', onVisibility);
  unhook = () => { doc?.removeEventListener('visibilitychange', onVisibility); tasks?.dispose(); };
  shared = {
    sampler,
    frame(ms, k, renderer, canvas, m, net) {
      sampler.push(ms);
      kind = k;
      backend = renderer?.backend ?? null;
      map = m?.name ?? null;
      seats = net ? net.rows.length : null;
      at = globalThis.performance?.now() ?? 0;
      if ((canvasRef?.deref() ?? null) !== (canvas ?? null)) canvasRef = canvas && typeof WeakRef === 'function' ? new WeakRef(canvas) : null;
    },
    source: () => (kind === null ? null : { kind, backend, map, seats, at, canvas: () => canvasRef?.deref() ?? null }),
    longTasks: (sinceMs) => (tasks ? tasks.count(sinceMs) : null),
  };
  return shared;
}

/** Tests only: the page's sampler forgotten, its listeners taken off. */
export function resetPageFrameSamplerForTest(): void { unhook?.(); unhook = null; shared = null; }
