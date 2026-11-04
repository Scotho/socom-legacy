/**
 * The persona records on the virtual card (OPT-04a, the online path's slice of OPT-04; research 135).
 *
 * The original keeps its personas in the `CAcctDB/AcctInfo.rdr` module of the save file
 * `BASCUS-97275SOCOMII/BASCUS-97275SOCOMII`: one 16-node record a persona -- HOST, NAME, TOWN, GENDER, PORT, PASSWORD,
 * SAVEPASSWORD, PROFILES -- the list in the game's order, the login form showing the first record of the server it
 * connects to (PC research 80 step 5 and "What the examples say"; PC KNOWN [persona-decoded], [personas-per-server]).
 * Under R7 (the owner, 2026-10-01; the spec's §3 and §7 item 5) the file's `data` is our JSON and a record keeps the
 * original's eight fields and caps, with one change: PASSWORD holds the password's **length** under SAVE PASSWORD: YES
 * (the masked row's glyphs) and nothing under NO -- never the password, never the remember token (SVC-03 sets that as
 * an HttpOnly cookie, out of page script's reach).
 *
 * The file goes through PLAT-26a's libmc (`libmc.ts`) in the original's command order: the save as `CSaveManager::Save`
 * (`FUN_0033dff0`, D:L239141-239245) opens it through `CMemCardIO` with mode 0x1a, which deletes and then opens
 * WRONLY|CREAT (`FUN_003a05a0`, D:L295395-295412), writes the buffer and closes (D:L239225-239237); the load as
 * `CSaveManager::Load` (`FUN_0033d6d0`, D:L238915-238925) opens with mode 1 -- RDONLY, then GetDir of the path for one
 * entry, its size (D:L295420-295429) -- reads that size and closes. The folder is made first (the card script's
 * `Ensure_MC_Dirs`, O18; `CMemCardIO`'s Mkdir `FUN_003a0890`). The original writes this module inside its whole options
 * save -- twelve files in its op order, the UI variables and the valves beside it -- which the page's `SaveConfig`
 * does through `contents` (OPT-01, research 228; OPT-04, research 229 §5).
 *
 * The file is rebuilt at each save from the registered modules only -- `CUIVarManager`, `CValveSaveManager`, `CAcctDB`
 * in the module list's order -- as `CSaveManager::Save` builds a new archive and serializes each registered module
 * under its name (`FUN_0033dff0` D:L239190-239216): a part of the file read that is none of them is not carried
 * (OPT-03's finding, research 229 §4).
 */
import { FIO, MC_RESULT, type Libmc } from './libmc';
import type { Migration } from './migrate';

/** The save's folder and file (`BASCUS-97275SOCOMII`, research 99 §7's options save; the f0 card). */
export const PERSONA_SAVE_DIR = '/BASCUS-97275SOCOMII';
export const PERSONA_FILE_PATH = '/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII';

/** NAME's cap, in characters (R7's ruling in OPT-04: the name keyboard's 14). */
export const PERSONA_NAME_MAX = 14;

/** The password's cap, in characters (R7's ruling in OPT-04; the spec's §7 item 5: the keyboard caps it at 12). */
export const PERSONA_PASSWORD_MAX = 12;

/** `PROFILES`' `PROFILE_CHECKSUM` words: 16 ints on every card seen (PC research 80 step 5). */
export const PERSONA_PROFILE_CHECKSUM_WORDS = 16;

/**
 * The PORT a new record gets: 10075, what every card seen holds (PC research 80's table; `card_save.py`'s default).
 * [reading] What the original writes there for another server (its MUIS port?) is not read; OC-3 (the HOST value the
 * browser writes) is open beside it.
 */
export const PERSONA_PORT_READING = 10_075;

/** The TOWN a new record gets: empty, as on every card seen (PC research 80's table). [reading] No screen sets it. */
export const PERSONA_TOWN_READING = '';

/**
 * The file's nominal sizes by persona count: `virgin.bin` 4,784 B (none), `one.bin` 6,208 (one), `two.bin` 6,400 (two)
 * (PLAT-25; the fixtures). Research 102 R102.9: these are three cards, `one` and `two` holding the ten UI-variable keys
 * a card gains once the game has been online -- the state of a card after the online path's save -- which `virgin` has
 * not. The original's size also follows the strings' lengths (the rdr's string table); a nominal size does not.
 */
export const PERSONA_FILE_SIZES: readonly number[] = [4_784, 6_208, 6_400];

/**
 * The same cards without the `CUIVarManager` module's keys (R102.9): `virgin.bin` with `one.bin`'s persona is 5,248 B
 * (`created.bin`'s size), with `two.bin`'s two 5,440 B.
 */
export const PERSONA_FILE_SIZES_NO_UI_VARS: readonly number[] = [4_784, 5_248, 5_440];

/** The `CUIVarManager` module of the save file (`CSaveModuleList/CUIVarManager`, beside `CValveSaveManager` and `CAcctDB`; R102.9). */
export const UI_VAR_MODULE = 'CUIVarManager';

/**
 * The save file's modules, in the module list's order: what `CSaveManager::Save` writes, one per registered module
 * (`FUN_0033dff0` D:L239201-239216), the order of every game-written card (two.bin, `tools/test/cardFileDev.test.ts`;
 * the f0 card, OPT-01). `CAcctDB` holds `AcctInfo` alone: `AcctInfo.rdr` its one child on the cards
 * (desktop@be5578311:docs/research/80-persona-card-format.md:30-33; held on one.bin and two.bin by
 * `tools/test/personaSaveDev.test.ts`).
 */
export const SAVE_FILE_MODULES = [UI_VAR_MODULE, 'CValveSaveManager', 'CAcctDB'] as const;

/** The modules beside `CAcctDB` a caller sets (`setPart`): the UI variables' and the valves'. */
const PARTS: readonly string[] = SAVE_FILE_MODULES.filter((m) => m !== 'CAcctDB');

/**
 * The ten UI-variable keys' bytes (`MPLOCALSOP1-5`, `MPTAUNTMSG1-5`; R102.9): `one.bin` 6,208 - 5,248 and `two.bin`
 * 6,400 - 5,440, the same 960 on both cards.
 */
export const UI_VAR_TEN_KEYS_BYTES = 960;

/**
 * A module of another count than the ten: each key the ten's mean (96 B). No card holds another count; the original's
 * bytes follow each record's string and its name. Settled by a card the game writes with another set of persistent
 * variables (web research 301 §6). [placeholder]
 */
export const UI_VAR_KEY_BYTES_PLACEHOLDER = 96;

/**
 * Past two records, each adds the step from one record to two (6,400 - 6,208). No card holds three; the step from none
 * to one is another figure (it carries the UI variables too, R102.9), so this is a stand-in. Settled by a card the
 * game writes with three personas.
 */
export const PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER = 192;

/**
 * SAVE PASSWORD: NO writes no length (PASSWORD `{ length: 0 }`): R7's §2 "stores no password" and §3 "empty
 * otherwise". [reading] What the original writes under NO -- an empty string or the field unchanged -- is OPT-04's
 * open unknown (a recomp run on the local stack settles it).
 */
export const SAVE_PASSWORD_NO_CLEARS_READING = true;

/**
 * A login of a persona already on the card -- the same HOST, PORT and NAME, compared exactly (`FUN_002fbce0` D:L199060-199062) -- replaces its record where it
 * stands; any other is appended. [reading] The examples show only an append (`one` -> `two` differ by one appended
 * record, PC research 80); whether the original moves a used record to the front, or compares names without case, is
 * not read. Settled by a recomp run logging in with the second of two personas.
 */
export const PERSONA_SAME_LOGIN_REPLACES_IN_PLACE_READING = true;

/**
 * The list has no maximum: a login of a new HOST and NAME is appended whatever the count. [reading] No source gives a
 * cap -- PC research 80, PC KNOWN, research 102 and the R7 spec hold none, and no card holds more than two records --
 * and the original may keep the list in a bounded structure (dropping the oldest, or refusing a third). The loader of
 * `AcctInfo.rdr` is not read: `CSaveManager::Load` finds the module by name (`FUN_0033d370`, D:L238791-238809, a walk
 * of the module list, called at D:L238939) and calls its load through the module's vtable, which is the read owed.
 * Settled by that read, or by a recomp run logging in a third and a fourth persona on one card.
 */
export const PERSONA_NO_MAXIMUM_READING = true;

/**
 * A save after a load that found the file malformed: refused until the caller discards the unreadable list
 * (`discardMalformed`), so that a login never overwrites old personas without the caller's "Error loading data" path
 * (OPT-05f) having run. Not a result of the original's: a guard on the API, thrown, never answered.
 */
export class PersonaMalformedError extends Error {
  constructor(readonly reason: string) {
    super(`the persona file loaded malformed (${reason}); discardMalformed() before a save`);
    this.name = 'PersonaMalformedError';
  }
}

/**
 * HOST is the string the caller gives -- the server the login connected to, as the saved network configuration names
 * it (OT.R3) -- compared exactly. [reading] The original stores the address it resolved (PC KNOWN
 * [personas-per-server]); a page cannot resolve a name, and OC-3 (which value the browser writes) is the owner's.
 */
export const PERSONA_HOST_AS_GIVEN_READING = true;

/** One persona record as R7 keeps it: the original's eight fields, the password as its length only. */
export interface PersonaRecord {
  readonly HOST: string;
  readonly NAME: string;
  readonly TOWN: string;
  readonly GENDER: number;
  readonly PORT: number;
  /** The password's length (0..12) under SAVE PASSWORD: YES, for the masked row; 0 under NO. Never the password. */
  readonly PASSWORD: { readonly length: number };
  readonly SAVEPASSWORD: 0 | 1;
  readonly PROFILES: { readonly PROFILE_CHECKSUM: readonly number[]; readonly PROFILE_INFO: readonly unknown[] };
}

/** What a login hands the card: the form's rows. Only these fields are read; the password only for its length. */
export interface PersonaLogin {
  readonly host: string;
  readonly name: string;
  /** The typed password, or `null` for a login by the remember cookie (nothing typed: the saved length stands). */
  readonly password: string | null;
  readonly savePassword: boolean;
  readonly gender: number;
  readonly town?: string;
  readonly port?: number;
}

const FIELDS = ['HOST', 'NAME', 'TOWN', 'GENDER', 'PORT', 'PASSWORD', 'SAVEPASSWORD', 'PROFILES'] as const;

/** `s` cut to `max` characters (code points, not UTF-16 units). */
function cut(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('') : s;
}

/**
 * The record a login leaves: NAME cut at 14; under YES the password's length cut at 12 (a cookie login keeps the
 * saved length), under NO none; TOWN, PORT and PROFILES from the record it replaces, else the readings above.
 */
export function personaFromLogin(login: PersonaLogin, previous?: PersonaRecord): PersonaRecord {
  const save = login.savePassword;
  let length = 0;
  if (save) {
    length = login.password === null
      ? Math.min(previous?.PASSWORD.length ?? 0, PERSONA_PASSWORD_MAX)
      : Math.min(Array.from(login.password).length, PERSONA_PASSWORD_MAX);
  }
  return {
    HOST: login.host,
    NAME: cut(login.name, PERSONA_NAME_MAX),
    TOWN: login.town ?? previous?.TOWN ?? PERSONA_TOWN_READING,
    GENDER: login.gender,
    PORT: login.port ?? previous?.PORT ?? PERSONA_PORT_READING,
    PASSWORD: { length },
    SAVEPASSWORD: save ? 1 : 0,
    PROFILES: previous
      ? { PROFILE_CHECKSUM: [...previous.PROFILES.PROFILE_CHECKSUM], PROFILE_INFO: [...previous.PROFILES.PROFILE_INFO] }
      : { PROFILE_CHECKSUM: new Array<number>(PERSONA_PROFILE_CHECKSUM_WORDS).fill(0), PROFILE_INFO: [] },
  };
}

/** The records of `host`, in the list's order. */
export function personasFor(records: readonly PersonaRecord[], host: string): PersonaRecord[] {
  return records.filter((r) => r.HOST === host);
}

/** The record the login form shows for `host`: its first (PC research 80), or none (the form starts empty). */
export function formPersona(records: readonly PersonaRecord[], host: string): PersonaRecord | undefined {
  return records.find((r) => r.HOST === host);
}

/**
 * The list with `record`: replacing the same HOST, PORT and NAME where it stands, else appended (no maximum, a reading).
 * The account list's key is those three (`FUN_002fbce0` D:L199060-199062; research wave C8 #14: the port had omitted
 * PORT). Saved lists need no migration: the key is not stored, every record is read, and records an older build
 * filed under one HOST and NAME stay as they are.
 */
export function withPersona(records: readonly PersonaRecord[], record: PersonaRecord): PersonaRecord[] {
  const i = records.findIndex((r) => r.HOST === record.HOST && r.PORT === record.PORT && r.NAME === record.NAME);
  if (i < 0) return [...records, record];
  const out = [...records];
  out[i] = record;
  return out;
}

/** The `CUIVarManager` module's keys' bytes for `keys` keys: none, the ten's measured 960, else the placeholder's mean. */
export function uiVarModuleBytes(keys: number): number {
  if (keys <= 0) return 0;
  return keys === 10 ? UI_VAR_TEN_KEYS_BYTES : keys * UI_VAR_KEY_BYTES_PLACEHOLDER;
}

/**
 * The file's nominal size for `count` personas and `uiVarKeys` keys in its `CUIVarManager` module (R102.9): the cards
 * without the module (`PERSONA_FILE_SIZES_NO_UI_VARS`, then the placeholder's step a record) plus the module's keys.
 * `one.bin` is `personaFileSize(1, 10)`, `two.bin` `personaFileSize(2, 10)`, `created.bin` `personaFileSize(1)`.
 */
export function personaFileSize(count: number, uiVarKeys = 0): number {
  const sizes = PERSONA_FILE_SIZES_NO_UI_VARS, last = sizes.length - 1;
  const base = count < sizes.length ? sizes[count]! : sizes[last]! + (count - last) * PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER;
  return base + uiVarModuleBytes(uiVarKeys);
}

/** The keys of a `CUIVarManager` part as the file holds it (an object, one key a variable); none for any other shape. */
export function uiVarKeysOf(part: unknown): number {
  return isObject(part) ? Object.keys(part).length : 0;
}

/**
 * The parsed file: `rest` is the data beside `CAcctDB`, `acctRest` the parts of `CAcctDB` beside `AcctInfo` -- as read.
 * `PersonaCard` keeps of them only the modules a save writes (`SAVE_FILE_MODULES`).
 */
export type ParsedPersonaFile =
  | {
    readonly ok: true; readonly personas: PersonaRecord[]; readonly rest: Record<string, unknown>;
    readonly acctRest: Record<string, unknown>;
  }
  | {
    readonly ok: false; readonly reason: string; readonly rest: Record<string, unknown>;
    readonly acctRest: Record<string, unknown>;
  };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

const isInt = (x: unknown): x is number => Number.isSafeInteger(x);

/** Why `x` is not a record (`''` when it is): exactly the eight fields, each of its kind and within its cap. */
function recordProblem(x: unknown): string {
  if (!isObject(x)) return 'a record is not an object';
  const keys = Object.keys(x);
  const extra = keys.filter((k) => !(FIELDS as readonly string[]).includes(k));
  if (extra.length > 0) return `a record holds a field beyond the eight: ${extra.join(', ')}`;
  for (const k of FIELDS) if (!Object.hasOwn(x, k) || x[k] === undefined) return `a record has no ${k}`;
  if (typeof x.HOST !== 'string' || typeof x.TOWN !== 'string') return 'HOST and TOWN are strings';
  if (typeof x.NAME !== 'string' || Array.from(x.NAME).length > PERSONA_NAME_MAX) return `NAME is a string of at most ${PERSONA_NAME_MAX}`;
  if (!isInt(x.GENDER) || !isInt(x.PORT)) return 'GENDER and PORT are whole numbers';
  if (x.SAVEPASSWORD !== 0 && x.SAVEPASSWORD !== 1) return 'SAVEPASSWORD is 0 or 1';
  const pw = x.PASSWORD;
  if (!isObject(pw) || Object.keys(pw).join() !== 'length' || !isInt(pw.length) || pw.length < 0 || pw.length > PERSONA_PASSWORD_MAX) {
    return `PASSWORD is { length } of 0..${PERSONA_PASSWORD_MAX}`;
  }
  if (x.SAVEPASSWORD === 0 && pw.length !== 0) return 'PASSWORD has a length under SAVE PASSWORD: NO';
  const pr = x.PROFILES;
  if (!isObject(pr) || !Array.isArray(pr.PROFILE_CHECKSUM) || !pr.PROFILE_CHECKSUM.every(isInt) || !Array.isArray(pr.PROFILE_INFO)) {
    return 'PROFILES is { PROFILE_CHECKSUM: whole numbers, PROFILE_INFO: a list }';
  }
  return '';
}

/**
 * The persona part of the save file's JSON (`CAcctDB.AcctInfo`, the module `CSaveModuleList/CAcctDB/AcctInfo.rdr`)
 * and the rest of the file (the other modules', OPT-01's and OPT-02's, and whatever else it holds), as read. No file is
 * no personas.
 */
export function parsePersonaFile(data: unknown): ParsedPersonaFile {
  if (data === undefined || data === null) return { ok: true, personas: [], rest: {}, acctRest: {} };
  if (!isObject(data)) return { ok: false, reason: 'the file\'s data is not an object', rest: {}, acctRest: {} };
  const { CAcctDB: acct, ...rest } = data;
  if (acct === undefined) return { ok: true, personas: [], rest, acctRest: {} };
  if (!isObject(acct)) return { ok: false, reason: 'CAcctDB is not an object', rest, acctRest: {} };
  const { AcctInfo: list, ...acctRest } = acct;
  if (!Array.isArray(list)) return { ok: false, reason: 'CAcctDB.AcctInfo is not a list', rest, acctRest };
  for (const [i, r] of list.entries()) {
    const why = recordProblem(r);
    if (why) return { ok: false, reason: `record ${i}: ${why}`, rest, acctRest };
  }
  return { ok: true, personas: list as PersonaRecord[], rest, acctRest };
}

/** What a load answers: the first failing command's result (or Succeed), the records, and why the file is malformed. */
export interface PersonaLoad {
  readonly result: number;
  readonly personas: PersonaRecord[];
  readonly malformed?: string;
}

/**
 * The personas of one card port (0: slot 1, 1: slot 2), held in memory as the game holds its account list: loaded
 * from the card, changed by a login, saved whole.
 */
export class PersonaCard {
  private list: PersonaRecord[] = [];
  /** The modules beside `CAcctDB` (`PARTS`), as read or set. */
  private rest: Record<string, unknown> = {};
  /** Why the last load found the file malformed, until `discardMalformed`; a save is refused meanwhile. */
  private malformed: string | undefined;

  constructor(private readonly mc: Libmc, private readonly port: 0 | 1) {}

  /** The records in memory, in order. */
  personas(): PersonaRecord[] {
    return [...this.list];
  }

  /** The record the login form shows for `host`. */
  form(host: string): PersonaRecord | undefined {
    return formPersona(this.list, host);
  }

  /** Reads the file: Open RDONLY, GetDir for its size, Read, Close. A missing file is no personas (Open's NoEntry). */
  load(): PersonaLoad {
    const fd = this.mc.open(this.port, 0, PERSONA_FILE_PATH, FIO.O_RDONLY);
    if (fd < 0) {
      this.list = [];
      this.rest = {};
      this.malformed = undefined;
      return { result: fd, personas: [] };
    }
    const dir = this.mc.getDir(this.port, 0, PERSONA_FILE_PATH, 1);
    const size = dir.result > 0 ? dir.entries[0]!.size : 0;
    const read = this.mc.read(fd, size);
    const closed = this.mc.close(fd);
    const failed = [dir.result, read.result, closed].find((r) => r < 0);
    if (failed !== undefined) return { result: failed, personas: this.personas() };
    if (!this.restore(read.data)) return { result: MC_RESULT.Succeed, personas: [], malformed: this.malformed };
    return { result: MC_RESULT.Succeed, personas: this.personas() };
  }

  /**
   * What a read of the file gave, adopted as `load` adopts it after its Read -- for the caller that reads the file
   * itself (the page's `LoadConfig`, OPT-05i's `CardConfigFile.restore`; research 153 §5): the records, the parts kept
   * beside them. False when the JSON is not the shape of research 135 §1: no personas, and `malformed` guards the next
   * change until `discardMalformed`.
   */
  restore(data: unknown): boolean {
    const parsed = parsePersonaFile(data);
    // Only the registered modules are kept: the next save is rebuilt from them (FUN_0033dff0 D:L239190-239216).
    this.rest = Object.fromEntries(Object.entries(parsed.rest).filter(([k]) => PARTS.includes(k)));
    if (!parsed.ok) {
      this.list = [];
      this.malformed = parsed.reason;
      return false;
    }
    this.malformed = undefined;
    this.list = parsed.personas.map((r) => personaFromRecord(r));
    return true;
  }

  /**
   * The list in memory replaced by the form's personas (research 153 §5): the game's account list as `UpdateAcctInfo`
   * and `DeleteMUISPersona` leave it, each as `personaFromLogin` makes a record (a persona already held keeps its
   * PROFILES), in the order given -- one no longer among them is gone. A persona already held is the record of the
   * login's HOST, PORT and NAME, the account list's own key (`FUN_002fbce0` D:L199058-199066, research 153 R153.1;
   * ONL-06's review: it matched HOST and NAME alone); a login that names no port finds its record by HOST and NAME
   * and keeps that record's PORT, as `saveLogin` does. Nothing is written: the caller's save writes `contents()`.
   * Throws `PersonaMalformedError` after a malformed load until `discardMalformed`.
   */
  setLogins(logins: readonly PersonaLogin[]): PersonaRecord[] {
    if (this.malformed !== undefined) throw new PersonaMalformedError(this.malformed);
    const held = this.list;
    this.list = logins.map((l) => {
      const name = cut(l.name, PERSONA_NAME_MAX);
      return personaFromLogin(l, held.find((r) => r.HOST === l.host && r.NAME === name && (l.port === undefined || r.PORT === l.port)));
    });
    return this.personas();
  }

  /**
   * The file as `saveLogin` writes it, for the caller that writes it itself (the page's `SaveConfig`, OPT-05i's
   * `CardConfigFile.contents`): the nominal size for the personas in memory and the JSON -- the registered modules in
   * their order, the two beside `CAcctDB` as read or set, `CAcctDB` the list alone.
   */
  contents(): { size: number; data: unknown } {
    return this.fileOf(this.list);
  }

  /**
   * Another module's part of the file as read (`rest`): `CUIVarManager`'s for the UI variables (web research 301 §6).
   * Undefined when the file holds none.
   */
  part(name: string): unknown {
    return name === 'CAcctDB' ? undefined : this.rest[name];
  }

  /**
   * Another module's part set for the next save (`contents`, `saveLogin`): the UI variables' `CUIVarManager` as the
   * page's `SaveConfig` hands it (`CUIVarManager_Serialize`, web research 301 §6), the valves' `CValveSaveManager`;
   * undefined takes it out. `CAcctDB` is this class's own, and a name no module registers is never written
   * (`SAVE_FILE_MODULES`): both are refused.
   */
  setPart(name: string, data: unknown): void {
    if (name === 'CAcctDB') throw new Error('setPart: CAcctDB holds the persona list, not a part');
    if (!PARTS.includes(name)) throw new Error(`setPart: ${name} is not a module of the save file (${SAVE_FILE_MODULES.join(', ')})`);
    if (data === undefined) { const { [name]: _gone, ...kept } = this.rest; this.rest = kept; return; }
    this.rest = { ...this.rest, [name]: data };
  }

  /**
   * The file written as it stands in memory -- the list and every part -- through `saveLogin`'s commands (Mkdir,
   * Delete, Open WRONLY|CREAT, Write, Close). For a caller that saves without a login (`/testroom`'s development-only
   * SETUP TAUNTS, web research 301 §6). Throws `PersonaMalformedError` after a malformed load until `discardMalformed`.
   */
  save(): number {
    if (this.malformed !== undefined) throw new PersonaMalformedError(this.malformed);
    return this.write(this.list);
  }

  /** The file rebuilt from the registered modules, in their order (`FUN_0033dff0` D:L239190-239216): a part not set is not written. */
  private fileOf(list: PersonaRecord[]): { size: number; data: unknown } {
    const size = personaFileSize(list.length, uiVarKeysOf(this.rest[UI_VAR_MODULE]));
    const data: Record<string, unknown> = {};
    for (const m of PARTS) if (this.rest[m] !== undefined) data[m] = this.rest[m];
    data.CAcctDB = { AcctInfo: list.map((r) => personaFromRecord(r)) };
    return { size, data };
  }

  /**
   * After a malformed load, the caller's "Error loading data" path (OPT-05f) has run and the unreadable list may be
   * overwritten: the next save writes the new list in its place (the other modules still kept as read).
   */
  discardMalformed(): void {
    this.malformed = undefined;
  }

  /**
   * A login's record into the list (replacing its own, else appended) and the file saved: Mkdir, Delete (its result
   * ignored, as the game ignores it), Open WRONLY|CREAT, Write of the nominal size, Close. On a failing command the
   * list in memory stays as it was and the result is that command's. Throws `PersonaMalformedError` after a malformed
   * load until `discardMalformed`.
   */
  saveLogin(login: PersonaLogin): { result: number; personas: PersonaRecord[] } {
    if (this.malformed !== undefined) throw new PersonaMalformedError(this.malformed);
    const name = cut(login.name, PERSONA_NAME_MAX);
    const previous = this.list.find((r) => r.HOST === login.host && r.NAME === name && (login.port === undefined || r.PORT === login.port));
    const next = withPersona(this.list, personaFromLogin(login, previous));
    const result = this.write(next);
    if (result === MC_RESULT.Succeed) this.list = next;
    return { result, personas: this.personas() };
  }

  private write(list: PersonaRecord[]): number {
    const made = this.mc.mkdir(this.port, 0, PERSONA_SAVE_DIR);
    if (made < 0 && made !== MC_RESULT.NoEntry) return made;   // FUN_003a0890 takes 0 or -4 (D:L295490)
    // FUN_003a05a0 deletes, syncs the result into a local and never reads it, then opens (D:L295406-295412).
    this.mc.delete(this.port, 0, PERSONA_FILE_PATH);
    const fd = this.mc.open(this.port, 0, PERSONA_FILE_PATH, FIO.O_WRONLY | FIO.O_CREAT);
    if (fd < 0) return fd;
    const { size, data } = this.fileOf(list);
    const wrote = this.mc.write(fd, size, data);
    const closed = this.mc.close(fd);
    if (wrote < 0) return wrote;
    return closed < 0 ? closed : MC_RESULT.Succeed;
  }
}

/** A fresh copy of a record, its fields in the original's order. */
function personaFromRecord(r: PersonaRecord): PersonaRecord {
  return {
    HOST: r.HOST, NAME: r.NAME, TOWN: r.TOWN, GENDER: r.GENDER, PORT: r.PORT, PASSWORD: { length: r.PASSWORD.length },
    SAVEPASSWORD: r.SAVEPASSWORD,
    PROFILES: { PROFILE_CHECKSUM: [...r.PROFILES.PROFILE_CHECKSUM], PROFILE_INFO: [...r.PROFILES.PROFILE_INFO] },
  };
}

/**
 * The MP name's old key: the name W3.R12's settings field (`main.ts`) remembers for `/testroom`'s match. OPT-04 retires
 * it into the persona's NAME (PLAT-24; research 99 §3, research 229 §5) by `mpNameMigration`; the key is left in place
 * (W6.R5) for the field that still reads it.
 */
export const MP_NAME_KEY = 's2u.mp.name';

/** Where `mpNameMigration` puts the name it read (a `CardExtStore` key) until the persona form takes it (`personaHost.ts`). */
export const MP_NAME_IMPORTED = 'persona/NAME';

/**
 * The MP name's run (`migrateOnceSync`, S15 CLOSE-FIX-1; `migrateOnce` shares its decision): the old key's text as W3.R12's field writes it -- printable ASCII, 1-30, trimmed --
 * else malformed; the name cut at `PERSONA_NAME_MAX` (R7's cap) and trimmed again -- a cut never ends on a space,
 * which the form's own path never makes (`PruneUIVarSpaces` trims the typed name) -- and put under `MP_NAME_IMPORTED`,
 * unless the card already holds a persona (`cardHoldsPersona`), whose list stands: the run is spent with nothing put.
 * The record itself needs the HOST and PORT the form connects to (`PERSONA_HOST_AS_GIVEN_READING`), so it is made
 * there, not here.
 */
export function mpNameMigration(cardHoldsPersona: boolean): Migration<string> {
  return {
    from: MP_NAME_KEY,
    parse: (raw) => {
      const name = raw.trim();
      return /^[\x20-\x7e]{1,30}$/.test(name) ? cut(name, PERSONA_NAME_MAX).trimEnd() : undefined;
    },
    ops: (name) => (cardHoldsPersona ? [] : [{ put: MP_NAME_IMPORTED, value: new TextEncoder().encode(name) }]),
  };
}
