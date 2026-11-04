// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardSlots, FIO, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, PersonaCard } from '@s2u/card';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveCard } from '../../../src/console/adapters/card';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { CATS } from '../../../src/console/state';
import { mountShell } from '../shell';

/**
 * The console launcher's memory card adapter (slice 2, part d): the slot and the personas as the page's card readers
 * read them (`../../src/modern/profile/cardEdits` `cardProfileEdits`, the reader Home's card and the profile use: slot
 * 1's persona file, else slot 2's), so Home's Memory card item says what the card really holds. A memory card over an
 * in-memory storage, written through the card package's own path. Generated names only. A browser adaptation (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
/** A persona file whose personas do not parse (as `../../modern/modernProfileCard.test.ts` makes one). */
const malformed = (): CardSlots => {
  const slots = memory();
  const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
  mc.mkdir(0, 0, PERSONA_SAVE_DIR);
  const fd = mc.open(0, 0, PERSONA_FILE_PATH, FIO.O_WRONLY | FIO.O_CREAT);
  mc.write(fd, 5_000, { CAcctDB: { AcctInfo: [{ nope: 1 }] } });
  mc.close(fd);
  return slots;
};
const seed = (slots: CardSlots, names: string[]): void => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
  card.load();
  card.setLogins(names.map((name) => ({ host: 'lobby.test', port: 10075, name, town: '', gender: 0, savePassword: false, password: null })));
  expect(card.save()).toBeGreaterThanOrEqual(0);
};
// LR-37 (4): the page's Home has no Memory card row now; the card's line is Profile's Profiles row's (its fourth), read
// there (was: Home's second row, LR-13).
const memoryItem = (): string => {
  page!.ctl.S.cat = CATS.findIndex((c) => c.id === 'profile');
  page!.render();
  return document.querySelectorAll('#stage .cx-item')[3]!.querySelector('.cx-item__sub')!.textContent!;
};
const boot = (card: ReturnType<typeof liveCard>) => {
  page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, card }, { keymap: true });
};

describe('the memory card adapter', () => {
  it('two personas on slot 1: "Slot 1 · 2 personas · <first>"', () => {
    const slots = memory();
    seed(slots, ['RANGER7', 'NIGHTOWL']);
    const card = liveCard({ slots });
    expect([card.slot(), card.personas(), card.persona(), card.names()]).toEqual([1, 2, 'RANGER7', ['RANGER7', 'NIGHTOWL']]);
    boot(card);
    expect(memoryItem()).toBe('Slot 1 · 2 personas · RANGER7');
  });

  it('one persona: singular', () => {
    const slots = memory();
    seed(slots, ['RANGER7']);
    boot(liveCard({ slots }));
    expect(memoryItem()).toBe('Slot 1 · 1 persona · RANGER7');
  });

  it('a card with no persona file yet says so (the first save makes it on slot 1)', () => {
    const card = liveCard({ slots: memory() });
    expect([card.slot(), card.personas(), card.persona()]).toEqual([1, 0, '']);
    boot(card);
    expect(memoryItem()).toBe('Slot 1 · no personas yet');
  });

  it('a card whose persona file does not parse cannot be read: "No memory card can be read"', () => {
    const card = liveCard({ slots: malformed() });
    expect(card.readable()).toBe(false);
    boot(card);
    expect(memoryItem()).toBe('No memory card can be read');
  });

  it('reload reads the card again (another writer saved)', () => {
    const slots = memory();
    const card = liveCard({ slots });
    expect(card.personas()).toBe(0);
    seed(slots, ['RANGER7']);
    expect(card.personas()).toBe(0);                     // read once, held
    card.reload();
    expect(card.personas()).toBe(1);
  });
});
