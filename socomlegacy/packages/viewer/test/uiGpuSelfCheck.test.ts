import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, UiQuadRasterCache, type RasterOptions, type UiTextures } from '../src/uiCompositorView';
import type { UiPresenter, UiPresented } from '../src/uiPresenter';
import { UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UI_GPU_SELF_CHECK_ADAPTATION, uiGpuSelfCheckCompare, uiGpuSelfCheckCrop, uiGpuSelfCheckScene } from '../src/uiGpuSelfCheck';
import { UI_GPU_RENDERER_GATE_ADAPTATION, UiGpuSwitch, uiGpuCapability } from '../src/uiGpuSwitch';
import { fakeGl, type Fake, type FakeGlOptions } from './uiGpuFakeGl';

// UIGPU-SELFCHECK (a browser adaptation; the GPU menus' fallback ladder, L4): a surface's drawer draws a known scene
// before its first frame is trusted and is compared with the software's frame of it; a gross mismatch puts every menu
// surface on the software for the session. The player's MacBook Air (Intel HD Graphics 6000, 2026-11-11) drew the
// backdrop and silently not the rows and the text; the fake below models that by drawing the first quad batch after a
// clear and dropping the rest. Evidence kind: unit test, on the fake WebGL2 context (its programs run the f32 twin's
// arithmetic), not a GPU: what that Mac's own readback returns is not shown here.

const clearItem = (rgb: [number, number, number]): UiDrawItem => ({ kind: 'clear', rgb });
const noTextures: UiTextures = () => null;

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

class TestClock {
  t = 1000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  now = (): number => this.t;
  setTimeout = (fn: () => void, ms: number): number => { const id = this.next++; this.timers.push({ at: this.t + ms, fn, id }); return id; };
  clearTimeout = (id: unknown): void => { this.timers = this.timers.filter((x) => x.id !== id); };
}

// Not the reported device's string (that one is gated before any check: the last describe); another Intel Mac's.
const GPU_RENDERER = 'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)';
const REPORTED = 'ANGLE (Intel Inc., Intel(R) HD Graphics 6000, OpenGL 4.1)';

interface Rig { f: Fake; s: UiGpuSurfacePresenter; sw: SoftwareRecorder; swi: UiGpuSwitch; shown: string[]; logs: string[]; reports: string[] }

const rig = (fo: FakeGlOptions = {}, so: Partial<UiGpuSurfaceOptions> = {}): Rig => {
  const f = fakeGl({ unmaskedRenderer: GPU_RENDERER, ...fo });
  const sw = new SoftwareRecorder();
  const swi = new UiGpuSwitch({ search: '', storage: () => null, devTools: false });
  const shown: string[] = [], logs: string[] = [], reports: string[] = [];
  const s = new UiGpuSurfacePresenter({
    canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software: sw, transparent: false, surface: 'front', clock: new TestClock(), host: swi,
    shown: (w) => shown.push(w), log: (l) => logs.push(l), report: (l) => reports.push(l), ...so,
  });
  return { f, s, sw, swi, shown, logs, reports };
};

const frame = (r: Rig, options: RasterOptions = { scale: 2 }): UiPresented => r.s.present([clearItem([10, 20, 30])], noTextures, options);

/** The failure modelled: after each clear of a target, the first instanced quad draw is drawn and every later one dropped, silently. */
const dropAfterBackdrop = (f: Fake): void => {
  const gl = f.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
  const draw = gl.drawArraysInstanced!, clear = gl.clear!, clearBuffer = gl.clearBufferfv;
  let seen = 0;
  gl.clear = (...a: unknown[]): unknown => { seen = 0; return clear(...a); };
  if (clearBuffer) gl.clearBufferfv = (...a: unknown[]): unknown => { seen = 0; return clearBuffer(...a); };
  gl.drawArraysInstanced = (...a: unknown[]): unknown => { seen++; return seen === 1 ? draw(...a) : undefined; };
};

describe('UIGPU-SELFCHECK: the compare', () => {
  const scene = uiGpuSelfCheckScene();
  it('the scene is the kinds of quad a menu frame is made of: a textured backdrop, an untextured panel, glyphs with a shadow pass', () => {
    const kinds = scene.items.map((i) => i.kind);
    expect(kinds).toEqual(['clear', 'sprite', 'sprite', 'glyphs']);
    const [, bg, panel, text] = scene.items as [UiDrawItem, Extract<UiDrawItem, { kind: 'sprite' }>, Extract<UiDrawItem, { kind: 'sprite' }>, Extract<UiDrawItem, { kind: 'glyphs' }>];
    expect(bg.texture).not.toBeNull();
    expect(panel.texture).toBeNull();
    expect(panel.rgba[3]).toBeLessThan(128);
    expect(text.quads.some((q) => q.shadow)).toBe(true);
    expect(text.quads.every((q) => scene.textures(q.texture) !== null)).toBe(true);
  });

  const { x0, y0, x1, y1 } = UI_GPU_SELF_CHECK_ADAPTATION.region;
  const W = x1 - x0, H = y1 - y0;
  // Review F2: the compare takes the probe's rectangle (the GPU's read back as such, the software's cropped).
  const blank = (): Rgba => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) });
  it('equal frames pass; small differences (the twin\'s few units) pass; a gross one over more than the share fails', () => {
    const a = blank(), b = blank();
    expect(uiGpuSelfCheckCompare(a, b).ok).toBe(true);
    const pixels = W * H;
    for (let i = 0; i < pixels; i++) b.data[i * 4] = 3;
    expect(uiGpuSelfCheckCompare(a, b)).toMatchObject({ ok: true, off: 0, maxAbs: 3, pixels });
    const c = blank(), bad = Math.floor(pixels * UI_GPU_SELF_CHECK_ADAPTATION.maxShare) + 1;
    for (let k = 0; k < bad; k++) c.data[k * 4 + 1] = 200;
    const out = uiGpuSelfCheckCompare(a, c);
    expect(out).toMatchObject({ ok: false, off: bad, maxAbs: 200 });
    expect(out.first).toEqual({ x: x0, y: y0, gpu: [0, 0, 0, 0], software: [0, 200, 0, 0] });   // named in frame pixels
  });

  it('the crop takes the probe\'s rectangle out of a whole frame, row by row', () => {
    const frame: Rgba = { width: 640, height: 448, data: new Uint8ClampedArray(640 * 448 * 4) };
    frame.data[(y0 * 640 + x0) * 4] = 7;
    frame.data[((y1 - 1) * 640 + (x1 - 1)) * 4 + 2] = 9;
    const crop = uiGpuSelfCheckCrop(frame);
    expect([crop.width, crop.height]).toEqual([W, H]);
    expect(crop.data[0]).toBe(7);
    expect(crop.data[(H * W - 1) * 4 + 2]).toBe(9);
  });

  it('review F3: each batch dropped alone is caught -- the text-only drops at over 3x the bound (the software drawer, the scene minus a batch)', () => {
    const s = uiGpuSelfCheckScene();
    const draw = (items: UiDrawItem[]): Rgba => uiGpuSelfCheckCrop(rasterizeUiDrawList(items, s.textures, { scale: 1, quadCache: new UiQuadRasterCache() }).frame);
    const full = draw(s.items);
    const text = s.items[3] as Extract<UiDrawItem, { kind: 'glyphs' }>;
    const bound = Math.floor(W * H * UI_GPU_SELF_CHECK_ADAPTATION.maxShare);
    const off = (items: UiDrawItem[]): number => { const o = uiGpuSelfCheckCompare(draw(items), full); expect(o.ok).toBe(false); return o.off; };
    expect(off([s.items[0]!, s.items[1]!, s.items[2]!, { ...text, quads: text.quads.filter((q) => !q.shadow) }])).toBeGreaterThan(3 * bound);   // the shadow pass
    expect(off([s.items[0]!, s.items[1]!, s.items[2]!, { ...text, quads: text.quads.filter((q) => q.shadow) }])).toBeGreaterThan(3 * bound);    // the glyphs
    expect(off([s.items[0]!, s.items[1]!, s.items[2]!])).toBeGreaterThan(3 * bound);                                                          // all the text
    expect(off([s.items[0]!, s.items[1]!, s.items[3]!])).toBeGreaterThan(10 * bound);                                                         // the panel
    expect(off([s.items[0]!, s.items[2]!, s.items[3]!])).toBeGreaterThan(10 * bound);                                                         // the backdrop
  });

  it('frames of different sizes fail', () => {
    expect(uiGpuSelfCheckCompare(blank(), { width: W - 1, height: H, data: new Uint8ClampedArray((W - 1) * H * 4) }).ok).toBe(false);
  });
});

describe('UIGPU-SELFCHECK: the surface', () => {
  it('a drawer that draws the scene as the software does goes ready, its one check passed, nothing reported', () => {
    const r = rig();
    frame(r);
    expect(r.s.state).toBe('ready');
    expect(r.s.lastPath).toBe('gpu');
    expect(r.s.selfChecks).toHaveLength(1);
    expect(r.s.selfChecks[0]).toMatchObject({ ok: true });
    expect(r.s.selfChecks[0]!.result!.off).toBe(0);
    expect(r.reports).toEqual([]);
    expect(r.swi.readout().kills).toEqual([]);
  });

  it('a drawer that draws the backdrop and drops the rest: L4 (self-check), every surface killed, one report naming the renderer', () => {
    const r = rig();
    dropAfterBackdrop(r.f);
    frame(r);
    expect(r.s.state).toBe('unavailable');
    expect(r.s.stats.unavailable).toBe('self-check');
    expect(r.s.lastPath).toBe('software');
    expect(r.sw.seen).toHaveLength(1);
    expect(r.sw.seen[0]!.scale).toBe(1);                       // L4 draws the original frame (GM-28)
    expect(r.shown).toContain('software');
    expect(r.swi.readout().kills).toEqual([{ reason: 'self-check', surface: null }]);
    for (const s of ['front', 'armory', 'overlay', 'loading'] as const) expect(r.swi.resolve(s, 1).mode).toBe('off');
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]).toContain('uiGpu self-check');
    expect(r.reports[0]).toContain(GPU_RENDERER);
    expect(r.swi.readout().contexts).toBe(0);                  // the context let go
    frame(r);
    expect(r.reports).toHaveLength(1);                         // once: the surface stays on the software
    expect(r.s.selfChecks).toHaveLength(1);
  });

  it('a context restore runs it again; a drawer gone wrong after the restore ends on the software', () => {
    const r = rig();
    frame(r);
    expect(r.s.state).toBe('ready');
    r.f.loss.lose(); r.f.events.flush();
    dropAfterBackdrop(r.f);
    r.f.loss.restore(); r.f.events.flush();
    frame(r);
    expect(r.s.selfChecks).toHaveLength(2);
    expect(r.s.selfChecks[1]!.ok).toBe(false);
    expect(r.s.state).toBe('unavailable');
    expect(r.reports).toHaveLength(1);
  });

  it('a restore on a healthy drawer passes its second check and stays on the GPU', () => {
    const r = rig();
    frame(r);
    r.f.loss.lose(); r.f.events.flush();
    r.f.loss.restore(); r.f.events.flush();
    frame(r);
    expect(r.s.selfChecks.map((c) => c.ok)).toEqual([true, true]);
    expect(r.s.lastPath).toBe('gpu');
  });

  it('a GL error inside the check is a loss, as inside a present (the context rebuilt, the check run again)', () => {
    const r = rig();
    r.s.create();
    r.f.failNext('readPixels');
    frame(r);
    expect(r.logs.some((l) => l.includes('self-check'))).toBe(true);
    expect(r.s.stats.losses).toBe(1);
    expect(r.reports).toEqual([]);
  });

  it('a transparent surface (the overlay) is checked on its divided frame and passes on a healthy drawer', () => {
    const r = rig({ alphaCanvas: true }, { transparent: true, surface: 'overlay' });
    frame(r, { scale: 2, transparent: true });
    expect(r.s.selfChecks[0]).toMatchObject({ ok: true });
    expect(r.s.state).toBe('ready');
  });

  it('review F1: a context lost between the draw and the read-back (no throw, the bytes left zero) is a loss, never a self-check kill', () => {
    const r = rig();
    const gl = r.f.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    const read = gl.readPixels!;
    let once = true;
    gl.readPixels = (...a: unknown[]): unknown => { if (once) { once = false; r.f.loss.lose(); } return read(...a); };
    frame(r);
    expect(r.reports).toEqual([]);
    expect(r.swi.readout().kills).toEqual([]);
    expect(r.s.stats.unavailable).toBeNull();
    expect(r.s.stats.losses).toBe(1);
    expect(r.s.state).toBe('lost');
    expect(r.logs.some((l) => l.includes('self-check'))).toBe(true);
  });

  it('delta review: a read-back of all zeros with the context not (yet) flagged lost is a loss, never a self-check kill', () => {
    const r = rig();
    const gl = r.f.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    const read = gl.readPixels!;
    let once = true;
    gl.readPixels = (...a: unknown[]): unknown => {
      const out = read(...a);
      if (once) { once = false; (a[6] as Uint8Array).fill(0); }       // a GPU process gone under the read, its flag not raised yet
      return out;
    };
    frame(r);
    expect(r.reports).toEqual([]);
    expect(r.swi.readout().kills).toEqual([]);
    expect(r.s.stats.unavailable).toBeNull();
    expect(r.s.stats.losses).toBe(1);
    expect(r.logs.some((l) => l.includes('self-check') && l.includes('alpha'))).toBe(true);
    frame(r);                                                          // the rebuilt backend links and checks at the next frame
    expect(r.s.selfChecks.map((c) => c.ok)).toEqual([true]);          // on a live drawer it passes
    expect(r.s.lastPath).toBe('gpu');
  });

  it('review F2: each pass reads back only the probe\'s rectangle, never the whole frame', () => {
    const r = rig();
    const gl = r.f.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    const read = gl.readPixels!;
    const sizes: number[][] = [];
    gl.readPixels = (...a: unknown[]): unknown => { sizes.push([a[0], a[1], a[2], a[3]] as number[]); return read(...a); };
    frame(r);
    const { x0, y0, x1, y1 } = UI_GPU_SELF_CHECK_ADAPTATION.region;
    expect(sizes).toEqual(UI_GPU_SELF_CHECK_ADAPTATION.blends.map(() => [x0, y0, x1 - x0, y1 - y0]));
    expect(r.s.selfChecks[0]).toMatchObject({ ok: true });
  });
});

describe('UIGPU-SELFCHECK: the narrow gate (UI_GPU_RENDERER_GATE_ADAPTATION)', () => {
  const caps = (renderer: string) => ({ webgl2: true, renderer, rendererSource: 'unmasked' as const, maxTextureSize: 16384, programsLinked: true });
  it('the reported renderer family (Intel HD Graphics 6000 on the OpenGL back end of ANGLE) is L4 at the gate, before any compile', () => {
    expect(UI_GPU_RENDERER_GATE_ADAPTATION.length).toBeGreaterThan(0);
    expect(uiGpuCapability(caps(REPORTED), false)).toEqual({ ok: false, reason: 'renderer-gate' });
    const r = rig({ unmaskedRenderer: REPORTED });
    expect(r.s.create()).toEqual({ ok: false, reason: 'renderer-gate' });
    expect(r.s.state).toBe('unavailable');
    expect(r.f.names().filter((n) => n === 'linkProgram')).toHaveLength(0);
    frame(r);
    expect(r.s.lastPath).toBe('software');
    expect(r.sw.seen[0]!.scale).toBe(1);
  });
  it('review nit: the same GPU on ANGLE\'s OpenGL back end elsewhere is gated too -- Chrome on Linux (Mesa)', () => {
    expect(uiGpuCapability(caps('ANGLE (Intel, Mesa Intel(R) HD Graphics 6000 (BDW GT3), OpenGL 4.6)'), false)).toEqual({ ok: false, reason: 'renderer-gate' });
  });

  it('nothing else is gated: other Intel Macs (Iris 655, HD 5000, HD 6100), a Metal back end, a D3D11 GPU, a masked string', () => {
    for (const ok of [GPU_RENDERER, 'ANGLE (Intel, ANGLE Metal Renderer: Intel(R) HD Graphics 6000, Unspecified Version)',
      'ANGLE (Intel Inc., Intel(R) HD Graphics 5000, OpenGL 4.1)', 'ANGLE (Intel Inc., Intel(R) HD Graphics 6100, OpenGL 4.1)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'WebKit WebGL']) {
      expect(uiGpuCapability(caps(ok), false), ok).toEqual({ ok: true });
    }
  });
});
