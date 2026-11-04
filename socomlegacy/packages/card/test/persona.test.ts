import { describe, expect, it } from 'vitest';
import {
  CardSlots, FIO, Libmc, MC_RESULT, PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER, PERSONA_FILE_PATH, PERSONA_FILE_SIZES_NO_UI_VARS, PERSONA_NAME_MAX,
  UI_VAR_KEY_BYTES_PLACEHOLDER, UI_VAR_MODULE, UI_VAR_TEN_KEYS_BYTES, uiVarModuleBytes,
  PERSONA_NO_MAXIMUM_READING, PERSONA_PASSWORD_MAX, PERSONA_PORT_READING, PERSONA_PROFILE_CHECKSUM_WORDS, PERSONA_SAVE_DIR,
  PERSONA_TOWN_READING, PersonaCard, PersonaMalformedError, formPersona, parsePersonaFile, personaFileSize, personaFromLogin, personasFor,
  withPersona, type CardStorage, type PersonaLogin, type PersonaRecord,
} from '../src/index';
import { FIXTURE_FILE_SIZES, ONE_BIN_PERSONAS, TWO_BIN_PERSONAS } from './personaReference';

/**
 * OPT-04a (research 135): the persona records of `CAcctDB/AcctInfo.rdr` as R7's JSON in the `BASCUS-97275SOCOMII` file
 * of the virtual card, read and written over PLAT-26a's libmc commands, on a card built in the test. The reference
 * records are the fixtures' fields (`personaReference.ts`, read once with `tools/cardFile.ts`).
 */

class RecordingStorage implements CardStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(`${key}=${value}`);
    this.data.set(key, String(value));
  }
}

const HOST = '192.0.2.10';
/** A typed password of `n` characters, made up for the test (distinctive, so a leak into a write would show). */
const typed = (n: number, mark = 'Q'): string => `${mark}7`.padEnd(n, 'z');
const { Succeed, NoEntry } = MC_RESULT;

function setup() {
  const storage = new RecordingStorage();
  const lines: string[] = [];
  const slots = new CardSlots(() => storage, () => undefined, { now: () => 5_000 });
  const mc = new Libmc(slots, { log: (l) => lines.push(l), now: () => 9_000 });
  /** Every libmc call, in order, as `name(args) -> result`. */
  const ops: string[] = [];
  for (const name of ['getInfo', 'open', 'close', 'seek', 'read', 'write', 'flush', 'mkdir', 'chdir', 'getDir', 'delete'] as const) {
    const real = (mc[name] as (...a: unknown[]) => unknown).bind(mc);
    (mc as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const out = real(...args);
      const shown = args.map((a) => (typeof a === 'object' ? 'data' : String(a)));
      const res = typeof out === 'object' && out !== null ? (out as { result: number }).result : out;
      ops.push(`${name}(${shown.join(',')}) -> ${String(res)}`);
      return out;
    };
  }
  return { storage, lines, slots, mc, ops, card: slots.slot(1) };
}

const login = (name: string, extra: Partial<PersonaLogin> = {}): PersonaLogin => ({
  host: HOST, name, password: typed(6), savePassword: true, gender: 0, ...extra,
});

function fileOf(s: ReturnType<typeof setup>) {
  const r = s.card.readFile(PERSONA_FILE_PATH.slice(1));
  if (!r.ok) throw new Error(JSON.stringify(r.failure));
  return r.value;
}

describe('the record, field by field (PC research 80 step 5; R7 §7 item 5)', () => {
  it('keeps each of the eight fields, the original\'s names', () => {
    const r = personaFromLogin(login('s27pa', { town: 'X', port: 1234, gender: 1 }));
    expect(Object.keys(r)).toEqual(['HOST', 'NAME', 'TOWN', 'GENDER', 'PORT', 'PASSWORD', 'SAVEPASSWORD', 'PROFILES']);
    expect(r).toEqual({
      HOST, NAME: 's27pa', TOWN: 'X', GENDER: 1, PORT: 1234, PASSWORD: { length: 6 }, SAVEPASSWORD: 1,
      PROFILES: { PROFILE_CHECKSUM: new Array(16).fill(0), PROFILE_INFO: [] },
    });
  });

  it('a new record takes the readings every card seen holds: TOWN empty, PORT 10075, sixteen zero checksum words', () => {
    expect([PERSONA_TOWN_READING, PERSONA_PORT_READING, PERSONA_PROFILE_CHECKSUM_WORDS]).toEqual(['', 10075, 16]);
    const r = personaFromLogin(login('a'));
    expect([r.TOWN, r.PORT, r.PROFILES.PROFILE_CHECKSUM]).toEqual(['', 10075, new Array(16).fill(0)]);
  });

  it('NAME is cut at 14 and the password\'s length at 12 (R7: the keyboard\'s caps)', () => {
    expect([PERSONA_NAME_MAX, PERSONA_PASSWORD_MAX]).toEqual([14, 12]);
    const r = personaFromLogin(login('ABCDEFGHIJKLMNOPQRST', { password: 'p'.repeat(20) }));
    expect([r.NAME, r.PASSWORD.length]).toEqual(['ABCDEFGHIJKLMN', 12]);
    expect(personaFromLogin(login('x'.repeat(14))).NAME).toBe('x'.repeat(14));
  });

  it('SAVE PASSWORD: YES keeps SAVEPASSWORD 1 and the password\'s length, never the password', () => {
    const r = personaFromLogin(login('s27pa', { password: typed(7) }));
    expect([r.SAVEPASSWORD, r.PASSWORD]).toEqual([1, { length: 7 }]);
    expect(JSON.stringify(r)).not.toContain(typed(7));
  });

  it('SAVE PASSWORD: NO keeps SAVEPASSWORD 0 and no length (R7 §2: it stores no password)', () => {
    const r = personaFromLogin(login('s27pa', { password: typed(7), savePassword: false }));
    expect([r.SAVEPASSWORD, r.PASSWORD]).toEqual([0, { length: 0 }]);
  });

  it('a login by the remember cookie (no password typed) keeps the saved length; its record keeps the rest', () => {
    const before = personaFromLogin(login('s27pa', { password: typed(7), town: 'T', gender: 1 }));
    const checksum = { ...before, PROFILES: { PROFILE_CHECKSUM: new Array(16).fill(3), PROFILE_INFO: [] } };
    const r = personaFromLogin({ host: HOST, name: 's27pa', password: null, savePassword: true, gender: 1 }, checksum);
    expect([r.PASSWORD.length, r.TOWN, r.PROFILES.PROFILE_CHECKSUM[0]]).toEqual([7, 'T', 3]);
  });

  it('never carries a field the login holds beyond the eight (a remember token, the typed password)', () => {
    const odd = { ...login('a', { password: typed(9, 'P') }), rememberToken: typed(12, 'R'), token: typed(12, 'T') } as PersonaLogin;
    const text = JSON.stringify(personaFromLogin(odd));
    for (const s of [typed(9, 'P'), typed(12, 'R'), typed(12, 'T')]) expect(text).not.toContain(s);
  });
});

describe('the list: one record per persona per HOST, appended (PC research 80; KNOWN [personas-per-server])', () => {
  it('a second persona is appended, as two.bin holds s16pc then s16pd', () => {
    const one = withPersona([], personaFromLogin(login('s16pc')));
    const two = withPersona(one, personaFromLogin(login('s16pd')));
    expect(two).toEqual(TWO_BIN_PERSONAS);
    expect(withPersona([], personaFromLogin(login('s27pa')))).toEqual(ONE_BIN_PERSONAS);
  });

  it('no maximum: a third and a fourth persona are appended too (a named reading, research 135 §5)', () => {
    expect(PERSONA_NO_MAXIMUM_READING).toBe(true);
    let list: PersonaRecord[] = [];
    for (const n of ['a', 'b', 'c', 'd']) list = withPersona(list, personaFromLogin(login(n)));
    expect(list.map((r) => r.NAME)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('the same persona on the same HOST is replaced in place, not appended', () => {
    let list = withPersona([], personaFromLogin(login('a')));
    list = withPersona(list, personaFromLogin(login('b')));
    list = withPersona(list, personaFromLogin(login('a', { savePassword: false })));
    expect(list.map((r) => [r.NAME, r.SAVEPASSWORD])).toEqual([['a', 0], ['b', 1]]);
  });

  it('the key is HOST, PORT and NAME: the same login on another PORT is another record (C8 #14; FUN_002fbce0 D:L199060-199062)', () => {
    let list = withPersona([], personaFromLogin(login('a', { port: 10_075 })));
    list = withPersona(list, personaFromLogin(login('a', { port: 10_076 })));
    expect(list.map((r) => [r.NAME, r.PORT])).toEqual([['a', 10_075], ['a', 10_076]]);
    list = withPersona(list, personaFromLogin(login('a', { port: 10_076, savePassword: false })));
    expect(list.map((r) => [r.PORT, r.SAVEPASSWORD])).toEqual([[10_075, 1], [10_076, 0]]);
  });

  it('saveLogin files two ports of one name as two records, each keeping its own; a saved list with one record per HOST and NAME still loads whole', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.saveLogin(login('a', { port: 10_075, town: 'X' }));
    pc.saveLogin(login('a', { port: 10_076 }));
    expect(pc.personas().map((r) => [r.PORT, r.TOWN])).toEqual([[10_075, 'X'], [10_076, '']]);
    pc.saveLogin(login('a', { port: 10_075 }));
    expect(pc.personas().map((r) => [r.PORT, r.TOWN])).toEqual([[10_075, 'X'], [10_076, '']]);
    // A login naming no port finds its record by HOST and NAME (the first) and keeps that PORT.
    pc.saveLogin(login('a'));
    expect(pc.personas().map((r) => r.PORT)).toEqual([10_075, 10_076]);
    const again = new PersonaCard(s.mc, 0).load();
    expect(again.personas.map((r) => r.PORT)).toEqual([10_075, 10_076]);
  });

  it('the same name on another HOST is another record; each server sees its own; the form shows its first', () => {
    let list = withPersona([], personaFromLogin(login('a', { host: 'h1' })));
    list = withPersona(list, personaFromLogin(login('a', { host: 'h2' })));
    list = withPersona(list, personaFromLogin(login('b', { host: 'h2' })));
    expect(list.length).toBe(3);
    expect(personasFor(list, 'h2').map((r) => r.NAME)).toEqual(['a', 'b']);
    expect(formPersona(list, 'h2')?.HOST).toBe('h2');
    expect(formPersona(list, 'h1')?.NAME).toBe('a');
    expect(formPersona(list, 'h3')).toBeUndefined();
  });
});

describe('the file\'s nominal size follows the persona count and the UI variables (PLAT-25; research 102 R102.9)', () => {
  it('4,784 B with none, 6,208 with one, 6,400 with two: the fixtures\' sizes, one.bin and two.bin holding the ten UI-variable keys', () => {
    expect([personaFileSize(0, 0), personaFileSize(1, 10), personaFileSize(2, 10)]).toEqual(FIXTURE_FILE_SIZES);
  });

  it('without the CUIVarManager module: 5,248 B with one (created.bin), 5,440 with two; the ten keys are 960 B on both cards', () => {
    expect([personaFileSize(0), personaFileSize(1), personaFileSize(2)]).toEqual(PERSONA_FILE_SIZES_NO_UI_VARS);
    expect(PERSONA_FILE_SIZES_NO_UI_VARS).toEqual([4_784, 5_248, 5_440]);
    expect(UI_VAR_TEN_KEYS_BYTES).toBe(6_208 - 5_248);
    expect(UI_VAR_TEN_KEYS_BYTES).toBe(6_400 - 5_440);
    expect(uiVarModuleBytes(0)).toBe(0);
    expect(uiVarModuleBytes(4)).toBe(4 * UI_VAR_KEY_BYTES_PLACEHOLDER);
  });

  it('past two, the step from one to two per record (a placeholder)', () => {
    expect(PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER).toBe(192);
    expect(personaFileSize(3, 10)).toBe(6_592);
    expect(personaFileSize(4, 10)).toBe(6_784);
    expect(personaFileSize(3)).toBe(5_632);
  });
});

describe('the file\'s JSON', () => {
  it('reads an absent file as no personas, and keeps the other modules\' parts it does not own', () => {
    expect(parsePersonaFile(undefined)).toEqual({ ok: true, personas: [], rest: {}, acctRest: {} });
    const r = parsePersonaFile({ CValveSaveManager: { v: 1 }, CAcctDB: { AcctInfo: [...ONE_BIN_PERSONAS] } });
    expect(r).toEqual({ ok: true, personas: ONE_BIN_PERSONAS, rest: { CValveSaveManager: { v: 1 } }, acctRest: {} });
  });

  it('keeps CAcctDB\'s own parts beside AcctInfo, as read', () => {
    const r = parsePersonaFile({ CAcctDB: { AcctInfo: [...ONE_BIN_PERSONAS], other: 1 } });
    expect(r).toMatchObject({ ok: true, acctRest: { other: 1 } });
  });

  it.each([
    ['not an object', 7],
    ['AcctInfo not a list', { CAcctDB: { AcctInfo: {} } }],
    ['a field missing', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], TOWN: undefined }] } }],
    ['a field beyond the eight', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], password: 'x' }] } }],
    ['PASSWORD a string', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], PASSWORD: typed(6) }] } }],
    ['a length past 12', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], PASSWORD: { length: 13 } }] } }],
    ['a length under NO', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], SAVEPASSWORD: 0 }] } }],
    ['NAME past 14', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], NAME: 'n'.repeat(15) }] } }],
    ['SAVEPASSWORD 2', { CAcctDB: { AcctInfo: [{ ...ONE_BIN_PERSONAS[0], SAVEPASSWORD: 2 }] } }],
  ])('refuses a malformed file: %s', (_why, data) => {
    expect(parsePersonaFile(data)).toMatchObject({ ok: false });
  });
});

describe('on the card, over PLAT-26a\'s libmc', () => {
  it('a fresh card has no personas: its Open answers NoEntry and nothing is written', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    expect(pc.load()).toEqual({ result: NoEntry, personas: [] });
    expect(s.storage.writes).toEqual([]);
  });

  it('a save makes the folder, deletes, opens WRONLY|CREAT, writes the nominal size, closes (FUN_0033dff0, FUN_003a05a0)', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    s.ops.length = 0;
    expect(pc.saveLogin(login('s27pa')).result).toBe(Succeed);
    expect(s.ops).toEqual([
      `mkdir(0,0,${PERSONA_SAVE_DIR}) -> 0`,
      `delete(0,0,${PERSONA_FILE_PATH}) -> ${NoEntry}`,
      `open(0,0,${PERSONA_FILE_PATH},${FIO.O_WRONLY | FIO.O_CREAT}) -> 1`,
      `write(1,5248,data) -> 5248`,   // created.bin's size: one persona, no CUIVarManager module (R102.9)
      'close(1) -> 0',
    ]);
    expect(fileOf(s).size).toBe(5_248);
    expect(fileOf(s).data).toEqual({ CAcctDB: { AcctInfo: ONE_BIN_PERSONAS } });
  });

  it('the load reads as the game does: Open RDONLY, GetDir for the size, Read, Close (FUN_0033d6d0, FUN_003a05a0)', () => {
    const s = setup();
    new PersonaCard(s.mc, 0).saveLogin(login('s27pa'));
    s.ops.length = 0;
    const back = new PersonaCard(s.mc, 0).load();
    expect(back).toEqual({ result: Succeed, personas: ONE_BIN_PERSONAS });
    expect(s.ops).toEqual([
      `open(0,0,${PERSONA_FILE_PATH},${FIO.O_RDONLY}) -> 2`, // the stub counts handles on (:669-684)
      `getDir(0,0,${PERSONA_FILE_PATH},1) -> 1`,
      'read(2,5248) -> 5248',
      'close(2) -> 0',
    ]);
  });

  it('a second persona is appended on the card, the size follows, and a reload reads both in order', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    pc.saveLogin(login('s16pc'));
    pc.saveLogin(login('s16pd'));
    expect(fileOf(s).size).toBe(5_440);
    expect(new PersonaCard(s.mc, 0).load().personas).toEqual(TWO_BIN_PERSONAS);
    expect(pc.form(HOST)?.NAME).toBe('s16pc');
  });

  it('keeps the parts of the file it does not own, and writes slot 2 through port 1', () => {
    const s = setup();
    s.card.makeDir('BASCUS-97275SOCOMII', 0);
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), 4_784, { CValveSaveManager: { HDD_ENABLE: 0 } }, 1);
    const pc = new PersonaCard(s.mc, 0);
    expect(pc.load()).toEqual({ result: Succeed, personas: [] });
    pc.saveLogin(login('a'));
    expect(fileOf(s).data).toMatchObject({ CValveSaveManager: { HDD_ENABLE: 0 } });
    const two = new PersonaCard(s.mc, 1);
    two.load();
    two.saveLogin(login('b'));
    const r = s.slots.slot(2).readFile(PERSONA_FILE_PATH.slice(1));
    expect(r.ok && (r.value.data as { CAcctDB: { AcctInfo: PersonaRecord[] } }).CAcctDB.AcctInfo[0]!.NAME).toBe('b');
  });

  it('a Delete that fails is ignored as the game ignores it: the save still opens WRONLY|CREAT (D:L295406-295412)', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    pc.saveLogin(login('a'));
    const held = s.mc.open(0, 0, PERSONA_FILE_PATH, FIO.O_RDONLY); // another handle: Delete answers DeniedPermit
    expect(held).toBeGreaterThan(0);
    s.ops.length = 0;
    const saved = pc.saveLogin(login('b'));
    expect(s.ops[1]).toBe(`delete(0,0,${PERSONA_FILE_PATH}) -> ${MC_RESULT.DeniedPermit}`);
    expect(s.ops[2]).toMatch(new RegExp(`^open\\(0,0,${PERSONA_FILE_PATH},${FIO.O_WRONLY | FIO.O_CREAT}\\) -> \\d+$`));
    expect(saved.result).toBe(Succeed);
    expect(saved.personas.map((r) => r.NAME)).toEqual(['a', 'b']);
  });

  it('a save is rebuilt from the registered modules only: a fourth part read from the file, and CAcctDB\'s own parts beside AcctInfo, are not written (FUN_0033dff0 D:L239190-239216; research 229 §4)', () => {
    const s = setup();
    s.card.makeDir('BASCUS-97275SOCOMII', 0);
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), 6_208, {
      CValveSaveManager: { HDD_ENABLE: 0 }, Stray: { left: 'by another writer' }, CUIVarManager: {}, CAcctDB: { AcctInfo: [...ONE_BIN_PERSONAS], other: 1 },
    }, 1);
    const pc = new PersonaCard(s.mc, 0);
    expect(pc.load()).toEqual({ result: Succeed, personas: ONE_BIN_PERSONAS });
    expect(pc.part('Stray')).toBeUndefined();
    expect(pc.saveLogin(login('b')).result).toBe(Succeed);
    const data = fileOf(s).data as Record<string, unknown>;
    // The order of the module list on every game-written card (two.bin, `tools/test/cardFileDev.test.ts`), whatever the file read held.
    expect(Object.keys(data)).toEqual([UI_VAR_MODULE, 'CValveSaveManager', 'CAcctDB']);
    expect(data.CValveSaveManager).toEqual({ HDD_ENABLE: 0 });
    expect(Object.keys(data.CAcctDB as object)).toEqual(['AcctInfo']);
    expect((data.CAcctDB as { AcctInfo: PersonaRecord[] }).AcctInfo.map((r) => r.NAME)).toEqual(['s27pa', 'b']);
    expect(pc.contents().data).toEqual(data);
  });

  it('a part is one of the two modules beside CAcctDB: any other name is refused, as CAcctDB is', () => {
    const pc = new PersonaCard(setup().mc, 0);
    expect(() => pc.setPart('Stray', { x: 1 })).toThrow();
    pc.setPart('CValveSaveManager', { v: 1 });
    pc.setPart(UI_VAR_MODULE, {});
    expect(Object.keys(pc.contents().data as object)).toEqual([UI_VAR_MODULE, 'CValveSaveManager', 'CAcctDB']);
  });

  it('after a malformed load, a save is refused until the caller discards the unreadable list (OPT-05f\'s path)', () => {
    const s = setup();
    s.card.makeDir('BASCUS-97275SOCOMII', 0);
    const bad = { CAcctDB: { AcctInfo: [{ NAME: 1 }] } };
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), 6_208, bad, 1);
    const pc = new PersonaCard(s.mc, 0);
    expect(pc.load().malformed).toBeTypeOf('string');
    s.ops.length = 0;
    expect(() => pc.saveLogin(login('a'))).toThrow(PersonaMalformedError);
    expect(s.ops).toEqual([]);
    expect(fileOf(s).data).toEqual(bad);
    pc.discardMalformed();
    expect(pc.saveLogin(login('a')).result).toBe(Succeed);
    expect((fileOf(s).data as { CAcctDB: { AcctInfo: PersonaRecord[] } }).CAcctDB.AcctInfo.map((r) => r.NAME)).toEqual(['a']);
  });

  it('a malformed file loads with no personas and says why (the commands succeeded), and the load writes nothing', () => {
    const s = setup();
    s.card.makeDir('BASCUS-97275SOCOMII', 0);
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), 6_208, { CAcctDB: { AcctInfo: [{ NAME: 1 }] } }, 1);
    const writes = s.storage.writes.length;
    const got = new PersonaCard(s.mc, 0).load();
    expect(got).toMatchObject({ result: Succeed, personas: [] });
    expect(got.malformed).toBeTypeOf('string');
    expect(s.storage.writes.length).toBe(writes);
  });

  it('a login with SAVE PASSWORD: YES: no localStorage write holds the password or the remember token', () => {
    const s = setup();
    const password = typed(11, 'P');
    const remember = typed(32, 'R');
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    const odd = { ...login('s27pa', { password }), rememberToken: remember } as PersonaLogin;
    const saved = pc.saveLogin(odd);
    expect(saved.result).toBe(Succeed);
    expect(s.storage.writes.length).toBeGreaterThan(0);
    for (const w of [...s.storage.writes, ...s.lines]) {
      expect(w).not.toContain(password);
      expect(w).not.toContain(remember);
    }
    const rec = new PersonaCard(s.mc, 0).load().personas[0]!;
    expect([rec.SAVEPASSWORD, rec.PASSWORD.length]).toEqual([1, Math.min(password.length, 12)]);
  });

  it('a failed save answers the libmc result and leaves the list in memory as it was', () => {
    const s = setup();
    s.card.remove(0);
    const pc = new PersonaCard(s.mc, 0);
    expect(pc.load().result).toBe(NoEntry);
    expect(pc.saveLogin(login('a')).result).toBe(NoEntry);
    expect(pc.personas()).toEqual([]);
  });
});

describe('the account list as the form leaves it, for the caller that writes the file itself (ONL-06: SaveConfig, research 153 §5)', () => {
  it('setLogins replaces the list in memory by the personas of the form, in their order, and writes nothing', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    pc.saveLogin(login('a'));
    pc.saveLogin(login('b'));
    const writes = s.storage.writes.length;
    const list = pc.setLogins([login('b', { savePassword: false, password: null, town: 'T', gender: 1, port: 7 }), login('c', { savePassword: false, password: null })]);
    expect(list.map((r) => r.NAME)).toEqual(['b', 'c']);
    expect(pc.personas()).toEqual(list);
    expect(list[0]).toMatchObject({ TOWN: 'T', GENDER: 1, PORT: 7, SAVEPASSWORD: 0, PASSWORD: { length: 0 } });
    expect(s.storage.writes.length).toBe(writes);
  });

  it('a persona already held keeps its PROFILES; a deleted one is gone', () => {
    const s = setup();
    s.card.makeDir(PERSONA_SAVE_DIR.slice(1), 0);
    const held = { ...personaFromLogin(login('a')), PROFILES: { PROFILE_CHECKSUM: Array.from({ length: 16 }, (_, i) => i), PROFILE_INFO: [] } };
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(2), { CAcctDB: { AcctInfo: [held, personaFromLogin(login('gone'))] } }, 1);
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    const list = pc.setLogins([login('a', { savePassword: false, password: null })]);
    expect(list).toHaveLength(1);
    expect(list[0]!.PROFILES.PROFILE_CHECKSUM).toEqual(held.PROFILES.PROFILE_CHECKSUM);
  });

  it("a persona is its HOST, PORT and NAME (the account list's key, FUN_002fbce0 D:L199058-199066): one name on two ports of a host keeps each record's own PROFILES", () => {
    const s = setup();
    s.card.makeDir(PERSONA_SAVE_DIR.slice(1), 0);
    const sum = (n: number) => ({ PROFILE_CHECKSUM: new Array<number>(16).fill(n), PROFILE_INFO: [] });
    const onA = { ...personaFromLogin(login('a', { port: 10075 })), PROFILES: sum(1) };
    const onB = { ...personaFromLogin(login('a', { port: 10076 })), PROFILES: sum(2) };
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(2), { CAcctDB: { AcctInfo: [onA, onB] } }, 1);
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    const form = { savePassword: false, password: null } as const;
    const list = pc.setLogins([login('a', { ...form, port: 10075 }), login('a', { ...form, port: 10076 }), login('a', { ...form, port: 10077 })]);
    expect(list.map((r) => [r.PORT, r.PROFILES.PROFILE_CHECKSUM[0]])).toEqual([[10075, 1], [10076, 2], [10077, 0]]);   // the third is a new persona: zeros
    // A login that names no port (OPT-04a's callers) still finds its record by HOST and NAME, and keeps that record's PORT.
    expect(pc.setLogins([login('a', form)]).map((r) => [r.PORT, r.PROFILES.PROFILE_CHECKSUM[0]])).toEqual([[10075, 1]]);
  });

  it('contents is the file a save would write: the nominal size for the count and the JSON, the other modules kept, nothing else (FUN_0033dff0 D:L239190-239216)', () => {
    const s = setup();
    s.card.makeDir(PERSONA_SAVE_DIR.slice(1), 0);
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(0), { CValveSaveManager: { a: 1 }, options: { a: 1 }, CAcctDB: { other: 2, AcctInfo: [] } }, 1);
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    expect(pc.contents()).toEqual({ size: personaFileSize(0), data: { CValveSaveManager: { a: 1 }, CAcctDB: { AcctInfo: [] } } });
    pc.setLogins([login('a'), login('b')]);
    const c = pc.contents();
    expect(c.size).toBe(personaFileSize(2));
    expect(c.data).toEqual({ CValveSaveManager: { a: 1 }, CAcctDB: { AcctInfo: pc.personas() } });
  });

  it('restore adopts what a read gave, as load does after its Read; a malformed file answers false and guards the next change', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    const one = personaFromLogin(login('a'));
    expect(pc.restore({ keep: 1, CValveSaveManager: { v: 1 }, CAcctDB: { AcctInfo: [one] } })).toBe(true);
    expect(pc.personas()).toEqual([one]);
    expect(pc.contents().data).toEqual({ CValveSaveManager: { v: 1 }, CAcctDB: { AcctInfo: [one] } });   // `keep` is no module: not carried
    expect(pc.restore(undefined)).toBe(true);
    expect(pc.personas()).toEqual([]);
    expect(pc.restore({ CAcctDB: { AcctInfo: [{ ...one, PASSWORD: 'plain' }] } })).toBe(false);
    expect(pc.personas()).toEqual([]);
    expect(() => pc.setLogins([login('b')])).toThrow(PersonaMalformedError);
    pc.discardMalformed();
    expect(pc.setLogins([login('b')]).map((r) => r.NAME)).toEqual(['b']);
  });

  it('neither path carries a password: a typed one is its length under YES, nothing under NO', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    const password = typed(9, 'W');
    pc.setLogins([login('a', { password, savePassword: true }), login('b', { password, savePassword: false })]);
    const text = JSON.stringify(pc.contents());
    expect(text).not.toContain(password);
    expect(pc.personas().map((r) => [r.SAVEPASSWORD, r.PASSWORD.length])).toEqual([[1, 9], [0, 0]]);
  });
});

describe('the CUIVarManager module beside CAcctDB (web research 301 §6; research 102 R102.9)', () => {
  const TEN = Object.fromEntries([1, 2, 3, 4, 5].flatMap((n) => [
    [`MPLOCALSOP${n}`, { type: 'string', value: `SOP ${n}` }], [`MPTAUNTMSG${n}`, { type: 'string', value: `TAUNT ${n}` }],
  ]));

  it('a part set is written with CAcctDB, the size counting its keys, and read back by a fresh load', () => {
    const s = setup();
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    pc.setPart(UI_VAR_MODULE, TEN);
    expect(pc.saveLogin(login('s27pa')).result).toBe(Succeed);
    expect(fileOf(s).size).toBe(6_208);                                                 // one.bin's: one persona and the ten keys
    expect(fileOf(s).data).toEqual({ CUIVarManager: TEN, CAcctDB: { AcctInfo: ONE_BIN_PERSONAS } });
    const back = new PersonaCard(s.mc, 0);
    back.load();
    expect(back.part(UI_VAR_MODULE)).toEqual(TEN);
    expect(back.contents().size).toBe(6_208);
  });

  it('save writes the file as it stands, the other modules kept; CAcctDB is no part', () => {
    const s = setup();
    s.card.makeDir(PERSONA_SAVE_DIR.slice(1), 0);
    s.card.writeFile(PERSONA_FILE_PATH.slice(1), 6_400, { CValveSaveManager: { v: 1 }, CAcctDB: { AcctInfo: [...TWO_BIN_PERSONAS] } }, 1);
    const pc = new PersonaCard(s.mc, 0);
    pc.load();
    expect(pc.part('CValveSaveManager')).toEqual({ v: 1 });
    expect(pc.part('CAcctDB')).toBeUndefined();
    expect(() => pc.setPart('CAcctDB', {})).toThrow();
    pc.setPart(UI_VAR_MODULE, TEN);
    expect(pc.save()).toBe(Succeed);
    expect(fileOf(s)).toMatchObject({ size: 6_400, data: { CValveSaveManager: { v: 1 }, CUIVarManager: TEN, CAcctDB: { AcctInfo: TWO_BIN_PERSONAS } } });
    expect(Object.keys(fileOf(s).data as object)).toEqual([UI_VAR_MODULE, 'CValveSaveManager', 'CAcctDB']);   // the module list's order, not the file's
    pc.setPart(UI_VAR_MODULE, undefined);
    expect(pc.contents().size).toBe(5_440);
  });
});
