import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { uiCommandFold } from '../uiCommands';
import type { UiVarManager } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { INPUT_STRING } from './screenCommands';

/**
 * The rows `dlgMenu.rdr` and the online entry (`dlgMPswitch.rdr`) dispatch that no earlier task implements (MENU-01a,
 * the online path's slice of MENU-01; web research 138): the main menu's ONSTART (CleanupMissionMemory,
 * GetNumSavedGames, MC_Changed and `Ensure_MC_Dirs_Fast`'s MC_Exists / MC_ChDir), NEW GAME's ClearCareerStats, the
 * card rows the LOAD GAME and card-change scripts run (MC_ChPort, MC_MkDir, IsMemCardInserted, IsMemCardFormatted),
 * the UI-variable rows ClearUIVar and TestUIVar, and RebootIOP. PLAT-08's `UiCommandHost` is a registry each module
 * fills (`setHandler`, W9.R4): `register` binds these thirteen rows and the table itself is not edited. What the two
 * dialogs name that an earlier task answers, or that stays declared for its own task, is `MENU_ENTRY_COMMANDS`.
 *
 * Every argument is the command's `names[+8]` (`FUN_0026ed60`); RebootIOP alone replaces `INPUT_STRING` by the running
 * animation's first string input (`FUN_00272480(ctx+0x18, 0)`, D:L122999-123002). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`.
 *
 * The card rows go through `CMemCardIO` (the object at 0x436460, the class name at 0x3fbc20; PLAT-26a's research 134
 * §1) over libmc: `MenuCardIo` is the four calls these bodies make, in the shape PLAT-26a's `Libmc` already has, so the
 * page hands it in as it is. A libmc failure (`sceMc*` returning below 0, or a result the body refuses) posts
 * `MEMCARD_ERROR` into the dialog host (`FUN_001f3bf0(0x408538, "MEMCARD_ERROR", 0)`, the string at 0x3fbc78; the
 * named-event walk D:L54424-54705 maps it to `DIALOG_EVENTS.MEMCARD_ERROR`), which `dlgMenu` binds to
 * `handle_memcard_error` (`memcard_error` = 1).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const MENU_COMMAND_ROWS = [
  { row: 57, id: 55, name: 'IsMemCardInserted', fn: 0x27e1b0 },
  { row: 58, id: 56, name: 'IsMemCardFormatted', fn: 0x27e1a0 },
  { row: 67, id: 65, name: 'MC_ChDir', fn: 0x27b300 },
  { row: 68, id: 66, name: 'MC_ChPort', fn: 0x27b260 },
  { row: 70, id: 68, name: 'MC_Exists', fn: 0x27b1c0 },
  { row: 71, id: 69, name: 'MC_MkDir', fn: 0x27b2c0 },
  { row: 89, id: 93, name: 'GetNumSavedGames', fn: 0x27dea0 },
  { row: 93, id: 95, name: 'TestUIVar', fn: 0x278200 },
  { row: 119, id: 121, name: 'RebootIOP', fn: 0x2777f0 },
  { row: 140, id: 141, name: 'MC_Changed', fn: 0x27b340 },
  { row: 143, id: 144, name: 'ClearUIVar', fn: 0x2780a0 },
  { row: 145, id: 146, name: 'CleanupMissionMemory', fn: 0x281bc0 },
  { row: 189, id: 191, name: 'ClearCareerStats', fn: 0x27aa30 },
] as const;
export type MenuCommandName = (typeof MENU_COMMAND_ROWS)[number]['name'];

/**
 * Every bound function `dlgMenu.rdr` and `dlgMPswitch.rdr` name -- their layouts' bindings, their own sets and the
 * library animations those reach (`UIanim.rdr`, `UIMemCardAnim.rdr`), read with ONL-33's chapter reader
 * (`tools/dump-online-dialogs.ts --dialog`) and pinned in `tools/test/menuEntryCommands.pinned.json` -- each answered
 * by a task: `here` (this module), `earlier` (the module of the task named, registered in PLAT-08's host before this
 * one) or `declared` (the table's owner, with why the row is not on this task's path: the main menu's items beyond
 * ONLINE stop at the desktop-recompilation screen, OT.R5, and the card's screens and the campaign stay MENU-01's and
 * their own tasks'). `spelt` is how the scripts spell the name where it differs (the dispatcher folds case,
 * `uiCommandKey`). `tools/test/menuEntryCommands.test.ts` holds this list to the pin: a name the dialogs use that is
 * not here fails it, so none is silently ignored.
 */
export interface MenuEntryCommand {
  name: string;
  status: 'here' | 'earlier' | 'declared';
  task: string;
  spelt: readonly string[];
  /** For `declared`: why the row is not implemented by this task. */
  why?: string;
}

const earlier = (name: string, task: string, ...spelt: string[]): MenuEntryCommand => ({ name, status: 'earlier', task, spelt });
const here = (name: string, ...spelt: string[]): MenuEntryCommand => ({ name, status: 'here', task: 'MENU-01a', spelt });
const declared = (name: string, task: string, why: string, ...spelt: string[]): MenuEntryCommand => ({ name, status: 'declared', task, spelt, why });

const LOAD_GAME = 'the LOAD GAME list and the campaign (MENU-03 / OT.R5: the item stops at the desktop-recompilation screen)';
const CARD_SCREENS = 'the card\'s boot chain (`intro_onstart` -> `load_initial_config`), reached from dlgMenu only after a card change answered YES (`has_memcard_changed`)';

export const MENU_ENTRY_COMMANDS: readonly MenuEntryCommand[] = [
  // PLAT-10's screen rows.
  earlier('SwitchMenu', 'PLAT-10', 'SWITCHMENU'),
  earlier('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'),
  earlier('KillPopUp', 'PLAT-10', 'KillPopup', 'KILLPOPUP'),
  earlier('ActivateButton', 'PLAT-10'),
  earlier('EnableButton', 'PLAT-10'),
  earlier('DisableButton', 'PLAT-10'),
  earlier('FlushMenuHistory', 'PLAT-10'),
  // PLAT-11, PLAT-17, PLAT-21, PLAT-23.
  earlier('SuspendMenuInput', 'PLAT-11'),
  earlier('GetTextInput', 'PLAT-17'),
  earlier('BackgroundMPEG', 'PLAT-21'),
  earlier('VagStreaming', 'PLAT-23'),
  earlier('FadeAllSounds', 'PLAT-23'),
  // This module.
  here('CleanupMissionMemory'),
  here('ClearCareerStats'),
  here('RebootIOP'),
  here('ClearUIVar'),
  here('TestUIVar'),
  here('GetNumSavedGames'),
  here('MC_Changed'),
  here('MC_ChPort'),
  here('MC_Exists'),
  here('MC_ChDir'),
  here('MC_MkDir'),
  here('IsMemCardInserted', 'IsMemcardInserted'),
  here('IsMemCardFormatted'),
  // Declared for their own tasks: off this task's path.
  declared('SetMission', 'ONL-13', `${LOAD_GAME}; also the debug \`MissionShortcutSKB\`, bound to nothing`, 'SETMISSION'),
  declared('LoadSavedGame', 'MENU-13', LOAD_GAME),
  declared('DoesSlotHaveGame', 'OPT-05a', LOAD_GAME),
  declared('IsMemcardSaveOK', 'OPT-05a', `${LOAD_GAME}; its body has no decompiled block (research 107 §5, unread)`),
  declared('AutoAim', 'OPT-13', `${LOAD_GAME} (\`GoToNextMission\`)`),
  declared('IsSpaceForSaveGameFile', 'OPT-05a', CARD_SCREENS),
  declared('FormatMemCard', 'OPT-05a', CARD_SCREENS),
  declared('LoadConfig', 'OPT-05a', CARD_SCREENS),
  declared('SaveConfig', 'OPT-05a', CARD_SCREENS),
  declared('ListSavedGames', 'MENU-13', CARD_SCREENS),
  declared('MC_CreateIconFiles', 'OPT-05a', CARD_SCREENS),
  declared('StoreOptions', 'MENU-01', CARD_SCREENS),
  declared('CheckVideoMode', 'MENU-01', CARD_SCREENS),
  declared('SwitchProgressiveVideo', 'MENU-01', CARD_SCREENS),
];

/** The literal the save count compares each header text with (the string at 0x3eef00): a filler save, not counted. */
export const SAVE_HEADER_DUMMY_TEXT = 'This game is a dummy game.';
/** `SaveGame%d` (0x3eeef0) for 0..9 (D:L126317-126330). */
export const SAVE_GAME_SLOTS = 10;
/** The career stats record at 0x437e30: the 13 words `FUN_002a3e20` zeroes (D:L147533-147550). */
export const CAREER_STATS_WORDS = 13;
/** The valve `MC_Changed` writes the polled port into (the string at 0x3eef30; D:L124912). */
export const MC_CHANGED_SLOT_VALVE = 'mc_changed_slot';
/**
 * `RebootIOP`'s module sets (`FUN_002777f0` D:L123003-123027, the strings at 0x3eeb60..0x3eeb90 compared with
 * `FUN_00198b80`, case-insensitive); anything else is 2 (D:L122998).
 */
export const IOP_MODULE_SET = { Singleplayer: 2, Multiplayer: 3, NetConfig: 4, MainMenu: 5 } as const;
export type IopModuleSet = (typeof IOP_MODULE_SET)[keyof typeof IOP_MODULE_SET];

/**
 * MISSION_MEMORY_PLACEHOLDER: `CleanupMissionMemory` sweeps the mission allocator (`FUN_0053df50` D:L406836-406846:
 * every block of the list at 0x44cd50 whose byte +0x300 is set is released). The front end holds no mission memory --
 * the campaign is out of scope -- so there is nothing to release; the sweep is a hook the page may fill. [placeholder]
 */
export const MISSION_MEMORY_PLACEHOLDER = 'nothing to release' as const;
/**
 * IOP_REBOOT_PLACEHOLDER: `RebootIOP` hands the set to the IOP module manager (`FUN_0034f9b0(0x49e2a0, set)`
 * D:L249489-249700: a set equal to the current one is a no-op, else the IOP is reset and the set's modules loaded).
 * The browser has no IOP; the set is handed to a hook the page may fill and otherwise nothing happens. What the
 * reboot does to the streams and the pad is PLAT-22's and ONL-01's to settle. [placeholder]
 */
export const IOP_REBOOT_PLACEHOLDER = 'no IOP' as const;
/**
 * SAVE_HEADER_TEXT_PLACEHOLDER: `GetNumSavedGames` reads 0x10c bytes of a save's `zSaveHeader` (`FUN_0033d4a0`
 * D:L238832-238874) and takes the text at +12 (D:L126326: the 260 bytes after a 12-byte head). The reader of a save
 * file is MENU-13's; without `MenuCardIo.saveHeaderText` a save that exists is not counted (the original's buffer
 * would hold what the stack held). [placeholder]
 */
export const SAVE_HEADER_TEXT_PLACEHOLDER = null;
/**
 * MC_CHANGED_SLOT_UNWRITTEN_READING: `MC_Changed` acquires the valve PERM on every tick (D:L124914) and compares it
 * with a stack word the probe writes only when a poll completes (D:L124911-124922: `uStack_4` is written at
 * D:L295856 / D:L295870 alone); on the other ticks the original compares and stores garbage. Reading: the valve exists
 * from the first tick (made at 0) and its value is left as it is on those ticks. [reading]
 */
export const MC_CHANGED_SLOT_UNWRITTEN_READING = 'left as it is' as const;
/**
 * MC_ISSUE_FAILURE_READING: each `CMemCardIO` method posts `MEMCARD_ERROR` and answers at once when `sceMc*` refuses to
 * take the command (a negative return before `sceMcSync`, e.g. D:L295457-295459). PLAT-26a's libmc, like the
 * recompilation's stub, always takes a command and answers through its result, so that branch is not reached here;
 * the result's own refusals are. [reading]
 */
export const MC_ISSUE_FAILURE_READING = 'never: the stub always takes a command' as const;

/**
 * `CMemCardIO` as these rows call it, over libmc on the object's port (+0x20) and slot (+0x24): GetInfo (`sceMcGetInfo`
 * + Sync's result, type and format), GetDir (one entry: the result is the count), Chdir, Mkdir -- the shape of
 * PLAT-26a's `Libmc`, which the page passes as it is -- and the save header's text (MENU-13's reader; optional).
 */
export interface MenuCardIo {
  getInfo(port: number, slot: number): { result: number; type: number; format: number };
  getDir(port: number, slot: number, path: string, maxEntries: number): { result: number };
  chdir(port: number, slot: number, path: string): { result: number };
  mkdir(port: number, slot: number, path: string): number;
  /** The text at +12 of the save's `zSaveHeader` at `path` on the port, or null when it cannot be read. */
  saveHeaderText?(port: number, slot: number, path: string): string | null;
}

/** GetInfo's answer for a port libmc has no card in (the stub's `isMcCardPresent` false: NoEntry, type 0). */
const NO_CARD = { result: -4, type: 0, format: 0 } as const;
/** No card service at all: every answer is libmc's for an empty port (no stand-in value of this module's own). */
const EMPTY_CARD: MenuCardIo = {
  getInfo: () => NO_CARD, getDir: () => ({ result: -4 }), chdir: () => ({ result: -4 }), mkdir: () => -4,
};

export interface MenuCommandsOptions {
  /** The valve registry (0x49e800; the machine's, made new at each boot). */
  valves: () => ValveStore;
  /** The UI variable manager (0x437e80). */
  uiVars: UiVarManager;
  /** `INPUT_STRING`'s replacement for the command's running animation (RebootIOP); null when it has none. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** `FUN_001f3bf0(0x408538, name, 0)`: a named event into the dialog host (`MEMCARD_ERROR`). */
  event?: (kind: number) => void;
  /** `CMemCardIO` over libmc (PLAT-26a's `Libmc`); absent: every port empty. */
  card?: MenuCardIo;
  /** `FUN_0034f9b0(0x49e2a0, set)`: the IOP module manager's reboot (`IOP_REBOOT_PLACEHOLDER`). */
  iop?: (set: IopModuleSet) => void;
  /** `FUN_0053df50`: the mission allocator's sweep (`MISSION_MEMORY_PLACEHOLDER`). */
  missionMemory?: () => void;
}

/** `atoi` (`FUN_00191490` -> `strtol(s, 0, 10)`, D:L9969-9977): a leading integer, else 0. */
export function atoi(s: string): number {
  const m = /^\s*([+-]?\d+)/.exec(s);
  return m ? Number(m[1]) | 0 : 0;
}

export class MenuCommands {
  /** The career stats record (0x437e30): 13 words. */
  readonly careerStats: number[] = new Array<number>(CAREER_STATS_WORDS).fill(0);
  /**
   * `CMemCardIO`'s port (+0x20, `DAT_00436480`) and slot (+0x24, `DAT_00436484`), and their copies at +8 / +0xc
   * (`DAT_00436468`, `DAT_0043646c`), which MC_ChPort / MC_ChSlot refresh (D:L124869-124870). All four start at 0:
   * the object is in a segment's zero-filled tail (0x436460 is in no PT_LOAD file image).
   */
  private port = 0;
  private slot = 0;
  private portInUse = 0;
  private slotInUse = 0;
  /**
   * The change probe's state (`FUN_003a1370`, D:L295834-295884): the port it polls next (`DAT_004a37e8`, toggled at
   * each completed poll) and the poll in flight (the stub answers a command at once and keeps its result for one
   * `sceMcSync`, PLAT-26a: so a poll issued on one tick is read on the next). libmc holds one command: every other
   * `CMemCardIO` method opens with a blocking `sceMcSync(0, ..)` into discard words (`FUN_001b4390(0, 0x4a37c0,
   * 0x4a37c8)`, D:L295455, D:L295482, D:L295510, D:L295900, D:L295935), which consumes a poll in flight; the next tick's
   * `sceMcSync(1)` then answers -1 and the poll is re-issued on the same port (D:L295874-295876) -- `drain()`.
   */
  private pollPort = 0;
  private pending: { port: number; info: { result: number; type: number } } | null = null;

  constructor(private readonly o: MenuCommandsOptions) {}

  /** The object's port and slot words, for the tests. */
  cardState(): { port: number; slot: number; portInUse: number; slotInUse: number } {
    return { port: this.port, slot: this.slot, portInUse: this.portInUse, slotInUse: this.slotInUse };
  }

  /**
   * The object's port (+0x20) and slot (+0x24) for a `CMemCardIO` method another module's row calls (OPT-05i's
   * `CardCommands`): the method's opening `sceMcSync(0, discard, discard)` (`FUN_001b4390(0, 0x4a37c0, 0x4a37c8)`) is
   * done here, so a poll in flight is consumed as every other method consumes it (R138.5).
   */
  cardIo(): { port: number; slot: number } { this.pending = null; return { port: this.port, slot: this.slot }; }

  private card(): MenuCardIo { return this.o.card ?? EMPTY_CARD; }
  /** The method's opening `sceMcSync(0, discard, discard)`: a poll in flight is consumed and its result lost. */
  private drain(): MenuCardIo { this.pending = null; return this.card(); }
  private memcardError(): void { this.o.event?.(DIALOG_EVENTS.MEMCARD_ERROR!); }
  private arg(cmd: ZAnimUiCommand): string { return cmd.arg; }

  /** `FUN_00281bc0` (D:L128136-128143): `FUN_0053df50()`, answer 1. */
  CleanupMissionMemory: UiCommandHandler = () => { this.o.missionMemory?.(); return true; };

  /** `FUN_0027aa30` (D:L124599-124606): `FUN_002a3e20(0x437e30)` zeroes the record's 13 words; answer 1. */
  ClearCareerStats: UiCommandHandler = () => { this.careerStats.fill(0); return true; };

  /**
   * `FUN_002777f0` (D:L122994-123032): the argument, `INPUT_STRING` replaced (D:L122999-123002), compared
   * case-insensitively with the four set names (D:L123003-123027), then `FUN_0034f9b0(0x49e2a0, set)`; answer 1.
   */
  RebootIOP: UiCommandHandler = (cmd) => {
    let a: string | null = this.arg(cmd);
    if (a === INPUT_STRING) a = this.o.inputString?.(cmd) ?? null;
    const f = uiCommandFold(a ?? '');
    let set: IopModuleSet = IOP_MODULE_SET.Singleplayer;
    for (const [name, n] of Object.entries(IOP_MODULE_SET) as [keyof typeof IOP_MODULE_SET, IopModuleSet][]) {
      if (uiCommandFold(name) === f) { set = n; break; }
    }
    this.o.iop?.(set);
    return true;
  };

  /**
   * `FUN_002780a0` (D:L123273-123321): the variable by name (`FUN_00385900`, case-insensitive); an int or a real not
   * already 0 is set to 0 and the items told (D:L123286-123303); a string is set to "" (`FUN_003862a0`, the string at
   * 0x3eead8, D:L123307); an array to an empty list (D:L123310-123314, `FUN_00386460`); no name or no var, nothing.
   * Answer 1. `UiVarManager.set` is the original's "the same value does nothing; another tells the items".
   */
  ClearUIVar: UiCommandHandler = (cmd) => {
    const name = this.arg(cmd);
    const v = name === '' ? undefined : this.o.uiVars.find(name);
    if (!v) return true;
    switch (v.value.type) {
      case 'int': this.o.uiVars.set(v, { type: 'int', value: 0 }); break;
      case 'real': this.o.uiVars.set(v, { type: 'real', value: 0 }); break;
      case 'string': this.o.uiVars.set(v, { type: 'string', value: '' }); break;
      case 'array': this.o.uiVars.set(v, { type: 'array', value: [] }); break;
      default: break;
    }
    return true;
  };

  /**
   * `FUN_00278200` (D:L123324-123365): the variable by name; an int != 0, a real != 0.0, a string present and not
   * empty, an array whose count (+2) is not 0; else -- no name, no var, a type-0 node -- 0.
   */
  TestUIVar: UiCommandHandler = (cmd) => {
    const name = this.arg(cmd);
    const v = name === '' ? undefined : this.o.uiVars.find(name);
    if (!v) return false;
    switch (v.value.type) {
      case 'int': return v.value.value !== 0;
      case 'real': return v.value.value !== 0;
      case 'string': return v.value.value !== '';
      case 'array': return v.value.value.length !== 0;
      default: return false;
    }
  };

  /**
   * `FUN_0027b260` (D:L124858-124874): `atoi` of the argument into the port when not negative (D:L124864-124867),
   * then the port and slot copied into +8 / +0xc (D:L124869-124870); answer 1.
   */
  MC_ChPort: UiCommandHandler = (cmd) => {
    const n = atoi(this.arg(cmd));
    if (n >= 0) this.port = n;
    this.slotInUse = this.slot;
    this.portInUse = this.port;
    return true;
  };

  /**
   * `FUN_0027b1c0` (D:L124826-124836) -> `FUN_003a0950` (D:L295499-295520): libmc drained (D:L295510), GetDir of the
   * path, one entry, on the object's port and slot; the answer is the result above 0 (the count). A refused issue would
   * post MEMCARD_ERROR (`MC_ISSUE_FAILURE_READING`).
   */
  MC_Exists: UiCommandHandler = (cmd) => this.drain().getDir(this.port, this.slot, this.arg(cmd), 1).result > 0;

  /**
   * `FUN_0027b300` (D:L124890-124900) -> `FUN_003a07d0` (D:L295445-295470): libmc drained (D:L295455), Chdir on the
   * object's port and slot; a non-zero result posts MEMCARD_ERROR (D:L295463-295465); the answer is the method's 1
   * (the command's `void` body leaves it in v0).
   */
  MC_ChDir: UiCommandHandler = (cmd) => {
    if (this.drain().chdir(this.port, this.slot, this.arg(cmd)).result !== 0) this.memcardError();
    return true;
  };

  /**
   * `FUN_0027b2c0` (D:L124877-124887) -> `FUN_003a0890` (D:L295472-295497): libmc drained (D:L295482), Mkdir; a result
   * that is neither 0 nor -4 (NoEntry, the console's answer for a folder already there: research 134 R134.5) posts
   * MEMCARD_ERROR (D:L295490-295492); the answer is the method's 1.
   */
  MC_MkDir: UiCommandHandler = (cmd) => {
    const r = this.drain().mkdir(this.port, this.slot, this.arg(cmd));
    if (r !== 0 && r !== -4) this.memcardError();
    return true;
  };

  /**
   * `FUN_003a1650` (D:L295921-295953; the row's `j` at 0x27e1b4): libmc drained (D:L295935), GetInfo on the object's
   * port and slot, up to twice (D:L295936-295951), inserted when the type is 2 (a PS2 card) and the result is above
   * -10 (D:L295944: `-10 < iStack_c`).
   */
  IsMemCardInserted: UiCommandHandler = () => {
    const card = this.drain();
    let inserted = false;
    for (let tries = 2; tries > 0; tries--) {
      const i = card.getInfo(this.port, this.slot);
      inserted = i.result > -10 && i.type === 2;
      if (inserted) break;
    }
    return inserted;
  };

  /**
   * `FUN_003a1580` (D:L295886-295918; the row's `j` at 0x27e1a4): libmc drained (D:L295900), GetInfo up to twice; the
   * format flag not 0 (D:L295909).
   */
  IsMemCardFormatted: UiCommandHandler = () => {
    const card = this.drain();
    let formatted = false;
    for (let tries = 2; tries > 0; tries--) {
      formatted = card.getInfo(this.port, this.slot).format !== 0;
      if (formatted) break;
    }
    return formatted;
  };

  /**
   * `FUN_0027dea0` (D:L126303-126343): the valve the argument names acquired TEMP (`FUN_00351ff0(name, 2)`,
   * D:L126316); for i in 0..9, `SaveGame%d` that exists (`FUN_003a0950`) and whose `zSaveHeader` text at +12 starts
   * with `m` and is not the dummy (D:L126321-126330) counts; the count written through the watchers when it differs
   * (D:L126332-126341, as `FUN_003519f0` would); answer 1.
   */
  GetNumSavedGames: UiCommandHandler = (cmd) => {
    const valves = this.o.valves();
    const name = this.arg(cmd);
    const valve = valves.acquire(name, VALVE_TYPE.TEMP);
    const card = this.drain();                       // each `FUN_003a0950` opens with the drain (D:L295510)
    let count = 0;
    for (let i = 0; i < SAVE_GAME_SLOTS; i++) {
      const path = `SaveGame${i}`;
      if (card.getDir(this.port, this.slot, path, 1).result <= 0) continue;
      const text = card.saveHeaderText?.(this.port, this.slot, path) ?? SAVE_HEADER_TEXT_PLACEHOLDER;
      if (text !== null && text.startsWith('m') && text !== SAVE_HEADER_DUMMY_TEXT) count++;
    }
    if (valve.value !== count) valves.set(valve.name, count, VALVE_TYPE.TEMP);
    return true;
  };

  /**
   * `FUN_0027b340` (D:L124903-124927) -> `FUN_003a1370(obj, 1, &slot)` (D:L295834-295884, the non-blocking mode):
   * with a poll in flight its answer is read -- changed when the result is -1 or -2 (ChangedCard, NoFormat) and the
   * type is 2 (D:L295864-295868: `result + 2U < 2`) -- the polled port written to `slot` and the poll port toggled
   * (D:L295869-295872); with none (`sceMcSync(1)` -1: nothing issued yet, or the poll drained by another method),
   * GetInfo is issued on the poll port and the answer is 0 (D:L295874-295879). Then the valve `mc_changed_slot` is
   * acquired PERM on every tick (D:L124914) and takes `slot` through the watchers when it differs (D:L124916-124925;
   * `MC_CHANGED_SLOT_UNWRITTEN_READING` when the probe wrote nothing). The answer is the probe's.
   */
  MC_Changed: UiCommandHandler = () => {
    let changed = false;
    let slot: number | null = null;
    const p = this.pending;
    if (p) {
      changed = (p.info.result === -1 || p.info.result === -2) && p.info.type === 2;
      slot = p.port;
      this.pollPort ^= 1;
      this.pending = null;
    } else {
      const port = this.pollPort;
      const info = this.card().getInfo(port, this.slot);
      this.pending = { port, info: { result: info.result, type: info.type } };
    }
    const valves = this.o.valves();
    const v = valves.acquire(MC_CHANGED_SLOT_VALVE, VALVE_TYPE.PERM);
    if (slot !== null && v.value !== slot) valves.set(v.name, slot, VALVE_TYPE.PERM);
    return changed;
  };

  /** The entries by their table name. */
  entries(): Record<MenuCommandName, UiCommandHandler> {
    return {
      IsMemCardInserted: this.IsMemCardInserted, IsMemCardFormatted: this.IsMemCardFormatted, MC_ChDir: this.MC_ChDir,
      MC_ChPort: this.MC_ChPort, MC_Exists: this.MC_Exists, MC_MkDir: this.MC_MkDir, GetNumSavedGames: this.GetNumSavedGames,
      TestUIVar: this.TestUIVar, RebootIOP: this.RebootIOP, MC_Changed: this.MC_Changed, ClearUIVar: this.ClearUIVar,
      CleanupMissionMemory: this.CleanupMissionMemory, ClearCareerStats: this.ClearCareerStats,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
