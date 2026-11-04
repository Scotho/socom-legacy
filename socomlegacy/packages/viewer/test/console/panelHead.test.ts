// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screenHead } from '../../src/console/render/head';
import { PAGE, value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8): a pushed page's head in the artifact's drawing (`S2-Launcher-v2.dc.html`, its
 * panel head: the breadcrumb in mono gold capitals, the title at 34 design px, the description at 15 at 70%, 48ch), with
 * LP.R14's one return control as the crumb's first step: the chevron, the parent's icon and its name, then the page's own
 * name after a slash (the h1 says it; the slash and the name are drawn, not read twice). A browser adaptation.
 */
const head = (...args: Parameters<typeof screenHead>): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = screenHead(...args);
  return box.querySelector('.cx-screenhead')!;
};

describe('the panel head', () => {
  it('a pushed page: the crumb is the Back control then " / " and the page, the title, and the description when given', () => {
    const h = head('', 'System Settings', 'Settings', '', 'How the launcher looks, connects and updates.');
    const crumb = h.querySelector('.cx-crumb')!;
    expect(crumb).not.toBeNull();
    const back = crumb.firstElementChild as HTMLElement;
    expect(back.classList.contains('cx-back')).toBe(true);
    expect(back.textContent).toBe('Settings');                           // LP.R14: the parent's name only
    expect(back.firstElementChild?.classList.contains('cx-back__chevron')).toBe(true);
    const here = crumb.querySelector('.cx-crumb__here')!;
    expect(here.textContent).toBe(' / System Settings');
    expect(here.getAttribute('aria-hidden')).toBe('true');
    expect(h.querySelector('h1.cx-title')!.textContent).toBe('System Settings');
    expect(h.querySelector('.cx-screenhead__desc')!.textContent).toBe('How the launcher looks, connects and updates.');
    expect(h.querySelector('.cx-eyebrow')).toBeNull();                   // no duplicated eyebrow (LP.R14)
  });
  it('no description given, none drawn; a top page keeps its eyebrow as the crumb', () => {
    expect(head('Settings', 'Audio', 'Settings').querySelector('.cx-screenhead__desc')).toBeNull();
    const top = head('<span>Play online</span>', 'Browse rooms', null);
    expect(top.querySelector('.cx-crumb .cx-eyebrow')).not.toBeNull();
    expect(top.querySelector('.cx-back')).toBeNull();
  });
  it('a description is escaped', () => {
    expect(head('', 'X', 'Settings', '', '<b>bold</b>').querySelector('.cx-screenhead__desc')!.innerHTML).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });
  it('the tail (a screen\'s checks or filters) still follows the head', () => {
    const h = head('', 'Browse rooms', 'Play online', '<div class="cx-filters"></div>');
    expect(h.lastElementChild?.classList.contains('cx-filters')).toBe(true);
  });
});

describe('the panel head\'s drawing', () => {
  const W = 1280;
  it('the crumb in mono gold capitals at 12 design px and 0.16em; the title 34, regular, in the ink; the description 15 at 70%, 48ch', () => {
    expect(value(['.cx-screen .cx-crumb'], 'font', W)).toBe('400 calc(0.75rem * var(--cx-text-scale))/1.2 var(--s2u-font-mono)');   // LR-46: the launcher's type token (was '400 0.75rem/1.2 var(--s2u-font-mono)')
    expect(value(['.cx-screen .cx-crumb'], 'letter-spacing', W)).toBe('0.16em');
    expect(value(['.cx-screen .cx-crumb'], 'text-transform', W)).toBe('uppercase');
    expect(value(['.cx-screen .cx-crumb'], 'color', W)).toBe('var(--s2u-lx-accent)');
    expect(value(['.cx-screen .cx-screenhead .cx-title'], 'font', W)).toBe('400 calc(2.125rem * var(--cx-text-scale))/1.15 var(--s2u-font-body)');   // LR-46: the launcher's type token (was '400 2.125rem/1.15 var(--s2u-font-body)')
    expect(value(['.cx-screen .cx-screenhead .cx-title'], 'color', W)).toBe('var(--s2u-lx-ink)');
    expect(value(['.cx-screen .cx-screenhead__desc'], 'max-width', W)).toBe('48ch');
    expect(value(['.cx-screen .cx-screenhead__desc'], 'opacity', W)).toBe('0.7');
  });
  it('the Back step takes the crumb\'s colour and type and lights to the bright gold on hover and focus', () => {
    expect(PAGE).toMatch(/\.cx-screen \.cx-crumb \.cx-back \{[^}]*font: inherit;[^}]*color: inherit;/);
    expect(PAGE).toMatch(/\.cx-screen \.cx-crumb \.cx-back:hover,\s*:root\[data-console\] \.cx-screen \.cx-crumb \.cx-back:focus-visible \{ color: var\(--s2u-lx-accent-hi\); \}/);
  });
});
