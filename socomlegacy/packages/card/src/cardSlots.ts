/**
 * The two virtual memory-card slots (PLAT-25 as the owner's ruling R7 rewrote it; the R7 spec
 * `docs/specs/2026-10-01-web-r7-account-and-card-design.md` §3 and its amendments §7; research 99 §7).
 *
 * Each slot is **one JSON record under one key** of the browser's key-value `Storage` (`s2u.card.v1.slot1`,
 * `s2u.card.v1.slot2`): the card's state (in the slot or not, formatted or not), its file table -- the original's names
 * and **nominal** sizes, our JSON as the contents -- and, beside the card, `ext` (what redotcom saves that the original
 * never did; amendment 2). Every operation here is synchronous and reads the record afresh: nothing is cached, so a
 * second instance over the same storage (a reload) reads what the first wrote.
 *
 * - **A missing key is a fresh card**: inserted, formatted, empty, revision 0 (KNOWN [card-folder], PC `docs/KNOWN.md`
 *   L72: an empty or missing card folder is an inserted, formatted, empty PS2 card). Reading it writes nothing.
 * - **Free space is the virtual 8 MB card's**, never the browser's quota: the recomp stub's 8000 clusters of 1 KB, less
 *   one cluster per folder and each file's nominal size rounded up to clusters (`mcUsedClusters`,
 *   `third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp:245-288`; the constants :47-48). A write is
 *   refused whole as `full` when its growth does not fit (the stub's sceMcWrite, :1677-1680).
 * - **A save is atomic**: the new record is built whole, then written with **one `setItem`**. One that throws writes
 *   nothing -- the previous record stays byte-equal -- and is **reported** (the `report` the composition root gives)
 *   and returned as `write-failed` with a `StoreError` (PLAT-24's kinds: `quota`, `unavailable`, `failed`).
 * - **The revision** (amendment 3): every successful save adds one to `rev`. A save carries the revision its caller
 *   read; if the stored record's differs, the save is refused whole as `changed` (another tab saved: the original's
 *   ChangedCard, PLAT-26's mapping). The read, the check and the `setItem` run in one synchronous step; the window that
 *   remains between tabs is research 99 §7.6.
 * - **A corrupt record** (no JSON, an unknown `v`, a wrong shape) is a present card whose save is `damaged`; no read
 *   rewrites it, and only an explicit `format` replaces it.
 * - **No storage** (none given, reaching it throws, `getItem` throws: a private window) reads as **no card** in both
 *   slots -- the controller's default (R7 §3), which the owner may overturn.
 *
 * Results are typed outcomes, not libmc's numbers: PLAT-26 maps `no-card`, `unformatted`, `full`, `no-entry`,
 * `changed`, `write-failed` (and the rest) onto the stub's result codes. Pure and DOM-free (W6.R2): the storage arrives
 * as a getter, as `Settings` takes it, and the viewer passes `() => localStorage` (`packages/viewer/src/pageStore.ts`).
 */
import { storeError, StoreError, type FailureReport } from './store';

/** The two slots' keys: slot 1, slot 2 (R7 §3). */
export const CARD_SLOT_KEYS = ['s2u.card.v1.slot1', 's2u.card.v1.slot2'] as const;

/** A slot, numbered as the console's slots are. */
export type SlotNumber = 1 | 2;

/** One card cluster, in bytes (`kMcClusterBytes`, MemoryCard.cpp:47). */
export const CARD_CLUSTER_BYTES = 1024;

/** The card's usable clusters: the retail 8 MB card as the stub sizes it (`kMcTotalClusters`, MemoryCard.cpp:48). */
export const CARD_TOTAL_CLUSTERS = 8000;

/**
 * The most one `ext` namespace may hold: its value's JSON, in UTF-16 characters (what localStorage counts). The
 * controller's ruling (review of PLAT-25, 2026-10-01; the owner may change it); the arithmetic is research 99 §7.11.
 */
export const EXT_NAMESPACE_MAX_CHARS = 262_144;

/** The most a slot's whole `ext` may hold, as its JSON in UTF-16 characters (research 99 §7.11; the owner may change it). */
export const EXT_TOTAL_MAX_CHARS = 1_048_576;

/**
 * Card names are compared case-sensitively: `SaveGame0` and `savegame0` are two entries. [reading] The PS2 card
 * filesystem as mymcplus implements it compares a directory entry's name byte for byte (`ps2mc.py` L1156, and
 * `fnmatchcase` for a pattern, L1749); Sony's own card driver was not read, and the recomp's stub defers to its host's
 * filesystem (case-insensitive on Windows). Research 99 §7.12.
 */
export const CARD_NAMES_CASE_SENSITIVE_READING = true;

/** The record's version; a record with any other `v` is damaged. */
const RECORD_VERSION = 1;

/** The clusters a file of `bytes` takes: rounded up, a 0-byte file none (MemoryCard.cpp:280, `mcClustersFor` :313-316). */
export function clustersFor(bytes: number): number {
  return Math.ceil(bytes / CARD_CLUSTER_BYTES);
}

/** The part of a browser `Storage` the slots use. */
export type CardStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One file on the card: its nominal size (the original's bytes), when it was written, and our JSON. */
export interface CardFileV1 {
  readonly size: number;
  readonly mtime: number;
  readonly data: unknown;
}

/** One folder on the card. */
export interface CardDirV1 {
  readonly mtime: number;
}

/**
 * A slot's record as stored (R7 §3, with amendments 2 and 3). `dirs` is this module's addition to the spec's shape:
 * the card's folders, which the stub counts (one cluster each) and lists, and which a file table keyed by path alone
 * could not hold while empty (research 99 §7.1).
 */
export interface CardSlotV1 {
  readonly v: 1;
  readonly rev: number;
  readonly present: boolean;
  readonly formatted: boolean;
  readonly files: Readonly<Record<string, CardFileV1>>;
  readonly dirs: Readonly<Record<string, CardDirV1>>;
  readonly ext: Readonly<Record<string, unknown>>;
}

/**
 * The revision a caller read: a number, or `null` for a slot it read as damaged (or could not read). A save is taken
 * only when it equals the stored record's.
 */
export type CardRev = number | null;

/** What a slot is now (GetInfo's question): the card's state, its revision, and free space when it has any. */
export type SlotInfo =
  | { readonly state: 'formatted'; readonly rev: number; readonly freeClusters: number; readonly usedClusters: number }
  /** Formatted cards only have free space: the stub answers 0 for an unformatted one (MemoryCard.cpp:1204). */
  | { readonly state: 'unformatted'; readonly rev: number }
  | { readonly state: 'no-card'; readonly rev: number; readonly why: 'removed' }
  | { readonly state: 'no-card'; readonly rev: null; readonly why: 'no-storage'; readonly error: StoreError }
  | { readonly state: 'damaged'; readonly rev: null; readonly reason: string };

/** Why an operation was refused. Every refusal leaves the stored record as it was. */
export type CardFailure =
  /** No card in the slot: pulled out, or no storage in this browser. */
  | { readonly kind: 'no-card' }
  | { readonly kind: 'unformatted' }
  /** The stored record is corrupt (the original's "Error loading data" path). */
  | { readonly kind: 'damaged'; readonly reason: string }
  /** The stored revision is not the one the caller read: another tab saved. */
  | { readonly kind: 'changed'; readonly expected: CardRev; readonly found: CardRev }
  /** The write needs more clusters than the virtual card has free. */
  | { readonly kind: 'full'; readonly needed: number; readonly free: number }
  /** Nothing at `path` (the entry itself, or the folder it would be in). */
  | { readonly kind: 'no-entry'; readonly path: string }
  /** `path` is a file where a folder is wanted, or a folder where a file is (`is` says which it is). */
  | { readonly kind: 'wrong-kind'; readonly path: string; readonly is: 'file' | 'dir' }
  | { readonly kind: 'not-empty'; readonly path: string }
  /** A bad argument: a path, a size, a namespace, or a value that is not JSON. */
  | { readonly kind: 'invalid'; readonly reason: string }
  /** An `ext` value past its cap: one namespace's, or `ext`'s as a whole (sizes in UTF-16 characters of JSON). */
  | { readonly kind: 'too-large'; readonly scope: 'namespace' | 'ext'; readonly limit: number; readonly size: number }
  /** The `setItem` threw: nothing written, the error reported. */
  | { readonly kind: 'write-failed'; readonly error: StoreError };

/** An operation's outcome: done, with the record's revision after it (and its value), or refused. */
export type CardResult<T> =
  | { readonly ok: true; readonly rev: number; readonly value: T }
  | { readonly ok: false; readonly failure: CardFailure };

/** One entry of a folder's listing. A folder's `size` is 0. */
export interface CardEntry {
  readonly name: string;
  readonly kind: 'file' | 'dir';
  readonly size: number;
  readonly mtime: number;
}

/** Options: the clock that stamps `mtime` (ms since the epoch). */
export interface CardSlotsOptions {
  readonly now?: () => number;
}

/**
 * A staged copy of both slots (`CardSlots.stage`): `slots` reads and writes a memory copy of the two records as they
 * were when the stage was made, with the same clock; `commit(n)` writes slot `n`'s staged record to the real storage.
 */
export interface CardStage {
  readonly slots: CardSlots;
  /**
   * Writes slot `n`'s staged record as **one** save on the real slot, taken only if the real slot's revision is still
   * the one the stage read (`changed` otherwise, nothing written): the card's own read-check-write step, so a throwing
   * `setItem` writes nothing (`write-failed`) and a stage that changed nothing writes nothing. The revision moves by one.
   */
  commit(n: SlotNumber): CardResult<void>;
}

/** The two slots over one storage. */
export class CardSlots {
  private readonly slots: readonly [CardSlot, CardSlot];

  constructor(
    private readonly storage: () => CardStorage | null | undefined,
    report: FailureReport,
    private readonly options: CardSlotsOptions = {},
  ) {
    const now = options.now ?? (() => Date.now());
    this.slots = [
      new CardSlot(CARD_SLOT_KEYS[0], storage, report, now),
      new CardSlot(CARD_SLOT_KEYS[1], storage, report, now),
    ];
  }

  /** Slot 1 or slot 2. */
  slot(n: SlotNumber): CardSlot {
    return this.slots[n - 1]!;
  }

  /**
   * A staged edit (MU-F2d; web research 143 §5): a memory copy of both slots' stored text, taken now, that any number
   * of operations may change without touching the real storage, then `commit` one slot by compare-and-swap. No storage
   * (or a read that throws) stages as no storage: the staged slots read as no card, as the real ones do.
   */
  stage(): CardStage {
    const copy = new Map<string, string | null>();
    let readable = true;
    try {
      const s = this.storage();
      if (!s) readable = false;
      else for (const key of CARD_SLOT_KEYS) copy.set(key, s.getItem(key));
    } catch { readable = false; }
    const memory: CardStorage = {
      getItem: (key) => copy.get(key) ?? null,
      setItem: (key, value) => { copy.set(key, String(value)); },
    };
    const staged = new CardSlots(() => (readable ? memory : null), () => undefined, this.options);
    const observed = (raw: string | null | undefined): CardRev => {
      if (raw === null || raw === undefined) return 0;
      const loaded = parseRecord(raw);
      return loaded.kind === 'record' ? loaded.record.rev : null;
    };
    const read = new Map(CARD_SLOT_KEYS.map((key) => [key, observed(copy.get(key))] as const));
    return {
      slots: staged,
      commit: (n) => {
        if (!readable) return fail({ kind: 'no-card' });
        const key = CARD_SLOT_KEYS[n - 1];
        if (key === undefined) return fail({ kind: 'no-card' });
        const loaded = parseRecord(copy.get(key) ?? JSON.stringify(freshCard()));
        if (loaded.kind !== 'record') return fail({ kind: 'damaged', reason: loaded.kind === 'damaged' ? loaded.reason : 'no storage' });
        return this.slot(n).replace(loaded.record, read.get(key) ?? null);
      },
    };
  }
}

/** A slot as `CardSlot.read` gives it: the stored record, a damaged one, or no storage to read. */
export type SlotRead =
  | { readonly kind: 'record'; readonly record: CardSlotV1 }
  | { readonly kind: 'damaged'; readonly reason: string }
  | { readonly kind: 'no-storage' };

/** What reading the key gave: a record, a damaged one (with any revision still legible), or no storage. */
type Loaded =
  | { readonly kind: 'record'; readonly record: CardSlotV1 }
  | {
    readonly kind: 'damaged';
    readonly reason: string;
    /** A whole `rev` still readable in the damaged text, if any. */
    readonly legibleRev: number | undefined;
    /** The damaged record's `ext`, when it is itself a well-formed object (a wipe keeps it). */
    readonly legibleExt: Record<string, unknown> | undefined;
  }
  | { readonly kind: 'no-storage'; readonly error: StoreError };

/** A mutable copy of a record, built by an operation and written whole. */
interface Draft {
  present: boolean;
  formatted: boolean;
  files: Record<string, CardFileV1>;
  dirs: Record<string, CardDirV1>;
  ext: Record<string, unknown>;
}

type Change<T> = { readonly write: false; readonly value: T } | { readonly write: true; readonly value: T };

/** What a save starts from: the stored record, or a damaged one being wiped (its `ext` kept or lost). */
type Wipe = 'none' | 'damaged, ext kept' | 'damaged, ext lost';

/** One slot: its state, its file table and `ext`, each operation a read and at most one `setItem`. */
export class CardSlot {
  constructor(
    /** The slot's storage key. */
    readonly key: string,
    private readonly storage: () => CardStorage | null | undefined,
    private readonly report: FailureReport,
    private readonly now: () => number,
  ) {}

  // ---- reading ----

  /** The slot's state now, its revision, and its free space (formatted cards only). */
  info(): SlotInfo {
    const loaded = this.load();
    if (loaded.kind === 'no-storage') return { state: 'no-card', rev: null, why: 'no-storage', error: loaded.error };
    if (loaded.kind === 'damaged') return { state: 'damaged', rev: null, reason: loaded.reason };
    const r = loaded.record;
    if (!r.present) return { state: 'no-card', rev: r.rev, why: 'removed' };
    if (!r.formatted) return { state: 'unformatted', rev: r.rev };
    const used = usedClusters(r);
    return { state: 'formatted', rev: r.rev, freeClusters: CARD_TOTAL_CLUSTERS - used, usedClusters: used };
  }

  /**
   * The slot as stored now: its record (the tables as read, not to be changed), `damaged` with the reason, or
   * `no-storage`. Writes nothing. What libmc's re-read compares on a `changed` save (PLAT-26a; research 134 §4).
   */
  read(): SlotRead {
    const loaded = this.load();
    if (loaded.kind === 'record') return { kind: 'record', record: loaded.record };
    if (loaded.kind === 'damaged') return { kind: 'damaged', reason: loaded.reason };
    return { kind: 'no-storage' };
  }

  /** The entries of folder `dir` (`''` is the card's root), sorted by name. */
  list(dir: string): CardResult<CardEntry[]> {
    return this.query((r) => {
      if (dir !== '') {
        const bad = checkPath(dir);
        if (bad) return fail({ kind: 'invalid', reason: bad });
        const kind = kindAt(r, dir);
        if (kind === undefined) return fail({ kind: 'no-entry', path: dir });
        if (kind === 'file') return fail({ kind: 'wrong-kind', path: dir, is: 'file' });
      }
      const out: CardEntry[] = [];
      for (const [path, d] of Object.entries(r.dirs)) if (parentOf(path) === dir) out.push({ name: nameOf(path), kind: 'dir', size: 0, mtime: d.mtime });
      for (const [path, f] of Object.entries(r.files)) if (parentOf(path) === dir) out.push({ name: nameOf(path), kind: 'file', size: f.size, mtime: f.mtime });
      out.sort(byStubOrder);
      return out;
    });
  }

  /** The entry at `path`. */
  stat(path: string): CardResult<CardEntry> {
    return this.query((r) => {
      const bad = checkPath(path);
      if (bad) return fail({ kind: 'invalid', reason: bad });
      const f = r.files[path];
      if (f) return { name: nameOf(path), kind: 'file' as const, size: f.size, mtime: f.mtime };
      const d = r.dirs[path];
      if (d) return { name: nameOf(path), kind: 'dir' as const, size: 0, mtime: d.mtime };
      return fail({ kind: 'no-entry', path });
    });
  }

  /** The file at `path`: its nominal size, its time and its data (a fresh copy). */
  readFile(path: string): CardResult<CardFileV1> {
    return this.query((r) => {
      const bad = checkPath(path);
      if (bad) return fail({ kind: 'invalid', reason: bad });
      const f = r.files[path];
      if (f) return { size: f.size, mtime: f.mtime, data: f.data };
      if (r.dirs[path]) return fail({ kind: 'wrong-kind', path, is: 'dir' });
      return fail({ kind: 'no-entry', path });
    });
  }

  // ---- the file table ----

  /**
   * Creates or replaces the file at `path` with nominal `size` bytes and `data` (copied as JSON at the call). Its
   * folder must exist. Refused whole as `full` when the growth over the file's old clusters does not fit.
   */
  writeFile(path: string, size: number, data: unknown, rev: CardRev): CardResult<{ created: boolean }> {
    const bad = checkPath(path);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    if (!Number.isSafeInteger(size) || size < 0) return fail({ kind: 'invalid', reason: `a file's size is a whole number of bytes (${size})` });
    const copy = jsonCopy(data);
    if (!copy.ok) return fail({ kind: 'invalid', reason: copy.reason });
    return this.onCard(rev, (d) => {
      const parentFailure = this.checkParent(d, path);
      if (parentFailure) return parentFailure;
      if (d.dirs[path]) return fail({ kind: 'wrong-kind', path, is: 'dir' });
      const old = d.files[path];
      const growth = clustersFor(size) - (old ? clustersFor(old.size) : 0);
      const used = usedClusters(d);
      if (growth > 0 && used + growth > CARD_TOTAL_CLUSTERS) {
        return fail({ kind: 'full', needed: growth, free: CARD_TOTAL_CLUSTERS - used });
      }
      d.files[path] = { size, mtime: this.now(), data: copy.value };
      return { write: true, value: { created: !old } };
    });
  }

  /** Deletes the file at `path`. */
  deleteFile(path: string, rev: CardRev): CardResult<void> {
    const bad = checkPath(path);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    return this.onCard(rev, (d) => {
      if (d.dirs[path]) return fail({ kind: 'wrong-kind', path, is: 'dir' });
      if (!d.files[path]) return fail({ kind: 'no-entry', path });
      delete d.files[path];
      return { write: true, value: undefined };
    });
  }

  /** Makes the folder `path`; one already there is taken as made, as the stub's Mkdir answers (MemoryCard.cpp:1306-1308). */
  makeDir(path: string, rev: CardRev): CardResult<{ created: boolean }> {
    const bad = checkPath(path);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    return this.onCard<{ created: boolean }>(rev, (d) => {
      if (d.files[path]) return fail({ kind: 'wrong-kind', path, is: 'file' });
      if (d.dirs[path]) return { write: false, value: { created: false } };
      const parentFailure = this.checkParent(d, path);
      if (parentFailure) return parentFailure;
      d.dirs[path] = { mtime: this.now() };
      return { write: true, value: { created: true } };
    });
  }

  /** Removes the empty folder `path`. */
  removeDir(path: string, rev: CardRev): CardResult<void> {
    const bad = checkPath(path);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    return this.onCard(rev, (d) => {
      if (d.files[path]) return fail({ kind: 'wrong-kind', path, is: 'file' });
      if (!d.dirs[path]) return fail({ kind: 'no-entry', path });
      const prefix = path + '/';
      if (Object.keys(d.files).some((p) => p.startsWith(prefix)) || Object.keys(d.dirs).some((p) => p.startsWith(prefix))) {
        return fail({ kind: 'not-empty', path });
      }
      delete d.dirs[path];
      return { write: true, value: undefined };
    });
  }

  /**
   * Renames (or moves) the file or folder `from` to `to`, a folder with everything in it, in one save. As the stub's
   * Rename (MemoryCard.cpp:1439-1484): `from` must exist and `to`'s folder must exist (else no entry); the host's rename
   * then decides the rest, and where Windows and POSIX agree this follows them -- a file onto a file replaces it; onto a
   * folder, or a folder onto a file, is refused (`wrong-kind`; the stub's DeniedPermit). A folder onto an existing
   * folder is refused too (Windows refuses it; POSIX takes an empty one). A folder into itself is `invalid`.
   */
  rename(from: string, to: string, rev: CardRev): CardResult<void> {
    const bad = checkPath(from) || checkPath(to);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    if (to.startsWith(from + '/')) return fail({ kind: 'invalid', reason: `"${to}" is inside "${from}"` });
    return this.onCard(rev, (d) => {
      const kind = kindAt(d, from);
      if (kind === undefined) return fail({ kind: 'no-entry', path: from });
      if (from === to) return { write: false, value: undefined };
      const parentFailure = this.checkParent(d, to);
      if (parentFailure) return parentFailure;
      const target = kindAt(d, to);
      if (target === 'dir') return fail({ kind: 'wrong-kind', path: to, is: 'dir' });
      if (target === 'file' && kind === 'dir') return fail({ kind: 'wrong-kind', path: to, is: 'file' });
      if (kind === 'file') {
        const f = d.files[from]!;
        delete d.files[from];
        d.files[to] = f;
      } else {
        const prefix = from + '/';
        const moved = (p: string): string => to + p.slice(from.length);
        for (const table of [d.files, d.dirs] as Record<string, unknown>[]) {
          for (const p of Object.keys(table)) {
            if (p !== from && !p.startsWith(prefix)) continue;
            const entry = table[p];
            delete table[p];
            table[moved(p)] = entry;
          }
        }
      }
      return { write: true, value: undefined };
    });
  }

  /**
   * SetFileInfo: sets the time of the file or folder at `path`. The stub's SetFileInfo keeps nothing -- it answers
   * Succeed when the entry exists, NoEntry when not (MemoryCard.cpp:1524-1562) -- so the record has no attribute field;
   * with no `mtime` given this only checks the entry, as the stub does, and writes nothing.
   */
  setFileInfo(path: string, info: { readonly mtime?: number }, rev: CardRev): CardResult<void> {
    const bad = checkPath(path);
    if (bad) return fail({ kind: 'invalid', reason: bad });
    const mtime = info.mtime;
    if (mtime !== undefined && !Number.isFinite(mtime)) return fail({ kind: 'invalid', reason: `a time is a finite number (${mtime})` });
    return this.onCard(rev, (d) => {
      const kind = kindAt(d, path);
      if (kind === undefined) return fail({ kind: 'no-entry', path });
      if (mtime === undefined) return { write: false, value: undefined };
      if (kind === 'file') d.files[path] = { ...d.files[path]!, mtime };
      else d.dirs[path] = { mtime };
      return { write: true, value: undefined };
    });
  }

  /**
   * Replaces the record's contents -- the card's state, its files and folders, `ext` -- with `content`'s, as one save
   * through the read-check-write step (the revision `rev` checked, one `setItem`, the revision one past). What
   * `CardSlots.stage`'s commit writes; `content` is a record this module parsed, so it is well-formed.
   */
  replace(content: Pick<CardSlotV1, 'present' | 'formatted' | 'files' | 'dirs' | 'ext'>, rev: CardRev): CardResult<void> {
    return this.mutate(rev, (d) => {
      d.present = content.present;
      d.formatted = content.formatted;
      d.files = dict(content.files);
      d.dirs = dict(content.dirs);
      d.ext = dict(content.ext);
      return { write: true, value: undefined };
    });
  }

  // ---- the card's states (OPT-07's control; the tests') ----

  /** Puts the card back in its slot, as it was. A card already in is left as it is (nothing written). */
  insert(rev: CardRev): CardResult<void> {
    return this.mutate(rev, (d) => {
      if (d.present) return { write: false, value: undefined };
      d.present = true;
      return { write: true, value: undefined };
    });
  }

  /** Pulls the card out: no card in the slot; its files stay on it. A card already out is left as it is. */
  remove(rev: CardRev): CardResult<void> {
    return this.mutate(rev, (d) => {
      if (!d.present) return { write: false, value: undefined };
      d.present = false;
      return { write: true, value: undefined };
    });
  }

  /**
   * Formats the card: formatted, every file and folder gone; `ext` kept (it is not on the card). The one operation a
   * damaged record takes (with `rev` null): it is replaced by a fresh card, keeping the damaged record's `ext` when that
   * is itself a well-formed object (`ext: 'kept'`), losing it when not (`ext: 'lost'`) (research 99 §7.3, §7.4).
   */
  format(rev: CardRev): CardResult<{ ext: 'kept' | 'lost' }> {
    return this.mutate<{ ext: 'kept' | 'lost' }>(rev, (d, wipe) => {
      if (!d.present) return fail({ kind: 'no-card' });
      d.formatted = true;
      d.files = dict({});
      d.dirs = dict({});
      return { write: true, value: { ext: wipe === 'damaged, ext lost' ? 'lost' : 'kept' } };
    }, true);
  }

  /** Unformats the card: unformatted, its files and folders gone (the stub's sceMcUnformat, MemoryCard.cpp:1608-1629). */
  unformat(rev: CardRev): CardResult<void> {
    return this.mutate(rev, (d) => {
      if (!d.present) return fail({ kind: 'no-card' });
      d.formatted = false;
      d.files = dict({});
      d.dirs = dict({});
      return { write: true, value: undefined };
    });
  }

  // ---- ext: redotcom's own saves, beside the card ----

  /** The value under `namespace` in `ext` (a fresh copy), or undefined -- for none, a damaged record and no storage. */
  getExt(namespace: string): unknown {
    const loaded = this.load();
    if (loaded.kind !== 'record') return undefined;
    return Object.hasOwn(loaded.record.ext, namespace) ? loaded.record.ext[namespace] : undefined;
  }

  /** The namespaces `ext` holds, sorted. */
  extNames(): string[] {
    const loaded = this.load();
    return loaded.kind === 'record' ? Object.keys(loaded.record.ext).sort() : [];
  }

  /**
   * Sets `namespace`'s value in `ext` (copied as JSON at the call; `undefined` clears it). A save like any other (the
   * revision is checked and moves), but on no file: it takes no free space, and works while the card is out or unformatted.
   */
  setExt(namespace: string, value: unknown, rev: CardRev): CardResult<void> {
    if (typeof namespace !== 'string' || namespace === '') return fail({ kind: 'invalid', reason: 'an ext namespace is a non-empty string' });
    let copy: unknown;
    if (value !== undefined) {
      const c = jsonCopy(value);
      if (!c.ok) return fail({ kind: 'invalid', reason: c.reason });
      if (c.chars > EXT_NAMESPACE_MAX_CHARS) {
        return fail({ kind: 'too-large', scope: 'namespace', limit: EXT_NAMESPACE_MAX_CHARS, size: c.chars });
      }
      copy = c.value;
    }
    return this.mutate(rev, (d) => {
      const before = JSON.stringify(d.ext).length;
      if (value === undefined) delete d.ext[namespace];
      else d.ext[namespace] = copy;
      const after = JSON.stringify(d.ext).length;
      if (after > EXT_TOTAL_MAX_CHARS && after > before) {
        return fail({ kind: 'too-large', scope: 'ext', limit: EXT_TOTAL_MAX_CHARS, size: after });
      }
      return { write: true, value: undefined };
    });
  }

  // ---- the machinery ----

  /** Reads and parses the slot's key. Never writes. */
  private load(): Loaded {
    let raw: string | null;
    try {
      const s = this.storage();
      if (!s) throw new StoreError('unavailable', 'get', this.key, new TypeError('no storage in this browser'));
      raw = s.getItem(this.key);
    } catch (e) {
      const error = e instanceof StoreError ? new StoreError(e.kind, 'get', this.key, e.cause) : storeError('get', this.key, e);
      return { kind: 'no-storage', error };
    }
    if (raw === null) return { kind: 'record', record: freshCard() };
    return parseRecord(raw);
  }

  /** A read on a present, formatted card. */
  private query<T>(read: (r: CardSlotV1) => T | Refusal): CardResult<T> {
    const loaded = this.load();
    const refused = refusalOf(loaded);
    if (refused) return refused;
    const r = (loaded as { record: CardSlotV1 }).record;
    if (!r.present) return fail({ kind: 'no-card' });
    if (!r.formatted) return fail({ kind: 'unformatted' });
    const value = read(r);
    if (isRefusal(value)) return value;
    return { ok: true, rev: r.rev, value };
  }

  /** A save on a present, formatted card. */
  private onCard<T>(rev: CardRev, change: (d: Draft) => Change<T> | Refusal): CardResult<T> {
    return this.mutate(rev, (d) => {
      if (!d.present) return fail({ kind: 'no-card' });
      if (!d.formatted) return fail({ kind: 'unformatted' });
      return change(d);
    });
  }

  /**
   * The one read-check-write step every save goes through, synchronously: read the record, check the revision the
   * caller read, apply the change to a copy, and write the whole new record in one `setItem`.
   */
  private mutate<T>(rev: CardRev, change: (d: Draft, wipe: Wipe) => Change<T> | Refusal, takesDamaged = false): CardResult<T> {
    const loaded = this.load();
    if (loaded.kind === 'no-storage') return fail({ kind: 'no-card' });
    const found: CardRev = loaded.kind === 'record' ? loaded.record.rev : null;
    if (found !== rev) return fail({ kind: 'changed', expected: rev, found });
    let base: CardSlotV1;
    let nextRev: number;
    let wipe: Wipe;
    if (loaded.kind === 'damaged') {
      if (!takesDamaged) return fail({ kind: 'damaged', reason: loaded.reason });
      // The wipe's revision: past any revision still legible, and past the clock, so that a tab holding a revision
      // from before the damage (which may no longer be legible) never finds it again (research 99 §7.4).
      base = { ...freshCard(), ext: dict(loaded.legibleExt ?? {}) };
      nextRev = Math.max(loaded.legibleRev ?? 0, Math.floor(this.now())) + 1;
      wipe = loaded.legibleExt ? 'damaged, ext kept' : 'damaged, ext lost';
    } else {
      base = loaded.record;
      nextRev = base.rev + 1;
      wipe = 'none';
    }
    const draft: Draft = {
      present: base.present, formatted: base.formatted,
      files: dict(base.files), dirs: dict(base.dirs), ext: dict(base.ext),
    };
    const outcome = change(draft, wipe);
    if (isRefusal(outcome)) return outcome;
    if (!outcome.write) return { ok: true, rev: base.rev, value: outcome.value };
    // A change that changes nothing writes nothing: the revision stays, and no other tab is told the card changed.
    if (loaded.kind === 'record' && sameContent(draft, base)) return { ok: true, rev: base.rev, value: outcome.value };
    const record: CardSlotV1 = { v: RECORD_VERSION, rev: nextRev, ...draft };
    try {
      const s = this.storage();
      if (!s) throw new StoreError('unavailable', 'write', this.key, new TypeError('no storage in this browser'));
      s.setItem(this.key, JSON.stringify(record));
    } catch (e) {
      const error = e instanceof StoreError ? new StoreError(e.kind, 'write', this.key, e.cause) : storeError('write', this.key, e);
      this.report(error);
      return fail({ kind: 'write-failed', error });
    }
    return { ok: true, rev: nextRev, value: outcome.value };
  }

  /** The folder `path` would be in must exist, and be a folder. */
  private checkParent(d: Draft, path: string): Refusal | undefined {
    const parent = parentOf(path);
    if (parent === '') return undefined;
    if (d.files[parent]) return fail({ kind: 'wrong-kind', path: parent, is: 'file' });
    if (!d.dirs[parent]) return fail({ kind: 'no-entry', path: parent });
    return undefined;
  }
}

// ---- helpers ----

type Refusal = { readonly ok: false; readonly failure: CardFailure };

function fail(failure: CardFailure): Refusal {
  return { ok: false, failure };
}

function isRefusal(x: unknown): x is Refusal {
  return typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false && 'failure' in x;
}

function refusalOf(loaded: Loaded): Refusal | undefined {
  if (loaded.kind === 'no-storage') return fail({ kind: 'no-card' });
  if (loaded.kind === 'damaged') return fail({ kind: 'damaged', reason: loaded.reason });
  return undefined;
}

/** An inserted, formatted, empty card at revision 0: what a missing key is (KNOWN [card-folder]). */
function freshCard(): CardSlotV1 {
  return { v: RECORD_VERSION, rev: 0, present: true, formatted: true, files: dict({}), dirs: dict({}), ext: dict({}) };
}

/**
 * A table with no prototype: a card path or namespace such as `constructor` or `__proto__` is an ordinary key in it,
 * never a property of `Object.prototype` read or set by accident.
 */
function dict<T>(from: Readonly<Record<string, T>>): Record<string, T> {
  return Object.assign(Object.create(null) as Record<string, T>, from);
}

/**
 * The stub's used clusters (`mcUsedClusters`, MemoryCard.cpp:245-288): one per folder (:262-266), each file's size
 * rounded up to clusters (:280), never more than the card (:281-287).
 */
function usedClusters(r: Pick<CardSlotV1, 'files' | 'dirs'>): number {
  let n = Object.keys(r.dirs).length;
  for (const f of Object.values(r.files)) n += clustersFor(f.size);
  return Math.min(n, CARD_TOTAL_CLUSTERS);
}

/** Why `path` is not a card path (`''` when it is): segments joined by `/`, none empty, `.` or `..`. */
function checkPath(path: unknown): string {
  if (typeof path !== 'string' || path === '') return 'a path is a non-empty string';
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return `"${path}" is not a card path (a/b, no empty, . or .. part)`;
    // eslint-disable-next-line no-control-regex
    if (/[\\\x00-\x1f\x7f]/.test(seg)) return `"${path}" holds a backslash or a control character (C0 or DEL)`;
  }
  return '';
}

/** The stub's GetDir order: by the name lower-cased in ASCII, compared code unit by code unit (MemoryCard.cpp:1099-1104); a tie (two names differing only in case, which the card's case-sensitive names allow) by the name itself. */
function byStubOrder(a: CardEntry, b: CardEntry): number {
  const la = lowerAscii(a.name);
  const lb = lowerAscii(b.name);
  if (la !== lb) return la < lb ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** `toLowerAscii`: A-Z only, as the stub lowers. */
function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/** Whether a draft holds what its base held (the card's state, its tables, `ext`), as stored. */
function sameContent(d: Draft, base: CardSlotV1): boolean {
  const content = (r: Pick<CardSlotV1, 'present' | 'formatted' | 'files' | 'dirs' | 'ext'>): string =>
    JSON.stringify([r.present, r.formatted, r.files, r.dirs, r.ext]);
  return content(d) === content(base);
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function kindAt(r: Pick<CardSlotV1, 'files' | 'dirs'>, path: string): 'file' | 'dir' | undefined {
  if (Object.hasOwn(r.files, path)) return 'file';
  if (Object.hasOwn(r.dirs, path)) return 'dir';
  return undefined;
}

/** `value` through JSON: a copy, or why it is not JSON (undefined, a function, a cycle, a BigInt). */
function jsonCopy(value: unknown): { ok: true; value: unknown; chars: number } | { ok: false; reason: string } {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (e) {
    return { ok: false, reason: `not JSON: ${String(e)}` };
  }
  if (text === undefined) return { ok: false, reason: 'not JSON: nothing to write' };
  return { ok: true, value: JSON.parse(text) as unknown, chars: text.length };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** The stored text as a record, or why it is damaged (with any revision still legible in it). */
function parseRecord(raw: string): Loaded {
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return { kind: 'damaged', reason: 'the record is not JSON', legibleRev: undefined, legibleExt: undefined };
  }
  const legibleRev = isPlainObject(x) && Number.isSafeInteger(x.rev) && (x.rev as number) >= 0 ? (x.rev as number) : undefined;
  const legibleExt = isPlainObject(x) && isPlainObject(x.ext) ? x.ext : undefined;
  const damaged = (reason: string): Loaded => ({ kind: 'damaged', reason, legibleRev, legibleExt });
  if (!isPlainObject(x)) return damaged('the record is not an object');
  if (x.v !== RECORD_VERSION) return damaged(`unknown record version ${JSON.stringify(x.v)}`);
  if (legibleRev === undefined) return damaged('rev is not a whole number');
  if (typeof x.present !== 'boolean') return damaged('present is not a boolean');
  if (typeof x.formatted !== 'boolean') return damaged('formatted is not a boolean');
  if (!isPlainObject(x.files)) return damaged('files is not an object');
  if (!isPlainObject(x.dirs)) return damaged('dirs is not an object');
  if (!isPlainObject(x.ext)) return damaged('ext is not an object');
  const files = x.files;
  const dirs = x.dirs;
  for (const [path, d] of Object.entries(dirs)) {
    if (checkPath(path)) return damaged(`a folder's path: ${checkPath(path)}`);
    if (!isPlainObject(d) || !Number.isFinite(d.mtime)) return damaged(`folder "${path}" has no time`);
  }
  for (const [path, f] of Object.entries(files)) {
    if (checkPath(path)) return damaged(`a file's path: ${checkPath(path)}`);
    if (!isPlainObject(f)) return damaged(`file "${path}" is not an object`);
    if (!Number.isSafeInteger(f.size) || (f.size as number) < 0) return damaged(`file "${path}" has no size`);
    if (!Number.isFinite(f.mtime)) return damaged(`file "${path}" has no time`);
    if (!Object.hasOwn(f, 'data')) return damaged(`file "${path}" has no data`);
    if (Object.hasOwn(dirs, path)) return damaged(`"${path}" is both a file and a folder`);
  }
  for (const path of [...Object.keys(files), ...Object.keys(dirs)]) {
    const parent = parentOf(path);
    if (parent !== '' && !Object.hasOwn(dirs, parent)) return damaged(`"${path}" is in no folder`);
  }
  if (!x.formatted && (Object.keys(files).length > 0 || Object.keys(dirs).length > 0)) {
    return damaged('an unformatted card holds entries');
  }
  return {
    kind: 'record',
    record: {
      v: RECORD_VERSION, rev: legibleRev, present: x.present, formatted: x.formatted,
      files: dict(files as Record<string, CardFileV1>), dirs: dict(dirs as Record<string, CardDirV1>), ext: dict(x.ext),
    },
  };
}
