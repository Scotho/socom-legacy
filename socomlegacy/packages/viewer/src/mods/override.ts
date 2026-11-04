/**
 * The one hook (`TEST_ROOM_MODS_ADAPTATION`). `discSource.ts` `sourceCache` asks `applyOverrideSource` for every
 * source it hands out. With no overrides installed it returns that source, so a file read is the disc reader's own
 * method. With overrides, a path in the table is answered from the mod and the disc is not read.
 */
import {
  memberOverridesActive, noteMemberArchive, streamExtent,
  type AssetSource, type BlobAssetSource, type RangedAssetSource, type ReadProgress, type StreamOptions,
} from '@s2u/archive';
import { canonicalDiscPath } from './manifest';

export interface ModOverrideBytes { path: string; bytes: Uint8Array }

/**
 * An added file has no sector on the disc. This LBN is past any PS2 image, so a sector lookup of the disc does not
 * land on it. `extents()` lists it after the disc's own files so a directory walk sees the path.
 */
export const MOD_ADDED_FILE_LBN = 0x7fffffff;

interface DiscExtent { path: string; lbn: number; size: number }
interface OneExtent { lbn: number; size: number }

let table: Map<string, Uint8Array> | null = null;
const proxies = new WeakMap<AssetSource, AssetSource>();

/** Replaces the table. `null` or an empty list turns the hook off. */
export function installModOverrides(entries: readonly ModOverrideBytes[] | null): void {
  if (!entries || entries.length === 0) { table = null; return; }
  const next = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const path = canonicalDiscPath(entry.path);
    if (path) next.set(path, entry.bytes);
  }
  table = next.size > 0 ? next : null;
}

export function modOverridesActive(): boolean {
  return table !== null;
}

/**
 * The stored bytes, as a view. A full read of a map archive is about 16 MiB, and copying it on every member
 * slice copied that again. A range copies only the span it asked for (`readRange`, `stream`).
 */
function hit(path: string): Uint8Array | null {
  if (!table) return null;
  const key = canonicalDiscPath(path);
  return (key ? table.get(key) : undefined) ?? null;
}

/**
 * The page realm's copy of one overridden path, or null when the table is off or the path is not in it.
 * Read-only: the bytes are the view the table holds. The test-room zombies mode reads its pack through this
 * (`TEST_ROOM_ZOMBIES_ADAPTATION`); nothing else in the hook changes.
 */
export function modOverrideBytes(path: string): Uint8Array | null {
  return hit(path);
}

function readWith(source: AssetSource): AssetSource['read'] {
  return async (path, onProgress?: ReadProgress) => {
    const bytes = hit(path);
    if (!bytes) {
      const disc = await source.read(path, onProgress);
      // Only when a member table is installed. The no-mods path never wraps, so this does not run.
      noteMemberArchive(path, disc);
      return disc;
    }
    onProgress?.(bytes.byteLength, bytes.byteLength);
    noteMemberArchive(path, bytes);
    return bytes;
  };
}

function listWith(source: AssetSource): AssetSource['list'] {
  return async () => {
    const disc = await source.list();
    if (!table) return disc;
    const have = new Set(disc);
    const extra: string[] = [];
    for (const path of table.keys()) if (!have.has(path)) extra.push(path);
    extra.sort();
    return extra.length === 0 ? disc : [...disc, ...extra];
  };
}

function ranged(source: AssetSource): RangedAssetSource | null {
  const candidate = source as unknown as Partial<RangedAssetSource>;
  return typeof candidate.size === 'function' && typeof candidate.readRange === 'function' ? candidate as RangedAssetSource : null;
}

function extentApi(source: AssetSource): { extents?: () => Promise<DiscExtent[]>; extent?: (path: string) => Promise<OneExtent> } {
  return source as unknown as { extents?: () => Promise<DiscExtent[]>; extent?: (path: string) => Promise<OneExtent> };
}

function blobSource(source: AssetSource): BlobAssetSource | null {
  const candidate = source as unknown as Partial<BlobAssetSource>;
  return typeof candidate.fileBlob === 'function' ? candidate as BlobAssetSource : null;
}

/** A copy whose buffer is a plain ArrayBuffer, which `Blob` accepts. */
function blobOf(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer]);
}

function createProxy<T extends AssetSource>(source: T): T {
  const range = ranged(source);
  const blobs = blobSource(source);
  const extents = extentApi(source);
  return new Proxy(source, {
    get(target, prop, receiver) {
      if (prop === 'read') return readWith(target);
      if (prop === 'list') return listWith(target);
      if (prop === 'extents' && typeof extents.extents === 'function') {
        const listExtents = extents.extents.bind(target);
        return async () => {
          const disc = await listExtents();
          if (!table) return disc;
          const have = new Set(disc.map((entry) => entry.path));
          let changed = false;
          const sized = disc.map((entry) => {
            const bytes = table?.get(entry.path);
            if (!bytes || bytes.byteLength === entry.size) return entry;
            changed = true;
            return { ...entry, size: bytes.byteLength };
          });
          const extra: DiscExtent[] = [];
          for (const [path, bytes] of table) {
            if (!have.has(path)) extra.push({ path, lbn: MOD_ADDED_FILE_LBN, size: bytes.byteLength });
          }
          extra.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
          if (!changed && extra.length === 0) return disc;
          return extra.length === 0 ? sized : [...sized, ...extra];
        };
      }
      if (prop === 'extent' && typeof extents.extent === 'function') {
        const one = extents.extent.bind(target);
        return async (path: string) => {
          const bytes = hit(path);
          if (!bytes) return one(path);
          // A replacement stays on the disc's sector. An added path is not on the disc, so the listing
          // carries the sentinel sector and the mod's length.
          try {
            const disc = await one(path);
            return bytes.byteLength === disc.size ? disc : { lbn: disc.lbn, size: bytes.byteLength };
          } catch {
            return { lbn: MOD_ADDED_FILE_LBN, size: bytes.byteLength };
          }
        };
      }
      if (prop === 'size' && range) {
        return async (path: string) => hit(path)?.byteLength ?? range.size(path);
      }
      if (prop === 'readRange' && range) {
        return async (path: string, offset: number, length: number) => {
          const bytes = hit(path);
          if (!bytes) return range.readRange(path, offset, length);
          if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
            throw new Error(`${path}: ${length} bytes at ${offset} run past the mod's ${bytes.byteLength} bytes`);
          }
          return bytes.slice(offset, offset + length);
        };
      }
      if (prop === 'stream' && typeof target.stream === 'function') {
        return async function* (path: string, options: StreamOptions = {}) {
          options.signal?.throwIfAborted();
          const bytes = hit(path);
          if (!bytes) { yield* target.stream!(path, options); return; }
          const { start, end } = streamExtent(bytes.byteLength, path, options);
          if (end > start) yield bytes.slice(start, end);
        };
      }
      if (prop === 'fileBlob' && blobs) {
        return async (path: string) => {
          const bytes = hit(path);
          return bytes ? blobOf(bytes) : blobs.fileBlob(path);
        };
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/**
 * The hook. No table: `source` itself, so `read` is the disc reader's method. A table: a wrapper that answers
 * overridden paths and delegates every other read to `source`.
 */
export function applyOverrideSource<T extends AssetSource>(source: T): T {
  if (!table && !memberOverridesActive()) return source;
  let proxy = proxies.get(source) as T | undefined;
  if (!proxy) {
    proxy = createProxy(source);
    proxies.set(source, proxy);
  }
  return proxy;
}
