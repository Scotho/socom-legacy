import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The boot's card and hardware bindings, stubbed (BOOT-04; web research 139 §3): the rows of the table at 0x3dd4d0
 * that `dlgIntroScreen`'s ONSTART chain calls -- `do_onstart` -> `intro_onstart` -> `load_initial_config` ->
 * `find_a_memcard`, `DisplayLoadingWarning`, `Ensure_MC_Dirs_Fast` (research 96 §3.2; the ops decoded in research 139
 * §2) -- plus the two `dlgMenu`'s ONSTART polls on arrival (`has_memcard_changed`'s `MC_Changed`, `SetMenuValve`'s
 * `Ensure_MC_Dirs_Fast`), each answering what the original's body answers for **one fixed state**: the f0 card in slot
 * 1 (inserted, formatted, holding the options save and its seven saves: `desktop@be557831:docs/KNOWN.md:72`, the
 * card-folder rule, the folder `logs/parity/f0/mc0/BASCUS-97275SOCOMII/`), no card in slot 2, a controller connected,
 * no hard disk, NTSC. Every answer cites the body it stands for; none reads a card, a pad or the hardware.
 *
 * These are stubs by the block's own words ("stubbed here with cited returns"): BOOT-05 replaces the card rows with
 * PLAT-26's libmc over PLAT-25's slots (`BOOT_CARD_STUB_PLACEHOLDER`), BOOT-09 the controller, HDD and video-mode rows
 * (`BOOT_HARDWARE_STUB_PLACEHOLDER`); `StoreOptions` and `ListSavedGames` are OPT-02's and MENU-13's. The rows this
 * module does not register keep PLAT-08's table answers (`VagStreaming` 1, `KillPopUp` and the menu rows PLAT-10's).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The save folder (`BASCUS-97275SOCOMII`, the string LoadConfig is called with: research 96 §3.2; KNOWN L72). */
export const SAVE_FOLDER = 'BASCUS-97275SOCOMII';

/**
 * The f0 card's folder as the desktop's run left it (`logs/parity/f0/mc0/BASCUS-97275SOCOMII/`, names and sizes:
 * web research 99 §7.2, "The options save"): the options save, the icon, the patch and scratch fillers, seven saves.
 * Decoded data (RS.R8). The stub's `MC_Exists` answers from these names.
 */
export const F0_CARD_FILES: Readonly<Record<string, number>> = {
  'BASCUS-97275SOCOMII': 4784, 'icon.sys': 964, 'LIST.ICO': 50234, 'PATCHFILE.DAT': 2048000,
  SaveGame0: 1952, SaveGame1: 1952, SaveGame2: 1952, SaveGame3: 1952, SaveGame4: 1952, SaveGame5: 1952, SaveGame6: 1952,
  'SCRATCHPAD.DAT': 944128,
};

/**
 * The f0 card's free space in KB as `IsSpaceForSaveGameFile` reads it (`FUN_003a1210`): 8000 less the folder's 2,993
 * clusters (web research 99 §7.2's count: 2,992 for the files, one for the folder) -- 5,007.
 */
export const F0_CARD_FREE_KB = 8000 - 2993;

/**
 * The persistent valves the f0 card's `PersistentValves.rdr` carries that the boot chain tests, with their values as
 * the file holds them (decoded 2026-10-02 from `logs/parity/f0/mc0/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII` through the
 * desktop's `tools_py/card_save.py` `unscramble` + `parse_zar` and the repository's `parseRdr`: `NAME video_mode VAL 0`,
 * `NAME HDD_ENABLE VAL 0`; decoded data, RS.R8). `load_initial_config` tests `video_mode == 1` after `LoadConfig` and
 * `do_onstart` tests `HDD_ENABLE == 1` after `intro_onstart` (research 139 §2): both 0, neither branch is taken.
 */
export const F0_CARD_BOOT_VALVES: readonly { name: string; value: number }[] = [
  { name: 'video_mode', value: 0 },
  { name: 'HDD_ENABLE', value: 0 },
];

/**
 * LOAD_CONFIG_VALVES_PLACEHOLDER: what `LoadConfig` (`FUN_0027b0e0` D:L124789-124813 -> `CSaveManager_Load`
 * `FUN_003a1730`) restores -- the 65 persistent valves of `PersistentValves.rdr` (02-boot O15), the UI variables and
 * the account records. The stub writes the two the boot chain reads (`F0_CARD_BOOT_VALVES`) and nothing else: the
 * card's own read is BOOT-05's and OPT-02's (the card's contents in localStorage, R7). [placeholder]
 */
export const LOAD_CONFIG_VALVES_PLACEHOLDER = 'video_mode and HDD_ENABLE only' as const;

/**
 * BOOT_CARD_STUB_PLACEHOLDER: the card rows -- `IsMemCardInserted`, `IsMemCardFormatted`, `MC_ChPort`, `MC_ChSlot`,
 * `MC_Exists`, `MC_ChDir`, `MC_MkDir`, `LoadConfig`, `ListSavedGames`, `IsSpaceForSaveGameFile`, `MC_Changed` --
 * answer for the f0 card in slot 1 and nothing in slot 2, from a table, not from a card: the simulated card
 * (PLAT-25's slots, PLAT-26's libmc) is not behind them. BOOT-05 replaces every one of them. [placeholder]
 */
export const BOOT_CARD_STUB_PLACEHOLDER = 'f0 card in slot 1, slot 2 empty' as const;

/**
 * BOOT_HARDWARE_STUB_PLACEHOLDER: `IsControllerConnected` answers connected, `HardDriveOperation OPEN` no hard disk,
 * `CheckVideoMode` NTSC and `SwitchProgressiveVideo` nothing, with no pad, HDD or display behind them. BOOT-09
 * replaces them (PLAT-28's screen where the original offers the branch). [placeholder]
 */
export const BOOT_HARDWARE_STUB_PLACEHOLDER = 'connected, no HDD, NTSC' as const;

/**
 * HDD_ABSENT_STATUS_READING: what `FUN_0039d050` (D:L293424-293506), the HDD open `HardDriveOperation OPEN` makes,
 * answers with no hard disk. Read: 1 when `DAT_0049e2dc` is set (the branch that mounts nothing), 0 when the partition
 * mounts, 2 when the mount fails; `HardDriveOperation` then writes `hard_disk_error_code` with 1, 2 or 3 as the status,
 * 5 for any other, and answers 0 (D:L123596-123621). Which of the two non-zero statuses a console without an HDD gives
 * was not traced (`DAT_0049e2dc`'s writer not read): 1 is the reading, BOOT-09's to settle. [reading]
 */
export const HDD_ABSENT_STATUS_READING = 1;

/** The video mode `CheckVideoMode` compares against (`DAT_004a44f5`; `SwitchProgressiveVideo` writes `DAT_004a44f4`): 0 NTSC, 2 DTV (O7). */
export const VIDEO_MODE = { NTSC: 0, DTV: 2 } as const;

/** The literal the commands replace (the string at 0x3ee898); BOOT's rows take the argument as written. */
const INPUT_STRING = 'INPUT_STRING';

/** The rows this module fills, by the table's own spelling (held to PLAT-08's table by the test). */
export const BOOT_STUB_ROWS = [
  'IsControllerConnected', 'IsMemCardInserted', 'IsMemCardFormatted', 'MC_ChPort', 'MC_ChSlot', 'MC_Exists', 'MC_ChDir',
  'MC_MkDir', 'LoadConfig', 'ListSavedGames', 'IsSpaceForSaveGameFile', 'MC_Changed', 'StoreOptions',
  'HardDriveOperation', 'CheckVideoMode', 'SwitchProgressiveVideo',
] as const;
export type BootStubName = (typeof BOOT_STUB_ROWS)[number];

export interface BootStubsOptions {
  /** The valves `HardDriveOperation`, `MC_Changed` and `LoadConfig` write (`FUN_00351ff0` + the u16 at +4, the watchers run). */
  valves: ValveStore;
  /** A row called, as it happens (the sequence test and the page's log). */
  log?: (name: BootStubName, arg: string, answer: boolean) => void;
}

/** The card object at 0x436460 as the stubs model it: the port `MC_ChPort` sets (+0x20), the slot (+0x24), the current directory. */
export interface BootCardState {
  port: number;
  slot: number;
  /** `''` at the card's root; else the folder `MC_ChDir` entered. */
  cwd: string;
}

/**
 * The stubs over one card state. `register` fills the rows in PLAT-08's host; `state` is readable for the tests and
 * the page's log.
 */
export class BootStubs {
  readonly state: BootCardState = { port: 0, slot: 0, cwd: '' };
  private readonly valves: ValveStore;
  private readonly log?: BootStubsOptions['log'];

  constructor(o: BootStubsOptions) {
    this.valves = o.valves;
    this.log = o.log;
  }

  /** The f0 card is in slot 1 (port 0); slot 2 (port 1) is empty. */
  private inserted(): boolean { return this.state.port === 0; }

  private answer(name: BootStubName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** The argument as the rows read it (`FUN_0026ed60`, then `INPUT_STRING` replaced): the boot's bindings pass literals. */
  private arg(cmd: ZAnimUiCommand): string { return cmd.arg === INPUT_STRING ? '' : cmd.arg; }

  entries(): Record<BootStubName, UiCommandHandler> {
    const valves = this.valves;
    return {
      /**
       * `FUN_00277150` (D:L122778-122802): with a numeric argument of 0 (`NA` parses to 0, `FUN_00191490`), the pad
       * object `DAT_0044f108`'s word +0xdc == 1 -- the pad's connection state; with a non-zero argument no object, so
       * false. Stub: connected (a browser's pad -- keyboard or gamepad -- is PLAT-11's adaptation, never unplugged).
       */
      IsControllerConnected: (cmd) => this.answer('IsControllerConnected', cmd, parseInt(this.arg(cmd), 10) === 0 || Number.isNaN(parseInt(this.arg(cmd), 10))),
      /**
       * `FUN_003a1650` (D:L295921-295953, the tail of 0x27e1b0): `sceMcGetInfo(port, slot)` twice at most; inserted when
       * the result is above -10 and the type is 2 (a PS2 card). Stub: the f0 card in port 0 (`BASCUS-97275SOCOMII` on
       * the desktop's `s8_empty_card_title`: `GetInfo port=0 type=2 free=8000 format=1`, KNOWN L72), nothing in port 1.
       */
      IsMemCardInserted: (cmd) => this.answer('IsMemCardInserted', cmd, this.inserted()),
      /** `FUN_003a1580` (D:L295886-295918): `sceMcGetInfo`'s formatted flag. Stub: the f0 card is formatted (format=1, KNOWN L72). */
      IsMemCardFormatted: (cmd) => this.answer('IsMemCardFormatted', cmd, this.inserted()),
      /** `FUN_0027b260` (D:L124858-124874): the port from the argument when >= 0 (`DAT_00436480`), copied to the object; 1. */
      MC_ChPort: (cmd) => { const n = parseInt(this.arg(cmd), 10); if (n >= 0) this.state.port = n; return this.answer('MC_ChPort', cmd, true); },
      /** `FUN_0027b200` (D:L124839-124855): the slot likewise (`DAT_00436484`); 1. */
      MC_ChSlot: (cmd) => { const n = parseInt(this.arg(cmd), 10); if (n >= 0) this.state.slot = n; return this.answer('MC_ChSlot', cmd, true); },
      /**
       * `FUN_0027b1c0` (D:L124826-124836): `FUN_003a0950(card, name)`, the card's exists. Stub: at the root, `..` is
       * nothing and `BASCUS-97275SOCOMII` the f0 folder; inside it, `..` is the root and the names `F0_CARD_FILES`.
       * No card in port 1: nothing exists.
       */
      MC_Exists: (cmd) => this.answer('MC_Exists', cmd, this.exists(this.arg(cmd))),
      /** `FUN_0027b300` (D:L124890-124900): `FUN_003a07d0(card, name)`, the directory change; the answer is its (the decompiler shows no return). Stub: into the folder, or `..` to the root; 1. */
      MC_ChDir: (cmd) => {
        const name = this.arg(cmd);
        if (name === '..') this.state.cwd = '';
        else if (this.exists(name) && name === SAVE_FOLDER) this.state.cwd = SAVE_FOLDER;
        return this.answer('MC_ChDir', cmd, true);
      },
      /** `FUN_0027b2c0` (D:L124877-124887): `FUN_003a0890(card, name)`, mkdir. The f0 folder exists: nothing to make; 1. */
      MC_MkDir: (cmd) => this.answer('MC_MkDir', cmd, true),
      /**
       * `FUN_0027b0e0` (D:L124789-124813): `CSaveManager_Load` of the named folder (`FUN_003a1730(0x436460, name)`),
       * then the UI variable `AUTOMESSAGES` read and `FUN_005e7fb0(1|0)`; answers 1 always. Stub: the f0 card's two boot
       * valves written (`F0_CARD_BOOT_VALVES`; `LOAD_CONFIG_VALVES_PLACEHOLDER` for the rest), `AUTOMESSAGES` not read.
       */
      LoadConfig: (cmd) => {
        if (this.inserted()) for (const v of F0_CARD_BOOT_VALVES) valves.set(v.name, v.value, VALVE_TYPE.PERSIST);
        return this.answer('LoadConfig', cmd, true);
      },
      /** `FUN_002801c0` (D:L127435-127556): the `SavedGames` list filled from the card; answers 1. Stub: the list is MENU-13's; 1. */
      ListSavedGames: (cmd) => this.answer('ListSavedGames', cmd, true),
      /**
       * `FUN_0027b3d0` (D:L124930-124944): the free KB (`FUN_003a1210`); below 3001, plus the existing save's size;
       * true when the sum is not below 3000 (as `screens/cardCommands.ts`; `> 2999` is that test on whole KB). Stub:
       * the f0 card's 5,007 free (`F0_CARD_FREE_KB`), so true; false with no card.
       */
      IsSpaceForSaveGameFile: (cmd) => this.answer('IsSpaceForSaveGameFile', cmd, this.inserted() && F0_CARD_FREE_KB > 2999),
      /**
       * `FUN_0027b340` (D:L124903-124927): `FUN_003a1370(card, 1, &slot)`'s changed flag, and the valve `mc_changed_slot`
       * written with the slot it reports. Stub: the card has not changed since the boot's load (the desktop's second
       * launch on the same folder shows no prompt, KNOWN L72 `s8_save_second`): false, `mc_changed_slot` 0.
       */
      MC_Changed: (cmd) => { valves.set('mc_changed_slot', 0, VALVE_TYPE.PERM); return this.answer('MC_Changed', cmd, false); },
      /**
       * `FUN_0027b960` (D:L125111-125258): the options valves applied to the game's globals (02-boot O11: stereo, invert,
       * auto-aim, vibration, subtitles ...); answers 1. Stub: nothing applied (OPT-02's); 1.
       */
      StoreOptions: (cmd) => this.answer('StoreOptions', cmd, true),
      /**
       * `FUN_00278980` (D:L123579-123656), by the argument (`strcasecmp`): `OPEN` -- `FUN_0039d050`'s status into
       * `DAT_00414eb0`; 0: the `HDD_ERROR` callback registered, `DAT_004a37b0` = 1, answers 1; else `hard_disk_error_code`
       * = the status (1, 2, 3) or 5, answers 0. `GET_MISSION_DATA` -- the `.ZDB` entries of the HDD marked (answers 1);
       * `CLOSE` -- the HDD closed (answers 1); anything else answers 1. Stub: no HDD -- `OPEN` answers 0 with the code
       * `HDD_ABSENT_STATUS_READING`; the others 1 and nothing done.
       */
      HardDriveOperation: (cmd) => {
        const op = this.arg(cmd).toUpperCase();
        if (op === 'OPEN') {
          valves.set('hard_disk_error_code', HDD_ABSENT_STATUS_READING, VALVE_TYPE.PERM);
          return this.answer('HardDriveOperation', cmd, false);
        }
        return this.answer('HardDriveOperation', cmd, true);
      },
      /**
       * `FUN_0027c070` (D:L125309-125332): `NTSC` -> `DAT_004a44f5 == 0`; `DTV` -> `DAT_004a44f5 == 2`; any other
       * argument true. Stub: the mode is NTSC (`VIDEO_MODE.NTSC`; the disc's `SYSTEM.CNF` `VMODE = NTSC`, 02-boot B1).
       */
      CheckVideoMode: (cmd) => {
        const a = this.arg(cmd).toUpperCase();
        const mode: number = VIDEO_MODE.NTSC;
        return this.answer('CheckVideoMode', cmd, a === 'NTSC' ? mode === VIDEO_MODE.NTSC : a === 'DTV' ? mode === VIDEO_MODE.DTV : true);
      },
      /** `FUN_0027bf90` (D:L125281-125306): `NTSC` -> `DAT_004a44f4` = 0, `DTV` -> 2; answers 1. Stub: nothing switched (BOOT-09's); 1. */
      SwitchProgressiveVideo: (cmd) => this.answer('SwitchProgressiveVideo', cmd, true),
    };
  }

  /** `MC_Exists` for the modelled card. */
  private exists(name: string): boolean {
    if (!this.inserted()) return false;
    if (this.state.cwd === '') return name === SAVE_FOLDER;
    return name === '..' || name in F0_CARD_FILES;
  }

  /** The rows filled in PLAT-08's host (`setHandler`, W9.R4's registry). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
