// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontEndMachine, MENU_ROOT_DIALOG, UiCommandHost, type DialogDesign, type ZAnimUiCommand } from '@s2u/ui';
import { bootPage } from '../src/pageEntry';
import {
  MENU_ROUTE_STATE_KEY, connectMenuRoutes, routeSegmentsOfPath, routeUrl, type MenuRoutesWindow,
} from '../src/menuRoutes';
import { updateAddress } from '../src/shareUrl';

/**
 * The menu flow's routes in the page (ROUTE-01; OT.R9, OT.R10; web research 129): a browser adaptation that keeps the
 * address's path equal to the manager's stack -- a switch pushes a history entry, PREVIOUS_SCREEN goes back one, the
 * browser's Back and Forward drive the manager, a deep link replays its stack -- under the site's base path, every query
 * parameter left byte for byte. The machine is `@s2u/ui`'s, on synthetic dialogs; the window is a fake whose `go`
 * delivers its popstate when the test says, as a browser delivers it after the call returns.
 */

const BASE = '/socomlegacy/';
/** Every parameter the page reads, with and without a value, a bare one, an escaped one, and the front end's. */
const SEARCH = '?mode=play&map=MP2&view=ps2&online=shared&server=ws%3A%2F%2Fhost%3A8787&mp&devmode&fly&lag=50&loss=0.1&menuflow&x=a+b';
const HASH = '#h';

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const DIALOGS = [
  MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr',
  'dlgNetAuthenticate.rdr', 'dlgNetServerSelect.rdr', 'dlgOptions_Menu.rdr', 'dlgFriendList.rdr',
];
/** The boot's stack under dlgMenu: its first dialog and the two cinematics `/main` passes through (BOOT-04, research 139 §6). */
const BOOT = [MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr'];
const cmd = (arg: string): ZAnimUiCommand =>
  ({ anim: 'a_script', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SwitchMenu', arg, loc: 0, bytes: new Uint8Array(0x10) });

interface Entry { state: unknown; url: string }

/** A window's history and location: entries, an index, `go` deferred until `flush` (a browser's task). */
function fakeWindow(url: string, state: unknown = null) {
  const entries: Entry[] = [{ state, url }];
  let index = 0;
  const pendingGo: number[] = [];
  const listeners = new Set<(e: { state: unknown }) => void>();
  const location = { pathname: '', search: '', hash: '' };
  const calls = { push: 0, replace: 0, go: 0 };
  const setLocation = (u: string): void => {
    const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(u)!;
    location.pathname = m[1]!; location.search = m[2] ?? ''; location.hash = m[3] ?? '';
  };
  setLocation(url);
  const clone = (s: unknown): unknown => (s === undefined ? null : structuredClone(s));
  const win: MenuRoutesWindow & { flush(): void; back(): void; forward(): void } = {
    location,
    history: {
      get state() { return entries[index]!.state; },
      pushState(state: unknown, _t: string, u: string) { calls.push++; entries.splice(index + 1); entries.push({ state: clone(state), url: u }); index++; setLocation(u); },
      replaceState(state: unknown, _t: string, u: string) { calls.replace++; entries[index] = { state: clone(state), url: u }; setLocation(u); },
      go(delta: number) { calls.go++; pendingGo.push(delta); },
    },
    addEventListener: (_t: 'popstate', l: (e: { state: unknown }) => void) => { listeners.add(l); },
    removeEventListener: (_t: 'popstate', l: (e: { state: unknown }) => void) => { listeners.delete(l); },
    flush() {
      while (pendingGo.length) {
        const d = pendingGo.shift()!;
        const to = index + d;
        if (to < 0 || to >= entries.length || d === 0) continue;
        index = to;
        setLocation(entries[index]!.url);
        for (const l of [...listeners]) l({ state: entries[index]!.state });
      }
    },
    back() { this.history.go(-1); this.flush(); },
    forward() { this.history.go(1); this.flush(); },
  };
  return { win, entries, calls, index: () => index, listeners };
}

function setup(path: string, o: { startDialog?: string; dialogs?: string[]; alive?: () => boolean; state?: unknown } = {}) {
  const dialogs = o.dialogs ?? DIALOGS;
  const host = new UiCommandHost();
  const m = new FrontEndMachine({ dialog: (n) => (dialogs.includes(n) ? design() : null), host, startDialog: o.startDialog });
  m.boot();
  const w = fakeWindow(`${path}${SEARCH}${HASH}`, o.state ?? null);
  const router = connectMenuRoutes(m, { win: w.win, base: BASE, alive: o.alive });
  const run = (frames = 12): void => { for (let i = 0; i < frames; i++) m.frame(1 / 60); };
  const switchTo = (target: string): void => { host.dispatch(cmd(target)); run(); };
  const at = (): string => w.win.location.pathname;
  const stack = (): string[] => [...m.queue.history, m.shell()!.currentName];
  /** Every query parameter, byte for byte, and the fragment. */
  const paramsKept = (): void => { expect(w.win.location.search).toBe(SEARCH); expect(w.win.location.hash).toBe(HASH); };
  return { m, host, w, router, run, switchTo, at, stack, paramsKept };
}

describe('routeSegmentsOfPath / routeUrl (the base path)', () => {
  it('reads the segments under the base, and writes them back under it with the query and fragment as they were', () => {
    expect(routeSegmentsOfPath('/socomlegacy/main/online', BASE)).toEqual(['main', 'online']);
    expect(routeSegmentsOfPath('/socomlegacy/main/online/', BASE)).toEqual(['main', 'online']);
    expect(routeSegmentsOfPath('/socomlegacy/', BASE)).toEqual([]);
    expect(routeSegmentsOfPath('/socomlegacy', BASE)).toEqual([]);
    expect(routeSegmentsOfPath('/socomlegacy/index.html', BASE)).toEqual([]);
    expect(routeSegmentsOfPath('/main', '/')).toEqual(['main']);
    expect(routeSegmentsOfPath('/elsewhere/main', BASE)).toEqual(['\u0000']);       // not under the base: unknown
    expect(routeSegmentsOfPath('/socomlegacy/%E0%A4%A', BASE)).toEqual(['\u0000']);     // undecodable: unknown
    expect(routeUrl(BASE, [], SEARCH, HASH)).toBe(`/socomlegacy/${SEARCH}${HASH}`);
    expect(routeUrl(BASE, ['main', 'd', 'dlgOptions_Menu'], '', '')).toBe('/socomlegacy/main/d/dlgOptions_Menu');
  });
});

describe('connectMenuRoutes: the stack is the path', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('from /, the boot\'s screen; a SwitchMenu pushes an entry; PREVIOUS_SCREEN goes back to the address before it', () => {
    const t = setup('/socomlegacy/');
    t.run();
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG]);
    expect(t.at()).toBe('/socomlegacy/');
    expect(t.w.calls.push).toBe(0);
    t.switchTo('dlgMenu.rdr');
    expect(t.at()).toBe('/socomlegacy/main');
    t.switchTo('dlgMPswitch.rdr');                                    // a pass-through: no screen, no entry
    expect(t.at()).toBe('/socomlegacy/main');
    t.switchTo('dlgNetLogin.rdr');
    expect(t.at()).toBe('/socomlegacy/main/online');
    expect(t.w.calls.push).toBe(2);
    t.paramsKept();
    t.switchTo('dlgOptions_Menu.rdr');                                 // not in the table: /d/<name>
    expect(t.at()).toBe('/socomlegacy/main/online/d/dlgOptions_Menu');
    const before = t.w.calls.push;
    t.switchTo('PREVIOUS_SCREEN');
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.w.calls.go).toBe(1);                                      // history.back, not a new entry
    t.w.win.flush();                                                   // its popstate: ours, not handled again
    t.run();
    expect(t.at()).toBe('/socomlegacy/main/online');
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.w.calls.push).toBe(before);
    t.paramsKept();
  });

  it('Back is PREVIOUS_SCREEN to the entry\'s state; Forward re-enters; stack and path stay equal, nothing twice', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    t.switchTo('dlgOptions_Menu.rdr');
    expect(t.at()).toBe('/socomlegacy/main/d/dlgOptions_Menu');
    t.w.win.back();
    expect(t.at()).toBe('/socomlegacy/main');
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr']);
    expect(t.at()).toBe('/socomlegacy/main');
    t.w.win.forward();
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgOptions_Menu.rdr']);
    expect(t.at()).toBe('/socomlegacy/main/d/dlgOptions_Menu');
    expect(t.w.entries).toHaveLength(3);                               // no entry added by the browser's own moves
    t.w.win.back();
    t.run(30);
    t.w.win.back();
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG]);
    expect(t.at()).toBe('/socomlegacy/');
    expect(t.w.calls.push).toBe(2);
    t.paramsKept();
  });

  it('Back over a pass-through lands on the screen before it in one PREVIOUS_SCREEN; Forward plays the pass-through', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    t.switchTo('dlgMPswitch.rdr');
    t.switchTo('dlgNetLogin.rdr');
    t.w.win.back();
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr']);
    expect(t.at()).toBe('/socomlegacy/main');
    t.w.win.forward();
    t.run(60);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.at()).toBe('/socomlegacy/main/online');
    expect(t.w.entries).toHaveLength(3);
  });

  it('the router\'s own go(-1) is ignored once: the entry ahead is kept, and the next real Back is handled', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    t.switchTo('dlgOptions_Menu.rdr');
    t.switchTo('PREVIOUS_SCREEN');
    expect(t.router.trail).toHaveLength(3);
    t.w.win.flush();                                                   // the go(-1)'s popstate, entry 1's stored trail
    expect(t.router.trail).toHaveLength(3);                            // not taken from it: not handled
    expect(t.router.depth).toBe(1);
    t.w.win.back();                                                    // a real Back: handled
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG]);
    expect(t.at()).toBe('/socomlegacy/');
  });

  it('Back to an entry deeper than the manager (after a deep link) re-enters it, as Forward does', () => {
    const t = setup('/socomlegacy/main');
    t.run(1);
    t.switchTo('PREVIOUS_SCREEN');                                     // the replayed history: back to the trailer, under `/`
    expect(t.stack()).toEqual(BOOT);
    expect(t.at()).toBe('/socomlegacy/');
    expect(t.w.entries).toHaveLength(2);
    t.w.win.back();
    t.run(30);
    expect(t.stack()).toEqual([...BOOT, 'dlgMenu.rdr']);
    expect(t.at()).toBe('/socomlegacy/main');
    expect(t.w.entries.map((e) => e.url.replace(/[?#].*$/, ''))).toEqual(['/socomlegacy/main', '/socomlegacy/']);
  });

  it('Forward from `/` into /main goes through both of the boot\'s cinematics in the original\'s order (BOOT-04)', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');                                         // the boot's own arrival is three switches; a direct one here
    t.w.win.back();
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG]);
    t.w.win.forward();
    t.run(90);
    expect(t.stack()).toEqual([...BOOT, 'dlgMenu.rdr']);
    expect(t.at()).toBe('/socomlegacy/main');
  });

  it('a popup is not a route', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    const n = t.w.calls.push + t.w.calls.replace;
    t.host.dispatch({ ...cmd('popup'), fn: 'PopUpDialog' });
    t.run();
    t.host.dispatch({ ...cmd(''), fn: 'KillPopUp' });
    t.run();
    expect(t.w.calls.push + t.w.calls.replace).toBe(n);
  });
});

describe('connectMenuRoutes: a deep link', () => {
  it('replays the stack the path names, building only its last dialog', () => {
    const t = setup('/socomlegacy/main/online');
    expect(t.m.queue.history).toEqual([...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr']);
    t.run(1);
    expect(t.m.shell()!.currentName).toBe('dlgNetLogin.rdr');
    expect(t.at()).toBe('/socomlegacy/main/online');
    expect(t.w.calls.push).toBe(0);
    t.paramsKept();
    // PREVIOUS_SCREEN from the replayed stack goes where the original's history says
    t.switchTo('PREVIOUS_SCREEN');
    expect(t.stack()).toEqual([...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr']);
  });

  it('a guarded route falls back to the nearest ancestor (no session: /main/online), the address replaced', () => {
    const t = setup('/socomlegacy/main/online/dnas/universe');
    t.run(1);
    expect(t.m.shell()!.currentName).toBe('dlgNetLogin.rdr');
    expect(t.at()).toBe('/socomlegacy/main/online');
    expect(t.w.entries).toHaveLength(1);
    t.paramsKept();
  });

  it('an unknown path lands on /main and never throws', () => {
    for (const p of ['/socomlegacy/nope', '/socomlegacy/main/zzz', '/socomlegacy/d/..%2F..', '/socomlegacy/%E0%A4%A', '/elsewhere']) {
      const t = setup(p);
      t.run(1);
      expect(t.m.shell()!.currentName, p).toBe('dlgMenu.rdr');
      expect(t.at(), p).toBe('/socomlegacy/main');
      t.paramsKept();
    }
  });

  it('Forward into a guarded screen is refused: the browser is sent back, the manager stays', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    t.switchTo('dlgMPswitch.rdr');
    t.switchTo('dlgNetLogin.rdr');
    t.switchTo('dlgNetAuthenticate.rdr');                              // the game's own switch: mirrored, never guarded
    expect(t.at()).toBe('/socomlegacy/main/online/dnas');
    t.w.win.back();
    t.run(30);
    expect(t.at()).toBe('/socomlegacy/main/online');
    t.w.win.forward();                                                 // to /dnas: no session to enter it with
    t.w.win.flush();                                                   // the refusal's go(-1)
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.at()).toBe('/socomlegacy/main/online');
  });

  it('a d/ segment naming no dialog lands on /main, never on a blank screen', () => {
    for (const p of ['/socomlegacy/d/dlgNoSuch', '/socomlegacy/main/d/dlgNoSuch']) {
      const t = setup(p);
      t.run(1);
      expect(t.m.shell()!.currentName, p).toBe('dlgMenu.rdr');
      expect(t.at(), p).toBe('/socomlegacy/main');
      t.paramsKept();
    }
  });

  it('a d/ segment cannot step round the session guard', () => {
    let t = setup('/socomlegacy/main/online/d/dlgFriendList');
    t.run(1);
    expect(t.stack()).toEqual([...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.at()).toBe('/socomlegacy/main/online');
    t = setup('/socomlegacy/d/dlgFriendList');
    t.run(1);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG]);
    expect(t.at()).toBe('/socomlegacy/');
    t.paramsKept();
  });

  it('Forward into a generic session screen is refused like a table one', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    t.switchTo('dlgMPswitch.rdr');
    t.switchTo('dlgNetLogin.rdr');
    t.switchTo('dlgFriendList.rdr');                                   // the game's own switch: mirrored
    expect(t.at()).toBe('/socomlegacy/main/online/d/dlgFriendList');
    t.w.win.back();
    t.run(30);
    t.w.win.forward();
    t.w.win.flush();
    t.run(30);
    expect(t.stack()).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(t.at()).toBe('/socomlegacy/main/online');
  });

  it('a reload restores the stack the entry had (menuflow=<dialog>.rdr included); a fresh deep path replays the table\'s', () => {
    const a = setup('/socomlegacy/', { startDialog: 'dlgMenu.rdr' });
    a.run();
    expect(a.stack()).toEqual(['dlgMenu.rdr']);
    expect(a.at()).toBe('/socomlegacy/main');
    const b = setup('/socomlegacy/main', { startDialog: 'dlgMenu.rdr', state: a.w.entries[0]!.state });
    b.run(1);
    expect(b.stack()).toEqual(['dlgMenu.rdr']);                       // as before the reload: PREVIOUS_SCREEN alike
    expect(b.at()).toBe('/socomlegacy/main');
    const c = setup('/socomlegacy/main', { startDialog: 'dlgMenu.rdr' });  // no entry state: the path's own stack wins
    c.run(1);
    expect(c.stack()).toEqual([...BOOT, 'dlgMenu.rdr']);
    // an entry state that does not name the path, or names a guarded screen, is not trusted
    const forged = { [MENU_ROUTE_STATE_KEY]: { depth: 0, trail: [[MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgNetLogin.rdr', 'dlgFriendList.rdr']] } };
    const d = setup('/socomlegacy/main/online/d/dlgFriendList', { state: forged });
    d.run(1);
    expect(d.at()).toBe('/socomlegacy/main/online');
  });

  it('stops when the front end is gone (alive false): no more history writes, the listener removed', () => {
    let alive = true;
    const t = setup('/socomlegacy/', { alive: () => alive });
    t.run();
    t.switchTo('dlgMenu.rdr');
    alive = false;
    const n = t.w.calls.push + t.w.calls.replace;
    t.switchTo('dlgOptions_Menu.rdr');
    expect(t.w.calls.push + t.w.calls.replace).toBe(n);
    expect(t.w.listeners.size).toBe(0);
  });

  it('keeps its own key in history.state, beside any other the page put there', () => {
    const t = setup('/socomlegacy/');
    t.run();
    t.switchTo('dlgMenu.rdr');
    const s = t.w.win.history.state as Record<string, unknown>;
    expect(s[MENU_ROUTE_STATE_KEY]).toMatchObject({ depth: 1 });
  });
});

describe('at the test room, and beside shareUrl', () => {
  it('at /testroom (OT.R19) the front end is never mounted and nothing touches history', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const main = vi.fn(async () => {});
    const frontEnd = vi.fn(async () => { throw new Error('no front end at /testroom'); });
    expect(await bootPage('/testroom?devmode&mode=play&map=MP2', document, { main, frontEnd })).toEqual({ entry: 'viewer' });
    expect(frontEnd).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shareUrl\'s replaceState keeps the route\'s path and its history.state: the two never fight', () => {
    window.history.pushState({ [MENU_ROUTE_STATE_KEY]: { depth: 2, trail: [] } }, '', '/socomlegacy/main/online?menuflow&mode=explore');
    updateAddress({ view: 'ps2' });
    expect(window.location.pathname).toBe('/socomlegacy/main/online');
    expect(window.location.search).toBe('?mode=explore&view=ps2&menuflow');
    expect((window.history.state as Record<string, unknown>)[MENU_ROUTE_STATE_KEY]).toEqual({ depth: 2, trail: [] });
  });
});
