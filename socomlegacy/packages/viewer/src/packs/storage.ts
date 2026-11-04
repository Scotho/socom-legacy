/** Product adaptation: one browser-local transaction boundary for pack bytes, choices and generations. */
import type { PackRef } from '@s2u/creator-contracts';
export const PACKS_DB = 's2u-packs';
export const PACKS_SCOPES = 'scopes';
export const PACKS_RECOVERY = 'recovery';
export const PACKS_BYTES = 'bytes';
export const PACKS_MIGRATIONS = 'migrations';
/** Browser adaptations: renew every 30s with one missed-heartbeat margin; reclaim only after 10 minutes expired. */
export const PACK_MIGRATION_RENEW_MS_ADAPTATION = 30_000;
export const PACK_MIGRATION_LEASE_MS_ADAPTATION = 2 * PACK_MIGRATION_RENEW_MS_ADAPTATION;
export const PACK_MIGRATION_RECLAIM_MS_ADAPTATION = 10 * 60_000;
export type PackStoreKind = 'mods' | 'models' | 'textures' | 'packs';
export interface PackScope<T> { kind: PackStoreKind; generation: number; data: T }
export interface PackMetadata { kind: PackStoreKind; generation: number; data: unknown;
  binary: readonly { path: readonly (string | number)[]; byteLength: number }[] }
export interface PackFence { kind: PackStoreKind; generation: number; path: readonly (string | number)[]; ref: PackRef }
export interface PackWriteOptions { expectedGeneration?: number; signal?: AbortSignal; dependencies?: readonly PackFence[] }
declare const storedBinary: unique symbol;
/** Opaque within a metadata edit; a byte reference can only be retained, moved or removed. */
export interface StoredBinary { readonly [storedBinary]: true; readonly byteLength: number }
export type StoredData<T> = T extends ArrayBuffer | Uint8Array ? T | StoredBinary
  : T extends (infer U)[] ? StoredData<U>[] : T extends readonly (infer U)[] ? readonly StoredData<U>[]
  : T extends object ? { [K in keyof T]: StoredData<T[K]> } : T;
export type PackMigrationPart = { type: 'bytes'; path: (string | number)[]; bytes: Uint8Array | ArrayBuffer }
  | { type: 'metadata'; data: unknown };
export class PackStorageError extends Error {
  constructor(readonly code: 'ABORTED' | 'CONFLICT' | 'UNAVAILABLE' | 'FAILED' | 'QUOTA', message: string) {
    super(message); this.name = 'PackStorageError';
  }
}
export class PackDependencyChanged extends PackStorageError {
  constructor(readonly ref: PackRef) { super('CONFLICT', 'A pack dependency changed before publication.'); this.name = 'PackDependencyChanged'; }
}
const boundaries = new WeakMap<PackDatabase, () => IDBFactory | null | undefined>();
/** Only actual common-DB adapters can attest that their observations can share a publication transaction. */
export function sharesPackDatabase(a: PackDatabase, b: PackDatabase): boolean {
  try { const one = boundaries.get(a)?.(), two = boundaries.get(b)?.(); return !!one && one === two; } catch { return false; }
}
export interface PackDatabase {
  /** Metadata only: binary members are null, so boot can inspect a model plan without loading its GLBs. */
  peek(kind: PackStoreKind): Promise<PackMetadata | null>;
  read<T>(kind: PackStoreKind, legacy: () => Promise<T>, signal?: AbortSignal): Promise<PackScope<T>>;
  update<T>(kind: PackStoreKind, legacy: () => Promise<T>, edit: (data: T) => T,
    options?: { expectedGeneration?: number; signal?: AbortSignal }): Promise<PackScope<T>>;
  patch<T>(kind: PackStoreKind, legacy: () => Promise<T>, edit: (data: StoredData<T>) => StoredData<T>,
    options?: PackWriteOptions): Promise<{ kind: PackStoreKind; generation: number }>;
  readAt<T>(kind: PackStoreKind, path: readonly (string | number)[], signal?: AbortSignal): Promise<PackScope<T> | null>;
  /** Bounded snapshot byte records. An identity writer must still CAS the observed scope generation after validation. */
  streamAt(kind: PackStoreKind, path: readonly (string | number)[],
    options?: { expectedGeneration?: number; signal?: AbortSignal }): AsyncIterable<Uint8Array>;
  migrate(kind: PackStoreKind, source: () => AsyncIterable<PackMigrationPart>, signal?: AbortSignal): Promise<void>;
  reclaim(kind: PackStoreKind): Promise<number>;
}
/** Browser adaptation: the model loader already bounds each binary IDB value to 32 MiB (Chromium's value cap). */
export const PACK_BYTE_RECORD_LIMIT = 32 * 1024 * 1024;
interface BinaryMember { path: (string | number)[]; keys: string[]; length: number; view: 'buffer' | 'uint8' }
interface StoredScope { kind: PackStoreKind; generation: number; data: unknown; binary: BinaryMember[] }
interface MigrationJob { nonce: string; kind: PackStoreKind; owner: string; leaseUntil: number; keys: string[] }
const binaryReferences = new WeakSet<object>();
function atPath(data: unknown, path: readonly (string | number)[], value: unknown): unknown {
  if (!path.length) return value;
  let parent = data as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as typeof parent;
  parent[path[path.length - 1]!] = value;
  return data;
}
const aborted = (): PackStorageError => new PackStorageError('ABORTED', 'The pack transaction was cancelled.');
function storageError(error: unknown): PackStorageError {
  if (error instanceof PackStorageError) return error;
  const e = error as { name?: string; code?: number; message?: string } | null;
  if (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014)
    return new PackStorageError('QUOTA', 'This browser has no room left to keep the pack.');
  return new PackStorageError('FAILED', e?.message || 'The pack transaction could not complete.');
}
function check(signal?: AbortSignal): void { if (signal?.aborted) throw aborted(); }
function cancellable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const cancel = (): void => reject(aborted());
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

/**
 * All owned stores share this DB. A scope's metadata, binary records and generation publish in one transaction.
 * Streamed migration publishes immutable chunk references shared with recovery; regular writes keep separate copies.
 * Transactions use request callbacks only: no hash, file read or other await can make an IDB transaction inactive.
 */
export function idbPackDatabase(factory: () => IDBFactory | null | undefined,
  options: { openTimeoutMs?: number; byteRecordLimit?: number; now?: () => number; owner?: string } = {}): PackDatabase {
  const limit = options.byteRecordLimit ?? PACK_BYTE_RECORD_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > PACK_BYTE_RECORD_LIMIT) throw new RangeError('Invalid pack byte-record bound.');
  const open = (signal?: AbortSignal): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    let settled = false;
    const cancel = (): void => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal?.removeEventListener('abort', cancel); reject(aborted());
    };
    const fail = (reason: string): void => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new PackStorageError('UNAVAILABLE', reason));
    };
    const timer = setTimeout(() => fail('the pack store did not open in time'), options.openTimeoutMs ?? 5000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    let request: IDBOpenDBRequest;
    try {
      const idb = factory();
      if (!idb) { fail('no IndexedDB in this browser'); return; }
      request = idb.open(PACKS_DB, 1);
    } catch (e) { fail(e instanceof Error ? e.message : 'the pack store could not open'); return; }
    request.onupgradeneeded = () => {
      for (const name of [PACKS_SCOPES, PACKS_RECOVERY, PACKS_BYTES, PACKS_MIGRATIONS])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); resolve(request.result);
    };
    request.onerror = () => fail(request.error?.message || 'the pack store could not open');
    request.onblocked = () => fail('another tab holds an older version of the pack store');
  });
  const transaction = async <T>(mode: IDBTransactionMode, stores: string[], signal: AbortSignal | undefined,
    work: (tx: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> => {
    check(signal);
    const db = await open(signal);
    try {
      check(signal);
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let value: T, supplied = false, failure: PackStorageError | undefined;
        const cancel = (): void => fail(aborted());
        const clean = (): void => signal?.removeEventListener('abort', cancel);
        const fail = (error: unknown): void => {
          failure ??= storageError(error);
          try { tx.abort(); } catch { clean(); reject(failure); }
        };
        tx.oncomplete = () => {
          clean();
          if (failure) reject(failure);
          else if (!supplied) reject(new PackStorageError('FAILED', 'The pack transaction returned no result.'));
          else resolve(value);
        };
        tx.onabort = () => { clean(); reject(failure ?? storageError(tx.error)); };
        tx.onerror = event => { failure ??= storageError((event.target as IDBRequest).error ?? tx.error); };
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) { cancel(); return; }
        try { work(tx, next => { value = next; supplied = true; }, fail); } catch (e) { fail(e); }
      });
    } finally { db.close(); }
  };
  const write = (tx: IDBTransaction, kind: PackStoreKind, generation: number, data: unknown, recovery = false,
    retained?: WeakMap<object, BinaryMember>): StoredScope => {
    const binary: BinaryMember[] = [];
    const visit = (value: unknown, path: (string | number)[]): unknown => {
      if (value && typeof value === 'object' && binaryReferences.has(value)) {
        const member = retained?.get(value);
        if (!member) throw new PackStorageError('FAILED', 'A byte reference belongs to a different pack transaction.');
        binary.push({ ...member, path, keys: [...member.keys] }); return null;
      }
      if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
        const member: BinaryMember = { path, length: bytes.byteLength, keys: [], view: value instanceof Uint8Array ? 'uint8' : 'buffer' };
        const prefix = `${kind}/${recovery ? 'recovery' : generation}/${binary.length}`;
        for (let offset = 0; offset < bytes.length; offset += limit) {
          const key = `${prefix}/${member.keys.length}`;
          const chunk = new Uint8Array(Math.min(limit, bytes.length - offset));
          chunk.set(bytes.subarray(offset, offset + chunk.length));
          tx.objectStore(PACKS_BYTES).put(chunk.buffer, key);
          member.keys.push(key);
        }
        binary.push(member); return null;
      }
      if (Array.isArray(value)) return value.map((entry, index) => visit(entry, [...path, index]));
      if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
        const result: Record<string, unknown> = Object.create(null);
        for (const [key, entry] of Object.entries(value)) result[key] = visit(entry, [...path, key]);
        return result;
      }
      // Opaque structured-cloneable folder handles are preserved without requesting access or inspecting files.
      return value;
    };
    const record: StoredScope = { kind, generation, data: visit(data, []), binary };
    tx.objectStore(recovery ? PACKS_RECOVERY : PACKS_SCOPES).put(record, kind);
    return record;
  };
  const hydrate = <T>(record: StoredScope, tx: IDBTransaction, done: (value: PackScope<T>) => void, fail: (error: unknown) => void): void => {
    let data = record.data;
    let pending = record.binary.reduce((count, member) => count + member.keys.length, 0);
    const finish = (): void => done({ kind: record.kind, generation: record.generation, data: data as T });
    const place = (member: BinaryMember, bytes: Uint8Array): void => {
      const value = member.view === 'buffer' ? bytes.buffer : bytes;
      data = atPath(data, member.path, value);
    };
    for (const member of record.binary) {
      const parts: ArrayBuffer[] = new Array(member.keys.length);
      if (!member.keys.length) { place(member, new Uint8Array(0)); continue; }
      let left = member.keys.length;
      member.keys.forEach((key, index) => {
        const request = tx.objectStore(PACKS_BYTES).get(key);
        request.onsuccess = () => {
          try {
            if (!(request.result instanceof ArrayBuffer)) throw new PackStorageError('FAILED', 'A stored pack byte record is missing.');
            parts[index] = request.result; left--; pending--;
            if (!left) {
              const size = parts.reduce((total, part) => total + part.byteLength, 0);
              if (size !== member.length) throw new PackStorageError('FAILED', 'A stored pack byte record is incomplete.');
              const bytes = parts.length === 1 ? new Uint8Array(parts[0]!) : new Uint8Array(member.length);
              if (parts.length !== 1) {
                let offset = 0;
                for (const part of parts) { bytes.set(new Uint8Array(part), offset); offset += part.byteLength; }
              }
              place(member, bytes);
            }
            if (!pending) finish();
          } catch (e) { fail(e); }
        };
      });
    }
    if (!pending) finish();
  };
  const current = <T>(kind: PackStoreKind, signal?: AbortSignal): Promise<PackScope<T> | null> =>
    transaction('readonly', [PACKS_SCOPES, PACKS_BYTES], signal, (tx, result, fail) => {
      const request = tx.objectStore(PACKS_SCOPES).get(kind);
      request.onsuccess = () => request.result ? hydrate<T>(request.result as StoredScope, tx, result, fail) : result(null);
    });
  const read = async <T>(kind: PackStoreKind, legacy: () => Promise<T>, signal?: AbortSignal): Promise<PackScope<T>> => {
    const found = await current<T>(kind, signal);
    if (found) return found;
    const data = await cancellable(Promise.resolve().then(legacy), signal);
    check(signal);
    return transaction('readwrite', [PACKS_SCOPES, PACKS_RECOVERY, PACKS_BYTES], signal, (tx, result, fail) => {
      const request = tx.objectStore(PACKS_SCOPES).get(kind);
      request.onsuccess = () => {
        try {
          if (request.result) { hydrate<T>(request.result as StoredScope, tx, result, fail); return; }
          write(tx, kind, 0, data, true);
          const record = write(tx, kind, 0, data);
          hydrate<T>(record, tx, result, fail);
        } catch (e) { fail(e); }
      };
    });
  };
  const peek = (kind: PackStoreKind): Promise<PackMetadata | null> =>
    transaction('readonly', [PACKS_SCOPES], undefined, (tx, result) => {
      const request = tx.objectStore(PACKS_SCOPES).get(kind);
      request.onsuccess = () => {
        const record = request.result as StoredScope | undefined;
        result(record ? { kind: record.kind, generation: record.generation, data: record.data,
          binary: record.binary.map(member => ({ path: [...member.path], byteLength: member.length })) } : null);
      };
    });
  const now = options.now ?? Date.now;
  const identity = (): string => globalThis.crypto.randomUUID();
  const owner = options.owner ?? identity();
  const conflict = (): PackStorageError => new PackStorageError('CONFLICT', 'The pack migration lease changed; retry with current storage.');
  // Cleanup scans metadata only. No byte record is fetched and every reference is checked in the deletion transaction.
  const cleanup = (kind: PackStoreKind, nonce?: string): Promise<number> =>
    transaction('readwrite', [PACKS_SCOPES, PACKS_RECOVERY, PACKS_BYTES, PACKS_MIGRATIONS], undefined, (tx, result, fail) => {
      const scopes = tx.objectStore(PACKS_SCOPES).getAll(), recovery = tx.objectStore(PACKS_RECOVERY).getAll();
      const jobs = tx.objectStore(PACKS_MIGRATIONS).getAll();
      let remaining = 3;
      const ready = (): void => {
        if (--remaining) return;
        try {
          const records = [...scopes.result, ...recovery.result] as StoredScope[];
          const referenced = new Set(records.flatMap(record => record.binary.flatMap(member => member.keys)));
          let removed = 0;
          for (const job of jobs.result as MigrationJob[]) {
            if (job.kind !== kind) continue;
            if (nonce ? job.nonce !== nonce || job.owner !== owner : !Number.isFinite(job.leaseUntil)
              || job.leaseUntil >= now() - PACK_MIGRATION_RECLAIM_MS_ADAPTATION) continue;
            if (!nonce) {
              // Fence even a first-ever migration crash: expiry, references, ownership and deletion share this tx.
              tx.objectStore(PACKS_MIGRATIONS).put({ ...job, owner, leaseUntil: now() + PACK_MIGRATION_LEASE_MS_ADAPTATION }, job.nonce);
            }
            const prefix = `migration/${kind}/${job.nonce}/`;
            for (const key of job.keys) if (typeof key === 'string' && key.startsWith(prefix) && !referenced.has(key))
              tx.objectStore(PACKS_BYTES).delete(key);
            tx.objectStore(PACKS_MIGRATIONS).delete(job.nonce); removed++;
          }
          result(removed);
        } catch (e) { fail(e); }
      };
      scopes.onsuccess = recovery.onsuccess = jobs.onsuccess = ready;
    });
  const migrate = async (kind: PackStoreKind, source: () => AsyncIterable<PackMigrationPart>, signal?: AbortSignal): Promise<void> => {
    check(signal);
    await cleanup(kind);
    check(signal);
    if (await peek(kind)) return;
    const nonce = identity(), binary: BinaryMember[] = [];
    const job: MigrationJob = { nonce, kind, owner, leaseUntil: now() + PACK_MIGRATION_LEASE_MS_ADAPTATION, keys: [] };
    await transaction('readwrite', [PACKS_MIGRATIONS], signal, (tx, result) => {
      tx.objectStore(PACKS_MIGRATIONS).put(job, nonce); result(undefined);
    });
    let leaseFailure: unknown, rejectLease!: (reason: unknown) => void;
    const leaseLost = new Promise<never>((_, reject) => { rejectLease = reject; });
    // Attach immediately, including while a source is paused on its next legacy cursor.
    void leaseLost.catch(() => undefined);
    let renewing: Promise<void> | undefined;
    const ownedWrite = (writeChunk?: { key: string; bytes: ArrayBuffer }): Promise<void> =>
      transaction('readwrite', [PACKS_MIGRATIONS, ...(writeChunk ? [PACKS_BYTES] : [])], signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_MIGRATIONS).get(nonce);
        get.onsuccess = () => {
          try {
            const live = get.result as MigrationJob | undefined;
            if (!live || live.owner !== owner || live.leaseUntil < now()) throw conflict();
            live.leaseUntil = now() + PACK_MIGRATION_LEASE_MS_ADAPTATION;
            if (writeChunk) { tx.objectStore(PACKS_BYTES).put(writeChunk.bytes, writeChunk.key); live.keys.push(writeChunk.key); }
            tx.objectStore(PACKS_MIGRATIONS).put(live, nonce); result(undefined);
          } catch (e) { fail(e); }
        };
      });
    const timer = setInterval(() => {
      if (renewing || leaseFailure) return;
      renewing = ownedWrite().catch(error => { leaseFailure = error; rejectLease(error); }).finally(() => { renewing = undefined; });
    }, PACK_MIGRATION_RENEW_MS_ADAPTATION);
    let metadata: unknown, hasMetadata = false;
    const paths = new Set<string>();
    try {
      const iterator = source()[Symbol.asyncIterator]();
      for (;;) {
        check(signal);
        if (leaseFailure) throw leaseFailure;
        const next = await cancellable(Promise.race([iterator.next(), leaseLost]), signal);
        if (next.done) break;
        const part = next.value;
        if (hasMetadata) throw new PackStorageError('FAILED', 'Migration metadata must be the final source record.');
        if (part.type === 'metadata') { metadata = part.data; hasMetadata = true; continue; }
        if (!Array.isArray(part.path) || part.path.some(key => typeof key !== 'string' && (!Number.isSafeInteger(key) || key < 0)))
          throw new PackStorageError('FAILED', 'Invalid migration byte path.');
        const path = JSON.stringify(part.path);
        if (paths.has(path)) throw new PackStorageError('FAILED', 'A migration byte path was repeated.');
        paths.add(path);
        const bytes = part.bytes instanceof Uint8Array ? part.bytes : new Uint8Array(part.bytes);
        const member: BinaryMember = { path: [...part.path], keys: [], length: bytes.byteLength,
          view: part.bytes instanceof Uint8Array ? 'uint8' : 'buffer' };
        for (let offset = 0; offset < bytes.length; offset += limit) {
          const key = `migration/${kind}/${nonce}/${binary.length}/${member.keys.length}`;
          const chunk = new Uint8Array(Math.min(limit, bytes.length - offset));
          chunk.set(bytes.subarray(offset, offset + chunk.length));
          // Each bounded chunk commits before advancing the source cursor or allocating another chunk.
          await ownedWrite({ key, bytes: chunk.buffer }); member.keys.push(key);
        }
        binary.push(member);
      }
      if (!hasMetadata) throw new PackStorageError('FAILED', 'The pack migration returned no metadata.');
      const noBytes = (value: unknown): void => {
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new PackStorageError('FAILED', 'Migration metadata contains unstaged bytes.');
        if (Array.isArray(value)) value.forEach(noBytes);
        else if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
          Object.values(value).forEach(noBytes);
      };
      noBytes(metadata);
      for (const member of binary) {
        let value = metadata;
        for (const key of member.path) {
          if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key))
            throw new PackStorageError('FAILED', 'Migration metadata lost a byte position.');
          value = (value as Record<string | number, unknown>)[key];
        }
        if (value !== null) throw new PackStorageError('FAILED', 'A migration byte position must be null in metadata.');
      }
      clearInterval(timer); await renewing;
      if (leaseFailure) throw leaseFailure;
      await transaction('readwrite', [PACKS_SCOPES, PACKS_RECOVERY, PACKS_MIGRATIONS], signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_SCOPES).get(kind);
        get.onsuccess = () => {
          if (get.result) { result(undefined); return; }
          const lease = tx.objectStore(PACKS_MIGRATIONS).get(nonce);
          lease.onsuccess = () => {
            try {
              const live = lease.result as MigrationJob | undefined;
              if (!live || live.owner !== owner || live.leaseUntil < now()) throw conflict();
              const record: StoredScope = { kind, generation: 0, data: metadata, binary };
              tx.objectStore(PACKS_RECOVERY).put(record, kind);
              tx.objectStore(PACKS_SCOPES).put(record, kind);
              tx.objectStore(PACKS_MIGRATIONS).delete(nonce); result(undefined);
            } catch (e) { fail(e); }
          };
        };
      });
    } finally {
      clearInterval(timer); await renewing;
      // Leave a failed cleanup lease for later reclaim; never turn a committed result into a false failure.
      await cleanup(kind, nonce).catch(() => undefined);
    }
  };
  const fence = (tx: IDBTransaction, dependencies: readonly PackFence[], done: () => void, fail: (error: unknown) => void): void => {
    if (!dependencies.length) { done(); return; }
    let pending = dependencies.length, refused = false;
    for (const dependency of dependencies) {
      const get = tx.objectStore(PACKS_SCOPES).get(dependency.kind);
      get.onsuccess = () => {
        if (refused) return;
        const scope = get.result as StoredScope | undefined;
        let value = scope?.data;
        for (const key of dependency.path) value = value && typeof value === 'object'
          ? (value as Record<string | number, unknown>)[key] : undefined;
        const ref = value as PackRef | undefined;
        if (!scope || scope.generation !== dependency.generation || !ref || ref.id !== dependency.ref.id
          || ref.version !== dependency.ref.version || ref.hash !== dependency.ref.hash) {
          refused = true; fail(new PackDependencyChanged(dependency.ref)); return;
        }
        if (!--pending) done();
      };
    }
  };
  const database: PackDatabase = {
    peek,
    read,
    async *streamAt(kind: PackStoreKind, path: readonly (string | number)[],
      request: { expectedGeneration?: number; signal?: AbortSignal } = {}) {
      const snapshot = await transaction<StoredScope>('readonly', [PACKS_SCOPES], request.signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_SCOPES).get(kind);
        get.onsuccess = () => {
          const record = get.result as StoredScope | undefined;
          if (!record || request.expectedGeneration !== undefined && record.generation !== request.expectedGeneration) {
            fail(new PackStorageError('CONFLICT', 'The stored packs changed; read their current content again.')); return;
          }
          result(record);
        };
      });
      const member = snapshot.binary.find(value => value.path.length === path.length
        && path.every((key, index) => key === value.path[index]));
      if (!member) throw new PackStorageError('FAILED', 'The stored pack byte member is missing.');
      let length = 0;
      for (const key of member.keys) {
        // Each consumer advance fetches one bounded value. The generation and value are read in the same tx.
        const bytes = await transaction<ArrayBuffer>('readonly', [PACKS_SCOPES, PACKS_BYTES], request.signal, (tx, result, fail) => {
          const live = tx.objectStore(PACKS_SCOPES).get(kind);
          live.onsuccess = () => {
            if ((live.result as StoredScope | undefined)?.generation !== snapshot.generation) {
              fail(new PackStorageError('CONFLICT', 'The stored packs changed during the byte read.')); return;
            }
            const get = tx.objectStore(PACKS_BYTES).get(key);
            get.onsuccess = () => {
              if (!(get.result instanceof ArrayBuffer) || get.result.byteLength > limit) {
                fail(new PackStorageError('FAILED', 'A stored pack byte record is missing or exceeds its bound.')); return;
              }
              result(get.result);
            };
          };
        });
        check(request.signal);
        length += bytes.byteLength;
        if (length > member.length) throw new PackStorageError('FAILED', 'A stored pack byte record is incomplete.');
        yield new Uint8Array(bytes);
      }
      check(request.signal);
      if (length !== member.length) throw new PackStorageError('FAILED', 'A stored pack byte record is incomplete.');
    },
    readAt<T>(kind: PackStoreKind, path: readonly (string | number)[], signal?: AbortSignal) {
      return transaction<PackScope<T> | null>('readonly', [PACKS_SCOPES, PACKS_BYTES], signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_SCOPES).get(kind);
        get.onsuccess = () => {
          try {
            const record = get.result as StoredScope | undefined;
            if (!record) { result(null); return; }
            let data = record.data;
            for (const key of path) data = data == null ? undefined : (data as Record<string | number, unknown>)[key];
            const binary = record.binary.filter(member => path.every((key, index) => key === member.path[index]))
              .map(member => ({ ...member, path: member.path.slice(path.length) }));
            hydrate<T>({ ...record, data, binary }, tx, result, fail);
          } catch (e) { fail(e); }
        };
      });
    },
    migrate,
    reclaim: kind => cleanup(kind),
    async patch<T>(kind: PackStoreKind, legacy: () => Promise<T>, edit: (data: StoredData<T>) => StoredData<T>,
      request: PackWriteOptions = {}) {
      if (!await peek(kind)) await read(kind, legacy, request.signal);
      return transaction('readwrite', [PACKS_SCOPES, PACKS_BYTES], request.signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_SCOPES).get(kind);
        get.onsuccess = () => {
          fence(tx, request.dependencies ?? [], () => {
            try {
              const record = get.result as StoredScope;
              if (request.expectedGeneration !== undefined && request.expectedGeneration !== record.generation)
                throw new PackStorageError('CONFLICT', 'The stored packs changed; their current content was kept.');
              let data = record.data;
              const retained = new WeakMap<object, BinaryMember>();
              for (const member of record.binary) {
                const token = Object.freeze({ byteLength: member.length });
                binaryReferences.add(token); retained.set(token, member);
                data = atPath(data, member.path, token);
              }
              check(request.signal);
              const next = write(tx, kind, record.generation + 1, edit(data as StoredData<T>), false, retained);
              const kept = new Set(next.binary.flatMap(member => member.keys));
              for (const member of record.binary) for (const key of member.keys)
                if (!kept.has(key) && !key.startsWith('migration/')) tx.objectStore(PACKS_BYTES).delete(key);
              result({ kind, generation: next.generation });
            } catch (e) { fail(e); }
          }, fail);
        };
      });
    },
    async update<T>(kind: PackStoreKind, legacy: () => Promise<T>, edit: (data: T) => T,
      request: { expectedGeneration?: number; signal?: AbortSignal } = {}): Promise<PackScope<T>> {
      if (!await peek(kind)) await read(kind, legacy, request.signal);
      return transaction('readwrite', [PACKS_SCOPES, PACKS_BYTES], request.signal, (tx, result, fail) => {
        const get = tx.objectStore(PACKS_SCOPES).get(kind);
        get.onsuccess = () => {
          const record = get.result as StoredScope;
          if (request.expectedGeneration !== undefined && request.expectedGeneration !== record.generation) {
            fail(new PackStorageError('CONFLICT', 'The stored packs changed; their current content was kept.')); return;
          }
          hydrate<T>(record, tx, scope => {
            try {
              check(request.signal);
              const next = write(tx, kind, record.generation + 1, edit(scope.data));
              for (const member of record.binary) for (const key of member.keys)
                if (!key.startsWith('migration/')) tx.objectStore(PACKS_BYTES).delete(key);
              hydrate<T>(next, tx, result, fail);
            } catch (e) { fail(e); }
          }, fail);
        };
      });
    },
  };
  boundaries.set(database, factory);
  return database;
}
