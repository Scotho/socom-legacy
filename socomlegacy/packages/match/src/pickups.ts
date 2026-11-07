import { EMPTY_ITEM, itemClass, slotKindOf, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { kitRecords, type FirearmSlot } from '../../viewer/src/loadout';
import { magazinesCarried, MagazineRing } from '../../viewer/src/magazines';
import { rocketRoundOf } from '../../viewer/src/equipment';
import type { BundleEntryWire, DropWire } from '../../viewer/src/net/protocol';
import { launcherClaimSlots, launcherRoundOf, PICKUP_LAUNCHER_ROUNDS_READING, type PickupKitSlot } from '../../viewer/src/net/pickupRules';

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
 * Which slots' rings fill the bundle: the port's two firearm rings. `FUN_005ba040` walks every kit slot with a record
 * (`+0xe4`) and an ammo item (`+0x15c`), and excludes the classes `FUN_003d1d10`/`FUN_003d1ce0` name and the LAW HEAT
 * (`cVar3 != -0x47`); whether a grenade launcher's rounds (the port's `KitRounds`) join it is not read. Settles: a read
 * of those predicates, or capture B's pickup object. [placeholder]
 */
export const BUNDLE_SLOTS_PLACEHOLDER = 'the two firearm rings' as const;
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
 * How a bundle's rounds go into the taker's magazines below that cap (`PICKUP_MAGAZINE_CAP_READING`): the port moves
 * whole entries (one magazine's rounds) of a weapon the taker carries into its ring's free slots (0 rounds, not the one
 * in the weapon) under the cap, in order, and leaves the rest as a smaller bundle. Still owed of the original's
 * redistribution: `FUN_005ba3d0` D:L472750-472758 pours a round count, topping each slot under the cap up to
 * `Ammo_Capacity` -- the part-spent magazines and the one in the weapon among them -- where the port moves whole
 * entries into empty slots only; which records take which bundle (`FUN_003d2680` D:L473181, the ammo type, where the
 * port matches the record id; the fallback D:L473191+ and `FUN_005ba770` D:L472842+ not read); and what of the bundle
 * stays on the ground online after the pour (`FUN_005bb000` returns the remainder through `param_4`, its caller's use
 * not read) -- "do not implement ... full-mag transfer to fill those gaps" (194 L78). Settles: those reads, or capture
 * B's ammo-only pickup with a nearly full ring. [placeholder]
 */
export const AMMO_TRANSFER_PLACEHOLDER = 'whole entries into free slots' as const;
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
}

/** A firearm slot's ring as a bundle entry (null when it holds no round), and the ring cleared. */
function takeRing(record: WeaponRecord, ring: MagazineRing): BundleEntryWire | null {
  const rounds = ring.entries();
  ring.restore({ slots: [], current: ring.state().current });
  return rounds.length ? { item: record.id, rounds } : null;
}

/**
 * A classic death's drops (DROP_CONTENTS_READING; DROP_PLACEMENT_PLACEHOLDER): the bundle of every firearm ring's entries
 * first (none when the body is dry: `FUN_005ba040` adds a slot only with a round in it), then the primary's and the
 * secondary's weapon (an empty slot drops nothing), then the launcher with its round present (LAUNCHER_DROP_READING).
 * The rings given are cleared: the body keeps no round.
 */
export function dropsOf(body: DroppingBody): DropSpec[] {
  const at: V3 = [body.feet[0], body.feet[1], body.feet[2]];
  const lay = (d: Omit<DropSpec, 'at' | 'yaw' | 'from'>): DropSpec => ({ ...d, at: [...at] as V3, yaw: body.yaw, from: body.id });
  const out: DropSpec[] = [];
  const entries = ([0, 1] as const).map((s) => takeRing(body.records[s], body.mags[s])).filter((e): e is BundleEntryWire => e !== null);
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
  const rounds = taker.mags[family].entries();
  if (rounds.length) replaced.push({ kind: 'ammo', entries: [{ item: taker.records[family].id, rounds }], at: [...at] as V3, yaw: taker.yaw, from: taker.id });
  if (old !== EMPTY_ITEM) replaced.push({ kind: 'weapon', item: old, at: [...at] as V3, yaw: taker.yaw, from: taker.id });
  return { loadout, slot: family, records, ring: MagazineRing.from(records[family], []), replaced };
}

/**
 * NU-5 L1 (web research 323 R323.5, §1.6; `PICKUP_LAUNCHER_READING`): a rocket launcher claimed (`FUN_0059f0c0`
 * D:L458238-458292) -- refused `'family'` unless the taker's kit carries no launcher-list item and has a slot 2-4 free or
 * replaceable (`FUN_005bac30` D:L473023-473084) and, in the port's five slots, an empty one for the round
 * (`launcherClaimSlots`, `PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`). The launcher into `FUN_005bae60`'s slot (its old
 * item overwritten by `FUN_005bc410`, nothing laid: no exchange, D:L458187-458190 runs only with a launcher in the kit,
 * which a kit offered one never carries); its round (0xb9, 0xba for 146) beside it with one round
 * (`PICKUP_LAUNCHER_ROUNDS_READING`, `FUN_005ba3d0(kit, slot, 1)` D:L458291). The firearms are untouched.
 */
function claimLauncher(item: number, taker: TakingBody): Claimed | { refused: 'family' } {
  const at = taker.kit ? launcherClaimSlots(taker.kit) : null;
  if (!at) return { refused: 'family' };
  const loadout = [...taker.loadout] as unknown as Loadout;
  (loadout as unknown as number[])[at.launcher] = item;
  (loadout as unknown as number[])[at.round] = launcherRoundOf(item);
  return {
    loadout, slot: null, records: taker.records, ring: null, replaced: [],
    launcher: { slot: at.launcher, round: at.round, rounds: PICKUP_LAUNCHER_ROUNDS_READING },
  };
}

/**
 * A bundle walked over (AMMO_TRANSFER_PLACEHOLDER): each entry of a weapon the taker carries (a firearm slot's record
 * id) goes whole into the first free slot of that ring below the record's magazines (PICKUP_MAGAZINE_CAP_READING:
 * `magazinesCarried(record.mags)`, the record already 2X-applied) -- 0 rounds and not the magazine in the weapon -- in
 * order; an entry with no free slot under the cap, or for a weapon not carried, stays. The rings are changed in place;
 * the bundle is not. No round is created, split or rounded: what the rings gain is what leaves the bundle. `filled`:
 * each ring's slots written, the only ones the taker's `kit` lets the page set (its magazine in the weapon falls as it
 * fires, ahead of the room's).
 */
export function transferAmmo(
  bundle: readonly BundleEntryWire[], records: readonly [WeaponRecord, WeaponRecord], rings: readonly [MagazineRing, MagazineRing],
): { moved: boolean; filled: [number[], number[]]; residual: BundleEntryWire[] } {
  let moved = false;
  const filled: [number[], number[]] = [[], []];
  const residual: BundleEntryWire[] = [];
  for (const entry of bundle) {
    const s = records[0].id === entry.item ? 0 : records[1].id === entry.item ? 1 : null;
    const kept: number[] = [];
    for (const n of entry.rounds) {
      const ring = s === null ? null : rings[s];
      const state = ring?.state();
      const cap = s === null ? 0 : magazinesCarried(records[s].mags);
      const free = state ? state.slots.findIndex((r, i) => i < cap && r === 0 && i !== state.current) : -1;
      if (!ring || !state || free < 0 || n > ring.capacity) { kept.push(n); continue; }
      state.slots[free] = n;
      ring.restore(state);
      filled[s!].push(free);
      moved = true;
    }
    if (kept.length) residual.push({ item: entry.item, rounds: kept });
  }
  return { moved, filled, residual };
}
