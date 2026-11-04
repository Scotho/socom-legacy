/**
 * Moving an old localStorage key onto the card's store, once (PLAT-24; plan W6.R5, the owner's ruling 2026-10-01:
 * keys migrate, non-destructively; research 99 §3).
 *
 * The rule: the old key is read once into the new home and **left in place** (never removed or rewritten: an older copy
 * of the page in another tab still finds it). The run is spent -- marked in the store, in the same transaction as the
 * imported value -- once the key has been read and settled: imported, absent, or malformed. A second load therefore
 * never imports the old value over newer state. Nothing is spent when the old storage could not be read or the store
 * refused the write: the next load tries again. When the mark itself cannot be read, nothing is imported (it might be
 * over newer state) and the failure is returned.
 *
 * Two tabs at once (research 99 §3): the mark is read first to skip the work, but the write is **conditional on the mark
 * still being absent, checked inside the write's own transaction** (`ByteStore.write`'s `when`). A tab that read "not
 * run" and then lost the race to another tab gets a `conflict` and reports `already`: the old value never lands over
 * what the winning tab's player did since. A `parse` that throws is the `malformed` outcome (bad data: the run is
 * spent); an `ops` that throws is `broken` (the migration's own bug: the run is not spent, the error is carried).
 *
 * The keys that change home are OPT-04's (`s2u.mp.name` -> the persona) and OPT-20's (`s2u.armory.v1.*` ->
 * `WeapProfile_%d.dat`); each of those tasks writes its `Migration`. The page's other keys stay where they are (research
 * 99 §2), so they need none.
 *
 * The store a run writes is any `MigrationStore` -- the two calls it makes of a `ByteStore`. The card is PLAT-25's
 * `CardSlots`, not a `ByteStore` (research 135 §6), so OPT-04's run writes `CardExtStore`: a slot's `ext`, where
 * redotcom keeps what the original never saved (R7's ext rule; research 229 §4), never a key of the save file. Being
 * synchronous underneath, it also takes `migrateOnceSync`, the same run settled before it returns (research 229 §5).
 */
import { StoreError, storeError, type ByteStore, type Precondition, type ReadResult, type StoreOp } from './store';
import type { CardSlot } from './cardSlots';
import type { Settings } from './settings';

/** One old key's move: its name, how its text is read, and what it becomes in the store. */
export interface Migration<T> {
  /** The old localStorage key, as the page wrote it. */
  readonly from: string;
  /** The old text read; `undefined` (or a throw) when it is malformed (nothing is imported; the key stays). */
  parse(raw: string): T | undefined;
  /** What the value becomes: the store ops written, with the run's mark, in one transaction. */
  ops(value: T): readonly StoreOp[];
}

export type MigrationResult =
  | { readonly outcome: 'imported' }
  | { readonly outcome: 'absent' }
  | { readonly outcome: 'malformed' }
  /** The run was spent by an earlier load: nothing read, nothing written. */
  | { readonly outcome: 'already' }
  /** The old storage threw: nothing written; the next load tries again. */
  | { readonly outcome: 'unreadable'; readonly error: StoreError }
  /** The store could not read the mark or refused the write: nothing written; the next load tries again. */
  | { readonly outcome: 'failed'; readonly error: StoreError }
  /**
   * The migration's own `ops` threw on a value its `parse` accepted: a bug in the migration, not bad legacy data.
   * Nothing written and the run **not** spent, so the fixed code imports at a later load; the error is carried.
   */
  | { readonly outcome: 'broken'; readonly error: unknown };

/** What a run reads and writes of its store: the mark (`read`), then the value's ops and the mark in one conditional `write`. */
export type MigrationStore = Pick<ByteStore, 'read' | 'write'>;

/** The store key that marks `from`'s run as spent. */
export function migrationMarker(from: string): string {
  return 'migrated/' + from;
}

const SPENT = Uint8Array.of(1);

/**
 * What a run does once its mark is read: nothing more (`done`), or the ops to write -- the value's and the mark's, under
 * the mark-still-absent precondition -- and the outcome they settle when the write lands. Shared by `migrateOnce` and
 * `migrateOnceSync`, so the two runners decide alike; only the store's calls differ.
 */
type RunStep = { readonly done: MigrationResult } | { readonly ops: readonly StoreOp[]; readonly when: readonly Precondition[]; readonly settled: MigrationResult };

function runStep<T>(mark: ReadResult<Uint8Array | undefined>, marker: string, legacy: Settings, migration: Migration<T>): RunStep {
  if (!mark.ok) return { done: { outcome: 'failed', error: mark.error } };
  if (mark.value !== undefined) return { done: { outcome: 'already' } };

  const old = legacy.read(migration.from);
  if (!old.ok) return { done: { outcome: 'unreadable', error: old.error } };

  let ops: StoreOp[] = [];
  let parsed = false;
  if (old.value !== null) {
    let value: T | undefined;
    try {
      value = migration.parse(old.value);
    } catch {
      value = undefined;                                // a parse that throws: malformed data, as one that refuses
    }
    if (value !== undefined) {
      try {
        ops = [...migration.ops(value)];
      } catch (error) {
        return { done: { outcome: 'broken', error } };  // the migration's own bug: reported, the run not spent
      }
      parsed = true;
    }
  }
  ops.push({ put: marker, value: SPENT });
  const settled: MigrationResult = old.value === null ? { outcome: 'absent' } : parsed ? { outcome: 'imported' } : { outcome: 'malformed' };
  return { ops, when: [{ key: marker, absent: true }], settled };
}

/** A refused write: another tab's run (`conflict`) is `already`; anything else is `failed`, nothing spent. */
function refused(marker: string, e: unknown): MigrationResult {
  const error = storeError('write', marker, e);
  return error.kind === 'conflict' ? { outcome: 'already' } : { outcome: 'failed', error };
}

/** Runs `migration` once (see the header): reads the old key from `legacy`, writes into `store`, leaves the key. */
export async function migrateOnce<T>(legacy: Settings, store: MigrationStore, migration: Migration<T>): Promise<MigrationResult> {
  const marker = migrationMarker(migration.from);
  const step = runStep(await store.read(marker), marker, legacy, migration);
  if ('done' in step) return step.done;
  try {
    await store.write(step.ops, step.when);
  } catch (e) {
    return refused(marker, e);
  }
  return step.settled;
}

/** A store a run can read and write in the caller's own step: `CardExtStore`, as the card's slots are synchronous. */
export interface SyncMigrationStore {
  /** As `MigrationStore.read`, returned now. */
  readNow(key: string): ReadResult<Uint8Array | undefined>;
  /** As `MigrationStore.write`, applied now: throws a `StoreError`, the store as it was. */
  apply(ops: readonly StoreOp[], when?: readonly Precondition[]): void;
}

/**
 * `migrateOnce` over a synchronous store, settled before it returns (the same rule, the same outcomes). For a caller
 * whose next step in the same turn reads what the run wrote: the persona form's deep link, entered in the session's
 * constructor straight after the run starts (`personaHost.ts`), which an awaited run would reach empty.
 */
export function migrateOnceSync<T>(legacy: Settings, store: SyncMigrationStore, migration: Migration<T>): MigrationResult {
  const marker = migrationMarker(migration.from);
  const step = runStep(store.readNow(marker), marker, legacy, migration);
  if ('done' in step) return step.done;
  try {
    store.apply(step.ops, step.when);
  } catch (e) {
    return refused(marker, e);
  }
  return step.settled;
}

/** The `ext` namespace of a card slot that `CardExtStore` writes by default: the runs' marks and what they imported. */
export const MIGRATION_EXT = 'migrate';

/**
 * A `MigrationStore` over one namespace of a card slot's `ext` (PLAT-25: "redotcom's own saves, beside the card" -- no
 * file, no free space, kept by a format): the values as lists of bytes in one JSON object. A write is one `setExt` at
 * the revision read in the same step, its preconditions checked against that read, so it lands whole or not at all; a
 * slot another tab saved in between is a `conflict`, as `ByteStore.write`'s. A slot with no storage, or damaged, is
 * `unavailable`. Synchronous underneath (`peek`, `apply`), as the slots are.
 */
export class CardExtStore implements MigrationStore, SyncMigrationStore {
  constructor(private readonly slot: CardSlot, private readonly namespace: string = MIGRATION_EXT) {}

  /** The namespace's values now: `null` when the slot cannot be read (no storage, damaged). */
  private values(): { rev: number; values: Record<string, number[]> } | null {
    const rev = this.slot.info().rev;
    if (rev === null) return null;
    const v = this.slot.getExt(this.namespace);
    const values: Record<string, number[]> = {};
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) if (Array.isArray(x) && x.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) values[k] = x as number[];
    }
    return { rev, values };
  }

  /** The value under `key` now, or undefined (nothing there, or the slot cannot be read). */
  peek(key: string): Uint8Array | undefined {
    const v = this.values()?.values[key];
    return v ? Uint8Array.from(v) : undefined;
  }

  /** `write`, synchronously: throws a `StoreError` (`conflict`, `unavailable`, `failed`) with the slot as it was. */
  apply(ops: readonly StoreOp[], when: readonly Precondition[] = []): void {
    const now = this.values();
    if (!now) throw new StoreError('unavailable', 'write', undefined);
    for (const c of when) {
      const held = now.values[c.key];
      const holds = 'absent' in c ? held === undefined : held !== undefined && held.length === c.equals.length && held.every((b, i) => b === c.equals[i]);
      if (!holds) throw new StoreError('conflict', 'write', c.key);
    }
    const next = { ...now.values };
    for (const op of ops) {
      if ('put' in op) next[op.put] = Array.from(op.value);
      else delete next[op.delete];
    }
    const r = this.slot.setExt(this.namespace, next, now.rev);
    if (!r.ok) throw new StoreError(r.failure.kind === 'changed' ? 'conflict' : 'failed', 'write', undefined, r.failure);
  }

  /** `read`, synchronously: the value now, or why it cannot be read (`unavailable`: no storage, damaged). */
  readNow(key: string): ReadResult<Uint8Array | undefined> {
    const now = this.values();
    if (!now) return { ok: false, error: new StoreError('unavailable', 'get', key) };
    const v = now.values[key];
    return { ok: true, value: v ? Uint8Array.from(v) : undefined };
  }

  async read(key: string): Promise<ReadResult<Uint8Array | undefined>> {
    return this.readNow(key);
  }

  async write(ops: readonly StoreOp[], when: readonly Precondition[] = []): Promise<void> {
    try {
      this.apply(ops, when);
    } catch (e) {
      throw e instanceof StoreError ? e : storeError('write', undefined, e);
    }
  }
}
