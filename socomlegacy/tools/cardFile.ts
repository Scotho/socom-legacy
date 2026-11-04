/**
 * The card file reader -- a DEV INSTRUMENT for reading what the original game persisted on a real memory card (web
 * research 102; the owner's ruling R7, 2026-10-01, `docs/specs/2026-10-01-web-r7-account-and-card-design.md` section 7
 * item 1). The port reads and writes no card byte format: R7 dropped PLAT-27, whose codec was built and merged
 * (1c20d326) the same day; its read side lives on here, outside the shipped packages, and its writers were deleted. It
 * is for checking what the game really saved against real cards (PLAT-06's `PersistentValves.rdr`, `dialogInventory.ts`
 * `persistentValvesOf`), and for a possible one-way importer of a real save later, which needs only readers.
 *
 * NOTHING UNDER `packages/` MAY IMPORT THIS FILE (`tools/test/packageBoundaries.test.ts` rule (c)).
 *
 * What it reads, each the game's own layout (PC research 80-persona-card-format steps 3-5; the Python reference
 * `tools_py/card_save.py`, both in the PC project):
 * - the unscrambler (`FUN_0033de00`; research 102 section 1);
 * - the ZAR V2 archive losslessly: the key tree with each key's bytes, and the layout the tree does not say
 *   (`readZarTree`; research 102 section 2), with `zarExtents` accounting for every byte of the file;
 * - the flattened rdr losslessly: every node's type and flags byte, the float (type 2) included (`readRdrTree`;
 *   research 102 section 3), with `rdrExtents` accounting for every byte;
 * - the save file: `zSaveHeader` and the module list (`readSaveFile`, `findSaveKey`, `saveModules`; section 4);
 * - the persona records of `CAcctDB/AcctInfo.rdr` (`readPersonas`, `readCardFile`; section 5).
 * It builds on `@s2u/archive`'s readers (`Zar.parse`, `Reader`) and changes none of them.
 *
 * What the extents do NOT check (the PLAT-27 move's review, F1). Their tiling checks structure -- every byte of a file
 * belongs to exactly one region and every node and name is reached -- not decoded values or data content: a key read
 * a few bytes long into its alignment gap, an int read with the wrong value, an int node read as a float, a flags byte
 * dropped, or a wrong copy of a key's data all still tile. The byte-equal round trip that would catch them needed the
 * writers R7 deleted. Value fidelity on real files rests instead on (i) this reader being the code of `1c20d326`,
 * unchanged, where the byte-equal round trip of all 76 game-written files was verified; (ii) the hand-built known
 * answers of `tools/test/cardFile.test.ts` (each key's bytes, keys ending inside and exactly on an alignment boundary,
 * every node's type, value and flags); (iii) `tools/test/cardFileDev.test.ts`'s comparison with `card_save.py` of every
 * key's bytes, every decoded rdr value and every persona field on the 76 files, and PLAT-06's 65 valve names.
 */
import { Reader, RDR_VISIT_FACTOR, Zar, ZAR_HEAD, type ZarKey } from '@s2u/archive';

// ---- The unscrambler (research 102 section 1) ----

/** The forward pass's seed (`sub_0033DC30` L239040; `FUN_0033de00` L239104). */
export const SCRAMBLE_SEED = 0x96;

/**
 * The game's `FUN_0033de00` (decompilation L239091-239136) over a copy: the card's bytes in, the plain archive out. The
 * backward pass first, seeded by the last byte and advancing `k = k ^ ((k + v) & 0xff)` with the byte it produced, then
 * the forward pass from `SCRAMBLE_SEED`. Byte arithmetic, so the original's signed reads change nothing.
 */
export function unscramble(card: Uint8Array): Uint8Array {
  const b = card.slice();
  const n = b.length;
  const step = (k: number, p: number): number => (k ^ ((k + p) & 0xff)) & 0xff;
  if (n >= 2) {
    let k = b[n - 1]!;
    for (let i = n - 2; i >= 0; i--) { const v = b[i]! ^ k; b[i] = v; k = step(k, v); }
  }
  let k = SCRAMBLE_SEED;
  for (let i = 0; i < n; i++) { const v = b[i]! ^ k; b[i] = v; k = step(k, v); }
  return b;
}

/** A labelled byte range `[start, end)` of a file, for the accounting functions. */
export interface Extent { start: number; end: number; what: string }

/** The NUL-terminated strings of a table at `at`, `size` bytes: each one's offset in the table and its length with the NUL. */
function tableStrings(bytes: Uint8Array, at: number, size: number): { ofs: number; len: number }[] {
  const out: { ofs: number; len: number }[] = [];
  let s = 0;
  for (let i = 0; i < size; i++) if (bytes[at + i] === 0) { out.push({ ofs: s, len: i + 1 - s }); s = i + 1; }
  if (s < size) out.push({ ofs: s, len: size - s });
  return out;
}

// ---- ZAR V2, losslessly (research 102 section 2) ----

/** A key with a copy of its bytes. The root's name is never stored (its name pointer is null). */
export interface ZarNode { name: string; data: Uint8Array; children: ZarNode[] }

/** What a ZAR file says beyond its key tree. */
export interface ZarLayout {
  /** Head word 23: 14 in `BASCUS-97275SOCOMII`, 12 in `SaveGame<n>` (PC research 80 step 4). */
  appVersion: number;
  /** Head word 4: the data blob and every key's data start on a multiple of it; the saves hold 16. */
  padding: number;
  /** Head word 22; 0 in every save. */
  crc: number;
  /** Head word 3: the address the string table was packed at -- a guest heap address from the game, 0 from the PC launcher. */
  stableOfs: number;
  /** The string table starts with an empty name (the PC launcher's `build_zar`; never the game's). */
  emptyNameFirst: boolean;
  /** The byte in the alignment gaps: `ZAR_SAVE_FILL` from the game, 0 from the PC launcher. */
  fill: number;
}

/**
 * The byte the game's ZAR writer pads with: `FUN_00257590` (called by the archive write `FUN_00258bd0`; decompilation
 * L104077-104078) fills its alignment buffer with `0xAF`; every gap in the 75 game-written files is 0xAF (research 102 §2).
 */
export const ZAR_SAVE_FILL = 0xaf;

/**
 * An archive read losslessly: the key tree with copies of each key's bytes, and the layout. Refuses a head word 5-20
 * that is not zero (all zero in every save), so a file read here holds nothing the tree and the layout do not say.
 */
export function readZarTree(bytes: Uint8Array): { root: ZarNode; layout: ZarLayout } {
  const zar = Zar.parse(bytes);
  const r = new Reader(bytes);
  for (let o = 20; o < 84; o += 4) {
    if (r.u32(o) !== 0) throw new Error(`ZAR head word at ${o} is ${r.u32(o)}: every save holds 0 there`);
  }
  const stableSize = r.u32(8), padding = r.u32(16);
  const toNode = (k: ZarKey): ZarNode => ({ name: k.name, data: zar.data(k).slice(), children: k.children.map(toNode) });
  // The fill: the first gap byte -- after the keys, else after a key's data -- or the game's when there is none.
  const keysEnd = ZAR_HEAD + stableSize + 16 * zar.keyCount;
  let fill: number | undefined = keysEnd < zar.dataOffset ? r.u8(keysEnd) : undefined;
  zar.walk((k) => {
    const end = k.offset + k.size;
    if (fill === undefined && k.size > 0 && end % padding !== 0) fill = r.u8(zar.dataOffset + end);
  });
  return {
    root: toNode(zar.root),
    layout: {
      appVersion: r.u32(92), padding, crc: r.u32(88), stableOfs: r.u32(12),
      emptyNameFirst: stableSize > 0 && r.u8(ZAR_HEAD) === 0, fill: fill ?? ZAR_SAVE_FILL,
    },
  };
}

/**
 * Every byte of an archive, labelled: `head` (100 B), each `name` of the string table (`name (unreferenced)` when no
 * key's pointer, the root's null one included, points at it), `keys`, each key's `data <path>`, the `gap`s between, and
 * `tail` for bytes past the head's data size. A file the game wrote tiles with names, keys, data and gaps only.
 */
export function zarExtents(bytes: Uint8Array): Extent[] {
  const zar = Zar.parse(bytes);
  const r = new Reader(bytes);
  const stableSize = r.u32(8), stableOfs = r.u32(12), keysAt = ZAR_HEAD + stableSize, keysEnd = keysAt + 16 * zar.keyCount;
  const pointed = new Set<number>();
  for (let i = 0; i < zar.keyCount; i++) pointed.add(r.i32(keysAt + 16 * i) - stableOfs);
  const out: Extent[] = [{ start: 0, end: ZAR_HEAD, what: 'head' }];
  for (const s of tableStrings(bytes, ZAR_HEAD, stableSize)) {
    out.push({ start: ZAR_HEAD + s.ofs, end: ZAR_HEAD + s.ofs + s.len, what: pointed.has(s.ofs) ? 'name' : 'name (unreferenced)' });
  }
  out.push({ start: keysAt, end: keysEnd, what: 'keys' });
  const data: Extent[] = [];
  const walk = (k: ZarKey, path: string): void => {
    if (k.size > 0) data.push({ start: zar.dataOffset + k.offset, end: zar.dataOffset + k.offset + k.size, what: `data ${path}` });
    for (const c of k.children) walk(c, path ? `${path}/${c.name}` : c.name);
  };
  walk(zar.root, '');
  data.sort((a, b) => a.start - b.start);
  const blobEnd = Math.min(bytes.length, zar.dataOffset + r.u32(84));
  let at = keysEnd;
  for (const d of data) {
    if (d.start > at) out.push({ start: at, end: d.start, what: 'gap' });
    out.push(d);
    at = Math.max(at, d.end);
  }
  if (blobEnd > at) { out.push({ start: at, end: blobEnd, what: 'gap' }); at = blobEnd; }
  if (bytes.length > at) out.push({ start: at, end: bytes.length, what: 'tail' });
  return out;
}

// ---- The flattened rdr, losslessly (research 102 section 3) ----

/** A node of a flattened rdr tree with its type and its flags byte (the second byte of the node word). */
export type RdrValue =
  | { type: 'int'; value: number; flags: number }
  | { type: 'float'; value: number; flags: number }
  | { type: 'string'; value: string; flags: number }
  | { type: 'list'; items: RdrValue[]; flags: number };

/** The flags value of a list whose children are an earlier block of equal nodes (PC research 80 step 5; research 102 §3). */
export const RDR_FLAG_SHARED = 4;

// Research 36 section 6; `@s2u/archive` `rdr.ts` holds the same codes and the same cap for the scripts' reader.
const TYPE_INT = 1, TYPE_FLOAT = 2, TYPE_STRING = 3, TYPE_LIST = 4;
const STRINGS_AT = 12, NODE_SIZE = 8, MAX_DEPTH = 64;

/** Walks an rdr file's nodes from node 0 under `parseRdr`'s limits (the depth cap and the visit budget). */
function walkRdr<T>(bytes: Uint8Array, visit: (at: number, type: number, flags: number, length: number, kids: () => T[]) => T): T {
  const r = new Reader(bytes);
  const version = r.u32(0);
  if (version !== 1) throw new Error(`rdr version ${version}, expected 1`);
  const nodesAt = r.u32(8);
  const budget = RDR_VISIT_FACTOR * Math.max(0, Math.floor((bytes.length - nodesAt) / NODE_SIZE));
  let visited = 0;
  const node = (byteOfs: number, depth: number): T => {
    if (depth > MAX_DEPTH) throw new Error(`rdr nesting deeper than ${MAX_DEPTH} at node byte ${byteOfs}`);
    if (++visited > budget) throw new Error(`rdr walks more than ${budget} nodes (${RDR_VISIT_FACTOR}x its node array) at node byte ${byteOfs}`);
    const at = nodesAt + byteOfs;
    const type = r.u8(at), flags = r.u8(at + 1), length = r.u16(at + 2), value = r.u32(at + 4);
    const kids = (): T[] => Array.from({ length }, (_, i) => node(value + NODE_SIZE * i, depth + 1));
    return visit(at, type, flags, length, kids);
  };
  return node(0, 0);
}

/** Reads a flattened rdr file as a typed tree, every node's flags kept. */
export function readRdrTree(bytes: Uint8Array): RdrValue {
  const r = new Reader(bytes);
  const stringTableSize = bytes.length >= 12 ? r.u32(4) : 0;
  return walkRdr<RdrValue>(bytes, (at, type, flags, _length, kids) => {
    switch (type) {
      case TYPE_INT: return { type: 'int', value: r.i32(at + 4), flags };
      case TYPE_FLOAT: return { type: 'float', value: r.f32(at + 4), flags };
      case TYPE_STRING: {
        const value = r.u32(at + 4);
        if (value >= stringTableSize) throw new Error(`rdr string at ${value} outside the ${stringTableSize}-byte table`);
        return { type: 'string', value: r.cstr(STRINGS_AT + value, stringTableSize - value), flags };
      }
      case TYPE_LIST: return { type: 'list', items: kids(), flags };
      default: throw new Error(`rdr node type ${type} at node byte ${at - r.u32(8)}`);
    }
  });
}

/**
 * Every byte of an rdr file, labelled: `head` (12 B), each `string` of the table (`string (unreferenced)` when no
 * string node points at its start), the `pad` up to the node array, each `node` (`node (unreached)` when the walk from
 * node 0 never visits it), and `tail` for a partial node at the end. A file the game wrote tiles with no qualifier.
 */
export function rdrExtents(bytes: Uint8Array): Extent[] {
  const r = new Reader(bytes);
  const stringTableSize = r.u32(4), nodesAt = r.u32(8);
  const reached = new Set<number>(), referenced = new Set<number>();
  walkRdr<void>(bytes, (at, type, _flags, _length, kids) => {
    reached.add(at);
    if (type === TYPE_STRING) referenced.add(r.u32(at + 4));
    if (type === TYPE_LIST) kids();
  });
  const out: Extent[] = [{ start: 0, end: STRINGS_AT, what: 'head' }];
  for (const s of tableStrings(bytes, STRINGS_AT, stringTableSize)) {
    out.push({ start: STRINGS_AT + s.ofs, end: STRINGS_AT + s.ofs + s.len, what: referenced.has(s.ofs) ? 'string' : 'string (unreferenced)' });
  }
  if (nodesAt > STRINGS_AT + stringTableSize) out.push({ start: STRINGS_AT + stringTableSize, end: nodesAt, what: 'pad' });
  let at = nodesAt;
  for (; at + NODE_SIZE <= bytes.length; at += NODE_SIZE) out.push({ start: at, end: at + NODE_SIZE, what: reached.has(at) ? 'node' : 'node (unreached)' });
  if (at < bytes.length) out.push({ start: at, end: bytes.length, what: 'tail' });
  return out;
}

// ---- The save file (research 102 section 4) ----

/** `zSaveHeader`'s size: the loader reads 0x10c bytes (`FUN_0033d4a0` L238861); its first word says 268 too. */
export const SAVE_HEADER_BYTES = 268;
export const SAVE_HEADER_KEY = 'zSaveHeader';
export const SAVE_MODULE_LIST_KEY = 'CSaveModuleList';

/** A save file read: the key tree and the layout. */
export interface SaveFile { root: ZarNode; layout: ZarLayout }

/**
 * The card's bytes to the save's tree: unscramble, then read the archive -- as the loader's header read
 * `FUN_0033d4a0` (L238832-238874) does (unscramble at L238851, the archive opened with padding 0x10 at L238857).
 */
export function readSaveFile(card: Uint8Array): SaveFile {
  return readZarTree(unscramble(card));
}

/** `zSaveHeader`: `{u32 268, u32 version}` then 260 bytes the game fills per run (PC research 80), kept as they are. */
export interface SaveHeader { size: number; version: number; rest: Uint8Array }

export function decodeSaveHeader(bytes: Uint8Array): SaveHeader {
  if (bytes.length !== SAVE_HEADER_BYTES) throw new Error(`zSaveHeader is ${bytes.length} bytes, expected ${SAVE_HEADER_BYTES}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { size: dv.getUint32(0, true), version: dv.getUint32(4, true), rest: bytes.slice(8) };
}

/** A key by its path from the root, names matched exactly: `CSaveModuleList/CAcctDB/AcctInfo.rdr`. */
export function findSaveKey(file: SaveFile, path: string): ZarNode | undefined {
  let k: ZarNode | undefined = file.root;
  for (const part of path.split('/')) k = k?.children.find((c) => c.name === part);
  return k;
}

export function saveHeader(file: SaveFile): SaveHeader {
  const k = findSaveKey(file, SAVE_HEADER_KEY);
  if (!k) throw new Error(`the save has no ${SAVE_HEADER_KEY}`);
  return decodeSaveHeader(k.data);
}

/** The save modules, in the order the file holds them: `CSaveModuleList`'s children. */
export function saveModules(file: SaveFile): ZarNode[] {
  return findSaveKey(file, SAVE_MODULE_LIST_KEY)?.children ?? [];
}

// ---- The persona records (research 102 section 5) ----

/** One record of `AcctInfo.rdr`, as `card_save.py` `read_personas` returns it (PC research 80 step 5). */
export interface Persona {
  /** The resolved address the game connected to (PC research 80: the per-server discriminator). */
  host: string;
  name: string;
  town: string;
  gender: number;
  port: number;
  /** Plain on the original card. */
  password: string;
  /** 1 or 0. */
  savePassword: number;
  /** `PROFILES`' `PROFILE_CHECKSUM` list: 16 ints on every card seen. */
  profileChecksum: number[];
  /** `PROFILES`' `PROFILE_INFO` list: empty on every card seen. */
  profileInfo: RdrValue[];
}

/** The port a record without `PORT` reads as, and the one every card seen holds (`card_save.py` `read_personas`). */
export const PERSONA_DEFAULT_PORT = 10075;
export const ACCT_INFO_PATH = 'CSaveModuleList/CAcctDB/AcctInfo.rdr';

/** A node as `card_save.py`'s `value_of` returns it: a number, a string, or a list of them. */
type Plain = number | string | Plain[];
const plain = (v: RdrValue): Plain => (v.type === 'list' ? v.items.map(plain) : v.value);

/** The records of an `AcctInfo.rdr` blob, one 16-node record a persona; a blob shorter than the rdr header holds none. */
export function readPersonas(acct: Uint8Array): Persona[] {
  if (acct.length < 12) return [];
  const root = readRdrTree(acct);
  if (root.type !== 'list') throw new Error(`AcctInfo.rdr's root is a ${root.type}, expected the list of records`);
  return root.items.map((rec) => {
    if (rec.type !== 'list') throw new Error(`AcctInfo.rdr record is a ${rec.type}, expected a list`);
    const d = new Map<string, Plain>();
    let checksum: Plain = [], info: RdrValue[] = [];
    for (let i = 0; i + 1 < rec.items.length; i += 2) {
      const key = plain(rec.items[i]!), val = rec.items[i + 1]!;
      if (key === 'PROFILES') {
        if (val.type === 'list') {
          checksum = val.items.length > 1 ? plain(val.items[1]!) : [];
          const inf = val.items[3];
          info = inf?.type === 'list' ? inf.items : [];
        }
      } else {
        const p = plain(val);
        d.set(String(key), Array.isArray(p) && p.length === 1 ? p[0]! : p);
      }
    }
    const str = (k: string): string => { const v = d.get(k); return typeof v === 'string' ? v : ''; };
    const num = (k: string, dflt: number): number => { const v = d.get(k); return typeof v === 'number' ? v : dflt; };
    return {
      host: str('HOST'), name: str('NAME'), town: str('TOWN'), gender: num('GENDER', 0), port: num('PORT', PERSONA_DEFAULT_PORT),
      password: str('PASSWORD'), savePassword: num('SAVEPASSWORD', 0),
      profileChecksum: Array.isArray(checksum) ? checksum.filter((x): x is number => typeof x === 'number') : [],
      profileInfo: info,
    };
  });
}

/** The personas a card's `BASCUS-97275SOCOMII` holds; none when it has no `AcctInfo.rdr`. */
export function readCardFile(card: Uint8Array): Persona[] {
  const acct = findSaveKey(readSaveFile(card), ACCT_INFO_PATH);
  return readPersonas(acct?.data ?? new Uint8Array(0));
}
