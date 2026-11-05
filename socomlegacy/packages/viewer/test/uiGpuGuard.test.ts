import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, type RasterOptions, type UiTextures } from '../src/uiCompositorView';
import { planFrame } from '../src/uiFramePlan';
import {
  UI_GPU_GUARD_SAMPLE_ADAPTATION, UI_GPU_GUARD_TRIP_ADAPTATION, UiGpuGuard, boundExcess, exactClassDiffs, uiGpuExactMask,
  type UiGpuGuardBound, type UiGpuIdleDeadline,
} from '../src/uiGpuGuard';
import { GpuUiPresenter, UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UiGpuSwitch } from '../src/uiGpuSwitch';
import { executeFramePlanOnTwin } from '../src/uiGpuTwin';
import { createUiGpuBackend } from '../src/uiGpuWebgl2';
import { CpuUiPresenter, type UiPresentProbe } from '../src/uiPresenter';
import { fakeGl, type Fake, type FakeGlOptions } from './uiGpuFakeGl';
import { UI_RASTER_CASES, UI_RASTER_CASE_MODES, caseRasterInputs } from './uiRasterCases';

// GM-16 (plan 2026-11-01-gpu-menus, row GM-16; GM.R5, GM.R6, GM.R11; the parity contract, research 380 §1; research 380
// §5): the guard and shadow mode -- PRODUCT TRACK, a browser instrument with no original that decides no pixel of
// either drawer. Shadow: the page shows the SOFTWARE frame (today's bytes, on the 2D canvas) while the same draw list is
// drawn on the GPU into the frame target (an offscreen framebuffer; the GPU canvas is never presented to), read back
// asynchronously (a pack buffer and a fence), and compared off the animation frame (an idle callback): the exact class
// (the twin's E/E* mask, built from the plan) must hold 0 differing pixels, the rest is B (max |Δ| per channel, pixels at
// |Δ| >= 1, 2, 3), recorded with `UNMASKED_RENDERER_WEBGL`. A trip escalates the surface to `exact` (GM.R5, GM.R6); a
// trip at `exact`, or the trip limit, ends the GPU path for the session (L3, the switch's `guard-trip`).
// Evidence kind: unit tests on the fake WebGL2 context (`./uiGpuFakeGl.ts`: its fence and pack buffer are a model of
// WebGL 2.0's rules, not a GPU). The rendered run is the box's (`e2e/uiGpuPerf.spec.ts`'s GPU leg; GM-16b's dev shadow).

const clearItem = (rgb: [number, number, number]): UiDrawItem => ({ kind: 'clear', rgb });
/**
 * Two frames' bytes: their lengths and how many bytes differ (box fold: vitest's `toEqual` walks a typed array element
 * by element through its generic equality -- 9.3 s on a 2x frame's 4.6 M bytes -- so frames are compared here, the
 * assertion as strong: equal lengths and 0 differing bytes).
 */
const byteDiff = (a: ArrayLike<number>, b: ArrayLike<number>): { lengths: [number, number]; differ: number } => {
  let differ = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) differ++;
  return { lengths: [a.length, b.length], differ };
};
const noTextures: UiTextures = () => null;
const GPU_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';

/** The 2D canvas's context, as the software presenter puts frames on it: each put recorded. */
const target2d = () => {
  const puts: Uint8ClampedArray[] = [];
  return {
    puts,
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img: { data: Uint8ClampedArray }) => { puts.push(img.data.slice()); },
  };
};
type Target = ReturnType<typeof target2d>;

/** The software presenter of the page, with the reference it hands the guard changed at `byte` by `by` (a planted diff). */
class PlantedSoftware extends CpuUiPresenter {
  constructor(t: Target, private readonly byte: number, private readonly by: (v: number) => number) { super(t as unknown as ConstructorParameters<typeof CpuUiPresenter>[0]); }
  override takeFrame(): Rgba | null {
    const f = super.takeFrame();
    if (!f) return f;
    const data = f.data.slice();
    data[this.byte] = this.by(data[this.byte]!);
    return { width: f.width, height: f.height, data };
  }
}

/** Idle callbacks run when the test says, each with the time it gives. */
class Idle {
  readonly queue: ((d: UiGpuIdleDeadline) => void)[] = [];
  readonly schedule = (fn: (d: UiGpuIdleDeadline) => void): void => { this.queue.push(fn); };
  /** The callbacks queued now, once each (one a callback queues runs on the next call). */
  runOnce(ms = 50): number { const fns = this.queue.splice(0); for (const fn of fns) fn({ timeRemaining: () => ms }); return fns.length; }
  /** Until nothing is queued (at most `n` rounds). */
  drain(n = 1000): void { for (let i = 0; i < n && this.queue.length; i++) this.runOnce(); }
}

interface Rig { f: Fake; s: UiGpuSurfacePresenter; swi: UiGpuSwitch; idle: Idle; target: Target; clock: { t: number }; shown: string[]; logs: string[] }

const rig = (o: { search?: string; software?: (t: Target) => CpuUiPresenter; bound?: UiGpuGuardBound | null; fo?: FakeGlOptions; so?: Partial<UiGpuSurfaceOptions> } = {}): Rig => {
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...o.fo });
  const target = target2d();
  const software = o.software ? o.software(target) : new CpuUiPresenter(target as unknown as ConstructorParameters<typeof CpuUiPresenter>[0]);
  const swi = new UiGpuSwitch({ search: o.search ?? '?uiGpu=shadow', storage: () => null, devTools: false });
  const idle = new Idle(), clock = { t: 1000 }, shown: string[] = [], logs: string[] = [];
  const s = new UiGpuSurfacePresenter({
    canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software, transparent: false, surface: 'front',
    clock: { now: () => clock.t, setTimeout: () => 0, clearTimeout: () => {} }, host: swi, blend: (scale) => swi.blend('front', scale),
    shown: (w) => shown.push(w), log: (l) => logs.push(l), idle: idle.schedule, guardBound: o.bound ?? null, ...o.so,
  });
  return { f, s, swi, idle, target, clock, shown, logs };
};

/** One shadow frame of `items` at 2x (an HD scale: the table's blend is `ff`), then the GPU caught up and the guard run. */
const shadowFrame = (r: Rig, items: readonly UiDrawItem[], textures: UiTextures = noTextures, options: RasterOptions = { scale: 2 }, probe?: UiPresentProbe | null): void => {
  r.s.present(items, textures, options, probe);
  r.f.fences.signal();
  r.idle.drain();
};

describe('GM-16: the exact class is built from the plan, equal to the twin\'s mask (E/E*, research 380 §1)', () => {
  // Every GM-03 case at 1x, 2x and 4x (review F4), both frame modes, both blends: `uiGpuExactMask` (rectangles, no arithmetic) equals
  // the twin's `exact` (the mask the parity spec holds at 0 differing pixels), so the guard holds the same pixels.
  // Box fold: one test a case and a scale (the twin at 4x is the heavy piece), each well under vitest's 5 s.
  for (const c of UI_RASTER_CASES) for (const scale of [1, 2, 4] as const) {
    it(`case ${c.key} at ${scale}x: uiGpuExactMask(plan) === executeFramePlanOnTwin(plan).exact`, () => {
      for (const mode of UI_RASTER_CASE_MODES) for (const blend of ['ff', 'exact'] as const) {
        const { items, textures, options } = caseRasterInputs(c, scale, mode);
        const plan = planFrame(items, textures, { scale, transparent: mode === 'transparent', hd: options.hd, movie: options.movie, blend });
        const mask = uiGpuExactMask(plan), twin = executeFramePlanOnTwin(plan).exact;
        expect(mask.length, `${c.key} ${scale}x ${mode} ${blend}`).toBe(twin.length);
        let differ = 0;
        for (let i = 0; i < mask.length; i++) if (mask[i] !== twin[i]) differ++;
        expect(differ, `${c.key} ${scale}x ${mode} ${blend}: pixels whose class differs`).toBe(0);
      }
    });
  }

  it('the class is real: a clear is all in it, a textured quad takes its pixels out', () => {
    const clear = planFrame([clearItem([1, 2, 3])], noTextures, { scale: 1 });
    expect(uiGpuExactMask(clear).every((v) => v === 1)).toBe(true);
    const c6 = UI_RASTER_CASES.find((c) => c.id === 6)!;
    const { items, textures, options } = caseRasterInputs(c6, 1, 'opaque');
    const m = uiGpuExactMask(planFrame(items, textures, { scale: 1, hd: options.hd, movie: options.movie }));
    expect(m.includes(0)).toBe(true);
    expect(m.includes(1)).toBe(true);
  });
});

describe('GM-16: the exact-class diffs and the B statistics', () => {
  const frame = (w: number, h: number, v: number): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });

  it('counts the exact class\'s differing pixels apart from B: max |Δ| per channel, pixels at |Δ| >= 1, 2, 3', () => {
    const a = frame(4, 2, 100), b = frame(4, 2, 100);
    const mask = new Uint8Array(8).fill(1);
    mask[5] = 0; mask[6] = 0;
    b.data[0] = 101;                 // pixel 0 (in the class), R by 1
    b.data[5 * 4 + 1] = 103;         // pixel 5 (B), G by 3
    b.data[6 * 4 + 3] = 98;          // pixel 6 (B), A by 2
    const s = exactClassDiffs(a, b, mask);
    expect(s).toMatchObject({ pixels: 8, differing: 3, exactPixels: 6, exactDiffering: 1, maxAbs: [1, 3, 0, 2], atLeast: [3, 2, 1] });
    expect(s.first).toEqual({ x: 0, y: 0, channel: 0, gpu: 100, software: 101, exact: true });
  });

  it('a bound is exceeded by any channel\'s max |Δ| or any count over it; none, nothing to exceed', () => {
    const s = exactClassDiffs(frame(2, 1, 0), { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 2, 0, 0, 0, 0, 0]) }, new Uint8Array([0, 0]));
    expect(boundExcess(s, { maxAbs: [2, 2, 2, 2], atLeast: [1, 1, 1] })).toEqual([]);
    expect(boundExcess(s, { maxAbs: [2, 2, 1, 2], atLeast: [1, 1, 1] })).toEqual(['max |Δ| B 2 > 1']);
    expect(boundExcess(s, { maxAbs: [2, 2, 2, 2], atLeast: [1, 0, 1] })).toEqual(['pixels at |Δ| >= 2: 1 > 0']);
  });
});

describe('GM-16: the asynchronous read-back (a pack buffer and a fence; never a stall)', () => {
  it('readPixels into a pack buffer, a fence after it; nothing read until the fence signals; the frame as it was then', () => {
    const f = fakeGl();
    const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false })!;
    b.compilePrograms();
    const p = new GpuUiPresenter(b);
    p.present([clearItem([10, 20, 30])], noTextures, { scale: 1 });
    const want = b.readPixels();
    const rb = b.beginReadback();
    const names = f.names();
    const at = names.lastIndexOf('readPixels');
    expect(names.indexOf('fenceSync', at)).toBeGreaterThan(at);
    expect(names.indexOf('flush', at)).toBeGreaterThan(at);
    // A later frame does not reach what was read (the read is ordered before it on the GPU).
    p.present([clearItem([90, 80, 70])], noTextures, { scale: 1 });
    expect(rb.poll()).toBe('pending');
    expect(rb.poll()).toBe('pending');
    expect(f.names().filter((n) => n === 'getBufferSubData')).toEqual([]);
    f.fences.signal();
    const got = rb.poll();
    expect(got).not.toBe('pending');
    expect(byteDiff((got as Rgba).data, want.data)).toEqual({ lengths: [want.data.length, want.data.length], differ: 0 });
    expect(f.fences.readEarly).toBe(0);
    expect(f.fences.waits).toBe(0);
    expect(f.names().slice(-4)).toEqual(expect.arrayContaining(['deleteSync', 'deleteBuffer']));
    expect(f.fences.list.every((x) => x.deleted)).toBe(true);
  });

  it('a read-back whose context was lost answers lost and makes no call', () => {
    const f = fakeGl();
    const b = createUiGpuBackend(f.canvas as unknown as HTMLCanvasElement, { transparent: false })!;
    b.compilePrograms();
    new GpuUiPresenter(b).present([clearItem([1, 2, 3])], noTextures, { scale: 1 });
    const rb = b.beginReadback();
    f.loss.lose();
    expect(rb.poll()).toBe('lost');
    expect(f.loss.whileLost).toEqual([]);
  });
});

describe('GM-16: shadow mode -- the page shows the software frame; the GPU draws offscreen', () => {
  it('the software frame is put on the 2D canvas, byte for byte today\'s; the GPU canvas is never presented to', () => {
    const r = rig();
    const items = [clearItem([10, 20, 30])];
    r.s.present(items, noTextures, { scale: 2 });
    const want = rasterizeUiDrawList(items, noTextures, { scale: 2 }).frame.data;
    expect(r.target.puts.length).toBe(1);
    expect(byteDiff(r.target.puts[0]!, want)).toEqual({ lengths: [want.length, want.length], differ: 0 });
    // The GPU drew the frame into its frame target (an offscreen framebuffer) and nothing onto the canvas.
    expect(r.f.clears.some((c) => c.target === 'fbo')).toBe(true);
    expect(r.f.clears.some((c) => c.target === 'default')).toBe(false);
    expect(r.f.names()).not.toContain('blitFramebuffer');
    expect(r.s.lastPath).toBe('software');
    expect(r.shown.at(-1)).toBe('software');
    expect(r.s.stats.frames).toMatchObject({ shadow: 1, L0: 0, L1: 0 });
  });

  it('the guard runs off the animation frame: nothing read or compared in present; the idle callback does it', () => {
    const r = rig();
    const guarded: number[] = [];
    const probe: UiPresentProbe = { now: () => r.clock.t, rendered: () => {}, guarded: (ms) => { guarded.push(ms); } };
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 2 }, probe);
    expect(r.f.names()).not.toContain('getBufferSubData');
    expect(r.s.guard!.records).toEqual([]);
    expect(guarded).toEqual([]);                              // the frame's own work is not the guard's
    expect(r.idle.queue.length).toBe(1);
    r.idle.runOnce();                                          // the fence has not signalled: nothing read, polled again later
    expect(r.f.names()).not.toContain('getBufferSubData');
    expect(guarded).toEqual([]);                              // a poll is not the compare: no frame is marked for it
    expect(r.idle.queue.length).toBe(1);
    r.f.fences.signal();
    r.idle.drain();
    expect(r.f.fences.readEarly).toBe(0);
    expect(r.s.guard!.records.length).toBe(1);
    expect(guarded.length).toBeGreaterThan(0);               // the compare's slices reported to the frame ring (excluded from lostSeconds)
    const rec = r.s.guard!.records[0]!;
    expect(rec.trip).toBeNull();
    expect(rec.stats.exactDiffering).toBe(0);
    expect(rec.stats.exactPixels).toBe(1280 * 896);
  });

  it('B statistics are recorded with UNMASKED_RENDERER_WEBGL, the plan\'s hash, scale and blend', () => {
    const r = rig();
    shadowFrame(r, [clearItem([10, 20, 30])]);
    const rec = r.s.guard!.records[0]!;
    expect(rec).toMatchObject({ surface: 'front', renderer: GPU_RENDERER, rendererSource: 'unmasked', scale: 2, blend: 'ff', transparent: false });
    expect(rec.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec.stats.maxAbs).toEqual([0, 0, 0, 0]);
    expect(rec.stats.atLeast).toEqual([0, 0, 0]);
    expect(r.swi.readout().guard.compares).toBe(1);
  });

  it('a masked renderer is recorded as such (rendererSource renderer), never as a GPU', () => {
    const r = rig({ fo: { unmaskedRenderer: undefined, renderer: 'WebKit WebGL' } });
    shadowFrame(r, [clearItem([10, 20, 30])]);
    expect(r.s.guard!.records[0]).toMatchObject({ renderer: 'WebKit WebGL', rendererSource: 'renderer' });
  });

  it('samples by UI_GPU_GUARD_SAMPLE_ADAPTATION: one compare in flight; the same frame again only after repeatMs, a new one after gapMs', () => {
    const r = rig();
    const S = UI_GPU_GUARD_SAMPLE_ADAPTATION;
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 2 });
    r.s.present([clearItem([11, 20, 30])], noTextures, { scale: 2 });   // one in flight: not sampled
    expect(r.f.names().filter((n) => n === 'fenceSync').length).toBe(1);
    r.f.fences.signal(); r.idle.drain();
    r.clock.t += S.gapMs - 1;
    r.s.present([clearItem([12, 20, 30])], noTextures, { scale: 2 });   // too soon after the last
    r.clock.t += 1;
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 2 });   // the frame compared already: not before repeatMs
    expect(r.f.names().filter((n) => n === 'fenceSync').length).toBe(1);
    r.s.present([clearItem([13, 20, 30])], noTextures, { scale: 2 });   // a new frame, gapMs after: sampled
    expect(r.f.names().filter((n) => n === 'fenceSync').length).toBe(2);
    r.f.fences.signal(); r.idle.drain();
    r.clock.t += S.repeatMs;
    r.s.present([clearItem([13, 20, 30])], noTextures, { scale: 2 });   // the same frame, repeatMs after: sampled again
    expect(r.f.names().filter((n) => n === 'fenceSync').length).toBe(3);
  });
});

describe('GM-16: trips -- a planted diff, the bound, escalation to exact, the session kill', () => {
  // Pixel (10, 10) of the 1280-wide 2x frame, its red byte.
  const BYTE = (10 * 1280 + 10) * 4;

  it('a planted 1-byte diff in the exact class trips (E/E*: 0 bytes) and escalates the surface to exact (GM.R5, GM.R6)', () => {
    const r = rig({ software: (t) => new PlantedSoftware(t, BYTE, (v) => v ^ 1) });
    expect(r.swi.blend('front', 2)).toBe('ff');
    shadowFrame(r, [clearItem([10, 20, 30])]);
    const rec = r.s.guard!.records[0]!;
    expect(rec.trip).toBe('exact');
    expect(rec.stats).toMatchObject({ exactDiffering: 1, differing: 1, maxAbs: [1, 0, 0, 0] });
    expect(rec.stats.first).toMatchObject({ x: 10, y: 10, channel: 0, exact: true });
    expect(r.swi.blend('front', 2)).toBe('exact');            // the session's escalation, read by the next frame's plan
    expect(r.swi.readout().blend.front.hd).toBe('exact');
    expect(r.s.state).toBe('ready');                           // escalated, not killed: the GPU path goes on at exact
    expect(r.swi.readout().guard.trips.length).toBe(1);
    expect(r.logs.some((l) => /guard trip/.test(l))).toBe(true);
  });

  it('the next sampled frame is planned at exact; a trip at exact ends the GPU path for the session (L3, guard-trip)', () => {
    const r = rig({ software: (t) => new PlantedSoftware(t, BYTE, (v) => v ^ 1) });
    shadowFrame(r, [clearItem([10, 20, 30])]);
    r.clock.t += UI_GPU_GUARD_SAMPLE_ADAPTATION.gapMs;
    shadowFrame(r, [clearItem([20, 20, 30])]);
    const recs = r.s.guard!.records;
    expect(recs.map((x) => [x.blend, x.trip])).toEqual([['ff', 'exact'], ['exact', 'exact']]);
    expect(UI_GPU_GUARD_TRIP_ADAPTATION.killAt).toBeGreaterThanOrEqual(2);
    expect(r.s.state).toBe('dead');
    expect(r.swi.resolve('front', 2)).toMatchObject({ mode: 'off', source: 'session', reason: 'guard-trip' });
    expect(r.swi.readout().kills).toEqual([{ reason: 'guard-trip', surface: 'front' }]);
    expect(r.swi.readout().contexts).toBe(0);                 // the context let go
  });

  it('a B result over the bound trips and escalates the surface to exact; with no bound pinned it is recorded, not judged', () => {
    const c6 = UI_RASTER_CASES.find((c) => c.id === 6)!;
    const { items, textures, options } = caseRasterInputs(c6, 2, 'opaque');
    const plan = planFrame(items, textures, { scale: 2, hd: options.hd, movie: options.movie, blend: 'ff' });
    const outside = executeFramePlanOnTwin(plan).exact.indexOf(0);
    expect(outside).toBeGreaterThanOrEqual(0);
    const plant = (v: number): number => (v < 128 ? v + 5 : v - 5);   // 5 in one byte outside the exact class

    const judged = rig({ software: (t) => new PlantedSoftware(t, outside * 4, plant), bound: { maxAbs: [3, 3, 3, 3], atLeast: [1e9, 1e9, 1e9] } });
    shadowFrame(judged, items, textures, options);
    const a = judged.s.guard!.records[0]!;
    expect(a.stats.exactDiffering).toBe(0);
    expect(a.trip).toBe('bound');
    expect(a.why.some((w) => /max \|Δ\| R/.test(w))).toBe(true);
    expect(judged.swi.blend('front', 2)).toBe('exact');

    const unpinned = rig({ software: (t) => new PlantedSoftware(t, outside * 4, plant), bound: null });
    shadowFrame(unpinned, items, textures, options);
    const b = unpinned.s.guard!.records[0]!;
    expect(b.trip).toBeNull();
    expect(b.stats.maxAbs[0]).toBeGreaterThanOrEqual(4);
    expect(b.bound).toBeNull();
    expect(unpinned.swi.blend('front', 2)).toBe('ff');
  });

  it('a guard used alone: a lost read-back is dropped and counted, never compared', () => {
    const idle = new Idle();
    const g = new UiGpuGuard({ surface: 'front', now: () => 0, idle: idle.schedule, caps: () => null });
    const plan = planFrame([clearItem([1, 2, 3])], noTextures, { scale: 1 });
    g.submit({ readback: { poll: () => 'lost', cancel: () => {} }, reference: rasterizeUiDrawList([clearItem([1, 2, 3])], noTextures, { scale: 1 }).frame, plan });
    idle.drain();
    expect(g.records).toEqual([]);
    expect(g.counts).toMatchObject({ lost: 1, compared: 0 });
  });
});
