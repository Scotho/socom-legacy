import { encodeRequest, type PineClient } from './pine';

/**
 * The PINE debugger extension's client (research 393, "the PCSX2 PINE fork and CodeDesigner"): the
 * FatalityDevelopment fork's opcodes above PINE's own 0x00-0x0f, as the host-local validation build serves them
 * (official PCSX2 v2.8.2 with the fork's pcsx2/PINE.cpp merged in; HUMAN_TASKS H435 keeps that build on its host).
 * The layouts are the fork's docs/pine-debugger-extension.md, "Packet Formats". One adaptation of the build is visible
 * here: v2.8.2's BiosThread has no stack top, so the thread records carry 0 in that field. Product track (OT.R53): a
 * validation instrument, never in a build and never changing the game's behaviour.
 *
 * Only the opcodes the harness's validations use are here: execution control and PC breakpoints (0x10-0x16), the
 * register quick read (0x17), the EE thread list (0x1a), frame advance (0x25) and memory watchpoints (0x2e-0x31).
 * A build without the extension answers every one of them IPC_FAIL, so a call fails as an unknown opcode would.
 */

/**
 * Each opcode's handler, `FatalityDevelopment/pcsx2@55eaffb09:pcsx2/PINE.cpp:<line>` (the `case`): GET_PC :891,
 * PAUSE :910, RESUME :920, STEP :930, SET_BREAKPOINT :954, CLEAR_BREAKPOINT :968, CLEAR_ALL_BREAKPOINTS :989,
 * GET_REGISTERS :999, GET_EE_THREADS :1058, FRAME_ADVANCE :1359, ADD_WATCH :1691, REMOVE_WATCH :1719,
 * LIST_WATCHES :1756 (its cpu byte :1790), CLEAR_ALL_WATCHES :1794. Research 393 §5.1 holds the build's two adaptations.
 */
export const DEBUG_OP = {
  GET_PC: 0x10, PAUSE: 0x11, RESUME: 0x12, STEP: 0x13, SET_BREAKPOINT: 0x14, CLEAR_BREAKPOINT: 0x15, CLEAR_ALL_BREAKPOINTS: 0x16,
  GET_REGISTERS: 0x17, GET_EE_THREADS: 0x1a, FRAME_ADVANCE: 0x25,
  ADD_WATCH: 0x2e, REMOVE_WATCH: 0x2f, LIST_WATCHES: 0x30, CLEAR_ALL_WATCHES: 0x31,
} as const;

/** MsgAddWatch's `cond` bits and the `cpu` / `cpu_sel` values. */
export const WATCH = { READ: 1, WRITE: 2, EE: 0, IOP: 1, BOTH_CPUS: 0xff } as const;

const u32 = (a: number): number[] => [a & 0xff, (a >>> 8) & 0xff, (a >>> 16) & 0xff, (a >>> 24) & 0xff];
const op = (code: number, args: number[] = []): Uint8Array => encodeRequest(code, Uint8Array.from(args));

function range(cpu: number, start: number, end: number): number[] {
  if (cpu !== WATCH.EE && cpu !== WATCH.IOP) throw new Error(`PINE watch: cpu ${cpu} is not 0 (EE) or 1 (IOP)`);
  if (!(end >>> 0 > start >>> 0)) throw new Error(`PINE watch: end 0x${(end >>> 0).toString(16)} must be past start 0x${(start >>> 0).toString(16)}`);
  return [cpu, ...u32(start), ...u32(end)];
}

/** The request bytes of each call, at the sizes the fork's document gives. */
export const pineDebugRequest = {
  getPc: () => op(DEBUG_OP.GET_PC),
  pause: () => op(DEBUG_OP.PAUSE),
  resume: () => op(DEBUG_OP.RESUME),
  step: () => op(DEBUG_OP.STEP),
  setBreakpoint: (a: number) => op(DEBUG_OP.SET_BREAKPOINT, u32(a)),
  clearBreakpoint: (a: number) => op(DEBUG_OP.CLEAR_BREAKPOINT, u32(a)),
  clearAllBreakpoints: () => op(DEBUG_OP.CLEAR_ALL_BREAKPOINTS),
  getRegisters: () => op(DEBUG_OP.GET_REGISTERS),
  eeThreads: () => op(DEBUG_OP.GET_EE_THREADS),
  frameAdvance: (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > 255) throw new Error(`PINE frame advance: ${n} frames, must be 1-255`);
    return op(DEBUG_OP.FRAME_ADVANCE, [n]);
  },
  addWatch: (cpu: number, start: number, end: number, cond: number) => {
    if (cond === 0 || (cond & ~3) !== 0) throw new Error(`PINE watch: cond 0x${cond.toString(16)} must be 1 (read), 2 (write) or 3`);
    return op(DEBUG_OP.ADD_WATCH, [...range(cpu, start, end), cond]);
  },
  removeWatch: (cpu: number, start: number, end: number) => op(DEBUG_OP.REMOVE_WATCH, range(cpu, start, end)),
  listWatches: (cpuSel: number) => op(DEBUG_OP.LIST_WATCHES, [cpuSel & 0xff]),
  clearAllWatches: () => op(DEBUG_OP.CLEAR_ALL_WATCHES),
};

const view = (d: Uint8Array): DataView => new DataView(d.buffer, d.byteOffset, d.byteLength);
function need(d: Uint8Array, n: number, what: string): DataView {
  if (d.length < n) throw new Error(`PINE ${what}: ${d.length} bytes, expected ${n} bytes`);
  return view(d);
}

export interface ProgramCounter { readonly pc: number; readonly paused: boolean }
/** MsgGetProgramCounter's data: the EE pc (u32), then 1 when paused. */
export function decodeProgramCounter(d: Uint8Array): ProgramCounter {
  const v = need(d, 5, 'program counter');
  return { pc: v.getUint32(0, true), paused: d[4] === 1 };
}

export interface Registers { readonly gpr: readonly number[]; readonly pc: number; readonly hi: number; readonly lo: number }
/** MsgGetRegisters' data: the low 32 bits of r0-r31, then pc, hi, lo. */
export function decodeRegisters(d: Uint8Array): Registers {
  const v = need(d, 140, 'registers');
  const gpr = Array.from({ length: 32 }, (_, i) => v.getUint32(i * 4, true));
  return { gpr, pc: v.getUint32(128, true), hi: v.getUint32(132, true), lo: v.getUint32(136, true) };
}

export interface EeThread {
  readonly tid: number; readonly pc: number; readonly status: number; readonly wait: number;
  readonly priority: number; readonly entry: number;
  /** Always 0 on the v2.8.2 build (its BiosThread has no stack top). */
  readonly stackTop: number;
}
/** MsgGetEEThreads' data: a u32 count, then 22 bytes a thread. */
export function decodeEeThreads(d: Uint8Array): EeThread[] {
  const n = need(d, 4, 'EE threads').getUint32(0, true);
  const v = need(d, 4 + n * 22, `EE threads (${n} threads)`);
  return Array.from({ length: n }, (_, i) => {
    const o = 4 + i * 22;
    return { tid: v.getUint32(o, true), pc: v.getUint32(o + 4, true), status: d[o + 8]!, wait: d[o + 9]!,
      priority: v.getUint32(o + 10, true), entry: v.getUint32(o + 14, true), stackTop: v.getUint32(o + 18, true) };
  });
}

export interface Watch {
  readonly start: number; readonly end: number; readonly cond: number; readonly result: number;
  /** `WATCH.EE` or `WATCH.IOP`, the values a request takes. */
  readonly cpu: number;
  /** The byte the build sent: PCSX2's BreakPointCpu (DebugInterface.h, BREAKPOINT_EE 1 / BREAKPOINT_IOP 2). */
  readonly cpuRaw: number;
}
/**
 * MsgListWatches' data: a u32 count, then 11 bytes a watchpoint. The fork's document gives the cpu byte as 0 / 1, but
 * its PINE.cpp writes the watch's BreakPointCpu (`ret_buffer[ret_cnt++] = static_cast<u8>(w.cpu)`), 1 for the EE and 2
 * for the IOP -- an EE watch added with cpu 0 listed with 1 on the build, 2026-11-09. Mapped back here; any other
 * byte fails.
 */
export function decodeWatches(d: Uint8Array): Watch[] {
  const n = need(d, 4, 'watches').getUint32(0, true);
  const v = need(d, 4 + n * 11, `watches (${n} watches)`);
  return Array.from({ length: n }, (_, i) => {
    const o = 4 + i * 11;
    const cpuRaw = d[o + 10]!;
    if (cpuRaw !== 1 && cpuRaw !== 2) throw new Error(`PINE watches: cpu byte ${cpuRaw}, expected 1 (EE) or 2 (IOP)`);
    return { start: v.getUint32(o, true), end: v.getUint32(o + 4, true), cond: d[o + 8]!, result: d[o + 9]!,
      cpu: cpuRaw === 1 ? WATCH.EE : WATCH.IOP, cpuRaw };
  });
}

/** The debugger calls over one PINE connection (`PineClient`), in its order, one reply a request. */
export class PineDebug {
  constructor(private readonly pine: PineClient) {}

  async programCounter(): Promise<ProgramCounter> { return decodeProgramCounter(await this.pine.request(pineDebugRequest.getPc(), 5)); }
  async pause(): Promise<void> { await this.pine.request(pineDebugRequest.pause()); }
  async resume(): Promise<void> { await this.pine.request(pineDebugRequest.resume()); }
  /** One EE instruction while paused; the new pc. */
  async step(): Promise<number> { return view(await this.pine.request(pineDebugRequest.step(), 4)).getUint32(0, true); }
  async setBreakpoint(a: number): Promise<void> { await this.pine.request(pineDebugRequest.setBreakpoint(a)); }
  async clearBreakpoint(a: number): Promise<void> { await this.pine.request(pineDebugRequest.clearBreakpoint(a)); }
  async clearAllBreakpoints(): Promise<void> { await this.pine.request(pineDebugRequest.clearAllBreakpoints()); }
  async registers(): Promise<Registers> { return decodeRegisters(await this.pine.request(pineDebugRequest.getRegisters(), 140)); }
  async eeThreads(): Promise<EeThread[]> { return decodeEeThreads(await this.pine.request(pineDebugRequest.eeThreads(), 4)); }
  async frameAdvance(n: number): Promise<void> { await this.pine.request(pineDebugRequest.frameAdvance(n)); }
  /** A watchpoint that pauses the EE (or IOP) on a read and/or write in [start, end); JIT mode only (the fork's note). */
  async addWatch(cpu: number, start: number, end: number, cond: number): Promise<void> { await this.pine.request(pineDebugRequest.addWatch(cpu, start, end, cond)); }
  async removeWatch(cpu: number, start: number, end: number): Promise<void> { await this.pine.request(pineDebugRequest.removeWatch(cpu, start, end)); }
  async watches(cpuSel: number): Promise<Watch[]> { return decodeWatches(await this.pine.request(pineDebugRequest.listWatches(cpuSel), 4)); }
  async clearAllWatches(): Promise<void> { await this.pine.request(pineDebugRequest.clearAllWatches()); }
}
