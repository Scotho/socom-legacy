import type { ProxyOptions } from 'vite';

/**
 * MU-6's dev-only proxy (`docs/plans/2026-10-09-modern-ui-parallel.md`, MU-6; the wave 2 Log: "the modern UI cannot be
 * run against a local match server today"). **A development adaptation**: no original, nothing of the game, never in a
 * build. The modern Lobby tab asks the page's own origin (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, `src/connectHost.ts`),
 * and `?devmode&server=` -- the only other way to name a server -- skips the setup page and so the tab. With its own
 * opt-in, `S2U_DEV_PROXY_PORT`, set, the dev server forwards those same-origin requests to `http://localhost:<port>`,
 * so the tab runs against a local match server with the page's real origin (`docs/SETUP.md`, "Running a local
 * two-window playtest").
 *
 * - **Its own opt-in, nothing else turns it on** (the controller's ruling of the MU-6 review: it changes nothing for an
 *   existing setup). `VITE_S2U_LOCAL_PORT` -- the Local server's port the page is built with (`src/online.ts`), which
 *   the owner's dev server and the e2e run (`playwright.config.ts`) already set -- never does. The opt-in is not
 *   `VITE_`-prefixed, so Vite never exposes it to the page's bundle: it is read here, by the config, only.
 * - **The dev server only**: `vite` (`command === 'serve'`, not `isPreview`). A build has no server, and `vite preview`
 *   would inherit `server.proxy` as its own default -- both get none.
 * - **The target is `localhost`**, which Node may resolve to the IPv6 loopback first: the match server must bind
 *   `HOST=::` (IPv6 and IPv4), SETUP's rule for the two-window playtest; bound to the IPv4 default it refuses.
 * - **The Origin is not rewritten** (`changeOrigin: false`): the server's `ALLOWED_ORIGINS` check sees the page's own
 *   origin (`http://localhost:<vite port>`), as on a deployment; list that origin there.
 * - **Exactly the Lobby tab's prefixes**: the account routes (`/account/*`), the lobby's (`/lobby/*`), the modern read
 *   routes (`/modern/*`), the public counts (`/rooms`), `/health`, and the two the tab's cards read: the texts
 *   (`/texts/*`: the agreement, the news and universe cards), the replays (`/replays`, `/replays/<id>`) and the public
 *   lobby card (`/api/lobby`, LINK-3). No WebSocket
 *   (`/ws`): the original's online path past LOGIN is not what this is for. No existing route changes: the menu
 *   flow's deep paths begin `/main` or the page's base, the project pages `/news`, `/roadmap`, `/archive`, `/server`
 *   (`test/menuRoutesServe.test.ts`).
 */
export const DEV_LOCAL_PROXY_PREFIXES = ['/account', '/lobby', '/modern', '/rooms', '/health', '/texts', '/replays', '/api'] as const;

/** The proxy's own opt-in: the local match server's port. Server-side only (no `VITE_` prefix). */
export const DEV_PROXY_PORT_VAR = 'S2U_DEV_PROXY_PORT';

/**
 * The dev server's proxy for `env`, or undefined: unset (or empty), a build, or the preview server. A value that is not
 * a port (1-65535, digits only) is refused by name, never guessed at.
 */
export function devLocalProxy(env: Record<string, string | undefined>, command: 'build' | 'serve', isPreview: boolean | undefined): Record<string, ProxyOptions> | undefined {
  const raw = env[DEV_PROXY_PORT_VAR];
  if (raw === undefined || raw === '' || command !== 'serve' || isPreview === true) return undefined;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new Error(`${DEV_PROXY_PORT_VAR} must be a port number (1-65535), not "${raw}"`);
  const target = `http://localhost:${port}`;
  return Object.fromEntries(DEV_LOCAL_PROXY_PREFIXES.map((p) => [p, { target, changeOrigin: false }]));
}
