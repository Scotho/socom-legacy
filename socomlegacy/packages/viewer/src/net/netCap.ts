import { itemClass, type ItemClass } from '@s2u/scene';

/**
 * NET-CAP (research 312 §10; the row of web sprint 19's clans' half): the throwables' cap online, one rule the room
 * (`packages/match/src/room.ts` `throwGrenade`, `placeCharge`) and the page both import, as `./netRefill` is.
 *
 * In a network game (`DAT_0045a0c1`, `IsNetwork`: research 91 §1, 107) the kit's "may it fire" (`FUN_005c0ae0`) refuses
 * a local actor's use (controller `+0x34`, `IsRemote` answering no: research 193; D:L476481-476484) of the record in the
 * hand's slot (`kit+0x824` -- the slot itself, never a round mode's redirect, D:L476470-476477) when its class is a
 * grenade, an explosive, a launcher round or a rocket round, while `5 < FUN_003cb8f0(DAT_004b5220, actor+4)`
 * (D:L476477-476491): the actor's own live projectiles of those classes in the level's projectile manager 0x4b5220.
 * Refused, `FUN_005c0ae0` answers 0 and `FUN_005be9a0` -- the throw's release request, the claymore's and the PMN's
 * placing -- is not reached (`FUN_005c0fd0` D:L476569, D:L476637-476638); and the refused branch does nothing at all:
 * it needs `FUN_003d1e20` to answer non-zero (D:L476590), which it never does for the four classes (D:L324477-324479) --
 * no click, no count, no message, nothing spent.
 *
 * Never C4: it is planted by the Action button (`FUN_00592d50` D:L452030-452055), whose `FUN_005c0020(..., 0x97)` goes
 * straight to `FUN_005be9a0` when `FUN_003d1e20` answers 0, as it does for C4 (D:L475985-475994). `FUN_005c0ae0` is never
 * asked there -- its callers are D:L424497, D:L427749, D:L428062 and the kit's frame (D:L476569, D:L476623) -- so the
 * room's `placeCharge` and the page's `startPlacing` (as `plantC4` reaches it) leave C4 out. C4 set down still counts.
 *
 * Every port match is a network game -- the match server's rooms and the page's single-player match alike
 * (`SOLO_IS_NETWORK_READING`, `./loopback`) -- and every command the room judges is its own console's (the local actor),
 * so the rule holds for every use the room decides; a page with no match is offline.
 */

/**
 * NET_CAP_READING (research 312 §10, §10.5; reading, pending review): `FUN_005c0ae0` D:L476470-476491 with
 * `FUN_003cb8f0` D:L320898-320952. The hand's class tested is the slot's record's: a launched round leaves from its
 * carrier in the hand (the M203 rifles, the MGL, the M79: `FUN_005c8a20` D:L481385, D:L481471-481487 puts the hand on the
 * carrier when a round is chosen, `FUN_003c5d20` / `FUN_003c5d80` D:L317258-317300) and a rocket from its launcher (class
 * 0x91), so neither use is refused -- though both, in flight, count. Nor C4, planted by the Action button
 * (`FUN_00592d50` D:L452030-452055 -> `FUN_005c0020` D:L475985-475994, which never asks `FUN_005c0ae0`); set down, it
 * counts. Settles it: ONL-32's capture of a sixth use refused
 * online (six grenades or charges out, a seventh pressed; an M203 round launched and C4 planted with six out).
 */
export const NET_CAP_READING = 'online, a local SEAL\'s use of the item in its hand\'s slot, when that is a grenade, an explosive, a launcher round or a rocket round, is refused while it has more than five of its own projectiles of those classes live (set down or in flight); a launch is its carrier\'s and C4 is the Action button\'s, and neither is refused';

/**
 * NET_CAP_EMPTY_POOL_READING (research 312 §10.2, §10.5; reading, pending review): `FUN_003cb8f0` answers -1 -- never a
 * refusal -- when the manager's pool holds no active entry: its high mark (`+0x18`) is -1 (kept by the pool's take
 * `FUN_003cca90` D:L321508-321510 and its frees, e.g. `FUN_003cc3c0` D:L321272-321285), and the placed list's count
 * already made is dropped (D:L320931-320933). The port's pool is the live projectiles that are not placed charges; a
 * firearm's round takes a pool entry too (`FUN_005c5340` D:L479345-479349: every round but item 11's), which the port
 * keeps no projectile for, so a pool held only by rounds in flight is not seen. Settles it: the same capture with six
 * charges set down and nothing in the air (the seventh set down), then a grenade in the air.
 */
export const NET_CAP_EMPTY_POOL_READING = 'the count is -1, so no refusal, while nothing is in flight in the level: the placed charges alone never refuse';

/** `5 < FUN_003cb8f0(...)` (D:L476486): the sixth live projectile refuses the next use. */
export const NET_CAP_MAX = 5;

/**
 * The four classes, `FUN_003d1e10` == 'y' / -0x69 / -0x55 / -0x47 (D:L476470-476477 in the hand, D:L320922-320925 and
 * D:L320939-320942 in the count): 0x79 grenade (121-140), 0x97 explosive (151-170: C4, the satchel, the claymore,
 * MPBOMB, the PMN, the Backblast 159), 0xab launcher round (171-184), 0xb9 rocket round (185-189) by `FUN_003d1a60`'s
 * ranges (D:L324336-324352; `@s2u/scene` `itemClass`).
 */
export const NET_CAP_CLASSES: ReadonlySet<ItemClass> = new Set<ItemClass>(['grenade', 'explosive', 'launcherRound', 'rocketRound']);

/** Whether the record `id` is of the four classes. */
export function netCapCounts(id: number): boolean {
  return NET_CAP_CLASSES.has(itemClass(id));
}

/**
 * One live projectile in the level's manager: `mine` its owner (`+0xac`) is the actor asking, `id` its record's
 * (`+0xc`), `placed` it is a charge set down (the placed list, `FUN_005bc730` D:L474104) rather than in the pool
 * (thrown, launched, the backblast: `FUN_003cca90` D:L479349, D:L325635).
 */
export interface NetCapEntry { mine: boolean; id: number; placed: boolean }

/**
 * `FUN_003cb8f0(manager, owner)` (D:L320898-320952): the owner's entries of the four classes over the placed list and
 * the pool alike -- or -1 when nothing is in the pool (`NET_CAP_EMPTY_POOL_READING`).
 */
export function netCapLive(entries: Iterable<NetCapEntry>): number {
  let count = 0, pool = false;
  for (const e of entries) {
    if (!e.placed) pool = true;
    if (e.mine && netCapCounts(e.id)) count++;
  }
  return pool ? count : -1;
}

/** `FUN_005c0ae0`'s network refusal for the record `handId` in the hand's slot, the owner's count `live` (`NET_CAP_READING`). */
export function netCapRefuses(handId: number, live: number): boolean {
  return netCapCounts(handId) && live > NET_CAP_MAX;
}
