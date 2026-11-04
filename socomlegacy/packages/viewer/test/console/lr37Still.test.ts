// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { SheetBackdrop, type Ctx2D } from '../../src/console/render/sheets';
import { THEMES } from '../../src/console/render/theme';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { publishDisc } from '../../src/modern/discStore';
import { mountShell } from './shell';

/**
 * LR-37, item 10 (the owner, 2026-10-29: "Stop the home animation while the game or any forge/testroom is playing and
 * only resume it while people are viewing the home screen via PS button"). A browser adaptation: the launcher's own
 * animation, nothing of the game. The sheet backdrop's frame loop does no work while the game has the window (the disc
 * store's `in-game`), nor while the tab is hidden, and resumes when either ends; its canvas taken down with the page
 * stops it for good (no frame for a later resize). The overlay (the PS button's console) draws no backdrop (OT.R60 (d)):
 * its decorative CSS animations run on its Home and are paused on its other screens (`data-cx-still`).
 */
const ctx = new Proxy({}, { get: () => () => ({ addColorStop() { /* a test's gradient */ } }), set: () => true }) as unknown as Ctx2D;

describe('LR-37 (10): the backdrop\'s loop stands still while the game runs or the tab is hidden', () => {
  let frames: ((ts: number) => void)[];
  let host: HTMLElement;
  let hidden: boolean;
  const make = () => new SheetBackdrop(host, { context: () => ctx, frame: (cb) => { frames.push(cb); return frames.length; }, cancel: () => { frames.length = 0; }, reduced: () => false });
  const run = (ts: number) => { const f = frames.shift(); f?.(ts); return !!f; };
  beforeEach(() => {
    frames = []; hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.body.innerHTML = '<div id="backdrop"><img alt=""></div>';
    host = document.getElementById('backdrop')!;
    publishDisc(document, { state: 'ready', filename: 'x.iso' });
  });
  afterEach(() => { delete (document as unknown as { hidden?: boolean }).hidden; publishDisc(document, { state: 'empty' }); });

  it('drifting, the game takes the window: the next frame requests none, a resize requests none; back to the launcher, it resumes', () => {
    const b = make();
    b.set({ cat: 1, theme: THEMES[0]!, motion: true, picture: false });
    expect(run(0)).toBe(true);
    expect(frames).toHaveLength(1);
    publishDisc(document, { state: 'in-game', filename: 'x.iso' });
    run(16);
    expect(frames).toHaveLength(0);
    window.dispatchEvent(new Event('resize'));
    b.set({ cat: 2, theme: THEMES[0]!, motion: true, picture: false });
    expect(frames).toHaveLength(0);
    publishDisc(document, { state: 'ready', filename: 'x.iso' });
    expect(frames).toHaveLength(1);
    b.dispose();
  });

  it('a hidden tab: no frame requested; visible again, the loop resumes', () => {
    const b = make();
    b.set({ cat: 1, theme: THEMES[0]!, motion: true, picture: false });
    run(0);
    hidden = true;
    run(16);
    expect(frames).toHaveLength(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveLength(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveLength(1);
    b.dispose();
  });

  it('the canvas taken down with the page (the hand-over\'s take-down): the loop ends and a later resize asks no frame', () => {
    const b = make();
    b.set({ cat: 1, theme: THEMES[0]!, motion: true, picture: false });
    run(0);
    host.remove();
    run(16);
    expect(frames).toHaveLength(0);
    window.dispatchEvent(new Event('resize'));
    expect(frames).toHaveLength(0);
    b.dispose();
  });
});

describe('LR-37 (10): the overlay\'s animations run on its Home only', () => {
  let page: ConsolePage | null = null;
  beforeEach(() => { mountShell(document); });
  afterEach(() => { page?.dispose(); page = null; delete document.documentElement.dataset['cxStill']; });

  it('over a game, Home: not still; another screen: still; Home again: not still', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false, mode: 'overlay' });
    page.render();
    expect(document.documentElement.hasAttribute('data-cx-still')).toBe(false);
    page.ctl.S.screen = 'options';
    page.render();
    expect(document.documentElement.hasAttribute('data-cx-still')).toBe(true);
    page.ctl.S.screen = 'home';
    page.render();
    expect(document.documentElement.hasAttribute('data-cx-still')).toBe(false);
  });

  it('the launcher page is never still (its animations run as normal on every screen)', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false, mode: 'page' });
    page.ctl.S.screen = 'options';
    page.render();
    expect(document.documentElement.hasAttribute('data-cx-still')).toBe(false);
  });

  it('the sheet pauses the decorative infinite animations under the mark', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf-8');
    const block = css.slice(css.indexOf('LR-37 (10, the owner'));
    expect(css).toContain('LR-37 (10, the owner');
    for (const sel of ['.cx-version', '.cx-clock__colon', '.cx-pad__halo', '.cx-item.is-focused::after', '.cx-start.is-ready']) {
      expect(block, sel).toContain(`:root[data-cx-still] ${sel}`);
    }
    expect(block).toMatch(/animation-play-state:\s*paused/);
  });
});
