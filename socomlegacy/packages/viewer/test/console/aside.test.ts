import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_SCALES } from '../../src/console/fit';
import { at, declIn, here, mediaAt, must, PAGE_RULES, rem, side, TIERS, value, type At } from './cascade';

/**
 * CX-ASIDE (issue #251; the console launcher plan `docs/plans/2026-10-11-console-launcher.md`, its row CX-ASIDE; the
 * product track, OT.R53): on the console's Options screen at 1280x720 the "About this option" panel (`.cx-aside`) drew
 * 67 px wide, its text one word per line; 404 px at 1920x1080. The cause, from part G of `shared/ds/components.css` (the
 * design export's bytes, never edited): the body is a flex row (`.cx-screen__body`, gap 2rem), the tabs a fixed 21.25rem,
 * the rows `flex: 0 1 57.5rem` and the aside `flex: 1; min-width: 0`, so the aside had only the stage's leftover -- at
 * the fit's 0.8 floor (`src/console/fit.ts`) the stage is 88rem at 1280x720 and the leftover 5.25rem.
 *
 * The fix, the page's own (`src/console/console.css`, CX-ASIDE): above the phone rule the aside keeps a readable least
 * width and the rows give way to it, down to a least width of their own that holds a roller's controls and its label;
 * where the Options screen (a size container) cannot hold the tabs, those rows and the aside side by side, the body is a
 * grid and the aside moves under the tabs, in their 21.25rem column (the seat's decision, 2026-10-17: the rows keep
 * their full height; below the rows, at 1280x720 and Interface 130 %, about one roller showed). The launcher page and the in-game overlay load the same
 * sheet. A browser adaptation with no original (OT.R28); the browser's check of the drawn boxes is
 * `e2e/consoleAside.spec.ts`.
 *
 * jsdom has no layout: the widths are computed from the rules (`./cascade`), the flex row resolved as a browser resolves
 * it for these three items (the tabs `flex: none`, the rows shrinking, the aside growing from 0 to its least width).
 */

const OPT = '.cx-screen[data-key="options"]';
/** The chosen least width of the aside, in rem (console.css, CX-ASIDE: three quarters of the design's 25.25rem, up). */
const ASIDE_MIN = 19;
/**
 * The longest word of a roller's label among the console's own rows, in rem: "Acceleration", 116 px at 16 px a rem in
 * the issue's frame `s02-ctl-1920.png` (7.25rem). A label word must fit beside the controls, or the roller is clipped.
 */
const LABEL_WORD = 7.25;
const EPS = 1e-6;
const SIZES: readonly (readonly [number, number])[] = [[1280, 720], [1366, 768], [1920, 1080], [1024, 768]];

/** `container cx-options (width < 79.75rem)` and the like, held against the container's width in rem. */
function containerHolds(m: string, width: number): boolean {
  const r = /^container cx-options \(width (<|>=) ([\d.]+)rem\)$/.exec(m);
  if (!r) throw new Error(`an unexpected container condition "${m}"`);
  return r[1] === '<' ? width < Number(r[2]) : width >= Number(r[2]);
}
/** The page's own unlayered rule value for `sel`'s `prop`, at a viewport `w` px wide and an Options screen `stage` rem wide. */
function pageValue(sel: string, prop: string, w: number, stage: number): string | null {
  let v: string | null = null;
  for (const r of PAGE_RULES) {
    if (r.layered || !r.sel.includes(sel)) continue;
    if (!r.media.every((m) => (m.startsWith('container ') ? containerHolds(m, stage) : mediaAt(m, w)))) continue;
    const d = declIn(r.body, prop);
    if (d) v = d;
  }
  return v;
}
/** The container conditions the page writes, as `[comparison, rem]`. */
const thresholds = (): [string, number][] => [...new Set(PAGE_RULES.flatMap((r) => r.media).filter((m) => m.startsWith('container ')))]
  .map((m) => { const r = /\(width (<|>=) ([\d.]+)rem\)/.exec(m)!; return [r[1]!, Number(r[2])] as [string, number]; });

/** Part G's value (the cx layer alone). */
const partG = (sel: string, prop: string, w: number): string => {
  for (const r of [...TIERS[1]!].reverse()) if (r.sel.includes(sel) && r.media.every((m) => mediaAt(m, w))) { const d = declIn(r.body, prop); if (d) return d; }
  throw new Error(`part G has no ${prop} for ${sel}`);
};

/** A roller's width less its label, in rem: its padding, its gap, the two step icons, the control's gaps and the value's least width. */
function rollerFixed(a: At, stage: number): number {
  const w = a.w;
  const pad = 2 * rem(side(partG('.cx-roller', 'padding', w), 1), a);
  const gap = rem(partG('.cx-roller', 'gap', w), a);
  const ico = 2 * rem(partG('.cx-roller__ctl .cx-ico', 'width', w), a);
  const ctlGap = 2 * rem(partG('.cx-roller__ctl', 'gap', w), a);
  const value = rem(pageValue(`${OPT} .cx-roller__value`, 'min-width', w, stage) ?? partG('.cx-roller__value', 'min-width', w), a);
  return pad + gap + ico + ctlGap + value;
}

interface Laid { stage: number; stacked: boolean; tabs: number; rows: number; aside: number; rowsMin: number; col1?: number; inFirst?: boolean }
/** The Options body at `a`, in rem: each item's outer width (the focus-ring room the page adds is given back by its margin). */
function layout(a: At): Laid {
  const w = a.w;
  const stage = a.bar;                                                       // .cx-screen: inset 0 in the stage
  const gap = rem(must(['.cx-screen__body'], 'gap', w), a);
  // A margin is optional: since CX-18 the tabs' column is part G's own box (its scroller inside carries the ring's room).
  const outer = (sels: string[]): number => rem(must(sels, 'width', w), a) + 2 * rem(side(value(sels, 'margin', w) ?? '0', 1), a);
  const tabs = outer(['.cx-tabs']);
  const ring = 2 * rem(side(must(['[data-scroll]'], 'margin', w), 1), a);  // negative: the rows' ring room given back
  const basis = rem(must(['.cx-rows[data-scroll]', '.cx-rows'], 'flex-basis', w), a) + ring;
  const minOf = (sel: string, extra = 0): number => { const v = pageValue(sel, 'min-width', w, stage); return v ? rem(v, a) + extra : 0; };
  const asideMin = minOf(`${OPT} .cx-aside`);
  const rowsMin = minOf(`${OPT} .cx-rows[data-scroll]`, ring);
  const stacked = pageValue(`${OPT} .cx-screen__body`, 'display', w, stage) === 'grid';
  if (stacked) {
    // The grid: the first column the tabs' and the aside's (its width the template's first track, which must be a
    // length: an `auto` track would grow to the aside's one-line text), the rows the rest.
    const first = side(pageValue(`${OPT} .cx-screen__body`, 'grid-template-columns', w, stage)!, 0);
    const col1 = /^[\d.]+rem$/.test(first) ? rem(first, a) : Number.NaN;
    const inFirst = pageValue(`${OPT} .cx-aside`, 'grid-column', w, stage) === '1';
    return { stage, stacked, tabs, rows: stage - tabs - gap, aside: inFirst ? col1 : stage - tabs - gap, rowsMin, col1, inFirst };
  }
  // The flex row: the tabs fixed; the aside (flex 1, basis 0) takes what is left over the rows' basis, at least its
  // least width, the rows (flex 0 1) shrinking to make that room, never below their own least width.
  const left = stage - tabs - 2 * gap;
  const aside = Math.max(asideMin, left - basis);
  const rows = Math.max(rowsMin, left - aside);
  return { stage, stacked, tabs, rows, aside, rowsMin };
}

describe('CX-ASIDE (issue #251): the Options side panel keeps a readable width', () => {
  it('part G is untouched: its .cx-aside rule is the export\'s line, byte for byte', () => {
    const raw = readFileSync(resolve(here, '../../../../../shared/ds/components.css'), 'utf-8');
    expect(raw).toContain('  .cx-aside { flex: 1; min-width: 0; padding: 1.75rem; display: flex; flex-direction: column; gap: 1rem; background: var(--s2u-panel-veil); box-shadow: inset 0 0 0 1px var(--s2u-panel-edge); align-self: flex-start; }\n');
    expect(raw).toContain('  .cx-rows { flex: 0 1 57.5rem; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }\n');
  });

  it(`above the phone rule the page gives the aside a least width in rem of at least ${ASIDE_MIN}rem, the Options screen a size container`, () => {
    const v = pageValue(`${OPT} .cx-aside`, 'min-width', 1280, 88);
    expect(v, 'the aside\'s min-width').toMatch(/^[\d.]+rem$/);
    expect(parseFloat(v!)).toBeGreaterThanOrEqual(ASIDE_MIN);
    expect(pageValue(OPT, 'container', 1280, 88)).toBe('cx-options / inline-size');
    // At the phone rule none of it: part G stacks the whole body there.
    expect(pageValue(`${OPT} .cx-aside`, 'min-width', 412, 30)).toBeNull();
    expect(pageValue(OPT, 'container', 412, 30)).toBeNull();
    expect(pageValue(`${OPT} .cx-screen__body`, 'display', 412, 30)).toBeNull();
  });

  it('the stacking width is the tabs, the two gaps, the rows\' least width and the aside\'s, from the rules', () => {
    const a = at(1280, 720, 0);
    const side = thresholds().filter(([c]) => c === '>=').map(([, n]) => n);
    const stack = thresholds().filter(([c]) => c === '<').map(([, n]) => n);
    expect(stack.length, 'a stacking rule').toBeGreaterThan(0);
    const t = Math.max(...stack);
    expect(side, 'the side-by-side rule at the same width').toContain(t);
    const l = layout({ ...a, bar: t });
    const asideMin = rem(pageValue(`${OPT} .cx-aside`, 'min-width', 1280, t)!, a);
    expect(l.stacked, `at ${t}rem: side by side`).toBe(false);
    expect(l.tabs + 2 * rem(must(['.cx-screen__body'], 'gap', 1280), a) + l.rowsMin + asideMin).toBeCloseTo(t, 9);
    expect(layout({ ...a, bar: t - 0.01 }).stacked, `under ${t}rem: stacked`).toBe(true);
  });

  it('below the stacking width the body is a grid: the tabs and under them the aside in the tabs\' column, the rows beside at full height', () => {
    const w = 1280;
    const s = 70;
    expect(pageValue(`${OPT} .cx-screen__body`, 'display', w, s)).toBe('grid');
    // The first column is part G's tab column, a length (an `auto` track would grow to the aside's one-line text).
    expect(pageValue(`${OPT} .cx-screen__body`, 'grid-template-columns', w, s)).toBe(`${partG('.cx-tabs', 'width', w)} minmax(0, 1fr)`);
    expect(pageValue(`${OPT} .cx-tabs`, 'grid-column', w, s)).toBe('1');
    expect(pageValue(`${OPT} .cx-tabs`, 'grid-row', w, s)).toBe('1');
    expect(pageValue(`${OPT} .cx-aside`, 'grid-column', w, s)).toBe('1');
    expect(pageValue(`${OPT} .cx-aside`, 'grid-row', w, s)).toBe('2');
    expect(pageValue(`${OPT} .cx-rows[data-scroll]`, 'grid-column', w, s)).toBe('2');
    expect(pageValue(`${OPT} .cx-rows[data-scroll]`, 'grid-row', w, s)).toBe('1 / -1');
    // The tabs keep room for every tab at its least, at most the body's height (LR-18: before it, one tab's height --
    // part G's .cx-tab min-height -- and the eighth tab was cut; test/console/lr18Tabs.test.ts computes that room); the
    // aside takes what it needs of the rest and scrolls past it.
    const rowsT = pageValue(`${OPT} .cx-screen__body`, 'grid-template-rows', w, s)!;
    // LR-22 (R1/R2): the aside's track has a least, 7.5rem, and the tab row yields it (was `min(100%, ...)` and `minmax(0, auto)`).
    expect(rowsT).toMatch(/^minmax\(min\(calc\(100% - 7\.5rem\), calc\(var\(--cx-tabs, 8\) \* .+\)\), 1fr\) minmax\(7\.5rem, auto\)$/);
    expect(pageValue(`${OPT} .cx-aside`, 'overflow-y', w, s)).toBe('auto');
  });

  it('stacked, the aside is the tabs\' column wide: part G\'s 21.25rem, at least its least width, and the rows keep the rest', () => {
    for (const [w, h, ui] of [[1024, 768, 0], [1280, 720, 1], [1280, 720, 2], [1366, 768, 2], [1024, 768, 2]] as const) {
      const a = at(w, h, ui);
      const l = layout(a);
      const where = `${w}x${h} ui ${UI_SCALES[ui]}`;
      expect(l.stacked, where).toBe(true);
      expect(l.inFirst, `${where}: the aside under the tabs`).toBe(true);
      expect(l.col1, where).toBeCloseTo(rem(partG('.cx-tabs', 'width', w), a), 9);
      expect(l.aside, where).toBeGreaterThanOrEqual(ASIDE_MIN);
      expect(l.rows, `${where}: the rows all the width beside the tabs`).toBeCloseTo(l.stage - l.tabs - 2, 9);
    }
  });

  for (const [w, h] of SIZES) {
    it(`at ${w}x${h}, every Interface size: the aside at least ${ASIDE_MIN}rem, the rows hold a roller and its label, all inside the stage`, () => {
      for (let ui = 0; ui < UI_SCALES.length; ui++) {
        const a = at(w, h, ui);
        const l = layout(a);
        const where = `${w}x${h} ui ${UI_SCALES[ui]} (stage ${l.stage.toFixed(2)}rem, ${l.stacked ? 'stacked' : 'side by side'})`;
        expect(l.aside, `${where}: the aside`).toBeGreaterThanOrEqual(ASIDE_MIN - EPS);
        expect(l.rows - rollerFixed(a, l.stage), `${where}: the room for a roller's label`).toBeGreaterThanOrEqual(LABEL_WORD);
        const used = l.stacked ? l.tabs + 2 + l.rows : l.tabs + 4 + l.rows + l.aside;
        expect(used, `${where}: the body's width`).toBeLessThanOrEqual(l.stage + EPS);
      }
    });
  }

  it('1280x720 (the issue\'s case) and 1366x768 at Interface 100 %: side by side, the aside at its least width or more', () => {
    for (const [w, h] of [[1280, 720], [1366, 768]] as const) {
      const l = layout(at(w, h, 0));
      expect(l.stacked, `${w}x${h}`).toBe(false);
      expect(l.aside, `${w}x${h}`).toBeGreaterThanOrEqual(ASIDE_MIN);
    }
  });

  it('1920x1080 at Interface 100 %: nothing moves, the rows at the design\'s 57.5rem and the aside its 25.25rem', () => {
    const l = layout(at(1920, 1080, 0));
    expect(l.stacked).toBe(false);
    expect(l.rows).toBeCloseTo(57.5, 9);
    expect(l.aside).toBeCloseTo(25.25, 9);
  });

  it('the launcher page and the in-game overlay load the same sheet', () => {
    const overlay = readFileSync(resolve(here, '../../src/modern/overlay/index.ts'), 'utf-8');
    expect(overlay).toMatch(/import CONSOLE_SHEET from '\.\.\/\.\.\/console\/console\.css\?url';/);
    const launcher = readFileSync(resolve(here, '../../index.html'), 'utf-8');
    expect(launcher).toMatch(/src\/console\/console\.css/);
  });
});
