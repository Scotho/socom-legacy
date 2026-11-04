/**
 * An IndexedDB backend for `ByteStore` (PLAT-24; written for MISSION R4 -- IndexedDB, not localStorage -- and **parked**
 * under R7, which replaced R4: built and tested, not wired; the card is PLAT-25's `CardSlots` on localStorage). One
 * database, one object store of `Uint8Array` values under string keys; what the keys mean is the caller's.
 *
 * DOM-free (W6.R2): the `IDBFactory` and the `StorageManager` come in through the constructor; this file never names
 * the browser's globals. A factory that is absent, or whose opening throws, errors, is blocked or outlasts its bound
 * (`openTimer`), reads as nothing there (`./store`'s header), and the next call tries to open again (a private window
 * that refuses storage stays refused; a transient failure heals).
 *
 * One connection at a time (research 99 §1.2): its `close` and `versionchange` handlers act only on the connection they
 * belong to, and a connection that arrives after its opening was given up is closed at once, never leaked.
 */
import {
  batchKey, holds, prepareBatch, storeError, StoreError,
  type ByteStore, type FailureReport, type Precondition, type QuotaSource, type ReadResult, type StoreEstimate,
  type StoreOp,
} from './store';

/** The database's name. Ours, not the game's: nothing of the original is reproduced by it. */
export const CARD_DB_NAME = 's2u.card';
/** The database's schema version: 1, one object store. A later schema bumps it and upgrades in `open`. */
export const CARD_DB_VERSION = 1;
/** The object store holding every value. */
export const CARD_DB_STORE = 'kv';
/**
 * How long an opening may take before the call gives it up as `unavailable`, by the default timer: 10 s. Chosen, not
 * read (an opening normally takes milliseconds; one that waits on another tab's connection may wait for ever).
 */
export const OPEN_TIMEOUT_MS = 10_000;

/**
 * The bound on an opening: arranges for `giveUp` to be called later and returns a cancel. Injected so a test fires it
 * by hand; the default waits `OPEN_TIMEOUT_MS` on the runtime's `setTimeout`.
 */
export type OpenTimer = (giveUp: () => void) => () => void;

const defaultTimer: OpenTimer = (giveUp) => {
  const t = setTimeout(giveUp, OPEN_TIMEOUT_MS);
  return () => clearTimeout(t);
};

export interface IdbStoreOptions {
  /** The database's name (default `CARD_DB_NAME`); a test or a second store passes its own. */
  name?: string;
  /** The browser's `StorageManager` (`navigator.storage`), for `estimate`; none, and the estimate is unknown. */
  quota?: QuotaSource;
  /** Where the failures `get` and `keys` absorb are handed (see `./store`). */
  report?: FailureReport;
  /** The bound on an opening (default: `OPEN_TIMEOUT_MS` on `setTimeout`). */
  openTimer?: OpenTimer;
}

/** Wraps a request's outcome in a promise. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** A stored value as bytes: `undefined` for nothing there, `null` for a value that is not bytes. */
function asBytes(value: unknown): Uint8Array | undefined | null {
  if (value === undefined) return undefined;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

/** A `ByteStore` in IndexedDB. */
export class IdbStore implements ByteStore {
  /** The opening in flight or done, shared by every call; null when none (never opened, failed, closed, dropped). */
  private pending: Promise<IDBDatabase> | null = null;
  /** The connection the store uses now: the only one whose handlers may drop it. */
  private live: IDBDatabase | null = null;
  /** Bumped by `close`, so that an opening that ends after it is not kept. */
  private epoch = 0;
  private readonly name: string;
  private readonly timer: OpenTimer;

  constructor(private readonly factory: IDBFactory | null | undefined, private readonly options: IdbStoreOptions = {}) {
    this.name = options.name ?? CARD_DB_NAME;
    this.timer = options.openTimer ?? defaultTimer;
  }

  /** The open database, opened once and shared; a failed opening is forgotten so that the next call tries again. */
  private open(): Promise<IDBDatabase> {
    if (!this.pending) {
      const p = this.connect();
      this.pending = p;
      p.catch(() => { if (this.pending === p) this.pending = null; });
    }
    return this.pending;
  }

  /** Forgets `db` if it is still the current connection (a stale handler of an older one changes nothing). */
  private drop(db: IDBDatabase): void {
    if (this.live !== db) return;
    this.live = null;
    this.pending = null;
  }

  private connect(): Promise<IDBDatabase> {
    const epoch = this.epoch;
    return new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      let cancel = (): void => undefined;
      const fail = (cause: unknown): void => {
        if (settled) return;
        settled = true;
        cancel();
        reject(new StoreError('unavailable', 'open', undefined, cause));
      };
      if (!this.factory) {
        fail(new TypeError('no IndexedDB in this browser'));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(this.name, CARD_DB_VERSION);
      } catch (e) {
        fail(e);
        return;
      }
      cancel = this.timer(() => fail(new Error('the opening did not end in time')));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CARD_DB_STORE)) db.createObjectStore(CARD_DB_STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled || epoch !== this.epoch) {
          db.close();                                   // given up, or the store closed meanwhile: not leaked
          fail(new Error('the store was closed while it opened'));
          return;
        }
        settled = true;
        cancel();
        this.live = db;
        // Another tab upgrading the schema: let it, and open afresh at the next call.
        db.onversionchange = () => { db.close(); this.drop(db); };
        db.onclose = () => this.drop(db);
        resolve(db);
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('the database is held open at an older version by another tab'));
    });
  }

  /** Closes the connection (the next call opens it again; an opening in flight is not kept). */
  close(): void {
    this.epoch++;
    this.pending = null;
    const db = this.live;
    this.live = null;
    db?.close();
  }

  async read(key: string): Promise<ReadResult<Uint8Array | undefined>> {
    const r = await this.readMany([key]);
    return r.ok ? { ok: true, value: r.value[0] } : r;
  }

  async readMany(keys: readonly string[]): Promise<ReadResult<(Uint8Array | undefined)[]>> {
    if (keys.length === 0) return { ok: true, value: [] };
    let at: string | undefined;
    try {
      const db = await this.open();
      const objects = db.transaction(CARD_DB_STORE, 'readonly').objectStore(CARD_DB_STORE);
      const raw = await Promise.all(keys.map((k) => done(objects.get(k))));   // one transaction, every request at once
      const out: (Uint8Array | undefined)[] = [];
      for (let i = 0; i < keys.length; i++) {
        const v = asBytes(raw[i]);
        if (v === null) {
          at = keys[i];
          throw new TypeError('the value is not bytes');
        }
        out.push(v);
      }
      return { ok: true, value: out };
    } catch (e) {
      if (e instanceof StoreError && e.operation === 'open') return { ok: false, error: e };
      return { ok: false, error: storeError('get', at ?? (keys.length === 1 ? keys[0] : undefined), e) };
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const r = await this.read(key);
    if (r.ok) return r.value;
    this.options.report?.(r.error);
    return undefined;
  }

  async keys(prefix = ''): Promise<string[]> {
    try {
      const db = await this.open();
      const all = await done(db.transaction(CARD_DB_STORE, 'readonly').objectStore(CARD_DB_STORE).getAllKeys());
      return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix)).sort();
    } catch (e) {
      this.options.report?.(e instanceof StoreError && e.operation === 'open' ? e : storeError('list', undefined, e));
      return [];
    }
  }

  put(key: string, value: Uint8Array): Promise<void> {
    return this.write([{ put: key, value }]);
  }

  delete(key: string): Promise<void> {
    return this.write([{ delete: key }]);
  }

  async write(ops: readonly StoreOp[], when?: readonly Precondition[]): Promise<void> {
    const batch = prepareBatch(ops, when);              // copied now, before the first await (research 99 §1.2)
    const key = batchKey(ops);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      let refused: StoreError | null = null;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(CARD_DB_STORE, 'readwrite');
      } catch (e) {
        reject(storeError('write', key, e));
        return;
      }
      // Settled by the transaction's end only: `complete` once committed, `abort` for a refusal, a failed request
      // (its error aborts the transaction) or a failure at commit (the quota).
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(refused ?? storeError('write', key, tx.error ?? new Error('the transaction was aborted')));
      const refuse = (error: StoreError): void => {
        refused ??= error;
        try { tx.abort(); } catch { /* already finished */ }
      };
      try {
        const objects = tx.objectStore(CARD_DB_STORE);
        const apply = (): void => {
          try {
            for (const op of batch.ops) {
              if ('put' in op) objects.put(op.value, op.put);
              else objects.delete(op.delete);
            }
          } catch (e) {
            refuse(storeError('write', key, e));
          }
        };
        if (batch.when.length === 0) {
          apply();
          return;
        }
        // The preconditions, read in this same transaction; the ops are issued only when all hold.
        let waiting = batch.when.length;
        for (const c of batch.when) {
          const r = objects.get(c.key);
          r.onsuccess = () => {
            if (refused) return;
            const v = asBytes(r.result);
            if (v === null) {                           // not bytes: corruption, not another tab
              refuse(new StoreError('failed', 'write', c.key, new TypeError('the precondition key holds no bytes')));
              return;
            }
            if (!holds(c, v)) {
              refuse(new StoreError('conflict', 'write', c.key, new Error('a precondition failed')));
              return;
            }
            if (--waiting === 0) apply();
          };
        }
      } catch (e) {
        refuse(storeError('write', key, e));
      }
    });
  }

  async estimate(): Promise<StoreEstimate | undefined> {
    try {
      const e = await this.options.quota?.estimate();
      return e && typeof e.usage === 'number' && typeof e.quota === 'number' ? { usage: e.usage, quota: e.quota } : undefined;
    } catch {
      return undefined;
    }
  }
}
