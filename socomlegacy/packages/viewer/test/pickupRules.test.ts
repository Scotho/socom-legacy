import { describe, expect, it } from 'vitest';
import { CLAYMORE, EMPTY_ITEM, FULL_SLOT, ITEM, M67 as M67_RECORD, readKitTable, type KitTable } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import {
  launcherClaimSlots, launcherOffered, launcherRoundOf, launcherSlotOf, PICKUP_LAUNCHER_READING, PICKUP_LAUNCHER_ROUND_SLOT_READING,
  PICKUP_LAUNCHER_ROUNDS_READING, PICKUP_SPENT_EXEMPT_IDS_READING, pickupKitOf, type PickupKitSlot,
} from '../src/net/pickupRules';

/**
 * R4P-103 (r0004; the reading `docs/atlas/readings/r4p-103-launcher-pickup-placement.md`, agent/spc-atlas dcd314b4bd
 * (the Q103C re-filing; first filed ab07d4e025), reviewed; the captures Q-103 / Q103B a1e119affd and Q103C dcd314b4bd, the weapons register): a ground LAW or RPG-7 is
 * placed by `FUN_005a4b70` -> `FUN_005c1990(kit, -1)` (D4:L499279) -- the first of slots 2-4 that is empty (255) or spent
 * (every round counter <= 0, the id not one of `PICKUP_SPENT_EXEMPT_IDS_READING`'s ten) -- its round appended at the
 * kit's record count with one round (D4:L499303-499309); offered by `FUN_005c1760` (D4:L514677) unless a launcher
 * (145-150) is held or no slot qualifies. One function the room (`match/src/pickups.ts`) and the page (`../src/drops`)
 * share. The kits below are the captures' (ids for slots 0-4; the counters as Q103C read them).
 */

/** A five-slot kit: each slot's item and the rounds its ring holds (0 when absent). */
const kit = (items: number[], rounds: number[] = []): PickupKitSlot[] => items.map((item, i) => ({ item, rounds: rounds[i] ?? 0 }));
const M67 = 121, HE = 126, FLASH = 123, C4 = ITEM.C4, M4A1 = 54, M4A1_SD = 62, MARK23 = 15, MARK23_SD = 16;

describe('R4P-103: the launcher offer (FUN_005c1760 D4:L514677; Q-103)', () => {
  it('offered to the M203 carrier 61 16 141 175 255 (Q-103) and to every grenade-launcher primary; refused to a kit holding a launcher 145-150 (Q-103: a LAW in hand) or with no slot 2-4 empty or spent', () => {
    expect(PICKUP_LAUNCHER_READING).toBe('claimable with one round, by a kit carrying no launcher');
    expect(launcherOffered(kit([ITEM.M4_203, MARK23_SD, ITEM.M203, ITEM.M203_FRAG, EMPTY_ITEM], [0, 0, 0, 6]))).toBe(true);
    for (const p of [ITEM.M16_203, ITEM.M4_203, ITEM.F2000, ITEM.MGL, ITEM.M79]) {
      expect(launcherOffered(kit([p, MARK23, M67, HE, EMPTY_ITEM], [0, 0, 3, 3])), String(p)).toBe(true);
    }
    for (const l of [ITEM.LAW, ITEM.RPG7, 147, 150]) {
      expect(launcherOffered(kit([M4A1, MARK23, l, ITEM.LAW_HEAT, EMPTY_ITEM], [0, 0, 0, 1])), String(l)).toBe(false);
    }
    expect(launcherOffered(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 3, 3, 4]))).toBe(false);      // no slot: every one holds rounds
    expect(launcherOffered(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 0, 3, 4]))).toBe(true);       // the M67s thrown: spent
  });

  it('the claimed launcher arrives with one round (D4:L499303-499309)', () => {
    expect(PICKUP_LAUNCHER_ROUNDS_READING).toBe(1);
  });
});

describe("R4P-103: the launcher's slot -- the first of 2-4 empty or spent (FUN_005c1990 D4:L499279; Q103B, Q103C)", () => {
  it("free at 2 -> 2; three free -> 2; only 4 free with 2 and 3 holding rounds -> 4 (Q103B; Q103C's control 62 16 123 123 255, counters 1 / 2)", () => {
    expect(launcherSlotOf(kit([M4A1_SD, MARK23_SD, EMPTY_ITEM, FLASH, FLASH], [0, 0, 0, 1, 1]))).toBe(2);
    expect(launcherSlotOf(kit([M4A1, MARK23, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM]))).toBe(2);
    expect(launcherSlotOf(kit([M4A1_SD, MARK23_SD, FLASH, FLASH, EMPTY_ITEM], [0, 0, 1, 2]))).toBe(4);
  });

  it('a spent slot before an empty one is taken (Q103C): 62 16 123 123 255 with slot 3 spent -> 3; the carrier 61 16 141 175 255, the 203 FRAG spent -> 3; slot 2 spent, 3 empty -> 2', () => {
    expect(launcherSlotOf(kit([M4A1_SD, MARK23_SD, FLASH, FLASH, EMPTY_ITEM], [0, 0, 1, 0]))).toBe(3);
    expect(launcherSlotOf(kit([ITEM.M4_203, MARK23_SD, ITEM.M203, ITEM.M203_FRAG, EMPTY_ITEM], [0, 0, 0, 0]))).toBe(3);
    expect(launcherSlotOf(kit([M4A1_SD, MARK23_SD, FLASH, EMPTY_ITEM, FLASH], [0, 0, 0, 0, 1]))).toBe(2);
  });

  it('the ten exempt ids are never taken spent (PICKUP_SPENT_EXEMPT_IDS_READING): the M203 item 141, the Detonator, the 2X, the Thermal Scope, FULL_SLOT 254', () => {
    expect([...PICKUP_SPENT_EXEMPT_IDS_READING].sort((a, b) => a - b)).toEqual([11, 141, 145, 146, 190, 193, 194, 195, 254, 255]);
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.DETONATOR, ITEM.DOUBLE_AMMO, ITEM.THERMAL]))).toBeNull();
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.DETONATOR, FULL_SLOT, EMPTY_ITEM]))).toBe(4);
    expect(launcherSlotOf(kit([ITEM.M4_203, MARK23, ITEM.M203, ITEM.M203_FRAG, EMPTY_ITEM], [0, 0, 0, 6]))).toBe(4);   // 141 kept, 175 live
    // A round slot spent (an orphan LAW HEAT) is replaceable; with its round left it is not.
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.THERMAL, ITEM.DOUBLE_AMMO], [0, 0, 0]))).toBe(2);
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.THERMAL, ITEM.DOUBLE_AMMO], [0, 0, 1]))).toBeNull();
  });
});

describe('R4P-103: the round appended at the record count (D4:L499303-499309; Q103B: 185 at index 5)', () => {
  it('a five-record kit: the launcher in its slot, the round at index 5 -- one free slot suffices (Q-103); no slot: null', () => {
    expect(PICKUP_LAUNCHER_ROUND_SLOT_READING).toBe("appended at the kit's record count");
    expect(launcherClaimSlots(kit([M4A1_SD, MARK23_SD, FLASH, FLASH, EMPTY_ITEM], [0, 0, 1, 2]))).toEqual({ launcher: 4, round: 5 });
    expect(launcherClaimSlots(kit([M4A1_SD, MARK23_SD, FLASH, FLASH, EMPTY_ITEM], [0, 0, 1, 0]))).toEqual({ launcher: 3, round: 5 });
    expect(launcherClaimSlots(kit([M4A1_SD, MARK23_SD, EMPTY_ITEM, FLASH, FLASH], [0, 0, 0, 1, 1]))).toEqual({ launcher: 2, round: 5 });
    expect(launcherClaimSlots(kit([M4A1, MARK23, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM]))).toEqual({ launcher: 2, round: 5 });
    expect(launcherClaimSlots(kit([ITEM.M4_203, MARK23_SD, ITEM.M203, ITEM.M203_FRAG, EMPTY_ITEM], [0, 0, 0, 0]))).toEqual({ launcher: 3, round: 5 });
    expect(launcherClaimSlots(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 3, 3, 4]))).toBeNull();
    expect(launcherClaimSlots(kit([M4A1, MARK23, ITEM.LAW, ITEM.LAW_HEAT, EMPTY_ITEM], [0, 0, 0, 1]))).toBeNull();
    expect([launcherRoundOf(ITEM.LAW), launcherRoundOf(ITEM.RPG7), launcherRoundOf(147)]).toEqual([ITEM.LAW_HEAT, ITEM.RPG_ROUND, ITEM.LAW_HEAT]);
  });

  it("pickupKitOf reads a throwable's or a charge's slot by the pouch's name, a round's by its ring, the firearms as 0", () => {
    const table = null;
    const got = pickupKitOf([M4A1, MARK23, M67, ITEM.LAW_HEAT, CLAYMORE.id], table, (s) => (s === 3 ? 1 : 99), { [M67_RECORD.name]: 0, [CLAYMORE.name]: 2 });
    expect(got).toEqual([{ item: M4A1, rounds: 0 }, { item: MARK23, rounds: 0 }, { item: M67, rounds: 0 }, { item: ITEM.LAW_HEAT, rounds: 1 }, { item: CLAYMORE.id, rounds: 2 }]);
    expect(pickupKitOf([M4A1, MARK23, HE, EMPTY_ITEM, EMPTY_ITEM], table, () => 0, {}).map((k) => k.rounds)).toEqual([0, 0, 0, 0, 0]);
  });
});

/**
 * NU-5 review F1 (the fresh review of 7c374ad0a): a held charge the port keeps no count of reads its ring as the kit's
 * fill gives it, not empty. The Satchel (152, `equipmentKind` 'none': neither the pouch nor a `KitRounds` ring) carries
 * `Ammo_Capacity` 1 and `NumMags` 1 on the disc, so the original's ring for its slot holds a round and `FUN_005bae60`'s
 * ring loop (D:L473114) passes it by; the port read 0 and laid the launcher over it, orphaning its `FULL_SLOT`. The
 * Satchel reaches no multiplayer kit (`Enable_satchel` 0 on all 22 maps, research 94 §A1), so the case is the reading's,
 * fixed for every item the port counts nowhere; C4 and the claymore keep their pouch's live count.
 */
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
describe.skipIf(ZWEAPON === null)('NU-5 review F1: a held Satchel reads as held, not as an empty slot', () => {
  it("the kit [rifle, pistol, Satchel, FULL_SLOT, empty]: the Satchel's slot holds its one round (the disc's 1 x 1), so the launcher's slot is 4 and its round is appended at 5", () => {
    const table: KitTable = readKitTable(ZWEAPON!);
    const satchel = table.arsenal.items.get(ITEM.SATCHEL)!;
    expect([satchel.magazine, satchel.mags]).toEqual([1, 1]);
    const k = pickupKitOf([M4A1, MARK23, ITEM.SATCHEL, FULL_SLOT, EMPTY_ITEM], table, () => 0, {});
    expect(k[2]).toEqual({ item: ITEM.SATCHEL, rounds: 1 });
    expect(launcherSlotOf(k)).toBe(4);
    expect(launcherClaimSlots(k)).toEqual({ launcher: 4, round: 5 });
    // A Satchel kit with two empty slots: the launcher into the first of them, the Satchel kept.
    expect(launcherClaimSlots(pickupKitOf([M4A1, MARK23, ITEM.SATCHEL, EMPTY_ITEM, EMPTY_ITEM], table, () => 0, {}))).toEqual({ launcher: 3, round: 5 });
    // A spent round slot still reads its ring (0), and C4 and the claymore their pouch's live count, as before.
    expect(pickupKitOf([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.C4, ITEM.CLAYMORE], table, () => 0, { C4: 2 }).slice(2).map((x) => x.rounds)).toEqual([0, 2, 0]);
  });
});
