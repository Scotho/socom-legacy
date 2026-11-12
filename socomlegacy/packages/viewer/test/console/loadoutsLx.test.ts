// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LOADOUT_UNOFFERED_WORDS, loadoutHtml, loadoutSidesHtml, loadoutsHtml } from '../../src/console/render/loadouts';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import {
  createState, LOADOUT_SAVE_ROW, loadoutSideItems, type Adapters, type LoadoutEditorView, type LoadoutListView, type LoadoutsAdapter,
} from '../../src/console/state';

/**
 * LR-4 (the launcher redesign plan, the row "Profile"; LR.R8): Loadouts -- the side chooser, a side's missions and the
 * editor -- in the artifact's drawing (`S2-Launcher-v2.dc.html`, its `loadouts` panel: a row per kit with its side value,
 * under the panel head with its description) in LR-1's row kinds (`render/rows.ts`). What they say is the server's and
 * the disc's (CX.R5): the missions and their stored state, the ARMORY's rollers; never the artifact's sample kits or its
 * "New loadout". Every row keeps its act (`loside`, `lorow`, `loedit`) and index, the rollers' step marks stay the
 * pointer's (`lostep`), a locked or refused screen's one row its Cross (`press`, `data-b="cross"`). A browser adaptation.
 */
const LIST: LoadoutListView = { kind: 'ok', rows: [{ mission: 'MP2', name: 'Vigilance', state: 'saved' }, { mission: 'MP3', name: 'Crossroads', state: 'default' }, { mission: 'MP9', name: 'Foxhunt', state: 'unoffered' }], empty: null };
const ROLL = (label: string, fixed: string | null = null) => ({ label, values: ['A', 'B'], at: 1, open: [true, true], fixed });
const EDITOR: LoadoutEditorView = {
  kind: 'ok', mission: 'MP2', name: 'Vigilance', head: 'SEAL loadouts', held: 'Stored on the server: type 1', busy: false, dirty: false,
  rows: [ROLL('Character type'), ROLL('Primary'), ROLL('Secondary', 'Locked: the ARMORY does not let this slot change'), ROLL('Equipment 1'), ROLL('Equipment 2'), ROLL('Equipment 3')],
};
function draw(o: { list?: LoadoutListView; editor?: LoadoutEditorView; screen?: 'loadoutSides' | 'loadouts' | 'loadout'; row?: number } = {}) {
  const A: Adapters = sampleAdapters();
  A.loadouts = { list: () => o.list ?? LIST, editor: () => o.editor ?? EDITOR } as unknown as LoadoutsAdapter;
  const S = createState(A);
  S.screen = o.screen ?? 'loadouts';
  S.lo.side = 'seal'; S.lo.row = o.row ?? 0; S.lo.edit = o.row ?? 0;
  const box = document.createElement('div');
  box.innerHTML = S.screen === 'loadoutSides' ? loadoutSidesHtml(S, A) : S.screen === 'loadouts' ? loadoutsHtml(S, A) : loadoutHtml(S, A);
  return { box, A };
}
const rows = (box: HTMLElement): HTMLElement[] => [...box.querySelectorAll<HTMLElement>('.cx-rlist > .cx-r')];
const label = (r: HTMLElement): string => r.querySelector('.cx-r__label')?.textContent ?? '';
const value = (r: HTMLElement): string => (r.querySelector('.cx-r__value') ?? r.querySelector('.cx-r__choice'))?.textContent ?? '';
const muted = (r: HTMLElement): boolean => r.classList.contains('is-muted') && r.getAttribute('aria-disabled') === 'true';

describe('Profile: Loadouts (LR-4)', () => {
  it('the side chooser: SEAL and Terrorist as link rows (their icon, their line), act loside and index; the panel head\'s description', () => {
    const { box, A } = draw({ screen: 'loadoutSides', row: 1 });
    const r = rows(box);
    expect(r.map(label)).toEqual(loadoutSideItems(A).map((x) => x.title));
    expect(r.map((x) => x.querySelector('.cx-r__hint')!.textContent)).toEqual(loadoutSideItems(A).map((x) => x.sub));
    r.forEach((x, i) => { expect(x.classList.contains('cx-r--link')).toBe(true); expect([x.dataset['act'], x.dataset['i']]).toEqual(['loside', String(i)]); expect(x.querySelector('.cx-r__icon')).not.toBeNull(); });
    expect(r.filter((x) => x.classList.contains('is-focused')).map(label)).toEqual(['Terrorist']);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Loadouts');
    expect(box.querySelector('.cx-screenhead__desc')?.textContent ?? '').not.toBe('');
    expect(box.querySelector('.cx-item, .cx-list')).toBeNull();
  });

  it('a side\'s missions: a row per mission, its state the side value; not offered muted with its lock and its line; act, index, mission', () => {
    const { box } = draw({ row: 1 });
    const r = rows(box);
    expect(r.map((x) => [label(x), value(x)])).toEqual([['Vigilance', 'SAVED'], ['Crossroads', 'DEFAULT'], ['Foxhunt', 'NOT OFFERED']]);
    r.forEach((x, i) => expect([x.dataset['act'], x.dataset['i']]).toEqual(['lorow', String(i)]));
    expect(r.map((x) => x.dataset['mission'])).toEqual(['MP2', 'MP3', 'MP9']);
    expect(r.map(muted)).toEqual([false, false, true]);
    expect(r.map((x) => x.classList.contains('is-good'))).toEqual([true, false, false]);   // SAVED keeps the chip's ready tone
    expect(r[2]!.querySelector('.cx-r__icon')).not.toBeNull();
    expect(r[2]!.querySelector('.cx-r__hint')!.textContent).toBe(LOADOUT_UNOFFERED_WORDS);
    expect(r.filter((x) => x.classList.contains('is-focused')).map(label)).toEqual(['Crossroads']);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('SEAL loadouts');
    expect(box.querySelector('.cx-rlist')!.getAttribute('data-key')).toBe('lo-list-seal');
    expect(box.querySelector('.cx-screen__body > .cx-aside')).not.toBeNull();
    expect(box.textContent).not.toMatch(/New loadout|Assault|Marksman/);
  });

  it('locked and refused: one row, focused, whose Cross is the legend\'s (press, cross), its lock or alert; reading: a busy line', () => {
    const lk = rows(draw({ list: { kind: 'locked', lock: 'disc', title: 'Choose your disc', line: 'Loadouts need your disc' } }).box);
    expect(lk).toHaveLength(1);
    expect([label(lk[0]!), lk[0]!.dataset['act'], lk[0]!.dataset['b'], lk[0]!.dataset['lock'], lk[0]!.classList.contains('is-focused')]).toEqual(['Choose your disc', 'press', 'cross', 'disc', true]);
    expect(lk[0]!.textContent).toContain('Loadouts need your disc');
    expect(lk[0]!.querySelector('.cx-r__icon')).not.toBeNull();
    const fl = rows(draw({ list: { kind: 'failed', words: 'Server unavailable.' } }).box)[0]!;
    expect([label(fl), fl.dataset['act'], fl.dataset['b']]).toEqual(['Server unavailable.', 'press', 'cross']);
    expect(fl.textContent).toContain('Press Cross to try again.');
    const rd = draw({ list: { kind: 'loading' } }).box.querySelector('.cx-rlist [aria-busy="true"]')!;
    expect(rd.textContent).toContain('Reading…');
  });

  it('the editor: the type and five slots as select rows with their pointer steps (lostep), Save the primary action; act and index each', () => {
    const { box } = draw({ screen: 'loadout', row: 2 });
    const r = rows(box);
    expect(r.map(label)).toEqual(['Character type', 'Primary', 'Secondary', 'Equipment 1', 'Equipment 2', 'Equipment 3', 'Save loadout']);
    r.forEach((x, i) => expect([x.dataset['act'], x.dataset['i']]).toEqual(['loedit', String(i)]));
    for (const x of r.slice(0, 6)) { expect(x.classList.contains('cx-r--select')).toBe(true); expect(x.querySelectorAll('button[data-act="lostep"]')).toHaveLength(2); expect(value(x)).toBe('B'); }
    expect([muted(r[2]!), muted(r[1]!)]).toEqual([true, false]);                       // a fixed slot is held
    expect(r[2]!.getAttribute('aria-label')).toContain('Locked: the ARMORY');
    expect(r[LOADOUT_SAVE_ROW]!.classList.contains('is-primary')).toBe(true);
    expect(box.querySelector('[data-lo-held]')!.textContent).toMatch(/stored on the server/i);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Vigilance');
    expect(box.querySelector('.cx-roller, .cx-list')).toBeNull();
  });

  it('the editor saving: every row held, Save muted saying so, the screen busy', () => {
    const { box } = draw({ screen: 'loadout', editor: { ...EDITOR, busy: true } });
    const r = rows(box);
    expect(r).toHaveLength(7);
    expect(r.every(muted)).toBe(true);
    expect(r[LOADOUT_SAVE_ROW]!.textContent).toContain('Saving…');
    expect(box.querySelector('.cx-screen')!.getAttribute('aria-busy')).toBe('true');
  });
});
