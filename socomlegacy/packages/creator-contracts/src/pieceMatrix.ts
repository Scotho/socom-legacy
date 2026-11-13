/**
 * FX-2 (the Forge export sprint): WHAT A FORGE PIECE'S MATRIX MAY BE. A browser adaptation with no original -- the
 * forge is the project's own sandbox, and the game places no player-made piece -- so none of these numbers is the
 * game's; nothing of a standard match reads them. The owner's default range is H442 (b) in
 * `socomlegacy/docs/HUMAN_TASKS.md`: 0.1 to 4 an axis, the cap central already held (`central/src/forgeLobby.ts`).
 *
 * A piece's matrix (column-major, three's `Matrix4.elements`, `Piece.m`) is admitted only as a translation times a
 * rotation times a positive scale an axis -- what the editor's gizmo composes (`Object3D.matrix` from a position, a
 * quaternion and a scale) and what `layoutOfRecord` writes for a yaw piece. Anything else -- a shear, a mirror, a
 * projective term, an axis scaled to nothing -- would reach the server's map as a hull no editor makes: a polygon
 * flattened to no area, a frame with no inverse. One reader, shared by the lobby's create (central `layoutWithinBounds`)
 * and anything else that admits a piece.
 */

/** The least length of a piece's axis column (H442 (b)'s default). */
export const PIECE_SCALE_MIN_ADAPTATION = 0.1;
/** The greatest length of a piece's axis column (H442 (b)'s default; central's `FORGE_PIECE_SCALE_MAX` is this). */
export const PIECE_SCALE_MAX_ADAPTATION = 4;
/**
 * How far from perpendicular two axis columns may be: the absolute cosine of the angle between them (their dot product
 * over the product of their lengths), so the test does not depend on the scale. 1e-3 is about 0.06 degrees: wide of a
 * rotation stored in single precision (errors near 1e-7), narrow of any shear a person would see.
 */
export const PIECE_ORTHO_TOLERANCE_ADAPTATION = 1e-3;
/** The relative slack on the scale range, so an axis of exactly 0.1 or 4 passes after a turn's rounding. */
export const PIECE_SCALE_EPSILON_ADAPTATION = 1e-6;

/** What a caller may narrow or widen: the scale range and the perpendicular tolerance. */
export interface PieceMatrixOptions {
  scaleMin?: number;
  scaleMax?: number;
  orthoTolerance?: number;
}

const AXES = ["x", "y", "z"] as const;

/**
 * Why `m` is not a piece's matrix, or null when it is a translation times a rotation times a positive scale an axis
 * within the range: 16 finite numbers; the bottom row exactly 0, 0, 0, 1 (column-major: entries 3, 7 and 11 are 0, 15
 * is 1); each axis column's length within `scaleMin`..`scaleMax` (`PIECE_SCALE_EPSILON_ADAPTATION` of slack); the three
 * columns mutually perpendicular within `orthoTolerance`; the 3x3's determinant above 0 (no mirror).
 */
export function pieceMatrixError(m: readonly number[], opts: PieceMatrixOptions = {}): string | null {
  const min = opts.scaleMin ?? PIECE_SCALE_MIN_ADAPTATION;
  const max = opts.scaleMax ?? PIECE_SCALE_MAX_ADAPTATION;
  const tolerance = opts.orthoTolerance ?? PIECE_ORTHO_TOLERANCE_ADAPTATION;
  if (m.length !== 16) return `the matrix has ${m.length} numbers, not 16`;
  for (let i = 0; i < 16; i++) if (!Number.isFinite(m[i])) return `entry ${i} is not a finite number`;
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) return "the bottom row is not 0, 0, 0, 1";
  const cols = [0, 4, 8].map((c) => [m[c]!, m[c + 1]!, m[c + 2]!] as const);
  const lengths = cols.map(([x, y, z]) => Math.hypot(x, y, z));
  for (const [k, length] of lengths.entries()) {
    if (!(length >= min * (1 - PIECE_SCALE_EPSILON_ADAPTATION))) return `the ${AXES[k]} axis scale ${length} is under ${min}`;
    if (length > max * (1 + PIECE_SCALE_EPSILON_ADAPTATION)) return `the ${AXES[k]} axis scale ${length} is over ${max}`;
  }
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
    const [ax, ay, az] = cols[a]!, [bx, by, bz] = cols[b]!;
    const cosine = Math.abs(ax * bx + ay * by + az * bz) / (lengths[a]! * lengths[b]!);
    if (!(cosine <= tolerance)) return `the ${AXES[a]} and ${AXES[b]} axes are not perpendicular (a shear)`;
  }
  // X . (Y x Z), the columns X, Y and Z.
  const [xx, xy, xz] = cols[0]!, [yx, yy, yz] = cols[1]!, [zx, zy, zz] = cols[2]!;
  const det = xx * (yy * zz - yz * zy) + xy * (yz * zx - yx * zz) + xz * (yx * zy - yy * zx);
  if (!(det > 0)) return "the piece is mirrored (a negative determinant)";
  return null;
}
