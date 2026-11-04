import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MENU_SCREEN } from '../../src/screens/menuState';
import {
  GENERIC_ROUTE_SEGMENT, MENU_ROOT_DIALOG, MENU_ROUTES, NO_ROUTE_SESSION, RESERVED_ROUTE_SEGMENTS, ROUTE_PASS_THROUGH,
  ROUTE_SESSION_DIALOGS, ROUTE_SESSION_PLACEHOLDER, menuRouteOf, routeCanonicalStack, routeForwardBlocked, routeKey,
  routePlan, routeReplay, routeSegments, routeStackOfKey, TEST_ROOM_SEGMENT, type RouteGuards,
} from '../../src/routes';

/**
 * The menu flow's routes (ROUTE-01; OT.R9, OT.R10; web research 129): a **browser adaptation** -- the original has no
 * address bar -- that names where the menu flow is as a path. One table maps a dialog to a segment; the manager's
 * stack (M's history and the dialog built now) maps to a path and back. Pure: no DOM, no history, no location.
 */

const ALL: RouteGuards = { session: () => true };

/** The plan's flow (`docs/plans/2026-10-02-online-path-target.md`, "The target flow"), screen by screen. */
const FLOW: [string, string][] = [
  [MENU_ROOT_DIALOG, '/'],
  ['dlgMenu.rdr', '/main'],
  ['dlgNetLogin.rdr', '/main/online'],
  ['dlgNetAuthenticate.rdr', '/main/online/dnas'],
  ['dlgNetServerSelect.rdr', '/main/online/dnas/universe'],
  ['dlgNetPlayerName.rdr', '/main/online/dnas/universe/persona'],
  ['dlgNetConnect.rdr', '/main/online/dnas/universe/persona/connect'],
  ['dlgUsagePolicy.rdr', '/main/online/dnas/universe/persona/connect/agreement'],
  ['dlgWorldOfSOCOM.rdr', '/main/online/dnas/universe/persona/connect/agreement/world'],
  ['dlgMPBriefingRoom.rdr', '/main/online/dnas/universe/persona/connect/agreement/world/room'],
  ['dlgCreateGame.rdr', '/main/online/dnas/universe/persona/connect/agreement/world/room/create'],
  ['dlgGameLobby.rdr', '/main/online/dnas/universe/persona/connect/agreement/world/room/create/lobby'],
];
const PIN = resolve(import.meta.dirname, '../../../../tools/test/onlineDialogs.pinned.json');
/** The boot's stack under dlgMenu: its first dialog and the two cinematics it passes through (BOOT-04). */
const BOOT = [MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr'];
const path = (segments: readonly string[]): string => `/${segments.join('/')}`;
const split = (p: string): string[] => p.split('/').filter((s) => s !== '');

describe('the route table', () => {
  it('has a route for every screen of the plan\'s flow, and its root is the boot\'s first dialog (the loading screen, /)', () => {
    expect(MENU_ROOT_DIALOG).toBe(DEFAULT_MENU_SCREEN);
    expect(MENU_ROUTES.map((r) => r.dialog)).toEqual(FLOW.map(([d]) => d));
    expect(ROUTE_PASS_THROUGH).toEqual(['dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMPswitch.rdr']);
  });

  it('the boot\'s two cinematics are pass-throughs under `/` (BOOT-04, research 139 §6): no segment while they play; /main replays them into the history', () => {
    // The intro chain dlgIntroScreen -> dlgIntroCinematic -> dlgSecondCinematic -> dlgMenu (research 96 §3.2, §3.4's class "boot"):
    // each forward switch pushes the screen left (research 115 §1.2), so M's history at dlgMenu's build holds the three.
    expect(menuRouteOf('dlgMenu.rdr')?.through).toEqual(['dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr']);
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr'])).toEqual([]);
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr'])).toEqual([]);
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr'])).toEqual(['main']);
    expect(routeSegments(['dlgMenu.rdr'])).toEqual(['main']);               // after dlgMenu's SetMenuValve flushes the history
    expect(routePlan(['main'], ALL).stack).toEqual([MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr']);
    expect(routePlan(['d', 'dlgSecondCinematic'], ALL).landed).toBe('unknown');  // a pass-through has no address of its own
    expect(routeStackOfKey([MENU_ROOT_DIALOG, 'dlgMenu.rdr'])).toEqual([MENU_ROOT_DIALOG, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr']);
  });

  it('round-trips every dialog of the flow: its stack -> its path -> the plan\'s stack, the same', () => {
    for (const [dialog, want] of FLOW) {
      const stack = routeCanonicalStack(dialog)!;
      expect(stack[stack.length - 1], dialog).toBe(dialog);
      expect(path(routeSegments(stack)), dialog).toBe(want);
      const plan = routePlan(split(want), ALL);
      expect(plan.landed, dialog).toBe('exact');
      expect(path(plan.segments), dialog).toBe(want);
      if (dialog === MENU_ROOT_DIALOG) expect(plan.stack).toEqual([]);     // `/`: the boot as it starts
      else expect(plan.stack, dialog).toEqual(stack);
    }
  });

  it('segments are short, lower-case, unique among a screen\'s children, and never what the site serves under its base', () => {
    for (const r of MENU_ROUTES) {
      if (r.dialog === MENU_ROOT_DIALOG) { expect(r.segment).toBe(''); continue; }
      expect(r.segment, r.dialog).toMatch(/^[a-z]{1,10}$/);
      expect(RESERVED_ROUTE_SEGMENTS, r.dialog).not.toContain(r.segment);
      expect(r.segment).not.toBe(GENERIC_ROUTE_SEGMENT);
      for (const o of MENU_ROUTES) {
        if (o !== r && o.segment === r.segment) expect(o.parents.filter((p) => r.parents.includes(p)), `${r.dialog} ${o.dialog}`).toEqual([]);
      }
    }
    expect(RESERVED_ROUTE_SEGMENTS).toEqual(expect.arrayContaining(['maps', 'assets', 'fmv', 'fonts', 'index.html']));
  });

  it('`testroom` is reserved (OT.R19): the map viewer\'s and the match\'s page, never a menu route; a path to it plans no screen', () => {
    expect(TEST_ROOM_SEGMENT).toBe('testroom');
    expect(RESERVED_ROUTE_SEGMENTS).toContain(TEST_ROOM_SEGMENT);
    expect(MENU_ROUTES.map((r) => r.segment)).not.toContain(TEST_ROOM_SEGMENT);
    expect(routePlan([TEST_ROOM_SEGMENT], NO_ROUTE_SESSION, () => true).segments).not.toContain(TEST_ROOM_SEGMENT);
  });

  it('each edge of the table is an edge of the original\'s flow (research 128 §1; the pin)', () => {
    expect(existsSync(PIN)).toBe(true);
    const pairs = new Set((JSON.parse(readFileSync(PIN, 'utf8')) as { pairs: string[] }).pairs);
    // dlgMenu is not an online dialog, so its edge is research 128 §1's first row, not the pin's.
    pairs.add('dlgMenu.rdr -> dlgMPswitch.rdr');
    for (const r of MENU_ROUTES) {
      for (const parent of r.parents) {
        if (parent === MENU_ROOT_DIALOG) continue;                          // the boot's script, not an online edge
        const chain = [parent, ...(r.through ?? []), r.dialog];
        for (let i = 0; i + 1 < chain.length; i++) expect(pairs.has(`${chain[i]} -> ${chain[i + 1]}`), `${chain[i]} -> ${chain[i + 1]}`).toBe(true);
      }
    }
  });

  it('finds a route by the dialog\'s name as the manager compares names (case-insensitive)', () => {
    expect(menuRouteOf('DLGMENU.RDR')?.segment).toBe('main');
    expect(menuRouteOf('dlgMPswitch.rdr')).toBeNull();
    expect(menuRouteOf('dlgOptions_Menu.rdr')).toBeNull();
  });
});

describe('the stack -> the path', () => {
  it('the stack is the path: M\'s history then the dialog built now, a segment each', () => {
    expect(routeSegments([MENU_ROOT_DIALOG])).toEqual([]);
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgMenu.rdr'])).toEqual(['main']);
    expect(routeSegments(['dlgMenu.rdr'])).toEqual(['main']);                // --menu_state on dlgMenu: its own place
  });

  it('a pass-through (dlgMPswitch: no screen) has no segment of its own', () => {
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr'])).toEqual(['main']);
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr'])).toEqual(['main', 'online']);
    expect(routeKey([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr'])).toEqual([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgNetLogin.rdr']);
  });

  it('a dialog not in the table is /d/<its name>, a child of the screen it was entered from', () => {
    expect(routeSegments([MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgOptions_Menu.rdr'])).toEqual(['main', GENERIC_ROUTE_SEGMENT, 'dlgOptions_Menu']);
    expect(routeSegments(['dlgOptions_Menu.rdr'])).toEqual([GENERIC_ROUTE_SEGMENT, 'dlgOptions_Menu']);
  });

  it('a screen entered from a screen that is not its parent starts again at its own place (the history grows forward)', () => {
    // LOGIN's TRIANGLE runs SWITCHMENU(dlgMenu.rdr), which pushes LOGIN onto the history (research 128 §1, the ways back)
    const back = [MENU_ROOT_DIALOG, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr', 'dlgMenu.rdr'];
    expect(routeSegments(back)).toEqual(['main']);
    expect(routeSegments([...back, 'dlgMPswitch.rdr', 'dlgNetLogin.rdr'])).toEqual(['main', 'online']);
  });
});

describe('the path -> the plan (a deep link)', () => {
  it('replays the stack the path names: the history pushed in order, the last dialog built, nothing played between', () => {
    const plan = routePlan(['main', 'online'], ALL);
    expect(plan).toEqual({ stack: [...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr'], segments: ['main', 'online'], landed: 'exact' });
    expect(routeReplay(plan)).toEqual({ history: [...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr'], dialog: 'dlgNetLogin.rdr' });
    expect(routeReplay(routePlan([], ALL))).toBeNull();                       // `/`: the boot as it is
  });

  it('a guarded route falls back to the nearest ancestor that can be entered: no session, so nothing beyond LOGIN', () => {
    expect(ROUTE_SESSION_PLACEHOLDER).toBe('none');
    expect(NO_ROUTE_SESSION.session()).toBe(false);
    for (const [dialog, want] of FLOW) {
      const plan = routePlan(split(want));
      const guarded = split(want).length > 2;
      expect(plan.landed, dialog).toBe(guarded ? 'guard' : 'exact');
      expect(path(plan.segments), dialog).toBe(guarded ? '/main/online' : want);
    }
    expect(MENU_ROUTES.filter((r) => r.guard).map((r) => r.dialog)).toEqual(FLOW.slice(3).map(([d]) => d));
  });

  it('an unknown path lands on /main and never throws', () => {
    const MAIN = [...BOOT, 'dlgMenu.rdr'];
    for (const junk of [['nope'], ['main', 'nope'], ['main', 'online', 'nope'], ['d'], ['d', '../etc'], ['d', 'dlgMenu'],
      ['d', 'dlgMPswitch'], ['online'], ['main', 'main'], ['\u0000'], ['d', 'x'.repeat(80)], ['toString'], ['__proto__']]) {
      const plan = routePlan(junk, ALL);
      expect(plan, junk.join('/')).toEqual({ stack: MAIN, segments: ['main'], landed: 'unknown' });
    }
  });

  it('a dialog not in the table replays by its generic route', () => {
    const plan = routePlan(['main', 'd', 'dlgOptions_Menu'], ALL);
    expect(plan).toEqual({ stack: [...BOOT, 'dlgMenu.rdr', 'dlgOptions_Menu.rdr'], segments: ['main', 'd', 'dlgOptions_Menu'], landed: 'exact' });
  });

  it('a generic segment naming a dialog the disc does not have is unknown: /main', () => {
    const disc = (d: string): boolean => d !== 'dlgNoSuch.rdr';
    const MAIN = { stack: [...BOOT, 'dlgMenu.rdr'], segments: ['main'], landed: 'unknown' };
    expect(routePlan(['d', 'dlgNoSuch'], ALL, disc)).toEqual(MAIN);
    expect(routePlan(['main', 'd', 'dlgNoSuch'], ALL, disc)).toEqual(MAIN);
    expect(routePlan(['main', 'd', 'dlgOptions_Menu'], ALL, disc).landed).toBe('exact');
    // a table dialog the disc lacks is no place either
    expect(routePlan(['main', 'online'], ALL, (d) => d !== 'dlgNetLogin.rdr')).toEqual(MAIN);
  });

  it('a generic segment carries the session guard under LOGIN and for every online dialog the table lacks', () => {
    const pin = JSON.parse(readFileSync(PIN, 'utf8')) as { dialogs: string[] };
    expect([...ROUTE_SESSION_DIALOGS].sort()).toEqual(
      pin.dialogs.filter((d) => !menuRouteOf(d) && !ROUTE_PASS_THROUGH.includes(d)).sort());
    // dlgFriendList is entered only from dlgWorldOfSOCOM (the pin): no session, no deep link to it
    expect(routePlan(['main', 'online', 'd', 'dlgFriendList'])).toEqual({
      stack: [...BOOT, 'dlgMenu.rdr', 'dlgMPswitch.rdr', 'dlgNetLogin.rdr'], segments: ['main', 'online'], landed: 'guard' });
    expect(routePlan(['d', 'dlgFriendList'])).toEqual({ stack: [MENU_ROOT_DIALOG], segments: [], landed: 'guard' });
    expect(routePlan(['main', 'd', 'dlgFriendList']).segments).toEqual(['main']);
    // beyond LOGIN, any generic child needs the session; under /main it does not
    expect(routePlan(['main', 'online', 'd', 'dlgOptions_Menu']).landed).toBe('guard');
    expect(routePlan(['main', 'd', 'dlgOptions_Menu']).landed).toBe('exact');
    // with a session they are places
    expect(routePlan(['main', 'online', 'd', 'dlgFriendList'], ALL).landed).toBe('exact');
    expect(routePlan(['d', 'dlgFriendList'], ALL).landed).toBe('exact');
  });

  it('a route key back to the stack it replays: the pass-through re-inserted where the original goes through it', () => {
    const login = routeCanonicalStack('dlgNetLogin.rdr')!;
    expect(routeStackOfKey(routeKey(login))).toEqual(login);
    expect(routeStackOfKey(['dlgMenu.rdr'])).toEqual(['dlgMenu.rdr']);
    expect(routeStackOfKey(['dlgReturnFromNTGUI2.rdr', 'dlgNetLogin.rdr'])).toEqual(['dlgReturnFromNTGUI2.rdr', 'dlgNetLogin.rdr']);
  });
});

describe('routeForwardBlocked (Forward re-enters only what a deep link could)', () => {
  it('refuses a step into a guarded screen without a session, allows the rest', () => {
    const login = routeKey(routeCanonicalStack('dlgNetLogin.rdr')!);
    const dnas = routeKey(routeCanonicalStack('dlgNetAuthenticate.rdr')!);
    const main = routeKey(routeCanonicalStack('dlgMenu.rdr')!);
    expect(routeForwardBlocked(login, dnas)).toBe(true);
    expect(routeForwardBlocked(login, dnas, ALL)).toBe(false);
    expect(routeForwardBlocked(main, login)).toBe(false);
  });

  it('refuses a step into a generic session screen too (the same guard a deep link meets)', () => {
    const login = routeKey(routeCanonicalStack('dlgNetLogin.rdr')!);
    const main = routeKey(routeCanonicalStack('dlgMenu.rdr')!);
    expect(routeForwardBlocked(login, [...login, 'dlgFriendList.rdr'])).toBe(true);
    expect(routeForwardBlocked(login, [...login, 'dlgOptions_Menu.rdr'])).toBe(true);
    expect(routeForwardBlocked(main, [...main, 'dlgFriendList.rdr'])).toBe(true);
    expect(routeForwardBlocked(main, [...main, 'dlgOptions_Menu.rdr'])).toBe(false);
    expect(routeForwardBlocked(login, [...login, 'dlgFriendList.rdr'], ALL)).toBe(false);
  });
});
