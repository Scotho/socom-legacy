/**
 * libmc's file commands over the two virtual card slots (PLAT-26a, the online path's slice of PLAT-26; research 134).
 *
 * The guest-facing card API the game's card layer calls -- `CMemCardIO` (the class name at 0x3fbc20 of the game's
 * strings; its methods `FUN_0039ff40` .. `FUN_003a1ea0`, D:L295152-296207) -- answering as the recompilation's libmc
 * stub answers: `third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp` (cited `:<line>` below), the
 * C++ the desktop project runs the game on. Ported: GetInfo, Open, Close, Seek, Read, Write, Flush, Mkdir, Chdir,
 * GetDir (the block's ten) and Delete (the game's own open deletes before it creates, `FUN_003a05a0` D:L295406-295410,
 * and the filler cleanup deletes, `FUN_003a1bd0`/`FUN_003a1c60` D:L296092, D:L296116: research 134 §1); then PLAT-26's
 * five (research 228): Format, Unformat, SetFileInfo, GetEntSpace and Rename, at the desktop's be5578311 (the
 * `ref/desktop` pin, which holds the file as 152579aaf left it). Of the five
 * the game calls Format alone (`FormatMemCard` -> `FUN_003a12e0`, D:L295821; research 228 §2).
 *
 * What the stub does that this does not: the stub's commands return 0 and leave their result for `sceMcSync`; here
 * each command returns its result too (the caller's convenience, not the original's) and leaves it for `sync()` as the
 * stub does; no busy state is modelled, so `sync()` never answers 0 ("still running"). Guest
 * memory (a table address, a buffer) does not exist here: a Read answers the count and the file's JSON, a Write takes
 * a count and, optionally, the file's new JSON (R7: the card's contents are ours, the sizes the original's).
 *
 * Over PLAT-25 (`cardSlots.ts`): port 0 is slot 1, port 1 slot 2, slot 0 of each the only slot (the stub's
 * `isValidMcPortSlot`, :131-134). Every save goes through PLAT-26's re-read rule (research 99 §7.9): a `changed`
 * refusal is re-read, and answered ChangedCard (-1) only when the card -- present, formatted, files, folders -- differs
 * from what this layer last read on that port; otherwise the save is tried once more with the fresh revision.
 */
import {
  CARD_SLOT_KEYS, CARD_TOTAL_CLUSTERS, clustersFor,
  type CardFailure, type CardResult, type CardRev, type CardSlot, type CardSlots, type SlotRead,
} from './cardSlots';

/** The commands, as `sceMcSync` reports them (`kMcCmd*`, MemoryCard.cpp:14-29). */
export const MC_CMD = {
  GetInfo: 0x01, Open: 0x02, Close: 0x03, Seek: 0x04, Read: 0x05, Write: 0x06, Flush: 0x0a, Mkdir: 0x0b, Chdir: 0x0c,
  GetDir: 0x0d, SetFileInfo: 0x0e, Delete: 0x0f, Format: 0x10, Unformat: 0x11, GetEntSpace: 0x12, Rename: 0x13,
} as const;

/** The results (`kMcResult*`, MemoryCard.cpp:31-38). A command that succeeds may answer a count, a handle or a position. */
export const MC_RESULT = {
  Succeed: 0, ChangedCard: -1, NoFormat: -2, FullDevice: -3, NoEntry: -4, DeniedPermit: -5, NotEmpty: -6,
  UpLimitHandle: -7,
} as const;

/** The open flags and seek origins (`PS2_FIO_*`, `ps2xRuntime/include/runtime/ps2_memory.h:53-65`). */
export const FIO = {
  O_RDONLY: 0x1, O_WRONLY: 0x2, O_RDWR: 0x3, O_APPEND: 0x100, O_CREAT: 0x200, O_TRUNC: 0x400,
  SEEK_SET: 0, SEEK_CUR: 1, SEEK_END: 2,
} as const;

/** A GetDir entry's attribute bits (`kMcAttr*`, MemoryCard.cpp:52-57). */
export const MC_ATTR = { Readable: 0x1, Writeable: 0x2, File: 0x10, Subdir: 0x20, Closed: 0x80, Exists: 0x8000 } as const;

/** GetInfo's card types and format flags (MemoryCard.cpp:40-43). */
export const MC_TYPE_NONE = 0;
export const MC_TYPE_PS2 = 2;
export const MC_FORMATTED = 1;
export const MC_UNFORMATTED = 0;

/**
 * Handles open at once, across both ports: Sony's `MCMAN.IRX` holds 3, and its 4th open answers -7 (`UpLimitHandle`;
 * MCMAN 0x6b84-0x6bbc, the PS1 path 0xacbc-0xacd8; research wave C8 U5, a reading). The desktop stub's
 * `kMcMaxOpenFiles` 32 (MemoryCard.cpp:50, refused at :664-667) is not the console's.
 */
export const MC_MAX_OPEN_FILES = 3;

/** The characters of a name a GetDir entry keeps (`EntryName[32]` less its terminator, MemoryCard.cpp:79, :544-545). */
export const MC_ENTRY_NAME_MAX = 31;

/**
 * What a command answers on a slot whose record is damaged (PLAT-25's "a present card whose save is damaged"): the
 * stub has no such card. DeniedPermit (-5), because the game's card-state probe tells a PS2 card answering -5 from
 * every other (`FUN_003a1cf0` D:L296152-296158, its state 6). Settled by OPT-05f's "Error loading data" path and
 * PLAT-26's trace (research 134 §5).
 */
export const MC_DAMAGED_RESULT_PLACEHOLDER = MC_RESULT.DeniedPermit;

/** GetInfo's answer for a damaged slot, beside the result above: a PS2 card, formatted, no free space shown. */
export const MC_DAMAGED_GETINFO_PLACEHOLDER = { type: MC_TYPE_PS2, free: 0, format: MC_FORMATTED } as const;

/**
 * Delete of a file a handle holds open is refused DeniedPermit: the stub's `std::filesystem::remove` (:905-912)
 * fails on its Windows host while the `FILE*` is open, and succeeds on POSIX. [reading] the host the recomp runs on
 * is Windows (research 134 §5).
 */
export const MC_DELETE_OPEN_FILE_DENIED_READING = true;

/**
 * Rename of a file a handle holds open -- as the old name, as the new one, or inside a folder renamed -- is refused
 * DeniedPermit: the stub's `std::filesystem::rename` (:1473-1474) fails on its Windows host while the `FILE*` is open
 * (no delete sharing), and succeeds on POSIX. [reading] the host the recomp runs on is Windows, as for Delete
 * (research 228 §5). The game never calls Rename (research 228 §2).
 */
export const MC_RENAME_OPEN_FILE_DENIED_READING = true;

/** GetEntSpace's answer for any port and path: the stub's constant (`sceMcGetEntSpace` :1169-1176; the value :1173). */
export const MC_ENT_SPACE = 1024;

/** One entry of a GetDir table (`SceMcTblGetDir`, MemoryCard.cpp:70-80): its name, attributes, size and time. */
export interface McDirEntry {
  readonly name: string;
  readonly attr: number;
  /** `FileSizeByte`: the file's nominal size; 0 for a folder (:538). */
  readonly size: number;
  /** The entry's time, ms since the epoch (the stub writes it as both `_Create` and `_Modify`, :536-537). */
  readonly mtime: number;
}

export interface McInfo {
  readonly result: number;
  readonly type: number;
  readonly free: number;
  readonly format: number;
}

export type McSync = { readonly ret: -1 } | { readonly ret: 1; readonly cmd: number; readonly result: number };

export interface LibmcOptions {
  /** Where the `[mc]` lines go: the FAILED line, always (ruling R238, :609-623), and the trace's, when on. */
  readonly log: (line: string) => void;
  /** `PS2X_MC_TRACE` (:146-150): the GetInfo and Sync lines. Off by default. */
  readonly trace?: boolean;
  /** The clock for GetDir's `.` and `..` entries (the stub's `std::time(nullptr)`, :1073). */
  readonly now?: () => number;
}

/** An open handle: its port, its file on the card, how it was opened (the stub's fopen mode, :689-734), its position. */
interface OpenFile {
  readonly port: number;
  readonly path: string;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly append: boolean;
  pos: number;
}

interface PortState {
  currentDir: string;
  /** What this layer last read of the slot: its revision and its card's content (the re-read rule's reference). */
  seen: { rev: CardRev; sig: string } | undefined;
}

const R = MC_RESULT;
const CHANGED = Symbol('changed card');

/** Resolves a guest path against `currentDir` to `/a/b`, or `null` where the stub refuses it (MemoryCard.cpp:395-465). */
export function normalizeMcPath(currentDir: string, path: string): string | null {
  let p = path.replace(/\\/g, '/');
  const lower = lowerAscii(p);
  if (lower.startsWith('mc0:') || lower.startsWith('mc1:')) p = p.slice(4);
  const absolute = p.startsWith('/');
  let climbedPastRoot = false;
  const parts = absolute ? [] : splitPath(currentDir);
  for (const part of splitPath(p)) {
    if (part === '.') continue;
    if (part === '..') {
      // A trailing `..` at the root is the root (the virgin card's query, :419-445); a climb with a name after it is
      // refused (:456-461).
      if (parts.length === 0) climbedPastRoot = true;
      else parts.pop();
      continue;
    }
    if (!isSafeMcPathComponent(part)) return null;
    parts.push(part);
  }
  if (climbedPastRoot && parts.length > 0) return null;
  return '/' + parts.join('/');
}

/** libmc over the two slots: the stub's per-port current folder, its handle table and its last result for Sync. */
export class Libmc {
  private readonly log: (line: string) => void;
  private readonly trace: boolean;
  private readonly now: () => number;
  private readonly ports: [PortState, PortState] = [
    { currentDir: '/', seen: undefined }, { currentDir: '/', seen: undefined },
  ];
  private readonly files = new Map<number, OpenFile>();
  private nextFd = 1;
  private lastCmd = 0;
  private lastResult = 0;
  private pending = false;

  constructor(private readonly slots: CardSlots, options: LibmcOptions) {
    this.log = options.log;
    this.trace = options.trace ?? false;
    this.now = options.now ?? (() => Date.now());
  }

  // ---- the session (sceMcInit :1256-1276, sceMcEnd :924-941, sceMcSync :1564-1606) ----

  /** Closes every handle, counts handles from 1 again, puts each port at the root. */
  init(): number {
    this.reset();
    for (const p of this.ports) p.seen = undefined;
    return 0;
  }

  /** As `init`: the stub's teardown is the same local reset (:924-941). */
  end(): number {
    this.reset();
    return 0;
  }

  /** -1 when no command is pending (:1579-1585); else 1 with the last command and its result, once. */
  sync(): McSync {
    if (!this.pending) return { ret: -1 };
    this.pending = false;
    if (this.trace) this.log(`[MC] Sync cmd=${this.lastCmd} result=${this.lastResult}`);
    return { ret: 1, cmd: this.lastCmd, result: this.lastResult };
  }

  // ---- the card ----

  /** GetInfo (:1178-1249): a PS2 card's type, free clusters and format flag. */
  getInfo(port: number, slot: number): McInfo {
    let type = MC_TYPE_NONE;
    let free = 0;
    let format = MC_UNFORMATTED;
    let result: number = R.NoEntry;
    const card = this.card(port, slot);
    if (card) {
      const info = card.info();
      if (info.state === 'formatted') {
        type = MC_TYPE_PS2;
        free = info.freeClusters;
        format = MC_FORMATTED;
        result = R.Succeed;
      } else if (info.state === 'unformatted') {
        type = MC_TYPE_PS2;
        result = R.NoFormat;
      } else if (info.state === 'damaged') {
        ({ type, free, format } = MC_DAMAGED_GETINFO_PLACEHOLDER);
        result = MC_DAMAGED_RESULT_PLACEHOLDER;
      }
    }
    this.finish(MC_CMD.GetInfo, result, card ? port : undefined);
    if (this.trace) this.log(`[MC] GetInfo port=${port} type=${type} free=${free} format=${format} result=${result}`);
    return { result, type, free, format };
  }

  // ---- folders ----

  /** Mkdir (:1278-1328): a folder already there is Succeed (:1306-1308). */
  mkdir(port: number, slot: number, path: string): number {
    return this.onPort(MC_CMD.Mkdir, port, slot, (card, st) => {
      const norm = normalizeMcPath(st.currentDir, path);
      if (norm === null) return R.DeniedPermit;
      if (norm === '/') return R.Succeed;
      return this.resultOf(this.save(port, card, (rev) => card.makeDir(norm.slice(1), rev)), R.Succeed);
    });
  }

  /** Chdir (:797-849): moves the port's current folder; answers it (the old one when refused). */
  chdir(port: number, slot: number, path: string): { result: number; currentDir: string } {
    let currentDir = '/';
    const result = this.onPort(MC_CMD.Chdir, port, slot, (card, st) => {
      currentDir = st.currentDir;
      const resolved = path === '' ? st.currentDir : normalizeMcPath(st.currentDir, path);
      if (resolved === null) return R.DeniedPermit;
      if (this.kindAt(card, resolved.slice(1)) !== 'dir') return R.NoEntry;
      st.currentDir = resolved;
      currentDir = resolved;
      return R.Succeed;
    }, (st, gate) => {
      if (gate !== R.NoEntry) currentDir = st.currentDir;
    });
    return { result, currentDir };
  }

  /**
   * GetDir (:991-1167): a folder's entries, or those matching the last name's `*` and `?`; `.` and `..` first, then the
   * folder's in the stub's order; at most `maxEntries`. The result is the count. The stub's `mode` argument is unused
   * (:991-997) and not taken.
   */
  getDir(port: number, slot: number, path: string, maxEntries: number): { result: number; entries: McDirEntry[] } {
    let entries: McDirEntry[] = [];
    const result = this.onPort(MC_CMD.GetDir, port, slot, (card, st) => {
      const norm = normalizeMcPath(st.currentDir, path === '' ? '.' : path);
      if (norm === null) {
        this.log(`[mc] GetDir REFUSED path '${path}' (not normalisable)`);
        return R.DeniedPermit;
      }
      const queryRel = norm.slice(1);
      let parentRel: string;
      let pattern: string;
      if (/[*?]/.test(norm) || this.kindAt(card, queryRel) !== 'dir') {
        parentRel = parentOf(queryRel);
        pattern = nameOf(queryRel);
      } else {
        parentRel = queryRel;
        pattern = '*';
      }
      if (pattern === '') pattern = '*';
      if (this.kindAt(card, parentRel) !== 'dir') return R.NoEntry;
      const listed = card.list(parentRel);
      if (!listed.ok) return this.failureResult(listed.failure);
      const now = this.now();
      const all: McDirEntry[] = [];
      for (const special of ['.', '..']) {
        if (wildcardMatch(pattern, special)) all.push(dirEntry(special, true, 0, now));
      }
      for (const e of listed.value) {
        if (wildcardMatch(pattern, e.name)) all.push(dirEntry(e.name, e.kind === 'dir', e.size, e.mtime));
      }
      const count = Math.min(all.length, maxEntries > 0 ? maxEntries : 0);
      entries = all.slice(0, count);
      return count;
    });
    return { result, entries };
  }

  /** Delete (:871-922): a file, or an empty folder; the root is NoEntry (:894). */
  delete(port: number, slot: number, path: string): number {
    return this.onPort(MC_CMD.Delete, port, slot, (card, st) => {
      const norm = normalizeMcPath(st.currentDir, path);
      if (norm === null) return R.DeniedPermit;
      if (norm === '/') return R.NoEntry;
      const cp = norm.slice(1);
      const stat = card.stat(cp);
      if (!stat.ok) return this.failureResult(stat.failure);
      if (stat.value.kind === 'dir') return this.resultOf(this.save(port, card, (rev) => card.removeDir(cp, rev)), R.Succeed);
      if (MC_DELETE_OPEN_FILE_DENIED_READING && [...this.files.values()].some((f) => f.port === port && f.path === cp)) {
        return R.DeniedPermit;
      }
      return this.resultOf(this.save(port, card, (rev) => card.deleteFile(cp, rev)), R.Succeed);
    });
  }

  // ---- files ----

  /** Open (:1330-1399): a handle (1 and up), or the failure. CREAT and TRUNC change the card at the open (:723-725). */
  open(port: number, slot: number, path: string, flags: number): number {
    return this.onPort(MC_CMD.Open, port, slot, (card, st) => {
      const norm = normalizeMcPath(st.currentDir, path);
      if (norm === null || norm === '/') return R.DeniedPermit;
      const cp = norm.slice(1);
      const stat = card.stat(cp);
      if (!stat.ok && stat.failure.kind !== 'no-entry') return this.failureResult(stat.failure);
      const exists = stat.ok;
      if (exists && stat.value.kind === 'dir') return R.DeniedPermit;
      const create = (flags & FIO.O_CREAT) !== 0;
      if (!exists && !create) return R.NoEntry;
      if (this.kindAt(card, parentOf(cp)) !== 'dir') return R.NoEntry;
      // The fopen mode (:689-734): without write access it is "rb", which a missing file fails (:1380-1383).
      const access = flags & FIO.O_RDWR;
      const writable = access === FIO.O_WRONLY || access === FIO.O_RDWR;
      const append = writable && (flags & FIO.O_APPEND) !== 0;
      const truncate = (flags & FIO.O_TRUNC) !== 0;
      // Write-only is "wb" / "ab", which fread fails, unless it opens an existing file without APPEND or TRUNC:
      // that is "r+b" (:717-731), and reads (:1426).
      const readable = !writable || access === FIO.O_RDWR || (!append && !truncate && exists);
      if (!writable && !exists) return R.NoEntry;
      if (writable && (append ? !exists : truncate || !exists)) {
        const made = this.save(port, card, (rev) => card.writeFile(cp, 0, null, rev));
        const failed = this.resultOf(made, R.Succeed);
        if (failed !== R.Succeed) return failed;
      }
      // The handle is taken after the file is made: an open past the console's
      // MC_MAX_OPEN_FILES (3) handles -- the 4th -- has its CREAT stand (:1379-1391, :664-667).
      if (this.files.size >= MC_MAX_OPEN_FILES) return R.UpLimitHandle;
      const fd = this.allocateFd();
      this.files.set(fd, { port, path: cp, readable, writable, append, pos: 0 });
      return fd;
    });
  }

  /** Close (:851-869). */
  close(fd: number): number {
    const f = this.files.get(fd);
    this.files.delete(fd);
    return this.finish(MC_CMD.Close, f ? R.Succeed : R.NoEntry, f?.port);
  }

  /** Flush (:943-957): the card is written at every Write already. */
  flush(fd: number): number {
    const f = this.files.get(fd);
    return this.finish(MC_CMD.Flush, f ? R.Succeed : R.NoEntry, f?.port);
  }

  /** Seek (:1486-1522): the new position; an origin other than CUR and END is SET (:1498-1506); before 0, DeniedPermit. */
  seek(fd: number, offset: number, origin: number): number {
    const f = this.files.get(fd);
    if (!f) return this.finish(MC_CMD.Seek, R.NoEntry);
    let base = 0;
    if (origin === FIO.SEEK_CUR) base = f.pos;
    else if (origin === FIO.SEEK_END) {
      const stat = this.slot(f.port).stat(f.path);
      if (!stat.ok) return this.finish(MC_CMD.Seek, this.failureResult(stat.failure), f.port);
      base = stat.value.size;
    }
    const pos = base + offset;
    if (pos < 0) return this.finish(MC_CMD.Seek, R.DeniedPermit, f.port);
    f.pos = pos;
    return this.finish(MC_CMD.Seek, pos, f.port);
  }

  /** Read (:1401-1437): the bytes read (up to the file's end) and the file's JSON. */
  read(fd: number, size: number): { result: number; data?: unknown } {
    if (size <= 0) return { result: this.finish(MC_CMD.Read, 0) };
    const f = this.files.get(fd);
    if (!f) return { result: this.finish(MC_CMD.Read, R.NoEntry) };
    // fread on a write-only handle opened "wb" / "ab" sets the error flag (:1426-1427); "r+b" reads.
    if (!f.readable) return { result: this.finish(MC_CMD.Read, R.DeniedPermit, f.port) };
    const file = this.slot(f.port).readFile(f.path);
    if (!file.ok) return { result: this.finish(MC_CMD.Read, this.failureResult(file.failure), f.port) };
    const count = Math.max(0, Math.min(size, file.value.size - f.pos));
    f.pos += count;
    return { result: this.finish(MC_CMD.Read, count, f.port), data: file.value.data };
  }

  /**
   * Write (:1639-1705): the bytes written. The file grows to the write's end; a growth past the card's free clusters is
   * FullDevice, whole (:1664-1681), checked before the handle's access (:1678-1685). `data`, when given, becomes the
   * file's JSON; without it the file keeps its own (a filler or an icon chunk carries none of ours).
   */
  write(fd: number, size: number, data?: unknown): number {
    if (size <= 0) return this.finish(MC_CMD.Write, 0);
    const f = this.files.get(fd);
    if (!f) return this.finish(MC_CMD.Write, R.NoEntry);
    const card = this.slot(f.port);
    const file = card.readFile(f.path);
    if (!file.ok) return this.finish(MC_CMD.Write, this.failureResult(file.failure), f.port);
    const info = card.info();
    if (info.state !== 'formatted') return this.finish(MC_CMD.Write, this.stateResult(info.state), f.port);
    const before = file.value.size;
    const start = f.append ? before : f.pos;
    const end = start + size;
    const growth = end > before ? clustersFor(end) - clustersFor(before) : 0;
    if (growth > 0 && info.usedClusters + growth > CARD_TOTAL_CLUSTERS) return this.finish(MC_CMD.Write, R.FullDevice, f.port);
    if (!f.writable) return this.finish(MC_CMD.Write, R.DeniedPermit, f.port);
    const content = data === undefined ? file.value.data : data;
    const saved = this.save(f.port, card, (rev) => card.writeFile(f.path, Math.max(before, end), content, rev));
    const result = this.resultOf(saved, size);
    if (result === size) f.pos = end;
    return this.finish(MC_CMD.Write, result, f.port);
  }

  // ---- the card's format and the entries' names (PLAT-26; research 228 §1) ----

  /**
   * Format (`sceMcFormat`, :959-989): on a card in the slot -- formatted or not; no format gate (:967) -- the port's
   * handles are closed (:969), the card emptied and formatted (:972-981) and the port put at the root (:980). No card
   * is NoEntry (:964). A write the storage refuses is NoEntry and leaves the card as it was: the port's adaptation
   * (research 228 §1) -- the stub's one failure on a present card is NoEntry when it cannot make the root (:974-978),
   * after it has already emptied it (:972), while the port's save is atomic. A damaged record is replaced by a fresh
   * card (the one save PLAT-25 lets it take, research 99 §7.4). A save under the re-read rule: it moves the slot's
   * revision as any save does, and a card another tab changed since the last read answers ChangedCard (research 228
   * §1).
   */
  format(port: number, slot: number): number {
    return this.wipe(MC_CMD.Format, port, slot, (card, rev) => card.format(rev));
  }

  /**
   * Unformat (`sceMcUnformat`, :1608-1637): as Format, but the card is left unformatted (:1628); an unformatted card
   * is Succeed again. A damaged record answers the placeholder (the stub has no damaged card; PLAT-25 lets only a
   * format replace it).
   */
  unformat(port: number, slot: number): number {
    return this.wipe(MC_CMD.Unformat, port, slot, (card, rev) => card.unformat(rev));
  }

  /**
   * SetFileInfo (`sceMcSetFileInfo`, :1524-1562): the stub reads the port, the slot and the path only (:1526-1528) and
   * sets nothing -- no attribute, time or name; it answers Succeed when the entry (a file, a folder, the root) exists
   * (:1551-1553) and NoEntry when not (:1530). The gate's NoFormat (:1536-1538); a refused path DeniedPermit
   * (:1543-1545). Nothing is written.
   */
  setFileInfo(port: number, slot: number, path: string): number {
    return this.onPort(MC_CMD.SetFileInfo, port, slot, (card, st) => {
      const norm = normalizeMcPath(st.currentDir, path);
      if (norm === null) return R.DeniedPermit;
      return this.kindAt(card, norm.slice(1)) === undefined ? R.NoEntry : R.Succeed;
    });
  }

  /** GetEntSpace (`sceMcGetEntSpace`, :1169-1176): 1024, whatever the port, slot and path; the card is not asked. */
  getEntSpace(_port: number, _slot: number, _path: string): number {
    return this.finish(MC_CMD.GetEntSpace, MC_ENT_SPACE);
  }

  /**
   * Rename (`sceMcRename`, :1439-1484): both paths resolved against the port's folder (:1460-1461), either refused
   * DeniedPermit (:1463); then the old entry and the new one's folder must exist, else NoEntry (:1446, :1470-1471);
   * then the host's rename decides (:1473-1474), as PLAT-25's `rename` follows it: a file onto a file replaces it;
   * a file onto a folder, a folder onto a file or a folder, a folder into itself, the root, or a new folder that is a
   * file DeniedPermit. A file a handle holds open is DeniedPermit (`MC_RENAME_OPEN_FILE_DENIED_READING`).
   */
  rename(port: number, slot: number, from: string, to: string): number {
    return this.onPort(MC_CMD.Rename, port, slot, (card, st) => {
      const oldNorm = normalizeMcPath(st.currentDir, from);
      const newNorm = normalizeMcPath(st.currentDir, to);
      if (oldNorm === null || newNorm === null) return R.DeniedPermit;
      const oldCp = oldNorm.slice(1);
      const newCp = newNorm.slice(1);
      if (this.kindAt(card, oldCp) === undefined || this.kindAt(card, parentOf(newCp)) === undefined) return R.NoEntry;
      if (MC_RENAME_OPEN_FILE_DENIED_READING && oldCp !== '' && newCp !== '') {
        const held = [...this.files.values()].some((f) => f.port === port && (
          f.path === oldCp || f.path.startsWith(`${oldCp}/`) || f.path === newCp));
        if (held) return R.DeniedPermit;
      }
      const renamed = this.save(port, card, (rev) => card.rename(oldCp, newCp, rev));
      return this.resultOf(renamed, R.Succeed);
    });
  }

  // ---- the machinery ----

  /**
   * Format and Unformat: no card NoEntry (:964, :1613); else the port's handles closed (`closeMcFilesForPortLocked`,
   * :639-656, called at :969 and :1618), the save under the re-read rule, and on success the port at the root (:980,
   * :1627). A write the storage refuses is NoEntry, the card left as it was -- the port's adaptation, not the stub's
   * behaviour: the stub empties the card first (:972, :1621) and answers NoEntry only when it then cannot make the root
   * (:974-978, :1623-1624), so its failed card is empty. NoEntry rather than the DeniedPermit `failureResult` gives
   * every other command's refused write: it is the only failure code these two stub commands answer on a present card,
   * and the game reads only "0 or not" from Format (`FUN_003a12e0`, D:L295827-295828; research 228 §1).
   */
  private wipe(
    cmd: number, port: number, slot: number, op: (card: CardSlot, rev: CardRev) => CardResult<unknown>,
  ): number {
    const card = this.card(port, slot);
    if (!card) return this.finish(cmd, R.NoEntry);
    if (card.info().state === 'no-card') return this.finish(cmd, R.NoEntry, port);
    for (const [fd, f] of this.files) if (f.port === port) this.files.delete(fd);
    const saved = this.save(port, card, (rev) => op(card, rev));
    const result = saved !== CHANGED && !saved.ok && saved.failure.kind === 'write-failed'
      ? R.NoEntry
      : this.resultOf(saved, R.Succeed);
    if (result === R.Succeed) this.ports[port]!.currentDir = '/';
    return this.finish(cmd, result, port);
  }

  private reset(): void {
    this.files.clear();
    this.nextFd = 1;
    this.lastCmd = 0;
    this.lastResult = 0;
    this.pending = false;
    for (const p of this.ports) p.currentDir = '/';
  }

  /** The slot behind a port and slot number, or undefined where the stub has no card (`isValidMcPortSlot`, :131-134). */
  private card(port: number, slot: number): CardSlot | undefined {
    return (port === 0 || port === 1) && slot === 0 ? this.slot(port) : undefined;
  }

  private slot(port: number): CardSlot {
    return this.slots.slot(port === 0 ? 1 : 2);
  }

  /**
   * A command on a port's card: no card is NoEntry, unformatted NoFormat (the stub's order, e.g. :1287-1293), a damaged
   * record the placeholder; then `body`. Records the result for Sync and what this layer read of the slot.
   */
  private onPort(
    cmd: number, port: number, slot: number,
    body: (card: CardSlot, st: PortState) => number,
    refused?: (st: PortState, gate: number) => void,
  ): number {
    const card = this.card(port, slot);
    if (!card) return this.finish(cmd, R.NoEntry);
    const st = this.ports[port]!;
    const info = card.info();
    if (info.state !== 'formatted') {
      const gate = this.stateResult(info.state);
      refused?.(st, gate);
      return this.finish(cmd, gate, port);
    }
    return this.finish(cmd, body(card, st), port);
  }

  private stateResult(state: 'unformatted' | 'no-card' | 'damaged' | 'formatted'): number {
    if (state === 'unformatted') return R.NoFormat;
    if (state === 'damaged') return MC_DAMAGED_RESULT_PLACEHOLDER;
    if (state === 'no-card') return R.NoEntry;
    return R.Succeed;
  }

  /** The stub's `setMcCommandResultLocked` (:604-624): the result kept for Sync; a negative one prints its line. */
  private finish(cmd: number, result: number, port?: number): number {
    this.lastCmd = cmd;
    this.lastResult = result;
    this.pending = true;
    if (result < R.Succeed) {
      // The stub names port 0's card folder whatever the port (:620-621); here, slot 1's key.
      this.log(`[mc] command ${cmd} FAILED result=${result} (${resultName(result)}) card=${CARD_SLOT_KEYS[0]}`);
    }
    if (port !== undefined) {
      const read = this.slot(port).read();
      this.ports[port]!.seen = { rev: revOf(read), sig: sigOf(read) };
    }
    return result;
  }

  /**
   * One save under PLAT-26's re-read rule: tried at the revision last read; on `changed`, the slot is re-read, and the
   * save is ChangedCard when the card differs from what was last read, else tried once more at the fresh revision.
   */
  private save<T>(port: number, card: CardSlot, op: (rev: CardRev) => CardResult<T>): CardResult<T> | typeof CHANGED {
    const seen = this.ports[port]!.seen;
    const first = op(seen ? seen.rev : revOf(card.read()));
    if (first.ok || first.failure.kind !== 'changed') return first;
    const fresh = card.read();
    if (seen && sigOf(fresh) !== seen.sig) return CHANGED;
    const second = op(revOf(fresh));
    if (!second.ok && second.failure.kind === 'changed') return CHANGED;
    return second;
  }

  /** A save's outcome as the stub's result: `ok` on success, ChangedCard, or the failure's code. */
  private resultOf<T>(r: CardResult<T> | typeof CHANGED, ok: number): number {
    if (r === CHANGED) return R.ChangedCard;
    return r.ok ? ok : this.failureResult(r.failure);
  }

  /** PLAT-25's refusals as the stub's results (research 99 §7.9; research 134 §3). */
  private failureResult(f: CardFailure): number {
    switch (f.kind) {
      case 'no-card': return R.NoEntry;
      case 'unformatted': return R.NoFormat;
      case 'damaged': return MC_DAMAGED_RESULT_PLACEHOLDER;
      case 'changed': return R.ChangedCard;
      case 'full': return R.FullDevice;
      case 'no-entry': return R.NoEntry;
      case 'not-empty': return R.NotEmpty;
      // A file where a folder is wanted or the reverse (the stub's Mkdir over a file, :1308); a name the card refuses
      // (an unsafe path, :1298-1300); a write the storage refused (the stub's ferror, :1685).
      case 'wrong-kind': case 'invalid': case 'too-large': case 'write-failed': return R.DeniedPermit;
    }
  }

  private kindAt(card: CardSlot, cp: string): 'file' | 'dir' | undefined {
    if (cp === '') return 'dir';
    const stat = card.stat(cp);
    return stat.ok ? stat.value.kind : undefined;
  }

  /** The next free handle from 1 (`allocateMcFdLocked`, :669-684). */
  private allocateFd(): number {
    for (;;) {
      if (this.nextFd <= 0 || this.nextFd > 0x7fffffff) this.nextFd = 1;
      const fd = this.nextFd++;
      if (!this.files.has(fd)) return fd;
    }
  }
}

// ---- helpers ----

/** `mcResultName` (:588-602). */
function resultName(result: number): string {
  switch (result) {
    case R.Succeed: return 'Succeed';
    case R.ChangedCard: return 'ChangedCard';
    case R.NoFormat: return 'NoFormat';
    case R.FullDevice: return 'FullDevice';
    case R.NoEntry: return 'NoEntry';
    case R.DeniedPermit: return 'DeniedPermit';
    case R.NotEmpty: return 'NotEmpty';
    case R.UpLimitHandle: return 'UpLimitHandle';
    default: return 'unknown';
  }
}

/** `fillMcDirTableEntry` (:529-546): readable, writeable, file or folder, closed, exists; the name cut to 31. */
function dirEntry(name: string, isDir: boolean, size: number, mtime: number): McDirEntry {
  return {
    name: name.slice(0, MC_ENTRY_NAME_MAX),
    attr: MC_ATTR.Readable | MC_ATTR.Writeable | (isDir ? MC_ATTR.Subdir : MC_ATTR.File) | MC_ATTR.Closed | MC_ATTR.Exists,
    size: isDir ? 0 : size,
    mtime,
  };
}

/** `wildcardMatch` (:548-585): `?` one character, `*` any run, everything else exact. */
export function wildcardMatch(pattern: string, value: string): boolean {
  let p = 0;
  let v = 0;
  let star = -1;
  let match = 0;
  while (v < value.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === value[v])) {
      p++;
      v++;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++;
      match = v;
    } else if (star !== -1) {
      p = star + 1;
      v = ++match;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

/** `isSafeMcPathComponent` (:750-758): not empty, no `:`, not ending in a space or a dot. */
function isSafeMcPathComponent(part: string): boolean {
  if (part === '' || part.includes(':')) return false;
  const last = part[part.length - 1];
  return last !== ' ' && last !== '.';
}

/** `splitMcPathComponents` (:345-371), after the backslashes are slashes: the non-empty parts. */
function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

function parentOf(cp: string): string {
  const i = cp.lastIndexOf('/');
  return i < 0 ? '' : cp.slice(0, i);
}

function nameOf(cp: string): string {
  return cp.slice(cp.lastIndexOf('/') + 1);
}

function revOf(read: SlotRead): CardRev {
  return read.kind === 'record' ? read.record.rev : null;
}

/** The card's content as the re-read rule compares it: present, formatted, files and folders (not `ext`, not `rev`). */
function sigOf(read: SlotRead): string {
  if (read.kind !== 'record') return read.kind;
  const r = read.record;
  return JSON.stringify([r.present, r.formatted, r.files, r.dirs]);
}
