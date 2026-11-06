import {
  ALL_LAYERS, buildGrid, cellAt, isCameraSurface, isWallSurface, materialTable, modelGate, polygonNormal, probeGround, ringCells, segmentHit, segmentHits, selectFloor, surfaceWord, surfaceMaterial, upNormal,
  GameFrameAccumulator, GAME_FRAME_DT, SEAL_LOCOMOTION, SEAL_TUNING, DEFAULT_SIDEARM, DEFAULT_WEAPON,
  type CollisionObject, type CollisionOwner, type SegmentHit as SegmentHitOf, type MotionClip, type Grid, type GridParams, type Hit, type WorldPoly,
} from '@s2u/scene';
import type { GroundWish, Pose } from './camera';
import { airBands, oneShotSeconds, SEAL_ANIMS } from './locomotion';
import { landingKind, sealTuning, type LandingKind } from './physics';
import { SLIDE_DISC_SURFACE_KIND, SLIDE_SPAN_MIN, slideSpanOf, steepGroundFrame } from './steepSlide';
import type { TraversalPose } from './animator';
import type { GateTop } from './net/actionGate';
import { SCOPE_SLOW } from './zoom';
import { wrapYaw } from './yaw';
import { PRONE_HEIGHT } from './stature';
import { OrderedBoundsIndex } from './orderedBoundsIndex';
import { CLIMBABLE, CORNER_DOT } from './climb';
import { weaponLineLengthOf, WEAPON_LINE_ONE_SIDED_PLACEHOLDER } from './weaponLine';
import {
  actionClipOf, GROUND_PLAY_PHASE, groundClipOf, oneShotPhase, PRONE_TILT_EASE_BASIS_READING, rootTiltStart, rotateByQuat, stepRootTilt,
  tiltWindowOf, traversalPhase, worldToBody, type RootTiltState, type TiltQuat, type TiltTop,
} from './rootTilt';

/** AI body correction after hull resolution and before floor selection (research334 section 5). */
type GroundCorrection = (feet: readonly [number, number, number]) => readonly [number, number, number];

/**
 * Walk mode (web sprint 1, W1.4; web sprint 2, W2.2b): a mover that stands on the floor the engine's probe finds,
 * slides along the walls research 24 names, runs at the game's speeds, crouches, goes prone and falls.
 *
 * - **The tick.** `CGame::Tick` (`FUN_001E7040`) runs once per 30 Hz game frame, `GAME_FRAME_DT` = 525/15734 s
 *   (research 180 §0, which retired research 71 §1.5's 60 Hz); the port's mover keeps a 60 Hz tick as transport (PF.R8,
 *   research 208). The mover steps on that clock from a fixed-step accumulator the page feeds real time into, so it takes the same
 *   steps at 30 fps and at 240 fps; the eye is drawn between the last two steps (`eye`).
 * - **The speed: the law, as read from the decompilation (W2.2b step 1 and its review).** Each actor tick
 *   (`dt = actor+0x2e0`) `FUN_005af930` puts the pad in `actor+0x244` (lateral, controller.rdr's `Strafe`) and
 *   `actor+0x240` (forward, `MoveLong`) -- the move stick as the pad reader leaves it (`./moveStick`: 0.3 dead per
 *   axis, rescaled, x sqrt 2, each axis clamped and the pair never put in the unit disc; the keys a full axis each, so
 *   W+D is (1, 1); web research 88 section 3) -- and `FUN_005870e0` (decomp 445164-445169) runs the ground state by the
 *   stance at `actor+0x174`: 0 -> `FUN_00586570` (stand), 1 -> `FUN_00584c60` (crouch), 2 -> `FUN_005845c0`
 *   (prone). `FUN_00586f00` calls a stick within 0.03 of rest (`DAT_003f3428`) idle: no locomotion, the stop is
 *   at once whatever the stick was.
 *
 *   ```
 *   FUN_00586c10(stick)    the throttle ramp, per axis, against last tick's (actor+0x248/0x24c):
 *     lo, hi = lower/upper_x_accel (lateral) or lower/upper_z_accel (forward)     DAT_0044c294..2a0 = 2, 5
 *     limit  = lo + (hi - lo) * (1 - (1 - |target|)^8)                            per second, in stick units
 *     if |target - prev| / dt > limit:  target = prev +- limit * dt
 *     if |prev| > 0.9 and |raw - prev| / dt > 9   (lateral: 0.78, 7.8):  target = raw, the clip blend reset to
 *       0.2 s (FUN_0028e3e0 on actor+0x170)
 *   FUN_00583350(lateral, forward)  -> m = min(1, |stick|) with forward = 0 when |forward| <= 0.03;
 *     w = asin(|lateral| / |stick|) * 2/pi (0 ahead .. 1 abeam); DAT_0064fc80 = 1 / sqrt(w^2 + (1 - w)^2)
 *   FUN_005858a0(lateral, forward)  -> the direction class actor+0x1338: 1 forward, 3 back, 0 right, 2 left, by the
 *     dominant axis (|a / b| > 0.839), in the diagonal band between by quadrant and the last class (hysteresis)
 *   FUN_0058bdf0(m, weight, set)    -> m x 100 x max_velocity (cm/s) picks the set's clip(s) by transition_speed_A..B
 *   FUN_0057a330                    -> velocity actor+0x2c = the clips' root motion (FUN_0028c250), scaled by
 *                                      DAT_0064fc80 in FUN_00309180
 *
 *   STAND  FUN_00586570: stick at rest -> no ramp (the raw 0 is kept); else FUN_00586c10, then FUN_00583030:
 *          the forward set (+0x60, back +0x90 reversed) at m with weight 1 - w when |forward| > 0.03 and w < 1,
 *          the strafe set (+0xf0 right, +0xc0 left) at m with weight w when |lateral| > 0.03 and w > 0,
 *          renormalised by DAT_0064fc80
 *   CROUCH FUN_00584c60: FUN_005858a0 on the raw stick; then
 *          |stick| x 14.8 >= 12.4 (0.838 of a stick) and the root under 9 (the stance test) -> FUN_0057efe0's
 *            headroom ray (from the hips + 2 up to the feet + 19): clear -> state 2 and FUN_00583030, the STANDING
 *            run sets and blend -- the SEAL stands and runs; the stance word stays crouch, so under 0.838 it is back
 *            to the crouch walk
 *          else: stick x 14 / (|stick| x 14.8) (magnitude 0.946 whatever the push), FUN_00586c10, FUN_00582d10:
 *            ONE set by the class (+0x120 forward, +0x150 back and +0x180 left played at -m, +0x1b0 right) at
 *            weight 1, no blend -- 0.946 x 14.8 = 14.0 ahead, x 13.5 back, x 15 aside
 *   PRONE  FUN_005845c0 -> FUN_00583500: no FUN_00586c10 at all; the class keeps one axis (1/3 forward, 0/2
 *          lateral) and zeroes the other; the crawl (forward, reversed backward) or the prone strafe plays at that
 *          axis's |value|, so the speed is max(|x|, |z|) x the band on the first tick
 *   ```
 *
 *   So the velocity is `m x max_velocity` of the clip the class or the blend picks (`READERC.ZAR/motion.rdr`, at
 *   `MetersPerUnit` 0.1: 65 forward, 37 back, research 25 section 0's (0, 0, -65) and (0, 0, +37)); the ramp is the
 *   stick's, not the speed's: 0 to full in 1 / 5 s, 90 % on tick 11 (0.18 s). `fb_accel` / `lr_accel`
 *   (`DAT_0044c360/364`, `dynamics.rdr` 0.01) and `throt_exp` have no reader in the decompilation besides the
 *   static initialiser `FUN_00400870` and the loader: they do not shape the SEAL's walk. The slope and water
 *   slow-down `FUN_005b56c0` (`DAT_0044c358/35c`) is modelled: the driver's `stickScale` (`./traversal`) scales the
 *   stick before the ramp, as `FUN_00586570` D:L444865-444866 orders them. Not modelled: the root motion's shape within a stride
 *   (the snap's 0.2 s cross-fade is modelled: `throttleSnaps`, `Walker.stickSnaps`). ~~One consequence is kept as read: `FUN_00582d10` calls `FUN_00583350`, whose
 *   `DAT_0064fc80` then scales the crouch walk's single set, so a crouch diagonal runs 1 / sqrt(w^2 + (1 - w)^2)
 *   faster along its class's axis (19.8 at 45 degrees).~~ *Superseded 2026-11-02 (MOVE-4, research 80 section 6g):*
 *   `FUN_0057a330` (D:L438911-438956) splits the class clip's root velocity, w to x and 1 - w to z, before
 *   `DAT_0064fc80` scales it (D:L438985) -- the band's speed along atan2(w, 1 - w) (capture: 45 degrees at 45). Ported
 *   in SEPARATE; COMBINED keeps the old reading under OT.R93 (the owner's question, HUMAN_TASKS). Research 18 section 3.13's 0.9 s "lead" and its average of
 *   40 are the orbit camera trailing the actor on our recomp at 18.7 frames a second, not this ramp. [reading of
 *   the decompilation; W2.2c measures it on the console, W2.R7]
 * - **Stances.** A tap of `C` toggles stand and crouch (prone to crouch), a hold goes prone (owner, 2026-09-29; the
 *   touch button cycles stand, crouch, prone; nothing on Ctrl -- `camera.ts` says why); each
 *   has its bands, its body column and its skeleton root height (`STANCE`). `Walker.posture` is the body in use:
 *   `stand` while a crouch runs at full stick.
 * - **The floor.** After each sub-step `probeGround` at the new (x, z) and `selectFloor` from the origin (below) with
 *   the feet at y (research 23 section 1.1-1.2, research 24 section 2). The pick is the floor stood on, up to 20 over
 *   the feet (`FUN_005b5d40`); no rise is compared with `step_height` 6.5 -- a face taller than 6.5 is met by the low
 *   probe line as a wall (`wallProbeHeights`), the original's segment query lifted by `step_height` (issue #111,
 *   research 217 s2.6, research 86 s6.5). One steeper than `max_slope` 50 degrees is not refused either (LATER 590,
 *   closed, research 217 s2.7): the segments at `step_height` stop a steep face they meet (`FUN_0054aa30` D:L415167),
 *   and on the ground it slides (`./steepSlide`, research 201 §3); one down to
 *   `ground_touch_distance` 8 under the feet is stepped down to (`READERC.ZAR/dynamics.rdr`,
 *   reCOM `zCharacter/char_dyn.cpp:17-20`; research 17 section 8's `+0x14..+0x1c`). No floor, and the step is refused.
 *   On the ground the origin is y + 5.5 (`STEP_PROBE_LIFT_READING`, the console's spawn measurement), so the window
 *   reaches `step_height` and a kerb between 6 and 6.5 with a lower floor also under the line is stepped onto
 *   (research 101 A7; a reading since 2026-10-02, research 86 section 6.5). The origin is one per tick (`FUN_005b0840`
 *   computes it, `FUN_005b5d40` selects with it), so the spawn and the airborne probes take the same y + 5.5.
 * - **The fall.** Further than 8 down, the mover is airborne. `FUN_0059b440` integrates it: the fall speed
 *   `actor+0x133c += g x dt`, then the height `actor+0x2e4 -= speed x dt` (as here: `vy -= g x dt`, `y += vy x dt`),
 *   with `g` the table's `0x44c250 +0x00` -- the static default `0x42c43333` = 98.1 (1 g in units), overwritten
 *   with `dynamics.rdr`'s 235 by the loader `FUN_0059ba80`, so units a second squared and the SEAL falls at 2.4 g.
 *   `g x 0.8` applies only in the `Ladderslide` state (`DAT_003def50`, the string at `0x6620c8`), not a walk-off or
 *   a landing: not modelled. The horizontal velocity is held as it left the edge (no air control: the stick-driven
 *   velocity with `FUN_00586c10` in `FUN_0057a330` runs only in the `Jump` state, `DAT_003deae8` = "Jump" at
 *   `0x661510`), until the probe's floor is met. A 42-unit drop (Frostfire's decks, research 24 section 7 item 4)
 *   takes sqrt(2 x 42 / 235) = 0.60 s.
 * - **The walls.** Research 24 section 2 step 3: a polygon with bit 1 set, bit 18 clear and `|n_y| < 0.7`, met by
 *   the body's column (y + 6 to y + 20 standing) at radius 3.5 (W1.R2); the mover is pushed out along the wall
 *   until it is 3.5 from it, and keeps the part of its step that runs along it. The game's movement collision is
 *   not decompiled -- that walls stop the mover is research 24's inference from the 3c trails, which stand off wall
 *   planes at 4.4-5.8 (section 4.1).
 * - **The view (W2.1, W2.R1).** The game's third-person camera (`playerCamera.ts`): its target `rootY + ramp` over
 *   the feet at the posture's root, its eye behind and over, the pass against the hull, a tick at a time after the
 *   mover's and drawn between ticks; zoomed, the view from the head (`scopeEyeHeight`): first person, the night vision,
 *   the binoculars and the scope (`./zoom`; first person was ruled out on 2026-09-29 and restored by the owner on
 *   2026-10-01, R5). The mouse turns the body's
 *   yaw and the camera's pitch (`camera.ts`). Sprint 1's eye 15.4 (`EYE_HEIGHT`, W1.R2) is retired as a view; it
 *   stays the height a pose drops the mover from.
 * - **The jump** (socomlegacy/docs/research/80-the-jump.md, read from the decompilation). `FUN_0057e1b0` (decomp
 *   440776-440867) takes the press when the SEAL is on walkable ground (`actor+0x1348` >= cos `max_slope`), not prone
 *   (`FUN_005b4340(.., 0xb)` refuses stance 2), and not within 0.4 s (`actor+0x135c`) of a running jump's take-off or
 *   of a landing. **At 15 units a second or more** (speed^2 >= 225) it is the **running jump**: the `Jump launch` action
 *   (`seal_runningjump_launch`), the take-off's world velocity kept at `actor+0x1350..0x1358` and carried through the
 *   air with no stick (`FUN_0054d9a0`, 416501-416555), and `actor+0x1364 = jump_factor x gravity x -0.4` -- -79.9 --
 *   written into the fall speed 0.1 s later (`actor+0x1360`, `FUN_005af930`): an impulse of **79.9 units a second up**
 *   under the 235 fall. The air steps at the 30 Hz game frame (PF-03, PF.R8; research 208 section 3): the wind-up's
 *   two frames sink the feet 0.785, the impulse lands on the third, and the feet top 11.485 over the floor (12.270 over
 *   the sunk feet) and land on frame 22 (0.734 s; the port's 60 Hz tick 45, 0.75 s). **Under 15** it is
 *   the **standing jump**: the `Jump` action (`seal_jump`, 0.99 s), and the feet never leave the floor -- the height
 *   comes from the clip only for `UseVelY` motions (`FUN_0059afd0`, 456328-456466), and `seal_jump` is none: the rise
 *   is the skeleton root's, 10.5 to 15.1 over the feet, and the game's camera follows that root. While it plays the
 *   stick drives the SEAL at each set's top speed (`FUN_0057a330` 438955-438985, the only air control: 65 ahead, 37
 *   back, 65 aside standing, 20 crouched; kept by OT.R108 over r0004's forward-only R4B-12). **Landing**
 *   (`FUN_005af590`, 466641-466728): over `land_hard_fall_rate` 115
 *   the `Jump land hard` action (`seal_land_hard`, 0.9 s); else, with the stick at rest or the last airborne tick's
 *   velocity under 20 (`actor+0x38`, the fall included: `FUN_005483d0` decomp 413963), `Jump land` (`seal_land_soft`,
 *   0.63 s); else no clip, the run going on from the stick at once (the ramp skipped: `actor+0x248 = +0x244`). Through a
 *   landing clip the carried velocity runs down at 150 a second squared (`FUN_0054d9a0`). A walk-off plays the
 *   in-air clip (`Jump fall`, `FUN_0057e050`) and lands by the same rule.
 * - **The stance changes** (`FUN_005817d0`, `FUN_00581c10`, `FUN_00581540`, decomp 442170-442660): standing to crouch
 *   plays `Stand -> Crouch` (0.60 s) unless moving over 10 a second; crouch to stand the same clip backwards unless
 *   moving over 10; to prone `Stand -> Prone` (0.95 s) or `Crouch -> Prone` (0.85 s), and out of prone those backwards.
 *   The ground state does not run while a transition plays (`FUN_005870e0` runs it only on a locomotion action) [reading].
 */

/**
 * Seconds per tick: the port's 60 Hz transport and simulation tick (the command stream's `TICK_HZ`), not the game's
 * frame. The original ticks once per 30 Hz frame, `GAME_FRAME_DT` = 525/15734 s (`@s2u/scene`; research 180 §0 retired
 * research 71 §1.5's 60 Hz); under PF.R8 this tick stays as transport and a per-frame constant runs once per
 * `GAME_FRAME_DT` through `GameFrameAccumulator` (research 208).
 */
export const TICK = 1 / 60;
/**
 * Sprint 1's eye over the feet (W1.R2): no longer a view (W2.1 retired it: W2.R1), the height `setCamera` and the
 * spawn drop the mover from, and `Walker.eye`'s.
 */
export const EYE_HEIGHT = 15.4;
/**
 * The body's radius against walls standing and crouched (W1.R2; research 24 section 2 step 3, section 4.1): the size
 * class's 3.5 (`FUN_0054aa30` D:L415110-415133); the walls read `WALL_PROBE_READING` (PF-16), prone 8.0 along the travel.
 */
export const BODY_RADIUS = 3.5;
/** FUN_0054aa30 D:L415166/416025-416044; FUN_005483d0 D:L413432/413538, RAM0x44c268. */
export const AI_HULL_READING = { ahead: 1.4, still: 0.0005, slope: 0.6427876353263855 } as const;

/** No step moves further than this at once, so a wall 3.5 away cannot be stepped through at any speed. */
const MAX_SUBSTEP = 1;

/** The SEAL's three stances, in the order the touch button cycles them (`zSeal/zseal.h`'s `SEAL_STANCE`). */
export type Stance = 'stand' | 'crouch' | 'prone';
export const STANCES: readonly Stance[] = ['stand', 'crouch', 'prone'];

/** A stance's four moving bands, units a second: the `max_velocity` of the clip each direction plays. */
export interface Bands { forward: number; back: number; right: number; left: number }

/** What a stance is to the mover: its bands, its skeleton root's height, and the probe a wall has to meet. */
export interface StanceBody {
  bands: Bands;
  /** The skeleton root node's Y over the feet (`actor+0x2e8` -> `+0x04`), W2.1's `rootY + ramp(rootY)`. */
  rootY: number;
  /** The low wall probe of the stance's size class (`WALL_PROBE_READING`): its height over the feet and its radius. */
  probe: WallProbe;
}

/** One class's low wall probe: `h` over the feet, `r` the class radius (`FUN_0054aa30`; PF-16). */
export interface WallProbe { readonly h: number; readonly r: number }

/** A clip's `max_velocity` from `READERC.ZAR/motion.rdr` (`SEAL_LOCOMOTION`, units a second). */
function band(clip: string): number {
  const b = SEAL_LOCOMOTION.find((l) => l.clip === clip);
  if (!b) throw new Error(`motion.rdr has no ${clip}`);
  return b.maxVelocity;
}

/**
 * The prone skeleton root's height over the feet: `seal_prone`'s `skel_root` y at its first key (and every key),
 * 2.1680 = 555/256 (`MOTION_P.ZAR`, read by the port's own parser; `seal_fp_prone`, `seal_p_prone` and
 * `seal_headlooks_prone` the same), the convention checked against the console dump on the standing and crouched
 * idles (research 180 s1.2). `FUN_0029a950`'s ramp floor 2.169155 sits 0.001 over it: the camera's lowest stance was
 * cut for this root. Retires the 1.8 estimate (PF-21, research 217 s4).
 */
export const PRONE_ROOT = 555 / 256;
/**
 * The prone size class's height (`FUN_0058a720(actor, 1)` = 2 with `bVar5`: (8.0, 6.0), `FUN_0054aa30` D:L415119-415122);
 * its probe stands at half of it (D:L415231-415233). `./stature` `PRONE_HEIGHT` (PF-21).
 */
const PRONE_CLASS_HEIGHT = PRONE_HEIGHT;
/**
 * The low wall probe per stance (PF-16, ruling PF.R44, research 217 s2): `FUN_0054aa30` (D:L414515-416190) casts the
 * body's wall segments each tick (registered by `FUN_0054f410` D:L417251-417272, resolved by `FUN_005483d0`
 * D:L413380-413560) at the feet + `fVar22` -- `DAT_0044c26c` step_height 6.5 (the port's `SEAL_TUNING.stepHeight`; 4.0
 * static, 6.5 from boot, research 180 V1 8.4 (c)), or the class height x 0.5 when `bVar5` (prone; D:L415231-415233,
 * added to both ends at D:L415418-415419) -- with the size class's radius `fVar18` (D:L415110-415133): standing and
 * crouched (3.5, 19.1 / 15.0), prone (8.0, 6.0). No column: the class heights matter only for `bVar5`. The port keeps
 * the body `r` off a wall the probe meets [reading: the original removes the velocity into a wall a segment meets
 * (`FUN_005483d0`) and its segments reach `r x 1.4` ahead (x 1.1 the centre one, D:L415166, D:L415235; x 1.75 more,
 * `DAT_0064fce8`, standing or crouched and moving, D:L415354-415371: 9.43), so its stand-off is about the reach; the
 * port's is `r`, as `BODY_RADIUS` was -- owed a capture of a SEAL pressed to a wall].
 * Retires `CROUCH_TOP_READING` (14) and `PRONE_TOP_READING` (9), the column's tops.
 */
export const WALL_PROBE_READING: Readonly<Record<Stance, WallProbe>> = {
  stand: { h: SEAL_TUNING.stepHeight, r: 3.5 },
  crouch: { h: SEAL_TUNING.stepHeight, r: 3.5 },
  prone: { h: PRONE_CLASS_HEIGHT * 0.5, r: 8 },
};
/**
 * The shape of the controlled body's segments along the travel (`FUN_0054aa30`'s local-player branch, D:L415341 on;
 * the direction `fStack_10` = the velocity normalised, x `r x 1.4` D:L415166; the side vector `fStack_20` = the travel
 * turned a quarter, D:L415171-415181): `count` 3 at the probe height -- the centre one to `centre` x `ahead` x r
 * (`uStack_60`, 1.1, D:L415235); standing and crouched two side ones from 0.3 r off the axis to 1.2 r off it and
 * `ahead` x r forward (D:L415210, D:L415220; cast D:L415549-415577, mirrored D:L415789-415817); prone two lines
 * `across` = 0.3 x 1.3 = 0.39 r off the axis from `ahead` x r behind to `ahead` x r ahead (D:L415582-415621, mirrored
 * D:L415822-415861). The port builds the prone fan as `across x r` (3.12) off the axis every way and `r` (8.0) ahead
 * along the travel; standing and crouched a disc of `r`. [reading: the segments' lengths are not the stand-off
 * (`WALL_PROBE_READING`); the standing fan's side lines are taken as the disc; a still body casts nothing ahead (the
 * original casts along the facing, D:L415135-415149); turning prone (`actor+0x48`, D:L415110-415112) the original
 * swaps the 0.39 r lines for one turned 0.3-1.2 r line (D:L415701-415788, D:L415941-416023), not built]
 */
export const PRONE_FAN_READING = { count: 3, ahead: 1.4, centre: 1.1, across: 0.39 } as const;
/**
 * PRONE-TILT-2 (3) (research 217 s7.8; reading, pending review): the prone probe's tilt. When `bVar5` (prone) the low
 * line's segments are lifted through the body's root matrix (`FUN_0054aa30` D:L415426-415431 and its other segments,
 * D:L415533-416013): `FUN_0054ecd0` (D:L416972-417027) scales the travel in the body's frame (`fStack_190`: the frame
 * displacement `+0xf44` turned by the actor quaternion's conjugate, y zeroed, its z -1 when still (or `bVar4`), normalised,
 * D:L415341-415352) by the segment's length, turns it by the rows of the root's matrix (vtable `+0x88` -> `skel_root`,
 * `+0xc`: the matrix `FUN_00548090` rebuilt, `./rootTilt`) and adds the result's y to the segment's end. So the line
 * rises `(R d).y` a unit of its length along the travel: `'root'`, the port's low line ahead (`PRONE_FAN_READING`'s 8.0)
 * cast from the feet + 3.0 rising `(q d).y` a unit, `q` the root's tilt as the last tick left it (`Walker.rootTilt`; the
 * mover runs before the rule, as `FUN_005483d0` before `FUN_00548090`; level under the `'world-up'` ease basis, whose
 * matrix is the clip's, and on a tick the rule wrote nothing under `ROOT_TILT_UNWRITTEN_READING` `'clip'`). [reading: the
 * port's 3.12 disc (`PRONE_FAN_READING`, standing in for the side lines, also lifted in the original) and the crossing
 * guard (`crosses`) stay level; the head line is not lifted in the original either (D:L415441-415459, the posed head,
 * `WALL_HEAD_LINE_READING`). On a flat tread the root is level, so a riser over 3.0 within 8.0 ahead still stops a crawl
 * (research 217 s2.5). Owed: a capture of a prone crawl up M51's incline to a kerb, and up a 3/6 stair.] `'level'`: the
 * line level, as before.
 */
export type ProneProbeTilt = 'root' | 'level';
export const PRONE_PROBE_TILT_READING = 'root' as ProneProbeTilt;
/**
 * The head line (`FUN_0054aa30` D:L415441-415459): the controlled body casts a second segment along the travel at the
 * head node (`actor+0x308`, the `CZSealBody` constructor's `head`, research 180 s1.3) as posed + 2 (`fStack_1dc + 2.0`,
 * D:L415443; again at D:L415459 when `+0x52f` is set), reaching `r x 1.4` -- the second height research 180 s1.6
 * believed absent (its owed read; PF-16, research 217 s2.2). The room has no posed skeleton, so both ends take the
 * stance's idle head (`IDLE_HEAD`): `'idle'` [reading: the posed head moves with the clip -- crouch-walking 12.84 to
 * 13.09 (the line 2.7 to 3.0 low), running 15.39 to 15.74 (1.7 to 2.0 high), research 217 s2.3; the line is given the
 * body's footprint, not one segment ahead; owed a capture, a SEAL walked under a lintel].
 */
export const WALL_HEAD_LINE_READING = 'idle';
/**
 * A wall the body's footprint meets at the face's END (the nearest point of the face's band is one of its ends, not a
 * point on the face). The original's contact is a segment of the fan crossing the polygon inside its edges, and its
 * normal is the polygon's own (the hull's VU0 routine, micro 279-285 and 336-361, research 281 s4.3); `FUN_005483d0`
 * takes the hits one after another (D:L413533-413597) and the frame displacement `+0xf44` -- the port's move and its
 * `vx`/`vz` -- loses its whole part along each levelled normal (D:L413538-413541, D:L413557-413567); the carried
 * velocity `+0x1350` loses only its part into it (D:L413588-413594). Nothing pushes the body along a direction from the
 * face's corner. `'face-normal'`: at a face's end the port takes that rule on its disc of `r` (`WALL_PROBE_READING`) --
 * no push; after the pass's face hits (the centre segment's, cast first, `FUN_0054aa30` D:L415341, unless a filtered
 * hit's slot was refilled from the list's end, D:L413428-413457) the move less its parts along the faces' normals, and
 * the velocity, lose their parts into the face along its own normal; an end met from behind its face's own normal
 * (one-sided, research 281 s4.3), or behind the feet across the move, is no hit, as the fan runs forward from the feet
 * (D:L415549-415577, mirrored D:L415789-415817). `'radial'`: the push off the corner the port had before MV-PARITY
 * (b2), kept as the switch's other arm. [reading, pending review (MV-PARITY b2): the port removes only the parts INTO
 * the face (`moved < 0`, `into < 0`), where the original removes the whole part along the normal from `+0xf44` -- its
 * segments, cast along the travel, cross no face the move leaves, so it holds no such hit, while the port's disc can
 * touch an end it moves away from; which ends the fan's 0.3 r to 1.2 r side lines meet (`PRONE_FAN_READING`) is not the
 * disc's; the order among walls is the port's; owed: a capture of a SEAL pushed into a face's end and along a convex
 * joint, LATER 283's segment probe].
 */
export const WALL_END_CONTACT_READING: 'face-normal' | 'radial' = 'face-normal';
/**
 * HOTFIX BRIDGE-WEDGE (research 217 s2.10): the heights an airborne body meets the walls at. The
 * original's frame displacement `+0xf44` carries the fall (`FUN_0054d9a0` D:L416501-416530); `FUN_0054aa30` casts the
 * segments from the feet + `step_height` along it (D:L415157-415166, D:L415401-415410), and `FUN_005483d0` resolves them
 * every tick, in the air too (`FUN_005506a0` D:L417822-417826). `'start-and-end'`: the port's disc meets the walls at the
 * tick-start lines (the move's slide, two-sided as before) and again, every airborne tick, at the lines over the feet the
 * tick leaves -- after its game frames, or on the floor the tick's pick puts them on (`fall`'s landing, `FUN_0059ad30`
 * D:L456313-456322) -- and there only faces the body comes at from in front of their own normal: the hull's hit is
 * one-sided, a segment from in front of the polygon's own normal to behind it (research 281 s4.3, `FUN_002d2890` micro
 * 288-333). A move those lines meet is not taken (the airborne sub-step's guard; the jam leaves the body where the tick
 * began, D:L413602-413611 with D:L413918). `'start'`: the port before the hotfix. [reading, pending capture: the
 * original's segment is one slanted line, the port's disc two level cuts at its ends; the port's contacts elsewhere stay
 * two-sided (LATER 620); whether `+0x133c` is this frame's fall speed or the last is not read; owed: a capture of a SEAL
 * dropped past a face's top edge and of Crossroads' rubble slot (research 213 s3 item 2, H94)]. The `'disc'` arm only
 * (`WALL_BODY_READING`): on the segment path -- every map's walkers -- `fall` resolves the fall through the segments
 * and calls no `airWalls` (research 217 s2.10, the merge note).
 */
export const AIR_WALL_HEIGHTS_READING = 'start-and-end' as 'start-and-end' | 'start';
/**
 * HOTFIX BRIDGE-WEDGE (HF2-slim), an adaptation with no line of the original behind it (research 217 s2.10; LATER 283,
 * LATER 620): a body already inside the walls -- its disc within the radius of a face at a probe line -- whose every push
 * out crosses a face (the crossing guard, PF-05) is put once at the nearest free point: within the deepest penetration
 * plus the radius, `headings` directions in rings `step` apart, the disc clear there at both lines, a floor the walk
 * takes, and reached from where the tick began and from where it stands without crossing any face from in front of its
 * own normal (research 281 s4.3: the hull's hit is one-sided, so a face crossed from behind holds nothing in the
 * original, and two-sided walls -- a room's -- still hold). It stands in for the segment body's resolution (research 217
 * s2.9, SEGMENT-BODY) until that lands: the original's segments in Crossroads' 3.02 slot meet nothing along x and cross
 * the fin from behind, where the port's 3.5 disc fits nowhere. **The bound:** it acts only on a body already inside
 * geometry -- on the ground, its disc deeper than `WEDGE_CLEAR` into a face at a probe line, and the ordinary push-out
 * (`pushOut`) or every try of a ground sub-step refused by the crossing guard, never by a floor refusal -- and only
 * within `ticks` ground ticks of a landing (`land`), the freeze it answers being a fall's; it puts the body on a floor at
 * its own level (never off an edge into a fall; so a real wedge whose only way out is downhill or onto a lower stair
 * tread stays wedged, as on main); a body with no penetration is never touched (held by `bridgeWedge.test.ts`: a healthy
 * body's state is identical with it on and off, on open slots and beside steep faces), and a body set inside the walls (a
 * spawn, a test's origin) is left as before.
 * SEGMENT-BODY's reading (research 217 s2.9) supersedes it. `on: false` is main before the hotfix. It acts only on the
 * `'disc'` arm of `WALL_BODY_READING`: on the segment path (every map's walkers, the players' and the bots') the segment
 * body's one-sided hull hits carry the bridge case (research 281 s4.3) -- `move` and `step` consult neither `pushOut`
 * nor `crosses`, so `unwedge` is never asked there. Kept defined, not retired (research 217 s2.10, the merge note).
 */
export const WEDGE_PUSH_OUT_ADAPTATION = { on: true, headings: 16, step: 0.25, ticks: 30 };
/**
 * SEGMENT-BODY (research 217 s2.9; LATER 283, LATER 620): what the body meets walls with. `'segments'` (built): the
 * original's -- the segments `FUN_0054aa30` casts each tick from the feet along the frame displacement `+0xf44`
 * (D:L415157-415166, the controlled body's branch D:L415341-415459, the side lines D:L415549-415577 and D:L415789-415817,
 * prone D:L415582-415621 and D:L415822-415861), each hit only from the front of the polygon's own normal (the hull's
 * one-sided VU0 test, research 281 s4.3), one hit a segment (the nearest, `FUN_002d4cc0`), walkable normals and the
 * flagged materials dropped (D:L413426-413457), and `FUN_005483d0`'s resolution in the list's order (D:L413533-413614)
 * and its look-ahead (D:L413673-413800); the new position the start plus what is left (D:L413918). `'disc'`: the port's
 * disc of the class radius on two level lines before SEGMENT-BODY (`slide`, `crosses`, `pushOut`, `airWalls`), kept as
 * the switch's other arm for measurement. [reading, pending review]
 */
export const WALL_BODY_READING = 'segments' as 'segments' | 'disc';
/**
 * The segments' shape and the resolution's two numbers (`WALL_BODY_READING` 'segments'; research 217 s2.9):
 * `ahead` -- the direction `fStack_10` is the displacement normalised in three axes (the facing, the matrix row +0x20
 * negated, when every component is under `still`, D:L415135-415161) times r x 1.4 (D:L415166); `centre` -- the centre
 * segment reaches 1.1 of it (`uStack_60`, D:L415235), x `backing` (`DAT_0064fce8` 1.75) more while the stance word
 * `+0x174` is stand or crouch and the body-frame velocity's z `+0x34` is over 0.01 -- forward is -z there
 * (`FUN_0057a330` D:L438978-438984 writes `+0x34 = -stick x speed`), so a stand BACKING -- or crouched with it under 0
 * and `+0x21c` bit 2 clear (taken clear) (D:L415354-415371); `sideNear` / `sideFar` -- the side lines from 0.3 r to
 * 1.2 r across the travel turned a quarter (`fStack_20` = (-dz, 0, dx) normalised x r, D:L415171-415220) to `ahead`
 * further; `proneAcross` -- prone, the side lines 0.3 x 1.3 r across, from `ahead` behind to `ahead` ahead
 * (D:L415582-415621); `depth` -- the deepest hit (|the segment's end less the hit point| along the levelled normal,
 * D:L413571-413585) over it puts the body back where the tick began (the displacement zeroed) when prone or the hits
 * number more than `jamHits`, else adds the depth less 1 along that normal (D:L413602-413614).
 */
export const SEGMENT_BODY_READING = {
  ahead: 1.4, centre: 1.1, backing: 1.75, sideNear: 0.3, sideFar: 1.2, proneAcross: 1.3, still: 0.0005, depth: 1, jamHits: 2,
} as const;
/**
 * `FUN_005483d0`'s look-ahead once the move has a hit and no slide speed (`+0x1340` 0, D:L413673-413678): from the feet +
 * `step_height` (`DAT_0044c26c`, prone too) along the resolved displacement normalised, its horizontal length plus
 * `prone` 11.46, or the larger of `stand` 5.25 / `crouch` 10.5 (by the stance word) and the `firepoint` offset dotted
 * with the direction (D:L413686-413711); a steep unflagged hit zeroes the displacement (D:L413712-413756). Then from
 * each hit, `from` 0.1 of the way back to its segment's start (`FUN_00308fc0`, a lerp), along the displacement made
 * `least` 2 long when its horizontal length is under 2 (D:L413758-413800): a steep unflagged hit zeroes it too.
 */
export const SEGMENT_LOOK_AHEAD_READING = { stand: 5.25, crouch: 10.5, prone: 11.46, from: 0.1, least: 2 } as const;
/**
 * The `firepoint`'s offset from the feet `actor+0x14b0` (body frame x, z; +x right, -z forward), research 217 s1.3's
 * table: the M4 on `seal_A_scuba` at each idle's first key, as `CROUCH_GATE_REACH_READING` [reading: the port's pose,
 * not the console's; the pistol and the posed clip not followed]. The look-ahead dots it with the direction, and the
 * head line runs along the facing by 1.1 x its forward part (`HEAD_LINE_MUZZLE_READING`).
 */
export const SEGMENT_FIREPOINT_READING: Readonly<Record<Stance, readonly [number, number]>> = {
  stand: [-2.750, -8.599], crouch: [1.341, -11.438], prone: [-1.728, -14.490],
};
/**
 * The head line's end while `+0x14bc` (the `firepoint` node) is set (D:L415457-415523): when the matrix row +0x20 (the
 * BACK; the facing is it negated) dotted with the direction is under 0 -- the body moving forward -- or the body is
 * still, and the top play's looped bit with `FUN_00286c90(+0x458)` over 0 and the stance word not 5, or prone, or an
 * action 0x11 / 0x13 / 0x19 (the transitions), the end is the start + the row x (the row . 1.1 x `+0x14b0`): along the
 * facing by 1.1 x the muzzle's forward part (9.46 standing, 12.58 crouched, 15.94 prone); else the start +
 * `fStack_10`; the displacement added either way. `'prone-or-transition'` (built, checkpoint 4): the rifle held, the
 * envelope `FUN_00286c90` (a ramp-in / hold / ramp-out weight over `+0x458`, not identified) taken at 0 or under in the
 * locomotion -- so only prone (the stance word 2) or a transition (0x11 / 0x13 / 0x19) takes the muzzle -- on ac's
 * capture of M51 house2's west wall (r0004: standing 6.78 and crouch-walking 9.48 are the centre's, prone 16.04 the
 * muzzle's; research 217 s2.9). `'held'` (checkpoints 1-3): the envelope over 0 on every looped play. `'none'`: the end
 * always `fStack_10`. [reading, pending review: `+0x458` is not identified; owed an RDRAM read of `+0x458` walking]
 */
export const HEAD_LINE_MUZZLE_READING = 'prone-or-transition' as 'prone-or-transition' | 'held' | 'none';
/**
 * The crouched centre's x 1.75 forward wants `+0x21c` bit 2 clear (D:L415356-415358). `'set-while-running'` (built,
 * checkpoint 4): the bit is set while the crouch runs (the stance word crouched, the standing run playing: the port's
 * posture `stand`), clear crouch-walking -- ac's capture of M51 house2's west wall (r0004): crouch-walking 9.48 (the
 * 1.75), the crouch's run 5.85 (none). `'clear'`: never set (checkpoints 1-3). [reading, pending review: the writer of
 * `+0x21c` bit 2 is not read; the run's 5.85 sits 0.7 under the reach plus a 30 Hz move less 1, open with the log's
 * 5.22-5.32 (research 217 s2.9)]
 */
export const CROUCH_RUN_FLAG_READING = 'set-while-running' as 'set-while-running' | 'clear';
/**
 * Prone and turning (`bVar8`: `+0x23c` over 1e-6), a move with a hit is put back where it began (D:L413678-413684);
 * and turning prone (`actor+0x48`) the side lines are swapped for one turned line (D:L415701-415788). `+0x23c` is not
 * identified: 0 (never turning), the two not built. Owed: a read of `+0x23c`'s writer.
 */
export const PRONE_TURN_WORD_PLACEHOLDER = 0;
/**
 * A segment's hit (OT.R97, r0004 the spec; `agent-mail/evidence/segment-body/R0004-SEGMENTS.md` (A), reading, pending
 * review): `'nearest-passing'` (r0004 `FUN_005483d0` 0x54cf30) -- the nearest hit that passes the drop (a normal's y over
 * `max_slope`, a material flagged in bit 0 or 1), none counted when none does; `'nearest-then-drop'` (r0001
 * D:L413409-413457) -- the nearest hit, the segment dropped when it fails. While `FUN_00588030` holds (the knock's falls)
 * r0004 skips the slope drop; the material drop always applies (R0004-SEGMENTS (B)).
 */
export const SEGMENT_HIT_PICK_READING = 'nearest-passing' as 'nearest-passing' | 'nearest-then-drop';
/**
 * PROVEN (a capture of the original running: r0004, ac, 2026-11-04 11:30-11:50Z, `segment-body/jump-near-wall/RESULTS.md`,
 * two identical trials a case): the running jump is NOT refused by the move's stored contact. Run square at M51 g19733's
 * face at full stick and Jump pressed 17.43 from the plane with `+0x10ac` set and CLIMB offered (`+0xed0` 4), the
 * original launched type 8 and carried 64.5 u at 62.3 u/s over the 14-u top -- a standing jump carries nothing; pressed
 * 6.95 out, contact set, type 8 too; the 28-out press (contact clear) and the parallel control, type 8. `'none'`:
 * `Walker.jump` takes the running jump on the speed alone (225 or more squared, D:L440812-440814), as before
 * SEGMENT-BODY. *Was* `JUMP_CONTACT_READING` `'stored-contact'` (now the rejected reading, research 217 s2.9): the r0001
 * decompilation's `FUN_0057e1b0` D:L440815-440819 refuses the launch while `+0x10ac` is set and takes `DAT_003deae8`'s
 * standing jump -- r0001's addresses; on r0004 0x3deae8 holds code (the capture's RDRAM read, `0x00431023`), so the
 * reading is an older build's, which the r0004 capture overrides. The r0004 code agrees (reading): r0004's jump, 0x583490
 * (the desktop recompilation's r0004 output, `sub_00583490_0x583490.cpp`), loads no `+0x10ac` at all, where r0001's
 * (its r0001 output, `sub_0057E1B0_0x57e1b0.cpp`, the load at 0x57e348) does -- the test is deleted (the r0004
 * investigation's G3). Held by `weaponLine.test.ts` (M51, capture-scored; a synthetic twin). R4B-12 (research 385 s1)
 * re-read it natively (R4B.R4): r4 0x583690 compares `|v|^2` with 225 and 0x583694 branches straight to the running jump
 * (0x583760), no load between, in the PINE dump and the served decrypt alike; LATER 614's divergence is r0004's.
 */
export const JUMP_CONTACT_PROVEN = 'none' as 'none' | 'stored-contact';
/**
 * SEGMENT-BODY checkpoint 3: where an airborne body's height comes from. `'altitude'` (built): `FUN_0059b440` adds g dt to
 * the fall speed `+0x133c` and steps the altitude `+0x2e4` by it (D:L456496-456498); `FUN_0059ad30` lands the body when the
 * altitude is under the floor's hit (D:L456313-456322) -- the height is not the resolved displacement's, so the jam,
 * which zeroes `+0xf44..+0xf4c` (D:L413602-413611), stops the move across, not the fall; the records still run along the
 * displacement with the fall in it (`FUN_0054d9a0` D:L416501-416520, research 217 s2.11). `'displacement'`: the height
 * the resolved displacement's y (checkpoints 1 and 2), which held a body falling over a steep face in the air (the sweep's
 * "hung"). [reading, pending review: how the translation's y is taken from `+0x2e4` is not read (D:L459729 copies `+0x20`
 * into it); owed a capture of a SEAL falling past a steep face]
 */
export const AIR_HEIGHT_READING = 'altitude' as 'altitude' | 'displacement';

/** One of the body's segments: its two ends and the line it stands for (0 the low ones, 1 the head line; PB-3b). */
interface BodySegment { a: [number, number, number]; b: [number, number, number]; line: 0 | 1 | 2 }
/**
 * The head node's height over the feet at each stance idle's first key (`MOTION_P.ZAR`, the port's forward kinematics
 * on `seal_A_scuba`'s tree, research 217 s2.2): `seal_stand` 17.394, `seal_crouch` 10.138, `seal_prone` 3.637 (research
 * 180 s1.4's).
 */
const IDLE_HEAD: Readonly<Record<typeof WALL_HEAD_LINE_READING, Readonly<Record<Stance, number>>>> = {
  idle: { stand: 17.394, crouch: 10.138, prone: 3.637 },
};
/** The head line over the head node: + 2 (D:L415443). */
const HEAD_LINE_LIFT = 2;
/** The heights over the feet a wall is met at in `stance`: the low probe, then the head line (PF-16). */
export function wallProbeHeights(stance: Stance): readonly [number, number] {
  return [WALL_PROBE_READING[stance].h, IDLE_HEAD[WALL_HEAD_LINE_READING][stance] + HEAD_LINE_LIFT];
}
/**
 * `FUN_00552ec0`'s prone gate (D:L418935-418940): from stand or crouch, `FUN_0054d620(11.2, 8.0, step_height x 0.5)`
 * (D:L416194-416363) refuses the change when an obstacle meets either of two segments from the feet + `lift` x
 * `step_height` (3.25; D:L416270-416274): `ahead` along the facing (the actor matrix's row +0x20 negated, x 11.2) and
 * `behind` against it (x 8.0; D:L416259-416269), cast together by `FUN_005ab590` (D:L464473). PF-05's second fix
 * round brings it forward from PF-15 (only its prone half). [reading: the segments are turned by the rotation from up
 * to the vector at `actor+0x410` (`FUN_00306d40`, D:L416290), taken as none (level ground); `FUN_005ab590`'s material
 * filter (`DAT_0044f358`) is not transcribed -- the mover's walls (`isWallSurface`) are what it meets.]
 */
export const PRONE_GATE_READING = { ahead: 11.2, behind: 8, lift: 0.5 } as const;
/**
 * `FUN_00552ec0`'s crouch gate (D:L418952-418966; PF-15, research 217 §1): from stand or prone, `FUN_0054d620(ahead,
 * 7.0, step_height x 1.2)` must find no obstacle -- the prone gate's two segments, `ahead` along the facing and 7.0
 * against it, at the feet + 7.8. `ahead` is `|v| x scale` from stand and `|v| + pronePad` from prone (D:L418958-418963),
 * where `|v|` is the horizontal length of `actor+0x14b0` -- the `firepoint`'s offset from the feet, written each tick
 * by `FUN_005df450` -> `FUN_005df930` (D:L493889; the node 0x660410), not a speed (`CROUCH_GATE_REACH_READING`). A
 * remote body asks nothing (`IsRemote`, the controller's vtable +0x34: research 193). [reading: the segments level, the
 * material filter not transcribed, as `PRONE_GATE_READING`'s; a refusal drops the press -- the original keeps the request
 * `actor+0x374` and asks again each tick (`FUN_00552d60` D:L418875), owed: research 217 §1.4]
 */
export const CROUCH_GATE_READING = { scale: 1.2, pronePad: 0.5, behind: 7, lift: 1.2 } as const;
/**
 * The crouch gate's `|v|` (`CROUCH_GATE_READING`): the M4's `firepoint` (research 79 §3: (7.7854, 0.8338, 0) in the
 * rifle's node) as the port poses it on `seal_A_scuba`'s hand (`./heldItem` `muzzleOf`) at the first key of `seal_stand`
 * (9.03 from the feet, level) and of `seal_prone` (14.59) -- the idle the press is taken from, the rifle in hand, both
 * ends one value. [reading: measured on the port's pose, not the console's; the posed clip, the pistol's shorter reach
 * and the other models' are not followed -- owed a capture of `actor+0x14b0` standing and prone, research 217 §1.3]
 */
export const CROUCH_GATE_REACH_READING = { stand: 9.03, prone: 14.59 } as const;

/**
 * The stances. The bands are `motion.rdr`'s (W2.R2); the actor's per-stance speed table at `actor+0x528` is read
 * by stance `actor+0x174` in `FUN_0058bb50` (lateral) and `FUN_0058bc00` (forward/back).
 *
 * - **Stand.** `seal_run` 65, `seal_run_bw` 37, `seal_rstrafe` / `seal_lstrafe` 65. Root **11.484**, measured:
 *   `skel_root` of the five standing actors in the console dump `logs/parity/spawn_pcsx2.rdram` (32 node pointers at
 *   `+0x64`, the CZBodyPart layout, the W2.3 decode). With it `FUN_0029a950`'s ramp is at its top (fVar9 = 10), a
 *   standing look-at target 21.48 over the feet, which is where `dynamics.rdr`'s `cam_*_aim` y 20.5 sits.
 * - **Crouch.** `seal_crouchwalk` 14.8, `_bw` 13.5, `seal_crouchstrafe_right_fast` / `_left` 15. Root **5.504**,
 *   measured: the player at spawn in the same dump is crouched -- its root is under the game's own stance test
 *   `node[0].y < 9.0` (`FUN_00584c60`, research 17 section 8) and its right knee is on the ground at 0.54. Research
 *   17 section 1 called 5.504 "standing idle"; the dump's reading contradicts it (under review: W2.1 and W2.2c settle
 *   it).
 * - **Prone.** `seal_prone_crawl` 11 each way (`motion.rdr` has no backward crawl with a positive `max_velocity`;
 *   `FUN_00583500` plays the crawl at `-|forward|` backing up, the clip reversed), `seal_prone_rstrafe` /
 *   `_lstrafe` 5.5. Root `PRONE_ROOT` 2.168 (555/256). Going prone is gated (`PRONE_GATE_READING`, `FUN_00552ec0`).
 *
 * Each stance meets walls with its size class's probe (`WALL_PROBE_READING`, PF-16) and the head line
 * (`wallProbeHeights`), not a column.
 */
export const STANCE: Readonly<Record<Stance, StanceBody>> = {
  stand: {
    bands: { forward: band('seal_run'), back: band('seal_run_bw'), right: band('seal_rstrafe'), left: band('seal_lstrafe') },
    rootY: 11.484, probe: WALL_PROBE_READING.stand,
  },
  crouch: {
    bands: { forward: band('seal_crouchwalk'), back: band('seal_crouchwalk_bw'), right: band('seal_crouchstrafe_right_fast'), left: band('seal_crouchstrafe_left') },
    rootY: 5.504, probe: WALL_PROBE_READING.crouch,
  },
  prone: {
    bands: { forward: band('seal_prone_crawl'), back: band('seal_prone_crawl'), right: band('seal_prone_rstrafe'), left: band('seal_prone_lstrafe') },
    rootY: PRONE_ROOT, probe: WALL_PROBE_READING.prone,
  },
};

/** A stance's bands, root and wall probe (`STANCE`). */
export function stanceBody(stance: Stance): StanceBody {
  return STANCE[stance];
}

/** The skeleton root's height over the feet in a stance: W2.1's camera stands on `rootY + ramp(rootY)`. */
export function rootY(stance: Stance): number {
  return STANCE[stance].rootY;
}

/** `FUN_00586c10`'s snap: an axis past `at` whose wish jumps faster than `rate` a second takes the wish at once. */
const SNAP = { right: { at: 0.78, rate: 7.8 }, forward: { at: 0.9, rate: 9 } } as const;
/** `FUN_00583350`'s dead zone on the forward axis (`DAT_003f3428`, 0.03 in the ELF's data). */
const FORWARD_DEAD = 0.03;
/** `max_slope` as the game keeps it, a cosine: 0.642788 for 50 degrees (research 17 section 8 `+0x18`). */
const MAX_SLOPE_COS = Math.cos((SEAL_TUNING.maxSlopeDeg * Math.PI) / 180);
/**
 * The grounded step's probe origin over the feet, 5.5 [reading]. `FUN_005b5d40` keeps the highest floor at or under
 * the origin + 1 (`SELECT_ABOVE`), and the origin is the actor's y plus a skeleton bone's translation -- pose-dependent:
 * +5.5 in the PCSX2 spawn image, +4.7 in the recomp's, +11.2 at the skeleton root (socom_pc research 23 section 1.2).
 * The console's +5.5 is the one taken: its window, the feet + 6.5, is `step_height` (`dynamics.rdr` +0x1c,
 * `DAT_0044c26c`), the height of the move solver's segment query over the feet (`FUN_005483d0` D:L413724-413725), so a
 * kerb up to 6.5 with a lower floor still under the line is stepped onto (web research 86 section 6.5; research 101
 * A7). The origin is one per tick (`FUN_005b0840` computes it once, `FUN_005b5d40` selects with it; socom_pc research
 * 23 sections 1.1-1.2), so the spawn (`place`, PL-2), the fall and the airborne sub-step take it too. Ported from
 * Chris's browser-beta-v5 (`step()`'s `stepLift`, which he kept to the step). W2.2c measures it: a SEAL walked at a
 * 6.25 kerb over a lower floor, and one spawned and one landing at such a column, on the console.
 */
export const STEP_PROBE_LIFT_READING = 5.5;

/**
 * r0004's near-vertical floor push [reading] (OT.R97; research 217 section 2.8). r0004's twin of `FUN_0054f330` (r4
 * 0x554180-0x554354) adds, for a standing or crouched body on a floor that slides (steeper than `max_slope`, its extent
 * read, `SLIDE_SPAN_MIN` or more tall): when the slide has not started (`+0x1340` 0, r4 0x554248-0x554258), the floor's
 * `n_y` is under `normalY` (`0x3dcccccd`, r4 0x554260-0x554278) and the actor matrix's third row -- the back axis
 * (research 86 section 3.8) -- has a positive dot with the floor's horizontal normal (r4 0x554280-0x5542a0: the body
 * faces into the face), the carried velocity is zeroed (`+0x1350..+0x1358`, r4 0x5542a4-0x5542d0) and the floor is
 * stored as the contact record `+0x1100` (`FUN_005b0c10`'s twin, r4 0x5b6a60, which in r0004 keeps a face only when it
 * is steeper than `max_slope`). The slide's driver then pushes off that record after `FUN_0054edf0` (D:L416578-416613):
 * `FUN_0054a6d0` (D:L414410-414469) with `distance` (`0x40c00000`, D:L416613) raises the frame's displacement on each
 * axis to the face normal times `distance * (1 - t) * gain` (`gain` 0.7, D:L414448), `t` the moved feet's distance in
 * front of the face's plane over `distance` along the horizontal normal (`FUN_00286db0`, `FUN_00286e20`). A standing
 * body's record is cleared by the tick's own probe (D:L467106-467121, bit 0 from `FUN_0059afd0` D:L456356-456361, or
 * the miss D:L467101), and that probe is taken after the push in the same frame: the driver is slot +0x18
 * (`entity_tick`, D:L145096-145108; its +0x28 call D:L418458 reaches `FUN_0054d9a0`), the move and the probe's queue
 * slot +0x20 (`FUN_005506a0`: `FUN_005483d0` clears bit 0 and calls `FUN_0059afd0`, D:L413942-413945; `FUN_005b0840`),
 * the take slot +0x24 (`FUN_00550570` D:L417771) -- `entity_post_tick` runs every object's +0x20, then every +0x24
 * (D:L145065-145071), after `entity_tick` (D:L50925, D:L50929). So the push is the one tick's, in r0001's frame; r0004's
 * `FUN_005483d0` changed (+113 words) and its bit-0 write is not re-read there: if r0004's record outlived the frame,
 * tick N+1 would push again (t about 0.7, about 1.26 more along the normal) -- owed, a capture settles it (research 217
 * section 2.8). r0001 has none of it: there such a body slides by `n_y` times its
 * speed, about 0.001 a tick, into whatever lies off the face's foot (MP51-FLOOR-TRAP: a hole, so it never moved).
 */
export const STEEP_FLOOR_CONTACT_READING = { normalY: 0.1, distance: 6, gain: 0.7 } as const;

/**
 * `FUN_00586c10`'s snap on one axis (decomp 445037-445050): last tick's value past `at` (0.78 lateral, 0.9 forward) and
 * the wish moving faster than `rate` (7.8, 9) a second -- a full axis let go or thrown across. The axis takes the wish
 * at once, and the game snapshots the pose on screen and cross-fades from it over `STICK_SNAP_BLEND`
 * (`FUN_0028e3e0(actor+0x170)`, then `actor+0x178 = actor+0x17c = 0x3e4ccccd`, 445051-445055): `Walker.stickSnaps`
 * counts them for the animator.
 */
export function throttleSnaps(prev: number, target: number, axis: 'forward' | 'right', dt: number = TICK): boolean {
  const snap = SNAP[axis];
  return Math.abs(prev) > snap.at && Math.abs(target - prev) / dt > snap.rate;
}

/** The cross-fade `FUN_00586c10` starts on a snap, seconds (`0x3e4ccccd`, decomp 445053-445054). */
export const STICK_SNAP_BLEND = 0.2;

/**
 * One tick of `FUN_00586c10` on one stick axis: `prev` is last tick's value, `target` the pad's; the value the
 * mover uses this tick. `forward` takes `lower/upper_z_accel`, `right` `lower/upper_x_accel` (`dynamics.rdr` 2 and
 * 5; the game's x is the actor's lateral, its z the forward).
 */
export function throttleStep(prev: number, target: number, axis: 'forward' | 'right', dt: number = TICK): number {
  const [lo, hi] = axis === 'forward' ? SEAL_TUNING.accelZ : SEAL_TUNING.accelX;
  if (throttleSnaps(prev, target, axis, dt)) return target;
  const rest = (1 - Math.abs(target)) ** 2;
  const limit = lo + (hi - lo) * (1 - (rest * rest) ** 2);
  if (Math.abs(target - prev) / dt <= limit) return target;
  return target > prev ? prev + limit * dt : prev - limit * dt;
}

/**
 * `FUN_00583350` and the blend it sets up: the velocity on the ground plane, (forward, right) in units a second,
 * for the ramped stick in a stance's bands. The forward/back band carries `1 - w` of it, the strafe band `w`, with
 * `w` the stick's angle off straight ahead over 90 degrees, and the sum renormalised by `1 / sqrt(w^2 + (1 - w)^2)`
 * -- so a 45-degree stick in two 65 bands runs at 65 along 45 degrees.
 */
export function locomotion(forward: number, right: number, bands: Bands): { forward: number; right: number } {
  const f = Math.abs(forward) <= FORWARD_DEAD ? 0 : forward;
  const length = Math.hypot(f, right);
  if (length === 0) return { forward: 0, right: 0 };
  const m = Math.min(1, length);
  const w = Math.min(1, Math.max(0, Math.asin(Math.min(1, Math.abs(right) / length)) * (2 / Math.PI)));
  const norm = 1 / Math.hypot(w, 1 - w);
  const along = f === 0 || w >= 1 ? 0 : Math.sign(f) * (1 - w) * m * (f > 0 ? bands.forward : bands.back) * norm;
  const across = Math.abs(right) <= FORWARD_DEAD || w <= 0 ? 0 : Math.sign(right) * w * m * (right > 0 ? bands.right : bands.left) * norm;
  return { forward: along, right: across };
}

/** `FUN_005858a0`'s direction classes (`actor+0x1338`): 0 right, 1 forward, 2 left, 3 back; -1 at rest. */
export type MoveClass = -1 | 0 | 1 | 2 | 3;
/** Where one axis counts as dominant in `FUN_005858a0`: `|a / b| > 0.839`. */
const DOMINANT = 0.839;

/**
 * `FUN_005858a0`: the direction class of a (lateral, forward) stick, `prev` the last one. A dominant axis names it;
 * in the diagonal band between, the quadrant and the last class do, so a stick swept across a diagonal holds its
 * class until the other axis dominates.
 */
export function moveClass(right: number, forward: number, prev: MoveClass): MoveClass {
  if (right === 0 && forward === 0) return -1;
  if (forward !== 0 && Math.abs(right / forward) <= DOMINANT) return forward > 0 ? 1 : 3;
  if (right !== 0 && Math.abs(forward / right) <= DOMINANT) return right > 0 ? 0 : 2;
  if (right > 0 && forward > 0) return prev === 3 || prev === 0 ? 0 : 1;
  if (right < 0 && forward > 0) return prev === 3 || prev === 2 ? 2 : 1;
  if (right < 0 && forward < 0) return prev === 2 || prev === 1 ? 2 : 3;
  return prev === 1 || prev === 0 ? 0 : 3;
}

/** A class's axis as (forward, right) unit components, and its band in a stance. */
function classAxis(c: MoveClass, bands: Bands): { f: number; r: number; band: number } {
  switch (c) {
    case 0: return { f: 0, r: 1, band: bands.right };
    case 1: return { f: 1, r: 0, band: bands.forward };
    case 2: return { f: 0, r: -1, band: bands.left };
    case 3: return { f: -1, r: 0, band: bands.back };
    default: return { f: 0, r: 0, band: 0 };
  }
}

/** `FUN_00586f00`: a stick within 0.03 of rest (`DAT_003f3428`) is idle; no locomotion runs. */
function idle(forward: number, right: number): boolean {
  return Math.abs(right) <= FORWARD_DEAD && Math.abs(forward) <= FORWARD_DEAD;
}

/** `FUN_00584c60`: the crouch runs from this stick magnitude: 12.4 / 14.8 (`153.76 <= |s|^2 x 219.04`). */
const CROUCH_RUN = 12.4 / 14.8;
/** `FUN_00584c60`'s crouch-walk rescale: the stick to 14 / 14.8 of a push, 14.0 a second in `seal_crouchwalk`. */
const CROUCH_WALK = 14 / 14.8;
/**
 * `FUN_0057efe0`'s headroom ray (D:L441190-441245; research 180 §1.5, V1 §8.3): from the hips node (`actor+0x304`,
 * the `CZSealBody` constructor D:L419618-419619, the ELF's `hips` at 0x65c4f8) as posed, + 2 (D:L441218), straight up
 * to the feet + `HEADROOM_TOP`'s by mode. The room has no posed skeleton, so both ends stand the foot on the stance's
 * idle hips (`IDLE_HIPS`): crouched 7.504, prone 4.168 -- a page/room disagreement on a gate is worse than the
 * crouch-walking foot's 11.33 (PF-15, research 217 §1.2). [reading: `'idle'`; the posed foot is owed a capture, a
 * crouch-run under a 12-unit lintel] Retires `HEADROOM_FROM_READING` (14, the crouch column's top).
 */
export const HEADROOM_HIPS_READING = 'idle';
/**
 * The hips' height over the feet in each stance's idle: `seal_stand` 11.484 and `seal_crouch` 5.504 (the dumps' root,
 * research 180 §8.3; the hips sit on the root, 0.0231 / 0.0 off it), `seal_prone` 555/256 = 2.168 (its key 0, disc
 * data). The headroom ray's foot is these + 2 (`HEADROOM_HIPS_READING`).
 */
const IDLE_HIPS: Readonly<Record<typeof HEADROOM_HIPS_READING, Readonly<Record<Stance, number>>>> = {
  idle: { stand: 11.484, crouch: 5.504, prone: 555 / 256 },
};
/** `FUN_0057efe0`'s ray foot over the hips: + 2 (`fStack_c + 2.0`, D:L441218). */
const HEADROOM_FOOT = 2;
/** `FUN_0057efe0`'s ray top over the feet: mode 0 (to stand) 19, mode 1 (prone -> crouch) 12 (D:L441208-441215). */
const HEADROOM_TOP = { stand: 19, crouch: 12 } as const;
/**
 * `FUN_0057f150`'s jump ray (D:L441263-441285; `FUN_0057e1b0` asks it, D:L440799-440804): from the head node
 * (`actor+0x308`) as posed + 1 (D:L441265) straight up 20 more (D:L441271). The room has no posed skeleton, so the head
 * is the stance's idle head (`IDLE_HEAD`, as the head line takes it): `'idle'` [reading: the posed head moves with the
 * clip (research 217 s2.3); owed D13's capture, research 230 s7, a jump under a low roof].
 */
export const JUMP_HEAD_READING = 'idle';
/** `FUN_0057f150`'s ray foot over the head node: + 1 (`fStack_c + 1.0`, D:L441265). */
const JUMP_RAY_FOOT = 1;
/** `FUN_0057f150`'s ray length up from its foot: 20 (`fStack_1c + 20.0`, D:L441271). */
const JUMP_RAY_LENGTH = 20;
/**
 * The engine's material table as `FUN_002d2890` indexes it (`DAT_0044f358`): `FUN_002de4b0`'s two built-ins (`UNKNOWN`
 * with `+0x3c` bit 0 clear, D:L181524; `PARTICLE_SYSTEM` with it set, D:L181549), then `READERC.ZAR/materials.rdr`'s
 * SOILS, whose key `VOLUMETRIC` (the ELF's string at 0x3f3798) sets it (`FUN_002dde40` D:L181403-181405) --
 * `@s2u/scene` `materialTable`, its SOILS checked against the file by the scene's tests.
 */
const CAMERA_CLASS_MATERIALS = materialTable();
/**
 * The surface filter of a segment cast with `DAT_0044d758` = 1 (`FUN_002d2890` D:L174845-174864; its twin
 * `FUN_002d3030` D:L175299-175315): `ditype` bit 1 set and `m_cameratype` bit 1 (word bit 19) clear -- `isCameraSurface`
 * -- and the material entry's `+0x3c` bit 0 (VOLUMETRIC) clear. The entry is the polygon's material byte (word bits
 * 10-17) taken straight into the table, a byte past its end taken as 0 (D:L174856-174861; no `DefaultMaterial` lookup
 * here, unlike `FUN_002dc1d0`), and an empty entry passes.
 */
export function isCameraClassSurface(p: WorldPoly): boolean {
  if (!isCameraSurface(p)) return false;
  const m = p.material & 0xff;
  return !(CAMERA_CLASS_MATERIALS[m < CAMERA_CLASS_MATERIALS.length ? m : 0]?.volumetric ?? false);
}
/**
 * The camera-class cast both of the walk's overhead rays make (PAR-50, research 230 s3.4): `FUN_002d4fd0(1)`, then
 * `FUN_0031e1d0` -> `FUN_002d4780`, each node through `FUN_002d2890` -- its owner gate (`m_active` and `m_hasDI`,
 * D:L174789-174790: `segmentHit`'s `modelGate`, all layers; D16) and `isCameraClassSurface` -- and the hit nearest the
 * start (`FUN_002d4cc0` D:L175904). Clear when nothing is hit, or when that nearest hit's `m_cameratype` is exactly 1
 * (word bits 18-19 == 1: `FUN_0057efe0` D:L441232, `FUN_0057f150` D:L441279).
 */
export function cameraClassClear(grid: Grid, a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  const hit = segmentHit(grid, a, b, isCameraClassSurface);
  return hit === null || ((surfaceWord(hit.poly) >>> 18) & 3) === 1;
}
/** Ticks one `advance` may run: a stalled tab catches up this far and drops the rest (the page caps dt at 0.1 s). */
export const MAX_TICKS = 30;
/** How many times the walls are revisited in one step, for a corner where one push leads into the next wall. */
const WALL_PASSES = 4;

/** What the mover is asked to do each tick: `camera.ts`'s ground-plane wish, from the keys or the touch stick. */
export type WalkInput = GroundWish;

/**
 * What the worker hands the page for the walk: the probe's polygon set (`worldCollision`, 3,318 on Frostfire,
 * research 24 section 1.1), its nodes (`collisionOwners`: the probe's per-model unit and the gate's flags) and the
 * map's `grid_params`. The polygons travel packed in two typed arrays the worker transfers: as objects, Guidance's
 * 18,464 took 44 ms to clone (measured 2026-09-28), part of it on the page's thread at every map load.
 */
export interface GroundData {
  grid: GridParams;
  owners: CollisionOwner[];
  /** Every polygon's points, xyz, polygon after polygon in `worldCollision` order. */
  points: Float32Array;
  /** Per polygon, `GROUND_FIELDS` words: ptcount, ditype, material, cameratype, region, appflags. */
  fields: Uint32Array;
}
/** TRAVERSAL SEAM (web research 86): the sixth word is `m_appflags`, which marks the ladders (`./traversal`). */
const GROUND_FIELDS = 6;

/** Packs a map's hull for the trip from the worker (`GroundData`). */
export function packGround(grid: GridParams, polys: readonly WorldPoly[], owners: CollisionOwner[]): GroundData {
  let floats = 0;
  for (const p of polys) floats += p.points.length;
  const points = new Float32Array(floats);
  const fields = new Uint32Array(polys.length * GROUND_FIELDS);
  let at = 0;
  polys.forEach((p, i) => {
    points.set(p.points, at);
    at += p.points.length;
    // AUDIO (socomlegacy/docs/research/81 §9): the sixth word also carries m_inside (bit 3) and the reverb zone (bit 4).
    const flags = (p.appflags ?? 0) | ((p.inside ?? 0) << 3) | ((p.reverbZone ?? 0) << 4);
    fields.set([p.ptcount, p.ditype, p.material, p.cameratype, p.region >>> 0, flags], i * GROUND_FIELDS);
  });
  return { grid, owners, points, fields };
}

/**
 * The polygons back out of a `GroundData`, their points views on its buffer, named by the node that owns them. LATER 142:
 * each carries its owner's frame when it has one (`CollisionOwner.frame`, a tilted node's; the climb's column and cut,
 * `./climb` `contactOf`) -- by reference, the owners being what the worker sends and `forkGround` copies.
 */
export function groundPolygons(ground: GroundData): WorldPoly[] {
  const count = ground.fields.length / GROUND_FIELDS;
  const owner: (CollisionOwner | undefined)[] = new Array(count);
  for (const o of ground.owners) for (let i = o.first; i < Math.min(count, o.first + o.count); i++) owner[i] = o;
  const out: WorldPoly[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const f = i * GROUND_FIELDS, ptcount = ground.fields[f]!, frame = owner[i]?.frame;
    out.push({
      modelName: owner[i]?.modelName ?? 'worldmodel', path: owner[i]?.path ?? '',
      ptcount, ditype: ground.fields[f + 1]!, material: ground.fields[f + 2]!, cameratype: ground.fields[f + 3]!,
      region: ground.fields[f + 4]!, appflags: ground.fields[f + 5]! & 7,
      inside: (ground.fields[f + 5]! >> 3) & 1, reverbZone: (ground.fields[f + 5]! >> 4) & 1, points: ground.points.subarray(at, at + ptcount * 3),
      ...(frame ? { frame } : {}),
    });
    at += ptcount * 3;
  }
  return out;
}

/** The grid the probe walks, from what the worker sent: only the collision is linked, which is all it reads. */
export function groundGrid(ground: GroundData): Grid {
  return buildGrid(ground.grid, [], [], groundPolygons(ground), ground.owners);
}

/**
 * The mover's state: feet position, look (degrees, as `Pose`), velocity (units a second; `vy` only while airborne),
 * and the ramped stick (`FUN_00586c10`'s `actor+0x248/0x24c`: last tick's forward and lateral).
 */
export interface WalkState {
  x: number; y: number; z: number; yaw: number; pitch: number; vx: number; vz: number; vy: number;
  stickForward: number; stickRight: number;
}

/**
 * The last landing: its class against the table's landing rates, the vertical speed at contact (units a second,
 * downward), and the seconds from leaving the floor to the contact.
 */
export interface Landing {
  kind: LandingKind; speed: number; airTime: number;
  /** The clip the game plays for it (`FUN_005af590`), or null: the run goes on. */
  clip: 'land' | 'landHard' | 'hit' | 'hitStomach' | 'landDeath' | 'landBackwards' | null;
  /** `FUN_005ac1f0`'s class (`landingClass`): 0 none, 1 light, 2 heavy, 3 death -- the audio's landing sounds. */
  cls: 0 | 1 | 2 | 3;
  /**
   * BLAST KNOCK: the landing of `Fall forward` / `Fall backwards` (`FUN_00580360`), which the fall's damage reads at
   * `speed` x 1.2 (`./net/damage` `KNOCK_LANDING_SPEED_FACTOR`, L441929; research 151 §3.4). The class and the clip
   * here are the mover's own, at the contact speed.
   */
  knocked: boolean;
}

/** What the hook reports of the mover: in the air, crouched (the posture), the stance, and the last landing. */
export interface MoverState { airborne: boolean; crouched: boolean; stance: Stance; landing: Landing | null }

/**
 * The mover as the body and its clips read it each frame (`./animator`'s `MoverSnapshot` and where to stand): the
 * drawn feet, the look, the velocity, the posture, the last landing's class, and the jumps taken.
 */
export interface PlaySnapshot {
  feet: [number, number, number];
  /**
   * PRONE-TILT (`./rootTilt`, research 217 s7): the skeleton root's quaternion `FUN_00548090` wrote on the tick
   * (`Walker.rootTilt`), null when it wrote none (the clip's root stands). Absent: none (a remote body's snapshot off
   * the wire; the page's copy runs the rule from its own floor, `./remotePlayers`).
   */
  rootTilt?: TiltQuat | null;
  /**
   * MISSION R8: the feet the page's body is drawn at (`Walker.drawnFeet`; in the air the height between game frames),
   * set by the page's `WalkMode.snapshot` only. `feet` is the simulated height every start point reads (a throw, a
   * muzzle, anything the room receives); absent (the room's bodies), the body is drawn at `feet`.
   */
  drawnFeet?: [number, number, number];
  yaw: number; pitch: number;
  vx: number; vz: number; vy: number;
  airborne: boolean; crouched: boolean; stance: Stance;
  /**
   * OBF-23 (research 85 §4.2): the stance state (`actor+0x174`, `Walker.stance`), present only where it differs from the
   * drawn posture `stance` -- the crouch-run, the crouched state on the standing run's body (`FUN_00584c60`
   * D:L444145-444192 pushes the run with `+0x174` left at 1). What the throw reads (`GetThrowAnim` D:L441773, the
   * clearance D:L414024, the hand-open's reach D:L477069): `./throwCommit` `releaseStance`.
   */
  stanceState?: Stance;
  landing: LandingKind | null;
  jumps: number;
  /** The ground state and its stick (`GroundMotion`): what the locomotion clips play by. */
  ground: GroundMotion;
  /** `Walker.stickSnaps`: a change starts the snap's 0.2 s cross-fade (`FUN_00586c10`); over the wire its low bit. */
  stickSnaps?: number;
  /** The action holding the mover, or null. */
  action: MoverAction | null;
  /** The upper-body overlay over the locomotion (the moving swap), or null. */
  overlay?: MoverOverlay | null;
  /**
   * The kit's one-shot holding the mover (`Walker.holding`'s clip: a throw, a placing, a still reload), for the others'
   * bodies (`./net/body`: the hold code in `BodyState.flags`; research 85 s8.1). Absent when none holds it.
   */
  hold?: HoldClip | null;
  /**
   * `Walker.holdStarts` while a hold is on (absent with none): the next hold on the same clip is told apart by it (over the
   * wire its low bit, `BodyFlag.HoldSerial`), so the others play a second throw that follows the first with no gap.
   */
  holdSerial?: number;
  /** The look's turn over the last frame, radians a second, left positive: what turns the prone body in place. */
  turnRate: number;
  /** TRAVERSAL SEAM: the traversal move's clip, or null (`./animator` `MoverSnapshot.traversal`). */
  traversal?: TraversalPose | null;
  /**
   * TRAVERSAL SEAM: the peek held (state 3, `seal+0x375`: -1 left, 1 right; 0 none) -- `GetThrowAnim` takes the lean's
   * toss from it (web research 86 section 4.4; `./grenade`).
   */
  peek?: -1 | 0 | 1;
  /**
   * TRAVERSAL SEAM (PF-20): the peek's lean clip playing (`TraversalHooks.leanClipOn`), present only when true --
   * `GetThrowAnim` (D:L441773-441796) throws the lean's toss from state 3 with it (`./grenade`).
   */
  leanClip?: true;
  /**
   * PAR-62: the tick landed (`Walker.cutAsked` false on it), present only then: the layer asks no cut. The name is PAR-62's,
   * when only a landing with no clip set it; since PAR-66 a landing that plays a clip sets it too (research 230 s5.2.2).
   */
  landedBare?: true;
  /**
   * PAR-64: the move axes the stick's cut read on the tick (`Walker.cutStick`), set by `moverSnapshot`; a remote body's
   * snapshot off the wire (`./net/body` `snapshotOf`) carries its replicated ground stick in its place (no pad copy is on
   * the wire; PAR-64's review F2).
   */
  cutStick?: { forward: number; right: number };
}

/** The table's jump and landing fields (`./physics`): `jump_factor`, `gravity` and the landing rates. */
const JUMP_TABLE = sealTuning(null);

/** TRAVERSAL SEAM: what `Walker.driver` is (`./traversal`'s `Traversal`). */
export interface TickDriver {
  tick(walker: Walker, input: WalkInput, dt: number): boolean;
  /** The stick's factor this tick (web research 86 section 5: the water's `FUN_005b56c0`), 1 when absent. */
  stickFactor?(walker: Walker): number;
  /**
   * The stick as `FUN_005b56c0` leaves it (web research 86 section 5.3): each axis by the ground's slope factor, then
   * the water's; unchanged when absent.
   */
  stickScale?(walker: Walker, forward: number, right: number): [number, number];
  /**
   * The stance a press for `stance` actually goes to (web research 86 section 5.4: the water's `FUN_00581660` /
   * `FUN_00581990` -- prone over 2 deep crouches, crouch over 8.5 deep stands), `stance` when absent.
   */
  stanceFor?(walker: Walker, stance: Stance): Stance;
  /**
   * Whether the driver's own clip is the stack's top, a one-shot (`Walker.jump`'s looped test, `FUN_0057e1b0`): the
   * peek's lean clip (`./traversal` `leanTick`; `FUN_0057d810` pushes it, 440451-440530, held on its last key and not
   * looped in `motion.rdr`, research 86 section 1). False when absent.
   */
  topOneShot?(walker: Walker): boolean;
  /**
   * Round 3 of NET-FIX2's review (web research 223 s6): whether the driver has the walker's tick now -- a move, the
   * dive, the peek -- without running it: `Walker.elapse` then runs no clock, as `step60` runs none when `tick` takes
   * the tick. False when absent.
   */
  owns?(walker: Walker): boolean;
}

/**
 * TRAVERSAL SEAM (web research 86): what `WalkMode` asks of the traversal moves (`./traversal`'s `Traversal`, made by
 * the factory `main.ts` hands `WalkMode.useTraversal`, so this file imports none of it): the tick, the clip for the
 * animator, the root the camera stands on, the yaw a move holds, the peek, the action and lean buttons, and a reset.
 */
export interface TraversalHooks extends TickDriver {
  /** LATER 492: what the water allows the local stance press now (`Traversal.stanceAllows`); absent, no water known. */
  stanceAllows?(walker: Walker): { crouch: boolean; prone: boolean };
  pose(): TraversalPose | null;
  rootY(): number | null;
  yaw(): number | null;
  /** The camera's peek value `DAT_004161c0`, -1 left .. 1 right (`./playerCamera` `peekShift`). */
  peek(): number;
  /** The peek held (state 3): -1 left, 1 right, 0 none -- the body's lean, not the camera's eased value. */
  peeking(): -1 | 0 | 1;
  /** PF-20: the peek's lean clip pushed and playing (`FUN_0057d810`), for `GetThrowAnim`'s toss; false when absent. */
  leanClipOn?(): boolean;
  action(): void;
  lean(side: -1 | 0 | 1): void;
  reset(walker?: Walker): void;
  /** Whether a move holds the mover (a ladder, a climb, a hang): no jump and no stance change then. */
  busy(): boolean;
  /** The jump while busy (hanging: let go); true when it did something. */
  jump(walker: Walker): boolean;
  /** The dive (`FUN_0057e540`) in place of a go-prone from a run; true when it dived. */
  dive(walker: Walker): boolean;
  /** OT.R67: whether a go-prone now would be the dive (`dive`'s own test, `FUN_00584b00`); absent, never. */
  canDive?(walker: Walker): boolean;
  /** OT.R67: a dive under way; absent, none. */
  inDive?(): boolean;
  /**
   * OT.R67 (`PRONE_POP_ADAPTATION`, `./stanceButton` `popStance`): the prone-pop out of the dive under way -- `'dive'`
   * stood, `'refused'` nothing changed, null no dive. Absent: none.
   */
  cancelDive?(walker: Walker): PopOutcome;
  /**
   * A stance button while busy (hanging: stand climbs, crouch or prone let go) or peeking (PF-20: the peek ends, no
   * transition, the stance kept); true when it did something.
   */
  stanceButton(walker: Walker, stance: Stance): boolean;
  /**
   * PF-17 (`./net/fireCapability`, research 218 s1): the move's clip as the fire's gate reads it -- its name, its phase
   * (the key's fraction; a loop's within its cycle) and whether it plays backwards -- and whether the move is an actor
   * state `FUN_005a7de0` refuses outright (D:L462612: only 0, 1, 2, 3 and 6 fire; `NOFIRE_STATE_READING`). Null when
   * no move's clip plays. Absent: the moves give the gate nothing.
   */
  clip?(): { clip: string; phase: number; reversed: boolean; stateRefused: boolean } | null;
  /**
   * NU-1b B7 (research 313 sections 4 and 8.1; `CLIMB_HIT_CANCELS_READING`): a non-lethal flinch taken over a running
   * climb pops it first (`FUN_005a2690` D:L460011-460019); true when a climb was popped. Absent: nothing popped.
   */
  flinchPop?(walker: Walker): boolean;
  /**
   * LATER 526: the moves' whole state as it stands, kept by a take that pops it (`./walk` `WalkMode.mountTake`) for the
   * room's refusal of that take to lay back (`restore`). Absent: none kept, none laid back.
   */
  keep?(): TraversalKept;
  /** LATER 526: the state `keep` kept laid back on these moves (nothing is heard: the move is put back, not begun). */
  restore?(kept: TraversalKept): void;
}

/** LATER 526: the moves' state as `TraversalHooks.keep` kept it (opaque: only `restore` reads it). */
export type TraversalKept = { readonly __traversalKept: unique symbol };

/**
 * `FUN_0057e1b0`: a take-off at this speed or more (`225 <= |v|^2`, the local velocity) is the running jump. The velocity
 * is the clip's, `+0x2c..+0x34` (D:L440812-440814; r0004 0x583668-0x583694), which `FUN_0057a330` writes from the top
 * clip's root velocity (D:L438908-438985) and the walls never cut (`FUN_005483d0` cuts only `+0xf44` and `+0x1350`,
 * D:L413533-413597): `Walker.jump` reads the tick's velocity before the walls (`bodyVelocity_`). Proven by ac's r0004
 * ditch capture (agent-mail/evidence/eph-hunt-2026-11-01/segment-body/ditch-capture/RESULTS.md, 2026-11-04): blocked,
 * the body moving 0.00 a second against a clip velocity of 65, every press gave the running jump (type 8), never the
 * standing jump (178). LATER 676.
 */
export const RUNNING_JUMP_SPEED = 15;
/**
 * LATER 676's slide case (research 86 s3.8; a reading): on a sliding floor the port's tick velocity is the slide's
 * displacement (`slideOrMove`), the clip's root velocity is not. `'clip'` (built): the jump's speed test reads the
 * tick's velocity before the slide replaced it -- the stick's, so a body sliding with the stick idle stands to jump.
 * `'slide'`: it reads the slide's displacement velocity, so a slide over 15 a second launches (the port before the fix).
 * Unread: whether the slide clip `FUN_0054f330` plays (research 201 s3) carries a root velocity into `+0x2c`. Settled by
 * a read of the slide clip's root channel, or an r0004 capture of `+0x2c..+0x34` on a steep slide with the stick idle.
 * Unreachable on the disc's surfaces today (`steepSlide.test.ts`): they slide only steeper than `max_slope`
 * (`SLIDE_DISC_SURFACE_KIND` 4), where the jump's slope test (`+0x1348`) refuses first; only a kind-0 floor would ask it.
 */
export const JUMP_SPEED_SLIDE_READING = 'clip' as 'clip' | 'slide';
/** `FUN_0057e1b0` -> `FUN_005af930`: the running jump's impulse lands in the fall speed this long after the take-off (`actor+0x1360 = 0x3dcccccd`). */
export const JUMP_DELAY = 0.1;
/** `actor+0x135c = 0x3ecccccd`: no jump this long after a running jump's take-off, or after any landing (`FUN_005af930`). */
export const JUMP_LOCK = 0.4;
/** `FUN_0054d9a0`: the carried velocity runs down by this many units a second, each second, through a landing clip. */
export const CARRY_DECAY = 150;
/** `FUN_005af590`: the soft landing's speed, units a second (`|actor+0x38|^2 <= 400`); the stick at rest also gives it. */
export const LAND_STILL = 20;
/** `FUN_005817d0` / `FUN_00581c10`: a stance change at more than this (`speed^2 > 100`) runs on without a transition clip. */
export const STANCE_MOVING = 10;
/**
 * MOVE-2 C1a (B196; OT.R93, SEPARATE only; research 80 section 6g; reading, backed by a capture comparison): the speed
 * test `FUN_00581c10` (D:L442633-442637) and `FUN_005817d0` (D:L442495-442511) make on a stand <-> crouch press reads the
 * actor's `+0x2c`, the top clip's 3D root velocity -- its vertical part counts. Under a held stance transition the
 * port's root keys carry no y, so the test is taken as passed there: ac's r0004 capture of C1a
 * (eph-hunt-2026-11-01/rerun-sep-pop/RESULTS.md, C1a early and late) logs |+0x2c|^2 of 115-141 at the cancel, past the
 * 100, while the horizontal root speed is about 7 u/s, and the original cuts to the standing idle (type 2, the cut
 * clip's time copied) instead of playing 0x11 reversed. Owed: the clips' root y in the port's keys, to test it frame by
 * frame (the clip's first and last frames are not captured).
 */
export const STANCE_CANCEL_CLIP_SPEED_READING = 'clip root 3D over 10 under a held transition' as const;

/**
 * The running jump's impulse, units a second up: `actor+0x1364 = jump_factor x gravity x -0.4` (`FUN_0057e1b0`, decomp
 * 440830), the fall speed `FUN_005af930` writes 0.1 s after the take-off -- 0.85 x 235 x 0.4 = 79.9.
 */
export function runningJumpSpeed(t: { jump_factor: number; gravity: number } = JUMP_TABLE): number {
  return t.jump_factor * t.gravity * 0.4;
}

/**
 * The clips the mover waits on -- the standing jump, the landings, the heavy fall's hits, the deadly fall and the
 * three stance transitions -- as `motion.rdr`'s `playback` and `NoInterrupt` and `MOTION_P.ZAR`'s key count and root
 * travel (x, z over keys 0 to n - 1): transcribed (W2.R5), pinned against both files by the fixture test.
 *
 * `noInterrupt` is the phase past which the stick cuts the clip (`FUN_00587c20`, decomp 445514-445576: an entry's
 * `NoInterrupt`, 0 when absent and 1 when bare -- never). SEP-POP (OT.R93): the three stance transitions carry their
 * entries' own too (`seal_stand2crouch` and `seal_crouch2prone` absent, `seal_stand2prone` 0.9). The same function
 * refuses actions 17, 19 and 25 by id when the controller's slot `+0x30` answers (D:L445536-445545) -- and `+0x30` is
 * `IsAi`: the player's `CSealCtrl` (vtable 0x6694b0) holds 0x5499d0, which answers 0, the AI's `CSealCtrlAi` (0x6693f0)
 * 0x575c40, which answers 1 (research 191 section 4, STRONG). *Was* (to 2026-10-31): read as the player's, so the port
 * held the three whole for every SEAL. The refusal is now the walker's (`Walker.stanceCut` off: the bots; COMBINED's
 * player cuts too since COMBINED-CUT, OT.R93), not this table's.
 */
export const ACTION_CLIPS = Object.freeze({
  jump: { playback: 1.1, frames: 20, noInterrupt: 0.7, travel: [0, 0] },
  launch: { playback: 2.4, frames: 25, noInterrupt: 1, travel: [0, 0] },
  land: { playback: 0.7, frames: 20, noInterrupt: 0, travel: [0.19, -2.09] },
  landHard: { playback: 1, frames: 20, noInterrupt: 0.35, travel: [0.19, -2.09] },
  standToCrouch: { playback: 0.65, frames: 27, noInterrupt: 0, travel: [-1.2, 1.27] },
  crouchToProne: { playback: 0.9, frames: 33, noInterrupt: 0, travel: [0.99, -8.39] },
  standToProne: { playback: 1, frames: 36, noInterrupt: 0.9, travel: [-1.59, -3.41] },
  hit: { playback: 3.7, frames: 22, noInterrupt: 0.8, travel: [0.48, -16.63] },
  hitStomach: { playback: 2.9, frames: 32, noInterrupt: 0.8, travel: [0.63, 6.79] },
  landDeath: { playback: 0.4, frames: 11, noInterrupt: 1, travel: [0.05, -0.72] },
  getUp: { playback: 2, frames: 27, noInterrupt: 0.8, travel: [-1.79, -1.1] },
  // The rifle <-> pistol swap's full-body clips (`FUN_005a64c0`): `NoInterrupt ()`, but the standing one gives way to the
  // stick all the same (`FUN_00550ef0` 418183: action 0x35 is tested whatever `FUN_00587c20` says).
  swapStand: { playback: 1.32, frames: 32, noInterrupt: 1, travel: [0, 0] },
  swapCrouch: { playback: 1, frames: 23, noInterrupt: 1, travel: [0, 0] },
  swapProne: { playback: 1.8, frames: 38, noInterrupt: 1, travel: [0, 0] },
  // BLAST KNOCK (`./net/blast`): `Fall forward` / `Fall backwards` in the air, `Land backwards`, `Get up backwards`
  // (`motion.rdr` playback and NoInterrupt, `MOTION_P.ZAR` keys and root travel; `Land forward` is `landDeath`).
  fallForward: { playback: 2, frames: 15, noInterrupt: 1, travel: [0, 0] },
  fallBackwards: { playback: 2, frames: 16, noInterrupt: 1, travel: [0, 0] },
  landBackwards: { playback: 0.4, frames: 12, noInterrupt: 1, travel: [-0.24, 4.58] },
  getUpBackwards: { playback: 2, frames: 13, noInterrupt: 0.8, travel: [1.21, -6.95] },
  // PF-19 (`./net/blast`, research 218 s3, 179 s11.9): `Prone cover` (`guard_prone_cover`), the knock's reaction on a
  // living prone SEAL (`FUN_0057e770` D:L441018-441020): `motion.rdr` playback 4.3, `NoInterrupt ()` bare (never cut by
  // the stick), `NoFire ()` bare; `MOTION_P.ZAR` 16 keys and its root's travel (-0.016, 0.078: in place) -- 3.78 s by
  // `oneShotSeconds`. No push: only the clip's own root moves the body.
  proneCover: { playback: 4.3, frames: 16, noInterrupt: 1, travel: [-0.02, 0.08] },
  // PAR-84 (research 230 section 5.2.10): the launcher's raise, `Rifle -> Launcher` (`seal_rifle2launcher`) from the rifle
  // and `Pistol -> Launcher` (`seal_pistol2launcher`) from the pistol (`FUN_005a6d30` D:L462112-462116), and the still
  // lower, the same clip reversed (`FUN_005a6b70` D:L462069-462070, D:L462078-462079): `motion.rdr` playback 1.5,
  // `NoInterrupt ()` bare (never cut by the stick), looped 0, no `BlendOverlay` (a full-body one-shot on the stack);
  // `MOTION_P.ZAR` 35 and 24 keys and the root's travel over keys 0 to n - 1 (`roomStillReloadJump.test.ts`, "PAR-84").
  rifleToLauncher: { playback: 1.5, frames: 35, noInterrupt: 1, travel: [-0.98, 2.8] },
  pistolToLauncher: { playback: 1.5, frames: 24, noInterrupt: 1, travel: [-1, 2.81] },
  // NU-5 X1 and research 324 P2 (research 323 §1.5; research 211's table): `Swap rifle` (`DAT_003dec78`,
  // `seal_swaprifle`), the pick-up's clip -- `motion.rdr` playback 1.1, `NoInterrupt ()` and `NoFire ()` bare,
  // NoPitchtwist, no `BlendOverlay` (a full-body one-shot on the stack); `MOTION_P.ZAR` 31 keys and its root's travel
  // (0.117, 0.051) -- read through the repository's readers (`roomPickups.test.ts` "NU-5 the Swap rifle clip"). Two
  // names, one clip: the exchange's (`FUN_00588bc0` D:L458209-458211, the taker's own console only) and the launcher
  // claim's (D:L458199-458206, every console), so another page can draw the one and not the other (`ACTION_CODES`).
  swapRifleExchange: { playback: 1.1, frames: 31, noInterrupt: 1, travel: [0.12, 0.05] },
  swapRifleClaim: { playback: 1.1, frames: 31, noInterrupt: 1, travel: [0.12, 0.05] },
} as const);

/**
 * MOVE-1 (B196; OT.R93, SEPARATE only; research 80 section 6g; reading, pending review): while action 0x13
 * (`crouchToProne`) is current, the body tick `FUN_0054d9a0` (r0001 D:L416435-416455; r0004 twin 0x552790, the same
 * code at 0x552800-0x5528b8) replaces the top play's vector with (0, 0, +8 / T), -8 / T under the node's flag 0x20 (the
 * reverse flag: `FUN_0028c160` sets it, D:L134094), and adds it to the velocity `+0x2c`; T is the clip's `anim+0x10`
 * (its `playback`) times `FUN_0028ada0`'s (n - 1) / n (D:L133349-133366; r0004 0x28c130) -- 0.8727 s, not the port's
 * one-shot length `ACTION_SECONDS` (playback x ((n - 1) / n)^2, 0.8463 s). Over the port's clip that is 7.76 units of
 * local z (behind) against the clip's own -8.39: the drop and the pop move about 1.17 u -- just outside the capture's
 * 0.9-1.1 u on r0004 (eph-hunt rerun-sep-pop), recorded, not tuned (review F1). Named a reading for one inference:
 * `+0x2c` already holds the clip's root when the vector is added. Owed: a PINE trace of `+0x2c..+0x34` and the top
 * node's +0..+8 through a drop and a pop.
 */
export const CROUCH_PRONE_PUSH_READING = 8;

/**
 * The movement locks (the owner, 2026-09-29: "SOCOM should lock your movement when throwing a grenade or planting
 * certain equipment"): the one-shots the kit pushes on the actor's action stack (`FUN_00588bc0`), by clip. The rule:
 *
 * - **What locks.** A throw (`FUN_005802b0` pushes `GetThrowAnim`'s clip at the release of the button, decomp
 *   441900-441903), the claymore's placing (`Place claymore`, `seal_place_claymore`), and a reload started still
 *   crouched (`|v|^2 <= 400`) or prone (`FUN_005a82e0` 462786-462930: `Rifle crouch reload` / `Rifle prone reload`, the
 *   pistol's `Pistol ...`). None is a `BlendOverlay` motion, so each goes on the stack itself, not on the second
 *   channel over the locomotion; with a non-looped entry on top `FUN_00550ef0` does not run the ground state
 *   (418172-418246: `FUN_005870e0` only when the entry is cut), so the SEAL moves by the clip's root alone
 *   (`FUN_0028c250`): not at all on a throw (one root key), 0.4 over the claymore's 2.4 s.
 * - **A full lock, not a slow-down; the turn stays free.** The move axes are not scaled, they are not read; the turn
 *   (`actor+0x23c`) is zeroed only for a clip flagged `NoTurn` (`FUN_00587e00` at 418689-418692), and none of these is.
 * - **When it ends.** When a move axis or the turn passes 0.1 once the clip's phase is past its `NoInterrupt`
 *   (`FUN_00587c20` 445514-445576 with the stick test at 418180-418190), or at the clip's end. Every throw's release
 *   comes before its `NoInterrupt` (0.46 / 0.49 standing, the toss 0.69 / 0.75, crouched 0.70 / 0.8, prone 0.66 and
 *   0.56 / 0.9, the peeks' 0.55 and 0.87 / 0.9), so the grenade is always out first; the claymore is down at 1.3 s, its
 *   `NoInterrupt` 0.9 is 2.39 s.
 * - **What does not lock.** Holding the throw (the power's chase, `FUN_00594cf0` 0x595ea0-0x595f28: nothing there
 *   touches the move axes); the standing reload (`seal_reload` has no `NoInterrupt`: the first push cuts it, and
 *   `FUN_00550ef0` 418202-418214 carries it on as `Moving rifle reload`, the upper body's); a reload started moving
 *   (that overlay from the start); the Detonator (`CZKit_DetonateRemoteExplosives` plays no SEAL clip); a door (the
 *   action runs the door's zAnim, `FUN_002b44e0` from `FUN_00592d50` 452017-452018, which moves the leaf, not the SEAL).
 *
 * Each as `motion.rdr`'s `playback` and `NoInterrupt` and `MOTION_P.ZAR`'s key count and root travel, pinned against
 * both by `test/moverHold.test.ts`. `still`: only started at 20 a second or under (`FUN_005a82e0`'s `bVar3`).
 */
export const HOLD_CLIPS = Object.freeze({
  seal_throwgrenade: { playback: 1.6, frames: 28, noInterrupt: 0.49, travel: [0, 0], still: false },
  seal_tossgrenade: { playback: 1.6, frames: 30, noInterrupt: 0.75, travel: [0, 0], still: false },
  seal_crouch_throwgrenade: { playback: 1.1, frames: 19, noInterrupt: 0.8, travel: [0, 0], still: false },
  seal_prone_throwgrenade: { playback: 1.6, frames: 27, noInterrupt: 0.9, travel: [0, 0], still: false },
  seal_prone_tossgrenade: { playback: 1.1, frames: 27, noInterrupt: 0.9, travel: [0, 0], still: false },
  seal_toss_rlean: { playback: 1.25, frames: 35, noInterrupt: 0.9, travel: [0, 0], still: false },
  seal_toss_llean: { playback: 1.2, frames: 28, noInterrupt: 0.9, travel: [0, 0], still: false },
  seal_place_claymore: { playback: 2.7, frames: 55, noInterrupt: 0.9, travel: [-0.36, 0.23], still: false },
  seal_crouch_reload: { playback: 1.9, frames: 28, noInterrupt: 0.35, travel: [0.28, -0.19], still: true },
  seal_p_crouch_reload: { playback: 1.7, frames: 29, noInterrupt: 0.35, travel: [0.02, 0.04], still: true },
  seal_prone_reload: { playback: 1.7, frames: 30, noInterrupt: 0.5, travel: [-0.03, 0.01], still: false },
  seal_p_prone_reload: { playback: 1.7, frames: 31, noInterrupt: 0.5, travel: [0.02, -0.01], still: false },
  // Appended (the equipment's hand pass, research 85 s8.1) -- every earlier code keeps its number on the wire. C4's plant,
  // `Put on wall` (`FUN_005be9a0` -0x69, D:L475420; `NoInterrupt ()` bare: never cut), its root's 1.8 along z; the
  // pistol's toss (`FUN_0058c820`'s pair, D:L494750: its own playback 2.0 and NoInterrupt 0.8); the pistol's plant (no
  // root track: in place). The pistol's other throws and its claymore keep their rifle type's code: the same playback,
  // keys, NoInterrupt and travel on the disc. With these the four bits of `HOLD_SHIFT` are full (15 codes).
  seal_put_onwall: { playback: 2.5, frames: 42, noInterrupt: 1, travel: [-0.04, 1.8], still: false },
  seal_p_tossgrenade: { playback: 2, frames: 30, noInterrupt: 0.8, travel: [0, 0], still: false },
  seal_p_put_onwall: { playback: 2.5, frames: 42, noInterrupt: 1, travel: [0, 0], still: false },
} as const);
export type HoldClip = keyof typeof HOLD_CLIPS;

/** The holds in a fixed order: the wire sends a hold as its index here plus 1 (`./net/protocol` `holdBits`). */
export const HOLD_CODES: readonly HoldClip[] = Object.freeze(Object.keys(HOLD_CLIPS) as HoldClip[]);

/** How long each runs if nothing cuts it: the one-shot's run to its last key (`oneShotSeconds`, `FUN_0028c4f0`). */
export const HOLD_SECONDS: Readonly<Record<HoldClip, number>> = Object.freeze(Object.fromEntries(
  Object.entries(HOLD_CLIPS).map(([k, c]) => [k, oneShotSeconds(c.playback, c.frames)]),
) as Record<HoldClip, number>);

/** Whether a clip name is one of the holds. */
export const isHoldClip = (clip: string): clip is HoldClip => Object.prototype.hasOwnProperty.call(HOLD_CLIPS, clip);

/**
 * The reload's clip that holds the mover (`FUN_005a82e0`, decomp 462786-462930), or null: crouched `Rifle crouch
 * reload` / `Pistol crouch reload`, prone `Rifle prone reload` / `Pistol prone reload`; standing none -- `seal_reload`
 * gives way to the first push and goes on over the locomotion (the header of `HOLD_CLIPS`). Whether the SEAL is still
 * enough for the crouched one is `Walker.hold`'s test.
 */
export function reloadHold(stance: Stance, pistol: boolean): HoldClip | null {
  if (stance === 'crouch') return pistol ? 'seal_p_crouch_reload' : 'seal_crouch_reload';
  if (stance === 'prone') return pistol ? 'seal_p_prone_reload' : 'seal_prone_reload';
  return null;
}

/**
 * PAR-67 (research 251 section 12.5): the seconds the stick's cut reads a reload's still clip behind the push's clock --
 * one game frame. The player's push (`FUN_005a82e0`) comes from the kit's frame (`FUN_005c0fd0`) in the actor update
 * (`FUN_005506a0` D:L417907), the `entity_post_tick` pass, after the driver's `entity_tick` (`FUN_001ec480` D:L50925,
 * D:L50929); the play advances only in the driver (D:L418293, D:L418454), which asks the cut first (D:L418180). So the
 * cut t seconds after the push reads the phase at t minus a game frame: the reload's holds below, and the room's and the
 * page's lock (`./reloadLock` `reloadCutAt`), on one command. PAR-70 (research 251 section 12.5): the throws' holds lag
 * by it too (`LAGGED_HOLDS`); the plants' keep the push's own clock (`HOLD_PUSH_FRAME_READING`). PAR-74: the claymore's
 * and the PMN's placing lags by it too, the bomb's plant and C4's keep the push's clock (`HoldPass`, `holdPassOf`).
 */
export const RELOAD_PUSH_LAG = GAME_FRAME_DT;
/**
 * The holds whose every push lands after the frame's driver, so whose cut (`Walker.holdCut`) and uncut end
 * (`Walker.runHold`, `reloadPlayedOut`) read the phase `RELOAD_PUSH_LAG` behind the hold's clock -- PAR-67's set of the
 * reload's holds, generalised by PAR-70 (research 251 section 12.5). The reload's (`reloadHold`; the shotgun's and the
 * pump's stand in on two of them, H77): the kit's frame's push (above). The throws': `GetThrowAnim`'s clip, pushed only
 * by `FUN_005802b0` (D:L441900) from `FUN_005be9a0`'s hand-grenade branch (D:L475501), which only the kit's frame
 * reaches (`FUN_005c0fd0` D:L476624, D:L476638; the other caller `FUN_005c0020`, D:L475994, fires 0x97, 0x98 and 0x9a,
 * whose branches come first) -- the pistol's toss its pair (`FUN_00588bc0` -> `FUN_0058c820`). Not here: C4's
 * `Put on wall` (pushed from the Action button in the controller's tick, `entity_pre_tick`, before the driver: the
 * push's own clock), and `Place claymore`, one hold code for pushes from both passes (`holdPassOf`, PAR-74).
 */
const LAGGED_HOLDS: ReadonlySet<HoldClip> = new Set<HoldClip>([
  'seal_crouch_reload', 'seal_p_crouch_reload', 'seal_prone_reload', 'seal_p_prone_reload',
  'seal_throwgrenade', 'seal_tossgrenade', 'seal_crouch_throwgrenade', 'seal_prone_throwgrenade',
  'seal_prone_tossgrenade', 'seal_toss_rlean', 'seal_toss_llean', 'seal_p_tossgrenade',
]);

/**
 * PAR-74 (research 251 section 12.5, "PAR-74"): where a hold's push lands in the frame -- `'after'` the driver (the kit's
 * frame, `entity_post_tick`: its cut and its uncut end read the phase `RELOAD_PUSH_LAG` behind the hold's clock, the end
 * `reloadPlayedOut`'s) or `'before'` it (the controller's tick, `entity_pre_tick`: the push's own clock, the end
 * `swapPlayedOut`'s, the driver's end test on that clock -- not the last key).
 */
export type HoldPass = 'before' | 'after';

/**
 * PAR-74 and PAR-75 (research 251 section 12.5, "PAR-74"): the pass of a hold's push -- the item's, which the code fixes
 * for every hold but one. `LAGGED_HOLDS`: after. C4's `Put on wall` and its pistol pair: before (`FUN_00592d50`
 * D:L452055 -> `FUN_005be9a0` D:L475420, the Action button in the controller's tick). `Place claymore` is pushed from
 * both: the claymore's (-0x67, D:L475322) and the PMN's (-0x62, D:L475354) from the kit's frame (`FUN_005c0fd0`
 * D:L476624, D:L476638) -- after, the code's default, as the page's kit lays it (`./matchThrow` `throwStart`); the bomb's
 * plant (-0x66, D:L475481) from the plant's hold timer in the controller's tick (`FUN_00594cf0` D:L453273 ->
 * `FUN_005920c0` D:L451514) -- before, `asked` by its layer (`./bombPage` `ownBombBody`; the room by its own bomb,
 * `room.ts`); the bomb's drop (`FUN_0059ddb0` D:L457611) as `./bombPage` `BOMB_DROP_PUSH_PASS_READING`. `asked` is
 * ignored for every other code.
 */
export function holdPassOf(clip: HoldClip, asked?: HoldPass): HoldPass {
  if (clip === 'seal_place_claymore') return asked ?? 'after';
  return LAGGED_HOLDS.has(clip) ? 'after' : 'before';
}

/**
 * PAR-79 (research 251 section 12.3, "PAR-79"): the holds the fall covers and a clipless landing hands back, kept in step
 * with the room's and the page's still clip (`./stillReloadLife` `stillClipFlight`): the four reload holds (`reloadHold`;
 * the shotgun's, the pump's and the m203's stand in on them, H77 -- `Rifle m203 reload` itself is never covered,
 * `fallCovers`, which the hold cannot tell: research 251 section 12.3's named gap; *PAR-82: told by the room and the
 * page, `Walker.holdCovered`*). `FUN_005af930`'s airborne branch
 * pushes `Jump fall` over the clip (D:L466956-466970 -> `FUN_0057e050` D:L440726), the advance moves only the top
 * (`FUN_0057a330` D:L438708), and the clipless landing's pop hands the clip back at its phase (`FUN_00589aa0`
 * D:L466900-466901 -> `FUN_0028da00` D:L135104-135107). The throws' and the plants' holds are one-shots the fall covers
 * too: not built here (the take-off still ends them, `replaced`).
 */
const COVERED_HOLDS: ReadonlySet<HoldClip> = new Set<HoldClip>(['seal_crouch_reload', 'seal_p_crouch_reload', 'seal_prone_reload', 'seal_p_prone_reload']);

/**
 * PAR-69 (research 251 section 12.5): whether a reload's still clip has come off by itself `t` seconds after its push,
 * as the driver's end test reads it -- asked before the tick's advance when nothing cut (`FUN_00550ef0`
 * D:L418192-418193 -> `FUN_00582540` -> `FUN_0028c6e0` D:L442925): the play's stored phase, a game frame behind the
 * push's clock (`RELOAD_PUSH_LAG`, PAR-67), plus half a frame's step at the clip's own `playback` -- the play's speed
 * (`ReloadTime`'s, D:L462936-462939) is not in it (D:L134291-134297) -- strictly past the stop (n-1)/n
 * (D:L134298-134300). `period`: the seconds the clip plays over (`ReloadTime`, or its `playback`). A command past the
 * last key wherever `period` is the `playback`. The lagged holds' end (`Walker.runHold`, `LAGGED_HOLDS`: the
 * reload's and, since PAR-70, the throws') and the still clip's life, its jump refusal and its cut's bound, room and
 * page (`./reloadLock` `reloadEnded`), ask it.
 */
export function reloadPlayedOut(t: number, period: number, frames: number, playback: number): boolean {
  const e = frames < 2 ? 1 : (frames - 1) / frames;
  return Math.max(0, t - RELOAD_PUSH_LAG) / (period * e) + GAME_FRAME_DT / (2 * playback * e) > e;
}

/**
 * PAR-80 (research 251 section 12.5, "PAR-80"): whether a swap's full-body play (`Rifle -> Pistol` 0x35, `Crouch rifle
 * -> Pistol` 0x36, `Prone rifle -> Pistol` 0x37) has come off by itself `t` seconds after its push, as the driver's end
 * test reads it (`FUN_00550ef0` D:L418192-418193 -> `FUN_00582540` -> `FUN_0028c6e0` D:L442925, D:L134283-134308): the
 * phase on the push's own clock -- the swap is pushed before the driver, on its press's frame (`FUN_00551ec0` D:L418611
 * -> `FUN_005dfc80` D:L494228 -> `FUN_005c1660` D:L476734 -> `FUN_005a64c0` -> `FUN_00588bc0`), as C4's plant (PAR-70)
 * -- plus half a frame's step at its `playback`, strictly past the stop (n-1)/n; reversed the same seconds (the phase
 * from the stop down, past 0). `FUN_00582540` answers 1 there: the swap's key callback (`FUN_00588bc0`
 * D:L446304-446398) was run and cleared at its key by the advance (`FUN_0057a330` D:L438995-439003), long before the
 * stop, so `+100` is 0 (D:L443131-443132). One command before the last key (`oneShotSeconds`) for each of the three.
 */
export function swapPlayedOut(t: number, playback: number, frames: number): boolean {
  const e = frames < 2 ? 1 : (frames - 1) / frames;
  return t / (playback * e) + GAME_FRAME_DT / (2 * playback * e) > e;
}

/**
 * PAR-81 (research 230 section 5.2.6): the command, counted from the push's own as the first (`TICK` each), on which a
 * full-body play pushed before the driver on its press's frame comes off by the driver's end test (`swapPlayedOut`). The
 * launcher's lower is such a play: `FUN_005a64c0` (D:L461875, reached from the press's frame as the swap is,
 * D:L476734) -> `FUN_005a6b70` pushes the raise's own clip reversed in the launcher's set (D:L462069-462070,
 * D:L462078-462079; `seal_rifle2launcher` 35 keys or `seal_pistol2launcher` 24, playback 1.5, `NoInterrupt` bare:
 * never cut), and its end gives the set back (`FUN_00582540` D:L443058-443062 -> `FUN_005a60d0` D:L461769-461771): the
 * 84th command from the rifle's clip, the 82nd from the pistol's.
 */
export function playedOutCommand(playback: number, frames: number): number {
  let k = 1;
  while (!swapPlayedOut(k * TICK, playback, frames)) k++;
  return k;
}

/**
 * PAR-81 (research 230 section 5.2.6): the launcher's set refuses the jump at the press (`FUN_00594cf0` D:L453211-453213
 * asks `FUN_005b4340(actor, 0xb)`, which refuses under `DAT_0044d408`, D:L469466-469471), before any move's own answer,
 * so the port refuses it before the hang's let-go clause too (`room.ts` `jumpRefused`, `./walk` `WalkMode.jump`).
 * [reading: whether a climb's, a ladder's or a hang's start can begin under the launcher's set, or gives it back, is not
 * read -- none of the set's read restorers (`FUN_005a60d0` D:L461769-461771, the driver's stick lower D:L418263-418270)
 * is a move's; the knock's `FUN_005807d0` gives back only the turret's set, D:L442073-442087]
 */
export const LAUNCHER_SET_MOVES_READING = 'refused under a move' as const;

/**
 * PAR-83 (research 230 section 5.2.8): the launcher's stick lower. With the launcher's set on and its base on top (type
 * 0x12, a looped top -- the branch asks it -- the raise popped), the ground driver's looped branch lowers the launcher
 * when a move axis -- `actor+0x240` or `+0x244`, the pad's stick as `Walker.cutStick` holds it -- is strictly past 0.1;
 * the turn (`+0x23c`) is not read (`FUN_00550ef0` D:L418263-418266).
 */
export const LAUNCHER_LOWER_STICK = 0.1;
export function launcherStickLowers(stick: { readonly forward: number; readonly right: number }): boolean {
  return Math.abs(stick.forward) > LAUNCHER_LOWER_STICK || Math.abs(stick.right) > LAUNCHER_LOWER_STICK;
}

/**
 * PAR-83 (research 230 section 5.2.8): the first command the launcher's base is on top, so the stick may lower it -- the
 * one after the raise's end. `raised` is the last command before the raise's push (the `throw` event's seq; the page's
 * `taps`): the raise rides the next, comes off on its `playedOutCommand`-th (`FUN_00582540` D:L443058-443065, the driver's
 * one-shot branch, which runs no stick lower on that command), and the looped branch (D:L418255-418278) reads the base
 * from the command after. `clip`: the raise's (`LAUNCHER_RAISE_CLIPS`, by the firearm it came from).
 * The raise and the still lower are full-body one-shots on the stack, `NoInterrupt` bare, under which the driver runs no
 * ground state (D:L418172-418246): the SEAL stands through them. *Built by PAR-84 (research 230 section 5.2.10; was
 * `LAUNCHER_RAISE_HOLD_READING`, "not held: the port's SEAL walks on through them", research 230 section 5.2.9): the
 * mover holds both as actions (`launcherClip`, `rifleToLauncher` / `pistolToLauncher`), room and page on one command.*
 */
export function launcherBaseCommand(raised: number, clip: { readonly playback: number; readonly frames: number }): number {
  return raised + playedOutCommand(clip.playback, clip.frames) + 1;
}

/**
 * PAR-84 (research 230 section 5.2.10): the launcher's raise as a mover action, by the original's types -- `Rifle ->
 * Launcher` (`DAT_003df0e0`, `seal_rifle2launcher`) from the rifle and `Pistol -> Launcher` (`DAT_003df0e8`,
 * `seal_pistol2launcher`) from the pistol (`FUN_005a6d30` D:L462112-462116); the still lower is the same action reversed
 * (`FUN_005a6b70` D:L462069-462070, D:L462078-462079), as the original's push carries the type and its reverse.
 */
export type LauncherClipName = 'rifleToLauncher' | 'pistolToLauncher' | PickupClipName;

/**
 * NU-5 X1 and research 324 P2: the pick-up's `Swap rifle` as a mover action, kept at its command as the launcher's clips
 * are (`./net/moverSim` `LauncherClips`, `Walker.launcherClip`): the exchange's (`swapRifleExchange`, the taker's own
 * console, `FUN_00588bc0` D:L458209-458211 after `FUN_0059f730` laid the old weapon, D:L458189) and the launcher
 * claim's (`swapRifleClaim`, every console under `FUN_00589900`, D:L458199-458206). A kept clip refuses a raise or a
 * lower riding inside it (`LauncherClips.liveOn`): for these the original's take is refused by the `NoFire` phase test
 * (`FUN_005a8cb0` D:L463157 -> `FUN_005a7de0(actor, 1, 1)`, its last branch D:L462695-462705 through `FUN_0058a8c0`
 * D:L446897-446915; `NoFire ()` bare on `seal_swaprifle`), though `DAT_003dec78` is in neither `FUN_005a7ab0`'s list
 * (D:L462523-462549) nor `FUN_005a7980`'s (D:L462484-462491) -- so it is no swap (`swapping`). Was (PAR-84 to NU-5):
 * `LauncherClipName` held the raise's two names alone.
 */
export type PickupClipName = 'swapRifleExchange' | 'swapRifleClaim';

/** PAR-84: the raise's (and the still lower's) action for the firearm `from` (0 the rifle, 1 the pistol). */
export function launcherClipName(from: 0 | 1): LauncherClipName {
  return from === 1 ? 'pistolToLauncher' : 'rifleToLauncher';
}

/**
 * PAR-84 (research 230 section 5.2.10, read by its build step 1): whether the others see the launcher's raise and still
 * lower. The original sends a push to every console as a Push Blend only when the type's flag byte has bit 0
 * (`FUN_002bbaf0` D:L160789-160790, from `FUN_00588bc0` D:L446408-446416), the bit the anim-set loader sets from a row's
 * `network_log` keyword (D:L496507-496511); `animset.rdr`'s rows of `Rifle -> Launcher` and `Pistol -> Launcher` (the
 * `SOLDIER` set's and the `launcher anim set`'s) carry none (`roomStillReloadJump.test.ts`, "PAR-84", over the tracked
 * `READERC.ZAR`), so no Push Blend goes. The port's wire carries the action (`ACTION_CODES`), and another page draws
 * it (`../remotePlayers` `remoteBodyAction`, NU-6 R1): each copy plays the raise and the lower itself from the
 * character message's item (research 324 §4, the gameplay controller's ruling of 2026-10-14: `FUN_005c8a20` ->
 * `FUN_005c50b0` class 4 -> the copy's `FUN_005c1660` -> `FUN_005a64c0` -> `FUN_005a6d30`, D:L461886, D:L462105-462116;
 * the lower `FUN_005a6b70`, D:L461875), and the room's mover action stands in for that clip. The value is unchanged.
 * [reading: the flag read off the disc's file, not measured running; capture NU6-4 shows the copy's raise]
 * Was: "so no Push Blend goes and another console draws its copy's own ground. ... another page drops it for drawing
 * (`../remotePlayers` `remoteBodyAction`). [reading: ...; what the receiver's copy draws for the item the character
 * message carries is not read (research 230 section 5.2.11)]" -- read by research 324 §1.6, §4.
 */
export const LAUNCHER_RAISE_NETWORK_LOG_READING = false as boolean;

/**
 * PAR-84 (research 230 section 5.2.10-5.2.11): a launcher clip asked of a mover in the air is refused (`'refused'`:
 * `Walker.launcherClip` starts none). The page's take that raises or lowers the launcher is refused in the air already
 * (`WalkMode.swapGate` -> `Walker.swapRefused`), so only a room whose mover is airborne on the clip's command while the
 * page's was not meets it. [reading: assumed, not cited -- the original's push through `FUN_00588bc0` asks
 * `FUN_00589900` first (called at D:L446072), whose body (from D:L446425) is read only in its first 40 lines, which
 * carry no airborne test (F2 of PAR-84's review); the rest is unread. And the port's fall (`setAirborne`) replaces an
 * action, where the original's `Jump fall` would be pushed over the clip]
 */
export const LAUNCHER_RAISE_AIR_READING = 'refused' as 'refused' | 'started';

/**
 * PAR-83: the launcher up on the commands' clock -- the base's first command (`launcherBaseCommand`) and the firearm it
 * came from (`actor+0xf78`, `FUN_005a6d30` D:L462118; the stick lowers back to it, D:L418269).
 */
export interface LauncherUp { readonly base: number; readonly from: 0 | 1 }

/**
 * PAR-83 (research 230 section 5.2.8): the moving lower the stick plays -- out of the launcher's set now, `FUN_005a6b70`
 * pushes `moving_rifle_to_launcher` (`DAT_003df0f0`) or `moving_pistol_to_launcher` (`DAT_003df0f8`) (D:L462073,
 * D:L462082), `BlendOverlay` on the disc, so on the second channel (`FUN_00587780` kinds 8 / 10, D:L445419-445437, run
 * back from its end, `FUN_0028d3f0(.., 1)` D:L438583-438600): `motion.rdr` playback 1.5, `NoFire` bare, no `NoInterrupt`;
 * `MOTION_P.ZAR` 35 and 24 keys (`roomStillReloadJump.test.ts`, "PAR-83").
 */
export const LAUNCHER_MOVING_LOWER = Object.freeze({
  rifle: Object.freeze({ clip: 'seal_mv_rifle2launcher', playback: 1.5, frames: 35 }),
  pistol: Object.freeze({ clip: 'seal_mv_pistol2launcher', playback: 1.5, frames: 24 }),
});

/**
 * PAR-83: the moving lower's life on the second channel's clock, its node freed at the last key (`FUN_0028d170`
 * D:L134703-134737, as `SWAP_OVERLAY_SECONDS`): playback x (n-1)/n -- 1.4571 s to the rifle, 1.4375 s to the pistol.
 * While its node is live `FUN_005a7980` answers (D:L462492-462499), so `FUN_005a7de0` refuses the firearm's round
 * (D:L462636-462638).
 */
export function launcherMovingLowerSeconds(from: 0 | 1): number {
  const c = from === 1 ? LAUNCHER_MOVING_LOWER.pistol : LAUNCHER_MOVING_LOWER.rifle;
  return c.playback * ((c.frames - 1) / c.frames);
}

/**
 * PAR-83, F1 of its review: the moving lower's life on the commands' clock, counted from the stick's command u -- 87
 * commands to the rifle, 86 to the pistol (`launcherMovingLowerSeconds` at 60 Hz, rounded as the room's
 * `firearmReadyAt`). While it lives `FUN_005a7980(actor, 1)` answers (D:L462492-462499), so `FUN_005a8cb0`'s
 * `FUN_005a7de0(actor, 1, 1)` (D:L463159, D:L462636-462638) refuses every slot's take and the swap (D:L453289-453310): a
 * take riding u + 1 .. u + life - 1 is refused, one riding u + life taken (`room.ts` `Player.movingLowerUntil`,
 * `./walk` `WalkMode.swapGate`).
 */
export function launcherMovingLowerCommands(from: 0 | 1): number {
  return Math.round(launcherMovingLowerSeconds(from) / TICK);
}

/**
 * A hold on the mover: its clip, seconds since it started, how long it runs (`oneShotSeconds(period, frames)`) and the
 * clip's `period` -- its `playback`, or the record's `ReloadTime` on a still reload (`FUN_005a82e0` 462935-462940 sets the
 * node's speed to the clip's length over `ReloadTime`, so the stack's phase, the hold and the cut run on that clock).
 */
export interface MoverHold {
  clip: HoldClip; t: number; seconds: number; period: number;
  /** PAR-74: its push's pass (`holdPassOf`): after the driver lags its cut and its end, before it ends on `swapPlayedOut`. */
  pass: HoldPass;
  /** PAR-79: the seconds since a clipless landing handed the hold back (`Walker.land`; absent: never covered). */
  back?: number;
}

/**
 * The move stick in the 9x view or a scope: `FUN_005966a0` 453818-453821 multiplies both move axes by the literal 0.2
 * when `FUN_005b9990` or `FUN_005b90f0` answers, before the controller stores them. The same value as `./zoom`'s
 * `SCOPE_SLOW` (the look's `DAT_00650638`, 453813-453817, a different variable), kept as one constant.
 */
export const SCOPED_STICK = SCOPE_SLOW;

/** `Moving rifle -> Pistol` (`seal_mv_rifle2pistol`, 21 keys, `playback` 1.32, `BlendOverlay`): the swap on the move. */
export const SWAP_OVERLAY = { playback: 1.32, frames: 21 } as const;
/**
 * The moving swap's seconds on the second channel's clock (`FUN_0028d170` D:L134703-134737; research 150 s3.4, R150.5):
 * its key at t is t / playback x n and its node is freed at the last key, t = playback x (n-1)/n -- 1.32 x 20/21 =
 * 1.257 s, not the one-shot's playback x ((n-1)/n)^2 = 1.197 (research 211 s1, G2).
 */
export const SWAP_OVERLAY_SECONDS = SWAP_OVERLAY.playback * ((SWAP_OVERLAY.frames - 1) / SWAP_OVERLAY.frames);

/**
 * The swap `WalkMode.swapWeapon` / `Walker.swapWeapon` picked (`FUN_005a64c0`): the full-body action it started, or
 * the overlay over the locomotion (`overlay` true), and whether it plays backwards (the pistol back to the rifle).
 */
export interface SwapPick { action: 'swapStand' | 'swapCrouch' | 'swapProne' | null; overlay: boolean; reversed: boolean; seconds: number }

/**
 * WEAPON: the swap clip playing on the mover (`Walker.swapProgress`): the action it is (null for the moving overlay),
 * whether it is the overlay, and how far through it is, 0..1 of its seconds whichever way the clip runs. The kit's
 * hand-off and end run on this clock, the one the body is drawn by, not a count of their own.
 */
export interface SwapProgress {
  action: 'swapStand' | 'swapCrouch' | 'swapProne' | null; overlay: boolean; progress: number;
  /**
   * PAR-37 (research 251 section 9): the swap was never the room's -- the page took it on a command after a victory dance's
   * `seq`, which the room ran under the dance and refused (`./walk` `WalkMode.swapProgress`); the kit goes back to the
   * firearm it left (`./kit` `Kit.frame`).
   */
  undone?: boolean;
  /**
   * PAR-51 (research 251 section 9.1): the swap last told `undone` is the room's after all -- the room's stop named a
   * command before it, so the room ran it with no dance and took it (`./walk` `WalkMode.stopVictoryMotionAfter`); the kit
   * takes it again (`./kit` `Kit.frame`).
   */
  redone?: boolean;
}

/**
 * An upper-body clip over the locomotion (the game's second play channel, `FUN_0028d860(anim+0x60, ...)`; a motion
 * flagged `BlendOverlay`): the moving swap. `t` seconds into `seconds`, backwards when `reversed`.
 */
export interface MoverOverlay { clip: string; serial: number; t: number; seconds: number; reversed: boolean }

/** `FUN_00550ef0` (decomp 418180-418190): an interruptible action is cut when a stick axis passes this. */
export const INTERRUPT_STICK = 0.1;

/**
 * `FUN_005ac1f0`'s landing classes (decomp 464864-464968): the contact speed against `m_landSpeed[3]` = the table's
 * gravity x sqrt(2 x `FALLING_DAMAGE_LIGHT/HEAVY/DEATH` / gravity) (`+0x30..0x38`; reCOM `char_dyn.cpp:32-35`):
 * 170.7, 206.8 and 237.5 at 235 and 62 / 91 / 120 units. 0 none, 1 light (over the first), 2 heavy (over the
 * second), 3 death (at or over the third).
 */
export function landingClass(speed: number, g: number = SEAL_TUNING.gravity, heights: readonly number[] = SEAL_TUNING.fallingDamage): 0 | 1 | 2 | 3 {
  const [light, heavy, death] = heights.map((h) => g * Math.sqrt((2 * h) / g)) as [number, number, number];
  if (!(speed > light)) return 0;
  if (!(speed > heavy)) return 1;
  return speed >= death ? 3 : 2;
}

/**
 * How long each holds the mover: the one-shot's run to its last key (`./locomotion` `oneShotSeconds`, `FUN_0028c4f0`):
 * `seal_jump` 0.993 s, the landings 0.632 and 0.903, the transitions 0.603, 0.846 and 0.945.
 */
export const ACTION_SECONDS: Readonly<Record<keyof typeof ACTION_CLIPS, number>> = Object.freeze(Object.fromEntries(
  Object.entries(ACTION_CLIPS).map(([k, c]) => [k, oneShotSeconds(c.playback, c.frames)]),
) as Record<keyof typeof ACTION_CLIPS, number>);

/**
 * PLACEHOLDER (named; research 80 s6c and s7, research 86 s7.2; the page's own, no original counterpart: research 180
 * s1.8, PF-21): in the free walk (`&nomatch`, `&fly`), the deadly fall's `Land forward` gets up
 * (`Get up forward`), since the viewer's walk alone has no death. In the game `FUN_005af590` (decomp 466641-466728)
 * pushes `Land forward` in state 8 and the SEAL dies there (the vtable's +0x90, `FUN_005a5da0`): the controller's
 * `FUN_005979a0` (454470-454495) spectates, or in a respawn game fades the body out (alpha 0 at 0.1 a second,
 * `FUN_00552780`) and `FUN_00599b60` (455695) fades the new SEAL in at a spawn. No get-up follows a death; `Get up
 * forward` is the game's own action, not one it plays after `Land forward`. Online the server's fall death is the
 * game's: `Walker.dead` (set by the net client's `kill`) holds `Land forward` at its last key instead.
 */
export const DEATH_LANDING_GETUP_PLACEHOLDER = true;

/**
 * READING (named; research 86 s7.2, research 180 s1.8): the heavy landing's coin. `FUN_005af590` (decomp 466667-466669)
 * draws `FUN_00197740() x 4.656613e-10 <= 0.5` -- `Hit stomach` at or under a half, else `Hit` -- from newlib's `rand()`
 * (`FUN_00197740` D:L14524-14537), one stream per console: the original never shares the coin between machines. The
 * page predicts the landing and the match server runs it, two movers that must agree bit for bit (`./net/protocol`): the
 * coin is drawn from the command both ends hold, its `seq` (`landingHitDraw`), so they land one clip -- an adaptation
 * the original has no counterpart of. The rule (a fair coin, the half, the two clips) is the game's; the draw's source
 * is the reading. The coin is the living's alone: a corpse draws none (PF-21, research 217 s4) -- D:L466658-466660
 * forces class 3 when the body's alive bit (`+0xe1` bit 4, cleared by the death `FUN_00547af0`) is clear, and class 3
 * over the hard rate pushes `Land forward` (D:L495332), so a corpse's hard landing is always the death landing, on both
 * ends (the page's locked walk and the room's `Room.corpse`), with no draw to share (review 3 A2's problem gone).
 */
export const LANDING_HIT_DRAW_READING = true;

/**
 * The heavy landing's draw for command `seq`, in [0, 1): a fixed integer hash (Knuth's multiplicative, 2654435761),
 * the same on every machine (`LANDING_HIT_DRAW_READING`).
 */
export function landingHitDraw(seq: number): number {
  return (Math.imul(seq | 0, 2654435761 | 0) >>> 0) / 2 ** 32;
}

/**
 * What the mover is doing besides the ground state (the game's action stack, `actor+0x1c0`): the standing jump
 * (`Jump`), the running jump's take-off (`Jump launch`), the fall (`Jump fall`), the landings (`Jump land`, `Jump land
 * hard`) and a stance transition (`Stand -> Crouch`, `Crouch -> Prone`, `Stand -> Prone`, played backwards when
 * getting up). `serial` changes with every start, so the animator sees a restart.
 */
export type MoverActionName = 'jump' | 'launch' | 'fall' | 'land' | 'landHard' | 'standToCrouch' | 'crouchToProne' | 'standToProne'
  | 'hit' | 'hitStomach' | 'landDeath' | 'getUp' | 'swapStand' | 'swapCrouch' | 'swapProne'
  | 'fallForward' | 'fallBackwards' | 'landBackwards' | 'getUpBackwards' | 'proneCover'
  | LauncherClipName;
export interface MoverAction {
  name: MoverActionName;
  serial: number;
  /** Seconds since it started. */
  t: number;
  /** How long it holds the mover, or null (the fall holds until the landing; the launch its clip's run, or the landing). */
  seconds: number | null;
  /** A transition played backwards: getting up. */
  reversed: boolean;
}

/**
 * The ground state as the animator needs it (`./locomotion`): which state ran (`FUN_00586570` stand -- the crouch's run
 * too --, `FUN_00584c60` crouch, `FUN_005845c0` prone, or none: at rest), the stick values it ran on (ramped,
 * rescaled) and the direction class.
 */
export interface GroundMotion { state: 'idle' | Stance; forward: number; right: number; cls: MoveClass }

/**
 * PAR-19 (ruling PAR.R2; research 251 section 1): the effective-action contract -- ONE answer to "what full-body action
 * owns the body now, what overlay rides it, what stance is pending, why did the last one end", which every interruption
 * check consults (`Walker.effectiveAction`, `stanceGate`, `swapping`, `onActionEnd`) instead of a guess of its own. Its
 * exported types and calls are FROZEN with PAR-19's first commit for its consumers (PAR-20's explosives, PARITY-2's
 * PAR-21 and PAR-23): a later change is additive.
 *
 * The family of a body owner, as the original's stack entries group: `transition` the three stance clips
 * (`Stand -> Crouch` 0x11, `Crouch -> Prone` 0x13, `Stand -> Prone` 0x19: `FUN_005817d0` D:L442509, `FUN_00581540`
 * D:L442424-442428, `FUN_00581c10` D:L442641 push them), the only one-shots `FUN_00588080` (D:L445716-445734) lets past
 * the stance gate; `swap` the full-body rifle <-> pistol clips (0x35-0x37) and (PAR-84) the launcher's raise and still
 * lower (`Rifle -> Launcher`, `Pistol -> Launcher`: `FUN_005a7980`'s list, D:L462484-462491); `jump` the standing jump; `air` the running
 * jump's launch and the fall; `landing` the two landings and the heavy fall's hits; `reaction` the blast's falls and
 * landing, `Prone cover` and the death landing; `getUp` the two get-ups; `reload`, `throw`, `place` the kit's holds
 * (`HOLD_CLIPS`); `move` a traversal's own one-shot on top (the peek's lean clip, `TickDriver.topOneShot`); `victory`
 * the victory dance (PARITY-1 close; research 251 section 9): its own action type (`DAT_003df130`) pushed on the stack
 * by `FUN_0057dcc0` (D:L440588) through the push the jump's clips take (`FUN_00588bc0`, D:L440820, D:L440843), a
 * one-shot on the disc (`motion.rdr` `looped(0)`, research 303 section 2) and none of the families above.
 */
export type ActionFamily = 'transition' | 'swap' | 'jump' | 'air' | 'landing' | 'reaction' | 'getUp' | 'reload' | 'throw' | 'place' | 'move' | 'victory';

/**
 * The full-body one-shot on top of the actor's stack (`actor+0x1c0`, `FUN_00555170`): where the port keeps it (`action`
 * the walk's `MoverAction`, `hold` the kit's `MoverHold`, `move` a traversal's clip, `victory` the victory dance
 * (`Walker.victoryMotion`; PARITY-1 close, additive)), its name (the action's `MoverActionName`, the hold's `HoldClip`,
 * `'move'`, `'victory'`), its family and the start it belongs to (`MoverAction.serial`, or the hold's
 * `Walker.holdStarts` count, or the dances started; 0 for `move`).
 */
export interface BodyOwner { source: 'action' | 'hold' | 'move' | 'victory'; name: MoverActionName | HoldClip | 'move' | 'victory'; family: ActionFamily; serial: number }

/** The upper-body clip on the second channel (`actor+0x1e4`, `FUN_0028d860(anim+0x60, ...)`): the moving swap. */
export interface OverlayOwner { clip: string; family: 'swap'; serial: number }

/**
 * Why a body owner or an overlay came off (`ActionEnd`). The mover's own: `complete` its clock ran out; `cut` the stick
 * or the turn cut it past its `NoInterrupt` (`FUN_00587c20` with `FUN_00550ef0`'s stick test), or the peek took it
 * (`yieldAction`); `replaced` another full-body action took the stack (a jump's take-off over a hold, a swap over a
 * stance transition, the walk's own `setAirborne`); `knock` the blast's knock popped it (`FUN_0057e770`, `knock`);
 * `completed` a pending swap forced to its end before a reaction (`completeSwap`, `FUN_005a5da0`). The others are the
 * same channel's for the consumers' clocks that outlive the mover's (a reload, a throw's pose; PAR-19's later units):
 * `flinch`, `death`, `rejected` (the room refused it: its journal undone), `cancelled` (an accepted cancel: what it
 * committed at its start stays). PARITY-1 close (additive): `stopped` the victory dance's own end -- its owner took it
 * off (`Walker.stopVictoryMotion`: the room's `stopVictory`, the page's `WalkMode.syncVictoryMotion(null)`); its other
 * ends are the reasons above (`complete`, `cut`, `death`, `knock`, `replaced`).
 */
export type ActionEndReason = 'complete' | 'cut' | 'replaced' | 'knock' | 'completed' | 'flinch' | 'death' | 'rejected' | 'cancelled' | 'stopped';

/** One end (`Walker.onActionEnd`): the body owner or the overlay that came off, and why. */
export interface ActionEnd { body: BodyOwner | null; overlay: OverlayOwner | null; reason: ActionEndReason }

/**
 * The answer, at once (`Walker.effectiveAction`): the body's owner (null while a looped state owns it -- the idles, the
 * locomotion, the turn steps: `FUN_005551a0(top+0x28, 0x40)`), the overlay riding it, the stance asked for and not yet
 * taken (`actor+0x374`; null when it is the stance), and the last end.
 */
export interface EffectiveAction { body: BodyOwner | null; overlay: OverlayOwner | null; pendingStance: Stance | null; lastEnd: ActionEnd | null }

/**
 * Research 303: the victory dance on the mover (`Walker.victoryMotion`): its clip, its `motion.rdr` playback, its root's
 * X/Z keys, its clock (`elapsed` of `seconds`, `oneShotSeconds`) and its `NoFire`.
 */
export interface VictoryMotion {
  clip: string; playback: number; frames: number; keys: Float32Array; elapsed: number; seconds: number; noFire: number | null;
}

/**
 * `FUN_00552ec0`'s answer for a stance asked of the body now (`Walker.stanceGate`; D:L418916-419025):
 * - `same`: the stance already (the function returns 0 and nothing is left to do);
 * - `owned`: a full-body one-shot owns the body (the outer gate, D:L418927-418930: neither a looped top nor a stance
 *   transition), or the transition on top refuses this target (0x11 refuses prone, D:L418932; 0x19 crouch,
 *   D:L418953; 0x13 stand, D:L418995) -- the request is KEPT and asked again each frame (`FUN_00552d60`);
 * - `kept`: an obstacle refuses it (prone, D:L418935-418940; crouch, D:L418958-418966) -- 0 returned, `actor+0x374`
 *   untouched, so the request is asked again;
 * - `reset`: no headroom (prone -> crouch, D:L418987-418991; to stand, D:L419007-419011) -- the request is written
 *   back to the stance (`actor+0x374 = actor+0x174`) and forgotten;
 * - `open`: taken.
 */
export type StanceGate = 'same' | 'owned' | 'kept' | 'reset' | 'open';

/**
 * OT.R67 (`./stanceButton` `PRONE_POP_ADAPTATION`; no original): what a prone-pop did -- stood out of the dive
 * (`Traversal.cancelDive`), out of the forward drop under way, or from settled prone (`Walker.popStand`); `'refused'`,
 * nothing changed (dead, in the air, no headroom, the dive under an action or a hold); null, no pop here (the press is
 * then the ordinary one).
 */
export type PopOutcome = 'dive' | 'drop' | 'prone' | 'refused' | null;

/**
 * READING (named; research 251 section 2): where in the port's tick the pending stance is asked again. The original
 * asks it once a frame (`FUN_00551ec0` D:L418606-418611 calls `FUN_00552d60` unless the top's state is 8), and the
 * stack's own update (`FUN_00550ef0`) is reached through the actor's vtable, so which of the two runs first in a frame
 * is not read. The port asks it after the tick's clocks (`'afterClocks'`): a one-shot that runs out on a tick lets
 * the stance through on that tick. A capture settles it: the frame the stance clip starts after a crouched reload's
 * last key (research 230 section 7, "Still reload -> stance/jump").
 */
export const PENDING_STANCE_RETRY_READING = 'afterClocks' as const;

/** The transition on top refuses the one target it does not share (`FUN_00552ec0` D:L418932, D:L418953, D:L418995). */
const TRANSITION_REFUSES: Readonly<Record<'standToCrouch' | 'crouchToProne' | 'standToProne', Stance>> = Object.freeze({
  standToCrouch: 'prone',    // 0x11
  crouchToProne: 'stand',    // 0x13
  standToProne: 'crouch',    // 0x19
});

/** The two stances of each transition clip, in its forward direction (`Walker.applyStance`: reversed from the second). */
const TRANSITION_STANCES: Readonly<Record<'standToCrouch' | 'crouchToProne' | 'standToProne', readonly [Stance, Stance]>> = Object.freeze({
  standToCrouch: ['stand', 'crouch'],
  crouchToProne: ['crouch', 'prone'],
  standToProne: ['stand', 'prone'],
});

/**
 * SEP-POP (OT.R93) READING (named; research 80 section 6f): the tick the stick's cut of a stance transition is first
 * taken. The original pushes the clip in the pre-tick, before the driver (`FUN_00552d60` from `FUN_00551ec0`, table slot
 * +0x14, before `FUN_00550ef0`'s +0x18; LATER 546), and the driver asks the cut before its advance (D:L418180): a
 * reversed clip, its phase starting at its end ((n - 1) / n, under 1 - 0), is cut on its push's frame -- EPH FINDINGS
 * Q3 (proven): the reversed 0x13 never on top -- and a forward one with `NoInterrupt` 0, its phase 0 there, on the next
 * frame. The port advances the clock before it asks (`step60`: `runClocks`, then `interrupted`), so it reads a
 * transition's phase `RELOAD_PUSH_LAG` (a game frame) behind the clock, never below 0 (`'a frame behind'`, the holds'
 * model): a press's reversed clip goes on its press's tick, a forward one with `NoInterrupt` 0 on the third 60 Hz tick
 * (on top a game frame, as the original's next frame). Not read: whether the press (`FUN_00594cf0`) reaches the pre-tick
 * of its own frame or the next's, and a request taken late (`retryStance` after the clocks, PENDING_STANCE_RETRY_READING)
 * is cut a tick later than a press. The peek reads the same lagged phase (SEP-POP review N3): `actionInterruptible`,
 * which `./traversal` `peekHeld` asks for `FUN_005b4340(seal, 1)`'s site (D:L469337-469346), goes through
 * `pastNoInterrupt`, so in SEPARATE a transition gives way to the peek a frame after its push too -- when that site runs
 * in the original's frame against the push and the driver is not read. Settled by a capture of the quick drop (EPH case
 * C: the frame the forward 0x13 leaves the top) and of a peek pressed through a stance clip.
 */
export const STANCE_CUT_TICK_READING = 'a frame behind' as const;

/**
 * SEP-POP review N2 (a) READING (named; research 80 section 6f; shared with COMBINED, behaviour unchanged): the crouch
 * walk's axis after `FUN_00584c60`'s normalisation, `stick x 14 / (|stick| x 14.8)` = 0.946 (D:L444158-444164), so 14.19
 * u/s aside. EPH round 4 (pop-stick-half, runs 20261031T170731Z-170838Z, capture, unscored) at pad 0.40: the lateral
 * climbs 0.167 a frame to 0.911 and holds -- 13.68 u/s. Why the original settles at 0.911 is not read (the slope/water
 * scale `FUN_005b56c0`, the pad's rescale, or the ramp's own limit). Settled by tracing `+0x244` through that frame.
 */
export const CROUCH_WALK_AXIS_READING = 'stick x 14 / (abs(stick) x 14.8): 0.946' as const;

/**
 * SEP-POP review N2 (b) READING (named; research 80 section 6f; research 217 s2.9; LATER 678): the crouch's return from
 * its run. `FUN_00584c60` sets `+0x21c` bit 2 in its run branch (the stick past 12.4 / 14.8, D:L444145-444172: the port's
 * crouch run, `posture` stand) and clears it in its walk branch (D:L444150). At rest its idle branch (D:L444195 on) takes
 * a turn axis (`+0x23c`, D:L444116) past `FUN_0052eb60`'s 0.025 to the crouch's turn, the bit cleared (D:L444196-444198);
 * else it pushes the crouch idle 0x12 (D:L444282) and, with the bit set, `Stand -> Crouch` 0x11 on top of it
 * (D:L444316-444317), the bit cleared (D:L444325). EPH Q3 and round 4 (capture): a full stick let go after the pop plays
 * 0x11 (0.58-0.60 s, the root 10.04 to 5.50) then 0x12; half a stick let go, 0x12 at once. `'stand-to-crouch'` (built,
 * LATER 678): a crouch run let go, not turning, plays `standToCrouch` forward, the crouch idle under it -- in SEPARATE
 * only (`stanceSeparate`, OT.R93). The function reads no stance-button mode (the original has one), but OT.R93 keeps
 * COMBINED and the bots as main has them (`stanceCutSeparate.test.ts` pins the bots' trace byte for byte), as MOVE-1 and
 * MOVE-4 were kept (H392): theirs is the owner's question. `'idle'`: the crouch idle at once (the port before LATER 678;
 * COMBINED's and the bots' still). Not ported still: the posture word reads 1 (crouch) through the run where the port's
 * `posture` is `stand` (`locomote`; the hull, the headroom and the hit volumes follow it) -- owed with the run's posture
 * write. [reading, pending review]
 */
export const CROUCH_RUN_RETURN_READING = 'stand-to-crouch' as 'stand-to-crouch' | 'idle';

/**
 * LATER 678 READING (named; research 217 s2.9): the release's push off a wall. During the 0x11 the release plays, the
 * head line takes the muzzle reach (`HEAD_LINE_MUZZLE_READING` 'prone-or-transition', `FUN_0054aa30` D:L415480) and the
 * deep-hit rule puts the body out by the depth less 1 (`FUN_005483d0` D:L413602-413614). `'first-tick'` (built): from
 * the clip's first tick, at the crouched firepoint's fixed reach (`SEGMENT_FIREPOINT_READING`: 1.1 x 11.438 = 12.58).
 * ac's r0004 capture (house-crouch, trials 2 and 3): the body held at 5.85 for 4 frames of 0x11, out to 10.85 in one
 * frame, then 12.88 -- the firepoint node moving through the clip, which the port does not pose. Neither the 4-frame
 * delay nor the 12.88 is read. Settled by the firepoint node (`actor+0x14b0`) read through 0x11 (RDRAM).
 * [reading, pending review]
 */
export const CROUCH_RUN_RELEASE_PUSH_READING = 'first-tick' as const;

/** `FUN_0052eb60`'s tolerance at 0x3f3420 (0.025) on the turn axis (`+0x23c`): past it the crouch at rest turns (D:L444196). */
const CROUCH_IDLE_TURN = 0.025;

/**
 * SEP-POP READING (named; research 80 section 6f): `FUN_00587c20` never cuts `Stand -> Crouch` (0x11) while the actor
 * holds a partner at `+0xeac` (D:L445533; written where the actor takes another body, D:L437926, D:L438447; cleared by
 * the 0x11 cut itself, `FUN_00550ef0` D:L418196-418200). The port's walker holds no such link, so an escorting SEAL's
 * Stand -> Crouch is cut as any other's (`'not ported'`). Settled by reading what `+0xeac` links (the hostage's escort,
 * by its writers) and carrying it on the walker.
 */
export const STANCE_CUT_ESCORT_READING = 'not ported' as const;

/**
 * The family of each walk action (`ActionFamily`). Every clip they play is a one-shot on the disc (`motion.rdr`
 * `looped` 0: the fixture test holds it), so each owns the body.
 */
export const ACTION_FAMILY: Readonly<Record<MoverActionName, ActionFamily>> = Object.freeze({
  jump: 'jump', launch: 'air', fall: 'air', land: 'landing', landHard: 'landing',
  standToCrouch: 'transition', crouchToProne: 'transition', standToProne: 'transition',
  hit: 'landing', hitStomach: 'landing', landDeath: 'reaction', getUp: 'getUp',
  swapStand: 'swap', swapCrouch: 'swap', swapProne: 'swap',
  fallForward: 'reaction', fallBackwards: 'reaction', landBackwards: 'reaction', getUpBackwards: 'getUp', proneCover: 'reaction',
  // PAR-84: the launcher's raise and still lower are in `FUN_005a7980`'s list with the firearm swaps (D:L462484-462491).
  rifleToLauncher: 'swap', pistolToLauncher: 'swap',
  // NU-5: the pick-up's `Swap rifle` (research 211's swap family of clips; not in `FUN_005a7980`'s list: no `swapping`).
  swapRifleExchange: 'swap', swapRifleClaim: 'swap',
});

/** The family of a kit hold (`HOLD_CLIPS`): a reload, the claymore's or C4's placing, or a throw. */
export function holdFamily(clip: HoldClip): ActionFamily {
  if (/reload$/.test(clip)) return 'reload';
  if (clip === 'seal_place_claymore' || /put_onwall$/.test(clip)) return 'place';
  return 'throw';
}

/**
 * PAR-29 (research 251 §11, §7) [a reading: the port's choice]: a hold asked over a running placing that is not the same
 * placing -- the other placing or a throw -- replaces it (`holdOverHold`). The original pushes it over the placing
 * (`FUN_00588bc0` pops no kit type, D:L446105-446291; `FUN_0028dc90` D:L135150-135214), which resumes when it pops; the
 * port's mover holds one hold. Whether a page reaches it (the hand changed during the placing, the place clips' `NoFire`
 * under `FUN_005a7de0`'s phase test, D:L462700-462706) is not read.
 */
export const HOLD_OVER_PLACE_READING = 'replaced' as const;

/**
 * PAR-29 (research 251 §11, §7) [a reading: the port's choice]: a hold asked over a running throw is refused whatever hand
 * threw it. The rifle hand's throws and tosses, the pistol's two tosses and the rifle's peek tosses are in
 * `FUN_005a7de0`'s and `FUN_005a7d10`'s lists (D:L462620-462634, D:L462579-462582): refused, read. The pistol hand's
 * standing throw and peek tosses are in neither (its crouched and prone throws keep the rifle's types, so are in both:
 * research 85 §8.1 item 3; LATER 509's review F1), and the port's hold codes do not carry the hand.
 */
export const HOLD_OVER_THROW_HAND_READING = 'refused' as const;

/**
 * PAR-29 (research 251 §11): what a kit hold `asked` does over the running hold `running` -- the one rule the page's
 * `WalkMode.hold` and the room's `MoverSim.apply` share through `Walker.hold`. The original never restarts a running
 * hold's clip:
 *
 * - over a still reload (the after-shot's too), every kit one-shot is refused: `FUN_005a7de0`'s `FUN_005a7ab0`
 *   (D:L462636) for a throw or a placing, the reload's press (D:L453461) and its push (`FUN_005c2a90` D:L477398);
 * - over a throw, every kit one-shot is refused: `FUN_005a7de0`'s top list (D:L462620-462634), `FUN_005c2a90`'s
 *   `FUN_005a7d10` (D:L477397) for a reload (`HOLD_OVER_THROW_HAND_READING` for the pistol hand's);
 * - over a placing, the same placing again is refused -- `FUN_0057d540` pushes nothing when the action is current
 *   (D:L440344-440350; `FUN_00577e40` D:L437398-437412 counts the pistol's kin as the same) -- and anything else replaces
 *   it: a still reload by the original's own clear (`FUN_005a82e0` -> `FUN_0058a4d0`, D:L462925-462926), the other
 *   placing or a throw by `HOLD_OVER_PLACE_READING`.
 */
export function holdOverHold(running: HoldClip, asked: HoldClip): 'refused' | 'replaced' {
  const f = holdFamily(running);
  if (f === 'reload') return 'refused';
  if (f === 'throw') return HOLD_OVER_THROW_HAND_READING;
  const claymore = (c: HoldClip): boolean => c === 'seal_place_claymore';
  if (holdFamily(asked) === 'place' && claymore(asked) === claymore(running)) return 'refused';
  return holdFamily(asked) === 'reload' ? 'replaced' : HOLD_OVER_PLACE_READING;
}

/** PAR-37: a mover's state as `Walker.saveState` kept it (opaque: only `Walker.restoreState` reads it). */
export type WalkerState = { readonly __walkerState: unique symbol };

/**
 * PAR-37: the `Walker` fields a kept state leaves alone -- the grid (the constructor's), the wall caches and the revision
 * they were read at, the end listeners, the moves (`driver`, the page's own), the clips' root keys (shared, read only)
 * and the frame's part-tick (`accumulator`: real time, not the simulation's).
 */
const KEPT_SHARED: ReadonlySet<string> = new Set(['grid', 'wallsByCell', 'near', 'nearByCell', 'seenRevision', 'endListeners', 'driver', 'actionRoots', 'accumulator']);
/** PAR-37: the fields kept by reference: a new object each time they change, never mutated (`land`, `emitEnd`). */
const KEPT_BY_REFERENCE: ReadonlySet<string> = new Set(['landing_', 'lastEnd_']);

/**
 * PAR-37: a kept field's copy -- the dance's root keys by reference (`setVictoryMotion` lays them and nothing writes them
 * after), the rest deep (`cloneKept`).
 */
function keptCopy(k: string, v: unknown): unknown {
  return k === 'dance_' && v ? { ...(v as VictoryMotion) } : cloneKept(v);
}

/** PAR-37: a deep copy of a kept value -- its prototype kept (`GameFrameAccumulator`), its typed arrays copied. */
function cloneKept<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return (v as unknown as Float32Array).slice() as unknown as T;
  if (Array.isArray(v)) return v.map(cloneKept) as unknown as T;
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, cloneKept(x)])) as unknown as T;
  if (v instanceof Set) return new Set([...v].map(cloneKept)) as unknown as T;
  const o = Object.create(Object.getPrototypeOf(v) as object) as Record<string, unknown>;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = cloneKept(x);
  return o as T;
}

/** A polygon's unit normal turned up, computed now (`upNormal` without its cache). */
function freshUpNormal(poly: WorldPoly): [number, number, number] | null {
  const n = polygonNormal(poly.points);
  return n === null ? null : n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/** A wall polygon with what the step needs of it computed once. */
interface Wall {
  poly: WorldPoly;
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  /** The unit normal's horizontal part, normalised: the direction a push leaves the wall along. */
  nx: number; nz: number;
  /** The unit normal, turned up (the plane the tilted prone line meets, `rayToWallTilted`). */
  n3: readonly [number, number, number];
  // Exact cuts at the last two probe heights, bounded per cached static wall. Static geometry revisions rebuild
  // the Wall; moving owners get a fresh Wall on every query. No rounded height or collision rule is introduced.
  band0?: { y: number; points: number[] };
  band1?: { y: number; points: number[] };
  /** A moving owner's polygon (`wallOf`'s `fresh`, a door leaf): held two-sided by the one-sided tests (`frontOf`). */
  moving?: boolean;
}

// Keyed by the existing revision-owned static cell arrays. Discarding a cell array also releases its index;
// this is neither simulation state nor a cache of moving hulls.
const wallBoundsIndexes = new WeakMap<Wall[], OrderedBoundsIndex<Wall>>();
interface NearWalls { cell: number; walls: Wall[]; moving: CollisionObject[] }
// Bounded acceleration storage, not a change to the collision ring or any game distance.
const WALL_NEAR_CACHE_SIZE = 8;

/**
 * PB-3b (web research 281 s4.1): a wall one of the slide's probe lines met on the last move -- the port's stand-in for
 * the move solver's own hit, which `FUN_005483d0` keeps as the climb contact (D:L413823-413866: of the hits of the
 * centre's and the head line's segments, `FUN_0054aa30` D:L415433 and D:L415537, the first, or a nearer and higher one;
 * `FUN_005b0d30` D:L467394-467419 copies its 32-byte hit slot to `actor+0x1090`). `line` 0 is the low probe (the feet +
 * `step_height`), 1 the head line (`wallProbeHeights`); (x, y, z) the nearest point of the wall's cut at that line, which
 * the slide pushed the body off.
 */
export interface WallHit {
  poly: WorldPoly;
  /**
   * The line that met the wall: 0 the low line (the centre segment), 1 the head line; 2 a side line (SEGMENT-BODY: the
   * segment records after the first two, which the move's stored contact never takes, D:L413823-413848).
   */
  line: 0 | 1 | 2;
  x: number; y: number; z: number;
}

/**
 * SEGMENT-BODY: the move's stored contact `actor+0x1090..+0x10ac` (`FUN_005b0d30` D:L467392-467419 copies a 32-byte hit
 * slot there): the hit point, the hit polygon (`+0xc`) and its own normal (`+0x10..+0x18`; x and z here).
 */
export interface StoredContact {
  x: number; y: number; z: number;
  nx: number; nz: number;
  poly: WorldPoly;
}

/** A segment's hit as the stored contact holds it (`FUN_005b0d30`'s copy). */
function contactOfHit(h: SegmentHitOf): StoredContact {
  return { x: h.point[0], y: h.point[1], z: h.point[2], nx: h.normal[0], nz: h.normal[2], poly: h.poly };
}

/** DOORS: `fresh` for a moving owner's polygon (`CollisionOwner.sweep`), whose normal turns with it: not the cached one. */
function wallOf(poly: WorldPoly, fresh = false): Wall | null {
  const n = fresh ? freshUpNormal(poly) : upNormal(poly);
  if (n === null) return null;
  const h = Math.hypot(n[0], n[2]);
  if (h < 1e-9) return null;
  const p = poly.points;
  const wall: Wall = { poly, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, nx: n[0] / h, nz: n[2] / h, n3: n };
  if (fresh) wall.moving = true;
  for (let i = 0; i < p.length; i += 3) {
    wall.minX = Math.min(wall.minX, p[i]!); wall.maxX = Math.max(wall.maxX, p[i]!);
    wall.minY = Math.min(wall.minY, p[i + 1]!); wall.maxY = Math.max(wall.maxY, p[i + 1]!);
    wall.minZ = Math.min(wall.minZ, p[i + 2]!); wall.maxZ = Math.max(wall.maxZ, p[i + 2]!);
  }
  return wall;
}

/**
 * The part of a polygon between two heights, as its footprint: Sutherland-Hodgman against y >= lo and y <= hi,
 * then the x and z of what is left, flattened. A vertical wall's footprint is a segment; a leaning one's has area.
 */
function bandFootprint(points: Float32Array, lo: number, hi: number): number[] {
  let poly: number[][] = [];
  for (let i = 0; i < points.length; i += 3) poly.push([points[i]!, points[i + 1]!, points[i + 2]!]);
  const clip = (inside: (y: number) => boolean, at: number): void => {
    const out: number[][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const ina = inside(a[1]!), inb = inside(b[1]!);
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (at - a[1]!) / (b[1]! - a[1]!);
        out.push([a[0]! + t * (b[0]! - a[0]!), at, a[2]! + t * (b[2]! - a[2]!)]);
      }
    }
    poly = out;
  };
  clip((y) => y >= lo, lo);
  if (poly.length) clip((y) => y <= hi, hi);
  const xz: number[] = [];
  for (const p of poly) xz.push(p[0]!, p[2]!);
  return xz;
}

function wallFootprint(wall: Wall, y: number): number[] {
  if (wall.band0?.y === y) return wall.band0.points;
  if (wall.band1?.y === y) {
    const hit = wall.band1;
    wall.band1 = wall.band0; wall.band0 = hit;
    return hit.points;
  }
  const points = bandFootprint(wall.poly.points, y, y);
  wall.band1 = wall.band0; wall.band0 = { y, points };
  return points;
}

/**
 * On the plane, within the segment query's own epsilon (research 281 §4.3, `FUN_002d2890` micro 311: behind only
 * below -1e-5). The edge test (micro 336-361) counts a point on an edge as inside, so a path through a vertex is a hit.
 */
const FACE_EPS = 1e-5;

/**
 * The first time the centre segment (ax, az) -> (bx, bz) meets an edge of `xz` (x, z pairs), including either end of
 * the edge. `minT` is the earliest fraction that counts (negative includes a start already on the edge). A parallel
 * overlap is not a hit: the radial push still owns a centre that is already on the face and moving along it.
 */
function segmentEdgeHit(
  xz: number[], ax: number, az: number, bx: number, bz: number, minT: number,
): { t: number; x: number; z: number } | null {
  const rx = bx - ax, rz = bz - az;
  const n = xz.length / 2;
  let best: { t: number; x: number; z: number } | null = null;
  for (let i = 0; i < n; i++) {
    const cx = xz[i * 2]!, cz = xz[i * 2 + 1]!;
    const dx = xz[((i + 1) % n) * 2]!, dz = xz[((i + 1) % n) * 2 + 1]!;
    const sx = dx - cx, sz = dz - cz;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-12) continue;
    const qpx = cx - ax, qpz = cz - az;
    const t = (qpx * sz - qpz * sx) / den;
    const u = (qpx * rz - qpz * rx) / den;
    if (t < minT || t > 1 + FACE_EPS || u < -FACE_EPS || u > 1 + FACE_EPS) continue;
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    if (best === null || tt < best.t) best = { t: tt, x: ax + rx * tt, z: az + rz * tt };
  }
  return best;
}

/** The probe line meets the face strictly inside its height. A top that only touches the line is the kerb the walk climbs
 * (walk.test.ts: a face of exactly step_height 6.5 is stepped onto; a face of 7 stops). `FUN_0054aa30` casts at the
 * feet + step_height; a face that does not rise past that line is not a wall for this probe. */
function probeMeets(w: Wall, y: number): boolean {
  return w.minY < y && w.maxY > y;
}

/**
 * How far along the unit (dx, dz) from (x, z), within `len`, the ray first meets a footprint's edges (x, z pairs), or
 * null: the prone fan's line ahead (PF-16, `PRONE_FAN_READING`).
 */
function rayToFootprint(xz: number[], x: number, z: number, dx: number, dz: number, len: number): number | null {
  const n = xz.length / 2;
  let best: number | null = null;
  for (let i = 0; i < n; i++) {
    const ax = xz[i * 2]!, az = xz[i * 2 + 1]!, bx = xz[((i + 1) % n) * 2]!, bz = xz[((i + 1) % n) * 2 + 1]!;
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den;
    const u = ((ax - x) * dz - (az - z) * dx) / den;
    if (t < 0 || t > len || u < 0 || u > 1) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

/**
 * MV-PARITY (b2), a numerical tolerance, not a game value: a direction from the face's nearest point within this
 * (1 - cos) of the face's normal is a contact on the face, not at its end (`WALL_END_CONTACT_READING`).
 */
const WALL_END_ALIGN = 1e-3;

/**
 * HOTFIX BRIDGE-WEDGE, a numerical tolerance, not a game value: a disc within this of a face is clear of it (the slide
 * stands a body off at the radius to float precision; `WEDGE_PUSH_OUT_ADAPTATION`).
 */
const WEDGE_CLEAR = 1e-3;

/**
 * B194 merge seam (MV-PARITY b2 x PRONE-TILT-2): the tilted prone line's push (`Walker.tiltedAhead`) is a face hit along
 * the wall's normal, as the level line's is, so its normal joins the slide's `faces` for the face ends' pass
 * (`WALL_END_CONTACT_READING`): the unit direction from (x, z) to `moved`, or nothing for no push.
 */
function faceOfPush(x: number, z: number, moved: readonly [number, number]): number[] {
  const px = moved[0] - x, pz = moved[1] - z, d = Math.hypot(px, pz);
  return d > 1e-9 ? [px / d, pz / d] : [];
}

/**
 * PRONE-TILT-2 (3): where the prone low line, tilted (`PRONE_PROBE_TILT_READING`), first meets a wall polygon -- the line
 * from (x, y, z) along the unit (dx, dz) rising `k` a unit, within `len` along the travel: its crossing of the wall's
 * plane, inside the polygon and strictly within its height (as `probeMeets`). The horizontal distance and the point, or
 * null. With `k` 0 it is `rayToFootprint` on the cut at y (the callers keep that path for a level line).
 */
function rayToWallTilted(w: Wall, x: number, y: number, z: number, dx: number, dz: number, k: number, len: number): { t: number; x: number; y: number; z: number } | null {
  const [nx, ny, nz] = w.n3, p = w.poly.points;
  const den = nx * dx + ny * k + nz * dz;
  if (Math.abs(den) < 1e-12) return null;
  const t = (nx * (p[0]! - x) + ny * (p[1]! - y) + nz * (p[2]! - z)) / den;
  if (!(t >= 0 && t <= len)) return null;
  const hx = x + dx * t, hy = y + k * t, hz = z + dz * t;
  if (!(w.minY < hy && w.maxY > hy)) return null;
  // Inside the polygon: the crossing test on the plane's two axes that keep the most of it.
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const [i, j] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
  const u = [hx, hy, hz][i]!, v = [hx, hy, hz][j]!;
  let inside = false;
  for (let a = 0, n = p.length / 3, b = n - 1; a < n; b = a++) {
    const ua = p[a * 3 + i]!, va = p[a * 3 + j]!, ub = p[b * 3 + i]!, vb = p[b * 3 + j]!;
    if ((va > v) !== (vb > v) && u < ((ub - ua) * (v - va)) / (vb - va) + ua) inside = !inside;
  }
  return inside ? { t, x: hx, y: hy, z: hz } : null;
}

/**
 * HOTFIX BRIDGE-WEDGE: whether the point (x, y, z) -- a probe line's start -- lies in front of the wall polygon's plane by
 * its own normal (its winding's, `polygonNormal`) or on it: the side a hull segment must start on to hit it (research 281
 * s4.3, `FUN_002d2890` micro 288-333). In three axes, so a leaning face is judged at the line's height. A polygon with no
 * normal, and a moving owner's (a door leaf: the port's own sweep of it, DOORS, whose faces the hotfix does not judge),
 * count as met from in front: two-sided, as before.
 */
function frontOf(w: Wall, x: number, y: number, z: number): boolean {
  if (w.moving) return true;
  const own = polygonNormal(w.poly.points);
  if (own === null) return true;
  const p = w.poly.points;
  return (x - p[0]!) * own[0] + (y - p[1]!) * own[1] + (z - p[2]!) * own[2] >= -FACE_EPS;
}

/** The nearest point of a convex footprint (x, z pairs) to (x, z), and whether (x, z) is inside it. */
function nearest(xz: number[], x: number, z: number): { x: number; z: number; d: number; inside: boolean } {
  const n = xz.length / 2;
  let best = { x: xz[0]!, z: xz[1]!, d: Math.hypot(x - xz[0]!, z - xz[1]!) };
  let left = false, right = false, area = 0;
  for (let i = 0; i < n; i++) {
    const ax = xz[i * 2]!, az = xz[i * 2 + 1]!, bx = xz[((i + 1) % n) * 2]!, bz = xz[((i + 1) % n) * 2 + 1]!;
    const ex = bx - ax, ez = bz - az, len = ex * ex + ez * ez;
    const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len)) : 0;
    const px = ax + t * ex, pz = az + t * ez, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, d };
    const cross = ex * (z - az) - ez * (x - ax);
    if (cross > 1e-9) left = true; else if (cross < -1e-9) right = true;
    area += ax * bz - bx * az;
  }
  return { ...best, inside: Math.abs(area) > 1e-6 && !(left && right) };
}

/**
 * STANCE_WORD_ACTION_CROUCH_READING (LATER 434; research 87 1.13, §16): PICKUP BODY -- the action press's dispatch
 * `FUN_00592d50` takes action 8 (bit 0x100, label record 9: "PICKUP BODY", `FUN_0021ded0` D:L73681-73682; record 8 is
 * "PRESS AND HOLD", record 10 "DROP BODY" D:L73691-73692) to `FUN_00546c00` with the nearest dead body (`+0x168`,
 * `FUN_005940d0` D:L452680-452684, its cap 900; D:L452069), offered within a squared distance of at most 300, about 17.3 units (`FUN_005a89c0`, D:L463119), and
 * taken by `FUN_00579a30` with the SEAL nearly still (its velocity's square at most 64, D:L438367-438371; was misread "within
 * 8" of the body: research 368 §0.1),
 * whose `FUN_00579a30` writes the crouch request and raises the stance word's bit (D:L438417) when clip 0x12 is not
 * playing and either clips 0x11 and 0x13 are not playing or the top play's stance (`+0x2b`) is not crouched, then runs
 * `FUN_00581990`. The port has no body carry, so nothing is raised. Settles it: the carry's port (LATER 494).
 */
export const STANCE_WORD_ACTION_CROUCH_READING = 'not raised: PICKUP BODY unported (LATER 494)' as const;
/**
 * STANCE_WORD_CROUCH_FALLBACK_READING (LATER 434): the crouch state `FUN_00584c60` writes the stand request and the bit
 * (D:L444287) when the crouch move's clip (type 0x12) is still not playing after its push (`FUN_00588bc0(actor, 0x12, ..)`,
 * D:L444277-444283) -- the push refused; the port's SEAL set always holds the clip, so there is no path to raise it on.
 * Settles it: `FUN_00589900`'s refusals of that push read, with the per-weapon-class motion record (whether a class
 * lacks type 0x12).
 */
export const STANCE_WORD_CROUCH_FALLBACK_READING = 'not raised: the clip is always held' as const;
/**
 * STANCE_WORD_DIVE_REQUEST_READING (LATER 434): the dive's second entry -- a prone request `FUN_00552ec0` accepts raises the
 * bit at once (`FUN_00552d60` D:L418879) and, when the controller's `+0x30` answers and `FUN_00584b00` allows, the dive
 * `FUN_0057e540` follows (D:L418881-418893). The player's `CSealCtrl` answers `+0x30` with 0 (0x5499d0: `jr ra; daddu v0,
 * zero, zero`), so it is never the player's: the player's dive is the press's (`FUN_00594cf0` D:L453387-453390), its bit
 * at the later acceptance (`./traversal` `DIVE_PRONE_TAKE_READING`). Settles it: which controllers answer `+0x30`.
 */
export const STANCE_WORD_DIVE_REQUEST_READING = "never the player's: CSealCtrl's +0x30 answers 0" as const;

/**
 * The mover. `advance` is what the page calls each frame; `tick` is one 60 Hz step; `place` stands it on the floor
 * under a point. The page reads `eye` for the camera and writes `state.yaw` / `state.pitch` from the look.
 */
export class Walker {
  readonly state: WalkState = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, stickForward: 0, stickRight: 0 };
  private stance_: Stance = 'stand';
  /** Off the ground, falling (`fall`). */
  private inAir = false;
  /** The last landing, null in the air or before the first fall. */
  private landing_: Landing | null = null;
  /** Seconds since the feet left the floor, while airborne. */
  private airTime = 0;
  /** `FUN_005858a0`'s direction class, kept for its hysteresis. */
  private cls: MoveClass = -1;
  /** The body in use: the stance, but `stand` while a crouch runs at full stick. */
  private posture_: Stance = 'stand';
  /** The action holding the mover (`MoverAction`), or null. */
  private action_: MoverAction | null = null;
  private serial = 0;
  /** `actor+0x135c`: seconds before the next jump may start. */
  private jumpLock = 0;
  /** `actor+0x1360`: seconds before the running jump's impulse, counted down by the game frame; 0 when none is pending. */
  private jumpDelay = 0;
  /** In a running jump (`actor+0x1061` bit 1): the fall runs from the impulse, not from a walk-off. */
  private jumping = false;
  /**
   * The air's game frames (PF-03, ruling PF.R8, research 208 section 2): started at each take-off, it turns the 60 Hz
   * ticks into the 30 Hz frames the fall steps at (`fall`).
   */
  private readonly airClock = new GameFrameAccumulator();
  /**
   * PRONE-TILT-2 (the EPH pass, Q2; proven, capture): the tilt rule's game frames. `FUN_005506a0` runs `FUN_00548090`
   * once an actor tick (D:L417863), and the original ticks once a 30 Hz game frame (`GAME_FRAME_DT`); the capture shows
   * the settling prone body closing 0.200 of the remaining angle a guest frame (runs 20261031T162022Z, 162058Z,
   * 162130Z, 162310Z; agent-mail/evidence/eph-tilt-measured-2026-10-31/FINDINGS.md). So the rule steps on this clock's
   * frames, not every 60 Hz walk tick (which eased twice as fast).
   */
  private readonly tiltClock = new GameFrameAccumulator();
  /** The velocity carried through the air and a landing clip (`actor+0x1350` / `+0x1358`), world x and z. */
  private carried: [number, number] = [0, 0];
  /**
   * LATER 676 (`RUNNING_JUMP_SPEED`): the last ground tick's velocity before the walls cut it -- the port's stand-in for
   * the clip's `+0x2c` / `+0x34`, which the jump's speed test reads (`FUN_0057e1b0` D:L440812-440814). Written at the
   * start of `slideOrMove` (the slide's per `JUMP_SPEED_SLIDE_READING`); null on a tick that never reached it (the air,
   * a move's driver), when the jump reads the tick's own velocity.
   */
  private bodyVelocity_: [number, number] | null = null;
  /** HOTFIX BRIDGE-WEDGE (`WEDGE_PUSH_OUT_ADAPTATION`): where the body stood when the tick began, x and z. */
  private tickFromX = 0;
  private tickFromZ = 0;
  /** HOTFIX BRIDGE-WEDGE (`WEDGE_PUSH_OUT_ADAPTATION.ticks`): the ground ticks left in which the push-out may still act. */
  private wedgeArmed = 0;
  /**
   * SEGMENT-BODY: the move's stored contact `actor+0x1090..+0x10ac` (`FUN_005b0d30`, `JUMP_CONTACT_PROVEN`): the hit
   * point, the hit polygon and its own normal, or null. Part 2: the one contact the climb's offer reads too
   * (`storedContact`; `FUN_005b3ce0` reads `+0x10ac`, D:L469121-469127).
   */
  private contact_: StoredContact | null = null;
  /**
   * SEGMENT-BODY part 2 (`./weaponLine`): the models of the weapons in the hands, by `WEAP_GEO` name -- the rifle's
   * (`hand` 0, the hand byte `+0xf79` 1) and the pistol's (`hand` 1, the byte 2), the entries `FUN_0054e8f0` takes the
   * weapon line's length from (D:L416869-416870). Set from the kit at each spawn and pickup (`./loadout`
   * `heldWeaponModels`, by `slotModel`): the room's body in match `room.ts` `spawn` and `worldDrops.ts` `take`, the
   * page's through `WalkMode.setHeldModels` (`./matchFirearm` `spawnKit`, `takeKit`), which every mover the walk makes
   * carries. Until a kit is set, the port's SEAL's M4A1 SD and Mark 23 (`HELD_RIFLE`, `HELD_SIDEARM`; W2.R4): the
   * walkers no kit reaches -- a test's, a tool's, a bot's probe. An item up keeps the firearm's
   * (`WEAPON_LINE_ITEM_MODEL_PLACEHOLDER`). null: no weapon held, no line (D:L416870: no entry or no model,
   * `FUN_0054e8f0` returns false).
   */
  heldModels: { rifle: string | null; pistol: string | null } = { rifle: DEFAULT_WEAPON, pistol: DEFAULT_SIDEARM };
  /** SEGMENT-BODY part 2: whether this body casts the weapon line at all (`WEAPON_LINE_BOTS_READING` for the bots: none). */
  weaponLineCast = true;
  /**
   * The floor's normal under the feet (`actor+0x1344..+0x134c`: `FUN_0059b440` copies the floor record's normal on a tick
   * the body stands on the floor, D:L456525-456533; up at the body's creation, D:L419834-419836), written where the mover
   * stands on a floor and held in the air. Its y (`+0x1348`) is the jump's slope test and the prone eye's
   * (`FUN_0029ae50` D:L142596); the whole is the prone aim limits' lean (`FUN_00594600` D:L452866-452867;
   * `./look` `PRONE_AIM_LEAN_READING`). Written in place: `floorNormal` hands out a copy.
   */
  private floorNormal_: [number, number, number] = [0, 1, 0];
  /** Slide speed `actor+0x1340` (research 201 §3). 0 when the surface test does not pass. */
  private slideSpeed_ = 0;
  /** `seal_slide` would play: speed at or over g/4, and no swap in progress. The clip is not on the action stack. */
  private slideClip_ = false;
  /**
   * The floor under a slide step. A face steeper than 50° has `|n_y| < 0.7`, so ditype-3 ground is also a wall
   * (`isWallSurface`). The slide move must not be pushed out of the polygon it is standing on (research 230 §3).
   */
  private slideFloorPoly_: WorldPoly | null = null;
  /** The ground state as it last ran (`GroundMotion`). */
  private ground_: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
  /** The ground state the feet left the floor in: the play the launch or the fall was pushed over (`land`). */
  private groundBefore: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
  /**
   * PAR-62, PAR-66: this tick landed (`land`), the top changed -- the fall popped, or the stack popped to its base and the
   * landing's clip pushed -- cleared at each tick's start: its stick's cut is not asked (`cutAsked`).
   */
  private landedPop = false;
  /** PAR-64: the move axes the stick's cut reads on this tick (`cutStick`). */
  private cutStick_: { forward: number; right: number } = { forward: 0, right: 0 };
  /** `FUN_00586c10`'s snaps so far (`throttleSnaps`): each one a cross-fade of `STICK_SNAP_BLEND` in the animator. */
  private stickSnaps_ = 0;
  /** The kit's one-shot holding the mover (`HOLD_CLIPS`: a throw, the claymore's placing, a still reload), or null. */
  private hold_: MoverHold | null = null;
  /**
   * PAR-79: the reload hold the fall covers (`COVERED_HOLDS`), its clock stood from the take-off (`takeOff`) to a clipless
   * landing that hands it back (`land`); dropped by any other way back to the floor or a knock. Null when none.
   */
  private coveredHold_: MoverHold | null = null;
  /**
   * PAR-82 (research 251 section 12.3, "PAR-82"): asked at the take-off whether the fall covers the reload hold now on the
   * mover -- the room's (`room.ts` `watchMoves`) and the page's (`./walk` `attachMoves`) still clip's family
   * (`./stillReloadLife` `fallCovers`). The hold is a stand-in (H77) and cannot tell `Rifle m203 reload`, which no fall
   * covers (`FUN_005af930` D:L466816-466828) and any landing pops (D:L466897, D:L466900-466901): told no, the take-off ends
   * it `replaced` and no landing hands it back. Null (a mover nobody tells): every hold of `COVERED_HOLDS` is covered.
   */
  holdCovered: (() => boolean) | null = null;
  /** PAR-79: the seconds this tick's clocks have run (`runClocks` in `step60`; 0 between ticks). */
  private clocked = 0;
  /** The holds taken so far (`hold`): each start counts once (`PlaySnapshot.holdSerial`). */
  private holdStarts_ = 0;
  /**
   * Research 303: the victory dance on top of the stack (`FUN_0057dcc0` D:L440577-440613 pushes the server's variant
   * through `FUN_00588bc0`), one mover for the page's prediction and the room's: its clip's root X/Z keys moved along the
   * facing on the mover's collision (`FUN_0028c250` -> `FUN_00289bb0` D:L132696+, as `clipVelocity` reads them), its
   * one-shot clock (`oneShotSeconds`), its `NoFire` (`./net/fireCapability`). The stick or the turn past
   * `INTERRUPT_STICK` cuts it (`FUN_00587c20` D:L445514+, the clip's NoInterrupt absent), as a death, an action or a hold does.
   *
   * PARITY-1 close (research 251 section 9): a body owner of PAR-19's model -- `bodyOwner()` reports it (`victory`), so
   * the stance gate keeps a press pending, the jump and the swap refuse it, the dive takes it off; every end goes through the model
   * (`endBody` / `endVictory`, heard by `onActionEnd`) with its reason. Read-only here: its owner stops it with
   * `stopVictoryMotion`.
   */
  get victoryMotion(): VictoryMotion | null {
    return this.dance_;
  }
  private dance_: VictoryMotion | null = null;
  /** The dances started so far: each start counts once (the `victory` owner's `BodyOwner.serial`). */
  private danceStarts_ = 0;
  /**
   * The dance started on `clip` (`motion`: its `motion.rdr` row), `elapsed` seconds in; none without its root keys. A
   * dance already on comes off for the new one (`replaced`), and so does an action under way: `FUN_0057dcc0` clears the
   * stack (`FUN_0058a4d0`, D:L440586) before it pushes the dance (D:L440588) -- the page's jump sent after the command
   * the room began the dance after ends there as the room never ran it (it refuses a jump under the dance). A hold under
   * way wins instead, as on the room: the dance begins and ends at once, `replaced` (below). A stance transition under
   * way is undone as well as ended (`undoTransition`): the room ran its press under the dance.
   */
  setVictoryMotion(clip: MotionClip, motion: { playback: number | null; noFire?: number | null }, elapsed = 0): void {
    const root = clip.parts.find((p) => p.name === 'skel_root'), n = clip.frameCount, playback = motion.playback ?? 0;
    this.endVictory('replaced');
    if (!root || n < 2 || root.translations.length < n * 3 || !(playback > 0)) return;
    const undo = this.undoTransition();
    this.endBody('replaced');
    const keys = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { keys[2 * i] = root.translations[3 * i]!; keys[2 * i + 1] = root.translations[3 * i + 2]!; }
    this.dance_ = { clip: clip.name, playback, frames: n, keys, elapsed, seconds: oneShotSeconds(playback, n), noFire: motion.noFire ?? null };
    this.danceStarts_++;
    // PARITY-1 close pass 5 (research 251 section 9): the transition's stance back, its press the request again -- through
    // the stance writer and the press (`changeStance`), whose gate (`retryStance`) keeps it under the dance and takes it
    // when the dance ends, as the room's mover did.
    if (undo) { this.stance = undo.from; this.changeStance(undo.want); }
    // PARITY-1 close pass 3: a hold already playing wins, in the room's order. The room starts the dance only on a free
    // body (server `room.ts` L982, `victoryStatus`'s `!w.holding`), so a hold here came from a command after the dance's
    // `seq`; the room ran that command over the dance (`./net/moverSim` L112, `w.hold`), whose push replaced the dance
    // (`hold`'s `endVictory('replaced')`, L1602 here), and the room then stops it (`room.ts` L2172, the `!victoryMotion`
    // check after `apply`). So the page's dance begins and ends at once as `replaced`; the hold plays on.
    if (this.hold_) this.endVictory('replaced');
  }
  /**
   * PARITY-1 close pass 5 (research 251 section 9): what a stance transition on top would leave if it had never been
   * taken -- the stance it left (`from`) and the request still wanted (`want`: the request pending, else the word now,
   * which a press taken during the transition may have changed) -- or null with none on top. The room starts a dance only
   * on a free body (server `room.ts` `victoryStatus`: `!w.action`), so a transition the page's mover has when it hears the
   * dance came from a press after the dance's `seq`, which the room ran under the dance: its gate kept the press as the
   * request (`FUN_00552ec0` D:L418927-418930: the dance is no looped top and no transition) and the stance stayed. A port
   * invariant keeping the page and the room agreeing: the original runs one machine, and its stack clear
   * (`FUN_0058a4d0`, D:L440586) leaves the stance word as it is (`FUN_0057dcc0` pushes the dance with `actor+0x174`,
   * D:L440588). The clip's `from` is `applyStance`'s: forward from the first stance of its name, reversed from the second.
   */
  private undoTransition(): { from: Stance; want: Stance } | null {
    const a = this.action_;
    if (!a || ACTION_FAMILY[a.name] !== 'transition') return null;
    const [first, second] = TRANSITION_STANCES[a.name as keyof typeof TRANSITION_STANCES];
    return { from: a.reversed ? second : first, want: this.pending_ ?? this.stance_ };
  }
  /**
   * PARITY-1 close: the dance's owner takes it off (`ActionEndReason` `stopped`, heard by `onActionEnd`) -- the room's
   * `stopVictory`, the page's `WalkMode.syncVictoryMotion(null)` -- or a move that takes the body from it, for its own
   * reason (the dive: `replaced`, `Traversal.dive`). Nothing when none plays.
   */
  stopVictoryMotion(reason: ActionEndReason = 'stopped'): void {
    this.endVictory(reason);
  }
  /**
   * Research 303 (the page's half): `ticks` of the dance the room ran before the page heard it began -- the commands the
   * page had sent past the one the room started it after (`victory.seq`) -- each the tick's root step, no stick read
   * (the room read the same commands' sticks). The page's mover then stands where the room's does.
   */
  advanceVictory(ticks: number, dt: number = TICK): void {
    for (let i = 0; i < ticks && this.dance_; i++) {
      if (this.dance_.elapsed >= this.dance_.seconds) { this.endVictory('complete'); break; }
      this.victoryStep(dt);
    }
  }
  /** One tick of the dance's root travel along the facing, on the mover's collision. */
  private victoryStep(dt: number): void {
    const dance = this.dance_!, s = this.state;
    this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
    const [tx, tz] = this.clipVelocity(dance.clip, { ...dance, travel: [] }, dance.seconds, dance.elapsed, false, dance.keys);
    const yaw = (s.yaw * Math.PI) / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
    s.vx = tx * c + tz * sn; s.vz = -tx * sn + tz * c;
    this.slideOrMove(s.stickForward, s.stickRight, dt);
    dance.elapsed += dt;
  }
  /**
   * PAR-37 (research 251 section 9): the mover's whole state as it stands now, a copy, kept by the page per command it
   * sends (`./walk` `WalkMode`) so the commands after a victory dance's `seq` can be run again under the dance from it
   * (`restoreState`, then `./net/moverSim` `MoverSim.apply`, the room's own rule) -- as `respawn` replays on a new mover.
   * What is not the simulation's is left out (`KEPT_SHARED`): the grid and its caches, the listeners, the moves, the clips'
   * roots and the frame's part-tick; the landing and the last end, which nothing mutates, are kept by reference.
   */
  saveState(): WalkerState {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this)) if (!KEPT_SHARED.has(k)) kept[k] = KEPT_BY_REFERENCE.has(k) ? v : keptCopy(k, v);
    return kept as WalkerState;
  }
  /** PAR-37: the state `saveState` kept laid back on this mover (no end is heard: nothing comes off, it is put back). */
  restoreState(kept: WalkerState): void {
    const self = this as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(kept as Record<string, unknown>)) {
      const copy = KEPT_BY_REFERENCE.has(k) ? v : keptCopy(k, v);
      if (k === 'state') Object.assign(this.state, copy);          // the same object: the page and the room hold it
      else self[k] = copy;
    }
  }
  /**
   * NU-1c B11 (`./traversal` `PISTOL_CLIMB_CLIPS_READING`): the weapon in hand, 0 the rifle and 1 the pistol -- the
   * actor's hand byte `+0xf79` (1 the rifle, 2 the pistol: `FUN_005a6fc0` D:L462189-462191), which `FUN_0057a330` reads
   * for each one-shot node's pistol sub-node (`FUN_0058c9e0`, D:L438739-438740). Taken by the swap the mover starts
   * (`swapWeapon`, the room's and the page's `MoverSim` alike), so it is the room's `MoverSim.weapon`; a page that lays
   * the firearm without a swap (`./walk` `WalkMode.resume`) sets it with its own.
   */
  hand: 0 | 1 = 0;
  /** Dead (online: the server's `kill`): a death landing stays down (`DEATH_LANDING_GETUP_PLACEHOLDER`). */
  private dead_ = false;
  /**
   * PRONE-TILT (`./rootTilt`; research 217 s7): the floor hit's normal under the feet after the tick's move, world axes
   * (`actor+0x410`, copied by `FUN_005b0420` from the floor pick at D:L467124-467134 when `FUN_0059acd0` answers 0 for the
   * hit's owner, D:L467123 -- else only the position is copied and the normal kept, D:L467136-467140; kept too when the
   * pick misses, D:L467049-467070), and the skeleton root's tilt as `FUN_00548090` left it (`stepRootTilt`).
   */
  private tiltNormal_: [number, number, number] = [0, 1, 0];
  private rootTilt_: RootTiltState = rootTiltStart();
  /** The last landing was a blast's knock-down (`knock`): its `Land forward` gets up, the game's own get-up. */
  private knockLanding_ = false;
  /** PAR-19: the stance asked for and not yet taken (`actor+0x374`: `changeStance`, `retryStance`), null when none. */
  private pending_: Stance | null = null;
  /** PAR-19: the last end of a body owner or the overlay (`ActionEnd`), and who hears each one (`onActionEnd`). */
  private lastEnd_: ActionEnd | null = null;
  private readonly endListeners = new Set<(end: ActionEnd) => void>();

  /**
   * Dead, as the match server has it (the net client's `kill`; a respawn makes a new mover): `Land forward` holds its
   * last key and no `Get up forward` follows (`FUN_005af590`: the SEAL dies in state 8). A kill heard after the offline
   * get-up began puts the landing's last key back.
   */
  get dead(): boolean {
    return this.dead_;
  }

  set dead(on: boolean) {
    this.dead_ = on;
    if (on && this.action_?.name === 'getUp') this.holdDeathLanding();
    else if (on && this.action_?.name === 'getUpBackwards') this.holdDeathLanding('landBackwards');   // BLAST KNOCK
  }

  /**
   * `Land forward` (or a blast's `Land backwards`) at its last key, held: the dead SEAL's pose (the clip ends; the body
   * stays down). What it replaces ends for `reason` (`ActionEnd`): the death, or the stick's cut of a dead landing.
   */
  private holdDeathLanding(name: 'landDeath' | 'landBackwards' = 'landDeath', reason: ActionEndReason = 'death'): void {
    const seconds = ACTION_SECONDS[name];
    this.endBody(reason);
    this.action_ = { name, serial: ++this.serial, t: seconds, seconds, reversed: false };
  }

  /**
   * In the 9x view or a scope (the page: `./zoom`'s state 4 and up; the server: the command's `Button.Scope`): the move
   * stick x `SCOPED_STICK` before anything reads it (`FUN_005966a0` 453818-453821) -- the ground state, the ramp, the
   * stick's cut of an action, a move's own tick.
   */
  scoped = false;

  /** The stance (`actor+0x174`): which ground state runs and which bands it reads (`STANCE`). */
  get stance(): Stance {
    return this.stance_;
  }

  /**
   * Sets the stance at once, with no transition clip (placing the mover, a new map, a get-up's end, the dive, the
   * water's fallback): `changeStance` is the game's. The pending request is the stance now (PAR-19: the original's
   * stance writers set `actor+0x374` with `actor+0x174`, e.g. the get-up D:L442048, the dive's press D:L453389).
   */
  set stance(stance: Stance) {
    this.stance_ = stance;
    this.posture_ = stance;
    this.pending_ = null;
  }

  /**
   * PAR-19 (research 251 section 2): the stance asked for and not yet taken -- the original's requested stance
   * (`actor+0x374`) where it differs from the stance (`actor+0x174`) -- or null. A press writes it (`changeStance`);
   * `FUN_00552d60` (D:L418867-418908) asks it of `FUN_00552ec0` once a frame (`retryStance`, each tick), so a stance
   * refused while a full-body one-shot owns the body is taken when the one-shot ends. The stance button's next press
   * toggles from it (`FUN_00594cf0` D:L453351-453354, D:L453380-453384 read `actor+0x374`; `./walk` `stanceIntent`).
   */
  get pendingStance(): Stance | null {
    return this.pending_;
  }

  /**
   * The game's stance press (`FUN_00594cf0` writes the request `actor+0x374`, D:L453331-453430; the same frame's
   * `FUN_00552d60` asks it of `FUN_00552ec0`, D:L418867-418908). PAR-19 (research 251 section 2): the request is
   * written, then asked of the gate (`stanceGate`) -- a full-body one-shot owning the body keeps it pending, asked again
   * each tick (`retryStance`) until the body is free (the crouched reload, a full-body swap, a throw, the standing
   * Jump); an obstacle keeps it pending too; no headroom forgets it. Taken, the stance is the new one at once, and on
   * the floor a transition clip holds the mover while it plays -- unless the SEAL is moving over `STANCE_MOVING` between
   * stand and crouch, which runs straight on (a change taken during a transition changes the word and plays no new
   * clip: the port's, research 251 section 6). The request is first taken as the game's would be
   * (`TickDriver.stanceFor`: in deep water the stance falls back before any clip starts, so no prone clip plays, and
   * none of its root motion, for a SEAL that cannot lie there -- issue #22). A press for the stance already held drops a
   * request pending (the press writes `actor+0x374` whole).
   */
  changeStance(stance: Stance): void {
    this.pending_ = stance === this.stance_ ? null : stance;
    this.retryStance();
  }

  /**
   * NU-1b B3 (research 313 sections 2.2, 5 and 6; `./traversal` `CLIMB_PENDING_STANCE_READING`): the request alone
   * written (`actor+0x374`), not asked of the gate now -- null, or the stance itself, leaves none pending. The climb's
   * push writes it crouch for a crouched SEAL (`FUN_00588bc0` D:L446244-446274) and its end keeps a press made under it
   * (the stance writer `stance` clears it), so `FUN_00552d60` asks it from the next tick on (D:L418867-418908).
   */
  requestStance(stance: Stance | null): void {
    this.pending_ = stance === null || stance === this.stance_ ? null : stance;
  }

  /**
   * NU-1b B1 (research 313 sections 1.2-1.3; `./traversal` `climbOffered`, `CLIMB_OFFER_GATE_READING`): the climb's
   * offer refusals the mover does not carry, asked by the offer each tick -- the rest of the reload lock (`FUN_005a7ab0`
   * D:L469416: the standing still clip, the reload's and the after-shot's clips, the after-shot's timer -- not the reload's delay timer, `CLIMB_LOCK_RELOAD_DELAY_READING`), the launcher's anim set and the
   * turret's (D:L469470-469474). The room (`room.ts`) and the page (`./walk` `attachMoves`) set it; null: none.
   */
  climbLock: (() => boolean) | null = null;

  /**
   * LATER 504 (research 215 §8.5; reading, pending review): whether the launcher's anim set (`DAT_0044d408`) is on the
   * body this tick -- the room (`room.ts`, its `launcherSet` at the command) and the page (`./walk` `launcherSetOn`) set
   * it; null: never. The raise `FUN_005a6d30` calls `FUN_0058c350(actor, DAT_0044d408, 0x12, 1, 0)` (D:L462105): the
   * set's "Crouch" row at posture 1 and the stance request crouch, with no transition (D:L447957-447995); either lower
   * gives the set back through `FUN_0058c4a0(actor, previous set, 0)`, the "Stand" row at posture 0 (the still lower's
   * end `FUN_005a60d0(.., 4)` D:L461769-461771; the stick's D:L418268-418272) -- `followLauncherSet`, at the tick's
   * start: the port's frame order (as `climbLock`'s), so the stick's lower stands the mover on the command after the
   * one it rides, where the original pushes the row in that frame (D:L418270). Under the set a stand press under the set leaves the body crouched: from posture 1 the crouch state's stand (`FUN_00552d60` -> `FUN_00552ec0` D:L418880 -> `FUN_00581dc0` -> `FUN_00581c10`) pushes the "Walk" row (type 2, moving, D:L442635) or "Stand -> Crouch" reversed (0x11, D:L442640) at posture 0, and neither resolves under the launcher set -- not among its own rows nor GLOBAL's (`animset.rdr` "launcher anim set", "GLOBAL" `type_name`; pinned by `tools/test/launcherSetRows.test.ts`) -- so `FUN_00588bc0`, after `FUN_0058c820`'s remap through the set's pair table (D:L448153-448194: the type unchanged when the set holds no pair, as the launcher set holds none, LATER 203), pushes nothing (D:L446078-446080) and the stance word stays the top clip's, crouched; the request lingers until either lower writes Stand
   * (`retryStance` drops it: the same body, nothing lingering to take after the set, whose end writes Stand anyway). The carry's guard on that request (D:L444814-444822) has no state here: the port carries no body
   * (LATER 494).
   */
  launcherSetOn: (() => boolean) | null = null;
  /**
   * LATER 512c (research 92 section 4, "LATER 512c's reading"; reading, pending review): whether a one-shot the mover does
   * not hold is on top of the body's stack on the command asked now -- the flinch (`FUN_005a2690`) or a map program's push
   * (a door's `Open door`), the page's flinch slot (`./walk` `flinchCut`) and the room's (`room.ts` `flinchFrom` ..
   * `flinchUntil`), read after the tick's pop (`[start, until)`, as `PENDING_STANCE_RETRY_READING`'s `'afterClocks'`), not
   * while the fall covers it. `FUN_00552ec0` takes a stance request only under a looped top or a stance transition
   * (D:L418927-418930; the play's bit 0x40 from the motion's `looped`, D:L135187-135189): under either one-shot the request
   * waits (`retryStance`), as under the mover's own (`bodyRefuses`). Null: never. Also asked by the prone-pop's adaptation
   * (`popStand`: no pop, the ordinary press waits; `stanceGate`, so `Traversal.cancelDive` refuses): its review's F1 -- the
   * adaptation's scope under a flinch (OT.R67), for the owner to overturn.
   */
  oneShotOnTop: (() => boolean) | null = null;
  /**
   * LATER 504: a prone press under the launcher's set -- the crouch state's prone request (`FUN_00584c60`) and whether the
   * set allows it are not read, so the port takes it as off the set (the stance gate's own answer). Settled by reading
   * the crouch state's prone branch under `DAT_0044d408`, or a capture of a prone press with the launcher up.
   */
  static readonly LAUNCHER_PRONE_PRESS_READING = "as off the set: a prone press under the launcher's set not read";
  /**
   * LATER 504's re-look (F3): under the set a stand press pops every clip above the base (`FUN_00581dc0` D:L442650) --
   * the raise or the still lower's clip, the launcher's reload -- and under a low ceiling `FUN_00552ec0` resets the
   * request (D:L419011); the port's `retryStance` drops the request and cuts nothing. Settled by porting the pop (which
   * clips a player's stand press can find above the base under the set) or a capture of a stand press mid-raise.
   */
  static readonly LAUNCHER_STAND_PRESS_POP_READING = "not ported: a stand press under the launcher's set cuts no clip";
  /** LATER 504: the launcher's set as `followLauncherSet` last saw it. */
  private launcherSet_ = false;

  /** LATER 504: the set's start kneels the mover at once, its end stands it at once (`launcherSetOn`). */
  private followLauncherSet(): void {
    const on = this.launcherSetOn?.() === true;
    if (on === this.launcherSet_) return;
    this.launcherSet_ = on;
    if (this.dead_) return;
    this.stance = on ? 'crouch' : 'stand';
  }

  /**
   * `FUN_00552d60` (D:L418867-418908): the pending stance asked of `FUN_00552ec0` -- taken (`applyStance`), kept (the
   * body owned, an obstacle) or forgotten (no headroom). Never for a dead SEAL (`FUN_00551ec0` D:L418606-418611 skips
   * it in state 8). The water's rewrite (`FUN_00581660` / `FUN_00581990` write `actor+0x374` to the stance they fall
   * back to, D:L442436-442560) is `TickDriver.stanceFor`'s, asked once the body is free.
   */
  /**
   * LATER 414 (research 87 1.13's cases): the stance word's one-time bit, `actor+0x105f` bit 0 -- raised where the original
   * raises it: the body's making (`FUN_00553ea0` D:L419779: a spawn's word), a stance taken (`applyStance`, `FUN_00552d60`
   * once `FUN_00552ec0` accepts), and `markStanceTaken`'s callers; not by a motion's own stance writes (`stance`'s setter:
   * a climb's state 0 and its pop, a ladder's push, the dive's start). Read and cleared once by the HUD
   * (`takeStanceTaken`, `FUN_00582500` D:L442890-442900). The forced-stance writers the 1.13 row lists beside these are
   * not mapped to the port's paths (a named gap).
   */
  private stanceTaken_ = true;
  /** LATER 414: raise the stance word's bit (a take the motion code makes itself: the dive's prone, once it is down). */
  markStanceTaken(): void {
    this.stanceTaken_ = true;
  }
  /** LATER 414: whether the stance word's bit was raised since the last read, clearing it (`FUN_00582500`). */
  takeStanceTaken(): boolean {
    const t = this.stanceTaken_;
    this.stanceTaken_ = false;
    return t;
  }

  private retryStance(): void {
    const want = this.pending_;
    if (want === null || this.dead_) return;
    if (want === this.stance_) { this.pending_ = null; return; }
    // LATER 504: under the launcher's set a stand from crouch resolves no row (`FUN_00581c10`'s "Walk" / "Stand -> Crouch",
    // D:L442635-442640, absent from the set; `FUN_00588bc0` pushes nothing, D:L446078-446080): the crouch stays. The press's
    // pop of the clips above the base is not ported (`LAUNCHER_STAND_PRESS_POP_READING`).
    if (want === 'stand' && this.launcherSet_ && this.launcherSetOn?.() === true) { this.pending_ = null; return; }
    if (this.bodyRefuses(want)) return;                          // FUN_00552ec0 D:L418927-418930: owned, kept
    if (this.oneShotOnTop?.() === true) return;                  // LATER 512c: the flinch's or a door's one-shot on top, kept
    const stance = this.driver?.stanceFor?.(this, want) ?? want;
    if (stance === this.stance_) { this.pending_ = null; return; }
    const gate = this.placeGate(this.stance_, stance);
    if (gate === 'kept') return;                                 // an obstacle: actor+0x374 untouched, asked again
    this.pending_ = null;                                        // taken, or no headroom (D:L418991, D:L419011)
    if (gate === 'open') this.applyStance(stance);
  }

  /** The stance taken (`FUN_00552d60`'s dispatch, D:L418877-418905): the word now, the transition clip on the floor. */
  private applyStance(stance: Stance): void {
    const from = this.stance_;
    this.stance = stance;
    this.stanceTaken_ = true;                                    // LATER 414: a stance taken raises the word's bit
    // MOVE-2 (SEPARATE only, OT.R93; research 80 section 6g): a press the gate took under a held stance transition
    // (`bodyRefuses`: the clip refuses only its one target, D:L418932, D:L418953, D:L418995) -- the handler pops the
    // stack (`FUN_00581dc0` / `FUN_00581660` / `FUN_00581990`) and picks from the old stance word (`+0x174`), as from a
    // free body: standToProne reversed from its end (C1b, S6), crouchToProne forward from 0 (C1c) -- and stand <-> crouch
    // reads the held clip's 3D root speed as past 10 (`STANCE_CANCEL_CLIP_SPEED_READING`): no clip (C1a).
    const held = this.action_;
    const cancel = this.stanceSeparate && !this.inAir && held !== null && ACTION_FAMILY[held.name] === 'transition';
    if (cancel) this.endBody('replaced');
    if (this.inAir || (this.action_ && this.action_.name !== 'fall')) return;
    const moving = cancel || Math.hypot(this.state.vx, this.state.vz) > STANCE_MOVING;
    const pair = (a: Stance, b: Stance): boolean => (from === a && stance === b) || (from === b && stance === a);
    let name: MoverActionName;
    if (pair('stand', 'crouch')) { if (moving) return; name = 'standToCrouch'; }
    else if (pair('crouch', 'prone')) name = 'crouchToProne';
    else name = 'standToProne';
    const reversed = stance !== 'prone' && !(from === 'stand' && stance === 'crouch');
    this.start(name, ACTION_SECONDS[name], reversed);
    // SEP-POP (OT.R93): the original's pushes leave the velocity (`FUN_005817d0` D:L442494-442518, `FUN_00581c10`
    // D:L442622-442641, `FUN_00581540` write none); COMBINED (and a bot's mover) keeps main's zero -- COMBINED-CUT gave
    // COMBINED the cut alone (`stanceSeparate`). Either way the clip's root carries the body from this tick on
    // (`step60`'s held branch) or the cut's ground state does.
    if (!this.stanceSeparate) { this.state.vx = 0; this.state.vz = 0; }
  }

  /**
   * PAR-19 (research 251 section 2): `FUN_00552ec0`'s answer for `to` asked of the body now (`StanceGate`) -- the body's
   * owner first (`effectiveAction`), then the place's gates (`stanceRefused`). The water's fallback is not asked
   * (`TickDriver.stanceFor`, at the request's turn).
   */
  stanceGate(to: Stance): StanceGate {
    if (to === this.stance_) return 'same';
    if (this.bodyRefuses(to) || this.oneShotOnTop?.() === true) return 'owned';   // LATER 512c review F1: the flinch's slot too
    return this.placeGate(this.stance_, to);
  }

  /**
   * OT.R67 (`./stanceButton` `PRONE_POP_ADAPTATION`; no original -- the owner's word makes it the default, MISSION
   * OT.R67): the prone-pop's stand. From prone -- settled, or the forward drop into it under way (`standToProne`,
   * `crouchToProne` played forward: the press that went down) -- the stance word and the posture are stand's at once (the
   * `stance` setter, as a taken stand's are in `applyStance`: the hull, the headroom and the hit volumes change when they
   * would), with no get-up clip and so no mover hold; the drop under way comes off `replaced` (`onActionEnd` hears it).
   * The place's gate is the press's: headroom to the feet + 19 (`placeGate`, D:L419007) -- the drop's own refusal of a
   * stand (`TRANSITION_REFUSES`, D:L418995) is the one gate it passes over. From settled prone the velocity is zeroed as
   * the get-up it replaces zeroes it (`applyStance`); a drop's is left as the clip had it. `'refused'` (nothing changed):
   * dead, in the air, or no headroom. Null, no pop: not prone, or the body owned by anything but the drop (a hit, a hold,
   * the dance, a move's clip), or the flinch's slot on top (`oneShotOnTop`, LATER 512c review F1), or the drop with a hold under it (the original's refusal, `TRANSITION_REFUSES`
   * D:L418995, holds the stand until the drop and the hold end) -- the press is then the ordinary one.
   */
  popStand(): PopOutcome {
    if (this.dead_ || this.inAir) return 'refused';
    if (this.stance_ !== 'prone') return null;
    if (this.oneShotOnTop?.() === true) return null;             // LATER 512c review F1: the flinch's slot owns the body, as a hit does
    const a = this.action_;
    const drop = a !== null && (a.name === 'standToProne' || a.name === 'crouchToProne') && !a.reversed;
    if (drop && this.hold_ !== null) return null;
    if (a !== null ? !drop : this.bodyOwner() !== null) return null;
    if (this.placeGate('prone', 'stand') !== 'open') return 'refused';
    if (drop) this.endBody('replaced');
    else { this.state.vx = 0; this.state.vz = 0; }
    this.stance = 'stand';
    return drop ? 'drop' : 'prone';
  }

  /**
   * The outer gate and the transition's own refusal (`FUN_00552ec0` D:L418927-418930, D:L418932, D:L418953,
   * D:L418995): true when the body's owner keeps a request for `to` waiting -- any full-body one-shot but a stance
   * transition (`FUN_00588080`, D:L445716-445734: types 0x11, 0x13, 0x19 only), and a transition for the one target it
   * does not share. An overlay never refuses (the moving reload, the moving swap: the top is the looped locomotion).
   */
  private bodyRefuses(to: Stance): boolean {
    const body = this.bodyOwner();
    if (body === null) return false;
    if (body.family !== 'transition') return true;
    return TRANSITION_REFUSES[body.name as keyof typeof TRANSITION_REFUSES] === to;
  }

  /**
   * The place's gates (`stanceRefused`'s, in `FUN_00552ec0`'s order) with what each does to the request: an obstacle
   * keeps it (`kept`: prone D:L418935-418940, crouch D:L418958-418966 return 0 and leave `actor+0x374`), no headroom
   * forgets it (`reset`: D:L418987-418991, D:L419007-419011 write it back to the stance).
   */
  private placeGate(from: Stance, to: Stance): StanceGate {
    if (to === from) return 'same';
    if (to === 'prone') return this.proneRefused() ? 'kept' : 'open';
    if (to === 'crouch') {
      if (this.crouchRefused(from)) return 'kept';
      return from === 'prone' && !this.headroom('crouch') ? 'reset' : 'open';
    }
    return this.headroom('stand') ? 'open' : 'reset';
  }

  /**
   * PAR-19 (research 251 section 1): the full-body one-shot on top of the stack (`BodyOwner`), or null while a looped
   * state owns the body (`FUN_005551a0(top+0x28, 0x40)`, the idles and the locomotion): the walk's action, else the
   * kit's hold, else the victory dance (PARITY-1 close: `victory`), else a traversal's own clip on top
   * (`TickDriver.topOneShot`, the peek's lean clip). Every walk action and hold clip is a one-shot on the disc
   * (`motion.rdr` `looped` 0), and so is every dance (research 303 section 2).
   */
  bodyOwner(): BodyOwner | null {
    const a = this.action_;
    if (a) return { source: 'action', name: a.name, family: ACTION_FAMILY[a.name], serial: a.serial };
    const h = this.hold_;
    if (h) return { source: 'hold', name: h.clip, family: holdFamily(h.clip), serial: this.holdStarts_ };
    if (this.dance_) return { source: 'victory', name: 'victory', family: 'victory', serial: this.danceStarts_ };
    if (this.driver?.topOneShot?.(this)) return { source: 'move', name: 'move', family: 'move', serial: 0 };
    return null;
  }

  /** PAR-19: the overlay riding the locomotion (`OverlayOwner`): the moving swap, or null. */
  overlayOwner(): OverlayOwner | null {
    const o = this.overlay_;
    return o ? { clip: o.clip, family: 'swap', serial: o.serial } : null;
  }

  /**
   * PAR-19 (ruling PAR.R2; research 251 section 1): the effective action now (`EffectiveAction`) -- the one answer
   * every interruption check asks.
   */
  effectiveAction(): EffectiveAction {
    return { body: this.bodyOwner(), overlay: this.overlayOwner(), pendingStance: this.pending_, lastEnd: this.lastEnd_ };
  }

  /**
   * PAR-19 (research 251 section 3): a weapon swap owns the actor -- `FUN_005a7980(actor, 1)` (D:L462471-462506): the
   * full-body swap on top (0x35-0x37) or the moving swap on the second channel (`actor+0x1e4`'s `DAT_003dec68`,
   * D:L462488-462501). The dive (`FUN_00584b00` D:L443995-444001) and the swap's own gate (`swapRefused`) ask it. Not
   * the moving reload's overlay: that one rides the looped top and the dive takes it (research 230 section 1.1).
   * PAR-84 (research 230 section 5.2.10): nor only the firearm's -- the launcher's raise and still lower on top
   * (`DAT_003df0e0` / `DAT_003df0e8`, D:L462484-462491) answer too; they are no firearm swap (`swapProgress`,
   * `completeSwap` and `../remotePlayers` `remoteSwap` name the three swaps alone).
   */
  swapping(): boolean {
    const a = this.action_?.name;
    return a === 'swapStand' || a === 'swapCrouch' || a === 'swapProne' || a === 'rifleToLauncher' || a === 'pistolToLauncher'
      || this.overlay_?.clip === SEAL_ANIMS.swapMoving;
  }

  /**
   * PAR-19 (research 251 section 4): hears every end of a body owner or the overlay (`ActionEnd`), at the tick it comes
   * off; returns the unsubscribe. The page's clocks that outlive the mover's (a reload's lock and pose, a throw's pose
   * and busy tail) end on it rather than on a clock of their own.
   */
  onActionEnd(listener: (end: ActionEnd) => void): () => void {
    this.endListeners.add(listener);
    return () => { this.endListeners.delete(listener); };
  }

  /**
   * The action on the stack comes off for `reason` (`ActionEnd`), heard by `onActionEnd` -- and the victory dance with it
   * (PARITY-1 close): what takes the body (`start`'s action, `setAirborne`, a knock's fall, the take-off) takes it from
   * the dance too.
   */
  private endBody(reason: ActionEndReason): void {
    const a = this.action_;
    if (a) {
      this.action_ = null;
      this.emitEnd({ body: { source: 'action', name: a.name, family: ACTION_FAMILY[a.name], serial: a.serial }, overlay: null, reason });
    }
    this.endVictory(reason);
  }

  /** The victory dance comes off for `reason` (`ActionEnd`): `stopped` its owner's, else the body's reasons. */
  private endVictory(reason: ActionEndReason): void {
    if (!this.dance_) return;
    this.dance_ = null;
    this.emitEnd({ body: { source: 'victory', name: 'victory', family: 'victory', serial: this.danceStarts_ }, overlay: null, reason });
  }

  /** The kit's hold comes off for `reason`. */
  private endHold(reason: ActionEndReason): void {
    const h = this.hold_;
    if (!h) return;
    this.hold_ = null;
    this.emitEnd({ body: { source: 'hold', name: h.clip, family: holdFamily(h.clip), serial: this.holdStarts_ }, overlay: null, reason });
  }

  /** The overlay comes off for `reason`. */
  private endOverlay(reason: ActionEndReason): void {
    const o = this.overlay_;
    if (!o) return;
    this.overlay_ = null;
    this.emitEnd({ body: null, overlay: { clip: o.clip, family: 'swap', serial: o.serial }, reason });
  }

  private emitEnd(end: ActionEnd): void {
    this.lastEnd_ = end;
    for (const f of [...this.endListeners]) f(end);
  }

  /**
   * `FUN_00552ec0`'s gates (D:L418914-419025; PF-15, research 217 §1), asked of a change from `from` to `to`: prone from
   * stand or crouch, an obstacle near (`proneRefused`, D:L418935-418940); crouch from stand or prone, an obstacle near
   * (`crouchRefused`, D:L418952-418966) and from prone no headroom to the feet + 12 (`FUN_0057efe0(actor, 1)`,
   * D:L418987); stand from crouch or prone, no headroom to the feet + 19 (`FUN_0057efe0(actor, 0)`, D:L419007). The
   * press's dive asks none of them (`FUN_00594cf0` D:L453386-453390 runs `FUN_0057e540` itself; `./net/moverSim`).
   */
  stanceRefused(from: Stance, to: Stance): boolean {
    if (to === from) return false;
    if (to === 'prone') return this.proneRefused();
    if (to === 'crouch') return this.crouchRefused(from) || (from === 'prone' && !this.headroom('crouch'));
    return !this.headroom('stand');
  }

  /** `FUN_0054d620` for the prone gate (`PRONE_GATE_READING`): an obstacle 11.2 ahead or 8.0 behind at the feet + 3.25. */
  proneRefused(): boolean {
    const g = PRONE_GATE_READING;
    return this.obstacleNear(g.ahead, g.behind, SEAL_TUNING.stepHeight * g.lift);
  }

  /**
   * `FUN_0054d620` for the crouch gate (`CROUCH_GATE_READING`): an obstacle within the firepoint's reach x 1.2 ahead
   * (from prone, + 0.5) or 7.0 behind at the feet + 7.8. Nothing from crouch (the gate runs from stand or prone only).
   */
  crouchRefused(from: Stance = this.stance_): boolean {
    if (from === 'crouch') return false;
    const g = CROUCH_GATE_READING;
    const ahead = from === 'prone' ? CROUCH_GATE_REACH_READING.prone + g.pronePad : CROUCH_GATE_REACH_READING.stand * g.scale;
    return this.obstacleNear(ahead, g.behind, SEAL_TUNING.stepHeight * g.lift);
  }

  /**
   * `FUN_0054d620(ahead, behind, lift)` (D:L416194-416363): two level segments from the feet + `lift`, `ahead` along the
   * facing (the actor matrix's row +0x20 negated) and `behind` against it, cast together by `FUN_005ab590` (D:L464473);
   * true when either meets a wall.
   */
  private obstacleNear(ahead: number, behind: number, lift: number): boolean {
    const s = this.state;
    const yaw = (s.yaw * Math.PI) / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const p: [number, number, number] = [s.x, s.y + lift, s.z];
    const a: [number, number, number] = [p[0] + fx * ahead, p[1], p[2] + fz * ahead];
    const b: [number, number, number] = [p[0] - fx * behind, p[1], p[2] - fz * behind];
    return segmentHit(this.grid, p, a, isWallSurface) !== null || segmentHit(this.grid, p, b, isWallSurface) !== null;
  }

  /** The action holding the mover (`MoverAction`), or null. */
  get action(): MoverAction | null {
    return this.action_;
  }

  /** The kit's one-shot holding the mover (`hold`), or null. */
  get holding(): MoverHold | null {
    return this.hold_;
  }

  /** The holds taken so far (`hold`): a new one on the same clip is a new count (`PlaySnapshot.holdSerial`). */
  get holdStarts(): number {
    return this.holdStarts_;
  }

  /**
   * The kit's one-shot starts now and holds the mover (`HOLD_CLIPS`' header: a throw's clip at the button's release, the
   * claymore's placing, a crouched or prone reload): the ground state stops, the clip's root moves the SEAL, and the
   * stick or the turn cut it only past its `NoInterrupt`. Refused (false) for a clip that is no hold, in the air, and
   * for a `still` one (the crouched reload) above 20 a second -- the game plays the moving reload over the locomotion
   * then. The page's kit calls it (`WalkMode.hold`), the server's command (`./net/moverSim`). `period`: the seconds the
   * clip plays over when that is not its `playback` -- a still reload with the record's `ReloadTime` (research 150 F2:
   * both sides pass `./reloadClip` `reloadHoldPeriod` of the reload's seconds, review F-A), so the hold's clock, its
   * `NoInterrupt` and the body's clip agree. Over a running hold, `holdOverHold` answers (PAR-29, research 251 §11):
   * refused leaves the running clip as it is (nothing ended, no new start), replaced ends it `replaced`. `pass` (PAR-74):
   * the push's pass, which `holdPassOf` takes only for `seal_place_claymore` (the bomb's plant `'before'`; the claymore's
   * and the PMN's the default) -- the page's layer gives it, the room's bomb (`./net/moverSim` `holdPass`).
   */
  hold(clip: string, period?: number, pass?: HoldPass): boolean {
    if (!isHoldClip(clip) || this.inAir) return false;
    const s = this.state, c = HOLD_CLIPS[clip];
    if (c.still && s.vx * s.vx + s.vz * s.vz + s.vy * s.vy > 400) return false;
    if (this.hold_ && holdOverHold(this.hold_.clip, clip) === 'refused') return false;
    const p = period !== undefined && period > 0 ? period : c.playback;
    this.endHold('replaced');
    this.endVictory('replaced');                                 // the kit's push takes the dance's stack (research 303 s3)
    this.hold_ = { clip, t: 0, seconds: oneShotSeconds(p, c.frames), period: p, pass: holdPassOf(clip, pass) };
    this.holdStarts_++;
    return true;
  }

  /**
   * The hold's clock: it runs to the clip's end and comes off. `tick` runs it, and so does a held peek
   * (`./traversal` `leanTick`), which has the tick: the lean's toss is pushed over the lean and plays out there (research
   * 86 section 4.4), so the peek holds the mover while the toss's clock runs. PAR-69: a reload's hold comes off at the
   * driver's end test on the lagged clock (`reloadPlayedOut`), a command past its last key without a `ReloadTime`;
   * PAR-70 the throws' on the same (`LAGGED_HOLDS`: no end callback on their play, `FUN_005802b0`
   * D:L441900-441903, and none of `FUN_00582540`'s named types); the plants' at their last key
   * (`HOLD_PUSH_FRAME_READING`, research 101). PAR-74 and PAR-75: by the push's pass (`MoverHold.pass`) -- after the
   * driver `reloadPlayedOut` (the claymore's and the PMN's placing with the reloads and the throws), before it
   * `swapPlayedOut` (the bomb's plant; C4's, whose callback the advance ran and cleared at its 0.45 key, `FUN_0057a330`
   * D:L438996-439003, so `FUN_00582540` answers 1, D:L443131-443132). No placing has a `ReloadTime`: its period is its
   * playback.
   */
  runHold(dt: number): void {
    const h = this.hold_;
    if (!h) return;
    h.t += dt;
    if (h.back !== undefined) h.back += dt;                       // PAR-79: from the hand-back's tick
    const c = HOLD_CLIPS[h.clip];
    if (h.pass === 'after' ? reloadPlayedOut(h.t, h.period, c.frames, c.playback) : swapPlayedOut(h.t, c.playback, c.frames)) this.endHold('complete');
  }

  /** `FUN_00587c20` with `FUN_00550ef0`'s stick test, for the hold: past its `NoInterrupt`, a move axis or the turn past 0.1. */
  private holdCut(forward: number, right: number): boolean {
    const h = this.hold_;
    if (!h) return false;
    const c = HOLD_CLIPS[h.clip];
    // PAR-79: handed back by a clipless landing, asked from the next driver tick, a game frame past the landing's (the
    // landing's tick asks no cut, `FUN_00550ef0` D:L418176): the room's and the page's `stillClipCuttable`.
    if (h.back !== undefined && h.back < GAME_FRAME_DT) return false;
    const t = h.pass === 'after' ? h.t - RELOAD_PUSH_LAG : h.t;   // PAR-67, PAR-70, PAR-74: a frame behind the push
    if (!(t / (h.period * ((c.frames - 1) / c.frames)) > c.noInterrupt)) return false;
    return Math.abs(forward) > INTERRUPT_STICK || Math.abs(right) > INTERRUPT_STICK
      || Math.abs(this.turn / SEAL_TUNING.turnMaxRate) > INTERRUPT_STICK;
  }

  /** The upper-body overlay playing over the locomotion (the moving swap), or null. */
  get overlay(): MoverOverlay | null {
    return this.overlay_;
  }
  private overlay_: MoverOverlay | null = null;

  /**
   * The rifle <-> pistol swap's clip (`FUN_005a64c0`, decomp 461850-462030; the WEAPON workstream owns the item and
   * calls `Animator.setWeapon` at its hand-off): prone `Prone rifle -> Pistol`; crouched or standing, at 20 a second
   * or under (`|v|^2 <= 400`) `Crouch rifle -> Pistol` / `Rifle -> Pistol` as an action holding the mover, faster
   * `Moving rifle -> Pistol` over the locomotion. To the rifle each plays backwards (`FUN_00588bc0`'s fourth
   * argument 1, `FUN_0028c160`); the moving one runs backwards from its end (`FUN_00587780` kind 5, `FUN_0028d3f0(…, 1)`,
   * D:L445380-445398, 438618; research 211 §2). The gate (research 201 §1, 211 G4; one for the page and the room):
   * refused in the 9x view or a scope (`FUN_005c4fd0`: zoom 4 and up, `scoped` -- the page's `./zoom`, the room's
   * `Button.Scope`), in the air, and while an action plays (`FUN_005b4340(actor, 4)`: the landings, the get-ups, the
   * knock-down; a swap's own, `FUN_005a7980`) -- but not during a stance transition (206 §1.3 A27; the plan's PF-39),
   * which the swap's clip takes over: the stance word is already the new one (`changeStance`), so the selector reads it
   * [reading of the stance change; which clip the game plays there is owed to capture C3, research 211 §7]. Null when
   * refused.
   */
  swapWeapon(to: 'pistol' | 'rifle', scoped: boolean = this.scoped): SwapPick | null {
    if (this.swapRefused(scoped)) return null;
    const reversed = to === 'rifle';
    const s = this.state;
    const still = s.vx * s.vx + s.vz * s.vz + s.vy * s.vy <= 400;
    this.hand = to === 'pistol' ? 1 : 0;                          // NU-1c B11: the hand the swap takes (MoverSim.weapon's)
    if (this.stance_ === 'prone' || still) {
      const action = this.stance_ === 'prone' ? 'swapProne' : this.stance_ === 'crouch' ? 'swapCrouch' : 'swapStand';
      this.start(action, ACTION_SECONDS[action], reversed);
      s.vx = 0; s.vz = 0;
      return { action, overlay: false, reversed, seconds: ACTION_SECONDS[action] };
    }
    const seconds = SWAP_OVERLAY_SECONDS;
    this.overlay_ = { clip: SEAL_ANIMS.swapMoving, serial: ++this.serial, t: 0, seconds, reversed };
    return { action: null, overlay: true, reversed, seconds };
  }

  /**
   * PAR-84 (research 230 section 5.2.10): the launcher's raise (`reversed` false) or its still lower (true) pushed on the
   * stack -- `FUN_005a6d30` pushes `Rifle -> Launcher` / `Pistol -> Launcher` (D:L462112-462116) and `FUN_005a6b70` the
   * same type reversed (D:L462069-462070, D:L462078-462079) through `FUN_00588bc0`, which sends only a `BlendOverlay`
   * motion to the second channel (D:L446083-446085): a full-body one-shot on top, `NoInterrupt` bare. It holds the body
   * as the still swap does -- the velocity zeroed, the clip's root alone moving it, the stick never cutting it -- and
   * comes off on the driver's end test (`swapPlayedOut`, `runClocks`). Asked by the command it rides, before its swap and
   * its hold (`./net/moverSim` `MoverSim.prepare`'s `launcherClip`; the page's `./walk` `WalkMode.launcherRaised` /
   * `launcherLowered` at the press, as its swap). `elapsed`: the seconds since its own command, when a mover runs a later
   * command first (the room past a lost or dropped one): its clock caught up, none started past its end. In the air,
   * `LAUNCHER_RAISE_AIR_READING`.
   */
  launcherClip(name: LauncherClipName, reversed: boolean, elapsed = 0): boolean {
    const c = ACTION_CLIPS[name];
    if (this.inAir && LAUNCHER_RAISE_AIR_READING === 'refused') return false;
    if (swapPlayedOut(elapsed, c.playback, c.frames)) return false;
    this.start(name, ACTION_SECONDS[name], reversed);
    this.action_!.t = elapsed;
    this.state.vx = 0; this.state.vz = 0;
    return true;
  }

  /**
   * PAR-84: a launcher clip on the mover taken off without its end (`replaced`) -- a spawn's kit on the page
   * (`./walk` `WalkMode.launcherCleared`), as the room's spawn makes a new mover that holds none. Nothing otherwise.
   */
  dropLauncherClip(): void {
    const a = this.action_?.name;
    if (a === 'rifleToLauncher' || a === 'pistolToLauncher' || a === 'swapRifleExchange' || a === 'swapRifleClaim') this.endBody('replaced');
  }

  /**
   * The swap's gate alone (`swapWeapon`'s refusal, no clip started): in the 9x view or a scope (`scoped`: the room's the
   * last command's view, the page's the last tick's -- `WalkMode.swapGate`), in the air, or an action other than a
   * stance transition playing (`FUN_005c4fd0`, `FUN_005b4340(actor, 4)`; research 201 §1), or the victory dance owning
   * the body (`bodyOwner`'s `victory`: its NoFire refuses the swap through the common gate, research 303 section 3).
   */
  swapRefused(scoped: boolean = this.scoped): boolean {
    if (this.bodyOwner()?.family === 'victory') return true;
    // FUN_005b4340 code 4: a slide speed over 0.001 refuses the swap (research 201 §1, §27.3).
    if (this.slideSpeed_ > 0.001) return true;
    if (scoped || this.inAir || this.swapping()) return true;   // a swap playing, the moving one too (FUN_005a7980)
    const a = this.action_?.name;
    return a !== undefined && a !== 'standToCrouch' && a !== 'crouchToProne' && a !== 'standToProne';
  }

  /**
   * LATER 509: the hand the walker holds -- true for the sidearm (`MoverSim.weapon` 1) -- set by the page (`./walk`, its
   * `weapon_`) and the room (`room.ts`, `sim.weapon`); null: the rifle. The prompts' common gate's throw term reads it
   * (`throwOnTop`): the climb's offer (`./traversal` `climbOffered`), the gate's top (`gateTop`), the dance (`victoryStatus`).
   */
  pistolHand: (() => boolean) | null = null;

  /**
   * LATER 509 (research 369 §1 term 4): a throw's hold on top that the common gate's throw term holds for the hand. The
   * rifle's: every throw hold. The pistol's: all but its standing throw and its two lean tosses -- `FUN_0058c820` swaps a
   * one-shot to its pistol pair only where the Seal anim set holds the pistol type (D:L448176-448189; research 85 §8.1
   * item 3): the standing throw becomes "Pistol throw grenade" (S:0x660ed0, a record) and the lean tosses the pistol's peek
   * tosses (S:0x6615d0, S:0x661600), none among D:L462622-462626's words; the crouched and prone throws' pistol types
   * (ELF 0x6617e0, 0x6617a0) have no record, so the rifle's "Crouch throw grenade" / "Prone throw grenade" stay on top --
   * term 4 (the review's F1: *was* every throw clip excused); the tosses are term 4 either way. One function for the
   * gate's top, the climb's offer and the dance.
   */
  throwOnTop(pistol = this.pistolHand?.() === true): boolean {
    const h = this.hold_;
    if (!h || holdFamily(h.clip) !== 'throw') return false;
    return !(pistol && (h.clip === 'seal_throwgrenade' || h.clip === 'seal_toss_rlean' || h.clip === 'seal_toss_llean'));
  }


  /**
   * LATER 220 (research 369 §1; reading, pending review): the walker's terms of the action prompts' common gate
   * (`./net/actionGate`), `pistol` the hand: a throw's hold on top, the review's F1 -- term 4's words (`FUN_005a7de0`
   * D:L462622-462626 on the words of D:L495211-495237) are the rifle's throws, the four tosses (the pistol's two among
   * them) and the rifle's peek tosses; the pistol's standing throw and peek tosses are not (its crouched and prone throws
   * keep the rifle's types: research 85 §8.1 item 3), so with the pistol only its standing throw and its lean tosses are no
   * term (`throwOnTop`) --
   * not a placing's; a reload's hold (`FUN_005a7ab0`'s clips, D:L462527-462546); a swap's clip or its moving overlay or the
   * launcher's raise (`FUN_005a7980`'s, D:L462484-462497); a get-up (the walker's get-up actions for `FUN_00587f90`'s
   * animation types, D:L462679); null: none of them.
   */
  gateTop(pistol = this.pistolHand?.() === true): GateTop | null {
    const h = this.hold_;
    if (h) {
      const family = holdFamily(h.clip);
      if (family === 'reload') return family;
      if (family === 'throw') return this.throwOnTop(pistol) ? 'throw' : null;
    }
    if (this.swapProgress() !== null) return 'swap';
    const a = this.action_;
    if (a && (a.name === 'rifleToLauncher' || a.name === 'pistolToLauncher')) return 'swap';
    if (a && ACTION_FAMILY[a.name] === 'getUp') return 'getUp';
    return null;
  }

  /**
   * WEAPON: the swap clip playing -- the standing, crouched or prone action, or the moving overlay (a standing swap cut
   * by the stick goes on as the overlay at the phase it reached) -- and its progress; null when none is (it ended, or
   * another action took the mover).
   */
  swapProgress(): SwapProgress | null {
    const a = this.action_;
    if (a && (a.name === 'swapStand' || a.name === 'swapCrouch' || a.name === 'swapProne') && a.seconds) {
      return { action: a.name, overlay: false, progress: Math.min(1, a.t / a.seconds) };
    }
    const o = this.overlay_;
    if (o && o.clip === SEAL_ANIMS.swapMoving && o.seconds > 0) return { action: null, overlay: true, progress: Math.min(1, o.t / o.seconds) };
    return null;
  }

  /**
   * PF-19 (`./net/blast` `applyKnock`; research 218 s3): a pending swap completed at once, as the knock's
   * `FUN_005a5da0` (D:L461653-461756) completes a pending weapon switch before the reaction: the swap's clip (the
   * standing, crouched or prone action, or the moving overlay) comes off the mover, so the kit's swap ends where it was
   * going (`./kit` `Kit.frame`: the clip over, the swap with it -- the target in the hand) and the room's weapon, already
   * the target at the swap's start (`./net/moverSim`), stands. KNOCK_SWAP_COMPLETE_READING: the hand-off is forced, the
   * clip's remaining phase skipped. True when a swap was playing.
   */
  completeSwap(): boolean {
    let was = false;
    const a = this.action_?.name;
    if (a === 'swapStand' || a === 'swapCrouch' || a === 'swapProne') { this.endBody('completed'); was = true; }
    if (this.overlay_?.clip === SEAL_ANIMS.swapMoving) { this.endOverlay('completed'); was = true; }
    return was;
  }

  /**
   * A1 (the push read; `FUN_0058c350` D:L447957-447994): the turret's take on the body. The overlay is cleared
   * (`FUN_0028d940(actor+0x170)` D:L447983), the stack popped to its base (`FUN_0058a5e0(actor, 0, 1)` D:L446796-446798),
   * the standing base motion set at stance 0 (D:L447989) and the request cleared (`+0x374` = 0, D:L447992). A pending swap
   * is completed first (`completeSwap`; its target is the kept slot, `FUN_005be040` D:L474757-474760). Every action, the kit's
   * hold and the overlay come off 'replaced'. The stance is stand at once, with no clip. Only `./net/blast` `mountPop` calls it.
   */
  mountTake(): void {
    this.completeSwap();
    this.endBody('replaced');
    this.endHold('replaced');
    this.endOverlay('replaced');
    this.stance = 'stand';
    this.pending_ = null;
  }

  /** The ground state as it last ran (`GroundMotion`). */
  get ground(): GroundMotion {
    return this.ground_;
  }

  /**
   * PAR-62 (research 230 s5.2.2): whether the stick's cut is asked after this tick (`./reloadLock` `reloadCutOf`). Not in
   * the air: `FUN_005af930` zeroes the three axes there (D:L466811-466815). Not on a landing that plays no clip: its
   * landing branch pops the top once (`FUN_00589aa0`, D:L466894-466902) before the driver's cut, so the top's action is
   * not the one read before the tick's work (`FUN_00550ef0` D:L418116 against D:L418176) and the test (D:L418180-418185)
   * is not made -- the take-off's stick `land` hands back for the pose cuts nothing, nor the tick's own, nor the turn.
   * PAR-66: nor on a landing that plays a clip -- the branch pops (`FUN_0058a5e0` D:L466897, else `FUN_00589aa0`
   * D:L466900-466901) and `FUN_005af590` pops the stack to its base and pushes the clip (D:L466691-466693), all inside
   * D:L418169 -- so a still clip the fall covers goes at the landing's pop (`./stillReloadLife` `landingPops`), never cut.
   */
  get cutAsked(): boolean {
    return !this.inAir && !this.landedPop;
  }

  /**
   * PAR-64 (research 230 s5.2.3): the move axes the stick's cut reads on this tick (`FUN_00550ef0` D:L418182-418185:
   * `actor+0x240`, `+0x244`). `FUN_00551ec0` copies them from the pad each frame (D:L418613-418615) in the pass that runs
   * before the driver's (`entity_pre_tick` before `entity_tick`, D:L50922-50925), so the cut reads the tick's own stick:
   * the command's, clamped to +-1 and with the scope's 0.2 (`FUN_005966a0` D:L453818-453821), before the slope's and the
   * water's factor (`FUN_005b56c0`, inside the ground state, D:L444163) and with no ramp (`FUN_00586c10`'s value is
   * written back after the cut, `FUN_00584c60` D:L444165-444166) -- under a hold or an action as on a run. The movement
   * scale `actor+0x1368` (D:L418621-418623) is 1 here: the port has no network stall that lowers it (research 230 s5.2.3).
   */
  get cutStick(): { forward: number; right: number } {
    return this.cutStick_;
  }

  /** Capture controller axes before the body driver (FUN_00551ec0 D:L418613-418615). */
  captureMoveInput(input: Pick<WalkInput, 'forward' | 'right'>): void {
    this.cutStick_ = { forward: Math.max(-1, Math.min(1, input.forward)), right: Math.max(-1, Math.min(1, input.right)) };
  }

  /**
   * How many ticks `FUN_00586c10` snapped an axis (`throttleSnaps`): the game snapshots the pose each time and
   * cross-fades from it over 0.2 s (`STICK_SNAP_BLEND`); the animator starts that fade when the count moves.
   */
  get stickSnaps(): number {
    return this.stickSnaps_;
  }

  /** `FUN_00586c10` on both axes against last tick's: the ramped stick in the state, a snap counted once a tick. */
  private throttle(forward: number, right: number, dt: number): void {
    const s = this.state;
    if (throttleSnaps(s.stickForward, forward, 'forward', dt) || throttleSnaps(s.stickRight, right, 'right', dt)) this.stickSnaps_++;
    s.stickForward = throttleStep(s.stickForward, forward, 'forward', dt);
    s.stickRight = throttleStep(s.stickRight, right, 'right', dt);
  }

  /** An action on the stack, in place of the one there (which ends for `reason`, `ActionEnd`). */
  private start(name: MoverActionName, seconds: number | null, reversed = false, reason: ActionEndReason = 'replaced'): void {
    this.endBody(reason);
    this.action_ = { name, serial: ++this.serial, t: 0, seconds, reversed };
  }

  /**
   * The command the tick runs on (`./net/moverSim` `prepare`; the page's walk numbers its ticks as the net client does):
   * the heavy landing's coin is drawn from it (`landingHitDraw`, `LANDING_HIT_DRAW_READING`).
   */
  commandSeq = 0;

  /**
   * The draw `FUN_005af590` makes between its two hit clips (`FUN_00197740`), [0, 1): a test's override; null (the
   * default) draws from `commandSeq` (`LANDING_HIT_DRAW_READING`), so the page and the server land one clip.
   */
  random: (() => number) | null = null;

  /**
   * Whether the action on the mover would give way now (`FUN_00587c20`, decomp 445514-445576: its phase past its
   * `NoInterrupt`), or there is none. The launch, the fall, the knock's falls and the death landings never do: they end
   * on the floor or hold the body. `FUN_005b4340(seal, 1)` (469337-469346) takes the peek only from such a SEAL
   * (`./traversal` `leanTick`).
   */
  actionInterruptible(): boolean {
    const a = this.action_;
    if (!a) return true;
    if (a.name === 'launch' || a.name === 'fall' || a.name === 'fallForward' || a.name === 'fallBackwards'
      || a.name === 'landDeath' || a.name === 'landBackwards') return false;
    return this.pastNoInterrupt({ name: a.name, t: a.t, reversed: a.reversed });
  }

  /**
   * `FUN_00587c20`'s phase test (D:L445547-445565) for the action on the mover: forward, its phase past its
   * `NoInterrupt`; played backwards, its phase -- counted from its end, `(n - 1) / n` at the push (`FUN_0028c6e0`
   * D:L134296-134305 ends it under 0) -- under 1 - `NoInterrupt`. SEP-POP (OT.R93) for the three stance transitions:
   * refused by id unless `stanceCut` (D:L445536-445545: the controller's `IsAi` -- the bots), and never the prone -> stand clip, its node's bit 0x2 cleared at its push (`FUN_00581c10`
   * D:L442626-442629; the cut wants the bit, D:L445532). The others (the jumps, the landings, the swaps, the reactions)
   * are never pushed backwards here but the swaps to the rifle, and keep the forward test as they had it.
   */
  private pastNoInterrupt(a: { name: keyof typeof ACTION_CLIPS; t: number; reversed: boolean }): boolean {
    const c = ACTION_CLIPS[a.name], span = c.playback * ((c.frames - 1) / c.frames);
    if (a.name !== 'standToCrouch' && a.name !== 'crouchToProne' && a.name !== 'standToProne') return a.t / span > c.noInterrupt;
    if (!this.stanceCut) return false;                           // the refusal by id (IsAi: the bots)
    if (a.name === 'standToProne' && a.reversed) return false;   // bit 0x2 cleared: prone -> stand is never cut
    // The driver asks before its advance (D:L418180): the phase a game frame behind the clip's clock, never below 0
    // (`RELOAD_PUSH_LAG`'s model; `STANCE_CUT_TICK_READING`).
    const p = Math.max(0, a.t - RELOAD_PUSH_LAG) / span;
    return a.reversed ? (c.frames - 1) / c.frames - p < 1 - c.noInterrupt : p > c.noInterrupt;
  }

  /**
   * The action on the mover refuses the peek whatever its phase: `FUN_005b4340(seal, 1)` (decomp 469348-469353) fails
   * while the top clip (`FUN_00577e40`, 437396-437411: `actor+0x534`) is a jump or a landing -- ids 8 `Jump launch` / 9
   * `Jump fall` (`FUN_00587f50`, 445644-445658), 10 `Jump land` / 11 `Jump land hard` (`FUN_00587f10`, 445626-445640;
   * pushed by `FUN_005af590`, 466663-466694; the names research 80 section 1) and the standing "Jump" (`DAT_003deae8`,
   * 469353). `./traversal` `leanTick` reads it every tick the lean is held, a peek already held (state 3) too: 469345's
   * `state == 3 ||` skips only `FUN_00587c20`, and these tests follow it (469347-469353).
   */
  leanRefused(): boolean {
    const a = this.action_?.name;
    return a === 'jump' || a === 'launch' || a === 'fall' || a === 'land' || a === 'landHard';
  }

  /**
   * The action gives way to the peek (`./traversal` `leanTick`, `PEEK_CUTS_ACTION_READING`): only once
   * `actionInterruptible`; ended as the stick's cut ends it.
   */
  yieldAction(): void {
    if (this.action_ && this.actionInterruptible()) this.endAction('cut');
  }

  /**
   * An action off the mover. A get-up leaves the SEAL standing whatever its stance was: `FUN_00589aa0` (L446653-446677)
   * pops the stack to its bottom (action 1, state 0) before it pushes `Get up forward`, and the get-up's own pop
   * (`FUN_0028da00` L135104, the stack's vtable 0x406100 +0x14 = `FUN_0028dfb0`) writes `actor+0x174` from the state of
   * the action left on top -- 0, stand.
   */
  private endAction(reason: ActionEndReason): void {
    const name = this.action_?.name;
    this.endBody(reason);
    if (name === 'getUp' || name === 'getUpBackwards') this.stance = 'stand';
  }

  /**
   * `FUN_00587c20` (decomp 445514-445576) with `FUN_00550ef0`'s stick test (418180-418190): whether the action on the
   * mover gives way to the stick this tick -- its phase (`t / (playback x (n - 1) / n)`) past its `NoInterrupt` and a
   * move axis past `INTERRUPT_STICK`. The launch and the fall never do: they end on the floor.
   */
  private interrupted(forward: number, right: number): boolean {
    const a = this.action_;
    if (!a || a.name === 'launch' || a.name === 'fall') return false;
    // FUN_00550ef0 418183: action 0x35 (`Rifle -> Pistol`) takes the stick test whatever FUN_00587c20 answers.
    if (!this.pastNoInterrupt({ name: a.name, t: a.t, reversed: a.reversed }) && a.name !== 'swapStand') return false;
    return this.stickCuts(forward, right);
  }

  /**
   * FUN_00550ef0 418183-418186: the move axes (actor+0x240, +0x244) and the turn axis (actor+0x23c, the turn over
   * turn_maxrate), any past 0.1.
   */
  private stickCuts(forward: number, right: number): boolean {
    return Math.abs(forward) > INTERRUPT_STICK || Math.abs(right) > INTERRUPT_STICK
      || Math.abs(this.turn / SEAL_TUNING.turnMaxRate) > INTERRUPT_STICK;
  }

  /**
   * NU-1a (research 313 section 4): `FUN_00550ef0`'s stick test (D:L418182-418185) on this tick's copied stick
   * (`cutStick`, set before the driver's tick) and the turn -- what cuts a traversal's climb clip past its `NoInterrupt`
   * (`./traversal` `CLIMB_CUT_READING`), the one test the action's and the hold's cuts make.
   */
  stickCut(): boolean {
    return this.stickCuts(this.cutStick_.forward, this.cutStick_.right);
  }

  /**
   * The actor's turn, radians a second, left positive (`actor+0x48`; `WalkMode` sets it from the look each frame): the
   * turn axis `actor+0x23c` is this over `turn_maxrate`, and past 0.1 it cuts an interruptible action as the move
   * stick does (`FUN_00550ef0`).
   */
  turn = 0;

  /**
   * SEP-POP (OT.R93; the owner, 2026-10-31: SEPARATE "identical to the original"): whether the stick cuts this walker's
   * stance transitions past their `NoInterrupt` (`pastNoInterrupt`) -- the original's player, whose controller's `IsAi`
   * (slot +0x30) answers 0. Off (the default): the refusal by id (`FUN_00587c20` D:L445536-445545), the original's for
   * the bots. COMBINED-CUT (OT.R93, the owner 2026-10-31: "3 + 4"): on for the player in both stance modes -- COMBINED
   * takes the cut and keeps the rest of its flow (the hold, the pop's code and window, main's zero: `stanceSeparate`).
   * The page lays it on its own mover each tick (`./walk` `WalkMode`), the room on a stating command unless it has marked
   * the seat AI (`./net/moverSim` `prepare`, `MoverSim.ai`: a CPU's connection, a seat the bots' brain adopts).
   */
  stanceCut = false;

  /**
   * SEP-POP / COMBINED-CUT (OT.R93): SEPARATE's own -- the stance mode the walker's player runs, apart from the cut. On:
   * a transition's push leaves the velocity, as the original's pushes do (`applyStance`), and the room ignores the pop's
   * code (`./net/moverSim` `prepare`; STM.R2a). Off (the default; COMBINED and the bots): main's zero at the push. The
   * page lays it each tick (`./walk` `WalkMode`: `'separate'`), the room from the command (`Command.separate`).
   */
  stanceSeparate = false;

  /**
   * The action clips' root travel per key, x and z in the model's frame, by clip name (`WalkMode.setActionRoots`, from
   * the pack the page loads): what `FUN_0028c250` reads the velocity off. Without them each clip's mean
   * (`ACTION_CLIPS[..].travel`) stands in.
   */
  actionRoots: ReadonlyMap<string, Float32Array> | null = null;

  /**
   * `FUN_0028c250` through `FUN_00289bb0` (decomp 134145-134183, 132691-132756) for an action on the mover: the root's
   * change from the key the phase is on to the next (the last key paired with the one before), times the keys over
   * `playback` -- units a second in the model's frame, (x right, z behind) -- backwards for a transition played
   * backwards. The phase is the one-shot's `t / (playback (n - 1) / n)`, from its end when backwards.
   */
  actionVelocity(name: keyof typeof ACTION_CLIPS, t: number, reversed: boolean): [number, number] {
    return this.clipVelocity(SEAL_ANIMS[name], ACTION_CLIPS[name], ACTION_SECONDS[name], t, reversed);
  }

  /** `actionVelocity` for any one-shot: its clip's name, its constants and its length. */
  private clipVelocity(
    clip: string, c: { playback: number; frames: number; travel: readonly number[] }, seconds: number, t: number, reversed: boolean, suppliedKeys?: Float32Array,
  ): [number, number] {
    const n = c.frames, end = (n - 1) / n;
    const keys = suppliedKeys ?? this.actionRoots?.get(clip);
    if (!keys || keys.length < 2 * n) {
      const v = (reversed ? -1 : 1) / seconds;
      return [c.travel[0]! * v, c.travel[1]! * v];
    }
    const run = t / (c.playback * end);
    const phase = Math.min(end, Math.max(0, reversed ? end - run : run));
    let a = Math.min(n - 1, Math.floor(phase * n + 1e-9)), b = a + 1;
    if (b >= n) { b = n - 1; a = Math.max(0, n - 2); }
    const k = ((reversed ? -1 : 1) * n) / c.playback;
    return [(keys[2 * b]! - keys[2 * a]!) * k, (keys[2 * b + 1]! - keys[2 * a + 1]!) * k];
  }

  /** The body in use (`STANCE[posture]` gives its root and column): `stand` while a crouch runs at full stick. */
  get posture(): Stance {
    return this.posture_;
  }
  /** The feet before the last tick, for drawing the eye between ticks. */
  private prev = { x: 0, y: 0, z: 0 };
  /**
   * LATER 96 (`./turretPage` `TURRET_CATCHUP_DRAW_DECAY_ADAPTATION`, a browser adaptation): an offset of the drawn feet
   * from the simulated ones, set after a tick by its caller (the turret page's catch-up restart) and drawn between the
   * last two ticks' values like the feet (`drawnFeet`). Nothing simulated reads it (`tickFeet`, the state, the shot's eye);
   * a placing or a settle clears it (`restDrawn`).
   */
  drawOffset: [number, number, number] = [0, 0, 0];
  /** `drawOffset` as the last tick began. */
  private drawOffsetPrev: [number, number, number] = [0, 0, 0];
  /*
   * MISSION R8 -- a known deviation, a browser adaptation with no original (the owner, 2026-10-04: "the speed is good,
   * but the feeling was wrong"; "yes to the interp fix"; "agreed on hybrid. make this a known deviation"; research 208
   * section 9). The airborne height steps once per 30 Hz game frame (`airClock`), the original's arithmetic; drawn from
   * the 60 Hz ticks alone it held for a tick and jumped. So the DRAWN height (the body's feet and the camera on them,
   * never the simulation, the room or the shot's claim: `tickFeet`) runs between the last two game frames' heights by
   * `airClock.alpha()`, sampled at each tick's end and spread over the tick like x and z. The original runs at 30 fps on
   * a 30 fps screen: it draws every frame it steps, so there is nothing to interpolate there.
   */
  /** The height before the last game frame of the air and after it (`airTo` tracks `state.y`). */
  private airFrom = 0;
  private airTo = 0;
  /** Whether the last tick ran the air (`fall`). */
  private fell = false;
  /** The drawn height at the last two ticks' ends, and `state.y` at the last tick's end. */
  private drawPrevY = 0;
  private drawCurY = 0;
  private tickEndY = 0;
  /** Whether the tick before the last and the last ended in the air: either one draws by the air's track. */
  private airDrawPrev = false;
  private airDrawCur = false;
  /** Real time not yet stepped, in seconds, under one tick. */
  private accumulator = 0;
  private readonly wallsByCell = new Map<number, Wall[]>();
  /** The walls of the 3 x 3 cells around the mover's cell, kept until it changes cell. */
  private near: NearWalls | null = null;
  private readonly nearByCell = new Map<number, NearWalls>();
  /** MAP-02 (`./worldState`): the grid's revision the two caches above were read at; another empties them. */
  private seenRevision = 0;
  /** A caller that changes collision geometry explicitly can discard its scratch probe's static caches too. */
  invalidateWallCache(): void {
    this.wallsByCell.clear();
    this.near = null;
    this.nearByCell.clear();
  }
  /** PB-3b: the walls the last move's slide met (`WallHit`), in the order met; the next tick's driver reads them. */
  private wallHits_: WallHit[] = [];

  constructor(readonly grid: Grid) {}

  /**
   * PB-3b (web research 281 s4.1): the walls the last tick's slides met (`WallHit`) -- what the climb takes its contact
   * from, as `FUN_005483d0` takes it from the move's own hit (research 86 s3.1). Every slide the tick ran records, the
   * trial moves `step` refused among them (`[dx, dz]`, then `[dx, 0]`, `[0, dz]`), so a hit may come from a point one
   * sub-step off the body's last place -- inside the original's own reach (5.39-9.43 ahead), so no offer changes (the
   * review's F3). Emptied as the next tick's move begins, after the driver (`./traversal`) has read them.
   */
  wallHits(): readonly WallHit[] {
    return this.wallHits_;
  }

  /**
   * LATER 535: empties the contacts, for a mover no driver ticks -- the bots' navigation probe (`bots/navigation.ts`
   * `clearBody`), the port's own instrument with no original equivalent, which `glide`s without a tick for a whole game.
   * A body the game drives never needs it: `tick` and `glideAi` empty the contacts as each move begins.
   */
  clearWallHits(): void {
    this.wallHits_ = [];
  }

  /**
   * TRAVERSAL SEAM (web research 86, `./traversal`): a move that owns the tick while it runs -- the ladder, the
   * climb. Its `tick` runs first each tick and returns true when it moved the mover itself; false lets the walk run.
   */
  driver: TickDriver | null = null;

  /**
   * TRAVERSAL SEAM: moves the mover across the ground by (dx, dz) as a tick's step does -- the walls, the floors, a step
   * down, an edge's fall -- for a move that carries it (the dive).
   */
  glide(dx: number, dz: number, correct?: GroundCorrection): void {
    if (correct) this.wallHits_ = []; // AI body tick: expose only this move's contacts to its controller.
    this.move(dx, dz, correct);
  }

  /** Normal grounded AI has one centerline, not the local player's standing disc.
   * AI vtable6693f0+2c ->00575c30 returns0; FUN_0054aa30 D:L415021-415030/416025-416044.
   * The nearest segment hit is filtered before displacement projection (005483d0 D:L413409-413568).
   */
  glideAi(dx: number, dz: number, correct?: GroundCorrection, defaultMaterial = ''): void {
    this.wallHits_ = [];
    if (this.inAir) { this.move(dx, dz, correct); return; }
    const s = this.state, length = Math.hypot(dx, dz);
    let x = s.x + dx, z = s.z + dz;
    if (length > 0) {
      const reach = BODY_RADIUS * AI_HULL_READING.ahead, y = s.y + SEAL_TUNING.stepHeight;
      const nearZero = Math.abs(dx) < AI_HULL_READING.still && Math.abs(dz) < AI_HULL_READING.still;
      const yaw = s.yaw * Math.PI / 180;
      const fx = nearZero ? -Math.sin(yaw) : dx / length, fz = nearZero ? -Math.cos(yaw) : dz / length;
      const hits = segmentHits(this.grid, [s.x, y, s.z], [x + fx * reach, y, z + fz * reach],
        p => (surfaceWord(p) & (2 | (1 << 18))) === 2);
      let hit = hits[0];
      // FUN_002d4cc0 D:L175948-175952 replaces an equally near record with the later one.
      for (let i = 1; hit && i < hits.length && hits[i]!.t === hit.t; i++) hit = hits[i];
      if (hit) {
        const material = surfaceMaterial(hit.poly.material, defaultMaterial);
        if (hit.normal[1] <= AI_HULL_READING.slope && !material.volumetric && !material.liquid) {
          let [nx, ny, nz] = hit.normal;
          if (ny < AI_HULL_READING.slope) ny = 0;
          const size = Math.hypot(nx, ny, nz);
          if (size > 0) {
            nx /= size; nz /= size;
            const projection = nx * dx + nz * dz;
            x -= nx * projection; z -= nz * projection;
          }
          this.wallHits_.push({ poly: hit.poly, line: 0, x: hit.point[0], y: hit.point[1], z: hit.point[2] });
        }
      }
    }
    if (correct) { const at = correct([x, s.y, z]); x = at[0]; z = at[2]; }
    this.groundEndpoint(x, z);
  }

  /**
   * TRAVERSAL SEAM: puts the mover on the floor where it is (`on` false: `vy` zeroed, no landing recorded) or in the
   * air at `vy` (the `Jump fall` action) -- a climb takes it (a jump-grab ends the jump), a climb's end or a hang's
   * let-go hands it back. Either way the jump, the action and the carried velocity are dropped.
   */
  setAirborne(on: boolean, vy = 0): void {
    this.stopSlide();                                            // in the air the slide stops (research 201 §3)
    this.endBody('replaced');                                    // the action, the victory dance with it
    if (on) this.coverHold();                                    // PAR-79: the fall over a reload hold (`takeOff`)
    this.endHold('replaced');
    this.jumping = false; this.jumpDelay = 0;
    if (on) {
      this.takeOff();
      this.state.vy = vy;
      this.start('fall', null);                                  // FUN_0057e050: `Jump fall`
      return;
    }
    this.inAir = false;
    this.coveredHold_ = null;                                    // PAR-79: no landing hands it back
    this.state.vy = 0;
    this.carried = [0, 0];
  }

  /**
   * Stands the mover on the floor under (x, fromY, z): the probe's highest floor at or under `fromY` + 1, else
   * the lowest within 20 over `fromY` - 5.5 -- the selection with the origin at `fromY`. A spawn passes its feet +
   * `STEP_PROBE_LIFT_READING`, so the pick is the tick's own (`FUN_005b5d40` 470230-470240 from the tick's one origin,
   * `FUN_005b0840`'s; research 86 s6.3 and s6.5; the
   * record lifted a unit first, `FUN_002b8100` 158793, research 91 s4.2): the server's spawn and the page's respawn
   * alike. Only the page dropping from the camera passes the camera's eye. False, and nothing moves, when there is no
   * floor there.
   */
  place(x: number, fromY: number, z: number): boolean {
    const floor = selectFloor(probeGround(this.grid, x, z), fromY, fromY - STEP_PROBE_LIFT_READING);
    if (!floor) return false;
    Object.assign(this.state, { x, y: floor.y, z, vx: 0, vz: 0, vy: 0, stickForward: 0, stickRight: 0 });
    this.prev = { x, y: floor.y, z };
    this.accumulator = 0;
    this.tiltClock.reset();                                      // PRONE-TILT-2: the rule's frames start with the placing
    this.restDrawn();
    this.inAir = false;
    this.landing_ = null;
    this.action_ = null;                                         // a placing starts the body afresh: no end is heard
    this.overlay_ = null;
    this.hold_ = null;
    this.coveredHold_ = null;                                    // PAR-79
    this.dance_ = null;                                          // the victory dance too: no end is heard
    this.pending_ = null;
    this.jumpLock = 0; this.jumpDelay = 0; this.jumping = false; this.carried = [0, 0];
    this.contact_ = null;                                         // SEGMENT-BODY: no stored contact on a placing
    this.bodyVelocity_ = null;                                   // LATER 676: no clip velocity kept from before it
    this.wedgeArmed = 0;                                         // HOTFIX BRIDGE-WEDGE: no landing yet
    this.setFloorNormal(floor.normal);
    this.stopSlide();
    this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
    this.landedPop = false;
    this.cutStick_ = { forward: 0, right: 0 };                   // PAR-64: no stick before the first tick
    return true;
  }

  /** Whether the mover is falling. */
  get airborne(): boolean {
    return this.inAir;
  }

  /** The last landing since the feet last left the floor, or null: in the air, or not yet fallen since `place`. */
  get landing(): Landing | null {
    return this.landing_;
  }

  /** Slide speed `actor+0x1340` (research 201 §3), units a second along the fall line. */
  get slideSpeed(): number {
    return this.slideSpeed_;
  }

  /**
   * Whether `seal_slide` would be playing (speed at or over g/4, no swap). The clip is not pushed: its one-shot
   * would replace this tick with root motion and stop the slide write (`FUN_0054edf0` runs under the clip).
   */
  get slideClip(): boolean {
    return this.slideClip_;
  }

  /**
   * BLAST KNOCK (`./net/blast` `applyKnock`; `FUN_0057e770` L441044-441075, `FUN_005807d0`): off the ground at
   * `velocity` (units a second) in `fall` (`Fall forward` / `Fall backwards`), whatever plays -- the game pops the
   * action stack first (`FUN_005807d0`: `FUN_0057ee00`, `FUN_005a5da0`) -- the landing then its get-up (`land`).
   *
   * PF-19 (`fall` 'proneCover'; research 218 s3): a living prone SEAL is not pushed -- `Prone cover` is pushed in its
   * state (`FUN_0057e770` D:L441018-441020) and plays in place for its clip (3.78 s): the kit's hold and the moving swap
   * end as they do for a fall, the SEAL stays on the floor in its stance, and the stick never cuts it (`NoInterrupt ()`).
   */
  knock(velocity: readonly number[], fall: 'fallForward' | 'fallBackwards' | 'proneCover'): boolean {
    const s = this.state;
    this.stopSlide();
    this.endHold('knock');
    this.coveredHold_ = null;                                    // PAR-79: the knock pops the stack (FUN_0057e770 D:L440997)
    this.endOverlay('knock');                                    // the fall's `start` ends the action and the dance: `knock`
    if (fall === 'proneCover') {
      s.vx = 0; s.vz = 0;
      this.carried = [0, 0];
      this.start('proneCover', ACTION_SECONDS.proneCover, false, 'knock');
      return true;
    }
    this.jumpDelay = 0;
    this.jumping = false;
    this.inAir = true;
    this.airTime = 0;
    this.airClock.reset();                                       // the flight's game frames start here
    s.vx = velocity[0]!; s.vy = velocity[1]!; s.vz = velocity[2]!;
    this.carried = [s.vx, s.vz];
    this.start(fall, null, false, 'knock');
    return true;
  }

  /**
   * The jump (`FUN_0057e1b0`, decomp 440776-440867, the header): refused in the air (`actor+0x105e` bit 5), within
   * `JUMP_LOCK` of a take-off or a landing (`actor+0x135c`), off walkable ground (`actor+0x1348` under cos
   * `max_slope`), prone (`FUN_005b4340(actor, 0xb)`: stance 2 -- its other refusals, the knock-downs `Fall forward` /
   * `backwards`, the death landings, `180`, `dive_to_prone`, the hang and ladder states, are not the walk's), and
   * **unless the action on top plays a looped motion** (`FUN_005551a0(entry+0x28, 0x40)`: the entry's bit 0x40 is its
   * motion's looped bit, `FUN_0028dc90` from `+0x49` bit 6). `FUN_00550ef0` takes the press whatever plays
   * (`ctrl+0x170` bit 2, set with it by `FUN_00592d50`), so a press during a one-shot -- the jump, the launch, the
   * fall, a landing, a transition, a hit, the get-up, the peek's lean clip held on its last key (state 3,
   * `TickDriver.topOneShot`; review 4) -- is spent and refused; the idles, the locomotion and the turn
   * steps are all looped. At `RUNNING_JUMP_SPEED` or more the running jump -- off the floor with the velocity carried,
   * the impulse `JUMP_DELAY` later; under it the standing jump -- the `Jump` action on the floor. True when a jump
   * started.
   */
  jump(): boolean {
    if (this.inAir || this.jumpLock > 1e-9 || this.stance_ === 'prone') return false;
    // Every action the walk plays is a one-shot, the holds too, the victory dance (`looped(0)`: research 303 section 3,
    // `0x0057e300`-`0x0057e30c`, the looped test at D:L440810) and the peek's lean clip on top (state 3): PAR-19's body
    // owner (`bodyOwner`), the one answer the stance gate asks too.
    if (this.bodyOwner() !== null) return false;
    if (this.floorNormal_[1] < MAX_SLOPE_COS) return false;
    const s = this.state;
    // `JUMP_CONTACT_PROVEN` 'none' (the r0004 capture): the stored contact refuses no running jump; the r0001 reading
    // (`FUN_0057e1b0` D:L440815-440819, `+0x10ac` set: the standing jump) is kept as 'stored-contact', rejected.
    const contact = JUMP_CONTACT_PROVEN === 'stored-contact' && WALL_BODY_READING === 'segments' && this.contact_ !== null;
    // LATER 676: the speed is the clip's (`+0x2c..+0x34`, D:L440812-440814), the tick's velocity before the walls cut it
    // (`bodyVelocity_`; r0004's ditch capture); the cut one only when no ground move wrote it.
    const [bx, bz] = this.bodyVelocity_ ?? [s.vx, s.vz];
    if (!contact && bx * bx + bz * bz + s.vy * s.vy >= RUNNING_JUMP_SPEED * RUNNING_JUMP_SPEED) {
      this.takeOff();
      this.jumping = true;
      this.jumpDelay = JUMP_DELAY;
      this.jumpLock = JUMP_LOCK;
      this.start('launch', ACTION_SECONDS.launch);             // its clip's 2.21 s, or the landing: whichever first
    } else {
      this.start('jump', ACTION_SECONDS.jump);
    }
    return true;
  }

  /**
   * PAR-79 (`COVERED_HOLDS`): a reload hold the fall is pushed over is kept, covered, its clock standing from the cover's
   * tick, whose advance the original does not make (only the top advances, `FUN_0057a330` D:L438708) -- this tick's,
   * when its clocks ran before the body left the floor (`clocked`). PAR-82: not when the room or the page says the fall
   * covers none (`holdCovered`: the m203's stand-in).
   */
  private coverHold(): void {
    const h = this.hold_;
    if (h && COVERED_HOLDS.has(h.clip) && (this.holdCovered?.() ?? true)) this.coveredHold_ = { ...h, t: h.t - this.clocked };
  }

  /** Leaves the floor: the velocity across it carried (`actor+0x1350 = +0x38`), the fall from 0. */
  private takeOff(): void {
    this.stopSlide();                                            // airborne: the slide stops (research 201 §3)
    this.coverHold();                                            // PAR-79
    this.endHold('replaced');                                    // off the floor, the fall's clip takes the stack
    this.endBody('replaced');                                    // the action on it, the victory dance with it
    this.groundBefore = this.ground_;
    this.inAir = true;
    this.landing_ = null;
    this.airTime = 0;
    this.airClock.reset();                                       // the flight's game frames start here
    this.state.vy = 0;
    this.carried = [this.state.vx, this.state.vz];
  }

  /** Feeds `seconds` of real time in and runs the whole ticks it makes, `afterTick` after each; returns how many ran. */
  /** How many ticks `advance(seconds)` would run now (the page spreads a frame's look over them: NET-LOOK round 3). */
  ticksFor(seconds: number): number {
    let acc = this.accumulator + Math.max(0, seconds), n = 0;
    while (acc >= TICK - 1e-9 && n < MAX_TICKS) { acc -= TICK; n++; }
    return n;
  }

  advance(seconds: number, input: WalkInput, afterTick?: () => void, beforeTick?: () => WalkInput): number {
    this.accumulator += Math.max(0, seconds);
    let ticks = 0;
    while (this.accumulator >= TICK - 1e-9 && ticks < MAX_TICKS) {
      // MULTIPLAYER (web sprint 3, W3.R8): a command stream sets each tick's look, buttons and stick before it runs.
      this.tick(beforeTick ? beforeTick() : input);
      afterTick?.();
      this.accumulator -= TICK;
      ticks++;
    }
    if (this.accumulator >= TICK) this.accumulator = 0;          // a backlog past MAX_TICKS is dropped, not run
    return ticks;
  }

  /** Drops the part-tick in hand, so the eye is exactly over the feet: after a run of ticks driven by hand. */
  settle(): void {
    this.prev = { x: this.state.x, y: this.state.y, z: this.state.z };
    this.accumulator = 0;
    this.restDrawn();
  }

  /** MISSION R8: the drawn height back on the simulated one (a placing, a settle). */
  private restDrawn(): void {
    const y = this.state.y;
    this.airFrom = this.airTo = this.drawPrevY = this.drawCurY = this.tickEndY = y;
    this.airDrawPrev = this.airDrawCur = false;
    this.drawOffset = [0, 0, 0];
    this.drawOffsetPrev = [0, 0, 0];
  }

  /** The eye, 15.4 over the feet, drawn between the last two ticks by the time left over in the accumulator. */
  eye(): [number, number, number] {
    const [x, y, z] = this.drawnFeet();
    return [x, y + EYE_HEIGHT, z];
  }

  /** How far the page's time is into the next tick, 0..1: what the view is drawn between the last two ticks by. */
  alpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / TICK));
  }

  /**
   * The feet between the last two ticks (`alpha`), the height as simulated: what the shot's eye stands on (`./walk`
   * `fireAim`), so the claim the room checks is the one it always was (MISSION R8 draws, it does not simulate).
   */
  tickFeet(): [number, number, number] {
    const s = this.state, t = this.alpha();
    return [this.prev.x + (s.x - this.prev.x) * t, this.prev.y + (s.y - this.prev.y) * t, this.prev.z + (s.z - this.prev.z) * t];
  }

  /**
   * The feet as drawn: `tickFeet`, but in the air (and the tick it lands) the height between the last two game frames'
   * by `airClock.alpha()` -- MISSION R8's interpolation, a known deviation (see `airFrom`): where the body is drawn,
   * so it moves with the drawn camera.
   */
  drawnFeet(): [number, number, number] {
    const feet = this.tickFeet(), t = this.alpha();
    if (this.airDrawCur || this.airDrawPrev) {
      // A move of `state.y` since the tick's end (the net client's nudge) shows as it does on the ground: by `t`.
      feet[1] = this.drawPrevY + (this.drawCurY - this.drawPrevY) * t + (this.state.y - this.tickEndY) * t;
    }
    // LATER 96: the drawn-only offset, between the last two ticks' (`drawOffset`).
    const p = this.drawOffsetPrev, o = this.drawOffset;
    for (let a = 0; a < 3; a++) feet[a] = feet[a]! + p[a]! + (o[a]! - p[a]!) * t;
    return feet;
  }

  /**
   * One 60 Hz step. The jump lock and the action's clock run down first. Airborne: the fall (`fall`). Holding the
   * mover: a landing clip carries the landing's velocity down at `CARRY_DECAY`; a stance transition stands still; the
   * standing jump moves by the stick at the stance's top speeds (`FUN_0057a330`). Otherwise the ground state: the
   * stick through the throttle ramp (`throttleStep`), the velocity from the stance's bands (`locomotion`), then the
   * move in sub-steps, each sliding off the walls and standing on the floor. The boost of `GroundWish` is not read:
   * the walk has none (W2.R2; the owner's ruling of the motion workstream).
   */
  tick(input: WalkInput, dt: number = TICK): void {
    this.followLauncherSet();                                    // LATER 504: the launcher's set kneels or stands the mover
    this.drawOffsetPrev = [this.drawOffset[0], this.drawOffset[1], this.drawOffset[2]];   // LATER 96: drawn only
    this.fell = false;
    this.tickFromX = this.state.x; this.tickFromZ = this.state.z;   // HOTFIX BRIDGE-WEDGE: the push-out's reach
    if (this.wedgeArmed > 0 && !this.inAir) this.wedgeArmed--;
    this.step60(input, dt);
    for (let f = this.tiltClock.advance(dt); f > 0; f--) this.tiltTick();   // PRONE-TILT: FUN_00548090 once a game frame (D:L417863)
    this.clocked = 0;                                            // PAR-79: between ticks, no clock ran
    this.drawTick();
  }

  /**
   * PRONE-TILT (`./rootTilt`, research 217 s7): `FUN_00548090` once a 30 Hz game frame after the move (`tiltClock`;
   * PRONE-TILT-2, the EPH pass's Q2), as `FUN_005506a0` runs it once an actor tick after `FUN_005483d0` (D:L417825, D:L417863): the root's tilt from the top play (`tiltTop`) and, only on a tick the
   * rule writes (`w > 0`, the one read of `+0x410`, D:L413259), the floor under the feet picked again (`tiltFloorNormal`).
   * It reads the simulation and changes none of it. [The pick's order against the rule within the original's frame
   * (`FUN_00550570` D:L417771 calls `FUN_005b0420`) is not read; the port takes the floor this tick's move ended on. The
   * mover's own pick in `slideOrMove` is at the tick's start position, before the move, so it is not `+0x410`'s and is
   * not reused.]
   */
  private tiltTick(): void {
    const s = this.state;
    const top = this.tiltTop();
    this.rootTilt_ = stepRootTilt(this.rootTilt_, {
      normal: () => this.tiltFloorNormal(), yaw: s.yaw, span: tiltWindowOf(top.clip), phase: top.phase,
      prone: this.posture_ === 'prone' && !top.diving, proneTransition: top.proneTransition, diving: top.diving,
      airborne: this.inAir, deadTop: this.dead_, corpse: this.dead_,
    });
  }

  /**
   * PRONE-TILT: the floor hit's normal under the feet after the move (`FUN_005b0420`'s pick: the port's `selectFloor` from
   * the feet + `STEP_PROBE_LIFT_READING`), kept as it was when the pick misses (D:L467049-467070). Asked by the rule only
   * when it writes. The original copies the normal only when `FUN_0059acd0(hit+0x1c)` is 0 (D:L467123-467134) -- no owner, or
   * one that is not a `CSealEx` with its `+4` set (its dynamic cast, type descriptors ELF 0x65c238 `CSealEx` from 0x65c220 `zdb::CNodeEx`,
   * `FUN_0059acd0` D:L456241-456258), else the normal is kept (D:L467136-467140). The port's floors are the map's collision
   * polygons alone (`groundGrid`: `worldmodel` owners, no actor), so that branch does not arise here (research 217 s7.1).
   */
  private tiltFloorNormal(): [number, number, number] {
    const s = this.state;
    const floor = selectFloor(probeGround(this.grid, s.x, s.z), s.y + STEP_PROBE_LIFT_READING, s.y);
    if (floor) this.tiltNormal_ = [floor.normal[0], floor.normal[1], floor.normal[2]];
    return this.tiltNormal_;
  }

  /**
   * PRONE-TILT: the top play as `FUN_00548090` reads it (`FUN_00555170(actor+0x1c0)`, D:L413206): a traversal move's
   * clip (the dive's phase its key over `DIVE_KEYS`), else the kit's hold on the stack's top (PAR-85), else the action,
   * else the ground play of the posture (`GROUND_PLAY_PHASE`). A one-shot's phase is its run's share of (n - 1) / n
   * (`oneShotPhase`, `FUN_0028c4f0`); a transition played backwards from its end. The dead's posture-8 top is the port's
   * `dead_` (`TiltInput.deadTop`).
   * Public and read-only for instruments (the EPH tilt instrument reads the top clip and phase by this name): it reads the
   * walker's state and changes none of it; renaming it breaks them.
   */
  tiltTop(): TiltTop {
    const moves = this.driver as (TickDriver & { pose?(): TraversalPose | null; inDive?(): boolean }) | null;
    const pose = moves?.pose?.() ?? null;
    if (pose) {
      const diving = moves?.inDive?.() === true;
      return { clip: pose.clip, phase: traversalPhase(pose.frame, diving), diving, proneTransition: false };
    }
    const h = this.hold_;
    if (h) return { clip: h.clip, phase: oneShotPhase(h.seconds > 0 ? h.t / h.seconds : 1, HOLD_CLIPS[h.clip].frames, false), diving: false, proneTransition: false };
    const a = this.action_;
    if (a) {
      const frames = (ACTION_CLIPS as Readonly<Record<string, { frames: number }>>)[a.name]?.frames ?? 1;
      // PRONE-TILT-2 (4): an action with no `seconds` (the knock's falls, run till the landing) by its clip's own length.
      const length = a.seconds ?? (ACTION_SECONDS as Readonly<Record<string, number>>)[a.name] ?? null;
      const progress = length !== null && length > 0 ? a.t / length : 0;
      return {
        clip: actionClipOf(a.name) ?? '', phase: oneShotPhase(progress, frames, a.reversed), diving: false,
        proneTransition: a.name === 'crouchToProne' || a.name === 'standToProne',
      };
    }
    return { clip: groundClipOf(this.posture_), phase: GROUND_PLAY_PHASE, diving: false, proneTransition: false };
  }

  /** PRONE-TILT: the skeleton root's tilt as the last tick left it (`./rootTilt` `RootTiltState`; `up` in the body's frame). */
  get rootTilt(): RootTiltState {
    return { q: this.rootTilt_.q && [...this.rootTilt_.q], up: [...this.rootTilt_.up] };
  }

  /** PRONE-TILT: the floor hit's normal the tilt last read (`actor+0x410`; picked on the ticks the rule writes), world axes. */
  get tiltNormal(): [number, number, number] {
    return [...this.tiltNormal_];
  }

  /** The saved floor normal (`actor+0x1344..+0x134c`; `floorNormal_`), world axes, a copy. */
  get floorNormal(): [number, number, number] {
    return [this.floorNormal_[0], this.floorNormal_[1], this.floorNormal_[2]];
  }

  private setFloorNormal(n: readonly number[]): void {
    const f = this.floorNormal_;
    f[0] = n[0]!; f[1] = n[1]!; f[2] = n[2]!;
  }

  /**
   * PRONE-TILT-2 (1): posture word 2 as `FUN_00594600` tests it (`+0x174`, D:L452817): prone, and not in the dive (the
   * dive's posture word is 6; the port's posture is prone through it, so the dive is taken off as `tiltTick` does).
   */
  get aimProne(): boolean {
    if (this.posture_ !== 'prone') return false;
    const moves = this.driver as (TickDriver & { inDive?(): boolean }) | null;
    return moves?.inDive?.() !== true;
  }

  /**
   * MISSION R8 (see `airFrom`): the drawn height at this tick's end -- in the air, between the last two game frames'
   * heights by `airClock.alpha()`; on the ground, the simulated one. Reads the simulation, changes none of it.
   */
  private drawTick(): void {
    const y = this.state.y;
    if (!this.fell) this.airFrom = this.airTo = y;
    // The previous sample carries any move of `state.y` since its tick's end (the net client's correction nudges it
    // after the tick): `prev.y` is the height this tick began from.
    this.drawPrevY = this.drawCurY + (this.prev.y - this.tickEndY);
    this.airDrawPrev = this.airDrawCur;
    this.airDrawCur = this.inAir && this.fell;
    this.drawCurY = this.airDrawCur ? this.airFrom + (this.airTo - this.airFrom) * this.airClock.alpha() : y;
    this.tickEndY = y;
  }

  /**
   * The tick's clocks alone (`step60`'s first part): the jump's lock, the overlay, the action -- its end and what follows
   * it -- and the kit's hold. LOW-1 (web research 223 s6): the room's dropped backlog runs them over the ticks between
   * its presses (`elapse`) with the body held, so a clip one press started has run out by the next as on the page.
   */
  private runClocks(dt: number, cutsNow = false): void {
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    const o = this.overlay_;
    if (o) { o.t += dt; if (o.t >= o.seconds - 1e-9) this.endOverlay('complete'); }
    const a = this.action_;
    if (a) {
      a.t += dt;
      // PAR-80: a swap's play comes off on the driver's end test (`swapPlayedOut`), the others at their last key. On
      // that tick the standing swap (0x35) is asked the stick first and no end refusal (FUN_00550ef0 D:L418180-418193),
      // so a stick past 0.1 (`cutsNow`: step60's `stickCuts`) leaves it for `interrupted`'s cut; the crouched and prone
      // ones are never cut. PAR-84: the launcher's raise and still lower too, pushed before the driver on their press's
      // frame as the swap is (D:L476734 -> D:L461878-461886), off on the 84th / 82nd command (`playedOutCommand`).
      const swap = a.name === 'swapStand' || a.name === 'swapCrouch' || a.name === 'swapProne'
        || a.name === 'rifleToLauncher' || a.name === 'pistolToLauncher' ? ACTION_CLIPS[a.name] : null;
      if (swap ? swapPlayedOut(a.t, swap.playback, swap.frames) && !(cutsNow && a.name === 'swapStand')
        : a.seconds !== null && a.t >= a.seconds - 1e-9) {
        // DEATH_LANDING_GETUP_PLACEHOLDER: offline the deadly fall's `Land forward` gets up (`Get up forward`); dead
        // (online, the server's fall death) it holds its last key, as the game's SEAL dies in it (FUN_005af590). A blast's
        // knock-down landing (BLAST KNOCK, `knockLanding_`) gets up as the game's own (L446653-446700) unless dead.
        if (a.name === 'landDeath') {
          if (this.dead_ || (!DEATH_LANDING_GETUP_PLACEHOLDER && !this.knockLanding_)) a.t = a.seconds ?? a.t;
          else this.start('getUp', ACTION_SECONDS.getUp, false, 'complete');
        } else if (a.name === 'landBackwards') {                  // BLAST KNOCK
          if (this.dead_) a.t = a.seconds ?? a.t;
          else this.start('getUpBackwards', ACTION_SECONDS.getUpBackwards, false, 'complete');
        } else this.endAction('complete');                        // a get-up's end stands the SEAL (m-1)
      }
    }
    this.runHold(dt);
    // PARITY-1 close: the victory dance run out on the last tick's step (its clock is the root's, `victoryStep`) comes
    // off with the clocks, so the pending stance is asked after it as after every one-shot (PENDING_STANCE_RETRY_READING).
    const d = this.dance_;
    if (d && d.elapsed >= d.seconds) this.endVictory('complete');
  }

  /**
   * LOW-1 (web research 223 s6): `ticks` of the clocks (`runClocks`) with nothing moved -- no stick, no fall, no root
   * travel: the room's dropped backlog's real time between its presses, credited no movement. A traversal's move (the
   * driver's tick) is not run.
   */
  elapse(ticks: number, dt: number = TICK): void {
    if (this.driver?.owns?.(this)) return;                       // a traversal has the tick: `step60` runs no clock either
    for (let i = 0; i < ticks; i++) { this.runClocks(dt); for (let f = this.tiltClock.advance(dt); f > 0; f--) this.tiltTick(); }   // PRONE-TILT: once a game frame
  }

  /** `tick`'s step itself: the simulation, unchanged by the drawing. */
  private step60(input: WalkInput, dt: number): void {
    const s = this.state;
    this.prev = { x: s.x, y: s.y, z: s.z };
    this.landedPop = false;                                      // PAR-62: the cut asked again from this tick (`cutAsked`)
    if (this.scoped) {
      // FUN_005966a0 453818-453821: the pad's axes (each clamped, `./moveStick`) x 0.2 in the 9x view or a scope.
      const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
      input = { ...input, forward: clamp(input.forward) * SCOPED_STICK, right: clamp(input.right) * SCOPED_STICK };
    }
    // PAR-64: the pad's stick as FUN_00551ec0 copies it before the driver (D:L418613-418615): what every cut reads.
    this.captureMoveInput(input);
    const cutStick = this.cutStick_;
    this.bodyVelocity_ = null;                                   // LATER 676: written again only by a ground move
    const owned = this.driver?.tick(this, input, dt) ?? false;   // TRAVERSAL SEAM: a ladder or a climb has the tick
    this.wallHits_ = [];                                         // PB-3b: the driver has read the last move's hits
    if (owned) return;
    this.runClocks(dt, !this.inAir && this.stickCuts(cutStick.forward, cutStick.right));   // PAR-80: asked below
    this.clocked = dt;                                           // PAR-79: a cover on this tick stands from before it (`takeOff`)
    this.retryStance();                                          // FUN_00552d60 each frame (PENDING_STANCE_RETRY_READING)
    // The pad reader clamps each axis to +-1 and never puts the pair in the unit disc (`./moveStick`): a full
    // diagonal is (1, 1), which the standing blend takes as min(1, |stick|) and prone as one axis at 1.
    let forward = Math.max(-1, Math.min(1, input.forward)), right = Math.max(-1, Math.min(1, input.right));
    // FUN_00584c60 saves these before the crouch/run decision (D:L444137-444145).
    // Its crouch normalization also precedes slope/water scaling (research 86 section 5.3).
    const crouchForward = forward, crouchRight = right;
    if (!this.inAir && this.driver?.stickScale) [forward, right] = this.driver.stickScale(this, forward, right);   // TRAVERSAL SEAM: slope, water
    if (this.inAir) { this.fall(dt, forward, right); return; }
    if (this.interrupted(cutStick.forward, cutStick.right)) {   // FUN_00587c20: cut; the ground state takes over
      const cut = this.action_!;
      if (cut.name === 'landDeath') {
        if (this.dead_ || (!DEATH_LANDING_GETUP_PLACEHOLDER && !this.knockLanding_)) this.holdDeathLanding('landDeath', 'cut');   // dead: stays down
        else this.start('getUp', ACTION_SECONDS.getUp, false, 'cut');
      } else if (cut.name === 'landBackwards') {                  // BLAST KNOCK
        if (this.dead_) this.holdDeathLanding('landBackwards', 'cut');
        else this.start('getUpBackwards', ACTION_SECONDS.getUpBackwards, false, 'cut');
      } else if (cut.name === 'swapStand') {
        // FUN_00550ef0 418226-418245: the standing swap cut by the stick goes on as `Moving rifle -> Pistol` over the
        // locomotion, at the phase it had reached, on the second channel's clock (phase x playback x (n-1)/n, as the
        // reload's carry-over, 418213).
        const seconds = SWAP_OVERLAY_SECONDS;
        const phase = Math.min(1, cut.t / ACTION_SECONDS.swapStand);
        this.endBody('cut');
        this.overlay_ = { clip: SEAL_ANIMS.swapMoving, serial: ++this.serial, t: phase * seconds, seconds, reversed: cut.reversed };
      } else this.endAction('cut');                               // a get-up cut alive stands the SEAL too (m-1)
    }
    const dance = this.dance_;
    if (dance) {
      // PARITY-1 close: its end through the model (`endVictory`, heard by `onActionEnd`) -- dead (`death`), its clock run
      // out (`complete`), the stick or the turn past `INTERRUPT_STICK` (`cut`). An action or a hold takes it off as it
      // starts (`endBody`, `hold`); one found on top here is the same `replaced`.
      const cut = Math.abs(cutStick.forward) > INTERRUPT_STICK || Math.abs(cutStick.right) > INTERRUPT_STICK
        || Math.abs(this.turn / SEAL_TUNING.turnMaxRate) > INTERRUPT_STICK;
      const end: ActionEndReason | null = this.dead_ ? 'death' : this.action_ || this.hold_ ? 'replaced'
        : dance.elapsed >= dance.seconds ? 'complete' : cut ? 'cut' : null;
      if (end) this.endVictory(end);
      else {
        s.stickForward = forward; s.stickRight = right;           // read, not obeyed: the clip's root alone moves the SEAL
        this.victoryStep(dt);
        return;
      }
    }
    const hold = this.hold_;
    if (hold && !this.action_) {
      if (this.holdCut(cutStick.forward, cutStick.right)) this.endHold('cut');   // FUN_00587c20: cut; the ground state takes over
      else {
        // The kit's one-shot on top of the stack: no ground state (FUN_00550ef0 418172-418246); the clip's root alone
        // moves the SEAL (FUN_0028c250), along the facing. The stick is read, not obeyed.
        s.stickForward = forward; s.stickRight = right;
        this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
        const [tx, tz] = this.clipVelocity(hold.clip, HOLD_CLIPS[hold.clip], hold.seconds, hold.t, false);
        const yaw = (s.yaw * Math.PI) / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
        s.vx = tx * c + tz * sn;
        s.vz = -tx * sn + tz * c;
        this.slideOrMove(forward, right, dt);
        return;
      }
    }
    const held = this.action_?.name;
    if (held === 'hit' || held === 'hitStomach' || held === 'landDeath' || held === 'getUp'
      || held === 'landBackwards' || held === 'getUpBackwards'
      || held === 'standToCrouch' || held === 'crouchToProne' || held === 'standToProne'
      || held === 'swapStand' || held === 'swapCrouch' || held === 'swapProne' || held === 'proneCover'
      || held === 'rifleToLauncher' || held === 'pistolToLauncher' || held === 'swapRifleExchange' || held === 'swapRifleClaim') {
      // The clip's own root motion carries the mover (FUN_0028c250), key by key, along the facing -- backwards for a
      // transition played backwards (getting up). The ground state does not run (FUN_005870e0). PAR-84: the launcher's
      // raise and still lower (backwards) too: a one-shot on top, no ground state (FUN_00550ef0 D:L418171-418203).
      s.stickForward = forward; s.stickRight = right;
      this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
      const act = this.action_!;
      // A dead SEAL's `Land forward` held at its last key has no root travel left: the body stays where it fell.
      const ended = act.seconds !== null && act.t >= act.seconds - 1e-9;
      let [tx, tz] = ended ? [0, 0] : this.actionVelocity(held, act.t, act.reversed);
      // MOVE-1 (SEPARATE only, OT.R93): `FUN_0054d9a0`'s push under 0x13, 8 units of local z over the clip, signed by
      // the reverse flag (`CROUCH_PRONE_PUSH_READING`).
      if (held === 'crouchToProne' && this.stanceSeparate && !ended) {
        const c2p = ACTION_CLIPS.crouchToProne, period = (c2p.playback * (c2p.frames - 1)) / c2p.frames;   // anim+0x10 x FUN_0028ada0
        tz += ((act.reversed ? -1 : 1) * CROUCH_PRONE_PUSH_READING) / period;
      }
      const yaw = (s.yaw * Math.PI) / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
      s.vx = tx * c + tz * sn;
      s.vz = -tx * sn + tz * c;
      this.slideOrMove(forward, right, dt);
      return;
    }
    if (held === 'land' || held === 'landHard') {             // FUN_0054d9a0: the carried velocity, running down
      s.stickForward = forward; s.stickRight = right;          // FUN_0057a330: actor+0x248 = +0x244 each tick
      this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
      const [cx, cz] = this.carried, c = Math.hypot(cx, cz), cut = CARRY_DECAY * dt;
      this.carried = c <= cut ? [0, 0] : [cx - (cx / c) * cut, cz - (cz / c) * cut];
      [s.vx, s.vz] = this.carried;
      this.slideOrMove(forward, right, dt);
      return;
    }
    const v = held === 'jump' ? this.jumpControl(forward, right, dt) : this.locomote(forward, right, dt, crouchForward, crouchRight);
    const yaw = (s.yaw * Math.PI) / 180;
    // The camera looks down its own -z (`camera.ts`): forward is (-sin, -cos), right is (cos, -sin).
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    s.vx = fx * v.forward + rx * v.right;
    s.vz = fz * v.forward + rz * v.right;
    this.slideOrMove(forward, right, dt);
  }

  /**
   * The steep-ground slide on every body tick except `Climb over` (`FUN_0054edf0` D:L416558-416561 — the driver's
   * early return). The hold, the root-motion actions, the landing carry and the victory dance all come here, and the
   * frame displacement replaces that tick's root (`+0xf44` / `+0xf4c`; research 201 §3). Leaving onto ground that
   * does not slide, still on the floor, faster than `land_fall_rate` is `FUN_005af590` (`land`'s slide-exit speed).
   * The port has no carry state, so the note's "not carrying" exception does not arise. In the air the slide just
   * stops (`stopSlide` from `takeOff` / `fall`): the fall's own contact classes that drop. The feet stay on the floor
   * by `move`'s snap, which stands in for `FUN_005b4f30`'s downward search (research 201 §27.3: about 90 probes).
   */
  private slideOrMove(forward: number, right: number, dt: number): void {
    const s = this.state;
    this.bodyVelocity_ = [s.vx, s.vz];                          // LATER 676: the clip's velocity, before the walls
    const floor = selectFloor(probeGround(this.grid, s.x, s.z), s.y + STEP_PROBE_LIFT_READING, s.y);
    const span = floor ? slideSpanOf(floor.poly.points, s.x, s.z) : null;
    const startSpeed = this.slideSpeed_;
    const frame = floor ? steepGroundFrame({
      normalY: floor.normal[1], normal: floor.normal,
      span, prone: this.stance_ === 'prone',
      speed: startSpeed, dt, vx: s.vx, vz: s.vz,
      kind: SLIDE_DISC_SURFACE_KIND, g: JUMP_TABLE.gravity, maxSlope: MAX_SLOPE_COS,
    }) : null;
    if (frame?.sliding && floor) {
      const x0 = s.x, y0 = s.y, z0 = s.z;
      this.slideSpeed_ = frame.speed;
      this.slideClip_ = frame.clip && !this.swapping();
      let dx = frame.dx, dz = frame.dz;
      // r0004 (`STEEP_FLOOR_CONTACT_READING`): a body facing into a near-vertical floor whose slide has not started is
      // pushed off it along its horizontal normal, over the slide's own step.
      const n = floor.normal, h2 = n[0] * n[0] + n[2] * n[2];
      const yaw = (s.yaw * Math.PI) / 180;
      if (this.stance_ !== 'prone' && span !== null && span >= SLIDE_SPAN_MIN && startSpeed === 0
        && n[1] < STEEP_FLOOR_CONTACT_READING.normalY && h2 > 0 && Math.sin(yaw) * n[0] + Math.cos(yaw) * n[2] > 0) {
        this.carried = [0, 0];
        const { distance, gain } = STEEP_FLOOR_CONTACT_READING;
        // The record's point is the floor's hit under the feet; the moved feet are the frame's (its y the feet's: the
        // port writes no `+0xf48`). `t` < 1: within `distance` in front of the face's plane, or behind it.
        const t = (n[0] * dx + n[1] * (s.y - floor.y) + n[2] * dz) / (distance * h2);
        if (t < 1) {
          const k = distance * (1 - t) * gain, px = n[0] * k, pz = n[2] * k;
          dx = px >= 0 ? Math.max(dx, px) : Math.min(dx, px);
          dz = pz >= 0 ? Math.max(dz, pz) : Math.min(dz, pz);
        }
      }
      s.vx = dt > 0 ? dx / dt : 0;
      s.vz = dt > 0 ? dz / dt : 0;
      if (JUMP_SPEED_SLIDE_READING === 'slide') this.bodyVelocity_ = [s.vx, s.vz];
      this.slideFloorPoly_ = floor.poly;
      try { this.move(dx, dz); }
      finally { this.slideFloorPoly_ = null; }
      // FUN_005483d0: a stuck move writes no displacement (D:L413602-413611). After the walls resolve, a
      // downhill slide whose y is in [0, 0.01) clears the speed (D:L413912-413917) — a face the body cannot
      // descend does not keep accelerating. A negative entry the steep face refuses is not that case: clearing
      // it would re-project the stick every tick, and the gain would never turn the slide downhill.
      const dy = s.y - y0;
      const stuck = Math.hypot(s.x - x0, s.z - z0) < 1e-6 && (dx !== 0 || dz !== 0);
      if (stuck) { s.x = x0; s.y = y0; s.z = z0; s.vx = 0; s.vz = 0; }
      if (frame.speed > 0 && dy >= 0 && dy < 0.01) this.stopSlide();
      return;
    }
    const was = this.slideSpeed_;
    this.stopSlide();
    // Still on a floor, and the slide we just left was past land_fall_rate (research 201 §3, §27.3).
    if (floor && was > JUMP_TABLE.land_fall_rate) {
      this.land(forward, right, was);
      return;
    }
    this.move(s.vx * dt, s.vz * dt);
  }

  /** In the air the slide stops (`actor+0x105e` bit 5; research 201 §3). No exit landing on this path. */
  private stopSlide(): void {
    this.slideSpeed_ = 0;
    this.slideClip_ = false;
  }

  /**
   * The `Jump` action's stick (`FUN_0057a330` decomp 438955-438985): off rest, the ramp (`FUN_00586c10`) and then the
   * velocity straight from it -- the lateral axis times the side sets' top speed, the forward times the forward set's
   * or, backing up, the back set's (`FUN_0058bb50` / `FUN_0058bc00` by stance: `airBands`), no blend and no
   * renormalisation (`DAT_0064fc80` is 1 here). At rest, the clip's root motion: `seal_jump`'s root does not travel.
   * OT.R108 (the owner, 2026-11-06): this air control is kept -- r0004's standing jump drives the forward axis alone
   * (R4B-12, r4 0x57fcb8-0x57fd54; research 385 s2), a reading the port knowingly does not apply.
   */
  private jumpControl(forward: number, right: number, dt: number): { forward: number; right: number } {
    const s = this.state;
    this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
    if (idle(forward, right)) { s.stickForward = forward; s.stickRight = right; return { forward: 0, right: 0 }; }
    this.throttle(forward, right, dt);
    const b = airBands(this.stance_ === 'crouch' ? 'crouch' : 'stand', null);
    return {
      forward: s.stickForward * (s.stickForward >= 0 ? b.forward : b.back),
      right: s.stickRight * (s.stickRight >= 0 ? b.right : b.left),
    };
  }

  /**
   * The ground state `FUN_005870e0` runs for the stance (the header's pseudo-code): the stick ramped or not, the
   * direction class, and the velocity (forward, right) in units a second. Sets `posture`.
   */
  private locomote(forward: number, right: number, dt: number, crouchForward: number, crouchRight: number): { forward: number; right: number } {
    const s = this.state;
    const still = { forward: 0, right: 0 };
    const idleForward = this.stance === 'crouch' ? crouchForward : forward;
    const idleRight = this.stance === 'crouch' ? crouchRight : right;
    if (idle(idleForward, idleRight)) {                          // FUN_00586f00: at rest, the raw stick is kept
      // LATER 678 (`CROUCH_RUN_RETURN_READING`, SEPARATE only under OT.R93): a crouch run let go -- `+0x21c` bit 2 set,
      // the port's crouch with its posture stand -- not turning pushes `Stand -> Crouch` over the crouch idle (D:L444282,
      // D:L444316-444317); its head line's push off a wall is `CROUCH_RUN_RELEASE_PUSH_READING`'s.
      const released = CROUCH_RUN_RETURN_READING === 'stand-to-crouch' && this.stanceSeparate
        && this.stance === 'crouch' && this.posture_ === 'stand'
        && Math.abs(this.turn / SEAL_TUNING.turnMaxRate) <= CROUCH_IDLE_TURN && this.action_ === null && !this.inAir;
      s.stickForward = idleForward; s.stickRight = idleRight;
      this.cls = -1;
      this.posture_ = this.stance;
      this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
      if (released) this.start('standToCrouch', ACTION_SECONDS.standToCrouch);
      return still;
    }
    if (this.stance === 'prone') {                               // FUN_005845c0 -> FUN_00583500: no ramp
      s.stickForward = forward; s.stickRight = right;
      this.cls = moveClass(right, forward, this.cls);
      this.posture_ = 'prone';
      this.ground_ = { state: 'prone', forward, right, cls: this.cls };
      const a = classAxis(this.cls, STANCE.prone.bands);
      const speed = (a.f !== 0 ? Math.abs(forward) : Math.abs(right)) * a.band;
      return { forward: a.f * speed, right: a.r * speed };
    }
    if (this.stance === 'crouch') {                              // FUN_00584c60
      this.cls = moveClass(crouchRight, crouchForward, this.cls); // FUN_005858a0 before slope scaling, D:L444139
      const push = Math.hypot(crouchForward, crouchRight);
      const run = push >= CROUCH_RUN && (STANCE[this.posture_].rootY >= 9 || this.headroom());
      if (!run) {
        const k = CROUCH_WALK / push;
        // The original normalizes the saved axes, then applies FUN_005b56c0, then throttle
        // (D:L444160-444164). Re-scaling the already adjusted axes would apply the slope twice.
        const normalizedForward = crouchForward * k, normalizedRight = crouchRight * k;
        const [walkForward, walkRight] = this.driver?.stickScale
          ? this.driver.stickScale(this, normalizedForward, normalizedRight)
          : [normalizedForward, normalizedRight];
        this.throttle(walkForward, walkRight, dt);
        this.posture_ = 'crouch';
        this.ground_ = { state: 'crouch', forward: s.stickForward, right: s.stickRight, cls: this.cls };
        // FUN_00582d10: one set by the class at m, no blend; FUN_00583350's DAT_0064fc80 scales it all the same.
        const f = Math.abs(s.stickForward) <= FORWARD_DEAD ? 0 : s.stickForward;
        const len = Math.hypot(f, s.stickRight);
        if (len === 0) return still;
        const m = Math.min(1, len);
        const w = Math.min(1, Math.asin(Math.min(1, Math.abs(s.stickRight) / len)) * (2 / Math.PI));
        const a = classAxis(this.cls, STANCE.crouch.bands);
        if (this.stanceSeparate) {
          // MOVE-4 (SEPARATE only, OT.R93): `FUN_0057a330` D:L438911-438956 (r0004 0x57f580) hands w of the class clip's
          // root velocity to x and 1 - w to z -- the class axis keeps its own sign, the other takes the stick's -- and
          // D:L438985 scales by `DAT_0064fc80` = 1 / sqrt(w^2 + (1 - w)^2): the band's speed along atan2(w, 1 - w).
          const v = (m * a.band) / Math.hypot(w, 1 - w);
          const side = a.r !== 0 ? a.r : s.stickRight >= 0 ? 1 : -1;
          const ahead = a.f !== 0 ? a.f : s.stickForward >= 0 ? 1 : -1;   // `+0xf64`, the stick before the dead zone
          return { forward: ahead * (1 - w) * v, right: side * w * v };
        }
        const speed = (m * a.band) / Math.hypot(w, 1 - w);
        return { forward: a.f * speed, right: a.r * speed };
      }
      this.posture_ = 'stand';                                  // headroom: stands and runs the standing blend
    } else {
      this.posture_ = 'stand';
    }
    this.throttle(forward, right, dt);
    this.ground_ = { state: 'stand', forward: s.stickForward, right: s.stickRight, cls: this.cls };
    return locomotion(s.stickForward, s.stickRight, STANCE.stand.bands);   // FUN_00583030
  }

  /**
   * `FUN_0057efe0(actor, mode)` (D:L441190-441245): the camera-class cast (`cameraClassClear`) up the vertical line
   * over the feet from the stance's hips + 2 (`HEADROOM_HIPS_READING`) to the feet + 19 (`to` stand, mode 0) or + 12
   * (`to` crouch, mode 1: prone -> crouch). Its owner gate is D16's (research 230 s3.4); its surface filter and its
   * nearest-hit-type-1-clear rule are PAR-50's -- before it the port skipped every bit-18 polygon, never asked `ditype`
   * and refused on any hit.
   */
  headroom(to: keyof typeof HEADROOM_TOP = 'stand'): boolean {
    const s = this.state;
    const lo = s.y + IDLE_HIPS[HEADROOM_HIPS_READING][this.stance_] + HEADROOM_FOOT, hi = s.y + HEADROOM_TOP[to];
    return cameraClassClear(this.grid, [s.x, lo, s.z], [s.x, hi, s.z]);
  }

  /**
   * `FUN_0057f150` (D:L441263-441285): the jump's camera-class cast (`cameraClassClear`) from the stance's head + 1
   * (`JUMP_HEAD_READING`) up 20. The query only: `jump` does not ask it yet -- D13's refusal waits for its capture
   * (PTW.R1; research 230 s3.1, s7), so a roof over the head still lets a jump start.
   */
  jumpClear(): boolean {
    const s = this.state;
    const foot = s.y + IDLE_HEAD[JUMP_HEAD_READING][this.stance_] + JUMP_RAY_FOOT;
    return cameraClassClear(this.grid, [s.x, foot, s.z], [s.x, foot + JUMP_RAY_LENGTH, s.z]);
  }

  /**
   * SEGMENT-BODY: the body's segments for the displacement `d` from the feet as they are (`FUN_0054aa30`, the
   * controlled body's branch, D:L415341-415459 and the side lines D:L415549-415577 / D:L415789-415817, prone
   * D:L415582-415621 / D:L415822-415861), in the list's order: the centre, the head line, then the side lines.
   * `SEGMENT_BODY_READING`, `HEAD_LINE_MUZZLE_READING`; prone the ends lifted through the root's tilt as
   * `FUN_0054ecd0` lifts them (`PRONE_PROBE_TILT_READING`, D:L416972-417027: the travel in the body's frame turned by
   * the root, its y times the segment's length).
   */
  private bodySegments(d: readonly [number, number, number]): BodySegment[] {
    const s = this.state, B = SEGMENT_BODY_READING;
    const posture = this.posture_, prone = posture === 'prone';
    const { r, h } = STANCE[posture].probe;
    const yaw = (s.yaw * Math.PI) / 180, Fx = -Math.sin(yaw), Fz = -Math.cos(yaw);
    const still = Math.abs(d[0]) < B.still && Math.abs(d[1]) < B.still && Math.abs(d[2]) < B.still;
    let ux = Fx, uy = 0, uz = Fz;
    if (!still) { const n = Math.hypot(d[0], d[1], d[2]); ux = d[0] / n; uy = d[1] / n; uz = d[2] / n; }
    const fx = ux * B.ahead * r, fy = uy * B.ahead * r, fz = uz * B.ahead * r;
    const bx = still ? fx : d[0], bz = still ? fz : d[2], bl = Math.hypot(bx, bz);
    const sx = bl > 0 ? (-bz / bl) * r : 0, sz = bl > 0 ? (bx / bl) * r : 0;
    // The centre's 1.75: the body-frame z `+0x34` (forward is -z) over 0.01 standing or crouched, or under 0 crouched.
    // In the air `FUN_0054d9a0` writes it 0 (D:L416501-416514).
    const lz = this.inAir ? 0 : -(s.vx * Fx + s.vz * Fz);
    const word = this.stance_;
    const crouchRunFlag = CROUCH_RUN_FLAG_READING === 'set-while-running' && word === 'crouch' && posture === 'stand';
    const k = B.centre * ((word === 'stand' || word === 'crouch') && (lz > 0.01 || (word === 'crouch' && lz < 0 && !crouchRunFlag)) ? B.backing : 1);
    const q = this.rootTilt_.q;
    let per = 0;
    if (prone && q && PRONE_PROBE_TILT_READING === 'root' && PRONE_TILT_EASE_BASIS_READING === 'root-up') {
      let t = worldToBody(s.yaw, [d[0], 0, d[2]]);
      if (t[0] * t[0] + t[2] * t[2] < 0.001) t = [t[0], 0, -1];
      const tl = Math.hypot(t[0], t[2]);
      per = rotateByQuat(q, [t[0] / tl, 0, t[2] / tl])[1];
    }
    const lift = (a: readonly number[], b: readonly number[]): number => per * Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    const out: BodySegment[] = [];
    const centre: BodySegment = { a: [s.x, s.y + h, s.z], b: [s.x + fx * k + d[0], s.y + fy * k + d[1] + h, s.z + fz * k + d[2]], line: 0 };
    if (prone) centre.b[1] += lift(centre.a, centre.b);
    out.push(centre);
    const headY = s.y + wallProbeHeights(posture)[1];
    const forward = ux * Fx + uz * Fz > 0;
    const transition = this.action_?.name === 'standToCrouch' || this.action_?.name === 'crouchToProne' || this.action_?.name === 'standToProne';
    const envelope = HEAD_LINE_MUZZLE_READING === 'held' && this.bodyOwner() === null;   // FUN_00286c90(+0x458) over 0
    const muzzle = HEAD_LINE_MUZZLE_READING !== 'none' && (still || forward) && (prone || transition || envelope);
    const m = muzzle ? -SEGMENT_FIREPOINT_READING[posture][1] * B.centre : 0;
    const head: BodySegment = muzzle
      ? { a: [s.x, headY, s.z], b: [s.x + Fx * m + d[0], headY + d[1], s.z + Fz * m + d[2]], line: 1 }
      : { a: [s.x, headY, s.z], b: [s.x + fx + d[0], headY + fy + d[1], s.z + fz + d[2]], line: 1 };
    if (prone) head.b[1] += lift(head.a, head.b);
    out.push(head);
    for (const sign of [1, -1]) {
      if (!prone) {
        out.push({
          a: [s.x + sign * sx * B.sideNear, s.y + h, s.z + sign * sz * B.sideNear],
          b: [s.x + sign * sx * B.sideFar + fx + d[0], s.y + h + fy + d[1], s.z + sign * sz * B.sideFar + fz + d[2]],
          line: 2,
        });
      } else {
        const ax = sign * sx * B.sideNear * B.proneAcross, az = sign * sz * B.sideNear * B.proneAcross;
        const seg: BodySegment = {
          a: [s.x + ax - fx, s.y + h - fy, s.z + az - fz],
          b: [s.x + ax + fx + d[0], s.y + h + fy + d[1], s.z + az + fz + d[2]],
          line: 2,
        };
        const l = lift(seg.a, seg.b);
        seg.a[1] -= l * 0.5; seg.b[1] += l * 0.5;
        out.push(seg);
      }
    }
    return out;
  }

  /**
   * SEGMENT-BODY: the hit a segment keeps (`SEGMENT_HIT_PICK_READING`): the hull's one-sided test (research 281 s4.3,
   * `segmentHits`' `frontOnly`) over the movement's surfaces (bit 1 set, bit 18 clear, as `glideAi`'s), nearest first,
   * an equally near one replaced by the later (`FUN_002d4cc0` D:L175948-175952); dropped: a material flagged in bit 0
   * or 1 (`volumetric`, `liquid`) and, but in the knock's falls (`FUN_00588030`, r0004), a normal's y over `max_slope`.
   */
  private segmentHit(a: readonly [number, number, number], b: readonly [number, number, number]): SegmentHitOf | null {
    const floorPoly = this.slideFloorPoly_;
    const hits = segmentHits(this.grid, a, b, (p) => (surfaceWord(p) & (2 | (1 << 18))) === 2 && p !== floorPoly, ALL_LAYERS, true);
    const fallOver = this.action_?.name === 'fallForward' || this.action_?.name === 'fallBackwards';
    const passes = (h: SegmentHitOf): boolean => {
      const material = surfaceMaterial(h.poly.material);
      if (material.volumetric || material.liquid) return false;
      return fallOver || h.normal[1] <= AI_HULL_READING.slope;
    };
    if (SEGMENT_HIT_PICK_READING === 'nearest-then-drop') {
      let hit = hits[0];
      for (let i = 1; hit && i < hits.length && hits[i]!.t === hit.t; i++) hit = hits[i];
      return hit && passes(hit) ? hit : null;
    }
    let hit: SegmentHitOf | null = null;
    for (const h of hits) {
      if (hit && h.t !== hit.t) break;
      if (passes(h)) hit = h;
    }
    return hit;
  }

  /**
   * SEGMENT-BODY part 2: the move's stored contact (`actor+0x1090`, `FUN_005b0d30`), or null -- the one contact the
   * climb's offer reads (`./traversal` `keepContact`; `FUN_005b3ce0` reads `+0x10ac`, D:L469121-469127). The running
   * jump does not (`JUMP_CONTACT_PROVEN` 'none', the r0004 capture).
   */
  storedContact(): Readonly<StoredContact> | null {
    return this.contact_;
  }

  /**
   * SEGMENT-BODY part 2: `FUN_005b3890(actor, 0)` (D:L468957-469005) asked of the stored contact on any tick -- dropped
   * when the feet are more than 24 from it across the ground, behind its normal, or facing away from it (the matrix row
   * +0x20 against the normal). [Named departure, research 281 s4.1: the original asks it on a moving tick only
   * (D:L413623-413626, D:L413859-413862; `storeContact`); the port's climb asks it every tick as well (`./traversal`
   * `keepContact`), as the original's other per-tick paths drop the contact too (`FUN_0054a3d0` D:L414380) -- and the
   * capture shows a still body turned away loses its contact (r0004, ac 2026-11-04: `+0x10ac` clear whenever the offer
   * is off), by a path not read (research 86 s3.8). Its reach (fresh review 1's F6): the climb asks this after
   * `storeContact`'s slot branch, on ticks where the source runs no drop check (D:L413618-413671); the running jump
   * reads no contact (`JUMP_CONTACT_PROVEN` 'none'), so the drop governs the climb's offer alone.]
   */
  holdContact(): void {
    const c = this.contact_;
    if (!c) return;
    const s = this.state, ax = s.x - c.x, az = s.z - c.z;
    const yaw = (s.yaw * Math.PI) / 180, backX = Math.sin(yaw), backZ = Math.cos(yaw);   // the row +0x20: the facing negated
    if (ax * ax + az * az > 576 || ax * c.nx + az * c.nz <= 0 || backX * c.nx + backZ * c.nz <= 0) this.contact_ = null;
  }

  /**
   * SEGMENT-BODY part 2: the weapon line's length for the hand held (`./weaponLine` `WEAPON_LINE_LENGTH_READING`, by the
   * held model's `WEAP_GEO` name, case aside -- `weaponLineLengthOf`, the SA-80's `IW80A2`; `FUN_0054e8f0`
   * D:L416892-416902), or null with no model held or none known. The firearm hand's with an item up
   * (`WEAPON_LINE_ITEM_MODEL_PLACEHOLDER`).
   */
  weaponLineLength(): number | null {
    const name = this.hand === 1 ? this.heldModels.pistol : this.heldModels.rifle;
    return name !== null ? weaponLineLengthOf(name) : null;
  }

  /**
   * SEGMENT-BODY part 2: the weapon line -- the slot `actor+0x1140..+0x115c` (`FUN_005b0c70` D:L467345-467365), cleared as
   * the tick begins (`FUN_0054d9a0` D:L416434) and filled from one cast (D:L416630-416687), before the move's resolution
   * reads it (`FUN_005483d0`, after `FUN_0054d9a0` in the same actor tick, `FUN_005506a0` D:L417825). The segment
   * (`FUN_0054e8f0` D:L416858-416910): from the feet raised by the skeleton root's height (D:L416877-416880: `*(+0x2e8)`
   * is the `skel_root` part, research 180 s1.3, and its `+4` its height -- the port's stance root, `rootY`; the capture's
   * stored point sat 11.486 over the feet, the stand's root 11.484), along the facing (the matrix row +0x20 negated,
   * D:L416886-416891), `weaponLineLength` long (D:L416892-416902), plus the tick's unresolved displacement `d` (`+0xf44`,
   * D:L416904; written at D:L416520), level (D:L416905). Cast only with no slide speed (`+0x1340 == 0`, D:L416634), a
   * weapon held (D:L416869-416870) and the body casting at all (`weaponLineCast`: the controller's vtable +0x2c,
   * D:L416630-416633, `WEAPON_LINE_BOTS_READING`: the AI's answers 0). [reading: the turret set's guard (`+0x528 != DAT_0044d410`,
   * D:L416635), the aim point's (`+0x14ac`, D:L416874) and the fire point's (`+0x14bc`, D:L416882) are met by
   * construction -- the turret's hold moves the body by its own steer, not through here, and every firearm's model has
   * an `aimpoint` and a `firepoint` node, the two the mount finds into `+0x14ac` and `+0x14bc` (the body's slot +100,
   * research 202 s3.10; `weaponLine.test.ts` over the kit table's firearms).] The hit: the nearest crossed polygon
   * whose material is not VOLUMETRIC or LIQUID, at any slope (D:L416644-416672: the material table's `+0x3c` bits 0 and
   * 1), over the movement's surfaces as the segment records' query is (`segmentHit`), met from the front under
   * `WEAPON_LINE_ONE_SIDED_PLACEHOLDER`.
   */
  private weaponLine(d: readonly [number, number, number]): SegmentHitOf | null {
    if (!this.weaponLineCast || this.slideSpeed_ !== 0) return null;
    const length = this.weaponLineLength();
    if (length === null) return null;
    const s = this.state, y = s.y + rootY(this.posture);
    const yaw = (s.yaw * Math.PI) / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const a: [number, number, number] = [s.x, y, s.z];
    const b: [number, number, number] = [s.x + fx * length + d[0], y, s.z + fz * length + d[2]];
    const hits = segmentHits(this.grid, a, b, (p) => (surfaceWord(p) & (2 | (1 << 18))) === 2, ALL_LAYERS, WEAPON_LINE_ONE_SIDED_PLACEHOLDER);
    for (const h of hits) {
      const material = surfaceMaterial(h.poly.material);
      if (!material.volumetric && !material.liquid) return h;
    }
    return null;
  }

  /**
   * SEGMENT-BODY (`JUMP_CONTACT_PROVEN`): the stored contact `FUN_005483d0` keeps for the move.
   * - **A record hit** (D:L413823-413866, `FUN_005b0d30` D:L467392-467419): of the first two segments (the centre and the
   *   head line), the hit nearest its segment's start is stored, its polygon's own normal. When it climbs (`FUN_0059d9f0`:
   *   appflags 1, 3, 4, 5, D:L457424-457426), any other kept hit on another polygon (the slot's `+0xc`, D:L413884) whose
   *   horizontal normal dotted with the stored one's is under 0.9 (both levelled and normalised, D:L413869-413893; the
   *   literal `CORNER_DOT`, D:L413894) clears it (`FUN_005b0d30(actor, 0)` -> `FUN_005b3890(actor, 1)`, D:L413895,
   *   D:L467399-467400) -- the inside corner. Part 2: the corner drop is here, over the segment records' own hits; the
   *   disc arm's stand-in stays `./climb` `cornerDrop`.
   * - **No hit at all, and the weapon-line slot set** (part 2, D:L413618-413671): the slot (`weaponLine`) is stored when no
   *   contact is held, or the slot's polygon climbs (`FUN_0059d9f0`) or is a ladder (appflags 2), D:L413627-413645; else
   *   when the held contact does not climb (and is not a ladder), D:L413646-413657; else when the feet are more than 24
   *   from the held contact across the ground, D:L413658-413668. No drop check on such a tick.
   * - **Otherwise** (no hit of the first two, or no hit and no slot), a moving body (the displacement's square over 2e-5,
   *   D:L413459-413461) asks `FUN_005b3890(actor, 0)` (D:L413623-413626, D:L413859-413862; `holdContact`'s rule).
   * [reading, pending review: the climb-material rule of `FUN_005b3890` (a ditype-2 polygon's heights) and its `+0x1061`
   * bit are not built. `+0x115c` is the weapon-line slot's set word (`FUN_005b0c70` D:L467345-467365), not a ladder's
   * contact as this note once had it.]
   */
  private storeContact(
    kept: readonly { seg: BodySegment; hit: SegmentHitOf; index: number }[], d: readonly [number, number, number], slot: SegmentHitOf | null,
  ): void {
    let best: { seg: BodySegment; hit: SegmentHitOf } | null = null, bestD = Infinity;
    for (const k of kept) {
      if (k.index > 1) continue;
      const p = k.hit.point, a = k.seg.a;
      const dd = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 + (p[2] - a[2]) ** 2;
      if (dd < bestD) { bestD = dd; best = k; }
    }
    if (best) {
      this.contact_ = contactOfHit(best.hit);
      if (CLIMBABLE.has(best.hit.poly.appflags ?? 0)) {
        const level = (n: readonly number[]): [number, number] => {
          const l = Math.hypot(n[0]!, n[2]!);
          return l !== 0 ? [n[0]! / l, n[2]! / l] : [n[0]!, n[2]!];   // unnormalised when 0 (D:L413872-413877, D:L413888-413893)
        };
        const [sx, sz] = level(best.hit.normal);
        for (const k of kept) {
          if (k.hit.poly === best.hit.poly) continue;
          const [ox, oz] = level(k.hit.normal);
          if (sx * ox + sz * oz < CORNER_DOT) { this.contact_ = null; break; }
        }
      }
      return;
    }
    if (kept.length === 0 && slot) {
      const climbs = (p: WorldPoly): boolean => CLIMBABLE.has(p.appflags ?? 0) || (p.appflags ?? 0) === 2;
      const c = this.contact_, s = this.state;
      if (!c || climbs(slot.poly) || !climbs(c.poly) || (s.x - c.x) ** 2 + (s.z - c.z) ** 2 > 576) this.contact_ = contactOfHit(slot);
      return;
    }
    if (!(d[0] * d[0] + d[1] * d[1] + d[2] * d[2] > 2e-5)) return;
    this.holdContact();
  }

  /**
   * SEGMENT-BODY: `FUN_005483d0` on the body's segments (D:L413406-413614, D:L413673-413800): the displacement `d` from
   * the feet as the tick began, resolved. Each kept hit in the segments' order: the normal levelled (its y under
   * `max_slope` made 0) and normalised (D:L413538-413541); in the air (the jump's and the knock's actions,
   * `FUN_00587f50` / `FUN_00587f10` / `FUN_00588030`) the displacement put out by the segment's end's depth behind the
   * face (D:L413543-413556), on the ground its whole part along the normal taken away -- the port's `vx` / `vz` with it
   * (D:L413557-413567); the carried velocity loses its part into the face (D:L413588-413594). The deepest hit (the end's
   * depth along the normal; the controlled body's, every walker here) over 1 puts the body back where the tick began
   * when prone or with more than two hits, else adds the depth less 1 along that normal (D:L413602-413614). Then, with a
   * hit and no slide speed, the look-ahead (`SEGMENT_LOOK_AHEAD_READING`). The new position is the start plus what is
   * left (D:L413918).
   */
  private resolveSegments(d: [number, number, number]): [number, number, number] {
    const s = this.state, B = SEGMENT_BODY_READING;
    const kept: { seg: BodySegment; hit: SegmentHitOf; index: number }[] = [];
    const slot = this.weaponLine(d);                              // part 2: the slot, cast first (FUN_0054d9a0)
    const segments = this.bodySegments(d);
    for (let index = 0; index < segments.length; index++) {
      const seg = segments[index]!, hit = this.segmentHit(seg.a, seg.b);
      if (hit) kept.push({ seg, hit, index });
    }
    this.storeContact(kept, d, slot);
    if (kept.length === 0) return d;
    let [dx, dy, dz] = d;
    const air = this.inAir;
    let deepest = 0, dnx = 0, dny = 0, dnz = 0;
    for (const { seg, hit } of kept) {
      let [nx, ny, nz] = hit.normal;
      if (ny < AI_HULL_READING.slope) ny = 0;
      const n = Math.hypot(nx, ny, nz);
      if (n > 0) { nx /= n; ny /= n; nz /= n; }
      const dot = (seg.b[0] - hit.point[0]) * nx + (seg.b[1] - hit.point[1]) * ny + (seg.b[2] - hit.point[2]) * nz;
      if (air) {
        if (dot < 0) { dx -= dot * nx; dy -= dot * ny; dz -= dot * nz; }
      } else {
        const p = dx * nx + dy * ny + dz * nz;
        dx -= p * nx; dy -= p * ny; dz -= p * nz;
        const v = s.vx * nx + s.vz * nz;
        s.vx -= v * nx; s.vz -= v * nz;
      }
      const depth = Math.abs(dot);
      if (depth > deepest) { deepest = depth; dnx = nx; dny = ny; dnz = nz; }
      const [cx, cz] = this.carried, into = cx * nx + cz * nz;
      if (into < 0) this.carried = [cx - into * nx, cz - into * nz];
      this.wallHits_.push({ poly: hit.poly, line: seg.line, x: hit.point[0], y: hit.point[1], z: hit.point[2] });
    }
    const stop = (): [number, number, number] => {
      if (!air) { s.vx = 0; s.vz = 0; }
      return [0, 0, 0];
    };
    const prone = this.stance_ === 'prone' || this.posture_ === 'prone';
    if (deepest > B.depth) {
      if (prone || kept.length > B.jamHits) return stop();
      dx += (deepest - B.depth) * dnx; dy += (deepest - B.depth) * dny; dz += (deepest - B.depth) * dnz;
    }
    if (this.slideSpeed_ !== 0) return [dx, dy, dz];
    if (prone && PRONE_TURN_WORD_PLACEHOLDER !== 0) return stop();
    const level = Math.hypot(dx, dz);
    if (!(level > 1e-6)) return [dx, dy, dz];
    const L = SEGMENT_LOOK_AHEAD_READING, size = Math.hypot(dx, dy, dz);
    const ux = dx / size, uy = dy / size, uz = dz / size;
    let base: number = L.prone;
    if (!prone) {
      const yaw = (s.yaw * Math.PI) / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
      const [px, pz] = SEGMENT_FIREPOINT_READING[this.posture_];
      const along = (px * c + pz * sn) * ux + (-px * sn + pz * c) * uz;
      base = Math.max(this.stance_ === 'crouch' ? L.crouch : L.stand, along);
    }
    const reach = base + level;
    const a: [number, number, number] = [s.x, s.y + SEAL_TUNING.stepHeight, s.z];
    if (this.segmentHit(a, [a[0] + ux * reach, a[1] + uy * reach, a[2] + uz * reach])) return stop();
    for (const { seg, hit } of kept) {
      const p = hit.point, w = L.from;
      const from: [number, number, number] = [p[0] * (1 - w) + seg.a[0] * w, p[1] * (1 - w) + seg.a[1] * w, p[2] * (1 - w) + seg.a[2] * w];
      let vx = dx, vy = dy, vz = dz;
      if (dx * dx + dz * dz < L.least * L.least) { const k = L.least / size; vx *= k; vy *= k; vz *= k; }
      if (this.segmentHit(from, [from[0] + vx, from[1] + vy, from[2] + vz])) return stop();
    }
    return [dx, dy, dz];
  }

  /**
   * A body that does not move this tick but stands inside its radius of a wall (a door leaf swung into it, a spawn, a
   * knock) is pushed out as a step would push it, onto the floor there -- never across a wall (`crosses`); the original
   * resolves its probe's contacts every tick (`FUN_0054aa30` -> `FUN_005483d0`), moving or not. HOTFIX BRIDGE-WEDGE: with
   * no room for the radius, the wedged body's push-out (`unwedge`, `WEDGE_PUSH_OUT_ADAPTATION`).
   */
  private pushOut(): void {
    if (this.inAir) return;
    const s = this.state;
    const [x, z] = this.slide(s.x, s.z, s.x, s.z);
    if (this.crosses(s.x, s.z, x, z)) { this.unwedge(); return; } // no room for the radius: never through a wall
    if (x !== s.x || z !== s.z) this.step(x - s.x, z - s.z);
  }

  /**
   * HOTFIX BRIDGE-WEDGE (`WEDGE_PUSH_OUT_ADAPTATION`, an adaptation; research 217 s2.10): a body on the
   * ground within `ticks` of a landing, already inside the walls (`penetration` over `WEDGE_CLEAR`), whose push-out the
   * crossing guard refuses -- from `pushOut`, or a ground sub-step whose every try the guard refused (never a floor
   * refusal) -- is put once at the nearest free point -- the nearest ring first, each ring's headings in order
   * from +x -- within the deepest penetration plus the radius, its disc clear at both lines, reached from the tick's start
   * and from where it stands crossing no face from in front of its own normal, on a floor the walk takes
   * (`groundEndpoint`) at the body's own level -- no lower than `ground_touch_distance` under the feet, so the push never
   * starts a fall. Nothing when the body is clear (the bound: a body with no penetration is never touched), in the
   * air, or when no point qualifies. Whether it moved.
   */
  private unwedge(): boolean {
    if (!WEDGE_PUSH_OUT_ADAPTATION.on || this.inAir || this.wedgeArmed <= 0) return false;
    const s = this.state, r = this.wallRadius();
    const depth = this.penetration(s.x, s.z, r);
    if (depth <= WEDGE_CLEAR) return false;
    const limit = depth + r, { headings, step } = WEDGE_PUSH_OUT_ADAPTATION;
    const x0 = s.x, z0 = s.z;
    for (let ring = 1, rings = Math.ceil(limit / step); ring <= rings; ring++) {
      const d = Math.min(ring * step, limit);
      for (let k = 0; k < headings; k++) {
        const a = (k * 2 * Math.PI) / headings;
        const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
        if (this.penetration(x, z, r) > WEDGE_CLEAR) continue;
        if (this.crosses(this.tickFromX, this.tickFromZ, x, z, s.y, true) || this.crosses(x0, z0, x, z, s.y, true)) continue;
        // On its own floor's level: never a push off an edge into a fall (MP51's window frame, the review of 1c594ffa4: a
        // push 4.8 off the floor at 62.83 dropped the body 106 to -43).
        const floor = selectFloor(probeGround(this.grid, x, z), s.y + STEP_PROBE_LIFT_READING, s.y);
        if (!floor || floor.y < s.y - SEAL_TUNING.groundTouchDistance) continue;
        if (this.groundEndpoint(x, z)) return true;
      }
    }
    return false;
  }

  /** The disc's radius against the walls: the stance's probe radius, prone the fan's across (`slide`). */
  private wallRadius(): number {
    const probe = STANCE[this.posture_].probe;
    return this.posture_ === 'prone' ? probe.r * PRONE_FAN_READING.across : probe.r;
  }

  /**
   * HOTFIX BRIDGE-WEDGE: how deep a disc of radius `r` at (x, z) lies in the walls its probe lines meet at the feet as they
   * are -- the radius less the nearest face's distance, or the radius plus it inside a footprint; 0 or less is clear.
   */
  private penetration(x: number, z: number, r: number): number {
    const heights = wallProbeHeights(this.posture_).map((h) => this.state.y + h);
    const bounds = [x - r, z - r, x + r, z + r] as const;
    let depth = -Infinity;
    for (const w of this.crossingWallsNear(x, z, bounds)) {
      if (this.slideFloorPoly_ && w.poly === this.slideFloorPoly_) continue;
      for (const y of heights) {
        if (!probeMeets(w, y)) continue;
        const band = wallFootprint(w, y);
        if (band.length < 4) continue;
        const near = nearest(band, x, z);
        depth = Math.max(depth, near.inside ? r + near.d : r - near.d);
      }
    }
    return depth;
  }

  /**
   * The horizontal move of a tick in sub-steps of at most `MAX_SUBSTEP`: on the ground, or in the air past an edge.
   * SEGMENT-BODY (`WALL_BODY_READING` 'segments'): the walls first, once, on the whole move from where the tick began
   * (`resolveSegments`, still or not: a still body casts along its facing, D:L415135-415161), then the floors along
   * what is left, sub-step by sub-step (`step`'s floor rules, the port's own: `FUN_005b0840` probes once at the new
   * position).
   */
  private move(dx: number, dz: number, correct?: GroundCorrection): void {
    if (WALL_BODY_READING === 'segments') {
      [dx, , dz] = this.resolveSegments([dx, 0, dz]);
      const distance = Math.hypot(dx, dz);
      if (distance === 0) { if (correct && !this.inAir) this.step(0, 0, correct); return; }
      const parts = Math.ceil(distance / MAX_SUBSTEP);
      for (let i = 0; i < parts; i++) {
        if (this.inAir) this.airStep(dx / parts, dz / parts);
        else this.step(dx / parts, dz / parts, i === parts - 1 ? correct : undefined, !!correct && i < parts - 1);
      }
      return;
    }
    const distance = Math.hypot(dx, dz);
    if (distance === 0) { this.pushOut(); if (correct && !this.inAir) this.step(0, 0, correct); return; }
    const parts = Math.ceil(distance / MAX_SUBSTEP);
    for (let i = 0; i < parts; i++) {
      if (this.inAir) this.airStep(dx / parts, dz / parts);
      else this.step(dx / parts, dz / parts, i === parts - 1 ? correct : undefined, !!correct && i < parts - 1);
    }
  }

  /**
   * One airborne tick. The carried velocity moves the feet across the ground at the tick (a per-second law); the
   * vertical steps once per 30 Hz game frame the tick completes (`airClock`, PF.R8: the discretisation is the game's,
   * research 208 section 2) -- none on some ticks, one on most. Each frame, in `FUN_005af930`'s order (research 90
   * section 8): a running jump's `JUMP_DELAY` counts down by the frame's dt, and on the frame it runs out the fall speed
   * becomes `runningJumpSpeed` up (`actor+0x133c = +0x1364`); then `FUN_0059b440`: gravity on `vy`, then the height by
   * `vy`. While the delay runs the landing is off (`FUN_0059ad30` wants `actor+0x1360 <= 0`) and the feet sink from rest.
   * Then, each tick, the floor as the ground takes it
   * (`selectFloor`): feet under it are put on it -- a rise goes on, a fall is the landing, classed and given its clip
   * by `land` (web research 86 section 6.3: before 2026-09-29 only a floor under the feet as they were was looked at,
   * so a slope rising over a jump's feet was never met and the SEAL fell through it). The stick reads 0 in the air (`FUN_005af930`
   * zeroes `actor+0x240..0x244`).
   */
  private fall(dt: number, forward: number, right: number): void {
    const s = this.state;
    this.stopSlide();                                            // airborne: the slide stops, no exit landing (research 201 §3)
    s.stickForward = 0; s.stickRight = 0;
    this.ground_ = { state: 'idle', forward: 0, right: 0, cls: -1 };
    // FUN_005af930 (466729-467019), the airborne branch: with neither action 8 (`Jump launch`) nor 9 (`Jump fall`)
    // current, FUN_0057e130 -> FUN_0057e050 pushes `Jump fall`. The launch is `NoInterrupt ()` and ends only with its
    // play (FUN_00582540 on FUN_0028c6e0's end, 2.21 s) or the landing's pop, so a flat running jump (0.75 s) lands in
    // the launch -- about its key 8 -- and `seal_runningjump_in_air` plays only on a walk-off or a flight outlasting
    // the launch [reading: the game pushes the fall the tick after the launch's pop; here the same tick].
    const held = this.action_?.name;
    if (held !== 'fall' && held !== 'launch' && held !== 'fallForward' && held !== 'fallBackwards') this.start('fall', null);   // FUN_0057e050: `Jump fall`
    [s.vx, s.vz] = this.carried;
    this.airTime += dt;
    const startX = s.x, startZ = s.z;                            // where the tick began (HOTFIX BRIDGE-WEDGE)
    const segments = WALL_BODY_READING === 'segments';
    if (!segments) this.move(s.vx * dt, s.vz * dt);
    const from = s.y;
    // MISSION R8, the drawing's bookkeeping only (see `airFrom`): a move of the height not made by a game frame (a
    // nudge, a floor ridden) carries the last frame's pair with it; each frame records the height it starts from.
    this.fell = true;
    this.airFrom += s.y - this.airTo;
    this.airTo = s.y;
    for (let frames = this.airClock.advance(dt); frames > 0; frames--) {
      this.airFrom = s.y;
      // FUN_005af930 (D:L466797-466803) counts actor+0x1360 down by the frame's dt, then FUN_0059b440 (D:L456496-456498)
      // adds g dt to the fall speed and moves the height by it -- the wind-up's frames included: from 0.1 the delay
      // reads 0.0666, 0.0333, then -0.0001, so the feet sink g dt^2 (1 + 2) = 0.785 over two frames and the third
      // takes the impulse before its step: 79.9 - g dt up, 1.62 over the floor (research 90 section 8's order).
      if (this.jumpDelay > 0) {
        this.jumpDelay -= GAME_FRAME_DT;
        if (this.jumpDelay <= 1e-9) { this.jumpDelay = 0; s.vy = runningJumpSpeed(); }
      }
      s.vy -= SEAL_TUNING.gravity * GAME_FRAME_DT;
      s.y += s.vy * GAME_FRAME_DT;
      this.airTo = s.y;
    }
    // HF2-slim's air pass (`airWalls`) is the disc arm's: on the segment path the segments carry the fall's walls.
    let picked: ReturnType<typeof selectFloor> | undefined;
    if (segments) {
      // SEGMENT-BODY: the tick's whole displacement -- the carried move across and the frames' fall -- is the segments'
      // (`FUN_0054d9a0` D:L416501-416530; `FUN_0054aa30` D:L415157-415166), resolved from where the tick began
      // (`resolveSegments`); the move across then takes the probe-miss rule (`airStep`), the height what is left.
      const dy = s.y - from;
      s.y = from;
      const [rx, ry, rz] = this.resolveSegments([s.vx * dt, dy, s.vz * dt]);
      const distance = Math.hypot(rx, rz), parts = Math.ceil(distance / MAX_SUBSTEP);
      for (let i = 0; i < parts; i++) this.airStep(rx / parts, rz / parts);
      // `AIR_HEIGHT_READING`: the height is the frames' own step (`FUN_0059b440` on the altitude `+0x2e4`), not the
      // resolved displacement's y -- the jam zeroes `+0xf44..+0xf4c`, not the fall.
      s.y = from + (AIR_HEIGHT_READING === 'altitude' ? dy : ry);
      this.airTo = s.y;
      [s.vx, s.vz] = this.carried;
    } else picked = this.airWalls(startX, startZ, from);
    if (this.jumpDelay > 0) return;                              // the wind-up: the landing is off
    // The floor is FUN_005b5d40's pick, as on the ground: the highest at or under the probe's origin + 1 (the feet as
    // they were + STEP_PROBE_LIFT_READING + 1, the tick's one origin), else the lowest while within 20 over the feet -- so a slope that rose over the feet is still
    // theirs. FUN_0059ad30 (456313-456322) puts the feet on it whenever they are under it, rising or not, and
    // FUN_0059b440's walk-off branch (456502-456512) zeroes the fall speed only when it is a fall: rising into the
    // ground the feet ride it and the rise goes on; falling, it is the landing (web research 86 section 6.3).
    // HF2-slim: the air pass's own pick at the same point, the same origin and feet, when it left the body there.
    const floor = picked !== undefined ? picked : selectFloor(probeGround(this.grid, s.x, s.z), from + STEP_PROBE_LIFT_READING, s.y);
    if (floor && s.y <= floor.y) {
      s.y = floor.y;
      this.setFloorNormal(floor.normal);
      if (s.vy <= 0) this.land(forward, right);
      this.airFrom += s.y - this.airTo;                          // MISSION R8: the floor's correction carries the pair
      this.airTo = s.y;
    }
  }

  /**
   * The landing (`FUN_005af930` -> `FUN_005af590`, decomp 466641-466728): the contact speed classed for the hook
   * (`./physics` `landingKind`); over `land_hard_fall_rate` the hard clip, else with the stick at rest or the last
   * airborne velocity (the fall included) under `LAND_STILL` the soft one, else none -- the stick taking the run on at
   * once (`actor+0x248 = +0x244`). No jump for `JUMP_LOCK` after (`actor+0x135c`, `FUN_005af930` D:L466889).
   *
   * A slide exit passes `slideExit` (the slide speed) and is `FUN_005af590` only: no jump lock. Its still test reads
   * the actor's horizontal velocity and the stick (D:L466676-466684), not the slide speed — that speed is over
   * `land_fall_rate` by the time this runs, so putting it in `vy` made the slow-velocity branch fail. Research 80
   * §2.4 and research 230 read the stick half as at rest (`idle`, `FUN_00586f00`'s 0.03, the two axes at
   * D:L466680-466681). No wider small-stick threshold is transcribed, so none is added.
   */
  private land(forward: number, right: number, slideExit?: number): void {
    const s = this.state;
    const speed = slideExit ?? Math.max(0, -s.vy);
    const still = idle(forward, right) || Math.hypot(s.vx, slideExit === undefined ? s.vy : 0, s.vz) <= LAND_STILL;
    let clip: Landing['clip'] = null;
    const knocked = this.action_?.name;
    this.knockLanding_ = knocked === 'fallForward' || knocked === 'fallBackwards';
    if (knocked === 'fallForward' || knocked === 'fallBackwards') {
      // BLAST KNOCK: on the ground in `Fall forward` / `Fall backwards`, `FUN_005805b0` (via L441960-441985) pushes
      // `Land forward` / `Land backwards`; its end pushes the get-up (L446653-446700).
      clip = knocked === 'fallForward' ? 'landDeath' : 'landBackwards';
    } else if (speed > JUMP_TABLE.land_hard_fall_rate) {
      // FUN_005af590 by FUN_005ac1f0's class: death `Land forward`, heavy one of the two hits, else `Jump land hard`.
      const cls = landingClass(speed);
      // A corpse's class is 3 whatever its speed (D:L466658-466660: the alive bit clear): `Land forward`, no coin (PF-21).
      // The living's heavy coin (L466667-466669) from the command (LANDING_HIT_DRAW_READING), or a test's `random`.
      const draw = cls === 2 && !this.dead_ ? (this.random ? this.random() : landingHitDraw(this.commandSeq)) : 1;
      clip = this.dead_ || cls === 3 ? 'landDeath' : cls === 2 ? (draw <= 0.5 ? 'hitStomach' : 'hit') : 'landHard';
    } else if (still) clip = 'land';
    this.landing_ = { kind: landingKind(speed, JUMP_TABLE), speed, airTime: this.airTime, clip, cls: landingClass(speed), knocked: this.knockLanding_ };
    s.vy = 0;
    this.inAir = false;
    this.jumping = false;
    if (slideExit === undefined) this.jumpLock = JUMP_LOCK;
    this.wedgeArmed = WEDGE_PUSH_OUT_ADAPTATION.ticks;           // HOTFIX BRIDGE-WEDGE: a landing may have wedged it
    // PAR-62, PAR-66: the top changes before the driver's cut, clip or none -- no cut on this tick (`cutAsked`).
    this.landedPop = true;
    const covered = this.coveredHold_;
    this.coveredHold_ = null;                                    // PAR-79: a landing's clip pops it with the stack (FUN_005af590 D:L466691-466693)
    if (clip) this.start(clip, ACTION_SECONDS[clip], false, 'complete');   // the fall's (or the launch's) end: the landing
    else {
      // FUN_00589aa0 pops the launch or the fall, and FUN_0028da00 hands back the play it was pushed over -- the run
      // the SEAL left the floor in -- so the landing tick poses the locomotion, never a frame of the stand; the next
      // tick's ground state takes the stick on (FUN_005af930's no-clip branch, 0x248 = 0x244).
      this.endBody('complete');
      this.ground_ = this.groundBefore;
      s.stickForward = forward; s.stickRight = right;
      // PAR-79: the reload hold the fall covered is handed back with its clip (`FUN_0028da00` D:L135104-135107), its
      // phase kept; the landing's tick advances it (the peek spends the fresh skip, D:L418293, before D:L418454) and asks
      // neither its end nor its cut -- its end from the next tick (`runHold`), its cut a game frame on (`holdCut`).
      if (covered) this.hold_ = { ...covered, t: covered.t + this.clocked, back: 0 };
    }
  }

  /**
   * An airborne sub-step: the walls push, then the column is the ground's own pick, as every tick's probe takes it
   * (`FUN_005b0420` 467037-467110 through `FUN_005b5d40` 470163-470290: the highest floor at or under the origin + 1,
   * else the lowest, refused only when more than 20 over the feet) -- `selectFloor` from the feet +
   * `STEP_PROBE_LIFT_READING`, the tick's one origin (`FUN_005b0840`, socom_pc research 23 s1.1-1.2). A
   * floor found up to 20 over the feet is entered, and the tick's floor then puts the feet on it (`fall`; `FUN_0059ad30`
   * 456313-456322, `FUN_0059b440` 456502-456512). No floor -- the map's edge, a hole, a top more than 20 over the feet
   * -- is the probe's miss, which with `DAT_003df1c8` set (1 in the ELF) puts the actor back at its last hit
   * (`FUN_003157d0` on `+0x400..+0x408`): the sub-step is not taken (research 86 s6.3; OWNER-5 2026-09-29 retired the
   * viewer's former `step_height` allowance here).
   */
  private airStep(dx: number, dz: number): void {
    const s = this.state;
    const segments = WALL_BODY_READING === 'segments';            // SEGMENT-BODY: the walls already met (`fall`, `move`)
    const [x, z] = segments ? [s.x + dx, s.z + dz] : this.slide(s.x + dx, s.z + dz, s.x, s.z);
    if (!segments && this.crosses(s.x, s.z, x, z)) return;
    if (!selectFloor(probeGround(this.grid, x, z), s.y + STEP_PROBE_LIFT_READING, s.y)) return;
    s.x = x; s.z = z;
  }

  /**
   * HOTFIX BRIDGE-WEDGE (`AIR_WALL_HEIGHTS_READING`; research 217 s2.10): the walls again at the
   * lines over the feet the tick leaves, every airborne tick, moving or still -- the original's displacement carries the
   * fall and its segments are resolved every tick in the air (`FUN_0054d9a0` D:L416501-416530, `FUN_0054aa30`
   * D:L415157-415166, `FUN_005506a0` D:L417822-417826). The feet are the game frames' or, when the tick's pick (`fall`'s,
   * from `from` + `STEP_PROBE_LIFT_READING`) puts them on a floor over them, that floor's: a body carried over a rim it
   * lands on meets the rim's face no more than the landing does. Only faces met from in front of their own normal, from
   * where the tick began (research 281 s4.3, the hull's one-sided hit): a falling body never meets a face from behind
   * here, as the airborne sub-step's two-sided lines at the tick's start still do. The tick's move from (`startX`,
   * `startZ`) that crosses such a face is not taken, as the airborne sub-step's (`crosses`) -- the whole move undone, which
   * is the jam branch's outcome (the body where the tick began, D:L413602-413611 with D:L413918), where the cited hit
   * itself takes only the displacement's part along its normal (`FUN_005483d0` D:L413557-413567). The original also
   * pushes in the same tick: when the deepest hit's depth is over 1.0, `bVar6` is clear (it is set by any of three action
   * checks, actions 0x1a-0x1c, or two others, or the stance word at 2, prone: D:L413481-413502) and there are at most two
   * hits, the displacement takes (depth - 1) along
   * that hit's normal (D:L413612-413614; the depth is gathered only for hits the controller's vtable +0x2c accepts,
   * D:L413569-413587) -- to within 1.0 of the face, not a radius off it. The port builds neither that push nor the jam's
   * trigger (`WALL_DEEP_REVERT_READING`, LATER 283: they want the segments' depths and hit counts), and no stand-off push
   * here: a push to the disc's radius at these lines fought the next tick's sub-step at its own lines, holding a falling
   * body off the floor it would land on (BRIDGE-WEDGE's fold, 2026-11-02: MP61 prone fell through the world, MP1 prone
   * and MP5 crouch / stand-run ended airborne). A body still in front of a face meets it at the next airborne sub-step's
   * lines (`airStep`, two-sided as before) and at its landing (`pushOut`), as on main.
   */
  private airWalls(startX: number, startZ: number, from: number): ReturnType<typeof selectFloor> | undefined {
    if (AIR_WALL_HEIGHTS_READING !== 'start-and-end') return undefined;
    const s = this.state;
    // The tick's floor pick, made once: `fall` takes it back when the body stays where it is (HF2-slim's cost, f9's MP2
    // cells: the pass had doubled the airborne tick's probe).
    const floor = selectFloor(probeGround(this.grid, s.x, s.z), from + STEP_PROBE_LIFT_READING, s.y);
    if (startX === s.x && startZ === s.z) return floor;          // no move: nothing to cross
    const feet = floor && s.y <= floor.y ? floor.y : s.y;
    if (this.crosses(startX, startZ, s.x, s.z, feet, true)) { s.x = startX; s.z = startZ; return undefined; }
    return floor;
  }

  /**
   * One sub-step on the ground: move, slide off the walls, then stand on the floor there -- `selectFloor` from the
   * origin y + `STEP_PROBE_LIFT_READING` (5.5) with the feet at y: the highest floor at or under the origin + 1, else the
   * lowest, refused only when more than 20 over the feet (`FUN_005b5d40` D:L470232-470274), as the airborne sub-step's.
   * No rise is compared with `step_height` (issue #111, research 217 s2.6): the original compares none in the walk --
   * `step_height` is the height of the wall probes (`FUN_0054aa30` D:L415167, research 217 s2.1) and lifts the contact
   * branch's look-ahead query (`FUN_005483d0` D:L413686-413736; research 86 s6.5), which the slide's low probe line at
   * the feet + 6.5 (`wallProbeHeights`) and `crosses` stand for, so a face taller than 6.5 stops the body, and a floor
   * over 6.5 with no face in the way (a stair's side edge) is stepped onto when no floor lies at or under the feet + 6.5
   * at the new point (else the pick is that floor, as before). A climb onto a floor
   * steeper than `max_slope` is not refused (LATER 590, closed: the walk compares no rise, `FUN_005b5d40`
   * D:L470163-470290; a steep face stops the body where the segments at `step_height` meet it, `resolveSegments`); one
   * more than `ground_touch_distance` under the feet takes the step and leaves
   * the mover in the air. A refused step is tried again as its part along x and its part along z, so a mover pressed diagonally
   * against an edge runs along it rather than stopping dead; with no floor for either, it stays where it was.
   */
  private step(dx: number, dz: number, correct?: GroundCorrection, deferFloor = false): void {
    const s = this.state;
    let tried = 0, crossed = 0;                                  // HOTFIX BRIDGE-WEDGE: what refused the tries
    for (const [ax, az] of [[dx, dz], [dx, 0], [0, dz]] as const) {
      if (ax === 0 && az === 0 && !correct) continue;
      tried++;
      // SEGMENT-BODY: the walls were met once, on the whole move (`move` -> `resolveSegments`); here the floors only.
      let [x, z] = WALL_BODY_READING === 'segments' ? [s.x + ax, s.z + az] : this.slide(s.x + ax, s.z + az, s.x, s.z);
      // A slide with no room never carries the body through a wall (the disc arm; HF2-slim counts the refusal).
      if (WALL_BODY_READING !== 'segments' && this.crosses(s.x, s.z, x, z)) { crossed++; continue; }
      // FUN_005483d0 D:L413918-413955: final AI correction follows hull resolution, before the ground query.
      // AI ground motion resolves every hull substep before its one correction and floor query.
      // Ordinary player movement omits this seam and keeps its existing per-substep floor decisions.
      if (deferFloor) { s.x = x; s.z = z; return; }
      if (correct) { const at = correct([x, s.y, z]); x = at[0]; z = at[2]; correct = undefined; }
      if (this.groundEndpoint(x, z)) return;
    }
    // HOTFIX BRIDGE-WEDGE: nothing taken, and every try refused by the crossing guard -- wedged, put out. A floor refusal
    // (no floor; a steep rise was one until LATER 590) is the walk's own and never asks the push-out (the review of
    // 20c326dfb: healthy bodies on MP6's and MP9's steep ground were moved).
    if (tried > 0 && crossed === tried) this.unwedge();
  }

  private groundEndpoint(x: number, z: number): boolean {
    const s = this.state, floor = selectFloor(probeGround(this.grid, x, z), s.y + STEP_PROBE_LIFT_READING, s.y);
    if (!floor) return false;
    const rise = floor.y - s.y;
    s.x = x; s.z = z;
    if (rise < -SEAL_TUNING.groundTouchDistance) {
      this.takeOff(); this.start('fall', null);
    } else { s.y = floor.y; this.setFloorNormal(floor.normal); }
    return true;
  }

  /**
   * Pushes (x, z) out of every wall the body's probes meet (PF-16: `wallProbeHeights`, the low probe and the head line,
   * each a level line over the feet; prone, the low line ahead rises with the root's tilt -- `PRONE_PROBE_TILT_READING`,
   * `rayToWallTilted`) until it is the class radius from each, and takes the
   * velocity's part into a wall away (research 24 section 2 step 3; `FUN_005483d0` D:L413533-413597 removes it too, and
   * does not place the body past the face). Standing and crouched the radius is `WALL_PROBE_READING`'s 3.5 every way;
   * prone the fan (`PRONE_FAN_READING`): 0.39 r = 3.12 off the axis every way, and 8.0 ahead along the travel -- a wall
   * the line ahead meets nearer than 8.0 pushes the body back along the wall's normal till the line's hit is 8.0 out,
   * so it slides along a wall it meets aslant. A mover already inside a wall's footprint is pushed out to the side it
   * came from. At a face's END (the band's nearest point is one of its ends) nothing pushes along the direction from
   * that corner: the move and the velocity lose their parts into the face along the face's own normal, as the
   * original's hit (`WALL_END_CONTACT_READING`, MV-PARITY b2).
   *
   * A zero-area face (a disc quad, a shared vertex) has no interior. Once the wish is past it, the nearest point lies
   * on the face and the direction from that point toward the wish is the far side, so the radial push carries the centre
   * through. The centre segment is tested against the face's finite edges first, including the edge's ends (research 281
   * §4.3, micro 336-361), and the body is stood off on the side it came from. Research 359.
   */
  private slide(x: number, z: number, fromX: number, fromZ: number): [number, number] {
    const s = this.state;
    const probe = STANCE[this.posture_].probe;
    const prone = this.posture_ === 'prone';
    const r = prone ? probe.r * PRONE_FAN_READING.across : probe.r;
    let tx = x - fromX, tz = z - fromZ;
    const travel = Math.hypot(tx, tz);
    const ahead = prone && travel > 1e-9 ? probe.r : 0;
    if (ahead > 0) { tx /= travel; tz /= travel; }
    // PRONE-TILT-2 (3): the low line ahead rises (q d).y a unit, d the travel in the body's frame, q the root's tilt as
    // the last tick left it (FUN_0054ecd0 D:L416972-417027; PRONE_PROBE_TILT_READING). 0 level: the old path, unchanged.
    const q = this.rootTilt_.q;
    const lift = ahead > 0 && q && PRONE_PROBE_TILT_READING === 'root' && PRONE_TILT_EASE_BASIS_READING === 'root-up'
      ? rotateByQuat(q, worldToBody(s.yaw, [tx, 0, tz]))[1] : 0;
    const reach = Math.max(r, ahead);
    const heights = wallProbeHeights(this.posture_).map((h) => s.y + h);
    const nearWalls = this.nearWalls(x, z);
    let index = wallBoundsIndexes.get(nearWalls.walls);
    if (!index) { index = new OrderedBoundsIndex(nearWalls.walls); wallBoundsIndexes.set(nearWalls.walls, index); }
    const moving: Wall[] = [];
    for (const object of nearWalls.moving) for (const poly of object.polys) {
      if (!isWallSurface(poly)) continue;
      const wall = wallOf(poly, true);
      if (wall) moving.push(wall);
    }
    const candidatesAfter = (after: number): { value: Wall; order: number }[] => {
      const loX = Math.min(x, fromX) - reach, hiX = Math.max(x, fromX) + reach;
      const loZ = Math.min(z, fromZ) - reach, hiZ = Math.max(z, fromZ) + reach;
      const candidates = index!.queryAfter(loX, loZ, hiX, hiZ, after);
      for (let i = 0; i < moving.length; i++) {
        const wall = moving[i]!, order = nearWalls.walls.length + i;
        if (order > after && hiX >= wall.minX && loX <= wall.maxX && hiZ >= wall.minZ && loZ <= wall.maxZ)
          candidates.push({ value: wall, order });
      }
      return candidates;
    };
    const faces: number[] = [];                                    // the face hits' normals (x, z), every pass's
    for (let pass = 0; pass < WALL_PASSES; pass++) {
      let pushed = false;
      const ends: number[] = [];                                  // the face ends met this pass: their normals (x, z)
      let candidates = candidatesAfter(-1);
      for (let at = 0; at < candidates.length;) {
        const { value: w, order } = candidates[at++]!;
        const beforeX = x, beforeZ = z;
        if (this.slideFloorPoly_ && w.poly === this.slideFloorPoly_) continue;
        for (let line = 0; line < heights.length; line++) {
          const y = heights[line]!;
          // PRONE-TILT-2 (3): the tilted low line ahead meets a wall whatever the level cut at y holds.
          const tilted = ahead > 0 && line === 0 && lift !== 0;
          const meets = probeMeets(w, y);
          if (!meets && !tilted) continue;
          // The segment's box, not the wish alone: a wish just past a zero-thickness face is still this face's.
          const loX = Math.min(x, fromX) - reach, hiX = Math.max(x, fromX) + reach;
          const loZ = Math.min(z, fromZ) - reach, hiZ = Math.max(z, fromZ) + reach;
          if (hiX < w.minX || loX > w.maxX || hiZ < w.minZ || loZ > w.maxZ) continue;
          if (!meets) {
            const moved = this.tiltedAhead(w, x, y, z, tx, tz, lift, ahead);
            if (moved) { faces.push(...faceOfPush(x, z, moved)); x = moved[0]; z = moved[1]; pushed = true; }
            continue;
          }
          const band = wallFootprint(w, y);
          if (band.length < 4) {
            const moved = tilted ? this.tiltedAhead(w, x, y, z, tx, tz, lift, ahead) : null;
            if (moved) { faces.push(...faceOfPush(x, z, moved)); x = moved[0]; z = moved[1]; pushed = true; }
            continue;
          }
          let stood = false;
          const hit = segmentEdgeHit(band, fromX, fromZ, x, z, -FACE_EPS);
          if (hit) {
            let side = (fromX - hit.x) * w.nx + (fromZ - hit.z) * w.nz;
            const endSide = (x - hit.x) * w.nx + (z - hit.z) * w.nz;
            // A start on the face that a previous pass already stood off must not be flipped to the other side.
            const resolved = Math.abs(side) <= FACE_EPS && Math.abs(endSide) >= r - 1e-4;
            if (!resolved) {
              if (Math.abs(side) <= FACE_EPS) side = Math.abs(endSide) > FACE_EPS ? -endSide : 1;
              const ux = side >= 0 ? w.nx : -w.nx, uz = side >= 0 ? w.nz : -w.nz;
              const held = endSide * (side >= 0 ? 1 : -1);
              if (held < r - 1e-4) {
                this.wallHits_.push({ poly: w.poly, line: line as 0 | 1, x: hit.x, y, z: hit.z });
                x = hit.x + ux * r; z = hit.z + uz * r;
                const into = s.vx * ux + s.vz * uz;
                if (into < 0) { s.vx -= into * ux; s.vz -= into * uz; }
                faces.push(ux, uz);
                pushed = true;
                stood = true;
              }
            }
          }
          const near = nearest(band, x, z);
          if (!stood && (near.d < r || near.inside)) {
            this.wallHits_.push({ poly: w.poly, line: line as 0 | 1, x: near.x, y, z: near.z });   // PB-3b: the move's hit
            let ux: number, uz: number, push: number, atEnd = false;
            if (near.d > 1e-9 && !near.inside) {
              ux = (x - near.x) / near.d; uz = (z - near.z) / near.d; push = r - near.d;
              // MV-PARITY (b2), `WALL_END_CONTACT_READING`: the nearest point is the face's end. The original's hit
              // has the polygon's own normal, never a direction from a corner: the move loses its part into the face
              // along that normal and the velocity likewise (`FUN_005483d0` D:L413557-413567, the port's into-only
              // reading), after the faces' hits (the end of the pass); the body is not pushed out.
              const facing = (fromX - near.x) * w.nx + (fromZ - near.z) * w.nz;
              const fx = facing >= 0 ? w.nx : -w.nx, fz = facing >= 0 ? w.nz : -w.nz;
              if (WALL_END_CONTACT_READING === 'face-normal' && ux * fx + uz * fz < 1 - WALL_END_ALIGN) {
                // The hull's hit is one-sided -- a segment from in front of the polygon's own normal to behind it
                // (research 281 s4.3, micro 288-333) -- and the fan's segments run from the feet forward along the
                // travel (`FUN_0054aa30` D:L415549-415577, mirrored D:L415789-415817): an end met from behind its
                // face, or behind the feet across the move, is met by none of them.
                const own = polygonNormal(w.poly.points);
                const front = own !== null && (own[0] * fx + own[2] * fz) > 0;
                if (front && (near.x - fromX) * (x - fromX) + (near.z - fromZ) * (z - fromZ) > 0) ends.push(fx, fz);
                atEnd = true;
              }
            } else {
              const side = (fromX - near.x) * w.nx + (fromZ - near.z) * w.nz;
              ux = side >= 0 ? w.nx : -w.nx; uz = side >= 0 ? w.nz : -w.nz;
              let far = 0;
              for (let i = 0; i < band.length; i += 2) far = Math.max(far, (band[i]! - x) * ux + (band[i + 1]! - z) * uz);
              push = far + r;
            }
            if (!atEnd) {
              x += ux * push; z += uz * push;
              const into = s.vx * ux + s.vz * uz;
              if (into < 0) { s.vx -= into * ux; s.vz -= into * uz; }
              faces.push(ux, uz);
              pushed = true;
            }
          }
          if (tilted) {
            const moved = this.tiltedAhead(w, x, y, z, tx, tz, lift, ahead);
            if (moved) { faces.push(...faceOfPush(x, z, moved)); x = moved[0]; z = moved[1]; pushed = true; }
          } else if (ahead > 0) {
            const t = rayToFootprint(band, x, z, tx, tz, ahead);
            if (t !== null) {
              const side = (x - band[0]!) * w.nx + (z - band[1]!) * w.nz;
              const ux = side >= 0 ? w.nx : -w.nx, uz = side >= 0 ? w.nz : -w.nz;
              const facing = -(tx * ux + tz * uz);                 // the travel's part into the wall
              if (facing > 1e-6) {
                this.wallHits_.push({ poly: w.poly, line: line as 0 | 1, x: x + tx * t, y, z: z + tz * t });   // PB-3b
                const push = (ahead - t) * facing;
                x += ux * push; z += uz * push;
                const into = s.vx * ux + s.vz * uz;
                if (into < 0) { s.vx -= into * ux; s.vz -= into * uz; }
                faces.push(ux, uz);
                pushed = true;
              }
            }
          }
        }
        // A push changes the segment box. Query the remaining walls again, after this wall's ORIGINAL ordinal:
        // earlier walls wait for the next pass, exactly as in the full sequential scan. Never freeze candidates.
        if (x !== beforeX || z !== beforeZ) { candidates = candidatesAfter(order); at = 0; }
      }
      // The face ends' hits after the faces': the original takes its hits one after another in its segments' order
      // (`FUN_005483d0` D:L413533-413597 over the list D:L413406-413425), the centre's -- the face ahead -- before the
      // fan's side lines (`FUN_0054aa30` D:L415341 on, research 217 s2.1), which are what meet a face's end beside the
      // body; a filtered hit's slot takes the list's last, so the order holds only until one is (D:L413428-413457).
      // Each hit takes the move's part along its normal away (D:L413557-413567), so a face's end acts on what the
      // faces' hits left of the move: the move from where it began less its parts along the face normals hit so far, in
      // their order (the port's stand-off push is the part a face took, not a move into the end). The end takes that
      // remainder's part into it, and the velocity's (the same lines clip `+0xf44`, the port's move and `vx`/`vz`,
      // along each normal; the port takes the part into the face only, `WALL_END_CONTACT_READING`).
      if (ends.length > 0) {
        let mx = x - fromX, mz = z - fromZ;
        for (let i = 0; i < faces.length; i += 2) {
          const d = mx * faces[i]! + mz * faces[i + 1]!;
          mx -= d * faces[i]!; mz -= d * faces[i + 1]!;
        }
        for (let i = 0; i < ends.length; i += 2) {
          const fx = ends[i]!, fz = ends[i + 1]!;
          const moved = mx * fx + mz * fz;
          if (moved < 0) { mx -= moved * fx; mz -= moved * fz; x -= moved * fx; z -= moved * fz; pushed = true; }
          const into = s.vx * fx + s.vz * fz;
          if (into < 0) { s.vx -= into * fx; s.vz -= into * fz; }
        }
      }
      if (!pushed) break;
    }
    return [x, z];
  }

  /**
   * PRONE-TILT-2 (3): the tilted low line ahead (`rayToWallTilted`) against one wall, as the level line's push: a wall it
   * meets nearer than `ahead` pushes the body back along the wall's normal till the hit is `ahead` out, the velocity's
   * part into the wall taken away. The new (x, z), or null when it meets nothing (or runs along the wall).
   */
  private tiltedAhead(w: Wall, x: number, y: number, z: number, tx: number, tz: number, lift: number, ahead: number): [number, number] | null {
    const hit = rayToWallTilted(w, x, y, z, tx, tz, lift, ahead);
    if (!hit) return null;
    const side = (x - hit.x) * w.nx + (z - hit.z) * w.nz;
    const ux = side >= 0 ? w.nx : -w.nx, uz = side >= 0 ? w.nz : -w.nz;
    const facing = -(tx * ux + tz * uz);                           // the travel's part into the wall
    if (!(facing > 1e-6)) return null;
    this.wallHits_.push({ poly: w.poly, line: 0, x: hit.x, y: hit.y, z: hit.z });   // PB-3b
    const push = (ahead - hit.t) * facing;
    const s = this.state, into = s.vx * ux + s.vz * uz;
    if (into < 0) { s.vx -= into * ux; s.vz -= into * uz; }
    return [x + ux * push, z + uz * push];
  }

  /**
   * The crossing guard (PF-05's second fix round): whether the body's path from (x0, z0) to (x1, z1) crosses a wall the
   * slide reads -- its line at one of the stance's probe heights (`wallProbeHeights`, `bandFootprint`), seen from
   * above. A slide pushes the body out of each wall in turn; with less room than the radius (a gap under 3.5, a door
   * leaf swung against a wall) the last push can carry it through the other wall, so such a push is not taken.
   */
  private crosses(x0: number, z0: number, x1: number, z1: number, feet = this.state.y, frontOnly = false): boolean {
    if (x0 === x1 && z0 === z1) return false;
    const heights = wallProbeHeights(this.posture_).map((h) => feet + h);
    const bounds = [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)] as const;
    const fromWalls = this.crossingWallsNear(x0, z0, bounds);
    // One synchronous query sees one door pose. In the same cell both calls have the identical candidates, even
    // when moving owners would make wallsNear allocate a second array. Do not construct that duplicate set.
    const sameCell = cellAt(this.grid, x0, z0).index === cellAt(this.grid, x1, z1).index;
    const walls = sameCell ? fromWalls : new Set([...fromWalls, ...this.crossingWallsNear(x1, z1, bounds)]);
    for (const w of walls) {
      if (this.slideFloorPoly_ && w.poly === this.slideFloorPoly_) continue;
      if (Math.max(x0, x1) < w.minX || Math.min(x0, x1) > w.maxX || Math.max(z0, z1) < w.minZ || Math.min(z0, z1) > w.maxZ) continue;
      for (const y of heights) {
        if (!probeMeets(w, y)) continue;
        if (frontOnly && !frontOf(w, x0, y, z0)) continue;         // HOTFIX BRIDGE-WEDGE: a face crossed from behind
        const band = wallFootprint(w, y);
        const hit = segmentEdgeHit(band, x0, z0, x1, z1, -FACE_EPS);
        if (!hit) continue;
        // A start already on the face is the slide's to pull back; this guard only refuses a finish that leaves the
        // side the centre started on (onto the face, or past it), including a path through a vertex.
        const s0 = (x0 - hit.x) * w.nx + (z0 - hit.z) * w.nz;
        const s1 = (x1 - hit.x) * w.nx + (z1 - hit.z) * w.nz;
        if (s0 > FACE_EPS && s1 <= FACE_EPS) return true;
        if (s0 < -FACE_EPS && s1 >= -FACE_EPS) return true;
      }
    }
    return false;
  }

  /** Same endpoint ring, wall order and inclusive bounds as crosses' full scan, with static nearby sets indexed once. */
  private crossingWallsNear(x: number, z: number, bounds: readonly [number, number, number, number]): Wall[] {
    const near = this.nearWalls(x, z);
    let index = wallBoundsIndexes.get(near.walls);
    if (!index) { index = new OrderedBoundsIndex(near.walls); wallBoundsIndexes.set(near.walls, index); }
    const walls = index.query(...bounds);
    for (const object of near.moving) for (const poly of object.polys) {
      if (!isWallSurface(poly)) continue;
      const wall = wallOf(poly, true);
      if (wall && bounds[2] >= wall.minX && bounds[0] <= wall.maxX && bounds[3] >= wall.minZ && bounds[1] <= wall.maxZ) walls.push(wall);
    }
    return walls;
  }

  /**
   * The wall polygons of the mover's cell and its eight neighbours (`ringCells`' square ring 1), each once. DOORS: a
   * moving owner's (`CollisionOwner.sweep`, a door leaf) are read fresh every call, after the cached static ones.
   * MAP-02: only an owner the probe's model gate passes (`modelGate`, research 23 s1.1), and both caches emptied when
   * the grid's revision has moved since they were read (`./worldState`).
   */
  private nearWalls(x: number, z: number): NearWalls {
    if (this.grid.revision !== this.seenRevision) { this.invalidateWallCache(); this.seenRevision = this.grid.revision; }
    const cell = cellAt(this.grid, x, z).index;
    if (this.near?.cell !== cell) {
      const cached = this.nearByCell.get(cell);
      if (cached) {
        this.nearByCell.delete(cell); this.nearByCell.set(cell, cached);
        return this.near = cached;
      }
      const seen = new Set<WorldPoly>();
      const walls: Wall[] = [];
      const moving = new Set<CollisionObject>();
      for (const { cell: c } of ringCells(this.grid, x, z, 1, 'square')) {
        for (const w of this.wallsOf(c.index)) {
          if (seen.has(w.poly)) continue;
          seen.add(w.poly);
          walls.push(w);
        }
        for (const atom of this.grid.cells[c.index]!.atoms) if (atom.object.kind === 'collision' && atom.object.owner.sweep && modelGate(atom.object.owner)) moving.add(atom.object);
      }
      this.near = { cell, walls, moving: [...moving] };
      this.nearByCell.set(cell, this.near);
      if (this.nearByCell.size > WALL_NEAR_CACHE_SIZE) this.nearByCell.delete(this.nearByCell.keys().next().value!);
    }
    return this.near;
  }

  private wallsOf(index: number): Wall[] {
    const known = this.wallsByCell.get(index);
    if (known) return known;
    const walls: Wall[] = [];
    for (const atom of this.grid.cells[index]!.atoms) {
      if (atom.object.kind !== 'collision' || atom.object.owner.sweep) continue;     // DOORS: a moving owner, read fresh
      if (!modelGate(atom.object.owner)) continue;                                    // MAP-02: an inactive node's walls are not there
      for (const poly of atom.object.polys) {
        if (!isWallSurface(poly)) continue;
        const w = wallOf(poly);
        if (w) walls.push(w);
      }
    }
    this.wallsByCell.set(index, walls);
    return walls;
  }
}

/**
 * The root keys of the clips the mover plays as actions (`./walk` `ACTION_CLIPS`: the hits, the death landing, the
 * get-up, the transitions) and holds (`HOLD_CLIPS`: the claymore's placing, the reloads), x and z a key in the model's
 * frame: what the mover's per-key root motion reads (`Walker.actionVelocity`, `FUN_0028c250`).
 */
export function actionRoots(clips: readonly MotionClip[]): Map<string, Float32Array> {
  const wanted = new Set<string>([...Object.keys(ACTION_CLIPS).map((k) => SEAL_ANIMS[k as keyof typeof ACTION_CLIPS]), ...HOLD_CODES]);
  const out = new Map<string, Float32Array>();
  for (const c of clips) {
    if (!wanted.has(c.name)) continue;
    const root = c.parts.find((p) => p.name === 'skel_root');
    if (!root || root.translations.length < 3 * c.frameCount) continue;
    const keys = new Float32Array(2 * c.frameCount);
    for (let i = 0; i < c.frameCount; i++) { keys[2 * i] = root.translations[3 * i]!; keys[2 * i + 1] = root.translations[3 * i + 2]!; }
    out.set(c.name, keys);
  }
  return out;
}

/**
 * The mover as the body and its clips read it (`PlaySnapshot`): what `WalkMode.snapshot` hands the page's animator and
 * what the multiplayer server sends of every other player (web sprint 3, `./net/body`) -- one function for both.
 */
export function moverSnapshot(w: Walker, moves: TraversalHooks | null, jumps: number, turnRate: number): PlaySnapshot {
  const s = w.state;
  return {
    feet: w.tickFeet(), rootTilt: w.rootTilt.q, yaw: wrapYaw(s.yaw), pitch: s.pitch, vx: s.vx, vz: s.vz, vy: s.vy,
    airborne: w.airborne, crouched: w.posture === 'crouch', stance: w.posture,
    ...(w.stance !== w.posture ? { stanceState: w.stance } : {}),   // OBF-23: the crouch-run's state 1
    landing: w.landing?.kind ?? null, jumps,
    ground: { ...w.ground }, stickSnaps: w.stickSnaps, action: w.action && { ...w.action }, turnRate,
    traversal: moves?.pose() ?? null, peek: moves?.peeking() ?? 0, ...(moves?.leanClipOn?.() ? { leanClip: true as const } : {}),
    overlay: w.overlay && { ...w.overlay },
    ...(w.holding ? { hold: w.holding.clip, holdSerial: w.holdStarts } : {}),
    ...(!w.airborne && !w.cutAsked ? { landedBare: true as const } : {}),
    cutStick: { ...w.cutStick },
  };
}
