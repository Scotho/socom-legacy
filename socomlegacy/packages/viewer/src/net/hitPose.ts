import { Skeleton, type MotionClip } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../animator';
import type { MotionTable } from '../motionTable';
import { leanClip, TRAVERSAL_CLIPS } from '../traversal';
import { snapshotOf } from './body';
import { quantiseBody } from './codec';
import { boneTable, keepBounds, LEAN_HIT_POSE_READING, leanHeldKey, posedBoxes, type BoneBox } from './hitVolumes';
import type { BodyState } from './protocol';

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
 * - `HIT_POSE_LAYERS_READING`: what the page's `Play` lays over the animator that the room does not feed.
 * - `HIT_POSE_MOUNT_READING`: a mounted gunner stays on the idle set, in the room and in the page's aim.
 * - `LEAN_HIT_POSE_READING` 'held' stands: under a peek the lean clip is posed at its held key from the press (the
 *   page draws its rise), as the idle sets' lean was.
 */

/** The motion a hit body is posed with: the clips the page draws a copy with (`HIT_POSE_CLIPS`) and `motion.rdr`'s table. */
export interface HitMotion { readonly clips: readonly MotionClip[]; readonly table: MotionTable | null }

/**
 * The clips the room's animator is given: the page's plays (`../animator` `PLAY_CLIPS`, the locomotion, the actions,
 * their pistol versions) and the traversal moves' (`../traversal` `TRAVERSAL_CLIPS`: the ladders, the climbs, the
 * leans) -- what a remote copy's animator plays off the snapshot. The one-shots the page lays as pose layers (the Fire
 * set, the reloads, the throws, the binoculars, the flinches, the deaths) are not among them (`HIT_POSE_LAYERS_READING`).
 */
export const HIT_POSE_CLIPS: readonly string[] = [...new Set([...PLAY_CLIPS, ...TRAVERSAL_CLIPS])];

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
 * HIT-POSE: what the page's `Play` lays over its copy's animator that the room does not feed [reading]. 'none': the
 * room's animator takes the snapshot alone -- no pose layer (the Fire set and the reloads, `../weaponPose`; the
 * binoculars, `../binocularPose`; the throw's hands, `../throwPose`; the flinch; the victory dance), no pistol version
 * (`Animator.setWeapon`: the rifle's clips), no launcher set (`setLauncherSet`), no `aimWeight` (the animator's
 * `AIM_WEIGHT_PLACEHOLDER`, where the page passes its raise's weight). Each moves the arms and the spine more than the
 * head; a reload or a throw can move the head too. Settles with each layer fed from what the room already holds (the
 * reload's lock, the hold code, the raise), one at a time, each against its capture.
 */
export const HIT_POSE_LAYERS_READING: 'none' | 'fed' = 'none';

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
export function hitPoseSnapshot(body: BodyState, rootTilt: MoverSnapshot['rootTilt'], wire: BodyState = wireScratch()): MoverSnapshot {
  const snap: MoverSnapshot = snapshotOf(quantiseBody(body, wire));
  snap.rootTilt = rootTilt ?? null;
  return snap;
}

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
  private readonly keys = new Map<string, MotionClip>();
  private readonly wire = wireScratch();
  private readonly ring: Float32Array;
  private readonly stamps: Float64Array;
  /** Each ring slot's boxes, made once: their matrices are views on the slot's floats. */
  private readonly slots: readonly (readonly BoneBox[])[];
  /** Each ring slot's bounds (body frame, `./hitVolumes` `boxBounds`), rewritten as the slot is kept: the cull's widening. */
  private readonly bounds: readonly Float64Array[];
  private readonly bones: Int16Array;
  private readonly floats: number;
  private kept = 0;

  /** `ticks`: how many poses `keep` holds (the room's rewind history), the oldest written over. */
  constructor(skeleton: Skeleton, motion: HitMotion, ticks = 1) {
    this.skeleton = new Skeleton(skeleton.model, skeleton.modelMatrix, skeleton.parts);
    this.animator = new Animator(this.skeleton, motion.clips, motion.table, { random: () => HIT_POSE_RANDOM_READING });
    for (const c of motion.clips) if (LEAN_CLIPS.has(c.name)) this.keys.set(c.name, c);
    const n = Math.max(1, Math.floor(ticks));
    const table = boneTable(this.skeleton.parts);
    this.bones = table.index;
    this.floats = table.index.length * 16;
    this.ring = new Float32Array(n * this.floats);
    this.stamps = new Float64Array(n);
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
   * One tick of `dt` seconds on the body's snapshot. `LEAN_HIT_POSE_READING` 'held': a peek's clip is posed at its held
   * key (`./hitVolumes` `leanHeldKey`) from the press, as the idle sets' lean was -- the rise the page draws is not
   * judged; 'clip' would pass the traversal's own key.
   */
  step(dt: number, snap: MoverSnapshot): void {
    const t = snap.traversal;
    const lean = LEAN_HIT_POSE_READING === 'held' && t && !t.blend ? this.keys.get(t.clip) : undefined;
    this.animator.step(dt, lean && t ? { ...snap, traversal: { ...t, frame: leanHeldKey(lean) } } : snap);
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
    return stamp;
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
