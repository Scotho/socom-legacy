import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADAPTIVE_V2_ADAPTATION, AdaptiveRatio, PIXEL_RATIO_CAP_ADAPTATION, PIXEL_RATIO_FLOOR_ADAPTATION, pixelRatioCap, TOUCH_PIXEL_RATIO_CAP_ADAPTATION,
  watchViewport, type RatioTarget, type ViewportWindow,
} from '../src/matchViewport';
import { ratioTargetOf, type MatchRenderer } from '../src/matchRenderer';
import { renderCapForV2 } from '../src/videoSettings';

/**
 * PAR-12 (web sprint PARITY-1, audit A.12; research 255 s2): the adaptive pixel ratio and the phone's viewport, as
 * `/testroom`'s `main.ts` runs them (127-136, 1505-1533, 1626-1632), as one policy both pages call (`./matchViewport`), on
 * the renderer contract's pixel ratio (`./matchRenderer`). A browser adaptation: the console drew one 640 x 448 frame.
 */

// The menu's renderer as the front end's match makes it (`./renderer` `createRenderer`), on three's renderer faked:
// what pixel ratio it draws at when no page sets one (the audit left it unverified).
const asked = vi.hoisted(() => ({ ratios: [] as number[] }));
vi.mock('three/webgpu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples = 4; outputColorSpace = ''; autoClear = true; backend = { isWebGLBackend: true, createRenderPipeline() {} };
    async init(): Promise<void> {}
    setPixelRatio(r: number): void { asked.ratios.push(r); }
    setSize(): void {}
    setClearColor(): void {}
    getRenderTarget(): null { return null; }
    setRenderTarget(): void {}
    async dispose(): Promise<void> {}
  }
  return { ...actual, WebGPURenderer: FakeRenderer };
});

afterEach(() => { vi.unstubAllGlobals(); asked.ratios = []; });

describe("PAR-12: the menu renderer's default, measured (./renderer createRenderer, its ratio before any page sets one)", () => {
  it('createRenderer draws at min(devicePixelRatio, 2): 2 on a 3x phone, 1.25 at 1.25, 1 at 1 -- no touch cap and no adaptation of its own', async () => {
    const { createRenderer } = await import('../src/renderer');
    for (const [device, ratio] of [[3, 2], [1.25, 1.25], [1, 1]] as const) {
      vi.stubGlobal('devicePixelRatio', device);
      asked.ratios = [];
      const v = await createRenderer({} as HTMLCanvasElement);
      expect(v.pixelRatio()).toBe(ratio);
      expect(asked.ratios).toEqual([ratio]);                         // set once, at the creation
      await v.renderer.dispose();
    }
  });
});

describe('PAR-12: the cap (main.ts RATIO_CAP)', () => {
  it("the device's ratio, at most 2 on a desktop and 1.5 on a touch device; 1 when the device names none", () => {
    expect([PIXEL_RATIO_CAP_ADAPTATION, TOUCH_PIXEL_RATIO_CAP_ADAPTATION, PIXEL_RATIO_FLOOR_ADAPTATION]).toEqual([2, 1.5, 0.75]);
    expect(pixelRatioCap(3, false)).toBe(2);
    expect(pixelRatioCap(3, true)).toBe(1.5);
    expect(pixelRatioCap(1.25, true)).toBe(1.25);
    expect(pixelRatioCap(1, false)).toBe(1);
    expect(pixelRatioCap(undefined, false)).toBe(1);
    expect(pixelRatioCap(0, true)).toBe(1);
  });
});

/** A renderer's pixel ratio, its changes listed with the time they came. */
function target(start = 1): RatioTarget & { set: [number, number][]; at: number } {
  let ratio = start;
  const t = {
    set: [] as [number, number][], at: 0,
    setPixelRatio: (r: number) => { ratio = r; t.set.push([t.at, r]); },
    pixelRatio: () => ratio,
  };
  return t;
}

// VS-3 (the video settings plan, product track; the spec §4.4 item 4 as the controller amended it at the VS-3 review,
// 2026-11-07; a browser adaptation, no original): the v2 hysteresis replaced PAR-12's constants (the 0.75 floor, the 0.25
// step, the 12 ms climb edge, the 0.08 smoothing), so the cases that pinned them are rewritten here against
// `ADAPTIVE_V2_ADAPTATION`: EWMA 0.2; a step down when the smoothed time stays over 1.44 x the target (today's 24 ms at
// 16.7) for 8 frames in a row and 2 s since the last change; steps of 5 % of the cap, a floor of 50 % of it; a panic
// drop of two steps after 6 frames over 33 ms (AQ-8: 41.75 ms, with the side test at the floor); a climb of one step after 4 s at or under the target, its wait doubled
// (to 64 s) by a step down within 10 s of a climb and reset after a climb that holds 30 s.
describe('VS-3 (a browser adaptation): AdaptiveRatio v2 -- the 24 ms edge, the settle count, the panic, the climb and its back-off, the floor, the hold', () => {
  /** `n` frames of `ms` each through the policy, the clock at `t.at` advanced by `every` ms a frame (default `ms`). */
  const run = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number, hold = false, every = ms): void => {
    for (let i = 0; i < n; i++) { t.at += every; a.frame(ms / 1000, t.at, t, hold); }
  };
  const ratios = (t: ReturnType<typeof target>): number[] => t.set.map(([, r]) => r);
  /** Frames from `frameMs(at, ratio)` until `untilMs` (or `stop` says so), the clock advanced by each frame. */
  const sim = (a: AdaptiveRatio, t: ReturnType<typeof target>, untilMs: number, frameMs: (at: number, ratio: number) => number, stop: () => boolean = () => false): void => {
    while (t.at < untilMs && !stop()) { const ms = frameMs(t.at, t.pixelRatio()); t.at += ms; a.frame(ms / 1000, t.at, t, false); }
  };
  /** A frame of `base` ms, with one dropped frame (two vsync intervals, 33.3 ms) every `everyMs`. */
  const hitches = (base: number, everyMs: number) => {
    let last = 0;
    return (at: number): number => { if (at - last >= everyMs) { last = at; return 1000 / 30; } return base; };
  };

  /** AQ-8: a page the floor does help -- 60 ms above the floor, 40 ms at it -- so the side test lets the trade stand there. */
  const helped = (cap: number) => (_at: number, r: number): number => (r > cap * 0.5 + 1e-9 ? 60 : 40);

  it('the options: each the spec §4.4 item 4 value as amended, an adaptation', () => {
    expect(ADAPTIVE_V2_ADAPTATION).toEqual({
      targetMs: 16.7, ewma: 0.2, settleFrames: 8, stepShare: 0.05, floorShare: 0.5, panicFrames: 6, panicShare: 2.5,
      downShare: 1.44, improveEveryMs: 4000, climbSlack: 0.01, improveMaxMs: 64000, bounceWindowMs: 10000, holdResetMs: 30000,
      sideGain: 0.15, sideRefShare: 0.8, sideRetryMs: 60000, sideRetryMaxMs: 480000, sideWindowMs: 2000,
    });
  });

  // AQ-8, the rule stated once (`AdaptiveOptions.panicShare`): the panic's frame time is 2.5 x the frame time aimed at --
  // between a frame of two refresh intervals (one refresh missed) and a frame of three. Every panic figure below is that
  // multiple: 41.75 ms at the default 16.7, 83.25 ms under a 30 fps cap's 33.3.
  it.each([
    ['the default target, 16.7 ms', 0, 16.7],
    ['a 30 fps frame cap, 33.3 ms', 33.3, 33.3],
  ] as const)('AQ-8: the panic\'s edge is 2.5 x the interval aimed at (%s): a two-refresh frame is under it, a three-refresh frame over it, and the edge itself is not a panic', (_name, set, interval) => {
    const edge = 2.5 * interval;
    expect(edge).toBeCloseTo(set === 0 ? 41.75 : 83.25, 9);
    const steps = (ms: number): number[] => {
      const a = new AdaptiveRatio(1), t = target();
      if (set !== 0) a.setTarget(set);
      a.start(t);
      run(a, t, 30, interval);                                            // settled, at the target
      run(a, t, 12, ms);                                                  // under 2 s: only a panic can move it
      return ratios(t);
    };
    expect(steps(2 * interval)).toEqual([1]);                             // one refresh missed
    expect(steps(edge)).toEqual([1]);                                     // at the edge: not over it
    expect(steps(3 * interval)[1]).toBeCloseTo(0.9, 9);                   // two missed: the panic's two steps
  });

  it.each([
    // [case, frame model, the ratio after 300 s, the ratio never moved]
    ['60 Hz steady', () => 1000 / 60, 1, true],
    ['60 Hz, one dropped frame every 5 s', hitches(1000 / 60, 5000), 1, true],
    ['60 Hz, one dropped frame every 30 s', hitches(1000 / 60, 30000), 1, true],
    ['steady 20 ms', () => 20, 1, true],
    ['steady 22 ms', () => 22, 1, true],
    // AQ-8: '30 Hz throttled (33.3 ms)' was here, the panic taking it to the floor to stay; its case is the side test's below.
    ['144 Hz, one dropped frame every 5 s', hitches(1000 / 144, 5000), 1, true],
    ['GPU-bound 28 ms at the cap (the time as the pixels, ratio squared): steps down to 0.9, where 22.7 ms holds', (_at: number, r: number) => 28 * r * r, 0.9, false],
  ] as const)('the reviewer\'s 300 s scenario: %s', (_name, model, end, still) => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 300_000, model as (at: number, ratio: number) => number);
    expect(t.pixelRatio()).toBeCloseTo(end, 9);
    if (still) expect(ratios(t)).toEqual([1]);
    else {
      const r = ratios(t);
      for (let i = 1; i < r.length; i++) expect(r[i]!).toBeLessThan(r[i - 1]!);           // only ever down
    }
  });

  it('a bounce: a step down within 10 s of a climb doubles the next climb\'s wait -- 4, 8, 16, 32, 64 s, held at 64', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 300_000, (_at, r) => (r > 0.975 ? 26 : 16));                                  // 26 ms at the cap, 16 below it
    const climbs: number[] = [];
    for (let i = 1; i < t.set.length; i++) if (t.set[i]![1] > t.set[i - 1]![1]) climbs.push(t.set[i]![0] - t.set[i - 1]![0]);
    expect(climbs.length).toBeGreaterThanOrEqual(6);
    climbs.forEach((gap, i) => {
      const wait = Math.min(64000, 4000 * 2 ** i);
      expect(gap, `climb ${i}`).toBeGreaterThanOrEqual(wait);
      expect(gap, `climb ${i}`).toBeLessThan(wait + 1000);
    });
  });

  it('a two-step (panic) bounce: 50 ms at the cap, 16 ms below it -- the waits reach 64 s and stay; a held climb short of the bounce\'s ratio never resets them (900 s)', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 900_000, (_at, r) => (r > 0.975 ? 50 : 16));                                  // a three-refresh frame at the cap: over 2.5 x the target, a panic (AQ-8: 33.4 ms, two refreshes, is not)
    const climbs: number[] = [];
    for (let i = 1; i < t.set.length; i++) if (t.set[i]![1] > t.set[i - 1]![1]) climbs.push(t.set[i]![0] - t.set[i - 1]![0]);
    expect(climbs.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < climbs.length; i++) expect(climbs[i]!, `climb ${i}`).toBeGreaterThanOrEqual(climbs[i - 1]! - 1000);   // never back to 4 s
    const top = climbs.slice(-3);
    for (const gap of top) { expect(gap).toBeGreaterThanOrEqual(64000); expect(gap).toBeLessThan(65000); }
    expect(t.set.length).toBeLessThan(40);                                                  // not the 74 changes of the reset loop
  });

  it('a cap lowered after a bounce: a held climb to the new cap resets the wait (the bounce\'s ratio is read under the cap)', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    const ups = (): number => t.set.filter((x, i) => i > 0 && x[1] > t.set[i - 1]![1]).length;
    const downs = (): number => t.set.filter((x, i) => i > 0 && x[1] < t.set[i - 1]![1]).length;
    sim(a, t, 300_000, (_at, r) => (r > 0.975 ? 26 : 16), () => downs() === 2);              // a climb to 1.0 and its bounce: the wait 8 s
    expect(t.pixelRatio()).toBeCloseTo(0.95, 9);
    a.setCap(0.75);
    sim(a, t, t.at + 1000, () => 16);                                                        // the next tick meets the cap
    expect(t.pixelRatio()).toBe(0.75);
    let n = t.set.length;
    sim(a, t, t.at + 60_000, () => 26, () => t.set.length > n);                              // one step down under the new cap
    expect(t.pixelRatio()).toBeCloseTo(0.7125, 9);
    const u = ups();
    sim(a, t, t.at + 60_000, () => 16, () => ups() > u);                                     // the climb to 0.75 (the 8 s wait)
    expect(t.pixelRatio()).toBe(0.75);
    sim(a, t, t.at + 31_000, () => 16);                                                      // it holds 31 s: the wait is reset
    n = t.set.length;
    sim(a, t, t.at + 60_000, () => 26, () => t.set.length > n);
    const down = t.at;
    sim(a, t, t.at + 60_000, () => 16, () => t.set.length > n + 1);
    expect(t.pixelRatio()).toBe(0.75);
    expect(t.at - down).toBeGreaterThanOrEqual(4000);
    expect(t.at - down).toBeLessThan(5000);                                                  // 4 s, not the 8 s left by the bounce
  });

  it('a climb that holds 30 s resets the wait to 4 s', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    const ups = (): number => t.set.filter((s, i) => i > 0 && s[1] > t.set[i - 1]![1]).length;
    sim(a, t, 300_000, (_at, r) => (r > 0.975 ? 26 : 16), () => ups() === 3);                // two bounces and a third climb: the wait is 16 s now
    const fine = t.at;
    sim(a, t, fine + 31_000, () => 16);                                                       // the third climb holds 31 s
    const n = t.set.length;
    sim(a, t, 400_000, () => 26, () => t.set.length > n);                                    // a step down, long after the climb
    const down = t.at;
    sim(a, t, 500_000, () => 16, () => t.set.length > n + 1);
    expect(t.set.at(-1)![1]).toBe(1);
    expect(t.at - down).toBeGreaterThanOrEqual(4000);
    expect(t.at - down).toBeLessThan(5000);
  });

  it('starts at the cap; frames at or under the 24 ms edge (1.44 x 16.7) never step it down', () => {
    const a = new AdaptiveRatio(1.5), t = target();
    a.start(t);
    expect(t.set).toEqual([[0, 1.5]]);
    run(a, t, 400, 16);
    run(a, t, 400, 20);
    run(a, t, 400, 23.5);
    expect(t.set).toEqual([[0, 1.5]]);
  });

  it('smooths the frame time by 0.2 a frame from the target and ticks every 200 ms; no frame time, no tick', () => {
    const a = new AdaptiveRatio(2), t = target(2);
    expect(a.smoothedMs()).toBeCloseTo(16.7, 9);
    expect(a.frame(0.0167, 100, t, false)).toBe(false);                  // within 200 ms of the start
    expect(a.frame(0.05, 250, t, false)).toBe(true);                     // the tick: the readout and the check
    expect(a.smoothedMs()).toBeCloseTo(16.7 + (16.7 - 16.7) * 0.2 + (50 - 16.7) * 0.2, 9);
    expect(a.frame(0, 900, t, false)).toBe(false);                       // a zero step: neither
    expect(a.frame(0.016, 300, null, false)).toBe(false);                // no tick within 200 ms of the last
  });

  it('a slow run (over the edge, under the panic) steps down one 5 % step at a time, at least 2 s apart', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    run(a, t, 79, 25);                                                   // 1975 ms: inside the 2 s, nothing
    expect(ratios(t)).toEqual([1]);
    run(a, t, 400, 25);                                                  // 10 s more
    const r = ratios(t);
    expect(r.length).toBeGreaterThan(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]! - r[i]!).toBeCloseTo(0.05, 9);
    expect(t.set[1]![0]).toBeGreaterThanOrEqual(2000);
    for (let i = 2; i < t.set.length; i++) expect(t.set[i]![0] - t.set[i - 1]![0]).toBeGreaterThanOrEqual(2000);
  });

  it('a step down waits 8 frames in a row over the edge: after a hold, 7 slow ticks leave it, the 8th steps', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    run(a, t, 12, 25, true, 250);                                        // 3 s held (a map arriving): every frame a tick
    expect(ratios(t)).toEqual([1]);
    run(a, t, 7, 25, false, 250);
    expect(ratios(t)).toEqual([1]);
    run(a, t, 1, 25, false, 250);
    expect(ratios(t)).toEqual([1, 0.95]);
  });

  it('one frame back under the edge restarts the 8 (no smoothing: each frame is the smoothed time)', () => {
    const a = new AdaptiveRatio(1, { ...ADAPTIVE_V2_ADAPTATION, ewma: 1 }), t = target();
    a.start(t);
    run(a, t, 12, 16, false, 250);                                       // 3 s in, past the 2 s gap
    run(a, t, 7, 30, false, 250); run(a, t, 1, 16, false, 250); run(a, t, 7, 30, false, 250);
    expect(ratios(t)).toEqual([1]);
    run(a, t, 1, 30, false, 250);
    expect(ratios(t)).toEqual([1, 0.95]);
  });

  it('a panic: 6 consecutive frames over 41.75 ms (AQ-8: 2.5 x the target, between a two-refresh frame and a three-refresh one) drop two steps at once, inside the 2 s; a fast frame between resets the count', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    run(a, t, 30, 16);
    run(a, t, 5, 50); run(a, t, 1, 16); run(a, t, 5, 50);               // never 6 in a row
    expect(ratios(t)).toEqual([1]);
    run(a, t, 1, 50);                                                    // the 6th in a row
    expect(ratios(t)).toEqual([1, 0.9]);                                 // two steps, one change
    expect(t.set[1]![0]).toBeLessThan(2000);
    run(a, t, 7, 50);                                                    // the next waits its 8 settled frames
    expect(ratios(t)).toEqual([1, 0.9]);
    run(a, t, 1, 50);
    expect(ratios(t)).toHaveLength(3);
    expect(ratios(t)[2]).toBeCloseTo(0.8, 9);
  });

  it('the floor is 50 % of the cap: long frames the floor helps end there and never below it', () => {
    for (const cap of [1, 2, 1.5]) {
      const a = new AdaptiveRatio(cap), t = target();
      a.start(t);
      sim(a, t, 36_000, helped(cap));
      expect(ratios(t).at(-1), `${cap}`).toBe(cap * 0.5);
      expect(Math.min(...ratios(t))).toBe(cap * 0.5);
    }
  });

  it('the climb: frames at or under the target (vsync at 60 Hz included) climb one step every 4 s, back to the cap and never above it; frames over it do not', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 36_000, helped(1));                                        // to the floor, where the trade stands (AQ-8)
    expect(ratios(t).at(-1)).toBe(0.5);
    t.set.length = 0;
    run(a, t, 1000, 18);                                                 // 18 s over the target, under the edge: nothing
    expect(t.set).toEqual([]);
    run(a, t, 3000, 1000 / 60);                                          // 50 s of vsync at 60 Hz
    const r = ratios(t);
    expect(r).toHaveLength(10);
    for (let i = 0; i < r.length; i++) expect(r[i]).toBeCloseTo(0.55 + 0.05 * i, 9);
    expect(r.at(-1)).toBe(1);
    for (let i = 1; i < t.set.length; i++) {
      const gap = t.set[i]![0] - t.set[i - 1]![0];
      expect(gap).toBeGreaterThanOrEqual(4000);
      expect(gap).toBeLessThan(4000 + 250);                              // the next 200 ms tick after the 4 s
    }
  });

  it('a held page (a map arriving, the PS2 frame, the loading hold) is never changed; on release the panic counts fresh frames', () => {
    const a = new AdaptiveRatio(1.5), t = target();
    a.start(t);
    run(a, t, 300, 50, true);
    expect(t.set).toEqual([[0, 1.5]]);
    expect(a.smoothedMs()).toBeGreaterThan(33);                          // the readout still follows the frames
    run(a, t, 7, 50);
    expect(ratios(t)).toEqual([1.5]);
    run(a, t, 1, 50);
    expect(ratios(t)).toHaveLength(2);
    expect(ratios(t)[1]).toBeCloseTo(1.35, 9);                           // two steps of 0.075
  });

  it("setTarget(0) (the frame cap turned Off, VS-4's call) puts the default 16.7 ms target back; NaN leaves the target as it is", () => {
    const run2 = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number): void => {
      for (let i = 0; i < n; i++) { t.at += ms; a.frame(ms / 1000, t.at, t, false); }
    };
    const a = new AdaptiveRatio(1), t = target();
    a.setTarget(33.3);
    a.start(t);
    run2(a, t, 200, 30);                                                 // 6 s of 30 ms under a 30 fps cap: at its target
    a.setTarget(Number.NaN);
    run2(a, t, 200, 30);
    expect(t.set.map(([, r]) => r)).toEqual([1]);
    a.setTarget(0);                                                      // the cap Off: 30 ms is over 24.05 ms again
    run2(a, t, 100, 30);
    expect(t.set.length).toBeGreaterThan(1);
    expect(t.set[1]![1]).toBeCloseTo(0.95, 9);
  });

  it("setTarget(33.3) (a 30 fps frame cap): the edge moves to 47.95 ms and the panic to 83.25 ms (2.5 x 33.3); 34 and 45 ms frames leave it, 50 ms frames step, the cap's two-vsync frames (33.33 ms) climb back", () => {
    const a = new AdaptiveRatio(1), t = target();
    a.setTarget(33.3);
    a.setTarget(Number.NaN); a.setTarget(-5);                            // not a target: ignored
    a.start(t);
    run(a, t, 400, 34);
    run(a, t, 400, 45);
    expect(ratios(t)).toEqual([1]);
    run(a, t, 100, 50);                                                  // over the edge, under the scaled panic
    const r = ratios(t);
    expect(r.length).toBeGreaterThan(1);
    expect(r[1]).toBeCloseTo(0.95, 9);                                   // one step, not a panic
    run(a, t, 1000, 1000 / 30);                                          // two 60 Hz vsyncs: at the target, inside the 1 % slack
    expect(ratios(t).at(-1)).toBe(1);
  });

  // AQ-8 (the Automatic quality plan's D1; a browser adaptation, no original; the controller's ruling for v0.4.19, relayed
  // 2026-11-11): the panic's edge was 33 ms, and one missed refresh on a 60 Hz display is 33.3 ms -- so any page holding
  // 30 to 40 fps, whatever bounded it, was at half its resolution inside two seconds and never climbed (the field,
  // 2026-11-09..11: 93 of 98 bad matches ended at the floor). The panic is for a stall (over 2.5 x the interval aimed at),
  // and the trade is judged where it has given the most: at the floor.
  it('AQ-8: a 60 Hz page holding 30 fps (33.3 ms: one refresh missed every frame) is not a panic -- one 5 % step after 2 s, not half the cap', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 3000, () => 1000 / 30);
    expect(ratios(t)).toEqual([1, 0.95]);
  });

  it.each([['33.3 ms', 1000 / 30], ['40 ms', 40]] as const)('AQ-8, the side test: a page at %s whatever the ratio steps to the floor, finds fewer pixels bought nothing and returns to the cap in one change; it looks again only after 1, 2 and 4 minutes', (_name, ms) => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    expect(a.bound()).toBe('unknown');
    let atCap = 0;
    sim(a, t, 600_000, (_at, r) => { if (r === 1) atCap += ms; return ms; });
    const r = ratios(t);
    for (let i = 1; i <= 10; i++) expect(r[i]).toBeCloseTo(1 - 0.05 * i, 9);   // the start, ten steps down ...
    expect(r[10]).toBe(0.5);
    expect(r[11]).toBe(1);                                                // ... and the return, in one change
    expect(t.set[11]![0]).toBeLessThan(30_000);                           // back inside half a minute
    // Each later look is the same eleven changes (ten steps and the return), after a wait that doubles: 60, 120, 240 s.
    const returns = t.set.map(([at, x], i) => ({ at, x, i })).filter((s) => s.x === 1 && s.i > 0);
    expect(returns).toHaveLength(4);                                      // four looks in ten minutes: the fifth waits 8 minutes
    expect(r).toHaveLength(45);                                           // the start and four times eleven changes, no other
    [60_000, 120_000, 240_000].forEach((wait, k) => {
      expect(t.set[returns[k]!.i + 1]![0] - returns[k]!.at, `the wait after return ${k + 1}`).toBeGreaterThanOrEqual(wait);
      expect(t.set[returns[k]!.i + 1]![0] - returns[k]!.at).toBeLessThan(wait + 3000);
    });
    expect(atCap / 600_000).toBeGreaterThan(0.8);                         // at the cap for over four fifths of the match
    expect(a.bound()).toBe('not-pixels');
  });

  it('AQ-8: a page that really overruns still steps down, and one the floor does help (50 ms above it, 33.3 ms at it) keeps its trade there -- a panic\'s descent takes no reading, so the cap is read once after the floor', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 120_000, (_at, r) => (r > 0.5 + 1e-9 ? 50 : 1000 / 30));
    const r = ratios(t);
    expect(r[1]).toBeCloseTo(0.9, 9);                                     // 50 ms frames: over 2.5 x the target, a panic's two steps
    expect(t.set[1]![0]).toBeLessThan(2000);
    expect(r.filter((x) => x === 1)).toHaveLength(2);                     // the start, and the one look back at the cap
    expect(t.set.filter(([, x]) => x === 1).at(-1)![0]).toBeLessThan(10_000);   // ... inside ten seconds
    expect(r.at(-1)).toBe(0.5);
    expect(a.bound()).toBe('pixels');
  });

  it('AQ-8: a page the pixels help before the floor (33.3 ms above 0.6 of the cap, 16.7 ms under it) is never judged and never returns to the cap', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 300_000, (_at, r) => (r > 0.6 + 1e-9 ? 1000 / 30 : 1000 / 60));
    const r = ratios(t);
    expect(Math.min(...r)).toBeCloseTo(0.6, 9);
    expect(Math.max(...r.slice(r.findIndex((x) => x < 0.6 + 1e-9)))).toBeLessThan(0.7);   // 0.6 and 0.65 from there, the bounce's waits
    expect(r.filter((x) => x === 1)).toHaveLength(1);                     // the start only
    expect(a.bound()).toBe('unknown');
  });

  it('AQ-8: a verdict the cap disproves is taken back once -- a load that rose during the descent sends the ratio up, the cap is slower than the floor was, the trade resumes and is not judged again', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    // 5 s of 26 ms whatever the ratio (two ordinary steps from a 26 ms cap), then a pixel-bound load: 20 + 40 r^2 ms.
    sim(a, t, 120_000, (at, r) => (at < 5000 ? 26 : 20 + 40 * r * r));
    const r = ratios(t);
    expect(r.filter((x) => x === 1)).toHaveLength(2);                     // the start and the one mistaken return
    expect(r.at(-1)).toBe(0.5);                                           // 30 ms at the floor against 60 at the cap
    expect(a.bound()).toBe('pixels');
  });

  it('AQ-8: a raised cap (more pixels than were judged) and a new start let the trade run again; a lowered cap keeps the verdict', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 60_000, () => 40);
    expect(a.bound()).toBe('not-pixels');
    a.setCap(0.8);
    sim(a, t, t.at + 10_000, () => 40);
    expect(a.bound()).toBe('not-pixels');
    expect(t.pixelRatio()).toBe(0.8);                                     // met, and held there
    a.setCap(2);
    expect(a.bound()).toBe('unknown');
    sim(a, t, t.at + 10_000, () => 40);
    expect(t.pixelRatio()).toBeLessThan(2);                               // it followed the cap up, and trades under it
    a.start(t);
    expect(a.bound()).toBe('unknown');
  });

  // AQ-8's review fold (the fresh review's F1, F2, F3; 2026-11-11): the frame time read at the cap must not be a hitch's
  // or a burst's; a page found CPU-bound must still be able to trade when a real stall comes later; a cap raised while
  // the ratio is on its way down must not leave the descent unjudged.
  it('AQ-8 fold F1: one long frame among the last eight before the first step does not make the floor look like a gain', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    let hitched = false;
    sim(a, t, 60_000, (at) => { if (!hitched && at > 1850) { hitched = true; return 100; } return 1000 / 30; });
    expect(Math.min(...ratios(t))).toBe(0.5);
    expect(t.pixelRatio()).toBe(1);
    expect(a.bound()).toBe('not-pixels');
  });

  it('AQ-8 fold F1: a burst that sets off a panic from the cap is not the cap\'s frame time -- the steps that follow it read the page as it runs', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 60_000, (at) => (at >= 1000 && at < 1500 ? 50 : 1000 / 30));    // ten 50 ms frames, one second in
    expect(ratios(t)[1]).toBeCloseTo(0.9, 9);                             // the burst's panic
    expect(Math.min(...ratios(t))).toBe(0.5);
    expect(t.pixelRatio()).toBe(1);
    expect(a.bound()).toBe('not-pixels');
  });

  it('AQ-8 fold F2: after "not-pixels" a real stall still trades -- a step a minute or more after the verdict opens the test again, and a floor that now helps keeps the ratio', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    // CPU-bound at 33.3 ms for a minute; then a load the pixels do carry: 10 + 50 r^2 ms, never under 33.3.
    sim(a, t, 200_000, (at, r) => (at < 60_000 ? 1000 / 30 : Math.max(1000 / 30, 10 + 50 * r * r)));
    const verdict = t.set[11]![0];                                        // the first return to the cap
    expect(t.set[11]![1]).toBe(1);
    expect(t.set[12]![0] - verdict).toBeGreaterThanOrEqual(60_000);       // 60 ms frames at the cap, and no step until the minute is up
    expect(t.pixelRatio()).toBe(0.5);
    expect(a.bound()).toBe('pixels');
  });

  it('AQ-8 fold F2: a CPU-bound page with a burst every 20 s is at the cap most of the match -- each look at the floor doubles the wait for the next', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    let atCap = 0, last = 0;
    sim(a, t, 600_000, (at, r) => { if (r === 1) atCap += at - last; last = at; return at % 20_000 < 400 && at > 400 ? 50 : 1000 / 30; });
    expect(atCap / 600_000).toBeGreaterThan(0.8);
    expect(ratios(t).filter((x) => x === 1)).toHaveLength(5);                 // the start and four returns in ten minutes
    expect(a.bound()).toBe('not-pixels');
  });

  // AQ-19 (the release review of v0.4.20's batch, 2026-11-11; a browser adaptation, no original) restates this case: the
  // descent is still judged, and the test returns to the ratio that descent LEFT -- it went back to the new cap, a
  // ratio the page had never drawn at.
  it('AQ-8 fold F3: a cap raised while the ratio is on its way down keeps the descent judged -- to the new floor, then back to the ratio it left (AQ-19: not the new cap)', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 10_000, () => 1000 / 30);                                  // four steps down from the cap of 1
    expect(t.pixelRatio()).toBeCloseTo(0.8, 9);
    a.setCap(1.5);                                                        // the window moved to a denser display
    sim(a, t, 70_000, () => 1000 / 30);
    expect(Math.min(...ratios(t))).toBe(0.75);                            // the new floor, reached and judged
    expect(t.pixelRatio()).toBe(1);
    expect(a.bound()).toBe('not-pixels');
    // Its re-test a minute on leaves a ratio UNDER the cap; it is a descent the floor judges all the same, back to where
    // it left -- never a page left at its floor unjudged for the match.
    sim(a, t, 200_000, () => 1000 / 30);
    expect(t.pixelRatio()).toBe(1);
    expect(ratios(t).filter((x) => x === 1)).toHaveLength(3);                 // the start and two returns
    expect(Math.max(...ratios(t))).toBe(1);                               // never the new cap in one change
    expect(a.bound()).toBe('not-pixels');
  });

  // AQ-19: the field row of 2026-11-11 (Microsoft Basic Render Driver; the context lost seconds after the ratio went
  // 0.38 -> 1.5). A page the pixels bind stands at its floor with the trade found to help -- the right place, and a
  // descent still marked. A cap raised by more than a step opened the test afresh, and its return went to the NEW cap:
  // from the floor of 0.75, sixteen times the pixels in one change.
  it('AQ-19: a cap raised over a page the pixels bind, at its floor with the trade found to help (0.375 under 0.75 -> 1.5), returns to the ratio it left -- never the new cap', () => {
    const a = new AdaptiveRatio(0.75), t = target();
    a.start(t);
    const page = (_at: number, r: number): number => 60 + 160 * (r - 0.375) / 0.375;   // 60 ms at 0.375, 220 ms at 0.75, 540 ms at 1.5
    sim(a, t, 60_000, page);
    expect(t.pixelRatio()).toBeCloseTo(0.375, 9);
    expect(a.bound()).toBe('pixels');
    const n = t.set.length;
    a.setCap(1.5);                                                        // the preset to Quality on a 150 % display
    sim(a, t, t.at + 60_000, page);
    const after = ratios(t).slice(n);
    expect(after[0]).toBe(0.75);                                          // the ratio the descent left
    expect(Math.max(...after)).toBe(0.75);
    expect(t.pixelRatio()).toBe(0.75);                                    // and the new floor: the trade, judged again, holds it there
    expect(a.bound()).toBe('pixels');
  });

  it.each([
    ['lowered since (1 -> 0.9)', 0.9, 0.9],
    ['raised by under a step (1 -> 1.04: a resize of a few pixels under a ceiling)', 1.04, 1.04],
  ])('AQ-19: with the cap %s the test returns to the cap, as it did', (_what, cap, back) => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 10_000, () => 1000 / 30);                                  // four steps down from the cap of 1
    expect(t.pixelRatio()).toBeCloseTo(0.8, 9);
    a.setCap(cap);
    sim(a, t, 70_000, () => 1000 / 30);
    expect(Math.min(...ratios(t))).toBeCloseTo(cap / 2, 9);
    expect(t.pixelRatio()).toBe(back);
    expect(a.bound()).toBe('not-pixels');
  });

  // AQ-8's second review fold (2026-11-11; its findings 1, 2, 3): no page may be left worse than before the change.
  it('AQ-8 fold 3: a load that turns GPU-bound WITHOUT a panic after "not-pixels" still gets its trade -- once the wait is up an ordinary step opens the test again', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    // CPU-bound at 33.3 ms for 30 s; then 5 + 28 r^2 ms on a 60 Hz display (33.3 ms at the cap, 16.7 ms from 0.6 of it).
    const vsync = (ms: number): number => Math.ceil(ms / (1000 / 60) - 1e-9) * (1000 / 60);
    sim(a, t, 200_000, (at, r) => (at < 30_000 ? 1000 / 30 : vsync(5 + 28 * r * r)));
    expect(t.set[11]![1]).toBe(1);                                        // the CPU-bound verdict's return
    expect(t.set[12]![0] - t.set[11]![0]).toBeGreaterThanOrEqual(60_000);
    expect(t.pixelRatio()).toBeLessThan(0.7);                             // 0.6 or 0.65: 60 fps, where it had been held at 30
    expect(t.pixelRatio()).toBeGreaterThan(0.55);
  });

  it('AQ-8 fold 3: a long stall as the descent begins (22 frames of 50 ms: three panics) is not the cap\'s frame time -- a panic takes no reading, and with none the cap is read after the floor', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 60_000, (at) => (at >= 1000 && at < 2100 ? 50 : 1000 / 30));
    expect(Math.min(...ratios(t))).toBe(0.5);
    expect(t.pixelRatio()).toBe(1);
    expect(a.bound()).toBe('not-pixels');
  });

  it('AQ-8 fold 3: a cap raised by less than a step (a resize of a pixel under a ceiling) keeps the verdict and its wait', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 40_000, () => 1000 / 30);
    expect(a.bound()).toBe('not-pixels');
    const n = t.set.length;
    a.setCap(1.001);
    sim(a, t, t.at + 30_000, () => 1000 / 30);
    expect(a.bound()).toBe('not-pixels');
    expect(ratios(t).slice(n)).toEqual([1.001]);                          // it follows the cap up, and takes no step down
  });

  // AQ-8 fold 4 (the hub's rendered run of 2026-11-11, agent-mail/evidence/v0419/aq-panic-hub-20261111T1416Z/rc2-cpu6.jsonl:
  // MP2, WebGPU, CPU throttled 6x, cap 1, floor 0.5): a CPU-bound page, ~38 ms whatever the ratio with bursts of ~48 ms.
  // The first descent was panics only and returned to the cap; the re-test a minute later opened with ONE ordinary step,
  // inside a burst, and the reference read there (48 ms) made the floor's 38 ms look like a gain: the floor for the match.
  it('AQ-8 fold 4: a CPU-bound page (38 ms whatever the ratio, 48 ms bursts) whose re-test opens with an ordinary step inside a burst returns to the cap each time -- the cap is read after the floor', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    let burstFrom = 500, burstUntil = 2400;                               // the first burst: panics from the cap to the floor
    let nextOpen = Infinity, seen = 1;
    const waits = [60_000, 120_000];
    const opened: number[] = [];
    const drive = (until: number): void => {
      while (t.at < until) {
        const ms = t.at >= burstFrom && t.at < burstUntil ? 48 : 38;
        t.at += ms;
        const ticked = a.frame(ms / 1000, t.at, t, false);
        if (t.set.length > seen) {                                        // a change: a return to the cap starts the wait
          const [at, r] = t.set[t.set.length - 1]!;
          if (r === 1) { const w = waits.shift(); nextOpen = w === undefined ? Infinity : at + w; }
          seen = t.set.length;
        }
        // A burst opened on the tick just before the wait is up: its fifth 48 ms frame (240 ms on) is the next tick, past
        // the wait, with the median of the last eight at 48 and the panic's count at five -- an ORDINARY step, as the hub's.
        if (ticked && t.at < nextOpen && t.at + 240 >= nextOpen) { burstFrom = t.at; burstUntil = t.at + 3000; opened.push(nextOpen); }
      }
    };
    drive(30_000);
    expect(Math.min(...ratios(t))).toBe(0.5);                             // the panics' descent, to the floor ...
    expect(ratios(t).filter((x) => x === 1)).toHaveLength(2);             // ... and back: no reading near the cap, the cap read after
    expect(a.bound()).toBe('not-pixels');
    drive(t.set.at(-1)![0] + 60_000 + 30_000);                            // the first re-test, and its settling
    expect(opened).toHaveLength(1);
    const first = t.set.findIndex(([at]) => at >= opened[0]!);
    expect(t.set[first]![1]).toBeCloseTo(0.95, 9);                         // it opened with one ordinary step, in the burst
    expect(t.pixelRatio()).toBe(1);                                       // back at the cap
    expect(a.bound()).toBe('not-pixels');
    drive(t.set.at(-1)![0] + 120_000 + 30_000);                           // the second re-test, 120 s on, the same
    expect(opened).toHaveLength(2);
    const second = t.set.findIndex(([at]) => at >= opened[1]!);
    expect(t.set[second]![1]).toBeCloseTo(0.95, 9);
    expect(t.pixelRatio()).toBe(1);
    expect(a.bound()).toBe('not-pixels');
    expect(ratios(t).filter((x) => x === 1)).toHaveLength(4);             // the start and three returns
  });

  // AQ-17 (the Automatic quality plan; a browser adaptation, no original; found 2026-11-11). The pages handed this class
  // the camera's step, clamped at 0.1 s, so every frame over 100 ms read as 100 ms: a page slower than 10 fps at its
  // floor read the same at the floor and at the cap, and the side test ruled that the pixels buy nothing. The class is
  // handed the frame's real time, and bounds it itself at a second (a stall -- a hidden tab, a load -- is no frame rate).
  //
  // The fold (the review of e476ad26f, 2026-11-11): the real time, up to a second, went into the SMOOTHED average too,
  // so a healthy 60 fps page lost a step after one long frame -- a hold's last frames, a compile, a hidden tab's
  // return -- which the 100 ms it read before never did. Only the side test's reading (the median of the last frames,
  // at the floor and at the cap) takes the real time: that median's clamp was the defect. The smoothed time, the
  // step's edge, the panic and the frame counter read a frame as v0.4.19 did, at most 100 ms.
  it('AQ-17 fold: the smoothed time (the step\'s edge, the frame counter) reads a frame as v0.4.19 did -- at most 100 ms', () => {
    const fed = (seconds: number): number => { const a = new AdaptiveRatio(1), t = target(); a.start(t); a.frame(seconds, 1, t, false); return a.smoothedMs(); };
    expect(fed(0.05)).toBeLessThan(fed(0.1));
    expect(fed(0.25)).toBe(fed(0.1));
    expect(fed(1)).toBe(fed(0.1));
    expect(fed(30)).toBe(fed(0.1));
  });

  it('AQ-17 fold: a healthy 60 fps page takes no step for one long frame -- a second\'s stall (a compile, a hidden tab\'s return)', () => {
    for (const stallAt of [5000, 5050, 5100, 5150]) {                      // the 200 ms check's phase must not matter
      const a = new AdaptiveRatio(1), t = target();
      a.start(t);
      let stalled = false;
      sim(a, t, 20_000, (at) => { if (!stalled && at >= stallAt) { stalled = true; return 1000; } return 1000 / 60; });
      expect(ratios(t), `the stall at ${stallAt} ms`).toEqual([1]);
    }
  });

  it('AQ-17 fold: a hold that ends on 300 ms frames (a loading screen\'s last frames) takes no step once the page runs at 60 fps', () => {
    for (const held of [5, 6, 7, 8]) {
      const a = new AdaptiveRatio(1), t = target();
      a.start(t);
      sim(a, t, 3000, () => 1000 / 60);
      for (let i = 0; i < held; i++) { t.at += 300; a.frame(0.3, t.at, t, true); }
      sim(a, t, t.at + 10_000, () => 1000 / 60);
      expect(ratios(t), `${held} held frames`).toEqual([1]);
    }
  });

  // Pages slower than 10 fps, the time following the ratio from the cap's to the floor's: the bar is the floor at least
  // 15 % of the cap's time under it (`sideGain`). Under the old clamp every row read 100 against 100 and went to the cap.
  it.each([
    ['CPU-bound: 250 ms a frame at the cap and at the floor', 250, 250, 1],
    ['170 ms at the cap, 150 ms at the floor (under the bar: 144.5 is not over 150)', 170, 150, 1],
    ['180 ms at the cap, 150 ms at the floor (over the bar: 153 is over 150)', 180, 150, 0.5],
    ['120 ms at the cap, 100 ms at the floor (over the bar: 102 is over 100)', 120, 100, 0.5],
  ])('AQ-17 fold, a page slower than 10 fps -- %s -- ends where the pixels say', (_what, capMs, floorMs, end) => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 120_000, (_at, r) => floorMs + (capMs - floorMs) * (r - 0.5) / 0.5);
    expect(t.pixelRatio()).toBeCloseTo(end, 9);
    expect(a.bound()).toBe(end === 1 ? 'not-pixels' : 'pixels');
  });

  // The side reading's own bound: 45 s after the floor was read the cap's check is long over; a page the reading saw
  // as helped is on its way back down by then, one it saw as not helped stands at the cap.
  it.each([
    ['under a second (900 ms at the cap, 450 ms at the floor): read as they are, the trade helps', 900, 450, 'pixels'],
    ['over a second (3 s at the cap, 1.5 s at the floor): each a second, a stall and no rate -- alike', 3000, 1500, 'not-pixels'],
  ] as const)('AQ-17: the side test reads a frame up to a second -- %s', (_what, capMs, floorMs, bound) => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    const page = (_at: number, r: number): number => floorMs + (capMs - floorMs) * (r - 0.5) / 0.5;
    sim(a, t, 600_000, page, () => a.bound() !== 'unknown');             // to the floor's reading
    expect(t.pixelRatio()).toBe(1);                                       // back at the cap for its check
    sim(a, t, t.at + 45_000, page);
    expect(a.bound()).toBe(bound);
    if (bound === 'pixels') expect(t.pixelRatio()).toBeLessThan(1);
    else expect(t.pixelRatio()).toBe(1);
  });

  // AQ-18 (the release review of v0.4.20's batch, 2026-11-11; a browser adaptation, no original): no side test on a
  // software rasteriser (`sideTest: false`; `./autoQuality` `CLASS_SIDE_TEST_ADAPTATION`). Its frame time follows the
  // pixels, so the floor is where a slow page belongs; the test's return to the cap is a drawing buffer of four times
  // the pixels -- sixteen after a raised cap, the field row of that day (Microsoft Basic Render Driver: the ratio went
  // 0.38 -> 1.5 and the context was lost seconds later). Model pages through the class, not recorded frames: the
  // replay's legs are CPU-bound, and a replay says nothing true of a page the pixels bind.
  const NO_SIDE = { ...ADAPTIVE_V2_ADAPTATION, sideTest: false } as const;
  /** A page the pixels bind: `floorMs` a frame at half of `cap`, `capMs` at it, linear in the ratio (and on past the cap). */
  const pixelPage = (cap: number, capMs: number, floorMs: number) => (_at: number, r: number): number => floorMs + (capMs - floorMs) * (r - cap / 2) / (cap / 2);

  it.each([
    ['the rendered run\'s page (260 ms a frame at the cap, 115 ms at the floor)', 260, 115, 120_000],
    ['a page faster than 10 fps (60 ms at the cap, 40 ms at the floor)', 60, 40, 120_000],
    ['a page slower than 0.85 s at its floor (3 s at the cap, 900 ms at the floor: read as not helped, and re-tested at 60, 120, 240 s)', 3000, 900, 900_000],
  ])('AQ-18: with the side test off %s goes to its floor and never returns to the cap', (_what, capMs, floorMs, until) => {
    const a = new AdaptiveRatio(1, NO_SIDE), t = target();
    a.start(t);
    sim(a, t, until, pixelPage(1, capMs, floorMs));
    expect(t.pixelRatio()).toBeCloseTo(0.5, 9);
    expect(ratios(t).slice(1).every((r) => r < 1)).toBe(true);            // after `start`'s cap, never the cap again
    expect(a.bound()).toBe('unknown');
  });

  it('AQ-18: with the side test off a cap raised over a page at its floor moves nothing -- 0.375 under a cap raised 0.75 -> 1.5 (the field row\'s ratios)', () => {
    const a = new AdaptiveRatio(0.75, NO_SIDE), t = target();
    a.start(t);
    const page = pixelPage(0.75, 220, 60);
    sim(a, t, 60_000, page);
    expect(t.pixelRatio()).toBeCloseTo(0.375, 9);
    const changes = t.set.length;
    a.setCap(1.5);                                                        // the preset to Quality on a 150 % display
    sim(a, t, t.at + 60_000, page);
    expect(t.set.length).toBe(changes);
    expect(t.pixelRatio()).toBeCloseTo(0.375, 9);
  });

  it('AQ-18: `sideTest: true` is the side test as it was -- the rendered run\'s page takes the same changes as under the default options', () => {
    const changes = (opts?: ConstructorParameters<typeof AdaptiveRatio>[1]): [number, number][] => {
      const a = new AdaptiveRatio(1, opts), t = target();
      a.start(t);
      sim(a, t, 120_000, pixelPage(1, 260, 115));
      return t.set;
    };
    expect(changes({ ...ADAPTIVE_V2_ADAPTATION, sideTest: true })).toEqual(changes());
    expect(changes().some(([at, r]) => at > 0 && r === 1)).toBe(true);    // and under them that page does visit the cap
  });

  it('AQ-17: the page of the rendered run (pixel-bound and slower than 10 fps at its floor: 260 ms a frame at the cap, 115 ms at the floor), handed its real frame times, ends at the floor with the trade found to help', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    let low = 0;
    sim(a, t, 100_000, (_at, r) => { const ms = 115 + 145 * (r - 0.5) / 0.5; if (r <= 0.5 + 1e-9) low += ms; return ms; });
    expect(t.pixelRatio()).toBeCloseTo(0.5, 9);
    expect(a.bound()).toBe('pixels');
    expect(low / t.at).toBeGreaterThan(0.5);
  });

  it('AQ-8 fold 4, its cost: a GPU-bound page (55 ms at the cap, 24 ms at the floor, linear between) still ends at the floor, with exactly one return to the cap for the comparison', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    const gpu = (_at: number, r: number): number => 24 + (55 - 24) * (r - 0.5) / 0.5;
    let floorAt = -1, above = 0, last = 0;
    sim(a, t, 300_000, (at, r) => {
      if (floorAt < 0 && r === 0.5) floorAt = at;
      if (floorAt >= 0 && r > 0.5) above += at - last;                   // time above the floor once it was first reached
      last = at;
      return gpu(at, r);
    });
    const r = ratios(t);
    expect(r.filter((x) => x === 1)).toHaveLength(2);                     // the start and ONE return to the cap
    expect(r.at(-1)).toBe(0.5);                                           // and the floor, to stay
    expect(a.bound()).toBe('pixels');
    const back = r.lastIndexOf(1);
    expect(r.slice(back + 1).every((x, i, s) => i === 0 ? x < 1 : x < s[i - 1]!)).toBe(true);   // only down after it
    expect(r.slice(back + 1).at(-1)).toBe(0.5);
    // The comparison's cost: seconds above the floor after first reaching it (the return, the cap's read, the way down).
    // 15.95 s measured: the return, 2 s for the cap's frames to settle and 2 s of its read, then the way back down.
    expect(above / 1000).toBeGreaterThan(15.9);
    expect(above / 1000).toBeLessThan(16);
  });
});

describe('CPS-4a (CPS.R7, a browser adaptation): AdaptiveRatio.setCap -- the render scale\'s cap, under which the ratio still trades', () => {
  const run = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number, hold = false): void => {
    for (let i = 0; i < n; i++) { t.at += ms; a.frame(ms / 1000, t.at, t, hold); }
  };
  const ratios = (t: ReturnType<typeof target>): number[] => t.set.map(([, r]) => r);
  /** AQ-8: `n` slow frames the floor helps (60 ms above `floor`, 40 ms at it), so the trade stands at the floor. */
  const slow = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, floor: number): void => {
    for (let i = 0; i < n; i++) { const ms = t.pixelRatio() > floor + 1e-9 ? 60 : 40; t.at += ms; a.frame(ms / 1000, t.at, t, false); }
  };

  it('a lowered cap takes the ratio down at the next tick, held page or not; slow frames still trade below it, to its floor (VS-3: half the cap)', () => {
    const a = new AdaptiveRatio(2), t = target();
    a.start(t);
    run(a, t, 300, 16);                                              // 60 fps: no trade
    a.setCap(1);
    expect(a.ratioCap()).toBe(1);
    expect(ratios(t)).toEqual([2]);                                  // nothing before the tick
    run(a, t, 13, 16, true);                                         // one 200 ms tick, the page held (the PS2 frame)
    expect(ratios(t)).toEqual([2, 1]);
    slow(a, t, 600, 0.5);                                            // slow: under the cap, to its floor
    expect(ratios(t).at(-1)).toBe(0.5);
    expect(ratios(t).every((r) => r <= 2)).toBe(true);
  });

  it("a raised cap: a ratio standing at the old cap follows it up at the next tick; one the frames had lowered climbs back by the new cap's steps", () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    a.setCap(1.5);
    run(a, t, 13, 16);                                               // in the band
    expect(ratios(t)).toEqual([1, 1.5]);
    run(a, t, 14, 50);                                               // a panic: two steps of 0.075
    expect(ratios(t)).toHaveLength(3);
    expect(ratios(t)[2]).toBeCloseTo(1.35, 9);
    t.set.length = 0;
    a.setCap(2);
    run(a, t, 13, 16);                                               // below the old cap: no jump
    expect(t.set).toEqual([]);
    run(a, t, 6000, 8);                                              // under the band: the steps (0.1 each), to the new cap
    const r = ratios(t);
    expect(r[0]).toBeCloseTo(1.4, 9);                                // 2 - 6 x 0.1, on the new cap's grid
    expect(r.at(-1)).toBe(2);
    for (let i = 1; i < r.length; i++) expect(r[i]! - r[i - 1]!).toBeCloseTo(0.1, 9);
  });

  it('Review focus 3: the device ratio changing mid-match (a window moved to another display) moves the cap through renderCapForV2 and the percent holds', () => {
    // Render scale 75 % at the native ceiling: a ratio-1 display's cap 0.75, a ratio-2 display's 1.5, back to 0.75.
    const cap = (dpr: number): number => renderCapForV2(75, 0, dpr, false, 1920, 1080).ratioCap;
    const a = new AdaptiveRatio(cap(1)), t = target();
    a.start(t);
    run(a, t, 13, 16);
    a.setCap(cap(2));                                                // the viewport watcher's fit, on the new display
    run(a, t, 13, 16);
    expect(ratios(t)).toEqual([0.75, 1.5]);
    expect(ratios(t).at(-1)! / pixelRatioCap(2, false)).toBe(0.75);  // still 75 % of the device's cap
    a.setCap(cap(1));
    run(a, t, 13, 16);
    expect(ratios(t)).toEqual([0.75, 1.5, 0.75]);
  });

  it('a cap below the old floor (a tall screen under Balanced) trades down to half of it; not a positive number is not a cap', () => {
    const a = new AdaptiveRatio(2 / 3), t = target(2);
    a.start(t);
    slow(a, t, 600, 1 / 3);
    expect(ratios(t)[0]).toBe(2 / 3);
    expect(ratios(t).at(-1)).toBe(1 / 3);
    a.setCap(0);                                                     // not a cap: ignored
    a.setCap(Number.NaN);
    expect(a.ratioCap()).toBe(2 / 3);
  });
});

describe('PAR-12: watchViewport -- the resize, the rotation and the phone browser bar (main.ts 1507-1512)', () => {
  /** A window and its visual viewport, their listeners counted. */
  const win = (visual: boolean) => {
    const live = new Map<string, Set<EventListener>>();
    const on = (scope: string) => ({
      addEventListener: (type: string, fn: EventListener) => { (live.get(`${scope}:${type}`) ?? live.set(`${scope}:${type}`, new Set()).get(`${scope}:${type}`)!).add(fn); },
      removeEventListener: (type: string, fn: EventListener) => { live.get(`${scope}:${type}`)?.delete(fn); },
    });
    const w: ViewportWindow = { ...on('window'), visualViewport: visual ? on('visual') : null };
    const fire = (key: string): void => { for (const fn of [...(live.get(key) ?? [])]) fn(new Event('x')); };
    const count = (): number => [...live.values()].reduce((n, s) => n + s.size, 0);
    return { w, fire, count };
  };

  it("viewport changes and the touch dock call fit; teardown removes every listener", () => {
    const { w, fire, count } = win(true);
    let fits = 0;
    const stop = watchViewport(w, () => { fits++; });
    expect(count()).toBe(4);
    fire('window:resize'); fire('window:orientationchange'); fire('visual:resize'); fire('window:s2u-picture-resize');
    expect(fits).toBe(4);
    stop();
    expect(count()).toBe(0);
    fire('window:resize'); fire('visual:resize'); fire('window:s2u-picture-resize');
    expect(fits).toBe(4);
  });

  it('a window without a visual viewport: every window listener is taken off', () => {
    const { w, count } = win(false);
    const stop = watchViewport(w, () => {});
    expect(count()).toBe(3);
    stop();
    expect(count()).toBe(0);
  });
});

describe("PAR-12: the contract's pixel ratio (./matchRenderer)", () => {
  it("ratioTargetOf: the renderer when it has setPixelRatio and pixelRatio; null for the tests' fakes", () => {
    const base = { render: () => {}, resize: () => {}, setClearColor: () => {}, renderer: { autoClear: true, render: () => {}, getDrawingBufferSize: (v: never) => v } };
    const withRatio: MatchRenderer = { ...base, setPixelRatio: () => {}, pixelRatio: () => 1 };
    expect(ratioTargetOf(withRatio)).toBe(withRatio);
    expect(ratioTargetOf(base)).toBeNull();
    expect(ratioTargetOf(null)).toBeNull();
  });
});

// AQ-17: the three pages that run the scale (the test room, the match, the Forge) each hand it the frame's real seconds,
// never the `dt` their camera steps by (clamped at 0.1 s: "a backgrounded tab must not teleport the camera").
describe('AQ-17: every page hands the dynamic render scale the frame\'s real time', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
  it.each(['main.ts', 'matchMount.ts', 'forge/page.ts'])('%s: `adaptiveRatio.frame` is given the real seconds, not the clamped `dt`', (f) => {
    const calls = src(f).match(/adaptiveRatio\.frame\(([^,]+),/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^adaptiveRatio\.frame\((frameTime\.real\(\)|realDt),$/);
  });
});
