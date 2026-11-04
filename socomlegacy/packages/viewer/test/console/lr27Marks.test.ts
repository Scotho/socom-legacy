// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optCategories, type Adapters } from '../../src/console/state';
import { mountShell } from './shell';
import { anchorSourceMenu } from '../../src/console/render/legend';

/** LR-27 (a browser adaptation, nothing of the game): Home's marks by the keyboard, and one anchor for the disc menu. */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); });
const boot = (a: Adapters = sampleAdapters()): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};
const mark = (kind: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#legend .cx-mark[data-mark="${kind}"]`)!;
/** A key at the focused element, as the browser does: keydown, and (if not prevented) the native click of a button. */
const press = (el: HTMLElement, k: string): boolean => {
  el.focus();
  const ev = new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  const native = !ev.defaultPrevented && (k === 'Enter' || k === ' ');
  if (native) el.click();
  return native;
};
const menus = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.cx-srcmenu')];

describe('LR-27 fact 1: Enter and Space on a focused mark activate it as a click does', () => {
  for (const k of ['Enter', ' ']) {
    it(`the disc mark opens the menu on ${JSON.stringify(k)}`, () => {
      const p = boot();
      press(mark('disc'), k);
      expect(p.ctl.S.src.open).toBe(true);
      expect(menus().length).toBe(1);
    });
  }
  it('a keyboard user then moves in the menu and picks a source with Enter', () => {
    const a = sampleAdapters();
    const p = boot(a);
    press(mark('disc'), 'Enter');
    const before = p.ctl.S.src.row;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(p.ctl.S.src.row).not.toBe(before);
    const pick = p.ctl.S.src.row;
    // The draw replaced the legend, so the focus is wherever the browser left it: the body, or the mark if kept.
    const at = (document.activeElement as HTMLElement | null) ?? document.body;
    at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    expect(p.ctl.S.src.open).toBe(false);
    expect(a.disc.source?.()).toBe(pick === 1 ? 'folder' : 'image');
  });
  it('the controller and microphone marks activate on Enter as a click does', () => {
    const p = boot();
    press(mark('pad'), 'Enter');
    expect(p.ctl.S.screen).toBe('options');
    expect(optCategories(p.ctl.S, p.ctl.A)[p.ctl.S.opt.cat]!.id).toBe('controller');
  });
});

describe('LR-27 fact 2: the disc menu has one anchor, the disc mark, by click and by Square', () => {
  const anchorOf = (): Element | null => menus()[0]?.closest('.cx-markbox')?.querySelector('[data-mark="disc"]') ?? null;
  it('opened by click', () => {
    boot();
    mark('disc').click();
    expect(menus().length).toBe(1);
    expect(anchorOf()).toBe(mark('disc'));
  });
  it('opened by Square on Play: the same single menu, the same anchor, none under Play\'s row', () => {
    const p = boot();
    expect(document.querySelector('.cx-home [data-act="item"][data-i]')).not.toBeNull();
    p.ctl.press('square');
    expect(p.ctl.S.src.open).toBe(true);
    expect(menus().length).toBe(1);
    expect(anchorOf()).toBe(mark('disc'));
    expect(document.querySelector('.cx-home .cx-srcmenu')).toBeNull();
  });
});

describe('LR-27 fact 2: one anchoring function places the menu from the disc mark box, upward, inside the window', () => {
  const rect = (l: number, t: number, w: number, h: number): DOMRect => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
  const withRects = (mark: DOMRect, box: DOMRect, menu: DOMRect): void => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('[data-mark="disc"]')) return mark;
      if (this.matches('.cx-srcmenu')) return menu;
      return box;
    });
  };
  for (const how of ['click', 'square'] as const) {
    it(`after ${how} the menu's left is the mark's, its bottom edge sits above the mark`, () => {
      const p = boot();
      withRects(rect(12, 340, 44, 44), rect(0, 300, 800, 90), rect(0, 0, 320, 120));
      if (how === 'click') mark('disc').click(); else p.ctl.press('square');
      anchorSourceMenu(document);
      const m = menus()[0]!;
      expect(m.style.left).toBe('12px');
      expect(m.style.right).toBe('auto');
      expect(m.style.top).toBe('auto');
      expect(m.style.bottom).toBe(`${390 - 340 + 6}px`);
    });
  }
  it('is kept inside the window: a mark near the right edge pulls the menu back', () => {
    const p = boot();
    withRects(rect(900, 340, 44, 44), rect(0, 300, 800, 90), rect(0, 0, 320, 120));
    p.ctl.press('square');
    anchorSourceMenu(document);
    expect(parseFloat(menus()[0]!.style.left)).toBe(window.innerWidth - 320);
  });
  it('does nothing with no menu open', () => {
    boot();
    expect(() => anchorSourceMenu(document)).not.toThrow();
  });
});
