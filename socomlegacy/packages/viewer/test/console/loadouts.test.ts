// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArmoryData } from '../../src/armoryData';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveLoadouts, LOADOUT_LOCK_WORDS, LOADOUT_ROUND_WORDS } from '../../src/console/adapters/loadouts';
import { pageList } from '../../src/console/grammar';
import { prompts } from '../../src/console/render/legend';
import { LOADOUT_DEFAULTS_CONFIRM, LOADOUT_LEAVE_CONFIRM } from '../../src/console/render/overlay';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { UNSAVED_EDIT_MARK } from '../../src/pwa/matchSignals';
import { CATS, COMING_WORD, homeItems, loadoutSideItems, LOADOUT_SAVE_ROW, OVERLAY_LOCK_WORDS, type Adapters, type ConsolePageReads } from '../../src/console/state';
import { missionData } from './loadout/fixture';
import { BASE, flush, launcherWith, server, session, type Launcher, type Session } from './loadout/rig';
import { mountShell } from './shell';

/**
 * CX-LOADOUTS (the console launcher plan; OT.R60 (c)): the Armory's SEAL and Terrorist loadouts as console screens, pushed
 * as Browse rooms and the replays list are, over `src/console/adapters/loadouts.ts`, in the console's own parts only --
 * the ActionList's items for the mission list, the Options rollers for the type and the five slots, the Confirm, the
 * legend. The pad drives all of it (the keyboard is a development build's keymap over the same grammar, OT.R29): Up /
 * Down walk, Left / Right step a roller, Cross opens or saves, Square on a slot saves (the ARMORY's Square, S5), Triangle
 * the defaults behind the Confirm, Circle back -- asking first while there are unsaved changes. The cases the retired
 * modern section's pad and view tests held (`test/modern/loadout/*`, `padReset`, `roller`, `signedOutEmpty`) are held
 * here on the console. A browser adaptation with no original (OT.R28): nothing of the game's behaviour.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

interface Booted { ctl: ConsolePage['ctl']; a: Adapters; s: Session; l: Launcher; srv: ReturnType<typeof server>; choose: ReturnType<typeof vi.fn> }
function boot(o: {
  s?: Session; l?: Launcher; srv?: ReturnType<typeof server>; mode?: 'page' | 'overlay'; page?: ConsolePageReads;
  readMission?: (m: string) => Promise<ArmoryData | null>;
} = {}): Booted {
  const s = o.s ?? session(), l = o.l ?? launcherWith(), srv = o.srv ?? server();
  const base = sampleAdapters();
  const subs = new Set<() => void>();
  const loadouts = liveLoadouts(() => { for (const cb of [...subs]) cb(); }, { session: s, launcher: l, base: BASE, fetchFn: srv.fetchFn, readMission: o.readMission ?? (async (m) => missionData(m)) });
  const choose = vi.fn(async () => false);
  const a: Adapters = {
    ...base, data: 'live', loadouts,
    session: { ...base.session, signedIn: () => s.state() === 'signed-in' },
    disc: { ...base.disc, state: () => (l.disc() === 'ready' ? 'ready' : 'empty'), choose },
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
  };
  page = bootConsole(document, window, a, { keymap: true, mode: o.mode ?? 'page', ...(o.page ? { page: o.page } : {}) });
  return { ctl: page.ctl, a, s, l, srv, choose };
}
const PROFILE = CATS.findIndex((c) => c.id === 'profile');
const loadoutAt = (b: Booted, side: 'seal' | 'terrorist'): number =>
  homeItems('profile', b.ctl.S, b.a).findIndex((x) => x.title === 'Loadouts');
/** Profile's loadout row for `side`, focused and pressed; the list's reads let settle. */
async function openList(b: Booted, side: 'seal' | 'terrorist' = 'seal'): Promise<void> {
  b.ctl.S.screen = 'home';
  b.ctl.S.cat = PROFILE;
  b.ctl.S.item[PROFILE] = loadoutAt(b, side);
  b.ctl.render();
  b.ctl.press('cross');
  b.ctl.S.lo.row = side === 'seal' ? 0 : 1;
  b.ctl.press('cross');
  await flush();
  b.ctl.render();
}
/** The list's row of `mission` focused and pressed: the editor, its world let settle. */
async function openEditor(b: Booted, mission: string): Promise<void> {
  const rows = [...document.querySelectorAll<HTMLElement>('#stage [data-act="lorow"]')];
  const i = rows.findIndex((r) => r.dataset['mission'] === mission);
  expect(i, mission).toBeGreaterThanOrEqual(0);
  b.ctl.S.lo.row = i;
  b.ctl.press('cross');
  await flush();
  b.ctl.render();
}
const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';
const listRows = (): [string, string][] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="lorow"]')]
  .map((r) => [r.querySelector('.cx-r__label')!.textContent ?? '', r.querySelector('.cx-r__value')?.textContent ?? '']);
const editRows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="loedit"]')];
// LR-4: the rows are LR-1's (`render/rows.ts`): a roller's value its choice; Save, an action row, says its state in its line.
const value = (i: number): string => editRows()[i]!.querySelector('.cx-r__choice, .cx-r__hint')?.textContent ?? '';
const puts = (b: Booted): unknown[] => b.srv.calls.filter((c) => c.init.method === 'PUT').map((c) => JSON.parse(String(c.init.body)));
const cross = (b: Booted): string | undefined => prompts(b.ctl.S, b.a).find((p) => p.k === 'cross')?.label;

describe('the Armory\'s rows push each side\'s mission list (no "Coming")', () => {
  it('SEAL and Terrorist loadouts open their lists; Circle goes back to the row it came from', async () => {
    const b = boot();
    const items = loadoutSideItems(b.a);
    expect(items.map((x) => x.act)).toEqual(['loadouts:seal', 'loadouts:terrorist']);
    expect(items.every((x) => x.state?.[0] !== COMING_WORD)).toBe(true);
    for (const side of ['seal', 'terrorist'] as const) {
      await openList(b, side);
      expect([b.ctl.S.screen, b.ctl.S.lo.side]).toEqual(['loadouts', side]);
      expect(text('#stage .cx-title')).toBe(side === 'seal' ? 'SEAL loadouts' : 'Terrorist loadouts');
      expect(listRows().map(([t]) => t)).toEqual(['VIGILANCE', 'CROSSROADS', 'FROSTFIRE', 'NIGHT STALKER']);
      expect(cross(b)).toBe('Open');
      b.ctl.press('circle');
      expect([b.ctl.S.screen, b.ctl.S.cat, b.ctl.S.item[PROFILE]]).toEqual(['loadoutSides', PROFILE, loadoutAt(b, side)]);
    }
  });

  it('nothing is read at the boot: the records are asked when a list opens (OT.R14)', async () => {
    const b = boot();
    await flush();
    expect(b.srv.calls).toEqual([]);
    await openList(b);
    expect(b.srv.calls.map((c) => c.url).sort()).toEqual([`${BASE}/lobby/loadout`, `${BASE}/maps`]);
  });

  it('each row says its mission\'s state: SAVED, DEFAULT, and a record for a map not offered, which never opens', async () => {
    const kept = { charSet: 2, items: [1, 75, 36, 37, 35], valid: true };
    const b = boot({ srv: server({ records: [{ mission: 'MP2', seal: kept, terrorist: null }, { mission: 'MP53', seal: kept, terrorist: null }] }) });
    await openList(b);
    expect(listRows()).toEqual([['VIGILANCE', 'DEFAULT'], ['CROSSROADS', 'DEFAULT'], ['FROSTFIRE', 'SAVED'], ['NIGHT STALKER', 'DEFAULT'], ['FOXHUNT', 'NOT OFFERED']]);
    const foxhunt = document.querySelectorAll<HTMLElement>('#stage [data-act="lorow"]')[4]!;
    expect(foxhunt.classList.contains('is-muted')).toBe(true);
    expect(foxhunt.textContent).toContain('Not offered by this server');
    b.ctl.S.lo.row = 4;
    b.ctl.render();
    expect(cross(b)).toBeUndefined();
    b.ctl.press('cross');
    expect(b.ctl.S.screen).toBe('loadouts');
    expect(b.ctl.S.legendError).toMatch(/not offered by this server/i);
  });

  it('the records being read: the list says so, and nothing opens', async () => {
    let answer!: (r: Response) => void;
    const b = boot({ srv: server({ get: () => new Promise<Response>((r) => { answer = r; }) }) });
    await openList(b);
    expect(text('#stage .cx-rlist')).toContain('Reading…');
    expect(cross(b)).toBeUndefined();
    answer(new Response(JSON.stringify({ loadouts: [] })));
    await flush();
    b.ctl.render();
    expect(listRows()).toHaveLength(4);
  });

  it('the records\' read refused: said, Cross is Try again', async () => {
    const b = boot({ srv: server({ get: () => new Response('{}', { status: 500 }) }) });
    await openList(b);
    expect(text('#stage .cx-rlist')).toContain('Server unavailable.');
    expect(cross(b)).toBe('Try again');
    b.srv.set({ get: () => new Response(JSON.stringify({ loadouts: [] })) });
    b.ctl.press('cross');
    await flush();
    b.ctl.render();
    expect(listRows()).toHaveLength(4);
  });
});

describe('the editor: the console\'s rollers over the ARMORY\'s rules', () => {
  it('Cross opens it: the type roller at the top, the five slots, then Save; Up / Down walk them in that order; Circle goes back', async () => {
    const b = boot();
    await openList(b);
    await openEditor(b, 'MP2');
    expect(b.ctl.S.screen).toBe('loadout');
    expect(text('#stage .cx-title')).toBe('FROSTFIRE');
    expect(editRows().map((r) => r.querySelector('.cx-r__label')!.textContent)).toEqual(['Character type', 'Primary', 'Secondary', 'Equipment 1', 'Equipment 2', 'Equipment 3', 'Save loadout']);
    expect(value(0)).toBe('Type 1');
    expect(value(1)).toBe('M4A1');
    expect(text('#stage [data-lo-held]')).toMatch(/nothing stored/i);
    const focused = (): number => editRows().findIndex((r) => r.classList.contains('is-focused'));
    expect(focused()).toBe(0);
    for (let i = 1; i <= LOADOUT_SAVE_ROW + 1; i++) b.ctl.press('down');
    expect(focused()).toBe(LOADOUT_SAVE_ROW);
    expect(cross(b)).toBe('Save');
    b.ctl.press('up');
    expect(prompts(b.ctl.S, b.a).find((p) => p.k === 'dpad-h')?.label).toBe('Change');
    b.ctl.press('circle');
    expect(b.ctl.S.screen).toBe('loadouts');
  });

  it('Left / Right step the type and a slot; the held item is drawn as text; nothing is unsaved after stepping back', async () => {
    const l = launcherWith();
    l.names.mockImplementation(async () => new Map([[18, '<b>M4A1</b>']]));
    const b = boot({ l });
    await openList(b);
    await openEditor(b, 'MP2');
    expect(value(1)).toBe('<b>M4A1</b>');
    expect(document.querySelector('#stage b')).toBeNull();
    b.ctl.press('right');
    expect(value(0)).toBe('Type 2');
    b.ctl.press('left');
    expect(value(0)).toBe('Type 1');
    b.ctl.press('down');
    const before = value(1);
    b.ctl.press('right');
    expect(value(1)).not.toBe(before);
    // A roller changed keeps the focus on itself across the redraw (the retired section's focus keeping).
    expect(editRows().findIndex((r) => r.classList.contains('is-focused'))).toBe(1);
    b.ctl.press('left');
    expect(value(1)).toBe(before);
    b.ctl.press('circle');
    expect([b.ctl.S.screen, b.ctl.S.overlay]).toEqual(['loadouts', null]);   // nothing unsaved: no question
  });

  it('a fixed slot is drawn locked and says why; its Left / Right move nothing', async () => {
    const c4 = (m: string): ArmoryData => {
      const d = missionData(m);
      const characters = (d.roster as unknown as { characters: { side: string; index: number; loadout: number[] }[] }).characters
        .map((c) => (c.side === 'seal' && c.index === 0 ? { ...c, loadout: [54, 15, 121, 126, 151] } : c));
      return { ...d, roster: { ...d.roster!, characters } as unknown as ArmoryData['roster'] };
    };
    const b = boot({ readMission: async (m) => c4(m) });
    await openList(b);
    await openEditor(b, 'MP2');
    b.ctl.S.lo.edit = 5;
    b.ctl.render();
    const row = editRows()[5]!;
    expect(row.classList.contains('is-muted')).toBe(true);
    expect(text('#stage .cx-aside')).toMatch(/locked: the ARMORY does not let this slot change/i);
    const before = value(5);
    b.ctl.press('right');
    expect(value(5)).toBe(before);
  });

  it('Square on a slot saves, as the ARMORY\'s Square does -- the Save row\'s own PUT; the toast says it landed; Square on the type sends nothing', async () => {
    const b = boot();
    await openList(b);
    await openEditor(b, 'MP2');
    b.ctl.press('square');                                           // the type row: the original's character select has no Square
    await flush();
    expect(puts(b)).toEqual([]);
    b.ctl.press('down');
    b.ctl.press('right');
    b.ctl.press('square');
    await flush();
    expect(puts(b)).toHaveLength(1);
    expect(b.ctl.S.toast).toBe('Saved: MP2 · SEALs');
    b.ctl.render();
    expect(text('#stage [data-lo-held]')).toMatch(/stored on the server: type 1/i);
    b.ctl.S.lo.edit = LOADOUT_SAVE_ROW;
    b.ctl.press('cross');
    await flush();
    expect(puts(b)).toEqual([puts(b)[0], puts(b)[0]]);              // the same record as Save sends
    b.ctl.press('circle');
    expect(b.ctl.S.screen).toBe('loadouts');                         // saved: nothing to ask
    b.ctl.render();
    expect(listRows()[2]).toEqual(['FROSTFIRE', 'SAVED']);
  });

  it('a save out: the Save row says so and a second press sends nothing; a refusal is said on the warn line, never a toast', async () => {
    let answer!: (r: Response) => void;
    const b = boot({ srv: server({ put: () => new Promise<Response>((r) => { answer = r; }) }) });
    await openList(b);
    await openEditor(b, 'MP2');
    b.ctl.S.lo.edit = LOADOUT_SAVE_ROW;
    b.ctl.press('cross');
    expect(value(LOADOUT_SAVE_ROW)).toBe('Saving…');
    expect(document.querySelector('#stage .cx-screen')!.getAttribute('aria-busy')).toBe('true');
    b.ctl.press('cross');
    b.ctl.S.lo.edit = 1;
    b.ctl.press('square');                                           // Square on a slot while the save is out: nothing more
    b.ctl.S.lo.edit = LOADOUT_SAVE_ROW;
    b.ctl.render();
    expect(puts(b)).toHaveLength(1);
    answer(new Response(null, { status: 400 }));
    await flush();
    expect(b.ctl.S.legendError).toMatch(/refused this loadout/i);
    expect(b.ctl.S.toast).toBe('');
    // Save keeps the focus through its round trip.
    b.ctl.render();
    expect(editRows()[LOADOUT_SAVE_ROW]!.classList.contains('is-focused')).toBe(true);
    expect([value(LOADOUT_SAVE_ROW), editRows()[LOADOUT_SAVE_ROW]!.getAttribute('aria-disabled')]).toEqual(['', null]);   // Save ready again
  });

  it('Triangle asks the Confirm first, its safe answer focused: No keeps the kit; Yes gives the type\'s own kit and clears the stored record', async () => {
    const stored = { charSet: 1, items: [1, 75, 36, 37, 35], valid: true };
    const b = boot({ srv: server({ records: [{ mission: 'MP2', seal: stored, terrorist: null }] }) });
    await openList(b);
    await openEditor(b, 'MP2');
    expect(value(1)).toBe('M16A2');
    b.ctl.press('triangle');
    expect([b.ctl.S.overlay, b.ctl.S.confirmKind, b.ctl.S.confirmRow]).toEqual(['confirm', 'loadout-defaults', 0]);
    expect(text('#overlay .cx-dialog__title')).toBe(LOADOUT_DEFAULTS_CONFIRM.title);
    expect(text('#overlay .cx-toggle.is-focused')).toBe(LOADOUT_DEFAULTS_CONFIRM.no);
    b.ctl.press('cross');
    expect(b.ctl.S.overlay).toBeNull();
    expect(value(1)).toBe('M16A2');
    expect(puts(b)).toEqual([]);
    b.ctl.press('triangle');
    b.ctl.press('right');
    expect(text('#overlay .cx-toggle.is-focused')).toBe(LOADOUT_DEFAULTS_CONFIRM.yes);
    b.ctl.press('cross');
    await flush();
    b.ctl.render();
    expect(value(1)).toBe('M4A1');
    expect(puts(b)).toEqual([{ mission: 'MP2', side: 'seal', profile: { ...stored, valid: false } }]);
    expect(b.ctl.S.toast).toBe('Defaults: the stored loadout for MP2 · SEALs is cleared');
  });

  it('Circle with unsaved changes asks first: No stays with the change; Yes leaves, the change dropped', async () => {
    const b = boot();
    await openList(b);
    await openEditor(b, 'MP2');
    b.ctl.press('down');
    b.ctl.press('right');
    const changed = value(1);
    b.ctl.press('circle');
    expect([b.ctl.S.overlay, b.ctl.S.confirmKind, b.ctl.S.confirmRow]).toEqual(['confirm', 'loadout-leave', 0]);
    expect(text('#overlay .cx-dialog__title')).toBe(LOADOUT_LEAVE_CONFIRM.title);
    b.ctl.press('circle');                                           // Circle in the Confirm is its No
    expect([b.ctl.S.screen, b.ctl.S.overlay]).toEqual(['loadout', null]);
    expect(value(1)).toBe(changed);
    b.ctl.press('circle');
    b.ctl.press('down');
    b.ctl.press('cross');
    expect([b.ctl.S.screen, b.ctl.S.overlay]).toEqual(['loadouts', null]);
    await openEditor(b, 'MP2');
    expect(value(1)).toBe('M4A1');                                   // the change was dropped
    expect(puts(b)).toEqual([]);
  });

  it('CX.R18: an unsaved change marks <html> for the app\'s update (no reload over it); stepping back and the dispose clear it', async () => {
    const b = boot();
    const marked = (): boolean => document.documentElement.hasAttribute(UNSAVED_EDIT_MARK);
    await openList(b);
    await openEditor(b, 'MP2');
    expect(marked()).toBe(false);
    b.ctl.press('down');
    b.ctl.press('right');
    expect(marked()).toBe(true);
    b.ctl.press('left');
    expect(marked()).toBe(false);
    b.ctl.press('right');
    expect(marked()).toBe(true);
    page?.dispose(); page = null;
    expect(marked()).toBe(false);
  });

  it('the pointer (CX.R6): a row\'s click opens it; a roller\'s step mark steps it; the Save row\'s click saves', async () => {
    const b = boot();
    await openList(b);
    document.querySelectorAll<HTMLElement>('#stage [data-act="lorow"]')[2]!.click();
    await flush();
    b.ctl.render();
    expect(b.ctl.S.screen).toBe('loadout');
    expect(text('#stage .cx-title')).toBe('FROSTFIRE');
    editRows()[0]!.querySelector<HTMLElement>('[data-act="lostep"][data-d="1"]')!.click();
    expect(value(0)).toBe('Type 2');
    editRows()[LOADOUT_SAVE_ROW]!.click();
    await flush();
    expect(puts(b)).toHaveLength(1);
  });
});

describe('the locked lines: each screen says why it reads nothing', () => {
  it('signed out while a list is open: its line; Cross is Sign in, which opens the console\'s sign-in', async () => {
    const b = boot();
    await openList(b);
    b.s.set('signed-out');
    await flush();
    b.ctl.render();
    expect(text('#stage .cx-rlist')).toContain(LOADOUT_LOCK_WORDS['sign-in'].title);
    expect(text('#stage .cx-rlist')).toContain(LOADOUT_LOCK_WORDS['sign-in'].line);
    expect(cross(b)).toBe('Sign in');
    b.ctl.press('cross');
    expect(b.ctl.S.overlay).toBe('signin');
  });

  it('the disc out while the editor is open: its line; Cross chooses the disc on the launcher page', async () => {
    const b = boot();
    await openList(b);
    await openEditor(b, 'MP2');
    b.l.set('empty');
    await flush();
    b.ctl.render();
    expect(text('#stage .cx-rlist')).toContain(LOADOUT_LOCK_WORDS.disc.line);
    expect(cross(b)).toBe('Choose disc');
    b.ctl.press('cross');
    expect(b.choose).toHaveBeenCalledTimes(1);
  });

  it('the Armory\'s own rows say the disc and the sign-in first, as before', () => {
    const b = boot({ s: session('signed-out') });
    expect(loadoutSideItems(b.a).map((x) => [x.act, x.disabled])).toEqual([['signin', undefined], ['signin', undefined]]);
  });
});

describe('overlay mode (OT.R60): the screens work over a game page, and lock in a round', () => {
  /** The page's reads as the overlay hands them. */
  const reads = (r: { round: boolean }): ConsolePageReads => ({ gameHolds: () => false, roundRunning: () => r.round, gamePage: () => true });

  it('over a game page: the list and the editor open and save; START stays hidden', async () => {
    const b = boot({ mode: 'overlay', page: reads({ round: false }) });
    await openList(b);
    await openEditor(b, 'MP2');
    b.ctl.S.lo.edit = LOADOUT_SAVE_ROW;
    b.ctl.press('cross');
    await flush();
    expect(puts(b)).toHaveLength(1);
    expect(document.querySelector('#legend .cx-start')).toBeNull();
  });

  it('a round running: the list says the round\'s line, reads nothing, and Cross says it again; the disc\'s lock is the overlay\'s', async () => {
    const r = { round: true };
    const b = boot({ mode: 'overlay', page: reads(r) });
    await openList(b);
    expect(text('#stage .cx-rlist')).toContain(LOADOUT_ROUND_WORDS);
    expect(b.srv.calls).toEqual([]);
    expect(cross(b)).toBeUndefined();
    b.ctl.press('cross');
    expect(b.ctl.S.legendError).toBe(LOADOUT_ROUND_WORDS);
    r.round = false;
    b.ctl.render();
    await flush();
    b.ctl.render();
    expect(listRows()).toHaveLength(4);                              // the round's end reads them
    b.l.set('empty');
    await flush();
    b.ctl.render();
    expect(cross(b)).toBeUndefined();                                // over a game the disc is the game's
    b.ctl.press('cross');
    expect(b.choose).not.toHaveBeenCalled();
    expect(b.ctl.S.legendError).toBe(OVERLAY_LOCK_WORDS.disc);
  });

  it('a round beginning while the editor reads its world: locked at the next draw, the read dropped; at its end asked again and drawn', async () => {
    const r = { round: false };
    const give: ((d: ArmoryData | null) => void)[] = [];
    const rm = vi.fn((): Promise<ArmoryData | null> => new Promise((ok) => { give.push(ok); }));
    const b = boot({ mode: 'overlay', page: reads(r), readMission: rm });
    await openList(b);
    await openEditor(b, 'MP2');
    expect(rm).toHaveBeenCalledTimes(1);
    r.round = true;
    b.ctl.render();                                                  // the overlay draws its console at the round's change
    expect(text('#stage .cx-rlist')).toContain(LOADOUT_ROUND_WORDS);
    give[0]!(missionData('MP2'));
    await flush();
    r.round = false;
    b.ctl.render();
    await flush();
    expect(rm).toHaveBeenCalledTimes(2);
    give[1]!(missionData('MP2'));
    await flush();
    b.ctl.render();
    expect(value(0)).toBe('Type 1');
  });
});

describe('the screens\' modules (OT.R29, MU.R2)', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../../src/console', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  it('no key listener of their own (the console\'s keymap is a development build\'s only) and no browser storage', () => {
    for (const f of ['render/loadouts.ts', 'adapters/loadouts.ts']) {
      expect(src(f), f).not.toMatch(/keydown|keyup|keypress|KeyboardEvent|addEventListener/);
      expect(src(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});

// CX-12: the mission list and the editor are lists L2 / R2 page when they overflow their pane (the grammar's `pageList`;
// the page itself, `pageBy` over the host's measure, is `grammar.test.ts`'s).
describe('CX-12: the loadouts screens are paged lists', () => {
  it('the list and the editor: pageList holds each, and its set moves that screen\'s focus', async () => {
    const b = boot();
    await openList(b);
    const list = pageList(b.ctl.S, b.a)!;
    expect([list.at, list.count]).toEqual([0, listRows().length]);
    list.set(3);
    expect(b.ctl.S.lo.row).toBe(3);
    await openEditor(b, 'MP2');
    const ed = pageList(b.ctl.S, b.a)!;
    expect([ed.at, ed.count]).toEqual([0, LOADOUT_SAVE_ROW + 1]);
    ed.set(LOADOUT_SAVE_ROW);
    expect(b.ctl.S.lo.edit).toBe(LOADOUT_SAVE_ROW);
  });
});
