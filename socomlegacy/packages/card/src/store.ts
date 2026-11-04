/**
 * A browser storage abstraction (PLAT-24; MISSION R7, which replaced R4; research 99 §1).
 *
 * `ByteStore` is PLAT-24's interface: named binary values, asynchronous, large. It was written for R4's card (a `.ps2`
 * image per slot); under R7 it is **parked** -- built and tested, not under the card. PLAT-25's `CardSlots`
 * (`./cardSlots`) keeps each slot as one versioned JSON record on localStorage, through a storage getter as `Settings`
 * takes one, and uses no `ByteStore`; OPT-01's save reaches the card through PLAT-25 and PLAT-26. What stands on a
 * `ByteStore` today is `migrateOnce` (`./migrate`) and the tests. Two promises hold for every backend:
 *
 * - **A store that cannot be read reads as nothing there.** `get` and `keys` never reject: a store that will not open,
 *   a read that throws, a database that is not there yet, all read as nothing there. (Under R7 the card's own answer
 *   to no storage is no card, `./cardSlots`; R4's "an empty card" no longer applies.) The failure is still handed to the
 *   `report` the backend was given, and `read` returns it, for a caller (the migration) that must tell "nothing" from
 *   "could not look".
 * - **A write that fails is reported, never dropped.** `put`, `delete` and `write` reject with a `StoreError` naming
 *   the kind (`quota`, `unavailable`, `failed`, or `conflict` for a conditional write refused), the operation and the
 *   key. The bytes written are the bytes at the call: they are copied before the call returns its promise. A caller that awaits sees it thrown; one
 *   that forgets to await gets an unhandled rejection, which the runtime reports -- there is no silent path. (Compare
 *   the ARMORY's profile write, `packages/viewer/src/armory.ts`, whose guarded store drops a failure: OPT-20 moves it
 *   here.)
 *
 * The package is DOM-free (W6.R2): a backend gets its browser object -- an `IDBFactory`, a `StorageManager` -- from
 * its constructor, and the viewer passes the real one (`packages/viewer/src/pageStore.ts`).
 */

/**
 * Why a store operation failed: the browser's quota, a store this page may not use or open, a conditional write whose
 * precondition did not hold (`conflict`: the store is as it was, and nothing is wrong with it), or anything else.
 */
export type StoreFailure = 'quota' | 'unavailable' | 'failed' | 'conflict';

/** Which operation failed. `open` is the store's own opening, met by whichever call came first. */
export type StoreOperation = 'open' | 'get' | 'list' | 'write' | 'delete' | 'estimate';

/** A failed store operation: what kind, where, and the browser's own error as its `cause`. */
export class StoreError extends Error {
  override readonly name = 'StoreError';

  constructor(
    readonly kind: StoreFailure,
    readonly operation: StoreOperation,
    readonly key: string | undefined,
    cause?: unknown,
  ) {
    super(`store ${operation}${key === undefined ? '' : ' of "' + key + '"'} failed (${kind})`, { cause });
  }
}

/**
 * The legacy codes of a quota refusal: 22 is `QUOTA_EXCEEDED_ERR`, the `DOMException` code the WebIDL standard keeps for
 * `QuotaExceededError` (WebIDL, "DOMException names", the legacy code column), which old Safari threw under another
 * name; 1014 is Firefox's legacy `NS_ERROR_DOM_QUOTA_REACHED` (MDN, "Using the Web Storage API", `storageAvailable`,
 * which tests `code === 22 || code === 1014` and both names for the same reason).
 */
const QUOTA_CODES: ReadonlySet<number> = new Set([22, 1014]);

/**
 * The kind of a thrown browser error, by its `name` (a `DOMException`'s) and, for the quota, its legacy `code`:
 * `QuotaExceededError` / `NS_ERROR_DOM_QUOTA_REACHED` or code 22 / 1014 is the quota; `SecurityError` (storage refused to
 * this origin or window), `InvalidStateError` (a closed or closing database) and `VersionError` (a database newer than
 * this code) mean this store cannot be used; the rest are plain failures. Never `conflict` (only a precondition is).
 */
export function classifyFailure(error: unknown): StoreFailure {
  const e = typeof error === 'object' && error !== null ? (error as { name?: unknown; code?: unknown }) : {};
  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota';
  if (typeof e.code === 'number' && QUOTA_CODES.has(e.code)) return 'quota';
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'VersionError') return 'unavailable';
  return 'failed';
}

/** Wraps any thrown value as a `StoreError` (an existing one passes through unchanged). */
export function storeError(operation: StoreOperation, key: string | undefined, error: unknown): StoreError {
  return error instanceof StoreError ? error : new StoreError(classifyFailure(error), operation, key, error);
}

/** One step of an atomic batch: a value put under a key, or a key deleted. */
export type StoreOp = { readonly put: string; readonly value: Uint8Array } | { readonly delete: string };

/**
 * A condition a conditional write checks inside its own transaction: the key holds nothing, or exactly these bytes.
 * When any fails, the whole batch is refused as a `conflict` naming that key (R4's slot swap "only if the pointer is
 * still the generation I read", parked with it; `migrateOnce`'s "only if no other tab has run").
 */
export type Precondition = { readonly key: string; readonly absent: true } | { readonly key: string; readonly equals: Uint8Array };

/** A read that says why it has nothing: `ok` with the value (or `undefined`, nothing there), or the failure. */
export type ReadResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: StoreError };

/** What the browser says of its storage (`StorageManager.estimate()`), in bytes. */
export interface StoreEstimate {
  readonly usage: number;
  readonly quota: number;
}

/** The part of the browser's `StorageManager` a store asks for its quota. */
export type QuotaSource = Pick<StorageManager, 'estimate'>;

/** Where a store hands the failures its reads absorb (a read never rejects; see the header). */
export type FailureReport = (error: StoreError) => void;

/** Named binary values, asynchronous: the card's storage (the header gives the two promises). */
export interface ByteStore {
  /** The value under `key`, or `undefined` -- for nothing there and for a store that cannot be read alike. */
  get(key: string): Promise<Uint8Array | undefined>;
  /** As `get`, but a failure is returned rather than read as nothing there. Never rejects. */
  read(key: string): Promise<ReadResult<Uint8Array | undefined>>;
  /** The keys that start with `prefix` (all when none), sorted; `[]` when the store cannot be read. */
  keys(prefix?: string): Promise<string[]>;
  /** Puts `value` (a copy: the caller may go on changing its array). Rejects with a `StoreError`. */
  put(key: string, value: Uint8Array): Promise<void>;
  /** Deletes `key`; nothing there is no failure. Rejects with a `StoreError`. */
  delete(key: string): Promise<void>;
  /**
   * The values under `keys`, in order (`undefined` for nothing there), read in **one transaction**: a batch written
   * beside it is seen whole or not at all (R4's slot read a pointer and its chunks together). Never rejects.
   */
  readMany(keys: readonly string[]): Promise<ReadResult<(Uint8Array | undefined)[]>>;
  /**
   * Applies every op or none (one transaction), only if every precondition in `when` holds in that same transaction.
   * The values are copied before the promise is returned. Resolves once the transaction has committed; rejects with a
   * `StoreError` (`conflict` when a precondition failed), the store as it was.
   */
  write(ops: readonly StoreOp[], when?: readonly Precondition[]): Promise<void>;
  /** The browser's usage and quota, or `undefined` when it gives none (no `StorageManager`, or it threw). */
  estimate(): Promise<StoreEstimate | undefined>;
}

/** The bytes of `value` alone, in an array of their own (a view into a larger buffer would carry the whole buffer). */
export function ownCopy(value: Uint8Array): Uint8Array {
  return value.slice();
}

/** Whether two byte arrays hold the same bytes. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether `precondition` holds of `value` (the key's current value, or `undefined`). */
export function holds(precondition: Precondition, value: Uint8Array | undefined): boolean {
  return 'absent' in precondition ? value === undefined : value !== undefined && equalBytes(value, precondition.equals);
}

/** A batch checked and copied: what a backend applies, independent of the caller's arrays from here on. */
export interface PreparedBatch {
  readonly ops: readonly StoreOp[];
  readonly when: readonly Precondition[];
}

/**
 * Checks a batch and copies its bytes, **synchronously, at the call** (before any `await`), so that a caller who goes
 * on changing its arrays -- R4's working image, say -- cannot change what is written: every key a string, every value
 * a byte array whose bytes can be read. Throws a `StoreError` (`failed`, `write`) when not.
 */
export function prepareBatch(ops: readonly StoreOp[], when: readonly Precondition[] = []): PreparedBatch {
  const copy = (bytes: unknown, key: string): Uint8Array => {
    if (!(bytes instanceof Uint8Array)) throw new StoreError('failed', 'write', key, new TypeError('a store value is a Uint8Array'));
    try {
      return ownCopy(bytes);
    } catch (e) {
      throw new StoreError('failed', 'write', key, e);  // a detached buffer
    }
  };
  const keyOf = (key: unknown): string => {
    if (typeof key !== 'string') throw new StoreError('failed', 'write', undefined, new TypeError('a store key is a string'));
    return key;
  };
  return {
    ops: ops.map((op): StoreOp => {
      if ('put' in op) {
        const key = keyOf(op.put);
        return { put: key, value: copy(op.value, key) };
      }
      return { delete: keyOf(op.delete) };
    }),
    when: when.map((c): Precondition => {
      const key = keyOf(c.key);
      return 'absent' in c ? { key, absent: true } : { key, equals: copy(c.equals, key) };
    }),
  };
}

/** The single key a batch names, for its error (a batch of one is a `put` or a `delete`). */
export function batchKey(ops: readonly StoreOp[]): string | undefined {
  if (ops.length !== 1) return undefined;
  const op = ops[0]!;
  return 'put' in op ? op.put : op.delete;
}

/** Options of the in-memory store: a fault to inject per operation, a quota, and where read failures go. */
export interface MemoryStoreOptions {
  /** Called before each operation on each key it touches; an error returned is thrown there (tests' faults). */
  fail?: (operation: StoreOperation, key: string | undefined) => unknown;
  /** Bytes the store may hold (the sum of its values); a write past it is refused whole as `quota`. */
  quota?: number;
  report?: FailureReport;
}

/**
 * A `ByteStore` in this page's memory: the tests' store (with faults and a quota to inject), and the store of a page
 * whose browser gives none, should a later task choose that (OPT-07's open call).
 */
export class MemoryStore implements ByteStore {
  private readonly data = new Map<string, Uint8Array>();

  constructor(private readonly options: MemoryStoreOptions = {}) {}

  private fault(operation: StoreOperation, key: string | undefined): void {
    const error = this.options.fail?.(operation, key);
    if (error !== undefined) throw error;
  }

  async read(key: string): Promise<ReadResult<Uint8Array | undefined>> {
    try {
      this.fault('get', key);
      const value = this.data.get(key);
      return { ok: true, value: value && ownCopy(value) };
    } catch (e) {
      return { ok: false, error: storeError('get', key, e) };
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const r = await this.read(key);
    if (r.ok) return r.value;
    this.options.report?.(r.error);
    return undefined;
  }

  async readMany(keys: readonly string[]): Promise<ReadResult<(Uint8Array | undefined)[]>> {
    const out: (Uint8Array | undefined)[] = [];
    for (const key of keys) {
      try {
        this.fault('get', key);
      } catch (e) {
        return { ok: false, error: storeError('get', key, e) };
      }
      const value = this.data.get(key);
      out.push(value && ownCopy(value));
    }
    return { ok: true, value: out };
  }

  async keys(prefix = ''): Promise<string[]> {
    try {
      this.fault('list', undefined);
      return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
    } catch (e) {
      this.options.report?.(storeError('list', undefined, e));
      return [];
    }
  }

  put(key: string, value: Uint8Array): Promise<void> {
    return this.write([{ put: key, value }]);
  }

  delete(key: string): Promise<void> {
    return this.write([{ delete: key }]);
  }

  write(ops: readonly StoreOp[], when?: readonly Precondition[]): Promise<void> {
    try {
      this.apply(prepareBatch(ops, when), batchKey(ops));
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(storeError('write', batchKey(ops), e));
    }
  }

  /** Applies a prepared batch at once (this page's memory: one step is one transaction). */
  private apply(batch: PreparedBatch, batchKeyName: string | undefined): void {
    for (const c of batch.when) {
      const current: unknown = this.data.get(c.key);
      if (current !== undefined && !(current instanceof Uint8Array)) {
        throw new StoreError('failed', 'write', c.key, new TypeError('the precondition key holds no bytes'));   // corruption
      }
      if (!holds(c, this.data.get(c.key))) throw new StoreError('conflict', 'write', c.key, new Error('a precondition failed'));
    }
    const next = new Map(this.data);
    for (const op of batch.ops) {
      const key = 'put' in op ? op.put : op.delete;
      try {
        this.fault('write', key);
      } catch (e) {
        throw storeError('write', key, e);
      }
      if ('put' in op) next.set(key, op.value);
      else next.delete(key);
    }
    if (this.options.quota !== undefined && usage(next) > this.options.quota) {
      throw new StoreError('quota', 'write', batchKeyName, new RangeError(`past the quota of ${this.options.quota} B`));
    }
    this.data.clear();
    for (const [k, v] of next) this.data.set(k, v);
  }

  async estimate(): Promise<StoreEstimate | undefined> {
    return this.options.quota === undefined ? undefined : { usage: usage(this.data), quota: this.options.quota };
  }
}

function usage(data: ReadonlyMap<string, Uint8Array>): number {
  let n = 0;
  for (const v of data.values()) n += v.byteLength;
  return n;
}
