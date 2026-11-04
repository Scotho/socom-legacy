import { describe, expect, it } from 'vitest';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { layoutOfRecord, recordOfLayout } from '../../src/forge/record';
import {
  deleteNamed, FORGE_AUTOSAVE_ASIDE_KEY, FORGE_SAVES_ASIDE_KEY, FORGE_SAVES_KEY, joinerSavePreset, readSaveList, readSaves, renameNamed, SAVE_LIMIT,
  AUTOSAVE_ASIDE_LIMIT_ADAPTATION, dropKeptAside, keptAside, readAutosaveAside, saveNamed, setAsideAutosave, setAsideSaves,
  writeSaves, type Store,
} from '../../src/forge/saves';
import { PAGE_SETTING_KEYS } from '../../src/pageStore';

/**
 * FORGE: named layouts in this browser, beside the autosave. A browser adaptation with no original. The same list is
 * what a joiner writes when they keep a lobby's map (the lobby's layout, through `recordOfLayout`).
 */

function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
}

const layout = (): Layout => ({
  ...emptyLayout({ kind: 'blank', library: 'MP2' }),
  pieces: [{ asset: 'MP2:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 8, 1] }],
  spawns: [{ team: 'B', p: [1, 0, 2], yaw: 0 }],
});

describe('FORGE: named saves', () => {
  it('saves, replaces the same name, renames, deletes, and reads back the same layout', () => {
    const store = memory();
    const record = recordOfLayout(layout(), 'Yard');
    let saves = saveNamed([], 'Yard', record, 1_000, 'id-1').saves;
    expect(writeSaves(saves, store)).toBe(true);
    expect(store.data.get(FORGE_SAVES_KEY)).toContain('"Yard"');
    let read = readSaves(store);
    expect(read.map((s) => s.name)).toEqual(['Yard']);
    expect(layoutOfRecord(read[0]!.record)).toEqual({ ...layout(), name: 'Yard' });

    const replaced = saveNamed(read, 'Yard', recordOfLayout({ ...layout(), spawns: [] }, 'ignored'), 2_000, 'id-2');
    expect(replaced.error).toBeNull();
    expect(replaced.saves).toHaveLength(1);
    expect(replaced.saves[0]!.id).toBe('id-1');
    expect(replaced.saves[0]!.record.spawns).toEqual([]);

    const renamed = renameNamed(replaced.saves, 'id-1', 'Night yard');
    expect(renamed.error).toBeNull();
    expect(renamed.saves[0]!.record.name).toBe('Night yard');
    expect(renameNamed(renamed.saves, 'missing', 'x').error).toMatch(/no save/);
    const second = saveNamed(renamed.saves, 'Other', record, 3_000, 'id-3').saves;
    expect(renameNamed(second, 'id-3', 'Night yard').error).toMatch(/already/);

    writeSaves(deleteNamed(second, 'id-1'), store);
    read = readSaves(store);
    expect(read.map((s) => s.name)).toEqual(['Other']);
    expect(PAGE_SETTING_KEYS).toContain(FORGE_SAVES_KEY);
  });

  it('refuses a name the record will not keep, and a list past its cap', () => {
    const record = recordOfLayout(layout(), 'Yard');
    expect(saveNamed([], '   ', record).error).toMatch(/name/);
    const full = Array.from({ length: SAVE_LIMIT }, (_, i) => saveNamed([], `N${i}`, record, i, `id-${i}`).saves[0]!);
    expect(saveNamed(full, 'One more', record).error).toMatch(/delete one/);
    expect(saveNamed(full, 'N0', record, 9).error).toBeNull();
  });

  it('drops a broken entry and reads none from a store that throws', () => {
    const store = memory();
    store.set(FORGE_SAVES_KEY, JSON.stringify({ v: 1, saves: [{ id: 'a', savedAt: 1, record: { v: 2 } }, { id: 'b', savedAt: 2, record: recordOfLayout(layout(), 'Ok') }] }));
    expect(readSaves(store).map((s) => s.name)).toEqual(['Ok']);
    expect(readSaves({ get: () => { throw new Error('private'); }, set: () => undefined })).toEqual([]);
    expect(writeSaves([], { get: () => null, set: () => { throw new Error('quota'); } })).toBe(false);
  });

  it('prefills the lobby name when the layout has none, including the autosave stand-in', () => {
    expect(joinerSavePreset(undefined, 'Frostfire night')).toBe('Frostfire night');
    expect(joinerSavePreset('', 'Frostfire night')).toBe('Frostfire night');
    expect(joinerSavePreset('   ', 'Frostfire night')).toBe('Frostfire night');
    expect(joinerSavePreset('Autosave', 'Frostfire night')).toBe('Frostfire night');
    expect(joinerSavePreset('Yard', 'Frostfire night')).toBe('Yard');
  });

  it('keeps a lobby layout a joiner saves under the name they give it', () => {
    const lobby = layout();
    const saved = saveNamed([], 'Frostfire night', recordOfLayout(lobby, 'Frostfire night'), 5, 'lobby-1');
    expect(saved.error).toBeNull();
    expect(layoutOfRecord(saved.saves[0]!.record)).toEqual({ ...lobby, name: 'Frostfire night' });
  });

  // #348's re-review (low): an entry this build cannot read was dropped from the list, and the next write deleted it.
  it('keeps an entry it cannot read, as it was, through the next write, and names it as unreadable', () => {
    const store = memory();
    const odd = { id: 'odd', savedAt: 5, record: { ...recordOfLayout(layout(), 'Later build'), spawns: [['B', 1, 0, 2, 0, 'yes']] } };
    const shapeless = { note: 'not a save at all' };
    store.set(FORGE_SAVES_KEY, JSON.stringify({ v: 1, saves: [odd, { id: 'b', savedAt: 2, record: recordOfLayout(layout(), 'Ok') }, shapeless] }));
    const list = readSaveList(store);
    expect(list.saves.map((x) => x.name)).toEqual(['Ok']);
    expect(list.unreadable.map((u) => u.name)).toEqual(['Later build', 'an unnamed entry']);
    expect(list.unreadable[0]!.why).toMatch(/spawn 0/);
    // A new save, then the write: the unreadable entries go back exactly as they were.
    const next = saveNamed(list.saves, 'New', recordOfLayout(layout(), 'New'), 9, 'id-new').saves;
    expect(writeSaves(next, store, list.unreadable)).toBe(true);
    const written = JSON.parse(store.data.get(FORGE_SAVES_KEY)!) as { saves: unknown[] };
    expect(written.saves).toContainEqual(odd);
    expect(written.saves).toContainEqual(shapeless);
    expect(readSaveList(store).unreadable).toHaveLength(2);
    expect(readSaves(store).map((x) => x.name)).toEqual(['Ok', 'New']);
  });

  // The fold's review (low 4): a store this build cannot read as a list read as none, and the next write replaced it.
  it.each([
    ['a later build\'s shape', JSON.stringify({ v: 2, layouts: [{ id: 'x' }] })],
    ['a list that is not one', JSON.stringify({ v: 1, saves: 'many' })],
    ['a hand edit that is not JSON', '{"v":1,"saves":[{"id":"a"'],
  ])('a store it cannot read as a list (%s) is named and never written over', (_, text) => {
    const store = memory();
    store.set(FORGE_SAVES_KEY, text);
    const list = readSaveList(store);
    expect(list.saves).toEqual([]);
    expect(list.unreadable.map((u) => u.name)).toEqual(['the saved list']);
    const next = saveNamed(list.saves, 'New', recordOfLayout(layout(), 'New'), 9, 'id-new').saves;
    expect(writeSaves(next, store, list.unreadable)).toBe(false);
    expect(store.data.get(FORGE_SAVES_KEY)).toBe(text);
  });

  // The fold's re-review (finding A): a whole unreadable list blocked every save for good; the page offers to set it aside.
  it('sets an unreadable saved list aside, as it was, and the list is writable again', () => {
    const store = memory();
    const text = JSON.stringify({ v: 2, layouts: [{ id: 'x' }] });
    store.set(FORGE_SAVES_KEY, text);
    expect(setAsideSaves(store)).toBe(true);
    expect(store.data.get(FORGE_SAVES_ASIDE_KEY)).toBe(text);
    const list = readSaveList(store);
    expect(list).toEqual({ saves: [], unreadable: [] });
    expect(writeSaves(saveNamed([], 'New', recordOfLayout(layout(), 'New'), 9, 'id-new').saves, store, list.unreadable)).toBe(true);
    expect(PAGE_SETTING_KEYS).toContain(FORGE_SAVES_ASIDE_KEY);
    // A second set-aside never overwrites the first.
    store.set(FORGE_SAVES_KEY, 'broken');
    expect(setAsideSaves(store)).toBe(false);
    expect(store.data.get(FORGE_SAVES_ASIDE_KEY)).toBe(text);
  });

  // LATER 193: an autosave this build cannot read is set aside as it was, never overwritten -- the saved list's rule.
  // The batch review's F1 and F4: the slot was single-use, so a second unreadable autosave found it full and was then
  // written over. The set-aside autosaves are a list: each one kept, the same text once, never one dropped for another.
  it('unreadable autosaves are set aside as they were, each kept, the same one once; none dropped when the list is full', () => {
    const store = memory();
    const a = JSON.stringify({ v: 99, rows: [[1, 2, 3]] }), b = 'a hand edit {';
    expect(setAsideAutosave(store, a)).toBe(true);
    expect(setAsideAutosave(store, b)).toBe(true);
    expect(setAsideAutosave(store, a)).toBe(true);                 // already kept: not twice
    expect(readAutosaveAside(store)).toEqual([a, b]);
    for (let i = 2; i < AUTOSAVE_ASIDE_LIMIT_ADAPTATION; i++) expect(setAsideAutosave(store, `t${i}`)).toBe(true);
    expect(setAsideAutosave(store, 'one more')).toBe(false);       // full: refused, so the page keeps it in place
    expect(readAutosaveAside(store)).toHaveLength(AUTOSAVE_ASIDE_LIMIT_ADAPTATION);
    expect(setAsideAutosave(memory(), '')).toBe(false);
    expect(PAGE_SETTING_KEYS).toContain(FORGE_AUTOSAVE_ASIDE_KEY);
  });

  // The batch review's F2: the page's store refuses a write (the quota) without throwing; the set-aside reads it back.
  it('a store that refuses the write (the quota) is no set-aside: false, the text not claimed kept', () => {
    const refusing: Store = { get: () => null, set: () => ({ ok: false }) };
    expect(setAsideAutosave(refusing, 'kept?')).toBe(false);
  });

  // LATER 214 (the merge controller's product-track call on the words, 2026-10-21): what LATER 193 and the fold kept
  // aside was read by nothing, so a player could not see, download or clear it. `keptAside` lists it -- each autosave as
  // kept, oldest first, then the saved list -- with whether this build reads it now (each was set aside unreadable; a
  // later build may read one); `dropKeptAside` removes one, read back, the rest left as they were.
  it('LATER 214: lists what is kept aside, oldest first, with whether this build reads it now', () => {
    const store = memory();
    expect(keptAside(store)).toEqual([]);
    const readable = JSON.stringify(recordOfLayout(layout(), 'Mine'));
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, JSON.stringify(['a hand edit {', readable]));
    store.set(FORGE_SAVES_ASIDE_KEY, 'broken list');
    expect(keptAside(store)).toEqual([
      { id: 'autosave:0', name: 'Earlier autosave 1', text: 'a hand edit {', readable: false },
      { id: 'autosave:1', name: 'Earlier autosave 2', text: readable, readable: true },
      { id: 'saves', name: 'Earlier saved list', text: 'broken list', readable: false },
    ]);
    // An autosave list this build cannot read as a list is one entry, kept whole.
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, '{not a list');
    expect(keptAside(store)[0]).toEqual({ id: 'autosaves', name: 'Earlier autosaves', text: '{not a list', readable: false });
  });

  it('LATER 214: drops one kept copy, read back; the rest stay as they were; one already gone, or a refused write, drops nothing', () => {
    const store = memory();
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, JSON.stringify(['one', 'two', 'three']));
    store.set(FORGE_SAVES_ASIDE_KEY, 'broken list');
    const [, two] = keptAside(store);
    expect(dropKeptAside(store, two!)).toBe('dropped');
    expect(readAutosaveAside(store)).toEqual(['one', 'three']);
    const saves = keptAside(store).find((k) => k.id === 'saves')!;
    expect(dropKeptAside(store, saves)).toBe('dropped');
    expect(store.data.get(FORGE_SAVES_ASIDE_KEY)).toBe('');
    expect(keptAside(store).map((k) => k.name)).toEqual(['Earlier autosave 1', 'Earlier autosave 2']);
    // Freed: an unreadable saved list can be set aside again.
    store.set(FORGE_SAVES_KEY, 'broken again');
    expect(setAsideSaves(store)).toBe(true);
    // A copy no longer there (another tab took it) drops nothing, and says so: 'gone', not a refusal (the review's L1,
    // the merge controller's words call).
    expect(dropKeptAside(store, { id: 'autosave:0', name: 'Earlier autosave 1', text: 'gone', readable: false })).toBe('gone');
    expect(dropKeptAside(store, { id: 'saves', name: 'Earlier saved list', text: 'not this one', readable: false })).toBe('gone');
    expect(store.data.get(FORGE_SAVES_ASIDE_KEY)).toBe('broken again');   // the set-aside above, untouched by the miss
    expect(readAutosaveAside(store)).toEqual(['one', 'three']);
    // The page's store refuses a write without throwing: read back, nothing claimed dropped.
    const refusing: Store = { get: (k) => store.data.get(k) ?? null, set: () => ({ ok: false }) };
    expect(dropKeptAside(refusing, keptAside(refusing)[0]!)).toBe('refused');
    expect(readAutosaveAside(store)).toEqual(['one', 'three']);
    // An unreadable autosave list, kept whole, is dropped whole.
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, '{not a list');
    expect(dropKeptAside(store, keptAside(store)[0]!)).toBe('dropped');
    expect(store.data.get(FORGE_AUTOSAVE_ASIDE_KEY)).toBe('');
    expect(setAsideAutosave(store, 'fresh')).toBe(true);
  });

  // The review's B1: dropping the last kept autosave wrote '[]', which `setAsideAutosave` reads as a list it cannot read
  // and refuses -- so no later unreadable autosave could be set aside, and the card showed nothing to clear. The key
  // emptied by a drop is free again.
  it('LATER 214: the last kept autosave dropped, the key is free: the next unreadable autosave is set aside', () => {
    const store = memory();
    expect(setAsideAutosave(store, 'one {')).toBe(true);
    expect(dropKeptAside(store, keptAside(store)[0]!)).toBe('dropped');
    expect(keptAside(store)).toEqual([]);
    expect(setAsideAutosave(store, 'two {')).toBe(true);
    expect(readAutosaveAside(store)).toEqual(['two {']);
  });

  // LATER 213: the saved list's set-aside and write took a refused write as done -- the aside's write refused, the
  // clear after it taken, and the whole saved list was erased. Each write is read back, as `setAsideAutosave`'s.
  it('LATER 213: a refused set-aside leaves the saved list in place; a refused write of the list is false', () => {
    const refusingKeys = (...keys: string[]): Store & { data: Map<string, string> } => {
      const m = memory();
      return { data: m.data, get: m.get, set: (k, v) => (keys.includes(k) ? { ok: false } : m.set(k, v)) };
    };
    const text = JSON.stringify({ v: 2, layouts: [{ id: 'x' }] });
    const asideRefused = refusingKeys(FORGE_SAVES_ASIDE_KEY);
    asideRefused.data.set(FORGE_SAVES_KEY, text);
    expect(setAsideSaves(asideRefused), 'the aside not kept: no set-aside').toBe(false);
    expect(asideRefused.data.get(FORGE_SAVES_KEY), 'the list never cleared').toBe(text);
    const clearRefused = refusingKeys(FORGE_SAVES_KEY);
    clearRefused.data.set(FORGE_SAVES_KEY, text);
    expect(setAsideSaves(clearRefused), 'kept aside, but the list still unreadable').toBe(false);
    expect(clearRefused.data.get(FORGE_SAVES_ASIDE_KEY)).toBe(text);
    expect(clearRefused.data.get(FORGE_SAVES_KEY)).toBe(text);
    const saves = saveNamed([], 'Yard', recordOfLayout(layout(), 'Yard'), 1, 'id-1').saves;
    expect(writeSaves(saves, refusingKeys(FORGE_SAVES_KEY)), 'a refused write is not saved').toBe(false);
    expect(writeSaves(saves, { get: () => null, set: () => ({ ok: false }) })).toBe(false);
  });
});

