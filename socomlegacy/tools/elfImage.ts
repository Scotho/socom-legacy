/**
 * The retail ELF's bytes by virtual address (PLAT-06; web research 96 §4): an ELF32 little-endian executable -- the
 * PS2's EE executables, `game/disc/socom2_game.elf` under `SOCOM_PC_ROOT` -- mapped through its PT_LOAD program
 * headers, so that a table the decompilation cites by address (the UI binding table at 0x3dd4d0, the strings a
 * function compares against) is read from the file the decompilation was made from. An address no PT_LOAD's file
 * image covers (the BSS, a gap) has no bytes in the file: `offsetOf` answers null and the readers throw.
 *
 * The repository's one ELF mapper: `tools/dump-medius-ids.ts` (SVC-02, web research 97) keeps its `programHeaders` /
 * `vaddrToOffset` / `fileBacked` exports and implements them on this module (PLAT-06's fix round).
 */

/** PT_LOAD: a segment the loader copies into memory (`p_type` 1). */
export const PT_LOAD = 1;

/** One ELF32 program header, the fields the address map needs. */
export interface ElfSegment { type: number; offset: number; vaddr: number; filesz: number; memsz: number }

/** The file offset holding virtual address `va` in `segments`, or null when no PT_LOAD's file image covers it (the BSS,
 *  a gap, another segment type). */
export function offsetIn(segments: readonly ElfSegment[], va: number): number | null {
  for (const s of segments) {
    if (s.type === PT_LOAD && va >= s.vaddr && va < s.vaddr + s.filesz) return s.offset + (va - s.vaddr);
  }
  return null;
}

/** An ELF32 little-endian executable, readable by virtual address. */
export class ElfImage {
  readonly segments: readonly ElfSegment[];
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    if (bytes.length < 0x34 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
      throw new Error('not an ELF file');
    }
    if (bytes[4] !== 1) throw new Error('not an ELF32 file');
    if (bytes[5] !== 1) throw new Error('not a little-endian ELF');
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // ELF32 header: e_phoff at 0x1c, e_phentsize at 0x2a, e_phnum at 0x2c.
    const phoff = this.view.getUint32(0x1c, true), size = this.view.getUint16(0x2a, true), count = this.view.getUint16(0x2c, true);
    if (size < 0x20 || phoff + size * count > bytes.length) throw new Error(`program headers (${count} x ${size} at ${phoff}) outside the file`);
    const segments: ElfSegment[] = [];
    for (let i = 0; i < count; i++) {
      const o = phoff + i * size;
      const seg = {
        type: this.view.getUint32(o, true), offset: this.view.getUint32(o + 4, true), vaddr: this.view.getUint32(o + 8, true),
        filesz: this.view.getUint32(o + 16, true), memsz: this.view.getUint32(o + 20, true),
      };
      if (seg.type === PT_LOAD && seg.offset + seg.filesz > bytes.length) throw new Error(`PT_LOAD ${i} runs past the file`);
      segments.push(seg);
    }
    this.segments = segments;
  }

  /** The file offset holding virtual address `va`, or null when no PT_LOAD's file image covers it. */
  offsetOf(va: number): number | null { return offsetIn(this.segments, va); }

  private at(va: number, n: number): number {
    const o = this.offsetOf(va);
    if (o === null || this.offsetOf(va + n - 1) !== o + n - 1) throw new RangeError(`0x${va.toString(16)}: ${n} bytes not in one PT_LOAD file image`);
    return o;
  }

  u32(va: number): number { return this.view.getUint32(this.at(va, 4), true); }

  /** The NUL-terminated string at `va` (single-byte), at most `max` bytes; throws when it leaves the file image. */
  cstr(va: number, max = 256): string {
    let s = '';
    for (let i = 0; i < max; i++) {
      const b = this.bytes[this.at(va + i, 1)]!;
      if (b === 0) return s;
      s += String.fromCharCode(b);
    }
    throw new Error(`0x${va.toString(16)}: no NUL in ${max} bytes`);
  }
}

/**
 * Every NUL-terminated string of the PT_LOAD file images that starts after a NUL (or a segment's start) and matches
 * `pattern` whole, with its virtual address, in address order. Single-byte, printable ASCII only.
 */
export function findStrings(elf: ElfImage, pattern: RegExp): { va: number; text: string }[] {
  const out: { va: number; text: string }[] = [];
  for (const s of elf.segments) {
    if (s.type !== PT_LOAD) continue;
    let start = 0;
    for (let i = 0; i <= s.filesz; i++) {
      const b = i < s.filesz ? elf.bytes[s.offset + i]! : 0;
      if (b !== 0) continue;
      if (i > start) {
        const run = elf.bytes.subarray(s.offset + start, s.offset + i);
        if (run.every((c) => c >= 0x20 && c < 0x7f)) {
          const text = String.fromCharCode(...run);
          if (pattern.test(text)) out.push({ va: s.vaddr + start, text });
        }
      }
      start = i + 1;
    }
  }
  return out;
}

/** One row of a `{id, name, fn, fn2}` table: four little-endian words, the name a pointer to a C string. */
export interface BindingRow { index: number; id: number; name: string; fn: number; fn2: number }

/** What ended a table walk: the first row whose name pointer is 0, and its words. */
export interface BindingTable { rows: BindingRow[]; terminator: { index: number; id: number; fn: number; fn2: number } }

/**
 * The 16-byte `{id, name, fn, fn2}` rows from `va` to the first row whose name pointer is null (web research 95 §1.2:
 * the UI binding table at 0x3dd4d0, matched case-insensitively by `FUN_00198b80`). `max` bounds a walk that finds
 * no terminator.
 */
export function readBindingTable(elf: ElfImage, va: number, max = 4096): BindingTable {
  const rows: BindingRow[] = [];
  for (let i = 0; i < max; i++) {
    const r = va + 16 * i;
    const id = elf.u32(r), namePtr = elf.u32(r + 4), fn = elf.u32(r + 8), fn2 = elf.u32(r + 12);
    if (namePtr === 0) return { rows, terminator: { index: i, id, fn, fn2 } };
    rows.push({ index: i, id, name: elf.cstr(namePtr), fn, fn2 });
  }
  throw new Error(`no null name in ${max} rows from 0x${va.toString(16)}`);
}
