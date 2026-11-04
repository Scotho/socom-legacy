import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { expect, vi } from 'vitest';
import { FORGE_SAVES_KEY, readSaveList, writeSaves, type NamedSave } from '../../src/forge/saves';
import { SavesStore, type SavesStoreName } from '../../src/forge/savesStore';

/**
 * R3-B (FCW-07a part 2): the mounted page keeps its lists in IndexedDB (`../../src/forge/savesStore`); a page test gives
 * it a fresh `fake-indexeddb` (the declared dev dependency) and reads or writes the lists as another writer would -- a
 * second tab, the registry's map adapter -- through the store, by its compare-and-swap.
 */
export function freshSavesDb(): IDBFactory {
  const factory = new FakeFactory();
  vi.stubGlobal('indexedDB', factory);
  return factory;
}

async function opened<T>(run: (s: SavesStore) => Promise<T>): Promise<T> {
  const s = new SavesStore(globalThis.indexedDB);
  await s.open();
  try { return await run(s); } finally { s.close(); }
}

/** A list as the store holds it now. */
export const readStoredList = (name: SavesStoreName): Promise<{ generation: number; text: string | null }> => opened((s) => s.read(name));

/** The named saves as the store holds them now. */
export async function storedSaves(): Promise<NamedSave[]> {
  const { text } = await readStoredList('saves');
  return readSaveList({ get: () => text, set: () => undefined }).saves;
}

/** Another writer changes the named saves (from the generation it read); the page hears of it by `refreshExternalState`. */
export async function writeStoredSaves(change: (saves: NamedSave[]) => NamedSave[]): Promise<void> {
  await opened(async (s) => {
    const now = await s.read('saves');
    const list = readSaveList({ get: () => now.text, set: () => undefined }).saves;
    const kept = new Map<string, string>();
    expect(writeSaves(change(list), { get: (k) => kept.get(k) ?? null, set: (k, v) => { kept.set(k, v); } })).toBe(true);
    expect(await s.write('saves', kept.get(FORGE_SAVES_KEY)!, now.generation)).toBe('written');
  });
}
