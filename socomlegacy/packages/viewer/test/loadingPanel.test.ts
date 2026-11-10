// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout } from '@s2u/scene';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel, LoadingWatch, type LoadingSurface } from '../src/loadingPanel';

/**
 * The loading screen's life on the page (INT-LOADING; research 125 §5): shown when the worker's early `loading` answer
 * for the wanted map arrives, gone when that map's `map` (or `error`) answer does -- Chris's browser-beta-v5 hook-up
 * (`main.ts` `loadingUi` / `wantedMap`), kept in its own module so the page gains one call. Then the fader over the frame.
 * (The GS MODULATE tint, `tintTexels`, went with GM-22's code step: the panel's quads are modulated by the menus'
 * compositor, research 380 P8, held by its own tests.)
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
    // GM-22: the frame is the menus' compositor's (research 380 §4), put on the canvas whole; read here off the put.
    // A white background under MENUFADER (untextured, black, the source blend P10, stored round half to even P12).
    const puts: Uint8ClampedArray[] = [];
    const ctx = {
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (d: { data: Uint8ClampedArray }) => { puts.push(d.data.slice()); },
    };
    const get = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never);
    let now = 1000;
    const perf = vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    try {
      const panel = new LoadingPanel(document);
      const fade = { node: 'MENUFADER', from: 1, to: 0, rate: -1 / 1.5, seconds: 1.5 };
      const layout = parseUiLayout([['SCREENS', ['BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'OBJECTS', []]]]);
      const white: Rgba = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
      panel.show({ ...screen('RUN/MP2.ZDB'), layout, fade, bitmaps: [['littleblack.tif', white]] });
      const pixel = (): number[] => [...puts.at(-1)!.slice((100 * 640 + 100) * 4, (100 * 640 + 100) * 4 + 4)];
      expect(pixel()).toEqual([0, 0, 0, 255]);                   // t = 0: the load state's 128 stands, all black
      now = 1750; panel.redraw();
      expect(pixel()).toEqual([128, 128, 128, 255]);             // opacity 0.5 at 0.75 s -> alpha 64: 255 x 0.5 = 127.5 -> 128
      now = 3000; panel.redraw();
      expect(pixel()).toEqual([255, 255, 255, 255]);             // faded in: the fader at 0 draws nothing
      expect(puts).toHaveLength(3);
      panel.hide();
      document.getElementById('original-loading')!.remove();
    } finally {
      get.mockRestore(); perf.mockRestore();
    }
  });
});
