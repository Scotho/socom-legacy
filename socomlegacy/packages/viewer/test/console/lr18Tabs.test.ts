// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardSlots } from '@s2u/card';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { rootFontPx } from '../../src/console/fit';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { cardOptionStore } from '../../src/modern/settings/store';
import { declsOf as decls, fontSizeOf, mediaHolds, rem, side, TIERS, words, type At, type Rule } from './cascade';
import { TAB_FADE } from '../../src/console/render/options';
import { mountShell } from './shell';

/**
 * LR-18 (the LR.R11 side-by-side review's P2 and P14's strip, `agent-mail/evidence/review-lr-7-side-by-side.md`; the LR-7
 * matrix's settings-* shots): the Settings tab column clipped at 1280x720 and 1024x768 -- a sliver of the seventh tab
 * under "R1 NEXT", the NETWORK tab's top cut under "L1 PREVIOUS" -- and the live options adapter has eight tabs
 * (`src/console/adapters/options.ts`, the groups: Display, App, Appearance, Audio, Controller, Mobile where touch exists,
 * Communication, Account); at 390x844 the sideways strip was cut mid-word (CONTROLLE) with no edge fade.
 *
 * The cause, read from the rules (jsdom has no layout, so the room is computed from them as `./lr17Landscape.test.ts`
 * computes it): part G's tab keeps `min-height: 4.25rem` (54.4px at the fit's 0.8 floor), so eight tabs and their gaps
 * need 468.8px in a column of 413px (1280x720: the stage less the screen's head) and the scroller cut the eighth; at
 * 1024x768 the Settings body is the CX-ASIDE grid, whose tab row's least is one tab (`minmax(4.25rem, 1fr)`) and the aside
 * under it took the rest. The fix: the tabs shrink to the column's room down to a least height, the grid's tab row keeps
 * room for every tab at that least (their count drawn on the body), the scroller sits between the hints (no negative
 * margin over them) and fades the edge it can scroll toward; the phone's strip the same, sideways, the current tab kept
 * in view. A browser adaptation: the launcher's layout, nothing of the game.
 */

interface Env { w: number; h: number }

/** A rule's condition at `env`, the options container `stageRem` wide (its container queries read). */
const holds = (cond: string, env: Env, stageRem: number): boolean => mediaHolds(cond, { w: env.w, h: env.h, stageRem });

/** `prop` read from one declaration, its shorthand's part where the declaration is the shorthand. */
function part(prop: string, name: string, v: string): string | null {
  if (name === prop) return v;
  const box = /^(margin|padding)-(top|right|bottom|left)$/.exec(prop);
  if (box && name === box[1]) return side(v, (['top', 'right', 'bottom', 'left'] as const).indexOf(box[2] as 'top') as 0 | 1 | 2 | 3);
  if ((prop === 'row-gap' || prop === 'column-gap') && name === 'gap') { const w = words(v); return prop === 'row-gap' ? w[0]! : (w[1] ?? w[0]!); }
  if (name === 'flex' && (prop === 'flex-shrink' || prop === 'flex-basis')) {
    const w = words(v);
    if (v === 'none') return prop === 'flex-shrink' ? '0' : 'auto';
    if (v === 'auto') return prop === 'flex-shrink' ? '1' : 'auto';
    return prop === 'flex-shrink' ? (w.length >= 2 && !/[a-z%]/.test(w[1]!) ? w[1]! : '1') : (w[w.length - 1] && w.length === 3 ? w[2]! : '0%');
  }
  return null;
}
/** `prop` on the element the first selector of `sels` that has one names, at `env`: the strongest tier first. */
function decl(sels: string[], prop: string, env: Env, stageRem: number): string | null {
  for (const tier of TIERS) {
    for (const sel of sels) {
      let v: string | null = null;
      for (const r of tier as Rule[]) {
        if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, env, stageRem))) continue;
        for (const [n, val] of decls(r.body)) { const p = part(prop, n, val); if (p != null) v = p; }
      }
      if (v != null) return v;
    }
  }
  return null;
}
const need = (sels: string[], prop: string, env: Env, stageRem: number): string => {
  const v = decl(sels, prop, env, stageRem);
  if (v == null) throw new Error(`no ${prop} for ${sels.join(' / ')} at ${env.w}x${env.h}`);
  return v;
};
/** A `font` shorthand's size and line height, in rem (LR-46: the size a `calc()` through the type token; was a bare rem read as a number). */
const fontLine = (font: string, a: At): number => {
  const size = fontSizeOf(font);
  const m = /\/([\d.]+)/.exec(font);
  if (!size || !m) throw new Error(`no size/line in "${font}"`);
  return rem(size, a) * Number(m[1]);
};

const TAB = ['.cx-tabs__strip > .cx-tab', '.cx-tabs__strip .cx-tab', '.cx-tab'];
const STRIP = ['.cx-tabs__strip'];

/** The Settings screen's tab column at `env` (Interface size 100 %), in px, for `n` tabs. */
function column(env: Env, n: number) {
  const px = rootFontPx(env.w, env.h, 0);
  const a: At = { w: env.w, h: env.h, ui: 0, px, bar: 0 };
  const stageRem = env.w / px - 2 * rem(side(need(['.cx-app'], 'padding', env, 0), 1), a);   // the options container's width
  const d = (sels: string[], prop: string): string => need(sels, prop, env, stageRem);
  const len = (v: string): number => rem(v, a) * px;
  // The page: the frame's padding, the header's least height, the legend's (its padding over START's least height).
  const rows = words(d(['.cx-app'], 'grid-template-rows'));
  expect(rows, 'the frame is no longer header / stage / legend: read it again').toEqual(['auto', 'minmax(0, 1fr)', 'auto']);
  const header = len(d(['.cx-header'], 'min-height'));
  const legend = Math.max(len(d(['.cx-legend'], 'min-height')), len(d(['.cx-legend'], 'padding-top')) + len(d(['.cx-start'], 'min-height')));
  const stage = env.h - len(d(['.cx-app'], 'padding-top')) - len(d(['.cx-app'], 'padding-bottom')) - header - legend;
  // The screen: its padding, the head (the crumb's line, the gap, the title's line), the body's margin.
  const head = (fontLine(d(['.cx-screen .cx-crumb'], 'font'), a) + rem(d(['.cx-screen .cx-screenhead__text'], 'gap'), a)
    + fontLine(d(['.cx-screen .cx-screenhead .cx-title'], 'font'), a)) * px;
  const body = stage - len(d(['.cx-screen'], 'padding-top')) - head - len(d(['.cx-screen__body'], 'margin-top'));
  // The column: the body's height (a flex row), or under the CX-ASIDE grid the tab row at its least (the aside's content
  // as tall as it likes: the worst case).
  const grid = decl(['.cx-screen[data-key="options"] .cx-screen__body'], 'display', env, stageRem) === 'grid';
  let col = body;
  if (grid) {
    const tracks = words(d(['.cx-screen[data-key="options"] .cx-screen__body'], 'grid-template-rows'));
    const least = /^minmax\((.+),\s*1fr\)$/.exec(tracks[0]!)?.[1];
    if (!least) throw new Error(`the tab row is no longer minmax(<least>, 1fr): ${tracks[0]}`);
    col = len(least.replace(/var\(--cx-tabs,\s*\d+\)/g, String(n)).replace(/100%/g, `${body / px}rem`));
  }
  // What the column holds: the two hints, the column's gaps, the strip's box (its padding, its margin) and the tabs.
  const hintLine = Math.max(fontLine(d(['.cx-tabs__hint'], 'font'), a), rem(d(['.cx-tabs__hint .cx-shoulder'], 'height'), a)) * px;
  const hint = len(d(['.cx-tabs__hint'], 'padding-top')) + hintLine + len(d(['.cx-tabs__hint'], 'padding-bottom'));
  const gap = len(d(['.cx-tabs'], 'gap'));
  const mt = len(d(STRIP, 'margin-top'));
  const mb = len(d(STRIP, 'margin-bottom'));
  const room = col - 2 * hint - 2 * gap - mt - mb - len(d(STRIP, 'padding-top')) - len(d(STRIP, 'padding-bottom'));
  const least = len(d(TAB, 'min-height'));
  const shrink = Number(decl(TAB, 'flex-shrink', env, stageRem) ?? '1');
  return { px, body, grid, col, hint, gap, mt, mb, room, least, shrink, tabs: n * least + (n - 1) * gap };
}

describe('LR-18: the Settings tab column holds every tab at 1280x720 and 1024x768', () => {
  for (const [w, h] of [[1280, 720], [1024, 768]] as const) for (const n of [7, 8]) {
    it(`${w}x${h}, ${n} tabs: every tab inside the column's box, none under the L1 / R1 hints`, () => {
      const c = column({ w, h }, n);
      // The model against the LR-7 matrix's shots (1280x720 settings-Display: the column 195..608 px): within 6px.
      if (w === 1280) expect(Math.abs(c.body - 413)).toBeLessThan(6);
      expect(c.col, 'the column runs out of the body').toBeLessThanOrEqual(c.body + 0.01);
      expect(c.shrink, 'a tab must give way to the column (flex-shrink)').toBeGreaterThan(0);
      expect(c.tabs, `${n} tabs at their least (${(c.least / c.px).toFixed(3)}rem) in a strip of ${c.room.toFixed(1)}px (column ${c.col.toFixed(1)}px, ${c.grid ? 'grid' : 'flex'})`)
        .toBeLessThanOrEqual(c.room + 0.01);
      // The strip's box (its padding, where a scrolled tab is drawn) never reaches into the hints' boxes.
      expect(c.mt, 'the strip runs up under the L1 hint').toBeGreaterThanOrEqual(-c.gap);
      expect(c.mb, 'the strip runs down under the R1 hint').toBeGreaterThanOrEqual(-c.gap);
    });
  }

  it('a tab keeps part G\'s height where the room allows (1920x1080: nothing moves) and a legible least', () => {
    const c = column({ w: 1920, h: 1080 }, 8);
    const env = { w: 1920, h: 1080 };
    const basis = decl(TAB, 'flex-basis', env, 108) ?? 'auto';
    expect(basis).toBe('4.25rem');
    expect(c.least / c.px, 'a tab no shorter than its icon and a line around it').toBeGreaterThanOrEqual(2.5);
    // At 1920x1080 eight tabs at part G's 4.25rem fit: nothing shrinks there.
    expect(8 * 4.25 * c.px + 7 * c.gap).toBeLessThanOrEqual(c.room + 0.01);
  });

  it('above the phone rule the strip still scrolls (Interface 115 / 130 %), and fades the edge it scrolls toward', () => {
    const env = { w: 1280, h: 720 };
    expect(need(STRIP, 'overflow-y', env, 88)).toBe('auto');
    for (const more of ['start', 'end', 'start end']) {
      const m = decl([`.cx-tabs__strip[data-more="${more}"]`], 'mask-image', env, 88);
      expect(m, `the strip's fade for data-more="${more}"`).toMatch(/^linear-gradient\(180deg, /);
      if (more.includes('start')) expect(m).toMatch(/^linear-gradient\(180deg, transparent/);
      if (more.includes('end')) expect(m).toMatch(/transparent\)$/);
    }
  });
});

describe('LR-18: the phone\'s tab strip (390x844) fades the edge it scrolls toward and never shrinks a tab', () => {
  const env = { w: 390, h: 844 };
  it('the strip is the nav, sideways, with the rail\'s fade toward each side it can scroll', () => {
    expect(need(['.cx-tabs'], 'overflow-x', env, 0)).toBe('auto');
    expect(decl(['.cx-tabs'], 'mask-image', env, 0), 'resting with nothing to scroll toward: no fade').toBeNull();
    for (const more of ['start', 'end', 'start end']) {
      const m = decl([`.cx-tabs[data-more="${more}"]`], 'mask-image', env, 0);
      expect(m, `the strip's fade for data-more="${more}"`).toMatch(/^linear-gradient\(90deg, /);
      if (more.includes('start')) expect(m).toMatch(/^linear-gradient\(90deg, transparent/);
      else expect(m).not.toMatch(/^linear-gradient\(90deg, transparent/);
      if (more.includes('end')) expect(m).toMatch(/transparent\)$/);
      else expect(m).not.toMatch(/transparent\)$/);
    }
    expect(decl(['.cx-tabs'], 'scroll-padding-inline', env, 0), 'a tab scrolled into view stops clear of the fade').not.toBeNull();
  });
  it('a tab never shrinks and its label never ellipsizes (the label is whole or under the fade)', () => {
    expect(need(['.cx-tab'], 'flex', env, 0)).toBe('none');
    expect(decl(TAB, 'text-overflow', env, 0) ?? 'clip').not.toBe('ellipsis');
  });
});

/* ---------- the DOM: the current tab kept in view, the strip's edges marked ---------- */

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
const launcher: LauncherState = { disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} };

describe('LR-18: at 390x844 the current tab is scrolled into the strip\'s view and its edges are marked', () => {
  let page: ConsolePage | null = null;
  const size = { w: window.innerWidth, h: window.innerHeight };
  // The nav's box is 14..376 px (the phone's 1.25rem frame padding at 390); tab i sits at 14 + 150 i less the scroll, 140 wide.
  const BOX_L = 14, BOX_W = 362, PITCH = 150, TAB_W = 140;
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    mountShell(document);
    const rect = (left: number, width: number): DOMRect => ({ left, right: left + width, top: 100, bottom: 140, width, height: 40, x: left, y: 100, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.matches('.cx-tabs')) return rect(BOX_L, BOX_W);
      const nav = this.closest('.cx-tabs') as HTMLElement | null;
      const i = Number((this as HTMLElement).dataset?.['i']);
      if (nav && this.matches('.cx-tab') && Number.isFinite(i)) return rect(BOX_L + PITCH * i - nav.scrollLeft, TAB_W);
      return rect(0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches('.cx-tabs') ? PITCH * this.querySelectorAll('.cx-tab').length - (PITCH - TAB_W) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches('.cx-tabs') ? BOX_W : 0;
    });
  });
  afterEach(() => {
    page?.dispose();
    page = null;
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    localStorage.clear();
  });
  function boot(): void {
    const options = liveOptions(() => { page?.render(); }, { store: cardOptionStore(memory()), launcher, signedIn: () => false, pads: () => [], touch: () => true });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  }
  const open = (cat: string): void => { page!.ctl.doAct(`opt:${cat}`); page!.render(); };
  const nav = (): HTMLElement => document.querySelector<HTMLElement>('#stage [data-key="options"] .cx-tabs')!;
  const current = (): HTMLElement => nav().querySelector<HTMLElement>('.cx-tab.is-current')!;
  const inView = (): void => {
    const b = nav().getBoundingClientRect();
    const r = current().getBoundingClientRect();
    expect(r.left, `${current().textContent}: its start cut`).toBeGreaterThanOrEqual(b.left);
    expect(r.right, `${current().textContent}: its end cut`).toBeLessThanOrEqual(b.right);
  };

  it('the launcher family draws its five tabs where touch exists, and the body carries their count', () => {
    boot();
    open('controller');
    expect(nav().querySelectorAll('.cx-tab').length).toBe(5);
    expect(document.querySelector<HTMLElement>('#stage [data-key="options"] .cx-screen__body')!.style.getPropertyValue('--cx-tabs')).toBe('5');
  });

  it('the last Launcher tab (Mobile) is scrolled into view; Controller brings the strip back; the edges follow', () => {
    boot();
    open('controller');
    expect(nav().scrollLeft).toBe(0);
    inView();
    expect(nav().dataset['more']).toBe('end');
    open('mobile');
    expect(current().textContent).toMatch(/Mobile/);
    inView();
    expect(nav().scrollLeft).toBeGreaterThan(0);
    expect(nav().dataset['more']).toMatch(/start/);
    open('account');
    inView();
    open('controller');
    inView();
    expect(nav().scrollLeft).toBe(0);
    expect(nav().dataset['more']).toBe('end');
  });

  it('a scroll by the finger re-marks the edges and a redraw with the same tab keeps the scroll', () => {
    boot();
    open('controller');
    nav().scrollLeft = 200;
    nav().dispatchEvent(new Event('scroll'));
    expect(nav().dataset['more']).toBe('start end');
    page!.render();
    expect(nav().scrollLeft).toBe(200);
    expect(nav().dataset['more']).toBe('start end');
  });
});

/*
 * LR-18's fold (the box's run at f2246b03d, `agent-mail/evidence/lr-7-matrix/lr-18/<WxH>/`): the VERTICAL column never
 * scrolled. At 844x390 the strip (8-196 x 140-303, between the L1 hint at y 111-135 and the R1 hint at 308-332) stayed at
 * its top while R1 walked the current tab to Controller, Mobile, Communication and Account (data-more "end" throughout);
 * at 1280x720 with Interface size 130 % the same. The strip is wider inside than its box too (a label longer than the
 * column, "COMMUNICATIO"; the ring's room), and `keepTabInView` took the axis from the overflow -- sideways first -- so it
 * scrolled the strip sideways and marked its sideways end. The axis is the tabs' own: stacked, the column scrolls down.
 */
describe('LR-18\'s fold: the vertical column scrolls the current tab into its view, clear of its fades', () => {
  let page: ConsolePage | null = null;
  const size = { w: window.innerWidth, h: window.innerHeight };
  // The strip's box as the box measured it at 844x390: 8..196 x 140..303; tab i at 140 + 46 i less the scroll, 40 tall;
  // eight tabs (362px of content); its content 12px wider than its box (the overflow that turned the axis).
  const TOP = 140, H = 163, LEFT = 8, W = 188, PITCH = 46, TAB_H = 40;
  let fits = false;                                                  // the 100 % column with room for every tab (1280x720)
  beforeEach(() => {
    fits = false;
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    mountShell(document);
    const rect = (top: number, height: number): DOMRect => ({ left: LEFT, right: LEFT + W, top, bottom: top + height, width: W, height, x: LEFT, y: top, toJSON: () => ({}) }) as DOMRect;
    const isStrip = (el: Element): boolean => el.matches('.cx-tabs__strip');
    const count = (el: Element): number => el.querySelectorAll('.cx-tab').length;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (isStrip(this)) return rect(TOP, H);
      const strip = this.closest('.cx-tabs__strip') as HTMLElement | null;
      const i = Number((this as HTMLElement).dataset?.['i']);
      if (strip && this.matches('.cx-tab') && Number.isFinite(i)) return rect(TOP + PITCH * i - strip.scrollTop, TAB_H);
      return rect(0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return isStrip(this) ? (fits ? H : PITCH * count(this) - (PITCH - TAB_H)) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return isStrip(this) ? H : 0; });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return isStrip(this) ? W + 12 : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return isStrip(this) ? W : 0; });
  });
  afterEach(() => {
    page?.dispose();
    page = null;
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    localStorage.clear();
  });
  function boot(): void {
    const options = liveOptions(() => { page?.render(); }, { store: cardOptionStore(memory()), launcher, signedIn: () => false, pads: () => [], touch: () => true });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  }
  const open = (cat: string): void => { page!.ctl.doAct(`opt:${cat}`); page!.render(); };
  const strip = (): HTMLElement => document.querySelector<HTMLElement>('#stage [data-key="options"] .cx-tabs__strip')!;
  const current = (): HTMLElement => strip().querySelector<HTMLElement>('.cx-tab.is-current')!;
  /** The current tab inside the strip's box less the fades it draws (8 % at an edge it can scroll toward). */
  const inView = (): void => {
    const s = strip();
    const b = s.getBoundingClientRect();
    const r = current().getBoundingClientRect();
    const fade = TAB_FADE * H;
    const max = s.scrollHeight - s.clientHeight;
    expect(r.top, `${current().textContent}: its top cut`).toBeGreaterThanOrEqual(b.top + (s.scrollTop > 1 ? fade : 0) - 0.5);
    expect(r.bottom, `${current().textContent}: its bottom cut`).toBeLessThanOrEqual(b.bottom - (s.scrollTop < max - 1 ? fade : 0) + 0.5);
  };

  it('844x390: walking the Launcher tabs scrolls the column down; back on Controller scrolls it up', () => {
    boot();
    open('controller');
    expect(strip().scrollTop).toBe(0);
    expect(strip().dataset['more'], 'the column\'s edge it can scroll toward').toBe('end');
    for (const cat of ['appearance', 'app', 'account', 'mobile']) {
      open(cat);
      expect(current().textContent?.toLowerCase()).toContain(cat);
      inView();
    }
    expect(strip().scrollTop).toBeGreaterThan(0);
    expect(strip().scrollLeft, 'the column scrolled sideways').toBe(0);
    expect(strip().dataset['more']).toMatch(/start/);
    open('controller');
    inView();
    expect(strip().scrollTop).toBe(0);
    expect(strip().dataset['more']).toBe('end');
  });

  it('1280x720 at Interface size 130 %: the redraw at the new scale brings the current tab into the column\'s view', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    fits = true;
    boot();
    open('mobile');
    expect(strip().scrollTop).toBe(0);
    fits = false;                                                    // 130 %: the tabs no longer fit their column
    document.documentElement.style.fontSize = `${(rootFontPx(1280, 720, 0) * 1.3).toFixed(2)}px`;
    page!.render();
    inView();
    expect(strip().scrollTop).toBeGreaterThan(0);
    expect(strip().dataset['more']).toBe('start');
  });
});
