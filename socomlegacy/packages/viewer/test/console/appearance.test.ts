// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { CONSOLE_KEYS, THEME_TRIM, liveOptions } from '../../src/console/adapters/options';
import { BACKDROP_URL } from '../../src/console/backdrop';
import { THEMES, hex } from '../../src/console/render/theme';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { homeItems, type Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { optRowEls, optRowLabel, optRowValue } from './optRows';
import { mountShell } from './shell';

/**
 * LR-5 (the launcher redesign plan, the row "Settings"; LR.R8, LR.R14): Appearance, new -- Settings' third item and its
 * own tab after App: the artifact's "Theme & background" panel (its seven themes as picks with their three swatches, its
 * background picture None / Crossroads) and its "Appearance" rows, the launcher's existing ones moved here (Backdrop
 * motion from App, Launcher sounds and Launcher sound volume from Audio: their keys and defaults kept) and the 24-hour
 * clock. Each saves in this browser (`s2u.console.v1.*`) and the shell reads it at the next draw (`render/theme.ts`: the
 * option ids `theme`, `backdrop`, `clock`). A browser adaptation: the launcher's look, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
const live = () => liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false });
function boot() {
  const options = live();
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  return { ctl: page.ctl, options };
}
const open = (): void => { page!.ctl.doAct('opt:appearance'); page!.render(); };
/** LR-13 (LR.R16 (2)): the themes and pictures are the "Theme & background" panel's, pushed from Appearance's first row. */
const openPanel = (): void => { open(); page!.ctl.press('cross'); page!.render(); };
const row = (label: string): HTMLElement => optRowEls().find((r) => optRowLabel(r) === label)!;
const at = (label: string): number => optRowEls().findIndex((r) => optRowLabel(r) === label);
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };   // the action's answer

describe('LR-5: Appearance', () => {
  it('its own tab after App (System Settings\' tabs); Settings\' third item is the Theme drop-up since LR-13 (LR.R16 (2))', () => {
    const { ctl, options } = boot();
    const items = homeItems('options', ctl.S, ctl.A);
    expect(items.map((x) => x.title)).toEqual(['Game', 'Launcher', 'Theme']);
    expect(items[2]).toMatchObject({ icon: 'palette', act: 'themes' });
    expect(options.categories().map((c) => c.id)).toEqual(['display', 'app', 'appearance', 'audio', 'controller', 'communication', 'account']);
    open();
    expect(ctl.S.screen).toBe('options');
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Appearance');
  });

  it('the sample adapters have the group too: the Appearance tab, its link, and the panel\'s picks (review-lr-5 F3; LR-13)', async () => {
    const sample = sampleAdapters();
    page = bootConsole(document, window, sample, { keymap: true });
    page.ctl.doAct('opt:appearance');
    page.render();
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Appearance');
    expect(optRowEls().map(optRowLabel)).toEqual(['Theme & background', 'Backdrop motion', 'Clock', 'Launcher sounds', 'Launcher sound volume']);
    page.ctl.press('cross');
    expect(optRowEls().map(optRowLabel)).toEqual([...THEMES.map((t) => t.label), 'None', 'Crossroads']);
    expect(row('Navy & Gold').getAttribute('aria-checked')).toBe('true');
    page.ctl.S.opt.row = at('Frost');
    page.ctl.press('cross');
    await flush();
    expect(row('Frost').getAttribute('aria-checked')).toBe('true');
    expect(row('Navy & Gold').getAttribute('aria-checked')).toBe('false');
  });

  it('its rows: the link to Theme & background (LR-13), then the moved rows and the clock; the panel\'s headers drawn, never a stop', () => {
    const { options } = boot();
    const rows = options.categories().find((c) => c.id === 'appearance')!.rows;
    expect(rows.map((r) => r.label).slice(0, 5)).toEqual(['Theme & background', 'Backdrop motion', 'Clock', 'Launcher sounds', 'Launcher sound volume']);
    open();
    expect(optRowEls().map(optRowLabel)).toEqual(rows.map((r) => r.label));
    expect(options.panel!('theme')!.rows.map((r) => r.label)).toEqual([...THEMES.map((t) => t.label), 'None', 'Crossroads']);
    page!.ctl.press('cross');
    const heads = [...document.querySelectorAll<HTMLElement>('#stage [data-key="options"] .cx-r--header')];
    expect(heads.map((h) => h.textContent)).toEqual(['Theme', 'Background picture']);
    for (const h of heads) expect(h.hasAttribute('data-act')).toBe(false);
    expect(options.categories().find((c) => c.id === 'app')!.rows.map((r) => r.id)).not.toContain('drift');
    expect(options.categories().find((c) => c.id === 'audio')!.rows.map((r) => r.id)).not.toContain('sounds');
    expect(options.categories().find((c) => c.id === 'audio')!.rows.map((r) => r.id)).not.toContain('soundVolume');
  });

  it('a theme is a pick with the artifact\'s note and three swatches (the sky, the sheets, the gold trim or the glow); the default picked', () => {
    boot();
    openPanel();
    for (const [i, t] of THEMES.entries()) {
      const r = row(t.label);
      expect(r.classList.contains('cx-r--pick')).toBe(true);
      expect(r.getAttribute('role')).toBe('radio');
      expect(r.getAttribute('aria-checked')).toBe(String(i === 0));
      expect(r.querySelector('.cx-r__hint')!.textContent).toBe(t.note);
      const sw = [...r.querySelectorAll<HTMLElement>('.cx-r__swatch')].map((s) => s.getAttribute('style'));
      expect(sw).toEqual([t.top, hex(t.sheet), t.gold ? THEME_TRIM : hex(t.glow)].map((c) => `background: ${c}`));
    }
    const base = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/ds/base.css'), 'utf-8');
    expect(base).toContain(`--s2u-lx-accent: ${THEME_TRIM};`);         // the trim is the artifact's gold, LR.R14's token
  });

  it('Cross on a theme picks it: saved in this browser, the root\'s theme mark set at the draw, the toast says it', async () => {
    const { ctl, options } = boot();
    openPanel();
    ctl.S.opt.row = at('Jungle');
    ctl.press('cross');
    await flush();
    expect(localStorage.getItem(CONSOLE_KEYS.theme)).toBe('4');
    expect(options.value('theme')).toBe(4);
    expect(ctl.S.toast).toBe('Theme: Jungle');
    expect(document.documentElement.dataset['s2uTheme']).toBe('jungle');
    expect(row('Jungle').getAttribute('aria-checked')).toBe('true');
    expect(row('Navy & Gold').getAttribute('aria-checked')).toBe('false');
    expect(live().value('theme')).toBe(4);                              // read back by a fresh adapter: this browser keeps it
  });

  it('a click on Crossroads picks the picture (its thumbnail the project\'s art); None is the default', async () => {
    const { ctl, options } = boot();
    openPanel();
    expect(row('None').getAttribute('aria-checked')).toBe('true');
    const cross = row('Crossroads');
    expect(cross.querySelector('.cx-r__hint')!.textContent).toBe('Darkened behind the wave');
    expect(cross.querySelector<HTMLElement>('.cx-r__thumb-pic')!.getAttribute('style')).toContain(BACKDROP_URL);
    cross.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(options.value('backdrop')).toBe(1);
    expect(localStorage.getItem(CONSOLE_KEYS.backdrop)).toBe('1');
    expect(ctl.S.toast).toBe('Background: Crossroads');
    expect(row('Crossroads').getAttribute('aria-checked')).toBe('true');
  });

  it('the clock: 24-hour by default, 12-hour by a step; saved in this browser', () => {
    const { ctl, options } = boot();
    open();
    expect(optRowValue(row('Clock'))).toBe('24-hour');
    ctl.S.opt.row = at('Clock');
    ctl.press('right');
    expect(options.value('clock')).toBe(1);
    expect(localStorage.getItem(CONSOLE_KEYS.clock)).toBe('1');
    expect(optRowValue(row('Clock'))).toBe('12-hour');
  });

  it('the moved rows keep their keys, values and defaults: Backdrop motion On (LR-37), Launcher sounds On, its volume 70%', () => {
    const { options } = boot();
    open();
    expect(optRowValue(row('Backdrop motion'))).toBe('On');
    expect(optRowValue(row('Launcher sounds'))).toBe('On');
    expect(optRowValue(row('Launcher sound volume'))).toBe('70%');
    const rows = options.categories().find((c) => c.id === 'appearance')!.rows;
    expect(rows.find((r) => r.id === 'drift')!.def).toBe(1);
    expect(rows.find((r) => r.id === 'sounds')!.def).toBe(1);
    expect(rows.find((r) => r.id === 'soundVolume')!.def).toBe(7);
    options.step!('drift', -1);
    expect(localStorage.getItem(CONSOLE_KEYS.drift)).toBe('0');
  });

  it('Circle from the Appearance tab returns to Settings on Launcher, the door for that family', () => {
    const { ctl } = boot();
    open();
    ctl.press('circle');                                                // the rows to the tabs
    expect(ctl.S.opt.zone).toBe('cats');
    ctl.press('circle');                                                // the tabs to Settings' list
    expect(ctl.S.screen).toBe('home');
    expect(ctl.S.item[ctl.S.cat]).toBe(1);
    expect(homeItems('options', ctl.S, ctl.A)[1]?.title).toBe('Launcher');
  });
});
