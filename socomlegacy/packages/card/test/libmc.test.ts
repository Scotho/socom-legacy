import { describe, expect, it } from 'vitest';
import {
  CardSlots, FIO, Libmc, MC_ATTR, MC_CMD, MC_DAMAGED_GETINFO_PLACEHOLDER, MC_DAMAGED_RESULT_PLACEHOLDER,
  MC_DELETE_OPEN_FILE_DENIED_READING, MC_ENTRY_NAME_MAX, MC_MAX_OPEN_FILES, MC_RESULT,
  normalizeMcPath, StoreError, type CardStorage,
} from '../src/index';

/**
 * PLAT-26a (research 134): libmc's file commands as the recompilation's stub answers them
 * (`third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp`, cited by line), over PLAT-25's slots on a
 * file table built in the test. Each table row is a transcription of the stub's branch it names.
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
const { Succeed, ChangedCard, NoFormat, FullDevice, NoEntry, DeniedPermit, NotEmpty, UpLimitHandle } = MC_RESULT;

function setup(options: { trace?: boolean } = {}) {
  const storage = new MemoryStorage();
  const heard: StoreError[] = [];
  const lines: string[] = [];
  const slots = new CardSlots(() => storage, (e) => heard.push(e), { now: () => 5_000 });
  const mc = new Libmc(slots, { log: (l) => lines.push(l), now: () => 9_000, ...options });
  const card = slots.slot(1);
  /** Builds the table directly (PLAT-25's operations), as a card the test starts from. */
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
  return { storage, heard, lines, slots, mc, card, put };
}

/** The card with the save folder and two of its files. */
function withSave(options: { trace?: boolean } = {}) {
  const s = setup(options);
  s.put.dir(DIR);
  s.put.file(`${DIR}/icon.sys`, 964, { icon: true });
  s.put.file(`${DIR}/SaveGame0`, 1_952, { persona: 'A' });
  return s;
}

function size(s: ReturnType<typeof setup>, path: string): number | undefined {
  const r = s.card.stat(path);
  return r.ok ? r.value.size : undefined;
}

describe('the constants, transcribed', () => {
  it('the sixteen commands and the eight results (MemoryCard.cpp:14-38)', () => {
    expect(MC_CMD).toEqual({
      GetInfo: 0x01, Open: 0x02, Close: 0x03, Seek: 0x04, Read: 0x05, Write: 0x06, Flush: 0x0a, Mkdir: 0x0b,
      Chdir: 0x0c, GetDir: 0x0d, SetFileInfo: 0x0e, Delete: 0x0f, Format: 0x10, Unformat: 0x11, GetEntSpace: 0x12,
      Rename: 0x13,
    });
    expect(MC_RESULT).toEqual({
      Succeed: 0, ChangedCard: -1, NoFormat: -2, FullDevice: -3, NoEntry: -4, DeniedPermit: -5, NotEmpty: -6,
      UpLimitHandle: -7,
    });
  });

  it('the open flags and seek origins (ps2_memory.h:53-65), the attributes (MemoryCard.cpp:52-57), 3 handles (MCMAN 0x6ba0; C8 U5)', () => {
    expect(FIO).toEqual({
      O_RDONLY: 0x1, O_WRONLY: 0x2, O_RDWR: 0x3, O_APPEND: 0x100, O_CREAT: 0x200, O_TRUNC: 0x400,
      SEEK_SET: 0, SEEK_CUR: 1, SEEK_END: 2,
    });
    expect(MC_ATTR).toEqual({ Readable: 0x1, Writeable: 0x2, File: 0x10, Subdir: 0x20, Closed: 0x80, Exists: 0x8000 });
    expect(MC_MAX_OPEN_FILES).toBe(3);
    expect(MC_ENTRY_NAME_MAX).toBe(31);
  });
});

describe('GetInfo (MemoryCard.cpp:1178-1249)', () => {
  const cases: readonly [string, (s: ReturnType<typeof setup>) => void, number, number, number, number, number][] = [
    // name, arrange, port, result, type, free, format
    ['an empty card: type 2, free 8000, format 1', () => {}, 0, Succeed, 2, 8000, 1],
    ['the folder and two files: 1 + 1 + 2 clusters used', (s) => {
      s.put.dir(DIR); s.put.file(`${DIR}/icon.sys`, 964); s.put.file(`${DIR}/SaveGame0`, 1952);
    }, 0, Succeed, 2, 7996, 1],
    ['unformatted: type 2, free 0, format 0, NoFormat (:1203-1206)', (s) => {
      s.card.unformat(s.card.info().rev as number);
    }, 0, NoFormat, 2, 0, 0],
    ['no card: type 0, NoEntry (:1215-1218)', (s) => { s.card.remove(s.card.info().rev as number); }, 0, NoEntry, 0, 0, 0],
    ['port 2 is no port: type 0, NoEntry (:131-134)', () => {}, 2, NoEntry, 0, 0, 0],
    ['the damaged record: the placeholder', (s) => { s.storage.data.set(KEY1, '{'); }, 0,
      MC_DAMAGED_RESULT_PLACEHOLDER, MC_DAMAGED_GETINFO_PLACEHOLDER.type, MC_DAMAGED_GETINFO_PLACEHOLDER.free,
      MC_DAMAGED_GETINFO_PLACEHOLDER.format],
  ];
  for (const [name, arrange, port, result, type, free, format] of cases) {
    it(name, () => {
      const s = setup();
      arrange(s);
      expect(s.mc.getInfo(port, 0)).toEqual({ result, type, free, format });
    });
  }

  it('slot 1 of a port is no card: the stub takes slot 0 only (:131-134)', () => {
    expect(setup().mc.getInfo(0, 1)).toEqual({ result: NoEntry, type: 0, free: 0, format: 0 });
  });

  it('port 1 is slot 2: its own card', () => {
    const s = setup();
    s.slots.slot(2).remove(0);
    expect(s.mc.getInfo(1, 0).type).toBe(0);
    expect(s.mc.getInfo(0, 0).type).toBe(2);
  });
});

describe('the guest path (normalizeGuestMcPathLocked, MemoryCard.cpp:395-465; isSafeMcPathComponent :750-758)', () => {
  const cases: readonly [string, string, string | null][] = [
    ['/', '/', '/'],
    ['/', '', '/'],
    ['/', '.', '/'],
    ['/', 'mc0:/BASCUS-97275SOCOMII', '/BASCUS-97275SOCOMII'],
    ['/', 'MC1:icon.sys', '/icon.sys'],
    ['/', '\\A\\B', '/A/B'],
    ['/', '//A///B/', '/A/B'],
    ['/D', 'x', '/D/x'],
    ['/D', '/x', '/x'],
    ['/D', '../x', '/x'],
    ['/', '..', '/'],
    ['/', 'a/../..', '/'],
    ['/', '/../escape.bin', null],
    ['/', '../x', null],
    ['/', 'a:b', null],
    ['/', 'mc2:/x', null],
    ['/', 'a.', null],
    ['/', 'a ', null],
    ['/', '*.zdb', '/*.zdb'],
  ];
  for (const [cwd, path, want] of cases) {
    it(`"${path}" from "${cwd}" -> ${want === null ? 'refused' : `"${want}"`}`, () => {
      expect(normalizeMcPath(cwd, path)).toBe(want);
    });
  }
});

describe('Open (MemoryCard.cpp:1330-1399; the modes :689-734)', () => {
  const R = FIO.O_RDONLY;
  const W = FIO.O_WRONLY;
  const RW = FIO.O_RDWR;
  const C = FIO.O_CREAT;
  const cases: readonly [string, string, number, number | 'fd'][] = [
    ['an existing file, read', `/${DIR}/icon.sys`, R, 'fd'],
    ['an existing file, read and write', `/${DIR}/icon.sys`, RW, 'fd'],
    ['a missing file without CREAT: NoEntry (:1369-1371)', `/${DIR}/LIST.ICO`, R, NoEntry],
    ['a missing file, write and CREAT (the game\'s 0x202, D:L295574)', `/${DIR}/LIST.ICO`, W | C, 'fd'],
    ['a missing file, read only and CREAT: fopen "rb" fails, NoEntry (:1379-1383)', `/${DIR}/LIST.ICO`, R | C, NoEntry],
    ['in a missing folder: NoEntry (:1373-1376)', '/NOPE/x', W | C, NoEntry],
    ['under a file: NoEntry (:1373-1383)', `/${DIR}/icon.sys/x`, W | C, NoEntry],
    ['the root: DeniedPermit (:1361-1364)', '/', R, DeniedPermit],
    ['a folder: DeniedPermit (:1365-1368)', `/${DIR}`, R, DeniedPermit],
    ['a path that climbs out: DeniedPermit (:1357-1360)', '/../x', W | C, DeniedPermit],
  ];
  for (const [name, path, flags, want] of cases) {
    it(name, () => {
      const s = withSave();
      const r = s.mc.open(0, 0, path, flags);
      if (want === 'fd') expect(r).toBeGreaterThan(0);
      else expect(r).toBe(want);
    });
  }

  it('CREAT makes a 0-byte file at the open (fopen "wb", :723-725)', () => {
    const s = withSave();
    expect(s.mc.open(0, 0, `/${DIR}/LIST.ICO`, FIO.O_WRONLY | FIO.O_CREAT)).toBe(1);
    expect(size(s, `${DIR}/LIST.ICO`)).toBe(0);
  });

  it('TRUNC empties an existing file (fopen "wb", :723-725); without it the file is kept ("r+b", :727-730)', () => {
    const s = withSave();
    expect(s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY)).toBeGreaterThan(0);
    expect(size(s, `${DIR}/SaveGame0`)).toBe(1952);
    expect(s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY | FIO.O_TRUNC)).toBeGreaterThan(0);
    expect(size(s, `${DIR}/SaveGame0`)).toBe(0);
  });

  it('an unformatted card: NoFormat; no card: NoEntry; a damaged one: the placeholder (:1340-1346)', () => {
    const a = setup();
    a.card.unformat(0);
    expect(a.mc.open(0, 0, '/x', FIO.O_WRONLY | FIO.O_CREAT)).toBe(NoFormat);
    const b = setup();
    b.card.remove(0);
    expect(b.mc.open(0, 0, '/x', FIO.O_WRONLY | FIO.O_CREAT)).toBe(NoEntry);
    const c = setup();
    c.storage.data.set(KEY1, 'not json');
    expect(c.mc.open(0, 0, '/x', FIO.O_WRONLY | FIO.O_CREAT)).toBe(MC_DAMAGED_RESULT_PLACEHOLDER);
  });

  it('handles count from 1, and the 4th open is UpLimitHandle -- after its CREAT made the file (:658-687, :1379-1391; MCMAN 0x6bac-0x6bbc)', () => {
    const s = setup();
    for (let i = 1; i <= MC_MAX_OPEN_FILES; i++) expect(s.mc.open(0, 0, `/f${i}`, FIO.O_WRONLY | FIO.O_CREAT)).toBe(i);
    expect(s.mc.open(0, 0, '/f4', FIO.O_WRONLY | FIO.O_CREAT)).toBe(UpLimitHandle);
    expect(size(s, 'f4')).toBe(0);
    expect(s.mc.close(2)).toBe(Succeed);
    expect(s.mc.open(0, 0, '/f4', FIO.O_RDONLY)).toBe(4);
  });

  it('a relative path is taken from the port\'s current folder (:407-410)', () => {
    const s = withSave();
    expect(s.mc.chdir(0, 0, `/${DIR}`)).toEqual({ result: Succeed, currentDir: `/${DIR}` });
    expect(s.mc.open(0, 0, 'icon.sys', FIO.O_RDONLY)).toBeGreaterThan(0);
  });
});

describe('Close and Flush (MemoryCard.cpp:851-869, :943-957)', () => {
  it('a handle closes once; an unknown one is NoEntry', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/icon.sys`, FIO.O_RDONLY);
    expect(s.mc.flush(fd)).toBe(Succeed);
    expect(s.mc.close(fd)).toBe(Succeed);
    expect(s.mc.close(fd)).toBe(NoEntry);
    expect(s.mc.flush(fd)).toBe(NoEntry);
    expect(s.mc.close(99)).toBe(NoEntry);
  });
});

describe('Seek, Read and Write (MemoryCard.cpp:1486-1522, :1401-1437, :1639-1705)', () => {
  it('Seek answers the new position: SET, CUR, END; anything else is SET (:1498-1506); before 0 is DeniedPermit', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDONLY);
    expect(s.mc.seek(fd, 100, FIO.SEEK_SET)).toBe(100);
    expect(s.mc.seek(fd, 0, FIO.SEEK_CUR)).toBe(100);
    expect(s.mc.seek(fd, -2, FIO.SEEK_CUR)).toBe(98);
    expect(s.mc.seek(fd, 0, FIO.SEEK_END)).toBe(1952);
    expect(s.mc.seek(fd, 10, 7)).toBe(10);
    expect(s.mc.seek(fd, -11, FIO.SEEK_CUR)).toBe(DeniedPermit);
    expect(s.mc.seek(fd, 0, FIO.SEEK_CUR)).toBe(10);
    expect(s.mc.seek(fd, 5000, FIO.SEEK_SET)).toBe(5000);
    expect(s.mc.seek(99, 0, FIO.SEEK_SET)).toBe(NoEntry);
  });

  it('Read answers the bytes it read, up to the end, and the file\'s JSON (R7: the contents are ours)', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDONLY);
    expect(s.mc.read(fd, 1000)).toEqual({ result: 1000, data: { persona: 'A' } });
    expect(s.mc.read(fd, 1000)).toEqual({ result: 952, data: { persona: 'A' } });
    expect(s.mc.read(fd, 1000)).toEqual({ result: 0, data: { persona: 'A' } });
    expect(s.mc.read(fd, 0)).toEqual({ result: 0 });
    expect(s.mc.read(fd, -1)).toEqual({ result: 0 });
    expect(s.mc.read(99, 10)).toEqual({ result: NoEntry });
  });

  it('Read of a write-only handle on an existing file, no APPEND or TRUNC, reads: fopen "r+b" (:717-731, :1426)', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY);
    expect(s.mc.read(fd, 10)).toEqual({ result: 10, data: { persona: 'A' } });
    // The game's 0x202 (WRONLY|CREAT) on a file already there is "r+b" too (:726-729).
    const fd2 = s.mc.open(0, 0, `/${DIR}/SaveGame0`, 0x202);
    expect(s.mc.read(fd2, 10)).toEqual({ result: 10, data: { persona: 'A' } });
  });

  it('Read of a write-only "wb" / "ab" handle is DeniedPermit (fread fails, :719-725, :1427)', () => {
    const s = withSave();
    const trunc = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY | FIO.O_TRUNC);
    expect(s.mc.read(trunc, 10)).toEqual({ result: DeniedPermit });
    const append = s.mc.open(0, 0, `/${DIR}/icon.sys`, FIO.O_WRONLY | FIO.O_APPEND);
    expect(s.mc.read(append, 10)).toEqual({ result: DeniedPermit });
    const created = s.mc.open(0, 0, `/${DIR}/NEW.DAT`, 0x202);
    expect(s.mc.read(created, 10)).toEqual({ result: DeniedPermit });
  });

  it('Write answers the bytes written; the file grows to the end; data replaces the JSON, none keeps it', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/icon.sys`, FIO.O_WRONLY | FIO.O_TRUNC);
    expect(s.mc.write(fd, 0x3c4, { icon: 2 })).toBe(0x3c4);
    expect(s.card.readFile(`${DIR}/icon.sys`)).toMatchObject({ ok: true, value: { size: 964, data: { icon: 2 } } });
    expect(s.mc.seek(fd, 0, FIO.SEEK_SET)).toBe(0);
    expect(s.mc.write(fd, 10)).toBe(10);
    expect(s.card.readFile(`${DIR}/icon.sys`)).toMatchObject({ ok: true, value: { size: 964, data: { icon: 2 } } });
    expect(s.mc.write(fd, 0)).toBe(0);
    expect(s.mc.write(99, 10)).toBe(NoEntry);
  });

  it('the filler: Seek to (n-1) x 1 KB, Write 1 KB, gives an n KB file (FUN_003a1980 D:L296063-296073)', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/PATCHFILE.DAT`, 0x202);
    expect(s.mc.seek(fd, (2000 - 1) * 0x400, 0)).toBe(1999 * 1024);
    expect(s.mc.write(fd, 0x400)).toBe(0x400);
    expect(s.mc.close(fd)).toBe(Succeed);
    expect(size(s, `${DIR}/PATCHFILE.DAT`)).toBe(2_048_000);
    expect(s.mc.getInfo(0, 0).free).toBe(8000 - 1 - 1 - 2 - 2000);
  });

  it('APPEND writes at the end ("ab", :719-722)', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY | FIO.O_APPEND);
    expect(s.mc.write(fd, 48)).toBe(48);
    expect(size(s, `${DIR}/SaveGame0`)).toBe(2000);
  });

  it('a growth that does not fit is FullDevice, whole, nothing written; inside the old clusters it fits (:1664-1681)', () => {
    const s = withSave();
    s.put.file('fill', (8000 - 4 - 1) * 1024);
    expect(s.mc.getInfo(0, 0).free).toBe(1);
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDWR);
    const before = s.storage.sets;
    expect(s.mc.seek(fd, 0, FIO.SEEK_END)).toBe(1952);
    expect(s.mc.write(fd, 96 + 1024 + 1)).toBe(FullDevice);
    expect(s.storage.sets).toBe(before);
    expect(s.mc.write(fd, 96 + 1024)).toBe(1120);
    expect(s.mc.getInfo(0, 0).free).toBe(0);
    expect(s.mc.write(fd, 1)).toBe(FullDevice);
    expect(s.mc.seek(fd, 0, FIO.SEEK_SET)).toBe(0);
    expect(s.mc.write(fd, 3072)).toBe(3072);
  });

  it('Write on a read-only handle: FullDevice first when it does not fit, else DeniedPermit (:1678-1685)', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDONLY);
    expect(s.mc.write(fd, 10)).toBe(DeniedPermit);
    expect(s.mc.seek(fd, 0, FIO.SEEK_END)).toBe(1952);
    expect(s.mc.write(fd, 9000 * 1024)).toBe(FullDevice);
    expect(size(s, `${DIR}/SaveGame0`)).toBe(1952);
  });

  it('Write on a read-only handle growing by exactly one cluster on a full card is FullDevice (:1678-1681)', () => {
    const s = withSave();
    s.put.file('fill', (8000 - 4) * 1024);
    expect(s.mc.getInfo(0, 0).free).toBe(0);
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_RDONLY);
    expect(s.mc.seek(fd, 0, FIO.SEEK_END)).toBe(1952);
    expect(s.mc.write(fd, 97)).toBe(FullDevice);
    expect(s.mc.write(fd, 96)).toBe(DeniedPermit);
  });

  it('a setItem that throws is DeniedPermit (the stub\'s ferror, :1685), reported, the record unchanged', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY);
    const before = s.storage.data.get(KEY1);
    s.storage.failSet = () => new DOMException('full', 'QuotaExceededError');
    expect(s.mc.write(fd, 10, { persona: 'B' })).toBe(DeniedPermit);
    expect(s.storage.data.get(KEY1)).toBe(before);
    expect(s.heard).toHaveLength(1);
  });
});

describe('Mkdir (MemoryCard.cpp:1278-1328)', () => {
  const cases: readonly [string, string, number][] = [
    ['a new folder', '/NEW', Succeed],
    ['one already there is Succeed (:1306-1308)', `/${DIR}`, Succeed],
    ['the root is a folder already there', '/', Succeed],
    ['over a file: DeniedPermit (:1308)', `/${DIR}/icon.sys`, DeniedPermit],
    ['under a file: DeniedPermit (:1316-1318)', `/${DIR}/icon.sys/x`, DeniedPermit],
    ['in a missing folder: NoEntry (:1316-1318)', '/NOPE/x', NoEntry],
    ['a refused path: DeniedPermit (:1298-1301)', '/a:b', DeniedPermit],
  ];
  for (const [name, path, want] of cases) {
    it(name, () => {
      const s = withSave();
      expect(s.mc.mkdir(0, 0, path)).toBe(want);
    });
  }

  it('makes the folder, which costs one cluster; one already there writes nothing', () => {
    const s = withSave();
    expect(s.mc.mkdir(0, 0, '/NEW')).toBe(Succeed);
    expect(s.card.stat('NEW')).toMatchObject({ ok: true, value: { kind: 'dir' } });
    const sets = s.storage.sets;
    expect(s.mc.mkdir(0, 0, '/NEW')).toBe(Succeed);
    expect(s.storage.sets).toBe(sets);
  });

  it('NoFormat on an unformatted card, NoEntry with no card', () => {
    const a = setup();
    a.card.unformat(0);
    expect(a.mc.mkdir(0, 0, '/X')).toBe(NoFormat);
    const b = setup();
    b.card.remove(0);
    expect(b.mc.mkdir(0, 0, '/X')).toBe(NoEntry);
  });
});

describe('Chdir (MemoryCard.cpp:797-849)', () => {
  it('moves to a folder and answers it; a missing one or a file is NoEntry and keeps the old one', () => {
    const s = withSave();
    expect(s.mc.chdir(0, 0, `/${DIR}`)).toEqual({ result: Succeed, currentDir: `/${DIR}` });
    expect(s.mc.chdir(0, 0, '/NOPE')).toEqual({ result: NoEntry, currentDir: `/${DIR}` });
    expect(s.mc.chdir(0, 0, 'icon.sys')).toEqual({ result: NoEntry, currentDir: `/${DIR}` });
    expect(s.mc.chdir(0, 0, '')).toEqual({ result: Succeed, currentDir: `/${DIR}` });
    expect(s.mc.chdir(0, 0, '..')).toEqual({ result: Succeed, currentDir: '/' });
    expect(s.mc.chdir(0, 0, '..')).toEqual({ result: Succeed, currentDir: '/' });
    expect(s.mc.chdir(0, 0, '/../x')).toEqual({ result: DeniedPermit, currentDir: '/' });
  });

  it('each port keeps its own folder; NoFormat on an unformatted card', () => {
    const s = withSave();
    s.slots.slot(2).makeDir('B', 0);
    expect(s.mc.chdir(1, 0, '/B').result).toBe(Succeed);
    expect(s.mc.chdir(0, 0, '').currentDir).toBe('/');
    s.card.unformat(s.card.info().rev as number);
    expect(s.mc.chdir(0, 0, '/x')).toEqual({ result: NoFormat, currentDir: '/' });
  });
});

describe('GetDir (MemoryCard.cpp:991-1167)', () => {
  const FILE_ATTR = 0x8093;
  const DIR_ATTR = 0x80a3;

  it('a folder lists "." and ".." first, then its entries in the stub\'s order, with sizes and attributes', () => {
    const s = withSave();
    s.put.file(`${DIR}/LIST.ICO`, 50_234);
    const r = s.mc.getDir(0, 0, `/${DIR}/*`, 20);
    expect(r.result).toBe(5);
    expect(r.entries.map((e) => [e.name, e.size, e.attr])).toEqual([
      ['.', 0, DIR_ATTR], ['..', 0, DIR_ATTR], ['icon.sys', 964, FILE_ATTR], ['LIST.ICO', 50_234, FILE_ATTR],
      ['SaveGame0', 1952, FILE_ATTR],
    ]);
    expect(r.entries[0]!.mtime).toBe(9_000);
    expect(r.entries[2]!.mtime).toBe(5_000);
  });

  const cases: readonly [string, string, number, number, readonly string[]][] = [
    ['the root, by "/"', '/', 20, 3, ['.', '..', DIR]],
    ['the root, by ".." from the root (the virgin card\'s query, :419-445)', '..', 20, 3, ['.', '..', DIR]],
    ['the root, by ""', '', 20, 3, ['.', '..', DIR]],
    ['a folder named without a pattern lists it', `/${DIR}`, 20, 4, ['.', '..', 'icon.sys', 'SaveGame0']],
    ['a file named: itself (:1050-1054)', `/${DIR}/icon.sys`, 20, 1, ['icon.sys']],
    ['a missing name in a folder: 0', `/${DIR}/LIST.ICO`, 20, 0, []],
    ['a pattern no entry matches: 0 (the game\'s "*.zdb", D:L296008)', `/${DIR}/*.zdb`, 20, 0, []],
    ['"?" matches one character', `/${DIR}/SaveGame?`, 20, 1, ['SaveGame0']],
    ['matching is case-sensitive (wildcardMatch :548-585)', `/${DIR}/savegame*`, 20, 0, []],
    ['maxEntries cuts the list (:1130-1131)', `/${DIR}/*`, 1, 1, ['.']],
    ['maxEntries 0 lists nothing', `/${DIR}/*`, 0, 0, []],
    ['a missing folder: NoEntry (:1070-1071)', '/NOPE/*', 20, NoEntry, []],
  ];
  for (const [name, path, max, result, names] of cases) {
    it(name, () => {
      const s = withSave();
      const r = s.mc.getDir(0, 0, path, max);
      expect(r.result).toBe(result);
      expect(r.entries.map((e) => e.name)).toEqual(names);
    });
  }

  it('a refused path is DeniedPermit and says so on its own line (:1014-1023)', () => {
    const s = withSave();
    expect(s.mc.getDir(0, 0, '/../x', 20)).toEqual({ result: DeniedPermit, entries: [] });
    expect(s.lines[0]).toBe("[mc] GetDir REFUSED path '/../x' (not normalisable)");
  });

  it('a name past 31 characters is cut in the table (EntryName[32], :544-545)', () => {
    const s = setup();
    s.put.file('A'.repeat(40), 1);
    const r = s.mc.getDir(0, 0, '/*', 20);
    expect(r.entries[2]!.name).toBe('A'.repeat(MC_ENTRY_NAME_MAX));
  });

  it('NoFormat on an unformatted card', () => {
    const s = setup();
    s.card.unformat(0);
    expect(s.mc.getDir(0, 0, '/*', 20)).toEqual({ result: NoFormat, entries: [] });
  });
});

describe('Delete (MemoryCard.cpp:871-922)', () => {
  const cases: readonly [string, string, number][] = [
    ['a file', `/${DIR}/icon.sys`, Succeed],
    ['a missing file: NoEntry (the save\'s expected failure, KNOWN [card-folder])', `/${DIR}/PATCHFILE.DAT`, NoEntry],
    ['a folder with entries: NotEmpty (:900-904)', `/${DIR}`, NotEmpty],
    ['an empty folder', '/EMPTY', Succeed],
    ['the root: NoEntry (:894)', '/', NoEntry],
    ['a refused path: DeniedPermit (:890-893)', '/../x', DeniedPermit],
  ];
  for (const [name, path, want] of cases) {
    it(name, () => {
      const s = withSave();
      s.put.dir('EMPTY');
      expect(s.mc.delete(0, 0, path)).toBe(want);
    });
  }

  it('removes the entry and frees its clusters', () => {
    const s = withSave();
    expect(s.mc.delete(0, 0, `/${DIR}/SaveGame0`)).toBe(Succeed);
    expect(s.card.stat(`${DIR}/SaveGame0`).ok).toBe(false);
    expect(s.mc.getInfo(0, 0).free).toBe(8000 - 2);
  });

  it('a file held open is DeniedPermit, as on the stub\'s Windows host (the reading)', () => {
    const s = withSave();
    expect(MC_DELETE_OPEN_FILE_DENIED_READING).toBe(true);
    const fd = s.mc.open(0, 0, `/${DIR}/icon.sys`, FIO.O_RDONLY);
    expect(s.mc.delete(0, 0, `/${DIR}/icon.sys`)).toBe(DeniedPermit);
    s.mc.close(fd);
    expect(s.mc.delete(0, 0, `/${DIR}/icon.sys`)).toBe(Succeed);
  });

  it('NoFormat on an unformatted card, NoEntry with no card', () => {
    const a = setup();
    a.card.unformat(0);
    expect(a.mc.delete(0, 0, '/x')).toBe(NoFormat);
    const b = setup();
    b.card.remove(0);
    expect(b.mc.delete(0, 0, '/x')).toBe(NoEntry);
  });
});

describe('Sync, the FAILED line and the trace knob (MemoryCard.cpp:604-624, :1564-1606, :146-150)', () => {
  it('Sync: -1 when nothing is pending, then 1 with the last command and its result, once', () => {
    const s = withSave();
    expect(s.mc.sync()).toEqual({ ret: -1 });
    s.mc.open(0, 0, '/nope', FIO.O_RDONLY);
    expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.Open, result: NoEntry });
    expect(s.mc.sync()).toEqual({ ret: -1 });
    s.mc.getDir(0, 0, `/${DIR}/*`, 20);
    expect(s.mc.sync()).toEqual({ ret: 1, cmd: MC_CMD.GetDir, result: 4 });
  });

  it('a failure prints its line in every build; a success or a count prints none', () => {
    const s = withSave();
    s.mc.open(0, 0, '/nope', FIO.O_RDONLY);
    s.mc.getDir(0, 0, `/${DIR}/*`, 20);
    s.mc.mkdir(0, 0, '/X');
    s.mc.getInfo(0, 0);
    s.mc.sync();
    expect(s.lines).toEqual([`[mc] command 2 FAILED result=-4 (NoEntry) card=${KEY1}`]);
  });

  it('PS2X_MC_TRACE: GetInfo and Sync lines, only when it is on', () => {
    const s = setup({ trace: true });
    s.mc.getInfo(0, 0);
    s.mc.sync();
    expect(s.lines).toEqual([
      '[MC] GetInfo port=0 type=2 free=8000 format=1 result=0',
      '[MC] Sync cmd=1 result=0',
    ]);
  });
});

describe('ChangedCard: the re-read and the one retry (PLAT-26; research 99 §7.1, §7.9)', () => {
  it('a save to the slot that changed nothing on the card (an ext save) is retried and taken', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY);
    s.card.setExt('armory', { a: 1 }, s.card.info().rev as number);
    expect(s.mc.write(fd, 10, { persona: 'B' })).toBe(10);
    expect(s.card.readFile(`${DIR}/SaveGame0`)).toMatchObject({ ok: true, value: { data: { persona: 'B' } } });
  });

  it('another tab\'s change to the files is ChangedCard, nothing written; the next save goes through', () => {
    const s = withSave();
    const fd = s.mc.open(0, 0, `/${DIR}/SaveGame0`, FIO.O_WRONLY);
    s.put.file(`${DIR}/SaveGame1`, 1952, { other: 'tab' });
    const before = s.storage.data.get(KEY1);
    expect(s.mc.write(fd, 10, { persona: 'B' })).toBe(ChangedCard);
    expect(s.storage.data.get(KEY1)).toBe(before);
    expect(s.lines).toEqual([`[mc] command 6 FAILED result=-1 (ChangedCard) card=${KEY1}`]);
    expect(s.mc.write(fd, 10, { persona: 'B' })).toBe(10);
  });

  it('a card pulled and put back: the save after it is ChangedCard, once; the next goes through', () => {
    const s = withSave();
    s.mc.getInfo(0, 0);
    s.card.remove(s.card.info().rev as number);
    expect(s.mc.mkdir(0, 0, '/X')).toBe(NoEntry);
    s.card.insert(s.card.info().rev as number);
    expect(s.mc.mkdir(0, 0, '/X')).toBe(ChangedCard);
    expect(s.mc.mkdir(0, 0, '/X')).toBe(Succeed);
  });

  it('the first save of a session takes the slot as it finds it', () => {
    const s = withSave();
    expect(s.mc.mkdir(0, 0, '/X')).toBe(Succeed);
  });
});

describe('the five PLAT-26a left refused answer now (PLAT-26; their tables: libmcCommands.test.ts)', () => {
  // Until PLAT-26 each threw McNotPortedError and logged "[mc] command <n> NOT PORTED (PLAT-26)" (research 134 §6).
  const calls: readonly [string, number, (mc: Libmc) => unknown][] = [
    ['Format', MC_CMD.Format, (mc) => mc.format(0, 0)],
    ['Unformat', MC_CMD.Unformat, (mc) => mc.unformat(0, 0)],
    ['SetFileInfo', MC_CMD.SetFileInfo, (mc) => mc.setFileInfo(0, 0, `/${DIR}`)],
    ['GetEntSpace', MC_CMD.GetEntSpace, (mc) => mc.getEntSpace(0, 0, `/${DIR}`)],
    ['Rename', MC_CMD.Rename, (mc) => mc.rename(0, 0, `/${DIR}/icon.sys`, `/${DIR}/icon.bak`)],
  ];
  for (const [name, cmd, call] of calls) {
    it(`${name} (command ${cmd}) returns its result and leaves it for Sync, once; nothing says "not ported"`, () => {
      const s = withSave();
      const result = call(s.mc);
      expect(typeof result).toBe('number');
      expect(s.mc.sync()).toEqual({ ret: 1, cmd, result });
      expect(s.mc.sync()).toEqual({ ret: -1 });
      expect(s.lines.some((l) => l.includes('NOT PORTED'))).toBe(false);
    });
  }
});

describe('Init and End (MemoryCard.cpp:1256-1276, :924-941)', () => {
  it('close every handle, count handles from 1 again, and put each port at the root', () => {
    const s = withSave();
    s.mc.chdir(0, 0, `/${DIR}`);
    expect(s.mc.open(0, 0, 'icon.sys', FIO.O_RDONLY)).toBe(1);
    expect(s.mc.init()).toBe(0);
    expect(s.mc.close(1)).toBe(NoEntry);
    expect(s.mc.chdir(0, 0, '').currentDir).toBe('/');
    expect(s.mc.open(0, 0, `/${DIR}/icon.sys`, FIO.O_RDONLY)).toBe(1);
    expect(s.mc.end()).toBe(0);
    expect(s.mc.close(1)).toBe(NoEntry);
  });
});
