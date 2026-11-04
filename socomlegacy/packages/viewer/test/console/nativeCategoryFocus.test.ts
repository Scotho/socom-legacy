// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS } from '../../src/console/state';
import { mountShell } from './shell';

let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });
const category = (i: number) => document.querySelector<HTMLButtonElement>(`.cx-cat[data-i="${i}"]`)!;

it.each([false, true])('native category focus selects and retains each Tab stop (keymap=%s)', (keymap) => {
  page = bootConsole(document, window, sampleAdapters(), { keymap });
  const { ctl } = page;
  ctl.S.input = 'pad'; ctl.render();
  for (let i = 0; i < CATS.length; i++) {
    category(i).focus();
    expect(ctl.S.cat).toBe(i);
    expect(category(i).getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(category(i));
    expect(category(i).tabIndex).toBe(0);
    ctl.render();
    expect(document.activeElement).toBe(category(i));
  }
});

it('Enter and Space on a category retain native button activation in development', () => {
  page = bootConsole(document, window, sampleAdapters(), { keymap: true });
  const { ctl } = page;
  const home = CATS.findIndex((c) => c.id === 'home');
  ctl.S.item[home] = 2; ctl.render(); // Microphone: Cross here would toggle it.
  category(home).focus();
  const mic = ctl.A.mic.on();
  for (const key of ['Enter', ' ']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    category(home).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(ctl.A.mic.on()).toBe(mic);
  }
});
