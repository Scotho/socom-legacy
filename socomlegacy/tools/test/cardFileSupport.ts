/**
 * TEST SUPPORT ONLY -- never imported by `tools/` proper or by `packages/` (ruling R7, web sprint 6: the port writes
 * no card byte format; `tools/cardFile.ts` is a reader). Hand-built game saves for the card file reader's CI tests and
 * PLAT-06's `persistentValvesOf` test: every byte below is laid out by hand from the format's rules -- the head words
 * and the key records of research 36 section 1 and web research 102 section 2, the node table in the allocation order
 * of web research 102 section 3, PC research 80 steps 3-5 -- with each offset worked out in a comment, not computed by
 * a writer. The one piece of code that writes is `scrambleForTest`, the game's forward scrambler (`sub_0033DC30`;
 * PC research 80 step 3) in a few lines, itself held by hand-worked vectors in `cardFile.test.ts`. Everything is
 * made up: no byte comes from a card.
 */

/** TEST SUPPORT: the game's `sub_0033DC30` over a copy -- forward from 0x96, then backward seeded by the last byte. */
export function scrambleForTest(plain: Uint8Array): Uint8Array {
  const b = plain.slice(), n = b.length;
  const step = (k: number, p: number): number => (k ^ ((k + p) & 0xff)) & 0xff;
  let k = 0x96;
  for (let i = 0; i < n; i++) { const p = b[i]!; b[i] = p ^ k; k = step(k, p); }
  if (n >= 2) { k = b[n - 1]!; for (let i = n - 2; i >= 0; i--) { const p = b[i]!; b[i] = p ^ k; k = step(k, p); } }
  return b;
}

/** Whether extents tile [0, length): sorted, each starting where the one before ended. */
export function tiles(extents: readonly { start: number; end: number }[], length: number): boolean {
  let at = 0;
  for (const e of [...extents].sort((a, b) => a.start - b.start)) {
    if (e.start !== at || e.end < e.start) return false;
    at = e.end;
  }
  return at === length;
}

const latin1 = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const S = 3, I = 1, F = 2, L = 4;

/** An rdr file from a hand-written string table and node list (`[type, flags, count, value]` each). */
function rdrBytes(table: string, nodesAt: number, nodes: [number, number, number, number][]): Uint8Array {
  const out = new Uint8Array(nodesAt + 8 * nodes.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 1, true); dv.setUint32(4, table.length, true); dv.setUint32(8, nodesAt, true);
  out.set(latin1(table), 12);
  nodes.forEach(([t, f, n, v], i) => { out[nodesAt + 8 * i] = t; out[nodesAt + 8 * i + 1] = f; dv.setUint16(nodesAt + 8 * i + 2, n, true); dv.setUint32(nodesAt + 8 * i + 4, v, true); });
  return out;
}

/**
 * A `PersistentValves.rdr` of two made-up records, `("NAME" ("AutoAim") "VAL" (1))` and `("NAME" ("Gamma") "VAL"
 * (1.5))`: an int, strings, lists and a float (type 2), and one string with flags 1 (as the UI variables carry). 168 B.
 */
export function handValves(): Uint8Array {
  // The table, strings in the order the fill reaches them: 0 NAME, 5 AutoAim, 13 VAL, 17 Gamma; 23 bytes.
  // Nodes at 12 + 23 = 35, up to 48 (13 zero bytes). A list's value is its block's byte offset from node 0.
  return rdrBytes('NAME\0AutoAim\0VAL\0Gamma\0', 48, [
    [L, 0, 2, 8],                  //  0 the root: the two records at node 1
    [L, 0, 4, 24],                 //  1 record 1: its four children at node 3
    [L, 0, 4, 72],                 //  2 record 2: at node 9 (allocated after record 1's subtree, nodes 3-8)
    [S, 0, 0, 0],                  //  3 NAME
    [L, 0, 1, 56],                 //  4 -> node 7
    [S, 0, 0, 13],                 //  5 VAL
    [L, 0, 1, 64],                 //  6 -> node 8
    [S, 0, 0, 5],                  //  7 AutoAim
    [I, 0, 0, 1],                  //  8 1
    [S, 0, 0, 0],                  //  9 NAME
    [L, 0, 1, 104],                // 10 -> node 13
    [S, 0, 0, 13],                 // 11 VAL
    [L, 0, 1, 112],                // 12 -> node 14
    [S, 1, 0, 17],                 // 13 Gamma, flags 1
    [F, 0, 0, 0x3fc00000],         // 14 1.5 as an f32
  ]);
}

/** The made-up persona `handAcct` holds. */
export const HAND_PERSONA = {
  host: '192.0.2.7', name: 'abc', town: 'T', gender: 1, port: 10075, password: 'pw', savePassword: 1,
  profileChecksum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], profileInfo: [],
};

/** `AcctInfo.rdr` for [`HAND_PERSONA`] (PC research 80 step 5: one 16-node record). 488 B. */
export function handAcct(): Uint8Array {
  // offset:  0 HOST, 5 192.0.2.7, 15 NAME, 20 abc, 24 TOWN, 29 T, 31 GENDER, 38 PORT, 43 PASSWORD, 52 pw,
  //         55 SAVEPASSWORD, 68 PROFILES, 77 PROFILE_CHECKSUM, 94 PROFILE_INFO; 107 bytes; nodes at 119 up to 128.
  const table = ['HOST', '192.0.2.7', 'NAME', 'abc', 'TOWN', 'T', 'GENDER', 'PORT', 'PASSWORD', 'pw', 'SAVEPASSWORD',
    'PROFILES', 'PROFILE_CHECKSUM', 'PROFILE_INFO'].map((s) => `${s}\0`).join('');
  return rdrBytes(table, 128, [
    [L, 0, 1, 8],                                          //  0 the root: the list of records, its block at node 1
    [L, 0, 16, 16],                                        //  1 the record: its 16 children at node 2
    [S, 0, 0, 0], [L, 0, 1, 144],                          //  2 HOST      3 -> node 18
    [S, 0, 0, 15], [L, 0, 1, 152],                         //  4 NAME      5 -> node 19
    [S, 0, 0, 24], [L, 0, 1, 160],                         //  6 TOWN      7 -> node 20
    [S, 0, 0, 31], [L, 0, 1, 168],                         //  8 GENDER    9 -> node 21
    [S, 0, 0, 38], [L, 0, 1, 176],                         // 10 PORT     11 -> node 22
    [S, 0, 0, 43], [L, 0, 1, 184],                         // 12 PASSWORD 13 -> node 23
    [S, 0, 0, 55], [L, 0, 1, 192],                         // 14 SAVEPASSWORD 15 -> node 24
    [S, 0, 0, 68], [L, 0, 4, 200],                         // 16 PROFILES 17 -> nodes 25-28
    [S, 0, 0, 5], [S, 0, 0, 20], [S, 0, 0, 29], [I, 0, 0, 1], [I, 0, 0, 10075], [S, 0, 0, 52], [I, 0, 0, 1],   // 18-24
    [S, 0, 0, 77], [L, 0, 16, 232], [S, 0, 0, 94], [L, 0, 0, 360],   // 25-28: checksums at node 29; PROFILE_INFO empty, the next free node (45)
    ...Array.from({ length: 16 }, (_, i): [number, number, number, number] => [I, 0, 0, i + 1]),   // 29-44
  ]);
}

/** A ZAR v2 archive from hand-worked head words, string table, key records (`[name ptr, offset, size, children]`)
 *  and data placements, every other byte `fill`. */
function zarBytes(o: { length: number; fill: number; keyCount: number; table: string; stableOfs: number; dataSize: number; appVersion: number;
                       keys: [number, number, number, number][]; dataAt: number; data: [number, Uint8Array][] }): Uint8Array {
  const out = new Uint8Array(o.length);
  const dv = new DataView(out.buffer);
  const keysAt = 100 + o.table.length, keysEnd = keysAt + 16 * o.keyCount;
  out.fill(o.fill, keysEnd);
  dv.setUint32(4, o.keyCount, true); dv.setUint32(8, o.table.length, true); dv.setUint32(12, o.stableOfs, true);
  dv.setUint32(16, 16, true);                                                  // padding
  dv.setUint32(84, o.dataSize, true); dv.setUint32(92, o.appVersion, true); dv.setUint32(96, 0x20002, true);
  out.set(latin1(o.table), 100);
  o.keys.forEach((k, i) => k.forEach((w, j) => dv.setInt32(keysAt + 16 * i + 4 * j, w, true)));
  for (const [at, bytes] of o.data) out.set(bytes, o.dataAt + at);
  return out;
}

/** A made-up 268-byte `zSaveHeader`: {268, 14}, then 260 zero bytes. */
export function handHeader(): Uint8Array {
  const h = new Uint8Array(268);
  h.set([0x0c, 0x01, 0, 0, 14, 0, 0, 0]);
  return h;
}

/** The game's `stable_ofs` in `virgin.bin` (web research 102 section 2): any heap address does. */
export const HAND_STABLE_OFS = 0x187b970;

/**
 * The plain archive of a save in the game's layout (web research 102 section 2: no leading empty name, a heap
 * `stable_ofs`, 0xAF in every gap), appversion 14, padding 16:
 * `root{ zSaveHeader, CSaveModuleList{ CValveSaveManager{ PersistentValves.rdr }, CAcctDB{ AcctInfo.rdr } } }`.
 */
export function handGameSave(): Uint8Array {
  // The table, pre-order: 0 zSaveHeader, 12 CSaveModuleList, 28 CValveSaveManager, 46 PersistentValves.rdr,
  // 67 CAcctDB, 75 AcctInfo.rdr; 88 bytes. Keys at 188, 7 of them to 300; the data at 304 (4 bytes of 0xAF).
  // The data: zSaveHeader 268 at 0 (to 272), PersistentValves.rdr 168 at 272 (to 448), AcctInfo.rdr 488 at 448
  // (936, up to 944): a blob of 944, the file 304 + 944 = 1,248 B.
  const p = (ofs: number): number => HAND_STABLE_OFS + ofs;
  return zarBytes({
    length: 1248, fill: 0xaf, keyCount: 7, stableOfs: HAND_STABLE_OFS, dataSize: 944, appVersion: 14, dataAt: 304,
    table: 'zSaveHeader\0CSaveModuleList\0CValveSaveManager\0PersistentValves.rdr\0CAcctDB\0AcctInfo.rdr\0',
    keys: [[0, 0, 0, 2], [p(0), 0, 268, 0], [p(12), 0, 0, 2], [p(28), 0, 0, 1], [p(46), 272, 168, 0], [p(67), 0, 0, 1], [p(75), 448, 488, 0]],
    data: [[0, handHeader()], [272, handValves()], [448, handAcct()]],
  });
}

/**
 * The plain archive of a save in the PC launcher's layout (`card_save.py` `build_zar`: a leading empty name,
 * `stable_ofs` 0, zero gaps), holding only `zSaveHeader`: no module list, so no valves and no personas.
 */
export function handLauncherSave(): Uint8Array {
  // The table: 0 '', 1 zSaveHeader; 13 bytes. Keys at 113, 2 of them to 145; the data at 160. zSaveHeader 268 at 0,
  // up to 272: the file 160 + 272 = 432 B.
  return zarBytes({
    length: 432, fill: 0, keyCount: 2, stableOfs: 0, dataSize: 272, appVersion: 14, dataAt: 160,
    table: '\0zSaveHeader\0', keys: [[0, 0, 0, 1], [1, 0, 268, 0]], data: [[0, handHeader()]],
  });
}

/** The 16 made-up bytes `handBoundarySave`'s second key holds: 0x11 .. 0x20. */
export const HAND_PAD16 = Uint8Array.from({ length: 16 }, (_, i) => 0x11 + i);

/**
 * The review's F1: a save whose keys end both ways -- `zSaveHeader` (268 B) inside its alignment gap, `Pad16` (16 B)
 * exactly on the boundary that is also the end of the blob and of the file -- so a key read a byte or four long or
 * short changes its bytes or runs off the blob. The PC launcher's layout: `root{ zSaveHeader, Pad16 }`.
 */
export function handBoundarySave(): Uint8Array {
  // The table: 0 '', 1 zSaveHeader, 13 Pad16; 19 bytes. Keys at 119, 3 of them to 167; the data at 176.
  // zSaveHeader 268 at 0 (gap 268-272); Pad16 16 at 272, ending at 288: the blob is 288, the file 176 + 288 = 464 B.
  return zarBytes({
    length: 464, fill: 0, keyCount: 3, stableOfs: 0, dataSize: 288, appVersion: 14, dataAt: 176,
    table: '\0zSaveHeader\0Pad16\0', keys: [[0, 0, 0, 2], [1, 0, 268, 0], [13, 272, 16, 0]],
    data: [[0, handHeader()], [272, HAND_PAD16]],
  });
}
