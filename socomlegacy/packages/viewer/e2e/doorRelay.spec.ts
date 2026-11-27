import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * The door relay (product track, a browser adaptation with no original; the owner, 2026-11-21; `../src/net/doorRoute.ts`
 * `DOOR_RELAY_PATH_ADAPTATION`): a player whose network filter answers a match host's name with a block address still
 * reaches the host's door, through the page's own hostname.
 *
 * The rig: Chromium launched with `--host-resolver-rules` mapping `useast1.play.socom2legacy.com` (and v0.4.28's twin
 * `useast1-cf.play...`) to the loopback, where nothing answers 443 -- a block address that refuses at once, as the
 * players' block server refuses HTTPS (agent-mail handoffs/stage2/HANDOFF-door-relay-2026-11-21.md, "Evidence"). A
 * precondition asserts that a fetch of that name fails outright in this browser, so a host where something answers 443
 * cannot pass by accident. A mock door (this spec's Node server: `GET /ping` 204, a WebSocket at `/g/<id>` that records
 * the hello) stands for the host. The hostname's Worker (`deploy/pages/worker.js`'s `/door/<host>/` paths) is EMULATED by
 * Playwright routes on the page's origin that pass `/door/useast1/ping` and `/door/useast1/g/<id>` to the mock door; the
 * "old Worker" case answers them as a site without the route does (a 404, a refused upgrade).
 *
 * The page's own modules run unchanged in the served page (`../src/net/client.ts` `NetClient`, `../src/net/doorRoute.ts`
 * `DoorRoutes`, `../src/doorPing.ts`), with the browser's own fetch and WebSocket: a door URL as central hands it out is
 * dialled, refused, checked by one ping, and dialled again.
 *
 * 1. A blocked host's second attempt opens through `ws://<page>/door/useast1/g/4999` and its hello reaches the door. Expected
 *    RED on v0.4.28's twin route (its second attempt dials `useast1-cf`, blocked too): that red is OWED to a box run, not seen yet.
 * 2. An old Worker (no `/door/` route): the relay's attempt fails, its ping is answered 404, and the next attempt is direct
 *    again -- a new page on an old Worker loses nothing.
 *
 * Level: a rendered browser run of a browser adaptation; NOT the lobby's join screens (no rig here places a game at a
 * production-form door), NOT the deployed Worker, NOT a real filter. The live check after the Worker's deploy is the
 * release run sheet's row. Run from `socomlegacy/`:
 *   E2E_PORT=5303 npx playwright test packages/viewer/e2e/doorRelay.spec.ts --workers=1 --reporter=line
 */

const HOST = 'useast1.play.socom2legacy.com';
const TWIN = 'useast1-cf.play.socom2legacy.com';
const GAME = 4999;
const DOOR_URL = `wss://${HOST}/g/${GAME}`;

interface Door { port: number; hellos: { path: string; hello: unknown }[]; pings: number; close(): Promise<void> }

/** The mock door: `/ping` 204 (as `packages/host/src/door.ts`), a WebSocket at `/g/<id>` that records the first frame. */
async function startDoor(): Promise<Door> {
  const door: Door = { port: 0, hellos: [], pings: 0, close: async () => undefined };
  const http: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/ping') {
      door.pings++;
      res.writeHead(204, { 'access-control-allow-origin': '*', 'timing-allow-origin': '*', 'cache-control': 'no-store' });
      res.end();
      return;
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (!/^\/g\/[1-9][0-9]*$/.test(req.url ?? '')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.once('message', (data) => {
        let hello: unknown = null;
        try { hello = JSON.parse(String(data)); } catch { hello = String(data); }
        door.hellos.push({ path: req.url ?? '', hello });
      });
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  door.port = (http.address() as AddressInfo).port;
  door.close = async () => {
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };
  return door;
}

/** The Worker's `/door/useast1/` paths, emulated: passed to the mock door (`relay`), or answered as a site without them. */
async function emulateWorker(page: Page, door: Door, relay: boolean): Promise<string[]> {
  const seen: string[] = [];
  await page.route((url) => url.pathname.startsWith('/door/'), async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.pathname);
    if (!relay || url.pathname !== '/door/useast1/ping' || route.request().method() !== 'GET') {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    const res = await fetch(`http://127.0.0.1:${door.port}/ping`);
    // As the fixed Worker answers (`doorAnswer`): the door's status alone, none of its headers.
    await route.fulfill({ status: res.status, headers: { 'cache-control': 'no-store' } });
  });
  await page.routeWebSocket((url) => url.pathname.startsWith('/door/'), async (ws) => {
    const url = new URL(ws.url());
    seen.push(url.pathname);
    const m = /^\/door\/useast1(\/g\/[1-9][0-9]*)$/.exec(url.pathname);
    // A site without the route refuses the upgrade: the page's socket closes before it ever opened (a route that closes
    // a socket still connecting dispatches its close and no open).
    if (!relay || !m) { ws.close(); return; }
    // The Worker's pass-through: this spec's own socket to the mock door (Node's, so the page's name rules do not apply),
    // the page's socket opened only once the door's has; frames passed both ways, a close passed on.
    const upstream = new WebSocket(`ws://127.0.0.1:${door.port}${m[1]}`);
    const opened = await new Promise<boolean>((resolve) => { upstream.once('open', () => resolve(true)); upstream.once('error', () => resolve(false)); });
    if (!opened) { ws.close(); return; }
    ws.onMessage((data) => upstream.send(data));
    ws.onClose(() => upstream.close());
    upstream.on('message', (data, binary) => ws.send(binary ? (data as Buffer) : String(data)));
    upstream.on('close', () => ws.close());
  });
  return seen;
}

/** In the page: one NetClient on `url` with the page's own routes; resolves to the URL it dialled and the state it reached. */
const attempt = (page: Page, url: string) => page.evaluate(async (doorUrl) => {
  // The page's own modules, from the served page (the dev server resolves `/src/...`; a specifier built at run time,
  // so the e2e typecheck does not try to resolve it as a file of this tree -- the box gate's typecheck red of 2026-11-21).
  interface Routes { dial(url: string): string }
  interface Client { readonly state: string; readonly url: string; close(): void }
  type ClientCtor = new (o: { url: string; map: string; name: string; routes: Routes }, walk: object) => Client;
  const at = (path: string): string => `/src/${path}`;
  const [{ NetClient }, { doorRoutes }] = (await Promise.all([import(at('net/client.ts')), import(at('net/doorRoute.ts'))])) as [{ NetClient: ClientCtor }, { doorRoutes: Routes }];
  const walk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };
  const before = doorRoutes.dial(doorUrl);
  const client = new NetClient({ url: doorUrl, map: 'MP2', name: 'relay-spec', routes: doorRoutes }, walk);
  const t0 = performance.now();
  while (client.state !== 'open' && client.state !== 'closed' && client.state !== 'refused' && performance.now() - t0 < 10_000) await new Promise((r) => setTimeout(r, 25));
  const reached = client.state;
  if (reached === 'open') client.close();
  // The close-before-open check is one ping (at most its 3 s timeout): wait for the route to settle before the next attempt.
  const t1 = performance.now();
  while (reached !== 'open' && doorRoutes.dial(doorUrl) === before && performance.now() - t1 < 4_000) await new Promise((r) => setTimeout(r, 25));
  return { dialled: client.url, reached, next: doorRoutes.dial(doorUrl) };
}, url);

let browser: Browser | null = null;
let door: Door | null = null;

test.beforeAll(async ({ browserName, playwright }) => {
  const launch = test.info().project.use.launchOptions ?? {};
  const rule = `--host-resolver-rules=MAP ${HOST} 127.0.0.1, MAP ${TWIN} 127.0.0.1`;
  browser = await playwright[browserName].launch({ ...launch, args: [...(launch.args ?? []), rule] });
  door = await startDoor();
});

test.afterAll(async () => {
  await browser?.close();
  await door?.close();
});

/** A page on the served origin with the Worker emulated (routes registered before the navigation: a routed WebSocket's mock is installed with the document). */
async function pageOn(relay: boolean): Promise<{ page: Page; seen: string[] }> {
  const base = test.info().project.use.baseURL!;
  const context = await browser!.newContext({ baseURL: base });
  const page = await context.newPage();
  const seen = await emulateWorker(page, door!, relay);
  await page.goto('/maps/index.json');                     // the page's origin, a small answer; the modules load from it
  // The precondition: the host's name fails outright in this browser (a block address refusing at once).
  const blocked = await page.evaluate(async (host) => {
    try { await fetch(`https://${host}/ping`, { cache: 'no-store', mode: 'cors', credentials: 'omit' }); return false; } catch { return true; }
  }, HOST);
  expect(blocked, `${HOST} must fail outright in this browser (host-resolver-rules to a refusing loopback)`).toBe(true);
  return { page, seen };
}

test('a blocked host\'s door opens through the page\'s own /door/ relay, and its hello reaches the door', async () => {
  const { page, seen } = await pageOn(true);
  const origin = new URL(test.info().project.use.baseURL!).host;
  const first = await attempt(page, DOOR_URL);
  expect(first.dialled).toBe(DOOR_URL);
  expect(first.reached).toBe('closed');
  expect(first.next).toBe(`ws://${origin}/door/useast1/g/${GAME}`);
  const second = await attempt(page, DOOR_URL);
  expect(second.dialled).toBe(`ws://${origin}/door/useast1/g/${GAME}`);
  expect(second.reached).toBe('open');
  await expect.poll(() => door!.hellos.length, { timeout: 5_000 }).toBeGreaterThan(0);
  expect(door!.hellos.at(-1)!.path).toBe(`/g/${GAME}`);
  expect((door!.hellos.at(-1)!.hello as { type?: string }).type).toBe('hello');
  expect(seen).toContain(`/door/useast1/g/${GAME}`);
  await page.context().close();
});

test('on an old Worker (no /door/ route) the relay\'s failure flips the host back to direct: nothing is lost', async () => {
  const { page, seen } = await pageOn(false);
  const origin = new URL(test.info().project.use.baseURL!).host;
  const first = await attempt(page, DOOR_URL);
  expect(first.reached).toBe('closed');
  expect(first.next).toBe(`ws://${origin}/door/useast1/g/${GAME}`);
  const second = await attempt(page, DOOR_URL);
  expect(second.dialled).toBe(`ws://${origin}/door/useast1/g/${GAME}`);
  expect(second.reached).toBe('closed');
  expect(seen).toContain('/door/useast1/ping');            // the relay's ping, answered 404 as a site without the route
  expect(second.next).toBe(DOOR_URL);                      // back to the direct name
  await page.context().close();
});
