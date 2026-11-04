import { describe, expect, it } from 'vitest';
import { PAGE_RULES, value } from './cascade';

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8, LR.R14): the room drawer -- the disc's map picture, the
 * room's name, its facts, its tiles, its Cross line -- inside LR-1's right panel, in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`: a section label the section blue's 11 mono capitals, the values the bright ink, a quiet
 * tile on the ink's 4% with the rows' 4px corners, the primary verb the bright gold) with the artifact's gold
 * (`--s2u-lx-accent`) where the system's gold was; the table's empty and failure line on no box. Its content -- the
 * adapter's facts and tiles, the map picture only from the player's disc -- is unchanged. A browser adaptation.
 */
const W = 1280;
const INK = (n: number): string => `color-mix(in srgb, var(--s2u-lx-ink) ${n}%, transparent)`;

describe('the room drawer in the artifact\'s drawing (LR-3)', () => {
  it('the facts: the label the section blue\'s mono capitals, the value the bright ink', () => {
    expect(value(['.cx-facts dt'], 'font', W)).toBe('400 calc(0.6875rem * var(--cx-text-scale))/1.6 var(--s2u-font-mono)');   // LR-46: the launcher's type token (was '400 0.6875rem/1.6 var(--s2u-font-mono)')
    expect(value(['.cx-facts dt'], 'color', W)).toBe('var(--s2u-lx-section)');
    expect(value(['.cx-facts dd'], 'color', W)).toBe('var(--s2u-lx-ink-hi)');
  });

  it('a tile: the ink\'s 4% on the rows\' corners, no edge; its name in the new gold, its figure the bright ink', () => {
    expect(value(['.cx-side'], 'background', W)).toBe(INK(4));
    expect(value(['.cx-side'], 'box-shadow', W)).toBe('none');
    expect(value(['.cx-side'], 'border-radius', W)).toBe('var(--s2u-radius-lx-row)');
    expect(value(['.cx-side__name'], 'color', W)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-side__n'], 'color', W)).toBe('var(--s2u-lx-ink-hi)');
  });

  it('the Cross line the primary verb\'s bright gold; the room\'s name the bright ink', () => {
    expect(value(['.cx-drawer__cta'], 'color', W)).toBe('var(--s2u-lx-accent-hi)');
    expect(value(['.cx-drawer__name'], 'color', W)).toBe('var(--s2u-lx-ink-hi)');
  });

  it('the table\'s empty, reading and failure line sits on no box', () => {
    expect(value(['.cx-empty'], 'background', W)).toBe('transparent');
  });

  it('no drawer rule of the page draws the old gold', () => {
    const mine = PAGE_RULES.filter((r) => !r.layered && r.sel.some((s) => /\.cx-(side|facts|drawer|empty)\b/.test(s)));
    expect(mine.filter((r) => /--s2u-gold/.test(r.body)).map((r) => r.sel.join(', '))).toEqual([]);
  });
});
