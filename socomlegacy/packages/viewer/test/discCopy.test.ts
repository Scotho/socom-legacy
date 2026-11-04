import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { IsoAssetSource, SOCOM2_US_BOOT, type AssetSource } from '@s2u/archive';
import { buildIso } from '../../archive/test/isoImage';
import {
  DISC_COPY_CHECK_PATH, DISC_COPY_IMAGE, DISC_COPY_MARGIN, DISC_COPY_ROOT, DiscCopyError, copyDirName, copyDisc,
  deleteStoredCopy, storedCopy, storedCopyRequest, storedCopySource, type CopyEnv, type CopyStorage, type CopyWorker,
} from '../src/discCopy';
import { DISC_COPY_CHUNK, copyFiles, serveDiscCopy, type CopyPort, type CopySyncAccess } from '../src/discCopyProtocol';
import { hasStoredCopy, readStartState, startOrder } from '../src/discMemory';
import type { DiscRequest } from '../src/discSource';
import { DISC_COPY_SLOT, openPageRecords, type RecordStore } from '../src/pageStore';

/**
 * DA-8, the module (plan `docs/plans/2026-10-11-disc-access.md`, DA.R6; research 306 §3, §10): the whole disc -- an
 * image, or every file of a picked folder -- copied into the page's origin private file system (OPFS) by a worker's
 * sync access handles, checked against the quota first, cancellable, verified, recorded in the page's records, read
 * back as a source, deleted. A browser adaptation (DA.R2, DA.R3): nothing of the game. The OPFS, `navigator.storage`
 * and the worker are fakes run in-process (the worker's own `serveDiscCopy` behind a fake port); the IndexedDB is
 * fake-indexeddb's; the disc's bytes are the committed fixtures (`test-fixtures/MANIFEST.json`), never the disc.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const HAVE_FIXTURES = existsSync(resolve(FIXTURES, DISC_COPY_CHECK_PATH));
if (!HAVE_FIXTURES) console.warn(`discCopy.test: the fixture cases are SKIPPED -- test-fixtures/${DISC_COPY_CHECK_PATH} is missing`);
const withFixtures = HAVE_FIXTURES ? it : it.skip;

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
/** A `SYSTEM.CNF` booting `boot`, in the retail line's form (`docs/roadmap/02-boot.md` B1). */
const systemCnf = (boot = SOCOM2_US_BOOT, ver = '1.02'): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = ${ver}\r\nVMODE = NTSC\r\n`);
type Member = { path: string; bytes: Uint8Array<ArrayBuffer> };
/** The disc's root file and the front end's first dialog archive (the fixture), nested two deep. */
const members = (): Member[] => [
  { path: 'SYSTEM.CNF', bytes: systemCnf() },
  { path: DISC_COPY_CHECK_PATH, bytes: new Uint8Array(readFileSync(resolve(FIXTURES, DISC_COPY_CHECK_PATH))) },
];
const isoRequest = (m: Member[] = members()): DiscRequest =>
  ({ kind: 'iso', file: new File([buildIso(m, 'SCUS_97275')], 'SOCOM II.iso', { lastModified: 5 }) });
/** A picked folder: the folder's own name first, as `webkitRelativePath` carries it (DA-3's `dirRequest`). */
const dirRequest = (m: Member[] = members(), top = 'SOCOM2'): DiscRequest =>
  ({ kind: 'dir', entries: m.map((x) => ({ path: `${top}/${x.path}`, file: new File([x.bytes], basename(x.path), { lastModified: 5 }) })) });

// ---- a fake origin private file system -------------------------------------------------------------------------

const domError = (name: string, message = name): DOMException => new DOMException(message, name);

class FakeFileHandle {
  readonly kind = 'file' as const;
  data = new Uint8Array(0);
  open = 0;
  readonly flushes: number[] = [];
  constructor(readonly name: string, readonly fs: FakeOpfs) {}
  async getFile(): Promise<File> { return new File([this.data.slice()], this.name); }
  async createSyncAccessHandle(): Promise<CopySyncAccess> {
    if (this.open) throw domError('NoModificationAllowedError', 'an access handle is open');
    this.open++;
    let closed = false;
    const live = (): void => { if (closed) throw domError('InvalidStateError', 'closed'); };
    return {
      write: (buffer, options) => {
        live();
        const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
        const at = options?.at ?? 0;
        const n = Math.min(src.length, this.fs.writeLimit);
        const end = at + n;
        if (end > this.data.length) { const grown = new Uint8Array(end); grown.set(this.data); this.data = grown; }
        this.data.set(src.subarray(0, n), at);
        const flip = this.fs.corrupt.get(this.name);
        if (flip !== undefined && flip >= at && flip < end) this.data[flip]! ^= 0xff;
        return n;
      },
      flush: () => { live(); this.flushes.push(this.data.length); },
      truncate: (size) => { live(); this.data = this.data.slice(0, size); },
      getSize: () => { live(); return this.data.length; },
      close: () => { if (!closed) { closed = true; this.open--; } },
    };
  }
}

class FakeDirHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDirHandle | FakeFileHandle>();
  constructor(readonly name: string, readonly fs: FakeOpfs) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirHandle> {
    const have = this.children.get(name);
    if (have?.kind === 'directory') return have;
    if (have) throw domError('TypeMismatchError');
    if (!options?.create) throw domError('NotFoundError', `no directory ${name}`);
    const made = new FakeDirHandle(name, this.fs);
    this.children.set(name, made);
    return made;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    const have = this.children.get(name);
    if (have?.kind === 'file') return have;
    if (have) throw domError('TypeMismatchError');
    if (!options?.create) throw domError('NotFoundError', `no file ${name}`);
    const made = new FakeFileHandle(name, this.fs);
    this.children.set(name, made);
    return made;
  }
  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const have = this.children.get(name);
    if (!have) throw domError('NotFoundError', `no entry ${name}`);
    if (have.kind === 'directory' && have.children.size && !options?.recursive) throw domError('InvalidModificationError');
    if (anyOpen(have)) throw domError('NoModificationAllowedError', `${name} has an open access handle`);
    this.children.delete(name);
  }
  async *values(): AsyncGenerator<FakeDirHandle | FakeFileHandle> { yield* [...this.children.values()]; }
}
const anyOpen = (h: FakeDirHandle | FakeFileHandle): boolean =>
  h.kind === 'file' ? h.open > 0 : [...h.children.values()].some(anyOpen);

class FakeOpfs {
  readonly root: FakeDirHandle;
  /** Bytes a `write` takes at most (a short write, as a sync handle may answer). */
  writeLimit = Number.POSITIVE_INFINITY;
  /** Files whose byte at this offset is flipped as it is written (a corrupt copy). */
  readonly corrupt = new Map<string, number>();
  constructor() { this.root = new FakeDirHandle('', this); }
  /** Every stored file, by path below the copy root, and its bytes. */
  files(): Map<string, Uint8Array> {
    const out = new Map<string, Uint8Array>();
    const walk = (d: FakeDirHandle, at: string): void => {
      for (const c of d.children.values()) {
        const p = at ? `${at}/${c.name}` : c.name;
        if (c.kind === 'file') out.set(p, c.data); else walk(c, p);
      }
    };
    walk(this.root, '');
    return out;
  }
}

class FakeStorage implements CopyStorage {
  quota = 100 * 1024 ** 3;
  usage = 1024;
  persistAnswer = true;
  persistCalls = 0;
  estimates = 0;
  constructor(readonly fs: FakeOpfs) {}
  async getDirectory(): Promise<FakeDirHandle> { return this.fs.root; }
  async estimate(): Promise<{ quota: number; usage: number }> { this.estimates++; return { quota: this.quota, usage: this.usage }; }
  async persist(): Promise<boolean> { this.persistCalls++; return this.persistAnswer; }
}

/** The worker, run in-process: the page's end and the worker's end of a fake channel, `serveDiscCopy` on the far one. */
function fakeWorker(made: { count: number; terminated: number }): CopyWorker {
  made.count++;
  const port: CopyPort = { onmessage: null, postMessage(m) { queueMicrotask(() => page.onmessage?.({ data: m } as MessageEvent)); } };
  const page: CopyWorker = {
    onmessage: null,
    onerror: null,
    postMessage(m) { queueMicrotask(() => port.onmessage?.({ data: m } as MessageEvent)); },
    terminate() { made.terminated++; },
  };
  serveDiscCopy(port);
  return page;
}

let fs: FakeOpfs;
let storage: FakeStorage;
let records: RecordStore;
let workers: { count: number; terminated: number };
let env: CopyEnv;
beforeEach(() => {
  fs = new FakeOpfs();
  storage = new FakeStorage(fs);
  const idb = new FakeFactory();
  records = openPageRecords(() => idb, () => undefined);
  workers = { count: 0, terminated: 0 };
  env = { storage, records, worker: () => fakeWorker(workers), chunk: 64 * 1024, now: () => 1_760_000_000_000 };
});

const IDENTITY = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
const copyDir = (): string => `${DISC_COPY_ROOT}/${copyDirName(IDENTITY)}`;
const sha = async (b: Uint8Array): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)).toString('hex');
/** Every file a source lists, read whole, for comparison. */
async function contents(source: AssetSource): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const p of await source.list()) out.set(p, await sha(await source.read(p)));
  return out;
}

// ---- the worker's chunk loop ------------------------------------------------------------------------------------

describe('discCopyProtocol: the chunk loop (pure, the worker\'s own)', () => {
  it('writes each file in chunks through its sync access handle, flushing each chunk, and reports progress per chunk', async () => {
    const a = new FakeFileHandle('A', fs);
    const b = new FakeFileHandle('B', fs);
    const bytesA = new Uint8Array(10).map((_, i) => i);
    const bytesB = new Uint8Array(5).map((_, i) => 100 + i);
    fs.writeLimit = 3;                                          // a short write is written on, not lost
    const progress: [number, number][] = [];
    const done = await copyFiles([{ blob: new Blob([bytesA]), target: a }, { blob: new Blob([bytesB]), target: b }], {
      chunk: 4, onProgress: (d, t) => progress.push([d, t]), cancelled: () => false,
    });
    expect(done).toBe(15);
    expect([...a.data]).toEqual([...bytesA]);
    expect([...b.data]).toEqual([...bytesB]);
    expect(progress).toEqual([[4, 15], [8, 15], [10, 15], [14, 15], [15, 15]]);
    expect(a.flushes).toEqual([4, 8, 10]);
    expect([a.open, b.open]).toEqual([0, 0]);                  // every handle closed
  });

  it('truncates a file already there (a re-run), and copies an empty file', async () => {
    const a = new FakeFileHandle('A', fs);
    a.data = new Uint8Array(50).fill(9);
    await copyFiles([{ blob: new Blob([new Uint8Array([1, 2])]), target: a }, { blob: new Blob([]), target: new FakeFileHandle('E', fs) }], {
      chunk: 8, onProgress: () => undefined, cancelled: () => false,
    });
    expect([...a.data]).toEqual([1, 2]);
  });

  it('honours a cancel between chunks: an AbortError, the handle closed, nothing more written', async () => {
    const a = new FakeFileHandle('A', fs);
    let chunks = 0;
    await expect(copyFiles([{ blob: new Blob([new Uint8Array(20)]), target: a }], {
      chunk: 4, onProgress: () => { chunks++; }, cancelled: () => chunks >= 2,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(a.data.length).toBe(8);
    expect(a.open).toBe(0);
  });

  it('the chunk is 8 MiB (an adaptation value)', () => {
    expect(DISC_COPY_CHUNK).toBe(8 * 1024 * 1024);
  });
});

// ---- the module -----------------------------------------------------------------------------------------------

describe('copyDisc: the whole disc into the page\'s OPFS (DA.R6), checked, verified, recorded', () => {
  withFixtures('an image: copied whole into one directory per disc identity, verified, recorded; persist asked and its answer kept', async () => {
    const request = isoRequest();
    const progress: [number, number][] = [];
    const record = await copyDisc(request, { onProgress: (d, t) => progress.push([d, t]) }, env);
    const size = request.kind === 'iso' ? request.file.size : 0;
    expect(record).toEqual({
      v: 1, kind: 'image', identity: IDENTITY, size, files: 1, dir: copyDirName(IDENTITY), when: 1_760_000_000_000, persisted: true,
    });
    expect(copyDirName(IDENTITY)).toBe('SCUS_972.75_1.02_NTSC');
    const stored = fs.files();
    expect([...stored.keys()]).toEqual([`${copyDir()}/${DISC_COPY_IMAGE}`]);
    expect(await sha(stored.get(`${copyDir()}/${DISC_COPY_IMAGE}`)!)).toBe(await sha(new Uint8Array(await (request as { file: File }).file.arrayBuffer())));
    expect(progress.at(-1)).toEqual([size, size]);
    expect(progress.length).toBe(Math.ceil(size / (64 * 1024)));
    expect([storage.estimates, storage.persistCalls]).toEqual([1, 1]);
    expect(await storedCopy(records)).toEqual(record);
    expect(await records.get(DISC_COPY_SLOT)).toEqual(record);
    expect(workers).toEqual({ count: 1, terminated: 1 });
  });

  withFixtures('persist refused: the copy is still made, the answer recorded (not required)', async () => {
    storage.persistAnswer = false;
    expect((await copyDisc(isoRequest(), {}, env)).persisted).toBe(false);
  });

  withFixtures('a folder: every file, nested ones too, at the paths the folder reader names (the picked root stripped)', async () => {
    const request = dirRequest();
    const record = await copyDisc(request, {}, env);
    const total = members().reduce((n, m) => n + m.bytes.length, 0);
    expect(record).toMatchObject({ v: 1, kind: 'folder', identity: IDENTITY, size: total, files: 2 });
    const stored = fs.files();
    expect([...stored.keys()].sort()).toEqual([`${copyDir()}/${DISC_COPY_CHECK_PATH}`, `${copyDir()}/SYSTEM.CNF`]);
    for (const m of members()) expect(await sha(stored.get(`${copyDir()}/${m.path}`)!)).toBe(await sha(m.bytes));
  });

  it('refuses a disc that is not SOCOM II before anything is written (DA.R8)', async () => {
    const request = dirRequest([{ path: 'SYSTEM.CNF', bytes: systemCnf('SLES_123.45') }, { path: 'RUN/X.BIN', bytes: text('x') }]);
    await expect(copyDisc(request, {}, env)).rejects.toMatchObject({ reason: 'refused', message: expect.stringContaining('SLES_123.45') });
    expect(fs.files().size).toBe(0);
    expect(storage.estimates).toBe(0);
  });

  withFixtures('the quota: refused, with the shortfall, when the space left is under the size and the margin; nothing written', async () => {
    const request = isoRequest();
    const size = (request as { file: File }).file.size;
    storage.usage = 10_000;
    storage.quota = storage.usage + size + DISC_COPY_MARGIN - 4096;
    const refusal = await copyDisc(request, {}, env).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscCopyError);
    expect(refusal).toMatchObject({ reason: 'quota', shortfall: 4096 });
    expect((refusal as Error).message).toMatch(/4,096 bytes|4\.0 KiB|4096/);
    expect(fs.files().size).toBe(0);
    expect(workers.count).toBe(0);
    expect(await hasStoredCopy(records)).toBe(false);
    storage.quota += 4096;                                    // exactly enough
    await expect(copyDisc(request, {}, env)).resolves.toMatchObject({ kind: 'image' });
  });

  it('the margin is 256 MiB (an adaptation value)', () => {
    expect(DISC_COPY_MARGIN).toBe(256 * 1024 * 1024);
  });

  withFixtures('no OPFS (an older browser, a private window that refuses it): refused as unavailable', async () => {
    await expect(copyDisc(dirRequest(), {}, Object.assign({}, env, { storage: null }))).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('a disc without the file the verification hashes is refused before anything is written', async () => {
    await expect(copyDisc(dirRequest([{ path: 'SYSTEM.CNF', bytes: systemCnf() }]), {}, env))
      .rejects.toMatchObject({ reason: 'refused', message: expect.stringContaining(DISC_COPY_CHECK_PATH) });
    expect(storage.estimates).toBe(0);
  });

  withFixtures('cancelled mid-copy: the worker stops between chunks, the partial copy is removed, nothing recorded', async () => {
    const controller = new AbortController();
    let reports = 0;
    const refusal = await copyDisc(isoRequest(), { signal: controller.signal, onProgress: () => { if (++reports === 3) controller.abort(); } }, env)
      .catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'cancelled' });
    expect(reports).toBeLessThan(6);
    expect(fs.files().size).toBe(0);
    expect(await records.get(DISC_COPY_SLOT)).toBeUndefined();
    expect(workers.terminated).toBe(1);
  });

  it('cancelled before it starts: nothing read, nothing written', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(copyDisc(dirRequest([{ path: 'SYSTEM.CNF', bytes: systemCnf() }]), { signal: controller.signal }, env))
      .rejects.toMatchObject({ reason: 'cancelled' });
    expect(storage.estimates).toBe(0);
  });

  withFixtures('a verification mismatch (READERC.ZAR\'s hash, an image or a folder): the copy removed, nothing recorded, the reason said', async () => {
    const extent = await new IsoAssetSource((isoRequest() as { file: File }).file).extent(DISC_COPY_CHECK_PATH);
    fs.corrupt.set(DISC_COPY_IMAGE, extent.lbn * 2048 + 100);
    await expect(copyDisc(isoRequest(), {}, env)).rejects.toMatchObject({ reason: 'mismatch', message: expect.stringContaining(DISC_COPY_CHECK_PATH) });
    expect(fs.files().size).toBe(0);
    fs.corrupt.clear();
    fs.corrupt.set('READERC.ZAR', 100);
    await expect(copyDisc(dirRequest(), {}, env)).rejects.toMatchObject({ reason: 'mismatch', message: expect.stringContaining(DISC_COPY_CHECK_PATH) });
    expect(fs.files().size).toBe(0);
    expect(await hasStoredCopy(records)).toBe(false);
  });

  withFixtures('a verification mismatch of SYSTEM.CNF (the copy names another disc): removed and said', async () => {
    fs.corrupt.set('SYSTEM.CNF', new TextDecoder().decode(systemCnf()).indexOf('VER = 1.02') + 9);   // VER's last digit
    await expect(copyDisc(dirRequest(), {}, env)).rejects.toMatchObject({ reason: 'mismatch', message: expect.stringContaining('SYSTEM.CNF') });
    expect(fs.files().size).toBe(0);
  });

  withFixtures('a new copy replaces the one kept; a partial left by a closed tab is swept first', async () => {
    const copies = await fs.root.getDirectoryHandle(DISC_COPY_ROOT, { create: true });
    const stale = await copies.getDirectoryHandle('SCUS_972.75_1.00_NTSC', { create: true });
    await stale.getFileHandle(DISC_COPY_IMAGE, { create: true });
    await copyDisc(isoRequest(), {}, env);
    await copyDisc(dirRequest(), {}, env);
    expect([...fs.files().keys()].sort()).toEqual([`${copyDir()}/${DISC_COPY_CHECK_PATH}`, `${copyDir()}/SYSTEM.CNF`]);
    expect((await storedCopy(records))?.kind).toBe('folder');
  });

  withFixtures('the space a kept copy holds counts as free for its replacement', async () => {
    const first = await copyDisc(isoRequest(), {}, env);
    storage.usage = 10_000 + first.size;
    storage.quota = 10_000 + first.size + DISC_COPY_MARGIN;    // full but for the old copy
    await expect(copyDisc(isoRequest(), {}, env)).resolves.toMatchObject({ kind: 'image' });
  });
});

describe('the stored copy at start (DA.R5\'s first step)', () => {
  withFixtures('an image\'s copy: storedCopyRequest is an iso request over the stored file; its source lists and reads as the original', async () => {
    const request = isoRequest();
    await copyDisc(request, {}, env);
    const back = await storedCopyRequest(env);
    expect(back?.kind).toBe('iso');
    const source = await storedCopySource(env);
    expect(source).toBeInstanceOf(IsoAssetSource);
    expect(await contents(source!)).toEqual(await contents(new IsoAssetSource((request as { file: File }).file)));
  });

  withFixtures('a folder\'s copy: a dir request over the stored files; its source lists and reads as the picked folder', async () => {
    await copyDisc(dirRequest(), {}, env);
    const back = await storedCopyRequest(env);
    expect(back?.kind).toBe('dir');
    const source = await storedCopySource(env);
    const { DirectoryAssetSource } = await import('@s2u/archive');
    const original = new DirectoryAssetSource((dirRequest() as Extract<DiscRequest, { kind: 'dir' }>).entries.map((e) => ({ path: e.path, blob: e.file })));
    expect(await contents(source!)).toEqual(await contents(original));
    expect(await source!.list()).toEqual(['RUN/UI/READERC.ZAR', 'SYSTEM.CNF']);
  });

  it('nothing kept: null', async () => {
    expect(await storedCopyRequest(env)).toBeNull();
    expect(await storedCopySource(env)).toBeNull();
  });

  withFixtures('a record whose directory the browser evicted: null, and the record cleared', async () => {
    await copyDisc(isoRequest(), {}, env);
    await fs.root.removeEntry(DISC_COPY_ROOT, { recursive: true });
    expect(await storedCopySource(env)).toBeNull();
    expect(await records.get(DISC_COPY_SLOT)).toBeUndefined();
  });

  withFixtures('hasStoredCopy (DA-7\'s, filled in): false, true once copied, false once deleted; readStartState says copy first', async () => {
    expect(await hasStoredCopy(records)).toBe(false);
    await copyDisc(isoRequest(), {}, env);
    expect(await hasStoredCopy(records)).toBe(true);
    expect(startOrder(await readStartState(records))).toBe('copy');
    await deleteStoredCopy(env);
    expect(await hasStoredCopy(records)).toBe(false);
  });

  it('hasStoredCopy reads a record of another shape (nothing this version wrote) as none', async () => {
    await records.put(DISC_COPY_SLOT, { v: 1 });
    expect(await hasStoredCopy(records)).toBe(false);
    expect(await storedCopy(records)).toBeNull();
  });

  withFixtures('deleteStoredCopy clears the slot and the directory (a partial with it)', async () => {
    await copyDisc(dirRequest(), {}, env);
    const copies = await fs.root.getDirectoryHandle(DISC_COPY_ROOT);
    await copies.getDirectoryHandle('partial', { create: true });
    await deleteStoredCopy(env);
    expect(await records.get(DISC_COPY_SLOT)).toBeUndefined();
    expect(fs.root.children.has(DISC_COPY_ROOT)).toBe(false);
    await deleteStoredCopy(env);                              // nothing kept: no error
  });
});

describe('DA.R3 and the build', () => {
  it('nothing leaves the machine: neither module names the network', () => {
    for (const f of ['discCopy.ts', 'discCopyProtocol.ts', 'discCopyWorker.ts']) {
      const code = readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
      expect(code, f).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|RTCPeerConnection)\b/);
    }
  });

  it('the worker is a module worker Vite bundles (as worker.ts and movieWorker.ts are)', () => {
    const code = readFileSync(resolve(import.meta.dirname, '../src/discCopy.ts'), 'utf8');
    expect(code).toContain("new Worker(new URL('./discCopyWorker.ts', import.meta.url), { type: 'module' })");
  });
});

describe('the review\'s fix round (5393d488c, F1-F4)', () => {
  withFixtures('F1: a cancel pressed during the setup, before the worker listens, stops the copy before its first chunk', async () => {
    const controller = new AbortController();
    let reports = 0;
    const during = Object.assign({}, env, { worker: () => { controller.abort(); return fakeWorker(workers); } });
    const refusal = await copyDisc(isoRequest(), { signal: controller.signal, onProgress: () => { reports++; } }, during)
      .catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'cancelled' });
    expect(reports).toBe(0);
    expect(fs.files().size).toBe(0);
    expect(await records.get(DISC_COPY_SLOT)).toBeUndefined();
  });

  withFixtures('F2: copying from the stored copy itself is refused, and the copy is kept (an image and a folder)', async () => {
    const image = isoRequest();
    await copyDisc(image, {}, env);
    const back = await storedCopyRequest(env);
    const refusal = await copyDisc(back!, {}, env).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscCopyError);
    expect(refusal).toMatchObject({ reason: 'refused', message: expect.stringContaining('stored copy') });
    expect(await hasStoredCopy(records)).toBe(true);
    expect(await contents((await storedCopySource(env))!)).toEqual(await contents(new IsoAssetSource((image as { file: File }).file)));
    await copyDisc(dirRequest(), {}, env);
    const folder = await storedCopyRequest(env);
    await expect(copyDisc(folder!, {}, env)).rejects.toMatchObject({ reason: 'refused' });
    expect(fs.files().size).toBe(2);
    expect((await storedCopy(records))?.kind).toBe('folder');
  });

  it('F3: a folder naming one path twice is refused as a DiscCopyError, not thrown raw', async () => {
    const request = dirRequest([{ path: 'SYSTEM.CNF', bytes: systemCnf() }, { path: 'system.cnf', bytes: systemCnf() }]);
    const refusal = await copyDisc(request, {}, env).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscCopyError);
    expect(refusal).toMatchObject({ reason: 'refused' });
  });

  withFixtures('F3: a records store that fails its read or its delete is a DiscCopyError (failed)', async () => {
    const failingGet: RecordStore = { get: () => Promise.reject(new Error('the read broke')), put: records.put, delete: records.delete };
    const one = await copyDisc(isoRequest(), {}, Object.assign({}, env, { records: failingGet })).catch((e: unknown) => e);
    expect(one).toBeInstanceOf(DiscCopyError);
    expect(one).toMatchObject({ reason: 'failed', message: expect.stringContaining('the read broke') });
    await copyDisc(isoRequest(), {}, env);
    const failingDelete: RecordStore = { get: records.get, put: records.put, delete: () => Promise.reject(new Error('the delete broke')) };
    const two = await copyDisc(isoRequest(), {}, Object.assign({}, env, { records: failingDelete })).catch((e: unknown) => e);
    expect(two).toBeInstanceOf(DiscCopyError);
    expect(two).toMatchObject({ reason: 'failed', message: expect.stringContaining('the delete broke') });
    expect(await hasStoredCopy(records)).toBe(true);           // the kept copy untouched
  });

  withFixtures('F3: an old copy another tab holds open (NoModificationAllowedError) is a DiscCopyError (failed), saying so', async () => {
    const copies = await fs.root.getDirectoryHandle(DISC_COPY_ROOT, { create: true });
    const held = await (await copies.getDirectoryHandle('SCUS_972.75_1.00_NTSC', { create: true })).getFileHandle(DISC_COPY_IMAGE, { create: true });
    await held.createSyncAccessHandle();                       // left open: another tab's
    const refusal = await copyDisc(isoRequest(), {}, env).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscCopyError);
    expect(refusal).toMatchObject({ reason: 'failed', message: expect.stringContaining('another tab') });
  });

  it('F4: the protocol module has no side effect on import; discCopy.ts never imports the worker entry', async () => {
    const scope = globalThis as { onmessage?: unknown };
    const before = scope.onmessage;
    const protocol = await import('../src/discCopyProtocol');
    expect(typeof protocol.serveDiscCopy).toBe('function');
    expect(scope.onmessage).toBe(before);
    const page = readFileSync(resolve(import.meta.dirname, '../src/discCopy.ts'), 'utf8');
    expect(page).not.toMatch(/from '\.\/discCopyWorker'/);
    expect(page).toMatch(/from '\.\/discCopyProtocol'/);
    const entry = readFileSync(resolve(import.meta.dirname, '../src/discCopyWorker.ts'), 'utf8');
    expect(entry).toMatch(/serveDiscCopy\(/);
  });
});
