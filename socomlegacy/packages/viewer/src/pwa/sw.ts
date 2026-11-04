import { assetPrefix, decideFetch } from './fetchPolicy';
import { gateFor, hashedAssetPath, hashedMissUsesNetwork, StaleGates, type StaleStore } from './staleRelease';
import { cacheFirstFrom, pruneCaches, type CacheStorageLike } from './swCache';

/**
 * The service worker (PWA-3). Hand-written, bundled to a stable `/sw.js` (no content hash) by the Vite plugin.
 * Navigations are network-first, with the precached offline page when the network fails. Hashed `/assets/` of this
 * build are cache-first under a per-release cache name, and install precaches them from `asset-manifest.json` so a
 * page still running this build can load its own chunks after the server has moved on. Activate deletes the `s2u-`
 * caches but its own and the release last activated (recorded, LATER 186), and a hashed asset is matched across the
 * two kept (`./swCache`, P3). Once a page says its build is stale (`./staleRelease`: the polled revision changed, or a
 * lazy script failed), a hashed asset that page asks for and that is not already cached is answered here and not fetched,
 * including a `/testroom/assets/` URL the cache rule does not cover. The gate is that page's (its client id), never the
 * worker's: another tab, or the same tab reloaded onto the new build, still fetches. The worker does not call `skipWaiting` itself: the page asks, and only outside a match, so a match is
 * not left on a half-new build.
 * `__PWA_RELEASE__` and `__PWA_BASE__` are replaced at bundle time.
 */

declare const __PWA_RELEASE__: string;
declare const __PWA_BASE__: string;

interface SwScope {
  addEventListener(type: 'install' | 'activate', fn: (ev: { waitUntil: (p: Promise<unknown>) => void }) => void): void;
  addEventListener(type: 'fetch', fn: (ev: { request: Request; clientId?: string; respondWith: (p: Promise<Response>) => void }) => void): void;
  addEventListener(type: 'message', fn: (ev: { data: unknown; source?: { id?: string } | null; waitUntil: (p: Promise<unknown>) => void }) => void): void;
  location: { href: string };
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void>; get: (id: string) => Promise<{ id: string } | undefined> };
}

const scope = self as unknown as SwScope;
const CACHE = `s2u-${__PWA_RELEASE__}`;
/** PT195-5: each page's gate, set when its version poll or a failed chunk says its build's files are no longer on the server. */
const stale = new StaleGates();
const BASE = __PWA_BASE__;
const ROOT = !BASE || BASE === '/' ? '/' : BASE.endsWith('/') ? BASE : `${BASE}/`;
const OFFLINE = `${ROOT}offline.html`;
/** LATER 186: where activate records this release (`./swCache` `ACTIVE_RECORD`), a URL in the worker's own scope. */
const ACTIVE_KEY = new URL(`${ROOT}__pwa-active`, (self as unknown as { location: { href: string } }).location.href).href;
/** The takeover's review (F2): each page's stale mark, kept in this release's cache where a restarted worker finds it. */
const STALE_PREFIX = new URL(`${ROOT}__pwa-stale/`, scope.location.href).href;
const staleKey = (id: string): string => `${STALE_PREFIX}${encodeURIComponent(id)}`;
const staleStore: StaleStore = {
  marked: async (id) => (await (await caches.open(CACHE)).match(staleKey(id))) !== undefined,
  mark: async (id) => { await (await caches.open(CACHE)).put(staleKey(id), new Response('1')); },
  keep: async (open) => {
    const cache = await caches.open(CACHE);
    for (const r of await cache.keys()) {
      if (r.url.startsWith(STALE_PREFIX) && !(await open(decodeURIComponent(r.url.slice(STALE_PREFIX.length))))) await cache.delete(r);
    }
  },
};

scope.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(pruneCaches(caches as unknown as CacheStorageLike, CACHE, ACTIVE_KEY).then(() => scope.clients.claim()));
});

scope.addEventListener('message', (event) => {
  const from = event.source?.id;
  if (stale.apply(from, event.data)) {
    const marking = from && (event.data as { type?: unknown }).type === 'stale-release' ? staleStore.mark(from) : Promise.resolve();
    // The closed pages' gates and marks go with them. Each id is asked by itself, and the sender is never dropped: the
    // rendered check across a release saw `clients.matchAll` list the open pages under other ids than their messages
    // carried, right after a worker swap -- and a prune by that list deleted the mark it had just stored.
    const open = async (id: string): Promise<boolean> => id === from || (await scope.clients.get(id).catch(() => undefined)) !== undefined;
    event.waitUntil(marking.then(async () => {
      for (const id of stale.ids()) if (!(await open(id))) stale.drop(id);
      await staleStore.keep(open);
    }).catch(() => undefined));
    return;
  }
  const data = event.data;
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== 'skip-waiting') return;
  event.waitUntil(scope.skipWaiting());
});

scope.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Another origin is the browser's, including a range read the page did not make.
  if (url.origin !== (self as unknown as { location: { origin: string } }).location.origin) return;
  const decision = decideFetch({
    method: req.method,
    pathname: url.pathname,
    navigate: req.mode === 'navigate',
    range: req.headers.has('range'),
  }, BASE);
  if (decision === 'passthrough') {
    // `/testroom/assets/*.js` is not `<base>assets/`, so the cache rule lets it through. Once the build is stale
    // that request is the old hash, and the server answers 404. Answer it here instead.
    if (hashedAssetPath(url.pathname) && event.clientId) event.respondWith(passStale(req, event.clientId));
    return;
  }
  if (decision === 'network-first') event.respondWith(networkFirst(req));
  else event.respondWith(cacheFirst(req, event.clientId));
});

/** This build's hashed files, read while install still sees them on the server. One missing file does not fail install. */
async function precache(): Promise<void> {
  const cache = await caches.open(CACHE);
  const urls = [OFFLINE];
  try {
    const res = await fetch(`${ROOT}asset-manifest.json`, { cache: 'no-store' });
    if (res.ok) {
      const body: unknown = await res.json();
      const prefix = assetPrefix(BASE);
      if (Array.isArray(body)) {
        for (const item of body) {
          if (typeof item === 'string' && item.startsWith(prefix)) urls.push(item);
        }
      }
    }
  } catch { /* the offline page is still cached below */ }
  await Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)));
}

async function networkFirst(req: Request): Promise<Response> {
  try {
    return await fetch(req);
  } catch {
    const cached = await caches.open(CACHE).then((cache) => cache.match(OFFLINE));
    return cached ?? new Response('SOCOM II Legacy is offline.', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/** A hashed file outside the cache rule (`/testroom/assets/`): the network, unless its page's build is stale. */
async function passStale(req: Request, clientId: string): Promise<Response> {
  const gate = await gateFor(stale, staleStore, clientId);
  return hashedMissUsesNetwork(gate, req.url) ? fetch(req) : new Response('', { status: 404 });
}

async function cacheFirst(req: Request, clientId: string | undefined): Promise<Response> {
  return cacheFirstFrom(caches as unknown as CacheStorageLike, CACHE, req, (r) => fetch(r), async () => hashedMissUsesNetwork(await gateFor(stale, staleStore, clientId), req.url));
}
