// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { rootFontPx } from '../../src/console/fit';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, type Adapters } from '../../src/console/state';
import { declsOf as decls, rem, ruleApplies as applies, side, TIERS, words, type At } from './cascade';
import { mountShell } from './shell';

/**
 * LR-17 (the LR.R11 side-by-side review's P1, `agent-mail/evidence/review-lr-7-side-by-side.md`; the LR-7 matrix's
 * 844x390 shots): in phone landscape the launcher collapsed on every screen -- the item list had no height (Play, Memory
 * card, Server status; System Settings, App, Theme never drawn, so the Settings tabs were unreachable), the rail's label
 * cut to "..", the legend's disc chip squeezed over the panel's title, START drawn over the panel's chips and cog.
 *
 * The cause, read from the rules (jsdom has no layout, so the room is computed from them as `./cascade` computes widths):
 * at 844x390 the fit's 0.8 floor (`src/console/fit.ts`) makes 1rem 12.8px; above the phone rule and at or under 500px
 * tall neither the TV composition (`height > 500px`) nor the short-desktop band (`500px < height <= 800px`) holds, so
 * part G's own rail stands -- 7.5rem down, 9.5rem tall, 218px of a stage 214px tall after the frame's padding, the header
 * and the legend -- and the legend's prompts wrap (part G `.cx-prompts { flex-wrap: wrap }`) into a second and third
 * line, taking more. The rail, a flex item whose content is all absolutely placed, shrinks to nothing (flex-shrink 1, a
 * least height of 0), its strip clipping the label; the body is left no room. The page already had the compact layout
 * for a short landscape screen, but behind `(pointer: coarse)`: a phone's on-screen width with a mouse, a desktop
 * window as short, or the matrix's browser (no touch emulation: its legend shows the prompts the coarse rule hides)
 * never got it. The fix is that rule for every pointer, the rail no longer shrinking, the legend one line.
 * A browser adaptation: the launcher's layout, nothing of the game.
 */

interface Env { w: number; h: number; pointer: 'fine' | 'coarse'; input: 'pointer' | 'pad' }


/** `prop` read from one declaration, its shorthand's part where the declaration is the shorthand. */
function part(prop: string, name: string, v: string): string | null {
  if (name === prop) return v;
  const box = /^(margin|padding)-(top|right|bottom|left)$/.exec(prop);
  if (box && name === box[1]) return side(v, (['top', 'right', 'bottom', 'left'] as const).indexOf(box[2] as 'top') as 0 | 1 | 2 | 3);
  if (prop === 'flex-shrink' && name === 'flex') {
    const w = words(v);
    return v === 'none' ? '0' : w.length >= 2 ? w[1]! : '1';
  }
  return null;
}
/**
 * `prop` on the element `sel` names, at `env`: the strongest tier first (`./cascade` TIERS); within a tier a rule under
 * the pad's mark (`:root[data-console][data-input="pad"] <sel>`, the more specific) over the plain one, then the later.
 */
function decl(sel: string, prop: string, env: Env): string | null {
  const pad = `:root[data-console][data-input="pad"] ${sel}`;
  for (const tier of TIERS) {
    let plain: string | null = null;
    let padded: string | null = null;
    for (const r of tier) {
      if (!applies(r, env)) continue;
      const isPlain = r.sel.includes(sel);
      const isPad = env.input === 'pad' && r.sel.includes(pad);
      if (!isPlain && !isPad) continue;
      for (const [n, v] of decls(r.body)) {
        const p = part(prop, n, v);
        if (p == null) continue;
        if (isPad) padded = p; else plain = p;
      }
    }
    if (padded ?? plain) return padded ?? plain;
  }
  return null;
}
const need = (sel: string, prop: string, env: Env): string => {
  const v = decl(sel, prop, env);
  if (v == null) throw new Error(`no ${prop} for ${sel} at ${env.w}x${env.h}`);
  return v;
};

/** The room the layout leaves, in px, at `env` (Interface size 100 %). */
function room(env: Env) {
  const px = rootFontPx(env.w, env.h, 0);
  const a: At = { w: env.w, h: env.h, ui: 0, px, bar: 0 };
  const len = (v: string): number => rem(v, a) * px;
  const rows = words(need('.cx-app', 'grid-template-rows', env));
  const track = (t: string, minSel: string): number => (t === 'auto' ? len(need(minSel, 'min-height', env)) : len(t));
  const header = track(rows[0]!, '.cx-header');
  const legend = track(rows[rows.length - 1]!, '.cx-legend');
  const stage = env.h - len(need('.cx-app', 'padding-top', env)) - len(need('.cx-app', 'padding-bottom', env)) - header - legend;
  const railTop = len(need('.cx-crossbar', 'margin-top', env));
  const rail = len(need('.cx-crossbar', 'height', env));
  // LR-22 R7: the body's margin is 8px less the focus room it now pads its top with (the first item stays where it was): the
  // list's room starts after both (was the margin alone).
  const bodyTop = len(need('.cx-home__body', 'margin-top', env)) + len(decl('.cx-home__body', 'padding-top', env) ?? '0px');
  // The current mark's label (render/home.ts): `top: calc(50% + Xrem)` of the mark's own height, which is the rail's
  // (part G: the track and the mark are 100% tall); its line, then its gold bar (`::after`: a margin over a 2px bar).
  const lt = /^calc\(50% \+ ([\d.]+)rem\)$/.exec(need('.cx-cat__label', 'top', env));
  if (!lt) throw new Error('the label\'s top is no longer calc(50% + Xrem): read it again');
  const line = Number(/\/([\d.]+)\s/.exec(need('.cx-cat__label', 'font', env))?.[1] ?? NaN);
  const bar = len(side(need('.cx-cat__label::after', 'margin', env), 0)) + len(need('.cx-cat__label::after', 'height', env));
  const labelBottom = rail / 2 + Number(lt[1]) * px + line * px + bar;
  return { px, stage, rail, railTop, bodyTop, list: stage - railTop - rail - bodyTop, labelBottom, row: len(need('.cx-item', 'min-height', env)) };
}

/** LR.R12's phone landscapes (844x390, 640x360) and the touch spec's others, with a mouse and with touch. */
// The batch review's F2 (review-lr-batch-13-21.md): 1280x540, wider than 760 and between 501 and 550 tall, got both the
// short landscape layout (550) and the TV composition (then `height > 500px`); one cut now, LR.R19's 550.
const SHORT: readonly (readonly [number, number])[] = [[844, 390], [640, 360], [812, 375], [932, 430], [1280, 500], [1280, 540]];
const POINTERS = ['fine', 'coarse'] as const;

describe('LR-17: a short landscape screen keeps the launcher\'s layout, for every pointer', () => {
  for (const [w, h] of SHORT) for (const pointer of POINTERS) {
    it(`${w}x${h}, ${pointer} pointer: the rail never shrinks and the list keeps room for two rows`, () => {
      const env: Env = { w, h, pointer, input: 'pointer' };
      const r = room(env);
      expect.soft(decl('.cx-crossbar', 'flex-shrink', env) ?? '1', 'the rail must not shrink to nothing (no rule: the initial 1)').toBe('0');
      expect(r.list, `the list's room at ${w}x${h} (stage ${r.stage.toFixed(1)}px, rail ${r.railTop.toFixed(1)} + ${r.rail.toFixed(1)} + ${r.bodyTop.toFixed(1)})`)
        .toBeGreaterThanOrEqual(2 * r.row);
    });

    it(`${w}x${h}, ${pointer} pointer: the current mark's label and its bar end above the list, inside the strip's clip`, () => {
      const env: Env = { w, h, pointer, input: 'pointer' };
      const r = room(env);
      expect(r.labelBottom, 'the label runs into the list').toBeLessThanOrEqual(r.rail + r.bodyTop);
      // The strip clips 1rem past the rail's bottom (console.css `.cx-crossbar__strip { bottom: -1rem; overflow: clip }`).
      expect(r.labelBottom, 'the strip clips the label').toBeLessThanOrEqual(r.rail + r.px);
    });

    it(`${w}x${h}, ${pointer} pointer: the legend is one line and the stage clips, the list and the panel scroll`, () => {
      for (const input of ['pointer', 'pad'] as const) {
        const env: Env = { w, h, pointer, input };
        expect(decl('.cx-legend', 'flex-wrap', env) ?? 'nowrap', `${input}: the legend wraps`).toBe('nowrap');
        const shown = need('.cx-prompts', 'display', env) !== 'none';
        if (shown) expect(need('.cx-prompts', 'flex-wrap', env), `${input}: the prompts wrap into a second line`).toBe('nowrap');
        // The pad keeps its prompts (part G's phone rule: hidden for a pointer, drawn for the pad); a pointer has its
        // targets on the screen.
        expect(shown, `${input}: the prompts`).toBe(input === 'pad');
      }
      const env: Env = { w, h, pointer, input: 'pointer' };
      expect(need('.cx-stage', 'overflow', env), 'what overflows the stage is drawn over the legend').toBe('hidden');
      // LR-40 (4, the review's finding 2): only under Settings, above the phone rule, the stage clips (`clip`: no scroll
      // container, so a scroll into view never shifts it); every other screen keeps `hidden` (frame.ts scrolls a pad-focused
      // control outside a list into view: the launch check).
      if (w > 760) expect(need('.cx-stage:has(> .cx-screen[data-key="options"])', 'overflow', env)).toBe('clip');
      expect(need('.cx-list', 'overflow-y', env)).toBe('auto');
      expect(need('.cx-readout', 'overflow-y', env)).toBe('auto');
      expect(need('.cx-readout', 'max-height', env)).toBe('100%');
    });
  }

  it("a short landscape screen gets none of the tall screens' composition (the TV rules, the short-desktop band)", () => {
    for (const [w, h] of SHORT) for (const pointer of POINTERS) {
      const env: Env = { w, h, pointer, input: 'pointer' };
      const tall = TIERS.flat().filter((r) => r.media.some((m) => /height\s*>|<=?\s*height|min-height/.test(m)) && applies(r, env));
      expect(tall.map((r) => `${r.media.join(' | ')} ${r.sel[0]}`), `${w}x${h} ${pointer}`).toEqual([]);
    }
  });

  it("every short-height condition cuts at 550px (LR.R19's), bar the short-desktop band's 800px top", () => {
    const cuts = new Set<number>();
    for (const r of TIERS.flat()) for (const m of r.media) {
      for (const x of m.matchAll(/(?:(?:max|min)-height:\s*|height\s*[<>]=?\s*)(\d+)px|(\d+)px\s*<=?\s*height/g)) cuts.add(Number(x[1] ?? x[2]));
    }
    cuts.delete(800);
    expect([...cuts]).toEqual([550]);
  });

  it('the tall screens keep their layout: no rule written for a short screen holds there', () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768], [1366, 768], [390, 844], [360, 640]] as const) {
      for (const pointer of POINTERS) {
        const env: Env = { w, h, pointer, input: 'pointer' };
        const short = TIERS[0]!.filter((r) => r.media.some((m) => /max-height/.test(m)) && r.sel.includes('.cx-crossbar') && applies(r, env));
        expect(short.length, `${w}x${h} ${pointer}`).toBe(0);
      }
    }
  });
});

describe('LR-17: at 844x390 the lists are drawn (Home\'s and Settings\', so the tabs are reached)', () => {
  let page: ConsolePage | null = null;
  const size = { w: window.innerWidth, h: window.innerHeight };
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    mountShell(document);
  });
  afterEach(() => {
    page?.dispose();
    page = null;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    localStorage.clear();
    vi.useRealTimers();
  });
  const titles = (): string[] => [...document.querySelectorAll('#stage .cx-list .cx-item__title')].map((t) => t.textContent ?? '');

  it('the fit is the 0.8 floor and the list is the stage\'s scroll box', () => {
    page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
    expect(parseFloat(document.documentElement.style.fontSize)).toBe(12.8);
    expect(document.querySelector('#stage .cx-home__body > .cx-list[data-scroll]')).not.toBeNull();
  });

  for (const id of ['home', 'options'] as const) {
    it(`${id}: every item of the category is in the list`, () => {
      page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
      const { ctl } = page;
      ctl.S.cat = CATS.findIndex((c) => c.id === id);
      page.render();
      const want = homeItems(id, ctl.S, ctl.A).map((x) => x.title);
      expect(want.length).toBeGreaterThanOrEqual(3);
      expect(titles()).toEqual(want);
      if (id === 'options') expect(want.slice(0, 2)).toEqual(['Game', 'Launcher']);
    });
  }
});
