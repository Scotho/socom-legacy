// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { OptRow } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * The console launcher's legend (the S2U Briefing design system's ConsoleLegend README and the prototype's
 * `prompts()` / `renderLegend`): one prompt per press that does something now -- confirm, back, the screen's own,
 * the shoulders -- then the disc chip and START, which never moves. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const boot = () => (page = bootConsole(document, window, sampleAdapters(), { keymap: true }));
const said = (p: ReturnType<typeof prompts>) => p.map((x) => [x.k, x.label]);

describe('the prompts per context', () => {
  it('home: the item\'s verb, Menu on the shoulders, the account; Square only where it refreshes', () => {
    const { ctl } = boot();
    // LR-23 (LR.R22): Home's first item is Play, its Cross "Play" (it launches, ready), its Square the disc source (the
    // chip's cog). Was LR-13: Select on Play, then Play's panel's Select / Back / Disc source on the disc check and Deploy.
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Play SOCOM II'], ['L1 R1', 'Menu'], ['triangle', 'Account'], ['square', 'Disc source']]);
    ctl.press('down');                                                           // Memory card: Select, no Square
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Select'], ['L1 R1', 'Menu'], ['triangle', 'Account']]);
    ctl.press('up');
    // Profile › Replays (LP.R2), the sample's empty list: MU2-13's "No replays yet" row, whose verb is Refresh.
    ctl.press('l1');
    ctl.press('l1');
    ctl.doAct('replays');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Refresh'], ['circle', 'Back'], ['square', 'Refresh']]);
  });

  it('home signed out on a Sign in item: no second Sign in on Triangle', () => {
    const { ctl } = boot();
    ctl.flipState(1);
    ctl.press('right');
    ctl.press('down'); ctl.press('down');                              // LR-37 (7): Sign In is Online's third
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Select'], ['L1 R1', 'Menu']]);
  });

  it('rooms: confirm, back, refresh, filter -- the confirm naming what Cross will do', () => {
    const { ctl } = boot();
    ctl.press('right');
    ctl.press('cross');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Pick room'], ['circle', 'Back'], ['square', 'Refresh'], ['L2 R2', 'Filter'], ['dpad-h', 'Show']]);   // LR2 review F1: Left / Right, ALL / CLASSIC / CUSTOM
    ctl.press('cross');
    expect(prompts(ctl.S, ctl.A)[0]!.label).toBe('Clear target');
    ctl.press('up');
    expect(prompts(ctl.S, ctl.A)[0]!.label).toBe('Room full');
    ctl.flipState(1);
    expect(prompts(ctl.S, ctl.A)[0]!.label).toBe('Sign in');
  });

  it('options: Change on the D-pad, back, reset, category; an action row confirms with its verb; the tabs open', () => {
    const { ctl } = boot();
    ctl.doAct('opt:display');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['dpad-h', 'Change'], ['circle', 'Back'], ['square', 'Reset to default'], ['L1 R1', 'Category']]);
    ctl.doAct('opt:controller');
    ctl.S.opt.row = 3;
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Remap'], ['circle', 'Back'], ['L1 R1', 'Category']]);
    ctl.press('circle');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Open'], ['circle', 'Back']]);
  });

  // The batch review's F3 (review-lr-batch-13-21.md): the legend's Square read `values.length > 1` where the grammar's
  // press did not. One rule now (the grammar's, `state.ts` canResetRow): the legend offers "Reset to default" exactly
  // where Square resets, over every row kind.
  it('Square: the legend offers "Reset to default" exactly where the press resets (toggle, select, info, action, locked, sign-in; with and without a default)', () => {
    const rows: OptRow[] = [
      { id: 'tog-def', label: 'Toggle, default', values: ['Off', 'On'], def: 1, about: '', note: '' },
      { id: 'tog', label: 'Toggle, none', values: ['Off', 'On'], about: '', note: '' },
      { id: 'sel-def', label: 'Select, default', values: ['A', 'B', 'C'], def: 0, about: '', note: '' },
      { id: 'sel', label: 'Select, none', values: ['A', 'B', 'C'], about: '', note: '' },
      { id: 'one-def', label: 'One value, default', values: ['Only'], def: 0, about: '', note: '' },
      { id: 'info', label: 'Version', info: { value: '1.0' }, about: '', note: '' },
      { id: 'act', label: 'Action', action: 'Run', about: '', note: '' },
      { id: 'lock-def', label: 'Locked, default', values: ['A', 'B'], def: 0, locked: 'Insert disc', about: '', note: '' },
      { id: 'auth-def', label: 'Sign-in, default', values: ['A', 'B'], def: 0, needsSignIn: true, about: '', note: '' },
    ];
    const seen = { offered: 0, reset: 0, neither: 0 };
    for (const signedIn of [true, false]) {
      const a = sampleAdapters();
      const resets: string[] = [];
      a.session = { ...a.session, signedIn: () => signedIn };
      a.options = { ...a.options, categories: () => [{ id: 'display', label: 'Display', icon: 'display', rows }], value: () => 0, set: () => {}, step: undefined, reset: (id) => { resets.push(id); } };
      page = bootConsole(document, window, a, { keymap: true });
      const { ctl } = page;
      ctl.doAct('opt:display');
      rows.forEach((r, i) => {
        ctl.S.opt = { cat: 0, row: i, zone: 'rows' };
        const offered = prompts(ctl.S, ctl.A).some((p) => p.k === 'square' && p.label === 'Reset to default');
        const before = resets.length;
        ctl.press('square');
        const reset = resets.length > before;
        expect(offered, `${r.label}, signed ${signedIn ? 'in' : 'out'}: the legend ${offered ? 'offers' : 'does not offer'} what the press ${reset ? 'does' : 'does not do'}`).toBe(reset);
        if (offered) seen.offered++; if (reset) seen.reset++; if (!offered && !reset) seen.neither++;
      });
      page.dispose(); page = null; mountShell(document);
    }
    // both answers met: four rows reset signed in (toggle, select and one value with a default; the sign-in row), three signed out
    expect(seen).toEqual({ offered: 7, reset: 7, neither: 11 });
  });

  it('sign-in: the keyboard\'s own; confirm: choose and cancel', () => {
    const { ctl } = boot();
    ctl.flipState(1);
    ctl.press('triangle');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Type'], ['circle', 'Close'], ['square', 'Delete'], ['triangle', 'Space'], ['L2', 'Shift'], ['R2', 'Sign in']]);
    ctl.press('l2');
    expect(prompts(ctl.S, ctl.A)[4]!.label).toBe('Shift on');
    ctl.press('circle');
    ctl.press('triangle');
    ctl.press('up');
    ctl.press('up');
    expect(prompts(ctl.S, ctl.A)[0]!.label).toBe('Choose');
    ctl.press('circle');
    ctl.flipState(1);
    ctl.doAct('signout');
    expect(said(prompts(ctl.S, ctl.A))).toEqual([['cross', 'Choose'], ['circle', 'Cancel']]);
  });
});

describe('the rendered legend', () => {
  it('draws the prompts, then the disc chip and START, which names the launch target (no START on Home: LR-23)', () => {
    const { ctl } = boot();
    const legend = document.getElementById('legend')!;
    const kids = Array.from(legend.children).map((e) => e.className.split(' ')[0]);
    expect(kids).toEqual(['cx-prompts', 'cx-cluster', 'cx-legend__error']);
    expect(legend.classList.contains('is-ready')).toBe(true);
    // LR-23 (LR.R22, "Start game, gone"): Home draws no START pill (was: "Start game" here); Browse rooms keeps it.
    expect(legend.querySelector('.cx-start')).toBeNull();
    ctl.press('right');
    ctl.press('cross');
    const start = legend.querySelector('.cx-start')!;
    expect(start.textContent!.trim()).toBe('Start game');
    expect(start.classList.contains('is-ready')).toBe(true);
    ctl.press('cross');
    expect(legend.querySelector('.cx-start')).toBe(start);                     // patched in place
    expect(start.textContent!.trim()).toBe('Launch · Bravo');
  });

  it('a blocked START shows its warn line above the cluster, in the prototype\'s words', () => {
    const { ctl } = boot();
    ctl.flipState(0);
    ctl.press('options');
    const legend = document.getElementById('legend')!;
    expect(legend.querySelector('.cx-legend__error')!.textContent).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
    expect(legend.querySelector('.cx-start')).toBeNull();                      // LR-23: none on Home (was: aria-disabled)
    expect(legend.classList.contains('is-ready')).toBe(false);
  });

  it('under the sign-in dialog the cluster hides', () => {
    const { ctl } = boot();
    ctl.flipState(1);
    ctl.press('triangle');
    expect(document.querySelector('#legend .cx-cluster')).toBeNull();
    expect(document.querySelector('#overlay .cx-osk')).not.toBeNull();
  });
});

describe('the sample marker', () => {
  it('the header shows the prototype\'s states tag only while the sample adapters are in', () => {
    const { ctl } = boot();
    expect(document.querySelector('#header .cx-proto')).not.toBeNull();
    page!.dispose();
    mountShell(document);
    const live = { ...ctl.A, data: 'live' as const, states: undefined };
    page = bootConsole(document, window, live, { keymap: true });
    expect(document.querySelector('#header .cx-proto')).toBeNull();
  });
});
