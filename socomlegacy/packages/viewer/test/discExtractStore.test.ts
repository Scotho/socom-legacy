import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  EXTRACT_DB, EXTRACT_ROOT, ExtractStoreError, deleteExtractDb, idbExtractStore, opfsExtractStore, type ExtractStore,
} from '../src/discExtractStore';
import { FakeOpfs, filler } from './discExtractFakes';

/**
 * DX-1's store (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): one interface, two backends --
 * OPFS (a directory per disc identity below `EXTRACT_ROOT`) and IndexedDB (its own database, a `Blob` a file) -- each
 * writing and reading back, saying what is stored and its size, removing one identity's files. A browser adaptation
 * (FI.R2): nothing of the game; the bytes are made here. The OPFS is a fake in memory, the IndexedDB fake-indexeddb's.
 */

const stream = (parts: Uint8Array[]): ReadableStream<Uint8Array> => new ReadableStream({
  start(controller) { for (const p of parts) controller.enqueue(p); controller.close(); },
});
const bytesOf = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());

async function exercise(make: (dir: string) => ExtractStore): Promise<void> {
  const store = make('SCUS_972.75_1.02_NTSC');
  const other = make('SCUS_972.75_1.03_NTSC');
  const a = filler(5000, 1);
  const b = filler(777, 2);
  expect(await store.has('RUN/MP2.ZDB')).toBe(false);
  expect(await store.size('RUN/MP2.ZDB')).toBeNull();
  await expect(store.file('RUN/MP2.ZDB')).rejects.toMatchObject({ name: 'ExtractStoreError', reason: 'missing' });

  expect(await store.write('RUN/MP2.ZDB', new Blob([a]))).toBe(5000);
  expect(await store.write('RUN/UI/READERC.ZAR', stream([b.subarray(0, 100), b.subarray(100)]))).toBe(777);
  expect(await other.write('RUN/MP2.ZDB', new Blob([b]))).toBe(777);
  expect(await store.has('RUN/MP2.ZDB')).toBe(true);
  expect(await store.size('RUN/MP2.ZDB')).toBe(5000);
  expect(await bytesOf(await store.file('RUN/MP2.ZDB'))).toEqual(a);
  expect(await bytesOf(await store.file('RUN/UI/READERC.ZAR'))).toEqual(b);
  expect(await bytesOf(await other.file('RUN/MP2.ZDB'))).toEqual(b);

  expect(await store.write('RUN/MP2.ZDB', new Blob([b]))).toBe(777);   // written over
  expect(await store.size('RUN/MP2.ZDB')).toBe(777);

  await store.remove();
  expect(await store.has('RUN/MP2.ZDB')).toBe(false);
  expect(await store.has('RUN/UI/READERC.ZAR')).toBe(false);
  expect(await other.size('RUN/MP2.ZDB')).toBe(777);              // only its own identity's files
  await store.remove();                                            // nothing stored: no error
  await expect(store.write('RUN/../X', new Blob([a]))).rejects.toBeInstanceOf(ExtractStoreError);
}

describe('the OPFS store', () => {
  it('writes (a Blob, a stream) and reads back, sizes, removes one identity\'s directory', async () => {
    const fs = new FakeOpfs();
    await exercise((dir) => opfsExtractStore(async () => fs.root, dir));
    expect([...fs.files().keys()]).toEqual([`${EXTRACT_ROOT}/SCUS_972.75_1.03_NTSC/RUN/MP2.ZDB`]);
    expect(opfsExtractStore(async () => fs.root, 'D').backend).toBe('opfs');
  });

  it('target: the file\'s handle, made with its directories, for the worker', async () => {
    const fs = new FakeOpfs();
    const target = await opfsExtractStore(async () => fs.root, 'D').target('RUN/UI/UI.ZED');
    expect(typeof target.createSyncAccessHandle).toBe('function');
    expect(fs.handle(`${EXTRACT_ROOT}/D/RUN/UI/UI.ZED`)).toBeDefined();
  });

  it('a browser without the page-side writer: unavailable (the worker writes instead)', async () => {
    const fs = new FakeOpfs();
    const store = opfsExtractStore(async () => fs.root, 'D');
    const handle = await (await (await fs.root.getDirectoryHandle(EXTRACT_ROOT, { create: true })).getDirectoryHandle('D', { create: true }))
      .getFileHandle('X', { create: true });
    Object.assign(handle, { createWritable: undefined });
    await expect(store.write('X', new Blob(['x']))).rejects.toMatchObject({ reason: 'unavailable' });
  });
});

describe('the IndexedDB store', () => {
  it('writes (a Blob, a stream) and reads back, sizes, removes one identity\'s files only', async () => {
    const idb = new FakeFactory() as unknown as IDBFactory;
    await exercise((dir) => idbExtractStore(() => idb, dir));
    expect(idbExtractStore(() => idb, 'D').backend).toBe('indexeddb');
    const names = await (idb as unknown as { databases(): Promise<{ name: string }[]> }).databases();
    expect(names.map((d) => d.name)).toContain(EXTRACT_DB);
    await deleteExtractDb(() => idb);
    expect(await idbExtractStore(() => idb, 'SCUS_972.75_1.03_NTSC').size('RUN/MP2.ZDB')).toBeNull();
  });

  it('no IndexedDB: unavailable; a SecurityError (a private window): denied', async () => {
    await expect(idbExtractStore(() => null, 'D').size('X')).rejects.toMatchObject({ reason: 'unavailable' });
    const insecure = (): IDBFactory => { throw new DOMException('the operation is insecure', 'SecurityError'); };
    await expect(idbExtractStore(insecure, 'D').size('X')).rejects.toMatchObject({ reason: 'denied' });
    await deleteExtractDb(() => null);                           // none: no error
  });

  // LATER 578: another tab holding EXTRACT_DB open blocks the delete (`onblocked`); it used to wait forever, so a
  // receiver's `prepare` (a disc share) or a removal never settled. Now it says so, in words that name the cure.
  it('a delete another tab blocks rejects at once, unavailable, saying to close the other tab', async () => {
    const idb = new FakeFactory() as unknown as IDBFactory;
    await idbExtractStore(() => idb, 'D').write('X', new Blob(['x']));
    const held = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = idb.open(EXTRACT_DB);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });                                                         // "another tab": a connection that never closes on versionchange
    const hung = Symbol('hung');
    const outcome = await Promise.race([
      deleteExtractDb(() => idb).then(() => 'resolved', (e: unknown) => e),
      new Promise<symbol>((resolve) => setTimeout(() => resolve(hung), 2_000)),
    ]);
    held.close();
    expect(outcome).not.toBe(hung);
    expect(outcome).toBeInstanceOf(ExtractStoreError);
    expect(outcome).toMatchObject({ reason: 'unavailable' });
    expect((outcome as Error).message).toMatch(/another tab/);
    expect((outcome as Error).message).toMatch(/close it and try again/);
  });
});
