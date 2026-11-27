import { EMPTY_ITEM, FULL_SLOT, ITEM, itemClass, slotKindOf, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { firearmSlotPresent, kitRecords, type FirearmSlot } from '../../viewer/src/loadout';
import { magazinesCarried, MagazineRing } from '../../viewer/src/magazines';
import { rocketRoundOf, throwableOf, type EquipmentSlots } from '../../viewer/src/equipment';
import type { BundleEntryWire, DropWire } from '../../viewer/src/net/protocol';
import {
  launcherClaimSlots, launcherRoundOf, PICKUP_SPENT_EXEMPT_IDS_READING, pickupKitOf, PICKUP_LAUNCHER_ROUNDS_READING, type PickupKitSlot,
} from '../../viewer/src/net/pickupRules';

/**
 * PF-34 (ruling PF.R54; web research 234 s1-s4, 194 s2): the world inventory's pure half -- what a classic death lays, a
 * weapon claim's same-family replacement, and an ammunition bundle's transfer -- for the room's `./worldDrops` (which
 * holds the drops, their ids and the claims) to apply once. Every value is a reading of the decompilation
 * (`socom2_game.elf.decomp.c`, `D:L<n>`) through research 194 s2, re-read for PF-34 (research 234); none is measured.
 */

/** A drop before the room gives it its `did` (`./worldDrops`). */
export type DropSpec = Omit<DropWire, 'did'>;
type V3 = [number, number, number];

/**
 * A classic death drops its kit; a respawn game's drops nothing: `FUN_005a0040` D:L458646-458706 returns early when game
 * `+0xdc` is set, and `FUN_002a7560` D:L149415-149433 sets it only with the respawn option on game type 5 -- "a retail
 * rule, not a proposed anti-farming policy" (194 L74). A classic room's waiting room (both sides not yet seated) plays
 * as a respawn room (`CLASSIC_WAITING_PLACEHOLDER`) and drops nothing either. [reading]
 */
export const DROP_RESPAWN_RULE_READING = 'classic only' as const;
/**
 * What a death lays (`FUN_005a0040` D:L458646-458706): one ammunition bundle (`FUN_0059fd50(actor, -1)`) holding each
 * eligible slot's ten magazine entries, cleared from the body (`FUN_005ba040` D:L472580-472672 reads the ten entries of
 * `+0x1d4 + slot * 0x28`, passes their sum to `FUN_003cfef0` D:L472624 and zeroes them), then one weapon drop per
 * firearm slot (`FUN_0059f730`; the bundle D:L458686, the weapons D:L458693, D:L458702) -- "not a fresh weapon plus
 * NumMags full magazines" (194 s2). [reading]
 */
export const DROP_CONTENTS_READING = 'weapons + one bundle of the ten entries, cleared' as const;
/**
 * The launcher drops only with its round present: `FUN_005a0040` looks up item 0xb9 (LAW HEAT) or 0xba (RPG round) in
 * the kit (`FUN_005c86f0`, D:L458675-458677) and drops the launcher slot only when `FUN_005bdb20` answers for it
 * (D:L458679-458683, read as "its round has rounds"; the drop D:L458705-458706). NU-5 L1 (research 323 §1.6): it is
 * claimable by a kit carrying no launcher (`PICKUP_LAUNCHER_READING`, `claimWeapon`). Was (PF-34 to NU-5): "The launcher
 * is not claimable this sprint -- its family and its refill are their own case (194 L76) -- so it lies where it
 * dropped." [reading]
 */
export const LAUNCHER_DROP_READING = 'with its round' as const;
/**
 * Which slots' rings fill the bundle (R142, LATER 1088; reading, pending review, of the builder): `FUN_005ba040`
 * (D:L472580-472626) walks every kit slot with a record (D:L472582), an ammo item at `+0x15c` (D:L472609) and a round in
 * its ring (D:L472610-472622), and leaves out the MISSILE class 0xb9-0xbd alone (D:L472623; `FUN_003d1a60` D:L324243,
 * D:L324347: the LAW HEAT and the RPG round alike); `FUN_003d1d10` / `FUN_003d1ce0` exclude no slot, they only null the
 * record of a firearm's entry (D:L472585-472589). So a grenade or a charge slot with rounds joins the bundle with its
 * record (the entry's `item`). The port bundles its two firearm rings and its throwable and charge rings
 * (`EquipmentSlots`) whose record names an ammunition (the port's `+0x15c`: the record's first `AMMO_TYPES`). Still
 * unread: which records carry an ammo item (a non-empty `AMMO_TYPES`) -- so the grenade launchers' rounds (171-183, the
 * port's `KitRounds`) are not bundled. Was (to R142): 'the two firearm rings'. Settles: a dev-disc assertion over the
 * `ZWEAPON` records' `ammoId`. [placeholder]
 */
export const BUNDLE_SLOTS_PLACEHOLDER = 'the firearm rings and the throwable and charge rings' as const;
/**
 * A weapon claim goes to the slot of the weapon's own family: `FUN_0059f0c0` D:L458178-458190 resolves the destination
 * from the record's category (`FUN_005b8820` of `+0x7c`, `FUN_005b8630`) -- the port's `slotKindOf`: a primary class to
 * slot 0, a pistol to slot 1; a rocket launcher (family 4) to an equipment slot by NU-5 L1's rule
 * (`PICKUP_LAUNCHER_READING`); an equipment item is never a weapon on the ground. Was (to NU-5): "anything else (the
 * launcher, an equipment item) is not claimed". [reading]
 */
export const PICKUP_FAMILY_READING = 'same slot' as const;
/**
 * A dropped weapon carries no rounds: its ring went into the bundle first (`FUN_005a0040` drops the bundle before the
 * weapons; `FUN_0059f0c0` drops the replaced slot's ammo, then its weapon, D:L458186-458189), so a taken weapon arrives
 * with an empty ring and is fed from a bundle. [reading]
 */
export const WEAPON_DROP_AMMO_READING = 'empty ring' as const;
/**
 * How many magazines a bundle may fill (the 2026-11-06 player report: "9 MAG" off bodies): a weapon's first `NumMags`
 * ring slots and no more. `FUN_005bb000` (D:L473174-473188; its other branch D:L473344, D:L473351; caller `FUN_0059dfb0` D:L457700-457795) hands the bundle's rounds, slot by slot of the kit, to
 * `FUN_005ba3d0(kit, slot, rounds)`, which reads the record's `NumMags` (D:L472718), doubles it when the kit holds the
 * Double Ammo Load (item -0x3e, D:L472725) and the record's class is a firearm's (D:L472737-472740), caps it at 10
 * (D:L472744-472745), writes rounds only into the slots below it (D:L472750-472758) and zeroes the rest (D:L472763) --
 * so no pickup ever carries a weapon past the magazines it spawns with (`magazinesCarried`, `../viewer/src/magazines`).
 * The port's records reach the room with 2X applied (`kitRecords` -> `withDoubleAmmo`), so the cap is
 * `magazinesCarried(record.mags)` with no second doubling. From the disc's ZWEAPON.ZAR (`readKitTable`, `NumMags`):
 * 3 for most firearms (M4A1, Mark 23: 6 with 2X), 1 for the M40A1 (2), 2 for the machine guns (4), 4 for both
 * M16A2s, the 226, P228, SR-1, HK5 and Dragunov (8), 5 for the 9mm Pistol and the 870, 6 for the MP5K (10); the
 * grenade launchers' classes are not doubled (MGL 2, M79 1). [reading]
 */
export const PICKUP_MAGAZINE_CAP_READING = 'NumMags, 2X doubled, at most 10' as const;
/**
 * Which of the taker's slots a bundle entry feeds (2026-11-13, finding 4b; research 234 s7): a firearm's entry carries no
 * record (`FUN_005ba040` D:L472586-472589 zeroes it for the firearm and pistol classes, `FUN_003d1d10` /
 * `FUN_003d1ce0`), so `FUN_005bb000` (D:L473176-473188) pours it into EVERY kit slot whose record's ammunition list
 * holds the entry's ammunition -- compared by NAME (`FUN_003d2680` D:L325031-325048, `FUN_00198f18` a string compare)
 * -- in slot order, what is left flowing on to the next such slot. Any side's: a 552's 5.56 x 45mm feeds an M4A1. The
 * port's records keep one ammunition each (`AMMO_TYPES`' first NAME, `@s2u/scene` `weaponRecord`); every record on the
 * dev disc lists at most one (72 one, 14 none: a byte read of `RUN/ZWEAPON.ZAR`, 2026-11-13), so the first is exact. An
 * entry that carries a record (the equipment's: grenades, charges) is not a firearm's: `takeEquipment`
 * (`PICKUP_EQUIPMENT_TAKE_READING`, R142). Was (to 2026-11-13): the same record id only. [reading]
 */
export const PICKUP_AMMO_MATCH_READING = 'by ammunition, every slot in order' as const;
/**
 * How a matched slot takes a bundle's rounds -- the pour (2026-11-13, finding 4b; `FUN_005ba3d0` D:L472718-472773,
 * re-read by seat e4): magazines 0 to 9 in order, each BELOW the cap (`PICKUP_MAGAZINE_CAP_READING`) topped up toward
 * `Ammo_Capacity` from the count -- it takes the capacity less what it holds, or what is left -- the part-spent ones among
 * them; each one at or past the cap zeroed (D:L472760-472763); what is left returned (`FUN_005bb000` then flows it on).
 * OT.R97: r0004 adds one test inside the under-the-cap branch (`0x5c0d80-0x5c0d9c`, the r0004 cluster's diff of
 * `005ba3d0`): the magazine in the weapon (`kit+0x684+slot*4`) is skipped when the record's OWN `NumMags` (`FUN_003d2800`,
 * never the 2X-doubled count) is 2 or more -- so a one-magazine weapon (the M40A1) has its only magazine, the one in the
 * weapon, topped up. The room tells the page each magazine's AMOUNT poured (`kit`'s `added`), which the page adds to its own
 * count (`../../viewer/src/fire` `Fire.setRing`): exact with shots or a reload in flight, where the room's count lags the
 * page's. Was (to 2026-11-13): empty magazines only, the one in the weapon never (`AMMO_TRANSFER_PLACEHOLDER`'s old
 * value). [reading]
 */
export const PICKUP_POUR_READING = 'topped up under the cap, the loaded one skipped from 2 magazines' as const;
/**
 * What of a walked-over bundle's FIREARM entry stays after the pour: the port leaves the remainder on the ground, offline
 * and online alike. Owed: `FUN_005bb000` returns it through `param_4`; offline its caller writes it back (`FUN_003cfe40`
 * D:L473554-473555), online the owner's grant clears each granted entry whole (`FUN_0059dfb0`, `FUN_003cfc40` D:L457702)
 * -- the remainder is lost there, which reverses a test research 194 asked for ("do not implement ... full-mag transfer
 * to fill those gaps", 194 L78): the owner's to rule with that task. An EQUIPMENT entry follows the grant since R142
 * (`PICKUP_EQUIPMENT_TAKE_READING`: cleared whole; the review F4 of the slot-cost read). Was (to 2026-11-13): the whole
 * transfer's placeholder ('whole entries into free slots', then 'empty magazines under the cap, filled from the sum').
 * Settles: that task, or capture B. [placeholder]
 */
export const AMMO_TRANSFER_PLACEHOLDER = 'the remainder stays on the ground' as const;
/**
 * R142 (LATER 1088; the reads R142-bundle-read and R142-slotcost-read of 2026-11-15 and that read's fresh review, which
 * wins where they differ): how a walked-over bundle's EQUIPMENT entry (one carrying a record: a grenade, a charge) is
 * taken. A body's bundle in a networked match takes the ask and grant path (the review F4: the owner branch,
 * `FUN_005bb990` D:L473553, never applies to a living taker of a body's bundle):
 * - the ask, each entry against the taker's kit as it stands, no pour between (`FUN_005bb990` D:L473590-473605 ->
 *   `FUN_005ba770` D:L472842-473007): the same-item slot (below) has room (`FUN_005ba5b0` D:L472779-472837) -- with a
 *   same-item slot and no room, refused, no other slot sought (D:L473003 -> D:L472830) -- else the slot search (below),
 *   with its SlotCost test, finds one;
 * - the grant (`FUN_0059e830` D:L457886-457933 -> `FUN_0059e580` D:L457845-457846): every entry whose item and
 *   ammunition match an asked one and whose count is above zero, at most as many as were asked, in entry order
 *   (`FUN_0059dfb0` D:L457694-457797);
 * - the take, each granted entry in turn on the kit as the earlier ones left it (`FUN_0059dfb0` -> `FUN_005bb000`
 *   D:L473191-473353): the same-item slot -- every slot below the kit's count holding the item, the first with a round,
 *   else the last (D:L473212-473238) -- gets the pour, full or not; with none, the first of slots 2-4 that is past the
 *   count (answering the COUNT, the review F1: `FUN_005bae60` D:L473106-473107, inlined D:L473244-473245), or spent and
 *   holding no item of `PICKUP_SPENT_EXEMPT_IDS_READING`'s ten (D:L473246-473276), or holding EQUIP_NONE (D:L473278-473279);
 *   a SlotCost 2 item needs a second such slot (`PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER`); none, nothing taken
 *   (D:L473284, D:L473341). The found slot gets the record (`FUN_005bc410` D:L473823-473842) and the pour
 *   (`FUN_005ba3d0`: the item's own `NumMags` x `Ammo_Capacity`, at most ten magazines, never doubled for a grenade or a
 *   charge -- the 2X doubles classes 0x04, 0x1f, 0x33, 0x51, 0x5b, 0x65 only, D:L472725-472741); no model is attached
 *   (`FUN_005c72c0` with the tag "grenade" instances nothing, the review F2);
 * - then the entry is cleared WHOLE, whatever fitted (`FUN_003cfc40` D:L323024-323047, e.g. D:L457701-457702; but see
 *   `PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER`: the original's clear has an index guard the port does not copy); an entry
 *   not granted stays; the bundle goes when no entry is left (`FUN_00541bb0` D:L409125-409131).
 * The missile gate (D:L473193-473210) is not built: the builder never bundles that class (`BUNDLE_SLOTS_PLACEHOLDER`).
 * The rig's three walks of 2026-11-15 agree (capture, pending review: `bundleEquipment.test.ts`). [reading]
 */
export const PICKUP_EQUIPMENT_TAKE_READING = 'the same item first, else a spent unprotected slot 2-4; the granted entry cleared whole' as const;
/**
 * R142 (the build's fresh review, finding 1): the clear above is not unconditional as decompiled. The getter
 * `FUN_003cfd70` (D:L323073-323102) and the clearer `FUN_003cfc40` (D:L323024-323047) act only when the entry's index
 * is at most the number of the list's entries with a non-zero count; `FUN_0059dfb0` gets, pours and clears the granted
 * entries in index order (D:L457700-457797, the caller's zeros set before each get, e.g. D:L457726-457728) and compacts
 * the list only after the loop (`FUN_00541bb0` D:L457800, D:L409125-409131). So each clear lowers that number, and with
 * three or more granted entries a later index can fail the guard: its take is handed zeros (nothing poured) and it is
 * not cleared. The port clears every granted entry (`takeEquipment`, `WorldDrops.walk`). The case: a body with dry
 * firearms and three equipment rings, M67, HE, AN-M8, and a taker with a part-spent M67 and one free slot -- all three
 * asked and granted; the port tops up the M67, installs the HE and deletes the AN-M8; the original as decompiled
 * leaves the AN-M8 on the ground (index 2 against one entry left with a count). Not built: the original's firearm
 * entries share the list and the grant, which the port keeps out of it (`AMMO_TRANSFER_PLACEHOLDER`), so the guard's
 * count cannot be reproduced faithfully before that ruling. Settles: the `AMMO_TRANSFER_PLACEHOLDER` ruling, then a rig
 * sample of the case. [placeholder]
 */
export const PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER = 'every granted entry cleared' as const;
/**
 * R142: a SlotCost 2 entry (the record's `SlotCost`, `+0x27c`: the loader's `FUN_003c5960` D:L322610-322614, read by
 * `FUN_003c5970` D:L317036; the port's arsenal `slotCost`) needs a second slot 2-4 by the same three tests
 * (`FUN_005bb000` D:L473286-473340), and with none nothing is taken (D:L473337-473338). Unread: whether the second may
 * be the first -- the taker's guard compares against -1 (D:L473293), the ask's skips the first slot (D:L472952), and by
 * the review F1 a kit with fewer than four slots gets the count back from both searches (the review F5). The port
 * follows the ask (another slot) and writes nothing into the second (`FUN_005bc410` writes its own slot only,
 * D:L473823-473842). Of the port's bundled items none is SlotCost 2 (the Satchel is no throwable or charge ring).
 * Settles: the instructions at 0x5bb338-0x5bb4c8 against 0x5ba9f8-0x5bab88, or a rig take of a Satchel bundle with one
 * and with two free slots. [placeholder]
 */
export const PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER = 'a second slot 2-4 other than the first, left as it is' as const;
/**
 * R142: what is left of the slot search's strict "count < slot" test (D:L473245, D:L472904) after the review F1 (past
 * the count answers the count): a kit of count 4 whose slot 4 is neither spent-and-unprotected nor EQUIP_NONE finds no
 * slot (index 5 is never tried), and whether the original's empty slots hold 0xff records. The port's kit has five
 * slots, `EMPTY_ITEM` the 0xff record in each empty one (research 94's EQUIP_NONE), so its count is the loadout's length
 * and the search runs as decompiled. Settles: the disassembly at 0x5bb2xx, or a rig take by a kit with an empty slot.
 * [placeholder]
 */
export const PICKUP_EQUIPMENT_SLOT_PLACEHOLDER = 'the five-slot kit, EQUIP_NONE a record' as const;
/**
 * R142, re-filed by R4P-219 (reading; its r0004 cites re-read and CONFIRMED by atlas-parity, a non-author, 2026-11-24): r0004's loaded-magazine skip (`PICKUP_POUR_READING`) applies to an
 * equipment slot's ring as to a firearm's. r0004's pour `FUN_005c0c20` D4:L514322-514323 and its ask `FUN_005c0e40`
 * D4:L514401-514403 (r0001's `FUN_005ba3d0` D:L472718-472773, `FUN_005ba5b0` D:L472779-472837) both pass over the slot's
 * current magazine (`+0x684`) when the record's own `NumMags` (`FUN_003f4a50`, D4:L350989-350993) is 2 or more, with no
 * class test: every slot takes it. That `+0x684` is the slot's current-magazine word for every slot is inferred from its
 * slot-generic index. No throwable or charge record the port reads has `NumMags` 2, so no take reaches it today.
 */
export const PICKUP_EQUIPMENT_POUR_READING = "as a firearm's: the loaded one skipped from 2 magazines" as const;
// R142: the line a take posts (`FUN_005bb000` D:L473356-473375) is the page's, posted from the room's `kit` -- the room
// posts nothing; the page's line and its open questions are viewer `src/pickupLine.ts` (PICKUP-LINE).
/**
 * Where a drop lies: at the feet it fell from, with the body's yaw -- the original's settling and rotation of the
 * replicated node (`FUN_0059ec60`, `FUN_0059e9e0`) are not read. Settles: capture B's death drop. [placeholder]
 */
export const DROP_PLACEMENT_PLACEHOLDER = "at the feet, the body's yaw" as const;
/**
 * Which firearm is in the hand after a claim: the one that was (the claim changes the slot, not the hand) -- web research
 * 323 R323.3, §1.3 item 5: `FUN_005bc410` (D:L473823-473868) writes no current slot (`+0x824`) and refreshes the hand
 * only when the installed slot is the hand's (D:L473852-473868), so a claim into the stowed slot leaves the hand as it
 * was and a claim into the hand's slot puts the taken weapon in the hand. Owed: capture NU5-1 (an exchange into the
 * stowed slot). [reading] Named `PICKUP_HAND_PLACEHOLDER` ("whether `FUN_005bc410` selects the installed weapon is not
 * read") until NU-5 H1 (2026-10-14).
 */
export const PICKUP_HAND_READING = 'the hand kept' as const;

/** The firearm slot a weapon item is claimed into (`PICKUP_FAMILY_READING`), null for none. */
export function pickupSlotOf(item: number): FirearmSlot | null {
  const k = slotKindOf(item);
  return k === 'primary' ? 0 : k === 'secondary' ? 1 : null;
}

/** What `dropsOf` reads off a body: its kit, the records and rings of its two firearm slots, its launcher rounds. */
export interface DroppingBody {
  id: number;
  loadout: Loadout;
  records: readonly [WeaponRecord, WeaponRecord];
  mags: readonly [MagazineRing, MagazineRing];
  /** The kit's launcher-round rings (`KitRounds.ring`), null without them. */
  rounds: { ring(id: number): { total(): number } | null } | null;
  feet: V3;
  yaw: number;
  /** The kit table, for `firearmsCarried`; absent or null, a slot's presence alone (the baked records' fallback). */
  table?: KitTable | null;
  /** R142: the throwable and charge rings (`EquipmentSlots`), bundled and cleared; absent, none (`BUNDLE_SLOTS_PLACEHOLDER`). */
  equipmentSlots?: EquipmentSlots;
}

/**
 * Which firearm slots hold a firearm: an item that is not an absent marker (`firearmSlotPresent`: FULL_SLOT and
 * EQUIP_NONE are unusable, `FUN_005bdc30` D:L474642-474648) and that the kit table has a firearm record for. In the
 * original such a slot holds no round: `FUN_005ba040` visits every slot with an object (D:L472583) and adds an entry
 * only for a slot whose ammunition is set and a magazine holds a round (D:L472603-472614), and `FUN_005bb000`
 * D:L473179-473181 pours only into a slot with an object whose record takes the ammunition. The port's such slot
 * holds the baked record (`NO_FIREARM_RECORD_PLACEHOLDER`) and the room fills its ring at the spawn (`room.ts`'s
 * `p.mags`), so the drop, the claim and the walk ask here. Reachable: the equipment limit's forced kits (research
 * 362 s1) put FULL_SLOT in a firearm slot. Without a table, presence alone (the baked records are the kit's own).
 */
export function firearmsCarried(loadout: Loadout, table: KitTable | null | undefined): [boolean, boolean] {
  return ([0, 1] as const).map((s) => firearmSlotPresent(loadout, s) && (table ? table.records.has(loadout[s]) : true)) as [boolean, boolean];
}

/**
 * A firearm slot's ring as a bundle entry (`FUN_005ba040` D:L472580-472626): its ammunition by name and the sum of its ten
 * magazines, no record (a firearm's: D:L472586-472589); null when it holds no round or no firearm (`carried`). The ring cleared.
 */
function takeRing(record: WeaponRecord, ring: MagazineRing, carried: boolean): BundleEntryWire | null {
  const count = ring.total();
  ring.restore({ slots: [], current: ring.state().current });
  return carried && count > 0 ? { ammo: record.ammo, count } : null;
}

/**
 * R142 (`BUNDLE_SLOTS_PLACEHOLDER`; `FUN_005ba040` D:L472580-472626): each throwable or charge ring of the body as a bundle
 * entry, in slot order -- its record's ammunition (the port's ammo item at `+0x15c`, D:L472609), the record as the
 * entry's `item`, the ring's sum (D:L472601-472606) -- for a ring holding a round (D:L472610-472622) of an item outside
 * the MISSILE class (D:L472623). Each ring is cleared, bundled or not: the body keeps no round.
 * R4P-223 (reading; its r0004 cites re-read and CONFIRMED by atlas-parity, a non-author, 2026-11-24): r0004's builder FillAmmoPickupInstance `FUN_005c07c0` D4:L514110-514193 clears every
 * ring entry of an item 0x97 (C4, 151) before the sum and the positive-entry test, so the stash add is never called for
 * C4, whatever its record; r0001's `FUN_005ba040` D:L472580-472631 sums and adds it. Other charges (the claymore, the
 * satchel, the PMN) keep their path.
 * LATENT (R4P-103; reading, reviewed: agent/spc-atlas 6299392aed, merged 44b0cc3fef; first filed 2cfcb2723f): r0004's
 * take 0x5c1b30 (r0001 `FUN_005bb000`) changed its launcher test as the offer gate did -- on a type-9 (bundle) list
 * only, an entry of category 0xb9, every rocket round (ids 185-189, the RPG round included), is taken only by a kit
 * holding a class-0x91 launcher. So an M203 or GP-30 carrier gets a rocket round only as the round that comes with a
 * picked-up LAW or RPG-7, never from a bundle. Latent: no bundle the port builds carries 0xb9-0xbd
 * (`takeEquipmentRings`, D:L472623), so nothing here tests it; a bundle that ever carries a rocket round must refuse
 * it to a kit without a launcher.
 */
function takeEquipmentRings(body: DroppingBody): BundleEntryWire[] {
  const slots = body.equipmentSlots;
  if (!slots) return [];
  const out: BundleEntryWire[] = [];
  for (const slot of slots.state().map((s) => s.slot).sort((a, b) => a - b)) {
    const item = body.loadout[slot]!;
    const count = slots.take(slot);                              // drained first, C4 included (D4:L514110-514193)
    if (item === ITEM.C4) continue;                              // R4P-223: r0004 never adds C4 to the stash
    const ammo = throwableOf(body.table ?? null, item)?.ammo ?? '';
    if (count > 0 && ammo !== '' && itemClass(item) !== 'rocketRound') out.push({ ammo, item, count });
  }
  return out;
}

/**
 * A classic death's drops (DROP_CONTENTS_READING; DROP_PLACEMENT_PLACEHOLDER): the bundle of every firearm ring's entries,
 * then (R142, `BUNDLE_SLOTS_PLACEHOLDER`) every throwable and charge ring's with its record, in slot order, first (none
 * when the body is dry: `FUN_005ba040` adds a slot only with a round in it), then the primary's and the secondary's
 * weapon (an empty slot drops nothing), then the launcher with its round present (LAUNCHER_DROP_READING). The rings given
 * are cleared: the body keeps no round.
 */
export function dropsOf(body: DroppingBody): DropSpec[] {
  const at: V3 = [body.feet[0], body.feet[1], body.feet[2]];
  const lay = (d: Omit<DropSpec, 'at' | 'yaw' | 'from'>): DropSpec => ({ ...d, at: [...at] as V3, yaw: body.yaw, from: body.id });
  const out: DropSpec[] = [];
  // A slot with no firearm (`firearmsCarried`) bundles nothing; its ring is cleared all the same -- the body keeps no round.
  const carried = firearmsCarried(body.loadout, body.table);
  const entries = ([0, 1] as const).map((s) => takeRing(body.records[s], body.mags[s], carried[s])).filter((e): e is BundleEntryWire => e !== null);
  entries.push(...takeEquipmentRings(body));
  if (entries.length) out.push(lay({ kind: 'ammo', entries }));
  for (const s of [0, 1] as const) {
    const item = body.loadout[s];
    if (item !== EMPTY_ITEM && pickupSlotOf(item) === s) out.push(lay({ kind: 'weapon', item }));
  }
  for (let s = 2; s < body.loadout.length; s++) {
    const item = body.loadout[s]!;
    if (itemClass(item) !== 'rocketLauncher') continue;
    const round = rocketRoundOf(item);
    if (round !== null && (body.rounds?.ring(round)?.total() ?? 0) > 0) out.push(lay({ kind: 'weapon', item }));
  }
  return out;
}

/** What a claim reads off the taker: its kit, records and rings, where it stands and its yaw. */
export interface TakingBody {
  id: number;
  loadout: Loadout;
  records: readonly [WeaponRecord, WeaponRecord];
  mags: readonly [MagazineRing, MagazineRing];
  feet: V3;
  yaw: number;
  /**
   * NU-5 L1: the kit as the launcher's tests read it (`pickupKitOf`: each slot's item and its ring's rounds); absent, no
   * rocket launcher is claimed.
   */
  kit?: readonly PickupKitSlot[];
}

/**
 * A weapon claim's result: the live kit, the firearm slot changed (null for a launcher), its records and its new (empty)
 * ring (null for a launcher), what it lays, and for a rocket launcher its slot, its round's slot and the round's count.
 */
export interface Claimed {
  loadout: Loadout;
  slot: FirearmSlot | null;
  records: readonly [WeaponRecord, WeaponRecord];
  ring: MagazineRing | null;
  replaced: DropSpec[];
  launcher?: { slot: number; round: number; rounds: number };
}

/**
 * A weapon claim (`FUN_0059f0c0` D:L458178-458190; PICKUP_FAMILY_READING, WEAPON_DROP_AMMO_READING): the drop's weapon
 * into the slot of its family (`slot`, when the caller names one, must be that family's: else `'family'`), the slot's
 * old ring dropped as a bundle and its old weapon after it at the taker's feet (`FUN_0059fd50` then `FUN_0059f730`), the
 * taken weapon with an empty ring. The live kit only: the saved pick is the room's `next`, never touched here
 * (`FUN_005bc410` D:L473823-473868 "changes current inventory state; it is not a saved loadout edit"). Pure: the
 * taker's rings are read, not cleared -- the room applies the result once.
 */
export function claimWeapon(drop: DropSpec | DropWire, taker: TakingBody, table: KitTable | null, slot?: FirearmSlot): Claimed | { refused: 'kind' | 'family' } {
  if (drop.kind !== 'weapon' || drop.item === undefined) return { refused: 'kind' };
  if (itemClass(drop.item) === 'rocketLauncher') return slot === undefined ? claimLauncher(drop.item, taker) : { refused: 'family' };
  const family = pickupSlotOf(drop.item);
  if (family === null || (slot !== undefined && slot !== family)) return { refused: 'family' };
  const loadout = [...taker.loadout] as unknown as Loadout;
  (loadout as unknown as number[])[family] = drop.item;
  const records = kitRecords(table, loadout);
  const at: V3 = [taker.feet[0], taker.feet[1], taker.feet[2]];
  const replaced: DropSpec[] = [];
  const old = taker.loadout[family];
  // The replaced slot's bundle (`FUN_0059fd50(actor, slot)` -> `FUN_005ba040` with the slot): its ammunition, summed --
  // none from a slot with no firearm (`firearmsCarried`), and no weapon from an absent marker (FULL_SLOT, EQUIP_NONE):
  // the original's slot search (`FUN_005b8630`) finds no slot for a 254 and runs neither (D:L458178-458184).
  const carried = firearmsCarried(taker.loadout, table)[family];
  const count = taker.mags[family].total();
  if (carried && count > 0) replaced.push({ kind: 'ammo', entries: [{ ammo: taker.records[family].ammo, count }], at: [...at] as V3, yaw: taker.yaw, from: taker.id });
  if (old !== EMPTY_ITEM && old !== FULL_SLOT) replaced.push({ kind: 'weapon', item: old, at: [...at] as V3, yaw: taker.yaw, from: taker.id });
  return { loadout, slot: family, records, ring: MagazineRing.from(records[family], []), replaced };
}

/**
 * NU-5 L1; R4P-103 (`PICKUP_LAUNCHER_READING`; r0004: the reading agent/spc-atlas dcd314b4bd, the captures Q-103 / Q103B
 * a1e119affd and Q103C dcd314b4bd): a rocket launcher claimed (`FUN_005a4b70` D4:L499171) -- refused `'family'` unless
 * the taker's kit holds no launcher (145-150) and has a slot 2-4 empty or spent (`FUN_005c1760` D4:L514677). The launcher
 * into the first such slot (`FUN_005c1990(kit, -1)` D4:L499279), its old item overwritten (`FUN_005c2fc0`): nothing
 * displaced is saved or laid, and no exchange; its round (0xb9, 0xba for 146) APPENDED at the kit's record count with one
 * round (`PICKUP_LAUNCHER_ROUND_SLOT_READING`, `PICKUP_LAUNCHER_ROUNDS_READING`, D4:L499303-499309) -- a five-record kit
 * grows to six (Q103B: 185 at index 5). The firearms are untouched.
 */
function claimLauncher(item: number, taker: TakingBody): Claimed | { refused: 'family' } {
  const at = taker.kit ? launcherClaimSlots(taker.kit) : null;
  if (!at) return { refused: 'family' };
  const kit: number[] = [...taker.loadout];
  kit[at.launcher] = item;
  kit[at.round] = launcherRoundOf(item);                      // at the record count: the kit grows by one record
  const loadout = kit as unknown as Loadout;
  return {
    loadout, slot: null, records: taker.records, ring: null, replaced: [],
    launcher: { slot: at.launcher, round: at.round, rounds: PICKUP_LAUNCHER_ROUNDS_READING },
  };
}

/**
 * `FUN_005ba3d0(kit, slot, rounds)` on one ring (PICKUP_POUR_READING): magazines 0-9 in order, each under `cap` topped up
 * toward the capacity from `rounds` -- the one in the weapon skipped when `ownMags` (the record's own NumMags) is 2 or more
 * (r0004) -- each at or past `cap` zeroed. Returns what is left and each magazine changed with the amount it changed by.
 */
export function pourMagazines(ring: MagazineRing, cap: number, ownMags: number, rounds: number): { left: number; changed: [number, number][] } {
  const state = ring.state();
  const changed: [number, number][] = [];
  let left = rounds;
  for (let i = 0; i < state.slots.length; i++) {
    const had = state.slots[i]!;
    if (i < cap) {
      if (i === state.current && ownMags >= 2) continue;            // r0004 0x5c0d80-0x5c0d9c
      const take = Math.min(Math.max(0, ring.capacity - had), left);
      if (take > 0) { state.slots[i] = had + take; left -= take; changed.push([i, take]); }
    } else if (had !== 0) {
      state.slots[i] = 0;
      changed.push([i, -had]);
    }
  }
  ring.restore(state);
  return { left, changed };
}

/**
 * A bundle walked over (`FUN_005bb000` D:L473176-473188; PICKUP_AMMO_MATCH_READING, PICKUP_POUR_READING): each firearm
 * entry (no record) is poured into every slot of the taker whose record takes its ammunition, by name, in slot order
 * (`pourMagazines` under the record's magazines, PICKUP_MAGAZINE_CAP_READING: `magazinesCarried(record.mags)`, the record
 * already 2X-applied; `ownMags`, the kit table's own NumMags of each slot's record, for r0004's skip -- absent, the
 * record's), what is left flowing on; what no slot takes stays (AMMO_TRANSFER_PLACEHOLDER), as does an entry that carries a
 * record (the equipment's). A slot with no firearm (`carried`: `firearmsCarried` of the taker's kit) takes nothing --
 * the original skips a slot with no record (`*(slot+0xe4) != 0`, D:L473180), where the port's empty slot holds the baked
 * record (`NO_FIREARM_RECORD_PLACEHOLDER`), whose ammunition is common. The rings are changed in place; the bundle is not.
 * No round is created: what the rings gain is
 * what leaves the bundle, less a magazine past the cap zeroed. `filled`: each ring's magazines changed, and `added` the
 * amount each changed by -- the page adds it to its own (its magazines fall as it fires, ahead of the room's).
 */
export function transferAmmo(
  bundle: readonly BundleEntryWire[], records: readonly [WeaponRecord, WeaponRecord], rings: readonly [MagazineRing, MagazineRing],
  carried: readonly [boolean, boolean] = [true, true], ownMags?: readonly [number, number],
): { moved: boolean; filled: [number[], number[]]; added: [number[], number[]]; residual: BundleEntryWire[] } {
  let moved = false;
  const filled: [number[], number[]] = [[], []];
  const added: [number[], number[]] = [[], []];
  const residual: BundleEntryWire[] = [];
  for (const entry of bundle) {
    if (entry.item !== undefined) { residual.push({ ...entry }); continue; }
    let left = entry.count;
    for (const s of [0, 1] as const) {
      if (!carried[s] || records[s].ammo === '' || records[s].ammo !== entry.ammo) continue;
      const out = pourMagazines(rings[s], magazinesCarried(records[s].mags), ownMags?.[s] ?? records[s].mags, left);
      left = out.left;
      for (const [i, d] of out.changed) {
        const at = filled[s].indexOf(i);
        if (at >= 0) added[s][at]! += d;
        else { filled[s].push(i); added[s].push(d); }
        moved = true;
      }
    }
    if (left > 0) residual.push({ ammo: entry.ammo, count: left });
  }
  return { moved, filled, added, residual };
}

/** What `takeEquipment` reads and changes of the taker: his live kit, his throwable and charge rings, his rounds' rings. */
export interface EquipmentTaker {
  loadout: Loadout;
  /** Changed in place: the pours, the installs (`EquipmentSlots.pour`, `.install`). */
  equipmentSlots: EquipmentSlots;
  /** A launcher round's rounds at `slot` (`KitRounds.held`), for the slot search's "spent" test. */
  roundsAt(slot: number): number;
}

/** A bundle entry the equipment take is for: one carrying a record that is not EQUIP_NONE (`FUN_005bb000` D:L473175). */
const isEquipmentEntry = (e: BundleEntryWire): e is BundleEntryWire & { item: number } => e.item !== undefined && e.item !== EMPTY_ITEM;

/**
 * The slot search of `PICKUP_EQUIPMENT_TAKE_READING` over slots 2-4 (`FUN_005bb000` D:L473239-473285, the ask's
 * D:L472898-472943; `FUN_005bae60` D:L473101-473152): past the kit's count, the COUNT (the review F1); below it, a slot
 * whose ring holds no round and whose item is not one of `PICKUP_SPENT_EXEMPT_IDS_READING`'s ten, or one holding EQUIP_NONE;
 * a slot equal to the count is passed over (`PICKUP_EQUIPMENT_SLOT_PLACEHOLDER`). `exclude`, the SlotCost search's first
 * slot (`PICKUP_SLOTCOST_SECOND_SLOT_PLACEHOLDER`). Null for none.
 */
function equipmentSlotFor(kit: readonly PickupKitSlot[], exclude: number | null = null): number | null {
  const count = kit.length;
  for (let s = 2; s <= 4; s++) {
    if (s > count) return count;
    if (s === count || s === exclude) continue;
    const { item, rounds } = kit[s]!;
    if (!(rounds > 0) && !PICKUP_SPENT_EXEMPT_IDS_READING.includes(item)) return s;
    if (item === EMPTY_ITEM) return s;
  }
  return null;
}

/**
 * The same-item slot (`FUN_005bb000` D:L473212-473238; the ask's D:L472872-472897): of the slots below the kit's count
 * holding `item`, the first whose ring holds a round, else the last; null for none.
 */
function sameItemSlot(kit: readonly PickupKitSlot[], item: number): number | null {
  let last: number | null = null;
  for (let s = 0; s < kit.length; s++) {
    if (kit[s]!.item !== item) continue;
    if (kit[s]!.rounds > 0) return s;
    last = s;
  }
  return last;
}

/**
 * R142 (`PICKUP_EQUIPMENT_TAKE_READING`): a living taker over a bundle -- its equipment entries asked against his kit as it
 * stands, granted, each granted one poured (into its same-item slot, or a slot found and given the record) and cleared
 * whole. Returns the taker's kit after (a new array only when an item was installed), which entries were granted (the
 * caller removes them: what did not fit is lost, `FUN_003cfc40`), and the slots installed. The firearm entries are not
 * this function's (`transferAmmo`). Each item's cap is its own `NumMags` (the arsenal's, else the throwable record's),
 * at most ten, never doubled (`FUN_005ba3d0` D:L472718-472746); the capacity, the ring's (the record's `Ammo_Capacity`).
 */
export function takeEquipment(
  bundle: readonly BundleEntryWire[], taker: EquipmentTaker, table: KitTable | null,
): { loadout: Loadout; granted: boolean[]; installed: number[] } {
  const slots = taker.equipmentSlots;
  let loadout = taker.loadout;
  const kitNow = (): PickupKitSlot[] => pickupKitOf(loadout as readonly number[], table, taker.roundsAt, {}, slots.state());
  const capOf = (item: number): number => magazinesCarried(table?.arsenal.items.get(item)?.mags ?? throwableOf(table, item)?.mags ?? 0);
  const slotCostOf = (item: number): number => table?.arsenal.items.get(item)?.slotCost ?? 1;
  /** Where an entry of `item` would go: its same-item slot, or a found slot (with its SlotCost second), or null. */
  const placeOf = (kit: readonly PickupKitSlot[], item: number): { slot: number; install: boolean } | null => {
    const same = sameItemSlot(kit, item);
    if (same !== null) return { slot: same, install: false };
    const first = equipmentSlotFor(kit);
    if (first === null) return null;
    if (slotCostOf(item) === 2 && equipmentSlotFor(kit, first) === null) return null;   // D:L473286-473340
    return { slot: first, install: true };
  };
  // The ask: every entry against the kit as it stands (`FUN_005bb990` D:L473590-473605 -> `FUN_005ba770`).
  // PICKUP_EQUIPMENT_POUR_READING (R4P-219): the ask passes over the loaded magazine as the take does, the record's own
  // NumMags 2 or more (r0004 `FUN_005c0e40` D4:L514401-514403; r0001 `FUN_005ba5b0` D:L472779-472837 counts it).
  const skipLoaded = (item: number): boolean => (throwableOf(table, item)?.mags ?? 0) >= 2;
  const kit0 = kitNow();
  const asked = bundle.filter((e) => {
    if (!isEquipmentEntry(e) || !(e.count > 0)) return false;
    const at = placeOf(kit0, e.item);
    return at !== null && (at.install || slots.room(at.slot, capOf(e.item), skipLoaded(e.item)));   // a full same-item slot: refused (D:L472830)
  });
  // The grant (`FUN_0059e580` D:L457845-457846; at most as many as asked, `FUN_0059dfb0` D:L457694-457797).
  let grants = 0;
  const granted = bundle.map((e) => {
    if (!isEquipmentEntry(e) || !(e.count > 0) || grants >= asked.length) return false;
    if (!asked.some((a) => a.item === e.item && a.ammo === e.ammo)) return false;
    grants++;
    return true;
  });
  // The take: each granted entry on the kit as the earlier ones left it (`FUN_005bb000` D:L473191-473353).
  // LATENT (R4P-103; reading, reviewed: agent/spc-atlas 6299392aed, merged 44b0cc3fef; first filed 2cfcb2723f): r0004's
  // take 0x5c1b30 (r0001 `FUN_005bb000`) changed its launcher test as the offer gate did -- on a type-9 (bundle) list
  // only, an entry of category 0xb9, every rocket round (ids 185-189, the RPG round included), is taken only by a kit
  // holding a class-0x91 launcher. So an M203 or GP-30 carrier gets a rocket round only as the round that comes with a
  // picked-up LAW or RPG-7, never from a bundle. Latent: no bundle the port builds carries 0xb9-0xbd
  // (`takeEquipmentRings`, D:L472623), so nothing here tests it; a bundle that ever carries a rocket round must refuse
  // it to a kit without a launcher.
  const installed: number[] = [];
  bundle.forEach((e, k) => {
    if (!granted[k] || !isEquipmentEntry(e)) return;
    const at = placeOf(kitNow(), e.item);
    // Cleared all the same, whatever its index (PICKUP_CLEAR_INDEX_GUARD_PLACEHOLDER: the guard not built).
    if (at === null) return;                                     // nothing taken (D:L473284, D:L473341)
    const record = throwableOf(table, e.item);
    if (at.install) {
      if (!record || !slots.install(at.slot, { name: record.name, capacity: record.capacity, mags: record.mags })) return;
      const next = [...loadout];
      next[at.slot] = e.item;                                    // `FUN_005bc410` D:L473823-473829: at the count, the kit grows
      loadout = next as unknown as Loadout;
      installed.push(at.slot);
    }
    // PICKUP_EQUIPMENT_POUR_READING: r0004's skip as a firearm's -- the record's own NumMags 2 or more (D4:L514322-514323).
    slots.pour(at.slot, e.count, capOf(e.item), skipLoaded(e.item));
  });
  return { loadout, granted, installed };
}
