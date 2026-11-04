import { describe, expect, it } from 'vitest';
import { PAGE_RULES, value } from './cascade';

/**
 * LR-2 (the launcher redesign plan, the row "Home"; LR.R14, the owner, 2026-10-26: "new gold"): Home's drawing in the
 * artifact's tokens (`S2-Launcher-v2.dc.html`). jsdom has no layout: the rules are the cascade's (`./cascade`). A browser
 * adaptation.
 */
const W = 1280;
const v = (sel: string, prop: string) => value([sel], prop, W);

describe('LR.R14: Home and START draw the artifact\'s one gold', () => {
  it('on :root[data-console] the design system\'s gold names the artifact\'s (#f2b43a and its bright #ffd27a), once for every screen', () => {
    // Every console screen (the back chevron, the remap pad, the dialog focus) draws `--s2u-gold` / `--s2u-gold-display`
    // (the cx layer, part G, held by hash, and the page's CX-19 rules): re-pointed once on the console root (review-lr-2 F1).
    expect(v(':root[data-console]', '--s2u-gold')).toBe('var(--s2u-lx-accent)');
    expect(v(':root[data-console]', '--s2u-gold-display')).toBe('var(--s2u-lx-accent-hi)');
    for (const sel of ['.cx-home', '.cx-legend']) expect(v(sel, '--s2u-gold'), sel).toBeNull();
  });
  it('the repoint never reaches a page without data-console (shared/ds project pages)', () => {
    const carrying = PAGE_RULES.filter((r) => /--s2u-gold(-display)?\s*:/.test(r.body) && !r.layered);
    expect(carrying.length).toBeGreaterThan(0);
    for (const r of carrying) expect(r.sel, r.sel.join()).toEqual([':root[data-console]']);
  });
  it('START\'s glow is the artifact\'s gold too (the cx layer draws it in the system\'s gold as a literal; START stays off Home, LR-23)', () => {
    expect(v('.cx-legend .cx-start.is-ready', 'box-shadow')).toBe('0 0 1.5rem color-mix(in srgb, var(--s2u-lx-accent) 33%, transparent)');
    expect(v('.cx-legend .cx-start.is-arming', 'box-shadow')).toBe('0 0 3rem color-mix(in srgb, var(--s2u-lx-accent) 70%, transparent)');
  });
});

describe('the Before you deploy panel\'s drawing (gone: LR-23)', () => {
  // LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone"): the panel and its rules
  // went (render/home.ts draws no readout on the page's Home; the overlay's readout over a game never drew these rows).
  // Was: the head's mono gold crumb and 22px title, the compact check rows (40px ring), the one-line hints and Deploy's
  // wrapping hint, each pinned here.
  it('no rule draws the panel\'s head, check list, rows or Deploy any more', () => {
    for (const sel of ['.cx-home .cx-readout .cx-crumb', '.cx-home .cx-readout .cx-screenhead .cx-title', '.cx-home .cx-readout .cx-checklist',
      '.cx-home .cx-readout .cx-r', '.cx-home .cx-readout .cx-r__ring', '.cx-home .cx-readout .cx-r__hint', '.cx-home .cx-readout [data-id="deploy"] .cx-r__hint']) {
      expect(PAGE_RULES.filter((r) => r.sel.includes(sel)), sel).toEqual([]);
    }
  });
  it('no unlayered colour on the status icons (the status language, LP.R11)', () => {
    expect(PAGE_RULES.filter((r) => !r.layered && r.sel.some((x) => /\.cx-item__icon$/.test(x)) && /(^|;)\s*color\s*:/.test(r.body))).toEqual([]);
  });
});
