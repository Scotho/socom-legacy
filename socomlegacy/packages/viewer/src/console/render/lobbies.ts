import { LOBBY_WORDS } from '../adapters/lobbies';
import { esc, ico, type IconName } from '../icons';
import { OVERLAY_LOCK_WORDS, browseCustom, browseRows, overGame, type Adapters, type ConsoleState, type LobbyLine, type LobbyPlayers } from '../state';
import { screenHead } from './head';
import { rowHtml, type Row } from './rows';
import { aside, checksOf } from './profile';

/**
 * CX-LOBBIES' screens (the console launcher plan; OT.R60 (c)): a briefing room's detail and a game's, pushed from Browse
 * rooms, and Play online's Custom matches, pushed from its row -- the retired modern Lobbies section's detail panel and
 * its Custom matches area, drawn in the console's own parts only, as `./profile` draws its screens: the ScreenHead (its
 * checks the room's or the game's count, state and lock), an ActionList item per game, fact, note and player, and the
 * aside. The rows sit in their own scroll container (`data-scroll`, CX-11). Every string from the server is set as text;
 * no medal and no game asset is drawn (MU.R3; the ranks are the original's names as text). A browser adaptation with no
 * original (OT.R28): nothing of the game's behaviour.
 */

/** One row of a lobby screen: a game (Cross opens it), a fact or a note (read only), a player, a custom match (Cross is JOIN). */
export interface LobbyItem {
  kind: 'game' | 'fact' | 'note' | 'player' | 'match';
  icon: IconName;
  title: string;
  sub: string;
  /** A game's or a custom match's id. */
  id?: string;
  /** A custom match that asks its password (FG-48a): its lock mark. */
  locked?: boolean;
}

/** The Custom matches' line while the first answer is out. */
export const CUSTOM_WAITING_WORDS = 'Reading the custom matches…';

const playerItems = (p: LobbyPlayers): LobbyItem[] => (p.kind === 'names'
  ? p.names.map((n): LobbyItem => ({ kind: 'player', icon: 'user', title: n, sub: '' }))
  : [{ kind: 'note', icon: p.private ? 'lock' : 'user', title: p.line, sub: '' }]);

/** A room's detail list: its games (or "No games yet"), then its players by name (or the line saying why none). */
export function lobbyRoomItems(a: Adapters, id: string | null): LobbyItem[] {
  const v = id === null ? null : a.rooms.room?.(id) ?? null;
  if (!v || v.kind !== 'ok') return [];
  const games: LobbyItem[] = v.games.length > 0
    ? v.games.map((g): LobbyItem => ({ kind: 'game', icon: g.locked ? 'lock' : 'armory', title: g.name, sub: g.sub, id: g.id }))
    : [{ kind: 'note', icon: 'armory', title: LOBBY_WORDS.noGames, sub: '' }];
  return [...games, ...playerItems(v.players)];
}

const lineItem = (l: LobbyLine, icon: IconName): LobbyItem => (l.kind === 'note' ? { kind: 'note', icon: 'disc', title: l.label, sub: '' } : { kind: 'fact', icon, title: l.label, sub: l.value });

/** A game's detail list: its facts, GAME DETAILS' lines, then its players. */
export function lobbyGameItems(a: Adapters, id: string | null): LobbyItem[] {
  const v = id === null ? null : a.rooms.game?.(id) ?? null;
  if (!v || v.kind !== 'ok') return [];
  return [...v.facts.map((l) => lineItem(l, 'record')), ...v.details.map((l) => lineItem(l, 'disc')), ...playerItems(v.players)];
}

/**
 * The Custom matches list: a row per listed lobby (its map, players / seats, its lock, in match), else the list's one line.
 * Over a game page JOIN is locked (OT.R60's refinement: each locked row says why in one line, as CX-PERSONA's locked rows):
 * each row carries the lock and the lock's line as its own line.
 */
export function customItems(s: ConsoleState, a: Adapters): LobbyItem[] {
  const v = a.custom?.view();
  if (!v) return [];
  if (v.kind === 'waiting') return [{ kind: 'note', icon: 'hammer', title: CUSTOM_WAITING_WORDS, sub: '' }];
  if (v.kind === 'unavailable') return [{ kind: 'note', icon: 'alert', title: v.line, sub: '' }];
  if (v.empty !== null) return [{ kind: 'note', icon: 'hammer', title: v.empty, sub: '' }];
  const joinLocked = overGame(s);
  return v.rows.map((m): LobbyItem => ({
    kind: 'match', icon: m.locked || joinLocked ? 'lock' : 'hammer', title: m.name, id: m.id, locked: m.locked,
    sub: joinLocked ? OVERLAY_LOCK_WORDS.join
      : [m.map, `${m.players}/${m.max} players`, m.locked ? 'Password' : '', m.inMatch ? LOBBY_WORDS.inMatch : ''].filter((x) => x !== '').join(' · '),
  }));
}

/** The retired section's focus adaptation, kept by the console (`keepFocus`, and Circle one level back in `../grammar`). */
export const MU_LOBBY_PAD_FOCUS_ADAPTATION = 'Circle backs out one level; a poll\'s redraw keeps the focus on its row by key; a vanished row hands it on' as const;

/** A row's key for the focus to follow: a room's, a game's or a lobby's id, else its kind and its words. */
const keyOf = (x: LobbyItem): string => x.id ?? `${x.kind}:${x.title}`;

/** The rows each list had at the last draw, and the one the focus was on (`keepFocus`). */
interface Seen { all: string; ids: readonly string[]; id: string | null }
const seen = new WeakMap<ConsoleState, Partial<Record<'rooms' | 'room' | 'custom', Seen>>>();

/** A screen pushed or returned to with its focus set on purpose: its list's last draw forgotten, so nothing moves it. */
export function forgetFocus(s: ConsoleState, list: 'rooms' | 'room' | 'custom'): void {
  const book = seen.get(s);
  if (book) delete book[list];
}

/**
 * MU_LOBBY_PAD_FOCUS_ADAPTATION (the retired section's, MU2-5; a browser adaptation, OT.R28): when a poll's answer changes
 * a list under the focus, the focus stays on the same row by its key, never its place; a row gone from under it hands it
 * to its neighbour -- the next row the old order had that is still there, else the one before. A list that did not change
 * (a press moved the focus, a filter or the search narrowed it) keeps the focus where the press put it. Answers the row.
 */
function keepFocus(s: ConsoleState, list: 'rooms' | 'room' | 'custom', all: readonly string[], shown: readonly string[], at: number): number {
  const book = seen.get(s) ?? {};
  seen.set(s, book);
  const prev = book[list];
  const key = all.join('\n');
  let row = at;
  if (prev && prev.all !== key && prev.id !== null && shown[at] !== prev.id) {
    const keyed = (id: string): number => shown.indexOf(id);
    const old = prev.ids.indexOf(prev.id);
    const next = [prev.id, ...prev.ids.slice(old + 1), ...prev.ids.slice(0, Math.max(0, old)).reverse()].map(keyed).find((i) => i >= 0);
    if (next !== undefined) row = next;
  }
  row = Math.max(0, Math.min(row, shown.length - 1));
  book[list] = { all: key, ids: shown, id: shown[row] ?? null };
  return row;
}

/**
 * The screens stand only while the lobby holds what they show (a room gone from the answer, a sign-out): a game goes
 * back to the room it was opened in when that stands, else to Browse rooms; Custom matches only over its adapter; each
 * screen's focus on one of its rows, following its row across a poll (`keepFocus`).
 */
export function normalizeLobbies(s: ConsoleState, a: Adapters): void {
  const lb = s.lb;
  if (s.screen === 'rooms' && (a.rooms.room || a.custom)) {
    // LR-37 (9): the merged list's rows -- the classic rooms, then the custom matches -- followed by key.
    const ids = browseRows(s, a).map((r) => (r.kind === 'custom' ? `custom:${r.id}` : r.id));
    const all = [...a.rooms.list().map((r) => r.id), ...browseCustom(s, a).map((r) => `custom:${r.id}`)];
    s.rooms.row = keepFocus(s, 'rooms', all, ids, s.rooms.row);
  }
  if (s.screen === 'game' && (lb.game === null || a.rooms.game?.(lb.game).kind !== 'ok')) {
    s.screen = lb.from === 'room' && lb.room !== null && a.rooms.room?.(lb.room).kind === 'ok' ? 'room' : 'rooms';
    lb.game = null;
  }
  if (s.screen === 'room' && (lb.room === null || a.rooms.room?.(lb.room).kind !== 'ok')) { s.screen = 'rooms'; lb.room = null; }
  if (s.screen === 'room') {
    const keys = lobbyRoomItems(a, lb.room).map(keyOf);
    lb.row = keepFocus(s, 'room', [lb.room ?? '', ...keys], keys, lb.row);
  }
  if (s.screen === 'game') lb.grow = Math.max(0, Math.min(lb.grow, lobbyGameItems(a, lb.game).length - 1));
  if (s.screen === 'custom' && !a.custom) s.screen = 'home';
  if (s.screen === 'custom') {
    const keys = customItems(s, a).map(keyOf);
    lb.crow = keepFocus(s, 'custom', keys, keys, lb.crow);
  }
}

const head = (eyebrow: string, title: string, checks = '', back: string | null = 'Play online'): string =>
  screenHead(`${ico('globe')}${esc(eyebrow)}`, title, back, checks);

/**
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8): an item in LR-1's row kinds (`./rows`; the artifact's
 * `rowsFor`): a game or a custom match a link row (its icon, its name, its line; Cross opens it or JOINs), a fact an info
 * row (its label and its value), a note or a player an info row. Its click is CX-LOBBIES' (`data-act`, `data-i` the
 * item's index, on a read-only row too, as every item carried them), its marks too: `data-item` its kind, `data-locked` a match's password, and over a game page a match
 * muted (`aria-disabled`) with the lock's line as its line. What it says is the adapter's, set as text.
 */
function itemRow(act: string, i: number, focused: boolean, x: LobbyItem, acts: boolean): string {
  const r: Row = x.kind === 'game' || x.kind === 'match' ? { kind: 'link', id: x.id ?? '', label: x.title, hint: x.sub, icon: x.icon }
    : x.kind === 'fact' ? { kind: 'info', label: x.title, value: x.sub } : { kind: 'info', label: x.title, value: '' };
  // A read-only row keeps the act and index every row carried (LR-10: reachable by Tab and by the frame's focus).
  const isLink = r.kind === 'link';
  return rowHtml(r, {
    focused, index: i, act, reach: !isLink, muted: isLink && !acts, ...(!isLink && x.icon === 'lock' ? { icon: 'lock' as const } : {}),
    attrs: `${x.locked ? 'data-locked ' : ''}data-item="${x.kind}"`,
  });
}

/** The rows under their section headers (the artifact's `H`): `parts` the headers and how many items each covers. */
function sections(act: string, focus: number, items: readonly LobbyItem[], acts: (x: LobbyItem) => boolean, parts: readonly [string, number][]): string {
  let at = 0;
  return parts.map(([label, n]) => {
    const part = items.slice(at, at + n).map((x, k) => itemRow(act, at + k, at + k === focus, x, acts(x))).join('');
    const head = n > 0 && label ? rowHtml({ kind: 'header', label }, { focused: false, index: at, act }) : '';
    at += n;
    return head + part;
  }).join('');
}

const rlist = (key: string, label: string, body: string): string =>
  `<div class="cx-rlist" role="group" aria-label="${esc(label)}" data-scroll data-key="${key}">${body}</div>`;

/** The head's "Launch target" line on the room or game that is the target (the launcher's only; the overlay sets none). */
const targetCheck = (s: ConsoleState, id: string): { text: string; ok: boolean }[] =>
  (s.mode !== 'overlay' && s.rooms.selected === id ? [{ text: 'Launch target', ok: true }] : []);

const empty = (key: string, label: string, eyebrow: string, back: string): string =>
  `<section class="cx-screen" aria-label="${esc(label)}" data-key="${key}">${head(eyebrow, label, '', back)}<div class="cx-screen__body">${rlist(`${key}-list`, label, '')}</div></section>`;

/** A briefing room's detail: its count, ranks and lock in the head; its games, then its players by name. */
export function lobbyRoomHtml(s: ConsoleState, a: Adapters): string {
  const v = s.lb.room === null ? null : a.rooms.room?.(s.lb.room) ?? null;
  if (!v || v.kind !== 'ok') return empty('lobby-room', 'Briefing room', 'Play online · Browse rooms', 'Browse rooms');
  const items = lobbyRoomItems(a, s.lb.room);
  const f = items[s.lb.row];
  const checks = [...v.facts.map((x) => ({ text: `${x.label}: ${x.value}`, ok: true })), ...(v.locked ? [{ text: 'Password', ok: false }] : []), ...targetCheck(s, v.id)];
  const about = f?.kind === 'game' ? aside('About this game', f.title, f.sub, 'Cross opens its players and its settings.')
    : aside('About this room', 'Briefing room', 'Its games, then who is in it, by name only.', '');
  return `<section class="cx-screen" aria-label="${esc(`Briefing room ${v.name}`)}" data-key="lobby-room">
    ${head('Play online · Browse rooms', v.name, checksOf(checks), 'Browse rooms')}
    <div class="cx-screen__body">
      ${rlist('lobby-room-list', 'Games and players', sections('lbrow', s.lb.row, items, (x) => x.kind === 'game', [['Games', Math.max(1, v.games.length)], ['Players', items.length - Math.max(1, v.games.length)]]))}
      ${about}
    </div>
  </section>`;
}

/** A game's detail: its count, state and lock in the head; its facts, GAME DETAILS, then its players by name. */
export function lobbyGameHtml(s: ConsoleState, a: Adapters): string {
  const v = s.lb.game === null ? null : a.rooms.game?.(s.lb.game) ?? null;
  if (!v || v.kind !== 'ok') return empty('lobby-game', 'Game', 'Play online · Browse rooms', s.lb.from === 'room' ? 'Briefing room' : 'Browse rooms');
  const items = lobbyGameItems(a, s.lb.game);
  const players = v.facts.find((x) => x.label === 'Players')?.value ?? '';
  const checks = [{ text: `Players: ${players}`, ok: true }, { text: v.inProgress ? LOBBY_WORDS.inProgress : LOBBY_WORDS.inLobby, ok: true }, ...(v.locked ? [{ text: 'Password', ok: false }] : []), ...targetCheck(s, v.id)];
  return `<section class="cx-screen" aria-label="${esc(`Game ${v.name}`)}" data-key="lobby-game">
    ${head(`Play online · ${v.roomName ?? 'Browse rooms'}`, v.name, checksOf(checks), s.lb.from === 'room' ? (v.roomName ?? 'Briefing room') : 'Browse rooms')}
    <div class="cx-screen__body">
      ${rlist('lobby-game-list', 'Game details and players', sections('lbgame', s.lb.grow, items, () => false, [['Game', v.facts.length], ['Game details', v.details.length], ['Players', items.length - v.facts.length - v.details.length]]))}
      ${aside('About this game', 'Game details', 'Its settings as the original\'s GAME DETAILS reads them from the list, then who is in it, by name only.', '')}
    </div>
  </section>`;
}

/** Custom matches: a row per listed forge lobby, Cross its JOIN -- locked over a game page with its line (OT.R60's locks). */
export function customHtml(s: ConsoleState, a: Adapters): string {
  const items = customItems(s, a);
  const locked = overGame(s);
  const v = a.custom?.view();
  const checks = [...(v?.kind === 'ok' ? [{ text: `${v.rows.length} listed`, ok: true }] : []), ...(locked ? [{ text: OVERLAY_LOCK_WORDS.join, ok: false }] : [])];
  return `<section class="cx-screen" aria-label="Custom matches" data-key="custom">
    ${head('Play online', 'Custom matches', checksOf(checks))}
    <div class="cx-screen__body">
      ${rlist('custom-list', 'Custom matches', sections('lbcustom', s.lb.crow, items, (x) => x.kind === 'match' && !locked, [['', items.length]]))}
      ${aside('About custom matches', 'Custom matches', 'Forge lobbies their hosts listed. Joining opens the forge at the lobby; a lobby with a password asks it there.', 'Not part of the original game: a browser adaptation.')}
    </div>
  </section>`;
}
