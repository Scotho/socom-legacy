import { appliesOn, contentMapMemberPath, packRefKey, samePackRef, type ContentRef, type PackManifest, type PackRef } from '@s2u/creator-contracts';
import type { ForgeContentSource } from '../../forge/page';
import { pageIndexedDb } from '../../pageStore';
import { idbPackDatabase, type PackDatabase } from '../storage';
import { browserChannel, MODS_CHANNEL, type ChannelFactory } from '../modsState';
import type { LocalPackProgress } from '../registry';
import { assetMemberPath, readAssetDefinition, type AssetDefinition } from './assets';
import type { CustomMapData, CustomMapRecord } from '../customMaps';

/**
 * FP-5 item 5 (FP.R3; product track, a browser adaptation with no original): the Forge's production content source
 * (`../../forge/page` `ForgeContentSource`), read from the registry's own store -- the v2 packs `./registry` keeps in the
 * common database's `packs` scope (`../storage`). Until this, the page ran on `NO_CONTENT_SOURCE` and no content layout
 * could open.
 *
 * - `availablePacks()`: every v2 pack the store holds, by reference (the page's `MountForgeOptions.availablePacks`: a
 *   layout's `requires` may name any v2 pack, so a non-content pack held here is not "missing" either).
 * - At `refresh()` (the review's F2; #748's P2): ONE transaction lists the packs and reads the content packs' JSON members
 *   -- their maps (`mapIndex()`, the picker's index) and their asset definitions, all small -- a whole pack at a time, at
 *   most `CONTENT_PRELOAD_MAX_ADAPTATION` members; a pack that does not fit has only its maps read (as the budget allows).
 *   So a saved layout's pack PIECES on a blank or retail base, which call no `map()`, resolve at their first synchronous
 *   `asset()` -- the page builds a piece once, and a null there is a stand-in nothing rebuilds. GLB and image bytes stay
 *   lazy (`member`).
 * - Past the bound, a pack's JSON is read on its first use, ONE transaction a pack: `map(ref)` answers a promise that reads
 *   it (and every held pack the map's props or dependencies name) and then the map; `asset(ref)` starts that read and
 *   answers null -- `ready(packs)` awaits it, for a caller that knows a layout's packs before it opens it. `map(ref)` answers the parsed member (`loadContentBase`'s `readMap` input;
 *   the page reads the definition itself), `asset(ref)` the definition read by `readAssetDefinition`, or null.
 * - `member(pack, path)`: a read JSON member's bytes at once, any other member (a GLB, an image) read from the store on
 *   demand, one transaction -- never a member of a pack a page does not apply (`appliesOn`, FX-5).
 * Every read finds its pack by reference inside its own transaction (the review's F1, `PackDatabase.readSelected`).
 * Every answer for a pack, asset or member not here is null, and nothing throws (the page's rule, `page.ts` at its
 * `contentSource` binding): a store that cannot open reads as holding nothing. `refresh()` reads the store again (an
 * install or a removal made after the page booted) and forgets what it had read of the packs.
 */
export interface RegistryContentSource extends ForgeContentSource {
  availablePacks(): PackRef[];
  /** The content maps the boot read: each by reference, with its own name (FP-6's picker). */
  mapIndex(): { ref: ContentRef; name: string }[];
  /** FP-6 item 1: the custom maps MODS keeps (the store's `custom-maps` scope, `../customMaps`), as the last refresh read them. */
  customMaps(): CustomMapRecord[];
  /** Settles once each pack's JSON members are read (at once when they are, or when one is not held). */
  ready(packs: PackRef | readonly PackRef[]): Promise<void>;
  refresh(): Promise<void>;
}

/**
 * The most JSON members (maps and asset definitions) the boot reads in its one transaction (the review's F2, #748's P2):
 * a ceiling of this tool, not a game value -- the boot stays bounded however many content packs a player keeps; a pack
 * past it is read whole on its first use (`ready`).
 */
export const CONTENT_PRELOAD_MAX_ADAPTATION = 512;
/** `registryContentSource`'s options: `preloadMax` replaces `CONTENT_PRELOAD_MAX_ADAPTATION` (a test's small bound). */
export interface RegistryContentOptions { preloadMax?: number }

interface StoredRecordMeta { ref: PackRef; manifest: PackManifest; files: { path: string }[] }
const MAP_MEMBER = /^maps\/[^/]+\.json$/i;
const JSON_MEMBER = /\.json$/i;
/**
 * FX-5 (the 0.2 spec section 3, `sides` read): a stored pack whose content this page offers -- a `content` pack the
 * contract's `appliesOn(manifest, 'client')` says a page applies. A pack holding the reserved `plugin` kind, or a
 * `server` pack, is stored and still listed by `availablePacks()` (a layout's `requires` may name it), but its maps are
 * never listed or read, its assets never resolved and its members' bytes never served.
 */
const offered = (manifest: PackManifest): boolean => manifest.kinds.includes('content') && appliesOn(manifest, 'client');
const isRef = (v: unknown): v is PackRef => !!v && typeof v === 'object' && ['id', 'version', 'hash'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string');

export async function registryContentSource(database: PackDatabase, options: RegistryContentOptions = {}): Promise<RegistryContentSource> {
  let packs: PackRef[] = [];
  let contentPacks: PackRef[] = [];
  /** `packRefKey(ref) + '\n' + path` -> the member's bytes and its parsed JSON. */
  let json = new Map<string, { bytes: Uint8Array; value: unknown }>();
  let assets = new Map<string, AssetDefinition | null>();
  /** Each pack whose JSON members are read (or being read), by `packRefKey`. */
  let loads = new Map<string, Promise<void>>();
  let loaded = new Set<string>();
  let index: { ref: ContentRef; name: string }[] = [];
  let customs: CustomMapRecord[] = [];
  const key = (pack: PackRef, path: string): string => `${packRefKey(pack)}\n${path}`;
  /**
   * The review's F1: chosen members of chosen packs read in ONE transaction, each pack found by its reference inside it
   * (`PackDatabase.readSelected`), never by an index listed in an earlier transaction -- a pack installed or removed in
   * between (another tab, the page's own import) cannot hand this pack another's bytes. `want` sees the held records'
   * metadata and names, per record, the member paths it reads; `seen` gets the records as that transaction saw them.
   */
  const readMembers = async (want: (record: StoredRecordMeta) => readonly string[],
    seen?: (records: StoredRecordMeta[]) => void): Promise<{ pack: PackRef; path: string; bytes: Uint8Array }[]> => {
    const asked: { pack: PackRef; path: string }[] = [];
    const got = await database.readSelected<Uint8Array | ArrayBuffer>('packs', (data) => {
      const records = ((data as { records?: StoredRecordMeta[] } | null)?.records ?? []);
      seen?.(records);
      const paths: (string | number)[][] = [];
      records.forEach((record, at) => {
        for (const path of want(record)) {
          const file = record.files.findIndex((f) => f.path === path);
          if (file < 0) continue;
          asked.push({ pack: record.ref, path });
          paths.push(['records', at, 'files', file, 'bytes']);
        }
      });
      return paths;
    });
    if (!got) { seen?.([]); return []; }
    const out: { pack: PackRef; path: string; bytes: Uint8Array }[] = [];
    got.values.forEach((value, i) => {
      const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
      if (bytes) out.push({ ...asked[i]!, bytes });
    });
    return out;
  };
  const parsed = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  const keep = (target: Map<string, { bytes: Uint8Array; value: unknown }>, read: { pack: PackRef; path: string; bytes: Uint8Array }[]): void => {
    for (const m of read) { try { target.set(key(m.pack, m.path), { bytes: m.bytes, value: parsed(m.bytes) }); } catch { /* a member that does not read is not here */ } }
  };
  const held = (pack: PackRef): boolean => packs.some((p) => samePackRef(p, pack));
  const isContent = (pack: PackRef): boolean => contentPacks.some((p) => samePackRef(p, pack));

  /** FP-6 item 1: the kept custom maps, read beside the packs (its own scope, so the packs' one transaction is unchanged). */
  const readCustomMaps = async (): Promise<CustomMapRecord[]> => {
    try { const scope = await database.peek('custom-maps'); return scope ? [...((scope.data as CustomMapData | null)?.records ?? [])] : []; }
    catch { return []; }
  };
  const refresh = async (): Promise<void> => {
    customs = await readCustomMaps();
    const nextJson = new Map<string, { bytes: Uint8Array; value: unknown }>();
    let records: StoredRecordMeta[] = [];
    let budget = Math.max(0, options.preloadMax ?? CONTENT_PRELOAD_MAX_ADAPTATION);
    const whole = new Set<string>();
    try {
      keep(nextJson, await readMembers((record) => {
        if (!offered(record.manifest)) return [];
        const all = record.files.map((f) => f.path).filter((p) => JSON_MEMBER.test(p));
        if (all.length <= budget) { budget -= all.length; whole.add(packRefKey(record.ref)); return all; }
        const maps = all.filter((p) => MAP_MEMBER.test(p)).slice(0, budget);
        budget -= maps.length;
        return maps;
      }, (seen) => { records = seen; }));
    } catch { records = []; whole.clear(); }
    packs = records.map((record) => ({ id: record.ref.id, version: record.ref.version, hash: record.ref.hash }));
    contentPacks = records.filter((record) => offered(record.manifest)).map((record) => ({ ...record.ref }));
    json = nextJson;
    assets = new Map();
    loads = new Map();
    loaded = whole;
    for (const k of whole) loads.set(k, Promise.resolve());
    index = [];
    for (const record of records) {
      for (const f of record.files) {
        const m = MAP_MEMBER.exec(f.path) ? nextJson.get(key(record.ref, f.path)) : undefined;
        const value = m?.value as { name?: unknown } | undefined;
        if (!m) continue;
        const assetId = f.path.slice('maps/'.length, -'.json'.length);
        index.push({ ref: { kind: 'pack', pack: { ...record.ref }, assetId }, name: typeof value?.name === 'string' ? value.name : assetId });
      }
    }
  };
  /** One pack's JSON members, in one transaction; once a refresh (at once for a pack the boot read whole). */
  const readyOne = (pack: PackRef): Promise<void> => {
    if (!held(pack) || !isContent(pack)) return Promise.resolve();
    const k = packRefKey(pack);
    let p = loads.get(k);
    if (!p) {
      const into = json, mark = loaded;
      p = readMembers((record) => samePackRef(record.ref, pack) ? record.files.map((f) => f.path).filter((path) => JSON_MEMBER.test(path)) : [])
        .then((read) => { keep(into, read); mark.add(k); })
        .catch(() => { mark.add(k); });
      loads.set(k, p);
    }
    return p;
  };
  const ready = async (list: PackRef | readonly PackRef[]): Promise<void> => {
    await Promise.all((Array.isArray(list) ? list as readonly PackRef[] : [list as PackRef]).map(readyOne));
  };
  /** The held packs a map's props or dependencies name, beside its own. */
  const named = (value: unknown): PackRef[] => {
    const out: PackRef[] = [];
    const v = value as { props?: unknown; dependencies?: unknown } | null;
    for (const p of Array.isArray(v?.props) ? v!.props as unknown[] : []) {
      const pack = (p as { content?: { pack?: unknown } } | null)?.content?.pack;
      if (isRef(pack)) out.push(pack);
    }
    for (const d of Array.isArray(v?.dependencies) ? v!.dependencies as unknown[] : []) if (isRef(d)) out.push(d);
    return out.filter((r) => held(r));
  };
  await refresh();
  const kept = (pack: PackRef, path: string): { bytes: Uint8Array; value: unknown } | undefined => json.get(key(pack, path));
  const mapOf = (ref: ContentRef): unknown => kept(ref.pack, contentMapMemberPath(ref.assetId))?.value ?? null;
  return {
    availablePacks: () => packs.map((p) => ({ ...p })),
    mapIndex: () => index.map((m) => ({ ref: { ...m.ref, pack: { ...m.ref.pack } }, name: m.name })),
    customMaps: () => customs.map((r) => ({ ...r })),
    ready,
    refresh,
    map(ref: ContentRef): unknown {
      try {
        if (!held(ref.pack) || !isContent(ref.pack)) return null;
        // #748's P2: readiness per MAP -- its own pack, then the packs THIS map's props and dependencies name -- on both
        // paths, never inferred from its owning pack's having been read for another of its maps.
        const isLoaded = (pack: PackRef): boolean => loaded.has(packRefKey(pack));
        if (isLoaded(ref.pack)) {
          const value = mapOf(ref);
          const needs = named(value).filter((pack) => isContent(pack) && !isLoaded(pack));
          return needs.length ? ready(needs).then(() => value).catch(() => null) : value;
        }
        return readyOne(ref.pack).then(async () => {
          const value = mapOf(ref);
          await ready(named(value));
          return value;
        }).catch(() => null);
      } catch { return null; }
    },
    asset(ref: ContentRef): AssetDefinition | null {
      try {
        if (!loaded.has(packRefKey(ref.pack))) { void readyOne(ref.pack); return null; }
        const k = key(ref.pack, assetMemberPath(ref.assetId));
        if (assets.has(k)) return assets.get(k)!;
        const found = json.get(k);
        const def = found ? readAssetDefinition(found.value, ref) : null;
        const value = def && !Array.isArray(def) ? def : null;
        assets.set(k, value);
        return value;
      } catch { return null; }
    },
    async member(pack: PackRef, path: string): Promise<Uint8Array | null> {
      try {
        const found = kept(pack, path);
        if (found) return found.bytes.slice();
        const [read] = await readMembers((record) => samePackRef(record.ref, pack) && appliesOn(record.manifest, 'client') ? [path] : []);
        return read?.bytes ?? null;
      } catch { return null; }
    },
  };
}

/**
 * The review's F3: the source read again whenever the packs change -- the registry's own completed install or removal
 * (`packs.subscribe`, the page's local packs: an import made inside the Forge page) and another page's notice on the
 * packs' channel (`../modsState` `MODS_CHANNEL`: MODS on Home, another tab). Refreshes run one after another; a change
 * heard while one runs asks one more. `idle()` settles when none is left; `dispose()` stops listening.
 */
export function refreshOnPackChanges(source: Pick<RegistryContentSource, 'refresh'>,
  on: { packs?: { subscribe?(listener: (event: LocalPackProgress) => void): () => void }; channel?: ChannelFactory }): { idle(): Promise<void>; dispose(): void } {
  let chain: Promise<void> = Promise.resolve();
  let queued = false, gone = false;
  const again = (): void => {
    if (gone || queued) return;
    queued = true;
    chain = chain.then(() => { queued = false; return gone ? undefined : source.refresh(); }).catch(() => undefined);
  };
  let unsubscribe: (() => void) | undefined;
  try {
    if (typeof on.packs?.subscribe === 'function') unsubscribe = on.packs.subscribe((e) => {
      if (e.phase === 'complete' && (e.operation === 'import' || e.operation === 'remove')) again();
    });
  } catch { unsubscribe = undefined; }
  let channel: ReturnType<ChannelFactory> = null;
  try {
    channel = (on.channel ?? browserChannel)(MODS_CHANNEL);
    if (channel) channel.onmessage = () => { again(); };
  } catch { channel = null; }
  return {
    idle: async () => { for (let last: Promise<void> | null = null; last !== chain;) { last = chain; await chain; } },
    dispose: () => {
      gone = true;
      try { unsubscribe?.(); } catch { /* gone */ }
      try { channel?.close(); } catch { /* closed */ }
    },
  };
}

let shared: Promise<RegistryContentSource> | null = null;
/**
 * The page's one source over the page's pack database (`idbPackDatabase(pageIndexedDb)`, the registry's default): the
 * Forge's entry (`../../pageEntry`) passes it as `MountForgeOptions.content`, and the test room takes the same object
 * once it lists content maps (FP-6). Read once; `refresh()` reads again.
 */
export function pageContentSource(): Promise<RegistryContentSource> {
  return shared ??= registryContentSource(idbPackDatabase(pageIndexedDb));
}
