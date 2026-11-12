import { routeSegmentsOfPath } from '../menuRoutes';
import { CATS, HOME_CATEGORY, type Adapters, type ConsoleState, type LoadoutSide, type Overlay, type Screen } from './state';
import {
  classifyLauncherPath, decodeLauncherPath, encodeLauncherPath, launcherPageKey, launcherParentKey, primeLauncherRoute,
} from './routes';

/**
 * CX-34..36 (CX.R16): the launcher's history. Nested pages push. A category change, a tab, a focus and a selection
 * replace (CX.R16 amendment: categories are tabs of one page). A dialog pushes the same URL (OT.R10: a popup is not a
 * route). Circle and the header Back become `history.back()` when the previous entry is ours, and otherwise the
 * screen's own pop plus `replaceState`. Overlay mode never writes. `main/*`, `d/*` and a menu-router entry are left
 * untouched (the invite flow's `main/online` and its null state).
 * A browser adaptation (OT.R28). The game's router is not imported beyond the path splitter.
 */

export interface LauncherSnap {
  id: number;
  /**
   * Where this entry sits among the session's launcher entries, 0 the first (#356's review N1, F3). A refresh keeps it,
   * so the rebuilt nav knows how many entries are behind it and places an entry it meets by Back or Forward. Absent on
   * an entry written before it was kept: placed after the current one, as before.
   */
  depth?: number;
  path: string;
  page: string;
  /** The page Circle leaves this entry for (`launcherParentKey`). Null on Home. */
  parent: string | null;
  screen: Screen;
  cat: number;
  item: number[];
  /** Stable identities keep browser history truthful when the category rail is reordered. */
  catId?: string;
  itemByCat?: Record<string, number>;
  overlay: Overlay;
  opt: { cat: number; row: number; zone: 'rows' | 'cats' };
  /** LR-37 (9): `kind` is Browse rooms' ALL / CLASSIC / CUSTOM; an entry written before LR-37 has none (read as ALL). */
  rooms: { filter: number; row: number; selected: string | null; query: string; kind?: number };
  rp: { row: number; watching: string | null };
  sv: { row: number };
  /** B206 ML-2: an entry written before the MODS screen has none (read as row 0). */
  md?: { row: number };
  rm: { row: number };
  lo: { side: LoadoutSide; row: number; edit: number; slot?: string };
  pf: { row: number; id: string | null; edit: number; rec: number; nw: { name: string; town: string; gender: 0 | 1; row: number } };
  lb: { room: string | null; row: number; game: string | null; grow: number; from: 'room' | 'rooms'; crow: number };
  confirmKind: ConsoleState['confirmKind'];
  confirmRow: number;
}

export interface LauncherNavHooks {
  /** Copy `snap` onto the console and draw. Called from `popstate` only. */
  apply(snap: LauncherSnap): void;
  /** After `apply`, once the travel guard is down, so a `normalize` bounce can replace the entry. */
  drawn?(): void;
  /** Browser Back would leave a dirty loadout editor: refuse it (the confirm still guards the leave). */
  block?(dest: LauncherSnap): boolean;
  /** The refused Back: open the unsaved-changes confirm. */
  blocked?(): void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function readLauncherSnap(state: unknown): LauncherSnap | null {
  if (!isRecord(state)) return null;
  const snap = state['s2uLauncher'];
  if (!isRecord(snap) || typeof snap['page'] !== 'string' || typeof snap['id'] !== 'number') return null;
  const saved = snap as unknown as LauncherSnap;
  const oldIds = saved.item?.length === 6 ? ['home', 'online', 'replays', 'profile', 'options', 'experiments'] : ['home', 'online', 'profile', 'options', 'experiments'];
  const fromPath: Record<string, string> = { '': 'home', online: 'online', watch: 'profile', profile: 'profile', settings: 'options', experiments: 'experiments' };
  const catId = saved.catId ?? fromPath[saved.path?.split('/')[0] ?? ''] ?? oldIds[saved.cat] ?? 'home';
  const at = CATS.findIndex((c) => c.id === catId);
  return {
    ...saved, catId, cat: at >= 0 ? at : HOME_CATEGORY,
    item: CATS.map((c) => saved.itemByCat?.[c.id] ?? saved.item?.[oldIds.indexOf(c.id)] ?? 0),
  };
}

export function captureLauncher(s: ConsoleState, a: Adapters): LauncherSnap {
  return {
    id: 0,
    path: encodeLauncherPath(s, a),
    page: launcherPageKey(s, a),
    parent: launcherParentKey(s, a),
    screen: s.screen,
    cat: s.cat,
    catId: CATS[s.cat]?.id ?? 'home',
    item: s.item.slice(),
    itemByCat: Object.fromEntries(CATS.map((c, i) => [c.id, s.item[i] ?? 0])),
    overlay: s.overlay,
    opt: { ...s.opt },
    rooms: { ...s.rooms },
    rp: { ...s.rp },
    sv: { ...s.sv },
    md: { ...s.md },
    rm: { ...s.rm },
    lo: { ...s.lo },
    pf: { ...s.pf, nw: { ...s.pf.nw } },
    lb: { ...s.lb },
    confirmKind: s.confirmKind,
    confirmRow: s.confirmRow,
  };
}

const bodyOf = (snap: LauncherSnap): string => {
  const { id, depth, ...rest } = snap;
  return JSON.stringify(rest);
};

/** The mission id in a loadout page key, including a dialog's `ov:<kind>:<path>` key. */
const missionPart = (page: string): string => {
  if (page.startsWith('loadout:')) return page.split(':').slice(2).join(':');
  if (!page.startsWith('ov:')) return '';
  const seg = page.split(':').slice(2).join(':').split('/');
  return seg[0] === 'profile' && seg[1] === 'armory' && seg[3] ? seg[3] : '';
};

/**
 * Browser Back would leave a dirty loadout editor. Compared by mission, not by screen: an entry that is also
 * `loadout` but a different mission (the row-index path that used to sit under the resolved one) is a leave.
 * The same mission is the id resolving on this editor, and a confirm already up is that prompt.
 */
export function loadoutHistoryBlocked(s: ConsoleState, dest: LauncherSnap, a: Adapters): boolean {
  if (s.screen !== 'loadout' || s.overlay === 'confirm') return false;
  const ed = a.loadouts?.editor();
  if (!(ed?.kind === 'ok' && ed.dirty)) return false;
  if (dest.screen !== 'loadout') return true;
  return missionPart(dest.page) !== ed.mission;
}

/** The open editor has unsaved changes. Browser Back off the document cannot show the confirm, so `beforeunload` does. */
export function loadoutUnsaved(s: ConsoleState, a: Adapters): boolean {
  if (s.screen !== 'loadout') return false;
  const ed = a.loadouts?.editor();
  return ed?.kind === 'ok' && ed.dirty;
}

export function guardLoadoutUnload(s: ConsoleState, a: Adapters, ev: BeforeUnloadEvent): void {
  if (!loadoutUnsaved(s, a)) return;
  ev.preventDefault();
  ev.returnValue = '';
}

/** The open editor's path just gained its mission id. That is the same page: replace, do not push a second entry. */
const missionResolved = (cur: LauncherSnap, desired: LauncherSnap): boolean => {
  if (cur.screen !== 'loadout' || desired.screen !== 'loadout') return false;
  if (cur.lo.side !== desired.lo.side || cur.overlay !== desired.overlay) return false;
  const before = missionPart(cur.page);
  const after = missionPart(desired.page);
  if (after === '' || before === after) return false;
  return before === '' || before === String(cur.lo.row);
};

const gamePath = (pathname: string, base: string): boolean => {
  const segs = routeSegmentsOfPath(pathname, base);
  return segs.length > 0 && (segs[0] === 'main' || segs[0] === 'd');
};

/**
 * LCM-19 (the LCM plan; an adaptation, product track): the event the launcher's history fires on its window after each
 * of its own entry writes (`pushState` and `replaceState` fire no `popstate`), so a page part that lives only on one
 * launcher address (the lobby's "Live match stats" link, `../lobbyLiveLink.ts`) sees the move at once. No detail.
 */
export const LAUNCHER_NAVIGATE_EVENT_ADAPTATION = 's2u:navigate';

export interface LauncherNav {
  adopt(s: ConsoleState, a: Adapters): void;
  sync(s: ConsoleState, a: Adapters): void;
  /** Drop the launcher's pushed entries before START hands the window to the game's router. */
  rewind(): Promise<void>;
  /** How many launcher entries sit behind the current one. Zero when START can hand over on this turn. */
  span(): number;
  /** A launch that did not mount: history may write again. */
  release(): void;
  dispose(): void;
}

export function launcherNav(win: Window, base: string, hooks: LauncherNavHooks): LauncherNav {
  let seq = 1;
  let stack: LauncherSnap[] = [];
  let index = 0;
  /** The depth of `stack[0]`: after a refresh the entries behind it are the browser's, unseen by this nav. */
  let offset = 0;
  let ready = false;
  let quiet = true;
  let foreign = false;
  let handed = false;
  let applying = false;
  let travel = false;
  let after: (() => void) | null = null;
  /** Set while a blocked Back is opening the confirm, so that draw does not push a second copy of the editor. */
  let sealing = false;
  let live: { s: ConsoleState; a: Adapters } | null = null;

  const onUnload = (ev: BeforeUnloadEvent): void => {
    if (live) guardLoadoutUnload(live.s, live.a, ev);
  };
  win.addEventListener('beforeunload', onUnload);

  const urlFor = (path: string): string => {
    const root = base.endsWith('/') ? base : `${base}/`;
    return `${path ? root + path : root}${win.location.search}${win.location.hash}`;
  };
  const here = (): string => `${win.location.pathname}${win.location.search}${win.location.hash}`;
  // The URL this nav was constructed on. `dispose` restores it so a later boot in the same window does not inherit a pushed path.
  const opened = here();

  const write = (kind: 'push' | 'replace', snap: LauncherSnap, keepUrl = false): void => {
    const url = keepUrl ? here() : urlFor(snap.path);
    const state = { s2uLauncher: snap };
    if (kind === 'push') win.history.pushState(state, '', url);
    else win.history.replaceState(state, '', url);
    win.dispatchEvent(new (win as Window & typeof globalThis).CustomEvent(LAUNCHER_NAVIGATE_EVENT_ADAPTATION));
  };

  const onPop = (ev: PopStateEvent): void => {
    if (travel) {
      travel = false;
      const fn = after;
      after = null;
      fn?.();
      return;
    }
    if (foreign || gamePath(win.location.pathname, base)) return;
    const snap = readLauncherSnap(ev.state);
    if (!snap) return;
    if (hooks.block?.(snap)) {
      // The Back already moved. `history.go` during this popstate is not reliable, so put the editor back
      // once, with pushState (no second popstate). The confirm's sync must not write: Leave walks off this
      // entry, and a confirm stored in it is what Forward would reopen over the list.
      const cur = stack[index];
      const at = stack.findIndex((e) => e.id === snap.id);
      if (at >= 0) index = at;
      // The fix review's F1: one behind a refresh, by its depth. An entry with no depth (an earlier build's) is left as
      // before: appending it would put the editor's copy one entry too deep (the re-review's low).
      else if (typeof snap.depth === 'number') place(snap);
      sealing = true;
      try { hooks.blocked?.(); } finally { sealing = false; }
      if (cur) push(cur);
      return;
    }
    const at = stack.findIndex((e) => e.id === snap.id);
    if (at >= 0) index = at;
    else place(snap);
    applying = true;
    try { hooks.apply(snap); } finally { applying = false; }
    hooks.drawn?.();
  };
  win.addEventListener('popstate', onPop);

  /**
   * An entry this nav has not seen (one behind a refresh, or forward of it), placed where its depth says (#356's review
   * N1): the one just behind the first known is put before it, the one just past the last after it; a jump further
   * starts the known stack again at it. Without a depth it goes after the current one, as before.
   */
  const place = (snap: LauncherSnap): void => {
    // The fix review's F2: an entry ahead of a refreshed one can hold a higher id; the next push must not reuse it.
    if (snap.id > seq) seq = snap.id;
    const d = snap.depth;
    if (typeof d !== 'number') { stack = stack.slice(0, index + 1); stack.push(snap); index = stack.length - 1; return; }
    const at = d - offset;
    if (at === -1) { stack = [snap, ...stack]; offset = d; index = 0; return; }
    if (at === stack.length) { stack.push(snap); index = at; return; }
    if (at >= 0 && at < stack.length) { stack[at] = snap; index = at; return; }
    stack = [snap];
    offset = d;
    index = 0;
  };

  const goTo = (j: number, desired: LauncherSnap): void => {
    const delta = j - index;
    if (delta === 0) { replace(desired); return; }
    desired.id = stack[j]!.id;
    desired.depth = offset + j;
    travel = true;
    after = () => {
      index = j;
      stack[j] = desired;
      // Keep the URL `go` landed on (a quiet entry may still be `/console`): only the snapshot changes.
      if (!gamePath(win.location.pathname, base)) win.history.replaceState({ s2uLauncher: desired }, '', here());
    };
    win.history.go(delta);
  };

  /** So the game's router inherits no launcher snapshot on the entry it keeps. Never touches `main/*` or `d/*`. */
  const strip = (): void => {
    if (gamePath(win.location.pathname, base)) return;
    const st = win.history.state;
    if (!isRecord(st) || !('s2uLauncher' in st)) return;
    const rest = { ...st };
    delete rest['s2uLauncher'];
    win.history.replaceState(Object.keys(rest).length ? rest : null, '', here());
  };

  /** `/console` is the launcher's alias. A same-page replace keeps it; rewriting to `/` drops the alias the entry was opened on. */
  const consoleAlias = (): boolean => routeSegmentsOfPath(win.location.pathname, base)[0] === 'console';

  const replace = (desired: LauncherSnap, keepUrl = false): void => {
    desired.id = stack[index]!.id;
    desired.depth = offset + index;
    stack[index] = desired;
    write('replace', desired, keepUrl);
  };

  const push = (desired: LauncherSnap): void => {
    stack = stack.slice(0, index + 1);
    desired.id = ++seq;
    stack.push(desired);
    index = stack.length - 1;
    desired.depth = offset + index;
    write('push', desired);
  };

  /** An earlier entry of the same page: Circle landed on a page we already pushed. */
  const earlier = (page: string): number => {
    for (let j = index - 1; j >= 0; j--) if (stack[j]!.page === page) return j;
    return -1;
  };

  return {
    adopt(s, a) {
      const kind = classifyLauncherPath(win.location.pathname, base, win.history.state);
      if (kind === 'foreign') { foreign = true; return; }
      if (kind === 'ours') {
        decodeLauncherPath(win.location.pathname, base, s, a);
        primeLauncherRoute(s, a, win.location.pathname, base);
        quiet = false;
        return;
      }
      quiet = true;
      if (kind === 'unknown') { s.screen = 'home'; s.cat = HOME_CATEGORY; }
    },
    sync(s, a) {
      live = { s, a };
      // `travel`: a `history.go` is in flight (jsdom and browsers fire its popstate on a later turn).
      if (applying || travel || handed || s.mode === 'overlay' || s.overlay === 'launch' || foreign || gamePath(win.location.pathname, base)) return;
      const desired = captureLauncher(s, a);
      if (sealing) return;
      if (!ready) {
        ready = true;
        // A refresh keeps the entry's id. Restarting at 1 collides with the entries still behind it, and Forward is lost.
        const prior = quiet ? null : readLauncherSnap(win.history.state);
        if (prior && prior.id > seq) seq = prior.id;
        desired.id = prior?.id ?? seq;
        // #356's review F3: the entries behind a refreshed one are counted from its depth.
        offset = typeof prior?.depth === 'number' ? prior.depth : 0;
        desired.depth = offset;
        stack = [desired];
        index = 0;
        if (!quiet) write('replace', desired);
        return;
      }
      const cur = stack[index];
      if (!cur) return;
      if (bodyOf(desired) === bodyOf(cur)) return;
      if (quiet) {
        if (desired.page === cur.page) {
          desired.id = cur.id;
          desired.depth = cur.depth;
          stack[index] = desired;
          // A category change is the same page and still leaves `/console`: the alias stays only while the path does.
          if (desired.path !== cur.path) { quiet = false; write('replace', desired); }
          return;
        }
        write('replace', cur, true);
        quiet = false;
        push(desired);
        return;
      }
      if (desired.page === cur.page) { replace(desired, consoleAlias()); return; }
      if (missionResolved(cur, desired)) { replace(desired); return; }
      // Yes, leave walks back to the list. A loadout-leave confirm left as this entry is what Forward restores,
      // and with the editor closed that prompt is drawn over the list. Put the editor back without it first.
      if (cur.screen === 'loadout' && cur.overlay === 'confirm' && cur.confirmKind === 'loadout-leave' && desired.screen === 'loadouts' && !desired.overlay) {
        replace({ ...cur, overlay: null, page: cur.parent ?? cur.page });
      }
      // Dismissing a dialog onto its page by walking back would leave this entry forward. When its path is the
      // row index and the page's path is now the mission, replace it instead so `/0` does not stay forward.
      if (cur.overlay && !desired.overlay && cur.parent !== null && desired.page === cur.parent && cur.path !== desired.path) {
        replace(desired);
        return;
      }
      const back = earlier(desired.page);
      if (back >= 0) { goTo(back, desired); return; }
      // No entry behind us: Circle's pop replaces, a new page pushes.
      if (cur.parent !== null && desired.page === cur.parent) { replace(desired); return; }
      push(desired);
    },
    /**
     * CX-36: the entry the game inherits carries no launcher snapshot. One entry strips in place (`history.go` is a
     * later turn, and a fake-timer arming test would wait on it). Several entries walk back to the first one first,
     * so Back in the game does not dead-press through them (`menuRoutes` treats a launcher entry as foreign).
     * `main/*` and `d/*` are not touched. Writes stay off until `release` (a launch that did not mount).
     */
    span() {
      // A `history.go` already queued (Circle's pop, still this turn) must not defer START: a fake-timer
      // arming test advances once and would never flush a second traversal.
      if (foreign || gamePath(win.location.pathname, base) || !ready || quiet || travel) return 0;
      return offset + index;
    },
    rewind() {
      if (foreign || gamePath(win.location.pathname, base) || !ready || quiet) {
        handed = true;
        return Promise.resolve();
      }
      handed = true;
      const back = offset + index;
      if (back <= 0 || travel) {
        if (!travel) strip();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        travel = true;
        after = () => {
          // The first launcher entry: known when no refresh came between, else the one the walk landed on.
          const first = offset === 0 ? stack[0] : readLauncherSnap(win.history.state);
          stack = first ? [first] : stack.slice(0, 1);
          offset = 0;
          index = 0;
          strip();
          resolve();
        };
        win.history.go(-back);
      });
    },
    release() {
      handed = false;
      // #356's review N2: START's walk stripped this entry's snapshot for the game. It did not mount, so the entry is the
      // launcher's again: put its snapshot back, or a later Back to it would restore nothing.
      const cur = stack[index];
      if (cur && ready && !quiet && !foreign && !travel && !gamePath(win.location.pathname, base) && !readLauncherSnap(win.history.state)) {
        write('replace', cur, true);
      }
    },
    dispose() {
      win.removeEventListener('popstate', onPop);
      win.removeEventListener('beforeunload', onUnload);
      if (travel) {
        // `history.go` is a later timer. `replaceState` does not cancel it, so the next boot's timer flush
        // would apply this session's entry. `pushState` clears a queued traversal (jsdom; the HTML shared
        // push steps drop pending traversals).
        travel = false;
        after = null;
        win.history.pushState(null, '', handed ? here() : opened);
      }
      // START already handed the window over. Once the address is the base or a menu path, restoring `opened`
      // would put the launcher path back after `gamePage` and the menu router would skip the boot. A walk that
      // has not landed, or a launch that never mounted, is still on a launcher path: put the boot URL back.
      // A launch that did not mount calls `release` first, so a later dispose restores either way.
      if (handed) {
        const segs = routeSegmentsOfPath(win.location.pathname, base);
        if (segs.length === 0 || segs[0] === 'main' || segs[0] === 'd') return;
      }
      // A test (and a second boot) must not inherit a path this session pushed.
      if (!(ready && !quiet && !foreign && !gamePath(win.location.pathname, base))) return;
      win.history.replaceState(null, '', opened);
    },
  };
}
