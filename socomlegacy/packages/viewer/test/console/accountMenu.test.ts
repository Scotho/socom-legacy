// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { mountShell } from './shell';
import { captureLauncher } from '../../src/console/history';

let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });
const toggle = () => document.querySelector<HTMLElement>('.cx-account-menu summary')!;
const details = () => document.querySelector<HTMLDetailsElement>('.cx-account-menu details')!;
const key = (name: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event); return event;
};
const boot = (keymap = true) => {
  const a = sampleAdapters();
  let notify = () => {};
  a.onChange = (cb) => { notify = cb; return () => {}; };
  page = bootConsole(document, window, a, { keymap });
  return { ctl: page.ctl, notify: () => notify() };
};

it('the controlled account disclosure survives rendering and live adapter updates', () => {
  const { ctl, notify } = boot();
  toggle().click();
  expect(details().open).toBe(true);
  ctl.render(); notify();
  expect(details().open).toBe(true);
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(toggle().getAttribute('aria-controls')!)).not.toBeNull();
  expect(ctl.popupOpen()).toBe(true);
});

it('the account disclosure lives in the right header cluster beside Discord', () => {
  boot();
  expect(toggle().closest('.cx-status')).not.toBeNull();
  expect(document.querySelector('.cx-header__identity .cx-account-menu')).toBeNull();
});

it('the toggle closes its disclosure and restores focus', () => {
  boot(); toggle().click(); toggle().click();
  expect(details().open).toBe(false);
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle());
});

// LR-23 (LR.R22, "Start game, gone"): Home draws no START pill; the outside target is Play, whose click launches when ready
// (was: the legend's START).
const play = () => document.querySelector<HTMLElement>('#stage .cx-list [data-act="item"][data-i="0"]')!;

it('an outside click dismisses the disclosure without activating the underlying START', () => {
  const { ctl } = boot(); toggle().click();
  const outside = play();
  outside.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  outside.focus(); // browsers focus the pointer target before its click
  outside.click();
  expect(details().open).toBe(false);
  expect(ctl.S.start).toBe('idle');
});

it('Escape closes only the account disclosure, stops propagation, and restores its toggle', () => {
  const { ctl } = boot(); ctl.doAct('replays'); ctl.render(); toggle().click();
  document.querySelector<HTMLElement>('[data-act="profileitem"]')!.focus();
  const spy = vi.fn(); window.addEventListener('keydown', spy);
  const event = key('Escape', document.activeElement!);
  window.removeEventListener('keydown', spy);
  expect(event.defaultPrevented).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  expect(ctl.S.screen).toBe('replays');
  expect(details().open).toBe(false);
  expect(document.activeElement).toBe(toggle());
});

it('selecting an account row closes the disclosure and navigates once', () => {
  const { ctl } = boot(); toggle().click();
  document.querySelector<HTMLElement>('[data-act="profileitem"][data-i="1"]')!.click();
  expect(ctl.S.screen).toBe('replays');
  expect(details().open).toBe(false);
  expect(document.activeElement).toBe(toggle());
});

it.each([true, false])('global keyboard shortcuts and controller START stand down while open (keymap=%s)', (keymap) => {
  const { ctl } = boot(keymap); toggle().click();
  const before = { cat: ctl.S.cat, row: ctl.S.item[ctl.S.cat], screen: ctl.S.screen };
  for (const name of ['o', 'p', 'ArrowRight', 'Enter', ' ']) key(name);
  ctl.press('options'); ctl.press('cross'); ctl.start();
  expect({ cat: ctl.S.cat, row: ctl.S.item[ctl.S.cat], screen: ctl.S.screen }).toEqual(before);
  expect(ctl.S.start).toBe('idle');
  expect(ctl.S.overlay).toBeNull();
  expect(details().open).toBe(true);
});

it('Tab may leave the disclosure; moving focus outside closes it without stealing focus', () => {
  boot(); toggle().click();
  const outside = play();
  outside.focus();
  expect(details().open).toBe(false);
  expect(document.activeElement).toBe(outside);
});

it('a navigation, a dialog, or history travel closes ephemeral account UI', () => {
  const { ctl } = boot();
  const snap = captureLauncher(ctl.S, ctl.A);
  toggle().click(); ctl.doAct('replays'); ctl.render();
  expect(details().open).toBe(false);
  toggle().click(); ctl.openSignIn(); ctl.render();
  expect(details().open).toBe(false);
  ctl.S.overlay = null; ctl.render();
  toggle().click(); ctl.applySnap(snap);
  expect(details().open).toBe(false);
});
