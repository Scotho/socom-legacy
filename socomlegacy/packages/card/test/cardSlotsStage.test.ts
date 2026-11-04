import { describe, expect, it } from 'vitest';
import { CARD_SLOT_KEYS, CardSlots, StoreError, type CardStorage } from '../src/index';

/**
 * MU-F2d: `CardSlots.stage` -- a memory copy of both slots, changed by any number of operations, then committed to the
 * real storage as one `setItem` only if the slot's revision is still the one the stage read (compare-and-swap). The
 * card's own atomic-save rule (one `setItem`; a throwing one keeps the old record byte-equal) and its revision rule
 * (another tab's save is `changed`) carried to a whole staged edit. A stand-in `Storage`, generated values only.
 */
class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  failSet?: (key: string, value: string) => unknown;
  sets = 0;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void {
    const e = this.failSet?.(key, value);
    if (e !== undefined) throw e;
    this.sets++;
    this.data.set(key, String(value));
  }
}

function setup() {
  const storage = new MemoryStorage();
  const heard: StoreError[] = [];
  let clock = 1_000;
  const slots = new CardSlots(() => storage, (e) => heard.push(e), { now: () => clock++ });
  return { storage, heard, slots };
}

const DIR = 'BASCUS-97275SOCOMII';
const KEY1 = CARD_SLOT_KEYS[0];
const revOf = (slots: CardSlots): number => { const i = slots.slot(1).info(); if (i.state !== 'formatted') throw new Error(i.state); return i.rev; };

describe('CardSlots.stage: an edit staged in memory, committed once by compare-and-swap', () => {
  it('the staged operations touch no real storage; the commit is one setItem holding all of them, the revision one past', () => {
    const { storage, slots } = setup();
    expect(slots.slot(1).makeDir(DIR, 0).ok).toBe(true);
    const before = storage.data.get(KEY1);
    const sets = storage.sets;
    const stage = slots.stage();
    const s = stage.slots.slot(1);
    expect(s.writeFile(`${DIR}/A`, 10, { a: 1 }, revOf(stage.slots)).ok).toBe(true);
    expect(s.writeFile(`${DIR}/B`, 20, { b: 2 }, revOf(stage.slots)).ok).toBe(true);
    expect(s.deleteFile(`${DIR}/A`, revOf(stage.slots)).ok).toBe(true);
    expect(storage.data.get(KEY1)).toBe(before);
    expect(storage.sets).toBe(sets);
    const out = stage.commit(1);
    expect(out.ok).toBe(true);
    expect(storage.sets).toBe(sets + 1);
    expect(revOf(slots)).toBe(2);
    const b = slots.slot(1).readFile(`${DIR}/B`);
    expect(b.ok && b.value).toMatchObject({ size: 20, data: { b: 2 } });
    expect(slots.slot(1).readFile(`${DIR}/A`).ok).toBe(false);
    // The staged clock is the slots' own: the file's time is the next tick of the same clock.
    expect(b.ok && b.value.mtime).toBeGreaterThan(1_000);
  });

  it('a stage that changed nothing commits nothing: no write, the revision kept', () => {
    const { storage, slots } = setup();
    expect(slots.slot(1).makeDir(DIR, 0).ok).toBe(true);
    const sets = storage.sets;
    const out = slots.stage().commit(1);
    expect(out.ok).toBe(true);
    expect(storage.sets).toBe(sets);
    expect(revOf(slots)).toBe(1);
  });

  it('a commit the storage refuses (its quota) writes nothing: the old record byte-equal, the refusal reported', () => {
    const { storage, heard, slots } = setup();
    expect(slots.slot(1).makeDir(DIR, 0).ok).toBe(true);
    const before = storage.data.get(KEY1);
    const stage = slots.stage();
    expect(stage.slots.slot(1).writeFile(`${DIR}/A`, 10, 'x'.repeat(200), revOf(stage.slots)).ok).toBe(true);
    storage.failSet = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const out = stage.commit(1);
    expect(out.ok === false && out.failure.kind).toBe('write-failed');
    expect(storage.data.get(KEY1)).toBe(before);
    expect(heard).toHaveLength(1);
  });

  it('another tab saved after the stage read the slot: the commit is refused as changed and the newer record kept', () => {
    const { storage, slots } = setup();
    expect(slots.slot(1).makeDir(DIR, 0).ok).toBe(true);
    const stage = slots.stage();
    expect(stage.slots.slot(1).writeFile(`${DIR}/MINE`, 10, 'mine', revOf(stage.slots)).ok).toBe(true);
    const otherTab = new CardSlots(() => storage, () => undefined, { now: () => 7 });
    expect(otherTab.slot(1).writeFile(`${DIR}/THEIRS`, 10, 'theirs', 1).ok).toBe(true);
    const newer = storage.data.get(KEY1);
    const sets = storage.sets;
    const out = stage.commit(1);
    expect(out.ok === false && out.failure).toEqual({ kind: 'changed', expected: 1, found: 2 });
    expect(storage.sets).toBe(sets);
    expect(storage.data.get(KEY1)).toBe(newer);
  });

  it('commits only the slot named: slot 2 staged changes are not written by commit(1)', () => {
    const { storage, slots } = setup();
    const stage = slots.stage();
    expect(stage.slots.slot(2).makeDir(DIR, 0).ok).toBe(true);
    expect(stage.commit(1).ok).toBe(true);
    expect(storage.data.has(CARD_SLOT_KEYS[1])).toBe(false);
    expect(stage.commit(2).ok).toBe(true);
    expect(storage.data.has(CARD_SLOT_KEYS[1])).toBe(true);
  });
});
