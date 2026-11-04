import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { uiCommandFold } from '../uiCommands';
import type { UiVarManager, UiVariable, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore, type ValveType } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { DnasEntryCommand } from './dnasCommands';
import { PLAYER_PASSWORD_VAR, SECURE_PASSWORD_VALVE } from './netLoginCommands';
import { INPUT_STRING } from './screenCommands';
import type { UniverseList } from './universeCommands';

/**
 * CONNECT TO SOCOM II's rows (`dlgNetPlayerName.rdr`, ONL-06; web research 153, on research 128 §4.4, 119 §5 and 135):
 * the client's account list (`CAcctDB`, the object at 0x44fc60) and the rows the persona form's set dispatches that no
 * earlier task answered -- UpdateAcctInfo, GetMUISPersonaInfo, DeleteMUISPersona and MUISPersonaExists (the table's
 * ONL-06 rows), CompareValues and PruneUIVarSpaces (the form's tests), NetCensorText and LobbyLogout (each a short body
 * around a call of the lobby's, which stays its own task's: SVC-23, ONL-10) -- and the two SELECT UNIVERSE's CROSS
 * (`select_server`) runs on the way in: VerifyPatchLevel and LobbyConnect, whose first half fills the form from the
 * universe's first saved persona and whose connection is ONL-07's (`PersonaLobby`). PLAT-08's `UiCommandHost` is a
 * registry each module fills (`setHandler`, W9.R4): `register` binds these ten rows and the table itself is not edited.
 *
 * Every argument is the command's `names[+8]` (`FUN_0026ed60`), `INPUT_STRING` (0x3ee898) replaced by the running
 * animation's first string input (`FUN_00272480(ctx+0x18, 0)`); NetCensorText replaces `$1` (0x3eeb58) instead.
 * `D:L<line>` = a line of `socom2_game.elf.decomp.c`; an address is the retail ELF's.
 *
 * **The account list.** A vector of 0x1318-byte records (count +4, data +8): HOST +0 (`strncpy` 0x80), PORT +0x80,
 * NAME +0x84 (0x20), PASSWORD +0xa4 (0x20), HOMETOWN +0xc4 (0x3f), GENDER the byte +0x103, the 16 checksum bytes
 * +0x104, 0x80 mission records of 0x24 bytes from +0x114 (the character profiles: `DownloadCharacterProfile`'s, not this
 * form's), SAVEPASSWORD the byte +0x1314 (`FUN_002fbce0` D:L199016-199184). A persona is found by HOST, PORT and NAME,
 * each compared exactly (`FUN_00198f18`, strcmp); the form's "place" is a record's index among those of its HOST and
 * PORT, in the list's order. Nothing in these functions bounds the list.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const PERSONA_COMMAND_ROWS = [
  { row: 47, id: 40, name: 'LobbyLogout', fn: 0x27dcc0 },
  { row: 122, id: 123, name: 'NetCensorText', fn: 0x2776e0 },
  { row: 138, id: 139, name: 'PruneUIVarSpaces', fn: 0x278370 },
  { row: 151, id: 152, name: 'LobbyConnect', fn: 0x276780 },
  { row: 153, id: 154, name: 'UpdateAcctInfo', fn: 0x275130 },
  { row: 173, id: 175, name: 'GetMUISPersonaInfo', fn: 0x275350 },
  { row: 174, id: 176, name: 'DeleteMUISPersona', fn: 0x2761a0 },
  { row: 175, id: 177, name: 'CompareValues', fn: 0x274db0 },
  { row: 176, id: 178, name: 'MUISPersonaExists', fn: 0x276580 },
  { row: 195, id: 197, name: 'VerifyPatchLevel', fn: 0x2766b0 },
] as const;
export type PersonaCommandName = (typeof PERSONA_COMMAND_ROWS)[number]['name'];

const earlier = (name: string, task: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'earlier', task, spelt });
const here = (name: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'here', task: 'ONL-06', spelt });
const declared = (name: string, task: string, why: string, ...spelt: string[]): DnasEntryCommand => ({ name, status: 'declared', task, spelt, why });

const CARD_PARKED = 'the card chain\'s parked branches (`UIMemCardAnim.rdr`, research 143 R143.2): reached from this form only through `has_memcard_changed` answering a new card, an unformatted card, or `video_mode` 1';

/**
 * Every bound function `dlgNetPlayerName.rdr`'s chapter names -- its layout's bindings, its own set and the library
 * animations those reach (`UIanim.rdr`, `UIMemCardAnim.rdr`), read with ONL-33's chapter reader and pinned in
 * `tools/test/onlineDialogs.pinned.json` -- each answered by a task, as `DNAS_ENTRY_COMMANDS` does for the DNAS screen.
 * `tools/test/personaEntryCommands.test.ts` holds the list to the pin: a name the chapter uses that is not here fails it.
 */
export const PERSONA_ENTRY_COMMANDS: readonly DnasEntryCommand[] = [
  // PLAT-10's screen rows; PLAT-17's keyboard.
  earlier('SwitchMenu', 'PLAT-10', 'SWITCHMENU'),
  earlier('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'),
  earlier('KillPopUp', 'PLAT-10', 'KILLPOPUP'),
  earlier('ActivateButton', 'PLAT-10'),
  earlier('EnableButton', 'PLAT-10'),
  earlier('DisableButton', 'PLAT-10'),
  earlier('GetTextInput', 'PLAT-17'),
  // MENU-01a's variable and card rows; OPT-05i's five (the save chain `memcard_operations` -> `save_and_leave`).
  earlier('TestUIVar', 'MENU-01a'),
  earlier('ClearUIVar', 'MENU-01a'),
  earlier('MC_ChPort', 'MENU-01a'),
  earlier('MC_ChDir', 'MENU-01a'),
  earlier('MC_Exists', 'MENU-01a'),
  earlier('MC_MkDir', 'MENU-01a'),
  earlier('MC_Changed', 'MENU-01a'),
  earlier('IsMemCardInserted', 'MENU-01a'),
  earlier('IsMemCardFormatted', 'MENU-01a'),
  earlier('IsSpaceForSaveGameFile', 'OPT-05i'),
  earlier('IsMemcardSaveOK', 'OPT-05i'),
  earlier('LoadConfig', 'OPT-05i'),
  earlier('SaveConfig', 'OPT-05i'),
  earlier('MC_CreateIconFiles', 'OPT-05i'),
  // This module.
  here('UpdateAcctInfo'),
  here('GetMUISPersonaInfo', 'GetMuisPersonaInfo'),
  here('DeleteMUISPersona'),
  here('MUISPersonaExists'),
  here('CompareValues'),
  here('PruneUIVarSpaces'),
  here('NetCensorText'),
  here('LobbyLogout'),
  // Declared for their own tasks.
  declared('StoreOptions', 'MENU-01', '`save_and_leave` opens with it: the options valves applied to the game\'s globals (02-boot O11), not a card command; its body answers the constant 1, as the table does unimplemented'),
  declared('UnInitNetwork', 'ONL-10', '`OnNetError` (MP_MEDIUS_ERROR): the reboot out of the online path; its body (`FUN_0027e5c0` D:L126505-126515) disconnects the lobby and stops the DME layer, then answers 1 -- ONL-10\'s, mounted on the session (`logoffCommands.ts`, web research 160 §2.2)', 'UNINITNETWORK'),
  declared('FormatMemCard', 'OPT-05a', CARD_PARKED),
  declared('ListSavedGames', 'MENU-13', CARD_PARKED),
  declared('CheckVideoMode', 'MENU-01', CARD_PARKED),
  declared('SwitchProgressiveVideo', 'MENU-01', CARD_PARKED),
];

/**
 * The UI variables and valves the bodies name (the ELF's strings at 0x3ee960 .. 0x3ee9c0, 0x3eeb20, 0x3eeae0, 0x3eeaf0);
 * PLAYERPASSWORD (0x3ee990) and SecurePassword (0x3ee9c0) are ONL-01's constants (`netLoginCommands.ts`: `PasswordSecurity`
 * names the same two through its own strings).
 */
export const LOBBY_HOST_VAR = 'LOBBY_HOST';
export const LOBBY_PORT_VAR = 'LOBBY_PORT';
export const PLAYER_NAME_VAR = 'PLAYERNAMEVAR';
export const PLAYER_HOMETOWN_VAR = 'PLAYERHOMETOWN';
export const PLAYER_PERSONA_LIST_VAR = 'PLAYERPERSONALIST';
export const PATCH_SERVER_URL_VAR = 'PatchServerURL';
export const LAN_PLAYER_NAME_VAR = 'LANPLAYERNAMEVAR';
export const PLAYER_GENDER_VALVE = 'PLAYERGENDER';

/** The row the list pads with (`FUN_00276af0` D:L122572-122577): the caption at 0x3eeb08 and the index -1. */
export const NEW_PERSONA_CAPTION = '<New Persona>';
export const NEW_PERSONA_INDEX = -1;
/** The rows the list is padded to (`for (; i < 3; i++)`, D:L122572): with three personas or more, none is added. */
export const PERSONA_LIST_ROWS = 3;
/** The patch level a universe may name without a download (the string at 0x3f5dd8; `FUN_002fd6e0` D:L199843). */
export const PATCH_LEVEL = 'r0001';
/** `NetCensorText`'s argument that stands for the animation's input (the string at 0x3eeb58). */
export const CENSOR_INPUT_ARGUMENT = '$1';
/** The lobby state `LobbyLogout` does not log out of (`DAT_0044f3d0 != 0x12`, D:L126234). */
export const LOBBY_STATE_LOGGING_OUT = 0x12;

/** The record's string fields' sizes, as `FUN_002fbce0`'s `strncpy`s cut them (D:L199072-199080). */
export const ACCT_FIELD_BYTES = { host: 0x80, name: 0x20, password: 0x20, hometown: 0x3f } as const;

/**
 * ACCT_NO_LOBBY_HOST_READING: the HOST the bodies use while LOBBY_HOST holds no string -- they pass a null pointer
 * (`uVar8 = 0`, e.g. D:L121752-121757), which the list's `strcmp` would read through. Taken as the empty string: the
 * form is reached only after `LobbyConnect` has set the variable. [reading]
 */
export const ACCT_NO_LOBBY_HOST_READING = '';

/**
 * PRUNE_ALL_SPACES_READING: what `PruneUIVarSpaces` leaves of a string that is nothing but spaces. Its walk back from
 * the last character (D:L123388-123393) has no lower bound: it steps below the 800-byte buffer onto the stack byte
 * before it and writes the terminator after the first byte there that is no space. Taken as stopping at once (that
 * byte is no space): the empty string. [reading]
 */
export const PRUNE_ALL_SPACES_READING = '';

/**
 * COMPARE_VALUES_UIVAR_ADD_READING: `CompareValues` reaches a `UIVAR1` / `UIVAR2` through `CUIVarManager_Add` with no
 * longevity argument (`FUN_003857c0(0x437e80, name, 0)`, D:L121646, D:L121650: the fourth register is whatever the
 * call before left). A held variable is read either way; an absent one would be made at that leftover longevity. Here
 * it is looked up and not made: the side compares by its name. [reading]
 */
export const COMPARE_VALUES_UIVAR_ADD_READING = 'looked up, not made' as const;

/**
 * COMPARE_AFTER_FORMATTING_READING: with byte +0x15 set, each side is put through a text object's set-string
 * (`FUN_00363830` D:L261172-261246: the `$~` cut, then the object's parse at vtable +0x70) and what it leaves is
 * compared (D:L121653-121658). The parse is PLAT-13's caption parse; the host hands it in as `format`. Without one the
 * sides compare as given. No CompareValues of the persona form sets the byte. [reading]
 */
export const COMPARE_AFTER_FORMATTING_READING = 'the host\'s caption parse; without one, as given' as const;

/**
 * IS_NETWORK_ON_PATH_READING: the byte `DAT_0045a0c1` (`IsNetwork`) `NetCensorText` tests first (D:L122967). Its
 * writers were not followed; the persona form is reached only past the DNAS screen's `InitNetwork`, so it is taken as
 * set unless the host says otherwise (`network`). [reading]
 */
export const IS_NETWORK_ON_PATH_READING = true;

/**
 * NET_CENSOR_TEXT_PLACEHOLDER: `NetCensorText` hands the variable's text to the lobby's text filter
 * (`FUN_002f4df0(0x44f370, text, 0x2777c0, var)`, D:L122975), whose reply's callback 0x2777c0 was not read. The filter
 * is SVC-23's; with no `lobby.censor` nothing is asked and the variable stays as typed. [placeholder]
 */
export const NET_CENSOR_TEXT_PLACEHOLDER = 'no text filter: the variable stays as typed' as const;

/**
 * LOBBY_CONNECT_PLACEHOLDER: `LobbyConnect`'s last call is the connection to the universe's lobby
 * (`FUN_002e0030(0x44f370, host, port)` D:L182591-182762: a connection not already in flight is started and the answer
 * is 1, else 0; its DME callback at 0x2e0440 queues lobby state 12), and the `MP_SUCCESS` that `server_connected` waits
 * on is posted once that connection stands. With no lobby handed in the row answers 1 and posts `MP_SUCCESS` into the
 * dialog host at once, so SELECT UNIVERSE's CROSS reaches the persona form as the set has it. [placeholder]
 *
 * *Retired on the page by ONL-07 (2026-10-05, research 157 §2):* the page hands in `./lobbyClient`'s `LobbyClient`,
 * whose `connect` is `FUN_002e0030` and which posts `MP_SUCCESS` where the original does -- **found**: state 12's
 * SessionBegin reply, `FUN_002ee910` (D:L190900-190924, the string at 0x3f4a10, D:L190919). This doc read "where, was
 * not found (the two `(*DAT_0044f3c8)("MP_SUCCESS", 0)` sites, D:L186962 and D:L190919, are the clan's)": D:L186962
 * (`FUN_002e7580`) is another reply's; D:L190919 is this connection's. The constant stands for a host with no lobby
 * (a rig, a session with no account service).
 */
export const LOBBY_CONNECT_PLACEHOLDER = true;

/**
 * LOBBY_STATE_PLACEHOLDER: the lobby's state byte `DAT_0044f3d0` that `LobbyLogout` reads (D:L126230-126235), with no
 * lobby handed in: 0, "not connected", under which the row answers 1 and TRIANGLE's `leave_player_name_screen` goes on
 * to `SWITCHMENU(PREVIOUS_SCREEN)`. [placeholder] *On the page since ONL-07 (research 157 §2) the byte is
 * `LobbyClient.state()` and the logout's states (0x12, then 0) are its handlers; the constant stands for a host with
 * no lobby.*
 */
export const LOBBY_STATE_PLACEHOLDER = 0;

/** One account record: the fields of the 0x1318-byte record the persona form reads and writes. */
export interface AcctRecord {
  host: string;
  port: number;
  name: string;
  password: string;
  hometown: string;
  /** The byte +0x103: 0 or 1 as `UpdateAcctInfo` writes it (`PLAYERGENDER != 0`). */
  gender: number;
  /** The byte +0x1314: 0 or 1 (`SecurePassword != 0`). */
  savePassword: number;
}

/** The bytes a character takes in the game's strings (UTF-8, as the keyboard counts them: `FUN_0039f160`). */
const bytesOf = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * `strncpy(field, s, n)` (`FUN_00199800`): at most `n` bytes. A string of `n` bytes or more fills the field with no
 * terminator and the original then reads on into the next field; the keyboards' `MaxBytes` (31 for the name and the
 * password, 63 for the hometown, research 119 §5) keep the name and the password one byte short of that, and a 63-byte
 * hometown ends on the gender byte (0 or 1). Here the field is the first `n` bytes' whole characters.
 */
function cutBytes(s: string, n: number): string {
  let used = 0, out = '';
  for (const ch of s) {
    used += bytesOf(ch.codePointAt(0)!);
    if (used > n) break;
    out += ch;
  }
  return out;
}

/** `FUN_00191490` (D:L9969-9978): `strtol(s, 0, 10)` -- leading blanks, a sign, the digits; 0 when there are none. */
function atoi(s: string): number {
  const m = /^[ \t\n\v\f\r]*([+-]?\d+)/.exec(s);
  return m ? Number.parseInt(m[1]!, 10) | 0 : 0;
}

/** `FUN_00198b80`: equal without case (the ASCII fold of research 107 §2). */
const sameFolded = (a: string, b: string): boolean => uiCommandFold(a) === uiCommandFold(b);

/** The client's account list (`CAcctDB` at 0x44fc60). */
export class AcctDb {
  private readonly list: AcctRecord[] = [];

  /** The records, in the list's order. */
  records(): readonly AcctRecord[] { return this.list.map((r) => ({ ...r })); }

  /** A record appended as it stands (the module's load from the save file; a test's set-up). */
  put(r: AcctRecord): void { this.list.push({ ...r }); }

  /** The list replaced (the save file read: `LoadConfig`'s restore of the `CAcctDB` module). */
  replace(records: readonly AcctRecord[]): void {
    this.list.length = 0;
    for (const r of records) this.put(r);
  }

  /** The records of a HOST and PORT, in order (the walk every function below makes: strcmp on +0, the word at +0x80). */
  private of(host: string, port: number): AcctRecord[] {
    return this.list.filter((r) => r.host === host && r.port === port);
  }

  /**
   * Every record's PASSWORD emptied (ONL-07, the owner's ruling OT.R17: a typed password is held nowhere once the login
   * is answered; `connectCommands.ts` `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`). Not the original's: its list keeps the
   * password of a persona saved with SAVE PASSWORD: YES for the session.
   */
  forgetPasswords(): void { for (const r of this.list) r.password = ''; }

  /** `FUN_002fb920` (D:L198911-198932): how many records the HOST and PORT have. */
  count(host: string, port: number): number { return this.of(host, port).length; }

  /** `FUN_002fb9f0` (D:L198935-198960): the NAME's place among them; their count when it is not there. */
  indexOf(host: string, port: number, name: string): number {
    const of = this.of(host, port);
    const i = of.findIndex((r) => r.name === name);
    return i < 0 ? of.length : i;
  }

  /** `FUN_002fbbf0` (D:L198993-199013): whether a record of HOST, PORT and NAME is held. */
  exists(host: string, port: number, name: string): boolean {
    return this.of(host, port).some((r) => r.name === name);
  }

  /** `FUN_002fd510` (D:L199770-199800): the place's NAME (+0x84), null past the list. */
  name(host: string, port: number, i: number): string | null { return this.of(host, port)[i]?.name ?? null; }
  /** `FUN_002fd410` (D:L199737-199767): the place's PASSWORD (+0xa4). */
  password(host: string, port: number, i: number): string | null { return this.of(host, port)[i]?.password ?? null; }
  /** `FUN_002fd310` (D:L199704-199734): the place's HOMETOWN (+0xc4). */
  hometown(host: string, port: number, i: number): string | null { return this.of(host, port)[i]?.hometown ?? null; }
  /** `FUN_002fd110` (D:L199636-199667): the place's GENDER byte (+0x103), 0 past the list. */
  gender(host: string, port: number, i: number): number { return this.of(host, port)[i]?.gender ?? 0; }
  /** `FUN_002fd210` (D:L199670-199701): the place's SAVEPASSWORD byte (+0x1314), 0 past the list. */
  savePassword(host: string, port: number, i: number): number { return this.of(host, port)[i]?.savePassword ?? 0; }

  /** `FUN_002fbae0` (D:L198963-198990): the place's record erased (`FUN_002fe230`); a place past them, nothing. */
  remove(host: string, port: number, i: number): void {
    const r = this.list.filter((x) => x.host === host && x.port === port)[i];
    if (r) this.list.splice(this.list.indexOf(r), 1);
  }

  /**
   * `FUN_002fd0d0` (D:L199622-199633; its instructions 0x2fd0d0-0x2fd100, which the decompiler folds: nothing with no
   * NAME or an empty one; `movz t0, zero, t3` at 0x2fd0ec nulls the PASSWORD when SAVEPASSWORD is 0; the profiles
   * argument zeroed in the call's delay slot) into `FUN_002fbce0` (D:L199016-199184): the record of HOST, PORT and NAME
   * found (D:L199058-199066), or one appended zeroed (`FUN_002fe3e0`, D:L199067-199071); HOST, PORT and NAME written;
   * PASSWORD and HOMETOWN only when handed (D:L199075-199080), so SAVE PASSWORD: NO leaves a held record's password as it stands and a new
   * record's empty; GENDER and SAVEPASSWORD written.
   */
  update(host: string, port: number, name: string | null, password: string | null, hometown: string | null, gender: number, savePassword: number): void {
    if (name === null || name === '') return;
    const pw = savePassword ? password : null;
    let r = this.list.find((x) => x.host === host && x.port === port && x.name === name);
    if (!r) {
      r = { host: '', port: 0, name: '', password: '', hometown: '', gender: 0, savePassword: 0 };
      this.list.push(r);
    }
    r.host = cutBytes(host, ACCT_FIELD_BYTES.host);
    r.port = port;
    r.name = cutBytes(name, ACCT_FIELD_BYTES.name);
    if (pw !== null) r.password = cutBytes(pw, ACCT_FIELD_BYTES.password);
    if (hometown !== null) r.hometown = cutBytes(hometown, ACCT_FIELD_BYTES.hometown);
    r.gender = gender ? 1 : 0;
    r.savePassword = savePassword ? 1 : 0;
  }
}

/**
 * The universe entry's extended info as `FUN_002fdaf0` splits it (D:L200071-200079): the first 0x80 bytes, `strtok` on
 * space and tab (the strings at 0x3f5f08 and 0x3f5f00) -- the first word 0x20 bytes into the entry's +0x338 (the patch
 * level `VerifyPatchLevel` tests), the second 0x80 bytes into +0x358 (the patch server it hands on). Research 147 §6's
 * "the extended info's two words ... still not traced" is traced here.
 */
export function patchWords(extendedInfo: string): { level: string; url: string } {
  const words = cutBytes(extendedInfo, 0x80).split(/[ \t]+/).filter((w) => w !== '');
  return { level: cutBytes(words[0] ?? '', 0x20), url: cutBytes(words[1] ?? '', 0x80) };
}

/**
 * The lobby as these rows reach it: the Medius lobby object at 0x44f370 and the LAN lobby at 0x44fe10. Every member is
 * another task's (ONL-07 the connection and its states, ONL-10 the logout, SVC-23 the text filter, the LAN lane the
 * LAN lobby); absent, the named placeholders stand.
 */
export interface PersonaLobby {
  /** `FUN_003045b0(0x44fe10)`: the LAN lobby is up. Absent: never (LAN is paused, OT.R1). */
  lanUp?(): boolean;
  /** `FUN_00304420(0x44fe10)`: the LAN lobby's connect, `LobbyConnect`'s answer on that path. */
  lanConnect?(): boolean;
  /** `FUN_002e0030(0x44f370, host, port)`: the connection to the universe's lobby started; its answer. Absent: `LOBBY_CONNECT_PLACEHOLDER`. */
  connect?(host: string, port: number): boolean;
  /** `DAT_0044f3d0`: the lobby's state byte. Absent: `LOBBY_STATE_PLACEHOLDER`. */
  state?(): number;
  /** `FUN_002fa560(0x44f370)`: the logout asked. */
  logout?(): void;
  /** `FUN_002f4df0(0x44f370, text, 0x2777c0, var)`: the text filter asked about a variable's text. Absent: `NET_CENSOR_TEXT_PLACEHOLDER`. */
  censor?(text: string, v: UiVariable): void;
}

export interface PersonaCommandsOptions {
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's account list (0x44fc60). */
  db: AcctDb;
  /** The client's universe entries (0x44fd50: ONL-04's list), which `VerifyPatchLevel` and `LobbyConnect` look a name up in. */
  universes: UniverseList;
  /** `INPUT_STRING`'s replacement for the command's running animation; null when it has none. */
  inputString: (cmd: ZAnimUiCommand) => string | null;
  /** `FUN_0026ed60`: a name of the command's running animation by index (CompareValues' two sides). */
  name: (cmd: ZAnimUiCommand, index: number) => string | null;
  /** The lobby (`PersonaLobby`); absent, the placeholders. */
  lobby?: PersonaLobby;
  /** `DAT_0045a0c1`; absent, `IS_NETWORK_ON_PATH_READING`. */
  network?: () => boolean;
  /** `FUN_001f3bf0(0x408538, name, 0)`: a named event into the dialog host (`LOBBY_CONNECT_PLACEHOLDER`'s MP_SUCCESS). */
  event?: (kind: number) => void;
  /** PLAT-13's caption parse of a string (`COMPARE_AFTER_FORMATTING_READING`). */
  format?: (text: string) => string;
  /** A row called, as it happens. */
  log?: (name: PersonaCommandName, arg: string, answer: boolean) => void;
}

export class PersonaCommands {
  constructor(private readonly o: PersonaCommandsOptions) {}

  private answer(name: PersonaCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_0026ed60(ctx, names[+8])`, `INPUT_STRING` replaced by the animation's input; null for no name. */
  private arg(cmd: ZAnimUiCommand): string | null {
    if (cmd.arg === INPUT_STRING) return this.o.inputString(cmd);
    return cmd.arg === '' ? null : cmd.arg;
  }

  /** A variable's string, or null when it holds none (`*pc == '\x03'`). */
  private str(v: UiVariable): string | null { return v.value.type === 'string' ? v.value.value : null; }

  /** LOBBY_HOST and LOBBY_PORT as every body reads them: each added PERMANENT; a string, else null; an int, a real truncated, else 0. */
  private lobbyAddress(): { host: string; port: number } {
    const vars = this.o.uiVars;
    const h = this.str(vars.add(LOBBY_HOST_VAR, null, 2));
    const p = vars.add(LOBBY_PORT_VAR, null, 2).value;
    const port = p.type === 'int' ? p.value : p.type === 'real' ? Math.trunc(p.value) : 0;
    return { host: h ?? ACCT_NO_LOBBY_HOST_READING, port };
  }

  /** A valve acquired at `type` and written through its watchers when the value differs (`FUN_00351ff0`, `FUN_003519f0`). */
  private writeValve(name: string, type: ValveType, value: number): void {
    const valves = this.o.valves();
    const v = valves.acquire(name, type);
    if (v.value !== (value & 0xffff)) valves.set(name, value, type);
  }

  /**
   * `FUN_00276af0` (D:L122548-122583): PLAYERPERSONALIST added TEMPORARY and set to one row a persona of HOST and PORT
   * -- its place (an int) and its NAME -- then `[-1, "<New Persona>"]` rows up to three. A fourth persona is listed
   * like the first three: the pad is the only 3 here.
   */
  personaList(host: string, port: number): void {
    const db = this.o.db, rows: UiVarValue[] = [];
    const n = db.count(host, port);
    let i = 0;
    for (; i < n; i++) rows.push({ type: 'array', value: [{ type: 'int', value: i }, { type: 'string', value: db.name(host, port, i) ?? '' }] });
    for (; i < PERSONA_LIST_ROWS; i++) rows.push({ type: 'array', value: [{ type: 'int', value: NEW_PERSONA_INDEX }, { type: 'string', value: NEW_PERSONA_CAPTION }] });
    const vars = this.o.uiVars;
    vars.set(vars.add(PLAYER_PERSONA_LIST_VAR, null, 1), { type: 'array', value: rows });
  }

  /**
   * The form's three variables and two valves from the place's record, as `GetMUISPersonaInfo` (D:L121844-121885),
   * `DeleteMUISPersona` (D:L122335-122387) and `LobbyConnect` (D:L122492-122533) each do it: a variable is added
   * TEMPORARY and set only when the place has a record -- or, for `DeleteMUISPersona` (`blank`), set to "" (0x3eead8)
   * when it has none; PLAYERGENDER (acquired at `genderType`) and SecurePassword (PERM) take the record's bytes, 0
   * past the list, through their watchers when they change.
   */
  private fillForm(host: string, port: number, place: number, genderType: ValveType, blank: boolean): void {
    const vars = this.o.uiVars, db = this.o.db;
    const put = (name: string, value: string | null): void => {
      const v = vars.add(name, null, 1);
      if (value !== null) vars.set(v, { type: 'string', value });
      else if (blank) vars.set(v, { type: 'string', value: '' });
    };
    put(PLAYER_NAME_VAR, db.name(host, port, place));
    put(PLAYER_PASSWORD_VAR, db.password(host, port, place));
    put(PLAYER_HOMETOWN_VAR, db.hometown(host, port, place));
    this.writeValve(PLAYER_GENDER_VALVE, genderType, db.gender(host, port, place));
    this.writeValve(SECURE_PASSWORD_VALVE, VALVE_TYPE.PERM, db.savePassword(host, port, place) & 0xff);
  }

  /**
   * `FUN_00275130` (D:L121727-121796): LOBBY_HOST and LOBBY_PORT (added PERMANENT), the form's three variables (added
   * TEMPORARY; a string each, else null), PLAYERGENDER (acquired PERSIST) and SecurePassword (acquired PERM) as
   * `!= 0` -- into the account list (`AcctDb.update`), then the persona list rebuilt (`FUN_00276af0`). Answer 1.
   *
   * This is where the SAVE PASSWORD row's toggle lands: the YES box's ONCHECK (`enable_store_password`: SecurePassword
   * 1, `SaveAvailable` 1) and the NO box's (`disable_store_password`) each end in this row, which files SAVEPASSWORD
   * and, under YES, the typed password in the list in memory. On the page YES is honoured through the server's remember
   * cookie (MISSION OT.R61, SAVE-PASSWORD; `packages/viewer/src/personaHost.ts`): the card keeps SAVEPASSWORD and the
   * password's length, a saved record is read back as that length's stand-in, and ONL-07's
   * `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION` lets a typed password go when the login is answered -- a YES one kept as its
   * stand-in only when the login succeeded (`savedAtSuccess`). *Was, until 2026-10-17: not honoured, every record written as under NO
   * (`SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`, retired).*
   */
  UpdateAcctInfo: UiCommandHandler = (cmd) => {
    const vars = this.o.uiVars, valves = this.o.valves();
    const { host, port } = this.lobbyAddress();
    const name = this.str(vars.add(PLAYER_NAME_VAR, null, 1));
    const password = this.str(vars.add(PLAYER_PASSWORD_VAR, null, 1));
    const hometown = this.str(vars.add(PLAYER_HOMETOWN_VAR, null, 1));
    const gender = valves.acquire(PLAYER_GENDER_VALVE, VALVE_TYPE.PERSIST).value !== 0 ? 1 : 0;
    const save = valves.acquire(SECURE_PASSWORD_VALVE, VALVE_TYPE.PERM).value !== 0 ? 1 : 0;
    this.o.db.update(host, port, name, password, hometown, gender, save);
    this.personaList(host, port);
    return this.answer('UpdateAcctInfo', cmd, true);
  };

  /**
   * `FUN_00275350` (D:L121799-121888): with an argument -- the place it names: `atoi` when the command's byte +0x10 is
   * 1 (the list's CROSS: the row's first cell), else the NAME's place (`FUN_002fb9f0`; the keyboard's ON_SKB_APPLY) --
   * the form filled from that record (PLAYERGENDER acquired PERSIST). No argument, nothing. Answer 1.
   */
  GetMUISPersonaInfo: UiCommandHandler = (cmd) => {
    const arg = this.arg(cmd);
    if (arg !== null) {
      const { host, port } = this.lobbyAddress();
      const place = cmd.bytes[0x10] === 1 ? atoi(arg) : this.o.db.indexOf(host, port, arg);
      this.fillForm(host, port, place, VALVE_TYPE.PERSIST, false);
    }
    return this.answer('GetMUISPersonaInfo', cmd, true);
  };

  /**
   * `FUN_002761a0` (D:L122290-122391): with an argument -- the place `atoi` gives; whether PLAYERNAMEVAR names that
   * record, compared without case (`FUN_00198b80`, D:L122333; a place with no record compares a null pointer in the
   * original: taken as not the same); the record erased (`FUN_002fbae0`); when it was the form's, the form takes the
   * first record left, or empties; then the persona list rebuilt. Answer 1.
   */
  DeleteMUISPersona: UiCommandHandler = (cmd) => {
    const arg = this.arg(cmd);
    if (arg !== null) {
      const { host, port } = this.lobbyAddress();
      const place = atoi(arg);
      const shown = this.str(this.o.uiVars.add(PLAYER_NAME_VAR, null, 1));
      const held = this.o.db.name(host, port, place);
      const same = shown !== null && held !== null && sameFolded(shown, held);
      this.o.db.remove(host, port, place);
      if (same) this.fillForm(host, port, 0, VALVE_TYPE.PERSIST, true);
      this.personaList(host, port);
    }
    return this.answer('DeleteMUISPersona', cmd, true);
  };

  /** `FUN_00276580` (D:L122394-122426): whether the account list holds the argument's NAME under LOBBY_HOST and LOBBY_PORT (no argument: false). */
  MUISPersonaExists: UiCommandHandler = (cmd) => {
    const arg = this.arg(cmd);
    const { host, port } = this.lobbyAddress();
    return this.answer('MUISPersonaExists', cmd, arg !== null && this.o.db.exists(host, port, arg));
  };

  /**
   * `FUN_00274db0` (D:L121617-121672), over the record its builder `FUN_00274fc0` makes (D:L121675-121724: `VALUE1` /
   * `UIVAR1` into +0x10 with +0x11 set for a variable, `VALUE2` / `UIVAR2` into +0x12 and +0x13, `CASE_INSENSITIVE`
   * +0x14, `COMPARE_AFTER_FORMATTING` +0x15): each side the animation's name at its index, `INPUT_STRING` replaced by
   * the animation's input; a side flagged as a variable takes the variable's string when it holds one
   * (`COMPARE_VALUES_UIVAR_ADD_READING`); with +0x15 both sides formatted (`COMPARE_AFTER_FORMATTING_READING`); both
   * present, `strcmp` or, with +0x14, the caseless compare; else 0.
   */
  CompareValues: UiCommandHandler = (cmd) => {
    const b = cmd.bytes;
    const side = (index: number, isVar: boolean): string | null => {
      let s = this.o.name(cmd, index);
      if (s !== null && s === INPUT_STRING) s = this.o.inputString(cmd);
      if (isVar && s !== null) {
        const v = this.o.uiVars.find(s);
        if (v && v.value.type === 'string') s = v.value.value;
      }
      return s;
    };
    let one = side(b[0x10] ?? 0, b[0x11] === 1), two = side(b[0x12] ?? 0, b[0x13] === 1);
    if (one === null || two === null) return this.answer('CompareValues', cmd, false);
    if ((b[0x15] ?? 0) !== 0 && this.o.format) { one = this.o.format(one); two = this.o.format(two); }
    const same = (b[0x14] ?? 0) === 0 ? one === two : sameFolded(one, two);
    return this.answer('CompareValues', cmd, same);
  };

  /**
   * `FUN_00278370` (D:L123368-123404): the variable the argument names, looked up (`FUN_00385900`); a string is printed
   * `%s` into an 800-byte buffer, the spaces at its end cut, those at its start skipped, and set back
   * (`PRUNE_ALL_SPACES_READING` for a string of spaces alone). Answer 1.
   */
  PruneUIVarSpaces: UiCommandHandler = (cmd) => {
    const name = this.arg(cmd);
    const v = name === null ? undefined : this.o.uiVars.find(name);
    if (v && v.value.type === 'string') {
      const s = v.value.value;
      const cut = /^ *$/.test(s) ? PRUNE_ALL_SPACES_READING : s.replace(/ +$/, '').replace(/^ +/, '');
      this.o.uiVars.set(v, { type: 'string', value: cut });
    }
    return this.answer('PruneUIVarSpaces', cmd, true);
  };

  /**
   * `FUN_002776e0` (D:L122958-122979): on the network (`DAT_0045a0c1`) with the LAN lobby down, the variable the
   * argument names (`$1` replaced by the animation's input), when it holds a string, is handed to the lobby's text
   * filter (`NET_CENSOR_TEXT_PLACEHOLDER`). Answer 1.
   */
  NetCensorText: UiCommandHandler = (cmd) => {
    const lobby = this.o.lobby;
    if ((this.o.network?.() ?? IS_NETWORK_ON_PATH_READING) && !(lobby?.lanUp?.() ?? false)) {
      const name = cmd.arg !== '' && sameFolded(cmd.arg, CENSOR_INPUT_ARGUMENT) ? this.o.inputString(cmd) : cmd.arg === '' ? null : cmd.arg;
      const v = name === null ? undefined : this.o.uiVars.find(name);
      if (v && v.value.type === 'string') lobby?.censor?.(v.value.value, v);
    }
    return this.answer('NetCensorText', cmd, true);
  };

  /**
   * `FUN_0027dcc0` (D:L126223-126238): the lobby's state byte -- 0 answers 1; 0x12 answers 0; any other asks the
   * logout (`FUN_002fa560`) and answers 0, so the sequence holds on the row until the state is 0
   * (`LOBBY_STATE_PLACEHOLDER` with no lobby).
   */
  LobbyLogout: UiCommandHandler = (cmd) => {
    const state = this.o.lobby?.state?.() ?? LOBBY_STATE_PLACEHOLDER;
    if (state === 0) return this.answer('LobbyLogout', cmd, true);
    if (state !== LOBBY_STATE_LOGGING_OUT) this.o.lobby?.logout?.();
    return this.answer('LobbyLogout', cmd, false);
  };

  /**
   * `FUN_002766b0` (D:L122429-122451) over `FUN_002fd6e0` (D:L199827-199850): the first universe of the argument's name
   * -- no patch level (+0x338 empty), or the level `r0001`, is 1; none of that name is 1. Otherwise PatchServerURL
   * (added TEMPORARY) takes the patch server (+0x358) of the last universe of that name (`FUN_002fd610`
   * D:L199803-199824) and the answer is 0 (`select_server` then switches to `dlgDownloadPatch`, ONL-05).
   */
  VerifyPatchLevel: UiCommandHandler = (cmd) => {
    const name = this.arg(cmd) ?? '';
    const first = this.o.universes.find(name);
    const level = first ? patchWords(first.extendedInfo).level : '';
    const ok = level === '' || level === PATCH_LEVEL;
    if (!ok) {
      const vars = this.o.uiVars;
      const last = this.o.universes.findLast(name);
      vars.set(vars.add(PATCH_SERVER_URL_VAR, null, 1), { type: 'string', value: last ? patchWords(last.extendedInfo).url : '' });
    }
    return this.answer('VerifyPatchLevel', cmd, ok);
  };

  /**
   * The form's half of `LobbyConnect` (D:L122480-122534): LOBBY_HOST (added PERMANENT) set to the universe's DNS,
   * LOBBY_PORT to its port as an int; the form's variables and valves from the HOST and PORT's first record
   * (PLAYERGENDER acquired PERM here, D:L122508); the persona list built. Also what a deep link to the form runs (a
   * browser adaptation: the original reaches the form only through this row).
   */
  enterForm(host: string, port: number): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(LOBBY_HOST_VAR, null, 2), { type: 'string', value: host });
    vars.set(vars.add(LOBBY_PORT_VAR, null, 2), { type: 'int', value: port });
    this.fillForm(host, port, 0, VALVE_TYPE.PERM, false);
    this.personaList(host, port);
  }

  /**
   * `FUN_00276780` (D:L122454-122545). With the LAN lobby down (`FUN_003045b0(0x44fe10)` 0): the first universe of the
   * argument's name -- none, or a status word (+0x220) of 0, answers 0 (`FUN_002fd7e0` D:L199853-199872); else its DNS
   * (+0x9c, `FUN_002fd980`) and port (+0x11c, `FUN_002fd8b0`) into `enterForm`, then the connection
   * (`FUN_002e0030(0x44f370, host, port)`), whose answer is the row's (`LOBBY_CONNECT_PLACEHOLDER` with none). With it
   * up: PLAYERNAMEVAR (added TEMPORARY) takes LANPLAYERNAMEVAR's value (added PERSISTENT) and the answer is the LAN
   * connect's (`FUN_00304420`).
   */
  LobbyConnect: UiCommandHandler = (cmd) => {
    const lobby = this.o.lobby, vars = this.o.uiVars;
    if (lobby?.lanUp?.() ?? false) {
      const name = vars.add(PLAYER_NAME_VAR, null, 1);
      vars.set(name, vars.add(LAN_PLAYER_NAME_VAR, null, 3).value);
      return this.answer('LobbyConnect', cmd, lobby?.lanConnect?.() ?? false);
    }
    const u = this.o.universes.find(this.arg(cmd) ?? '');
    if (!u || u.universeStatus === 0) return this.answer('LobbyConnect', cmd, false);
    this.enterForm(u.dns, u.port);
    if (lobby?.connect) return this.answer('LobbyConnect', cmd, lobby.connect(u.dns, u.port));
    this.o.event?.(DIALOG_EVENTS.MP_SUCCESS!);
    return this.answer('LobbyConnect', cmd, LOBBY_CONNECT_PLACEHOLDER);
  };

  /** The entries by their table name. */
  entries(): Record<PersonaCommandName, UiCommandHandler> {
    return {
      LobbyLogout: this.LobbyLogout, NetCensorText: this.NetCensorText, PruneUIVarSpaces: this.PruneUIVarSpaces, LobbyConnect: this.LobbyConnect,
      UpdateAcctInfo: this.UpdateAcctInfo, GetMUISPersonaInfo: this.GetMUISPersonaInfo, DeleteMUISPersona: this.DeleteMUISPersona,
      CompareValues: this.CompareValues, MUISPersonaExists: this.MUISPersonaExists, VerifyPatchLevel: this.VerifyPatchLevel,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
