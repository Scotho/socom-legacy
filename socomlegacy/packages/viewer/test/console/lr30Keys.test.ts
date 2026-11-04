// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { MENU_KEYMAP } from '../../src/console/input';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-30 (LR.R24, the owner, 2026-10-27: "make wasd work and arrow keys for menu nav"; "yes keyboard menu nav can reach
 * release builds"): WASD and the arrows move as the pad's stick / d-pad, Enter and Space are Cross, Escape and Backspace
 * the back button, on every build -- never the game's keys (OT.R29 untouched), and not over a game (the overlay).
 * (LR.R24 (a) names Triangle; the legend's back is Circle, which Escape / Backspace press.) A launcher adaptation.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const key = (k: string, init: KeyboardEventInit = {}): boolean => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
};
/** A release build (DEV folded away) with no dev keymap, or a development build with it. */
const boot = (release: boolean, mode?: 'overlay'): ConsolePage => {
  vi.stubEnv('DEV', !release);
  page = bootConsole(document, window, sampleAdapters(), { keymap: !release, ...(mode ? { mode } : {}) });
  return page;
};

describe('LR-30: the menu keys', () => {
  it('the map: WASD and the arrows, Enter / Space Cross, Escape / Backspace back', () => {
    expect(MENU_KEYMAP).toEqual({
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
      Enter: 'cross', ' ': 'cross', Escape: 'circle', Backspace: 'circle',
    });
  });
  for (const release of [true, false]) {
    const build = release ? 'a release build' : 'a development build';
    it(`${build}: D / ArrowRight and A / ArrowLeft step the rail, as the pad's d-pad`, () => {
      const p = boot(release);
      expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
      expect(key('d')).toBe(true);
      expect(p.ctl.S.cat).toBe(HOME_CATEGORY + 1);
      key('ArrowLeft');
      expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
      key('a');
      expect(p.ctl.S.cat).toBe(HOME_CATEGORY - 1);
      key('ArrowRight');
      expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
    });
    it(`${build}: S / ArrowDown and W / ArrowUp move the list's focus`, () => {
      const p = boot(release);
      const at = (): number => p.ctl.S.item[HOME_CATEGORY]!;
      expect(at()).toBe(0);
      key('s');
      expect(at()).toBe(1);
      key('ArrowDown');
      expect(at()).toBe(2);
      key('w');
      expect(at()).toBe(1);
      key('ArrowUp');
      expect(at()).toBe(0);
    });
    it(`${build}: Enter is Cross (opens the focused row), Escape goes back`, () => {
      const p = boot(release);
      key('d');
      key('Enter');                                                    // Online's first row: the rooms
      expect(p.ctl.S.screen).toBe('rooms');
      key('Escape');
      expect(p.ctl.S.screen).toBe('home');
    });
  }
  it('a release build: the dev map\'s other keys (q, e, f, t, z, c) are not menu keys', () => {
    const p = boot(true);
    for (const k of ['q', 'e', 'f', 't', 'z', 'c']) expect(key(k), k).toBe(false);
    expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
  });
  it('a release build: a modified key and a held Enter (Cross does not repeat) are not read', () => {
    const p = boot(true);
    expect(key('d', { ctrlKey: true })).toBe(false);
    expect(key('d', { metaKey: true })).toBe(false);
    expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
    key('Enter', { repeat: true });
    expect(p.ctl.S.start).toBe('idle');
  });
  it('over a game (the overlay) no menu key is read and its default is left alone', () => {
    const p = boot(true, 'overlay');
    for (const k of ['w', 'a', 's', 'd', 'ArrowRight']) expect(key(k), k).toBe(false);
    expect(p.ctl.S.cat).toBe(HOME_CATEGORY);
  });
});
