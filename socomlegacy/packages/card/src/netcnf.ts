/**
 * The saved network configuration on the virtual card (ONL-01a, the online path's card slice of ONL-01; research 136).
 *
 * The console: EDIT NETWORK CONFIGURATIONS runs Sony's set-up program (`SCUSNGUI.ELF`), which saves the configuration
 * to the card (PC research 18:153-160); LOGIN (`dlgNetLogin`) lists it through `NetCnfOpen(mc0:|mc1:)` (`FUN_00277dd0`,
 * D:L123168-123237), which asks the eznetcnf IOP module for the card's combination list (RPC function 1, `FUN_001e8740`
 * D:L48670) and turns each entry into a `NETCNF_DB` row (research 128 R128.5). The module reads the card through Sony's
 * netcnf library (`RUN/IRX/EZNETCNF.IRX` imports `sceNetCnfGetCount`, `sceNetCnfGetList`, `sceNetCnfLoadEntry` from
 * `RUN/IRX/NETCNF.IRX`), whose strings name the card's layout: the folder `/BWNETCNF`, the index `/BWNETCNF/BWNETCNF`
 * with one `%d,%d,%s,%s` line an entry (type, state, file, name), the files `%snet%03d%s`, `%sifc%03d%s`,
 * `%sdev%03d%s` (`.cnf` or `.dat`), and the icons `SYS_NET.ICO` and `icon.sys`.
 *
 * Here (OC-1 ruled the console's way, OT.R3): the same folder and files, with the sizes a card the set-up program
 * wrote lists (research 136 §1), their `data` our JSON (R7) -- the index's lines, the combination's `interface` line,
 * the attachments' settings -- and, a browser adaptation with no original, our central server in the interface
 * settings' file, where the console's DNS settings lead to a server (OT.R3: "can skip some of the DNS settings since
 * we have a central host"). `ensureNetCnf` writes it at first use when the card has no index (the original never
 * writes it from the game: the write is OT.R3's, and nothing is drawn for it). `netCnfCombinationList` is eznetcnf's
 * answer read back from the card through PLAT-26a's libmc, and `netCnfOpen` / `netCnfRows` the rows `NetCnfOpen`
 * builds from it: the path LOGIN (ONL-01) takes. The screen is ONL-01's.
 */
import { CARD_TOTAL_CLUSTERS, clustersFor } from './cardSlots';
import { FIO, MC_ATTR, MC_RESULT, type Libmc } from './libmc';

/** The folder and the index (`NETCNF.IRX` strings `/BWNETCNF` and `/BWNETCNF/BWNETCNF`). */
export const NETCNF_DIR = '/BWNETCNF';
export const NETCNF_INDEX_PATH = '/BWNETCNF/BWNETCNF';

/** An index line (`%d,%d,%s,%s`): 0 a combination, 1 an interface (ifc), 2 a device (dev); its state; its file; its name. */
export interface NetCnfIndexEntry {
  readonly type: 0 | 1 | 2;
  readonly stat: number;
  readonly file: string;
  readonly name: string;
}

/** A combination's `interface` line: its name and the ifc and dev files it joins. */
export interface NetCnfInterface {
  readonly name: string;
  readonly ifc: string;
  readonly dev: string;
}

/**
 * The attachments' settings: the device from the disc's `DEV002.CNF` (`vendor "SCE"`, `product "Ethernet (Network
 * Adaptor)"`, `phy_config auto`), the interface `type nic`, `dhcp` (the disc's `IFC005.CNF`, the template NET005.CNF pairs with
 * `DEV002.CNF`; `NET003`'s pair is generic Ethernet, `IFC003.CNF` `type eth`) -- the choices PC research 18 c
 * made in the set-up program (Ethernet, automatic address and DNS). [reading] The card's `ifc000.dat` and `dev000.dat`
 * (netcnf's `.dat` encoding) were decoded by research wave C8 #5 from the original program's own write: `ifc000.dat`
 * is `type nic` + `dhcp` (not `eth`, which is `IFC003.CNF`'s, the generic-Ethernet pair; ours is `IFC005.CNF`'s), `dev000.dat` as below. Earlier builds wrote
 * `type eth`; a card holding that is read as it stands (nothing here validates the type) and never rewritten.
 * Nothing reads them here but the server.
 */
export const NETCNF_ATTACH_CONTENTS_READING = {
  ifc: { type: 'nic', dhcp: true },
  dev: { type: 'nic', vendor: 'SCE', product: 'Ethernet (Network Adaptor)', phy_config: 'auto' },
} as const;

/** The index's lines as the card holds them (research 136 §1). */
const INDEX_ENTRIES: readonly NetCnfIndexEntry[] = [
  { type: 0, stat: 1, file: 'net000.cnf', name: 'Combination1' },
  { type: 1, stat: 1, file: 'ifc000.dat', name: 'Setting 1' },
  { type: 2, stat: 1, file: 'dev000.dat', name: 'SCE/Ethernet (Network Adaptor)' },
];

/** One file of the folder: its name, its nominal size (the card's), and our JSON (the ifc's server added at the write). */
export interface NetCnfFile {
  readonly name: string;
  readonly size: number;
  readonly data: unknown;
}

/**
 * The folder's six files in the order the card's directory lists them, each the size it lists (mymcplus over the PC
 * project's PCSX2 card `tools/pcsx2/memcards/Mcd001.ps2`, PC research 18 c, and its copy in `pcsx2_b`; research 136
 * §1). The icons are the disc's `CNF/SYS_NET.ICO` and `CNF/ICON.SYS`, byte counts equal; the index's and the
 * combination's sizes are their text's length (the test holds both).
 */
export const NETCNF_FILES: readonly NetCnfFile[] = [
  { name: 'SYS_NET.ICO', size: 33_688, data: null },
  { name: 'icon.sys', size: 964, data: null },
  { name: 'dev000.dat', size: 113, data: NETCNF_ATTACH_CONTENTS_READING.dev },
  { name: 'BWNETCNF', size: 99, data: { entries: INDEX_ENTRIES } },
  { name: 'ifc000.dat', size: 52, data: NETCNF_ATTACH_CONTENTS_READING.ifc },
  { name: 'net000.cnf', size: 100, data: { interface: { name: 'ifc000.dat + dev000.dat', ifc: 'ifc000.dat', dev: 'dev000.dat' } } },
];

/** The index as the original's text: one `%d,%d,%s,%s` line an entry (`NETCNF.IRX`), as the card's `BWNETCNF` reads. */
export function netCnfIndexText(entries: readonly NetCnfIndexEntry[]): string {
  return entries.map((e) => `${e.type},${e.stat},${e.file},${e.name}\n`).join('');
}

/** A combination file as the original's text: Sony's header line, a blank line, `interface "%S" "%S" "%S"`. */
export function netCnfNetText(i: NetCnfInterface): string {
  return `# <Sony Computer Entertainment Inc.>\n\ninterface "${i.name}" "${i.ifc}" "${i.dev}"\n`;
}

/**
 * eznetcnf's entry as the EE reads it (research 128 §2.4: +0 the flags, +8 the key, +0x28 the name, +0x48 the third
 * column), and `server`, ours (OT.R3).
 */
export interface NetCnfEntry {
  readonly flags: number;
  /** The combination's key, which `NetCnfCurrCombo` compares and `NetCnfSelectCombo` hands to RPC function 2. */
  readonly key: string;
  /** The row's name. */
  readonly name: string;
  /** The HARDWARE line. */
  readonly hardware: string;
  /** Our central server, from the interface settings' file: a browser adaptation, not in the original's entry. */
  readonly server?: string;
}

/**
 * Which name fills which column: the key is the combination's (index type 0), the row's name its interface's (type 1),
 * the HARDWARE line its device's (type 2), each through the `interface` line's files. [reading] eznetcnf's
 * `getCombinationList` / `getDisplayName` (its symbols) were not decompiled; the capture `A_31` shows "1 Setting 1" and
 * "SCE/Ethernet (Network Adaptor)" from a card whose index names exactly these (research 136 §2), and RPC function 2
 * takes the key as a combination's name (the recomp's notes, `eznetcnf.cpp:14-15`).
 */
export const NETCNF_COLUMNS_READING = true;

/** An entry's flags: 0. [reading] The EE rows an entry when they are not negative (D:L123220); eznetcnf's value is not read. */
export const NETCNF_ENTRY_FLAGS_READING = 0;

/**
 * A card with no index is an empty list (count 0: `NetCnfOpen` succeeds, `TestUIVar(netcnf_db)` is false, #578 / #581).
 * [reading] The capture `A_05` (no configuration on the card) shows #578, not an error; what eznetcnf answers for the
 * missing file is not read.
 */
export const NETCNF_NO_INDEX_IS_EMPTY_READING = true;

/**
 * What the list answers for a configuration this module cannot read (an index or a file not our JSON's shape, a file
 * it names missing): -1, which `NetCnfOpen` posts as NETCNF_ERROR with errno 1 (#586, "An error occured while reading
 * Your Network Configuration file"). A libmc failure on a read is passed as it is. Settled by netcnf's own error codes
 * (a read of `NETCNF.IRX`'s loader) -- only -15 (#585, another console's file) is known.
 */
export const NETCNF_MALFORMED_RESULT_PLACEHOLDER = -1;

/** The combination list: `result` the count (0: none), or a failure below 0; the entries in the index's order. */
export interface NetCnfList {
  readonly result: number;
  readonly entries: NetCnfEntry[];
}

/** The `mc0:` / `mc1:` device of `NetCnfOpen`'s argument as a libmc port (0: slot 1, 1: slot 2). */
function portOf(device: string): 0 | 1 {
  const m = /^mc([01]):$/i.exec(device);
  if (!m) throw new TypeError(`a configuration device is mc0: or mc1: (${device})`);
  return m[1] === '0' ? 0 : 1;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isName = (x: unknown): x is string => typeof x === 'string' && x !== '';

/** A file's JSON through libmc as the card layer reads one: Open RDONLY, GetDir for its size, Read, Close. */
function readCardFile(mc: Libmc, port: 0 | 1, path: string): { result: number; data?: unknown } {
  const fd = mc.open(port, 0, path, FIO.O_RDONLY);
  if (fd < 0) return { result: fd };
  const dir = mc.getDir(port, 0, path, 1);
  const size = dir.result > 0 ? dir.entries[0]!.size : 0;
  const read = size > 0 ? mc.read(fd, size) : { result: 0, data: undefined };
  const closed = mc.close(fd);
  const failed = [dir.result, read.result, closed].find((r) => r < 0);
  if (failed !== undefined) return { result: failed };
  return { result: MC_RESULT.Succeed, data: read.data };
}

function indexOf(data: unknown): NetCnfIndexEntry[] | undefined {
  if (!isObject(data) || !Array.isArray(data.entries)) return undefined;
  const out: NetCnfIndexEntry[] = [];
  for (const e of data.entries) {
    if (!isObject(e) || (e.type !== 0 && e.type !== 1 && e.type !== 2) || !Number.isSafeInteger(e.stat) || !isName(e.file) || !isName(e.name)) {
      return undefined;
    }
    out.push({ type: e.type, stat: e.stat as number, file: e.file, name: e.name });
  }
  return out;
}

/**
 * eznetcnf's combination list for `device` (`mc0:` or `mc1:`), read from the card's index and the files it names
 * through libmc. Writes nothing.
 */
export function netCnfCombinationList(mc: Libmc, device: string): NetCnfList {
  const port = portOf(device);
  const index = readCardFile(mc, port, `${device}${NETCNF_INDEX_PATH}`);
  if (index.result === MC_RESULT.NoEntry && NETCNF_NO_INDEX_IS_EMPTY_READING) return { result: 0, entries: [] };
  if (index.result < 0) return { result: index.result, entries: [] };
  const lines = indexOf(index.data);
  const malformed: NetCnfList = { result: NETCNF_MALFORMED_RESULT_PLACEHOLDER, entries: [] };
  if (!lines) return malformed;
  const entries: NetCnfEntry[] = [];
  for (const combo of lines.filter((l) => l.type === 0)) {
    const net = readCardFile(mc, port, `${device}${NETCNF_DIR}/${combo.file}`);
    if (net.result < 0) return net.result === MC_RESULT.NoEntry ? malformed : { result: net.result, entries: [] };
    const iface = isObject(net.data) && isObject(net.data.interface) ? net.data.interface : undefined;
    if (!iface || !isName(iface.ifc) || !isName(iface.dev)) return malformed;
    const ifc = lines.find((l) => l.type === 1 && l.file === iface.ifc);
    const dev = lines.find((l) => l.type === 2 && l.file === iface.dev);
    if (!ifc || !dev) return malformed;
    const settings = readCardFile(mc, port, `${device}${NETCNF_DIR}/${ifc.file}`);
    if (settings.result < 0) return settings.result === MC_RESULT.NoEntry ? malformed : { result: settings.result, entries: [] };
    const server = isObject(settings.data) && isName(settings.data.server) ? settings.data.server : undefined;
    entries.push({
      flags: NETCNF_ENTRY_FLAGS_READING, key: combo.name, name: ifc.name, hardware: dev.name,
      ...(server === undefined ? {} : { server }),
    });
  }
  return { result: entries.length, entries };
}

/**
 * The row's name as `NetCnfOpen` formats it: `%s` when shorter than 31 characters, else `%.32s...` (the format strings
 * at 0x3eebc8 and 0x3eebb8, D:L123214-123219; the length by `FUN_00199288`, its argument lost in the decompilation).
 */
export function netCnfDisplayName(name: string): string {
  return name.length < 31 ? name : `${name.slice(0, 32)}...`;
}

/** A row of `NETCNF_DB`: the entry's number, its name, the HARDWARE line (research 128 R128.5). */
export type NetCnfRow = readonly [number: string, name: string, hardware: string];

/** What `NetCnfOpen` leaves: the rows, or a NETCNF_ERROR with its errno and the popup `OnNetCnfError` shows. */
export type NetCnfOpen =
  | { readonly ok: true; readonly rows: NetCnfRow[] }
  | { readonly ok: false; readonly rows: NetCnfRow[]; readonly errno: number; readonly message: 585 | 586 };

/**
 * `NetCnfOpen`'s rows from a combination list (`FUN_00277dd0`, D:L123192-123227): below 0, NETCNF_ERROR with errno
 * the negated result (#585 for 15, else #586, research 128 §2.3) and an empty list; 0, an empty list; else one row an
 * entry whose flags are not negative, numbered by its place among all entries (i + 1).
 */
export function netCnfRows(list: NetCnfList): NetCnfOpen {
  if (list.result < 0) {
    const errno = -list.result;
    return { ok: false, rows: [], errno, message: errno === 15 ? 585 : 586 };
  }
  if (list.result === 0) return { ok: true, rows: [] };
  const rows: NetCnfRow[] = [];
  list.entries.forEach((e, i) => {
    if (e.flags >= 0) rows.push([String(i + 1), netCnfDisplayName(e.name), e.hardware]);
  });
  return { ok: true, rows };
}

/** `NetCnfOpen(device)`: the list read from the card, as LOGIN's rows. */
export function netCnfOpen(mc: Libmc, device: string): NetCnfOpen {
  return netCnfRows(netCnfCombinationList(mc, device));
}

/** What the first-use write did: written or not, and the result (Succeed, or the libmc failure that stopped it). */
export interface NetCnfEnsure {
  readonly result: number;
  readonly written: boolean;
}

/**
 * The write at first use (OT.R3; no original: the game never writes the configuration): when the card in `port` has no
 * index, the folder and its six files, the interface settings naming `server`. A card with an index is left as it is
 * -- read, never rewritten, whatever it holds -- except an index of 0 bytes, which only this write leaves (its Open
 * CREAT makes the file before its Write, libmc's Open; every index written here is 99 bytes): that is a write cut short,
 * and is written again. The space is checked first, as netcnf checks it (`NETCNF.IRX`'s `-no_check_capacity` turns its
 * check off): a card without room for what is still missing gets nothing, FullDevice; a file a cut-short write left is
 * rewritten in place (TRUNC), so only the clusters it lacks count. The index is written last, so a write cut short
 * leaves no index, or an empty one, and is made whole at the next first use. (The card's own order -- the listing's --
 * is not observable here: the stub's GetDir sorts by name.)
 */
export function ensureNetCnf(mc: Libmc, port: 0 | 1, server: string): NetCnfEnsure {
  if (!isName(server)) throw new TypeError('the configuration names a server (a non-empty string)');
  // A folder lists its `.` (one entry); a missing one is NoEntry (its parent's pattern matches nothing: 0).
  const dir = mc.getDir(port, 0, NETCNF_DIR, 1);
  if (dir.result < 0 && dir.result !== MC_RESULT.NoEntry) return { result: dir.result, written: false };
  const dirMissing = dir.result <= 0;
  // What each of the six files already holds on the card: its size, or none.
  const held = new Map<string, number>();
  if (!dirMissing) {
    for (const f of NETCNF_FILES) {
      const got = mc.getDir(port, 0, `${NETCNF_DIR}/${f.name}`, 1);
      if (got.result < 0 && got.result !== MC_RESULT.NoEntry) return { result: got.result, written: false };
      const e = got.result > 0 ? got.entries[0]! : undefined;
      if (e && (e.attr & MC_ATTR.Subdir) === 0) held.set(f.name, e.size);
    }
  }
  if ((held.get('BWNETCNF') ?? 0) > 0) return { result: MC_RESULT.Succeed, written: false };
  const info = mc.getInfo(port, 0);
  if (info.result < 0) return { result: info.result, written: false };
  const needed = (dirMissing ? 1 : 0)
    + NETCNF_FILES.reduce((n, f) => n + Math.max(0, clustersFor(f.size) - clustersFor(held.get(f.name) ?? 0)), 0);
  if (needed > Math.min(info.free, CARD_TOTAL_CLUSTERS)) return { result: MC_RESULT.FullDevice, written: false };
  const made = mc.mkdir(port, 0, NETCNF_DIR);
  if (made < 0) return { result: made, written: false };
  const index = NETCNF_FILES.find((f) => f.name === 'BWNETCNF')!;
  for (const f of [...NETCNF_FILES.filter((x) => x !== index), index]) {
    const data = f.name === 'ifc000.dat' ? { ...NETCNF_ATTACH_CONTENTS_READING.ifc, server } : f.data;
    const fd = mc.open(port, 0, `${NETCNF_DIR}/${f.name}`, FIO.O_WRONLY | FIO.O_CREAT | FIO.O_TRUNC);
    if (fd < 0) return { result: fd, written: false };
    const wrote = mc.write(fd, f.size, data);
    const closed = mc.close(fd);
    if (wrote < 0) return { result: wrote, written: false };
    if (closed < 0) return { result: closed, written: false };
  }
  return { result: MC_RESULT.Succeed, written: true };
}
