import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import {
  canPickDiscFolder, canPickDiscImage, discMeta, discPermission, discRequestFromHandle, forgetDisc, handleFromDrop,
  hasStoredCopy, pickDiscFolder, pickDiscImage, readStartState, rememberDisc, rememberedDisc, requestDisc, startOrder,
  type DiscHandle, type PickerScope,
} from '../src/discMemory';
import { discName, openDisc } from '../src/discSource';
import { DISC_COPY_SLOT, DISC_HANDLE_SLOT, openPageRecords, type RecordStore } from '../src/pageStore';

/**
 * DA-7, the module (plan `docs/plans/2026-10-11-disc-access.md`; research 306 §3): the chosen disc's handle remembered
 * in the page's IndexedDB through `pageStore.ts`, its permission read, its request rebuilt, and DA.R5's order at start.
 * A browser adaptation (DA.R2): nothing of the game. The IndexedDB is fake-indexeddb's (a private one per test); the
 * handles are fakes with a settable permission state.
 */

type Perm = 'granted' | 'prompt' | 'denied';
const notFound = (): DOMException => new DOMException('the entry is gone', 'NotFoundError');

class FakeFile {
  readonly kind = 'file' as const;
  perm: Perm = 'granted';
  /** What a `requestPermission` answers (and leaves as the state). */
  answer: Perm = 'granted';
  gone = false;
  /** An error other than NotFoundError the read throws (an ejected drive's, unmeasured). */
  failWith: Error | null = null;
  /** The object a structured clone of this handle gives (null: itself), and the entries it is the same as. */
  clonesTo: FakeFile | null = null;
  readonly sameAs = new Set<unknown>();
  readonly compared: unknown[] = [];
  readonly modes: string[] = [];
  requests = 0;
  constructor(readonly name: string, readonly text = '') {}
  async queryPermission(d: { mode: string }): Promise<Perm> { this.modes.push(d.mode); return this.perm; }
  async requestPermission(d: { mode: string }): Promise<Perm> { this.modes.push(d.mode); this.requests++; this.perm = this.answer; return this.perm; }
  async getFile(): Promise<File> {
    if (this.failWith) throw this.failWith;
    if (this.gone) throw notFound();
    return new File([this.text], this.name, { lastModified: 7 });
  }
  async isSameEntry(other: unknown): Promise<boolean> { this.compared.push(other); return other === this || this.sameAs.has(other); }
}

class FakeDir {
  readonly kind = 'directory' as const;
  perm: Perm = 'granted';
  gone = false;
  readonly modes: string[] = [];
  constructor(readonly name: string, readonly children: (FakeFile | FakeDir)[] = []) {}
  async queryPermission(d: { mode: string }): Promise<Perm> { this.modes.push(d.mode); return this.perm; }
  async requestPermission(d: { mode: string }): Promise<Perm> { this.modes.push(d.mode); return this.perm; }
  async *values(): AsyncGenerator<FakeFile | FakeDir> {
    if (this.gone) throw notFound();
    for (const c of this.children) yield c;
  }
  async isSameEntry(other: unknown): Promise<boolean> { return other === this; }
}

const asHandle = (h: FakeFile | FakeDir): DiscHandle => h as unknown as DiscHandle;

/**
 * The browser stores a `FileSystemHandle` in IndexedDB by structured clone (it is Serializable); Node's
 * `structuredClone`, which fake-indexeddb calls, refuses an object with methods. This clone keeps a fake handle as
 * itself (or, for a `FakeFile` given a `clonesTo`, answers that other object, as the browser answers a new handle on
 * the same entry) and clones the rest as Node does -- the model of a handle that survives the store.
 */
const nodeClone = globalThis.structuredClone;
function keepHandles(v: unknown): unknown {
  if (v instanceof FakeFile) return v.clonesTo ?? v;
  if (v instanceof FakeDir) return v;
  if (Array.isArray(v)) return v.map(keepHandles);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keepHandles(x)]));
  }
  return nodeClone(v);
}

let store: RecordStore;
beforeEach(() => {
  vi.stubGlobal('structuredClone', keepHandles);
  const factory = new FakeFactory() as unknown as IDBFactory;
  store = openPageRecords(() => factory);
});
afterEach(() => { vi.unstubAllGlobals(); });

const IDENTITY = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
const SYSTEM_CNF = `BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.02\r\nVMODE = NTSC\r\n`;

describe('remember, recall, forget', () => {
  it('nothing remembered reads as null', async () => {
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('a folder\'s handle is remembered with its name, kind and identity, recalled, and forgotten', async () => {
    const dir = new FakeDir('SOCOM2');
    const meta = discMeta(asHandle(dir), IDENTITY);
    expect(meta).toEqual({ name: 'SOCOM2', kind: 'folder', identity: IDENTITY });
    expect(await rememberDisc(asHandle(dir), meta, store)).toBe(true);
    const back = await rememberedDisc(store);
    expect(back?.handle).toBe(dir);
    expect(back?.meta).toEqual(meta);
    await forgetDisc(store);
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('an image\'s handle is remembered as an image (no identity read), and a second disc replaces the first', async () => {
    await rememberDisc(asHandle(new FakeDir('OLD')), discMeta(asHandle(new FakeDir('OLD')), IDENTITY), store);
    const iso = new FakeFile('socom2.iso');
    await rememberDisc(asHandle(iso), discMeta(asHandle(iso), null), store);
    const back = await rememberedDisc(store);
    expect(back?.handle).toBe(iso);
    expect(back?.meta).toEqual({ name: 'socom2.iso', kind: 'image', identity: null });
  });

  it('a meta whose kind is not its handle\'s is refused', async () => {
    const iso = new FakeFile('socom2.iso');
    await expect(rememberDisc(asHandle(iso), { name: 'x', kind: 'folder', identity: null }, store)).rejects.toThrow(/kind/);
  });

  it('a record of another shape reads as null', async () => {
    await store.put(DISC_HANDLE_SLOT, { v: 99, what: 'else' });
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('no IndexedDB: nothing is recalled and remembering answers false', async () => {
    const none = openPageRecords(() => undefined, () => undefined);
    expect(await rememberedDisc(none)).toBeNull();
    expect(await rememberDisc(asHandle(new FakeFile('a.iso')), discMeta(asHandle(new FakeFile('a.iso')), null), none, () => undefined)).toBe(false);
  });
});

describe('the permission', () => {
  it('reads granted, prompt and denied by queryPermission in read mode', async () => {
    const iso = new FakeFile('socom2.iso');
    for (const p of ['granted', 'prompt', 'denied'] as const) {
      iso.perm = p;
      expect(await discPermission(asHandle(iso), store)).toBe(p);
    }
    expect(new Set(iso.modes)).toEqual(new Set(['read']));
  });

  it('a granted image whose file no longer resolves is gone, and is forgotten', async () => {
    const iso = new FakeFile('socom2.iso');
    await rememberDisc(asHandle(iso), discMeta(asHandle(iso), null), store);
    iso.gone = true;
    expect(await discPermission(asHandle(iso), store)).toBe('gone');
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('a granted folder whose directory no longer resolves is gone, and is forgotten', async () => {
    const dir = new FakeDir('SOCOM2', [new FakeFile('SYSTEM.CNF')]);
    await rememberDisc(asHandle(dir), discMeta(asHandle(dir), IDENTITY), store);
    dir.gone = true;
    expect(await discPermission(asHandle(dir), store)).toBe('gone');
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('a gone handle that is not the remembered one leaves the remembered disc', async () => {
    const kept = new FakeFile('kept.iso');
    await rememberDisc(asHandle(kept), discMeta(asHandle(kept), null), store);
    const other = new FakeFile('other.iso');
    other.gone = true;
    expect(await discPermission(asHandle(other), store)).toBe('gone');
    expect((await rememberedDisc(store))?.handle).toBe(kept);
  });

  it('the production path: the record read back is another object on the same entry (isSameEntry true): forgotten', async () => {
    const picked = new FakeFile('socom2.iso');
    const stored = new FakeFile('socom2.iso');
    picked.clonesTo = stored;                                   // what the store answers is not the object put
    stored.sameAs.add(picked);
    await rememberDisc(asHandle(picked), discMeta(asHandle(picked), null), store);
    expect((await rememberedDisc(store))?.handle).toBe(stored);
    picked.gone = true;
    expect(await discPermission(asHandle(picked), store)).toBe('gone');
    expect(stored.compared).toContain(picked);
    expect(await rememberedDisc(store)).toBeNull();
  });

  it('the record read back is another object whose isSameEntry answers false: not forgotten', async () => {
    const picked = new FakeFile('socom2.iso');
    const stored = new FakeFile('socom2.iso');
    picked.clonesTo = stored;
    await rememberDisc(asHandle(picked), discMeta(asHandle(picked), null), store);
    const other = new FakeFile('socom2.iso');
    other.gone = true;
    expect(await discPermission(asHandle(other), store)).toBe('gone');
    expect(stored.compared).toContain(other);
    expect((await rememberedDisc(store))?.handle).toBe(stored);
  });

  it('requestDisc asks requestPermission in read mode and answers its state', async () => {
    const iso = new FakeFile('socom2.iso');
    iso.perm = 'prompt';
    iso.answer = 'granted';
    expect(await requestDisc(asHandle(iso))).toBe('granted');
    expect(iso.requests).toBe(1);
    expect(iso.modes).toEqual(['read']);
    iso.perm = 'prompt';
    iso.answer = 'denied';
    expect(await requestDisc(asHandle(iso))).toBe('denied');
  });

  it('a handle without the permission calls reads as denied', async () => {
    const bare = { kind: 'file', name: 'x.iso', getFile: async () => new File([], 'x.iso') } as unknown as DiscHandle;
    expect(await discPermission(bare, store)).toBe('denied');
    expect(await requestDisc(bare)).toBe('denied');
  });
});

describe('discRequestFromHandle', () => {
  it('a file handle is an image request over its File', async () => {
    const r = await discRequestFromHandle(asHandle(new FakeFile('socom2.iso', 'bytes')));
    expect(r.kind).toBe('iso');
    if (r.kind !== 'iso') return;
    expect(r.file.name).toBe('socom2.iso');
    expect(await r.file.text()).toBe('bytes');
  });

  it('a directory handle is a dir request: paths rooted at its name, walked by name at every level', async () => {
    // Given out of order: the walk sorts each directory's entries by name.
    const root = new FakeDir('SOCOM2', [
      new FakeFile('SYSTEM.CNF', SYSTEM_CNF),
      new FakeDir('RUN', [new FakeDir('UI', [new FakeFile('READERC.ZAR', 'zar')])]),
    ]);
    const r = await discRequestFromHandle(asHandle(root));
    expect(r.kind).toBe('dir');
    if (r.kind !== 'dir') return;
    expect(r.entries.map((e) => e.path)).toEqual(['SOCOM2/RUN/UI/READERC.ZAR', 'SOCOM2/SYSTEM.CNF']);
    expect(r.entries.map((e) => e.file.name)).toEqual(['READERC.ZAR', 'SYSTEM.CNF']);
    expect(discName(r)).toBe('SOCOM2');
    // The shape `openFrontEndDisc` takes: DA-3's `openDisc` checks the identity and the probe through it.
    const opened = await openDisc(r, 'RUN/UI/READERC.ZAR');
    expect(opened.identity).toEqual(IDENTITY);
  });

  it('the order is by name, not by the order the directory hands its entries', async () => {
    const files = ['b', 'C', 'a', 'B'].map((n) => new FakeFile(n));
    const r = await discRequestFromHandle(asHandle(new FakeDir('D', files)));
    expect(r.kind === 'dir' && r.entries.map((e) => e.path)).toEqual(['D/B', 'D/C', 'D/a', 'D/b']);
  });
});

describe('startOrder (DA.R5)', () => {
  const remembered = { name: 'SOCOM2', kind: 'folder' as const, identity: IDENTITY };
  it('a stored copy comes first, whatever is remembered', () => {
    expect(startOrder({ copy: true, remembered, permission: 'granted', reason: null })).toBe('copy');
    expect(startOrder({ copy: true, remembered: null, permission: null, reason: null })).toBe('copy');
  });
  it('a remembered handle granted without a prompt opens', () => {
    expect(startOrder({ copy: false, remembered, permission: 'granted', reason: null })).toBe('open');
  });
  it('a remembered handle whose permission must be asked is "continue"', () => {
    expect(startOrder({ copy: false, remembered, permission: 'prompt', reason: null })).toBe('continue');
  });
  it('denied, gone or nothing remembered is the chooser', () => {
    expect(startOrder({ copy: false, remembered, permission: 'denied', reason: null })).toBe('choose');
    expect(startOrder({ copy: false, remembered, permission: 'gone', reason: null })).toBe('choose');
    expect(startOrder({ copy: false, remembered: null, permission: null, reason: null })).toBe('choose');
  });
  it('a remembered disc whose permission could not be read (a reason) is the chooser', () => {
    expect(startOrder({ copy: false, remembered, permission: null, reason: 'NotReadableError: x' })).toBe('choose');
  });

  it('readStartState reads the copy slot (DA-8\'s record), the remembered disc and its permission', async () => {
    expect(await readStartState(store)).toEqual({ copy: false, remembered: null, permission: null, reason: null });
    const iso = new FakeFile('socom2.iso');
    iso.perm = 'prompt';
    await rememberDisc(asHandle(iso), discMeta(asHandle(iso), null), store);
    const state = await readStartState(store);
    expect(state).toEqual({ copy: false, remembered: { name: 'socom2.iso', kind: 'image', identity: null }, permission: 'prompt', reason: null });
    expect(startOrder(state)).toBe('continue');
    expect(await hasStoredCopy(store)).toBe(false);
    await store.put(DISC_COPY_SLOT, { v: 1 });                // a record of another shape: none (DA-8)
    expect(await hasStoredCopy(store)).toBe(false);
    await store.put(DISC_COPY_SLOT, {
      v: 1, kind: 'image', identity: IDENTITY, size: 1, files: 1, dir: 'SCUS_972.75_1.02_NTSC', when: 1, persisted: false,
    });
    expect(await hasStoredCopy(store)).toBe(true);
    expect(startOrder(await readStartState(store))).toBe('copy');
  });

  it('readStartState never rejects: another error of the handle\'s read is the chooser, with the error as its reason', async () => {
    const iso = new FakeFile('socom2.iso');
    await rememberDisc(asHandle(iso), discMeta(asHandle(iso), null), store);
    iso.failWith = new DOMException('the device is not ready', 'NotReadableError');
    const state = await readStartState(store);
    expect(state).toEqual({
      copy: false, remembered: { name: 'socom2.iso', kind: 'image', identity: null }, permission: null,
      reason: 'NotReadableError: the device is not ready',
    });
    expect(startOrder(state)).toBe('choose');
    expect((await rememberedDisc(store))?.handle).toBe(iso);    // kept: the error may pass
    await expect(discPermission(asHandle(iso), store)).rejects.toMatchObject({ name: 'NotReadableError' });
  });

  it('readStartState never rejects: a query that throws, or a store that fails, is the chooser with a reason', async () => {
    const dir = new FakeDir('E:');
    await rememberDisc(asHandle(dir), discMeta(asHandle(dir), IDENTITY), store);
    dir.queryPermission = async () => { throw new TypeError('the handle is broken'); };
    const state = await readStartState(store);
    expect(state.permission).toBeNull();
    expect(state.reason).toBe('TypeError: the handle is broken');
    expect(startOrder(state)).toBe('choose');
    const failing: RecordStore = { get: async () => { throw new Error('refused'); }, put: async () => undefined, delete: async () => undefined };
    expect(await readStartState(failing)).toEqual({ copy: false, remembered: null, permission: null, reason: 'Error: refused' });
  });
});

describe('the pickers and the drop', () => {
  it('without the APIs each answers null', async () => {
    const bare: PickerScope = {};
    expect(canPickDiscImage(bare)).toBe(false);
    expect(canPickDiscFolder(bare)).toBe(false);
    expect(await pickDiscImage(bare)).toBeNull();
    expect(await pickDiscFolder(bare)).toBeNull();
    expect(await handleFromDrop({} as DataTransferItem)).toBeNull();
    expect(await handleFromDrop(null)).toBeNull();
  });

  it('pickDiscImage: one file of the .iso type, answered as the handle and its request', async () => {
    const iso = new FakeFile('socom2.iso', 'x');
    const showOpenFilePicker = vi.fn(async (_options: unknown) => [iso]);
    const scope = { showOpenFilePicker } as unknown as PickerScope;
    expect(canPickDiscImage(scope)).toBe(true);
    const picked = await pickDiscImage(scope);
    expect(picked?.handle).toBe(iso);
    expect(picked?.request.kind).toBe('iso');
    const opts = showOpenFilePicker.mock.calls[0]![0] as { multiple: boolean; types: { accept: Record<string, string[]> }[] };
    expect(opts.multiple).toBe(false);
    expect(Object.values(opts.types[0]!.accept).flat()).toEqual(['.iso']);   // as #disc-page-file; .bin is the owner's call
  });

  it('pickDiscFolder: a directory in read mode, answered as the handle and its dir request', async () => {
    const dir = new FakeDir('E:', [new FakeFile('SYSTEM.CNF', SYSTEM_CNF)]);
    const showDirectoryPicker = vi.fn(async (_options: unknown) => dir);
    const scope = { showDirectoryPicker } as unknown as PickerScope;
    expect(canPickDiscFolder(scope)).toBe(true);
    const picked = await pickDiscFolder(scope);
    expect(picked?.handle).toBe(dir);
    expect(picked?.request.kind === 'dir' && picked.request.entries.map((e) => e.path)).toEqual(['E:/SYSTEM.CNF']);
    expect(showDirectoryPicker.mock.calls[0]![0]).toMatchObject({ mode: 'read' });
  });

  it('a cancelled picker answers null; another failure is thrown', async () => {
    const abort = { showOpenFilePicker: async () => { throw new DOMException('cancelled', 'AbortError'); } } as unknown as PickerScope;
    expect(await pickDiscImage(abort)).toBeNull();
    const broken = { showDirectoryPicker: async () => { throw new DOMException('no', 'SecurityError'); } } as unknown as PickerScope;
    await expect(pickDiscFolder(broken)).rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('handleFromDrop: the item\'s handle and its request; a non-file item is null', async () => {
    const iso = new FakeFile('socom2.iso');
    const item = { getAsFileSystemHandle: vi.fn(async () => iso) } as unknown as DataTransferItem;
    const dropped = handleFromDrop(item);
    // Asked in the drop's own event: before the first await.
    expect((item as unknown as { getAsFileSystemHandle: ReturnType<typeof vi.fn> }).getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    const got = await dropped;
    expect(got?.handle).toBe(iso);
    expect(got?.request.kind).toBe('iso');
    expect(await handleFromDrop({ getAsFileSystemHandle: async () => null } as unknown as DataTransferItem)).toBeNull();
  });
});
