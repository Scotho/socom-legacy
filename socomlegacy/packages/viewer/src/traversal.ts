import {
  findLadders, ladderFrame, probeFloor, probeGround, probeWater, segmentHits, selectFloor, surfaceWord, APP_LADDER, GAME_FRAME_DT, GameFrameAccumulator, SEAL_TUNING, SURFACE_SIDE, SURFACE_SKIP,
  type Grid, type Ladder, type MotionClip, type WorldPoly,
} from '@s2u/scene';
import type { TraversalPose } from './animator';
import { BLEND_TIME_DEFAULT, blendWeight, entryOf, loopScale, oneShotSeconds, rootTravel, SEAL_ANIMS } from './locomotion';
import { blendShapes, ClipPath, clipShape, reverseShape, rootAt, shapeTravel, STEER_RATE, straightShape, truncateShape, type ClipShape, type PathPoint } from './clipPath';
import {
  CLIMB_TOP_FLOOR_READING, CLIMBABLE, contactFromHits, contactHolds, contactOf, cornerDrop, obstacleRay, planClimb, topFloor, type ClimbClass, type ClimbContact, type ClimbPlan, type WalkHit,
} from './climb';

export { CLIMB_TOP_FLOOR_READING } from './climb';
import type { MotionEntry, MotionTable } from './motionTable';
import { mountPlayedOut, mountRootVelocity, OneShotSteer } from './net/emplacement';
import { CROUCH_HEIGHT, PRONE_HEIGHT, STANDING_HEIGHT } from './stature';
import { shortTurn } from './yaw';
import {
  BODY_RADIUS, holdFamily, RELOAD_PUSH_LAG, rootY as stanceRootY, probeLiftOf, STICK_SNAP_BLEND, TICK,
  WALL_BODY_READING,
  type HoldPass, type PopOutcome, type Stance, type TraversalHooks, type TraversalKept, type Walker, type WalkInput,
} from './mover';

/**
 * The traversal moves the walk lacks (web research 86): the ladder (mount at the foot or the head, climb, climb off
 * at the head or the foot, the slide down), with the climb onto obstacles and the lean in `./climb` and `./lean`.
 * `Traversal` is the `Walker`'s tick driver (`Walker.driver`): while a move runs it owns the mover, and it hands the
 * animator the move's clip (`TraversalPose`) and the camera the root it stands on. Every number is the game's, cited to
 * research 86; placeholders are named as such.
 *
 * **The ladder, as the decompilation runs it** (research 86 section 2):
 *
 * ```
 * the list      FUN_002a9260 (decomp ~150340): a node whose di polygons include one with m_appflags == 2
 *               ((byte)poly[+0xA] & 0x7f) >> 4 == 2) is a ladder; a tall face quad and a short (<= 15) quad over it
 * the contact   FUN_005b4b40 (469562) each tick on the wall contact at seal+0x1090, the polygon walked into:
 *               in front, dot(normalize(seal - contact).xz, n) >= 0.3; facing it, dot(back axis, n) >= 0.02
 *               (the short quad: |dot| -- either facing); dropped past 24 across the ground, or feet more than
 *               10 under the short quad's bottom (FUN_005b3890, 469000). It OFFERS CLIMB (FUN_00593500 ->
 *               FUN_0059da60 -> FUN_005b3ce0(a, 2), D:L452294-452301); the mount runs only on the action button's
 *               release with CLIMB selected (FUN_00592d50 sets +0x170 0x4, D:L452181-452183; FUN_00550ef0 calls
 *               FUN_005b4b40 only under it, D:L418120-418155) -- LC-1. Was (research 86 s2.3, a misreading that
 *               missed the gate around the call): "No button: walking into it mounts".
 * the mount     the tall quad: FUN_005b1c80 (468183) -> FUN_0057f880: aligned on the quad's horizontal edge's midpoint
 *               facing -normal, "Stand -> Ladder" (seal_stand2ladder, 0.9 s), the root to feet + 15.6 (0x4179999a)
 *               the short quad: FUN_0057f690: "Climb off ladder" backwards (a "180" first when facing away)
 * climbing      state 5, FUN_00584240 (443742): the clip's rate = stick x 0.135 (max_velocity 1.35 x 10 / 100,
 *               FUN_00287620), backwards for a stick back; the rise is the root's (UseVelY, VerticalMotion);
 *               no turning (NoTurn; FUN_0054f7e0), the lateral stick zeroed (FUN_00550ef0)
 * the head      at each cycle's end with the stick up (>= 0.03): a ray 11 along the facing from the root raised by
 *               the climb-off's rise less 1 (FUN_005b0eb0); no ladder polygon hit -> "Climb off ladder" forward,
 *               the SEAL set on the top at its end (FUN_00588bc0, 446544)
 * the foot      stick back and the feet under the ground + 1.0: "Stand -> Ladder" backwards (FUN_00584240); "the
 *               ground" is the actor's cached floor RECORD (`+0x400..+0x41c`, its y `+0x404`, copied to `+0x2e4` each
 *               climb frame), the last floor the probe answered, kept when it answers nothing (B-50, `ladderFloorAt`)
 * the slide     the action button's "LADDER SLIDE" (0x3e4de8; FUN_00592d50 -> FUN_0057f530 -> FUN_0057f3e0):
 *               "Ladder -> slide" then "Ladderslide", falling at gravity x 0.8 (FUN_0059b440, 456492), the root at
 *               11.44 (FUN_0059b870); on the ground "Ladderslide land" (FUN_0057f310)
 * ```
 *
 * The rate is the walk's foot-locked loop (`FUN_0028d570`: the node speed x K, `FUN_0028aa20`): the climb carries
 * `VerticalMotion`, so its stride is the root's y, 10 units a cycle, and K = 0.1778 x 100 / 10 = 1.7778 (RAM 1.7778 at
 * 0xa37fb0). `0.135 x 1.7778 x 16 keys / (0.533 s / 3)` = 21.6 keys a second at a full stick, 0.625 units of rise a
 * key: **13.5 units a second** up or down, `max_velocity` 1.35 x 10 as on the ground (research 206 section 2.4, V6: a
 * reading, pending review -- the rate an exact source read, the rise one interpretive step further; the PINE read of
 * `actor+0x20` on a climb is owed). The port's earlier 7.59 left K out. A rung is 5 units: `motion.rdr` calls
 * `ladder_rung` at 0.01 and 0.5 of the 10-unit cycle.
 */

// ---- the clips --------------------------------------------------------------------------------------------------

/** The clips the moves play, by what they are for (`motion.rdr`'s names; research 86 section 1). */
export const TRAVERSAL_CLIP = {
  toLadder: 'seal_stand2ladder', ladder: 'seal_climbladder', offLadder: 'seal_climboffladder',
  toSlide: 'seal_ladder2slide', slide: 'seal_ladderslide', slideLand: 'seal_ladderslide_land',
  stepUp: 'seal_step_up', climbLow: 'seal_climbcrate', climbMed: 'seal_climb_medium', toHang: 'seal_stand2hang',
  hang: 'seal_hang', hangUp: 'seal_hang2climbup', hangDown: 'seal_hang_jumpdown', over: 'seal_climb_over',
  turn180: 'seal_180', dive: 'seal_dive2prone',
  stand2llean: 'seal_stand2llean', stand2rlean: 'seal_stand2rlean', crouch2llean: 'seal_crouch2llean',
  crouch2rlean: 'seal_crouch2rlean', prone2llean: 'seal_prone2llean', prone2rlean: 'seal_prone2rlean',
  lleanStep: 'seal_llean_rstep', rleanStep: 'seal_rlean_rstep',
} as const;

/**
 * NOFIRE_STATE_READING (PF-17; research 194 A02, 218 s1, s5): the moves whose actor state the fire's gate refuses
 * whatever their clip. `FUN_005a7de0` takes only states 0, 1, 2, 3 and 6 (`actor+0x174`, D:L462612); the ladder is state
 * 5 (`FUN_00584240`, the header above) and the hang 4 (research 86). Read as: every ladder move (the mount, the climb,
 * the climb off, the slide and its landing, the "180" at the ladder) and every hang move (the hang, the climb up, the
 * jump down and its fall). Every one of their clips but `seal_180` carries a bare `NoFire` in `motion.rdr` anyway
 * (194 A02's table); the state is what refuses the "180" and a mover with no table. The climbs onto obstacles and the
 * dive are left to their clips (each bare); the peek (state 3) fires. Owed: a read of the state each move writes
 * (`actor+0x174`) through `FUN_0057f880`, `FUN_00581dc0` and the climb's pushes, or a capture.
 */
export const NOFIRE_STATE_READING: readonly TraversalKind[] = Object.freeze([
  'ladderMount', 'ladderMountTop', 'ladder', 'ladderOffTop', 'ladderOffBottom', 'ladderSlide', 'ladderSlideLand', 'turn180',
  'hang', 'hangUp', 'hangDown', 'hangDropFall',
] as TraversalKind[]);

/** Every traversal clip, for the worker's clip request (`main.ts` asks for them beside `PLAY_CLIPS`). */
export const TRAVERSAL_CLIPS: readonly string[] = Object.values(TRAVERSAL_CLIP);

/**
 * PLACEHOLDER shapes, for a mover with no clips on hand (the tests without the disc, a page before the pack arrives):
 * each clip's seconds (`motion.rdr` `playback`), root at key 0, rise and travel ahead, read off `MOTION_P.ZAR` and
 * `motion.rdr` on 2026-09-28 (research 86 section 1.2) and replaced by the clips themselves when they come.
 */
const FALLBACK: Record<string, [seconds: number, rootY: number, rise: number, ahead: number, keys: number]> = {
  [TRAVERSAL_CLIP.toLadder]: [0.9, 11.78, 3.52, 6.73, 27],
  [TRAVERSAL_CLIP.ladder]: [16 / 30 / 3, 15.58, 9.375, 0, 16],
  [TRAVERSAL_CLIP.offLadder]: [1.4, 17.02, 18.91, 8.38, 37],
  [TRAVERSAL_CLIP.toSlide]: [0.5, 20.39, -2.99, -2.14, 13],
  [TRAVERSAL_CLIP.slide]: [0.2, 18.26, 0, 0, 7],
  [TRAVERSAL_CLIP.slideLand]: [1.3, 11.44, 0.4, -4.7, 37],
  [TRAVERSAL_CLIP.stepUp]: [0.75, 11.5, 8.17, 10.46, 13],
  [TRAVERSAL_CLIP.climbLow]: [1.25, 11.52, 12.88, 11.34, 30],
  [TRAVERSAL_CLIP.toHang]: [1.4, 11.52, 6.81, 3.49, 25],
  [TRAVERSAL_CLIP.hang]: [2.2, 18.14, 0, 0, 2],
  [TRAVERSAL_CLIP.hangDown]: [1.5, 18.82, -7.42, -5.0, 45],
  [TRAVERSAL_CLIP.turn180]: [0.95, 11.5, 0, -5.68, 28],
  [TRAVERSAL_CLIP.dive]: [1.6, 9.76, -7.66, 27.9, 16],
  [TRAVERSAL_CLIP.climbMed]: [1.5, 11.52, 21.48, 11.44, 32],
  [TRAVERSAL_CLIP.hangUp]: [2.8, 18.14, 22.56, 5.1, 63],
  [TRAVERSAL_CLIP.over]: [1, 10.96, -0.96, 16.28, 19],
};

/** The shapes the moves read: the clips' own when given (`setClips`), else `FALLBACK`'s. */
export class TraversalShapes {
  private readonly shapes = new Map<string, ClipShape>();
  private table: MotionTable | null = null;

  set(clips: Iterable<MotionClip>, table: MotionTable | null): void {
    this.table = table;
    for (const c of clips) if (TRAVERSAL_CLIPS.includes(c.name)) this.shapes.set(c.name, clipShape(c, table?.get(c.name) as MotionEntry | undefined));
  }

  /**
   * The climb's loop as the loader holds it and `FUN_00584240` plays it: T the shape's seconds, D its root's stride
   * (`rootTravel`, the y with `VerticalMotion`), K `loopScale` -- the walk's own K path (`./locomotion` `motionOf`) --
   * and the full stick's keys a second, `LADDER_RATE x K x keys / T` (`FUN_0028d570`, `FUN_0028c4f0`; research 206 s2.4).
   */
  ladderClimb(): { scale: number; keysPerSecond: number; perKey: number; rise: number } {
    const shape = this.get(TRAVERSAL_CLIP.ladder);
    const entry = entryOf(TRAVERSAL_CLIP.ladder, this.table);
    const locomotion = (entry?.maxVelocity ?? -1) >= 0;
    const vertical = entry?.verticalMotion ?? false;
    const scale = loopScale(true, locomotion, shape.seconds, rootTravel(shape.root, shape.keys, true, vertical));
    const rise = shapeTravel(shape).rise;
    return { scale, keysPerSecond: (LADDER_RATE * scale * shape.keys) / shape.seconds, perKey: rise / (shape.keys - 1), rise };
  }

  get(name: string): ClipShape {
    const own = this.shapes.get(name);
    if (own) return own;
    const f = FALLBACK[name];
    if (!f) return straightShape(name, 0.5, 11.484, 0, 0, 2);
    const looped = name === TRAVERSAL_CLIP.ladder || name === TRAVERSAL_CLIP.slide || name === TRAVERSAL_CLIP.hang;
    return straightShape(name, looped ? f[0] : oneShotSeconds(f[0], f[4]), f[1], f[2], f[3], f[4]);
  }

  /**
   * The cross-fade into the clip as the animator plays it (`./locomotion` `motionOf`): `motion.rdr`'s `BlendTime`, else
   * `FUN_00287620`'s 0.4.
   */
  blendTime(name: string): number {
    return entryOf(name, this.table)?.blendTime ?? BLEND_TIME_DEFAULT;
  }

  /** Whether the clip's own shape is in hand. */
  has(name: string): boolean {
    return this.shapes.has(name);
  }
}

// ---- the numbers ------------------------------------------------------------------------------------------------

/** `FUN_005b1c80`: the root's height over the feet as a SEAL takes the ladder (`0x4179999a`), the cycle's key-0 root. */
export const LADDER_ROOT = 15.6;
/** `FUN_00287620`'s rate for the climb: `max_velocity` 1.35 x 10 / 100. */
export const LADDER_RATE = 0.135;
/** The rung callbacks' place in the cycle (`motion.rdr`'s `zanim_callback ladder_rung` at 0.01 and 0.5). */
const RUNG_AT = [0.01, 0.5] as const;
/** `FUN_005b0eb0`: the head ray's reach along the facing. */
const HEAD_RAY = 11;
/** `FUN_00584240`: the foot is reached with the feet under the ground + 1.0. */
const FOOT_CLEAR = 1;
/** `FUN_00586f00`'s / `DAT_003f3428`'s dead zone. */
const DEAD = 0.03;
/** `FUN_005b3890`: the contact is dropped with the feet this far under a short quad (the 24 across: `climb.ts` `CONTACT_KEEP`). */
const SHORT_REACH = 10;
/**
 * LADDER_DROP_FLAG_READING (LDR-1, research 86 s2.5): `FUN_005b3890` also drops a ladder contact when bit 1 of
 * `seal+0x1061` is set (`<< 0x3e`, D:L469004-469005); what sets that bit is unread, and the port takes it as never set.
 */
export const LADDER_DROP_FLAG_READING = 'never set' as const;
/** `FUN_0054aa30`: a body is still with each velocity component under 0.0005 (D:L415135-415149; research 217 s2.1). */
const STILL_V = 0.0005;
/** `FUN_0054aa30`: the still centre segment's reach, 1.1 x 1.4 body radii -- 5.39 at r 3.5 (research 217 s2.1). */
const STILL_AHEAD = 1.1 * 1.4;
/**
 * LADDER_STILL_CAST_ACTORS_READING (LDR-1's review, research 86 s2.5): `ladderHits`' still cast runs for every actor
 * (room bots and remotes included); the original casts a still body's segments for the local player only (the
 * controller vtable +0x30, bit 0 of +0x268 under the 0x44d4d0 flag, D:L415036-415055).
 */
export const LADDER_STILL_CAST_ACTORS_READING = 'every actor' as const;
/**
 * LADDER_MATCH_READING (LDR-1's review, research 86 s2.5): the port's match of a contact to its ladder record
 * (`ladderOf`): within 1 of the ladder's plane and its half-width + 1 across. No source: the original reads the
 * contact's own polygon and keeps no ladder list; 1 is `findLadders`' own merge tolerance (`SAME`, `@s2u/scene` ladder.ts).
 */
export const LADDER_MATCH_READING = 1;
/**
 * LADDER_OCCUPANCY_READING (LC-1, research 86 s2.6; reading, pending review): `FUN_005b3ce0(a, 2)` offers no ladder
 * another SEAL is on (its record's `+0x1c < 1`, D:L469167-469173) or one whose reservation is pending (`+0x1062`,
 * D:L469166); online the mount is asked of the host (ClimbAsk / ClimbOK, `FUN_002b9f60` D:L468438-468481; research 193
 * rows 14-15). The port keeps no per-ladder occupant and its wire no ladder claim: two SEALs may take one ladder.
 * `'not modelled'` until LC-3 (a wire field, the main controller's to approve). Settled by a two-console capture: one
 * SEAL on the ladder, whether CLIMB shows for the second at its foot.
 * TRIPWIRE: LC-3 reopens R4P-R1 (AS-01, research 86 s2.6) -- a mount that waits on the room needs r0004's +0x1334 word.
 */
export const LADDER_OCCUPANCY_READING = 'not modelled' as const;
/**
 * LADDER_OFFER_CONTROLLER_READING (LC-1's review F3; research 86 s2.6; reading, pending review): for one controller
 * kind (its vtable +0x30 answering true) `FUN_005b3ce0` also asks the +0x38 object's +0x3f4 == 7 and (+0x448 & 7) != 0
 * (D:L469174-469189), and `FUN_0057f2a0`'s mount path reads that controller's +0x172 bit 0x2, not +0x170 0x4
 * (D:L441303-441308). Which controllers those are is unread; the port asks neither. Settled by reading the vtables.
 */
export const LADDER_OFFER_CONTROLLER_READING = 'not modelled' as const;
/**
 * LADDER_OFFER_MOTION_READING (LC-1's review F3; research 86 s2.6; reading, pending review): `FUN_005b3ce0` refuses the
 * offer while any of six motions plays (`FUN_00577e40` on 0x2a, 0x21, 0x2c and the three `DAT_003dec80/90/a0` ids,
 * D:L469197-469210) -- beyond the common gates `climbOffered` asks. The ids' names are unread; the port asks none of
 * them. Settled by naming the six (the motion table) and a capture of CLIMB during each.
 */
export const LADDER_OFFER_MOTION_READING = 'not modelled' as const;
/**
 * LADDER_AIRBORNE_OFFER_READING (LC-1's review F3; research 86 s2.6; reading, pending review): the port offers a ladder
 * on the ground only (`step`, `w.airborne`), as its touch mount did; `FUN_00593500` offers CLIMB in a jump or landing
 * too (D:L452279-452290) and `FUN_00550ef0` has a mount path under the motion flag 0x40. Settled by a capture: a jump
 * into a ladder's rungs, Cross in the air.
 */
export const LADDER_AIRBORNE_OFFER_READING = 'ground only' as const;
/** `FUN_005b4b40`: in front (`>= 0.3`) and facing (`>= 0.02`). */
const IN_FRONT = 0.3, FACING = 0.02;
/** `FUN_002a9260`'s split: a ladder quad at most this tall is the short one at the head. */
const SHORT_QUAD = 15;
/** `motion.rdr`'s `refPt` of the climb off, the slide and its landing: the rungs are 5.565 ahead of the root. */
export const LADDER_STANDOFF = 5.565;
/** `FUN_00596d60`: the peek's side ray, 9.5 right (`0x41180000`) and 7.8375 left (`0x40facccd`), at most 8 up. */
const PEEK_RIGHT = 9.5, PEEK_LEFT = 7.8375, PEEK_RAY_TOP = 8;

/**
 * READING (named; research 86 s7.2): the peek takes the stack's top. `FUN_005b4340(seal, 1)` (decomp 469337-469346)
 * lets the peek start over an action once `FUN_00587c20` says it would give way (past its `NoInterrupt`), and
 * `FUN_0057d810` (440451-440530) then pushes the lean clip; whether the action under it is popped or left beneath is
 * not read. The viewer's mover has one action slot, so the action ends (`Walker.yieldAction`) as the stick's cut ends
 * it -- a get-up standing the SEAL -- and the lean plays alone.
 */
export const PEEK_CUTS_ACTION_READING = true;

/**
 * READING (named; research 86 s7.2; PF-20's review, research 217 s3.2): a peek already held goes on through the kit's
 * one-shot -- the lean's toss and a reload, still or not, each played over the held lean. `FUN_005b4340(seal, 1)` skips
 * `FUN_00587c20` for a SEAL in state 3 (decomp 469345-469346), and the toss is thrown from the peek (`GetThrowAnim`
 * D:L441773-441796, research 86 section 4.4). A reload mid-peek is accepted (`FUN_005b4340`'s code-3 path
 * D:L469305-469520 has no posture-3 refusal, research 201 s10) and pops nothing: `FUN_005a82e0` D:L462925-462928 pops to
 * the base only `if (bVar3 && cVar1 == cVar7)`, `cVar1` the SEAL's `+0x174` (3 while peeking) and `cVar7` `FUN_0057dc20`
 * (D:L440540), the first posture down the stack that is not 3 -- never equal mid-peek -- and the reload is pushed over
 * the lean in posture 3 (`FUN_00588bc0(actor, clip, cVar1, 0, 0)`), state 3 kept (research 180 s1.13 had it backwards;
 * retracted). Not read: whether `FUN_00588bc0`'s mapped-type pops (D:L446070-446240) catch a reload's type.
 */
export const PEEK_HOLD_CONTINUES_READING = true;

/**
 * READING (named; research 180 s1.12, PF-20, research 217 s3, ruling PF.R39): a stance press while peeking ends the
 * peek, plays no transition and leaves the stance as it was. The prone press (`FUN_00581660` D:L442436-442477), the
 * crouch press (D:L442540-442575 -> `FUN_005817d0` D:L442479-442524) and the stand press (-> `FUN_00581c10`
 * D:L442605-442648) each pop the stack to depth 1, set the peek byte `+0x375 = 2` and call the transition with the state
 * taken before the pop -- 3; their cases (4/0/1, 4/0/2, 7/4/2/1) have none for 3, so no clip plays and the SEAL stays in
 * the stance under the peek (the pop writes `+0x174` from the base entry, `FUN_0028da00` 135104). The press is the
 * peek's (`Traversal.stanceButton`): the mover's `changeStance` is never asked. Owed: a capture of a prone press while
 * holding the d-pad peek (PINE: `actor+0x174`, `+0x375` and `actor+0x534` per frame).
 */
export const PEEK_STANCE_ENDS_PEEK_READING = true;

/**
 * READING (named; PF-20, research 217 s3, ruling PF.R39): the peek a stance press popped comes back the tick after the
 * press while the d-pad is held, its lean clip resumed at the key it was held on (`'held'`), so nothing visibly
 * flickers: the press's own tick draws the lean at that key, holds the mover as the peek does (the stick zeroed: the
 * original pops and re-pushes within its frames, no locomotion between) and the camera's eased peek keeps its side
 * (no reset); the re-push is the same peek's, so it asks no start-from-still test (`FUN_0057d810` has none).
 * Read: the update reads the d-pad after the stance (`FUN_00594cf0` D:L453431-453458: `+0x375` back to 1 / 0xff), and
 * `FUN_005b4340` takes the peek again the next frame (research 180 s1.12). Not read: whether `FUN_0057d810`'s re-push
 * replays the lean's rise (key 0) -- the original's flicker; owed the capture of research 180 s1.12.
 */
export const PEEK_REPUSH_KEY_READING = 'held' as const;

/**
 * R4P-108 (R4-MOV-PEEKWATER, L107; reading, reviewed): a crouched body in water deeper than this refuses the peek, and
 * a held one ends -- read at r0004's bytes (seat-kill's fresh review): the side ray 0x59c800 tests the action gate first
 * (0x5ba680), then `+0x174 == 1` (crouched ONLY, 0x59c840-0x59c848), in water (`+0x105e` bit 7), the depth `+0xf88`
 * against the immediate 0x40900000 = 4.5f, `c.ole.s` refusing iff depth > 4.5 (STRICT: 4.5 itself taken;
 * 0x59c840-0x59c88c), every frame from the controller's tick 0x59a6e0 (r0001 twin `FUN_00594cf0`). r0001 has no water
 * test (an r0004 addition). Standing, the water branch is not read: a standing peek in water of any depth is taken; prone
 * cannot be that deep. Q108-PC2 (r0004 running, unscored) agrees: 4.406 taken, 4.606 refused -- a reading, a capture
 * (Q108-PC2) agreeing (a ruling cannot make a value proven); captures at 4.45 / 4.5 / 4.55 and standing past 4.5 are owed.
 */
export const PEEK_WATER_DEPTH_READING = 4.5;


/** The movement's surfaces (`DAT_0044d758 == 0`): bit 1 set, bit 18 clear -- the walls the peek's ray meets. */
const isMoveSurface = (p: WorldPoly): boolean => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE;
/** `dynamics.rdr`'s `water_factor_slope` 0.05 and `min_water_factor` 0.75 (`FUN_005b56c0`; the ELF's static 0.066 / 0.6 are overwritten). */
const WATER_SLOPE = 0.05, WATER_FLOOR = 0.75;
/**
 * `FUN_00581660` / `FUN_00581990` / `FUN_00583500`: prone to 2 deep, crouched to 8.5, the crawl moving to 1.5 --
 * research 181 s8, D:L442524-442560 (the crouch entry's `+0xf88 <= 8.5`, the rocket launcher's take-up's same test:
 * `../equipment` `LAUNCHER_BODY_READING`), D:L442436-442470 (the prone entry's `<= 2.0`, else the crouch entry: its
 * caller `FUN_00552d60` D:L418877-418900 dispatches the requested stance, 2 to it, 1 to the crouch's); research 86
 * s5.2, research 236 s3 (`WATER_STANCE_READING`, note only).
 */
const WATER_PRONE = 2, WATER_CROUCH = 8.5, WATER_CRAWL = 1.5;
/** `FUN_0052eb60`'s tolerance at 0x3f3428 (0.03): the lateral axis past it sends the prone state to the crawl handler. */
const CRAWL_LATERAL = 0.03;

/** The ground states' memory in `+0x105e`: 0x08 the last ground frame crawled or moved, 0x10 it turned (LATER 434). */
export type GroundMemory = 0 | 0x08 | 0x10;
/** `FUN_0052eb60`'s tolerance at 0x3f3420 (0.025): the prone state's turn branch against its idle (D:L443907). */
const PRONE_TURN = 0.025;

/**
 * STANCE_MEMORY_RETURNS_READING (LATER 434b's third re-look): the port writes the ground states' memory on every ground
 * frame; the original's crouch and stand states return early on a refused clip push before their writes (D:L444157,
 * D:L444186, D:L444218, D:L444883, D:L444910, D:L444935; the stand state's turn, `FUN_00586050`, when `+0x105d` bit 2 is
 * clear, after its clip-0x10 push, D:L444681-444683; the crouch's clip-0x12 fallback, D:L444282-444311, `STANCE_WORD_CROUCH_FALLBACK_READING`'s
 * path), and the crouch's idle under `+0x21c` bit 2 pushes clip 0x11 instead of clearing it (D:L444316-444317).
 * Settled by the clip pushes' port (which of them a player's frame refuses).
 */
export const STANCE_MEMORY_RETURNS_READING = "not ported: the clip-push returns leave the memory unwritten that frame, and the crouch's idle under +0x21c bit 2 pushes a clip without clearing it" as const;

/**
 * `FUN_002998f0` (decomp 141962-141976): one step of the camera's peek value toward its target at `cam_peek_decay_rate`
 * (`DAT_0044c3bc`, 6 a second): `peek = target + (peek - target) x exp(-6 dt)`, snapped to the target within 1e-4. The
 * traversal's own ease (`Traversal.easePeek`) and the player's view's rig (`./povCamera`, PV-5b: the watched body's
 * held side, one step a command) both take it.
 */
export function easePeek(value: number, target: number, dt: number): number {
  const next = target + (value - target) * Math.exp(-SEAL_TUNING.peekDecayRate * dt);
  return Math.abs(next - target) < 1e-4 ? target : next;
}

/**
 * The stand state's moving frame (`FUN_00586570` D:L444861-444948): the lateral or forward axis past 0.03 (0x3f3428),
 * the forward part under 0x10 the band (D:L444898-444901). The crouch state asks `FUN_00586f00` (`crawlFrame`) as prone.
 */
export function standFrame(right: number, forward: number, turn: number, memory: GroundMemory): boolean {
  if (Math.abs(right) > CRAWL_LATERAL) return true;
  if (memory !== 0x10) return Math.abs(forward) > CRAWL_LATERAL;
  const t2 = turn * turn;
  return forward >= CRAWL_LATERAL + t2 * (0.3 - CRAWL_LATERAL) || forward <= -(CRAWL_LATERAL * 1.5 + t2 * (0.5 - CRAWL_LATERAL * 1.5));
}

/**
 * LATER 434 (434b's re-looks): `FUN_00586f00` (D:L445046-445089) answering 0 -- the prone state's frames that run the crawl
 * handler `FUN_00583500` -- by the ground states' memory (`memory`, `+0x105e`): the lateral axis (`+0x244`) past 0.03,
 * 0 always (D:L445057-445059); else under 0x10 the band -- forward at least 0.03 + turn^2 x 0.27, or at most -(0.045 +
 * turn^2 x 0.455) (the turn axis `+0x23c`); under 0x08 any |forward| past 0.03; under neither, a stick within 0.03 of
 * centre (its magnitude over forward and turn) answers 1, else the band. The port's axes are the cut stick
 * (`Walker.cutStick`, the original's as copied from the pad, D:L418613-418615, the scope's 0.2 already in it) and the
 * turn over `turn_maxrate`.
 */
export function crawlFrame(right: number, forward: number, turn: number, memory: GroundMemory): boolean {
  if (Math.abs(right) > CRAWL_LATERAL) return true;
  const t2 = turn * turn;
  const band = forward >= CRAWL_LATERAL + t2 * (0.3 - CRAWL_LATERAL) || forward <= -(CRAWL_LATERAL * 1.5 + t2 * (0.5 - CRAWL_LATERAL * 1.5));
  if (memory === 0x10) return band;
  if (memory === 0x08) return Math.abs(forward) > CRAWL_LATERAL;
  if (Math.hypot(turn, forward) <= CRAWL_LATERAL) return false;
  return band;
}
/** `FUN_00582540`: the slide from the head is taken in the reversed climb-off's last 0.2 of its phase. */
const TOP_SLIDE_WINDOW = 0.2;
/** `FUN_0059afd0`: the jump down's height is the clip root's for its first 0.2, the fall's after. */
const HANG_PUSH = 0.2;
/**
 * The body's box top over the feet, by posture (`./stature`'s heights): the ripple's big / small split. Prone the size
 * class's 6.0 (`PRONE_HEIGHT`, D:L415119-415122; PF-21).
 */
export const BODY_TOP: Readonly<Record<Stance, number>> = { stand: STANDING_HEIGHT, crouch: CROUCH_HEIGHT, prone: PRONE_HEIGHT };
/** `FUN_00584b00`: the dive wants the body moving at 30 a second (speed^2 900) or more, and water no deeper than 2. */
const DIVE_SPEED2 = 900, DIVE_WATER = 2;
/**
 * `FUN_0057e540`: the dive holds 0.2 s (`+0x1360` = 0x3e4ccccd, D:L440906); `FUN_0059b870` lowers its hidden timer
 * (`+0xfac`, seeded from the stance's root, D:L440911) by `+0x133c` x dt and clamps it at the prone's 2.2, the bleed's
 * signal (bit 0x20 of `+0x105e` cleared, D:L456590-456603). The timer is not the drawn root: nothing in the dive writes
 * the root node (`FUN_0059afd0` D:L456346-456352, `FUN_0057a330` D:L439149), so `seal_dive2prone` draws its own (DIVE-ROOT).
 */
const DIVE_HOLD = 0.2, DIVE_ROOT = 2.2;
/**
 * DIVE_ROOT_FALL_READING (DIVE-ROOT, B201; research 86 section 6.1; reading, pending review): the timer's speed
 * `+0x133c` grows by dt x 98.100006 a game frame once the dive has landed -- a literal in `FUN_0059b440`'s dive branch
 * (D:L456552-456557: `+0x133c` = the frame's start value + `+0x2e0` x 98.100006, the table's 235 that D:L456496 added
 * thrown away), not the table's gravity. *Was:* the table's 235 (`SEAL_TUNING.gravity`) from rest, the superseded
 * reading of research 86 section 6.1. Same in r0004 (`FUN_0059b440`'s twin at 0x5a0f60: the fields moved 4, the
 * literal and the order kept).
 */
export const DIVE_ROOT_FALL_READING = 98.100006;
/**
 * DIVE_ROOT_SEED_READING (DIVE-ROOT, B201; research 86 section 6.1; reading, pending review): the timer's speed at the
 * hold's end -- one airborne frame of the table's gravity. `FUN_005af930` resets `+0x133c` to `+0x1364` (0 from the
 * dive's start, D:L440907) on the frame the hold runs out (D:L466797-466802), and `FUN_0059b440` then adds 235 x dt
 * before its dive branch (D:L456496); the dive is still airborne (`+0x1061` bit 0x2, D:L440909), so the ground's
 * D:L456554-456557 waits for `FUN_0059ad30`'s landing (D:L456314-456322). Taken at `GAME_FRAME_DT` (the original's
 * frame); the page then integrates the ground's 98.1 continuously (R8). What would settle it beyond a frame: the order
 * of `FUN_005af930` (D:L466809), `FUN_005b0420`'s landing (D:L467105) and `FUN_0057a330`'s timer (D:L439149) inside
 * one frame, and whether the hold runs 6 or 7 frames (0.2 against 525/15734 in single precision).
 */
export const DIVE_ROOT_SEED_READING = SEAL_TUNING.gravity * GAME_FRAME_DT;
/**
 * DIVE_END_BLEND_READING (DIVE-ROOT, B201; a placeholder, research 86 section 6.1): the hand-off from the dive's play to
 * the prone base at rest. The original pops the play there (`FUN_00589aa0`, D:L418158-418163) and the prone base's play
 * comes back; the blend that follows is unread. The port leaves it to the animator's own end of a traversal play (the
 * next play's cross-fade from the pose on screen, `seal_prone`'s `BlendTime`, none in `motion.rdr`: 0.4), and the
 * seam -- `Traversal.rootY`, the hit volume, the shot's eye, the bots' aim -- follows the same blend (`diveEnd`, the
 * review's F2). Settled by the pop's blend read (`FUN_00589aa0` -> the play stack) or a capture of the root from rest
 * to prone.
 */
export const DIVE_END_BLEND_READING = "the animator's own end" as const;
/**
 * DIVE_PRONE_TAKE_READING (LATER 414's review; research 87 1.13, 101): when the dive's prone is taken, raising the stance
 * word's bit. The original takes the request (`+0x374` = 2, D:L440912) in `FUN_00552d60` once `FUN_00552ec0` accepts it:
 * the top play free or `FUN_00588080`, `FUN_00579ea0` 0, `+0x174` not 7, clip 0x11 not playing, and `+0x174` 0 or 1
 * (D:L418928-418949). The dive pushes its plays at stance 2 (`FUN_00588bc0(..., 0x1a, 2, ...)`, D:L440896-440897) and a
 * pop writes `+0x174` from the play beneath (`FUN_0028da00` D:L135104) -- which play is on top when the dive is done, and
 * so whether `+0x174` is 0 or 1 then (a take: PRONE) or 2 (never accepted: no word), is unread. The port takes it down and
 * at rest (the dive's end, `diveTick`).
 */
export const DIVE_PRONE_TAKE_READING = 'down and at rest' as const;
/** `FUN_0054d9a0` (decomp 416527-416545): the carried speed runs down by 150 a second each second on the ground. */
const DIVE_BLEED = 150;
/** `FUN_0059b870`: the root's height through the slide. */
const SLIDE_ROOT = 11.44;
/**
 * B-50 (research 86 s2.7; the residue R1 of the row 7 read): the ladder's floor probe -- its column's offset from the
 * body (`ahead`, along the facing) and its origin's lift over the feet (`lift`). The original issues it through the
 * body's own column plus the local translation of the node the `+0x88` virtual returns, turned into the world (r0004
 * 0x5b6718-0x5b67f4; r0001 `FUN_005b0840` D:L467169-467290); r0004's inserted raise is 0 for state 5 (0x5b67f8-0x5b6844).
 * UNREAD is only which node that is (0x5b6718-0x5b674c): the clips' root -- whose heights the port already holds,
 * 15.6 on the rungs (`ladderRoot`) and 11.44 in the slide (`SLIDE_ROOT`) -- or a node at the feet. Two readings; the
 * smaller change (0, the feet) is kept until one rig read of the query's origin during a climb (r0004 0x5b6938-0x5b694c)
 * settles it (the row 7 review F5).
 */
export const LADDER_PROBE_COLUMN_PLACEHOLDER = { ahead: 0, lift: 0 } as const;
/** `FUN_0059b440`: the slide falls at gravity x 0.8. */
const SLIDE_GRAVITY = 0.8;
/** The standing root (`walk.ts` `STANCE.stand.rootY`), which the moves hand back to. */
const STAND_ROOT = stanceRootY('stand');

// ---- the state --------------------------------------------------------------------------------------------------

/** What a move is doing: the hook's `traversal()` and the audio's `TraversalEvent` read it. */
export type TraversalKind =
  | 'none' | 'ladderMount' | 'ladderMountTop' | 'ladder' | 'ladderOffTop' | 'ladderOffBottom' | 'ladderSlide' | 'ladderSlideLand'
  | 'climb' | 'hang' | 'hangUp' | 'hangDown' | 'hangDropFall' | 'turn180' | 'dive';

/**
 * What the audio (and anything else) hears (research 86 section 6): `ladderRung` is `motion.rdr`'s `ladder_rung`
 * callback, which plays `.STEP_LADDER` at the hips; `ladderSlide` on/off marks the slide (the `~LADDER_SLIDE` loop follows
 * the active clip instead: `TraversalPage.soundFrame`, research 305);
 * `climbUp` is the climbs' `climb_up` callback (at 0.1), `pullUp` the hang's `pull_up`.
 */
export type TraversalEvent =
  | { type: 'ladderMount'; from: 'bottom' | 'top' }
  | { type: 'ladderRung'; y: number }
  | { type: 'ladderDismount'; at: 'top' | 'bottom' }
  | { type: 'ladderSlide'; on: boolean }
  | { type: 'ladderSlideLand'; speed: number }
  | { type: 'climbStart'; kind: ClimbClass }
  | { type: 'climbUp' }
  | { type: 'pullUp' }
  | { type: 'jumpWhoosh' }
  | { type: 'climbEnd'; kind: ClimbClass }
  | { type: 'waterEnter'; depth: number }
  | { type: 'waterLand'; depth: number; at: [number, number, number] }
  | { type: 'waterLeave' };

/** A ripple the water asks for (`FUN_005b52b0`): its size, its pace, where. */
export interface Ripple { size: 'big' | 'small'; pace: 'anim' | 'walk' | 'run'; at: [number, number, number] }

/**
 * `FUN_005b52b0` (469810-469920): the ripple a body's water line asks for, against the body's box -- over the feet and
 * under its top (`BODY_TOP` of the posture) the big one, within 10 over its top the small one, else none -- by the speed
 * class (`FUN_0058a820`: speed^2 under 0.25 still, under 400 walk, else run); at the water's point over the feet. The
 * local walker's (`Traversal.water`) and every other body's on the page (`./remotePlayers`: the function has no locality
 * test, research 86 s5.4).
 */
export function rippleOf(
  line: number | null, feetY: number, posture: Stance, v: readonly [number, number, number], at: [number, number, number],
): Ripple | null {
  if (line === null || line <= feetY) return null;
  const top = feetY + BODY_TOP[posture];
  const speed2 = v[0] * v[0] + v[2] * v[2] + v[1] * v[1];
  const pace = speed2 < 0.25 ? 'anim' : speed2 < 400 ? 'walk' : 'run';
  return line < top ? { size: 'big', pace, at } : line < top + 10 ? { size: 'small', pace, at } : null;
}

/** The ripple's zAnim animation (`FUN_0026a250`'s names, decomp 460997-461003): `big_ripple_anim_walk` ... */
export function rippleAnimation(r: Pick<Ripple, 'size' | 'pace'>): string {
  return `${r.size}_ripple_anim${r.pace === 'anim' ? '' : `_${r.pace}`}`;
}

/** What the HUD's climb icon reads (`action_climb.tif`, research 86 section 3.4): shown, and for which climb. */
export interface ClimbPrompt { visible: boolean; kind: ClimbClass | 'ladder'; automatic: boolean }

/**
 * `motion.rdr`'s `refPt` z of each climb: the ledge's edge this far ahead of the root at the clip's start -- the aligned
 * start `FUN_005b3340` closes on through the clip (D:L468890-468943; research 86 section 3.3, research 313 section 3).
 */
const REF_AHEAD: Record<string, number> = {
  seal_step_up: 8, seal_climbcrate: 8.92, seal_climb_medium: 8.92, seal_climb_over: 10.28, seal_stand2hang: 5.65,
};
/**
 * `motion.rdr`'s `refPt` y of each climb (research 86 section 1's table [data]): the point the clip is placed by, this far
 * over the root -- the ledge the hands take, for the crate and the medium 13 and 21.5 less the root's 11.52. "Step up"
 * adds 1 (`FUN_005b1a10`, decomp 467905); the crate/medium blend weighs the two (467919; `lift`).
 */
const REF_UP: Record<string, number> = {
  seal_step_up: -3.48 + 1, seal_climbcrate: 1.48, seal_climb_medium: 9.98, seal_climb_over: -0.96, seal_stand2hang: 18.51,
};
/**
 * `FUN_0059afd0` (D:L456455-456456): under a non-reversed `UseVelY` top the root node's height is capped at 11.487 over
 * the actor (the set at D:L456460 is a reversed play's only; research 313 s8.18 (a)). The steer (`FUN_005b3340`, D:L468927)
 * measures the clip's `refPt` from the root node's world point -- the last frame's feet plus the node's blended, capped y,
 * which is 11.487 over the feet only while the node is at the cap. The climb over carries that node itself (LATER 1222,
 * `OverCarry`); the other climbs read this constant until their own capture. *Was* (corrected by LATER 1222, s8.18 (e)):
 * "the steer measures the clip's `refPt` from 11.487 over the feet".
 */
const STEER_ROOT = 11.4869995;
/**
 * READING (named; NU-1c B10, research 313 sections 3 and 8.6, its D2): the climb's steer runs concurrent with its clip
 * (`'concurrent'`), from the press -- no align before it. `FUN_005b2620` pushes the clip (D:L468433-468502) and records
 * the steer on its play (`FUN_005b1a10`, D:L468504: the edge's target point, its y the contact's top, D:L467887; the
 * clip's `refPt` as it is, D:L467931, "Step up" + 1, D:L467905, the blend's y weighed, D:L467914-467919; the facing the
 * contact's normal negated, D:L467927-467932); `FUN_0057a330` steers a record on a one-shot with `FUN_005b3340`
 * (D:L439017-439020), after the tick's advance (D:L438901) -- `../net/emplacement` `OneShotSteer`, the mount's law
 * (research 215 s7.1, PB-2c): the turn to the facing at most 2 pi rad/s times the sine (`seatTurn`, D:L468862-468886);
 * the offset between the actor's root (its x and z zeroed after each pose, D:L439147-439148) and the target less the
 * turned `refPt`, times `steerWeight(phase)` (`FUN_002874f0` of the phase as it stands, D:L468929-468930), over dt into
 * the play's velocity (D:L468943-468946), the vertical kept (zeroed only under 0x2c and a reversed 0x2e,
 * D:L468933-468941); the stored `refPt` moved by the root's velocity x dt (D:L468947-468951), so the target goes with
 * the clip's own travel. `FUN_0054d9a0` adds the play's velocity to the root's (`FUN_0028c250`, D:L438910) and moves the
 * actor by both (D:L416455, D:L416515-416520): the body goes with its clip's root and the steer closes the offset to the
 * aligned start by the eased weight. The port: the clip's own track from the aligned start (`ClipPath`, as before), the
 * feet that track less the offset still open -- `(1 - k)` of it kept each tick, plus the track's step less the same step
 * turned by the body's lag on the facing (the root's travel is along the actor's own facing, the target's along the
 * recorded one) -- and the drawn root's vertical steer (`lift`) closed by the same weight, where `ClipPath` laid it at
 * `FUN_005b2d20`'s 30 a second (`Traversal.drawnRoot` takes that back). No abandon and no tick limit: the 30 / 0.993 /
 * 46 ticks / past 30 are the looped branch's (`FUN_005b2d20`, D:L439024-439040). *Was* (research 86 section 3.5): the
 * align (`ALIGN_SPEED` 30 a second an axis, `ALIGN_TURN` 4.712 rad/s, `ALIGN_TICKS` 46, `ALIGN_NEAR` 1, `ALIGN_FACING`
 * 0.993, `ALIGN_ABORT` 30), the clip held at frame 0 until it ended. The port's 60 Hz tick stands for the frame; which
 * of the frame's moves the turn's new facing rotates (the root's travel this tick or the next) is read as this tick's
 * (`FUN_0054d9a0` integrates the turn, D:L416483-416490, before it rotates the velocity, D:L416515). Owed: a PINE trace
 * of `actor+0x1c..+0x24`, the rotation and the play's `+0x1c` from the release through a crate climb at a 60-degree
 * approach (research 313 section 8.2).
 */
export const CLIMB_STEER_READING = 'concurrent' as const;

/**
 * READING (named; NU-1c B12, research 313 sections 1.2 and 8.6, its D13): the automatic step-up (class 4, 5 < h <= 10)
 * asks no stick (`'none'`). `FUN_005b3ce0`, the HUD's offer each frame (`FUN_00593500` D:L452277-452302), calls
 * `FUN_005b2620` for such a face with the contact held and faced and drops the contact (D:L469266-469276) -- no test of
 * the stick, so the step-up runs the first offer after the walk's hit made the contact, the stick held or let go.
 * *Was* (`'pushing'`): the stick into the face's normal (`Traversal.pushing`). Owed: a capture of a walk into a 8-high
 * crate let go on the contact's frame.
 */
export const CLIMB_STEP_UP_STICK_READING = 'none' as 'pushing' | 'none';

/**
 * READING, pending review (R4P-243, ATLAS L373, research 313 s8.24; capture IQ-179 queued): the automatic step-up (class
 * 4, 5 < h <= 10) does not start while the top blend is `Jump launch` (type 8) or `Jump fall` (type 9), airborne or not
 * (`'not-in-jump-blend'`); `Jump land` passes. r0004's CanTraverse `FUN_005b9ff0` kind 4 calls the front impact and the
 * contact release only when `FUN_0058d580` (launch or fall on top) answers 0 (D4:L510624-510642); the r0001 twin
 * `FUN_005b3ce0` runs them unconditionally (D:L469263-469276) -- so the cause JUMP-AIR called unread is a blend test, not
 * an airborne one. *Was* (`'not-in-launch'`, JUMP-AIR): refused in an airborne launch only; `'any'` is the port before.
 * PROVEN for the running jump's launch at one face (JUMP-AIR, research 80 s7), and this reading agrees: the r0004
 * jump-near-wall capture (ac, 2026-11-04, M51 g19733; capture-scored by `test/weaponLine.test.ts`'s two JUMP-AIR cases)
 * never stepped up in the air: pressed 6.95 out the feet rose to +11.75 against the 14-tall face, the height to the top
 * sweeping the whole 5-10 band with the contact held (`+0x10ac` set every airborne frame, CLIMB offered), and the jump
 * ran 8 -> 10 -> 2; pressed 17.43 out it cleared in one arc. The press's jump-grab is unchanged. Owed: a capture of a
 * fall past a 5-10 face (IQ-179).
 */
export const AIR_STEP_UP_READING = 'not-in-jump-blend' as 'not-in-jump-blend' | 'any';

/**
 * OWNER (DG-GUARD, the owner's safety ruling, 2026-11-25: "Ship the guard", relayed by the main controller; DG-CLIMB):
 * a step-up plan (`ClimbPlan.automatic`: appflags 4, 5 < h <= 10 -- the original's automatic entry, `FUN_005b3ce0` calling
 * the front impact for class 4 in that band, D:L469246, D:L469270-469274) is not started -- neither by itself nor on a press
 * -- when its end finds no floor (`stepUpEndFloor` null: `topFloor` at the uncut clip's own distance past the target, the
 * point `Traversal.climbClip` would aim the feet at). The body is left as if nothing started -- the offer (the prompt)
 * stands, the walk goes on, and the same test is asked again the next tick with nothing changed; the other climbs and the
 * climb over are unchanged. NOT the original's: r0004 STARTS this step-up at MP6's seam and asks no floor of the top
 * (`CLIMB_TOP_FLOOR_READING` 'dropped', NU-1c B12), then drops the body back to the floor 0.37 u IN FRONT of the face,
 * wedged (DG-DIAG20-r0004, PC 2, record 24d8fa69, observed); the port's same step-up carries the body 1.0 u PAST the face
 * onto no floor, inside the wall (PC 4). The guard reaches the original's end state (in front, on the floor) without its
 * rise. The faithful fix -- the step-up's end dropped to the floor as r0004's, and the contacted polygon (the original
 * holds the wall's full-height polygon, top 29.983, DG-CLASS-BP-r0004; the port picks `worldmodel/firstwall_climber1`'s
 * split quad) -- replaces it in v0.4.33 (DG-CLIMB). `false` is the port before (DG-GUARD's census:
 * `test/parity/dgStepUpGuard.parity.test.ts`).
 */
export const STEP_UP_FLOOR_GUARD_OWNER = true as boolean;

/** How far past the target an uncut climb's end looks for the top's floor: the clip's travel less its `refPt` z. */
function uncutPast(shape: ClipShape, clip: string): number {
  return Math.max(0.5, shapeTravel(shape).ahead - (REF_AHEAD[clip] ?? 8.92));
}

/**
 * The floor an uncut climb's end lands the feet on (`Traversal.climbClip`'s `topFloor` at `uncutPast`), or null: what
 * `STEP_UP_FLOOR_GUARD_OWNER` asks of an automatic step-up before it starts.
 */
export function stepUpEndFloor(grid: Grid, shapes: TraversalShapes, plan: ClimbPlan): number | null {
  return topFloor(grid, plan.target, plan.contact, uncutPast(shapes.get(plan.clip), plan.clip));
}

/**
 * NU-1c B10: the climb's steer under way, on its clip's run -- the clock, the weight and the turn (`OneShotSteer`), the
 * facing it turns to (degrees), the horizontal offset still open between the clip's track and the body, the share of the
 * vertical (`lift`) still open, and that vertical whole.
 */
interface ClimbSteer { core: OneShotSteer; facing: number; ex: number; ez: number; open: number; lift: number; phase?: number; k?: number; tilt?: ClimbTilt }

/**
 * LATER 1250 (research 313 s8.23; `CLIMB_STEER_TILT_READING`): the steer record's tilt for a climb on the 60 Hz path (the
 * step-up, the crate, the medium and their blend, "Stand -> Hang"; the climb over carries its own, `OverCarry`).
 * `normal`: the contact polygon's first-triangle normal negated, world, stored once at the push (play `+0x7c`,
 * `FUN_005b1a10` D:L467927-467932); `refX`, `refY`, `refZ`: the stored `refPt` (`+0x6c`), less the clip root's velocity x dt
 * each command (D:L468947-468951), never turned in storage; `v`: the vertical the turn has left open on the drawn root,
 * against the flat steer (`Traversal.drawnRoot`).
 */
interface ClimbTilt { normal: readonly [number, number, number]; refX: number; refY: number; refZ: number; v: number }

/**
 * `motion.rdr`'s `NoInterrupt` of the climb clips (the disc's `RUN/READERC.ZAR` member `motion.rdr`, read by
 * `motionTableFromArchive`; the golden `test/golden/motion-rdr.json`, which `traversal.test.ts` pins these against): the
 * phase past which the stick or the turn cuts the clip (`FUN_00587c20` D:L445549-445565 under `FUN_00550ef0`'s stick test
 * D:L418176-418203; research 313 sections 3 and 4). The rifle's rows (a pistol-holder's: `PISTOL_CLIMB_NO_INTERRUPT`,
 * `PISTOL_CLIMB_CLIPS_READING`); the crate and the medium agree, so their blend's two nodes give one answer whichever decides.
 */
export const CLIMB_NO_INTERRUPT: Readonly<Record<string, number>> = Object.freeze({
  seal_step_up: 0.8, seal_climbcrate: 0.9, seal_climb_medium: 0.9, seal_climb_over: 0.8, seal_stand2hang: 0.85, seal_hang2climbup: 0.9,
});

/**
 * READING (named; NU-1a, research 313 sections 4 and 8.4, its D3): a climb's clip -- the step-up, the crate, the medium and
 * their blend, "Stand -> Hang", "Hang -> Climb" (the climb over not: its axes are zeroed, `CLIMB_OVER_AXES_READING`,
 * LATER 1223; was: "the climb over" among them) -- is cut by the stick or the turn past `INTERRUPT_STICK`
 * (`Walker.stickCut`) on the first command its phase is past its `NoInterrupt` (`CLIMB_NO_INTERRUPT`): the driver's
 * ordinary cut (`FUN_00550ef0` D:L418176-418203, `FUN_00587c20` D:L445549-445565), asked before the tick's advance, on the
 * clip's clock from its push, `t / (playback x (n - 1) / n)` (`NOFIRE_PHASE_READING`), with `Walker.holdCut`'s lag for a
 * push of this pass -- `'before'`, none: the climb is pushed inside the driver before its top-play block (D:L418132,
 * D:L418155 before D:L418172), as the swap is. The cut pops the climb and runs its end handler (`FUN_00589aa0`
 * D:L446582-446648): the body at its own x and z and the floor pick's y (`+0x2e4` copied from `+0x404` each climb tick,
 * D:L466784; the port's pick, `selectFloor` from the feet + the posture's lift, `probeLiftOf`), and the ground state takes the
 * same tick (`FUN_005870e0`, D:L418203). "Stand -> Hang" cut reveals the hang under it (0x22, D:L442288-442293), held
 * where the clip has the body. The climb over's handler hands the body to a fall from its root (D:L446538-446542;
 * research 313 section 6, not followed): settled on the floor pick here. The port's 60 Hz tick stands for the frame; the
 * push's skip (research 251 section 12.5) is not modelled beyond the clip's own clock. Owed: a capture of a crate climb
 * with the stick held forward -- the frame the walk resumes and the feet against the edge (research 313 section 8.2).
 */
export const CLIMB_CUT_READING: HoldPass = 'before';

/**
 * READING (named; LATER 1223, research 313 section 8.16), PROVEN on r0004 for the stick (l278-climbover F1/F2): the
 * stick or the turn never cuts `Climb over` (`'zeroed'`). The driver calls `FUN_005af930` with the move axes and the
 * turn (`+0x240`, `+0x244`, `+0x23c`) just before its top-play block (D:L418169); outside its suspended list (`Climb crate`,
 * `Climb medium`, `Step up`, the ladder's and `Hang -> Climb`'s ids, or state 4: D:L466760-466787) it sets the actor's
 * `+0x105e` bit 0x20 (D:L466805-466806), runs the floor routine `FUN_0059b440` -- which clears that bit on a floor
 * (D:L456508, D:L456528, D:L456558, D:L456602) -- for every action but `Climb over` (D:L466808-466810), and with the bit
 * still set zeroes the three axes (D:L466811-466815). Under `Climb over` the bit is never cleared, so the cut's test of
 * those axes past 0.1 (D:L418182-418185) reads zeros and `FUN_00587c20`'s phase past `NoInterrupt` 0.8 cuts nothing:
 * the clip runs to its end. The capture: with the stick held forward from the press, action 189 ran its full clip
 * (F1 0.901 s from its first action-189 row to its first other row; F2 the same, read through a 0.17 s recorder gap), as
 * the uncut T1/T2, then the run (action 2). The other climbs keep the cut
 * (`CLIMB_CUT_READING`); the knock's and the flinch's pops are not the stick's and are unchanged. *Was* (NU-1a): the climb
 * over cut past its `NoInterrupt` like the others.
 */
export const CLIMB_OVER_AXES_READING = 'zeroed' as 'zeroed' | 'read';

/**
 * READING (named; LATER 1222, research 313 s8.18 (a) 5 and (b); research 101): the root node's blend into `Climb over` from
 * the pose at the push lasts **0.4 s**. `FUN_00576860` (called at D:L418455, right after the tick at D:L418454) steps the
 * blend's timer by dt each frame and weighs the push's snapshot by the ease of what is left over the length
 * (D:L436621-436634, `blendWeight` = `FUN_002874f0`'s ease); the push sets the timer to the motion's `+0x20`
 * (D:L135218-135220), which `seal_climb_over`'s `motion.rdr` row leaves unset (`BlendTime`). The 0.4 is the default the
 * port's `./locomotion` `BLEND_TIME_DEFAULT` reads in `FUN_00287620` for an unset `BlendTime` (not re-read for this row),
 * and it is **pinned by the capture** (l278-climbover, proven): with it the node reproduces skel_root within 0.00006 on T1,
 * F1, L1x and L2x over all 27 frames; 0.39 or 0.41 miss by 0.03. The snapshot is the posture's root at the push
 * (`stanceRootY`; the capture's running F1 reads 11.3587, the run cycle's drawn root, which the simulation does not hold:
 * its feet 0.39 off the rows against 0.33). The node is capped at 11.487 (`STEER_ROOT`, D:L456455-456456) and is the drawn
 * root over the feet through the clip. Owed: the read of `FUN_00287620`'s default at its line for this row.
 */
export const CLIMB_OVER_BLEND_READING = 0.4;

/**
 * READING (named; LATER 1222, research 313 s8.18 (b), folded from the design review's F1): which frame the first
 * action-189 row of l278-climbover is against the push. The push sets bit 8 of a non-looped play (D:L135209-135212) and
 * `FUN_0028c4f0` holds that tick's advance; the blend's timer is stepped every frame `FUN_00576860` runs
 * (D:L436624-436629), held tick or not. Two pairings: `'held'` (A) -- the push frame's tick held, its blend step taken,
 * the first row the frame after: the node then leaves skel_root at every blend length; `'push-advances'` (B, built) --
 * the push frame is the first row, its tick advances and its blend steps (capture frame i = game frame i, the phase
 * (i + 1) x dt / (playback x (n-1)/n)): the node matches skel_root within 0.00006. So the climb over steps its game frame 0
 * on the press's own tick (the other climbs keep their first advance on the next command). How bit 8 goes unseen, read on
 * r0001 by the build's review (reading, pending review): the press's push runs early in the driver (`FUN_005b4b40`,
 * D:L418132, D:L418155), whose phase preview `FUN_0028c4f0(.., 0)` on the top play (D:L418293) clears bit 8 without storing
 * the phase (D:L134257), so the tick at D:L438901 advances on the push frame (OT.R97: r0004's frame order not re-checked). Owed: play `+0x1c` and `+0x28` bit 8 read on the push frame of
 * a climb over (research 313 s8.18, "the next capture").
 */
export const CLIMB_OVER_FRAME_ORDER_READING = 'push-advances' as 'push-advances' | 'held';

/**
 * READING (named; LATER 1244, research 313 s8.20 (b) 1 and s8.21 (a); research 101): the climb over's steer turns the
 * stored `refPt` each frame by the shortest arc from this vector -- play `+0x9c`, in the body's frame -- onto the contact's
 * reversed normal taken into the body's frame. `FUN_005b1a10` stores the stored contact's normal (the hit slot's words 4-6,
 * D:L468504) negated, whole, at play `+0x7c` once (D:L467927-467932), and this vector from `0x3f6500` at `+0x9c`
 * (D:L467934); `FUN_005b3340` takes `+0x7c` into the body's frame by the actor's conjugate rotation (D:L468840-468844),
 * builds the rotation from `+0x9c` onto it (`FUN_00306d40`, D:L468892: h = normalize(a + b), the quaternion (a x h, a . h),
 * D:L206032-206078) and turns a copy of `refPt` by it (D:L468893) before the body matrix and the target (D:L468898-468926);
 * the stored `refPt` is never turned (D:L468947-468951). The normal is the plane of the contact polygon's first three
 * points, `(p2 - p1) x (p0 - p1)` (the hull's VU0 routine, research 281 s4.3). The vector at `0x3f6500` is zero in the ELF's
 * file image (set at run time, its writer unread); **fitted** on r0004 as (0, 0, -1), the body's forward
 * (l1222-climbover2: the other sign misses by 9; with it the feet within 0.0022 on S1b) -- the capture never reads
 * `0x3f6500` or `+0x9c`, and its y-only rows on faces whose normal lies in the body's y-z plane constrain only y and z:
 * a small lateral (x) part would move only the unscored x/z aim. Owed: one PINE read of play `+0x9c`. *Was* (LATER 1222): the climb over
 * steered on a flat `refPt` (the contact's nx and nz only) -- 0.36 of S1b's feet. Owed: the run-time writer of `0x3f6500`.
 * LATER 1250 (research 313 s8.23; reading, pending review, no capture): `FUN_005b1a10` records the same whole normal for
 * the step-up, the crate, the medium and "Stand -> Hang" (D:L467888-467934), so their steer takes the arc too
 * (`climbTilt`); the mount's record is level (`FUN_005463c0` D:L412296), its arc `seatTarget`'s yaw: no tilt.
 */
export const CLIMB_STEER_TILT_READING: readonly [number, number, number] = Object.freeze([0, 0, -1]) as readonly [number, number, number];

/**
 * READING (named; LATER 1244, research 313 s8.21 (b); research 101), PROVEN on r0004 for the value: the node the climb
 * over's hand-off stands the feet under `+0xfac` by, where that is over the floor pick -- `Jump fall`'s root. The end
 * leaves the body over its floor, so `FUN_0057e050` pushes `Jump fall` (action 9 in the anim-type table at `0x661060`,
 * D:L440726), whose Seal clip `seal_runningjump_in_air` (`motion.rdr`: playback 5, 14 keys, `BlendTime` 0.75) holds one
 * `skel_root` key, y **10.59765625** (`RUN/MOTION_P.ZAR`; `traversal.test.ts` pins it on the pack), and `FUN_0059afd0`
 * stands the feet at `+0xfac` less the root node's y (D:L456368-456371). l1222-climbover2's action-9 rows read skel_root
 * 10.5977 (S1, S1b) and the feet 63.2992 - 10.5977 = 52.7015 exactly: the node is the clip's own root, the 0.75 blend from
 * the climb over's last node not in it (why: the push against the blend's step, D:L418454-418455, r0004's frame order,
 * unread, OT.R97). *Was* (LATER 1222): the posture's standing root 11.4844 -- the fence's hand-off row 0.62 under. Owed:
 * the frame order of the `Jump fall` push against `FUN_00576860` on r0004.
 */
export const CLIMB_OVER_FALL_READING = 10.59765625;

/**
 * LATER 1244 (`CLIMB_STEER_TILT_READING`): the climb contact polygon's first-triangle normal, `(p2 - p1) x (p0 - p1)`
 * normalised (the hull's hit normal, research 281 s4.3), or null for a degenerate first triangle.
 */
function firstTriangleNormal(p: ArrayLike<number>): [number, number, number] | null {
  const ax = p[6]! - p[3]!, ay = p[7]! - p[4]!, az = p[8]! - p[5]!;
  const bx = p[0]! - p[3]!, by = p[1]! - p[4]!, bz = p[2]! - p[5]!;
  const n: [number, number, number] = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const l = Math.hypot(n[0], n[1], n[2]);
  return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : null;
}

/**
 * LATER 1244: `v` turned by the shortest arc from the unit `a` onto the unit `b` -- `FUN_00306d40`'s quaternion (D:L206032-
 * 206078: h = normalize(a + b), q = (a x h, a . h); a + b zero, a half turn about (a.y, -a.x, 0), or x where a.x is 0).
 */
function turnByArc(a: readonly number[], b: readonly number[], v: readonly number[]): [number, number, number] {
  let hx = a[0]! + b[0]!, hy = a[1]! + b[1]!, hz = a[2]! + b[2]!;
  let qx: number, qy: number, qz: number, qw: number;
  const hl = Math.hypot(hx, hy, hz);
  if (hl > 1e-12) {
    hx /= hl; hy /= hl; hz /= hl;
    qx = a[1]! * hz - a[2]! * hy; qy = a[2]! * hx - a[0]! * hz; qz = a[0]! * hy - a[1]! * hx; qw = a[0]! * hx + a[1]! * hy + a[2]! * hz;
  } else if (a[0] === 0) {
    qx = 1; qy = 0; qz = 0; qw = 0;
  } else {
    const l = 1 / Math.hypot(a[0]!, a[1]!);
    qx = a[1]! * l; qy = -a[0]! * l; qz = 0; qw = 0;
  }
  // v' = v + 2 w (q x v) + 2 q x (q x v)
  const cx = qy * v[2]! - qz * v[1]!, cy = qz * v[0]! - qx * v[2]!, cz = qx * v[1]! - qy * v[0]!;
  return [
    v[0]! + 2 * (qw * cx + qy * cz - qz * cy),
    v[1]! + 2 * (qw * cy + qz * cx - qx * cz),
    v[2]! + 2 * (qw * cz + qx * cy - qy * cx),
  ];
}

/**
 * LATER 1250: `v` turned by the shortest arc from `CLIMB_STEER_TILT_READING` onto the body-frame normal `nb` made level (its
 * y dropped) -- the part of `FUN_005b3340`'s turn (D:L468892-468893) the flat steer already lays, its facing the record's;
 * a turn about the vertical, so `v`'s y is kept. `v` itself where `nb` has no horizontal part.
 */
function levelTurn(nb: readonly number[], v: readonly number[]): [number, number, number] {
  const hl = Math.hypot(nb[0]!, nb[2]!);
  return hl > 1e-12 ? turnByArc(CLIMB_STEER_TILT_READING, [nb[0]! / hl, 0, nb[2]! / hl], v) : [v[0]!, v[1]!, v[2]!];
}

/**
 * LATER 1222 (research 313 s8.18): the climb over's carried vertical, stepped once a game frame (`GAME_FRAME_DT`) --
 * the clock that owns the over's phase, its x/z steer, its vertical, its end and its hand-off. `feet`: the actor's y
 * (`+0x20`); `travel`: the clip root's vertical integrated so far (S, what the stored `refPt` has moved by,
 * D:L468947-468951); `node`: the root node's y after the blend and the cap (N, the last frame's); `snap`: the blend's
 * snapshot; `up`: the clip's `refPt` y negated (0.96); `top`: the steer target's y (the contact's top, D:L467887);
 * `hold`: after the hand-off frame held over the pick, the pick to stand on the next. LATER 1244
 * (`CLIMB_STEER_TILT_READING`): `normal` the contact's reversed normal, world, stored once at the push (play `+0x7c`,
 * D:L467927-467932; null for a degenerate polygon: the flat `refPt`); `refX`, `refZ` the stored `refPt`'s x and z, less the
 * root's velocity x dt each frame like its y (D:L468947-468951), never turned in storage.
 */
interface OverCarry {
  clock: GameFrameAccumulator; frames: number; top: number; up: number;
  feet: number; travel: number; node: number; snap: number; hold: number | null;
  normal: readonly [number, number, number] | null; refX: number; refZ: number;
}

/**
 * READING (named; NU-1a, research 313 sections 3 and 8.4, its D11; settled by NU-1c B11's re-read, section 8.6): the cut
 * reads the pistol clip's `NoInterrupt` for a pistol-holder (`'sub-node'`). For a one-shot play `FUN_0057a330` hangs each
 * node's pistol version under it each tick (D:L438711-438772): `FUN_0058c9e0` on the hand `+0xf79` (2 the pistol,
 * `FUN_005a6fc0` D:L462189-462191) maps the node's type through the anim set's table, `FUN_005e3d90` takes its motion
 * where the set holds one, and `FUN_0028bdd0` links it at the node's `+0x10` at weight 1 (D:L133953-133962); a rifle's
 * node maps to itself and gets none. `FUN_00587c20` starts at the play's first node (`FUN_005780e0` D:L437475-437489)
 * and walks `+0x10` -- that node's sub-chain, not the play's node list (`FUN_00578110`, `+0x8`) -- each node's
 * `NoInterrupt` replacing the last (D:L445551-445565): the pistol's decides. In the crate/medium blend the crate's node is
 * first (`FUN_00581110` appends it before the medium's, D:L442323-442333; `FUN_0028cfb0` / `FUN_0028f430` append at the
 * tail and `FUN_0028f120` reads from the head), so a pistol-holder's blend reads `seal_p_climbcrate`'s 1 too: never cut,
 * the phase stopping at (n - 1) / n. The Seal anim set (`animset.rdr`) holds `Pistol climb crate`, `Pistol climb medium`,
 * `Pistol stand -> Hang` and `Pistol hang -> Climb` (`PISTOL_CLIMB_CLIPS`) and no `Pistol step up` or `Pistol climb
 * over` (the ELF names both, 0x494030 and 0x494080): those keep the rifle's clip alone. The hand is the mover's
 * (`Walker.hand`). *Was* (NU-1a): `'rifle'`, the rifle's whatever the weapon, the walk not read. Owed: a capture of a
 * crate climb with the pistol in hand and the stick held forward (research 313 section 8.2).
 */
export const PISTOL_CLIMB_CLIPS_READING = 'sub-node' as 'rifle' | 'sub-node';

/**
 * NU-1c B11: the Seal anim set's pistol version of each climb clip (`animset.rdr`: `Pistol climb crate` ...; pinned by
 * `traversal.parity.test.ts` against the disc's set), as `FUN_0058c9e0` maps the node's type for the pistol.
 */
export const PISTOL_CLIMB_CLIPS: Readonly<Record<string, string>> = Object.freeze({
  seal_climbcrate: 'seal_p_climbcrate', seal_climb_medium: 'seal_p_climb_medium', seal_stand2hang: 'seal_p_stand2hang', seal_hang2climbup: 'seal_p_hang2climbup',
});

/** NU-1c B11: `motion.rdr`'s `NoInterrupt` of the pistol climb clips (the golden `motion-rdr.json`; `CLIMB_NO_INTERRUPT`'s twin). */
export const PISTOL_CLIMB_NO_INTERRUPT: Readonly<Record<string, number>> = Object.freeze({
  seal_p_climbcrate: 1, seal_p_climb_medium: 0.9, seal_p_stand2hang: 0.85, seal_p_hang2climbup: 0.9,
});

/**
 * The `NoInterrupt` the cut reads for a climb clip (`CLIMB_NO_INTERRUPT`), for the hand: the pistol's sub-node's where the
 * set holds one (`PISTOL_CLIMB_CLIPS_READING`), the rifle's clip's otherwise.
 */
export function climbNoInterrupt(clip: string, hand: 0 | 1): number | undefined {
  const pistol = hand === 1 && PISTOL_CLIMB_CLIPS_READING === 'sub-node' ? PISTOL_CLIMB_CLIPS[clip] : undefined;
  return pistol !== undefined ? PISTOL_CLIMB_NO_INTERRUPT[pistol] : CLIMB_NO_INTERRUPT[clip];
}

/**
 * READING (named; NU-1a, research 313 sections 2.2, 6 and 8.4, its D5): the climbs a SEAL crouched at the press ends
 * crouched -- the step-up, the crate and the medium (their blend among them). `FUN_00580b70` pops the stack to index 1
 * for a SEAL not standing (D:L442186-442214), `FUN_00588bc0` pops the same way for these three and writes the stance
 * request crouch (`actor+0x374` = 1, D:L446244-446274), and the climb's pop reveals the crouch base, the pop writing the
 * state from the revealed entry (D:L135104): crouched again, the request already crouch, no transition played. The hang
 * (pushed over a pop to index 0, D:L446105; `Hang -> Climb`, D:L446199) and the climb over (D:L442152-442163) end
 * standing. The clip itself plays in state 0 (D:L442225-442277), as `startClimb` stands the mover for it. Owed: a capture
 * of a crouched climb at a 12 crate and at a 30 face (research 313 section 8.2).
 */
export const CLIMB_CROUCH_END_READING: readonly ClimbClass[] = Object.freeze(['step', 'low', 'med'] as ClimbClass[]);

/**
 * READING (named; NU-1a, research 313 sections 3, 6 and 8.4, its D10): the walk after a climb, cut or not, starts at the
 * held stick, unramped (`'held'`). Each advance of the top play copies the pad's axes into the ramp's last value
 * (`FUN_0057a330` D:L438704-438706: `+0x248` <- `+0x244`, `+0x24c` <- `+0x240`), and the ground state's ramp
 * `FUN_00586c10` (D:L444985-445010) starts from it -- so each climb advance copies the tick's stick (`Walker.cutStick`)
 * into the state's ramp and the climb's end keeps it (`finish`); the ladder's ends are not this row's and still zero
 * it. Owed: a capture -- the first frames' speed after an uncut climb with forward held (research 313 section 8.2).
 */
export const CLIMB_RESUME_STICK_READING = 'held' as const;

/**
 * READING (named; NU-1a B8, research 313 sections 4 and 8.4, its D9): a knock mid-climb settles the climb before the fall
 * (`'settled'`). `FUN_0057e770` pops the stack to its base (`FUN_0058a4d0`, D:L440997), each pop running the popped
 * type's end handler `FUN_00589aa0` -- for the crate, the medium, `Hang -> Climb` and the step-up the body at its own x
 * and z on the floor pick's y (D:L446582-446648, `+0x2e4` from `+0x404`, D:L466784) -- and the fall is laid from there.
 * `Traversal.popSettle`, asked by `./net/blast` `applyKnock` before the move is released: the climb over settled the same
 * way (its fall from the root, D:L446538-446542, not followed: research 313 section 6); `Stand -> Hang`, which the
 * handler names no case for, and the hang and the dive settle nothing; the ladder's 0x2c / 0x2e cases
 * (D:L446544-446576) are not read for the knock (PF-19's `KNOCK_LADDER_STATE_READING` holds them); the port's ladder
 * knock is unchanged. Asked only by the knock: whether a
 * death's push pops a climb (and so settles it) is not read (research 313 section 4), so `Room.kill`'s release is left
 * as it was. Owed: a recomp or PINE trace of a blast mid-climb (`+0x2e4`, the matrix y; research 313 section 8.2).
 */
export const CLIMB_KNOCK_SETTLE_READING = 'settled' as const;

/**
 * NU-1b (research 313 sections 5 and 8.1, B5 and B6): the clips of the climb onto obstacles and the hang's loop -- what
 * holds the body while a climb runs. Every climb clip carries `UseVelY` and a bare `NoFire` (research 86 section 1, read
 * off `motion.rdr`), and the hang is state 4: a reload's start refused under them (`FUN_005b4340(actor, 3)`, D:L469517,
 * D:L469460-469461) and the grenade's chase and release (`FUN_0059d830` -> `FUN_005a7de0(actor, 1, 1)`, D:L457365).
 */
export const CLIMB_BODY_CLIPS: ReadonlySet<string> = new Set([
  TRAVERSAL_CLIP.stepUp, TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.over, TRAVERSAL_CLIP.toHang,
  TRAVERSAL_CLIP.hang, TRAVERSAL_CLIP.hangUp, TRAVERSAL_CLIP.hangDown,
]);

/**
 * READING (named; NU-1b's review F3, research 313 section 8.5): the clips of `CLIMB_BODY_CLIPS` carry `UseVelY`
 * (`'every climb clip'`), on research 86 section 1's word -- `motion.rdr`'s flag the repository's reader does not read
 * (`./motionTable`; `FUN_0057b510` tests the motion's `+0x4a` bit 4, D:L469517). Read through the reader instead: every
 * one a bare `NoFire` and only the hang's loop looped (`traversal.test.ts` "NU-1b review F3"). What it stands under: the
 * reload's refusal on a `UseVelY` top (`CLIMB_RELOAD_REFUSED_READING`) for the clips out of state 4 -- the hang's jump
 * down's push among them. Owed: a reader of `UseVelY` (the loader's `+0x4a` bits, `FUN_00287620`) run over the clips.
 */
export const CLIMB_USEVELY_READING = 'every climb clip' as const;

/** Whether `clip` (a move's clip, `Traversal.pose`'s, or the room's frame's motion) is a climb holding the body (`CLIMB_BODY_CLIPS`). */
export function climbHoldsBody(clip: string | null | undefined): boolean {
  return clip !== null && clip !== undefined && CLIMB_BODY_CLIPS.has(clip);
}

/**
 * READING (named; LATER 562, research 86 s2.8; reading, pending review): a reload's start is refused through the ladder
 * slide's landing (`seal_ladderslide_land`, `'refused'`). Its push is read (`land`, `FUN_0057f310`, r0004 0x584830: the
 * stack popped toward the base, the landing clip pushed at posture 0, no state written), so state 5 holds while the clip
 * plays if it is a one-shot -- and it is: `motion.rdr`'s `looped` 0 for `seal_ladderslide_land` (playback 1.3; the disc's
 * `RUN/READERC.ZAR` through `motionTableFromArchive`, 2026-11-22), the record tick then writing the state from the ended
 * record (D:L445118-445147) -- the refusal resting on the record under a ladder's records not being posture 3 (the pop
 * writes 3 or 8 back; the fold delta's X3). *Was:* `LADDER_RELOAD_SLIDE_LAND_PLACEHOLDER` `'taken'` ("not found"; the 562 review's F1 and
 * its delta's D5: a reader lookup, not a ruling).
 */
export const LADDER_RELOAD_SLIDE_LAND_READING = 'refused' as 'taken' | 'refused';

/**
 * READING (named; LATER 562, research 86 s2.8; the review's F2): the foot's step-off ("Stand -> Ladder" reversed, clip
 * 0x2c, posture 0; r0004 0x589840 = `FUN_00584240` D:L443765-443773) refuses a reload while it plays (`'refused'`): the
 * state stays 5 through it only if the clip is a one-shot (the record tick writes the state from a looped top every
 * frame, from an ended one-shot's posture when it ends; D:L445115, D:L445118-445147) -- and it is a one-shot: `motion.rdr`'s
 * `looped` 0 for `seal_stand2ladder` (playback 0.9; the disc's `RUN/READERC.ZAR` through `motionTableFromArchive`,
 * 2026-11-22). `LADDER_RELOAD_CLIPS`' `toLadder` carries it (the clip in both directions of play; `ladderReload.test.ts`
 * binds this value to that membership). Owed beside it: a capture, R held at the last rung going down.
 */
export const LADDER_RELOAD_FOOT_READING = 'refused' as 'taken' | 'refused';

/**
 * READING (named; LATER 562, research 86 s2.8; the fold delta's X1): a reload's start is refused under the "180" turn
 * before a head mount (`seal_180`, `'refused'`). The gate's test 4 (r0004 0x5ba6f0-0x5ba70c) refuses every code while the
 * current clip is the one whose id is the word at r0004 0x409cb0, and that word's one writer (0x5e97a8) stores the name
 * lookup (0x5ec760, called at 0x5e9798) of the string at 0x661528, "180"; the turn's clip is pushed at 0x5b86f0-0x5b8704.
 * So the 180 is refused wherever it plays; at a ladder it joins `LADDER_RELOAD_CLIPS`. (`seal_180` is a one-shot, `looped`
 * 0, playback 0.95.) *Was:* `'taken'`, the id thought unresolved.
 */
export const LADDER_RELOAD_TURN_READING = 'refused' as 'taken' | 'refused';

/**
 * LATER 562 (research 86 s2.8; reading, pending review): the ladder's clips a reload's start is refused under. The
 * original's action gate (r0004 0x5ba680, r0001 `FUN_005b4340`; it differs at r0004 and was read directly) refuses every
 * code in the ladder's state 5 or with a posture-5 record on top (0x5ba710-0x5ba73c; r0001 D:L469329-469330), the
 * reload's code 3 among them (the kit's timer -> 0x5c9f60 = `FUN_005c2a90` -> the gate, D:L476550-476560, D:L477404).
 * By phase: the foot's mount pushes 0x2d and 0x2c with posture 5 (0x584de0 = `FUN_0057f880`, D:L441547-441561), the head's
 * 0x2d and 0x2e reversed (0x584bb0, D:L441478-441480); the rungs are state 5 under looped 0x2d; the slide sets state 5
 * on its push (0x584900, D:L441368-441370); the climb-off at the head (0x2e, posture 0) keeps state 5 until it ends.
 * The step-off at the foot (0x2c reversed, posture 0) is refused only while state 5 lasts through it -- an inference
 * (that clip a one-shot), named, which `toLadder` here takes in both directions of play. The original tests a state or a
 * posture, not a clip list; where the port has only the clip (the page's pose, the room's frame), every ladder clip is
 * refused in both directions, so the set is the same law. Not a refusal of this term: a mount pressed under a running
 * reload, which the offer's `climbOffered` already refuses (0x5ad790 = `FUN_005a7ab0`).
 */
export const LADDER_RELOAD_CLIPS: ReadonlySet<string> = new Set([
  TRAVERSAL_CLIP.toLadder, TRAVERSAL_CLIP.ladder, TRAVERSAL_CLIP.offLadder, TRAVERSAL_CLIP.toSlide, TRAVERSAL_CLIP.slide,
  ...(LADDER_RELOAD_SLIDE_LAND_READING === 'refused' ? [TRAVERSAL_CLIP.slideLand] : []),
  ...(LADDER_RELOAD_TURN_READING === 'refused' ? [TRAVERSAL_CLIP.turn180] : []),
]);

/**
 * Whether a reload's start is refused under `clip` (`CLIMB_RELOAD_REFUSED_READING`): a climb holding the body
 * (`climbHoldsBody`) or, LATER 562, a ladder's clip (`LADDER_RELOAD_CLIPS`). The page asks it (`./walk`
 * `WalkMode.climbHolds`, `./fireCore` `FireSource.climbHolds`) and the room by its frame's motion clip. The grenade's
 * throw keeps asking `climbHoldsBody` alone (its own refusal, a different gate).
 */
export function reloadRefusedBy(clip: string | null | undefined): boolean {
  if (climbHoldsBody(clip)) return true;
  return CLIMB_RELOAD_REFUSED_READING === 'refused' && clip !== null && clip !== undefined && LADDER_RELOAD_CLIPS.has(clip);
}

/**
 * READING (named; NU-1b B1, research 313 sections 1.2-1.3 and 8.1, its D1): the climb's offer asks the original's gates
 * (`'gated'`), one predicate on the mover (`climbOffered`) for the room and the page. `FUN_00593500` sets the climb's bit
 * only past the view's gates -- no offer in the binoculars (view state 4, `FUN_005b90f0` D:L452262) or a scope (over 4,
 * `FUN_005b9990` D:L452259), the port's `Walker.scoped` -- and from `FUN_005b3ce0`, which asks `FUN_005b4340(actor, 2)`
 * (D:L469160): dead (D:L469321), the knock's falls and landings (D:L469325-469326), a swap (D:L469412), the reload lock
 * (D:L469416), the launcher's and the turret's sets (D:L469470-469474) -- in the air as on the ground. On the ground the
 * common gate `FUN_005a7de0(actor, 1, 0)` is asked first (D:L452277); in the air or a jump or landing clip it is not
 * (D:L452279-452290): a throw or toss on top (D:L462622-462631) and the second channel (D:L462681) refuse on the ground
 * only. The parts the mover does not carry (the standing still clip, the reload's clips, the after-shot's timer -- not the reload's delay timer, `CLIMB_LOCK_RELOAD_DELAY_READING` -- the launcher's
 * and the turret's sets) are `Walker.climbLock`'s. The HUD's `+0xee0` timer (D:L452241) and the controller's `+0x221`
 * (D:L452244) have no twin in the port: `CLIMB_OFFER_TIMER_READING` and `CLIMB_OFFER_CONTROLLER_READING`, research 313
 * section 8.2, note only. Owed: a capture -- Cross at a crate during a moving reload, and with the launcher up.
 */
export const CLIMB_OFFER_GATE_READING = 'gated' as const;

/**
 * READING (named; NU-1b B3, research 313 sections 5 and 8.1, its D4): a stance press during a climb's one-shot -- the
 * align, the clip, `Hang -> Climb` -- is the mover's request (`Walker.changeStance`), kept while the climb owns the body
 * (`TickDriver.topOneShot`; `FUN_00552ec0` D:L418927-418930) and asked from the tick after its end (`FUN_00552d60`
 * D:L418867-418908); the climb's end keeps it (`Walker.requestStance`), and a crouched SEAL's push writes it crouch
 * (`FUN_00588bc0` D:L446244-446274). A press during `Stand -> Hang` or the hang is the hang's owner's (D16, research
 * 313's review F1): unchanged. Owed: a capture, crouch pressed mid-climb (research 313 section 8.2).
 */
export const CLIMB_PENDING_STANCE_READING = 'kept' as const;

/**
 * READING (named; NU-1b B5, research 313 sections 5 and 8.1, its D6): a reload's start is refused while a climb's clip or
 * the hang holds the body (`climbHoldsBody`) -- and, LATER 562, a ladder's clips (`LADDER_RELOAD_CLIPS`; state 5 or a
 * posture-5 record on top, r0004 0x5ba710-0x5ba73c): the kit's timer runs out into `FUN_005c2a90` (D:L476550-476560, the
 * timer zeroed whatever it answers), which asks `FUN_005b4340(actor, 3)` (D:L477404): refused under a `UseVelY` top
 * (`FUN_0057b510`, D:L469517), in state 4 (D:L469460-469461) and in state 5 -- no clip, no magazine moved, the press
 * spent. The page's `./fireCore` `FireSource.climbHolds` and the room's reload by its frame's motion ask `reloadRefusedBy`;
 * the room tells the page (`stale`). Owed: a capture, the magazine's count after R mid-climb with an M4 and the 870
 * (research 313 section 8.2).
 */
export const CLIMB_RELOAD_REFUSED_READING = 'refused' as const;

/**
 * READING (named; research 313 sections 8.3 and 8.5): the climb's offer lock counts the reload's delay timer as the
 * original does (`'counted'`): `FUN_005a7ab0` (D:L469416) answers while the kit's timer runs (`kit+0x820`,
 * D:L462522-462523), the `ReloadDelay` the press starts (`FUN_005c32b0`) among it. LATER 72: the press reaches the room
 * (`reloadPress`, its command), which refuses the offer for the delay's commands from it (`Room.pressLock`); the page
 * counts the same commands (`./fire` `Fire.reloadLocked`'s window), and offline the timer by its time. Was (NU-1b's
 * review F1, page and room on one law while the room heard the reload only at its clip's start): `'not counted'`.
 */
export const CLIMB_LOCK_RELOAD_DELAY_READING = 'counted' as 'counted' | 'not counted';

/**
 * READING (named; NU-1b B7, research 313 sections 4 and 8.1, its D8): a non-lethal flinch taken over a running climb
 * pops it (`'popped'`): `FUN_005a2690` under a one-shot top pops the stack to its base (`FUN_0058a4d0`, D:L460018) and
 * pushes the flinch in the state then (D:L460019), each pop running the type's end handler `FUN_00589aa0` -- the crate,
 * the medium, the step-up, `Hang -> Climb` (and the climb over, as `CLIMB_KNOCK_SETTLE_READING` takes it) on the floor
 * pick (D:L446582-446648); `Stand -> Hang` has no case, so the body is left where it is and falls (the gravity's
 * suspension is the climb's and state 4's, D:L466760-466787). Over the hang's own loop the flinch's branch is not read
 * (research 313 section 8.3): nothing popped. `Traversal.flinchPop`, asked by the room's flinch and the page's
 * (`./walk` `setFlinchPose`). Owed: a capture of a hit mid-climb (research 313 section 8.2).
 */
export const CLIMB_HIT_CANCELS_READING = 'popped' as const;

/**
 * NU-1b B1 (`CLIMB_OFFER_GATE_READING`): whether the climb may be offered to `w` now -- the HUD's view gates, then
 * `FUN_005b4340(actor, 2)` in the air and on the ground, then on the ground the common gate's own refusals. Prone is
 * the plan's (`Traversal.keepContact`).
 * R4P-243 (ATLAS L367, research 313 s8.24; reading, pending review; capture IQ-179 queued): `handRefuses`, the item in
 * hand that the kit's selectability refuses (`Traversal.handRefusesClimb`), refuses it in the air and on the ground --
 * r0004's `FUN_00598d30` skips CanClimbWall (0x5a3400, the step-up's kind 4 within it) and CanClimbLadder (0x5a34e0)
 * when GetCurItem (0x5cac50) holds an item isSelectableItem (0x5c47e0) refuses (D4:L493145-493148 in the air,
 * D4:L493164-493168 on the ground); an empty hand passes. The r0001 twin `FUN_00593500` has no item test.
 */
export function climbOffered(w: Walker, handRefuses: (() => boolean) | null = null): boolean {
  if (CLIMB_OFFER_GATE_READING !== 'gated') return true;
  if (w.scoped || w.dead) return false;                           // D:L452259-452262; state 8, D:L469321
  const a = w.action?.name;
  if (a === 'fallForward' || a === 'fallBackwards' || a === 'landDeath' || a === 'landBackwards') return false;   // D:L469325-469326
  if (w.swapping()) return false;                                 // FUN_005a7980(actor, 1), D:L469412
  const h = w.holding;
  if (h && holdFamily(h.clip) === 'reload') return false;         // FUN_005a7ab0, D:L469416: a still clip on the stack
  if (w.climbLock?.()) return false;                              // the lock's other parts, the sets (D:L469416, D:L469470-469474)
  if (handRefuses?.()) return false;                              // R4P-243: r0004 FUN_00598d30, D4:L493145-493148, D4:L493164-493168
  // The air, `Jump launch` / `Jump fall` (FUN_00587f50) and `Jump land` / `Jump land hard` (FUN_00587f10): no common gate.
  if (w.airborne || a === 'launch' || a === 'fall' || a === 'land' || a === 'landHard') return true;
  // A throw or toss on top, the hand's (LATER 509, D:L462622-462631; R4P-211: r0004's IsThrowing holds the pistol peek
  // tosses too, D4:L503648-503650, D4:L503688 -- LATER 509 superseded, `Walker.throwOnTop`).
  if (w.throwOnTop()) return false;
  // LATER 220's last head (research 369 §1 term 9): getting up shuts the common gate (`FUN_00587f90` D:L462679).
  if (a === 'getUp' || a === 'getUpBackwards') return false;
  return w.overlay === null;                                      // the second channel, D:L462681
}

/** A clip-driven move under way: its path, the clip and its time, what comes after. */
interface Running {
  kind: TraversalKind;
  clip: string;
  path: ClipPath;
  time: number;
  /** Plays the clip backwards: the keys run from the end. */
  reverse: boolean;
  /** Callbacks at a fraction of the clip, fired once. */
  calls: { at: number; event: TraversalEvent; fired: boolean }[];
  done: (w: Walker) => void;
  /** A second node playing with the clip at the same phase (the crate/medium blend). */
  blend?: { clip: string; weight: number } | null;
  /** NU-1c B10: the climb's steer on this clip (`CLIMB_STEER_READING`); none on the other moves. */
  steer?: ClimbSteer | null;
}

/** What `state()` reports. */
export interface TraversalState {
  kind: TraversalKind;
  /** The ladder the mover is on or at, by its node path; null off ladders. */
  ladder: string | null;
  /** The clip playing, its key. */
  clip: string | null;
  key: number;
}

/** The lean clip for a stance and a side (`motion.rdr`: `seal_<stance>2<l|r>lean`, 0.4 / 0.5 / 0.8 and 0.65 s). */
export function leanClip(stance: Stance, side: -1 | 1): string {
  return `seal_${stance}2${side < 0 ? 'l' : 'r'}lean`;
}

/** The facing that looks at a ladder (-normal), as `Pose.yaw` degrees: forward is (-sin, -cos). */
function yawFacing(nx: number, nz: number): number {
  return (Math.atan2(nx, nz) * 180) / Math.PI;
}

/** The mover's forward and right on the ground at a yaw (`walk.ts`'s convention). */
function axes(yaw: number): { fx: number; fz: number; rx: number; rz: number } {
  const y = (yaw * Math.PI) / 180;
  return { fx: -Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: -Math.sin(y) };
}

/**
 * The traversal driver. `WalkMode` makes one per map (`setGround`) and hangs it on the mover (`Walker.driver`); the
 * page calls `action()` for the action button and reads `pose()`, `rootY()` and `yaw()` each frame.
 */
/** LATER 526: the `Traversal` fields a kept state leaves alone (`keep`): the grid, the ladders, the shapes, the listeners. */
const TRAVERSAL_KEPT_SHARED: ReadonlySet<string> = new Set(['grid', 'ladders', 'shapes', 'listeners']);

/** The kinds whose `step` takes the walker's tick whole (`Traversal.movesTick`, `owns`): not the dive's nor the hang-drop's fall. */
const TICK_KINDS: ReadonlySet<string> = new Set(['ladder', 'ladderSlide', 'hang', 'turn180']);

export class Traversal implements TraversalHooks {
  readonly ladders: Ladder[];
  readonly shapes = new TraversalShapes();
  private running: Running | null = null;
  private kind_: TraversalKind = 'none';
  private ladder: Ladder | null = null;
  /**
   * B-50: on a ladder, the actor's floor RECORD (`+0x400..+0x41c`; the point, its y `+0x404`): the last floor the probe
   * answered, seeded at the mount, refreshed each ladder tick and KEPT when the probe answers nothing (r0004
   * 0x5b63d0-0x5b6480; r0001 `FUN_005b0420` D:L467091-467103). Replaced whole, never written in place (LATER 526's keep).
   */
  private ladderFloor: readonly [number, number, number] | null = null;
  /** On a ladder: the cycle's phase in keys (0..16), kept from the climbed height. */
  private phase = 0;
  private slideVy = 0;
  /** The action button, pressed since the last tick; held now. */
  private actionPressed = false;
  private actionHeld = false;
  /** The "180"'s turn: the yaw it starts from, the angle, its clock; and the ladder it turns to. */
  private turn: { from: number; angle: number; time: number; seconds: number; ladder: Ladder } | null = null;
  private readonly listeners = new Set<(e: TraversalEvent) => void>();
  /** The yaw a move holds the body to, or null. */
  private lock: number | null = null;
  /** The water line over the feet (`actor+0xf88`), and whether the mover was in the air last tick. */
  private depth_ = 0;
  private ripple_: Ripple | null = null;
  /**
   * The dive under way: its saved velocity (`+0x1350`), its clock, the hidden timer (`+0xfac`, not drawn) and the timer's
   * speed (`+0x133c`, down; null before the hold's end seeds it).
   */
  private diving: {
    vx: number; vz: number; t: number; root: number; fall: number | null;
    /** The seam's root at the press (the stance's) and the cross-fade's clock: null before the first tick (weight 0). */
    from: number; fade: number | null;
  } | null = null;
  /**
   * DIVE-ROOT's F2: the dive's end blend, on the clock of the play the animator draws next (`DIVE_END_BLEND_READING`):
   * the root it fades from, its clock and length, that play's key (`diveEndPlay`), the root at the last tick's end
   * (`last`, what a new play freezes), whether the last tick's play is still to be read (`fresh`), that tick's turn
   * (`Walker.turn` not 0) and the stick's snap count it last saw.
   */
  private diveEnd: {
    from: number; t: number; seconds: number; key: string; last: number; fresh: boolean; turn: boolean; snaps: number;
  } | null = null;
  /** The walker the end blend reads its play off (`rootY` has none). */
  private endWalker: Walker | null = null;
  private wasAirborne = false;
  /** The jump down's clock, through its fall. */
  private dropTime = 0;
  /** The slide's clock, for its loop's key. */
  private slideTime = 0;
  /** The lean button held (-1 left, 1 right), the peek value it drives, the lean clip's clock and stance. */
  private leanSide: -1 | 0 | 1 = 0;
  private peekValue = 0;
  private leanTime = 0;
  private leanOn: { side: -1 | 1; stance: Stance } | null = null;
  /**
   * A peek a stance press popped (`stanceButton`): its side, stance and the lean clip's clock, kept for the re-peek the
   * next tick (`PEEK_REPUSH_KEY_READING`); `wait` while the press's own tick has not run.
   */
  private popped: { side: -1 | 1; stance: Stance; time: number; wait: boolean } | null = null;
  /** The climbable wall last touched (`actor+0x1090`), the plan a press would run, and the one running. */
  private contact: ClimbContact | null = null;
  private plan: ClimbPlan | null = null;
  /**
   * LC-1: the ladder the contact offers (`FUN_005b3ce0(a, 2)`, action 2 CLIMB), mounted only on the action press (`step`):
   * which ladder, and from which end (the tall quad its foot, the short its head) and facing.
   */
  private ladderOffer: { ladder: Ladder; tall: boolean; facing: number; front: number } | null = null;
  /**
   * R4P-243 (ATLAS L367; `climbOffered`'s `handRefuses`): whether an equipment item is in hand that the kit's
   * selectability refuses (`./equipment` `slotSelectable`, the twin of r0004's isSelectableItem 0x5c47e0: an emptied
   * launcher, the Detonator with no claymore down) -- the climb, the step-up and the ladder are not offered then. Set
   * by the mover's owner (the page's walk, the room); null: an empty hand, nothing refused.
   */
  handRefusesClimb: (() => boolean) | null = null;
  /**
   * The climb under way. `over` (LATER 1222, the climb over only): its carried vertical, once a game frame (`OverCarry`) --
   * `climbClip` lays it, `overFrame` steps it, `climbSettle` and the hand-off read it. *Was* (LATER 278): `overPick`, a
   * second `ClipPath` the end's floor pick started from.
   */
  private climbing: { plan: ClimbPlan; crouched: boolean; request: Stance | null; over?: OverCarry } | null = null;
  /** The hang's root over the feet: where "Stand -> Hang" left the body, the steer's lift in it (`climbClip`). */
  private hangRoot: number | null = null;

  constructor(readonly grid: Grid, polys: readonly WorldPoly[]) {
    // MAP-02 (`./worldState`): read once, not against `Grid.revision` -- no ladder's node is switched by the world's
    // state on the maps in play (sprint 26 switches arches, barriers and panes); one that is would need the gate here.
    this.ladders = findLadders(polys, grid);
  }

  /** The clips (`PlayData`), for the moves' paths: their roots replace the fallback shapes. */
  setClips(clips: Iterable<MotionClip>, table: MotionTable | null): void {
    this.shapes.set(clips, table);
  }

  /** Listens for the moves' events (the audio's hook); returns the unsubscribe. */
  on(listener: (e: TraversalEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: TraversalEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** The action button (research 86 section 5): on a ladder the slide; taken on the next tick. */
  action(): void {
    this.actionPressed = true;
  }

  /**
   * The action button held (the pad's Cross, the keyboard's X): `FUN_00582540` reads input slot 0 ("Action",
   * `PTR_s_Action_003f2be0`) in state 2, held, for the slide from a ladder's head.
   */
  holdAction(on: boolean): void {
    this.actionHeld = on;
  }

  /**
   * The jump button while a move holds the mover (`WalkMode.jump`): hanging, the jump latch drops the SEAL
   * (`FUN_00581dc0(a, -1)`, decomp 418136-418138). True when it did something.
   */
  jump(w: Walker): boolean {
    if (this.kind_ !== 'hang') return false;
    this.hangDown(w);
    return true;
  }

  /**
   * A stance button while a move holds the mover or the peek holds (`WalkMode.setStance`, `MoverSim.stance`): hanging,
   * standing climbs up and crouch or prone let go (`FUN_00581ed0`, decomp 442695-442732, 418877-418906); peeking, the
   * press pops the peek, plays no transition and keeps the stance (`PEEK_STANCE_ENDS_PEEK_READING`), and clears the
   * lean's read (`+0x375 = 2`): the caller reads the d-pad after it (D:L453431-453458). True when it did something.
   */
  stanceButton(w: Walker, stance: Stance): boolean {
    // NU-1b B3 (CLIMB_PENDING_STANCE_READING): under a climb's one-shot the press is the mover's request, kept to the end.
    if (CLIMB_PENDING_STANCE_READING === 'kept' && this.climbOneShot() && !this.standToHang()) {
      if (this.climbing) this.climbing.request = stance;            // `actor+0x374` whole, against the base the end reveals
      w.changeStance(stance);
      return true;
    }
    if (PEEK_STANCE_ENDS_PEEK_READING && this.leanOn && this.kind_ === 'none') {
      this.popped = { side: this.leanOn.side, stance: this.leanOn.stance, time: this.leanTime, wait: true };
      this.leanOn = null;
      this.leanSide = 0;
      return true;
    }
    // MOVE-2 S3 (SEPARATE only, OT.R93; research 80 section 6g): the dive's one-shot fails `FUN_00552ec0`'s outer gate
    // (D:L418927-418930), so a press under it is the request alone (`actor+0x374`, `FUN_00594cf0` D:L453360-453425),
    // asked once the dive ends (`Walker.retryStance`): from the prone word a crouch plays 0x12 then 0x13 reversed
    // (`FUN_00581990` -> `FUN_005817d0` D:L442516-442518). Not through `topOneShot`: `cancelDive` stays COMBINED's.
    if (this.inDive() && w.stanceSeparate) {
      w.requestStance(stance);
      return true;
    }
    if (this.kind_ !== 'hang') return false;
    if (stance === 'stand') this.hangUp(w);
    else this.hangDown(w);
    return true;
  }

  /** Whether a move owns the mover. */
  get active(): boolean {
    return this.kind_ !== 'none';
  }

  /** `TraversalHooks.busy`: a move holds the mover (no jump, no stance change). */
  busy(): boolean {
    return this.active;
  }

  state(): TraversalState {
    const r = this.running;
    return { kind: this.kind_, ladder: this.ladder?.path ?? null, clip: r?.clip ?? (this.kind_ === 'ladder' ? TRAVERSAL_CLIP.ladder : null), key: r ? this.key(r) : this.phase };
  }

  /** The yaw the body is held to while a move runs (a ladder faces its rungs), or null. */
  yaw(): number | null {
    return this.lock;
  }

  /** The animator's clip (the seam in `./animator`), or null when the walk's own picker plays. */
  pose(): TraversalPose | null {
    const r = this.running;
    if (r) {
      const p = r.path.at(r.time);
      return { clip: r.clip, frame: this.key(r), loop: false, rootY: this.drawnRoot(r, p), ...(r.blend ? { blend: r.blend } : {}) };
    }
    if (this.kind_ === 'ladder') return { clip: TRAVERSAL_CLIP.ladder, frame: this.phase, loop: true, rootY: this.ladderRoot() };
    if (this.kind_ === 'hang') return { clip: TRAVERSAL_CLIP.hang, frame: 0, loop: true, rootY: this.hangRootY() };
    if (this.kind_ === 'turn180' && this.turn) {
      const shape = this.shapes.get(TRAVERSAL_CLIP.turn180);
      // The yaw turns by code (`+0x48`, decomp 468245-468252), so the clip's own root turn is held at its key 0.
      return { clip: TRAVERSAL_CLIP.turn180, frame: Math.min(shape.keys - 1, (this.turn.time / this.turn.seconds) * (shape.keys - 1)), loop: false, rootY: null, holdRootTurn: true };
    }
    if (this.kind_ === 'dive' && this.diving) {
      // DIVE-ROOT: the clip draws its own root (null), cross-faded in over its BlendTime; the timer is not drawn.
      const shape = this.shapes.get(TRAVERSAL_CLIP.dive);
      return { clip: TRAVERSAL_CLIP.dive, frame: Math.min(shape.keys - 1, (this.diving.t / shape.seconds) * (shape.keys - 1)), loop: false, rootY: null };
    }
    if (this.kind_ === 'hangDropFall') {
      const shape = this.shapes.get(TRAVERSAL_CLIP.hangDown);
      return { clip: TRAVERSAL_CLIP.hangDown, frame: Math.min(shape.keys - 1, (this.dropTime / shape.seconds) * (shape.keys - 1)), loop: false, rootY: null };
    }
    if (this.kind_ === 'ladderSlide') {
      const shape = this.shapes.get(TRAVERSAL_CLIP.slide);
      return { clip: TRAVERSAL_CLIP.slide, frame: (this.slideTime / shape.seconds) * shape.keys, loop: true, rootY: SLIDE_ROOT };
    }
    // A peek a stance press popped is drawn at its held key until the re-peek or its refusal (PEEK_REPUSH_KEY_READING).
    const lean = this.leanOn ?? this.popped, time = this.leanOn ? this.leanTime : this.popped?.time ?? 0;
    if (lean) {
      const clip = leanClip(lean.stance, lean.side), shape = this.shapes.get(clip);
      return { clip, frame: Math.min(shape.keys - 1, (time / shape.seconds) * (shape.keys - 1)), loop: false, rootY: null };
    }
    return null;
  }

  /**
   * `TraversalHooks.clip` (PF-17, `./net/fireCapability`): the clip `pose` plays, its phase -- the key over the clip's
   * key count n, a loop's within its cycle: key k at k / n, the stack's phase on the mover's own clock
   * (`NOFIRE_PHASE_READING`; `key` already runs from the end when the move plays backwards, (n - 1) / n down to 0) --
   * whether it plays backwards, and whether the move's actor state is one the fire's gate refuses outright
   * (`NOFIRE_STATE_READING`). Null when no move's clip plays.
   */
  clip(): { clip: string; phase: number; reversed: boolean; stateRefused: boolean } | null {
    const p = this.pose();
    if (!p) return null;
    const keys = this.shapes.get(p.clip).keys;
    const phase = p.loop ? (((p.frame / keys) % 1) + 1) % 1 : keys > 0 ? Math.max(0, Math.min((keys - 1) / keys, p.frame / keys)) : 0;
    return { clip: p.clip, phase, reversed: this.running?.reverse ?? false, stateRefused: NOFIRE_STATE_READING.includes(this.kind_) };
  }

  /** The lean buttons, held (research 86 section 4): -1 left, 1 right, 0 neither. */
  lean(side: -1 | 0 | 1): void {
    this.leanSide = side;
  }

  /** MULTIPLAYER: the lean buttons as last held (what the command carries), and the action button held. */
  leanHeld(): -1 | 0 | 1 {
    return this.leanSide;
  }

  actionHeldNow(): boolean {
    return this.actionHeld;
  }

  /**
   * `TickDriver.owns` (rounds 3-4 of NET-FIX2's review, research 223 s6): whether `step` takes the walker's tick now with
   * the stick at rest and no press -- the same tests, shared (`movesTick`, `peekHeld`): a climb running, a move that
   * holds the tick (not the hang-drop's fall, whose tick is the walker's), the dive unless it ends off an edge, the peek
   * held (or the stance press's held tick). A ladder touched or a climb started need a stick or a press: never here.
   */
  owns(w: Walker): boolean {
    if (this.movesTick()) return true;
    if (this.kind_ === 'dive') return !w.airborne;
    if (this.kind_ === 'hangDropFall') return false;             // `dropping`: the walker's own tick
    return this.popped?.wait === true || (this.leanOn !== null && this.peekHeld(w));
  }

  /** `step`'s moves that take the tick whole: a climb running, the ladder, its slide, the align, the hang, the turn. */
  private movesTick(): boolean {
    return this.running !== null || TICK_KINDS.has(this.kind_);
  }

  /**
   * The peek held this tick (`leanTick`, 469347-469353; state 3 too while nothing but the kit's one-shot is over it).
   * R4P-108: a crouched body in water deeper than `PEEK_WATER_DEPTH_READING` is refused, every tick (the side ray's,
   * r0004 0x59c800 / r0001 `FUN_00596d60`, asked each frame the lean is held), so a held peek ends as the water rises.
   */
  private peekHeld(w: Walker): boolean {
    const cont = this.leanOn !== null && w.action === null;
    const drowned = w.posture === 'crouch' && this.depth_ > PEEK_WATER_DEPTH_READING;
    return this.leanSide !== 0 && !w.airborne && !w.dead && !w.leanRefused() && !drowned
      && (cont || (w.holding === null && w.actionInterruptible()));
  }

  /** The peek held (state 3): -1 left, 1 right, 0 none (`TraversalHooks.peeking`). */
  peeking(): -1 | 0 | 1 {
    return this.leanOn ? this.leanOn.side : 0;
  }

  /**
   * `TraversalHooks.leanClipOn`: the peek's lean clip pushed and playing (`FUN_0057d810`, 440451-440530) -- what
   * `GetThrowAnim` (D:L441773-441796) asks beside state 3 for the lean's toss (`./grenade`).
   */
  leanClipOn(): boolean {
    return this.leanOn !== null;
  }

  /**
   * `TickDriver.topOneShot`: the peek's lean clip is the stack's top while the peek holds -- `FUN_0057d810` pushes it
   * (440451-440530), held on its last key, a one-shot (not looped in `motion.rdr`, research 86 section 1) -- so
   * `FUN_0057e1b0` (440776-440867: `FUN_005551a0(top+0x28, 0x40)`) refuses the jump then (`Walker.jump`; review 4).
   */
  topOneShot(): boolean {
    return this.leanOn !== null || this.climbOneShot();
  }

  /**
   * NU-1b B3: a climb's one-shot on top -- the climb's clip from the press (NU-1c B10: no align before it; was: the align
   * too, the port's stand-in for the clip's first frames), `Hang -> Climb` -- not the hang's loop, nor the ladder's moves.
   */
  private climbOneShot(): boolean {
    return this.running !== null && (this.running.kind === 'climb' || this.running.kind === 'hangUp');
  }

  /** NU-1b: `Stand -> Hang` on top: the hang's push, not this row's for the stance (D16). */
  private standToHang(): boolean {
    return this.climbing?.plan.kind === 'high' && this.running?.kind === 'climb';
  }

  /** The camera's peek value, `DAT_004161c0` (`FUN_002998f0`, decomp 141960-141976). */
  peek(): number {
    return this.peekValue;
  }

  /**
   * `FUN_002998f0` (decomp 141962-141976): the peek value eases to its target (`easePeek`, below); the target is the
   * peek's side (-1 left, 1 right) while peeking, whatever the stance, and 0 otherwise.
   */
  private easePeek(dt: number): void {
    const target = (this.leanOn ?? this.popped)?.side ?? 0;    // the press's tick keeps the side (PEEK_REPUSH_KEY_READING)
    this.peekValue = easePeek(this.peekValue, target, dt);
  }

  /**
   * The peek (state 3, research 86 section 4): `FUN_00594cf0` (decomp 453431-453457) reads the d-pad's right and left
   * as held buttons, and never for the dead (`seal+0x174 != 8`, 453432); `FUN_00550ef0` runs `FUN_0057d810` only while
   * the stack's top is not in state 8 (418606-418611). `FUN_005b4340(seal, 1)` (469321-469353), re-run every frame the
   * button is held (453938), takes it from a SEAL in states 0-3 not carrying (`+0xeac`, 469340; research 80), on the
   * ground (`0x105e` bit 5, 469347), not in a jump or a landing clip (ids 8/9 `FUN_00587f50`, 10/11 `FUN_00587f10`,
   * 469348-469349, and "Jump" `DAT_003deae8`, 469353: `FUN_00577e40` on the top clip's id, 437396-437411; the landing
   * pushes 10 or 11, `FUN_005af590` 466663-466694; research 80 section 1) -- `Walker.leanRefused`. Outside state 3 the
   * action on top must also give way (`FUN_00587c20`, `Walker.actionInterruptible`: never a knock's fall or a death
   * landing), and the web's kit one-shot (`w.holding`, `HOLD_CLIPS`: a throw, the claymore, a still reload, each pushed
   * on the stack itself, 441900-441903 and 462786-462930) refuses the start as an action not yet given way. A SEAL
   * already peeking skips that test (`state == 3 ||`, 469345): a hold taken from the peek -- the lean's own toss,
   * `seal_toss_rlean` / `llean` (research 86 section 4.4: "the throw leaves the peek as it is") -- leaves the peek held
   * and so does a reload, still or not (`PEEK_HOLD_CONTINUES_READING`: `FUN_005a82e0` D:L462925-462928 pops nothing in
   * state 3). Only that test is skipped: the ground, the
   * jump and the landing tests (469347-469353) follow it and run in state 3 as well, every tick the lean is held. A
   * stance press ends the peek with no transition, the stance kept (`PEEK_STANCE_ENDS_PEEK_READING`, `stanceButton`),
   * the held lean peeking again the next tick from its held key (`PEEK_REPUSH_KEY_READING`); a jump press is
   * refused while the lean clip is on top (`topOneShot`, `FUN_0057e1b0`'s looped test). Then still, with room to the side
   * (`FUN_00596d60`: a ray 9.5 to the right, 7.8375 to the left, at the root's height up to 8). `FUN_0057d810`
   * (440451-440530) plays the stance's lean clip, held on its last key, over the action (`PEEK_CUTS_ACTION_READING`).
   * While it holds, no locomotion runs (`FUN_005870e0`: `case 3: break`). True while peeking: the mover stays put.
   * Refused, the tick falls through to the mover, whose action clock runs.
   */
  private leanTick(w: Walker, input: WalkInput, dt: number): boolean {
    const stance = w.posture;
    // A stance press popped the peek (stanceButton): its own tick takes no lean; the next re-peeks from the held key
    // if the d-pad is still held to the same side (PEEK_REPUSH_KEY_READING).
    const popped = this.popped;
    if (popped && (this.leanSide !== popped.side || popped.stance !== stance)) this.popped = null;
    else if (popped?.wait) {                                     // the press's tick: held as the peek holds it
      popped.wait = false;
      const s = w.state;
      s.vx = 0; s.vz = 0; s.stickForward = 0; s.stickRight = 0;
      w.runHold(dt);
      return true;
    }
    // State 3: 469345 skips FUN_00587c20 and the hold -- while nothing but the kit's one-shot sits over the lean (an
    // action pushed mid-peek has left state 3). The test is `peekHeld`'s, shared with `owns`.
    if (!this.peekHeld(w)) { this.leanOn = null; this.popped = null; return false; }
    const side = this.leanSide as -1 | 1;
    if (this.leanOn && this.leanOn.side === side && this.leanOn.stance === stance) {
      // The side ray every frame the lean is held: the controller's update `FUN_00594cf0` asks `FUN_00596d60` (9.5
      // one side, ~7.83 the other) each frame the lean input is past 0.03, and a blocked ray ends the peek through
      // `FUN_0057dc80` (D:L453432-453457; #479's takeover, re-read at the source). Was: asked only when the peek
      // started, so a held peek turned into b1_wc05 left the camera in the room.
      if (!this.sideClear(w, side)) { this.leanOn = null; return false; }
      this.leanTime += dt;
    } else {
      const still = Math.abs(input.forward) <= DEAD && Math.abs(input.right) <= DEAD;
      const resume = this.popped;
      this.popped = null;
      if (!this.leanOn && !resume && !still) return false;    // a peek starts from a SEAL standing still (a re-push not)
      if (!this.sideClear(w, side)) { this.leanOn = null; return false; }
      if (PEEK_CUTS_ACTION_READING) w.yieldAction();
      this.leanOn = { side, stance: w.posture };                  // a get-up the peek cut has stood the SEAL
      this.leanTime = PEEK_REPUSH_KEY_READING === 'held' && resume ? resume.time : 0;
    }
    const s = w.state;
    s.vx = 0; s.vz = 0; s.stickForward = 0; s.stickRight = 0;
    w.runHold(dt);                                                // a toss from the peek plays out over it (section 4.4)
    return true;
  }

  /** `FUN_00596d60`: the side ray -- 9.5 to the right (`0x41180000`), 7.8375 to the left, at min(8, the root). */
  private sideClear(w: Walker, side: -1 | 1): boolean {
    const s = w.state, a = axes(s.yaw);
    const y = s.y + Math.min(PEEK_RAY_TOP, stanceRootY(w.posture));
    const reach = side > 0 ? PEEK_RIGHT : PEEK_LEFT;
    const to: [number, number, number] = [s.x + a.rx * reach * side, y, s.z + a.rz * reach * side];
    return segmentHits(this.grid, [s.x, y, s.z], to, isMoveSurface).length === 0;
  }

  /** The root's height over the feet the camera should stand on while a move runs, or null for the stance's. */
  rootY(): number | null {
    const pose = this.pose();
    // DIVE-ROOT: the dive's is the root drawn -- the clip's own at the drawn key, cross-faded in from the press and out
    // into the prone base at rest as the animator does it (review F2) -- so the camera, the shot and the hit volume
    // follow the drawn body.
    if (pose && this.kind_ === 'dive' && this.diving) return this.diveRoot(this.diving);
    if (!pose && this.diveEnd) {
      // The third review's F2: a read changes nothing -- the play is settled at the next tick's start whoever reads.
      const e = this.endWalker ? this.settled(this.diveEnd, this.endWalker) : this.diveEnd;
      return e ? this.diveEndRoot(e) : null;
    }
    return pose ? pose.rootY : null;
  }

  /**
   * The dive's drawn root (F2): `seal_dive2prone`'s root at its key, cross-faded in over its `BlendTime` from the seam's
   * root at the press with the animator's weight (`blendWeight`; the first frame at 0, `Animator.start`). The animator
   * fades from the pose it drew, the run's; the seam from the stance's root, which is what it held for the run.
   */
  private diveRoot(d: { t: number; from: number; fade: number | null }): number {
    const shape = this.shapes.get(TRAVERSAL_CLIP.dive);
    const clip = rootAt(shape, Math.min(shape.keys - 1, (d.t / shape.seconds) * (shape.keys - 1)))[1];
    if (d.fade === null) return d.from;
    const seconds = this.shapes.blendTime(TRAVERSAL_CLIP.dive);
    return d.from + (clip - d.from) * blendWeight(seconds > 0 ? d.fade / seconds : 1);
  }

  private key(r: Running): number {
    const shape = r.path.shape;
    const k = Math.min(shape.keys - 1, (r.time / shape.seconds) * (shape.keys - 1));
    return r.reverse ? shape.keys - 1 - k : k;
  }

  /** The hang's root over the feet: "Stand -> Hang"'s end, else "Hang -> Climb"'s key 0. */
  private hangRootY(): number {
    return this.hangRoot ?? rootAt(this.shapes.get(TRAVERSAL_CLIP.hangUp), 0)[1];
  }

  /**
   * The climb's vertical steer (`FUN_005b3340`, the vertical kept, D:L468933-468941; `ClipPath`'s `lift`, closed by
   * `CLIMB_STEER_READING`'s weight): the ledge's top (the contact polygon's, no `FOOT_STEP_OFFSET`: `FUN_005b1a10` takes
   * the top point's y, 467887) less where the clip puts it over the feet at `y` -- the root the steer reads (`STEER_ROOT`)
   * plus the clip's `refPt` y (the blend's weighed).
   */
  private lift(plan: ClimbPlan, y: number): number {
    return plan.contact.top - (y + STEER_ROOT + this.refUp(plan));
  }

  /** The stored `refPt`'s y (`REF_UP`; the crate/medium blend's weighed, D:L467914-467919). */
  private refUp(plan: ClimbPlan): number {
    return plan.blend
      ? plan.blend.weight * (REF_UP[plan.clip] ?? 0) + (1 - plan.blend.weight) * (REF_UP[plan.blend.clip] ?? 0)
      : REF_UP[plan.clip] ?? 0;
  }

  /** The climb's root over the feet: the cycle's key-0 root, its rise carried by the feet. */
  private ladderRoot(): number {
    return rootAt(this.shapes.get(TRAVERSAL_CLIP.ladder), 0)[1];
  }

  // ---- the tick ----

  /** Normal AI contact dispatch: FUN_0057f2a0 D:L441293-441311 and FUN_005b4b40
   * D:L469655-469662. Caller supplies the original six-clip availability gate (research334).
   * Ladders require mode7/reservation and are not started by this normal-mode entry. */
  tickAi(w: Walker, input: WalkInput, dt: number = TICK): boolean {
    w.captureMoveInput(input);
    if (this.active) return this.tick(w, input, dt);
    const s = w.state, a = axes(s.yaw), hits = w.wallHits();
    const touched = contactFromHits(hits, s.x, s.z);
    if (touched) this.contact = cornerDrop(hits, touched, s.x, s.z) ? null : touched;
    if (this.contact && !contactHolds(this.contact, s.x, s.z, a.fx, a.fz)) this.contact = null;
    const plan = this.contact && CLIMBABLE.has(this.contact.app)
      ? planClimb(this.grid, this.contact, s.x, s.y, s.z, a.fx, a.fz) : null;
    if (!plan) return false;
    // DG-GUARD (OWNER): the same floorless step-up refused for an AI body (a following hostage) as for a seat's.
    if (STEP_UP_FLOOR_GUARD_OWNER && plan.automatic && stepUpEndFloor(this.grid, this.shapes, plan) === null) return false;
    this.startClimb(w, plan);
    return true;
  }

  tick(w: Walker, input: WalkInput, dt: number = TICK): boolean {
    this.diveEndTick(w, dt);
    const owned = this.step(w, input, dt);
    this.easePeek(dt);                                           // the camera's, after the actor's tick
    return owned;
  }

  private step(w: Walker, input: WalkInput, dt: number): boolean {
    const pressed = this.actionPressed;
    this.actionPressed = false;
    this.water(w);
    // NoFire common-action gate during a dance. Keep water/peek bookkeeping and consume old presses.
    if (w.victoryMotion) { this.ladderOffer = null; return false; }
    if (this.kind_ !== 'none' || this.running) this.ladderOffer = null;
    if (this.running) return this.advance(w, dt);
    switch (this.kind_) {
      case 'ladder': this.climbLadder(w, input, dt, pressed); return true;
      case 'ladderSlide': this.slide(w, dt); return true;
      case 'hang': this.hang(w, input, pressed); return true;
      case 'turn180': this.turning(w, dt); return true;
      case 'dive': return this.diveTick(w, dt);
      case 'hangDropFall': this.dropping(w, dt); return false;
      default: break;
    }
    if (this.leanTick(w, input, dt)) return true;
    // LC-1: the ladder is offered from its contact (CLIMB) and mounted only on the action press -- `FUN_00550ef0` calls the
    // mount `FUN_005b4b40` only under the controller's one-frame bit +0x170 0x4 (D:L418120-418155), set by `FUN_00592d50`
    // on the Action release with CLIMB selected (D:L452181-452183). The step-up below stays automatic (its own plan).
    this.ladderOffer = w.airborne ? null : this.offerLadder(w);
    if (this.ladderOffer && pressed && this.mountOffered(w, this.ladderOffer)) return true;
    this.keepContact(w);
    const plan = this.plan;
    // R4P-243 (L373): r0004's `FUN_0058d580` -- no step-up under `Jump launch` or `Jump fall`, airborne or not (D4:L510630).
    const jumpBlend = w.action?.name === 'launch' || w.action?.name === 'fall';
    const stepUp = plan?.automatic === true && !(AIR_STEP_UP_READING === 'not-in-jump-blend' && jumpBlend)
      && (CLIMB_STEP_UP_STICK_READING === 'none' || this.pushing(w, input, plan.contact));
    // DG-GUARD (OWNER): a floorless step-up plan starts neither by itself nor on a press (DG-GUARD-AFTER-PC4's hole: the
    // press started it from `pressed`).
    const floorless = STEP_UP_FLOOR_GUARD_OWNER && plan?.automatic === true && stepUpEndFloor(this.grid, this.shapes, plan) === null;
    if (plan && !floorless && (pressed || stepUp)) { this.startClimb(w, plan); return true; }
    return false;
  }

  // ---- the water (research 86 section 5) ----

  /** The water over the feet, units (`actor+0xf88`), 0 out of it. */
  depth(): number {
    return this.depth_;
  }

  /** The ripple the water line asks for this tick (`FUN_005b52b0`), or null: the page's effects spawn it. */
  ripple(): Ripple | null {
    return this.ripple_;
  }

  /**
   * `FUN_005b56c0` (469966-470138) on the stick: each axis pushed past 0.03 by the ground's uphill factor -- `d` the
   * floor's normal against the axis's way (its negative for a negative push): `1 - d^2` for `d < 0` (uphill), 1 for
   * `d >= 0` -- then, in water, the water's factor (`stickFactor`). Grounded only (the walk calls it so).
   */
  stickScale(w: Walker, forward: number, right: number): [number, number] {
    const s = w.state, a = axes(s.yaw);
    const n = probeFloor(this.grid, s.x, s.y, s.z)?.normal;
    const uphill = (v: number, ax: number, az: number): number => {
      if (!n || Math.abs(v) < DEAD) return v;
      const d = Math.sign(v) * (n[0] * ax + n[2] * az);
      return d >= 0 ? v : d <= -1 ? 0 : v * (1 - d * d);
    };
    const f = this.stickFactor(w);
    return [uphill(forward, a.fx, a.fz) * f, uphill(right, a.rx, a.rz) * f];
  }

  /** LATER 434: the ground states' memory (`+0x105e` 0x08 / 0x10), as `crawlFrame` reads it; none at the start. */
  private ground: GroundMemory = 0;

  /**
   * `FUN_005b52b0` (469852): the depth, the water line over the feet, from the water surface over them
   * (`probeWater`); on entering and leaving, `waterEnter` / `waterLeave`, and a fall landing in it `waterLand`
   * (`seal_fall_in_water`, 469892-469896). `FUN_005b56c0`'s stances: prone only to 2 deep (`FUN_00581660`), crouched
   * only to 8.5 (`FUN_00581990`); deeper, the SEAL is stood up a stance.
   */
  private water(w: Walker): void {
    const s = w.state;
    const line = probeWater(this.grid, s.x, s.z).find((y) => y >= s.y) ?? null;
    const depth = line === null ? 0 : line - s.y;
    const was = this.depth_;
    this.depth_ = depth;
    const at: [number, number, number] = [s.x, line ?? s.y, s.z];
    if (depth > 0 && was <= 0) this.emit(w.airborne || this.wasAirborne ? { type: 'waterLand', depth, at } : { type: 'waterEnter', depth });
    if (depth <= 0 && was > 0) this.emit({ type: 'waterLeave' });
    this.wasAirborne = w.airborne;
    // `FUN_005b52b0` (469810-469920): the ripple by the water line against the body's box (`rippleOf`).
    this.ripple_ = rippleOf(line, s.y, w.posture, [s.vx, s.vy, s.vz], at);
    if (w.airborne || this.kind_ !== 'none') return;
    // LATER 434: each demotion raises the stance word's bit -- prone over 2 deep is the prone state's own
    // (`FUN_005845c0` D:L443869: `+0x374` = 1 and `+0x105f` bit 0, then `FUN_00581990`, whose else over 8.5 deep writes
    // the stand and the bit, D:L442580), and a SEAL already crouched past 8.5 is the crouch state's (`FUN_00584c60`
    // D:L444087: `+0x374` = 0 and the bit).
    if (w.stance === 'prone' && depth > WATER_PRONE) { w.stance = 'crouch'; w.markStanceTaken(); }
    // LATER 434 (434b's review and re-looks): the prone state's frame (`FUN_005845c0`) -- the crawl when `FUN_00586f00`
    // answers 0 (`crawlFrame`, by the memory), setting 0x08 and clearing 0x10 (D:L443902-443903) and, over 1.5 deep,
    // the crawl handler `FUN_00583500` crouching the SEAL with its word (D:L443490: `+0x374` = 1, the bit,
    // `FUN_00581990`); else a turn past 0.025 sets 0x10 and clears 0x08 (D:L443930-443931), and idle clears both
    // (D:L443967-443968). The crouch state (`FUN_00584c60`) the same by `FUN_00586f00`: 0x08 (D:L444142-444143), its turn
    // 0x10 (D:L444196, D:L444231-444232), idle both cleared (D:L444322-444323); the stand state (`FUN_00586570`) by its
    // own test (`standFrame`): 0x08 (D:L444887-444888, D:L444914-444915, D:L444939-444940), a turn `FUN_00586050` 0x10
    // (D:L444696-444697), idle `FUN_00586240` both cleared (D:L444783-444788). Every frame: STANCE_MEMORY_RETURNS_READING.
    const stick = w.cutStick, turn = w.turn / SEAL_TUNING.turnMaxRate;
    const moving = w.stance === 'stand'
      ? standFrame(stick.right, stick.forward, turn, this.ground)
      : crawlFrame(stick.right, stick.forward, turn, this.ground);
    this.ground = moving ? 0x08 : Math.abs(turn) > PRONE_TURN ? 0x10 : 0;
    if (moving && w.stance === 'prone' && depth > WATER_CRAWL) { w.stance = 'crouch'; w.markStanceTaken(); }
    if (w.stance === 'crouch' && depth > WATER_CROUCH) { w.stance = 'stand'; w.markStanceTaken(); }
  }

  /**
   * LATER 492: what the water allows the local stance press (`FUN_005857e0`: crouch, water no deeper than 8.5,
   * D:L444334-444355; `FUN_00584c10`: prone, no deeper than 2, D:L444022-444031) -- in the water (`actor+0x105e` bit 7)
   * over the feet where they stand now. The set's clip tests of `FUN_005857e0` (types 0x12, 0x54; the launcher's set
   * always allowed) hold on the SEAL's set and are not asked.
   */
  stanceAllows(w: Walker): { crouch: boolean; prone: boolean } {
    const s = w.state;
    const line = probeWater(this.grid, s.x, s.z).find((y) => y >= s.y) ?? null;
    const depth = line === null ? 0 : line - s.y;
    return { crouch: !(depth > WATER_CROUCH), prone: !(depth > WATER_PRONE) };
  }

  /**
   * The stance press in water (`FUN_00552d60` hands a request to `FUN_00581660` for prone, `FUN_00581990` for crouch;
   * decomp 418866-418900, 442436-442600): in the water (`actor+0x105e` bit 7) over 2 deep (`actor+0xf88`) the prone
   * request is rewritten to crouch (`actor+0x374 = 1`) and `FUN_00581990` runs instead, which over 8.5 deep rewrites
   * it to stand (`+0x374 = 0`) and runs `FUN_00581c10`. Those are reached only once `FUN_00552ec0` accepts the request,
   * and for a local SEAL it refuses both deep requests (D:L418945-418946 via `FUN_00584c10`, the 2.0 test;
   * D:L418973-418974 via `FUN_005857e0`, the 8.5 test): the local press resolves the water in its own table
   * (`FUN_00594cf0`, the tap D:L453358-453369, the hold D:L453393-453416) -- ported in `./stanceButton` `pressInWater`
   * (LATER 492), so the page's own press never asks a deep request. This rewrite is a remote actor's (the room's
   * command: the host's `CRemoteCtrl` is not local, D:L418943) and the page's fallback for a request the table did not
   * make. No slope is read (issue #22's spawns are under water, not steep).
   * The depth is the water over the feet where they stand now.
   */
  stanceFor(w: Walker, stance: Stance): Stance {
    const s = w.state;
    const line = probeWater(this.grid, s.x, s.z).find((y) => y >= s.y) ?? null;
    const depth = line === null ? 0 : line - s.y;
    if (stance === 'prone' && depth > WATER_PRONE) stance = 'crouch';
    if (stance === 'crouch' && depth > WATER_CROUCH) stance = 'stand';
    return stance;
  }

  /**
   * `FUN_005b56c0` (469966-469975): the stick's factor in water, `clamp(1 - depth x water_factor_slope,
   * min_water_factor, 1)` -- `dynamics.rdr`'s 0.05 and 0.75, so 0.75 from 5 deep -- standing and crouched: its callers
   * are the crouch state (D:L444163, D:L444173) and the stand state (D:L444865) only, the ground states' dispatch
   * `FUN_005870e0` D:L445163-445172; the prone state never asks it, so prone the factor is 1 (434b's re-look, F2; over 1.5
   * deep a prone crawl is crouched instead, `Traversal.water`). The walk's seam (`Walker.driver.stickFactor`).
   */
  stickFactor(w: Walker): number {
    const d = this.depth_;
    if (d <= 0) return 1;
    if (w.stance === 'prone') return 1;                         // FUN_005b56c0 not on the prone state's path
    return Math.max(WATER_FLOOR, Math.min(1, 1 - d * WATER_SLOPE));
  }

  // ---- the climb (research 86 section 3; the geometry in ./climb) ----

  /** The HUD's climb icon (`action_climb.tif`): shown while a press would climb, and which climb; null when not. */
  climbPrompt(): ClimbPrompt | null {
    if (this.kind_ !== 'none' || this.running) return null;
    if (this.ladderOffer) return { visible: true, kind: 'ladder', automatic: false };   // LC-1: a ladder's CLIMB, on the press
    const p = this.plan;
    return p ? { visible: true, kind: p.kind, automatic: p.automatic } : null;
  }

  /** Whether the stick pushes into the contact's wall (the step-up's, under `CLIMB_STEP_UP_STICK_READING` `'pushing'` only). */
  private pushing(w: Walker, input: WalkInput, c: ClimbContact): boolean {
    const a = axes(w.state.yaw);
    const mx = a.fx * input.forward + a.rx * input.right, mz = a.fz * input.forward + a.rz * input.right;
    return Math.hypot(mx, mz) > DEAD && mx * c.nx + mz * c.nz < 0;
  }

  /**
   * The contact (`FUN_005483d0`, `FUN_005b3890`): the best wall the last move's slide met (`Walker.wallHits`, PB-3b:
   * the move's own hit, research 281 s4.1) replaces it, climbable or not (PAR-21a C1; was: a climbable wall), and an
   * inside corner clears it (PAR-21a C2); it is dropped past 24, behind the face, or faced away from; then the plan a
   * press would run (none prone, `FUN_005b4340`), for a climbable contact only. [Named, not built (research 281 s4.1):
   * the original's drop check runs on a moving tick only (D:L413624, D:L413860); the port's every tick, as other
   * per-tick paths drop the contact too (`FUN_0054a3d0` D:L414380).]
   *
   * SEGMENT-BODY part 2 (`WALL_BODY_READING` 'segments'; research 86 s3.8): the original keeps one contact, `+0x1090`,
   * and the offer reads it (`FUN_005b3ce0` D:L469121-469127) -- so the offer reads the Walker's stored contact
   * (`Walker.storedContact`: the segment records' hit, its corner drop, and the weapon line's slot, `FUN_005483d0`
   * D:L413618-413671 and D:L413823-413901), its per-tick drop asked as before (`Walker.holdContact`), and the climb's
   * geometry taken at its point (`contactOf`). *Was:* a second contact of the port's own, from the walk's centre and
   * head-line hits (`contactFromHits`), which an oblique walk-in or a still body never formed. The disc arm keeps it.
   */
  private keepContact(w: Walker): void {
    const s = w.state, a = axes(s.yaw);
    if (WALL_BODY_READING === 'segments') {
      w.holdContact();
      const k = w.storedContact();
      this.contact = k ? contactOf(k.poly, k.poly.appflags ?? 0, s.x, s.z, [k.x, k.y, k.z]) : null;
    } else {
      const hits = w.wallHits();
      // PAR-21a C1: the move's best hit is stored, climbable or not (D:L413866); C2: a climbable one is cleared at once
      // when another hit of the move turns more than acos 0.9 from it (D:L413867-413901).
      const touched = contactFromHits(hits, s.x, s.z);
      if (touched) this.contact = cornerDrop(hits, touched, s.x, s.z) ? null : touched;
      if (this.contact && !contactHolds(this.contact, s.x, s.z, a.fx, a.fz)) this.contact = null;
    }
    // PAR-21a C1: the offer asks the stored contact's own appflags first (`FUN_005b3ce0` D:L469131-469132, per type), so
    // a plain wall's contact offers nothing and its obstacle ray is never cast (`FUN_0054e430`'s one caller, D:L469246).
    // [Named departure, research 281 s4.1 (PAR-21a F1): in the original the ray's hit IS stored -- `FUN_0054e430` calls
    // `FUN_005b0d30` at D:L416793 when its nearest hit is steep and not VOLUMETRIC or LIQUID (D:L416775-416791) and on
    // another collider than the stored one (the hit's `+0x1c` against `+0x10ac`, D:L416792). The port's ray serves this
    // offer only: stored, a plain wall behind a ledge would end a still body's offer, since the port's still body casts
    // nothing to re-hit the face, where the original's local still body casts along its facing (research 217 s2.1). It
    // closes with the segment records (PAR-21, `WALL_PROBE_READING`). Not modelled either: when the contact polygon
    // gives no top (`FUN_002dbfb0` returns 0) the original casts the ray at the head's height (the head node's y over the
    // feet), if the stored hit point lies under it less 0.1 (D:L416735-416743).] *Was:* `this.contact = obstacleRay(...)`.
    const offered = this.contact !== null && CLIMBABLE.has(this.contact.app);
    const c = offered ? obstacleRay(this.grid, this.contact!, s.x, s.y, s.z) ?? this.contact : null;   // FUN_0054e430
    // NU-1b B1: the offer's gates (CLIMB_OFFER_GATE_READING); none offered, the automatic step-up does not run either.
    this.plan = c && w.stance !== 'prone' && climbOffered(w, this.handRefusesClimb) ? planClimb(this.grid, c, s.x, s.y, s.z, a.fx, a.fz) : null;
  }

  /**
   * Starts a climb on the press's command: the clip pushed (`climbClip`, its first advance the next command) with its
   * steer recorded on it (`CLIMB_STEER_READING`, `FUN_005b1a10` D:L468504) -- the aligned start, `refPt.z` back from the
   * edge's target along the face's normal, the clip's track laid from there.
   */
  private startClimb(w: Walker, plan: ClimbPlan): void {
    const s = w.state, c = plan.contact;
    const back = REF_AHEAD[plan.clip] ?? 8.92;
    const aligned: [number, number, number] = [plan.target[0] + c.nx * back, s.y, plan.target[2] + c.nz * back];
    const crouched = w.stance === 'crouch';                      // the base the push keeps (CLIMB_CROUCH_END_READING)
    w.stance = 'stand';                                          // the clip plays in state 0 (D:L442225-442277)
    w.setAirborne(false);                                        // a jump-grab: the jump and its fall end here
    // NU-1b B3: the request the end asks (`actor+0x374`): crouch as the push writes it (D:L446244-446274), else none yet.
    const request: Stance | null = crouched && CLIMB_PENDING_STANCE_READING === 'kept' && CLIMB_CROUCH_END_READING.includes(plan.kind) ? 'crouch' : null;
    this.climbing = { plan, crouched, request };
    w.requestStance(request);                                    // a press under the climb toggles from it
    this.plan = null;
    this.lock = s.yaw;
    s.vx = 0; s.vz = 0; s.vy = 0;                                // FUN_005b4b40: the velocity zeroed (D:L469667-469674)
    this.emit({ type: 'climbStart', kind: plan.kind });
    this.climbClip(w, aligned);
  }

  /**
   * The climb's clip, its track laid from the aligned start `from` (`CLIMB_STEER_READING`): onto the top (or over, for
   * appflags 5), `climb_up` at 0.1; the steer's record on it, the body's offset from `from` open.
   */
  private climbClip(w: Walker, from: [number, number, number]): void {
    const k = this.climbing!, s = w.state, plan = k.plan, c = plan.contact;
    const shape = this.shapes.get(plan.clip);
    const travel = shapeTravel(shape);
    const ahead = (d: number): [number, number] => [from[0] - c.nx * d, from[2] - c.nz * d];
    const startRoot = stanceRootY(w.posture);
    const lift = this.lift(plan, from[1]);
    // LATER 1250 (CLIMB_STEER_TILT_READING): every climb kind's steer record keeps the contact's normal negated, whole
    // (`FUN_005b1a10` D:L467927-467932 for 0x21, `Climb medium`, `Step up` and 0x2a, D:L467888-467899), and the stored
    // `refPt` (x 0, its y `REF_UP`, its z `REF_AHEAD` back); the climb over's is its `OverCarry`'s (LATER 1244).
    const tri = plan.kind === 'over' ? null : firstTriangleNormal(c.poly.points);
    const steer = (): void => {
      const r = this.running!;
      const tilt: ClimbTilt | undefined = tri
        ? { normal: [-tri[0], -tri[1], -tri[2]], refX: 0, refY: this.refUp(plan), refZ: -(REF_AHEAD[plan.clip] ?? 8.92), v: 0 }
        : undefined;
      r.steer = CLIMB_STEER_READING === 'concurrent'
        ? { core: new OneShotSteer(r.path.seconds, r.path.shape.keys, plan.yaw), facing: plan.yaw, ex: from[0] - s.x, ez: from[2] - s.z, open: 1, lift, ...(tilt ? { tilt } : {}) }
        : null;
    };
    if (plan.kind === 'high') {
      // "Stand -> Hang": its share of the height (6.81 of the two clips' 29.4), the whoosh at 0.5. The body ends where
      // the clip and the steer put it -- the hands on the ledge -- and the hang holds it there (`hangRoot`; LATER 1250:
      // less the vertical the tilt left open, so the hang takes the root the clip's end drew).
      const hangUp = shapeTravel(this.shapes.get(TRAVERSAL_CLIP.hangUp));
      const share = travel.rise / (travel.rise + hangUp.rise);
      const [x, z] = ahead(travel.ahead);
      const top = from[1] + plan.h * share;
      this.hangRoot = from[1] + startRoot + travel.rise + lift - top;
      const path = new ClipPath(shape, from, [x, top, z], startRoot, this.hangRoot, lift);
      const hangEnd = (): void => {
        const v = held.steer?.tilt?.v ?? 0;
        if (this.hangRoot !== null) this.hangRoot -= v;
        this.kind_ = 'hang';
      };
      this.run('climb', plan.clip, path, false, hangEnd, [{ at: 0.5, event: { type: 'jumpWhoosh' }, fired: false }]);
      const held = this.running!;
      steer();
      return;
    }
    if (plan.blend) {
      // FUN_00581110: the crate and the medium as one play's two nodes (the blended root carries the feet).
      const blended = blendShapes(shape, this.shapes.get(plan.blend.clip), plan.blend.weight);
      const bt = shapeTravel(blended);
      const [bx, bz] = ahead(bt.ahead);
      const past = Math.max(0.5, bt.ahead - (REF_AHEAD[plan.clip] ?? 8.92));
      const path = new ClipPath(blended, from, [bx, topFloor(this.grid, plan.target, c, past) ?? c.top, bz], startRoot, STAND_ROOT, lift);
      this.run('climb', plan.clip, path, false, (m) => this.endUncut(m), [{ at: 0.1, event: { type: 'climbUp' }, fired: false }]);
      this.running!.blend = plan.blend;
      steer();
      return;
    }
    const [x, z] = ahead(travel.ahead);
    if (plan.kind === 'over') {
      // LATER 1222 (research 313 s8.18; CLIMB_OVER_BLEND_READING, CLIMB_OVER_FRAME_ORDER_READING): the original's actor
      // carries the clip root's vertical and the steer's under `Climb over` (D:L438910, D:L456435, D:L468933-468941) --
      // PROVEN on r0004 (l278-climbover). The track keeps the x and z only (its y unused); the vertical, the node and the
      // drawn root are the carry's, one game frame at a time (`overFrame`), the push's own frame the first -- stepped here,
      // on the press's tick. The end is the hand-off's (`overHandOff`), not the floor pick of `endUncut`. *Was* (LATER
      // 278): the feet on `floorUnder(x, start y, z, 6.5) ?? start y`, the end's pick from `overPick`.
      const path = new ClipPath(shape, from, [x, from[1], z], startRoot, STAND_ROOT, lift);
      this.run('climb', plan.clip, path, false, (m) => this.endClimb(m), [{ at: 0.1, event: { type: 'climbUp' }, fired: false }]);
      steer();
      // LATER 1244 (CLIMB_STEER_TILT_READING): the steer record keeps the contact's normal negated, whole (D:L467927-467932).
      const n = firstTriangleNormal(c.poly.points);
      const o: OverCarry = {
        clock: new GameFrameAccumulator(), frames: 0, top: c.top, up: -(REF_UP[plan.clip] ?? 0),
        feet: s.y, travel: 0, node: Math.min(STEER_ROOT, startRoot), snap: startRoot, hold: null,
        normal: n ? [-n[0], -n[1], -n[2]] : null, refX: 0, refZ: -(REF_AHEAD[plan.clip] ?? 0),
      };
      k.over = o;
      if (CLIMB_OVER_FRAME_ORDER_READING === 'push-advances') this.overFrame(w, this.running!, o);
      return;
    }
    const to: [number, number, number] = [x, topFloor(this.grid, plan.target, c, uncutPast(shape, plan.clip)) ?? c.top, z];
    const path = new ClipPath(shape, from, to, startRoot, STAND_ROOT, lift);
    this.run('climb', plan.clip, path, false, (m) => this.endUncut(m), [{ at: 0.1, event: { type: 'climbUp' }, fired: false }]);
    steer();
  }

  /**
   * The hang (state 4, `FUN_00584390`, decomp 443780): held while the stick rests (0.03, no timer); the stick ahead
   * pulls up ("Hang -> Climb", 443810), any other push -- back or aside -- lets go ("Hang jump down", 443830), as do
   * the jump (418136) and an action with nothing offered (the jump latch, 451991-451994).
   */
  private hang(w: Walker, input: WalkInput, pressed: boolean): void {
    const s = w.state;
    s.vx = 0; s.vz = 0; s.vy = 0;
    const push = Math.hypot(input.forward, input.right);
    if (input.forward > DEAD) this.hangUp(w);
    else if (push > DEAD || pressed) this.hangDown(w);
  }

  /** "Hang -> Climb" (0x23): onto the top, `pull_up` at 0.01. */
  private hangUp(w: Walker): void {
    const k = this.climbing!, s = w.state, c = k.plan.contact;
    const shape = this.shapes.get(TRAVERSAL_CLIP.hangUp);
    const t = shapeTravel(shape);
    const top = topFloor(this.grid, k.plan.target, c, Math.max(0.5, t.ahead)) ?? c.top;
    const to: [number, number, number] = [s.x - c.nx * t.ahead, top, s.z - c.nz * t.ahead];
    const path = new ClipPath(shape, [s.x, s.y, s.z], to, this.hangRootY(), STAND_ROOT);
    this.run('hangUp', TRAVERSAL_CLIP.hangUp, path, false, (m) => this.endUncut(m), [{ at: 0.01, event: { type: 'pullUp' }, fired: false }]);
  }

  /**
   * "Hang jump down" (0x24): not in the gravity-suspended list (decomp 466760-466790), so `FUN_0059afd0` (456390-456395)
   * takes the height from the clip's root only for its first 0.2 -- the push off the wall, the root 18.82 up to 21.30 and
   * back from it -- and from the fall after; the clip plays on through the fall (`jump_whoosh` at 0.2).
   */
  private hangDown(w: Walker): void {
    const k = this.climbing!, s = w.state, c = k.plan.contact;
    const shape = this.shapes.get(TRAVERSAL_CLIP.hangDown);
    const key = HANG_PUSH * (shape.keys - 1);
    const r0 = rootAt(shape, 0), r1 = rootAt(shape, key);
    const back = Math.max(0, r1[2] - r0[2]);                    // the root's travel back from the wall (+z, behind)
    const rise = r1[1] - r0[1];
    const to: [number, number, number] = [s.x + c.nx * back, s.y + rise, s.z + c.nz * back];
    const push = truncateShape(shape, HANG_PUSH);
    // From where the hang holds the body (`hangRootY`) to the clip's own root at the push's end, the fall's start.
    const path = new ClipPath(push, [s.x, s.y, s.z], to, this.hangRootY(), r1[1]);
    this.emit({ type: 'climbEnd', kind: k.plan.kind });
    this.run('hangDown', TRAVERSAL_CLIP.hangDown, path, false, (m) => {
      // The push over: the fall from here, at the root's rise rate at 0.2 (the clip's own, per second).
      const a = rootAt(shape, key - 1), b = rootAt(shape, key + 1);
      const vy = ((b[1] - a[1]) / 2) * ((shape.keys - 1) / shape.seconds);
      this.climbing = null;
      this.lock = null;
      this.kind_ = 'hangDropFall';
      this.dropTime = HANG_PUSH * shape.seconds;
      m.setAirborne(true, vy);
    });
  }

  /** The jump down's fall: the walk's (gravity, the landing), the clip playing on until the landing or its end. */
  private dropping(w: Walker, dt: number): void {
    this.dropTime += dt;
    if (!w.airborne || this.dropTime >= this.shapes.get(TRAVERSAL_CLIP.hangDown).seconds) this.kind_ = 'none';
  }

  /**
   * The dive (`FUN_0057e540`, decomp 440870-440920), in place of going prone: a full press of the stance button
   * (Triangle past 0.3, `FUN_00594cf0` 453331-453390) from a stand or a crouch passing `FUN_00584b00` (443977-444010) --
   * moving at 30 a second or more, in water no deeper than 2, no action holding the body. The world velocity is kept
   * (`+0x1350`), the clip's own root travel is not applied (decomp 416510-416514); the clip draws its own root
   * (DIVE-ROOT); a hidden timer holds 0.2 s, then falls from one airborne frame of gravity (`DIVE_ROOT_SEED_READING`)
   * gaining 98.1 a second (`DIVE_ROOT_FALL_READING`) to the prone's 2.2 (`FUN_0059b870` 456585-456603); then the speed
   * runs down at 150 a second each second (416527-416545) and the dive ends at rest, prone. `dive_prone` sounds at 0.45
   * (`motion.rdr`).
   * PAR-19 (research 251 section 3): refused while a weapon swap owns the actor, the moving swap's overlay too
   * (`FUN_005a7980(actor, 1)`, D:L443995-444001: `Walker.swapping`) -- the moving reload's overlay is no swap and dives.
   * PARITY-1 close (research 251 section 9): not refused by the victory dance -- the full press runs `FUN_0057e540` when
   * `FUN_00584b00` passes (`FUN_00594cf0` D:L453387-453389), and `FUN_00584b00` tests no dance (D:L443985-444001) --
   * and the dive's push pops the stack first (D:L440882-440885), so the dance comes off `replaced`. The speed is the
   * actor's at the press: a dance's own root never reaches 30 a second, so in the port the run's velocity left on the
   * dance's first tick is what dives (`VICTORY_DIVE_READING`, research 251 section 7).
   */
  dive(w: Walker): boolean {
    const s = w.state;
    if (!this.canDive(w)) return false;
    w.stopVictoryMotion('replaced');                             // FUN_0057e540 D:L440882-440885: the stack popped
    const from = stanceRootY(w.posture);
    this.diving = { vx: s.vx, vz: s.vz, t: 0, root: from, fall: null, from, fade: null };
    this.diveEnd = null;
    this.leanOn = null;
    this.popped = null;
    this.kind_ = 'dive';
    this.lock = s.yaw;
    w.stance = 'prone';
    return true;
  }

  /**
   * `dive`'s test (`FUN_00584b00`, 443977-444010; PAR-19's swap refusal), asked without diving: no move under way, on
   * the ground, not prone, no action on the body, no swap, water no deeper than `DIVE_WATER`, moving at `DIVE_SPEED2` or
   * more. (OT.R67's double tap asked it of a press; retired by OT.R76, the stance button's hold dives through `dive`.)
   */
  canDive(w: Walker): boolean {
    const s = w.state;
    if (this.kind_ !== 'none' || w.airborne || w.stance === 'prone' || w.action || w.swapping()) return false;
    return this.depth_ <= DIVE_WATER && s.vx * s.vx + s.vz * s.vz >= DIVE_SPEED2;
  }

  /** A dive under way (`TraversalHooks.inDive`): OT.R76's jump press inside it pops it (`cancelDive`, `WalkMode.jumpPress`). */
  inDive(): boolean {
    return this.kind_ === 'dive' && this.diving !== null;
  }

  /**
   * OT.R67 (`./stanceButton` `PRONE_POP_ADAPTATION`, `popStance`; no original): the prone-pop out of the dive. The dive
   * under way -- its hold, its fall, its slide on the ground -- ends where it is and the SEAL stands at once: the
   * stance word and the posture stand's (`Walker.stance`, as `dive` writes prone), the dive's carried velocity kept
   * (`diveTick` laid it on the mover), no get-up clip, the yaw's lock let go. `'refused'` (nothing changed) in the air,
   * dead, with an action or a hold on the body, or with no headroom to stand (`Walker.stanceGate`: the feet + 19,
   * D:L419007); null with no dive under way.
   */
  cancelDive(w: Walker): PopOutcome {
    if (!this.inDive()) return null;
    if (w.airborne || w.dead || w.action || w.holding || w.stanceGate('stand') !== 'open') return 'refused';
    this.diving = null;
    this.kind_ = 'none';
    this.lock = null;
    w.stance = 'stand';
    w.markStanceTaken();                                         // LATER 414: the adaptation's "stance word ... stand's"
    return 'dive';
  }

  /**
   * F2 and the reviews after it: the end blend's clock as the animator runs it (`Animator.step`). At each tick's start
   * -- the one fixed point, whoever reads `rootY` and when (the third review's F2) -- the last tick's play is settled,
   * the root then drawn kept (`last`), the clock advanced, and this tick's turn taken from `Walker.turn`, the rate the
   * animator's `turn:prone` is chosen on (`MoverSnapshot.turnRate`, `Animator.wanted`): the page sets it from the look
   * before the tick (`WalkMode`), the room from the look gate's turn, which it also sends the others (`MoverSim`). It
   * ends with its fade, or once the body no longer plays a prone ground play: another move, the stance left, an action.
   */
  private diveEndTick(w: Walker, dt: number): void {
    if (!this.diveEnd) return;
    this.endWalker = w;
    const e = this.settled(this.diveEnd, w);
    this.diveEnd = e;
    if (!e) return;
    if (e.t >= e.seconds) { this.diveEnd = null; return; }
    e.last = this.diveEndRoot(e);
    e.t += dt;
    e.turn = w.turn !== 0;
    e.fresh = true;
  }

  /**
   * The play the animator draws after the dive, as `Animator.wanted` picks it for a prone body with no action: the
   * ground word's (`loco:stand` while it is still the press's; a crawl or a strafe, `pronePlay`'s clip), else the turn's
   * (`turn:prone`, `seal_prone_turn`), else the prone base's. Its key, and the clip whose `BlendTime` the cross-fade
   * takes. Null once the body leaves the prone ground plays.
   */
  private diveEndPlay(w: Walker, turn: boolean): { key: string; clip: string } | null {
    if (w.action || w.posture !== 'prone' || this.kind_ !== 'none' || this.running) return null;
    const g = w.ground;
    if (g.state === 'stand') return { key: 'loco:stand', clip: '' };
    if (g.state !== 'idle' && g.cls !== -1) {
      if (g.state === 'crouch') return { key: `loco:crouch:${g.cls}`, clip: '' };
      const crawl = g.cls === 1 || g.cls === 3;
      return { key: `loco:prone:${g.cls}`, clip: crawl ? SEAL_ANIMS.proneCrawl : g.right >= 0 ? SEAL_ANIMS.proneRight : SEAL_ANIMS.proneLeft };
    }
    if (turn && !w.airborne) return { key: 'turn:prone', clip: SEAL_ANIMS.proneTurn };
    return { key: 'idle:prone', clip: SEAL_ANIMS.prone };
  }

  /**
   * The end blend with the last tick's play read (`fresh`), as a new value (a read of `rootY` keeps none of it): a new
   * play starts its cross-fade from the root drawn at the last tick's end, over its clip's `BlendTime`
   * (`Animator.start`); the same play with the stick's snap counted again, over `STICK_SNAP_BLEND` (`Animator.snapshot`,
   * `FUN_00586c10`); null once the body plays no prone ground play.
   */
  private settled(e: NonNullable<Traversal['diveEnd']>, w: Walker): Traversal['diveEnd'] {
    if (!e.fresh) return e;
    const play = this.diveEndPlay(w, e.turn);
    if (!play) return null;
    const out = { ...e, fresh: false, snaps: w.stickSnaps };
    if (play.key !== e.key) Object.assign(out, { key: play.key, from: e.last, t: 0, seconds: this.shapes.blendTime(play.clip) });
    else if (w.stickSnaps !== e.snaps) Object.assign(out, { from: e.last, t: 0, seconds: STICK_SNAP_BLEND });
    return out;
  }

  /** The end blend's root: from where it started toward the stance's prone root, by the animator's weight. */
  private diveEndRoot(e: { from: number; t: number; seconds: number }): number {
    return e.from + (stanceRootY('prone') - e.from) * blendWeight(e.seconds > 0 ? e.t / e.seconds : 1);
  }

  /**
   * The dive's step at the page's rate (R8: the per-second totals are the original's; the dive is no trajectory). Each
   * step is split where the dive's phases meet inside it and each part integrated exactly, so the travel does not hang
   * on the step: the hold at the kept speed; the timer's fall from `DIVE_ROOT_SEED_READING` gaining
   * `DIVE_ROOT_FALL_READING` to `DIVE_ROOT`, the speed still kept; then down, the speed bled at `DIVE_BLEED`.
   */
  private diveTick(w: Walker, dt: number): boolean {
    const d = this.diving!, s = w.state;
    const shown = this.diveRoot(d);                               // the root drawn last frame: the end blend's start
    d.fade = d.fade === null ? 0 : d.fade + dt;
    const held = Math.min(dt, Math.max(0, DIVE_HOLD - d.t));      // the step's part still in the hold
    d.t += dt;
    let kept = held, left = dt - held;                            // seconds at the kept speed; seconds after the hold
    if (left > 0 && d.root > DIVE_ROOT) {
      const g = DIVE_ROOT_FALL_READING;
      const v = (d.fall ??= DIVE_ROOT_SEED_READING);             // the hold's end: one airborne frame of gravity
      const reach = (Math.sqrt(v * v + 2 * g * (d.root - DIVE_ROOT)) - v) / g;   // seconds to 2.2
      const f = Math.min(left, reach);
      d.root = f >= reach ? DIVE_ROOT : Math.max(DIVE_ROOT, d.root - v * f - 0.5 * g * f * f);
      d.fall = v + g * f;
      kept += f; left -= f;
    }
    let dx = d.vx * kept, dz = d.vz * kept;
    if (left > 0 && d.root <= DIVE_ROOT) {                        // down: the carried speed bleeds off
      const v = Math.hypot(d.vx, d.vz);
      if (v > 0) {
        const stop = v / DIVE_BLEED, b = Math.min(left, stop), along = v * b - 0.5 * DIVE_BLEED * b * b;
        const ux = d.vx / v, uz = d.vz / v;
        dx += ux * along; dz += uz * along;
        if (b >= stop) { d.vx = 0; d.vz = 0; } else { d.vx = ux * (v - DIVE_BLEED * b); d.vz = uz * (v - DIVE_BLEED * b); }
      }
    }
    s.vx = d.vx; s.vz = d.vz;
    w.glide(dx, dz, undefined, true);                           // FLE-2: the dive's carry, held on the bare floor (D:L456503; bare at D:L456544-456559)
    s.yaw = this.lock ?? s.yaw;
    if (w.airborne || (d.vx === 0 && d.vz === 0 && d.root <= DIVE_ROOT)) {   // off an edge, or down and at rest: prone (decomp 418158-418167)
      this.diving = null;
      this.kind_ = 'none';
      this.lock = null;
      // LATER 414 (research 87 1.13): the dive wrote the request only (FUN_0057e540 D:L440912); the prone stance is taken
      // once FUN_00552ec0 accepts it, raising the word's bit -- here, down and at rest (DIVE_PRONE_TAKE_READING). Off an
      // edge the take is the landing's (not modelled: a named gap; the word shows at the next take).
      if (!w.airborne) w.markStanceTaken();
      // R4P-104: off an edge the dive's clip is still in play at the contact (r0004 0x5b5ce4-0x5b5cfc; D:L466908-466914),
      // so the walker's landing is the dive's (`Landing.dived`, read at x 1.2: `DIVE_LANDING_SPEED_FACTOR`).
      else w.markDiveFall();
      // F2 (`DIVE_END_BLEND_READING`): at rest the seam fades from the root drawn last on the clock of the play the
      // animator draws next (the prone base's, a crawl's, a turn's: `diveEndPlay`); off an edge the fall's own.
      if (!w.airborne) {
        // This tick the animator plays the ground word as it stands -- still the press's, the dive owned every tick
        // (`Walker.ground`) -- frozen at the root drawn last, at weight 0; the prone play takes over on the next.
        const play = this.diveEndPlay(w, false);
        this.diveEnd = play && {
          from: shown, t: 0, seconds: this.shapes.blendTime(play.clip), key: play.key, last: shown, fresh: false, turn: false,
          snaps: w.stickSnaps,
        };
        this.endWalker = w;
      }
      return w.airborne ? false : true;
    }
    return true;
  }

  /**
   * The "180" (`seal_180`, `motion.rdr` 0.95 s) before a top mount by a SEAL facing more than 90 degrees from the
   * climb-off's facing (decomp 468210-468256): the yaw turned by code at `angle / (0.95 x (n - 1) / n)` (`+0x48`), then
   * `FUN_005b1890` (467818) and the reversed climb-off.
   */
  private turning(w: Walker, dt: number): void {
    const t = this.turn!;
    t.time = Math.min(t.seconds, t.time + dt);
    const yaw = t.from + (t.angle * t.time) / t.seconds;
    w.state.yaw = yaw;
    this.lock = yaw;
    w.state.vx = 0; w.state.vz = 0;
    if (t.time >= t.seconds) {
      this.turn = null;
      this.topMount(w, t.ladder);
    }
  }

  /**
   * NU-1c B12 (`CLIMB_TOP_FLOOR_READING`): an uncut climb's end runs the end handler as the cut's does -- the body on the
   * floor pick (`climbSettle`; `FUN_00589aa0` D:L446582-446648) -- then `endClimb`.
   */
  private endUncut(w: Walker): void {
    if (CLIMB_TOP_FLOOR_READING === 'dropped') this.climbSettle(w);
    this.endClimb(w);
  }

  /** The climb's end, cut or not: the pop reveals the base the start kept -- crouched for `CLIMB_CROUCH_END_READING`'s. */
  private endClimb(w: Walker): void {
    const kind = this.climbing?.plan.kind ?? 'low';
    const crouched = this.climbing?.crouched === true && CLIMB_CROUCH_END_READING.includes(kind);
    const pending = this.climbing?.request ?? w.pendingStance;   // NU-1b B3: a press under the climb, kept
    this.climbing = null;
    this.contact = null;
    this.emit({ type: 'climbEnd', kind });
    this.finish(w, CLIMB_RESUME_STICK_READING === 'held');       // the ramp kept at the last advance's stick
    if (crouched) w.stance = 'crouch';                           // the stance and its request, no transition (D:L135104)
    if (CLIMB_PENDING_STANCE_READING === 'kept') w.requestStance(pending);   // asked from the next tick (D:L418867-418908)
  }

  /**
   * NU-1b B7 (`CLIMB_HIT_CANCELS_READING`): a flinch taken over a running climb pops it -- the align or the clip, `Hang ->
   * Climb` -- running the end handler: settled on the floor pick (`climbSettle`) and ended as a cut ends it (`endClimb`:
   * the crouch base revealed, a pending press kept); `Stand -> Hang` mid-clip has no case and is handed to the fall from
   * where it is. Not the hang's loop, the ladder or the dive. True when a climb was popped.
   */
  flinchPop(w: Walker): boolean {
    if (CLIMB_HIT_CANCELS_READING !== 'popped') return false;
    // NU-1b review F3: the hang's jump down is a one-shot too (motion.rdr looped 0): popped, no case in FUN_00589aa0 to
    // settle it -- its push handed to the fall from where it is, its fall going on without its clip.
    if (this.kind_ === 'hangDown' || this.kind_ === 'hangDropFall') {
      const pushing = this.kind_ === 'hangDown';
      this.running = null;
      this.climbing = null;
      this.lock = null;
      this.kind_ = 'none';
      if (pushing) w.setAirborne(true);
      return true;
    }
    if (!this.climbOneShot()) return false;
    const hanging = this.running !== null && this.standToHang();
    const time = this.running?.time ?? 0;                        // the clip's clock at the pop (LATER 278)
    this.running = null;
    if (!hanging) this.climbSettle(w, time);
    this.endClimb(w);
    if (hanging) w.setAirborne(true);                            // no case in FUN_00589aa0: no settle, the fall from here
    return true;
  }


  /**
   * Runs the clip-driven move a tick: the cut asked first (`CLIMB_CUT_READING`), then the feet along its path, its
   * callbacks, and what follows at its end. True while the move keeps the tick; false when a cut handed it to the walk.
   */
  private advance(w: Walker, dt: number): boolean {
    const r = this.running!;
    const over = r.kind === 'climb' ? this.climbing?.over : undefined;
    if (over) return this.advanceOver(w, r, over, dt);
    const next = Math.min(r.path.seconds, r.time + dt);
    if (this.climbCut(w, r, next)) return this.cutClimb(w, r);
    const was = r.steer ? r.path.at(r.time).feet : null;
    r.time = next;
    const p = r.path.at(r.time);
    let [x, z] = [p.feet[0], p.feet[2]];
    const yaw = w.state.yaw;                                     // the body before the turn (D:L468840-468844)
    if (r.steer && was) [x, z] = this.climbSteer(w, r.steer, p.feet[0] - was[0], p.feet[2] - was[2], dt, x, z);
    if (r.steer?.tilt && was) [x, z] = this.climbTilt(r, r.steer, r.steer.tilt, yaw, dt, x, z);
    Object.assign(w.state, { x, y: p.feet[1], z, vx: 0, vz: 0, vy: 0 });
    if (r.kind === 'climb' || r.kind === 'hangUp') {
      // CLIMB_RESUME_STICK_READING: the advance's copy of the stick into the ramp (FUN_0057a330 D:L438704-438706).
      const stick = w.cutStick;
      w.state.stickForward = stick.forward; w.state.stickRight = stick.right;
    }
    const f = r.time / r.path.seconds;
    for (const c of r.calls) if (!c.fired && f >= c.at) { c.fired = true; this.emit(c.event); }
    // `FUN_00582540` (decomp 442907-442978): the action held in the last 0.2 of a reversed climb-off -- the top mount --
    // drops straight into "Ladderslide" from where the SEAL is, no "Ladder -> slide" (network code 8).
    if (r.kind === 'ladderMountTop' && this.actionHeld && f > 1 - TOP_SLIDE_WINDOW && this.ladder) {
      this.running = null;
      const at = this.onLadder(this.ladder, w.state.y);
      w.state.x = at[0]; w.state.z = at[2];
      this.kind_ = 'ladderSlide';
      this.slideVy = 0;
      this.slideTime = 0;
      this.emit({ type: 'ladderSlide', on: true });
      return true;
    }
    if (p.done) {
      this.running = null;
      r.done(w);
    }
    return true;
  }

  /**
   * NU-1c B10 (`CLIMB_STEER_READING`): one tick of the climb's steer over its clip's track -- the clock and the weight k
   * after the advance, the body turned by `seatTurn` (its winding kept), the offset still open `(1 - k)` of what it was
   * plus the track's step `(dx, dz)` less that step turned by the body's lag on the facing, and the vertical's share
   * still open `(1 - k)` of its. The feet: the track's `(x, z)` less the offset.
   */
  private climbSteer(w: Walker, st: ClimbSteer, dx: number, dz: number, dt: number, x: number, z: number): [number, number] {
    const s = w.state;
    const { phase, k, yaw } = st.core.advance(s.yaw, dt);
    st.phase = phase; st.k = k;                                  // LATER 1222: the over's vertical reads the same clock
    s.yaw += shortTurn(s.yaw, yaw);
    this.lock = s.yaw;
    const a = ((s.yaw - st.facing) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    st.ex = (1 - k) * st.ex + dx - (dx * c + dz * sn);
    st.ez = (1 - k) * st.ez + dz - (-dx * sn + dz * c);
    st.open *= 1 - k;
    return [x - st.ex, z - st.ez];
  }

  /**
   * LATER 1250 (research 313 s8.23; `CLIMB_STEER_TILT_READING`): the tilt of one command's steer on the 60 Hz path, after
   * `climbSteer` (its weight k). `FUN_005b3340` takes the stored normal into the body's frame by the yaw before the
   * command's turn (D:L468840-468844), turns a copy of the stored `refPt` by the shortest arc from `+0x9c` onto it
   * (`turnByArc`, `FUN_00306d40` D:L468892-468893) and lays it through the body matrix before the target
   * (D:L468898-468926). The flat steer is the same turn onto that normal made level (a turn about the vertical: the facing
   * the record's target and the track are laid on), so the tilt adds the turned `refPt` less the level-turned one: its y
   * to the vertical left open on the drawn root (`tilt.v`, closed by k each command as the flat lift is), its x and z
   * through the yaw to the x/z offset still open (`ex`, `ez`), the feet moved by k of it. Then the stored `refPt` loses
   * the clip root's velocity x dt at the phase (`mountRootVelocity`'s law; D:L468947-468951).
   */
  private climbTilt(r: Running, st: ClimbSteer, tl: ClimbTilt, yaw: number, dt: number, x: number, z: number): [number, number] {
    const k = st.k ?? 0, phase = st.phase ?? 0;
    const a = (yaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const n = tl.normal, nb = [n[0] * ca - n[2] * sa, n[1], n[0] * sa + n[2] * ca];
    const ref = [tl.refX, tl.refY, tl.refZ];
    const turned = turnByArc(CLIMB_STEER_TILT_READING, nb, ref);
    const level = levelTurn(nb, ref);
    const dx = turned[0] - level[0], dz = turned[2] - level[2];
    const wx = k * (dx * ca + dz * sa), wz = k * (-dx * sa + dz * ca);
    st.ex += wx; st.ez += wz;
    tl.v = (1 - k) * tl.v + k * (turned[1] - ref[1]!);
    const shape = r.path.shape;
    const v = mountRootVelocity({ clip: shape.name, refPt: [0, 0, 0], root: shape.root, keys: shape.keys, seconds: r.path.seconds }, phase);
    tl.refX -= v[0] * dt; tl.refY -= v[1] * dt; tl.refZ -= v[2] * dt;
    return [x - wx, z - wz];
  }

  /**
   * LATER 1222 (research 313 s8.18 (f), the review's F2): the climb over on one game-frame clock. Each 60 Hz tick feeds
   * the carry's `GameFrameAccumulator`; each whole game frame steps `overFrame` (the end and the hand-off among them);
   * between frames the body holds the frame's values (s8.18 (f) 6). The stick is copied into the ramp each tick as the
   * other climbs' advance copies it (`CLIMB_RESUME_STICK_READING`).
   */
  private advanceOver(w: Walker, r: Running, o: OverCarry, dt: number): boolean {
    const frames = o.clock.advance(dt);
    const s = w.state;
    s.vx = 0; s.vz = 0; s.vy = 0;
    const stick = w.cutStick;
    s.stickForward = stick.forward; s.stickRight = stick.right;
    for (let i = 0; i < frames && this.running === r; i++) this.overFrame(w, r, o);
    return true;
  }

  /**
   * LATER 1222: one game frame of the climb over (`GAME_FRAME_DT`), the law of research 313 s8.18 (a):
   * - the end first: the driver's end test on the phase before the frame's advance (`FUN_0028c6e0` D:L134283-134308 via
   *   D:L418192-418193, `mountPlayedOut`) -- passed, the hand-off (`overHandOff`); a held hand-off's next frame stands on
   *   its pick (`FUN_0059afd0` D:L456359-456363);
   * - else the phase advanced and the x/z steer laid at it (`climbSteer` on the track's step since the last frame, dt
   *   `GAME_FRAME_DT`: `FUN_0028c4f0` D:L438901, `FUN_005b3340` D:L439020), the track read at the frame's clock;
   * - the root's vertical velocity from the new phase's key interval (`mountRootVelocity`'s law, `FUN_0028c250` /
   *   `FUN_00289bb0` D:L438909-438910, D:L132713-132718);
   * - the steer's vertical: the target's y (the contact's top) less the stored `refPt` (moved by the root's travel on
   *   all three axes, D:L468947-468951) turned onto the contact's reversed normal (LATER 1244, `CLIMB_STEER_TILT_READING`,
   *   D:L468840-468844, D:L468892-468893; its horizontal part moves the x/z steer's aim) less the root node's world point
   *   (the last frame's feet and node, D:L468927), times the weight k = sqrt(ease(phase)) (D:L468929-468930), kept for
   *   the climb over (D:L468933-468941);
   * - the feet += v dt + k e (D:L456402, D:L456435; the steer's velocity added, D:L416455);
   * - the node: the clip's root y at the phase, blended from the push's snapshot by the ease of the timer left
   *   (`CLIMB_OVER_BLEND_READING`, `FUN_00576860` D:L436621-436634) and capped at 11.487 (D:L456455-456456) -- the drawn
   *   root over the feet.
   */
  private overFrame(w: Walker, r: Running, o: OverCarry): void {
    const s = w.state, shape = r.path.shape, n = shape.keys;
    if (o.hold !== null) {
      s.y = o.hold;
      o.hold = null;
      o.frames++;
      this.overEnd(w, r);
      return;
    }
    const e = n < 2 ? 1 : (n - 1) / n;
    if (mountPlayedOut(o.frames * GAME_FRAME_DT, shape.seconds / (e * e), n)) {
      this.overHandOff(w, r, o);
      return;
    }
    const was = r.path.at(r.time).feet;
    r.time = Math.min(r.path.seconds, (o.frames + 1) * GAME_FRAME_DT);
    o.frames++;
    const p = r.path.at(r.time);
    let [x, z] = [p.feet[0], p.feet[2]];
    const st = r.steer;
    // LATER 1244 (CLIMB_STEER_TILT_READING): the stored `refPt` turned by the shortest arc from `+0x9c` onto the reversed
    // normal in the body's frame (the yaw before this frame's turn, D:L468840-468844, D:L468892-468893).
    const ref: [number, number, number] = [o.refX, -o.up - o.travel, o.refZ];
    const a = (s.yaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const nb = o.normal ? [o.normal[0] * ca - o.normal[2] * sa, o.normal[1], o.normal[0] * sa + o.normal[2] * ca] : null;
    const turned = nb ? turnByArc(CLIMB_STEER_TILT_READING, nb, ref) : ref;
    if (st) [x, z] = this.climbSteer(w, st, p.feet[0] - was[0], p.feet[2] - was[2], GAME_FRAME_DT, x, z);
    const phase = st?.phase ?? Math.min(e, r.time / (shape.seconds / e)), k = st?.k ?? 0;
    if (st && nb) {
      // The turn's horizontal part moves the x/z steer's aim by the turned `refPt` less the level-turned one (the turn
      // onto the normal made level, which the flat steer already lays: `climbTilt`'s), through the body matrix
      // (D:L468898-468926), closed by the same weight: carried in the offset still open. LATER 1250 (the review's F1):
      // *was* less the stored `refPt`, which added k M (R_level - I) refPt with the body yawed off the face.
      const level = levelTurn(nb, ref);
      const dx = turned[0] - level[0], dz = turned[2] - level[2];
      const wx = k * (dx * ca + dz * sa), wz = k * (-dx * sa + dz * ca);
      st.ex += wx; st.ez += wz;
      x -= wx; z -= wz;
    }
    const v = mountRootVelocity({ clip: shape.name, refPt: [0, 0, 0], root: shape.root, keys: n, seconds: shape.seconds }, phase);
    const err = o.top - turned[1] - o.feet - o.node;
    o.feet += v[1] * GAME_FRAME_DT + k * err;
    o.travel += v[1] * GAME_FRAME_DT;
    o.refX -= v[0] * GAME_FRAME_DT;
    o.refZ -= v[2] * GAME_FRAME_DT;
    const left = Math.max(0, CLIMB_OVER_BLEND_READING - o.frames * GAME_FRAME_DT);
    const snap = blendWeight(left / CLIMB_OVER_BLEND_READING);
    o.node = Math.min(STEER_ROOT, snap * o.snap + (1 - snap) * rootAt(shape, phase * n)[1]);
    Object.assign(s, { x, y: o.feet, z, vx: 0, vz: 0, vy: 0 });
    const f = r.time / r.path.seconds;
    for (const c of r.calls) if (!c.fired && f >= c.at) { c.fired = true; this.emit(c.event); }
  }

  /**
   * LATER 1222 (research 313 s8.13 (a), s8.17 (c), s8.18 (d)): the climb over's hand-off, the frame after its clip.
   * `+0xfac` = the last frame's feet + node (r0004: written the frame after the clip, l278-climbover); the frame's y is
   * `+0xfac` less the revealed node where that is over the floor pick `+0x2e4` (LATER 1244: `Jump fall`'s root,
   * `CLIMB_OVER_FALL_READING`), else the pick
   * (`FUN_0059afd0` D:L456368-456386); held over it, the next frame stands on the pick (D:L456359-456363; r0004: action 9
   * then 10 on the 16.41 fence, the floor at once on the low faces). The pick is taken at the body's x and z from that
   * height plus the posture's lift (`selectFloor`, as every pick) -- so from about `+0xfac`: the original's origin for it is
   * unread (`CLIMB_END_PICK_ORIGIN_READING`, note only; taken from `+0xfac` less the posture's root as LATER 1222 built
   * it). *Was* (LATER 1222): the revealed node the posture's standing root. Replaces LATER 278's `overPick` for the over.
   */
  private overHandOff(w: Walker, r: Running, o: OverCarry): void {
    const s = w.state;
    const root = stanceRootY(w.posture), at = o.feet + o.node - root;
    o.frames++;
    const floor = selectFloor(probeGround(this.grid, s.x, s.z), at + probeLiftOf(w.posture), at);
    // LATER 1244 (CLIMB_OVER_FALL_READING): over the pick the end reveals `Jump fall`, and the frame stands at `+0xfac`
    // less its root (`FUN_0059afd0` D:L456368-456371), the drawn node that root. *Was:* less the standing root, `at`.
    const fall = o.feet + o.node - CLIMB_OVER_FALL_READING;
    if (floor && fall > floor.y) {
      s.y = fall;
      o.feet = fall;
      o.node = CLIMB_OVER_FALL_READING;                          // the root's world height kept at +0xfac for the held frame
      o.hold = floor.y;
      return;
    }
    s.y = floor ? floor.y : fall;
    this.overEnd(w, r);
  }

  /** LATER 1222: the climb over's end -- the clip off and the climb ended (`endClimb`, the run's `done`). */
  private overEnd(w: Walker, r: Running): void {
    this.running = null;
    r.done(w);
  }

  /**
   * The drawn root over the feet at a path's point: `ClipPath`'s, its vertical steer (`lift`) laid at `FUN_005b2d20`'s 30
   * a second (`STEER_RATE`) taken back and laid again closed by the steer's weight (`CLIMB_STEER_READING`) -- for a climb
   * with a steer; the path's own otherwise.
   */
  private drawnRoot(r: Running, p: PathPoint): number {
    // LATER 1222: the climb over's drawn root is the carried node (blended, capped; `overFrame`), not `ClipPath`'s rest.
    const over = r.kind === 'climb' ? this.climbing?.over : undefined;
    if (over) return over.node;
    const st = r.steer;
    if (!st) return p.rootY;
    const laid = Math.sign(st.lift) * Math.min(Math.abs(st.lift), STEER_RATE * r.time);
    // LATER 1250: less the vertical the steer's tilt still leaves open (`climbTilt`).
    return p.rootY - laid + st.lift * (1 - st.open) - (st.tilt?.v ?? 0);
  }

  /**
   * `CLIMB_CUT_READING`: a climb's clip past its `NoInterrupt` at the clip's clock `t` (the tick's, before its advance)
   * with the stick or the turn past 0.1 (`Walker.stickCut`).
   */
  private climbCut(w: Walker, r: Running, t: number): boolean {
    if (r.kind !== 'climb' && r.kind !== 'hangUp') return false;
    // LATER 1223 (CLIMB_OVER_AXES_READING): FUN_005af930 zeroes the axes the cut reads under Climb over (D:L466805-466815).
    if (CLIMB_OVER_AXES_READING === 'zeroed' && r.kind === 'climb' && this.climbing?.plan.kind === 'over') return false;
    const noInterrupt = climbNoInterrupt(r.clip, w.hand);               // NU-1c B11: the pistol's sub-node decides
    const shape = r.path.shape;
    if (noInterrupt === undefined || shape.keys < 2 || !(shape.seconds > 0)) return false;
    const clock = CLIMB_CUT_READING === 'after' ? t - RELOAD_PUSH_LAG : t;
    return (clock / shape.seconds) * ((shape.keys - 1) / shape.keys) > noInterrupt && w.stickCut();
  }

  /**
   * The cut (`CLIMB_CUT_READING`): "Stand -> Hang" reveals the hang, the body held where the clip has it and its root as
   * drawn there; any other climb runs its end handler where the clip has carried the body -- its own x and z, the floor
   * pick's y (`climbSettle`) -- and hands the tick to the walk (false).
   */
  private cutClimb(w: Walker, r: Running): boolean {
    this.running = null;
    if (r.kind === 'climb' && this.climbing?.plan.kind === 'high') {
      this.hangRoot = this.drawnRoot(r, r.path.at(r.time));
      this.kind_ = 'hang';
      return true;
    }
    this.climbSettle(w, r.time);
    this.endClimb(w);
    return false;
  }

  /**
   * `./net/blast` `KnockMoves.popSettle` (`CLIMB_KNOCK_SETTLE_READING`): the knock's pop (`FUN_0057e770` D:L440997) runs a
   * running climb clip's end handler before the move is released -- the crate, the medium, the step-up, the climb over
   * and `Hang -> Climb` settle on the floor pick (`climbSettle`); `Stand -> Hang` and every other move settle nothing.
   * The move itself is left for the caller's `reset`.
   */
  popSettle(w: Walker): void {
    const r = this.running;
    if (CLIMB_KNOCK_SETTLE_READING !== 'settled' || !r) return;
    if ((r.kind === 'climb' && this.climbing?.plan.kind !== 'high') || r.kind === 'hangUp') this.climbSettle(w, r.time);
  }

  /**
   * `FUN_00589aa0`'s climb settle (D:L446582-446648): the body at its own x and z, its y the floor pick (`+0x2e4`, copied
   * from `+0x404` each climb tick, D:L466784) -- the port's pick from the feet, as every tick's (`selectFloor` from the
   * feet + the posture's lift, `probeLiftOf`, LATER 785); unchanged where there is none. LATER 1222: a climb over popped
   * mid-clip (the knock's `popSettle`, the flinch's `flinchPop`) settles from the actor's own height -- the pick taken as
   * the hand-off's is (`overHandOff`): from `+0xfac` (the carried feet + node) less the posture's root, plus its lift;
   * the hand-off's one held frame is not built for a pop (the move is released). *Was* (LATER 278): from the higher of
   * the feet and `overPick` at the clip's clock `time`.
   */
  private climbSettle(w: Walker, _time = Infinity): void {
    const s = w.state;
    const over = this.climbing?.plan.kind === 'over' ? this.climbing.over : undefined;
    const from = over ? over.feet + over.node - stanceRootY(w.posture) : s.y;
    const floor = selectFloor(probeGround(this.grid, s.x, s.z), from + probeLiftOf(w.posture), from);
    if (floor) s.y = floor.y;
  }

  private run(kind: TraversalKind, clip: string, path: ClipPath, reverse: boolean, done: (w: Walker) => void, calls: Running['calls'] = []): void {
    this.kind_ = kind;
    this.running = { kind, clip, path, time: 0, reverse, calls, done };
  }

  /** A move's end: the walk's again. `keepStick`: the ramp left at the stick the move last copied (a climb's). */
  private finish(w: Walker, keepStick = false): void {
    this.kind_ = 'none';
    this.ladder = null;
    this.ladderFloor = null;
    this.lock = null;
    if (!keepStick) { w.state.stickForward = 0; w.state.stickRight = 0; }
    w.setAirborne(false);
    w.settle();
  }

  // ---- the ladder ----

  /**
   * LC-1: the ladder's OFFER (`FUN_005b3ce0(a, 2)`, D:L469088-469240, the CLIMB the HUD shows) from the stored wall
   * contact, the mount (`mountOffered`) left to the action press (`step`). `FUN_005b4b40` (D:L469562-469676; called
   * D:L418132, D:L418155, only under the press's bit +0x170 0x4) and the offer test the same contact
   * (the walk's own hits, `contactFromHits`), never on nearness to a ladder's plane (LDR-1, research 86 s2.5). The contact's polygon must be a
   * ladder's (`(poly[+0xA] & 0x7f) >> 4 == 2`, `APP_LADDER`); the mover in front of it, `dot(normalize(seal - contact).xz,
   * n) >= 0.3` against the stored hit point; and facing it, `dot(back axis, n) >= 0.02` (the short quad, at most 15 tall
   * by `FUN_002dbfb0`: `|.| >= 0.02`). `FUN_005b3890` drops a short quad's contact with the feet more than 10 under its
   * bottom. The tall quad takes the mover at its foot, the short one at its head.
   * The offer also asks the crate's common gates (`climbOffered`) and none prone -- the same function. *Was* (LC-1,
   * 2026-11-11): the mount here on every grounded tick, with a stick into the face (`LADDER_STICK_INTO_READING`, retired)
   * and no button. *Was before* (LDR-1): any ladder whose plane lay within the body's radius + 0.25, in front by
   * the ratio of the distance out to the distance off the quad, with no contact -- up to ~10 past a flush ladder's edge.
   */
  private offerLadder(w: Walker): { ladder: Ladder; tall: boolean; facing: number; front: number } | null {
    const s = w.state;
    const a = axes(s.yaw);
    // The original's order: `FUN_005b3890` drops the kept contact (D:L413860), then the move's hit is stored (D:L413866),
    // and `FUN_005b4b40` reads it later in the tick (D:L418132) -- so a hit made this tick is tested before any drop.
    if (this.contact && (!contactHolds(this.contact, s.x, s.z, a.fx, a.fz) || shortDrop(this.contact, s.y))) this.contact = null;
    const hits = this.ladderHits(w), touched = contactFromHits(hits, s.x, s.z);
    if (touched) this.contact = cornerDrop(hits, touched, s.x, s.z) ? null : touched;
    const c = this.contact;
    if (!c || c.app !== APP_LADDER) return null;
    const tall = quadHeight(c.poly) > SHORT_QUAD;                // FUN_002a9260's split
    const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz);
    // The offer's own "in front" (`FUN_005b3ce0` D:L469233-469240): the SEAL on the face's side, `(pos - point) . n > 0`;
    // the mount's stricter `>= 0.3` is asked at the press (`mountOffered`, `FUN_005b4b40`). Review F2 of LC-1.
    if (d === 0 || dx * c.nx + dz * c.nz <= 0) return null;
    const front = (dx * c.nx + dz * c.nz) / d;
    const facing = -(a.fx * c.nx + a.fz * c.nz);                 // dot(back axis, n): into the quad
    if (tall ? facing < FACING : Math.abs(facing) < FACING) return null;
    const l = this.ladderOf(c);
    // The ladder's offer is the crate's function (`FUN_005b3ce0(a, 2)`): the same common gates (`climbOffered`,
    // `CLIMB_OFFER_GATE_READING`) and none prone, as `keepContact`'s plan asks.
    if (!l || w.stance === 'prone' || !climbOffered(w, this.handRefusesClimb)) return null;
    // R4P-243 (ATLAS L372; reading, pending review; capture IQ-179 queued): r0004's CanTraverse `FUN_005b9ff0` kind 2
    // refuses the ladder while `Place claymore` (DAT_00409d18) is the top blend, after its one-SEAL-a-ladder test
    // (D4:L510555-510557); the r0001 twin (D:L469165-469197) has none. The blend's clip, `seal_place_claymore`, is pushed
    // by the claymore's placing and by the PMN's and the bomb plant's too (`./bombPage` `PLANT_ANIM`, D:L475322,
    // D:L475354, D:L475480-475481), so all three are refused; C4's `put_onwall` shares the 'place' family (`./mover`
    // `holdFamily`) but not the blend. OPEN (research 313 s8.24): the pistol pair `Pistol place claymore` (0x409d20,
    // `./zoom`) -- the cite tests 0x409d18 only, and the port plays the rifle clip for both. Whether CanFire(actor, 1, 0)
    // (0x5adae0) already refuses while placing is unread (IQ-179).
    if (w.holding?.clip === 'seal_place_claymore') return null;
    return { ladder: l, tall, facing, front };
  }

  /**
   * LC-1: the press's mount of the offered ladder -- the foot's "Stand -> Ladder", the head's reversed climb-off -- under
   * `FUN_005b4b40`'s own "in front", `>= 0.3` of the normalised offset (D:L469562-469676), stricter than the offer's: a
   * SEAL offered CLIMB at a steep angle presses and nothing mounts. False when it did not mount.
   */
  private mountOffered(w: Walker, o: { ladder: Ladder; tall: boolean; facing: number; front: number }): boolean {
    if (o.front < IN_FRONT) return false;
    this.ladderOffer = null;
    if (o.tall) this.mountBottom(w, o.ladder); else this.mountTop(w, o.ladder, o.facing > 0);
    return true;
  }

  /**
   * The hits the contact is taken from: the walk's own (`Walker.wallHits`), and for a still body the original's cast
   * along the facing -- `FUN_0054aa30` casts a still body's segments (the velocity under 0.0005 a component,
   * D:L415135-415149) along the facing row (research 217 s2.1), the centre one at `step_height` 6.5 and 1.1 x 1.4 x r =
   * 5.39 ahead. The port's walk casts nothing still (research 217 s2.3), so without it a SEAL at rest at a ladder's foot
   * would have no contact on the command that pushes him in, where the original mounts on it (LDR-1). The centre line
   * alone, and only for the ladder's test: the walk's own probe is unchanged (`WALL_PROBE_READING`). Every actor casts
   * (`LADDER_STILL_CAST_ACTORS_READING`).
   */
  private ladderHits(w: Walker): readonly WalkHit[] {
    const hits = w.wallHits(), s = w.state;
    if (hits.length > 0 || Math.abs(s.vx) >= STILL_V || Math.abs(s.vz) >= STILL_V) return hits;
    const a = axes(s.yaw), y = s.y + SEAL_TUNING.stepHeight, reach = BODY_RADIUS * STILL_AHEAD;
    const ray = segmentHits(this.grid, [s.x, y, s.z], [s.x + a.fx * reach, y, s.z + a.fz * reach]);
    const h = ray[0];
    return h ? [{ poly: h.poly, line: 0, x: h.point[0], y: h.point[1], z: h.point[2] }] : [];
  }

  /** The ladder whose plane holds the contact's point (the list's, `findLadders`): on the plane and within its width. */
  private ladderOf(c: ClimbContact): Ladder | null {
    let best: Ladder | null = null, bestOut = Infinity;
    for (const l of this.ladders) {
      const f = ladderFrame(l, c.x, c.z);
      if (Math.abs(f.across) > l.halfWidth + LADDER_MATCH_READING || Math.abs(f.out) >= bestOut || Math.abs(f.out) > LADDER_MATCH_READING) continue;
      best = l; bestOut = Math.abs(f.out);
    }
    return best;
  }

  /** The mover's place on a ladder at height `y`: on the span's centre line, the stand-off out from the rungs. */
  private onLadder(l: Ladder, y: number): [number, number, number] {
    return [l.x + l.nx * LADDER_STANDOFF, y, l.z + l.nz * LADDER_STANDOFF];
  }

  /** `FUN_0057f880`: "Stand -> Ladder" from where the mover stands to the ladder's foot, facing the rungs. */
  private mountBottom(w: Walker, l: Ladder): void {
    const s = w.state;
    w.stance = 'stand';
    w.setAirborne(false);                                        // a landing or a stance change ends here
    this.ladder = l;
    this.seedLadderFloor(w);
    this.lock = yawFacing(l.nx, l.nz);
    s.yaw = this.lock;
    const shape = this.shapes.get(TRAVERSAL_CLIP.toLadder);
    // B-50 (research 86 s2.7): the mount ends at the y of the press (the walk's height, its soil included). Ending it on
    // the column's bare floor failed review (the soil offset, r0004 0x5a1264-0x5a1278). The original's end pop is READ
    // (0x58f2a8-0x58f350: y = `+0x2e4` + 15.3 - 11.487 = +3.8129, matched 9/9 by the r0004 capture LADDER-PC3) and NOT
    // built here: what it means for the port's ladder height and `FOOT_CLEAR` is open (86 s2.7, Open (1b)).
    const path = new ClipPath(shape, [s.x, s.y, s.z], this.onLadder(l, s.y), STAND_ROOT, this.ladderRoot());
    this.emit({ type: 'ladderMount', from: 'bottom' });
    this.run('ladderMount', TRAVERSAL_CLIP.toLadder, path, false, () => this.enterLadder());
  }

  /**
   * `FUN_0057f690`: from the deck onto the ladder's head -- "Climb off ladder" played backwards, from the deck to the
   * height the climb off starts at (`headStart`). A mover facing away turns first ("180", not played: the turn is
   * instant here, a named simplification).
   */
  private mountTop(w: Walker, l: Ladder, _facing: boolean): void {
    const s = w.state;
    w.stance = 'stand';
    w.setAirborne(false);                                        // a landing or a stance change ends here
    this.ladder = l;
    this.seedLadderFloor(w);
    this.emit({ type: 'ladderMount', from: 'top' });
    const want = yawFacing(l.nx, l.nz);
    const angle = shortTurn(s.yaw, want);
    if (Math.abs(angle) > 90) {                                  // FUN_00306fd0's cosine under 0: the "180" first
      const shape = this.shapes.get(TRAVERSAL_CLIP.turn180);
      this.turn = { from: s.yaw, angle, time: 0, seconds: shape.seconds, ladder: l };
      this.kind_ = 'turn180';
      this.lock = s.yaw;
      return;
    }
    this.topMount(w, l);
  }

  /** `FUN_005b1890` and the reversed climb-off: from the deck onto the ladder's head, its back to the edge. */
  private topMount(w: Walker, l: Ladder): void {
    const s = w.state;
    this.lock = yawFacing(l.nx, l.nz);
    s.yaw = this.lock;
    const shape = reverseShape(this.shapes.get(TRAVERSAL_CLIP.offLadder));
    const deck = this.deckPoint(l);
    const from: [number, number, number] = [deck[0], s.y, deck[2]];
    const path = new ClipPath(shape, from, this.onLadder(l, this.headStart(l)), STAND_ROOT, this.ladderRoot());
    this.run('ladderMountTop', TRAVERSAL_CLIP.offLadder, path, true, () => this.enterLadder());
  }

  private enterLadder(): void {
    this.kind_ = 'ladder';
    this.phase = 0;
  }

  /** The height of the feet on the ladder where the head ray first clears the ladder (the climb off's start). */
  private headStart(l: Ladder): number {
    const off = shapeTravel(this.shapes.get(TRAVERSAL_CLIP.offLadder)).rise;
    return l.capTop - (this.ladderRoot() + off - 1);
  }

  /** The deck the climb off ends on: over the plane on the deck's side, the body's radius and a half clear of it. */
  private deckPoint(l: Ladder): [number, number, number] {
    const off = shapeTravel(this.shapes.get(TRAVERSAL_CLIP.offLadder)).ahead;
    const past = Math.max(off - LADDER_STANDOFF, BODY_RADIUS + 0.5);
    return [l.x - l.nx * past, l.top, l.z - l.nz * past];
  }

  /**
   * B-50: the record seeded at a mount from the floor the mover stands on -- the walk's own pick, `selectFloor` from the
   * feet + the posture's lift (the record the original carries into the climb is the walk's last answered floor:
   * r0001 `FUN_00546cf0` D:L412496-412510 seeds it, `FUN_005b0420` refreshes it); the body's own point when none answers.
   */
  private seedLadderFloor(w: Walker): void {
    const s = w.state;
    const hit = selectFloor(probeGround(this.grid, s.x, s.z), s.y + probeLiftOf(w.posture), s.y);
    this.ladderFloor = [s.x, hit ? hit.y : s.y, s.z];
  }

  /**
   * B-50: a ladder tick's floor probe and the record's y (research 86 s2.7; the row 7 read, reading, pending review). One
   * vertical line through the body's column (r0004 0x2f05a8-0x2f05c8, +/-50000) and the walk's pick on it
   * (`selectFloor`: the highest at or under the origin + 1, else the lowest, refused more than 20 over the body; r0004
   * 0x5bc180, r0001 `FUN_005b5d40` D:L470199-470274). A hit becomes the record (r0004 0x5b6338-0x5b63a4); a miss keeps
   * it (`miss`), and the tick's END puts the body back on its point (`putBack`: r0004 0x5b6458-0x5b6468; r0001
   * `FUN_005b0420` D:L467091-467103, the frame's read step after the move, `FUN_00550570` D:L417768-417771), as the
   * walk's own miss does (`mover.ts`, "back at the last hit"). The column and the origin: `LADDER_PROBE_COLUMN_PLACEHOLDER`.
   * *Was* `groundUnder`: a fresh pick of the highest floor under the feet, null with none, which skipped the foot test
   * and the slide's landing (B-50's fall for ever).
   */
  private ladderFloorAt(w: Walker): { y: number; miss: boolean } {
    const s = w.state, a = axes(s.yaw), c = LADDER_PROBE_COLUMN_PLACEHOLDER;
    const hit = selectFloor(probeGround(this.grid, s.x + a.fx * c.ahead, s.z + a.fz * c.ahead), s.y + c.lift, s.y);
    if (hit) this.ladderFloor = [s.x, hit.y, s.z];
    else if (!this.ladderFloor) this.ladderFloor = [s.x, s.y, s.z];
    return { y: this.ladderFloor[1], miss: !hit };
  }

  /**
   * B-50 / L253 (R4P-240; reading, pending review): a miss's end of tick on the ladder -- the body back on the record's
   * point (r0004 0x5b6458-0x5b6468) and the SLOPE slide's speed zeroed. Both are `ProcessDownProbe` (r0004 `FUN_005b6200`;
   * the zero 0x5b6454 D4:L508319, the put-back D4:L508320, `+0x111c` 0x5b6480 D4:L508322), which the body's post-tick
   * runs for every state (its only call 0x5556f8, D4:L456462), not a ladder rule: the speed it zeroes is `+0x1344` in
   * r0004 -- `+0x1340` in r0001, CZSealBody's band r0004 +0x1338..+0x1374 sitting 4 above r0001's +0x1334..+0x1370 --
   * the slope slide's speed (written by r0004 0x553be0, D4:L455750-455755), and `+0x111c` (the steep-floor contact
   * record's last word: no counterpart owed). The walk's own put-back already stops the slide (`mover.ts`
   * `groundFrameMove`), so this one does as it does (`Walker.stopSlopeSlide`). Only while the switch byte r0004 0x40a390
   * is non-zero (the load 0x5b63d4, D4:L508278): built unconditionally, as the walk's is -- the byte reads 1 in r0004's
   * image with no writer or other reference, and IQ-120's capture of r0004 running (Q108-PC2, Fish Hook) read it 1 in the
   * round, on the ladder after the mount and after climbing off (the controller's ruling). Not ported, on this path or the walk's:
   * the miss also clears `+0x1061` bit 1, sets bit 2, calls the body's slot +0x10 and 0x55d5e0 (0x5b63e0-0x5b6474). The fall law's speed (r0004 `+0x1340`, integrated at 0x5a105c-0x5a1068) is not
   * touched. *Was* (the row 7 re-review F1): "+0x1344 unread, no speed touched" (atlas-parity's second read, c2d5527c8e).
   */
  private putBack(w: Walker): void {
    const s = w.state;
    [s.x, s.y, s.z] = this.ladderFloor!;
    w.stopSlopeSlide();
  }

  /**
   * State 5 (`FUN_00584240`): the stick's forward axis climbs at `LADDER_RATE` x K of the clip, 0.625 units a key; the
   * rungs sound at 0.01 and 0.5 of each cycle; at a cycle's end going up the head ray (`FUN_005b0eb0`) decides the
   * climb off; going down, the ground + 1.0 decides the step off; the action button slides.
   */
  private climbLadder(w: Walker, input: WalkInput, dt: number, pressed: boolean): void {
    const l = this.ladder!, s = w.state;
    s.yaw = this.lock ?? s.yaw;
    if (pressed) { this.startSlide(w); return; }
    const stick = Math.abs(input.forward) <= DEAD ? 0 : Math.max(-1, Math.min(1, input.forward));
    const keys = this.shapes.get(TRAVERSAL_CLIP.ladder).keys;
    const { keysPerSecond, perKey, rise } = this.shapes.ladderClimb();   // 0.135 x 1.7778 x 16 / 0.178 s = 21.6 at a full stick
    const before = this.phase;
    let next = before + stick * keysPerSecond * dt;
    // The head: at the cycle's end with the stick up.
    if (stick > 0 && next >= keys) {
      if (this.headClear(w)) { this.phase = 0; this.climbOffTop(w); return; }
    }
    // The foot: going down with the feet under the floor record + 1 (B-50: never skipped).
    const { y: ground, miss } = this.ladderFloorAt(w);
    let y = s.y + (next - before) * perKey;
    if (stick < 0 && y < ground + FOOT_CLEAR) {
      // B-50: on a miss the ORIGINAL steps off first (its move task, r0004 0x2a0930 -> 0x58c9c8) and the put-back is
      // the frame's last word (the read task, 0x2a06a0); the port puts back FIRST so its step-off clip starts where the
      // original's frame ends (row 7 fold delta F1).
      if (miss) this.putBack(w); else { y = Math.max(y, ground); s.y = y; }
      this.climbOffBottom(w, ground);
      return;
    }
    y = Math.min(y, this.headStart(l) + rise);                   // never past the head, whatever the ray says
    for (const at of RUNG_AT) {
      const k = at * keys;
      const crossed = stick > 0 ? before < k && next >= k || before < k + keys && next >= k + keys
        : stick < 0 ? before >= k && next < k || before >= k + keys && next < k + keys || before >= k - keys && next < k - keys : false;
      if (crossed) this.emit({ type: 'ladderRung', y });
    }
    next = ((next % keys) + keys) % keys;
    this.phase = next;
    s.y = y;
    s.vx = 0; s.vz = 0; s.vy = stick * perKey * keysPerSecond;
    if (miss) this.putBack(w);                                   // B-50: the frame's read step, after the move
  }

  /** `FUN_005b0eb0`: the ray from the root, raised by the climb off's rise less 1, `HEAD_RAY` along the facing; clear of ladder polygons. */
  private headClear(w: Walker): boolean {
    const s = w.state, a = axes(s.yaw);
    const up = this.ladderRoot() + shapeTravel(this.shapes.get(TRAVERSAL_CLIP.offLadder)).rise - 1;
    const from: [number, number, number] = [s.x, s.y + up, s.z];
    const to: [number, number, number] = [s.x + a.fx * HEAD_RAY, s.y + up, s.z + a.fz * HEAD_RAY];
    return segmentHits(this.grid, from, to, (p) => (p.appflags ?? 0) === APP_LADDER).length === 0;
  }

  /** "Climb off ladder" forward: from the ladder onto the deck, the mover stood on the top at its end (`FUN_00588bc0`). */
  private climbOffTop(w: Walker): void {
    const l = this.ladder!, s = w.state;
    const shape = this.shapes.get(TRAVERSAL_CLIP.offLadder);
    const path = new ClipPath(shape, [s.x, s.y, s.z], this.deckPoint(l), this.ladderRoot(), STAND_ROOT);
    this.run('ladderOffTop', TRAVERSAL_CLIP.offLadder, path, false, (m) => { this.emit({ type: 'ladderDismount', at: 'top' }); this.finish(m); });
  }

  /** "Stand -> Ladder" backwards: off the foot onto the ground, stepping back from the rungs. */
  private climbOffBottom(w: Walker, ground: number): void {
    const l = this.ladder!, s = w.state;
    const shape = reverseShape(this.shapes.get(TRAVERSAL_CLIP.toLadder));
    const back = Math.abs(shapeTravel(shape).ahead);
    const to: [number, number, number] = [s.x + l.nx * back, ground, s.z + l.nz * back];
    const path = new ClipPath(shape, [s.x, s.y, s.z], to, this.ladderRoot(), STAND_ROOT);
    this.run('ladderOffBottom', TRAVERSAL_CLIP.toLadder, path, true, (m) => { this.emit({ type: 'ladderDismount', at: 'bottom' }); this.finish(m); });
  }

  /** `FUN_0057f3e0`: "Ladder -> slide", then the slide itself. */
  private startSlide(w: Walker): void {
    const s = w.state;
    const shape = this.shapes.get(TRAVERSAL_CLIP.toSlide);
    const path = new ClipPath({ ...shape, root: shape.root }, [s.x, s.y, s.z], [s.x, s.y, s.z], this.ladderRoot(), SLIDE_ROOT);
    this.emit({ type: 'ladderSlide', on: true });
    this.run('ladderSlide', TRAVERSAL_CLIP.toSlide, path, false, () => { this.kind_ = 'ladderSlide'; this.slideVy = 0; this.slideTime = 0; });
  }

  /** The slide: gravity x 0.8 down the ladder (`FUN_0059b440`), the root at 11.44, until the ground under it. */
  private slide(w: Walker, dt: number): void {
    const s = w.state;
    s.yaw = this.lock ?? s.yaw;
    this.slideTime += dt;
    this.slideVy -= SEAL_TUNING.gravity * SLIDE_GRAVITY * dt;
    const { y: ground, miss } = this.ladderFloorAt(w);         // B-50: the record's y ends it (r0004 0x5a11e8-0x5a11f4)
    let y = s.y + this.slideVy * dt;
    s.vy = this.slideVy;
    if (y <= ground) {
      // B-50: the original lands first (the fall law, r0004 0x5b5874, in the move task 0x2a0930) and the read task's
      // put-back (0x2a06a0) is the frame's last word; the port puts back FIRST so its landing clip starts where the
      // original's frame ends (row 7 fold delta F1).
      if (miss) this.putBack(w);
      else s.y = ground;
      this.land(w);
      return;
    }
    s.y = y;
    if (miss) this.putBack(w);                                   // the read step: back on the record (the fall speed kept)
  }

  /** `FUN_0057f310`: "Ladderslide land" on the ground, stepping back off the rungs as the clip does. */
  private land(w: Walker): void {
    const l = this.ladder!, s = w.state;
    this.emit({ type: 'ladderSlide', on: false });
    this.emit({ type: 'ladderSlideLand', speed: Math.max(0, -this.slideVy) });
    const shape = this.shapes.get(TRAVERSAL_CLIP.slideLand);
    const back = Math.max(0, -shapeTravel(shape).ahead);
    const to: [number, number, number] = [s.x + l.nx * back, s.y, s.z + l.nz * back];
    const path = new ClipPath(shape, [s.x, s.y, s.z], to, SLIDE_ROOT, STAND_ROOT);
    this.run('ladderSlideLand', TRAVERSAL_CLIP.slideLand, path, false, (m) => this.finish(m));
  }

  /**
   * LATER 526 (`TraversalHooks.keep`): every field but the shared ones (`TRAVERSAL_KEPT_SHARED`), by value or by reference,
   * a plain-object field copied one level deep (LATER 526's review F7). A reference to a move's object is safe to keep:
   * what the moves change in place (a running clip's clock, a dive's) is let go by `reset` (a new object for each move) or
   * replaced whole each tick (the ripple), so after the take's pop nothing writes it. Not a peek's `popped`: `mountPop`
   * resets the traversal only when a move holds it (`./net/blast`), so that object stays live and the next tick writes it
   * in place (`popped.wait = false`) -- the copy keeps the value at the take.
   */
  keep(): TraversalKept {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this)) {
      if (TRAVERSAL_KEPT_SHARED.has(k)) continue;
      const plain = typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
      kept[k] = plain ? { ...(v as Record<string, unknown>) } : v;
    }
    return kept as TraversalKept;
  }

  /** LATER 526 (`TraversalHooks.restore`): the state `keep` kept laid back (no event is heard: the move is put back). */
  restore(kept: TraversalKept): void {
    Object.assign(this, kept as Record<string, unknown>);
  }

  /** Drops any move (a new pose from the hook, leaving the walk): the mover is the walk's again. */
  reset(w?: Walker): void {
    this.running = null;
    this.kind_ = 'none';
    this.ladder = null;
    this.ladderFloor = null;
    this.lock = null;
    this.actionPressed = false;
    this.leanOn = null;
    this.popped = null;
    this.peekValue = 0;
    this.contact = null;
    this.plan = null;
    this.ladderOffer = null;
    this.climbing = null;
    this.hangRoot = null;
    this.turn = null;
    this.diving = null;
    this.diveEnd = null;
    this.endWalker = null;
    this.actionHeld = false;
    if (w) w.setAirborne(false);
  }
}

/** A polygon's height (its points' y span): `FUN_002dbfb0`'s top less its bottom, at most 15 the short ladder quad. */
function quadHeight(p: WorldPoly): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < p.points.length; i += 3) { lo = Math.min(lo, p.points[i]!); hi = Math.max(hi, p.points[i]!); }
  return hi - lo;
}

/** `FUN_005b3890`: a ladder's short quad (at most 15 tall) is dropped with the feet more than 10 under its bottom. */
function shortDrop(c: ClimbContact, y: number): boolean {
  if (c.app !== APP_LADDER) return false;
  let lo = Infinity;
  for (let i = 1; i < c.poly.points.length; i += 3) lo = Math.min(lo, c.poly.points[i]!);
  return quadHeight(c.poly) <= SHORT_QUAD && y + SHORT_REACH < lo;
}
