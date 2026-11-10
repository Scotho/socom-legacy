import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { EMPTY_STORED_STATE, MODELS_ENABLED_KEY, PACKS_ENABLED_KEY, modsStateStore, parseStoredModsState, type PackFlags, type StoredModsState } from '../src/packs/modsState';
import { collectOnHint } from '../src/packs/pagePacks';
import { idbPackDatabase } from '../src/packs/storage';
import { readModelSwitches, switchedModelPlans } from '../src/modelPackRuntime';

/**
 * B206 ML-10 batch review F2 (plan 2026-11-06-mods-loader, ML.R9, ML.R14; product track, ML.R2): the MODS model-pack
 * switch is honoured and stays the model packs' own -- an off slot is not mounted by the test room's model runtime, and
 * a model slot on alone never sets the texture registry's hint (`PACKS_ENABLED_KEY`), so `collectOnHint` leaves the
 * registry inert on a page with no texture pack chosen. The model slots have their own hint (`MODELS_ENABLED_KEY`), so
 * the record still opens for them.
 */
const flagsOf = (): PackFlags & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); }, remove: (k) => { map.delete(k); } };
};
const HD = `hd:${'a'.repeat(64)}`;
const registry = (): { collected: number; collect(): void } => ({ collected: 0, collect() { this.collected++; } });

describe('ML-10 F2: a model slot on alone does not wake the texture registry', () => {
  it('sets the models hint, not the texture hint, and the registry stays inert', async () => {
    const flags = flagsOf(), store = modsStateStore(idbPackDatabase(((f) => () => f)(new IDBFactory())), flags, () => null);
    await store.write((s) => ({ ...s, models: { primary: true, second: false } }));
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBeUndefined();
    expect(flags.map.get(MODELS_ENABLED_KEY)).toBe('1');
    const r = registry(); collectOnHint(flags, r); expect(r.collected).toBe(0);
    // The record still opens for the model slots (their own hint).
    expect((await store.read()).models).toEqual({ primary: true, second: false });
    // A texture pack chosen wakes it; both cleared, neither hint stays.
    await store.write((s) => ({ ...s, texture: HD }));
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBe('1');
    collectOnHint(flags, r); expect(r.collected).toBe(1);
    await store.write((s) => ({ ...s, texture: null, models: { primary: false, second: false } }));
    expect(flags.map.has(PACKS_ENABLED_KEY)).toBe(false);
    expect(flags.map.has(MODELS_ENABLED_KEY)).toBe(false);
  });
  it('an older hint set by a model slot alone is put right at the next read', async () => {
    const factory = new IDBFactory(), flags = flagsOf(), store = modsStateStore(idbPackDatabase(() => factory), flags, () => null);
    await store.write((s) => ({ ...s, models: { primary: false, second: true } }));
    flags.map.delete(MODELS_ENABLED_KEY); flags.map.set(PACKS_ENABLED_KEY, '1');   // the hint as ML-1 wrote it
    expect((await store.read()).models).toEqual({ primary: false, second: true });
    expect(flags.map.has(PACKS_ENABLED_KEY)).toBe(false);
    expect(flags.map.get(MODELS_ENABLED_KEY)).toBe('1');
  });
});

describe('ML-10 merge review F1: a read never clears a hint another page set after it read', () => {
  it("tab A's boot read of the old record leaves the texture hint tab B set before A's continuation", async () => {
    const factory = new IDBFactory(), flags = flagsOf(), real = idbPackDatabase(() => factory);
    const b = modsStateStore(real, flags, () => null);
    await b.write((s) => ({ ...s, models: { primary: true, second: false } }));   // A's boot reads: a hint is set
    // Tab A's database: its read completes with the old record, then tab B's choice commits before A's continuation.
    const interleaved = { ...real, async read<T>(...args: Parameters<typeof real.read<T>>) {
      const old = await real.read<T>(...args);
      await b.write((s) => ({ ...s, texture: HD }));
      return old;
    } } as typeof real;
    const a = modsStateStore(interleaved, flags, () => null);
    expect((await a.read()).texture).toBeNull();                 // A read the record before B's choice
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBe('1');          // B's hint survives A's read
    expect((await modsStateStore(real, flags, () => null).read()).texture).toBe(HD);   // every page still reads the choice
  });
});

describe('LATER 773: two pages writing at once leave each hint matching the final record', () => {
  // Two stores over one backing map (the origin's localStorage) and one database. Page A's write commits first; page B's
  // write commits before A's continuation runs -- the order an `await` allows two tabs.
  const race = async (first: (s: StoredModsState) => StoredModsState, second: (s: StoredModsState) => StoredModsState,
    seed: (s: StoredModsState) => StoredModsState) => {
    const factory = new IDBFactory(), flags = flagsOf(), real = idbPackDatabase(() => factory);
    const b = modsStateStore(real, flags, () => null);
    await b.write(seed);
    const interleaved = { ...real, async update<T>(...args: Parameters<typeof real.update<T>>) {
      const committed = await real.update<T>(...args);
      await b.write(second);                                   // B commits after A, before A's continuation
      return committed;
    } } as typeof real;
    await modsStateStore(interleaved, flags, () => null).write(first);
    const record = parseStoredModsState((await real.read<StoredModsState>('state', async () => EMPTY_STORED_STATE)).data);
    return { flags, record };
  };
  it('Original in A, the HD pack in B: the texture hint stays with the HD record', async () => {
    const { flags, record } = await race((s) => ({ ...s, texture: null }), (s) => ({ ...s, texture: HD }), (s) => ({ ...s, texture: HD }));
    expect(record.texture).toBe(HD);
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBe('1');
  });
  it('the HD pack in A, Original in B: no texture hint over the Original record', async () => {
    const { flags, record } = await race((s) => ({ ...s, texture: HD }), (s) => ({ ...s, texture: null }), (s) => s);
    expect(record.texture).toBeNull();
    expect(flags.map.has(PACKS_ENABLED_KEY)).toBe(false);
  });
  it('a slot off in A, on in B: the models hint stays with the record', async () => {
    const on = (s: StoredModsState) => ({ ...s, models: { primary: true, second: false } });
    const { flags, record } = await race((s) => ({ ...s, models: { primary: false, second: false } }), on, on);
    expect(record.models.primary).toBe(true);
    expect(flags.map.get(MODELS_ENABLED_KEY)).toBe('1');
  });
  it('a failed write puts back the hint its committed record calls for', async () => {
    const factory = new IDBFactory(), flags = flagsOf(), real = idbPackDatabase(() => factory);
    const store = modsStateStore(real, flags, () => null);
    await store.write((s) => ({ ...s, texture: HD }));
    const failing = { ...real, async update<T>(kind: Parameters<typeof real.update<T>>[0], legacy: () => Promise<T>, edit: (d: T) => T) {
      return real.update<T>(kind, legacy, (d) => { edit(d); throw new Error('the transaction aborts'); });
    } } as typeof real;
    await expect(modsStateStore(failing, flags, () => null).write((s) => ({ ...s, texture: null }))).rejects.toThrow();
    expect((await store.read()).texture).toBe(HD);
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBe('1');
  });
});

describe('ML-10 F2: the model runtime honours the MODS switch', () => {
  const plan = { bytes: 10 } as const;
  it('mounts only the slots switched on', () => {
    expect(switchedModelPlans({ primary: plan, second: plan }, { primary: false, second: true })).toEqual({ primary: null, second: plan });
    expect(switchedModelPlans({ primary: plan, second: null }, { primary: true, second: true })).toEqual({ primary: plan, second: null });
    expect(switchedModelPlans({ primary: plan, second: plan }, { primary: false, second: false })).toEqual({ primary: null, second: null });
  });
  it('reads the switches from the MODS record, every slot off when it cannot be read', async () => {
    const flags = flagsOf(), store = modsStateStore(idbPackDatabase(((f) => () => f)(new IDBFactory())), flags, () => null);
    expect(await readModelSwitches(store)).toEqual({ primary: false, second: false });   // nothing kept: off, nothing opened
    await store.write((s) => ({ ...s, models: { primary: true, second: false } }));
    expect(await readModelSwitches(store)).toEqual({ primary: true, second: false });
    expect(await readModelSwitches({ read: () => Promise.reject(new Error('no IndexedDB')) })).toEqual({ primary: false, second: false });
  });
  it('mountModelPack restores only the switched-on plans (the source reads the switches before the restore)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/modelPackRuntime.ts', import.meta.url), 'utf8');
    const at = src.indexOf('export async function mountModelPack(');
    const body = src.slice(at, src.indexOf('\n}\n', at));
    expect(body).toMatch(/switchedModelPlans\(read, await readModelSwitches\(\)\)/);
    expect(body.indexOf('switchedModelPlans(')).toBeLessThan(body.indexOf('loadSaved(plans.primary'));
  });
});
