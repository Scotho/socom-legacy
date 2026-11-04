import { describe, expect, it } from 'vitest';
import { ico, P } from '../../src/console/icons';

/**
 * LR-1 (the launcher redesign plan, LR.R9: the icons are the launcher's own set, extended in the same stroke for the
 * glyphs it lacks, never fetched): the artifact's Material Symbols that the launcher's set had no mark for -- `palette`
 * (Appearance's themes, LR-5), `play_arrow` (Home's Play, LR-2) and `tune` (Controller settings, LR-2) -- drawn on the
 * set's 24-unit grid as outline strokes like every other mark. A browser adaptation.
 */
const numbers = (d: string): number[] => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('the launcher\'s marks, extended for the redesign', () => {
  it.each(['palette', 'play', 'tune'] as const)('%s is in the set, drawn on the 24-unit grid with no fill of its own', (n) => {
    const svg = P[n];
    expect(svg).toBeTruthy();
    expect(svg).not.toMatch(/fill=|stroke=|style=|<image|href/);
    for (const v of numbers(svg.replace(/r="[^"]*"/g, ''))) {
      expect(v, `${n}: ${v}`).toBeGreaterThanOrEqual(-24);
      expect(v, `${n}: ${v}`).toBeLessThanOrEqual(24);
    }
    expect(ico(n)).toBe(`<svg class="cx-ico " viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`);
  });
  it('the set still has every earlier mark', () => {
    for (const n of ['home', 'globe', 'user', 'cog', 'disc', 'pad', 'mic', 'card', 'check', 'alert', 'left', 'right'] as const) expect(P[n]).toBeTruthy();
  });
});
