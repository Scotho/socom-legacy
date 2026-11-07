import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, type RasterOptions, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
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
import { solid } from './uiRasterCases';
import { UiPerfProbe, UiPerfRing, summarizeUiPerf } from '../src/uiGpuPerf';
import type { UiGpuHdKeys } from '../src/uiGpuTextures';
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
  /** GM-14c: true only while an idle callback runs (the guard's raster is checked to run inside one, never in a frame). */
  inside = false;
  readonly schedule = (fn: (d: UiGpuIdleDeadline) => void): void => { this.queue.push(fn); };
  /** The callbacks queued now, once each (one a callback queues runs on the next call). */
  runOnce(ms = 50): number {
    const fns = this.queue.splice(0);
    for (const fn of fns) { this.inside = true; try { fn({ timeRemaining: () => ms }); } finally { this.inside = false; } }
    return fns.length;
  }
  /** Until nothing is queued (at most `n` rounds). */
  drain(n = 1000): void { for (let i = 0; i < n && this.queue.length; i++) this.runOnce(); }
}

interface Rig { f: Fake; s: UiGpuSurfacePresenter; swi: UiGpuSwitch; idle: Idle; target: Target; clock: { t: number }; shown: string[]; logs: string[] }

const rig = (o: { search?: string; devBuild?: boolean; software?: (t: Target) => CpuUiPresenter; bound?: UiGpuGuardBound | null; fo?: FakeGlOptions; so?: Partial<UiGpuSurfaceOptions> } = {}): Rig => {
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...o.fo });
  const target = target2d();
  const software = o.software ? o.software(target) : new CpuUiPresenter(target as unknown as ConstructorParameters<typeof CpuUiPresenter>[0]);
  const swi = new UiGpuSwitch({ search: o.search ?? '?uiGpu=shadow', storage: () => null, devTools: false, ...(o.devBuild === undefined ? {} : { devBuild: o.devBuild }) } as ConstructorParameters<typeof UiGpuSwitch>[0]);
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

// GM-14c (plan 2026-11-01-gpu-menus, row GM-14c; GM.R11; risk 17): the guard's like-for-like HD compare under `on` --
// PRODUCT TRACK, a dev and canary instrument (no original). Under `on` the page shows the GPU's frame, so no software frame
// at the shown scale exists: the guard rasters one (`rasterizeUiDrawList`, today's software path at the shown scale) in
// an idle callback of its own, from the frame's inputs as the frame read them (the bitmaps, the HD images resident then,
// the movie pictures), never asking the page's HD lookup again (no decode), and names the frame after that callback a
// guard frame (`UiPerfProbe.guarded`), so its lost time is listed (`guardFrames`) and kept out of `lostSeconds`. A
// surface made without `guardOn` -- every release surface -- does none of it. Evidence kind: unit tests on the fake
// WebGL2 context (`./uiGpuFakeGl.ts`, a model of the call contract, not a GPU); the rendered browser leg is the box's.
describe('GM-14c: the guard under `on` -- the shown scale\'s software frame rastered off the animation frame (GM.R11)', () => {
  // Pixel (10, 10) of the 2560-wide 4x frame, its red byte.
  const BYTE4 = (10 * 2560 + 10) * 4;

  /** The guard's reference raster (`UiGpuSurfaceOptions.guardReference`): counted, each call's place and scale kept, optionally planted. */
  const reference = (idle: Idle, o: { plant?: number; onCall?: () => void } = {}) => {
    const calls: { inside: boolean; scale: number }[] = [];
    const fn = (items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions): Rgba => {
      calls.push({ inside: idle.inside, scale: options.scale ?? 1 });
      o.onCall?.();
      const f = rasterizeUiDrawList(items, textures, options).frame;
      if (o.plant === undefined) return f;
      const data = f.data.slice();
      data[o.plant] = data[o.plant]! ^ 1;
      return { width: f.width, height: f.height, data };
    };
    return { calls, fn };
  };

  const onRig = (o: { plant?: number; onCall?: () => void; guardOn?: boolean; search?: string; so?: Partial<UiGpuSurfaceOptions> } = {}) => {
    const idle = new Idle();
    const ref = reference(idle, o);
    const r = rig({ search: o.search ?? '?uiGpu=on', so: { idle: idle.schedule, guardOn: o.guardOn ?? true, guardReference: ref.fn, ...o.so } as Partial<UiGpuSurfaceOptions> });
    // The rig's own Idle is replaced by this one (the surface takes `so.idle` last).
    return { r: { ...r, idle }, ref };
  };

  it('a planted 1-byte difference at 4x under `on` trips (exact class), recorded with its reason, the reference a raster at 4x', () => {
    const { r, ref } = onRig({ plant: BYTE4 });
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    expect(r.s.lastPath).toBe('gpu');
    expect(r.shown.at(-1)).toBe('gpu');                       // the page shows the GPU's frame
    r.f.fences.signal();
    r.idle.drain();
    expect(ref.calls.map((c) => c.scale)).toEqual([4]);
    const rec = r.s.guard!.records[0]!;
    expect(rec).toMatchObject({ trip: 'exact', scale: 4, reference: 'raster', skipped: null });
    expect(rec.why.some((w) => /E\/E\*: 1 pixels of the exact class differ/.test(w))).toBe(true);
    expect(rec.stats).toMatchObject({ exactDiffering: 1, differing: 1, maxAbs: [1, 0, 0, 0] });
    expect(rec.stats.first).toMatchObject({ x: 10, y: 10, channel: 0, exact: true });
    expect(r.swi.blend('front', 4)).toBe('exact');            // escalated as in shadow (GM.R5, GM.R6)
    expect(r.logs.some((l) => /guard trip \(exact\)/.test(l))).toBe(true);
  });

  it('the raster and the compare run off the animation frame: none in present; the raster in an idle callback of its own', () => {
    const { r, ref } = onRig();
    const guarded: number[] = [];
    const probe: UiPresentProbe = { now: () => r.clock.t, rendered: () => {}, guarded: (ms) => { guarded.push(ms); } };
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 }, probe);
    expect(ref.calls).toEqual([]);                            // no software raster inside the frame
    expect(r.s.guard!.records).toEqual([]);
    expect(r.f.names()).not.toContain('getBufferSubData');
    expect(r.f.names().filter((n) => n === 'fenceSync').length).toBe(1);
    expect(r.idle.queue.length).toBe(1);
    r.idle.runOnce();                                          // the fence has not signalled: polled, nothing else
    expect(ref.calls).toEqual([]);
    r.f.fences.signal();
    r.idle.drain();
    expect(ref.calls).toEqual([{ inside: true, scale: 4 }]);  // once, inside an idle callback
    expect(r.f.fences.readEarly).toBe(0);
    const rec = r.s.guard!.records[0]!;
    expect(rec).toMatchObject({ trip: null, reference: 'raster', skipped: null });
    expect(rec.stats.exactPixels).toBe(2560 * 1792);
    expect(rec.stats.exactDiffering).toBe(0);
    expect(guarded.length).toBeGreaterThan(0);
  });

  it('the frame after the raster\'s idle callback is a guard frame: its lost time listed in guardFrames, never in lostSeconds', () => {
    let clockRef: { t: number } | null = null;
    const { r } = onRig({ onCall: () => { clockRef!.t += 106; } });   // the 4x raster's p50 on either leg (Log 2026-11-04T08:30Z, D2)
    clockRef = r.clock;
    const probe = new UiPerfProbe(() => r.clock.t, new UiPerfRing(64));
    probe.begin(0); probe.advanced(1);
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 }, probe);
    probe.end(0, null, -1, 4, 'dlgMenu');
    r.f.fences.signal();
    r.idle.drain();                                            // the raster's callback runs between frames: 106 ms
    probe.begin(123); probe.advanced(1); probe.end(0.073, null, -1, 4, 'dlgMenu');   // the clock lost 73 ms over that frame
    probe.begin(140); probe.advanced(1); probe.end(0.073, null, -1, 4, 'dlgMenu');
    const sum = summarizeUiPerf(probe.ring.samples(), 0, 200);
    expect(sum.guardFrames.length).toBe(1);
    expect(sum.guardFrames[0]!.t).toBe(123);
    expect(sum.guardFrames[0]!.guardMs).toBeGreaterThanOrEqual(106);
    expect(sum.guardLostSeconds).toBeCloseTo(0.073, 9);
    expect(sum.lostSeconds).toBeCloseTo(0, 9);
  });

  /** Case 13.hot at 4x (both bitmaps replaced): the page's HD lookup counted, its kept images keyed while `resident.on`. */
  const hdFrame = () => {
    const c = UI_RASTER_CASES.find((x) => x.key === '13.hot')!;
    const { items, textures, options } = caseRasterInputs(c, 4, 'opaque');
    const resident = { on: true }, keyOf = new Map<Rgba['data'], string>();
    let asks = 0;
    const hd = (b: UiBitmap): Rgba | null => {
      asks++;
      const got = options.hd!(b);
      if (got && !keyOf.has(got.data)) keyOf.set(got.data, `hd|7|${keyOf.size}`);
      return got;
    };
    const keys: UiGpuHdKeys = { pack: 7, version: 0, gpuKeyOf: (image) => (resident.on ? keyOf.get(image.data) ?? null : null) };
    return { items, textures, options: { ...options, hd }, resident, keyOf, keys, asks: () => asks };
  };

  it('residency: the compare uses the HD images resident at the shown scale and never asks the page\'s lookup again (no decode)', () => {
    const h = hdFrame();
    const { r, ref } = onRig({ so: { hdKeys: () => h.keys } });
    r.s.present(h.items, h.textures, h.options);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.s.stats.frames.L0).toBe(1);
    expect(h.keyOf.size).toBe(2);                              // both replacements picked by the frame
    const asked = h.asks();
    r.f.fences.signal();
    r.idle.drain();
    expect(h.asks()).toBe(asked);                              // the idle raster asked the page's lookup nothing
    expect(ref.calls).toEqual([{ inside: true, scale: 4 }]);
    const rec = r.s.guard!.records[0]!;
    expect(rec).toMatchObject({ trip: null, reference: 'raster', skipped: null, scale: 4 });
    expect(rec.stats.exactDiffering).toBe(0);
  });

  it('residency: a needed HD image no longer resident skips the compare, recorded as skipped with why; nothing rastered, nothing tripped', () => {
    const h = hdFrame();
    const { r, ref } = onRig({ so: { hdKeys: () => h.keys } });
    r.s.present(h.items, h.textures, h.options);
    h.resident.on = false;                                     // the lookup let its images go before the idle callback
    r.f.fences.signal();
    r.idle.drain();
    expect(ref.calls).toEqual([]);
    const rec = r.s.guard!.records[0]!;
    expect(rec.trip).toBeNull();
    expect(rec.skipped).toMatch(/not resident/);
    expect(rec.why.some((w) => /not resident/.test(w))).toBe(true);
    expect(r.s.guard!.counts).toMatchObject({ skipped: 1, compared: 0 });
    expect(r.swi.blend('front', 4)).toBe('ff');
  });

  it('every release surface: without guardOn, `on` reads nothing back and schedules nothing; the GPU frame\'s bytes are the same either way', () => {
    const plain = onRig({ guardOn: false });
    plain.r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    expect(plain.r.f.names()).not.toContain('fenceSync');
    expect(plain.r.idle.queue.length).toBe(0);
    expect(plain.r.s.guard).toBeNull();
    expect(plain.ref.calls).toEqual([]);
    const guarded = onRig();
    guarded.r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    const a = plain.r.s.readFrame()!, b = guarded.r.s.readFrame()!;
    expect(byteDiff(a.data, b.data)).toEqual({ lengths: [a.data.length, a.data.length], differ: 0 });
  });

  it('shadow is unchanged by guardOn: its reference is the shown frame (no raster), the page\'s bytes today\'s', () => {
    const { r, ref } = onRig({ search: '?uiGpu=shadow' });
    const items = [clearItem([10, 20, 30])];
    r.s.present(items, noTextures, { scale: 2 });
    r.f.fences.signal();
    r.idle.drain();
    expect(ref.calls).toEqual([]);
    const want = rasterizeUiDrawList(items, noTextures, { scale: 2 }).frame.data;
    expect(byteDiff(r.target.puts[0]!, want)).toEqual({ lengths: [want.length, want.length], differ: 0 });
    expect(r.s.guard!.records[0]).toMatchObject({ reference: 'shown', skipped: null, trip: null });
  });

  it('a guard used alone: a raster that answers a skip is recorded as skipped, with its reason, and counted', () => {
    const idle = new Idle();
    const g = new UiGpuGuard({ surface: 'front', now: () => 0, idle: idle.schedule, caps: () => null });
    const frame = rasterizeUiDrawList([clearItem([1, 2, 3])], noTextures, { scale: 1 }).frame;
    const plan = planFrame([clearItem([1, 2, 3])], noTextures, { scale: 1 });
    g.submit({ readback: { poll: () => frame, cancel: () => {} }, raster: () => ({ skip: 'a test\'s reason' }), plan } as never);
    idle.drain();
    expect(g.records.length).toBe(1);
    expect(g.records[0]).toMatchObject({ skipped: 'a test\'s reason', trip: null, reference: 'raster' });
    expect(g.counts).toMatchObject({ skipped: 1, compared: 0 });
  });
});

// GM-14c follow-up (the controller's round): the page's way in -- the switch arms the guard under `on` only on a page the
// Vite dev server serves (`?uiGpuGuard=on`, `devBuild`: DEV and MODE `development`, as GM-16b's table), and a test's
// plant (`?uiGpuGuardPlant=<byte>`) flips one byte of the guard's rastered reference so a trip shows on `window.__uiGpu`;
// and the draw list a sampled frame keeps for its idle raster is the frame's, whatever the caller does to it after.
describe('GM-14c: the page\'s dev switch, the plant, and the kept draw list', () => {
  const BYTE4 = (10 * 2560 + 10) * 4;
  const frames = (r: Rig): number => r.f.names().filter((n) => n === 'fenceSync').length;

  it('a dev-server switch with uiGpuGuard=on guards an `on` frame (the surface given no guardOn of its own)', () => {
    const r = rig({ search: '?uiGpu=on&uiGpuGuard=on', devBuild: true });
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    expect(frames(r)).toBe(1);
    r.f.fences.signal();
    r.idle.drain();
    expect(r.s.guard!.records[0]).toMatchObject({ reference: 'raster', trip: null, skipped: null, scale: 4 });
    expect(r.swi.readout().guard.last).toMatchObject({ reference: 'raster', trip: null });
  });

  it('a release build: the same address guards nothing -- no read-back, nothing scheduled, no guard', () => {
    for (const devBuild of [false, undefined]) {
      const r = rig({ search: `?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=${BYTE4}`, devBuild });
      r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
      expect(r.s.lastPath).toBe('gpu');
      expect(frames(r)).toBe(0);
      expect(r.idle.queue.length).toBe(0);
      expect(r.s.guard).toBeNull();
    }
  });

  it('the plant: one byte of the rastered reference at 4x flipped, the trip and its reason on the read-out (window.__uiGpu)', () => {
    const r = rig({ search: `?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=${BYTE4}`, devBuild: true });
    r.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    r.f.fences.signal();
    r.idle.drain();
    const out = r.swi.readout().guard;
    expect(out.trips.length).toBe(1);
    expect(out.last).toMatchObject({ trip: 'exact', reference: 'raster', scale: 4 });
    expect(out.last!.why.some((w) => /E\/E\*: 1 pixels of the exact class differ/.test(w))).toBe(true);
    expect(out.last!.why.some((w) => /planted/.test(w))).toBe(true);
    expect(out.last!.stats.first).toMatchObject({ x: 10, y: 10, channel: 0, exact: true });
  });

  it('the kept draw list: changed in place after the frame, the idle raster still draws the frame\'s own', () => {
    const r = rig({ search: '?uiGpu=on', so: { guardOn: true } as Partial<UiGpuSurfaceOptions> });
    const quad: Extract<UiDrawItem, { kind: 'sprite' }> = {
      kind: 'sprite', node: 'n', texture: null, x0: 0, y0: 0, x1: 64, y1: 64, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 0, 0, 128], clip: null,
    };
    const items: UiDrawItem[] = [clearItem([10, 20, 30]), quad];
    r.s.present(items, noTextures, { scale: 4 });
    quad.rgba[0] = 64;                                          // the caller rewrites its list after the frame
    items.push(clearItem([200, 0, 0]));
    r.f.fences.signal();
    r.idle.drain();
    const rec = r.s.guard!.records[0]!;
    expect(rec.reference).toBe('raster');
    expect(rec.stats.exactDiffering).toBe(0);
    expect(rec.trip).toBeNull();
  });
});

// GM batch 2 review 1 (F1, F2): the plant lands in the exact class whatever the frame (`?uiGpuGuardPlant=exact`: the
// first pixel the frame's own plan puts in the class), so the box run's 4x plant must trip; and a surface keeps its last
// plan (and the plan's HD images) only for a frame the guard samples under `on`.
describe('GM-14c review fold: the plant in the exact class (F1); the last plan kept only under the guard (F2)', () => {
  /** A frame whose top-left corner is a textured quad (out of the exact class): pixel (10, 10) is B, not E/E*. */
  const covered = (): { items: UiDrawItem[]; textures: UiTextures } => {
    const bitmap = solid(4, 4, [90, 40, 20, 128]);
    const quad: UiDrawItem = { kind: 'sprite', node: 'q', texture: 't', x0: 0, y0: 0, x1: 64, y1: 64, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null };
    return { items: [clearItem([10, 20, 30]), quad], textures: (n) => (n === 't' ? bitmap : null) };
  };
  const PIXEL_10_10 = (10 * 2560 + 10) * 4;

  it('F1: a fixed byte under a textured quad is a B difference -- no trip; the trip is not guaranteed by a fixed byte', () => {
    const { items, textures } = covered();
    const r = rig({ search: `?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=${PIXEL_10_10}`, devBuild: true });
    r.s.present(items, textures, { scale: 4 });
    r.f.fences.signal();
    r.idle.drain();
    const rec = r.s.guard!.records[0]!;
    expect(rec.stats.exactDiffering).toBe(0);
    expect(rec.trip).toBeNull();
  });

  it('F1: ?uiGpuGuardPlant=exact plants the first pixel of the frame\'s exact class, so the plant trips; the byte named', () => {
    const { items, textures } = covered();
    const r = rig({ search: '?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=exact', devBuild: true });
    r.s.present(items, textures, { scale: 4 });
    r.f.fences.signal();
    r.idle.drain();
    const rec = r.s.guard!.records[0]!;
    const plan = planFrame(items, textures, { scale: 4, blend: rec.blend });
    const mask = uiGpuExactMask(plan), want = mask.indexOf(1) * 4;
    expect(mask[PIXEL_10_10 / 4]).toBe(0);                     // pixel (10, 10) is out of the class (under the quad)
    expect(want).toBe(256 * 4);                                // the first in it: (256, 0), past the 4x quad's edge
    expect(rec.trip).toBe('exact');
    expect(rec.stats.first).toMatchObject({ exact: true });
    expect(rec.why).toContain(`planted: byte ${want} of the reference flipped (uiGpuGuardPlant, a test's)`);
    expect(r.swi.readout().guard).toMatchObject({ plant: 'exact' });
  });

  it('F2: without the guard an `on` frame keeps no plan; under the guard only a frame it samples does, and only until the next', () => {
    const plain = rig({ search: '?uiGpu=on' });
    plain.s.present([clearItem([10, 20, 30])], noTextures, { scale: 4 });
    expect((plain.s as unknown as { gpu: GpuUiPresenter }).gpu.lastPlan).toBeNull();
    const b = createUiGpuBackend(fakeGl().canvas as unknown as HTMLCanvasElement, { transparent: false })!;
    b.compilePrograms();
    const p = new GpuUiPresenter(b);
    p.present([clearItem([1, 2, 3])], noTextures, { scale: 1 });
    expect(p.lastPlan).toBeNull();
    p.keepNextPlan();
    p.present([clearItem([4, 2, 3])], noTextures, { scale: 1 });
    expect(p.lastPlan?.hash).toMatch(/^[0-9a-f]{16}$/);
    p.present([clearItem([5, 2, 3])], noTextures, { scale: 1 });
    expect(p.lastPlan).toBeNull();
  });
});

// GM batch 2, Codex's P2 on PR #706 (`uiGpuPresenter.ts` `present`): under `on` with the guard an unchanged frame (the
// dirty check drew nothing) was never offered to the guard, so a static frame whose first present the guard refused
// (a compare in flight, or within gapMs) was never compared, and a compared one was never re-sampled after repeatMs
// (GM.R11's sampling, as shadow keeps it). The frame target still holds the unchanged frame's pixels (only a draw, an
// L1 upload or shadow's offscreen draw writes it, and each of those clears the dirty check's kept frame), so the guard
// is offered it and `wants` decides. PRODUCT TRACK; evidence kind: unit tests on the fake WebGL2 context.
describe('GM-14c, Codex P2: an unchanged `on` frame is offered to the guard; `wants` decides (GM.R11 sampling)', () => {
  const S = UI_GPU_GUARD_SAMPLE_ADAPTATION;
  const A = [clearItem([10, 20, 30])], B = [clearItem([200, 100, 50])];
  const fences = (r: Rig): number => r.f.names().filter((n) => n === 'fenceSync').length;
  const count = (r: Rig, name: string): number => r.f.names().filter((n) => n === name).length;
  const onGuarded = (calls?: { n: number }) => rig({
    search: '?uiGpu=on',
    so: {
      guardOn: true,
      ...(calls ? { guardReference: (i: readonly UiDrawItem[], t: UiTextures, o: RasterOptions): Rgba => { calls.n++; return rasterizeUiDrawList(i, t, o).frame; } } : {}),
    } as Partial<UiGpuSurfaceOptions>,
  });
  const caughtUp = (r: Rig): void => { r.f.fences.signal(); r.idle.drain(); };
  const hashOf = (items: readonly UiDrawItem[]): string => planFrame(items, noTextures, { scale: 2, blend: 'ff' }).hash;

  it('a static frame first presented while a compare is in flight is compared once the guard is free, by a later unchanged present', () => {
    const r = onGuarded();
    r.s.present(A, noTextures, { scale: 2 });                  // sampled
    r.s.present(B, noTextures, { scale: 2 });                  // drawn; refused: A's compare in flight
    expect(fences(r)).toBe(1);
    caughtUp(r);
    r.clock.t += S.gapMs;
    r.s.present(B, noTextures, { scale: 2 });                  // unchanged: nothing drawn; the guard is free
    expect(r.s.stats.frames.unchanged).toBe(1);
    expect(fences(r)).toBe(2);
    caughtUp(r);
    const recs = r.s.guard!.records;
    expect(recs.length).toBe(2);
    expect(recs[1]).toMatchObject({ hash: hashOf(B), reference: 'raster', trip: null, skipped: null });
    expect(recs[1]!.stats.exactDiffering).toBe(0);
  });

  it('a static frame first presented within gapMs of the last compare is compared by a later unchanged present', () => {
    const r = onGuarded();
    r.s.present(A, noTextures, { scale: 2 });
    caughtUp(r);
    r.clock.t += 1;
    r.s.present(B, noTextures, { scale: 2 });                  // drawn; refused: within gapMs
    expect(fences(r)).toBe(1);
    r.clock.t += S.gapMs - 2;
    r.s.present(B, noTextures, { scale: 2 });                  // unchanged, still within gapMs: refused
    expect(fences(r)).toBe(1);
    r.clock.t += 1;
    r.s.present(B, noTextures, { scale: 2 });                  // unchanged, gapMs after: sampled
    expect(fences(r)).toBe(2);
    caughtUp(r);
    expect(r.s.guard!.records[1]).toMatchObject({ hash: hashOf(B), trip: null, skipped: null });
  });

  it('a static frame compared once is compared again after repeatMs, from unchanged presents alone', () => {
    const r = onGuarded();
    r.s.present(A, noTextures, { scale: 2 });
    const begun = r.clock.t;
    caughtUp(r);
    for (let k = 1; k < S.repeatMs / 500; k++) {
      r.clock.t = begun + k * 500;
      r.s.present(A, noTextures, { scale: 2 });
    }
    expect(fences(r)).toBe(1);                                 // the same frame: not before repeatMs
    r.clock.t = begun + S.repeatMs;
    r.s.present(A, noTextures, { scale: 2 });
    expect(fences(r)).toBe(2);
    caughtUp(r);
    r.clock.t = begun + 2 * S.repeatMs;
    r.s.present(A, noTextures, { scale: 2 });
    expect(fences(r)).toBe(3);
    caughtUp(r);
    expect(r.s.guard!.records.map((x) => x.hash)).toEqual([hashOf(A), hashOf(A), hashOf(A)]);
    expect(r.s.stats.frames.unchanged).toBe(S.repeatMs / 500 + 1);
  });

  it('unchanged presents between samples begin no read-back and hand no raster over: no work unless a sample is due', () => {
    const calls = { n: 0 };
    const r = onGuarded(calls);
    r.s.present(A, noTextures, { scale: 2 });
    caughtUp(r);
    expect(calls.n).toBe(1);
    const before = { reads: count(r, 'readPixels'), fences: fences(r), buffers: count(r, 'createBuffer'), draws: r.f.draws.length };
    for (let k = 1; k <= 20; k++) {
      r.clock.t += 100;
      r.s.present(A, noTextures, { scale: 2 });
      expect(r.idle.queue.length).toBe(0);
    }
    expect({ reads: count(r, 'readPixels'), fences: fences(r), buffers: count(r, 'createBuffer'), draws: r.f.draws.length }).toEqual(before);
    expect(calls.n).toBe(1);
    expect(r.s.guard!.counts.sampled).toBe(1);
  });

  it('the read-back of an unchanged sample reads the frame the canvas shows (the frame target still holds it)', () => {
    const r = onGuarded();
    const reads: Uint8Array[] = [];
    const gl = r.f.gl as unknown as { getBufferSubData: (t: number, o: number, d: ArrayBufferView) => void };
    const real = gl.getBufferSubData.bind(gl);
    gl.getBufferSubData = (t, o, d) => { real(t, o, d); reads.push(new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice()); };
    r.s.present(A, noTextures, { scale: 2 });
    r.s.present(B, noTextures, { scale: 2 });                  // the canvas now shows B
    caughtUp(r);
    r.clock.t += S.gapMs;
    r.s.present(B, noTextures, { scale: 2 });                  // unchanged: nothing drawn, B sampled
    caughtUp(r);
    expect(reads.length).toBe(2);
    const W = 1280, H = 896, row = W * 4;
    const shown = r.f.backbuffer();
    expect([shown.w, shown.h]).toEqual([W, H]);
    const flipped = new Uint8Array(W * H * 4);                 // the canvas's GL row H - 1 is the frame's row 0
    for (let y = 0; y < H; y++) flipped.set(shown.data.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    expect(byteDiff(reads[1]!, flipped)).toEqual({ lengths: [W * H * 4, W * H * 4], differ: 0 });
    expect(byteDiff(reads[0]!, flipped).differ).toBeGreaterThan(0);   // A's read: not B's pixels
    expect(Array.from(reads[1]!.subarray(0, 4))).toEqual([200, 100, 50, 255]);
  });
});

// GM batch 2, part B: `?uiGpuGuardPlant=exact@4` plants only a frame whose plan targets 4x; a frame at another scale is
// compared unplanted, its record saying so. The plain forms (`exact`, a byte) stay byte for byte as before at every
// scale: the same flipped byte, the same note. PRODUCT TRACK (6d's decision for the owner); unit tests on the fake GL.
describe('GM-14c part B: the plant scoped to a scale (uiGpuGuardPlant=...@<scale>); the plain plant unchanged', () => {
  const onPlant = (plant: string) => rig({ search: `?uiGpu=on&uiGpuGuard=on&uiGpuGuardPlant=${plant}`, devBuild: true });
  const frame = (r: Rig, scale: number, items: readonly UiDrawItem[] = [clearItem([10, 20, 30])]): void => {
    r.s.present(items, noTextures, { scale });
    r.f.fences.signal();
    r.idle.drain();
  };

  it('exact@4: a 1x frame is compared unplanted (no trip, the note recorded); a 4x frame is planted and trips the exact class at 4x', () => {
    const r = onPlant('exact@4');
    frame(r, 1);
    const one = r.s.guard!.records[0]!;
    expect(one).toMatchObject({ scale: 1, trip: null, skipped: null, reference: 'raster' });
    expect(one.stats.exactDiffering).toBe(0);
    expect(one.why).toContain('not planted: the frame is at 1x, the plant asks 4x');
    expect(r.s.state).toBe('ready');                            // no trip at 1x's exact blend: no kill
    expect(r.swi.readout().kills).toEqual([]);
    r.clock.t += UI_GPU_GUARD_SAMPLE_ADAPTATION.gapMs;
    frame(r, 4);
    const four = r.s.guard!.records[1]!;
    expect(four).toMatchObject({ scale: 4, trip: 'exact', reference: 'raster', skipped: null });
    expect(four.why.some((w) => /^E\/E\*: 1 pixels of the exact class differ/.test(w))).toBe(true);
    expect(four.why.some((w) => /^planted: byte \d+ of the reference flipped/.test(w))).toBe(true);
    expect(r.swi.readout().guard.trips.map((t) => t.scale)).toEqual([4]);
  });

  it('a byte@2 plant flips that byte at 2x only; at 4x the frame is compared unplanted', () => {
    const BYTE = 40;
    const r = onPlant(`${BYTE}@2`);
    frame(r, 4);
    expect(r.s.guard!.records[0]!.why).toContain('not planted: the frame is at 4x, the plant asks 2x');
    expect(r.s.guard!.records[0]!.trip).toBeNull();
    r.clock.t += UI_GPU_GUARD_SAMPLE_ADAPTATION.gapMs;
    frame(r, 2);
    const rec = r.s.guard!.records[1]!;
    expect(rec.why).toContain(`planted: byte ${BYTE} of the reference flipped (uiGpuGuardPlant, a test's)`);
    expect(rec.stats.first).toMatchObject({ x: 10, y: 0, channel: 0, exact: true });
  });

  it('the plain plant is unchanged at every scale: exact flips the first exact-class pixel\'s red byte, a byte that byte, with the same notes', () => {
    for (const scale of [1, 2, 4]) {
      const items = [clearItem([10, 20, 30])];
      const ex = onPlant('exact');
      frame(ex, scale, items);
      const rec = ex.s.guard!.records[0]!;
      const want = uiGpuExactMask(planFrame(items, noTextures, { scale, blend: rec.blend })).indexOf(1) * 4;
      expect(rec.why, `exact ${scale}x`).toContain(`planted: byte ${want} of the reference flipped (uiGpuGuardPlant, a test's)`);
      expect(rec).toMatchObject({ scale, trip: 'exact' });
      expect(ex.swi.readout().guard.plant).toBe('exact');
      const by = onPlant('40');
      frame(by, scale, items);
      const b = by.s.guard!.records[0]!;
      expect(b.why, `byte ${scale}x`).toContain('planted: byte 40 of the reference flipped (uiGpuGuardPlant, a test\'s)');
      expect(b.stats.first).toMatchObject({ x: 10, y: 0, channel: 0 });
      expect(by.swi.readout().guard.plant).toBe(40);
    }
    const past = onPlant('999999999');
    frame(past, 1);
    expect(past.s.guard!.records[0]!.why).toContain('uiGpuGuardPlant 999999999 is past the reference\'s 1146880 bytes: nothing planted');
  });
});
