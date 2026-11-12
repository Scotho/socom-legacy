// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { remapAdapter } from '../../src/console/adapters/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { homeItems, REMAP_ROW, type Adapters, type OptCat } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import type { LauncherState } from '../../src/modern/launcherState';
import { optRowEls, optRowLabel } from './optRows';
import { mountShell } from './shell';

/**
 * LATER 294, layout A, the first player-visible slice (Dustin, 2026-10-28): Settings opens on Game or Launcher,
 * Controller is the first Launcher tab, and that tab leads with the device, the browser dead zone, Button mapping
 * and Stance. Ids, keys and what a row writes stay as they were.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });

function boot(o: { touch?: boolean } = {}) {
  let zone = 0.15;
  const pad = {
    connected: () => true,
    deadZone: () => zone,
    setDeadZone(v: number) { zone = v; },
    select() {},
    read: () => [],
    setConnected() {},
  };
  const options = liveOptions(() => { page?.render(); }, {
    launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => o.touch ?? false, pad: pad as never,
  });
  const sample = sampleAdapters();
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => [] }, now: () => 0, holdMs: 0 }));
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, remap, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  return { ctl: page.ctl, options, zone: () => zone };
}

const tabs = (): string[] => [...document.querySelectorAll('#stage .cx-tab__label')].map((e) => e.textContent ?? '');
const cat = (options: { categories(): readonly OptCat[] }, id: string) => options.categories().find((c) => c.id === id)!;

describe('LATER 294: Game and Launcher', () => {
  it('the Settings list is Game, then Launcher, and the Theme drop-up stays', () => {
    const { ctl } = boot();
    expect(homeItems('options', ctl.S, ctl.A).map((x) => ({ title: x.title, act: x.act }))).toEqual([
      { title: 'Game', act: 'opt:display' },
      { title: 'Launcher', act: 'opt:controller' },
      { title: 'Theme', act: 'themes' },
    ]);
  });

  it('Game shows Display, Audio and Communication, and L1 stays inside that set', () => {
    const { ctl } = boot();
    ctl.doAct('opt:display');
    page!.render();
    expect(tabs()).toEqual(['Display', 'Audio', 'Communication']);
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Display');
    ctl.press('l1');
    page!.render();
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Communication');
    expect(tabs()).toEqual(['Display', 'Audio', 'Communication']);
  });

  it('Launcher opens on Controller, the Stance mode its first row (STANCE-TOP), then the device, dead zone and Button mapping (STM.R1)', () => {
    const { ctl, options } = boot();
    ctl.doAct('opt:controller');
    page!.render();
    expect(tabs()).toEqual(['Controller', 'Appearance', 'App', 'Account']);
    // STANCE-TOP (the owner, 2026-11-02: "move stance mode to the top"): the Stance mode is the tab's first row.
    expect(optRowEls().map(optRowLabel).slice(0, 4)).toEqual(['Stance mode', 'Controller', 'Pad dead zone (this browser)', 'Button mapping']);   // SS-1 D2
    const ids = cat(options, 'controller').rows.map((r) => r.id);
    expect(ids[0]).toBe('stance-mode');                 // STM-1: offered again (OBF-11 retired); STANCE-TOP: first
    expect(ids.slice(1, 4)).toEqual(['pad-device', 'pad-dead', REMAP_ROW]);
    expect(ids).toContain('VIBRATION_CONTROLLER');
        expect(cat(options, 'display').rows.map((r) => r.id)).toContain('detail-distance');
    expect(cat(options, 'communication').rows.map((r) => r.id)).toEqual(['EnableExternalWhispers', 'mic-on', 'mic-device']);
  });

  it('R1 from Controller moves to Appearance, not into the game tabs', () => {
    const { ctl } = boot();
    ctl.doAct('opt:controller');
    ctl.press('r1');
    page!.render();
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Appearance');
    expect(tabs()[0]).toBe('Controller');
  });

  it('Button mapping still opens the remap screen, and the browser dead zone still writes and reads back', () => {
    const { ctl, options, zone } = boot();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = cat(options, 'controller').rows.findIndex((r) => r.id === REMAP_ROW);
    ctl.press('cross');
    expect(ctl.S.screen).toBe('remap');
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Button mapping');
    ctl.press('circle');
    expect(ctl.S.screen).toBe('options');
    expect(cat(options, 'controller').rows[ctl.S.opt.row]?.id).toBe(REMAP_ROW);
    expect(options.value('pad-dead')).toBe(15);
    options.set('pad-dead', 22);
    expect(zone()).toBeCloseTo(0.22);
    expect(options.value('pad-dead')).toBe(22);
  });

  it('Mobile stays a Launcher tab, and only when the browser has touch', () => {
    const off = boot({ touch: false });
    off.ctl.doAct('opt:controller');
    page!.render();
    expect(tabs()).not.toContain('Mobile');
    page!.dispose(); page = null; mountShell(document);
    const on = boot({ touch: true });
    on.ctl.doAct('opt:display');
    page!.render();
    expect(tabs()).not.toContain('Mobile');
    on.ctl.doAct('opt:controller');
    page!.render();
    expect(tabs().at(-1)).toBe('Mobile');
  });
});
