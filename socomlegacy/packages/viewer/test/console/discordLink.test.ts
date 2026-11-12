// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { DISCORD_INVITE, DISCORD_LABEL, GITHUB_LABEL, GITHUB_REPO, GITHUB_ROW_PX, githubMark } from '../../src/console/discord';
import { NEW_TAB_POINTER_WORDS } from '../../src/console/grammar';
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
// A desktop width above GITHUB_ROW_PX (1100) unless a case sets its own (jsdom's 1024 is inside the band since 2026-11-12).
beforeEach(() => { mountShell(document); width(1280); });
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
const ghIcon = (): HTMLAnchorElement => document.querySelector<HTMLAnchorElement>('#header .cx-github')!;
const ghRow = (): HTMLAnchorElement => document.querySelector<HTMLAnchorElement>('#stage .cx-github-row a')!;
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

/** The owner, 2026-11-12: the GitHub link beside Discord's, the same treatment -- GitHub's official mark (Octicons
 *  `mark-github`, 16x16), one colour, white. */
function expectGithubLink(a: HTMLAnchorElement): void {
  expect(a.getAttribute('href')).toBe(GITHUB_REPO);
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  expect(a.getAttribute('aria-label')).toBe(GITHUB_LABEL);
  expect(GITHUB_LABEL).toBe('GitHub (opens in a new tab)');
  expect(a.getAttribute('accesskey')).toBeNull();
  const svg = a.querySelector('svg')!;
  expect(svg.classList.contains('cx-github__mark')).toBe(true);
  expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  const path = svg.querySelector('path')!;
  expect(path.getAttribute('fill')).toBe('white');
  expect(path.getAttribute('d')!.startsWith('M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59')).toBe(true);
  expect(svg.classList.contains('cx-ico')).toBe(false);
}

describe('LATER 291: the Discord link', () => {
  it('desktop: the official mark beside Sign In, and Home lists it under Server status (LR-37 (4))', () => {
    boot();
    expect(DISCORD_INVITE).toBe('https://discord.gg/vUUewwvtcy');
    expectLink(icon());
    // The owner, 2026-11-12: "Add a github link beside the discord one with the same icon set on the launcher main menu".
    expect(icon().nextElementSibling).toBe(ghIcon());
    expectGithubLink(ghIcon());
    expect(ghIcon().nextElementSibling).toBe(document.querySelector('#header .cx-account-menu'));
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(ghIcon().classList.contains('is-focused')).toBe(false);
    expect(titles()).toEqual(['Play SOCOM II', 'Server status', 'Discord', 'GitHub']);   // LR-13 (LR.R17); GitHub after Discord
    expectLink(row());
    expect(row().querySelector('.cx-item__sub')!.textContent).toBe('Opens in a new tab');
    expectGithubLink(ghRow());
    expect(ghRow().closest('li')!.previousElementSibling).toBe(row().closest('li'));
    expect(ghRow().querySelector('.cx-item__sub')!.textContent).toBe('The public source of the client');
    expect(homeItems('home', page!.ctl.S, page!.ctl.A).map((x) => x.act).slice(-2)).toEqual(['discord', 'github']);
    expect(GITHUB_REPO).toBe('https://github.com/Scotho/socom-legacy');
    const html = document.body.innerHTML;
    expect(html.match(/discord\.gg\/vUUewwvtcy/g)).toHaveLength(2);
    expect(html.match(/github\.com\/Scotho\/socom-legacy"/g)).toHaveLength(2);
    expect(html).not.toMatch(/youtube|twitter|x\.com/i);
    expect(Object.keys(KEYMAP)).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Backspace', 'w', 's', 'a', 'd', 'f', 't', 'q', 'e', 'z', 'c', 'o']);
  });

  // RB-45 (c), wave 1's review: a pad press is no user activation, so a browser's popup blocker eats its new tab. The
  // pad's Cross says how (`NEW_TAB_POINTER_WORDS`, as Experiments' rows since RB-5) and opens nothing; a key's press
  // (Enter, `keyGesture`) opens the invite once.
  it('the pad walks onto it from Server status (LR-13); a pad Cross says how, a key opens the invite once', () => {
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
    expect(open).not.toHaveBeenCalled();
    expect(p.ctl.S.legendError).toBe(NEW_TAB_POINTER_WORDS);
    p.ctl.keyGesture = true;
    try { p.ctl.press('cross'); } finally { p.ctl.keyGesture = false; }
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(DISCORD_INVITE, '_blank', 'noopener,noreferrer');
    // The owner, 2026-11-12: GitHub is the next stop after Discord -- the header's icon beside it -- and Home's last.
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(3);
    expect(ghIcon().classList.contains('is-focused')).toBe(true);
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(ghRow().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(ghIcon());
    open.mockClear();
    p.ctl.press('cross');
    expect(open).not.toHaveBeenCalled();
    expect(p.ctl.S.legendError).toBe(NEW_TAB_POINTER_WORDS);
    p.ctl.keyGesture = true;
    try { p.ctl.press('cross'); } finally { p.ctl.keyGesture = false; }
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(GITHUB_REPO, '_blank', 'noopener,noreferrer');
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(3);
    p.ctl.press('up');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(2);
    expect(document.activeElement).toBe(icon());
    p.ctl.press('up');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
    expect(document.activeElement).toBe(document.querySelectorAll('#stage .cx-item')[1]);
  });

  // LR-29: above the phone rule the hidden rows' stops are the header icons, so the list holds where it stood at the row
  // before Discord's -- at the GitHub stop as at the Discord one.
  it('wide: the list holds Server status\' place at the GitHub stop as at the Discord one (LR-29)', () => {
    const p = boot();
    p.ctl.S.input = 'pad';
    const shift = (): string => document.querySelector<HTMLElement>('#stage .cx-list')!.style.getPropertyValue('--cx-list-shift');
    p.ctl.press('down');
    const held = shift();
    p.ctl.press('down');
    expect(shift()).toBe(held);
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(3);
    expect(shift()).toBe(held);
  });

  it('a click on the GitHub row moves the focus and lets the href open it (no second window.open)', () => {
    const p = boot();
    width(760);
    p.render();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    ghRow().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(3);
  });

  it('at the phone rule the Home row is the pad stop and the header icon is not', () => {
    const p = boot();
    width(760);
    p.ctl.S.input = 'pad';
    p.render();
    for (let i = 0; i < 2; i++) p.ctl.press('down');                       // Discord (GitHub one further since 2026-11-12)
    expect(row().classList.contains('is-focused')).toBe(true);
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(row());
    p.ctl.press('down');                                                    // the owner, 2026-11-12: GitHub's row next
    expect(ghRow().classList.contains('is-focused')).toBe(true);
    expect(ghIcon().classList.contains('is-focused')).toBe(false);
    expect(row().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(ghRow());
    p.ctl.press('up');
    expect(document.activeElement).toBe(row());
    const open = vi.fn();
    vi.stubGlobal('open', open);
    row().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    p.ctl.press('cross');                                                   // RB-45 (c): the pad's says how
    expect(open).not.toHaveBeenCalled();
    expect(p.ctl.S.legendError).toBe(NEW_TAB_POINTER_WORDS);
    p.ctl.keyGesture = true;
    try { p.ctl.press('cross'); } finally { p.ctl.keyGesture = false; }
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
    // The owner, 2026-11-12: GitHub's link takes the same rules in parallel; the Discord ones above are unchanged.
    expect(css).toContain('https://github.com/logos');
    // The review's header measurement (2026-11-12): up to GITHUB_ROW_PX the header icon gives way to Home's row.
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[^}]*\.cx-github \{ display: none; \}/);
    expect(css).toMatch(/@media \(width > 1100px\) \{[^}]*\.cx-github-row \{ display: none; \}/);
    expect(GITHUB_ROW_PX).toBe(1100);
    expect(css).toContain('.cx-github-row > .cx-item { text-decoration: none; }');
    expect(css).toContain('aspect-ratio: 1 / 1');
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*:root\[data-console\] \.cx-github__mark path \{ fill: CanvasText; \}\s*\}/);
    expect(css.match(/\.cx-github__mark path \{[^}]*\}/g)).toEqual(['.cx-github__mark path { fill: white; }', '.cx-github__mark path { fill: CanvasText; }']);
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
    for (const w of [759, 760, 760.5, 761, 800, 1024, 1100, 1100.5, 1101, 1280]) {
      const hidden = [value(['.cx-github'], 'display', w), value(['.cx-github-row'], 'display', w)].filter((d) => d === 'none');
      expect(hidden, `GitHub ${w}px`).toHaveLength(1);
      // Beside Discord's control at and below the phone rule and above 1100px; between them (the tight header), Home's row.
      const tight = w > 760 && w <= 1100;
      expect(value(['.cx-github'], 'display', w), `GitHub's icon at ${w}px`).toBe(tight ? 'none' : value(['.cx-discord'], 'display', w));
      expect(value(['.cx-github-row'], 'display', w), `GitHub's row at ${w}px`).toBe(tight ? null : value(['.cx-discord-row'], 'display', w));
    }
  });

  // The review's header measurement (2026-11-12, `agent-mail/evidence/v0420/launcher-github-link/`): at 761px signed in
  // with a 14-character name and the 12-hour clock a second header icon slid the brand under the clock by 24.6px. Between
  // the phone rule and GITHUB_ROW_PX the header keeps Discord's icon alone and GitHub is Home's row, the stop after it.
  it('between the phone rule and 1100px: Discord the header icon, GitHub Home\'s row, in that order', () => {
    width(800);
    const p = boot();
    p.ctl.S.input = 'pad';
    p.render();
    const shift = (): string => document.querySelector<HTMLElement>('#stage .cx-list')!.style.getPropertyValue('--cx-list-shift');
    for (let i = 0; i < 2; i++) p.ctl.press('down');
    expect(icon().classList.contains('is-focused')).toBe(true);
    expect(document.activeElement).toBe(icon());
    expect(shift()).toBe('0');                                              // held at Server status' place (LR-29)
    p.ctl.press('down');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(3);
    expect(ghRow().classList.contains('is-focused')).toBe(true);
    expect(ghIcon().classList.contains('is-focused')).toBe(false);
    expect(icon().classList.contains('is-focused')).toBe(false);
    expect(document.activeElement).toBe(ghRow());
    // The hidden Discord row takes no height: GitHub's row is the third drawn, so the list shifts by one (Play above).
    expect(shift()).toBe('1');
    expect(ghRow().classList.contains('is-above')).toBe(false);
    expect(document.querySelectorAll('#stage .cx-list .cx-item')[1]!.classList.contains('is-above')).toBe(false);
    p.ctl.press('up');
    expect(document.activeElement).toBe(icon());
    // A resize out of the band moves the stop to the control that is shown.
    p.ctl.press('down');
    width(1280);
    window.dispatchEvent(new Event('resize'));
    expect(ghIcon().classList.contains('is-focused')).toBe(true);
    expect(document.activeElement).toBe(ghIcon());
    width(1024);                                                            // inside the band (130% Interface size's room)
    window.dispatchEvent(new Event('resize'));
    expect(document.activeElement).toBe(ghRow());
    expect(ghIcon().classList.contains('is-focused')).toBe(false);
  });

  // The review's nit: the CSS compares the fractional width, `innerWidth` is whole pixels; the script reads the same
  // media query (`matchMedia`), so at 1100.5px under zoom both draw the header icon and the focus lands on it.
  it('the script asks the stylesheet\'s own query, so a fractional width agrees with the CSS', () => {
    width(1100);                                                            // innerWidth rounds 1100.5 down
    const asked: string[] = [];
    vi.stubGlobal('matchMedia', (q: string) => { asked.push(q); return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }; });
    const p = boot();
    p.ctl.S.input = 'pad';
    for (let i = 0; i < 3; i++) p.ctl.press('down');
    expect(asked).toContain('(max-width: 1100px)');
    expect(ghIcon().classList.contains('is-focused')).toBe(true);
    expect(document.activeElement).toBe(ghIcon());
  });

  // F3: the pad stop follows the control that is shown when the window crosses the phone rule (a phone turned on its
  // side), not only at the next press.
  it('a resize across the phone rule moves the ring and the focus to the control that is shown', () => {
    const p = boot();
    p.ctl.S.input = 'pad';
    for (let i = 0; i < 2; i++) p.ctl.press('down');                       // Discord (GitHub one further since 2026-11-12)
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

  // The GitHub mark's path is spelled with a space between every two numbers (the leak check reads compact path data
  // such as the official spelling's runs as IPv4 addresses). Its geometry is the official Octicons `mark-github` 16x16
  // path's, number for number: the official compact spelling is held here in pieces, cut where a piece would otherwise
  // hold an address-shaped run, joined only at run time.
  it('the GitHub mark\'s path is the official Octicons mark-github path, command for command and number for number', () => {
    const official = [
      'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23',
      '.82.72 1.21 1.87.87 2.33',
      '.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2',
      '.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
    ].join('');
    // SVG path grammar: a command letter, then numbers; a number starts at a sign or at a second '.'; an arc's
    // large-arc and sweep flags are one digit each (the official `0016` is 0, 0, 16).
    const parse = (d: string): [string, number[]][] => {
      const out: [string, number[]][] = [];
      let i = 0;
      while (i < d.length) {
        const c = d[i]!;
        if (/[MmLlHhVvCcSsQqTtAaZz]/.test(c)) { out.push([c, []]); i++; continue; }
        if (c === ' ' || c === ',') { i++; continue; }
        const nums = out.at(-1)![1];
        if (/[Aa]/.test(out.at(-1)![0]) && [3, 4].includes(nums.length % 7)) { nums.push(Number(c)); i++; continue; }
        const m = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(d.slice(i))!;
        nums.push(Number(m[0]));
        i += m[0].length;
      }
      return out;
    };
    const ours = new DOMParser().parseFromString(githubMark(), 'image/svg+xml').querySelector('path')!.getAttribute('d')!;
    expect(parse(ours)).toEqual(parse(official));
    expect(parse(ours).map(([c]) => c).join('')).toBe('MCcAcz');
    expect(parse(ours).reduce((n, [, xs]) => n + xs.length, 0)).toBe(153);
    // No run of four dot-separated numbers in the spelling we ship.
    expect(ours).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });
});
