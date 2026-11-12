import { ANNOUNCEMENT_QUERY, UNIVERSE_QUERY, type AnnouncementService, type UniverseService } from '@s2u/ui';
import { universeServiceBase, fetchUniverseService } from '../../universeHost';
import { fetchAnnouncementService } from '../../worldOfSocomHost';
import { serverStateWords, type RoomsReading } from '../../modern/home/cards';
import { fetchLobbySource, type LobbySource } from '../../modern/lobbies/data';
import { MU_LOBBY_POLL_MS, MU_LOBBY_REQUEST_TIMEOUT_MS } from '../../modern/lobbies/poller';
import { pageSession, type ModernSession } from '../../modern/session';
import type { Adapters } from '../state';
import { liveCentralVersion, type LiveCentralVersion } from './centralVersion';
import { lobbyBase, type LiveRooms } from './rooms';

/**
 * The console launcher's server and its news (slice 2, part g), from the sources the retired modern Server view read
 * (CX-25 retired it with the modern shell; this adapter is the console's Server category): the server's state from the rooms the page already polls (`./rooms`, one poll, never a
 * second) in the one wording (`../../modern/home/cards` `serverStateWords`: Online, Checking, Offline / Server
 * unavailable with "Retrying..."); the rooms and players only once the server has reported them; the universe's name and
 * users from `POST /texts/universe` (the original page's client, `fetchUniverseService`, as the news section asks it),
 * written as the Server view writes its Universe fact ("<name> · <users>/<max> users"). The News dialog's texts are the
 * retired news section's (MU.R6; CX-25 retired it, this adapter's News dialog holds them now): the universe card -- name, users, description, every news chunk --
 * asked signed out too, and the server's announcement (`POST /texts/announcement`, `announcementText`'s rule: a refusal or
 * an empty one is "No server messages.") asked signed in only. CX-29 (CX.R14): the project's pages are no longer menu
 * rows (`pages` is empty; the overlay still appends Report a problem). `openPage` stays for Experiments. A browser
 * adaptation with no original (OT.R28).
 */
export interface NewsReading {
  universe: { kind: 'waiting' } | { kind: 'ok'; name: string; users: number; max: number; description: string; news: string[] } | { kind: 'failed' };
  announcement: { kind: 'signed-out' } | { kind: 'waiting' } | { kind: 'ok'; text: string } | { kind: 'failed' };
}

export type LiveServer = Adapters['server'] & Required<Pick<Adapters['server'], 'news' | 'loadNews' | 'universeLine' | 'centralVersion'>> & { dispose(): void };

export interface ServerDeps {
  rooms: LiveRooms;
  session?: ModernSession;
  universe?: UniverseService;
  announcement?: AnnouncementService;
  /** Opens a page; absent, `window.open`. */
  open?: (url: string, target: string, features: string) => void;
  /** The site's base (Vite's `BASE_URL`); absent, the build's. */
  base?: string;
  /** The hosts' standing rooms (the anonymous `/rooms`), read signed in for Home's players; absent, the page's. */
  lobby?: Pick<LobbySource, 'publicRooms'>;
  /** LR-33: central's version reader (`./centralVersion`); absent, the live one over the page's own server. */
  central?: LiveCentralVersion;
}

/**
 * HOME_PLAYERS_REFRESH_MS_ADAPTATION: how often Home's players are read again (the universe's users, and signed in the
 * standing rooms'), at a render of the launcher (`totals()`, which every screen's render asks), at most once a period,
 * never while the page is hidden and never over a read still waiting: the rooms' own poll (`MU_LOBBY_POLL_MS`). A
 * browser adaptation.
 */
export const HOME_PLAYERS_REFRESH_MS_ADAPTATION = MU_LOBBY_POLL_MS;

const NO_MESSAGES = 'No server messages.';                // MOTD_NO_MESSAGES (`@s2u/ui`), as `announcementText` says it

export function liveServer(notify: () => void, deps: ServerDeps): LiveServer {
  const win = globalThis.window;
  const session = deps.session ?? pageSession();
  const base = universeServiceBase(win?.location.search ?? '', win?.location ?? { protocol: 'http:', host: 'localhost' });
  const universe = deps.universe ?? fetchUniverseService(base);
  const announcement = deps.announcement ?? fetchAnnouncementService(base);
  const open = deps.open ?? ((u, t, f) => { win?.open(u, t, f); });
  const siteBase = deps.base ?? String((import.meta.env as Record<string, unknown> | undefined)?.['BASE_URL'] ?? '/');
  const news: NewsReading = { universe: { kind: 'waiting' }, announcement: { kind: 'signed-out' } };

  // `keep`: a refresh's failure (a tunnel's single 502, central restarting) keeps the last answer; an ask the player made
  // (the boot, News, Square) says the universe failed. An ask still waiting holds the refresh back until it answers or
  // the rooms poll's own limit (`MU_LOBBY_REQUEST_TIMEOUT_MS`) gives it up (the query takes no signal, so it is let go).
  let universeWaiting = 0;
  const askUniverse = (keep = false): Promise<void> => {
    universeWaiting++;
    let held = true;
    const release = (): void => { if (held) { held = false; universeWaiting--; } };
    const limit = setTimeout(release, MU_LOBBY_REQUEST_TIMEOUT_MS);
    return universe.query({ ...UNIVERSE_QUERY }).then((r) => {
      // The first status-0 entry, as the news card and the Server view show it (UpdateServerInfo's selected index).
      const e = r.universes.find((u) => u.status === 0);
      news.universe = e ? { kind: 'ok', name: e.name, users: e.userCount, max: e.maxUsers, description: e.description, news: r.news.map((n) => n.news).filter(Boolean) } : { kind: 'failed' };
      notify();
    }, () => { if (!keep || news.universe.kind !== 'ok') news.universe = { kind: 'failed' }; notify(); }).finally(() => { clearTimeout(limit); release(); });
  };
  const askAnnouncement = (): void => {
    if (session.state() !== 'signed-in') { news.announcement = { kind: 'signed-out' }; return; }
    news.announcement = { kind: 'waiting' };
    announcement.announcement({ ...ANNOUNCEMENT_QUERY }).then((r) => {
      news.announcement = { kind: 'ok', text: r.status !== 0 || r.announcement === '' ? NO_MESSAGES : r.announcement };
      notify();
    }, () => { news.announcement = { kind: 'failed' }; notify(); });
  };
  // Home's players (Craig, 2026-10-20, in the merge controller's seat: "update the home on nightly to show players in
  // all rooms combined"; the merge controller's call): everyone on the server -- the universe's USERS (central's live
  // lobby sessions, `universeUsers`: in a briefing room or in a game, so no room's count is added; a killed tab stays
  // counted up to 5 minutes, `SESSION_SILENT_MS_READING`) plus the hosts' standing rooms' players (`/rooms`, the test
  // room's: a typed-name guest holds no lobby session, so the two sets are apart per account -- one person both a guest
  // there and signed in here, or in the overlay, is counted twice while that session lives). Signed out the rooms
  // adapter reads `/rooms` already; signed in this adapter reads it, at once at a sign-in. Until the universe answers,
  // the rooms' own sum, as before. The launcher's line, not the original's: its own screens (SELECT UNIVERSE's USERS)
  // are untouched.
  const lobby = deps.lobby ?? fetchLobbySource(lobbyBase(win ?? ({ location: { search: '', protocol: 'http:', host: 'localhost' } } as unknown as Window)));
  let standing: number | null = null;
  let standingAsk: AbortController | null = null;
  let askedAt = -Infinity;
  // One read at a time, cut at the rooms poll's own limit (`MU_LOBBY_REQUEST_TIMEOUT_MS`).
  const askStanding = (): void => {
    if (session.state() !== 'signed-in' || standingAsk) return;
    const ask = new AbortController();
    standingAsk = ask;
    const limit = setTimeout(() => { ask.abort(); }, MU_LOBBY_REQUEST_TIMEOUT_MS);
    lobby.publicRooms(ask.signal).then((r) => {
      if (standingAsk !== ask) return;
      standing = r.reduce((a, x) => a + x.players, 0);
      notify();
    }, () => { /* the users alone, or the last read */ }).finally(() => { clearTimeout(limit); if (standingAsk === ask) standingAsk = null; });
  };
  const refreshPlayers = (): void => {
    const now = Date.now();
    if (now - askedAt < HOME_PLAYERS_REFRESH_MS_ADAPTATION || win?.document?.visibilityState === 'hidden') return;
    askedAt = now;
    if (universeWaiting === 0) void askUniverse(true);
    askStanding();
  };
  // LR-33 (LR.R27): central's version for the header, from its /health; asked at boot and with every refresh.
  const central = deps.central ?? liveCentralVersion(notify);
  askedAt = Date.now();
  void askUniverse();
  askStanding();
  const off = session.onChange(() => {
    if (session.state() === 'signed-in') { askStanding(); return; }
    news.announcement = { kind: 'signed-out' };
    standing = null;
    standingAsk?.abort();
    standingAsk = null;
  });

  const reading = (): RoomsReading => deps.rooms.serverReading();
  return {
    status() {
      const words = serverStateWords(reading());
      const word = words.split(' · ')[0]!;
      return {
        word: words === 'Online' ? 'ONLINE' : words === 'Checking' ? 'CHECKING' : word === 'Offline' ? 'OFFLINE' : 'UNAVAILABLE',
        ready: words === 'Online',
        alert: words !== 'Online' && words !== 'Checking',
        line: words,
      };
    },
    totals() {
      const t = deps.rooms.totals();
      refreshPlayers();
      const u = news.universe;
      if (!t || u.kind !== 'ok') return t;
      // Signed out the rooms' figure is `/rooms` itself, the standing rooms' players.
      const hosted = session.state() === 'signed-in' ? standing ?? 0 : t.players;
      return { rooms: t.rooms, players: u.users + hosted };
    },
    pages: () => [],
    refresh(): Promise<void> { return Promise.all([deps.rooms.refresh(), askUniverse(), central.refresh()]).then(() => undefined); },
    // RB-5: a new tab opens only inside a user activation, and `noopener` makes `window.open` answer null either way, so
    // the grammar calls this only for a click, a tap or a key (`../grammar` `NEW_TAB_POINTER_WORDS` for a pad's press).
    openPage(name: string): void { open(`${siteBase}${name.toLowerCase()}`, '_blank', 'noopener'); },
    news: () => news,
    loadNews(): void { void askUniverse(); askAnnouncement(); },
    universeLine(): string | null {
      const u = news.universe;
      return u.kind === 'ok' ? `${u.name} · ${u.users}/${u.max} users` : null;
    },
    centralVersion: () => central.version(),
    dispose(): void { off(); central.dispose(); standingAsk?.abort(); standingAsk = null; },
  };
}
