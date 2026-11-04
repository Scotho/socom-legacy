import {PackRefusal,type PackMap,type TexturePackIndexEntry} from './texturePack';
import { idbPackDatabase, PackDependencyChanged, PackStorageError, type PackMigrationPart, type PackWriteOptions } from './packs/storage';
import { memberAt, type NativeIdentityWriter, type NativePackIdentity } from './packs/identity';
import type { CheckReport } from '@s2u/creator-contracts';

/**
 * GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track): the test room's uploaded texture packs, kept in the
 * page's own IndexedDB (this origin, this browser; nothing leaves it) -- a browser adaptation with no original (H135).
 * One record a pack per map and id (its library entry, its size, its file names), the files themselves beside it; a
 * staged record is another map's upload waiting for that map to be loaded (`texturePackUpload.ts`, `stagedFiles`).
 * Bounded by the two limits below, chosen for the instrument (not console values). Every call that fails at the
 * storage rejects as `UploadStoreUnavailable` with its reason, so the served library keeps working without it.
 */
export const UPLOADED_PACKS_BYTES_LIMIT = 512 * 1024 * 1024;
export const UPLOADED_PACKS_PER_MAP_LIMIT = 32;
/** The database's name and version (ours, not the game's), its record store and its file store. */
export const UPLOADED_PACKS_DB = 's2u.texturePacks';
export const UPLOADED_PACKS_DB_VERSION = 1;
const RECORDS = 'records', FILES = 'files';
/** How long an opening may take before the store is called unavailable (another tab's connection can hold it for ever). */
export const UPLOADED_PACKS_OPEN_TIMEOUT_MS = 5000;

export type UploadState = 'pack' | 'staged';
/** A stored upload: `key` is `<map>/<id>`; `files` name the stored files (`<key>/<file>` in the file store); `added` orders them. */
export interface UploadedRecord {key: string; map: PackMap; id: string; state: UploadState; entry: TexturePackIndexEntry; bytes: number; files: string[]; added: number}
/** What a backend does: the records, a file, a record written with its files, a record removed with its files -- each atomic. */
export interface UploadBackend {
  inspect?: NativeIdentityWriter['inspect'];
  identify?: NativeIdentityWriter['identify'];
  catalogue?(): Promise<{ record: UploadedRecord; identity?: NativePackIdentity; report?: CheckReport }[]>;
  records(): Promise<UploadedRecord[]>;
  file(key: string): Promise<Uint8Array | undefined>;
  put(record: UploadedRecord, files: Map<string, Uint8Array>, options?: UploadWriteOptions): Promise<void>;
  remove(record: UploadedRecord, options?: UploadWriteOptions): Promise<void>;
  snapshot?(key: string): Promise<{ generation: number; record?: UploadedRecord; files: Map<string, Uint8Array> }>;
  observe?(key: string): Promise<{ generation: number; record?: UploadedRecord; identity?: NativePackIdentity }>;
  change?<T>(edit: (records: readonly UploadedRecord[]) => UploadChange<T>, options?: UploadWriteOptions): Promise<T>;
}
/** The storage could not be used: missing, refused, blocked, or failed; the reason is the message. */
export class UploadStoreUnavailable extends Error {constructor(reason: string, readonly code?: string) {super(reason); this.name = 'UploadStoreUnavailable';}}

/** The tests' backend, and a page without IndexedDB could use it for a visit. */
export function memoryUploadBackend(): UploadBackend {
  const records = new Map<string, UploadedRecord>(), files = new Map<string, Uint8Array>();
  const identities = new Map<string, NativePackIdentity>();
  const reports = new Map<string, CheckReport>();
  return {
    catalogue: async () => [...records.values()].map(record => ({ record: structuredClone(record), identity: identities.get(record.key),
      report: identities.get(record.key)?.report ?? reports.get(record.key) })),
    records: async () => [...records.values()].map(r => structuredClone(r)),
    file: async key => files.get(key)?.slice(),
    put: async (record, blobs, request) => { records.set(record.key, structuredClone(record));
      if (request?.identity) identities.set(record.key, structuredClone(request.identity)); else identities.delete(record.key);
      if (!request?.identity && request?.validationReport) reports.set(record.key, structuredClone(request.validationReport)); else reports.delete(record.key);
      for (const [name, b] of blobs) files.set(`${record.key}/${name}`, b.slice()); },
    remove: async record => { records.delete(record.key); identities.delete(record.key); reports.delete(record.key); for (const name of record.files) files.delete(`${record.key}/${name}`); },
  };
}

const reasonOf = (e: unknown): string => e instanceof Error && e.message ? e.message : e instanceof DOMException ? e.name : String(e ?? 'unknown failure');
/**
 * The IndexedDB backend over the factory `factory` answers (the page's is `pageStore.ts`'s `pageIndexedDb`; a test passes
 * a fake). Each call opens the database and closes it after: uploads are rare, so no connection is held across a visit.
 */
interface TextureData { uploads: { record: UploadedRecord; files: { name: string; bytes: Uint8Array }[];
  identity?: NativePackIdentity; report?: CheckReport }[] }
export interface UploadWriteOptions extends PackWriteOptions { identity?: NativePackIdentity; validationReport?: CheckReport }
export interface UploadChange<T> { result: T; put?: { record: UploadedRecord; files: Map<string, Uint8Array> }; remove?: string[] }
function uploadFailure(error: unknown): UploadStoreUnavailable {
  return error instanceof UploadStoreUnavailable ? error : new UploadStoreUnavailable(reasonOf(error),
    error instanceof PackStorageError ? error.code : undefined);
}
export function idbUploadBackend(factory: () => IDBFactory | null | undefined, options: {name?: string; openTimeoutMs?: number} = {}): UploadBackend {
  const name = options.name ?? UPLOADED_PACKS_DB, timeout = options.openTimeoutMs ?? UPLOADED_PACKS_OPEN_TIMEOUT_MS;
  const db = idbPackDatabase(factory, { openTimeoutMs: timeout });
  const openLegacy = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    let settled = false;
    const fail = (reason: string): void => {
      if (settled) return; settled = true; clearTimeout(timer); reject(new UploadStoreUnavailable(reason));
    };
    const timer = setTimeout(() => fail('the pack store did not open in time'), timeout);
    let request: IDBOpenDBRequest;
    try {
      const idb = factory();
      if (!idb) { fail('no IndexedDB in this browser'); return; }
      request = idb.open(name, UPLOADED_PACKS_DB_VERSION);
    } catch (e) { fail(reasonOf(e)); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECORDS)) request.result.createObjectStore(RECORDS, { keyPath: 'key' });
      if (!request.result.objectStoreNames.contains(FILES)) request.result.createObjectStore(FILES);
    };
    request.onsuccess = () => { if (settled) { request.result.close(); return; } settled = true; clearTimeout(timer); resolve(request.result); };
    request.onerror = () => fail(reasonOf(request.error));
    request.onblocked = () => fail('another tab holds an older version of the pack store');
  });
  const legacyRecords = async (): Promise<UploadedRecord[]> => {
    const old = await openLegacy();
    try { return await new Promise((resolve, reject) => {
      const tx = old.transaction(RECORDS, 'readonly'), records = tx.objectStore(RECORDS).getAll();
      tx.onabort = () => reject(uploadFailure(tx.error));
      tx.oncomplete = () => resolve(records.result as UploadedRecord[]);
    }); } finally { old.close(); }
  };
  const legacyFile = async (key: string): Promise<Uint8Array | null> => {
    const old = await openLegacy();
    try { return await new Promise((resolve, reject) => {
      const tx = old.transaction(FILES, 'readonly'), cursor = tx.objectStore(FILES).openCursor(key);
      let bytes: Uint8Array | null = null;
      cursor.onsuccess = () => {
        const value: unknown = cursor.result?.value;
        bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
      };
      tx.onabort = () => reject(uploadFailure(tx.error)); tx.oncomplete = () => resolve(bytes);
    }); } finally { old.close(); }
  };
  const legacyParts = async function* (): AsyncIterable<PackMigrationPart> {
    const records = await legacyRecords(), uploads: { record: UploadedRecord; files: { name: string; bytes: null }[] }[] = [];
    for (const record of records) {
      const files: { name: string; bytes: null }[] = [], index = uploads.length;
      for (const name of record.files) {
        const bytes = await legacyFile(`${record.key}/${name}`);
        if (!bytes) continue;
        yield { type: 'bytes', path: ['uploads', index, 'files', files.length, 'bytes'], bytes };
        files.push({ name, bytes: null });
      }
      uploads.push({ record, files });
    }
    yield { type: 'metadata', data: { uploads } };
  };
  const migrated = async (signal?: AbortSignal): Promise<void> => { await db.migrate('textures', legacyParts, signal); };
  const legacy = async (): Promise<TextureData> => { throw new UploadStoreUnavailable('the texture migration marker is missing; retry'); };
  const guard = async <T>(work: () => Promise<T>): Promise<T> => { try { return await work(); } catch (e) { throw uploadFailure(e); } };
  const selected = async <T>(choose: (data: TextureData) => (string | number)[] | null): Promise<{ generation: number; data?: T }> => {
    await migrated();
    // Indexes may move between these two readonly transactions. Compare their generations before using any bytes.
    for (let attempt = 0; attempt < 2; attempt++) {
      const metadata = await db.peek('textures');
      if (!metadata) throw new UploadStoreUnavailable('the texture migration marker is missing; retry');
      const path = choose(metadata.data as TextureData);
      if (!path) return { generation: metadata.generation };
      const scope = await db.readAt<T>('textures', path);
      if (scope && scope.generation === metadata.generation) return { generation: scope.generation, data: scope.data };
    }
    throw new PackStorageError('CONFLICT', 'The uploaded texture packs changed while reading; retry.');
  };
  const change = async <T>(edit: (records: readonly UploadedRecord[]) => UploadChange<T>, request?: UploadWriteOptions): Promise<T> => {
    let result!: T, refused: unknown;
    try {
      await migrated(request?.signal);
      await db.patch('textures', legacy, data => {
        let plan: UploadChange<T>;
        try { plan = edit(data.uploads.map(upload => upload.record)); } catch (e) { refused = e; throw e; }
        result = plan.result;
        let uploads = data.uploads.filter(upload => !plan.remove?.includes(upload.record.key) && upload.record.key !== plan.put?.record.key);
        if (plan.put) uploads = [...uploads, { record: plan.put.record, identity: request?.identity, report: request?.validationReport,
          files: [...plan.put.files].map(([name, bytes]) => ({ name, bytes })) }];
        return { uploads };
      }, request);
    } catch (e) { if (refused) throw refused; if (e instanceof PackDependencyChanged) throw e; throw uploadFailure(e); }
    return result;
  };
  return {
    inspect: async (key, signal) => {
      await migrated(signal); const scope = await db.peek('textures');
      if (!scope) return null;
      const data = scope.data as TextureData, index = data.uploads.findIndex(upload => upload.record.key === key);
      if (index === -1) return null;
      const upload = data.uploads[index]!;
      return { database: db, kind: 'textures', generation: scope.generation, refPath: ['uploads', index, 'identity', 'ref'], identity: upload.identity,
        files: upload.files.map((file, fileIndex) => memberAt(db, scope, ['uploads', index, 'files', fileIndex, 'bytes'], file.name, signal)) };
    },
    identify: async (key, identity, request) => {
      await migrated(request.signal);
      await db.patch('textures', legacy, data => {
        if (!data.uploads.some(upload => upload.record.key === key)) throw new PackStorageError('CONFLICT', 'The selected texture upload changed.');
        return { uploads: data.uploads.map(upload => upload.record.key === key ? { ...upload, identity, report: undefined } : upload) };
      }, request);
    },
    catalogue: async () => {
      await migrated(); const scope = await db.peek('textures');
      return (scope?.data as TextureData | undefined)?.uploads.map(upload => ({ record: upload.record,
        identity: upload.identity, report: upload.identity?.report ?? upload.report })) ?? [];
    },
    records: () => guard(async () => {
      await migrated();
      const scope = await db.peek('textures');
      if (!scope) throw new UploadStoreUnavailable('the texture migration marker is missing; retry');
      return (scope.data as TextureData).uploads.map(upload => upload.record);
    }),
    file: key => guard(async () => {
      const value = await selected<Uint8Array>(data => {
        for (let upload = 0; upload < data.uploads.length; upload++) {
          const item = data.uploads[upload]!;
          const file = item.files.findIndex(file => `${item.record.key}/${file.name}` === key);
          if (file !== -1) return ['uploads', upload, 'files', file, 'bytes'];
        }
        return null;
      });
      return value.data;
    }),
    snapshot: key => guard(async () => {
      const scope = await selected<TextureData['uploads'][number]>(data => {
        const index = data.uploads.findIndex(item => item.record.key === key);
        return index === -1 ? null : ['uploads', index];
      });
      return { generation: scope.generation, record: scope.data?.record, files: new Map(scope.data?.files.map(file => [file.name, file.bytes])) };
    }),
    observe: key => guard(async () => {
      await migrated();
      const scope = await db.peek('textures');
      if (!scope) throw new UploadStoreUnavailable('the texture migration marker is missing; retry');
      const selected = (scope.data as TextureData).uploads.find(upload => upload.record.key === key);
      return { generation: scope.generation, record: selected?.record, identity: selected?.identity };
    }),
    change,
    put: async (record, files, request) => { await change(() => ({ result: undefined, put: { record, files } }), request); },
    remove: async (record, request) => { await change(() => ({ result: undefined, remove: [record.key] }), request); },
  };
}
const size = (n: number): string => n >= 1024 * 1024 ? `${n / 1024 / 1024} MiB` : `${n} bytes`;
/** The store's rules over a backend: per map, bounded, a known id never written twice, every storage failure named. */
export class UploadedPacks {
  constructor(private backend: UploadBackend, private limits: {bytes: number; perMap: number} = {bytes: UPLOADED_PACKS_BYTES_LIMIT, perMap: UPLOADED_PACKS_PER_MAP_LIMIT}) { }
  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (e) {
      throw e instanceof UploadStoreUnavailable || e instanceof PackRefusal || e instanceof PackDependencyChanged ? e : uploadFailure(e);
    }
  }
  private all(): Promise<UploadedRecord[]> { return this.guard(() => this.backend.records()); }
  /** Browser-local catalogue, across maps. Returns metadata only, never the stored file bytes. */
  async listAll(): Promise<UploadedRecord[]> {
    return (await this.all()).sort((a, b) => a.added - b.added);
  }
  async catalogue(): Promise<{ record: UploadedRecord; identity?: NativePackIdentity; report?: CheckReport }[]> {
    const rows = this.backend.catalogue ? await this.guard(() => this.backend.catalogue!()) : (await this.all()).map(record => ({ record }));
    return rows.sort((a, b) => a.record.added - b.record.added);
  }
  get identityWriter(): NativeIdentityWriter | undefined {
    return this.backend.inspect && this.backend.identify ? { inspect: this.backend.inspect, identify: this.backend.identify } : undefined;
  }
  /** The map's uploads, packs and staged, in the order they were added. */
  async list(map: PackMap): Promise<UploadedRecord[]> {
    return (await this.all()).filter(r => r.map === map).sort((a, b) => a.added - b.added);
  }
  /** A stored file of one upload, or null. */
  async file(map: PackMap, id: string, name: string): Promise<Uint8Array | null> {
    return (await this.guard(() => this.backend.file(`${map}/${id}/${name}`))) ?? null;
  }
  async usage(): Promise<{bytes: number; records: number}> {
    const all = await this.all();
    return {bytes: all.reduce((n, r) => n + r.bytes, 0), records: all.length};
  }
  /** The bytes a new upload of `map` may take (review F2); a map already at its count is refused with the reason. */
  async room(map: PackMap): Promise<number> {
    const all = await this.all(), onMap = all.filter(r => r.map === map).length;
    if (onMap >= this.limits.perMap) throw new PackRefusal(`${map} already holds ${onMap} uploaded packs; remove one first`);
    return Math.max(0, this.limits.bytes - all.reduce((n, r) => n + r.bytes, 0));
  }
  /** Adds an upload with its files; 'exists' (nothing written) for an id the map already holds; over a limit, refused with the reason. */
  async add(map: PackMap, state: UploadState, entry: TexturePackIndexEntry, files: Map<string, Uint8Array>, request?: UploadWriteOptions): Promise<'added' | 'exists'> {
    return this.put(map, null, state, entry, files, request);
  }
  /**
   * Review F3: replaces the upload `oldId` (a staged one) by `entry`, the old one left out of both limits -- it is
   * removed once the new one is written -- so a staged upload is never counted twice against its own pack.
   */
  async replace(map: PackMap, oldId: string, state: UploadState, entry: TexturePackIndexEntry, files: Map<string, Uint8Array>): Promise<'added' | 'exists'> {
    return this.put(map, oldId, state, entry, files);
  }
  private async put(map: PackMap, oldId: string | null, state: UploadState, entry: TexturePackIndexEntry, files: Map<string, Uint8Array>, request?: UploadWriteOptions): Promise<'added' | 'exists'> {
    const prepare = (every: readonly UploadedRecord[]): UploadChange<'added' | 'exists'> => {
      const current = request?.identity ? every.find(record => record.key === `${map}/${entry.id}`) : undefined;
      // Checked native-slot replacement writes these bytes and their identity together. An ordinary duplicate
      // add still keeps the first payload; it can never acquire certification of different submitted bytes.
      const plan = this.prepare(every, map, current ? entry.id : oldId, state, entry, files);
      if (current && plan.put) plan.put.record.added = current.added;
      return plan;
    };
    if (this.backend.change) return this.guard(() => this.backend.change!(prepare, request));
    const plan = prepare(await this.all());
    if (plan.put) await this.guard(() => this.backend.put(plan.put!.record, plan.put!.files, request));
    for (const key of plan.remove ?? []) {
      const old = (await this.all()).find(record => record.key === key);
      if (old) await this.guard(() => this.backend.remove(old));
    }
    return plan.result;
  }
  private prepare(every: readonly UploadedRecord[], map: PackMap, oldId: string | null, state: UploadState,
    entry: TexturePackIndexEntry, files: Map<string, Uint8Array>): UploadChange<'added' | 'exists'> {
    const key = `${map}/${entry.id}`, old = every.find(r => oldId !== null && r.key === `${map}/${oldId}`);
    const all = every.filter(r => r !== old);
    if (all.some(r => r.key === key)) return { result: 'exists', ...(old ? { remove: [old.key] } : {}) };
    const onMap = all.filter(r => r.map === map).length;
    if (onMap >= this.limits.perMap) throw new PackRefusal(`${map} already holds ${onMap} uploaded packs; remove one first`);
    const used = all.reduce((n, r) => n + r.bytes, 0), bytes = [...files.values()].reduce((n, b) => n + b.byteLength, 0);
    if (used + bytes > this.limits.bytes) throw new PackRefusal(`the browser's pack store would pass its limit of ${size(this.limits.bytes)} (${used} + ${bytes} bytes in use and new)`);
    const record: UploadedRecord = {key, map, id: entry.id, state, entry, bytes, files: [...files.keys()], added: every.reduce((n, r) => Math.max(n, r.added), 0) + 1};
    return { result: 'added', put: { record, files }, ...(old && old.key !== key ? { remove: [old.key] } : {}) };
  }
  /** Removes an upload and its files; an id the map does not hold is nothing to do. */
  async remove(map: PackMap, id: string, options?: UploadWriteOptions): Promise<void> {
    if (this.backend.change) { await this.guard(() => this.backend.change!(() => ({ result: undefined, remove: [`${map}/${id}`] }), options)); return; }
    const record = (await this.all()).find(r => r.key === `${map}/${id}`);
    if (record) await this.guard(() => this.backend.remove(record, options));
  }
  /** One native observation: selected bytes and the generation their delete must compare. */
  async snapshot(map: PackMap, id: string): Promise<{ generation?: number; record?: UploadedRecord; files: Map<string, Uint8Array> }> {
    if (this.backend.snapshot) return this.guard(() => this.backend.snapshot!(`${map}/${id}`));
    const record = (await this.all()).find(item => item.key === `${map}/${id}`), files = new Map<string, Uint8Array>();
    for (const name of record?.files ?? []) { const value = await this.file(map, id, name); if (value) files.set(name, value); }
    return { record, files };
  }
  /** Metadata and CAS observation without fetching texture payloads. */
  async observe(map: PackMap, id: string): Promise<{ generation?: number; record?: UploadedRecord; identity?: NativePackIdentity }> {
    if (this.backend.observe) return this.guard(() => this.backend.observe!(`${map}/${id}`));
    return { record: (await this.all()).find(record => record.key === `${map}/${id}`) };
  }
}
