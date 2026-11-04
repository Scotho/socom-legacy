// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import type { ValveEntry } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { DiscAssets } from '../../src/modern/discAssets';
import type { LauncherSnapshot, LauncherState } from '../../src/modern/launcherState';
import { cardOptionStore } from '../../src/modern/settings/store';
import { mountShell } from './shell';

/**
 * LR-5 (the launcher redesign plan, the row "Settings"; LR.R1, LR.R8): System Settings' tabs keep their rows and their
 * locks -- the options adapter's, the memory card's through it -- and draw them in LR-1's row kinds (`render/rows.ts`):
 * a switch (Off / On) the artifact's toggle, a tuner or a numeric range its slider, a choice its select, an action row
 * its action (the destructive verb in the danger tone, a locked one muted), a locked row its lock word where the value
 * was. Every row keeps the grammar's act (`optrow`, its index, its focus key), and the pointer's step marks stay
 * (`optstep`, as the rollers' were). The tabs, the aside and the screen's own h1 stay. A browser adaptation: the launcher's
 * look, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
const TABLE: ValveEntry[] = [
  { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' }, { name: 'DISPLAY_MP_TEAM_NAMES', value: 1, type: 'PERSIST' },
  { name: 'HelpWindowsEnabled', value: 1, type: 'PERSIST' }, { name: 'VIBRATION_CONTROLLER', value: 1, type: 'PERSIST' },
  { name: 'stick_preset', value: 1, type: 'PERSIST' }, { name: 'ScreenOriginX', value: 100, type: 'PERSIST' },
  { name: 'STEREO_CONTROLLER', value: 1, type: 'PERSIST' },
];
function launcher(ready: boolean): LauncherState {
  const disc: LauncherSnapshot['disc'] = ready ? 'ready' : 'empty';
  const assets: DiscAssets = { readValveDefaults: async () => TABLE, readItemNames: async () => new Map() };
  return { disc: () => disc, isoInserted: () => disc === 'ready', filename: () => null, assets: () => (ready ? assets : null), onChange: () => () => {} };
}
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

function boot(o: { ready?: boolean; kept?: boolean } = {}) {
  const store = cardOptionStore(memory());
  const options = liveOptions(() => { page?.render(); }, {
    store, launcher: launcher(!!o.ready), signedIn: () => false, pads: () => [], touch: () => false,
    ...(o.kept ? { kept: { info: () => ({ bytes: 2e9, backend: 'opfs' as const, whole: true }), forget: async () => {} } } : {}),
  });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  return { ctl: page.ctl, store, options };
}
const open = (cat: string): void => { page!.ctl.doAct(`opt:${cat}`); page!.render(); };
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-key="options"] [data-act="optrow"]')];
const row = (label: string): HTMLElement => rows().find((r) => r.querySelector('.cx-r__label')?.textContent === label)!;
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

describe('LR-5: System Settings in LR-1\'s row kinds', () => {
  it('the rows are LR-1\'s .cx-r in its row list; no roller is drawn; the tabs, the aside and the h1 stay', async () => {
    boot({ ready: true });
    await flush();
    open('display');
    const list = document.querySelector<HTMLElement>('#stage [data-key="options"] [data-scroll]')!;
    expect(list.classList.contains('cx-rlist')).toBe(true);
    expect(list.dataset['key']).toBe('rows-display');
    expect(document.querySelector('#stage [data-key="options"] .cx-roller')).toBeNull();
    expect(rows().length).toBeGreaterThan(4);
    for (const [i, r] of rows().entries()) {
      expect(r.classList.contains('cx-r'), r.outerHTML).toBe(true);
      expect(r.dataset['i']).toBe(String(i));
      expect(r.dataset['fk']).toBe(`opt-display-${i}`);
    }
    expect(document.querySelectorAll('#stage .cx-tabs .cx-tab').length).toBe(3);   // Game: Display, Audio, Communication
    expect(document.querySelector('#stage h1.cx-title')!.textContent).toBe('Display');
    expect(document.querySelector('#stage .cx-aside')).not.toBeNull();
    expect(rows()[0]!.classList.contains('is-focused')).toBe(true);
  });

  it('a switch is the toggle: its state read, and its pill steps it to the other value', async () => {
    const { store } = boot({ ready: true });
    await flush();
    open('display');
    const bob = row('Head bob');
    expect(bob.classList.contains('cx-r--toggle')).toBe(true);
    expect(bob.getAttribute('role')).toBe('switch');
    expect(bob.getAttribute('aria-checked')).toBe('true');
    const pill = bob.querySelector<HTMLElement>('.cx-r__pill')!;
    expect(pill.dataset['act']).toBe('optstep');
    expect(pill.dataset['d']).toBe('-1');
    click(pill);
    expect(store.valve('BOBBING_1ST_PERSON')).toBe(0);
    expect(row('Head bob').getAttribute('aria-checked')).toBe('false');
    expect(row('Head bob').querySelector<HTMLElement>('.cx-r__pill')!.dataset['d']).toBe('1');
  });

  it('a value that differs from its default carries the is-changed marker (the Square-resets cue); at its default it does not (review-lr-5 F2)', async () => {
    boot({ ready: true });
    await flush();
    open('display');
    expect(row('Head bob').classList.contains('is-changed')).toBe(false);
    click(row('Head bob').querySelector('.cx-r__pill')!);
    expect(row('Head bob').classList.contains('is-changed')).toBe(true);
    click(row('Head bob').querySelector('.cx-r__pill')!);
    expect(row('Head bob').classList.contains('is-changed')).toBe(false);
  });

  it('a slider and a select carry the is-changed marker off their default too, and lose it back at the default (review-lr-5 F2)', async () => {
    boot({ ready: true });
    await flush();
    open('audio');
    const m0 = row('Music volume');
    expect(m0.classList.contains('cx-r--slider')).toBe(true);
    const was = m0.classList.contains('is-changed');
    click(m0.querySelector('[data-act="optstep"][data-d="1"]')!);
    expect(row('Music volume').classList.contains('is-changed')).toBe(!was);
    click(row('Music volume').querySelector('[data-act="optstep"][data-d="-1"]')!);
    expect(row('Music volume').classList.contains('is-changed')).toBe(was);
    const mode = row('Sound mode');
    expect(mode.classList.contains('cx-r--select')).toBe(true);
    const before = mode.classList.contains('is-changed');
    click(mode.querySelector('[data-act="optstep"][data-d="1"]')!);
    expect(row('Sound mode').classList.contains('is-changed')).not.toBe(before);
    click(row('Sound mode').querySelector('[data-act="optstep"][data-d="-1"]')!);
    expect(row('Sound mode').classList.contains('is-changed')).toBe(before);
  });

  it('a tuner is the slider (0-100 %, its value said), with the pointer\'s step marks either side', () => {
    const { store } = boot();
    open('audio');
    const music = row('Music volume');
    expect(music.classList.contains('cx-r--slider')).toBe(true);
    expect(music.getAttribute('role')).toBe('slider');
    expect(music.getAttribute('aria-valuemin')).toBe('0');
    expect(music.getAttribute('aria-valuemax')).toBe('100');
    expect(music.getAttribute('aria-valuenow')).toBe('74');
    expect(music.querySelector('.cx-r__value')!.textContent).toBe('74%');
    const steps = [...music.querySelectorAll<HTMLElement>('[data-act="optstep"]')];
    expect(steps.map((s) => s.dataset['d'])).toEqual(['-1', '1']);
    click(steps[1]!);
    expect(store.tuner('MUSIC_VOLUME')).toBeCloseTo(0.76, 5);
    expect(row('Music volume').querySelector('.cx-r__value')!.textContent).toBe('76%');
  });

  it('a choice is the select, its value in the label for a reader, its marks stepping it', async () => {
    const { store } = boot({ ready: true });
    await flush();
    open('audio');
    const mode = row('Sound mode');
    expect(mode.classList.contains('cx-r--select')).toBe(true);
    const word = mode.querySelector('.cx-r__choice')!.textContent!;
    expect(mode.getAttribute('aria-label')).toBe(`Sound mode: ${word}`);
    const marks = [...mode.querySelectorAll<HTMLElement>('.cx-r__step')];
    expect(marks.map((m) => [m.dataset['act'], m.dataset['d']])).toEqual([['optstep', '-1'], ['optstep', '1']]);
    const had = store.valve('STEREO_CONTROLLER');
    click(marks[1]!);
    expect(store.valve('STEREO_CONTROLLER')).not.toBe(had);
  });

  it('a locked row says its lock where the value was, marked locked, with no step marks', () => {
    boot({ ready: false });
    open('display');
    const bob = row('Head bob');
    expect(bob.classList.contains('is-locked')).toBe(true);
    expect(bob.querySelector('.cx-r__choice')!.textContent).toBe('Needs disc');
    expect(bob.querySelector('[data-act="optstep"]')).toBeNull();
  });

  it('an action row is the action, its word the hint, clicked as the pad\'s Cross (is-action); a destructive one danger, a locked one muted', () => {
    const { ctl } = boot({ kept: true });
    open('controller');
    const map = row('Button mapping');
    expect(map.classList.contains('cx-r--action')).toBe(true);
    expect(map.classList.contains('is-action')).toBe(true);
    // LR-20 (P12): its line says what it opens, not the verb again ("Remap" stays the legend's Cross).
    expect(map.querySelector('.cx-r__hint')!.textContent).toBe('Choose what each button does');
    open('app');
    const kept = row('Remove downloaded content');
    expect(kept.classList.contains('is-danger')).toBe(true);
    click(kept);
    expect(ctl.S.overlay).toBe('confirm');
    ctl.press('circle');
    open('account');
    const out = row('Sign out');
    expect(out.classList.contains('is-muted')).toBe(true);
    expect(out.classList.contains('is-locked')).toBe(true);
    expect(out.querySelector('.cx-r__hint')!.textContent).toBe('Sign in to change');
  });

  it('the pointer\'s hover still moves the focus to a row', () => {
    const { ctl } = boot();
    open('audio');
    document.documentElement.dataset['input'] = 'pointer';
    ctl.S.input = 'pointer';
    rows()[3]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(ctl.S.opt.row).toBe(3);
    expect(rows()[3]!.classList.contains('is-focused')).toBe(true);
  });
});
