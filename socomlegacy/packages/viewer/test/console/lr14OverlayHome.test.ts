// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { homeItems } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-14 (LR.R18, the dispatcher's word 2026-10-26 under OT.R53; a browser adaptation): over a game the overlay's Home was
 * its own list -- the checks as rows (Disc, Controller, Microphone, Memory card, Server status, Discord), no Play and no
 * state dot. Superseded by LR-39 (LR.R32, the owner, 2026-10-31): the overlay's Home is the page's list, Play replaced by
 * Resume game (`./lr39OverlayHome.test.ts`); no state dot in either.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const boot = (): ConsolePage => {
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};

describe('LR-14: the overlay\'s Home list (LR.R18, superseded by LR.R32)', () => {
  it('is the page\'s list, Resume game in Play\'s place (LR-39; was: the checks, Memory card, Server status, Discord)', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    const items = homeItems('home', p.ctl.S, p.ctl.A);
    expect(items.map((x) => x.title)).toEqual(['Resume game', 'Server status', 'Discord', 'GitHub']);
    expect(items.find((x) => x.act === 'server')).toBeTruthy();
    expect(items.some((x) => x.act === 'play')).toBe(false);
    expect(items.some((x) => 'dot' in x)).toBe(false);
  });

  it('draws no state dot', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    p.render();
    expect(document.querySelector('#stage .cx-list .cx-dot, #stage .cx-list [class*="dot"]')).toBeNull();
  });

  it('the page\'s Home is LR-13\'s, the Memory card gone (LR-37 (4)); no dot on Play (LR-23, LR.R22; was: Play\'s dot)', () => {
    const p = boot();
    const items = homeItems('home', p.ctl.S, p.ctl.A);
    expect(items.map((x) => x.title)).toEqual(['Play SOCOM II', 'Server status', 'Discord', 'GitHub']);
    expect('dot' in items[0]!).toBe(false);
  });
});
