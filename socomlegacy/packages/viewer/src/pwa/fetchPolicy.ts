/**
 * What the service worker may cache (PWA-3). A browser adaptation: it never changes a fetch the game makes.
 *
 * Range and HEAD go straight through, because the disc's served files are read that way
 * (`packages/archive/src/httpAssetSource.ts` `size` and `readRange`). `/maps/`, the socket, `/health`, `/rooms`,
 * the account, the API and the other server families are never cached, and neither is a disc archive wherever it
 * is served. Navigations are network-first. Only the current build's hashed `/assets/` are cache-first.
 */

export type FetchDecision = 'passthrough' | 'network-first' | 'cache-first';

/** Path prefixes the worker must not store. Exact, or with a following slash, so `/health` does not swallow `/healthz`. */
export const NEVER_CACHE_PREFIXES = ['/maps', '/ws', '/health', '/rooms', '/account', '/api', '/replays', '/lobby', '/clan', '/texts', '/modern'] as const;

/** Disc archives. A hashed script under `/assets/` does not carry one of these. */
const DISC_EXT = /\.(?:zdb|zar|zed|rdr|pss|mps|iso)$/i;

export interface FetchFacts {
  method: string;
  pathname: string;
  /** `Request.mode === 'navigate'`. */
  navigate: boolean;
  /** A `Range` header is set. */
  range: boolean;
}

export function neverCachePath(pathname: string): boolean {
  if (DISC_EXT.test(pathname)) return true;
  return NEVER_CACHE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** `base` is the site's base (`/` or `/socomlegacy/`). Hashed build files live under `<base>assets/`. */
export function assetPrefix(base: string): string {
  const root = !base || base === '/' ? '/' : base.endsWith('/') ? base : `${base}/`;
  return `${root}assets/`;
}

export function decideFetch(req: FetchFacts, base = '/'): FetchDecision {
  if (req.method === 'HEAD' || req.method !== 'GET' || req.range) return 'passthrough';
  if (neverCachePath(req.pathname)) return 'passthrough';
  if (req.navigate) return 'network-first';
  if (req.pathname.startsWith(assetPrefix(base))) return 'cache-first';
  return 'passthrough';
}
