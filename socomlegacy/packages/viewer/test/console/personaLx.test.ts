// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { personaEditHtml, personaHtml, personaItems, personaNewHtml } from '../../src/console/render/profile';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import {
  createState, PERSONA_DELETE_ROW, PERSONA_EDIT_ROWS, PERSONA_GENDER_ROW, PERSONA_NEW_ROWS, type Adapters, type PersonaEditorView, type PersonaListView, type ProfileAdapter,
} from '../../src/console/state';

/**
 * LR-4 (the launcher redesign plan, the row "Profile"; LR.R8): Personas -- the memory card's list, one persona's editor
 * and the new persona's form -- in the artifact's "Profiles" panel drawing (`S2-Launcher-v2.dc.html`: a row per profile
 * with its side value, then the create action) wearing the card's semantics (the spec, section 3: the artifact's local
 * launcher profiles are not built): LR-1's row kinds (`render/rows.ts`) under its panel head (`render/head.ts`). Every row
 * keeps its act (`pfrow`, `pfedit`, `pfnew`) and its index; the gender's step marks stay pointer controls (`pfstep`,
 * `pfnewstep`); a row whose Cross does nothing is the artifact's muted row; a locked row keeps its lock and its line.
 * The aside (the right panel, LR-1) stays the focused row's. A browser adaptation.
 */
const LIST: PersonaListView = {
  kind: 'ok', slotLine: 'Memory card slot 1', rows: [{ id: 'h', name: 'Hawk', host: '', signedIn: false }, { id: 'v', name: 'Viper', host: 'lobby.test:10075', signedIn: true }],
  empty: null, signedIn: 'Viper', held: true, create: { kind: 'ready', host: 'lobby.test', port: 10075, line: 'Filed under lobby.test' }, locked: null,
};
const PH = (i: number) => ({ kind: (i < 5 ? 'taunts' : 'messages') as 'taunts' | 'messages', slot: i % 5, label: `${i < 5 ? 'Taunt' : 'Message'} ${(i % 5) + 1}`, value: `p${i}`, own: true, gated: i === 9 ? 'locked' as const : null });
const EDITOR: PersonaEditorView = { kind: 'ok', id: 'v', name: 'Viper', host: '', town: 'Reno', gender: 1, phrases: Array.from({ length: 10 }, (_, i) => PH(i)), help: { taunts: 't', messages: 'm' }, locked: null };
function draw(o: { list?: PersonaListView; editor?: PersonaEditorView; lock?: string | null; screen?: 'persona' | 'personaEdit' | 'personaNew'; row?: number } = {}) {
  const A: Adapters = sampleAdapters();
  A.profile = { personas: () => o.list ?? LIST, editor: () => o.editor ?? EDITOR, locked: () => o.lock ?? null, matchName: () => 'Old' } as unknown as ProfileAdapter;
  const S = createState(A);
  S.screen = o.screen ?? 'persona';
  S.pf.row = o.row ?? 0; S.pf.id = 'v'; S.pf.edit = o.row ?? 0; S.pf.nw.row = o.row ?? 0;
  const box = document.createElement('div');
  box.innerHTML = S.screen === 'persona' ? personaHtml(S, A) : S.screen === 'personaEdit' ? personaEditHtml(S, A) : personaNewHtml(S, A);
  return { box, A, S };
}
const rows = (box: HTMLElement): HTMLElement[] => [...box.querySelectorAll<HTMLElement>('.cx-rlist > .cx-r')];
const label = (r: HTMLElement): string => r.querySelector('.cx-r__label')?.textContent ?? '';
const value = (r: HTMLElement): string => (r.querySelector('.cx-r__value') ?? r.querySelector('.cx-r__choice'))?.textContent ?? '';
const muted = (r: HTMLElement): boolean => r.classList.contains('is-muted') && r.getAttribute('aria-disabled') === 'true';

describe('Profile: Personas, the list (LR-4)', () => {
  it('the panel head: back to Profile, the h1 "Profiles", a description; the rows in one scroll box beside the aside; no old item', () => {
    const { box } = draw();
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Profiles');
    expect(box.querySelector('.cx-back')!.textContent).toBe('Profile');
    expect(box.querySelector('.cx-screenhead__desc')?.textContent ?? '').not.toBe('');
    expect(box.querySelector('.cx-item, .cx-list')).toBeNull();
    expect(box.querySelector('.cx-rlist[data-scroll]')!.getAttribute('data-key')).toBe('pf-list');
    expect(box.querySelector('.cx-screen__body > .cx-aside')).not.toBeNull();
  });

  it('a row per persona (its name, its server, SIGNED IN on the session\'s), New persona the primary action, the match name; act and index each', () => {
    const { box, A } = draw({ row: 1 });
    const r = rows(box);
    expect(r.map(label)).toEqual(['Hawk', 'Viper', 'New persona', 'Match name']);
    expect(r).toHaveLength(personaItems(A).length);
    r.forEach((x, i) => expect([x.dataset['act'], x.dataset['i']]).toEqual(['pfrow', String(i)]));
    expect(r.map(value)).toEqual(['', 'SIGNED IN', '', '']);
    expect(r.map((x) => x.classList.contains('is-good'))).toEqual([false, true, false, false]);   // the chip's ready tone
    expect(r[0]!.querySelector('.cx-r__hint')!.textContent).toBe('Server: this server');
    expect(r[2]!.classList.contains('cx-r--action') && r[2]!.classList.contains('is-primary')).toBe(true);
    expect(r[3]!.textContent).toContain('Old');
    expect(r.filter((x) => x.classList.contains('is-focused')).map(label)).toEqual(['Viper']);
  });

  it('a row whose Cross does nothing is muted (the session\'s persona the card does not hold, the empty card\'s note)', () => {
    const { box } = draw({ list: { ...LIST, rows: [], empty: 'No persona on this card', signedIn: 'Ghost', held: false } });
    const r = rows(box);
    expect(r.map(label)).toEqual(['Ghost', 'No persona on this card', 'New persona', 'Match name']);
    expect(r.map(muted)).toEqual([true, true, false, false]);
    expect(value(r[0]!)).toBe('SIGNED IN');
  });

  it('locked: New persona and the match name muted, each with its lock and its line; New persona refused: its Try again, the alert', () => {
    const lock = 'Edit your personas from the game';
    const r = rows(draw({ lock }).box);
    for (const x of [r[2]!, r[3]!]) { expect(muted(x)).toBe(true); expect(x.querySelector('.cx-r__icon')).not.toBeNull(); expect(x.querySelector('.cx-r__hint')!.textContent).toBe(lock); }
    expect(r.slice(0, 2).every((x) => !muted(x))).toBe(true);           // a persona still opens, read only
    const failed = rows(draw({ list: { ...LIST, create: { kind: 'failed', line: 'The universe did not answer' } } }).box)[2]!;
    expect([muted(failed), failed.classList.contains('is-primary'), failed.querySelector('.cx-r__icon') !== null]).toEqual([false, false, true]);
    const full = rows(draw({ list: { ...LIST, create: { kind: 'full', line: 'The card is full' } } }).box)[2]!;
    expect(muted(full)).toBe(true);
  });

  it('an unreadable card: its line, then the match name', () => {
    expect(rows(draw({ list: { kind: 'unreadable', line: 'No memory card can be read' } }).box).map(label)).toEqual(['Memory card', 'Match name']);
  });
});

describe('Profile: Personas, the editor and the new persona (LR-4)', () => {
  it('the editor: list rows with their values, Gender a select with its pointer steps, Delete the danger action; act and index each', () => {
    const { box } = draw({ screen: 'personaEdit' });
    const r = rows(box);
    expect(r).toHaveLength(PERSONA_EDIT_ROWS);
    expect(r.map(label).slice(0, 3)).toEqual(['Home town', 'Gender', 'Taunt 1']);
    r.forEach((x, i) => expect([x.dataset['act'], x.dataset['i']]).toEqual(['pfedit', String(i)]));
    expect([value(r[0]!), value(r[PERSONA_GENDER_ROW]!), value(r[2]!)]).toEqual(['Reno', 'Female', 'p0']);
    const g = r[PERSONA_GENDER_ROW]!;
    expect(g.classList.contains('cx-r--select')).toBe(true);
    expect([...g.querySelectorAll<HTMLElement>('button[data-act="pfstep"]')].map((b) => [b.dataset['i'], b.dataset['d']])).toEqual([[String(PERSONA_GENDER_ROW), '-1'], [String(PERSONA_GENDER_ROW), '1']]);
    expect(r[PERSONA_DELETE_ROW]!.classList.contains('is-danger')).toBe(true);
    expect(r[11]!.hasAttribute('data-gated')).toBe(true);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('Viper');
    expect(box.querySelector('.cx-back')!.textContent).toBe('Profiles');
    expect(box.querySelector('.cx-item, .cx-list, .cx-roller')).toBeNull();
  });

  it('the editor locked: every row muted, the lock in the head\'s checks and the aside', () => {
    const lock = 'The card is the game\'s now';
    const { box } = draw({ screen: 'personaEdit', editor: { ...EDITOR, locked: lock } });
    expect(rows(box)).toHaveLength(PERSONA_EDIT_ROWS);
    expect(rows(box).every(muted)).toBe(true);
    expect(box.querySelector('.cx-checks')!.textContent).toContain(lock);
    expect(box.querySelector('.cx-aside')!.textContent).toContain(lock);
  });

  it('the new persona: Name, Home town, Gender (its steps pfnewstep), Create the primary action; act and index each', () => {
    const { box } = draw({ screen: 'personaNew', row: 2 });
    const r = rows(box);
    expect(r).toHaveLength(PERSONA_NEW_ROWS);
    expect(r.map(label)).toEqual(['Name', 'Home town', 'Gender', 'Create persona']);
    r.forEach((x, i) => expect([x.dataset['act'], x.dataset['i']]).toEqual(['pfnew', String(i)]));
    expect(r.map(value).slice(0, 3)).toEqual(['Enter a name', 'Optional', 'Male']);
    expect(r[2]!.querySelectorAll('button[data-act="pfnewstep"]')).toHaveLength(2);
    expect(r[2]!.classList.contains('is-focused')).toBe(true);
    expect(r[3]!.classList.contains('is-primary')).toBe(true);
    expect(box.querySelector('h1.cx-title')!.textContent).toBe('New persona');
  });

  it('every card string is text', () => {
    const evil = '<img src=x onerror=1>';
    const { box } = draw({ list: { ...LIST, rows: [{ id: 'e', name: evil, host: evil, signedIn: false }] } });
    expect(box.querySelector('img')).toBeNull();
    expect(label(rows(box)[0]!)).toBe(evil);
  });
});
