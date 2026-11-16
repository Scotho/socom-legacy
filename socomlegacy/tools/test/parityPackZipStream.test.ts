import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, writeZip } from '../../packages/playtest/src/zip';
import { writeZipFile } from '../parity-pack/zipStream';

/**
 * PK-4 (design 10.5): the parity pack's streaming store-only ZIP writer -- the same bytes as the playtest's in-memory
 * `writeZip` (packages/playtest/src/zip.ts), written entry by entry from files, so a Save with gigabytes of clips never
 * holds them in memory. Product track (OT.R53): an adaptation. Temp dirs only.
 */
const dir = mkdtempSync(join(tmpdir(), 'pk4-zip-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, data: Uint8Array | string): string => {
  const p = join(dir, name);
  writeFileSync(p, data);
  return p;
};

/** A small reader of what the writer writes: the end record, the central directory, each local header and its bytes. */
function readZip(buf: Uint8Array): { name: string; size: number; crc: number; data: Uint8Array; flag: number }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.byteLength - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const at = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(at, true)).toBe(0x04034b50);
    expect(v.getUint32(at + 14, true)).toBe(crc);
    expect(v.getUint32(at + 22, true)).toBe(size);
    expect(v.getUint16(at + 8, true)).toBe(0);                              // stored
    const localName = v.getUint16(at + 26, true);
    const data = buf.subarray(at + 30 + localName, at + 30 + localName + size);
    out.push({ name, size, crc, data, flag: v.getUint16(at + 6, true) });
    p += 46 + nameLen;
  }
  return out;
}

describe('writeZipFile: the playtest\'s store-only format, streamed (design 10.5)', () => {
  it('two small files: the bytes equal writeZip\'s', async () => {
    const a = new TextEncoder().encode('hello, parity');
    const b = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);   // over one 64 KB buffer
    const t = new Date('2026-11-03T12:34:56Z');
    const out = join(dir, 'two.zip');
    const r = await writeZipFile(out, [
      { name: 'p/a.txt', path: file('a.txt', a), mtime: t },
      { name: 'p/sub/b.bin', path: file('b.bin', b) },
    ], { now: t });
    const want = writeZip([{ name: 'p/a.txt', data: a, mtime: t }, { name: 'p/sub/b.bin', data: b, mtime: t }]);
    const got = new Uint8Array(readFileSync(out));
    expect(Buffer.from(got).equals(Buffer.from(want))).toBe(true);
    expect(r).toEqual({ bytes: want.byteLength, entries: 2 });
  });
  it('no mtime and no now: the DOS epoch, as writeZip', async () => {
    const out = join(dir, 'epoch.zip');
    await writeZipFile(out, [{ name: 'x', path: file('x', 'x') }]);
    expect(Buffer.from(readFileSync(out)).equals(Buffer.from(writeZip([{ name: 'x', data: 'x' }])))).toBe(true);
  });
  it('a 3-entry archive read back: names, sizes, CRCs, the UTF-8 flag', async () => {
    const files = [['één.txt', 'utf-8 name'], ['d/empty', ''], ['d/e/big', 'z'.repeat(200_001)]] as const;
    const out = join(dir, 'three.zip');
    const r = await writeZipFile(out, files.map(([n, d], i) => ({ name: n, path: file(`f${i}`, d) })));
    expect(r.entries).toBe(3);
    const back = readZip(new Uint8Array(readFileSync(out)));
    expect(back.map((e) => e.name)).toEqual(files.map(([n]) => n));
    for (const [i, [, d]] of files.entries()) {
      const bytes = new TextEncoder().encode(d);
      expect(back[i]!.size).toBe(bytes.byteLength);
      expect(back[i]!.crc).toBe(crc32(bytes));
      expect(Buffer.from(back[i]!.data).equals(Buffer.from(bytes))).toBe(true);
      expect(back[i]!.flag).toBe(0x0800);
    }
  });
});

describe('writeZipFile refuses before it writes anything (no ZIP64: LATER 666)', () => {
  const size = (n: number) => async () => ({ size: n });
  it('an entry of 4 GB or more', async () => {
    const out = join(dir, 'big.zip');
    await expect(writeZipFile(out, [{ name: 'clip.mp4', path: 'X:/nowhere/clip.mp4' }], { statSize: size(0xffffffff) }))
      .rejects.toThrow(/"clip\.mp4" is 4 GB or more.*ZIP64/);
    expect(existsSync(out)).toBe(false);
  });
  it('a total that would pass 4 GB', async () => {
    const out = join(dir, 'total.zip');
    await expect(writeZipFile(out, [{ name: 'a', path: 'X:/a' }, { name: 'b', path: 'X:/b' }], { statSize: size(3 * 2 ** 30) }))
      .rejects.toThrow(/passes 4 GB.*ZIP64/);
    expect(existsSync(out)).toBe(false);
  });
  it('more than 65535 entries, the limit named', async () => {
    const out = join(dir, 'many.zip');
    const many = Array.from({ length: 65536 }, (_, i) => ({ name: `f${i}`, path: 'X:/none' }));
    await expect(writeZipFile(out, many, { statSize: size(0) })).rejects.toThrow(/at most 65535 entries: 65536 given/);
    expect(existsSync(out)).toBe(false);
  });
  it('a name that leaves the archive, or one given twice', async () => {
    await expect(writeZipFile(join(dir, 'n1.zip'), [{ name: '../x', path: 'X:/x' }], { statSize: size(1) })).rejects.toThrow(/stay inside/);
    await expect(writeZipFile(join(dir, 'n2.zip'), [{ name: 'a', path: 'X:/a' }, { name: 'a', path: 'X:/b' }], { statSize: size(1) }))
      .rejects.toThrow(/given twice/);
    expect(existsSync(join(dir, 'n1.zip'))).toBe(false);
  });
  it('a file that changes size while it is written: refused, the partial archive removed', async () => {
    const p = file('grow', 'abc');
    const out = join(dir, 'grow.zip');
    await expect(writeZipFile(out, [{ name: 'grow', path: p }], { statSize: size(10) })).rejects.toThrow(/changed size/);
    expect(existsSync(out)).toBe(false);
  });
});
