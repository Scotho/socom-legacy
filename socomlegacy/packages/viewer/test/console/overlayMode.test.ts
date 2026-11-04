// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { SIGNIN_NO_ACCOUNT_WORDS } from '../../src/console/render/overlay';
import { SAMPLE_OPT_CATS, sampleAdapters } from '../../src/console/sampleAdapters';
import {
  CATS, deployChecks, KEPT_DISC_ROW, OVERLAY_DISC_WORDS, OVERLAY_LOCK_WORDS, homeItems, type Adapters, type ConsolePageReads, type LoadoutsAdapter, type OptCat,
  type ReplayWatch,
} from '../../src/console/state';
import { OVERLAY_KEPT_WORDS, SERVED_TREE_WORDS } from '../../src/console/adapters/overlayDisc';
import { REPLAY_ROUND_WORDS } from '../../src/modern/replays/view';
import { mountShell } from './shell';
import { optRowValue } from './optRows';   // LR-5: a row's shown word in LR-1's row kinds, as the roller's value

/**
 * OVERLAY-CONSOLE (the console launcher plan; CX.R13, MISSION's OT.R60 (a)-(c)): the console booted in its overlay mode,
 * as the overlay over a game page shows it. START and the launch are hidden; the disc choice and source, the kept disc's
 * delete are locked over any page (the game opened the disc at its boot), sign out and the persona switch while the game
 * holds the account or a round runs, each with its line; Options, Replays (Watch gated in a round), the news and the
 * rooms (read only) stay usable; Circle at the top asks the host to close; a `todo:` act is "Coming" in both modes. A
 * browser adaptation with no original (OT.R28): nothing of the game's behaviour.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

/** The page's reads as the overlay hands them, set by the test. */
function reads(o: { holds?: boolean; round?: boolean } = {}): ConsolePageReads & { holds: boolean; round: boolean } {
  const r = {
    holds: o.holds ?? false, round: o.round ?? false,
    gameHolds: () => r.holds, roundRunning: () => r.round, gamePage: () => true,
  };
  return r;
}

/** The sample adapters with Options' Account rows the live page has (the kept disc), and a replays list with Watch. */
function adapters(): Adapters & { watched: string[]; chose: number } {
  const base = sampleAdapters();
  const cats: OptCat[] = SAMPLE_OPT_CATS.map((c) => (c.id !== 'account' ? c : {
    ...c, rows: [...c.rows, { id: KEPT_DISC_ROW, label: 'Delete the kept disc', action: 'Delete', about: 'Kept.', note: 'Kept here.' }],
  }));
  const out = {
    ...base,
    watched: [] as string[],
    chose: 0,
    disc: { ...base.disc, choose: async () => { out.chose++; return true; }, chooseFolder: async () => { out.chose++; return true; } },
    options: { ...base.options, categories: () => cats },
    server: { ...base.server, news: () => ({ universe: { kind: 'waiting' as const }, announcement: { kind: 'signed-out' as const } }), loadNews() { /* none */ } },
    replays: {
      count: () => 1, async refresh() { /* none */ },
      view: () => ({ kind: 'ok' as const, entries: [{ id: 'r1', map: 'Crossroads', rules: 'Suppression', when: '2026-10-16 12:00', length: '10:00', players: 2, names: 'A, B' }] }),
      watch: (id: string): ReplayWatch => {
        out.watched.push(id);
        return { id, press() {}, focused: () => null, lock() {}, locked: () => false, close() {} };
      },
      watching: () => null,
    },
  };
  return out;
}

function boot(o: { mode?: 'page' | 'overlay'; page?: ConsolePageReads; a?: Adapters; close?: () => void } = {}) {
  const a = o.a ?? adapters();
  page = bootConsole(document, window, a, { keymap: true, mode: o.mode ?? 'overlay', ...(o.page ? { page: o.page } : {}), ...(o.close ? { close: o.close } : {}) });
  return { ctl: page.ctl, A: a };
}
const cat = (ctl: ConsolePage['ctl'], id: string): void => { ctl.S.screen = 'home'; ctl.S.cat = CATS.findIndex((c) => c.id === id); page!.render(); };
const item = (ctl: ConsolePage['ctl'], title: string) => homeItems(CATS[ctl.S.cat]!.id, ctl.S, ctl.A).find((x) => x.title === title);
const focus = (ctl: ConsolePage['ctl'], title: string): void => {
  ctl.S.item[ctl.S.cat] = homeItems(CATS[ctl.S.cat]!.id, ctl.S, ctl.A).findIndex((x) => x.title === title);
  page!.render();
};
const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';
const optRow = (ctl: ConsolePage['ctl'], cat: string, id: string): void => {
  ctl.doAct('opt:' + cat);
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === id);
  page!.render();
};

describe('hidden in overlay mode: START, the launch target, the launch screen', () => {
  it('no START and no disc chip in the legend; OPTIONS (START) arms nothing; no launch screen', () => {
    const { ctl } = boot({ page: reads() });
    // LR-39 (LR.R32): Home's legend is the page's three marks (the disc's read only); no START, no chip, no other cluster.
    expect(document.querySelector('#legend .cx-start, #legend .cx-chip, #legend .cx-cluster:not(.cx-cluster--marks)')).toBeNull();
    expect(document.querySelector('#legend .cx-cluster--marks')).not.toBeNull();
    ctl.doAct('rooms');
    page!.render();
    expect(document.querySelector('#legend .cx-start, #legend .cx-chip, #legend .cx-cluster')).toBeNull();   // off Home: none
    ctl.press('circle');
    expect(prompts(ctl.S, ctl.A).some((p) => p.act === 'options')).toBe(false);
    ctl.press('options');
    vi.advanceTimersByTime(2000);
    expect(ctl.S.start).toBe('idle');
    expect(ctl.S.overlay).toBeNull();
    ctl.start();
    vi.advanceTimersByTime(2000);
    expect(ctl.S.overlay).toBeNull();
    expect(document.querySelector('#overlay [data-key="launch"]')).toBeNull();
    expect(document.getElementById('legend')!.classList.contains('is-ready')).toBe(false);
  });

  it('no word of START or a launch on the header, the stage or the legend of any category', () => {
    const { ctl } = boot({ page: reads() });
    for (const c of CATS) {
      cat(ctl, c.id);
      for (const sel of ['#header', '#stage', '#legend']) expect(text(sel), `${c.id} ${sel}`).not.toMatch(/\bSTART\b|\blaunch\b|\bdeploy\b/i);
    }
  });

  it('the rooms are browsable and read only: Cross picks no launch target, the drawer offers none', () => {
    const { ctl, A } = boot({ page: reads() });
    const select = vi.fn();
    A.rooms.select = select;
    cat(ctl, 'online');
    ctl.doAct('rooms');
    page!.render();
    expect(ctl.S.screen).toBe('rooms');
    expect(document.querySelectorAll('#stage [data-act="room"]').length).toBeGreaterThan(0);
    const row = ctl.S.rooms.row;
    ctl.press('down');
    expect(ctl.S.rooms.row).toBe(row + 1);
    ctl.press('cross');
    expect(ctl.S.rooms.selected).toBeNull();
    expect(select).not.toHaveBeenCalled();
    expect(text('#stage')).not.toMatch(/launch target|press START/i);
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'cross')).toBeUndefined();
    ctl.press('circle');
    expect(ctl.S.screen).toBe('home');
  });

  it('page mode is unchanged: START, the chip and the launch target are the launcher\'s', () => {
    const { ctl } = boot({ mode: 'page' });
    // LR-23 (LR.R22, "Start game, gone"): Home draws no START pill (Play is the launch); Browse rooms keeps it.
    expect(document.querySelector('#legend .cx-start')).toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')).not.toBeNull();   // LR-24: the disc mark (was: the chip)
    ctl.doAct('rooms');
    ctl.render();
    expect(document.querySelector('#legend .cx-start')).not.toBeNull();
    ctl.press('cross');                                             // the prototype's second row, Bravo
    expect(ctl.S.rooms.selected).toBe('Bravo');
  });
});

describe('locked with a line over any page the overlay mounts on: the disc, its source, the kept disc', () => {
  // LR-39 (LR.R32): the overlay's Home is the page's -- no Disc row (was: Home's Disc, disabled with its line); the Disc
  // step the page's Play reads is still locked over a game, and nothing on Home chooses a disc.
  it('the Disc step: disabled with its line, no source; no cog on Home; Cross, Square and the chooser choose nothing', () => {
    const { ctl, A } = boot({ page: reads() });
    expect(item(ctl, 'Disc')).toBeUndefined();
    const disc = deployChecks(ctl.S, ctl.A)[0]!;
    expect(disc.disabled).toBe(true);
    expect(disc.sub).toBe(OVERLAY_LOCK_WORDS.disc);
    expect(disc.source).toBeUndefined();
    expect(document.querySelector('#stage .cx-srcbtn')).toBeNull();
    ctl.press('square');
    ctl.chooseDisc();
    ctl.pointer('disc', {});
    expect((A as ReturnType<typeof adapters>).chose).toBe(0);
    expect(ctl.S.src.open).toBe(false);
    expect(ctl.S.legendError).toBe(OVERLAY_LOCK_WORDS.disc);
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'cross')?.label).toBe('Resume game');   // Home's first row (LR-39)
  });

  it('the loadouts without the disc offer no disc chooser either', () => {
    const { ctl, A } = boot({ page: reads() });
    ctl.flipState(0);                                              // the sample disc out
    cat(ctl, 'profile');
    ctl.S.item[ctl.S.cat] = homeItems('profile', ctl.S, ctl.A).findIndex((x) => x.title === 'Loadouts');
    ctl.press('cross');
    ctl.press('cross');
    expect((A as ReturnType<typeof adapters>).chose).toBe(0);
    expect(ctl.S.legendError).toBe(OVERLAY_LOCK_WORDS.disc);
  });

  it('Options > Account > Delete the kept disc: locked with its line; Cross asks nothing', () => {
    const { ctl } = boot({ page: reads() });
    optRow(ctl, 'account', KEPT_DISC_ROW);
    const row = ctl.A.options.categories().find((c) => c.id === 'account')!.rows.find((r) => r.id === KEPT_DISC_ROW)!;
    expect(row.locked).toBeUndefined();                           // the adapter's own row is not touched
    expect(optRowValue(document.querySelector('#stage [data-act="optrow"].is-focused')!)).toBe(OVERLAY_LOCK_WORDS.keptDisc);
    expect(text('#stage .cx-aside__note')).toContain(OVERLAY_LOCK_WORDS.keptDisc);
    ctl.press('cross');
    expect(ctl.S.overlay).toBeNull();
  });

  // Batch B's review F2 and the seat's frames F-B (the owner's playtest over the served tree's test room): the game under
  // the overlay is running, so it has a disc -- the served tree, an opened image, or the kept read set. The Disc row and
  // Home's readout said it is in use, with the check and the ready style, and never NEEDED or "No disc in". Since LR-39
  // (LR.R32) the overlay's Home is the page's -- no Disc row and no readout -- so the Disc step (`deployChecks`) carries
  // those words, and nothing drawn says NEEDED or "No disc in".
  describe('F2 / F-B: over a running game the disc is in use -- never NEEDED, never "No disc in"', () => {
    const withDisc = (state: 'ready' | 'empty', label: string): Adapters => {
      const a = adapters();
      return { ...a, disc: { ...a.disc, state: () => state, label: () => label } };
    };
    const cases = [
      ['an opened image', withDisc('ready', 'the disc image socom2.iso'), OVERLAY_DISC_WORDS.inUse, /the disc image socom2\.iso/],
      ['the kept read set', withDisc('ready', OVERLAY_KEPT_WORDS), OVERLAY_DISC_WORDS.inUse, /kept in this browser/],
      ['the served tree', withDisc('empty', SERVED_TREE_WORDS), OVERLAY_DISC_WORDS.served, /served tree/i],
      ['a disc the page does not name', withDisc('empty', ''), OVERLAY_DISC_WORDS.inUse, /running under the overlay reads this disc/],
    ] as const;
    for (const [what, a, chip, sub] of cases) {
      it(`${what}: the Disc step's chip ${chip} in the ready style, its line; nothing drawn says NEEDED`, () => {
        const { ctl } = boot({ page: reads(), a });
        const disc = deployChecks(ctl.S, ctl.A)[0]!;
        expect(disc.state).toEqual([chip, 'ready']);
        expect(disc.sub).toMatch(sub);
        expect(disc.disabled).toBe(true);                          // still locked: the game's disc
        expect(document.querySelector('#stage [data-disc-line]')).toBeNull();   // LR-39: no readout on Home
        for (const sel of ['#stage', '#legend']) expect(text(sel)).not.toMatch(/NEEDED|No disc in/);
      });
    }

    it('the disc page before its image (no game runs yet): asked on the page, not NEEDED', () => {
      const r = { ...reads(), discOnPage: () => true };
      const { ctl } = boot({ page: r, a: withDisc('empty', '') });
      const disc = deployChecks(ctl.S, ctl.A)[0]!;
      expect(disc.state).toEqual([OVERLAY_DISC_WORDS.waiting, '']);
      expect(disc.sub).toBe(OVERLAY_DISC_WORDS.onPage);
      expect(text('#stage')).not.toMatch(/NEEDED|No disc in/);
    });

    it('page mode keeps the launcher\'s own words: NEEDED with no disc', () => {
      const { ctl } = boot({ mode: 'page', a: withDisc('empty', '') });
      expect(deployChecks(ctl.S, ctl.A)[0]!.state).toEqual(['NEEDED', 'alert']);   // the Disc step (LR-23: its line the legend chip's)
    });
  });

  it('page mode: the Disc chooses, its menu is there (LR-24: the disc mark\'s; was the cog), the kept disc asks its confirm', () => {
    const { ctl, A } = boot({ mode: 'page' });
    expect(deployChecks(ctl.S, ctl.A)[0]!.disabled).toBeFalsy();            // the Disc step
    // LR-23 (LR.R22): the cog beside the legend's chip, and the chip chooses (was: Play's panel's disc check and its Cross).
    // LR-24 (LR.R23 (b)): the disc mark opens the source's menu and its option chooses (was: the cog, then the chip's click).
    document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!.click();
    expect(document.querySelector('#legend .cx-markbox .cx-srcmenu')).not.toBeNull();
    document.querySelector<HTMLElement>('#legend .cx-srcopt[data-i="0"]')!.click();
    expect((A as ReturnType<typeof adapters>).chose).toBe(1);
    optRow(ctl, 'account', KEPT_DISC_ROW);
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('kept');
  });
});

describe('locked while the game holds the account or a round runs: sign out and the persona switch', () => {
  for (const [why, r, line] of [['the game holds the account', { holds: true }, OVERLAY_LOCK_WORDS.signOutGame], ['a round runs', { round: true }, OVERLAY_LOCK_WORDS.signOutRound]] as const) {
    it(`${why}: Profile's Sign out and its persona disabled with the line; Options' Sign out locked; no confirm`, () => {
      const { ctl } = boot({ page: reads(r) });
      cat(ctl, 'profile');
      const out = item(ctl, 'Sign out')!;
      expect(out.disabled).toBe(true);
      expect(out.sub).toBe(line);
      const persona = homeItems('profile', ctl.S, ctl.A)[3]!;
      expect(persona.disabled).toBe(true);
      expect(persona.sub).toBe(why === 'a round runs' ? OVERLAY_LOCK_WORDS.personaRound : OVERLAY_LOCK_WORDS.personaGame);
      focus(ctl, 'Sign out');
      ctl.press('cross');
      expect(ctl.S.overlay).toBeNull();
      expect(ctl.S.legendError).toBe(line);
      optRow(ctl, 'account', 'signout');
      expect(optRowValue(document.querySelector('#stage [data-act="optrow"].is-focused')!)).toBe(line);
      ctl.press('cross');
      expect(ctl.S.overlay).toBeNull();
      ctl.doAct('signout');
      expect(ctl.S.overlay).toBeNull();
    });
  }

  it('followed live: the lock lifts when the round ends, and Sign out asks its #793 confirm', () => {
    const r = reads({ round: true });
    const { ctl } = boot({ page: r });
    cat(ctl, 'profile');
    expect(item(ctl, 'Sign out')!.disabled).toBe(true);
    r.round = false;
    page!.render();
    expect(item(ctl, 'Sign out')!.disabled).toBeFalsy();
    focus(ctl, 'Sign out');
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('signout');
  });
});

// CX-25's review F2: the sign-in's account line (the merge controller's call: account creation stays in the game's
// ONLINE flow) says "in the game" only where the game's front end runs under the overlay; over a page with no game (the
// forge, the test room, the launch sheet, the disc page before START) it gives the launcher's words.
describe('CX-25 F2: the sign-in\'s account line follows whether the game runs under the overlay', () => {
  const line = (): string => text('#overlay [data-signin-account]');
  const signIn = (ctl: ConsolePage['ctl']): void => { ctl.S.overlay = 'signin'; page!.render(); };
  it('over a page with no game: the launcher\'s words', () => {
    const { ctl } = boot({ page: { ...reads(), frontEndRuns: () => false } });
    signIn(ctl);
    expect(line()).toBe(SIGNIN_NO_ACCOUNT_WORDS.page);
  });
  it('over a page that reads nothing of a game (no frontEndRuns read): the launcher\'s words', () => {
    const { ctl } = boot({ page: reads() });
    signIn(ctl);
    expect(line()).toBe(SIGNIN_NO_ACCOUNT_WORDS.page);
  });
  it('over the game\'s own front end: the in-game words; on the launcher page, the launcher\'s', () => {
    const { ctl } = boot({ page: { ...reads(), frontEndRuns: () => true } });
    signIn(ctl);
    expect(line()).toBe(SIGNIN_NO_ACCOUNT_WORDS.overlay);
    expect(line()).toBe('No account yet? Choose ONLINE in the game to create one.');
    page!.dispose(); page = null;
    const launcher = boot({ mode: 'page' });
    signIn(launcher.ctl);
    expect(line()).toBe('No account yet? Start the game and choose ONLINE to create one.');
  });
});

describe('usable in overlay mode, in a match too', () => {
  it('Options (audio, controller, display), its Button mapping row, server news, the replays list', () => {
    const { ctl } = boot({ page: reads({ holds: true, round: true }) });
    for (const c of ['audio', 'controller', 'display']) {
      ctl.doAct('opt:' + c);
      expect(ctl.S.screen).toBe('options');
      const before = ctl.A.options.value(ctl.A.options.categories()[ctl.S.opt.cat]!.rows.find((x) => x.values)!.id);
      ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((x) => x.values);
      ctl.press('right');
      expect(ctl.A.options.value(ctl.A.options.categories()[ctl.S.opt.cat]!.rows[ctl.S.opt.row]!.id)).not.toBe(before);
    }
    optRow(ctl, 'controller', 'remap');
    expect(optRowValue(document.querySelector('#stage [data-act="optrow"].is-focused')!)).toBe('Choose what each button does');   // LR-20 (P12)
    cat(ctl, 'online');
    focus(ctl, 'Server Information');                                         // LR-37 (6): the news is the Server screen's
    ctl.press('cross');
    expect(ctl.S.screen).toBe('server');
    ctl.press('circle');
    ctl.doAct('replays'); page!.render();
    ctl.press('cross');
    expect(ctl.S.screen).toBe('replays');
  });

  it('Replays\' Watch is gated in a round (the round keeps the disc readers), said in the Replays section\'s words', () => {
    const r = reads({ round: true });
    const { ctl, A } = boot({ page: r });
    ctl.doAct('replays');
    ctl.press('cross');
    expect((A as ReturnType<typeof adapters>).watched).toEqual([]);
    expect(ctl.S.legendError).toBe(REPLAY_ROUND_WORDS);
    r.round = false;
    ctl.press('cross');
    expect((A as ReturnType<typeof adapters>).watched).toEqual(['r1']);
  });
});

/**
 * The seat's frames' F-A (batch B's fold; the merge controller: it matters for the owner's look): at 1280x720 the overlay's
 * adaptation note took the header's middle and its "Back to game (Home (PS / Xbox Guide) / F9)" button was long, so the
 * wordmark broke into "SOCOM / II" and "PAD / 1", "MIC / ON", "Sign / in" likewise. The header now reads as the
 * launcher's own: the note is a short line of the legend (still drawn wherever the overlay shows: the parity rule's label
 * for an adaptation), the back control a compact legend-style prompt (the opening button's cap and "Back to game"; its
 * full name, and F9 on a development build, in its label), and the header's items are held to one line each.
 */
describe('F-A: the header reads as the launcher\'s own, one line each', () => {
  const r = (): ConsolePageReads => ({ ...reads(), toggleName: () => 'Home (PS / Xbox Guide) / F9', toggleCap: () => 'Home' });

  it('the adaptation label is a short line of the legend, not of the header -- on Home, a pushed screen and under a dialog', () => {
    const { ctl } = boot({ page: r() });
    expect(document.querySelector('#header [data-overlay-label]')).toBeNull();
    const label = (): HTMLElement => document.querySelector<HTMLElement>('#legend [data-overlay-label]')!;
    expect(label().textContent!.trim()).toMatch(/^Browser adaptation/);
    expect(label().textContent!.trim().length).toBeLessThanOrEqual(48);
    ctl.doAct('opt:audio');
    expect(label()).not.toBeNull();
    ctl.press('circle'); ctl.press('circle');
    ctl.doAct('news'); page!.render();                                        // LR-37 (6): no row opens it now; the act still does
    expect(ctl.S.overlay).toBe('news');
    expect(label()).not.toBeNull();
  });

  it('the back control is a compact prompt: the button\'s cap and "Back to game", its full name in its label; Circle\'s press', () => {
    boot({ page: r() });
    const close = document.querySelector<HTMLElement>('#header [data-overlay-close]')!;
    expect(close.classList.contains('cx-prompt')).toBe(true);
    expect(close.dataset['act']).toBe('press');
    expect(close.dataset['b']).toBe('circle');
    expect(close.querySelector('.cx-shoulder')!.textContent).toBe('Home');
    expect(close.querySelector(':scope > .cx-label')!.textContent).toBe('Back to game');
    expect(close.textContent).toBe('HomeBack to game');                // the cap and the words, nothing more drawn
    expect(close.getAttribute('aria-label')).toBe('Back to game (Home (PS / Xbox Guide) / F9)');
    expect(close.title).toBe('Back to game (Home (PS / Xbox Guide) / F9)');
    expect(document.getElementById('header')!.textContent).not.toMatch(/\(|adaptation/i);
  });

  it('page mode: no back control and no adaptation line (the launcher\'s own header and legend)', () => {
    boot({ mode: 'page' });
    expect(document.querySelector('[data-overlay-close], [data-overlay-label]')).toBeNull();
  });

  it('the header\'s items hold to one line, in overlay mode: no wrap and no shrinking below their content (console.css)', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8').replace(/\r\n/g, '\n');
    const sel = ':root[data-console][data-console-mode="overlay"] .cx-header :is(.cx-brand, .cx-status, .cx-lampword, .cx-player, .cx-overlayclose)';
    const at = css.indexOf(`${sel} {`);
    expect(at, 'the rule').toBeGreaterThan(-1);
    const body = css.slice(at + sel.length, css.indexOf('}', at));
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/flex-shrink:\s*0/);
    // Outside any layer, so no component's rule beats it (the overlay's ground rule's way, above it).
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '');
    expect([...before].reduce((d, c) => d + (c === '{' ? 1 : c === '}' ? -1 : 0), 0), 'at the top level').toBe(0);
    boot({ page: r() });
    const header = document.getElementById('header')!;
    expect(header.querySelector('br')).toBeNull();
    for (const el of header.querySelectorAll('.cx-brand, .cx-status, .cx-lampword, .cx-player, .cx-overlayclose')) expect(el.closest('.cx-header')).toBe(header);
  });
});

describe('Circle at the top asks the host to close', () => {
  it('overlay mode: Circle on Home asks to close; inside a screen or a dialog it goes back first', () => {
    const close = vi.fn();
    const { ctl } = boot({ page: reads(), close });
    ctl.doAct('opt:audio');
    ctl.press('circle');                                            // the rows to the tabs
    ctl.press('circle');                                            // the tabs to Home
    expect(close).not.toHaveBeenCalled();
    expect(ctl.S.screen).toBe('home');
    cat(ctl, 'online');
    focus(ctl, 'Server news');
    ctl.press('cross');
    ctl.press('circle');                                            // the news dialog closes
    expect(close).not.toHaveBeenCalled();
    ctl.press('circle');
    expect(close).toHaveBeenCalledTimes(1);
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'circle')?.label).toBe('Back to game');
  });

  it('page mode: Circle on Home does nothing', () => {
    const close = vi.fn();
    const { ctl } = boot({ mode: 'page', close });
    ctl.press('circle');
    expect(close).not.toHaveBeenCalled();
    expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'circle')).toBeUndefined();
  });
});

/** CX-LOADOUTS: a loadouts adapter that reads nothing (the screens' own tests are `./loadouts.test.ts`). */
const idleLoadouts = (): LoadoutsAdapter => ({
  open() {}, list: () => ({ kind: 'loading' }), retry() {}, edit() {}, editor: () => ({ kind: 'loading' }), step() {},
  save: () => null, defaults: () => null, close() {}, follow() {}, sync() {},
});

describe('the gaps (OT.R60 (c)): a todo: act is "Coming" and does nothing, in both modes', () => {
  it('CX-LOADOUTS: with a loadouts adapter the Armory\'s rows are no gap; the sample adapters\' (none) keep "Coming"', () => {
    for (const mode of ['page', 'overlay'] as const) {
      const { ctl } = boot({ mode, page: reads(), a: { ...adapters(), loadouts: idleLoadouts() } });
      cat(ctl, 'profile');
      ctl.S.item[ctl.S.cat] = homeItems('profile', ctl.S, ctl.A).findIndex((x) => x.title === 'Loadouts');
      expect(homeItems('profile', ctl.S, ctl.A).find((x) => x.title === 'Loadouts')?.act, mode).toBe('loadout-sides');
      ctl.press('cross');
      expect(ctl.S.screen, mode).toBe('loadoutSides');
      ctl.press('cross');
      expect(ctl.S.screen, mode).toBe('loadouts');
      page!.dispose(); page = null;
    }
    const { ctl } = boot({ mode: 'page', page: reads() });
    expect(homeItems('profile', ctl.S, ctl.A).find((x) => x.title === 'Loadouts')?.act).toBe('loadout-sides');
  });
  for (const mode of ['page', 'overlay'] as const) {
    it(`${mode}: Persona, Service record`, () => {
      const { ctl } = boot({ mode, page: reads(), a: { ...adapters(), loadouts: idleLoadouts() } });
      const coming: string[] = [];
      for (const c of ['profile']) {
        cat(ctl, c);
        const items = homeItems(c, ctl.S, ctl.A);
        items.forEach((x, i) => {
          if (!x.act.startsWith('todo:')) return;
          coming.push(x.title);
          expect(x.state, x.title).toEqual(['COMING', '']);
          ctl.S.item[ctl.S.cat] = i;
          page!.render();
          expect(document.querySelector('#stage .cx-item.is-focused .cx-item__state')!.textContent).toBe('COMING');
          expect(prompts(ctl.S, ctl.A).find((p) => p.k === 'cross')).toBeUndefined();
          ctl.press('cross');
          expect(ctl.S.toast).toBe('');
          expect(ctl.S.screen).toBe('home');
          expect(ctl.S.overlay).toBeNull();
        });
      }
      expect(coming).toEqual(['Service record', 'Profiles']);
    });
  }
});
