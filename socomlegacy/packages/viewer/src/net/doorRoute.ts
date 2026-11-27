/**
 * The door relay: the backup route to a host's door (product track, a browser adaptation with no original -- the
 * original's clients reached one server; nothing the game does changes; the owner, 2026-11-21, of v0.4.28's Cloudflare
 * twins failing: relay the door through the page's own hostname).
 *
 * Why: some players' network filters answer a match host's name (`<host>.play.socom2legacy.com`) with a block server
 * that refuses HTTPS, name by name and from one hour to the next -- v0.4.28's Cloudflare-proxied twins
 * (`<host>-cf.play...`) were blocked the same way (agent-mail handoffs/stage2/HANDOFF-door-relay-2026-11-21.md). The page's
 * own hostname always reaches them: they hold it open for the page and the lobby. So its Worker
 * (`deploy/pages/worker.js`, `DOOR_RELAY_PREFIX`) carries a door's three paths -- the ping, a game's socket `/g/<id>`, a
 * standing room's `/r/MP<n>/classic` -- as `<page origin>/door/<host label>/<path>`, GET only, no query, the page's
 * cookie and bearer dropped, to `https://<host label>.<the Worker's DOOR_ZONE>`. Central still hands out only the direct
 * name (`placement.ts` `doorAccepted`); the page derives the relay, and nothing checks which of the two it dials (the
 * token is bound to the host's key).
 *
 * The rule: a host is dialled direct until a ping of its door fails outright (the request rejected before any answer --
 * the block server's refused HTTPS); then by the relay. A socket closed before it opened flips nothing by itself, since
 * the door's own refusals (404, 503, 403 at the upgrade) close it the same way: it asks one ping (`../doorPing`
 * `checkDoorRoute`), and that ping decides. On the relay, a ping that fails outright OR answers anything but the door's
 * 204 flips the host back to direct: a Worker that does not carry the route answers the static site's 404 or its page,
 * a page served without the Worker (a dev server) its own, a host down the Worker's 502 -- so a new page on an old Worker
 * loses nothing. A direct ping's timeout or other answer is never a flip: a slow link is not a blocked name, and a player
 * whose direct route works never leaves it. The page's own retry (`../netPage` `retryDelayMs`, `../gameLobbyHost`)
 * makes the next attempt; nothing here retries. Held for the page's life, never stored.
 */

/** The zone every door lives in (`connectHost.ts`'s pins; central's `doorAccepted`). */
export const DOOR_ZONE = '.play.socom2legacy.com';

/** An adaptation: the relay's prefix on the page's own hostname (the Worker's `DOOR_RELAY_PREFIX`, `/door/`). */
export const DOOR_RELAY_PATH_ADAPTATION = '/door';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** A door's three paths as the Worker relays them (its `DOOR_RELAY_FORM`); '' is a bare origin (the ping appends its own). */
const DOOR_PATH = /^(?:|\/ping|\/g\/[1-9][0-9]{0,15}|\/r\/MP[0-9]{1,2}\/classic)$/;

/** A relay path on the page's hostname: `/door/<label>` and one of a door's paths. */
const RELAY_PATH = /^\/door\/([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)(|\/ping|\/g\/[1-9][0-9]{0,15}|\/r\/MP[0-9]{1,2}\/classic)$/;

function parse(url: string): URL | null {
  try { return new URL(url); } catch { return null; }
}

/** The page's origin when it is an http(s) one (`location.origin`), else null. */
function pageOriginOf(origin: string | null | undefined): URL | null {
  if (!origin) return null;
  const u = parse(origin);
  return u && (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? u : null;
}

/** The global page's origin, or null outside a page (a worker, a test without one). */
const globalPageOrigin = (): string | null => {
  try { return (globalThis as { location?: { origin?: string } }).location?.origin ?? null; } catch { return null; }
};

/** The direct door's label of `u` -- a production door (`wss:`/`https:`, no port, no credentials), in the zone, one label -- or null. */
function directLabel(u: URL): string | null {
  if ((u.protocol !== 'wss:' && u.protocol !== 'https:') || u.port || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.endsWith(DOOR_ZONE)) return null;
  const label = h.slice(0, -DOOR_ZONE.length);
  return LABEL.test(label) ? label : null;
}

/**
 * The relay URL of a direct door URL (a socket's `wss://<host>.play.../g/<id>` or `/r/MP<n>/classic`, a ping's
 * `https://<host>.play...[/ping]`) on the page's hostname: `wss:`/`https:` on an https page, `ws:`/`http:` on an http
 * one. Null when the relay cannot carry it: a port, a query or fragment, another path, a name outside the zone, no page
 * origin.
 */
export function relayUrlOf(url: string, pageOrigin: string | null | undefined): string | null {
  const page = pageOriginOf(pageOrigin);
  const u = parse(url);
  if (!page || !u) return null;
  const label = directLabel(u);
  const path = u.pathname === '/' ? '' : u.pathname;
  if (!label || u.search || u.hash || !DOOR_PATH.test(path)) return null;
  const secure = page.protocol === 'https:';
  const scheme = u.protocol === 'wss:' ? (secure ? 'wss:' : 'ws:') : page.protocol;
  return `${scheme}//${page.host}${DOOR_RELAY_PATH_ADAPTATION}/${label}${path}`;
}

/** The direct host (lower case) a relay URL on the page's hostname stands for, and the relay's origin; else null. */
function relayOf(url: string, pageOrigin: string | null | undefined): { host: string; origin: string } | null {
  const page = pageOriginOf(pageOrigin);
  const u = parse(url);
  if (!page || !u || u.search || u.hash) return null;
  if (u.host.toLowerCase() !== page.host.toLowerCase()) return null;
  const m = RELAY_PATH.exec(u.pathname);
  if (!m) return null;
  return { host: `${m[1]}${DOOR_ZONE}`, origin: `${page.protocol}//${page.host}${DOOR_RELAY_PATH_ADAPTATION}/${m[1]}` };
}

/**
 * The origin a door URL's ping goes to -- a direct door's `https://<host>[:port]` (`http://` for `ws:`), or for a relay
 * URL on the page's hostname the relay's `<page origin>/door/<label>` -- or null for a URL outside the zone (a loopback
 * dev door, `loopback:`) or one that does not parse.
 */
export function doorOriginOf(url: string, pageOrigin: string | null | undefined = globalPageOrigin()): string | null {
  const relay = relayOf(url, pageOrigin);
  if (relay) return relay.origin;
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(DOOR_ZONE) || !LABEL.test(host.slice(0, -DOOR_ZONE.length))) return null;
  const scheme = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : u.protocol === 'ws:' || u.protocol === 'http:' ? 'http:' : null;
  return scheme ? `${scheme}//${host}${u.port ? `:${u.port}` : ''}` : null;
}

/** The page's choice of route per direct host (`doorRoutes` is the page's one). */
export class DoorRoutes {
  /** Direct hostnames (lower case) dialled through the relay now. */
  private readonly viaRelay = new Set<string>();

  /** `page`: the page's origin (`location.origin` by default; the tests' own). */
  constructor(private readonly page: () => string | null | undefined = globalPageOrigin) {}

  /** The URL to dial for `url` (a door URL central handed out, or a door's origin): the relay's when the host is on it. */
  dial(url: string): string {
    const u = parse(url);
    if (!u) return url;
    const label = directLabel(u);
    if (!label || !this.viaRelay.has(`${label}${DOOR_ZONE}`)) return url;
    return relayUrlOf(url, this.page()) ?? url;
  }

  /** The origin `url`'s ping goes to (`doorOriginOf` on this page's origin). */
  originOf(url: string): string | null {
    return doorOriginOf(url, this.page());
  }

  /** Whether `dialled` is a relay URL on the page's hostname (`../doorPing`: its answer other than 204 flips back). */
  relayed(dialled: string): boolean {
    return relayOf(dialled, this.page()) !== null;
  }

  /** Something dialled at `dialled` failed before it answered: the host's next attempt takes the other route. */
  failed(dialled: string): void {
    const relay = relayOf(dialled, this.page());
    if (relay) { this.viaRelay.delete(relay.host); return; }
    const u = parse(dialled);
    const label = u ? directLabel(u) : null;
    if (label) this.viaRelay.add(`${label}${DOOR_ZONE}`);
  }
}

/** The page's routes: every door socket (`./client` `NetClient`) and every ping (`../doorPing`) reads and feeds them. */
export const doorRoutes = new DoorRoutes();
