// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import {
  drawScene, PHASE_EASE, PHASE_PER_CAT, SHEET_BASE, SheetBackdrop, sheetBottom, SHEETS, sheetTop, STILL_T, type Ctx2D,
} from '../../src/console/render/sheets';
import { THEMES } from '../../src/console/render/theme';
import { mountShell } from './shell';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the sheet backdrop, the artifact's canvas (`S2-Launcher-v2.dc.html`,
 * `draw(t)` and `frame(ts)`), drawn against a recording context. A browser adaptation.
 */

interface Call { op: string; args: unknown[] }
function recorder(): Ctx2D & { calls: Call[]; ops: () => string[] } {
  const calls: Call[] = [];
  const grad = (kind: string) => (...args: unknown[]) => {
    const stops: [number, string][] = [];
    calls.push({ op: kind, args });
    return { kind, stops, addColorStop: (o: number, c: string) => { stops.push([o, c]); } };
  };
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const ctx = {
    calls,
    ops: () => calls.map((c) => c.op),
    setTransform: rec('setTransform'), createLinearGradient: grad('linear'), createRadialGradient: grad('radial'),
    fillRect: rec('fillRect'), drawImage: rec('drawImage'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), fill: rec('fill'), stroke: rec('stroke'), save: rec('save'), restore: rec('restore'),
    _fill: null as unknown, _stroke: null as unknown, lineWidth: 1, _alpha: 1, globalCompositeOperation: 'source-over',
    get fillStyle() { return this._fill; }, set fillStyle(v: unknown) { this._fill = v; calls.push({ op: 'fillStyle', args: [v] }); },
    get strokeStyle() { return this._stroke; }, set strokeStyle(v: unknown) { this._stroke = v; calls.push({ op: 'strokeStyle', args: [v] }); },
    get globalAlpha() { return this._alpha; }, set globalAlpha(v: number) { this._alpha = v; calls.push({ op: 'globalAlpha', args: [v] }); },
  };
  return ctx as unknown as Ctx2D & { calls: Call[]; ops: () => string[] };
}

describe('the sheets (the artifact\'s geometry)', () => {
  it('are the artifact\'s four, in its order', () => {
    expect(SHEETS).toEqual([
      { a: 0.9, f1: 0.0011, f2: 0.0029, s1: 0.16, s2: -0.22, amp: 0.065, thick: 0.05, o: 0 },
      { a: 0.7, f1: 0.0009, f2: 0.0034, s1: -0.12, s2: 0.19, amp: 0.055, thick: 0.035, o: 1.7 },
      { a: 0.55, f1: 0.0013, f2: 0.0022, s1: 0.1, s2: 0.27, amp: 0.075, thick: 0.065, o: 3.1 },
      { a: 0.4, f1: 0.0007, f2: 0.0041, s1: -0.08, s2: -0.15, amp: 0.045, thick: 0.025, o: 4.6 },
    ]);
    expect(SHEET_BASE).toBe(0.73);
    expect(STILL_T).toBe(4);
    expect([PHASE_PER_CAT, PHASE_EASE]).toEqual([1.1, 0.04]);
  });
  it('each upper edge swings about 73% of the height within its amplitude; the lower edge is under it, by at most its thickness', () => {
    const h = 1000;
    for (const S of SHEETS) for (let x = 0; x <= 1920; x += 37) for (const t of [0, 4, 19.5]) {
      const top = sheetTop(x, S, h, t, 2.2);
      expect(Math.abs(top - h * 0.73)).toBeLessThanOrEqual(h * (S.amp + 0.012) + 1e-9);
      const bot = sheetBottom(x, S, h, t, 2.2);
      expect(bot).toBeGreaterThanOrEqual(top + h * S.thick * 0.1 - 1e-9);
      expect(bot).toBeLessThanOrEqual(top + h * S.thick + 1e-9);
    }
    // the artifact's formula at one point: base + sin(x f1 + t s1 + ph + o) h amp + sin(x f2 + t s2 + 2o) h 0.012
    const S = SHEETS[1]!;
    expect(sheetTop(100, S, 800, 2, 0.5)).toBeCloseTo(800 * 0.73 + Math.sin(100 * 0.0009 + 2 * -0.12 + 0.5 + 1.7) * 800 * 0.055 + Math.sin(100 * 0.0034 + 2 * 0.19 + 3.4) * 800 * 0.012, 9);
  });
});

describe('a frame', () => {
  const scene = (theme = THEMES[0]!, picture: { img: CanvasImageSource; w: number; h: number } | null = null) => ({ w: 1920, h: 1080, t: 4, phase: 2.2, theme, picture });
  it('the sky is the theme\'s top to bottom, then the glow, four sheets added light (each filled, its edge stroked), the dots, the vignette last', () => {
    const ctx = recorder();
    drawScene(ctx, scene(THEMES[1]));
    const sky = ctx.calls.find((c) => c.op === 'linear')!;
    expect(sky.args).toEqual([0, 0, 0, 1080]);
    const ops = ctx.ops();
    expect(ops.indexOf('save')).toBeGreaterThan(ops.indexOf('radial'));
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(4);
    expect(ctx.calls.filter((c) => c.op === 'stroke')).toHaveLength(4);         // Deep Water: no gold trim
    const dots = ctx.calls.filter((c) => c.op === 'fillRect' && c.args[2] === 1 && c.args[3] === 1);
    expect(dots).toHaveLength(Math.ceil((1920 - 40) / 48) * Math.ceil((1080 - 40) / 48));
    expect(ctx.calls.at(-1)).toEqual({ op: 'fillRect', args: [0, 0, 1920, 1080] });
    expect(ctx.calls.filter((c) => c.op === 'radial')).toHaveLength(2);
    expect(ctx.calls.filter((c) => c.op === 'drawImage')).toHaveLength(0);
  });
  it('the themes with the gold trim stroke a fifth line, the first sheet\'s lower edge', () => {
    for (const t of THEMES) {
      const ctx = recorder();
      drawScene(ctx, scene(t));
      expect(ctx.calls.filter((c) => c.op === 'stroke'), t.id).toHaveLength(t.gold ? 5 : 4);
    }
  });
  it('with the picture on, the art is drawn covering, the sky laid over it at 0.74, then the rest', () => {
    const ctx = recorder();
    const img = {} as CanvasImageSource;
    drawScene(ctx, scene(THEMES[0], { img, w: 1000, h: 500 }));
    const draw = ctx.calls.find((c) => c.op === 'drawImage')!;
    // cover: scale max(1920/1000, 1080/500) = 2.16 -> 2160 x 1080, centred
    expect(draw.args).toEqual([img, (1920 - 2160) / 2, 0, 2160, 1080]);
    const ops = ctx.ops();
    expect(ops.indexOf('drawImage')).toBeLessThan(ops.indexOf('radial'));
    expect(ctx.calls.filter((c) => c.op === 'globalAlpha').map((c) => c.args[0])).toEqual([0.74, 1]);
  });
});

describe('the loop', () => {
  let frames: ((ts: number) => void)[];
  let reduced: boolean;
  let host: HTMLElement;
  let ctx: ReturnType<typeof recorder>;
  const make = () => new SheetBackdrop(host, {
    context: () => ctx, frame: (cb) => { frames.push(cb); return frames.length; }, cancel: () => { frames.length = 0; }, reduced: () => reduced,
  });
  const run = (ts: number) => { const f = frames.shift(); f?.(ts); return !!f; };
  beforeEach(() => {
    frames = []; reduced = false; ctx = recorder();
    document.body.innerHTML = '<div id="backdrop"><img alt=""></div>';
    host = document.getElementById('backdrop')!;
  });

  it('mounts its canvas first in the backdrop, marked for the page\'s sheet; dispose takes it away', () => {
    const b = make();
    expect(host.firstElementChild).toBe(b.canvas);
    expect(b.canvas.className).toBe('cx-sheets');
    expect(b.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(host.classList.contains('has-sheets')).toBe(true);
    b.dispose();
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.classList.contains('has-sheets')).toBe(false);
  });
  it('a resize of the canvas redraws a still backdrop (review F1): a ResizeObserver on the canvas, disconnected by dispose', () => {
    const seen: { target?: Element; cb: () => void; disconnected: boolean }[] = [];
    const W = window as unknown as { ResizeObserver?: unknown };
    W.ResizeObserver = class { rec: (typeof seen)[number]; constructor(cb: () => void) { this.rec = { cb, disconnected: false }; seen.push(this.rec); } observe(t: Element) { this.rec.target = t; } disconnect() { this.rec.disconnected = true; } };
    try {
      const b = make();
      expect(seen).toHaveLength(1);
      expect(seen[0]!.target).toBe(b.canvas);
      b.set({ cat: 1, theme: THEMES[0]!, motion: false, picture: false });
      run(0);
      expect(frames).toHaveLength(0);                       // still: settled, no frame pending
      seen[0]!.cb();
      expect(frames).toHaveLength(1);                       // the resize asks for one
      run(16);
      expect(frames).toHaveLength(0);
      b.dispose();
      expect(seen[0]!.disconnected).toBe(true);
    } finally { delete W.ResizeObserver; }
  });
  it('without a ResizeObserver, the window resize event does the same, and dispose removes it', () => {
    const b = make();
    b.set({ cat: 1, theme: THEMES[0]!, motion: false, picture: false });
    run(0);
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(1);
    run(16);
    b.dispose();
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(0);
  });
  it('still (Backdrop motion off): the first frame stands at the category\'s phase, and no frame follows', () => {
    const b = make();
    b.set({ cat: 2, theme: THEMES[0]!, motion: false, picture: false });
    expect(run(1000)).toBe(true);
    expect(b.leaning).toBeCloseTo(2.2, 9);
    expect(frames).toHaveLength(0);
  });
  it('a category change eases the phase 4% a frame toward the new one, then stops asking for frames once it is there', () => {
    const b = make();
    b.set({ cat: 2, theme: THEMES[0]!, motion: false, picture: false });
    run(0);
    b.set({ cat: 3, theme: THEMES[0]!, motion: false, picture: false });
    run(16);
    expect(b.leaning).toBeCloseTo(2.2 + (3.3 - 2.2) * 0.04, 9);
    let n = 0;
    while (run(16 * ++n) && n < 1000) { /* ease */ }
    expect(n).toBeLessThan(1000);
    expect(b.leaning).toBeCloseTo(3.3, 9);
  });
  it('drifting (Backdrop motion on): every frame asks for the next', () => {
    const b = make();
    b.set({ cat: 2, theme: THEMES[0]!, motion: true, picture: false });
    for (let i = 0; i < 5; i++) expect(run(i * 16)).toBe(true);
    expect(frames).toHaveLength(1);
    b.dispose();
    expect(frames).toHaveLength(0);
  });
  it('reduced motion: still even with motion on, and the phase moves at once', () => {
    const b = make();
    reduced = true;
    b.set({ cat: 0, theme: THEMES[0]!, motion: true, picture: false });
    run(0);
    b.set({ cat: 4, theme: THEMES[0]!, motion: true, picture: false });
    run(16);
    expect(b.leaning).toBeCloseTo(4.4, 9);
    expect(frames).toHaveLength(0);
  });
});

describe('the page', () => {
  let page: ConsolePage | null = null;
  const W = window as unknown as { CanvasRenderingContext2D?: unknown; requestAnimationFrame?: unknown };
  const raf = window.requestAnimationFrame;
  beforeEach(() => {
    mountShell(document);
    W.CanvasRenderingContext2D = function CanvasRenderingContext2D() { /* a test's canvas */ };
    W.requestAnimationFrame = () => 0;                              // a frame that never comes: the mount is what is read
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => recorder()) as never);
  });
  afterEach(() => { page?.dispose(); page = null; delete W.CanvasRenderingContext2D; W.requestAnimationFrame = raf; vi.restoreAllMocks(); });

  it('the launcher mounts one sheet backdrop in #backdrop, across draws', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.render(); page.render();
    expect(document.querySelectorAll('#backdrop canvas.cx-sheets')).toHaveLength(1);
    expect(document.getElementById('backdrop')!.classList.contains('has-sheets')).toBe(true);
  });
  it('the overlay draws none (its game is the background, OT.R60 (d))', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false, mode: 'overlay', page: { gameHolds: () => false, roundRunning: () => false, gamePage: () => true } });
    expect(document.querySelector('#backdrop canvas')).toBeNull();
  });
});
