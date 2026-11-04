// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { PASSWORD_ID } from '../../src/console/render/overlay';
import { declsOf, mediaHolds as holds, PAGE_RULES, type MediaEnv, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-38 (3) (the owner, 2026-10-29: "The sign in ui for mobile cuts off with 300-400px of space available below it and a
 * strange opaque bar (portrait) (too much space in landscape too tho)"). The root cause is the scrim's own box (part G's
 * `.cx-scrim`): `position: fixed; inset: 0` -- the layout viewport, which a phone's soft keyboard and its toolbars cover --
 * with a bottom padding that reserves the legend's room (`--s2u-cx-legend-h` + `--s2u-cx-safe-y` + 1rem: 99px at 390x844,
 * 114px at 844x390, where its top padding takes 43px more and leaves the dialog 233 of 390px) though the scrim covers the
 * legend; the dialog, capped to that box, scrolled inside it and drew its scrollbar beside the cut (the opaque bar). At the
 * phone rule and on a short landscape screen the scrim is now the visual viewport (`--cx-vv-h` / `--cx-vv-top`, kept by
 * `../../src/console/input.ts` from `visualViewport`; 100dvh without it), its padding the safe areas or 12px, no legend
 * reserve; the dialog sizes to its content, centred, scrolls inside only when it does not fit, and draws no bar; a field
 * that takes the focus (a tap on it, the soft keyboard coming up) is scrolled into the dialog's view. Above the phone rule
 * nothing changes. A browser adaptation: the launcher's layout, nothing of the game.
 */

const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
function decl(sel: string, prop: string, at: MediaEnv, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, at))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}
const PHONES: MediaEnv[] = [{ w: 390, h: 844 }, { w: 375, h: 667 }, { w: 844, h: 390 }, { w: 667, h: 375 }];
const SAFE = 'max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))';

describe('LR-38 (3): on a phone the dialog\'s scrim is the visible viewport, with no legend reserve', () => {
  for (const at of PHONES) {
    it(`${at.w}x${at.h}: the scrim spans the visual viewport, padded by the safe areas only`, () => {
      expect(decl('.cx-scrim', 'top', at)).toBe('var(--cx-vv-top, 0px)');
      expect(decl('.cx-scrim', 'bottom', at)).toBe('auto');
      expect(decl('.cx-scrim', 'height', at)).toBe('var(--cx-vv-h, 100dvh)');
      expect(decl('.cx-scrim', 'padding', at)).toBe(SAFE);
      // the dialog: as tall as its content, never past the scrim, centred, no scrollbar drawn beside it
      expect(decl('.cx-scrim > .cx-dialog', 'max-height', at)).toBe('100%');
      expect(decl('.cx-scrim > .cx-dialog', 'height', at)).toBe('auto');
      expect(decl('.cx-scrim > .cx-dialog', 'scrollbar-width', at)).toBe('none');
      expect(decl('.cx-scrim > .cx-dialog::-webkit-scrollbar', 'display', at)).toBe('none');
    });
  }
  it('above the phone rule and off a short landscape screen the scrim is part G\'s (unchanged)', () => {
    for (const at of [{ w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 1920, h: 1080 }]) {
      expect(decl('.cx-scrim', 'height', at)).toBeNull();
      expect(decl('.cx-scrim', 'padding', at)).toBeNull();
    }
  });
});

let page: ConsolePage | null = null;
const width = window.innerWidth;
const setWidth = (w: number): void => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: w }); };
class FakeViewport extends EventTarget { height = 700; offsetTop = 0; width = 390; }
let vv: FakeViewport | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => {
  page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); setWidth(width);
  if (vv) { delete (window as { visualViewport?: unknown }).visualViewport; vv = null; }
});
const rect = (top: number, bottom: number) => ({ top, bottom, left: 20, right: 340, width: 320, height: bottom - top, x: 20, y: top, toJSON() {} }) as DOMRect;

describe('LR-38 (3): the visual viewport and the focused field', () => {
  it('the scrim\'s height and top follow the visual viewport (the soft keyboard up, then down)', () => {
    vv = new FakeViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--cx-vv-h')).toBe('700px');
    expect(root.getPropertyValue('--cx-vv-top')).toBe('0px');
    vv.height = 380; vv.offsetTop = 64;
    vv.dispatchEvent(new Event('resize'));
    expect(root.getPropertyValue('--cx-vv-h')).toBe('380px');
    expect(root.getPropertyValue('--cx-vv-top')).toBe('64px');
    vv.height = 700; vv.offsetTop = 0;
    vv.dispatchEvent(new Event('scroll'));
    expect(root.getPropertyValue('--cx-vv-h')).toBe('700px');
    page.dispose(); page = null;
    expect(root.getPropertyValue('--cx-vv-h'), 'taken down with the page\'s inputs').toBe('');
  });

  it('a field taking the focus is scrolled into the dialog\'s view, never the page behind it', () => {
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.openSignIn();
    page.render();
    const dialog = document.querySelector<HTMLElement>('#overlay .cx-dialog')!;
    const field = document.getElementById(PASSWORD_ID) as HTMLInputElement;
    const box = field.closest<HTMLElement>('.cx-field__box')!;
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(rect(40, 340));
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(420, 470));
    const pageScroll = vi.fn();
    box.scrollIntoView = pageScroll;
    field.scrollIntoView = pageScroll;
    field.focus();
    expect(dialog.scrollTop, 'the box\'s bottom (470) brought to the dialog\'s (340)').toBeGreaterThanOrEqual(130);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('the keyboard coming up (the visual viewport shrinking) keeps the focused field in view again', () => {
    vv = new FakeViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    setWidth(390);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.openSignIn();
    page.render();
    const dialog = document.querySelector<HTMLElement>('#overlay .cx-dialog')!;
    const field = document.getElementById(PASSWORD_ID) as HTMLInputElement;
    const box = field.closest<HTMLElement>('.cx-field__box')!;
    const dr = vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(rect(40, 640));
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(420, 470));
    field.focus();
    expect(dialog.scrollTop).toBe(0);
    dr.mockReturnValue(rect(40, 360));                                 // the keyboard took the lower half
    vv.height = 380;
    vv.dispatchEvent(new Event('resize'));
    expect(dialog.scrollTop).toBeGreaterThanOrEqual(110);
  });
});
