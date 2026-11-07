import { ELIGIBLE_RANKS, type MissionRecord } from '@s2u/ui';
import { devMode, devSwitches } from '../../source';
import {
  MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION, customMatchAddress, customMatchMap, fetchCustomMatchSource, lobbyGameDetails,
  type CustomMatch, type CustomMatchServer, type CustomMatchSource, type LobbyGame, type LobbyView,
} from '../../modern/lobbies/data';
import { LobbyPoller } from '../../modern/lobbies/poller';
import {
  pingBand, type CustomMatchesAdapter, type CustomRow, type CustomView, type LobbyGameRow, type LobbyGameView, type LobbyLine, type LobbyPlayers,
  type LobbyRoomView, type PingBand,
} from '../state';

/**
 * CX-LOBBIES (the console launcher plan; OT.R60 (c)): what the retired modern Lobbies section (MU-3, MU-13d, MU2-5, FG-46,
 * FG-48a) drew of a room and a game, as the console's detail screens read it, and Play online's Custom matches. A browser
 * adaptation with no original (MU.R1, OT.R28): the original's WORLD OF SOCOM, BRIEFING ROOM and GAME LOBBY screens are
 * unchanged and stay the way into a match.
 *
 * **The details** (`roomDetail`, `gameDetail`), over the rooms adapter's one answer (`./rooms`: its poll is the page's
 * one, which Home and Server read too, so the details ask nothing of their own): a room's count and ranks, its games and
 * its players by name; a game's count, its state, its spectators, its ping, its room, its clan flag, its ranks, GAME
 * DETAILS through the original's reader (`../../modern/lobbies/data` `lobbyGameDetails` over `@s2u/ui` `gameDetails`,
 * `FUN_002e1f20` D:L183973-184130; research 154 §7.1) and its players. Names only here, never on a row (the section's
 * Q3 default); a private room's or game's lock and count with no names (MU-H3). The ranks are text, the original's rank
 * names (`ELIGIBLE_RANKS`, `FUN_002e3cc0` D:L185011-185046, research 155 §2.3; MU-F3, dot's Q6): no medal is drawn, as
 * the section drew none. The words are the section's own.
 *
 * **Custom matches** (`liveCustomMatches`; FG-46, FG.R24, a product-track adaptation with no original -- the game has no
 * editor and no custom match): the forge's lobbies their hosts listed (`fetchCustomMatchSource`, `GET
 * /lobby/forge/lobbies`, no bearer), read only while the screen is shown and the tab visible on the lobby's own poller
 * (`MU_LOBBY_POLL_ADAPTATION`'s period and backoff; no socket), each read bounded by
 * `MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION`, any refusal said as unavailable (`MU_CUSTOM_MATCHES_OPTIONAL_ADAPTATION`). A
 * row each: the name as it came (drawn as text), the map (`customMatchMap`, by the disc's mission table when it is in),
 * players / seats, in match, the lock (FG-48a); JOIN opens the forge at the lobby on the page's own window, a change of
 * page, as the section's did (`customMatchAddress`: under the page's `devmode`, or its dev-tools switch, the list's server
 * as `server=` when it is not the page's own origin). The forge asks a locked lobby's password, never the console. Nothing is stored.
 */

/** The section's words (`../../modern/lobbies/view`, retired with CX-LOBBIES), kept one for one. */
export const LOBBY_WORDS = {
  everyRank: 'Every rank',
  inProgress: 'In progress',
  inLobby: 'In the game lobby',
  privateRoom: 'Private room: names are shown to its members only',
  privateGame: 'Private game: names are shown to its members only',
  noNames: 'Names are not available from this server',
  nobody: 'Nobody here yet',
  noGames: 'No games yet',
  unavailable: 'A map in this game\'s play list is not a known multiplayer map',
  needsDisc: 'The map\'s name and the mode are read from your disc',
  customUnavailable: 'Custom matches are not available from this server',
  customEmpty: 'No custom match is listed',
  inMatch: 'In match',
} as const;

/** The original's rank names for a row's tiers (`ELIGIBLE_RANKS`' `rank` by its `icon`). */
export const rankNames = (ranks: readonly number[]): string[] => ranks.map((n) => ELIGIBLE_RANKS.find((r) => r.icon === n)?.rank ?? `tier ${n}`);
/** A row limited to some ranks: every rank (all four, the server's default) or none leaves the slot empty, as the section's. */
export const rankLimited = (ranks: readonly number[]): boolean => ranks.length !== 0 && ranks.length !== 4;
/** The original's upper-case words in the section's case ("PISTOLS ONLY" -> "Pistols only"). */
export const sentence = (w: string): string => w.charAt(0) + w.slice(1).toLowerCase();
const fact = (label: string, value: string): LobbyLine => ({ kind: 'fact', label, value });
const note = (line: string): LobbyLine => ({ kind: 'note', label: line, value: '' });
const isFull = (n: number, max: number): boolean => max > 0 && n >= max;
/** B138: a game's fullness to a joining player -- its IN (the players, the spectators apart) less the CPU seats such a player may take. */
const gameFull = (g: LobbyGame): boolean => isFull(g.inPlayers - (g.entry.replaceable ?? 0), g.maxIn);
/** The lobby's 0-3 band (`gameListRow`'s PING, `FUN_002e2ce0`) in the console's words (`../state` `pingBand`). */
export const pingWord = (ping: number): string => pingBand({ pingBand: Math.max(0, Math.min(3, ping)) as PingBand })[1];
/** GAME-PING (a browser adaptation): a game's word -- its measured ping when the rooms adapter set one (`--` for none), else the lobby's band. */
export const gamePingWord = (g: Pick<LobbyGame, 'ping' | 'measuredMs'>): string =>
  (g.measuredMs !== undefined ? pingBand({ pingMeasured: g.measuredMs })[1] : pingWord(g.ping));
/** A row's lock word: a password, or a room or game whose names its members alone see. */
export const lockWord = (x: { locked: boolean; private: boolean }): string | undefined => (x.locked ? 'Password' : x.private ? 'Private' : undefined);

/** The players as the detail shows them (the section's `players`): a private one's lock line, unknown, none, or the names. */
export function playersOf(names: readonly string[] | null, priv: boolean, kind: 'room' | 'game'): LobbyPlayers {
  if (priv && (names === null || names.length === 0)) return { kind: 'note', line: kind === 'room' ? LOBBY_WORDS.privateRoom : LOBBY_WORDS.privateGame, private: true };
  if (names === null) return { kind: 'note', line: LOBBY_WORDS.noNames, private: false };
  if (names.length === 0) return { kind: 'note', line: LOBBY_WORDS.nobody, private: false };
  return { kind: 'names', names: [...names] };
}

/** A game's map and mode as GAME DETAILS names them: the disc's name and type word when available, else the map's stem and none. */
function mapAndMode(g: LobbyGame, missions: readonly MissionRecord[] | null): { map: string; mode: string | null } {
  const m = lobbyGameDetails(g, missions).mission;
  return { map: m?.available ? m.mapName ?? '--' : g.map ?? '--', mode: m?.available ? sentence(m.typeWord ?? '') : null };
}

/** The section's clan flag's words (its row's `Clan game` mark; `gameListRow`'s CLAN, GenericField3 set, `FUN_002e2ce0`). */
export const CLAN_GAME_WORDS = 'Clan game';

/** A game's spectators as the section's flag said them (`SPEC` / `SPEC MAX`), only when it has seats for any. */
export const spectatorsWords = (g: Pick<LobbyGame, 'spectators' | 'maxSpectators'>): string | undefined =>
  (g.maxSpectators > 0 ? `${g.spectators}/${g.maxSpectators} spectators` : undefined);

/**
 * One game of a room's detail: its line -- the section's row as text, in its order (the retired `view.ts` `gameRow`): the
 * map, the mode (the disc's), its round under way, its count, then its flags -- the spectators, the lock, the clan flag,
 * the ping, the ranks (the original's rank names when it is limited to some: `ELIGIBLE_RANKS`, `FUN_002e3cc0`
 * D:L185011-185046, research 155 §2.3; MU-F3, no medal drawn).
 */
export function gameRowOf(g: LobbyGame, missions: readonly MissionRecord[] | null): LobbyGameRow {
  const { map, mode } = mapAndMode(g, missions);
  const sub = [map, mode, g.inProgress ? LOBBY_WORDS.inProgress : undefined, `${g.inPlayers}/${g.maxIn} players`, spectatorsWords(g), lockWord(g),
    g.clan ? CLAN_GAME_WORDS : undefined, `Ping ${gamePingWord(g)}`, rankLimited(g.ranks) ? `Ranks: ${rankNames(g.ranks).join(', ')}` : undefined]
    .filter((x): x is string => !!x).join(' · ');
  return { id: `game:${g.id}`, name: g.name, sub, locked: g.locked, inProgress: g.inProgress, full: gameFull(g) };
}

/** A briefing room's detail (the section's `drawDetail` for a room): its count and ranks, its games, its players. */
export function roomDetail(view: LobbyView, id: number, missions: readonly MissionRecord[] | null): LobbyRoomView {
  const r = view.rooms.find((x) => x.id === id);
  if (!r) return { kind: 'gone' };
  return {
    kind: 'ok', id: `room:${r.id}`, name: r.name, locked: r.locked, full: isFull(r.players, r.max),
    facts: [fact('Players', `${r.players}/${r.max}`), fact('Ranks', r.ranks.length === 4 ? LOBBY_WORDS.everyRank : rankNames(r.ranks).join(', '))],
    games: view.games.filter((g) => g.room === r.id).map((g) => gameRowOf(g, missions)),
    players: playersOf(r.names, r.private, 'room'),
  };
}

/**
 * A game's detail (the section's `drawDetail` for a game and its `gameSettings`): its facts, then GAME DETAILS -- the map,
 * the mode (the disc's), ROUND COUNT, ROUND TIME (minutes), FRIENDLY FIRE and RESPAWN On or Off (where the original draws
 * the line or leaves it out, the same bit), the EQlimit line; with the disc in, a play list naming a mission the table
 * lacks reads Unavailable and no settings, as the original's; before the disc, the line saying the name and mode need it.
 * One departure, the section's, labelled there: an EQlimit above 3 draws an empty line in the original (D:L184087-184099)
 * and no line here.
 */
export function gameDetail(view: LobbyView, id: number, missions: readonly MissionRecord[] | null): LobbyGameView {
  const g = view.games.find((x) => x.id === id);
  if (!g) return { kind: 'gone' };
  const room = g.room === null ? undefined : view.rooms.find((r) => r.id === g.room);
  const facts: LobbyLine[] = [fact('Players', `${g.inPlayers}/${g.maxIn}`), fact('Status', g.inProgress ? LOBBY_WORDS.inProgress : LOBBY_WORDS.inLobby)];
  if (g.maxSpectators > 0) facts.push(fact('Spectators', `${g.spectators}/${g.maxSpectators}`));
  facts.push(fact('Ping', gamePingWord(g)));
  if (room) facts.push(fact('Room', room.name));
  if (g.clan) facts.push(fact('Clan game', 'Yes'));
  if (g.ranks.length !== 4) facts.push(fact('Ranks', rankNames(g.ranks).join(', ') || 'None'));
  const det = lobbyGameDetails(g, missions);
  const m = det.mission;
  const details: LobbyLine[] = [fact('Map', mapAndMode(g, missions).map)];
  if (m && !m.available) details.push(fact('Status', 'Unavailable'), note(LOBBY_WORDS.unavailable));
  else {
    if (m) details.push(fact('Mode', sentence(m.typeWord ?? '')));
    details.push(fact('Rounds', String(det.rounds)), fact('Round time', `${det.roundMinutes} min`), fact('Friendly fire', det.friendlyFire ? 'On' : 'Off'),
      fact('Respawn', det.respawn ? 'On' : 'Off'));
    if (det.equipmentWord) details.push(fact('Weapons', sentence(det.equipmentWord)));
    if (!m) details.push(note(LOBBY_WORDS.needsDisc));
  }
  return {
    kind: 'ok', id: `game:${g.id}`, name: g.name, room: room ? `room:${room.id}` : null, roomName: room?.name ?? null, locked: g.locked,
    full: gameFull(g), inProgress: g.inProgress, facts, details, players: playersOf(g.names, g.private, 'game'),
  };
}

/** What the custom matches adapter is handed. */
export interface CustomDeps {
  /** The reader; absent, `fetchCustomMatchSource` at `base`. */
  source?: CustomMatchSource;
  /** The account requests' base: the same server the rooms are read from, which the forge's lobby client names. */
  base: string;
  /** The page's window (never an overlay frame's `about:blank`): its address for `devmode`, its origin, and JOIN's navigation. */
  page: { location: { search: string; origin: string; assign(url: string): void } };
  /** The disc's mission table when it is in (the rooms adapter's read), for the maps' names; null before it. */
  missions: () => readonly MissionRecord[] | null;
}

export type LiveCustomMatches = CustomMatchesAdapter & { dispose(): void };

export function liveCustomMatches(doc: Document, notify: () => void, deps: CustomDeps): LiveCustomMatches {
  const source = deps.source ?? fetchCustomMatchSource(deps.base);
  let shown = false;
  /** The last answer: undefined before any, null when the route gave none. */
  let list: CustomMatch[] | null | undefined;
  let waiters: (() => void)[] = [];
  const visible = (): boolean => doc.visibilityState !== 'hidden';

  /** One read, bounded by its own limit (FG-45's review F2): past it, let go as no list. It never rejects. */
  const read = (signal: AbortSignal): Promise<CustomMatch[] | null> => new Promise((resolve) => {
    const ac = new AbortController();
    const stop = (): void => { ac.abort(); };
    signal.addEventListener('abort', stop, { once: true });
    const done = (v: CustomMatch[] | null): void => { globalThis.clearTimeout(limit); signal.removeEventListener('abort', stop); resolve(v); };
    const limit = globalThis.setTimeout(() => { ac.abort(); done(null); }, MU_CUSTOM_MATCHES_TIMEOUT_MS_ADAPTATION);
    source.customMatches(ac.signal).then((v) => { done(v); }, () => { done(null); });
  });
  const poller = new LobbyPoller<CustomMatch[] | null>({
    load: read,
    onResult(r): void {
      list = r.ok ? r.value : null;
      const w = waiters; waiters = []; for (const f of w) f();
      notify();
    },
    gate: () => shown && visible(),
  });
  const evaluate = (): void => { poller.setActive(shown && visible()); };
  doc.addEventListener('visibilitychange', evaluate);

  const server = (): CustomMatchServer => ({
    devmode: devMode(deps.page.location.search), devtools: devSwitches(deps.page.location.search).tools,
    server: deps.base !== deps.page.location.origin ? deps.base : null,
  });
  const rows = (): CustomRow[] => (list ?? []).map((m) => ({
    id: m.id, name: m.name, map: customMatchMap(m.base, deps.missions()), players: m.players, max: m.max, inMatch: m.inMatch, locked: m.locked,
    href: customMatchAddress(m.id, server()), ...(m.community === true ? { community: true as const } : {}),
  }));

  return {
    sync(on: boolean): void {
      if (on === shown) return;
      shown = on;
      evaluate();
    },
    view(): CustomView {
      if (list === undefined) return { kind: 'waiting' };
      if (list === null) return { kind: 'unavailable', line: LOBBY_WORDS.customUnavailable };
      return { kind: 'ok', rows: rows(), empty: list.length === 0 ? LOBBY_WORDS.customEmpty : null };
    },
    refresh(): Promise<void> {
      return new Promise((resolve) => {
        if (!shown || !visible()) { resolve(); return; }
        waiters.push(resolve);
        poller.pollNow();
      });
    },
    join(id: string): string | null {
      const r = rows().find((x) => x.id === id);
      if (!r) return null;
      deps.page.location.assign(r.href);
      return r.href;
    },
    dispose(): void {
      poller.stop();
      doc.removeEventListener('visibilitychange', evaluate);
      const w = waiters; waiters = []; for (const f of w) f();
    },
  };
}
