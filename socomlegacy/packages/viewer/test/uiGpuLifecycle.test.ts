import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import type { UiPresenter, UiPresented } from '../src/uiPresenter';
import {
  UI_GPU_LOSS_FALLBACK_ADAPTATION, UI_GPU_LOSS_LIMIT_ADAPTATION, UI_GPU_RESTORE_WAIT_MS_ADAPTATION, UiGpuSurfacePresenter, uiGpuLossFallbackOptions,
  type UiGpuSurfaceOptions,
} from '../src/uiGpuPresenter';
import { UI_GPU_PROGRAMS, readUiGpuCaps } from '../src/uiGpuWebgl2';
import { UiGpuSwitch } from '../src/uiGpuSwitch';
import { UiQuadRasterCache } from '../src/uiCompositorView';
import { GL, fakeGl, type Fake, type FakeGlOptions } from './uiGpuFakeGl';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

// GM-12a (plan 2026-11-01-gpu-menus, row GM-12a; "The fallback ladder"; GM.R9, GM.R12, GM.R13; research 380 §5): the GPU
// surface's lifecycle and loss -- a PRODUCT-TRACK browser adaptation that decides which drawer makes a frame, never a
// pixel. Held here on the fake WebGL2 context (`./uiGpuFakeGl.ts`: its loss, restore, extensions and injected faults are
// a model of the WebGL 1.0 §5.15 rules, not a GPU). Every transition of the lifecycle is a test below. Evidence kind:
// unit test; a real context's loss and its restore time are the box's (`e2e/uiGpuLoss.spec.ts`, written, not run here).

const clearItem = (rgb: [number, number, number]): UiDrawItem => ({ kind: 'clear', rgb });
const noTextures: UiTextures = () => null;
/**
 * GM-15a: a list's models moved behind the eye (every vertex's `invW` negated, so <= 0): a plan the GPU still leaves L1,
 * named by the planner -- the L1 frame these tests need now that case 2's models are drawn on the GPU.
 */
const behindTheEye = (items: readonly UiDrawItem[]): UiDrawItem[] => items.map((it) => (it.kind === 'models' && it.triangles
  ? { ...it, triangles: it.triangles.map((t) => ({ ...t, a: { ...t.a, invW: -t.a.invW }, b: { ...t.b, invW: -t.b.invW }, c: { ...t.c, invW: -t.c.invW } })) }
  : it));

/** The software presenter the surface falls back to (the 2D canvas's `CpuUiPresenter` on the page): a recorder. */
class SoftwareRecorder implements UiPresenter {
  readonly kind = 'cpu';
  readonly seen: RasterOptions[] = [];
  present(_items: readonly UiDrawItem[], _t: UiTextures, options: RasterOptions = {}): UiPresented {
    this.seen.push({ ...options });
    const s = options.scale ?? 1;
    return { undrawn: [], width: 640 * s, height: 448 * s };
  }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
}

/** A clock whose timers run when the test advances it. */
class TestClock {
  t = 1000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  now = (): number => this.t;
  setTimeout = (fn: () => void, ms: number): number => { const id = this.next++; this.timers.push({ at: this.t + ms, fn, id }); return id; };
  clearTimeout = (id: unknown): void => { this.timers = this.timers.filter((x) => x.id !== id); };
  get pending(): number { return this.timers.length; }
  advance(ms: number): void {
    this.t += ms;
    for (const x of this.timers.filter((y) => y.at <= this.t).sort((a, b) => a.at - b.at)) { this.timers = this.timers.filter((y) => y !== x); x.fn(); }
  }
}

const GPU_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';

interface Rig { f: Fake; s: UiGpuSurfacePresenter; sw: SoftwareRecorder; clock: TestClock; swi: UiGpuSwitch; shown: string[]; logs: string[] }

const rig = (fo: FakeGlOptions = {}, so: Partial<UiGpuSurfaceOptions> = {}): Rig => {
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...fo });
  const sw = new SoftwareRecorder(), clock = new TestClock();
  const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
  const shown: string[] = [], logs: string[] = [];
  const s = new UiGpuSurfacePresenter({
    canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: sw, transparent: false, surface: 'front', clock, host: swi,
    shown: (w) => shown.push(w), log: (l) => logs.push(l), ...so,
  });
  return { f, s, sw, clock, swi, shown, logs };
};

// Frames at 2x (an HD scale, so the 1x fallback shows; 4x on the fake's pixel loops costs a second a frame).
const frame = (r: Rig, rgb: [number, number, number] = [10, 20, 30], options: RasterOptions = { scale: 2 }): UiPresented =>
  r.s.present([clearItem(rgb)], noTextures, options);

/** A rig whose surface has drawn one frame on the GPU. */
const readyRig = (fo: FakeGlOptions = {}, so: Partial<UiGpuSurfaceOptions> = {}): Rig => {
  const r = rig(fo, so);
  frame(r);
  expect(r.s.state).toBe('ready');
  expect(r.s.lastPath).toBe('gpu');
  return r;
};

describe('GM-12a: synchronous create and the capability checks', () => {
  it('makes the context in the call, once: getContext with the plan\'s attributes, listeners on, programs begun', () => {
    const r = rig({ parallelCompile: true });
    expect(r.s.state).toBe('unmade');
    const out = r.s.create();
    expect(out).toEqual({ ok: true });
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);
    expect(r.s.state).toBe('compiling');
    expect(r.f.listening('webglcontextlost')).toBe(1);
    expect(r.f.listening('webglcontextrestored')).toBe(1);
    // Every program's link begun, none asked about yet (KHR_parallel_shader_compile: no stall on create).
    expect(r.f.names().filter((n) => n === 'linkProgram')).toHaveLength(UI_GPU_PROGRAMS.length);
    expect(r.f.compile.blockingQueries).toBe(0);
    expect(r.swi.readout().contexts).toBe(1);
    // create again is a no-op.
    expect(r.s.create()).toEqual({ ok: true });
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);
  });

  it('the first present makes the context lazily (no create before it)', () => {
    const r = rig();
    frame(r);
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);
    expect(r.s.lastPath).toBe('gpu');
  });

  it('no WebGL2: L4, today\'s path at the shown scale, no context counted', () => {
    const r = rig({ noContext: true });
    expect(r.s.create()).toEqual({ ok: false, reason: 'no-webgl2' });
    expect(r.s.state).toBe('unavailable');
    frame(r);
    expect(r.sw.seen).toHaveLength(1);
    expect(r.sw.seen[0]!.scale).toBe(2);
    expect(r.s.stats.frames.L4).toBe(1);
    expect(r.swi.readout().levels.L4).toBe(1);
    expect(r.swi.readout().contexts).toBe(0);
    expect(r.shown).toEqual(['software']);
  });

  it('a software adapter (UNMASKED_RENDERER_WEBGL names SwiftShader): L4, the context let go at once', () => {
    const r = rig({ unmaskedRenderer: SWIFTSHADER });
    expect(r.s.create()).toEqual({ ok: false, reason: 'software-adapter' });
    expect(r.s.state).toBe('unavailable');
    expect(r.f.names()).toContain('loseContext');
    expect(r.f.listening('webglcontextlost')).toBe(0);
    expect(r.swi.readout().contexts).toBe(0);
    expect(r.s.stats.caps?.renderer).toBe(SWIFTSHADER);
    expect(r.s.stats.caps?.rendererSource).toBe('unmasked');
    // ?uiGpuAllowSoftwareAdapter=1 (the gate's own key) lets it through.
    const allowed = rig({ unmaskedRenderer: SWIFTSHADER }, { allowSoftwareAdapter: true });
    expect(allowed.s.create()).toEqual({ ok: true });
  });

  it('no WEBGL_debug_renderer_info: the plain RENDERER read and said so; a masked string names no adapter and passes (review F3 of GM-10)', () => {
    const f = fakeGl({ renderer: 'WebKit WebGL' });
    const caps = readUiGpuCaps(f.gl as unknown as WebGL2RenderingContext, false);
    expect(caps).toMatchObject({ webgl2: true, renderer: 'WebKit WebGL', rendererSource: 'renderer', maxTextureSize: 4096, programsLinked: false });
    const r = rig({ unmaskedRenderer: undefined, renderer: 'WebKit WebGL' });
    expect(r.s.create()).toEqual({ ok: true });
    expect(r.s.stats.caps?.rendererSource).toBe('renderer');
    // A plain RENDERER that does name a software adapter is still refused.
    const sw = rig({ unmaskedRenderer: undefined, renderer: SWIFTSHADER });
    expect(sw.s.create()).toEqual({ ok: false, reason: 'software-adapter' });
  });

  it('reads UNMASKED_RENDERER_WEBGL where the extension is offered', () => {
    const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, renderer: 'WebKit WebGL' });
    expect(readUiGpuCaps(f.gl as unknown as WebGL2RenderingContext, true)).toMatchObject({ renderer: GPU_RENDERER, rendererSource: 'unmasked', programsLinked: true });
  });

  it('MAX_TEXTURE_SIZE under 4096: L4, max-texture-size', () => {
    const r = rig({ maxTexture: 2048 });
    expect(r.s.create()).toEqual({ ok: false, reason: 'max-texture-size' });
    expect(r.s.state).toBe('unavailable');
  });

  it('a program that does not link: L4 (program-link) at the poll that finds it, the context let go, software after', () => {
    const r = rig({ failLink: true });
    expect(r.s.create()).toEqual({ ok: true });
    frame(r);
    expect(r.s.state).toBe('unavailable');
    expect(r.s.stats.unavailable).toBe('program-link');
    expect(r.sw.seen).toHaveLength(1);
    expect(r.f.draws).toHaveLength(0);
    expect(r.swi.readout().contexts).toBe(0);
    expect(r.f.names()).toContain('loseContext');
    frame(r);
    expect(r.sw.seen).toHaveLength(2);
    expect(r.s.stats.frames.L4).toBe(2);
  });
});

describe('GM-12a: KHR_parallel_shader_compile and ready only when linked', () => {
  it('with the extension: frames go to the software while the links run, no LINK_STATUS read early, the GPU once every program completed', () => {
    const r = rig({ parallelCompile: true });
    r.s.create();
    frame(r); frame(r);
    expect(r.s.ready).toBe(false);
    expect(r.s.state).toBe('compiling');
    expect(r.sw.seen).toHaveLength(2);
    expect(r.sw.seen[0]!.scale).toBe(2);                // not a loss: today's path at the shown scale
    expect(r.f.compile.blockingQueries).toBe(0);
    expect(r.f.names()).not.toContain('blitFramebuffer');
    expect(r.s.stats.frames.waiting).toBe(2);
    r.f.compile.finish();
    frame(r);
    expect(r.s.ready).toBe(true);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.f.compile.blockingQueries).toBe(0);
    expect(r.f.names()).toContain('blitFramebuffer');
    expect(r.shown).toEqual(['software', 'gpu']);
    expect(r.s.stats.frames.L0).toBe(1);
  });

  it('without the extension: the link status read at the first poll (the synchronous path) and the frame drawn on the GPU', () => {
    const r = rig();
    r.s.create();
    expect(r.f.names()).toContain('getExtension');
    expect(r.f.calls.some((c) => c[0] === 'getExtension' && c[1] === 'KHR_parallel_shader_compile')).toBe(true);
    expect(r.s.ready).toBe(false);
    frame(r);
    expect(r.s.ready).toBe(true);
    expect(r.sw.seen).toHaveLength(0);
  });

  it('poll() alone settles the links (the page may poll between frames)', () => {
    const r = rig({ parallelCompile: true });
    r.s.create();
    r.s.poll();
    expect(r.s.ready).toBe(false);
    r.f.compile.finish();
    r.s.poll();
    expect(r.s.ready).toBe(true);
  });

  it('a frame the plan cannot draw on the GPU is L1, counted (case 2\'s models behind the eye: invW <= 0, the planner\'s named L1)', () => {
    const r = readyRig();
    const c2 = UI_RASTER_CASES.find((c) => c.id === 2)!;
    const { items: drawn, textures, options } = caseRasterInputs(c2, 1, 'opaque');
    const items = behindTheEye(drawn);
    r.s.present(items, textures, options);
    expect(r.s.lastPath).toBe('gpu');                       // L1 is uploaded to the GPU canvas: the GPU canvas shows it
    expect(r.s.stats.frames.L1).toBe(1);
    expect(r.sw.seen).toHaveLength(0);
    expect(r.swi.readout().levels.L1).toBe(1);
    // GM-15a: the same case in front of the eye is L0, drawn on the GPU.
    const l0 = r.s.stats.frames.L0;
    r.s.present(drawn, textures, options);
    expect(r.s.stats.frames.L1).toBe(1);
    expect(r.s.stats.frames.L0).toBe(l0 + 1);
  });

  it('GM-16c: an L1 frame tells the host why (host.refused with the record\'s why); an L0 frame does not', () => {
    const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
    const refusals: { surface: string; why: readonly string[] }[] = [];
    const host = {
      kill: swi.kill.bind(swi), count: swi.count.bind(swi), adjustContexts: swi.adjustContexts.bind(swi),
      refused: (surface: string, why: readonly string[]) => { refusals.push({ surface, why }); swi.refused(surface as 'front', why); },
    };
    const r = readyRig({}, { host });
    expect(refusals).toEqual([]);                            // the ready rig's frame was L0: no refusal
    const c2 = UI_RASTER_CASES.find((c) => c.id === 2)!;
    const { items: drawn, textures, options } = caseRasterInputs(c2, 1, 'opaque');
    const items = behindTheEye(drawn);                       // GM-15a: case 2 itself is L0 now; behind the eye it is L1
    r.s.present(items, textures, options);
    expect(r.s.stats.frames.L1).toBe(1);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.surface).toBe('front');
    expect(refusals[0]!.why.length).toBeGreaterThan(0);      // the record's reasons (a software verdict or the backend's refusal)
    for (const w of refusals[0]!.why) expect(w.trim()).not.toBe('');
    expect(swi.readout().refusals.last).toEqual({ surface: 'front', why: [...refusals[0]!.why], at: 1 });
    frame(r);                                                // back to a frame the GPU draws: L0, no new refusal
    expect(r.s.lastPath).toBe('gpu');
    expect(refusals).toHaveLength(1);
  });
});

describe('GM-12a: webglcontextlost and webglcontextrestored, restore in place', () => {
  it('a loss: default prevented, the GPU let go without a GL call, frames to the software at 1x (L2), never black', () => {
    const r = readyRig();
    r.f.loss.lose();
    const seen = r.f.events.flush();
    expect(seen[0]!.type).toBe('webglcontextlost');
    expect(seen[0]!.defaultPrevented).toBe(true);
    expect(r.s.state).toBe('lost');
    expect(r.s.stats.losses).toBe(1);
    const lostCalls = r.f.loss.whileLost.length;
    const out = frame(r, [10, 20, 30], { scale: 4, hd: () => null, quadCache: new UiQuadRasterCache() });
    expect(r.f.loss.whileLost.length).toBe(lostCalls);    // nothing asked of the lost context
    expect(r.sw.seen).toHaveLength(1);
    expect(r.sw.seen[0]!.scale).toBe(UI_GPU_LOSS_FALLBACK_ADAPTATION.scale);
    expect(r.sw.seen[0]!.hd).toBeUndefined();
    expect(r.sw.seen[0]!.quadCache).toBeUndefined();
    expect([out.width, out.height]).toEqual([640, 448]);
    expect(r.s.stats.frames.L2).toBe(1);
    expect(r.swi.readout().levels.L2).toBe(1);
    expect(r.shown).toEqual(['gpu', 'software']);
    expect(r.swi.readout().contexts).toBe(0);
  });

  it('the restore is in place: the same context, a new backend, links begun again, the GPU back; restore time recorded', () => {
    const r = rig({ parallelCompile: true });
    r.s.create(); r.f.compile.finish(); frame(r);
    expect(r.s.ready).toBe(true);
    r.f.loss.lose(); r.f.events.flush();
    r.clock.advance(40);
    expect(r.f.loss.restore()).toBe(true);
    r.f.events.flush();
    expect(r.s.state).toBe('compiling');
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);   // in place: no new context asked
    expect(r.swi.readout().contexts).toBe(1);
    frame(r);                                                                 // still linking: L2 at 1x
    expect(r.sw.seen.at(-1)!.scale).toBe(1);
    expect(r.s.stats.frames.L2).toBe(1);
    r.clock.advance(10);
    r.f.compile.finish();
    frame(r);                                                                 // the fake refuses any object from before the restore
    expect(r.s.lastPath).toBe('gpu');
    expect(r.s.state).toBe('ready');
    expect(r.s.stats.restores).toEqual([{ sinceLoss: 50, sinceRestored: 10 }]);
    expect(r.shown).toEqual(['gpu', 'software', 'gpu']);
  });

  it('a loss found by present before its event (isContextLost): handled once, no draw on the lost context', () => {
    const r = readyRig();
    r.f.loss.lose();
    const before = r.f.draws.length;
    frame(r);
    expect(r.s.state).toBe('lost');
    expect(r.f.draws.length).toBe(before);
    expect(r.sw.seen).toHaveLength(1);
    r.f.events.flush();                       // the event arrives after: default prevented, not counted twice
    expect(r.s.stats.losses).toBe(1);
    expect(r.f.loss.restore()).toBe(true);
  });

  it('UI_GPU_RESTORE_WAIT_MS_ADAPTATION: no restore within the wait ends the GPU path for the session (restore-timeout)', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    r.clock.advance(UI_GPU_RESTORE_WAIT_MS_ADAPTATION - 1);
    expect(r.s.state).toBe('lost');
    r.clock.advance(1);
    expect(r.s.state).toBe('dead');
    expect(r.swi.readout().kills).toEqual([{ reason: 'restore-timeout', surface: 'front' }]);
    expect(r.swi.resolve('front', 4).source === 'session' || r.swi.resolve('front', 4).mode === 'off').toBe(true);
    // A late restore is not taken up.
    r.f.loss.restore(); r.f.events.flush();
    frame(r);
    expect(r.s.state).toBe('dead');
    expect(r.sw.seen.at(-1)!.scale).toBe(1);
    expect(r.s.stats.frames.L3).toBe(1);
    expect(r.swi.readout().levels.L3).toBe(1);
  });

  it('a restore within the wait clears its timer', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    expect(r.clock.pending).toBe(1);
    r.f.loss.restore(); r.f.events.flush();
    expect(r.clock.pending).toBe(0);
    r.clock.advance(UI_GPU_RESTORE_WAIT_MS_ADAPTATION * 2);
    expect(r.s.state).not.toBe('dead');
  });
});

describe('GM-12a: the loss limit (L3)', () => {
  const loseAndRestore = (r: Rig): void => { r.f.loss.lose(); r.f.events.flush(); r.f.loss.restore(); r.f.events.flush(); frame(r); };

  it(`${UI_GPU_LOSS_LIMIT_ADAPTATION.losses} losses within ${UI_GPU_LOSS_LIMIT_ADAPTATION.windowMs / 60000} minutes: the session killed (loss-limit), L2 for the rest of the session`, () => {
    expect(UI_GPU_LOSS_LIMIT_ADAPTATION).toEqual({ losses: 3, windowMs: 5 * 60 * 1000 });
    const r = readyRig();
    loseAndRestore(r);
    expect(r.s.lastPath).toBe('gpu');
    r.clock.advance(60_000);
    loseAndRestore(r);
    expect(r.s.lastPath).toBe('gpu');
    r.clock.advance(60_000);
    r.f.loss.lose(); r.f.events.flush();
    expect(r.s.state).toBe('dead');
    expect(r.swi.readout().kills).toEqual([{ reason: 'loss-limit', surface: 'front' }]);
    expect(r.clock.pending).toBe(0);                        // no restore wait: nothing will be taken up
    r.f.loss.restore(); r.f.events.flush();
    frame(r);
    expect(r.s.state).toBe('dead');
    expect(r.sw.seen.at(-1)!.scale).toBe(1);
    expect(r.s.stats.frames.L3).toBe(1);
    expect(r.swi.resolve('front', 4).mode).toBe('off');
  });

  it('losses further apart than the window do not add up', () => {
    const r = readyRig();
    for (let i = 0; i < 5; i++) { loseAndRestore(r); r.clock.advance(UI_GPU_LOSS_LIMIT_ADAPTATION.windowMs / 2 + 1); }
    expect(r.s.state).toBe('ready');
    expect(r.s.stats.losses).toBe(5);
    expect(r.swi.readout().kills).toEqual([]);
  });
});

describe('GM-12a: a GL error counts as a loss (GM.R13)', () => {
  it('a throw inside the GPU present: logged with the plan\'s hash, counted, the frame drawn by the software at 1x, rebuilt in place', () => {
    const r = readyRig();
    r.f.failNext('blitFramebuffer');
    const out = frame(r, [40, 50, 60]);
    expect([out.width, out.height]).toEqual([640, 448]);
    expect(r.sw.seen).toHaveLength(1);
    expect(r.sw.seen[0]!.scale).toBe(1);
    expect(r.s.stats.losses).toBe(1);
    expect(r.logs.some((l) => /plan [0-9a-f]{16}/.test(l) && /blitFramebuffer/.test(l))).toBe(true);
    expect(r.s.state).toBe('compiling');                    // the context is alive: a new backend on it, links begun
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);
    frame(r, [40, 50, 60]);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.s.stats.restores).toHaveLength(1);
  });

  it('three GL errors within the window reach the loss limit', () => {
    const r = readyRig();
    for (let i = 0; i < 3; i++) { r.f.failNext('clear'); frame(r, [i, 1, 2]); frame(r, [i, 3, 4]); }
    expect(r.s.state).toBe('dead');
    expect(r.swi.readout().kills[0]!.reason).toBe('loss-limit');
  });
});

describe('GM-12a: the dirty check by plan hash', () => {
  it('an unchanged plan on the GPU is neither drawn nor presented (the canvas keeps its frame); a changed one is', () => {
    const r = readyRig();
    const n = r.f.calls.length;
    frame(r);
    expect(r.f.calls.slice(n).map((c) => c[0]).filter((x) => x !== 'isContextLost')).toEqual([]);
    expect(r.s.stats.frames.unchanged).toBe(1);
    expect(r.s.stats.frames.L0).toBe(2);
    frame(r, [1, 2, 3]);
    expect(r.f.calls.slice(n).map((c) => c[0])).toContain('blitFramebuffer');
  });

  it('a frame after a restore is drawn whatever its hash', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush(); r.f.loss.restore(); r.f.events.flush();
    const n = r.f.calls.length;
    frame(r);
    expect(r.f.calls.slice(n).map((c) => c[0])).toContain('blitFramebuffer');
  });

  it('a texture whose image is a new object is drawn again (contents are not in the hash)', () => {
    const r = readyRig();
    const a = caseRasterInputs(UI_RASTER_CASES.find((x) => x.id === 1)!, 1, 'opaque');
    r.s.present(a.items, a.textures, a.options);
    expect(r.s.lastPath).toBe('gpu');
    let n = r.f.calls.length;
    r.s.present(a.items, a.textures, a.options);              // the same bitmaps: unchanged
    expect(r.f.calls.slice(n).map((x) => x[0])).not.toContain('blitFramebuffer');
    n = r.f.calls.length;
    const fresh: UiTextures = (name) => { const b = a.textures(name); return b ? { ...b } : null; };
    r.s.present(a.items, fresh, a.options);                   // the same draw list, new bitmap objects: drawn
    expect(r.f.calls.slice(n).map((x) => x[0])).toContain('blitFramebuffer');
  });

  it('a frame with a movie picture is always drawn (its pixels are not hashed: the plan is volatile)', () => {
    const r = readyRig();
    const c = UI_RASTER_CASES.find((x) => x.data().items.some((i) => i.kind === 'movie' && (i as { picture?: unknown }).picture));
    expect(c).toBeDefined();                                   // case 8's movie
    const a = caseRasterInputs(c!, 1, 'opaque');
    r.s.present(a.items, a.textures, a.options);
    const n = r.f.calls.length;
    r.s.present(a.items, a.textures, a.options);
    expect(r.f.calls.slice(n).map((x) => x[0])).toContain('blitFramebuffer');
  });
});

describe('GM-12a: leave releases, returned re-creates lazily', () => {
  it('release: the textures and programs deleted, the context let go (not a loss), counted down; the software shows', () => {
    const r = readyRig();
    expect(r.swi.readout().contexts).toBe(1);
    r.s.release();
    expect(r.f.programs.every((p) => p.deleted)).toBe(true);
    expect(r.f.textures.every((t) => t.deleted)).toBe(true);
    expect(r.f.names()).toContain('loseContext');
    r.f.events.flush();
    expect(r.s.stats.losses).toBe(0);
    expect(r.s.state).toBe('released');
    expect(r.swi.readout().contexts).toBe(0);
    expect(r.shown.at(-1)).toBe('software');
    // A frame while released (the menus' raster under a match): today's path at the shown scale, nothing asked of the GPU.
    const lostCalls = r.f.loss.whileLost.length;
    frame(r);
    expect(r.sw.seen.at(-1)!.scale).toBe(2);
    expect(r.f.loss.whileLost.length).toBe(lostCalls);
    expect(r.f.names()).not.toContain('restoreContext');
  });

  it('returned: the next present asks the browser for the context back; the GPU once linked; one getContext in all', () => {
    const r = readyRig();
    r.s.release(); r.f.events.flush();
    r.s.returned();
    expect(r.f.names()).not.toContain('restoreContext');   // lazily: not at the call
    frame(r);
    expect(r.f.names()).toContain('restoreContext');
    expect(r.sw.seen.at(-1)!.scale).toBe(2);
    r.f.events.flush();
    expect(r.s.state).toBe('compiling');
    frame(r);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.swi.readout().contexts).toBe(1);
    expect(r.f.calls.filter((c) => c[0] === 'getContext')).toHaveLength(1);
    expect(r.s.stats.losses).toBe(0);
  });

  // GM-11b box fold (the box at 5650fe4fc, the llvmpipe leg: uiGpuLoss.spec.ts:97 still on the software after 600
  // frames, 13.8 s): a restored context is a new one, its extensions disabled until asked again, so
  // KHR_parallel_shader_compile's COMPLETION_STATUS_KHR is refused after a restore unless the surface asks for it anew.
  it('returned with KHR_parallel_shader_compile: the extension asked again on the restored context; the GPU once linked', () => {
    const r = rig({ parallelCompile: true });
    r.s.create(); r.f.compile.finish(); frame(r);
    expect(r.s.lastPath).toBe('gpu');
    r.s.release(); r.f.events.flush();
    r.s.returned();
    frame(r);                                                // asks restoreContext through the object it kept
    expect(r.f.names()).toContain('restoreContext');
    r.f.events.flush();
    expect(r.s.state).toBe('compiling');
    frame(r);                                                // still linking: the software, not a GL error
    expect(r.s.state).toBe('compiling');
    expect(r.s.stats.losses).toBe(0);
    r.f.compile.finish();
    frame(r);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.s.state).toBe('ready');
    const asked = r.f.calls.filter((c) => c[0] === 'getExtension' && c[1] === 'KHR_parallel_shader_compile');
    expect(asked).toHaveLength(2);                           // at create and at the restore
  });

  it('the fake as a browser: a lost context gives no extension; the surface restores through the object it took live', () => {
    const r = readyRig();
    r.s.release(); r.f.events.flush();
    expect(r.f.gl.getExtension('WEBGL_lose_context')).toBeNull();
    r.s.returned(); frame(r); r.f.events.flush(); frame(r);
    expect(r.s.lastPath).toBe('gpu');
  });

  it('without WEBGL_lose_context: release deletes what the backend made and keeps the context; returned rebuilds on it', () => {
    const r = readyRig({ loseContext: false });
    r.s.release();
    expect(r.s.state).toBe('released');
    expect(r.f.programs.every((p) => p.deleted)).toBe(true);
    expect(r.swi.readout().contexts).toBe(1);               // the context is still held: counted
    r.s.returned();
    frame(r);
    expect(r.s.lastPath).toBe('gpu');
  });

  it('two surfaces count two contexts; a released one one', () => {
    const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
    const make = () => {
      const f = fakeGl({ unmaskedRenderer: GPU_RENDERER });
      const s = new UiGpuSurfacePresenter({ canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: new SoftwareRecorder(), transparent: false, surface: 'front', clock: new TestClock(), host: swi });
      s.create();
      return s;
    };
    const a = make(), b = make();
    expect(swi.readout().contexts).toBe(2);
    a.release();
    expect(swi.readout().contexts).toBe(1);
    b.dispose();
    expect(swi.readout().contexts).toBe(0);
  });
});

describe('GM-12a review F1/F2: a context no path uses is let go and not counted (contexts <= 2 in a match)', () => {
  const loseCalls = (r: Rig): number => r.f.names().filter((n) => n === 'loseContext').length;
  const errorsToDeath = (r: Rig): void => { for (let i = 0; i < 3; i++) { r.f.failNext('clear'); frame(r, [i, 1, 2]); frame(r, [i, 3, 4]); } };

  it('F1: a surface killed by GL errors lets its live context go and counts it down', () => {
    const r = readyRig();
    errorsToDeath(r);
    expect(r.s.state).toBe('dead');
    expect(r.f.st.lost).toBe(true);                           // loseContext asked: the context is let go
    expect(r.swi.readout().contexts).toBe(0);
    r.f.events.flush();                                       // our own loseContext: not another loss
    expect(r.s.stats.losses).toBe(3);
    expect(r.s.state).toBe('dead');
    r.s.release();                                           // the match's leave on a dead surface: nothing more to let go
    expect(r.swi.readout().contexts).toBe(0);
    frame(r);
    expect(r.sw.seen.at(-1)!.scale).toBe(1);
  });

  it('F1: without WEBGL_lose_context the dead surface\'s context cannot be let go and stays counted (honest readout)', () => {
    const r = readyRig({ loseContext: false });
    errorsToDeath(r);
    expect(r.s.state).toBe('dead');
    expect(r.f.st.lost).toBe(false);
    expect(r.swi.readout().contexts).toBe(1);
  });

  it('F1: a late restore after restore-timeout is let go again, never counted', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    r.clock.advance(UI_GPU_RESTORE_WAIT_MS_ADAPTATION);
    expect(r.s.state).toBe('dead');
    expect(r.swi.readout().contexts).toBe(0);
    const before = loseCalls(r);
    r.f.loss.restore(); r.f.events.flush();
    expect(loseCalls(r)).toBe(before + 1);
    expect(r.f.st.lost).toBe(true);
    expect(r.swi.readout().contexts).toBe(0);
    r.f.events.flush();
    expect(r.s.state).toBe('dead');
    expect(r.s.stats.losses).toBe(1);
  });

  it('F1: a restore after a context-loss limit is let go again, never counted', () => {
    const r = readyRig();
    for (let i = 0; i < 2; i++) { r.f.loss.lose(); r.f.events.flush(); r.f.loss.restore(); r.f.events.flush(); frame(r); }
    r.f.loss.lose(); r.f.events.flush();
    expect(r.s.state).toBe('dead');
    r.f.loss.restore(); r.f.events.flush();
    expect(r.f.st.lost).toBe(true);
    expect(r.swi.readout().contexts).toBe(0);
  });

  it('F2: lost, then released (leave), then restored by the browser in the match: let go again, not counted; returned brings it back', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    r.s.release();
    expect(r.s.state).toBe('released');
    expect(r.swi.readout().contexts).toBe(0);
    r.f.loss.restore(); r.f.events.flush();                  // the browser's restore during the match
    expect(r.f.st.lost).toBe(true);                           // let go again
    expect(r.swi.readout().contexts).toBe(0);
    r.f.events.flush();
    expect(r.s.state).toBe('released');
    expect(r.s.stats.losses).toBe(1);
    r.s.returned();
    frame(r);                                                // asks it back
    r.f.events.flush();
    frame(r);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.swi.readout().contexts).toBe(1);
  });

  it('F2: lost, released, returned, then restored before the next present: taken up (built), counted once', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    r.s.release();
    r.s.returned();
    r.f.loss.restore(); r.f.events.flush();
    expect(r.swi.readout().contexts).toBe(1);
    frame(r);
    expect(r.s.lastPath).toBe('gpu');
    expect(r.swi.readout().contexts).toBe(1);
  });
});

describe('GM-12a: dispose on stop()/close()', () => {
  it('deletes everything, lets the context go, takes the listeners and timers off; the software after', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    expect(r.clock.pending).toBe(1);
    r.f.loss.restore(); r.f.events.flush(); frame(r);
    r.s.dispose();
    expect(r.s.state).toBe('disposed');
    expect(r.f.listening('webglcontextlost')).toBe(0);
    expect(r.f.listening('webglcontextrestored')).toBe(0);
    expect(r.clock.pending).toBe(0);
    expect(r.swi.readout().contexts).toBe(0);
    expect(r.f.names()).toContain('loseContext');
    r.s.dispose();                                           // idempotent
    frame(r);
    expect(r.sw.seen.at(-1)!.scale).toBe(2);
  });

  it('dispose while lost clears the restore wait (no kill after)', () => {
    const r = readyRig();
    r.f.loss.lose(); r.f.events.flush();
    r.s.dispose();
    r.clock.advance(UI_GPU_RESTORE_WAIT_MS_ADAPTATION * 2);
    expect(r.swi.readout().kills).toEqual([]);
  });
});

describe('GM-12a: the adaptations (research 380 §5)', () => {
  it('UI_GPU_LOSS_FALLBACK_ADAPTATION: the software frame at 1x, the HD lookup and its quad cache dropped, the rest kept', () => {
    const cache = new UiQuadRasterCache();
    const hd = (): null => null;
    const movie = (): null => null;
    expect(uiGpuLossFallbackOptions({ scale: 4, hd, quadCache: cache, movie, transparent: true })).toEqual({ scale: 1, movie, transparent: true });
    expect(UI_GPU_LOSS_FALLBACK_ADAPTATION).toEqual({ scale: 1 });
  });

  it('the GPU surface names itself and reads the frame from the path that drew it', () => {
    const r = readyRig();
    expect(r.s.kind).toBe('gpu-surface');
    expect(r.s.readFrame()?.width).toBe(1280);
    r.f.loss.lose(); r.f.events.flush();
    frame(r);
    expect(r.s.readFrame()).toBeNull();                      // the recorder holds none: read from the software
  });

  it('GL is the fake\'s: the tokens the lifecycle reads are the specs\'', () => {
    expect([GL.COMPLETION_STATUS_KHR, GL.UNMASKED_RENDERER_WEBGL, GL.RENDERER]).toEqual([0x91b1, 0x9246, 0x1f01]);
  });
});

describe("GM-12a: the front end's lifecycle wiring (source inspection; GM-12b makes the surface behind the switch)", () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
  it("the match's leave releases the GPU surface, its return lets it come back, the page's stop disposes of it", () => {
    expect(src).toMatch(/leave: \(\) => \{[^\n]*menuHold\.leave\(\); uiGpuFront\?\.release\(\);/);
    expect(src).toMatch(/returned: \(\) => \{[^\n]*menuHold\.returned\(\); uiGpuFront\?\.returned\(\);/);
    expect(src).toMatch(/uiGpuFront\?\.dispose\(\);/);
    // GM-12b makes one, only behind the switch (`gpuFront`, made when `uiGpuFrontWanted`), and the GPU modules stay import()-only.
    expect(src).toMatch(/uiGpuFront = gpuFront;/);
    expect(src.match(/uiGpuFront = (?!null)/g)).toHaveLength(1);
    expect(src).not.toMatch(/^import [^;]*uiGpuPresenter/m);
  });
});
