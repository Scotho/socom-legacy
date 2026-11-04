import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { applyLighting, colourSlotsOf, type ColourAttribute, type Lightable, type Lighting } from './lighting';

/**
 * The facade turn (issue #291, PARITY-2; research 101 A11): how the engine turns a node flagged `m_facade` (bits 8-9 of
 * its flags, `facadeOf` in `@s2u/scene`) to the camera, and which of its triangles the camera then sees.
 *
 * The draw walk (`FUN_003389c0`, D:L236080-236081) hands every node whose facade bits are set to `FUN_00317fc0`
 * (D:L216502-216595), which overwrites the rotation rows of the node's world matrix (D:L216584-216595, rows 0-2; the
 * translation is kept, so the node turns about its own origin and its own rotation and scale are dropped):
 *
 * - `d = node - camera` (`FUN_00309200` D:L216541: the node's translation row less the camera's `+0x30`, the point
 *   `FUN_00290aa0` D:L137045 measures every range from), so `d` runs from the camera to the node.
 * - **Facade 1**: `d`'s horizontal part normalised (`FUN_00309110`, which leaves a zero vector as it is), `h`; the rows
 *   are `(h.z, 0, -h.x)`, `(0, 1, 0)`, `(h.x, 0, h.z)` -- a turn about the vertical only.
 * - **Facade 2**: `d` normalised, then its horizontal part `h` as above. A first yaw (rows `(h.x, 0, -h.z)`, `(0, 1, 0)`,
 *   `(h.z, 0, h.x)`) carries `d` to `(c, s, 0)` (`FUN_00308580`): `c` its horizontal length, `s` its height. The tilt
 *   `P` (rows `(1, 0, 0)`, `(0, c, -s)`, `(0, s, c)`) times the yaw of facade 1, `Y` (`FUN_001bfc30` D:L216569 writes its
 *   second matrix argument times its first, row by row: `P x Y`), gives rows `(h.z, 0, -h.x)`, `(-s h.x, c, -s h.z)`,
 *   `(c h.x, s, c h.z)`: the third row is the unit vector from the camera to the node.
 * - Any other value (3 does not occur on the disc) returns before writing: no turn.
 *
 * Ghidra drops `FUN_00309110`'s arguments at D:L216546, :216549 and :216578; which vector each call normalises is read
 * off the stack layout the following lines consume (`uStack_10`/`fStack_8` is `d`, `uStack_20`/`fStack_18` its
 * horizontal part, the `& 0xffffffff` zeroing the height). The disc's 34 maps agree: of their 332 culled facade visuals
 * (502 in all), the 281 that are drawn to be seen -- glows, flares, the moon, the stars, the tree cards -- are wound to
 * face -z, back at the camera, and the 51 wound to face +z are the 50 `null_xmas.bmp` ones and M82's world-model
 * `g4445` (a world-model node, which the port does not turn yet: LATER 112).
 *
 * So the camera is always on the node's local -z side. A visual whose `vparams` bit 3 is set gets VU1's cull command
 * (`FUN_003b5f20` D:L307850), which keeps a triangle when the eye is on the side its right-handed normal points to
 * (the port's convention, `./world`'s `materialFor`): from a camera farther from the node than the quad reaches, a facade
 * quad wound to face -z shows, one wound to face +z does not, and a quad in a plane holding the third row is edge-on to
 * the camera and has no area on screen. That is how the console hides Desert Glory's checker cross under the garage's
 * light (`lightbulb`, `N002_I000_V01`, within 10 units of its bulb) and Bitter Jungle's 49 checker cards on its far
 * trees (two 10-unit triangles at the corners of each tree's box, their centroids 117 to 364 units from the node, in
 * planes 78 to 203 units out along local z: from a camera nearer than a corner's plane, a corner on the camera's side
 * can face it, in the console as here).
 *
 * Reading, pending review.
 */

type Vec = readonly number[] | ArrayLike<number>;

/** `FUN_00309110`: the vector normalised in place, a zero vector left as it is. */
function normalise(v: [number, number, number]): [number, number, number] {
  const length = Math.sqrt(v[2] * v[2] + v[0] * v[0] + v[1] * v[1]);
  if (length !== 0) { v[0] /= length; v[1] /= length; v[2] /= length; }
  return v;
}

/**
 * The three rotation rows `FUN_00317fc0` writes for a node of `facade` at `origin` seen from `eye` (world space), row
 * after row, row-vector convention (a point is `x * row0 + y * row1 + z * row2 + origin`), or null when the facade value
 * turns nothing (0, 3). A camera straight above or below the node leaves rows that collapse it (`facadeCollapsed`).
 */
export function facadeRows(facade: number, origin: Vec, eye: Vec): Float32Array | null {
  if (facade !== 1 && facade !== 2) return null;
  const d = normalise([origin[0]! - eye[0]!, origin[1]! - eye[1]!, origin[2]! - eye[2]!]);   // FUN_00309200, D:L216541
  const h = normalise([d[0], 0, d[2]]);
  if (facade === 1) return Float32Array.from([h[2], 0, -h[0], 0, 1, 0, h[0], 0, h[2]]);
  // The first yaw carries d to (c, s, 0): FUN_00308580 over rows (h.x, 0, -h.z), (0, 1, 0), (h.z, 0, h.x).
  const c = d[0] * h[0] + d[2] * h[2];
  const s = d[1];
  // P x Y (FUN_001bfc30, D:L216569).
  return Float32Array.from([h[2], 0, -h[0], -s * h[0], c, -s * h[2], c * h[0], s, c * h[2]]);
}

/** Whether the rows have collapsed the node to a line (a camera straight above or below it): nothing of it is drawn. */
export function facadeCollapsed(rows: ArrayLike<number>): boolean {
  const det = rows[0]! * (rows[4]! * rows[8]! - rows[5]! * rows[7]!)
    - rows[1]! * (rows[3]! * rows[8]! - rows[5]! * rows[6]!)
    + rows[2]! * (rows[3]! * rows[7]! - rows[4]! * rows[6]!);
  return Math.abs(det) < 1e-6;
}

/** How near the camera may be to a triangle's plane, relative to the two lengths, for the triangle to count edge-on. */
const EDGE_ON = 1e-5;

/**
 * How many triangles of a visual the camera at `eye` sees once `rows` (`facadeRows`) turn it about `origin`: with
 * `cull` (`vparams` bit 3), those whose right-handed normal in index order has the eye on its side; without, every
 * triangle; in both, none whose plane holds the eye (edge-on: no area on screen) and none degenerate. Positions are the
 * visual's own, model space.
 */
export function facadeTrianglesShown(positions: ArrayLike<number>, indices: ArrayLike<number>, rows: ArrayLike<number>,
  origin: Vec, eye: Vec, cull: boolean): number {
  const at = (i: number): [number, number, number] => {
    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    return [
      x * rows[0]! + y * rows[3]! + z * rows[6]! + origin[0]!,
      x * rows[1]! + y * rows[4]! + z * rows[7]! + origin[1]!,
      x * rows[2]! + y * rows[5]! + z * rows[8]! + origin[2]!,
    ];
  };
  let shown = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = at(indices[t]!), b = at(indices[t + 1]!), c = at(indices[t + 2]!);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const ex = eye[0]! - a[0], ey = eye[1]! - a[1], ez = eye[2]! - a[2];
    const scale = Math.hypot(nx, ny, nz) * Math.hypot(ex, ey, ez);
    if (scale === 0) continue;
    const side = nx * ex + ny * ey + nz * ez;
    if (Math.abs(side) <= EDGE_ON * scale) continue;
    if (!cull || side > 0) shown++;
  }
  return shown;
}

const turn = new Matrix4();

/**
 * Turns `object` -- a facade placement drawn as its own mesh, its geometry in the node's model space and its position
 * the node's origin -- as `FUN_00317fc0` turns the node for a camera at `eye` (both in the object's parent's frame): its
 * rotation from `facadeRows`, its scale 1, or 0 when the rows collapse it. A facade value that turns nothing (0, 3)
 * leaves the object as it is. The engine's rows are three.js's `elements` as they stand (`toColumnMajor`, `@s2u/scene`).
 */
export function turnFacade(object: Pick<Object3D, 'quaternion' | 'scale'>, facade: number, origin: Vec, eye: Vec): void {
  const rows = facadeRows(facade, origin, eye);
  if (!rows) return;
  if (facadeCollapsed(rows)) {
    object.scale.setScalar(0);
    return;
  }
  turn.set(
    rows[0]!, rows[3]!, rows[6]!, 0,
    rows[1]!, rows[4]!, rows[7]!, 0,
    rows[2]!, rows[5]!, rows[8]!, 0,
    0, 0, 0, 1,
  );
  object.quaternion.setFromRotationMatrix(turn);
  object.scale.setScalar(1);
}

const keyAt = new Vector3();

/**
 * LATER 113 (FACADES-2): the point the engine's alpha pass keys a facade visual by, in `object`'s parent's frame, into
 * `out`. `FUN_003371b0` copies the matrix the visual is drawn with (D:L235289) and carries the visual's centroid
 * (`vparams` +0xc, `LoadedMesh.centre`, model space) through it (D:L235314), keying the entry by the range from the camera
 * to that point (D:L235316-235317); for a facade node that matrix is the turned one (`FUN_003389c0` D:L236081), so the
 * point moves as the node turns, and the list is built anew each frame. `object` is the facade's mesh as `turnFacade`
 * (or the pose on disc) left it: the centroid through its scale, its rotation and its position.
 */
export function facadeAlphaKey(out: [number, number, number], centroid: Vec, object: Pick<Object3D, 'position' | 'quaternion' | 'scale'>): void {
  keyAt.set(centroid[0]!, centroid[1]!, centroid[2]!).multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
  out[0] = keyAt.x; out[1] = keyAt.y; out[2] = keyAt.z;
}

const relightTurn = new Matrix4();

/**
 * LATER 114 (FACADES-2): a facade part's vertex lighting under its model-space normals turned by `quaternion` (its mesh's
 * turn), into `out` (rgba, as `applyLighting` writes it); `normals` is the caller's scratch, the part's length. The engine
 * lights a node through the matrix it draws it with: `FUN_003b6d10` keeps that matrix and its inverse (D:L308338-308339,
 * `FUN_00308160`) and `FUN_003b6870` carries the light block through them (D:L308207-308208) -- for a facade node the
 * turned matrix (`FUN_003389c0` D:L236081, and the alpha pass's copy of it, D:L235289 -> D:L235165) -- so a lit facade is
 * lit as its normals face once turned, each frame, not as they faced in the pose on disc.
 */
export function relightFacade(part: Lightable, quaternion: Quaternion, light: Lighting, normals: Float32Array, out: Float32Array, stride = 4, offset = 0): void {
  const n = part.normals;
  if (!n) {
    applyLighting(part, light, out, stride, offset);
    return;
  }
  const e = relightTurn.makeRotationFromQuaternion(quaternion).elements;   // column-major
  for (let i = 0; i < n.length; i += 3) {
    const x = n[i]!, y = n[i + 1]!, z = n[i + 2]!;
    normals[i] = x * e[0]! + y * e[4]! + z * e[8]!;
    normals[i + 1] = x * e[1]! + y * e[5]! + z * e[9]!;
    normals[i + 2] = x * e[2]! + y * e[6]! + z * e[10]!;
  }
  applyLighting({ colors: part.colors, normals, lit: part.lit }, light, out, stride, offset);
}

/**
 * LATER 114's re-light for one facade part, with its cost guard (FACADES-2). `update` lights the part under the turn it is
 * given (`relightFacade`) into its colour attribute and marks it for upload -- but only when the turn differs from the one
 * it was last lit under, or the lighting's stamp does (the caller bumps it whenever the lighting the part reads changes:
 * the rig, `rigEverywhere`), or after `invalidate` (the pose put back, the turn resumed). A guard on cost alone, with no
 * visible change: a part whose turn and lighting are what they were is already lit as `relightFacade` would light it, so a
 * card that does not turn is never left lit by stale light, and one that does is lit every frame it turns. A part the
 * engine does not light (`lit` false, `rigEverywhere` off) is left as the lighting's own bake leaves it.
 */
export class FacadeRelight {
  private readonly normals: Float32Array;
  private readonly lastTurn = new Quaternion();
  private lastStamp: number | null = null;

  constructor(readonly part: Lightable & { normals: Float32Array }, readonly attribute: ColourAttribute & { needsUpdate: boolean }) {
    this.normals = new Float32Array(part.normals.length);
  }

  /** Re-lights under `turn` when the turn or `stamp` changed since the last; true when it did. */
  update(turn: Quaternion, light: Lighting, stamp: number): boolean {
    if (!this.part.lit && !light.rigEverywhere) return false;
    if (this.lastStamp === stamp && this.lastTurn.equals(turn)) return false;
    const slots = colourSlotsOf(this.attribute);   // CPS H12: a world draw's colour is an interleaved buffer's slots
    relightFacade(this.part, turn, light, this.normals, slots.array, slots.stride, slots.offset);
    this.attribute.needsUpdate = true;
    this.lastTurn.copy(turn);
    this.lastStamp = stamp;
    return true;
  }

  /** The next `update` re-lights whatever it is given. */
  invalidate(): void {
    this.lastStamp = null;
  }
}
