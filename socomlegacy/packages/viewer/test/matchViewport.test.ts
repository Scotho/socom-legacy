import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADAPT_EVERY_MS_ADAPTATION, AdaptiveRatio, PIXEL_RATIO_CAP_ADAPTATION, PIXEL_RATIO_FLOOR_ADAPTATION, pixelRatioCap, TOUCH_PIXEL_RATIO_CAP_ADAPTATION,
  watchViewport, type RatioTarget, type ViewportWindow,
} from '../src/matchViewport';
import { ratioTargetOf, type MatchRenderer } from '../src/matchRenderer';

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

describe('PAR-12: AdaptiveRatio -- main.ts adapt, its smoothing and its 200 ms tick', () => {
  /** `n` frames of `ms` each through the policy, the clock at `t.at`. */
  const run = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number, hold = false): void => {
    for (let i = 0; i < n; i++) { t.at += ms; a.frame(ms / 1000, t.at, t, hold); }
  };

  it('starts at the cap; long frames step it down 0.25 at a time to the floor 0.75, short ones back up to the cap, at most once every 2 s', () => {
    const a = new AdaptiveRatio(2), t = target();
    a.start(t);
    expect(t.set).toEqual([[0, 2]]);
    run(a, t, 300, 40);                                              // 12 s of 25 fps
    expect(t.set.map(([, r]) => r)).toEqual([2, 1.75, 1.5, 1.25, 1, 0.75]);
    for (let i = 2; i < t.set.length; i++) expect(t.set[i]![0] - t.set[i - 1]![0]).toBeGreaterThanOrEqual(ADAPT_EVERY_MS_ADAPTATION);
    t.set.length = 0;
    run(a, t, 1500, 8);                                              // 12 s of 125 fps
    expect(t.set.map(([, r]) => r)).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(t.set.every(([, r]) => r <= 2)).toBe(true);
  });

  it('frames between 12 and 24 ms leave it; a held page (a map arriving, the PS2 frame, the loading hold) is never changed', () => {
    const a = new AdaptiveRatio(1.5), t = target();
    a.start(t);
    run(a, t, 300, 16);
    expect(t.set).toEqual([[0, 1.5]]);
    run(a, t, 300, 50, true);
    expect(t.set).toEqual([[0, 1.5]]);
    expect(a.smoothedMs()).toBeGreaterThan(24);                       // the readout still follows the frames
  });

  it("smooths the frame time as main.ts's readout does (x 0.08 a frame from 16.7 ms) and ticks every 200 ms; no frame time, no tick", () => {
    const a = new AdaptiveRatio(2), t = target(2);
    expect(a.smoothedMs()).toBeCloseTo(16.7, 6);
    expect(a.frame(0.0167, 100, t, false)).toBe(false);                  // within 200 ms of the start
    expect(a.frame(0.05, 250, t, false)).toBe(true);                     // the tick: the readout and the check
    expect(a.smoothedMs()).toBeCloseTo(16.7 + (16.7 - 16.7) * 0.08 + (50 - 16.7) * 0.08, 6);
    expect(a.frame(0, 900, t, false)).toBe(false);                       // a zero step: neither
    expect(a.frame(0.016, 300, null, false)).toBe(false);                // no tick within 200 ms of the last
  });
});

describe('CPS-4a (CPS.R7, a browser adaptation): AdaptiveRatio.setCap -- the render scale\'s cap, under which the ratio still trades', () => {
  const run = (a: AdaptiveRatio, t: ReturnType<typeof target>, n: number, ms: number, hold = false): void => {
    for (let i = 0; i < n; i++) { t.at += ms; a.frame(ms / 1000, t.at, t, hold); }
  };

  it('a lowered cap takes the ratio down at the next tick, held page or not; slow frames still trade below it, to the floor', () => {
    const a = new AdaptiveRatio(2), t = target();
    a.start(t);
    run(a, t, 300, 16);                                              // 60 fps: no trade
    a.setCap(1);
    expect(a.ratioCap()).toBe(1);
    expect(t.set.map(([, r]) => r)).toEqual([2]);                     // nothing before the tick
    run(a, t, 13, 16, true);                                         // one 200 ms tick, the page held (the PS2 frame)
    expect(t.set.map(([, r]) => r)).toEqual([2, 1]);
    run(a, t, 300, 40);                                              // 12 s of 25 fps: under the cap, to the floor
    expect(t.set.map(([, r]) => r)).toEqual([2, 1, 0.75]);
    expect(t.set.every(([, r]) => r <= 2)).toBe(true);
  });

  it('a raised cap: a ratio standing at the old cap follows it up at the next tick; one the frames had lowered climbs back by the steps', () => {
    const a = new AdaptiveRatio(1), t = target();
    a.start(t);
    a.setCap(1.5);
    run(a, t, 13, 16);                                               // 60 fps, which never asks for more (12 ms)
    expect(t.set.map(([, r]) => r)).toEqual([1, 1.5]);
    run(a, t, 300, 40);                                              // traded down: 1.25, 1, 0.75
    expect(t.set.map(([, r]) => r)).toEqual([1, 1.5, 1.25, 1, 0.75]);
    t.set.length = 0;
    a.setCap(2);
    run(a, t, 13, 40);                                               // below the old cap: no jump
    expect(t.set).toEqual([]);
    run(a, t, 1500, 8);                                              // fast: the steps, to the new cap
    expect(t.set.map(([, r]) => r)).toEqual([1, 1.25, 1.5, 1.75, 2]);
  });

  it('a cap below the floor (a tall screen under Balanced) is the ratio; slow frames have nothing below it to take', () => {
    const a = new AdaptiveRatio(2 / 3), t = target(2);
    a.start(t);
    run(a, t, 300, 40);
    expect(t.set.map(([, r]) => r)).toEqual([2 / 3]);
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
