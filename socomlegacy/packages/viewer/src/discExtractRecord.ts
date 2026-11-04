import { READ_SET_VERSION, type DiscIdentity } from '@s2u/archive';
import type { CopyStorage } from './discCopy';
import type { DiscExtractFile, DiscExtractRecord, ExtractEnv, ExtractionState } from './discExtract';
import { ExtractedAssetSource } from './discExtractSource';
import { ExtractStoreError, idbExtractStore, opfsExtractStore, type ExtractBackend, type ExtractStore } from './discExtractStore';
import { DISC_EXTRACT_SLOT, pageIndexedDb, pageOriginStorage, pageRecords, type RecordStore } from './pageStore';

/**
 * **The extraction's record, read** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1 / DX-3,
 * FI.R6): what a start reads of the kept extraction -- its record (`storedExtraction`), its cheap state
 * (`extractionState`), and the source over it (`openExtractedSource`) -- apart from the extraction itself
 * (`./discExtract`, its worker, its hash), so that a start from storage, the map and movie workers' `stored` source
 * (`./discStored`) and a launcher visit already `whole` load none of the writer (DX-2's review F5). Moved here from
 * `./discExtract` unchanged, which re-exports each by its name. A browser adaptation (FI.R2, DA.R3): nothing of the game.
 */

export const storageOf = (env: ExtractEnv): CopyStorage | null =>
  env.storage === undefined ? (pageOriginStorage() as unknown as CopyStorage | null) : env.storage;
export const idbOf = (env: ExtractEnv): (() => IDBFactory | null | undefined) => env.idb ?? pageIndexedDb;

/** The store of `backend` for the directory `dir`. */
export function openStore(backend: ExtractBackend, dir: string, env: ExtractEnv): ExtractStore {
  if (backend === 'indexeddb') return idbExtractStore(idbOf(env), dir);
  const storage = storageOf(env);
  if (!storage) throw new ExtractStoreError('unavailable', 'this browser offers no origin private file system');
  return opfsExtractStore(() => storage.getDirectory(), dir);
}

/** The kept extraction's record, or null: none, or a record of another shape (nothing this version wrote). */
export async function storedExtraction(records: RecordStore = pageRecords()): Promise<DiscExtractRecord | null> {
  const r = (await records.get(DISC_EXTRACT_SLOT)) as Partial<DiscExtractRecord> | undefined;
  if (!r || typeof r !== 'object') return null;
  const i = r.identity as Partial<DiscIdentity> | undefined;
  const ok = r.v === 1 && typeof r.readSet === 'number' && !!i && typeof i.boot === 'string'
    && (r.backend === 'opfs' || r.backend === 'indexeddb') && typeof r.dir === 'string' && r.dir !== ''
    && Array.isArray(r.files) && r.files.every((f: Partial<DiscExtractFile>) => typeof f?.path === 'string'
      && typeof f.size === 'number' && typeof f.done === 'boolean' && (f.sha256 === null || typeof f.sha256 === 'string'))
    && typeof r.total === 'number' && typeof r.persisted === 'boolean' && typeof r.started === 'number'
    && (r.when === null || typeof r.when === 'number');
  return ok ? (r as DiscExtractRecord) : null;
}

/**
 * The extraction's state, for the start path (DX-3): `none` (no record), `whole` (every file done, each stored at its
 * recorded size), `evicted` (a record whose files are gone: the browser cleared or evicted the storage -- every file
 * recorded done is absent, or the backend itself is), else `partial` (resumable, or made under another read set's
 * version: made again). The cheap check only: sizes, no hash.
 */
export async function extractionState(env: ExtractEnv = {}): Promise<ExtractionState> {
  const record = await storedExtraction(env.records ?? pageRecords());
  if (!record) return 'none';
  // DX-1's review F1: an extraction of another read set (`READ_SET_VERSION`) is not this page's whole set -- `partial`, so
  // the start path asks for the disc and `extractDisc` makes it again (its `sameExtraction` refuses the old version).
  if (record.readSet !== READ_SET_VERSION) return 'partial';
  let store: ExtractStore;
  try { store = openStore(record.backend, record.dir, env); } catch { return 'evicted'; }
  const done = record.files.filter((f) => f.done);
  let present = 0;
  let whole = 0;
  for (const f of done) {
    let n: number | null;
    try { n = await store.size(f.path); } catch { n = null; }
    if (n !== null) present++;
    if (n === f.size) whole++;
  }
  if (done.length > 0 && present === 0) return 'evicted';
  return done.length === record.files.length && whole === done.length ? 'whole' : 'partial';
}

/** The kept extraction as a source (`./discExtractSource`), or null when none is recorded. Its misses are DX-3's to handle. */
export async function openExtractedSource(env: ExtractEnv = {}): Promise<ExtractedAssetSource | null> {
  const record = await storedExtraction(env.records ?? pageRecords());
  if (!record) return null;
  return new ExtractedAssetSource(record, openStore(record.backend, record.dir, env));
}
