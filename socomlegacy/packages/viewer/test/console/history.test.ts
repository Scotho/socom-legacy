// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATS, HOME_CATEGORY, createState, normalize, optCategories, type ConsoleState } from '../../src/console/state';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { captureLauncher, launcherNav, loadoutHistoryBlocked, readLauncherSnap, type LauncherNav, type LauncherSnap } from '../../src/console/history';
import { settleLoadoutDeepLink } from '../../src/console/routes';
import type { Adapters } from '../../src/console/state';
import { normalizeLobbies } from '../../src/console/render/lobbies';

const a = sampleAdapters();
let nav: LauncherNav | null = null;

afterEach(() => {
  nav?.dispose();
  nav = null;
  // A leave can keep the editor forward. The next test's push would truncate that instead of growing length.
  window.history.pushState(null, '', '/');
  window.history.replaceState(null, '', '/');
});

function boot(url: string, state: unknown = null): ConsoleState {
  nav?.dispose();
  window.history.replaceState(state, '', url);
  const s = createState(a);
  let current = s;
  nav = launcherNav(window, '/', {
    apply: (snap) => { apply(current, snap); },
    block: (dest) => current.screen === 'loadout' && dest.screen !== 'loadout' && current.confirmKind === 'loadout-leave',
    blocked: () => { current.overlay = 'confirm'; current.confirmKind = 'loadout-leave'; nav?.sync(current, a); },
  });
  nav.adopt(s, a);
  nav.sync(s, a);
  return s;
}

function apply(s: ConsoleState, snap: LauncherSnap): void {
  s.screen = snap.screen;
  s.cat = snap.cat;
  s.item = snap.item.slice();
  s.overlay = snap.overlay;
  s.opt = { ...snap.opt };
  s.rooms = { ...snap.rooms, kind: snap.rooms.kind ?? 0 };
  s.sv = { ...snap.sv };
  s.lo = { ...snap.lo };
  s.lb = { ...snap.lb };
  s.pf = { ...snap.pf, nw: { ...snap.pf.nw } };
  s.confirmKind = snap.confirmKind;
  s.confirmRow = snap.confirmRow;
}

const snap = (): LauncherSnap => readLauncherSnap(window.history.state)!;
const settings = CATS.findIndex((c) => c.id === 'options');
/** jsdom fires `popstate` for `history.go` / `back` / `forward` a couple of turns later. */
const frames = async (): Promise<void> => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('CX-34..36: launcher history', () => {
  it('pages push, and a category, a tab or a focus change replaces', () => {
    const s = boot('/');
    expect(snap().page).toBe('home');
    expect(window.location.pathname).toBe('/');
    const len = window.history.length;
    s.cat = settings;
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings');
    expect(snap().page).toBe('home');
    expect(window.history.length).toBe(len);
    s.item[settings] = 1;
    nav!.sync(s, a);
    expect(window.history.length).toBe(len);
    expect(window.location.pathname).toBe('/settings');
    s.screen = 'options';
    s.opt.cat = optCategories(s, a).findIndex((c) => c.id === 'audio');
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings/audio');
    expect(window.history.length).toBe(len + 1);
    const pushed = window.history.length;
    s.opt.cat = 0;
    s.opt.row = 2;
    nav!.sync(s, a);
    expect(window.history.length).toBe(pushed);
    expect(window.location.pathname).toBe('/settings/display');
  });

  it('Circle returns through our entries, and a dialog closes on Back before the page does', async () => {
    const s = boot('/');
    s.cat = settings;
    nav!.sync(s, a);
    s.screen = 'options';
    s.opt.cat = 1;
    nav!.sync(s, a);
    s.screen = 'home';
    nav!.sync(s, a);
    await frames();
    expect(window.location.pathname).toBe('/settings');
    expect(s.screen).toBe('home');
    s.cat = HOME_CATEGORY;
    nav!.sync(s, a);
    await frames();
    expect(window.location.pathname).toBe('/');
    s.overlay = 'news';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/');
    expect(snap().overlay).toBe('news');
    s.overlay = null;
    nav!.sync(s, a);
    await frames();
    expect(snap().overlay).toBeNull();
    expect(snap().page).toBe('home');
  });

  it('popstate restores the entry', async () => {
    const s = boot('/');
    s.cat = settings;
    nav!.sync(s, a);
    s.screen = 'server';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/online/server');
    window.history.back();
    await frames();
    expect(s.screen).toBe('home');
    expect(s.cat).toBe(settings);
    window.history.forward();
    await frames();
    expect(s.screen).toBe('server');
  });

  it('a deep link opens that page, and a missing room falls back through normalize', () => {
    const s = boot('/settings/audio');
    expect(s.screen).toBe('options');
    expect(optCategories(s, a)[s.opt.cat]?.id).toBe('audio');
    expect(snap().path).toBe('settings/audio');
    const gone = boot('/online/rooms/missing');
    expect(gone.screen).toBe('room');
    const ag = { ...a, rooms: { ...a.rooms, room: () => ({ kind: 'gone' as const }) } };
    normalize(gone, ag);
    normalizeLobbies(gone, ag);
    expect(gone.screen).toBe('rooms');
    nav!.sync(gone, ag);
    expect(window.location.pathname).toBe('/online/rooms');
  });

  it('a deep-linked page with nothing behind it pops by replace', () => {
    const s = boot('/settings/audio');
    const len = window.history.length;
    s.screen = 'home';
    s.cat = settings;
    nav!.sync(s, a);
    expect(window.history.length).toBe(len);
    expect(window.location.pathname).toBe('/settings');
    expect(s.screen).toBe('home');
  });

  it('overlay mode never pushes', () => {
    window.history.replaceState(null, '', '/');
    const s = createState(a, 'overlay');
    const push = vi.spyOn(window.history, 'pushState');
    const rep = vi.spyOn(window.history, 'replaceState');
    nav = launcherNav(window, '/', { apply: () => {} });
    nav.adopt(s, a);
    nav.sync(s, a);
    s.cat = settings;
    s.screen = 'options';
    s.overlay = 'news';
    nav.sync(s, a);
    expect(push).not.toHaveBeenCalled();
    expect(rep).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
  });

  it('leaves a main/* null-state entry untouched (the invite flow)', () => {
    window.history.replaceState(null, '', '/main/online?invite=1');
    const s = createState(a);
    const push = vi.spyOn(window.history, 'pushState');
    const rep = vi.spyOn(window.history, 'replaceState');
    nav = launcherNav(window, '/', { apply: () => {} });
    nav.adopt(s, a);
    nav.sync(s, a);
    s.screen = 'options';
    s.cat = settings;
    nav.sync(s, a);
    expect(push).not.toHaveBeenCalled();
    expect(rep).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/main/online');
    expect(window.history.state).toBeNull();
  });

  it('the console alias is not rewritten until a page is pushed, and START rewinds launcher entries', async () => {
    const s = boot('/console?sample', { mine: 1 });
    expect(window.history.state).toEqual({ mine: 1 });
    expect(window.location.pathname).toBe('/console');
    s.cat = settings;
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings');
    s.screen = 'options';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings/display');
    await nav!.rewind();
    // START collapses to the first entry and strips its launcher snapshot. `gamePage` folds that path to the base.
    // The display page is forward of it, so Back in the game does not land there.
    expect(window.location.pathname).toBe('/settings');
    expect(window.history.state).toBeNull();
    window.history.back();
    await frames();
    expect(window.location.pathname).not.toBe('/settings/display');
    window.history.forward();
    await frames();
    s.screen = 'rooms';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings');
  });

  it('browser Back off a dirty loadout editor opens the confirm instead of leaving', async () => {
    const s = boot('/');
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav!.sync(s, a);
    s.screen = 'loadouts';
    nav!.sync(s, a);
    s.screen = 'loadout';
    s.confirmKind = 'loadout-leave';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/profile/armory/seal/0');
    window.history.back();
    await frames();
    expect(s.screen).toBe('loadout');
    expect(s.overlay).toBe('confirm');
    expect(captureLauncher(s, a).overlay).toBe('confirm');
  });

  it('a loadout mission id resolves by replace, and Back from a dirty editor prompts against another loadout entry', async () => {
    const rows = [
      { mission: 'MP51', name: 'Vigilance', state: 'default' as const },
      { mission: 'MP72', name: 'Other', state: 'default' as const },
    ];
    let listed = false;
    let mission = 'MP51';
    let dirty = false;
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, edit() {}, step() {}, save: () => null, defaults: () => null, close() {}, follow() {}, sync() {},
        list: () => listed ? { kind: 'ok' as const, rows, empty: null } : { kind: 'loading' as const },
        editor: () => listed
          ? { kind: 'ok' as const, mission, name: mission, head: '', held: '', rows: [], busy: false, dirty }
          : { kind: 'loading' as const },
      },
    } as Adapters;
    const s = boot('/');
    nav?.dispose();
    window.history.replaceState(null, '', '/');
    let current = s;
    nav = launcherNav(window, '/', {
      apply: (snap) => { apply(current, snap); },
      block: (dest) => loadoutHistoryBlocked(current, dest, la),
      blocked: () => { current.overlay = 'confirm'; current.confirmKind = 'loadout-leave'; current.confirmRow = 0; },
    });
    nav.adopt(s, la);
    nav.sync(s, la);
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav.sync(s, la);
    s.screen = 'loadouts';
    s.lo = { side: 'seal', row: 0, edit: 0 };
    nav.sync(s, la);
    s.screen = 'loadout';
    nav.sync(s, la);
    expect(window.location.pathname).toBe('/profile/armory/seal/0');
    const opened = window.history.length;
    listed = true;
    nav.sync(s, la);
    expect(window.history.length).toBe(opened);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    expect(snap().page).toBe('loadout:seal:MP51');
    mission = 'MP72';
    dirty = true;
    s.lo.row = 1;
    nav.sync(s, la);
    expect(window.history.length).toBe(opened + 1);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP72');
    window.history.back();
    await frames();
    expect(s.overlay).toBe('confirm');
    expect(s.confirmKind).toBe('loadout-leave');
    expect(s.screen).toBe('loadout');
    expect(window.location.pathname).toBe('/profile/armory/seal/MP72');
  });

  it('Back right after keep editing prompts again, and the block pushes the editor once', async () => {
    const rows = [{ mission: 'MP51', name: 'Vigilance', state: 'default' as const }];
    let dirty = true;
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, edit() {}, step() {}, save: () => null, defaults: () => null, close() {}, follow() {}, sync() {},
        list: () => ({ kind: 'ok' as const, rows, empty: null }),
        editor: () => ({ kind: 'ok' as const, mission: 'MP51', name: 'Vigilance', head: '', held: '', rows: [], busy: false, dirty }),
      },
    } as Adapters;
    const s = createState(la);
    nav?.dispose();
    window.history.replaceState(null, '', '/');
    nav = launcherNav(window, '/', {
      apply: (snap) => { apply(s, snap); },
      block: (dest) => loadoutHistoryBlocked(s, dest, la),
      blocked: () => {
        s.overlay = 'confirm';
        s.confirmKind = 'loadout-leave';
        s.confirmRow = 0;
        nav?.sync(s, la);
      },
    });
    nav.adopt(s, la);
    nav.sync(s, la);
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav.sync(s, la);
    s.screen = 'loadouts';
    s.lo = { side: 'seal', row: 0, edit: 0 };
    nav.sync(s, la);
    s.screen = 'loadout';
    nav.sync(s, la);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    const len = window.history.length;
    const push = vi.spyOn(window.history, 'pushState');
    window.history.back();
    await frames();
    const editorPushes = push.mock.calls.filter((c) => String(c[2]).includes('/profile/armory/seal/MP51'));
    expect(editorPushes).toHaveLength(1);
    expect(window.history.length).toBe(len);
    expect(s.overlay).toBe('confirm');
    expect(s.screen).toBe('loadout');
    // No, keep editing: the confirm closes onto the one editor entry.
    s.overlay = null;
    nav.sync(s, la);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    expect(s.overlay).toBeNull();
    window.history.back();
    await frames();
    expect(s.overlay).toBe('confirm');
    expect(s.confirmKind).toBe('loadout-leave');
    expect(s.screen).toBe('loadout');
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    push.mockRestore();
  });

  it('Forward after Yes, leave has no confirm on the loadouts list', async () => {
    const rows = [{ mission: 'MP51', name: 'Vigilance', state: 'default' as const }];
    let gone = false;
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, edit() {}, step() {}, save: () => null, defaults: () => null, follow() {}, sync() {},
        close() { gone = true; },
        list: () => ({ kind: 'ok' as const, rows, empty: null }),
        editor: () => gone
          ? { kind: 'gone' as const }
          : { kind: 'ok' as const, mission: 'MP51', name: 'Vigilance', head: '', held: '', rows: [], busy: false, dirty: true },
      },
    } as Adapters;
    const s = createState(la);
    nav?.dispose();
    window.history.replaceState(null, '', '/');
    const leave = (): void => {
      gone = true;
      s.overlay = null;
      s.screen = 'loadouts';
      normalize(s, la);
      nav?.sync(s, la);
    };
    nav = launcherNav(window, '/', {
      apply: (snap) => { apply(s, snap); normalize(s, la); },
      drawn: () => { nav?.sync(s, la); },
      block: (dest) => loadoutHistoryBlocked(s, dest, la),
      blocked: () => {
        s.overlay = 'confirm';
        s.confirmKind = 'loadout-leave';
        s.confirmRow = 0;
        nav?.sync(s, la);
      },
    });
    nav.adopt(s, la);
    nav.sync(s, la);
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav.sync(s, la);
    s.screen = 'loadouts';
    s.lo = { side: 'seal', row: 0, edit: 0 };
    nav.sync(s, la);
    s.screen = 'loadout';
    nav.sync(s, la);
    window.history.back();
    await frames();
    expect(s.overlay).toBe('confirm');
    s.overlay = null;
    nav.sync(s, la);
    window.history.back();
    await frames();
    expect(s.overlay).toBe('confirm');
    expect(s.screen).toBe('loadout');
    const len = window.history.length;
    leave();
    await frames();
    expect(s.screen).toBe('loadouts');
    expect(s.overlay).toBeNull();
    expect(window.location.pathname).toBe('/profile/armory/seal');
    window.history.forward();
    await frames();
    await frames();
    expect(s.screen).toBe('loadouts');
    expect(s.overlay).toBeNull();
    expect(window.location.pathname).toBe('/profile/armory/seal');
    expect(window.history.length).toBe(len);
  });

  it('Forward after the header Back\'s Yes, leave stays on the list without a confirm', async () => {
    const rows = [{ mission: 'MP51', name: 'Vigilance', state: 'default' as const }];
    let gone = false;
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, edit() {}, step() {}, save: () => null, defaults: () => null, follow() {}, sync() {},
        close() { gone = true; },
        list: () => ({ kind: 'ok' as const, rows, empty: null }),
        editor: () => gone
          ? { kind: 'gone' as const }
          : { kind: 'ok' as const, mission: 'MP51', name: 'Vigilance', head: '', held: '', rows: [], busy: false, dirty: true },
      },
    } as Adapters;
    const s = createState(la);
    nav?.dispose();
    window.history.replaceState(null, '', '/');
    nav = launcherNav(window, '/', {
      apply: (snap) => { apply(s, snap); normalize(s, la); },
      drawn: () => { nav?.sync(s, la); },
      block: (dest) => loadoutHistoryBlocked(s, dest, la),
      blocked: () => {
        s.overlay = 'confirm';
        s.confirmKind = 'loadout-leave';
        s.confirmRow = 0;
        nav?.sync(s, la);
      },
    });
    nav.adopt(s, la);
    nav.sync(s, la);
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav.sync(s, la);
    s.screen = 'loadouts';
    s.lo = { side: 'seal', row: 0, edit: 0 };
    nav.sync(s, la);
    s.screen = 'loadout';
    nav.sync(s, la);
    s.overlay = 'confirm';
    s.confirmKind = 'loadout-leave';
    nav.sync(s, la);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    gone = true;
    s.overlay = null;
    s.screen = 'loadouts';
    normalize(s, la);
    const len = window.history.length;
    nav.sync(s, la);
    await frames();
    expect(s.screen).toBe('loadouts');
    expect(s.overlay).toBeNull();
    window.history.forward();
    await frames();
    await frames();
    expect(s.screen).toBe('loadouts');
    expect(s.overlay).toBeNull();
    expect(window.location.pathname).toBe('/profile/armory/seal');
    expect(window.history.length).toBe(len);
  });

  it('a mission deep link keeps its segment, and beforeunload guards a dirty editor', async () => {
    let listed = false;
    let opened = false;
    let dirty = false;
    const edited: string[] = [];
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, step() {}, save: () => null, defaults: () => null, close() {}, follow() {}, sync() {},
        edit(m: string) { edited.push(m); opened = true; },
        list: () => listed
          ? { kind: 'ok' as const, rows: [{ mission: 'MP51', name: 'Vigilance', state: 'default' as const }], empty: null }
          : { kind: 'loading' as const },
        editor: () => opened && listed
          ? { kind: 'ok' as const, mission: 'MP51', name: 'Vigilance', head: '', held: '', rows: [], busy: false, dirty }
          : { kind: 'loading' as const },
      },
    } as Adapters;
    nav?.dispose();
    window.history.replaceState(null, '', '/profile/armory/seal/MP51');
    const s = createState(la);
    nav = launcherNav(window, '/', { apply: (snap) => { apply(s, snap); } });
    nav.adopt(s, la);
    nav.sync(s, la);
    expect(edited).toEqual(['MP51']);
    expect(s.screen).toBe('loadout');
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    expect(snap().page).toBe('loadout:seal:MP51');
    const len = window.history.length;
    s.overlay = 'agreement';
    nav.sync(s, la);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    expect(window.history.length).toBe(len + 1);
    s.overlay = null;
    nav.sync(s, la);
    await frames();
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    window.history.forward();
    await frames();
    expect(window.location.pathname).not.toBe('/profile/armory/seal/0');
    listed = true;
    dirty = true;
    nav.sync(s, la);
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    dirty = false;
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    nav.dispose();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    nav = null;
  });

  it('a /0 deep link opens row 0 by replace, and an empty list resolves to the list', async () => {
    const box: { listed: boolean; rows: { mission: string; name: string; state: 'default' }[]; mission: string | null } = {
      listed: false, rows: [], mission: null,
    };
    const la = {
      ...a,
      loadouts: {
        open() {}, retry() {}, step() {}, save: () => null, defaults: () => null, follow() {}, sync() {},
        edit(m: string) { box.mission = m; },
        close() { box.mission = null; },
        list: () => box.listed ? { kind: 'ok' as const, rows: box.rows, empty: null } : { kind: 'loading' as const },
        editor: () => {
          if (!box.mission) return box.listed ? { kind: 'gone' as const } : { kind: 'loading' as const };
          if (!box.listed) return { kind: 'loading' as const };
          return { kind: 'ok' as const, mission: box.mission, name: box.mission, head: '', held: '', rows: [], busy: false, dirty: false };
        },
      },
    } as Adapters;
    const open = (url: string): ConsoleState => {
      nav?.dispose();
      window.history.replaceState(null, '', url);
      const s = createState(la);
      nav = launcherNav(window, '/', { apply: (snap) => { apply(s, snap); } });
      nav.adopt(s, la);
      nav.sync(s, la);
      return s;
    };
    const s = open('/profile/armory/seal/0');
    expect(s.screen).toBe('loadout');
    expect(s.lo.row).toBe(0);
    expect(window.location.pathname).toBe('/profile/armory/seal/0');
    expect(snap().page).toBe('loadout:seal:');
    const len = window.history.length;
    box.listed = true;
    box.rows = [{ mission: 'MP51', name: 'Vigilance', state: 'default' }];
    settleLoadoutDeepLink(s, la);
    expect(box.mission).toBe('MP51');
    nav!.sync(s, la);
    expect(window.history.length).toBe(len);
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');
    expect(snap().page).toBe('loadout:seal:MP51');
    window.history.forward();
    await frames();
    expect(window.location.pathname).toBe('/profile/armory/seal/MP51');

    box.listed = false;
    box.rows = [];
    box.mission = null;
    const empty = open('/profile/armory/seal/0');
    const len2 = window.history.length;
    box.listed = true;
    settleLoadoutDeepLink(empty, la);
    expect(box.mission).toBeNull();
    normalize(empty, la);
    nav!.sync(empty, la);
    expect(empty.screen).toBe('loadouts');
    expect(window.history.length).toBe(len2);
    expect(window.location.pathname).toBe('/profile/armory/seal');
    window.history.forward();
    await frames();
    expect(window.location.pathname).toBe('/profile/armory/seal');
  });

  it('a same-page replace after Back keeps the /console alias', async () => {
    const s = boot('/console?sample', { mine: 1 });
    s.screen = 'rooms';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/online/rooms');
    window.history.back();
    await frames();
    expect(window.location.pathname).toBe('/console');
    expect(window.location.search).toBe('?sample');
    s.item[HOME_CATEGORY] = 1;
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/console');
    expect(window.location.search).toBe('?sample');
  });

  it('a category change on /console writes that path, and Back does not return to the alias', () => {
    const s = boot('/console?sample', { mine: 1 });
    const len = window.history.length;
    s.cat = settings;
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?sample');
    expect(window.history.length).toBe(len);
    expect(snap().page).toBe('home');
  });

  it('a refreshed page keeps its entry id, so Back then Forward still reaches it', async () => {
    const s = boot('/');
    s.cat = settings;
    nav!.sync(s, a);
    s.screen = 'options';
    s.opt.cat = optCategories(s, a).findIndex((c) => c.id === 'audio');
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings/audio');
    const audio = snap();
    expect(audio.id).toBeGreaterThan(1);
    const category: LauncherSnap = { ...audio, id: audio.id - 1, screen: 'home', overlay: null, page: 'home', path: 'settings', parent: null, cat: settings };
    nav!.dispose();
    nav = null;
    window.history.replaceState({ s2uLauncher: category }, '', '/settings');
    window.history.pushState({ s2uLauncher: audio }, '', '/settings/audio');
    const len = window.history.length;
    const s2 = createState(a);
    nav = launcherNav(window, '/', {
      apply: (next) => { apply(s2, next); },
      drawn: () => { nav?.sync(s2, a); },
    });
    nav.adopt(s2, a);
    nav.sync(s2, a);
    expect(s2.screen).toBe('options');
    expect(snap().id).toBe(audio.id);
    window.history.back();
    await frames();
    expect(s2.screen).toBe('home');
    expect(s2.cat).toBe(settings);
    window.history.forward();
    await frames();
    expect(window.location.pathname).toBe('/settings/audio');
    expect(s2.screen).toBe('options');
    expect(snap().id).toBe(audio.id);
    expect(window.history.length).toBe(len);
  });

  /** Settings, then Audio pushed, then a refresh: the nav rebuilt over the same entries (`dispose` restores its URL). */
  function refreshedAtAudio(): ConsoleState {
    const s = boot('/');
    s.cat = settings;
    nav!.sync(s, a);
    s.screen = 'options';
    s.opt.cat = optCategories(s, a).findIndex((c) => c.id === 'audio');
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/settings/audio');
    const audio = snap();
    nav!.dispose();
    nav = null;
    window.history.replaceState({ s2uLauncher: audio }, '', '/settings/audio');   // the entry as the refresh finds it
    const s2 = createState(a);
    nav = launcherNav(window, '/', { apply: (next) => { apply(s2, next); }, drawn: () => { nav?.sync(s2, a); } });
    nav.adopt(s2, a);
    nav.sync(s2, a);
    expect(s2.screen).toBe('options');
    return s2;
  }

  it('#356 review N1: Back after a refresh lands on the entry before, so START walks to the first launcher entry, not past it', async () => {
    const s2 = refreshedAtAudio();
    window.history.back();
    await frames();
    expect(window.location.pathname).toBe('/settings');
    expect(s2.screen).toBe('home');
    expect(nav!.span()).toBe(0);                                     // the first launcher entry: nothing behind it
    await nav!.rewind();
    expect(window.location.pathname).toBe('/settings');              // not the page before the launcher
    expect(window.history.state).toBeNull();
  });

  it('#356 review F3: START after a refresh still walks back over the entries behind it', async () => {
    refreshedAtAudio();
    expect(nav!.span()).toBe(1);                                     // Settings is behind Audio, though this nav never saw it
    await nav!.rewind();
    expect(window.location.pathname).toBe('/settings');
    expect(window.history.state).toBeNull();
  });

  /** The page as a refresh finds it: this nav disposed, the entry put back, a new nav and state over the same history. */
  function refreshHere(): ConsoleState {
    const at = snap();
    const url = window.location.pathname;
    nav!.dispose();
    nav = null;
    window.history.replaceState({ s2uLauncher: at }, '', url);
    const s2 = createState(a);
    nav = launcherNav(window, '/', {
      apply: (next) => { apply(s2, next); },
      drawn: () => { nav?.sync(s2, a); },
      block: (dest) => s2.screen === 'loadout' && dest.screen !== 'loadout' && s2.confirmKind === 'loadout-leave',
      blocked: () => { s2.overlay = 'confirm'; s2.confirmKind = 'loadout-leave'; nav?.sync(s2, a); },
    });
    nav.adopt(s2, a);
    nav.sync(s2, a);
    return s2;
  }

  it('#356 fix review F2: Forward after a refresh onto an unseen entry, then a push, reuses no id', async () => {
    const s = boot('/');
    s.screen = 'options';                                            // a pushed page
    nav!.sync(s, a);
    const optionsPath = window.location.pathname;
    window.history.back();
    await frames();
    const s2 = refreshHere();                                        // refreshed on the first entry
    window.history.forward();
    await frames();
    expect(window.location.pathname).toBe(optionsPath);
    expect(s2.screen).toBe('options');
    const forwardId = snap().id;
    s2.screen = 'rooms';                                             // another page pushed from it
    nav!.sync(s2, a);
    expect(snap().id).not.toBe(forwardId);
    window.history.back();
    await frames();
    expect(s2.screen).toBe('options');
    window.history.forward();
    await frames();
    expect(s2.screen).toBe('rooms');
    const len = window.history.length;
    nav!.sync(s2, a);
    expect(window.history.length).toBe(len);                         // no duplicate pushed over a mismatched index
    expect(nav!.span()).toBe(2);
  });

  it('#356 fix review F1: the loadout block\'s Back after a refresh keeps the depth, so START walks to the first entry', async () => {
    const s = boot('/');
    s.cat = CATS.findIndex((c) => c.id === 'profile');
    nav!.sync(s, a);
    s.screen = 'loadouts';
    nav!.sync(s, a);
    s.screen = 'loadout';
    nav!.sync(s, a);
    expect(window.location.pathname).toBe('/profile/armory/seal/0');
    const s2 = refreshHere();
    expect(s2.screen).toBe('loadout');
    s2.confirmKind = 'loadout-leave';                                // dirty
    nav!.sync(s2, a);
    expect(nav!.span()).toBe(2);                                     // Home and the list behind the editor
    window.history.back();                                           // refused: the editor is put back
    await frames();
    expect(s2.screen).toBe('loadout');
    expect(s2.overlay).toBe('confirm');
    expect(nav!.span()).toBe(2);
  });

  describe('a history write the browser refuses (a Chrome before ~117 refuses a path holding %00)', () => {
    const NAME = 'Zed`x';
    // Before the file's own afterEach writes history: a failed test must not leave the refusing fakes in place.
    afterEach(() => { vi.restoreAllMocks(); });
    const refusal = (kind: string) => () => {
      // Chrome's own message carries the URL, and so the persona's name.
      throw new DOMException(`Failed to execute '${kind}' on 'History': A history state object with URL 'http://localhost/profile/personas/h%00${NAME}' cannot be created in a document with origin 'http://localhost'.`, 'SecurityError');
    };

    it('a refused push does not throw, leaves the count and the entry as they were, and the next push is as if it never was', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const s = boot('/');
      s.screen = 'options';
      nav!.sync(s, a);
      expect(nav!.span()).toBe(1);
      const before = snap();
      const len = window.history.length;
      const push = vi.spyOn(window.history, 'pushState').mockImplementation(refusal('pushState'));
      s.screen = 'personaEdit';
      s.pf = { ...s.pf, id: `h\u000010071\u0000${NAME}` };
      expect(() => nav!.sync(s, a)).not.toThrow();
      expect(nav!.span()).toBe(1);
      s.pf = { ...s.pf, row: 1 };                                     // a focus move: tried again, refused again
      expect(() => nav!.sync(s, a)).not.toThrow();
      expect(nav!.span()).toBe(1);
      push.mockRestore();
      expect(window.history.length).toBe(len);
      expect(snap()).toEqual(before);
      s.screen = 'server';
      s.pf = { ...s.pf, id: null, row: 0 };
      nav!.sync(s, a);
      expect(nav!.span()).toBe(2);
      expect(snap().id).toBe(before.id + 1);
      expect(snap().depth).toBe(2);
      window.history.back();
      await frames();
      expect(s.screen).toBe('options');
      expect(nav!.span()).toBe(1);
      expect(err).toHaveBeenCalledTimes(1);
      err.mockRestore();
    });

    it('a refused replace does not throw and leaves the entry as it was; one error for the nav, with no URL or name', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const s = boot('/');
      s.screen = 'options';
      nav!.sync(s, a);
      const before = snap();
      const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(refusal('replaceState'));
      const push = vi.spyOn(window.history, 'pushState').mockImplementation(refusal('pushState'));
      s.opt.row = 2;                                                   // the same page: a replace
      expect(() => nav!.sync(s, a)).not.toThrow();
      s.opt.row = 3;
      expect(() => nav!.sync(s, a)).not.toThrow();
      s.screen = 'personaEdit';
      s.pf = { ...s.pf, id: `h\u000010071\u0000${NAME}` };
      expect(() => nav!.sync(s, a)).not.toThrow();                     // a push, refused too
      expect(nav!.span()).toBe(1);
      replace.mockRestore();
      push.mockRestore();
      expect(snap()).toEqual(before);
      expect(err).toHaveBeenCalledTimes(1);
      const text = err.mock.calls[0]!.map((x) => String(x)).join(' ');
      expect(text).not.toContain(NAME);
      expect(text).not.toContain('profile/personas');
      expect(text).not.toContain('http');
      s.screen = 'options';
      s.pf = { ...s.pf, id: null };
      s.opt.row = 4;
      nav!.sync(s, a);                                                 // the replace goes through once the browser takes it
      expect(snap().opt.row).toBe(4);
      expect(snap().id).toBe(before.id);
      err.mockRestore();
    });
  });

  describe('a refused history write inside a Back (the popstate paths)', () => {
    afterEach(() => { vi.restoreAllMocks(); });
    const refuse = (): never => { throw new DOMException('refused', 'SecurityError'); };
    /** A listener's throw in jsdom is reported on the window, not to the caller. */
    const thrown = (): { count: () => number; off: () => void } => {
      let n = 0;
      const on = (): void => { n++; };
      window.addEventListener('error', on);
      return { count: () => n, off: () => window.removeEventListener('error', on) };
    };

    it('the blocked Back\'s re-push refused: no throw, the count follows the browser (one back), one log', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errors = thrown();
      const s = boot('/');
      s.cat = CATS.findIndex((c) => c.id === 'profile');
      nav!.sync(s, a);
      s.screen = 'loadouts';
      nav!.sync(s, a);
      s.screen = 'loadout';
      nav!.sync(s, a);
      s.confirmKind = 'loadout-leave';                                 // dirty: Back is blocked
      nav!.sync(s, a);
      expect(nav!.span()).toBe(2);
      vi.spyOn(window.history, 'replaceState').mockImplementation(refuse);
      vi.spyOn(window.history, 'pushState').mockImplementation(refuse);
      s.confirmRow = 1;                                                // a refused replace first: the one log
      expect(() => nav!.sync(s, a)).not.toThrow();
      window.history.back();                                           // blocked: `push(cur)`, refused
      await frames();
      expect(errors.count()).toBe(0);
      expect(window.location.pathname).toBe('/profile/armory/seal');
      expect(nav!.span()).toBe(1);                                     // the browser's entry, not one ahead of it
      expect(s.overlay).toBe('confirm');
      expect(err).toHaveBeenCalledTimes(1);
      errors.off();
    });

    it('goTo\'s snapshot rewrite refused: no throw, the index still follows history.go, the snapshot is the old one, one log', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errors = thrown();
      const s = boot('/');
      s.cat = settings;
      nav!.sync(s, a);
      const first = snap();
      s.screen = 'options';
      nav!.sync(s, a);
      expect(nav!.span()).toBe(1);
      vi.spyOn(window.history, 'replaceState').mockImplementation(refuse);
      s.screen = 'home';                                               // Circle onto the entry behind: goTo(0)
      expect(() => nav!.sync(s, a)).not.toThrow();
      await frames();
      expect(errors.count()).toBe(0);
      expect(window.location.pathname).toBe('/settings');
      expect(nav!.span()).toBe(0);
      expect(snap()).toEqual(first);                                   // only the rewrite is lost
      s.item[settings] = 2;                                            // a later refused replace: still one log
      expect(() => nav!.sync(s, a)).not.toThrow();
      expect(err).toHaveBeenCalledTimes(1);
      errors.off();
    });
  });

  it('#356 fix review: a jump over two entries after a refresh places the landed entry by its depth', async () => {
    const s = boot('/');
    s.screen = 'options';
    nav!.sync(s, a);
    s.screen = 'rooms';
    nav!.sync(s, a);
    refreshHere();
    expect(nav!.span()).toBe(2);
    window.history.go(-2);
    await frames();
    expect(nav!.span()).toBe(0);
    await nav!.rewind();
    expect(window.history.state).toBeNull();                         // the first launcher entry, stripped
  });
});

