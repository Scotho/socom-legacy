// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel, LoadingWatch, tintTexels, type LoadingSurface } from '../src/loadingPanel';

/**
 * The loading screen's life on the page (INT-LOADING; research 125 §5): shown when the worker's early `loading` answer
 * for the wanted map arrives, gone when that map's `map` (or `error`) answer does -- Chris's browser-beta-v5 hook-up
 * (`main.ts` `loadingUi` / `wantedMap`), kept in its own module so the page gains one call. Then the GS MODULATE tint.
 */

const screen = (map: string): LoadingScreen => ({
  map, layout: null, libraries: [], binding: null, spin: null, fade: null, fonts: [], strings: [], bitmaps: [], unheld: [], missing: [],
});

function recorder(): LoadingSurface & { log: string[] } {
  const log: string[] = [];
  return { log, show: (s) => log.push(`show ${s.map}`), hide: () => log.push('hide') };
}

describe('LoadingWatch', () => {
  it('retires a previous screen before covering a new request, so its first progress cannot uncover scenery', () => {
    let wanted = 1, visible = false;
    const w = new LoadingWatch(() => wanted, { show: () => { visible = true; }, hide: () => { visible = false; } }, () => true, true);
    w.onMessage({ kind: 'loading', id: 1, data: screen('RUN/MP72.ZDB') });
    wanted = 2;
    w.begin();
    visible = true; // the page covers immediately, before the new bitmap reply
    w.onMessage({ kind: 'progress', id: 2, stage: 'archive', done: 0, total: 1 });
    expect(visible).toBe(true);
  });
  it('keeps the original screen running after decode until the current join explicitly completes', () => {
    let wanted = 3;
    const r = recorder();
    const w = new LoadingWatch(() => wanted, r, () => true, true);
    w.onMessage({ kind: 'loading', id: 3, data: screen('RUN/MP2.ZDB') });
    w.onMessage({ kind: 'map', id: 3, map: {} as never });
    w.ready(2);
    expect(r.log).toEqual(['show RUN/MP2.ZDB']);
    w.ready(3);
    w.onMessage({ kind: 'loading', id: 3, data: screen('RUN/MP2.ZDB') });
    expect(r.log).toEqual(['show RUN/MP2.ZDB', 'hide']);
    wanted = 4;
    w.onMessage({ kind: 'loading', id: 4, data: screen('RUN/MP2.ZDB') });
    w.onMessage({ kind: 'error', id: 4, doing: 'load', message: 'failed' });
    expect(r.log.slice(-2)).toEqual(['show RUN/MP2.ZDB', 'hide']);
  });

  it('shows the wanted load\'s screen and hides it when that map arrives', () => {
    let wanted = 3;
    const r = recorder();
    const w = new LoadingWatch(() => wanted, r);
    w.onMessage({ kind: 'progress', id: 3, stage: 'archive', done: 1, total: 2 });
    w.onMessage({ kind: 'loading', id: 3, data: screen('RUN/MP2.ZDB') });
    expect(r.log).toEqual(['show RUN/MP2.ZDB']);
    w.onMessage({ kind: 'map', id: 3, map: {} as never });
    expect(r.log).toEqual(['show RUN/MP2.ZDB', 'hide']);
    wanted = 4;
    w.onMessage({ kind: 'map', id: 4, map: {} as never });
    expect(r.log).toHaveLength(2);
  });

  it('ignores a screen for a load the page has moved on from, and takes the old one down when the new load speaks', () => {
    let wanted = 5;
    const r = recorder();
    const w = new LoadingWatch(() => wanted, r);
    w.onMessage({ kind: 'loading', id: 5, data: screen('RUN/MP2.ZDB') });
    wanted = 6;
    w.onMessage({ kind: 'loading', id: 5, data: screen('RUN/MP2.ZDB') });      // late, stale
    w.onMessage({ kind: 'progress', id: 6, stage: 'fetching', done: 0, total: 1 });
    w.onMessage({ kind: 'loading', id: 6, data: screen('RUN/MP72.ZDB') });
    expect(r.log).toEqual(['show RUN/MP2.ZDB', 'hide', 'show RUN/MP72.ZDB']);
  });

  it('hides on the wanted load\'s error, and on the worker\'s own failure', () => {
    let wanted = 7;
    const r = recorder();
    const w = new LoadingWatch(() => wanted, r);
    w.onMessage({ kind: 'loading', id: 7, data: screen('RUN/MP2.ZDB') });
    w.onMessage({ kind: 'error', id: 7, doing: 'loading RUN/MP2.ZDB', message: 'x' });
    wanted = 9;
    w.onMessage({ kind: 'loading', id: 9, data: screen('RUN/MP2.ZDB') });
    w.failed();
    expect(r.log).toEqual(['show RUN/MP2.ZDB', 'hide', 'show RUN/MP2.ZDB', 'hide']);
  });

  it('does not show a screen that comes after its load failed (the worker posts it when its reads end)', () => {
    const r = recorder();
    const w = new LoadingWatch(() => 8, r);
    w.onMessage({ kind: 'error', id: 8, doing: 'loading RUN/MP2.ZDB', message: 'x' });
    w.onMessage({ kind: 'loading', id: 8, data: screen('RUN/MP2.ZDB') });
    expect(r.log).toEqual([]);
  });

  it('shows nothing for a screen with no layout (a source without the dialog)', () => {
    const r = recorder();
    const w = new LoadingWatch(() => 1, r, (s) => s.layout !== null);
    w.onMessage({ kind: 'loading', id: 1, data: screen('RUN/MP2.ZDB') });
    expect(r.log).toEqual([]);
  });
});

describe('tintTexels: the GS MODULATE of a quad\'s colour (128 = 1.0)', () => {
  it('multiplies each channel by colour / 128, clamped, and keeps the texel\'s alpha', () => {
    const out = tintTexels(Uint8ClampedArray.from([255, 255, 255, 200, 100, 50, 0, 255]), [14, 57, 65]);
    expect([...out]).toEqual([28, 114, 129, 200, 11, 22, 0, 255]);
    expect([...tintTexels(Uint8ClampedArray.from([200, 10, 0, 9]), [128, 255, 128])]).toEqual([200, 20, 0, 9]);
  });
});

describe('LoadingPanel (jsdom): the overlay covers the page only while a screen is up', () => {
  it('is built out of sight, shows on a screen and goes again; its pointer coverage is styled in CSS', () => {
    const panel = new LoadingPanel(document);
    const root = document.getElementById('original-loading')!;
    expect(root.hidden).toBe(true);                    // the disc page, before any load: nothing over it
    // No inline style: placed and hidden by styles.css (`#original-loading`, `[hidden]`), which covers the pointer.
    expect([root.getAttribute('style'), root.querySelector('canvas')!.getAttribute('style')]).toEqual([null, null]);
    expect(panel.stats().visible).toBe(false);
    panel.show(screen('RUN/MP2.ZDB'));
    expect([root.hidden, panel.stats()]).toEqual([false, { visible: true, map: 'RUN/MP2.ZDB', picture: null, missing: [] }]);
    panel.hide();
    expect([root.hidden, panel.stats().visible]).toEqual([true, false]);
    expect(root.getAttribute('style')).toBeNull();
    root.remove();
  });

  it('draws the fader black over the frame last, at loadingFaderAlpha: from black over OnMenuStart\'s 1.5 s (review F1)', () => {
    const fills: [string, number, number[]][] = [];
    const ctx = { globalAlpha: 1, fillStyle: '', fillRect(...r: number[]) { fills.push([String(this.fillStyle), this.globalAlpha, r]); }, drawImage() {} };
    const get = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never);
    let now = 1000;
    const perf = vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    try {
      const panel = new LoadingPanel(document);
      const fade = { node: 'MENUFADER', from: 1, to: 0, rate: -1 / 1.5, seconds: 1.5 };
      const layout: LoadingScreen['layout'] = { libraries: [], background: null, font: null, scripts: [], objects: [], animations: [], controls: [], models: [] };
      panel.show({ ...screen('RUN/MP2.ZDB'), layout, fade });
      // The frame's black ground, then the fader over it at alpha 128/128 (t = 0: the load state's 128 stands).
      expect(fills).toEqual([['#000', 1, [0, 0, 640, 448]], ['#000', 1, [0, 0, 640, 448]]]);
      fills.length = 0; now = 1750; panel.redraw();
      expect(fills[1]![1]).toBeCloseTo(0.5, 6);                  // opacity 0.5 at 0.75 s -> alpha 64 / 128
      fills.length = 0; now = 3000; panel.redraw();
      expect(fills).toHaveLength(1);                              // faded in: no fader drawn
      panel.hide();
      document.getElementById('original-loading')!.remove();
    } finally {
      get.mockRestore(); perf.mockRestore();
    }
  });
});
