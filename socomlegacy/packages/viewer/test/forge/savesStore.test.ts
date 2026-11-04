import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FORGE_AUTOSAVE_ASIDE_KEY, FORGE_SAVES_ASIDE_KEY, FORGE_SAVES_KEY, type Store } from '../../src/forge/saves';
import {
  ForgeSaves, RECOVERED_SUFFIX, SAVES_DB_NAME, SAVES_DB_VERSION, SAVES_STORES, SavesStore,
} from '../../src/forge/savesStore';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';

/**
 * FCW-07a: the one saves writer -- the forge's lists in IndexedDB, each a {generation, text} record written by a
 * compare-and-swap, so two tabs (or an agent and a person) never overwrite each other silently. A product-track
 * adaptation (the forge has no original). Fake IndexedDB: the declared dev dependency `fake-indexeddb`.
 */

function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
}

describe('FCW-07a: SavesStore over IndexedDB', () => {
  it('opens the s2u-forge database with one object store per list, each empty at generation 0', async () => {
    const factory = new FakeFactory();
    const store = new SavesStore(factory);
    await store.open();
    expect(SAVES_DB_NAME).toBe('s2u-forge');
    expect([...SAVES_STORES]).toEqual(['saves', 'savesAside', 'autosave', 'autosaveAside']);
    for (const name of SAVES_STORES) expect(await store.read(name)).toEqual({ generation: 0, text: null });
    store.close();
  });

  it('writes by compare-and-swap: two writers from the same generation, one wins, the other gets a conflict', async () => {
    const factory = new FakeFactory();
    const tab1 = new SavesStore(factory);
    const tab2 = new SavesStore(factory);
    await tab1.open();
    await tab2.open();
    expect(await tab1.write('saves', 'one', 0)).toBe('written');
    expect(await tab2.read('saves')).toEqual({ generation: 1, text: 'one' });
    const [a, b] = await Promise.all([tab1.write('saves', 'from tab 1', 1), tab2.write('saves', 'from tab 2', 1)]);
    expect([a, b].sort()).toEqual(['conflict', 'written']);
    const now = await tab1.read('saves');
    expect(now.generation).toBe(2);
    expect(now.text).toBe(a === 'written' ? 'from tab 1' : 'from tab 2');
    expect(await tab2.write('saves', 'stale', 1)).toBe('conflict');
    expect(await tab2.write('saves', 'fresh', 2)).toBe('written');
    expect(await tab1.read('saves')).toEqual({ generation: 3, text: 'fresh' });
    // another list is its own generation
    expect(await tab1.read('savesAside')).toEqual({ generation: 0, text: null });
    tab1.close();
    tab2.close();
  });

  it('refuses a list it does not keep, a text that is not one, and a closed store', async () => {
    const store = new SavesStore(new FakeFactory());
    expect(await store.write('saves', 'x', 0)).toBe('refused');            // not open
    await store.open();
    expect(await store.write('nope' as 'saves', 'x', 0)).toBe('refused');
    expect(await store.write('saves', 5 as unknown as string, 0)).toBe('refused');
    expect(await store.write('saves', 'x', -1)).toBe('refused');
    expect(await store.read('saves')).toEqual({ generation: 0, text: null });
    store.close();
  });

  it('migrates the localStorage lists once, keeping a recovery copy and never deleting it', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    legacy.set(FORGE_SAVES_KEY, '{"v":1,"saves":[]}');
    legacy.set(FORGE_SAVES_ASIDE_KEY, 'old list');
    legacy.set(FORGE_AUTOSAVE_ASIDE_KEY, '["a"]');
    const store = new SavesStore(factory);
    await store.open();
    expect(await store.migrateFromLocal(legacy)).toBe('migrated');
    expect(await store.read('saves')).toEqual({ generation: 1, text: '{"v":1,"saves":[]}' });
    expect(await store.read('savesAside')).toEqual({ generation: 1, text: 'old list' });
    expect(await store.read('autosaveAside')).toEqual({ generation: 1, text: '["a"]' });
    expect(RECOVERED_SUFFIX).toBe('-recovered-v3');
    expect(legacy.data.get(`${FORGE_SAVES_KEY}${RECOVERED_SUFFIX}`)).toBe('{"v":1,"saves":[]}');
    expect(legacy.data.get(`${FORGE_SAVES_ASIDE_KEY}${RECOVERED_SUFFIX}`)).toBe('old list');
    expect(legacy.data.get(`${FORGE_AUTOSAVE_ASIDE_KEY}${RECOVERED_SUFFIX}`)).toBe('["a"]');
    // part 2 (R3-B): renamed, not copied -- each original key cleared once its IndexedDB copy read back
    expect(legacy.data.get(FORGE_SAVES_KEY) ?? '').toBe('');
    expect(legacy.data.get(FORGE_SAVES_ASIDE_KEY) ?? '').toBe('');
    expect(legacy.data.get(FORGE_AUTOSAVE_ASIDE_KEY) ?? '').toBe('');

    // once: a later run (another tab, a reload) copies nothing over what was written since
    expect(await store.write('saves', 'newer', 1)).toBe('written');
    legacy.set(FORGE_SAVES_KEY, 'changed in localStorage');
    expect(await store.migrateFromLocal(legacy)).toBe('already');
    const again = new SavesStore(factory);
    await again.open();
    expect(await again.migrateFromLocal(legacy)).toBe('already');
    expect(await again.read('saves')).toEqual({ generation: 2, text: 'newer' });
    expect(legacy.data.get(`${FORGE_SAVES_KEY}${RECOVERED_SUFFIX}`)).toBe('{"v":1,"saves":[]}');   // never written over
    store.close();
    again.close();
  });

  it('migrates nothing when the recovery copy cannot be kept, and an empty browser migrates to empty lists', async () => {
    const refusing: Store = { get: () => null, set: () => undefined };
    const full: Store & { data: Map<string, string> } = memory();
    full.set(FORGE_SAVES_KEY, 'list');
    const readOnly: Store = { get: (k) => full.get(k), set: () => undefined };
    const a = new SavesStore(new FakeFactory());
    await a.open();
    expect(await a.migrateFromLocal(readOnly)).toBe('refused');
    expect(await a.read('saves')).toEqual({ generation: 0, text: null });
    expect(await a.migrateFromLocal(full)).toBe('migrated');
    const b = new SavesStore(new FakeFactory());
    await b.open();
    expect(await b.migrateFromLocal(refusing)).toBe('migrated');
    expect(await b.read('saves')).toEqual({ generation: 0, text: null });
    expect(await b.migrateFromLocal(full)).toBe('already');
    a.close();
    b.close();
  });

  it('refuses the migration, writing nothing, once a list already holds a write (the review F5b: the CAS kept)', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    legacy.set(FORGE_SAVES_KEY, 'old list');
    legacy.set(FORGE_SAVES_ASIDE_KEY, 'old aside');
    const store = new SavesStore(factory);
    await store.open();
    expect(await store.write('autosaveAside', 'written first', 0)).toBe('written');
    expect(await store.write('autosaveAside', 'written twice', 1)).toBe('written');
    expect(await store.migrateFromLocal(legacy)).toBe('refused');
    expect(await store.read('autosaveAside')).toEqual({ generation: 2, text: 'written twice' });
    expect(await store.read('saves')).toEqual({ generation: 0, text: null });       // nothing written, the marker neither
    expect(await store.read('savesAside')).toEqual({ generation: 0, text: null });
    expect(await store.migrateFromLocal(legacy)).toBe('refused');                   // not 'already': no marker was set
    expect(await store.write('autosaveAside', 'third', 2)).toBe('written');         // the writer holding 2 still writes
    store.close();
  });

  it('R3-B: the autosave is its own list, migrated with the others; a store that can remove a key has it removed', async () => {
    const factory = new FakeFactory();
    const legacy = Object.assign(memory(), { removed: [] as string[] });
    const remover = { ...legacy, remove: (k: string) => { legacy.removed.push(k); legacy.data.delete(k); } };
    legacy.set(FORGE_LAYOUT_KEY, '{"v":2,"name":"Kept","base":"blank:MP2","assets":[],"pieces":[],"spawns":[]}');
    const store = new SavesStore(factory);
    await store.open();
    expect(await store.migrateFromLocal(remover)).toBe('migrated');
    expect(await store.read('autosave')).toEqual({ generation: 1, text: '{"v":2,"name":"Kept","base":"blank:MP2","assets":[],"pieces":[],"spawns":[]}' });
    expect(legacy.removed).toEqual([FORGE_LAYOUT_KEY]);
    expect(legacy.data.get(`${FORGE_LAYOUT_KEY}${RECOVERED_SUFFIX}`)).toContain('"Kept"');
    store.close();
  });

  it('R3-B: a part-1 database (version 1, no autosave list) upgrades in place, its lists kept', async () => {
    const factory = new FakeFactory();
    await new Promise<void>((done, fail) => {
      const req = factory.open(SAVES_DB_NAME, 1);
      req.onupgradeneeded = () => { for (const n of ['saves', 'savesAside', 'autosaveAside', 'meta']) req.result.createObjectStore(n); };
      req.onsuccess = () => {
        const tx = req.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ generation: 4, text: 'part one' }, 'current');
        tx.oncomplete = () => { req.result.close(); done(); };
      };
      req.onerror = () => fail(req.error);
    });
    expect(SAVES_DB_VERSION).toBe(2);
    const store = new SavesStore(factory);
    await store.open();
    expect(await store.read('saves')).toEqual({ generation: 4, text: 'part one' });
    expect(await store.read('autosave')).toEqual({ generation: 0, text: null });
    expect(await store.write('autosave', 'now', 0)).toBe('written');
    store.close();
  });
});

describe("R3-B: ForgeSaves -- the page's lists over the one writer", () => {
  it('opens, migrates once (renaming the lists), and reads every list; an update writes the lists it changed by compare-and-swap', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    legacy.set(FORGE_SAVES_KEY, 'old saves');
    legacy.set(FORGE_LAYOUT_KEY, 'old autosave');
    const saves = new ForgeSaves(new SavesStore(factory), legacy);
    expect(await saves.open()).toEqual({ state: 'ready', migration: 'migrated', hidden: {} });
    expect(saves.text('saves')).toBe('old saves');
    expect(saves.text('autosave')).toBe('old autosave');
    expect(legacy.data.get(FORGE_SAVES_KEY) ?? '').toBe('');
    // the working copy is keyed by the lists' old names, so the pure helpers of ./saves run on it unchanged
    expect(saves.view().get(FORGE_SAVES_KEY)).toBe('old saves');
    const done = await saves.update((copy) => { copy.set(FORGE_SAVES_KEY, 'new saves'); return copy.get(FORGE_SAVES_KEY) === 'new saves'; });
    expect(done).toEqual({ value: true, outcome: 'written' });
    expect(saves.text('saves')).toBe('new saves');
    expect(await saves.update(() => 1)).toEqual({ value: 1, outcome: 'unchanged' });
    expect(await saves.write('autosave', 'edited')).toBe('written');
    const reload = new ForgeSaves(new SavesStore(factory), legacy);
    expect(await reload.open()).toEqual({ state: 'ready', migration: 'already', hidden: {} });
    expect(reload.text('saves')).toBe('new saves');
    expect(reload.text('autosave')).toBe('edited');
    saves.close();
    reload.close();
  });

  it('two tabs from the same generation: the second is told (conflict), re-reads, and writes nothing over the first', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const tab1 = new ForgeSaves(new SavesStore(factory), legacy);
    const tab2 = new ForgeSaves(new SavesStore(factory), legacy);
    await tab1.open();
    await tab2.open();
    expect(await tab1.write('saves', 'tab one')).toBe('written');
    const r = await tab2.update((copy) => { copy.set(FORGE_SAVES_KEY, 'tab two'); });
    expect(r.outcome).toBe('conflict');
    expect(tab2.text('saves')).toBe('tab one');                  // re-read: the other tab's list
    expect(await tab2.write('saves', 'tab two, after reading')).toBe('written');
    await tab1.reread();
    expect(tab1.text('saves')).toBe('tab two, after reading');
    tab1.close();
    tab2.close();
  });

  it('the review (R3-B fix-up): a write expecting the generation its caller read is a conflict once the lists were read again past it', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    await other.open();
    expect(await page.write('saves', 'A')).toBe('written');
    const read = page.generation('saves');                       // what the page's own copy of the list was read at
    await other.reread();
    expect(await other.write('saves', 'A and B')).toBe('written');
    await page.reread();                                          // a read the page's own copy never took in
    expect(page.generation('saves')).toBe(read + 1);
    const r = await page.update((copy) => { copy.set(FORGE_SAVES_KEY, 'A and C'); }, { saves: read });
    expect(r.outcome).toBe('conflict');
    expect(page.text('saves')).toBe('A and B');                  // nothing written over
    expect(await page.write('saves', 'A and C', read)).toBe('conflict');
    // taken in (the caller's copy now read at the store's generation): written
    expect((await page.update((copy) => { copy.set(FORGE_SAVES_KEY, 'A, B and C'); }, { saves: page.generation('saves') })).outcome).toBe('written');
    expect(await page.write('autosave', 'mine', page.generation('autosave'))).toBe('written');
    await other.reread();
    expect(other.text('saves')).toBe('A, B and C');
    page.close();
    other.close();
  });

  it('the review (R3-B fix-up): a list the page holds (its autosave) -- its own writes in a row never conflict; another tab\'s, read again, does until taken in', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    await other.open();
    // two writes asked at once (a close's flush of an edit and of a camera move): the second expects the first's
    const both = await Promise.all([page.write('autosave', 'edit', 'held'), page.write('autosave', 'edit and camera', 'held')]);
    expect(both).toEqual(['written', 'written']);
    await other.reread();
    expect(other.text('autosave')).toBe('edit and camera');
    expect(await other.write('autosave', 'theirs')).toBe('written');
    await page.reread();                                          // read again, not taken in: the page's layout is not theirs
    expect(await page.write('autosave', 'mine', 'held')).toBe('conflict');
    expect(page.text('autosave')).toBe('theirs');
    page.take('autosave');                                        // said to the person, then taken in
    expect(await page.write('autosave', 'mine', 'held')).toBe('written');
    page.close();
    other.close();
  });

  it('refuses every write where IndexedDB is not there, and where the older lists could not be moved', async () => {
    const legacy = memory();
    legacy.set(FORGE_SAVES_KEY, 'kept in localStorage');
    const none = new ForgeSaves(new SavesStore(undefined), legacy);
    expect(await none.open()).toEqual({ state: 'unavailable', migration: null, hidden: {} });
    expect(none.text('saves')).toBeNull();
    expect((await none.update((copy) => { copy.set(FORGE_SAVES_KEY, 'x'); })).outcome).toBe('refused');
    expect(await none.write('autosave', 'x')).toBe('refused');
    const readOnly: Store = { get: (k) => legacy.get(k), set: () => undefined };
    const stuck = new ForgeSaves(new SavesStore(new FakeFactory()), readOnly);
    expect(await stuck.open()).toEqual({ state: 'unmigrated', migration: 'refused', hidden: {} });
    expect(await stuck.write('saves', 'x')).toBe('refused');
    expect(legacy.data.get(FORGE_SAVES_KEY)).toBe('kept in localStorage');
    stuck.close();
  });
});

describe('R6 (the rendered pass\'s R3): a closing page\'s synchronous put, taken in at the next open', () => {
  it('the put is issued and committed before the caller returns; the next open writes it as the list\'s next generation', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await page.open()).state).toBe('ready');
    expect(await page.write('autosave', 'first')).toBe('written');
    // Nothing awaited between the put and the close: the closing page's last words.
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect(await next.open()).toEqual({ state: 'ready', migration: 'already', hidden: { autosave: 'applied' } });
    expect(next.text('autosave')).toBe('at the close');
    expect(next.generation('autosave')).toBe(2);
    next.close();
    // taken in once: a third open finds no hand-off
    const third = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await third.open()).hidden).toEqual({});
    expect(third.text('autosave')).toBe('at the close');
    third.close();
  });

  it('another writer that moved the list since the closing page read it wins: the hand-off is dropped and said', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    await other.open();
    expect(await other.write('autosave', 'the other tab\'s')).toBe('written');
    other.close();
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);    // at the generation it held (1), the list now at 2
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'dropped' });
    expect(next.text('autosave')).toBe('the other tab\'s');
    expect(next.generation('autosave')).toBe(2);
    next.close();
  });

  it("the review's edge: a write of this page's own, queued before the close and committed after it, does not drop the hand-off", async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    const queued = page.write('autosave', 'older', 'held');              // asked before the close, not yet committed
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);    // at the generation held now (1)
    expect(await queued).toBe('written');                               // the list moves to 2 by the page's own write
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'applied' });
    expect(next.text('autosave')).toBe('at the close');
    expect(next.generation('autosave')).toBe(3);
    next.close();
  });

  it('R7-5: a write the page has decided on but not yet asked (it waits for the open) is in flight from the call: the hand-off names it', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    let opened!: () => void;
    const gate = page.pending('autosave', 'decided', new Promise<void>((r) => { opened = r; }));
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);    // at the generation held now (1), 'decided' its own
    opened();
    await gate;
    expect(await page.write('autosave', 'decided', 'held')).toBe('written');   // the list moves to 2 by the page's own write
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'applied' });
    expect(next.text('autosave')).toBe('at the close');
    expect(next.generation('autosave')).toBe(3);
    next.close();
  });

  it('R7-5: a decided write is in flight only until its wait settles; a later hand-off does not count it', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    await page.pending('autosave', 'given up', Promise.resolve());     // decided, then nothing written (the text was already there)
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    await other.open();
    expect(await other.write('autosave', 'given up')).toBe('written'); // another tab writes the very same text
    other.close();
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'dropped' });
    expect(next.text('autosave')).toBe('given up');
    next.close();
  });

  // LATER 457 (round 6's review, page.ts ~:1277): an OLDER write of the page's own, queued before the close and
  // committed after the hand-off, moves the list past the hand-off's `expected`. The rule: `own` counts the page's
  // writes in flight at the hand-off; a list moved past `expected` by no more than `own.length` writes, to a text in
  // `own`, was moved by the page itself. A text the record does not name is not decidable from it (another tab's write
  // reads the same), so it stays 'dropped'.
  it('LATER 457 (a): an older write of the page\'s own, named in `own`, committed after the hand-off -- the hand-off is applied over it', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(await store.write('autosave', 'first', 0)).toBe('written');
    expect(store.putOnHide('autosave', 'final', 1, ['older', 'final'])).toBe(true);
    expect(await store.write('autosave', 'older', 1)).toBe('written');          // the queued older write commits: g+1
    expect(await store.settleHidden()).toEqual({ autosave: 'applied' });
    expect(await store.read('autosave')).toEqual({ generation: 3, text: 'final' });
    expect(await store.settleHidden()).toEqual({});                             // taken in once
    store.close();
  });

  it('LATER 457 (a, two of its own): both older writes named in `own` commit after the hand-off -- still the page\'s own movement, applied', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(store.putOnHide('autosave', 'final', 0, ['older', 'newer', 'final'])).toBe(true);
    expect(await store.write('autosave', 'older', 0)).toBe('written');
    expect(await store.write('autosave', 'newer', 1)).toBe('written');
    expect(await store.settleHidden()).toEqual({ autosave: 'applied' });
    expect(await store.read('autosave')).toEqual({ generation: 3, text: 'final' });
    store.close();
  });

  it('LATER 457 (b): the committed text is not in `own` -- not decidable from the record (another tab\'s write reads the same), so dropped', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(await store.write('autosave', 'first', 0)).toBe('written');
    expect(store.putOnHide('autosave', 'final', 1, ['final'])).toBe(true);
    expect(await store.write('autosave', 'older', 1)).toBe('written');          // a text the hand-off does not name
    expect(await store.settleHidden()).toEqual({ autosave: 'dropped' });
    expect(await store.read('autosave')).toEqual({ generation: 2, text: 'older' });   // never written over
    store.close();
  });

  it('LATER 457 (b, own emptied): no write in flight at the hand-off, the list moved since -- dropped, never written over', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(store.putOnHide('autosave', 'final', 0)).toBe(true);
    expect(await store.write('autosave', 'older', 0)).toBe('written');
    expect(await store.settleHidden()).toEqual({ autosave: 'dropped' });
    expect(await store.read('autosave')).toEqual({ generation: 1, text: 'older' });
    store.close();
  });

  it('LATER 457 (b, counted): a list moved by more writes than `own` counts is not the page\'s own movement, even to a text in `own`', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(store.putOnHide('autosave', 'final', 0, ['older'])).toBe(true);
    expect(await store.write('autosave', 'theirs', 0)).toBe('written');        // another writer's
    expect(await store.write('autosave', 'older', 1)).toBe('written');
    expect(await store.settleHidden()).toEqual({ autosave: 'dropped' });
    expect(await store.read('autosave')).toEqual({ generation: 2, text: 'older' });
    store.close();
  });

  it('LATER 457 (b, another tab): a text not in `own`, past `expected` within `own.length` writes, stays dropped (the R6 guarantee)', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(store.putOnHide('autosave', 'final', 0, ['older', 'final'])).toBe(true);
    expect(await store.write('autosave', 'theirs', 0)).toBe('written');
    expect(await store.settleHidden()).toEqual({ autosave: 'dropped' });
    expect(await store.read('autosave')).toEqual({ generation: 1, text: 'theirs' });
    store.close();
  });

  it('LATER 457 (c): a hand-off whose text the list already holds is nothing to take in (none), wherever the list moved', async () => {
    const store = new SavesStore(new FakeFactory());
    await store.open();
    expect(store.putOnHide('autosave', 'final', 0, ['older', 'final'])).toBe(true);
    expect(await store.write('autosave', 'older', 0)).toBe('written');
    expect(await store.write('autosave', 'final', 1)).toBe('written');
    expect(await store.settleHidden()).toEqual({});
    expect(await store.read('autosave')).toEqual({ generation: 2, text: 'final' });
    expect(store.putOnHide('autosave', 'final', 0)).toBe(true);                 // an older generation, the same text
    expect(await store.settleHidden()).toEqual({});
    expect(await store.read('autosave')).toEqual({ generation: 2, text: 'final' });
    store.close();
  });

  it('LATER 457 (b, ForgeSaves): an `update` asked before the hand-off has no text until its turn, so it is not in `own` -- dropped', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    const queued = page.update((copy) => { copy.set(FORGE_LAYOUT_KEY, 'older'); });   // its text is decided at its turn
    expect(page.writeOnHide('autosave', 'at the close')).toBe(true);
    expect((await queued).outcome).toBe('written');
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'dropped' });
    expect(next.text('autosave')).toBe('older');
    next.close();
  });

  // LATER 488 (LATER 457's review): a page hidden into the back/forward cache puts its hand-off and lives on; restored
  // (`pageshow`, `persisted`), it takes its own row back (`takeBackHidden`), compare-and-delete on the token the put
  // wrote, so its later writes are never taken for another tab's at the next open, and a row another page put since is
  // never removed.
  it('LATER 488: a page restored from the back/forward cache takes back its hand-off; it writes on and the next open takes nothing in', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    const flush = page.write('autosave', 'at the hide', 'held');        // the hide's own flush, in flight
    expect(page.writeOnHide('autosave', 'at the hide')).toBe(true);     // persisted: the page lives on
    expect(await flush).toBe('written');                                // g2
    expect(await page.takeBackHidden()).toEqual(['autosave']);          // restored
    expect(await page.write('autosave', 'after the restore', 'held')).toBe('written');   // g3
    expect(await page.takeBackHidden()).toEqual([]);                    // nothing left of this page's
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({});
    expect(next.text('autosave')).toBe('after the restore');
    expect(next.generation('autosave')).toBe(3);
    next.close();
  });

  it('LATER 488: the take-back is compare-and-delete -- a hand-off another page put over this one\'s is kept and taken in', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    expect(page.writeOnHide('autosave', 'mine at the hide')).toBe(true);
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    await other.open();
    expect(other.writeOnHide('autosave', 'the other tab\'s close')).toBe(true);   // its row over this page's
    other.close();
    expect(await page.takeBackHidden()).toEqual([]);                    // not this page's row: kept
    page.close();
    const next = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await next.open()).hidden).toEqual({ autosave: 'applied' });
    expect(next.text('autosave')).toBe('the other tab\'s close');
    next.close();
  });

  it('LATER 488: a row already taken in by another open is not there to take back; the store deletes only the token it is given', async () => {
    const factory = new FakeFactory();
    const legacy = memory();
    const page = new ForgeSaves(new SavesStore(factory), legacy);
    await page.open();
    expect(await page.write('autosave', 'first')).toBe('written');
    expect(page.writeOnHide('autosave', 'at the hide')).toBe(true);
    const other = new ForgeSaves(new SavesStore(factory), legacy);
    expect((await other.open()).hidden).toEqual({ autosave: 'applied' });   // the hidden page's row taken in meanwhile
    other.close();
    expect(await page.takeBackHidden()).toEqual([]);
    page.close();
    const store = new SavesStore(factory);
    await store.open();
    expect(store.putOnHide('autosave', 'tokened', 2, [], 'token-a')).toBe(true);
    expect(await store.withdrawHidden('autosave', 'token-b')).toBe(false);   // another token: kept
    expect(await store.withdrawHidden('autosave', '')).toBe(false);
    expect(await store.withdrawHidden('autosave', 'token-a')).toBe(true);
    expect(await store.withdrawHidden('autosave', 'token-a')).toBe(false);   // gone
    expect(await store.settleHidden()).toEqual({});
    store.close();
  });

  it('refuses the put where no list is open for writing, or the database refuses a transaction', async () => {
    const legacy = memory();
    const none = new ForgeSaves(new SavesStore(undefined), legacy);
    await none.open();
    expect(none.writeOnHide('autosave', 'x')).toBe(false);
    const store = new SavesStore(new FakeFactory());
    expect(store.putOnHide('autosave', 'x', 0)).toBe(false);           // not open
    await store.open();
    expect(store.putOnHide('nope' as 'autosave', 'x', 0)).toBe(false);
    expect(store.putOnHide('autosave', 'x', -1)).toBe(false);
    store.close();
  });
});
