// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems } from '../../src/console/state';
import { screenHead } from '../../src/console/render/head';
import { prompts } from '../../src/console/render/legend';
import { mountShell } from './shell';
import { captureLauncher, readLauncherSnap } from '../../src/console/history';
import { btn, dpad, shoulder } from '../../src/console/icons';
import { UI_SCALES } from '../../src/console/fit';
import { at, BASE, must, rem, type At } from './cascade';

/** LP.R13 supersedes whole-slot edge scrolling: the selected slot stays centered in a fixed carousel.
 * Unit tests cover selection/translation and boundary actions. Rendered center geometry is held by consoleCrossbar.spec.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); page = bootConsole(document, window, sampleAdapters(), { keymap: true }); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });
const ctl = () => page!.ctl;
const shift = () => {
  const style = document.querySelector('.cx-crossbar__track')!.getAttribute('style') ?? '';
  const match = /--s2u-cx-cat-pitch\) \* (-?[\d.]+)/.exec(style);
  if (!match) throw new Error(`missing carousel translation: ${style}`);
  return Number(match[1]);
};

/** The design's smallest console text (`cx-caption`, `cx-cat`: "the smallest console size", base.css). */
const FLOOR = Math.min(...['--s2u-type-cx-caption', '--s2u-type-cx-cat'].map((t) => Number(new RegExp(`${t}:\\s*\\d+ ([\\d.]+)rem`).exec(BASE)?.[1])));
/** LP.R13: one slot per category, centre to centre (the flex basis `--s2u-cx-cat-pitch`, console.css). */
const pitch = (a: At): number => rem('var(--s2u-cx-cat-pitch)', a);
const iconW = (a: At): number => rem(must(['.cx-cat .cx-ico'], 'width', a.w), a);
const currentScale = (a: At): number => Number(/scale\(([\d.]+)\)/.exec(must(['.cx-cat.is-current .cx-ico'], 'transform', a.w))![1]);
const labelRem = (a: At, current: boolean): number =>
  rem(must(current ? ['.cx-cat.is-current .cx-cat__label', '.cx-cat__label'] : ['.cx-cat__label'], 'font-size', a.w), a);
/** CX-17's sizes (1280 and 1024 the design's Crossbar page, 834 between) and the two phones LP.R13 is rendered at. */
const SIZES: readonly (readonly [number, number])[] = [[1280, 720], [1024, 768], [834, 1112], [412, 915], [390, 844]];

describe('LP.R13 centered Home carousel', () => {
  // LR.R2 (the owner, 2026-10-26) amends LP.R18's order; the ids, the default and the centring stand.
  it('orders Profile / Settings / Home / Online / Experiments (LR.R2) and defaults to Home', () => {
    expect(CATS.map((c) => c.id)).toEqual(['profile', 'options', 'home', 'online', 'experiments']);
    expect(CATS[ctl().S.cat]?.id).toBe('home');
  });
  it('each active slot is offset around the fixed center, with all categories still accessible', () => {
    for (let i = 0; i < CATS.length; i++) {
      ctl().pointer('cat', { i: String(i) });
      expect(shift() + i + 0.5, CATS[i]!.label).toBe(0);
      expect(document.querySelectorAll('.cx-cat')).toHaveLength(CATS.length);
      expect(document.querySelector('.cx-cat.is-current')?.getAttribute('aria-label')).toBe(CATS[i]!.label);
    }
  });
  // LR-24 (LR.R23 (a)): the launcher page's rail draws no L1 / R1 chips (the mockup's draws none); LR-39 (LR.R32): nor the
  // overlay's over a game (it kept them under LR.R18, whose disabled states this test read). The pad clamps in both.
  it('all directions clamp at both ends, in both modes; no L1 / R1 chips on either rail', () => {
    for (const mode of ['page', 'overlay'] as const) {
      ctl().S.mode = mode;
      page!.render();
      expect(document.querySelector('.cx-crossbar__hint'), mode).toBeNull();
      ctl().pointer('cat', { i: '0' });
      for (const b of ['left', 'l1'] as const) ctl().press(b);
      expect(ctl().S.cat, mode).toBe(0);
      for (let i = 1; i < CATS.length; i++) ctl().press('r1');
      expect(ctl().S.cat, mode).toBe(CATS.length - 1);
      for (const b of ['right', 'r1'] as const) ctl().press(b);
      expect(ctl().S.cat, mode).toBe(CATS.length - 1);
      ctl().press('l1');
      expect(ctl().S.cat, mode).toBe(CATS.length - 2);
    }
  });
  // CX-17 (restored from 69d7af897 test/console/crossbar.test.ts after #509): the label floor and the marks' clearance
  // hold on the centred rail (LP.R13; LR.R3). jsdom has no layout: the geometry is the cascade's (`./cascade`).
  for (const [w, h] of SIZES) {
    it(`at ${w}x${h}, every Interface size: the labels never below the design's smallest text (${FLOOR}rem), the marks never meet a neighbour's`, () => {
      expect(FLOOR).toBe(1);
      for (let ui = 0; ui < UI_SCALES.length; ui++) {
        const a = at(w, h, ui);
        const where = `${w}px ui ${UI_SCALES[ui]} (root ${a.px}px)`;
        const rest = labelRem(a, false);
        const cur = labelRem(a, true);
        expect.soft(rest, `${where}: a label at ${(rest * a.px).toFixed(2)}px`).toBeGreaterThanOrEqual(FLOOR);
        expect.soft(cur, `${where}: the current label at ${(cur * a.px).toFixed(2)}px`).toBeGreaterThanOrEqual(FLOOR);
        const p = pitch(a);
        const half = iconW(a) / 2;
        // The current mark (scaled from its centre) and its neighbours', one pitch apart centre to centre.
        expect.soft(p, `${where}: pitch ${p.toFixed(2)}rem against the current mark ${(2 * half * currentScale(a)).toFixed(2)}rem`).toBeGreaterThanOrEqual(half * currentScale(a) + half);
      }
    });
  }
  it('the rail mark spacing is the artifact default, 160 design px (LR.R9: S2-Launcher-v2.dc.html :51 width:160px, :1074 cat * 160)', () => {
    for (const [w, h] of SIZES) expect(pitch(at(w, h, 0)), `${w}px`).toBe(10);
  });
  it('Settings tabs retain their existing wrap behavior', () => {
    ctl().doAct('opt:display'); ctl().press('l1');
    expect(ctl().S.opt.cat).toBe(ctl().A.options.categories().length - 1);
    ctl().press('r1'); expect(ctl().S.opt.cat).toBe(0);
  });
  it('Sign out stays the last grouped Profile action', () => {
    ctl().pointer('cat', { i: String(CATS.findIndex((c) => c.id === 'profile')) });
    const list = document.querySelector('.cx-home__body > .cx-list')!;
    expect(list.lastElementChild?.querySelector('.cx-item__title')?.textContent).toBe('Sign out');
    expect(homeItems('profile', ctl().S, ctl().A).at(-1)?.act).toBe('signout');
  });
  it('Home calls its Cross prompt Select while preserving the focused action (Play\'s is "Play", LR-23)', () => {
    // LR-23 (LR.R22): on Play the Cross prompt is "Play" (it launches), was "Select"; the other items keep Select.
    expect(prompts(ctl().S, ctl().A).find((p) => p.k === 'cross')?.label).toBe('Play SOCOM II');
    ctl().S.item[ctl().S.cat] = 1; ctl().render();
    expect(prompts(ctl().S, ctl().A).find((p) => p.k === 'cross')?.label).toBe('Select');
    expect(homeItems('home', ctl().S, ctl().A)[1]?.act).toBe('server');   // LR-13 (LR.R17): Play, Server status (LR-37 (4): no Memory card)
  });
  it('history stores stable category identities and migrates old numeric indexes by path', () => {
    const now = captureLauncher(ctl().S, ctl().A);
    expect(now).toHaveProperty('catId', 'home');
    const old = { ...now, path: 'profile', cat: 2, item: [0, 1, 2, 3, 4] } as Record<string, unknown>;
    delete old.catId; delete old.itemByCat;
    const restored = readLauncherSnap({ s2uLauncher: old })!;
    expect(CATS[restored.cat]?.id).toBe('profile');
    expect(restored.item[restored.cat]).toBe(2);
    expect(CATS[readLauncherSnap({ s2uLauncher: { ...old, path: '' } })!.cat]?.id).toBe('home');
    expect(CATS[readLauncherSnap({ s2uLauncher: { ...old, path: 'watch', item: [0, 1, 2, 3, 4, 5] } })!.cat]?.id).toBe('profile');
  });
  it('shoulder presses mark the logical glyph and retrigger a tactile beat on repeated input', () => {
    ctl().press('l1');
    expect(document.documentElement.dataset.press).toBe('l1');
    expect(document.querySelector('[data-menu-glyph="l1"]')).not.toBeNull();
    const phase = document.documentElement.dataset.pressPhase;
    ctl().press('l1');
    expect(document.documentElement.dataset.pressPhase).not.toBe(phase);
  });
  it('all modern controller glyph helpers carry their logical marker and presses reach the feedback host', () => {
    for (const face of ['cross', 'circle', 'square', 'triangle'] as const) expect(btn(face)).toContain(`data-menu-glyph="${face}"`);
    for (const key of ['L1', 'R1', 'L2', 'R2', 'OPTIONS']) expect(shoulder(key)).toContain(`data-menu-glyph="${key.toLowerCase()}"`);
    expect(dpad('h')).toContain('data-menu-axis="h"'); expect(dpad('v')).toContain('data-menu-axis="v"');
    for (const key of ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'up', 'down', 'left', 'right', 'options'] as const) {
      ctl().press(key); expect(document.documentElement.dataset.press).toBe(key);
    }
  });
  it('pointer activation of the legend glyphs uses the same logical feedback', () => {
    ctl().render();                                                      // LR-23: Square (Disc source) is on Play (was: Play's panel's disc check)
    document.querySelector<HTMLElement>('#legend [data-b="square"]')!.click();
    expect(document.documentElement.dataset.press).toBe('square');
    document.querySelector<HTMLElement>('#legend [data-b="cross"]')!.click();
    expect(document.documentElement.dataset.press).toBe('cross');
    ctl().openSignIn(); ctl().render();
    document.querySelector<HTMLElement>('#legend [data-b="circle"]')!.click();
    expect(document.documentElement.dataset.press).toBe('circle');
  });
  it('nested return controls lead with a chevron before the context icon and label', () => {
    const head = document.createElement('div'); head.innerHTML = screenHead('Settings', 'Audio', 'Settings');
    const back = head.querySelector('.cx-back')!;
    expect(back.querySelector('.cx-back__chevron')).not.toBeNull();
    expect(back.querySelectorAll('.cx-ico')).toHaveLength(2);
    expect(back.firstElementChild?.classList.contains('cx-back__chevron')).toBe(true);
    expect(back.textContent).toBe('Settings');
    expect(back.querySelector('.cx-back__pad')).toBeNull();
  });
});
