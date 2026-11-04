// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { ico, P } from '../../src/console/icons';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { UI_SCALES } from '../../src/console/fit';
import { at, must, rem, side, value, type At } from './cascade';
import { mountShell } from './shell';

/**
 * CX-19 (CX.R11, the owner, 2026-10-12: "the disc right aligned option should be a cog, and it should be part of the disc
 * element just partitioned on the right"). CX-16's settings icon beside Home's Disc action becomes a cog (a toothed gear)
 * and a partition of the Disc element itself: one row box -- the action's mark, title, line and state on the left, a
 * divider, the cog on the right -- the row's lit frame (the ActionList README's focused item: `tab-lit`, the 4px gold bar,
 * the 1px gold frame) and the pad's focus ring enclosing both. The row is one pad focus stop; Square opens the source
 * dropdown as CX-16 built it (its tests, `discSource.test.ts`, unchanged), the legend naming it; the cog partition lights
 * while the dropdown is open and has its own hover and pressed states; a click on it opens and closes the dropdown; at
 * phone widths it stays inside the row. The cog's accessible name is CX-16's ("Disc source: ..."; CX.R5, no new words).
 * The design export has no cog mark (its launcher set's `settings` is the sun-like mark of `icons.ts` P.settings) and no
 * split control; both are the page's own, in the design's tokens. A browser adaptation with no original (OT.R28).
 *
 * LR-13 (LR.R17) put the split box on the disc check of Play's "Before you deploy" panel. LR-23 (LR.R22, the owner: "The
 * entire right side overlay for the selected category - gone"; "The bottom row? the new mockup UI"): the panel is gone,
 * and on the launcher page the cog is the legend's, beside the disc chip (`.cx-chipsrc`), the same control (CX-16's
 * handlers, its name, its dropdown, out of the Tab order) -- no split row is drawn on the page any more; the split rules
 * below stand for the overlay's Disc item, which keeps the li. Was: the DOM facts read in the panel (`onDisc`).
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

const boot = (): ConsolePage => (page = bootConsole(document, window, sampleAdapters(), { keymap: true }));
// LR-24 (LR.R23 (b)): the launcher page's Home draws no cog: the bottom row's disc mark is the disc's one control and
// opens CX-16's menu itself (`lr24Home.test.ts`). The cog (`sourceHtml`) stands for the overlay's Disc item. Was (LR-23):
// `.cx-chipsrc` holding `.cx-split__cog` beside the legend's chip.
const box = (): HTMLElement | null => document.querySelector<HTMLElement>('#legend .cx-markbox');
const mark = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('#legend .cx-markbox > .cx-mark[data-mark="disc"]');
const menu = (): HTMLElement | null => document.querySelector<HTMLElement>('#legend .cx-srcmenu');

describe('CX-19 / LR-24: no cog on the page\'s Home; the disc mark opens the source menu', () => {
  it('the DOM: no split row and no cog on the page\'s Home; the mark\'s box holds the mark and, open, its dropdown', () => {
    boot();
    expect(document.querySelectorAll('#stage .cx-split')).toHaveLength(0);           // was: one, the disc check's
    expect(document.querySelector('#legend .cx-srcbtn, #legend .cx-split__cog')).toBeNull();   // was (LR-23): the chip's cog
    expect([...box()!.children]).toEqual([mark()]);
    expect(mark()!.dataset.act).toBe('discmark');
    expect(mark()!.getAttribute('aria-haspopup')).toBe('menu');
    page!.ctl.press('square');
    expect([...box()!.children].map((k) => k.className.split(' ')[0])).toEqual(['cx-mark', 'cx-srcmenu']);
    page!.ctl.press('circle');
    page!.ctl.press('right');                                                         // another category: the mark stays
    expect(mark()).not.toBeNull();
  });

  it('the cog glyph (the overlay\'s Disc item keeps it): an eight-toothed gear with its hub, not the sun-like settings mark', () => {
    const ref = document.createElement('div');
    ref.innerHTML = ico('cog');
    expect(ref.querySelector('svg.cx-ico')).not.toBeNull();                         // was: read off the legend's cog (LR-23)
    expect(P.cog).not.toBe(P.settings);
    // The outline's vertices lie on two circles about the grid's centre -- the teeth's tips and the roots between them --
    // and the tips come in pairs, one pair a tooth.
    const d = /<path d="([^"]+)"/.exec(P.cog)![1]!;
    const pts = [...d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)|A[\d.\s]+?\s([\d.]+)\s+([\d.]+)(?=[A-Za-z]|$)/g)]
      .map((m) => [Number(m[1] ?? m[3]), Number(m[2] ?? m[4])] as const);
    const radii = pts.map(([x, y]) => Math.hypot(x - 12, y - 12));
    const tip = Math.max(...radii);
    const root = Math.min(...radii);
    expect(tip - root).toBeGreaterThan(1.5);                                     // teeth, not rays off a ring
    for (const r of radii) expect(Math.min(Math.abs(r - tip), Math.abs(r - root))).toBeLessThan(0.05);
    expect(radii.filter((r) => Math.abs(r - tip) < 0.05).length / 2).toBe(8);
    expect(tip + 0.8).toBeLessThanOrEqual(12);                                   // inside the 24 grid, the 1.6 stroke included
    expect(P.cog).toMatch(/<circle cx="12" cy="12" r="[\d.]+"\/>/);              // the hub
  });

  it('never a pad focus stop: Up / Down walk Home\'s list, the disc mark never focused (was: the cog; the panel\'s four rows)', () => {
    const p = boot();
    p.ctl.S.input = 'pad';
    document.documentElement.dataset.input = 'pad';
    p.render();
    for (let k = 0; k < 2; k++) {                                                  // Play, Server status (LR-37 (4): no Memory card) (Discord's stop is the header's above the phone rule)
      expect(document.querySelector('#stage .cx-list .is-focused')).not.toBeNull();
      expect(mark()!.classList.contains('is-focused')).toBe(false);
      p.ctl.press('down');
    }
    expect(mark()!.hasAttribute('data-fk')).toBe(false);
  });

  it('the mark lights while the dropdown is open, by Square on Play or by a click on it; a click toggles it (was: the cog)', () => {
    const p = boot();
    expect(mark()!.classList.contains('is-open')).toBe(false);
    p.ctl.press('square');
    expect(menu()).not.toBeNull();
    expect(mark()!.classList.contains('is-open')).toBe(true);
    expect(mark()!.getAttribute('aria-expanded')).toBe('true');
    expect(prompts(p.ctl.S, p.ctl.A).map((x) => [x.k, x.label])).toEqual([['cross', 'Choose'], ['circle', 'Close']]);
    p.ctl.press('square');
    expect(menu()).toBeNull();
    expect(mark()!.classList.contains('is-open')).toBe(false);
    expect(prompts(p.ctl.S, p.ctl.A).map((x) => [x.k, x.label])).toContainEqual(['square', 'Disc source']);
    mark()!.click();
    expect(menu()).not.toBeNull();
    expect(mark()!.classList.contains('is-open')).toBe(true);
    mark()!.click();
    expect(menu()).toBeNull();
    expect(mark()!.classList.contains('is-open')).toBe(false);
    expect(p.ctl.A.disc.source!()).toBe('image');
  });
});

/* ---------- the rules: the row's box draws the lit state and the ring; the partition inside it ---------- */

const PAD = ':root[data-console][data-input="pad"]';

describe('CX-19: the split row\'s rules', () => {
  it('the row box carries the focused item\'s frame (the ActionList README) and the pad ring; the action inside none', () => {
    const w = 1280;
    expect(must(['.cx-split'], 'display', w)).toBe('flex');
    expect(must(['.cx-split'], 'align-items', w)).toBe('stretch');
    expect(must(['.cx-split.is-lit'], 'background', w)).toBe('var(--s2u-tab-lit)');
    // The review of CX-19 (MEDIUM): the frame is drawn by the row's ::after, over its children, not by the li's own
    // inset shadow (painted under the cog's opaque hover and pressed fills); the li keeps only the background.
    expect(value(['.cx-split.is-lit'], 'box-shadow', w)).toBeNull();
    expect(must(['.cx-split.is-lit::after'], 'box-shadow', w)).toBe('inset 4px 0 0 var(--s2u-gold), inset 0 0 0 1px var(--s2u-gold)');
    // The design's own rule for a focused item (components.css), so the frame is the same frame.
    expect(value(['.cx-item.is-focused'], 'box-shadow', w)).toBe('inset 4px 0 0 var(--s2u-gold), inset 0 0 0 1px var(--s2u-gold)');
    expect(must(['.cx-split > .cx-item.is-focused'], 'box-shadow', w)).toBe('none');
    expect(must(['.cx-split > .cx-item.is-focused'], 'background', w)).toBe('none');
    expect(must([`${PAD} .cx-split.is-lit`], 'outline', w)).toBe('var(--s2u-focus-w) solid var(--s2u-focus)');
    expect(must([`${PAD} .cx-split.is-lit`], 'outline-offset', w)).toBe('3px');      // the cx-item ring's offset (components.css)
    expect(must([`${PAD} .cx-split > .cx-item.is-focused`], 'outline', w)).toBe('none');
    expect(must([`${PAD} .cx-split > .cx-item.is-focused:focus`], 'outline', w)).toBe('none');
  });

  it('the lit frame is painted above the cog\'s fills: a positioned ::after over the whole row, the cog unpositioned', () => {
    const w = 1280;
    // The frame's box: the li's ::after, laid over the li's padding box (the li is the containing block), never taking a
    // pointer event, so the cog's hover, press and click are its own.
    expect(must(['.cx-srcrow'], 'position', w)).toBe('relative');
    expect(must(['.cx-split::after'], 'content', w)).toBe("''");
    expect(must(['.cx-split::after'], 'position', w)).toBe('absolute');
    expect(must(['.cx-split::after'], 'inset', w)).toBe('0');
    expect(must(['.cx-split::after'], 'pointer-events', w)).toBe('none');
    // At rest the frame is there but clear, so it fades in over dur-fast as the focused item's own frame does.
    expect(must(['.cx-split::after'], 'box-shadow', w)).toBe('inset 4px 0 0 transparent, inset 0 0 0 1px transparent');
    expect(must(['.cx-split::after'], 'transition', w)).toBe('box-shadow var(--s2u-dur-fast) var(--s2u-ease)');
    // The paint order (CSS 2.1 appendix E): in the stacking context the li sits in -- the li makes none, being
    // positioned without a z-index -- the in-flow, unpositioned cog (an atomic flex item) and its fills are painted
    // before the positioned descendants with z-index auto, of which the ::after is the li's last in tree order. So the
    // frame is above every fill of the cog as long as the cog and its states stay unpositioned, make no stacking context
    // of their own and the frame takes no z-index; the open dropdown (z-index 2) stays above the frame.
    expect(value(['.cx-split::after', '.cx-split.is-lit::after'], 'z-index', w)).toBeNull();
    for (const s of ['.cx-srcbtn', '.cx-srcbtn:hover', '.cx-srcbtn.is-open', '.cx-srcbtn:active', '.cx-split__rule', '.cx-split > .cx-item']) {
      for (const p of ['position', 'z-index', 'transform', 'opacity', 'filter', 'isolation', 'will-change']) {
        expect(value([s], p, w), `${s} ${p}`).toBeNull();
      }
    }
    expect(value(['.cx-split'], 'z-index', w)).toBeNull();
    expect(Number(must(['.cx-srcmenu'], 'z-index', w))).toBeGreaterThan(0);
    boot();
    expect([...box()!.children]).toEqual([mark()]);   // LR-24: the disc mark's box, nothing after it while shut (was LR-23: the legend's cog last)
  });

  it('the cog partition: square (a row, not a pill), its own hover, open and pressed states in the design\'s tokens', () => {
    const w = 1280;
    expect(must(['.cx-srcbtn'], 'border-radius', w)).toBe('0');
    expect(must(['.cx-srcbtn:hover'], 'background', w)).toBe('var(--s2u-surface-hover)');
    expect(must(['.cx-srcbtn.is-open'], 'background', w)).toBe('var(--s2u-surface-active)');
    expect(must(['.cx-srcbtn.is-open'], 'color', w)).toBe('var(--s2u-gold)');
    expect(must(['.cx-srcbtn:active'], 'background', w)).toBe('var(--s2u-highlight-pressed)');
    expect(must(['.cx-split__rule'], 'width', w)).toBe('1px');
  });

  /**
   * The focused title's letters in the page's own label face (`--s2u-font-label`: Oswald, `shared/fonts/
   * oswald-normal-variable-latin.woff2`, the variable font the system ships), in em at the focused title's weight, 600:
   * each glyph's advance in the font's `hmtx` (wght 400, its default) plus its `HVAR` delta at 600 (normalised 0.667,
   * `avar` mapping it to 0.787), over its 1000 units per em; read off the file for this test on 2026-10-12. The state
   * word keeps the file's upper bound (0.93 em a letter) -- READING measures 3.55 em at 600 before its tracking.
   */
  const OSWALD_600_EM: Readonly<Record<string, number>> = { D: 0.5734, I: 0.2897, S: 0.5053, C: 0.5528 };

  /** The Disc row at a viewport: its box and the partition's, in rem from the row's left. */
  const rowAt = (a: At) => {
    const w = a.w;
    const listW = must(['.cx-list'], 'width', w);
    const row = listW === '100%' ? a.bar : rem(listW, a);                        // the phone rule: the stage's width
    const cogW = rem(must(['.cx-srcbtn'], 'width', w), a);
    const ruleW = rem(must(['.cx-split__rule'], 'width', w), a);
    // The action's least width: its padding, its mark, the two gaps and its widest state word ("READING", at 0.93 em a
    // letter, its tracking included); the text column shrinks to nothing (flex: 1, min-width: 0).
    const pad = rem(side(must(['.cx-item'], 'padding', w), 1), a);
    const gap = rem(must(['.cx-item'], 'gap', w), a);
    const mark = rem(must(['.cx-item__icon .cx-ico'], 'width', w), a);
    const word = 'READING'.length * 0.93 * rem(/([\d.]+rem)\//.exec(must(['.cx-item__state'], 'font', w))![1]!, a);
    const action = 2 * pad + mark + 2 * gap + word;
    // The review of CX-19 (its NOTE): the room the action's text column keeps beside the cog, against the focused
    // title's width -- "DISC" at the focused title's size (the cx layer's 1.875rem) in the shipped Oswald at 600, its
    // tracking after each letter (OSWALD_600_EM, below).
    const titleRem = rem(must(['.cx-item.is-focused .cx-item__title'], 'font-size', w), a);
    const track = Number(/^([\d.]+)em$/.exec(must(['.cx-item__title'], 'letter-spacing', w))![1]);
    const title = [...'DISC'].reduce((n, ch) => n + OSWALD_600_EM[ch]! + track, 0) * titleRem;
    return { row, cogW, ruleW, action, text: row - cogW - ruleW - action, title };
  };

  for (const [w, h] of [[1280, 720], [1024, 768], [390, 844]] as const) {
    it(`at ${w}x${h}, every Interface size: the cog partition sits inside the Disc row's box, the row's full height`, () => {
      expect(must(['.cx-split > .cx-item'], 'flex', w)).toBe('1 1 auto');
      expect(must(['.cx-split > .cx-item'], 'min-width', w)).toBe('0');
      expect(must(['.cx-srcbtn'], 'flex', w)).toBe('none');
      expect(must(['.cx-srcbtn'], 'align-self', w)).toBe('stretch');
      expect(value(['.cx-srcbtn'], 'height', w)).toBeNull();                     // stretched to the row, focused or not
      expect(value(['.cx-srcbtn'], 'position', w)).toBeNull();                  // in the row's flow, not laid over it
      expect(value(['.cx-split'], 'padding', w)).toBeNull();
      for (const s of ['.cx-split', '.cx-srcbtn']) expect(value([s], 'display', w) ?? '', `${w}: ${s}`).not.toBe('none');
      for (let ui = 0; ui < UI_SCALES.length; ui++) {
        const a = at(w, h, ui);
        const where = `${w}x${h} ui ${UI_SCALES[ui]}`;
        const r = rowAt(a);
        expect(r.text, `${where}: the text column beside the cog (${r.text.toFixed(2)}rem of a ${r.row.toFixed(2)}rem row) against the focused "DISC" (${r.title.toFixed(2)}rem)`).toBeGreaterThanOrEqual(r.title);
        expect(r.cogW, `${where}: the cog a square at the row's least height`).toBe(rem(must(['.cx-item'], 'min-height', w), a));
      }
    });
  }
});
