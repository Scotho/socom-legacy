/**
 * Browser-local package API, a product adaptation. Only explicit user-granted folders or staged File capabilities
 * can supply bytes. No gateway, fetch, script execution or original-client behavior lives here. Public results and
 * progress are bounded metadata. The view supplies live drivers and owns any model templates it accepts.
 */
import { checkRecord, readSaved, type LayoutRecord } from '../forge/record';
import { isAuthoringEnvelope } from '../forge/rulesAuthoring';
import { checkReport, createSha256, diagnostic, ENGINE_CONTRACT_VERSION, FORGE_BUNDLE_FILE, PACK_TARGET_US, satisfiesRange, sha256Hex, validateForgeBundle, validatePack, type AvailablePack, type BufferedPackFile, type CheckReport, type PackContext, type PackFile, type PackKind, type PackManifest, type PackRef } from '@s2u/creator-contracts';
import { idbPackDatabase, PackDependencyChanged, PackStorageError, sharesPackDatabase, type PackDatabase, type PackFence } from './storage';
import type { NativeIdentityWriter, NativePackIdentity, NativePackObservation } from './identity';
import { validateLegacyPack } from './adapters';
import { readSaveList, SAVE_LIMIT, writeSaves, type Store } from '../forge/saves';
import { pageIndexedDb, pageSettings } from '../pageStore';
import { idbModLibrary, MODS_PRESENT_KEY, ModStoreError, type ModCatalogue, type ModLibrary, type ModWriteOptions } from '../mods/store';
import { modPackageFromEntries, type ModPackage } from '../mods/readPackage';
import { parseModManifestBytes, type ModManifest } from '../mods/manifest';
import { modelPackFiles, parseModelManifest, type PackEntry } from '../modelPack';
import type { LoadedModelPack, ModelPackSlot } from '../modelPackRuntime';
import { packMap, sha256, validateManifest, type PackProvenance } from '../texturePack';
import { buildUploadPart, plainProvenance, readUpload, type BuiltUpload, type PlainLoad } from '../texturePackUpload';
import { idbUploadBackend, UploadedPacks, UploadStoreUnavailable } from '../texturePackStore';
import { blobSource, bytesSource, openZip, safeMemberName } from '../zipReader';
import { HdNotServed, importHdZip, installHdFromSource, pageHdStore, type HdPackSource, type HdStore, type HdStoredMeta } from '../hdTexturePackStore';
import { HdRefusal } from '../hdTexturePack';
import { EMPTY_MOD_CHOICES } from '../mods/choices';
import { classifyDrop, STORE_MANIFEST_READ_BYTES, type ClassifyOptions, type ReadSmall } from './classify';
import { CUSTOM_MAP_ALREADY_HERE, CUSTOM_MAP_PACKS_KEPT, CUSTOM_MAP_PREFIX, customMapId, customMapMissing, customMapRequires, emptyCustomMaps,
  type CustomMapData, type CustomMapRecord } from './customMaps';
import { browserChannel, isTextureChoice, modsStateStore, type ChannelFactory, type ModChoices, type ModelSwitches, type ModsState, type PackFlags } from './modsState';
import { checkLocalRead, inspectLocalZip, LOCAL_FILE_LIMITS, LocalFileError, legacyExtensions, localPath, localWait, readLocalPath, readPickedFiles, unpackLocalZip,
  type LocalDirectoryHandle, type LocalEntry, type LocalFile, type LocalPackErrorCode, type LocalReadOptions } from '../agent/localFiles';

export type { LocalDirectoryHandle, LocalFile, LocalPackErrorCode } from '../agent/localFiles';
/**
 * `pack` (FCW-33): a v2 pack, its `s2u-pack.json` at the root; imported through `install`, stored, never applied live.
 * `hd` (B206 ML-1, ML.R7): the HD pack, kept in its own database (`../hdTexturePackStore`), one at a time; installed by
 * `hd.install` or `importDrop`, never through `stage` (its zip is far above `LOCAL_FILE_LIMITS`).
 * `custom-map` (FP-5, FP.R12): a forge-map bundle kept read-only (`./customMaps`), reached by `importDrop` only; its packs
 * are v2 packs beside it, kept when it is removed.
 */
export type LocalPackKind = 'map' | 'mod' | 'model' | 'texture' | 'pack' | 'hd' | 'custom-map';
export interface LocalPackDiagnostic { code: string; count: number }
export interface LocalPackSummary {
  id: string; kind: LocalPackKind | 'unknown'; name: string; files: number; bytes: number; digest?: string;
  staged: boolean; imported: boolean; stored: boolean; enabled: boolean; applied: boolean;
  diagnostics: LocalPackDiagnostic[]; report?: CheckReport;
  /** Framework identity is separate from legacy facade ids such as mod:demo and model:current. */
  ref?: PackRef | null; validation?: 'pending-validation' | 'validated'; packKinds?: readonly PackKind[]; slot?: 'ordered-mod' | 'primary' | 'second' | 'per-map' | 'independent';
  /** FP-5 (a custom map): the packs its layout stands on, and those this device does not hold now (recomputed at each list). */
  requires?: PackRef[]; missing?: PackRef[];
}
export interface LocalPackResult extends LocalPackSummary { removed?: true }
export class LocalPackError extends LocalFileError {
  constructor(code: LocalPackErrorCode, message: string, readonly result?: LocalPackResult, readonly report?: CheckReport) { super(code, message); this.name = 'LocalPackError'; }
}
export interface LocalPackProgress {
  operation: 'stage' | 'import' | 'remove'; phase: 'reading' | 'validating' | 'storing' | 'applying' | 'complete' | 'error';
  files: number; bytes: number; code?: LocalPackErrorCode;
}
export interface LocalModelLibrary {
  inspect?(slot: ModelPackSlot, signal?: AbortSignal): Promise<NativePackObservation | null>;
  identify?(slot: ModelPackSlot, identity: NativePackIdentity, options: ModWriteOptions): Promise<void>;
  read(slot?: ModelPackSlot): Promise<readonly PackEntry[] | null>;
  put(entries: readonly PackEntry[], slot?: ModelPackSlot, options?: ModWriteOptions): Promise<void>;
  remove(slot?: ModelPackSlot, options?: ModWriteOptions): Promise<void>;
  list?(): Promise<{ generation?: number; slots: { slot: ModelPackSlot; files: number; bytes: number; identity?: NativePackIdentity; report?: CheckReport }[] }>;
  snapshot?(slot?: ModelPackSlot): Promise<{ generation: number; present: boolean; entries: readonly PackEntry[] | null; identity?: NativePackIdentity }>;
}
export interface LocalTextureContext extends PlainLoad { archive: Uint8Array; toolCommit: string }
export interface LocalPackOptions {
  mods?: ModLibrary; maps?: Store; models?: LocalModelLibrary; textures?: UploadedPacks;
  allowedSurface?(kind: LocalPackKind): boolean;
  /** Query the actual live runtime, including packs enabled before this API was created. */
  isApplied?(kind: LocalPackKind, id: string): boolean;
  applyMap?(record: LayoutRecord, signal: AbortSignal): Promise<void> | void;
  applyMod?(pack: ModPackage, manifest: ModManifest, signal: AbortSignal): Promise<void> | void;
  applyModel?(pack: LoadedModelPack, signal: AbortSignal): Promise<void> | void;
  applyTexture?(pack: BuiltUpload, signal: AbortSignal): Promise<void> | void;
  loadedTextures?(): LocalTextureContext | Promise<LocalTextureContext>;
  /** Uninstall before deleting an active pack; without this driver active removal is refused. */
  deactivate?(kind: LocalPackKind, id: string, signal: AbortSignal): Promise<void> | void;
  onProgress?(event: LocalPackProgress): void;
}
export interface LocalPackImport { kind: LocalPackKind; path?: string; stagedId?: string; name?: string; apply?: boolean }
export interface LocalPackApi {
  stage(files: readonly LocalFile[], options?: { signal?: AbortSignal }): Promise<LocalPackSummary[]>;
  setDirectory(handle: LocalDirectoryHandle | null): void;
  list(): Promise<LocalPackSummary[]>;
  import(input: LocalPackImport, options?: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult>;
  remove(id: string, options?: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult>;
  subscribe(listener: (event: LocalPackProgress) => void): () => void;
  dispose(): void;
}
export interface PackRegistryOptions extends LocalPackOptions {
  /** Build constants by default; an extension host may supply its published dependency and handler context. */
  context?: PackContext; database?: PackDatabase;
  /**
   * B206 ML-1: the HD library (`../hdTexturePackStore`). Absent: the page's (`pageHdStore`) when the mods are the
   * page's too, else none -- a test that hands its own libraries has no HD pack unless it hands one. Null: none.
   */
  hd?: HdStore | null;
  /** B206 ML-1: the hint's store (`./modsState` `PACKS_ENABLED_KEY`); absent, the page's settings. */
  flags?: PackFlags;
  /** B206 ML-1: the change notice's channel; absent, the browser's `BroadcastChannel`. */
  channel?: ChannelFactory;
  /** B206 ML-1: the drop classifier's options (the ML-5 seam: `unwrap`). */
  classify?: ClassifyOptions;
  /** Transitional compatibility facade only: delegate the SAME existing saves writer until FCW07a publishes it. */
  legacyMapWrites?: boolean;
}
/** B206 ML-1: a dropped or picked file -- a `File` (a zip is read a range at a time, never whole). */
export type DropFile = LocalFile & Pick<Blob, 'slice'>;
/** B206 ML-1 (ML.R7): the HD store as the registry's fourth library. */
export interface HdLibrary {
  /** The kept HD pack's summary, or null (a store that cannot open reads as none). */
  list(): Promise<LocalPackSummary | null>;
  /** `importHdZip` into the store: one HD pack at a time, a new one replaces the kept one whole. */
  install(file: Pick<Blob, 'size' | 'slice'>, options?: { signal?: AbortSignal }): Promise<LocalPackResult>;
  /**
   * B206 ML-12 (ML.R16; `TEST_HD_PACK_BUTTON_ADAPTATION`, removed by ML-13): the HD pack read from a fetched source (the
   * served pack, `../hdTexturePackServed` `servedHdSource`) into the same store, checked as `install` checks a zip; a
   * source that serves no pack is NOT_FOUND. `fetched` false: the same pack was kept already and nothing was fetched.
   * `onProgress`: the bytes kept of the pack's total.
   */
  /** `onProgress` (ML-9's F3): the files fetched of the files to fetch, the bytes downloaded, and (LATER 742) `ofBytes` when the manifest names `packedBytes`. */
  installFrom(source: HdPackSource, options?: { signal?: AbortSignal; onProgress?: (p: { files: number; ofFiles: number; bytes: number; ofBytes?: number }) => void }): Promise<LocalPackResult & { fetched: boolean }>;
  remove(options?: { signal?: AbortSignal }): Promise<LocalPackResult>;
}
/** B206 ML-1 (ML.R7, ML.R8): the MODS state through the registry -- every page reads it here. */
export interface ModsStateApi {
  read(): Promise<ModsState>;
  /** Original (null) or one installed texture pack's id (`texture:<map>:<id>` or `hd:<id>`). */
  setTexture(id: string | null): Promise<ModsState>;
  setModel(slot: keyof ModelSwitches, on: boolean): Promise<ModsState>;
  /** The data mods' order and switches, as the test room's panel keeps them (`ModChoices`, unchanged). */
  setMods(choices: ModChoices): Promise<ModsState>;
  /** Another page (or this registry) changed the packs or the state. */
  subscribe(listener: () => void): () => void;
}
export interface PackRegistry extends LocalPackApi {
  install(ref: PackRef, files: readonly BufferedPackFile[], options?: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult>;
  validate(id: string, options?: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult>;
  remove(ref: string | PackRef, options?: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult>;
  hd: HdLibrary;
  modsState: ModsStateApi;
  /**
   * B206 ML-1 (ML.R3): one drop -- a zip, a folder's files or loose files -- classified (`./classify`) and installed
   * into its library: the HD pack, an `s2u-mod`, a model pack, a built GX texture pack, a v2 pack (stored, not
   * applied); bare or wrapped in Thunderstore's package format. A refusal says its reason. Nothing is applied here.
   */
  importDrop(files: readonly DropFile[], options?: { signal?: AbortSignal }): Promise<LocalPackResult>;
}
const CATALOGUE_LIMIT = 256;
const MAP_JSON_BYTES = 2 * 1024 * 1024; // Browser adaptation: bounded saved recipes, not disc map archives.
const modelRuntime = () => import('../modelPackRuntime');
const nameOf = (name: string): string => name.split(/[/\\]/).pop()!.replace(/[^\x20-\x7e]/g, '_').trim().slice(0, 48) || 'Local pack';
const sizeOf = (entries: readonly LocalEntry[]): number => entries.reduce((n, e) => n + e.bytes.length, 0);
const baseSummary = (id: string, kind: LocalPackSummary['kind'], name: string, files: number, bytes: number): LocalPackSummary =>
  ({ id, kind, name: nameOf(name), files, bytes, staged: false, imported: true, stored: true, enabled: false, applied: false, diagnostics: [] });
function fail(code: LocalPackErrorCode, message: string): never { throw new LocalPackError(code, message); }
const copy = <T>(value: T): T => structuredClone(value);
interface FrameworkRecord { ref: PackRef; manifest: PackManifest; files: BufferedPackFile[]; summary: LocalPackSummary }
interface FrameworkData { records: FrameworkRecord[] }
const emptyFramework = async (): Promise<FrameworkData> => ({ records: [] });
const equalRef = (a: PackRef, b: PackRef): boolean => a.id === b.id && a.version === b.version && a.hash === b.hash;
const frameworkId = (ref: PackRef): string => `pack:${ref.id}@${ref.version}#${ref.hash}`;

/** Digests are unambiguous file-path + SHA-256 pairs; pack bytes are not concatenated into a second full-sized buffer. */
async function digest(entries: readonly PackFile[], context: LocalReadOptions = {}): Promise<string> {
  const hashes: [string, string][] = [];
  // WebCrypto cannot be cancelled. Drain the owned promise before reporting cancellation or releasing busy.
  const settledHash = async (work: Promise<string>): Promise<string> => {
    try { return await work; } finally { checkLocalRead(context); }
  };
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    checkLocalRead(context);
    if ('bytes' in entry) hashes.push([entry.path, await settledHash(sha256(entry.bytes))]);
    else {
      const hash = createSha256(); let bytes = 0;
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new PackStorageError('FAILED', 'A stored member has an invalid size.');
      try {
        for await (const chunk of entry.read()) {
          checkLocalRead(context); bytes += chunk.length;
          if (bytes > entry.size) throw new PackStorageError('FAILED', 'A stored member exceeds its declared size.');
          hash.update(chunk);
        }
      } catch (error) { checkLocalRead(context); throw error; }
      checkLocalRead(context);
      if (bytes !== entry.size) throw new PackStorageError('FAILED', 'A stored member is incomplete.');
      hashes.push([entry.path, await settledHash(hash.digestHex())]);
    }
  }
  return settledHash(sha256(new TextEncoder().encode(JSON.stringify(hashes))));
}
const V2_MANIFEST = 's2u-pack.json';
function guess(entries: readonly LocalEntry[]): LocalPackSummary['kind'] {
  // FCW-33: s2u-pack.json decides first, before a root manifest.json or a PNG (Thunderstore's icon.png) reads as a texture pack.
  if (entries.some(e => e.path === V2_MANIFEST || /^[^/]+\/s2u-pack\.json$/.test(e.path))) return 'pack';
  if (entries.some(e => /(^|\/)mod\.json$/.test(e.path))) return 'mod';
  if (entries.some(e => /(^|\/)models\.json$/.test(e.path))) return 'model';
  if (entries.some(e => /\.png$/i.test(e.path))) return 'texture';
  if (entries.length === 1 && /\.json$/i.test(entries[0]!.path)) return 'map';
  return 'unknown';
}

/**
 * A v2 pack's members as `install` takes them (FCW-33): `s2u-pack.json` at the root, or inside the one folder a zipped
 * directory adds (every entry under it, as `mods/readPackage.ts` `rootedPackage` takes `mod.json`); otherwise refused.
 */
function rootedV2(entries: readonly LocalEntry[]): BufferedPackFile[] {
  if (entries.some(e => e.path === V2_MANIFEST)) return entries.map(e => ({ path: e.path, bytes: e.bytes }));
  const nests = entries.filter(e => /^[^/]+\/s2u-pack\.json$/.test(e.path));
  const root = nests.length === 1 ? nests[0]!.path.slice(0, -V2_MANIFEST.length) : null;
  if (root === null || !entries.every(e => e.path.startsWith(root)))
    fail('INVALID_PACKAGE', 'A v2 pack holds s2u-pack.json at its root, or in the one folder a zipped directory adds.');
  return entries.map(e => ({ path: e.path.slice(root.length), bytes: e.bytes }));
}

/** Validate unnormalized manifest file references before existing parsers canonicalize them. */
function manifestPaths(bytes: Uint8Array, field: 'files' | 'models'): void {
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  if (!raw || !Array.isArray(raw[field])) return;
  for (const row of raw[field]) {
    if (row && typeof row === 'object' && typeof (row as { file?: unknown }).file === 'string') localPath((row as { file: string }).file);
  }
}

export function createPackRegistry(options: PackRegistryOptions = {}): PackRegistry {
  const maps = options.maps ?? pageSettings;
  const buildContext: PackContext = options.context ?? { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
  const nativeMods = options.mods ? undefined : idbModLibrary(pageIndexedDb);
  const hintAvailable = (): boolean => {
    if (!nativeMods) return true;
    try { return pageSettings.get(MODS_PRESENT_KEY) === '1'; } catch { return false; }
  };
  const markHint = (present: boolean): void => {
    try { if (present) pageSettings.set(MODS_PRESENT_KEY, '1'); else pageSettings.remove(MODS_PRESENT_KEY); } catch { /* Committed data remains authoritative. */ }
  };
  // Native no-mod boot retains its lazy hint contract. Registry recovery always reads the common DB instead.
  // FCW-08 owns native presentation/recovery when this best-effort localStorage hint cannot be kept.
  const mods: ModLibrary = options.mods ?? { ...nativeMods!,
    async put(pack, request) { await nativeMods!.put(pack, request); markHint(true); },
    async remove(id, request) {
      await nativeMods!.remove(id, request);
      try { markHint((await nativeMods!.list!()).packages.length > 0); } catch { /* A hint read cannot undo the committed removal. */ }
    },
  };
  const models: LocalModelLibrary = options.models ?? {
    async inspect(slot, signal) { return (await modelRuntime()).inspectStoredModelPack(slot, signal); },
    async identify(slot, identity, request) { await (await modelRuntime()).identifyStoredModelPack(slot, identity, request); },
    async read(slot) { const stored = await (await modelRuntime()).readStoredModelPack(slot); return stored?.kind === 'files' && stored.entries ? stored.entries.map(entry => ({ path: entry.path, bytes: new Uint8Array(entry.bytes) })) : null; },
    async put(entries, slot, request) { await (await modelRuntime()).storeModelPackEntries(entries, slot, request); },
    async remove(slot, request) { await (await modelRuntime()).removeStoredModelPack(slot, request); },
    async list() { return (await modelRuntime()).storedModelPackCatalogue(); },
    async snapshot(slot) {
      const saved = await (await modelRuntime()).storedModelPackCatalogue();
      const selected = saved.slots.find(item => item.slot === (slot ?? 'primary'));
      return { generation: saved.generation, present: !!selected, entries: null, identity: selected?.identity };
    },
  };
  const textures = options.textures ?? new UploadedPacks(idbUploadBackend(pageIndexedDb));
  const database = options.database ?? idbPackDatabase(pageIndexedDb);
  const hd: HdStore | null = options.hd !== undefined ? options.hd : options.mods ? null : pageHdStore();
  const state = modsStateStore(database, options.flags ?? pageSettings, options.channel ?? browserChannel);
  const staged = new Map<string, { summary: LocalPackSummary; entries: LocalEntry[] }>();
  const active = new Map<string, LocalPackSummary>();
  const activeModGenerations = new Map<string, number>();
  const activeNativeContent = new Map<string, { hash: string; generation?: number }>();
  const listeners = new Set<(event: LocalPackProgress) => void>();
  const lifetime = new AbortController(); let directoryLifetime = new AbortController();
  let root: LocalDirectoryHandle | null = null; let revision = 0; let busy = false;
  const alive = (): void => { if (lifetime.signal.aborted) fail('DISPOSED', 'The local pack API has been disposed.'); };
  const emit = (event: LocalPackProgress): void => {
    for (const listener of [options.onProgress, ...listeners]) { try { listener?.({ ...event }); } catch { /* An observer cannot turn a committed import into a failure. */ } }
  };
  const context = (signal?: AbortSignal, capturedRootRevision?: number): LocalReadOptions & { signal: AbortSignal; cleanup(): void } => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    const directorySignal = capturedRootRevision === undefined ? undefined : directoryLifetime.signal;
    lifetime.signal.addEventListener('abort', abort, { once: true }); signal?.addEventListener('abort', abort, { once: true });
    directorySignal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted || lifetime.signal.aborted) controller.abort();
    return { signal: controller.signal, check: () => { alive(); if (capturedRootRevision !== undefined && capturedRootRevision !== revision) fail('PERMISSION_REQUIRED', 'The local folder grant changed during the operation.'); }, cleanup() { lifetime.signal.removeEventListener('abort', abort); signal?.removeEventListener('abort', abort); directorySignal?.removeEventListener('abort', abort); } };
  };
  const run = async <T>(operation: LocalPackProgress['operation'], signal: AbortSignal | undefined, path: boolean, work: (ctx: LocalReadOptions & { signal: AbortSignal }) => Promise<T>, check?: () => void): Promise<T> => {
    alive(); if (busy) fail('BUSY', 'Another local pack operation is still running.'); busy = true;
    const ctx = context(signal, path ? revision : undefined);
    const originalCheck = ctx.check; ctx.check = () => { originalCheck?.(); check?.(); };
    try { checkLocalRead(ctx); return await work(ctx); }
    catch (e) {
      const error = lifetime.signal.aborted && !(e instanceof LocalPackError && e.result) ? new LocalPackError('DISPOSED', 'The local pack API has been disposed.') : e instanceof LocalFileError ? e : new LocalPackError('INVALID_PACKAGE', 'The local package could not be read or validated.');
      emit({ operation, phase: 'error', files: 0, bytes: 0, code: error.code }); throw error;
    } finally { ctx.cleanup(); busy = false; }
  };
  const stored = async <T>(work: () => Promise<T> | T): Promise<T> => {
    try { return await work(); } catch (e) {
      if (e instanceof LocalFileError) throw e;
      const code = e instanceof PackStorageError || e instanceof UploadStoreUnavailable ? e.code
        : e instanceof ModStoreError ? e.kind === 'conflict' ? 'CONFLICT' : e.kind === 'aborted' ? 'ABORTED' : undefined : undefined;
      if (code === 'CONFLICT') fail('REVISION_CONFLICT', 'The stored packs changed; their current content was kept.');
      if (code === 'ABORTED') fail('ABORTED', 'The local pack write was cancelled.');
      fail('STORAGE_FAILED', 'The browser could not commit the local pack change.');
    }
  };
  const validation = async <T>(source: PackContext, ctx: LocalReadOptions, work: (bound: PackContext) => Promise<T>): Promise<T> => {
    checkLocalRead(ctx);
    const bound: PackContext = { ...source, sha256: async bytes => {
      checkLocalRead(ctx);
      // A hash may be non-cancellable. Keep ownership until it settles, including rejection, and do not let
      // the shared validator begin another member/final hash or publish a result after cancellation.
      try {
        if (source.sha256) return await source.sha256(bytes);
        const hex = await sha256Hex(bytes); // Preserve the published WebCrypto/fallback selection.
        return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
      } finally { checkLocalRead(ctx); }
    } };
    try { const result = await work(bound); checkLocalRead(ctx); return result; }
    catch (error) { checkLocalRead(ctx); throw error; }
  };
  /** B206 ML-1: the kept HD pack; a store that cannot open (no IndexedDB, another tab's upgrade) reads as none. */
  const hdKept = async (): Promise<HdStoredMeta | null> => { if (!hd) return null; try { return await hd.current(); } catch { return null; } };
  const hdSummary = (meta: HdStoredMeta): LocalPackSummary => baseSummary(`hd:${meta.id}`, 'hd', meta.name, meta.textures, meta.bytes);
  /** FP-5: the kept custom maps (`./customMaps`); a store that cannot open reads as none, as `framework` does. */
  const customMaps = async (): Promise<CustomMapRecord[]> => {
    try { const scope = await database.peek('custom-maps'); return scope ? (scope.data as CustomMapData).records : []; }
    catch (e) { if (e instanceof PackStorageError && e.code === 'UNAVAILABLE') return []; throw e; }
  };
  const customMapSummary = (record: CustomMapRecord, held: readonly PackRef[]): LocalPackSummary => ({
    ...baseSummary(customMapId(record.digest), 'custom-map', record.name, 1, new TextEncoder().encode(JSON.stringify(record.layout)).length),
    digest: record.digest, ref: null, requires: customMapRequires(record.layout), missing: customMapMissing(record, held),
  });
  const framework = async (): Promise<FrameworkRecord[]> => {
    try { const scope = await database.peek('packs'); return scope ? (scope.data as FrameworkData).records : []; }
    catch (e) { if (e instanceof PackStorageError && e.code === 'UNAVAILABLE') return []; throw e; }
  };
  const catalogue = async (bounded = true, read: LocalReadOptions = { signal: lifetime.signal, check: alive }): Promise<LocalPackSummary[]> => {
    checkLocalRead(read);
    const list: LocalPackSummary[] = [];
    const pendingLiveNative = new Set<string>();
    let modContent: Awaited<ReturnType<ModLibrary['read']>> | undefined;
    let modelGeneration: number | undefined;
    let primaryModelEntries: readonly PackEntry[] | null = null;
    for (const save of readSaveList(maps).saves) list.push(baseSummary(`map:${save.id}`, 'map', save.name, 1, new TextEncoder().encode(JSON.stringify(save.record)).length));
    const savedMods = mods.list ? await mods.list() : await mods.read().then(saved => ({ choices: saved.choices,
      generation: saved.generation,
      packages: saved.packages.map(pack => ({ id: pack.id, label: pack.label, files: pack.files.length, bytes: pack.files.reduce((n, f) => n + f.bytes.length, 0), identity: undefined, report: undefined })) }));
    for (const pack of savedMods.packages) {
      checkLocalRead(read);
      const item = baseSummary(`mod:${pack.id}`, 'mod', pack.label, pack.files, pack.bytes); item.slot = 'ordered-mod';
      item.ref = pack.identity?.ref ?? null; item.validation = pack.identity ? 'validated' : 'pending-validation';
      if (pack.report) item.report = pack.report;
      if (pack.identity) item.packKinds = pack.identity.manifest.kinds;
      if (!hintAvailable()) item.diagnostics.push({ code: 'MODS_RESTART_HINT_UNAVAILABLE', count: 1 });
      const previous = active.get(item.id);
      if (item.ref === null && previous?.ref === null && previous.applied && previous.digest) {
        if (savedMods.generation !== undefined && activeModGenerations.get(item.id) === savedMods.generation) {
          pendingLiveNative.add(item.id);
        } else {
          // A missing/changed generation cannot attest content. Only this API's pending live mod needs bytes;
          // ordinary library listing remains metadata-only. Compare exact content, never two null refs.
          if (mods.inspect) {
            const observed = await mods.inspect(pack.id, read.signal);
            checkLocalRead(read);
            if (observed?.files && (savedMods.generation === undefined || observed.generation === savedMods.generation)
              && await digest(observed.files, read) === previous.digest) {
              pendingLiveNative.add(item.id); activeModGenerations.set(item.id, observed.generation);
            }
          } else {
            modContent ??= await mods.read();
            checkLocalRead(read);
            const current = modContent.packages.find(pack => `mod:${pack.id}` === item.id);
            if (!modContent.unavailable && current && await digest(current.files.map(file => ({ path: file.name, bytes: file.bytes })), read) === previous.digest) {
              pendingLiveNative.add(item.id);
              if (modContent.generation !== undefined && modContent.generation === savedMods.generation)
                activeModGenerations.set(item.id, modContent.generation);
            }
          }
        }
      }
      item.enabled = savedMods.choices.enabled && !savedMods.choices.disabled.includes(pack.id); list.push(item);
    }
    checkLocalRead(read);
    if (models.list) {
      const savedModels = await models.list(); modelGeneration = savedModels.generation;
      for (const model of savedModels.slots) list.push({ ...baseSummary(model.slot === 'primary' ? 'model:current' : 'model:second', 'model',
        model.slot === 'primary' ? 'Saved model pack' : 'Saved second model pack', model.files, model.bytes), slot: model.slot,
        ref: model.identity?.ref ?? null, validation: model.identity ? 'validated' : 'pending-validation',
        report: model.identity?.report ?? model.report, packKinds: model.identity?.manifest.kinds });
    } else {
      const entries = await models.read();
      primaryModelEntries = entries;
      if (entries) list.push({ ...baseSummary('model:current', 'model', 'Saved model pack', entries.length, sizeOf(entries)), slot: 'primary',
        ref: null, validation: 'pending-validation' });
    }
    checkLocalRead(read);
    const savedTextures = await textures.catalogue();
    for (const { record: texture, identity, report } of savedTextures) list.push({ ...baseSummary(`texture:${texture.map}:${texture.id}`, 'texture', texture.entry.name, texture.files.length, texture.bytes),
      slot: 'per-map', ref: identity?.ref ?? null, validation: identity ? 'validated' : 'pending-validation',
      report: identity?.report ?? report, packKinds: identity?.manifest.kinds });
    checkLocalRead(read);
    const kept = await hdKept();
    if (kept) list.push(hdSummary(kept));
    checkLocalRead(read);
    const frameworkRecords = await framework();
    list.push(...frameworkRecords.map(record => record.summary));
    checkLocalRead(read);
    // FP-5 item 6: a custom map's readiness against the v2 packs held now, not as at its import.
    const held = frameworkRecords.map(record => record.ref);
    for (const record of await customMaps()) list.push(customMapSummary(record, held));
    for (const item of list) {
      checkLocalRead(read);
      const previous = active.get(item.id), binding = activeNativeContent.get(item.id);
      if (item.ref !== null || previous?.ref !== null || !previous.applied || !binding
        || item.kind !== 'model' && item.kind !== 'texture') continue;
      const selected = nativeSelection(item.id);
      const texture = item.kind === 'texture' ? savedTextures.find(({ record }) => `texture:${record.map}:${record.id}` === item.id)?.record : undefined;
      const generation = item.kind === 'model' ? modelGeneration
        : texture ? (await textures.observe(texture.map, texture.id)).generation : undefined;
      if (generation !== undefined && binding.generation === generation) { pendingLiveNative.add(item.id); continue; }
      // Only pending content applied by this API needs this comparison. Native model members stream one bounded
      // record at a time; subsequent lists use the verified generation without loading model/texture bytes.
      let files: readonly PackFile[] | null = null, observedGeneration: number | undefined;
      if (selected?.writer) {
        const observed = await selected.writer.inspect(selected.key, read.signal);
        files = observed?.files ?? null; observedGeneration = observed?.generation;
      } else if (item.kind === 'model') {
        files = models.list ? await models.read(item.slot === 'second' ? 'second' : 'primary') : primaryModelEntries;
      } else if (texture) {
        const observed = await textures.snapshot(texture.map, texture.id);
        if (observed.record) files = [...observed.files].map(([path, bytes]) => ({ path, bytes }));
        observedGeneration = observed.generation;
      }
      checkLocalRead(read);
      if (files && (generation === undefined || generation === observedGeneration)
        && await digest(files, read) === binding.hash) {
        pendingLiveNative.add(item.id); binding.generation = observedGeneration;
      }
    }
    const liveSummary = (item: LocalPackSummary): LocalPackSummary => {
      const previous = active.get(item.id);
      const cached = previous && (previous.ref === undefined && item.ref === undefined
        || previous.ref && item.ref && equalRef(previous.ref, item.ref) || pendingLiveNative.has(item.id)) ? previous : undefined;
      const result = { ...item, ...(cached ? { applied: cached.applied, ...(item.kind === 'mod' ? {} : { enabled: cached.enabled }), digest: cached.digest,
        diagnostics: [...item.diagnostics, ...cached.diagnostics.filter(diagnostic => diagnostic.code !== 'MODS_RESTART_HINT_UNAVAILABLE'
          && !item.diagnostics.some(current => current.code === diagnostic.code))] } : {}) };
      if (options.isApplied && item.kind !== 'unknown') result.applied = options.isApplied(item.kind, item.id);
      return result;
    };
    const all = [...staged.values()].map(s => s.summary).concat(list.map(liveSummary));
    const result = (bounded ? all.slice(0, CATALOGUE_LIMIT) : all).map(copy);
    if (bounded && all.length > CATALOGUE_LIMIT) result[result.length - 1]!.diagnostics.push({ code: 'CATALOGUE_TRUNCATED', count: all.length - result.length });
    checkLocalRead(read);
    return result;
  };
  const modelWriter: NativeIdentityWriter | undefined = models.inspect && models.identify ? {
    inspect: (id, signal) => models.inspect!(id === 'second' ? 'second' : 'primary', signal),
    identify: (id, identity, request) => models.identify!(id === 'second' ? 'second' : 'primary', identity, request),
  } : undefined;
  const nativeSelection = (id: string): { kind: 'mod' | 'model' | 'texture'; key: string; writer?: NativeIdentityWriter; slot?: ModelPackSlot } | null => {
    if (id.startsWith('mod:')) return { kind: 'mod', key: id.slice(4),
      writer: mods.inspect && mods.identify ? { inspect: mods.inspect, identify: mods.identify } : undefined };
    if (id === 'model:current' || id === 'model:second') {
      const slot = id === 'model:second' ? 'second' : 'primary'; return { kind: 'model', key: slot, slot, writer: modelWriter };
    }
    const parts = id.split(':');
    if (parts.length === 3 && parts[0] === 'texture' && packMap(parts[1]))
      return { kind: 'texture', key: `${parts[1]}/${parts[2]}`, writer: textures.identityWriter };
    return null;
  };
  function unavailable(id: string, report?: CheckReport): never {
    throw new LocalPackError('UNSUPPORTED_SURFACE', 'This pack has no common atomic validation boundary.', undefined,
      checkReport([...(report?.diagnostics ?? []), diagnostic({ source: 'pack', severity: 'note', status: 'blocked',
        code: 'registry.VALIDATION_UNAVAILABLE', id, text: 'The owning adapter cannot publish this validation atomically.' })], { evidence: 'validation' }));
  }
  const publish = async <T>(report: CheckReport, write: () => Promise<T>): Promise<T> => stored(async () => {
    try { return await write(); } catch (error) {
      if (error instanceof PackDependencyChanged) throw new LocalPackError('REVISION_CONFLICT', 'A dependency changed before this pack could publish.', undefined,
        checkReport([...report.diagnostics, diagnostic({ source: 'pack', severity: 'note', status: 'incomplete',
          code: 'registry.DEPENDENCY_CHANGED', id: error.ref.id, expected: `${error.ref.id}@${error.ref.version}#${error.ref.hash}`,
          text: 'The validated dependency changed; this validation is stale and was not published.' })], { evidence: 'validation' }));
      throw error;
    }
  });
  const dependencySnapshot = async (ctx: LocalReadOptions): Promise<(AvailablePack & { fence?: PackFence })[]> => {
    const found: (AvailablePack & { fence?: PackFence })[] = [];
    const scope = await stored(() => database.peek('packs'));
    for (const [index, record] of ((scope?.data as FrameworkData | undefined)?.records ?? []).entries()) found.push({
      ref: record.ref, dependencies: record.manifest.dependencies.filter((dep): dep is { id: string; range: string } => 'id' in dep),
      fence: { kind: 'packs', generation: scope!.generation, path: ['records', index, 'ref'], ref: record.ref },
    });
    for (const item of await catalogue(false, ctx)) {
      if (!item.ref || item.id.startsWith('pack:')) continue;
      const selected = nativeSelection(item.id);
      if (!selected?.writer) { found.push({ ref: item.ref }); continue; }
      const observed = await localWait(stored(() => selected.writer!.inspect(selected.key, ctx.signal)), ctx);
      if (!observed?.identity) continue;
      const identity = observed.identity;
      found.push({ ref: identity.ref, dependencies: identity.manifest.dependencies.filter((dep): dep is { id: string; range: string } => 'id' in dep),
        ...(sharesPackDatabase(database, observed.database) ? { fence: { kind: observed.kind, generation: observed.generation,
          path: observed.refPath, ref: identity.ref } } : {}) });
    }
    return found;
  };
  const dependenciesFor = (manifest: PackManifest, snapshot: readonly (AvailablePack & { fence?: PackFence })[], report: CheckReport): PackFence[] => {
    const result: PackFence[] = [], visited = new Set<string>();
    const pending = manifest.dependencies.filter((dep): dep is { id: string; range: string } => 'id' in dep);
    while (pending.length) {
      const { id, range } = pending.pop()!;
      const selected = snapshot.find(pack => pack.ref.id === id && satisfiesRange(pack.ref.version, range) === true && pack.fence);
      if (!selected?.fence) unavailable(id, report);
      const key = frameworkId(selected.ref); if (visited.has(key)) continue; visited.add(key);
      result.push(selected.fence);
      pending.push(...selected.dependencies ?? []);
    }
    return result;
  };

  /**
   * The one install path (FCW-33): `install` reaches it with the caller's ref, which must be the validated one; a v2
   * `import` reaches it with none, inside that import's own run (one busy slot), and the validated ref is the pack's.
   */
  const installFiles = async (requested: PackRef | undefined, files: readonly BufferedPackFile[], ctx: LocalReadOptions & { signal: AbortSignal }): Promise<LocalPackResult> => {
    const legacyKind = files.some(file => file.path === 's2u-pack.json') ? undefined : files.some(file => file.path === 'mod.json') ? 'mod'
      : files.some(file => file.path === 'models.json') ? 'model' : files.some(file => file.path === 'manifest.json') ? 'texture' : undefined;
    const slot = requested?.id === 'model.second' ? 'second' : 'primary';
    // Own the approved bytes before validation awaits; caller mutations cannot change what subsequently commits.
    const owned = files.map(file => ({ path: file.path, bytes: new Uint8Array(file.bytes) }));
    const observation = legacyKind === 'model' && models.snapshot ? await localWait(stored(() => models.snapshot!(slot)), ctx) : undefined;
    const modObservation = legacyKind === 'mod' ? await localWait(stored<ModCatalogue | Awaited<ReturnType<ModLibrary['read']>>>(() => mods.list ? mods.list() : mods.read()), ctx) : undefined;
    const textureManifest = legacyKind === 'texture' ? validateManifest(JSON.parse(new TextDecoder().decode(owned.find(file => file.path === 'manifest.json')!.bytes))) : undefined;
    const map = textureManifest?.mapArchive.slice(4, -4);
    if (map !== undefined && !packMap(map)) fail('INVALID_PACKAGE', 'The texture manifest names an unsupported map.');
    const nativeTextureId = textureManifest ? await sha256(owned.find(file => file.path === 'manifest.json')!.bytes) : undefined;
    checkLocalRead(ctx);
    const textureObservation = map && packMap(map) && nativeTextureId ? await localWait(stored(() => textures.observe(map, nativeTextureId)), ctx) : undefined;
    const metadata = await stored(() => database.peek('packs'));
    const scope = metadata ?? { kind: 'packs' as const, generation: 0, data: { records: [] } };
    const current = scope.data as FrameworkData;
    emit({ operation: 'import', phase: 'validating', files: owned.length, bytes: sizeOf(owned) });
    const snapshot = await dependencySnapshot(ctx);
    const validationContext = { ...buildContext, packs: [...(buildContext.packs ?? []), ...snapshot] };
    const checked = await validation(validationContext, ctx, bound => legacyKind ? validateLegacyPack(legacyKind, owned, bound, { slot })
      : validatePack(owned, bound));
    if (!checked.ok) throw new LocalPackError('INVALID_PACKAGE', 'The framework pack did not pass validation.', undefined, checked.report);
    if (requested && !equalRef(requested, checked.ref)) fail('INVALID_PACKAGE', 'The requested ref does not identify the validated pack.');
    const ref = checked.ref;
    const dependencies = dependenciesFor(checked.manifest, snapshot, checked.report);
    if (legacyKind === 'mod') {
      const id = checked.ref.id.slice(4);
      const summary: LocalPackSummary = { ...baseSummary(`mod:${id}`, 'mod', checked.manifest.name, owned.length, sizeOf(owned)),
        ref: checked.ref, validation: 'validated', report: checked.report, packKinds: checked.manifest.kinds, slot: 'ordered-mod' };
      summary.enabled = modObservation ? modObservation.choices.enabled && modObservation.packages.some(pack => pack.id === id)
        && !modObservation.choices.disabled.includes(id) : false;
      checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await publish(checked.report, () => mods.put({ id, label: checked.manifest.name,
        files: owned.map(file => ({ name: file.path, bytes: file.bytes })) },
      { expectedGeneration: modObservation?.generation, identity: checked, dependencies, signal: ctx.signal }));
      if (!hintAvailable()) summary.diagnostics.push({ code: 'MODS_RESTART_HINT_UNAVAILABLE', count: 1 });
      emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes }); return copy(summary);
    }
    if (legacyKind === 'model') {
      const summary: LocalPackSummary = { ...baseSummary(slot === 'primary' ? 'model:current' : 'model:second', 'model',
        checked.manifest.name, owned.length, sizeOf(owned)), ref: copy(checked.ref), validation: 'validated', report: checked.report, packKinds: [...checked.manifest.kinds], slot };
      checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await publish(checked.report, () => models.put(owned, slot, { expectedGeneration: observation?.generation, identity: checked, dependencies, signal: ctx.signal }));
      emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
      return copy(summary);
    }
    if (legacyKind === 'texture' && textureManifest && nativeTextureId && map && packMap(map)) {
      if (textureObservation?.record && textureObservation.identity && equalRef(textureObservation.identity.ref, checked.ref)) {
        const current = await stored(() => textures.observe(map, nativeTextureId)); checkLocalRead(ctx);
        if (current.generation !== textureObservation.generation || !current.record || !current.identity || !equalRef(current.identity.ref, checked.ref))
          fail('REVISION_CONFLICT', 'The stored texture pack changed during validation; its current bytes were kept.');
        const identity = current.identity, record = current.record;
        const storedSummary: LocalPackSummary = { ...baseSummary(`texture:${map}:${nativeTextureId}`, 'texture', record.entry.name, record.files.length, record.bytes),
          ref: copy(identity.ref), validation: 'validated', report: copy(identity.report), packKinds: [...identity.manifest.kinds], slot: 'per-map' };
        return storedSummary;
      }
      const summary: LocalPackSummary = { ...baseSummary(`texture:${map}:${nativeTextureId}`, 'texture', checked.manifest.name, owned.length, sizeOf(owned)),
        ref: checked.ref, validation: 'validated', report: checked.report, packKinds: checked.manifest.kinds, slot: 'per-map' };
      checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await publish(checked.report, () => textures.add(map, 'pack', { id: nativeTextureId, name: checked.manifest.name, kind: 'textures',
        method: textureManifest.method, scale: textureManifest.scale, roles: textureManifest.roles ?? 'world',
        generatedAt: new Date().toISOString(), textures: textureManifest.entries.length, bytes: textureManifest.totalBytes, notes: '' },
      new Map(owned.map(file => [file.path, file.bytes])), { expectedGeneration: textureObservation?.generation, identity: checked, dependencies, signal: ctx.signal }));
      emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes }); return copy(summary);
    }
    const previous = current.records.find(record => record.ref.id === ref.id && record.ref.version === ref.version);
    if (previous) {
      if (!equalRef(previous.ref, ref)) {
        const text = `Remove ${ref.id}@${ref.version} first before installing different content with that id and version.`;
        throw new LocalPackError('REVISION_CONFLICT', text, undefined, checkReport([...checked.report.diagnostics, diagnostic({
          source: 'pack', severity: 'error', code: 'registry.REVISION_CONFLICT', id: ref.id,
          expected: previous.ref.hash, actual: ref.hash, text,
        })], { evidence: 'validation' }));
      }
      return copy(previous.summary);
    }
    const summary: LocalPackSummary = { ...baseSummary(frameworkId(ref), 'unknown', checked.manifest.name, owned.length, sizeOf(owned)),
      ref: copy(checked.ref), validation: 'validated', report: checked.report, digest: checked.ref.hash,
      packKinds: [...checked.manifest.kinds], slot: 'independent' };
    checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
    await publish(checked.report, () => database.patch('packs', emptyFramework, data => ({ records: [...data.records,
      { ref: checked.ref, manifest: checked.manifest, files: owned, summary }] }), { expectedGeneration: scope.generation, dependencies, signal: ctx.signal }));
    emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
    return copy(summary);
  };

  /**
   * A v2 pack from a granted path or a staged pick, a lone zip unpacked (FCW-33, a browser adaptation): rooted
   * (`rootedV2`), then `installFiles` with no caller ref, inside this one run -- validated, stored in the framework
   * records, never enabled or applied (no live driver applies a v2 pack, so `apply` is refused). Its name is the
   * manifest's; Thunderstore's root files ride along outside the pack's identity (packs.ts `THUNDERSTORE_STORE_FILES`).
   */
  const importPack = (input: LocalPackImport, request: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult> =>
    run('import', request.signal, input.path !== undefined, async ctx => {
      if (options.allowedSurface && !options.allowedSurface('pack')) fail('UNSUPPORTED_SURFACE', 'This surface does not currently permit local imports.');
      if ((input.path === undefined) === (input.stagedId === undefined)) fail('INVALID_PATH', 'Choose exactly one relative path or staged import ID.');
      if (input.path !== undefined) localPath(input.path);
      if (input.apply) fail('UNSUPPORTED_SURFACE', 'A v2 pack is stored, not applied: no live driver applies one.');
      emit({ operation: 'import', phase: 'reading', files: 0, bytes: 0 });
      const stage = input.stagedId === undefined ? undefined : staged.get(input.stagedId);
      if (input.stagedId !== undefined && !stage) fail('NOT_FOUND', 'The staged import ID is absent or expired.');
      let entries = stage ? stage.entries : await readLocalPath(root, input.path!, ctx);
      if (entries.length === 1 && /\.zip$/i.test(entries[0]!.path)) entries = await unpackLocalZip(entries[0]!.bytes, ctx);
      const result = await installFiles(undefined, rootedV2(entries), ctx);
      if (input.stagedId) staged.delete(input.stagedId);
      return result;
    }, request.check);

  const api: PackRegistry = {
    validate(id, request = {}) {
      return run('import', request.signal, false, async ctx => {
        const selected = nativeSelection(id);
        if (!selected?.writer) unavailable(id);
        const writer = selected.writer;
        const observation = await localWait(stored(() => writer.inspect(selected.key, ctx.signal)), ctx);
        if (!observation) fail('NOT_FOUND', 'The local pack ID was not found.');
        if (!sharesPackDatabase(database, observation.database) || !observation.files) unavailable(id);
        const entry = (await stored(() => catalogue(false, ctx))).find(item => item.id === id);
        if (!entry) fail('NOT_FOUND', 'The local pack ID was not found.');
        const snapshot = await dependencySnapshot(ctx);
        const checked = await stored(() => validation({ ...buildContext, packs: [...(buildContext.packs ?? []), ...snapshot] }, ctx,
          bound => validateLegacyPack(selected.kind, observation.files!, bound, { slot: selected.slot })));
        if (!checked.ok) throw new LocalPackError('INVALID_PACKAGE', 'The stored native pack did not pass strict validation.', undefined, checked.report);
        const dependencies = dependenciesFor(checked.manifest, snapshot, checked.report);
        checkLocalRead(ctx);
        await localWait(publish(checked.report, () => writer.identify(selected.key, checked,
          { expectedGeneration: observation.generation, dependencies, signal: ctx.signal })), ctx);
        return { ...entry, ref: checked.ref, validation: 'validated', report: checked.report, packKinds: checked.manifest.kinds };
      }, request.check);
    },
    install(ref, files, request = {}) {
      return run('import', request.signal, false, ctx => installFiles(ref, files, ctx), request.check);
    },
    setDirectory(handle) { alive(); directoryLifetime.abort(); directoryLifetime = new AbortController(); root = handle; revision++; },
    subscribe(listener) { alive(); listeners.add(listener); return () => listeners.delete(listener); },
    async list() { alive(); const list = await localWait(stored(catalogue), { signal: lifetime.signal, check: alive }); alive(); return list; },
    stage(files, request = {}) {
      return run('stage', request.signal, false, async ctx => {
        const used = [...staged.values()].reduce((n, value) => n + value.summary.bytes, 0);
        const usedFiles = [...staged.values()].reduce((n, value) => n + value.summary.files, 0);
        const bytes = files.reduce((n, file) => n + file.size, 0);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || used + bytes > LOCAL_FILE_LIMITS.bytes || staged.size >= CATALOGUE_LIMIT || usedFiles + files.length > LOCAL_FILE_LIMITS.files) fail('LIMIT_EXCEEDED', 'Staged files exceed this visit’s local limit.');
        emit({ operation: 'stage', phase: 'reading', files: 0, bytes: 0 });
        const entries = await readPickedFiles(files, { ...ctx, onRead: (files, bytes) => emit({ operation: 'stage', phase: 'reading', files, bytes }) });
        const groups = entries.every(entry => /\.zip$/i.test(entry.path)) ? entries.map(entry => [entry]) : [entries];
        if (staged.size + groups.length > CATALOGUE_LIMIT) fail('LIMIT_EXCEEDED', 'Too many packages are staged in this visit.');
        const prepared: { summary: LocalPackSummary; entries: LocalEntry[] }[] = [];
        for (const group of groups) {
          const id = `staged:${globalThis.crypto.randomUUID()}`; const summary = baseSummary(id, guess(group), group.length === 1 ? group[0]!.path : group[0]!.path.split('/')[0]!, group.length, sizeOf(group));
          summary.digest = await digest(group, ctx); summary.staged = true; summary.imported = false; summary.stored = false;
          prepared.push({ summary, entries: group });
        }
        checkLocalRead(ctx);
        for (const value of prepared) staged.set(value.summary.id, value);
        emit({ operation: 'stage', phase: 'complete', files: entries.length, bytes });
        return prepared.map(value => copy(value.summary));
      });
    },
    import(input, request = {}) {
      if (input?.kind === 'pack') return importPack(input, request);
      return run('import', request.signal, input?.path !== undefined, async ctx => {
        if (!input || !['map', 'mod', 'model', 'texture'].includes(input.kind)) fail('UNSUPPORTED_FORMAT', 'Choose a supported local pack kind.');
        if (input.kind === 'map' && !options.legacyMapWrites) fail('UNSUPPORTED_SURFACE', 'Registry maps are read-only until the shared saves writer is published.');
        if (options.allowedSurface && !options.allowedSurface(input.kind)) fail('UNSUPPORTED_SURFACE', 'This surface does not currently permit local imports.');
        if ((input.path === undefined) === (input.stagedId === undefined)) fail('INVALID_PATH', 'Choose exactly one relative path or staged import ID.');
        if (input.path !== undefined) localPath(input.path);
        const driver = { map: options.applyMap, mod: options.applyMod, model: options.applyModel, texture: options.applyTexture }[input.kind as Exclude<LocalPackKind, 'pack' | 'hd' | 'custom-map'>];
        if (input.apply && (!options.allowedSurface?.(input.kind) || !driver)) fail('UNSUPPORTED_SURFACE', 'This surface has no approved live driver for this pack kind.');
        emit({ operation: 'import', phase: 'reading', files: 0, bytes: 0 });
        const stage = input.stagedId === undefined ? undefined : staged.get(input.stagedId);
        if (input.stagedId !== undefined && !stage) fail('NOT_FOUND', 'The staged import ID is absent or expired.');
        let entries = stage ? stage.entries : await readLocalPath(root, input.path!, ctx);
        const name = nameOf(input.name ?? stage?.summary.name ?? input.path!);
        const zip = entries.length === 1 && /\.zip$/i.test(entries[0]!.path) ? entries[0]!.bytes : null;
        if (zip) { if (input.kind === 'texture') await inspectLocalZip(zip, ctx); else entries = await unpackLocalZip(zip, ctx); }
        // Observe before any digest await: a human write during hashing must fail the eventual native CAS.
        const modObservation = input.kind === 'mod'
          ? await localWait(stored<ModCatalogue | Awaited<ReturnType<ModLibrary['read']>>>(() => mods.list ? mods.list() : mods.read()), ctx) : undefined;
        const modelObservation = input.kind === 'model' && models.snapshot
          ? await localWait(stored(() => models.snapshot!('primary')), ctx) : undefined;
        legacyExtensions(entries); // FCW-33 fold F5: the v2 pack kind's wider types never reach a legacy import
        emit({ operation: 'import', phase: 'validating', files: entries.length, bytes: sizeOf(entries) });
        const hash = await digest(entries, ctx);
        let result: LocalPackResult;
        let storedContentHash: string | undefined;
        let commit: () => Promise<void>;
        let apply: (() => Promise<void>) | undefined;
        let cleanup: (() => void) | undefined;
        let transferred = false;
        try {
          if (input.kind === 'map') {
            const candidates = entries.filter(entry => /(^|\/)(map|layout)\.json$/i.test(entry.path));
            // Browser adaptation: a multi-file pack imports its one map.json or layout.json; its other files are ignored.
            const entry = entries.length === 1 && /\.json$/i.test(entries[0]!.path) ? entries[0]! : candidates.length === 1 ? candidates[0]! : null;
            if (!entry) fail('INVALID_PACKAGE', 'A map import must contain one saved Forge map JSON file.');
            if (entry.bytes.length > MAP_JSON_BYTES) fail('LIMIT_EXCEEDED', 'The map JSON exceeds the local saved-recipe limit.');
            const text = new TextDecoder().decode(entry.bytes);
            // FCW-32 round 2 (the review's F7): the map library keeps records without rules -- strict, deliberately, until the
            // record carries them (FCW-35, FCW.R19) -- so a Forge layout with rules (its authoring envelope) is refused by name.
            if (isAuthoringEnvelope(text)) fail('INVALID_PACKAGE', 'The saved map is a Forge layout with rules: open it with the Forge\'s own file open, which reads its rules; the map library keeps layouts without rules.');
            const record = readSaved(text, name);
            if (input.name !== undefined) record.name = name;
            if (checkRecord(record)) fail('INVALID_PACKAGE', 'The saved map is outside the Forge record limits.');
            const mapHash = entries.length === 1 ? hash : await digest([entry], ctx);   // the saved map's ID covers only the imported JSON
            result = baseSummary(`map:${mapHash}`, 'map', record.name, 1, entry.bytes.length);
            commit = async () => {
              const saved = readSaveList(maps); const next = saved.saves.filter(save => save.id !== mapHash);
              if (next.length >= SAVE_LIMIT) fail('LIMIT_EXCEEDED', 'The browser’s named map library is full.');
              next.push({ id: mapHash, name: record.name, savedAt: Date.now(), record });
              if (!writeSaves(next, maps, saved.unreadable)) fail('STORAGE_FAILED', 'The browser did not keep the map save.');
            };
            apply = async () => { await options.applyMap!(record, ctx.signal); };
          } else if (input.kind === 'mod') {
            const pack = modPackageFromEntries(name, entries); const manifest = parseModManifestBytes(pack.files.get('mod.json')!); manifestPaths(pack.files.get('mod.json')!, 'files');
            for (const row of manifest.files) {
              localPath(row.file);
              if (!pack.files.has(row.file)) fail('INVALID_PACKAGE', 'A mod manifest names a missing replacement file.');
            }
            result = baseSummary(`mod:${manifest.id}`, 'mod', manifest.name, pack.files.size, sizeOf(entries));
            const checked = await validation(buildContext, ctx, bound => validateLegacyPack('mod', [...pack.files].map(([path, bytes]) => ({ path, bytes })), bound));
            // Native-parser acceptance remains the facade's boundary. Certification cannot discard accepted extra bytes.
            result.ref = checked.ok ? checked.ref : null;
            result.validation = checked.ok ? 'validated' : 'pending-validation'; result.report = checked.report;
            if (checked.ok) result.packKinds = checked.manifest.kinds;
            result.slot = 'ordered-mod';
            commit = () => mods.put({ id: manifest.id, label: manifest.name, files: [...pack.files].map(([name, bytes]) => ({ name, bytes })) },
              { expectedGeneration: modObservation?.generation, signal: ctx.signal, identity: checked.ok ? checked : undefined,
                validationReport: checked.ok ? undefined : checked.report });
            apply = async () => { await options.applyMod!(pack, manifest, ctx.signal); };
          } else if (input.kind === 'model') {
            storedContentHash = hash;
            const files = modelPackFiles(entries); parseModelManifest(files.get('models.json')!); manifestPaths(files.get('models.json')!, 'models');
            const loading = (await localWait(modelRuntime(), ctx)).loadModelPack(entries);
            void loading.then(pack => { try { checkLocalRead(ctx); } catch { pack.dispose(); } }, () => {});
            const loaded = await localWait(loading, ctx);
            cleanup = () => loaded.dispose();
            if (loaded.ids.length === 0) fail('INVALID_PACKAGE', 'No replacement model could be loaded.');
            result = baseSummary('model:current', 'model', name, entries.length, sizeOf(entries));
            if (loaded.skipped.length) result.diagnostics.push({ code: 'MODELS_SKIPPED', count: loaded.skipped.length });
            const checked = await validation(buildContext, ctx, bound => validateLegacyPack('model', entries, bound));
            result.ref = checked.ok ? checked.ref : null; result.validation = checked.ok ? 'validated' : 'pending-validation';
            result.report = checked.report; result.slot = 'primary';
            if (checked.ok) result.packKinds = checked.manifest.kinds;
            commit = () => models.put(entries, 'primary', { expectedGeneration: modelObservation?.generation, signal: ctx.signal,
              identity: checked.ok ? checked : undefined, validationReport: checked.ok ? undefined : checked.report });
            apply = async () => { await options.applyModel!(loaded, ctx.signal); transferred = true; };
          } else {
            if (!zip) fail('UNSUPPORTED_FORMAT', 'Texture imports use the existing PNG texture ZIP format.');
            if (!options.loadedTextures) fail('UNSUPPORTED_SURFACE', 'Texture import needs the currently loaded map’s texture sources.');
            const loaded = await localWait(Promise.resolve(options.loadedTextures()), ctx);
            const upload = await localWait(readUpload(bytesSource(zip), name, undefined, loaded), ctx);
            if (upload.parts.length !== 1 || upload.parts[0]!.map !== loaded.map) fail('UNSUPPORTED_SURFACE', 'Import one texture pack for the currently loaded map at a time.');
            const part = upload.parts[0]!;
            let provenance: PackProvenance | undefined;
            if (part.plainMembers) provenance = await localWait(plainProvenance(loaded.archive, loaded.toolCommit), ctx);
            const built = await localWait(buildUploadPart(part, loaded.sourcesFor(part.roles), { provenance }), ctx);
            const files = new Map([['manifest.json', built.pack.manifestBytes], ...built.pack.payloads]);
            result = baseSummary(`texture:${part.map}:${built.pack.id}`, 'texture', built.entry.name, files.size, built.entry.bytes);
            if (built.leftOut.length) result.diagnostics.push({ code: 'TEXTURES_KEPT_ORIGINAL', count: built.leftOut.length });
            if (upload.skipped.length) result.diagnostics.push({ code: 'MAPS_SKIPPED', count: upload.skipped.length });
            const checked = await validation(buildContext, ctx, bound => validateLegacyPack('texture', [...files].map(([path, bytes]) => ({ path, bytes })), bound));
            result.ref = checked.ok ? checked.ref : null; result.validation = checked.ok ? 'validated' : 'pending-validation';
            result.report = checked.report; result.slot = 'per-map';
            if (checked.ok) result.packKinds = checked.manifest.kinds;
            if (input.apply && !checked.ok) storedContentHash = await digest([...files].map(([path, bytes]) => ({ path, bytes })), ctx);
            commit = async () => { await textures.add(part.map, 'pack', built.entry, files, { signal: ctx.signal,
              identity: checked.ok ? checked : undefined, validationReport: checked.ok ? undefined : checked.report }); };
            apply = async () => { await options.applyTexture!(built, ctx.signal); };
          }
          result.digest = hash; result.stored = false;
          if (!input.apply && active.get(result.id)?.applied) fail('UNSUPPORTED_SURFACE', 'Uninstall the active pack before replacing its saved version without applying it.');
          checkLocalRead(ctx);
          if (input.path !== undefined && root?.queryPermission && await localWait(root.queryPermission({ mode: 'read' }), ctx) !== 'granted') fail('PERMISSION_REQUIRED', 'Local folder access was revoked before commit.');
          emit({ operation: 'import', phase: 'storing', files: result.files, bytes: result.bytes });
          checkLocalRead(ctx);
          if (options.allowedSurface && !options.allowedSurface(input.kind)) fail('UNSUPPORTED_SURFACE', 'The surface changed before the local import could commit.');
          // Cancellation is honored until the write starts. A completed transaction is reported as stored even if
          // a later apply is cancelled; it cannot be truthfully rolled back after another browser actor sees it.
          await stored(commit); result.stored = true;
          if (input.kind === 'mod') {
            try {
              const observed = await stored(() => mods.read());
              if (observed.unavailable) fail('STORAGE_FAILED', 'The stored mod choices are unavailable.');
              const { choices } = observed;
              result.enabled = choices.enabled && !choices.disabled.includes(result.id.slice(4));
              activeModGenerations.delete(result.id);
              if (input.apply && result.ref === null && observed.generation !== undefined) {
                const current = observed.packages.find(pack => `mod:${pack.id}` === result.id);
                if (current && await digest(current.files.map(file => ({ path: file.name, bytes: file.bytes })), ctx) === result.digest)
                  activeModGenerations.set(result.id, observed.generation);
              }
              if (!hintAvailable()) result.diagnostics.push({ code: 'MODS_RESTART_HINT_UNAVAILABLE', count: 1 });
            } catch {
              throw new LocalPackError('STORAGE_FAILED', 'The pack was stored locally but its choices could not be read.', copy(result));
            }
          }
          if (input.stagedId) staged.delete(input.stagedId);
          try { checkLocalRead(ctx); } catch (e) { throw new LocalPackError(e instanceof LocalFileError ? e.code : 'ABORTED', 'The pack commit completed before cancellation; live application was skipped.', copy(result)); }
          if (input.apply) {
            try {
              checkLocalRead(ctx);
              if (!options.allowedSurface?.(input.kind)) fail('UNSUPPORTED_SURFACE', 'The active surface changed before apply.');
              emit({ operation: 'import', phase: 'applying', files: result.files, bytes: result.bytes });
              checkLocalRead(ctx);
              if (!options.allowedSurface?.(input.kind)) fail('UNSUPPORTED_SURFACE', 'The active surface changed before apply.');
              await apply!(); result.applied = true; result.enabled = true;
            } catch { throw new LocalPackError('APPLY_FAILED', 'The pack was stored locally but its live driver did not complete.', copy(result)); }
          }
          active.set(result.id, copy(result));
          activeNativeContent.delete(result.id);
          if (result.ref === null && result.applied && storedContentHash) activeNativeContent.set(result.id, { hash: storedContentHash });
          emit({ operation: 'import', phase: 'complete', files: result.files, bytes: result.bytes });
          return copy(result);
        } finally { if (!transferred) cleanup?.(); }
      }, request.check);
    },
    remove(inputId, request = {}) {
      if (typeof inputId === 'string' && inputId.startsWith(CUSTOM_MAP_PREFIX)) return removeCustomMap(inputId, request);
      const expectedRef = typeof inputId !== 'string' ? inputId : undefined;
      const nativeRef = expectedRef && /^(mod\.|model\.|texture\.)/.test(expectedRef.id);
      if (!nativeRef && (typeof inputId !== 'string' || inputId.startsWith('pack:'))) {
        return run('remove', request.signal, false, async ctx => {
          const metadata = await stored(() => database.peek('packs'));
          const scope = metadata ?? await stored(() => database.read('packs', emptyFramework, ctx.signal));
          const current = scope.data as FrameworkData;
          const selected = current.records.find(record => typeof inputId === 'string' ? frameworkId(record.ref) === inputId : equalRef(record.ref, inputId));
          if (!selected) {
            if (typeof inputId !== 'string' && current.records.some(record => record.ref.id === inputId.id && record.ref.version === inputId.version))
              fail('REVISION_CONFLICT', 'The ref does not identify the currently stored content.');
            fail('NOT_FOUND', 'The framework pack was not found.');
          }
          checkLocalRead(ctx); emit({ operation: 'remove', phase: 'storing', files: selected.summary.files, bytes: selected.summary.bytes }); checkLocalRead(ctx);
          await stored(() => database.patch('packs', emptyFramework, data => ({ records: data.records.filter(record => !equalRef(record.ref, selected.ref)) }),
            { expectedGeneration: scope.generation, signal: ctx.signal }));
          emit({ operation: 'remove', phase: 'complete', files: selected.summary.files, bytes: selected.summary.bytes });
          return { ...copy(selected.summary), stored: false, enabled: false, applied: false, removed: true };
        }, request.check);
      }
      if (typeof inputId === 'string' && inputId.startsWith('map:') && !options.legacyMapWrites) return Promise.reject(new LocalPackError('UNSUPPORTED_SURFACE', 'Registry maps are read-only until the shared saves writer is published.'));
      let effectStarted = false;
      return run('remove', request.signal, false, async ctx => {
        const stagedEntry = typeof inputId === 'string' ? staged.get(inputId) : undefined;
        if (stagedEntry) { staged.delete(stagedEntry.summary.id); return { ...copy(stagedEntry.summary), staged: false, removed: true }; }
        // Await the catalogue itself: cancellation closes its readers before run() releases the busy slot.
        const all = await stored(() => catalogue(false, ctx));
        const entry = all.find(item => expectedRef ? !!item.ref && equalRef(item.ref, expectedRef) : item.id === inputId);
        if (!entry && expectedRef && all.some(item => item.ref?.id === expectedRef.id))
          fail('REVISION_CONFLICT', 'The ref does not identify the currently stored native content.');
        if (!entry || entry.kind === 'unknown') fail('NOT_FOUND', 'The local pack ID was not found.');
        const id = entry.id;
        const kind = entry.kind;
        const checkIdentity = (identity?: NativePackIdentity): void => {
          if (expectedRef && (!identity || !equalRef(identity.ref, expectedRef)))
            fail('REVISION_CONFLICT', 'The selected native identity changed during removal.');
        };
        const guarded: LocalReadOptions = { ...ctx, check: () => {
          ctx.check?.();
          if (options.allowedSurface && !options.allowedSurface(kind)) fail('UNSUPPORTED_SURFACE', 'This surface does not currently permit local pack changes.');
        } };
        // The catalogue's cached digest, sizes and mutable IDs cannot identify the bytes selected for removal.
        // A snapshot also captures its delete action so no unrelated read separates the final comparison/delete.
        const snapshot = async (): Promise<{ hash: string; remove(): Promise<void> } | null> => {
          checkLocalRead(guarded);
          if (kind === 'map') {
            const saved = readSaveList(maps); const selected = saved.saves.find(save => `map:${save.id}` === id);
            if (!selected) return null;
            const hash = await digest([{ path: 'map.json', bytes: new TextEncoder().encode(JSON.stringify(selected.record)) }], guarded);
            return { hash, async remove() { if (!writeSaves(saved.saves.filter(save => `map:${save.id}` !== id), maps, saved.unreadable)) fail('STORAGE_FAILED', 'The browser did not remove the saved map.'); } };
          }
          if (kind === 'mod') {
            if (mods.list) {
              const metadata = await localWait(stored(() => mods.list!()), guarded);
              const selected = metadata.packages.find(pack => `mod:${pack.id}` === id);
              if (!selected) return null;
              checkIdentity(selected.identity);
              if (expectedRef && metadata.generation === undefined) unavailable(expectedRef.id);
              if (metadata.generation !== undefined) return { hash: `generation:${metadata.generation}`, remove: () => mods.remove(selected.id,
                { expectedGeneration: metadata.generation, signal: ctx.signal }) };
            }
            const observed = await localWait(stored(() => mods.read()), guarded);
            const selected = observed.packages.find(pack => `mod:${pack.id}` === id);
            if (!selected) return null;
            return { hash: observed.generation === undefined ? await digest(selected.files.map(file => ({ path: file.name, bytes: file.bytes })), guarded) : `generation:${observed.generation}`,
              remove: () => mods.remove(selected.id, { expectedGeneration: observed.generation, signal: ctx.signal }) };
          }
          if (kind === 'model') {
            const slot: ModelPackSlot = id === 'model:second' ? 'second' : 'primary';
            if (models.snapshot) {
              const observed = await localWait(stored(() => models.snapshot!(slot)), guarded);
              checkIdentity(observed.identity);
              return observed.present ? { hash: `generation:${observed.generation}`, remove: () => models.remove(slot,
                { expectedGeneration: observed.generation, signal: ctx.signal }) } : null;
            }
            const entries = await localWait(stored(() => models.read(slot)), guarded);
            if (!entries) return null;
            return { hash: await digest(entries, guarded), remove: () => models.remove(slot) };
          }
          const selected = (await localWait(stored(() => textures.listAll()), guarded)).find(pack => `texture:${pack.map}:${pack.id}` === id);
          if (!selected) return null;
          const observed = await localWait(stored(() => textures.observe(selected.map, selected.id)), guarded);
          if (!observed.record) return null;
          checkIdentity(observed.identity);
          if (expectedRef && observed.generation === undefined) unavailable(expectedRef.id);
          if (observed.generation !== undefined) return { hash: `generation:${observed.generation}`, remove: () => textures.remove(selected.map, selected.id,
            { expectedGeneration: observed.generation, signal: ctx.signal }) };
          const entries: LocalEntry[] = [];
          for (const path of selected.files) {
            const bytes = await localWait(stored(() => textures.file(selected.map, selected.id, path)), guarded);
            if (!bytes) return null;
            entries.push({ path, bytes });
          }
          return { hash: await digest(entries, guarded), remove: () => textures.remove(selected.map, selected.id) };
        };
        const selected = await snapshot();
        if (!selected) fail('NOT_FOUND', 'The selected local pack content was not found.');
        checkLocalRead(guarded);
        // A human replacement invalidates the saved summary's applied claim, but this API's earlier pending
        // live effect still needs uninstalling before removal. An authoritative runtime query takes priority.
        if (entry.applied || !options.isApplied && active.get(id)?.ref === null && active.get(id)?.applied) {
          if (!options.deactivate) fail('UNSUPPORTED_SURFACE', 'The active surface must uninstall this pack before it can be removed.');
          // The external editor CAS still runs immediately before the first live effect. The driver's own reload
          // may advance that revision; after it starts only this initiating CAS is retired, never the base guards.
          checkLocalRead(guarded); effectStarted = true;
          await localWait(Promise.resolve(options.deactivate(kind, id, ctx.signal)), guarded);
        }
        checkLocalRead(guarded);
        emit({ operation: 'remove', phase: 'storing', files: entry.files, bytes: entry.bytes });
        checkLocalRead(guarded);
        const current = await snapshot();
        checkLocalRead(guarded);
        if (!current || current.hash !== selected.hash) fail('REVISION_CONFLICT', 'The stored pack changed during removal; its current content was kept.');
        effectStarted = true;
        await stored(current.remove);
        active.delete(id);
        activeModGenerations.delete(id);
        activeNativeContent.delete(id);
        emit({ operation: 'remove', phase: 'complete', files: entry.files, bytes: entry.bytes });
        return { ...entry, stored: false, enabled: false, applied: false, removed: true };
      }, () => { if (!effectStarted) request.check?.(); });
    },
    dispose() { if (lifetime.signal.aborted) return; lifetime.abort(); directoryLifetime.abort(); root = null; revision++; staged.clear(); listeners.clear(); active.clear(); activeModGenerations.clear(); activeNativeContent.clear(); state.dispose(); },
    // Filled below (B206 ML-1): they use `api.import` and `api.remove`.
    hd: undefined as unknown as HdLibrary, modsState: undefined as unknown as ModsStateApi, importDrop: undefined as unknown as PackRegistry['importDrop'],
  };

  // ---- B206 ML-1: the HD library, the MODS state and the drop (ML.R3, R7, R8). A browser adaptation (OT.R110). ----

  /** A removed or replaced pack the state chose reads Original (ML.R8: the selector never names a pack not kept); a removed
   *  model pack's slot is switched off with it (the ML-10 merge review's nit 5: a later pack in that slot starts off). */
  const forget = async (id: string): Promise<void> => {
    const slot: keyof ModelSwitches | null = id === 'model:current' ? 'primary' : id === 'model:second' ? 'second' : null;
    try {
      const saved = await state.read();
      if (saved.texture === id) await state.write(current => ({ ...current, texture: current.texture === id ? null : current.texture }));
      else if (slot && saved.models[slot]) await state.write(current => ({ ...current, models: { ...current.models, [slot]: false } }));
    } catch { /* the next read refuses a stale id */ }
  };
  const hdLibrary: HdLibrary = {
    async list() { alive(); const meta = await hdKept(); return meta ? copy(hdSummary(meta)) : null; },
    install(file, request = {}) {
      return run('import', request.signal, false, async ctx => {
        if (!hd) fail('UNSUPPORTED_SURFACE', 'This page keeps no HD pack.');
        const before = await hdKept();
        emit({ operation: 'import', phase: 'reading', files: 0, bytes: 0 });
        let imported: Awaited<ReturnType<typeof importHdZip>>;
        try {
          imported = await localWait(importHdZip(file, hd, (files, bytes) => emit({ operation: 'import', phase: 'storing', files, bytes })), ctx);
        } catch (e) {
          if (e instanceof LocalFileError) throw e;
          if (e instanceof HdRefusal) fail('INVALID_PACKAGE', `The HD pack was refused: ${e.reason}.`);
          if (e instanceof Error && e.name === 'ZipError') fail('INVALID_PACKAGE', `The zip could not be read: ${e.message}.`);
          fail('STORAGE_FAILED', 'The browser could not keep the HD pack (its space, or another tab holding the store).');
        }
        if (!imported) fail('INVALID_PACKAGE', 'Not an HD pack: the zip holds no experimental-packs/hd/current.json.');
        const meta = await hdKept();
        if (!meta) fail('STORAGE_FAILED', 'The HD pack was written but could not be read back.');
        // One HD pack at a time: a replaced pack the state chose is followed by its replacement.
        if (before && before.id !== meta.id) {
          try { if ((await state.read()).texture === `hd:${before.id}`) await state.write(current => ({ ...current, texture: `hd:${meta.id}` })); } catch { /* Original */ }
        }
        const summary = hdSummary(meta);
        emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
        state.notify();
        return copy(summary);
      });
    },
    // TEST_HD_PACK_BUTTON_ADAPTATION (ML-12): the served pack into the same store; removed by ML-13.
    installFrom(source, request = {}) {
      return run('import', request.signal, false, async ctx => {
        if (!hd) fail('UNSUPPORTED_SURFACE', 'This page keeps no HD pack.');
        const before = await hdKept();
        emit({ operation: 'import', phase: 'reading', files: 0, bytes: 0 });
        let fetched: boolean;
        try {
          fetched = (await localWait(installHdFromSource(source, hd, (files, bytes, _decoded, ofFiles, ofBytes) => {
            emit({ operation: 'import', phase: 'storing', files, bytes }); request.onProgress?.({ files, ofFiles, bytes, ...(ofBytes !== null && { ofBytes }) });
          }), ctx)).fetched;
        } catch (e) {
          if (e instanceof LocalFileError) throw e;
          if (e instanceof HdNotServed) fail('NOT_FOUND', 'The HD pack is not served here.');
          if (e instanceof HdRefusal) fail('INVALID_PACKAGE', `The HD pack was refused: ${e.reason}.`);
          fail('STORAGE_FAILED', 'The browser could not keep the HD pack (its space, or another tab holding the store).');
        }
        const meta = await hdKept();
        if (!meta) fail('STORAGE_FAILED', 'The HD pack was written but could not be read back.');
        if (before && before.id !== meta.id) {
          try { if ((await state.read()).texture === `hd:${before.id}`) await state.write(current => ({ ...current, texture: `hd:${meta.id}` })); } catch { /* Original */ }
        }
        const summary = hdSummary(meta);
        emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
        state.notify();
        return { ...copy(summary), fetched };
      });
    },
    remove(request = {}) {
      return run('remove', request.signal, false, async () => {
        const store = hd;
        if (!store?.remove) fail('UNSUPPORTED_SURFACE', 'This page cannot remove the HD pack.');
        const meta = await hdKept();
        if (!meta) fail('NOT_FOUND', 'No HD pack is kept in this browser.');
        const summary = hdSummary(meta);
        emit({ operation: 'remove', phase: 'storing', files: summary.files, bytes: summary.bytes });
        await stored(() => store.remove!());
        await forget(summary.id);
        emit({ operation: 'remove', phase: 'complete', files: summary.files, bytes: summary.bytes });
        state.notify();
        return { ...summary, stored: false, enabled: false, applied: false, removed: true };
      });
    },
  };
  const removeStored = api.remove;
  api.remove = (inputId, request = {}) => {
    if (typeof inputId === 'string' && inputId.startsWith('hd:')) {
      return hdKept().then(meta => {
        if (!meta || `hd:${meta.id}` !== inputId) throw new LocalPackError('NOT_FOUND', 'The local pack ID was not found.');
        return hdLibrary.remove(request);
      });
    }
    return removeStored(inputId, request).then(async result => { await forget(result.id); state.notify(); return result; });
  };

  const readMods = async (): Promise<ModChoices> => {
    // The lazy contract: a native library is not opened while the mods' own flag says none is kept.
    if (nativeMods && !hintAvailable()) return EMPTY_MOD_CHOICES;
    try { return (mods.list ? await mods.list() : await mods.read()).choices; } catch { return EMPTY_MOD_CHOICES; }
  };
  const readState = async (): Promise<ModsState> => {
    const saved = await state.read();
    return { texture: saved.texture, models: { ...saved.models }, mods: await readMods() };
  };
  const modsStateApi: ModsStateApi = {
    read: () => { alive(); return readState(); },
    async setTexture(id) {
      alive();
      if (id !== null) {
        if (!isTextureChoice(id)) fail('INVALID_PATH', 'Choose Original or an installed texture pack.');
        const kept = id.startsWith('hd:') ? (await hdKept())?.id === id.slice(3)
          : (await textures.catalogue()).some(({ record }) => `texture:${record.map}:${record.id}` === id);
        if (!kept) fail('NOT_FOUND', 'That texture pack is not installed.');
      }
      await stored(() => state.write(current => ({ ...current, texture: id })));
      return readState();
    },
    async setModel(slot, on) {
      alive();
      await stored(() => state.write(current => ({ ...current, models: { ...current.models, [slot]: on } })));
      return readState();
    },
    async setMods(choices) {
      alive();
      await stored(() => mods.writeChoices(choices));
      state.notify();
      return readState();
    },
    subscribe(listener) { alive(); return state.subscribe(listener); },
  };

  /** The drop's members: a zip read a range at a time (names first, a member when asked), or the files themselves. */
  const dropSource = async (files: readonly DropFile[], ctx: LocalReadOptions): Promise<{ zip: DropFile | null; names: string[]; small: ReadSmall;
    read(names: readonly string[]): Promise<LocalEntry[]> }> => {
    const only = files.length === 1 ? files[0]! : null;
    if (only && /\.zip$/i.test(only.name)) {
      let zip: Awaited<ReturnType<typeof openZip>>;
      try { zip = await localWait(openZip(blobSource(only as unknown as Blob)), ctx); }
      catch (e) { if (e instanceof LocalFileError) throw e; fail('INVALID_PACKAGE', 'The dropped zip could not be read.'); }
      const members = zip.members.filter(member => !member.name.endsWith('/'));
      if (members.some(member => !safeMemberName(member.name))) fail('INVALID_PATH', 'The zip names a file outside itself.');
      const byName = new Map(members.map(member => [member.name, member]));
      return { zip: only, names: [...byName.keys()],
        small: async name => { const member = byName.get(name); return member && member.size <= STORE_MANIFEST_READ_BYTES ? zip.read(member) : null; },
        async read(names) {
          const wanted = names.map(name => byName.get(name)!);
          const total = wanted.reduce((n, member) => n + member.size, 0);
          if (wanted.length > LOCAL_FILE_LIMITS.files || total > LOCAL_FILE_LIMITS.bytes) fail('LIMIT_EXCEEDED', 'The pack is over this browser\'s local import limit.');
          const entries: LocalEntry[] = []; let bytes = 0;
          for (const member of wanted) {
            checkLocalRead(ctx);
            const data = await localWait(zip.read(member), ctx);
            bytes += data.length; entries.push({ path: member.name, bytes: data });
            emit({ operation: 'import', phase: 'reading', files: entries.length, bytes });
          }
          return entries;
        } };
    }
    const byPath = new Map<string, DropFile>();
    for (const file of files) {
      const path = localPath(file.webkitRelativePath || file.name);
      if (byPath.has(path)) fail('DUPLICATE_PATH', 'Two dropped files share one path.');
      byPath.set(path, file);
    }
    return { zip: null, names: [...byPath.keys()],
      small: async name => { const file = byPath.get(name); return file && file.size <= STORE_MANIFEST_READ_BYTES ? new Uint8Array(await file.arrayBuffer()) : null; },
      read: names => readPickedFiles(names.map(name => byPath.get(name)!), { ...ctx, onRead: (files, bytes) => emit({ operation: 'import', phase: 'reading', files, bytes }) }) };
  };
  /**
   * A built GX pack (a served pack's `manifest.json` and its payloads) into the texture library, as the test room's
   * upload keeps one: the manifest checked (`validateManifest`), every payload present at its entry's size, then the
   * framework's validation recorded beside it -- kept unvalidated when it cannot pass (a page with no disc gives no
   * archive hashes, so the archive dependency is a skipped check), as `import`'s texture branch keeps an upload.
   */
  const installBuiltTexture = (files: readonly LocalEntry[], name: string, signal?: AbortSignal): Promise<LocalPackResult> =>
    run('import', signal, false, async ctx => {
      const manifestFile = files.find(file => file.path === 'manifest.json');
      if (!manifestFile) fail('INVALID_PACKAGE', 'A built texture pack holds manifest.json at its root.');
      let manifest: ReturnType<typeof validateManifest>;
      try { manifest = validateManifest(JSON.parse(new TextDecoder().decode(manifestFile.bytes))); }
      catch { fail('INVALID_PACKAGE', 'The texture pack\'s manifest.json does not check out.'); }
      const map = manifest.mapArchive.slice(4, -4);
      if (!packMap(map)) fail('INVALID_PACKAGE', 'The texture manifest names an unsupported map.');
      const byPath = new Map(files.map(file => [file.path, file.bytes]));
      for (const entry of manifest.entries) {
        if (byPath.get(entry.file)?.length !== entry.bytes) fail('INVALID_PACKAGE', `${entry.file} is missing or not its entry's size.`);
      }
      const members = new Map<string, Uint8Array>([['manifest.json', manifestFile.bytes], ...manifest.entries.map(entry => [entry.file, byPath.get(entry.file)!] as [string, Uint8Array])]);
      const id = await sha256(manifestFile.bytes);
      emit({ operation: 'import', phase: 'validating', files: members.size, bytes: sizeOf([...members].map(([path, bytes]) => ({ path, bytes }))) });
      const checked = await validation(buildContext, ctx, bound => validateLegacyPack('texture', [...members].map(([path, bytes]) => ({ path, bytes })), bound));
      const summary: LocalPackSummary = { ...baseSummary(`texture:${map}:${id}`, 'texture', name, members.size, sizeOf([...members].map(([path, bytes]) => ({ path, bytes })))),
        ref: checked.ok ? checked.ref : null, validation: checked.ok ? 'validated' : 'pending-validation', report: checked.report, slot: 'per-map' };
      if (checked.ok) summary.packKinds = checked.manifest.kinds;
      checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await stored(() => textures.add(map, 'pack', { id, name: summary.name, kind: 'textures', method: manifest.method, scale: manifest.scale,
        roles: manifest.roles ?? 'world', generatedAt: new Date().toISOString(), textures: manifest.entries.length, bytes: manifest.totalBytes, notes: '' },
      members, { signal: ctx.signal, identity: checked.ok ? checked : undefined, validationReport: checked.ok ? undefined : checked.report }));
      emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
      return copy(summary);
    });
  /**
   * FP-5 item 2 (FP.R12): a forge-map bundle's entries, rooted at the drop's root, imported whole inside one run: the same
   * bundle (by digest) already kept is a note and nothing else; otherwise FP-4's `validateForgeBundle` checks it against
   * this build and the v2 packs this device holds (a carried pack's `{id, range}` dependency resolves against them, the
   * FP-4 review's note); each carried pack not held already (by `PackRef`) goes through `installFiles`, the one v2 install
   * path (a different hash under a held id and version is its REVISION_CONFLICT), a carried dependency first; then the
   * custom map's record. A refusal stores no record; a pack installed before a later pack's refusal stays, a valid pack.
   */
  const importBundle = (entries: readonly LocalEntry[], signal?: AbortSignal): Promise<LocalPackResult> =>
    run('import', signal, false, async ctx => {
      if (options.allowedSurface && !options.allowedSurface('custom-map')) fail('UNSUPPORTED_SURFACE', 'This surface does not currently permit local imports.');
      emit({ operation: 'import', phase: 'validating', files: entries.length, bytes: sizeOf(entries) });
      const key = await digest(entries, ctx);
      const held = async (): Promise<PackRef[]> => (await stored(framework)).map(record => record.ref);
      const kept = (await stored(customMaps)).find(record => record.digest === key);
      if (kept) {
        const summary = customMapSummary(kept, await held());
        summary.diagnostics.push({ code: CUSTOM_MAP_ALREADY_HERE, count: 1 });
        emit({ operation: 'import', phase: 'complete', files: 0, bytes: 0 });
        return copy(summary);
      }
      const snapshot = await dependencySnapshot(ctx);
      const checked = await validation(buildContext, ctx, bound => validateForgeBundle(entries, {
        target: bound.target, contract: bound.contract, packs: [...(bound.packs ?? []), ...snapshot],
        ...(bound.archives ? { archives: bound.archives } : {}), ...(bound.handlers ? { handlers: bound.handlers } : {}),
        ...(bound.sha256 ? { sha256: bound.sha256 } : {}),
      }));
      if (!checked.ok) {
        const first = checked.diagnostics.find(d => d.severity === 'error') ?? checked.diagnostics[0];
        throw new LocalPackError('INVALID_PACKAGE', first?.text ?? 'The Forge map bundle did not pass validation.', undefined,
          checkReport(checked.diagnostics, { evidence: 'validation' }));
      }
      const { bundle } = checked;
      // The envelope the validator read: the root one first (FP-4's fold prefers it), else the one in the one top folder.
      const envelope = entries.find(e => e.path === FORGE_BUNDLE_FILE) ?? entries.find(e => e.path.endsWith(`/${FORGE_BUNDLE_FILE}`) && e.path.split('/').length === 2)!;
      const prefix = envelope.path.slice(0, envelope.path.length - FORGE_BUNDLE_FILE.length);
      const already = await held();
      let pending = bundle.packs.filter(pack => !already.some(ref => equalRef(ref, pack.ref)));
      while (pending.length) {
        // A carried pack waits for a carried pack it depends on (its install validates against the store).
        const ready = pending.filter(pack => !pack.manifest.dependencies.some(dep => 'id' in dep && pending.some(other => other !== pack && other.ref.id === dep.id)));
        const next = ready.length ? ready : [pending[0]!];
        for (const pack of next) {
          const at = prefix + pack.root;
          await installFiles(pack.ref, entries.filter(e => e.path.startsWith(at)).map(e => ({ path: e.path.slice(at.length), bytes: e.bytes })), ctx);
        }
        pending = pending.filter(pack => !next.includes(pack));
      }
      const record: CustomMapRecord = { digest: key, name: bundle.layout.name, layout: bundle.layout,
        packs: bundle.packs.map(pack => ({ id: pack.ref.id, version: pack.ref.version, hash: pack.ref.hash })), missing: bundle.missing, importedAt: Date.now() };
      const summary = customMapSummary(record, await held());
      checkLocalRead(ctx); emit({ operation: 'import', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await stored(() => database.patch<CustomMapData>('custom-maps', emptyCustomMaps,
        data => ({ records: [...data.records.filter(r => r.digest !== key), record as unknown as (typeof data.records)[number]] }), { signal: ctx.signal }));
      emit({ operation: 'import', phase: 'complete', files: summary.files, bytes: summary.bytes });
      return copy(summary);
    });
  /** FP-5 item 2: a custom map removed -- its record only; its packs are kept (they may serve other layouts), and the result says so. */
  const removeCustomMap = (id: string, request: { signal?: AbortSignal; check?: () => void }): Promise<LocalPackResult> =>
    run('remove', request.signal, false, async ctx => {
      const scope = await stored(() => database.peek('custom-maps'));
      const selected = ((scope?.data as CustomMapData | undefined)?.records ?? []).find(record => customMapId(record.digest) === id);
      if (!scope || !selected) fail('NOT_FOUND', 'The custom map was not found.');
      const summary = customMapSummary(selected, (await stored(framework)).map(record => record.ref));
      checkLocalRead(ctx); emit({ operation: 'remove', phase: 'storing', files: summary.files, bytes: summary.bytes }); checkLocalRead(ctx);
      await stored(() => database.patch<CustomMapData>('custom-maps', emptyCustomMaps,
        data => ({ records: data.records.filter(record => record.digest !== selected.digest) }), { expectedGeneration: scope.generation, signal: ctx.signal }));
      emit({ operation: 'remove', phase: 'complete', files: summary.files, bytes: summary.bytes });
      return { ...copy(summary), stored: false, enabled: false, applied: false, removed: true,
        diagnostics: [...summary.diagnostics, { code: CUSTOM_MAP_PACKS_KEPT, count: selected.packs.length }] };
    }, request.check);
  const importDrop: PackRegistry['importDrop'] = async (files, request = {}) => {
    alive();
    if (!files.length) fail('INVALID_PATH', 'Nothing was dropped.');
    const ctx: LocalReadOptions = { signal: request.signal ?? lifetime.signal, check: alive };
    const source = await dropSource(files, ctx);
    const found = await classifyDrop(source.names, source.small, options.classify);
    if (found.kind === 'refused') fail('UNSUPPORTED_FORMAT', found.reason);
    if (found.kind === 'hd') {
      if (!source.zip) fail('UNSUPPORTED_FORMAT', 'Drop the HD pack as its zip (or its Thunderstore zip), not as loose files.');
      return hdLibrary.install(source.zip, request);
    }
    // A GX source pack (export.json folders or plain PNGs) is built against its map's own textures: only a page with a
    // map loaded (the test room, `loadedTextures`) can build it; MODS on Home adds built packs (a manifest.json's).
    if (found.kind === 'texture' && found.texture === 'source' && (!options.loadedTextures || !source.zip))
      fail('UNSUPPORTED_SURFACE', 'A texture pack of PNGs or export.json folders is built against its map: open the map in the test room to build it; MODS adds built packs.');
    if (found.kind === 'bundle') {
      // FP-5 item 2: the payload rooted at the bundle's root (its one folder stripped); FP-4's validator reads the rest.
      const read = await source.read(found.payload);
      const result = await importBundle(read.map(entry => ({ path: entry.path.slice(found.root.length), bytes: entry.bytes })), request.signal);
      state.notify();
      return result;
    }
    const rootAtTop = found.kind === 'pack' && source.names.includes('s2u-pack.json');
    const entries = await source.read(rootAtTop ? source.names : found.payload);
    const rooted = rootAtTop ? entries : entries.map(entry => ({ path: entry.path.slice(found.root.length), bytes: entry.bytes }));
    let result: LocalPackResult;
    if (found.kind === 'texture' && found.texture === 'built') {
      result = await installBuiltTexture(rooted, found.wrapping?.name ?? files[0]!.name.replace(/\.zip$/i, ''), request.signal);
    } else {
      const kind = found.kind as 'mod' | 'model' | 'texture' | 'pack';
      const group = kind === 'texture' ? [{ path: source.zip!.name, bytes: new Uint8Array(await source.zip!.arrayBuffer()) }] : rooted;
      const id = `staged:${globalThis.crypto.randomUUID()}`;
      const summary = baseSummary(id, kind, found.wrapping?.name ?? files[0]!.name.replace(/\.zip$/i, ''), group.length, sizeOf(group));
      summary.staged = true; summary.imported = false; summary.stored = false;
      staged.set(id, { summary, entries: group });
      try { result = await api.import(kind === 'pack' ? { kind, stagedId: id } : { kind, stagedId: id, name: summary.name }, request); }
      finally { staged.delete(id); }
    }
    state.notify();
    return result;
  };
  api.hd = hdLibrary; api.modsState = modsStateApi; api.importDrop = importDrop;
  return api;
}
