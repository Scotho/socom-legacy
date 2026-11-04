import { FORGE_LAYOUT_KEY } from '../pageStore';
import { FORGE_AUTOSAVE_ASIDE_KEY, FORGE_SAVES_ASIDE_KEY, FORGE_SAVES_KEY, type Store } from './saves';

/**
 * FORGE (FCW-07a): the one saves writer, a browser adaptation with no original. The forge's lists -- the named saves
 * and the copies set aside -- in IndexedDB, each list one object store holding one `{generation, text}` record. A
 * write names the generation it read (`write(store, text, expectedGeneration)`): in ONE readwrite transaction it reads
 * the record and writes `generation + 1` only when the generation is still the one expected, else it writes nothing
 * and answers `conflict`. IndexedDB runs readwrite transactions over the same store one at a time, so two tabs, or an
 * agent and a person, never overwrite each other silently: the second writer reads again and decides.
 *
 * Part 2 (R3-B): the page, its Saves card and the agent's saves write here, through `ForgeSaves` (below): the page opens
 * it at boot, `migrateFromLocal` runs once before the first write and RENAMES the localStorage lists (each kept under
 * its recovery key, the original cleared once the IndexedDB copy read back), and every write is a compare-and-swap on
 * the generation the page last read. The autosave is a list of its own (`autosave`). No synchronous facade: a writer
 * awaits its write.
 */

/** The database (`s2u-forge`) and its schema version: 2 adds the autosave's list (R3-B); a version-1 database upgrades in place. */
export const SAVES_DB_NAME = 's2u-forge';
export const SAVES_DB_VERSION = 2;
/**
 * The logical lists, one object store each: the named saves, the saved list set aside, the autosave (R3-B), the
 * autosaves set aside.
 */
export const SAVES_STORES = Object.freeze(['saves', 'savesAside', 'autosave', 'autosaveAside'] as const);
export type SavesStoreName = (typeof SAVES_STORES)[number];
/** Where the migration's marker lives (its own object store, so a list's generation never doubles as it). */
export const SAVES_META_STORE = 'meta';
/** The one record's key in each list's store, and the migration marker's key in `meta`. */
const RECORD_KEY = 'current';
const MIGRATED_KEY = 'migrated-from-local';
/** R6: a list's hand-off row in `meta`, put by a closing page (`putOnHide`), taken in at the next open (`settleHidden`). */
const hiddenKey = (store: SavesStoreName): string => `on-hide:${store}`;
/**
 * A closing page's hand-off. `own` (R6 fix-up, the review's edge): the texts of the writes this page had asked for and
 * not yet seen commit -- a list moved past `expected` only by one of them was moved by the closing page itself.
 * `by` (LATER 488): the putting page's token for this put, so the page can take back its own row and no other
 * (`withdrawHidden`); `settleHidden` does not read it.
 */
interface HiddenRow { expected: number; text: string; own?: string[]; by?: string }
const isHidden = (v: unknown): v is HiddenRow =>
  typeof v === 'object' && v !== null && Number.isSafeInteger((v as HiddenRow).expected) && (v as HiddenRow).expected >= 0 && typeof (v as HiddenRow).text === 'string'
  && ((v as HiddenRow).own === undefined || (Array.isArray((v as HiddenRow).own) && (v as HiddenRow).own!.every((t) => typeof t === 'string')))
  && ((v as HiddenRow).by === undefined || typeof (v as HiddenRow).by === 'string');
/** LATER 488: a fresh token for one hand-off put (a browser adaptation's bookkeeping; unique enough between a host's tabs). */
let putCount = 0;
const handOffToken = (): string => `${Date.now().toString(36)}-${(++putCount).toString(36)}-${Math.random().toString(36).slice(2)}`;
/** R6: what became of a list's hand-off at the open: written as its next generation, or dropped (another writer moved it). */
export type SavesHidden = 'applied' | 'dropped';

/** Each list's key in the page's settings store (`../pageStore` `pageSettings`) before FCW-07a (`./saves`). */
export const LOCAL_KEYS: Readonly<Record<SavesStoreName, string>> = Object.freeze({
  saves: FORGE_SAVES_KEY, savesAside: FORGE_SAVES_ASIDE_KEY, autosave: FORGE_LAYOUT_KEY, autosaveAside: FORGE_AUTOSAVE_ASIDE_KEY,
});
/** A list as the migration reads it from the page's settings store: the page's settings path, which can also remove a key (`Settings.remove`). */
export type LegacyStore = Store & { remove?(key: string): unknown };
/** The recovery copy's key: the list's settings key with this suffix, written once, never deleted or written over. */
export const RECOVERED_SUFFIX = '-recovered-v3';

/** A list as read: its generation (0 when never written) and its text (null when never written). */
export interface SavesRead { generation: number; text: string | null }
export type SavesWrite = 'written' | 'conflict' | 'refused';
export type SavesMigration = 'migrated' | 'already' | 'refused';

interface Row { generation: number; text: string }

const isRow = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && Number.isSafeInteger((v as Row).generation) && (v as Row).generation >= 1 && typeof (v as Row).text === 'string';
const isList = (s: unknown): s is SavesStoreName => typeof s === 'string' && (SAVES_STORES as readonly string[]).includes(s);

/** One transaction's outcome: its value once it commits, `null` when it aborts or errors. */
function run<T>(tx: IDBTransaction, body: (done: (v: T) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    let value: T | null = null;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
    try { body((v) => { value = v; }); } catch { try { tx.abort(); } catch { /* already finished */ } resolve(null); }
  });
}

export class SavesStore {
  private db: IDBDatabase | null = null;

  /** `factory`: the page's IndexedDB (`../pageStore` `pageIndexedDb`), named there and only there; none, nothing opens. */
  constructor(private readonly factory: IDBFactory | null | undefined, private readonly name = SAVES_DB_NAME) {}

  /** Opens (and on first use creates) the database. Rejects when IndexedDB is absent or refuses (a private window). */
  open(): Promise<void> {
    if (this.db) return Promise.resolve();
    const factory = this.factory;
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    return new Promise((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try { req = factory.open(this.name, SAVES_DB_VERSION); } catch (e) { reject(e instanceof Error ? e : new Error('IndexedDB refused')); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of [...SAVES_STORES, SAVES_META_STORE]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; };   // a later build's upgrade
        this.db = db;
        resolve();
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB refused'));
      req.onblocked = () => reject(new Error('IndexedDB is held by another tab'));
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /** The list's generation and text; `{generation: 0, text: null}` when never written, or when the read fails. */
  async read(store: SavesStoreName): Promise<SavesRead> {
    const db = this.db;
    if (!db || !isList(store)) return { generation: 0, text: null };
    const tx = db.transaction(store, 'readonly');
    const row = await run<unknown>(tx, (done) => {
      const req = tx.objectStore(store).get(RECORD_KEY);
      req.onsuccess = () => done(req.result);
    });
    return isRow(row) ? { generation: row.generation, text: row.text } : { generation: 0, text: null };
  }

  /**
   * Writes `text` as the list's next generation when its generation is still `expectedGeneration` (one readwrite
   * transaction: read, compare, put). `conflict` when another writer moved it first (nothing written); `refused` when
   * the store is closed, the list is not one of `SAVES_STORES`, the arguments are not a text and a generation, or the
   * transaction fails (the quota).
   */
  async write(store: SavesStoreName, text: string, expectedGeneration: number): Promise<SavesWrite> {
    const db = this.db;
    if (!db || !isList(store) || typeof text !== 'string' || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return 'refused';
    let tx: IDBTransaction;
    try { tx = db.transaction(store, 'readwrite'); } catch { return 'refused'; }
    const out = await run<SavesWrite>(tx, (done) => {
      const os = tx.objectStore(store);
      const req = os.get(RECORD_KEY);
      req.onsuccess = () => {
        const now = isRow(req.result) ? req.result.generation : 0;
        if (now !== expectedGeneration) { done('conflict'); return; }
        os.put({ generation: now + 1, text } satisfies Row, RECORD_KEY);
        done('written');
      };
    });
    return out ?? 'refused';
  }

  /**
   * R6 (the Forge's rendered pass, R3; the UI seat's ruling of 2026-10-25 17:44Z: no localStorage journal): a write a
   * closing page cannot await. The text is put SYNCHRONOUSLY, on a fresh readwrite transaction committed at once
   * (`IDBTransaction.commit`), into the list's hand-off row in `meta` with the generation the page held -- never over the
   * list itself, which only `settleHidden` writes, by compare-and-swap, at the next open. False when no database is open,
   * the arguments are not a list, a text and a generation, or the transaction is refused (the document already gone).
   * `own` (R6 fix-up): the texts of the page's own writes still in flight, kept with the hand-off (`settleHidden`).
   * `by` (LATER 488): this put's token, kept with the row, for `withdrawHidden`.
   */
  putOnHide(store: SavesStoreName, text: string, expectedGeneration: number, own: readonly string[] = [], by?: string): boolean {
    const db = this.db;
    if (!db || !isList(store) || typeof text !== 'string' || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return false;
    try {
      const tx = db.transaction(SAVES_META_STORE, 'readwrite');
      const row: HiddenRow = own.length > 0 ? { expected: expectedGeneration, text, own: [...own] } : { expected: expectedGeneration, text };
      if (typeof by === 'string' && by !== '') row.by = by;
      tx.objectStore(SAVES_META_STORE).put(row, hiddenKey(store));
      (tx as IDBTransaction & { commit?: () => void }).commit?.();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * LATER 488: a page restored from the back/forward cache takes back the hand-off row it put at its `pagehide` -- in
   * one readwrite transaction on `meta`, compare-and-delete: the row is deleted only while it still carries `by`, the
   * token of that put. A row another page put since (its own token), or none (another open took it in), is left as it
   * is. True when this put's row was deleted. The transaction is asked at the call, so a later put (the next
   * `pagehide`'s) runs after it.
   */
  async withdrawHidden(store: SavesStoreName, by: string): Promise<boolean> {
    const db = this.db;
    if (!db || !isList(store) || typeof by !== 'string' || by === '') return false;
    let tx: IDBTransaction;
    try { tx = db.transaction(SAVES_META_STORE, 'readwrite'); } catch { return false; }
    const out = await run<boolean>(tx, (done) => {
      const meta = tx.objectStore(SAVES_META_STORE);
      const req = meta.get(hiddenKey(store));
      req.onsuccess = () => {
        const row: unknown = req.result;
        if (!isHidden(row) || row.by !== by) { done(false); return; }
        meta.delete(hiddenKey(store));
        done(true);
      };
    });
    return out === true;
  }

  /**
   * R6: takes in each list's hand-off (`putOnHide`), in one readwrite transaction a list: written as the list's next
   * generation when the list is still at the generation the closing page held (and the text differs), else dropped -- a
   * list another writer moved since is never written over. The row is deleted either way. The lists whose hand-off was
   * dropped or applied, by name. R6 fix-up (the review's edge): a list moved past `expected` by no more writes than the
   * closing page had in flight, to the text of one of them (`own`), was moved by that page, not another writer: the
   * hand-off, its last words, is applied over it. LATER 457 (an older write of the page's own, queued before the close
   * and committed after the hand-off): applied when `own` names its text, which every `ForgeSaves.write` and `pending`
   * does from its call. A move to a text `own` does not name (an `update` asked before the hand-off, whose text is
   * decided only at its turn), past `own.length` writes, or with `own` empty, is not decidable from the record --
   * another tab's write reads the same -- so it is dropped, never written over.
   */
  async settleHidden(): Promise<Partial<Record<SavesStoreName, SavesHidden>>> {
    const db = this.db;
    const out: Partial<Record<SavesStoreName, SavesHidden>> = {};
    if (!db) return out;
    for (const s of SAVES_STORES) {
      let tx: IDBTransaction;
      try { tx = db.transaction([s, SAVES_META_STORE], 'readwrite'); } catch { return out; }
      const got = await run<SavesHidden | 'none'>(tx, (done) => {
        const meta = tx.objectStore(SAVES_META_STORE);
        const hidden = meta.get(hiddenKey(s));
        hidden.onsuccess = () => {
          const row: unknown = hidden.result;
          if (row === undefined) { done('none'); return; }
          meta.delete(hiddenKey(s));
          if (!isHidden(row)) { done('dropped'); return; }
          const list = tx.objectStore(s);
          const current = list.get(RECORD_KEY);
          current.onsuccess = () => {
            const now = isRow(current.result) ? current.result : null;
            const at = now?.generation ?? 0;
            if (now?.text === row.text) { done('none'); return; }
            const own = row.own ?? [];
            const byOwn = at > row.expected && at - row.expected <= own.length && now !== null && own.includes(now.text);
            if (at !== row.expected && !byOwn) { done('dropped'); return; }
            list.put({ generation: at + 1, text: row.text } satisfies Row, RECORD_KEY);
            done('applied');
          };
        };
      });
      if (got && got !== 'none') out[s] = got;
    }
    return out;
  }

  /**
   * Moves the localStorage lists (`LOCAL_KEYS`) into their stores ONCE, each at generation 1, and sets the marker in
   * the same transaction; a later call (a reload, another tab) answers `already` and copies nothing over what was
   * written since. Before it, each text is kept as a recovery copy in localStorage (`<key>-recovered-v3`), read back,
   * and never written over or deleted; when a copy cannot be kept the migration does not run (`refused`), nor when any
   * list already holds a write (`refused`, nothing written and no marker: a list's generation never goes back). An empty
   * browser migrates to empty lists. R3-B (the review's F5a, decided: a rename, not a copy): once the transaction is done,
   * each original key is cleared -- only when its list read back from IndexedDB as the text moved -- so the page never
   * reads two copies; the recovery copy stays. A later call clears an original its earlier run left (one equal to its
   * recovery copy), never one written since.
   */
  async migrateFromLocal(legacy: LegacyStore): Promise<SavesMigration> {
    const db = this.db;
    if (!db) return 'refused';
    if (await this.migrated()) { this.clearMoved(legacy, null); return 'already'; }
    const texts: Partial<Record<SavesStoreName, string>> = {};
    try {
      for (const s of SAVES_STORES) {
        const text = legacy.get(LOCAL_KEYS[s]);
        if (!text) continue;
        const key = `${LOCAL_KEYS[s]}${RECOVERED_SUFFIX}`;
        if (!legacy.get(key)) legacy.set(key, text);          // an earlier run's copy is kept as it is
        if (!legacy.get(key)) return 'refused';               // read back: the page's store refuses without throwing
        texts[s] = text;
      }
    } catch {
      return 'refused';
    }
    let tx: IDBTransaction;
    try { tx = db.transaction([...SAVES_STORES, SAVES_META_STORE], 'readwrite'); } catch { return 'refused'; }
    const out = await run<SavesMigration>(tx, (done) => {
      const meta = tx.objectStore(SAVES_META_STORE);
      const req = meta.get(MIGRATED_KEY);
      req.onsuccess = () => {
        if (isRow(req.result)) { done('already'); return; }  // another tab migrated between the check and now
        // the review's F5b: a list already written (generation > 0) is never put back to generation 1 -- a writer holding
        // its generation would lose its compare-and-swap -- so the migration writes nothing, the marker neither
        let left = SAVES_STORES.length;
        let written = false;
        for (const s of SAVES_STORES) {
          const got = tx.objectStore(s).get(RECORD_KEY);
          got.onsuccess = () => {
            if (isRow(got.result)) written = true;
            if (--left > 0) return;
            if (written) { done('refused'); return; }
            for (const name of SAVES_STORES) {
              const text = texts[name];
              if (text !== undefined) tx.objectStore(name).put({ generation: 1, text } satisfies Row, RECORD_KEY);
            }
            meta.put({ generation: 1, text: JSON.stringify({ from: 'page-settings', lists: Object.keys(texts) }) } satisfies Row, MIGRATED_KEY);
            done('migrated');
          };
        }
      };
    });
    if (out === 'already') this.clearMoved(legacy, null);
    if (out !== 'migrated') return out ?? 'refused';
    const moved: Partial<Record<SavesStoreName, string>> = {};
    for (const s of SAVES_STORES) {
      const text = texts[s];
      if (text !== undefined && (await this.read(s)).text === text) moved[s] = text;   // read back before the clear
    }
    this.clearMoved(legacy, moved);
    return 'migrated';
  }

  /**
   * R3-B: clears each original list the migration moved -- `moved`'s, each read back from IndexedDB -- or, with none
   * named, each still equal to its recovery copy (an earlier run's, left by a closed tab). A failed clear leaves the key;
   * the page never reads it again (the marker is set).
   */
  private clearMoved(legacy: LegacyStore, moved: Partial<Record<SavesStoreName, string>> | null): void {
    for (const s of SAVES_STORES) {
      const key = LOCAL_KEYS[s];
      try {
        const now = legacy.get(key);
        if (!now) continue;
        const want = moved ? moved[s] : legacy.get(`${key}${RECOVERED_SUFFIX}`);
        if (want === undefined || want === null || now !== want) continue;
        if (legacy.remove) legacy.remove(key);
        else legacy.set(key, '');
      } catch { /* a store that throws keeps the key: harmless, the marker is set */ }
    }
  }

  /**
   * Whether the migration's marker is set. A failed read answers false: the migration's own transaction reads the
   * marker again before it writes, so a failure here never copies twice.
   */
  private async migrated(): Promise<boolean> {
    const db = this.db;
    if (!db) return false;
    let tx: IDBTransaction;
    try { tx = db.transaction(SAVES_META_STORE, 'readonly'); } catch { return false; }
    const row = await run<unknown>(tx, (done) => {
      const req = tx.objectStore(SAVES_META_STORE).get(MIGRATED_KEY);
      req.onsuccess = () => done(req.result);
    });
    return isRow(row);
  }
}

/** R3-B: the page's lists as `ForgeSaves` opened them -- written through, read only (the migration refused), or none. */
export type SavesState = 'ready' | 'unmigrated' | 'unavailable';
/** R3-B: what `ForgeSaves.update` answers: the change's own value, and what became of its writes. */
export interface SavesUpdate<T> { value: T; outcome: 'written' | 'unchanged' | 'conflict' | 'refused' }

/** The order an update writes its lists in: a copy set aside before the list it was taken from is cleared. */
const WRITE_ORDER: readonly SavesStoreName[] = ['savesAside', 'autosaveAside', 'saves', 'autosave'];
const LIST_OF_KEY: ReadonlyMap<string, SavesStoreName> = new Map(SAVES_STORES.map((s) => [LOCAL_KEYS[s], s]));

/**
 * R3-B (FCW-07a part 2; a browser adaptation, no original): the page's one handle on its lists. `open` opens the
 * `SavesStore`, runs `migrateFromLocal` once (before any write) and reads every list; the page shows what it last read
 * (`text`). A writer awaits `write` or `update`: each list it changes is written by compare-and-swap on the generation
 * last read, so a list another tab (or the agent's bridge) wrote since is never written over -- the write answers
 * `conflict`, every list is read again, and the caller says so ("Saved elsewhere, reloaded"). `update` runs the pure
 * list helpers of `./saves` (`writeSaves`, `setAsideSaves`, `dropKeptAside` ...) on a working copy keyed by the lists'
 * localStorage names (`LOCAL_KEYS`), then writes what changed; nothing reaches storage until it is awaited. Where
 * IndexedDB is not there (`unavailable`) or the older lists could not be moved (`unmigrated`), every write is refused.
 */
export class ForgeSaves {
  private lists = new Map<SavesStoreName, { generation: number; text: string | null }>();
  /**
   * The review of R3-B: the generation of each list this page holds -- read at the open, written by this page, or taken
   * in (`take`). A re-read alone (a conflict's, a refused write's, another writer's) does not move it.
   */
  private held = new Map<SavesStoreName, number>();
  private opened: SavesState = 'unavailable';
  /** One write at a time from this page: a second waits for the first, so it reads the generation the first wrote. */
  private queue: Promise<unknown> = Promise.resolve();
  /** R6 fix-up: each list's texts this page asked to write and has not seen settle (`writeOnHide` hands them on). */
  private inFlight = new Map<SavesStoreName, string[]>();
  /** LATER 488: each list's hand-off row this page put last (`writeOnHide`), by the put's token, for `takeBackHidden`. */
  private putRows = new Map<SavesStoreName, string>();

  constructor(private readonly store: SavesStore, private readonly legacy: LegacyStore) {}

  get state(): SavesState { return this.opened; }

  /**
   * Opens the store, migrates once and reads every list. R6: a closing page's hand-off (`writeOnHide`) is taken in first
   * (`SavesStore.settleHidden`), so the lists read are the closed page's last words where no other writer moved them;
   * `hidden` names each list whose hand-off was applied or dropped.
   */
  async open(): Promise<{ state: SavesState; migration: SavesMigration | null; hidden: Partial<Record<SavesStoreName, SavesHidden>> }> {
    try { await this.store.open(); } catch { this.opened = 'unavailable'; return { state: this.opened, migration: null, hidden: {} }; }
    const migration = await this.store.migrateFromLocal(this.legacy);
    this.opened = migration === 'refused' ? 'unmigrated' : 'ready';
    const hidden = this.opened === 'ready' ? await this.store.settleHidden() : {};
    await this.reread();
    for (const s of SAVES_STORES) this.take(s);
    return { state: this.opened, migration, hidden };
  }

  /**
   * R6 (R3): the list's text put NOW, synchronously, for a page that is closing (`SavesStore.putOnHide`), at the
   * generation this page holds; the next open takes it in by compare-and-swap. Never queued behind this page's writes (a
   * closing page's queue never runs). False when the lists are not open for writing or the put is refused.
   */
  writeOnHide(list: SavesStoreName, text: string): boolean {
    if (this.opened !== 'ready') return false;
    const by = handOffToken();
    const put = this.store.putOnHide(list, text, this.held.get(list) ?? 0, this.inFlight.get(list) ?? [], by);
    if (put) this.putRows.set(list, by);
    return put;
  }

  /**
   * LATER 488 (LATER 457's review; a browser adaptation): a page shown again from the back/forward cache (`pageshow`,
   * `persisted`) is live once more -- its queued writes run and it writes on -- so the hand-off rows its `pagehide`
   * put are no longer a closed page's last words: left, the next open (another tab, or this page's own after a discard
   * that fires no second `pagehide`) would take one in against writes that were all this page's -- dropped and said as
   * another tab's save, or applied over a newer write of its own. Each is taken back here, compare-and-delete on the
   * put's token (`SavesStore.withdrawHidden`), so a row another page put since is never removed. Chosen over writing the
   * row only when not persisted: a page evicted from the cache fires no second `pagehide`, and its row is the only copy
   * of an edit its frozen queue never wrote. The lists whose row was taken back, by name.
   */
  async takeBackHidden(): Promise<SavesStoreName[]> {
    const rows = [...this.putRows];
    this.putRows.clear();
    const asked = rows.map(([list, by]) => this.store.withdrawHidden(list, by).then((gone) => (gone ? list : null)));
    return (await Promise.all(asked)).filter((l): l is SavesStoreName => l !== null);
  }

  close(): void { this.store.close(); }

  /** Settles once every write asked of this page so far is done (the page closes the store after its last flush). */
  idle(): Promise<void> { return this.queue.then(() => undefined, () => undefined); }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The list as last read; null when it was never written, or nothing is open. */
  text(list: SavesStoreName): string | null { return this.lists.get(list)?.text ?? null; }

  /**
   * The generation the list was last read at (0: never written). A caller that keeps its own copy of a list (the page's
   * named saves, its open layout) notes it with the copy and hands it back with a write built from that copy (the
   * review of R3-B: a re-read the copy never took in moves this generation, not the copy's).
   */
  generation(list: SavesStoreName): number { return this.lists.get(list)?.generation ?? 0; }

  /** The list as last read is now the page's (`held`): what it shows, or what it was told of. */
  take(list: SavesStoreName): void { this.held.set(list, this.generation(list)); }

  /** Every list read again; true when any changed since the last read. */
  async reread(): Promise<boolean> {
    let changed = false;
    for (const s of SAVES_STORES) {
      const now = await this.store.read(s);
      const was = this.lists.get(s);
      if (!was || was.generation !== now.generation || was.text !== now.text) changed = true;
      this.lists.set(s, now);
    }
    return changed;
  }

  /** The lists as last read, keyed by their settings keys, for the pure readers of `./saves`. Its `set` is refused. */
  view(): Store {
    return { get: (key) => { const s = LIST_OF_KEY.get(key); return s ? this.text(s) : null; }, set: () => undefined };
  }

  /**
   * One list written by compare-and-swap on the generation last read (`conflict`: every list read again, nothing
   * written). `expected`, where the caller built `text` from its own copy: the generation that copy was read at -- a
   * list read again past it since is a `conflict` too, never written over; `'held'`: the generation this page holds
   * (`take`), taken when the write's turn comes, so two writes of the page's own in a row do not conflict.
   */
  write(list: SavesStoreName, text: string, expected?: number | 'held'): Promise<SavesWrite> {
    return this.flying(list, text, this.serial(() => this.writeNow(list, text, expected)));
  }

  /**
   * R7-5 (round 6's finding): a write the caller has decided on but not yet asked -- it waits for `p` first (the page's
   * `savesOpen()`) -- counted in flight on `list` from this call until `p` settles, so a hand-off put meanwhile
   * (`writeOnHide`, a synchronous pagehide's) names it as this page's own. The caller then asks `write` itself, which
   * counts it again from its own call; `p` is handed back.
   */
  pending<T>(list: SavesStoreName, text: string, p: Promise<T>): Promise<T> {
    return this.flying(list, text, p);
  }

  /** R6 fix-up: `text` counted in flight on `list` until `p` settles. */
  private flying<T>(list: SavesStoreName, text: string, p: Promise<T>): Promise<T> {
    const mine = this.inFlight.get(list) ?? [];
    this.inFlight.set(list, mine);
    mine.push(text);
    const done = (): void => { const i = mine.indexOf(text); if (i >= 0) mine.splice(i, 1); };
    p.then(done, done);
    return p;
  }

  private async writeNow(list: SavesStoreName, text: string, expected?: number | 'held'): Promise<SavesWrite> {
    if (this.opened !== 'ready') return 'refused';
    const at = this.lists.get(list)?.generation ?? 0;
    const want = expected === 'held' ? (this.held.get(list) ?? 0) : expected;
    if (want !== undefined && want !== at) { await this.reread(); return 'conflict'; }
    const out = await this.store.write(list, text, at);
    if (out === 'written') { this.lists.set(list, { generation: at + 1, text }); this.held.set(list, at + 1); }
    else await this.reread();
    return out;
  }

  /**
   * `change` runs on a working copy of the lists (as last read, keyed by `LOCAL_KEYS`); each list it changed is then
   * written, in `WRITE_ORDER`, by compare-and-swap. The first conflict or refusal stops it (the lists before it stay
   * written: a copy set aside is kept), and every list is read again. `expected`: for each list `change` writes from
   * the caller's own copy, the generation that copy was read at (`write`'s); one read again past it is a `conflict`
   * before anything is written.
   */
  update<T>(change: (copy: Store) => T, expected?: Partial<Record<SavesStoreName, number>>): Promise<SavesUpdate<T>> {
    return this.serial(() => this.updateNow(change, expected));
  }

  private async updateNow<T>(change: (copy: Store) => T, expected?: Partial<Record<SavesStoreName, number>>): Promise<SavesUpdate<T>> {
    const copy = new Map<string, string | null>(SAVES_STORES.map((s) => [LOCAL_KEYS[s], this.text(s)]));
    const value = change({ get: (key) => copy.get(key) ?? null, set: (key, v) => { if (LIST_OF_KEY.has(key)) copy.set(key, v); } });
    const changed = WRITE_ORDER.filter((s) => copy.get(LOCAL_KEYS[s]) !== this.text(s));
    if (changed.length === 0) return { value, outcome: 'unchanged' };
    if (this.opened !== 'ready') return { value, outcome: 'refused' };
    if (SAVES_STORES.some((s) => expected?.[s] !== undefined && expected[s] !== this.generation(s))) {
      await this.reread();
      return { value, outcome: 'conflict' };
    }
    for (const s of changed) {
      const text = copy.get(LOCAL_KEYS[s]) ?? '';
      const out = await this.flying(s, text, this.writeNow(s, text));
      if (out !== 'written') return { value, outcome: out };
    }
    return { value, outcome: 'written' };
  }
}
