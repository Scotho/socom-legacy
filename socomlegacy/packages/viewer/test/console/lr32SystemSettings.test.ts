// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-32 (LR.R26, the owner, 2026-10-27: "Settings tab should have a SYSTEM SETTINGS ui that takes you to the nested
 * settings submenu we built"). The item has stood in the Settings tab since LR-5 / LR-16 (`homeItems('options')`, first,
 * its act `opt:display` the pushed settings screen with its tabs); LR-32 holds it: it is first in the Settings tab, opens
 * the nested submenu with its tabs, and is reachable by the keyboard alone (LR-30). Nothing was built for this row: the
 * pins are its record. A launcher adaptation, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const key = (k: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
const SETTINGS = CATS.findIndex((c) => c.id === 'options');

describe('LR-32: SYSTEM SETTINGS in the Settings tab', () => {
  it('is the Settings tab\'s first item, opening the pushed settings screen with its tabs', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const ctl = page.ctl;
    const items = homeItems('options', ctl.S, ctl.A);
    expect(items[0]).toMatchObject({ title: 'Game', act: 'opt:display' });
    ctl.S.cat = SETTINGS;
    ctl.render();
    expect(document.querySelector('#stage .cx-item')!.textContent).toContain('Game');
    ctl.doAct(items[0]!.act);
    ctl.render();
    expect(ctl.S.screen).toBe('options');
    expect(document.querySelector('.cx-tabs')).not.toBeNull();
  });
  it('a release build reaches it by the keyboard alone: A / ArrowLeft to Settings, Enter, then Escape back', () => {
    vi.stubEnv('DEV', false);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const ctl = page.ctl;
    for (let i = 0; i < 20 && ctl.S.cat !== SETTINGS; i++) key(SETTINGS > ctl.S.cat ? 'd' : 'a');
    expect(ctl.S.cat).toBe(SETTINGS);
    key('Enter');
    expect(ctl.S.screen).toBe('options');
    for (let i = 0; i < 3 && ctl.S.screen !== 'home'; i++) key('Escape');   // out of the tab's rows, then the screen
    expect(ctl.S.screen).toBe('home');
  });
});
