// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { roomsHtml } from '../../src/console/render/rooms';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState } from '../../src/console/state';
import { PAGE_RULES, value } from './cascade';

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8, LR.R14): Browse rooms in the artifact's row and panel drawing
 * (`S2-Launcher-v2.dc.html`, its `rooms` panel: rows on no box, the ink's 4% under the pointer, 6% and the 1px ink ring
 * at 22% on the focus, 4px corners; the section head in the section blue's mono capitals) with the artifact's gold
 * (`--s2u-lx-accent`, #f2b43a) for the filter picked and the launch target's mark, and the panel head's description. The
 * table, its columns, the L2 / R2 filters, the search chip, the drawer, the launch-target pick and the 0-3 ping band (its
 * bars and its word, never milliseconds) stay the launcher's; nothing of the artifact's sample rooms is drawn. The
 * lobby screens' row lists fill the panel beside their aside. A browser adaptation.
 */
const W = 1280;
const INK = (n: number): string => `color-mix(in srgb, var(--s2u-lx-ink) ${n}%, transparent)`;

describe('Browse rooms in the artifact\'s drawing (LR-3)', () => {
  it('a room row is the artifact\'s row: no box, 4px corners, the ink; the pointer\'s 4% and the focus\'s 6% with its ring', () => {
    expect(value(['.cx-room'], 'background', W)).toBe('transparent');
    expect(value(['.cx-room'], 'box-shadow', W)).toBe('none');
    expect(value(['.cx-room'], 'border-radius', W)).toBe('var(--s2u-radius-lx-row)');
    expect(value(['.cx-room'], 'color', W)).toBe('var(--s2u-lx-ink)');
    expect(value(['.cx-room:hover'], 'background', W)).toBe(INK(4));
    expect(value(['.cx-room.is-focused'], 'background', W)).toBe(INK(6));
    expect(value(['.cx-room.is-focused'], 'box-shadow', W)).toBe(`inset 0 0 0 1px ${INK(22)}`);
  });

  it('the new gold: the filter picked and the launch target\'s mark; the target row a gold wash', () => {
    expect(value(['.cx-filter[aria-pressed="true"]'], 'background', W)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-filter[aria-pressed="true"]'], 'color', W)).toBe('var(--s2u-lx-on-accent)');
    expect(value(['.cx-room.is-selected .cx-room__name::after'], 'background', W)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-room.is-selected'], 'background', W)).toBe('color-mix(in srgb, var(--s2u-lx-accent) 10%, transparent)');
  });

  it('the column head the section blue\'s mono capitals; the ping band in the artifact\'s tones; the foot the ink at 62%', () => {
    expect(value(['.cx-rooms__head'], 'color', W)).toBe('var(--s2u-lx-section)');
    expect(value(['.cx-rooms__head'], 'font', W)).toBe('400 calc(0.6875rem * var(--cx-text-scale))/1.2 var(--s2u-font-mono)');   // LR-46: the launcher's type token (was '400 0.6875rem/1.2 var(--s2u-font-mono)')
    expect(value(['.cx-ping.is-good'], 'color', W)).toBe('var(--s2u-lx-good)');
    expect(value(['.cx-ping.is-fair'], 'color', W)).toBe('var(--s2u-lx-ink)');
    expect(value(['.cx-ping.is-poor'], 'color', W)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-rooms__foot'], 'color', W)).toBe(INK(62));
  });

  it('no LR-3 rule draws the old gold', () => {
    const mine = PAGE_RULES.filter((r) => !r.layered && r.sel.some((s) => /\.cx-(room|rooms|filter|ping)\b/.test(s)));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.filter((r) => /--s2u-gold/.test(r.body)).map((r) => r.sel.join(', '))).toEqual([]);
  });

  it('a screen\'s row list fills the panel beside its aside', () => {
    // LR-5 (63b3ae8ac): the rule skips the Options list (`.cx-rows`, CX-11's 57.5rem basis kept). Was: the selector
    // `.cx-screen__body > .cx-rlist`, red since LR-5 changed the rule.
    expect(value(['.cx-screen__body > .cx-rlist:not(.cx-rows)'], 'flex', W)).toBe('1 1 0');
    expect(value(['.cx-screen__body > .cx-rlist:not(.cx-rows)'], 'min-width', W)).toBe('0');
  });

  it('the panel head says what the screen is; the ping bars are drawn in the band\'s own colour, no fixed hex', () => {
    const A = sampleAdapters();
    const S = createState(A);
    S.screen = 'rooms';
    const box = document.createElement('div');
    box.innerHTML = roomsHtml(S, A);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Browse rooms');
    expect(box.querySelector('.cx-screenhead__desc')?.textContent ?? '').not.toBe('');
    const bars = [...box.querySelectorAll('.cx-ping rect')];
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) expect(b.getAttribute('fill')).toBe('currentColor');
    expect(box.querySelectorAll('.cx-ping rect[fill-opacity]').length).toBeGreaterThan(0);   // the unlit bars
    expect(box.querySelector('.cx-ping')!.textContent).not.toMatch(/\bms\b/);
  });
});
