import { REQUEST_TIMEOUT_MS } from './playersOnline';

/**
 * TR-2, the online server's served maps (the test room's maps plan, TR.R3; research 307 §3; the owner's playtest,
 * 2026-10-12: "When in testroom mode, LOCAL online just says 'no such map'."). A test instrument's adaptation: the
 * original has no such request, and nothing of the game changes.
 *
 * The match server plays only its `MAPS` (`packages/match/src/server.ts` `allowed()`); a hello for any other map is
 * refused 4004 'no such map' (:806). The page learns the set before it joins, over HTTP: `GET /maps` answering
 * `{"maps":["MP2","MP51","MP7","MP72",...]}` -- the stems the server plays, in its order, uppercase as `/rooms`' `map`, with
 * `/rooms`' origin gate and short public cache, no connection needed. The shape is the online lane's (decided
 * 2026-10-12, relayed by the merge controller), and the route lands in that lane's MAPS-4: until it does, every server
 * answers 404 here and this reads `null`.
 *
 * The origin is the online target's (`./online` `resolveOnline`'s `url`, the server the room joins): its WebSocket's
 * scheme turned to HTTP's, the path dropped -- the same host the page's `/rooms` poll reads beside it (`./playersOnline`
 * `LOCAL_ROOMS`, `sharedRooms`). No target (Online off), the page's own rooms (`loopback:`, `replay:`) or an address
 * that is not a WebSocket's: no read.
 */

/** The route (TR.R3). */
export const MAPS_PATH = '/maps';

/**
 * How long the read waits for an answer before it gives up (`null`, nothing marked). A chosen instrument limit with no
 * original: the `/rooms` read's own bound (`./playersOnline` `REQUEST_TIMEOUT_MS`), as the same server answers both.
 * Settled only by the owner's call or a measured `/maps` time on a slow host; past it the cost is an unmarked bar,
 * never a wrong mark (research 307 §4).
 */
export const SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER = REQUEST_TIMEOUT_MS;

/** The HTTP origin of the server a WebSocket address names (`ws:` -> `http:`, `wss:` -> `https:`), or null. */
export function servedMapsOrigin(server: string | null | undefined): string | null {
  if (!server) return null;
  let url: URL;
  try { url = new URL(server); } catch { return null; }
  const scheme = url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : null;
  return scheme && url.host ? `${scheme}//${url.host}` : null;
}

/**
 * The stems out of a `/maps` answer, uppercase (the server compares a hello's map uppercased, `server.ts` `allowed()`;
 * `/rooms`' map is read so, `./playersOnline` `countPlayers`), or null when it is not one: not an object with a `maps`
 * list, an entry that is not a non-empty string, or an empty list (the agreed answer always names what the server
 * plays -- its `MAPS`, else its defaults -- so an empty one is not read as "plays nothing").
 */
export function servedMapsOf(body: unknown): string[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const maps = (body as { maps?: unknown }).maps;
  if (!Array.isArray(maps) || maps.length === 0) return null;
  const out: string[] = [];
  for (const m of maps as unknown[]) {
    if (typeof m !== 'string' || m.trim() === '') return null;
    out.push(m.trim().toUpperCase());
  }
  return out;
}

/**
 * One read of `<origin>/maps`: the stems, or null on no origin, a status that is not 2xx (a 404 from a server before
 * MAPS-4), a network error, a body that is not JSON or not the shape, or no answer within `timeoutMs` (the request then
 * aborted). `cache: 'no-cache'` as `/rooms`' poll: the browser revalidates the short public cache, no header of the
 * page's own (a non-safelisted one would add a CORS preflight the server does not answer).
 */
export async function fetchServedMaps(
  origin: string | null,
  fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
  timeoutMs: number = SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER,
): Promise<string[] | null> {
  if (!origin) return null;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => { abort.abort(); resolve(null); }, timeoutMs); });
  const read = (async (): Promise<string[] | null> => {
    try {
      const res = await fetchFn(`${origin}${MAPS_PATH}`, { signal: abort.signal, cache: 'no-cache' });
      if (!res.ok) return null;
      return servedMapsOf(await res.json());
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The page's read for the room's online target: `read(server)` at the page's start and again when the Online choice
 * moves. Each read first tells `null` (the marks off: the old server's set says nothing of the new one), then the answer;
 * an answer that lands after a newer read is dropped.
 */
export class ServedMapsRead {
  private generation = 0;

  constructor(
    private readonly onMaps: (stems: readonly string[] | null) => void,
    private readonly fetchFn?: typeof fetch,
    private readonly timeoutMs: number = SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER,
  ) {}

  async read(server: string | null | undefined): Promise<void> {
    const mine = ++this.generation;
    this.onMaps(null);
    const origin = servedMapsOrigin(server);
    if (!origin) return;
    const stems = await fetchServedMaps(origin, this.fetchFn, this.timeoutMs);
    if (mine === this.generation) this.onMaps(stems);
  }
}
