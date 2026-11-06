import { open, stat, unlink } from 'node:fs/promises';

/**
 * The parity pack's streaming store-only ZIP writer (PK-4; docs/specs/2026-11-03-parity-pack-design.md 10.5). Product
 * track (OT.R53): a validation instrument's packaging, an adaptation; nothing here reads or changes a game value.
 *
 * The SAME format as the playtest's in-memory writer (`packages/playtest/src/zip.ts`, `writeZip`), byte for byte for
 * the same inputs (`tools/test/parityPackZipStream.test.ts` holds it): each entry a local file header, its bytes stored
 * (method 0), then the central directory and the end record; names UTF-8 with general purpose flag bit 11; the DOS time
 * in UTC, or the DOS epoch when absent; no data descriptor. What differs is only how: each file is streamed from its
 * path through one 64 KB buffer, its CRC-32 computed as the bytes pass, and the local header's CRC written in place
 * once the entry is done -- so a pack or a Save with gigabytes of clips is never held in memory. The in-memory writer
 * stays for the playtest export.
 *
 * Refused before anything is written: a name that would leave the archive or one given twice (zip.ts's rules), an
 * entry of 4 GB or more, an archive that would pass 4 GB, more than 65535 entries -- there is no ZIP64 (LATER 666). A
 * file whose size changes while it is written is refused and the partial archive removed.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const STORED = 0;
const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;
/** The one buffer of file data the writer holds. */
export const ZIP_STREAM_BUFFER = 64 * 1024;

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 carried across chunks: start at 0xffffffff, finish with `^ 0xffffffff`. */
function crcUpdate(c: number, data: Uint8Array, n: number): number {
  for (let i = 0; i < n; i += 1) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return c;
}

function dosTime(d: Date | undefined): { time: number; date: number } {
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  const year = Math.min(d.getUTCFullYear(), 2107) - 1980;
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: (year << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function checkName(name: string): void {
  const bad = name === '' || name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name)
    || name.split('/').some((s) => s === '..');
  if (bad) throw new Error(`a ZIP entry name must stay inside the archive: "${name}"`);
}

export interface ZipFileEntry {
  /** The name in the archive: forward slashes, relative. */
  readonly name: string;
  /** The file on disk whose bytes are stored. */
  readonly path: string;
  readonly mtime?: Date;
}

export interface ZipFileOptions {
  /** The time of an entry without its own `mtime`; without either, the DOS epoch (as `writeZip`). */
  readonly now?: Date;
  /** A test's seam: the size of `path` (default: `fs.stat`). */
  readonly statSize?: (path: string) => Promise<{ size: number }>;
}

/** Writes `entries` as one store-only ZIP at `outPath`; the archive's bytes and its entry count. */
export async function writeZipFile(
  outPath: string, entries: readonly ZipFileEntry[], opts: ZipFileOptions = {},
): Promise<{ bytes: number; entries: number }> {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`a ZIP without ZIP64 holds at most ${MAX_ENTRIES} entries: ${entries.length} given (LATER 666)`);
  }
  const statSize = opts.statSize ?? ((p: string) => stat(p));
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const items: { name: Uint8Array; label: string; path: string; size: number; time: number; date: number; crc: number; offset: number }[] = [];
  for (const e of entries) {
    checkName(e.name);
    if (seen.has(e.name)) throw new Error(`a ZIP entry name given twice: "${e.name}"`);
    seen.add(e.name);
    const name = enc.encode(e.name);
    if (name.length > 0xffff) throw new Error(`a ZIP entry name is longer than 65535 bytes: "${e.name.slice(0, 40)}..."`);
    const { size } = await statSize(e.path);
    if (size >= MAX_U32) throw new Error(`"${e.name}" is 4 GB or more: a ZIP without ZIP64 cannot hold it (LATER 666)`);
    items.push({ name, label: e.name, path: e.path, size, ...dosTime(e.mtime ?? opts.now), crc: 0, offset: 0 });
  }
  let localSize = 0;
  for (const it of items) {
    it.offset = localSize;
    localSize += 30 + it.name.length + it.size;
    if (localSize > MAX_U32) throw new Error('the archive passes 4 GB: a ZIP without ZIP64 cannot hold it (LATER 666)');
  }
  const centralSize = items.reduce((n, it) => n + 46 + it.name.length, 0);
  if (localSize + centralSize + 22 > MAX_U32) throw new Error('the archive passes 4 GB: a ZIP without ZIP64 cannot hold it (LATER 666)');

  const out = await open(outPath, 'w');
  let ok = false;
  try {
    const buf = Buffer.allocUnsafe(ZIP_STREAM_BUFFER);
    let p = 0;
    for (const it of items) {
      const head = Buffer.alloc(30 + it.name.length);
      head.writeUInt32LE(LOCAL, 0);
      head.writeUInt16LE(VERSION, 4);
      head.writeUInt16LE(UTF8_FLAG, 6);
      head.writeUInt16LE(STORED, 8);
      head.writeUInt16LE(it.time, 10);
      head.writeUInt16LE(it.date, 12);
      head.writeUInt32LE(0, 14);                            // the CRC, written in place below
      head.writeUInt32LE(it.size, 18);
      head.writeUInt32LE(it.size, 22);
      head.writeUInt16LE(it.name.length, 26);
      head.writeUInt16LE(0, 28);
      head.set(it.name, 30);
      await out.write(head, 0, head.length, p);
      let at = p + head.length;
      let c = 0xffffffff;
      let done = 0;
      const src = await open(it.path, 'r');
      try {
        for (;;) {
          const { bytesRead } = await src.read(buf, 0, buf.length, null);
          if (bytesRead === 0) break;
          done += bytesRead;
          if (done > it.size) break;
          c = crcUpdate(c, buf, bytesRead);
          await out.write(buf, 0, bytesRead, at);
          at += bytesRead;
        }
      } finally {
        await src.close();
      }
      if (done !== it.size) throw new Error(`"${it.label}" changed size while it was written (${it.size} bytes planned, ${done} read): ${it.path}`);
      it.crc = (c ^ 0xffffffff) >>> 0;
      const crc = Buffer.alloc(4);
      crc.writeUInt32LE(it.crc, 0);
      await out.write(crc, 0, 4, p + 14);
      p = at;
    }
    const central = Buffer.alloc(centralSize + 22);
    let q = 0;
    for (const it of items) {
      central.writeUInt32LE(CENTRAL, q);
      central.writeUInt16LE(VERSION, q + 4);
      central.writeUInt16LE(VERSION, q + 6);
      central.writeUInt16LE(UTF8_FLAG, q + 8);
      central.writeUInt16LE(STORED, q + 10);
      central.writeUInt16LE(it.time, q + 12);
      central.writeUInt16LE(it.date, q + 14);
      central.writeUInt32LE(it.crc, q + 16);
      central.writeUInt32LE(it.size, q + 20);
      central.writeUInt32LE(it.size, q + 24);
      central.writeUInt16LE(it.name.length, q + 28);
      // extra 0, comment 0, disk 0, internal and external attributes 0 (Buffer.alloc zeroes)
      central.writeUInt32LE(it.offset, q + 42);
      central.set(it.name, q + 46);
      q += 46 + it.name.length;
    }
    central.writeUInt32LE(END, q);
    central.writeUInt16LE(items.length, q + 8);
    central.writeUInt16LE(items.length, q + 10);
    central.writeUInt32LE(centralSize, q + 12);
    central.writeUInt32LE(p, q + 16);
    await out.write(central, 0, central.length, p);
    ok = true;
    return { bytes: p + central.length, entries: items.length };
  } finally {
    await out.close();
    if (!ok) await unlink(outPath).catch(() => undefined);
  }
}
