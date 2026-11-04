// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { DISCORD_INVITE, DISCORD_LABEL } from '../../src/console/discord';
import { KEYMAP } from '../../src/console/input';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY, homeItems } from '../../src/console/state';
import { value } from './cascade';
import { mountShell } from './shell';

/**
 * LATER 291 (H290): one Discord link. Desktop draws the official white symbol beside Sign In; at the phone
 * rule (760px) Home lists it under Memory card. The pad reaches it by Down, like the other Home rows, and
 * Cross opens the invite once. No hotkey, and no other social link. A browser adaptation (OT.R28).
 */
let page: ConsolePage | null = null;
const WIDTH = window.innerWidth;
beforeEach(() => { mountShell(document); });
afterEach(() => {
  page?.dispose();
  page = null;
  Object.defineProperty(window, 'innerWidth', { value: WIDTH, configurable: true, writable: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const boot = (): ConsolePage => (page = bootConsole(document, window, sampleAdapters(), { keymap: true }));
const width = (w: number): void => { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }); };
const titles = (): string[] => [...document.querySelectorAll('#stage .cx-item__title')].map((e) => e.textContent!);
const icon = (): HTMLAnchorElement => document.querySelector<HTMLAnchorElement>('#header .cx-discord')!;
const row = (): HTMLAnchorElement => document.querySelector<HTMLAnchorElement>('#stage .cx-discord-row a')!;
const said = (): [string, string][] => prompts(page!.ctl.S, page!.ctl.A).map((p) => [p.k, p.label]);

function expectLink(a: HTMLAnchorElement): void {
  expect(a.getAttribute('href')).toBe(DISCORD_INVITE);
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  expect(a.getAttribute('aria-label')).toBe(DISCORD_LABEL);
  expect(a.getAttribute('accesskey')).toBeNull();
  const svg = a.querySelector('svg')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 64 48');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  const path = svg.querySelector('path')!;
  expect(path.getAttribute('fill')).toBe('white');
  expect(path.getAttribute('d')!.startsWith('M40.575 0C39.9562 1.09866')).toBe(true);
  expect(svg.classList.contains('cx-ico')).toBe(false);
}

describe('LATER 291: the Discord link', () => {
  it('desktop: the official mark beside Sign In, and Home lists it under Server status (LR-37 (4))', () => {
    boot();
    expect(DISCORD_INVITE).toBe('https://discord.gg/vUUewwvtcy');
    expectLink(icon());
    expect(icon().nextElementSibling).toBe(document.querySelector('#header .cx-account-menu'));
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(titles()).toEqual(['Play SOCOM II', 'Server status', 'Discord']);   // LR-13 (LR.R17)
    expectLink(row());
    expect(row().querySelector('.cx-item__sub')!.textContent).toBe('Opens in a new tab');
    expect(homeItems('home', page!.ctl.S, page!.ctl.A).map((x) => x.act).at(-1)).toBe('discord');
    const html = document.body.innerHTML;
    expect(html.match(/discord\.gg\/vUUewwvtcy/g)).toHaveLength(2);
    expect(html).not.toMatch(/youtube|twitter|github\.com|x\.com/i);
    expect(Object.keys(KEYMAP)).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Backspace', 'w', 's', 'a', 'd', 'f', 't', 'q', 'e', 'z', 'c', 'o']);
  });

  it('the pad walks onto it from Server status (LR-13); Cross opens the invite once, and the legend says Open', () => {
    const p = boot();
    p.ctl.S.input = 'pad';
    const open = vi.fn();
    vi.stubGlobal('open', open);
    for (let i = 0; i < 2; i++) p.ctl.press('down');                       // LR-37 (4): Discord is Home's third (LR-13: the fourth)
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(2);
    expect(icon().classList.contains('is-focused')).toBe(true);
    expect(row().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(icon());
    expect(said()).toContainEqual(['cross', 'Select']);
    p.ctl.press('cross');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(DISCORD_INVITE, '_blank', 'noopener,noreferrer');
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(2);
    p.ctl.press('up');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
    expect(document.activeElement).toBe(document.querySelectorAll('#stage .cx-item')[1]);
  });

  it('at the phone rule the Home row is the pad stop and the header icon is not', () => {
    const p = boot();
    width(760);
    p.ctl.S.input = 'pad';
    p.render();
    for (let i = 0; i < 4; i++) p.ctl.press('down');
    expect(row().classList.contains('is-focused')).toBe(true);
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(row());
    const open = vi.fn();
    vi.stubGlobal('open', open);
    row().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    p.ctl.press('cross');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('the stylesheet hides one control at each width and keeps the brand clear space', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    expect(css).toContain('https://discord.com/branding');
    expect(css).toContain('calc(1.5rem * 31.5 / 72.8)');
    expect(css).toContain('aspect-ratio: 64 / 48');
    expect(css).toMatch(/@media \(max-width: 760px\) \{[^}]*\.cx-discord \{ display: none; \}/);
    expect(css).toMatch(/@media \(width > 760px\) \{[^}]*\.cx-discord-row \{ display: none; \}/);
    expect(css).toContain('.cx-discord__mark path { fill: white; }');
    expect(css).toContain('.cx-discord-row > .cx-item { text-decoration: none; }');
  });

  // LATER 407 (H290): a hover / focus / pad-ring pill and a pixel's lift, a press that settles, the phone row's mark eased;
  // the design system's tokens; the mark's colours untouched; under reduced motion the pill alone, no transform.
  it('LATER 407: the hover and press animation on the tokens, the mark untouched, reduced motion static', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    expect(css).toContain('.cx-discord {\n  transition: background var(--s2u-dur-fast) var(--s2u-ease), transform var(--s2u-dur-fast) var(--s2u-ease);');
    expect(css).toMatch(/\.cx-discord:hover,\n:root\[data-console\] \.cx-discord:focus-visible,\n:root\[data-console\] \.cx-discord\.is-focused \{ background: var\(--s2u-surface-hover\); transform: translateY\(-1px\); \}/);
    expect(css).toContain('.cx-discord:active { transform: translateY(0) scale(0.94); }');
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{\n  :root\[data-console\] \.cx-discord, [^}]*\{ transition: none; \}\n([^}]*)\{ transform: none; \}\n\}/.exec(css);
    expect(reduced, 'the reduced-motion block').not.toBeNull();
    for (const sel of ['.cx-discord:hover', '.cx-discord:focus-visible', '.cx-discord.is-focused', '.cx-discord:active', '.cx-item:hover .cx-discord__mark', '.cx-item:active .cx-discord__mark']) {
      expect(reduced![1], sel).toContain(sel);
    }
    // Discord's brand terms: no animation recolours the mark or touches its fill.
    expect(css.match(/\.cx-discord__mark path \{[^}]*\}/g)).toEqual(['.cx-discord__mark path { fill: white; }', '.cx-discord__mark path { fill: CanvasText; }']);
  });

  // #473's review, F2: the wide side is the sheet's own "above the phone rule" form, `(width > 760px)`, so the two
  // controls split every width between them -- a fractional viewport (zoom, a device pixel ratio) included.
  it('exactly one of the two controls is hidden at every width around the phone rule', () => {
    for (const w of [759, 760, 760.5, 761, 1280]) {
      const hidden = [value(['.cx-discord'], 'display', w), value(['.cx-discord-row'], 'display', w)].filter((d) => d === 'none');
      expect(hidden, `${w}px`).toHaveLength(1);
    }
    expect(value(['.cx-discord'], 'display', 760.5)).toBe('inline-flex');
    expect(value(['.cx-discord-row'], 'display', 760)).toBeNull();
  });

  // F3: the pad stop follows the control that is shown when the window crosses the phone rule (a phone turned on its
  // side), not only at the next press.
  it('a resize across the phone rule moves the ring and the focus to the control that is shown', () => {
    const p = boot();
    p.ctl.S.input = 'pad';
    for (let i = 0; i < 4; i++) p.ctl.press('down');
    expect(document.activeElement).toBe(icon());
    width(760);
    window.dispatchEvent(new Event('resize'));
    expect(row().classList.contains('is-focused')).toBe(true);
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(row());
    width(1280);
    window.dispatchEvent(new Event('resize'));
    expect(icon().classList.contains('is-focused')).toBe(true);
    expect(document.activeElement).toBe(icon());
  });

  // F4: no hotkey anywhere in the drawn console, at either width -- not only on the two anchors.
  it('no element of the console carries an accesskey', () => {
    const p = boot();
    expect(document.querySelector('[accesskey]')).toBeNull();
    width(760);
    p.render();
    expect(document.querySelector('[accesskey]')).toBeNull();
  });

  // F6, F7: the phone mark fills the other rows' 2rem icon slot (1.5rem tall at 64/48), and a forced-colours theme
  // paints it in the system's text colour (black or white) so it never vanishes on the theme's ground.
  it('the phone mark sits in the icon slot, and forced colours paint it CanvasText', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    expect(css).toContain(':root[data-console] .cx-item__icon .cx-discord__mark { height: 1.5rem; }');
    expect(css).not.toMatch(/\.cx-item__icon \.cx-discord__mark \{ height: 2rem; \}/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*:root\[data-console\] \.cx-discord__mark path \{ fill: CanvasText; \}\s*\}/);
  });
});
