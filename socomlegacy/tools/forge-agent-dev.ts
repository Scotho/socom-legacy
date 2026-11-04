/// <reference types="vite/client" />
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectionInstructions } from '../packages/viewer/src/agent/connection';

/**
 * FCW-02b product adaptation: a loopback-only developer launcher, not game behavior.
 * Importing this module starts nothing. The CLI owns exactly two direct Node children: gateway and configured Vite.
 * No package installation, client configuration, authentication, game-data extraction or browser opening is performed.
 * The readiness budgets and port search are developer-tool limits with no original-game counterpart.
 */
export interface ForgeAgentDevDeps {
  root: string; execPath: string; tsxBin: string; viteBin: string; env: NodeJS.ProcessEnv;
  spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  portFree(port: number): Promise<boolean>;
  now(): number; sleep(ms: number): Promise<void>;
  log(line: string): void; error(line: string): void;
  onInterrupt(stop: () => Promise<void>): void;
}
export interface ForgeAgentDevRunning { stop(): Promise<void>; ended: Promise<number> }

const READY_MS = 20_000, REQUEST_MS = 2_000, POLL_MS = 100, STOP_MS = 5_000;
const MAX_BODY_BYTES = 256 * 1024, PAIRS = 32;
const HOST = '127.0.0.1';
const VIEWER_CONFIG = 'packages/viewer/vite.config.ts';
const origin = (port: number): string => `http://${HOST}:${port}`;
const message = (error: unknown): string => error instanceof Error ? error.message : 'Local startup failed.';

function port(value: string | undefined, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 5303 || number > 65535 || [8787, 8797].includes(number))
    throw Error('Choose an agent-owned loopback port from 5303 to 65535; reserved seat ports are unavailable.');
  return number;
}

/** Bound the whole response body as well as headers; redirects never leave the declared project endpoints. */
async function request(d: ForgeAgentDevDeps, url: string, scope: AbortSignal): Promise<{ status: number; text: string }> {
  scope.throwIfAborted();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(Error('Local readiness request timed out.')), REQUEST_MS);
  const signal = AbortSignal.any([scope, abort.signal]);
  try {
    const response = await d.fetch(url, { signal, redirect: 'error', credentials: 'omit' });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const next = await reader.read();
          signal.throwIfAborted();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > MAX_BODY_BYTES) { await reader.cancel(); throw Error('Local readiness response is too large.'); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { status: response.status, text: new TextDecoder().decode(bytes) };
  } finally { clearTimeout(timer); }
}

/** Only these four exact loopback addresses are probed. A successful SPA fallback is not a Forge route. */
async function inspect(d: ForgeAgentDevDeps, gateway: number, page: number, scope: AbortSignal): Promise<void> {
  const pageOrigin = origin(page), gatewayOrigin = origin(gateway);
  const html = await request(d, `${pageOrigin}/forge`, scope);
  if (html.status !== 200 || !/<script\b[^>]*\bsrc\s*=\s*["']\/src\/entry\.ts["']/.test(html.text)
    || !/\bid=["']view["']/.test(html.text))
    throw Error(`Wrong viewer config: /forge is missing or an unrelated HTTP 200 fallback. Use ${VIEWER_CONFIG}.`);
  const module = await request(d, `${pageOrigin}/src/agent/install.ts`, scope);
  const assignment = /import\.meta\.[e]nv\s*=\s*(\{[^\n;]*\})/.exec(module.text);
  let env: { VITE_S2U_AGENT_URL?: unknown; DEV?: unknown } | undefined;
  try { if (assignment) env = JSON.parse(assignment[1]!); } catch { /* refusal below */ }
  const servedGateway = env?.VITE_S2U_AGENT_URL || (env?.DEV === true ? origin(5360) : undefined);
  if (module.status !== 200 || servedGateway !== gatewayOrigin)
    throw Error('Page gateway mismatch: the served viewer must use the selected local gateway. Restart with npm run forge:agent.');
  const health = await request(d, `${gatewayOrigin}/health`, scope);
  if (health.status !== 200 || JSON.parse(health.text).ok !== true) throw Error('Gateway is not ready.');
  const metadata = await request(d, `${gatewayOrigin}/.well-known/oauth-protected-resource/mcp`, scope);
  const resource = metadata.status === 200 ? JSON.parse(metadata.text) as { resource?: unknown; authorization_servers?: unknown } : {};
  if (resource.resource !== `${gatewayOrigin}/mcp` || !Array.isArray(resource.authorization_servers)
    || !resource.authorization_servers.some(value => value === gatewayOrigin || value === `${gatewayOrigin}/`))
    throw Error('Gateway public address mismatch: resource and issuer must match the selected loopback address.');
}

async function stopChild(child: ChildProcess): Promise<void> {
  const running = (): boolean => child.exitCode === null && child.signalCode === null;
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    if (!running()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let exited!: () => void;
    const wait = new Promise<void>(resolve => {
      exited = resolve; child.once('exit', exited); timer = setTimeout(resolve, STOP_MS);
    });
    try { child.kill(signal); await wait; }
    finally { clearTimeout(timer); child.off('exit', exited); }
  }
  if (running()) throw Error('An owned child did not stop; inspect this command’s own child process.');
}

/** Return a check status, a failed start, or the two owned children after verified readiness. */
export async function runForgeAgent(argv: readonly string[], d: ForgeAgentDevDeps): Promise<number | ForgeAgentDevRunning> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--check')) {
    d.error('Usage: npm run forge:agent [-- --check]'); return 2;
  }
  let gateway: number, page: number;
  try {
    gateway = port(d.env.FORGE_AGENT_PORT, 5360); page = port(d.env.FORGE_AGENT_PAGE_PORT, gateway + 1);
    if (gateway === page) throw Error('Gateway and page need different ports.');
  } catch (error) { d.error(message(error)); return 2; }
  if (argv[0] === '--check') {
    d.log(`Configured gateway: ${origin(gateway)}/mcp\nConfigured page: ${origin(page)}/forge\nExpected public address: ${origin(gateway)}/mcp`);
    try {
      await inspect(d, gateway, page, new AbortController().signal);
      d.log(`Gateway and page are listening. The served page uses gateway ${origin(gateway)}.`); return 0;
    } catch (error) { d.error(message(error)); return 1; }
  }

  const children: { name: string; child: ChildProcess }[] = [];
  const scope = new AbortController();
  let ready = false, interrupted = false, failure: string | undefined, stopping: Promise<void> | undefined;
  let finish!: (code: number) => void;
  const ended = new Promise<number>(resolve => { finish = resolve; });
  const stop = (code = 0): Promise<void> => {
    if (stopping) return stopping;
    scope.abort(Error('Local startup was cancelled.'));
    // Publish the stop promise before kill can synchronously emit exit (as a real error or a test child can).
    stopping = Promise.resolve().then(async () => {
      const results = await Promise.allSettled(children.map(({ child }) => stopChild(child)));
      for (const result of results) if (result.status === 'rejected') { d.error(message(result.reason)); code = 1; }
      finish(code);
    });
    return stopping;
  };
  const fail = (line: string): void => {
    if (stopping || failure) return;
    failure = line; scope.abort(Error(line));
    if (ready) { d.error(line); void stop(1); }
  };
  const start = (name: string, args: readonly string[], env: NodeJS.ProcessEnv): void => {
    scope.signal.throwIfAborted();
    const child = d.spawn(d.execPath, args, { cwd: d.root, env, shell: false, stdio: 'inherit', windowsHide: true });
    children.push({ name, child });
    // Retain the error handler after startup/stop too: a late child error must never become unhandled.
    child.on('error', (error: Error) => fail(`${name} did not start: ${error.message}`));
    child.on('exit', (code, signal) => fail(`${name} stopped (${code === null ? `signal ${signal}` : `exit ${code}`}).`));
  };
  d.onInterrupt(() => { interrupted = true; return stop(); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let selected = false;
    for (let i = 0; i < PAIRS; i++) {
      scope.signal.throwIfAborted();
      if (await d.portFree(gateway) && await d.portFree(page)) { selected = true; break; }
      gateway = port(String(gateway + 2), 0); page = port(String(page + 2), 0);
    }
    if (!selected) throw Error('No free gateway/page pair in the bounded local port range.');
    const gatewayOrigin = origin(gateway), pageOrigin = origin(page);
    // --import loads tsx in this Node process; using its CLI would add a server grandchild on Windows.
    start('gateway', ['--import', pathToFileURL(d.tsxBin).href, join(d.root, 'packages/forge-agent/src/main.ts')], {
      ...d.env, FORGE_AGENT_DEVELOPMENT: '1', FORGE_AGENT_PORT: String(gateway), FORGE_AGENT_BIND: HOST,
      FORGE_AGENT_ISSUER: gatewayOrigin, FORGE_AGENT_ORIGINS: pageOrigin,
    });
    start('viewer', [d.viteBin, '--config', join(d.root, VIEWER_CONFIG), '--host', HOST, '--port', String(page), '--strictPort'], {
      ...d.env, VITE_S2U_AGENT_URL: gatewayOrigin,
    });
    const until = d.now() + READY_MS;
    timer = setTimeout(() => scope.abort(Error('Local readiness timed out.')), READY_MS);
    let last = 'Local services are not ready.';
    while (true) {
      if (scope.signal.aborted) throw Error(failure ?? 'Local readiness timed out or was cancelled.');
      try { await inspect(d, gateway, page, scope.signal); break; }
      catch (error) { last = message(error); }
      if (scope.signal.aborted || d.now() >= until) throw Error(failure ?? `Local readiness timed out: ${last}`);
      await d.sleep(POLL_MS);
    }
    scope.signal.throwIfAborted(); ready = true;
    clearTimeout(timer); timer = undefined;
    d.log(`Forge agent ready: ${pageOrigin}/forge?floor\nGateway: ${gatewayOrigin}/mcp`);
    // The page remains the source of the native clients' supported setup commands and flags; no token is printed.
    for (const client of ['claude', 'codex'] as const) {
      const text = connectionInstructions(client, `${gatewayOrigin}/mcp`, '');
      d.log(text.split('\n').filter(line => /^(claude mcp add |codex mcp (add|login) |Or, for this project only:|Then authenticate)/.test(line)).join('\n'));
    }
    d.log(`Keep this terminal open. Ctrl+C stops only these children.\nTo check this pair in another terminal, set FORGE_AGENT_PORT=${gateway} and FORGE_AGENT_PAGE_PORT=${page}, then npm run forge:agent -- --check.`);
    return { stop: () => stop(), ended };
  } catch (error) {
    if (!interrupted) d.error(failure ?? message(error));
    await stop(interrupted ? 0 : 1); return interrupted ? 0 : 1;
  } finally { clearTimeout(timer); }
}

function portFree(number: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port: number, host: HOST, exclusive: true }, () => server.close(error => resolve(!error)));
  });
}

function realDeps(): ForgeAgentDevDeps {
  const require = createRequire(import.meta.url);
  return {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '..'), execPath: process.execPath,
    tsxBin: require.resolve('tsx'), viteBin: join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
    env: process.env, spawn, fetch, portFree, now: Date.now, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: console.info, error: console.error,
    onInterrupt: stop => { for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void stop(); }); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runForgeAgent(process.argv.slice(2), realDeps());
  process.exitCode = typeof result === 'number' ? result : await result.ended;
}
