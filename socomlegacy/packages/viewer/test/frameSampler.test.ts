// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { FRAME_RING_ADAPTATION, FrameSampler, frameStats, longTaskCounter, pageFrameSampler, resetPageFrameSamplerForTest } from '../src/frameSampler';

/**
 * CPS-5 (product track, a browser adaptation with no original): the page's frame sampler behind the player's performance
 * line -- a ring of the last frame intervals and its statistics, and a long-task count where the browser offers one.
 * It measures the page; it changes nothing the game does.
 */

describe('frameStats: the statistics of a fixed set of intervals', () => {
  it('ten intervals, 10 to 100 ms: frames, the span, the mean rate, nearest-rank percentiles, the max and the counts', () => {
    const s = frameStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])!;
    expect(s.frames).toBe(10);
    expect(s.span_ms).toBe(550);
    expect(s.fps_mean).toBeCloseTo(10_000 / 550, 9);
    expect([s.p50_ms, s.p95_ms, s.p99_ms, s.max_ms, s.min_ms]).toEqual([50, 100, 100, 100, 10]);
    expect([s.over33, s.over100]).toEqual([7, 0]);
  });

  it('a steady 60 Hz minute with hitches: a 33.4 ms frame counts over 33, a 120 ms one over both', () => {
    const xs = [...Array.from({ length: 196 }, () => 16.7), 33.4, 33.4, 120, 16.6];
    const s = frameStats(xs)!;
    expect(s.frames).toBe(200);
    expect(s.p50_ms).toBe(16.7);
    expect(s.p95_ms).toBe(16.7);
    expect(s.p99_ms).toBe(33.4);
    expect(s.max_ms).toBe(120);
    expect(s.min_ms).toBe(16.6);
    expect([s.over33, s.over100]).toEqual([3, 1]);
  });

  it('no intervals: null -- no frame rate, never a zero one', () => {
    expect(frameStats([])).toBeNull();
  });
});

describe('FrameSampler: the ring', () => {
  it('holds the last N (3600 by default, about a minute at 60 Hz), the oldest let go first', () => {
    expect(FRAME_RING_ADAPTATION).toBe(3600);
    const r = new FrameSampler(4);
    for (const ms of [100, 1, 2, 3, 4]) r.push(ms);
    expect(r.stats()).toMatchObject({ frames: 4, max_ms: 4, min_ms: 1, span_ms: 10 });
  });

  it('a first frame (0), a clock that ran back, NaN or Infinity is no interval', () => {
    const r = new FrameSampler();
    for (const ms of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) r.push(ms);
    expect(r.stats()).toBeNull();
    r.push(16);
    expect(r.stats()).toMatchObject({ frames: 1, p50_ms: 16 });
  });

  it('skipNext drops the one interval that spans a hidden page; the next counts again', () => {
    const r = new FrameSampler();
    r.push(16);
    r.skipNext();
    r.push(9000);
    r.push(17);
    expect(r.stats()).toMatchObject({ frames: 2, max_ms: 17 });
  });

  it('clear empties it', () => {
    const r = new FrameSampler();
    r.push(16);
    r.clear();
    expect(r.stats()).toBeNull();
  });
});

describe('longTaskCounter: the browser\'s long tasks, where it reports them', () => {
  type Cb = (list: { getEntries(): { startTime: number }[] }) => void;
  const fakeWin = (supported: readonly string[]) => {
    const made: { cb: Cb; opts: unknown }[] = [];
    class PO {
      static supportedEntryTypes = supported;
      constructor(public cb: Cb) { made.push({ cb, opts: null }); }
      observe(opts: unknown): void { made[made.length - 1]!.opts = opts; }
      disconnect(): void {}
    }
    return { win: { PerformanceObserver: PO } as unknown as typeof globalThis, made };
  };

  it('null where the browser has no PerformanceObserver or no longtask entry type', () => {
    expect(longTaskCounter({} as typeof globalThis)).toBeNull();
    expect(longTaskCounter(fakeWin(['paint']).win)).toBeNull();
  });

  it('counts the long tasks that started at or after a time', () => {
    const { win, made } = fakeWin(['longtask', 'paint']);
    const c = longTaskCounter(win)!;
    expect(made[0]!.opts).toEqual({ type: 'longtask', buffered: true });
    made[0]!.cb({ getEntries: () => [{ startTime: 100 }, { startTime: 2000 }, { startTime: 5000 }] });
    expect(c.count(0)).toBe(3);
    expect(c.count(2000)).toBe(2);
    expect(c.count(6000)).toBe(0);
  });
});

describe('pageFrameSampler: the page\'s one sampler, fed at the frame tail', () => {
  afterEach(() => { resetPageFrameSamplerForTest(); });

  it('is one per page', () => {
    expect(pageFrameSampler()).toBe(pageFrameSampler());
  });

  it('frame() pushes the interval and keeps what the line names: the backend, the canvas, the map, the seats', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1707;
    canvas.height = 1067;
    const f = pageFrameSampler();
    f.frame(16.5, 'match', { backend: 'webgpu' }, canvas, { name: 'Crossroads' }, { rows: [1, 2, 3] });
    f.frame(17.5, 'match', { backend: 'webgpu' }, canvas, { name: 'Crossroads' }, { rows: [1, 2, 3] });
    expect(f.sampler.stats()).toMatchObject({ frames: 2, max_ms: 17.5 });
    const s = f.source()!;
    expect(s).toMatchObject({ kind: 'match', backend: 'webgpu', map: 'Crossroads', seats: 3 });
    expect(s.canvas()).toBe(canvas);
    expect(typeof s.at).toBe('number');
  });

  it('before any frame there is no source; a test room offline has no seats', () => {
    const f = pageFrameSampler();
    expect(f.source()).toBeNull();
    f.frame(16, 'test room', null, null, null, null);
    expect(f.source()).toMatchObject({ kind: 'test room', backend: null, map: null, seats: null });
    expect(f.source()!.canvas()).toBeNull();
  });

  it('the page coming back into view drops the interval that spans its hidden time', () => {
    const f = pageFrameSampler();
    f.frame(16, 'match', null, null, null, null);
    document.dispatchEvent(new Event('visibilitychange'));
    f.frame(30_000, 'match', null, null, null, null);
    f.frame(16, 'match', null, null, null, null);
    expect(f.sampler.stats()).toMatchObject({ frames: 2, max_ms: 16 });
  });
});
