/**
 * The Medius message ids the retail client sends, read from its own ELF (SVC-02; web research 97 §2).
 *
 *   SOCOM_PC_ROOT=C:/Projects/socom_pc npx tsx tools/dump-medius-ids.ts [--all]
 *
 * Each libmedius request builder posts its request as `FUN_00621268(0x40, conn, 0xffff, class, DAT_00686xxx, length,
 * buf)` (`socom2_game.elf.decomp.c` D:L558638-562453): the message type is the word at a `DAT_00686xxx` slot. Those slots
 * are in the BSS -- past the last PT_LOAD segment's file image (filesz 0x1a4c80 of memsz 0x1c1c00 from 0x4c5380) -- so the
 * ELF holds no value for any of them and a `.data` read finds nothing. They are filled at the library's init by
 * `FUN_0064db00` (D:L564041-564312, called from `FUN_006471e8` D:L559788 and `FUN_00647318` D:L559822): one
 * `FUN_0063c8a0(slot, class, handler)` (D:L552195-552223) per slot, which writes into the slot the next free id of the
 * class and files the handler under it. The per-class counters start at zero (`FUN_0063c700` D:L552128-552171
 * allocates them through `FUN_00632340`, which memsets them). So a slot's id is its ordinal among its class's
 * registrations, and this tool reads it by decoding `FUN_0064db00`'s MIPS straight from the ELF and counting.
 *
 * Prints the ELF's PT_LOAD map, then the slots research 97 and 154 cite (`NOTE_SLOTS`) with class and id; `--all` lists every
 * registration. Nothing is written. The ELF is `$SOCOM_PC_ROOT/game/disc/socom2_game.elf` (the repository root when the
 * variable is unset): read-only ground truth, never copied into this tree (W6.R8).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ElfImage, offsetIn, type ElfSegment } from './elfImage';

/** `FUN_0064db00`: the libmedius init that registers every Lobby and LobbyExt message slot (D:L564041-564312). */
export const REGISTER_FN = 0x0064db00;
/** `FUN_0063c8a0(slot, class, handler)`: the RT message registry's "next id of this class" (D:L552195-552223). */
export const REGISTRAR = 0x0063c8a0;
/** No registration function of the ELF runs this long: a walk that does is not in the function it was given. */
const MAX_INSTRUCTIONS = 4096;

/**
 * The `DAT_00686xxx` request slots research 97's table cites, then research 154's (SVC-06: the nine pairs between the
 * BRIEFING ROOMS and a game's lobby, and UpdateUserState and VersionServer, posted on entering a room); pinned by
 * `test/dumpMediusIds.test.ts`.
 */
export const NOTE_SLOTS: readonly number[] = [
  0x686b24, 0x686b28, 0x686b4c, 0x686b84, 0x686bf0, 0x686bf8, 0x686c18, 0x686c20, 0x686c30, 0x686c48, 0x686c74, 0x686c80,
  0x686cb4, 0x686cbc, 0x686cd4, 0x686cdc, 0x686ce4, 0x686cec, 0x686cf4, 0x686d04, 0x686d0c, 0x686d1c, 0x686d24,
  0x686d2c, 0x686d34, 0x686cfc, 0x686d4c, 0x686d64, 0x686d74, 0x686d84, 0x686dc4, 0x686c5c, 0x686c64, 0x686c6c,
  0x686e4c, 0x686e00, 0x686e08, 0x686e10, 0x686e18, 0x686e28, 0x686e20, 0x686e40, 0x686e5c, 0x686c50, 0x686c38,
  0x686c40, 0x686e94,
  0x686e38, 0x686bb0, 0x686c10, 0x686bc8, 0x686c8c, 0x686c94, 0x686e30, 0x686ba0, 0x686bc0, 0x686c7c, 0x686cac,
];

/** The message classes the registrations use (Horizon `RT.Common/Types.cs` `NetMessageTypes`). */
export const CLASS_NAMES: Readonly<Record<number, string>> = { 0: 'DME', 1: 'Lobby', 4: 'LobbyExt' };

/** One ELF32 program header, the fields the address map needs (`./elfImage`'s `ElfSegment`). */
export type ProgramHeader = ElfSegment;

/** One `FUN_0063c8a0` call: the slot written, the message class, the handler filed under the id. */
export interface Registration { slot: number; cls: number; handler: number }

/**
 * The ELF's program headers, every type (ELF32, little-endian: the PS2's EE executables), read and checked by
 * `ElfImage` (`./elfImage`, the repository's one mapper): the header table and every PT_LOAD's file image inside the
 * file, an entry at least 0x20 bytes.
 */
export function programHeaders(elf: Uint8Array): ProgramHeader[] {
  return new ElfImage(elf).segments.map((s) => ({ ...s }));
}

/** The file offset holding virtual address `va`, or null when no PT_LOAD's file image covers it (the BSS included). */
export function vaddrToOffset(segs: readonly ProgramHeader[], va: number): number | null {
  return offsetIn(segs, va);
}

/** Whether the ELF's bytes hold a value for `va` (false in the BSS: memory the loader zeroes). */
export function fileBacked(segs: readonly ProgramHeader[], va: number): boolean {
  return vaddrToOffset(segs, va) !== null;
}

const A0 = 4;
const A1 = 5;
const A2 = 6;
const RA = 31;
/** The registers a call may change (MIPS o32/EABI caller-saved): forgotten after any other call. */
const CALLER_SAVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 31];

/**
 * Every `FUN_0063c8a0` call in the function at `fnAddr`, in program order: the walk tracks constants built by
 * `lui`/`addiu`/`daddiu`/`ori` and register moves, runs each call's delay slot before the call (the compiler sets the
 * class there), and stops at the first `jr ra` once its delay slot has run. A call whose slot or class is not a known
 * constant is refused: the read must be complete or fail.
 */
export function decodeRegistrations(elf: Uint8Array, fnAddr: number, registrar: number): Registration[] {
  const image = new ElfImage(elf);
  /** A word of the code; throws when its four bytes are not in one PT_LOAD's file image. */
  const word = (va: number): number => image.u32(va);
  const regs: (number | undefined)[] = new Array(32).fill(undefined);
  regs[0] = 0;
  const set = (r: number, v: number | undefined): void => { if (r !== 0) regs[r] = v === undefined ? undefined : v >>> 0; };

  /** Executes one non-branch instruction on the tracked constants. */
  const step = (w: number): void => {
    const op = w >>> 26;
    const rs = (w >>> 21) & 31;
    const rt = (w >>> 16) & 31;
    const imm = w & 0xffff;
    const simm = (imm << 16) >> 16;
    if (op === 0x0f) set(rt, imm << 16);                                                  // lui
    else if (op === 0x09 || op === 0x19) set(rt, regs[rs] === undefined ? undefined : regs[rs]! + simm); // (d)addiu
    else if (op === 0x0d) set(rt, regs[rs] === undefined ? undefined : regs[rs]! | imm);  // ori
    else if (op === 0) {
      const rd = (w >>> 11) & 31;
      const fn = w & 63;
      // addu/daddu/or rd, rs, zero: a move
      if ((fn === 0x21 || fn === 0x2d || fn === 0x25) && rt === 0) set(rd, regs[rs]);
      else if (fn !== 0x08 && fn !== 0x09) set(rd, undefined);                             // any other result
    } else if ((op >= 0x20 && op <= 0x27) || op === 0x37 || op === 0x1e || op === 0x1a || op === 0x1b) {
      set(rt, undefined);                                                                  // a load
    } else if ((op >= 0x08 && op <= 0x0e) || op === 0x18) {
      set(rt, undefined);                                                                  // other immediates
    }
  };

  const out: Registration[] = [];
  for (let pc = fnAddr, n = 0; n < MAX_INSTRUCTIONS; pc += 4, n++) {
    const w = word(pc);
    const op = w >>> 26;
    if (w === 0x03e00008) { step(word(pc + 4)); return out; }                               // jr ra (+ its delay slot)
    if (op === 0x03) {                                                                     // jal
      const target = ((pc + 4) & 0xf0000000) | ((w & 0x3ffffff) << 2);
      step(word(pc + 4));
      if (target >>> 0 === registrar >>> 0) {
        const [slot, cls, handler] = [regs[A0], regs[A1], regs[A2]];
        if (slot === undefined || cls === undefined) {
          throw new Error(`unresolved registration at 0x${pc.toString(16)} (a0 or a1 not a constant)`);
        }
        out.push({ slot, cls, handler: handler ?? 0 });
      }
      for (const r of CALLER_SAVED) set(r, undefined);
      set(RA, pc + 8);
      pc += 4;                                                                              // the delay slot ran
      n++;
      continue;
    }
    step(w);
  }
  throw new Error(`no jr ra within ${MAX_INSTRUCTIONS} instructions of 0x${fnAddr.toString(16)}`);
}

/** Each slot's message id: its ordinal among its class's registrations, counted from zero. */
export function assignIds(regs: readonly Registration[]): Map<number, { cls: number; id: number }> {
  const next = new Map<number, number>();
  const out = new Map<number, { cls: number; id: number }>();
  for (const r of regs) {
    if (out.has(r.slot)) throw new Error(`slot 0x${r.slot.toString(16)} registered twice`);
    const id = next.get(r.cls) ?? 0;
    next.set(r.cls, id + 1);
    out.set(r.slot, { cls: r.cls, id });
  }
  return out;
}

/** The recompilation tree (`SOCOM_PC_ROOT`, else this repository's root) and the retail ELF in it. */
export function elfPath(): string {
  const root = process.env.SOCOM_PC_ROOT ?? resolve(import.meta.dirname, '..', '..');
  return join(root, 'game', 'disc', 'socom2_game.elf');
}

const hex = (n: number, w = 0): string => `0x${n.toString(16).padStart(w, '0')}`;

function main(): void {
  const path = elfPath();
  const elf = new Uint8Array(readFileSync(path));
  const segs = programHeaders(elf);
  console.log(`ELF ${path}`);
  console.log('PT_LOAD  vaddr      offset     filesz     memsz      BSS');
  for (const s of segs.filter((p) => p.type === 1)) {
    const bss = s.memsz > s.filesz ? `${hex(s.vaddr + s.filesz)}..${hex(s.vaddr + s.memsz)}` : '-';
    console.log(`         ${hex(s.vaddr, 8)} ${hex(s.offset, 8)} ${hex(s.filesz, 8)} ${hex(s.memsz, 8)} ${bss}`);
  }
  const regs = decodeRegistrations(elf, REGISTER_FN, REGISTRAR);
  const ids = assignIds(regs);
  const count = (c: number): number => regs.filter((r) => r.cls === c).length;
  console.log(`\nFUN_${REGISTER_FN.toString(16).padStart(8, '0')}: ${regs.length} registrations `
    + `(Lobby ${count(1)}, LobbyExt ${count(4)})`);
  const row = (slot: number): string => {
    const v = ids.get(slot);
    const r = regs.find((x) => x.slot === slot);
    const where = fileBacked(segs, slot) ? 'file' : 'bss';
    return v && r
      ? `DAT_00${slot.toString(16)}  ${(CLASS_NAMES[v.cls] ?? String(v.cls)).padEnd(8)} ${hex(v.id, 2)}  handler ${hex(r.handler, 8)}  ${where}`
      : `DAT_00${slot.toString(16)}  not registered  ${where}`;
  };
  console.log('\nresearch 97 slots: slot, class, id, response handler, where the ELF keeps the slot');
  for (const s of NOTE_SLOTS) console.log(row(s));
  if (process.argv.includes('--all')) {
    console.log('\nevery registration, in order');
    for (const r of regs) console.log(row(r.slot));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
