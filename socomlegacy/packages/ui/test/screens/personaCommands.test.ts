import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, UIVAR_LONGEVITY, type UiVarValue } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  ACCT_FIELD_BYTES, AcctDb, NEW_PERSONA_CAPTION, NEW_PERSONA_INDEX, PATCH_LEVEL, PERSONA_COMMAND_ROWS, PERSONA_LIST_ROWS, PersonaCommands,
  patchWords, type PersonaCommandsOptions, type PersonaLobby,
} from '../../src/screens/personaCommands';
import { UniverseList, type UniverseEntry } from '../../src/screens/universeCommands';

/**
 * ONL-06's rows (web research 153): what `dlgNetPlayerName.rdr`'s set dispatches that no earlier task answered, and
 * the two SELECT UNIVERSE's CROSS runs before it -- each against its transcription of the cited function, over a
 * valve store, a UI variable manager, the client's account list and universe list made in the test. Nothing here is
 * measured on the original running.
 */

const HOST = 'lobby.test', PORT = 10075;
/** A typed password, made up for the tests. */
const TYPED = 'secret';

/** A `ui::UI_COMMAND`: the argument's name at +8, and CompareValues' / GetMUISPersonaInfo's bytes past +0x10. */
const cmd = (fn: string, arg = 'NA', tail: number[] = [], anim = 'a'): ZAnimUiCommand => {
  const bytes = new Uint8Array(0x10 + Math.max(tail.length, 8));
  bytes.set(tail, 0x10);
  return { anim, sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes };
};

const universe = (over: Partial<UniverseEntry> = {}): UniverseEntry => ({
  status: 0, name: 'Local', dns: HOST, port: PORT, description: 'd', universeStatus: 1, userCount: 0, maxUsers: 256, billing: '', billingName: '',
  extendedInfo: '', endOfList: true, ...over,
});

function setup(over: Partial<PersonaCommandsOptions> = {}, universes: UniverseEntry[] = [universe()]) {
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  const db = new AcctDb();
  const list = new UniverseList({ uiVars });
  for (const u of universes) list.entry(u);
  const events: number[] = [];
  let input: string | null = null;
  /** The running animation's name table (`FUN_0026ed60`), for the commands that index it past +0x10. */
  let names: string[] = ['NA'];
  const commands = new PersonaCommands({
    valves: () => valves, uiVars, db, universes: list, inputString: () => input, name: (_c, i) => names[i] ?? null,
    event: (k) => { events.push(k); }, ...over,
  });
  const host = new UiCommandHost({ log: () => undefined });
  commands.register(host);
  const run = (c: ZAnimUiCommand): boolean => { const o = host.dispatch(c); if (o.kind !== 'table') throw new Error(`${c.fn}: ${o.kind}`); return o.answer; };
  const str = (name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
  /** The form as `LobbyConnect` and the keyboards leave it. */
  const form = (f: { name?: string; password?: string; hometown?: string; gender?: number; save?: number }): void => {
    uiVars.set(uiVars.add('LOBBY_HOST', null, 2), { type: 'string', value: HOST });
    uiVars.set(uiVars.add('LOBBY_PORT', null, 2), { type: 'int', value: PORT });
    if (f.name !== undefined) uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: f.name });
    if (f.password !== undefined) uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: f.password });
    if (f.hometown !== undefined) uiVars.set(uiVars.add('PLAYERHOMETOWN', null, 1), { type: 'string', value: f.hometown });
    valves.set('PLAYERGENDER', f.gender ?? 0, VALVE_TYPE.PERSIST);
    valves.set('SecurePassword', f.save ?? 0, VALVE_TYPE.PERM);
  };
  const rows = (): UiVarValue | undefined => uiVars.find('PLAYERPERSONALIST')?.value;
  return { valves, uiVars, db, list, commands, host, run, str, form, rows, events, setInput: (s: string | null) => { input = s; }, setNames: (n: string[]) => { names = n; } };
}

const row = (i: number, name: string): UiVarValue => ({ type: 'array', value: [{ type: 'int', value: i }, { type: 'string', value: name }] });
const NEW = row(NEW_PERSONA_INDEX, NEW_PERSONA_CAPTION);
const rec = (name: string, over: Partial<{ password: string; hometown: string; gender: number; savePassword: number; host: string; port: number }> = {}) =>
  ({ host: HOST, port: PORT, name, password: '', hometown: '', gender: 0, savePassword: 0, ...over });

describe('the rows (PLAT-08\'s table)', () => {
  it('each row\'s index, id and function are the table\'s, and each is bound', () => {
    const t = setup();
    for (const r of PERSONA_COMMAND_ROWS) {
      const tr = UI_COMMAND_TABLE[r.row]!;
      expect([tr.id, tr.name, tr.fn]).toEqual([r.id, r.name, r.fn]);
      expect(uiCommandRowByName(r.name)?.index).toBe(r.row);
      expect(t.host.dispatch(cmd(r.name)).kind).toBe('table');
    }
    expect(PERSONA_COMMAND_ROWS.map((r) => r.name)).toEqual([
      'LobbyLogout', 'NetCensorText', 'PruneUIVarSpaces', 'LobbyConnect', 'UpdateAcctInfo', 'GetMUISPersonaInfo', 'DeleteMUISPersona', 'CompareValues',
      'MUISPersonaExists', 'VerifyPatchLevel',
    ]);
  });
});

describe('the account list (0x44fc60: FUN_002fb920 .. FUN_002fd510)', () => {
  it('update appends a new HOST, PORT and NAME, and rewrites the one it finds (FUN_002fbce0)', () => {
    const db = new AcctDb();
    db.update(HOST, PORT, 'alpha', 'pw', 'Town', 1, 1);
    db.update(HOST, PORT, 'bravo', null, null, 0, 0);
    db.update('other.test', PORT, 'alpha', 'x', '', 0, 1);
    db.update(HOST, 10076, 'alpha', 'y', '', 0, 1);
    expect(db.records().map((r) => `${r.host}:${r.port} ${r.name}`)).toEqual([
      'lobby.test:10075 alpha', 'lobby.test:10075 bravo', 'other.test:10075 alpha', 'lobby.test:10076 alpha',
    ]);
    expect(db.count(HOST, PORT)).toBe(2);
    db.update(HOST, PORT, 'alpha', 'new', 'Here', 0, 1);
    expect(db.records()[0]).toEqual({ host: HOST, port: PORT, name: 'alpha', password: 'new', hometown: 'Here', gender: 0, savePassword: 1 });
    expect(db.records()).toHaveLength(4);
  });

  it('a name compared exactly: another case is another persona (strcmp, FUN_00198f18)', () => {
    const db = new AcctDb();
    db.update(HOST, PORT, 'alpha', null, null, 0, 0);
    db.update(HOST, PORT, 'Alpha', null, null, 0, 0);
    expect(db.count(HOST, PORT)).toBe(2);
    expect(db.exists(HOST, PORT, 'ALPHA')).toBe(false);
  });

  it('no name, or an empty one, changes nothing (FUN_002fd0d0\'s guard)', () => {
    const db = new AcctDb();
    db.update(HOST, PORT, null, 'pw', 't', 0, 1);
    db.update(HOST, PORT, '', 'pw', 't', 0, 1);
    expect(db.records()).toEqual([]);
  });

  it('SAVE PASSWORD: NO hands no password: a new record\'s is empty, a held one keeps its own (movz t0, zero, t3 at 0x2fd0ec)', () => {
    const db = new AcctDb();
    db.update(HOST, PORT, 'alpha', 'typed', 't', 0, 0);
    expect(db.records()[0]!.password).toBe('');
    db.update(HOST, PORT, 'alpha', 'kept', 't', 0, 1);
    db.update(HOST, PORT, 'alpha', 'other', 't', 0, 0);
    expect(db.records()[0]).toMatchObject({ password: 'kept', savePassword: 0 });
  });

  it('a null hometown is left as it stands; the fields are cut as strncpy cuts them (0x80, 0x20, 0x20, 0x3f bytes)', () => {
    const db = new AcctDb();
    db.update(HOST, PORT, 'alpha', 'pw', 'Town', 0, 1);
    db.update(HOST, PORT, 'alpha', 'pw', null, 0, 1);
    expect(db.records()[0]!.hometown).toBe('Town');
    expect(ACCT_FIELD_BYTES).toEqual({ host: 0x80, name: 0x20, password: 0x20, hometown: 0x3f });
    db.update('h'.repeat(200), 1, 'n'.repeat(40), 'p'.repeat(40), 't'.repeat(80), 0, 1);
    const r = db.records()[1]!;
    expect([r.host.length, r.name.length, r.password.length, r.hometown.length]).toEqual([0x80, 0x20, 0x20, 0x3f]);
  });

  it('the getters walk the HOST and PORT\'s records by place; past them: null, 0, 0', () => {
    const db = new AcctDb();
    db.put(rec('other', { host: 'x' }));
    db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 1, savePassword: 1 }));
    db.put(rec('bravo'));
    expect([db.name(HOST, PORT, 0), db.password(HOST, PORT, 0), db.hometown(HOST, PORT, 0), db.gender(HOST, PORT, 0), db.savePassword(HOST, PORT, 0)]).toEqual(['alpha', 'a', 'A', 1, 1]);
    expect(db.name(HOST, PORT, 1)).toBe('bravo');
    expect([db.name(HOST, PORT, 2), db.password(HOST, PORT, 2), db.hometown(HOST, PORT, 2), db.gender(HOST, PORT, 2), db.savePassword(HOST, PORT, 2)]).toEqual([null, null, null, 0, 0]);
  });

  it('indexOf is the name\'s place among the HOST and PORT\'s records, their count when it is not there (FUN_002fb9f0)', () => {
    const db = new AcctDb();
    db.put(rec('alpha'));
    db.put(rec('x', { host: 'x' }));
    db.put(rec('bravo'));
    expect([db.indexOf(HOST, PORT, 'alpha'), db.indexOf(HOST, PORT, 'bravo'), db.indexOf(HOST, PORT, 'none')]).toEqual([0, 1, 2]);
  });

  it('remove erases the place\'s record; a place past them erases nothing (FUN_002fbae0)', () => {
    const db = new AcctDb();
    db.put(rec('alpha'));
    db.put(rec('x', { host: 'x' }));
    db.put(rec('bravo'));
    db.remove(HOST, PORT, 5);
    expect(db.records()).toHaveLength(3);
    db.remove(HOST, PORT, 1);
    expect(db.records().map((r) => r.name)).toEqual(['alpha', 'x']);
  });
});

describe('UpdateAcctInfo (FUN_00275130)', () => {
  it('writes the form into the account list and rebuilds PLAYERPERSONALIST: the personas, then <New Persona> up to three rows', () => {
    const t = setup();
    t.form({ name: 'alpha', password: TYPED, hometown: 'Town', gender: 1, save: 1 });
    expect(t.run(cmd('UpdateAcctInfo'))).toBe(true);
    expect(t.db.records()).toEqual([{ host: HOST, port: PORT, name: 'alpha', password: TYPED, hometown: 'Town', gender: 1, savePassword: 1 }]);
    expect(t.rows()).toEqual({ type: 'array', value: [row(0, 'alpha'), NEW, NEW] });
    expect(PERSONA_LIST_ROWS).toBe(3);
    expect([NEW_PERSONA_CAPTION, NEW_PERSONA_INDEX]).toEqual(['<New Persona>', -1]);
  });

  it('under SAVE PASSWORD: NO the typed password does not reach the list', () => {
    const t = setup();
    t.form({ name: 'alpha', password: TYPED, save: 0 });
    t.run(cmd('UpdateAcctInfo'));
    expect(t.db.records()[0]).toMatchObject({ password: '', savePassword: 0 });
  });

  it('with no name typed nothing is written, and the list is three <New Persona> rows', () => {
    const t = setup();
    t.form({});
    t.run(cmd('UpdateAcctInfo'));
    expect(t.db.records()).toEqual([]);
    expect(t.rows()).toEqual({ type: 'array', value: [NEW, NEW, NEW] });
  });

  it('three personas leave no <New Persona> row, and a fourth held in the list is listed too (no cap in FUN_00276af0)', () => {
    const t = setup();
    for (const n of ['a', 'b', 'c']) t.db.put(rec(n));
    t.form({});
    t.run(cmd('UpdateAcctInfo'));
    expect(t.rows()).toEqual({ type: 'array', value: [row(0, 'a'), row(1, 'b'), row(2, 'c')] });
    t.db.put(rec('d'));
    t.run(cmd('UpdateAcctInfo'));
    expect(t.rows()).toEqual({ type: 'array', value: [row(0, 'a'), row(1, 'b'), row(2, 'c'), row(3, 'd')] });
  });

  it('the variables\' longevities: LOBBY_HOST and LOBBY_PORT permanent, the form\'s three and the list temporary; the valves PERSIST and PERM', () => {
    const t = setup();
    t.run(cmd('UpdateAcctInfo'));
    const L = (n: string) => t.uiVars.find(n)?.longevity;
    expect([L('LOBBY_HOST'), L('LOBBY_PORT')]).toEqual([UIVAR_LONGEVITY.PERMANENT, UIVAR_LONGEVITY.PERMANENT]);
    expect([L('PLAYERNAMEVAR'), L('PLAYERPASSWORD'), L('PLAYERHOMETOWN'), L('PLAYERPERSONALIST')]).toEqual([1, 1, 1, 1]);
    expect([t.valves.find('PLAYERGENDER')?.type, t.valves.find('SecurePassword')?.type]).toEqual([VALVE_TYPE.PERSIST, VALVE_TYPE.PERM]);
  });

  it('LOBBY_PORT as a real is truncated', () => {
    const t = setup();
    t.form({ name: 'alpha' });
    t.uiVars.set('LOBBY_PORT', { type: 'real', value: 10075.9 });
    t.run(cmd('UpdateAcctInfo'));
    expect(t.db.records()[0]!.port).toBe(10075);
  });
});

describe('GetMUISPersonaInfo (FUN_00275350)', () => {
  it('byte +0x10 set: the argument is the place (atoi) -- the list\'s CROSS on a saved persona fills the form', () => {
    const t = setup();
    t.db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 0, savePassword: 1 }));
    t.db.put(rec('bravo', { password: 'b', hometown: 'B', gender: 1, savePassword: 0 }));
    t.form({ name: 'typed', password: 'typed', hometown: 'typed' });
    t.setInput('1');
    expect(t.run(cmd('GetMUISPersonaInfo', 'INPUT_STRING', [1]))).toBe(true);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['bravo', 'b', 'B']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([1, 0]);
  });

  it('byte +0x10 clear: the argument is the name (FUN_002fb9f0) -- the keyboard\'s ON_SKB_APPLY on a name already saved', () => {
    const t = setup();
    t.db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 1, savePassword: 1 }));
    t.form({ name: 'alpha' });
    t.setInput('alpha');
    t.run(cmd('GetMUISPersonaInfo', 'INPUT_STRING', [0]));
    expect([t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['a', 'A']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([1, 1]);
  });

  it('a place past the list leaves the three variables and zeroes the two valves through their watchers', () => {
    const t = setup();
    t.form({ name: 'typed', password: 'pw', hometown: 'h', gender: 1, save: 1 });
    const heard: string[] = [];
    t.valves.watch('PLAYERGENDER', 3, (v) => heard.push(`${v.name}=${v.value}`));
    t.valves.watch('SecurePassword', 3, (v) => heard.push(`${v.name}=${v.value}`));
    t.run(cmd('GetMUISPersonaInfo', '7', [1]));
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['typed', 'pw', 'h']);
    expect(heard).toEqual(['PLAYERGENDER=0', 'SecurePassword=0']);
  });

  it('no argument (INPUT_STRING with no input): nothing', () => {
    const t = setup();
    t.db.put(rec('alpha', { gender: 1 }));
    t.form({ name: 'x' });
    t.setInput(null);
    expect(t.run(cmd('GetMUISPersonaInfo', 'INPUT_STRING', [1]))).toBe(true);
    expect(t.str('PLAYERNAMEVAR')).toBe('x');
  });
});

describe('DeleteMUISPersona (FUN_002761a0)', () => {
  it('erases the place\'s record and rebuilds the list; the form is left when it showed another persona', () => {
    const t = setup();
    for (const n of ['alpha', 'bravo']) t.db.put(rec(n, { password: n }));
    t.form({ name: 'alpha', password: 'alpha' });
    t.setInput('1');
    expect(t.run(cmd('DeleteMUISPersona', 'INPUT_STRING'))).toBe(true);
    expect(t.db.records().map((r) => r.name)).toEqual(['alpha']);
    expect(t.str('PLAYERNAMEVAR')).toBe('alpha');
    expect(t.rows()).toEqual({ type: 'array', value: [row(0, 'alpha'), NEW, NEW] });
  });

  it('deleting the persona the form shows (compared without case, FUN_00198b80) puts the first of the rest in the form', () => {
    const t = setup();
    t.db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 0, savePassword: 0 }));
    t.db.put(rec('bravo', { password: 'b', hometown: 'B', gender: 1, savePassword: 1 }));
    t.form({ name: 'ALPHA', password: 'x', hometown: 'x' });
    t.run(cmd('DeleteMUISPersona', '0'));
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['bravo', 'b', 'B']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([1, 1]);
  });

  it('deleting the only persona, shown in the form, empties the form (the string at 0x3eead8)', () => {
    const t = setup();
    t.db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 1, savePassword: 1 }));
    t.form({ name: 'alpha', password: 'a', hometown: 'A', gender: 1, save: 1 });
    t.run(cmd('DeleteMUISPersona', '0'));
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['', '', '']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([0, 0]);
    expect(t.rows()).toEqual({ type: 'array', value: [NEW, NEW, NEW] });
  });
});

describe('MUISPersonaExists (FUN_00276580)', () => {
  it('true for a NAME held under LOBBY_HOST and LOBBY_PORT, compared exactly', () => {
    const t = setup();
    t.db.put(rec('alpha'));
    t.db.put(rec('other', { host: 'x' }));
    t.form({});
    t.setInput('alpha');
    expect(t.run(cmd('MUISPersonaExists', 'INPUT_STRING'))).toBe(true);
    expect(t.run(cmd('MUISPersonaExists', 'Alpha'))).toBe(false);
    expect(t.run(cmd('MUISPersonaExists', 'other'))).toBe(false);
  });
});

describe('CompareValues (FUN_00274db0)', () => {
  const NAMES = ['NA', 'anim', 'INPUT_STRING', '-1', 'CompareValues', 'MYVAR', 'Abc'];
  it('VALUE1 against VALUE2, INPUT_STRING replaced by the animation\'s input: the persona list\'s "-1" test', () => {
    const t = setup();
    t.setNames(NAMES);
    t.setInput('-1');
    expect(t.run(cmd('CompareValues', 'NA', [2, 0, 3, 0, 0, 0]))).toBe(true);
    t.setInput('0');
    expect(t.run(cmd('CompareValues', 'NA', [2, 0, 3, 0, 0, 0]))).toBe(false);
  });

  it('UIVAR1 / UIVAR2 read a string variable; one that is no string compares by its name', () => {
    const t = setup();
    t.setNames(NAMES);
    t.uiVars.add('MYVAR', { type: 'string', value: 'Abc' }, 1);
    expect(t.run(cmd('CompareValues', 'NA', [5, 1, 6, 0, 0, 0]))).toBe(true);
    t.uiVars.set('MYVAR', { type: 'int', value: 3 });
    expect(t.run(cmd('CompareValues', 'NA', [5, 1, 6, 0, 0, 0]))).toBe(false);
    expect(t.run(cmd('CompareValues', 'NA', [5, 1, 5, 0, 0, 0]))).toBe(true);       // "MYVAR" against "MYVAR"
  });

  it('CASE_INSENSITIVE (+0x14) folds case; without it the compare is exact', () => {
    const t = setup();
    t.setNames(NAMES);
    t.setInput('ABC');
    expect(t.run(cmd('CompareValues', 'NA', [2, 0, 6, 0, 0, 0]))).toBe(false);
    expect(t.run(cmd('CompareValues', 'NA', [2, 0, 6, 0, 1, 0]))).toBe(true);
  });

  it('a missing side is false', () => {
    const t = setup();
    t.setNames(NAMES);
    t.setInput(null);
    expect(t.run(cmd('CompareValues', 'NA', [2, 0, 3, 0, 0, 0]))).toBe(false);
    expect(t.run(cmd('CompareValues', 'NA', [40, 0, 3, 0, 0, 0]))).toBe(false);
  });

  it('COMPARE_AFTER_FORMATTING (+0x15) compares what the caption parse leaves of each side', () => {
    const t = setup({ format: (s) => s.replace(/^_1_/, '') });
    t.setNames(['NA', '_1_Abc', 'Abc']);
    expect(t.run(cmd('CompareValues', 'NA', [1, 0, 2, 0, 0, 0]))).toBe(false);
    expect(t.run(cmd('CompareValues', 'NA', [1, 0, 2, 0, 0, 1]))).toBe(true);
  });
});

describe('PruneUIVarSpaces (FUN_00278370)', () => {
  it('cuts the spaces at both ends of a string variable, and nothing else', () => {
    const t = setup();
    t.uiVars.add('PLAYERNAMEVAR', { type: 'string', value: '  ab c  ' }, 1);
    expect(t.run(cmd('PruneUIVarSpaces', 'PLAYERNAMEVAR'))).toBe(true);
    expect(t.str('PLAYERNAMEVAR')).toBe('ab c');
  });

  it('all spaces becomes empty; an int variable, an absent one and no argument change nothing', () => {
    const t = setup();
    t.uiVars.add('S', { type: 'string', value: '   ' }, 1);
    t.uiVars.add('I', { type: 'int', value: 5 }, 1);
    t.run(cmd('PruneUIVarSpaces', 'S'));
    t.run(cmd('PruneUIVarSpaces', 'I'));
    expect(t.run(cmd('PruneUIVarSpaces', 'ABSENT'))).toBe(true);
    expect(t.str('S')).toBe('');
    expect(t.uiVars.find('I')!.value).toEqual({ type: 'int', value: 5 });
    expect(t.uiVars.find('ABSENT')).toBeUndefined();
  });

  it('INPUT_STRING names the variable through the animation\'s input', () => {
    const t = setup();
    t.uiVars.add('V', { type: 'string', value: ' x ' }, 1);
    t.setInput('V');
    t.run(cmd('PruneUIVarSpaces', 'INPUT_STRING'));
    expect(t.str('V')).toBe('x');
  });
});

describe('NetCensorText (FUN_002776e0)', () => {
  it('asks the lobby\'s text filter for a string variable only on the network with no LAN lobby up; answers 1 either way', () => {
    const asked: string[] = [];
    const lobby: PersonaLobby = { censor: (text, v) => { asked.push(`${v.name}=${text}`); } };
    const t = setup({ lobby, network: () => true });
    t.uiVars.add('PLAYERHOMETOWN', { type: 'string', value: 'Town' }, 1);
    expect(t.run(cmd('NetCensorText', 'PLAYERHOMETOWN'))).toBe(true);
    expect(asked).toEqual(['PLAYERHOMETOWN=Town']);
    const off = setup({ lobby, network: () => false });
    off.uiVars.add('PLAYERHOMETOWN', { type: 'string', value: 'Town' }, 1);
    expect(off.run(cmd('NetCensorText', 'PLAYERHOMETOWN'))).toBe(true);
    const lan = setup({ lobby: { ...lobby, lanUp: () => true }, network: () => true });
    lan.uiVars.add('PLAYERHOMETOWN', { type: 'string', value: 'Town' }, 1);
    lan.run(cmd('NetCensorText', 'PLAYERHOMETOWN'));
    expect(asked).toHaveLength(1);
  });

  it('`$1` (0x3eeb58), not INPUT_STRING, is replaced by the animation\'s input', () => {
    const asked: string[] = [];
    const t = setup({ lobby: { censor: (text) => { asked.push(text); } }, network: () => true });
    t.uiVars.add('GAMENAMEVAR', { type: 'string', value: 'g' }, 1);
    t.setInput('GAMENAMEVAR');
    t.run(cmd('NetCensorText', '$1'));
    expect(asked).toEqual(['g']);
  });
});

describe('LobbyLogout (FUN_0027dcc0)', () => {
  it('state 0 answers 1; state 0x12 answers 0 and asks nothing; any other asks the logout and answers 0', () => {
    let state = 0;
    const calls: string[] = [];
    const t = setup({ lobby: { state: () => state, logout: () => { calls.push('logout'); } } });
    expect(t.run(cmd('LobbyLogout'))).toBe(true);
    state = 0x12;
    expect(t.run(cmd('LobbyLogout'))).toBe(false);
    expect(calls).toEqual([]);
    state = 11;
    expect(t.run(cmd('LobbyLogout'))).toBe(false);
    expect(calls).toEqual(['logout']);
  });

  it('with no lobby (before ONL-07) the state is 0: answer 1', () => {
    expect(setup().run(cmd('LobbyLogout'))).toBe(true);
  });
});

describe('VerifyPatchLevel (FUN_002766b0)', () => {
  it('the extended info\'s words: the first the patch level (32 bytes), the second the patch server (128), split on space and tab', () => {
    expect(patchWords('')).toEqual({ level: '', url: '' });
    expect(patchWords('r0004\thttp://patch.test/x  more')).toEqual({ level: 'r0004', url: 'http://patch.test/x' });
    expect(patchWords('  r0001')).toEqual({ level: 'r0001', url: '' });
    expect(PATCH_LEVEL).toBe('r0001');
  });

  it('true for a universe with no level or with r0001, and for a name the list does not hold', () => {
    const t = setup({}, [universe({ name: 'A', endOfList: false }), universe({ name: 'B', extendedInfo: 'r0001 http://x' })]);
    t.setInput('A');
    expect(t.run(cmd('VerifyPatchLevel', 'INPUT_STRING'))).toBe(true);
    expect(t.run(cmd('VerifyPatchLevel', 'B'))).toBe(true);
    expect(t.run(cmd('VerifyPatchLevel', 'Nowhere'))).toBe(true);
    expect(t.uiVars.find('PatchServerURL')).toBeUndefined();
  });

  it('another level is false and puts the universe\'s patch server into PatchServerURL', () => {
    const t = setup({}, [universe({ name: 'A', extendedInfo: 'r0004 http://patch.test/x' })]);
    expect(t.run(cmd('VerifyPatchLevel', 'A'))).toBe(false);
    expect(t.str('PatchServerURL')).toBe('http://patch.test/x');
    expect(t.uiVars.find('PatchServerURL')!.longevity).toBe(1);
  });
});

describe('LobbyConnect (FUN_00276780)', () => {
  it('fills LOBBY_HOST and LOBBY_PORT from the universe, the form from its first saved persona, the list, then connects', () => {
    const calls: string[] = [];
    const t = setup({ lobby: { connect: (h, p) => { calls.push(`${h}:${p}`); return true; } } });
    t.db.put(rec('other', { host: 'x' }));
    t.db.put(rec('alpha', { password: 'a', hometown: 'A', gender: 1, savePassword: 1 }));
    t.db.put(rec('bravo'));
    t.setInput('Local');
    expect(t.run(cmd('LobbyConnect', 'INPUT_STRING'))).toBe(true);
    expect([t.str('LOBBY_HOST'), t.uiVars.find('LOBBY_PORT')!.value]).toEqual([HOST, { type: 'int', value: PORT }]);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['alpha', 'a', 'A']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([1, 1]);
    expect(t.rows()).toEqual({ type: 'array', value: [row(0, 'alpha'), row(1, 'bravo'), NEW] });
    expect(calls).toEqual([`${HOST}:${PORT}`]);
    expect(t.events).toEqual([]);                                     // the connection's own MP_SUCCESS is the lobby's to post
  });

  it('a universe with no saved persona leaves the form as select_server cleared it, the list three <New Persona> rows', () => {
    const t = setup({ lobby: { connect: () => true } });
    t.uiVars.add('PLAYERNAMEVAR', { type: 'string', value: '' }, 1);
    expect(t.run(cmd('LobbyConnect', 'Local'))).toBe(true);
    expect(t.str('PLAYERNAMEVAR')).toBe('');
    expect(t.uiVars.find('PLAYERPASSWORD')!.value.type).not.toBe('string');
    expect(t.rows()).toEqual({ type: 'array', value: [NEW, NEW, NEW] });
    expect([t.valves.find('PLAYERGENDER')!.type, t.valves.find('PLAYERGENDER')!.value]).toEqual([VALVE_TYPE.PERM, 0]);
  });

  it('a name the list does not hold, or a universe whose status word is 0, answers 0 and touches nothing', () => {
    const t = setup({ lobby: { connect: () => true } }, [universe({ name: 'Down', universeStatus: 0 })]);
    expect(t.run(cmd('LobbyConnect', 'Nowhere'))).toBe(false);
    expect(t.run(cmd('LobbyConnect', 'Down'))).toBe(false);
    expect(t.uiVars.find('LOBBY_HOST')).toBeUndefined();
  });

  it('the connection\'s answer is the row\'s', () => {
    const t = setup({ lobby: { connect: () => false } });
    expect(t.run(cmd('LobbyConnect', 'Local'))).toBe(false);
  });

  it('with no lobby (LOBBY_CONNECT_PLACEHOLDER): answer 1 and MP_SUCCESS posted into the dialog host', () => {
    const t = setup();
    expect(t.run(cmd('LobbyConnect', 'Local'))).toBe(true);
    expect(t.events).toEqual([DIALOG_EVENTS.MP_SUCCESS]);
  });

  it('with the LAN lobby up: PLAYERNAMEVAR takes LANPLAYERNAMEVAR\'s value and the answer is the LAN connect\'s', () => {
    const t = setup({ lobby: { lanUp: () => true, lanConnect: () => true, connect: () => { throw new Error('not the Medius path'); } } });
    t.uiVars.add('LANPLAYERNAMEVAR', { type: 'string', value: 'lanname' }, 3);
    expect(t.run(cmd('LobbyConnect', 'Local'))).toBe(true);
    expect(t.str('PLAYERNAMEVAR')).toBe('lanname');
    expect(t.uiVars.find('LOBBY_HOST')).toBeUndefined();
  });
});
