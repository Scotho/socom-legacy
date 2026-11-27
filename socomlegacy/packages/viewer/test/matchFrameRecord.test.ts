import { describe, expect, it } from 'vitest';
import {
  MATCH_BIN_MS_ADAPTATION, MATCH_INTERVAL_EDGES_MS_ADAPTATION, MATCH_INTERVAL_FINE_MAX_MS_ADAPTATION,
  MATCH_INTERVAL_FINE_MS_ADAPTATION, MATCH_INTERVAL_MAX_MS_ADAPTATION, MATCH_LONG_MS_ADAPTATION,
  MATCH_REFRESH_MAX_MS_ADAPTATION, MATCH_REFRESH_MIN_MS_ADAPTATION, MATCH_REFRESH_STEP_MS_ADAPTATION,
  MATCH_WORK_EDGES_MS_ADAPTATION, MATCH_WORK_FINE_MAX_MS_ADAPTATION, MATCH_WORK_FINE_MS_ADAPTATION, MatchFrameRecord,
} from '../src/frameSampler';

/**
 * LATER 883, its first part (product track, a browser adaptation with no original -- the console had no frame
 * telemetry): the match's own frame record. Over the whole match it keeps the main-thread work time of each drawn frame
 * and the interval between drawn frames, in fixed histograms, the display's own interval, and the match's first, middle
 * and last third by time. It is not wired yet and sends nothing; it changes nothing the game does.
 */

const ZERO = [0, 0, 0, 0];

/** `n` drawn frames of `ms` interval and `w` work. */
const run = (r: MatchFrameRecord, n: number, ms: number, w: number) => { for (let i = 0; i < n; i++) r.frame(ms, w, true); };

/** `n` drawn frames under a cap: each drawn frame after `every - 1` undrawn ones, all `raw` ms apart. */
const capped = (r: MatchFrameRecord, n: number, raw: number, every: number, w = 3) => {
  for (let i = 0; i < n; i++) {
    for (let j = 1; j < every; j++) r.frame(raw, 1, false);
    r.frame(raw, w, true);
  }
};

describe('MatchFrameRecord: the constants', () => {
  it('the edges, the fine steps, the refresh range, the absurd interval, the bin length and the long frame', () => {
    expect([...MATCH_WORK_EDGES_MS_ADAPTATION]).toEqual([2, 4, 6, 8, 12, 16, 24]);
    expect([...MATCH_INTERVAL_EDGES_MS_ADAPTATION]).toEqual([12.5, 25, 41.7, 58.3, 75, 100, 250]);
    expect(MATCH_WORK_FINE_MS_ADAPTATION).toBe(0.5);
    expect(MATCH_WORK_FINE_MAX_MS_ADAPTATION).toBe(64);
    expect(MATCH_INTERVAL_FINE_MS_ADAPTATION).toBe(0.5);
    expect(MATCH_INTERVAL_FINE_MAX_MS_ADAPTATION).toBe(128);
    expect([MATCH_REFRESH_STEP_MS_ADAPTATION, MATCH_REFRESH_MIN_MS_ADAPTATION, MATCH_REFRESH_MAX_MS_ADAPTATION]).toEqual([0.1, 4, 50]);
    expect(MATCH_INTERVAL_MAX_MS_ADAPTATION).toBe(1000);
    expect(MATCH_BIN_MS_ADAPTATION).toBe(2000);
    expect(MATCH_LONG_MS_ADAPTATION).toBe(41.7);
  });
});

describe('MatchFrameRecord: what it counts', () => {
  it('nothing counted: null -- and an undrawn frame alone is nothing counted', () => {
    const r = new MatchFrameRecord();
    expect(r.summary()).toBeNull();
    r.frame(16.7, 3, false);
    expect(r.summary()).toBeNull();
  });

  it('a non-finite or negative interval drops the frame whole', () => {
    const r = new MatchFrameRecord();
    for (const x of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      r.frame(x, 2, true);
      r.frame(x, 2, false); // adds nothing to the next drawn interval
    }
    expect(r.summary()).toBeNull();
    r.frame(16, 2, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(1);
    expect(s.intHist).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(s.thirds[0]).toEqual([1, 16, 0, 2]);
  });

  it('a drawn frame with an invalid work time keeps its interval: carried to the next drawn frame, its work not counted', () => {
    const r = new MatchFrameRecord();
    r.frame(16, Number.NaN, true);
    r.frame(16, 2, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(1);
    expect(s.intHist).toEqual([0, 0, 1, 0, 0, 0, 0, 0]); // 32 ms
    expect(s.thirds[0]).toEqual([1, 32, 0, 2]);
    expect(s.workHist).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    for (const x of [Number.POSITIVE_INFINITY, -1]) {
      const q = new MatchFrameRecord();
      q.frame(16, x, true);
      q.frame(16, 2, true);
      expect(q.summary()!.thirds[0]).toEqual([1, 32, 0, 2]);
    }
  });

  it('a first frame (interval 0) counts its work but no interval: refreshMs and the interval percentiles are null', () => {
    const r = new MatchFrameRecord();
    r.frame(0, 3, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(1);
    expect(s.wp50).toBe(3.5);
    expect(s.workHist).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(s.intHist).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.refreshMs).toBeNull();
    expect([s.ip50, s.ip95]).toEqual([null, null]);
  });

  it('a mid-match frame(0, w, true) counts its work and adds no interval', () => {
    const r = new MatchFrameRecord();
    r.frame(16, 2, true);
    r.frame(0, 4, true);
    r.frame(16, 2, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(3);
    expect(s.intHist).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    expect(s.workHist).toEqual([0, 2, 1, 0, 0, 0, 0, 0]);
    expect(s.thirds[0]).toEqual([3, 32, 0, 2.7]);
  });

  it('undrawn time left over at summary() is not counted', () => {
    const r = new MatchFrameRecord();
    r.frame(16, 2, true);
    r.frame(16, 1, false);
    const s = r.summary()!;
    expect(s.drawn).toBe(1);
    expect(s.intHist).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(s.thirds[0]).toEqual([1, 16, 0, 2]);
  });
});

describe('MatchFrameRecord: a value exactly on an edge goes in the higher bucket', () => {
  it('the work histogram: each edge, and just under the first', () => {
    const r = new MatchFrameRecord();
    for (const w of [1.99, 2, 4, 6, 8, 12, 16, 24]) r.frame(16, w, true);
    expect(r.summary()!.workHist).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    r.frame(16, 0, true);
    r.frame(16, 500, true);
    expect(r.summary()!.workHist).toEqual([2, 1, 1, 1, 1, 1, 1, 2]);
  });

  it('the interval histogram: each edge, and just under the first', () => {
    const r = new MatchFrameRecord();
    for (const ms of [12.4, 12.5, 25, 41.7, 58.3, 75, 100, 250]) r.frame(ms, 1, true);
    expect(r.summary()!.intHist).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('the fine work histogram: the percentile is the bucket\'s upper edge; 64 and over report 64', () => {
    const at = (w: number) => { const r = new MatchFrameRecord(); r.frame(16, w, true); return r.summary()!.wp50; };
    expect(at(0)).toBe(0.5);
    expect(at(0.49)).toBe(0.5);
    expect(at(0.5)).toBe(1);
    expect(at(5)).toBe(5.5);
    expect(at(63.9)).toBe(64);
    expect(at(64)).toBe(64);
    expect(at(1000)).toBe(64);
  });

  it('the fine interval histogram: the bucket\'s upper edge; 128 and over report 128', () => {
    const at = (ms: number) => { const r = new MatchFrameRecord(); r.frame(ms, 1, true); return r.summary()!.ip50; };
    expect(at(0.1)).toBe(0.5);
    expect(at(16)).toBe(16.5);
    expect(at(127.9)).toBe(128);
    expect(at(128)).toBe(128);
    expect(at(900)).toBe(128);
  });
});

describe('MatchFrameRecord: long frames, at or over 41.7 ms', () => {
  it('exactly 41.7 counts, 41.6 does not, 50 does', () => {
    const r = new MatchFrameRecord();
    for (const ms of [33.4, 41.6, 41.7, 50]) r.frame(ms, 1, true);
    expect(r.summary()!.thirds[0][2]).toBe(2);
  });

  it('a 30 fps cap counts none at 60, 75, 144 or 165 Hz (2, 3, 5, 6 refreshes a drawn frame)', () => {
    for (const [hz, every] of [[60, 2], [75, 3], [144, 5], [165, 6]] as const) {
      const r = new MatchFrameRecord();
      capped(r, 30, 1000 / hz, every);
      const s = r.summary()!;
      expect(s.drawn).toBe(30);
      expect(s.thirds[0][2]).toBe(0);
      expect(s.intHist).toEqual([0, 0, 30, 0, 0, 0, 0, 0]);
    }
  });
});

describe('MatchFrameRecord: the percentiles (nearest rank)', () => {
  it('95 frames of 5 ms work and 5 of 30 ms: p50 and p95 both 5.5 (the 95th is the last 5 ms one)', () => {
    const r = new MatchFrameRecord();
    for (let i = 0; i < 95; i++) r.frame(16.7, 5, true);
    for (let i = 0; i < 5; i++) r.frame(16.7, 30, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(100);
    expect([s.wp50, s.wp95]).toEqual([5.5, 5.5]);
    expect(s.workHist).toEqual([0, 0, 95, 0, 0, 0, 0, 5]);
  });

  it('94 frames of 5 ms work and 6 of 30 ms: p50 5.5, p95 30.5', () => {
    const r = new MatchFrameRecord();
    for (let i = 0; i < 6; i++) r.frame(16.7, 30, true); // order does not matter: a histogram
    for (let i = 0; i < 94; i++) r.frame(16.7, 5, true);
    const s = r.summary()!;
    expect([s.wp50, s.wp95]).toEqual([5.5, 30.5]);
  });

  it('the rank is ceil, not round: 11 frames, the 95th percentile is the 11th (10.45 rounds to 10)', () => {
    const r = new MatchFrameRecord();
    for (let i = 0; i < 10; i++) r.frame(16, 1, true);
    r.frame(60, 20, true);
    const s = r.summary()!;
    expect(s.wp95).toBe(20.5);
    expect(s.ip95).toBe(60.5);
  });

  it('the intervals: 90 of 16 ms and 10 of 50 ms read ip50 16.5 and ip95 50.5', () => {
    const r = new MatchFrameRecord();
    run(r, 90, 16, 2);
    run(r, 10, 50, 2);
    const s = r.summary()!;
    expect([s.ip50, s.ip95]).toEqual([16.5, 50.5]);
  });

  it('the comparison the field will make: a 30 ms interval with 8 ms of work (the GPU side) against 29 ms of work (the main thread)', () => {
    const gpu = new MatchFrameRecord();
    run(gpu, 100, 30, 8);
    const g = gpu.summary()!;
    expect([g.ip95, g.wp95]).toEqual([30.5, 8.5]);
    const main = new MatchFrameRecord();
    run(main, 100, 30, 29);
    const m = main.summary()!;
    expect([m.ip95, m.wp95]).toEqual([30.5, 29.5]);
  });
});

describe('MatchFrameRecord: refreshMs, the display\'s own interval', () => {
  it('600 frames at 16.7 ms with one 2 ms and three 33.4 ms intervals read 16.7 -- not the minimum', () => {
    const r = new MatchFrameRecord();
    run(r, 300, 16.7, 2);
    r.frame(2, 2, true);
    run(r, 3, 33.4, 2);
    run(r, 300, 16.7, 2);
    expect(r.summary()!.refreshMs).toBe(16.7);
  });

  it('a 30 fps cap on a 60 Hz display reads 16.7, not 33.4: every raw interval counts, drawn or not', () => {
    const r = new MatchFrameRecord();
    capped(r, 10, 16.7, 2);
    const s = r.summary()!;
    expect(s.refreshMs).toBe(16.7);
    expect(s.intHist).toEqual([0, 0, 10, 0, 0, 0, 0, 0]);
    expect(s.workHist).toEqual([0, 10, 0, 0, 0, 0, 0, 0]);
    expect([s.wp50, s.wp95]).toEqual([3.5, 3.5]);
    expect(s.thirds[0][0]).toBe(10);
    expect(s.thirds[0][3]).toBe(3);
  });

  it('a 144 Hz display reads 6.9; 75 Hz 13.3; 165 Hz 6.1', () => {
    for (const [hz, want] of [[144, 6.9], [75, 13.3], [165, 6.1]] as const) {
      const r = new MatchFrameRecord();
      run(r, 100, 1000 / hz, 2);
      expect(r.summary()!.refreshMs).toBe(want);
    }
  });

  it('a tie goes to the shorter interval', () => {
    const r = new MatchFrameRecord();
    for (const ms of [20, 10, 20, 10]) r.frame(ms, 1, true);
    expect(r.summary()!.refreshMs).toBe(10);
  });

  it('nothing between 4 and 50 ms: null', () => {
    const r = new MatchFrameRecord();
    run(r, 10, 60, 2);
    run(r, 10, 3, 2);
    expect(r.summary()!.refreshMs).toBeNull();
  });
});

describe('MatchFrameRecord: skipNext and the absurd interval', () => {
  it('skipNext drops exactly one interval and one work sample; the next frame counts again', () => {
    const r = new MatchFrameRecord();
    r.frame(16, 2, true);
    r.skipNext();
    r.frame(500, 50, true);
    r.frame(17, 2, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(2);
    expect(s.intHist).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    expect(s.workHist).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    expect(s.wp95).toBe(2.5);
    expect(s.thirds[0]).toEqual([2, 33, 0, 2]);
  });

  it('skipNext called twice skips once', () => {
    const r = new MatchFrameRecord();
    r.skipNext();
    r.skipNext();
    r.frame(500, 50, true);
    r.frame(16, 2, true);
    expect(r.summary()!.drawn).toBe(1);
    expect(r.summary()!.thirds[0]).toEqual([1, 16, 0, 2]);
  });

  it('under a frame cap the skipped interval is the next drawn one, with the undrawn time before it', () => {
    const r = new MatchFrameRecord();
    r.skipNext();
    r.frame(900, 1, false);
    r.frame(16.7, 3, true);
    expect(r.summary()).toBeNull();
    r.frame(16.7, 1, false);
    r.frame(16.7, 3, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(1);
    expect(s.intHist).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('a 60 s interval is a skip: the counts, the histograms and the bins unchanged', () => {
    const r = new MatchFrameRecord();
    run(r, 50, 16.7, 2);
    const before = r.summary();
    const bins = r.binCount();
    r.frame(60_000, 9, true);
    expect(r.summary()).toEqual(before);
    expect(r.binCount()).toBe(bins);
    r.frame(16.7, 1, false);
    r.frame(60_000, 9, false); // undrawn: the pending time dropped, and the next drawn frame skipped
    r.frame(16.7, 9, true);
    expect(r.summary()).toEqual(before);
    expect(r.binCount()).toBe(bins);
  });

  it('1e12 does not grow the bins', () => {
    const r = new MatchFrameRecord();
    run(r, 1, 20, 2);
    r.frame(1e12, 2, true);
    run(r, 1, 20, 2);
    expect(r.binCount()).toBe(1);
    expect(r.summary()!.drawn).toBe(2);
  });

  it('1000 ms exactly counts; 1000.1 does not', () => {
    const r = new MatchFrameRecord();
    r.frame(1000, 2, true);
    expect(r.summary()!.intHist).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    r.frame(1000.1, 2, true);
    expect(r.summary()!.drawn).toBe(1);
  });

  it('no frame call grows the bins by more than one, however much undrawn time a drawn frame carries', () => {
    const r = new MatchFrameRecord();
    run(r, 1, 20, 2);
    let calls = 1;
    for (let i = 0; i < 30; i++) { r.frame(999, 0, false); calls++; }
    run(r, 3, 20, 2);
    calls += 3;
    expect(r.binCount()).toBeLessThanOrEqual(calls);
    expect(r.binCount()).toBe(2); // the carried 30 s opens no empty bins: the next frame opens one
  });
});

describe('MatchFrameRecord: the thirds, by time (2 s bins, each third the bins starting in its own third of the time)', () => {
  it('fewer than three bins: all in the first third, the later two [0, 0, 0, 0]', () => {
    const one = new MatchFrameRecord();
    run(one, 10, 20, 4);
    expect(one.binCount()).toBe(1);
    expect(one.summary()!.thirds).toEqual([[10, 200, 0, 4], ZERO, ZERO]);
    const two = new MatchFrameRecord();
    run(two, 150, 20, 4);
    expect(two.binCount()).toBe(2);
    expect(two.summary()!.thirds).toEqual([[150, 3000, 0, 4], ZERO, ZERO]);
  });

  it('T = 30 s: five bins each', () => {
    const r = new MatchFrameRecord();
    run(r, 1500, 20, 4);
    expect(r.binCount()).toBe(15);
    expect(r.summary()!.thirds).toEqual([[500, 10_000, 0, 4], [500, 10_000, 0, 4], [500, 10_000, 0, 4]]);
  });

  it('T = 20.02 s: the last third holds real frames, not the last 20 ms', () => {
    const r = new MatchFrameRecord();
    run(r, 1001, 20, 4);
    expect(r.binCount()).toBe(11);
    // T/3 = 6673.3 and 2T/3 = 13346.7: bins starting 0-6 s, 8-12 s, and 14-20 s.
    expect(r.summary()!.thirds).toEqual([[400, 8000, 0, 4], [300, 6000, 0, 4], [301, 6020, 0, 4]]);
  });

  it('a match that slows in its last third: long frames and the mean work show it', () => {
    const r = new MatchFrameRecord();
    run(r, 1000, 20, 4); // 20 s at 50 fps, 4 ms of work
    run(r, 200, 50, 10.04); // 10 s at 20 fps, 10.04 ms of work
    expect(r.binCount()).toBe(15);
    const s = r.summary()!;
    expect(s.thirds).toEqual([[500, 10_000, 0, 4], [500, 10_000, 0, 4], [200, 10_000, 200, 10]]);
    expect(s.drawn).toBe(1200);
  });
});

describe('MatchFrameRecord: a long match', () => {
  it('an hour of 60 fps frames: the counts exact, 1800 bins and no per-frame memory', () => {
    const r = new MatchFrameRecord();
    const frames = 60 * 60 * 60;
    for (let i = 0; i < frames; i++) r.frame(1000 / 60, 2, true);
    const s = r.summary()!;
    expect(s.drawn).toBe(frames);
    expect(s.intHist).toEqual([0, frames, 0, 0, 0, 0, 0, 0]);
    expect(s.workHist).toEqual([0, frames, 0, 0, 0, 0, 0, 0]);
    expect([s.wp50, s.wp95]).toEqual([2.5, 2.5]);
    expect([s.ip50, s.ip95]).toEqual([17, 17]);
    expect(s.refreshMs).toBe(16.7);
    expect(r.binCount()).toBe(1800);
    expect(s.thirds.reduce((n, t) => n + t[0], 0)).toBe(frames);
    for (const t of s.thirds) {
      expect(Math.abs(t[0] - frames / 3)).toBeLessThanOrEqual(2); // a frame either side of a bin edge (float sums)
      expect(t[2]).toBe(0);
      expect(t[3]).toBe(2);
    }
  });
});
