// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY } from '../../src/console/state';
import { declsOf, PAGE_RULES, ruleApplies } from './cascade';
import { mountShell } from './shell';

/**
 * LR-26's folds from the box's final run of LR-24 at 579ac513b (`agent-mail/evidence/lr-7-matrix-5/`; a browser adaptation:
 * the launcher's pointer and look, nothing of the game):
 * - consoleAside.spec:143 (5-17 px "sideways overflow" of the Settings rows): it was never the scrollbar. `console.css` hid
 *   every `[data-scroll]` scrollbar above the phone rule since CX-11, so LR-24's `.cx-rows` rule changed nothing. The number is
 *   the rows' slide-in (`cx-lx-row-in`, a transform of 1.375rem from the right) read while it runs -- the 1.375rem - 5px
 *   the spec's own comment names -- which a scroll box counts as sideways overflow. The spec now ends the animation in the
 *   turn it measures; these pins hold the two facts the reading stands on.
 * - phone sizes: a click on a row the hover just focused opens it on that click (the wide list: click = focus + open).
 * LR-28 (the box's matrix-7): the slide-in left a latched overflow after it ended (the rows now slide inside their own box,
 * lr28Fixes.test.ts), and on the phones the hover moves no focus either (the row under a click is the row opened).
 */

let page: ConsolePage | null = null;
const realMatch = window.matchMedia;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); window.matchMedia = realMatch; });
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
const row = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-list [data-act="item"][data-i="${i}"]`)!;
const over = (i: number): void => { row(i).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); };

describe('LR-26: a click on a row the hover just focused opens it, at the phone sizes too', () => {
  it('on the phones the hover leaves the focus on Play and the click on Server status opens the Server screen', () => {
    wide(false);
    const p = boot();
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
    // LR-37 (LR.R31): the page's Home is Play, Server status, Discord (no Memory card row), so Server status is row 1 (was 2)
    over(1);
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);                           // LR-28: no hover focus (was: CX-51's hover, 2)
    row(1).click();                                                        // the first click, hover and click on the same row
    expect(p.ctl.S.screen).toBe('server');
  });
  it('above the phone rule the hover moves nothing and the same click focuses and opens the row', () => {
    wide(true);
    const p = boot();
    over(1);                                                               // LR-37 (LR.R31): Server status is row 1 (was 2)
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(0);
    row(1).click();
    expect(p.ctl.S.screen).toBe('server');
  });
});

describe('LR-26 fold (consoleAside): what the rows list\'s sideways overflow is', () => {
  const rules = PAGE_RULES;                                                // the page's s2u.base layer holds CX-11's rule
  const bodyAt = (sel: string, w: number): [string, string][] =>
    rules.filter((r) => r.sel.includes(sel) && ruleApplies(r, { w, h: 900 })).flatMap((r) => declsOf(r.body));
  it('every [data-scroll] list above the phone rule already draws no scrollbar (so none can widen the Settings rows)', () => {
    expect(bodyAt('[data-scroll]', 1280)).toContainEqual(['scrollbar-width', 'none']);
    expect(bodyAt('[data-scroll]::-webkit-scrollbar', 1280)).toContainEqual(['display', 'none']);
    expect(bodyAt('[data-scroll]', 1920)).toContainEqual(['scrollbar-width', 'none']);
  });
  it('the rows enter by a transform from 1.375rem (the only thing a settled list does not carry)', () => {
    expect(rules.some((r) => r.sel.includes('.cx-rlist > .cx-r') && /animation:\s*cx-lx-row-in/.test(r.body))).toBe(true);
    // LR-28: the transform is the row's contents' (`cx-lx-row-slide`), inside the row; the row only fades
    expect(rules.some((r) => r.sel.includes('.cx-rlist > .cx-r > *') && /animation:\s*cx-lx-row-slide/.test(r.body))).toBe(true);
  });
  it('the Settings spec ends the slide-in in the turn it measures (the read is of the settled list)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../e2e/consoleAside.spec.ts'), 'utf-8');
    expect(src).toMatch(/for \(const a of rows\.getAnimations\(\{ subtree: true \}\)\) \{ try \{ a\.finish\(\)/);
  });
});
