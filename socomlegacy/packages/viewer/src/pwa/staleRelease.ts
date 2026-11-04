/**
 * A page left open across a release (PT195-5, LATER 331, issue #463). A browser adaptation: it never changes
 * what the game does.
 *
 * The page already polls `/version.json` (`./update` `watchRelease`). After FIREHUGE1's 19:45 deploy that poll
 * kept running while open pages asked again for hashed scripts the new build no longer serves (`/assets/*` and
 * `/testroom/assets/*`, 48 times). Two facts stop that:
 * - once the served revision differs, a hashed asset that is not already cached is not fetched from the network
 *   again; a lazy script or chunk that failed is not fetched again, and makes the page ask the revision at once (the
 *   takeover's review, F4: one failure may be a dropped connection on the current build, not a release);
 * - the page shows the reload prompt. A version change during a match waits until the match is over. A failed
 *   chunk means the page is already broken, so the prompt is shown during the match too. The page never reloads
 *   itself during a match.
 */

export interface StaleGate {
  /** The running build is no longer the one the server has, or a chunk of it has already failed. */
  releaseStale: boolean;
  /** Chunk URLs that have already failed, normalized (`normalizeChunkUrl`). */
  failed: Set<string>;
}

export function emptyStaleGate(): StaleGate {
  return { releaseStale: false, failed: new Set() };
}

/** A build script or stylesheet under an assets directory (`/assets/`, `/testroom/assets/`). Not a map, a font or an image. */
export function hashedAssetPath(pathname: string): boolean {
  return /\/assets\/[^/]+\.(?:js|mjs|css)$/i.test(pathname);
}

/** Drop the query and hash so a retry of the same file is the same key. */
export function normalizeChunkUrl(url: string): string {
  try {
    const u = new URL(url, 'https://page.invalid');
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/**
 * A message from the page to its worker. `stale-release` is the version poll. `chunk-failed` is one lazy load.
 * Either one stops every later hashed-asset miss. Returns whether `data` was one of these messages.
 */
export function applyStaleMessage(gate: StaleGate, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const type = (data as { type?: unknown }).type;
  if (type === 'stale-release') {
    gate.releaseStale = true;
    return true;
  }
  if (type === 'chunk-failed') {
    const url = (data as { url?: unknown }).url;
    if (typeof url === 'string' && url) gate.failed.add(normalizeChunkUrl(url));
    // The takeover's review (F4): only that file. A dropped connection fails one chunk of the CURRENT build; whether the
    // build is gone is the revision's to say -- the page asks it on a failure (`staleFromServed`) and posts `stale-release`.
    return true;
  }
  return false;
}

/**
 * The takeover's review (OT.R69): one gate per page, by its client id. The worker outlives the page that told it: after
 * a release the old worker stays active (it never skips waiting by itself), so a tab opened after the release, or the
 * stale tab after its own reload (a new client id), is served by the same worker and asks for the new build's hashed
 * files. A gate for the whole worker answered those 404 -- a page on the current build broke, and its Restart reloaded
 * into the same worker. A page the worker never heard from has a clear gate.
 */
export class StaleGates {
  private readonly byClient = new Map<string, StaleGate>();

  /** `applyStaleMessage` for the page `clientId` names; a message with no page to name marks nothing. */
  apply(clientId: string | undefined, data: unknown): boolean {
    const gate = clientId ? this.byClient.get(clientId) ?? emptyStaleGate() : emptyStaleGate();
    if (!applyStaleMessage(gate, data)) return false;
    if (clientId) this.byClient.set(clientId, gate);
    return true;
  }

  /** The page's gate; a clear one for a page never heard from (a fetch's `clientId` is '' for a navigation). */
  gate(clientId: string | undefined): StaleGate {
    return (clientId ? this.byClient.get(clientId) : undefined) ?? emptyStaleGate();
  }

  /** This worker has met the page (its gate known, clear or not). */
  has(clientId: string): boolean {
    return this.byClient.has(clientId);
  }

  /** Met, and its stored mark read: clear. */
  touch(clientId: string): void {
    if (!this.byClient.has(clientId)) this.byClient.set(clientId, emptyStaleGate());
  }

  /** The pages this worker holds a gate for. */
  ids(): string[] {
    return [...this.byClient.keys()];
  }

  /** A page gone. */
  drop(clientId: string): void {
    this.byClient.delete(clientId);
  }

  /** Keep only the pages still open (`clients.matchAll`). */
  prune(live: Iterable<string>): void {
    const keep = new Set(live);
    for (const id of [...this.byClient.keys()]) if (!keep.has(id)) this.byClient.delete(id);
  }

  get size(): number {
    return this.byClient.size;
  }
}

/** The served revision is another build's: a read that failed (null) or an unnamed one ('') is not a release. */
export function staleFromServed(served: string | null, pageRev: string): boolean {
  return served !== null && served !== '' && pageRev !== '' && served !== pageRev;
}

/**
 * The takeover's review (F2): the browser stops an idle worker (after about 30 s) and its memory with it, while the page
 * said `stale-release` once. The worker keeps each page's mark where a restart finds it (`sw.ts`: its own cache).
 */
export interface StaleStore {
  marked(clientId: string): Promise<boolean>;
  mark(clientId: string): Promise<void>;
  /** Drop the marks of pages `open` says are gone. */
  keep(open: (clientId: string) => Promise<boolean>): Promise<void>;
}

/**
 * The page's gate, its stored mark read back the first time this worker meets the page (after a restart); then memory
 * answers. A store that fails reads as no mark: a fetch is never blocked on a guess.
 */
export async function gateFor(gates: StaleGates, store: StaleStore | null, clientId: string | undefined): Promise<StaleGate> {
  if (!clientId || !store || gates.has(clientId)) return gates.gate(clientId);
  let marked = false;
  try { marked = await store.marked(clientId); } catch { marked = false; }
  if (marked) gates.apply(clientId, { type: 'stale-release' });
  else gates.touch(clientId);
  return gates.gate(clientId);
}

/** A hashed-asset cache miss may go to the network only while this build is still the one being served. */
export function hashedMissUsesNetwork(gate: StaleGate, url: string): boolean {
  if (gate.releaseStale) return false;
  return !gate.failed.has(normalizeChunkUrl(url));
}

/**
 * A hashed file the worker does not cache (a `/testroom/assets/` URL is not under `<base>assets/`) must still not
 * reach the server once the build is stale. True when the worker should answer it locally.
 */
export function blockStalePassthrough(pathname: string, gate: StaleGate, url: string): boolean {
  return hashedAssetPath(pathname) && !hashedMissUsesNetwork(gate, url);
}

const CHUNK_IN_TEXT = /(?:https?:\/\/[^\s'")]+|\/[^\s'")]+)\.(?:js|mjs|css)\b/gi;

/** The build-chunk URL inside a failed dynamic import or a Vite preload error, or null when the failure is not one. */
export function chunkUrlFromReason(reason: unknown): string | null {
  const text = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  if (!text) return null;
  CHUNK_IN_TEXT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHUNK_IN_TEXT.exec(text)) !== null) {
    const raw = match[0];
    try {
      if (hashedAssetPath(new URL(raw, 'https://page.invalid').pathname)) return raw;
    } catch { /* try the next match */ }
  }
  return null;
}

/**
 * The first time `reason` names a build chunk. A repeat is null: the prompt is already up and the worker has
 * already stopped the network for this build.
 */
export function takeChunkFailure(seen: Set<string>, reason: unknown): string | null {
  const url = chunkUrlFromReason(reason);
  if (!url) return null;
  const key = normalizeChunkUrl(url);
  if (seen.has(key)) return null;
  seen.add(key);
  return url;
}
