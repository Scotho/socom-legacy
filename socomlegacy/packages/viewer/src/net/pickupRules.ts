import { EMPTY_ITEM, FULL_SLOT, ITEM, itemClass, type KitTable, type Loadout } from '@s2u/scene';
import { equipmentKind, throwableOf } from '../equipment';
import { KitRounds } from '../firearms';
import { FIRST_REQUEST_WINS_READING } from './objective';
import type { EquipmentSlotState } from '../equipmentSlots';

/**
 * PF-34 (ruling PF.R54; web research 234 s3, s5; 194 s2): the pickup's rules the room (`match/src/worldDrops.ts`) and the
 * page (`../drops`, `../actionContext`) share. Every value a reading of the decompilation (`D:L<n>`) through research 194
 * s2, re-read for PF-34; none measured.
 */

/**
 * The reach of a pickup, units from the feet: `FUN_00593da0` D:L452522-452574 queries kind-9 bundles within 20.0
 * (`FUN_00541f10(0x41a00000, ..., 9)`, D:L452526, D:L452533; each one found is taken by `FUN_00547570`, D:L452529) and
 * the weapon prompt's candidates through `FUN_005a9c70`/`FUN_005a9f40` (a 20-unit query, the final bound squared 400).
 * [reading]
 */
export const PICKUP_REACH_READING = 20;

/**
 * The speed over which a weapon is not offered, units a second: `FUN_005a81d0` D:L462753-462767 compares the squared 3D
 * velocity (`+0x2c..+0x34`) against `DAT_006508a0` squared (ELF 0x6508a0 = 32.0). [reading]
 */
export const PICKUP_SPEED_READING = 32;

/**
 * The rest of `FUN_005a81d0`'s gate (D:L462753-462767): the stance not 6, no move holding the body (`FUN_00587f50`,
 * `FUN_00587f10`), `+0xeb8` clear (read as the turret's hold), the kit's view state not 4 (the binoculars), not on a
 * ladder (`FUN_0057df10`), and then `FUN_005a7de0(actor, 1, 0)` -- the same test PF-17 reads as the fire's capability
 * (`AimFrame.fire`, ruling PF.R36). The port's stand-in: the claim's command frame may fire, is not swapping and not
 * behind the binoculars, and the seat is not mounted -- one predicate shared with the fire, never a second
 * `alive && near` (194 L74). The full state map is A02's owed. [reading]
 */
export const PICKUP_MOTION_GATE_READING = 'fire capability' as const;

/**
 * Who decides a claim: in the original the request goes to the actor whose composite id the pickup carries
 * (`FUN_0059f610` D:L458314-458332: offline at once; online the owner itself, else `FUN_002ba2c0` D:L159878-159892 sends
 * it to that actor's client, `FUN_002ba260` D:L159849-159853 resolving the owner) -- **owner routed** (194 s2's
 * correction of "host arbitration"). The port's room is the one arbiter of every verb; copying the owner-peer trust "is
 * not justified" (194 L70), and a central serialisation is a web adaptation (194 L74). [reading]
 */
export const PICKUP_ROUTE_READING = 'owner routed (original); the room (port)' as const;

/**
 * Two claims on one drop in one tick: the lower seat id takes it, the other is refused `'taken'` -- the port's rule for
 * every contested request (`FIRST_REQUEST_WINS_READING`, ruling PF.R28); the original's owner takes the first request
 * its client reads (`FUN_0059e830` D:L457899-457930 validates the object still exists). [reading]
 */
export const DROP_SAME_TICK_READING = FIRST_REQUEST_WINS_READING;

/**
 * The weapon prompt's hold after a pickup is chosen, seconds: `FUN_00593500` -> `FUN_00592d50` sets `+0x23c` = 3.0
 * (0x40400000, D:L452160, D:L452169; the bomb's 4 s is `+0x238`'s, D:L452154), and `FUN_00593da0` counts it down only
 * while a candidate is in reach, offering none meanwhile (D:L452547-452549, D:L452563-452565). [reading]
 */
export const PICKUP_PROMPT_COOLDOWN_READING = 3;

/**
 * NU-5 L1 (web research 323 R323.5, §1.6; F1 of its review): a rocket launcher on the ground (class 0x91: the LAW 145,
 * the RPG-7 146) is offered, and claimable, only by a kit carrying **no** launcher-list item and holding a slot 2-4 free
 * or replaceable. `FUN_005a9c70` / `FUN_005a9f40` pass `FUN_005bac30(kit) == 0` to `FUN_00541d40` (D:L463675, D:L463693;
 * D:L463751, D:L463769), which then refuses a candidate of class 0x91 (D:L409249-409253); `FUN_005bac30`
 * (D:L473023-473084) answers false on finding any slot with an item of `FUN_003c5d80`'s list (D:L473027,
 * D:L473033-473035; the list D:L317287-317299: `launcherListed`), else true for the first of slots 2-4 that
 * `launcherSlotOf`'s test takes. The claim installs the launcher there (`FUN_0059f0c0` D:L458238-458292 through
 * `FUN_005bae60`) and its round with one round (`PICKUP_LAUNCHER_ROUNDS_READING`); no launcher is exchanged (a kit
 * carrying one is offered none). [reading] Owed: capture NU5-5.
 */
export const PICKUP_LAUNCHER_READING = 'claimable with one round, by a kit carrying no launcher' as const;

/**
 * NU-5 L1: the round a claimed rocket launcher arrives with -- `FUN_0059f0c0` installs item 0xb9 (LAW HEAT), or 0xba
 * for item 146 (`-0x6e`), at the kit's count (`FUN_005bdfb0` D:L474716-474731) and gives it one round
 * (`FUN_005ba3d0(kit, slot, 1)` D:L458285-458291). The accept carries no count of it (`FUN_002ba1f0`
 * D:L159823-159836: the pickup, the taker, the request's entry count, the accepted mask): every console installs the
 * one round by this rule (`FUN_002ba1a0` D:L159807-159817 -> `FUN_0059dfb0` D:L457694-457706 -> `FUN_0059f0c0`).
 * [reading]
 */
export const PICKUP_LAUNCHER_ROUNDS_READING = 1;

/**
 * `FUN_005bae60`'s and `FUN_005bac30`'s ten ids an empty-ringed slot 2-4 keeps (D:L473062-473066, D:L473128-473132):
 * 0xff EQUIP_NONE, 0xfe FULL_SLOT, 0xc3 the Thermal Scope, 0xc2 the 2X, 0x91 the LAW, 0x8d the M203, 0x92 the RPG-7,
 * 0x0b the Designator, 0xc1 the Detonator, 0xbe the Binoculars. What "kept" means for each (which equipment item a
 * launcher displaces) is not read further (`PICKUP_LAUNCHER_SLOT_PLACEHOLDER`, research 323 §8). [reading]
 */
export const LAUNCHER_SLOT_KEPT_READING: readonly number[] = [
  EMPTY_ITEM, FULL_SLOT, ITEM.THERMAL, ITEM.DOUBLE_AMMO, ITEM.LAW, ITEM.M203, ITEM.RPG7, 11, ITEM.DETONATOR, 190,
];

/** One kit slot as the launcher's tests read it: its item and the rounds its ring (`+0x1d4 + slot * 0x28`) holds. */
export interface PickupKitSlot { item: number; rounds: number }

/**
 * `FUN_003c5d80` (D:L317287-317299): the M16A2-M203 (52), the M4A1-M203 (61), the OICW (63), the MGL (142), the M79
 * (143), or an item of class 0x91 (`FUN_003d1e10`; the rocket launchers, ids 145-150).
 */
export function launcherListed(item: number): boolean {
  return item === ITEM.M16_203 || item === ITEM.M4_203 || item === ITEM.F2000 || item === ITEM.MGL || item === ITEM.M79
    || itemClass(item) === 'rocketLauncher';
}

/**
 * `FUN_005bae60(kit, -1)` (D:L473101-473152): the first of slots 2-4 whose ring holds no round and whose item is not one
 * of `LAUNCHER_SLOT_KEPT_READING`'s ten, or whose item is 0xff (`EMPTY_ITEM`); null for none. The original's third
 * answer -- a slot past the kit's count, which answers the count (D:L473106-473107) -- does not arise in the port's
 * five-slot kit, whose every slot holds an item (`EMPTY_ITEM` the original's 0xff record, research 94's EQUIP_NONE).
 */
export function launcherSlotOf(kit: readonly PickupKitSlot[]): number | null {
  for (let s = 2; s <= 4 && s < kit.length; s++) {
    const { item, rounds } = kit[s]!;
    if (!(rounds > 0) && !LAUNCHER_SLOT_KEPT_READING.includes(item)) return s;
    if (item === EMPTY_ITEM) return s;
  }
  return null;
}

/** `FUN_005bac30` (D:L473023-473084): no slot holds a launcher-list item (`launcherListed`), and `launcherSlotOf` finds one. */
export function launcherOffered(kit: readonly PickupKitSlot[]): boolean {
  if (kit.some((k) => launcherListed(k.item))) return false;
  return launcherSlotOf(kit) !== null;
}

/**
 * NU-5 L1 (research 323 §1.6; the gameplay controller's decision (i), 2026-10-14): where the claimed launcher's round
 * goes in the port's five-slot kit. The original installs it at the kit's count (`FUN_005be030` then `FUN_005bdfb0`,
 * D:L458285-458289) -- a slot past the five (the kit holds up to 30, D:L474724) -- so it never displaces an item. The
 * port's kit has five slots: the round goes into the first slot 2-4 holding `EMPTY_ITEM` other than the launcher's;
 * with none the claim is refused `'family'` and the launcher not offered (`launcherClaimSlots` null) -- a refused offer
 * rather than a launcher with no round. Settles: a kit of more than five slots (the original's count), or capture NU5-5
 * with a kit whose only free slot is a spent grenade's. [placeholder]
 */
export const PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER = 'the first empty slot 2-4; none: refused' as const;

/** The round a claimed launcher gets: 0xba for the RPG-7 (146, `-0x6e`), else 0xb9 the LAW HEAT (D:L458286-458289). */
export function launcherRoundOf(launcher: number): number {
  return launcher === ITEM.RPG7 ? ITEM.RPG_ROUND : ITEM.LAW_HEAT;
}

/**
 * The port's launcher claim (`PICKUP_LAUNCHER_READING`, `PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`): the launcher's slot
 * (`launcherSlotOf`, when `launcherOffered`) and its round's (the first other slot 2-4 holding `EMPTY_ITEM`), or null --
 * one function for the room's claim (`match/src/pickups.ts`) and the page's offer (`../drops`).
 */
export function launcherClaimSlots(kit: readonly PickupKitSlot[]): { launcher: number; round: number } | null {
  if (!launcherOffered(kit)) return null;
  const launcher = launcherSlotOf(kit)!;
  for (let s = 2; s <= 4 && s < kit.length; s++) if (s !== launcher && kit[s]!.item === EMPTY_ITEM) return { launcher, round: s };
  return null;
}

/**
 * A kit as the launcher's tests read it (`PickupKitSlot`), from the port's own state: each equipment slot's rounds -- a
 * launcher round's its ring's (`roundsAt`: `KitRounds.held`), a throwable's or a charge's its own slot ring
 * (`equipmentSlots`, research 361 §3), falling back to the aggregate `left` only for legacy callers, and any other
 * item's -- one the port counts nowhere, the Satchel (152) among them -- its fill from the kit table (`Ammo_Capacity` x
 * `NumMags`, at least one magazine, as `pouchOf` fills a charge; the original's ring holds what the kit's fill gave it,
 * `FUN_00599f00` D:L455818-455825, and the port never spends it). The original keeps one ring a slot
 * (`+0x1d4 + slot * 0x28`). NU-5 review F1 (2026-10-14): was "any
 * other slot's its round ring's" -- a held Satchel read empty and the launcher was laid over it.
 */
export function pickupKitOf(
  loadout: readonly number[], table: KitTable | null, roundsAt: (slot: number) => number, left: Readonly<Record<string, number | undefined>>,
  equipmentSlots?: readonly EquipmentSlotState[],
): PickupKitSlot[] {
  return loadout.map((item, slot) => {
    if (slot < 2) return { item, rounds: 0 };
    const kind = equipmentKind(item);
    if (kind === 'round') return { item, rounds: roundsAt(slot) };
    const name = kind === 'throwable' || kind === 'placed' || kind === 'c4' ? throwableOf(table, item)?.name : undefined;
    if (name !== undefined) {
      const ring = equipmentSlots?.find(s => s.slot === slot && s.kind === name);
      return { item, rounds: equipmentSlots === undefined ? left[name] ?? 0 : ring?.rounds.reduce((n, r) => n + r, 0) ?? 0 };
    }
    const rec = table?.arsenal.items.get(item);
    return { item, rounds: rec && rec.magazine > 0 ? rec.magazine * Math.max(1, rec.mags) : 0 };
  });
}

/**
 * NU-5 L1: the kit's round slots after a launcher claim (`FUN_0059f0c0` D:L458285-458291), the room's (`KitRounds` on
 * the seat) and the page's alike: the new loadout's rings, each round already carried keeping its rounds (by its id:
 * `KitRounds.ring`'s redirect; `FUN_005bc410` changes no other slot), the claimed launcher's round `round` holding
 * `rounds` (`PICKUP_LAUNCHER_ROUNDS_READING`) -- never a fill.
 */
export function launcherKitRounds(old: KitRounds, table: KitTable | null, loadout: Loadout, round: number, rounds: number): KitRounds {
  const next = new KitRounds(table, loadout);
  for (const h of old.held()) {
    if (h.id === round) continue;
    const was = old.ring(h.id), now = next.ring(h.id);
    if (was && now) now.restore(was.state());
  }
  next.ring(round)?.restore({ slots: [rounds], current: 0 });
  return next;
}
