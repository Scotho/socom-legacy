import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Sha256, hashBlob } from '../src/discExtractHash';
import { extractFile, hashingBlob, hasSyncAccess } from '../src/discExtractProtocol';
import { FakeFileHandle, FakeOpfs } from './discExtractFakes';

/**
 * DX-1's hash (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): an incremental SHA-256, taken
 * as a file streams through the writer, equal to the whole file's SHA-256 (node's `crypto` and `crypto.subtle` both
 * stand witness) however the bytes are cut. A browser adaptation (FI.R2): nothing of the game; the bytes are made here.
 */

const bytesOf = (n: number, seed = 1): Uint8Array => {
  const out = new Uint8Array(n);
  let x = seed * 2654435761 >>> 0;
  for (let i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) >>> 0; out[i] = x >>> 24; }
  return out;
};
const node = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const subtle = async (b: Uint8Array): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)).toString('hex');

describe('Sha256: FIPS 180-4, incremental', () => {
  it('the standard\'s own examples: "", "abc", and the 448-bit message', () => {
    expect(new Sha256().hex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(new Sha256().update(new TextEncoder().encode('abc')).hex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(new Sha256().update(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).hex())
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('equals the whole-file digest at every length around the block and padding edges, cut anywhere', async () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 100_003]) {
      const b = bytesOf(n, n + 1);
      const want = node(b);
      expect(new Sha256().update(b).hex(), `whole ${n}`).toBe(want);
      for (const cut of [1, 3, 63, 64, 65, 1000]) {
        const h = new Sha256();
        for (let at = 0; at < n; at += cut) h.update(b.subarray(at, Math.min(n, at + cut)));
        expect(h.hex(), `${n} cut ${cut}`).toBe(want);
      }
      expect(await subtle(b), `subtle ${n}`).toBe(want);
    }
  });

  it('hex() ends it: asked again, the same; an update after it is refused', () => {
    const h = new Sha256().update(bytesOf(10));
    const once = h.hex();
    expect(h.hex()).toBe(once);
    expect(() => h.update(new Uint8Array(1))).toThrow(/after the digest/);
  });

  it('hashBlob reads a Blob a chunk at a time and reports; a cancel is an AbortError', async () => {
    const b = bytesOf(10_000, 7);
    const seen: number[] = [];
    expect(await hashBlob(new Blob([b as Uint8Array<ArrayBuffer>]), 4096, () => false, (n) => seen.push(n))).toBe(node(b));
    expect(seen).toEqual([4096, 8192, 10_000]);
    await expect(hashBlob(new Blob([b as Uint8Array<ArrayBuffer>]), 4096, () => true)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('the worker\'s write: DA-8\'s chunk loop with the hash fed as it reads', () => {
  it('extractFile writes the file through its sync handle and answers the bytes and their SHA-256', async () => {
    const fs = new FakeOpfs();
    const target = new FakeFileHandle('A', fs);
    target.data = new Uint8Array(50_000).fill(9);               // a partial from before: rewritten from its start
    const b = bytesOf(10_000, 3);
    const progress: number[] = [];
    const out = await extractFile(new Blob([b as Uint8Array<ArrayBuffer>]), target, { chunk: 3000, onProgress: (d) => progress.push(d), cancelled: () => false });
    expect(out).toEqual({ bytes: 10_000, sha256: node(b) });
    expect(target.data).toEqual(b);
    expect(progress).toEqual([3000, 6000, 9000, 10_000]);
    expect(target.open).toBe(0);
  });

  it('a cancel between chunks: an AbortError, the handle closed', async () => {
    const fs = new FakeOpfs();
    const target = new FakeFileHandle('A', fs);
    let n = 0;
    await expect(extractFile(new Blob([bytesOf(10_000) as Uint8Array<ArrayBuffer>]), target, {
      chunk: 1000, onProgress: () => { n++; }, cancelled: () => n >= 2,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(target.data.length).toBe(2000);
    expect(target.open).toBe(0);
  });

  it('hashingBlob refuses a read out of order (the hash would be of another stream)', async () => {
    const blob = hashingBlob(new Blob([bytesOf(100) as Uint8Array<ArrayBuffer>]), new Sha256());
    await expect(blob.slice(10, 20).arrayBuffer()).rejects.toThrow(/next unhashed byte is 0/);
  });

  it('hasSyncAccess: only a scope whose FileSystemFileHandle can open a sync access handle', () => {
    expect(hasSyncAccess({})).toBe(false);
    expect(hasSyncAccess({ FileSystemFileHandle: { prototype: {} } })).toBe(false);
    expect(hasSyncAccess({ FileSystemFileHandle: { prototype: { createSyncAccessHandle: () => undefined } } })).toBe(true);
  });
});
