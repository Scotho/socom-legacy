// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { resetStreamerCache, setStreamerMode, streamerModeOn } from '../../src/streamerMode';
import { mountShell } from './shell';

/**
 * STREAMER-P1 slice 1 (a browser adaptation): on the launcher page, Ctrl+Shift+S toggles Streamer mode, the launcher's
 * own toast says it, and the header's tag follows -- also when the mode is changed elsewhere (the Options row).
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); resetStreamerCache(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); resetStreamerCache(); });

const boot = (): ConsolePage => {
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined } as Adapters, { keymap: true });
  return page;
};
const chord = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); };
const tag = (): Element | null => document.querySelector('#header [data-streamer-tag]');

describe('STREAMER-P1: the launcher page', () => {
  it('the chord turns it on: the toast says so and the header carries the tag; again turns it off', () => {
    const p = boot();
    expect(tag()).toBeNull();
    chord();
    expect(streamerModeOn()).toBe(true);
    expect(p.ctl.S.toast).toBe('Streamer mode on');
    expect(tag()).not.toBeNull();
    chord();
    expect(streamerModeOn()).toBe(false);
    expect(p.ctl.S.toast).toBe('Streamer mode off');
    expect(tag()).toBeNull();
  });

  it('a change made elsewhere redraws the header', () => {
    boot();
    setStreamerMode(true);
    expect(tag()).not.toBeNull();
  });

  it('after dispose the chord does nothing here', () => {
    boot().dispose();
    page = null;
    chord();
    expect(streamerModeOn()).toBe(false);
  });
});

describe('STREAMER-P1: the game page (pageEntry)', () => {
  it('the page booted answers the chord with its own toast', async () => {
    const { bootPage } = await import('../../src/pageEntry');
    const { STREAMER_TOAST_ID } = await import('../../src/streamerMode');
    document.body.innerHTML = '';
    const mount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    await bootPage('/?devmode', document, { main: async () => {}, frontEnd: async () => ({ mountFrontEnd: () => mount }) } as never);
    chord();
    expect(streamerModeOn()).toBe(true);
    expect(document.getElementById(STREAMER_TOAST_ID)!.textContent).toBe('Streamer mode on');
    chord();                                               // leave it off for the next file's test
    expect(streamerModeOn()).toBe(false);
  });
});

describe('STREAMER-P1: a page booted twice in one window (the slice 1 re-check’s test gap)', () => {
  it('one press is still one toggle and one toast: the window took the page’s toast once', async () => {
    const { bootPage } = await import('../../src/pageEntry');
    const { STREAMER_TOAST_ID } = await import('../../src/streamerMode');
    document.body.innerHTML = '';
    const mount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
    const loaders = { main: async () => {}, frontEnd: async () => ({ mountFrontEnd: () => mount }) } as never;
    await bootPage('/?devmode', document, loaders);
    await bootPage('/?devmode', document, loaders);
    chord();
    expect(streamerModeOn()).toBe(true);
    expect(document.querySelectorAll(`#${STREAMER_TOAST_ID}`)).toHaveLength(1);
    chord();
    expect(streamerModeOn()).toBe(false);
  });
});
