import {
  CardExtStore, MP_NAME_IMPORTED, PERSONA_PASSWORD_MAX, PersonaCard, UI_VAR_MODULE, migrateOnceSync, mpNameMigration,
  type CardSlots, type Libmc, type MigrationResult, type PersonaLogin, type PersonaRecord, type Settings,
} from '@s2u/card';
import { restoreValveModule, valveModule, VALVE_MODULE } from './originalOptions';
import { pageCard, pageSettings } from './pageStore';
import {
  AcctDb, CONFIG_FILE_PLACEHOLDER, CardCommands, INPUT_STRING, PersonaCommands, UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER, restoreUiVarModule, serializeUiVars,
  uiCommandRowByName, uiVarModule,
  type AcctRecord, type CardConfigFile, type DialogPartsHost, type FrontEndMachine, type MenuCommands, type PersonaLobby, type UiCommandHandler,
  type UiCommandHost, type UiVarManager, type UniverseList, type ZAnimUiCommand,
} from '@s2u/ui';

/**
 * ONL-06's rows connected on the page (web research 153 §5): `@s2u/ui`'s `PersonaCommands` -- what CONNECT TO SOCOM II
 * (`dlgNetPlayerName.rdr`) and SELECT UNIVERSE's CROSS dispatch -- registered in PLAT-08's host over the client's
 * account list, and that list read from and written to the page's virtual card through `@s2u/card`'s persona API
 * (OPT-04a, research 135).
 *
 * **Where the card is written.** As on the console: by `SaveConfig`, which the form's `memcard_operations` reaches
 * through `save_and_leave` when the player answers YES to "Would you like to save ..." (#831) on CONNECT or TRIANGLE
 * (research 143 R143.1). OPT-05i's five card rows (`CardCommands`) were not registered on the page (research 143 §5);
 * this call registers them, with the save file's `CAcctDB` module as their `CardConfigFile`: `contents` is the account
 * list as the form left it, `restore` what a `LoadConfig` read. The file's other modules (the options, OPT-01 / OPT-02)
 * are kept as read.
 *
 * **What the card keeps (MISSION OT.R61, the owner, 2026-10-17, amending OT.R17).** The record's HOST, PORT, NAME,
 * TOWN and GENDER, and SAVE PASSWORD as the original writes it (`FUN_002fc440` D:L199263-199266: the password only when
 * it is non-empty and SAVEPASSWORD is set): here SAVEPASSWORD and the password's **length**, never the password or a
 * token (`@s2u/card` `personaFromLogin`). A record saved under YES is read back as its length in the stand-in
 * (`SAVED_PASSWORD_STAND_IN_ADAPTATION`), which the form draws as the original draws a saved password and the login
 * sends as the server's remember cookie (`./connectHost`, `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`). The typed password
 * lives in `PLAYERPASSWORD` and, under SAVE PASSWORD: YES, in the account list in memory -- as in the game -- until the
 * login is answered (`PageAcctDb`).
 *
 * *Was, until 2026-10-17 (SAVE-PASSWORD): every record went to the card as under NO -- SAVEPASSWORD 0, no length --
 * under `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER` (OT.R17), now retired.*
 *
 * **The MP name (OPT-04, research 229 §5).** `s2u.mp.name`, the name W3.R12's settings field keeps for `/testroom`, is
 * read once into the card slot's `ext` when the session is made (`migrateOnceSync`, `MP_NAME_MIGRATION_ADAPTATION`) and
 * becomes the NAME of the record the form lists first -- where the online path reads the name -- at the form's first
 * entry with no persona on the card.
 *
 * The lobby -- the connection `LobbyConnect` starts, its states, the logout, the text filter -- is ONL-07's, ONL-10's
 * and SVC-23's: `lobby` is theirs to hand in; without it `@s2u/ui`'s placeholders stand (`LOBBY_CONNECT_PLACEHOLDER`:
 * SELECT UNIVERSE's CROSS reaches the form at once). Since ONL-07 the page hands in its lobby client
 * (`./connectHost`, research 157 §5): the connection and its `MP_SUCCESS` are the client's, and a deep link to the
 * form starts the connection too (`entered`), so that CONNECT can log in.
 */

/** The persona form's dialog. */
export const PERSONA_DIALOG = 'dlgNetPlayerName.rdr';

/** The stand-in's character: U+0001, which no key of the soft keyboard types (`UiParams.rdr`'s grids, the USB keys). */
export const SAVED_PASSWORD_STAND_IN = '\u0001';

/**
 * SAVED_PASSWORD_STAND_IN_ADAPTATION (SAVE-PASSWORD, MISSION OT.R61; web research 153 §8): how the page holds a password
 * the original would have read off the card. The original's card keeps the password itself under SAVE PASSWORD: YES
 * (`FUN_002fc440` D:L199263-199265), its load hands it to the account list (`FUN_002fc280` D:L199229, D:L199234), and
 * `LobbyConnect` puts it in PLAYERPASSWORD (`FUN_00276780` D:L122497-122500), where the SECURETEXT draws one `*` a
 * character (`FUN_0036aff0` D:L265383-265411) and CONNECT is lit (R153.5). The page's card keeps the length alone (R7;
 * OT.R61), so a YES record is read back as that many U+0001 -- a character no key types -- and the form draws and lights
 * as the original's. The stand-in is no secret and nothing of the player's: it is never sent (the login sends the
 * remember cookie in its place, `./connectHost` `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`), never stored (the card takes its
 * length, as it takes a typed password's; PLAYERPASSWORD is never in the card's `CUIVarManager` module, `@s2u/ui`
 * `uiVars.ts`'s filter) and never logged. A browser adaptation.
 */
export const SAVED_PASSWORD_STAND_IN_ADAPTATION = 'a saved password is held as its length in U+0001, which no key types: drawn as that many asterisks, sent as the remember cookie, never stored or logged' as const;

/** The stand-in of a saved password of `length` characters (cut at the card's 12, `PERSONA_PASSWORD_MAX`). */
export function savedPasswordStandIn(length: number): string {
  return SAVED_PASSWORD_STAND_IN.repeat(Math.max(0, Math.min(Math.trunc(length), PERSONA_PASSWORD_MAX)));
}

/** Whether `s` is a saved password's stand-in: one or more U+0001 and nothing else. */
export function isSavedPasswordStandIn(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.length > 0 && /^\u0001+$/.test(s);
}

/**
 * PERSONA_HOST_PLACEHOLDER: the HOST and PORT a persona is filed under (OC-3, the owner's: "what HOST the browser
 * stores") -- LOBBY_HOST and LOBBY_PORT as `LobbyConnect` takes them from the universe entry (+0x9c, +0x11c), which on
 * the console is the lobby's resolved address and on our server whatever `texts.json` names (SVC-05's placeholder
 * universe: an empty DNS and port 0, "the page connects back to the server that answered"). Research 135's
 * `PERSONA_HOST_AS_GIVEN_READING` is the card's side of the same question. [placeholder]
 */
export const PERSONA_HOST_PLACEHOLDER = 'LOBBY_HOST and LOBBY_PORT as the universe entry gives them' as const;

/**
 * MP_NAME_MIGRATION_ADAPTATION: the page's old MP name (`s2u.mp.name`, PLAT-24's key that changes home; research 99 §3)
 * into the persona record, a browser adaptation with no original. When the session is made, `migrateOnceSync` reads the
 * key once into the card slot's `ext` (`CardExtStore`: redotcom's own data, never the save file -- R7's ext rule), the name
 * cut at 14 (`mpNameMigration`), unless the card already holds a persona; the key is left in place (W6.R5). At the
 * form's first entry after it -- `LobbyConnect` for a universe it accepts, or the deep link -- with no persona in the
 * account list, the name is taken from `ext` and appended as `UpdateAcctInfo` appends a record (`FUN_002fbce0`
 * D:L199067-199071: found none, one appended zeroed, HOST, PORT and NAME written): the universe's HOST and PORT
 * (`PERSONA_HOST_PLACEHOLDER`), no password, no hometown, GENDER and SAVEPASSWORD 0. The form then lists it as it lists
 * any held record; the card holds it once the player saves (`SaveConfig`), as on the console.
 */
export const MP_NAME_MIGRATION_ADAPTATION = 's2u.mp.name read once into the card slot\'s ext; the form\'s first entry with no persona appends a record of that NAME, as UpdateAcctInfo appends one' as const;

/**
 * PERSONA_LOAD_ADAPTATION: when the account list is read, and from which slot. The console reads the save file in the
 * boot's `load_initial_config` (`UIMemCardAnim.rdr`): `find_a_memcard` counts the cards -- one card, that slot; a card
 * in each, `choose_memcard_slot`'s #828 "Select MEMORY CARD slot:" (#510 / #511) -- and `LoadConfig` reads the chosen
 * slot's file when `Ensure_MC_Dirs_Fast` finds the folder there. The page's boot stubs that chain (BOOT-05 parked,
 * OT.R6), and its virtual card always holds a card in each slot, so the console would ask every time and the page has
 * no boot prompt to ask with. Until BOOT-05: the list is read when the session is made from the first slot that holds
 * the save file -- slot 1, the answer #828 offers first, then slot 2 -- so a persona saved to slot 2 (the save's own
 * slot select, #830) is read back (ONL-06's review: slot 1 alone was read); with a save in both, slot 1's, where the
 * console would have asked. The config in memory is one, as on the console: the loaded file's other modules and the
 * list are what `SaveConfig` writes to whichever slot the player picks (`CSaveManager::Save`, research 143 R143.8).
 * A browser adaptation, no original.
 */
export const PERSONA_LOAD_ADAPTATION = 'the first slot that holds a SOCOM II save (slot 1, then slot 2), when the session is made; the console asks which (#828)' as const;

/**
 * PERSONA_MALFORMED_DISCARD_ADAPTATION: a save file whose personas do not parse. The console's `LoadConfig` posts
 * MEMCARD_ERROR, shows "Error loading data" (`DisplayErrorLoading`, OPT-05f: parked) and plays on with an empty list,
 * which its next save writes. The page logs the reason in that prompt's place and lets the next save write the list in
 * memory (`PersonaCard.discardMalformed`); the file's other parts are kept as read. A browser adaptation.
 */
export const PERSONA_MALFORMED_DISCARD_ADAPTATION = 'logged in the prompt\'s place; the next save writes the list in memory' as const;

/**
 * The card rows the form's save chain runs (`memcard_operations`, `CanWeSavePassword`, `save_and_leave`,
 * `choose_memcard_slot_cancellable`, `Ensure_MC_Dirs`, `Ensure_MC_Dirs_Fast`, `has_memcard_changed`): MENU-01a's seven
 * and OPT-05i's five.
 */
export const PERSONA_FORM_CARD_ROWS = [
  'IsMemCardInserted', 'IsMemCardFormatted', 'MC_ChPort', 'MC_Exists', 'MC_ChDir', 'MC_MkDir', 'MC_Changed',
  'IsSpaceForSaveGameFile', 'IsMemcardSaveOK', 'LoadConfig', 'SaveConfig', 'MC_CreateIconFiles',
] as const;

/**
 * PERSONA_FORM_CARD_ROWS_ADAPTATION: which card the form's save chain talks to. The page's boot answers the card rows
 * from BOOT-04's stubs -- a fixed f0 card in slot 1, nothing in slot 2 (`@s2u/ui`'s `BOOT_CARD_STUB_PLACEHOLDER`),
 * registered over MENU-01a's rows for the whole session until BOOT-05 puts the page's card behind them (parked, OT.R6).
 * Left so, the form's save would ask the stub whether the folder exists and then write through libmc at the real
 * card's root. So while the dialog built is the persona form, the twelve rows are the real ones over the page's card
 * (MENU-01a's and OPT-05i's bodies); on ONLINE OPTIONS (`dlgOnlineOptions.rdr`, whose RETURN and SAVE run the same
 * `save_and_leave` after SETUP TAUNTS and SETUP MESSAGING: web research 301 §6, 302 §3) and on OPTIONS
 * (`dlgOptions_Menu.rdr`, whose RETURN runs `check_then_save_and_leave`: research 302 §4) the eleven of its save chain
 * are real too, its ONSTART's `has_memcard_changed` poll (`MC_Changed`) left the stub's; on every other dialog what stood in the host (`standing`)
 * answers as before -- and the three rows no stub answers (IsMemcardSaveOK, SaveConfig, MC_CreateIconFiles) answer
 * there what the table answered unimplemented. A browser adaptation of the page's wiring, gone with BOOT-05; it changes
 * no row's body.
 */
export const PERSONA_FORM_CARD_ROWS_ADAPTATION = "on dlgNetPlayerName.rdr the card rows read the page's card, on dlgOnlineOptions.rdr and dlgOptions_Menu.rdr its save chain's (MC_Changed the stub's); elsewhere the boot's stubs stand" as const;

/** ONLINE OPTIONS, whose `save_and_leave` saves SETUP TAUNTS' and SETUP MESSAGING's fives (`PERSONA_FORM_CARD_ROWS_ADAPTATION`). */
export const ONLINE_OPTIONS_DIALOG = 'dlgOnlineOptions.rdr';
/** OPTIONS, whose `save_and_leave` saves the option valves (`PERSONA_FORM_CARD_ROWS_ADAPTATION`, research 302 §4). */
export const OPTIONS_DIALOG = 'dlgOptions_Menu.rdr';

export interface PersonaHostOptions {
  machine: () => FrontEndMachine;
  uiVars: UiVarManager;
  /** PLAT-26a's libmc over the page's slot store (`connectMenuCommands`' answer); null: no card (no personas, nothing saved). */
  libmc: Libmc | null;
  /** The slot store `libmc` is made over (the page's `pageCard` by default, as `connectMenuCommands`'): its `ext` holds the MP name's run. */
  slots?: CardSlots | null;
  /** The page's settings, where the old MP name is read (`pageSettings` by default); null: no migration (`MP_NAME_MIGRATION_ADAPTATION`). */
  legacy?: Settings | null;
  /** MENU-01a's commands: `CMemCardIO`'s port and slot (`cardIo`) the card rows read. */
  menu: MenuCommands;
  /** ONL-04's universe list (the session's). */
  universes: UniverseList;
  /** The session's dialog parts: a running animation's names (`CompareValues`' two sides). */
  parts: DialogPartsHost;
  /** The lobby (ONL-07, ONL-10, SVC-23); absent, `@s2u/ui`'s placeholders. */
  lobby?: PersonaLobby;
  /**
   * The handlers standing in the host for the card rows outside the form (`PERSONA_FORM_CARD_ROWS_ADAPTATION`): the
   * page hands the boot's stubs (`Opener.stubs.entries()`). Absent: the real rows on every dialog.
   */
  standing?: Readonly<Record<string, UiCommandHandler>>;
  /** Where a file that will not read is said (the console by default). */
  log?: (line: string) => void;
}

/** What `connectPersona` answers: the rows, the account list, the card's personas and the save file's module. */
export interface PersonaConnection {
  commands: PersonaCommands;
  db: AcctDb;
  card: PersonaCard | null;
  config: CardConfigFile;
  cardCommands: CardCommands;
  /** The session's start dialog (`--menu_state`): a deep link to the form runs `LobbyConnect`'s form half first. */
  entered(startDialog: string | null | undefined): void;
  /**
   * The MP name's run (`MP_NAME_MIGRATION_ADAPTATION`), settled when the session is made -- synchronously, so a deep link's
   * `entered`, called next in the same constructor (`frontEnd.ts`), finds the name in `ext`; null with no card or no settings.
   */
  migrated: MigrationResult | null;
}

/**
 * Whether a start dialog (`--menu_state`, a deep link) needs the universe list read before the session is made: SELECT
 * UNIVERSE itself (ONL-04) and the persona form, whose HOST is the list's first universe's. A browser adaptation of the
 * deep link; the original reaches both only through the DNAS screen's `GetServerList`.
 */
export function readsUniverseFirst(startDialog: string | null | undefined): boolean {
  const d = startDialog?.toLowerCase();
  return d === 'dlgnetserverselect.rdr' || d === PERSONA_DIALOG.toLowerCase();
}

/**
 * A card record as the account list holds it (`FUN_002fc280` D:L199187-199239): under SAVE PASSWORD: YES its length in
 * the stand-in (`SAVED_PASSWORD_STAND_IN_ADAPTATION`), where the original's load reads the password; under NO, or a
 * length of 0, none (D:L199263: the original writes no PASSWORD then).
 */
export function acctFromRecord(r: PersonaRecord): AcctRecord {
  const password = r.SAVEPASSWORD !== 0 ? savedPasswordStandIn(r.PASSWORD.length) : '';
  return { host: r.HOST, port: r.PORT, name: r.NAME, password, hometown: r.TOWN, gender: r.GENDER, savePassword: r.SAVEPASSWORD };
}

/**
 * An account record as the card takes it (`FUN_002fc440` D:L199263-199266): the form's fields, SAVEPASSWORD, and under
 * YES the password -- typed, or a saved one's stand-in -- whose length alone `personaFromLogin` keeps; under NO none.
 */
export function loginFromAcct(r: AcctRecord): PersonaLogin {
  const save = r.savePassword !== 0;
  return { host: r.host, port: r.port, name: r.name, town: r.hometown, gender: r.gender, savePassword: save, password: save ? r.password : null };
}

/**
 * The page's account list (`CAcctDB` at 0x44fc60): `@s2u/ui`'s, whose `forgetPasswords` -- what
 * `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION` calls when the login is answered or its screen left -- lets every typed
 * password go and keeps a saved one: a stand-in stays (it is no secret, and the original's list keeps its password for
 * the session, R153.2). A password typed under SAVE PASSWORD: YES becomes a stand-in only when its login succeeds
 * (`savedAtSuccess`, which `./connectHost` `connectLobby` calls at the answer, before this): refused, it is let go like
 * any typed password, so a wrong one is never sent on as the remember cookie (the review's F1). (OT.R61, SAVE-PASSWORD:
 * the adaptation narrowed to typed passwords.)
 */
export class PageAcctDb extends AcctDb {
  override forgetPasswords(): void {
    this.replace(this.records().map((r) => ({ ...r, password: isSavedPasswordStandIn(r.password) ? r.password : '' })));
  }
}

/**
 * A login that succeeded (SAVE-PASSWORD; the review's F1): the record of the lobby's HOST and PORT (`at`, the lobby's
 * `connectedTo()`) and that NAME, saved under SAVE PASSWORD: YES with a typed password, becomes the stand-in of its
 * length -- the secret the server's remember cookie now stands for, which the next CONNECT sends in its place. Called
 * only on Success, before the answer lets the typed password go. The record is found as the account list finds it
 * (`AcctDb.update`, `FUN_002fbce0` D:L199058-199066: HOST and NAME as `AcctDb` compares them, with case, and PORT), so a
 * row of the same name on another universe keeps its typed password, let go at the answer like any other
 * (SAVED-AT-SUCCESS-HOST, LATER 101; product track, the cookie transport's adaptation, OT.R27). With no address
 * (`at` null) nothing is converted: unreachable at a Success today, since a reply is handled only while the lobby is
 * up and every `connect` sets its address (`@s2u/ui` `LobbyClient.ask`, `connect`). *Was, until 2026-10-18: every
 * record of that NAME, whatever its HOST and PORT.*
 */
export function savedAtSuccess(db: AcctDb, at: { host: string; port: number } | null, name: string): void {
  if (at === null) return;
  db.replace(db.records().map((r) => (r.host === at.host && r.port === at.port && r.name === name
    && r.savePassword !== 0 && r.password !== '' && !isSavedPasswordStandIn(r.password)
    ? { ...r, password: savedPasswordStandIn(Array.from(r.password).length) } : r)));
}

/**
 * LATER 332 (research 365 §0.3): a saved record's stand-in handed to the registration and refused
 * (`SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION` -- the server holds no account for it, or the login would not have
 * answered -998): the record of that HOST, PORT and NAME lets its stand-in go, so the form's next prefill brings back no
 * password that cannot sign in or register. Its SAVE PASSWORD stays; a password typed and logged in with becomes the
 * new stand-in (`savedAtSuccess`). Found as `savedAtSuccess` finds it; with no address, nothing.
 */
export function standInRefused(db: AcctDb, at: { host: string; port: number } | null, name: string): void {
  if (at === null) return;
  db.replace(db.records().map((r) => (r.host === at.host && r.port === at.port && r.name === name && isSavedPasswordStandIn(r.password)
    ? { ...r, password: '' } : r)));
}

/**
 * The card's `CUIVarManager` module read back into the session's variables (web research 301 §6): each at longevity 3
 * (`restoreUiVarModule`), so `dlgNetLogin`'s ONSTART defaults (HudCLOC 60757-60766, added at 3) leave a saved value as
 * it is. A module of another shape is said and leaves the defaults; nothing it holds throws out of here (the session's
 * constructor calls it: the review's finding 2). Run at the session's start, before its first dialog (`frontEnd.ts`),
 * and at each `LoadConfig`.
 */
export function restoreCardUiVars(card: Pick<PersonaCard, 'part'> | null, vars: UiVarManager, log: (line: string) => void = (l) => console.warn(l)): boolean {
  let ok = false;
  try { ok = restoreUiVarModule(vars, card?.part(UI_VAR_MODULE)); } catch { ok = false; }   // never stops the session
  if (!ok) log(`[card] the save file's ${UI_VAR_MODULE} module could not be read: the UI variables keep their defaults`);
  return ok;
}

/** The rows made and registered in `host`, the account list read from the card, and the save file's persona module. */
export function connectPersona(host: UiCommandHost, o: PersonaHostOptions): PersonaConnection {
  const log = o.log ?? ((line: string) => console.warn(line));
  const db = new PageAcctDb();
  // PERSONA_LOAD_ADAPTATION: slot 1's file; with none there (Open's NoEntry), slot 2's when it holds one.
  let card = o.libmc ? new PersonaCard(o.libmc, 0) : null;
  let cardSlot: 1 | 2 = 1;
  let loaded = card?.load();
  if (o.libmc && loaded && loaded.result < 0) {
    const second = new PersonaCard(o.libmc, 1);
    const read = second.load();
    if (read.result >= 0) { card = second; loaded = read; cardSlot = 2; }
  }
  /** The card's personas into the account list; a file that did not parse is said and discarded (`PERSONA_MALFORMED_DISCARD_ADAPTATION`). */
  const adopt = (malformed: string | undefined): void => {
    if (malformed !== undefined) {
      log(`[persona] the save file's personas could not be read (${malformed}): none are listed, and the next save writes the list as it stands`);
      card?.discardMalformed();
    }
    db.replace((card?.personas() ?? []).map(acctFromRecord));
  };
  if (card) adopt(loaded?.malformed);
  // MP_NAME_MIGRATION_ADAPTATION: the old MP name read once into the loaded slot's ext; the form takes it (`seedName`).
  const slots = o.slots === undefined ? pageCard : o.slots;
  const legacy = o.legacy === undefined ? pageSettings : o.legacy;
  const ext = card && slots ? new CardExtStore(slots.slot(cardSlot)) : null;
  // Synchronous (`CardExtStore` is, as the slots are): FrontEndSession's constructor calls `entered` straight after this, nothing awaited.
  const migrated: MigrationResult | null = ext && legacy ? migrateOnceSync(legacy, ext, mpNameMigration(db.records().length > 0)) : null;
  /** The imported name taken at the form's entry for HOST and PORT: appended as `UpdateAcctInfo` appends a record when the list holds none. */
  const seedName = (host: string, port: number): void => {
    const held = ext?.peek(MP_NAME_IMPORTED);
    if (!ext || !held) return;
    try { ext.apply([{ delete: MP_NAME_IMPORTED }]); } catch { return; }   // not taken: the next entry tries again
    if (db.records().length === 0) db.update(host, port, new TextDecoder().decode(held), null, null, 0, 0);
  };
  /**
   * The card's UI variables (web research 301 §6): `CUIVarManager_Serialize`'s list (`serializeUiVars`: the persistent
   * ones, `MPTAUNTMSG1-5` and `MPLOCALSOP1-5` among them) as the save file's `CUIVarManager` module, beside `CAcctDB`.
   */
  const saveUiVars = (): void => { card?.setPart(UI_VAR_MODULE, uiVarModule(serializeUiVars(o.uiVars, o.machine().valves))); };
  /** The persistent valves (`CValveSaveManager_Serialize`, 04 O15): the module as read, every PERSIST valve over it (research 302 §4). */
  const saveValves = (): void => { card?.setPart(VALVE_MODULE, valveModule(o.machine().valves, card.part(VALVE_MODULE))); };
  const config: CardConfigFile = {
    contents: () => {
      if (!card) return { ...CONFIG_FILE_PLACEHOLDER };
      card.setLogins(db.records().map(loginFromAcct));
      saveUiVars();
      saveValves();
      return card.contents();
    },
    restore: (data) => {
      if (!card) return true;
      const ok = card.restore(data);
      adopt(ok ? undefined : 'the file LoadConfig read is not the persona module\'s shape');
      restoreCardUiVars(card, o.uiVars, log);
      // `CValveSaveManager_UnSerialize` (FUN_00352960): every entry back at PERSIST (research 229 §1); `load_initial_config`'s StoreOptions applies them.
      if (!restoreValveModule(o.machine().valves, card.part(VALVE_MODULE))) log(`[card] the save file's ${VALVE_MODULE} module could not be read: the options keep their values`);
      return ok;
    },
  };
  const event = (kind: number): void => { o.machine().shell()?.event(kind); };
  const cardCommands = new CardCommands({ valves: () => o.machine().valves, uiVars: o.uiVars, card: o.libmc ?? undefined, io: () => o.menu.cardIo(), event, config });
  // OPT-05i's five rows on the page (research 143 §5's owed call) and MENU-01a's seven, real on the form (PERSONA_FORM_CARD_ROWS_ADAPTATION).
  const real: Readonly<Record<string, UiCommandHandler>> = { ...o.menu.entries(), ...cardCommands.entries() };
  const dialog = (): string => o.machine().shell()?.currentName.toLowerCase() ?? '';
  const onForm = (name: string): boolean => dialog() === PERSONA_DIALOG.toLowerCase()
    || (name !== 'MC_Changed' && (dialog() === ONLINE_OPTIONS_DIALOG.toLowerCase() || dialog() === OPTIONS_DIALOG.toLowerCase()));
  /**
   * What answers a card row outside the form when the page hands its stubs in: the stub; for a row no stub answers
   * (IsMemcardSaveOK, SaveConfig, MC_CreateIconFiles), the table's own answer -- the row's cited constant, else
   * PLAT-08's placeholder -- which is what the dispatcher answered before this call registered a body.
   */
  const outsideOf = (name: string): UiCommandHandler => {
    const stub = o.standing?.[name];
    if (stub) return stub;
    const answer = uiCommandRowByName(name)?.answer ?? UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER;
    return () => answer;
  };
  for (const name of PERSONA_FORM_CARD_ROWS) {
    const row = real[name]!;
    if (!o.standing) { host.setHandler(name, row); continue; }
    const outside = outsideOf(name);
    host.setHandler(name, (cmd, r, time) => (onForm(name) ? row(cmd, r, time) : outside(cmd, r, time)));
  }
  const commands = new PersonaCommands({
    valves: () => o.machine().valves, uiVars: o.uiVars, db, universes: o.universes, lobby: o.lobby, event,
    inputString: (cmd: ZAnimUiCommand) => o.machine().shell()?.inputString(cmd.anim) ?? null,
    name: (cmd, i) => o.parts.current?.name(cmd, i) ?? null,
  });
  commands.register(host);
  // MP_NAME_MIGRATION_ADAPTATION: LobbyConnect's form half for a universe it accepts (its own test, D:L122454-122545) takes the imported name first.
  host.setHandler('LobbyConnect', (cmd, r, time) => {
    if (!(o.lobby?.lanUp?.() ?? false)) {
      const arg = cmd.arg === INPUT_STRING ? o.machine().shell()?.inputString(cmd.anim) ?? null : cmd.arg === '' ? null : cmd.arg;   // PersonaCommands' own argument (FUN_0026ed60)
      const u = o.universes.find(arg ?? '');
      if (u && u.universeStatus !== 0) seedName(u.dns, u.port);
    }
    return commands.LobbyConnect(cmd, r, time);
  });
  const entered = (startDialog: string | null | undefined): void => {
    if (startDialog?.toLowerCase() !== PERSONA_DIALOG.toLowerCase()) return;
    const first = o.universes.count > 0 ? o.universes.find(o.universes.name(0)) : null;
    if (!first) { log('[persona] no universe was read: the form has no HOST to list personas under'); return; }
    seedName(first.dns, first.port);
    commands.enterForm(first.dns, first.port);
    o.lobby?.connect?.(first.dns, first.port);                       // ONL-07: LobbyConnect's other half, so that CONNECT can log in from a deep link (research 157 §5)
  };
  return { commands, db, card, config, cardCommands, entered, migrated };
}
