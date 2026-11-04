// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { rootFontPx } from '../../src/console/fit';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, type Adapters } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import { declsOf as decls, fontSizeOf, rem, ruleApplies as applies, side, TIERS, words, type At, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-19 (the LR.R11 side-by-side review's P3, P5 and P14's legend, `agent-mail/evidence/review-lr-7-side-by-side.md`;
 * its pass 2's Q1-Q3, `review-lr-7-side-by-side-2.md`; the LR-7 matrix's shots):
 * - P3: at 1024x768 the legend wrapped to two lines ("L1 R1 Category" under the hints) and the disc chip's words to three
 *   ("Disc ready / Change / disc"): part G's prompts wrap (`.cx-prompts { flex-wrap: wrap }`) and the cluster shrank.
 * - Q1: wherever the prompts were drawn in the short landscape layout the page laid out wider than the window (the
 *   account pill and START's end off-screen): the frame's one column is part G's implicit `auto` track, which grows to
 *   the legend's min-content -- every prompt's width, whatever clips them inside the legend.
 * - Q2: at 640x360 the legend's status was a bare icon (the phone rule hides the chip's words) and the panel's Disc check
 *   wrapped its label under its "Change disc" chip.
 * - P5: at 390x844 with the pad's prompts drawn the legend's line cut Home's panel (PLAYERS / ROOMS lost): the prompts'
 *   row took 2.75rem and part G's 2rem gap as its row gap, so the stage lost 53px.
 * - P14: whether the prompts show depends on the last input: the rule (LR.R19) pinned on Home, Online and Profile.
 *
 * jsdom has no layout, so the rules are read as `./lr17Landscape.test.ts` reads them (`./cascade`'s tiers, a height-,
 * pointer- and input-aware media reading). A browser adaptation: the launcher's layout, nothing of the game.
 */

interface Env { w: number; h: number; pointer: 'fine' | 'coarse'; input: 'pointer' | 'pad' }

function part(prop: string, name: string, v: string): string | null {
  if (name === prop) return v;
  const box = /^(margin|padding)-(top|right|bottom|left)$/.exec(prop);
  if (box && name === box[1]) return side(v, (['top', 'right', 'bottom', 'left'] as const).indexOf(box[2] as 'top') as 0 | 1 | 2 | 3);
  if ((prop === 'row-gap' || prop === 'column-gap') && name === 'gap') { const w = words(v); return prop === 'row-gap' ? w[0]! : (w[1] ?? w[0]!); }
  if (prop === 'flex-shrink' && name === 'flex') {
    const w = words(v);
    return v === 'none' ? '0' : v === 'auto' ? '1' : w.length >= 2 && !/[a-z%]/.test(w[1]!) ? w[1]! : '1';
  }
  return null;
}
/**
 * `prop` on the element `sels` names (most specific first) at `env`: the strongest tier first; within a tier and a
 * selector the pad's mark (the more specific) over the plain rule, then the later rule.
 */
function decl(sels: string[], prop: string, env: Env, tiers: Rule[][] = TIERS): string | null {
  for (const tier of tiers) {
    for (const sel of sels) {
      // The page's rules write the pad's mark under the page's (`:root[data-console][data-input="pad"]`), the cx layer's
      // bare (part G: `:root[data-input="pad"] .cx-prompts`).
      const pads = [`:root[data-console][data-input="pad"] ${sel}`, `:root[data-input="pad"] ${sel}`];
      let plain: string | null = null;
      let padded: string | null = null;
      for (const r of tier) {
        if (!applies(r, env)) continue;
        const isPlain = r.sel.includes(sel);
        const isPad = env.input === 'pad' && pads.some((p) => r.sel.includes(p));
        if (!isPlain && !isPad) continue;
        for (const [n, v] of decls(r.body)) {
          const p = part(prop, n, v);
          if (p == null) continue;
          if (isPad) padded = p; else plain = p;
        }
      }
      if (padded ?? plain) return padded ?? plain;
    }
  }
  return null;
}
const need = (sels: string[], prop: string, env: Env): string => {
  const v = decl(sels, prop, env);
  if (v == null) throw new Error(`no ${prop} for ${sels.join(' / ')} at ${env.w}x${env.h}`);
  return v;
};

const PROMPTS = ['.cx-legend .cx-prompts', '.cx-prompts'];
const ITEM = ['.cx-legend .cx-prompts > li'];
const LAST = ['.cx-legend .cx-prompts > li:last-child'];
const LABEL = ['.cx-legend .cx-prompt > .cx-label'];
const CLUSTER = ['.cx-legend .cx-cluster', '.cx-cluster'];
const CHIP_TEXT = ['.cx-legend .cx-chip__text', '.cx-chip__text'];
const CHIP_WORD = ['.cx-legend .cx-chip__word', '.cx-chip__word'];
const CHIP_SUB = ['.cx-legend .cx-chip__sub', '.cx-chip__sub'];

/** The phone's portrait layout (part G's 760px rule, not the short landscape one): the cluster has its own line. */
const portraitPhone = (e: Env): boolean => e.w <= 760 && !(e.h <= 550 && e.w > e.h);

/** The matrix's sizes (LR.R12) and the short landscapes of LR-17. */
const SIZES: readonly (readonly [number, number])[] = [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [844, 390], [640, 360], [812, 375], [390, 844], [360, 640]];
const INPUTS = ['pointer', 'pad'] as const;

describe('LR-19 (a), P3: the legend is one line and the status never breaks', () => {
  for (const [w, h] of SIZES) for (const input of INPUTS) {
    const env: Env = { w, h, pointer: 'fine', input };
    it(`${w}x${h}, ${input}: the prompts keep one line, the lowest ones giving way, the cluster whole`, () => {
      if (!portraitPhone(env)) expect.soft(decl(['.cx-legend'], 'flex-wrap', env) ?? 'nowrap', 'the legend wraps to a second line').toBe('nowrap');
      const shown = need(PROMPTS, 'display', env) !== 'none';
      if (shown) {
        expect.soft(need(PROMPTS, 'flex-wrap', env), 'the prompts wrap').toBe('nowrap');
        expect.soft(decl(PROMPTS, 'min-width', env), 'the prompts\' box keeps their whole width (it never gives way)').toBe('0');
        expect.soft(decl(PROMPTS, 'overflow', env), 'the prompts are not clipped inside their box').toBe('hidden');
        expect.soft(decl(PROMPTS, 'flex-shrink', env) ?? '1').toBe('1');
        // The lowest prompt (the last: Cross, Circle, the screen's own, then the shoulders) gives way first: its word
        // ellipsized, the others whole; past it the box fades at its end (Q3), over a padding as long as the fade.
        expect.soft(decl(ITEM, 'flex-shrink', env), 'a prompt shrinks before the last has given way').toBe('0');
        expect.soft(decl(LAST, 'flex-shrink', env), 'the last prompt does not give way').toBe('1');
        expect.soft(decl(LAST, 'min-width', env)).toBe('0');
        expect.soft(decl(LABEL, 'white-space', env), 'a prompt\'s words wrap').toBe('nowrap');
        expect.soft(decl(LABEL, 'text-overflow', env)).toBe('ellipsis');
        expect.soft(decl(LABEL, 'overflow', env)).toBe('hidden');
        expect.soft(decl(LABEL, 'min-width', env)).toBe('0');
        const mask = decl(PROMPTS, 'mask-image', env) ?? '';
        expect.soft(mask, 'the prompts\' box has no fade at its end').toMatch(/^linear-gradient\(to left, transparent( 0)?, #000 ([\d.]+rem)\)$/);
        const fade = /#000 ([\d.]+rem)\)$/.exec(mask)?.[1];
        expect.soft(decl(PROMPTS, 'padding-right', env), 'the fade lies over the prompts when they fit').toBe(fade ?? 'a padding as long as the fade');
      }
      expect.soft(decl(CLUSTER, 'flex-shrink', env) ?? '1', 'the cluster gives way under the prompts').toBe('0');
      // The disc chip: never broken inside: its word (and above the phone its line) one line each; never a bare icon on
      // a short landscape screen (Q2). The portrait phone keeps its icon, its words in its label (the launcher's e2e pin,
      // `e2e/launcherPolish.spec.ts`, "the chip's words hidden" at 412x915; the cluster's own line has no room for them).
      if (!portraitPhone(env)) expect.soft(need(CHIP_TEXT, 'display', env), 'the status is a bare icon').not.toBe('none');
      // At the phone rule the page's own `s2u.components` rule hides the chip's words (`.cx-chip__text { display: none }`,
      // the bare icon of the shots); it shares part G's layer and outranks it there, which `./cascade` (the page's layered
      // rules below part G) does not model -- so the words are read from the page's unlayered rules, which beat both.
      if (w <= 760 && !portraitPhone(env)) expect.soft(decl(CHIP_TEXT, 'display', env, [TIERS[0]!]), 'the status is a bare icon at 640x360').toBe('flex');
      expect.soft(decl(CHIP_TEXT, 'min-width', env)).toBe('0');
      expect.soft(decl(CHIP_WORD, 'white-space', env), 'the status\' word breaks').toBe('nowrap');
      expect.soft(decl(CHIP_WORD, 'text-overflow', env)).toBe('ellipsis');
      if (w <= 760 && !portraitPhone(env)) expect.soft(decl(CHIP_SUB, 'display', env), 'at the phone rule the chip drops its line, keeping its word').toBe('none');
      else expect.soft(decl(CHIP_SUB, 'white-space', env), 'the status\' line breaks ("Change / disc")').toBe('nowrap');
    });
  }
});

describe('LR-19 (a), Q1: the legend never lays the page out wider than the window', () => {
  for (const [w, h] of SIZES) for (const input of INPUTS) {
    const env: Env = { w, h, pointer: 'fine', input };
    it(`${w}x${h}, ${input}: the frame's column is the window's, whatever the prompts`, () => {
      const px = rootFontPx(w, h, 0);
      const a: At = { w, h, ui: 0, px, bar: 0 };
      const len = (v: string): number => rem(v, a) * px;
      // The frame's one column: part G names none, so it is the implicit `auto` track, which grows to its items'
      // min-content -- the legend's is every prompt and the cluster laid end to end, whatever clips them (Infinity here:
      // nothing in the rules bounds it).
      const cols = decl(['.cx-app'], 'grid-template-columns', env) ?? 'auto';
      const pad = len(need(['.cx-app'], 'padding-left', env)) + len(need(['.cx-app'], 'padding-right', env));
      const column = cols === 'minmax(0, 1fr)' ? w - pad : Number.POSITIVE_INFINITY;
      expect(column, `the frame's column at ${w}x${h} (${cols})`).toBeLessThanOrEqual(w);
      // The legend gives way inside that column (a grid item's automatic least width is its min-content).
      expect(decl(['.cx-legend'], 'min-width', env), 'the legend widens its column').toBe('0');
    });
  }
});

describe('LR-19 (a), Q2: the panel\'s checks at 640x360', () => {
  for (const pointer of ['fine', 'coarse'] as const) {
    it(`${pointer} pointer: the label one line, the row's chip dropped where the panel has no room for it`, () => {
      const env: Env = { w: 640, h: 360, pointer, input: 'pointer' };
      expect.soft(decl(['.cx-home .cx-readout .cx-r__label'], 'white-space', env), 'the check\'s label wraps under its chip').toBe('nowrap');
      expect.soft(decl(['.cx-home .cx-readout .cx-r__label'], 'text-overflow', env)).toBe('ellipsis');
      expect.soft(decl(['.cx-home .cx-readout .cx-r__label'], 'overflow', env)).toBe('hidden');
      // The panel is 34% of 616px (LR-17): 185px inside its padding, less the cog, the ring and the row's padding and
      // gaps, leaves the chip ("Change disc", 84px) and the label -3px. The row is the chip's button: nothing is lost.
      expect.soft(decl(['.cx-home .cx-readout .cx-r__chip'], 'display', env), 'the chip squeezes the label to nothing').toBe('none');
      // LR-20's fold (4) (the box at 8b88093ca): at 844x390 too the chip left the disc check's words about 42px, its line
      // clamped mid-way, so the chip goes on every short landscape screen (`lr20Detail.test.ts`, the fold's room).
      expect.soft(decl(['.cx-home .cx-readout .cx-r__chip'], 'display', { w: 844, h: 390, pointer, input: 'pointer' })).toBe('none');
    });
  }
});

/**
 * The bottom of Home's content at 390x844 (the stage scrolled to its top), measured on the box's shots of the LR-7 matrix
 * (`agent-mail/evidence/lr-7-matrix/390x844/`, at 0257c5e26): home.png (a pointer: Play not lit) the panel's box from y 408
 * to 737; signed-out.png (the pad: Play focused, its sub-line drawn) from 421 to 750 -- the taller, so the bound. jsdom
 * cannot lay the panel's text out; the box re-measures it (the plan's LR-19 Log entry).
 */
const HOME_CONTENT_BOTTOM_390 = 750;
/** The least room between the panel's bottom and the legend's line, px. */
const CLEAR = 4;

describe('LR-19 (b), P5: at 390x844 the legend\'s line never cuts Home\'s panel', () => {
  for (const input of INPUTS) {
    it(`${input}: the legend's top is below the panel's bottom`, () => {
      const env: Env = { w: 390, h: 844, pointer: 'fine', input };
      const px = rootFontPx(390, 844, 0);
      const a: At = { w: 390, h: 844, ui: 0, px, bar: 0 };
      const len = (v: string): number => rem(v, a) * px;
      // The legend at the phone rule: its padding, the prompts' line (the pad's) and its row gap, the cluster's line (START's
      // least height over the chip's). Before the fix this gave 765 (a pointer) and 712 (the pad), the shots' lines.
      const shown = need(PROMPTS, 'display', env) !== 'none';
      const prompts = shown ? len(need(['.cx-legend .cx-prompt', '.cx-prompt'], 'min-height', env)) + len(need(['.cx-legend'], 'row-gap', env)) : 0;
      const cluster = Math.max(len(need(['.cx-start'], 'min-height', env)), len(need(['.cx-chip'], 'min-height', env)));
      const legend = len(need(['.cx-legend'], 'padding-top', env)) + prompts + cluster;
      const top = 844 - len(need(['.cx-app'], 'padding-bottom', env)) - legend;
      expect(top, `the legend's top (${input}: padding ${need(['.cx-legend'], 'padding-top', env)}, prompts ${prompts.toFixed(1)}px)`)
        .toBeGreaterThanOrEqual(HOME_CONTENT_BOTTOM_390 + CLEAR);
      // The prompts keep one line there too (the cluster is the second): a fifth prompt never makes a third.
      if (shown) expect(need(PROMPTS, 'flex-wrap', env)).toBe('nowrap');
    });
  }
});

describe('LR-19 (c), P14 / LR.R19: the legend\'s presence is the input\'s, the same on every screen', () => {
  let page: ConsolePage | null = null;
  const size = { w: window.innerWidth, h: window.innerHeight };
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
  afterEach(() => {
    page?.dispose();
    page = null;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
    localStorage.clear();
    vi.useRealTimers();
  });
  const at = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  };

  for (const [w, h] of [[390, 844], [1280, 720], [844, 390]] as const) {
    it(`${w}x${h}: Home, Online and Profile draw the same bar; the prompts shown for the pad and, above the phone layouts, for a pointer`, () => {
      at(w, h);
      page = bootConsole(document, window, sampleAdapters() as Adapters, { keymap: true });
      const { ctl } = page;
      const phone = w <= 760 || (h <= 550 && w > h);
      const seen: string[] = [];
      for (const id of ['home', 'online', 'profile'] as const) {
        for (const input of INPUTS) {
          ctl.S.cat = CATS.findIndex((c) => c.id === id);
          ctl.S.input = input;
          page.render();
          const legend = document.getElementById('legend')!;
          expect(document.documentElement.dataset.input, `${id} ${input}: the page's mark`).toBe(input);
          // The bar is drawn on every screen for every input: the status and the disc chip (CX-9a's cluster). LR-23 (LR.R22,
          // "Start game, gone"): Home's categories draw no START pill (was: START here too); the other screens keep it.
          // LR-24: Home's status is the bottom row's marks (was: the disc chip, `.cx-cluster .cx-chip`).
          expect(legend.querySelector('.cx-cluster .cx-marks'), `${id} ${input}: the status`).not.toBeNull();
          expect(legend.querySelector('.cx-cluster .cx-start'), `${id} ${input}: no START on Home`).toBeNull();
          // The prompts are in the DOM on every screen (their display is the rules'): never dropped by a screen.
          expect(legend.querySelectorAll('.cx-prompts > li').length, `${id} ${input}: the prompts`).toBeGreaterThan(0);
          const env: Env = { w, h, pointer: 'fine', input };
          const shown = need(PROMPTS, 'display', env) !== 'none';
          expect(shown, `${id} ${input}: the prompts at ${w}x${h}`).toBe(input === 'pad' || !phone);
          seen.push(`${input}:${legend.className.replace(/\s*is-ready/, '')}:${shown}`);
        }
      }
      // The same bar on the three screens, input for input.
      expect(new Set(seen.filter((x) => x.startsWith('pad'))).size).toBe(1);
      expect(new Set(seen.filter((x) => x.startsWith('pointer'))).size).toBe(1);
    });
  }
});

/**
 * LR-19's fold (the coordinator, from the box's run at 8b88093ca: `agent-mail/evidence/lr-7-matrix/lr-20/1280x720/`, every
 * prompt ellipsized -- "Dep...", "B...", "L1 R1 M...", "Acco..." -- with the row's room to spare). The cause, read from the
 * rules: a prompt (part G `.cx-prompt`) keeps its pill's 0.375rem negative left margin, so its list item -- sized to the
 * prompt's margin box -- is 0.375rem narrower than the prompt's border box, and LR-19's `max-width: 100%` (of that item)
 * took those 0.375rem off every prompt, its word ellipsized. The cap gives the margin back (`calc(100% + 0.375rem)`): a
 * prompt is never narrower than its own width, and only a list item that shrinks (the last, when the row overflows)
 * narrows its prompt. jsdom has no layout: the row's room is modelled from the rules, the words' widths bounded (a body
 * face's advance between 0.45em and 0.62em a character). A browser adaptation: the launcher's legend.
 */
describe('LR-19 fold, the box at 8b88093ca: a prompt\'s word is whole until the row overflows', () => {
  for (const [w, h] of SIZES) for (const input of INPUTS) {
    it(`${w}x${h}, ${input}: a prompt's cap holds its own width (its negative margin given back)`, () => {
      const env: Env = { w, h, pointer: 'fine', input };
      if (need(PROMPTS, 'display', env) === 'none') return;
      const margin = need(['.cx-legend .cx-prompt', '.cx-prompt'], 'margin-left', env);
      expect(margin).toMatch(/^-[\d.]+rem$/);
      expect(decl(['.cx-legend .cx-prompt'], 'max-width', env)).toBe(`calc(100% + ${margin.slice(1)})`);
    });
  }

  /**
   * Home with the disc out (LR-23: Play's Cross "Play: disc needed", L1 R1 Menu, Account, Disc source -- Home's longest line
   * now; was LR-13's panel open on Deploy: Deploy, Back, L1 R1 Menu, Account): the bar's room -- the chip, its cog, the
   * devices and no START (LR.R22) -- and the prompts' width.
   */
  function row(w: number, h: number, advance: number): { room: number; need: number; lastAlone: number } {
    const env: Env = { w, h, pointer: 'fine', input: 'pad' };
    const px = rootFontPx(w, h, 0);
    const a: At = { w, h, ui: 0, px, bar: 0 };
    const len = (v: string): number => rem(v, a) * px;
    const A = sampleAdapters();
    const S = createState(A);
    A.disc.state = () => 'empty';                                     // Play's Cross names the disc it needs
    const said = prompts(S, A);
    expect(said.length, said.map((p) => p.label).join(', ')).toBe(4);
    const bar = w - len(need(['.cx-app'], 'padding-left', env)) - len(need(['.cx-app'], 'padding-right', env));
    const gap = len(decl(['.cx-legend'], 'column-gap', env) ?? need(['.cx-legend'], 'gap', env));
    // LR-24 (LR.R23 (b)): Home's bar is the mockup's three round marks and the prompts (the cluster `display: contents`).
    // Was (LR-23): the chip with its words, the cog, the two device marks and the prompts; (LR-21, P13) START too.
    const word = (s: string, font: string): number => s.length * advance * len(fontSizeOf(font)!);   // LR-46: a calc() size (was a bare rem)
    const marks = 3 * len(need(['.cx-legend .cx-mark'], 'width', env)) + 2 * len(need(['.cx-legend .cx-marks'], 'gap', env));
    const room = bar - marks - gap;
    const font = need(['.cx-legend .cx-prompt'], 'font', env);
    const pill = len(side(need(['.cx-prompt'], 'padding', env), 1)) + len(side(need(['.cx-prompt'], 'padding', env), 3)) + len(need(['.cx-legend .cx-prompt'], 'gap', env));
    const glyph = (k: string): number => (/^(cross|circle|square|triangle)$/.test(k) ? len(need(['.cx-btn'], 'width', env))
      : /^dpad/.test(k) ? len(need(['.cx-dpad'], 'width', env))
      : k.split(' ').length * len(need(['.cx-shoulder'], 'min-width', env)) + (k.split(' ').length - 1) * len(need(['.cx-shoulders'], 'gap', env)));
    const each = said.map((p) => pill + glyph(p.k) + word(p.label, font));
    const box = len(need(PROMPTS, 'padding-left', env)) + len(need(PROMPTS, 'padding-right', env));
    const need_ = each.reduce((s, x) => s + x, 0) + (said.length - 1) * len(need(['.cx-legend .cx-prompts'], 'gap', env)) + box;
    return { room, need: need_, lastAlone: each[each.length - 1]! };
  }

  it('1280x720: four prompts fit whole, with the widest face the room holds them', () => {
    const r = row(1280, 720, 0.62);
    expect(r.need, `the prompts ${r.need.toFixed(0)}px in a room of ${r.room.toFixed(0)}px`).toBeLessThanOrEqual(r.room);
  });
  it('1024x768: with the widest face the prompts before the last fit whole; past the room only the last gives way (the others never shrink)', () => {
    // LR-23: Home's bar lost START, so the row may fit at 1024 now (was: it overflowed even with the narrowest face).
    const r = row(1024, 768, 0.62);
    expect(r.need - r.lastAlone, `the prompts before the last ${(r.need - r.lastAlone).toFixed(0)}px in a room of ${r.room.toFixed(0)}px`).toBeLessThanOrEqual(r.room);
    const env: Env = { w: 1024, h: 768, pointer: 'fine', input: 'pad' };
    expect(decl(ITEM, 'flex-shrink', env)).toBe('0');
    expect(decl(LAST, 'flex-shrink', env)).toBe('1');
  });
});
