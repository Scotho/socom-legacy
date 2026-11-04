// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MP_NAME_KEY, type PersonaRecord } from '@s2u/card';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveProfile, PERSONA_WORDS, personaId, type LiveProfile, type ProfileDeps } from '../../src/console/adapters/profile';
import { OSK_ROWS, pageList } from '../../src/console/grammar';
import { prompts } from '../../src/console/render/legend';
import { personaItems } from '../../src/console/render/profile';
import { FIELD_ID, PERSONA_DELETE_CONFIRM } from '../../src/console/render/overlay';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import {
  CATS, COMING_WORD, OVERLAY_LOCK_WORDS, PERSONA_EDIT_ROWS, cardLine, homeItems, type Adapters, type ConsolePageReads,
} from '../../src/console/state';
import type { NewPersona, PersonaKey, ProfileCardEdits } from '../../src/modern/profile/cardEdits';
import type { LauncherSnapshot, LauncherState } from '../../src/modern/launcherState';
import type { ModernSession, SessionSnapshot } from '../../src/modern/session';
import { mountShell } from './shell';

/**
 * CX-PERSONA (the console launcher plan; OT.R60 (c)): the Profile category's Persona and Service record as console
 * screens, pushed as the Armory's lists are, over `src/console/adapters/profile.ts`, in the console's own parts only --
 * the ActionList's items, the Options rollers and action rows, the sign-in dialog's field and on-screen keyboard, the
 * Confirm, the legend. The pad drives all of it (the keyboard is a development build's keymap over the same grammar,
 * OT.R29): Up / Down walk, Cross opens or edits, a field typed on the on-screen keyboard and R2 its Done, Delete behind
 * the Confirm starting on No, Circle back -- an open field cancelled first. The retired modern section's view and pad
 * cases are held here on the console. A browser adaptation with no original (OT.R28): nothing of the game's behaviour.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

const BASE = 'https://lobby.test';
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const record = (name: string, over: Partial<PersonaRecord> = {}): PersonaRecord => ({
  HOST: 'lobby.test', NAME: name, TOWN: '', GENDER: 0, PORT: 10075, PASSWORD: { length: 0 }, SAVEPASSWORD: 0,
  PROFILES: { PROFILE_CHECKSUM: new Array<number>(16).fill(0), PROFILE_INFO: [] }, ...over,
});
type Session = ModernSession & { go(name: string | null, ticket?: string | null): void };
function fakeSession(name: string | null = null, ticket: string | null = null): Session {
  let n = name; let t = ticket; const subs = new Set<(s: SessionSnapshot) => void>();
  return {
    state: () => (n === null ? 'signed-out' : 'signed-in'), account: () => (n === null ? null : { name: n }), ticket: () => t,
    error: () => null, remembers: () => false, onChange: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    signIn: async () => ({ ok: true }), create: async () => ({ ok: true }), signOut: vi.fn(async () => {}), close: () => {},
    go(next, tk = null) { n = next; t = tk; for (const cb of [...subs]) cb({ state: n === null ? 'signed-out' : 'signed-in', account: n === null ? null : { name: n }, error: null }); },
  };
}
const launcher = (disc: LauncherSnapshot['disc'] = 'empty'): LauncherState => ({ disc: () => disc, isoInserted: () => disc === 'ready', filename: () => null, onChange: () => () => undefined });
function fakeEdits(personas: PersonaRecord[] = []) {
  const state = { taunts: [null, null, null, null, null] as (string | null)[], messages: [null, null, null, null, null] as (string | null)[], personas };
  const spies = {
    setTaunt: vi.fn((i: number, t: string) => { state.taunts[i] = t; return true; }),
    setMessage: vi.fn((i: number, t: string) => { state.messages[i] = t; return true; }),
    createPersona: vi.fn((p: NewPersona) => { state.personas.push(record(p.name, { HOST: p.host, PORT: p.port, TOWN: p.town, GENDER: p.gender })); return true; }),
    setPersonaTown: vi.fn((k: PersonaKey, town: string) => { state.personas = state.personas.map((p) => (p.NAME === k.name ? { ...p, TOWN: town } : p)); return true; }),
    setPersonaGender: vi.fn((k: PersonaKey, g: 0 | 1) => { state.personas = state.personas.map((p) => (p.NAME === k.name ? { ...p, GENDER: g } : p)); return true; }),
    deletePersona: vi.fn((k: PersonaKey) => { state.personas = state.personas.filter((p) => p.NAME !== k.name); return true; }),
  };
  const edits: ProfileCardEdits = { usable: () => true, slot: () => 1, personas: () => [...state.personas], taunts: () => [...state.taunts], messages: () => [...state.messages], ...spies };
  return { edits, spies, state };
}
const json = (v: unknown, status = 200) => () => new Response(JSON.stringify(v), { status });
function router(routes: Record<string, () => Response | Promise<Response>>): typeof fetch {
  return (async (input: RequestInfo | URL) => { const h = routes[String(input).replace(BASE, '')]; return h ? h() : new Response('{}', { status: 404 }); }) as typeof fetch;
}
const ACCOUNT = (over: Record<string, unknown> = {}) => ({
  displayName: 'Hawk', serviceRecord: { clan: { name: 'Delta' }, friends: 3, ignored: 1, ladderPosted: true, stats: { posted: true, rows: [{ label: 'LADDER POSITION:', value: '12' }, { label: '<b>SCORE:</b>', value: '<img src=x onerror=1>' }] } }, ...over,
});

interface Booted { ctl: ConsolePage['ctl']; a: Adapters; p: LiveProfile; s: Session; f: ReturnType<typeof fakeEdits>; settings: { get(k: string): string | null; set: ReturnType<typeof vi.fn> } }
function boot(o: { s?: Session; personas?: PersonaRecord[]; mode?: 'page' | 'overlay'; page?: ConsolePageReads; deps?: Partial<ProfileDeps> } = {}): Booted {
  const s = o.s ?? fakeSession();
  const f = fakeEdits(o.personas ?? [record('Hawk'), record('Viper', { TOWN: 'Reno' })]);
  const store = new Map<string, string>([[MP_NAME_KEY, 'Old']]);
  const settings = { get: (k: string) => store.get(k) ?? null, set: vi.fn((k: string, v: string) => { store.set(k, v); return { ok: true }; }) };
  const subs = new Set<() => void>();
  const p = liveProfile(() => { for (const cb of [...subs]) cb(); }, {
    session: s, launcher: launcher(), base: BASE, edits: f.edits, settings, readHost: async () => ({ host: 'lobby.test', port: 10075 }),
    fetchFn: router({ '/modern/account': json(ACCOUNT()), '/lobby/loadout': json({ loadouts: [{ mission: 'MP2', seal: { charSet: 1, items: [1, 1, 1, 1, 1], valid: true }, terrorist: null }] }), '/lobby/ladder-position': json({ status: 0, ladderPosition: 3, totalRankings: 40 }) }),
    ...o.deps,
  });
  const base = sampleAdapters();
  const a: Adapters = {
    ...base, data: 'live', profile: p,
    session: { ...base.session, signedIn: () => s.state() === 'signed-in', persona: () => s.account()?.name ?? '' },
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
  };
  page = bootConsole(document, window, a, { keymap: true, mode: o.mode ?? 'page', ...(o.page ? { page: o.page } : {}) });
  return { ctl: page.ctl, a, p, s, f, settings };
}
const PROFILE = CATS.findIndex((c) => c.id === 'profile');
const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';
const cross = (b: Booted): string | undefined => prompts(b.ctl.S, b.a).find((x) => x.k === 'cross')?.label;
// LR-4: the Profile screens' rows are LR-1's (`render/rows.ts`): a row's title is its label, its value its value or choice.
const titles = (sel = '#stage .cx-rlist .cx-r__label'): string[] => [...document.querySelectorAll(sel)].map((e) => e.textContent ?? '');
/** The Profile category's row `title`, focused and pressed. */
async function openRow(b: Booted, title: string): Promise<void> {
  b.ctl.S.screen = 'home';
  b.ctl.S.cat = PROFILE;
  b.ctl.S.item[PROFILE] = homeItems('profile', b.ctl.S, b.a).findIndex((x) => x.title === (title === 'Service record' ? title : 'Profiles'));
  expect(b.ctl.S.item[PROFILE], title).toBeGreaterThanOrEqual(0);
  b.ctl.render();
  b.ctl.press('cross');
  await flush();
  b.ctl.render();
}
/** The focused list row of the screen shown (an item or a roller). */
const focusedTitle = (): string => text('#stage .cx-rlist .is-focused .cx-r__label');
/** Walks Down to the row whose title or label is `title`. */
function walkTo(b: Booted, title: string): void {
  for (let i = 0; i < 30 && focusedTitle() !== title; i++) b.ctl.press('down');
  expect(focusedTitle()).toBe(title);
}
/** Types `word` on the field's on-screen keyboard by the pad: the D-pad to each key, Cross, L2 for a capital. */
function oskType(b: Booted, word: string): void {
  const fd = b.ctl.S.fd;
  for (const ch of word) {
    if (ch === ' ') { b.ctl.press('triangle'); continue; }
    const lower = ch.toLowerCase();
    const r = OSK_ROWS.findIndex((row) => row.includes(lower));
    expect(r, ch).toBeGreaterThanOrEqual(0);
    const c = OSK_ROWS[r]!.indexOf(lower);
    const upper = ch !== lower;
    if (upper !== fd.shift) b.ctl.press('l2');
    while (fd.kr > r) b.ctl.press('up');
    while (fd.kr < r) b.ctl.press('down');
    while (fd.kc > c) b.ctl.press('left');
    while (fd.kc < c) b.ctl.press('right');
    b.ctl.press('cross');
  }
  if (fd.shift) b.ctl.press('l2');
}

describe('the Profile\'s rows push the Persona and Service record screens (no "Coming")', () => {
  it('signed in: Persona and Service record open their screens; Circle goes back to the row it came from', async () => {
    const b = boot({ s: fakeSession('Hawk', 'tk') });
    const items = homeItems('profile', b.ctl.S, b.a);
    const account = items.filter((x) => x.act !== 'loadout-sides' && x.act !== 'replays');
    expect(account.map((x) => [x.title, x.act])).toEqual([['Service record', 'record'], ['Profiles', 'persona'], ['Sign out', 'signout']]);
    expect(account.every((x) => x.state?.[0] !== COMING_WORD)).toBe(true);
    expect(items.find((x) => x.title === 'Loadouts')?.act).toBe('loadout-sides');
    await openRow(b, 'Hawk');
    expect([b.ctl.S.screen, text('#stage .cx-title')]).toEqual(['persona', 'Profiles']);
    b.ctl.press('circle');
    expect([b.ctl.S.screen, b.ctl.S.cat, b.ctl.S.item[PROFILE]]).toEqual(['home', PROFILE, 3]);
    await openRow(b, 'Service record');
    expect([b.ctl.S.screen, text('#stage .cx-title')]).toEqual(['record', 'Service record']);
    b.ctl.press('circle');
    expect([b.ctl.S.screen, b.ctl.S.item[PROFILE]]).toEqual(['home', 0]);
  });

  it('signed out: the card\'s personas are a row too, beside Sign in; the sample adapters (no profile adapter) keep "Coming"', async () => {
    const b = boot();
    expect(homeItems('profile', b.ctl.S, b.a).map((x) => [x.title, x.act])).toEqual([['Service record', 'signin'], ['Replays', 'replays'], ['Loadouts', 'loadout-sides'], ['Profiles', 'persona'], ['Sign in', 'signin']]);
    page!.dispose();
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const S = page.ctl.S;
    if (!page.ctl.A.session.signedIn()) page.ctl.A.states!.flip(1);   // the sample signed in
    expect(homeItems('profile', S, page.ctl.A).filter((x) => x.act.startsWith('todo:')).map((x) => x.title)).toEqual(['Service record', 'Profiles']);
  });
});

describe('the Persona screen', () => {
  it('the card\'s personas as ActionList rows, the signed-in one marked; New persona; the match name; Cross opens a persona\'s editor', async () => {
    const b = boot({ s: fakeSession('Viper', 'tk') });
    await openRow(b, 'Viper');
    expect(titles()).toEqual(['Hawk', 'Viper', 'New persona', 'Match name']);
    expect(text('#stage .cx-rlist > .cx-r:nth-child(2) .cx-r__value')).toBe('SIGNED IN');
    expect(text('#stage .cx-rlist')).toContain('Server: lobby.test:10075');
    expect(text('#stage .cx-rlist')).toContain('Old');
    expect(text('#stage')).toContain(PERSONA_WORDS.slot(1));
    expect(cross(b)).toBe('Edit');
    b.ctl.press('down');
    b.ctl.press('cross');
    expect([b.ctl.S.screen, text('#stage .cx-title')]).toEqual(['personaEdit', 'Viper']);
    expect(titles()).toEqual(['Home town', 'Gender', 'Taunt 1', 'Taunt 2', 'Taunt 3', 'Taunt 4', 'Taunt 5', 'Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5', 'Delete persona']);
    expect(titles()).toHaveLength(PERSONA_EDIT_ROWS);
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Reno');
    b.ctl.press('circle');
    expect([b.ctl.S.screen, focusedTitle()]).toEqual(['persona', 'Viper']);
  });

  it('every card and server string is drawn as text, never markup', async () => {
    const evil = '<img src=x onerror="window.__x=1">';
    const b = boot({ s: fakeSession(evil, 'tk'), personas: [record(evil, { TOWN: evil })] });
    b.settings.set(MP_NAME_KEY, evil);
    await openRow(b, evil);
    expect(document.querySelector('#stage img')).toBeNull();
    expect(titles()[0]).toBe(evil);
    b.ctl.press('cross');
    expect(document.querySelector('#stage img')).toBeNull();
    expect(text('#stage .cx-title')).toBe(evil);
  });
});

describe('the editors through the on-screen keyboard (the sign-in dialog\'s field)', () => {
  it('Home town: Cross opens the field on its value; the pad types on the keyboard; R2 saves through the card; the toast says so', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'Viper');
    b.ctl.press('cross');
    b.ctl.press('cross');                                           // Home town
    expect(b.ctl.S.overlay).toBe('field');
    expect(text('#overlay .cx-dialog__title')).toBe('Home town');
    expect(b.ctl.S.fd.text).toBe('Reno');
    expect((document.getElementById(FIELD_ID) as HTMLInputElement).value).toBe('Reno');
    for (let i = 0; i < 4; i++) b.ctl.press('square');               // Delete, four times
    oskType(b, 'Austin');
    expect(text('#overlay .cx-field__box')).toContain('Austin');
    expect(cross(b)).toBe('Type');
    expect(prompts(b.ctl.S, b.a).find((x) => x.k === 'R2')?.label).toBe('Save');
    b.ctl.press('r2');
    expect(b.f.spies.setPersonaTown).toHaveBeenCalledWith({ host: 'lobby.test', port: 10075, name: 'Viper' }, 'Austin');
    expect(b.ctl.S.overlay).toBeNull();
    expect(b.ctl.S.toast).toBe('Home town saved');
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Austin');
  });

  it('CX.R18 (the joint review, F2): the open field marks an unsaved edit for the app\'s update; saving clears it', async () => {
    const b = boot();
    const marked = (): boolean => document.documentElement.hasAttribute('data-unsaved-edit');
    await openRow(b, 'Personas on this card');
    walkTo(b, 'Viper');
    b.ctl.press('cross');
    expect(marked()).toBe(false);
    b.ctl.press('cross');                                           // Home town: the field opens
    expect(b.ctl.S.overlay).toBe('field');
    expect(marked()).toBe(true);
    b.ctl.press('r2');                                              // saved: the field closes
    expect(b.ctl.S.overlay).toBeNull();
    expect(marked()).toBe(false);
  });

  it('a refusal stays in the field, said in the section\'s words; nothing is written', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    b.ctl.press('cross');
    walkTo(b, 'Taunt 1');
    b.ctl.press('cross');
    expect(text('#overlay .cx-dialog__title')).toBe('Taunt 1');
    b.ctl.press('r2');                                              // empty
    expect(b.ctl.S.overlay).toBe('field');
    expect(text('#overlay .cx-field__error')).toBe('Enter some text');
    expect(b.f.spies.setTaunt).not.toHaveBeenCalled();
    oskType(b, 'Over here');
    b.ctl.press('r2');
    expect(b.f.spies.setTaunt).toHaveBeenCalledWith(0, 'Over here');
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Over here');
  });

  it('the match name: the field\'s rule, through Settings under MP_NAME_KEY', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'Match name');
    b.ctl.press('cross');
    expect(text('#overlay .cx-dialog__title')).toBe('Match name');
    for (let i = 0; i < 3; i++) b.ctl.press('square');
    oskType(b, 'New  Name ');
    b.ctl.press('r2');
    expect(b.settings.set).toHaveBeenLastCalledWith(MP_NAME_KEY, 'New Name');
    expect(text('#stage .cx-rlist .is-focused .cx-r__hint')).toContain('New Name');
  });

  it('a new persona: its name and home town through the keyboard, the gender a roller, Create files it under the universe read', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'New persona');
    b.ctl.press('cross');
    expect(b.ctl.S.screen).toBe('personaNew');
    expect(titles()).toEqual(['Name', 'Home town', 'Gender', 'Create persona']);
    expect(text('#stage')).toContain('Server: lobby.test:10075');
    b.ctl.press('cross');
    oskType(b, 'Cobra');
    b.ctl.press('r2');
    b.ctl.press('down');
    b.ctl.press('down');
    b.ctl.press('right');
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Female');
    b.ctl.press('down');
    expect(cross(b)).toBe('Create');
    b.ctl.press('cross');
    expect(b.f.spies.createPersona).toHaveBeenCalledWith({ name: 'Cobra', host: 'lobby.test', port: 10075, town: '', gender: 1 });
    // After a create, its home town (the section's focus rule): the new persona's editor on its first row.
    expect([b.ctl.S.screen, text('#stage .cx-title'), focusedTitle()]).toEqual(['personaEdit', 'Cobra', 'Home town']);
    expect(b.ctl.S.toast).toBe('Persona Cobra created');
  });

  it('a new persona refused (a name already held) says so on the warn line and stays', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'New persona');
    b.ctl.press('cross');
    b.ctl.press('cross');
    oskType(b, 'Hawk');
    b.ctl.press('r2');
    for (let i = 0; i < 3; i++) b.ctl.press('down');
    b.ctl.press('cross');
    expect(b.ctl.S.screen).toBe('personaNew');
    expect(b.ctl.S.legendError).toBe('You already have a persona by that name');
    expect(b.f.spies.createPersona).not.toHaveBeenCalled();
  });

  it('Gender: Left / Right on its roller write it at once', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    b.ctl.press('cross');
    b.ctl.press('down');
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Male');
    expect(prompts(b.ctl.S, b.a).find((x) => x.k === 'dpad-h')?.label).toBe('Change');
    b.ctl.press('right');
    expect(b.f.spies.setPersonaGender).toHaveBeenCalledWith({ host: 'lobby.test', port: 10075, name: 'Hawk' }, 1);
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Female');
  });
});

describe('Circle: an open field cancels first, then the screen goes back', () => {
  it('the field closed, nothing written, the editor still open on its row; the next Circle leaves the editor', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'Viper');
    b.ctl.press('cross');
    b.ctl.press('cross');
    oskType(b, 'x');
    b.ctl.press('circle');
    expect([b.ctl.S.overlay, b.ctl.S.screen, focusedTitle()]).toEqual([null, 'personaEdit', 'Home town']);
    expect(b.f.spies.setPersonaTown).not.toHaveBeenCalled();
    expect(text('#stage .cx-rlist .is-focused .cx-r__value, #stage .cx-rlist .is-focused .cx-r__choice')).toBe('Reno');
    b.ctl.press('circle');
    expect([b.ctl.S.screen, focusedTitle()]).toEqual(['persona', 'Viper']);
    b.ctl.press('circle');
    expect(b.ctl.S.screen).toBe('home');
  });

  it('a session change while a field is open keeps its typing (the retired section\'s review 4)', async () => {
    const s = fakeSession();
    const b = boot({ s });
    await openRow(b, 'Personas on this card');
    walkTo(b, 'Match name');
    b.ctl.press('cross');
    oskType(b, 'half');
    s.go('Hawk', 'tk');
    await flush();
    b.ctl.render();
    expect([b.ctl.S.overlay, b.ctl.S.fd.text]).toEqual(['field', 'Oldhalf']);
    expect((document.getElementById(FIELD_ID) as HTMLInputElement).value).toBe('Oldhalf');
  });

  it('on the new persona\'s screen Circle is Cancel: nothing created, back on New persona', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    walkTo(b, 'New persona');
    b.ctl.press('cross');
    b.ctl.press('cross');
    oskType(b, 'Cobra');
    b.ctl.press('circle');                                          // the field
    b.ctl.press('circle');                                          // the screen
    expect([b.ctl.S.screen, focusedTitle()]).toEqual(['persona', 'New persona']);
    expect(b.f.spies.createPersona).not.toHaveBeenCalled();
  });
});

describe('Delete behind the console\'s Confirm, starting on No', () => {
  it('Cross on Delete asks, No focused; No keeps it; Yes deletes by its key and goes back to the list', async () => {
    const b = boot();
    await openRow(b, 'Personas on this card');
    b.ctl.press('cross');
    walkTo(b, 'Delete persona');
    expect(cross(b)).toBe('Delete');
    b.ctl.press('cross');
    expect([b.ctl.S.overlay, b.ctl.S.confirmKind, b.ctl.S.confirmRow]).toEqual(['confirm', 'persona-delete', 0]);
    expect(text('#overlay .cx-dialog__lead')).toBe(PERSONA_WORDS.deleteLead('Hawk'));
    expect(text('#overlay .cx-toggle.is-focused')).toBe(PERSONA_DELETE_CONFIRM.no);
    b.ctl.press('cross');                                           // No
    expect([b.ctl.S.overlay, b.ctl.S.screen]).toEqual([null, 'personaEdit']);
    expect(b.f.spies.deletePersona).not.toHaveBeenCalled();
    b.ctl.press('cross');
    b.ctl.press('circle');                                          // Circle is No too
    expect(b.f.spies.deletePersona).not.toHaveBeenCalled();
    b.ctl.press('cross');
    b.ctl.press('down');
    b.ctl.press('cross');                                           // Yes
    expect(b.f.spies.deletePersona).toHaveBeenCalledWith({ host: 'lobby.test', port: 10075, name: 'Hawk' });
    expect(b.ctl.S.screen).toBe('persona');
    expect(titles()).toEqual(['Viper', 'New persona', 'Match name']);
    expect(focusedTitle()).toBe('New persona');                      // after a delete, New persona (the section's focus rule)
    expect(b.ctl.S.toast).toBe('Persona Hawk deleted');
  });
});

describe('the Service record screen', () => {
  it('the name, the rank and its mark, clan / friends / ignored / ladder, PLAYER INFO\'s rows and the loadouts, read only, as text', async () => {
    const b = boot({ s: fakeSession('Hawk', 'tk') });
    await openRow(b, 'Service record');
    await flush();
    // the disc's medal picture (mark 'medal') is the one <img> a row may hold; the assertions below scope to the rest
    const p0 = b.a.profile!;
    b.a.profile = { ...p0, record: () => { const v = p0.record(); return v.kind === 'signed-in' && v.rank ? { ...v, rank: { ...v.rank, mark: 'medal', picture: 'data:image/png;base64,AA' } } : v; } } as typeof p0;
    b.ctl.render();
    const stage = document.querySelector('#stage')!;
    expect(text('#stage [data-rank]')).toBe('ADMIRAL');
    expect(stage.querySelector<HTMLElement>('[data-rank]')!.dataset['mark']).toBe('medal');
    // LR-4: a record line is an LR-1 row (its label, then its value or its line), marked `data-record` as the item was.
    const rows = [...stage.querySelectorAll('.cx-rlist [data-record]')].map((li) => [li.querySelector('.cx-r__label')?.textContent ?? '', li.querySelector('.cx-r__value, .cx-r__hint')?.textContent ?? '']);
    expect(rows).toEqual([
      ['Name', 'Hawk'], ['Clan', 'Delta'], ['Friends', '3'], ['Ignored', '1'], ['Ladder', 'Posted'],
      ['LADDER POSITION:', '12'], ['<b>SCORE:</b>', '<img src=x onerror=1>'], ['MP2', 'SEAL Set · Terrorist Not set'],
    ]);
    expect(stage.querySelector('.cx-rlist img:not([data-medal-picture]), .cx-rlist b')).toBeNull();
    expect(cross(b)).toBeUndefined();                               // read only
    expect(prompts(b.ctl.S, b.a).find((x) => x.k === 'square')?.label).toBe('Refresh');
    b.ctl.press('down');
    expect(focusedTitle()).toBe('Clan');
  });

  it('a refused read says so and Cross is Try again; signed out, its line and Sign in', async () => {
    let ok = false;
    const b = boot({ s: fakeSession('Hawk', 'tk'), deps: { fetchFn: router({ '/modern/account': () => (ok ? json(ACCOUNT())() : new Response('{}', { status: 500 })), '/lobby/loadout': json({ loadouts: [] }), '/lobby/ladder-position': json({ status: 0, ladderPosition: 0, totalRankings: 0 }) }) } });
    await openRow(b, 'Service record');
    await flush();
    b.ctl.render();
    expect(text('#stage .cx-rlist')).toContain('Server unavailable.');
    expect(cross(b)).toBe('Try again');
    ok = true;
    b.ctl.press('cross');
    await flush();
    b.ctl.render();
    expect(text('#stage .cx-rlist')).toContain('Delta');
    expect(document.querySelector('#stage [data-rank]')).toBeNull();      // medal 0: no rank drawn
    b.s.go(null);
    b.ctl.render();
    expect(text('#stage .cx-rlist')).toContain(PERSONA_WORDS.signedOutRecord);
    expect(cross(b)).toBe('Sign in');
  });
});

describe('the locked lines (OT.R60: over every game page the card is the game\'s; the game holds the account, or a round runs)', () => {
  const reads = (o: { holds?: boolean; round?: boolean; game?: boolean }): ConsolePageReads & { holds: boolean; round: boolean; game: boolean } => {
    const r = { holds: o.holds ?? false, round: o.round ?? false, game: o.game ?? true, gameHolds: () => r.holds, roundRunning: () => r.round, gamePage: () => r.game };
    return r;
  };
  // The seat's call (CX-PERSONA, block 4 (1)): over any game page the overlay mounts on, the card edits are locked -- the
  // game's front end keeps and saves its own list of the card's personas -- whatever the session; one line for them all.
  for (const [why, r, row, edit] of [
    ['the game holds the account', { holds: true }, OVERLAY_LOCK_WORDS.personaGame, OVERLAY_LOCK_WORDS.editCard],
    ['a round runs', { round: true }, OVERLAY_LOCK_WORDS.personaRound, OVERLAY_LOCK_WORDS.editCard],
    ['a game page, neither', {}, null, OVERLAY_LOCK_WORDS.editCard],
    ['an overlay page with no game, the game holding the account', { holds: true, game: false }, OVERLAY_LOCK_WORDS.personaGame, OVERLAY_LOCK_WORDS.editGame],
  ] as const) {
    it(`${why}: the persona shown read only; every edit row locked with its line; Cross says it and opens nothing`, async () => {
      const b = boot({ s: fakeSession('Viper', 'tk'), mode: 'overlay', page: reads(r) });
      const persona = homeItems('profile', b.ctl.S, b.a)[3]!;
      expect([persona.title, persona.sub, persona.act]).toEqual(['Profiles', row ?? cardLine(b.a), 'persona']);
      await openRow(b, 'Viper');
      expect(b.ctl.S.screen).toBe('persona');
      expect(text('#stage .cx-rlist > .cx-r:nth-child(2) .cx-r__value')).toBe('SIGNED IN');
      walkTo(b, 'New persona');
      expect(text('#stage .cx-rlist .is-focused .cx-r__hint')).toBe(edit);
      expect(cross(b)).toBeUndefined();
      b.ctl.press('cross');
      expect([b.ctl.S.screen, b.ctl.S.legendError]).toEqual(['persona', edit]);
      walkTo(b, 'Match name');
      // The seat's look (CX-PERSONA's browser frames, p05/p06): the match name's row is marked as New persona's is --
      // the lock and its line on the row itself (OT.R60's refinement: each locked row says why in one line).
      const m = personaItems(b.a).find((x) => x.kind === 'match-name')!;
      expect([m.icon, m.sub, m.locked]).toEqual(['lock', edit, edit]);
      expect(text('#stage .cx-rlist .is-focused .cx-r__hint')).toBe(edit);
      b.ctl.press('cross');
      expect(b.ctl.S.overlay).toBeNull();
      b.ctl.S.pf.row = 0;
      b.ctl.render();
      b.ctl.press('cross');                                         // a persona's editor opens, read only
      expect(b.ctl.S.screen).toBe('personaEdit');
      const editRows = [...document.querySelectorAll('#stage .cx-rlist .cx-r')];          // LR-4: a locked row is the muted row
      expect(editRows).toHaveLength(PERSONA_EDIT_ROWS);
      expect(editRows.every((e) => e.classList.contains('is-muted') && e.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(text('#stage .cx-aside')).toContain(edit);
      b.ctl.press('cross');
      expect([b.ctl.S.overlay, b.ctl.S.legendError]).toEqual([null, edit]);
      b.ctl.press('right');
      walkTo(b, 'Delete persona');
      b.ctl.press('cross');
      expect(b.ctl.S.overlay).toBeNull();
      for (const s of Object.values(b.f.spies)) expect(s).not.toHaveBeenCalled();
      expect(b.settings.set).not.toHaveBeenCalled();
      // The Service record stays usable: read, drawn, its Refresh there.
      b.ctl.press('circle'); b.ctl.press('circle');
      await openRow(b, 'Service record');
      await flush();
      b.ctl.render();
      expect(b.ctl.S.screen).toBe('record');
      expect(text('#stage .cx-rlist')).toContain('Delta');
    });
  }

  it('a lock that begins while a field is open (an overlay page with no game): its Done refused with the line, nothing written', async () => {
    const r = reads({ game: false });
    const b = boot({ mode: 'overlay', page: r });
    await openRow(b, 'Personas on this card');
    b.ctl.press('cross');
    b.ctl.press('cross');
    oskType(b, 'x');
    r.round = true;
    b.ctl.press('r2');
    expect([b.ctl.S.overlay, text('#overlay .cx-field__error')]).toEqual(['field', OVERLAY_LOCK_WORDS.editRound]);
    expect(b.f.spies.setPersonaTown).not.toHaveBeenCalled();
  });
});

describe('the screens\' modules', () => {
  it('no key listener of their own (the keyboard is a development build\'s keymap, OT.R29) and no browser storage', () => {
    const root = resolve(import.meta.dirname, '../../src/console');
    for (const f of ['render/profile.ts', 'adapters/profile.ts']) {
      const src = readFileSync(resolve(root, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')).join('\n');
      expect(src, f).not.toMatch(/keydown|keyup|keypress|KeyboardEvent|addEventListener|localStorage|sessionStorage/);
    }
    expect(personaId(record('Hawk'))).toBe('lobby.test\u000010075\u0000Hawk');
  });
});

// CX-12: the persona list and a persona's editor are lists L2 / R2 page when they overflow their pane (the grammar's
// `pageList`; the page itself, `pageBy` over the host's measure, is `grammar.test.ts`'s).
describe('CX-12: the Profile\'s screens are paged lists', () => {
  it('the persona list and its editor: pageList holds each, and its set moves that screen\'s focus', async () => {
    const b = boot({ s: fakeSession('Viper', 'tk') });
    await openRow(b, 'Viper');
    const list = pageList(b.ctl.S, b.a)!;
    expect([list.at, list.count]).toEqual([b.ctl.S.pf.row, titles().length]);
    list.set(3);
    expect(b.ctl.S.pf.row).toBe(3);
    b.ctl.S.pf.row = 1;
    b.ctl.press('cross');
    expect(b.ctl.S.screen).toBe('personaEdit');
    const ed = pageList(b.ctl.S, b.a)!;
    expect(ed.count).toBe(PERSONA_EDIT_ROWS);
    ed.set(PERSONA_EDIT_ROWS - 1);
    expect(b.ctl.S.pf.edit).toBe(PERSONA_EDIT_ROWS - 1);
  });
});
