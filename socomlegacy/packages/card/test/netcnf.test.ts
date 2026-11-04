import { describe, expect, it } from 'vitest';
import {
  CardSlots, FIO, Libmc, MC_RESULT, NETCNF_ATTACH_CONTENTS_READING, NETCNF_COLUMNS_READING, NETCNF_DIR, NETCNF_ENTRY_FLAGS_READING,
  NETCNF_FILES, NETCNF_INDEX_PATH, NETCNF_MALFORMED_RESULT_PLACEHOLDER, NETCNF_NO_INDEX_IS_EMPTY_READING,
  clustersFor, ensureNetCnf, netCnfCombinationList, netCnfDisplayName, netCnfIndexText,
  netCnfNetText, netCnfOpen, netCnfRows, type CardStorage, type NetCnfEntry,
} from '../src/index';

/**
 * ONL-01a (research 136): the saved network configuration on the virtual card -- Sony's `BWNETCNF` folder as the
 * set-up program leaves it on a card (the PCSX2 card of PC research 18 c, listed), its `data` our JSON naming our
 * server -- written at first use through PLAT-26a's libmc, and read back as `NetCnfOpen` (`FUN_00277dd0`) builds
 * LOGIN's `NETCNF_DB` rows from eznetcnf's combination list.
 */

class RecordingStorage implements CardStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.data.set(key, String(value));
  }
}

const SERVER = 'wss://central.example/ws';
const { Succeed, NoEntry, FullDevice } = MC_RESULT;

function setup() {
  const storage = new RecordingStorage();
  const slots = new CardSlots(() => storage, () => undefined, { now: () => 5_000 });
  const mc = new Libmc(slots, { log: () => undefined, now: () => 9_000 });
  return { storage, slots, mc };
}

const freeOf = (s: ReturnType<typeof setup>, slot: 1 | 2): number => {
  const info = s.slots.slot(slot).info();
  if (info.state !== 'formatted') throw new Error(info.state);
  return info.freeClusters;
};

describe('the configuration as Sony\'s set-up program leaves it on the card', () => {
  it('names the folder, the index and the six files as the card lists them, in its directory order', () => {
    expect(NETCNF_DIR).toBe('/BWNETCNF');
    expect(NETCNF_INDEX_PATH).toBe('/BWNETCNF/BWNETCNF');
    expect(NETCNF_FILES.map((f) => [f.name, f.size])).toEqual([
      ['SYS_NET.ICO', 33_688], ['icon.sys', 964], ['dev000.dat', 113], ['BWNETCNF', 99], ['ifc000.dat', 52], ['net000.cnf', 100],
    ]);
  });

  it('the index and the combination file are, in the original\'s text, exactly their nominal sizes', () => {
    const index = NETCNF_FILES.find((f) => f.name === 'BWNETCNF')!;
    const net = NETCNF_FILES.find((f) => f.name === 'net000.cnf')!;
    expect(netCnfIndexText((index.data as { entries: never }).entries)).toBe(
      '0,1,net000.cnf,Combination1\n1,1,ifc000.dat,Setting 1\n2,1,dev000.dat,SCE/Ethernet (Network Adaptor)\n',
    );
    expect(netCnfIndexText((index.data as { entries: never }).entries).length).toBe(index.size);
    expect(netCnfNetText((net.data as { interface: never }).interface).length).toBe(net.size);
  });

  it('the attachments hold the disc\'s Ethernet settings, as readings', () => {
    expect(NETCNF_ATTACH_CONTENTS_READING.dev).toEqual({ type: 'nic', vendor: 'SCE', product: 'Ethernet (Network Adaptor)', phy_config: 'auto' });
    expect(NETCNF_ATTACH_CONTENTS_READING.ifc).toEqual({ type: 'nic', dhcp: true });
  });
});

describe('the write at first use (OT.R3)', () => {
  it('a slot without the file gets it, and the slot\'s free space falls by its nominal size', () => {
    const s = setup();
    const before = freeOf(s, 1);
    const out = ensureNetCnf(s.mc, 0, SERVER);
    expect(out).toEqual({ result: Succeed, written: true });
    const nominal = 1 + NETCNF_FILES.reduce((n, f) => n + clustersFor(f.size), 0);
    expect(nominal).toBe(39);
    expect(before - freeOf(s, 1)).toBe(nominal);
    const listed = s.slots.slot(1).list('BWNETCNF');
    expect(listed.ok && listed.value.map((e) => [e.name, e.size])).toEqual(
      [...NETCNF_FILES].map((f) => [f.name, f.size]).sort((a, b) => (String(a[0]).toLowerCase() < String(b[0]).toLowerCase() ? -1 : 1)),
    );
    const ifc = s.slots.slot(1).readFile('BWNETCNF/ifc000.dat');
    expect(ifc.ok && ifc.value.data).toEqual({ type: 'nic', dhcp: true, server: SERVER });
    // Slot 2 untouched.
    expect(s.storage.writes.every((k) => k === 's2u.card.v1.slot1')).toBe(true);
  });

  it('a slot with it is read and not rewritten', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const writes = s.storage.writes.length;
    const stored = s.storage.data.get('s2u.card.v1.slot1');
    expect(ensureNetCnf(s.mc, 0, 'wss://another.example/ws')).toEqual({ result: Succeed, written: false });
    expect(s.storage.writes.length).toBe(writes);
    expect(s.storage.data.get('s2u.card.v1.slot1')).toBe(stored);
    expect(netCnfCombinationList(s.mc, 'mc0:').entries[0]!.server).toBe(SERVER);
  });

  it('a card saved with the earlier ifc type `eth` is still read, and not rewritten (C8 #5: read both)', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const fd = s.mc.open(0, 0, `${NETCNF_DIR}/ifc000.dat`, FIO.O_WRONLY | FIO.O_TRUNC);
    expect(s.mc.write(fd, 52, { type: 'eth', dhcp: true, server: SERVER })).toBeGreaterThanOrEqual(0);
    expect(s.mc.close(fd)).toBe(Succeed);
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: Succeed, written: false });
    expect(netCnfOpen(s.mc, 'mc0:').ok).toBe(true);
    expect(netCnfCombinationList(s.mc, 'mc0:').entries[0]!.server).toBe(SERVER);
    const ifc = s.slots.slot(1).readFile('BWNETCNF/ifc000.dat');
    expect(ifc.ok && ifc.value.data).toEqual({ type: 'eth', dhcp: true, server: SERVER });
  });

  it('a card too full for it gets nothing, FullDevice', () => {
    const s = setup();
    const card = s.slots.slot(1);
    expect(card.writeFile('FILLER', (8000 - 38) * 1024, null, 0).ok).toBe(true);
    const writes = s.storage.writes.length;
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: FullDevice, written: false });
    expect(s.storage.writes.length).toBe(writes);
  });

  it('no card, or an unformatted one, gets nothing and answers libmc\'s result', () => {
    const s = setup();
    expect(s.slots.slot(2).remove(0).ok).toBe(true);
    expect(ensureNetCnf(s.mc, 1, SERVER).written).toBe(false);
    expect(ensureNetCnf(s.mc, 1, SERVER).result).toBeLessThan(0);
    expect(() => ensureNetCnf(s.mc, 0, '')).toThrow();
  });

  it('writes the index last: a write cut short leaves no index, and the next first use makes it whole', () => {
    const s = setup();
    let left = 4;   // the folder and three files reach the card, then setItem throws
    const real = s.storage.setItem.bind(s.storage);
    s.storage.setItem = (k: string, v: string) => {
      if (left-- <= 0) throw new DOMException('full', 'QuotaExceededError');
      real(k, v);
    };
    expect(ensureNetCnf(s.mc, 0, SERVER).written).toBe(false);
    expect(s.slots.slot(1).stat('BWNETCNF/BWNETCNF').ok).toBe(false);
    expect(netCnfOpen(s.mc, 'mc0:')).toEqual({ ok: true, rows: [] });
    s.storage.setItem = real;
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: Succeed, written: true });
    expect(netCnfOpen(s.mc, 'mc0:').rows).toEqual([['1', 'Setting 1', 'SCE/Ethernet (Network Adaptor)']]);
  });

  it('opens the six files for writing in the listed order with the index moved last', () => {
    const s = setup();
    const opened: string[] = [];
    const real = s.mc.open.bind(s.mc);
    s.mc.open = (port: number, slot: number, path: string, flags: number) => {
      if ((flags & FIO.O_WRONLY) !== 0) opened.push(path);
      return real(port, slot, path, flags);
    };
    expect(ensureNetCnf(s.mc, 0, SERVER).written).toBe(true);
    expect(opened).toEqual(['SYS_NET.ICO', 'icon.sys', 'dev000.dat', 'ifc000.dat', 'net000.cnf', 'BWNETCNF'].map((n) => `${NETCNF_DIR}/${n}`));
  });

  it('an index cut short after its open (its CREAT left 0 bytes) is ours and is made whole at the next first use', () => {
    const s = setup();
    const real = s.storage.setItem.bind(s.storage);
    let indexFd = -1;
    let armed = true;   // the first run only
    const open = s.mc.open.bind(s.mc);
    s.mc.open = (port: number, slot: number, path: string, flags: number) => {
      const fd = open(port, slot, path, flags);
      if (path === NETCNF_INDEX_PATH && (flags & FIO.O_WRONLY) !== 0) indexFd = fd;
      return fd;
    };
    const write = s.mc.write.bind(s.mc);
    s.mc.write = (fd: number, size: number, data?: unknown) => {
      if (armed && fd === indexFd) s.storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
      return write(fd, size, data);
    };
    expect(ensureNetCnf(s.mc, 0, SERVER).written).toBe(false);
    const left = s.slots.slot(1).stat('BWNETCNF/BWNETCNF');
    expect(left.ok && left.value.size).toBe(0);
    armed = false;
    s.storage.setItem = real;
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: Succeed, written: true });
    expect(netCnfOpen(s.mc, 'mc0:').rows).toEqual([['1', 'Setting 1', 'SCE/Ethernet (Network Adaptor)']]);
  });

  it('a cut-short folder on a nearly full card is finished in the space its missing clusters need', () => {
    const s = setup();
    let left = 3;   // the folder and SYS_NET.ICO reach the card, then setItem throws at icon.sys's open
    const real = s.storage.setItem.bind(s.storage);
    s.storage.setItem = (k: string, v: string) => {
      if (left-- <= 0) throw new DOMException('full', 'QuotaExceededError');
      real(k, v);
    };
    expect(ensureNetCnf(s.mc, 0, SERVER).written).toBe(false);
    s.storage.setItem = real;
    const ico = s.slots.slot(1).stat('BWNETCNF/SYS_NET.ICO');
    expect(ico.ok && ico.value.size).toBe(33_688);
    // What is missing: icon.sys, dev000.dat, BWNETCNF, ifc000.dat, net000.cnf, a cluster each.
    const missing = NETCNF_FILES.filter((f) => f.name !== 'SYS_NET.ICO').reduce((n, f) => n + clustersFor(f.size), 0);
    expect(missing).toBe(5);
    const card = s.slots.slot(1);
    expect(card.writeFile('FILLER', (freeOf(s, 1) - missing - 1) * 1024, null, card.info().rev).ok).toBe(true);
    expect(freeOf(s, 1)).toBe(missing + 1);
    const full = s.slots.slot(1);
    expect(full.writeFile('FILLER2', 1024, null, full.info().rev).ok).toBe(true);
    expect(freeOf(s, 1)).toBe(missing);
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: Succeed, written: true });
    expect(freeOf(s, 1)).toBe(0);
    expect(netCnfOpen(s.mc, 'mc0:').rows).toHaveLength(1);
  });

  it('a cut-short folder with one cluster too few gets nothing more, FullDevice', () => {
    const s = setup();
    let left = 3;
    const real = s.storage.setItem.bind(s.storage);
    s.storage.setItem = (k: string, v: string) => {
      if (left-- <= 0) throw new DOMException('full', 'QuotaExceededError');
      real(k, v);
    };
    ensureNetCnf(s.mc, 0, SERVER);
    s.storage.setItem = real;
    const card = s.slots.slot(1);
    expect(card.writeFile('FILLER', (freeOf(s, 1) - 4) * 1024, null, card.info().rev).ok).toBe(true);
    const writes = s.storage.writes.length;
    expect(ensureNetCnf(s.mc, 0, SERVER)).toEqual({ result: FullDevice, written: false });
    expect(s.storage.writes.length).toBe(writes);
  });

  it('leaves no handle open', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    // libmc refuses a 4th open handle (MC_MAX_OPEN_FILES): forty reads would hit it if one leaked a handle.
    for (let i = 0; i < 40; i++) expect(netCnfOpen(s.mc, 'mc0:').ok).toBe(true);
    const fd = s.mc.open(0, 0, NETCNF_INDEX_PATH, FIO.O_RDONLY);
    expect(fd).toBeGreaterThan(0);
    expect(s.mc.close(fd)).toBe(Succeed);
  });
});

describe('the reader LOGIN uses: eznetcnf\'s combination list and NetCnfOpen\'s rows', () => {
  it('reads the combination: its key, the setting\'s name and the hardware line (research 128 R128.5, R128.6)', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const list = netCnfCombinationList(s.mc, 'mc0:');
    expect(list.result).toBe(1);
    expect(list.entries).toEqual<NetCnfEntry[]>([
      { flags: NETCNF_ENTRY_FLAGS_READING, key: 'Combination1', name: 'Setting 1', hardware: 'SCE/Ethernet (Network Adaptor)', server: SERVER },
    ]);
    expect(NETCNF_COLUMNS_READING).toBe(true);
    // The hardware is never where the key goes (the recomp's stand-in's slip, research 128 R128.6).
    expect(list.entries[0]!.key).not.toBe(list.entries[0]!.hardware);
  });

  it('the rows LOGIN builds carry "1 Setting 1" and the HARDWARE line as A_31 reads', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const open = netCnfOpen(s.mc, 'mc0:');
    expect(open).toEqual({ ok: true, rows: [['1', 'Setting 1', 'SCE/Ethernet (Network Adaptor)']] });
  });

  it('slot 2 is mc1:, read on its own card', () => {
    const s = setup();
    ensureNetCnf(s.mc, 1, SERVER);
    expect(netCnfOpen(s.mc, 'mc1:').rows).toHaveLength(1);
    expect(netCnfOpen(s.mc, 'mc0:')).toEqual({ ok: true, rows: [] });
  });

  it('a card with no configuration is an empty list, not an error (A_05: #578, no configuration)', () => {
    const s = setup();
    expect(NETCNF_NO_INDEX_IS_EMPTY_READING).toBe(true);
    expect(netCnfCombinationList(s.mc, 'mc0:')).toEqual({ result: 0, entries: [] });
    expect(netCnfOpen(s.mc, 'mc0:')).toEqual({ ok: true, rows: [] });
    expect(s.storage.writes).toEqual([]);
  });

  it('a malformed index is NETCNF_ERROR with an errno other than 15 (#586), and is never rewritten', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const card = s.slots.slot(1);
    const rev = card.info().rev;
    expect(card.writeFile('BWNETCNF/BWNETCNF', 99, { entries: 'nonsense' }, rev).ok).toBe(true);
    expect(netCnfCombinationList(s.mc, 'mc0:').result).toBe(NETCNF_MALFORMED_RESULT_PLACEHOLDER);
    expect(netCnfOpen(s.mc, 'mc0:')).toEqual({ ok: false, rows: [], errno: -NETCNF_MALFORMED_RESULT_PLACEHOLDER, message: 586 });
    const writes = s.storage.writes.length;
    expect(ensureNetCnf(s.mc, 0, SERVER).written).toBe(false);
    expect(s.storage.writes.length).toBe(writes);
  });

  it('errno 15 is the other console\'s file (#585), any other #586 (FUN_00277dd0, OnNetCnfError)', () => {
    expect(netCnfRows({ result: -15, entries: [] })).toEqual({ ok: false, rows: [], errno: 15, message: 585 });
    expect(netCnfRows({ result: -4, entries: [] })).toEqual({ ok: false, rows: [], errno: 4, message: 586 });
  });

  it('numbers every entry, and rows only those whose flags are not negative', () => {
    const e = (flags: number, name: string): NetCnfEntry => ({ flags, key: name, name, hardware: `hw ${name}` });
    expect(netCnfRows({ result: 3, entries: [e(0, 'a'), e(-1, 'b'), e(0, 'c')] }).rows).toEqual([
      ['1', 'a', 'hw a'], ['3', 'c', 'hw c'],
    ]);
  });

  it('cuts a name of 31 characters or more to its first 32 and "..." (%s, %.32s...)', () => {
    expect(netCnfDisplayName('x'.repeat(30))).toBe('x'.repeat(30));
    expect(netCnfDisplayName('y'.repeat(31))).toBe('y'.repeat(31) + '...');
    expect(netCnfDisplayName('z'.repeat(40))).toBe('z'.repeat(32) + '...');
  });

  it('reads through libmc only: Open RDONLY, GetDir, Read, Close of the index, then of each file it names', () => {
    const s = setup();
    ensureNetCnf(s.mc, 0, SERVER);
    const calls: string[] = [];
    for (const name of ['open', 'close', 'read', 'getDir', 'write', 'mkdir', 'delete'] as const) {
      const real = (s.mc[name] as (...a: unknown[]) => unknown).bind(s.mc);
      (s.mc as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        calls.push(`${name}(${String(name === 'open' || name === 'getDir' ? args[2] : '')})`);
        return real(...args);
      };
    }
    netCnfOpen(s.mc, 'mc0:');
    expect(calls.filter((c) => !c.startsWith('open') && !c.startsWith('getDir')).every((c) => /^(close|read)/.test(c))).toBe(true);
    expect(calls.filter((c) => c.startsWith('open'))).toEqual([
      'open(mc0:/BWNETCNF/BWNETCNF)', 'open(mc0:/BWNETCNF/net000.cnf)', 'open(mc0:/BWNETCNF/ifc000.dat)',
    ]);
    expect(NoEntry).toBe(-4);
  });
});
