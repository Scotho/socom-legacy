// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { RAIL_SETTLE_MS, railReleaseActive } from '../../src/console/render/home';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * The independent B193 review's rail finding (`agent-mail/evidence/review-b193-dot-2026-10-31.md`, F1): on a browser
 * without `scrollend` the phone rail's held-finger fallback (LR-40) put four release listeners on the document for every
 * strip and never took them off, so leaving Home for a screen that replaces its nodes and coming back piled them up, each
 * holding its retired strip. The release listeners stay one set per document, acting on the current strip. A browser
 * adaptation: the launcher's pointer, nothing of the game.
 */

const RELEASE = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'];
let page: ConsolePage | null = null;
const width = window.innerWidth;
const setWidth = (w: number): void => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: w }); };
const saved: [object, PropertyDescriptor][] = [];
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); mountShell(document);
  // `scrollend` stubbed out: the `onscrollend` handler property removed from the element's prototypes (jsdom has it)
  for (let o: object | null = HTMLElement.prototype; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, 'onscrollend');
    if (d) { saved.push([o, d]); delete (o as Record<string, unknown>)['onscrollend']; }
  }
});
afterEach(() => {
  page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); setWidth(width);
  for (const [o, d] of saved.splice(0)) Object.defineProperty(o, 'onscrollend', d);
});

const strip = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-crossbar__strip')!;
const cat = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-cat[data-i="${i}"]`)!;
const rect = (left: number, w: number) => ({ left, right: left + w, top: 0, bottom: 80, width: w, height: 80, x: left, y: 0, toJSON() {} });
function layout(mid: number): void {
  CATS.forEach((_, i) => { vi.spyOn(cat(i), 'getBoundingClientRect').mockReturnValue(rect(135 + (i - mid) * 120, 120) as DOMRect); });
}
function mock(): void {
  (strip() as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  vi.spyOn(strip(), 'getBoundingClientRect').mockReturnValue(rect(0, 390) as DOMRect);
}

describe('the phone rail\'s release listeners (the independent B193 review\'s P2)', () => {
  it('Home -> Settings -> Home -> Rooms -> Home, five times, with no scrollend: at most one live set of document release listeners', () => {
    const live = new Map<string, Set<unknown>>(RELEASE.map((t) => [t, new Set()]));
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((t: string, fn: unknown, o?: unknown) => {
      live.get(t)?.add(fn);
      add(t, fn as EventListener, o as AddEventListenerOptions);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((t: string, fn: unknown, o?: unknown) => {
      live.get(t)?.delete(fn);
      remove(t, fn as EventListener, o as EventListenerOptions);
    });
    const base = (): Map<string, number> => new Map(RELEASE.map((t) => [t, live.get(t)!.size]));
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const first = strip();
    const booted = base();                                     // the page's own pointer listeners and the first strip's one set
    for (let n = 0; n < 5; n++) {
      for (const screen of ['options', 'home', 'rooms', 'home'] as const) {
        page.ctl.S.screen = screen;
        page.render();
      }
    }
    expect(strip(), 'the strip was replaced (the defect\'s condition)').not.toBe(first);
    for (const t of RELEASE) expect(live.get(t)!.size, `${t}: no set added past the first strip's`).toBeLessThanOrEqual(booted.get(t)!);

    // hold, release and flick still work on the current strip
    mock();
    const c0 = page.ctl.S.cat;
    layout(c0 + 1);
    cat(c0 + 1).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    strip().dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(page.ctl.S.cat, 'held: nothing is selected').toBe(c0);
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(page.ctl.S.cat, 'not at once').toBe(c0);
    vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
    expect(page.ctl.S.cat, 'the release arms the rest').toBe(c0 + 1);

    mock();
    layout(c0 + 2);
    vi.advanceTimersByTime(2000);                               // any centring's mark ends
    strip().dispatchEvent(new Event('scroll'));                 // a flick
    vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
    expect(page.ctl.S.cat, 'a flick that rests selects its category').toBe(c0 + 2);
  });
});

/**
 * LR-45's fold (the independent B193 re-review's P3, `agent-mail/evidence/review-b193-dot-2026-10-31.md`): the per-document
 * release kept the last strip's closure -- and a finger held on it -- for as long as the document lived, past Home being
 * left and past the console's disposal, until a new fallback strip was watched; a release in that window armed a stale
 * rest. Home leaving the stage and the console's disposal now retire it: its hold and timers cleared, the document's entry
 * gone, so a release there arms nothing.
 */
describe('the phone rail\'s release, retired (LR-45 fold, the B193 re-review\'s P3)', () => {
  /** Boots at 390 with the finger held on the strip, a drag under way; answers the category it began on. */
  function heldOnHome(): number {
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    mock();
    const c0 = page.ctl.S.cat;
    layout(c0 + 1);
    cat(c0 + 1).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    strip().dispatchEvent(new Event('scroll'));
    expect(railReleaseActive(document), 'the strip\'s release is the document\'s').toBe(true);
    return c0;
  }

  it('Home left for Settings and never re-entered, then the console disposed: a release arms no timer, the entry is gone', () => {
    const c0 = heldOnHome();
    page!.ctl.S.screen = 'options';
    page!.render();
    expect(document.querySelector('#stage .cx-crossbar__strip'), 'Settings draws no rail').toBeNull();
    expect(railReleaseActive(document), 'Home left: the document holds no strip\'s release').toBe(false);
    const ctl = page!.ctl;
    page!.dispose(); page = null;
    const timers = vi.getTimerCount();
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(vi.getTimerCount(), 'the release armed a rest').toBe(timers);
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(ctl.S.cat, 'nothing selected').toBe(c0);
  });

  it('the console disposed while Home is drawn and the finger held: a release arms no timer, the entry is gone', () => {
    const c0 = heldOnHome();
    const ctl = page!.ctl;
    page!.dispose(); page = null;
    expect(railReleaseActive(document), 'disposed: the document holds no strip\'s release').toBe(false);
    const timers = vi.getTimerCount();
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(vi.getTimerCount(), 'the release armed a rest').toBe(timers);
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(ctl.S.cat, 'nothing selected').toBe(c0);
  });

  /**
   * The LR-45 re-review's blocking finding: a rotation round trip keeps the same strip element (the morph patches only its
   * `data-rail`), so the wide side's retirement deleted the document's entry and, back at the phone rule, the watched strip
   * never registered it again -- a finger's hold stayed held, and the rail never settled.
   */
  it('a rotation round trip, 390 -> 844 -> 390 on the same strip: hold and release still settle the rail', () => {
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const first = strip();
    setWidth(844);
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('#stage .cx-crossbar__strip[data-rail="scroll"]'), 'the wide side draws no scroll rail').toBeNull();
    expect(railReleaseActive(document), 'the wide side: retired').toBe(false);
    setWidth(390);
    window.dispatchEvent(new Event('resize'));
    expect(strip(), 'the morph kept the strip (the defect\'s condition)').toBe(first);
    expect.soft(railReleaseActive(document), 'back at the phone rule: the strip\'s release is the document\'s again').toBe(true);
    mock();
    vi.advanceTimersByTime(2000);                               // any centring's mark ends
    const c0 = page.ctl.S.cat;
    layout(c0 + 1);
    cat(c0 + 1).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    strip().dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(page.ctl.S.cat, 'held: nothing is selected').toBe(c0);
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
    expect(page.ctl.S.cat, 'the release arms the rest').toBe(c0 + 1);
  });

  it('Home entered again after the retirement: hold and release work on the new strip', () => {
    heldOnHome();
    page!.ctl.S.screen = 'options';
    page!.render();
    page!.ctl.S.screen = 'home';
    page!.render();
    mock();
    vi.advanceTimersByTime(2000);                               // any centring's mark ends
    const c0 = page!.ctl.S.cat;
    layout(c0 + 1);
    cat(c0 + 1).dispatchEvent(new Event('pointerdown', { bubbles: true }));
    strip().dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(RAIL_SETTLE_MS * 4);
    expect(page!.ctl.S.cat, 'held: nothing is selected').toBe(c0);
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(RAIL_SETTLE_MS + 1);
    expect(page!.ctl.S.cat, 'the release arms the rest').toBe(c0 + 1);
  });
});
