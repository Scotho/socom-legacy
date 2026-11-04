// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { UI_SCALES } from '../../src/console/fit';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { at, must, rem, side, value, type At } from './cascade';
import { mountShell } from './shell';

/** LP.R13 replaces Home's old whole-slot scrolling with a centered carousel (crossbarWhole.test.ts).
 * The nested Settings tab column keeps its existing scrolling and shoulder geometry.
 */
const WIDE: readonly (readonly [number, number])[] = [[1280, 720], [1024, 768], [834, 1112]];
const hintRem = (a: At, sel: string): number => {
  const border = rem(must([sel], 'border-width', a.w), a);
  const pad = rem(side(must(['.cx-shoulder'], 'padding', a.w), 1), a);
  return Math.max(rem(must([sel], 'min-width', a.w), a), 2 * pad + 2 * border + 2 * 0.8 * rem(must([sel], 'font-size', a.w), a));
};
let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });

describe('CX.R10 on Options: the L1 / R1 tab hints never meet a tab\'s icon, nor leave the stage', () => {
  for (const [w, h] of WIDE) {
    it(`at ${w}x${h}, every Interface size`, () => {
      page = bootConsole(document, window, sampleAdapters(), { keymap: true });
      page.ctl.S.screen = 'options';
      page.render();
      const nav = document.querySelector('#stage .cx-tabs')!;
      const kids = [...nav.children];
      // The markup (CX-18): L1 first, the tabs' own scroller, R1 last, the three children of the one column; the tabs
      // all inside the scroller, the hints outside it.
      expect(kids[0]!.classList.contains('cx-tabs__hint') && kids[0]!.textContent!.includes('L1')).toBe(true);
      expect(kids.at(-1)!.classList.contains('cx-tabs__hint') && kids.at(-1)!.textContent!.includes('R1')).toBe(true);
      expect(kids.map((k) => k.className)).toEqual(['cx-tabs__hint', 'cx-tabs__strip', 'cx-tabs__hint']);
      const tabs = kids[1]!.querySelectorAll('.cx-tab').length;
      expect(tabs).toBe(nav.querySelectorAll('.cx-tab').length);
      expect(tabs).toBeGreaterThan(1);
      for (let ui = 0; ui < UI_SCALES.length; ui++) {
        const a = at(w, h, ui);
        const where = `${w}x${h} ui ${UI_SCALES[ui]}`;
        // A column: each hint its own band above and below the tabs, so a hint never meets a tab's icon.
        expect(must(['.cx-tabs'], 'display', w)).toBe('flex');
        expect(must(['.cx-tabs'], 'flex-direction', w)).toBe('column');
        for (const s of ['.cx-tabs__hint', '.cx-tabs__hint .cx-shoulder']) {
          expect(value([s], 'position', w) ?? 'static', `${where}: ${s}`).not.toMatch(/absolute|fixed/);
          expect(value([s], 'transform', w), `${where}: ${s}`).toBeNull();
          expect(value([s], 'margin', w) ?? '', `${where}: ${s}`).not.toMatch(/-/);
        }
        // The hint's content (padding, the shoulder, the gap and its word at 0.93 em a letter, tracking included) fits the column.
        const pad = rem(side(must(['.cx-tabs__hint'], 'padding', w), 1), a);
        const word = Math.max('Previous'.length, 'Next'.length) * 0.93 * rem(must(['.cx-tabs__hint'], 'font-size', w), a);
        const hintW = 2 * pad + hintRem(a, '.cx-tabs__hint .cx-shoulder') + rem(must(['.cx-tabs__hint'], 'gap', w), a) + word;
        const inner = rem(must(['.cx-tabs'], 'width', w), a) - 2 * rem(side(value(['.cx-tabs'], 'padding', w) ?? '0', 1), a);
        expect(hintW, where).toBeLessThanOrEqual(inner);
        // The column's height against the stage's room for it: the viewport less the frame's padding, the header and the
        // legend (START its tallest), the screen's padding, its head (eyebrow and title) and the body's margin.
        const H = (s: string[], p: string) => rem(must(s, p, w), a);
        const appPad = must(['.cx-app'], 'padding-top', w);
        const legend = Math.max(H(['.cx-legend'], 'min-height'), H(['.cx-legend'], 'padding-top') + H(['.cx-start'], 'min-height'));
        const title = H(['.cx-title'], 'font-size') * Number(/\/([\d.]+)/.exec(must(['.cx-title'], 'font', w))![1]) + rem(side(must(['.cx-title'], 'margin', w), 0), a);
        const eyebrow = Math.max(H(['.cx-eyebrow .cx-ico'], 'height'), H(['.cx-eyebrow'], 'font-size') * 1.2);
        const body = h / a.px - rem(appPad, a) - rem(must(['.cx-app'], 'padding-bottom', w), a) - H(['.cx-header'], 'min-height') - legend
          - H(['.cx-screen'], 'padding-top') - eyebrow - title - H(['.cx-screen__body'], 'margin-top');
        const hintH = 2 * rem(side(must(['.cx-tabs__hint'], 'padding', w), 0), a) + Math.max(H(['.cx-tabs__hint .cx-shoulder'], 'height'), H(['.cx-tabs__hint'], 'font-size') * 1.2);
        const column = 2 * hintH + tabs * H(['.cx-tab'], 'min-height') + (tabs + 1) * H(['.cx-tabs'], 'gap');
        if (column > body) {
          // Taller than its room: the tabs scroll inside it (CX-11's rule for a list taller than the stage) between the two
          // hints (CX-18), so neither hint runs out of the stage over the legend's prompts, nor scrolls away.
          expect.soft(value(['.cx-tabs__strip'], 'overflow-y', w) ?? 'visible', `${where}: the column ${column.toFixed(2)}rem in ${body.toFixed(2)}rem`).toMatch(/^(auto|scroll)$/);
          expect.soft(value(['.cx-tabs'], 'overflow-y', w) ?? 'visible', `${where}: the column itself does not scroll`).toBe('visible');
        }
      }
    });
  }

  // CX-18 (the delta review of CX-16/17's fix round, 2026-10-12): the column itself no longer scrolls, so its L1 / R1
  // hints stay put above and below the tabs, as the crossbar's strip keeps its hints outside; the tabs' own scroller
  // (`.cx-tabs__strip`, render/options.ts) scrolls between them. The pad's focus ring on a tab scrolled into view is not
  // clipped: the scroller's padding is the ring's room (given back by its negative margin), and its scroll-padding is the
  // same room, so the frame's nearest-edge scroll of a focused tab (`scrollIntoView`, render/frame.ts: the tabs are no
  // [data-scroll] list) stops with the ring inside the box.
  it('CX-18: the tabs\' scroller keeps the tabs\' width and the pad\'s focus ring inside its box, its bar hidden; the hints outside it', () => {
    const w = 1280;
    const a = at(w, 720, 2);
    expect(value(['.cx-tabs'], 'overflow-y', w) ?? 'visible').toBe('visible');
    expect(must(['.cx-tabs__strip'], 'overflow-y', w)).toBe('auto');
    expect(must(['.cx-tabs__strip'], 'scrollbar-width', w)).toBe('none');
    expect(must(['.cx-tabs__strip'], 'min-height', w)).toBe('0');
    const ringRoom = rem('var(--s2u-focus-w)', a) + rem('var(--s2u-focus-offset)', a);
    // The ring: var(--s2u-focus-w) at var(--s2u-focus-offset) past a focused tab (components.css `.is-focused`).
    const room = rem(side(must(['.cx-tabs__strip'], 'padding', w), 1), a);
    expect(room * a.px).toBeCloseTo(ringRoom * a.px, 9);
    expect(rem(side(must(['.cx-tabs__strip'], 'padding', w), 0), a) * a.px).toBeCloseTo(ringRoom * a.px, 9);
    expect(rem(side(must(['.cx-tabs__strip'], 'margin', w), 1), a)).toBeCloseTo(-room, 9);
    expect(rem(side(must(['.cx-tabs__strip'], 'scroll-padding', w), 0), a) * a.px).toBeCloseTo(ringRoom * a.px, 9);
    expect(rem(must(['.cx-tabs'], 'width', w), a)).toBeCloseTo(21.25, 9);                // the design's column, part G's
    // At the phone rule the scroller steps aside (`display: contents`): part G's sideways row of tabs, its hints hidden.
    expect(must(['.cx-tabs__strip'], 'display', 760)).toBe('contents');
  });

  it('CX-18: the hints are outside the tabs\' scroller, on every Options category', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.S.screen = 'options';
    for (let c = 0; c < page.ctl.A.options.categories().length; c++) {
      page.ctl.S.opt = { cat: c, row: 0, zone: 'cats' };
      page.render();
      const strip = document.querySelector('#stage .cx-tabs > .cx-tabs__strip')!;
      expect(strip.querySelector('.cx-tabs__hint')).toBeNull();
      expect(document.querySelectorAll('#stage .cx-tabs > .cx-tabs__hint')).toHaveLength(2);
      expect(strip.querySelector('.cx-tab.is-focused')).not.toBeNull();     // the focused tab is the scroller's
    }
  });
});
