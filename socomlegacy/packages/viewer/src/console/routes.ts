import { GAME_FIRST, isLobbyLinkPath, LAUNCHER_FIRST as SITE_LAUNCHER_FIRST, reservedFirstSegments } from '@s2u/ui';
import { routeSegmentsOfPath } from '../menuRoutes';
import {
  CATS, optCategories, REMAP_ROW,
  type Adapters, type ConsoleState, type LoadoutSide, type Screen,
} from './state';

/**
 * CX-33 (CX.R16): the launcher's own paths, beside `./adapters/gamePath` and not claimed by the game's router.
 * Top-level (`/settings/...`), the owner's default. A browser adaptation (OT.R28): nothing here is a menu place.
 *
 * `/online/lobby/<id>` is the share link (LINK-2). A real id is the game's invite (`classifyLauncherPath`
 * returns foreign, so the launcher does not decode it). Any other text under that path still falls back to Home.
 * `/watch` is both the Replays category and the replays list (the path cannot tell them apart; the history entry's
 * state can, and a path-only load opens the list).
 */

/**
 * The game's first segments, the pages' (Vite's page routes), the server's (nginx's proxied ones) and the files':
 * `@s2u/ui`'s site path table (`sitePaths.ts`, the URL pathing consolidation), no longer copied here.
 */
export const LAUNCHER_RESERVED_FIRST: readonly string[] = reservedFirstSegments();

const RESERVED = new Set(LAUNCHER_RESERVED_FIRST);

/** First segments this table writes (the site path table's). None of them is reserved. */
export const LAUNCHER_FIRST: readonly string[] = SITE_LAUNCHER_FIRST;

const OURS = new Set(LAUNCHER_FIRST);

export type RouteClass = 'foreign' | 'skip' | 'ours' | 'unknown';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A game-router entry we did not write: `main/*`, `d/*`, or a menu trail with no launcher key. */
export function classifyLauncherPath(pathname: string, base: string, state: unknown): RouteClass {
  if (isRecord(state) && 's2uMenuRoute' in state && !('s2uLauncher' in state)) return 'foreign';
  const segs = routeSegmentsOfPath(pathname, base);
  if (segs.length > 0 && GAME_FIRST.includes(segs[0]!)) return 'foreign';
  // LINK-2: a share link boots the game the way `/main/online?invite=` does, and the address stays.
  if (isLobbyLinkPath(segs)) return 'foreign';
  if (segs.some((s) => s.includes('.'))) return 'skip';
  if (segs.length > 0 && RESERVED.has(segs[0]!)) return 'skip';
  if (segs.length === 0 || OURS.has(segs[0]!)) return 'ours';
  return 'unknown';
}

const catAt = (id: string): number => Math.max(0, CATS.findIndex((c) => c.id === id));

/** A `/profile/armory/<side>/<slot>` segment that is a row index (`0`), not a mission id (`MP51`). */
function isRowIndex(slot: string | undefined): slot is string {
  if (slot == null) return false;
  const n = Number(slot);
  return Number.isInteger(n) && String(n) === slot;
}

/**
 * The editor's mission id. The open editor wins; until it has loaded, a mission id still in the URL, then the list
 * row already on screen (so the first history entry is `/profile/armory/seal/MP51`, not the row index). Null when
 * none of those is ready. A row-index segment is not a mission id.
 */
function missionId(s: ConsoleState, a: Adapters): string | null {
  const ed = a.loadouts?.editor();
  if (ed?.kind === 'ok') return ed.mission;
  if (s.lo.slot && !isRowIndex(s.lo.slot)) return s.lo.slot;
  const list = a.loadouts?.list();
  if (list?.kind === 'ok') return list.rows[s.lo.row]?.mission ?? null;
  return null;
}

/**
 * A `/0` deep link is row 0. Once the list is ready and the editor has not opened, open that row's mission.
 * `normalize` sends an editor that is still gone back to the list; this runs first so a listed row opens instead.
 */
export function settleLoadoutDeepLink(s: ConsoleState, a: Adapters): void {
  if (s.screen !== 'loadout' || !isRowIndex(s.lo.slot)) return;
  const lo = a.loadouts;
  if (!lo || lo.editor().kind !== 'gone') return;
  const list = lo.list();
  if (list.kind !== 'ok') return;
  const mission = list.rows[s.lo.row]?.mission;
  if (mission) lo.edit(mission);
}

/** The path under the base, no leading slash. Home is `''`. */
export function encodeLauncherPath(s: ConsoleState, a: Adapters): string {
  const cat = CATS[s.cat]?.id ?? 'home';
  switch (s.screen) {
    case 'home':
      if (cat === 'online') return 'online';
      if (cat === 'replays') return 'watch';
      if (cat === 'profile') return 'profile';
      if (cat === 'options') return 'settings';
      if (cat === 'experiments') return 'experiments';
      return '';
    case 'rooms': return 'online/rooms';
    case 'room': return `online/rooms/${encodeURIComponent(s.lb.room ?? '')}`;
    case 'game': return `online/games/${encodeURIComponent(s.lb.game ?? '')}`;
    case 'custom': return 'online/custom';
    case 'server': return 'online/server';
    case 'mods': return 'experiments/mods';   // B206 ML-2
    case 'replays': return 'watch';
    case 'options': {
      const id = optCategories(s, a)[s.opt.cat]?.id ?? optCategories(s, a)[0]?.id ?? 'display';
      return `settings/${id}`;
    }
    case 'remap': return 'settings/controller/mapping';
    case 'persona': return 'profile/personas';
    case 'personaEdit': return `profile/personas/${encodeURIComponent(s.pf.id ?? '')}`;
    case 'personaNew': return 'profile/personas/new';
    case 'record': return 'profile/record';
    case 'loadoutSides': return 'profile/armory';
    case 'loadouts': return `profile/armory/${s.lo.side}`;
    case 'loadout': {
      const slot = missionId(s, a) ?? String(s.lo.row);
      return `profile/armory/${s.lo.side}/${encodeURIComponent(slot)}`;
    }
    default: return '';
  }
}

/**
 * What makes a history entry a different page (CX.R16: nested pages push; a category, a tab and a focus replace).
 * Every home category is one page: switching categories replaces the entry and the path (`/`, `/online`, `/settings`).
 * A settings tab is that same settings page. A dialog is its own entry on the same path.
 */
export function launcherPageKey(s: ConsoleState, a: Adapters): string {
  const path = encodeLauncherPath(s, a);
  if (s.overlay) return `ov:${s.overlay}:${path}`;
  switch (s.screen) {
    case 'home': return 'home';
    case 'options': return 'settings';
    case 'remap': return 'remap';
    case 'rooms': return 'rooms';
    case 'room': return `room:${s.lb.room ?? ''}`;
    case 'game': return `game:${s.lb.game ?? ''}`;
    case 'custom': return 'custom';
    case 'server': return 'server';
    case 'mods': return 'mods';
    case 'replays': return 'replays';
    case 'loadoutSides': return 'loadout-sides';
    case 'loadouts': return `loadouts:${s.lo.side}`;
    case 'loadout': return `loadout:${s.lo.side}:${missionId(s, a) ?? ''}`;
    case 'persona': return 'persona';
    case 'personaEdit': return `persona:${s.pf.id ?? ''}`;
    case 'personaNew': return 'persona-new';
    case 'record': return 'record';
    default: return s.screen;
  }
}

/**
 * The page Circle leaves to (CX-34: `history.back()` when that entry is already ours, otherwise replace).
 * Null on Home. A dialog's parent is the page under it.
 */
export function launcherParentKey(s: ConsoleState, a: Adapters): string | null {
  if (s.overlay) return launcherPageKey({ ...s, overlay: null }, a);
  switch (s.screen) {
    case 'home': return null;
    case 'options': return 'home';
    case 'remap': return 'settings';
    case 'rooms': return 'home';
    case 'room': return 'rooms';
    case 'game': return s.lb.from === 'room' ? `room:${s.lb.room ?? ''}` : 'rooms';
    case 'custom': return 'home';
    case 'server': return 'home';
    case 'mods': return 'home';
    case 'replays': return 'home';
    case 'loadoutSides': return 'home';
    case 'loadouts': return 'loadout-sides';
    case 'loadout': return `loadouts:${s.lo.side}`;
    case 'persona': return 'home';
    case 'personaEdit':
    case 'personaNew': return 'persona';
    case 'record': return 'home';
    default: return null;
  }
}

const home = (s: ConsoleState, id: string): void => { s.screen = 'home'; s.cat = catAt(id); };

/** Applies a launcher path to `s`. An unknown path, and the unbuilt lobby path, land on Home. */
export function decodeLauncherPath(pathname: string, base: string, s: ConsoleState, a: Adapters): void {
  const segs = routeSegmentsOfPath(pathname, base).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const first = segs[0] ?? '';
  if (segs.length === 0 || first === '') { home(s, 'home'); return; }
  if (first === 'online') {
    const rest = segs[1] ?? '';
    if (rest === '' ) { home(s, 'online'); return; }
    if (rest === 'rooms' && segs.length === 2) { s.screen = 'rooms'; return; }
    if (rest === 'rooms' && segs[2]) { s.screen = 'room'; s.lb = { ...s.lb, room: segs[2]!, from: 'rooms' }; return; }
    if (rest === 'games' && segs[2]) { s.screen = 'game'; s.lb = { ...s.lb, game: segs[2]! }; return; }
    if (rest === 'custom') { s.screen = 'custom'; return; }
    if (rest === 'server') { s.screen = 'server'; return; }
    // A share link is the game's invite (classified foreign). This table has no screen for it, so Home.
    home(s, 'home');
    return;
  }
  if (first === 'watch') { s.screen = 'replays'; s.cat = catAt('profile'); return; }
  if (first === 'experiments') {
    home(s, 'experiments');
    if (segs[1] === 'mods') s.screen = 'mods';   // B206 ML-2: the MODS screen, pushed from Experiments
    return;
  }
  if (first === 'profile') {
    const rest = segs[1] ?? '';
    if (rest === '') { home(s, 'profile'); return; }
    if (rest === 'personas' && segs.length === 2) { s.screen = 'persona'; return; }
    if (rest === 'personas' && segs[2] === 'new') { s.screen = 'personaNew'; return; }
    if (rest === 'personas' && segs[2]) { s.screen = 'personaEdit'; s.pf = { ...s.pf, id: segs[2]! }; return; }
    if (rest === 'record') { s.screen = 'record'; return; }
    if (rest === 'armory' && !segs[2]) { s.screen = 'loadoutSides'; s.lo.row = 0; return; }
    if (rest === 'armory' && (segs[2] === 'seal' || segs[2] === 'terrorist')) {
      const side = segs[2] as LoadoutSide;
      s.lo = { ...s.lo, side };
      if (segs[3]) {
        s.screen = 'loadout';
        // Keep the segment (a mission id or a row index) so the first history write does not invent `/0`.
        s.lo = { ...s.lo, side, slot: segs[3] };
        const n = Number(segs[3]);
        if (Number.isInteger(n) && String(n) === segs[3]) s.lo = { ...s.lo, row: n };
        return;
      }
      s.screen = 'loadouts';
      return;
    }
    home(s, 'profile');
    return;
  }
  if (first === 'settings') {
    if (!segs[1]) { home(s, 'options'); return; }
    if (segs[1] === 'controller' && segs[2] === 'mapping') {
      s.screen = 'remap';
      // Circle on the mapping screen returns to Settings at `opt.cat` (`closeRemap`). A deep link has not visited
      // Controller, so name that tab and its Button mapping row or the return lands on Display.
      const cats = optCategories(s, a);
      const cat = cats.findIndex((c) => c.id === 'controller');
      const row = cat >= 0 ? cats[cat]!.rows.findIndex((r) => r.id === REMAP_ROW) : -1;
      s.opt = { cat: cat >= 0 ? cat : 0, row: row >= 0 ? row : 0, zone: 'rows' };
      return;
    }
    s.screen = 'options';
    const cats = optCategories(s, a);
    const i = cats.findIndex((c) => c.id === segs[1]);
    s.opt = { cat: i >= 0 ? i : 0, row: 0, zone: 'rows' };
    return;
  }
  home(s, 'home');
}

/** The loadout editor's mission id on a `/profile/armory/<side>/<id>` path, else null. */
function missionSegment(pathname: string, base: string): string | null {
  const segs = routeSegmentsOfPath(pathname, base);
  if (segs[0] !== 'profile' || segs[1] !== 'armory' || !segs[3]) return null;
  try { return decodeURIComponent(segs[3]); } catch { return segs[3]; }
}

/** Opens whatever the decoded screen needs so `normalize` does not bounce it. A no-op without the adapter. */
export function primeLauncherRoute(s: ConsoleState, a: Adapters, pathname = '', base = '/'): void {
  if (s.screen === 'loadouts' || s.screen === 'loadout') {
    a.loadouts?.open(s.lo.side);
    if (s.screen === 'loadout') {
      const seg = missionSegment(pathname, base);
      // A row index is not a mission id: `edit('0')` opens nothing and the editor is then sent back to the list.
      const id = seg && !isRowIndex(seg) ? seg : null;
      const ed = a.loadouts?.editor();
      if (id && !(ed?.kind === 'ok' && ed.mission === id)) a.loadouts?.edit(id);
    }
  }
  if (s.screen === 'persona' || s.screen === 'personaEdit' || s.screen === 'personaNew') a.profile?.open('persona');
  if (s.screen === 'record') a.profile?.open('record');
  if (s.screen === 'remap') a.remap?.open();
  if (s.screen === 'server') a.server.loadNews?.();
  if (s.screen === 'mods') a.mods?.open();
}

/** The header Back's label: the parent it returns to. Null on the home screen (the control is hidden there). */
export function launcherBackLabel(s: ConsoleState): string | null {
  switch (s.screen) {
    case 'home': return null;
    case 'options': return 'Settings';
    case 'remap': return 'Controller';
    case 'rooms': return 'Play online';
    case 'room': return 'Browse rooms';
    case 'game': return s.lb.from === 'room' ? 'Briefing room' : 'Browse rooms';
    case 'custom': return 'Play online';
    case 'server': return 'Play online';
    case 'mods': return 'Experiments';
    case 'replays': return 'Profile';
    case 'loadoutSides': return 'Profile';
    case 'loadouts': return 'Loadouts';
    case 'loadout': return s.lo.side === 'seal' ? 'SEAL loadouts' : 'Terrorist loadouts';
    case 'persona': return 'Profile';
    case 'personaEdit': return 'Profiles';
    case 'personaNew': return 'Profiles';
    case 'record': return 'Profile';
    default: return null;
  }
}

/** Every path the table can write, for the collision test. Dynamic ids stand in as `x`. */
export function launcherPathSamples(): readonly string[] {
  return [
    '', 'online', 'online/rooms', 'online/rooms/x', 'online/games/x', 'online/custom', 'online/server', 'online/lobby/x',
    'watch', 'profile', 'profile/personas', 'profile/personas/x', 'profile/personas/new', 'profile/record',
    'profile/armory', 'profile/armory/seal', 'profile/armory/terrorist', 'profile/armory/seal/x', 'profile/armory/terrorist/x',
    'settings', 'settings/display', 'settings/audio', 'settings/controller', 'settings/mobile', 'settings/communication',
    'settings/account', 'settings/controller/mapping', 'experiments', 'experiments/mods',
  ];
}

export type { Screen };
