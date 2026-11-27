import {
  actorToWorldDir, actorToWorldPoint, ALL_LAYERS, segmentHits, SURFACE_SIDE, SURFACE_SKIP, surfaceMaterial, surfaceWord,
  THROW_PARAMS, throwAnim, type Grid, type SurfaceMaterial, type ThrowStance, type V3, type WorldPoly,
} from '@s2u/scene';
import { aimHitKept } from './net/aimQuery';
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
 * The view pitch's sine. Was the port's stand-in for the aim's `+0x1450` (D11, research 256 s2); since LANE-KILL B-06
 * (research 256 s5.3) the page and the room read the body's aim vector instead (`./throwAim` `throwAimVector`, r0004
 * `0x5e6690`), which differs from the pitch's sine by tens of degrees near a wall. Kept for the tests that pose a
 * release by its pitch alone.
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

/**
 * D12, r0004 (OT.R97; research 256 s5, "the r0004 clearance"): the clearance ray's length -- r0004's release clearance
 * (`0x54e6f0`, its one caller the release request at 0x5c5d6c) scales the aim vector by 25.0, an immediate in the
 * instruction stream (`lui 0x41c8` at r0004 0x54e798, to the FPU at 0x54e7a4; the scale `0x326520`). Reading, two
 * readers (agent-mail pilot/kill/item-1-query-vs-capture.md s0, item-1-r0004-second-read.md s6); the capture's legs bound
 * it to at least 19.7 (D-T10). r0001's five end points (`FUN_005499e0` D:L414004-414047) are superseded by it (OT.R97)
 * and are no longer in the port; research 256 s5 keeps their words.
 */
export const THROW_CLEARANCE_LENGTH_READING = 25;

/**
 * PLACEHOLDER (named): which surfaces and owners the clearance's world query counts, and its sidedness. r0004 asks
 * `0x33b860(*(0x45f750), start, end, 1)` (0x54e854-0x54e888), the same structure as r0001's `FUN_0031e250(world, a, b, 1)`
 * (D:L220150-220175; the second reader compared r0004's bytes with the decompilation, not r0001's bytes): the shared
 * record at `world+0x14c`, bit 0 of its `+2` = (arg == 0), the walk `0x2f1690(world+0x684, record)`, the pick
 * `0x2f1bd0` (the one hit nearest the start). r0004's walk `0x2f1690` -- its polygon test's sidedness and the class byte
 * (r0001's `DAT_0044d758`) at the call -- is NOT read; the port keeps r0001's reading of them: through `FUN_002d4780`
 * (D:L175734-175794) and `FUN_002d2890` a surface needs bit 1 and, the class byte 0 (every setter of 1, `FUN_002d4fd0`
 * D:L176018-176021, restores 0; research 256 s5, LATER 247's review), bit 18 clear; with the call's 1 an owner whose
 * `+0xa1` mask 4 (bit 2) is set is skipped, the record's `+0x3c` node excluded (D:L174789-174792, D:L174845-174864;
 * which owners carry it is not read, LATER 256); the hull's test one-sided, front entries only (side mode 0x20; LATER
 * 250) -- the sidedness the capture's fit used (r0004's ray scored 13/13 one-sided, 9/13 two-sided; item-1 s1). The
 * port asks the movement's surfaces (bit 1 set, bit 18 clear) of every owner the model gate passes -- the hull's
 * polygons; bodies are not in the port's grid.
 */
export const THROW_CLEARANCE_QUERY_PLACEHOLDER = 'movement surfaces, every gated owner' as const;

/** The query's surface test under `THROW_CLEARANCE_QUERY_PLACEHOLDER`: bit 1 set, bit 18 clear. */
const clearanceSurface = (p: WorldPoly): boolean => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE;

/**
 * D12, r0004 (OT.R97; research 256 s5): the release clearance's ray in the world (r0004 `0x54e6f0`). The start is
 * `GetThrowAnim`'s hand point (r0004 `0x585280`, r0001's `FUN_0057fce0`: `throwAnim`'s table point for this power, aim,
 * state and speed -- a lean, state 3, its own lean hand point) through the actor matrix, row 3 included (`0x3259e0` at
 * 0x54e768-0x54e788; the port's feet and yaw, `actorToWorldPoint`), with NO clamp of a forward z (r0001's clamp,
 * D:L414050-414052, has no counterpart). The end is the start plus the aim vector `actor+0x144c..0x1454` scaled by
 * `THROW_CLEARANCE_LENGTH_READING` and turned by the matrix's rows 0-2 alone (0x54e78c-0x54e840; `actorToWorldDir`).
 * `aim`: the body's aim vector in the actor frame (`./throwAim` `throwAimVector`, r0004 `0x5e6690`; research 256 s5.3), all
 * three floats; a bare sine s is taken as (0, s, -sqrt(1 - s^2)), a vector with no sideways term (the tests' and the
 * room's sampled launches). Its y is also `GetThrowAnim`'s toss test's (`0x585280` at 0x5852b8). A lean is cast like any state: r0004's clearance
 * never reads the state (r0001's early "return 1" for state 3, D:L414037-414039, is gone). A state with no throw clip
 * (`0x585280` 0, the clearance 0: a refusal) is the caller's to refuse, as `GrenadeThrower.stance` does. r0004 also
 * computes the toss test at 0x54e740-0x54e764 and discards it: no branch reads it.
 */
export function throwClearanceSegment(
  snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>, power: number, aim: ThrowAimArg,
): { from: V3; to: V3 } {
  const state = releaseStance(snap);
  const v = aimVectorOf(aim);
  const hand = throwAnim(power, v[1], state, snap.vx * snap.vx + snap.vz * snap.vz).offset;
  const from = actorToWorldPoint(snap.feet, snap.yaw, hand);
  const L = THROW_CLEARANCE_LENGTH_READING;
  const dir = actorToWorldDir(snap.yaw, [L * v[0], L * v[1], L * v[2]]);
  return { from, to: [from[0] + dir[0], from[1] + dir[1], from[2] + dir[2]] };
}

/**
 * D12, r0004 (OT.R97; research 256 s5): whether the release clearance passes (r0004 `0x54e6f0` answers 1). No hull
 * loaded is the port's own case (nothing to hit). Else the ray's hits under `THROW_CLEARANCE_QUERY_PLACEHOLDER` (front
 * entries only, LATER 250; a reading pending review of r0004's walk), and the ONE nearest the start (`0x2f1bd0`: the
 * smallest squared distance from the record's start, 0x2f1bd0-0x2f1d1c; `segmentHits` sorts by t, so its first) -- never
 * filtered before it is taken: a see-through nearest hit clears the throw whatever lies behind it. That hit refuses only
 * when `0x5bc8d0(actor, hit)` calls it a blocker (0x5bc8d0-0x5bc9e4), field for field the port's `aimHitKept`: an empty
 * material slot clears, `m_cameratype` exactly 1 clears, else `aimPickBlocks`. `materialOf` is the map's material lookup
 * (`surfaceMaterial` with the map's default material); by default the built-in table with no default name.
 */
export function throwClear(
  grid: Grid | null, snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>,
  power: number, aim: ThrowAimArg, materialOf: (material: number) => SurfaceMaterial | null | undefined = (m) => surfaceMaterial(m),
): boolean {
  if (!grid) return true;
  const seg = throwClearanceSegment(snap, power, aim);
  const nearest = segmentHits(grid, seg.from, seg.to, clearanceSurface, ALL_LAYERS, true)[0];   // LATER 250: front entries only
  return !nearest || !aimHitKept(nearest.poly, materialOf);
}

/**
 * READING (named; research 256 s5.3, s7; reading of r0004, the second reader of agent-mail pilot/kill/
 * item-1-aim-second-read.md s4, pending review): the hand-open's own cast. r0004's hand-open (`0x5c8860`, the kit's; the
 * actor `kit+0x830`) takes the stance's TABLE point for the state and the toss test at that moment (0x5c8e5c-0x5c9054,
 * `GetThrowAnim`'s points) through the body matrix, the aim vector's three floats x 25.0 through its 3x3, and asks the
 * same `0x33b860(world, start, end, 1)` as the release clearance (0x5c9290-0x5c93a8). ANY hit returned skips the launch
 * AND the count's decrement (0x5c93ac to 0x5c98a0): the hit is not passed to `0x5bc8d0`, so there is no material or owner
 * filter. r0001's hand-open has no such query (D:L476960-477112). The value is the ray's length, 25 (the same
 * immediate's role as `THROW_CLEARANCE_LENGTH_READING`). Not read: what a skipped hand-open leaves behind (the grenade
 * in the hand, the kit's state) -- the port leaves the item up, unspent, and ends the throw as a hand-open with nothing
 * thrown. Settles it: a capture of a release cleared at the request and walled at the hand-open (the aim moved between).
 */
export const HAND_OPEN_CAST_READING = 25;

/**
 * READING (named, LOW confidence; research 256 s7; the review of c5629fb494): which table point the hand-open's cast
 * starts from for a crouched state. r0004's hand-open (0x5c9158) always takes the point set at 0x66b080, whatever the
 * speed (one reader, the review; the set's points not yet compared with `THROW_ANIMS`); the port's `handOpenClear` takes `throwAnim`'s point for the state and speed, which for a crouch
 * above 15 u/s (OBF-23's crouch-run, `GetThrowAnim`'s D:L441827-441843) is the STANDING throw's. The port's choice is
 * kept (no behaviour change here): `'throwAnim'`. Settles it: 0x5c9158's branch re-read with the 0x66b080 set's points
 * against `THROW_ANIMS`, then a capture of a crouch-run throw at a wall the two points straddle.
 */
export const HAND_OPEN_CROUCH_POINT_READING = 'throwAnim' as const;

/**
 * Whether r0004's hand-open cast (`HAND_OPEN_CAST_READING`) lets the launch go: no hull loaded, or no hit of the release
 * clearance's query (`THROW_CLEARANCE_QUERY_PLACEHOLDER`'s surfaces, front entries) on the ray from the stance's table
 * point along `HAND_OPEN_CAST_READING` x the aim. Any hit refuses, whatever its material.
 */
export function handOpenClear(
  grid: Grid | null, snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>,
  power: number, aim: ThrowAimArg,
): boolean {
  return handOpenCast(grid, snap, power, aim).clear;
}

/**
 * THROW_DIAG_ADAPTATION (issue #858; a browser instrument with no original): one hit of `handOpenCast`, as plain data --
 * the crossing point and its place along the cast, the face's unit normal, and the face itself (its path, material and
 * `ditype`, which `clearanceSurface` reads).
 */
export interface HandOpenHit {
  point: [number, number, number]; t: number; normal: [number, number, number]; path: string; material: number; ditype: number;
}

/**
 * `handOpenClear`'s cast, the same query in the same order, with what it asked and met: `clear` is `handOpenClear`'s
 * answer (it is nothing but this function's `clear`), `from`/`to` the segment cast (null with no hull loaded) and `hit`
 * the nearest hit (null when clear). THROW_DIAG_ADAPTATION (issue #858): the segment and the hit are returned for the
 * thrower's `diag` to record; nothing of the game reads them.
 */
export function handOpenCast(
  grid: Grid | null, snap: Pick<PlaySnapshot, 'feet' | 'yaw' | 'stance' | 'stanceState' | 'peek' | 'vx' | 'vz'>,
  power: number, aim: ThrowAimArg,
): { clear: boolean; from: V3 | null; to: V3 | null; hit: HandOpenHit | null } {
  if (!grid) return { clear: true, from: null, to: null, hit: null };
  const state = releaseStance(snap);
  const v = aimVectorOf(aim);
  // HAND_OPEN_CROUCH_POINT_READING: `throwAnim`'s point for the state and speed (r0004 0x5c9158 always takes 0x66b080's set).
  const hand = throwAnim(power, v[1], state, snap.vx * snap.vx + snap.vz * snap.vz).offset;
  const from = actorToWorldPoint(snap.feet, snap.yaw, hand);
  const L = HAND_OPEN_CAST_READING;
  const dir = actorToWorldDir(snap.yaw, [L * v[0], L * v[1], L * v[2]]);
  const to: V3 = [from[0] + dir[0], from[1] + dir[1], from[2] + dir[2]];
  const hits = segmentHits(grid, from, to, clearanceSurface, ALL_LAYERS, true);
  const h = hits[0];
  return {
    clear: hits.length === 0, from: [from[0], from[1], from[2]], to,
    hit: h ? { point: [...h.point], t: h.t, normal: [...h.normal], path: h.poly.path, material: h.poly.material, ditype: h.poly.ditype } : null,
  };
}

/** An aim as the clearances take it: the body's aim vector (actor frame), or a bare sine (no sideways term). */
export type ThrowAimArg = number | readonly number[];

/** The aim vector of a `ThrowAimArg`: a sine s as (0, s, -sqrt(1 - s^2)). */
export function aimVectorOf(aim: ThrowAimArg): V3 {
  if (typeof aim === 'number') return [0, aim, -Math.sqrt(Math.max(0, 1 - aim * aim))];
  return [aim[0]!, aim[1]!, aim[2]!];
}
