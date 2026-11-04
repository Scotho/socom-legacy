// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY } from '../../src/console/state';
import { declsOf, PAGE_RULES } from './cascade';
import { mountShell } from './shell';

/**
 * LR-24's folds from the box's interim matrix-4 at 97f5822e3 (`agent-mail/evidence/lr-7-matrix-4/`):
 * - consoleRows.spec (1280x720, 1366x768): a visible Home row never took its click. Above the phone rule the page's Home
 *   list slides by the focused row (LR.R22, the mockup's `itemShift`), and the console's hover (CX-51) moved the focus:
 *   the row slid from under the pointer, the next row took the hover, the list chased it. The mockup's rows take no
 *   hover (only a click selects), so on that sliding list a hover moves no focus; a click still focuses and opens.
 * - BOX 4 (consoleAside.spec:143): the Settings rows list's 5-17 px "overflow" was its own vertical scrollbar; the list
 *   hides its scrollbar (it scrolls by the pad, the keys and the wheel), so its client width is its content's.
 * A browser adaptation: the launcher's pointer and look, nothing of the game.
 */

let page: ConsolePage | null = null;
const realMatch = window.matchMedia;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); window.matchMedia = realMatch; });
/** The wide layout's media query held or not (jsdom has no layout). */
const wide = (on: boolean): void => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes('width > 760px'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};
const boot = (): ConsolePage => {
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  page.ctl.S.input = 'pointer';
  document.documentElement.dataset.input = 'pointer';
  page.render();
  return page;
};
const over = (i: number): void => {
  document.querySelector(`#stage .cx-list [data-act="item"][data-i="${i}"]`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
};

describe('LR-24 fold: the page\'s sliding Home list takes no hover focus', () => {
  it('above the phone rule a hover over a row moves no focus (the list does not slide from under the pointer)', () => {
    wide(true);
    const p = boot();
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
    over(1);                                                                     // LR-37 (4): Server status (no Memory card)
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
    expect(document.querySelector('#stage .cx-list')!.getAttribute('style')).toContain('--cx-list-shift: 0');
  });
  it('a click still focuses the row and opens it', () => {
    wide(true);
    const p = boot();
    document.querySelector<HTMLElement>('#stage .cx-list [data-act="item"][data-i="1"]')!.click();   // LR-37 (4): Server status, its Cross the Server screen
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
    expect(p.ctl.S.screen).toBe('server');
  });
  // LR-28 (fact 3, the box's matrix-7 probe13): on the phones with a mouse the hover's move drew the rows under the
  // pointer and the first click opened another row; the page's Home list takes no hover at any size. Was: CX-51's hover
  // stood on the phones.
  it('on the phones too the hover moves no focus (LR-28)', () => {
    wide(false);
    const p = boot();
    over(1);
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
  });
});

// LR-25 (F4): the rule is the page's (not the overlay's, LR.R18): was `.cx-rows`.
const PAGE_ROWS = ':root[data-console]:not([data-console-mode="overlay"]) .cx-rows';
describe('LR-24 fold (BOX 4): the Settings rows list hides its scrollbar', () => {
  const body = (sel: string): string => PAGE_RULES.filter((r) => !r.layered && r.media.length === 0 && r.sel.includes(sel)).map((r) => r.body).join(';');
  it('`.cx-rows` draws no scrollbar (scrollbar-width none; the WebKit bar not displayed)', () => {
    expect(declsOf(body(PAGE_ROWS))).toContainEqual(['scrollbar-width', 'none']);
    expect(declsOf(body(`${PAGE_ROWS}::-webkit-scrollbar`))).toContainEqual(['display', 'none']);
  });
});
