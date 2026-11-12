import { sampleClip, transformPoint, type MotionClip, type Skeleton, type SkeletonPart } from '@s2u/scene';
import { writePose } from '../animator';
import type { Stance } from '../mover';
import { CROUCH_HEIGHT, HEAD_VOLUME_HEIGHT_READING, PRONE_HEIGHT, STANDING_HEIGHT } from '../stature';
import { PART } from './damage';
import { rotateByQuat, TILT_HIT_TEST_READING } from '../rootTilt';

/**
 * A body's hit volumes, the room's and the page's (web sprint 3, M6; W3.R4; BONE-BOXES, research 398 and research 217
 * s3.6b; owner ruling OT.R119; reading, pending review): the original's oriented bone boxes.
 *
 * What the original builds (research 398 s1): the actor's constructor gives every skeleton bone whose index is under the
 * bone count less four -- the root and every named bone, the weapon slots left out -- one collision polygon of the box
 * class on that bone's node, pointing at the node's own bounding box, of the material `PERSON` (`FUN_0058b960`
 * D:L447559-447593; `FUN_0031aec0` D:L218167-218192), and narrows `spinehi`'s box: its maximum x held to 3.01
 * (D:L447580-447591). A line enters such a box at most once, at the face it starts outside of (the box class's test;
 * research 398 s1, "The box's test"); a line that starts inside it enters nothing. The bones that take damage and their
 * parts are `FUN_005abbc0`'s branch (D:L464740-464766): head/neck -> HEAD; rbicep, rforearm -> RARM; lbicep, lforearm ->
 * LARM; spinehi, spinelo, hips -> BODY; rthigh, rcalf -> RLEG; lthigh, lcalf -> LLEG (`DAMAGE_BONES`); every other boxed
 * bone (the root, the hands, feet, toes, scapulas, shoulder weights, the aim nodes) is `NO_PART`: its record cuts the
 * round and applies nothing.
 *
 * The port's skeleton (research 78 s3.1): the 25 nodes from `skel_root` down -- `character.rdr`'s `body_items`, the
 * bones `CZSealBody` binds -- are the boxed bones (`boneTable`); `body`, the model's sibling slot, is not a bone, and the
 * weapon slots and gear nodes are not in the mesh's skeleton (`BONE_BOX_GEAR_READING`). Each box is the part's `nparams`
 * bbox (78 s3: min xyz, max xyz in the bone's own frame), posed by the bone's matrix: a skeleton's `world[i]`, the body
 * frame -- x right, y up, z behind (the model faces -z), the soles at the origin, `play.ts` `actorToWorld`'s frame --
 * then placed at the body's feet and yaw (`HitBody`). `spinelo`'s bbox is empty (it moves no vertex most; all six
 * zero on the SEAL, as `skel_root`'s and `aimnodes`'): read as it is, a box nothing enters (`entry`), and a level round
 * through the standing trunk between the hips' top and `spinehi`'s bottom meets no BODY box; until the original's own
 * answer is read, that bone's box is the band box `SPINELO_BAND_PLACEHOLDER` names (`boneTable`).
 *
 * The body as a whole is culled first by one fixed box on the node above the skeleton's root (`BODY_CULL_BOX`;
 * `FUN_00553ea0` D:L419728-419742, the bones themselves never refused by their own boxes, `FUN_00314100`
 * D:L214104-214161 with `FUN_003124f0` D:L213172-213244): a line whose two ends lie outside one face of it meets no bone.
 *
 * `placeholderVolumes` is the hand-laid set the server used before (HIT_VOLUMES_PLACEHOLDER): capsules on the stance's
 * measured heights (`./stature`), kept as the fallback when a map's skeleton did not load -- a stand-in with no bones,
 * one record a body (its nearest capsule).
 */

export type V3 = [number, number, number];
/** HIT_VOLUMES_PLACEHOLDER's shape: a capsule, world-placed. */
export interface Capsule { part: number; a: V3; b: V3; r: number }

/** A boxed bone that takes no damage: its record cuts the round and applies nothing (research 398 s0, rule 4). */
export const NO_PART = -1;

/**
 * One bone's box (research 398 s1): `box` its node's bbox in the bone's own frame (min xyz, max xyz; `spinehi`'s
 * clamped), `w` the bone's matrix to the body frame (16 floats, a skeleton's `world[i]` layout: `w[12..14]` the
 * translation), `part` its damage part or `NO_PART`, `bone` its index in the skeleton's parts.
 */
export interface BoneBox { readonly part: number; readonly bone: number; readonly box: Float32Array; readonly w: ArrayLike<number> }

/**
 * A body to cast a ray on: its bone boxes (body frame) placed at `feet` and turned by `yaw` (degrees), or -- no skeleton
 * loaded -- the placeholder's world capsules (`caps`). Made by `bodyVolumes` and `placedVolumes`.
 */
export interface HitBody { readonly feet: readonly number[]; readonly yaw: number; readonly boxes: readonly BoneBox[] | null; readonly caps: readonly Capsule[] | null }

/**
 * A body's boxes per posture, in the body frame (`skeletonVolumes` at each idle), and (PRONE-TILT) where each posture's
 * skeleton root stands posed, the point the root's tilt turns the body about (`rootPivot`). Absent: no tilt.
 * LEAN-HIT (issue #752; research 217 s3.6): `lean`, each posture's boxes at its left and right lean clip's held key
 * (`skeletonVolumes` at `leanHeldKey`), and `leanPivot`, the root posed there; absent (a hand-made set, a body read
 * without its lean clips): a held peek is hit at the idle. `torso`: each posture's bot aim point (`../net/botAim`
 * `torsoPoint`, a browser adaptation), body frame.
 */
export type StanceVolumes = Readonly<Record<Stance, readonly BoneBox[]>> & {
  readonly pivot?: Readonly<Record<Stance, V3>>;
  readonly lean?: Readonly<Record<Stance, { readonly l: readonly BoneBox[]; readonly r: readonly BoneBox[] }>>;
  readonly leanPivot?: Readonly<Record<Stance, { readonly l: V3; readonly r: V3 }>>;
  readonly torso?: Readonly<Record<Stance, V3>>;
};

/**
 * LEAN-HIT (research 217 s3.6): what the hit body poses under a held peek. 'held': the lean clip's held key for the
 * whole peek (`leanHeldKey`), from the press. The original's round meets the live skeleton (`FUN_005abbc0`
 * D:L464672-464803, its nodes bound in `FUN_00553ea0` D:L419606-419652) while `FUN_0057d810` (D:L440437-440510) plays
 * the clip -- so through the clip's rise (0.4 s standing, 0.5 crouched, 0.8 / 0.65 prone; research 86 s1) it meets the
 * clip's key at that moment, not the held one. Settles with a sample of the clip at the room's lean clock (a second
 * commit), and a capture of a hit on a leaning target to prove the pose.
 */
export const LEAN_HIT_POSE_READING: 'held' | 'clip' = 'held';

/**
 * LEAN-HIT: the key a lean clip is held on -- its last key as the port draws it, `frameCount - 1` (`../clipPath`
 * `clipShape` drops the closing key; `../traversal` `Traversal.pose` holds the lean at `shape.keys - 1`), so the room's
 * boxes sit on the body the page draws (`test/hitVolumes.test.ts`, "A = B").
 */
export function leanHeldKey(clip: MotionClip): number {
  return Math.max(0, clip.frameCount - 1);
}

/**
 * BONE-BOXES (research 398 s10, s11): the bones the port boxes are the mesh skeleton's 25 from `skel_root` down. The
 * original's bone list takes the next of its 27 names the first time `FUN_0058cb30` (D:L448317-448349, through
 * `FUN_0058cc30` D:L448354-448403) meets one, so `character.rdr`'s gear nodes (research 78 s3.1) may hold the last of
 * them, each a box with no damage (a record that cuts the round). 'none': the port boxes no gear node (they are not in
 * the mesh's skeleton). Settles with the order `FUN_0058cb30` meets the names in, read on a live actor (its bone list at
 * `+0x1d4`, each bone's `+0x40` index), and the gear nodes' bboxes.
 */
export const BONE_BOX_GEAR_READING = 'none' as const;

/**
 * BONE-BOXES: the body's cull box, on the node above the skeleton's root (`FUN_00553ea0` D:L419728-419742: min
 * (-12, 0, -14), max (12, 20, 14), the words 0xc1400000, 0, 0xc1600000, 0x41400000, 0x41a00000, 0x41600000), the only box a
 * line is refused by before the bones (`FUN_003124f0` D:L213172-213244, which skips a node with `+0x5f` bit 6 set --
 * `FUN_00314100` D:L214104-214161 sets it on the root and every bone, D:L419730 clears it on that node alone).
 */
export const BODY_CULL_BOX: Readonly<Float32Array> = Float32Array.of(-12, 0, -14, 12, 20, 14);

/**
 * BONE-BOXES: the frame and the line `BODY_CULL_BOX` is read in [reading]. 'feet and yaw, widened to the posed boxes':
 * the port's body frame (x right, y up, z behind, the soles at the origin), in the world's units, placed at the body's
 * feet and turned by its yaw -- the frame the skeleton hangs in. Its height (0 to 20 over the soles) stands on the
 * standing body's 19.6 (`../stature` `STANDING_HEIGHT`; the bind pose's crown 19.431, research 78 s3.2), which is what
 * places it at the soles and in these units; its x and z are the body's across and along (24 by 28: a prone body's
 * length in z). The line is the caller's (the port's `reach`, the weapon's maximum range; the original's round line is
 * that x 1.1, research 398 s2): a shorter line refuses no bone inside the box.
 *
 * Widened (the review's finding 1, measured: `test/boneBoxCull.test.ts`): the room's poses leave that box. Posed as the
 * room poses them (its `HitPoser` on the walker's feet), the traversal moves raise the hands over its top -- by up to
 * 8.2 on a ladder, 10.1 dropping from a hang, 7.6 pulling up a 27.5 ledge -- and the climbs, the crouch, the prone and
 * the leans put a toe, a foot or a thigh up to 3.2 under the soles; across and along, every pose stays inside. In the
 * original the box sits on its own node, whose matrix the port has not read, and the original never refuses a bone by
 * its own box (`FUN_00314100`): so where the port's pose leaves the box, the frame is in doubt, and a line that enters a
 * bone's box is never refused by the cull. The cull refuses a line only when it lies past one face of `BODY_CULL_BOX`
 * and past one face of the posed boxes' own bounds (`boxBounds`, body frame) -- for a pose inside the box, the box
 * alone, as read. Settles with the node's matrix (`FUN_00553ea0`'s node at `+100`) read off a live actor climbing a
 * ladder and hanging, or a capture of a shot through a hanging body's raised hands.
 */
export const BODY_CULL_FRAME_READING = 'feet and yaw, widened to the posed boxes' as const;

/** `spinehi`'s box's maximum x, held (`FUN_0058b960` D:L447588-447590: above 3.01 it is written 0x4040a3d7, 3.01 as a single). */
export const SPINEHI_MAX_X = Math.fround(3.01);

/**
 * SPINELO-FALLBACK (research 217 s3.6b; a placeholder for an unmeasured outcome -- the main controller's ruling,
 * 2026-11-11, it ships in v0.4.19 as that): the half cross-section of the band box that stands in for an all-zero disc
 * box of a BODY damage bone with a next joint -- on the SEAL, `spinelo` (`FUN_005abbc0` D:L464740-464766: BODY), whose
 * `nparams` bbox is all six zero (research 78 s3.1). PROVEN: the original's live `spinelo` PERSON polygon on the SEAL
 * (`seal_A_scuba`) keeps `node+0x40` with six zero floats (shadow's live node read, PCSX2 r0004, PINE, 2026-11-11: near,
 * and on the shooter's console for a remote SEAL at 59 u and 300 u; `FUN_0031aec0` D:L218167-218192 takes `node+0x40`
 * unless `node+0x5f` bit 6 is set, then `FUN_00262550(*(node+100))`, the parent's); the terrorist's (`al_gman01`) box is
 * real and equals the disc's decode. Read as it is, that box is entered by nothing (`entry`), and the standing idle's
 * trunk then has a band (the hips' top near y 11.9 to `spinehi`'s bottom near 13.1) where a level round meets a forearm,
 * a hand or nothing: the v0.4.19 hit-registration review measured about 6% of v0.4.18's front BODY area and about 15%
 * from the side and behind no longer damaging the trunk. NOT measured, and what this stands in for: whether a rifle round
 * through that standing band takes trunk health on the original (the shooting legs so far had unreliable heights, a
 * written pitch reverted within 250 ms, and settle nothing). It is not a reading that the original strikes the trunk
 * there. Settles with a rifle-round shooting leg on the original (same-team / first person) with recorded aim points,
 * near and far, a scuba SEAL the target and a terrorist the control -- which settles the band and its width both.
 *
 * Its reach beyond v0.4.18 (the review's count, kept as it is: the shape is the controller's to weigh): the square
 * +-2.0 cross-section reaches past v0.4.18's round 2.0 capsule at its corners (about 2.83 from the axis, up to 0.8 u
 * outside), so it adds BODY lines v0.4.18 never had, in every stance -- on the 0.1 grid of level lines on the fixture
 * SEAL's idles, the lines v0.4.18's capsules missed that now record BODY, from 0/45/90/180/270 degrees: stand
 * 29/114/192/29/192, crouch 151/136/179/151/179, prone 43/188/284/59/284; the crouch and the prone change too. Why the
 * square is kept (the main controller, 2f, 2026-11-11): the band stands between two of the original's own boxes whose
 * cross-sections are that size or larger -- `hips` x -2.003..2.001, `spinehi` x -0.695..3.010 and z about +-2.07, by
 * shadow's live read -- so a +-2.0 band continues the boxes around it, corners and all, where a narrower one would leave a
 * waist the original's neighbours do not have; and of the two errors open to a placeholder for an unmeasured outcome, a
 * body hit up to 0.8 u outside v0.4.18's capsule at the corners is the smaller one, beside centre-mass rounds that do
 * nothing.
 *
 * Not "spinelo alone" by construction: the rule would give `spinehi` (next joint `neck`) a band box too on a page body
 * whose parts arrive without boxes (`play.ts` `bodySkeleton` fills six zeros for a part with no bbox). Today the worker
 * sends the boxes, so that does not arise, but nothing here guarantees it.
 *
 * The box (`boneTable`, `bandBox`), each choice v0.4.18's, the simplest that restores what it gave: in the bone's own
 * frame (the frame the disc's boxes are in, so the original's oriented box test runs on it unchanged); along the bone,
 * from its joint to the next joint's bind translation (v0.4.18's spinelo capsule ran joint to joint, `spinelo` ->
 * `spinehi`; the bind's, not the clip's, so the table's box stays one per parts list, as every disc box --
 * `spineloBand.test.ts` logs the standing idle's translation beside the bind's); across, the segment grown by 2.0 each
 * way (v0.4.18's `SPINELO_RADIUS_PLACEHOLDER`, between the hips' half-depth 1.65 and `spinehi`'s 2.1); BODY, the bone's
 * own part and index (`FUN_005abbc0`'s branch, so research 398's rule -- the nearest record first, a BODY record
 * remembers the round -- takes it unchanged). Only an all-zero box of a BODY bone with a next joint is replaced: every
 * other box, `skel_root`'s and `aimnodes`' (no part) included, is the disc's. The reading it replaces is the empty box
 * (`entry`'s), not a width of 0.
 */
export const SPINELO_BAND_PLACEHOLDER = 2.0;

/** A damage bone: its part, and (the bot aim point's fit, `torsoPoint`) the next joint of its chain. */
interface DamageBone { part: number; bone: string; to?: string }
/** `FUN_005abbc0`'s branch by bone (D:L464740-464766), the names behind its offsets read from the ELF (research 398 s3). */
export const DAMAGE_BONES: readonly DamageBone[] = [
  { part: PART.HEAD, bone: 'neck', to: 'head' },
  { part: PART.HEAD, bone: 'head' },
  { part: PART.BODY, bone: 'hips' },
  { part: PART.BODY, bone: 'spinelo', to: 'spinehi' },
  { part: PART.BODY, bone: 'spinehi', to: 'neck' },
  { part: PART.RARM, bone: 'rbicep', to: 'rforearm' },
  { part: PART.RARM, bone: 'rforearm', to: 'rhand' },
  { part: PART.LARM, bone: 'lbicep', to: 'lforearm' },
  { part: PART.LARM, bone: 'lforearm', to: 'lhand' },
  { part: PART.RLEG, bone: 'rthigh', to: 'rcalf' },
  { part: PART.RLEG, bone: 'rcalf', to: 'rfoot' },
  { part: PART.LLEG, bone: 'lthigh', to: 'lcalf' },
  { part: PART.LLEG, bone: 'lcalf', to: 'lfoot' },
];
const PART_OF: ReadonlyMap<string, number> = new Map(DAMAGE_BONES.map((d) => [d.bone, d.part]));

/**
 * SPINELO-FALLBACK (`SPINELO_BAND_PLACEHOLDER`): writes into `b` the band box of the BODY bone `p` -- in its own frame,
 * along the largest axis of its next joint's (`DAMAGE_BONES`' `to`, a child of `p`) bind translation from 0 to that
 * translation, across the other two the segment's span grown by `SPINELO_BAND_PLACEHOLDER` each way. A bone without a
 * next joint among its children is left as it is.
 */
function bandBox(parts: readonly SkeletonPart[], p: SkeletonPart, b: Float32Array): void {
  const to = DAMAGE_BONES.find((d) => d.bone === p.name)?.to;
  const next = to ? parts.find((q) => q.name === to && q.parent === p.index) : undefined;
  if (!next) return;
  const t = [next.bindLocal[12]!, next.bindLocal[13]!, next.bindLocal[14]!];
  const k = t.reduce((m, x, i) => (Math.abs(x) > Math.abs(t[m]!) ? i : m), 0);
  for (let i = 0; i < 3; i++) {
    const r = i === k ? 0 : SPINELO_BAND_PLACEHOLDER;
    b[i] = Math.min(0, t[i]!) - r;
    b[3 + i] = Math.max(0, t[i]!) + r;
  }
}

/** A skeleton's boxed bones (shared by every instance on one parts list): their part indices, parts and boxes. */
export interface BoneTable { readonly index: Int16Array; readonly part: Int8Array; readonly box: readonly Float32Array[] }
const tables = new WeakMap<readonly SkeletonPart[], BoneTable>();

/**
 * The boxed bones of a parts list (`FUN_0058b960`'s list, research 78 s3.1): `skel_root` and every part under it, in the
 * parts' order (the pre-order); each its bbox, `spinehi`'s maximum x held to `SPINEHI_MAX_X`, an all-zero BODY bone's
 * the band box (`SPINELO_BAND_PLACEHOLDER`, `bandBox`). A parts list without a `skel_root` boxes every part.
 */
export function boneTable(parts: readonly SkeletonPart[]): BoneTable {
  let t = tables.get(parts);
  if (t) return t;
  const root = parts.findIndex((p) => p.name === 'skel_root');
  const under = (i: number): boolean => {
    for (let k = i; k >= 0; k = parts[k]!.parent) if (k === root) return true;
    return false;
  };
  const boxed = parts.filter((p) => root < 0 || under(p.index));
  const box = boxed.map((p) => {
    const b = Float32Array.from(p.bbox);
    if (p.name === 'spinehi' && b[3]! > SPINEHI_MAX_X) b[3] = SPINEHI_MAX_X;
    if (b.every((x) => x === 0) && PART_OF.get(p.name) === PART.BODY) bandBox(parts, p, b);
    return b;
  });
  t = {
    index: Int16Array.from(boxed.map((p) => p.index)),
    part: Int8Array.from(boxed.map((p) => PART_OF.get(p.name) ?? NO_PART)),
    box,
  };
  tables.set(parts, t);
  return t;
}

/** Poses `skeleton` at `clip`'s key `frame` (the bind pose without a clip), runs `read`, and puts the bind back. */
function posed<T>(skeleton: Skeleton, clip: MotionClip | null, frame: number, read: () => T): T {
  if (clip) writePose(skeleton, sampleClip(clip, frame / clip.rate, { loop: false }).parts);
  else skeleton.resetToBind();
  try { return read(); } finally { skeleton.resetToBind(); }
}

/**
 * The bone boxes of `skeleton` as it is posed now -- its current world matrices, whatever posed them (`writePose` inside
 * `skeletonVolumes`, or an `Animator`'s step: `./hitPose`), copied. One per boxed bone (`boneTable`). It poses nothing
 * and caches nothing.
 */
export function posedBoxes(skeleton: Skeleton): BoneBox[] {
  const t = boneTable(skeleton.parts);
  const out: BoneBox[] = [];
  for (let n = 0; n < t.index.length; n++) {
    const i = t.index[n]!;
    out.push({ part: t.part[n]!, bone: i, box: t.box[n]!, w: Float32Array.from(skeleton.world[i]!) });
  }
  return out;
}

/**
 * PAGE-AIM-ALLOC (a browser adaptation: the page's aim path without a build per call; no value of the game's changes):
 * one owner's box set, refreshed in place (`refreshBoxes`) -- its boxes, each with its own `w`, and its kept bounds.
 */
export interface OwnedBoxes {
  /** The boxed bones the set was made for (`boneTable`), or null before the first refresh. */
  table: BoneTable | null;
  boxes: readonly BoneBox[];
  readonly bounds: Float64Array;
}

/** An empty owned set for `refreshBoxes`. */
export function ownedBoxes(): OwnedBoxes {
  return { table: null, boxes: [], bounds: new Float64Array(6) };
}

/**
 * PAGE-AIM-ALLOC: `posedBoxes(skeleton)` written into `into` -- the same boxes in the same order, each `w` the bone's
 * world matrix copied into the set's own Float32Array (the same floats `Float32Array.from` copies) -- and its bounds kept
 * (`keepBounds`: what `boundsOf` would make of an unkept set, made now). Builds the boxes once a parts list (a new
 * skeleton); allocates nothing after. The set stays the caller's copy of the pose at the refresh: a later write to the
 * skeleton is not seen until the next refresh.
 */
export function refreshBoxes(skeleton: Skeleton, into: OwnedBoxes): readonly BoneBox[] {
  const t = boneTable(skeleton.parts);
  if (into.table !== t) {
    const made: BoneBox[] = [];
    for (let n = 0; n < t.index.length; n++) made.push({ part: t.part[n]!, bone: t.index[n]!, box: t.box[n]!, w: new Float32Array(16) });
    into.table = t;
    into.boxes = made;
  }
  const boxes = into.boxes;
  for (let n = 0; n < boxes.length; n++) (boxes[n]!.w as Float32Array).set(skeleton.world[boxes[n]!.bone]!);
  keepBounds(boxes, into.bounds);
  return boxes;
}

/**
 * Bounds slack: `boxBounds` grows each face by this much, so a line grazing a box's corner is never refused by a bound
 * the rounding left a hair inside it (a margin of the port's own: it widens the cull only).
 */
const BOUNDS_SLACK = 1e-3;
const bounds = new WeakMap<readonly BoneBox[], Float64Array>();

/**
 * BONE-BOXES' fold (`BODY_CULL_FRAME_READING`): the body-frame bounds of `boxes` -- min xyz, max xyz over every
 * non-empty box (`entry`'s empty one is entered by nothing), each box's centre posed by its matrix plus its half sizes
 * along the matrix's columns -- grown by `BOUNDS_SLACK`, written into `out`. Allocates nothing; empty: an inverted box
 * (+Infinity mins), which refuses every line.
 */
export function boxBounds(boxes: readonly BoneBox[], out: Float64Array): Float64Array {
  out[0] = out[1] = out[2] = Infinity;
  out[3] = out[4] = out[5] = -Infinity;
  for (let n = 0; n < boxes.length; n++) {
    const b = boxes[n]!, x = b.box, w = b.w;
    if (x[0] === x[3] && x[1] === x[4] && x[2] === x[5]) continue;
    const cx = (x[0]! + x[3]!) / 2, cy = (x[1]! + x[4]!) / 2, cz = (x[2]! + x[5]!) / 2;
    const hx = (x[3]! - x[0]!) / 2, hy = (x[4]! - x[1]!) / 2, hz = (x[5]! - x[2]!) / 2;
    for (let r = 0; r < 3; r++) {
      const c = cx * w[r]! + cy * w[4 + r]! + cz * w[8 + r]! + w[12 + r]!;
      const e = Math.abs(hx * w[r]!) + Math.abs(hy * w[4 + r]!) + Math.abs(hz * w[8 + r]!);
      if (c - e < out[r]!) out[r] = c - e;
      if (c + e > out[3 + r]!) out[3 + r] = c + e;
    }
  }
  for (let r = 0; r < 3; r++) { out[r] = out[r]! - BOUNDS_SLACK; out[3 + r] = out[3 + r]! + BOUNDS_SLACK; }
  return out;
}

/**
 * Keeps `out` as the bounds of `boxes` (`boxBounds`) for the cull (`rayRecords`): a set whose matrices change in place
 * (`./hitPose` `HitPoser`'s ring slots) calls it again after each change. Allocates nothing.
 */
export function keepBounds(boxes: readonly BoneBox[], out: Float64Array): void {
  boxBounds(boxes, out);
  if (bounds.get(boxes) !== out) bounds.set(boxes, out);
}

const SCRATCH_BOUNDS = new Float64Array(6);
/** The bounds of `boxes`: kept (`keepBounds`), else made into a scratch (valid until the next call). */
function boundsOf(boxes: readonly BoneBox[]): Float64Array {
  return bounds.get(boxes) ?? boxBounds(boxes, SCRATCH_BOUNDS);
}

const cache = new WeakMap<Skeleton, Map<MotionClip | null, Map<number, BoneBox[]>>>();

/**
 * The body-frame bone boxes of `skeleton` posed at `clip`'s key `frame` (0 by default; the bind pose when `clip` is
 * null). Cached per skeleton, clip and frame: the result is shared, do not mutate.
 */
export function skeletonVolumes(skeleton: Skeleton, clip: MotionClip | null, frame = 0): BoneBox[] {
  let byClip = cache.get(skeleton);
  if (!byClip) cache.set(skeleton, byClip = new Map());
  let byFrame = byClip.get(clip);
  if (!byFrame) byClip.set(clip, byFrame = new Map());
  const have = byFrame.get(frame);
  if (have) return have;
  const out = posed(skeleton, clip, frame, () => posedBoxes(skeleton));
  keepBounds(out, new Float64Array(6));
  byFrame.set(frame, out);
  return out;
}

/**
 * The bot aim point's capsule middle of one damage bone (`torsoPoint`; a browser adaptation, no original): the fit the
 * hit capsules used before BONE-BOXES -- its bbox's middle across the bone, its joint to the next joint's local
 * translation along it, kept inside the bbox -- so a bot aims where it aimed. Body frame.
 */
function aimMiddle(bbox: Float32Array, axis: V3 | null): V3 {
  const ext = [0, 1, 2].map((i) => bbox[3 + i]! - bbox[i]!), mid = [0, 1, 2].map((i) => (bbox[3 + i]! + bbox[i]!) / 2);
  const along = (v: readonly number[]): number => v.reduce((k, x, i) => (Math.abs(x) > Math.abs(v[k]!) ? i : k), 0);
  const k = axis ? along(axis) : along(ext);
  const r = Math.max(...ext.map((e, i) => (i === k ? 0 : e / 2)));
  if (!axis) return [mid[0]!, mid[1]!, mid[2]!];
  const o: V3 = [mid[0]!, mid[1]!, mid[2]!];
  o[k] = 0;
  let t0 = 0, t1 = 1;
  const ak = axis[k]!;
  if (ext[k]! > 0 && Math.abs(ak) > 1e-9) {
    let lo = (bbox[k]! + r) / ak, hi = (bbox[3 + k]! - r) / ak;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(0, lo);
    t1 = Math.min(1, hi);
    if (t0 > t1) t0 = t1 = Math.min(1, Math.max(0, mid[k]! / ak));
  }
  const t = (t0 + t1) / 2;
  return [o[0] + axis[0] * t, o[1] + axis[1] * t, o[2] + axis[2] * t];
}

/** The bot aim point of `skeleton` as posed now (`torsoPoint`): the mean of its BODY bones' `aimMiddle`s, body frame. */
function torsoOf(skeleton: Skeleton): V3 {
  let x = 0, y = 0, z = 0, n = 0;
  for (const d of DAMAGE_BONES) {
    if (d.part !== PART.BODY) continue;
    const i = skeleton.indexOf(d.bone);
    if (i < 0) continue;
    const to = d.to ? skeleton.indexOf(d.to) : -1;
    const t = to >= 0 ? skeleton.local[to]! : null;
    const m = aimMiddle(skeleton.parts[i]!.bbox, t ? [t[12]!, t[13]!, t[14]!] : null);
    const p = transformPoint(skeleton.world[i]!, ...m);
    x += p[0]; y += p[1]; z += p[2]; n++;
  }
  return n ? [x / n, y / n, z / n] : [0, STANDING_HEIGHT * 0.65, 0];
}

/** A bone's bbox middle, body frame, posed at `clip`'s key `frame`: where a part's mesh is (the test's hand). */
export function boneCentre(skeleton: Skeleton, clip: MotionClip | null, bone: string, frame = 0): V3 {
  const p = skeleton.part(bone);
  return posed(skeleton, clip, frame, () => transformPoint(skeleton.world[p.index]!,
    (p.bbox[0]! + p.bbox[3]!) / 2, (p.bbox[1]! + p.bbox[4]!) / 2, (p.bbox[2]! + p.bbox[5]!) / 2));
}

/** PRONE-TILT: the skeleton root's posed position, body frame, at `clip`'s key `frame` (the bind pose without a clip). */
export function rootPivot(skeleton: Skeleton, clip: MotionClip | null, frame = 0): V3 {
  const i = skeleton.indexOf('skel_root');
  if (i < 0) return [0, 0, 0];
  return posed(skeleton, clip, frame, () => transformPoint(skeleton.world[i]!, 0, 0, 0));
}

/**
 * Each posture's volumes: the skeleton at its idle (`SimSkeleton.idles`; the bind pose where the idle is missing).
 * LEAN-HIT: with `leans` (`SimSkeleton.leans`), each posture's lean sets at the clip's held key (`leanHeldKey`); a
 * missing lean clip leaves that side at the idle.
 */
export function stanceVolumes(body: {
  skeleton: Skeleton; idles: Readonly<Record<Stance, MotionClip | null>>;
  leans?: Readonly<Record<Stance, { l: MotionClip | null; r: MotionClip | null }>>;
}): StanceVolumes {
  const sk = body.skeleton;
  const out: StanceVolumes = {
    stand: skeletonVolumes(sk, body.idles.stand),
    crouch: skeletonVolumes(sk, body.idles.crouch),
    prone: skeletonVolumes(sk, body.idles.prone),
    pivot: {
      stand: rootPivot(sk, body.idles.stand),
      crouch: rootPivot(sk, body.idles.crouch),
      prone: rootPivot(sk, body.idles.prone),
    },
    torso: {
      stand: posed(sk, body.idles.stand, 0, () => torsoOf(sk)),
      crouch: posed(sk, body.idles.crouch, 0, () => torsoOf(sk)),
      prone: posed(sk, body.idles.prone, 0, () => torsoOf(sk)),
    },
  };
  const leans = body.leans;
  if (!leans) return out;
  const boxes = (k: Stance, c: MotionClip | null): BoneBox[] => c ? skeletonVolumes(sk, c, leanHeldKey(c)) : out[k] as BoneBox[];
  const root = (k: Stance, c: MotionClip | null): V3 => c ? rootPivot(sk, c, leanHeldKey(c)) : out.pivot![k];
  const side = <T>(f: (k: Stance, c: MotionClip | null) => T): Record<Stance, { l: T; r: T }> => ({
    stand: { l: f('stand', leans.stand.l), r: f('stand', leans.stand.r) },
    crouch: { l: f('crouch', leans.crouch.l), r: f('crouch', leans.crouch.r) },
    prone: { l: f('prone', leans.prone.l), r: f('prone', leans.prone.r) },
  });
  return { ...out, lean: side(boxes), leanPivot: side(root) };
}

/** PRONE-TILT: a body-frame point turned by the root's tilt `q` about the root's posed `pivot` (`FUN_00548090`'s write). */
export function tiltBodyPoint(p: V3, q: readonly number[], pivot: V3): V3 {
  const r = rotateByQuat(q, [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]]);
  return [pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]];
}

/**
 * `rotateByQuat`'s turn of `(vx, vy, vz)` by `q`, written into `out` at `at` -- the same operations in the same order, so
 * the same doubles; allocates nothing (BONE-BOXES' fold: the room's hot loop, `bodyRecords`).
 */
function turnInto(out: Float64Array, at: number, q: readonly number[], vx: number, vy: number, vz: number): void {
  const x = q[0]!, y = q[1]!, z = q[2]!, w = q[3]!;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  out[at] = vx + w * tx + (y * tz - z * ty); out[at + 1] = vy + w * ty + (z * tx - x * tz); out[at + 2] = vz + w * tz + (x * ty - y * tx);
}

/**
 * PRONE-TILT: a bone's matrix turned by the root's tilt `q` about `pivot`, written into `out`: its axes rotated, its
 * origin as `tiltBodyPoint` (the same doubles: `turnInto`). Allocates nothing.
 */
function tiltInto(out: Float64Array, w: ArrayLike<number>, q: readonly number[], pivot: readonly number[]): Float64Array {
  turnInto(out, 0, q, w[0]!, w[1]!, w[2]!);
  turnInto(out, 4, q, w[4]!, w[5]!, w[6]!);
  turnInto(out, 8, q, w[8]!, w[9]!, w[10]!);
  out[3] = 0; out[7] = 0; out[11] = 0;
  turnInto(out, 12, q, w[12]! - pivot[0]!, w[13]! - pivot[1]!, w[14]! - pivot[2]!);
  out[12] = pivot[0]! + out[12]!; out[13] = pivot[1]! + out[13]!; out[14] = pivot[2]! + out[14]!; out[15] = 1;
  return out;
}

/** PRONE-TILT: a bone's matrix turned by the root's tilt `q` about `pivot` (`tiltInto`), a new matrix. */
function tiltMatrix(w: ArrayLike<number>, q: readonly number[], pivot: V3): Float64Array {
  return tiltInto(new Float64Array(16), w, q, pivot);
}

/** A body-frame point (x right, y up, z behind) to the world at the feet and yaw: `play.ts` `actorToWorld`. */
function actorToWorld(feet: readonly number[], yaw: number, v: V3): V3 {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [feet[0]! + v[0] * c + v[2] * s, feet[1]! + v[1], feet[2]! - v[0] * s + v[2] * c];
}

/** The body-frame bot aim point placed at the feet and yaw (`torsoPoint`). */
export function placeBodyPoint(feet: readonly number[], yaw: number, v: V3): V3 {
  return actorToWorld(feet, yaw, v);
}

/**
 * The volumes of a SEAL at `feet`, facing `yaw` (degrees), in `posture`: the skeleton's boxes (`volumes`, from
 * `stanceVolumes`) placed at the feet and turned by the yaw, or `placeholderVolumes` when no skeleton was loaded.
 * PRONE-TILT (`./rootTilt`, research 217 s7): `tilt`, the skeleton root's quaternion the body's rule wrote
 * (`Walker.rootTilt`), turns each bone's matrix about the posed root first, as it turns the page's body
 * (`TILT_HIT_TEST_READING` 'posed'); null, absent, the placeholder's or 'level': yaw-only as before.
 * LEAN-HIT (issue #752; research 217 s3.6): `peek`, the body's held peek (-1 left, 1 right: `TraversalHooks.peeking`,
 * never the camera's eased `peek()`), poses the lean set (`StanceVolumes.lean`) and turns it about its own posed root;
 * 0, absent, or volumes without a lean set: the idle's, as before. The placeholder never leans.
 */
export function bodyVolumes(feet: readonly number[], yaw: number, posture: Stance, volumes?: StanceVolumes | null,
  tilt?: readonly number[] | null, peek: -1 | 0 | 1 = 0): HitBody {
  if (!volumes) return { feet, yaw, boxes: null, caps: placeholderVolumes(feet, yaw, posture) };
  const side = peek < 0 ? 'l' : peek > 0 ? 'r' : null;
  const boxes = side && volumes.lean ? volumes.lean[posture][side] : volumes[posture];
  const pivot = side && volumes.lean ? volumes.leanPivot?.[posture][side] : volumes.pivot?.[posture];
  const turned = tilt && pivot && TILT_HIT_TEST_READING === 'posed' && tilt[3] !== 1
    ? boxes.map((b): BoneBox => ({ part: b.part, bone: b.bone, box: b.box, w: tiltMatrix(b.w, tilt, pivot) })) : boxes;
  return { feet, yaw, boxes: turned, caps: null };
}

/**
 * HIT-POSE (research 217 s3.6): body-frame boxes already posed -- the live skeleton's (`posedBoxes`, `./hitPose`), its
 * root tilt and its lean in the pose -- placed at `feet` and turned by `yaw` (degrees), as `bodyVolumes` places a
 * stance's set; nothing turned again (the animator wrote the tilt on the root and played the lean's clip). It copies
 * nothing: the boxes are the caller's.
 */
export function placedVolumes(feet: readonly number[], yaw: number, boxes: readonly BoneBox[]): HitBody {
  return { feet, yaw, boxes, caps: null };
}

/** The world point of a body-frame point of `body` (its feet and yaw). */
export function bodyPointToWorld(body: Pick<HitBody, 'feet' | 'yaw'>, v: V3): V3 {
  return actorToWorld(body.feet, body.yaw, v);
}

/** Body-frame points: x right, y up, z forward (the facing), to the world at the feet and yaw (forward is (-sin, -cos)). */
function toWorld(feet: readonly number[], yaw: number, p: V3): V3 {
  const y = (yaw * Math.PI) / 180, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
  return [feet[0]! + p[0] * rx + p[2] * fx, feet[1]! + p[1], feet[2]! + p[0] * rz + p[2] * fz];
}

const UPRIGHT: readonly [number, V3, V3, number][] = [
  // HIT_VOLUMES_PLACEHOLDER: part, a, b (body frame, z forward, heights as fractions of the standing body), radius
  [PART.HEAD, [0, HEAD_VOLUME_HEIGHT_READING / STANDING_HEIGHT, 0], [0, HEAD_VOLUME_HEIGHT_READING / STANDING_HEIGHT, 0], 1.4],
  [PART.BODY, [0, 0.47, 0], [0, 0.84, 0], 2.4],
  [PART.RARM, [2.6, 0.84, 0.3], [2.9, 0.58, 1.2], 1.0],
  [PART.LARM, [-2.6, 0.84, 0.3], [-2.9, 0.58, 1.2], 1.0],
  [PART.RLEG, [1.1, 0.47, 0], [1.2, 0.04, 0], 1.2],
  [PART.LLEG, [-1.1, 0.47, 0], [-1.2, 0.04, 0], 1.2],
];

/** HIT_VOLUMES_PLACEHOLDER: the hand-laid capsules on the stance heights, the fallback without a skeleton. */
export function placeholderVolumes(feet: readonly number[], yaw: number, posture: Stance): Capsule[] {
  if (posture === 'prone') {
    // PF-21 (research 180 s1.4): laid on the prone size class, its 6.0 high (`PRONE_HEIGHT`), at its half -- where its
    // probe stands (D:L415231-415233), between the posed hips 2.168 and shoulders 3.891 -- every capsule within it.
    const y = PRONE_HEIGHT / 2;
    const v = (part: number, a: V3, b: V3, r: number): Capsule => ({ part, a: toWorld(feet, yaw, a), b: toWorld(feet, yaw, b), r });
    return [
      v(PART.HEAD, [0, y, 8], [0, y, 8], 1.4),
      v(PART.BODY, [0, y, -1], [0, y, 6], 1.6),
      v(PART.RARM, [1.8, y, 6], [1.4, y, 10], 0.9),
      v(PART.LARM, [-1.8, y, 6], [-1.4, y, 10], 0.9),
      v(PART.RLEG, [0.9, y, -1], [1.3, y, -9], 1.1),
      v(PART.LLEG, [-0.9, y, -1], [-1.3, y, -9], 1.1),
    ];
  }
  const height = posture === 'crouch' ? CROUCH_HEIGHT : STANDING_HEIGHT;
  return UPRIGHT.map(([part, a, b, r]) => ({
    part, r,
    a: toWorld(feet, yaw, [a[0], a[1] * height, a[2]]),
    b: toWorld(feet, yaw, [b[0], b[1] * height, b[2]]),
  }));
}

/**
 * Where a ray from `o` along the unit `d` first enters a capsule, as the distance along it; null when it misses within
 * `reach` (or starts inside: a round leaves its own shooter). The placeholder's (`placeholderVolumes`).
 */
export function rayCapsule(o: V3, d: V3, reach: number, c: Capsule): number | null {
  const ba: V3 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
  const oa: V3 = [o[0] - c.a[0], o[1] - c.a[1], o[2] - c.a[2]];
  const baba = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const bard = ba[0] * d[0] + ba[1] * d[1] + ba[2] * d[2];
  const baoa = ba[0] * oa[0] + ba[1] * oa[1] + ba[2] * oa[2];
  const rdoa = d[0] * oa[0] + d[1] * oa[1] + d[2] * oa[2];
  const oaoa = oa[0] * oa[0] + oa[1] * oa[1] + oa[2] * oa[2];
  const r2 = c.r * c.r;
  const sphere = (cx: V3): number | null => {
    const oc: V3 = [o[0] - cx[0], o[1] - cx[1], o[2] - cx[2]];
    const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
    const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r2;
    const h = b * b - cc;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    return t >= 0 && t <= reach ? t : null;
  };
  if (baba < 1e-12) return sphere(c.a);
  const a = baba - bard * bard;
  const b = baba * rdoa - baoa * bard;
  const cc = baba * oaoa - baoa * baoa - r2 * baba;
  const h = b * b - a * cc;
  if (h < 0) return null;
  if (Math.abs(a) > 1e-12) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 && t <= reach ? t : null;
  }
  const ends = [sphere(c.a), sphere(c.b)].filter((t): t is number => t !== null);
  return ends.length ? Math.min(...ends) : null;
}

/**
 * The box's test (research 398 s1, "The box's test": the box class's slot `+0x14`, r0001 0x2dcda0-0x2dd01c, and the VU0
 * microprogram's entry 0x30, micro 83-277; a bone node one-sided, its mode word 0xe0): a line from `(ox, oy, oz)` along
 * `(dx, dy, dz)`, both in the box's own frame, against `box` (min xyz, max xyz). The six faces are tried in the order
 * +y, +z, +x, -z, -x, -y, a face only when the line's start lies outside its plane (strictly); a tried face is the hit
 * when the line crosses its plane inside its rectangle (the edges included) within `reach` of the start. The first such
 * face ends the test: its distance along the line (in `d`'s units), else -1. A start inside the box tries no face and
 * enters nothing; a line parallel to a face never crosses it; a box whose minimum lies over its maximum is entered by
 * nothing. An empty bbox -- all six zero, as `skel_root`'s and `aimnodes`' on the SEAL (the fixture disc's MP2
 * `seal_A_scuba`; research 78 s3.1: the parts that move no vertex most), and `spinelo`'s on the disc (the table gives it
 * the band box, `SPINELO_BAND_PLACEHOLDER`) -- is a box nothing enters: the original's rectangle test would pass only a
 * line through its one point exactly (measure zero), which the port does not keep.
 * Allocates nothing.
 */
function entry(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: ArrayLike<number>, reach: number): number {
  const x0 = b[0]!, y0 = b[1]!, z0 = b[2]!, x1 = b[3]!, y1 = b[4]!, z1 = b[5]!;
  if (x0 === x1 && y0 === y1 && z0 === z1) return -1;
  let t: number, u: number, v: number;
  if (oy > y1 && dy < 0) { t = (y1 - oy) / dy; u = ox + dx * t; v = oz + dz * t; if (t <= reach && u >= x0 && u <= x1 && v >= z0 && v <= z1) return t; }
  if (oz > z1 && dz < 0) { t = (z1 - oz) / dz; u = ox + dx * t; v = oy + dy * t; if (t <= reach && u >= x0 && u <= x1 && v >= y0 && v <= y1) return t; }
  if (ox > x1 && dx < 0) { t = (x1 - ox) / dx; u = oy + dy * t; v = oz + dz * t; if (t <= reach && u >= y0 && u <= y1 && v >= z0 && v <= z1) return t; }
  if (oz < z0 && dz > 0) { t = (z0 - oz) / dz; u = ox + dx * t; v = oy + dy * t; if (t <= reach && u >= x0 && u <= x1 && v >= y0 && v <= y1) return t; }
  if (ox < x0 && dx > 0) { t = (x0 - ox) / dx; u = oy + dy * t; v = oz + dz * t; if (t <= reach && u >= y0 && u <= y1 && v >= z0 && v <= z1) return t; }
  if (oy < y0 && dy > 0) { t = (y0 - oy) / dy; u = ox + dx * t; v = oz + dz * t; if (t <= reach && u >= x0 && u <= x1 && v >= z0 && v <= z1) return t; }
  return -1;
}

/** `entry` with the line as arrays (the unit test's hand): the distance along `d` to the box's entry face, or -1. */
export function rayBox(o: ArrayLike<number>, d: ArrayLike<number>, box: ArrayLike<number>, reach: number): number {
  return entry(o[0]!, o[1]!, o[2]!, d[0]!, d[1]!, d[2]!, box, reach);
}

/**
 * Whether the line from `o` along the unit `d` for `reach`, both ends put in the body's frame at `feet` (`(c, s)` the
 * cosine and sine of its yaw), lies wholly past one face of the body-frame box `k` (min xyz, max xyz): both ends strictly
 * past the same face (`FUN_003124f0` D:L213172-213244's test). Allocates nothing.
 */
function lineOutside(k: ArrayLike<number>, o: readonly number[], d: readonly number[], reach: number, feet: readonly number[], c: number, s: number): boolean {
  const ax = o[0]! - feet[0]!, ay = o[1]! - feet[1]!, az = o[2]! - feet[2]!;
  const bx = ax + d[0]! * reach, by = ay + d[1]! * reach, bz = az + d[2]! * reach;
  const px = ax * c - az * s, pz = ax * s + az * c, qx = bx * c - bz * s, qz = bx * s + bz * c;
  return (px < k[0]! && qx < k[0]!) || (k[3]! < px && k[3]! < qx) || (ay < k[1]! && by < k[1]!) || (k[4]! < ay && k[4]! < by)
    || (pz < k[2]! && qz < k[2]!) || (k[5]! < pz && k[5]! < qz);
}

/**
 * `FUN_003124f0` (D:L213172-213244) on `BODY_CULL_BOX` (`BODY_CULL_FRAME_READING`): whether the line from `o` along the
 * unit `d` for `reach`, both ends put in the body's frame at `feet` and `yaw`, lies wholly outside one face of the box
 * (both ends strictly past the same face) -- the body refused before any bone -- and, given the body's posed bounds
 * (`boxBounds`), outside one face of those too (the widening: a pose that leaves the box keeps its bones). Allocates
 * nothing.
 */
export function bodyCulled(o: readonly number[], d: readonly number[], reach: number, feet: readonly number[], yaw: number,
  posed?: ArrayLike<number> | null): boolean {
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return lineOutside(BODY_CULL_BOX, o, d, reach, feet, c, s) && (!posed || lineOutside(posed, o, d, reach, feet, c, s));
}

/**
 * The line from `o` along `d` (world) against one bone box `box` posed by `w` on a body at `feet` (`(c, s)` its yaw's
 * cosine and sine): the line put in the body's frame, then in the bone's (`w` inverted: its 3x3 by its adjugate, so a
 * scale would be undone too), and `entry`'s distance -- in `d`'s units, as an affine map keeps a line's parameter. -1: no
 * record. Allocates nothing.
 */
function rayBoneBox(o: readonly number[], d: readonly number[], reach: number, c: number, s: number, feet: readonly number[],
  w: ArrayLike<number>, box: ArrayLike<number>): number {
  // world -> body frame (`actorToWorld` undone)
  const ex = o[0]! - feet[0]!, ez = o[2]! - feet[2]!;
  const bx = ex * c - ez * s - w[12]!, by = o[1]! - feet[1]! - w[13]!, bz = ex * s + ez * c - w[14]!;
  const vx = d[0]! * c - d[2]! * s, vy = d[1]!, vz = d[0]! * s + d[2]! * c;
  // body frame -> bone frame: L^-1 (p - t), L's columns w[0..2], w[4..6], w[8..10]
  const a = w[0]!, bb = w[4]!, cc = w[8]!, dd = w[1]!, e = w[5]!, f = w[9]!, g = w[2]!, h = w[6]!, i = w[10]!;
  const A = e * i - f * h, B = -(dd * i - f * g), C = dd * h - e * g;
  const det = a * A + bb * B + cc * C;
  if (det === 0) return -1;
  const D = -(bb * i - cc * h), E = a * i - cc * g, F = -(a * h - bb * g);
  const G = bb * f - cc * e, H = -(a * f - cc * dd), I = a * e - bb * dd;
  const k = 1 / det;
  const lx = (A * bx + D * by + G * bz) * k, ly = (B * bx + E * by + H * bz) * k, lz = (C * bx + F * by + I * bz) * k;
  const mx = (A * vx + D * vy + G * vz) * k, my = (B * vx + E * vy + H * vz) * k, mz = (C * vx + F * vy + I * vz) * k;
  return entry(lx, ly, lz, mx, my, mz, box, reach);
}

/** A record's receiver: the part (`NO_PART` for a bone that takes nothing), the distance along the ray, the bone's index (-1: a placeholder capsule). */
export type RecordSink = (part: number, t: number, bone: number) => void;

/**
 * Every record a ray from `o` along the unit `d` makes on `body` within `reach` (research 398 s1): none when the body's
 * cull refuses the line (`bodyCulled`: `BODY_CULL_BOX`, then -- only for a line it refuses -- the boxes' bounds, kept or
 * made, `BODY_CULL_FRAME_READING`); else one for each bone box it enters, at its entry, in the boxes' order (the caller
 * sorts) -- the damage bones and the others alike. The placeholder (no skeleton) gives one, at its nearest capsule, the
 * box alone culling it. Allocates nothing on the boxes' path but the sink's own.
 */
export function rayRecords(o: readonly number[], d: readonly number[], reach: number, body: HitBody, sink: RecordSink): void {
  const r = (body.yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const boxes = body.boxes;
  if (lineOutside(BODY_CULL_BOX, o, d, reach, body.feet, c, s) && (!boxes || lineOutside(boundsOf(boxes), o, d, reach, body.feet, c, s))) return;
  if (body.caps) {
    let best = -1, part = NO_PART;
    for (const cap of body.caps) {
      const t = rayCapsule(o as V3, d as V3, reach, cap);
      if (t !== null && (best < 0 || t < best)) { best = t; part = cap.part; }
    }
    if (best >= 0) sink(part, best, -1);
    return;
  }
  if (!boxes) return;
  for (let n = 0; n < boxes.length; n++) {
    const b = boxes[n]!;
    const t = rayBoneBox(o, d, reach, c, s, body.feet, b.w, b.box);
    if (t >= 0) sink(b.part, t, b.bone);
  }
}

const SCRATCH_W = new Float64Array(16), SCRATCH_TURNED = new Float64Array(6), SCRATCH_CORNER = new Float64Array(3);

/**
 * BONE-BOXES' fold (the review's finding 3): `rayRecords` on `bodyVolumes(feet, yaw, posture, volumes, tilt, peek)`'s body
 * -- the same records, in the same order, at the same distances (the tilted matrices are `tiltInto`'s doubles either
 * way) -- for the room's hot loop: the cull first (for a tilted set, the line against `BODY_CULL_BOX` and then the set's
 * kept bounds turned about the pivot, their eight corners' bounds: they hold every turned box), and only past it each
 * bone's tilted matrix, built into one owned scratch. Allocates nothing on the boxes' path but the sink's own (the
 * placeholder's capsules, without a skeleton, as `bodyVolumes`).
 */
export function bodyRecords(o: readonly number[], d: readonly number[], reach: number, feet: readonly number[], yaw: number,
  posture: Stance, volumes: StanceVolumes | null | undefined, tilt: readonly number[] | null | undefined, peek: -1 | 0 | 1,
  sink: RecordSink): void {
  if (!volumes) { rayRecords(o, d, reach, bodyVolumes(feet, yaw, posture, volumes), sink); return; }
  const side = peek < 0 ? 'l' : peek > 0 ? 'r' : null;
  const boxes = side && volumes.lean ? volumes.lean[posture][side] : volumes[posture];
  const pivot = side && volumes.lean ? volumes.leanPivot?.[posture][side] : volumes.pivot?.[posture];
  const r = (yaw * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  if (!(tilt && pivot && TILT_HIT_TEST_READING === 'posed' && tilt[3] !== 1)) {
    if (lineOutside(BODY_CULL_BOX, o, d, reach, feet, c, s) && lineOutside(boundsOf(boxes), o, d, reach, feet, c, s)) return;
    for (let n = 0; n < boxes.length; n++) {
      const b = boxes[n]!;
      const t = rayBoneBox(o, d, reach, c, s, feet, b.w, b.box);
      if (t >= 0) sink(b.part, t, b.bone);
    }
    return;
  }
  if (lineOutside(BODY_CULL_BOX, o, d, reach, feet, c, s)) {
    const k = boundsOf(boxes), out = SCRATCH_TURNED;
    out[0] = out[1] = out[2] = Infinity;
    out[3] = out[4] = out[5] = -Infinity;
    for (let n = 0; n < 8; n++) {
      turnInto(SCRATCH_CORNER, 0, tilt, (n & 1 ? k[3]! : k[0]!) - pivot[0], (n & 2 ? k[4]! : k[1]!) - pivot[1], (n & 4 ? k[5]! : k[2]!) - pivot[2]);
      for (let a = 0; a < 3; a++) {
        const v = pivot[a]! + SCRATCH_CORNER[a]!;
        if (v < out[a]!) out[a] = v;
        if (v > out[3 + a]!) out[3 + a] = v;
      }
    }
    if (lineOutside(out, o, d, reach, feet, c, s)) return;
  }
  for (let n = 0; n < boxes.length; n++) {
    const b = boxes[n]!;
    const t = rayBoneBox(o, d, reach, c, s, feet, tiltInto(SCRATCH_W, b.w, tilt, pivot), b.box);
    if (t >= 0) sink(b.part, t, b.bone);
  }
}

/** The nearest record a ray makes on a body (`rayRecords`; a tie keeps the first), or null: where the round first meets it, and that bone's part (`NO_PART` possible). */
export function rayBody(o: readonly number[], d: readonly number[], reach: number, body: HitBody): { part: number; t: number } | null {
  let best: { part: number; t: number } | null = null;
  rayRecords(o, d, reach, body, (part, t) => {
    if (!best || t < best.t) best = { part, t };
  });
  return best;
}

/** PAGE-AIM-ALLOC: the nearest-record sink's state (`rayNearest`, `bodyNearest`); no cast runs inside another. */
let nearHas = false, nearT = 0;
const NEAREST: RecordSink = (_part, t) => { if (!nearHas || t < nearT) { nearHas = true; nearT = t; } };

/**
 * PAGE-AIM-ALLOC: `rayBody(o, d, reach, body)?.t ?? null` -- the same record kept (the first of the nearest), its
 * distance alone -- without a sink or a result made per call.
 */
export function rayNearest(o: readonly number[], d: readonly number[], reach: number, body: HitBody): number | null {
  nearHas = false;
  rayRecords(o, d, reach, body, NEAREST);
  return nearHas ? nearT : null;
}

/**
 * PAGE-AIM-ALLOC: `rayNearest` on `bodyVolumes(feet, yaw, posture, volumes, tilt, peek)`'s body through `bodyRecords`
 * (the same records in the same order, the cull before any tilted matrix is built).
 */
export function bodyNearest(o: readonly number[], d: readonly number[], reach: number, feet: readonly number[], yaw: number,
  posture: Stance, volumes: StanceVolumes | null | undefined, tilt: readonly number[] | null | undefined, peek: -1 | 0 | 1): number | null {
  nearHas = false;
  bodyRecords(o, d, reach, feet, yaw, posture, volumes, tilt, peek, NEAREST);
  return nearHas ? nearT : null;
}
