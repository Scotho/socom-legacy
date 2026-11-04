import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildPwaShell, bundleServiceWorker, type ShellFile } from '../pwaFiles';

/**
 * The PWA browser check's server (PWA-7). It serves the shell the build emits (icons, manifest, worker) and a small
 * update page. It does not serve a disc. Port 5319, off the owner's servers.
 */

const port = Number(process.env.PWA_E2E_PORT ?? 5319);
const emblem = readFileSync(fileURLToPath(new URL('../../../../shared/ds/emblem.svg', import.meta.url)), 'utf8');
const shell = await buildPwaShell({ release: 'build-a', base: '/', emblemSvg: emblem });
const swB = await bundleServiceWorker('build-b', '/');
const files = new Map<string, ShellFile>(shell.map((f) => [f.path, f]));
const client = await build({
  entryPoints: [fileURLToPath(new URL('./client.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  legalComments: 'none',
});
let served = 'build-a';
let hits = 0;

const INSTALL = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <title>SOCOM II Legacy</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="manifest" href="/manifest.webmanifest" />
</head><body><p>SOCOM II Legacy</p></body></html>`;

const UPDATE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>SOCOM II Legacy</title></head>
<body><p>update</p><script type="module" src="/client.js"></script></body></html>`;

const LIVE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>SOCOM II Legacy</title></head>
<body>
  <p>live</p>
  <button type="button" data-act="start" style="position:fixed;left:0;right:0;bottom:0;height:4.5rem;z-index:1">START GAME</button>
  <script type="module" src="/client.js"></script>
</body></html>`;

const FORGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Forge</title>
<style>
  .fx-top { position:fixed; left:0; right:0; top:0; height:46px; z-index:3; display:flex; gap:8px; align-items:center; background:#0b1214; padding:0 8px; }
  .fx-play { margin-left:auto; }
</style></head>
<body class="forge-page">
  <div class="fx-top">
    <button type="button">Back</button>
    <button type="button">Save</button>
    <button type="button" class="fx-play">Play</button>
  </div>
  <script type="module" src="/client.js"></script>
</body></html>`;

const LAUNCHER = `<!doctype html>
<html lang="en" data-console><head><meta charset="utf-8" /><title>SOCOM II Legacy</title>
<style>
  .cx-header { position:fixed; left:0; right:0; top:0; min-height:3.5rem; z-index:2; display:flex; align-items:center; padding:0 16px; background:#0b1214; color:#e7eef2; }
</style></head>
<body>
  <header class="cx-header" id="header">SOCOM II Legacy</header>
  <script type="module" src="/client.js"></script>
</body></html>`;

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    if (path === '/release' && req.method === 'POST') {
      served = (await readBody(req)).trim() || served;
      send(res, 204, 'text/plain', '');
      return;
    }
    if (path === '/hits') { send(res, 200, 'application/json', JSON.stringify({ hits })); return; }
    if (path === '/version.json') { send(res, 200, 'application/json', `${JSON.stringify({ release: served })}\n`); return; }
    if (path === '/asset-manifest.json') {
      const list = served === 'build-b' ? ['/assets/index-b.js'] : ['/assets/index-a.js'];
      send(res, 200, 'application/json', `${JSON.stringify(list)}\n`);
      return;
    }
    if (path === '/assets/index-a.js') {
      if (served !== 'build-a') { send(res, 404, 'text/plain', 'missing'); return; }
      send(res, 200, 'text/javascript; charset=utf-8', 'chunk-a');
      return;
    }
    if (path === '/assets/index-b.js') {
      if (served !== 'build-b') { send(res, 404, 'text/plain', 'missing'); return; }
      send(res, 200, 'text/javascript; charset=utf-8', 'chunk-b');
      return;
    }
    if (path === '/sw.js') {
      send(res, 200, 'text/javascript; charset=utf-8', served === 'build-b' ? swB : (files.get('sw.js')?.body ?? ''));
      return;
    }
    if (path === '/install.html') { send(res, 200, 'text/html; charset=utf-8', INSTALL); return; }
    if (path === '/update.html') { send(res, 200, 'text/html; charset=utf-8', UPDATE); return; }
    if (path === '/live.html') { send(res, 200, 'text/html; charset=utf-8', LIVE); return; }
    if (path === '/forge') { send(res, 200, 'text/html; charset=utf-8', FORGE); return; }
    if (path === '/launcher') { send(res, 200, 'text/html; charset=utf-8', LAUNCHER); return; }
    if (path === '/client.js') { send(res, 200, 'text/javascript; charset=utf-8', client.outputFiles[0]?.text ?? ''); return; }
    if (path.startsWith('/maps/') || path.endsWith('.zdb')) {
      hits += 1;
      if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' }); res.end(); return; }
      if (req.headers.range) { send(res, 206, 'application/octet-stream', 'ab'); return; }
      send(res, 200, 'application/octet-stream', 'disc');
      return;
    }
    const file = files.get(path.replace(/^\//, ''));
    if (!file) { send(res, 404, 'text/plain', 'missing'); return; }
    send(res, 200, file.type, file.body);
  })().catch((e: unknown) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(e instanceof Error ? e.message : String(e));
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`pwa-e2e http://127.0.0.1:${port}\n`);
});
