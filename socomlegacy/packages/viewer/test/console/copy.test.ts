// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { keyCounts, liveControls } from '../../src/console/adapters/controls';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { prompts } from '../../src/console/render/legend';
import { CATS, type Adapters } from '../../src/console/state';
import { cardOptionStore } from '../../src/modern/settings/store';
import { mountShell } from './shell';

/**
 * The slice-2 review's content findings (CX.R5: "Counts, names, maps, modes and pings come from the lobby server;
 * persona and slot from the memory card"; no word the server or the emulator does not support): the signed-in Profile
 * is the session's persona, the card's line beside it; the loadouts are kept with the account on the server
 * (`/lobby/loadout`, sign-in needed), not on the card; the service record says what `/modern/account` holds; no "this
 * week" the server never reports; the Vibration row's line has no invented behaviour. A browser adaptation (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

function boot(over: Partial<Adapters> = {}) {
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, ...over } as Adapters, { keymap: true });
  return page.ctl;
}
const items = (): { title: string; sub: string }[] => [...document.querySelectorAll('#stage .cx-item')].map((e) => ({
  title: e.querySelector('.cx-item__title')!.textContent!, sub: e.querySelector('.cx-item__sub')!.textContent!,
}));
/**
 * LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone"): the launcher page draws no
 * readout; since LR-39 (LR.R32) the overlay over a game draws none either (LR.R18's), so the readout is drawn nowhere and
 * `readoutHtml` is removed: what it said is read where it is drawn now (the header's player card, the stage). Was: the
 * page's drawn `.cx-readout`, then `readoutHtml`'s words.
 */
const to = (ctl: ConsolePage['ctl'], cat: number): void => {
  const steps = Math.abs(cat - ctl.S.cat);
  const direction = cat > ctl.S.cat ? 'r1' : 'l1';
  for (let i = 0; i < steps; i++) ctl.press(direction);
};

describe('the slice-2 review: what the page says', () => {
  it('Profile signed in: the session persona, the card line beside it', () => {
    const s = sampleAdapters();
    const ctl = boot({
      session: { ...s.session, persona: () => 'NIGHTOWL' },
      card: { ...s.card, persona: () => 'RANGER7', personas: () => 2, names: () => ['RANGER7', 'NIGHTOWL'] },
    });
    to(ctl, CATS.findIndex((c) => c.id === 'profile'));
    expect(items()[3]).toEqual({ title: 'Profiles', sub: 'Slot 1 \u00b7 2 personas \u00b7 RANGER7' });
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect(document.querySelector('#header .cx-player__name')!.textContent).toBe('NIGHTOWL');   // the session's persona
  });

  it('Play online says no unsourced line ("No recent matches on this persona." is gone; no readout is drawn)', () => {
    const ctl = boot();
    to(ctl, 1);
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect(document.querySelector('#stage')!.textContent).not.toContain('No recent matches');
  });

  it('START needs a supported input as the setup page does: refused with its words, Play\'s Cross says the controller is needed', () => {
    const ctl = boot({ controls: { ready: () => false, line: () => 'Controller needed', reason: () => 'Connect a controller to start.' } });
    // LR-23 (LR.R22): no readout and no START pill on Home (was: the readout's "Controller needed" and START not ready);
    // Play's Cross names the need, its line says it.
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect(document.querySelector('#legend .cx-start')).toBeNull();
    expect(prompts(ctl.S, ctl.A).find((x) => x.k === 'cross')?.label).toBe('Play SOCOM II: controller needed');
    expect(items()[0]).toEqual({ title: 'Play SOCOM II', sub: 'Controller needed' });
    expect(document.querySelector('#stage')!.textContent).not.toContain('Keyboard ready');
    ctl.press('options');
    expect(ctl.S.legendError).toBe('Connect a controller to start.');
    expect(ctl.S.start).toBe('idle');
  });

  it('the live controls: a standard pad, a touch screen, or a key pressed in a development build; else Connect a controller', () => {
    // `keyboard` is a caller-forced keyboard (`liveControls`); the live page marks one with `note` on every build.
    const c = (pad: boolean, touch: boolean, keyboard: boolean) => liveControls({ connected: () => pad }, { touch: () => touch, keyboard: () => keyboard });
    expect([c(true, false, false).ready(), c(true, false, false).line()]).toEqual([true, 'Controller connected']);
    expect([c(false, true, false).ready(), c(false, true, false).line()]).toEqual([true, 'Touch ready']);
    expect([c(false, false, true).ready(), c(false, false, true).line()]).toEqual([true, 'Keyboard ready']);
    expect([c(false, false, false).ready(), c(false, false, false).line(), c(false, false, false).reason()]).toEqual([false, 'Controller needed', 'Connect a controller to start.']);
  });

  it('a modifier key alone does not count as the keyboard (startup.ts: Shift, Control, Alt, Meta, CapsLock, AltGraph, Fn)', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn']) expect(keyCounts(key), key).toBe(false);
    for (const key of ['a', 'Enter', 'ArrowUp', ' ', 'Escape']) expect(keyCounts(key), key).toBe(true);
  });

  it('the service record says what the account holds', () => {
    const ctl = boot();
    to(ctl, CATS.findIndex((c) => c.id === 'profile'));
    expect(items()[0]).toEqual({ title: 'Service record', sub: 'Your career on this server' });
  });

  it('the loadouts are kept with the account: signed out they ask for the sign-in; never "from your memory card"', () => {
    const s = sampleAdapters();
    const ctl = boot({ session: { ...s.session, signedIn: () => false } });
    to(ctl, CATS.findIndex((c) => c.id === 'profile'));
    expect(items().find((i) => i.title === 'Loadouts')).toEqual({ title: 'Loadouts', sub: 'Choose a side, then a mission' });
  });

  // LR-37 (6): the Server news row is gone (its news is the Server screen's); no row of Play online says "this week".
  it('Play online says no "this week" (the Server news row gone, LR-37)', () => {
    const ctl = boot();
    to(ctl, CATS.findIndex((c) => c.id === 'online'));
    expect(items().map((i) => i.title)).not.toContain('Server news');
    expect(items().map((i) => `${i.title} ${i.sub}`).join(' ')).not.toMatch(/this week/i);
  });

  it('the LaunchScreen Back is the design word, Back to launcher, with the sample adapters too (no Prototype: prefix)', async () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.press('options');
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelector('#overlay .cx-launch__back')!.textContent!.trim()).toBe('Back to launcher');
  });

  it('the Vibration row says only what the setting is', () => {
    const m = new Map<string, string>();
    const slots = new CardSlots(() => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }) as unknown as Storage, () => undefined, { now: () => 1 });
    const options = liveOptions(() => {}, { store: cardOptionStore(slots), signedIn: () => false, pads: () => [], launcher: { disc: () => 'empty', isoInserted: () => false, filename: () => null, onChange: () => () => {} } });
    const rows = options.categories().flatMap((c) => c.rows);
    expect(rows.find((r) => r.id === 'VIBRATION_CONTROLLER')!.about).toBe('Vibration on or off, where your controller has it.');
    expect(rows.map((r) => r.about).join(' ')).not.toMatch(/fire and take hits/);
  });
});
