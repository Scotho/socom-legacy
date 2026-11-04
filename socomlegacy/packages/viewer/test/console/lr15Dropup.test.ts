// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { dropupPlacement } from '../../src/console/render/home';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, type Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-15 (review-lr-13 F6; the seat box's shot at 1280x720 and 390x844): the theme drop-up opened upward from Settings'
 * third item, climbed over the header and the rail, and the rows beneath it showed through its surface. Now it is placed
 * by the rows above its row -- fewer than its options need: it opens downward (`is-below`) into the empty space under
 * the row; otherwise upward (`is-above`) -- and its surface is opaque. A browser adaptation: the launcher's look.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

describe('LR-15: the theme drop-up\'s placement', () => {
  it('opens below when the rows above are fewer than its options, above when they fit', () => {
    expect(dropupPlacement(2, 7)).toBe('is-below');
    expect(dropupPlacement(6, 7)).toBe('is-below');
    expect(dropupPlacement(7, 7)).toBe('is-above');
    expect(dropupPlacement(9, 7)).toBe('is-above');
  });

  it('Settings\' Theme item (two rows above, seven themes) draws is-below', () => {
    page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
    const { ctl } = page;
    const S = CATS.findIndex((c) => c.id === 'options');
    ctl.S.input = 'pad';
    ctl.S.cat = S;
    ctl.S.item[S] = homeItems('options', ctl.S, ctl.A).findIndex((x) => x.act === 'themes');
    page.render();
    ctl.press('cross');
    const up = document.querySelector('#stage .cx-dropup')!;
    expect(up.classList.contains('is-below')).toBe(true);
    expect(up.classList.contains('is-above')).toBe(false);
  });

  it('the CSS gives both placements and an opaque surface (no bare translucent panel token)', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    const rule = (sel: string): string => css.split('\n').find((l) => l.includes(sel + ' {')) ?? '';
    const base = rule('.cx-dropup');
    expect(base).toContain('--s2u-lx-ring-ground');
    expect(base).not.toMatch(/background:\s*var\(--s2u-lx-panel\);/);
    expect(rule('.cx-dropup.is-below')).toMatch(/top:\s*100%/);
    expect(rule('.cx-dropup.is-above')).toMatch(/bottom:\s*100%/);
  });
});

/**
 * LR-18's fold (the seat box's run at 386ecb578): opening below on its opaque surface, the list at 1280x720 ran 133-699 x
 * 378-623 px and the legend's top is at 608 -- 15px over it. Its height is capped to the room between its own top and the
 * legend's top less its 0.375rem gap (`fitDropup`, `src/console/render/home.ts`: measured at each draw, set as
 * `--cx-dropup-max` on the root, which no region's redraw touches), the list scrolling inside, the pad's option kept in
 * its view.
 *
 * Its second fold (the box's run at f2246b03d, `agent-mail/evidence/lr-7-matrix/lr-18/1280x720/theme-list.png`): the list
 * still ended 11px into the legend (619 against 608). Two measures were short: the cap was a content-box `max-height`, so
 * the list's own padding and border (0.375rem each side and 1px: 11.6px at 12.8px a rem) came on top of it; and the
 * list's top was read off the list itself at the draw that opens it, while its opening motion (`cx-lx-dropdown-in`,
 * from translateY(-0.5rem)) still lifted it 6.4px. The geometry here is the browser's as the box measured it: the Theme
 * row's bottom at 373, the legend's top at 608, the list's natural height 245px (its options every 34px from its padding,
 * 32px tall), drawn as the sheet's `box-sizing` says, lifted by the motion's first frame at the draw. A browser
 * adaptation: the launcher's look.
 */
describe('LR-18 fold: the theme list never runs over the legend', () => {
  const size = { w: window.innerWidth, h: window.innerHeight };
  const ROW = 373, LEGEND = 608, NATURAL = 245, PITCH = 34, OPT_H = 32, LIFT = 6.4, PX = 12.8;
  const GAP = 0.375 * PX;
  const TOP = ROW + GAP;                                             // the list's top once its motion has settled
  const CHROME = 2 * 0.375 * PX + 2;                                 // its padding and border, top and bottom
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
  const base = css.split('\n').find((l) => l.includes('.cx-dropup {')) ?? '';
  const borderBox = /box-sizing:\s*border-box/.test(base);
  const maxOf = (): number => parseFloat(document.documentElement.style.getPropertyValue('--cx-dropup-max'));
  /** The list's drawn height under the cap: `max-height` bounds the border box or only the content box. */
  const height = (): number => {
    const m = maxOf();
    if (!Number.isFinite(m)) return NATURAL;
    return borderBox ? Math.min(m, NATURAL) : Math.min(m, NATURAL - CHROME) + CHROME;
  };
  let lift = LIFT;                                                   // the opening motion's first frame, at the draw
  beforeEach(() => {
    lift = LIFT;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    const rect = (top: number, h: number): DOMRect => ({ top, bottom: top + h, left: 133, right: 699, width: 566, height: h, x: 133, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.id === 'legend') return rect(LEGEND, 112);
      if (this.matches('.cx-dropup-row')) return rect(ROW - 54, 54);
      if (this.matches('.cx-dropup')) return rect(TOP - lift, height());
      const up = this.closest('.cx-dropup') as HTMLElement | null;
      const k = Number((this as HTMLElement).dataset?.['i']);
      if (up && this.matches('.cx-dropup__opt') && Number.isFinite(k)) return rect(TOP - lift + 6 + PITCH * k - up.scrollTop, OPT_H);
      return rect(0, 0);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    document.documentElement.style.removeProperty('--cx-dropup-max');
  });
  const openThemes = (): void => {
    page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
    const { ctl } = page;
    const S = CATS.findIndex((c) => c.id === 'options');
    ctl.S.input = 'pad';
    ctl.S.cat = S;
    ctl.S.item[S] = homeItems('options', ctl.S, ctl.A).findIndex((x) => x.act === 'themes');
    page.render();
    ctl.press('cross');
  };

  it('at 1280x720 the list, its padding and border with it, ends a gap above the legend once its motion settles', () => {
    openThemes();
    expect(parseFloat(document.documentElement.style.fontSize)).toBe(PX);
    expect(maxOf(), 'no cap set').toBeGreaterThan(0);
    const bottom = TOP + height();
    expect(bottom, `the list (top ${TOP}, cap ${maxOf()}px, ${borderBox ? 'border' : 'content'} box) runs into the legend at ${LEGEND}`).toBeLessThanOrEqual(LEGEND);
    // LR-20's fold: at least 8px clear of the legend, the cap a whole pixel down (was the 0.375rem gap).
    expect(bottom).toBeLessThanOrEqual(LEGEND - 8);
    expect(bottom).toBeGreaterThan(LEGEND - 9);
    // A redraw after the motion (the list at rest) keeps the same cap.
    const cap = maxOf();
    lift = 0;
    page!.render();
    expect(maxOf()).toBeCloseTo(cap, 6);
  });

  it('the pad\'s option is kept in the capped list\'s view', () => {
    openThemes();
    lift = 0;
    const up = document.querySelector<HTMLElement>('#stage .cx-dropup')!;
    expect(up.scrollTop).toBe(0);
    page!.ctl.S.thm.row = 6;
    page!.render();
    const box = up.getBoundingClientRect();
    const opt = document.querySelector<HTMLElement>('#stage .cx-dropup__opt.is-focused')!.getBoundingClientRect();
    expect(opt.bottom).toBeLessThanOrEqual(box.bottom + 0.01);
    expect(opt.top).toBeGreaterThanOrEqual(box.top - 0.01);
    expect(up.scrollTop).toBeGreaterThan(0);
  });

  it('the CSS caps the list\'s border box by that measure and lets it scroll', () => {
    expect(base).toMatch(/max-height:\s*var\(--cx-dropup-max, none\)/);
    expect(base).toMatch(/overflow-y:\s*auto/);
    expect(base, 'the cap bounds only the content box: the padding and the border come on top').toMatch(/box-sizing:\s*border-box/);
  });
});

/**
 * LR-20's fold (the box at 406d9e99f: the list's bottom at 612.2 against the legend's top at 608.3, 3.9px into it after
 * 15 and 11): the cap leaves at least 8px between the list's bottom and the legend's top as the browser lays the legend
 * out (`#legend`, the footer, measured at the draw), from the Theme row (which the opening motion does not move); and once
 * the motion has settled (`animationend`) the list's own box is read again and the cap taken down by what it still runs
 * past that line -- whatever moved after the draw. The box's numbers: the row's bottom 373, the legend's top 608.3.
 */
describe('LR-20 fold: the theme list ends at least 8px above the legend', () => {
  const size = { w: window.innerWidth, h: window.innerHeight };
  const ROW = 373, LEGEND = 608.3, NATURAL = 245, LIFT = 6.4, PX = 12.8;
  const GAP = 0.375 * PX;
  const TOP = ROW + GAP;
  const maxOf = (): number => parseFloat(document.documentElement.style.getPropertyValue('--cx-dropup-max'));
  const height = (): number => { const m = maxOf(); return Number.isFinite(m) ? Math.min(m, NATURAL) : NATURAL; };
  let lift = LIFT;
  let drift = 0;                                                      // a shift after the draw the model does not know
  beforeEach(() => {
    lift = LIFT;
    drift = 0;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    const rect = (top: number, h: number): DOMRect => ({ top, bottom: top + h, left: 133, right: 699, width: 566, height: h, x: 133, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.id === 'legend') return rect(LEGEND, 111.7);
      if (this.matches('.cx-dropup-row')) return rect(ROW - 54, 54);
      if (this.matches('.cx-dropup')) return rect(TOP - lift + drift, height());
      return rect(0, 0);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    document.documentElement.style.removeProperty('--cx-dropup-max');
  });
  const openThemes = (): void => {
    page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
    const { ctl } = page;
    const S = CATS.findIndex((c) => c.id === 'options');
    ctl.S.input = 'pad';
    ctl.S.cat = S;
    ctl.S.item[S] = homeItems('options', ctl.S, ctl.A).findIndex((x) => x.act === 'themes');
    page.render();
    ctl.press('cross');
  };

  it('at 1280x720 with the box\'s legend (608.3): the list\'s bottom at or above 600 once its motion settles', () => {
    openThemes();
    expect(maxOf()).toBeGreaterThan(0);
    lift = 0;
    document.querySelector('#stage .cx-dropup')!.dispatchEvent(new Event('animationend', { bubbles: true }));
    const bottom = TOP + height();
    expect(bottom, `cap ${maxOf()}px`).toBeLessThanOrEqual(600);
    expect(bottom).toBeGreaterThan(590);                                // capped to the room, not to nothing
  });

  it('whatever moved after the draw: the settled list read again and the cap taken down by its overrun', () => {
    openThemes();
    lift = 0;
    drift = 8.7;                                                      // the box's 612.2 against the model's 603.5
    document.querySelector('#stage .cx-dropup')!.dispatchEvent(new Event('animationend', { bubbles: true }));
    const box = document.querySelector('#stage .cx-dropup')!.getBoundingClientRect();
    expect(box.bottom, `cap ${maxOf()}px`).toBeLessThanOrEqual(600);
    // A redraw keeps the correction while the list stays open (the same drift).
    page!.render();
    expect(document.querySelector('#stage .cx-dropup')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(600);
  });
});
