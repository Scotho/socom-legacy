// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  CARD_SLOT_KEYS, CARD_TOTAL_CLUSTERS, CardSlots, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, PersonaCard, UI_VAR_MODULE, clustersFor,
  personaFileSize, type PersonaLogin,
} from '@s2u/card';
import { CARD_SAVE_REFUSED, saveWithinCard } from '../../src/modern/cardSave';
import { cardProfileEdits } from '../../src/modern/profile/cardEdits';
import { cardOptionStore } from '../../src/modern/settings/store';

/**
 * MU-F2b: the modern editors' card-save boundary (`src/modern/cardSave.ts`). A disposable in-memory formatted card --
 * never a user's -- holding a valid save and filler that leaves room for the old save only; each edit grows the file
 * across a cluster. The boundary refuses before any destructive write (the original's `IsSpaceForSaveGameFile`,
 * `FUN_0027b3d0` D:L124932-124944, and libmc's Write rule), counts what releasing `SCRATCHPAD.DAT` frees (`SaveConfig`'s
 * `FUN_003a1c60` D:L296104-296126), and a browser quota refusal leaves the old file as it was. Generated values only.
 * MU-F2d (dot's review of MU-F2b): the edit is staged on a memory copy of the card and persisted as one write after an
 * optimistic revision check, so a quota refusal leaves the stored record byte-identical and another tab's newer save, once
 * visible to that check, is refused rather than overwritten (the two-tab window: research 99 §7.6).
 */
const SAVE = PERSONA_FILE_PATH.slice(1);
const DIR = PERSONA_SAVE_DIR.slice(1);
const SCRATCH = `${DIR}/SCRATCHPAD.DAT`;
const PATCH = `${DIR}/PATCHFILE.DAT`;

/** The storage's refusals: past `limit` characters, any value `refuse` names, and with `lock` every write after the first refusal. */
interface Quota { limit: number; refuse?: (value: string) => boolean; lock?: boolean; refused?: boolean }
interface Mem { slots: CardSlots; raw: () => string; quota: Quota; clock: { now: number }; sets: () => number; put: (raw: string) => void; onGet?: (key: string) => void }
const memory = (): Mem => {
  const m = new Map<string, string>();
  const quota: Quota = { limit: Infinity };
  const clock = { now: 5_000 };
  let sets = 0;
  const mem = {} as Mem;
  const storage = {
    getItem: (k: string) => { mem.onGet?.(k); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => {
      const value = String(v);
      if ((quota.lock && quota.refused) || value.length > quota.limit || quota.refuse?.(value)) {
        quota.refused = true;
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      }
      sets++;
      m.set(k, String(v));
    },
    removeItem: (k: string) => { m.delete(k); },
  };
  const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => clock.now });
  const raw = (): string => m.get(CARD_SLOT_KEYS[0]) ?? '';
  const put = (value: string): void => { m.set(CARD_SLOT_KEYS[0], value); };
  return Object.assign(mem, { slots, raw, quota, clock, sets: () => sets, put });
};

const login = (name: string): PersonaLogin => ({ host: 'lobby.test', port: 10075, name, town: '', gender: 0, savePassword: false, password: null });

/** The save with `personas` records and `uiKeys` keys in its CUIVarManager module, written by the card package's own save. */
function seedSave(mem: Mem, personas: number, uiKeys: number): void {
  const card = new PersonaCard(new Libmc(mem.slots, { log: () => {}, now: () => 5_000 }), 0);
  card.load();
  card.setLogins(Array.from({ length: personas }, (_, i) => login(`p${i}x${Math.random().toString(36).slice(2, 6)}`)));
  if (uiKeys > 0) card.setPart(UI_VAR_MODULE, Object.fromEntries(Array.from({ length: uiKeys }, (_, i) => [`KEEP${i}`, { type: 'real', value: 0.5 }])));
  expect(card.save()).toBe(0);
}

/** Fills the card so `left` clusters stay free: `inFolder` puts the filler inside the save's folder (the original's PATCHFILE.DAT). */
function fill(mem: Mem, left: number, path = 'FILLER.DAT'): void {
  const slot = mem.slots.slot(1);
  const info = slot.info();
  if (info.state !== 'formatted') throw new Error('not formatted');
  const kb = info.freeClusters - left;
  expect(slot.writeFile(path, kb * 1024, null, info.rev).ok).toBe(true);
  const after = slot.info();
  expect(after.state === 'formatted' && after.freeClusters).toBe(left);
}

const file = (mem: Mem, path = SAVE) => { const f = mem.slots.slot(1).readFile(path); return f.ok ? f.value : null; };
const used = (mem: Mem): number => { const i = mem.slots.slot(1).info(); return i.state === 'formatted' ? i.usedClusters : -1; };

describe('the card-save boundary refuses before any destructive write when the enlarged save will not fit', () => {
  it('a persona added across a cluster on a card with room for the old save only: refused, the file byte-for-byte as it was', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    expect(clustersFor(personaFileSize(5))).toBeLessThan(clustersFor(personaFileSize(6)));   // the add crosses a cluster
    fill(mem, 0, PATCH);   // the folder above 3000 KB: the original's space rule passes, the Write would not fit
    const before = mem.raw();
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona({ name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(edits.personas()).toHaveLength(5);
    expect(edits.refusal?.()).toMatch(/full/i);
  });

  it('the original\'s space rule refuses too: free plus the folder below 3000 KB (FUN_0027b3d0), the file kept', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    fill(mem, 0);
    const before = mem.raw();
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona({ name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(edits.refusal?.()).toMatch(/full/i);
  });

  it('a new tuner key through the settings store across a cluster: refused, the save and its modules kept', () => {
    const mem = memory();
    seedSave(mem, 5, 1);
    expect(clustersFor(personaFileSize(5, 1))).toBeLessThan(clustersFor(personaFileSize(5, 2)));
    fill(mem, 0, PATCH);
    const before = mem.raw();
    const store = cardOptionStore(mem.slots);
    expect(store.setTuner('MUSICVOLUME', 0.25)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(store.refusal?.()).toMatch(/full/i);
  });

  it('a new phrase key (a taunt) across a cluster: refused, the save kept', () => {
    const mem = memory();
    seedSave(mem, 5, 1);
    fill(mem, 0, PATCH);
    const before = mem.raw();
    const edits = cardProfileEdits(mem.slots);
    expect(edits.setTaunt(0, 'Hold the line')).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(edits.taunts()[0]).toBeNull();
  });

  it('an edit that grows within its clusters still saves on a full card (no refusal when it fits)', () => {
    const mem = memory();
    seedSave(mem, 5, 1);
    fill(mem, 0, PATCH);
    const edits = cardProfileEdits(mem.slots);
    const p = edits.personas()[0]!;
    expect(edits.setPersonaGender({ host: p.HOST, port: p.PORT, name: p.NAME }, 1)).toBe(true);
    expect(edits.refusal?.()).toBe('');
    expect(edits.personas()[0]!.GENDER).toBe(1);
  });
});

describe('releasing SCRATCHPAD.DAT counts, as the original\'s SaveConfig releases it before it writes', () => {
  it('the enlarged save fits once the scratch file is released: saved, the scratch file gone', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    fill(mem, 0, SCRATCH);
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona({ name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(true);
    expect(edits.personas().map((p) => p.NAME)).toContain('Newbie');
    expect(file(mem)!.size).toBe(personaFileSize(6));
    expect(file(mem, SCRATCH)).toBeNull();
    expect(used(mem)).toBeLessThanOrEqual(CARD_TOTAL_CLUSTERS);
  });

  it('the scratch file is left alone when the save fits without it', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    const slot = mem.slots.slot(1);
    const info = slot.info();
    expect(info.state === 'formatted' && slot.writeFile(SCRATCH, 10 * 1024, null, info.rev).ok).toBe(true);
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona({ name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(true);
    expect(file(mem, SCRATCH)!.size).toBe(10 * 1024);
  });
});

/** The stored revision of slot 1. */
const revOf = (mem: Mem): number => { const i = mem.slots.slot(1).info(); return i.state === 'formatted' ? i.rev : -1; };
/** Moves slot 1's revision to `rev` by `ext` saves that hold nothing on the card (the record's width otherwise kept). */
function bumpTo(mem: Mem, rev: number): void {
  const slot = mem.slots.slot(1);
  while (revOf(mem) < rev) expect(slot.setExt('bump', revOf(mem) % 2 === 0 ? 1 : 2, revOf(mem)).ok).toBe(true);
  expect(revOf(mem)).toBe(rev);
}
const NEWBIE = { name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 } as const;

describe('a browser quota refusal leaves the stored record byte-identical (the edit staged, persisted once)', () => {
  it('dot (a): revision 9, quota exactly the current record: refused, the raw string byte-identical', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    bumpTo(mem, 9);   // the next revision crosses a digit: a restore written afresh would need one more character
    mem.clock.now = 6_000;   // the same width as the seed's mtimes
    const before = mem.raw();
    mem.quota.limit = before.length;
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona(NEWBIE)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(edits.personas()).toHaveLength(2);
    expect(edits.refusal?.()).toBe(CARD_SAVE_REFUSED.storage);
  });

  it('dot (a), sharpened: a same-length edit at revision 9 -- the extra revision digit alone is past the exact quota', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    bumpTo(mem, 9);
    mem.clock.now = 5_000;   // the seed's own mtimes: the rewritten file's time is the same text
    const before = mem.raw();
    const gender = (m: Mem) => { const e = cardProfileEdits(m.slots); const p = e.personas()[0]!; return { e, key: { host: p.HOST, port: p.PORT, name: p.NAME } }; };
    // The twin, from the same text and no quota: the edit's record is the old one's length plus the digit "10" adds.
    const twin = memory();
    twin.put(before);
    const t = gender(twin);
    expect(t.e.setPersonaGender(t.key, 1)).toBe(true);
    expect(twin.raw().length).toBe(before.length + 1);
    expect(twin.raw()).toContain('"rev":10,');
    mem.quota.limit = before.length;
    const g = gender(mem);
    expect(g.e.setPersonaGender(g.key, 1)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(g.e.refusal?.()).toBe(CARD_SAVE_REFUSED.storage);
  });

  it('dot (b): a store that refuses every write after the first refusal: the old record intact', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    const before = mem.raw();
    mem.quota.refuse = (v) => v.includes('Newbie');
    mem.quota.lock = true;
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona(NEWBIE)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(edits.refusal?.()).toBe(CARD_SAVE_REFUSED.storage);
  });

  it('a tuner write past the storage quota: refused, the raw string byte-identical', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    const before = mem.raw();
    mem.quota.limit = before.length;
    mem.clock.now = 9_000;
    const store = cardOptionStore(mem.slots);
    expect(store.setTuner('MUSICVOLUME', 0.25)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(store.refusal?.()).toMatch(/browser/i);
  });

  it('a quota refusal where SCRATCHPAD.DAT had to be released: the save and the scratch file both as they were', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    fill(mem, 0, SCRATCH);
    const before = mem.raw();
    mem.quota.refuse = (v) => v.includes('Newbie');
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona(NEWBIE)).toBe(false);
    expect(mem.raw()).toBe(before);
    expect(file(mem, SCRATCH)).not.toBeNull();
    expect(edits.refusal?.()).toMatch(/browser/i);
  });

  it('a first save on a card with no save file, refused by the quota: nothing stored at all', () => {
    const mem = memory();
    mem.quota.refuse = (v) => v.includes('Newbie');
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona(NEWBIE)).toBe(false);
    expect(mem.raw()).toBe('');
    expect(file(mem)).toBeNull();
    expect(edits.refusal?.()).toMatch(/browser/i);
  });

  it('a fitting save still saves with one write to the storage, the revision one past', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    const rev = revOf(mem), sets = mem.sets();
    const edits = cardProfileEdits(mem.slots);
    expect(edits.createPersona(NEWBIE)).toBe(true);
    expect(mem.sets()).toBe(sets + 1);
    expect(revOf(mem)).toBe(rev + 1);
    expect(edits.personas().map((p) => p.NAME)).toContain('Newbie');
    expect(file(mem)!.size).toBe(personaFileSize(3, 1));
  });
});

describe('another tab\'s newer save visible to the final revision check is not overwritten (the two-tab window: research 99 §7.6)', () => {
  it('dot (c): a newer save lands between the snapshot and the commit: it survives untouched, the card changed', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    let newer = '';
    const out = saveWithinCard(mem.slots, (staged) => {
      // Another tab saves while this edit is staged: the real record moves past the revision the stage read.
      const tab = new PersonaCard(new Libmc(mem.slots, { log: () => {}, now: () => 5_000 }), 0);
      tab.load();
      tab.setLogins([...tab.personas().map((p) => ({ ...login(p.NAME), host: p.HOST, port: p.PORT })), login('OtherTab')]);
      expect(tab.save()).toBe(0);
      newer = mem.raw();
      const mc = new Libmc(staged, { log: () => {} });
      const card = new PersonaCard(mc, 0);
      card.load();
      const plan = login('Newbie');
      return { mc, port: 0, size: personaFileSize(3, 1), commit: () => card.saveLogin(plan).result };
    });
    expect(out).toEqual({ ok: false, why: 'changed', message: CARD_SAVE_REFUSED.changed });
    expect(newer).toContain('OtherTab');
    expect(mem.raw()).toBe(newer);
    expect(CARD_SAVE_REFUSED.changed).toMatch(/memory card changed/i);
  });

  it('dot (c) through the profile editor: the newer save lands as the commit reads the slot; it survives, the refusal says so', () => {
    const mem = memory();
    seedSave(mem, 2, 1);
    let reads = 0, newer = '';
    const edits = cardProfileEdits(mem.slots);
    mem.onGet = (k) => {
      if (k !== CARD_SLOT_KEYS[0] || ++reads !== 2) return;   // the stage's read, then the commit's
      mem.onGet = undefined;
      expect(mem.slots.slot(1).setExt('otherTab', 1, revOf(mem)).ok).toBe(true);
      newer = mem.raw();
    };
    expect(edits.createPersona(NEWBIE)).toBe(false);
    expect(newer).not.toBe('');
    expect(mem.raw()).toBe(newer);
    expect(edits.refusal?.()).toBe(CARD_SAVE_REFUSED.changed);
  });
});

describe('the refusal\'s words (MU2-3: CARD_SAVE_REFUSED, the modern UI\'s own, MU.R1)', () => {
  it('four reasons, each said after "... not saved: ", none a number or a code', () => {
    expect(CARD_SAVE_REFUSED).toEqual({
      space: 'the memory card is full',
      storage: 'this browser refused the write',
      card: 'the memory card refused the write',
      changed: 'the memory card changed; try again',
    });
    for (const w of Object.values(CARD_SAVE_REFUSED)) expect(w).not.toMatch(/\d|[A-Z]{2,}|_/);
  });

  it('the editor\'s refusal() is the table\'s words exactly: none before a write, the reason\'s after a refused one, none again after a save', () => {
    const mem = memory();
    seedSave(mem, 5, 0);
    fill(mem, 0, PATCH);
    const edits = cardProfileEdits(mem.slots);
    expect(edits.refusal!()).toBe('');
    expect(edits.createPersona({ name: 'Newbie', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(false);
    expect(edits.refusal!()).toBe(CARD_SAVE_REFUSED.space);
    const p = edits.personas()[0]!;
    expect(edits.setPersonaGender({ host: p.HOST, port: p.PORT, name: p.NAME }, 1)).toBe(true);   // the same size: saved on the full card
    expect(edits.refusal!()).toBe('');
    expect(saveWithinCard(mem.slots, () => null)).toBeNull();   // nothing to write: no outcome, nothing said
  });
});
