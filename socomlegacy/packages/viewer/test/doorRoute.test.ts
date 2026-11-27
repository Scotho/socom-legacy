import { describe, expect, it } from 'vitest';
import { DOOR_RELAY_PATH_ADAPTATION, DoorRoutes, doorOriginOf, relayUrlOf } from '../src/net/doorRoute';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { checkDoorRoute, timeDoorPing } from '../src/doorPing';

/**
 * The door relay (product track, a browser adaptation with no original; the owner, 2026-11-21): a host's door is
 * dialled by its direct name, and after a failure before the socket opened (a filter answering the name with a block
 * server: refused at once) through the page's own hostname, `<page origin>/door/<host label>/<the door's path>`, which
 * the hostname's Worker (`deploy/pages/worker.js`) passes to the same door. A route that opens is kept; a relay that
 * fails -- or answers other than the door's 204 (a Worker without the route, a page not behind the Worker) -- flips back.
 * Only the zone's names, and only a door's three paths, are relayed. A socket closed before it opened flips nothing by
 * itself (the door's own refusals look the same, the review's F2): it asks one ping of that door, and the ping decides.
 */

const PAGE = 'https://socomlegacy.example.test';
const page = () => PAGE;

const refusing = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
const answering204 = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
const flush = () => new Promise((r) => setTimeout(r, 0));
/** The route check a NetClient runs at a close before open, with the ping's fetch faked. */
const checkWith = (fetchFn: typeof fetch) => (dialled: string, routes: DoorRoutes) =>
  checkDoorRoute(dialled, routes, { fetch: fetchFn, observer: null, resources: () => [] });

const walk = (): NetWalk => ({ setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined });

/** A socket the test opens or fails: `open()` fires onopen, `refuse()` a 1006 close before any open. */
function socketAt(url: string, dialled: string[]): WebSocketLike & { open(): void; refuse(): void } {
  dialled.push(url);
  const s = {
    binaryType: 'blob', readyState: 0,
    send() { /* the hello */ },
    close() { s.readyState = 3; s.onclose?.({ code: 1000, reason: '' }); },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
    open() { s.readyState = 1; s.onopen?.({}); },
    refuse() { s.readyState = 3; s.onclose?.({ code: 1006, reason: '' }); },
  };
  return s;
}

describe('relayUrlOf', () => {
  it("names the relay of a door's three paths and its bare origin on the page's own hostname, and nothing else", () => {
    expect(DOOR_RELAY_PATH_ADAPTATION).toBe('/door');
    expect(relayUrlOf('wss://useast1.play.socom2legacy.com/g/4999', PAGE)).toBe('wss://socomlegacy.example.test/door/useast1/g/4999');
    expect(relayUrlOf('wss://USEAST1.play.socom2legacy.com/r/MP12/classic', PAGE)).toBe('wss://socomlegacy.example.test/door/useast1/r/MP12/classic');
    expect(relayUrlOf('https://useast1.play.socom2legacy.com', PAGE)).toBe('https://socomlegacy.example.test/door/useast1');   // the ping appends /ping
    expect(relayUrlOf('https://useast1.play.socom2legacy.com/ping', PAGE)).toBe('https://socomlegacy.example.test/door/useast1/ping');
    expect(relayUrlOf('wss://useast1.play.socom2legacy.com/g/4999', 'http://localhost:5303')).toBe('ws://localhost:5303/door/useast1/g/4999');
  });

  it("relays nothing the Worker would refuse: a port, a query, another path, a name outside the zone, no page origin", () => {
    for (const u of [
      'wss://useast1.play.socom2legacy.com:8443/g/1', 'wss://useast1.play.socom2legacy.com/g/1?x=1', 'wss://useast1.play.socom2legacy.com/g/1#h',
      'https://useast1.play.socom2legacy.com/replays/7', 'wss://useast1.play.socom2legacy.com/g/0', 'wss://useast1.play.socom2legacy.com/r/MP2/respawn',
      'wss://central.socom2legacy.com/g/1', 'wss://a.b.play.socom2legacy.com/g/1', 'wss://play.socom2legacy.com.evil.example/g/1',
      'ws://127.0.0.1:5343/g/1', 'ws://useast1.play.socom2legacy.com/g/1', 'not a url',
    ]) expect(relayUrlOf(u, PAGE)).toBeNull();
    for (const origin of [null, '', 'null', 'file://', 'not a url']) expect(relayUrlOf('wss://useast1.play.socom2legacy.com/g/1', origin)).toBeNull();
  });
});

describe('doorOriginOf', () => {
  it("is the direct door's origin, or the relay's origin for a relay URL on the page's hostname", () => {
    expect(doorOriginOf('wss://useast1.play.socom2legacy.com:443/r/MP2/classic', PAGE)).toBe('https://useast1.play.socom2legacy.com');
    expect(doorOriginOf('wss://socomlegacy.example.test/door/useast1/g/4999', PAGE)).toBe('https://socomlegacy.example.test/door/useast1');
    expect(doorOriginOf('ws://127.0.0.1:5343/g/1', PAGE)).toBeNull();
    expect(doorOriginOf('wss://other.example.test/door/useast1/g/1', PAGE)).toBeNull();   // a relay path on another hostname
    expect(doorOriginOf('not a url', PAGE)).toBeNull();
  });
});

describe('DoorRoutes', () => {
  const G = 'wss://useast1.play.socom2legacy.com/g/4999';
  const R = 'wss://socomlegacy.example.test/door/useast1/g/4999';

  it('dials the direct name first', () => {
    expect(new DoorRoutes(page).dial(G)).toBe(G);
  });

  it("after a direct failure dials the relay on the page's hostname; a later failure of the relay flips back", () => {
    const r = new DoorRoutes(page);
    r.failed(G);
    expect(r.dial(G)).toBe(R);
    expect(r.dial('https://useast1.play.socom2legacy.com')).toBe('https://socomlegacy.example.test/door/useast1');   // the ping's origin too
    expect(r.dial('wss://useast1.play.socom2legacy.com/r/MP7/classic')).toBe('wss://socomlegacy.example.test/door/useast1/r/MP7/classic');
    expect(r.relayed(R)).toBe(true);
    expect(r.relayed(G)).toBe(false);
    r.failed(R);
    expect(r.dial(G)).toBe(G);
  });

  it('is per host: another host stays direct', () => {
    const r = new DoorRoutes(page);
    r.failed(G);
    expect(r.dial('wss://useast2.play.socom2legacy.com/g/1')).toBe('wss://useast2.play.socom2legacy.com/g/1');
  });

  it("dials a flipped host's URL unchanged when the relay cannot carry it (a query, another path) or the page has no origin", () => {
    const r = new DoorRoutes(page);
    r.failed(G);
    expect(r.dial('wss://useast1.play.socom2legacy.com/g/1?x=1')).toBe('wss://useast1.play.socom2legacy.com/g/1?x=1');
    expect(r.dial('https://useast1.play.socom2legacy.com/replays/7')).toBe('https://useast1.play.socom2legacy.com/replays/7');
    const none = new DoorRoutes(() => null);
    none.failed(G);
    expect(none.dial(G)).toBe(G);
  });

  it('never rewrites a URL outside the zone, a loopback dev door, or one it cannot parse', () => {
    const r = new DoorRoutes(page);
    for (const u of ['ws://127.0.0.1:5343/g/1', 'wss://central.socom2legacy.com/x', 'not a url']) {
      r.failed(u);
      expect(r.dial(u)).toBe(u);
    }
  });

  it("reads the page's origin from the global location by default", () => {
    const r = new DoorRoutes();
    r.failed(G);
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    expect(r.dial(G)).toBe(origin && /^https?:\/\//.test(origin) ? relayUrlOf(G, origin) : G);
  });
});

describe('NetClient on the relay', () => {
  it('a socket refused before it opened, whose door then fails its ping outright, flips the host to the relay; an open keeps it', async () => {
    const routes = new DoorRoutes(page);
    const dialled: string[] = [];
    const sockets: ReturnType<typeof socketAt>[] = [];
    const make = () => new NetClient({ url: 'wss://useast1.play.socom2legacy.com/g/4999', map: 'MP2', name: 'p', routes, routeCheck: checkWith(refusing), socket: (u) => { const s = socketAt(u, dialled); sockets.push(s); return s; } }, walk());
    const first = make();
    sockets[0]!.refuse();
    expect(first.state).toBe('closed');
    await flush();
    const second = make();
    expect(second.url).toBe('wss://socomlegacy.example.test/door/useast1/g/4999');    // the close report names the route taken
    sockets[1]!.open();
    expect(second.state).toBe('open');
    make();
    expect(dialled).toEqual([
      'wss://useast1.play.socom2legacy.com/g/4999',
      'wss://socomlegacy.example.test/door/useast1/g/4999',
      'wss://socomlegacy.example.test/door/useast1/g/4999',
    ]);
  });

  it('a socket refused before it opened by a door that answers its ping (a 404, a rate limit) keeps the route (F2)', async () => {
    const routes = new DoorRoutes(page);
    const dialled: string[] = [];
    const sockets: ReturnType<typeof socketAt>[] = [];
    const make = () => new NetClient({ url: 'wss://useast1.play.socom2legacy.com/g/1', map: 'MP2', name: 'p', routes, routeCheck: checkWith(answering204), socket: (u) => { const s = socketAt(u, dialled); sockets.push(s); return s; } }, walk());
    make();
    sockets[0]!.refuse();
    await flush();
    make();
    expect(dialled[1]).toBe('wss://useast1.play.socom2legacy.com/g/1');
  });

  it("a relayed socket refused before it opened, whose relay's ping answers other than 204 (a Worker without the route), flips back to direct", async () => {
    const routes = new DoorRoutes(page);
    routes.failed('wss://useast1.play.socom2legacy.com/g/1');
    const dialled: string[] = [];
    const sockets: ReturnType<typeof socketAt>[] = [];
    const notFound = (async () => new Response('<!doctype html>', { status: 404 })) as unknown as typeof fetch;
    const make = () => new NetClient({ url: 'wss://useast1.play.socom2legacy.com/g/1', map: 'MP2', name: 'p', routes, routeCheck: checkWith(notFound), socket: (u) => { const s = socketAt(u, dialled); sockets.push(s); return s; } }, walk());
    make();
    sockets[0]!.refuse();
    await flush();
    make();
    expect(dialled).toEqual(['wss://socomlegacy.example.test/door/useast1/g/1', 'wss://useast1.play.socom2legacy.com/g/1']);
  });

  it('checkDoorRoute pings the origin of the dialled door (direct or relayed), and asks nothing of a URL outside the zone', async () => {
    const routes = new DoorRoutes(page);
    const urls: string[] = [];
    const rec = (async (url: string) => { urls.push(url); throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const deps = { fetch: rec, observer: null, resources: () => [] };
    await checkDoorRoute('wss://useast1.play.socom2legacy.com:443/r/MP2/classic', routes, deps);
    await checkDoorRoute('ws://127.0.0.1:5343/g/1', routes, deps);
    expect(urls).toEqual(['https://useast1.play.socom2legacy.com/ping']);
    expect(routes.dial('wss://useast1.play.socom2legacy.com/g/1')).toBe('wss://socomlegacy.example.test/door/useast1/g/1');
    await checkDoorRoute('wss://socomlegacy.example.test/door/useast1/g/1', routes, deps);
    expect(urls[1]).toBe('https://socomlegacy.example.test/door/useast1/ping');
    expect(routes.dial('wss://useast1.play.socom2legacy.com/g/1')).toBe('wss://useast1.play.socom2legacy.com/g/1');
  });

  it('a socket that opened and then dropped does not change the route (a drop mid-match is no blocked name)', () => {
    const routes = new DoorRoutes(page);
    const dialled: string[] = [];
    const sockets: ReturnType<typeof socketAt>[] = [];
    const make = () => new NetClient({ url: 'wss://useast1.play.socom2legacy.com/g/1', map: 'MP2', name: 'p', routes, socket: (u) => { const s = socketAt(u, dialled); sockets.push(s); return s; } }, walk());
    make();
    sockets[0]!.open();
    sockets[0]!.refuse();
    make();
    expect(dialled[1]).toBe('wss://useast1.play.socom2legacy.com/g/1');
  });

  it('the page closing a socket before it opened does not change the route', () => {
    const routes = new DoorRoutes(page);
    const dialled: string[] = [];
    const make = () => new NetClient({ url: 'wss://useast1.play.socom2legacy.com/g/1', map: 'MP2', name: 'p', routes, socket: (u) => socketAt(u, dialled) }, walk());
    make().close();
    make();
    expect(dialled[1]).toBe('wss://useast1.play.socom2legacy.com/g/1');
  });
});

describe('timeDoorPing on the relay', () => {
  const D = 'https://useast1.play.socom2legacy.com';
  const RELAY = 'https://socomlegacy.example.test/door/useast1';

  it('a probe that fails outright flips the host; the next probe goes to the relay', async () => {
    const routes = new DoorRoutes(page);
    const urls: string[] = [];
    const refusing = (async (url: string) => { urls.push(url); throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: refusing, routes, observer: null, resources: () => [] })).toBeNull();
    let now = 0;
    const answering = (async (url: string) => { urls.push(url); now = 31; return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: answering, routes, now: () => now, observer: null, resources: () => [] })).toBe(31);
    expect(urls).toEqual([`${D}/ping`, `${RELAY}/ping`]);
  });

  it('a probe whose fetch rejects at the timeout abort (as browsers do) keeps the route (review F1)', async () => {
    const routes = new DoorRoutes(page);
    const urls: string[] = [];
    const abortable = (async (url: string, init: RequestInit) => { urls.push(url); return new Promise<Response>((_, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: abortable, routes, timeoutMs: 5, observer: null, resources: () => [] })).toBeNull();
    expect(await timeDoorPing(D, { fetch: abortable, routes, timeoutMs: 5, observer: null, resources: () => [] })).toBeNull();
    expect(urls).toEqual([`${D}/ping`, `${D}/ping`]);
  });

  it('a direct probe that times out or answers other than 204 keeps the route (a slow link is no blocked name)', async () => {
    const routes = new DoorRoutes(page);
    const urls: string[] = [];
    const never = (async (url: string) => { urls.push(url); return new Promise<Response>(() => undefined); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: never, routes, timeoutMs: 5, observer: null, resources: () => [] })).toBeNull();
    const busy = (async (url: string) => { urls.push(url); return new Response(null, { status: 530 }); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: busy, routes, observer: null, resources: () => [] })).toBeNull();
    expect(await timeDoorPing(D, { fetch: busy, routes, observer: null, resources: () => [] })).toBeNull();
    expect(urls).toEqual([`${D}/ping`, `${D}/ping`, `${D}/ping`]);
  });

  it("a relayed probe answered other than 204 (an old Worker's static 404 or index.html, a host down) flips back to direct: a new page on an old Worker loses nothing", async () => {
    for (const status of [200, 404, 502, 503, 508]) {
      const routes = new DoorRoutes(page);
      routes.failed(`${D}`);
      const urls: string[] = [];
      const other = (async (url: string) => { urls.push(url); return new Response(status === 200 ? '<!doctype html>' : null, { status }); }) as unknown as typeof fetch;
      expect(await timeDoorPing(D, { fetch: other, routes, observer: null, resources: () => [] })).toBeNull();
      expect(await timeDoorPing(D, { fetch: other, routes, observer: null, resources: () => [] })).toBeNull();
      expect(urls).toEqual([`${RELAY}/ping`, `${D}/ping`]);
    }
  });

  it('a relayed probe that fails outright flips back to direct; one that times out keeps the relay', async () => {
    const routes = new DoorRoutes(page);
    routes.failed(D);
    const urls: string[] = [];
    const never = (async (url: string) => { urls.push(url); return new Promise<Response>(() => undefined); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: never, routes, timeoutMs: 5, observer: null, resources: () => [] })).toBeNull();
    const refusing = (async (url: string) => { urls.push(url); throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await timeDoorPing(D, { fetch: refusing, routes, observer: null, resources: () => [] })).toBeNull();
    expect(await timeDoorPing(D, { fetch: refusing, routes, observer: null, resources: () => [] })).toBeNull();
    expect(urls).toEqual([`${RELAY}/ping`, `${RELAY}/ping`, `${D}/ping`]);
  });
});
