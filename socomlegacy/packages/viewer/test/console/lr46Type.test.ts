// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { legendHtml, prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, optCategories, OVERLAY_LOCK_WORDS, type Adapters, type ConsoleState } from '../../src/console/state';
import { PAGE_RULES, TIERS, at, declsOf, fontSizeOf, here, rem, ruleApplies, type MediaEnv } from './cascade';

/**
 * LR-46 (the owner, 2026-10-31, OWNER-WORDS.md: "make all launcher font that is not the main l1/r1 row just a bit larger.
 * All settings is a bit small. Top right user anme and the month/day. Make the settings overlay use the same bottom left
 * icons as the home page."). A browser adaptation: the launcher's look, nothing of the game.
 * - The type: every text size of the launcher's sheet (`src/console/console.css`) is its design size times one token,
 *   `--cx-text-scale` (1.08: one step of the launcher's 1-design-px scale at its 12..14px texts, 13 -> 14, 14 -> 15), but the
 *   main L1 / R1 rail's (its label and its shoulder chips), the brand lockup's (sized to its emblem) and START's (the cx
 *   layer's large button, LR-45's short-landscape tier) -- those keep their sizes exactly.
 * - The marks: Settings' legend draws Home's three marks (disc, controller, microphone; `render/legend.ts`), on the page
 *   and in the overlay, where it drew the device cues and the disc chip; its prompts and (on the page) START stay.
 */

const SCALE = 1.08;
const TV: MediaEnv = { w: 1920, h: 1080 };
/** The font size the cascade gives the element `sel` names at `env` (a `font-size`, or the `font` shorthand's), its tiers strongest first. */
function value(sels: string[], _prop: 'font-size', env: MediaEnv | number): string | null {
  const e = typeof env === 'number' ? TV : env;
  for (const tier of TIERS) {
    for (const sel of sels) {
      let v: string | null = null;
      for (const r of tier) {
        if (!r.sel.includes(sel) || !ruleApplies(r, e)) continue;
        for (const [n, d] of declsOf(r.body)) {
          const x = n === 'font-size' ? d : n === 'font' ? fontSizeOf(d) : null;
          if (x) v = x;
        }
      }
      if (v) return v;
    }
  }
  return null;
}
const css = readFileSync(resolve(here, '../../src/console/console.css'), 'utf-8');
const LEGEND_SRC = readFileSync(resolve(here, '../../src/console/render/legend.ts'), 'utf-8');

describe('LR-46: the launcher\'s text one step larger, through one token', () => {
  it('the token: --cx-text-scale is 1.08, declared once on the console\'s root', () => {
    const defs = PAGE_RULES.flatMap((r) => declsOf(r.body).filter(([n]) => n === '--cx-text-scale').map(([, v]) => ({ sel: r.sel, v })));
    expect(defs).toEqual([{ sel: [':root[data-console]'], v: String(SCALE) }]);
  });

  // Was (before LR-46) each design size; now that size times the token. Settings, the header's name and date, Home, the
  // legend, the panels' heads, the toast, Play's check panel (px).
  const WAS: [string, number][] = [
    ['.cx-r__label', 1.0625], ['.cx-r__hint', 0.8125], ['.cx-r__value', 0.8125], ['.cx-r--header', 0.6875], ['.cx-r__choice', 0.9375],
    ['.cx-tab', 1.0625], ['.cx-header .cx-player__name', 0.8125], ['.cx-clock__date', 0.875], ['.cx-clock__time', 1.375],
    ['.cx-legend .cx-prompt', 0.875], ['.cx-legend .cx-chip__word', 0.9375], ['.cx-home .cx-item__title', 1.5], ['.cx-home .cx-item__sub', 0.875],
    ['.cx-screen .cx-crumb', 0.75], ['.cx-screen .cx-screenhead .cx-title', 2.125], ['.cx-screen .cx-screenhead__desc', 0.9375],
    ['body .cx-toast', 0.9375], ['.cx-version', 0.85], ['.cx-launchcheck .cx-r__label', 17 / 16], ['.cx-launchcheck .cx-r__hint', 13 / 16],
  ];
  for (const [sel, was] of WAS) {
    it(`${sel}: ${(was * 16).toFixed(1)} design px, now times ${SCALE}`, () => {
      const a = at(1920, 1080, 0);
      const v = value([sel], 'font-size', 1920);
      expect(v, `${sel}'s font-size`).not.toBeNull();
      expect(v!, 'through the token').toContain('var(--cx-text-scale)');
      expect(rem(v!, a)).toBeCloseTo(was * SCALE, 5);
    });
  }

  it('the main L1 / R1 rail keeps its sizes exactly (its label 16 design px, its shoulder chips 18), no token', () => {
    expect(value(['.cx-cat__label'], 'font-size', 1920)).toBe('1rem');
    expect(value(['.cx-cat.is-current .cx-cat__label'], 'font-size', 1920)).toBe('1rem');
    expect(value(['.cx-home.is-page .cx-cat__label'], 'font-size', 1920)).toBe('16px');
    expect(value(['.cx-home.is-page .cx-cat.is-current .cx-cat__label'], 'font-size', 1920)).toBe('16px');
    expect(value(['.cx-crossbar__hint .cx-shoulder'], 'font-size', 1920)).toBe('1.125rem');
  });

  // Every font size the sheet sets carries the token but these, named: the rail's, the brand lockup's, START's, the
  // root's own scale (fit.ts) and the body's inherited default.
  const KEPT = new Set([
    ':root[data-console]', 'body',
    '.cx-cat__label', '.cx-cat.is-current .cx-cat__label', '.cx-home.is-page .cx-cat__label', '.cx-home.is-page .cx-cat.is-current .cx-cat__label', '.cx-crossbar__hint .cx-shoulder',
    '.cx-header .cx-brand__name', '.cx-header .cx-brand__sub', '.cx-legend .cx-start',
  ]);
  it('every other font size in console.css goes through the token (one knob, not element by element)', () => {
    const off: string[] = [];
    for (const r of PAGE_RULES) {
      for (const [n, v] of declsOf(r.body)) {
        if (n !== 'font' && n !== 'font-size') continue;
        if (!/\d(?:rem|px|em)\b/.test(v)) continue;
        if (r.sel.every((s) => KEPT.has(s))) continue;
        if (!v.includes('var(--cx-text-scale)')) off.push(`${r.sel.join(', ')} { ${n}: ${v} }`);
      }
    }
    expect(off).toEqual([]);
    expect(css).toContain('LR-46');
  });
});

/* ---------- Settings' legend: Home's marks ---------- */

function settings(mode: 'page' | 'overlay'): { S: ConsoleState; A: Adapters; host: HTMLElement } {
  const A = sampleAdapters() as Adapters;
  const S = createState(A);
  S.screen = 'options';
  S.opt = { cat: 0, row: 0, zone: 'rows' };
  if (mode === 'overlay') S.mode = 'overlay';
  const host = document.createElement('div');
  host.innerHTML = legendHtml(S, A);
  return { S, A, host };
}
function home(mode: 'page' | 'overlay'): HTMLElement {
  const A = sampleAdapters() as Adapters;
  const S = createState(A);
  if (mode === 'overlay') S.mode = 'overlay';
  const host = document.createElement('div');
  host.innerHTML = legendHtml(S, A);
  return host;
}
const marksOf = (h: HTMLElement): string[] => [...h.querySelectorAll('.cx-marks .cx-mark')].map((m) => m.getAttribute('data-mark') ?? '');

describe('LR-46: Settings\' legend draws Home\'s bottom-left marks', () => {
  it('the page: disc, controller, microphone in the marks\' cluster; no device cues, no disc chip; START and the prompts kept', () => {
    const { S, A, host } = settings('page');
    expect(marksOf(host)).toEqual(['disc', 'pad', 'mic']);
    expect(host.querySelector('.cx-cluster--marks .cx-marks')).not.toBeNull();
    expect(host.querySelector('.cx-chip, .cx-devices, .cx-device')).toBeNull();
    expect(host.querySelector('.cx-cluster--marks .cx-start')).not.toBeNull();
    expect([...host.querySelectorAll('.cx-prompts > li')].map((li) => li.querySelector('.cx-prompt > .cx-label')?.textContent)).toEqual(prompts(S, A).map((p) => p.label));
  });

  it('the overlay: the same three marks, no START (the overlay has none), the adaptation\'s line kept', () => {
    const { host } = settings('overlay');
    expect(marksOf(host)).toEqual(['disc', 'pad', 'mic']);
    expect(host.querySelector('.cx-start, .cx-chip, .cx-devices')).toBeNull();
    expect(host.querySelector('[data-overlay-label]')).not.toBeNull();
  });

  it('the controller and microphone marks are Home\'s own markup (one component, not a copy)', () => {
    for (const mode of ['page', 'overlay'] as const) {
      const s = settings(mode).host;
      const h = home(mode);
      for (const k of ['pad', 'mic']) expect(s.querySelector(`.cx-mark[data-mark="${k}"]`)!.outerHTML, `${mode} ${k}`).toBe(h.querySelector(`.cx-mark[data-mark="${k}"]`)!.outerHTML);
    }
    expect(LEGEND_SRC.match(/class="cx-marks"/g)?.length, 'the marks are drawn in one place').toBe(1);
  });

  it('Home\'s legend is unchanged: the marks and no START on the page', () => {
    const h = home('page');
    expect(marksOf(h)).toEqual(['disc', 'pad', 'mic']);
    expect(h.querySelector('.cx-start')).toBeNull();
  });
});

describe('LR-46: Settings\' marks do what Home\'s do (the disc mark the chip\'s chooser it replaced)', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });
  const ctl = () => {
    const A = sampleAdapters();
    const S = createState(A);
    const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
    const c = new ConsoleController(S, A, host);
    S.screen = 'options';
    S.opt = { cat: 0, row: 0, zone: 'rows' };
    return { A, S, c };
  };
  it('the controller mark opens the Controller tab; the disc mark the disc\'s chooser', () => {
    const { A, S, c } = ctl();
    c.pointer('markpad', {} as DOMStringMap);
    expect(S.screen).toBe('options');
    expect(optCategories(S, A)[S.opt.cat]?.id).toBe('controller');
    const choose = vi.spyOn(c, 'chooseDisc').mockImplementation(() => {});
    c.pointer('discmark', {} as DOMStringMap);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(S.src.open).toBe(false);
  });

  // The review's F3: the two acts the first build did not pin.
  it('the microphone mark opens the voice row', () => {
    const { A, S, c } = ctl();
    c.pointer('markmic', {} as DOMStringMap);
    expect(S.screen).toBe('options');
    expect(optCategories(S, A)[S.opt.cat]?.rows[S.opt.row]?.id).toBe('voice');
  });
  it('in the overlay over a game the disc mark chooses nothing and says the lock\'s line', () => {
    const { A, S, c } = ctl();
    S.mode = 'overlay';
    const choose = vi.spyOn(A.disc, 'choose');
    c.pointer('discmark', {} as DOMStringMap);
    expect(choose).not.toHaveBeenCalled();
    expect(S.legendError).toBe(OVERLAY_LOCK_WORDS.disc);
  });
});

/* ---------- the review's F1: the cx layer's own text sizes on the launcher ---------- */

describe('LR-46 fold (F1): the text the cx layer alone sized takes the token on the console', () => {
  // Each: the class, its cx-layer size (shared/ds components.css, unedited) -- was that size on the launcher.
  const CX: [string, number][] = [
    ['.cx-room', 1.375], ['.cx-room__count', 1.25], ['.cx-ping', 1], ['.cx-filter', 1.125], ['.cx-drawer__name', 3],
    ['.cx-drawer__cta', 1.25], ['.cx-side__name', 1], ['.cx-side__n', 1.75], ['.cx-facts', 1.25],
    ['.cx-roller__label', 1.375], ['.cx-roller__value', 1.25],
    ['.cx-persona__name', 1.5], ['.cx-persona__sub', 1], ['.cx-field__label', 1], ['.cx-field__box', 2], ['.cx-field__error', 1.0625],
    ['.cx-dialog__lead', 1.25], ['.cx-dialog__note', 1], ['.cx-toggle', 1.375],
    ['.cx-extract__file', 1.25], ['.cx-extract__figs dt', 1], ['.cx-extract__figs dd', 1.75], ['.cx-extract__where', 1.125], ['.cx-extract__cancel', 1.125],
    ['.cx-legend__error', 1.0625], ['.cx-tabs__hint', 1], ['.cx-eyebrow', 1], ['.cx-status', 1.125], ['.cx-proto', 1],
    ['.cx-osk__key', 1.5], ['.cx-osk__key.is-word', 1.125], ['.cx-dialog__title', 3.5],
  ];
  for (const [sel, was] of CX) {
    it(`${sel}: ${was}rem times the token at 1920x1080`, () => {
      const v = value([sel], 'font-size', TV);
      expect(v, `${sel}'s font-size`).not.toBeNull();
      expect(v!).toContain('var(--cx-text-scale)');
      expect(rem(v!, at(1920, 1080, 0))).toBeCloseTo(was * SCALE, 6);
    });
  }
  it('at the phone rule the keys, the dialog title and the extraction\'s figures keep their phone sizes, times the token', () => {
    const phone: MediaEnv = { w: 390, h: 844 };
    const a = at(390, 844, 0);
    expect(rem(value(['.cx-osk__key'], 'font-size', phone)!, a)).toBeCloseTo(1.125 * SCALE, 6);
    expect(rem(value(['.cx-osk__key.is-word'], 'font-size', phone)!, a)).toBeCloseTo(0.8125 * SCALE, 6);
    expect(rem(value(['.cx-dialog__title'], 'font-size', phone)!, a)).toBeCloseTo(2.75 * SCALE, 6);
    expect(rem(value(['.cx-extract__figs dd'], 'font-size', phone)!, a)).toBeCloseTo(1.375 * SCALE, 6);
  });
  it('the launcher\'s lx dialogs keep their own title (the page\'s rule, more specific)', () => {
    expect(rem(value(['.cx-dialog--lx .cx-dialog__title'], 'font-size', TV)!, at(1920, 1080, 0))).toBeCloseTo(2.125 * SCALE, 6);
  });
});
