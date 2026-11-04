import { describe, expect, it } from 'vitest';
import {
  CARD_CLUSTER_BYTES, CARD_NAMES_CASE_SENSITIVE_READING, CARD_SLOT_KEYS, CARD_TOTAL_CLUSTERS, CardSlots, clustersFor,
  EXT_NAMESPACE_MAX_CHARS, EXT_TOTAL_MAX_CHARS, StoreError, type CardStorage, type SlotNumber,
} from '../src/index';

/**
 * PLAT-25 as R7 rewrote it (the R7 spec §3 and §7; research 99): two virtual memory-card slots, one JSON record per
 * slot on a `Storage`, free space against the virtual 8 MB card, atomic `setItem`, the card's states, corrupt and
 * no-storage readings, `ext` and `rev`, and the file table PLAT-26 stands on. The `Storage` here is a stand-in built in
 * the test (a map with faults to inject), as `localStorage` is to the page.
 */

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  failGet?: (key: string) => unknown;
  failSet?: (key: string) => unknown;
  sets = 0;
  getItem(key: string): string | null {
    const e = this.failGet?.(key);
    if (e !== undefined) throw e;
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const e = this.failSet?.(key);
    if (e !== undefined) throw e;
    this.sets++;
    this.data.set(key, String(value));
  }
}

function setup(storage = new MemoryStorage()) {
  const heard: StoreError[] = [];
  let clock = 1_000;
  const slots = new CardSlots(() => storage, (e) => heard.push(e), { now: () => clock++ });
  return { storage, heard, slots };
}

const DIR = 'BASCUS-97275SOCOMII';
const KEY1 = 's2u.card.v1.slot1';

/** The options save's 12 files and their sizes (`logs/parity/f0/mc0/BASCUS-97275SOCOMII/`, names and sizes only). */
const SAVE_FILES: readonly (readonly [string, number])[] = [
  ['BASCUS-97275SOCOMII', 4_784], ['icon.sys', 964], ['LIST.ICO', 50_234], ['PATCHFILE.DAT', 2_048_000],
  ['SaveGame0', 1_952], ['SaveGame1', 1_952], ['SaveGame2', 1_952], ['SaveGame3', 1_952], ['SaveGame4', 1_952],
  ['SaveGame5', 1_952], ['SaveGame6', 1_952], ['SCRATCHPAD.DAT', 944_128],
];

/** Unwraps an ok result's revision, failing the test on a refusal. */
function rev(result: { ok: true; rev: number } | { ok: false; failure: unknown }): number {
  if (!result.ok) throw new Error('refused: ' + JSON.stringify(result.failure));
  return result.rev;
}

describe('the slots: keys, the fresh card, round trips', () => {
  it('has two slots under their own keys', () => {
    expect(CARD_SLOT_KEYS).toEqual(['s2u.card.v1.slot1', 's2u.card.v1.slot2']);
  });

  it('a missing key is a fresh card: inserted, formatted, empty, "free 8000" -- and reading it writes nothing', () => {
    const { storage, slots } = setup();
    for (const n of [1, 2] as const) {
      expect(slots.slot(n).info()).toEqual({ state: 'formatted', rev: 0, freeClusters: 8000, usedClusters: 0 });
      expect(slots.slot(n).list('')).toEqual({ ok: true, rev: 0, value: [] });
    }
    expect(storage.data.size).toBe(0);
    expect(storage.sets).toBe(0);
  });

  it('a record round-trips: what is written is read back, and the stored record is the versioned shape', () => {
    const { storage, slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    expect(r).toBe(1);
    r = rev(card.writeFile(`${DIR}/SaveGame0`, 1_952, { persona: 'socomc', valves: [1, 2, 3] }, r));
    expect(r).toBe(2);
    expect(card.readFile(`${DIR}/SaveGame0`)).toEqual({
      ok: true, rev: 2, value: { size: 1_952, mtime: expect.any(Number), data: { persona: 'socomc', valves: [1, 2, 3] } },
    });
    const stored = JSON.parse(storage.data.get(KEY1)!);
    expect(stored).toMatchObject({ v: 1, rev: 2, present: true, formatted: true, ext: {} });
    expect(Object.keys(stored.files)).toEqual([`${DIR}/SaveGame0`]);
    expect(Object.keys(stored.dirs)).toEqual([DIR]);
  });

  it('keeps the two slots apart', () => {
    const { storage, slots } = setup();
    rev(slots.slot(1).writeFile('a', 10, 'one', 0));
    rev(slots.slot(2).writeFile('a', 20, 'two', 0));
    expect(slots.slot(1).readFile('a')).toMatchObject({ ok: true, value: { size: 10, data: 'one' } });
    expect(slots.slot(2).readFile('a')).toMatchObject({ ok: true, value: { size: 20, data: 'two' } });
    rev(slots.slot(1).writeFile('b', 1, null, 1));
    expect(slots.slot(2).stat('b')).toMatchObject({ ok: false, failure: { kind: 'no-entry', path: 'b' } });
    expect([...storage.data.keys()].sort()).toEqual([...CARD_SLOT_KEYS]);
  });

  it('a reload (a second instance over the same storage) reads the same slot', () => {
    const { storage, slots } = setup();
    rev(slots.slot(2).makeDir(DIR, 0));
    rev(slots.slot(2).writeFile(`${DIR}/icon.sys`, 964, { icon: true }, 1));
    const again = new CardSlots(() => storage, () => undefined);
    expect(again.slot(2).info()).toEqual({ state: 'formatted', rev: 2, freeClusters: 8000 - 1 - 1, usedClusters: 2 });
    expect(again.slot(2).readFile(`${DIR}/icon.sys`)).toMatchObject({ ok: true, rev: 2, value: { size: 964, data: { icon: true } } });
    expect(again.slot(1).info()).toMatchObject({ state: 'formatted', rev: 0 });
  });

  it('copies the data at the call: changing the caller\'s object afterwards changes nothing stored', () => {
    const { slots } = setup();
    const data = { list: [1] };
    rev(slots.slot(1).writeFile('f', 1, data, 0));
    data.list.push(2);
    const read = slots.slot(1).readFile('f');
    expect(read).toMatchObject({ ok: true, value: { data: { list: [1] } } });
    if (read.ok) (read.value.data as { list: number[] }).list.push(9);
    expect(slots.slot(1).readFile('f')).toMatchObject({ ok: true, value: { data: { list: [1] } } });
  });
});

describe('atomic saves: one setItem, a throwing one writes nothing and is reported', () => {
  it.each([
    ['QuotaExceededError', 'quota'],
    ['SecurityError', 'unavailable'],
    ['Error', 'failed'],
  ] as const)('a %s from setItem leaves the previous record byte-equal and is reported as %s', (name, kind) => {
    const { storage, heard, slots } = setup();
    rev(slots.slot(1).makeDir(DIR, 0));
    rev(slots.slot(1).writeFile(`${DIR}/SaveGame0`, 1_952, { n: 1 }, 1));
    const before = storage.data.get(KEY1);
    const setsBefore = storage.sets;
    storage.failSet = () => new DOMException('refused', name);
    const result = slots.slot(1).writeFile(`${DIR}/SaveGame1`, 1_952, { n: 2 }, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('write-failed');
    if (result.failure.kind !== 'write-failed') return;
    expect(result.failure.error).toBeInstanceOf(StoreError);
    expect(result.failure.error).toMatchObject({ kind, operation: 'write', key: KEY1 });
    expect(heard).toEqual([result.failure.error]);
    expect(storage.data.get(KEY1)).toBe(before);
    expect(storage.sets).toBe(setsBefore);
    storage.failSet = undefined;
    expect(slots.slot(1).info()).toMatchObject({ state: 'formatted', rev: 2 });
    expect(slots.slot(1).stat(`${DIR}/SaveGame1`)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
  });

  it('every kind of save goes through the same reported path (unformat, remove, ext)', () => {
    const { storage, heard, slots } = setup();
    storage.failSet = () => new DOMException('full', 'QuotaExceededError');
    const card = slots.slot(2);
    expect(card.unformat(0)).toMatchObject({ ok: false, failure: { kind: 'write-failed' } });
    expect(card.remove(0)).toMatchObject({ ok: false, failure: { kind: 'write-failed' } });
    expect(card.setExt('s2u.test', 1, 0)).toMatchObject({ ok: false, failure: { kind: 'write-failed' } });
    expect(heard.map((e) => [e.kind, e.key])).toEqual([
      ['quota', 's2u.card.v1.slot2'], ['quota', 's2u.card.v1.slot2'], ['quota', 's2u.card.v1.slot2'],
    ]);
    expect(storage.data.size).toBe(0);
  });
});

describe('free space against the virtual 8 MB card (the stub\'s mcUsedClusters)', () => {
  it('reads the stub\'s constants: 8000 clusters of 1 KB', () => {
    expect(CARD_TOTAL_CLUSTERS).toBe(8000);
    expect(CARD_CLUSTER_BYTES).toBe(1024);
    expect([0, 1, 1023, 1024, 1025, 2048, 2_048_000].map(clustersFor)).toEqual([0, 1, 1, 1, 2, 2, 2000]);
  });

  it('falls by each file\'s nominal size rounded up to clusters, and by one cluster per directory', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    expect(card.info()).toMatchObject({ freeClusters: 7999, usedClusters: 1 });
    r = rev(card.writeFile(`${DIR}/empty`, 0, null, r));
    expect(card.info()).toMatchObject({ freeClusters: 7999 });
    r = rev(card.writeFile(`${DIR}/one`, 1, null, r));
    expect(card.info()).toMatchObject({ freeClusters: 7998 });
    r = rev(card.writeFile(`${DIR}/two`, 1_025, null, r));
    expect(card.info()).toMatchObject({ freeClusters: 7996 });
    r = rev(card.writeFile(`${DIR}/two`, 1_024, null, r));          // a replace frees what it no longer needs
    expect(card.info()).toMatchObject({ freeClusters: 7997 });
    rev(card.deleteFile(`${DIR}/two`, r));
    expect(card.info()).toMatchObject({ freeClusters: 7998 });
  });

  it('the options save\'s 12 files take 2,992 clusters, 2,993 with their folder', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    for (const [name, size] of SAVE_FILES) r = rev(card.writeFile(`${DIR}/${name}`, size, {}, r));
    expect(card.info()).toEqual({ state: 'formatted', rev: 13, freeClusters: 8000 - 2_993, usedClusters: 2_993 });
  });

  it('"At least 3000KB is needed": a table of nominal files brings the card under 3000 free', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.writeFile('filler', 5_001 * 1024, null, 0));
    expect(card.info()).toMatchObject({ freeClusters: 2_999 });
    expect((card.info() as { freeClusters: number }).freeClusters < 3000).toBe(true);
    r = rev(card.writeFile('filler', 5_000 * 1024, null, r));
    expect(card.info()).toMatchObject({ freeClusters: 3_000 });
  });

  it('a write past the virtual card is refused whole as full; one that fits exactly is taken', () => {
    const { storage, slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.writeFile('a', 7_000 * 1024, null, 0));
    const before = storage.data.get(KEY1);
    expect(card.writeFile('b', 1_000 * 1024 + 1, null, r)).toEqual({ ok: false, failure: { kind: 'full', needed: 1_001, free: 1_000 } });
    expect(storage.data.get(KEY1)).toBe(before);
    expect(card.info()).toMatchObject({ rev: 1, freeClusters: 1_000 });
    // A replace counts only its growth (the stub's sceMcWrite, MemoryCard.cpp:1677-1678).
    expect(card.writeFile('a', 8_001 * 1024, null, r)).toMatchObject({ ok: false, failure: { kind: 'full', needed: 1_001, free: 1_000 } });
    r = rev(card.writeFile('a', 8_000 * 1024, null, r));
    expect(card.info()).toMatchObject({ freeClusters: 0, usedClusters: 8_000 });
    expect(card.writeFile('zero', 0, null, r)).toMatchObject({ ok: true });  // a 0-byte file takes no cluster
  });

  it('an unformatted card answers no free space, as the stub\'s GetInfo does', () => {
    const { slots } = setup();
    rev(slots.slot(1).unformat(0));
    expect(slots.slot(1).info()).toEqual({ state: 'unformatted', rev: 1 });
  });
});

describe('the card\'s states: every one reachable', () => {
  it('remove: no card, its files kept; insert: the same card back', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.writeFile('f', 2_048, 'kept', 0));
    r = rev(card.remove(r));
    expect(card.info()).toEqual({ state: 'no-card', rev: 2, why: 'removed' });
    expect(card.list('')).toEqual({ ok: false, failure: { kind: 'no-card' } });
    expect(card.writeFile('g', 1, null, r)).toEqual({ ok: false, failure: { kind: 'no-card' } });
    expect(card.format(r)).toEqual({ ok: false, failure: { kind: 'no-card' } });
    expect(card.remove(r)).toEqual({ ok: true, rev: 2, value: undefined });   // already out: nothing written
    r = rev(card.insert(r));
    expect(card.info()).toEqual({ state: 'formatted', rev: 3, freeClusters: 7998, usedClusters: 2 });
    expect(card.readFile('f')).toMatchObject({ ok: true, value: { data: 'kept' } });
    expect(card.insert(r)).toEqual({ ok: true, rev: 3, value: undefined });
  });

  it('unformat: an unformatted card, its files wiped (the stub\'s sceMcUnformat), every file operation refused', () => {
    const { slots } = setup();
    const card = slots.slot(2);
    let r = rev(card.makeDir(DIR, 0));
    r = rev(card.writeFile(`${DIR}/f`, 1, null, r));
    r = rev(card.unformat(r));
    expect(card.info()).toEqual({ state: 'unformatted', rev: 3 });
    for (const result of [card.list(''), card.stat(DIR), card.readFile(`${DIR}/f`), card.makeDir('d', r),
      card.writeFile('f', 1, null, r), card.deleteFile(`${DIR}/f`, r), card.removeDir(DIR, r)]) {
      expect(result).toEqual({ ok: false, failure: { kind: 'unformatted' } });
    }
    r = rev(card.format(r));
    expect(card.info()).toEqual({ state: 'formatted', rev: 4, freeClusters: 8000, usedClusters: 0 });
    expect(card.list('')).toEqual({ ok: true, rev: 4, value: [] });
  });

  it('format wipes the card\'s files and folders and keeps ext (not on the card)', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.setExt('s2u.page', { seen: true }, 0));
    r = rev(card.makeDir(DIR, r));
    r = rev(card.writeFile(`${DIR}/SaveGame0`, 1_952, {}, r));
    r = rev(card.format(r));
    expect(card.list('')).toEqual({ ok: true, rev: r, value: [] });
    expect(card.info()).toMatchObject({ freeClusters: 8000 });
    expect(card.getExt('s2u.page')).toEqual({ seen: true });
    r = rev(card.unformat(r));
    expect(card.getExt('s2u.page')).toEqual({ seen: true });
  });

  it('a removed card cannot be formatted or unformatted (the stub asks isMcCardPresent first)', () => {
    const { slots } = setup();
    const r = rev(slots.slot(1).remove(0));
    expect(slots.slot(1).unformat(r)).toEqual({ ok: false, failure: { kind: 'no-card' } });
  });
});

describe('a corrupt record is a present card whose save is damaged, never reset by a read', () => {
  const good = { v: 1, rev: 3, present: true, formatted: true, files: { [`${DIR}/a`]: { size: 1, mtime: 5, data: null } }, dirs: { [DIR]: { mtime: 5 } }, ext: {} };
  const variants: readonly (readonly [string, string])[] = [
    ['bad JSON', '{"v":1,'],
    ['not an object', '"card"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['an unknown v', JSON.stringify({ ...good, v: 2 })],
    ['no v', JSON.stringify({ ...good, v: undefined })],
    ['a negative rev', JSON.stringify({ ...good, rev: -1 })],
    ['a fractional rev', JSON.stringify({ ...good, rev: 1.5 })],
    ['present not a boolean', JSON.stringify({ ...good, present: 'yes' })],
    ['formatted missing', JSON.stringify({ ...good, formatted: undefined })],
    ['files an array', JSON.stringify({ ...good, files: [] })],
    ['a file without a size', JSON.stringify({ ...good, files: { [`${DIR}/a`]: { mtime: 5, data: null } } })],
    ['a negative size', JSON.stringify({ ...good, files: { [`${DIR}/a`]: { size: -1, mtime: 5, data: null } } })],
    ['a file without data', JSON.stringify({ ...good, files: { [`${DIR}/a`]: { size: 1, mtime: 5 } } })],
    ['a file whose folder is missing', JSON.stringify({ ...good, dirs: {} })],
    ['a bad path', JSON.stringify({ ...good, files: { '/abs': { size: 1, mtime: 5, data: null } } })],
    ['a name both file and folder', JSON.stringify({ ...good, dirs: { [DIR]: { mtime: 5 }, [`${DIR}/a`]: { mtime: 5 } } })],
    ['an unformatted card holding files', JSON.stringify({ ...good, formatted: false })],
    ['ext an array', JSON.stringify({ ...good, ext: [] })],
    ['dirs missing', JSON.stringify({ ...good, dirs: undefined })],
  ];

  it('the well-formed control reads as a card', () => {
    const { storage, slots } = setup();
    storage.data.set(KEY1, JSON.stringify(good));
    expect(slots.slot(1).info()).toEqual({ state: 'formatted', rev: 3, freeClusters: 7998, usedClusters: 2 });
  });

  it.each(variants)('%s: damaged, every operation but format refused, the record untouched', (_name, raw) => {
    const { storage, heard, slots } = setup();
    storage.data.set(KEY1, raw);
    const card = slots.slot(1);
    expect(card.info()).toMatchObject({ state: 'damaged', rev: null, reason: expect.any(String) });
    const damaged = { ok: false, failure: { kind: 'damaged', reason: expect.any(String) } };
    for (const result of [card.list(''), card.stat(DIR), card.readFile(`${DIR}/a`), card.makeDir('d', null),
      card.writeFile('f', 1, null, null), card.deleteFile(`${DIR}/a`, null), card.removeDir(DIR, null),
      card.insert(null), card.remove(null), card.unformat(null), card.setExt('s2u.x', 1, null)]) {
      expect(result).toMatchObject(damaged);
    }
    expect(card.getExt('s2u.x')).toBeUndefined();
    expect(storage.data.get(KEY1)).toBe(raw);
    expect(storage.sets).toBe(0);
    expect(heard).toEqual([]);
    expect(slots.slot(2).info()).toMatchObject({ state: 'formatted', rev: 0 });  // the other slot is its own card
  });

  it('format is the one way out: an explicit wipe to a fresh card, refused when another tab got there first', () => {
    const storage = new MemoryStorage();
    storage.data.set(KEY1, JSON.stringify({ ...good, v: 9, rev: 7 }));
    const card = new CardSlots(() => storage, () => undefined, { now: () => 5 }).slot(1);
    expect(card.format(0)).toEqual({ ok: false, failure: { kind: 'changed', expected: 0, found: null } });
    const r = rev(card.format(null));
    expect(r).toBe(8);                                  // past a revision still legible in the damaged record
    expect(card.info()).toEqual({ state: 'formatted', rev: 8, freeClusters: 8000, usedClusters: 0 });
    expect(card.format(null)).toEqual({ ok: false, failure: { kind: 'changed', expected: null, found: 8 } });
  });
});

describe('no storage: both slots read as no card (the controller\'s default; the owner may overturn it)', () => {
  const cases: readonly (readonly [string, () => CardStorage | null | undefined])[] = [
    ['no storage object', () => null],
    ['undefined', () => undefined],
    ['reaching it throws', () => { throw new DOMException('denied', 'SecurityError'); }],
    ['getItem throws', () => ({ getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => { throw new Error('never'); } })],
  ];

  it.each(cases)('%s', (_name, storage) => {
    const slots = new CardSlots(storage, () => undefined);
    for (const n of [1, 2] as SlotNumber[]) {
      const card = slots.slot(n);
      expect(card.info()).toMatchObject({ state: 'no-card', rev: null, why: 'no-storage' });
      expect(card.list('')).toMatchObject({ ok: false, failure: { kind: 'no-card' } });
      expect(card.writeFile('f', 1, null, 0)).toMatchObject({ ok: false, failure: { kind: 'no-card' } });
      expect(card.writeFile('f', 1, null, null)).toMatchObject({ ok: false, failure: { kind: 'no-card' } });
      expect(card.insert(null)).toMatchObject({ ok: false, failure: { kind: 'no-card' } });
      expect(card.setExt('s2u.x', 1, null)).toMatchObject({ ok: false, failure: { kind: 'no-card' } });
      expect(card.getExt('s2u.x')).toBeUndefined();
    }
  });

  it('the reading failure is carried for a caller who must tell "no card" from "could not look"', () => {
    const slots = new CardSlots(() => { throw new DOMException('denied', 'SecurityError'); }, () => undefined);
    const info = slots.slot(1).info();
    expect(info.state).toBe('no-card');
    if (info.state !== 'no-card' || info.why !== 'no-storage') throw new Error('expected no storage');
    expect(info.error).toBeInstanceOf(StoreError);
    expect(info.error).toMatchObject({ kind: 'unavailable', operation: 'get', key: KEY1 });
  });
});

describe('ext: what redotcom saves that the original never did', () => {
  it('takes no free space, shows in no listing, survives saves of files, and counts as a save (rev)', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.setExt('s2u.armory', { profile: [1, 2] }, 0));
    expect(r).toBe(1);
    expect(card.info()).toEqual({ state: 'formatted', rev: 1, freeClusters: 8000, usedClusters: 0 });
    expect(card.list('')).toEqual({ ok: true, rev: 1, value: [] });
    r = rev(card.makeDir(DIR, r));
    r = rev(card.writeFile(`${DIR}/SaveGame0`, 1_952, {}, r));
    r = rev(card.deleteFile(`${DIR}/SaveGame0`, r));
    expect(card.getExt('s2u.armory')).toEqual({ profile: [1, 2] });
    expect(card.getExt('s2u.other')).toBeUndefined();
    r = rev(card.setExt('s2u.armory', undefined, r));     // undefined clears the namespace
    expect(card.getExt('s2u.armory')).toBeUndefined();
    expect(card.extNames()).toEqual([]);
  });

  it('is readable and writable while the card is out or unformatted (it is not on the card)', () => {
    const { slots } = setup();
    const card = slots.slot(2);
    let r = rev(card.remove(0));
    r = rev(card.setExt('s2u.a', 1, r));
    r = rev(card.insert(r));
    r = rev(card.unformat(r));
    r = rev(card.setExt('s2u.b', 2, r));
    expect(card.extNames()).toEqual(['s2u.a', 's2u.b']);
  });

  it('refuses an empty namespace and a value that is not JSON', () => {
    const { storage, slots } = setup();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(slots.slot(1).setExt('', 1, 0)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(slots.slot(1).setExt('s2u.x', cyclic, 0)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(slots.slot(1).setExt('s2u.x', 10n, 0)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(storage.data.size).toBe(0);
  });
});

describe('rev: another tab\'s save is "card changed", refused whole', () => {
  it('a save carrying a stale revision is refused and the stored record is untouched', () => {
    const storage = new MemoryStorage();
    const tabA = setup(storage).slots.slot(1);
    const tabB = setup(storage).slots.slot(1);
    expect(tabA.info()).toMatchObject({ rev: 0 });
    expect(tabB.info()).toMatchObject({ rev: 0 });
    rev(tabA.writeFile('f', 1, 'A', 0));
    const after = storage.data.get(KEY1);
    for (const result of [tabB.writeFile('f', 1, 'B', 0), tabB.makeDir('d', 0), tabB.deleteFile('f', 0),
      tabB.format(0), tabB.unformat(0), tabB.remove(0), tabB.insert(0), tabB.setExt('s2u.x', 1, 0)]) {
      expect(result).toEqual({ ok: false, failure: { kind: 'changed', expected: 0, found: 1 } });
    }
    expect(storage.data.get(KEY1)).toBe(after);
    expect(tabB.readFile('f')).toMatchObject({ ok: true, rev: 1, value: { data: 'A' } });
    expect(tabB.writeFile('f', 1, 'B', 1)).toMatchObject({ ok: true, rev: 2 });
  });

  it('the revision is checked before anything else the save would refuse for', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    rev(card.remove(0));
    expect(card.writeFile('f', 1, null, 0)).toEqual({ ok: false, failure: { kind: 'changed', expected: 0, found: 1 } });
  });
});

describe('the file table PLAT-26 stands on', () => {
  function seeded() {
    const s = setup();
    const card = s.slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    r = rev(card.writeFile(`${DIR}/SaveGame1`, 1_952, 1, r));
    r = rev(card.writeFile(`${DIR}/SaveGame0`, 1_952, 0, r));
    r = rev(card.writeFile('ROOTFILE', 10, 'r', r));
    return { ...s, card, r };
  }

  it('lists a directory\'s own entries, sorted, folders and files told apart', () => {
    const { card, r } = seeded();
    expect(card.list('')).toEqual({ ok: true, rev: r, value: [
      { name: DIR, kind: 'dir', size: 0, mtime: expect.any(Number) },
      { name: 'ROOTFILE', kind: 'file', size: 10, mtime: expect.any(Number) },
    ] });
    expect(card.list(DIR)).toMatchObject({ ok: true, value: [
      { name: 'SaveGame0', kind: 'file', size: 1_952 }, { name: 'SaveGame1', kind: 'file', size: 1_952 },
    ] });
    expect(card.list('NOPE')).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NOPE' } });
    expect(card.list('ROOTFILE')).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: 'ROOTFILE', is: 'file' } });
  });

  it('stats a file, a folder and nothing there', () => {
    const { card } = seeded();
    expect(card.stat(`${DIR}/SaveGame0`)).toMatchObject({ ok: true, value: { name: 'SaveGame0', kind: 'file', size: 1_952 } });
    expect(card.stat(DIR)).toMatchObject({ ok: true, value: { name: DIR, kind: 'dir', size: 0 } });
    expect(card.stat(`${DIR}/SaveGame9`)).toEqual({ ok: false, failure: { kind: 'no-entry', path: `${DIR}/SaveGame9` } });
  });

  it('reads a file\'s data; a folder or nothing there is refused', () => {
    const { card } = seeded();
    expect(card.readFile(`${DIR}/SaveGame1`)).toMatchObject({ ok: true, value: { data: 1 } });
    expect(card.readFile(DIR)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: DIR, is: 'dir' } });
    expect(card.readFile('x')).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'x' } });
  });

  it('writes create or replace; a missing folder is no entry; over a folder is the wrong kind', () => {
    const s = seeded();
    const { card, storage } = s;
    let r = s.r;
    expect(card.writeFile(`${DIR}/SaveGame0`, 100, 'new', r)).toMatchObject({ ok: true, rev: r + 1, value: { created: false } });
    r += 1;
    expect(card.writeFile(`${DIR}/SaveGame2`, 100, 'new', r)).toMatchObject({ ok: true, value: { created: true } });
    r += 1;
    const before = storage.data.get(KEY1);
    expect(card.writeFile('NODIR/f', 1, null, r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NODIR' } });
    expect(card.writeFile(DIR, 1, null, r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: DIR, is: 'dir' } });
    expect(card.writeFile('ROOTFILE/f', 1, null, r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: 'ROOTFILE', is: 'file' } });
    expect(storage.data.get(KEY1)).toBe(before);
  });

  it('deletes a file; nothing there is no entry; a folder is the wrong kind', () => {
    const { card, r } = seeded();
    const n = rev(card.deleteFile(`${DIR}/SaveGame0`, r));
    expect(card.stat(`${DIR}/SaveGame0`)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    expect(card.deleteFile(`${DIR}/SaveGame0`, n)).toEqual({ ok: false, failure: { kind: 'no-entry', path: `${DIR}/SaveGame0` } });
    expect(card.deleteFile(DIR, n)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: DIR, is: 'dir' } });
  });

  it('makes a folder (an existing one is taken as made, the stub\'s Mkdir); a missing parent or a file there is refused', () => {
    const { card, storage, r } = seeded();
    const before = storage.data.get(KEY1);
    expect(card.makeDir(DIR, r)).toEqual({ ok: true, rev: r, value: { created: false } });
    expect(storage.data.get(KEY1)).toBe(before);
    expect(card.makeDir('ROOTFILE', r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: 'ROOTFILE', is: 'file' } });
    expect(card.makeDir('A/B', r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'A' } });
    expect(card.makeDir(`${DIR}/SUB`, r)).toEqual({ ok: true, rev: r + 1, value: { created: true } });
  });

  it('removes an empty folder; a folder with entries is not empty; a file is the wrong kind', () => {
    const { card, r } = seeded();
    expect(card.removeDir(DIR, r)).toEqual({ ok: false, failure: { kind: 'not-empty', path: DIR } });
    expect(card.removeDir('ROOTFILE', r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: 'ROOTFILE', is: 'file' } });
    expect(card.removeDir('NOPE', r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NOPE' } });
    let n = rev(card.deleteFile(`${DIR}/SaveGame0`, r));
    n = rev(card.deleteFile(`${DIR}/SaveGame1`, n));
    n = rev(card.removeDir(DIR, n));
    expect(card.stat(DIR)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    expect(card.info()).toMatchObject({ freeClusters: 8000 - 1 });
  });

  it('a folder holding only a subfolder is not empty (the close review: its dirs half had no test)', () => {
    const { card, r } = seeded();
    let n = rev(card.makeDir('A', r));
    n = rev(card.makeDir('A/B', n));
    expect(card.removeDir('A', n)).toEqual({ ok: false, failure: { kind: 'not-empty', path: 'A' } });
    expect(card.stat('A/B')).toMatchObject({ ok: true });
    n = rev(card.removeDir('A/B', n));
    expect(rev(card.removeDir('A', n))).toBe(n + 1);
  });

  it.each(['', '/abs', 'a//b', 'a/', '..', 'a/./b', 'a/../b', 'a\\b', 'a\0b', 'a\x1fb', 'a\x7fb'])('refuses the path %j', (path) => {
    const { card, r } = seeded();
    expect(card.writeFile(path, 1, null, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.makeDir(path, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.stat(path)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses the size %d', (size) => {
    const { card, r } = seeded();
    expect(card.writeFile('f', size, null, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
  });

  it('refuses data that is not JSON, writing nothing', () => {
    const { card, storage, r } = seeded();
    const before = storage.data.get(KEY1);
    expect(card.writeFile('f', 1, undefined, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.writeFile('f', 1, () => 1, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.writeFile('f', 1, 1n, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(storage.data.get(KEY1)).toBe(before);
  });

  it('names like `constructor` and `__proto__` are ordinary entries, before and after a reload', () => {
    const { storage, slots } = setup();
    const card = slots.slot(1);
    expect(card.stat('constructor')).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'constructor' } });
    expect(card.readFile('toString')).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'toString' } });
    let r = rev(card.writeFile('__proto__', 2_048, 'p', 0));
    r = rev(card.makeDir('constructor', r));
    r = rev(card.setExt('__proto__', 'e', r));
    const again = new CardSlots(() => storage, () => undefined).slot(1);
    expect(again.readFile('__proto__')).toMatchObject({ ok: true, value: { size: 2_048, data: 'p' } });
    expect(again.stat('constructor')).toMatchObject({ ok: true, value: { kind: 'dir' } });
    expect(again.getExt('__proto__')).toBe('e');
    expect(again.getExt('constructor')).toBeUndefined();
    expect(again.info()).toMatchObject({ usedClusters: 3 });
  });

  it('stamps mtime from the clock it was given', () => {
    const storage = new MemoryStorage();
    const slots = new CardSlots(() => storage, () => undefined, { now: () => 42 });
    rev(slots.slot(1).writeFile('f', 1, null, 0));
    expect(slots.slot(1).stat('f')).toMatchObject({ ok: true, value: { mtime: 42 } });
  });
});

describe('review round 1: the wipe\'s revision, the listing\'s order, ext\'s caps, no-op saves, ext through a wipe', () => {
  it('a wipe of an illegible record moves the revision past any an old tab can hold (the clock)', () => {
    const storage = new MemoryStorage();
    const clock = 1_700_000_000_000;
    const tab = () => new CardSlots(() => storage, () => undefined, { now: () => clock }).slot(1);
    const tabA = tab();
    const tabB = tab();
    expect(rev(tabA.setExt('s2u.a', 1, 0))).toBe(1);
    let r = 1;
    for (const v of [2, 3, 4]) r = rev(tabB.setExt('s2u.a', v, r));
    expect(r).toBe(4);
    storage.data.set(KEY1, '{not json');
    const wiped = tabB.format(null);
    expect(wiped).toEqual({ ok: true, rev: clock + 1, value: { ext: 'lost' } });
    expect(tabA.setExt('s2u.b', 1, 1)).toEqual({ ok: false, failure: { kind: 'changed', expected: 1, found: clock + 1 } });
  });

  it('a legible revision above the clock still wins', () => {
    const storage = new MemoryStorage();
    storage.data.set(KEY1, JSON.stringify({ v: 2, rev: 9_000 }));
    const card = new CardSlots(() => storage, () => undefined, { now: () => 100 }).slot(1);
    expect(card.format(null)).toMatchObject({ ok: true, rev: 9_001 });
  });

  it('lists as the stub\'s GetDir sorts: by the ASCII-lower-cased name (MemoryCard.cpp:1099-1104)', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    for (const [name, size] of [...SAVE_FILES].reverse()) r = rev(card.writeFile(`${DIR}/${name}`, size, null, r));
    const listed = card.list(DIR);
    expect(listed.ok && listed.value.map((e) => e.name)).toEqual([
      'BASCUS-97275SOCOMII', 'icon.sys', 'LIST.ICO', 'PATCHFILE.DAT', 'SaveGame0', 'SaveGame1', 'SaveGame2', 'SaveGame3',
      'SaveGame4', 'SaveGame5', 'SaveGame6', 'SCRATCHPAD.DAT',
    ]);
    r = rev(card.writeFile('b', 1, null, r));
    r = rev(card.writeFile('A', 1, null, r));
    const root = card.list('');
    expect(root.ok && root.value.map((e) => e.name)).toEqual(['A', 'b', DIR]);
  });

  it('caps one ext namespace and ext as a whole, refusing a larger value as too-large (not write-failed)', () => {
    expect(EXT_NAMESPACE_MAX_CHARS).toBe(262_144);
    expect(EXT_TOTAL_MAX_CHARS).toBe(1_048_576);
    const { storage, heard, slots } = setup();
    const card = slots.slot(1);
    const fits = 'x'.repeat(EXT_NAMESPACE_MAX_CHARS - 2);            // its JSON is exactly the cap
    expect(card.setExt('s2u.big', fits + 'x', 0)).toEqual({
      ok: false, failure: { kind: 'too-large', scope: 'namespace', limit: EXT_NAMESPACE_MAX_CHARS, size: EXT_NAMESPACE_MAX_CHARS + 1 },
    });
    let r = 0;
    for (const ns of ['s2u.a', 's2u.b', 's2u.c']) r = rev(card.setExt(ns, fits, r));
    const before = storage.data.get(KEY1);
    const refused = card.setExt('s2u.d', fits, r);
    expect(refused).toMatchObject({ ok: false, failure: { kind: 'too-large', scope: 'ext', limit: EXT_TOTAL_MAX_CHARS } });
    if (!refused.ok && refused.failure.kind === 'too-large') expect(refused.failure.size).toBeGreaterThan(EXT_TOTAL_MAX_CHARS);
    expect(storage.data.get(KEY1)).toBe(before);
    expect(heard).toEqual([]);
    expect(card.setExt('s2u.a', 'small', r)).toMatchObject({ ok: true });   // shrinking is always taken
  });

  it('takes a shrinking ext save even while ext is over its total cap, and refuses a growing one (research 99 §7.11)', () => {
    // A record whose ext is already over the cap (a lowered cap, or a record another build wrote): five namespaces.
    const { storage, slots } = setup();
    const fits = 'x'.repeat(EXT_NAMESPACE_MAX_CHARS - 2);
    const card = slots.slot(1);
    const r = rev(card.setExt('s2u.seed', 1, 0));
    const record = JSON.parse(storage.data.get(KEY1)!);
    record.ext = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((x) => [`s2u.${x}`, fits]));
    storage.data.set(KEY1, JSON.stringify(record));
    expect(JSON.stringify(record.ext).length).toBeGreaterThan(EXT_TOTAL_MAX_CHARS);
    expect(card.info().rev).toBe(r);
    expect(card.setExt('s2u.f', 1, r)).toMatchObject({ ok: false, failure: { kind: 'too-large', scope: 'ext' } });
    expect(card.setExt('s2u.a', 'small', r)).toEqual({ ok: true, rev: r + 1, value: undefined });
  });

  it('a save that changes nothing writes nothing and keeps the revision', () => {
    const { storage, slots } = setup();
    const card = slots.slot(1);
    expect(card.setExt('s2u.none', undefined, 0)).toEqual({ ok: true, rev: 0, value: undefined });
    expect(card.format(0)).toEqual({ ok: true, rev: 0, value: { ext: 'kept' } });
    expect(storage.sets).toBe(0);
    let r = rev(card.setExt('s2u.a', { x: 1 }, 0));
    expect(card.setExt('s2u.a', { x: 1 }, r)).toEqual({ ok: true, rev: r, value: undefined });
    r = rev(card.writeFile('f', 1, null, r));
    r = rev(card.format(r));
    expect(card.format(r)).toEqual({ ok: true, rev: r, value: { ext: 'kept' } });
    r = rev(card.unformat(r));
    expect(card.unformat(r)).toEqual({ ok: true, rev: r, value: undefined });
    expect(storage.sets).toBe(4);
    expect(card.setFileInfo('f', {}, r)).toMatchObject({ ok: false, failure: { kind: 'unformatted' } });
  });

  it('arguments are judged before the revision: a bad path with a stale revision is invalid', () => {
    const { slots } = setup();
    const card = slots.slot(1);
    rev(card.writeFile('f', 1, null, 0));
    expect(card.writeFile('/bad', 1, null, 0)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.writeFile('g', 1, null, 0)).toMatchObject({ ok: false, failure: { kind: 'changed' } });
  });

  it('a wipe of a damaged record keeps its ext when ext itself is a well-formed object, and says so', () => {
    const storage = new MemoryStorage();
    const card = new CardSlots(() => storage, () => undefined, { now: () => 1 }).slot(1);
    storage.data.set(KEY1, JSON.stringify({ v: 1, rev: 3, present: 'yes', formatted: true, files: {}, dirs: {}, ext: { 's2u.a': [1] } }));
    expect(card.format(null)).toEqual({ ok: true, rev: 4, value: { ext: 'kept' } });
    expect(card.getExt('s2u.a')).toEqual([1]);
    storage.data.set(KEY1, JSON.stringify({ v: 1, rev: 4, present: true, formatted: true, files: [], dirs: {}, ext: [] }));
    expect(card.format(null)).toEqual({ ok: true, rev: 5, value: { ext: 'lost' } });
    expect(card.extNames()).toEqual([]);
  });
});

describe('review round 1: rename, SetFileInfo, the case of names', () => {
  function seeded() {
    const s = setup();
    const card = s.slots.slot(1);
    let r = rev(card.makeDir(DIR, 0));
    r = rev(card.writeFile(`${DIR}/SaveGame0`, 1_952, 'zero', r));
    r = rev(card.writeFile(`${DIR}/SaveGame1`, 3_000, 'one', r));
    r = rev(card.makeDir('OTHER', r));
    return { ...s, card, r };
  }

  it('renames a file, keeping its size, time and data, in one save', () => {
    const { card, storage, r } = seeded();
    const before = card.stat(`${DIR}/SaveGame0`);
    const sets = storage.sets;
    expect(card.rename(`${DIR}/SaveGame0`, `${DIR}/SaveGame9`, r)).toEqual({ ok: true, rev: r + 1, value: undefined });
    expect(storage.sets).toBe(sets + 1);
    expect(card.stat(`${DIR}/SaveGame0`)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    expect(card.readFile(`${DIR}/SaveGame9`)).toMatchObject({ ok: true, value: { size: 1_952, data: 'zero' } });
    expect(before.ok && card.stat(`${DIR}/SaveGame9`)).toMatchObject({ ok: true, value: { mtime: before.ok ? before.value.mtime : 0 } });
  });

  it('renames a folder with everything in it, and moves a file to another folder', () => {
    const { card, r } = seeded();
    let n = rev(card.rename(DIR, 'RENAMED', r));
    expect(card.list('RENAMED')).toMatchObject({ ok: true, value: [{ name: 'SaveGame0' }, { name: 'SaveGame1' }] });
    expect(card.stat(DIR)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    n = rev(card.rename('RENAMED/SaveGame1', 'OTHER/SaveGame1', n));
    expect(card.readFile('OTHER/SaveGame1')).toMatchObject({ ok: true, value: { data: 'one' } });
    expect(card.info()).toMatchObject({ usedClusters: 1 + 1 + 2 + 3 });
  });

  it('a file renamed onto a file replaces it (the stub\'s host rename), freeing its clusters', () => {
    const { card, r } = seeded();
    rev(card.rename(`${DIR}/SaveGame0`, `${DIR}/SaveGame1`, r));
    expect(card.readFile(`${DIR}/SaveGame1`)).toMatchObject({ ok: true, value: { size: 1_952, data: 'zero' } });
    expect(card.info()).toMatchObject({ usedClusters: 1 + 1 + 2 });
  });

  it('refuses what the stub refuses, and what would name a folder inside itself', () => {
    const { card, storage, r } = seeded();
    const before = storage.data.get(KEY1);
    expect(card.rename('NOPE', 'X', r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NOPE' } });
    expect(card.rename(`${DIR}/SaveGame0`, 'NODIR/x', r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NODIR' } });
    expect(card.rename(`${DIR}/SaveGame0`, 'OTHER', r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: 'OTHER', is: 'dir' } });
    expect(card.rename('OTHER', `${DIR}/SaveGame0`, r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: `${DIR}/SaveGame0`, is: 'file' } });
    expect(card.rename('OTHER', DIR, r)).toEqual({ ok: false, failure: { kind: 'wrong-kind', path: DIR, is: 'dir' } });
    expect(card.rename(DIR, `${DIR}/SUB`, r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.rename(DIR, '/abs', r)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
    expect(card.rename(DIR, 'X', r - 1)).toEqual({ ok: false, failure: { kind: 'changed', expected: r - 1, found: r } });
    expect(card.rename(DIR, DIR, r)).toEqual({ ok: true, rev: r, value: undefined });
    expect(storage.data.get(KEY1)).toBe(before);
  });

  it('SetFileInfo sets a file\'s or a folder\'s time; with nothing to set it only checks the entry, as the stub does', () => {
    const { card, storage, r } = seeded();
    const sets = storage.sets;
    expect(card.setFileInfo(`${DIR}/SaveGame0`, {}, r)).toEqual({ ok: true, rev: r, value: undefined });
    expect(card.setFileInfo('NOPE', {}, r)).toEqual({ ok: false, failure: { kind: 'no-entry', path: 'NOPE' } });
    expect(storage.sets).toBe(sets);
    let n = rev(card.setFileInfo(`${DIR}/SaveGame0`, { mtime: 7 }, r));
    expect(card.stat(`${DIR}/SaveGame0`)).toMatchObject({ ok: true, value: { mtime: 7 } });
    expect(card.setFileInfo(`${DIR}/SaveGame0`, { mtime: 7 }, n)).toEqual({ ok: true, rev: n, value: undefined });
    n = rev(card.setFileInfo(DIR, { mtime: 8 }, n));
    expect(card.stat(DIR)).toMatchObject({ ok: true, value: { mtime: 8 } });
    expect(card.setFileInfo(DIR, { mtime: Number.NaN }, n)).toMatchObject({ ok: false, failure: { kind: 'invalid' } });
  });

  it('names are case-sensitive, as the PS2 card filesystem compares them (a reading)', () => {
    expect(CARD_NAMES_CASE_SENSITIVE_READING).toBe(true);
    const { card, r } = seeded();
    expect(card.stat(`${DIR}/SAVEGAME0`)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    expect(card.readFile(`${DIR.toLowerCase()}/SaveGame0`)).toMatchObject({ ok: false, failure: { kind: 'no-entry' } });
    const n = rev(card.writeFile(`${DIR}/savegame0`, 1, 'lower', r));
    expect(card.readFile(`${DIR}/SaveGame0`)).toMatchObject({ ok: true, value: { data: 'zero' } });
    expect(card.readFile(`${DIR}/savegame0`)).toMatchObject({ ok: true, value: { data: 'lower' } });
    const listed = card.list(DIR);
    expect(listed.ok && listed.value.map((e) => e.name)).toEqual(['SaveGame0', 'savegame0', 'SaveGame1']);
    expect(n).toBe(r + 1);
  });
});
