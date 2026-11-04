import { Mesh, Sphere, type Frustum, type FrustumArray, type Matrix4, type SkinnedMesh } from 'three';

/**
 * CPS H9, the body cull (plan 2026-11-02-client-performance-sprint, Log 2026-11-03T01:19Z part (1)): a bound for a
 * skinned sub-mesh that follows the pose, so three's frustum test can drop a body's sub-mesh wholly out of view. A
 * CPU-side browser adaptation: it changes which draws are submitted, never a pixel -- a sub-mesh with a vertex in view
 * is never culled -- and the bones are posed every frame as before (CPS.R9 (e): an undrawn body's bones feed sounds,
 * tracers and name tags).
 *
 * **What three draws.** three r186's `getSkinnedPosition` (`nodes/accessors/Skinning.js:103-121`): the vertex as
 * `vec4(p, 1)` (`NodeBuilder.format`'s vec3-to-vec4) through `bindMatrix`, then `sum_b w_b (B_b Inv_b) . that`, `B_b`
 * the bone's world matrix and `Inv_b` its `boneInverses` entry (`objects/Skeleton.js` `update`), then
 * `bindMatrixInverse . sum` and its `.xyz` (no divide by w), then `matrixWorld`. Write `u_b = Inv_b . bindMatrix .
 * (p, 1)`, a 4-vector: `boneInverses` come from `invert()` and their last row is 1 only to rounding (the disc's SEAL:
 * `e[15]` = 0.9999999999999998), so `u_b.w` is carried, not assumed.
 *
 * **Why it holds for any pose.** With `B_b` affine (checked at each test: three composes bone matrices), the xyz of
 * `B_b u_b` is `L_b u_b.xyz + t_b u_b.w`: within `||L_b|| r_b + |t_b| d_b` of the bone's world position `t_b`, where,
 * once per sub-mesh, `r_b` = the largest `|u_b.xyz|` and `d_b` = the largest `|u_b.w - 1|` over the vertices bone b
 * weighs. The weights are positive and sum to one within `tol` (checked per vertex at the install; `@s2u/mesh`
 * `topInfluences` writes them so), so the weighted sum lies within `(1 + tol) R + tol |c|` of the centre `c` of any
 * sphere (c, R) holding every bone's ball -- a convex combination of points in the balls lies in their convex hull, so
 * in the sphere (the union of the balls alone would not do). The `.xyz` of `bindMatrixInverse . (S, W)` is then within
 * `||L_bmi||` times that, plus `|t_bmi| w` for the vertex's `W = sum_b w_b u_b.w` off one by at most `w` (made at the
 * install), of `L_bmi c + t_bmi`. `||L||` is bounded by Gershgorin on `L^T L` (`linearNormBound`): exact for a matrix
 * whose columns are orthogonal (rotation and scale), an upper bound with shear -- no bone's scale is assumed.
 *
 * **Where it is made.** The renderer's projection (`Renderer._projectObject`, three r186 `renderers/common/Renderer.js`
 * :3294) calls `object.intersectsFrustum(frustum)` per mesh per render, after the scene's world matrices are updated
 * (`:961`), only for a visible mesh on the pass's camera layers. `Mesh.intersectsFrustum` is
 * `frustum.intersectsObject(this)`, which reads the object's own `boundingSphere` when it has one
 * (`math/Frustum.js:148-152`) through `matrixWorld` (`Sphere.applyMatrix4`: the centre, and the radius times
 * `getMaxScaleOnAxis`). The override makes the sphere there, from the matrices that render draws with, for whichever
 * camera the pass has (the world's, the character shadow's). The geometry's own sphere is untouched: it is the depth
 * sort's key (`Renderer.js:3298-3305`). three's sphere test culls only a sphere wholly behind a plane
 * (`Frustum.intersectsSphere`, `distance < -radius`): one that touches the frustum is drawn.
 */

/**
 * The margin for float rounding (the GPU skins in float32; the bound is made in double): the radius grows by
 * `relative x (radius + the centre's largest coordinate) + absolute` world units; a vertex whose weights sum to one no
 * closer than `weightSum` is not covered (its mesh is left unculled). At a map's 3000 units: 0.03 units on a 19-unit
 * SEAL, against a float32 step of 2.4e-4 there. A browser adaptation's own value; no original behind it.
 */
export const BODY_CULL_MARGIN = { relative: 1e-5, absolute: 1e-3, weightSum: 1e-6 } as const;

/** Per skinned sub-mesh, made once: the bones its vertices weigh, each one's reach `r_b` and w-drift `d_b`, and `tol`, `w`. */
export interface BoneReach {
  readonly bones: Uint16Array;
  readonly reach: Float64Array;
  readonly drift: Float64Array;
  /** The largest `|sum of a vertex's weights - 1|`. */
  readonly weightSlack: number;
  /** The largest `|sum_b w_b u_b.w - 1|`: how far a skinned vertex's w is from one. */
  readonly wSlack: number;
}

const affine = (m: Matrix4): boolean => {
  const e = m.elements;
  return e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1;
};

/** An upper bound on the operator norm of `m`'s linear part: Gershgorin's row sums of `L^T L`, the square root. */
export function linearNormBound(m: Matrix4): number {
  const e = m.elements;
  const a0 = e[0]!, a1 = e[1]!, a2 = e[2]!, b0 = e[4]!, b1 = e[5]!, b2 = e[6]!, c0 = e[8]!, c1 = e[9]!, c2 = e[10]!;
  const aa = a0 * a0 + a1 * a1 + a2 * a2, bb = b0 * b0 + b1 * b1 + b2 * b2, cc = c0 * c0 + c1 * c1 + c2 * c2;
  const ab = Math.abs(a0 * b0 + a1 * b1 + a2 * b2), ac = Math.abs(a0 * c0 + a1 * c1 + a2 * c2), bc = Math.abs(b0 * c0 + b1 * c1 + b2 * c2);
  return Math.sqrt(Math.max(aa + ab + ac, bb + ab + bc, cc + ac + bc));
}

/**
 * The reach of each bone over the mesh's vertices, or null when the mesh is outside what the bound covers: morph
 * targets, a missing skin attribute, a negative or non-finite weight, a vertex whose weights do not sum to one within
 * `BODY_CULL_MARGIN.weightSum`, a non-finite product, or a weighed bone the skeleton lacks.
 */
export function boneReach(mesh: SkinnedMesh): BoneReach | null {
  const g = mesh.geometry;
  if (g.morphAttributes['position'] !== undefined) return null;
  const pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  if (!pos || !si || !sw || si.itemSize !== 4 || sw.itemSize !== 4) return null;
  const inverses = mesh.skeleton.boneInverses, bones = mesh.skeleton.bones;
  const reach = new Float64Array(inverses.length).fill(-1), drift = new Float64Array(inverses.length);
  let weightSlack = 0, wSlack = 0;
  const k = mesh.bindMatrix.elements;
  for (let v = 0, n = pos.count; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    // bindMatrix . (x, y, z, 1), all four rows
    const bx = k[0]! * x + k[4]! * y + k[8]! * z + k[12]!, by = k[1]! * x + k[5]! * y + k[9]! * z + k[13]!;
    const bz = k[2]! * x + k[6]! * y + k[10]! * z + k[14]!, bw = k[3]! * x + k[7]! * y + k[11]! * z + k[15]!;
    let sum = 0, wSum = 0;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(v, c);
      if (!(w >= 0) || !Number.isFinite(w)) return null;
      if (w === 0) continue;
      const b = si.getComponent(v, c);
      const inv = inverses[b];
      if (inv === undefined || bones[b] === undefined) return null;
      const e = inv.elements;
      const ux = e[0]! * bx + e[4]! * by + e[8]! * bz + e[12]! * bw, uy = e[1]! * bx + e[5]! * by + e[9]! * bz + e[13]! * bw;
      const uz = e[2]! * bx + e[6]! * by + e[10]! * bz + e[14]! * bw, uw = e[3]! * bx + e[7]! * by + e[11]! * bz + e[15]! * bw;
      const r = Math.sqrt(ux * ux + uy * uy + uz * uz), d = Math.abs(uw - 1);
      if (!Number.isFinite(r) || !Number.isFinite(d)) return null;
      if (r > reach[b]!) reach[b] = r;
      if (d > drift[b]!) drift[b] = d;
      sum += w;
      wSum += w * uw;
    }
    const slack = Math.abs(sum - 1);
    if (!(slack <= BODY_CULL_MARGIN.weightSum)) return null;
    if (slack > weightSlack) weightSlack = slack;
    const ws = Math.abs(wSum - 1);
    if (ws > wSlack) wSlack = ws;
  }
  const used: number[] = [];
  reach.forEach((r, b) => { if (r >= 0) used.push(b); });
  if (used.length === 0) return null;
  return {
    bones: Uint16Array.from(used), reach: Float64Array.from(used, (b) => reach[b]!), drift: Float64Array.from(used, (b) => drift[b]!),
    weightSlack, wSlack,
  };
}

/**
 * The sphere, in the mesh's own frame, that three's test carries through `matrixWorld` onto one holding every vertex
 * the mesh draws with the bones' current world matrices. `balls` is scratch, four numbers a bone. A matrix outside
 * what the bound covers (a bone or the mesh not affine, a degenerate scale) gives an infinite radius: never culled.
 */
export function skinnedBound(mesh: SkinnedMesh, reach: BoneReach, target: Sphere, balls: Float64Array): Sphere {
  const bones = mesh.skeleton.bones;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let ok = affine(mesh.matrixWorld);
  for (let i = 0, n = reach.bones.length; i < n; i++) {
    const m = bones[reach.bones[i]!]!.matrixWorld, e = m.elements;
    if (!affine(m)) ok = false;
    const x = e[12]!, y = e[13]!, z = e[14]!;
    const r = linearNormBound(m) * reach.reach[i]! + Math.sqrt(x * x + y * y + z * z) * reach.drift[i]!;
    balls[i * 4] = x; balls[i * 4 + 1] = y; balls[i * 4 + 2] = z; balls[i * 4 + 3] = r;
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r);
    minZ = Math.min(minZ, z - r); maxZ = Math.max(maxZ, z + r);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  let radius = 0;
  for (let i = 0, n = reach.bones.length; i < n; i++) {
    const dx = balls[i * 4]! - cx, dy = balls[i * 4 + 1]! - cy, dz = balls[i * 4 + 2]! - cz;
    radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz) + balls[i * 4 + 3]!);
  }
  const c = Math.sqrt(cx * cx + cy * cy + cz * cz);
  radius = (1 + reach.weightSlack) * radius + reach.weightSlack * c;                    // the weights' sum off one
  radius += BODY_CULL_MARGIN.relative * (radius + Math.max(Math.abs(cx), Math.abs(cy), Math.abs(cz))) + BODY_CULL_MARGIN.absolute;
  // Into the mesh's frame as the shader does it: `.xyz` of `bindMatrixInverse . (S, W)`, its last row unused.
  const b = mesh.bindMatrixInverse.elements;
  const tx = b[12]!, ty = b[13]!, tz = b[14]!;
  target.center.set(
    b[0]! * cx + b[4]! * cy + b[8]! * cz + tx, b[1]! * cx + b[5]! * cy + b[9]! * cz + ty, b[2]! * cx + b[6]! * cy + b[10]! * cz + tz,
  );
  const local = linearNormBound(mesh.bindMatrixInverse) * radius + Math.sqrt(tx * tx + ty * ty + tz * tz) * reach.wSlack;
  // three takes the centre through `matrixWorld` and the radius times `getMaxScaleOnAxis`, which is the norm for a
  // matrix without shear and may fall short of it with one: the ratio covers either.
  const scale = mesh.matrixWorld.getMaxScaleOnAxis();
  target.radius = ok && scale > 0 ? (local * linearNormBound(mesh.matrixWorld)) / scale : Infinity;
  if (!(target.radius < Infinity) || !Number.isFinite(target.center.x + target.center.y + target.center.z)) {
    target.center.set(0, 0, 0);
    target.radius = Infinity;                                                        // never culled
  }
  return target;
}

/**
 * Turns the cull on for one skinned sub-mesh: its own `boundingSphere`, made at each frustum test, and
 * `frustumCulled`. A mesh `boneReach` does not cover stays unculled (`frustumCulled` false), as every body was before.
 * Returns whether the cull is on.
 */
export function cullByBones(mesh: SkinnedMesh): boolean {
  const reach = boneReach(mesh);
  if (reach === null) { mesh.frustumCulled = false; return false; }
  const sphere = new Sphere();
  const balls = new Float64Array(reach.bones.length * 4);
  const update = (): void => { mesh.boundingSphere = skinnedBound(mesh, reach, sphere, balls); };
  mesh.intersectsFrustum = (frustum: Frustum | FrustumArray): boolean => {
    update();
    return Mesh.prototype.intersectsFrustum.call(mesh, frustum);
  };
  update();                                        // never null: three would CPU-skin the mesh for a direct read
  mesh.frustumCulled = true;
  return true;
}
