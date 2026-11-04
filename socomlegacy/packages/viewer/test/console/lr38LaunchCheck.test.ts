// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { declsOf, mediaHolds as holds, PAGE, PAGE_RULES, type MediaEnv, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-38 (4) (the owner, 2026-10-29: "The Before you deploy should be styled exactly as the original mockup, attached to the
 * side and top to bottom ... the text is hard to read and it looks unfinished compared to the rest of the UI"). LR-36's
 * panel was drawn in the stage's box (between the header and the legend, inset from the window's right edge by the frame's
 * padding) in rem on the scaled root (at 1280x720 its 17px label drew at 13.6px, its 13px hint at 10.4px at 58%, its 12px
 * crumb at 9.6px). Now it is the mockup's panel (S2 Launcher v2.dc.html line 74): fixed to the window's right edge, top to
 * bottom, min(660px, 64%) wide, its 96 / 84px paddings, the 90deg ground from 45% to 92% at 30%, the 18px blur and the
 * 1px left edge, sliding in from 48px over .45s; its head and rows at the mockup's literal pixels (the 12px mono crumb at
 * .16em, the 34px title, the 44px sides and 22px under; rows 54px least, 8 / 12 by 24px, 16px gaps, the 17px label, the
 * 13px hint, the 56 / 52 / 28px ring, the 30px chip at 13px, the 20px list padding, 2px apart); the rail and the list
 * behind it fade to .16 and shift left 18% at .97 (`xmbOpacity`, `xmbShift`). On a portrait phone it spans the window
 * (the mockup draws no phone). The owner said "attached to the left side ... I believe" and "exactly as the original
 * mockup": the mockup attaches it to the RIGHT edge, and that is followed. Behaviour is LR-36's, unchanged
 * (lr36LaunchCheck.test.ts). A browser adaptation: the launcher's look, nothing of the game.
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
const P = '.cx-launchcheck';
const SIDE: MediaEnv[] = [{ w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 1920, h: 1080 }, { w: 844, h: 390 }, { w: 667, h: 375 }];
const PORTRAIT: MediaEnv[] = [{ w: 390, h: 844 }, { w: 375, h: 667 }];
const ALL = [...SIDE, ...PORTRAIT];

describe('LR-38 (4): the launch check is the mockup\'s side panel, edge-attached, top to bottom', () => {
  for (const at of ALL) {
    it(`${at.w}x${at.h}: fixed to the window's right edge, full height, the mockup's ground, blur and slide`, () => {
      expect(decl(P, 'position', at)).toBe('fixed');
      expect(decl(P, 'top', at)).toBe('0');
      expect(decl(P, 'right', at)).toBe('0');
      expect(decl(P, 'bottom', at)).toBe('0');
      expect(decl(P, 'background', at)).toBe('linear-gradient(90deg, var(--s2u-lx-panel-from), var(--s2u-lx-panel) 30%)');
      expect(decl(P, 'backdrop-filter', at)).toBe('blur(18px)');
      expect(decl(P, 'animation', at)).toBe('cx-lx-check-in 0.45s var(--s2u-ease) both');
      // the fixed panel's box is the window's: Home's own entrance (a transform) stands down while it is open
      expect(decl('.cx-home.is-check', 'animation', at)).toBe('none');
      // the legend's hints are drawn over its ground, as the mockup's are (its hints follow the panel)
      expect(decl('.cx-app:has(.cx-home.is-check) .cx-legend', 'z-index', at)).toBe('5');
    });
  }
  it('it slides in from 48px, the mockup\'s panelX', () => {
    expect(PAGE).toMatch(/@keyframes cx-lx-check-in \{ from \{ opacity: 0; translate: 48px 0; \} \}/);
  });
  for (const at of SIDE) {
    it(`${at.w}x${at.h}: min(660px, 64%) wide with its 1px left edge`, () => {
      expect(decl(P, 'left', at)).toBe('auto');
      expect(decl(P, 'width', at)).toBe('min(660px, 64vw)');
      expect(decl(P, 'border-left', at)).toBe('1px solid var(--s2u-lx-edge)');
    });
  }
  for (const at of PORTRAIT) {
    it(`${at.w}x${at.h}: the whole window's width, no edge; the header stays over it`, () => {
      expect(decl(P, 'left', at)).toBe('0');
      expect(decl(P, 'width', at)).toBe('auto');
      expect(decl(P, 'border-left', at)).toBe('0');
      expect(decl('.cx-app:has(.cx-home.is-check) .cx-header', 'z-index', at)).toBe('5');
    });
  }
  it('above the phone rule: the mockup\'s 96px top and 84px bottom (at least the legend\'s room)', () => {
    const at = { w: 1280, h: 720 };
    expect(decl(P, 'padding-top', at)).toBe('96px');
    expect(decl(P, 'padding-bottom', at)).toBe('max(84px, calc(var(--s2u-cx-legend-h) + max(calc(var(--s2u-cx-safe-y) * 0.7), env(safe-area-inset-bottom, 0px))))');
  });
  it('a short landscape screen: the header\'s and the legend\'s room (44px and 52px) instead', () => {
    for (const at of [{ w: 844, h: 390 }, { w: 667, h: 375 }]) {
      expect(decl(P, 'padding-top', at)).toBe('calc(max(6px, env(safe-area-inset-top, 0px)) + 52px)');
      expect(decl(P, 'padding-bottom', at)).toBe('calc(max(6px, env(safe-area-inset-bottom, 0px)) + 60px)');
    }
  });
});

describe('LR-38 (4): the mockup\'s type and spacing, in its literal pixels (readable at every size)', () => {
  for (const at of ALL) {
    it(`${at.w}x${at.h}: head 12 / 34px, rows 17 / 13px, 54px rows, the 56px ring, the 30px chip`, () => {
      expect(decl(`${P} .cx-screenhead`, 'padding', at)).toBe('0 44px 22px');
      expect(decl(`${P} .cx-screenhead__text`, 'gap', at)).toBe('8px');
      expect(decl(`${P} .cx-crumb`, 'font-size', at)).toBe('calc(12px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '12px')
      expect(decl(`${P} .cx-crumb`, 'letter-spacing', at)).toBe('0.16em');
      expect(decl(`${P} .cx-screenhead .cx-title`, 'font', at)).toBe('400 calc(34px * var(--cx-text-scale))/1.15 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 34px/1.15 var(--s2u-font-body)')
      expect(decl(`${P} .cx-rlist`, 'padding', at)).toBe('0 20px 20px');
      expect(decl(`${P} .cx-rlist`, 'gap', at)).toBe('2px');
      expect(decl(`${P} .cx-rlist`, 'overflow-y', at), 'the rows scroll under the head when they do not fit').toBe('auto');
      expect(decl(`${P} .cx-r:not(.cx-r--header)`, 'min-height', at)).toBe('54px');
      expect(decl(`${P} .cx-r:not(.cx-r--header)`, 'padding', at)).toBe('8px 24px');
      expect(decl(`${P} .cx-r:not(.cx-r--header)`, 'gap', at)).toBe('16px');
      expect(decl(`${P} .cx-r--check`, 'padding', at)).toBe('12px 24px');
      expect(decl(`${P} .cx-r--header.is-spacer`, 'padding', at)).toBe('10px 24px 0');
      expect(decl(`${P} .cx-r__label`, 'font-size', at)).toBe('calc(17px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '17px')
      expect(decl(`${P} .cx-r__hint`, 'font-size', at)).toBe('calc(13px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '13px')
      expect(decl(`${P} .cx-r__ring`, 'width', at)).toBe('56px');
      expect(decl(`${P} .cx-r__ring-in`, 'width', at)).toBe('52px');
      expect(decl(`${P} .cx-r__ring-in .cx-ico`, 'width', at)).toBe('28px');
      expect(decl(`${P} .cx-r__badge`, 'width', at)).toBe('18px');
      expect(decl(`${P} .cx-r__chip`, 'height', at)).toBe('30px');
      expect(decl(`${P} .cx-r__chip`, 'font-size', at)).toBe('calc(13px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '13px')
      expect(decl(`${P} .cx-r__arrow`, 'font-size', at)).toBe('calc(18px * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '18px')
    });
  }
  it('above the phone rule the rail and the list behind it fade to .16 and shift left 18% at .97 (xmbShift)', () => {
    for (const at of [{ w: 1280, h: 720 }, { w: 1024, h: 768 }]) {
      expect(decl('.cx-home.is-check .cx-crossbar', 'opacity', at)).toBe('0.16');
      expect(decl('.cx-home.is-check .cx-home__body', 'opacity', at)).toBe('0.16');
      expect(decl('.cx-home.is-check .cx-crossbar', 'transform', at)).toBe('translateX(-18vw) scale(0.97)');
      expect(decl('.cx-home.is-check .cx-home__body', 'transform', at)).toBe('translateX(-18vw) scale(0.97)');
    }
  });
});

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

describe('LR-38 (4): the panel\'s rows as the mockup draws them', () => {
  it('"Controller settings" carries its destination\'s mark, as the mockup\'s link rows do (its `icon(r.to)`)', () => {
    vi.stubEnv('DEV', false);
    const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => false }, { touch: () => false, keyboard: () => false }) };
    A.disc.state = () => 'ready';
    page = bootConsole(document, window, A, { keymap: false });
    page.ctl.press('cross');
    const panel = document.querySelector<HTMLElement>('#stage [data-panel="launch"]')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('[data-id="padsettings"] .cx-r__icon .cx-ico')).not.toBeNull();
  });
});
