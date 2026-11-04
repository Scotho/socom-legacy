import {
  READ_SET_MOVIES, hasFileBlobs, isRanged, streamFile, type AssetSource, type BlobAssetSource, type DiscIdentity,
  type RangedAssetSource, type ReadProgress, type StreamOptions,
} from '@s2u/archive';
import type { ExtractEnv } from './discExtract';
import { openExtractedSource } from './discExtractRecord';
import { ExtractedMissError, type ExtractedAssetSource } from './discExtractSource';
import type { StoredRequest } from './discSource';

/**
 * **The extraction as a request's source** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-3,
 * FI.R6): what `./discSource` `assetSourceFor` makes of a `{ kind: 'stored' }` request, on the page and in each worker
 * (`./worker`, `./movieWorker`, `./forge/forgeWorker`, through `sourceCache`). It opens the kept extraction itself, at
 * its first read (`./discExtractRecord` `openExtractedSource`: OPFS and IndexedDB are both reachable from a worker, so
 * nothing but the identity is posted, and no bytes cross the page/worker boundary), and checks that the record is the
 * disc the request names.
 *
 * **The fallback** (FI.R6, the merge controller's ruling): a path the extraction does not hold -- outside the read set
 * (`ExtractedMissError` `outside`) -- is read from the disc the request carries, when one was opened on this visit
 * (`disc`), and only for the paths its `fallback` allows: `movies` (the front end: the cut movies, `RUN/MOVIES/**.PSS`
 * beyond `READ_SET_MOVIES`) or `outside` (the forge: a path outside the set; its campaign maps are in the set since FI.R6's second revision). Any other miss -- a non-movie path the
 * front end reads, a file gone from storage -- is a real error in its own words, never skipped. With no disc, a cut
 * movie is not opened at all: `movieOpens` answers false for it, so the session's movie host skips it (`./frontEndMovies`).
 *
 * A **browser adaptation** (FI.R2, OT.R53, the product track): the stored files are the disc's own bytes, read by the
 * same paths, so nothing the game reads changes. Nothing leaves the player's machine (DA.R3).
 */

/** A disc path the movie readers name: `RUN/MOVIES/<...>.PSS`, upper case. */
const MOVIE = /^RUN\/MOVIES\/.*\.PSS$/;
const canonical = (path: string): string => path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/;\d+$/, '').toUpperCase();

/** Whether `path` is a movie (the front end's fallback's paths). */
export const isMoviePath = (path: string): boolean => MOVIE.test(canonical(path));

/** Whether two `SYSTEM.CNF` identities are the same disc (DA.R8: boot, `VER`, `VMODE`). */
export const sameIdentity = (a: DiscIdentity, b: DiscIdentity): boolean => a.boot === b.boot && a.ver === b.ver && a.vmode === b.vmode;

/** The words for a start from storage whose extraction is gone (cleared, evicted, or deleted in another tab). */
export const STORED_GONE = 'the disc kept in this browser is gone (cleared or evicted, or deleted in another tab): choose your disc again on the launcher';

/** Where a request's files are, in the forge's FG.R12 words ("which is not on ..."). */
export function sourceWhere(request: { kind: string; disc?: unknown }): string {
  if (request.kind === 'http') return 'the served tree';
  if (request.kind === 'stored' && !request.disc) return 'the disc kept in this browser';
  return 'your disc';
}

/**
 * The movie host's open check for `source` (DX-3, FI.R6: "a cut movie ... is skipped, as a Cross press skips it, when
 * [the disc] is not" present): for a start from storage with no disc on this visit, a movie opens only when the read set
 * keeps it (`READ_SET_MOVIES`); any other source -- and a stored one with its disc -- has no check (every name opens, as
 * before). Answers the check, or undefined for none.
 */
export function movieOpens(source: { kind: string; disc?: unknown }): ((name: string) => boolean) | undefined {
  if (source.kind !== 'stored' || source.disc) return undefined;
  const kept = new Set(READ_SET_MOVIES);
  return (name) => kept.has(canonical(name));
}

/** `StoredDiscSource`'s seams (a test passes its own): the extraction's opener and its environment. */
export interface StoredDeps {
  /** Opens the kept extraction; absent, `openExtractedSource(env)`. */
  open?: () => Promise<ExtractedAssetSource | null>;
  env?: ExtractEnv;
}

export class StoredDiscSource implements RangedAssetSource, BlobAssetSource {
  private kept: Promise<ExtractedAssetSource> | null = null;
  private readonly open: () => Promise<ExtractedAssetSource | null>;

  /** `disc`: the source over `request.disc` (made by `./discSource`), or null when none was opened on this visit. */
  constructor(readonly request: StoredRequest, private readonly disc: AssetSource | null, deps: StoredDeps = {}) {
    this.open = deps.open ?? (() => openExtractedSource(deps.env ?? {}));
  }

  /** The kept extraction, opened once and checked against the request's identity; a failure is tried again next read. */
  private extraction(): Promise<ExtractedAssetSource> {
    this.kept ??= this.open().then((s) => {
      if (!s) throw new Error(STORED_GONE);
      const kept = s.record.identity;
      if (!sameIdentity(kept, this.request.identity)) {
        throw new Error(`the disc kept in this browser (${kept.boot} ${kept.ver ?? ''}) is not the one this start was made from (${this.request.identity.boot} ${this.request.identity.ver ?? ''}): go back to the launcher and start again`);
      }
      return s;
    });
    this.kept.catch(() => { this.kept = null; });
    return this.kept;
  }

  /** The disc to read `path` from after the extraction's miss `e`, or null: the miss is the answer. */
  private fallback(e: unknown, path: string): AssetSource | null {
    if (!this.disc || !(e instanceof ExtractedMissError) || e.reason !== 'outside') return null;
    return this.allows(path) ? this.disc : null;
  }

  private allows(path: string): boolean {
    return (this.request.fallback ?? 'movies') === 'outside' || isMoviePath(path);
  }

  private async either<T>(path: string, kept: (s: ExtractedAssetSource) => Promise<T>, disc: (d: AssetSource) => Promise<T>): Promise<T> {
    const s = await this.extraction();
    try {
      return await kept(s);
    } catch (e) {
      const d = this.fallback(e, path);
      if (!d) throw e;
      return disc(d);
    }
  }

  /** The read set's paths, and those of the disc the fallback may read (sorted, once each). */
  async list(): Promise<string[]> {
    const kept = await (await this.extraction()).list();
    if (!this.disc) return kept;
    const more = (await this.disc.list()).filter((p) => this.allows(p));
    return [...new Set([...kept, ...more])].sort();
  }

  read(path: string, onProgress?: ReadProgress): Promise<Uint8Array> {
    return this.either(path, (s) => s.read(path, onProgress), (d) => d.read(path, onProgress));
  }

  size(path: string): Promise<number> {
    return this.either(path, (s) => s.size(path), async (d) => {
      if (!isRanged(d)) throw new Error(`${path}: the disc cannot say its size`);
      return d.size(path);
    });
  }

  readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    return this.either(path, (s) => s.readRange(path, offset, length), async (d) => {
      if (!isRanged(d)) throw new Error(`${path}: the disc cannot be read by range`);
      return d.readRange(path, offset, length);
    });
  }

  fileBlob(path: string): Promise<Blob> {
    return this.either(path, (s) => s.fileBlob(path), async (d) => {
      if (!hasFileBlobs(d)) throw new Error(`${path}: the disc cannot hand its file over`);
      return d.fileBlob(path);
    });
  }

  /** The file as chunks: from storage, or -- the miss checked before the first chunk -- from the disc the fallback allows. */
  async *stream(path: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    options.signal?.throwIfAborted();
    const s = await this.extraction();
    let from: AssetSource | null = null;
    try {
      await s.fileBlob(path);
    } catch (e) {
      from = this.fallback(e, path);
      if (!from) throw e;
    }
    yield* from ? streamFile(from, path, options) : s.stream(path, options);
  }
}
