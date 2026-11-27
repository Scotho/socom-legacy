import { gameListOf } from '../briefingRoomHost';
import { isGameToken, pinnedGameDoor } from '../connectHost';
import type { NetOptions } from '../net/client';

/** Experiment transport adaptation. Uses the normal account/lobby protocol, but
 * never creates a game, persists credentials, or replaces the production lobby.
 */
export interface PrototypeLobbyGame { id: number; name: string; map: string; players: number }
export interface PrototypeLobbyConnection {
  url: string; map: string; name: string; game: NonNullable<NetOptions['game']>;
}
export interface PrototypeLobbySessionOptions {
  fetch?: typeof fetch;
  developmentDoors?: boolean;
  /** Test instrumentation bounds, not game timing. */
  requestTimeoutMs?: number;
  keepAliveMs?: number;
}
class RequestFailure extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export function createPrototypeLobbySession(base: string, options: PrototypeLobbySessionOptions = {}) {
  const parsed = new URL(base);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== '/' && parsed.pathname !== '')) throw new Error('Use an HTTP(S) origin without credentials, query or path');
  const origin = parsed.origin, fetchFn = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeout = options.requestTimeoutMs ?? 15_000, keepAliveMs = options.keepAliveMs ?? 30_000;
  if (!(timeout > 0) || !Number.isFinite(timeout) || !(keepAliveMs > 0) || !Number.isFinite(keepAliveMs)) throw new Error('Invalid request timing');
  let ticket = '', name = '', closed = false, joinAttempted = false;
  let listed: PrototypeLobbyGame[] = [], channel = 1;
  let tail: Promise<void> = Promise.resolve(), closing: Promise<void> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const active = () => { if (closed) throw new Error('Session closed'); };
  const signedIn = () => { active(); if (!ticket) throw new Error('Sign in first'); };
  const unjoined = () => { if (joinAttempted) throw new Error('Close this session before joining another game'); };

  // Serialize account/lobby mutations. In particular, a leave must follow a join
  // that was already sent, even when Stop was pressed before its answer arrived.
  function queued<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error('Session closed'));
    const next = tail.then(() => { active(); return operation(); });
    tail = next.then(() => {}, () => {});
    return next;
  }
  async function post(path: string, body: object, authenticated = true, keepalive = false): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchFn(`${origin}${path}`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        ...(keepalive ? { keepalive: true } : {}),
        headers: { 'content-type': 'application/json', ...(authenticated && ticket ? { authorization: `Bearer ${ticket}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new RequestFailure(`${path}: HTTP ${response.status}`, response.status);
      if (response.status === 204) return {};
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new RequestFailure(`${path}: invalid reply`);
      return result as Record<string, unknown>;
    } catch (error) {
      // Never repeat an arbitrary server body or fetch exception (which may
      // contain request details) in the on-screen experiment report.
      if (error instanceof RequestFailure) throw error;
      throw new Error(`${path}: ${controller.signal.aborted ? 'request timed out' : 'request failed'}`);
    } finally { clearTimeout(timer); }
  }
  function success(path: string, result: Record<string, unknown>): void {
    if (!Number.isSafeInteger(result.status)) throw new Error(`${path}: invalid status`);
    if (result.status !== 0) throw new Error(`${path}: status ${result.status as number}`);
  }
  async function listGames(): Promise<PrototypeLobbyGame[]> {
    const reply = await post('/lobby/game-list', { pageId: 1, pageSize: 256 });
    active();
    return gameListOf(reply).filter(game => game.status === 0 && game.genericField1 === channel && game.gameLevel > 0)
      .map(game => ({ id: game.mediusWorldId, name: game.gameName.split('$~')[0]!, map: `MP${game.gameLevel}`, players: game.playerCount }));
  }
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
    closing = tail.then(async () => {
      try {
        if (ticket && joinAttempted) await post('/lobby/leave-game', {}, true, true).catch(() => {});
        if (ticket) await post('/account/logout', { ticket }, false, true).catch(() => {});
      } finally { ticket = ''; name = ''; listed = []; }
    });
    return closing;
  }

  return {
    login(playerName: string, password: string, register = false): Promise<void> {
      return queued(async () => {
        if (ticket) throw new Error('Already signed in');
        if (!playerName.trim() || !password) throw new Error('Enter a player name and password');
        if (register) {
          success('/account/create', await post('/account/create', { name: playerName, password }, false));
          active();
        }
        const result = await post('/account/login', { name: playerName, password, savePassword: false }, false);
        success('/account/login', result);
        if (typeof result.ticket !== 'string' || !result.ticket) throw new Error('/account/login: missing ticket');
        // Keep the answer before checking Stop, so close() can log it out.
        ticket = result.ticket; name = playerName;
        active();
        heartbeat = setInterval(() => {
          void queued(async () => { signedIn(); await post('/lobby/update-user-state', { userAction: 1 }); })
            .catch((error: unknown) => {
              // Same loss rule as connectHost.keepAliveAnswer: transient network,
              // timeout and 5xx answers are unknown, retried next period.
              if (!closed && error instanceof RequestFailure && [401, 403, 404].includes(error.status ?? 0)) void close();
            });
        }, keepAliveMs);
      });
    },
    games(channelId = 1): Promise<PrototypeLobbyGame[]> {
      return queued(async () => {
        signedIn(); unjoined();
        if (!Number.isSafeInteger(channelId) || channelId < 1) throw new Error('Invalid channel');
        success('/lobby/join-channel', await post('/lobby/join-channel', { mediusWorldId: channelId, lobbyChannelPassword: '' }));
        active(); channel = channelId;
        listed = await listGames();
        return listed.map(game => ({ ...game }));
      });
    },
    join(id: number, map: string, password = ''): Promise<PrototypeLobbyConnection> {
      return queued(async () => {
        signedIn(); unjoined();
        if (!listed.some(game => game.id === id && game.map === map)) throw new Error('Choose a listed game and its map');
        const fresh = await listGames();
        if (!fresh.some(game => game.id === id && game.map === map)) throw new Error('Selected game changed; refresh the game list');
        active(); joinAttempted = true;
        const result = await post('/lobby/join-game', { mediusWorldId: id, joinType: 0, gamePassword: password });
        success('/lobby/join-game', result);
        active();
        if (result.mediusWorldId !== id) throw new Error('Joined game does not match the selected game');
        if (result.door !== undefined || result.token !== undefined) {
          const door = pinnedGameDoor(result.door, id, options.developmentDoors === true);
          if (!door || !isGameToken(result.token)) throw new Error('Invalid game door or token');
          return { url: door.url, map, name, game: { id, token: result.token } };
        }
        return { url: `${origin.replace(/^http/, 'ws')}/ws`, map, name, game: { id, ticket } };
      });
    },
    close,
  };
}
