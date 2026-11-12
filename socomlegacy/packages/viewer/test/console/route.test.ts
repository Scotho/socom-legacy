// @vitest-environment node
import { createServer as httpServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createServer, type UserConfig } from 'vite';
import viewerConfig from '../../vite.config';

/**
 * The console launcher's address (slice 1's page, the review's finding: a screenshot pass found `/console/` answering
 * the old launcher): the dev server answers `<base>console` and `<base>console/`, with or without a query, with the
 * console page -- the viewer's own Vite config and its `projectRoutes` rewrite, under `/` and the site's `/socomlegacy/`.
 * Since CX-9a (CX.R8, the owner, 2026-10-12: the console "becomes the new launcher default") the console is the
 * viewer's root `index.html`: `<base>` answers it and `<base>console` stays its alias, and the old page is
 * `setup/index.html`, answered at `<base>setup`. As `../menuRoutesServe.test.ts` does it: a Node HTTP server on an
 * ephemeral loopback port, no browser. A browser adaptation with no original (OT.R28).
 */
const config = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { accept: 'text/html' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { body += c; });
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

async function serve(base: string, paths: readonly string[]): Promise<{ status: number; body: string }[]> {
  const vite = await createServer({ configFile: config, base, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'silent' });
  const http: Server = httpServer(vite.middlewares);
  try {
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    const { port } = http.address() as AddressInfo;
    const out: { status: number; body: string }[] = [];
    for (const p of paths) out.push(await get(port, p));
    return out;
  } finally {
    await new Promise<void>((done) => http.close(() => done()));
    await vite.close();
  }
}

describe('the console page\'s address', () => {
  it('<base>console and <base>console/ (a query kept) answer the console page, never the old launcher', async () => {
    for (const base of ['/', '/socomlegacy/']) {
      const paths = ['console', 'console/', 'console?sample', 'console/?sample'].map((p) => `${base}${p}`);
      const pages = await serve(base, paths);
      pages.forEach((r, i) => {
        expect(r.status, paths[i]).toBe(200);
        expect(r.body, paths[i]).toContain('<title>SOCOM II Legacy Launcher</title>');
        expect(r.body, paths[i]).toMatch(/src\/console\/main\.ts/);
        expect(r.body, paths[i]).not.toMatch(/src\/entry\.ts/);
      });
    }
  }, 120_000);
});

/** The console page as the server answers it: its title and its own entry, never the old page's. */
const isConsole = (body: string): boolean => body.includes('<title>SOCOM II Legacy Launcher</title>') && /src\/console\/main\.ts/.test(body) && !/src\/entry\.ts/.test(body);
/** The old page (the setup page and the test room, `src/entry.ts`), never the console's entry. */
const isOldPage = (body: string): boolean => /<script[^>]*type="module"[^>]*src="[^"]*src\/entry\.ts"/.test(body) && !/src\/console\/main\.ts/.test(body);

describe('CX-9a: / is the console launcher, /setup the old page (CX.R8)', () => {
  it('<base> and <base>index.html (a query kept) answer the console; <base>setup and <base>setup/ the old page', async () => {
    for (const base of ['/', '/socomlegacy/']) {
      const consolePaths = ['', '?devmode&server=ws://127.0.0.1:8787/ws', 'index.html', 'console', 'console/?sample'].map((p) => `${base}${p}`);
      const setupPaths = ['setup', 'setup/', 'setup?devmode&menuflow=dlgNetLogin.rdr', 'setup/?launch=off'].map((p) => `${base}${p}`);
      const pages = await serve(base, [...consolePaths, ...setupPaths]);
      pages.forEach((r, i) => {
        const path = [...consolePaths, ...setupPaths][i]!;
        expect(r.status, path).toBe(200);
        expect(i < consolePaths.length ? isConsole(r.body) : isOldPage(r.body), path).toBe(true);
      });
    }
  }, 120_000);

  it('the build emits the console at / and the old page at /setup: the HTML inputs are index.html (the console) and setup/index.html (the old page), console/index.html none', async () => {
    const here = dirname(config);
    const made = (typeof viewerConfig === 'function' ? await viewerConfig({ command: 'build', mode: 'production', isPreview: false, isSsrBuild: false }) : viewerConfig) as UserConfig;
    const input = made.build!.rollupOptions!.input as Record<string, string>;
    // Vite writes an HTML input at its path under the root (`root: here`): `index.html` is the site's `/`, a page's
    // `<name>/index.html` its `/<name>/` -- the static host's and `projectRoutes`' clean routes.
    const at = Object.fromEntries(Object.entries(input).map(([name, file]) => [name, relative(here, file).split(sep).join('/')]));
    expect(at).toEqual({
      console: 'index.html', setup: 'setup/index.html', news: 'news/index.html', roadmap: 'roadmap/index.html',
      journey: 'journey/index.html', archive: 'archive/index.html', server: 'server/index.html', status: 'status/index.html', agent: 'agent/index.html',
      leaderboard: 'leaderboard/index.html',   // LCM-11b: the stats page (sitePaths.ts STATS_PAGES)
      match: 'leaderboard/match/index.html', player: 'leaderboard/player/index.html',   // LCM-16: /match/<id> and /player/<name>, each its own document
    });
    expect(isConsole(readFileSync(resolve(here, 'index.html'), 'utf-8'))).toBe(true);
    expect(isOldPage(readFileSync(resolve(here, 'setup/index.html'), 'utf-8'))).toBe(true);
  });
});
