import { Euler, Quaternion } from 'three';
import { RECORD_SCALE_DENOMINATOR, RECORD_SCALE_MAX_ADAPTATION, RECORD_SCALE_MIN_ADAPTATION } from '@s2u/creator-contracts';

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
 * vertical a marker's yaw is.
 */
export interface PieceTurn { yaw: number; pitch: number; roll: number }

/** The most a piece pitches either way, in degrees (`PoseRow`: a whole degree in -90..90). */
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
 * A turn on the record's lattice: each angle a whole degree, signed; the pitch held within +-`PIECE_PITCH_LIMIT`; and
 * the record's one canonical form at the gimbal -- at a pitch of 90 (-90) the roll is 0 and the yaw less (plus) it, the
 * same turn (`creator-contracts` `poseOf`) -- so the piece in memory is the piece a save and a reopen give back.
 */
export function snappedTurn(t: PieceTurn): PieceTurn {
  const pitch = Math.min(PIECE_PITCH_LIMIT, Math.max(-PIECE_PITCH_LIMIT, Math.round(Number.isFinite(t.pitch) ? t.pitch : 0))) + 0;
  let yaw = signedDegrees(t.yaw), roll = signedDegrees(t.roll);
  if (Math.abs(pitch) === PIECE_PITCH_LIMIT) { yaw = signedDegrees(yaw - Math.sign(pitch) * roll); roll = 0; }
  return { yaw, pitch, roll };
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
