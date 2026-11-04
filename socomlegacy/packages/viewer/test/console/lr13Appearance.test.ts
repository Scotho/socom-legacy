// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { prompts } from '../../src/console/render/legend';
import { THEMES } from '../../src/console/render/theme';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, type Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { optRowEls, optRowLabel, optRowValue } from './optRows';
import { mountShell } from './shell';

/**
 * LR-13, item C (LR.R16 (2), the owner, 2026-10-26T18:40Z: Appearance "both" -- "the Appearance screen lives under
 * System Settings as the artifact draws it (Theme & background a pushed panel), and Settings' third item is a drop-up
 * that changes the theme directly"). The artifact (`S2-Launcher-v2.dc.html` `rowsFor('sys-look')`: a link "Theme &
 * background" to the pushed panel `app-theme` -- the themes with their swatches and the background picture --, then the
 * Appearance toggles): Settings' Appearance tab (a tab of System Settings, as before) opens with the link, the panel
 * holds the seven themes and None / Crossroads; Circle (or the header's Back) goes back to the link. Settings' third
 * item is "Theme": its Cross opens a drop-up over it listing the seven themes with their swatches, the current one
 * checked and focused; Up / Down walk it, Cross applies the theme at once (saved in this browser), Circle closes it; the
 * mouse clicks an option. The tab order and the keys are unchanged. A browser adaptation: the launcher's look.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
function boot(close?: () => void) {
  const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true, ...(close ? { close, mode: 'overlay' as const } : {}) });
  page.ctl.S.input = 'pad';
  page.render();
  return { ctl: page.ctl, options };
}
const flush = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(0); };
const SETTINGS = CATS.findIndex((c) => c.id === 'options');
const labels = (): string[] => optRowEls().map(optRowLabel);
const title = (): string => document.querySelector('#stage h1.cx-title')!.textContent ?? '';
const focusRow = (label: string): void => { page!.ctl.S.opt.row = labels().indexOf(label); page!.render(); };
const said = (): [string, string][] => prompts(page!.ctl.S, page!.ctl.A).map((p) => [p.k, p.label]);
const toTheme = (): void => {
  const { ctl } = page!;
  ctl.S.cat = SETTINGS;
  ctl.S.item[SETTINGS] = homeItems('options', ctl.S, ctl.A).findIndex((x) => x.act === 'themes');
  page!.render();
};
const dropup = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-dropup');
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage .cx-dropup [role="option"]')];

describe('LR-13 C: Appearance under System Settings, Theme & background its pushed panel', () => {
  it('the tabs keep their order; Appearance opens on the link to Theme & background, its words the theme and the picture', () => {
    const { ctl, options: opts } = boot();
    expect(opts.categories().map((c) => c.id)).toEqual(['display', 'app', 'appearance', 'audio', 'controller', 'communication', 'account']);
    ctl.doAct('opt:appearance');
    page!.render();
    expect(title()).toBe('Appearance');
    expect(labels().slice(0, 5)).toEqual(['Theme & background', 'Backdrop motion', 'Clock', 'Launcher sounds', 'Launcher sound volume']);
    const link = optRowEls()[0]!;
    expect(link.classList.contains('cx-r--link')).toBe(true);
    expect(optRowValue(link)).toBe('Navy & Gold · Wave only');
  });

  it('Cross on the link pushes the panel: the seven themes, then None and Crossroads; no tabs; the crumb names Appearance', () => {
    const { ctl } = boot();
    ctl.doAct('opt:appearance');
    ctl.press('cross');
    expect(ctl.S.opt.panel).toBe('theme');
    expect(title()).toBe('Theme & background');
    expect(document.querySelector('#stage .cx-crumb')!.textContent).toContain('Appearance');
    expect(document.querySelector('#stage .cx-tabs')).toBeNull();
    expect(labels()).toEqual([...THEMES.map((t) => t.label), 'None', 'Crossroads']);
    expect(document.querySelectorAll('#stage .cx-r[role="heading"]')).toHaveLength(2);   // Theme, Background picture
  });

  it('in the panel Cross picks (applied and saved at once); L1 / R1 stay put; Circle goes back to the link', async () => {
    const { ctl, options: opts } = boot();
    ctl.doAct('opt:appearance');
    ctl.press('cross');
    focusRow('Frost');
    ctl.press('cross');
    await flush();
    expect(opts.value('theme')).toBe(THEMES.findIndex((t) => t.label === 'Frost'));
    expect(optRowEls().find((r) => optRowLabel(r) === 'Frost')!.getAttribute('aria-checked')).toBe('true');
    expect(ctl.S.toast).toBe('Theme: Frost');
    ctl.press('r1');
    expect(ctl.S.opt.panel).toBe('theme');
    ctl.press('circle');
    expect(ctl.S.opt.panel).toBeUndefined();
    expect(title()).toBe('Appearance');
    expect(labels()[ctl.S.opt.row]).toBe('Theme & background');
    expect(optRowValue(optRowEls()[0]!)).toBe('Frost · Wave only');
  });

  it('the header\'s Back leaves the panel for Appearance, as Circle does', () => {
    const { ctl } = boot();
    ctl.doAct('opt:appearance');
    ctl.press('cross');
    ctl.pointer('press', { b: 'circle', fk: 'back' });
    expect(ctl.S.screen).toBe('options');
    expect(ctl.S.opt.panel).toBeUndefined();
    expect(title()).toBe('Appearance');
  });
});

describe('LR-13 C: Settings\' third item, the theme drop-up', () => {
  it('Settings lists System Settings, App, Theme; Theme says the current theme', () => {
    const { ctl } = boot();
    const items = homeItems('options', ctl.S, ctl.A);
    expect(items.map((x) => x.title)).toEqual(['Game', 'Launcher', 'Theme']);
    expect(items[2]).toMatchObject({ icon: 'palette', act: 'themes', sub: 'Navy & Gold' });
  });

  it('Cross opens it over the item: the seven themes with their three swatches, the current one checked and focused', () => {
    const { ctl } = boot();
    toTheme();
    expect(dropup()).toBeNull();
    ctl.press('cross');
    expect(ctl.S.thm.open).toBe(true);
    expect(dropup()).not.toBeNull();
    expect(dropup()!.closest('li')!.querySelector('.cx-item__title')!.textContent).toBe('Theme');
    expect(options().map((o) => o.querySelector('.cx-dropup__label')!.textContent)).toEqual(THEMES.map((t) => t.label));
    for (const o of options()) expect(o.querySelectorAll('.cx-r__swatch')).toHaveLength(3);
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(THEMES.map((_, i) => String(i === 0)));
    expect(options()[0]!.classList.contains('is-focused')).toBe(true);
    expect(document.querySelectorAll('#stage .is-focused')).toHaveLength(1);
    expect(said()).toEqual([['cross', 'Choose'], ['circle', 'Close']]);
  });

  it('Up / Down walk it, Cross applies the theme at once and closes it; the item says the new theme', async () => {
    const { ctl, options: opts } = boot();
    toTheme();
    ctl.press('cross');
    ctl.press('down'); ctl.press('down');
    expect(options()[2]!.classList.contains('is-focused')).toBe(true);
    ctl.press('up');
    ctl.press('cross');
    await flush();
    expect(opts.value('theme')).toBe(1);
    expect(ctl.S.thm.open).toBe(false);
    expect(dropup()).toBeNull();
    expect(homeItems('options', ctl.S, ctl.A)[2]!.sub).toBe(THEMES[1]!.label);
    expect(localStorage.getItem('s2u.console.v1.theme')).toBe('1');
  });

  it('Circle closes it with nothing changed; the ends are kept', () => {
    const { ctl, options: opts } = boot();
    toTheme();
    ctl.press('cross');
    ctl.press('up');
    expect(options()[0]!.classList.contains('is-focused')).toBe(true);
    for (let k = 0; k < 9; k++) ctl.press('down');
    expect(options()[THEMES.length - 1]!.classList.contains('is-focused')).toBe(true);
    ctl.press('circle');
    expect(ctl.S.thm.open).toBe(false);
    expect(opts.value('theme')).toBe(0);
    expect(ctl.S.screen).toBe('home');
  });

  it('over a game (the overlay), Circle on the open drop-up closes the drop-up only: it stays in Settings, the game not asked for', () => {
    const close = vi.fn();
    const { ctl } = boot(close);
    expect(ctl.S.mode).toBe('overlay');
    toTheme();
    ctl.press('cross');
    expect(ctl.S.thm.open).toBe(true);
    ctl.press('circle');
    expect(ctl.S.thm.open).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(ctl.S.screen).toBe('home');
    expect(ctl.S.cat).toBe(SETTINGS);
    ctl.press('circle');                                                  // nothing open now: the way back to the game
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('the mouse: a click on the item opens and closes it; a click on an option applies it', async () => {
    const { ctl, options: opts } = boot();
    toTheme();
    const item = (): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-list [data-act="item"][data-i="${ctl.S.item[SETTINGS]}"]`)!;
    item().click();
    expect(dropup()).not.toBeNull();
    item().click();
    expect(dropup()).toBeNull();
    item().click();
    options()[4]!.click();
    await flush();
    expect(opts.value('theme')).toBe(4);
    expect(dropup()).toBeNull();
  });
});
