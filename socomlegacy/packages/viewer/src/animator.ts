import { partMatrix, partMatrixInto, sampleClip, SEAL_TUNING, type MotionClip, type PartPose, type Skeleton } from '@s2u/scene';
import {
  BLEND_TIME_DEFAULT, blendWeight, LAUNCHER_ANIMS, PISTOL_ANIMS, MOTION_CLIPS, SEAL_ANIM_SET, SEAL_ANIMS, SEAL_SETS, crouchPlay, entryOf, motionOf, nodeSpeed, setsOf,
  type AnimSet,
  phaseRate, pronePlay, standPlay, type DirectionClass, type Motion, type MotionSets, type PlayNode,
} from './locomotion';
import { HEAD_LOOK_NODES, HeadLook, lookFractions } from './headLook';
import type { MotionTable } from './motionTable';
import type { LandingKind } from './physics';
import type { Mount } from './heldItem';
import { holdFamily, isHoldClip, STICK_SNAP_BLEND, type GroundMotion, type MoverAction, type Stance } from './mover';
import { TRAVERSAL_CLIP } from './traversal';

/**
 * The SEAL's clips on the mover, played the game's way (web sprint 2 W2.2b; the motion workstream's port, socomlegacy/docs/
 * research/80-the-jump.md): each frame the mover's state -- its action (the jumps, the landings, the stance
 * transitions) or its ground state and stick -- names a **play**, the game's `FUN_0028dc90` play on the skeleton at
 * `actor+0x170`: a list of nodes (a motion, a weight, a speed) sharing one phase (`./locomotion`).
 *
 * - **Locomotion** is the game's pick and blend, rebuilt every tick with no cross-fade inside it (`FUN_0028bef0` swaps
 *   the node list): standing, the forward/back set and the strafe set shared by the stick's angle (`FUN_00583030`),
 *   each set's clips chosen and split by their transition bands at the stick's speed (`FUN_0058bdf0`); crouched the
 *   one set of the direction class (`FUN_00582d10`); prone the crawl or the prone strafe (`FUN_00583500`). Every clip
 *   plays at the speed that makes its root travel the mover's speed, whatever that is -- no clamp.
 * - **A new play** (a new action, locomotion starting or stopping, a crouch or prone class change) cross-fades from the
 *   pose on screen over the new motion's `BlendTime` (0.4 when `motion.rdr` gives none, `FUN_00287620`), keeping the
 *   phase when both are loops (`FUN_0028dc90`); a stance transition played backwards starts at its end (`FUN_0028c160`).
 * - **One-shots** play keys 0 to n - 1 in `playback x ((n - 1) / n)^2` seconds and hold there (`FUN_0028c4f0`,
 *   `FUN_0028d670`; `./locomotion` `oneShotSeconds`).
 * - **Events** for the page (the audio): each `zanim_callback` as the phase crosses it (`FUN_0028c9e0`), and each
 *   footfall -- the left foot as a moving locomotion phase enters (0, 0.5), the right as it enters (0.5, 1)
 *   (`FUN_005a3570`, decomp 460266-460382) -- and each play started (`onEvent`).
 *
 * **The root.** The mover owns the position: the clip's root travel is not applied to it, and the body's root is stood
 * over the feet at the bind's x and z. The root's height is the clips', blended, so a crouch lowers the body and the
 * standing jump's clip lifts it -- and the camera reads it (`rootY`, `WalkMode.setPosedRoot`).
 */

/** What the SEAL holds. W2.R4's default is the M4A1 SD, a rifle, which the full-body clips hold. */
export type Weapon = 'rifle' | 'pistol';

/**
 * The pistol's version of a clip: `seal_p_<name>` (research 77 §12: `seal_p_*` 79, the pistol). Most carry the
 * spine, the arms, the head and the pistol and no root or legs -- an upper-body layer; a few are whole bodies.
 */
export function layerName(clip: string): string {
  return clip.replace(/^seal_/, 'seal_p_');
}

/** The locomotion clips: every set's, and the prone crawl and strafes (a pistol version counts as its rifle clip's). */
const CYCLES = new Set<string>([
  ...Object.values(SEAL_SETS).flat(), SEAL_ANIMS.proneCrawl, SEAL_ANIMS.proneRight, SEAL_ANIMS.proneLeft,
]);

/** Whether a clip is a locomotion cycle: one a locomotion play's footfalls come from (`FUN_005a3570`). */
export function isCycle(name: string): boolean {
  return CYCLES.has(name.replace(/^seal_p_/, 'seal_'));
}

/**
 * Every clip the page asks the worker for: the plays' (`./locomotion` `MOTION_CLIPS`), then each one's pistol version --
 * once each (HX-2: the No_weapon set's `civ_*` clips have no pistol version, `layerName` leaves them as they are).
 */
export const PLAY_CLIPS: readonly string[] = [...new Set([...MOTION_CLIPS, ...MOTION_CLIPS.map(layerName)])];

/** The mover as the animator reads it each frame (`WalkMode.snapshot`). */
export interface MoverSnapshot {
  /** Velocity across the ground, units a second, world axes. */
  vx: number; vz: number;
  /** Upward, units a second. */
  vy: number;
  /** The facing: the look's yaw in degrees, as `Pose.yaw` -- forward is (-sin, -cos), right (cos, -sin). */
  yaw: number;
  airborne: boolean;
  crouched: boolean;
  /** The last landing's class, null in the air or before the first. */
  landing: LandingKind | null;
  /** How many jumps the mover has taken. */
  jumps: number;
  /** The body in use (`Walker.posture`): what the idle plays by. Absent: `crouched` says crouch or stand. */
  stance?: Stance;
  /** The ground state and its stick (`Walker.ground`); absent or `idle`: no locomotion. */
  ground?: GroundMotion;
  /**
   * `Walker.stickSnaps` (or its low bit, from the wire): when it changes, `FUN_00586c10` snapped a stick axis back and
   * the play cross-fades from the pose on screen over `STICK_SNAP_BLEND`, 0.2 s (decomp 445051-445055). Absent: none.
   */
  stickSnaps?: number;
  /** The action holding the mover, or none. */
  action?: MoverAction | null;
  /**
   * The turn, radians a second, left positive (the look's yaw growing; web research 83's `LookState.turnRate`): prone
   * and still, a turn plays `seal_prone_turn` (`FUN_0054aa30`, decomp 415110, while `actor+0x48` is not 0); standing
   * and crouched a turn plays no clip -- the body pivots.
   */
  turnRate?: number;
  /** The aim's pitch, degrees, up positive (the camera's): the upper body takes it (`FUN_005aca70`). */
  pitch?: number;
  /**
   * The rifle's raise weight, 0 down to 1 up (`FUN_00286b80(actor+0x1160)`; the WEAPON workstream's `./weaponRaise`):
   * the aim's twist is scaled by it and runs only over 0, the head look runs with it at 0 (`FUN_0057a330` 439152-439193).
   * Absent: `AIM_WEIGHT_PLACEHOLDER`.
   */
  aimWeight?: number;
  /**
   * An upper-body clip over the locomotion (`./walk` `MoverOverlay`: the moving rifle <-> pistol swap, a `BlendOverlay`
   * motion on the game's second play channel `anim+0x60`): laid over the parts it carries, `t` of `seconds` in; a new
   * `serial` is a new overlay (the body's 0.4 s cross-fade at its start, `OVERLAY_BLEND`).
   */
  overlay?: { clip: string; t: number; seconds: number; reversed: boolean; serial?: number } | null;
  /** TRAVERSAL SEAM (`./traversal`): a ladder, a climb or a lean playing its own clip; absent or null otherwise. */
  traversal?: TraversalPose | null;
  /**
   * PRONE-TILT (`./rootTilt`, research 217 s7): the skeleton root's quaternion the rule wrote on the mover's tick
   * (`PlaySnapshot.rootTilt`): laid on the root after the cross-fade, as `FUN_00548090` writes the root after the
   * animation pass (`FUN_00550ef0` D:L418454-418455, then `FUN_005506a0` D:L417863). Null or absent: the clip's root.
   */
  rootTilt?: readonly [number, number, number, number] | null;
  /**
   * The kit's one-shot holding the mover (`PlaySnapshot.hold`: the page's `Walker.holding`, the others' hold code off
   * the wire), or none. PAR-85 (research 251 section 12.9): a throw's is the action stack's top, so the play beneath it
   * is covered -- kept as it was (`THROW_LOW_STANCE_POP_READING`: in every stance since NU-8b B2), and no play change
   * under it cross-fades; a placing's the same since NU-8b B3 (research 326 section 3).
   */
  hold?: string | null;
}

/**
 * TRAVERSAL SEAM: a clip a traversal move plays in place of the mover's own play (web research 86): the clip, where it is (keys,
 * the move's own clock: a ladder's phase follows the climbed height), whether it loops, and the skeleton root's height
 * over the drawn feet when the move carries the root's rise in the mover (null: the clip's own). The animator plays it
 * as a one-node play keyed `trav:<clip>`, its phase set from the move's key, so its `zanim_callback`s (`ladder_rung`,
 * `climb_up`, `pull_up`, `jump_whoosh`) fire through `onEvent` like any other play's.
 */
export interface TraversalPose {
  clip: string; frame: number; loop: boolean; rootY: number | null;
  /** The clip's root rotation held at its key 0: the move turns the body by code (the "180"). */
  holdRootTurn?: boolean;
  /** A second node at the same phase and its share (the crate/medium climb, `FUN_00581110`); `clip` has the rest. */
  blend?: { clip: string; weight: number };
  /**
   * PB-2b's rework: where the move's clip has put the weapons over the kit's mounts (`./play` `drawnMounts`): the
   * turret's mount clip stows the weapon in the hand at its phase (`./net/emplacement` `turretStow`, research 215 s7.3).
   * The animator does not read it.
   */
  mounts?: { rifle?: Mount; pistol?: Mount };
}

/** An event for the page: `onEvent`'s listeners get each as the animator steps past it. */
export type AnimEvent =
  /** A `motion.rdr` `zanim_callback` crossed: `name` is the zAnim animation the game fires (e.g. `jump_whoosh`). */
  | { kind: 'callback'; clip: string; name: string; phase: number }
  /** A footfall (`FUN_005a3570`): which foot came down, in which clip. */
  | { kind: 'footfall'; foot: 'left' | 'right'; clip: string }
  /** A new play: its main clip and what started it (`play` key, e.g. `jump`, `land`, `loco:stand`, `idle:crouch`). */
  | { kind: 'play'; clip: string; play: string };

/** What `stats().anim` reports: the main clip, the fractional key, the cross-fade's weight (1 settled) and from what. */
export interface AnimStats {
  clip: string;
  frame: number;
  /** The main clip's key count: `frame / frames` is its phase. */
  frames: number;
  blend: number;
  from: string | null;
  /** Keys a second the main clip advances at this frame (negative: backwards). */
  rate: number;
  /** The upper-body layer over it, or null. */
  layer: string | null;
  /** The play's nodes: each clip, its weight and speed (`+0x24`). */
  nodes: { clip: string; weight: number; speed: number }[];
  /** The play's key (`AnimEvent`'s `play`). */
  play: string;
  /** The run's bank on `spinelo` this frame, radians about its parent's z (`FUN_0057a330`); 0 with none. */
  bank: number;
  /** The upper body's turn toward the aim this frame, radians, `spinelo` and `spinehi` together (`FUN_005aca70`). */
  twist: number;
  /**
   * The head look (`./headLook`): the rotator's yaw and pitch fractions (`FUN_00287210`, right and up positive, 1 at
   * 90 and 80 degrees), whether the pose took it this frame, and the request's priority (1 the turn's lead, 0 ahead).
   */
  look: { yaw: number; pitch: number; on: boolean; priority: number };
  /** The overlay play's clip over the locomotion (the moving swap), or null. */
  overlay: string | null;
}

/** The play's main clip, as a pose layer sees it: the clip, its fractional key and its phase (0 to 1). */
export interface LayerContext {
  clip: MotionClip; frame: number; phase: number;
  /**
   * Every node of the play with a weight, each at its own phase (the main clip's among them): a layer made per motion
   * slot -- the Fire set, `FUN_0057a330` blending each slot's Fire version into that slot -- reads these.
   */
  nodes?: readonly { clip: MotionClip; frame: number; phase: number; weight: number }[];
}

/**
 * A pose over the clips (the WEAPON workstream's fire set and reload, `./weaponPose`): the parts to blend toward and
 * by how much (0 none, 1 all), or null for nothing this frame. A part the layer does not carry keeps the pose below.
 * `noPitchtwist`: the layer stands for a main-channel play whose clip is flagged `NoPitchtwist` (a still reload on the
 * action stack): `FUN_00587a30` (decomp 445469-445473) then turns the aim's twist off, whatever its weight this frame.
 * `crossFade`: the layer's play or channel changed this frame -- the body cross-fades from the pose on screen over
 * that many seconds (`FUN_0028e3e0`'s snapshot: the game's `FUN_005870e0` new play, or the second channel's start
 * `body+0x10d0` = 0.4, `FUN_0057a010` 438628-438633), unless a play change of the animator's own started one this frame.
 * `crossFadeRun`: the seconds of that cross-fade the frame's driver tick has already run when it is first drawn (a push
 * after last frame's driver, a pop inside this frame's: `FUN_00576860` takes the frame's time off the remainder before
 * it weighs, D:L436624-436629); absent, none.
 * `top` (PAR-85, research 251 section 12.9): the layer is the action stack's top play (a throw). The stack draws its top
 * alone (`FUN_00577ea0` D:L437430-437455): a part the layer does not carry is not written (`FUN_005777d0`
 * D:L437202-437285, `FUN_00577700` D:L437155-437167) and holds the pose last drawn, and its push's cross-fade is the
 * body's whatever else started this frame.
 * `push` (PAR-95, the review's F1; research 251 section 12.9): the cross-fade is a push onto the stack -- a still
 * reload's -- whose snapshot is taken whatever else started this frame, as a `top`'s: the push snapshots again while a
 * blend runs and sets its clip's `BlendTime` (`FUN_0028dc90` D:L135215-135220), landing after the ground state's play
 * change (the kit's frame, PAR-67). Not `top`: the parts its clip lacks keep the play's (the props; no reading taken).
 */
export interface PoseLayer {
  sample(current: LayerContext): {
    parts: readonly PartPose[]; weight: number; noPitchtwist?: boolean; crossFade?: number; crossFadeRun?: number; top?: boolean;
    push?: boolean;
  } | null;
}

/** The held item's node (`FUN_00553290` 0x553290 names it `rifle`) and SOCOM 1's name for it in the older clips. */
export const HELD_PART = 'rifle', HELD_ALIAS = 'weapon';
/** WEAPON: the held items' nodes (`FUN_00553290` slots 1 and 2), whose unmixed locals `Animator.heldLocal` keeps. */
const HELD_NODES = [HELD_PART, 'pistol'] as const;
/**
 * WEAPON: the clips whose `rifle` track is not a hold in the hand but the rifle's place on `spinelo` (`./heldItem`'s
 * `swap` mount): the four swaps, standing, crouched, prone and the moving overlay. Every other clip's `rifle` and
 * `pistol` tracks are the grip in `rhand` (1.27 along the hand, give or take the clip's own turn of it).
 */
export const SPINE_HELD_CLIPS: ReadonlySet<string> = new Set([SEAL_ANIMS.swapStand, SEAL_ANIMS.swapCrouch, SEAL_ANIMS.swapProne, SEAL_ANIMS.swapMoving]);

/** A held node's local and the frame its track is in: `spine` a swap clip's `rifle` on `spinelo`, else the hand's. */
interface HeldLocal { local: Local; spine: boolean }

/**
 * A clip part's skeleton slot. The held item's node is `rifle` in most of the pack's clips and `weapon` in the few
 * that keep SOCOM 1's name (`seal_jump`, `seal_runningjump_in_air`, `seal_prone_crawl`, `seal_crouch_recoil`: the
 * same constant key where both exist; reCOM `zSeal/seal.cpp:150` names the node `weapon`): the viewer's reading is
 * that a clip without `rifle` moves the rifle by its `weapon` track.
 */
export function partIndex(skeleton: Skeleton, parts: readonly { name: string }[], name: string): number {
  const i = skeleton.indexOf(name);
  if (i >= 0 || name !== HELD_ALIAS) return i;
  return parts.some((p) => p.name === HELD_PART) ? -1 : skeleton.indexOf(HELD_PART);
}

export interface AnimatorOptions {
  weapon?: Weapon;
  /** The random draw for the crouch's three idles (`CROUCH_IDLES`), [0, 1): `Math.random` by default. */
  random?: () => number;
  /**
   * HX-2 (research 238 §1, §3): the body's anim set -- its idles, its stance change, its turn step and its locomotion
   * sets; the Seal set (`SEAL_ANIM_SET`) by default, the hostage's `CIV_ANIM_SET`.
   */
  anims?: AnimSet;
}

/** The cross-fade's weight (`./locomotion` `blendWeight`, moved there for `./traversal`'s dive seam, DIVE-ROOT's F2). */
export { blendWeight };

/**
 * `FUN_0028c7c0(t, from, to)`: whether a callback at phase `t` fires on a step from `from` to `to`: forward, `from <= t
 * <= to`; a loop that wrapped (`to < from`), `from - 1 <= t <= to`; a one-shot played backwards, `to <= t <= from`.
 * No step, no fire.
 */
export function crosses(t: number, from: number, to: number, looped: boolean, backwards: boolean): boolean {
  if (from === to) return false;
  if (!backwards) {
    if (from <= to) return from <= t && t <= to;
    return looped && from - 1 <= t && t <= to;
  }
  if (to <= from) return to <= t && t <= from;
  return looped && to - 1 <= t && t <= from;
}

/** A part's local pose: a unit quaternion (x, y, z, w) and a translation. */
type Local = { q: [number, number, number, number]; t: [number, number, number] };

/**
 * The SEAL skeleton's own parts (`CLIB_GEO.ZED`'s `seal_A_scuba`, research 78): a clip part not among them -- the
 * held item's `rifle`, the props -- keeps the clip's translation.
 */
export const BODY_PARTS: ReadonlySet<string> = new Set([
  'skel_root', 'hips', 'rthigh', 'rcalf', 'rfoot', 'rtoe', 'lthigh', 'lcalf', 'lfoot', 'ltoe', 'aimnodes', 'spinelo',
  'spinehi', 'rshoulder_wgt', 'rscap', 'rbicep', 'rforearm', 'rhand', 'neck', 'head', 'lshoulder_wgt', 'lscap', 'lbicep',
  'lforearm', 'lhand', 'body',
]);

/**
 * The body parts whose translation the engine takes from the clip (`FUN_005777d0`, decomp 437177-437297: `+0x0e` = 0 for
 * the nodes at `actor+0x2e8` skel_root, `+0x304` hips, `+0x328` lbicep, `+0x320` rbicep, `+0x338` lshoulder_wgt,
 * `+0x33c` rshoulder_wgt); every other body part keeps the skeleton's own (the node's `+0x30`). They are exactly the
 * parts whose clip translations move (hips 0.73, the biceps and shoulders 0.6; the rest within 0.18 of the bind).
 */
export const SAMPLED_TRANSLATIONS: ReadonlySet<string> = new Set(['skel_root', 'hips', 'lbicep', 'rbicep', 'lshoulder_wgt', 'rshoulder_wgt']);

/** The skeleton's root part, `m_root` (77 §4). */
const ROOT = 'skel_root';

/**
 * A rotation's quaternion out of a local matrix in the engine's layout (row-major, row vectors: three's column-major
 * elements, `partMatrix`'s inverse): three's `setFromRotationMatrix`, element for element.
 */
export function quatOfMatrix(m: ArrayLike<number>): [number, number, number, number] {
  const m11 = m[0]!, m12 = m[4]!, m13 = m[8]!, m21 = m[1]!, m22 = m[5]!, m23 = m[9]!, m31 = m[2]!, m32 = m[6]!, m33 = m[10]!;
  const trace = m11 + m22 + m33;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s;
  }
  return [x, y, z, w];
}

/**
 * `FUN_00306ae0`, the engine's slerp: the shorter arc; over a dot of 0.95 a normalised lerp, else the true slerp (the
 * node blend `FUN_00576e30`, the cross-fade `FUN_0028e040`).
 */
export function slerp(a: readonly number[], b: readonly number[], t: number): [number, number, number, number] {
  if (t <= 0) return [a[0]!, a[1]!, a[2]!, a[3]!];
  if (t >= 1) return [b[0]!, b[1]!, b[2]!, b[3]!];
  let [bx, by, bz, bw] = b as [number, number, number, number];
  const [ax, ay, az, aw] = a as [number, number, number, number];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  let wa = 1 - t, wb = t;
  if (dot <= 0.95) {
    const theta = Math.acos(Math.min(1, dot)), s = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / s;
    wb = Math.sin(t * theta) / s;
  }
  const x = wa * ax + wb * bx, y = wa * ay + wb * by, z = wa * az + wb * bz, w = wa * aw + wb * bw;
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

/** The cross-fade of one part (`FUN_0028e040`): the turn slerped, the place lerped, `w` of the way from `a` to `b`. */
function mixLocal(a: Local, b: Local, w: number): Local {
  return { q: slerp(a.q, b.q, w), t: [a.t[0] + (b.t[0] - a.t[0]) * w, a.t[1] + (b.t[1] - a.t[1]) * w, a.t[2] + (b.t[2] - a.t[2]) * w] };
}

type Quat = [number, number, number, number];
type Vec = [number, number, number];

/** The Hamilton product `a b` (`FUN_003070c0`): `b` first, then `a` (three.js's `multiplyQuaternions`). */
export function qmul(a: readonly number[], b: readonly number[]): Quat {
  const [ax, ay, az, aw] = a as Quat, [bx, by, bz, bw] = b as Quat;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** `v` turned by the unit quaternion `q`. */
export function qrot(q: readonly number[], v: readonly number[]): Vec {
  const [x, y, z, w] = q as Quat;
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
}

/** The model's forward in its own frame (`DAT_003f6500`, set at start-up; the SEAL faces -z: research 77, 78). */
const MODEL_FORWARD: Vec = [0, 0, -1];

/**
 * `FUN_005aca70`'s share of the aim each spine node takes (decomp 465019-465336): the cross of the forward and the aim,
 * both in the node's frame, times the aim weight and this, is a rotation vector whose quaternion is
 * `(v sin|v| / |v|, cos|v|)` (`FUN_003067b0`) -- so the node turns by twice it. `spinelo` 0.1, `spinehi` 0.4: the
 * whole of a small pitch between them.
 */
export const TWIST_SHARE: Readonly<Record<'spinelo' | 'spinehi', number>> = Object.freeze({ spinelo: 0.1, spinehi: 0.4 });

/**
 * The aim weight when the mover gives none (`MoverSnapshot.aimWeight`, fed from the WEAPON workstream's raise envelope
 * `FUN_00286b80(actor+0x1160)`): the rifle taken as up.
 */
export const AIM_WEIGHT_PLACEHOLDER = 1;


/** `FUN_0057a330` (decomp 439197-439204): the run's bank on `spinelo`, radians, for a turn (rad/s) and the local z speed. */
export const BANK_FACTOR = -0.000375;

/**
 * `FUN_00583960` (decomp 443497-443545): the turn-in-place clip's speed for the turn axis (`actor+0x23c`, the turn over
 * `turn_maxrate`): |axis| times the stance's share, capped at it -- standing 0.6 (`Step`), crouched 0.3 (`Crouch
 * step`), prone 0.35 (`Prone turn`) -- and backwards for a left turn (a positive axis).
 */
export const TURN_STEP: Readonly<Record<Stance, number>> = Object.freeze({ stand: 0.6, crouch: 0.3, prone: 0.35 });
export function turnStepSpeed(turnRate: number, stance: Stance): number {
  const axis = turnRate / SEAL_TUNING.turnMaxRate, cap = TURN_STEP[stance];
  const speed = Math.min(cap, Math.abs(axis) * cap);
  return -axis * 2 < 0 ? -speed : speed;
}

/**
 * `FUN_00577000` with `FUN_00576e30` (decomp 436853-437136): the nodes' rotations for one part merged two at a time --
 * the `Lateral` clips first, then the others, then what is left -- each pair by the engine's slerp at `wb / (wa + wb)`,
 * the survivor carrying the summed weight. A node that lacks the part gives way to one that has it.
 */
type RotationEntry = { q: Quat | null; w: number; lateral: boolean };
type MergeEntry = RotationEntry & { on: boolean };

export function mergeRotations(entries: RotationEntry[]): Quat | null {
  return mergeRotationsWithScratch(entries, []);
}

/** Same merge order and arithmetic; private scratch never owns the input or output quaternion arrays. */
function mergeRotationsWithScratch(entries: RotationEntry[], live: MergeEntry[]): Quat | null {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const slot = live[i] ?? (live[i] = { q: null, w: 0, lateral: false, on: false });
    slot.q = e.q; slot.w = e.w; slot.lateral = e.lateral; slot.on = true;
  }
  const pass = (pick: (e: { lateral: boolean }) => boolean): void => {
    for (let guard = 0; guard < 30; guard++) {
      let a: MergeEntry | undefined, b: MergeEntry | undefined;
      for (let i = 0; i < entries.length; i++) {
        const e = live[i]!;
        if (!e.on || !pick(e)) continue;
        if (!a) a = e;
        else { b = e; break; }
      }
      if (!a || !b) return;
      const total = a.w + b.w;
      const f = total > 0 ? Math.min(1, Math.max(0, b.w / total)) : 0;
      if (!a.q) a.q = b.q;
      else if (b.q && f > 0.001) a.q = f >= 0.999 ? b.q : slerp(a.q, b.q, f);
      a.w = total;
      b.on = false;
    }
  };
  pass((e) => e.lateral);
  pass((e) => !e.lateral);
  pass(() => true);
  for (let i = 0; i < entries.length; i++) if (live[i]!.on) return live[i]!.q;
  return null;
}

/** Each skeleton part's bind pose as a quaternion and a translation. */
function bindLocals(skeleton: Skeleton): Local[] {
  return skeleton.parts.map((p) => ({ q: quatOfMatrix(p.bindLocal), t: [p.bindLocal[12]!, p.bindLocal[13]!, p.bindLocal[14]!] }));
}

/**
 * Writes a sampled pose into the skeleton (`Skeleton.setLocal` per part it has; a prop the skeleton lacks is
 * skipped), the root stood over the feet at the bind's x and z with the clip's height, then composes it.
 */
export function writePose(skeleton: Skeleton, parts: readonly PartPose[]): void {
  const root = skeleton.indexOf(ROOT);
  for (const p of parts) {
    const i = skeleton.indexOf(p.name);
    if (i < 0) continue;
    const t: [number, number, number] = i === root
      ? [skeleton.parts[i]!.bindLocal[12]!, p.translation[1], skeleton.parts[i]!.bindLocal[14]!] : p.translation;
    skeleton.setLocal(i, partMatrixInto(p.rotation, t, _local));
  }
  skeleton.update();
}

/** CPS bodies (a browser adaptation): `writePose`'s part matrix, copied by `Skeleton.setLocal` at once. */
const _local = new Float32Array(16);

/** A play: its key, its nodes, its phase, and whether it loops or runs backwards. */
interface Play {
  key: string;
  nodes: PlayNode[];
  phase: number;
  looped: boolean;
  backwards: boolean;
  /** The crouch idle drawn for this play (`CROUCH_IDLES`), kept while it lasts. */
  pick?: Motion;
}

/** What the mover asks to be played: a key, and how to build (and rebuild) its nodes. */
interface Wanted {
  key: string;
  nodes: () => PlayNode[];
  /** A stance transition played backwards (`FUN_0028c160`). */
  backwards?: boolean;
  /** A locomotion play: footfalls count. */
  locomotion?: boolean;
  /** Rebuilt every tick (`FUN_0028bef0`'s swap, or a speed set each tick): the locomotion and the turn in place. */
  rebuild?: boolean;
  /**
   * `FUN_00586050`: starting the turn in place from a loop whose phase x 60 is in 17..47, the phase goes to 0.5 (the
   * other foot).
   */
  snapHalf?: boolean;
}

/**
 * PAR-85 (research 251 section 12.9, B2; reading, pending review) [reading]: the play under a throw's hold, by stance.
 * Standing, read: the run (or the idle) stays on the stack under the throw, its clock stopped (`FUN_0057a330`
 * D:L438899-438901: the driver advances the top alone), no ground state runs under the one-shot (`FUN_00550ef0`
 * D:L418172-418246, research 251 section 12.6's cite: no idle, no turn step), and the pop hands it back at its kept
 * phase (`FUN_0028da00` D:L135105-135107) -- `'kept'`. Crouched and prone, read by research 326 section 2.3 (NU-8b B2,
 * 2026-10-16; reading, pending review): the pop runs the state's own case (`FUN_005870e0` D:L445164-445171), and each
 * pushes a play only when it is not the play -- crouched `FUN_00584c60` the crouch play 0x14 (D:L444151-444155), the
 * crouch run's set (D:L444180-444184), the crouch turn (D:L444199-444215); prone `FUN_005845c0` -> `FUN_00583500` the
 * crawl (D:L443415-443430), the prone idle (D:L443934-443963), the prone turn (D:L443910-443924) -- else re-weighs the
 * play the throw covered, at its kept phase: `'kept'` in every stance. Not read: the remote controller's branch of both
 * cases (`+0x34` answering 1, D:L444065, D:L443860), which the others' bodies take the same. Settles: capture NU8-1 (a
 * crouch-walk and a prone throw cut by the held stick). *Was* `{ crouch: 'beneath', prone: 'beneath' }` (PAR-85, not
 * read): the walker's ground idle under the hold, covered by the throw, and the pop onto whatever the ground then asked.
 */
export const THROW_LOW_STANCE_POP_READING: Readonly<Record<Stance, 'kept' | 'beneath'>> = Object.freeze({ stand: 'kept', crouch: 'kept', prone: 'kept' });

/**
 * Whether the mover's hold is a throw's or a placing's (`holdFamily`): the action stack's top, covering the play (PAR-85;
 * the placings since NU-8b B3, research 326 section 3: the same push, `FUN_00588bc0` -> `FUN_0028dc90` D:L446292).
 * *Was* `throwHeld`, the throws' alone: under a placing's hold the play beneath changed to the idle, its own cross-fade
 * starting under the clip.
 */
function topHeld(mover: MoverSnapshot): boolean {
  const h = mover.hold;
  if (typeof h !== 'string' || !isHoldClip(h)) return false;
  const family = holdFamily(h);
  return family === 'throw' || family === 'place';
}

/**
 * The body's cross-fade at the second channel's start and its end, seconds: `FUN_0057a010` (decomp 438627-438633) and
 * `FUN_00579ef0` (438544-438547) set `body+0x10d0` to 0.4, which `FUN_00576860` (436643, 436664) runs down over the
 * literal 0.4 with the ease `FUN_002874f0` (`blendWeight`) -- not the overlay clip's `BlendTime`, never read (research
 * 150 s3.5). The moving swap's here, the moving reload's in `./weaponPose`.
 */
export const OVERLAY_BLEND = 0.4;

/**
 * OT.R67 -- ADAPTATION (no original; the owner's word, 2026-10-20, in the merge controller's seat): the prone-pop's rise
 * (`./stanceButton` `PRONE_POP_ADAPTATION`), seconds -- the cross-fade from the prone pose on screen into the standing
 * play, in place of the get-up clip the pop skips. Benny's playtest's 0.26 s (`playtests/prone-pop/client.js`, PR #390's
 * last commit: the user's request, up from 0.22 s), on every body. The ease is `blendWeight`'s; a play that changes under
 * the rise (a stop, a reverse, a strafe) keeps its end and its progress (`Animator.rise`).
 */
export const PRONE_POP_RISE_S_ADAPTATION = 0.26;

/** OT.R67: what the animator saw of the body last frame (`showsPronePop`). */
export interface PopSeen { stance: Stance; action: MoverAction | null; traversal: string | null; airborne: boolean }

/** OT.R67: a mover snapshot as `PopSeen`. */
export function popSeen(mover: MoverSnapshot): PopSeen {
  return {
    stance: mover.stance ?? (mover.crouched ? 'crouch' : 'stand'), action: mover.action ?? null,
    traversal: mover.traversal?.clip ?? null, airborne: mover.airborne,
  };
}

/**
 * OT.R67: whether a frame shows the prone-pop (`Walker.popStand`, `Traversal.cancelDive`): the body prone last frame --
 * settled, its forward drop under way (`standToProne`, `crouchToProne` not reversed) or in the dive -- and standing now
 * on the ground, no action, no move's clip. No stance change of the original's draws that (`Walker.applyStance` starts
 * the reversed drop on the floor; the get-up after a knock is its own action). Read off the body drawn, so the others'
 * bodies rise as the page's own does with nothing more on the wire.
 */
export function showsPronePop(seen: PopSeen | null, now: MoverSnapshot): boolean {
  if (!seen || seen.stance !== 'prone' || seen.airborne) return false;
  const n = popSeen(now);
  if (n.stance !== 'stand' || n.action || n.traversal || n.airborne) return false;
  const a = seen.action;
  if (a && !((a.name === 'standToProne' || a.name === 'crouchToProne') && !a.reversed)) return false;
  return seen.traversal === null || seen.traversal === TRAVERSAL_CLIP.dive;
}

/**
 * The player of the clips: `step` once a frame with the mover's state. It works out the play the mover's state asks
 * for, starts it (a cross-fade from the pose on screen) when that is a new one, rebuilds a locomotion play's nodes,
 * advances the shared phase, fires the events it passed, samples and blends the nodes, and writes the skeleton. A
 * clip the pack lacks is left out of its play; with nothing to play the skeleton keeps its bind pose.
 */
export class Animator {
  private readonly motions = new Map<string, Motion>();
  private readonly sets: MotionSets;
  /** The body's anim set (`AnimatorOptions.anims`). */
  private readonly anims: AnimSet;
  private readonly bind: Local[];
  private readonly root: number;
  private weapon: Weapon;
  private readonly random: () => number;
  /** The pose on screen, per skeleton part. */
  private readonly shown: Local[];
  /** The pose the cross-fade leaves, frozen when the play changed (`FUN_0028e3e0`'s snapshot, research 17 §4.2). */
  private from: { name: string; pose: Local[]; held: Map<number, HeldLocal> } | null = null;
  private blendElapsed = 0;
  private blendLength = BLEND_TIME_DEFAULT;
  private play: Play | null = null;
  private layer: MotionClip | null = null;
  private lastRate = 0;
  /** `actor+0x211` / `+0x210`: the left and the right foot already struck this half cycle. */
  private feet = { left: false, right: false };
  private readonly listeners = new Set<(e: AnimEvent) => void>();
  private readonly poseLayers: PoseLayer[] = [];
  /** A pose layer this frame stands for a `NoPitchtwist` play (`PoseLayer.noPitchtwist`): no aim twist (`FUN_00587a30`). */
  private layerNoTwist = false;
  /** Per part: the clip's translation (`SAMPLED_TRANSLATIONS`, the props), else the skeleton's own. */
  private readonly clipTranslation: boolean[];
  private lastBank = 0;
  private lastTwist = 0;
  /**
   * PAR-95: the pose `pose` built this frame, before the cross-fade mixes the frozen pose over it, and that mix's
   * weight (1 with none): the aim's twist is laid on it (`aim`). *Was* (PAR-85, research 211 G3): `twisted`, the
   * spine's locals as the twist left them, frozen into a `NoPitchtwist` play's snapshot only -- now every snapshot
   * holds the twist drawn, `shown` carrying it.
   */
  private built: Local[] = [];
  private builtMix = 1;
  /** CPS bodies (a browser adaptation): the part matrix `pose` and `aim` write, copied by `Skeleton.setLocal` at once. */
  private readonly local16 = new Float32Array(16);
  /** Transient calculation storage only: target/shown/from and held snapshots keep their original ownership. */
  private readonly poseAcc: { q: Quat; t: [number, number, number]; w: number }[];
  private readonly poseRotations: RotationEntry[][];
  private readonly poseSeen: boolean[];
  private readonly mergeScratch: MergeEntry[] = [];
  private readonly zeroRotation: Quat = [0, 0, 0, 0];
  /** The head look (`./headLook`): the controller's request, the rotator at `actor+0x1190`, the pose. */
  readonly look: HeadLook;
  /**
   * WEAPON: the held items' nodes (`rifle`, `pistol`) as `heldLocal` gives them this frame, and the frame each is in:
   * cross-faded with the arms where the pose left and the pose coming hold it in the same frame, else the clip coming's
   * own (`heldLocal`). What a cross-fade starting freezes (`from.held`).
   */
  private readonly heldShown = new Map<number, HeldLocal>();
  /** The overlay play's clip this frame, or null (`stats().overlay`). */
  private overlayName: string | null = null;
  /** The overlay seen last frame (its `serial`), or null for none: a change is its start or its end. */
  private overlayKey: number | null = null;
  private lookDt = 0;
  private lookOn = false;
  /** TRAVERSAL SEAM: the root's height over the feet a traversal move sets, or null for the clip's own. */
  private rootOverride: number | null = null;
  /** TRAVERSAL SEAM: the root's rotation a traversal move holds (the clip's key 0), or null for the clip's own. */
  private rootTurn: [number, number, number, number] | null = null;
  /** TRAVERSAL SEAM: the move's play has had its first key (its phase is the move's, not the one carried over). */
  private traversalStarted = false;
  /** The last `MoverSnapshot.stickSnaps` seen: a change is a snap's cross-fade. */
  private lastSnaps: number | undefined = undefined;
  /** OT.R67: the body as last seen (`showsPronePop`). */
  private seen: PopSeen | null = null;
  /**
   * OT.R67: the prone-pop's rise under way (`PRONE_POP_RISE_S_ADAPTATION`): its clock, its length, and the eased
   * progress at the latest change of the play under it, from which the cross-fade runs on to the rise's end (`mix`).
   */
  private rise: { elapsed: number; seconds: number; base: number } | null = null;

  constructor(private readonly skeleton: Skeleton, clips: Iterable<MotionClip>, private readonly table: MotionTable | null, options: AnimatorOptions = {}) {
    for (const c of clips) this.motions.set(c.name, motionOf(c, entryOf(c.name, table)));
    this.anims = options.anims ?? SEAL_ANIM_SET;
    this.sets = setsOf(this.anims.sets, (n) => this.motions.get(n));
    this.bind = bindLocals(skeleton);
    this.poseAcc = this.bind.map(() => ({ q: this.zeroRotation, t: [0, 0, 0], w: 0 }));
    this.poseRotations = this.bind.map(() => []);
    this.poseSeen = this.bind.map(() => false);
    this.shown = this.bind.map((l) => ({ q: [...l.q], t: [...l.t] }));
    this.root = skeleton.indexOf(ROOT);
    this.clipTranslation = skeleton.parts.map((p) => SAMPLED_TRANSLATIONS.has(p.name) || !BODY_PARTS.has(p.name));
    this.weapon = options.weapon ?? 'rifle';
    this.random = options.random ?? Math.random;
    this.look = new HeadLook(this.random);
  }

  /**
   * Adds a pose layer over the clips (additive: the plays and the cross-fade are untouched). Layers apply in the order
   * added, each blended over the pose below it by its own weight, after the nodes and the pistol layer and before the
   * cross-fade; each sees the play's main clip.
   */
  addPoseLayer(layer: PoseLayer): void {
    this.poseLayers.push(layer);
  }

  /** Listens to the animator's events (`AnimEvent`); returns the unsubscribe. */
  onEvent(listener: (e: AnimEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The motion a clip plays as (`./locomotion` `Motion`), or undefined when the pack lacks it. */
  motion(name: string): Motion | undefined {
    return this.motions.get(name);
  }

  /** One frame of `dt` seconds with the mover as it now stands. */
  step(dt: number, mover: MoverSnapshot): void {
    // The controller's look request runs every tick (FUN_00596f10 -> FUN_00600550), whatever the body plays.
    this.look.request(dt, (mover.turnRate ?? 0) / SEAL_TUNING.turnMaxRate);
    this.lookDt = dt;
    const snapped = mover.stickSnaps !== undefined && this.lastSnaps !== undefined && mover.stickSnaps !== this.lastSnaps;
    this.lastSnaps = mover.stickSnaps;
    // OT.R67: the prone-pop's rise -- its clock (ended once the cross-fade has run out), and a new one at the pop.
    if (this.rise) { if (this.from) this.rise.elapsed += dt; else this.rise = null; }
    const popped = showsPronePop(this.seen, mover);
    this.seen = popSeen(mover);
    if (popped) this.rise = { elapsed: 0, seconds: PRONE_POP_RISE_S_ADAPTATION, base: 0 };
    if (mover.traversal) { this.traversalStep(dt, mover.traversal, mover); return; }
    this.rootOverride = null;
    this.rootTurn = null;
    // PAR-85 (research 251 section 12.9): a throw's hold covers the play. In every stance (NU-8b B2, research 326
    // section 2.3; *was* standing alone) the play stays as it was, its clock stopped, no idle and no turn step under it
    // (`THROW_LOW_STANCE_POP_READING`); its end hands the play back at its kept phase, the stick's wanted play then
    // following as the ground state's would.
    const covered = topHeld(mover);
    const stance: Stance = mover.stance ?? (mover.crouched ? 'crouch' : 'stand');
    if (covered && !mover.action && THROW_LOW_STANCE_POP_READING[stance] === 'kept' && this.play && this.play.nodes.length) {
      this.blendElapsed += dt;
      this.lastRate = 0;
      this.pose(mover);
      return;
    }
    const wanted = this.wanted(mover);
    if (!wanted) return;
    let play = this.play;
    if (!play || play.key !== wanted.key) play = this.start(wanted, covered);
    else if (wanted.rebuild) {
      // B138 (BTL.R8 run 3's host page): a locomotion rebuilt to no nodes -- the stick inside the dead zone on both axes
      // (`standPlay`: neither off 0.03), a body slowing to a stop -- adds no node (`FUN_00583030` adds none), so nothing
      // is posed this frame and the pose on screen stays the last nodes' (as before). Those nodes stay the play's: the
      // next play's cross-fade freezes the pose from them (`start`: `main(prev)`), which a play left with none threw on.
      const nodes = wanted.nodes();
      if (!nodes.length) return;
      play.nodes = nodes;
    }
    if (!play.nodes.length) return;
    if (play !== this.play) {
      this.play = play;                                          // `start` froze the pose: its cross-fade starts now
      if (covered) this.blendElapsed += dt;                      // covered: none started, the push's runs on
    } else if (snapped && !covered) this.snapshot(STICK_SNAP_BLEND);   // FUN_00586c10's snap: FUN_0028e3e0, 0.2 s
    else this.blendElapsed += dt;

    const before = play.phase;
    const rate = phaseRate(play.nodes);
    let after = before + rate * dt;
    const end = play.looped ? 1 : play.nodes[0]!.motion.end;
    if (play.looped) after = ((after % 1) + 1) % 1;
    else after = Math.min(end, Math.max(0, after));
    play.phase = after;
    const main = this.main(play);
    this.lastRate = rate * main.motion.frames;
    this.pose(mover);
    this.fire(play, before, after, rate < 0, wanted.locomotion === true && !mover.airborne && Math.hypot(mover.vx, mover.vz, mover.vy) > 0.5);
  }

  /**
   * TRAVERSAL SEAM (`./traversal`, web research 86): the move's clip as a one-node play at the move's own key -- no
   * advance of its own -- its callbacks fired as its phase passes them, the root's height the move's.
   */
  private traversalStep(dt: number, over: TraversalPose, mover: MoverSnapshot): void {
    const m = this.motions.get(over.clip);
    if (!m) return;
    const second = over.blend ? this.motions.get(over.blend.clip) : undefined;
    const key = second ? `trav:${over.clip}+${second.name}` : `trav:${over.clip}`;
    let play = this.play;
    if (!play || play.key !== key) {
      // A blend's play is made for its second node (the medium: `FUN_00581110` starts "Climb medium", then swaps in
      // the two), whose end and phase the move's key is laid out on.
      play = this.start({ key, nodes: () => second && over.blend
        ? [{ motion: second, weight: 1 - over.blend.weight, speed: 0, offset: 0 }, { motion: m, weight: over.blend.weight, speed: 0, offset: 0 }]
        : [{ motion: m, weight: 1, speed: 0, offset: 0 }] });
      play.looped = over.loop;
      this.play = play;
      this.traversalStarted = false;                             // a new move's first key fires nothing behind it
    } else this.blendElapsed += dt;
    const lead = second ?? m;
    const frames = lead.clip.frameCount;
    let after = over.frame / frames;
    after = over.loop ? ((after % 1) + 1) % 1 : Math.max(0, Math.min(lead.end, after));
    const before = play === this.play && play.key === key && play.phase !== undefined && this.traversalStarted ? play.phase : after;
    this.traversalStarted = true;
    play.phase = after;
    this.lastRate = dt > 0 ? ((after - before) * frames) / dt : 0;
    this.rootOverride = over.rootY;
    this.rootTurn = over.holdRootTurn ? (sampleClip(m.clip, 0, { loop: false }).parts.find((p) => p.name === ROOT)?.rotation ?? null) : null;
    // A ladder or a climb holds the body to its clip: no aim twist, no run bank (FUN_005aca70, FUN_0057a330 are the
    // ground state's).
    this.pose({ ...mover, pitch: undefined, turnRate: 0 });
    if (after !== before) this.fire(play, before, after, after < before && !over.loop, false);
  }

  /** The play the mover asks for (the header's rules), or null when there is nothing to play it with. */
  private wanted(mover: MoverSnapshot): Wanted | null {
    const one = (key: string, name: string, backwards = false): Wanted => ({
      key, backwards, nodes: () => {
        const m = this.motions.get(name);
        return m ? [{ motion: m, weight: 1, speed: nodeSpeed(m, 1) * (backwards ? -1 : 1), offset: 0 }] : [];
      },
    });
    const a = mover.action;
    if (a) {
      // The stance change is the body's set's (`Stand -> Crouch`); the rest are the Seal set's, which no other set asks for.
      const name = a.name === 'fall' ? SEAL_ANIMS.inAir : a.name === 'launch' ? SEAL_ANIMS.launch
        : a.name === 'standToCrouch' ? this.anims.standToCrouch : SEAL_ANIMS[a.name];
      return one(`${a.name}#${a.serial}`, name, a.reversed);
    }
    const g = mover.ground;
    const stance: Stance = mover.stance ?? (mover.crouched ? 'crouch' : 'stand');
    if (g && g.state === 'stand') return { key: 'loco:stand', locomotion: true, rebuild: true, nodes: () => standPlay(g.forward, g.right, this.sets) };
    if (g && g.state !== 'idle' && g.cls !== -1) {
      const cls = g.cls as DirectionClass;
      if (g.state === 'crouch') return { key: `loco:crouch:${cls}`, locomotion: true, rebuild: true, nodes: () => crouchPlay(g.forward, g.right, cls, this.sets) };
      const motions = { crawl: this.motions.get(SEAL_ANIMS.proneCrawl), right: this.motions.get(SEAL_ANIMS.proneRight), left: this.motions.get(SEAL_ANIMS.proneLeft) };
      return { key: `loco:prone:${cls}`, locomotion: true, rebuild: true, nodes: () => pronePlay(g.forward, g.right, cls, motions) };
    }
    const turn = mover.turnRate ?? 0;
    if (turn !== 0 && !mover.airborne) {
      // Turning in place, the move stick at rest (FUN_00586570 -> FUN_00586050, FUN_00584c60, FUN_005845c0): the
      // stance's step clip, its speed set each tick by the turn (FUN_00583960).
      const name = stance === 'prone' ? this.anims.proneTurn : stance === 'crouch' ? this.anims.crouchStep : this.anims.step;
      const m = name === null ? undefined : this.motions.get(name);
      if (m) {
        return {
          key: `turn:${stance}`, rebuild: true, snapHalf: stance !== 'prone',
          nodes: () => [{ motion: m, weight: 1, speed: nodeSpeed(m, turnStepSpeed(turn, stance)), offset: 0 }],
        };
      }
    }
    if (stance === 'crouch') {
      return {
        key: 'idle:crouch', nodes: () => {
          const pick = this.play?.key === 'idle:crouch' && this.play.pick ? this.play.pick : this.crouchIdle();
          return pick ? [{ motion: pick, weight: 1, speed: nodeSpeed(pick, 1), offset: 0 }] : [];
        },
      };
    }
    return stance === 'prone' && this.anims.prone !== null ? one('idle:prone', this.anims.prone) : one('idle:stand', this.anims.stand);
  }

  /** `CROUCH_IDLES`: one of the crouch's three, by their chances; the plain crouch when the others are not on hand. */
  private crouchIdle(): Motion | undefined {
    const on = this.anims.crouch.filter((c) => this.motions.has(c.clip));
    const total = on.reduce((t, c) => t + c.chance, 0);
    let r = this.random() * total;
    for (const c of on) {
      r -= c.chance;
      if (r < 0) return this.motions.get(c.clip);
    }
    return on.length ? this.motions.get(on[on.length - 1]!.clip) : undefined;
  }

  /**
   * A new play (`FUN_0028dc90`): the pose on screen frozen for the cross-fade over the new main motion's `BlendTime`;
   * the phase kept from a looped play into a looped one, a backwards one-shot started at its end. `covered` (PAR-85): a
   * throw on the stack's top covers it -- the stack draws its top alone (`FUN_00577ea0` D:L437430-437455) -- so no
   * cross-fade starts and the one running (the throw's push) runs on.
   */
  private start(wanted: Wanted, covered = false): Play {
    const nodes = wanted.nodes();
    const prev = this.play;
    const main = nodes[0]?.motion;
    const looped = main?.looped ?? true;
    const backwards = wanted.backwards === true;
    let phase = 0;
    if (backwards && main) phase = main.end;
    else if (prev && prev.looped && looped) phase = prev.phase;
    if (wanted.snapHalf && prev) {
      const at = Math.trunc(prev.phase * 60);
      if (at >= 17 && at <= 47) phase = 0.5;
    }
    const play: Play = { key: wanted.key, nodes, phase, looped, backwards };
    if (wanted.key === 'idle:crouch' && main) play.pick = main;
    if (!nodes.length) return play;
    if (prev && !covered) {
      // The snapshot holds the pose drawn, the aim's twist in it when one was drawn (`shown` carries it, `aim`;
      // research 211 §3.4, G3): a play the twist does not run on (`NoPitchtwist`, `FUN_00587a30` reads its last node)
      // eases it out rather than in one frame (17 degrees at the spine aiming 20 up, the gun hot, at a standing swap's
      // start), and one it runs on again eases it back in (PAR-95). *Was* (G3): `twisted` frozen in for a
      // `NoPitchtwist` play only.
      this.from = this.freeze(this.main(prev).motion.name);
      this.blendElapsed = 0;
      this.blendLength = main!.blendTime;
      this.retarget();
    }
    this.feet = { left: false, right: false };
    this.emit({ kind: 'play', clip: main!.name, play: wanted.key });
    return play;
  }

  /**
   * `FUN_0028e3e0` on the playing play: the pose on screen frozen, and a cross-fade from it over `seconds` into the play
   * as it runs on -- same nodes, same phase. `FUN_00586c10` does this when it snaps a stick axis (0.2 s), which is what
   * keeps letting go of a diagonal's side from popping the body from the blend to the straight run in one tick.
   */
  private snapshot(seconds: number): void {
    const play = this.play;
    if (!play || !play.nodes.length) return;
    this.from = this.freeze(this.main(play).motion.name);      // the held weapon's shown local too: it fades with the arms
    this.blendElapsed = 0;
    this.blendLength = seconds;
    this.retarget();
  }

  /**
   * OT.R67: a pose frozen under the prone-pop's rise (a play's change, a snap): still standing on the ground with no
   * action or move, the rise runs on from the pose now frozen to its own end, its progress kept (Benny's `client.js`);
   * else it ends, and the new cross-fade is the play's own.
   */
  private retarget(): void {
    const r = this.rise, s = this.seen;
    if (!r) return;
    if (!s || s.stance !== 'stand' || s.action || s.traversal || s.airborne) { this.rise = null; return; }
    r.base = blendWeight(r.seconds > 0 ? r.elapsed / r.seconds : 1);
  }

  /** The cross-fade's weight now (1 with none): the play's own (`blendWeight` over its length), or OT.R67's rise. */
  private mix(): number {
    if (!this.from) return 1;
    const r = this.rise;
    if (!r) return blendWeight(this.blendLength > 0 ? this.blendElapsed / this.blendLength : 1);
    if (r.base >= 1) return 1;
    const p = blendWeight(r.seconds > 0 ? r.elapsed / r.seconds : 1);
    return Math.max(0, Math.min(1, (p - r.base) / (1 - r.base)));
  }

  /** The play's heaviest node: its clip names the play in the stats. */
  private main(play: Play): PlayNode {
    let best = play.nodes[0]!;
    for (const n of play.nodes) if (n.weight > best.weight) best = n;
    return best;
  }

  /** The callbacks each node's motion crosses on this step, then the footfalls of a moving locomotion play. */
  private fire(play: Play, before: number, after: number, backwards: boolean, stepping: boolean): void {
    for (const n of play.nodes) {
      for (const c of n.motion.callbacks) {
        if (crosses(c.phase, before, after, play.looped, backwards)) this.emit({ kind: 'callback', clip: n.motion.name, name: c.name, phase: c.phase });
      }
    }
    if (!stepping) return;
    const frac = after - Math.floor(after), clip = this.main(play).motion.name;
    if (frac > 0 && frac < 0.5) {
      if (!this.feet.left) { this.feet.left = true; this.emit({ kind: 'footfall', foot: 'left', clip }); }
    } else this.feet.left = false;
    if (frac > 0.5 && frac < 1) {
      if (!this.feet.right) { this.feet.right = true; this.emit({ kind: 'footfall', foot: 'right', clip }); }
    } else this.feet.right = false;
  }

  private emit(e: AnimEvent): void {
    for (const l of this.listeners) l(e);
  }

  /**
   * The node's clip (the pistol's version is laid over it per node: `pistolOf`). LATER 504: under the launcher's set the
   * set's own rows (`LAUNCHER_ANIMS`): its "Crouch" `seal_launcher` and "Crouch step" `seal_launcher_step` for the Seal
   * set's (`animset.rdr` "launcher anim set"), when the pack has them.
   */
  private clipOf(motion: Motion): MotionClip {
    if (this.launcherSet) {
      const name = LAUNCHER_ANIMS[motion.name];
      const c = name ? this.motions.get(name)?.clip : undefined;
      if (c) return c;
    }
    return motion.clip;
  }

  /**
   * LATER 504: the launcher's anim set on the body (`./play`: the launcher up, and through the still lower), its rows
   * drawn from the next frame cross-fading from the pose on screen over the playing motion's `BlendTime`, as `setWeapon`
   * does -- the set's change freezes the pose and fades (`FUN_0058c350` D:L447976, D:L447993).
   */
  setLauncherSet(on: boolean): void {
    if (on === this.launcherSet) return;
    this.launcherSet = on;
    if (this.play && this.play.nodes.length) {
      this.from = this.freeze(this.main(this.play).motion.name);
      this.blendElapsed = 0;
      this.blendLength = this.main(this.play).motion.blendTime;
      this.retarget();
    }
  }
  private launcherSet = false;

  /**
   * The pistol's version of a node's motion (`PISTOL_ANIMS`), when the SEAL holds the pistol and the pack has it: the
   * sub-node `FUN_0057a330` (438760-438850) hangs under the node through `FUN_0058c9e0` at weight 1, which
   * `FUN_00576bb0` lays over the node's parts it carries (`FUN_00577ea0`), before the nodes are merged.
   */
  private pistolOf(motion: Motion): MotionClip | null {
    if (this.weapon !== 'pistol') return null;
    const name = PISTOL_ANIMS[motion.name];
    return (name && this.motions.get(name)?.clip) || null;
  }

  /**
   * The held item (the WEAPON workstream's sidearm switch): the rifle's clips or the pistol's versions laid over them
   * (`PISTOL_ANIMS`), from the next frame, cross-fading from the pose on screen over the playing motion's `BlendTime`
   * [reading: the swap's own clips, `seal_rifle2pistol`..., are the weapon's to play].
   */
  setWeapon(weapon: Weapon): void {
    if (weapon === this.weapon) return;
    this.weapon = weapon;
    if (this.play && this.play.nodes.length) {
      this.from = this.freeze(this.main(this.play).motion.name);
      this.blendElapsed = 0;
      this.blendLength = this.main(this.play).motion.blendTime;
      this.retarget();
    }
  }

  /**
   * Samples every node at the shared phase, merges them (`mergeRotations`; the translations a weighted sum,
   * `FUN_00577000`), lays the pistol and the pose layers over, cross-fades from the frozen pose, writes the skeleton,
   * then turns the spine toward the aim and banks the run (`aim`).
   */
  private pose(mover: MoverSnapshot): void {
    const play = this.play!;
    const n = this.bind.length;
    this.layer = null;
    const acc = this.poseAcc, rotations = this.poseRotations;
    for (let i = 0; i < n; i++) {
      const a = acc[i]!;
      a.q = this.zeroRotation; a.t[0] = 0; a.t[1] = 0; a.t[2] = 0; a.w = 0;
      rotations[i]!.length = 0;
    }
    const add = (parts: readonly PartPose[], weight: number, lateral = false): void => {
      const seen = this.poseSeen; seen.fill(false);
      for (const p of parts) {
        const i = partIndex(this.skeleton, parts, p.name);
        if (i < 0) continue;
        const a = acc[i]!;
        seen[i] = true;
        rotations[i]!.push({ q: [...p.rotation], w: weight, lateral });
        a.t[0] += p.translation[0] * weight; a.t[1] += p.translation[1] * weight; a.t[2] += p.translation[2] * weight;
        a.w += weight;
      }
      for (let i = 0; i < n; i++) if (!seen[i]) rotations[i]!.push({ q: null, w: weight, lateral });
    };
    for (const node of play.nodes) {
      if (!(node.weight > 0)) continue;
      const clip = this.clipOf(node.motion);
      let frame: number;
      if (play.looped) frame = (((play.phase + node.offset) % 1) + 1) % 1 * clip.frameCount;
      else frame = Math.min(play.phase, node.motion.end) * clip.frameCount;
      const parts = sampleClip(clip, frame / clip.rate, { loop: play.looped }).parts;
      const pistol = this.pistolOf(node.motion);
      if (pistol) {
        const over = sampleClip(pistol, ((frame / clip.frameCount) * pistol.frameCount) / pistol.rate, { loop: play.looped }).parts;
        const byName = new Map(over.map((p) => [p.name, p]));
        add([...parts.filter((p) => !byName.has(p.name)), ...over], node.weight, node.motion.lateral);
        if (node === this.main(play)) this.layer = pistol;
      } else add(parts, node.weight, node.motion.lateral);
    }
    for (let i = 0; i < n; i++) {
      const q = mergeRotationsWithScratch(rotations[i]!, this.mergeScratch);
      if (q) acc[i]!.q = q;
    }
    // PB-2b (research 77 §10, research 215 §7.3; reading, pending review): a node no node of the play tracks keeps its
    // last local -- the pose writes only what a clip tracks (`FUN_005777d0` D:L437201-437230, D:L437257-437291; the pop
    // `FUN_00577700` D:L437155-437170), nothing lays the bind again after the body's build (`FUN_0028e480`, D:L419660),
    // and the cross-fade mixes a node with its own snapshot (`FUN_0028e0d0`, D:L135285-135306). A held item's node keeps
    // the local drawn and its frame (`heldShown`). Every clip, every node. *Was:* the bind. (The turret's hold draws no
    // rifle node: the mount clip's phase stows it on its carry, `TraversalPose.mounts`, research 215 s7.3.)
    const untracked = new Set<number>();
    const target: Local[] = acc.map((a, i) => {
      if (!(a.w > 0)) {
        untracked.add(i);
        const last = this.heldShown.get(i)?.local ?? this.shown[i]!;
        return { q: [...last.q], t: [...last.t] } as Local;
      }
      const len = Math.hypot(...a.q) || 1;
      const t: [number, number, number] = this.clipTranslation[i] ? [a.t[0] / a.w, a.t[1] / a.w, a.t[2] / a.w] : [...this.bind[i]!.t];
      // FUN_0057a330 (439110-439130): the root's x and z are zeroed after the update -- the travel is the velocity's
      if (i === this.root) { t[0] = 0; t[2] = 0; }
      if (i === this.root && this.rootOverride !== null) t[1] = this.rootOverride;   // TRAVERSAL SEAM: the move's root
      if (i === this.root && this.rootTurn) return { q: [...this.rootTurn], t };           // TRAVERSAL SEAM: the move turns it
      return { q: [a.q[0] / len, a.q[1] / len, a.q[2] / len, a.q[3] / len], t };
    });
    const held = HELD_NODES.map((name) => this.skeleton.indexOf(name)).filter((i) => i >= 0);
    // WEAPON: the frame each held node's track is in (`SPINE_HELD_CLIPS`): the main clip's, and the overlay's where its
    // frame is not the main clip's -- that one is kept unmixed (`overlaid`), a rifle on the back is not eased into one
    // in the hand.
    const rifle = this.skeleton.indexOf(HELD_PART);
    const onSpine = (i: number, clip: string): boolean => i === rifle && SPINE_HELD_CLIPS.has(clip);
    const mainClip = this.main(play).motion.name;
    const overlaid = new Map<number, HeldLocal>();
    // The pose layers (`addPoseLayer`: the weapon's fire set and reload, `./weaponPose`), each over what is below it.
    this.layerNoTwist = false;
    if (this.poseLayers.length) {
      const main = this.main(play);
      const phaseOf = (n: PlayNode): number => play.looped ? (((play.phase + n.offset) % 1) + 1) % 1 : Math.min(play.phase, n.motion.end);
      const phase = phaseOf(main);
      const nodes = play.nodes.filter((n) => n.weight > 0)
        .map((n) => ({ clip: n.motion.clip, frame: phaseOf(n) * n.motion.frames, phase: phaseOf(n), weight: n.weight }));
      const context: LayerContext = { clip: main.motion.clip, frame: phase * main.motion.frames, phase, nodes };
      for (const layer of this.poseLayers) {
        const over = layer.sample(context);
        if (over?.noPitchtwist) this.layerNoTwist = true;       // the gate is the play's, not its cross-fade's weight
        // The layer's own play change (a still reload cut: FUN_005870e0's new play and the overlay's body+0x10d0 = 0.4)
        // cross-fades the whole body from the pose on screen -- the same snapshot the stick's snap takes -- unless the
        // mover's play changed this very frame and `start` already froze it: a throw's pop with the stick let go hands
        // the cross-fade to the ground's own play started on the pop's frame, from the throw's last drawn pose, over that
        // play's `BlendTime` (THROW_RELEASED_STICK_END_READING: inferred, not traced). A push onto the stack (`top`,
        // PAR-85) snapshots the pose drawn whatever else started this frame (`FUN_0028dc90` D:L135215-135220), the twist
        // drawn in it (research 211 G3, as `start`; PAR-95: `shown` carries it, so every snapshot holds it, not only a
        // `NoPitchtwist` top's as before).
        // A still reload's push (`push`, PAR-95's F1) is the same.
        if (over?.crossFade !== undefined && over.crossFade > 0 && (over.top || over.push || !(this.from && this.blendElapsed === 0))) {
          this.snapshot(over.crossFade);
          this.blendElapsed = Math.max(0, over.crossFadeRun ?? 0);
        }
        if (!over || !(over.weight > 0)) continue;
        const w = Math.min(1, over.weight);
        const carried = over.top ? new Array<boolean>(n).fill(false) : null;
        for (const p of over.parts) {
          const i = partIndex(this.skeleton, over.parts, p.name);
          if (i < 0) continue;
          if (carried) carried[i] = true;
          const from = target[i]!;
          const t: [number, number, number] = i === this.root ? [0, p.translation[1], 0]
            : this.clipTranslation[i] ? [...p.translation] : [...this.bind[i]!.t];
          target[i] = w >= 1 ? { q: [...p.rotation], t } : {
            q: slerp(from.q, p.rotation, w),
            t: [from.t[0] + (t[0] - from.t[0]) * w, from.t[1] + (t[1] - from.t[1]) * w, from.t[2] + (t[2] - from.t[2]) * w],
          };
        }
        // The top's missing parts hold the pose last drawn (PISTOL_ONESHOT_PARTS_READING: the pistol's throws' legs).
        if (carried) carried.forEach((on, i) => { if (!on) target[i] = { q: [...this.shown[i]!.q], t: [...this.shown[i]!.t] }; });
      }
    }
    // The overlay play (the moving swap, `FUN_0028d860(anim+0x180, ...)`): laid over the parts it carries at 1.0
    // (`FUN_00577ea0` 437455-437461, `FUN_00576bb0`) after the pose layers -- over the merged main channel, its Fire
    // sub-nodes included (research 150 §3.5): with the gun hot the arms are the swap's, not the Fire run's (research
    // 211 §4 G1: under the Fire layer they stayed 30-45 degrees off the clip) -- at 1.0 from its first key to its last
    // on the second channel's clock (the mover's `seconds`, playback x (n-1)/n; its key t / playback x n,
    // `FUN_0028d170` 134703-134737). Its blend in and out is the body's: a cross-fade from the pose on screen over
    // `OVERLAY_BLEND` at its start and after its last key (`FUN_0057a010` 438627-438633, `FUN_00579ef0` 438544-438547,
    // `FUN_00576860` 436643; research 150 §3.5) -- not a fade of its own weight inside the clip, which put the arms back
    // on the run while the pistol was handed at 0.79 (research 211 G2). A play change this very frame (a standing swap
    // the stick cuts into it) has its own cross-fade already, as the reload layer's carry-over does.
    const ovKey = mover.overlay ? mover.overlay.serial ?? 0 : null;
    if (ovKey !== this.overlayKey) {
      this.overlayKey = ovKey;
      if (!(this.from && this.blendElapsed === 0)) this.snapshot(OVERLAY_BLEND);
    }
    this.overlayName = null;
    const ov = mover.overlay ? this.motions.get(mover.overlay.clip) : undefined;
    if (ov && mover.overlay) {
      const o = mover.overlay, run = Math.min(1, Math.max(0, o.t / o.seconds)) * ov.end;
      const phase = o.reversed ? ov.end - run : run;
      const parts = sampleClip(ov.clip, (phase * ov.clip.frameCount) / ov.clip.rate).parts;
      this.overlayName = ov.name;
      for (const p of parts) {
        const i = partIndex(this.skeleton, parts, p.name);
        if (i < 0 || i === this.root) continue;
        const t: [number, number, number] = this.clipTranslation[i] ? [...p.translation] : [...this.bind[i]!.t];
        if (held.includes(i) && onSpine(i, ov.name) !== onSpine(i, mainClip)) {
          overlaid.set(i, { local: { q: [...p.rotation], t: [...t] }, spine: onSpine(i, ov.name) });
        }
        target[i] = { q: [...p.rotation], t };
      }
    }
    const w = this.mix();
    if (w >= 1) this.from = null;
    this.built = target;                                         // PAR-95: what `aim` lays the twist on
    this.builtMix = w;
    // WEAPON: the held nodes cross-fade with the arms -- the hold in the hand changes from clip to clip (the run left
    // turns the rifle 35 degrees from the stand's; the owner's playtest, 2026-09-29: a hot rifle snapped out of the
    // hands at a strafe's start and stop) -- except across frames (the hand's and `spinelo`'s at a swap's ends: the
    // owner's earlier playtest, the rifle snapped in front of the SEAL). The overlay's own channel is never mixed with
    // the main clip's in another frame, but it cross-fades from the pose on screen when that is in its frame: a standing
    // swap the stick turns into the moving one holds the rifle on `spinelo` in both clips, and no re-parent runs there
    // (the review of C3-MOUNT, 2026-10-04: it snapped 3.5 units while the body eased; research 150 §3).
    const lastHeld = new Map(this.heldShown);
    this.heldShown.clear();
    for (const i of held) {
      // PB-2b: an untracked held node stays in the frame it was last drawn in.
      const spine = untracked.has(i) ? lastHeld.get(i)?.spine ?? false : onSpine(i, mainClip);
      const to: HeldLocal = overlaid.get(i) ?? { local: { q: [...target[i]!.q], t: [...target[i]!.t] }, spine };
      const from = this.from?.held.get(i);
      this.heldShown.set(i, from && from.spine === to.spine ? { local: mixLocal(from.local, to.local, w), spine: to.spine } : to);
    }
    const tilt = mover.rootTilt ?? null;
    target.forEach((to, i) => {
      const from = this.from?.pose[i];
      const shown = this.shown[i]!;
      if (!from) { shown.q = to.q; shown.t = to.t; }
      else {
        const mixed = mixLocal(from, to, w);
        shown.q = mixed.q;
        shown.t = mixed.t;
      }
      // PRONE-TILT: the rule's write over the root's rotation (D:L413274-413279), the snapshot a push freezes holding it.
      if (i === this.root && tilt) shown.q = [tilt[0], tilt[1], tilt[2], tilt[3]];
      this.skeleton.setLocal(i, partMatrixInto(shown.q, shown.t, this.local16));
    });
    this.skeleton.update();
    this.aim(play, mover);
  }

  /**
   * The spine after the clips (`FUN_0057a330` decomp 439152-439204): the upper body turned toward the aim
   * (`FUN_005aca70`; not prone, not on a clip flagged `NoPitchtwist` -- `FUN_00587a30` reads the play's last node) and
   * the run's bank on `spinelo` -- `BANK_FACTOR x` the turn `x` the local z speed about its parent's z, 3.1 degrees
   * into a full turn at the run (web research 83), on the floor only.
   * - The twist is the pose's (PAR-95, research 251 section 12.9): `FUN_005aca70` reads the spine parts' model
   *   transforms as built (`FUN_002869d0`, D:L465268, D:L465272) and writes their rotations (D:L465304-465307,
   *   D:L465326-465329) inside the driver (D:L418454), before the snapshot blend mixes the frozen pose over them
   *   (`FUN_00576860` D:L418455, `FUN_0028e0d0` D:L135285-135306). So it is laid on the pose built (`built`), then
   *   mixed with the frozen pose by the cross-fade's weight, and `shown` keeps it: the next snapshot holds the pose
   *   drawn, with or without its twist -- out of a `NoPitchtwist` play the twist eases back in, into one it eases
   *   out (research 211 G3).
   *   *Was:* written over the frame's pose after the cross-fade, frozen into a `NoPitchtwist` play's snapshot only
   *   (`twisted`), so at that play's end it came back in one frame.
   * - The head look and the bank stay written over the frame's pose, not kept in the pose the next cross-fade leaves
   *   (the game's snapshot would carry them, D:L439152-439191 and D:L439196-439204 being the driver's too; a tenth of a
   *   degree's difference for the bank).
   */
  private aim(play: Play, mover: MoverSnapshot): void {
    this.lastBank = 0;
    this.lastTwist = 0;
    this.lookOn = false;
    const stance: Stance = mover.stance ?? (mover.crouched ? 'crouch' : 'stand');
    const weight = mover.aimWeight ?? AIM_WEIGHT_PLACEHOLDER;
    // The head look (FUN_0057a330 439152-439191, `./headLook`): with the rifle down or the rotator still turning, not
    // prone (the prone head turn is action 0x1a's clip) and not on a ladder or a hang (FUN_00587b40), the rotator runs
    // (FUN_005ad920) and the head, the neck and the spine take its turn after the clips (FUN_005ad5b0). Not in the
    // death landing either: FUN_005af590 pushes `Land forward` in state 8, which FUN_00587b40 refuses.
    const lookTurn = new Map<number, Quat>();
    const looked = (i: number, q: readonly number[]): Quat => {
      const l = lookTurn.get(i);
      return l ? qmul(q, l) : [...q] as Quat;
    };
    if (stance !== 'prone' && !mover.traversal && mover.action?.name !== 'landDeath' && (weight === 0 || !this.look.done)) {
      this.look.advance(this.lookDt);
      for (const name of HEAD_LOOK_NODES) {
        const i = this.skeleton.indexOf(name);
        if (i >= 0) lookTurn.set(i, this.look.quat(name));
      }
      if (lookTurn.size) {
        this.lookOn = true;
        for (const i of lookTurn.keys()) this.skeleton.setLocal(i, partMatrixInto(looked(i, this.shown[i]!.q), this.shown[i]!.t, this.local16));
        this.skeleton.update();
      }
    }
    const lo = this.skeleton.indexOf('spinelo'), hi = this.skeleton.indexOf('spinehi');
    if (lo < 0 || hi < 0) return;
    const last = play.nodes[play.nodes.length - 1]?.motion;
    // A cross-fade running: the skeleton holds the pose mixed, so the twist's read of the pose built rewrites it (and
    // the whole pose drawn is written back below).
    let rebuilt = false;
    // FUN_0057a330 439192: the twist only with the rifle's weight over 0, scaled by it (FUN_005aca70); FUN_00587a30 reads
    // the main channel's last node's flag -- a still reload laid as a layer stands for that play (`layerNoTwist`).
    if (stance !== 'prone' && last && !last.noPitchtwist && !this.layerNoTwist && mover.pitch !== undefined && weight > 0) {
      const from = this.from, built = this.built;
      if (from) {
        built.forEach((l, i) => this.skeleton.setLocal(i, partMatrixInto(looked(i, l.q), l.t, this.local16)));
        this.skeleton.update();
        rebuilt = true;
      }
      const p = (mover.pitch * Math.PI) / 180;
      const aimDir: Vec = [0, Math.sin(p), -Math.cos(p)];
      const palette = this.skeleton.palette();
      const turn = (i: number, share: number): Quat => {
        const q = quatOfMatrix(palette[i]!);
        const inv: Quat = [-q[0], -q[1], -q[2], q[3]];
        const a = qrot(inv, MODEL_FORWARD), b = qrot(inv, aimDir);
        const k = weight * share;
        const v: Vec = [(a[1] * b[2] - a[2] * b[1]) * k, (a[2] * b[0] - a[0] * b[2]) * k, (a[0] * b[1] - a[1] * b[0]) * k];
        const m = Math.hypot(...v);
        this.lastTwist += 2 * m;
        return m > 0 ? [(v[0] * Math.sin(m)) / m, (v[1] * Math.sin(m)) / m, (v[2] * Math.sin(m)) / m, Math.cos(m)] : [0, 0, 0, 1];
      };
      // Laid on the pose built, then the cross-fade's mix (`mixLocal`'s slerp: FUN_0028e0d0's FUN_00306ae0).
      const lay = (i: number, twist: Quat): void => {
        const on = qmul(twist, built[i]!.q);
        this.shown[i]!.q = from ? slerp(from.pose[i]!.q, on, this.builtMix) : on;
      };
      lay(lo, turn(lo, TWIST_SHARE.spinelo));
      lay(hi, turn(hi, TWIST_SHARE.spinehi));
    }
    const local = { lo: looked(lo, this.shown[lo]!.q), hi: looked(hi, this.shown[hi]!.q) };
    const yaw = (mover.yaw * Math.PI) / 180;
    const vzLocal = -(mover.vx * -Math.sin(yaw) + mover.vz * -Math.cos(yaw));
    const turnRate = mover.turnRate ?? 0;
    if (!mover.airborne && turnRate !== 0 && vzLocal !== 0) {
      const angle = turnRate * vzLocal * BANK_FACTOR;
      this.lastBank = angle;
      local.lo = qmul([0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], local.lo);
    }
    if (!rebuilt && this.lastTwist === 0 && this.lastBank === 0) return;
    if (rebuilt) this.shown.forEach((l, i) => { if (i !== lo && i !== hi) this.skeleton.setLocal(i, partMatrixInto(looked(i, l.q), l.t, this.local16)); });
    this.skeleton.setLocal(lo, partMatrixInto(local.lo, this.shown[lo]!.t, this.local16));
    this.skeleton.setLocal(hi, partMatrixInto(local.hi, this.shown[hi]!.t, this.local16));
    this.skeleton.update();
  }

  /**
   * WEAPON: a held item's node (`rifle`, `pistol`) local this frame, or null before a pose or without the node.
   * `./play` hangs the weapon from this, so the weapon is where the drawn hand holds it:
   * - Cross-faded with the arms, over the same weight, while the pose left and the pose coming hold it in the same
   *   frame: each clip holds the weapon its own way in the hand (the run left's rifle turned 35 degrees from the
   *   stand's, the pistol's 90-degree run 0.7 further out) and the arms change with it (the owner's playtest,
   *   2026-09-29: with the gun hot, a strafe's start and stop snapped the rifle 5.6 units at the muzzle in one frame
   *   while the arms eased, the off hand 2 units off the fore-end).
   * - The two frames a node's track is in (the hand's, and `spinelo`'s in the swap clips, `SPINE_HELD_CLIPS`:
   *   `./heldItem`'s `swap` mount) are never mixed: across them it is the clip coming's own key -- the play's target,
   *   or the moving swap's where the overlay carries the node (the owner's earlier playtest: a mix put the rifle in
   *   front of the SEAL at the swap's start and up at its end; `./heldItem`'s `HeldMounts` draws that change at once,
   *   as the game re-parents the node: the owner's ruling, 2026-10-04, research 181 section 3.5). Within one frame the
   *   overlay's key cross-fades too: a standing swap cut into the moving one keeps the rifle on `spinelo`.
   */
  heldLocal(name: string): Float32Array | null {
    const l = this.heldShown.get(this.skeleton.indexOf(name))?.local;
    return l ? partMatrix(l.q, l.t) : null;
  }

  /** The pose on screen frozen for a cross-fade (`from`), the held nodes as `heldLocal` gave them with their frames. */
  private freeze(name: string): { name: string; pose: Local[]; held: Map<number, HeldLocal> } {
    const held = new Map([...this.heldShown].map(([i, h]) => [i, { local: { q: [...h.local.q], t: [...h.local.t] } as Local, spine: h.spine }]));
    return { name, pose: this.shown.map((l) => ({ q: [...l.q], t: [...l.t] })), held };
  }

  /** The clip, the frame, the blend: the hook's `stats().anim`. */
  stats(): AnimStats {
    const play = this.play;
    const blend = this.mix();
    if (!play || !play.nodes.length) {
      return { clip: '', frame: 0, frames: 0, blend, from: this.from?.name ?? null, rate: 0, layer: null, nodes: [], play: play?.key ?? '', bank: 0, twist: 0, look: this.lookStats(), overlay: this.overlayName };
    }
    const main = this.main(play);
    const phase = play.looped ? (((play.phase + main.offset) % 1) + 1) % 1 : Math.min(play.phase, main.motion.end);
    return {
      clip: main.motion.name, frame: phase * main.motion.frames, frames: main.motion.frames, blend, from: this.from?.name ?? null, rate: this.lastRate,
      layer: this.layer?.name ?? null, play: play.key,
      nodes: play.nodes.map((n) => ({ clip: n.motion.name, weight: n.weight, speed: n.speed })),
      bank: this.lastBank, twist: this.lastTwist, look: this.lookStats(), overlay: this.overlayName,
    };
  }

  private lookStats(): AnimStats['look'] {
    const [yaw, pitch] = lookFractions(this.look.dir);
    return { yaw, pitch, on: this.lookOn, priority: this.look.priority };
  }

  /** The root's height over the feet as posed (the clips', blended), or null for a skeleton without a root. */
  rootY(): number | null {
    return this.root < 0 ? null : this.shown[this.root]!.t[1];
  }
}
