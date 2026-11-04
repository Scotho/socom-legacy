import { describe, expect, it } from 'vitest';
import { parseRdr } from '@s2u/archive';
import {
  ACCT_INFO_PATH, findSaveKey, readCardFile, readPersonas, readRdrTree, readSaveFile, readZarTree, rdrExtents, saveHeader,
  saveModules, unscramble, zarExtents, SAVE_HEADER_BYTES, SCRAMBLE_SEED, ZAR_SAVE_FILL,
} from '../cardFile';
import {
  handAcct, handBoundarySave, handGameSave, handHeader, handLauncherSave, handValves, scrambleForTest, tiles, HAND_PAD16, HAND_PERSONA,
  HAND_STABLE_OFS,
} from './cardFileSupport';

/**
 * The card file reader (`tools/cardFile.ts`; R7; web research 102) on input built in the test by hand from the format's
 * rules (`cardFileSupport.ts`): no game bytes, so this runs in CI. The dev-host suite over the PC project's 76
 * game-written files is `cardFileDev.test.ts`.
 */

const card = (plain: Uint8Array): Uint8Array => scrambleForTest(plain);

describe('the unscrambler (FUN_0033de00; PC research 80 step 3) and the test\'s forward scrambler', () => {
  // Worked by hand (c = p ^ k; k = k ^ (k + p) & 0xff, forward from k = 0x96, then backward from the second-last byte
  // seeded by the last): [00] -> [96]; [00 01] -> [97 01]; [10 20 30] -> forward [86 10 50], backward [b6 40 50].
  it('matches the vectors worked by hand, both ways', () => {
    expect(SCRAMBLE_SEED).toBe(0x96);
    expect([...unscramble(Uint8Array.of(0x96))]).toEqual([0x00]);
    expect([...unscramble(Uint8Array.of(0x97, 0x01))]).toEqual([0x00, 0x01]);
    expect([...unscramble(Uint8Array.of(0xb6, 0x40, 0x50))]).toEqual([0x10, 0x20, 0x30]);
    expect([...scrambleForTest(Uint8Array.of(0x10, 0x20, 0x30))]).toEqual([0xb6, 0x40, 0x50]);
    expect(unscramble(new Uint8Array(0)).length).toBe(0);
  });

  it('inverts the forward pass at every length around the 8-byte unrolled loop, and leaves its input alone', () => {
    for (const n of [1, 2, 3, 7, 8, 9, 15, 16, 17, 24, 25, 257]) {
      const x = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      const s = scrambleForTest(x), copy = s.slice();
      expect([...unscramble(s)], `n=${n}`).toEqual([...x]);
      expect([...s]).toEqual([...copy]);
    }
  });
});

describe('the lossless rdr reader, on a hand-built PersistentValves.rdr (an int, strings, lists, a float)', () => {
  it('reads every node with its type and flags; the float is type 2', () => {
    const tree = readRdrTree(handValves());
    expect(tree).toEqual({ type: 'list', flags: 0, items: [
      { type: 'list', flags: 0, items: [
        { type: 'string', flags: 0, value: 'NAME' }, { type: 'list', flags: 0, items: [{ type: 'string', flags: 0, value: 'AutoAim' }] },
        { type: 'string', flags: 0, value: 'VAL' }, { type: 'list', flags: 0, items: [{ type: 'int', flags: 0, value: 1 }] },
      ] },
      { type: 'list', flags: 0, items: [
        { type: 'string', flags: 0, value: 'NAME' }, { type: 'list', flags: 0, items: [{ type: 'string', flags: 1, value: 'Gamma' }] },
        { type: 'string', flags: 0, value: 'VAL' }, { type: 'list', flags: 0, items: [{ type: 'float', flags: 0, value: 1.5 }] },
      ] },
    ] });
    // The scripts' reader agrees on the values.
    expect(parseRdr(handValves())).toEqual([['NAME', ['AutoAim'], 'VAL', ['1']], ['NAME', ['Gamma'], 'VAL', ['1.5']]]);
  });

  it('accounts for every byte: the head, each string once and referenced, zero padding, each node reached', () => {
    const bytes = handValves(), ex = rdrExtents(bytes);
    expect(tiles(ex, bytes.length)).toBe(true);
    expect(ex.map((e) => e.what)).toEqual(['head', 'string', 'string', 'string', 'string', 'pad', ...new Array(15).fill('node')]);
    expect(ex.find((e) => e.what === 'pad')).toEqual({ start: 35, end: 48, what: 'pad' });
    expect([...bytes.subarray(35, 48)].every((b) => b === 0)).toBe(true);
  });

  it('names a string nobody points at, a node nobody reaches, and bytes past the last node', () => {
    const extra = new Uint8Array(handValves().length + 8 + 3);
    extra.set(handValves());
    expect(rdrExtents(extra).map((e) => e.what).slice(-2)).toEqual(['node (unreached)', 'tail']);
    const unreferenced = handValves();
    unreferenced[48 + 8 * 13 + 4] = 13;          // node 13 says VAL instead of Gamma: "Gamma" is nobody's
    expect(rdrExtents(unreferenced).filter((e) => e.what !== 'string' && e.what !== 'node' && e.what !== 'head' && e.what !== 'pad'))
      .toEqual([{ start: 12 + 17, end: 12 + 23, what: 'string (unreferenced)' }]);
  });

  it('refuses what parseRdr refuses: a version other than 1, an unknown node type', () => {
    const v2 = handValves(); v2[0] = 2;
    expect(() => readRdrTree(v2)).toThrow(/version 2/);
    const t9 = handValves(); t9[48 + 8 * 8] = 9;
    expect(() => readRdrTree(t9)).toThrow(/type 9/);
  });
});

describe('the lossless ZAR reader, on hand-built archives in the game\'s and the PC launcher\'s layouts', () => {
  it('reads the game\'s layout: the tree with each key\'s bytes, a heap stable_ofs, no empty name, 0xAF gaps', () => {
    const { root, layout } = readZarTree(handGameSave());
    expect(layout).toEqual({ appVersion: 14, padding: 16, crc: 0, stableOfs: HAND_STABLE_OFS, emptyNameFirst: false, fill: ZAR_SAVE_FILL });
    const shape = (k: typeof root): unknown => [k.name, k.data.length, k.children.map(shape)];
    expect(shape(root)).toEqual(['', 0, [
      ['zSaveHeader', 268, []],
      ['CSaveModuleList', 0, [['CValveSaveManager', 0, [['PersistentValves.rdr', 168, []]]], ['CAcctDB', 0, [['AcctInfo.rdr', 488, []]]]]],
    ]]);
    expect([...root.children[1]!.children[0]!.children[0]!.data]).toEqual([...handValves()]);
  });

  it('reads the launcher\'s layout: a leading empty name, stable_ofs 0, zero gaps', () => {
    expect(readZarTree(handLauncherSave()).layout).toEqual({ appVersion: 14, padding: 16, crc: 0, stableOfs: 0, emptyNameFirst: true, fill: 0 });
  });

  it('accounts for every byte of both: head, names, keys, each key\'s data, and gaps of the layout\'s fill', () => {
    for (const plain of [handGameSave(), handLauncherSave()]) {
      const ex = zarExtents(plain), fill = readZarTree(plain).layout.fill;
      expect(tiles(ex, plain.length)).toBe(true);
      expect(ex.filter((e) => /unreferenced|tail/.test(e.what))).toEqual([]);
      for (const g of ex.filter((e) => e.what === 'gap')) expect([...plain.subarray(g.start, g.end)].every((b) => b === fill)).toBe(true);
    }
    expect(zarExtents(handGameSave()).filter((e) => e.what !== 'name')).toEqual([
      { start: 0, end: 100, what: 'head' }, { start: 188, end: 300, what: 'keys' }, { start: 300, end: 304, what: 'gap' },
      { start: 304, end: 572, what: 'data zSaveHeader' }, { start: 572, end: 576, what: 'gap' },
      { start: 576, end: 744, what: 'data CSaveModuleList/CValveSaveManager/PersistentValves.rdr' }, { start: 744, end: 752, what: 'gap' },
      { start: 752, end: 1240, what: 'data CSaveModuleList/CAcctDB/AcctInfo.rdr' }, { start: 1240, end: 1248, what: 'gap' },
    ]);
  });

  it('copies each key\'s bytes exactly: every key of the game-layout save equals what was laid in (the review\'s F1)', () => {
    const { root } = readZarTree(handGameSave());
    const flat = (k: typeof root): [string, number[]][] => [[k.name, [...k.data]], ...k.children.flatMap(flat)];
    expect(flat(root)).toEqual([
      ['', []], ['zSaveHeader', [...handHeader()]], ['CSaveModuleList', []], ['CValveSaveManager', []],
      ['PersistentValves.rdr', [...handValves()]], ['CAcctDB', []], ['AcctInfo.rdr', [...handAcct()]],
    ]);
  });

  it('reads a key ending inside its alignment gap and one ending exactly on the boundary at the blob\'s end', () => {
    const plain = handBoundarySave(), { root, layout } = readZarTree(plain);
    expect(layout).toEqual({ appVersion: 14, padding: 16, crc: 0, stableOfs: 0, emptyNameFirst: true, fill: 0 });
    expect(root.children.map((k) => [k.name, [...k.data]])).toEqual([['zSaveHeader', [...handHeader()]], ['Pad16', [...HAND_PAD16]]]);
    expect(zarExtents(plain).filter((e) => e.what !== 'name')).toEqual([
      { start: 0, end: 100, what: 'head' }, { start: 119, end: 167, what: 'keys' }, { start: 167, end: 176, what: 'gap' },
      { start: 176, end: 444, what: 'data zSaveHeader' }, { start: 444, end: 448, what: 'gap' }, { start: 448, end: 464, what: 'data Pad16' },
    ]);
    expect(saveHeader(readSaveFile(card(plain))).size).toBe(268);
  });

  it('refuses a head word the game leaves zero', () => {
    const odd = handGameSave(); odd[40] = 1;
    expect(() => readZarTree(odd)).toThrow(/head word at 40/);
  });
});

describe('the save file and the personas (PC research 80 steps 4-5), on hand-built cards', () => {
  it('unscrambles and reads a card: the header, the modules, the keys by path, the persona', () => {
    const file = readSaveFile(card(handGameSave()));
    expect(saveHeader(file)).toEqual({ size: SAVE_HEADER_BYTES, version: 14, rest: new Uint8Array(260) });
    expect(saveModules(file).map((m) => m.name)).toEqual(['CValveSaveManager', 'CAcctDB']);
    expect([...findSaveKey(file, 'CSaveModuleList/CValveSaveManager/PersistentValves.rdr')!.data]).toEqual([...handValves()]);
    expect(findSaveKey(file, 'CSaveModuleList/CUIVarManager')).toBeUndefined();
    expect(findSaveKey(file, ACCT_INFO_PATH)!.data.length).toBe(488);
    expect(readCardFile(card(handGameSave()))).toEqual([HAND_PERSONA]);
    expect(readPersonas(handAcct())).toEqual([HAND_PERSONA]);
    expect([...handHeader().subarray(0, 8)]).toEqual([0x0c, 0x01, 0, 0, 14, 0, 0, 0]);
  });

  it('a card without the module list holds no personas and no modules; a short blob holds no record', () => {
    expect(readCardFile(card(handLauncherSave()))).toEqual([]);
    expect(saveModules(readSaveFile(card(handLauncherSave())))).toEqual([]);
    expect(readPersonas(new Uint8Array(0))).toEqual([]);
  });

  it('refuses bytes that are not a scrambled archive', () => {
    expect(() => readSaveFile(handGameSave())).toThrow(/ZAR/);
  });
});
