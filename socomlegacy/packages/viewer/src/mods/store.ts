/**
 * The test room's mods, kept in this browser (`TEST_ROOM_MODS_ADAPTATION`). File bytes, the order and the switches.
 * The factory comes from `pageStore.ts` `pageIndexedDb`; this file does not name the browser's storage globals.
 * Nothing here is committed, and nothing is executed.
 */
import type { ModChoices } from './choices';
import { EMPTY_MOD_CHOICES, parseModChoices } from './choices';
import { idbPackDatabase, PackDependencyChanged, PackStorageError, type PackWriteOptions } from '../packs/storage';
import { memberAt, type NativeIdentityWriter, type NativePackIdentity } from '../packs/identity';
import type { CheckReport } from '@s2u/creator-contracts';

export const MODS_DB = 's2u.testRoomMods';
export const MODS_DB_VERSION = 1;
const PACKAGES = 'packages';
const CHOICES = 'choices';
const CHOICES_KEY = 'choices';

/** A mod the browser kept: the package's files, including `mod.json`. */
export interface StoredMod {
  id: string;
  label: string;
  files: { name: string; bytes: Uint8Array }[];
}

export class ModStoreError extends Error {
  constructor(readonly kind: 'quota' | 'unavailable' | 'failed' | 'conflict' | 'aborted', reason: string) {
    super(reason);
    this.name = 'ModStoreError';
  }
}

/** What the panel says when the browser refuses the write for space. */
export const MOD_QUOTA_MESSAGE = 'This browser has no room left to keep this mod. Remove a mod or free some space, then try again.';

export interface ModWriteOptions extends PackWriteOptions {
  identity?: NativePackIdentity; validationReport?: CheckReport;
}
export interface ModCatalogue {
  choices: ModChoices; packages: { id: string; label: string; files: number; bytes: number;
    identity?: NativePackIdentity; report?: CheckReport }[]; generation?: number;
}
export interface ModLibrary {
  inspect?: NativeIdentityWriter['inspect'];
  identify?: NativeIdentityWriter['identify'];
  /** `unavailable`: the store could not be opened (blocked, absent), so its empty answer is not an emptied store. */
  read(): Promise<{ choices: ModChoices; packages: StoredMod[]; unavailable?: true; generation?: number }>;
  /** Metadata only; the native registry list never reads package bytes. */
  list?(): Promise<ModCatalogue>;
  /** Writes one package. A full store throws `ModStoreError` of kind `quota` and leaves the old packages. */
  put(mod: StoredMod, options?: ModWriteOptions): Promise<void>;
  writeChoices(choices: ModChoices, options?: ModWriteOptions): Promise<void>;
  /** The person's explicit master action; unlike import it may change the master, even before the first mod. */
  setMaster?(enabled: boolean): Promise<void>;
  /** Drops one package's bytes. */
  remove(id: string, options?: ModWriteOptions): Promise<void>;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function isQuota(error: unknown): boolean {
  const e = typeof error === 'object' && error !== null ? error as { name?: unknown; code?: unknown } : {};
  const name = typeof e.name === 'string' ? e.name : '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

function failure(error: unknown): ModStoreError {
  if (error instanceof ModStoreError) return error;
  if (error instanceof PackStorageError) {
    if (error.code === 'QUOTA') return new ModStoreError('quota', MOD_QUOTA_MESSAGE);
    if (error.code === 'CONFLICT') return new ModStoreError('conflict', error.message);
    if (error.code === 'ABORTED') return new ModStoreError('aborted', error.message);
    if (error.code === 'UNAVAILABLE') return new ModStoreError('unavailable', error.message);
  }
  if (isQuota(error)) return new ModStoreError('quota', MOD_QUOTA_MESSAGE);
  const reason = error instanceof Error && error.message ? error.message : 'the mod store could not be used';
  return new ModStoreError('failed', reason);
}

function bytesOf(mod: StoredMod): number {
  return mod.files.reduce((n, file) => n + file.bytes.byteLength, 0);
}

/** A library in memory. `quota` is the sum of file bytes a `put` may reach; past it, the put is refused. */
export function memoryModLibrary(quota = Number.POSITIVE_INFINITY): ModLibrary {
  const packages = new Map<string, StoredMod>();
  const identities = new Map<string, NativePackIdentity>();
  const reports = new Map<string, CheckReport>();
  let choices = EMPTY_MOD_CHOICES;
  const used = (): number => [...packages.values()].reduce((n, mod) => n + bytesOf(mod), 0);
  return {
    async read() {
      return { choices, packages: [...packages.values()].map((mod) => ({ ...mod, files: mod.files.map((file) => ({ name: file.name, bytes: file.bytes.slice() })) })) };
    },
    async list() { return { choices, packages: [...packages.values()].map(pack => ({ id: pack.id, label: pack.label,
      files: pack.files.length, bytes: bytesOf(pack), identity: identities.get(pack.id),
      report: identities.get(pack.id)?.report ?? reports.get(pack.id) })) }; },
    async put(mod, options) {
      const next = used() - bytesOf(packages.get(mod.id) ?? { id: '', label: '', files: [] }) + bytesOf(mod);
      if (next > quota) throw new ModStoreError('quota', MOD_QUOTA_MESSAGE);
      if (!packages.has(mod.id)) choices = disabledImport(choices, mod.id);
      packages.set(mod.id, { id: mod.id, label: mod.label, files: mod.files.map((file) => ({ name: file.name, bytes: file.bytes.slice() })) });
      if (options?.identity) identities.set(mod.id, structuredClone(options.identity)); else identities.delete(mod.id);
      if (!options?.identity && options?.validationReport) reports.set(mod.id, structuredClone(options.validationReport));
      else reports.delete(mod.id);
    },
    async writeChoices(next) { choices = retainUnseenChoices(choices, next); },
    async setMaster(enabled) { choices = { ...choices, enabled }; },
    async remove(id) { packages.delete(id); identities.delete(id); reports.delete(id); },
  };
}

/**
 * The browser library. `factory` is asked at each call (`pageIndexedDb`). No factory: reads are empty and writes
 * throw `unavailable`, so the visit can still hold mods in memory.
 */
function legacyModReader(factory: () => IDBFactory | null | undefined): () => Promise<{ choices: ModChoices; packages: StoredMod[] }> {
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown): void => { if (settled) return; settled = true; clearTimeout(timer); reject(failure(error)); };
    const timer = setTimeout(() => fail(new ModStoreError('unavailable', 'the mod recovery store did not open in time')), 5000);
    let req: IDBOpenDBRequest;
    try {
      const idb = factory();
      if (!idb) throw new ModStoreError('unavailable', 'this browser has no place to keep mods');
      req = idb.open(MODS_DB, MODS_DB_VERSION);
    } catch (e) {
      fail(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PACKAGES)) db.createObjectStore(PACKAGES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CHOICES)) db.createObjectStore(CHOICES);
    };
    req.onsuccess = () => { if (settled) { req.result.close(); return; } settled = true; clearTimeout(timer); resolve(req.result); };
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new ModStoreError('unavailable', 'another tab holds an older version of the mod store'));
  });
  return async () => {
      const db = await open();
      try {
        const [packages, choices] = await Promise.all([
          new Promise<StoredMod[]>((resolve, reject) => {
            const req = db.transaction(PACKAGES, 'readonly').objectStore(PACKAGES).getAll();
            req.onsuccess = () => resolve((req.result as StoredMod[]).flatMap((mod) => {
              if (!mod || typeof mod.id !== 'string' || !Array.isArray(mod.files)) return [];
              const files = mod.files.flatMap((file) => {
                const bytes = asBytes(file?.bytes);
                return bytes && typeof file.name === 'string' ? [{ name: file.name, bytes }] : [];
              });
              return [{ id: mod.id, label: typeof mod.label === 'string' ? mod.label : mod.id, files }];
            }));
            req.onerror = () => reject(failure(req.error));
          }),
          new Promise<ModChoices>((resolve, reject) => {
            const req = db.transaction(CHOICES, 'readonly').objectStore(CHOICES).get(CHOICES_KEY);
            req.onsuccess = () => resolve(parseModChoices(typeof req.result === 'string' ? req.result : null));
            req.onerror = () => reject(failure(req.error));
          }),
        ]);
        return { choices, packages };
      } finally {
        db.close();
      }
  };
}

function disabledImport(choices: ModChoices, id: string): ModChoices {
  return { enabled: choices.enabled, order: choices.order.includes(id) ? [...choices.order] : [...choices.order, id],
    disabled: choices.disabled.includes(id) ? [...choices.disabled] : [...choices.disabled, id] };
}
/** A view cannot enable an imported id it never observed by dropping that id's disabled/order entries. */
function retainUnseenChoices(current: ModChoices, next: ModChoices): ModChoices {
  const unseen = current.order.filter(id => !next.order.includes(id));
  return { enabled: next.enabled, order: [...next.order, ...unseen],
    disabled: [...new Set([...next.disabled, ...unseen.filter(id => current.disabled.includes(id))])] };
}
interface ModData {
  choices: ModChoices; packages: StoredMod[]; sizes: Record<string, { files: number; bytes: number }>;
  identities?: Record<string, NativePackIdentity>;
  reports?: Record<string, CheckReport>;
}
/** Native writes share the pack registry's transaction; old stores are read only and kept as recovery sources. */
export function idbModLibrary(factory: () => IDBFactory | null | undefined): ModLibrary {
  const db = idbPackDatabase(factory), legacyRead = legacyModReader(factory);
  const legacy = async (): Promise<ModData> => {
    const old = await legacyRead();
    return { ...old, sizes: Object.fromEntries(old.packages.map(pack => [pack.id, { files: pack.files.length, bytes: bytesOf(pack) }])) };
  };
  const guard = async <T>(work: () => Promise<T>): Promise<T> => {
    try { return await work(); } catch (e) { if (e instanceof PackDependencyChanged) throw e; throw failure(e); }
  };
  return {
    async inspect(id, signal) {
      if (!await db.peek('mods')) await db.read('mods', legacy, signal);
      const scope = await db.peek('mods');
      if (!scope) return null;
      const data = scope.data as ModData, index = data.packages.findIndex(pack => pack.id === id);
      if (index === -1) return null;
      return { database: db, kind: 'mods', generation: scope.generation, refPath: ['identities', id, 'ref'], identity: data.identities?.[id],
        files: data.packages[index]!.files.map((file, fileIndex) => memberAt(db, scope, ['packages', index, 'files', fileIndex, 'bytes'], file.name, signal)) };
    },
    async identify(id, identity, request) {
      await guard(() => db.patch('mods', legacy, data => {
        if (!data.packages.some(pack => pack.id === id)) throw new PackStorageError('CONFLICT', 'The selected mod changed.');
        const reports = { ...data.reports }; delete reports[id];
        return { ...data, identities: { ...data.identities, [id]: identity }, reports };
      }, request));
    },
    async read() {
      try {
        const { data, generation } = await db.read('mods', legacy);
        return { choices: data.choices, packages: data.packages, generation };
      } catch (e) {
        const error = failure(e);
        if (error.kind === 'unavailable') return { choices: EMPTY_MOD_CHOICES, packages: [], unavailable: true };
        throw error;
      }
    },
    async list() {
      try {
        const meta = await db.peek('mods');
        const scope = meta ?? await db.read('mods', legacy);
        const data = scope.data as ModData;
        return { choices: data.choices, generation: scope.generation, packages: data.packages.map(pack => ({
          id: pack.id, label: pack.label, ...data.sizes[pack.id]!, identity: data.identities?.[pack.id],
          report: data.identities?.[pack.id]?.report ?? data.reports?.[pack.id],
        })) };
      } catch (e) {
        const error = failure(e);
        if (error.kind === 'unavailable') return { choices: EMPTY_MOD_CHOICES, packages: [] };
        throw error;
      }
    },
    async put(mod, options) {
      await guard(() => db.patch('mods', legacy, data => {
        const identities = { ...data.identities }, reports = { ...data.reports };
        if (options?.identity) identities[mod.id] = structuredClone(options.identity); else delete identities[mod.id];
        if (!options?.identity && options?.validationReport) reports[mod.id] = structuredClone(options.validationReport);
        else delete reports[mod.id];
        return {
          choices: data.packages.some(pack => pack.id === mod.id) ? data.choices : disabledImport(data.choices, mod.id),
          packages: [...data.packages.filter(pack => pack.id !== mod.id), mod],
          sizes: { ...data.sizes, [mod.id]: { files: mod.files.length, bytes: bytesOf(mod) } }, identities, reports,
        };
      }, options));
    },
    async writeChoices(choices, options) {
      await guard(() => db.patch('mods', legacy, data => ({ ...data, choices: retainUnseenChoices(data.choices, choices) }), options));
    },
    async setMaster(enabled) { await guard(() => db.patch('mods', legacy, data => ({ ...data, choices: { ...data.choices, enabled } }))); },
    async remove(id, options) {
      await guard(() => db.patch('mods', legacy, data => ({ ...data, packages: data.packages.filter(pack => pack.id !== id) }), options));
    },
  };
}

/**
 * The page's flag that this browser holds a mod (`MODS_SCOPE_ADAPTATION`): set when a first mod is kept, cleared when
 * the last goes. A boot without it opens no store (`lazyModLibrary`).
 */
export const MODS_PRESENT_KEY = 's2u.testroom.mods.v1';

/** The flag's store, as the page hands it: `localStorage`'s three calls, any of which may throw. */
export interface ModFlags { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/**
 * The mod library opened only once it is needed (`MODS_SCOPE_ADAPTATION`; #342's review, the medium): with no mod kept
 * in this browser, reading answers none and writing the choices does nothing, so a boot with no mods creates no
 * database. Putting a mod opens it and sets the flag. A flag store that throws (a private window, blocked site data)
 * reads as no mods; a put still tries the library, which says so if it fails.
 */
export function lazyModLibrary(flags: ModFlags, open: () => ModLibrary): ModLibrary {
  let lib: ModLibrary | null = null;
  const library = (): ModLibrary => (lib ??= open());
  const present = (): boolean => { try { return flags.getItem(MODS_PRESENT_KEY) === '1'; } catch { return false; } };
  const mark = (on: boolean): void => {
    try { if (on) flags.setItem(MODS_PRESENT_KEY, '1'); else flags.removeItem(MODS_PRESENT_KEY); } catch { /* no flag: the next boot reads none */ }
  };
  return {
    async read() {
      if (!present()) return { choices: EMPTY_MOD_CHOICES, packages: [] };
      const saved = await library().read();
      // A flag over an emptied store (the review's F2) -- not over one that could not be opened (the re-review's N3).
      if (saved.packages.length === 0 && !saved.unavailable) mark(false);
      return saved;
    },
    async list() {
      if (!present()) return { choices: EMPTY_MOD_CHOICES, packages: [] };
      const current = library();
      if (current.list) return current.list();
      const saved = await current.read();
      return { choices: saved.choices, generation: saved.generation,
        packages: saved.packages.map(pack => ({ id: pack.id, label: pack.label, files: pack.files.length, bytes: bytesOf(pack) })) };
    },
    async put(mod, options) {
      await library().put(mod, options);
      mark(true);
    },
    async writeChoices(choices, options) {
      if (present()) await library().writeChoices(choices, options);
    },
    async setMaster(enabled) { const current = library(); if (current.setMaster) await current.setMaster(enabled);
      else await current.writeChoices({ ...(await current.read()).choices, enabled }); },
    async remove(id, options) {
      if (!present()) return;
      await library().remove(id, options);
      if ((await library().read()).packages.length === 0) mark(false);
    },
  };
}
