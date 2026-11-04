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

  constructor(size = FRAME_RING_ADAPTATION) { this.ring = new Float64Array(Math.max(1, Math.floor(size))); }

  /** One frame's interval, ms. A first frame (0), a clock that ran back, or no finite number is no interval. */
  push(ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return;
    if (this.skip) { this.skip = false; return; }
    this.ring[this.next] = ms;
    this.next = (this.next + 1) % this.ring.length;
    if (this.count < this.ring.length) this.count++;
  }

  /** The next interval is not counted: it spans a page that was hidden (no frame was drawn). */
  skipNext(): void { this.skip = true; }

  /** The ring's statistics; null while it holds none. */
  stats(): FrameStats | null {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.ring[i]!);
    return frameStats(out);
  }

  clear(): void { this.next = 0; this.count = 0; this.skip = false; }
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
