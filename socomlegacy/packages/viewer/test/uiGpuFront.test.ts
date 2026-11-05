// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { frameCanvas, setBrightness } from '../src/brightness';
import { drawsMenuFrame, mountFrontEnd } from '../src/frontEnd';
import { SCREEN_ORIGIN_CANVASES, layScreenOrigin } from '../src/screenOrigin';
import type { RasterOptions, UiTextures } from '../src/uiCompositorView';
import {
  FRONT_END_GPU_ID, FrontEndGpu, UI_GPU_STANDBY_CLASS, uiGpuFrontPath, uiGpuFrontWanted, type FrontEndGpuSurface,
} from '../src/uiGpuFront';
import { UiGpuSurfacePresenter, type UiGpuSurfaceOptions } from '../src/uiGpuPresenter';
import { UiGpuSwitch, uiGpuPageTable } from '../src/uiGpuSwitch';
import type { UiPresented, UiPresenter } from '../src/uiPresenter';
import { fakeGl } from './uiGpuFakeGl';

// GM-12b (plan 2026-11-01-gpu-menus, row GM-12b; "Canvases and contexts"; GM.R16, GM.R17): the front end's GPU canvas
// on the page -- `#front-end-gpu` beside `#front-end`, the swap between them at a tick boundary, the frame not drawn
// while the menus are hidden on the GPU path, the keys and taps on both canvases, BRIGHTNESS and SCREEN POSITION on
// both, the surface let go with the session. PRODUCT TRACK, a browser adaptation: it decides which canvas shows a frame,
// never a byte of it. Evidence kind: unit tests (jsdom; the surface on the fake WebGL2, `./uiGpuFakeGl.ts`, not a GPU)
// and source inspection of the page's loop; the rendered run is `e2e/uiGpuSwitch.spec.ts` (written, the box's).

const sw = (search = ''): UiGpuSwitch => new UiGpuSwitch({ search, storage: () => null, devTools: false });

/** A surface stand-in: `lastPath` as the test sets it, every lifecycle call recorded. */
class SurfaceRecorder implements FrontEndGpuSurface {
  readonly kind = 'gpu-surface';
  lastPath: 'gpu' | 'software' | null = null;
  readonly calls: string[] = [];
  present(_i: readonly UiDrawItem[], _t: UiTextures, o: RasterOptions = {}): UiPresented { this.calls.push('present'); const s = o.scale ?? 1; return { undrawn: [], width: 640 * s, height: 448 * s }; }
  readFrame(): Rgba | null { return null; }
  undrawn(): readonly string[] { return []; }
  release(): void { this.calls.push('release'); }
  returned(): void { this.calls.push('returned'); }
  dispose(): void { this.calls.push('dispose'); }
}

/** The page's two canvases' placement, as `mountFrontEnd` lays it (`placeFrontEndCanvas`). */
const place = (el: HTMLCanvasElement): void => { el.style.position = 'fixed'; el.style.inset = '0'; el.style.objectFit = 'contain'; el.style.zIndex = '1000'; };

const twin = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.id = 'front-end'; c.width = 640; c.height = 448;
  place(c);
  document.body.append(c);
  frameCanvas(c);
  return c;
};

afterEach(() => { document.body.replaceChildren(); setBrightness(0.5); vi.restoreAllMocks(); });

describe('GM-12b: the GPU canvas is made only when the switch asks `front` of the GPU (nothing changes for players)', () => {
  it('the landed table (every cell off), a URL off, the stored kill: no canvas, no surface', () => {
    expect(uiGpuFrontWanted(sw())).toBe(false);
    expect(uiGpuFrontWanted(sw('?uiGpu=off'))).toBe(false);
    expect(uiGpuFrontWanted(sw('?uiGpu=on&uiGpuSurface=overlay'))).toBe(false);
    expect(uiGpuFrontWanted(new UiGpuSwitch({ search: '', storage: () => ({ getItem: () => 'off' }), devTools: false }))).toBe(false);
    const t = twin();
    expect(FrontEndGpu.mount({ doc: document, twin: t, sw: sw(), place, load: () => Promise.reject(new Error('never asked')) })).toBeNull();
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
  });

  it('`?uiGpu=on` asks it at either scale; GM-16: `?uiGpu=shadow` too (the GPU drawn offscreen beside the software shown)', () => {
    expect(uiGpuFrontWanted(sw('?uiGpu=on'))).toBe(true);
    expect(uiGpuFrontWanted(sw('?uiGpu=on&uiGpuSurface=front'))).toBe(true);
    expect(uiGpuFrontWanted(sw('?uiGpu=shadow'))).toBe(true);
    expect(uiGpuFrontWanted(sw('?uiGpu=shadow&uiGpuSurface=overlay'))).toBe(false);
    const hdOnly = new UiGpuSwitch({ search: '', storage: () => null, devTools: false, table: { front: { hd: 'on', sd: 'off' }, armory: { hd: 'off', sd: 'off' }, overlay: { hd: 'off', sd: 'off' }, loading: { hd: 'off', sd: 'off' } } });
    expect(uiGpuFrontWanted(hdOnly)).toBe(true);
  });
});

describe('GM-12b: which canvas draws a scale (the page\'s path)', () => {
  it('`on` at the scale: the GPU path; `off` at the scale (a table HD on, scale 1 off): today\'s path on #front-end', () => {
    expect(uiGpuFrontPath(sw('?uiGpu=on'), 1)).toBe('gpu');
    expect(uiGpuFrontPath(sw('?uiGpu=on'), 4)).toBe('gpu');
    const hdOnly = new UiGpuSwitch({ search: '', storage: () => null, devTools: false, table: { front: { hd: 'on', sd: 'off' }, armory: { hd: 'off', sd: 'off' }, overlay: { hd: 'off', sd: 'off' }, loading: { hd: 'off', sd: 'off' } } });
    expect(uiGpuFrontPath(hdOnly, 4)).toBe('gpu');
    expect(uiGpuFrontPath(hdOnly, 1)).toBe('software');
    expect(uiGpuFrontPath(sw(), 4)).toBe('software');
  });

  it('the surface\'s own session kill (loss limit, restore wait) keeps the surface: its L3 software at 1x, the ladder\'s', () => {
    for (const reason of ['loss-limit', 'restore-timeout'] as const) {
      const s = sw('?uiGpu=on');
      s.kill(reason, 'front');
      expect(uiGpuFrontPath(s, 4)).toBe('gpu');
    }
  });

  it('any other session kill (a guard trip, GM-16) resolves `off`: today\'s path at the player\'s scale (GM.R16)', () => {
    const s = sw('?uiGpu=on');
    s.kill('guard-trip', 'front');
    expect(uiGpuFrontPath(s, 4)).toBe('software');
  });

  it('GM-16: shadow at a scale goes through the surface (it shows the software and draws the GPU offscreen); killed, today\'s path', () => {
    expect(uiGpuFrontPath(sw('?uiGpu=shadow'), 4)).toBe('gpu');
    expect(uiGpuFrontPath(sw('?uiGpu=shadow'), 1)).toBe('gpu');
    for (const reason of ['guard-trip', 'loss-limit', 'restore-timeout'] as const) {
      const s = sw('?uiGpu=shadow');
      s.kill(reason, 'front');
      expect(uiGpuFrontPath(s, 4), reason).toBe('software');      // a shadow surface's kill is today's path, never its L3
    }
  });

  it('GM-16: off makes nothing -- a URL off over a shadow table, the stored kill, the landed table: no canvas, no WebGL context asked', () => {
    const table = { front: { hd: 'shadow', sd: 'off' }, armory: { hd: 'off', sd: 'off' }, overlay: { hd: 'off', sd: 'off' }, loading: { hd: 'off', sd: 'off' } } as const;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    for (const s of [
      new UiGpuSwitch({ search: '?uiGpu=off', storage: () => null, devTools: false, table }),
      new UiGpuSwitch({ search: '', storage: () => ({ getItem: () => 'off' }), devTools: false, table }),
      new UiGpuSwitch({ search: '', storage: () => null, devTools: false }),
    ]) {
      expect(uiGpuFrontWanted(s)).toBe(false);
      expect(FrontEndGpu.mount({ doc: document, twin: twin(), sw: s, place, load: () => Promise.reject(new Error('never asked')) })).toBeNull();
    }
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('GM.R17: hidden frames are not drawn on the GPU path at any scale; the software path draws them at scale 1 as it always has', () => {
    for (const scale of [1, 2, 4]) {
      expect(drawsMenuFrame({ menusHidden: true }, scale, true)).toBe(false);
      expect(drawsMenuFrame({ menusHidden: false }, scale, true)).toBe(true);
    }
    expect(drawsMenuFrame({ menusHidden: true }, 1, false)).toBe(true);
    expect(drawsMenuFrame({ menusHidden: true }, 4, false)).toBe(false);
    expect(drawsMenuFrame({ menusHidden: true }, 1)).toBe(true);    // the software path's call, unchanged
  });
});

describe('GM-12b: `#front-end-gpu`, the sibling canvas', () => {
  const made = (search = '?uiGpu=on', load: () => Promise<FrontEndGpuSurface> = () => new Promise(() => {})) => {
    const t = twin();
    const laid: number[] = [];
    const g = FrontEndGpu.mount({ doc: document, twin: t, sw: sw(search), place, load, laid: () => laid.push(1) })!;
    return { t, g, laid };
  };

  it('made beside #front-end with the same placement, 640 x 448, in standby (the software shows first)', () => {
    const { t, g } = made();
    expect(g.canvas.id).toBe(FRONT_END_GPU_ID);
    expect(t.nextElementSibling).toBe(g.canvas);
    expect(g.canvas.style.cssText).toBe(t.style.cssText);
    expect([g.canvas.width, g.canvas.height]).toEqual([640, 448]);
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    expect(g.canvas.hidden).toBe(false);
  });

  it('BRIGHTNESS: registered by frameCanvas, both canvases carry the same filter at every value', () => {
    const { t, g } = made();
    for (const b of [0, 0.2, 0.5, 0.77, 1]) {
      setBrightness(b);
      expect(g.canvas.style.filter).toBe(t.style.filter);
    }
    setBrightness(1);
    expect(g.canvas.style.filter).toBe(`brightness(${1 + 102 / 128})`);
  });

  it('SCREEN POSITION: the origin is laid on #front-end-gpu as on #front-end', () => {
    const { t, g } = made();
    expect(SCREEN_ORIGIN_CANVASES).toContain(`#${FRONT_END_GPU_ID}`);
    const box = { left: 0, top: 0, width: 1280, height: 896, right: 1280, bottom: 896, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    vi.spyOn(t, 'getBoundingClientRect').mockReturnValue(box);
    vi.spyOn(g.canvas, 'getBoundingClientRect').mockReturnValue(box);
    layScreenOrigin(document, { x: 3, y: -2 });
    for (const p of ['--s2u-origin-x', '--s2u-origin-y']) expect(g.canvas.style.getPropertyValue(p)).toBe(t.style.getPropertyValue(p));
    expect(g.canvas.style.getPropertyValue('--s2u-origin-x')).toBe('6px');
  });

  it('the swap waits for the tick boundary: a frame on the GPU shows only at commit, and a commit that shows a canvas re-lays the origin', () => {
    const { g, laid } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'gpu';
    g.drawn(true);
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);   // not yet: the tick is not over
    expect(g.shown).toBe('software');
    g.commit();
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(false);
    expect(g.shown).toBe('gpu');
    expect(laid).toHaveLength(1);
    g.commit();
    expect(laid).toHaveLength(1);                                             // nothing changed: nothing re-laid
    s.lastPath = 'software';                                                  // a loss: the surface drew on #front-end
    g.drawn(true);
    g.commit();
    expect(g.shown).toBe('software');
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    s.lastPath = 'gpu';
    g.drawn(false);                                                           // the page drew on #front-end (its path)
    g.commit();
    expect(g.shown).toBe('software');
  });

  it('GM-16: a shadow frame (the surface drew the software, the GPU offscreen) keeps #front-end shown and the GPU canvas in standby', () => {
    const { g, laid } = made('?uiGpu=shadow');
    const s = new SurfaceRecorder();
    g.attach(s);
    expect(g.drawsOn(4)).toBe(true);
    s.lastPath = 'software';
    g.drawn(true);
    g.want('software');
    g.commit();
    expect(g.shown).toBe('software');
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    expect(laid).toHaveLength(0);
  });

  it('a tick that draws nothing keeps the canvas shown; the surface\'s `shown(\'gpu\')` is taken at the next commit', () => {
    const { g } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'gpu'; g.drawn(true); g.commit();
    g.commit();
    expect(g.shown).toBe('gpu');
    g.want('gpu');
    g.commit();
    expect(g.shown).toBe('gpu');
  });

  it('GM-12b review F1: a loss between ticks (`shown(\'software\')`, #front-end holding an old frame) is held until a software frame is on #front-end', () => {
    const { g } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'gpu'; g.drawn(true); g.commit();
    g.want('software');                                                       // the loss's `shown`, outside a draw
    g.commit();                                                               // a tick with ticks === 0: nothing drawn
    expect(g.shown).toBe('gpu');                                              // #front-end's old frame never shows
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(false);
    g.commit();
    expect(g.shown).toBe('gpu');
    s.lastPath = 'software'; g.drawn(true);                                   // the surface's L2 frame on #front-end
    g.commit();
    expect(g.shown).toBe('software');
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
  });

  it('GM-12b review F1: a software frame already on #front-end, or the canvases hidden (the match\'s leave), takes `shown(\'software\')` at the commit', () => {
    const { t, g } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'software'; g.drawn(true); g.commit();
    g.want('software');
    g.commit();
    expect(g.shown).toBe('software');
    s.lastPath = 'gpu'; g.drawn(true); g.commit();
    t.hidden = true;                                                          // leave: hidden, then the surface's release
    g.want('software');
    g.commit();
    expect(g.shown).toBe('software');
    expect(g.canvas.hidden).toBe(true);
    t.hidden = false;
    s.lastPath = 'gpu'; g.drawn(true); g.commit();
    g.want('software');                                                       // held while shown ...
    t.hidden = true;                                                          // ... then the hold hides both
    g.commit();
    expect(g.shown).toBe('software');                                         // nothing shows: taken, so the return shows no lost context
  });

  it('the match\'s hold: #front-end hidden hides #front-end-gpu at the commit, and its classes (the touch layer\'s) are mirrored', () => {
    const { t, g } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'gpu'; g.drawn(true);
    t.classList.add('mobile-game-frame');
    t.hidden = true;
    g.commit();
    expect(g.canvas.hidden).toBe(true);
    expect(g.canvas.classList.contains('mobile-game-frame')).toBe(true);
    t.hidden = false;
    t.classList.remove('mobile-game-frame');
    g.commit();
    expect(g.canvas.hidden).toBe(false);
    expect(g.canvas.classList.contains('mobile-game-frame')).toBe(false);
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(false);
  });

  it('the surface is asked for after the first software frame (GM.R15), once; the GPU path waits for it', async () => {
    let asked = 0;
    const s = new SurfaceRecorder();
    const { g } = made('?uiGpu=on', () => { asked++; return Promise.resolve(s); });
    expect(asked).toBe(0);
    expect(g.drawsOn(1)).toBe(false);                                         // no surface yet: today's path
    g.drawn(false);
    g.drawn(false);
    expect(asked).toBe(1);
    await Promise.resolve(); await Promise.resolve();
    expect(g.surface).toBe(s);
    expect(g.drawsOn(1)).toBe(true);
  });

  it('a load that fails leaves today\'s path, said once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { g } = made('?uiGpu=on', () => Promise.reject(new Error('chunk failed')));
    g.drawn(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(g.surface).toBeNull();
    expect(g.drawsOn(1)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('release / returned reach the surface; dispose lets it go and shows the software; a surface that lands after is let go at once', async () => {
    const { g } = made();
    const s = new SurfaceRecorder();
    g.attach(s);
    s.lastPath = 'gpu'; g.drawn(true); g.commit();
    g.release(); g.returned();
    expect(s.calls).toEqual(['release', 'returned']);
    g.dispose();
    expect(s.calls).toEqual(['release', 'returned', 'dispose']);
    expect(g.surface).toBeNull();
    expect(g.shown).toBe('software');
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    const late = new SurfaceRecorder();
    g.attach(late);
    expect(late.calls).toEqual(['dispose']);
    expect(g.surface).toBeNull();
    g.remove();
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
  });

  it('on the fake WebGL2: a frame drawn on the GPU canvas shows it at the commit; a loss shows #front-end (L2) at the next', () => {
    const t = twin();
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    const software: UiPresenter & { n: number } = { kind: 'cpu', n: 0, present(_i, _t, o = {}) { this.n++; const k = o.scale ?? 1; return { undrawn: [], width: 640 * k, height: 448 * k }; }, readFrame: () => null, undrawn: () => [] };
    const s0 = sw('?uiGpu=on');
    const g = FrontEndGpu.mount({ doc: document, twin: t, sw: s0, place, load: () => new Promise(() => {}) })!;
    const surface = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software, transparent: false, surface: 'front',
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} }, host: s0, shown: (w) => g.want(w),
    });
    g.attach(surface);
    const tick = (): void => {
      const gpu = g.drawsOn(1);
      expect(gpu).toBe(true);
      surface.present([{ kind: 'clear', rgb: [10, 20, 30] }], () => null, { scale: 1 });
      g.drawn(gpu);
      g.commit();
    };
    tick();
    expect(surface.lastPath).toBe('gpu');
    expect(g.shown).toBe('gpu');
    f.loss.lose();
    tick();
    expect(surface.lastPath).toBe('software');
    expect(software.n).toBe(1);
    expect(g.shown).toBe('software');
    surface.dispose();
  });

  it('on the fake WebGL2 (GM-12b review F1): a loss between ticks and a tick that draws nothing keep the GPU canvas; the next drawn tick shows #front-end', () => {
    const t = twin();
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    const software: UiPresenter & { n: number } = { kind: 'cpu', n: 0, present(_i, _t, o = {}) { this.n++; const k = o.scale ?? 1; return { undrawn: [], width: 640 * k, height: 448 * k }; }, readFrame: () => null, undrawn: () => [] };
    const s0 = sw('?uiGpu=on');
    const g = FrontEndGpu.mount({ doc: document, twin: t, sw: s0, place, load: () => new Promise(() => {}) })!;
    const surface = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software, transparent: false, surface: 'front',
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} }, host: s0, shown: (w) => g.want(w),
    });
    g.attach(surface);
    const tick = (ticks: number): void => {
      const gpu = g.drawsOn(1);
      if (ticks > 0) { surface.present([{ kind: 'clear', rgb: [10, 20, 30] }], () => null, { scale: 1 }); g.drawn(gpu); }
      g.commit();
    };
    tick(1);
    expect(g.shown).toBe('gpu');
    f.loss.lose();
    expect(f.events.flush().map((e) => e.type)).toEqual(['webglcontextlost']);   // the event between frames: `shown('software')`
    tick(0);
    expect(software.n).toBe(0);
    expect(g.shown).toBe('gpu');                                              // never #front-end's old frame
    tick(1);
    expect(software.n).toBe(1);
    expect(g.shown).toBe('software');
    surface.dispose();
  });
});

describe("GM-12b: the surface's blend follows the frame's scale (GM.R6: the switch's `blend('front', scale)`, read per frame)", () => {
  it('a blend given as a function is asked with each frame\'s scale; a session escalation reaches the next frame', () => {
    const f = fakeGl({ unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    const s0 = sw('?uiGpu=on');
    const asked: [number, string][] = [];
    const software: UiPresenter = { kind: 'cpu', present: () => ({ undrawn: [], width: 640, height: 448 }), readFrame: () => null, undrawn: () => [] };
    const surface = new UiGpuSurfacePresenter({
      canvas: f.canvas as unknown as UiGpuSurfaceOptions['canvas'], software, transparent: false, surface: 'front',
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} }, host: s0,
      blend: (scale) => { const b = s0.blend('front', scale); asked.push([scale, b]); return b; },
    });
    const clear: UiDrawItem[] = [{ kind: 'clear', rgb: [1, 2, 3] }];
    surface.present(clear, () => null, { scale: 1 });
    surface.present(clear, () => null, { scale: 2 });
    s0.escalateBlend('front');
    surface.present(clear, () => null, { scale: 2 });
    expect(asked).toEqual([[1, 'exact'], [2, 'ff'], [2, 'exact']]);
    surface.dispose();
  });
});

describe('GM-12b: mountFrontEnd makes the canvas behind the switch (jsdom: the page up to its disc read)', () => {
  const pending = { read: () => new Promise<Uint8Array>(() => {}), list: () => new Promise<string[]>(() => {}) };
  const audio = { setData: () => {} };
  const mount = (uiGpu: UiGpuSwitch) => mountFrontEnd('?menuflow', { kind: 'http', baseUrl: 'http://127.0.0.1:1/' } as never, document, { assets: pending as never, audio: audio as never, uiGpu })!;

  it('the switch off (every player): the page is #front-end alone, as before', () => {
    const m = mount(sw());
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
    m.stop();
  });

  it('`?uiGpu=on`: #front-end-gpu beside #front-end, the same filter, its taps kept from the page; stop takes it away', () => {
    const seen: string[] = [];
    const viewer = (e: Event) => { seen.push(e.type); };
    document.addEventListener('pointerdown', viewer);
    // jsdom has no 2D canvas: a stand-in for `say()`'s calls (the GPU canvas is made only where the software fallback is).
    const ctx2d = { fillStyle: '', font: '', fillRect: () => {}, fillText: () => {} };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) => (id === '2d' ? ctx2d : null)) as never);
    const m = mount(sw('?uiGpu=on'));
    const gpu = document.getElementById(FRONT_END_GPU_ID) as HTMLCanvasElement;
    expect(gpu).not.toBeNull();
    expect(m.canvas.nextElementSibling).toBe(gpu);
    setBrightness(0.1);
    expect(gpu.style.filter).toBe(m.canvas.style.filter);
    expect(gpu.style.filter).not.toBe('');
    gpu.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(seen).toEqual([]);
    m.stop();
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
    document.body.append(gpu);                                     // put back by hand: its listeners are gone
    gpu.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(seen).toEqual(['pointerdown']);
    document.removeEventListener('pointerdown', viewer);
  });
});

describe("GM-12b: the page's loop and the session's close (source inspection: the loop needs a 2D canvas jsdom lacks)", () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
  const loop = src.slice(src.indexOf('const loop = (now: number): void => {'));
  const body = loop.slice(0, loop.indexOf('frameId = win.requestAnimationFrame(loop);'));

  it('the path is chosen per tick, the hidden frame not drawn on it, the surface drawn there, the swap committed after the draw', () => {
    expect(body).toMatch(/const gpu = gpuFront\?\.drawsOn\(hd\.scale\) \?\? false;/);
    expect(body).toMatch(/if \(ticks > 0 && drawsMenuFrame\(s, hd\.scale, gpu\) && menuRasterWanted\(matchUp, matchGraphics\)\)/);
    expect(body).toMatch(/if \(gpu\) s\.render\(gpuFront!\.surface!, menuSampling \?\? undefined, hd\);/);
    expect(body).toMatch(/gpuFront\?\.drawn\(gpu\);[\s\S]*?\}\s*\n\s*gpuFront\?\.commit\(\);/);
  });

  it('the session\'s close disposes the surface as the page\'s stop does (GM-12a review F5): both go through closeSession', () => {
    expect(src).toMatch(/const closeSession = \(\): void => \{ session_\?\.close\(\); uiGpuFront\?\.dispose\(\); uiGpuFront = null; \};/);
    expect(src.match(/session_\?\.close\(\)/g)).toHaveLength(1);
    const stop = src.slice(src.indexOf('stop: () => {'), src.indexOf("if (!source) {"));
    expect(stop).toMatch(/closeSession\(\);/);
    expect(stop).toMatch(/gpuFront\?\.remove\(\);/);
    expect(src).toMatch(/const handedOff = [^\n]*closeSession\(\);/);
  });

  it('the input and the brightness on both canvases: the page\'s attachment taken onto #front-end-gpu', () => {
    expect(src).toMatch(/menuInput\?\.also\(gpuFront\.canvas\)/);
    expect(src).toMatch(/frameCanvas\(canvas\);/);
  });

  it('the GPU modules stay import()-only; the switch\'s session and the slot are the page\'s', () => {
    expect(src).not.toMatch(/^import [^;]*uiGpuPresenter/m);
    expect(src).toMatch(/import\('\.\/uiGpuPresenter'\)/);
  });
});

describe('GM-12b: styles.css carries #front-end-gpu', () => {
  const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/styles.css'), 'utf8');
  it('SCREEN POSITION\'s translate and the standby rule (hidden from sight and from the pointer, its box kept)', () => {
    expect(css).toContain('#view, #front-end, #front-end-gpu, canvas.s2u-match { translate: var(--s2u-origin-x, 0px) var(--s2u-origin-y, 0px); }');
    expect(css).toContain(`#front-end-gpu.${UI_GPU_STANDBY_CLASS} { visibility: hidden; }`);
  });
});

describe('GM-16b: the development table makes the canvas (shadow at HD); the release table makes nothing', () => {
  it('a release build (every cell off): no canvas, no WebGL context asked', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const release = new UiGpuSwitch({ search: '', storage: () => null, devTools: false, table: uiGpuPageTable(false) });
    expect(FrontEndGpu.mount({ doc: document, twin: twin(), sw: release, place, load: () => Promise.reject(new Error('never asked')) })).toBeNull();
    expect(document.getElementById(FRONT_END_GPU_ID)).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('a development build: the canvas made in standby (shadow shows the software); scale 1 stays today\'s path; no context at mount', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const dev = new UiGpuSwitch({ search: '', storage: () => null, devTools: false, table: uiGpuPageTable(true) });
    const g = FrontEndGpu.mount({ doc: document, twin: twin(), sw: dev, place, load: () => new Promise(() => {}) })!;
    expect(g).not.toBeNull();
    expect(g.canvas.classList.contains(UI_GPU_STANDBY_CLASS)).toBe(true);
    expect(uiGpuFrontPath(dev, 1)).toBe('software');
    expect(uiGpuFrontPath(dev, 4)).toBe('gpu');
    expect(getContext).not.toHaveBeenCalled();
  });
});
