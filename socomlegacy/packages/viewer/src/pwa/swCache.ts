/**
 * The service worker's cache rules (PWA-3), headless so a test can run them over a fake `CacheStorage`. A browser
 * adaptation. `./sw` calls them with the worker's own `caches` and `fetch`.
 */

/** One cache, as the rules use it. */
export interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

/** What of `CacheStorage` the rules use. */
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  open(name: string): Promise<CacheLike>;
  match(req: Request): Promise<Response | undefined>;
}

/**
 * LATER 186: the cache an activating worker records its own release in (`pruneCaches`' `record`). Named outside `s2u-`,
 * so never pruned as a release; its one entry is never a hashed asset.
 */
export const ACTIVE_RECORD = 'pwa-active';

/**
 * The `s2u-` caches an activating worker deletes: every one but its own and the release before. The joint review's P3
 * (our fold on Fuse's worker): CX.R18 keeps a page on its build while the front end is mounted, so a tab on the release
 * before can be claimed by this worker and still need its own lazy chunks after the server has moved on. LATER 186: the
 * release before is the one last activated (`previous`, its record), not merely the newest other -- a worker that
 * installed and waited, then was replaced unactivated, ran no page; with no record (activated before this rule), the
 * newest other (`keys()` is in creation order). Its review's F2: never a cache created after this one -- a newer worker
 * still installing (its precache) when an older one activates. Two releases at most kept behind, so the storage does not grow.
 */
export function staleCaches(keys: readonly string[], current: string, previous: string | null = null): string[] {
  const at = keys.indexOf(current);
  const others = (at < 0 ? keys : keys.slice(0, at)).filter((k) => k.startsWith('s2u-') && k !== current);
  if (previous !== null && others.includes(previous)) return others.filter((k) => k !== previous);
  return others.slice(0, -1);
}

/** Prunes as `staleCaches` says; with `record` (a URL in the worker's scope), reads the release before there and records this one. */
export async function pruneCaches(storage: CacheStorageLike, current: string, record?: string): Promise<void> {
  const book = record ? await storage.open(ACTIVE_RECORD) : null;
  const hit = book && record ? await book.match(new Request(record)) : undefined;
  const previous = hit ? await hit.text() : null;
  await Promise.all(staleCaches(await storage.keys(), current, previous).map((k) => storage.delete(k)));
  if (book && record) await book.put(new Request(record), new Response(current));
}

/**
 * LATER 1048 (a browser adaptation): the activating worker prunes (`pruneCaches`), then claims the open pages -- the claim
 * whatever the prune did. Any step of the prune can reject on a full or evicted origin (the record book's open, an old
 * cache's delete, the record's put); chained as `prune.then(claim)` that stopped the claim and left the open pages
 * uncontrolled until their next load. A failed prune keeps more caches than it should (never fewer), and its record book
 * is dropped (its review's 1): an older record left standing -- this release's put refused -- would name the release
 * before this one as the last active, and the next activation would delete THIS release's cache under a tab it claimed
 * (P3, LATER 186). With no record the next activation keeps the newest other (`staleCaches`): this one, unless a release
 * installed after it and was replaced unactivated (the fallback before LATER 186) -- still never worse than the stale
 * record. The drop is itself best-effort. The claim's own rejection is the browser's and passes to the activate event.
 */
export async function activateFrom(storage: CacheStorageLike, current: string, record: string | undefined, claim: () => Promise<void>): Promise<void> {
  await pruneCaches(storage, current, record).catch(async () => {
    if (record) await storage.delete(ACTIVE_RECORD).catch(() => undefined);
  });
  await claim();
}

/**
 * A hashed asset: any kept cache -- this release's or the one before, whose page this worker may now serve (P3) -- else
 * the network, kept in this release's cache on a hit.
 *
 * SW-ASSET-FETCH (a browser adaptation): the cache is the worker's convenience, never the page's failure. A cache that
 * cannot be read (a full or evicted origin) is a miss; the copy is stored after the answer, its failure swallowed and
 * its promise handed to `keep` (the fetch event's `waitUntil`, so the worker lives until it settles). Before this, the
 * store was awaited before the answer, and a store that rejected turned the server's 200 into a network error -- seen
 * 2026-11-14 in a test browser (net::ERR_FAILED on the build's chunks, the page's launcher not drawn in that profile), the
 * store refused because the test profile's cache files passed Windows' 260-character path limit (a profile under a deep
 * folder; read in a local build's run). No player was observed failing; this makes any refused store harmless.
 */
export async function cacheFirstFrom(
  storage: CacheStorageLike,
  current: string,
  req: Request,
  fetchFn: (req: Request) => Promise<Response>,
  /** False once this build is stale (PT195-5): a miss is answered here and never requested. */
  allowNetwork: () => boolean | Promise<boolean> = () => true,
  /** The store's promise, never rejecting: the worker passes its fetch event's `waitUntil`. */
  keep: (stored: Promise<void>) => void = () => undefined,
): Promise<Response> {
  const hit = await storage.match(req).catch(() => undefined);
  if (hit) return hit;
  if (!(await allowNetwork())) return new Response('', { status: 404 });
  const res = await fetchFn(req);
  if (res.ok) {
    const copy = res.clone();
    const stored = storage.open(current).then((cache) => cache.put(req, copy)).catch(() => undefined);
    // its review (1): a worker that cannot be kept alive (`waitUntil` throwing InvalidStateError) loses the copy, not the answer
    try { keep(stored); } catch { /* the copy may be cut short; the answer stands */ }
  }
  return res;
}

/**
 * A navigation (SW-ASSET-FETCH's review, 3; a browser adaptation): the network first; refused, the offline page kept in
 * this release's cache, else a plain 503 -- a cache that cannot be opened or read is no offline page, never no response.
 */
export async function networkFirstFrom(
  storage: CacheStorageLike,
  current: string,
  offline: string,
  req: Request,
  fetchFn: (req: Request) => Promise<Response>,
): Promise<Response> {
  try {
    return await fetchFn(req);
  } catch {
    const cached = await storage.open(current).then((cache) => cache.match(new Request(offline))).catch(() => undefined);
    return cached ?? new Response('SOCOM II Legacy is offline.', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
