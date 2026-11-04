import { Reader } from './bytes';
import { addedZarPaths, memberOriginOf, memberOverridesActive, zarOverrideBytes } from './memberOverride';

/** One key of a ZAR/ZED archive: its name, where its bytes sit in the data blob, and its children. */
export interface ZarKey { name: string; offset: number; size: number; children: ZarKey[] }

const HEAD = 100, V2 = 0x20002; // 36 §1

/** The fixed head of a ZAR/ZED archive, bytes (36 §1): enough for `zarIndexLength`. */
export const ZAR_HEAD = HEAD;

/**
 * How many bytes from the start of an archive hold its head, its string table and its key tree -- all `Zar.parse`
 * needs to list the keys and say where each one's bytes are (`Zar.dataOffset + key.offset`). `head` is at least the
 * first `ZAR_HEAD` bytes. It is what lets a ranged source read one member of a large archive (socomlegacy/docs/research/81
 * §1: `SOUNDS/BNKSTORE.ZAR` is 67 MB and a map wants two of its 115 banks) without the rest.
 */
export function zarIndexLength(head: Uint8Array): number {
  const r = new Reader(head);
  return HEAD + r.u32(8) + 16 * r.u32(4);
}

/** A v2 ZAR/ZED archive: a pre-order key tree over one data blob. */
export class Zar {
  private constructor(readonly root: ZarKey, readonly keyCount: number, readonly version: number,
                      private readonly blob: Uint8Array,
                      /** Where the data blob starts in the archive's file: a key's bytes are at `dataOffset + key.offset`. */
                      readonly dataOffset: number,
                      /**
                       * Set only when a member override is installed and these bytes were read as that archive
                       * (or as `ARCHIVE>>MEMBER` out of a ZDB). Null on the no-mods path, and `data` then returns
                       * the blob's own subarray.
                       */
                      private readonly memberOrigin: string | null) {}

  static parse(bytes: Uint8Array): Zar {
    const r = new Reader(bytes);
    // 36 §1: 100-byte head, string table, key_count 16-byte keys in pre-order, align to padding, data blob.
    const flags = r.u32(0), keyCount = r.u32(4), stableSize = r.u32(8), stableOfs = r.u32(12), padding = r.u32(16);
    const dataSize = r.u32(84), version = r.u32(96);
    if (version !== V2) throw new Error(`ZAR version 0x${version.toString(16)}, only 0x20002 supported`);
    if (flags !== 0) throw new Error(`ZAR flags ${flags}: securified archives are not supported`);
    if (padding <= 0) throw new Error(`ZAR padding ${padding}: the data blob's alignment must be positive`);
    const stableAt = HEAD, keysAt = stableAt + stableSize;
    const dataAt = Math.ceil((keysAt + 16 * keyCount) / padding) * padding;
    // The sound archives (`SOUNDS/BNKSTORE.ZAR`, `SOUNDS/VAGSTORE.ZAR`; socomlegacy/docs/research/81 §1) write 0 here: the
    // engine never reads the field (zar_main.cpp keeps no data size), so a zero means "the rest of the file".
    // Bytes that stop at the key tree (`zarIndexLength`, a ranged read) parse to the keys over an empty blob.
    const rest = Math.max(0, bytes.byteLength - dataAt);
    const blob = rest === 0 ? new Uint8Array(0) : r.slice(dataAt, dataSize > 0 ? Math.min(dataSize, rest) : rest);
    let i = 0;
    const readKey = (isRoot: boolean): ZarKey => {
      if (i >= keyCount) throw new Error(`ZAR key tree overran key_count ${keyCount}`);
      const index = i, o = keysAt + 16 * i++;
      // The root record carries only its child count: the engine leaves its name, offset and size unread
      // (zar_main.cpp:57-62), and retail writes a null name pointer there. Every other name is a pointer
      // into the string table, relative to the address the table was packed at (36 §1).
      let key: ZarKey;
      if (isRoot) key = { name: '', offset: 0, size: 0, children: [] };
      else {
        const nameOfs = r.i32(o) - stableOfs;
        if (nameOfs < 0 || nameOfs >= stableSize) throw new Error(`ZAR key ${index}: name offset ${nameOfs} outside the ${stableSize}-byte string table`);
        key = { name: r.cstr(stableAt + nameOfs, stableSize - nameOfs), offset: r.u32(o + 4), size: r.u32(o + 8), children: [] };
      }
      const n = r.i32(o + 12);                  // immediate children, each a full pre-order record (36 §1)
      for (let c = 0; c < n; c++) key.children.push(readKey(false));
      return key;
    };
    const root = readKey(true);
    if (i !== keyCount) throw new Error(`ZAR key tree consumed ${i} of key_count ${keyCount}`);
    const origin = memberOverridesActive() ? memberOriginOf(bytes) ?? null : null;
    const zar = new Zar(root, keyCount, version, blob, dataAt, origin);
    if (origin) zar.graftAdded();
    return zar;
  }

  /**
   * Keys a mod adds, on the in-memory tree only. `keyCount` stays the file's own count: the header is not rebuilt.
   * A grafted key sits past the blob, so with the override gone `data` throws instead of returning some other key.
   */
  private graftAdded(): void {
    const origin = this.memberOrigin;
    if (!origin) return;
    for (const path of addedZarPaths(origin)) {
      if (this.find(path)) continue;
      const parts = path.split('/');
      let node = this.root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]!;
        let child = node.children.find((k) => k.name === name);
        if (!child) {
          child = { name, offset: this.blob.byteLength, size: i === parts.length - 1 ? 1 : 0, children: [] };
          node.children.push(child);
        }
        node = child;
      }
    }
  }

  /** The key's bytes: a view into the data blob (36 §1: key.offset is blob-relative). */
  data(key: ZarKey): Uint8Array {
    if (this.memberOrigin && memberOverridesActive()) {
      const path = keyPath(this.root, key);
      const hit = path ? zarOverrideBytes(this.memberOrigin, path) : null;
      if (hit) return hit;
    }
    if (key.offset + key.size > this.blob.byteLength) throw new RangeError(`key ${key.name} outside data blob`);
    return this.blob.subarray(key.offset, key.offset + key.size);
  }

  child(key: ZarKey, name: string): ZarKey | undefined { return key.children.find((k) => k.name === name); }

  /** "models/alaska4d_x/nparams", names matched exactly, walked from the root's children. */
  find(path: string): ZarKey | undefined {
    let k: ZarKey | undefined = this.root;
    for (const part of path.split('/')) { if (!k) return undefined; k = this.child(k, part); }
    return k;
  }

  /** Pre-order, the root at depth 0. */
  walk(visit: (key: ZarKey, depth: number) => void): void {
    const rec = (k: ZarKey, d: number) => { visit(k, d); for (const c of k.children) rec(c, d + 1); };
    rec(this.root, 0);
  }
}

/** The find-path of `key`, or null for the root. Reference equality, so a grafted key resolves too. */
function keyPath(root: ZarKey, key: ZarKey): string | null {
  if (key === root) return null;
  const walk = (node: ZarKey, prefix: string): string | null => {
    for (const child of node.children) {
      const path = prefix.length === 0 ? child.name : `${prefix}/${child.name}`;
      if (child === key) return path;
      const deeper = walk(child, path);
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(root, '');
}
