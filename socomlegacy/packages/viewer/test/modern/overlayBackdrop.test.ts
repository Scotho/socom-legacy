// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountOverlay, OVERLAY_BLUR_PX_ADAPTATION, OVERLAY_DIM_ADAPTATION, OVERLAY_SCRIM_ADAPTATION, type Overlay } from '../../src/modern/overlay/index';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { BACKDROP_URL } from '../../src/console/backdrop';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { mountShell } from '../console/shell';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';

/**
 * OVERLAY-CONSOLE, MISSION's OT.R60 (d) (the owner, 2026-10-16: "make it so the background of the overlay while in game
 * actually is a blurred out version of the active game instead of the launchers default bg"): over a game the console
 * draws no backdrop and no ground of its own, its frame's document is transparent, and the frame element blurs and
 * slightly darkens the live page behind it (`backdrop-filter`), by named product-track constants written into CSS
 * custom properties; a darker scrim with no blur where the filter is unsupported, or where the seat forces it
 * (`mu-overlay-frame--noblur`). Outside a game (the console as the launcher) its own backdrop stays. A browser
 * adaptation with no original (OT.R28). jsdom computes no cascade from the sheets, so the rules are read in their text.
 */
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '../..');
/** A sheet's text with its line ends as LF (a Windows checkout writes CRLF). */
const sheet = (path: string): string => readFileSync(resolve(VIEWER, path), 'utf8').replace(/\r\n/g, '\n');
const OVERLAY_CSS = sheet('src/modern/overlay/overlay.css');
const CONSOLE_CSS = sheet('src/console/console.css');
/** The declarations of the rule whose selector list is exactly `sel` (the first one), '' when none. */
const rule = (css: string, sel: string): string => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};
const offline = (async () => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

let overlay: Overlay | null = null;
let page: ConsolePage | null = null;
beforeEach(() => { vi.stubGlobal('fetch', offline); document.body.innerHTML = '<canvas id="front-end"></canvas>'; });
afterEach(() => { overlay?.dispose(); overlay = null; page?.dispose(); page = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('OT.R60 (d): the named constants reach the frame\'s CSS', () => {
  it('a 12 px blur and a 0.35 darkening (the starting values), the fallback scrim darker; labelled adaptations', () => {
    expect(OVERLAY_BLUR_PX_ADAPTATION).toBe(12);
    expect(OVERLAY_DIM_ADAPTATION).toBe(0.35);
    expect(OVERLAY_SCRIM_ADAPTATION).toBeGreaterThan(OVERLAY_DIM_ADAPTATION);
    expect(OVERLAY_SCRIM_ADAPTATION).toBeLessThan(1);
    const src = readFileSync(resolve(VIEWER, 'src/modern/overlay/index.ts'), 'utf8');
    for (const name of ['OVERLAY_BLUR_PX_ADAPTATION', 'OVERLAY_DIM_ADAPTATION', 'OVERLAY_SCRIM_ADAPTATION']) {
      const doc = src.slice(0, src.indexOf(`export const ${name}`));
      expect(doc.slice(doc.lastIndexOf('/**')), name).toMatch(/adaptation/i);
    }
  });

  it('the module writes them into the frame\'s custom properties, and the frame\'s rule reads them', () => {
    overlay = mountOverlay(document, { nav: { getGamepads: () => [] }, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} });
    overlay.open();                                                  // the frame is made at the first open
    const style = overlay.el!.style;
    expect(style.getPropertyValue('--mu-overlay-blur')).toBe(`${OVERLAY_BLUR_PX_ADAPTATION}px`);
    expect(style.getPropertyValue('--mu-overlay-dim')).toBe(String(OVERLAY_DIM_ADAPTATION));
    expect(style.getPropertyValue('--mu-overlay-scrim')).toBe(String(OVERLAY_SCRIM_ADAPTATION));
    const frame = rule(OVERLAY_CSS, '.mu-overlay-frame');
    expect(frame).toMatch(/backdrop-filter:\s*blur\(var\(--mu-overlay-blur\)\)/);
    expect(frame).toMatch(/-webkit-backdrop-filter:\s*blur\(var\(--mu-overlay-blur\)\)/);
    expect(frame).toMatch(/background(-color)?:\s*color-mix\(in srgb, var\(--s2u-ground, #000\) calc\(var\(--mu-overlay-dim\) \* 100%\), transparent\)/);
  });

  it('the fallback: unsupported blur, or the frame forced by `mu-overlay-frame--noblur`, gives the darker scrim and no filter', () => {
    const supports = OVERLAY_CSS.slice(OVERLAY_CSS.indexOf('@supports not (backdrop-filter: blur(1px))'));
    expect(supports.length).toBeLessThan(OVERLAY_CSS.length);
    expect(supports.slice(0, supports.indexOf('}\n}') + 3)).toMatch(/\.mu-overlay-frame\s*\{[^}]*background(-color)?:\s*color-mix\(in srgb, var\(--s2u-ground, #000\) calc\(var\(--mu-overlay-scrim\) \* 100%\), transparent\)/);
    const forced = rule(OVERLAY_CSS, '.mu-overlay-frame.mu-overlay-frame--noblur');
    expect(forced).toMatch(/backdrop-filter:\s*none/);
    expect(forced).toMatch(/-webkit-backdrop-filter:\s*none/);
    expect(forced).toMatch(/background(-color)?:\s*color-mix\(in srgb, var\(--s2u-ground, #000\) calc\(var\(--mu-overlay-scrim\) \* 100%\), transparent\)/);
  });
});

describe('OT.R60 (d): over a game no backdrop of the launcher\'s; as the launcher, its own', () => {
  it('overlay mode: the backdrop is not drawn (hidden, no picture loaded) and the console is marked for the transparent ground', () => {
    mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false, mode: 'overlay' });
    const bd = document.getElementById('backdrop')!;
    expect(bd.hidden).toBe(true);
    expect(bd.querySelector('img')!.getAttribute('src')).toBeNull();
    expect(document.documentElement.dataset['consoleMode']).toBe('overlay');
    const ground = rule(CONSOLE_CSS, ':root[data-console][data-console-mode="overlay"], :root[data-console][data-console-mode="overlay"] body');
    expect(ground).toMatch(/background:\s*transparent/);
    expect(rule(CONSOLE_CSS, ':root[data-console][data-console-mode="overlay"] .cx-backdrop')).toMatch(/display:\s*none/);
    page.render();
    expect(bd.hidden).toBe(true);                                  // a draw leaves it so
  });

  it('page mode (the launcher): its own backdrop stays -- drawn, the picture loaded, no overlay mark', () => {
    mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const bd = document.getElementById('backdrop')!;
    expect(bd.hidden).toBe(false);
    expect(bd.querySelector('img')!.getAttribute('src')).toBe(BACKDROP_URL);
    expect(document.documentElement.dataset['consoleMode']).toBeUndefined();
  });

  it('the overlay over a page: its console\'s backdrop not drawn, the frame\'s document transparent', async () => {
    overlay = mountOverlay(document, { nav: { getGamepads: () => [] }, session: fakeSession(), state: fakeLauncher('in-game'), frame: () => 0, cancelFrame: () => {} });
    overlay.open();
    await settle();
    const inner = overlay.el!.contentDocument!;
    expect(inner.getElementById('backdrop')!.hidden).toBe(true);
    expect(inner.documentElement.dataset['consoleMode']).toBe('overlay');
    expect(rule(OVERLAY_CSS, 'html.mu-overlay-doc, html.mu-overlay-doc body')).toMatch(/background:\s*transparent/);
  });
});
