/** Renderer-independent presentation rules shared by both match renderers. */
import type { PlaySnapshot, SwapProgress } from './mover';
import type { PlayEvent } from './play';
import type { Mount } from './heldItem';
import { handedAt, handOffOf, type Firearm } from './kit';
import { SEAL_ANIMS } from './locomotion';
import { BodyFlag, type BodyState } from './net/protocol';

/**
 * The other player's weapons by the replicated weapon (`BodyState.weapon`: 0 the primary, 1 the secondary), where the
 * local kit leaves them once its swap has ended (`./kit`: `FUN_005a60d0(seal, 2, 0)` carries the rifle while the pistol
 * is in the hand; `FUN_005a75d0` holsters the pistol).
 */
export function remoteKit(weapon: 0 | 1): { item: Firearm; mounts: { rifle: Mount; pistol: Mount } } {
  return weapon === 1 ? { item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' } } : { item: 'rifle', mounts: { rifle: 'hand', pistol: 'holster' } };
}

/**
 * The swap clip a replicated body is playing -- the standing, crouched or prone swap action, or the moving overlay, as
 * `Walker.swapProgress` reads them -- its direction (the clip backwards is the pistol back to the rifle) and its
 * progress 0..1 on the snapshot's own clock; null when none plays.
 */
export function remoteSwap(snap: PlaySnapshot): { to: Firearm; action: SwapProgress['action']; overlay: boolean; progress: number } | null {
  const a = snap.action;
  if (a && (a.name === 'swapStand' || a.name === 'swapCrouch' || a.name === 'swapProne') && a.seconds) {
    return { to: a.reversed ? 'rifle' : 'pistol', action: a.name, overlay: false, progress: Math.min(1, a.t / a.seconds) };
  }
  const o = snap.overlay;
  if (o && o.clip === SEAL_ANIMS.swapMoving && o.seconds > 0) {
    return { to: o.reversed ? 'rifle' : 'pistol', action: null, overlay: true, progress: Math.min(1, o.t / o.seconds) };
  }
  return null;
}


/**
 * The other player's weapons from its snapshot, hand-off included: while a swap clip plays they hang as the local
 * `Kit` hangs them on the same clip and progress (the multiplayer merge review's hole 3) -- the rifle on the `swap`
 * mount posed by the clip, `m_item` the pistol from the start going out (`FUN_005a7260`) and until the end coming back
 * (`FUN_005a70f0`), the pistol into the hand (`FUN_005a7730`) or the holster (`FUN_005a75d0`) as the clip passes its
 * `HAND_OFF_READING` phase -- so the hand-off is drawn mid-clip, not when the replicated weapon changes at the swap's
 * start. No new field on the wire: the clip, its clock and its direction already ride the body (`BodyState.action*`,
 * `overlay*`, `ActionReversed` / `OverlayReversed`). Before the hand-off the pistol is where the settled kit keeps it
 * (the holster; the local kit's spawn mount on the hips is not replicated).
 */
export function remoteKitOf(snap: PlaySnapshot & { weapon: 0 | 1 }): ReturnType<typeof remoteKit> {
  const swap = remoteSwap(snap);
  if (!swap || swap.progress >= 1) return remoteKit(swap ? (swap.to === 'pistol' ? 1 : 0) : snap.weapon);
  const handed = handedAt(swap.to, swap.progress, handOffOf(swap));
  const pistol: Mount = swap.to === 'pistol' ? (handed ? 'hand' : 'holster') : (handed ? 'holster' : 'hand');
  return { item: 'pistol', mounts: { rifle: 'swap', pistol } };
}


/** The step a remote body's footfall sounds (`GameAudio.onFootstep`'s place and step), or null for none. */
export interface RemoteStep { at: [number, number, number]; stance: 0 | 1 | 2; stick: number }

/**
 * Another player's footfall heard (ported from Chris's browser-beta-v5, d578f347): `FUN_005a3570` (460266-460378) runs
 * in the actor update with no locality test (`FUN_005506a0` L417909), so a console hears the others' steps -- at the
 * foot (`vtable+0x14`, `FUN_005a39b0`), the crawl prone, whose left foot's call is skipped; the step or the stealth
 * step by the stick (REMOTE_STEP_STICK_READING). Null for any other event, and for the prone left foot.
 */
export function remoteFootfall(e: PlayEvent, s: Pick<PlaySnapshot, 'feet' | 'stance' | 'ground'>): RemoteStep | null {
  if (e.kind !== 'footfall') return null;
  const stance = s.stance === 'prone' ? 2 : s.stance === 'crouch' ? 1 : 0;
  if (stance === 2 && e.foot === 'left') return null;
  const at = e.position ?? s.feet;
  return { at: [at[0], at[1], at[2]], stance, stick: Math.max(Math.abs(s.ground.forward), Math.abs(s.ground.right)) };
}

/**
 * FOOTFALL_CAP_READING (PF-25, PF.R43; research 179 section 11.20, research 219 section 4): `FUN_005a3570` sounds a step
 * only with the actor's `+0xe0` bit 2 (D:L460295); `FUN_00552850` (D:L418748-418861) sets it per viewer, on the viewer's
 * own actor always (L418860) and on at most `DAT_0064fc78` = 3 (`consts.out`) other actors of its list (`+0xd8`) whose
 * distance squared (the entry's +0x10) is under 250000.0 (500 units; strict). A reading: the console's own build of the
 * list, and its skip of a remote player's flagged actor (`+0x265` bits 0/1, not modelled), are not reproduced here.
 */
export const FOOTFALL_CAP_READING = { others: 3, range2: 250000 } as const;

/**
 * FOOTFALL_NEAREST_READING (PF-25, PF.R43; research 179 section 11.20): which three -- the page takes the nearest by
 * distance squared to the listener (ties in the snapshot's order). Owed: whether `FUN_00552850`'s `+0xd8` list is
 * sorted by distance; if it is not, the original's three are the list's first three in range, not the nearest.
 */
export const FOOTFALL_NEAREST_READING = 'nearest' as const;

/**
 * FOOTFALL_UNBOUND_PLACEHOLDER (LATER 1051; research 219 s4): off the own body with no bound body the page can place --
 * a spectator in free or scenic, whose camera's `+0xbc` is its own spectator object (research 314 W5: whether that
 * object's update runs `FUN_00552850`, and from where, is unread); a spectator following a hostage (the escortees are
 * kept out of the cap's list, HX-2, so the bound hostage is not found there; whether the original's `+0xd8` lists hold
 * them is unread, research 238 s7); or a bound body gone from the room's list -- the original keeps the retired actor
 * bound (research 314 s5.4) and its update plausibly still runs, but the page does not take the retired copy
 * `SpectatorView` keeps for the view as the listener. In each the page's own listener stands (none off the body: every
 * living body heard, the behaviour before LATER 1051). Settles by: a read of the spectator object's frame update, or
 * a capture (a spectator in free view beside four moving players, the steps counted).
 */
export const FOOTFALL_UNBOUND_PLACEHOLDER = 'every living body' as const;

/**
 * The other bodies whose footfalls the page hears this frame (FOOTFALL_CAP_READING, FOOTFALL_NEAREST_READING): the
 * living ones under 500 units of `listener` (the page's own feet), nearest first, at most three; null -- every living
 * body -- without a listener (the map viewer's watcher, a page not in a body). The page's own steps are never here
 * (`./walkSounds` sounds them unranked: L418860).
 *
 * LATER 1051 (reading, pending review): `bound`, the camera's bound body when it is not the page's own (a dead player's
 * watched teammate, a spectator's followed player: `SpectatorView.boundId()`), is the listener instead -- `FUN_00551ec0`
 * runs `FUN_00552850` on the camera's `+0xbc` actor (D:L418506-418507), dead or alive -- and is heard itself when
 * living (D:L418860), taking none of the three slots. A bound id not in `bodies` leaves `listener`
 * (FOOTFALL_UNBOUND_PLACEHOLDER).
 */
export function footfallsHeard(bodies: readonly Pick<BodyState, 'id' | 'feet' | 'flags'>[], listener: readonly [number, number, number] | null, bound: number | null = null): Set<number> | null {
  const held = bound === null ? undefined : bodies.find((b) => b.id === bound);
  if (held) listener = held.feet;
  if (!listener) return null;
  const near: { id: number; d2: number }[] = [];
  for (const b of bodies) {
    if (b === held) continue;                                        // the bound actor is the list's owner, not an entry of its +0xd8
    if (!(b.flags & BodyFlag.Alive)) continue;                       // a dead body takes no slot: PF.R43's choice -- FUN_00552850 has no alive test; whether a corpse stays in +0xd8 is unread
    const dx = b.feet[0] - listener[0], dy = b.feet[1] - listener[1], dz = b.feet[2] - listener[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < FOOTFALL_CAP_READING.range2) near.push({ id: b.id, d2 });
  }
  near.sort((a, b) => a.d2 - b.d2);                                   // stable: ties keep the snapshot's order
  const heard = new Set(near.slice(0, FOOTFALL_CAP_READING.others).map((n) => n.id));
  if (held && held.flags & BodyFlag.Alive) heard.add(held.id);         // D:L418860: the bound actor's own steps
  return heard;
}

