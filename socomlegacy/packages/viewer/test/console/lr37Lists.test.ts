// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { serverInfoRows } from '../../src/console/render/server';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { BROWSE_KINDS, CATS, browseRows, homeItems, type Adapters, type CustomView } from '../../src/console/state';
import { captureLauncher } from '../../src/console/history';
import { mountShell } from './shell';

/**
 * LR-37 (the owner, 2026-10-29), the launcher's lists. A browser adaptation (product track): what the launcher lists and
 * in what order, nothing of the game.
 *  3. "Place theme above APP." -- superseded (the owner, 2026-10-29: "Layout A as is", LATER 294): Settings is Game,
 *     Launcher, Theme, and Launcher's tabs are Controller, Appearance, App, Account (`settingsFamilies.test.ts`).
 *  4. "Remove Memory Card from the modern launcher UI." -- the page's Home has no Memory card row (the overlay keeps it).
 *  6. "Remove server news. Put it in server information." -- no Server news row; the Server screen holds the universe's
 *     description and its news chunks (what the news dialog showed) beside the announcement.
 *  7 (amended ~02:20Z). "Online tab should say Browse rooms, ..., Server Information, Sign In" -- and "Merge the custom
 *     lobby and browse room": Browse rooms, Server Information, Sign In (signed in: "Signed in as ...").
 *  9. Browse rooms is one list of the classic rooms and the custom matches, its filter ALL / CLASSIC / CUSTOM on the left,
 *     ALL at every open; Left / Right step it; a custom match row JOINs; custom matches read only while shown.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

const titles = (A: Adapters, cat: string, mode: 'page' | 'overlay' = 'page'): string[] => {
  const p = bootConsole(document, window, A, { keymap: false, mode });
  const t = homeItems(cat, p.ctl.S, A).map((x) => x.title);
  p.dispose();
  return t;
};

describe('LR-37 (3), superseded by layout A (the owner, 2026-10-29)', () => {
  it('Settings lists Game, Launcher, Theme', () => {
    expect(titles(sampleAdapters(), 'options')).toEqual(['Game', 'Launcher', 'Theme']);
  });
});

describe('LR-37 (4): no Memory card on the launcher page', () => {
  // LR-39 (LR.R32): the overlay's Home is the page's, so its Memory card left too (was: the overlay's Home kept it).
  it('the page\'s Home: Play, Server status, Discord; the overlay\'s the same with Resume game, no Memory card either', () => {
    const A = sampleAdapters();
    expect(titles(A, 'home')).not.toContain('Memory card');
    expect(titles(A, 'home', 'overlay')).not.toContain('Memory card');
    expect(titles(A, 'home', 'overlay')).toEqual(['Resume game', 'Server status', 'Discord']);
  });
});

describe('LR-37 (6, 7): Play online\'s list', () => {
  it('signed in: Browse rooms, Server Information, Signed in as ...; no Server news, no Custom matches', () => {
    const t = titles(sampleAdapters(), 'online');
    expect(t).toEqual(['Browse rooms', 'Server Information', 'Signed in as SPECTER']);
  });
  it('signed out: Browse rooms, Server Information, Sign In', () => {
    const A = sampleAdapters();
    A.session = { ...A.session, signedIn: () => false };
    expect(titles(A, 'online')).toEqual(['Browse rooms', 'Server Information', 'Sign In']);
  });
  it('the Server screen shows what the news dialog showed: the universe\'s description and each news chunk', () => {
    const A = sampleAdapters();
    A.server = { ...A.server, news: () => ({ universe: { kind: 'ok', name: 'Main', users: 3, max: 100, description: 'The main universe', news: ['Patch day\n', 'Double XP'] }, announcement: { kind: 'ok', text: 'Hello' } }) };
    const labels = serverInfoRows(A).map((r) => ('label' in r ? r.label : '') + ('value' in r ? `=${r.value}` : ''));
    expect(labels.join('|')).toContain('The main universe');
    expect(labels.join('|')).toContain('Patch day');
    expect(labels.join('|')).toContain('Double XP');
    expect(labels.join('|')).toContain('Hello');
  });
  it('the news is one text: its chunks joined as the original joins them, a row per line, blank lines dropped (OT.R94 playtest texts)', () => {
    const A = sampleAdapters();
    // SVC-05 cuts one news text into 255-byte chunks, wherever the cut falls (`chunkText`): here inside a word.
    const news = ['Featuring:\n- Frost', 'fire, Night Stalker\n\n- Replays'];
    A.server = { ...A.server, news: () => ({ universe: { kind: 'ok', name: 'Main', users: 3, max: 100, description: 'Welcome!\nHave fun.', news }, announcement: { kind: 'ok', text: 'Line one\nLine two' } }) };
    const labels = serverInfoRows(A).filter((r) => r.kind === 'info' && 'value' in r && r.value === '').map((r) => ('label' in r ? r.label : ''));
    expect(labels).toEqual(['Welcome!', 'Have fun.', 'Featuring:', '- Frostfire, Night Stalker', '- Replays', 'Line one', 'Line two']);
  });
});

describe('LR-37 (9): Browse rooms, merged', () => {
  const ROWS = [
    { id: 'L1', name: 'Crate maze', map: 'MP72', players: 3, max: 16, inMatch: false, locked: true, href: '/forge?l=L1' },
    { id: 'L2', name: 'Open floor', map: 'MP72', players: 1, max: 16, inMatch: false, locked: false, href: '/forge?l=L2' },
  ];
  function boot(view: CustomView = { kind: 'ok', rows: ROWS, empty: null }, mode: 'page' | 'overlay' = 'page') {
    const A = sampleAdapters();
    const sync = vi.fn();
    const join = vi.fn(() => '/forge');
    A.custom = { sync, view: () => view, refresh: async () => {}, join };
    page = bootConsole(document, window, A, { keymap: false, mode });
    const ctl = page.ctl;
    ctl.S.cat = CATS.findIndex((c) => c.id === 'online');
    ctl.S.item[ctl.S.cat] = 0;
    return { A, ctl, sync, join };
  }

  it('the filter is ALL, CLASSIC, CUSTOM', () => {
    expect(BROWSE_KINDS).toEqual(['All', 'Classic', 'Custom']);
  });

  it('opens on ALL: the classic rooms then the custom matches, each custom row marked', () => {
    const { A, ctl } = boot();
    ctl.S.rooms.kind = 2;
    ctl.press('cross');
    expect(ctl.S.screen).toBe('rooms');
    expect(ctl.S.rooms.kind).toBe(0);
    const rows = browseRows(ctl.S, A);
    const classic = A.rooms.list().length;
    expect(rows).toHaveLength(classic + 2);
    expect(rows.slice(classic).map((r) => r.kind)).toEqual(['custom', 'custom']);
    page!.render();
    const custom = document.querySelectorAll('#stage .cx-room.is-custom');
    expect(custom).toHaveLength(2);
    expect(custom[0]!.textContent).toContain('Crate maze');
    expect(custom[0]!.getAttribute('aria-label')).toMatch(/not part of the original game/i);
    expect(document.querySelectorAll('#stage .cx-kinds [data-act="roomkind"]')).toHaveLength(3);
    expect(document.querySelector('#stage .cx-kinds [aria-pressed="true"]')!.textContent).toContain('All');
  });

  it('Right steps to CLASSIC (rooms only), again to CUSTOM (matches only); Left back; a click picks', () => {
    const { A, ctl } = boot();
    ctl.press('cross');
    ctl.press('right');
    expect(ctl.S.rooms.kind).toBe(1);
    expect(browseRows(ctl.S, A).every((r) => r.kind !== 'custom')).toBe(true);
    ctl.press('right');
    expect(ctl.S.rooms.kind).toBe(2);
    expect(browseRows(ctl.S, A).map((r) => r.id)).toEqual(['L1', 'L2']);
    ctl.press('right');
    expect(ctl.S.rooms.kind).toBe(2);                                  // the end kept
    ctl.press('left');
    expect(ctl.S.rooms.kind).toBe(1);
    ctl.pointer('roomkind', { i: '0' } as DOMStringMap);
    expect(ctl.S.rooms.kind).toBe(0);
  });

  it('custom matches are read only while shown: ALL and CUSTOM, not CLASSIC, not elsewhere', () => {
    const { ctl, sync } = boot();
    sync.mockClear();
    ctl.press('cross');
    expect(sync).toHaveBeenLastCalledWith(true);
    ctl.press('right');
    expect(sync).toHaveBeenLastCalledWith(false);
    ctl.press('right');
    expect(sync).toHaveBeenLastCalledWith(true);
    ctl.press('circle');
    expect(sync).toHaveBeenLastCalledWith(false);
  });

  it('Cross on a custom row JOINs it', () => {
    const { ctl, join } = boot();
    ctl.press('cross');
    ctl.press('right'); ctl.press('right');
    ctl.press('down');
    ctl.press('cross');
    expect(join).toHaveBeenCalledWith('L2');
  });

  it('a click on a custom row is its Cross', () => {
    const { A, ctl, join } = boot();
    ctl.press('cross');
    const at = browseRows(ctl.S, A).findIndex((r) => r.id === 'L1');
    ctl.pointer('room', { i: String(at) } as DOMStringMap);
    expect(join).toHaveBeenCalledWith('L1');
  });

  it('CUSTOM with no custom matches from this server says so', () => {
    const { ctl } = boot({ kind: 'unavailable', line: 'Custom matches are not available from this server' });
    ctl.press('cross');
    ctl.press('right'); ctl.press('right');
    page!.render();
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Custom matches are not available from this server');
  });

  it('with no custom adapter, CUSTOM says they are not available', () => {
    const A = sampleAdapters();
    page = bootConsole(document, window, A, { keymap: false });
    const ctl = page.ctl;
    ctl.S.screen = 'rooms';
    ctl.S.rooms.kind = 2;
    page.render();
    expect(browseRows(ctl.S, A)).toHaveLength(0);
    expect(document.querySelector('#stage .cx-empty')!.textContent).toContain('Custom matches are not available from this server');
  });
});

describe('LR-37 (9): a history entry from before the filter', () => {
  it('restores Browse rooms on ALL (its rooms carry no kind)', () => {
    const A = sampleAdapters();
    page = bootConsole(document, window, A, { keymap: false });
    const S = page.ctl.S;
    S.rooms.kind = 2;
    const snap = captureLauncher(S, A);
    delete (snap.rooms as { kind?: number }).kind;
    page.ctl.applySnap(snap);
    expect(S.rooms.kind).toBe(0);
  });
});
