// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, deployChecks, HOME_CATEGORY, homeItems, type Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-13, item A (LR.R17, the owner, 2026-10-26T18:40Z: "We want the play deploy screen to replace our old home launch
 * steps. buries the complexity one level deep. Play should show a state indicator (small, visual only) yellow/green to
 * give a slight context clue."). Home's list on the launcher page becomes the artifact's (`S2-Launcher-v2.dc.html` CATS:
 * home's items `play`, `card`, `activity`; the Discord link kept, LATER 291): Play, Memory card, Server status, Discord.
 * The old launch steps (Disc with its cog, Controller, Microphone) live one level deep, as the rows of Play's "Before you
 * deploy" panel (LR-2's right panel), which Play's Cross opens and focuses; the pad, Tab and the mouse reach its rows;
 * Circle goes back to Play. Deploy is START (LR.R15). Play carries a dot, visual only: yellow while a check is not ready,
 * green when START is ready. Over a game there is no START, so the overlay's Home keeps its own list. A browser adaptation.
 * LR-23 (LR.R22) supersedes the panel and the dot (below); the list and the checks' order stand.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const boot = (a: Adapters = sampleAdapters()): ConsolePage => {
  page = bootConsole(document, window, a, { keymap: true });
  page.ctl.S.input = 'pad';
  page.render();
  return page;
};
const titles = (): string[] => [...document.querySelectorAll('#stage .cx-list .cx-item__title')].map((t) => t.textContent ?? '');
const play = (): HTMLElement => document.querySelector<HTMLElement>('#stage .cx-list [data-act="item"][data-i="0"]')!;

describe('LR-13 A: Home\'s list is Play / Memory card / Server status / Discord', () => {
  it('the launcher page\'s Home list', () => {
    const p = boot();
    expect(titles()).toEqual(['Play SOCOM II', 'Server status', 'Discord', 'GitHub']);   // LR-37 (4): the Memory card row gone from the page
    expect(homeItems('home', p.ctl.S, p.ctl.A).map((x) => x.act)).toEqual(['play', 'server', 'discord', 'github']);
  });

  it('the checks are Disc, Controller and Microphone, in that order (the old steps, their acts kept)', () => {
    const p = boot();
    expect(deployChecks(p.ctl.S, p.ctl.A).map((x) => [x.title, x.act])).toEqual([['Disc', 'disc'], ['Controller', 'opt:controller'], ['Microphone', 'mic']]);
  });

  // LR-39 (LR.R32): over a game the overlay's Home is the page's list, Play replaced by Resume game (no START there).
  it('over a game the overlay\'s Home is the page\'s list, Resume game in Play\'s place (was: its own list, LR.R18)', () => {
    const p = boot();
    p.ctl.S.mode = 'overlay';
    expect(homeItems('home', p.ctl.S, p.ctl.A).map((x) => x.title)).toEqual(['Resume game', 'Server status', 'Discord', 'GitHub']);
  });
});

/*
 * LR-23 (LR.R22, the owner, 2026-10-27: "The entire right side overlay for the selected category - gone"; "Start game,
 * gone"; "The Play caution icon? not great. Find another way to express that"): Play's state dot and its "Before you
 * deploy" panel are gone. Was (LR-13 A): the dot green / yellow; Cross on Play opened the panel on the first check not
 * ready (else on Deploy, whose Cross was START); Up / Down walked Disc, Controller, Microphone, Deploy; Circle went back to
 * Play; a check's Cross or click did its old step; the disc check carried the source's cog; another category closed it.
 * Now Play's Cross launches when ready and otherwise does the first check's step; the cog sits beside the legend's disc
 * chip. `lr23Home.test.ts` holds the new facts; these pins say what is gone and where each step went.
 */
describe('LR-23 (was LR-13 A): no dot on Play, no panel', () => {
  it('no dot, whatever the readiness', () => {
    const a = sampleAdapters();
    let disc: 'ready' | 'empty' = 'ready';
    a.disc.state = () => disc;
    boot(a);
    expect(document.querySelectorAll('#stage .cx-item__dot')).toHaveLength(0);
    disc = 'empty';
    page!.render();
    expect(document.querySelectorAll('#stage .cx-item__dot')).toHaveLength(0);
  });

  // The LR-36 fold (LR.R30 amended): Play's Cross with the disc out opens the launch check on its disc row, whose Cross
  // (a gesture) is the chooser; a pad press says to use the pointer (LR-25). Was (LR-23): the chooser at once, the list's
  // focus kept on Play.
  it('Cross on Play with the disc out opens the launch check on the disc row (no readout), and the row\'s click is the chooser', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    const choose = vi.fn(async () => true);
    a.disc.choose = choose;
    const p = boot(a);
    p.ctl.press('cross');
    expect(choose).not.toHaveBeenCalled();
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect(play().classList.contains('is-focused')).toBe(false);                 // one focus: the panel's row
    const row = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage [data-panel="launch"] .cx-r.is-focused[data-id="disc"]');
    expect(row()).not.toBeNull();
    p.ctl.press('cross');                                                         // the pad's (boot's input): no gesture
    expect(choose).not.toHaveBeenCalled();
    expect(p.ctl.S.legendError).toContain('with the pointer');
    row()!.click();
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('all ready, Cross on Play is START', () => {
    const p = boot();
    p.ctl.press('cross');
    expect(p.ctl.S.start).toBe('arming');
  });

  // LR-36 (LR.R30): Play's Cross opens the "Before you deploy" panel on the controller check (was LR-23 / LR-31: Settings >
  // Controller at once, now the panel's "Controller settings" link; lr36LaunchCheck.test.ts).
  it('Play\'s Cross while the input is not ready opens the launch check on the controller (was: the Controller step\'s act)', () => {
    const a = sampleAdapters();
    a.controls = { ready: () => false, line: () => 'Controller needed', reason: () => 'Connect a controller to start.' };
    const p = boot(a);
    p.ctl.press('cross');
    expect(p.ctl.S.screen).toBe('home');
    expect(document.querySelector('#stage [data-panel="launch"] .cx-r.is-focused[data-id="pad"]')).not.toBeNull();
  });

  it('the disc source\'s menu is the legend\'s disc mark\'s; Square on Play opens its dropdown, Circle closes it', () => {
    const p = boot();
    // LR-24 (LR.R23 (b)): the disc mark opens it, no cog (was LR-23: `.cx-chipsrc .cx-split__cog` beside the chip)
    expect(document.querySelector('#legend .cx-markbox > .cx-mark[data-mark="disc"][aria-haspopup="menu"]')).not.toBeNull();
    p.ctl.press('square');
    expect(p.ctl.S.src.open).toBe(true);
    expect(document.querySelector('#legend .cx-srcmenu')).not.toBeNull();
    p.ctl.press('circle');
    expect(p.ctl.S.src.open).toBe(false);
  });

  it('another category moves at once (nothing to close)', () => {
    const p = boot();
    p.ctl.press('r1');
    expect(p.ctl.S.cat).toBe(HOME_CATEGORY + 1);
  });
});

describe('LR-13 A: Server status opens the Server screen and comes back to it', () => {
  it('Cross on Server status, then Circle: Home, on Server status', () => {
    const p = boot();
    p.ctl.press('down');                                              // LR-37 (4): Server status second (no Memory card)
    expect(homeItems('home', p.ctl.S, p.ctl.A)[p.ctl.S.item[HOME_CATEGORY]!]!.title).toBe('Server status');
    p.ctl.press('cross');
    expect(p.ctl.S.screen).toBe('server');
    p.ctl.press('circle');
    expect(p.ctl.S.screen).toBe('home');
    expect(CATS[p.ctl.S.cat]!.id).toBe('home');
    expect(p.ctl.S.item[HOME_CATEGORY]).toBe(1);
  });
});
