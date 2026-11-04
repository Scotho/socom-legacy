import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assignIds, decodeRegistrations, elfPath, fileBacked, NOTE_SLOTS, programHeaders, REGISTER_FN, REGISTRAR, vaddrToOffset,
} from '../dump-medius-ids';

/**
 * The Medius message ids research 97 states (SVC-02), read from the retail ELF (`tools/dump-medius-ids.ts`).
 *
 * The builders post the word at a `DAT_00686xxx` slot as the message type (`FUN_00621268(0x40, conn, 0xffff, class,
 * DAT_00686xxx, length, buf)`, D:L558638-562453). Those slots lie in the BSS (the last PT_LOAD's memsz past its filesz),
 * so the ELF holds no value for them: `FUN_0064db00` (D:L564041-564312) fills each at the library's init with
 * `FUN_0063c8a0(slot, class, handler)` (D:L552195-552223), which hands out the next free id of the class from a counter
 * the registry's init zeroes (`FUN_0063c700` D:L552128-552171 -> `FUN_00632340` -> memset). The id is the slot's
 * ordinal among its class's registrations: the tool decodes that function's MIPS from the ELF and counts.
 *
 * The first two suites run in CI on a synthetic ELF built here; the last reads the retail ELF and skips without it.
 */

const LE = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const LE16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];

// MIPS encodings, as the R5900 executes them (little-endian words).
const lui = (rt: number, imm: number): number => ((0x0f << 26) | (rt << 16) | (imm & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, imm: number): number => ((0x09 << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const jal = (target: number): number => ((0x03 << 26) | ((target >>> 2) & 0x3ffffff)) >>> 0;
const JR_RA = 0x03e00008;
const NOP = 0;
const [ZERO, A0, A1, A2] = [0, 4, 5, 6];

/** `FUN_0063c8a0(slot, class, handler)` as the compiler emits it: the class set in the call's delay slot. */
function register(slot: number, cls: number, handler: number, registrar: number): number[] {
  const lo = (v: number): number => ((v & 0xffff) << 16) >> 16;            // addiu sign-extends
  const hi = (v: number): number => ((v - lo(v)) >>> 16) & 0xffff;
  return [lui(A0, hi(slot)), lui(A2, hi(handler)), addiu(A0, A0, lo(slot)), addiu(A2, A2, lo(handler)), jal(registrar),
    addiu(A1, ZERO, cls)];
}

/**
 * A two-segment ELF: text at 0x100000 (file 0x100, 0x100 bytes) and data at 0x200000 (file 0x200, 0x10 bytes in the
 * file, 0x40 in memory: 0x200010..0x200040 is BSS), with `code` at the start of the text.
 */
function syntheticElf(code: number[]): Uint8Array {
  const out = new Uint8Array(0x210);
  const header = [0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // ELF32, little-endian
    ...LE16(2), ...LE16(8), ...LE(1), ...LE(0x100000), ...LE(0x34), ...LE(0), ...LE(0),
    ...LE16(0x34), ...LE16(32), ...LE16(2), ...LE16(40), ...LE16(0), ...LE16(0)];
  out.set(header, 0);
  const ph = (type: number, off: number, vaddr: number, filesz: number, memsz: number): number[] =>
    [...LE(type), ...LE(off), ...LE(vaddr), ...LE(vaddr), ...LE(filesz), ...LE(memsz), ...LE(5), ...LE(16)];
  out.set(ph(1, 0x100, 0x100000, 0x100, 0x100), 0x34);
  out.set(ph(1, 0x200, 0x200000, 0x10, 0x40), 0x54);
  code.forEach((w, i) => out.set(LE(w), 0x100 + i * 4));
  return out;
}

describe('the ELF address map (CI, a synthetic ELF)', () => {
  const elf = syntheticElf([]);

  it('reads the program headers', () => {
    expect(programHeaders(elf)).toEqual([
      { type: 1, offset: 0x100, vaddr: 0x100000, filesz: 0x100, memsz: 0x100 },
      { type: 1, offset: 0x200, vaddr: 0x200000, filesz: 0x10, memsz: 0x40 },
    ]);
  });

  it('maps a virtual address inside a segment\'s file image to its file offset', () => {
    const segs = programHeaders(elf);
    expect(vaddrToOffset(segs, 0x100000)).toBe(0x100);
    expect(vaddrToOffset(segs, 0x1000fc)).toBe(0x1fc);
    expect(vaddrToOffset(segs, 0x200008)).toBe(0x208);
  });

  it('maps nothing in the BSS (memsz past filesz) or outside every segment', () => {
    const segs = programHeaders(elf);
    expect(vaddrToOffset(segs, 0x200010)).toBeNull();
    expect(fileBacked(segs, 0x200010)).toBe(false);
    expect(fileBacked(segs, 0x20003c)).toBe(false);
    expect(vaddrToOffset(segs, 0x100100)).toBeNull();
    expect(vaddrToOffset(segs, 0x300000)).toBeNull();
    expect(fileBacked(segs, 0x200000)).toBe(true);
  });

  it('refuses what is not a little-endian ELF32', () => {
    const bad = elf.slice();
    bad[0] = 0;
    expect(() => programHeaders(bad)).toThrow(/not an ELF/);
    const big = elf.slice();
    big[5] = 2;
    expect(() => programHeaders(big)).toThrow(/little-endian/);
  });
});

describe('the registration read (CI, synthetic MIPS)', () => {
  const REG = 0x100f00;

  it('takes slot, class and handler from each call, the class from the delay slot, until jr ra', () => {
    const code = [
      ...register(0x200024, 1, 0x10bca8, REG),     // a negative low half (0xbca8): lui 0x11, addiu -0x4358
      ...register(0x200028, 4, 0x100010, REG),
      ...register(0x200020, 1, 0x100018, REG),
      JR_RA, NOP,
      ...register(0x20002c, 1, 0x100020, REG),     // past the return: not read
    ];
    const elf = syntheticElf(code);
    const regs = decodeRegistrations(elf, 0x100000, REG);
    expect(regs).toEqual([
      { slot: 0x200024, cls: 1, handler: 0x10bca8 },
      { slot: 0x200028, cls: 4, handler: 0x100010 },
      { slot: 0x200020, cls: 1, handler: 0x100018 },
    ]);
  });

  it('numbers each slot by its order among its class\'s registrations, from 0', () => {
    const ids = assignIds([
      { slot: 0x200024, cls: 1, handler: 0 }, { slot: 0x200028, cls: 4, handler: 0 }, { slot: 0x200020, cls: 1, handler: 0 },
    ]);
    expect(ids.get(0x200024)).toEqual({ cls: 1, id: 0 });
    expect(ids.get(0x200028)).toEqual({ cls: 4, id: 0 });
    expect(ids.get(0x200020)).toEqual({ cls: 1, id: 1 });
  });

  it('refuses a call whose slot or class it could not resolve', () => {
    const code = [addiu(A1, ZERO, 1), jal(REG), NOP, JR_RA, NOP];   // a0 never set
    expect(() => decodeRegistrations(syntheticElf(code), 0x100000, REG)).toThrow(/unresolved/);
  });

  it('refuses a slot registered twice', () => {
    expect(() => assignIds([{ slot: 1, cls: 1, handler: 0 }, { slot: 1, cls: 1, handler: 0 }])).toThrow(/twice/);
  });
});

/**
 * The ids research 97 §2 and research 154 §2 state, pinned. Class 1 is MessageClassLobby, class 4 MessageClassLobbyExt (Horizon
 * `RT.Common/Types.cs` `NetMessageTypes`); the names are Horizon's `MediusLobbyMessageIds` / `MediusLobbyExtMessageIds`
 * for the same number.
 */
const PINNED: Record<number, [cls: number, id: number]> = {
  0x686b24: [1, 0x00],   // WorldReport0 (the s4 slice: 18 on the wire)
  0x686b28: [1, 0x01],   // PlayerReport
  0x686b4c: [1, 0x17],   // AccountGetID
  0x686b84: [1, 0x11],   // AccountUpdateStats
  0x686bf0: [1, 0x2f],   // GameWorldPlayerList
  0x686bf8: [1, 0x31],   // PlayerInfo
  0x686c18: [1, 0x39],   // FindPlayer
  0x686c20: [1, 0x3b],   // ChatMessage
  0x686c30: [1, 0x3f],   // AddToBuddyList
  0x686c48: [1, 0x41],   // RemoveFromBuddyList
  0x686c74: [1, 0x47],   // Policy
  0x686c80: [1, 0x4b],   // GetAnnouncements
  0x686cb4: [1, 0x54],   // CreateClan
  0x686cbc: [1, 0x56],   // DisbandClan
  0x686cd4: [1, 0x5c],   // TransferClanLeadership
  0x686cdc: [1, 0x5e],   // AddPlayerToClan
  0x686ce4: [1, 0x60],   // RemovePlayerFromClan
  0x686cec: [1, 0x62],   // InvitePlayerToClan
  0x686cf4: [1, 0x64],   // CheckMyClanInvitations
  0x686d04: [1, 0x66],   // RespondToClanInvitation
  0x686d0c: [1, 0x68],   // RevokeClanInvitation
  0x686d1c: [1, 0x6c],   // GetMyClanMessages
  0x686d24: [1, 0x6e],   // SendClanMessage
  0x686d2c: [1, 0x70],   // ModifyClanMessage
  0x686d34: [1, 0x72],   // DeleteClanMessage
  0x686cfc: [1, 0x7a],   // GetClanInvitationsSent
  0x686d4c: [1, 0x7c],   // GetMyClans
  0x686d64: [1, 0x7e],   // GetAllClanMessages
  0x686d74: [1, 0x84],   // UpdateClanStats
  0x686d84: [1, 0x8a],   // BanPlayer
  0x686dc4: [1, 0x98],   // TextFilter
  0x686c5c: [1, 0xc0],   // GetIgnoreList
  0x686c64: [1, 0xc2],   // AddToIgnoreList
  0x686c6c: [1, 0xc4],   // RemoveFromIgnoreList
  0x686e4c: [1, 0xce],   // UpdateLadderStats (the plain form)
  0x686e00: [1, 0xd2],   // ClanLadderList
  0x686e08: [1, 0xd4],   // ClanLadderPosition
  0x686e10: [1, 0xd6],   // GetBuddyList_ExtraInfo
  0x686e18: [1, 0xd8],   // GetTotalRankings
  0x686e28: [1, 0xda],   // GetClanMemberList_ExtraInfo
  0x686e20: [1, 0xdc],   // GetLobbyPlayerNames_ExtraInfo
  0x686e40: [1, 0xef],   // LadderList_ExtraInfo0
  0x686e5c: [1, 0xf1],   // LadderPosition_ExtraInfo
  0x686c50: [4, 0x05],   // AddToBuddyListConfirmation
  0x686c38: [4, 0x06],   // AddToBuddyListFwdConfirmation (received)
  0x686c40: [4, 0x07],   // AddToBuddyListFwdConfirmationResponse
  0x686e94: [4, 0x08],   // GetBuddyInvitations
  // research 154 §2 (SVC-06): the nine pairs between the BRIEFING ROOMS and a game's lobby, and the two FUN_002efc80
  // also posts on entering a room
  0x686e38: [1, 0xec],   // ChannelList_ExtraInfo0
  0x686bb0: [4, 0x00],   // CreateChannel1
  0x686c10: [1, 0x37],   // FindWorldByName
  0x686bc8: [1, 0x25],   // JoinChannel
  0x686c8c: [1, 0x4e],   // SetGameListFilter0
  0x686c94: [1, 0x50],   // ClearGameListFilter0
  0x686e30: [1, 0xea],   // GameList_ExtraInfo0
  0x686ba0: [1, 0xf4],   // CreateGame1
  0x686bc0: [1, 0xf3],   // JoinGame
  0x686c7c: [1, 0x49],   // UpdateUserState
  0x686cac: [1, 0x86],   // VersionServer
};

const ELF = elfPath();

describe.skipIf(!existsSync(ELF))('the retail ELF (dev disc only)', () => {
  const read = () => {
    const elf = new Uint8Array(readFileSync(ELF));
    const regs = decodeRegistrations(elf, REGISTER_FN, REGISTRAR);
    return { elf, regs, ids: assignIds(regs) };
  };

  it('FUN_0064db00 registers 264 slots: 253 Lobby (0x00..0xfc) and 11 LobbyExt (0x00..0x0a), none twice', () => {
    const { regs } = read();
    expect(regs.length).toBe(264);
    expect(regs.filter((r) => r.cls === 1).length).toBe(253);
    expect(regs.filter((r) => r.cls === 4).length).toBe(11);
    expect(regs.every((r) => r.cls === 1 || r.cls === 4)).toBe(true);
  });

  it('gives every slot research 97 cites the id the note states', () => {
    const { ids } = read();
    const got = Object.fromEntries(Object.keys(PINNED).map((k) => {
      const v = ids.get(Number(k));
      return [k, v ? [v.cls, v.id] : null];
    }));
    expect(got).toEqual(Object.fromEntries(Object.entries(PINNED)));
  });

  it('the note\'s slot list is the pinned list', () => {
    expect([...NOTE_SLOTS].sort((a, b) => a - b)).toEqual(Object.keys(PINNED).map(Number).sort((a, b) => a - b));
  });

  it('every slot lies in the BSS: the ELF holds no value for it (why a `.data` read finds nothing)', () => {
    const { elf, regs } = read();
    const segs = programHeaders(elf);
    expect(regs.filter((r) => fileBacked(segs, r.slot))).toEqual([]);
  });

  it('registers no slot for LobbyExt 0x0b (UpdateLadderStatsWide): the client cannot send the wide form', () => {
    const { ids } = read();
    expect([...ids.values()].some((v) => v.cls === 4 && v.id === 0x0b)).toBe(false);
  });
});
