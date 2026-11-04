// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routePlan } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { gamePage, liveLaunch } from '../../src/console/adapters/launch';
import { ARMING_MS } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { LAUNCH_PADSET_ROW, LAUNCH_SKIP_ROW, type Adapters, type LaunchPage } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import { SKIP_MENU_KEY, SKIP_MENU_ROW, SKIP_MENU_SEGMENTS, setSkipMenu, skipMenuOn } from '../../src/console/skipMenu';
import { liveOptions } from '../../src/console/adapters/options';
import type { LauncherState } from '../../src/modern/launcherState';
import { optRowEls, optRowLabel, optRowValue } from './optRows';
import { publishDisc } from '../../src/modern/discStore';
import type { ModernSession } from '../../src/modern/session';
import { mountShell } from './shell';

/**
 * SKIP-MENU (LR.R33, the owner, 2026-10-31: "in the before you deploy UI, please add a "skip menu" checkbox in the theme
 * of it just above controller settings. When turned on, players go straight to the log in page for online."): the
 * launch check's toggle row "Skip menu", directly above "Controller settings", saved in this browser, off by default; on,
 * the hand-over leaves the address at LOGIN's route (`/main/online`), so the front end's own menu router replays the
 * stack the original builds to LOGIN TO SOCOM II ONLINE (`dlgMenu` -> `dlgMPswitch` -> `dlgNetLogin`, research 138
 * R138.9; the router's deep link, `test/menuRoutes.test.ts` "a deep link") and builds only LOGIN. A browser adaptation:
 * the screens are the original's; the launcher only picks the place the router already enters.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

/** A release build over a connected pad and a ready disc (the sample adapters'), so Play opens nothing: the panel is opened by hand. */
function boot(): ConsolePage['ctl'] {
  vi.stubEnv('DEV', false);
  const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => false }, { touch: () => false, keyboard: () => false }) };
  A.disc.state = () => 'ready';
  page = bootConsole(document, window, A, { keymap: false });
  return page.ctl;
}

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-home [data-panel="launch"]');
const ids = (): (string | undefined)[] => [...panel()!.querySelectorAll<HTMLElement>('.cx-r[data-id]')].map((r) => r.dataset['id']);
const skipRow = (): HTMLElement => panel()!.querySelector<HTMLElement>('[data-id="skipmenu"]')!;
const focused = (): string | null => panel()?.querySelector<HTMLElement>('.cx-r.is-focused')?.dataset['id'] ?? null;

describe('SKIP-MENU: the "Skip menu" row of the "Before you deploy" panel', () => {
  it('is a toggle row directly above "Controller settings", off by default, with its hint', () => {
    const ctl = boot();
    ctl.press('cross');                                                // no pad: Play opens the panel (LR-36)
    expect(panel()).not.toBeNull();
    expect(ids()).toEqual(['disc', 'pad', 'deploy', 'skipmenu', 'padsettings']);
    const row = skipRow();
    expect(row.nextElementSibling?.getAttribute('data-id'), 'directly above Controller settings').toBe('padsettings');
    expect(row.classList.contains('cx-r--toggle')).toBe(true);
    expect(row.getAttribute('role')).toBe('switch');
    expect(row.getAttribute('aria-checked')).toBe('false');
    expect(row.querySelector('.cx-r__label')!.textContent).toBe('Skip menu');
    expect(row.querySelector('.cx-r__hint')!.textContent).toBe('Go straight to the online log-in');
    expect(Number(row.dataset['i'])).toBe(LAUNCH_SKIP_ROW);
    expect(LAUNCH_PADSET_ROW).toBe(LAUNCH_SKIP_ROW + 1);
  });

  it('Cross toggles it (the legend says Toggle), saved in this browser; a click toggles it back', () => {
    const ctl = boot();
    ctl.press('cross');
    while (focused() !== 'skipmenu' && focused() !== 'padsettings') ctl.press('down');
    expect(focused()).toBe('skipmenu');
    expect(prompts(ctl.S, ctl.A).find((x) => x.k === 'cross')?.label).toBe('Toggle');
    ctl.press('cross');
    expect(localStorage.getItem(SKIP_MENU_KEY)).toBe('1');
    expect(skipMenuOn()).toBe(true);
    expect(skipRow().getAttribute('aria-checked')).toBe('true');
    expect(panel(), 'the panel stays open').not.toBeNull();
    skipRow().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(skipMenuOn()).toBe(false);
    expect(skipRow().getAttribute('aria-checked')).toBe('false');
  });

  it('the review fold (1): the row flipped by Cross carries the flip for that draw (the knob\'s motion), and only then', () => {
    const ctl = boot();
    ctl.press('cross');
    while (focused() !== 'skipmenu' && focused() !== 'padsettings') ctl.press('down');
    expect(skipRow().classList.contains('is-flipped'), 'merely drawn: no flip').toBe(false);
    ctl.press('cross');
    expect(skipRow().classList.contains('is-flipped')).toBe(true);
    expect(skipRow().classList.contains('is-on')).toBe(true);
    ctl.press('up');
    expect(skipRow().classList.contains('is-flipped'), 'the next draw: the mark gone').toBe(false);
    skipRow().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(skipRow().classList.contains('is-flipped'), 'a click flips it too').toBe(true);
    expect(skipRow().classList.contains('is-on')).toBe(false);
  });

  it('a page booted again reads it as saved', () => {
    setSkipMenu(true);
    const ctl = boot();
    ctl.press('cross');
    expect(skipRow().getAttribute('aria-checked')).toBe('true');
  });
});

describe('SKIP-MENU: the launch screen says where the game opens', () => {
  /** A release build with a pad: START arms and the launch screen shows (the sample adapters: no hand-over). */
  function ready(): ConsolePage['ctl'] {
    vi.stubEnv('DEV', false);
    const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => true }, { touch: () => false, keyboard: () => false }) };
    A.disc.state = () => 'ready';
    page = bootConsole(document, window, A, { keymap: false });
    return page.ctl;
  }
  const note = (): string | null | undefined => document.querySelector('#overlay .cx-launch__note')?.textContent;

  it('off: its own title screen (unchanged); on: its own LOGIN screen', () => {
    let ctl = ready();
    ctl.S.rooms.selected = null;
    ctl.press('options');
    vi.advanceTimersByTime(ARMING_MS + 1);
    expect(ctl.S.overlay).toBe('launch');
    expect(note()).toBe('The game opens at its own title screen.');
    page!.dispose(); page = null; mountShell(document);
    setSkipMenu(true);
    ctl = ready();
    ctl.S.rooms.selected = null;
    ctl.press('options');
    vi.advanceTimersByTime(ARMING_MS + 1);
    expect(note()).toBe('The game opens at its own LOGIN screen.');
  });

  it('the review fold (2): on, a menu address that wins (a link) is named as the link\'s place; LOGIN only for LOGIN\'s route', () => {
    setSkipMenu(true);
    const say = (path: string): string | null | undefined => {
      window.history.replaceState(null, '', path);
      const ctl = ready();
      ctl.S.rooms.selected = null;
      ctl.press('options');
      vi.advanceTimersByTime(ARMING_MS + 1);
      const t = note();
      page!.dispose(); page = null; mountShell(document);
      return t;
    };
    expect(say('/main')).toBe('The game opens where your link points.');
    expect(say('/main/online/d/dlgOptions_Menu')).toBe('The game opens where your link points.');
    expect(say('/main/online')).toBe('The game opens at its own LOGIN screen.');
    expect(say('/console')).toBe('The game opens at its own LOGIN screen.');
    setSkipMenu(false);
    expect(say('/main'), 'off: unchanged').toBe('The game opens at its own title screen.');
    window.history.replaceState(null, '', '/');
  });
});

describe('SKIP-MENU: Deploy with it on enters the front end at LOGIN through its own router', () => {
  it('the route is LOGIN\'s, reached through dlgMPswitch as the original goes (the router plans it exactly, no guard)', () => {
    expect(SKIP_MENU_SEGMENTS).toEqual(['main', 'online']);
    const plan = routePlan(SKIP_MENU_SEGMENTS);
    expect(plan.landed).toBe('exact');
    expect(plan.stack.slice(-3)).toEqual(['dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
  });

  it('gamePage: on, the base becomes LOGIN\'s route; off, the base as before; a kept menu path (a link) wins', () => {
    const load = async (): Promise<void> => {};
    window.history.replaceState(null, '', '/console?menuflow');
    let g = gamePage(document, '/', [], load, true);
    expect(window.location.pathname).toBe('/main/online');
    expect(window.location.search).toBe('?menuflow');
    g.undo();
    expect(window.location.pathname).toBe('/console');
    g = gamePage(document, '/', [], load, false);
    expect(window.location.pathname).toBe('/');
    g.undo();
    g = gamePage(document, '/', [], load);
    expect(window.location.pathname, 'the default is off').toBe('/');
    g.undo();
    window.history.replaceState(null, '', '/main/online/d/dlgOptions_Menu');
    g = gamePage(document, '/', [], load, true);
    expect(window.location.pathname).toBe('/main/online/d/dlgOptions_Menu');
    g.undo();
  });

  async function runLaunch(skip: boolean): Promise<string> {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/console');
    publishDisc(document, { state: 'ready', filename: 'socom2.iso' });
    let at = '';
    const session = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
    const launch = liveLaunch(document, {
      session, base: '/', sheets: [], loadSheet: async () => {}, skipMenu: () => skip,
      image: () => ({ request: { kind: 'iso', file: new File([], 'socom2.iso') }, assets: {} as never }),
      mount: () => { at = window.location.pathname; return { canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} } as never; },
      overlay: async () => ({ mountPageOverlay: () => {} }),
    });
    const lp: LaunchPage = { suspend: () => {}, resume: () => {}, takeDown: () => {} };
    const r = await launch.run(lp);
    expect(r.ok).toBe(true);
    publishDisc(document, { state: 'empty', filename: null });
    return at;
  }

  it('the hand-over mounts the front end at /main/online with it on, at / with it off', async () => {
    expect(await runLaunch(true)).toBe('/main/online');
    expect(await runLaunch(false)).toBe('/');
  });

  it('the live launch reads the saved setting when no override is handed in', async () => {
    vi.useRealTimers();
    setSkipMenu(true);
    window.history.replaceState(null, '', '/console');
    publishDisc(document, { state: 'ready', filename: 'socom2.iso' });
    let at = '';
    const launch = liveLaunch(document, {
      session: { signOut: async () => {}, end: () => {} } as unknown as ModernSession, base: '/', sheets: [], loadSheet: async () => {},
      image: () => ({ request: { kind: 'iso', file: new File([], 'socom2.iso') }, assets: {} as never }),
      mount: () => { at = window.location.pathname; return { canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} } as never; },
      overlay: async () => ({ mountPageOverlay: () => {} }),
    });
    await launch.run({ suspend: () => {}, resume: () => {}, takeDown: () => {} });
    expect(at).toBe('/main/online');
    publishDisc(document, { state: 'empty', filename: null });
  });
});

describe('SKIP-MENU: the owner\'s Finding 1 answer (a) -- the same toggle in Settings > Launcher > App', () => {
  const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
  function live(): { ctl: ConsolePage['ctl']; options: ReturnType<typeof liveOptions> } {
    const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false, install: () => 'chromium' });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
    page.ctl.doAct('opt:app');
    page.render();
    return { ctl: page.ctl, options };
  }
  const settingsRow = (): HTMLElement | undefined => optRowEls().find((r) => optRowLabel(r) === 'Skip menu');

  it('App lists it as a toggle with the panel\'s hint, off by default', () => {
    const { options } = live();
    const app = options.categories().find((c) => c.id === 'app')!;
    const r = app.rows.find((x) => x.id === SKIP_MENU_ROW)!;
    expect(r.label).toBe('Skip menu');
    expect(r.hint).toBe('Go straight to the online log-in');
    expect(r.values).toEqual(['Off', 'On']);
    const el = settingsRow()!;
    expect(el.classList.contains('cx-r--toggle')).toBe(true);
    expect(el.querySelector('.cx-r__hint')!.textContent).toBe('Go straight to the online log-in');
    expect(optRowValue(el)).toBe('Off');
  });

  it('the Settings row writes the same setting; the panel then shows it on, and the panel\'s flip shows in Settings', () => {
    const { ctl, options } = live();
    settingsRow()!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(skipMenuOn()).toBe(true);
    expect(localStorage.getItem(SKIP_MENU_KEY)).toBe('1');
    expect(options.value(SKIP_MENU_ROW)).toBe(1);
    expect(optRowValue(settingsRow()!)).toBe('On');
    ctl.S.screen = 'home';
    ctl.openCheck();
    page!.render();
    expect(skipRow().getAttribute('aria-checked')).toBe('true');
    skipRow().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(skipMenuOn()).toBe(false);
    ctl.closeCheck();
    ctl.doAct('opt:app');
    page!.render();
    expect(optRowValue(settingsRow()!)).toBe('Off');
    expect(options.value(SKIP_MENU_ROW)).toBe(0);
  });
});
