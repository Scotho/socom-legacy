import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { IsoAssetSource, READ_SET_VERSION, discReadSet, streamFile, type AssetSource } from '@s2u/archive';
import { buildIso } from '../../archive/test/isoImage';
import { DISC_COPY_MARGIN, copyDirName } from '../src/discCopy';
import {
  DiscExtractError, STILL_FROM_DISC, deleteExtraction, extractDisc, extractionState, openExtractedSource, storedExtraction,
  verifyExtraction, type DiscExtractFile, type DiscExtractRecord, type ExtractEnv,
} from '../src/discExtract';
import { ExtractedMissError } from '../src/discExtractSource';
import { EXTRACT_DB, EXTRACT_ROOT, deleteExtractDb, idbExtractStore } from '../src/discExtractStore';
import type { DiscRequest } from '../src/discSource';
import { DISC_EXTRACT_SLOT, openPageRecords, type RecordStore } from '../src/pageStore';
import {
  FakeOpfs, FakeStorage, READ_PATHS, OTHER_PATHS, anyOpen, discMembers, fakeWorker, systemCnf, type Member, type WorkerLog,
  type WorkerOptions,
} from './discExtractFakes';

/**
 * DX-1, the extraction (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): the disc's read set
 * copied file by file into the browser's storage -- OPFS through the worker's sync access handles, IndexedDB the
 * fallback -- checked against the quota first, hashed as it streams, recorded after each file, resumable, verified,
 * read back as a source, deleted. A browser adaptation (FI.R2): nothing of the game. The OPFS, the storage manager and
 * the worker are fakes run in-process (`./discExtractFakes`); the IndexedDB is fake-indexeddb's; the disc is a synthetic
 * image in the retail disc's own names, its bytes made here: no game data.
 */

const IDENTITY = { boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' };
const DIR = copyDirName(IDENTITY);
const CHUNK = 1024;

const isoRequest = (m: Member[] = discMembers()): DiscRequest =>
  ({ kind: 'iso', file: new File([buildIso(m, 'SCUS_97275')], 'SOCOM II.iso', { lastModified: 5 }) });
const dirRequest = (m: Member[] = discMembers(), top = 'SOCOM2'): DiscRequest =>
  ({ kind: 'dir', entries: m.map((x) => ({ path: `${top}/${x.path}`, file: new File([x.bytes], basename(x.path), { lastModified: 5 }) })) });
const sha = async (b: Uint8Array): Promise<string> =>
  Buffer.from(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)).toString('hex');
const membersBy = (m: Member[] = discMembers()): Map<string, Uint8Array> => new Map(m.map((x) => [x.path, x.bytes]));
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let fs: FakeOpfs;
let storage: FakeStorage;
let idb: IDBFactory;
let records: RecordStore;
let workers: WorkerLog;
let workerOptions: WorkerOptions;
let setup: ExtractEnv;
beforeEach(() => {
  fs = new FakeOpfs();
  storage = new FakeStorage(fs);
  idb = new FakeFactory() as unknown as IDBFactory;
  records = openPageRecords(() => idb, () => undefined);
  workers = { count: 0, terminated: 0, files: 0 };
  workerOptions = {};
  setup = { storage, idb: () => idb, records, worker: () => fakeWorker(workers, fs, workerOptions), chunk: CHUNK, now: () => 1_760_000_000_000 };
});
const idbEnv = (): ExtractEnv => ({ ...setup, backend: 'indexeddb' });

it('keeps the quota classification when creating the destination in the worker fails', async () => {
  fs.root.getDirectoryHandle = async () => { throw new DOMException('full', 'QuotaExceededError'); };
  await expect(extractDisc(isoRequest(), {}, setup)).rejects.toMatchObject({ reason: 'quota' });
  expect(workers.terminated).toBe(1);
});

/** Every stored OPFS file below the extraction's directory, by its read-set path. */
const opfsFiles = (): Map<string, Uint8Array> => {
  const out = new Map<string, Uint8Array>();
  for (const [p, b] of fs.files()) if (p.startsWith(`${EXTRACT_ROOT}/${DIR}/`)) out.set(p.slice(`${EXTRACT_ROOT}/${DIR}/`.length), b);
  return out;
};

/** Every file a source lists, its bytes' SHA-256. */
async function contents(source: AssetSource, paths?: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const p of paths ?? await source.list()) out.set(p, await sha(await source.read(p)));
  return out;
}

describe('extractDisc over OPFS: the read set, file by file, hashed and recorded', () => {
  it('an image: every read-set file stored at its path below the identity\'s directory, its SHA-256 recorded; nothing else', async () => {
    const request = isoRequest();
    const plans: [readonly DiscExtractFile[], number, string][] = [];
    const onFiles: [string, number, number][] = [];
    const progress: number[] = [];
    let finished: DiscExtractRecord | null = null;
    const record = await extractDisc(request, {
      onPlan: (files, total, backend) => plans.push([files, total, backend]),
      onFile: (path, index, count) => onFiles.push([path, index, count]),
      onProgress: (done) => progress.push(done),
      onDone: (r) => { finished = r; },
    }, setup);
    const set = await discReadSet(new IsoAssetSource((request as { file: File }).file));
    const bytes = membersBy();

    expect(record).toMatchObject({ v: 1, readSet: READ_SET_VERSION, identity: IDENTITY, backend: 'opfs', dir: DIR, total: set.total, persisted: true, when: 1_760_000_000_000 });
    expect(record.files.map((f) => f.path)).toEqual(set.files.map((f) => f.path));
    expect([...record.files.map((f) => f.path)].sort()).toEqual([...READ_PATHS].sort());
    for (const f of record.files) {
      expect(f.done, f.path).toBe(true);
      expect(f.size, f.path).toBe(bytes.get(f.path)!.length);
      expect(f.sha256, f.path).toBe(await sha(bytes.get(f.path)!));
    }
    const stored = opfsFiles();
    expect([...stored.keys()].sort()).toEqual([...READ_PATHS].sort());
    for (const p of OTHER_PATHS) expect(stored.has(p), p).toBe(false);
    for (const [p, b] of stored) expect(await sha(b), p).toBe(await sha(bytes.get(p)!));

    expect(plans).toHaveLength(1);
    expect(plans[0]![1]).toBe(set.total);
    expect(plans[0]![2]).toBe('opfs');
    expect(plans[0]![0].every((f) => !f.done)).toBe(true);
    expect(onFiles.map(([p]) => p)).toEqual(set.files.map((f) => f.path));
    expect(onFiles.every(([, i, n], k) => i === k && n === set.files.length)).toBe(true);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(set.total);
    expect(progress.every((d, i) => i === 0 || d >= progress[i - 1]!)).toBe(true);
    expect(finished).toEqual(record);
    expect(await storedExtraction(records)).toEqual(record);
    expect([storage.estimates, storage.persistCalls]).toEqual([1, 1]);
    expect(workers).toMatchObject({ count: 1, terminated: 1, files: READ_PATHS.length });
    expect(await extractionState(setup)).toBe('whole');
  });

  it('a folder: the same files, the sizes from the folder\'s own files, the same hashes', async () => {
    const image = await extractDisc(isoRequest(), {}, setup);
    await deleteExtraction(setup);
    const folder = await extractDisc(dirRequest(), {}, setup);
    expect([...folder.files].sort((a, b) => (a.path < b.path ? -1 : 1))).toEqual([...image.files].sort((a, b) => (a.path < b.path ? -1 : 1)));
    expect(folder.files.map((f) => f.path)).toEqual([...READ_PATHS].sort());
  });

  it('persist refused: the extraction is still made, the answer recorded (not required)', async () => {
    storage.persistAnswer = false;
    expect((await extractDisc(isoRequest(), {}, setup)).persisted).toBe(false);
  });
});

describe('extractDisc over IndexedDB (the fallback)', () => {
  it('writes each file as one Blob in its own database, hashed, recorded; reads back equal', async () => {
    const record = await extractDisc(isoRequest(), {}, idbEnv());
    expect(record.backend).toBe('indexeddb');
    expect(opfsFiles().size).toBe(0);
    const bytes = membersBy();
    const store = idbExtractStore(() => idb, DIR);
    for (const f of record.files) {
      expect(f.sha256, f.path).toBe(await sha(bytes.get(f.path)!));
      expect(await sha(new Uint8Array(await (await store.file(f.path)).arrayBuffer())), f.path).toBe(f.sha256);
    }
    expect(workers.count).toBe(0);                             // no worker: the page hashes and stores
    expect(await extractionState(idbEnv())).toBe('whole');
  });

  it('chosen on its own where OPFS is missing, or its worker cannot open a sync access handle', async () => {
    expect((await extractDisc(isoRequest(), {}, { ...setup, storage: null })).backend).toBe('indexeddb');
    await deleteExtraction({ ...setup, storage: null });
    workerOptions = { sync: false };
    expect((await extractDisc(isoRequest(), {}, setup)).backend).toBe('indexeddb');
    expect(workers).toMatchObject({ count: 1, terminated: 1, files: 0 });
  });
});

describe('refusals before any write, named in a player\'s words', () => {
  it('another disc (DA.R8): refused, nothing estimated or written', async () => {
    const other = discMembers(systemCnf('SLES_123.45'));
    await expect(extractDisc(isoRequest(other), {}, setup)).rejects.toMatchObject({ reason: 'refused', message: expect.stringContaining('SLES_123.45') });
    expect([storage.estimates, workers.count, fs.files().size]).toEqual([0, 0, 0]);
  });

  it('a file of the read set missing: refused, naming it; nothing written', async () => {
    const refusal = await extractDisc(isoRequest(discMembers(systemCnf(), ['RUN/MOTION_P.ZAR'])), {}, setup).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscExtractError);
    expect(refusal).toMatchObject({ reason: 'refused', message: expect.stringContaining('RUN/MOTION_P.ZAR') });
    expect(fs.files().size).toBe(0);
    expect(await storedExtraction(records)).toBeNull();
  });

  it('the quota: refused with the shortfall when the room left is under the read set and the margin; nothing written', async () => {
    const set = await discReadSet(new IsoAssetSource((isoRequest() as { file: File }).file));
    storage.usage = 10_000;
    storage.quota = storage.usage + set.total + DISC_COPY_MARGIN - 4096;
    const plans: number[] = [];
    const refusal = await extractDisc(isoRequest(), { onPlan: () => plans.push(1) }, setup).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(DiscExtractError);
    expect(refusal).toMatchObject({ reason: 'quota', shortfall: 4096 });
    expect((refusal as Error).message).toContain('4,096 bytes');
    expect((refusal as Error).message).toContain(STILL_FROM_DISC);
    expect(fs.files().size).toBe(0);
    expect(workers.files).toBe(0);
    expect(plans).toEqual([]);
    expect(await storedExtraction(records)).toBeNull();
    storage.quota += 4096;                                    // exactly enough
    await expect(extractDisc(isoRequest(), {}, setup)).resolves.toMatchObject({ backend: 'opfs' });
  });

  it('the disk full mid-write (QuotaExceededError): quota, the files done kept', async () => {
    fs.quotaAt = 4000;
    const refusal = await extractDisc(isoRequest(), {}, setup).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'quota', shortfall: null });
    const kept = await storedExtraction(records);
    expect(kept!.files.some((f) => f.done)).toBe(true);
    expect(kept!.files.some((f) => !f.done)).toBe(true);
  });

  it('no storage at all: unavailable, saying the game can still run from the disc', async () => {
    const refusal = await extractDisc(isoRequest(), {}, { ...setup, storage: null, idb: () => null }).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'unavailable', message: expect.stringContaining(STILL_FROM_DISC) });
  });

  it('a private window (SecurityError from both): denied, saying what to allow', async () => {
    storage.refuse = new DOMException('the operation is insecure', 'SecurityError');
    const refusal = await extractDisc(isoRequest(), {}, {
      ...setup, idb: () => { throw new DOMException('the operation is insecure', 'SecurityError'); },
    }).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'denied' });
    expect((refusal as Error).message).toMatch(/private window/);
    expect((refusal as Error).message).toMatch(/allow this site to store data/);
    expect((refusal as Error).message).toContain(STILL_FROM_DISC);
  });

  it('cancelled before it starts: nothing read, nothing written', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractDisc(isoRequest(), { signal: controller.signal }, setup)).rejects.toMatchObject({ reason: 'cancelled' });
    expect(storage.estimates).toBe(0);
  });
});

describe('resumable: a closed tab, a cancel', () => {
  it('a tab closed mid-file at file k: the next call carries on at k, rewrites k from its start, and finishes whole', async () => {
    // The first file from the sixth on that spans more than two chunks, so the tab closes with it half-written.
    const order = (await discReadSet(new IsoAssetSource((isoRequest() as { file: File }).file))).files;
    const k = order.findIndex((f, i) => i >= 5 && f.size > 2 * CHUNK);
    expect(k).toBeGreaterThan(0);
    workerOptions = { dieAt: k };
    await expect(extractDisc(isoRequest(), {}, setup)).rejects.toMatchObject({ reason: 'failed' });
    while (anyOpen(fs.root)) await tick();                     // the closed tab's handle released
    const half = await storedExtraction(records);
    expect(half!.files.filter((f) => f.done).length).toBe(k);
    expect(half!.files.slice(0, k).every((f) => f.done)).toBe(true);
    const partial = half!.files[k]!;
    expect(opfsFiles().get(partial.path)!.length).toBeLessThan(partial.size);   // half-written
    expect(await extractionState(setup)).toBe('partial');

    workerOptions = {};
    const plans: (readonly DiscExtractFile[])[] = [];
    const onFiles: number[] = [];
    const progress: number[] = [];
    const record = await extractDisc(isoRequest(), {
      onPlan: (files) => plans.push(files), onFile: (_p, i) => onFiles.push(i), onProgress: (d) => progress.push(d),
    }, setup);
    expect(plans[0]!.filter((f) => f.done).length).toBe(k);
    expect(onFiles[0]).toBe(k);
    expect(onFiles.length).toBe(READ_PATHS.length - k);
    expect(progress[0]).toBe(half!.files.slice(0, k).reduce((n, f) => n + f.size, 0));
    expect(record.started).toBe(half!.started);
    const bytes = membersBy();
    for (const f of record.files) expect(f.sha256, f.path).toBe(await sha(bytes.get(f.path)!));
    expect(await sha(opfsFiles().get(partial.path)!)).toBe(await sha(bytes.get(partial.path)!));
    expect(await extractionState(setup)).toBe('whole');
  });

  it('a cancel keeps every file done; the partial file is not counted done; the next call finishes', async () => {
    const controller = new AbortController();
    let chunks = 0;
    const refusal = await extractDisc(isoRequest(), {
      signal: controller.signal,
      onProgress: () => { if (++chunks === 12) controller.abort(); },
    }, setup).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'cancelled' });
    expect((refusal as Error).message).toMatch(/are kept/);
    const kept = await storedExtraction(records);
    const done = kept!.files.filter((f) => f.done);
    expect(done.length).toBeGreaterThan(0);
    expect(done.length).toBeLessThan(READ_PATHS.length);
    for (const f of done) expect(opfsFiles().get(f.path)!.length, f.path).toBe(f.size);
    expect(kept!.when).toBeNull();
    expect(await extractionState(setup)).toBe('partial');
    const record = await extractDisc(isoRequest(), {}, setup);
    expect(record.files.every((f) => f.done)).toBe(true);
    expect(await extractionState(setup)).toBe('whole');
  });

  it('a cancel in IndexedDB keeps what is done too', async () => {
    const controller = new AbortController();
    await expect(extractDisc(isoRequest(), {
      signal: controller.signal, onFile: (_p, i) => { if (i === 3) controller.abort(); },
    }, idbEnv())).rejects.toMatchObject({ reason: 'cancelled' });
    expect((await storedExtraction(records))!.files.filter((f) => f.done).length).toBe(3);
    expect((await extractDisc(isoRequest(), {}, idbEnv())).files.every((f) => f.done)).toBe(true);
  });

  it('a done file that went missing or short is rewritten at the next call (the start-up\'s cheap check)', async () => {
    const first = await extractDisc(isoRequest(), {}, setup);
    const victim = first.files[2]!;
    fs.handle(`${EXTRACT_ROOT}/${DIR}/${victim.path}`)!.data = new Uint8Array(3);
    expect(await extractionState(setup)).toBe('partial');
    const onFiles: string[] = [];
    await extractDisc(isoRequest(), { onFile: (p) => onFiles.push(p) }, setup);
    expect(onFiles).toEqual([victim.path]);
    expect(await extractionState(setup)).toBe('whole');
  });

  it('another disc (another VER) replaces the kept extraction', async () => {
    await extractDisc(isoRequest(), {}, setup);
    const other = await extractDisc(isoRequest(discMembers(systemCnf(undefined, '1.03'))), {}, setup);
    expect(other.dir).toBe('SCUS_972.75_1.03_NTSC');
    expect([...fs.files().keys()].some((p) => p.startsWith(`${EXTRACT_ROOT}/${DIR}/`))).toBe(false);
    expect((await storedExtraction(records))!.identity.ver).toBe('1.03');
  });
});

describe('verified', () => {
  it('a stored size that is not the table\'s is a mismatch: that file is not done, the files before it are', async () => {
    fs.lose.set('MP2.ZDB', 1);
    const refusal = await extractDisc(isoRequest(), {}, setup).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: 'mismatch', message: expect.stringContaining('RUN/MP2.ZDB') });
    const kept = await storedExtraction(records);
    expect(kept!.files.find((f) => f.path === 'RUN/MP2.ZDB')!.done).toBe(false);
    expect(kept!.files.some((f) => f.done)).toBe(true);
  });

  it('verifyExtraction re-hashes: a changed byte is caught, the file marked not done, rewritten at the next call', async () => {
    const record = await extractDisc(isoRequest(), {}, setup);
    expect(await verifyExtraction(setup)).toEqual({ checked: record.files.map((f) => f.path), bad: [] });
    const victim = record.files[4]!;
    fs.handle(`${EXTRACT_ROOT}/${DIR}/${victim.path}`)!.data[17]! ^= 0x01;
    const progress: number[] = [];
    const verdict = await verifyExtraction(setup, { onProgress: (d) => progress.push(d) });
    expect(verdict.bad).toEqual([victim.path]);
    expect(progress.at(-1)).toBe(record.total);
    const kept = await storedExtraction(records);
    expect(kept!.files.find((f) => f.path === victim.path)).toMatchObject({ done: false, sha256: null });
    expect(kept!.when).toBeNull();
    expect(await extractionState(setup)).toBe('partial');
    const onFiles: string[] = [];
    await extractDisc(isoRequest(), { onFile: (p) => onFiles.push(p) }, setup);
    expect(onFiles).toEqual([victim.path]);
    expect((await verifyExtraction(setup)).bad).toEqual([]);
  });

  it('verifyExtraction over IndexedDB catches a changed Blob', async () => {
    const record = await extractDisc(isoRequest(), {}, idbEnv());
    const victim = record.files[1]!;
    const store = idbExtractStore(() => idb, DIR);
    const bytes = new Uint8Array(await (await store.file(victim.path)).arrayBuffer());
    bytes[0]! ^= 0x80;
    await store.write(victim.path, new Blob([bytes]));
    expect((await verifyExtraction(idbEnv())).bad).toEqual([victim.path]);
  });
});

describe('the state at start-up, and deleteExtraction', () => {
  it('none, partial, whole, evicted (OPFS cleared by the browser), and none again once deleted', async () => {
    expect(await extractionState(setup)).toBe('none');
    await extractDisc(isoRequest(), {}, setup);
    expect(await extractionState(setup)).toBe('whole');
    await fs.root.removeEntry(EXTRACT_ROOT, { recursive: true });
    expect(await extractionState(setup)).toBe('evicted');
    const source = await openExtractedSource(setup);
    await expect(source!.read('RUN/MP2.ZDB')).rejects.toMatchObject({ name: 'ExtractedMissError', reason: 'gone' });
    await deleteExtraction(setup);
    expect(await extractionState(setup)).toBe('none');
  });

  it('evicted over IndexedDB (its database deleted)', async () => {
    await extractDisc(isoRequest(), {}, idbEnv());
    await deleteExtractDb(() => idb);
    expect(await extractionState(idbEnv())).toBe('evicted');
  });

  it('deleteExtraction: the record, OPFS\'s directory and the database go; nothing kept is no error', async () => {
    await extractDisc(isoRequest(), {}, setup);
    await extractDisc(isoRequest(), {}, { ...setup, backend: 'indexeddb' });
    await deleteExtraction(setup);
    expect(await records.get(DISC_EXTRACT_SLOT)).toBeUndefined();
    expect(fs.root.children.has(EXTRACT_ROOT)).toBe(false);
    const names = await (idb as unknown as { databases(): Promise<{ name: string }[]> }).databases();
    expect(names.map((d) => d.name)).not.toContain(EXTRACT_DB);
    await deleteExtraction(setup);
  });

  it("DX-1's review F1: an extraction made under another read set's version is not whole -- partial, and made again", async () => {
    const first = await extractDisc(isoRequest(), {}, setup);
    await records.put(DISC_EXTRACT_SLOT, { ...first, readSet: READ_SET_VERSION - 1 });
    expect(await extractionState(setup)).toBe('partial');
    const onFiles: number[] = [];
    const again = await extractDisc(isoRequest(), { onFile: (_p, i) => onFiles.push(i) }, setup);
    expect(again.readSet).toBe(READ_SET_VERSION);
    expect(onFiles.length).toBe(READ_PATHS.length);                         // every file written again, none resumed
    expect(await extractionState(setup)).toBe('whole');
  });

  it("DX-1's review F2: a resume whose kept backend will not open now is refused, never restarted elsewhere over the kept files", async () => {
    const order = (await discReadSet(new IsoAssetSource((isoRequest() as { file: File }).file))).files;
    const k = order.findIndex((f, i) => i >= 5 && f.size > 2 * CHUNK);
    workerOptions = { dieAt: k };
    await expect(extractDisc(isoRequest(), {}, setup)).rejects.toMatchObject({ reason: 'failed' });
    while (anyOpen(fs.root)) await tick();
    workerOptions = {};
    const kept = await storedExtraction(records);
    expect(kept!.backend).toBe('opfs');
    const stored = opfsFiles().size;
    const noWorker = { ...setup, worker: () => { throw new Error('no worker would start'); } };
    await expect(extractDisc(isoRequest(), {}, noWorker)).rejects.toMatchObject({ reason: 'unavailable' });
    expect(await storedExtraction(records)).toEqual(kept);                  // the record kept
    expect(opfsFiles().size).toBe(stored);                                  // the files kept
    const record = await extractDisc(isoRequest(), {}, setup);              // and the next try resumes
    expect(record.started).toBe(kept!.started);
  });

  it('a record of another shape reads as none', async () => {
    await records.put(DISC_EXTRACT_SLOT, { v: 1 });
    expect(await storedExtraction(records)).toBeNull();
    expect(await extractionState(setup)).toBe('none');
  });
});

describe('ExtractedAssetSource: the read set read back', () => {
  it('lists the read set; read, size, readRange and stream equal the disc\'s (an image and IndexedDB both)', async () => {
    const request = isoRequest();
    const disc = new IsoAssetSource((request as { file: File }).file);
    for (const e of [setup, idbEnv()]) {
      await extractDisc(request, {}, e);
      const source = (await openExtractedSource(e))!;
      expect(await source.list()).toEqual([...READ_PATHS].sort());
      expect(await contents(source)).toEqual(await contents(disc, READ_PATHS));
      for (const path of ['RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/MOVIES/INTRO_2.PSS', 'SYSTEM.CNF']) {
        expect(await source.size(path), path).toBe(await disc.size(path));
        expect(await source.readRange(path, 7, 50), path).toEqual(await disc.readRange(path, 7, 50));
        const chunks = async (s: AssetSource): Promise<Uint8Array[]> => {
          const out: Uint8Array[] = [];
          const length = Math.min(2000, (await disc.size(path)) - 3);
          for await (const c of streamFile(s, path, { offset: 3, length, chunkSize: 512 })) out.push(c);
          return out;
        };
        expect(await chunks(source), path).toEqual(await chunks(disc));
      }
      expect(await source.read('run\\mp2.zdb;1')).toEqual(await disc.read('RUN/MP2.ZDB'));   // the readers' naming
      const loaded: number[] = [];
      await source.read('RUN/SOUNDS/VAGSTORE.ZAR', (n) => loaded.push(n));
      expect(loaded.at(-1)).toBe(await disc.size('RUN/SOUNDS/VAGSTORE.ZAR'));
      await deleteExtraction(e);
    }
  });

  it('a path outside the read set, or not done, is a named miss', async () => {
    const controller = new AbortController();
    await extractDisc(isoRequest(), { signal: controller.signal, onFile: (_p, i) => { if (i === 2) controller.abort(); } }, setup).catch(() => undefined);
    const source = (await openExtractedSource(setup))!;
    const record = (await storedExtraction(records))!;
    const notDone = record.files.find((f) => !f.done)!.path;
    await expect(source.read('RUN/UI/BF51_TXR.ZED')).rejects.toBeInstanceOf(ExtractedMissError);
    await expect(source.read('RUN/UI/BF51_TXR.ZED')).rejects.toMatchObject({ reason: 'outside' });
    await expect(source.readRange(notDone, 0, 1)).rejects.toMatchObject({ reason: 'not-done', path: notDone });
    await expect(source.read(record.files[0]!.path)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('none recorded: null', async () => {
    expect(await openExtractedSource(setup)).toBeNull();
  });
});

describe('DA.R3 and the build', () => {
  it('nothing leaves the machine: no extraction module names the network', () => {
    for (const f of ['discExtract.ts', 'discExtractProtocol.ts', 'discExtractWorker.ts', 'discExtractStore.ts', 'discExtractSource.ts', 'discExtractHash.ts',
      'discStreamWrite.ts']) {                                   // DSH-2's writer (the disc-share plan), as the plan asks
      const code = readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '');
      expect(code, f).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|RTCPeerConnection)\b/);
    }
  });

  it('the worker is a module worker Vite bundles; the page never imports its entry; the protocol has no side effect', async () => {
    const page = readFileSync(resolve(import.meta.dirname, '../src/discExtract.ts'), 'utf8');
    expect(page).toContain("new Worker(new URL('./discExtractWorker.ts', import.meta.url), { type: 'module' })");
    expect(page).not.toMatch(/from '\.\/discExtractWorker'/);
    const scope = globalThis as { onmessage?: unknown };
    const before = scope.onmessage;
    await import('../src/discExtractProtocol');
    expect(scope.onmessage).toBe(before);
  });
});
