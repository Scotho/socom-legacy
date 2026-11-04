import { uiCommandFold } from '../uiCommands';
import { DEFAULT_MENU_SCREEN } from '../screens/menuState';

/**
 * The menu flow's routes (ROUTE-01; the online path's plan, OT.R9 and OT.R10; web research 129).
 *
 * **A browser adaptation, labelled as one**: the original has no address bar. On the front end's page (the page's base
 * path and every path but `TEST_ROOM_SEGMENT`'s, OT.R19; `menuflow` asked for it until 2026-10-04) the address's path
 * names where the menu flow is, so a link, a reload and the browser's Back and Forward reach the
 * same place. It changes nothing the game does: the path is read off the manager's own stack -- M's history
 * (`MenuQueue.history`, research 115 §1.1) and the dialog the host built now -- and a path is entered by replaying
 * that stack. A popup is not a route (an overlay on its dialog); the game states (`LOAD_SCREEN`, the round) are not.
 *
 * One table (`MENU_ROUTES`) maps a dialog to a segment, a child of the screens it is entered from (its `parents`: the
 * original's switch edges, research 128 §1). A dialog not in the table is `d/<its name>` under the screen before it,
 * so nothing is unreachable or unnamed. A pass-through dialog (`dlgMPswitch`: no object, no control, its ONSTART
 * switches on, R128.2) has no segment: it is replayed in the history, never shown.
 *
 * Pure: no DOM, no `history`, no `location` (the page's adapter is `packages/viewer/src/menuRoutes.ts`).
 */

/** The guards a route may declare. */
export type RouteGuardName = 'session';
/** What the guards ask of the page: each answers whether a route under it can be entered directly. */
export interface RouteGuards {
  /** A logged-in session on our server (the SOCOM II ONLINE menu and what it opens, and the steps that make one). */
  session(): boolean;
}

/**
 * ROUTE_SESSION_PLACEHOLDER: the session the `session` guard asks for -- none. The online screens past LOGIN are not
 * built and no session exists in the page yet (ONL-03..ONL-07, SVC-03), so a deep link past `/main/online` lands on
 * LOGIN. The guard's shape is declared now; the session's owner fills `RouteGuards.session` when one exists.
 * [placeholder]
 */
export const ROUTE_SESSION_PLACEHOLDER = 'none' as const;
/** The guards as they stand: no session. */
export const NO_ROUTE_SESSION: RouteGuards = { session: () => false };

/** One route: a dialog, its segment, the screens it is entered from. */
export interface MenuRoute {
  /** The dialog, as the scripts name it (`data/common/zrdr/dialog/<name>`). */
  dialog: string;
  /** Its path segment: `''` for the root, else short and lower-case. */
  segment: string;
  /** The screen it is: the caption the player reads, or what it is. */
  screen: string;
  /** The dialogs it is entered from; the first is its place when entered from elsewhere. */
  parents: readonly string[];
  /** Pass-through dialogs the original goes through between a parent and it (pushed into the history on a replay). */
  through?: readonly string[];
  /** Entered directly only when the guard allows (a deep link, Forward); the game's own switches are never guarded. */
  guard?: RouteGuardName;
}

/** The route's root `/`: the boot's first dialog (MS+0x30 as the game object writes it), the page's loading screen. */
export const MENU_ROOT_DIALOG = DEFAULT_MENU_SCREEN;
/** The segment of a dialog not in the table: `d/<name>`, the name without `.rdr`. */
export const GENERIC_ROUTE_SEGMENT = 'd';
// The test room's and the playtest's first segments and the reserved names: `./sitePaths` (the site path table).

/**
 * The table: the plan's target flow (`docs/plans/2026-10-02-online-path-target.md`, "The target flow"), screen by
 * screen, each edge one of research 128 §1's switches (the unit test holds them against `onlineDialogs.pinned.json`).
 * BRIEFING ROOMS has no route: it opens `ROOMLIST` in place on SOCOM II ONLINE (research 128 §4.7), not a dialog.
 */
export const MENU_ROUTES: readonly MenuRoute[] = [
  { dialog: MENU_ROOT_DIALOG, segment: '', screen: 'the loading screen (the boot\'s first dialog)', parents: [] },
  // The boot's two cinematics (BOOT-04; research 96 §3.2, §3.4's class "boot": dlgIntroScreen -> dlgIntroCinematic
  // (sony448.pss) -> dlgSecondCinematic (Intro_2.pss) -> dlgMenu) are pass-throughs under `/`: shown by their movies'
  // time, never navigated to, and each forward switch pushes the screen it leaves (research 115 §1.2), so M's history
  // at dlgMenu's build holds the three -- which `/main`'s replay rebuilds (then dlgMenu's own `SetMenuValve` flushes
  // it, research 139 §6). So `/` covers the whole boot, from the loader's screens to the main menu's first frame.
  { dialog: 'dlgMenu.rdr', segment: 'main', screen: 'the main menu', parents: [MENU_ROOT_DIALOG], through: ['dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr'] },
  { dialog: 'dlgNetLogin.rdr', segment: 'online', screen: 'LOGIN TO SOCOM II ONLINE', parents: ['dlgMenu.rdr'], through: ['dlgMPswitch.rdr'] },
  { dialog: 'dlgNetAuthenticate.rdr', segment: 'dnas', screen: 'the DNAS screen', parents: ['dlgNetLogin.rdr'], guard: 'session' },
  { dialog: 'dlgNetServerSelect.rdr', segment: 'universe', screen: 'SELECT UNIVERSE', parents: ['dlgNetAuthenticate.rdr'], guard: 'session' },
  { dialog: 'dlgNetPlayerName.rdr', segment: 'persona', screen: 'the persona', parents: ['dlgNetServerSelect.rdr'], guard: 'session' },
  { dialog: 'dlgNetConnect.rdr', segment: 'connect', screen: 'connect', parents: ['dlgNetPlayerName.rdr'], guard: 'session' },
  { dialog: 'dlgUsagePolicy.rdr', segment: 'agreement', screen: 'USER AGREEMENT', parents: ['dlgNetConnect.rdr'], guard: 'session' },
  { dialog: 'dlgWorldOfSOCOM.rdr', segment: 'world', screen: 'SOCOM II ONLINE', parents: ['dlgUsagePolicy.rdr'], guard: 'session' },
  { dialog: 'dlgMPBriefingRoom.rdr', segment: 'room', screen: 'a briefing room', parents: ['dlgWorldOfSOCOM.rdr'], guard: 'session' },
  { dialog: 'dlgCreateGame.rdr', segment: 'create', screen: 'CREATE GAME', parents: ['dlgMPBriefingRoom.rdr'], guard: 'session' },
  {
    dialog: 'dlgGameLobby.rdr', segment: 'lobby', screen: 'GAME LOBBY', guard: 'session',
    parents: ['dlgCreateGame.rdr', 'dlgMPBriefingRoom.rdr', 'dlgWorldOfSOCOM.rdr'],
  },
];

/** The pass-through dialogs: in the history, never a segment. */
export const ROUTE_PASS_THROUGH: readonly string[] = [...new Set(MENU_ROUTES.flatMap((r) => r.through ?? []))];

/**
 * The online dialogs the table does not name (research 128's pin, `tools/test/onlineDialogs.pinned.json`'s `dialogs`,
 * less the table's and the pass-through; the unit test holds the list against the pin). Each is entered only from the
 * online chain, so its generic route `d/<name>` carries the `session` guard wherever it stands: `/d/dlgFriendList`
 * cannot step round the guard `world` has.
 */
export const ROUTE_SESSION_DIALOGS: readonly string[] = [
  'dlgLoad.rdr', 'dlgOnlineFilters.rdr', 'dlgOnlineOptions.rdr', 'dlgSetSOP.rdr', 'dlgSetTaunts.rdr', 'dlgFriendList.rdr',
  'dlgIgnoreList.rdr', 'dlgCreateClan.rdr', 'dlgManageRoster.rdr', 'dlgManageRosterLeader.rdr', 'dlgInvitedPlayers.rdr',
  'dlgRespondToInvites.rdr', 'dlgLadderLobby.rdr', 'dlgClanLadderLobby.rdr', 'dlgNetError.rdr', 'dlgNetAbort.rdr',
  'dlgNetAbandoned.rdr', 'dlgNetBanned.rdr', 'dlgDownloadPatch.rdr', 'dlgReturnFromNTGUI2.rdr', 'dlgAfterErrorReboot.rdr',
  'dlgAfterReboot.rdr', 'dlgMultiplayerRound.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr',
];

/** A dialog's name as the generic segment carries it: letters, digits, underscores. */
const GENERIC_NAME = /^[A-Za-z0-9_]{1,59}$/;
const RDR = /\.rdr$/i;

const same = (a: string, b: string): boolean => uiCommandFold(a) === uiCommandFold(b);
const isPassThrough = (name: string): boolean => ROUTE_PASS_THROUGH.some((p) => same(p, name));
const LOGIN_DIALOG = 'dlgNetLogin.rdr';

/**
 * The guard a dialog's place carries, and whether what follows it is under LOGIN. A table route has its own; a generic
 * one (`d/<name>`) carries `session` when it stands under LOGIN (LOGIN, a screen past it, or a generic one there:
 * `/main/online/...` beyond LOGIN needs the session, OT.R10) or names an online dialog (`ROUTE_SESSION_DIALOGS`).
 */
function placeGuard(dialog: string, underLogin: boolean): { guard: RouteGuardName | undefined; underLogin: boolean } {
  const r = menuRouteOf(dialog);
  if (r) return { guard: r.guard, underLogin: same(r.dialog, LOGIN_DIALOG) || r.guard !== undefined };
  const guard: RouteGuardName | undefined = underLogin || ROUTE_SESSION_DIALOGS.some((d) => same(d, dialog)) ? 'session' : undefined;
  return { guard, underLogin: underLogin || guard !== undefined };
}

/** The dialog's route, compared as the manager compares names (`FUN_00198b80`, case-insensitive); null when none. */
export function menuRouteOf(dialog: string): MenuRoute | null {
  return MENU_ROUTES.find((r) => same(r.dialog, dialog)) ?? null;
}

/** A stack's identity as a route: the pass-throughs dropped. */
export function routeKey(stack: readonly string[]): string[] {
  return stack.filter((n) => !isPassThrough(n));
}

/** The stack that enters a table dialog from the root through its first parents (the through dialogs included). */
export function routeCanonicalStack(dialog: string): string[] | null {
  const chain: MenuRoute[] = [];
  for (let r = menuRouteOf(dialog); r; r = r.parents.length ? menuRouteOf(r.parents[0]!) : null) {
    if (chain.includes(r)) return null;
    chain.unshift(r);
  }
  if (!chain.length || chain[0]!.dialog !== MENU_ROOT_DIALOG) return null;
  return chain.flatMap((r) => [...(r.through ?? []), r.dialog]);
}

function canonicalSegments(r: MenuRoute): string[] {
  const out: string[] = [];
  for (let at: MenuRoute | null = r; at && at.segment !== ''; at = at.parents.length ? menuRouteOf(at.parents[0]!) : null) out.unshift(at.segment);
  return out;
}

/**
 * The stack -> the path's segments: each dialog a segment under the one before it; a pass-through none; a dialog not
 * in the table `d/<name>`; a table dialog entered from a screen that is not its parent (the history grows forward:
 * LOGIN's TRIANGLE switches to `dlgMenu`) starts again at its own place; the root clears the path.
 */
export function routeSegments(stack: readonly string[]): string[] {
  let segments: string[] = [];
  let prev: string | null = null;
  for (const name of stack) {
    if (isPassThrough(name)) continue;
    const r = menuRouteOf(name);
    if (!r) segments.push(GENERIC_ROUTE_SEGMENT, name.replace(RDR, ''));
    else if (r.segment === '') segments = [];
    else if (prev !== null && r.parents.some((p) => same(p, prev!))) segments.push(r.segment);
    else segments = canonicalSegments(r);
    prev = name;
  }
  return segments;
}

/** Where a path lands: the stack it replays, the segments of where it landed, and how. */
export interface RoutePlan {
  /** M's history then the dialog to build, pass-throughs included; `[]` for the root (the boot as it starts). */
  stack: string[];
  /** The segments of where it landed (the address to write). */
  segments: string[];
  /** `exact`: the path's own place; `guard`: its nearest ancestor a guard allows; `unknown`: `/main`. */
  landed: 'exact' | 'guard' | 'unknown';
}

const unknownPlan = (): RoutePlan => ({ stack: routeCanonicalStack('dlgMenu.rdr')!, segments: ['main'], landed: 'unknown' });

/**
 * The path's segments -> the stack to replay. Each segment is a child of the screen before it (the root first); a
 * guarded place the guards refuse -- a table route's guard, or a generic one's (`placeGuard`) -- stops the walk at its
 * parent; a segment that names nothing, or a dialog `exists` says the disc does not have, lands on `/main`. Never
 * throws.
 */
export function routePlan(
  segments: readonly string[], guards: RouteGuards = NO_ROUTE_SESSION, exists: (dialog: string) => boolean = () => true,
): RoutePlan {
  if (segments.length === 0) return { stack: [], segments: [], landed: 'exact' };
  const stack = [MENU_ROOT_DIALOG];
  const out: string[] = [];
  let prev = MENU_ROOT_DIALOG;
  let underLogin = false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    let dialog: string;
    let through: readonly string[] = [];
    let place: string[];
    if (seg === GENERIC_ROUTE_SEGMENT) {
      const name = segments[++i];
      if (name === undefined || !GENERIC_NAME.test(name)) return unknownPlan();
      dialog = `${name}.rdr`;
      // A table dialog or a pass-through has its own route, so a table guard cannot be stepped round through `d/`.
      if (menuRouteOf(dialog) || isPassThrough(dialog)) return unknownPlan();
      place = [GENERIC_ROUTE_SEGMENT, name];
    } else {
      const r = MENU_ROUTES.find((x) => x.segment !== '' && x.segment === seg && x.parents.some((p) => same(p, prev)));
      if (!r) return unknownPlan();
      dialog = r.dialog;
      through = r.through ?? [];
      place = [r.segment];
    }
    if (![...through, dialog].every((d) => exists(d))) return unknownPlan();
    const g = placeGuard(dialog, underLogin);
    if (g.guard && !guards[g.guard]()) return { stack, segments: out, landed: 'guard' };
    underLogin = g.underLogin;
    stack.push(...through, dialog);
    out.push(...place);
    prev = dialog;
  }
  return { stack, segments: out, landed: 'exact' };
}

/**
 * A route key (a stack with its pass-throughs dropped) -> the stack the original builds: a table dialog's pass-through
 * put back where it is entered from one of its parents (`dlgMenu`, `dlgMPswitch`, `dlgNetLogin`), as `routePlan` does.
 */
export function routeStackOfKey(key: readonly string[]): string[] {
  const out: string[] = [];
  key.forEach((name, i) => {
    const r = menuRouteOf(name);
    const prev = i > 0 ? key[i - 1]! : null;
    if (r?.through && prev !== null && r.parents.some((p) => same(p, prev))) out.push(...r.through);
    out.push(name);
  });
  return out;
}

/** A plan as the manager takes it: M's history, then the dialog its menu state builds; null for the root. */
export function routeReplay(plan: RoutePlan): { history: string[]; dialog: string } | null {
  if (!plan.stack.length) return null;
  return { history: plan.stack.slice(0, -1), dialog: plan.stack[plan.stack.length - 1]! };
}

/**
 * Whether going forward from one route key to another enters a place a guard refuses -- a table route's or a generic
 * one's, read along the whole key as a deep link reads its path: the browser's Forward re-enters only what a deep
 * link could.
 */
export function routeForwardBlocked(from: readonly string[], to: readonly string[], guards: RouteGuards = NO_ROUTE_SESSION): boolean {
  let i = 0;
  while (i < from.length && i < to.length && same(from[i]!, to[i]!)) i++;
  let underLogin = false;
  for (let k = 0; k < to.length; k++) {
    // a table dialog sets its own place whatever came before (`placeGuard`), as `routeSegments` starts it again
    const g = placeGuard(to[k]!, underLogin);
    if (k >= i && g.guard && !guards[g.guard]()) return true;
    underLogin = g.underLogin;
  }
  return false;
}
