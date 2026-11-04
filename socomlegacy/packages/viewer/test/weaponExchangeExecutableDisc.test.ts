import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TITLE_RGB } from '../src/weaponSelect';

// Private output of the local ISO decoder, never a shipped fixture. Research 300 section 6.
// `SOCOM_EXCHANGE_ELF`, else the desktop checkout's decoded game ELF (`<SOCOM_PC_ROOT>/game/disc/socom2_game.elf`, the
// same SHA256 as research 300 §6's); absent, skipped.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const filename = process.env.SOCOM_EXCHANGE_ELF ?? (PC_ROOT ? join(PC_ROOT, 'game', 'disc', 'socom2_game.elf') : undefined);
const available = !!filename && existsSync(filename);
function word(address: number): number {
  const elf = readFileSync(filename!);
  const header = elf.readUInt32LE(28), stride = elf.readUInt16LE(42), count = elf.readUInt16LE(44);
  for (let i = 0; i < count; i++) {
    const h = header + i * stride;
    if (elf.readUInt32LE(h) !== 1) continue;
    const offset = elf.readUInt32LE(h + 4), base = elf.readUInt32LE(h + 8), size = elf.readUInt32LE(h + 16);
    if (address >= base && address + 4 <= base + size) return elf.readUInt32LE(offset + address - base);
  }
  throw Error(`unmapped ISO executable address ${address.toString(16)}`);
}
const immediate = (address: number): number => (word(address) << 16) >> 16;
const call = (address: number): number => (word(address) & 0x03ffffff) * 4;
const floatFromLui = (address: number): number => {
  expect(word(address) >>> 26).toBe(15);
  const bytes = Buffer.alloc(4); bytes.writeUInt32LE((word(address) & 0xffff) * 65536);
  return bytes.readFloatLE();
};

describe.skipIf(!available)('Weapon Exchange: instructions decoded from the locally supplied ISO', () => {
  it('initializer retains the original yellow title tint, despite the white screenshot reference', () => {
    // FUN_003ff7f0: t0=128, a3=64; stores into title and category-header RGB globals.
    expect(TITLE_RGB).toEqual([floatFromLui(0x3ff804), floatFromLui(0x3ff804), floatFromLui(0x3ff814)]);
    expect(word(0x3ff8b4) & 0xffff).toBe(0x4788);
    expect(word(0x3ff8bc) & 0xffff).toBe(0x4780);
    expect(word(0x3ff8c4) & 0xffff).toBe(0x4784);
  });
  it('picker uses the same vertical inputs as the five-row list, one edge per press', () => {
    expect(immediate(0x23d1d0)).toBe(1); // input state compared with just-pressed, not held
    expect([immediate(0x23d1cc), immediate(0x23d1f0)]).toEqual([5, 6]);
    expect([immediate(0x23ebd8), immediate(0x23ebf8)]).toEqual([5, 6]);
    expect([immediate(0x23d1e0), immediate(0x23d200)]).toEqual([-2, 2]);
    expect([immediate(0x23d210), immediate(0x23d230)]).toEqual([4, 3]);
    expect(call(0x23d0d0)).toBe(0x23c6f0); // +/-2: item iterator
    expect(call(0x23d0f8)).toBe(0x23c840); // +/-1: category iterator
  });
  it('2X searches for item194 and doubles magazine storage with a ten-magazine bound', () => {
    expect(immediate(0x5c7620)).toBe(194);
    expect(call(0x5c76f4)).toBe(0x3d2800);
    expect((word(0x5c7700) >>> 6) & 31).toBe(1); // shift count one: twice the record's magazine count
    expect(immediate(0x5c7718)).toBe(10);
  });
  it('confirmation copies five slots into the character kit, not only the primary', () => {
    expect(immediate(0x23e64c)).toBe(5);
    expect(immediate(0x23e6a8)).toBe(5);
    expect(call(0x23e640)).toBe(0x53eee0);
    expect(call(0x23e694)).toBe(0x53eee0);
  });
});
