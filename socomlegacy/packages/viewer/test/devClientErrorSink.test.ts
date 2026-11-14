// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import config from '../vite.config';
import { DEV_CLIENT_ERROR_PATH, devClientErrorSink } from '../devClientErrorSink';
import { BEACON_PATH_ADAPTATION } from '../src/clientErrorBeacon';

// LATER 950 (a development adaptation and a test aid): the local servers take the page's client error beacon's rows
// (`POST /api/client-error`) and answer 204, as central does -- v0.4.20's candidate 2 failed nine browser specs on the
// 404 Chromium logged for one such row. Off where the dev proxy forwards `/api` to a local match server. Evidence kind:
// unit test (the browser half is `e2e/devClientErrorSink.spec.ts`).

const PROXY = 'S2U_DEV_PROXY_PORT';
const held = process.env[PROXY];
afterEach(() => { if (held === undefined) delete process.env[PROXY]; else process.env[PROXY] = held; });

function req(method: string, url: string): IncomingMessage {
  const r = new EventEmitter() as EventEmitter & { method: string; url: string; resume(): void };
  r.method = method; r.url = url;
  r.resume = () => { queueMicrotask(() => r.emit('end')); };
  return r as unknown as IncomingMessage;
}
function res(): ServerResponse & { ended: Promise<number> } {
  let done!: (s: number) => void;
  const ended = new Promise<number>((d) => { done = d; });
  const r = { statusCode: 200, end() { done(r.statusCode); }, ended };
  return r as unknown as ServerResponse & { ended: Promise<number> };
}

describe('LATER 950: the local servers answer the client error beacon', () => {
  it('the route is the beacon\'s own', () => {
    expect(DEV_CLIENT_ERROR_PATH).toBe(BEACON_PATH_ADAPTATION);
  });

  it('POST /api/client-error (with or without a query) is read and answered 204; nothing passes on', async () => {
    const sink = devClientErrorSink({})!;
    for (const url of ['/api/client-error', '/api/client-error?x=1']) {
      const out = res();
      let passed = false;
      sink(req('POST', url), out, () => { passed = true; });
      expect(await out.ended).toBe(204);
      expect(passed).toBe(false);
    }
  });

  it('any other request goes on untouched: another method, another path', () => {
    const sink = devClientErrorSink({})!;
    for (const [m, u] of [['GET', '/api/client-error'], ['POST', '/api/lobby/x'], ['POST', '/api/client-errors'], ['GET', '/']] as const) {
      let passed = false;
      sink(req(m, u), res(), () => { passed = true; });
      expect(passed, `${m} ${u}`).toBe(true);
    }
  });

  it('off where the dev proxy forwards /api to a local match server (it serves the route itself)', () => {
    expect(devClientErrorSink({ [PROXY]: '5424' })).toBeUndefined();
    expect(devClientErrorSink({ [PROXY]: '' })).toBeDefined();
  });

  it('the viewer\'s config installs it on the dev server and the preview server, and what it installs answers 204', async () => {
    delete process.env[PROXY];
    type ConfigFn = (env: { command: 'build' | 'serve'; mode: string; isPreview?: boolean }) => UserConfig;
    const c = (config as unknown as ConfigFn)({ command: 'serve', mode: 'development' });
    const plugin = (c.plugins as Plugin[]).flat().find((p) => p && (p as Plugin).name === 'dev-client-error-sink') as Plugin | undefined;
    expect(plugin).toBeDefined();
    const used: unknown[] = [];
    const server = { middlewares: { use: (f: unknown) => { used.push(f); } } };
    (plugin!.configureServer as (s: unknown) => void)(server);
    (plugin!.configurePreviewServer as (s: unknown) => void)(server);
    expect(used).toHaveLength(2);
    // Review F2: the installed functions are the sink, not merely two calls.
    for (const f of used as ((q: IncomingMessage, s: ServerResponse, n: () => void) => void)[]) {
      const out = res();
      let passed = false;
      f(req('POST', '/api/client-error'), out, () => { passed = true; });
      expect(await out.ended).toBe(204);
      expect(passed).toBe(false);
    }
  });
});
