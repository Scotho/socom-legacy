import { itemClass, slotKindOf } from '@s2u/scene';

/**
 * NET-REFILL (research 312; the row of web sprint 19's clans' half): the network magazine refill, one rule the room
 * (`packages/match/src/room.ts` `reload`) and the page (`../fire` `Fire`) both import, as `./flinchReload` is.
 *
 * In a network game (`DAT_0045a0c1`, `IsNetwork`: research 91 §1, 107) a reload whose walk finds no other magazine with
 * rounds (`FUN_005c2a90`: branch 1's walk found none, D:L477490; branch 2, no magazine holds rounds, D:L477517) writes the
 * record's `Ammo_Capacity` (`FUN_003d2810`, record `+0x28`) into the magazine in the weapon (D:L477498-477500,
 * D:L477525-477527; `../magazines` `MagazineRing.refill`), the index unmoved, then pushes the reload's clip and plays its
 * `ReloadSound` -- the ordinary reload's two calls (D:L477501-477509, D:L477528-477537). Offline neither branch refills.
 * Every port match is a network game -- the match server's rooms and the page's single-player match alike
 * (`SOLO_IS_NETWORK_READING`, `./loopback`) -- so the rule holds wherever a match runs; a page with no match is offline.
 *
 * `respawn` is the game's `+0xdc` (`FUN_002a7560` D:L149415-149433: the host option set and game type 5), which is the
 * room's `rules === 'respawn'` (`./protocol` `Rules`; respawn rooms are played since OT.R71, so both halves show live --
 * the respawn half in a respawn game, the pistol half in classic).
 */
export interface NetRefillRule { respawn: boolean }

/**
 * NET_REFILL_READING (research 312 §7; reading, pending review): which records the network refill takes -- the class
 * test of `FUN_005c2a90` (D:L477491-477497, D:L477518-477524): `FUN_003d1e10` is 4 (a pistol, ids 4-30 by
 * `FUN_003d1a60` D:L324336-324352) in any network game; or the id passes `FUN_003d1d10` (D:L324404-324419: the primary
 * classes, `@s2u/scene` `slotKindOf` 'primary') and is not 0x8e (the MGL) nor 0x8f (the M79), with the game's `+0xdc`
 * set. Settles it: ONL-32's capture of an online reload with no magazine left (research 312 §7).
 */
export const NET_REFILL_READING = 'online, a reload whose walk finds no other magazine with rounds refills the one in the weapon to Ammo_Capacity: a pistol in any game; in a respawn game any primary but the MGL and the M79';

/**
 * NET_REFILL_MAGS_HIDDEN_READING (research 312 §4.2, §7; reading, pending review): the ammo box's MAGS hidden online
 * (`FUN_00237760` D:L85181-85192): the hand's class (`FUN_005c8040` D:L480686-480696, the slot in the hand, not a round
 * mode's redirect) is 4 (`FUN_003d1da0`), or in a respawn game passes `FUN_003d1db0` (D:L324442-324455: the primary
 * classes, no id excluded -- the MGL and the M79 hidden though their rings are not refilled). The in-game select's MAGS
 * (`FUN_002193d0`, `../inventoryMenu` `magsText`) reads no flag and is not hidden. Settles it: an online frame of the box
 * (research 312 §7).
 */
export const NET_REFILL_MAGS_HIDDEN_READING = 'online the ammo box hides MAGS for a pistol in the hand; in a respawn game for any primary class; the select\'s MAGS is not hidden';

/** The MGL's id, 0x8e (research 94's id table, row 142): `FUN_005c2a90` D:L477495, D:L477522 exclude it. */
export const MGL_ID = 0x8e;
/** The M79's id, 0x8f (research 94's id table, row 143): `FUN_005c2a90` D:L477496, D:L477523 exclude it. */
export const M79_ID = 0x8f;

/** `FUN_005c2a90`'s network test for the record `id` reloaded (`NET_REFILL_READING`). */
export function netRefills(id: number, rule: NetRefillRule): boolean {
  if (itemClass(id) === 'pistol') return true;
  return rule.respawn && slotKindOf(id) === 'primary' && id !== MGL_ID && id !== M79_ID;
}

/** `FUN_00237760`'s network test for the record `id` in the hand: the ammo box shows no MAGS (`NET_REFILL_MAGS_HIDDEN_READING`). */
export function netMagsHidden(id: number, rule: NetRefillRule): boolean {
  return itemClass(id) === 'pistol' || (rule.respawn && slotKindOf(id) === 'primary');
}
