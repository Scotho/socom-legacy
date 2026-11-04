import {
  INVITE_ROUTE, NO_ROUTE_SESSION, PREVIOUS_SCREEN, ROUTE_PASS_THROUGH, lobbyInviteOf, menuRouteOf, routeForwardBlocked, routeKey, routePlan, routeReplay,
  routeSegments, routeStackOfKey, type FrontEndMachine, type RouteGuards, type RoutePlan, type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * The menu flow's routes in the page (ROUTE-01; the online path's plan, OT.R10; web research 129): the browser half of
 * `@s2u/ui`'s route table -- `history`, `popstate`, `location` and the site's base path. **A browser adaptation**: the
 * original has no address bar; this changes nothing the game does.
 *
 * - **The stack is the path.** After every frame the manager's stack (M's history, then the dialog the host built, read
 *   only while no switch is in flight) is compared with the address: a new screen pushes an entry
 *   (`history.pushState`); a return to the previous entry's stack -- PREVIOUS_SCREEN -- is `history.go(-1)`, so the
 *   address after it equals the address before the push, and that move's own `popstate` is not handled again.
 * - **Back and Forward drive the manager.** A `popstate` to an entry whose stack the manager's extends is PREVIOUS_SCREEN
 *   (M's history first cut to the entry's screen, so a pass-through or a jump of several entries is one return, one BACK
 *   sound); to one whose stack extends the manager's -- Forward, or Back to an entry a deep link or a reload made deeper
 *   than the manager -- the entry's next screen is switched to, through its pass-through as the original goes -- one
 *   step per idle frame, each through the SwitchMenu row, until the stack is the entry's. Re-entering a guarded screen
 *   is refused (Forward: the browser sent back; Back: the entry rewritten). A step that changes nothing gives up and the
 *   address is made the manager's.
 * - **A deep link replays.** At start, the path's stack (`routePlan`, asking the machine whether each dialog is on the
 *   disc) is booted directly: M's history pushed in order, the last dialog the menu state's first build, nothing played
 *   between. A guarded place lands on its nearest ancestor, an unknown one (or a dialog the disc lacks) on `/main`; the
 *   address is replaced with where it landed. A reload whose entry state names the same path replays the entry's own
 *   stack instead (so `menuflow=<dialog>.rdr`'s one-screen stack survives it); a fresh deep path replays the table's,
 *   which then wins over the parameter's dialog.
 * - **The query and the fragment are never touched**: every write is the base, the route's path, then
 *   `location.search` and `location.hash` as they are at that moment. `./shareUrl`'s `updateAddress` writes the query
 *   with `replaceState(history.state, '', pathname + search + hash)`, keeping the path and this module's state key, so
 *   neither undoes the other.
 *
 * At `<base>/testroom` the page never reaches this module (`./pageEntry` loads the viewer there, OT.R19).
 */

/** The key this module keeps in `history.state` (beside any other the page keeps there). */
export const MENU_ROUTE_STATE_KEY = 's2uMenuRoute';

/** An entry's route: its index among this page's entries, and the route key of every entry up to it. */
export interface MenuRouteState {
  depth: number;
  trail: string[][];
}

type PopListener = (e: { state: unknown }) => void;

/** What the adapter uses of the window (a parameter, so a test hands in its own). */
export interface MenuRoutesWindow {
  location: { readonly pathname: string; readonly search: string; readonly hash: string };
  history: {
    readonly state: unknown;
    pushState(state: unknown, unused: string, url: string): void;
    replaceState(state: unknown, unused: string, url: string): void;
    go(delta: number): void;
  };
  addEventListener(type: 'popstate', listener: PopListener): void;
  removeEventListener(type: 'popstate', listener: PopListener): void;
}

export interface MenuRoutesOptions {
  win: MenuRoutesWindow;
  /** The path the site is served under (Vite's `base`, `VIEWER_BASE`: `/socomlegacy/` on the site, `/` in development). */
  base?: string;
  /** The routes' guards; absent, `NO_ROUTE_SESSION` (no session yet: web research 129 §4). */
  guards?: RouteGuards;
  /** False once the front end is gone: the adapter stops (no write, its listener removed). */
  alive?: () => boolean;
}

/** A segment no route has: what a path outside the base, or one that will not decode, reads as. */
const UNREADABLE = '\u0000';

const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** The route's segments of a pathname under `base`; a path outside it, or one that will not decode, names nothing. */
export function routeSegmentsOfPath(pathname: string, base: string): string[] {
  const b = withSlash(base);
  let rest: string;
  if (pathname === b || pathname === b.slice(0, -1)) rest = '';
  else if (pathname.startsWith(b)) rest = pathname.slice(b.length);
  else return [UNREADABLE];
  const parts = rest.split('/').filter((p) => p !== '');
  if (parts.length === 1 && parts[0] === 'index.html') return [];
  try { return parts.map((p) => decodeURIComponent(p)); } catch { return [UNREADABLE]; }
}

/** The address of a route: the base, the segments, then the query and the fragment exactly as given. */
export function routeUrl(base: string, segments: readonly string[], search: string, hash: string): string {
  return `${withSlash(base)}${segments.map((s) => encodeURIComponent(s)).join('/')}${search}${hash}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function readState(state: unknown): MenuRouteState | null {
  const s = isRecord(state) ? state[MENU_ROUTE_STATE_KEY] : null;
  if (!isRecord(s) || typeof s.depth !== 'number' || !Number.isInteger(s.depth) || s.depth < 0) return null;
  if (!Array.isArray(s.trail) || !s.trail.every(isList)) return null;
  return { depth: s.depth, trail: (s.trail as string[][]).map((t) => [...t]) };
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const startsWith = (long: readonly string[], short: readonly string[]): boolean => short.length < long.length && short.every((x, i) => x === long[i]);
const isPassThrough = (name: string): boolean => ROUTE_PASS_THROUGH.some((p) => p.toLowerCase() === name.toLowerCase());

/** The SwitchMenu command as a script sends it through PLAT-08's host (the adapter's own name in place of an animation's). */
const switchCommand = (arg: string): ZAnimUiCommand => ({
  anim: 'menuRoutes', sequence: 'menuRoutes', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SwitchMenu', arg, loc: 0,
  bytes: new Uint8Array(0),
});

interface Pending {
  /** The entry's route key the manager is driven to. */
  target: string[];
  /** The stack when the last step was taken (no change since: give up). */
  last: string[] | null;
}

/** The adapter over one front end (`connectMenuRoutes` makes and connects it). */
export class MenuRouter {
  /** This entry's index among the page's entries. */
  depth = 0;
  /** The route key of each entry up to this one (and, after a Back, the ones ahead). */
  trail: string[][] = [];
  /** The route key the address shows; null until the first screen is seen. */
  current: string[] | null = null;
  /** Where the deep link landed. */
  plan: RoutePlan = { stack: [], segments: [], landed: 'exact' };
  private pending: Pending | null = null;
  /** The depth the page's own `go` lands on: that `popstate` is not handled again. */
  private ignore: number | null = null;
  private stopped = false;
  private readonly base: string;
  private readonly guards: RouteGuards;
  private readonly onPop: PopListener = (e) => this.popstate(e.state);

  constructor(private readonly machine: FrontEndMachine, private readonly o: MenuRoutesOptions) {
    this.base = o.base ?? import.meta.env.BASE_URL ?? '/';
    this.guards = o.guards ?? NO_ROUTE_SESSION;
  }

  /** Reads the address, replays its stack into the machine (before its first frame), writes where it landed, listens. */
  start(): RoutePlan {
    const { win } = this.o;
    const exists = (d: string): boolean => this.machine.hasDialog(d);
    const raw = routeSegmentsOfPath(win.location.pathname, this.base);
    // LINK-2: the share link plans as LOGIN (`main/online`) and the address stays `/online/lobby/<id>`.
    const lobby = lobbyInviteOf(raw);
    let plan = routePlan(lobby ? [...INVITE_ROUTE] : raw, this.guards, exists);
    // A reload keeps the entry's state: its trail goes on, so Back after a reload still returns; and its own stack is
    // replayed when it names the same place and could be entered directly (its dialogs on the disc, no guard refusing).
    const prior = readState(win.history.state);
    const priorKey = prior?.trail[prior.depth];
    if (prior && priorKey && priorKey.length && same(routeSegments(priorKey), plan.segments)) {
      this.depth = prior.depth;
      this.trail = prior.trail;
      const stack = routeStackOfKey(priorKey);
      // (the root stays the boot as it starts: `[]`)
      if (plan.landed === 'exact' && plan.segments.length && stack.every(exists) && !routeForwardBlocked([], priorKey, this.guards)) {
        plan = { ...plan, stack };
      }
    }
    this.plan = plan;
    const replay = routeReplay(plan);
    if (replay) {
      this.machine.boot(replay.dialog);
      for (const h of replay.history) this.machine.queue.pushHistory(h);
    }
    if (replay) {
      this.current = routeKey(plan.stack);
      this.trail[this.depth] = this.current;
    }
    this.write('replace', lobby ? raw : plan.segments);
    win.addEventListener('popstate', this.onPop);
    return plan;
  }

  /** Detaches: no more writes, the listener removed. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.pending = null;
    this.o.win.removeEventListener('popstate', this.onPop);
  }

  private live(): boolean {
    if (this.stopped) return false;
    if (this.o.alive && !this.o.alive()) { this.stop(); return false; }
    return true;
  }

  /** The manager's stack, when the menu state shows a built screen and nothing is queued or switching; else null. */
  private observe(): string[] | null {
    const m = this.machine;
    if (!m.states || m.states.top() !== m.menu) return null;
    const shell = m.menu.shell;
    if (!shell || shell.switchState >= 0 || m.queue.count !== 0 || !shell.currentName) return null;
    return [...m.queue.history, shell.currentName];
  }

  private write(kind: 'push' | 'replace', segments: readonly string[]): void {
    const { win } = this.o;
    const ours = { [MENU_ROUTE_STATE_KEY]: { depth: this.depth, trail: this.trail.map((t) => [...t]) } };
    const url = routeUrl(this.base, segments, win.location.search, win.location.hash);
    if (kind === 'push') win.history.pushState(ours, '', url);
    else win.history.replaceState({ ...(isRecord(win.history.state) ? win.history.state : {}), ...ours }, '', url);
  }

  private command(target: string): void {
    this.machine.host.dispatch(switchCommand(target));
  }

  /** After each frame: drive the manager towards a Back / Forward entry, else mirror its stack into the address. */
  sync(): void {
    if (!this.live()) return;
    const obs = this.observe();
    if (!obs) return;
    const key = routeKey(obs);
    if (this.pending && this.drive(obs, key)) return;
    // A pass-through on top is no screen of its own: the key drops it, so the address is its parent's (`/` while the
    // boot's cinematics play, BOOT-04; `/main` across dlgMPswitch, whose key is the menu's -- no write either way).
    this.mirror(key);
  }

  /** One step towards the pending entry, its arrival, or its abandonment: always handled (true). */
  private drive(obs: string[], key: string[]): boolean {
    const p = this.pending!;
    if (same(key, p.target)) {
      this.pending = null;
      this.current = key;
      this.trail[this.depth] = key;
      return true;
    }
    if (p.last && same(obs, p.last)) return this.abandon(key);
    p.last = obs;
    if (startsWith(key, p.target)) {
      // M's history cut to the entry's screen (its last screen kept on top), then the original's own return to it.
      let seen = 0;
      let at = -1;
      for (let i = 0; i < obs.length && at < 0; i++) if (!isPassThrough(obs[i]!) && ++seen === p.target.length) at = i;
      this.machine.queue.history.length = at + 1;
      this.command(PREVIOUS_SCREEN);
      return true;
    }
    if (startsWith(p.target, key)) {
      // Forward, or Back to an entry deeper than the manager (a deep link's or a reload's): re-entered as a link could
      if (routeForwardBlocked(key, p.target, this.guards)) return this.abandon(key);
      const next = p.target[key.length]!;
      const through = menuRouteOf(next)?.through ?? [];
      // The next screen's pass-throughs first, in the original's order, one per step: as many as are already on top
      // of the stack have been gone through (the boot's two cinematics before dlgMenu, BOOT-04; dlgMPswitch before LOGIN).
      let gone = 0;
      for (let i = obs.length - 1; i >= 0 && isPassThrough(obs[i]!); i--) gone++;
      this.command(through[gone] ?? next);
      return true;
    }
    return this.abandon(key);
  }

  /** The entry cannot be reached from here: it is given up, and this entry made to show where the manager is. */
  private abandon(key: string[]): true {
    this.pending = null;
    this.current = key;
    this.trail[this.depth] = key;
    this.write('replace', routeSegments(key));
    return true;
  }

  private mirror(key: string[]): void {
    const segments = routeSegments(key);
    if (!this.current) {
      this.current = key;
      this.trail[this.depth] = key;
      this.write('replace', segments);
      return;
    }
    if (same(key, this.current)) return;
    if (this.depth > 0 && same(key, this.trail[this.depth - 1] ?? [])) {
      // PREVIOUS_SCREEN: the entry before, by the browser's own back (its popstate is ours, not handled again).
      this.depth -= 1;
      this.current = key;
      this.ignore = this.depth;
      this.o.win.history.go(-1);
      return;
    }
    if (same(segments, routeSegments(this.current))) {
      this.current = key;
      this.trail[this.depth] = key;
      this.write('replace', segments);
      return;
    }
    this.trail = this.trail.slice(0, this.depth + 1);
    this.trail.push(key);
    this.depth += 1;
    this.current = key;
    this.write('push', segments);
  }

  /** The browser's Back or Forward (or the page's own `go`, ignored once). */
  popstate(state: unknown): void {
    if (!this.live()) return;
    const st = readState(state);
    const ignore = this.ignore;
    this.ignore = null;
    if (st && ignore !== null && st.depth === ignore) return;
    if (!st) {
      // An entry made without this module (a fragment link): the next entry, showing where the manager is.
      this.depth += 1;
      this.trail = this.trail.slice(0, this.depth);
      if (this.current) this.trail[this.depth] = this.current;
      this.write('replace', this.current ? routeSegments(this.current) : this.plan.segments);
      return;
    }
    const target = st.trail[st.depth];
    if (!target) return;
    const from = this.depth;
    if (st.depth > from && this.current && routeForwardBlocked(this.current, target, this.guards)) {
      this.ignore = from;
      this.o.win.history.go(from - st.depth);
      return;
    }
    this.depth = st.depth;
    this.trail = st.trail;
    if (this.current && same(target, this.current)) { this.pending = null; return; }
    this.pending = { target, last: null };
  }
}

/**
 * `./frontEnd`'s one line: the router started over the session's machine (before its first frame) and run after every
 * frame the machine makes.
 */
export function connectMenuRoutes(machine: FrontEndMachine, o: MenuRoutesOptions): MenuRouter {
  const router = new MenuRouter(machine, o);
  router.start();
  const frame = machine.frame.bind(machine);
  machine.frame = (dt: number) => {
    const out = frame(dt);
    router.sync();
    return out;
  };
  return router;
}
