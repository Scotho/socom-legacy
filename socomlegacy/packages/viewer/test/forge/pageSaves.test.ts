// @vitest-environment jsdom
import { IDBDatabase as FakeDatabase, IDBFactory as FakeFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { CreatorLayoutRecord } from '../../src/forge/record';
import { emptyLayout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { recordOfLayout } from '../../src/forge/record';
import { FORGE_SAVES_KEY, readSaveList, saveNamed, writeSaves, type Store } from '../../src/forge/saves';
import { RECOVERED_SUFFIX, SavesStore } from '../../src/forge/savesStore';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';

/**
 * R3-B (4; FCW-07a part 2; a browser adaptation, no original): the mounted page writes its lists through the one saves
 * writer (`SavesStore` over IndexedDB, `ForgeSaves`): the localStorage lists move once at boot (a rename: the recovery
 * copy kept, the original cleared), the autosave is a list of its own, a write another tab got to first is refused and
 * said ("Saved elsewhere, reloaded"), never written over; and the page keeps each row's authored id across a delete, a
 * place, an undo and a redo (`recordV3.test.ts`' acceptance, on the page). The page is mounted as
 * `forgeAgentPage.test.ts` mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

let factory: IDBFactory;
const listOf = async (name: 'saves' | 'autosave'): Promise<{ generation: number; text: string | null }> => {
  const s = new SavesStore(factory);
  await s.open();
  const out = await s.read(name);
  s.close();
  return out;
};
const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};
const floorLayout = () => emptyLayout({ kind: 'blank', library: BLANK_LIBRARY });

async function mount(): Promise<ForgeAgentApi> {
  const { mountForge } = await import('../../src/forge/page');
  let api!: ForgeAgentApi;
  await mountForge(document, { onAgentReady: (a) => { api = a; } });
  expect(api.read().ready).toBe(true);
  return api;
}

describe('R3-B: the page writes through the one saves writer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    factory = new FakeFactory();
    vi.stubGlobal('indexedDB', factory);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('moves the localStorage lists into the store once at boot: the autosave opens, the saves list, the originals renamed', async () => {
    const kept = { ...floorLayout(), name: 'Kept work', spawns: [{ team: 'A' as const, p: [10, 0, 0] as [number, number, number], yaw: 0 },
      { team: 'B' as const, p: [-10, 0, 0] as [number, number, number], yaw: 0 }] };
    const autosave = JSON.stringify(recordOfLayout(kept, 'Kept work'));
    const named = memory();
    expect(writeSaves(saveNamed([], 'Named', recordOfLayout(kept, 'Named'), 1, 'named-id').saves, named)).toBe(true);
    localStorage.setItem(FORGE_LAYOUT_KEY, autosave);
    localStorage.setItem(FORGE_SAVES_KEY, named.get(FORGE_SAVES_KEY)!);
    const api = await mount();
    expect(api.read().layout!.name).toBe('Kept work');
    expect(api.read().layout!.spawns).toHaveLength(2);
    expect((await api.execute('saves.list', {})).data).toMatchObject([{ id: 'named-id', name: 'Named' }]);
    // a rename, not a copy: the store holds the lists, the originals are cleared, the recovery copies kept
    expect((await listOf('saves')).text).toBe(named.get(FORGE_SAVES_KEY));
    expect(localStorage.getItem(FORGE_SAVES_KEY) ?? '').toBe('');
    expect(localStorage.getItem(FORGE_LAYOUT_KEY) ?? '').toBe('');
    expect(localStorage.getItem(`${FORGE_SAVES_KEY}${RECOVERED_SUFFIX}`)).toBe(named.get(FORGE_SAVES_KEY));
    expect(localStorage.getItem(`${FORGE_LAYOUT_KEY}${RECOVERED_SUFFIX}`)).toBe(autosave);
  }, 20_000);

  it('the autosave is its own list in the store; an edit is written there, never to localStorage', async () => {
    const api = await mount();
    expect(await api.execute('spawn.place', { team: 'A', at: [30, 0, 40] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect((await listOf('autosave')).text ?? '').toContain('["A",30,0,40'), { timeout: 3000 });
    expect(localStorage.getItem(FORGE_LAYOUT_KEY)).toBeNull();
  }, 20_000);

  it('a named save another tab wrote first is not written over: refused, said, and the list read again', async () => {
    const api = await mount();
    expect(await api.execute('saves.save', { name: 'Mine' }, api.read().revision)).toMatchObject({ ok: true });
    const mine = await listOf('saves');
    expect(readSaveList({ get: () => mine.text, set: () => undefined }).saves.map((s) => s.name)).toEqual(['Mine']);
    expect(localStorage.getItem(FORGE_SAVES_KEY)).toBeNull();
    // another tab writes the list from the generation it read
    const other = new SavesStore(factory);
    await other.open();
    const theirs = memory();
    writeSaves(saveNamed([], 'Theirs', recordOfLayout(floorLayout(), 'Theirs'), 2, 'theirs-id').saves, theirs);
    expect(await other.write('saves', theirs.get(FORGE_SAVES_KEY)!, mine.generation)).toBe('written');
    other.close();
    const refused = await api.execute('saves.save', { name: 'Second' }, api.read().revision);
    expect(refused).toMatchObject({ ok: false, code: 'SAVE_REFUSED' });
    expect(refused.message).toContain('Saved elsewhere, reloaded');
    expect(document.body.textContent).toContain('Saved elsewhere, reloaded');
    expect((await listOf('saves')).text).toBe(theirs.get(FORGE_SAVES_KEY));            // nothing written over
    expect((await api.execute('saves.list', {})).data).toMatchObject([{ id: 'theirs-id', name: 'Theirs' }]);
    // read again, the next save writes from the generation now read
    expect(await api.execute('saves.save', { name: 'Third' }, api.read().revision)).toMatchObject({ ok: true });
    const now = await listOf('saves');
    expect(readSaveList({ get: () => now.text, set: () => undefined }).saves.map((s) => s.name)).toEqual(['Theirs', 'Third']);
  }, 20_000);

  it('the review (R3-B fix-up): lists the store read again on its own (a refused write) are not the page\'s copy: a save from the old copy is refused, said, never written over', async () => {
    const api = await mount();
    expect(await api.execute('saves.save', { name: 'Mine' }, api.read().revision)).toMatchObject({ ok: true });
    const mine = await listOf('saves');
    // another tab adds its own save, from the generation it read
    const other = new SavesStore(factory);
    await other.open();
    const both = memory();
    const read = readSaveList({ get: () => mine.text, set: () => undefined }).saves;
    expect(writeSaves(saveNamed(read, 'Theirs', recordOfLayout(floorLayout(), 'Theirs'), 2, 'theirs-id').saves, both)).toBe(true);
    expect(await other.write('saves', both.get(FORGE_SAVES_KEY)!, mine.generation)).toBe('written');
    other.close();
    // the page's next autosave is refused by the browser once: the store reads every list again (the other tab's
    // save with them), while the page's own copy of the saves is the one it read before
    const proto = FakeDatabase.prototype as unknown as { transaction: (...a: unknown[]) => unknown };
    const real = proto.transaction;
    let refusals = 0;
    proto.transaction = function (this: unknown, ...a: unknown[]): unknown {
      if (refusals === 0 && a[0] === 'autosave' && a[1] === 'readwrite') { refusals++; throw new DOMException('refused', 'InvalidStateError'); }
      return real.apply(this, a);
    };
    try {
      expect(await api.execute('spawn.place', { team: 'A', at: [30, 0, 40] }, api.read().revision)).toMatchObject({ ok: true });
      await vi.waitFor(() => expect(document.body.textContent).toContain('this browser refused the save'), { timeout: 3000 });
    } finally { proto.transaction = real; }
    expect(refusals).toBe(1);
    const third = await api.execute('saves.save', { name: 'Third' }, api.read().revision);
    expect(third).toMatchObject({ ok: false, code: 'SAVE_REFUSED' });
    expect(third.message).toContain('Saved elsewhere, reloaded');
    const kept = await listOf('saves');
    expect(readSaveList({ get: () => kept.text, set: () => undefined }).saves.map((s) => s.name)).toEqual(['Mine', 'Theirs']);
    // read again: the next save is written from the list the page now holds, the other tab's save kept
    expect(await api.execute('saves.save', { name: 'Third' }, api.read().revision)).toMatchObject({ ok: true });
    const now = await listOf('saves');
    expect(readSaveList({ get: () => now.text, set: () => undefined }).saves.map((s) => s.name)).toEqual(['Mine', 'Theirs', 'Third']);
  }, 20_000);

  it('R4 (8, the round 3 review): a re-read that reports no change still takes in a list the page never took (an earlier refused write\'s): the next save goes through at once', async () => {
    const api = await mount();
    expect(await api.execute('saves.save', { name: 'Mine' }, api.read().revision)).toMatchObject({ ok: true });
    const mine = await listOf('saves');
    const other = new SavesStore(factory);
    await other.open();
    const both = memory();
    const read = readSaveList({ get: () => mine.text, set: () => undefined }).saves;
    expect(writeSaves(saveNamed(read, 'Theirs', recordOfLayout(floorLayout(), 'Theirs'), 2, 'theirs-id').saves, both)).toBe(true);
    expect(await other.write('saves', both.get(FORGE_SAVES_KEY)!, mine.generation)).toBe('written');
    other.close();
    // the autosave refused once: the store reads every list again on its own, the page's copy left as it was
    const proto = FakeDatabase.prototype as unknown as { transaction: (...a: unknown[]) => unknown };
    const real = proto.transaction;
    let refusals = 0;
    proto.transaction = function (this: unknown, ...a: unknown[]): unknown {
      if (refusals === 0 && a[0] === 'autosave' && a[1] === 'readwrite') { refusals++; throw new DOMException('refused', 'InvalidStateError'); }
      return real.apply(this, a);
    };
    try {
      expect(await api.execute('spawn.place', { team: 'A', at: [30, 0, 40] }, api.read().revision)).toMatchObject({ ok: true });
      await vi.waitFor(() => expect(document.body.textContent).toContain('this browser refused the save'), { timeout: 3000 });
    } finally { proto.transaction = real; }
    expect(refusals).toBe(1);
    // another writer's word (the agent's refresh): the store's re-read finds nothing new -- but the page's copy is stale
    api.refreshExternalState();
    await vi.waitFor(async () => expect(((await api.execute('saves.list', {})).data as { name: string }[]).map((x) => x.name)).toEqual(['Mine', 'Theirs']), { timeout: 3000 });
    // so the next save is written from the list the store holds, first time
    expect(await api.execute('saves.save', { name: 'Third' }, api.read().revision)).toMatchObject({ ok: true });
    const now = await listOf('saves');
    expect(readSaveList({ get: () => now.text, set: () => undefined }).saves.map((x) => x.name)).toEqual(['Mine', 'Theirs', 'Third']);
  }, 20_000);

  it('the review (R3-B fix-up): a close with an edit and a camera move both pending writes both before the store is closed', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    // frames at the page's own clock (its `last` is performance.now() at the mount), 100 ms apart
    let clock = 0;
    const tick = (): void => { clock = Math.max(clock, performance.now()) + 100; for (const cb of frames.splice(0)) cb(clock); };
    const api = await mount();
    tick();
    expect(await api.execute('spawn.place', { team: 'A', at: [30, 0, 40] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect((await listOf('autosave')).text ?? '').toContain('["A",30,0,40'), { timeout: 3000 });
    const yawOf = (text: string | null): number => (JSON.parse(text ?? '{}') as { camera?: { yaw?: number } }).camera?.yaw ?? NaN;
    const before = yawOf((await listOf('autosave')).text);
    // an edit inside its 300 ms, and the camera turned (its own 300 ms of stillness not yet seen)
    expect(await api.execute('spawn.place', { team: 'B', at: [-30, 0, -40] }, api.read().revision)).toMatchObject({ ok: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
    tick();
    tick();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
    tick();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await vi.waitFor(async () => {
      const text = (await listOf('autosave')).text;
      expect(text ?? '').toContain('["B",-30,0,-40');
      expect(yawOf(text)).not.toBeCloseTo(before, 3);
    }, { timeout: 3000 });
  }, 20_000);

  it('keeps each row\'s authored id across a delete, a place, an undo and a redo (recordV3\'s acceptance, on the page)', async () => {
    const api = await mount();
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    archiveLoad.mockResolvedValue({ ...blankLibraryMap('MP84', 1000), path: 'synthetic/MP84', world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] } as LoadedMap);
    const yard = recordOfLayout({ ...floorLayout(), pieces: [1, 2, 3].map((x) => ({ asset: 'MP84:synthetic', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x * 40, 0, 0, 1] })) }, 'Yard');
    const imported = await api.execute('layout.import', { layout: yard }, api.read().revision);
    expect(imported, JSON.stringify(imported)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p0', 'p1', 'p2']);
    const deleted = await api.execute('piece.delete', { refs: ['piece:0'] }, api.read().revision);
    expect(deleted, JSON.stringify(deleted)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p1', 'p2']);
    expect(await api.execute('piece.place', { asset: 'MP84:synthetic', at: [200, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p1', 'p2', 'p3']);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p1', 'p2']);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p0', 'p1', 'p2']);
    expect(await api.execute('redo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect((api.read().layout as CreatorLayoutRecord).ids.pieces).toEqual(['p1', 'p2']);
  }, 20_000);
});
