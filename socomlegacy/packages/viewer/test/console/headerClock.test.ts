// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { clockParts, CLOCK_TICK_MS, headerHtml } from '../../src/console/render/header';
import { mountShell } from './shell';
import { value } from './cascade';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the brand header in the artifact's drawing (`S2-Launcher-v2.dc.html`, its
 * header): the emblem and the SOCOM II / LEGACY wordmark left; at the right the date, the clock with its blinking colon,
 * the Discord mark and the account control (LP.R12) with its status dot. A browser adaptation.
 */
let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

describe('the clock\'s words', () => {
  const at = new Date(2026, 9, 26, 7, 5);
  it('24-hour (the artifact\'s default): two-digit hours and minutes', () => {
    expect(clockParts(at, true)).toMatchObject({ h: '07', m: '05', ampm: '' });
    expect(clockParts(new Date(2026, 9, 26, 19, 41), true)).toMatchObject({ h: '19', m: '41', ampm: '' });
  });
  it('12-hour: no leading zero, 12 for noon and midnight, and AM / PM after the minutes', () => {
    expect(clockParts(at, false)).toMatchObject({ h: '7', m: '05', ampm: 'AM' });
    expect(clockParts(new Date(2026, 9, 26, 0, 1), false)).toMatchObject({ h: '12', ampm: 'AM' });
    expect(clockParts(new Date(2026, 9, 26, 12, 30), false)).toMatchObject({ h: '12', ampm: 'PM' });
    expect(clockParts(new Date(2026, 9, 26, 23, 59), false)).toMatchObject({ h: '11', ampm: 'PM' });
  });
  it('the date is the player\'s locale\'s short weekday, day and month (the artifact\'s toLocaleDateString)', () => {
    expect(clockParts(at, true).date).toBe(at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
  });
});

describe('the header', () => {
  const html = (o: { mode?: 'page' | 'overlay'; signedIn?: boolean } = {}) => {
    const a = sampleAdapters();
    const signedIn = o.signedIn ?? false;
    a.session = { ...a.session, signedIn: () => signedIn };
    page = bootConsole(document, window, a, { keymap: false });
    const s = { ...page.ctl.S, mode: o.mode ?? 'page' };
    const box = document.createElement('div');
    box.innerHTML = headerHtml(s, a, false, new Date(2026, 9, 26, 21, 7));
    return box;
  };
  it('draws the date and the time between the brand and the account, the colon its own blinking part', () => {
    const h = html();
    const clock = h.querySelector('.cx-status > .cx-clock')!;
    expect(clock).not.toBeNull();
    expect(clock.querySelector('[data-clock-date]')!.textContent).toBe(clockParts(new Date(2026, 9, 26, 21, 7), true).date);
    expect(clock.querySelector('[data-clock-h]')!.textContent).toBe('21');
    expect(clock.querySelector('.cx-clock__colon')!.textContent).toBe(':');
    expect(clock.querySelector('[data-clock-m]')!.textContent).toBe('07');
    expect(clock.querySelector('time')!.getAttribute('datetime')).toBe('21:07');
    const order = [...h.querySelector('.cx-status')!.children].map((e) => e.className.split(' ')[0]);
    expect(order.indexOf('cx-clock')).toBeLessThan(order.indexOf('cx-discord'));
    expect(order.indexOf('cx-discord')).toBeLessThan(order.indexOf('cx-account-menu'));
  });
  it('the 12-hour choice adds AM / PM', () => {
    const a = sampleAdapters();
    a.options.set('clock', 1);
    page = bootConsole(document, window, a, { keymap: false });
    const box = document.createElement('div');
    box.innerHTML = headerHtml(page.ctl.S, a, false, new Date(2026, 9, 26, 21, 7));
    expect(box.querySelector('[data-clock-h]')!.textContent).toBe('9');
    expect(box.querySelector('[data-clock-m]')!.textContent).toBe('07 PM');
  });
  it('the overlay draws no clock (its header holds to one line, F-A)', () => {
    expect(html({ mode: 'overlay' }).querySelector('.cx-clock')).toBeNull();
  });
  it('the account control carries the artifact\'s status dot: lit signed in, dim signed out', () => {
    expect(html({ signedIn: true }).querySelector('.cx-player .cx-player__dot.is-on')).not.toBeNull();
    page?.dispose(); page = null; mountShell(document);
    expect(html().querySelector('.cx-player .cx-player__dot:not(.is-on)')).not.toBeNull();
  });
});

describe('the clock keeps time between draws', () => {
  it(`every ${CLOCK_TICK_MS / 1000} s its words are written again, and the tick stops with the page`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 9, 59, 50));
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    const m = () => document.querySelector('#header [data-clock-m]')!.textContent;
    expect(m()).toBe('59');
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(m()).toBe('00');
    expect(document.querySelector('#header [data-clock-h]')!.textContent).toBe('10');
    document.body.innerHTML = '';                                    // the page taken down: the tick ends
    expect(() => vi.advanceTimersByTime(CLOCK_TICK_MS)).not.toThrow();
    document.body.innerHTML = '<header id="header"><span data-clock-m></span></header>';
    vi.advanceTimersByTime(CLOCK_TICK_MS * 3);
    expect(m()).toBe('');                                            // nothing writes into a later page's header
  });
});

describe('the account pill border (artifact :37)', () => {
  const b = (sel: string) => value([sel], 'border-color', 1280) ?? value([sel], 'border', 1280);
  it('at rest the ink at 24%, and no later rule paints it otherwise; gold only on hover and with the menu open', () => {
    expect(b('.cx-header .cx-player')).toBe('1px solid color-mix(in srgb, var(--s2u-lx-ink) 24%, transparent)');
    expect(value(['.cx-header .cx-player:focus', '.cx-header .cx-player:focus-visible', '.cx-header .cx-player:focus-within'], 'border-color', 1280)).toBeNull();
    expect(b('.cx-header .cx-player:hover')).toBe('var(--s2u-lx-accent)');
    expect(b('.cx-header details[open] > .cx-player')).toBe('var(--s2u-lx-accent)');
  });
});
