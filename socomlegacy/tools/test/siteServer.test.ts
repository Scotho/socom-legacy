import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSiteServer, mimeOf, parseRange } from '../siteServer';

/**
 * PK-5: the static site server the parity pack and the LAN playtest share (product track, an adaptation): the nginx
 * routes (deploy/host/web/nginx.conf), GET/HEAD only, nothing out of the site, no-store, nosniff, ranges on /maps/*.
 * Real requests on an ephemeral port against a temp site.
 */

interface Got { status: number; headers: Record<string, string | string[] | undefined>; body: string }

describe('siteServer: the static site of the parity pack (and the LAN playtest)', () => {
  let base = '', url = '', close: () => Promise<void> = async () => {};
  const get = (path: string, o: { method?: string; headers?: Record<string, string> } = {}) => new Promise<Got>((ok, fail) => {
    const u = new URL(url);
    const req = request({ host: u.hostname, port: Number(u.port), path, method: o.method ?? 'GET', headers: o.headers }, (res) => {
      let body = '';
      res.setEncoding('latin1');
      res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
  const html = { accept: 'text/html,application/xhtml+xml' };

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 's2u-sitesrv-'));
    const site = join(base, 'site');
    mkdirSync(join(site, 'setup'), { recursive: true });
    mkdirSync(join(site, 'assets'), { recursive: true });
    writeFileSync(join(site, 'index.html'), '<title>console</title>');
    writeFileSync(join(site, 'setup', 'index.html'), '<title>old page</title>');
    writeFileSync(join(site, 'assets', 'a.js'), 'export {}');
    writeFileSync(join(site, 'assets', 'b.wasm'), 'w');
    writeFileSync(join(site, 'manifest.webmanifest'), '{}');
    mkdirSync(join(base, 'maps', 'RUN'), { recursive: true });
    writeFileSync(join(base, 'maps', 'RUN', 'MP2.ZDB'), '0123456789');
    writeFileSync(join(base, 'maps', 'index.json'), '{"maps":[]}');
    writeFileSync(join(base, 'secret.txt'), 'outside the site');
    const s = await createSiteServer({ site, maps: join(base, 'maps'), host: '127.0.0.1', port: 0 });
    url = s.url;
    close = s.close;
  });
  afterAll(async () => {
    await close();
    rmSync(base, { recursive: true, force: true });
  });

  it('binds 127.0.0.1 and says its own address', () => {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it('the nginx routes: /testroom, /forge, /playtest and below, /setup and /setup/ are setup/index.html', async () => {
    for (const p of ['/testroom', '/testroom/', '/testroom/x', '/testroom?mode=play&devmode&map=M51', '/forge', '/forge/a/b', '/playtest', '/playtest/sheet', '/setup', '/setup/']) {
      const r = await get(p, { headers: html });
      expect(r.status, p).toBe(200);
      expect(r.body, p).toBe('<title>old page</title>');
    }
  });

  it('/ and any other HTML request with no file are index.html; a missing non-HTML file is 404', async () => {
    expect((await get('/')).body).toBe('<title>console</title>');
    expect((await get('/news', { headers: html })).body).toBe('<title>console</title>');
    expect((await get('/assets/none.js')).status).toBe(404);
    expect((await get('/news')).status).toBe(404);
  });

  it('every answer is no-store and nosniff; the MIME by extension', async () => {
    const js = await get('/assets/a.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript');
    expect(js.headers['cache-control']).toBe('no-store');
    expect(js.headers['x-content-type-options']).toBe('nosniff');
    expect((await get('/assets/none.js')).headers['cache-control']).toBe('no-store');
    expect((await get('/assets/b.wasm')).headers['content-type']).toBe('application/wasm');
    expect((await get('/manifest.webmanifest')).headers['content-type']).toBe('application/manifest+json');
    expect((await get('/testroom')).headers['content-type']).toBe('text/html; charset=utf-8');
    expect(mimeOf('x/RUN/MP2.ZDB')).toBe('application/octet-stream');
    const table: [string, string][] = [
      ['a.mjs', 'text/javascript'], ['a.css', 'text/css'], ['a.json', 'application/json'], ['a.png', 'image/png'],
      ['a.svg', 'image/svg+xml'], ['a.ico', 'image/x-icon'], ['a.woff2', 'font/woff2'], ['a.txt', 'text/plain; charset=utf-8'],
    ];
    for (const [f, t] of table) expect(mimeOf(f), f).toBe(t);
  });

  it('/maps/* is served from the maps folder, with Accept-Ranges', async () => {
    const r = await get('/maps/RUN/MP2.ZDB');
    expect(r.status).toBe(200);
    expect(r.body).toBe('0123456789');
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.headers['content-length']).toBe('10');
    expect(r.headers['content-type']).toBe('application/octet-stream');
    expect((await get('/maps/index.json')).body).toBe('{"maps":[]}');
    expect((await get('/maps/RUN/NONE.ZDB', { headers: html })).status).toBe(404);
  });

  it('a single range on /maps/* is 206 with Content-Range; past the end 416; several ranges the whole file', async () => {
    const r = await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=2-5' } });
    expect(r.status).toBe(206);
    expect(r.body).toBe('2345');
    expect(r.headers['content-range']).toBe('bytes 2-5/10');
    expect(r.headers['content-length']).toBe('4');
    expect((await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=7-' } })).body).toBe('789');
    expect((await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=-3' } })).body).toBe('789');
    expect((await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=4-99' } })).headers['content-range']).toBe('bytes 4-9/10');
    const bad = await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=20-30' } });
    expect(bad.status).toBe(416);
    expect(bad.headers['content-range']).toBe('bytes */10');
    const multi = await get('/maps/RUN/MP2.ZDB', { headers: { range: 'bytes=0-1,4-5' } });
    expect(multi.status).toBe(200);
    expect(multi.body).toBe('0123456789');
  });

  it('parseRange: one range only, the forms of RFC 9110', () => {
    expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, end: 0 });
    expect(parseRange('bytes=-20', 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable');
    expect(parseRange('bytes=5-2', 10)).toBe(null);
    expect(parseRange('items=0-1', 10)).toBe(null);
    expect(parseRange('bytes=0-1,3-4', 10)).toBe(null);
  });

  it('HEAD answers the headers and no body', async () => {
    const r = await get('/maps/RUN/MP2.ZDB', { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(r.headers['content-length']).toBe('10');
    expect(r.body).toBe('');
  });

  it('only GET and HEAD', async () => {
    for (const m of ['POST', 'PUT', 'DELETE']) expect((await get('/index.html', { method: m })).status, m).toBe(405);
  });

  it('nothing outside the site or the maps: .. in any spelling is 403 (or 404), never the file', async () => {
    for (const p of ['/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/%2e%2e/%2e%2e/secret.txt', '/maps/%2e%2e/secret.txt', '/maps/..%2f..%2fsecret.txt']) {
      const r = await get(p, { headers: html });
      expect(r.status, p).toBe(403);
      expect(r.body, p).not.toContain('outside the site');
    }
    for (const p of ['/../secret.txt', '/%zz', '/a%00b']) {
      const r = await get(p);
      expect([403, 404], p).toContain(r.status);
      expect(r.body, p).not.toContain('outside the site');
    }
  });
});

describe('siteServer options the LAN playtest uses', () => {
  it('extra headers on every answer and a bare / redirected', async () => {
    const base = mkdtempSync(join(tmpdir(), 's2u-sitesrv2-'));
    writeFileSync(join(base, 'index.html'), 'i');
    const csp = "connect-src 'self'";
    const s = await createSiteServer({ site: base, maps: null, host: '127.0.0.1', port: 0, headers: { 'Content-Security-Policy': csp }, rootRedirect: '/testroom?mode=play' });
    try {
      const r = await fetch(s.url, { redirect: 'manual' });
      expect(r.status).toBe(302);
      expect(r.headers.get('location')).toBe('/testroom?mode=play');
      const i = await fetch(`${s.url}index.html`);
      expect(await i.text()).toBe('i');
      expect(i.headers.get('content-security-policy')).toBe(csp);
      expect((await fetch(`${s.url}?devmode`)).status).toBe(200);
    } finally {
      await s.close();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
