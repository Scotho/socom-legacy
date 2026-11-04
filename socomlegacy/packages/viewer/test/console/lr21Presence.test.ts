// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { declsOf, mediaHolds as holds, PAGE_RULES, rulesOf, DS, TIERS, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-21 (the LR.R11 side-by-side's P7, P8, P10 and P13 -- `agent-mail/evidence/review-lr-7-side-by-side.md` -- against
 * the owner's artifact, `S2 Launcher v2.dc.html`): the artifact's presence.
 * - P7: Play's panel, opened, is the artifact's right sheet (its `width:min(660px,64%)` panel: the full height, the blurred
 *   ground, a 34px title, a 15px description, 54px rows, 56px check rings) and the rail and the list fade to 0.16 and
 *   shift left (its `xmbOpacity` 0.16 and `xmbShift` `translateX(-18%) scale(.97)`, on its 350ms fade and 450ms slide),
 *   above the phone rule and off a short landscape screen (the artifact draws no phone layout: the phones keep theirs);
 * - P8: an item's 14px line always drawn (its `subOp`: 1 on the selected item, 0.7 on the others), the item's icon in the
 *   bright ink (its `ink: '#f4f7f9'`), the rail's 18px gold bar the one gold;
 * - P10: the Settings tabs without part G's filled slabs: the artifact's list-row type (17px, sentence case) and the gold
 *   bar under the current one (the artifact has no tab column; its rail's 18px bar is its mark of the current one);
 * - P13: the legend bar as the artifact's: the status at the bottom left (its disc, controller and microphone marks), the
 *   hints at the bottom right, no rule over the bar; START (LR.R15) stays at the bar's right end.
 * jsdom has no layout: the rules are read as `./lr17Landscape` reads them (each media condition at the window's size).
 * A browser adaptation: the launcher's look, nothing of the game.
 */

interface Env { w: number; h: number; reduced?: boolean }
const UNLAYERED = PAGE_RULES.filter((r) => !r.layered);
/** The page's own (unlayered) value of `prop` on `sel` at `env`, the later rule winning; null where none. */
function decl(sel: string, prop: string, env: Env, rules: Rule[] = UNLAYERED): string | null {
  let v: string | null = null;
  for (const r of rules) {
    if (!r.sel.includes(sel) || !r.media.every((m) => holds(m, env))) continue;
    for (const [n, val] of declsOf(r.body)) if (n === prop) v = val;
  }
  return v;
}

const WIDE: Env[] = [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 1366, h: 768 }];
const PHONES: Env[] = [{ w: 844, h: 390 }, { w: 640, h: 360 }, { w: 390, h: 844 }, { w: 360, h: 640 }];

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });
const boot = (a: Adapters = sampleAdapters()): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};
const home = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-home')!;

/*
 * LR-23 (LR.R22, the owner, 2026-10-27: "The entire right side overlay for the selected category - gone"): Play's panel
 * and the right sheet it opened as are gone, and LR.R21's modal sheet with them. Was (LR-21 (a), P7): Cross on Play marked
 * Home `is-sheet`; the sheet min(660px, 64%) wide at the window's right edge, the full height, blurred, its 34 / 15px type,
 * 54px rows and 56px rings; the rail and the list faded to 0.16 and shifted; a click beside it was Circle (the scrim over
 * the header, the account menu's z 12 dropped); the phones kept their panel; no slide under reduced motion.
 */
describe('LR-21 (a) P7, superseded for Home by LR.R22 (LR-23): no sheet on Home', () => {
  it('Cross on Play never shows a sheet or a scrim, ready or not', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    a.disc.choose = vi.fn(async () => false);
    const p = boot(a);
    p.ctl.press('cross');
    expect(home().classList.contains('is-sheet')).toBe(false);
    expect(document.querySelector('#stage .cx-sheet-scrim')).toBeNull();
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    // the LR-36 fold (LR.R30): what Cross opens with the disc out is the launch check, not LR-21's sheet
    expect(document.querySelector('#stage [data-panel="launch"]')).not.toBeNull();
    a.disc.state = () => 'ready';
    p.render();
    expect(home().classList.contains('is-sheet')).toBe(false);
  });

  for (const env of [...WIDE, ...PHONES]) {
    it(`${env.w}x${env.h}: no rule draws a sheet, its scrim, or fades the rail and the list under one`, () => {
      for (const r of UNLAYERED.filter((x) => x.media.every((m) => holds(m, env)))) {
        for (const sel of r.sel) expect(sel, sel).not.toMatch(/is-sheet|cx-sheet-scrim/);
      }
    });
  }

  it('the account menu keeps its z 12 (LR.R21 dropped it only under the open sheet)', () => {
    // LR-38 (4): it drops again only under Play's launch check, the mockup's side panel over the header (lr38LaunchCheck.test.ts).
    const z = TIERS.flatMap((t) => t).filter((r) => r.sel.some((x) => x.includes('.cx-account-menu') && !x.includes('.cx-home.is-check')) && declsOf(r.body).some(([n]) => n === 'z-index'));
    expect(z.map((r) => declsOf(r.body).find(([n]) => n === 'z-index')![1])).toEqual(['12']);
  });

  it('reduced motion: the rail and the list do not fade or move over time', () => {
    const env = { w: 1280, h: 720, reduced: true };
    for (const sel of ['.cx-home .cx-crossbar', '.cx-home .cx-list']) expect(decl(sel, 'transition', env), sel).toBe('none');
  });
});

// LR-23 (LR.R22): on the launcher page's Home the lines are visually hidden at every size (`.cx-home.is-page .cx-item__sub`,
// lr23Home.test.ts). Since LR-39 (LR.R32) the overlay's Home is `is-page` too, and LR-40 (decision 4a: LR.R22 supersedes
// LR.R20) hides them in every category's list (lr40Close.test.ts); these rules are read under `.cx-home` alone, beneath it.
describe('LR-21 (b) P8: the items\' lines always drawn, the icon in the bright ink', () => {
  for (const env of WIDE) {
    it(`${env.w}x${env.h}: every item draws its 14px line, 0.7 on an item not selected, 1 on the selected one`, () => {
      expect(decl('.cx-home .cx-item__sub', 'max-height', env)).toBe('none');
      expect(decl('.cx-home .cx-item__sub', 'opacity', env)).toBe('0.7');
      expect(decl('.cx-home .cx-item__sub', 'margin-top', env)).toBe('0.1875rem');
      expect(decl('.cx-home .cx-item.is-focused .cx-item__sub', 'opacity', env)).toBe('1');
      expect(decl('.cx-home .cx-item:hover .cx-item__sub', 'opacity', env)).toBe('1');
      expect(decl('.cx-home .cx-item__sub', 'font', env)).toBe('400 calc(0.875rem * var(--cx-text-scale))/1.35 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 0.875rem/1.35 var(--s2u-font-body)')
    });
  }
  it('the phones keep LP.R4\'s reveal (no room for a second line in their lists)', () => {
    for (const env of PHONES) expect(decl('.cx-home .cx-item__sub', 'max-height', env), `${env.w}x${env.h}`).toBeNull();
  });
  it('the DOM: Home, Online and Profile items each carry their line', () => {
    const p = boot();
    const lines = (): string[] => [...document.querySelectorAll('#stage .cx-list .cx-item')].map((i) => i.querySelector('.cx-item__sub')?.textContent ?? '');
    expect(lines().every((t) => t.length > 0)).toBe(true);
    p.ctl.press('r1');
    expect(lines().every((t) => t.length > 0)).toBe(true);
    p.ctl.press('l1');
    p.ctl.press('l1');
    p.ctl.press('l1');
    expect(lines().every((t) => t.length > 0)).toBe(true);
  });
  it('the item\'s icon is the bright ink (selected or not), under the status language (layered, before it)', () => {
    const layered = PAGE_RULES.filter((r) => r.layered);
    const at = layered.findIndex((r) => r.sel.includes('.cx-home .cx-item__icon') && declsOf(r.body).some(([n, v]) => n === 'color' && v === 'var(--s2u-lx-ink-hi)'));
    const status = layered.findIndex((r) => r.sel.some((x) => /cx-status--warning\) \.cx-item__icon$/.test(x)));
    expect(at, 'the bright ink on Home\'s item icons').toBeGreaterThanOrEqual(0);
    expect(status).toBeGreaterThan(at);
    // part G's gold on the focused item's icon is out-ranked (its selector is weaker than the page's)
    expect(rulesOf(DS, [], true).some((r) => r.sel.includes('.cx-item.is-focused .cx-item__icon'))).toBe(true);
    // and no unlayered colour on the icon (the status language must reach it, itemList's pin)
    expect(UNLAYERED.filter((r) => r.sel.some((x) => /\.cx-item__icon$/.test(x)) && /(^|;)\s*color\s*:/.test(r.body))).toEqual([]);
  });
});

describe('LR-21 (c) P10: the Settings tabs without the filled slabs', () => {
  const env = { w: 1280, h: 720 };
  it('a tab: no surface, the list row\'s 17px type in sentence case', () => {
    expect(decl('.cx-tab', 'background', env)).toBe('none');
    expect(decl('.cx-tab', 'box-shadow', env)).toBe('none');
    expect(decl('.cx-tab', 'font', env)).toBe('400 calc(1.0625rem * var(--cx-text-scale))/1.3 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 1.0625rem/1.3 var(--s2u-font-body)')
    expect(decl('.cx-tab', 'text-transform', env)).toBe('none');
    expect(decl('.cx-tab', 'letter-spacing', env)).toBe('0');
    expect(decl('.cx-tab:hover', 'background', env)).toBe('color-mix(in srgb, var(--s2u-lx-ink) 4%, transparent)');
  });
  it('the current tab: no surface, the bright ink and the 18px gold bar under its word', () => {
    expect(decl('.cx-tab.is-current', 'background', env)).toBe('none');
    expect(decl('.cx-tab.is-current', 'box-shadow', env)).toBe('none');
    expect(decl('.cx-tab.is-current', 'color', env)).toBe('var(--s2u-lx-ink-hi)');
    expect(decl('.cx-tab.is-current .cx-tab__label::after', 'width', env)).toBe('1.125rem');
    // its 2px height and the gold from the bar's own rule (the current one's rule sets only the width)
    expect(decl('.cx-tab.is-current .cx-tab__label::after', 'height', env) ?? decl('.cx-tab__label::after', 'height', env)).toBe('2px');
    expect(decl('.cx-tab.is-current .cx-tab__label::after', 'background', env) ?? decl('.cx-tab__label::after', 'background', env)).toBe('var(--s2u-lx-accent)');
    expect(decl('.cx-tab__label::after', 'width', env)).toBe('0');
  });
  it('the DOM: every tab\'s word in its own label (the bar\'s anchor)', () => {
    const launcher: LauncherState = { disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} };
    const options = liveOptions(() => { page?.render(); }, { launcher, signedIn: () => false, pads: () => [], touch: () => false, install: () => 'chromium' });
    const sample = sampleAdapters();
    const p = boot({ ...sample, data: 'live', states: undefined, options } as Adapters);
    p.ctl.doAct('opt:display');
    p.render();
    const tabs = [...document.querySelectorAll('#stage .cx-tab')];
    expect(tabs.length).toBe(3);
    for (const t of tabs) expect(t.querySelector('.cx-tab__label')?.textContent?.trim()).toBe(t.textContent?.trim());
    expect(document.querySelector('#stage .cx-tab.is-current .cx-tab__label')?.textContent).toBe('Display');
  });
});

describe('LR-21 (d) P13: the legend bar as the artifact\'s', () => {
  it('no rule over the bar, START ready or not', () => {
    for (const env of [...WIDE, ...PHONES]) {
      expect(decl('.cx-app .cx-legend.is-ready', 'box-shadow', env), `${env.w}x${env.h}`).toBe('none');
      expect(decl('.cx-app .cx-legend', 'box-shadow', env), `${env.w}x${env.h}`).toBe('none');
    }
  });
  for (const env of WIDE) {
    it(`${env.w}x${env.h}: the status at the left (disc, controller, microphone), the hints at the right, START at the end`, () => {
      expect(decl('.cx-legend .cx-cluster', 'display', env)).toBe('contents');
      const order = (sel: string): number => Number(decl(sel, 'order', env) ?? '0');
      expect(order('.cx-legend .cx-chip')).toBeLessThan(order('.cx-legend .cx-devices'));
      expect(order('.cx-legend .cx-devices')).toBeLessThan(order('.cx-legend .cx-prompts'));
      expect(order('.cx-legend .cx-prompts')).toBeLessThan(order('.cx-legend .cx-start'));
      expect(decl('.cx-legend .cx-prompts', 'margin-left', env), 'the hints pushed to the right').toBe('auto');
      for (const sel of ['.cx-legend .cx-chip', '.cx-legend .cx-devices', '.cx-legend .cx-start']) expect(decl(sel, 'flex-shrink', env), sel).toBe('0');
    });
  }
  it('the phones keep LR.R19\'s bar (the artifact draws none)', () => {
    for (const env of PHONES) expect(decl('.cx-legend .cx-cluster', 'display', env), `${env.w}x${env.h}`).toBeNull();
  });
  it('the DOM keeps its order (prompts, the cluster, the error line): the reading order and LR-19\'s pins stand', () => {
    boot();
    const kids = [...document.getElementById('legend')!.children].map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['cx-prompts', 'cx-cluster', 'cx-legend__error']);
  });
});
