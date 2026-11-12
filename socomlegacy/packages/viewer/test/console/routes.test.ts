import { describe, expect, it } from 'vitest';
import { HOME_CATEGORY, createState, optCategories, type Adapters, type ConsoleState } from '../../src/console/state';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { gamePath } from '../../src/console/adapters/gamePath';
import { inviteAt } from '../../src/console/adapters/invite';
import {
  LAUNCHER_FIRST, LAUNCHER_RESERVED_FIRST, classifyLauncherPath, decodeLauncherPath, encodeLauncherPath, launcherBackLabel, launcherPageKey, launcherParentKey, launcherPathSamples,
} from '../../src/console/routes';

const a = sampleAdapters();

const round = (path: string): string => {
  const s = createState(a);
  decodeLauncherPath(`/${path}`, '/', s, a);
  return encodeLauncherPath(s, a);
};

describe('CX-33: the launcher route table', () => {
  it('round-trips every stable path (screen → path → screen)', () => {
    const stable = [
      '', 'online', 'online/rooms', 'online/rooms/bravo', 'online/games/g1', 'online/custom', 'online/server',
      'watch', 'profile', 'profile/personas', 'profile/personas/new', 'profile/personas/p1', 'profile/record',
      'profile/armory/seal', 'profile/armory/terrorist', 'profile/armory/seal/0', 'profile/armory/terrorist/2',
      'settings', 'settings/display', 'settings/audio', 'settings/controller/mapping', 'experiments',
    ];
    for (const path of stable) expect(round(path), path).toBe(path);
  });

  it('an unknown path, an unknown settings tab, and the unbuilt lobby path fall back to Home', () => {
    const s = createState(a);
    decodeLauncherPath('/not-a-page', '/', s, a);
    expect(s.screen).toBe('home');
    expect(s.cat).toBe(HOME_CATEGORY);
    decodeLauncherPath('/online/lobby/room-1', '/', s, a);
    expect(s.screen).toBe('home');
    decodeLauncherPath('/settings/no-such-tab', '/', s, a);
    expect(s.screen).toBe('options');
    expect(optCategories(s, a)[s.opt.cat]?.id).toBe('display');
  });

  it('does not claim main/*, d/*, a menu-router entry, a reserved first segment, or a dotted segment', () => {
    expect(classifyLauncherPath('/main/online', '/', null)).toBe('foreign');
    expect(classifyLauncherPath('/d/dlgFoo', '/', null)).toBe('foreign');
    expect(classifyLauncherPath('/', '/', { s2uMenuRoute: { depth: 0, trail: [] } })).toBe('foreign');
    expect(classifyLauncherPath('/console', '/', null)).toBe('skip');
    expect(classifyLauncherPath('/news', '/', null)).toBe('skip');
    expect(classifyLauncherPath('/replays/1', '/', null)).toBe('skip');
    expect(classifyLauncherPath('/favicon.ico', '/', null)).toBe('skip');
    expect(classifyLauncherPath('/settings/audio', '/', null)).toBe('ours');
    expect(classifyLauncherPath('/', '/', null)).toBe('ours');
    const id = 'AbcdEFgh12';
    expect(classifyLauncherPath(`/online/lobby/${id}`, '/', null)).toBe('foreign');
    expect(classifyLauncherPath('/online/lobby/room-1', '/', null)).toBe('ours');
    expect(gamePath(`/online/lobby/${id}`, '/')).toBe(`/online/lobby/${id}`);
    expect(inviteAt({ pathname: `/online/lobby/${id}`, search: '' }, '/')?.lobbyId).toBe(id);
    expect(inviteAt({ pathname: '/main/online', search: '?invite=7&game=friday' }, '/')?.mediusWorldId).toBe(7);
    expect(inviteAt({ pathname: `/online/lobby/${id}`, search: '?invite=7&game=friday' }, '/')?.mediusWorldId).toBe(7);
  });

  it('shares no first segment with the game, Vite, or nginx', () => {
    for (const path of launcherPathSamples()) {
      const first = path.split('/')[0] ?? '';
      if (!first) continue;
      expect(LAUNCHER_RESERVED_FIRST, first).not.toContain(first);
      expect(first.includes('.'), first).toBe(false);
    }
    for (const reserved of LAUNCHER_RESERVED_FIRST) expect(LAUNCHER_FIRST, reserved).not.toContain(reserved);
    for (const name of ['main', 'd', 'console', 'setup', 'forge', 'news', 'roadmap', 'journey', 'archive', 'server', 'testroom', 'playtest', 'ws', 'health', 'rooms', 'maps', 'replays', 'account', 'lobby', 'clan', 'texts', 'modern', 'metrics', 'startup']) {
      expect(LAUNCHER_RESERVED_FIRST, name).toContain(name);
    }
  });

  it('a settings tab is one page, a category change is the same page, and Home has no Back label', () => {
    const s = createState(a);
    expect(launcherBackLabel(s)).toBeNull();
    const home = launcherPageKey(s, a);
    s.cat = 4;
    expect(launcherPageKey(s, a)).toBe(home);
    s.screen = 'options';
    s.opt.cat = 0;
    const tab = launcherPageKey(s, a);
    expect(tab).not.toBe(home);
    s.opt.cat = 1;
    s.opt.row = 3;
    expect(launcherPageKey(s, a)).toBe(tab);
    expect(launcherBackLabel(s)).toBe('Settings');
    s.overlay = 'news';
    expect(launcherPageKey(s, a)).not.toBe(tab);
    expect(launcherParentKey(s, a)).toBe(tab);
    s.overlay = null;
    expect(launcherParentKey(s, a)).toBe('home');
    s.screen = 'rooms';
    expect(launcherPageKey(s, a)).not.toBe(home);
    expect(launcherParentKey(s, a)).toBe('home');
  });

  it('the persona editor and the new-persona form go back to "Profiles", the list the player sees (review-lr-4/5 low 3)', () => {
    const s = createState(a);
    s.screen = 'personaEdit';
    expect(launcherBackLabel(s)).toBe('Profiles');
    s.screen = 'personaNew';
    expect(launcherBackLabel(s)).toBe('Profiles');
  });

  describe('the persona editor\'s path (a browser adaptation: a Chrome before ~117 refuses a path holding %00)', () => {
    const editPath = (id: string): string => {
      const s = createState(a);
      s.screen = 'personaEdit';
      s.pf = { ...s.pf, id };
      return encodeLauncherPath(s, a);
    };
    const decoded = (path: string): ConsoleState => {
      const s = createState(a);
      decodeLauncherPath(`/${path}`, '/', s, a);
      return s;
    };
    // `adapters/profile.ts` `personaId`: HOST, PORT and NAME joined by two NULs. A NAME is anything but `"` and control
    // characters (`modern/profile/cardEdits.ts` `personaNameProblem`).
    const id = (host: string, port: string, name: string): string => `${host}\u0000${port}\u0000${name}`;
    const ids = [
      id('', '', 'Bob'),
      id('', '6000', 'Bob'),
      id('a.b:1', '10071', 'Bob'),
      ...['/', '%', '`', '~', '.', '+', '&', '?', '#', ' ', 'é', 'new', ',', '%2C', '%00', '%41', 'a/b%2Fc', 'Zed` x'].map((n) => id('h.example', '10071', n)),
      id('', '', 'new'),
      'p1',
    ];

    it('holds neither a NUL nor %00', () => {
      for (const x of ids) {
        const path = editPath(x);
        expect(path, JSON.stringify(x)).not.toContain('\u0000');
        expect(path.toLowerCase(), JSON.stringify(x)).not.toContain('%00');
      }
    });

    it('round-trips every id the launcher can hold, and never reads as the new-persona form', () => {
      for (const x of ids) {
        const s = decoded(editPath(x));
        expect(s.screen, JSON.stringify(x)).toBe('personaEdit');
        expect(s.pf.id, JSON.stringify(x)).toBe(x);
        expect(encodeLauncherPath(s, a), JSON.stringify(x)).toBe(editPath(x));
      }
    });

    it('an old link (the %00 form, a bookmark or a history entry from before) opens the same persona', () => {
      for (const x of ids) {
        const s = decoded(`profile/personas/${encodeURIComponent(x)}`);
        expect(s.screen, JSON.stringify(x)).toBe('personaEdit');
        expect(s.pf.id, JSON.stringify(x)).toBe(x);
      }
    });

    // The browser's own pipeline: the path goes into a URL, the parser hands back `location.pathname`, and `adopt`
    // (`../../src/console/history.ts`) calls `classifyLauncherPath` and `decodeLauncherPath` on it with the nav's base.
    const BASES = ['/', '/socomlegacy/'];
    const parsed = (base: string, path: string): string => new URL(base + path, 'https://socomlegacy.com').pathname;
    const undotted = [
      ...['/', '%', '`', '~', '+', '&', '?', '#', ' ', 'é', 'new', ',', '%2C', '%2F', '%00', '%41', 'a/b%2Fc', 'Zed` x'].map((n) => id('', '10071', n)),
      id('', '', 'new'),
      id('a:1', '6000', 'Bob'),
    ];
    const dotted = [id('a.b:1', '10071', 'Bob'), id('', '10071', '.'), id('', '10071', 'a.b')];

    it('survives the browser\'s URL parser and adopt\'s calls, under base / and a base below it', () => {
      for (const base of BASES) {
        for (const x of undotted) {
          const path = editPath(x);
          const pathname = parsed(base, path);
          expect(pathname, `${base} ${JSON.stringify(x)}`).toBe(base + path);
          expect(classifyLauncherPath(pathname, base, null), `${base} ${JSON.stringify(x)}`).toBe('ours');
          const s = createState(a);
          decodeLauncherPath(pathname, base, s, a);
          expect(s.screen, `${base} ${JSON.stringify(x)}`).toBe('personaEdit');
          expect(s.pf.id, `${base} ${JSON.stringify(x)}`).toBe(x);
        }
      }
    });

    it('LATER 923 (an existing limit): a persona whose HOST or NAME holds a dot is skipped by classifyLauncherPath', () => {
      for (const base of BASES) {
        for (const x of dotted) {
          const path = editPath(x);
          const pathname = parsed(base, path);
          expect(pathname, `${base} ${JSON.stringify(x)}`).toBe(base + path);
          // Today's value, not the wanted one: update this on purpose when LATER 923 lands.
          expect(classifyLauncherPath(pathname, base, null), `${base} ${JSON.stringify(x)}`).toBe('skip');
          const s = createState(a);
          decodeLauncherPath(pathname, base, s, a);
          expect(s.pf.id, `${base} ${JSON.stringify(x)}`).toBe(x);
        }
      }
    });

    it('profile/personas/new is still the new-persona form', () => {
      expect(decoded('profile/personas/new').screen).toBe('personaNew');
    });
  });

  it('a deep link to button mapping focuses Controller on the Button mapping row', () => {
    const display = a.options.categories()[0]!;
    const options = {
      ...a.options,
      categories: () => [
        display,
        {
          ...display, id: 'controller', label: 'Controller', rows: [
            { ...display.rows[0]!, id: 'look', label: 'Look sensitivity' },
            { ...display.rows[0]!, id: 'remap', label: 'Button mapping', action: 'Remap' },
          ],
        },
      ],
    };
    const adapters = { ...a, options };
    const s = createState(adapters);
    decodeLauncherPath('/settings/controller/mapping', '/', s, adapters);
    expect(s.screen).toBe('remap');
    expect(s.opt.zone).toBe('rows');
    expect(options.categories()[s.opt.cat]?.id).toBe('controller');
    expect(options.categories()[s.opt.cat]?.rows[s.opt.row]?.id).toBe('remap');
    s.screen = 'options';
    expect(encodeLauncherPath(s, adapters)).toBe('settings/controller');
  });

  it('the loadout editor path is the list row\'s mission before the editor has loaded', () => {
    let ready = false;
    const adapters = {
      ...a,
      loadouts: {
        open() {},
        retry() {},
        edit() {},
        step() {},
        save: () => null,
        defaults: () => null,
        close() {},
        follow() {},
        sync() {},
        list: () => ({ kind: 'ok' as const, rows: [{ mission: 'MP51', name: 'Vigilance', state: 'default' as const }], empty: null }),
        editor: () => ready
          ? { kind: 'ok' as const, mission: 'MP51', name: 'Vigilance', head: '', held: '', rows: [], busy: false, dirty: false }
          : { kind: 'loading' as const },
      },
    } as Adapters;
    const s = createState(adapters);
    s.screen = 'loadout';
    s.lo = { side: 'seal', row: 0, edit: 0 };
    expect(encodeLauncherPath(s, adapters)).toBe('profile/armory/seal/MP51');
    expect(launcherPageKey(s, adapters)).toBe('loadout:seal:MP51');
    ready = true;
    expect(launcherPageKey(s, adapters)).toBe('loadout:seal:MP51');
  });

  it('a mission deep link keeps its segment while the editor and the list are still loading', () => {
    const adapters = {
      ...a,
      loadouts: {
        open() {}, retry() {}, edit() {}, step() {}, save: () => null, defaults: () => null, close() {}, follow() {}, sync() {},
        list: () => ({ kind: 'loading' as const }),
        editor: () => ({ kind: 'loading' as const }),
      },
    } as Adapters;
    const s = createState(adapters);
    decodeLauncherPath('/profile/armory/seal/MP51', '/', s, adapters);
    expect(s.screen).toBe('loadout');
    expect(s.lo.slot).toBe('MP51');
    expect(encodeLauncherPath(s, adapters)).toBe('profile/armory/seal/MP51');
    expect(launcherPageKey(s, adapters)).toBe('loadout:seal:MP51');
  });
});
