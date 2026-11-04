import { describe, expect, it } from 'vitest';
import {
  CARD_SLOT_KEYS, CardSlots, Libmc, MIGRATION_EXT, MP_NAME_IMPORTED, MP_NAME_KEY, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, Settings, migrationMarker, personaFileSize,
  personaFromLogin, type CardStorage, type PersonaRecord, type SettingsStorage,
} from '@s2u/card';
import {
  BootStubs, CARD_COMMAND_ROWS, MenuCommands, VALVE_TYPE, PERSONA_COMMAND_ROWS, UiCommandHost, UiVarManager, UniverseList, ValveStore,
  type DialogPartsHost, type FrontEndMachine, type UiCommandHandler, type UniverseEntry, type ZAnimUiCommand,
} from '@s2u/ui';
import { CONNECT, HAVE, PERSONA, UNIVERSE, personaRig } from '../../ui/test/screens/personaRig';
import * as personaHost from '../src/personaHost';
import {
  MP_NAME_MIGRATION_ADAPTATION, PERSONA_FORM_CARD_ROWS, PERSONA_FORM_CARD_ROWS_ADAPTATION, PERSONA_HOST_PLACEHOLDER, PERSONA_LOAD_ADAPTATION,
  PERSONA_MALFORMED_DISCARD_ADAPTATION, PageAcctDb, SAVED_PASSWORD_STAND_IN, SAVED_PASSWORD_STAND_IN_ADAPTATION, acctFromRecord, connectPersona,
  isSavedPasswordStandIn, loginFromAcct, readsUniverseFirst, restoreCardUiVars, savedAtSuccess, savedPasswordStandIn,
} from '../src/personaHost';

/**
 * ONL-06's rows on the page (web research 153 §5): `connectPersona` registers `@s2u/ui`'s `PersonaCommands` and
 * OPT-05i's `CardCommands` in the session's host over the client's account list, read from and written to the page's
 * virtual card through `@s2u/card`'s persona API -- the name and the form's other fields, never a password (OT.R17).
 * A memory storage stands in for localStorage. The last suite runs the form's own scripts over the connection (the
 * rig of `packages/ui/test/screens/personaRig.ts`, on the disc or the committed fixtures). Nothing measured on the
 * original running.
 */

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  /** The key of each write, in order (`writes` holds the values). */
  readonly keys: string[] = [];
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.keys.push(key); this.writes.push(String(value)); this.data.set(key, String(value)); }
}

/** The page's own settings over a memory storage (`pageSettings`' stand-in): where the old MP name is read; every write recorded. */
function legacyOf(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: SettingsStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { writes.push(`set ${k}`); data.set(k, v); },
    removeItem: (k) => { writes.push(`remove ${k}`); data.delete(k); },
  };
  return { data, writes, settings: new Settings(() => storage, () => undefined) };
}

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });
const H = UNIVERSE.dns, P = UNIVERSE.port;
const saved = (name: string, over: Partial<PersonaRecord> = {}): PersonaRecord =>
  ({ ...personaFromLogin({ host: H, name, password: null, savePassword: false, gender: 0, port: P }), ...over });

function card() {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const libmc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  /** A save file on slot 1 holding these personas (and another module's part). */
  const seed = (records: unknown, port: 1 | 2 = 1): void => {
    slots.slot(port).makeDir(PERSONA_SAVE_DIR.slice(1), 0);
    slots.slot(port).writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(Array.isArray(records) ? records.length : 0), { CValveSaveManager: { HDD_ENABLE: 0 }, CAcctDB: { AcctInfo: records } }, 1);
  };
  /** The save folder made when missing and entered, as `Ensure_MC_Dirs` leaves the card before SaveConfig / LoadConfig. */
  const inFolder = (): void => {
    slots.slot(1).makeDir(PERSONA_SAVE_DIR.slice(1), slots.slot(1).info().rev);   // at the revision now: the MP name's run may have written the slot's ext
    if (libmc.chdir(0, 0, PERSONA_SAVE_DIR).result < 0) throw new Error('no save folder');
  };
  const file = (port: 1 | 2 = 1) => { const r = slots.slot(port).readFile(PERSONA_FILE_PATH.slice(1)); if (!r.ok) throw new Error(JSON.stringify(r.failure)); return r.value; };
  return { storage, slots, libmc, seed, file, inFolder };
}

function rig(c = card(), universes: UniverseEntry[] = [UNIVERSE], standing?: Record<string, UiCommandHandler>, legacy: Settings | null = null) {
  const valves = new ValveStore();
  const events: number[] = [];
  /** The dialog built now (`MenuShell.currentName`): the form by default. */
  const at = { dialog: 'dlgNetPlayerName.rdr' };
  const machine = { valves, shell: () => ({ currentName: at.dialog, inputString: () => null, event: (k: number) => { events.push(k); return true; } }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const list = new UniverseList({ uiVars });
  for (const u of universes) list.entry(u);
  const lines: string[] = [];
  const menu = new MenuCommands({ valves: () => valves, uiVars, card: c.libmc, event: (k) => { events.push(k); } });
  menu.register(host);
  if (standing) for (const [name, h] of Object.entries(standing)) host.setHandler(name, h);   // the page's order: MENU-01a's rows, then the boot's stubs over them
  const parts = { current: null } as unknown as DialogPartsHost;
  const p = connectPersona(host, { machine: () => machine, uiVars, libmc: c.libmc, slots: c.slots, legacy, menu, universes: list, parts, standing, log: (l) => lines.push(l) });
  const str = (name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
  return { ...c, at, valves, events, host, uiVars, lines, str, ...p, run: (fn: string, arg?: string) => host.dispatch(cmd(fn, arg)) };
}

describe('connectPersona', () => {
  it('registers ONL-06\'s ten rows and OPT-05i\'s five in the session\'s host', () => {
    const t = rig();
    for (const r of [...PERSONA_COMMAND_ROWS, ...CARD_COMMAND_ROWS]) expect(t.run(r.name, 'x').kind, r.name).toBe('table');
  });

  it('reads the account list from slot 1 when the session is made (the boot\'s LoadConfig, which the page\'s boot stubs): a browser adaptation', () => {
    expect(PERSONA_LOAD_ADAPTATION).toBe("the first slot that holds a SOCOM II save (slot 1, then slot 2), when the session is made; the console asks which (#828)");
    const c = card();
    c.seed([saved('socomc', { TOWN: 'Town', GENDER: 1 }), saved('other', { HOST: 'elsewhere' })]);
    const t = rig(c);
    expect(t.db.records()).toEqual([
      { host: H, port: P, name: 'socomc', password: '', hometown: 'Town', gender: 1, savePassword: 0 },
      { host: 'elsewhere', port: P, name: 'other', password: '', hometown: '', gender: 0, savePassword: 0 },
    ]);
    expect(t.lines).toEqual([]);
  });

  it("a persona saved to slot 2 is read back (ONL-06's review): with no save in slot 1 the list is slot 2's, and the next save keeps that file's other modules", () => {
    const c = card();
    c.seed([saved('socomc', { TOWN: 'Two' })], 2);
    const t = rig(c);
    expect(t.db.records().map((r) => [r.name, r.hometown])).toEqual([['socomc', 'Two']]);
    expect(t.lines).toEqual([]);
    // The file SaveConfig writes is the config in memory -- the loaded slot's modules and the list -- whichever slot it goes to (CSaveManager::Save, research 143 R143.8).
    expect((t.config.contents().data as { CValveSaveManager: unknown }).CValveSaveManager).toEqual({ HDD_ENABLE: 0 });
  });

  it('with a save in both slots the list is slot 1\'s (the console asks which at its boot, #828: BOOT-05\'s prompt, parked)', () => {
    const c = card();
    c.seed([saved('one')], 1);
    c.seed([saved('two')], 2);
    expect(rig(c).db.records().map((r) => r.name)).toEqual(['one']);
  });

  it('a slot 1 file that will not parse is still slot 1\'s save: it is said, and slot 2 is not read in its place', () => {
    const c = card();
    c.seed('not a list', 1);
    c.seed([saved('two')], 2);
    const t = rig(c);
    expect(t.db.records()).toEqual([]);
    expect(t.lines).toHaveLength(1);
  });

  it('a fresh card, or none, is no personas', () => {
    expect(rig().db.records()).toEqual([]);
    const none = card();
    none.slots.slot(1).remove(0);
    expect(rig(none).db.records()).toEqual([]);
  });

  it('LobbyConnect on our universe prefills the form from the card\'s persona: the name and its fields, the password empty (OT.R17)', () => {
    const c = card();
    c.seed([saved('socomc', { TOWN: 'Town', GENDER: 1 })]);
    const t = rig(c);
    expect(t.run('LobbyConnect', UNIVERSE.name).answer).toBe(true);
    expect([t.str('LOBBY_HOST'), t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual([H, 'socomc', '', 'Town']);
    expect([t.valves.find('PLAYERGENDER')!.value, t.valves.find('SecurePassword')!.value]).toEqual([1, 0]);
    expect(PERSONA_HOST_PLACEHOLDER).toBe('LOBBY_HOST and LOBBY_PORT as the universe entry gives them');
  });

  it('OT.R61: SaveConfig writes a YES login\'s record with SAVEPASSWORD 1 and the typed password\'s length, never the password (FUN_002fc440 D:L199263-199266)', () => {
    const c = card();
    const t = rig(c);
    const typed = 'Zq7secretpw';                                       // made up, distinctive: a leak into a write would show
    t.db.update(H, P, 'socomp', typed, 'Town', 1, 1);                 // typed under SAVE PASSWORD: YES
    c.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const f = c.file();
    expect(f.size).toBe(personaFileSize(1));
    expect((f.data as { CAcctDB: { AcctInfo: PersonaRecord[] } }).CAcctDB.AcctInfo).toEqual([{
      HOST: H, NAME: 'socomp', TOWN: 'Town', GENDER: 1, PORT: P, PASSWORD: { length: typed.length }, SAVEPASSWORD: 1,
      PROFILES: { PROFILE_CHECKSUM: new Array(16).fill(0), PROFILE_INFO: [] },
    }]);
    for (const w of c.storage.writes) expect(w).not.toContain(typed);
    expect(t.db.records()[0]!.password).toBe(typed);                  // the list in memory is the game's; only the card is cut
  });

  it('OT.R61: a card record saved under YES loads as its length in the stand-in (SAVED_PASSWORD_STAND_IN_ADAPTATION); LobbyConnect prefills it with the strip on YES (FUN_002fc280 D:L199229; FUN_00276780 D:L122497-122532)', () => {
    expect(SAVED_PASSWORD_STAND_IN).toBe('\u0001');
    expect(SAVED_PASSWORD_STAND_IN_ADAPTATION).toMatch(/U\+0001/);
    expect(acctFromRecord(saved('socomc', { SAVEPASSWORD: 1, PASSWORD: { length: 6 } })).password).toBe('\u0001'.repeat(6));
    expect(acctFromRecord(saved('socomc')).password).toBe('');
    const c = card();
    c.seed([saved('socomc', { SAVEPASSWORD: 1, PASSWORD: { length: 6 }, TOWN: 'Town' })]);
    const t = rig(c);
    expect(t.run('LobbyConnect', UNIVERSE.name).answer).toBe(true);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['socomc', savedPasswordStandIn(6), 'Town']);
    expect(t.valves.find('SecurePassword')!.value).toBe(1);
    expect(isSavedPasswordStandIn(t.str('PLAYERPASSWORD'))).toBe(true);
  });

  it('OT.R61: a YES record of length 0 (a YES saved with no password: D:L199263 writes no PASSWORD) loads empty, the strip on YES', () => {
    const c = card();
    c.seed([saved('socomc', { SAVEPASSWORD: 1, PASSWORD: { length: 0 } })]);
    const t = rig(c);
    t.run('LobbyConnect', UNIVERSE.name);
    expect([t.str('PLAYERPASSWORD'), t.valves.find('SecurePassword')!.value]).toEqual(['', 1]);
  });

  it('OT.R61: NO after YES -- the card\'s record is written SAVEPASSWORD 0 with no length; the session\'s list keeps the stand-in (R153.2, 0x2fd0ec), so the form re-entered shows it', () => {
    const c = card();
    c.seed([saved('socomc', { SAVEPASSWORD: 1, PASSWORD: { length: 6 } })]);
    const t = rig(c);
    t.run('LobbyConnect', UNIVERSE.name);
    t.valves.set('SecurePassword', 0, VALVE_TYPE.PERM);               // disable_store_password
    expect(t.run('UpdateAcctInfo').answer).toBe(true);
    c.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const data = c.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CAcctDB.AcctInfo.map((r) => [r.NAME, r.SAVEPASSWORD, r.PASSWORD])).toEqual([['socomc', 0, { length: 0 }]]);
    expect(t.db.records()[0]).toMatchObject({ password: savedPasswordStandIn(6), savePassword: 0 });
    t.uiVars.set(t.uiVars.find('PLAYERPASSWORD')!, { type: 'string', value: '' });
    t.run('LobbyConnect', UNIVERSE.name);
    expect(t.str('PLAYERPASSWORD')).toBe(savedPasswordStandIn(6));
  });

  it('OT.R61: the page\'s account list lets a typed password go at the answer and keeps a saved one as its stand-in (PASSWORD_DROPPED_AT_ANSWER_ADAPTATION narrowed to typed passwords)', () => {
    const madeUp = 'Zq7plain';                                         // made up
    const make = (): PageAcctDb => {
      const db = new PageAcctDb();
      db.update(H, P, 'yes', 'Zq7typed', null, 0, 1);                 // typed under YES
      db.update(H, P, 'no', 'Zq7other', null, 0, 1);
      db.update(H, P, 'no', null, null, 0, 0);                        // then NO: the list keeps it (R153.2); the page drops a typed one
      db.put({ host: H, port: P, name: 'saved', password: savedPasswordStandIn(4), hometown: '', gender: 0, savePassword: 0 });
      db.put({ host: H, port: P, name: 'plain', password: madeUp, hometown: '', gender: 0, savePassword: 0 });
      return db;
    };
    // A refusal (the review's F1): every typed password goes, a stand-in stays.
    const refused = make();
    refused.forgetPasswords();
    expect(refused.records().map((r) => [r.name, r.password])).toEqual([['yes', ''], ['no', ''], ['saved', savedPasswordStandIn(4)], ['plain', '']]);
    // A success: the logged-in persona's typed YES password becomes the stand-in of its length first, then the rest go.
    const logged = make();
    savedAtSuccess(logged, { host: H, port: P }, 'yes');
    logged.forgetPasswords();
    expect(logged.records().map((r) => [r.name, r.password])).toEqual([['yes', savedPasswordStandIn(8)], ['no', ''], ['saved', savedPasswordStandIn(4)], ['plain', '']]);
    expect(JSON.stringify([...refused.records(), ...logged.records()])).not.toMatch(/Zq7/);
    expect(loginFromAcct(logged.records()[0]!)).toMatchObject({ savePassword: true, password: savedPasswordStandIn(8) });
  });

  it('SAVED-AT-SUCCESS-HOST (LATER 101): a Success keeps as the stand-in only the record of the HOST, PORT and NAME logged into -- the account list\'s own key and comparison', () => {
    const at = { host: H, port: P };
    const rows: Array<[string, number, string]> = [
      [H, P, 'socomc'],                    // the persona logged in
      ['other.lobby', P, 'socomc'],        // the same name and port on another universe
      [H, P + 1, 'socomc'],                // the same host on another port
      [H, P, 'SOCOMC'],                    // another case: `AcctDb` tells names apart as `FUN_00198f18` does in `FUN_002fbce0` D:L199060-199062 (`===`), not `FUN_00198b80`'s fold
    ];
    const make = (): PageAcctDb => {
      const db = new PageAcctDb();
      for (const [h, p, n] of rows) db.update(h, p, n, 'Zq7typed', null, 0, 1);   // made up, typed under YES
      return db;
    };
    const db = make();
    savedAtSuccess(db, at, 'socomc');
    expect(db.records().map((r) => r.password)).toEqual([savedPasswordStandIn(8), 'Zq7typed', 'Zq7typed', 'Zq7typed']);
    db.forgetPasswords();
    expect(db.records().map((r) => r.password)).toEqual([savedPasswordStandIn(8), '', '', '']);
    // No lobby address (`connectedTo()` null; unreachable at a Success today): nothing is converted.
    const none = make();
    savedAtSuccess(none, null, 'socomc');
    expect(none.records().every((r) => r.password === 'Zq7typed')).toBe(true);
  });

  it('OT.R61: SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER is retired: the record is written as the strip says', () => {
    expect(Object.keys(personaHost)).not.toContain('SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER');
    const typed = 'Zq7x';                                              // made up
    expect(loginFromAcct({ host: H, port: P, name: 'a', password: typed, hometown: '', gender: 0, savePassword: 1 })).toMatchObject({ savePassword: true, password: typed });
    expect(loginFromAcct({ host: H, port: P, name: 'a', password: typed, hometown: '', gender: 0, savePassword: 0 })).toMatchObject({ savePassword: false, password: null });
  });

  it('a save keeps the other modules\' parts of the file and a held persona\'s PROFILES; a persona deleted on the form is gone from the card', () => {
    const c = card();
    const checksum = Array.from({ length: 16 }, (_, i) => i + 1);
    c.seed([saved('socomc', { PROFILES: { PROFILE_CHECKSUM: checksum, PROFILE_INFO: [] } }), saved('gone')]);
    const t = rig(c);
    t.run('LobbyConnect', UNIVERSE.name);
    t.run('DeleteMUISPersona', '1');
    c.inFolder();
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    const data = c.file().data as { CValveSaveManager: unknown; CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CValveSaveManager).toEqual({ HDD_ENABLE: 0 });
    expect(data.CAcctDB.AcctInfo.map((r) => r.NAME)).toEqual(['socomc']);
    expect(data.CAcctDB.AcctInfo[0]!.PROFILES.PROFILE_CHECKSUM).toEqual(checksum);
  });

  it('LoadConfig restores the account list from the file it read', () => {
    const c = card();
    const t = rig(c);
    c.seed([saved('later')]);
    expect(t.db.records()).toEqual([]);
    c.inFolder();
    expect(t.run('LoadConfig', 'BASCUS-97275SOCOMII').kind).toBe('table');
    expect(t.db.records().map((r) => r.name)).toEqual(['later']);
  });

  it('a file that does not parse is no personas, said in the log; the next save writes the list in memory (the original\'s "Error loading data" prompt is OPT-05f\'s)', () => {
    expect(PERSONA_MALFORMED_DISCARD_ADAPTATION).toBe('logged in the prompt\'s place; the next save writes the list in memory');
    const c = card();
    c.seed([{ NAME: 1 }]);
    const t = rig(c);
    expect(t.db.records()).toEqual([]);
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]).toMatch(/^\[persona\] the save file's personas could not be read/);
    t.db.update(H, P, 'fresh', null, null, 0, 0);
    c.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    expect((c.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] } }).CAcctDB.AcctInfo.map((r) => r.NAME)).toEqual(['fresh']);
  });

  it('a deep link to the form runs LobbyConnect\'s form half for the list\'s first universe; any other start, nothing', () => {
    const c = card();
    c.seed([saved('socomc')]);
    const t = rig(c);
    t.entered('dlgNetServerSelect.rdr');
    t.entered(null);
    expect(t.uiVars.find('LOBBY_HOST')).toBeUndefined();
    t.entered('dlgNetPlayerName.rdr');
    expect([t.str('LOBBY_HOST'), t.str('PLAYERNAMEVAR')]).toEqual([H, 'socomc']);
    expect(t.uiVars.find('PLAYERPERSONALIST')!.value.type).toBe('array');
    expect(t.events).toEqual([]);                                     // no connection, no MP_SUCCESS: the form is already the screen
  });

  it("over the boot's card stubs (BOOT-04's f0 card, BOOT-05 parked): on the form the card rows are the page's card's; on every other dialog the stubs stand", () => {
    expect(PERSONA_FORM_CARD_ROWS_ADAPTATION).toBe("on dlgNetPlayerName.rdr the card rows read the page's card, on dlgOnlineOptions.rdr and dlgOptions_Menu.rdr its save chain's (MC_Changed the stub's); elsewhere the boot's stubs stand");
    expect(PERSONA_FORM_CARD_ROWS).toEqual([
      'IsMemCardInserted', 'IsMemCardFormatted', 'MC_ChPort', 'MC_Exists', 'MC_ChDir', 'MC_MkDir', 'MC_Changed',
      'IsSpaceForSaveGameFile', 'IsMemcardSaveOK', 'LoadConfig', 'SaveConfig', 'MC_CreateIconFiles',
    ]);
    const stubs = new BootStubs({ valves: new ValveStore() });
    const t = rig(card(), [UNIVERSE], stubs.entries());
    // The f0 stub: the save folder exists, nothing in slot 2. The page's card: fresh, no folder, a card in both slots.
    t.at.dialog = 'dlgNetLogin.rdr';
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(true);
    t.run('MC_ChPort', '1');
    expect(t.run('IsMemCardInserted').answer).toBe(false);
    t.run('MC_ChPort', '0');
    t.at.dialog = 'dlgNetPlayerName.rdr';
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(false);
    t.run('MC_ChPort', '1');
    expect(t.run('IsMemCardInserted').answer).toBe(true);
    t.run('MC_ChPort', '0');
    // The save on the form lands in the page's card, in its folder.
    t.db.update(H, P, 'socomp', null, null, 0, 0);
    t.run('MC_MkDir', 'BASCUS-97275SOCOMII');
    t.run('MC_ChDir', 'BASCUS-97275SOCOMII');
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    expect((t.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] } }).CAcctDB.AcctInfo.map((r) => r.NAME)).toEqual(['socomp']);
    // Off the form a row no stub answers (SaveConfig, IsMemcardSaveOK) answers the table's own constant and touches no
    // card -- what the dispatcher answered before; a row that is not a card row keeps its stub.
    t.at.dialog = 'dlgNetLogin.rdr';
    t.db.update(H, P, 'second', null, null, 0, 0);
    const writes = t.storage.writes.length;
    expect([t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer, t.run('IsMemcardSaveOK').answer, t.run('MC_CreateIconFiles').answer]).toEqual([true, true, true]);
    expect(t.storage.writes.length).toBe(writes);
    expect(t.run('StoreOptions').kind).toBe('table');
  });

  it('restoreCardUiVars: a corrupt CUIVarManager module never throws out of the session start; the ten it knows restored, the rest dropped', () => {
    const lines: string[] = [];
    const flood = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`JUNK${i}`, { type: 'string', value: 'x' }]));
    const vars = new UiVarManager();
    expect(restoreCardUiVars({ part: () => ({ ...flood, MPTAUNTMSG3: { type: 'string', value: 'CUSTOM TAUNT 03' } }) }, vars, (l) => lines.push(l))).toBe(true);
    expect(vars.find('MPTAUNTMSG3')?.value).toEqual({ type: 'string', value: 'CUSTOM TAUNT 03' });
    const throwing = { restore: () => { throw new Error('no slot'); }, add: () => { throw new Error('no slot'); } } as unknown as UiVarManager;
    expect(() => restoreCardUiVars({ part: () => ({ MPTAUNTMSG1: { type: 'string', value: 'x' } }) }, throwing, (l) => lines.push(l))).not.toThrow();
    expect(lines.at(-1)).toMatch(/could not be read/);
  });

  it('on ONLINE OPTIONS (research 301 §6) the save chain reads and writes the page\'s card, the taunts in its CUIVarManager module', () => {
    const stubs = new BootStubs({ valves: new ValveStore() });
    const t = rig(card(), [UNIVERSE], stubs.entries());
    t.at.dialog = 'dlgOnlineOptions.rdr';
    expect(t.run('MC_Exists', 'BASCUS-97275SOCOMII').answer).toBe(false);          // the page's card: no folder yet
    t.uiVars.add('MPTAUNTMSG3', { type: 'string', value: 'CUSTOM TAUNT 03' }, 3);
    t.uiVars.add('MPLOCALSOP1', { type: 'string', value: '_60757_ImGoingLeft_MSG' }, 3);
    t.uiVars.add('AUTOMESSAGES', { type: 'string', value: 'ON' }, 1);              // temporary: not on the card
    t.db.update(H, P, 'socomp', null, null, 0, 0);
    t.run('MC_MkDir', 'BASCUS-97275SOCOMII');
    t.run('MC_ChDir', 'BASCUS-97275SOCOMII');
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    const data = t.file().data as { CUIVarManager: Record<string, unknown>; CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CUIVarManager).toEqual({ MPTAUNTMSG3: { type: 'string', value: 'CUSTOM TAUNT 03' }, MPLOCALSOP1: { type: 'string', value: '_60757_ImGoingLeft_MSG' } });
    expect(data.CAcctDB.AcctInfo.map((r) => r.NAME)).toEqual(['socomp']);
    expect(t.file().size).toBe(personaFileSize(1, 2));
  });

  it('W15.R6: with SecurePassword 1 (global_valves.rdr\'s PERSIST default, or SAVE PASSWORD: YES) SaveConfig writes no password-class var and no password; OT.R61: the YES record keeps its length', () => {
    const stubs = new BootStubs({ valves: new ValveStore() });
    const t = rig(card(), [UNIVERSE], stubs.entries());
    t.at.dialog = 'dlgOnlineOptions.rdr';
    t.valves.loadValves([{ name: 'SecurePassword', value: 1, type: 'PERSIST' }], VALVE_TYPE.PERM);
    t.uiVars.add('MPTAUNTMSG3', { type: 'string', value: 'CUSTOM TAUNT 03' }, 3);
    t.uiVars.add('PLAYERPASSWORD', { type: 'string', value: 'hunter22' }, 3);
    t.uiVars.add('STORE_PASSWORD', { type: 'int', value: 1 }, 3);
    t.db.update(H, P, 'socomp', 'hunter22', null, 0, 1);
    t.run('MC_MkDir', 'BASCUS-97275SOCOMII');
    t.run('MC_ChDir', 'BASCUS-97275SOCOMII');
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    const data = t.file().data as { CUIVarManager: Record<string, unknown>; CValveSaveManager: Record<string, number>; CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CUIVarManager).toEqual({ MPTAUNTMSG3: { type: 'string', value: 'CUSTOM TAUNT 03' } });
    expect(data.CValveSaveManager.SecurePassword).toBe(1);                         // the flag: the original's PERSIST valve, kept
    expect(data.CAcctDB.AcctInfo.map((r) => [r.NAME, r.SAVEPASSWORD, r.PASSWORD])).toEqual([['socomp', 1, { length: 8 }]]);   // OT.R61: the flag and the length
    expect(JSON.stringify(data)).not.toContain('hunter22');
    expect(JSON.stringify(data)).not.toMatch(/PLAYERPASSWORD|STORE_PASSWORD/i);
  });

  it('on OPTIONS (research 302 §4) the save chain writes the persistent valves into CValveSaveManager over the module as read; LoadConfig restores every entry at PERSIST (FUN_00352960; research 229 §1)', () => {
    const c = card();
    c.seed([saved('socomp')]);
    const stubs = new BootStubs({ valves: new ValveStore() });
    const t = rig(c, [UNIVERSE], stubs.entries());
    t.at.dialog = 'dlgOptions_Menu.rdr';
    t.valves.set('INVERT_PITCH_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    t.valves.set('BOBBING_1ST_PERSON', 0, VALVE_TYPE.PERSIST);
    t.valves.set('OptionsMenuChanged', 1, VALVE_TYPE.PERM);                       // not persistent: not on the card
    t.uiVars.add('MUSIC_VOLUME', { type: 'real', value: 0.25 }, 2);                // longevity 2 (no slider built): not in the serialize
    t.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const data = t.file().data as { CValveSaveManager: Record<string, number>; CUIVarManager?: Record<string, unknown> };
    expect(data.CValveSaveManager).toEqual({ HDD_ENABLE: 0, INVERT_PITCH_CONTROLLER: 1, BOBBING_1ST_PERSON: 0 });
    expect(JSON.stringify(data)).not.toContain('MUSIC_VOLUME');
    expect(JSON.stringify(data)).not.toContain('OptionsMenuChanged');
    // The next session's LoadConfig: every entry back at PERSIST, a name the registry lacks made (FUN_00352960 D:L251422-251443).
    c.slots.slot(1).writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(1), { ...data, CValveSaveManager: { ...data.CValveSaveManager, GameComplete: 1 } }, c.slots.slot(1).info().rev);
    const u = rig(c, [UNIVERSE], new BootStubs({ valves: new ValveStore() }).entries());
    u.at.dialog = 'dlgOptions_Menu.rdr';
    u.inFolder();
    u.run('LoadConfig', 'BASCUS-97275SOCOMII');
    expect([u.valves.find('INVERT_PITCH_CONTROLLER'), u.valves.find('BOBBING_1ST_PERSON')]).toEqual([
      expect.objectContaining({ value: 1, type: VALVE_TYPE.PERSIST }), expect.objectContaining({ value: 0, type: VALVE_TYPE.PERSIST }),
    ]);
    expect(u.valves.find('GameComplete')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
    // A malformed module restores nothing and is said.
    c.slots.slot(1).writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(1), { ...data, CValveSaveManager: { INVERT_PITCH_CONTROLLER: 'yes' } }, c.slots.slot(1).info().rev);
    const w = rig(c, [UNIVERSE], new BootStubs({ valves: new ValveStore() }).entries());
    w.at.dialog = 'dlgOptions_Menu.rdr';
    w.inFolder();
    w.run('LoadConfig', 'BASCUS-97275SOCOMII');
    expect(w.valves.find('INVERT_PITCH_CONTROLLER')).toBeUndefined();
    expect(w.lines.some((l) => /CValveSaveManager module could not be read/.test(l))).toBe(true);
  });

  it('a deep link to SELECT UNIVERSE or to the form has the universe list read before the session is made; any other start has not', () => {
    expect(['dlgNetServerSelect.rdr', 'dlgnetplayername.rdr', 'dlgNetPlayerName.rdr'].map(readsUniverseFirst)).toEqual([true, true, true]);
    expect(['dlgMenu.rdr', 'dlgNetAuthenticate.rdr', null, undefined].map(readsUniverseFirst)).toEqual([false, false, false, false]);
  });

  it('a deep link with no universe read leaves the form as built, and says so', () => {
    const t = rig(card(), []);
    t.entered('dlgNetPlayerName.rdr');
    expect(t.uiVars.find('LOBBY_HOST')).toBeUndefined();
    expect(t.lines).toEqual(['[persona] no universe was read: the form has no HOST to list personas under']);
  });
});

describe('OPT-04: the MP name\'s migration into the persona record (research 229 §5; research 135 §6)', () => {
  const OLD = 'Lieutenant Commander';                                 // 20 characters: W3.R12's field takes 30, the persona's NAME 14

  it('a page with s2u.mp.name and no persona: the run settled when the session is made, the form for our universe lists a record named from it (cut at 14), FUN_002fbce0\'s append; the next SaveConfig writes it; the old key left in place', () => {
    expect(MP_NAME_MIGRATION_ADAPTATION).toBe('s2u.mp.name read once into the card slot\'s ext; the form\'s first entry with no persona appends a record of that NAME, as UpdateAcctInfo appends one');
    const c = card();
    const legacy = legacyOf({ [MP_NAME_KEY]: OLD });
    const t = rig(c, [UNIVERSE], undefined, legacy.settings);
    expect(t.migrated).toEqual({ outcome: 'imported' });
    expect(t.db.records()).toEqual([]);                               // no HOST before the form (PERSONA_HOST_PLACEHOLDER: the universe entry's)
    expect(t.run('LobbyConnect', UNIVERSE.name).answer).toBe(true);
    expect(t.db.records()).toEqual([{ host: H, port: P, name: 'Lieutenant Com', password: '', hometown: '', gender: 0, savePassword: 0 }]);
    expect(t.str('PLAYERNAMEVAR')).toBe('Lieutenant Com');           // where the online path reads the name: the form's first record
    expect(c.slots.slot(1).getExt(MIGRATION_EXT)).not.toHaveProperty(MP_NAME_IMPORTED);   // taken: the form's list holds it now
    c.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const data = c.file().data as Record<string, unknown> & { CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CAcctDB.AcctInfo.map((r) => [r.HOST, r.PORT, r.NAME, r.TOWN, r.GENDER, r.SAVEPASSWORD, r.PASSWORD])).toEqual([[H, P, 'Lieutenant Com', '', 0, 0, { length: 0 }]]);
    expect(JSON.stringify(data)).not.toContain(MIGRATION_EXT);       // the mark is the slot's ext, never the save file's (R7's ext rule)
    expect(legacy.data.get(MP_NAME_KEY)).toBe(OLD);                  // W6.R5: never moved or removed
    expect(legacy.writes).toEqual([]);
  });

  it('the second run does nothing: the persona deleted and saved, the next session lists none and the old name is not imported again', () => {
    const c = card();
    const legacy = legacyOf({ [MP_NAME_KEY]: OLD });
    const t = rig(c, [UNIVERSE], undefined, legacy.settings);
    t.run('LobbyConnect', UNIVERSE.name);
    t.run('DeleteMUISPersona', '0');
    c.inFolder();
    t.run('SaveConfig', 'BASCUS-97275SOCOMII');
    const u = rig(c, [UNIVERSE], undefined, legacy.settings);
    expect(u.migrated).toEqual({ outcome: 'already' });
    u.run('LobbyConnect', UNIVERSE.name);
    expect(u.db.records()).toEqual([]);
    expect(u.str('PLAYERNAMEVAR') ?? '').toBe('');                    // the form as built with no record
  });

  it('a page whose card holds a persona keeps it: the old name adds no record, at the form or later', () => {
    const c = card();
    c.seed([saved('socomc', { TOWN: 'Town' })]);
    const t = rig(c, [UNIVERSE], undefined, legacyOf({ [MP_NAME_KEY]: OLD }).settings);
    expect(t.migrated).toEqual({ outcome: 'imported' });       // read and settled: the run is spent
    expect(c.slots.slot(1).getExt(MIGRATION_EXT)).toEqual({ [migrationMarker(MP_NAME_KEY)]: [1] });
    t.run('LobbyConnect', UNIVERSE.name);
    expect(t.db.records().map((r) => r.name)).toEqual(['socomc']);
  });

  it('a deep link to the form takes the imported name in the page\'s own order: entered straight after connectPersona, nothing awaited between (FrontEndSession\'s constructor)', () => {
    const t = rig(card(), [UNIVERSE], undefined, legacyOf({ [MP_NAME_KEY]: 'socomp' }).settings);
    t.entered('dlgNetPlayerName.rdr');                                // no await: frontEnd.ts calls entered in the same constructor as connectPersona
    expect(t.db.records().map((r) => r.name)).toEqual(['socomp']);
    expect([t.str('LOBBY_HOST'), t.str('PLAYERNAMEVAR')]).toEqual([H, 'socomp']);
  });

  it('a universe LobbyConnect refuses takes nothing; the form entered after it takes the name', () => {
    const t = rig(card(), [UNIVERSE, { ...UNIVERSE, name: 'DOWN', universeStatus: 0 }], undefined, legacyOf({ [MP_NAME_KEY]: 'socomp' }).settings);
    expect(t.run('LobbyConnect', 'DOWN').answer).toBe(false);
    expect(t.db.records()).toEqual([]);
    t.entered('dlgNetPlayerName.rdr');
    expect([t.str('LOBBY_HOST'), t.str('PLAYERNAMEVAR')]).toEqual([H, 'socomp']);
  });

  it('no settings handed, or a storage that throws: nothing migrated, the session as before', () => {
    expect(rig().migrated).toBeNull();
    const broken = new Settings(() => { throw new DOMException('refused', 'SecurityError'); }, () => undefined);
    const t = rig(card(), [UNIVERSE], undefined, broken);
    expect(t.migrated?.outcome).toBe('unreadable');
    t.run('LobbyConnect', UNIVERSE.name);
    expect(t.db.records()).toEqual([]);
  });
});

describe('OPT-04: a login under SAVE PASSWORD: YES and NO writes neither the password nor a token (R7; OT.R61)', () => {
  it.each([[1, 'YES'], [0, 'NO']] as const)('SAVE PASSWORD %i (%s): the form\'s rows, then SaveConfig -- every localStorage write and the card\'s file hold no password; the only key written is the card slot\'s; under YES the flag and the length', (yes, _row) => {
    const c = card();
    const legacy = legacyOf({ [MP_NAME_KEY]: 'socomp' });
    const t = rig(c, [UNIVERSE], undefined, legacy.settings);
    const password = `Zq7pw${yes}x`;                                  // made up, distinctive: a leak into a write would show
    t.run('LobbyConnect', UNIVERSE.name);
    t.uiVars.set(t.uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomp' });
    t.uiVars.set(t.uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: password });
    t.valves.set('SecurePassword', yes, VALVE_TYPE.PERM);            // the SAVE PASSWORD row's valve (UpdateAcctInfo reads it)
    expect(t.run('UpdateAcctInfo').answer).toBe(true);
    expect(t.db.records()[0]!.password).toBe(yes ? password : ''); // the game's list in memory (D:L199075-199076); OT.R17 drops it at the lobby's answer
    c.inFolder();
    expect(t.run('SaveConfig', 'BASCUS-97275SOCOMII').answer).toBe(true);
    const data = c.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] } };
    // OT.R61 (FUN_002fc440 D:L199263-199266): under YES SAVEPASSWORD 1 and the password's length, under NO 0 and none.
    expect(data.CAcctDB.AcctInfo.map((r) => [r.NAME, r.SAVEPASSWORD, r.PASSWORD])).toEqual([['socomp', yes, { length: yes ? password.length : 0 }]]);
    for (const w of [...c.storage.writes, JSON.stringify(data)]) expect(w).not.toContain(password);
    // No token: the page holds none (SVC-03's remember cookie is HttpOnly: no page script reads it), and nothing but the card's slot is written.
    expect(new Set(c.storage.keys)).toEqual(new Set([CARD_SLOT_KEYS[0]]));
    expect(legacy.writes).toEqual([]);
  });
});

describe.skipIf(!HAVE)('the form over the page\'s connection and a virtual card (the machine, the disc\'s scripts)', () => {
  const walk = (c = card()) => {
    const t = personaRig({ card: c.libmc, connect: (host, ctx) => connectPersona(host, { ...ctx, libmc: c.libmc, log: () => undefined }) });
    t.run(30);
    return { t, c };
  };

  it('a new persona typed, CONNECT, the write-down notice, SAVE: YES, slot 1 -- the card holds the name and no password; then dlgNetConnect', () => {
    const { t, c } = walk();
    t.press('CROSS', 6);
    t.press('CROSS', 14);
    t.type('socomp');
    t.press('DOWN', 3);
    t.press('CROSS', 14);
    t.type('Zq7secret');
    for (let i = 0; i < 4; i++) t.press('DOWN', 3);
    expect(t.focused()).toBe('connect_btn');
    const at = t.outcomes.length;
    t.press('CROSS', 10);                                            // #606
    t.press('CROSS', 20);                                            // CONTINUE -> #831
    t.press('CROSS', 30);                                            // YES -> the slot select #830
    t.press('CROSS', 120);                                           // slot 1 -> checking, saving
    expect(t.current()).toBe(CONNECT);
    expect(t.builds).toEqual([PERSONA, CONNECT]);
    const data = c.file().data as { CAcctDB: { AcctInfo: PersonaRecord[] } };
    expect(data.CAcctDB.AcctInfo.map((r) => [r.HOST, r.PORT, r.NAME, r.PASSWORD, r.SAVEPASSWORD])).toEqual([[H, P, 'socomp', { length: 0 }, 0]]);
    for (const w of c.storage.writes) expect(w).not.toContain('Zq7secret');
    // The save chain's rows, as the set runs them on a fresh card (research 143 §1), up to the switch.
    const names = t.dispatched(at).filter((n) => n !== 'MC_Changed');
    expect(names.slice(0, 8)).toEqual(['PopUpDialog', 'MC_ChPort', 'IsMemCardInserted', 'MC_ChPort', 'IsMemCardInserted', 'UpdateAcctInfo', 'StoreOptions', 'PopUpDialog']);
    for (const n of ['IsMemcardSaveOK', 'IsSpaceForSaveGameFile', 'MC_MkDir', 'MC_CreateIconFiles', 'SaveConfig', 'SwitchMenu']) expect(names, n).toContain(n);
    expect(t.notImplemented(PERSONA)).toEqual(['StoreOptions (MENU-01)']);
  });

  it('the next session reads that card: the name prefilled, PASSWORD empty and lit (#599), SAVE PASSWORD on NO', () => {
    const c = card();
    c.seed([saved('socomp', { TOWN: 'Town' })]);
    const { t } = walk(c);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.str('PLAYERHOMETOWN')]).toEqual(['socomp', '', 'Town']);
    expect([t.focused(), t.text('DescriptionText'), t.valve('SecurePassword')]).toEqual(['passwd_btn', '¦ Enter your password.', 0]);
    expect(t.listbox().items.map((i) => i.captions.join('|'))).toEqual(['0|socomp', '-1|<New Persona>', '-1|<New Persona>']);
  });

  it('OT.R61: a card saved under YES -- the password drawn as six asterisks (SECURETEXT, FUN_0036aff0), the strip on YES, CONNECT lit (#602, R153.5): no keyboard', () => {
    const c = card();
    c.seed([saved('socomp', { SAVEPASSWORD: 1, PASSWORD: { length: 6 } })]);
    const { t } = walk(c);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD')]).toEqual(['socomp', savedPasswordStandIn(6)]);
    expect(t.text('password_val')).toBe('******');
    expect([t.focused(), t.text('DescriptionText'), t.valve('SecurePassword')]).toEqual(['connect_btn', '¦ Connect.', 1]);
  });

  it('OT.R61: a card saved under YES with no password (length 0): PASSWORD empty and lit (#599), the strip on YES', () => {
    const c = card();
    c.seed([saved('socomp', { SAVEPASSWORD: 1, PASSWORD: { length: 0 } })]);
    const { t } = walk(c);
    expect([t.str('PLAYERPASSWORD'), t.focused(), t.valve('SecurePassword')]).toEqual(['', 'passwd_btn', 1]);
  });
});
