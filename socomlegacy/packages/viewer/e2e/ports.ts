/**
 * The e2e run's ports (2026-10-01): a spec never touches the developer's own servers. At 01:07Z that day a spec's page
 * with Online = Local reached the owner's play-test match server on 8787 (the Local default, `../src/online.ts`
 * `LOCAL_DEFAULT_PORT`) and was refused there for its protocol -- a run that could as well have joined the owner's match.
 * So the run builds its pages with its own Local port (`VITE_S2U_LOCAL_PORT`, `playwright.config.ts`), each spec that
 * needs a match server starts one on its own port, and the ports the developer's servers use are refused outright:
 * 8787 (`npm start -w @s2u/central`'s default) and 5181 (the owner's play-test Vite server); 8797 since 2026-10-03, the
 * owner's preview match server (HANDOFF rule 18) -- `grenadeSelfMp` started its own there until that day and found it taken.
 * Since LATER 495 (2026-10-26) each Playwright worker takes the run's ports shifted to its own range (`workerPort`, below).
 */

/** The developer's servers: never a port of this run's. */
export const FORBIDDEN_PORTS: readonly number[] = [8787, 5181, 8797, 5173, 5301, 5302];   // + the owner's 5173, 5301, 5302 (CLAUDE.md, "Ports"; LATER 495's review F2)

/** The Local port the run's pages are built with (`E2E_LOCAL_PORT`), by default. */
export const E2E_LOCAL_PORT_DEFAULT = 8811;

/** A port setting read as a port, refused when it is one of the developer's (`FORBIDDEN_PORTS`) or not a port. */
export function e2ePort(name: string, value: string | undefined, fallback: number): number {
  const port = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) throw new Error(`${name}=${value}: not a port`);
  if (FORBIDDEN_PORTS.includes(port)) throw new Error(`${name}=${port}: the developer's own server's port -- an e2e run never touches it (e2e/ports.ts)`);
  return port;
}

/**
 * LATER 495 (2026-10-26; product track, the e2e harness -- no page's game behaviour changes): **a port range per
 * Playwright worker**, so the whole e2e view runs at several workers. Playwright gives each worker process its
 * `TEST_PARALLEL_INDEX` (0 .. workers - 1, reused by a worker's replacement), and runs a spec file's tests in one worker
 * (`playwright.config.ts`: one project per file, `fullyParallel` off). Each port a spec starts a server on -- the run's
 * Local port (`localPort`), the session service's (`playtestPort`), a spec's own fixed default (`workerPort`, e.g.
 * `./menuMatch` `MENU_MATCH_PORT`) -- is the run's setting plus `TEST_PARALLEL_INDEX * E2E_WORKER_PORT_STRIDE`. Two files
 * in one worker run one after the other, as at one worker; two workers never meet on a port.
 *
 * The range: worker k takes base + 1000 k, k < `E2E_MAX_PARALLEL` (16), each shifted port below
 * `E2E_WORKER_PORT_CEILING` (32768, where Linux's ephemeral ports begin; Windows' begin at 49152). The specs' defaults sit
 * in two bands, 5304-5415 and 8791-8858: worker k >= 1 lands them on (5+k)304-(5+k)415 and (8+k)791-(8+k)858, which never
 * meet another worker's, the developer's (`FORBIDDEN_PORTS`, refused again after the shift) or the agents' own band from
 * 5303 (AGENTS.md, a dev or match server of a session: 5303-5420 in use) -- held by `../test/e2eWorkerPorts.test.ts`.
 * Outside a worker (the config's main process, a unit test, a `tsx` tool) the offset is 0. Not shifted: the run's Vite
 * (`E2E_PORT`, one server for every worker) and the MU-6 proxy's target (`modernServerPort`: the one dev server forwards
 * to one port), nor a value a spec hands its child process (the child reads it with `e2ePort`, unshifted).
 */
export const E2E_WORKER_PORT_STRIDE = 1000;
/** The workers a run may have (`TEST_PARALLEL_INDEX` below it): the reserved range's size. */
export const E2E_MAX_PARALLEL = 16;
/** A shifted port stays below this: the ephemeral ports' start on Linux (the gate box). */
export const E2E_WORKER_PORT_CEILING = 32768;

/** This worker's offset: `TEST_PARALLEL_INDEX * E2E_WORKER_PORT_STRIDE`; 0 outside a worker. */
export function workerPortOffset(env: Record<string, string | undefined> = process.env): number {
  const raw = env['TEST_PARALLEL_INDEX'];
  if (raw === undefined || raw === '') return 0;
  const i = Number(raw);
  if (!Number.isInteger(i) || i < 0 || i >= E2E_MAX_PARALLEL) throw new Error(`TEST_PARALLEL_INDEX=${raw}: a worker's index is 0-${E2E_MAX_PARALLEL - 1} (e2e/ports.ts, the per-worker port range)`);
  return i * E2E_WORKER_PORT_STRIDE;
}

/**
 * Whether this worker carries no offset (worker 0, or outside a worker): a spec whose page reaches its server by a fixed,
 * unshifted port (the invite link's, `lobbyInvite.spec.ts`, `botsLand.spec.ts`) runs only here. Its call in a spec is
 * also the gate box's marker for the one-worker pass (`workflow/aws-gate-e2e-split.sh`; LATER 495's review F1).
 */
export function oneWorkerPass(env: Record<string, string | undefined> = process.env): boolean {
  return workerPortOffset(env) === 0;
}

/** A port setting read as `e2ePort` reads it, shifted to this worker's range, and refused again after the shift. */
export function workerPort(name: string, value: string | undefined, fallback: number, env: Record<string, string | undefined> = process.env): number {
  const base = e2ePort(name, value, fallback);
  const offset = workerPortOffset(env);
  if (offset === 0) return base;
  const port = base + offset;
  if (port >= E2E_WORKER_PORT_CEILING) throw new Error(`${name}=${base} in worker ${env['TEST_PARALLEL_INDEX']}: ${port} reaches the ephemeral ports (${E2E_WORKER_PORT_CEILING}+; e2e/ports.ts)`);
  return e2ePort(`${name} (worker ${env['TEST_PARALLEL_INDEX']})`, String(port), port);
}

/**
 * The name of the page's run-time Local port (LATER 495): `playwright.config.ts` stores this worker's `localPort()` under
 * it in the page's storage (`use.storageState`), and a development build's local page reads it (`../src/online.ts`, under
 * a literal `import.meta.env.DEV`: no built page reads it). Pinned equal to the page's by `../test/e2eWorkerPorts.test.ts`.
 */
export const E2E_LOCAL_PORT_KEY = 's2u.e2e.localPort';

/**
 * A first visitor's storage at `origin` -- nothing remembered -- but for this worker's Local port under
 * `E2E_LOCAL_PORT_KEY` (LATER 495): for a spec that asks for a clean context and still dials Local
 * (`testroomMapBar.spec.ts`), whose page would otherwise read the run's base port at worker k >= 1.
 */
export function cleanStorageWithLocalPort(origin: string, env: Record<string, string | undefined> = process.env): { cookies: []; origins: { origin: string; localStorage: { name: string; value: string }[] }[] } {
  return { cookies: [], origins: [{ origin, localStorage: [{ name: E2E_LOCAL_PORT_KEY, value: String(localPort(env)) }] }] };
}

/** The run's Local port, unshifted (`E2E_LOCAL_PORT`): the one the pages are built with (`VITE_S2U_LOCAL_PORT`). */
export function localBasePort(env: Record<string, string | undefined> = process.env): number {
  return e2ePort('E2E_LOCAL_PORT', env['E2E_LOCAL_PORT'], E2E_LOCAL_PORT_DEFAULT);
}

/**
 * The Local match server's port for this worker: the one its pages' Online = Local joins (the run-time key above), and
 * `online.spec.ts` starts. The run's `localBasePort` plus this worker's offset.
 */
export function localPort(env: Record<string, string | undefined> = process.env): number {
  return workerPort('E2E_LOCAL_PORT', env['E2E_LOCAL_PORT'], E2E_LOCAL_PORT_DEFAULT, env);
}

/**
 * The playtest session service's port for this run (web sprint 33 PT-09, W33.R4: this lane's e2e ports start at 5306 --
 * Vite 5306 by `E2E_PORT`, the Local match server 5307 by `E2E_LOCAL_PORT`, the session service 5308): the one
 * `playtestMark.spec.ts` starts its in-process `SessionService` on and its page's `&playtest=` names.
 */
export const E2E_PLAYTEST_PORT_DEFAULT = 5308;

/** The session service's port for this worker (`E2E_PLAYTEST_PORT` shifted, LATER 495), refused as `workerPort` refuses. */
export function playtestPort(env: Record<string, string | undefined> = process.env): number {
  return workerPort('E2E_PLAYTEST_PORT', env['E2E_PLAYTEST_PORT'], E2E_PLAYTEST_PORT_DEFAULT, env);
}

/**
 * MU2-9 (`docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`, its host rules: the modern UI lane's ports are
 * 5395-5399): the ports the `modern*.spec.ts` run takes -- Vite (`E2E_PORT`), the Local port (`E2E_LOCAL_PORT`) and the
 * specs' own match server. The overlay's sections ask the page's own origin, so the run's dev server forwards them by
 * its MU-6 proxy (`../devProxy.ts`, `S2U_DEV_PROXY_PORT`) and the specs start their server on the proxy's port.
 */
export const MODERN_E2E_PORTS = { vite: 5395, local: 5396, server: 5397 } as const;

/** The modern specs' match server's port: the run's `S2U_DEV_PROXY_PORT`, refused as `e2ePort` refuses; null when unset (no proxy). */
export function modernServerPort(env: Record<string, string | undefined> = process.env): number | null {
  const v = env['S2U_DEV_PROXY_PORT'];
  return v === undefined || v === '' ? null : e2ePort('S2U_DEV_PROXY_PORT', v, MODERN_E2E_PORTS.server);
}
