import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { uiCommandFold } from '../uiCommands';
import { UIVAR_LONGEVITY, type UiVarManager } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The card UI commands the online path's card prompts dispatch that MENU-01a did not answer (OPT-05i, the online
 * path's slice of OPT-05a; web research 143): IsSpaceForSaveGameFile, IsMemcardSaveOK, LoadConfig, SaveConfig and
 * MC_CreateIconFiles, each over PLAT-26a's libmc through `CMemCardIO` (the object at 0x436460, its methods
 * `FUN_0039ff40` .. `FUN_003a1ea0`; research 134 §1). The prompts are `UIMemCardAnim.rdr`'s animations the online
 * dialogs reach -- the boot chain `intro_onstart` -> `load_initial_config` -> `find_a_memcard` -> `choose_memcard_slot`
 * that `dlgReturnFromNTGUI2` runs before LOGIN (`A_30`, research 128 R128.3), and `dlgNetPlayerName`'s
 * `memcard_operations` -> `save_and_leave` -> `choose_memcard_slot_cancellable` (`A_42`) -- listed with what each
 * dispatches in `CARD_PROMPT_COMMANDS` and `CARD_PROMPT_ANIMATIONS` (held to `tools/test/cardPromptCommands.pinned.json`).
 *
 * The rows share `CMemCardIO`'s port and slot with MENU-01a's `MenuCommands` (`MC_ChPort` sets them): `io` is that
 * object's `cardIo()`, which also performs each method's opening `sceMcSync(0, discard, discard)`. libmc enters as
 * `CardFileIo`, the shape PLAT-26a's `Libmc` already has (this package does not import `@s2u/card`). Every libmc
 * command here answers through its result, as the stub does; the "refused issue" branches (a wrapper returning below 0
 * before `sceMcSync`) are not reached (`MC_ISSUE_FAILURE_READING`, research 138). The file contents are R7's: our JSON
 * with the original's names, nominal sizes and command order; the save file's own content is the modules' (OPT-01,
 * OPT-02, OPT-04a), handed in as `CardConfigFile`.
 *
 * A branch into a parked card state (no card, unformatted, full, corrupt, removed) is not answered here as if the card
 * were well (OT.R8): these bodies read the card as it is and answer what the original answers; the animations those
 * answers lead to are listed as owed to OPT-05b..OPT-05g, and `FormatMemCard`, which only the unformatted branch
 * dispatches, stays declared (OPT-05c) -- PLAT-08's typed `not implemented` outcome.
 *
 * `D:L<line>` = a line of `socom2_game.elf.decomp.c`. Pure: no DOM, no viewer, no `tools/`.
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const CARD_COMMAND_ROWS = [
  { row: 59, id: 57, name: 'IsSpaceForSaveGameFile', fn: 0x27b3d0 },
  { row: 65, id: 63, name: 'LoadConfig', fn: 0x27b0e0 },
  { row: 66, id: 64, name: 'SaveConfig', fn: 0x27b000 },
  { row: 72, id: 70, name: 'MC_CreateIconFiles', fn: 0x27b190 },
  { row: 202, id: 204, name: 'IsMemcardSaveOK', fn: 0x27e120 },
] as const;
export type CardCommandName = (typeof CARD_COMMAND_ROWS)[number]['name'];

/** The libmc commands `CMemCardIO` issues, in the shape of PLAT-26a's `Libmc` (each answers its `sceMcSync` result). */
export interface CardFileIo {
  getInfo(port: number, slot: number): { result: number; type: number; free: number; format: number };
  getDir(port: number, slot: number, path: string, maxEntries: number): { result: number; entries: readonly { readonly size: number }[] };
  open(port: number, slot: number, path: string, flags: number): number;
  close(fd: number): number;
  seek(fd: number, offset: number, origin: number): number;
  read(fd: number, size: number): { result: number; data?: unknown };
  write(fd: number, size: number, data?: unknown): number;
  delete(port: number, slot: number, path: string): number;
}

/**
 * The save file `BASCUS-97275SOCOMII` as `CSaveManager` writes and reads it (`FUN_0033dff0`, `FUN_0033d6d0`): its
 * modules `CUIVarManager`, `CValveSaveManager`, `CAcctDB` (OPT-01, OPT-02, OPT-04a). `contents` is what a save
 * writes -- R7's JSON and its nominal size -- and `restore` takes what a load read, answering whether it parsed (the
 * original's in-memory ZAR opening, `FUN_00258920`).
 */
export interface CardConfigFile {
  contents(): { size: number; data: unknown };
  restore(data: unknown): boolean;
}

/** libmc's open flags (`PS2_FIO_*`, research 134 §1) as `CMemCardIO`'s open builds them (D:L295395-295404). */
export const CARD_FIO = { O_RDONLY: 0x1, O_WRONLY: 0x2, O_RDWR: 0x3, O_CREAT: 0x200, SEEK_SET: 0 } as const;

/** `CMemCardIO`'s open modes: 1 read; 0x1a write, create, and delete first (`FUN_0033dff0`, `FUN_0033d4a0`). */
export const CARD_OPEN_READ = 1;
export const CARD_OPEN_SAVE = 0x1a;

/** The status valve (the string at 0x3fbc50) the open, read, write and close set (1, 2, 3, 0), TEMP. */
export const MEMCARD_STATUS_VALVE = 'MEMCARD_STATUS_VALVE';
export const MEMCARD_STATUS = { closed: 0, open: 1, read: 2, write: 3 } as const;
/** The valve IsMemcardSaveOK writes the card state into (the string at 0x3ef380; `save_and_leave` tests 1 and 2). */
export const MEMCARD_ERROR_CODE_VALVE = 'memcard_error_code';
/**
 * `FUN_003a1cf0`'s card states (D:L296128-296172): 0 well, 1 unformatted (a PS2 card whose format flag is 0), 2 no
 * card (the result below -9, or not a PS2 card), 6 a PS2 card answering -5 (`MC_DAMAGED_RESULT_PLACEHOLDER`'s).
 */
export const CARD_STATE = { well: 0, unformatted: 1, noCard: 2, denied: 6 } as const;

/** The names `CMemCardIO` and the rows use (strings at 0x3fbd08 .. 0x3fbd58, 0x3eeef0, 0x3eef00, 0x3eef20, 0x3eee38). */
export const CARD_PATHS = {
  parent: '..', folderAll: './*', patchGlob: '*.zdb', patch: 'PATCHFILE.DAT', scratch: 'SCRATCHPAD.DAT',
  iconSys: 'icon.sys', listIco: 'LIST.ICO',
} as const;
export const SAVE_GAME_FORMAT = (i: number): string => `SaveGame${i}`;
/** UISaveConfig's dummies `SaveGame0..6` (D:L124775-124782: `iVar3 < 7`). */
export const SAVE_GAME_DUMMIES = 7;
/** The text the dummies' header carries (0x3eef00), handed to `FUN_003a1ea0`. */
export const SAVE_GAME_DUMMY_TEXT = 'This game is a dummy game.';
export const AUTOMESSAGES_UIVAR = 'AUTOMESSAGES';

/** The game's space rule (`FUN_0027b3d0` D:L124930-124944): free KB, plus the folder's KB when below 3001, above 2999. */
export const SAVE_SPACE_KB = 3000;
/** `PATCHFILE.DAT`'s KB (D:L296018) and the folder total the fillers bring it to (`2999 - used`, D:L296021-296024). */
export const PATCH_FILLER_KB = 2000;
export const FOLDER_FILL_KB = 2999;
/** `icon.sys`: the 0x3c4 bytes `FUN_003a0a10` builds and writes (D:L295545-295585). */
export const ICON_SYS_BYTES = 0x3c4;
/** `LIST.ICO` is copied from the disc a KB at a time (`FUN_001a8300(.., 0x400)`, D:L295617-295628). */
export const ICON_COPY_CHUNK = 0x400;
/**
 * LIST_ICO_BYTES_READING: `RUN/ICONS/LIST.ICO`'s size on the disc (50,234 B, the dev-disc test reads it; roadmap 04
 * O14), the source `FUN_003a0a10` copies. [reading]
 */
export const LIST_ICO_BYTES_READING = 50_234;
/**
 * SAVE_GAME_DUMMY_BYTES_READING: a dummy's nominal size, 1,952 B -- `SaveGame0..6` of the f0 card the desktop's run
 * left (research 139 §3; research 99 §7.2). Under R7 the dummies carry their size and no game bytes. [reading]
 */
export const SAVE_GAME_DUMMY_BYTES_READING = 1_952;
/**
 * CONFIG_FILE_PLACEHOLDER: the save file's contents with no module handed in -- the virgin card's nominal size
 * (4,784 B, research 135 R135.4) and no JSON -- and a load that parses whenever the file was read. OPT-01 / OPT-02 /
 * OPT-04a hand in `CardConfigFile` (the page's wiring). [placeholder]
 */
export const CONFIG_FILE_PLACEHOLDER = { size: 4_784, data: null } as const;
/**
 * CONFIG_HEADER_CHECK_READING: `CSaveManager::Load` re-reads the file's `zSaveHeader` (`FUN_0033d4a0`, a second
 * open / read / close) and refuses the load when its module word differs from the asked 0xe (D:L238929-238930). R7's
 * file has no header bytes; the re-read is issued and the word taken as matching. [reading]
 */
export const CONFIG_HEADER_CHECK_READING = 'the re-read issued; the module word taken as matching' as const;

export interface CardCommandsOptions {
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  /** The UI variable manager (0x437e80). */
  uiVars: UiVarManager;
  /** `CMemCardIO`'s port and slot after the method's opening drain: MENU-01a's `MenuCommands.cardIo`. */
  io: () => { port: number; slot: number };
  /** libmc (PLAT-26a's `Libmc`); absent: every port empty. */
  card?: CardFileIo;
  /** `FUN_001f3bf0(0x408538, name, 0)`: a named event into the dialog host. */
  event?: (kind: number) => void;
  /** The save file's modules (`CONFIG_FILE_PLACEHOLDER` when absent). */
  config?: CardConfigFile;
  /** `FUN_005e7fb0(flag)`: the byte `DAT_00650b08` LoadConfig writes from `AUTOMESSAGES` (0 for "ON", else 1). */
  autoMessages?: (flag: 0 | 1) => void;
  /** The size of the disc's `RUN/ICONS/LIST.ICO` (`LIST_ICO_BYTES_READING` when absent). */
  listIcoBytes?: number;
}

const NO_ENTRY = -4;
/** No card service: libmc's answers for an empty port (GetInfo type 0, NoEntry everywhere). */
const EMPTY_CARD: CardFileIo = {
  getInfo: () => ({ result: NO_ENTRY, type: 0, free: 0, format: 0 }), getDir: () => ({ result: NO_ENTRY, entries: [] }),
  open: () => NO_ENTRY, close: () => NO_ENTRY, seek: () => NO_ENTRY, read: () => ({ result: NO_ENTRY }),
  write: () => NO_ENTRY, delete: () => NO_ENTRY,
};

export class CardCommands {
  /**
   * `CMemCardIO`'s own file (+4 the handle, -1 when none: the constructor `FUN_003a22e0` D:L296330-296359; +0x10 its
   * size; +0x14 its mode), which `CSaveManager` opens, reads, writes and closes through the vtable at 0x4081f0.
   */
  private fd = -1;
  private size = 0;
  private mode = 0;
  private port = 0;
  private slot = 0;
  /** `DAT_00650b08` as LoadConfig last wrote it (null: never). */
  autoMessagesFlag: 0 | 1 | null = null;

  constructor(private readonly o: CardCommandsOptions) {}

  private card(): CardFileIo { return this.o.card ?? EMPTY_CARD; }
  /** The method's opening drain and the object's port and slot (`+0x20`, `+0x24`; the copies `+8`, `+0xc` equal). */
  private drain(): CardFileIo { ({ port: this.port, slot: this.slot } = this.o.io()); return this.card(); }
  private post(kind: number): void { this.o.event?.(kind); }
  private memcardError(): void { this.post(DIALOG_EVENTS.MEMCARD_ERROR!); }

  /** The status valve and `MEMCARD_STATUS` (D:L295236-295241 write, D:L295269-295274 read, D:L295434-295439 open, D:L295369-295374 close). */
  private status(v: number): void {
    const valves = this.o.valves();
    const held = valves.acquire(MEMCARD_STATUS_VALVE, VALVE_TYPE.TEMP);
    if (held.value !== v) valves.set(held.name, v, VALVE_TYPE.TEMP);
    this.post(DIALOG_EVENTS.MEMCARD_STATUS!);
  }

  /** vtable +0x10 (`FUN_003a04c0`): the handle is not negative. */
  private isOpen(): boolean { return this.fd >= 0; }

  /**
   * vtable +8 (`FUN_003a05a0` D:L295382-295442): the mode to libmc's flags; with 0x10 and 0x08 the file deleted first,
   * its result synced and unread, the size reset; Open; a read mode (`& 5`) asks GetDir of the path for one entry and
   * takes its size; open, the status valve 1. Answers whether the file is open.
   */
  private fileOpen(path: string, mode: number): boolean {
    const card = this.card();
    let flags = (mode & 1) !== 0 ? CARD_FIO.O_RDONLY : 0;
    if ((mode & 2) !== 0) flags |= CARD_FIO.O_WRONLY;
    if ((mode & 4) !== 0) flags = CARD_FIO.O_RDWR;
    if ((mode & 8) !== 0) flags |= CARD_FIO.O_CREAT;
    if ((mode & 0x10) !== 0 && (mode & 8) !== 0) { card.delete(this.port, this.slot, path); this.size = 0; }
    this.mode = mode;
    this.fd = card.open(this.port, this.slot, path, flags);
    if (this.isOpen() && (mode & 5) !== 0) {
      const dir = card.getDir(this.port, this.slot, path, 1);
      if (dir.result > 0) this.size = dir.entries[0]!.size;
    }
    if (this.isOpen()) this.status(MEMCARD_STATUS.open);
    return this.isOpen();
  }

  /** vtable +0x24 (`FUN_003a0270` D:L295261-295289): status 2, Read; the count, a negative one as 0. */
  private fileRead(size: number): { count: number; data: unknown } {
    this.status(MEMCARD_STATUS.read);
    const r = this.card().read(this.fd, size);
    return { count: r.result >= 0 ? r.result : 0, data: r.data };
  }

  /** vtable +0x2c (`FUN_003a0160` D:L295228-295256): status 3, Write; the count, a negative one as 0. */
  private fileWrite(size: number, data: unknown): number {
    this.status(MEMCARD_STATUS.write);
    const r = this.card().write(this.fd, size, data);
    return r >= 0 ? r : 0;
  }

  /** vtable +0xc (`FUN_003a04d0` D:L295351-295377): when open, Close, the handle -1, status 0. */
  private fileClose(): void {
    if (!this.isOpen()) return;
    this.card().close(this.fd);
    this.fd = -1;
    this.status(MEMCARD_STATUS.closed);
  }

  /**
   * `CSaveManager::Save` as the card sees it (`FUN_0033dff0` D:L239141-239245): the module list built in memory, then
   * the file opened with mode 0x1a (Delete, Open WRONLY|CREAT), one Write of the buffer, Close (D:L239225-239237).
   * Answers 1 whatever the card answered: only the in-memory ZAR's failure gives 0 (D:L239174), which R7 has none of.
   */
  private saveFile(path: string, size: number, data: unknown): void {
    if (this.fileOpen(path, CARD_OPEN_SAVE)) {
      this.fileWrite(size, data);
      this.fileClose();
    }
  }

  /** `FUN_0033d4a0`'s and `FUN_0033d6d0`'s read: Open mode 1 (with its GetDir), Read of the size, Close. */
  private readFile(path: string): { read: boolean; data: unknown } {
    if (!this.fileOpen(path, CARD_OPEN_READ)) return { read: false, data: undefined };
    const r = this.fileRead(this.size);
    this.fileClose();
    return { read: true, data: r.data };
  }

  /**
   * `FUN_003a1060` (D:L295714-295774): GetDir `..` for one entry; when there is one, GetDir `./*` for up to 0x14 and
   * the sum of each entry's `(size + 0x3ff) >> 10` that is not 0, plus half the count and one when any was not 0.
   */
  private folderKb(): number {
    const card = this.drain();
    if (card.getDir(this.port, this.slot, CARD_PATHS.parent, 1).result <= 0) return 0;
    const list = card.getDir(this.port, this.slot, CARD_PATHS.folderAll, 0x14);
    const count = list.result;
    if (count <= 0) return 0;
    let kb = 0;
    let any = false;
    for (const e of list.entries.slice(0, count)) {
      if (e.size !== 0) { any = true; kb += (e.size + 0x3ff) >>> 10; }
    }
    return any ? kb + (count >> 1) + 1 : kb;
  }

  /** `FUN_003a1210` (D:L295779-295807): GetInfo for the free KB, up to twice while the result is below -9. */
  private freeKb(): number {
    const card = this.drain();
    let free = 0;
    for (let tries = 2; tries > 0;) {
      const i = card.getInfo(this.port, this.slot);
      free = i.free;
      tries = i.result < -9 ? tries - 1 : 0;
    }
    return free;
  }

  /**
   * `FUN_003a1cf0` (D:L296128-296172; its instructions 0x3a1cf0-0x3a1e04): GetInfo up to twice; the state is set on a
   * result below -9 (2), a type other than 2 (2), a format flag of 0 (1) or a result of -5 (6), and **not reset**
   * between the tries (s1 is zeroed once, 0x3a1d1c); a well answer ends the loop. The refused-issue branch
   * (0x3a1d4c) is unreachable: `sltu v0, zero, v0` makes its test never negative.
   */
  private cardState(): number {
    const card = this.drain();
    let state: number = CARD_STATE.well;
    for (let tries = 2; tries > 0;) {
      const i = card.getInfo(this.port, this.slot);
      if (i.result < -9) state = CARD_STATE.noCard;
      else if (i.type === 2) {
        if (i.format === 0) state = CARD_STATE.unformatted;
        else if (i.result === -5) state = CARD_STATE.denied;
      } else state = CARD_STATE.noCard;
      tries = state === CARD_STATE.well ? 0 : tries - 1;
    }
    return state;
  }

  /**
   * `FUN_003a1980` (D:L296036-296077): when GetDir finds no such name, Open 0x202, Seek to `(kb - 1) * 0x400`, Write
   * 0x400 bytes (of 0xEE: no data under R7), Close -- an `kb` KB file; Open's refusal posts MEMCARD_ERROR.
   */
  private filler(name: string, kb: number): void {
    const card = this.drain();
    if (card.getDir(this.port, this.slot, name, 1).result > 0) return;
    const fd = card.open(this.port, this.slot, name, CARD_FIO.O_WRONLY | CARD_FIO.O_CREAT);
    if (fd < 0) { this.memcardError(); return; }
    card.seek(fd, (kb - 1) * 0x400, CARD_FIO.SEEK_SET);
    card.write(fd, 0x400);
    card.close(fd);
  }

  /**
   * `UIIsSpaceForSaveGameFile` `FUN_0027b3d0` (D:L124930-124944; 0x27b3d0-0x27b41c): the free KB; below 3001, plus the
   * folder's KB (`FUN_003a1060`); true when the sum is not below 3000.
   */
  IsSpaceForSaveGameFile: UiCommandHandler = () => {
    let kb = this.freeKb();
    if (kb < 3001) kb += this.folderKb();
    return kb >= SAVE_SPACE_KB;
  };

  /**
   * `IsMemcardSaveOK` 0x27e120 (no decompiled block; its instructions 0x27e120-0x27e194): `FUN_003a1cf0(0x436460)`
   * into s0; the valve `memcard_error_code` (0x3ef380) acquired TEMP (`FUN_00351ff0(.., 2)`), compared at +4, s0 stored,
   * the watchers run when it differed (`FUN_003519f0`); the answer is s0 == 0 (`sltiu v0, v0, 1`).
   */
  IsMemcardSaveOK: UiCommandHandler = () => {
    const state = this.cardState();
    const valves = this.o.valves();
    const v = valves.acquire(MEMCARD_ERROR_CODE_VALVE, VALVE_TYPE.TEMP);
    if (v.value !== state) valves.set(v.name, state, VALVE_TYPE.TEMP);
    return state === CARD_STATE.well;
  };

  /**
   * `UILoadConfig` `FUN_0027b0e0` (D:L124789-124813) -> `FUN_003a1730` (D:L295956-295974): drained, the port copied,
   * `CSaveManager::Load(name, 0xe)` (`FUN_0033d6d0` D:L238880-239000: the file read, its header re-read by
   * `FUN_0033d4a0`, then the modules restored); 0 posts MEMCARD_ERROR, else `LOADED_FROM_MEMCARD` (0x3fbd20). Then
   * `AUTOMESSAGES` (0x3eef20) acquired TEMPORARY (`FUN_003857c0(.., 0, 1)`): a string equal to "ON" (case-insensitive)
   * writes 0 through `FUN_005e7fb0`, any other string 1, another type nothing. Answer 1.
   */
  LoadConfig: UiCommandHandler = (cmd: ZAnimUiCommand) => {
    this.drain();
    const first = this.readFile(cmd.arg);
    this.readFile(cmd.arg);                                   // FUN_0033d4a0's re-read (CONFIG_HEADER_CHECK_READING)
    const config = this.o.config;
    const ok = first.read && (config ? config.restore(first.data) : true);
    this.post(ok ? DIALOG_EVENTS.LOADED_FROM_MEMCARD! : DIALOG_EVENTS.MEMCARD_ERROR!);
    const v = this.o.uiVars.add(AUTOMESSAGES_UIVAR, null, UIVAR_LONGEVITY.TEMPORARY);
    if (v.value.type === 'string') {
      const flag: 0 | 1 = uiCommandFold(v.value.value) === uiCommandFold('ON') ? 0 : 1;
      this.autoMessagesFlag = flag;
      this.o.autoMessages?.(flag);
    }
    return true;
  };

  /**
   * `UISaveConfig` `FUN_0027b000` (D:L124762-124786): (1) `FUN_003a1c60` (D:L296104-296126): with no file of the
   * object's open (vtable +0x10), drained, Delete `SCRATCHPAD.DAT`; (2) `FUN_003a17e0` (D:L295977-295992): drained, the
   * port copied, `CSaveManager::Save(name, 0xe, 0, "", 0)`; (3) for i 0..6, `SaveGame%d` that `FUN_003a0950` does not
   * find saved by `FUN_003a1ea0` (D:L296192-296207) with the dummy text; (4) `FUN_003a1880` (D:L295995-296026): GetDir
   * `*.zdb` for one entry; none -> `PATCHFILE.DAT` of 2000 KB; then `SCRATCHPAD.DAT` of `2999 - FUN_003a1060()` KB
   * when that is above 0 (its third argument, a2, read at 0x3a1944-0x3a1958). Answer 1.
   */
  SaveConfig: UiCommandHandler = (cmd: ZAnimUiCommand) => {
    if (!this.isOpen()) this.drain().delete(this.port, this.slot, CARD_PATHS.scratch);
    this.drain();
    const contents = this.o.config?.contents() ?? CONFIG_FILE_PLACEHOLDER;
    this.saveFile(cmd.arg, contents.size, contents.data);
    for (let i = 0; i < SAVE_GAME_DUMMIES; i++) {
      const path = SAVE_GAME_FORMAT(i);
      if (this.drain().getDir(this.port, this.slot, path, 1).result > 0) continue;
      this.drain();
      this.saveFile(path, SAVE_GAME_DUMMY_BYTES_READING, null);
    }
    const card = this.drain();
    if (card.getDir(this.port, this.slot, CARD_PATHS.patchGlob, 1).result <= 0) this.filler(CARD_PATHS.patch, PATCH_FILLER_KB);
    const room = FOLDER_FILL_KB - this.folderKb();
    if (room > 0) this.filler(CARD_PATHS.scratch, room);
    return true;
  };

  /**
   * `UIMC_CreateIconFiles` `FUN_0027b190` (D:L124816-124823) -> `FUN_003a0a10` (D:L295525-295655): drained; `icon.sys`
   * (0x3fbcc0) opened 0x202, its 0x3c4 bytes written, closed -- an Open refused posts MEMCARD_ERROR and ends it;
   * the disc's `RUN\ICONS\LIST.ICO` opened (always here: its size is known); `LIST.ICO` opened 0x203 (a refusal posts
   * MEMCARD_ERROR) and written a KB at a time while the disc read gives a whole KB -- a Write refused posts
   * MEMCARD_ERROR and ends it -- then closed. The body answers 0; the row answers 1.
   */
  MC_CreateIconFiles: UiCommandHandler = () => {
    const card = this.drain();
    const sys = card.open(this.port, this.slot, CARD_PATHS.iconSys, CARD_FIO.O_WRONLY | CARD_FIO.O_CREAT);
    if (sys < 0) { this.memcardError(); return true; }
    card.write(sys, ICON_SYS_BYTES, null);
    card.close(sys);
    const ico = card.open(this.port, this.slot, CARD_PATHS.listIco, CARD_FIO.O_RDWR | CARD_FIO.O_CREAT);
    if (ico < 0) { this.memcardError(); return true; }
    // The handle is closed on every path (try/finally): the card driver holds 3 (C8 U5), and a copy that failed
    // without closing would leave every later open answering UpLimitHandle. A browser adaptation: the console's own
    // loop leaves it to mcman, which also drops a slot's handles after a card error (C8 U4; not modelled here).
    try {
      let left = this.o.listIcoBytes ?? LIST_ICO_BYTES_READING;
      let chunk: number;
      do {
        chunk = Math.min(ICON_COPY_CHUNK, left);
        left -= chunk;
        if (card.write(ico, chunk) < 0) { this.memcardError(); return true; }
      } while (chunk === ICON_COPY_CHUNK);
    } finally {
      card.close(ico);
    }
    return true;
  };

  /** The object's file state, for the tests. */
  fileState(): { fd: number; size: number; mode: number } { return { fd: this.fd, size: this.size, mode: this.mode }; }

  /** The entries by their table name. */
  entries(): Record<CardCommandName, UiCommandHandler> {
    return {
      IsSpaceForSaveGameFile: this.IsSpaceForSaveGameFile, LoadConfig: this.LoadConfig, SaveConfig: this.SaveConfig,
      MC_CreateIconFiles: this.MC_CreateIconFiles, IsMemcardSaveOK: this.IsMemcardSaveOK,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}

/** Who answers a bound function the card prompts dispatch (as `MENU_ENTRY_COMMANDS`, research 138 §1). */
export interface CardPromptCommand {
  name: string;
  status: 'here' | 'earlier' | 'declared';
  task: string;
  spelt: readonly string[];
  /** For `declared`: why the row is not answered here. */
  why?: string;
}

const here = (name: string, ...spelt: string[]): CardPromptCommand => ({ name, status: 'here', task: 'OPT-05i', spelt });
const earlier = (name: string, task: string, ...spelt: string[]): CardPromptCommand => ({ name, status: 'earlier', task, spelt });
const declared = (name: string, task: string, why: string, ...spelt: string[]): CardPromptCommand => ({ name, status: 'declared', task, spelt, why });

/**
 * Every bound function the online path's card prompts name (the pin's `names`), each answered by a task.
 * `tools/test/cardPromptCommands.test.ts` holds it to the pin: none is silently ignored.
 */
export const CARD_PROMPT_COMMANDS: readonly CardPromptCommand[] = [
  earlier('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'),
  earlier('KillPopUp', 'PLAT-10', 'KILLPOPUP'),
  earlier('SwitchMenu', 'PLAT-10', 'SWITCHMENU'),
  earlier('IsMemCardInserted', 'MENU-01a'),
  earlier('IsMemCardFormatted', 'MENU-01a'),
  earlier('MC_ChPort', 'MENU-01a'),
  earlier('MC_ChDir', 'MENU-01a'),
  earlier('MC_Exists', 'MENU-01a'),
  earlier('MC_MkDir', 'MENU-01a'),
  earlier('MC_Changed', 'MENU-01a'),
  here('IsSpaceForSaveGameFile'),
  here('IsMemcardSaveOK'),
  here('LoadConfig'),
  here('SaveConfig'),
  here('MC_CreateIconFiles'),
  declared('FormatMemCard', 'OPT-05c', 'dispatched only in the unformatted branches (`do_formatting`, `intro_onstart`\'s idle `do_formatting` sequence): a parked card state (OT.R8)'),
  declared('ListSavedGames', 'MENU-13', '`load_initial_config` on a card holding the save folder: the LOAD GAME list, filled from the save headers (MENU-13\'s reader)'),
  declared('StoreOptions', 'MENU-01', 'the options valves applied to the game\'s globals (02-boot O11): not a card command; `load_initial_config` and `save_and_leave` end with it'),
  declared('CheckVideoMode', 'MENU-01', 'only with `video_mode` 1 (progressive scan saved), `SwitchToProgressiveVideo`: a video state, not a card state'),
  declared('SwitchProgressiveVideo', 'MENU-01', 'as CheckVideoMode'),
  declared('UpdateAcctInfo', 'ONL-06', '`memcard_operations` writes the persona into the account list before the save (the persona form\'s, not the card\'s)'),
];

/**
 * The animations of the walk (the pin's, in its order): `path` when the online path runs it on a present, formatted
 * card; `owed` when only a parked card state reaches it (OT.R8: reported, never answered as if the card were well),
 * with the task that owns that state; `video` when only `video_mode` 1 reaches it.
 */
export interface CardPromptAnimation {
  key: string;
  status: 'path' | 'owed' | 'video';
  task: string;
  /** Its role on the path, or the state that reaches it. */
  why: string;
}

const path = (key: string, why: string): CardPromptAnimation => ({ key, status: 'path', task: 'OPT-05i', why });
const owed = (key: string, task: string, why: string): CardPromptAnimation => ({ key, status: 'owed', task, why });
const MC = 'UIMemCardAnim.rdr/';

export const CARD_PROMPT_ANIMATIONS: readonly CardPromptAnimation[] = [
  path('UIanim.rdr/intro_onstart', 'the boot chain `dlgReturnFromNTGUI2` runs before LOGIN; its sequences at activation 2 idle, `end_of_screen` calls `load_initial_config` (R128.3)'),
  owed(`${MC}AskToFormat`, 'OPT-05c', 'unformatted (#850/#851)'),
  owed(`${MC}AreYouSureYouWantToFormat`, 'OPT-05c', 'unformatted (#848/#849)'),
  owed(`${MC}AreYouSureYouDontWantToFormat`, 'OPT-05c', 'unformatted (#846/#847)'),
  path(`${MC}Ensure_MC_Dirs`, 'the first save on a card without the folder: Mkdir, ChDir, the icons, SaveConfig'),
  path(`${MC}load_initial_config`, 'reads the card the player chose (A_30\'s chain) while `memcard_have_loaded_config` is 0'),
  path(`${MC}find_a_memcard`, '#827, then the cards counted in ports 0 and 1'),
  path(`${MC}choose_memcard_slot`, 'A_30: #828 with #510/#511, then #829 and MC_ChPort -- only with both slots holding a card (OPT-05h\'s flow at this place)'),
  owed(`${MC}do_formatting`, 'OPT-05c', 'unformatted (#836-#839)'),
  path(`${MC}DisplayLoadingWarning`, '#842/#843 for 0.3 s before the read'),
  path(`${MC}Ensure_MC_Dirs_Fast`, 'into the save folder when it is there (`MemcardAlreadyHasData`)'),
  path(`${MC}NoSOCOMDataFound2`, '#844/#845: a formatted card with room and no save folder (the first visit)'),
  owed(`${MC}CannotSaveNoSpace`, 'OPT-05d', 'full (#855/#856)'),
  owed(`${MC}DisplayErrorLoading`, 'OPT-05f', 'a load that does not parse: `memcard_error` 1 (#841)'),
  { key: `${MC}SwitchToProgressiveVideo`, status: 'video', task: 'MENU-01', why: '`video_mode` 1 with the TV not in DTV' },
  { key: `${MC}verify_video_dtv`, status: 'video', task: 'MENU-01', why: 'as SwitchToProgressiveVideo (#854)' },
  path('dlgNetPlayerName.rdr/memcard_operations', 'CONNECT\'s and TRIANGLE\'s save of the persona when `SaveAvailable` is 1 (A_42)'),
  path('dlgNetPlayerName.rdr/CanWeSavePassword', 'counts the cards in ports 0 and 1; none -> #607 (no card: its popup is this dialog\'s own)'),
  path(`${MC}save_and_leave`, 'A_42: #831 YES/NO, the slot select, #832/#833, the checks, #834/#835 and the save'),
  path(`${MC}choose_memcard_slot_cancellable`, '#830 with #510/#511 and TRIANGLE (66), then #829 and MC_ChPort -- shown whenever YES is chosen (O20)'),
  path(`${MC}AskToOverwrite`, '#857 on a card that already holds the folder (O20; OPT-05e owns its flow and tests)'),
  owed(`${MC}CannotSaveNoMemcard`, 'OPT-05b', 'no card, or the card removed during the save (#860/#861; OPT-05g)'),
  owed(`${MC}DisplayErrorSaving`, 'OPT-05f', 'a save that posted MEMCARD_ERROR (#840)'),
  owed(`${MC}CannotSaveNotFormatted`, 'OPT-05c', 'IsMemcardSaveOK\'s state 1 (#858/#859)'),
  path(`${MC}has_memcard_changed`, 'the poll every 1.5 s (MC_Changed); a change branches to AskToLoadData'),
  owed(`${MC}AskToLoadData`, 'OPT-05g', 'a new card detected (a literal popup, not #853)'),
];

/**
 * The captions of the prompts the path shows on a present, formatted card (O19, O20): the `UIMnLOC` id each popup
 * record names and the message the id is (`UIMnLOC.rdr`'s `MSG_ID`; the dev-disc test reads them). The text is
 * PLAT-16's popup to draw from the id; nothing here spells it.
 */
export const CARD_PROMPT_CAPTIONS: Readonly<Record<number, string>> = {
  827: '_827_LocatingSavedData_MSG',     // find_a_memcard
  828: '_828_SelectMemCardSlot_MSG',     // choose_memcard_slot (A_30)
  829: '_829_CheckingDontRemove_MSG',    // after a slot is chosen
  830: '_830_SelectSlotAbort_MSG',       // choose_memcard_slot_cancellable (O20: "(triangle) Abort.")
  831: '_831_WouldLikeSave_MSG',         // save_and_leave (A_42: "Would you like to save ...?")
  832: '_832_Checking1Dont_MSG',
  833: '_833_Checking2Dont_MSG',
  834: '_834_Saving1Dont_MSG',
  835: '_835_Saving2Dont_MSG',
  842: '_842_LoadingPrefs1Dont_MSG',     // DisplayLoadingWarning
  843: '_843_LoadingPrefs2Dont_MSG',
  844: '_844_NoDataCard1_MSG',           // NoSOCOMDataFound2
  845: '_845_NoDataCard2_MSG',
  857: '_857_OverwrittenDataLost_MSG',   // AskToOverwrite (O20)
  510: '_510_Slot1_MSG',                 // the slot buttons
  511: '_511_Slot2_MSG',
  246: '_246_No_MSG',
  253: '_253_Yes_MSG',
  226: '_226_Continue_MSG',
  607: '_607_NoCardCantSaveName_MSG',    // memcard_operations, no card (dlgNetPlayerName's own)
  608: '_608_NameSaveCancelled_MSG',
};
