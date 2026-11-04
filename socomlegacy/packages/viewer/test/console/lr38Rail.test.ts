// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS } from '../../src/console/state';
import { declsOf, mediaHolds as holds, PAGE_RULES, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-38 (the owner, 2026-10-29: "At mobile, there is no need to show scrollbar when the right icons go out of view";
 * "Please make the L1R1 scrollable with tap in a graceful apple-like way"). At the phone rule (`../../src/console/fit`
 * NARROW_PX, the sheet's `max-width: 760px`) the launcher page's rail is a native sideways scroller -- its bar hidden, the
 * finger's momentum, a snap that settles on a category, the scroll kept inside the rail -- and no longer a translated track
 * spilling past the stage (the stage scrolled sideways and drew its bar: the owner's "scrollbar"). A tap on a category
 * selects it and the rail brings it to the centre smoothly; the pad's L1 / R1 do the same; a redraw with the same category
 * keeps the finger's scroll; reduced motion centres it at once. Above the phone rule nothing moves (LR-23 / LR-34's track).
 * A browser adaptation: the launcher's layout and pointer, nothing of the game.
 */

interface Env { w: number; h: number; reduced?: boolean }
const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
function decl(sel: string, prop: string, env: Env, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, env))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}
const PHONES: Env[] = [{ w: 390, h: 844 }, { w: 375, h: 667 }, { w: 640, h: 360 }];
const WIDE: Env[] = [{ w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 844, h: 390 }];
const STRIP = '.cx-home.is-page .cx-crossbar__strip';
const TRACK = '.cx-home.is-page .cx-crossbar__strip > .cx-crossbar__track';

describe('LR-38 (1, 2): at the phone rule the page\'s rail is a native scroller with no bar', () => {
  for (const env of PHONES) {
    it(`${env.w}x${env.h}: the strip scrolls sideways (only), hides its bar, snaps, keeps the scroll, and its track is not translated`, () => {
      expect(decl(STRIP, 'overflow', env)).toBe('auto hidden');
      expect(decl(STRIP, 'scrollbar-width', env)).toBe('none');
      expect(decl(`${STRIP}::-webkit-scrollbar`, 'display', env)).toBe('none');
      expect(decl(STRIP, 'scroll-snap-type', env)).toBe('x mandatory');
      expect(decl(STRIP, '-webkit-overflow-scrolling', env)).toBe('touch');
      expect(decl(STRIP, 'overscroll-behavior-x', env)).toBe('contain');
      expect(decl(STRIP, 'scroll-behavior', env)).toBe('smooth');
      expect(decl(STRIP, 'scroll-behavior', { w: env.w, h: env.h, reduced: true }), 'reduced motion: no smooth scroll').toBe('auto');
      expect(decl('.cx-home.is-page .cx-cat', 'scroll-snap-align', env)).toBe('center');
      expect(decl(TRACK, 'position', env)).toBe('relative');
      expect(decl(TRACK, 'transform', env)).toBe('none');
      // the first and the last category can reach the centre: half the strip less half a pitch each side
      expect(decl(TRACK, 'padding-inline', env)).toBe('calc(50% - var(--s2u-cx-cat-pitch) / 2)');
      // and the stage itself never scrolls sideways (the bar the owner saw)
      expect(decl('.cx-stage', 'overflow-x', env)).toBe('hidden');
    });
  }
  for (const env of WIDE) {
    it(`${env.w}x${env.h}: unchanged -- the strip shows the whole row and the track slides (LR-24, LR-34)`, () => {
      expect(decl(STRIP, 'overflow', env)).toBe('visible');
      expect(decl(STRIP, 'scroll-snap-type', env)).toBeNull();
      expect(decl(TRACK, 'transform', env)).toBeNull();
    });
  }
});

let page: ConsolePage | null = null;
const width = window.innerWidth;
const setWidth = (w: number): void => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: w }); };
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => {
  page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); setWidth(width);
  delete (window as { matchMedia?: unknown }).matchMedia;
});
const strip = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!;
const track = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-crossbar__track')!;
const cat = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-cat[data-i="${i}"]`)!;
const rect = (left: number, w: number) => ({ left, right: left + w, top: 0, bottom: 80, width: w, height: 80, x: left, y: 0, toJSON() {} });
/** Boots at `w` px wide and spies the strip's scrollTo; the strip 390 wide at 0, each category 120 wide from x = 40 - 120 * scrollLeft-free. */
function boot(w: number, reduced = false): { p: ConsolePage; to: ReturnType<typeof vi.fn> } {
  setWidth(w);
  if (reduced) (window as { matchMedia?: unknown }).matchMedia = (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  const to = vi.fn();
  const s = strip();
  (s as unknown as { scrollTo: unknown }).scrollTo = to;
  vi.spyOn(s, 'getBoundingClientRect').mockReturnValue(rect(0, 390) as DOMRect);
  CATS.forEach((_, i) => { vi.spyOn(cat(i), 'getBoundingClientRect').mockReturnValue(rect(135 + (i - 2) * 120, 120) as DOMRect); });
  return { p: page, to };
}

describe('LR-38 (2): a tap or a shoulder brings the category to the rail\'s centre, smoothly', () => {
  it('at 390 px the strip is marked a scroller and the track carries no translation', () => {
    boot(390);
    expect(strip().dataset['rail']).toBe('scroll');
    expect(track().getAttribute('style') ?? '').not.toContain('translateX');
  });

  it('above the phone rule the track keeps its translation and the strip is no scroller (unchanged)', () => {
    boot(1024);
    expect(strip().dataset['rail']).toBeUndefined();
    expect(track().getAttribute('style')).toContain('translateX');
  });

  it('R1 on the pad: the new current category is scrolled to the centre, smoothly', () => {
    const { p, to } = boot(390);
    const c0 = p.ctl.S.cat;
    p.ctl.press('r1');
    expect(p.ctl.S.cat).toBe(c0 + 1);
    expect(to).toHaveBeenCalledTimes(1);
    // the next category's centre (135 + 120 + 60 = 315) to the strip's (195): 120 px to the right
    expect(to).toHaveBeenLastCalledWith({ left: 120, behavior: 'smooth' });
  });

  it('a tap on a category selects it and centres it smoothly', () => {
    const { p, to } = boot(390);
    cat(0).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(p.ctl.S.cat).toBe(0);
    expect(to).toHaveBeenCalledTimes(1);
    expect(to.mock.calls[0]![0]).toMatchObject({ behavior: 'smooth' });
  });

  it('a redraw with the same category keeps the finger\'s scroll (no jump back)', () => {
    const { p, to } = boot(390);
    p.ctl.press('r1');
    to.mockClear();
    p.render();
    p.render();
    expect(to).not.toHaveBeenCalled();
  });

  it('the strip node survives the redraw (its scrollLeft is not reset by the patch)', () => {
    const { p } = boot(390);
    const s = strip();
    s.scrollLeft = 77;
    p.ctl.press('r1');
    expect(strip()).toBe(s);
  });

  it('reduced motion: the category is centred at once', () => {
    const { p, to } = boot(390, true);
    p.ctl.press('l1');
    expect(to).toHaveBeenCalledTimes(1);
    expect(to.mock.calls[0]![0]).toMatchObject({ behavior: 'instant' });
  });
});
