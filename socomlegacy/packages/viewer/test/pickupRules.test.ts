import { describe, expect, it } from 'vitest';
import { CLAYMORE, EMPTY_ITEM, FULL_SLOT, ITEM, M67 as M67_RECORD, readKitTable, type KitTable } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import {
  LAUNCHER_SLOT_KEPT_READING, launcherClaimSlots, launcherListed, launcherOffered, launcherRoundOf, launcherSlotOf, PICKUP_LAUNCHER_READING,
  PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER, PICKUP_LAUNCHER_ROUNDS_READING, pickupKitOf, type PickupKitSlot,
} from '../src/net/pickupRules';

/**
 * NU-5 L1 (web research 323 R323.5, §1.6, §7 L1; F1 of its review): the rocket launcher's predicate, one function the
 * room (`match/src/pickups.ts`) and the page (`../src/drops`) share -- `FUN_005bac30` (D:L473023-473084): no item of
 * `FUN_003c5d80`'s list (D:L317287-317299) in the kit, and a slot 2-4 free or replaceable by `FUN_005bae60`'s test
 * (D:L473101-473152). A transcription test: the decompilation re-read, nothing run against the original.
 */

/** A five-slot kit: each slot's item and the rounds its ring holds (0 when absent). */
const kit = (items: number[], rounds: number[] = []): PickupKitSlot[] => items.map((item, i) => ({ item, rounds: rounds[i] ?? 0 }));
const M67 = 121, HE = 126, C4 = ITEM.C4, M4A1 = 54, MARK23 = 15;

describe('NU-5 L1: the rocket launcher offered and claimable (research 323 §1.6, FUN_005bac30)', () => {
  it("FUN_003c5d80's list: the M203 rifles 52 and 61, the OICW 63, the MGL 142, the M79 143 and every class-0x91 launcher (145-150); not the M203 item 141, a rifle, a pistol, a round", () => {
    expect(PICKUP_LAUNCHER_READING).toBe('claimable with one round, by a kit carrying no launcher');
    for (const id of [ITEM.M16_203, ITEM.M4_203, ITEM.F2000, ITEM.MGL, ITEM.M79, ITEM.LAW, ITEM.RPG7, 147, 150]) expect(launcherListed(id), String(id)).toBe(true);
    for (const id of [ITEM.M203, M4A1, MARK23, ITEM.LAW_HEAT, ITEM.RPG_ROUND, M67, EMPTY_ITEM, 144, 151]) expect(launcherListed(id), String(id)).toBe(false);
  });

  it("FUN_005bae60's slot: the first of 2-4 with an empty ring and an item outside the ten, or holding 0xff -- a spent grenade slot, an empty slot; never slot 0 or 1, never a slot with a round left, never one of the ten", () => {
    expect([...LAUNCHER_SLOT_KEPT_READING].sort((a, b) => a - b)).toEqual([11, 141, 145, 146, 190, 193, 194, 195, 254, 255]);
    expect(launcherSlotOf(kit([M4A1, MARK23, M67, HE, EMPTY_ITEM], [0, 0, 3, 3]))).toBe(4);       // the grenades left: the empty slot
    expect(launcherSlotOf(kit([M4A1, MARK23, M67, HE, EMPTY_ITEM], [0, 0, 0, 3]))).toBe(2);       // the M67s thrown: their slot first
    expect(launcherSlotOf(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 3, 3, 4]))).toBeNull();         // every slot holding rounds
    expect(launcherSlotOf(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 3, 0, 4]))).toBe(3);
    // The ten keep their slot even with an empty ring (the Detonator, the 2X, the Thermal Scope, a cost-2 item's FULL_SLOT).
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.DETONATOR, ITEM.DOUBLE_AMMO, ITEM.THERMAL]))).toBeNull();
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.DETONATOR, FULL_SLOT, EMPTY_ITEM]))).toBe(4);
    // A round slot spent (an orphan LAW HEAT) is replaceable; with its round left it is not.
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.THERMAL, ITEM.DOUBLE_AMMO], [0, 0, 0]))).toBe(2);
    expect(launcherSlotOf(kit([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.THERMAL, ITEM.DOUBLE_AMMO], [0, 0, 1]))).toBeNull();
  });

  it('FUN_005bac30: offered to a kit with no launcher-list item and a slot; never to a kit carrying a LAW, an RPG-7, an M203 rifle, the MGL or the M79, a free slot or not; never to a kit with no slot', () => {
    const free = (primary: number, eq: number[] = [M67, HE, EMPTY_ITEM]): PickupKitSlot[] => kit([primary, MARK23, ...eq], [0, 0, 3, 3]);
    expect(launcherOffered(free(M4A1))).toBe(true);
    for (const p of [ITEM.M16_203, ITEM.M4_203, ITEM.F2000, ITEM.MGL, ITEM.M79]) expect(launcherOffered(free(p)), String(p)).toBe(false);
    expect(launcherOffered(free(M4A1, [ITEM.LAW, ITEM.LAW_HEAT, EMPTY_ITEM]))).toBe(false);       // a LAW carried, a slot free
    expect(launcherOffered(free(M4A1, [ITEM.RPG7, ITEM.RPG_ROUND, EMPTY_ITEM]))).toBe(false);
    expect(launcherOffered(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 3, 3, 4]))).toBe(false);      // no slot
    expect(launcherOffered(kit([M4A1, MARK23, M67, HE, C4], [0, 0, 0, 3, 4]))).toBe(true);       // the M67s thrown
  });

  it('the claimed launcher arrives with one round (FUN_005ba3d0(kit, slot, 1) D:L458291)', () => {
    expect(PICKUP_LAUNCHER_ROUNDS_READING).toBe(1);
  });
});

/**
 * NU-5 L1, the port's five slots (`PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`; the controller's decision (i)): the original
 * installs the round at the kit's count, a slot past the five (D:L458285-458289); the port puts it in the first other
 * empty slot 2-4 and, with none, neither offers nor takes the launcher. RED both ways.
 */
describe('NU-5 L1: the launcher claim\'s two slots in a five-slot kit (PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER)', () => {
  it('a slot for the launcher and another empty one for its round: claimable; the launcher\'s slot only: refused (null), though FUN_005bac30 answers', () => {
    expect(PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER).toBe('the first empty slot 2-4; none: refused');
    expect(launcherClaimSlots(kit([M4A1, MARK23, M67, EMPTY_ITEM, EMPTY_ITEM], [0, 0, 3]))).toEqual({ launcher: 3, round: 4 });
    expect(launcherClaimSlots(kit([M4A1, MARK23, M67, EMPTY_ITEM, EMPTY_ITEM], [0, 0, 0]))).toEqual({ launcher: 2, round: 3 });
    expect(launcherClaimSlots(kit([M4A1, MARK23, M67, HE, EMPTY_ITEM], [0, 0, 0, 3]))).toEqual({ launcher: 2, round: 4 });
    // One place only: FUN_005bac30 answers (the original would add the round at slot 5), the port refuses.
    const one = kit([M4A1, MARK23, M67, HE, EMPTY_ITEM], [0, 0, 3, 3]);
    expect(launcherOffered(one)).toBe(true);
    expect(launcherClaimSlots(one)).toBeNull();
    const spent = kit([M4A1, MARK23, M67, HE, C4], [0, 0, 0, 3, 4]);
    expect(launcherOffered(spent)).toBe(true);
    expect(launcherClaimSlots(spent)).toBeNull();
    // A kit FUN_005bac30 refuses stays refused.
    expect(launcherClaimSlots(kit([ITEM.M4_203, MARK23, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM]))).toBeNull();
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
  it("the kit [rifle, pistol, Satchel, FULL_SLOT, empty]: the Satchel's slot holds its one round (the disc's 1 x 1), so FUN_005bae60's slot is 4 -- and with no other empty slot for the round, the port refuses (PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER)", () => {
    const table: KitTable = readKitTable(ZWEAPON!);
    const satchel = table.arsenal.items.get(ITEM.SATCHEL)!;
    expect([satchel.magazine, satchel.mags]).toEqual([1, 1]);
    const k = pickupKitOf([M4A1, MARK23, ITEM.SATCHEL, FULL_SLOT, EMPTY_ITEM], table, () => 0, {});
    expect(k[2]).toEqual({ item: ITEM.SATCHEL, rounds: 1 });
    expect(launcherSlotOf(k)).toBe(4);
    expect(launcherClaimSlots(k)).toBeNull();
    // A Satchel kit with two empty slots: the launcher into the first of them, the Satchel kept.
    expect(launcherClaimSlots(pickupKitOf([M4A1, MARK23, ITEM.SATCHEL, EMPTY_ITEM, EMPTY_ITEM], table, () => 0, {}))).toEqual({ launcher: 3, round: 4 });
    // A spent round slot still reads its ring (0), and C4 and the claymore their pouch's live count, as before.
    expect(pickupKitOf([M4A1, MARK23, ITEM.LAW_HEAT, ITEM.C4, ITEM.CLAYMORE], table, () => 0, { C4: 2 }).slice(2).map((x) => x.rounds)).toEqual([0, 2, 0]);
  });
});
