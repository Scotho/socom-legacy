// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CardSlots, FIO, Libmc, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, PersonaCard, UI_VAR_MODULE, type PersonaRecord } from '@s2u/card';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { discAssetsOf, readHudCaptions } from '../../src/modern/discAssets';
import { readTauntDefaults } from '../../src/tauntData';
import { UniverseRefusal, readUniverseHost } from '../../src/console/universe';
import { liveProfile, personaId } from '../../src/console/adapters/profile';
import {
  PERSONA_NAME_KEYBOARD_BYTES, PERSONA_TOWN_MAX_CHARS, cardProfileEdits, personaNameProblem, phraseProblem, pruneSpaces, townProblem,
  type PersonaKey,
} from '../../src/modern/profile/cardEdits';
import type { LauncherState } from '../../src/modern/launcherState';
import type { ModernSession } from '../../src/modern/session';

/**
 * The card's edits the console's Persona screens make (`src/modern/profile/cardEdits.ts`, kept where Home's card reads it;
 * MU-13c / MU-13e) and the universe a new persona is filed under (`src/console/universe.ts`): a browser adaptation (MU.R1).
 * Unit tests (jsdom, a memory card) against the transcription: every edit goes through the card package's own write path
 * (MU.R2) under the original's limits (research 301 §6, 302 §3, 153 §3). Moved from `test/modern/modernProfileCard.test.ts`
 * with CX-PERSONA (the modern Profile section retired); the card's states are read through the console's adapter
 * (`src/console/adapters/profile.ts`) where the section's page read them. Generated values only.
 */
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 8)}`;
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const record = (name: string, over: Partial<PersonaRecord> = {}): PersonaRecord => ({
  HOST: 'lobby.test', NAME: name, TOWN: '', GENDER: 0, PORT: 10075, PASSWORD: { length: 0 }, SAVEPASSWORD: 0,
  PROFILES: { PROFILE_CHECKSUM: new Array<number>(16).fill(0), PROFILE_INFO: [] }, ...over,
});

const memory = () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
const reread = (slots: CardSlots) => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
  return { card, result: card.load() };
};
const seed = (slots: CardSlots, personas: PersonaRecord[], module?: Record<string, unknown>): void => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
  card.load();
  card.setLogins(personas.map((p) => ({ host: p.HOST, port: p.PORT, name: p.NAME, town: p.TOWN, gender: p.GENDER, savePassword: false, password: null })));
  if (module) card.setPart(UI_VAR_MODULE, module);
  expect(card.save()).toBeGreaterThanOrEqual(0);
};
const str = (value: string) => ({ type: 'string', value });

describe('the original\'s limits as pure rules', () => {
  it('a phrase: 45 characters, 46 bytes with the NUL, never empty, no control character (research 301 §6, do_chat)', () => {
    expect(phraseProblem('a'.repeat(45))).toBe('');
    expect(phraseProblem('a'.repeat(46))).not.toBe('');
    expect(phraseProblem('')).not.toBe('');
    expect(phraseProblem('hi\u0007there')).not.toBe('');
    expect(phraseProblem('é'.repeat(23))).not.toBe('');   // 23 characters, 46 bytes: the NUL has no room
    expect(phraseProblem('é'.repeat(22))).toBe('');
  });
  it('a persona name: pruned of end spaces, 14 characters / 31 bytes, no double quote, not empty, not held, three a host (research 153 §3)', () => {
    expect(pruneSpaces('  ab c  ')).toBe('ab c');
    const held = [record('One'), record('Two')];
    expect(personaNameProblem('Ok', held, 'lobby.test', 10075)).toBe('');
    expect(personaNameProblem('', held, 'lobby.test', 10075)).not.toBe('');
    expect(personaNameProblem('a'.repeat(14), held, 'lobby.test', 10075)).toBe('');
    expect(personaNameProblem('a'.repeat(15), held, 'lobby.test', 10075)).not.toBe('');
    expect(personaNameProblem('a"b', held, 'lobby.test', 10075)).not.toBe('');
    expect(personaNameProblem('One', held, 'lobby.test', 10075)).toMatch(/already/);
    expect(personaNameProblem('one', held, 'lobby.test', 10075)).toBe('');   // MUISPersonaExists compares exactly (strcmp)
    expect(personaNameProblem('Three', [...held, record('Three')], 'lobby.test', 10075)).not.toBe('');
    expect(personaNameProblem('Three', [...held, record('Three')], 'lobby.test', 10076)).toBe('');   // the three are per HOST and PORT
    expect(PERSONA_NAME_KEYBOARD_BYTES).toBe(31);
    expect(personaNameProblem('é'.repeat(14), [], 'h', 1)).toBe('');      // 14 characters, 28 bytes
    expect(personaNameProblem('€'.repeat(11), [], 'h', 1)).not.toBe('');  // 11 characters, 33 bytes: over the keyboard's 31
  });
  it('a hometown: 20 characters, 63 bytes, empty allowed (research 153 §3)', () => {
    expect(townProblem('')).toBe('');
    expect(townProblem('x'.repeat(PERSONA_TOWN_MAX_CHARS))).toBe('');
    expect(townProblem('x'.repeat(PERSONA_TOWN_MAX_CHARS + 1))).not.toBe('');
  });
});

describe('the card store: the card package\'s own write paths, one open card per write', () => {
  it('a taunt is written as the module\'s string record, beside the module\'s other keys and the personas, as read', () => {
    const slots = memory();
    const text = gen('taunt ');
    seed(slots, [record('Hawk', { TOWN: 'Norfolk' })], { MPTAUNTMSG1: str('_60762_X_MSG'), MPLOCALSOP1: str('_60757_Y_MSG'), SYSTEM_TUNER: { type: 'real', value: 0.5 } });
    const s = cardProfileEdits(slots);
    expect(s.setTaunt(2, text)).toBe(true);
    const { card, result } = reread(slots);
    const part = card.part(UI_VAR_MODULE) as Record<string, unknown>;
    expect(part['MPTAUNTMSG3']).toEqual(str(text));
    expect(part['MPTAUNTMSG1']).toEqual(str('_60762_X_MSG'));
    expect(part['MPLOCALSOP1']).toEqual(str('_60757_Y_MSG'));
    expect(part['SYSTEM_TUNER']).toEqual({ type: 'real', value: 0.5 });
    expect(result.personas.map((p) => [p.NAME, p.TOWN])).toEqual([['Hawk', 'Norfolk']]);
    expect(s.taunts()).toEqual(['_60762_X_MSG', null, text, null, null]);
    expect(s.messages()).toEqual(['_60757_Y_MSG', null, null, null, null]);
  });
  it('a team message goes to MPLOCALSOP, on a blank card too (the save file is made)', () => {
    const slots = memory();
    const text = gen('msg ');
    expect(cardProfileEdits(slots).setMessage(4, text)).toBe(true);
    expect((reread(slots).card.part(UI_VAR_MODULE) as Record<string, unknown>)['MPLOCALSOP5']).toEqual(str(text));
  });
  it('refuses a phrase over the limit, an empty one and a slot out of range: nothing is written', () => {
    const slots = memory();
    const s = cardProfileEdits(slots);
    expect(s.setTaunt(0, 'a'.repeat(46))).toBe(false);
    expect(s.setTaunt(0, '')).toBe(false);
    expect(s.setMessage(5, 'ok')).toBe(false);
    expect(reread(slots).result.result).toBeLessThan(0);   // no file
  });
  it('creates a persona through saveLogin: NAME, HOST, PORT, TOWN, GENDER, no password, a zero checksum; the others stand', () => {
    const slots = memory();
    seed(slots, [record('Hawk', { TOWN: 'Norfolk', GENDER: 1 })]);
    const s = cardProfileEdits(slots);
    expect(s.createPersona({ name: 'Viper', host: 'lobby.test', port: 10075, town: 'Reno', gender: 1 })).toBe(true);
    const { result } = reread(slots);
    expect(result.personas.map((p) => [p.NAME, p.HOST, p.PORT, p.TOWN, p.GENDER, p.SAVEPASSWORD, p.PASSWORD.length])).toEqual([
      ['Hawk', 'lobby.test', 10075, 'Norfolk', 1, 0, 0], ['Viper', 'lobby.test', 10075, 'Reno', 1, 0, 0]]);
    expect(result.personas[1]!.PROFILES.PROFILE_CHECKSUM).toEqual(new Array<number>(16).fill(0));
  });
  it('changes a hometown and a gender in place, keeping the record\'s PROFILES and password length; refuses a long town', () => {
    const slots = memory();
    seed(slots, [record('Hawk'), record('Viper')]);
    const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
    const c = new PersonaCard(mc, 0); c.load();
    c.setLogins([...c.personas().map((p) => ({ host: p.HOST, port: p.PORT, name: p.NAME, town: p.TOWN, gender: p.GENDER, savePassword: p.NAME === 'Viper', password: p.NAME === 'Viper' ? 'secret' : null }))]);
    c.save();
    const s = cardProfileEdits(slots);
    const key: PersonaKey = { host: 'lobby.test', port: 10075, name: 'Viper' };
    expect(s.setPersonaTown(key, 'Austin')).toBe(true);
    expect(s.setPersonaGender(key, 1)).toBe(true);
    expect(s.setPersonaTown(key, 'x'.repeat(21))).toBe(false);
    const got = reread(slots).result.personas;
    expect(got.map((p) => [p.NAME, p.TOWN, p.GENDER, p.SAVEPASSWORD, p.PASSWORD.length])).toEqual([['Hawk', '', 0, 0, 0], ['Viper', 'Austin', 1, 1, 6]]);
  });
  it('deletes one persona by its key through setLogins and save; the rest stand; an unknown key writes nothing', () => {
    const slots = memory();
    seed(slots, [record('Hawk', { TOWN: 'Norfolk' }), record('Viper'), record('Cobra')]);
    const s = cardProfileEdits(slots);
    expect(s.deletePersona({ host: 'lobby.test', port: 10075, name: 'Viper' })).toBe(true);
    expect(reread(slots).result.personas.map((p) => [p.NAME, p.TOWN])).toEqual([['Hawk', 'Norfolk'], ['Cobra', '']]);
    expect(s.deletePersona({ host: 'lobby.test', port: 10075, name: 'Viper' })).toBe(false);
    expect(s.deletePersona({ host: 'other.test', port: 10075, name: 'Hawk' })).toBe(false);
  });
  it('a file whose personas do not parse is refused, never overwritten', () => {
    const slots = memory();
    const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
    mc.mkdir(0, 0, PERSONA_SAVE_DIR);
    const fd = mc.open(0, 0, PERSONA_FILE_PATH, FIO.O_WRONLY | FIO.O_CREAT);
    mc.write(fd, 5_000, { CAcctDB: { AcctInfo: [{ nope: 1 }] }, CUIVarManager: { MPTAUNTMSG1: str('keep') } });
    mc.close(fd);
    const s = cardProfileEdits(slots);
    expect(s.usable()).toBe(false);
    expect(s.setTaunt(1, 'x')).toBe(false);
    expect(s.createPersona({ name: 'Viper', host: 'h', port: 1, town: '', gender: 0 })).toBe(false);
    const again = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_500 }), 0);
    expect(again.load().malformed).toBeDefined();
    expect(again.part(UI_VAR_MODULE)).toEqual({ MPTAUNTMSG1: str('keep') });
  });
});

describe('the universe a persona is filed under (research 153 §5, HOST (OC-3))', () => {
  const entry = (over: Record<string, unknown>) => ({ status: 0, name: 'U', dns: 'd.test', port: 9, description: '', universeStatus: 1, userCount: 0, maxUsers: 0, billing: '', billingName: '', extendedInfo: '', endOfList: false, ...over });
  it('is the first entry that is not the red dot (FUN_002fd7e0): its dns is LOBBY_HOST, its port LOBBY_PORT', async () => {
    const got = await readUniverseHost({ query: async () => ({ universes: [entry({ dns: 'red.test', universeStatus: 0 }), entry({ dns: 'a.test', port: 11 }), entry({ dns: 'b.test' })], news: [] }) });
    expect(got).toEqual({ host: 'a.test', port: 11 });
  });
  it('refuses a list with none open, and an empty one, with a reason', async () => {
    await expect(readUniverseHost({ query: async () => ({ universes: [entry({ universeStatus: 0 })], news: [] }) })).rejects.toThrow(/open/);
    await expect(readUniverseHost({ query: async () => ({ universes: [], news: [] }) })).rejects.toThrow(/no universe/i);
  });
});

describe('the disc\'s taunt captions (MU-13c, MU-3: the launcher seam)', () => {
  it('readTauntCaptions runs the facade\'s caption reader once per image; a facade with none refuses', async () => {
    const captions = vi.fn(async () => ({ '60762': 'x' }));
    const src = { list: async () => [], read: async () => new Uint8Array() };
    const a = discAssetsOf(src, { valves: async () => [], itemNames: async () => new Map(), captions });
    await a.readTauntCaptions!(); await a.readTauntCaptions!();
    expect(captions).toHaveBeenCalledOnce();
    await expect(discAssetsOf(src, { valves: async () => [], itemNames: async () => new Map() }).readTauntCaptions!()).rejects.toThrow();
  });
  const disc = process.env['SOCOM_DISC'];
  const present = !!disc && existsSync(join(disc, 'RUN/READERC.ZAR'));
  it.skipIf(!present)('dev disc: HudCLOC.rdr gives the five taunt defaults 60762-60766 and the five team messages 60757-60761 (reading: the disc\'s own file; SOCOM_DISC set)', async () => {
    const caps = await readHudCaptions(new FsAssetSource(disc!));
    expect(Object.keys(caps).length).toBeGreaterThan(100);
    for (const id of [60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766]) expect(caps[String(id)], String(id)).toMatch(/\S/);
    // the same texts tauntData's readTauntDefaults reads (one reading, two readers)
    expect([60762, 60763, 60764, 60765, 60766].map((i) => caps[String(i)])).toEqual(await readTauntDefaults(new FsAssetSource(disc!)));
  });
});

// ---------------------------------------------------------------- MU2-3: held without a RED (already right)

describe('the password is never touched (MU2-3: PASSWORD and SAVEPASSWORD, `cardEdits` `password: null`)', () => {
  it('every edit -- a taunt, a team message, a create, a home town, a gender, a delete of another -- keeps each record\'s password length and SAVE PASSWORD', () => {
    const slots = memory();
    seed(slots, [record('Hawk'), record('Viper')]);
    // Viper as the persona form's login leaves it under SAVE PASSWORD: YES with a 6-character password.
    const c = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    c.load();
    c.setLogins(c.personas().map((p) => ({ host: p.HOST, port: p.PORT, name: p.NAME, town: p.TOWN, gender: p.GENDER, savePassword: p.NAME === 'Viper', password: p.NAME === 'Viper' ? 'secret' : null })));
    c.save();
    const held = (name: string) => { const p = reread(slots).result.personas.find((r) => r.NAME === name)!; return [p.SAVEPASSWORD, p.PASSWORD.length]; };
    expect(held('Viper')).toEqual([1, 6]);
    const s = cardProfileEdits(slots);
    const viper: PersonaKey = { host: 'lobby.test', port: 10075, name: 'Viper' };
    const steps: [string, () => boolean][] = [
      ['taunt', () => s.setTaunt(0, 'Over here')], ['message', () => s.setMessage(4, 'Cover me')],
      ['create', () => s.createPersona({ name: 'Cobra', host: 'lobby.test', port: 10075, town: 'Reno', gender: 0 })],
      ['town', () => s.setPersonaTown(viper, 'Austin')], ['gender', () => s.setPersonaGender(viper, 1)],
      ['delete', () => s.deletePersona({ host: 'lobby.test', port: 10075, name: 'Hawk' })],
    ];
    for (const [what, step] of steps) {
      expect([what, step()]).toEqual([what, true]);
      expect([what, ...held('Viper')]).toEqual([what, 1, 6]);
    }
    expect(held('Cobra')).toEqual([0, 0]);
    expect(reread(slots).result.personas.map((p) => p.NAME)).toEqual(['Viper', 'Cobra']);
  });
});

describe('MU.R2: the memory card is the store (MU2-3)', () => {
  // CX-PERSONA: the row's modules now -- the card's edits (kept in `src/modern/profile`, where Home's card reads them too), the
  // card-save boundary, and the console's Persona adapter, screens and universe read that took over the section's.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
  const ROW = ['modern/profile/cardEdits.ts', 'modern/cardSave.ts', 'console/adapters/profile.ts', 'console/render/profile.ts', 'console/universe.ts'];

  it('the row\'s modules name no browser storage (code, not comments), and reach the page\'s only through pageStore\'s card and settings', () => {
    const offenders: string[] = [];
    const stores: string[] = [];
    for (const rel of ROW) {
      readFileSync(resolve(SRC, rel), 'utf8').split('\n').forEach((line, i) => {
        // As `test/pageStore.test.ts` reads code: line comments, doc-comment lines and backticked names set aside.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/`[^`]*`/g, '');
        if (/\b(localStorage|sessionStorage|indexedDB|caches)\b|\bnavigator\??\.storage\b|\bdocument\.cookie\b/.test(code)) offenders.push(`${rel}:${i + 1}`);
        const from = /from '(\.\.\/)+pageStore'/.test(code) ? code.match(/import \{([^}]*)\}/)?.[1] : undefined;
        if (from !== undefined) stores.push(`${rel}: ${from.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
    expect(stores.sort()).toEqual(['console/adapters/profile.ts: pageSettings', 'modern/profile/cardEdits.ts: pageCard']);
  });

  it('an edit lands in the card\'s slot and nowhere else: no write to the browser\'s own storages', () => {
    const raw = new Map<string, string>();
    const storage = { getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => { raw.set(k, String(v)); }, removeItem: (k: string) => { raw.delete(k); } };
    const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    try {
      const s = cardProfileEdits(slots);
      expect(s.setTaunt(1, 'Over here')).toBe(true);
      expect(s.createPersona({ name: 'Viper', host: 'lobby.test', port: 10075, town: '', gender: 0 })).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      expect(raw.size).toBeGreaterThan(0);
      const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
      expect(card.load().personas.map((p) => p.NAME)).toEqual(['Viper']);
      expect(card.part(UI_VAR_MODULE)).toEqual({ MPTAUNTMSG2: str('Over here') });
    } finally { setItem.mockRestore(); removeItem.mockRestore(); }
  });

  it('the typed password never reaches the card: the record keeps its length, the stored text holds none', () => {
    const raw = new Map<string, string>();
    const storage = { getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => { raw.set(k, String(v)); }, removeItem: (k: string) => { raw.delete(k); } };
    const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
    const secret = gen('pw');
    const c = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    c.load();
    c.setLogins([{ host: 'lobby.test', port: 10075, name: 'Viper', town: '', gender: 0, savePassword: true, password: secret }]);
    c.save();
    expect(cardProfileEdits(slots).setPersonaTown({ host: 'lobby.test', port: 10075, name: 'Viper' }, 'Austin')).toBe(true);
    expect([...raw.values()].some((v) => v.includes(secret))).toBe(false);
    expect(reread(slots).result.personas[0]!.PASSWORD.length).toBe(secret.length);
  });
});

describe("the card's states through the console's adapter, over the real store (MU2-3)", () => {
  const session = (): ModernSession => ({
    state: () => 'signed-out', account: () => null, ticket: () => null, error: () => null, remembers: () => false,
    onChange: () => () => undefined, signIn: async () => ({ ok: true }), create: async () => ({ ok: true }), signOut: async () => {}, close: () => {},
  });
  const launcher: LauncherState = { disc: () => 'empty', isoInserted: () => false, filename: () => null, onChange: () => () => undefined };
  const over = (slots: CardSlots) => liveProfile(() => {}, {
    session: session(), launcher, base: 'https://lobby.test', settings: { get: () => null, set: () => ({ ok: true }) },
    edits: cardProfileEdits(slots), readHost: async () => ({ host: 'lobby.test', port: 10075 }),
  });

  it('a blank card (no save file), no disc: no persona, slot 1, New persona offered; each phrase locked, never a key; a persona made there', async () => {
    const slots = memory();
    const a = over(slots);
    a.open('persona');
    await flush();
    const v = a.personas();
    if (v.kind !== 'ok') throw new Error(v.kind);
    expect([v.empty, v.slotLine, v.create.kind]).toEqual(['No persona on the card yet', 'Personas from memory card slot 1', 'ready']);
    const made = a.create({ name: 'Viper', town: '', gender: 0 });
    expect(made.ok).toBe(true);
    const e = a.editor(made.id!);
    if (e.kind !== 'ok') throw new Error(e.kind);
    expect(e.phrases).toHaveLength(10);
    for (const p of e.phrases) {
      expect(p.gated).toBe('locked');
      expect(p.value).not.toMatch(/_\d+_/);
    }
    expect(reread(slots).result.personas.map((p) => p.NAME)).toEqual(['Viper']);
    expect(personaId(reread(slots).result.personas[0]!)).toBe(made.id);
    a.dispose();
  });

  it('a save file that does not parse: the list says the card cannot be read, and every edit is refused, nothing written', async () => {
    const slots = memory();
    const mc = new Libmc(slots, { log: () => {}, now: () => 9_000 });
    mc.mkdir(0, 0, PERSONA_SAVE_DIR);
    const fd = mc.open(0, 0, PERSONA_FILE_PATH, FIO.O_WRONLY | FIO.O_CREAT);
    mc.write(fd, 5_000, { CAcctDB: { AcctInfo: [{ nope: 1 }] } });
    mc.close(fd);
    const a = over(slots);
    a.open('persona');
    await flush();
    expect(a.personas().kind).toBe('unreadable');
    expect(a.setPhrase('taunts', 0, 'x').ok).toBe(false);
    expect(a.create({ name: 'Viper', town: '', gender: 0 }).ok).toBe(false);
    expect(reread(slots).result.malformed).toBeDefined();
    a.dispose();
  });
});
