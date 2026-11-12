import type { MissionRecord } from '@s2u/ui';
import { mapLabel } from '@s2u/archive/mapNames';
import { accountServiceBase } from '../../connectHost';
import { launcherState, type LauncherState } from '../../modern/launcherState';
import {
  fetchLobbySource, lobbyGameDetails, serverFailureWords, LobbyLoadError,
  type LobbyFailure, type LobbyGame, type LobbySource, type LobbyView, type PublicRoom,
} from '../../modern/lobbies/data';
import { keeps } from '../lobbyFilters';
import { LobbyPoller, type PollResult } from '../../modern/lobbies/poller';
import { lobbySelection, type SelectionStore } from '../../modern/lobbies/selection';
import { pageSession, type ModernSession } from '../../modern/session';
import type { RoomsReading } from '../../modern/home/cards';
import type { ServerDetail } from '../../modern/report/serverDetail';
import { DoorPingCache, gamePingMs, type DoorPingCacheDeps } from '../../gamePing';
import { pingBand, type Adapters, type LobbyGameView, type LobbyRoomView, type Room, type RoomFilter } from '../state';
import { CLAN_GAME_WORDS, LOBBY_WORDS, gameDetail, lockWord, rankLimited, rankNames, roomDetail, sentence } from './lobbies';

/**
 * The console launcher's rooms (slice 2, part f): Browse rooms over the lobby the modern UI reads, through its own
 * modules (`../../modern/lobbies/data` `fetchLobbySource`, `LobbyPoller`, `lobbySelection`; MU-3) and its filters
 * (`../lobbyFilters` `keeps`, moved here with CX-LOBBIES):
 *
 * - **Signed out**, the anonymous `GET /rooms`: each classic room's map, rules, players, spectators and round -- no room
 *   name exists there, so a row is "Game in <map>"; no cap and no ping are reported, so none is drawn (the ping says
 *   Unknown).
 * - **Signed in** (CX-LOBBIES, the retired modern Lobbies section's rules), the briefing rooms of `POST
 *   /lobby/channel-list` and the game lobbies of `/lobby/game-list` (with the names route, optional) under the session's
 *   ticket: a row per briefing room in the original list's order -- its name, its games in the list, its ranks as text
 *   (MU-F3: the original's rank names, no medal drawn), its count, its lock word -- and no player's name on a row; then a
 *   row per game whose room the list does not draw (a game's own row: its name as the original's row cuts it, IN / MAX,
 *   the 0-3 ping band, 0 no players, its lock word, "In progress" while its round is under way), so every game the
 *   section listed is reached. A room's and a game's detail (`room`, `game`; `./lobbies` `roomDetail`, `gameDetail`)
 *   are read off the same answer: the games of a room, the players by name, GAME DETAILS. A game row's drawer facts are
 *   GAME DETAILS' (`lobbyGameDetails`: rounds, round time, friendly fire, respawn; the map's name and the mode word from
 *   the disc's mission list, else the one name table's name (MN-1, OT.R113) / "Needs disc"); players and spectators take the prototype's
 *   sides' tiles (the lobby reports no team split).
 * - Polled every 20 s while the page is visible (`LobbyPoller`, MU_LOBBY_POLL_ADAPTATION: backoff from 5 s on a
 *   failure; no socket) -- one poll, which Home's rooms line and the Server category read too (`./server`), so it runs
 *   while the page is visible on any screen rather than only while Browse rooms is shown (the retired section's gate) --
 *   failures in the lobby's one wording (`serverFailureWords`: Offline, Server unavailable; a 401 "Session ended").
 *   Square refreshes now. A sign-out drops the signed-in answers and the selection at once and reads `/rooms` with no
 *   bearer; a lost session (a 401 from any of the three reads) drops them too and stops the signed-in poll until the
 *   session changes, as the section's did.
 * - The filters are the lobby's (`keeps`: Has room, No password) and a text query (Triangle, Search); the launch target
 *   -- a room or a game -- is kept by id in the page's `lobbySelection` (the launch reads it there) and dropped when its
 *   row goes.
 *
 * - GAME-PING (Craig's "go", 2026-10-31/11-01; a browser adaptation): a game's ping is the page's own round trip to its
 *   room's host door (`../../gamePing`, LATER 455's probe), banded by the original's bounds (under 300 Good, under 600
 *   Fair, else Poor), in place of GenericField2's band -- which is 65000, so red, for every game (research 343 R343.6);
 *   per door one probe out and none within `GAME_PING_CACHE_MS_ADAPTATION` of the last answer; a game with no players is
 *   never probed (the original's "No players" stands); a door with no answer is `--`, never Poor; a game whose room has
 *   no door named keeps the original's band (nothing to measure). The wire is unchanged.
 *
 * Every server string is drawn as text (`../render` escapes it). A browser adaptation with no original (OT.R28).
 */
export type LiveRooms = Adapters['rooms'] & Required<Pick<Adapters['rooms'], 'status' | 'totals' | 'select' | 'selected' | 'search' | 'room' | 'game' | 'row' | 'refreshable'>> & {
  /** The rooms as the modern Server view's wording reads them (`../../modern/home/cards` `RoomsReading`). */
  serverReading(): RoomsReading;
  /** CX-LOBBIES: the disc's mission table once read (the maps' names), else null; Custom matches read it too. */
  missions(): readonly MissionRecord[] | null;
  dispose(): void;
};

/** The account requests' base for `win`'s address (`../../connectHost` `accountServiceBase`, as `../../modern/session`'s). */
export function lobbyBase(win: Window): string {
  const dev = (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;
  return accountServiceBase(win.location.search, win.location, dev);
}

export interface RoomsDeps {
  source?: LobbySource;
  session?: ModernSession;
  /** The disc's state and readers (the mission list, the map pictures); absent, the page's. */
  launcher?: LauncherState;
  selection?: SelectionStore;
  /**
   * CX-LOBBIES (the retired section's MU-P2, the design review r2's P3-2): each answer's raw cause for the Report only
   * (`../../modern/report/serverDetail`), never for the screen's words -- a failure's detail, cleared by an answer or the
   * session lost (the account's, not the server's). Absent, none is noted.
   */
  noteDetail?: (d: ServerDetail | null) => void;
  /** GAME-PING: the door probe's seams (`../../gamePing` `DoorPingCacheDeps`: the probe, the clock); absent, `timeDoorPing` on `performance.now`. */
  ping?: Omit<DoorPingCacheDeps, 'changed'>;
}

type Reading =
  | { kind: 'waiting' }
  | { kind: 'ok'; publicRooms: PublicRoom[] | null; view: LobbyView | null; at: number }
  | { kind: 'failed'; why: LobbyFailure };

const onOff = (b: boolean): string => (b ? 'On' : 'Off');

export function liveRooms(doc: Document, notify: () => void, deps: RoomsDeps = {}): LiveRooms {
  const win = doc.defaultView ?? window;
  const source = deps.source ?? fetchLobbySource(lobbyBase(win));
  const session = deps.session ?? pageSession(win);
  const launcher = deps.launcher ?? launcherState(doc);
  const selection = deps.selection ?? lobbySelection;

  let reading: Reading = { kind: 'waiting' };
  let lastOk: Extract<Reading, { kind: 'ok' }> | null = null;
  let missions: readonly MissionRecord[] | null = null;
  let missionsAsked = false;
  let rows: Room[] = [];
  let waiters: (() => void)[] = [];
  // GAME-PING: a door's answer redraws the rows (and the details, read off the same view).
  const pings = new DoorPingCache({ ...deps.ping, changed: () => { rebuild(); notify(); } });
  /** GAME-PING: each game's measured ping set from its door (`gamePingMs`: none for an empty game or no door named, null for a door with no answer). */
  const measure = (view: LobbyView): LobbyView => ({
    ...view,
    games: view.games.map((g) => {
      const ms = gamePingMs(pings, g.door, g.entry.playerCount & 0xffff);
      return ms === undefined ? g : { ...g, measuredMs: ms };
    }),
  });

  const readMissions = (): void => {
    if (missionsAsked || !launcher.isoInserted()) return;
    const a = launcher.assets?.();
    if (!a?.readMissions) return;
    missionsAsked = true;
    a.readMissions().then((m) => { missions = m; rebuild(); notify(); }, () => { missionsAsked = false; });
  };
  // MN-1 (OT.R113): before the disc, the one name table's name (`@s2u/archive` `mapLabel`), never the stem.
  const mapName = (stem: string | null): string => {
    if (!stem) return 'No map';
    const n = /^MP(\d+)$/.exec(stem)?.[1];
    const m = n && missions ? missions.find((r) => r.multiplayer && r.number === Number(n)) : undefined;
    return mapLabel(m ? m.name : stem);                   // review F5: Title case before and after the disc
  };

  const publicRow = (r: PublicRoom): Room => {
    const map = mapName(r.map);
    return {
      id: `room:${r.map}/${r.rules}`, name: `Game in ${map}`, map, mode: r.rules, n: r.players, cap: null,
      spectators: { n: r.spectators, cap: null },
      facts: [['Map', map], ['Rules', r.rules], ['Round', String(r.round)], ['Ping', 'Unknown']],
      tiles: [['PLAYERS', String(r.players)], ['SPECTATORS', String(r.spectators)]],
    };
  };
  const gameRow = (g: LobbyGame, view: LobbyView): Room => {
    const d = lobbyGameDetails(g, missions);
    const map = d.mission?.mapName ? mapLabel(d.mission.mapName) : mapName(g.map);
    // CX-LOBBIES review F5: the type word in the section's case, as the game's screen draws it (`./lobbies` `sentence`).
    const typeWord = d.mission?.typeWord;
    const mode = typeWord != null ? sentence(typeWord) : missions ? 'Unknown' : 'Needs disc';
    const roomName = view.rooms.find((r) => r.id === g.room)?.name ?? 'Not listed';
    const band = Math.max(0, Math.min(3, g.ping)) as 0 | 1 | 2 | 3;
    const measured = g.measuredMs !== undefined ? { pingMeasured: g.measuredMs } : {};   // GAME-PING
    const lock = lockWord(g);
    return {
      id: `game:${g.id}`, kind: 'game', name: g.name, map, mode, n: g.inPlayers, cap: g.maxIn, pingBand: band, ...measured,
      ...(g.entry.replaceable ? { replaceable: g.entry.replaceable } : {}),   // B138: the CPU seats a joining player may take
      spectators: { n: g.spectators, cap: g.maxSpectators }, locked: g.locked, private: g.private, ...(lock ? { lock } : {}),
      ...(rankLimited(g.ranks) ? { ranks: rankNames(g.ranks) } : {}), ...(g.inProgress ? { progress: LOBBY_WORDS.inProgress } : {}),
      ...(g.clan ? { clan: CLAN_GAME_WORDS } : {}),                         // review F1: the section's row flags
      facts: [['Map', map], ['Mode', mode], ['Room', roomName], ['Rounds', String(d.rounds)], ['Round time', `${d.roundMinutes} min`],
        ['Friendly fire', onOff(d.friendlyFire)], ['Respawn', onOff(d.respawn)], ['Ping', pingBand({ pingBand: band, ...measured })[1]]],
      tiles: [['PLAYERS', `${g.inPlayers}/${g.maxIn}`], ['SPECTATORS', `${g.spectators}/${g.maxSpectators}`]],
    };
  };
  /**
   * CX-LOBBIES: a briefing room's row -- its name and lock word, its games in the list, its ranks (the original's names,
   * when it is limited to some), its count; no names (the detail's). The drawer's facts: its count, its ranks, its games.
   */
  const roomRow = (r: LobbyView['rooms'][number], view: LobbyView): Room => {
    const lock = lockWord(r);
    const games = view.games.filter((g) => g.room === r.id).length;
    return {
      id: `room:${r.id}`, kind: 'room', name: r.name, map: '', n: r.players, cap: r.max, games, locked: r.locked, private: r.private,
      ...(lock ? { lock } : {}), ...(rankLimited(r.ranks) ? { ranks: rankNames(r.ranks) } : {}),
      facts: [['Players', `${r.players}/${r.max}`], ['Ranks', r.ranks.length === 4 ? LOBBY_WORDS.everyRank : rankNames(r.ranks).join(', ')], ['Games', String(games)]],
      tiles: [],
    };
  };
  const rebuild = (): void => {
    if (!lastOk) { rows = []; return; }
    if (lastOk.view) lastOk.view = measure(lastOk.view);                 // GAME-PING: read (and, when stale, probed) per rebuild
    const view = lastOk.view;
    // CX-LOBBIES: the briefing rooms, then any game whose room the list does not draw (so every listed game is reached).
    rows = view
      ? [...view.rooms.map((r) => roomRow(r, view)), ...view.games.filter((g) => !view.rooms.some((r) => r.id === g.room)).map((g) => gameRow(g, view))]
      : (lastOk.publicRooms ?? []).map(publicRow);
  };
  const worldId = (id: string, kind: 'room' | 'game'): number | null => {
    const m = (kind === 'room' ? /^room:(\d+)$/ : /^game:(\d+)$/).exec(id);
    return m ? Number(m[1]) : null;
  };
  /** The selection dropped when its game is gone from a list that answered. */
  const dropGone = (): void => {
    const sel = selection.selected();
    if (!sel || !lastOk) return;
    const here = sel.kind === 'game' ? lastOk.view?.games.some((g) => g.id === sel.mediusWorldId) : lastOk.view?.rooms.some((r) => r.id === sel.mediusWorldId);
    if (!here) selection.select(null);
  };

  const signedIn = (): boolean => session.state() === 'signed-in' && session.ticket() !== null;
  const loadFor = () => {
    const ticket = signedIn() ? session.ticket() : null;
    return ticket
      ? async (signal: AbortSignal): Promise<Reading> => ({ kind: 'ok', publicRooms: null, view: await source.lobby(ticket, signal), at: Date.now() })
      : async (signal: AbortSignal, fresh?: boolean): Promise<Reading> => ({ kind: 'ok', publicRooms: await source.publicRooms(signal, fresh), view: null, at: Date.now() });
  };
  const poller = new LobbyPoller<Reading>({
    load: loadFor(),
    onResult(r: PollResult<Reading>): void {
      // The section's rule: a failure the poller made itself (its time limit) carries no detail, so it is named by its kind.
      if (r.ok || r.error.kind === 'session-lost') deps.noteDetail?.(null);
      else if (r.error.kind === 'unreachable') deps.noteDetail?.({ state: 'offline', detail: r.error.detail ?? 'lobby: no answer in time' });
      else deps.noteDetail?.({ state: 'unavailable', detail: r.error.detail ?? 'lobby: unreadable answer' });
      if (r.ok) { reading = r.value; lastOk = r.value as Extract<Reading, { kind: 'ok' }>; rebuild(); dropGone(); }
      else {
        reading = { kind: 'failed', why: r.error instanceof LobbyLoadError ? r.error.kind : 'refused' };
        // CX-LOBBIES (the section's rule): the session lost drops the names and the selection, and the signed-in poll stops
        // until the session changes (its own keep-alive ends it, `../../modern/session`).
        if (reading.why === 'session-lost') { lastOk = null; rows = []; selection.select(null); poller.reset(null); }
      }
      const w = waiters; waiters = []; for (const f of w) f();
      notify();
    },
    gate: () => doc.visibilityState !== 'hidden',
  });
  /** The lost session's state holds (a 401 stopped the signed-in poll until the session changes). */
  const sessionLost = (): boolean => reading.kind === 'failed' && reading.why === 'session-lost';
  const onVisible = (): void => { poller.setActive(doc.visibilityState !== 'hidden'); };
  doc.addEventListener('visibilitychange', onVisible);
  const offSession = session.onChange(() => {
    lastOk = null; rows = []; reading = { kind: 'waiting' }; pings.clear();
    if (!signedIn()) { selection.select(null); deps.noteDetail?.(null); }   // the Report's detail never outlives the session
    poller.reset(loadFor());
    notify();
  });
  const offSelection = selection.onChange(() => { notify(); });
  const offDisc = launcher.onChange(() => { missionsAsked = false; missions = null; readMissions(); rebuild(); notify(); });
  readMissions();
  poller.setActive(doc.visibilityState !== 'hidden');

  const filters: RoomFilter[] = [
    { label: 'All', keep: () => true },
    { label: 'Has room', keep: (r) => keeps({ hasRoom: true, noPassword: false }, { seats: r.n, max: r.cap ?? Number.POSITIVE_INFINITY, locked: !!r.locked }) },
    { label: 'No password', keep: (r) => keeps({ hasRoom: false, noPassword: true }, { seats: r.n, max: r.cap ?? Number.POSITIVE_INFINITY, locked: !!r.locked }) },
  ];

  return {
    list: () => rows,
    filters: () => filters,
    updated(): string {
      if (!lastOk) return 'not yet';
      const s = Math.max(0, Math.round((Date.now() - lastOk.at) / 1000));
      return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
    },
    // Settles with the poll's answer (the slice-2 review: pollNow only arms the poll, so nothing is known yet); a hidden
    // page polls nothing and settles at once with what it has.
    refresh(): Promise<void> {
      return new Promise((resolve) => {
        // CX-LOBBIES review F2 (the section's rule: its Retry hidden while the session is lost): the poll stops until the
        // session changes, so nothing would answer a waiter -- it settles at once, the state's words its answer.
        if (doc.visibilityState === 'hidden' || sessionLost()) { resolve(); return; }
        waiters.push(resolve);
        poller.pollNow();
      });
    },
    refreshable: () => !sessionLost(),
    status() {
      if (reading.kind === 'failed') {
        // Retrying while the poll goes on (it backs off and tries again while the page is visible), as Home says it
        // (`../../modern/home/cards` `serverStateWords`).
        const words = reading.why === 'session-lost' ? 'Session ended' : serverFailureWords(reading.why, doc.visibilityState !== 'hidden');
        return { kind: 'failed' as const, words };
      }
      return reading.kind === 'waiting' ? { kind: 'waiting' as const, words: 'Reading the rooms…' } : { kind: 'ok' as const, words: '' };
    },
    totals() {
      const view = lastOk?.view;
      if (view) return { rooms: view.rooms.length, players: view.rooms.reduce((a, r) => a + r.players, 0) };
      const pub = lastOk?.publicRooms;
      return pub ? { rooms: pub.length, players: pub.reduce((a, r) => a + r.players, 0) } : null;
    },
    select(id: string | null): void {
      if (id === null) { selection.select(null); return; }
      const view = lastOk?.view;
      const gid = worldId(id, 'game');
      const rid = worldId(id, 'room');
      const g = gid !== null ? view?.games.find((x) => x.id === gid) : undefined;
      const r = rid !== null ? view?.rooms.find((x) => x.id === rid) : undefined;   // CX-LOBBIES: a room is a target too
      selection.select(g ? { kind: 'game', mediusWorldId: g.id, room: g.room, name: g.name } : r ? { kind: 'room', mediusWorldId: r.id, name: r.name } : null);
    },
    selected(): string | null {
      const s = selection.selected();
      return s ? `${s.kind}:${s.mediusWorldId}` : null;
    },
    search: true,
    room(id: string): LobbyRoomView {
      const view = lastOk?.view;
      const n = worldId(id, 'room');
      return view && n !== null ? roomDetail(view, n, missions) : { kind: 'gone' };
    },
    game(id: string): LobbyGameView {
      const view = lastOk?.view;
      const n = worldId(id, 'game');
      return view && n !== null ? gameDetail(view, n, missions) : { kind: 'gone' };
    },
    row(id: string): Room | null {
      const view = lastOk?.view;
      if (!view) return null;
      const found = rows.find((r) => r.id === id);
      if (found) return found;
      const n = worldId(id, 'game');
      const g = n === null ? undefined : view.games.find((x) => x.id === n);
      return g ? gameRow(g, view) : null;
    },
    missions: () => missions,
    serverReading(): RoomsReading {
      if (reading.kind === 'failed') return { kind: 'failed', why: reading.why };
      if (!lastOk) return { kind: 'waiting' };
      const view = lastOk.view;
      return view
        ? { kind: 'ok', rooms: view.rooms.map((r) => ({ name: r.name, map: null, players: r.players })) }
        : { kind: 'ok', rooms: (lastOk.publicRooms ?? []).map((r) => ({ name: mapName(r.map), map: r.map, players: r.players })) };   // MN-1: named
    },
    dispose(): void { poller.stop(); pings.clear(); doc.removeEventListener('visibilitychange', onVisible); offSession(); offSelection(); offDisc(); },   // GAME-PING (review F3): a late probe answer rebuilds nothing
  };
}
