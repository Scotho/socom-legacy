import { describe, expect, it } from 'vitest';
import {
  CardSlots, FIO, Libmc, MC_CMD, MC_DAMAGED_RESULT_PLACEHOLDER, MC_ENT_SPACE, MC_RENAME_OPEN_FILE_DENIED_READING,
  MC_RESULT, type CardStorage,
} from '../src/index';
import {
  OPTIONS_SAVE_PROBE_STEPS, optionsSaveAndLeaveOnAFreshCard, optionsSaveAndLeaveOnASavedCard, optionsSaveOnAFreshCard, replayMcOps,
  type McStep,
} from './mcReplay';

/**
 * PLAT-26 (research 228): the five commands PLAT-26a left refused -- Format, Unformat, SetFileInfo, GetEntSpace and
 * Rename -- as the recompilation's stub answers them (`third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/
 * MemoryCard.cpp` at the desktop's be5578311, the `ref/desktop` pin, cited `:<line>`), on a file table built in the test; and the op-sequence
 * replay harness (`mcReplay.ts`) fed with the options save as the decompilation's save chain reads it (W15.R2).
 */

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  failSet?: () => unknown;
  sets = 0;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const e = this.failSet?.();
    if (e !== undefined) throw e;
    this.sets++;
    this.data.set(key, String(value));
  }
}

const DIR = 'BASCUS-97275SOCOMII';
const KEY1 = 's2u.card.v1.slot1';
const { Succeed, ChangedCard, NoFormat, NoEntry, DeniedPermit } = MC_RESULT;

function setup() {
  const storage = new MemoryStorage();
  const lines: string[] = [];
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const mc = new Libmc(slots, { log: (l) => lines.push(l), now: () => 9_000 });
  const card = slots.slot(1);
  const put = {
    dir(path: string): void {
      const r = card.makeDir(path, card.info().rev as number);
      if (!r.ok) throw new Error(JSON.stringify(r.failure));
    },
    file(path: string, size: number, data: unknown = null): void {
      const r = card.writeFile(path, size, data, card.info().rev as number);
      if (!r.ok) throw new Error(JSON.stringify(r.failure));
    },
  };
  return { storage, lines, slots, mc, card, put };
}

type Setup = ReturnType<typeof setup>;

/** The card with the save folder, two of its files and an empty folder beside it. */
function withSave(): Setup {
  const s = setup();
  s.put.dir(DIR);
  s.put.file(`${DIR}/icon.sys`, 964, { icon: true });
  s.put.file(`${DIR}/SaveGame0`, 1_952, { persona: 'A' });
  s.put.dir('OTHER');
  return s;
}

function failed(cmd: number, result: number, name: string): string {
  return `[mc] command ${cmd} FAILED result=${result} (${name}) card=${KEY1}`;
}

function paths(s: Setup): string[] {
  const r = s.card.read();
  if (r.kind !== 'record') return [];
  return [...Object.keys(r.record.dirs).map((d) => `${d}/`), ...Object.keys(r.record.files)].sort();
}

describe('Format (sceMcFormat, MemoryCard.cpp:959-989)', () => {
  const cases: readonly [string, (s: Setup) => void, number, number, number][] = [
    // name, arrange, port, slot, result
    ['a formatted card holding the save: Succeed (:978-983)', () => {}, 0, 0, Succeed],
    ['an unformatted card: Succeed, no format gate before it (:967-983)', (s) => { s.card.unformat(s.card.info().rev as number); }, 0, 0, Succeed],
    ['no card: NoEntry (:964, :967)', (s) => { s.card.remove(s.card.info().rev as number); }, 0, 0, NoEntry],
    ['port 2: NoEntry (isMcCardPresent :152-160, isValidMcPortSlot :131-134)', () => {}, 2, 0, NoEntry],
    ['slot 1 of port 0: NoEntry (:131-134)', () => {}, 0, 1, NoEntry],
    ['a damaged record: Succeed, a fresh card (research 99 §7.4: the one save a damaged record takes)', (s) => { s.storage.data.set(KEY1, '{'); }, 0, 0, Succeed],
  ];
  for (const [name, arrange, port, slot, result] of cases) {
    it(name, () => {
      const s = withSave();
      arrange(s);
      expect(s.mc.format(port, slot)).toBe(result);
      expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.Format, result });
      if (result === Succeed) {
        expect(s.card.info()).toMatchObject({ state: 'formatted', freeClusters: 8000 });
        expect(paths(s)).toEqual([]);
        expect(s.lines).toEqual([]);
      } else {
        expect(s.lines).toEqual([failed(MC_CMD.Format, result, 'NoEntry')]);
      }
    });
  }

  it("closes the port's handles (closeMcFilesForPortLocked :969, :639-656), not the other port's, and puts the port at the root (:980)", () => {
    const s = withSave();
    s.slots.slot(2).makeDir('X', 0);
    s.mc.chdir(0, 0, `/${DIR}`);
    s.mc.chdir(1, 0, '/X');
    const fd0 = s.mc.open(0, 0, 'icon.sys', FIO.O_RDONLY);
    const fd1 = s.mc.open(1, 0, '/X/f', FIO.O_WRONLY | FIO.O_CREAT);
    expect(s.mc.format(0, 0)).toBe(Succeed);
    expect(s.mc.close(fd0)).toBe(NoEntry);
    expect(s.mc.close(fd1)).toBe(Succeed);
    expect(s.mc.chdir(0, 0, '').currentDir).toBe('/');
    expect(s.mc.chdir(1, 0, '').currentDir).toBe('/X');
  });

  it('moves the revision as a save does; an empty formatted card is formatted without a write (research 99 §7.1)', () => {
    const s = withSave();
    const before = s.card.info().rev as number;
    expect(s.mc.format(0, 0)).toBe(Succeed);
    expect(s.card.info().rev).toBe(before + 1);
    const sets = s.storage.sets;
    expect(s.mc.format(0, 0)).toBe(Succeed);
    expect(s.storage.sets).toBe(sets);
    expect(s.card.info().rev).toBe(before + 1);
  });

  it('follows the re-read rule: another tab changed the card since the last read -> ChangedCard, once; then Succeed', () => {
    const s = withSave();
    s.mc.getInfo(0, 0);
    s.put.file(`${DIR}/SaveGame1`, 1_952);
    const stored = s.storage.data.get(KEY1);
    expect(s.mc.format(0, 0)).toBe(ChangedCard);
    expect(s.storage.data.get(KEY1)).toBe(stored);
    expect(s.lines).toEqual([failed(MC_CMD.Format, ChangedCard, 'ChangedCard')]);
    expect(s.mc.format(0, 0)).toBe(Succeed);
  });

  it("a storage that refuses the write: NoEntry, the card unchanged (the port's adaptation of :964, :972-978)", () => {
    const s = withSave();
    s.storage.failSet = () => new DOMException('full', 'QuotaExceededError');
    expect(s.mc.format(0, 0)).toBe(NoEntry);
    expect(paths(s)).not.toEqual([]);
  });
});

describe('Unformat (sceMcUnformat, MemoryCard.cpp:1608-1637)', () => {
  it('a formatted card: Succeed; the card is unformatted and empty (:1621-1629); GetInfo answers NoFormat, free 0', () => {
    const s = withSave();
    expect(s.mc.unformat(0, 0)).toBe(Succeed);
    expect(s.mc.getInfo(0, 0)).toEqual({ result: NoFormat, type: 2, free: 0, format: 0 });
    expect(s.mc.mkdir(0, 0, '/X')).toBe(NoFormat);
    expect(s.card.read()).toMatchObject({ kind: 'record', record: { formatted: false, files: {}, dirs: {} } });
  });

  it('an unformatted card: Succeed again, no format gate (:1616-1630)', () => {
    const s = withSave();
    s.card.unformat(s.card.info().rev as number);
    expect(s.mc.unformat(0, 0)).toBe(Succeed);
  });

  const refused: readonly [string, (s: Setup) => void, number, number, string][] = [
    ['no card: NoEntry (:1613, :1616)', (s) => { s.card.remove(s.card.info().rev as number); }, 0, NoEntry, 'NoEntry'],
    ['port 2: NoEntry (:131-134)', () => {}, 2, NoEntry, 'NoEntry'],
    ['a damaged record: the placeholder (the stub has no damaged card; research 134 §5)', (s) => { s.storage.data.set(KEY1, '{'); }, 0,
      MC_DAMAGED_RESULT_PLACEHOLDER, 'DeniedPermit'],
    ["a storage that refuses the write: NoEntry, the card unchanged (the port's adaptation of :1613, :1621-1624)", (s) => {
      s.storage.failSet = () => new DOMException('full', 'QuotaExceededError');
    }, 0, NoEntry, 'NoEntry'],
  ];
  for (const [name, arrange, port, result, resultName] of refused) {
    it(name, () => {
      const s = withSave();
      arrange(s);
      expect(s.mc.unformat(port, 0)).toBe(result);
      expect(s.lines).toEqual([failed(MC_CMD.Unformat, result, resultName)]);
    });
  }

  it("closes the port's handles and puts it at the root (:1618, :1627)", () => {
    const s = withSave();
    s.mc.chdir(0, 0, `/${DIR}`);
    const fd = s.mc.open(0, 0, 'icon.sys', FIO.O_RDONLY);
    expect(s.mc.unformat(0, 0)).toBe(Succeed);
    expect(s.mc.close(fd)).toBe(NoEntry);
    s.mc.format(0, 0);
    expect(s.mc.chdir(0, 0, '').currentDir).toBe('/');
  });
});

describe('SetFileInfo (sceMcSetFileInfo, MemoryCard.cpp:1524-1562): an existence check that sets nothing', () => {
  const cases: readonly [string, (s: Setup) => void, number, string, number][] = [
    // name, arrange, port, path, result
    ['a file: Succeed (:1551-1553)', () => {}, 0, `/${DIR}/icon.sys`, Succeed],
    ['a folder: Succeed (:1551-1553)', () => {}, 0, `/${DIR}`, Succeed],
    ['the root: Succeed (the card root exists)', () => {}, 0, '/', Succeed],
    ['relative to the current folder: Succeed', (s) => { s.mc.chdir(0, 0, `/${DIR}`); }, 0, 'SaveGame0', Succeed],
    ['nothing there: NoEntry (:1530, :1551)', () => {}, 0, `/${DIR}/nope`, NoEntry],
    ['a refused path: DeniedPermit (:1543-1545)', () => {}, 0, '/../escape', DeniedPermit],
    ['unformatted: NoFormat (:1536-1538)', (s) => { s.card.unformat(s.card.info().rev as number); }, 0, `/${DIR}`, NoFormat],
    ['no card: NoEntry (:1530, :1533)', (s) => { s.card.remove(s.card.info().rev as number); }, 0, `/${DIR}`, NoEntry],
    ['port 2: NoEntry (:131-134)', () => {}, 2, `/${DIR}`, NoEntry],
  ];
  for (const [name, arrange, port, path, result] of cases) {
    it(name, () => {
      const s = withSave();
      arrange(s);
      s.lines.length = 0;
      const sets = s.storage.sets;
      const rev = s.card.info().rev;
      expect(s.mc.setFileInfo(port, 0, path)).toBe(result);
      expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.SetFileInfo, result });
      expect(s.storage.sets).toBe(sets);
      expect(s.card.info().rev).toBe(rev);
      expect(s.lines.length).toBe(result < 0 ? 1 : 0);
    });
  }

  it("the FAILED line's text", () => {
    const s = withSave();
    s.mc.setFileInfo(0, 0, '/nope');
    expect(s.lines).toEqual([failed(MC_CMD.SetFileInfo, NoEntry, 'NoEntry')]);
  });
});

describe('GetEntSpace (sceMcGetEntSpace, MemoryCard.cpp:1169-1176)', () => {
  it('answers 1024 (:1173), the stub\'s constant', () => {
    expect(MC_ENT_SPACE).toBe(1024);
  });

  const cases: readonly [string, (s: Setup) => void, number, string][] = [
    ['the save folder', () => {}, 0, `/${DIR}`],
    ['a path that is not there', () => {}, 0, '/nope'],
    ['no card: the stub asks nothing of the card', (s) => { s.card.remove(s.card.info().rev as number); }, 0, '/'],
    ['an unformatted card', (s) => { s.card.unformat(s.card.info().rev as number); }, 0, '/'],
    ['port 7', () => {}, 7, '/'],
  ];
  for (const [name, arrange, port, path] of cases) {
    it(`${name}: 1024, no FAILED line, nothing written`, () => {
      const s = withSave();
      arrange(s);
      const sets = s.storage.sets;
      expect(s.mc.getEntSpace(port, 0, path)).toBe(MC_ENT_SPACE);
      expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.GetEntSpace, result: 1024 });
      expect(s.lines).toEqual([]);
      expect(s.storage.sets).toBe(sets);
    });
  }
});

describe('Rename (sceMcRename, MemoryCard.cpp:1439-1484)', () => {
  const cases: readonly [string, (s: Setup) => void, number, string, string, number, string[] | null][] = [
    // name, arrange, port, from, to, result, the card's paths after (null: unchanged)
    ['a file in its folder: Succeed (:1470-1474)', () => {}, 0, `/${DIR}/SaveGame0`, `/${DIR}/SaveGame9`, Succeed,
      [`${DIR}/`, `${DIR}/SaveGame9`, `${DIR}/icon.sys`, 'OTHER/']],
    ['a file into another folder: Succeed', () => {}, 0, `/${DIR}/SaveGame0`, '/OTHER/SaveGame0', Succeed,
      [`${DIR}/`, `${DIR}/icon.sys`, 'OTHER/', 'OTHER/SaveGame0']],
    ['relative to the current folder: Succeed', (s) => { s.mc.chdir(0, 0, `/${DIR}`); }, 0, 'SaveGame0', 'SaveGame1', Succeed,
      [`${DIR}/`, `${DIR}/SaveGame1`, `${DIR}/icon.sys`, 'OTHER/']],
    ['a folder with what it holds: Succeed', () => {}, 0, `/${DIR}`, '/MOVED', Succeed,
      ['MOVED/', 'MOVED/SaveGame0', 'MOVED/icon.sys', 'OTHER/']],
    ['onto an existing file: Succeed, it is replaced (both hosts\' rename replaces a file, :1473-1474)', () => {}, 0,
      `/${DIR}/SaveGame0`, `/${DIR}/icon.sys`, Succeed, [`${DIR}/`, `${DIR}/icon.sys`, 'OTHER/']],
    ['onto itself: Succeed, nothing changes', () => {}, 0, `/${DIR}/icon.sys`, `/${DIR}/icon.sys`, Succeed, null],
    ['nothing at `from`: NoEntry (:1446, :1470)', () => {}, 0, `/${DIR}/nope`, `/${DIR}/x`, NoEntry, null],
    ["`to`'s folder missing: NoEntry (:1446, :1471)", () => {}, 0, `/${DIR}/SaveGame0`, '/NODIR/x', NoEntry, null],
    ["`to`'s folder missing and `to` inside `from`: NoEntry (the existence checks come first, :1470-1471)", () => {}, 0,
      '/NOPE', '/NOPE/x', NoEntry, null],
    ['a refused `from`: DeniedPermit (:1460-1463)', () => {}, 0, '/../x', '/y', DeniedPermit, null],
    ['a refused `to`: DeniedPermit (:1460-1463)', () => {}, 0, `/${DIR}/SaveGame0`, '/../y', DeniedPermit, null],
    ['a file onto a folder: DeniedPermit (the host\'s rename fails, :1474)', () => {}, 0, `/${DIR}/SaveGame0`, '/OTHER',
      DeniedPermit, null],
    ['a folder onto a file: DeniedPermit (:1474)', () => {}, 0, '/OTHER', `/${DIR}/SaveGame0`, DeniedPermit, null],
    ['a folder onto a folder: DeniedPermit (:1474; Windows refuses it, cardSlots.rename)', () => {}, 0, '/OTHER', `/${DIR}`,
      DeniedPermit, null],
    ['a folder into itself: DeniedPermit (:1474)', () => {}, 0, `/${DIR}`, `/${DIR}/SUB`, DeniedPermit, null],
    ["`to`'s folder a file: DeniedPermit (the parent exists, the rename fails, :1471-1474)", () => {}, 0, '/OTHER',
      `/${DIR}/icon.sys/x`, DeniedPermit, null],
    ['the root as `from`: DeniedPermit (:1474)', () => {}, 0, '/', '/ROOT', DeniedPermit, null],
    ['the root as `to`: DeniedPermit (:1474)', () => {}, 0, '/OTHER', '/', DeniedPermit, null],
    ['unformatted: NoFormat (:1452-1454)', (s) => { s.card.unformat(s.card.info().rev as number); }, 0, `/${DIR}`, '/X',
      NoFormat, null],
    ['no card: NoEntry (:1446, :1449)', (s) => { s.card.remove(s.card.info().rev as number); }, 0, `/${DIR}`, '/X', NoEntry, null],
    ['port 2: NoEntry (:131-134)', () => {}, 2, `/${DIR}`, '/X', NoEntry, null],
  ];
  for (const [name, arrange, port, from, to, result, after] of cases) {
    it(name, () => {
      const s = withSave();
      arrange(s);
      s.lines.length = 0;
      const before = paths(s);
      const stored = s.storage.data.get(KEY1);
      expect(s.mc.rename(port, 0, from, to)).toBe(result);
      expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.Rename, result });
      if (after) expect(paths(s)).toEqual(after);
      else if (result !== Succeed || from === to) {
        expect(paths(s)).toEqual(before);
        expect(s.storage.data.get(KEY1)).toBe(stored);
      }
      expect(s.lines.length).toBe(result < 0 ? 1 : 0);
    });
  }

  it('a renamed file keeps its size and its JSON', () => {
    const s = withSave();
    s.mc.rename(0, 0, `/${DIR}/SaveGame0`, `/${DIR}/SaveGame9`);
    expect(s.card.readFile(`${DIR}/SaveGame9`)).toMatchObject({ ok: true, value: { size: 1_952, data: { persona: 'A' } } });
  });

  it("the FAILED line's text", () => {
    const s = withSave();
    s.mc.rename(0, 0, '/nope', '/x');
    expect(s.lines).toEqual([failed(MC_CMD.Rename, NoEntry, 'NoEntry')]);
  });

  it('a file a handle holds open -- as `from`, as `to`, or inside a folder renamed -- is DeniedPermit (the reading)', () => {
    expect(MC_RENAME_OPEN_FILE_DENIED_READING).toBe(true);
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDONLY);
    expect(s.mc.rename(0, 0, `/${DIR}/SaveGame0`, `/${DIR}/SaveGame9`)).toBe(DeniedPermit);
    expect(s.mc.rename(0, 0, `/${DIR}/icon.sys`, `/${DIR}/SaveGame0`)).toBe(DeniedPermit);
    expect(s.mc.rename(0, 0, `/${DIR}`, '/MOVED')).toBe(DeniedPermit);
    expect(s.mc.close(fd)).toBe(Succeed);
    expect(s.mc.rename(0, 0, `/${DIR}`, '/MOVED')).toBe(Succeed);
  });

  it('follows the re-read rule: a card changed by another tab -> ChangedCard, nothing written', () => {
    const s = withSave();
    s.mc.getInfo(0, 0);
    s.put.file(`${DIR}/SaveGame1`, 1_952);
    const stored = s.storage.data.get(KEY1);
    expect(s.mc.rename(0, 0, `/${DIR}/SaveGame0`, `/${DIR}/SaveGame9`)).toBe(ChangedCard);
    expect(s.storage.data.get(KEY1)).toBe(stored);
  });
});

// ---- the op-sequence harness, fed from the save chain as read (W15.R2) ----

// The lists (the 114 steps, and the page's flow and second save built on them) live in `mcReplay.ts`, shared with the
// page's own test (`packages/viewer/test/optionsSave.test.ts`, OPT-01).

describe('the op-sequence harness (W15.R2: a reading, fed from the save chain as read)', () => {
  it('replays the options save on a fresh card without a divergence', () => {
    const s = setup();
    const steps = optionsSaveOnAFreshCard();
    expect(steps).toHaveLength(114);
    expect(replayMcOps(s.mc, steps)).toEqual({ replayed: steps.length, divergence: null });
  });

  it('the card it leaves: the twelve files at the f0 sizes; GetInfo 8000 before, 8000 less mcUsedClusters after', () => {
    const s = setup();
    expect(s.mc.getInfo(0, 0)).toEqual({ result: Succeed, type: 2, free: 8000, format: 1 });
    replayMcOps(s.mc, optionsSaveOnAFreshCard());
    const sizes = Object.fromEntries(
      Object.entries((s.card.read() as { record: { files: Record<string, { size: number }> } }).record.files)
        .map(([p, f]) => [p.slice(DIR.length + 1), f.size]),
    );
    expect(sizes).toEqual({
      [DIR]: 4_784, 'icon.sys': 964, 'LIST.ICO': 50_234, 'PATCHFILE.DAT': 2_048_000, 'SCRATCHPAD.DAT': 944_128,
      SaveGame0: 1_952, SaveGame1: 1_952, SaveGame2: 1_952, SaveGame3: 1_952, SaveGame4: 1_952, SaveGame5: 1_952,
      SaveGame6: 1_952,
    });
    // One cluster for the folder; 5 + 1 + 50 + 2000 + 922 + 7 x 2 for the files (MemoryCard.cpp:245-288).
    expect(s.mc.getInfo(0, 0)).toEqual({ result: Succeed, type: 2, free: 8000 - 2993, format: 1 });
  });

  it('its only failures are the NoEntry deletes of files not there yet (KNOWN [card-folder])', () => {
    const s = setup();
    replayMcOps(s.mc, optionsSaveOnAFreshCard());
    expect(s.lines).toEqual(Array.from({ length: 9 }, () => failed(MC_CMD.Delete, NoEntry, 'NoEntry')));
  });

  it("reports the first divergence: the pre-fix trace's `cmd=13 result=-5` for '..' is not what the read chain answers", () => {
    const s = setup();
    const steps = optionsSaveOnAFreshCard();
    const prefix: McStep[] = [...steps.slice(0, 1), { ...steps[1]!, expect: DeniedPermit }, ...steps.slice(2)];
    expect(replayMcOps(s.mc, prefix)).toEqual({
      replayed: 1,
      divergence: { index: 1, step: prefix[1], got: { cmd: MC_CMD.GetDir, result: 1 } },
    });
  });

  it("the page's flow (OPT-01): save_and_leave's 124 steps hold the 114 in order, and replay without a divergence", () => {
    const s = setup();
    const flow = optionsSaveAndLeaveOnAFreshCard();
    const read = optionsSaveOnAFreshCard();
    expect(flow).toHaveLength(124);
    // The probe after the checks and the first Ensure_MC_Dirs_Fast; Ensure_MC_Dirs after the space check and the second.
    expect(flow.slice(6, 6 + OPTIONS_SAVE_PROBE_STEPS)).toEqual(read.slice(0, OPTIONS_SAVE_PROBE_STEPS));
    expect(flow.slice(11)).toEqual(read.slice(OPTIONS_SAVE_PROBE_STEPS));
    expect(replayMcOps(s.mc, flow)).toEqual({ replayed: 124, divergence: null });
  });

  it('the second save (OPT-01): 39 steps on the card the first left, no divergence, no FAILED line, the same twelve files', () => {
    const s = setup();
    replayMcOps(s.mc, optionsSaveAndLeaveOnAFreshCard());
    s.lines.length = 0;
    const second = optionsSaveAndLeaveOnASavedCard();
    expect(second).toHaveLength(39);
    expect(replayMcOps(s.mc, second)).toEqual({ replayed: 39, divergence: null });
    expect(s.lines).toEqual([]);
    expect(Object.keys((s.card.read() as { record: { files: Record<string, unknown> } }).record.files)).toHaveLength(12);
    expect(s.mc.getInfo(0, 0)).toEqual({ result: Succeed, type: 2, free: 8000 - 2993, format: 1 });
  });

  it('a result that differs from what Sync reports diverges, and the replay stops there', () => {
    const s = setup();
    const steps: McStep[] = [{ cmd: 'Mkdir', args: [0, 0, '/A'], expect: Succeed }, { cmd: 'Chdir', args: [0, 0, '/B'], expect: Succeed }];
    expect(replayMcOps(s.mc, steps)).toEqual({
      replayed: 1,
      divergence: { index: 1, step: steps[1], got: { cmd: MC_CMD.Chdir, result: NoEntry } },
    });
  });
});
