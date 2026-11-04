// @vitest-environment jsdom
import { CardSlots } from '@s2u/card';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveOptions } from '../../src/console/adapters/options';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, type Adapters } from '../../src/console/state';
import { cardOptionStore } from '../../src/modern/settings/store';
import { at, fontSizeOf, must, rem, side, value, type At } from './cascade';
import { mountShell } from './shell';

/**
 * CX-LEGEND (issue #238, found by DX-3's browser run, 2026-10-16): on the console launcher at 1280x720 a lower row of a
 * Home category's action list (Options > Account) sat behind the legend (`footer#legend`), which took its pointer: a
 * mouse could not open the row. The cause, from the rules: part G of `shared/ds/components.css` (the design export)
 * lays `.cx-home` over the stage (`inset: 0`) and gives it no scroll above the phone rule, its body as tall as its list;
 * the console's fit (`src/console/fit.ts`) floors the scale at 0.8, so at 1280x720 and 1366x768 the stage is 56.25 and
 * 60 rem tall against the design's 67.5, and a list of five actions runs past the stage, under the legend, which comes
 * later in the page and paints over it. The fix: the design system's part J (1.9.0) makes the home's list its own
 * scroll container above the phone rule, bounded by the stage, and the page marks it `data-scroll` (CX-11's lists) so
 * the pad's focused row is kept in view by moving that list's scrollTop; at the phone rule the stage itself scrolls
 * (part G), and the pad's focused row is scrolled into view by the stage. A browser adaptation with no original
 * (OT.R28); the pointer's check at the three viewports is the browser spec `e2e/consoleRows.spec.ts`.
 *
 * jsdom has no layout. The first block computes the stage from the rules (`./cascade`, CX-17's resolver); the second
 * stubs the geometry as `./scroll.test.ts` does: the list's box is 100..300 px, row i sits at 100 + 60 i - scrollTop
 * and is 56 px tall, so three rows fit and the fourth and fifth overflow.
 */

/** The live Options adapter (including Mobile), the rest of the adapters the sample's. */
function liveAdapters(): Adapters {
  const a = sampleAdapters();
  const m = new Map<string, string>();
  const slots = new CardSlots(() => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }) as unknown as Storage, () => undefined, { now: () => 1 });
  a.options = liveOptions(() => {}, { store: cardOptionStore(slots), signedIn: () => false, pads: () => [], touch: () => true, launcher: { disc: () => 'empty', isoInserted: () => false, filename: () => null, onChange: () => () => {} } });
  return a;
}
const OPTIONS = CATS.findIndex((c) => c.id === 'options');

/* ---------- the stage, from the rules ---------- */

/** A `font` shorthand's size times its line-height, in rem. */
const lineRem = (font: string, a: At, size?: string): number => {
  const m = /\/([\d.]+)/.exec(font)!;                                 // LR-46: the size may be a calc() (`fontSizeOf`); was a bare rem
  return rem(size ?? fontSizeOf(font)!, a) * Number(m[1]);
};
/**
 * The room the stage leaves the list, in rem, bounded above: the viewport less the frame's padding, the header's and
 * the legend's least heights (each may be taller), the crossbar and the body's top margin.
 */
const listRoom = (a: At): number => {
  const w = a.w;
  const stage = a.h / a.px - rem(must(['.cx-app'], 'padding-top', w), a) - rem(must(['.cx-app'], 'padding-bottom', w), a)
    - rem(must(['.cx-header'], 'min-height', w), a) - rem(must(['.cx-legend'], 'min-height', w), a);
  return stage - rem(must(['.cx-crossbar'], 'margin-top', w), a) - rem(must(['.cx-crossbar'], 'height', w), a) - rem(must(['.cx-home__body'], 'margin-top', w), a);
};
/** An action at rest, in rem: its padding, its title's line, the text's gap and its sub-line's (one line each), or its least height. */
const restRow = (a: At): number => {
  const w = a.w;
  const pad = rem(side(must(['.cx-item'], 'padding', w), 0), a);
  const text = lineRem(must(['.cx-item__title'], 'font', w), a) + rem(must(['.cx-item__text'], 'gap', w), a) + lineRem(must(['.cx-item__sub'], 'font', w), a);
  return Math.max(rem(must(['.cx-item'], 'min-height', w), a), 2 * pad + text);
};
/** How many actions at rest the stage holds, at most. */
const rowsThatFit = (a: At): number => {
  const gap = rem(must(['.cx-list'], 'gap', a.w), a);
  return Math.floor((listRoom(a) + gap) / (restRow(a) + gap));
};

describe('CX-LEGEND: where the stage is shorter than the design, a Home list runs past it (the cause, from the rules)', () => {
  it('the live Options category includes Mobile and keeps Account last', () => {
    const items = liveAdapters().options.categories().map((c) => c.label);
    expect(items).toEqual(['Display', 'App', 'Appearance', 'Audio', 'Controller', 'Mobile', 'Communication', 'Account']);   // LR-5 (the adapter's order; the tabs are drawn by family, LATER 294)
  });

  it('at 1280x720 and 1366x768 (the fit\'s 0.8 floor) the stage holds four actions at most: the fifth lay under the legend', () => {
    for (const [w, h] of [[1280, 720], [1366, 768]] as const) {
      const a = at(w, h, 0);
      expect(a.px, `${w}x${h}: the 0.8 floor`).toBe(12.8);
      expect(rowsThatFit(a), `${w}x${h}`).toBeLessThan(5);
    }
  });

  it('at the design\'s 1920x1080 five fit at Interface 100 %, not at 130 %', () => {
    expect(rowsThatFit(at(1920, 1080, 0))).toBeGreaterThanOrEqual(5);
    expect(rowsThatFit(at(1920, 1080, 2))).toBeLessThan(5);
  });
});

describe('CX-LEGEND: the fix, from the rules -- above the phone rule the home\'s list scrolls inside the stage', () => {
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]] as const) {
    it(`at ${w}x${h} the body takes the stage's room and the list is its own scroll container, bounded by it`, () => {
      expect(must(['.cx-home .cx-home__body', '.cx-home__body'], 'flex', w)).toBe('1 1 0');
      expect(must(['.cx-home__body'], 'min-height', w)).toBe('0');
      expect(must(['.cx-home__body > .cx-list'], 'align-self', w)).toBe('stretch');
      expect(must(['.cx-home__body > .cx-list'], 'overflow-y', w)).toBe('auto');
      expect(must(['.cx-home__body > .cx-list'], 'min-height', w)).toBe('0');
      // The actions keep the design's width: the ring's room on both sides is added to it and given back by the margin.
      const a = at(w, h, 0);
      const room = rem('calc(var(--s2u-focus-w) + 3px)', a);
      expect(must(['.cx-home__body > .cx-list'], 'width', w)).toBe('auto');
      expect(must(['.cx-home__body > .cx-list'], 'flex', w)).toBe('1 1 42.5rem');
      expect(side(must(['.cx-home__body > .cx-list'], 'margin', w), 1)).toBe('0');
      expect(side(must(['.cx-home__body > .cx-list'], 'margin', w), 2)).toBe('0');            // the box ends at the stage
    });
  }

  it('at the phone rule (412x915) none of it applies: part G scrolls the stage itself', () => {
    expect(value(['.cx-home__body > .cx-list'], 'overflow-y', 412)).toBeNull();
    expect(value(['.cx-home .cx-home__body'], 'flex', 412)).toBeNull();
    expect(must(['.cx-stage'], 'overflow-y', 412)).toBe('auto');
  });
});

/* ---------- the page: the list is a CX-11 scroll box; the pad keeps its focused row in view ---------- */

const BOX_TOP = 100;
const BOX_H = 200;
const PITCH = 60;
const ROW_H = 56;

let page: ConsolePage | null = null;
let scrolled: Element[] = [];
const WIDTH = window.innerWidth;                                       // jsdom's, put back after each case
beforeEach(() => {
  mountShell(document);
  scrolled = [];
  // jsdom draws nothing and has no scrollIntoView: a record of what asked for it.
  (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = function (this: Element) { scrolled.push(this); };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (top: number, h: number): DOMRect => ({ top, bottom: top + h, height: h, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    if (this.hasAttribute('data-scroll')) return rect(BOX_TOP, BOX_H);
    const box = this.closest('[data-scroll]');
    const i = Number((this as HTMLElement).dataset?.i);
    if (box && Number.isFinite(i)) return rect(BOX_TOP + PITCH * i - box.scrollTop, ROW_H);
    return rect(0, 0);
  });
});
afterEach(() => {
  page?.dispose();
  page = null;
  vi.restoreAllMocks();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  Object.defineProperty(window, 'innerWidth', { value: WIDTH, configurable: true, writable: true });
});

const homeList = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>('#stage .cx-home__body > .cx-list');
  if (!el) throw new Error('no home list');
  return el;
};
const inView = (box: HTMLElement): boolean => {
  const r = box.querySelector('.is-focused')!.getBoundingClientRect();
  return r.top >= BOX_TOP && r.bottom <= BOX_TOP + BOX_H;
};
const openOptionsCategory = (input: 'pad' | 'pointer'): ConsolePage => {
  page = bootConsole(document, window, liveAdapters(), { keymap: false });
  page.ctl.S.cat = OPTIONS;
  page.ctl.S.item[OPTIONS] = 0;
  page.ctl.S.input = input;
  page.render();
  return page;
};

describe('CX-LEGEND: the home\'s list is its own scroll box (data-scroll), one per category', () => {
  it('every category\'s list carries data-scroll and its own data-key, so another category opens at its top', () => {
    page = bootConsole(document, window, liveAdapters(), { keymap: false });
    for (let c = 0; c < CATS.length; c++) {
      page.ctl.S.cat = c;
      page.render();
      const list = homeList();
      expect(list.hasAttribute('data-scroll'), CATS[c]!.id).toBe(true);
      expect(list.getAttribute('data-key')).toBe(`list-${CATS[c]!.id}`);
    }
    page.ctl.S.cat = OPTIONS;
    page.render();
    const options = homeList();
    options.scrollTop = 120;                                             // the wheel
    page.ctl.press('r1');                                                // the next category
    expect(homeList()).not.toBe(options);
    expect(homeList().scrollTop).toBe(0);
  });

  it('the pad walks down Options to Account: the list scrolls the focused row into its box; back up, to its top', () => {
    const p = openOptionsCategory('pad');
    const list = homeList();
    const last = homeItems('options', p.ctl.S, p.ctl.A).length - 1;
    for (let k = 0; k < last; k++) {
      p.ctl.press('down');
      expect(inView(list)).toBe(true);
    }
    expect(p.ctl.S.item[OPTIONS]).toBe(last);
    expect(homeList()).toBe(list);                                       // patched in place
    expect(list.querySelector('.is-focused .cx-item__title')!.textContent).toBe('Theme');   // LR-13 (LR.R16 (2)): the last item, the theme drop-up (LATER 294 layout A: Game, Launcher, Theme)
    expect(list.scrollTop).toBe(0);           // its bottom on the box's bottom
    expect(inView(list)).toBe(true);
    expect(document.activeElement).toBe(list.querySelector('.cx-item.is-focused'));
    expect(scrolled).toEqual([]);                                        // the list's scrollTop alone, never the stage's
    for (let k = 0; k < last; k++) p.ctl.press('up');
    expect(list.scrollTop).toBe(0);
    expect(inView(list)).toBe(true);
  });

  it('in pointer mode a re-render keeps the scroll the wheel gave the list', () => {
    const p = openOptionsCategory('pointer');
    const list = homeList();
    list.scrollTop = 96;
    p.render();
    expect(list.scrollTop).toBe(96);
  });
});

describe('CX-LEGEND: at the phone rule the stage scrolls, so the pad\'s row is scrolled into view by the stage', () => {
  const phone = () => Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true, writable: true });

  it('Home > Options: the focused action is scrolled into view, the list\'s scrollTop untouched', () => {
    phone();
    const p = openOptionsCategory('pad');
    for (let k = 0; k < 4; k++) p.ctl.press('down');
    const f = homeList().querySelector('.cx-item.is-focused');
    expect(scrolled.at(-1)).toBe(f);
    expect(homeList().scrollTop).toBe(0);
  });

  it("the review's F1: a re-render with the same focus (a status update) scrolls nothing; a move does", () => {
    phone();
    const p = openOptionsCategory('pad');
    p.ctl.press('down');
    const before = scrolled.length;
    p.render();                                                             // the same focus: the wheel's scroll kept
    p.render();
    expect(scrolled.length).toBe(before);
    p.ctl.press('up');                                                      // a move: scrolled to the new row
    expect(scrolled.length).toBe(before + 1);
  });

  it('the Options screen\'s rollers (CX-11\'s list) too: there the list does not scroll, the stage does', () => {
    phone();
    page = bootConsole(document, window, liveAdapters(), { keymap: false });
    page.ctl.S.screen = 'options';
    page.ctl.S.opt = { cat: 0, row: 0, zone: 'rows' };
    page.ctl.S.input = 'pad';
    page.render();
    for (let k = 0; k < 4; k++) page.ctl.press('down');
    const rows = document.querySelector<HTMLElement>('#stage .cx-rows')!;
    expect(scrolled.at(-1)).toBe(rows.querySelector('.is-focused'));
    expect(rows.scrollTop).toBe(0);
  });
});
