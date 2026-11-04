// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { LAUNCHER_BRIGHTNESS_RANGE, launcherBrightness } from '../../src/console/render/frame';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters, OptCat } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-37 (8; the owner, 2026-10-29: "For fun, make brightness also affect the brightness of the launcher instead of just
 * the game."). LAUNCHER_BRIGHTNESS_FROM_GAME_ADAPTATION: the game's Brightness row (a card tuner, its percent index)
 * also sets the launcher page's brightness -- its default no change at all (no filter), its ends 70% and 130%, live as
 * the slider moves. A browser adaptation: the game's own brightness handling is not touched.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); document.documentElement.style.filter = ''; });
afterEach(() => { page?.dispose(); page = null; document.documentElement.style.filter = ''; });

describe('LR-37 (8): the launcher follows the game\'s Brightness', () => {
  it('the mapping: the default is 100%, the ends 70% and 130%, linear on each side of the default', () => {
    expect(LAUNCHER_BRIGHTNESS_RANGE).toEqual([0.7, 1.3]);
    expect(launcherBrightness(50, 101, 50)).toBe(1);
    expect(launcherBrightness(0, 101, 50)).toBeCloseTo(0.7, 9);
    expect(launcherBrightness(100, 101, 50)).toBeCloseTo(1.3, 9);
    expect(launcherBrightness(25, 101, 50)).toBeCloseTo(0.85, 9);
    expect(launcherBrightness(75, 101, 50)).toBeCloseTo(1.15, 9);
    expect(launcherBrightness(3, 5, 1)).toBeCloseTo(1.2, 9);          // a default off the middle: each side its own scale
  });

  function boot(at: { v: number }): Adapters {
    const A = sampleAdapters();
    const cats = A.options.categories();
    const row = { id: 'BRIGHTNESS', label: 'Brightness', values: Array.from({ length: 101 }, (_, i) => `${i}%`), def: 50, about: '', note: '' };
    const value = A.options.value.bind(A.options);
    A.options = {
      ...A.options,
      categories: (): readonly OptCat[] => cats.map((c, i) => (i === 0 ? { ...c, rows: [row, ...c.rows] } : c)),
      value: (id: string) => (id === 'BRIGHTNESS' ? at.v : value(id)),
    };
    page = bootConsole(document, window, A, { keymap: false });
    return A;
  }

  it('at the default the page has no filter; moved, the root\'s brightness follows at the next draw', () => {
    const at = { v: 50 };
    boot(at);
    page!.render();
    expect(document.documentElement.style.filter).toBe('');
    at.v = 100;
    page!.render();
    expect(document.documentElement.style.filter).toBe('brightness(1.3)');
    at.v = 0;
    page!.render();
    expect(document.documentElement.style.filter).toBe('brightness(0.7)');
    at.v = 50;
    page!.render();
    expect(document.documentElement.style.filter).toBe('');
  });

  it('with no Brightness row (the sample adapters) nothing changes', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.render();
    expect(document.documentElement.style.filter).toBe('');
  });

  it('over a game (the overlay) the launcher sets no brightness: the game\'s own picture is the game\'s', () => {
    const at = { v: 100 };
    const A = boot(at);
    page!.dispose();
    page = bootConsole(document, window, A, { keymap: false, mode: 'overlay' });
    page.render();
    expect(document.documentElement.style.filter).toBe('');
  });
});
