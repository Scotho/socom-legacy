import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * LATER 950 (a development adaptation and a test aid: no original, nothing of the game, never in a build): the local
 * servers' answer to the page's client error beacon. The page sends its error and diagnostic rows to its own origin's
 * `POST /api/client-error` in normal operation (`src/clientErrorBeacon.ts` `BEACON_PATH_ADAPTATION`; central serves it in
 * production). Vite's dev server -- the one every Playwright config starts -- and `vite preview` had no such route, so
 * any row a page sent during a browser spec was a 404, which Chromium writes to the console as `Failed to load
 * resource: ... 404` and the specs' "console / page errors must be []" checks fail on, only on the boxes where the row
 * fires (v0.4.20's candidate 2: nine specs, SwiftShader boxes only). Here the local server takes the row and answers 204,
 * as central does, and keeps nothing.
 *
 * - **Never where a real route is meant**: off when the dev proxy forwards `/api` to a local match server
 *   (`./devProxy`, `S2U_DEV_PROXY_PORT`), which serves the route itself; a build has no server.
 * - **Exactly the one route and method**: `POST /api/client-error`, query aside; any other request goes on as before.
 * - Never a loosened console check: a spec still fails on any other failed request.
 */
export const DEV_CLIENT_ERROR_PATH = '/api/client-error';

type Next = (err?: unknown) => void;
export type DevClientErrorSink = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

/** The sink for `env`, or undefined where the dev proxy is on (it forwards `/api` to a server that answers). */
export function devClientErrorSink(env: Record<string, string | undefined>): DevClientErrorSink | undefined {
  const proxy = env['S2U_DEV_PROXY_PORT'];
  if (proxy !== undefined && proxy !== '') return undefined;
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'POST' || path !== DEV_CLIENT_ERROR_PATH) { next(); return; }
    req.resume();                                            // the row is read and dropped
    req.on('end', () => { res.statusCode = 204; res.end(); });
    req.on('error', () => { res.statusCode = 204; res.end(); });
  };
}
