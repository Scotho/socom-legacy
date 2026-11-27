import { Euler, Matrix4, Quaternion } from 'three';
import { RECORD_ANGLE_DENOMINATOR, RECORD_SCALE_DENOMINATOR, RECORD_SCALE_MAX_ADAPTATION, RECORD_SCALE_MIN_ADAPTATION } from '@s2u/creator-contracts';

/**
 * FC-1 (the owner, 2026-11-07: "re: crispy's work, take this on and finish it: hiding the pitch/roll/scale"; a browser
 * adaptation, FG.R2 -- the game has no editor, nothing here is the original's): the Forge Overhaul's pitch, roll and
 * scale controls -- the Inspector's Pitch, Roll and Scale fields and the Scale row's reset, the Scale tool and its R key,
 * the rotate gizmo's tilt rings -- were stubs while record v3 kept a placed piece's yaw alone, and were hidden behind
 * this switch, not deleted.
 *
 * FX-9 (the FX plan's FX.R3, the owner, 2026-11-11: "Let's finish scale and rotate 100% to our standards, functional for
 * multiplayer forge matches as best we can collision and all"; a browser adaptation, FG.R2): the record keeps a piece's
 * pitch, roll and scale an axis since FX-1 (`creator-contracts` `PoseRow`, `recordOfLayout`), so the controls are real
 * and the switch is off. It stays, named, as the one place that would hide them again.
 */
export const FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION = false;

/**
 * FX-9: a piece's turn as the Inspector shows it, in degrees, read in three's `YXZ` Euler order -- yaw about Y, then
 * pitch about X, then roll about Z (`creator-contracts` `PoseRow`'s order) -- so the yaw stays the turn about the
 * vertical a marker's yaw is. FN-4: the Inspector's turn is relative to the parent's turn (`page.ts` `localTurnOf`).
 */
export interface PieceTurn { yaw: number; pitch: number; roll: number }

/** The most a piece pitches either way, in degrees (`PoseRow`: -90..90). */
export const PIECE_PITCH_LIMIT = 90;
const DEG = 180 / Math.PI;

/** `n` on the record's scale lattice (`RECORD_SCALE_DENOMINATOR`), held within its bounds; a value that is no number is 1. */
export function scaleOnLattice(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const onLattice = Math.round(n * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR;
  return Math.min(RECORD_SCALE_MAX_ADAPTATION, Math.max(RECORD_SCALE_MIN_ADAPTATION, onLattice)) + 0;
}

/**
 * A whole degree shown signed, in -179..180: the Inspector's pitch and roll (the record stores a roll in 0..359, as a
 * yaw; the field shows -45 where the record keeps 315, the conversion is here, never in the record).
 */
export function signedDegrees(d: number): number {
  if (!Number.isFinite(d)) return 0;
  const whole = ((Math.round(d) % 360) + 360) % 360;
  return (whole > 180 ? whole - 360 : whole) + 0;
}

/** A quaternion's turn in degrees, in the `YXZ` order (three's `Euler.setFromQuaternion`), not rounded. */
export function turnOf(q: Quaternion): PieceTurn {
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return { yaw: e.y * DEG + 0, pitch: e.x * DEG + 0, roll: e.z * DEG + 0 };
}

/** The quaternion of a turn in degrees, in the `YXZ` order (`R_y(yaw) * R_x(pitch) * R_z(roll)`). */
export function turnQuaternion(t: PieceTurn, out: Quaternion = new Quaternion()): Quaternion {
  return out.setFromEuler(new Euler(t.pitch / DEG, t.yaw / DEG, t.roll / DEG, 'YXZ'));
}

/**
 * A turn on whole degrees: each angle a whole degree, signed; the pitch held within +-`PIECE_PITCH_LIMIT`; and the
 * gimbal's one canonical form -- at a pitch of 90 (-90) the roll is 0 and the yaw less (plus) it, the same turn
 * (`creator-contracts` `poseOf`). FN-4: the Inspector's own lattice, the one its three angle fields are typed and shown
 * in -- a piece's turn RELATIVE TO ITS PARENT'S (`page.ts` `poseOn`); the record keeps the WORLD turn on a hundredth
 * (`recordTurn`). At the top (no parent) the two are one, so a parentless piece's world turn stays whole.
 */
export function snappedTurn(t: PieceTurn): PieceTurn {
  const pitch = Math.min(PIECE_PITCH_LIMIT, Math.max(-PIECE_PITCH_LIMIT, Math.round(Number.isFinite(t.pitch) ? t.pitch : 0))) + 0;
  let yaw = signedDegrees(t.yaw), roll = signedDegrees(t.roll);
  if (Math.abs(pitch) === PIECE_PITCH_LIMIT) { yaw = signedDegrees(yaw - Math.sign(pitch) * roll); roll = 0; }
  return { yaw, pitch, roll };
}

/**
 * FN-4 (ours; the Forge lane's FN.R5; a browser adaptation, FG.R2): the gimbal threshold the record reads a turn at --
 * `creator-contracts` `poseOf`'s `GIMBAL`, which is three's own `Euler.setFromRotationMatrix` threshold for `YXZ`. Not a
 * game value; kept equal to the record's so the page and the record read one turn alike.
 */
const RECORD_GIMBAL = 0.9999999;
/** FN-4: degrees on the record's angle lattice (`RECORD_ANGLE_DENOMINATOR`), signed; +0 drops -0 (`poseOf`'s pitch). */
const onAngleLattice = (deg: number): number => Math.round(deg * RECORD_ANGLE_DENOMINATOR) / RECORD_ANGLE_DENOMINATOR + 0;
/** FN-4: a turn (radians) on the record's angle lattice in 0..359.99 (`poseOf`'s yaw and roll, `fineDeg`). */
const latticeDegrees = (rad: number): number => {
  const turn = 360 * RECORD_ANGLE_DENOMINATOR;
  return (((Math.round(((rad * 180) / Math.PI) * RECORD_ANGLE_DENOMINATOR) % turn) + turn) % turn) / RECORD_ANGLE_DENOMINATOR;
};

/**
 * FN-4 (ours; FN.R5, the owner: "agreed with your suggestion"; a browser adaptation, FG.R2): the turn `q` as the layout
 * record keeps a piece's WORLD turn -- `creator-contracts` `poseOf`'s reading, step for step: three's `YXZ` read off the
 * matrix's unit columns (at the gimbal, `RECORD_GIMBAL`, roll 0 and the yaw off the first column), the pitch on a
 * hundredth of a degree (`RECORD_ANGLE_DENOMINATOR`), signed; the roll and the yaw on a hundredth in 0..359.99; at a
 * pitch of 90 (-90) on that lattice the roll 0 and the yaw less (plus) it; a turn whose pitch and roll are 0 on the
 * lattice its yaw off the first column. `turnQuaternion(recordTurn(q))` is the turn a save and a reopen give back, so the
 * page puts a piece there at an edit's commit (`page.ts` `poseOn`); `transformStubsSwitch.test.ts` holds the two
 * readings together.
 */
export function recordTurn(q: Quaternion): PieceTurn {
  const m = new Matrix4().makeRotationFromQuaternion(q).elements;
  const at = (i: number): number => m[i] ?? 0;
  const lengths = [0, 4, 8].map((c) => Math.hypot(at(c), at(c + 1), at(c + 2)));
  const unit = (i: number, column: number): number => at(i) / (lengths[column] || 1);
  const m23 = unit(9, 2);
  const x = Math.asin(-Math.min(1, Math.max(-1, m23)));
  const gimbal = Math.abs(m23) >= RECORD_GIMBAL;
  const y = gimbal ? Math.atan2(-unit(2, 0), unit(0, 0)) : Math.atan2(unit(8, 2), unit(10, 2));
  const z = gimbal ? 0 : Math.atan2(unit(1, 0), unit(5, 1));
  const pitch = onAngleLattice((x * 180) / Math.PI);
  const roll = Math.abs(pitch) === PIECE_PITCH_LIMIT ? 0 : latticeDegrees(z);
  let yaw = Math.atan2(-at(2), at(0));                       // `poseOf`'s `yawOf`: a turn about the vertical alone
  if (pitch !== 0 || roll !== 0) yaw = Math.abs(pitch) === PIECE_PITCH_LIMIT ? y - Math.sign(pitch) * z : y;
  return { yaw: latticeDegrees(yaw), pitch, roll };
}

/**
 * FN-4, fix round 1 (F1; ours, a browser adaptation, FG.R2 -- no game value): how near, in degrees, a piece's turn
 * relative to its parent must be to its whole-degree triple (`snappedTurn`) for an edit that is not about angles (a carry,
 * a typed X, Y or Z, a typed or scrubbed Scale, the gizmo's scale release: `page.ts` `poseOn` with `whole` false) to put
 * it exactly there instead of keeping it as it is. Measured as the ANGLE BETWEEN the two turns (`2 acos |qA . qB|`),
 * never as a difference of Euler angles, which grow as 1 / cos pitch near the vertical. Why 0.1 (FN-4, fix round 3; it
 * was 0.05): the record's hundredth moves a turn by at most 0.0105 degrees away from the vertical in the seat's
 * measurement (`fn4-lattice-output.txt`, the weekend mega sprint's Forge evidence folder: "the turn at most ... deg off"),
 * but by up to 0.0555 degrees at the gimbal's edge (the fresh review's and the seat's arithmetic, 2026-11-15: a true
 * pitch of 89.9745 with roll 180 is read at the gimbal and written 89.97, roll 0, the roll in the yaw -- 0.0255 + 0.03
 * degrees), which 0.05 missed. 0.1 is above that worst case, so a child typed on whole degrees and read back off the
 * record is inside it and stays put over many carries; and a tenth of a degree is far under any turn a person would see.
 */
export const LOCAL_TURN_WHOLE_EPSILON_ADAPTATION = 0.1;

/**
 * FN-4, fix round 1 (F1; ours): the relative turn `local` an edit that is not about angles keeps -- its whole-degree
 * triple's turn (`turnQuaternion(snappedTurn(turnOf(local)))`) when the angle between the two is at most
 * `LOCAL_TURN_WHOLE_EPSILON_ADAPTATION`, else a copy of `local` unchanged. So a layout saved before FN-4 (a nested piece's
 * WORLD turn on whole degrees, its turn relative to a tilted parent not) is never turned by a move, while a piece typed on
 * whole degrees does not drift off them by the record's hundredth at each carry.
 */
export function wholeOrKeptTurn(local: Quaternion): Quaternion {
  const whole = turnQuaternion(snappedTurn(turnOf(local)));
  const apart = 2 * Math.acos(Math.min(1, Math.abs(local.dot(whole)))) * DEG;
  return apart <= LOCAL_TURN_WHOLE_EPSILON_ADAPTATION ? whole : local.clone();
}

/**
 * FX-9 (the A2 scope's T10; FX.R3): a creator pack's piece is drawn and solid only when its matrix is a turn about +Y at
 * unit scale (`../packs/content/collision` `pieceYaw`, which `layoutGround` and `./matchMap` `composeMatchMap` both
 * read): tilted or scaled it would be neither in the composed match map. So its pitch, roll and scale are refused, in
 * these words, until the content hull takes a whole `T * R * S` (the scope's later extension).
 */
export const PACK_PIECE_POSE_REFUSAL = 'Pack pieces turn about the vertical at their own size: tilt or scale a disc prop instead';

/**
 * FC2-7 (ours; a browser adaptation, FG.R2): why an edit to a piece is refused when it would carry a piece under it in
 * the tree (`Layout.tree`) past the record's size bounds -- the follower is never clamped silently.
 */
export const FOLLOWER_SIZE_REFUSAL = 'A piece under it would go past the sizes a layout keeps (0.1 to 4 an axis): scale it less, or take that piece out from under it';

/**
 * FC2-7 (ours): whether a scale an axis, put on the record's lattice (rounded to 0.01), is within its bounds
 * (`RECORD_SCALE_MIN_ADAPTATION`..`MAX`) -- what `scaleOnLattice` would keep without clamping it.
 */
export function scaleWithinRecord(s: readonly number[]): boolean {
  return s.every((n) => {
    const onLattice = Math.round(n * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR;
    return Number.isFinite(n) && onLattice >= RECORD_SCALE_MIN_ADAPTATION && onLattice <= RECORD_SCALE_MAX_ADAPTATION;
  });
}

/** A scale an axis on the record's lattice (`scaleOnLattice` each). */
export function snappedScale(s: readonly number[]): [number, number, number] {
  return [scaleOnLattice(s[0] ?? 1), scaleOnLattice(s[1] ?? 1), scaleOnLattice(s[2] ?? 1)];
}
