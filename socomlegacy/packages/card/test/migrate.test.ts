import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  CardExtStore, CardSlots, IdbStore, MemoryStore, MIGRATION_EXT, MP_NAME_IMPORTED, MP_NAME_KEY, PERSONA_NAME_MAX, migrateOnce, migrateOnceSync, migrationMarker,
  mpNameMigration, Settings, StoreError, type ByteStore, type Migration, type SettingsStorage,
} from '../src/index';

/**
 * The run-once import of an old localStorage key into the card's store (W6.R5, the owner 2026-10-01: keys migrate; an
 * old key is read once and left in place). The two keys that change home are OPT-04's (`s2u.mp.name`) and OPT-20's
 * (`s2u.armory.v1.*`); this suite proves the mechanism on a stand-in key shaped like them.
 */

const LEGACY = 's2u.test.legacyName';
const TARGET = 'persona/name';
const text = new TextEncoder(), untext = new TextDecoder();

/** The stand-in: printable ASCII, 1-30 characters (the MP name's own rule, `main.ts` W3.R12), into one store record. */
const nameMigration: Migration<string> = {
  from: LEGACY,
  parse: (raw) => (/^[\x20-\x7e]{1,30}$/.test(raw) ? raw : undefined),
  ops: (name) => [{ put: TARGET, value: text.encode(name) }],
};

function legacyStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Map<string, string>; broken: boolean } {
  const data = new Map(Object.entries(initial));
  const s = {
    data,
    broken: false,
    getItem: (k: string) => { if (s.broken) throw new DOMException('refused', 'SecurityError'); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (s.broken) throw new DOMException('refused', 'SecurityError'); data.set(k, v); },
    removeItem: (k: string) => { if (s.broken) throw new DOMException('refused', 'SecurityError'); data.delete(k); },
  };
  return s;
}

const settingsOver = (storage: SettingsStorage): Settings => new Settings(() => storage, () => undefined);
const name = async (store: MemoryStore): Promise<string | undefined> => {
  const v = await store.get(TARGET);
  return v ? untext.decode(v) : undefined;
};

describe('migrateOnce: an old key, read once into the store, left in place', () => {
  it('present: imported, and the old key left exactly as it was', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const store = new MemoryStore();
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'imported' });
    expect(await name(store)).toBe('Craig');
    expect(legacy.data.get(LEGACY)).toBe('Craig');
    expect([...legacy.data.keys()]).toEqual([LEGACY]);
    expect(await store.keys()).toEqual([migrationMarker(LEGACY), TARGET].sort());
  });

  it('run once: a second load does not import the old key again over newer state', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const store = new MemoryStore();
    await migrateOnce(settingsOver(legacy), store, nameMigration);
    await store.put(TARGET, text.encode('Craig II'));                    // the player renamed after the import
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'already' });
    expect(await name(store)).toBe('Craig II');
    expect(legacy.data.get(LEGACY)).toBe('Craig');                       // still in place
  });

  it('absent: nothing imported, and the run is spent (a key an old tab writes later is not imported)', async () => {
    const legacy = legacyStorage();
    const store = new MemoryStore();
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'absent' });
    expect(await name(store)).toBeUndefined();
    legacy.data.set(LEGACY, 'Late');
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'already' });
    expect(await name(store)).toBeUndefined();
  });

  it('malformed: nothing imported, the old key left in place, the run spent', async () => {
    for (const raw of ['', 'x'.repeat(31), 'tab\there', 'café']) {
      const legacy = legacyStorage({ [LEGACY]: raw });
      const store = new MemoryStore();
      expect(await migrateOnce(settingsOver(legacy), store, nameMigration), JSON.stringify(raw)).toEqual({ outcome: 'malformed' });
      expect(await name(store)).toBeUndefined();
      expect(legacy.data.get(LEGACY)).toBe(raw);
      expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'already' });
    }
  });

  it('the old storage throwing: nothing imported, the run not spent, so a later load imports', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    legacy.broken = true;
    const store = new MemoryStore();
    const first = await migrateOnce(settingsOver(legacy), store, nameMigration);
    expect(first.outcome).toBe('unreadable');
    if (first.outcome === 'unreadable') expect(first.error).toBeInstanceOf(StoreError);
    expect(await store.keys()).toEqual([]);
    legacy.broken = false;
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'imported' });
    expect(await name(store)).toBe('Craig');
  });

  it('the store refusing the write: reported as failed, nothing half-written, and a later load imports', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    let refuse = true;
    const store = new MemoryStore({ fail: (op) => (refuse && op === 'write' ? new DOMException('full', 'QuotaExceededError') : undefined) });
    const first = await migrateOnce(settingsOver(legacy), store, nameMigration);
    expect(first.outcome).toBe('failed');
    if (first.outcome === 'failed') expect(first.error).toMatchObject({ kind: 'quota', operation: 'write' });
    expect(await store.keys()).toEqual([]);
    refuse = false;
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'imported' });
  });

  it('the value and the run\'s mark land together: a fault on the mark leaves neither', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const store = new MemoryStore({ fail: (op, key) => (op === 'write' && key === migrationMarker(LEGACY) ? new Error('killed') : undefined) });
    expect((await migrateOnce(settingsOver(legacy), store, nameMigration)).outcome).toBe('failed');
    expect(await store.keys()).toEqual([]);
  });

  it('the store unreadable (the mark cannot be read): no import, since it might be over newer state', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const store = new MemoryStore({ fail: (op) => (op === 'get' ? new Error('unreadable') : undefined) });
    const result = await migrateOnce(settingsOver(legacy), store, nameMigration);
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.error).toMatchObject({ operation: 'get' });
    expect(await store.keys()).toEqual([]);
  });

  it('a parse that throws is the malformed outcome: nothing imported, the run spent, no rejection', async () => {
    const legacy = legacyStorage({ [LEGACY]: '{bad' });
    const store = new MemoryStore();
    const json: Migration<unknown> = { from: LEGACY, parse: (raw) => JSON.parse(raw) as unknown, ops: () => [{ put: TARGET, value: text.encode('x') }] };
    expect(await migrateOnce(settingsOver(legacy), store, json)).toEqual({ outcome: 'malformed' });
    expect(await store.keys()).toEqual([migrationMarker(LEGACY)]);
    expect(legacy.data.get(LEGACY)).toBe('{bad');
    expect(await migrateOnce(settingsOver(legacy), store, json)).toEqual({ outcome: 'already' });
  });

  it('an ops that throws is a bug in the migration itself: reported with its error, and the run is not spent', async () => {
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const store = new MemoryStore();
    const bug = new Error('ops is broken');
    const broken: Migration<string> = { ...nameMigration, ops: () => { throw bug; } };
    const first = await migrateOnce(settingsOver(legacy), store, broken);
    expect(first).toEqual({ outcome: 'broken', error: bug });
    expect(await store.keys()).toEqual([]);
    expect(legacy.data.get(LEGACY)).toBe('Craig');
    expect(await migrateOnce(settingsOver(legacy), store, nameMigration)).toEqual({ outcome: 'imported' });   // fixed next load
  });

  it('two tabs at once: one imports, the other finds the run spent -- never the old value over a newer one', async () => {
    const factory = new FakeFactory() as unknown as IDBFactory;
    const legacy = legacyStorage({ [LEGACY]: 'Craig' });
    const tabA = new IdbStore(factory), realB = new IdbStore(factory);
    // Tab B reads the mark (absent), then stalls before its write until the gate opens.
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    let stalled!: () => void;
    const reached = new Promise<void>((r) => { stalled = r; });
    const tabB: ByteStore = Object.assign(Object.create(realB) as ByteStore, {
      read: (k: string) => realB.read(k),
      write: async (...args: Parameters<ByteStore['write']>) => { stalled(); await gate; return realB.write(...args); },
    });
    const b = migrateOnce(settingsOver(legacy), tabB, nameMigration);
    await reached;
    expect(await migrateOnce(settingsOver(legacy), tabA, nameMigration)).toEqual({ outcome: 'imported' });
    await tabA.put(TARGET, text.encode('Craig II'));                     // tab A's player renames
    open();
    expect(await b).toEqual({ outcome: 'already' });
    expect(untext.decode((await tabA.get(TARGET))!)).toBe('Craig II');
    expect(legacy.data.get(LEGACY)).toBe('Craig');
  });
});

/**
 * OPT-04 (research 229 §5; research 135 §6 struck): the MP name's own run. The old key `s2u.mp.name` (W3.R12's settings
 * field, `main.ts`) is read once into the card slot's `ext` -- redotcom's own data beside the card, never a key of the
 * save file (R7's ext rule, research 229 §4) -- as the NAME the persona form's first record takes (`personaHost.ts`
 * seeds the account list from it at the form, `FUN_002fbce0`'s append). The key is left in place (W6.R5).
 */
describe('the MP name into the card (OPT-04): migrateOnce over the slot\'s ext', () => {
  const slotOf = () => {
    const storage = new Map<string, string>();
    const writes: string[] = [];
    const slots = new CardSlots(() => ({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { writes.push(v); storage.set(k, v); } }), () => undefined, { now: () => 5_000 });
    return { slot: slots.slot(1), slots, writes };
  };
  const pending = (store: CardExtStore): string | undefined => {
    const v = store.peek(MP_NAME_IMPORTED);
    return v ? untext.decode(v) : undefined;
  };

  it('a page with the old key and no persona: the name imported, cut at 14 (PERSONA_NAME_MAX); the old key left in place; a second run does nothing', async () => {
    const legacy = legacyStorage({ [MP_NAME_KEY]: 'Lieutenant Commander' });
    const { slot } = slotOf();
    const store = new CardExtStore(slot);
    expect(MP_NAME_KEY).toBe('s2u.mp.name');
    expect(await migrateOnce(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'imported' });
    expect(pending(store)).toBe('Lieutenant Com');
    expect(pending(store)).toHaveLength(PERSONA_NAME_MAX);
    expect(legacy.data.get(MP_NAME_KEY)).toBe('Lieutenant Commander');
    expect(slot.extNames()).toEqual([MIGRATION_EXT]);
    expect(slot.list('')).toMatchObject({ ok: true, value: [] });   // no file, no folder: the save file is the original's to write
    legacy.data.set(MP_NAME_KEY, 'Renamed');
    expect(await migrateOnce(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'already' });
    expect(pending(store)).toBe('Lieutenant Com');
  });

  it('a cut that ends on a space is trimmed: the form\'s own path never makes such a name (PruneUIVarSpaces)', async () => {
    const store = new CardExtStore(slotOf().slot);
    expect(await migrateOnce(settingsOver(legacyStorage({ [MP_NAME_KEY]: 'Seal Team Six A' })), store, mpNameMigration(false))).toEqual({ outcome: 'imported' });
    expect(pending(store)).toBe('Seal Team Six');
  });

  it('a page whose card holds a persona keeps its list: the run is spent, no name imported', async () => {
    const legacy = legacyStorage({ [MP_NAME_KEY]: 'Craig' });
    const store = new CardExtStore(slotOf().slot);
    expect(await migrateOnce(settingsOver(legacy), store, mpNameMigration(true))).toEqual({ outcome: 'imported' });
    expect(pending(store)).toBeUndefined();
    expect(store.peek(migrationMarker(MP_NAME_KEY))).toBeDefined();
  });

  it('no key, or a name the field would not have written (blank, past 30, not printable ASCII): nothing imported, the run spent', async () => {
    for (const raw of [null, '', '   ', 'x'.repeat(31), 'café']) {
      const legacy = legacyStorage(raw === null ? {} : { [MP_NAME_KEY]: raw });
      const store = new CardExtStore(slotOf().slot);
      expect((await migrateOnce(settingsOver(legacy), store, mpNameMigration(false))).outcome, JSON.stringify(raw)).toBe(raw === null ? 'absent' : 'malformed');
      expect(pending(store)).toBeUndefined();
      expect(await migrateOnce(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'already' });
    }
  });

  it('CardExtStore: the write is conditional in its own step -- a mark another tab left is a conflict, nothing written; no storage is a failure, nothing spent', async () => {
    const { slot } = slotOf();
    const store = new CardExtStore(slot);
    const mark = migrationMarker(MP_NAME_KEY);
    await store.write([{ put: mark, value: Uint8Array.of(1) }], [{ key: mark, absent: true }]);
    await expect(store.write([{ put: MP_NAME_IMPORTED, value: text.encode('late') }, { put: mark, value: Uint8Array.of(1) }], [{ key: mark, absent: true }]))
      .rejects.toMatchObject({ kind: 'conflict', operation: 'write', key: mark });
    expect(store.peek(MP_NAME_IMPORTED)).toBeUndefined();
    await store.write([{ delete: mark }]);
    expect(await store.read(mark)).toEqual({ ok: true, value: undefined });
    const legacy = legacyStorage({ [MP_NAME_KEY]: 'Craig' });
    const none = new CardExtStore(new CardSlots(() => null, () => undefined).slot(1));
    expect((await migrateOnce(settingsOver(legacy), none, mpNameMigration(false))).outcome).toBe('failed');
    expect(await migrateOnce(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'imported' });
  });

  it('migrateOnceSync: the same run settled before it returns -- the name in ext with nothing awaited; the same outcomes as migrateOnce for every input', async () => {
    const legacy = legacyStorage({ [MP_NAME_KEY]: 'Lieutenant Commander' });
    const store = new CardExtStore(slotOf().slot);
    expect(migrateOnceSync(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'imported' });
    expect(pending(store)).toBe('Lieutenant Com');                    // read in the same turn: the persona form's deep link (personaHost.ts)
    expect(migrateOnceSync(settingsOver(legacy), store, mpNameMigration(false))).toEqual({ outcome: 'already' });
    for (const [raw, persona] of [[null, false], ['', false], ['x'.repeat(31), false], ['Craig', false], ['Craig', true]] as const) {
      const old = legacyStorage(raw === null ? {} : { [MP_NAME_KEY]: raw });
      const a = new CardExtStore(slotOf().slot), b = new CardExtStore(slotOf().slot);
      expect(migrateOnceSync(settingsOver(old), a, mpNameMigration(persona)), JSON.stringify([raw, persona])).toEqual(await migrateOnce(settingsOver(old), b, mpNameMigration(persona)));
      expect(pending(a)).toBe(pending(b));
    }
    const none = new CardExtStore(new CardSlots(() => null, () => undefined).slot(1));
    expect(migrateOnceSync(settingsOver(legacy), none, mpNameMigration(false)).outcome).toBe('failed');
    const broken = legacyStorage({ [MP_NAME_KEY]: 'Craig' });
    broken.broken = true;
    expect(migrateOnceSync(settingsOver(broken), new CardExtStore(slotOf().slot), mpNameMigration(false)).outcome).toBe('unreadable');
  });

  it('never writes the old storage: no key set or removed by any run', async () => {
    const legacy = legacyStorage({ [MP_NAME_KEY]: 'Craig', other: 'x' });
    const before = [...legacy.data.entries()];
    await migrateOnce(settingsOver(legacy), new CardExtStore(slotOf().slot), mpNameMigration(false));
    expect([...legacy.data.entries()]).toEqual(before);
  });
});
