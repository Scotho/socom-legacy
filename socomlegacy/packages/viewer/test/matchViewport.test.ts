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
// drop of two steps after 6 frames over 33 ms; a climb of one step after 4 s at or under the target, its wait doubled
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

  it('the options: each the spec §4.4 item 4 value as amended, an adaptation', () => {
    expect(ADAPTIVE_V2_ADAPTATION).toEqual({
      targetMs: 16.7, ewma: 0.2, settleFrames: 8, stepShare: 0.05, floorShare: 0.5, panicFrames: 6, panicMs: 33,
      downShare: 1.44, improveEveryMs: 4000, climbSlack: 0.01, improveMaxMs: 64000, bounceWindowMs: 10000, holdResetMs: 30000,
    });
  });

  it.each([
    // [case, frame model, the ratio after 300 s, the ratio never moved]
    ['60 Hz steady', () => 1000 / 60, 1, true],
    ['60 Hz, one dropped frame every 5 s', hitches(1000 / 60, 5000), 1, true],
    ['60 Hz, one dropped frame every 30 s', hitches(1000 / 60, 30000), 1, true],
    ['steady 20 ms', () => 20, 1, true],
    ['steady 22 ms', () => 22, 1, true],
    ['30 Hz throttled (33.3 ms): the panic takes it to the floor, where it holds', () => 1000 / 30, 0.5, false],
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

  it('a two-step (panic) bounce: 33.4 ms at the cap, 16 ms below it -- the waits reach 64 s and stay; a held climb short of the bounce\'s ratio never resets them (900 s)', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    sim(a, t, 900_000, (_at, r) => (r > 0.975 ? 33.4 : 16));                                // one vsync missed at the cap: a panic
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

  it('a panic: 6 consecutive frames over 33 ms drop two steps at once, inside the 2 s; a fast frame between resets the count', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    run(a, t, 30, 16);
    run(a, t, 5, 40); run(a, t, 1, 16); run(a, t, 5, 40);               // never 6 in a row
    expect(ratios(t)).toEqual([1]);
    run(a, t, 1, 40);                                                    // the 6th in a row
    expect(ratios(t)).toEqual([1, 0.9]);                                 // two steps, one change
    expect(t.set[1]![0]).toBeLessThan(2000);
    run(a, t, 7, 40);                                                    // the next waits its 8 settled frames
    expect(ratios(t)).toEqual([1, 0.9]);
    run(a, t, 1, 40);
    expect(ratios(t)).toHaveLength(3);
    expect(ratios(t)[2]).toBeCloseTo(0.8, 9);
  });

  it('the floor is 50 % of the cap: long frames end there and never below it', () => {
    for (const cap of [1, 2, 1.5]) {
      const a = new AdaptiveRatio(cap), t = target();
      a.start(t);
      run(a, t, 600, 60);
      expect(ratios(t).at(-1), `${cap}`).toBe(cap * 0.5);
      expect(Math.min(...ratios(t))).toBe(cap * 0.5);
    }
  });

  it('the climb: frames at or under the target (vsync at 60 Hz included) climb one step every 4 s, back to the cap and never above it; frames over it do not', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    run(a, t, 600, 60);                                                  // to the floor
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

  it("setTarget(33.3) (a 30 fps frame cap): the edge moves to 47.95 ms and the panic to 65.8 ms; 34 and 45 ms frames leave it, 50 ms frames step, the cap's two-vsync frames (33.33 ms) climb back", () => {
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
});

describe('CPS-4a (CPS.R7, a browser adaptation): AdaptiveRatio.setCap -- the render scale\'s cap, under which the ratio still trades', () => {
  const run = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number, hold = false): void => {
    for (let i = 0; i < n; i++) { t.at += ms; a.frame(ms / 1000, t.at, t, hold); }
  };
  const ratios = (t: ReturnType<typeof target>): number[] => t.set.map(([, r]) => r);

  it('a lowered cap takes the ratio down at the next tick, held page or not; slow frames still trade below it, to its floor (VS-3: half the cap)', () => {
    const a = new AdaptiveRatio(2), t = target();
    a.start(t);
    run(a, t, 300, 16);                                              // 60 fps: no trade
    a.setCap(1);
    expect(a.ratioCap()).toBe(1);
    expect(ratios(t)).toEqual([2]);                                  // nothing before the tick
    run(a, t, 13, 16, true);                                         // one 200 ms tick, the page held (the PS2 frame)
    expect(ratios(t)).toEqual([2, 1]);
    run(a, t, 600, 60);                                              // slow: under the cap, to its floor
    expect(ratios(t).at(-1)).toBe(0.5);
    expect(ratios(t).every((r) => r <= 2)).toBe(true);
  });

  it("a raised cap: a ratio standing at the old cap follows it up at the next tick; one the frames had lowered climbs back by the new cap's steps", () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    a.setCap(1.5);
    run(a, t, 13, 16);                                               // in the band
    expect(ratios(t)).toEqual([1, 1.5]);
    run(a, t, 14, 40);                                               // a panic: two steps of 0.075
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
    run(a, t, 600, 60);
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
