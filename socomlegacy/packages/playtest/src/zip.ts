/**
 * A store-only ZIP writer for the Download session (web sprint 34 PT-17; spec 4.5; research 246 §1).
 * PLAYTEST_INSTRUMENT_ADAPTATION: a playtest instrument with no original -- nothing here reads or changes a game value.
 *
 * No new npm dependency (W34.R3): the format is written by hand, APPNOTE's plain form only. Each entry is a local file
 * header, then its bytes stored as they are (method 0: the media is compressed already and the segments are gzipped);
 * then the central directory, one record per entry; then the end of central directory. Names are UTF-8 with general
 * purpose flag bit 11 set. The time is the DOS time of `mtime` in UTC, or the DOS epoch (1980-01-01 00:00) when absent
 * or earlier. There is no ZIP64: a file of 4 GB or more, an archive whose offsets pass 4 GB, or more than 65535
 * entries is refused with an error that says so. A name that would leave the archive when extracted (absolute, a
 * drive, a backslash, a `..` segment, empty) or a name given twice is refused too.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const VERSION = 20;                 // 2.0: the version a reader needs (and the writer's, made on MS-DOS: high byte 0)
const UTF8_FLAG = 0x0800;           // general purpose bit 11: the name is UTF-8
const STORED = 0;
const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3, the ZIP's) by a 256-entry table. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The DOS date and time of `d` in UTC; the DOS epoch (1980-01-01 00:00:00) for none or anything earlier. */
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

export function writeZip(entries: { name: string; data: Uint8Array | string; mtime?: Date }[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error(`a ZIP without ZIP64 holds at most ${MAX_ENTRIES} entries: ${entries.length} given`);
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const items = entries.map((e) => {
    checkName(e.name);
    if (seen.has(e.name)) throw new Error(`a ZIP entry name given twice: "${e.name}"`);
    seen.add(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    if (data.byteLength >= MAX_U32) throw new Error(`"${e.name}" is 4 GB or more: a ZIP without ZIP64 cannot hold it`);
    const name = enc.encode(e.name);
    if (name.length > 0xffff) throw new Error(`a ZIP entry name is longer than 65535 bytes: "${e.name.slice(0, 40)}..."`);
    return { name, data, crc: crc32(data), ...dosTime(e.mtime), offset: 0 };
  });

  let localSize = 0;
  for (const it of items) {
    it.offset = localSize;
    localSize += 30 + it.name.length + it.data.byteLength;
    if (localSize > MAX_U32) throw new Error('the archive passes 4 GB: a ZIP without ZIP64 cannot hold it');
  }
  const centralSize = items.reduce((n, it) => n + 46 + it.name.length, 0);
  if (localSize + centralSize > MAX_U32) throw new Error('the archive passes 4 GB: a ZIP without ZIP64 cannot hold it');

  const out = new Uint8Array(localSize + centralSize + 22);
  const v = new DataView(out.buffer);
  let p = 0;
  for (const it of items) {
    v.setUint32(p, LOCAL, true);
    v.setUint16(p + 4, VERSION, true);
    v.setUint16(p + 6, UTF8_FLAG, true);
    v.setUint16(p + 8, STORED, true);
    v.setUint16(p + 10, it.time, true);
    v.setUint16(p + 12, it.date, true);
    v.setUint32(p + 14, it.crc, true);
    v.setUint32(p + 18, it.data.byteLength, true);
    v.setUint32(p + 22, it.data.byteLength, true);
    v.setUint16(p + 26, it.name.length, true);
    v.setUint16(p + 28, 0, true);                 // no extra field
    out.set(it.name, p + 30);
    out.set(it.data, p + 30 + it.name.length);
    p += 30 + it.name.length + it.data.byteLength;
  }
  const centralAt = p;
  for (const it of items) {
    v.setUint32(p, CENTRAL, true);
    v.setUint16(p + 4, VERSION, true);           // made by: MS-DOS (0), 2.0
    v.setUint16(p + 6, VERSION, true);           // needed to extract
    v.setUint16(p + 8, UTF8_FLAG, true);
    v.setUint16(p + 10, STORED, true);
    v.setUint16(p + 12, it.time, true);
    v.setUint16(p + 14, it.date, true);
    v.setUint32(p + 16, it.crc, true);
    v.setUint32(p + 20, it.data.byteLength, true);
    v.setUint32(p + 24, it.data.byteLength, true);
    v.setUint16(p + 28, it.name.length, true);
    // extra 0, comment 0, disk 0, internal attributes 0, external attributes 0 (the buffer is zeroed)
    v.setUint32(p + 42, it.offset, true);
    out.set(it.name, p + 46);
    p += 46 + it.name.length;
  }
  v.setUint32(p, END, true);
  v.setUint16(p + 8, items.length, true);         // entries on this disk (disk numbers 0)
  v.setUint16(p + 10, items.length, true);        // entries in all
  v.setUint32(p + 12, centralSize, true);
  v.setUint32(p + 16, centralAt, true);
  return out;                                     // no archive comment
}
