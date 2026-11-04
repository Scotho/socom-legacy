// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY } from '../../src/console/state';
import { DS, PAGE, value } from './cascade';
import { mountShell } from './shell';

/**
 * LR-29 (a browser adaptation, nothing of the game): the four follow-ups of the box's matrix-8 at dad204c2c
 * (`agent-mail/evidence/lr-7-matrix-8/`, probe14), launcher layout only; jsdom has no layout, so the cause is pinned in
 * the rules the layout is made of.
 * 1. 390x844: the marks row moved 3 px down when Square (a key: the pad's mode) was pressed, and stayed there after the
 *    menu closed -- the cause is the mode, not the menu (the menu opened by a click moved nothing: the probe's
 *    `marksAtClick`). The prompts are `display: none` for a pointer and drawn for the pad at the phone rule (components.css
 *    part G), so the legend's lines go from one (the marks') to two; the bar's min-height made the one line centred and the
 *    two lines bottom-packed. The legend packs its lines to the bottom, so the marks' line is the same line either way.
 * 2. The short-landscape bar's Tab order: documented, not changed (the reason is in console.css).
 * 3. A pad's Down from Server status on a wide layout.
 */

let page: ConsolePage | null = null;
const realMatch = window.matchMedia;
const WIDTH = window.innerWidth;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => {
  page?.dispose(); page = null; vi.restoreAllMocks(); localStorage.clear(); vi.useRealTimers(); window.matchMedia = realMatch;
  Object.defineProperty(window, 'innerWidth', { value: WIDTH, configurable: true, writable: true });
});
const width = (w: number): void => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); };
const boot = (input: 'pad' | 'pointer' = 'pad'): ConsolePage => {
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  page.ctl.S.input = input;
  document.documentElement.dataset.input = input;
  page.render();
  return page;
};

describe('LR-29.1: the marks row is the same line whether the prompts are drawn or not (390x844)', () => {
  it('the cause: a pointer draws no prompts at the phone rule, the pad draws them (the legend has one line or two)', () => {
    expect(DS).toMatch(/@media \(max-width: 760px\) \{[\s\S]*?\.cx-prompts \{ display: none; \}\s*:root\[data-input="pad"\] \.cx-prompts \{ display: flex; \}/);
    expect(value(['.cx-legend'], 'flex-wrap', 390)).toBe('wrap');
    expect(value(['.cx-legend'], 'min-height', 390)).not.toBeNull();       // the bar is taller than its one line
  });
  it('the legend packs its lines to the bottom at the phone rule, so the marks\' line does not move when a line is added above', () => {
    expect(value(['.cx-legend'], 'align-content', 390)).toBe('flex-end');
  });
  it('the fix reaches the portrait phone only: above the phone rule the bar is one line and nothing is packed', () => {
    expect(value(['.cx-legend'], 'align-content', 1280)).toBeNull();
  });
  it('the menu is out of flow at every width (position: absolute), so opening it adds no height to the bar', () => {
    expect(PAGE).toMatch(/\.cx-srcmenu \{ position: absolute;/);
    expect(PAGE).toMatch(/@media \(max-width: 760px\) \{\s*:root\[data-console\] \.cx-legend \.cx-markbox \{ position: static; \}/);
  });
});

describe('LR-29.2: the short-landscape bar\'s Tab order', () => {
  it('the DOM keeps the prompts first (the portrait phone\'s two lines are laid out by it), and the reason is written at the order rule', () => {
    boot('pad');
    const legend = document.getElementById('legend')!;
    const kids = [...legend.children].map((e) => e.className.split(' ')[0]);
    expect(kids.indexOf('cx-prompts')).toBeLessThan(kids.indexOf('cx-cluster'));
    // The portrait phone wraps the bar: the cluster is a full-width line (its width 100%) laid out after the prompts by the DOM alone.
    expect(value(['.cx-cluster'], 'width', 390)).toBe('100%');
    expect(value(['.cx-legend .cx-cluster--marks'], 'order', 390)).toBeNull();
    const raw = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');   // comments kept
    const at = raw.indexOf('.cx-legend .cx-cluster--marks { order: -1; }');
    expect(at).toBeGreaterThan(0);
    const note = raw.slice(Math.max(0, at - 1800), at);
    expect(note).toMatch(/WCAG 2\.4\.3/);
    expect(note).toMatch(/portrait phone/);
    expect(note).toMatch(/LATER 522/);
  });
});

describe('LR-29.3: a pad\'s Down from Server status on a wide layout lands on the shown stop and leaves the list where it stood', () => {
  const shiftOf = (): string => document.querySelector<HTMLElement>('.cx-home .cx-list')!.style.getPropertyValue('--cx-list-shift');
  it('wide: the header icon is the stop (ringed), the hidden row is not lit, and the list holds Server status\' place', () => {
    const p = boot('pad');
    width(1280);
    p.render();
    // LR-37 (LR.R31): the page's Home is Play, Server status, Discord (no Memory card row), so Server status is one Down
    // from Play (was two), its shift 0 (was 1: Play hidden above Memory card), and Discord is item 2 (was 3).
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
    const held = shiftOf();
    expect(held).toBe('0');
    const hidden = document.querySelectorAll('#stage .cx-item.is-above').length;
    expect(hidden).toBe(0);                                                // LR-37: nothing above Server status's row before it (was Play)
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(2);                           // the walk still reaches Discord: the header icon
    expect(document.querySelector('#header .cx-discord')!.classList.contains('is-focused')).toBe(true);
    expect(document.querySelector('#stage .cx-discord-row .cx-item')!.classList.contains('is-focused')).toBe(false);
    expect(shiftOf()).toBe(held);                                          // not slid up to a row nobody sees
    expect(document.querySelectorAll('#stage .cx-item.is-above')).toHaveLength(hidden);   // as at Server status (LR-37: none; was Play only)
  });
  it('the phone rule: the row is the stop and the list slides to it as before', () => {
    const p = boot('pad');
    width(760);
    p.render();
    for (let i = 0; i < 2; i++) p.ctl.press('down');                       // LR-37 (LR.R31): Discord is item 2 (was 3)
    expect(document.querySelector('#stage .cx-discord-row .cx-item')!.classList.contains('is-focused')).toBe(true);
    expect(shiftOf()).toBe('1');                                           // LR-37: one row above the one before it (was 2)
  });
});
