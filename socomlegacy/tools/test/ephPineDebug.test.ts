import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { PineClient } from '../eph/pine';
import {
  DEBUG_OP, PineDebug, WATCH, decodeEeThreads, decodeProgramCounter, decodeRegisters, decodeWatches, pineDebugRequest,
} from '../eph/pineDebug';

/**
 * The PINE debugger extension's client (research 393): the FatalityDevelopment fork's opcodes 0x10-0x31 as the
 * host-local build serves them (D:/s2u/ext/pcsx2-pine, docs/pine-debugger-extension.md "Packet Formats"). The byte
 * arrays are that document's layouts; the MsgAddWatch one is its worked example, byte for byte.
 */
const bytes = (u: Uint8Array): number[] => [...u];
const le32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

describe('the debugger opcodes', () => {
  it('numbers them as the fork does', () => {
    expect(DEBUG_OP).toEqual({
      GET_PC: 0x10, PAUSE: 0x11, RESUME: 0x12, STEP: 0x13, SET_BREAKPOINT: 0x14, CLEAR_BREAKPOINT: 0x15, CLEAR_ALL_BREAKPOINTS: 0x16,
      GET_REGISTERS: 0x17, GET_EE_THREADS: 0x1a, FRAME_ADVANCE: 0x25,
      ADD_WATCH: 0x2e, REMOVE_WATCH: 0x2f, LIST_WATCHES: 0x30, CLEAR_ALL_WATCHES: 0x31,
    });
    expect(WATCH).toEqual({ READ: 1, WRITE: 2, EE: 0, IOP: 1, BOTH_CPUS: 0xff });
  });

  it('encodes each request at the document\'s size', () => {
    expect(bytes(pineDebugRequest.getPc())).toEqual([5, 0, 0, 0, 0x10]);
    expect(bytes(pineDebugRequest.pause())).toEqual([5, 0, 0, 0, 0x11]);
    expect(bytes(pineDebugRequest.resume())).toEqual([5, 0, 0, 0, 0x12]);
    expect(bytes(pineDebugRequest.step())).toEqual([5, 0, 0, 0, 0x13]);
    expect(bytes(pineDebugRequest.setBreakpoint(0x0019939c))).toEqual([9, 0, 0, 0, 0x14, ...le32(0x0019939c)]);
    expect(bytes(pineDebugRequest.clearBreakpoint(0x00100000))).toEqual([9, 0, 0, 0, 0x15, ...le32(0x00100000)]);
    expect(bytes(pineDebugRequest.clearAllBreakpoints())).toEqual([5, 0, 0, 0, 0x16]);
    expect(bytes(pineDebugRequest.getRegisters())).toEqual([5, 0, 0, 0, 0x17]);
    expect(bytes(pineDebugRequest.eeThreads())).toEqual([5, 0, 0, 0, 0x1a]);
    expect(bytes(pineDebugRequest.frameAdvance(3))).toEqual([6, 0, 0, 0, 0x25, 3]);
    expect(bytes(pineDebugRequest.removeWatch(WATCH.EE, 0x10, 0x14))).toEqual([14, 0, 0, 0, 0x2f, 0, ...le32(0x10), ...le32(0x14)]);
    expect(bytes(pineDebugRequest.listWatches(WATCH.BOTH_CPUS))).toEqual([6, 0, 0, 0, 0x30, 0xff]);
    expect(bytes(pineDebugRequest.clearAllWatches())).toEqual([5, 0, 0, 0, 0x31]);
  });

  it('packs MsgAddWatch as the document\'s example (EE writes to 0x00203000..0x00203003)', () => {
    expect(bytes(pineDebugRequest.addWatch(WATCH.EE, 0x00203000, 0x00203004, WATCH.WRITE)))
      .toEqual([0x0f, 0, 0, 0, 0x2e, 0x00, 0x00, 0x30, 0x20, 0x00, 0x04, 0x30, 0x20, 0x00, 0x02]);
  });

  it('refuses what the fork answers with IPC_FAIL, before sending it', () => {
    expect(() => pineDebugRequest.frameAdvance(0)).toThrow(/1-255/);
    expect(() => pineDebugRequest.frameAdvance(256)).toThrow(/1-255/);
    expect(() => pineDebugRequest.addWatch(WATCH.EE, 0x20, 0x20, WATCH.WRITE)).toThrow(/end/);
    expect(() => pineDebugRequest.addWatch(WATCH.EE, 0x20, 0x24, 0)).toThrow(/cond/);
    expect(() => pineDebugRequest.addWatch(WATCH.EE, 0x20, 0x24, 4)).toThrow(/cond/);
    expect(() => pineDebugRequest.addWatch(2, 0x20, 0x24, WATCH.READ)).toThrow(/cpu/);
  });
});

describe('the debugger replies', () => {
  it('decodes the program counter and the paused flag (5 data bytes)', () => {
    expect(decodeProgramCounter(Uint8Array.from([0x9c, 0x93, 0x19, 0x00, 0x00]))).toEqual({ pc: 0x0019939c, paused: false });
    expect(decodeProgramCounter(Uint8Array.from([0, 0, 0x10, 0, 1]))).toEqual({ pc: 0x00100000, paused: true });
    expect(() => decodeProgramCounter(Uint8Array.from([1, 2, 3, 4]))).toThrow(/5 bytes/);
  });

  it('decodes the registers: r0-r31 low words, then pc, hi, lo (140 data bytes)', () => {
    const words = Array.from({ length: 35 }, (_, i) => (i === 29 ? 0x01ffff00 : i * 0x11));
    const r = decodeRegisters(Uint8Array.from(words.flatMap(le32)));
    expect(r.gpr).toHaveLength(32);
    expect(r.gpr[29]).toBe(0x01ffff00);
    expect(r.gpr[31]).toBe(31 * 0x11);
    expect([r.pc, r.hi, r.lo]).toEqual([32 * 0x11, 33 * 0x11, 34 * 0x11]);
    expect(() => decodeRegisters(new Uint8Array(139))).toThrow(/140 bytes/);
  });

  it('decodes the EE threads, 22 bytes each after a u32 count', () => {
    const t = (tid: number, pc: number, status: number, wait: number, prio: number, entry: number): number[] =>
      [...le32(tid), ...le32(pc), status, wait, ...le32(prio), ...le32(entry), ...le32(0)];
    const data = Uint8Array.from([...le32(2), ...t(1, 0x100000, 1, 0, 0x40, 0x100008), ...t(5, 0x200000, 4, 2, 0x7f, 0x200010)]);
    expect(decodeEeThreads(data)).toEqual([
      { tid: 1, pc: 0x100000, status: 1, wait: 0, priority: 0x40, entry: 0x100008, stackTop: 0 },
      { tid: 5, pc: 0x200000, status: 4, wait: 2, priority: 0x7f, entry: 0x200010, stackTop: 0 },
    ]);
    expect(() => decodeEeThreads(Uint8Array.from([...le32(2), ...t(1, 0, 0, 0, 0, 0)]))).toThrow(/2 threads/);
  });

  it('decodes the watch list, 11 bytes each after a u32 count, its cpu byte as the build sends it', () => {
    // The build writes PCSX2's BreakPointCpu (DebugInterface.h: BREAKPOINT_EE 1, BREAKPOINT_IOP 2), not the document's
    // 0 / 1: an EE watch added with cpu 0 lists with 1 (live, 2026-11-09). `cpu` is mapped back to the request's values.
    const data = Uint8Array.from([...le32(2), ...le32(0x00203000), ...le32(0x00203004), 0x02, 0x02, 0x01,
      ...le32(0x1f801000), ...le32(0x1f801004), 0x03, 0x02, 0x02]);
    expect(decodeWatches(data)).toEqual([
      { start: 0x00203000, end: 0x00203004, cond: 2, result: 2, cpu: WATCH.EE, cpuRaw: 1 },
      { start: 0x1f801000, end: 0x1f801004, cond: 3, result: 2, cpu: WATCH.IOP, cpuRaw: 2 },
    ]);
    expect(() => decodeWatches(Uint8Array.from([...le32(1), ...le32(0), ...le32(4), 1, 2, 0]))).toThrow(/cpu byte 0/);
  });
});

describe('PineDebug over a PINE connection', () => {
  let server: Server | null = null;
  afterEach(() => { server?.close(); server = null; });

  it('sends each request and reads its reply in order', async () => {
    const seen: number[][] = [];
    server = createServer((s: Socket) => {
      s.on('data', (d) => {
        let o = 0;
        while (o < d.length) {
          const n = d.readUInt32LE(o); const op = d[o + 4]!; seen.push([...d.subarray(o, o + n)]); o += n;
          if (op === 0x10) s.write(Uint8Array.from([10, 0, 0, 0, 0, ...le32(0x00123450), 1]));
          else if (op === 0x30) s.write(Uint8Array.from([9, 0, 0, 0, 0, ...le32(0)]));
          else if (op === 0x15) s.write(Uint8Array.from([5, 0, 0, 0, 0xff]));
          else s.write(Uint8Array.from([5, 0, 0, 0, 0]));
        }
      });
    });
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
    const client = await PineClient.connect({ port: (server.address() as AddressInfo).port, timeoutMs: 2000 });
    const dbg = new PineDebug(client);
    await dbg.pause();
    expect(await dbg.programCounter()).toEqual({ pc: 0x00123450, paused: true });
    await dbg.addWatch(WATCH.EE, 0x00203000, 0x00203004, WATCH.WRITE);
    expect(await dbg.watches(WATCH.BOTH_CPUS)).toEqual([]);
    await expect(dbg.clearBreakpoint(0x10)).rejects.toThrow(/0x15 failed/);
    await dbg.resume();
    client.close();
    expect(seen.map((r) => r[4])).toEqual([0x11, 0x10, 0x2e, 0x30, 0x15, 0x12]);
  });
});
