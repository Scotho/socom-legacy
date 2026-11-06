import { createReadStream, statSync, type Stats } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The static site server the parity pack and the LAN playtest share (PK-5; docs/specs/2026-11-03-parity-pack-design.md
 * 8). Product track (OT.R53): a local tool's server, an adaptation with no original, never in a build and never changing
 * the game's behaviour. Moved out of `tools/lan-playtest.ts` (his guards, Chris's `launch.mjs` 90-115, kept in
 * substance): GET and HEAD only, nothing out of the site (a `..` in any spelling refused 403), `Cache-Control:
 * no-store`, `X-Content-Type-Options: nosniff`, bound where the caller says (127.0.0.1 for both callers).
 *
 * The routes are the static host's (`deploy/host/web/nginx.conf`, the game page's locations): `/testroom`, `/forge`,
 * `/playtest` and everything below each, `/setup` and `/setup/` are `setup/index.html`; `/` is `index.html`; any other
 * request that accepts HTML and names no file is `index.html` too (the app shell's fallback); a missing file otherwise is
 * 404. `/maps/*` is served from the `maps` folder when one is given (the pack's prepared maps; the page reads archives
 * by ranges, so a single `Range: bytes=` is answered 206 with `Content-Range`, past the end 416, several ranges the
 * whole file -- RFC 9110 lets a server ignore a Range it does not serve).
 */

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/** The Content-Type of a file by its extension; the disc's files (and anything else) application/octet-stream. */
export function mimeOf(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** The nginx locations that answer with the game page (`setup/index.html`). */
const PAGE_ROOTS = ['/testroom', '/forge', '/playtest'];

/** The site file a decoded path names, before the guard: the nginx routes. */
export function routeOf(path: string): string {
  if (path === '/') return '/index.html';
  if (path === '/setup' || path === '/setup/') return '/setup/index.html';
  for (const r of PAGE_ROOTS) if (path === r || path.startsWith(`${r}/`)) return '/setup/index.html';
  return path;
}

/**
 * One `Range` header against a file of `size` bytes: the inclusive range, 'unsatisfiable' (416), or null when the header
 * is not one single byte range this server serves (the whole file is sent instead).
 */
export function parseRange(header: string, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m as unknown as [string, string, string];
  if (a === '' && b === '') return null;
  if (a === '') {
    const n = Number(b);
    if (n === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  if (b !== '' && Number(b) < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end };
}

export interface SiteOptions {
  /** The built page's folder. */
  readonly site: string;
  /** The folder `/maps/*` is served from, or null (then `/maps/*` is a path in the site like any other). */
  readonly maps?: string | null;
  readonly host: string;
  /** 0 for any free port. */
  readonly port: number;
  /** Headers added to every answer (the LAN playtest's Content-Security-Policy). */
  readonly headers?: Readonly<Record<string, string>>;
  /** A bare `/` (no query) answered 302 to this address (the LAN playtest's play address), else `index.html`. */
  readonly rootRedirect?: string | null;
}

/** `file` inside `root` (resolved), or null when it is not. */
function inside(root: string, rel: string): string | null {
  const file = resolve(root, `.${rel}`);
  const r = relative(root, file);
  if (r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('..')) return null;
  return file;
}

/**
 * Whether the request target, as sent, holds a `..` segment in any spelling (`%2e%2e`, `..%2f`, a backslash). The URL
 * parser folds a plain or percent-encoded `..` away before the path is read, so a climb would otherwise land on another
 * file of the site; it is refused instead, as the design asks.
 */
export function dotDot(target: string): boolean {
  const raw = target.split(/[?#]/, 1)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  return decoded.split(/[\\/]/).includes('..');
}

function statFile(file: string): Stats | null {
  try {
    const st = statSync(file);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

/** The request handler on its own (the LAN playtest wraps it in its own `Server`). */
export function siteHandler(o: Omit<SiteOptions, 'host' | 'port'>): (req: IncomingMessage, res: ServerResponse) => void {
  const site = resolve(o.site);
  const maps = o.maps ? resolve(o.maps) : null;
  const extra = o.headers ?? {};
  const base = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
  const fail = (res: ServerResponse, status: number, more: Record<string, string> = {}): void => {
    res.writeHead(status, { ...base, 'Content-Type': 'text/plain; charset=utf-8', ...more });
    res.end(status === 404 ? 'not found' : status === 403 ? 'forbidden' : status === 405 ? 'GET and HEAD only' : '');
  };
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 405, { Allow: 'GET, HEAD' }); return; }
    const head = req.method === 'HEAD';
    let url: URL;
    let path: string;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
      path = decodeURIComponent(url.pathname);
    } catch {
      fail(res, 404);
      return;
    }
    if (path.includes('\0') || dotDot(req.url ?? '/')) { fail(res, 403); return; }
    if (o.rootRedirect && url.pathname === '/' && !url.search) {
      res.writeHead(302, { ...base, Location: o.rootRedirect });
      res.end();
      return;
    }
    const wantsHtml = /\btext\/html\b/.test(String(req.headers.accept ?? ''));
    if (maps && (path === '/maps' || path.startsWith('/maps/'))) {
      const file = inside(maps, path.slice('/maps'.length) || '/');
      if (!file) { fail(res, 403); return; }
      const st = statFile(file);
      if (!st) { fail(res, 404); return; }
      const ranged = { ...base, 'Content-Type': mimeOf(file), 'Accept-Ranges': 'bytes' };
      const asked = typeof req.headers.range === 'string' ? parseRange(req.headers.range, st.size) : null;
      if (asked === 'unsatisfiable') { fail(res, 416, { 'Content-Range': `bytes */${st.size}` }); return; }
      if (asked) {
        res.writeHead(206, { ...ranged, 'Content-Length': String(asked.end - asked.start + 1), 'Content-Range': `bytes ${asked.start}-${asked.end}/${st.size}` });
        if (head) { res.end(); return; }
        createReadStream(file, { start: asked.start, end: asked.end }).on('error', () => res.destroy()).pipe(res);
        return;
      }
      res.writeHead(200, { ...ranged, 'Content-Length': String(st.size) });
      if (head) { res.end(); return; }
      createReadStream(file).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const file = inside(site, routeOf(path));
    if (!file) { fail(res, 403); return; }
    let st = statFile(file);
    let served = file;
    if (!st && wantsHtml) {
      served = resolve(site, 'index.html');
      st = statFile(served);
    }
    if (!st) { fail(res, 404); return; }
    res.writeHead(200, { ...base, 'Content-Type': mimeOf(served), 'Content-Length': String(st.size) });
    if (head) { res.end(); return; }
    createReadStream(served).on('error', () => res.destroy()).pipe(res);
  };
}

export interface SiteServer {
  readonly server: Server;
  /** `http://<host>:<port>/`, the port as bound. */
  readonly url: string;
  close(): Promise<void>;
}

/** The site server, listening; a port in use rejects with the listen error (the caller says which and tries another). */
export async function createSiteServer(o: SiteOptions): Promise<SiteServer> {
  const server = createServer(siteHandler(o));
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(o.port, o.host, () => { server.off('error', fail); ok(); });
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : o.port;
  return {
    server,
    url: `http://${o.host}:${port}/`,
    close: () => new Promise<void>((ok) => {
      server.closeAllConnections();
      server.close(() => ok());
    }),
  };
}
