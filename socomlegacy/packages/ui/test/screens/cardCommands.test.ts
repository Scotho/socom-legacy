import { describe, expect, it } from 'vitest';
import { CardSlots, Libmc, MC_RESULT, type CardStorage } from '@s2u/card';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, UIVAR_LONGEVITY } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { MenuCommands } from '../../src/screens/menuCommands';
import {
  CARD_COMMAND_ROWS, CARD_STATE, CardCommands, CONFIG_FILE_PLACEHOLDER, ICON_SYS_BYTES, LIST_ICO_BYTES_READING,
  MEMCARD_ERROR_CODE_VALVE, MEMCARD_STATUS_VALVE, SAVE_GAME_DUMMY_BYTES_READING, type CardCommandsOptions,
  type CardConfigFile, type CardFileIo,
} from '../../src/screens/cardCommands';

/**
 * OPT-05i (web research 143): the card UI commands the online path's card prompts dispatch that MENU-01a did not
 * answer -- IsSpaceForSaveGameFile `FUN_0027b3d0`, IsMemcardSaveOK 0x27e120 (instructions), LoadConfig `FUN_0027b0e0`,
 * SaveConfig `FUN_0027b000`, MC_CreateIconFiles `FUN_0027b190` -- each against its transcription, over PLAT-26a's
 * `Libmc` on a card built in the test (its result codes, research 134 §2) and, for a boundary the card cannot be made to
 * hit exactly, over a made-up libmc. Nothing here is measured on the original running.
 */

class MapStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

const FOLDER = 'BASCUS-97275SOCOMII';
const HANDLE_FIRST = new Set(['close', 'seek', 'read', 'write']);

function setup(over: Partial<CardCommandsOptions> = {}) {
  const storage = new MapStorage();
  const slots = new CardSlots(() => storage, () => undefined, { now: () => 5_000 });
  const mc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  /** Every libmc call, in order, as `name(args) -> result`. */
  const ops: string[] = [];
  for (const name of ['getInfo', 'open', 'close', 'seek', 'read', 'write', 'mkdir', 'chdir', 'getDir', 'delete'] as const) {
    const real = (mc[name] as (...a: unknown[]) => unknown).bind(mc);
    (mc as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const out = real(...args);
      // A handle shows as `fd` (libmc counts them from 1 for the whole session, research 134 §2).
      const shown = args.map((a, i) => (i === 0 && HANDLE_FIRST.has(name) ? 'fd' : typeof a === 'object' && a !== null ? 'data' : String(a)));
      const res = typeof out === 'object' && out !== null ? (out as { result: number }).result : out;
      ops.push(`${name}(${shown.join(',')}) -> ${name === 'open' && (res as number) > 0 ? 'fd' : String(res)}`);
      return out;
    };
  }
  const events: number[] = [];
  const valves = new ValveStore();
  const uiVars = new UiVarManager();
  const menu = new MenuCommands({ valves: () => valves, uiVars, card: mc, event: (k) => events.push(k) });
  const card = new CardCommands({ valves: () => valves, uiVars, card: mc, io: () => menu.cardIo(), event: (k) => events.push(k), ...over });
  const host = new UiCommandHost({ log: () => undefined });
  menu.register(host);
  card.register(host);
  const run = (fn: string, arg = 'NA') => host.dispatch(cmd(fn, arg));
  const answer = (fn: string, arg = 'NA') => { const o = run(fn, arg); if (o.kind !== 'table') throw new Error(`${fn}: ${o.kind}`); return o.answer; };
  const slot1 = slots.slot(1);
  const rev = () => slot1.info().rev as number;
  /** `Ensure_MC_Dirs` as the script runs it on a card without the folder (O18; research 128 §2.2). */
  const ensureDirs = () => {
    if (answer('MC_Exists', '..')) answer('MC_ChDir', '..');
    if (answer('MC_Exists', FOLDER)) { answer('MC_ChDir', FOLDER); return; }
    answer('MC_MkDir', FOLDER);
    answer('MC_ChDir', FOLDER);
    answer('MC_CreateIconFiles');
    answer('SaveConfig', FOLDER);
  };
  const files = () => {
    const r = slot1.list(FOLDER);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return Object.fromEntries(r.value.map((e) => [e.name, e.size]));
  };
  return { storage, slots, slot1, mc, ops, events, valves, uiVars, menu, card, host, run, answer, rev, ensureDirs, files };
}

const ERROR = DIALOG_EVENTS.MEMCARD_ERROR!;
const LOADED = DIALOG_EVENTS.LOADED_FROM_MEMCARD!;
const STATUS = DIALOG_EVENTS.MEMCARD_STATUS!;
const { Succeed, NoEntry, NoFormat, FullDevice } = MC_RESULT;

/** A made-up libmc: GetInfo's answers in turn, GetDir's counts and sizes by path. */
function fakeIo(info: { result: number; type: number; free: number; format: number }[], dirs: Record<string, number[]> = {}) {
  const calls: string[] = [];
  let i = 0;
  const io: CardFileIo = {
    getInfo: (p, s) => { calls.push(`getInfo ${p}/${s}`); return info[Math.min(i++, info.length - 1)]!; },
    getDir: (p, s, path, max) => {
      calls.push(`getDir ${path} ${max}`);
      const sizes = dirs[path];
      return sizes ? { result: sizes.length, entries: sizes.map((size) => ({ size })) } : { result: NoEntry, entries: [] };
    },
    open: () => NoEntry, close: () => NoEntry, seek: () => NoEntry, read: () => ({ result: NoEntry }), write: () => NoEntry, delete: () => NoEntry,
  };
  return { io, calls };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('names its rows of the table, each at its index, id and function', () => {
    for (const r of CARD_COMMAND_ROWS) {
      const t = uiCommandRowByName(r.name)!;
      expect([t.index, t.id, t.fn], r.name).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('registered, each row is answered by its entry, not "not implemented"; FormatMemCard stays declared', () => {
    const s = setup();
    for (const r of CARD_COMMAND_ROWS) expect(s.run(r.name, FOLDER).kind, r.name).toBe('table');
    expect(s.run('FormatMemCard').kind).toBe('not-implemented');
  });
});

describe('IsSpaceForSaveGameFile (FUN_0027b3d0: free KB, plus the folder\'s below 3001, not below 3000)', () => {
  it('an empty formatted card: 8000 KB free, true; GetInfo once (Succeed)', () => {
    const s = setup();
    expect(s.answer('IsSpaceForSaveGameFile')).toBe(true);
    expect(s.ops).toEqual(['getInfo(0,0) -> 0']);
  });

  it('no card: GetInfo NoEntry (above -10: one try), free 0; the folder GetDir NoEntry: false', () => {
    const s = setup();
    s.slot1.remove(s.rev());
    expect(s.answer('IsSpaceForSaveGameFile')).toBe(false);
    expect(s.ops).toEqual([`getInfo(0,0) -> ${NoEntry}`, `getDir(0,0,..,1) -> ${NoEntry}`]);
  });

  it('unformatted: NoFormat, free 0: false', () => {
    const s = setup();
    s.slot1.unformat(s.rev());
    expect(s.answer('IsSpaceForSaveGameFile')).toBe(false);
    expect(s.ops[0]).toBe(`getInfo(0,0) -> ${NoFormat}`);
  });

  it('a card full of foreign files: below 3001 free, the folder (none here) adds nothing: false', () => {
    const s = setup();
    s.slot1.makeDir('OTHER', s.rev());
    s.slot1.writeFile('OTHER/big.bin', 6_000 * 1024, null, s.rev());
    expect(s.mc.getInfo(0, 0).free).toBeLessThan(3001);
    s.ops.length = 0;
    expect(s.answer('IsSpaceForSaveGameFile')).toBe(false);
  });

  it('the boundary: free + folder KB 2999 false, 3000 true; free 3001 skips the folder', () => {
    const at = (free: number, sizes: number[]) => {
      const f = fakeIo([{ result: 0, type: 2, free, format: 1 }], { '..': [0], './*': sizes });
      const c = new CardCommands({ valves: () => new ValveStore(), uiVars: new UiVarManager(), card: f.io, io: () => ({ port: 0, slot: 0 }) });
      return { answer: c.IsSpaceForSaveGameFile(cmd('IsSpaceForSaveGameFile'), UI_COMMAND_TABLE[59]!, undefined), calls: f.calls };
    };
    // 2 entries of 1 KB: 2 + (2 >> 1) + 1 = 4 KB.
    expect(at(2995, [1024, 1024]).answer).toBe(false);
    expect(at(2996, [1024, 1024]).answer).toBe(true);
    expect(at(3001, []).calls).toEqual(['getInfo 0/0']);
    expect(at(3000, []).calls).toEqual(['getInfo 0/0', 'getDir .. 1', 'getDir ./* 20']);
  });

  it('GetInfo is asked again only while the result is below -9 (D:L295790-295805)', () => {
    const f = fakeIo([{ result: -10, type: 0, free: 0, format: 0 }, { result: 0, type: 2, free: 5000, format: 1 }]);
    const c = new CardCommands({ valves: () => new ValveStore(), uiVars: new UiVarManager(), card: f.io, io: () => ({ port: 1, slot: 0 }) });
    expect(c.IsSpaceForSaveGameFile(cmd('x'), UI_COMMAND_TABLE[59]!, undefined)).toBe(true);
    expect(f.calls).toEqual(['getInfo 1/0', 'getInfo 1/0']);
  });
});

describe('IsMemcardSaveOK (0x27e120: FUN_003a1cf0\'s state into memcard_error_code, TEMP; true when 0)', () => {
  it('a formatted card: state 0, true', () => {
    const s = setup();
    expect(s.answer('IsMemcardSaveOK')).toBe(true);
    expect(s.valves.find(MEMCARD_ERROR_CODE_VALVE)!.value).toBe(0);
    expect(s.ops).toEqual(['getInfo(0,0) -> 0']);
  });

  it('unformatted: NoFormat, type 2, format 0 -> state 1 (save_and_leave\'s CannotSaveNotFormatted, OPT-05c); asked twice', () => {
    const s = setup();
    s.slot1.unformat(s.rev());
    expect(s.answer('IsMemcardSaveOK')).toBe(false);
    expect(s.valves.find(MEMCARD_ERROR_CODE_VALVE)!.value).toBe(1);
    expect(s.ops).toEqual([`getInfo(0,0) -> ${NoFormat}`, `getInfo(0,0) -> ${NoFormat}`]);
  });

  it('no card: NoEntry, type 0 -> state 2 (CannotSaveNoMemcard, OPT-05b)', () => {
    const s = setup();
    s.slot1.remove(s.rev());
    expect(s.answer('IsMemcardSaveOK')).toBe(false);
    expect(s.valves.find(MEMCARD_ERROR_CODE_VALVE)!.value).toBe(2);
  });

  it('a damaged record: the placeholder\'s -5 on a PS2 card -> state 6 (OPT-05f)', () => {
    const s = setup();
    s.storage.data.set(s.slot1.key, '{');
    expect(s.answer('IsMemcardSaveOK')).toBe(false);
    expect(s.valves.find(MEMCARD_ERROR_CODE_VALVE)!.value).toBe(6);
  });

  it('the state is not reset between the two tries (0x3a1d1c zeroes s1 once)', () => {
    const f = fakeIo([{ result: -10, type: 0, free: 0, format: 0 }, { result: 0, type: 2, free: 8000, format: 1 }]);
    const valves = new ValveStore();
    const c = new CardCommands({ valves: () => valves, uiVars: new UiVarManager(), card: f.io, io: () => ({ port: 0, slot: 0 }) });
    expect(c.IsMemcardSaveOK(cmd('x'), UI_COMMAND_TABLE[202]!, undefined)).toBe(false);
    expect(valves.find(MEMCARD_ERROR_CODE_VALVE)!.value).toBe(2);
    expect(f.calls).toEqual(['getInfo 0/0', 'getInfo 0/0']);
  });

  it('the states are FUN_003a1cf0 literals (D:L296142-296164), the codes save_and_leave tests', () => {
    expect(CARD_STATE).toEqual({ well: 0, unformatted: 1, noCard: 2, denied: 6 });
  });

  it('the valve is written through its watchers only when the state changes', () => {
    const s = setup();
    const seen: number[] = [];
    s.valves.acquire(MEMCARD_ERROR_CODE_VALVE, 2);
    s.valves.watch(MEMCARD_ERROR_CODE_VALVE, 3, (v) => { seen.push(v.value); });
    s.answer('IsMemcardSaveOK');
    s.slot1.unformat(s.rev());
    s.answer('IsMemcardSaveOK');
    s.answer('IsMemcardSaveOK');
    expect(seen).toEqual([1]);
  });
});

describe('MC_CreateIconFiles (FUN_003a0a10: icon.sys 0x3c4 B, LIST.ICO copied a KB at a time)', () => {
  it('writes icon.sys and LIST.ICO in the folder: Open 0x202, one Write, Close; Open 0x203, 49 KB and 58 B, Close', () => {
    const s = setup();
    s.answer('MC_MkDir', FOLDER);
    s.answer('MC_ChDir', FOLDER);
    s.ops.length = 0;
    expect(s.answer('MC_CreateIconFiles')).toBe(true);
    expect(s.files()).toEqual({ 'icon.sys': ICON_SYS_BYTES, 'LIST.ICO': LIST_ICO_BYTES_READING });
    expect(s.ops.slice(0, 4)).toEqual(['open(0,0,icon.sys,514) -> fd', 'write(fd,964,null) -> 964', 'close(fd) -> 0', 'open(0,0,LIST.ICO,515) -> fd']);
    const writes = s.ops.filter((o) => o.startsWith('write(fd,'));
    expect(writes).toHaveLength(49 + 1 + 1);                         // icon.sys, 49 whole KB, the last 58 B
    expect(writes.at(-1)).toBe(`write(fd,${LIST_ICO_BYTES_READING % 1024}) -> ${LIST_ICO_BYTES_READING % 1024}`);
    expect(s.ops.at(-1)).toBe('close(fd) -> 0');
    expect(s.events.filter((e) => e === ERROR)).toEqual([]);
  });

  it('a whole-KB source ends with a Write of 0 (the loop runs while the read is a whole KB)', () => {
    const s = setup({ listIcoBytes: 2048 });
    s.answer('MC_CreateIconFiles');
    expect(s.ops.filter((o) => o.startsWith('write(fd,')).slice(1)).toEqual(['write(fd,1024) -> 1024', 'write(fd,1024) -> 1024', 'write(fd,0) -> 0']);
  });

  it('no card: Open NoEntry posts MEMCARD_ERROR and ends it; the row still answers 1', () => {
    const s = setup();
    s.slot1.remove(s.rev());
    expect(s.answer('MC_CreateIconFiles')).toBe(true);
    expect(s.ops).toEqual([`open(0,0,icon.sys,514) -> ${NoEntry}`]);
    expect(s.events).toEqual([ERROR]);
  });

  it('a card without room for LIST.ICO: a Write FullDevice posts MEMCARD_ERROR and ends the copy, the handle closed (C8 U5: 3 handles)', () => {
    const s = setup();
    s.slot1.makeDir('OTHER', s.rev());
    s.slot1.writeFile('OTHER/big.bin', (s.mc.getInfo(0, 0).free - 20) * 1024, null, s.rev());
    s.mc.getInfo(0, 0);                                  // libmc reads the card as it now is (no ChangedCard, research 134 §4)
    s.ops.length = 0;
    s.answer('MC_CreateIconFiles');
    expect(s.ops.some((o) => o.endsWith(`-> ${FullDevice}`))).toBe(true);
    expect(s.ops.at(-1)).toBe('close(fd) -> 0');
    expect(s.ops.at(-2)!.endsWith(`-> ${FullDevice}`)).toBe(true);
    expect(s.events).toEqual([ERROR]);
  });

  it('three failed LIST.ICO copies leave no handle open: the next copy still opens and succeeds (the card driver holds 3)', () => {
    const s = setup();
    s.answer('MC_MkDir', FOLDER);
    s.answer('MC_ChDir', FOLDER);
    const real = s.mc.write.bind(s.mc);
    let failing = true;
    (s.mc as unknown as { write: unknown }).write = (fd: number, n: number, d?: unknown) =>
      (failing && n !== ICON_SYS_BYTES ? FullDevice : real(fd, n, d as never));
    for (let i = 0; i < 3; i++) s.answer('MC_CreateIconFiles');
    expect(s.events).toEqual([ERROR, ERROR, ERROR]);
    failing = false;
    s.events.length = 0;
    expect(s.answer('MC_CreateIconFiles')).toBe(true);
    expect(s.events).toEqual([]);
    expect(s.files()['LIST.ICO']).toBe(LIST_ICO_BYTES_READING);
    expect(s.answer('SaveConfig', FOLDER)).toBeDefined();
    expect(s.events.filter((e) => e === ERROR)).toEqual([]);
    expect(s.files()[FOLDER]).toBe(CONFIG_FILE_PLACEHOLDER.size);
  });
});

describe('SaveConfig (FUN_0027b000: the scratch deleted, the file saved, the dummies, the fillers)', () => {
  it('the first save on an empty card (Ensure_MC_Dirs) leaves the f0 card\'s twelve files at their sizes', () => {
    const s = setup();
    s.ensureDirs();
    // Research 139 §3: BASCUS-97275SOCOMII 4,784, icon.sys 964, LIST.ICO 50,234, PATCHFILE.DAT 2,048,000,
    // SaveGame0..6 1,952, SCRATCHPAD.DAT 944,128 -- the last from 2999 - (2070 KB + 13 >> 1 + 1) = 922 KB.
    expect(s.files()).toEqual({
      [FOLDER]: CONFIG_FILE_PLACEHOLDER.size, 'icon.sys': 964, 'LIST.ICO': 50_234,
      ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`SaveGame${i}`, SAVE_GAME_DUMMY_BYTES_READING])),
      'PATCHFILE.DAT': 2_048_000, 'SCRATCHPAD.DAT': 944_128,
    });
    expect(s.events.filter((e) => e === ERROR)).toEqual([]);
  });

  it('its commands in order: Delete SCRATCHPAD; the file (Delete, Open WRONLY|CREAT, Write, Close); each dummy; the fillers', () => {
    const s = setup();
    s.answer('MC_MkDir', FOLDER);
    s.answer('MC_ChDir', FOLDER);
    s.ops.length = 0;
    s.answer('SaveConfig', FOLDER);
    expect(s.ops.slice(0, 5)).toEqual([
      `delete(0,0,SCRATCHPAD.DAT) -> ${NoEntry}`,
      `delete(0,0,${FOLDER}) -> ${NoEntry}`, `open(0,0,${FOLDER},514) -> fd`, `write(fd,${CONFIG_FILE_PLACEHOLDER.size},null) -> ${CONFIG_FILE_PLACEHOLDER.size}`, 'close(fd) -> 0',
    ]);
    expect(s.ops.slice(5, 10)).toEqual([
      'getDir(0,0,SaveGame0,1) -> 0', `delete(0,0,SaveGame0) -> ${NoEntry}`, 'open(0,0,SaveGame0,514) -> fd',
      `write(fd,${SAVE_GAME_DUMMY_BYTES_READING},null) -> ${SAVE_GAME_DUMMY_BYTES_READING}`, 'close(fd) -> 0',
    ]);
    const tail = s.ops.slice(5 + 7 * 5);
    expect(tail.slice(0, 6)).toEqual([
      'getDir(0,0,*.zdb,1) -> 0', 'getDir(0,0,PATCHFILE.DAT,1) -> 0', 'open(0,0,PATCHFILE.DAT,514) -> fd',
      `seek(fd,${1999 * 1024},0) -> ${1999 * 1024}`, 'write(fd,1024) -> 1024', 'close(fd) -> 0',
    ]);
    // The folder's 11 entries (`.`, `..`, the file, seven dummies, PATCHFILE.DAT; no icons in this test):
    // 5 + 7 x 2 + 2000 KB + (11 >> 1) + 1 = 2025, so 974 KB of room.
    expect(tail.slice(6)).toEqual([
      'getDir(0,0,..,1) -> 1', 'getDir(0,0,./*,20) -> 11', 'getDir(0,0,SCRATCHPAD.DAT,1) -> 0', 'open(0,0,SCRATCHPAD.DAT,514) -> fd',
      `seek(fd,${973 * 1024},0) -> ${973 * 1024}`, 'write(fd,1024) -> 1024', 'close(fd) -> 0',
    ]);
  });

  it('a second save: the scratch deleted and made again, the dummies and the patch filler left as they are', () => {
    const s = setup();
    s.ensureDirs();
    s.ops.length = 0;
    s.answer('SaveConfig', FOLDER);
    expect(s.ops[0]).toBe(`delete(0,0,SCRATCHPAD.DAT) -> ${Succeed}`);
    expect(s.ops.filter((o) => o.startsWith('open('))).toEqual([`open(0,0,${FOLDER},514) -> fd`, 'open(0,0,SCRATCHPAD.DAT,514) -> fd']);
    expect(s.files()['SCRATCHPAD.DAT']).toBe(944_128);
  });

  it('the file\'s contents are the modules\' (CardConfigFile), written whole', () => {
    const config: CardConfigFile = { contents: () => ({ size: 6_208, data: { CAcctDB: { AcctInfo: [] } } }), restore: () => true };
    const s = setup({ config });
    s.ensureDirs();
    expect(s.files()[FOLDER]).toBe(6_208);
    const r = s.slot1.readFile(`${FOLDER}/${FOLDER}`);
    expect(r.ok && r.value.data).toEqual({ CAcctDB: { AcctInfo: [] } });
  });

  it('a full card: the save\'s Write FullDevice posts nothing (FUN_0033dff0 answers 1 whatever the card did)', () => {
    const s = setup();
    s.answer('MC_MkDir', FOLDER);
    s.answer('MC_ChDir', FOLDER);
    s.slot1.makeDir('OTHER', s.rev());
    s.slot1.writeFile('OTHER/big.bin', s.mc.getInfo(0, 0).free * 1024, null, s.rev());
    s.mc.getInfo(0, 0);
    s.ops.length = 0;
    expect(s.answer('SaveConfig', FOLDER)).toBe(true);
    expect(s.ops[3]).toBe(`write(fd,${CONFIG_FILE_PLACEHOLDER.size},null) -> ${FullDevice}`);
    expect(s.events.filter((e) => e === ERROR)).toEqual([]);
  });

  it('no card: every command NoEntry; the filler\'s Open posts MEMCARD_ERROR (D:L296064-296067), twice', () => {
    const s = setup();
    s.slot1.remove(s.rev());
    expect(s.answer('SaveConfig', FOLDER)).toBe(true);
    expect(s.events.filter((e) => e === ERROR)).toEqual([ERROR, ERROR]);  // PATCHFILE's Open; then SCRATCHPAD's (room 2999 - 0)
    expect(s.ops.filter((o) => o.startsWith('open(')).map((o) => o.split(' -> ')[1])).toEqual(Array(1 + 7 + 2).fill(String(NoEntry)));
  });
});

describe('LoadConfig (FUN_0027b0e0 -> FUN_003a1730: CSaveManager::Load, LOADED_FROM_MEMCARD or MEMCARD_ERROR, AUTOMESSAGES)', () => {
  it('a saved card: the file read (Open RDONLY, GetDir, Read, Close) and re-read for its header; LOADED_FROM_MEMCARD', () => {
    const got: unknown[] = [];
    const config: CardConfigFile = { contents: () => ({ size: 4_784, data: { k: 1 } }), restore: (d) => { got.push(d); return true; } };
    const s = setup({ config });
    s.ensureDirs();
    s.ops.length = 0;
    s.events.length = 0;
    expect(s.answer('LoadConfig', FOLDER)).toBe(true);
    const read = [`open(0,0,${FOLDER},1) -> fd`, `getDir(0,0,${FOLDER},1) -> 1`, 'read(fd,4784) -> 4784', 'close(fd) -> 0'];
    expect(s.ops).toEqual([...read, ...read]);
    expect(got).toEqual([{ k: 1 }]);
    expect(s.events.filter((e) => e !== STATUS)).toEqual([LOADED]);
    expect(s.valves.find(MEMCARD_STATUS_VALVE)!.value).toBe(0);
  });

  it('no file: Open NoEntry twice, nothing read, MEMCARD_ERROR (`handle_memcard_error`: OPT-05f\'s DisplayErrorLoading)', () => {
    const s = setup();
    expect(s.answer('LoadConfig', FOLDER)).toBe(true);
    expect(s.ops).toEqual([`open(0,0,${FOLDER},1) -> ${NoEntry}`, `open(0,0,${FOLDER},1) -> ${NoEntry}`]);
    expect(s.events).toEqual([ERROR]);
  });

  it('a file the modules do not take: MEMCARD_ERROR', () => {
    const s = setup({ config: { contents: () => ({ size: 4_784, data: 'x' }), restore: () => false } });
    s.ensureDirs();
    s.events.length = 0;
    s.answer('LoadConfig', FOLDER);
    expect(s.events.filter((e) => e !== STATUS)).toEqual([ERROR]);
  });

  it('AUTOMESSAGES: acquired TEMPORARY; "on" (any case) writes 0, another string 1, another type nothing', () => {
    const flags: number[] = [];
    const s = setup({ autoMessages: (f) => flags.push(f) });
    s.answer('LoadConfig', FOLDER);
    expect(s.uiVars.find('AUTOMESSAGES')!.longevity).toBe(UIVAR_LONGEVITY.TEMPORARY);
    expect(flags).toEqual([]);
    s.uiVars.set('AUTOMESSAGES', { type: 'string', value: 'on' });
    s.answer('LoadConfig', FOLDER);
    s.uiVars.set('AUTOMESSAGES', { type: 'string', value: 'OFF' });
    s.answer('LoadConfig', FOLDER);
    expect(flags).toEqual([0, 1]);
    expect(s.card.autoMessagesFlag).toBe(1);
  });
});

describe('the card object shared with MENU-01a', () => {
  it('MC_ChPort moves every row of this module to the port (slot 2: port 1)', () => {
    const s = setup();
    s.answer('MC_ChPort', '1');
    s.answer('IsMemcardSaveOK');
    expect(s.ops).toEqual(['getInfo(1,0) -> 0']);
  });

  it('a poll MC_Changed left in flight is consumed by the next row (its opening sceMcSync(0)), as R138.5 has it', () => {
    const s = setup();
    s.answer('MC_Changed');                        // issues the poll on port 0
    s.answer('IsSpaceForSaveGameFile');
    s.ops.length = 0;
    s.answer('MC_Changed');                        // nothing in flight: issued again, answering 0
    expect(s.ops).toEqual(['getInfo(0,0) -> 0']);
  });
});
