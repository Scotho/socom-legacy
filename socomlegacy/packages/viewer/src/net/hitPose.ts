import { itemClass, Skeleton, type MotionClip } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../animator';
import type { HoldClip, PlaySnapshot } from '../mover';
import type { MotionTable } from '../motionTable';
import { leanClip, TRAVERSAL_CLIPS } from '../traversal';
import { snapshotOf } from './body';
import { quantiseBody } from './codec';
import { FIRE_VERSIONS, WeaponPose } from '../weaponPose';
import { RaiseFeed, WeaponRaise } from '../weaponRaise';
import { THROW_CLIPS, ThrowPose } from '../throwPose';
import { ALL_RELOAD_CLIPS, type ReloadItem, type ReloadStance } from '../reloadClip';
import { reloadCutOf } from '../reloadLock';
import { remoteKitOf } from '../remotePresentation';
import { boneTable, keepBounds, LEAN_HIT_POSE_READING, leanHeldKey, posedBoxes, type BoneBox } from './hitVolumes';
import type { BodyState } from './protocol';
import { ACTION_FAMILY } from '../mover';
import { AXIS_DEAD, CIV_ANIM_SET, HOSTAGE_TOP_SPEED_READING, oneShotSeconds, type AnimSet } from '../locomotion';

/**
 * HIT-POSE (owner priority, 2026-11-10; research 217 s3.6; reading, pending review): the room's hit body is the live
 * skeleton. The original's round meets the actor's skeleton nodes as the animation left them that frame
 * (`FUN_005abbc0` D:L464672-464803, the nodes bound in `FUN_00553ea0` D:L419606-419652; research 91 s1.3) -- a runner's
 * head where the run clip carries it, a crouch-walker's where the crouch-walk does. The room judged every body at its
 * stance's idle key (`./hitVolumes` `stanceVolumes`), while the shooter's page drew it playing its locomotion: a
 * crouch-walker's drawn head stood 2.8-3.0 u over the room's, a runner's 1.6-2.0 u under it and 2.4-2.9 u ahead.
 *
 * So the room runs, per living player, the page's own `Animator` (`../animator`: what a remote copy plays,
 * `../remotePlayers`) on its own instance of the player's skeleton, stepped once a room tick by the tick's `dt` on the
 * `PlaySnapshot` the room builds for the wire (`hitPoseSnapshot`: `./body` `snapshotOf` of the room's `BodyState` as the
 * codec carries it, `./codec` `quantiseBody` -- the same snapshot a page's copy takes), and keeps the pose it leaves on
 * the tick's rewind entry: every boxed bone's matrix in the poser's ring (`HitPoser.keep`; BONE-BOXES, research 217
 * s3.6b: the original's box on every bone, research 398 s1), read as boxes (`HitPoser.boxesAt`: views on the ring, no
 * copy) only for a body a round's ray reaches -- the perf fold, research 217 s3.6a. The pose carries the root tilt (the
 * animator writes `MoverSnapshot.rootTilt` on the root, `FUN_00548090`'s write) and the lean (the traversal's clip,
 * `../traversal` `Traversal.pose`): `placedVolumes` turns neither again. Without the motion (no `motion.rdr`, no pack:
 * `../simMap` `SimSkeleton.motion` absent) the room keeps the idle sets, and without a skeleton the placeholder capsules.
 *
 * What is not the page's (each named, research 217 s6):
 * - `HIT_POSE_CLOCK_READING`: the two clocks' phase.
 * - `HIT_POSE_RANDOM_READING`: the animator's draws (the crouch's three idles, the head look).
 * - `HIT_POSE_LAYERS_READING`: what the page's `Play` lays over the animator that the room does not feed (since FIRE-LAYER
 *   FL-1 the room feeds the Fire set; since PRONE-THROW-HITBOX the throw layer, the hands' `../throwPose`; since
 *   RELOAD-HITPOSE the reload, started at the room's take; the rest not).
 * - `HIT_POSE_MOUNT_READING`: a mounted gunner stays on the idle set, in the room and in the page's aim.
 * - `LEAN_HIT_POSE_READING` 'held' stands: under a peek the lean clip is posed at its held key from the press (the
 *   page draws its rise), as the idle sets' lean was.
 */

/** The motion a hit body is posed with: the clips the page draws a copy with (`HIT_POSE_CLIPS`) and `motion.rdr`'s table. */
export interface HitMotion { readonly clips: readonly MotionClip[]; readonly table: MotionTable | null }

/**
 * The clips the room's animator is given: the page's plays (`../animator` `PLAY_CLIPS`, the locomotion, the actions,
 * their pistol versions), the traversal moves' (`../traversal` `TRAVERSAL_CLIPS`: the ladders, the climbs, the
 * leans) -- what a remote copy's animator plays off the snapshot -- (FIRE-LAYER FL-1) the rifle's Fire versions
 * (`../weaponPose` `FIRE_VERSIONS`' clips, out of the page's `WEAPON_CLIPS`), which the poser's `WeaponPose.fireLayer`
 * lays, (PRONE-THROW-HITBOX) the throws', tosses' and placings' clips (`../throwPose` `THROW_CLIPS`), which the
 * poser's `ThrowPose` lays from the hold, and (RELOAD-HITPOSE) every reload and after-shot clip (`../reloadClip`
 * `ALL_RELOAD_CLIPS`, out of the page's `WEAPON_CLIPS`), which the poser's `WeaponPose.reloadLayer` lays from the room's
 * take (`HitPoser.startReload`). The other one-shots the page lays as pose layers (the pistol's Fire versions, the
 * binoculars, the flinches, the deaths) are not among them (`HIT_POSE_LAYERS_READING`).
 */
export const HIT_POSE_CLIPS: readonly string[] = [...new Set([...PLAY_CLIPS, ...TRAVERSAL_CLIPS, ...Object.values(FIRE_VERSIONS), ...THROW_CLIPS, ...ALL_RELOAD_CLIPS])];

/**
 * HIT-POSE: the clock the room's animator runs on [reading]. 'tick': once a room tick (`TICK_HZ`), by `1 / TICK_HZ`,
 * on that tick's snapshot of the body. The shooter's page steps its copy every drawn frame on snapshots it receives at
 * `SNAPSHOT_HZ` (quantised by `./codec`) and draws `INTERP_DELAY_MS` behind; a copy built later (a joiner, a body come
 * into view) starts its plays from its first snapshot. So the room's phase of a loop and the page's are not aligned by
 * anything -- each runs the same plays from the same snapshots, the play changes at the same ticks, but a page that
 * dropped or merged frames can sit a fraction of a cycle off. The original's round meets the shooter's console's own
 * copy of the body (its phase that console's); there is one judge here. Settles with a capture of the drawn body's
 * phase on two consoles at once, or the room's phase sent to the pages (a wire change, not made).
 */
export const HIT_POSE_CLOCK_READING: 'tick' | 'shown' = 'tick';

/**
 * HIT-POSE: the room's animator draws every random number as this [reading]: the crouch's three idles
 * (`CROUCH_IDLES`, the first at 0) and the head look's turns (`../headLook`). A page's copy draws `Math.random`, so a
 * still crouched body's idle and a looking head can differ between the room and the page. The original's copies draw
 * their own too (each console's); nothing is on the wire to align them.
 */
export const HIT_POSE_RANDOM_READING = 0;

/**
 * HIT-POSE: what the page's `Play` lays over its copy's animator that the room does not feed [reading].
 * 'fire-throw-reload' (RELOAD-HITPOSE, 2026-11-25; reading, pending review): the room feeds the Fire set and the throw
 * layer (below) and the **reload** as the page lays it on a remote copy, by the page's own code -- the room's take
 * (`room.ts` `reload`, the step that sends `reloadSound` with its posture, `moving`, family and seconds) starts the
 * poser's `WeaponPose.startReload` with those four (`HitPoser.startReload`: `remotePlayers.ts` `RemotePlayers.reload`'s
 * guard, `play.ts` `remoteReload`), and a take the page is not told (a worded take's `late`) starts none; the clip runs on
 * the poser's tick (`WeaponPose.step` with the page's stick cut, `hitPoseReloadCut`, and `airborne`, as `play.ts`
 * `frame`); the room's flinch ends a crouched or prone still clip (`HitPoser.stopReload('flinch')`,
 * `Play.stopRemoteReload`); a death drops the poser (`room.ts` `hitPose`: a dead body is not posed), as the page's copy
 * stops its clip at the kill; a spawn and a round's start make it anew, as the page rebuilds its copy. What the page's
 * copy is not told the poser is not told: the room's own ends of the lock (a knock, a mount's take, a swap, a cancel) end
 * neither clip (LATER 811 for the knock). The original's (r0001 lines (D:L), r0004 twins per the atlas; the read of
 * 2026-11-25, reading, pending review): a still reload is pushed on the action stack's top (`CZSealBody::Reload`
 * `FUN_005a82e0` D:L462815-462941, r0004 0x5ae000 unchanged; started from `CZKit::Reload` `FUN_005c2a90` D:L477479,
 * r0004 0x5c9f60, CHANGED per the atlas: a constant, lbu 220 -> 224), the moving reload, the pump and the swap play on the
 * second channel (`+0x1e4`; the moving reload routed there by `FUN_00588bc0` D:L446083-446086), and the pose pass
 * draws the stack, then that channel (`FUN_00577ea0` D:L437415-437470, the channel D:L437456-437461; r0004 0x57d280
 * unchanged), so the round meets the bones in the posed reload. The finding: the pilot's hit-pose audit (2026-11-25, a
 * rendered run) measured the drawn body up to 8.6 u from the room's boxes through a still reload standing, 5.8
 * crouched, 7.6 prone and 7.2 through the moving overlay (`hitPoseReloadLayer.test.ts`). The review's F1 (ONE-CLOCK,
 * fixed; a BROWSER ADAPTATION -- the page's interpolation delay has no original): the page's copy started its clip when the event ARRIVED,
 * about six ticks before it draws the body at the take, while the poser is judged at the shooter's drawn tick
 * (`room.ts` `drawnPastOf`) -- the drawn reload led the judged pose by 4.3-4.9 ticks (a rendered run, up to 3.4 u); the
 * page now starts it on the drawn clock (`remotePlayers.ts` `RemotePlayers.frame`'s `releaseHeard`: the event marked
 * with `NetClient.heardTick`, released once `NetClient.shownTick` passes the mark, run on by the ticks past it), its
 * flinch's and kill's ends likewise (`remoteReloadDrawnClock.test.ts`): the start and end edges align with the poser's at
 * the drawn tick, the phase within about -1 to +2 ticks, a mean lead of about half a tick (the room's whole-snapshot
 * staircase against the page's continuous drawn clock; the delta review, 2026-11-25). 'fire-throw'
 * (PRONE-THROW-HITBOX, 2026-11-25 to RELOAD-HITPOSE; reading, pending review): the room fed the Fire set (below) and the
 * **throw layer**
 * as the page lays it on a remote copy, by the page's own code -- a `ThrowPose` following the wire's hold code and its
 * serial (`ThrowPose.follow`, the pistol's version with the sidearm in the hand by `remoteKitOf`, as `remotePlayers.ts`
 * `frame`), stepped by the tick before the play, laid after the Fire and reload layers (`play.ts` `addPoseLayer`): a
 * throw's, a toss's or a placing's clip is the action stack's top alone at weight 1 from its push to its pop (the hold's
 * end), eased in over the clip's `BlendTime` (`FUN_0028dc90` D:L135215-135220), the parts the clip lacks holding the
 * pose at the push (`FUN_005777d0` D:L437177-437295); with no such hold it lays nothing. The original's (r0001 lines
 * (D:L), r0004 twins per the atlas; the read of 2026-11-25, reading, pending review): the throw is pushed on the
 * stack's top (BeginThrowItem `FUN_005802b0` D:L441882-441905, r0004 0x585850 -> `FUN_00588bc0` D:L446083-446086,
 * D:L446292, r0004 0x58e160 -- CHANGED in r0004, +0x1336 -> +0x133a, the anim-kind field, not the push), the pose pass
 * draws the stack (`FUN_00577ea0` D:L437415-437470) and the round meets each bone's box in that pose (`FUN_0058b960`
 * D:L447557-447593, r0004 0x590f60 unchanged), so the original hit-tests a thrower in the posed throw clip. The
 * finding: a prone thrower (`seal_prone_throwgrenade`) was judged lying flat while every page aimed at the raised throw
 * (match 5321-6-1795582723449; LATER 1579). The thrower's own aim root follows the throw's posed root in the room as on
 * the page (`room.ts` `aimRootOf` reads `rootY`; `hitPoseThrowLayer.test.ts`). 'fire'
 * (FIRE-LAYER FL-1, 2026-11-14; FL.R1, FL.R3; LATER 1025; research 217 s3.6a): the room feeds the **Fire set** as the
 * page lays it on a remote copy, by the page's own code -- a `WeaponRaise` fed each tick the body's `raised`
 * (`BodyFlag.Raised`, ER-2) through `RaiseFeed.input`, at the copy's times (a remote copy never calls `setRaiseTimes`:
 * `RAISE_TIMES`, `FUN_005dffc0`), its EASED weight (`FUN_00286b80`) on `WeaponPose.fireLayer` over the poser's
 * `Animator`, 0 while a rocket launcher is in the hand (`launcherInHand`: the copy stows its rifle and `play.ts` lays no
 * Fire set under the launcher set, `FUN_0057a330` D:L438829). Only a play whose type has a Fire version blends
 * (`WeaponPose.sampleFire` over `FIRE_VERSIONS`: `FUN_0057a330` D:L438828-438860, `FUN_005551a0(..., 0x40)` D:L438710).
 * Not fed (each its own task against its own capture, FL.R3): the pistol's set -- the pistol's slot (the snapshot's
 * `weapon` 1) lays nothing, where the page lays `PISTOL_FIRE_VERSIONS` over the pistol's plays (`Animator.setWeapon`),
 * and through a swap clip the room keeps the slot's rifle where the page's copy already holds the pistol
 * (`remotePlayers.ts` `remoteKitOf`), so a pistol's reload plays its own clip over the rifle's set beneath; the bolt's
 * and the pump's after-shot clip (no take is sent, LATER 810); the binoculars, `../binocularPose` (no `network_log` path found for them, research 201); the flinch;
 * the victory dance; the
 * launcher set's own rows (`setLauncherSet`); `aimWeight` (the animator's `AIM_WEIGHT_PLACEHOLDER`, where the page passes
 * its raise's weight). Each moves the arms and the spine more than the head; a reload can move the head too.
 * The poser equals the page's copy only at `aimWeight`'s placeholder 1 (a steadily raised body): the page passes the
 * raise's weight (`play.ts` `frame`), so through the raise and the lower a pitched body's spine twist is whole here and
 * scaled on the page, and a lowered body's head look runs on the page at weight 0 and not here. Every body eases on
 * `RAISE_TIMES`, as a remote copy does (only the own body calls `setRaiseTimes`, `ZERO_RAISE_TIMES` under a mount or with
 * an item up; how the original's copy times its raise there is unread). Settles with each fed from what the room
 * already holds, one at a time, each against its capture. Was 'none' (HIT-POSE to FL-1): no layer at all; 'fire' (FL-1
 * to PRONE-THROW-HITBOX): the Fire set alone; 'fire-throw' (PRONE-THROW-HITBOX to RELOAD-HITPOSE): no reload started.
 */
export const HIT_POSE_LAYERS_READING: 'none' | 'fire' | 'fire-throw' | 'fire-throw-reload' | 'fed' = 'fire-throw-reload';

/** `play.ts`' `NO_CUT_STICK`: the move axes of a snapshot that carries none. */
const NO_CUT_STICK = Object.freeze({ forward: 0, right: 0 });

/**
 * RELOAD-HITPOSE: the stick's cut of a still reload clip on a body's snapshot -- `play.ts` `reloadCut`, transcribed (that
 * module draws with three.js, so the room does not import it; `hitPoseReloadLayer.test.ts` holds the two equal): a move
 * axis (the snapshot's `cutStick`, the replicated ground stick) or the turn past `INTERRUPT_STICK`, none in the air or on
 * a bare landing (`../reloadLock` `reloadCutOf`; `FUN_00550ef0` D:L418182-418185).
 */
export function hitPoseReloadCut(snap: Pick<PlaySnapshot, 'turnRate' | 'airborne'> & Partial<Pick<PlaySnapshot, 'cutStick' | 'landedBare'>>): boolean {
  return reloadCutOf(snap.cutStick ?? NO_CUT_STICK, snap.turnRate, snap.airborne || snap.landedBare === true);
}

/** No item (`./body`'s `NO_ITEM`, `EQUIP_NONE`): the body's `weapon` when its kit is not known. */
const NO_ITEM = 255;

/**
 * FIRE-LAYER FL-1: the rocket launcher a remote copy holds in its hand this frame, or null -- `remotePlayers.ts`
 * `remoteLauncherInHand`, transcribed (that module draws with three.js and imports this one, so the room cannot import
 * it; `hitPoseFireLayer.test.ts` holds the two equal): the snapshot's item when it is a rocket launcher (`itemClass`
 * 'rocketLauncher'), else, through the launcher's still lower (`rifleToLauncher` / `pistolToLauncher` reversed), the one
 * already in the hand (`inHand`: the last frame's answer, as `placeLauncher` keeps it).
 */
export function launcherInHand(item: number, action: PlaySnapshot['action'], inHand: number | null): number | null {
  if (item !== NO_ITEM && itemClass(item) === 'rocketLauncher') return item;
  const lowering = action !== null && action.reversed && (action.name === 'rifleToLauncher' || action.name === 'pistolToLauncher');
  return lowering ? inHand : null;
}

/** What the poser reads off a body's snapshot beside the mover (`./body` `snapshotOf`'s extras); absent, lowered and the rifle. */
export type HitPoseSnapshot = MoverSnapshot & Partial<Pick<ReturnType<typeof snapshotOf>, 'raised' | 'trigger' | 'aiming' | 'weapon' | 'item' | 'holdSerial'>>;

/** The six lean clips (`../traversal` `leanClip`): a traversal pose on one of them is a peek. */
const LEAN_CLIPS: ReadonlySet<string> = new Set((['stand', 'crouch', 'prone'] as const).flatMap((k) => [leanClip(k, -1), leanClip(k, 1)]));

/**
 * HIT-POSE: a mounted gunner's hit body [reading]. 'idle': while the room's seat holds a turret (`Player.mounted`) the
 * round meets the stance's idle set (`./hitVolumes` `bodyVolumes`), in the room and in the page's aim alike
 * (`../remotePlayers` `aimBody`), as both judged every body before HIT-POSE -- the page draws the gunner on the turret
 * anim set's mount or hold clip (`../turretPage` `turretPose`, MAP-10b), which the room's poser is not fed
 * (`HIT_POSE_CLIPS` holds no `TURRET_CLIPS`, and the clip's frame is the seat's steer). The room's poser keeps stepping on
 * the body's snapshot meanwhile, so its clock runs on through a mount. 'posed' would feed the poser the turret clip at
 * the seat's steer frame, as the page draws it. Settles with that feed and its A = B test against the page's mount pose.
 */
export const HIT_POSE_MOUNT_READING: 'idle' | 'posed' = 'idle';

/** A `BodyState` to be written over (`./codec` `quantiseBody`'s `out`): a poser's own, one a body. */
export function wireScratch(): BodyState {
  return {
    id: 0, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 0,
    groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: 0, overlay: 0,
    overlayT: 0, overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: 0, travBlend: 0, travBlendWeight: 0, peek: 0,
    weapon: 0, slot: 0, stickSnaps: 0,
  };
}

/**
 * The snapshot the room's animator takes for a body: the wire's `BodyState` as a page decodes it (`./codec`
 * `quantiseBody`, written into `wire`: the yaw to 1/65536 turn, the stick to 1/127, the speeds, the clip seconds, the
 * feet to `FEET_STEP` -- the numbers `encodeSnapshot` / `decodeSnapshot` give, without the frame; the perf fold,
 * research 217 s3.6a) and turns it (`./body` `snapshotOf`), with the root's tilt the room's walker wrote
 * (`Walker.rootTilt`; the page runs its own from its floor, `../remotePlayers` `remoteTilt`, on the same rule).
 */
export function hitPoseSnapshot(body: BodyState, rootTilt: MoverSnapshot['rootTilt'], wire: BodyState = wireScratch()): HitPoseSnapshot {
  const snap: HitPoseSnapshot = snapshotOf(quantiseBody(body, wire));
  snap.rootTilt = rootTilt ?? null;
  return snap;
}

/**
 * LATER 831 (HIT-POSE for the hostages; research 237 s2.5; reading, pending review): a hostage's snapshot as the page's
 * copy plays it -- `../remotePlayers` `escorteeSnapshot`, transcribed (that module draws with three.js and imports this
 * one, so the room cannot import it; `../../../match/test/hitPoseHostage.test.ts` holds the two equal): by the stance and
 * the speed alone, the No_weapon set's forward bands at speed / `HOSTAGE_TOP_SPEED_READING.forward` standing past
 * `AXIS_DEAD`, its idle otherwise; a knock's reaction or get-up kept with its flight; else `transition`'s stand-to-crouch
 * (`HOSTAGE_CROUCH_CLIP_READING`); no item, aim, trigger, landing, overlay, traversal or peek.
 */
export function escorteeHitSnapshot(snap: HitPoseSnapshot, transition: { serial: number; t: number; seconds: number } | null): HitPoseSnapshot {
  const m = Math.min(1, Math.hypot(snap.vx, snap.vz) / HOSTAGE_TOP_SPEED_READING.forward);
  const moving = snap.stance === 'stand' && m > AXIS_DEAD;
  const knock = snap.action && (ACTION_FAMILY[snap.action.name] === 'reaction' || ACTION_FAMILY[snap.action.name] === 'getUp') ? snap.action : null;
  // `peek: 0` as the page's (`remotePlayers` `escorteeSnapshot`: no lean for a hostage), though `HitPoseSnapshot` does not
  // name it (nor `boost`, `binoculars`): typed with them, so the page's whole field set carries (the 831 delta review, TS2353).
  const out: HitPoseSnapshot & { peek: number; boost: boolean; binoculars: boolean } = {
    ...snap, airborne: snap.airborne && knock !== null, landing: null, overlay: null, traversal: null, peek: 0,
    action: knock ?? (transition ? { name: 'standToCrouch', serial: transition.serial, t: transition.t, seconds: transition.seconds, reversed: false } : null),
    ground: moving ? { state: 'stand', forward: m, right: 0, cls: 1 } : { state: 'idle', forward: 0, right: 0, cls: -1 },
    item: NO_ITEM, weapon: 0, aiming: false, trigger: false, boost: false, binoculars: false,
  };
  return out;
}

/**
 * LATER 831: the hostage's stand-to-crouch transition as the page's copy keeps it -- `../remotePlayers`
 * `RemotePlayers.escorteeTransition`, transcribed (held equal by `hitPoseHostage.test.ts`): started when the stance turns
 * from stand to crouch, run on by `dt`, ended once its one-shot has played (`oneShotSeconds` of the No_weapon set's
 * `standToCrouch` clip's `motion.rdr` playback and keys) or the stance leaves crouch; a body first seen crouched starts
 * crouched. `HOSTAGE_HIT_POSE_TRANSITION_READING`: the room runs it on its own tick's stance, the page on the drawn one.
 */
export class EscorteeTransition {
  private was: HitPoseSnapshot['stance'] | null = null;
  private transition: { serial: number; t: number; seconds: number } | null = null;
  private readonly seconds: number;

  constructor(motion: HitMotion) {
    const name = CIV_ANIM_SET.standToCrouch;
    const clip = motion.clips.find((c) => c.name === name);
    const playback = motion.table?.get(name)?.playback ?? null;
    this.seconds = clip && playback !== null ? oneShotSeconds(playback, clip.frameCount) : 0;
  }

  /** The transition this step (a copy), or null. */
  step(stance: HitPoseSnapshot['stance'], dt: number): { serial: number; t: number; seconds: number } | null {
    const was = this.was;
    this.was = stance;
    if (stance !== 'crouch') this.transition = null;
    else if (was === 'stand') {
      this.transition = this.seconds > 0 ? { serial: ((this.transition?.serial ?? 0) + 1) & 0xff, t: 0, seconds: this.seconds } : null;
    } else if (this.transition) {
      this.transition.t += dt;
      if (this.transition.t >= this.transition.seconds) this.transition = null;
    }
    return this.transition ? { ...this.transition } : null;
  }
}

/**
 * LATER 831 (research 237 s2.5): the hostage's stand-to-crouch clock in the room [reading]. 'room-tick': the room's
 * `EscorteeTransition` starts at the tick the room's AI turns the stance and runs by the tick; the page's copy starts it
 * at the first frame whose DRAWN body (the newer snapshot's stance, `../net/client` `bodiesAt`) is crouched and runs it
 * by its frames. So for the clip's 0.4 s (`CIV_CLIPS_READING` `civ_stand2crouch`) the room's key can lead the page's by
 * up to a snapshot interval (`TICK_HZ / SNAPSHOT_HZ` ticks) less the render moment's fraction. Nothing on the wire carries
 * the transition's clock (the snapshot's stance only). Settles with the clock on the wire, or the room's poser started on
 * the snapshot tick the stance is first sent crouched (`drawnPastOf`'s newer entry), against a capture of the drawn kneel.
 */
export const HOSTAGE_HIT_POSE_TRANSITION_READING: 'room-tick' | 'snapshot' = 'room-tick';

/**
 * One body's live pose in the room: the page's `Animator` on its own `Skeleton` instance (a skeleton is never shared:
 * the animator writes its matrices), stepped once a tick (`step`, `stepBody`). The perf fold (research 217 s3.6a): the
 * pose a step leaves is kept as floats (`keep`: every boxed bone's matrix, `./hitVolumes` `boneTable`; BONE-BOXES, s3.6b)
 * in a ring of `ticks` poses allocated once, with each slot's boxes made once over it (`boxesAt`: views on the ring, no
 * allocation a call) -- read only for a body a round's ray reaches; `boxes` copies the live pose at once (the eager
 * path: the tests').
 */
export class HitPoser {
  private readonly skeleton: Skeleton;
  private readonly animator: Animator;
  /** FL-1 (`HIT_POSE_LAYERS_READING` 'fire'): the copy's Fire set and its raise, as `play.ts` builds them for a remote copy. */
  private readonly weapon: WeaponPose;
  private readonly raise = new WeaponRaise();
  private readonly feed = new RaiseFeed();
  /**
   * PRONE-THROW-HITBOX (`HIT_POSE_LAYERS_READING` 'fire-throw'): the copy's hands, as `remotePlayers.ts` makes them for a
   * remote copy (`hands`, laid by `play.addPoseLayer` after the Fire and reload layers); null for a hostage's poser (the
   * constructor's `anims`: the page's escortee copy plays no hands, `HOSTAGE_HANDS_PLACEHOLDER`).
   */
  private readonly hands: ThrowPose | null;
  /** FL-1: the rocket launcher in the hand at the last step (`launcherInHand`), or null. */
  private launcher: number | null = null;
  /** FL-1: the snapshot's hold code as `RaiseFeed.input` reads it (`PlaySnapshot.hold`), rewritten each step. */
  private readonly held: { hold: HoldClip | null; holdSerial: number | undefined } = { hold: null, holdSerial: undefined };
  private readonly keys = new Map<string, MotionClip>();
  private readonly wire = wireScratch();
  private readonly ring: Float32Array;
  private readonly stamps: Float64Array;
  /**
   * FIRE-LAYER FL-2 (an instrument's read, `fireWeightAt`): each ring slot's Fire weight, the one laid on the pose kept
   * there (`WeaponPose.fireWeight` at `keep`). Nothing the poser poses or the room judges reads it.
   */
  private readonly weights: Float64Array;
  /** Each ring slot's boxes, made once: their matrices are views on the slot's floats. */
  private readonly slots: readonly (readonly BoneBox[])[];
  /** Each ring slot's bounds (body frame, `./hitVolumes` `boxBounds`), rewritten as the slot is kept: the cull's widening. */
  private readonly bounds: readonly Float64Array[];
  private readonly bones: Int16Array;
  private readonly floats: number;
  private kept = 0;

  /**
   * `ticks`: how many poses `keep` holds (the room's rewind history), the oldest written over. `anims`: the body's anim set
   * (LATER 831: a hostage's, `CIV_ANIM_SET`, as the page's copy `setAnimSet`s it); absent, the Seal set's.
   */
  constructor(skeleton: Skeleton, motion: HitMotion, ticks = 1, anims?: AnimSet) {
    this.skeleton = new Skeleton(skeleton.model, skeleton.modelMatrix, skeleton.parts);
    this.animator = new Animator(this.skeleton, motion.clips, motion.table, { random: () => HIT_POSE_RANDOM_READING, ...(anims ? { anims } : {}) });
    // FL-1: `play.ts` `rebuild`'s layers -- the Fire set and the reload over the clips, the rifle's item
    const byName = new Map(motion.clips.map((c) => [c.name, c]));
    this.weapon = new WeaponPose(byName, motion.table);
    this.weapon.item = 'rifle';
    this.animator.addPoseLayer(this.weapon.fireLayer);
    this.animator.addPoseLayer(this.weapon.reloadLayer);
    // PRONE-THROW-HITBOX: the hands' clip over them (`remotePlayers.ts` `add`: `play.addPoseLayer(r.hands.layer)`), its
    // source the poser's own clips and table, made once (the page's `Play.motionSource` makes the same maps each ask)
    const source = { clips: byName, table: motion.table };
    // LATER 1024's risk: the hands are gated on `anims` (a hostage's set); a future non-SEAL PLAYER set passed here loses them
    this.hands = anims ? null : new ThrowPose(() => source);
    if (this.hands) this.animator.addPoseLayer(this.hands.layer);
    for (const c of motion.clips) if (LEAN_CLIPS.has(c.name)) this.keys.set(c.name, c);
    const n = Math.max(1, Math.floor(ticks));
    const table = boneTable(this.skeleton.parts);
    this.bones = table.index;
    this.floats = table.index.length * 16;
    this.ring = new Float32Array(n * this.floats);
    this.stamps = new Float64Array(n);
    this.weights = new Float64Array(n);
    this.slots = Array.from({ length: n }, (_, k) => Array.from(table.index, (bone, b): BoneBox => {
      const at = k * this.floats + b * 16;
      return { part: table.part[b]!, bone, box: table.box[b]!, w: this.ring.subarray(at, at + 16) };
    }));
    this.bounds = Array.from({ length: n }, () => new Float64Array(6));
  }

  /** One tick of `dt` seconds on the room's `BodyState` of the body as the wire carries it (`hitPoseSnapshot` into the poser's own `wire`). */
  stepBody(dt: number, body: BodyState, rootTilt: MoverSnapshot['rootTilt']): void {
    this.step(dt, hitPoseSnapshot(body, rootTilt, this.wire));
  }

  /**
   * LATER 831: one tick of a hostage's body -- its wire snapshot (`hitPoseSnapshot` into the poser's own `wire`) turned as
   * the page's copy turns it (`escorteeHitSnapshot`, with `transition`'s stand-to-crouch run on by `dt`). The poser is made
   * with the No_weapon set (`CIV_ANIM_SET`, the constructor's `anims`), as the page's copy's `Play` is.
   */
  stepEscortee(dt: number, body: BodyState, rootTilt: MoverSnapshot['rootTilt'], transition: EscorteeTransition): void {
    const snap = hitPoseSnapshot(body, rootTilt, this.wire);
    this.step(dt, escorteeHitSnapshot(snap, transition.step(snap.stance, dt)));
  }

  /**
   * One tick of `dt` seconds on the body's snapshot. `LEAN_HIT_POSE_READING` 'held': a peek's clip is posed at its held
   * key (`./hitVolumes` `leanHeldKey`) from the press, as the idle sets' lean was -- the rise the page draws is not
   * judged; 'clip' would pass the traversal's own key.
   *
   * FL-1 (`HIT_POSE_LAYERS_READING` 'fire'): first the raise, as `play.ts` `frame` runs it for a remote copy -- `raise.frame`
   * on `RaiseFeed.input` with the body's `raised` (ER-2: the copy requests the owner's state each game frame and runs the
   * envelope), its eased weight the Fire layer's, 0 with a rocket launcher in the hand or the pistol's slot, and
   * `WeaponPose.step` (the Fire clip's own clock) -- then the animator.
   *
   * PRONE-THROW-HITBOX (`HIT_POSE_LAYERS_READING` 'fire-throw'): before them the hands, as `remotePlayers.ts` `frame`
   * runs them for a living copy -- `ThrowPose.follow` on the wire's hold and serial (a throw's, a toss's or a placing's
   * starts its clip, its change or end pops it), the pistol's version with the sidearm in the hand (`remoteKitOf`), then
   * `ThrowPose.step` by the tick. Only a living body is posed (`room.ts` `hitPose`), so the page's dead branch has no twin.
   *
   * RELOAD-HITPOSE (`HIT_POSE_LAYERS_READING` 'fire-throw-reload'): `WeaponPose.step` takes the page's stick cut
   * (`hitPoseReloadCut`) and the body's `airborne`, as `play.ts` `frame` passes them; a reload started by `startReload`
   * runs on that clock.
   */
  step(dt: number, snap: HitPoseSnapshot): void {
    this.held.hold = (snap.hold ?? null) as HoldClip | null;    // the wire's hold code and serial (`./body` `snapshotOf`)
    this.held.holdSerial = snap.holdSerial;
    if (this.hands) {
      this.hands.follow(snap.hold ?? null, remoteKitOf(snap as HitPoseSnapshot & PlaySnapshot & { weapon: 0 | 1 }).item === 'pistol', snap.holdSerial);
      this.hands.step(dt);
    }
    const w = this.raise.frame(dt, this.feed.input(this.held, false, { trigger: snap.trigger ?? false, aiming: snap.aiming ?? false, raised: snap.raised ?? false }, null), dt);
    this.launcher = launcherInHand(snap.item ?? NO_ITEM, snap.action ?? null, this.launcher);
    this.weapon.fireWeight = this.launcher !== null || snap.weapon === 1 ? 0 : w;
    // RELOAD-HITPOSE: the reload clip's clock, cut by the copy's stick, covered in the air (`play.ts` `frame`)
    this.weapon.step(dt, hitPoseReloadCut(snap as HitPoseSnapshot & PlaySnapshot), snap.airborne);
    const t = snap.traversal;
    const lean = LEAN_HIT_POSE_READING === 'held' && t && !t.blend ? this.keys.get(t.clip) : undefined;
    this.animator.step(dt, lean && t ? { ...snap, traversal: { ...t, frame: leanHeldKey(lean) } } : snap);
  }

  /**
   * RELOAD-HITPOSE (`HIT_POSE_LAYERS_READING` 'fire-throw-reload'): the room's take of a reload (`room.ts` `reload`, with
   * what its `reloadSound` tells the pages) starts the copy's reload clip as the page's does -- `remotePlayers.ts`
   * `RemotePlayers.reload` (no seconds, none started) then `play.ts` `remoteReload` (`WeaponPose.startReload`): `stance`
   * the room's posture at the take, `seconds` its clip length, `family` its clip family, `moving` whether it moved.
   */
  startReload(stance: ReloadStance, seconds: number, family: ReloadItem | null, moving: boolean): void {
    if (!(seconds > 0)) return;
    this.weapon.startReload(stance, seconds, family, moving);
  }

  /**
   * RELOAD-HITPOSE: a reaction ends the copy's reload clip as `play.ts` `stopRemoteReload` ends the page's: `death`, any
   * clip; `flinch`, only a still clip crouched or prone (`WeaponPose.stillHeld`).
   */
  stopReload(why: 'death' | 'flinch'): void {
    if (why === 'flinch' && !this.weapon.stillHeld()) return;
    this.weapon.stopReload();
  }

  /**
   * JUMP-AIM-ROOT (research 80 s7): the skeleton root's height over the feet as the last step posed it (`Animator.rootY`,
   * the clips' root blended -- the root the page's camera stands on, `play.ts` `setPosedRoot`), or null.
   */
  rootY(): number | null {
    return this.animator.rootY();
  }

  /** The body-frame bone boxes of the pose the last step left (x right, y up, z behind, the soles at the origin), copied. */
  boxes(): BoneBox[] {
    return posedBoxes(this.skeleton);
  }

  /**
   * Keeps the pose the last step left (every boxed bone's matrix, and the slot's bounds for the cull: `./hitVolumes`
   * `keepBounds`, `BODY_CULL_FRAME_READING`) and returns its stamp, from 1. Allocates nothing.
   */
  keep(): number {
    const stamp = ++this.kept, slot = stamp % this.stamps.length, base = slot * this.floats, world = this.skeleton.world;
    for (let b = 0; b < this.bones.length; b++) this.ring.set(world[this.bones[b]!]!, base + b * 16);
    keepBounds(this.slots[slot]!, this.bounds[slot]!);   // BONE-BOXES' fold: the cull reads the pose's own bounds
    this.stamps[slot] = stamp;
    this.weights[slot] = this.weapon.fireWeight;         // FL-2: the weight laid on this pose, for `fireWeightAt` only
    return stamp;
  }

  /**
   * FIRE-LAYER FL-2 (the replay's `rewind` record; an instrument, read only): the Fire weight laid on the pose kept as
   * `stamp` (`keep`) -- the raise's eased weight, 0 under a rocket launcher or the pistol's slot (`step`); null once the
   * ring has written over it, as `boxesAt`.
   */
  fireWeightAt(stamp: number): number | null {
    const slot = stamp % this.stamps.length;
    if (stamp < 1 || this.stamps[slot] !== stamp) return null;
    return this.weights[slot]!;
  }

  /**
   * The body-frame bone boxes of the pose kept as `stamp` (`keep`): `boxes()`' numbers at that tick (the matrices are
   * float32 either way, so the copy is exact); null once the ring has written over it. The slot's own boxes, views on the
   * ring: shared, valid until the ring writes the slot again, never mutated. Allocates nothing.
   */
  boxesAt(stamp: number): readonly BoneBox[] | null {
    const slot = stamp % this.stamps.length;
    if (stamp < 1 || this.stamps[slot] !== stamp) return null;
    return this.slots[slot]!;
  }
}
