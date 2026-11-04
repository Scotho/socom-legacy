// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { PAGE, value } from './cascade';
import { mountShell } from './shell';

/**
 * LR-1 (the launcher redesign plan, LR.R5, LR.R8): the legend's hints and the toast in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`: each hint a glyph and its word at 14 design px, the word at 72%, 26 apart, no rule over the
 * bar; the toast a 6px-cornered box of the toast ground with a 1px gold edge at 35%, 15 design px, centred, at most 80%
 * wide). The glyphs stay the original's (LR.R5: Cross, Circle, Square, Triangle, the shoulders, START), drawn by
 * `../../src/console/icons`; the artifact's "Face" names and its Stadia pad are not used. A browser adaptation.
 */
const W = 1280;
const v = (sel: string, prop: string) => value([sel], prop, W);

describe('the legend\'s hints', () => {
  it('a hint\'s word at 14 design px in sentence case, at 72%; the hints 26 apart; the glyph 9 from its word', () => {
    expect(v('.cx-legend .cx-prompt', 'font')).toBe('400 calc(0.875rem * var(--cx-text-scale))/1 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 0.875rem/1 var(--s2u-font-body)')
    expect(v('.cx-legend .cx-prompt', 'text-transform')).toBe('none');
    expect(v('.cx-legend .cx-prompt', 'gap')).toBe('0.5625rem');
    expect(v('.cx-legend .cx-prompt > .cx-label', 'opacity')).toBe('0.72');
    expect(v('.cx-legend .cx-prompts', 'gap')).toBe('1.625rem');
    expect(v('.cx-legend .cx-prompt', 'color')).toBe('var(--s2u-lx-ink)');
  });
  // LR-21 (P13): the artifact draws no rule over its bar, START ready or not; START's own glow says it is ready.
  it('no rule over the bar, START ready or not', () => {
    expect(v('.cx-app .cx-legend', 'box-shadow')).toBe('none');
    expect(v('.cx-app .cx-legend.is-ready', 'box-shadow')).toBe('none');
  });
  it('the glyphs are the original\'s, in every context the legend draws (LR.R5)', () => {
    let page: ConsolePage | null = null;
    mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const glyphs = [...document.querySelectorAll('#legend [data-menu-glyph]')].map((g) => g.getAttribute('data-menu-glyph'));
    expect(glyphs.length).toBeGreaterThan(0);
    for (const g of glyphs) expect(['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'options']).toContain(g);
    expect(document.getElementById('legend')!.textContent).not.toMatch(/Face|Stadia/);
    page.dispose();
  });
});

describe('the toast', () => {
  let page: ConsolePage | null = null;
  beforeEach(() => { vi.useFakeTimers(); mountShell(document); page = bootConsole(document, window, sampleAdapters(), { keymap: false }); });
  afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
  it('one line in the toast\'s box: 6px corners, the toast ground, a 1px gold edge at 35%, 15 design px, centred, at most 80%', () => {
    expect(v('body .cx-toast', 'border-radius')).toBe('var(--s2u-radius-viewer)');
    expect(v('body .cx-toast', 'background')).toBe('var(--s2u-lx-toast)');
    expect(v('body .cx-toast', 'box-shadow')).toBe('inset 0 0 0 1px color-mix(in srgb, var(--s2u-lx-accent) 35%, transparent)');
    expect(v('body .cx-toast', 'font')).toBe('400 calc(0.9375rem * var(--cx-text-scale))/1.4 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 0.9375rem/1.4 var(--s2u-font-body)')
    expect(v('body .cx-toast', 'max-width')).toBe('80%');
    expect(v('body .cx-toast', 'text-align')).toBe('center');
    expect(v('body .cx-toast', 'color')).toBe('var(--s2u-lx-ink)');
  });
  it('it rises 10 design px as it shows (the artifact\'s), and stands still under reduced motion', () => {
    expect(PAGE).toMatch(/@keyframes cx-lx-toast-in \{ from \{ opacity: 0; transform: translate\(-50%, 0\.625rem\); \} to \{ transform: translate\(-50%, 0\); \} \}/);
    expect(v('body .cx-toast', 'animation')).toBe('cx-lx-toast-in var(--s2u-dur-lx-fade) var(--s2u-ease) both');
    expect(PAGE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*:root\[data-console\] body \.cx-toast \{ animation: none; \}/);
  });
  it('the toast still says the controller\'s words (the grammar\'s, unchanged)', () => {
    page!.ctl.toast('Disc ready: SOCOM II');
    page!.render();
    expect(document.querySelector('#toast .cx-toast')!.textContent).toBe('Disc ready: SOCOM II');
  });
});
