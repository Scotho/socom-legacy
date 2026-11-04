import { describe, expect, it } from 'vitest';
import { PAGE_RULES, value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the information panels (Home's readout, a screen's aside, a room's drawer) as
 * the artifact's right panel (`S2-Launcher-v2.dc.html`: `linear-gradient(90deg, rgba(2,8,14,.45), rgba(2,6,10,.92) 30%)`,
 * `backdrop-filter: blur(18px)`, a 1px `rgba(60,160,220,.14)` left edge), in the --s2u-lx tokens. Their content stays the
 * launcher's. A browser adaptation.
 */
const W = 1280;
const PANELS = ['.cx-readout', '.cx-aside', '.cx-drawer'];

describe('the information panels', () => {
  it('the artifact\'s veil across the first 30%, the 18px blur, the 1px blue left edge, square, no lift', () => {
    for (const p of PANELS) {
      expect(value([p], 'background', W), p).toBe('linear-gradient(90deg, var(--s2u-lx-panel-from), var(--s2u-lx-panel) 30%)');
      expect(value([p], 'backdrop-filter', W), p).toBe('blur(18px)');
      expect(value([p], 'border-left', W), p).toBe('1px solid var(--s2u-lx-edge)');
      expect(value([p], 'border-radius', W), p).toBe('0');
      expect(value([p], 'box-shadow', W), p).toBe('none');
    }
    // Home's own lighter panel (the polish pass) takes the same veil, so the sheets read through it alike
    expect(value(['.cx-home .cx-readout'], 'background', W)).toBe('linear-gradient(90deg, var(--s2u-lx-panel-from), var(--s2u-lx-panel) 30%)');
  });
  it('the head in the ink at 22 design px; a section head the section blue\'s mono capitals; the lines the ink at 75%', () => {
    expect(value(['.cx-aside .cx-readout__head'], 'font', W)).toBe('400 calc(1.375rem * var(--cx-text-scale))/1.2 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 1.375rem/1.2 var(--s2u-font-body)')
    expect(value(['.cx-readout .cx-readout__head--section'], 'color', W)).toBe('var(--s2u-lx-section)');
    expect(value(['.cx-readout .cx-readout__head--section'], 'text-transform', W)).toBe('uppercase');
    expect(value(['.cx-readout__line'], 'color', W)).toBe('color-mix(in srgb, var(--s2u-lx-ink) 75%, transparent)');
  });
  it('the readout\'s status icons keep the status language (no unlayered colour on them)', () => {
    expect(PAGE_RULES.filter((r) => !r.layered && r.sel.some((x) => /\.cx-check > \.cx-ico$|\.cx-check \.cx-ico$/.test(x)) && /(^|;)\s*color\s*:/.test(r.body))).toEqual([]);
  });
});
