import {
  actorToWorldPoint, ALL_LAYERS, isToss, segmentHits, SURFACE_SIDE, SURFACE_SKIP, surfaceWord, THROW_PARAMS, throwAnim,
  type Grid, type ThrowStance, type V3, type WorldPoly,
} from '@s2u/scene';
import type { PlaySnapshot } from './walk';

/**
 * The explosives' commit rules as the original's (PAR-20, research 256): what the hand-grenade release request
 * (`FUN_005be9a0`, its category-0x79 branch D:L475490-475511) asks before it pushes a throw, the throw clip, or spends
 * anything. The page's `GrenadeThrower` (`./grenade`) asks these; they hold no state of their own.
 */

/**
 * D10 (research 256 s1): the power under which the release request refuses the throw -- the dynamics block's `+0x198`,
 * `THROW_PARAMS`' `abort_threshold`, which `dynamics.rdr` does not set, so its constructor's default stands
 * (`FUN_002ce1a0` D:L171508: 0x3e19999a, the float32 nearest .15). `FUN_005be9a0` compares the power it is handed (the
 * player controller's `+0x11c`, read by the kit's tick `FUN_005c0fd0` D:L476570 and passed at D:L476638) with it before
 * anything is done for the throw (D:L475496-475497, the dynamics block by `FUN_0058ce60`): under it, `FUN_00592d40`
 * zeroes the controller's power (D:L475498 -> D:L451964) and no clip is pushed (`FUN_005802b0`, which pushes the throw
 * and sets the kit's timer to its release, is the accepted branch's, D:L475500-475511); the grenade count falls
 * only at hand-open (`FUN_005c1970` D:L477039-477042), so nothing is spent.
 */
export const THROW_ABORT_POWER = Math.fround(THROW_PARAMS.abortThreshold);

/**
 * Whether a release at `power` passes D10's test: `power < +0x198` refuses (the original's float32 compare, so `power`
 * is taken as the float32 it would be stored as: exactly the threshold clears, the float32 under it does not).
 */
export const releasePowerClears = (power: number): boolean => !(Math.fround(power) < THROW_ABORT_POWER);

/**
 * D11 (research 256 s2): the aim's sine the hand-open reads -- the actor's `+0x1450`, loaded at the moment the hand
 * opens (`FUN_005c1970` D:L477106) and taken through `asinf` (`FUN_001b38c8` -> `FUN_001af178`), clamped and raised by
 * the power's elevation in `throwVelocity` (D:L477107-477109). The port's `+0x1450` is the snapshot's pitch's sine, as
 * the arc and `GetThrowAnim`'s toss test already take it (research 85 s3; the field's writer is not traced, research
 * 214 s6's `DROP_AIM_READING`).
 */
export const releaseAimSin = (snap: Pick<PlaySnapshot, 'pitch'>): number => Math.sin((snap.pitch * Math.PI) / 180);

/**
 * D11: the body's state as the hand-open reads it for the range (`+0x174`, D:L477069-477075: 0 takes the dynamics
 * block's `+0x19c`, `max_distance_stand`, anything else `+0x1a0`): the lean (state 3) whenever the peek holds, prone
 * leans included, else the stance. Only "standing or not" reaches the launch (`maxThrowDistance`). OBF-23 (research 85
 * §4.2): the stance is the state (`snap.stanceState` where it differs from the drawn posture), never the posture -- the
 * crouch-run is state 1 on the standing run's body (`FUN_00584c60` D:L444145-444192), so its throw is the crouched
 * state's: the standing `Throw grenade` past 15 u/s (`GetThrowAnim` D:L441827-441843), never the standing toss.
 */
export function releaseStance(snap: Pick<PlaySnapshot, 'peek' | 'stance' | 'stanceState'>): ThrowStance {
  const peek = snap.peek ?? 0;
  if (peek === 0) return snap.stanceState ?? snap.stance;
  return peek > 0 ? 'peek-right' : 'peek-left';
}

/**
 * D09 (research 256 s3): the kit's timer C4's `Put on wall` arms -- `+0x87c` written 0x42c60000 (the bytes 0, 0, 0xc6,
 * 0x42, D:L475448-475451), 99 seconds, with the kit's busy bit (`+1` bit 2, D:L475447). The clip's callback at phase
 * .45 (`LAB_005bfe40` hung at `+0x64` with `+0x60` = 0x3ee66666 and `+0x68` -> `+0x87c`, D:L475443-475445; research 230
 * s2.1: the callback writes zero through that pointer, ELF 0x5bfe48) is what plants at the normal 1.098 s
 * (`C4_PLANT_SECONDS`): the kit's tick then sees the timer out and runs the commit (`FUN_005c1970` D:L476883-476999).
 */
export const C4_KIT_TIMER_SECONDS = 99;

/**
 * PLACEHOLDER (named, the owner's row): what a C4 placing comes to when an in-game end takes its clip off before the
 * callback (a knock, D:L440992-440998 -> D:L446515 -> `FUN_0028da00` D:L135092-135104; a `replaced` end the same, the
 * port's one hold). `'kitTimer'`: the transcription as far as it is read -- the kit's 99 s timer runs on, the kit stays
 * busy (`FUN_005c4fd0` D:L478947 refuses a selection while it runs), and its end runs the commit with its checks.
 * Whether another cleanup ends that first is not read: the only one found is the death's (`FUN_00547af0` D:L413023 ->
 * `FUN_005b8920` D:L471751-471759, which clears the timer and spends nothing for a charge type). No permanent cancel of
 * those ends is decided here (research 256 s3, s6; H156). The two browser-only exits are not this interim
 * (`C4_PLANT_LEAVE_CANCEL_ADAPTATION`).
 */
export const C4_FALLBACK_PLACEHOLDER = 'kitTimer' as const;

/**
 * ADAPTATION (browser only, research 256 §3): a C4 plant whose clip callback has not run is dropped at once, unspent,
 * and the firearm returns. `'cancel'` covers the two exits that have no original end: no walk snapshot (leaving the
 * walk, the fly toggle), and the latched plant hold gone with no mover end (the debug hook's `setCamera` re-place,
 * `main.ts` and `matchMount.ts`, through `Walker.place`). A knock or a `replaced` end keeps `C4_FALLBACK_PLACEHOLDER`.
 */
export const C4_PLANT_LEAVE_CANCEL_ADAPTATION = 'cancel' as const;

/** A float32 by its bits, as the decompilation writes the clearance's words. */
function f32(bits: number): number {
  const d = new DataView(new ArrayBuffer(4));
  d.setUint32(0, bits);
  return d.getFloat32(0);
}

/**
 * D12 (research 256 s5): the clearance segment's far end by the body's state, in the actor frame (x right, y up, z
 * behind), `FUN_005499e0`'s words: standing a toss's (D:L414025-414026) or a throw's (the stack's defaults,
 * D:L414004-414006, taken at D:L414029-414030), crouched one (D:L414034-414035), prone a toss's (D:L414042-414043) or a
 * throw's (D:L414046-414047). The toss is `GetThrowAnim`'s test: power under `toss_power_threshold` and the aim's sine
 * under `toss_aim_threshold` (D:L414014-414019).
 */
export const THROW_CLEARANCE_ENDS = {
  standToss: [f32(0x405d4092), f32(0x414744f2), f32(0xc1200000)],
  standThrow: [f32(0x3f93dffc), f32(0x4155abbf), f32(0xc17c0000)],
  crouch: [f32(0x3f6ca633), f32(0x412a1a13), f32(0xc141999a)],
  proneToss: [f32(0x3fe8e697), f32(0x40b290cf), f32(0xc129999a)],
  proneThrow: [f32(0x3f18110a), f32(0x411150d9), f32(0xc0d80000)],
} as const satisfies Record<string, V3>;

/**
 * PLACEHOLDER (named): which surfaces and owners the clearance's world query counts. `FUN_0031e250(world, a, b, 1)`
 * (D:L220150-220175) runs the grid's segment record through `FUN_002d4780` (D:L175734-175794) and `FUN_002d2890`: a
 * surface needs bit 1 and passes the global `DAT_0044d758`'s filter (0: bit 18 clear, the movement's; 1: bit 19 clear
 * and the material's flag), and with the call's 1 an owner whose `+0xa1` mask 4 (bit 2) is set is skipped, the record's
 * `+0x3c` node excluded (D:L174789-174792, D:L174845-174864). `DAT_0044d758` reads 0 when the release request runs (a
 * bss byte whose every setter of 1, `FUN_002d4fd0` D:L176018-176021, restores 0 after its own query; research 256 §5,
 * LATER 247's review), so the movement's filter is the one asked. Which owners carry `+0xa1` mask 4 (bit 2) and what
 * `+0x3c` names then are not read (LATER 256); the hull's test is one-sided (front entries), the port's two-sided
 * (LATER 250). The port asks the movement's surfaces (bit 1 set, bit 18 clear) of every owner the model gate passes --
 * the hull's polygons; bodies are not in the port's grid.
 */
export const THROW_CLEARANCE_QUERY_PLACEHOLDER = 'movement surfaces, every gated owner' as const;

/** The query's surface test under `THROW_CLEARANCE_QUERY_PLACEHOLDER`: bit 1 set, bit 18 clear. */
const clearanceSurface = (p: WorldPoly): boolean => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE;

/**
 * D12: the release request's clearance segment in the world, or null when `FUN_005499e0` asks no query -- the lean
 * (state 3: any state but 0, 1 and 2 returns 1, D:L414037-414039) and a state with no throw (`GetThrowAnim` 0 returns 0
 * before it, D:L414009-414012; the caller refuses that on its own, `GrenadeThrower.stance`). From `GetThrowAnim`'s hand
 * point (`throwAnim`'s table point for this power, aim, state and speed) with a z forward of the feet taken to 0
 * (D:L414020-414021, D:L414050-414052), to the state's end point (`THROW_CLEARANCE_ENDS`), both through the actor's
 * matrix (D:L414053-414054: the port's feet and yaw, `actorToWorldPoint`).
 */
export function throwClearanceSegment(
  snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>, power: number, aimSin: number,
): { from: V3; to: V3 } | null {
  const state = releaseStance(snap);
  if (state !== 'stand' && state !== 'crouch' && state !== 'prone') return null;
  const toss = isToss(power, aimSin);
  const hand = throwAnim(power, aimSin, state, snap.vx * snap.vx + snap.vz * snap.vz).offset;
  const end = state === 'stand' ? (toss ? THROW_CLEARANCE_ENDS.standToss : THROW_CLEARANCE_ENDS.standThrow)
    : state === 'crouch' ? THROW_CLEARANCE_ENDS.crouch
      : toss ? THROW_CLEARANCE_ENDS.proneToss : THROW_CLEARANCE_ENDS.proneThrow;
  const start: V3 = [hand[0], hand[1], hand[2] < 0 ? 0 : hand[2]];
  return { from: actorToWorldPoint(snap.feet, snap.yaw, start), to: actorToWorldPoint(snap.feet, snap.yaw, end) };
}

/**
 * D12: whether the release request's clearance passes (`FUN_005499e0` answers 1): no segment to ask (the lean), no hull
 * loaded (the port's own case: nothing to hit), or the segment meets nothing (`FUN_0031e250` 0, D:L414055-414061).
 * LATER 250: the hull's test is one-sided -- a face counts only entered from its front (`FUN_002d2890`'s side mode 0x20
 * for a hull collider; research 281 §4.3), so the query asks `segmentHits`' `frontOnly`. The port takes every polygon of
 * its grid as the hull's: a collider whose `+0x80` bit 1 is set is two-sided in the original (`FUN_0032ad20`'s,
 * D:L227611 -- what it makes is not read), and none is told apart here.
 */
export function throwClear(
  grid: Grid | null, snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>,
  power: number, aimSin: number,
): boolean {
  const seg = throwClearanceSegment(snap, power, aimSin);
  if (!seg || !grid) return true;
  return segmentHits(grid, seg.from, seg.to, clearanceSurface, ALL_LAYERS, true).length === 0;   // LATER 250: front entries only
}
