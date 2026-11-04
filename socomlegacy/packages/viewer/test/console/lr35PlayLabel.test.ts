// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { homeItems, PLAY_LABEL, PLAY_NEED_WORDS } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-35 (LR.R29, the owner, 2026-10-27: "Play" becomes "Play Socom II", then "SOCOM II" -- the disc's own branding):
 * Home's Play row reads "Play SOCOM II", its accessible text (the row's title) and the legend's Cross label where it
 * names the item follow it, all from the one constant `PLAY_LABEL`, so the three cannot drift. The row's verb stays the
 * act's own word. A launcher adaptation, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

describe('LR-35: "Play SOCOM II" from one constant', () => {
  it('the constant reads Play SOCOM II (the owner\'s capitals)', () => {
    expect(PLAY_LABEL).toBe('Play SOCOM II');
  });
  it('the row, its accessible text and the legend\'s Cross are the constant', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const ctl = page.ctl;
    expect(homeItems('home', ctl.S, ctl.A)[0]!.title).toBe(PLAY_LABEL);
    const row = document.querySelector<HTMLElement>('#stage .cx-list .cx-item--play')!;
    expect(row.querySelector('.cx-item__title')!.textContent).toBe(PLAY_LABEL);
    expect(row.textContent).toContain(PLAY_LABEL);                   // the button's accessible name is its text
    expect(prompts(ctl.S, ctl.A).find((x) => x.k === 'cross')?.label).toBe(PLAY_LABEL);
  });
  it('the legend\'s need words name the item by the same constant', () => {
    for (const w of Object.values(PLAY_NEED_WORDS)) expect(w.startsWith(`${PLAY_LABEL}: `), w).toBe(true);
  });
});
