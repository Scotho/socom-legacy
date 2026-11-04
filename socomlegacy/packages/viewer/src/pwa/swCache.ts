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
 * A hashed asset: any kept cache -- this release's or the one before, whose page this worker may now serve (P3) -- else
 * the network, kept in this release's cache on a hit.
 */
export async function cacheFirstFrom(
  storage: CacheStorageLike,
  current: string,
  req: Request,
  fetchFn: (req: Request) => Promise<Response>,
  /** False once this build is stale (PT195-5): a miss is answered here and never requested. */
  allowNetwork: () => boolean | Promise<boolean> = () => true,
): Promise<Response> {
  const hit = await storage.match(req);
  if (hit) return hit;
  if (!(await allowNetwork())) return new Response('', { status: 404 });
  const res = await fetchFn(req);
  if (res.ok) await (await storage.open(current)).put(req, res.clone());
  return res;
}
