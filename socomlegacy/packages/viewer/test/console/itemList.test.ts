import { describe, expect, it } from 'vitest';
import { PAGE, PAGE_RULES, value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8, LR.R11): Home's item list in the artifact's drawing (`S2-Launcher-v2.dc.html`,
 * its items: the icon and the title at full size on the focused item and drawn down at rest -- the icon to 0.84, the title
 * to 0.8 from its left edge -- the others at 42%; the title in sentence case at 24 design px; the subtitle in the ink at
 * 62%, still revealed only on hover, focus or the pad's selection (LP.R4); each settles on the artifact's 380ms with its
 * slight overshoot). jsdom has no layout: the rules are the cascade's (`./cascade`). A browser adaptation.
 */
const W = 1280;
const v = (sel: string, prop: string) => value([sel], prop, W);

describe('Home\'s item list, the artifact\'s drawing', () => {
  it('the focused item at full strength; the others at 42%, a hover at 70%', () => {
    expect(v('.cx-home .cx-item', 'opacity')).toBe('0.42');
    expect(v('.cx-home .cx-item.is-focused', 'opacity')).toBe('1');
    expect(v('.cx-home .cx-item:hover', 'opacity')).toBe('0.7');
  });
  it('the focused item draws no box of its own (no veil, no frame, no breathing glow): its size and strength say it', () => {
    expect(v('.cx-home .cx-item.is-focused', 'background')).toBe('none');
    expect(v('.cx-home .cx-item.is-focused', 'box-shadow')).toBe('none');
    expect(v('.cx-app .cx-home .cx-item.is-focused::after', 'content')).toBe('none');
  });
  it('the title in sentence case at 24 design px, drawn to 0.8 from its left at rest and to full size focused', () => {
    expect(v('.cx-home .cx-item__title', 'text-transform')).toBe('none');
    expect(v('.cx-home .cx-item__title', 'font')).toBe('400 calc(1.5rem * var(--cx-text-scale))/1.2 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 1.5rem/1.2 var(--s2u-font-body)')
    expect(v('.cx-home .cx-item__title', 'transform')).toBe('scale(0.8)');
    expect(v('.cx-home .cx-item__title', 'transform-origin')).toBe('left center');
    expect(v('.cx-home .cx-item.is-focused .cx-item__title', 'transform')).toBe('scale(1)');
    expect(v('.cx-home .cx-item.is-focused .cx-item__title', 'font-size')).toBe('calc(1.5rem * var(--cx-text-scale))');   // LR-46: the launcher's type token (was '1.5rem')
  });
  it('the icon drawn to 0.84 at rest, full focused; both settle on the artifact\'s 380ms overshoot', () => {
    expect(v('.cx-home .cx-item__icon', 'transform')).toBe('scale(0.84)');
    expect(v('.cx-home .cx-item.is-focused .cx-item__icon', 'transform')).toBe('scale(1)');
    for (const sel of ['.cx-home .cx-item__icon', '.cx-home .cx-item__title']) expect(v(sel, 'transition'), sel).toBe('transform var(--s2u-dur-lx-item) var(--s2u-ease-lx-pop)');
  });
  it('the subtitle in the ink at 62%, and LP.R4\'s reveal kept: closed at rest, opened by hover, focus or the pad', () => {
    expect(v('.cx-home .cx-item__sub', 'color')).toBe('color-mix(in srgb, var(--s2u-lx-ink) 62%, transparent)');
    expect(v('.cx-item__sub', 'max-height')).toBe('0');
    expect(PAGE).toMatch(/\[data-input="pad"\] \.cx-item\.is-focused \.cx-item__sub \{ max-height: 7rem; opacity: 1;/);
  });
  it('a waiting status still colours the subtitle\'s icon (the status language, LP.R11), and reduced motion stops the settle', () => {
    expect(PAGE).toMatch(/:is\(\.cx-status--ready, \.cx-status--danger, \.cx-status--warning\) \.cx-item__icon,/);
    // an unlayered colour on the icon would beat that layered rule whatever its specificity
    expect(PAGE_RULES.filter((r) => !r.layered && r.sel.some((x) => /\.cx-item__icon$/.test(x)) && /(^|;)\s*color\s*:/.test(r.body))).toEqual([]);
    expect(PAGE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*:root\[data-console\] \.cx-home \.cx-item, :root\[data-console\] \.cx-home \.cx-item__icon, :root\[data-console\] \.cx-home \.cx-item__title \{ transition: none; \}/);
  });
  it('the focused Disc row draws no old box either (F6): its lit veil and gold frame are off, the partition and the pad outline kept', () => {
    expect(v('.cx-home .cx-split.is-lit', 'background')).toBe('none');
    expect(v('.cx-home .cx-split.is-lit::after', 'box-shadow')).toBe('none');
    expect(v('.cx-split.is-lit > .cx-split__rule', 'background')).toBe('var(--s2u-gold)');
    expect(v(':root[data-console][data-input="pad"] .cx-split.is-lit', 'outline')).toBe('var(--s2u-focus-w) solid var(--s2u-focus)');
  });
});
