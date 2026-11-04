import { describe, expect, it } from 'vitest';
import { BUILD_CARDS, DEFAULT_BUILD, cardPlan, memcardsDir, parseBuild, replaceMemoryCards, sectionDiff } from '../eph/build';

/**
 * Which build PCSX2 runs (the owner's ruling 2026-10-31: "r0001 default, r0004 on ask"). The copy's memory cards decide
 * it: Mcd001/Mcd002 carry the online update (r0004), so an r0001 run points both slots at harness-owned cards that
 * hold none. Rewritten in the ini the harness already rewrites; Mcd001/Mcd002 never touched.
 */
const INI = [
  '[Folders]', 'MemoryCards = memcards', '',
  '[MemoryCards]', 'Slot1_Enable = true', 'Slot1_Filename = Mcd001.ps2', 'Slot2_Enable = true', 'Slot2_Filename = Mcd002.ps2',
  'Multitap1_Slot2_Filename = Mcd-Multitap1-Slot02.ps2', '',
  '[Pad1]', 'Type = DualShock2', '',
].join('\r\n');

describe('--build', () => {
  it('defaults to r0001 and takes r0001 or r0004 only', () => {
    expect(DEFAULT_BUILD).toBe('r0001');
    expect(parseBuild('r0004')).toBe('r0004');
    expect(parseBuild('R0001')).toBe('r0001');
    expect(() => parseBuild('r0002')).toThrow('--build takes r0001 or r0004, not "r0002"');
  });

  it('r0001 boots from harness-owned cards; r0004 from the copy\'s own Mcd001/Mcd002', () => {
    expect(BUILD_CARDS.r0001).toEqual(['EPH-r0001-1.ps2', 'EPH-r0001-2.ps2']);
    expect(BUILD_CARDS.r0004).toEqual(['Mcd001.ps2', 'Mcd002.ps2']);
  });
});

describe('replaceMemoryCards', () => {
  it('r0001: both slots name the harness cards; every other line kept byte for byte, CRLF kept', () => {
    const out = replaceMemoryCards(INI, 'r0001');
    expect(out).toBe(INI.replace('Slot1_Filename = Mcd001.ps2', 'Slot1_Filename = EPH-r0001-1.ps2')
      .replace('Slot2_Filename = Mcd002.ps2', 'Slot2_Filename = EPH-r0001-2.ps2'));
    expect(sectionDiff(INI, out, '[MemoryCards]')).toEqual([
      '- Slot1_Filename = Mcd001.ps2', '- Slot2_Filename = Mcd002.ps2', '+ Slot1_Filename = EPH-r0001-1.ps2', '+ Slot2_Filename = EPH-r0001-2.ps2',
    ]);
  });

  it('r0004: Mcd001/Mcd002, also over an ini an r0001 run left behind', () => {
    expect(replaceMemoryCards(INI, 'r0004')).toBe(INI);
    expect(replaceMemoryCards(replaceMemoryCards(INI, 'r0001'), 'r0004')).toBe(INI);
  });

  it('refuses an ini without [MemoryCards] or without a slot filename, never guessing one', () => {
    expect(() => replaceMemoryCards('[Pad1]\nType = DualShock2\n', 'r0001')).toThrow('EPH [MemoryCards]: no [MemoryCards] section in the PCSX2 ini');
    expect(() => replaceMemoryCards(INI.replace('Slot2_Filename = Mcd002.ps2\r\n', ''), 'r0001'))
      .toThrow('EPH [MemoryCards]: no Slot2_Filename line in [MemoryCards]');
  });
});

describe('the cards on the host', () => {
  it('memcardsDir: [Folders] MemoryCards under the PCSX2 folder, an absolute one as it is, else null', () => {
    expect(memcardsDir(INI, 'E:/eph-runs/pcsx2')).toBe('E:/eph-runs/pcsx2/memcards');
    expect(memcardsDir(INI.replace('MemoryCards = memcards', 'MemoryCards = D:\\cards'), 'E:/x')).toBe('D:/cards');
    expect(memcardsDir('[Pad1]\n', 'E:/x')).toBeNull();
  });

  it('cardPlan: each slot\'s file and whether it is there; an absent one PCSX2 creates itself', () => {
    const plan = cardPlan(INI, 'E:/eph-runs/pcsx2', 'r0001', (p) => p === 'E:/eph-runs/pcsx2/memcards/EPH-r0001-1.ps2');
    expect(plan).toEqual([
      { slot: 1, file: 'EPH-r0001-1.ps2', path: 'E:/eph-runs/pcsx2/memcards/EPH-r0001-1.ps2', exists: true },
      { slot: 2, file: 'EPH-r0001-2.ps2', path: 'E:/eph-runs/pcsx2/memcards/EPH-r0001-2.ps2', exists: false },
    ]);
  });
});
