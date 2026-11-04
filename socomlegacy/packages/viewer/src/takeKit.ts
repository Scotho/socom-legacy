import { EMPTY_ITEM, itemClass, type WeaponRecord } from '@s2u/scene';
import { fullAutoDefault, pickupFireMode } from './accuracy';
import { rocketRoundOf } from './equipment';
import { PICKUP_LAUNCHER_ROUNDS_READING } from './net/pickupRules';
import type { HeldRound } from './firearms';
import type { Firearm } from './kit';
import type { FirearmSlot } from './loadout';
import type { PickupClipName } from './mover';

/**
 * PF-34 (ruling PF.R54; web research 234 s4, s6): the room's `kit` after a pickup, on the page -- one function the one
 * firearm calls (`./matchFirearm` `MatchFirearm.takeKit`, over its own kit state lent as deps; ONE-WIRE, research 222),
 * which a page that mounts the world drops hands the room as its `kitChanged` (`./matchNet` `PART_DEPS`).
 *
 * - The live kit taken (`PlayerLoadout.take`: the saved pick, the type and the next spawn untouched; `FUN_005bc410`
 *   D:L473823-473868 "changes current inventory state").
 * - Each firearm's ring from the room's ten slots, never filled: the hand's replaced slot takes its weapon up with the
 *   exact (empty) ring (`Fire.takeWeapon`, `WEAPON_DROP_AMMO_READING`); every other ring is set through `Fire.setRing`
 *   -- after a walk-over only the slots the transfer `filled`, the magazine in the hand's weapon never (shots in flight).
 * - A slot a claim replaced: its fire mode the original's pickup mode when the record changed (`pickupFireMode`, research
 *   323 F1), the hand's mode re-read, the held model re-hung and the HUD shown (`renew`). The hand is kept
 *   (`PICKUP_HAND_READING`, was the placeholder).
 * - NU-5 L1 (web research 323 R323.5, §1.6): a rocket launcher claimed fills an equipment slot and its round another
 *   (`FUN_0059f0c0` D:L458238-458292); the room's `kit` names no firearm slot for it and writes no firearm ring, so the
 *   page reads the equipment slot off the kit's own change -- `launcherTaken` with the launcher's slot, its round's and
 *   the round's count (`PICKUP_LAUNCHER_ROUNDS_READING`: the accept carries none, every console installs one) -- and
 *   renews the HUD (`FUN_005bc410`'s weapon panel bit, D:L473845; D:L458295-458296).
 * - NU-5 X1 and research 324 P2: the taker's own `Swap rifle` asked of the walk (`swapClip`) -- after an exchange, or a
 *   launcher claim -- at this message (`./walk` `PICKUP_SWAP_OWN_LAG_READING`).
 */

export interface TakeKitDeps {
  loadouts: { take(kit: readonly number[]): void; records(): readonly [WeaponRecord, WeaponRecord]; loadout(): readonly number[] };
  fire: {
    takeWeapon(record: WeaponRecord, rounds: readonly number[]): void;
    setRing(record: WeaponRecord, slots: readonly number[], replaced?: string, only?: readonly number[]): void;
  };
  accuracy: { setWeapon(record: WeaponRecord): void };
  /** The firearm in the hand (`kitItem`). */
  hand(): Firearm;
  /**
   * Whether the firearm `hand` names is the selected slot (`+0x824`): not while an item or a launcher is up, when the
   * selection is an equipment slot (`./matchFirearm`'s `inHand`). Absent: it is.
   */
  inHand?(): boolean;
  /** The kit's records after the take (`kitRecs = r`). */
  records(r: readonly [WeaponRecord, WeaponRecord]): void;
  /** Each firearm's fire mode (`fireModes`), renewed for a replaced slot. */
  modes: Record<Firearm, number>;
  /** The kit's launcher-round slots (`kitRounds.held()`): the primary's default mode reads them. */
  heldRounds(): readonly HeldRound[];
  /** A slot replaced: the hand's mode re-read (`fireMode = fireModes[kitItem]`), the model re-hung, the HUD shown. */
  renew(): void;
  /**
   * NU-5 L1: a rocket launcher claimed into equipment slot `slot`, its round in `round` (null when the kit shows none
   * new) with `rounds` rounds -- the page's round slots and equipment take them up (the page's wiring).
   */
  launcherTaken?(slot: number, round: number | null, rounds: number): void;
  /**
   * NU-5 X1 and research 324 P2 (`./walk` `PICKUP_SWAP_OWN_LAG_READING`): the pick-up's `Swap rifle` on the page's own
   * body (`WalkMode.pickupSwap`) -- the exchange's, or the launcher claim's.
   */
  swapClip?(name: PickupClipName): void;
}

const FIREARM: Readonly<Record<FirearmSlot, Firearm>> = { 0: 'rifle', 1: 'pistol' };

export function takeKit(
  d: TakeKitDeps, loadout: readonly number[], slot: FirearmSlot | null,
  rounds: readonly [readonly number[], readonly number[]], filled?: readonly [readonly number[], readonly number[]],
): void {
  const before = d.loadouts.records();
  const was = [...d.loadouts.loadout()];
  d.loadouts.take(loadout);
  const recs = d.loadouts.records();
  d.records(recs);
  for (const s of [0, 1] as const) {
    if (s === slot && FIREARM[s] === d.hand()) { d.fire.takeWeapon(recs[s], rounds[s]); d.accuracy.setWeapon(recs[s]); }
    else d.fire.setRing(recs[s], rounds[s], s === slot ? before[s].name : undefined, filled?.[s]);
  }
  const now = d.loadouts.loadout();
  const launcher = [2, 3, 4].find((s) => now[s] !== was[s] && itemClass(now[s]!) === 'rocketLauncher');
  if (launcher !== undefined) {
    const id = rocketRoundOf(now[launcher]!);
    const round = [2, 3, 4].find((s) => s !== launcher && now[s] === id && was[s] !== id) ?? null;
    d.launcherTaken?.(launcher, round, PICKUP_LAUNCHER_ROUNDS_READING);
    d.renew();
    d.swapClip?.('swapRifleClaim');                       // D:L458199-458206: every console's, the taker's own too
  }
  if (slot === null) return;
  // NU-5 X1: the slot held a weapon -- the exchange laid it, and the taker's own console plays `Swap rifle`
  // (`FUN_00588bc0` D:L458209-458211); a claim into an empty slot plays none.
  if (was[slot] !== EMPTY_ITEM) d.swapClip?.('swapRifleExchange');
  // Research 323 F1: the slot setter zeroes the taken weapon's mode; the hand's slot is stepped up to its highest mode,
  // another at the swap to it once (`pickupFireMode`). The hand is the selected firearm (`kitItem`), and none while an
  // item or a launcher is up (the selection an equipment slot: both firearm slots step at the swap). OT.R100's adaptation
  // (`DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION`, `fullAutoDefault`) puts a weapon with automatic on it.
  const selected = FIREARM[slot] === d.hand() && (d.inHand?.() ?? true);
  if (recs[slot].id !== before[slot].id) {
    d.modes[FIREARM[slot]] = fullAutoDefault(recs[slot], pickupFireMode(recs[slot], slot === 0 ? d.heldRounds() : [], selected));
  }
  d.renew();
}
