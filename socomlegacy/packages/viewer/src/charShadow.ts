import {
  Box3, Color, Matrix4, Mesh, NearestFilter, Object3D, OrthographicCamera, RenderTarget, Scene, Vector3, Vector4, type BufferAttribute,
  type BufferGeometry, type Camera, type ColorRepresentation, type InterleavedBufferAttribute, type Material, type SkinnedMesh,
  type Texture,
} from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import {
  float, normalWorld, positionWorld, renderGroup, select, texture as textureNode, uniform, vec2, vec4,
} from 'three/tsl';

/**
 * The characters' shadow as the engine draws it: a render map, not a blob (socomlegacy/docs/research/82, round 4).
 *
 * **Who casts one.** Only the node flagged at `+0xa1` bit 5, and one place sets it: the character spawn (`FUN_00599f00`),
 * when the shadows are on (`DAT_003df138`), the character answers its controller's `+0x2c` query, and the world has no
 * map yet (`+0x56c == 0`) -- the first such character, the local player. Grenades, claymores and the other SEALs cast
 * none.
 *
 * **The map.** `CWorld::AddChild` (`FUN_0031f240`) gives every child flagged for a shadow a `CRenderMap`
 * (`FUN_0031a9a0`, 0x2e0 bytes) drawing into one of the world's four 256x256 targets `ShadowX_%d` (made at the world's
 * init, `FUN_003553a0`). Each frame the map's update (`FUN_0031a180`) takes the actor's bounds, puts its camera at their
 * centre looking down the world root's `ShadowVector` (a look-at on the basis the constructor built from it), sets the
 * far range to 1.5x the bounds' largest side (30 in the constructor, near 1), and fits an orthographic frustum to the
 * eight corners projected into the light's frame, a texel of margin each side (`size - 2`). The actor is drawn into it
 * with VU1 `0x40`: its own triangles, untextured and unfogged (research 15 §3) -- a silhouette, alpha where it covers.
 *
 * **The projection** (VU1 `0x3c`/`0x3e`, disassembled at `0x2b80`; the block `FUN_003b5730` builds per map, 14 qwords):
 * over every visual whose `vparams` carry bit 15, a second pass whose ST is the vertex through the map's matrix (an
 * orthographic projection: the ST is multiplied by the vertex's own Q, so the GS's divide leaves it affine), whose
 * colour is the map's (+0xd8..0xe0; zero) and whose alpha is
 *
 *   `a = W * clamp(dot(-D, N)) * clamp(dot(P - v, N)) * clamp((far - dot(P - v, N)) / (far - near))`
 *
 * with `W` = `ShadowWeight * 255` (0.25 when the root names none -- none of the 22 does -- the world's constructor
 * default at `+0x680`), `D` the shadow vector, `P` the map's camera (the actor's centre) and `N` the surface's normal:
 * a surface facing the light, under the actor, fading out as it lies further below. Modulated by the map's texel and
 * blended source-alpha, black over what is there: the receiver darkens by `a * coverage`, at most 0.5 of it.
 *
 * The viewer renders the SEAL -- the body, its gear and the rifle in its hand -- on a layer of its own into a
 * `RenderTarget` of the same size, and puts the darkening in the world's shading graph (`shadowFactor`) rather than as
 * a second draw of every visual; on an opaque surface the two are the same, `Cd * (1 - a)`.
 */

/**
 * What `CharacterShadow.update` draws the map through: three's renderer, its render targets and clear colour (PAR-6).
 * `./renderer`'s `WebGPURenderer` has all of it (WebGPU or its WebGL2 backend); the match's contract carries it as an
 * optional capability (`./matchRenderer` `shadowRendererOf`).
 */
export interface ShadowRenderer {
  getRenderTarget(): RenderTarget | null;
  setRenderTarget(target: RenderTarget | null): void;
  getClearColor(target: Color): Color;
  getClearAlpha(): number;
  setClearColor(color: ColorRepresentation, alpha?: number): void;
  clear(): void;
  render(scene: Scene, camera: Camera): unknown;
}

/** The layer the shadow camera sees: the SEAL's meshes are put on it, and nothing else is. */
export const SHADOW_LAYER = 7;
/** `ShadowX_%d`: 256 by 256 (`FUN_00320310`'s `FUN_003553a0(..., 0x100, 0x100, 2)`). */
export const SHADOW_MAP_SIZE = 256;
/** `CWorld`'s constructor default at `+0x680`, the weight when the root names no `ShadowWeight` (no map does). */
export const SHADOW_WEIGHT = 0.25;
/** The map camera's near plane (`+0xc8`, 1.0 in `FUN_0031a9a0`). */
const NEAR = 1;
/** The GS's unity: `ShadowWeight * 255` is the alpha in 0..128 terms. */
const UNITY = 128;

/**
 * The uniforms every receiver's shading reads (`shadowFactor`), shared by all the world's materials. In three's render
 * group, not the per-object default: CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across
 * ~550 draws; a render-group uniform is compared once a render. A browser adaptation on the CPU side only -- the same
 * values through the same arithmetic; `update` sets them before the shadow map's render, and the main render that
 * follows compares them again.
 */
const toLight = uniform(new Matrix4()).setName('shadowToLight').setGroup(renderGroup);
const centre = uniform(new Vector3()).setName('shadowCentre').setGroup(renderGroup);
// -D: the direction a lit surface faces.
const toward = uniform(new Vector3(0, 1, 0)).setName('shadowToward').setGroup(renderGroup);
const far = uniform(30).setName('shadowFar').setGroup(renderGroup);
// W * 255 / 128, and 0 while there is no shadow to draw.
const strength = uniform(0).setName('shadowStrength').setGroup(renderGroup);
/** The map itself, one for the page: the world's graphs sample it, `CharacterShadow` draws into it. */
const target = new RenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, { samples: 0, depthBuffer: true });
target.texture.minFilter = NearestFilter;
target.texture.magFilter = NearestFilter;

/**
 * VS-5 (VS.R5; the video settings design §4.2, §7): the Shadows row's tiers -- a browser adaptation over the original's
 * one shadow, which has no tiers (one 256x256 map, `SHADOW_MAP_SIZE`, unchanged). Each tier scales the map's side; Medium
 * is the original's map and today's draw exactly. Who casts (the local player only, the header), the formula and the
 * receivers are the same under every tier: a tier only sharpens or softens the one shadow. Off is the page's switch
 * (`./matchMount`: the pass skipped and the world's decals hidden, as before), not a tier here.
 */
export type ShadowTier = 'low' | 'medium' | 'high';
/** VS-5, an adaptation (no original): Low's map is half the original's side, 128. */
export const SHADOW_MAP_SCALE_LOW_ADAPTATION = 0.5;
/** VS-5, an adaptation (no original): High's map is twice the original's side, 512. */
export const SHADOW_MAP_SCALE_HIGH_ADAPTATION = 2;
/**
 * VS-5, an adaptation (no original: the GS samples the map once a pixel): High's soft edge, a 2x2 percentage-closer
 * tap -- the coverage averaged over the four texels half a texel each way. Medium and Low take the single nearest tap.
 */
export const SHADOW_SOFT_TAPS_ADAPTATION = 4;
const TIER_SCALE: Readonly<Record<ShadowTier, number>> = { low: SHADOW_MAP_SCALE_LOW_ADAPTATION, medium: 1, high: SHADOW_MAP_SCALE_HIGH_ADAPTATION };
/** A tier's map side: `SHADOW_MAP_SIZE` times its scale (Medium: the original's 256). */
export function shadowMapSize(tier: ShadowTier): number { return SHADOW_MAP_SIZE * TIER_SCALE[tier]; }
/** The map's current side and tier (Medium until `setShadowTier` is told another). */
let mapSize = SHADOW_MAP_SIZE;
let mapTier: ShadowTier = 'medium';
/** 1 / the map's side, for High's taps (read by High's graph alone). */
const texel = uniform(1 / SHADOW_MAP_SIZE).setName('shadowTexel').setGroup(renderGroup);
/**
 * Whether High's soft taps are taken. VS-12: a graph of their own (`shadowFactor(map, true)`), swapped in by the world
 * (`onShadowSoftChange`) -- never a uniform-guarded branch in the default graph, which Medium's shader would then carry
 * (CPS.R7: at Balanced's defaults the game draws what it drew, `test/experimentalOriginal.test.ts`'s pinned source).
 */
let soft = false;
const softHeard = new Set<() => void>();
/** Called when High's taps come or go (a tier to or from High); the returned function stops it. */
export function onShadowSoftChange(changed: () => void): () => void {
  softHeard.add(changed);
  return () => { softHeard.delete(changed); };
}
/** The corners' reach, `(size - 2) / size`: a texel of margin each side at the map's current size (254/256 at Medium). */
export function shadowMapMargin(): number { return (mapSize - 2) / mapSize; }
/** The soft taps taken: `SHADOW_SOFT_TAPS_ADAPTATION` under High, 0 (today's single tap) otherwise. */
export function shadowSoftTaps(): number { return soft ? SHADOW_SOFT_TAPS_ADAPTATION : 0; }
/**
 * The page's map at a tier: the render target resized (three's `setSize` disposes its GPU side, remade at the next draw at
 * the new size; the same `Texture` object, so the world's graphs keep sampling it), the margin and the taps with it. The
 * map is redrawn by the next frame (no shadow's last draw stands). The same tier changes nothing.
 */
function setShadowTier(tier: ShadowTier): void {
  if (tier === mapTier) return;
  mapTier = tier;
  mapSize = shadowMapSize(tier);
  target.setSize(mapSize, mapSize);
  texel.value = 1 / mapSize;
  drawnBy = null;
  const nextSoft = tier === 'high';
  if (nextSoft !== soft) { soft = nextSoft; for (const changed of [...softHeard]) changed(); }
}

/**
 * The receiver's darkening, 0..1, for the world's graph: `a * coverage` of the header's formula. The normal is the
 * surface's own where the draw carries one and the flat triangle's otherwise (three derives it for a geometry with no
 * normal lane), as the VU reads each vertex's.
 */
export function shadowFactor(map: Texture = target.texture, softTaps: boolean = soft): Node<'float'> {
  const light = toLight.mul(vec4(positionWorld, 1));
  // A render target's texel rows run top-down in three's node textures (WebGPU's convention, kept by the WebGL2 backend).
  const uv = vec2(light.x.mul(0.5).add(0.5), light.y.mul(-0.5).add(0.5));
  const inside = uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1));
  // VS-5: High's 2x2 tap (`SHADOW_SOFT_TAPS_ADAPTATION`), its own graph (VS-12); Medium and Low take the one nearest
  // tap, today's expression and today's shader byte for byte. The review's F1: the taps are explicit-LOD samples
  // (`level(0)`: textureLod / textureSampleLevel); the map has no mips and nearest filtering, so level 0 is the texel the
  // implicit sample reads.
  const tap = (dx: number, dy: number) => textureNode(map, uv.add(vec2(dx, dy).mul(texel))).level(float(0)).a;
  const sampled = softTaps
    ? tap(-0.5, -0.5).add(tap(0.5, -0.5)).add(tap(-0.5, 0.5)).add(tap(0.5, 0.5)).mul(1 / SHADOW_SOFT_TAPS_ADAPTATION)
    : textureNode(map, uv).a;
  const coverage = select(inside, sampled, float(0));
  const n = normalWorld;
  const facing = n.dot(toward).clamp(0, 1);
  const height = centre.sub(positionWorld).dot(n);
  const under = height.clamp(0, 1);
  const fade = far.sub(height).div(far.sub(NEAR)).clamp(0, 1);
  return strength.mul(facing).mul(under).mul(fade).mul(coverage).clamp(0, 1) as unknown as Node<'float'>;
}

/**
 * `FUN_0031a180`'s camera for one actor's bounds: at their centre looking down `direction`, the orthographic frustum
 * fitted to the eight corners in the light's frame with a texel of margin each side (the corners land within
 * `(size - 2) / size` of the edges, `size` the map's current side: VS-5's tier), the depth range +-1.5x the largest
 * side. Returns that range (the map's far).
 */
export function fitShadowCamera(cam: OrthographicCamera, box: Box3, direction: Vector3): number {
  const mid = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const range = Math.max(size.x, size.y, size.z) * 1.5;          // +0xc4: 1.5 x the largest side
  cam.position.copy(mid);
  const vertical = Math.abs(direction.y) > 0.99;
  cam.up.set(vertical ? 1 : 0, vertical ? 0 : 1, 0);
  cam.lookAt(mid.clone().add(direction));
  cam.updateMatrixWorld(true);
  const view = cam.matrixWorldInverse;
  const corner = new Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view);
    minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
  }
  const margin = mapSize / (mapSize - 2);                        // VS-5: the map's current side (256 at Medium, as before)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const hx = ((maxX - minX) / 2) * margin, hy = ((maxY - minY) / 2) * margin;
  cam.left = cx - hx; cam.right = cx + hx; cam.bottom = cy - hy; cam.top = cy + hy;
  cam.near = -range; cam.far = range;
  cam.updateProjectionMatrix();
  return range;
}

/**
 * Puts the actor's own meshes on the map's layer and takes everything else under it off: VU1 `0x40` draws the actor's
 * triangles, once. An effect light's overlay (`./effectLights`, `userData.effectLightPass`: the receiver re-drawn in the
 * light's pass, hung beside it) is not the actor's -- drawn into the map it only repeated the silhouette, and at the
 * first blast its own silhouette program linked in the frame (research 90 #23: 47-50 ms on WebGL2).
 */
// The idle skip (CPS H8 step 2b) records the actor's subtree alone and assumes the shadow layer holds nothing else:
// `markCasters` is the only code that enables it, and a body part that leaves the body is removed, never re-parented
// (the batch-2 review, 2026-11-03). A clone of a marked mesh inherits the layer: whoever clones one into the world
// disables `SHADOW_LAYER` on the copy, or the skipped map goes stale.
export function markCasters(actor: Object3D): void {
  actor.traverse((o) => {
    if (o.userData['effectLightPass'] === true) o.layers.disable(SHADOW_LAYER);
    else o.layers.enable(SHADOW_LAYER);
  });
}

const _vertex = new Vector3();
const _part = new Box3();
const _skinIndex = new Vector4();
const _skinWeight = new Vector4();
const _baseVector = new Vector4();
const _vector4 = new Vector4();
/** `bones[b].matrixWorld x boneInverses[b]` for the mesh being skinned, made once a bone a mesh (`_boneStamp`). */
const _boneMatrices: Matrix4[] = [];
const _boneStamp: number[] = [];
let _stamp = 0;

/**
 * three r186's `SkinnedMesh.getVertexPosition` (`src/objects/SkinnedMesh.js`: `super.getVertexPosition`, then
 * `applyBoneTransform` for a `Vector3`) with the bone matrices made once a mesh instead of once a vertex and weight.
 *
 * CPS H8 step 2, 2026-11-03 (plan 2026-11-02-client-performance-sprint): 1.93 ms a frame remained in this file on the
 * owner's PC (a 16-seat live cell, after the overlays left the box), the bulk of it `applyBoneTransform`'s
 * `_matrix4.multiplyMatrices(bones[i].matrixWorld, boneInverses[i])` -- remade for every vertex and every weight,
 * although a frame's bones are the same for all of them. Here each product is made once, with the same call on the
 * same operands (so the same bits), the first time a vertex of this mesh names the bone; the rest is three's sequence
 * line for line, on the same `Vector4` methods: the position and its morphs (three's own `Mesh.getVertexPosition`), the
 * base vector `(x, y, z, 1)` through `bindMatrix`, per non-zero weight `target.addScaledVector(base x boneMatrix,
 * weight)` in the weights' order, then `bindMatrixInverse` (the `Vector3` product, its divide included). The same
 * operations in the same order on the same operands: the vertex, the box and the picture are bit-identical. A browser
 * adaptation on the CPU side only.
 */
function skinnedVertexPosition(
  mesh: SkinnedMesh, skinIndex: BufferAttribute | InterleavedBufferAttribute, skinWeight: BufferAttribute | InterleavedBufferAttribute,
  index: number, target: Vector3,
): Vector3 {
  Mesh.prototype.getVertexPosition.call(mesh, index, target);   // `super.getVertexPosition`: the position, the morphs
  const bones = mesh.skeleton.bones, inverses = mesh.skeleton.boneInverses;
  // The four components read as `fromBufferAttribute` reads them (getX..getW): the typings take a BufferAttribute only,
  // and the interleaved world (CPS H12) widened the attribute type the callers pass.
  _skinIndex.set(skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index));
  _skinWeight.set(skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index));
  _baseVector.set(target.x, target.y, target.z, 1);              // `_baseVector.set( ...target, 1 )`
  target.set(0, 0, 0);
  _baseVector.applyMatrix4(mesh.bindMatrix);
  for (let i = 0; i < 4; i++) {
    const weight = _skinWeight.getComponent(i);
    if (weight !== 0) {
      const b = _skinIndex.getComponent(i);
      let m = _boneMatrices[b];
      if (m === undefined) _boneMatrices[b] = m = new Matrix4();
      if (_boneStamp[b] !== _stamp) {
        m.multiplyMatrices(bones[b]!.matrixWorld, inverses[b]!);
        _boneStamp[b] = _stamp;
      }
      target.addScaledVector(_vector4.copy(_baseVector).applyMatrix4(m), weight);
    }
  }
  return target.applyMatrix4(mesh.bindMatrixInverse);
}

/**
 * The actor's bounds for `FUN_0031a180`, as three's `Box3.setFromObject(actor, true)` makes them but with the effect
 * lights' overlays left out (the predicate `markCasters` uses). A browser adaptation on the CPU side only.
 *
 * CPS H8, 2026-11-02 (plan 2026-11-02-client-performance-sprint): `setFromObject(actor, true)` cost 3.25 ms a frame on
 * the owner's PC (a 16-seat Frostfire match, CDP profile), most of it CPU-skinning the two overlays `./effectLights`'
 * `pair` hangs beside every receiver mesh -- the same geometry, skeleton, bind matrix, parent and place as the
 * receiver, so they add nothing to the box. The rest is `Box3.expandByObject(object, precise = true)` (three r186
 * `src/math/Box3.js`) step for step: each object's own world matrix (`updateWorldMatrix(false, false)`), its positions
 * through `getVertexPosition` (the skinning and morphs) for a mesh, then its world matrix, the children recursed, the
 * hidden ones too; an instanced mesh or a geometry without positions by its bounding box. The same vertices, the same
 * operations, in the same order, so the box -- and the picture -- is byte-identical; only the overlays' vertices go.
 */
export function shadowBounds(actor: Object3D, box: Box3): Box3 {
  box.makeEmpty();
  expandBounds(box, actor);
  return box;
}

/**
 * SPC-2 (the shadow PC's research loop, SPC.R4 / SPC.R6; a CPU-side browser adaptation behind a switch, off by default):
 * the box from fewer vertices, the same box. A vertex moved by one affine map -- a rigid mesh's vertex (its world matrix),
 * or a skinned vertex with one non-zero weight (bind matrix, one bone's product, the weight, the inverse bind matrix, the
 * world matrix: an affine map of the vertex, `w` included) -- can be the box's extreme on an axis only if it lies on the
 * convex hull of the vertices that share its map: an affine map keeps a point strictly inside a convex set strictly
 * inside its image, by its distance to the boundary times the map's smallest stretch. So a vertex inside its group's hull
 * by more than `HULL_KEEP_MARGIN_ADAPTATION` is skipped; every vertex kept is computed exactly as before, so the extremes -- and the
 * box, and the map fitted to it -- are the same values (`charShadowHull.test.ts`; research 395). A vertex blended over
 * two or more bones is not an affine image of its neighbours' and is always kept, as is every vertex of a morphed mesh,
 * of a group under `HULL_MIN_POINTS_ADAPTATION` or of a group the hull cannot be built for (collinear or identical
 * points, which three's hull throws on, or fewer than four faces).
 * The identity's one limit: the margin times the map's smallest stretch times the weight must stay far above the
 * transform's rounding (about 1e-11 at these coordinates), so a bone, mesh or weight scaled to nearly (not exactly) zero
 * could break it at that level; no bone or body scale is set in the viewer today.
 * Nothing in a build sets the switch: only the test does, and the runs of research 395 set it in the page by hand.
 */
let hullBounds = false;
/** SPC-2's switch: on, `shadowBounds` reads each mesh's plan (`boundsPlanOf`); off (the default), every vertex as before. */
export function setShadowBoundsHull(on: boolean): void { hullBounds = on; }
/** SPC-2's switch as it stands (the test's hold on "off by default"). */
export function shadowBoundsHull(): boolean { return hullBounds; }
/**
 * How far inside its hull a vertex must lie to be skipped, in the mesh's own units: far above the rounding of the
 * per-vertex float64 transform (about 1e-12 of the world's coordinates) and far below any model's detail. A browser
 * adaptation with no original; a larger margin only keeps more vertices.
 */
const HULL_KEEP_MARGIN_ADAPTATION = 1e-4;
/** A group smaller than this keeps every vertex: a hull saves nothing on it. A browser adaptation with no original. */
const HULL_MIN_POINTS_ADAPTATION = 16;

export interface BoundsPlan {
  /** The vertex indices to read, ascending; null: every vertex. */
  readonly indices: Uint32Array | null;
  readonly total: number;
  readonly kept: number;
}
interface PlanEntry { plan: BoundsPlan; position: unknown; positionVersion: number; skinIndex: unknown; skinWeight: unknown; skinVersion: number; skinned: boolean }
const plans = new WeakMap<BufferGeometry, PlanEntry>();
const versionOf = (a: unknown): number => { const v = a as { version?: number; data?: { version: number } } | undefined; return v ? (v.data !== undefined ? v.data.version : v.version ?? 0) : -1; };

/** The vertices `shadowBounds` reads for one mesh under SPC-2's switch (made once per geometry, remade when it changes). */
export function boundsPlanOf(object: Object3D): BoundsPlan {
  const o = object as Object3D & { geometry?: BufferGeometry; isSkinnedMesh?: boolean; morphTargetInfluences?: number[] };
  const geometry = o.geometry!;
  const position = geometry.getAttribute('position');
  const total = position.count;
  const all: BoundsPlan = { indices: null, total, kept: total };
  if ((geometry.morphAttributes['position']?.length ?? 0) > 0 || (o.morphTargetInfluences?.length ?? 0) > 0) return all;
  const skinned = o.isSkinnedMesh === true;
  const skinIndex = geometry.attributes['skinIndex'], skinWeight = geometry.attributes['skinWeight'];
  const skinVersion = versionOf(skinIndex) * 1e6 + versionOf(skinWeight);
  const cached = plans.get(geometry);
  if (cached && cached.position === position && cached.positionVersion === versionOf(position) && cached.skinned === skinned
    && cached.skinIndex === skinIndex && cached.skinWeight === skinWeight && cached.skinVersion === skinVersion) return cached.plan;
  // The groups: one map each. A rigid mesh is one group; a skinned one a group per (single bone, its weight) -- the weight
  // scales the map, so two weights on one bone are two maps -- and the blended are kept apart.
  const groups = new Map<string, number[]>();
  const keep: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!skinned || skinIndex === undefined || skinWeight === undefined) { (groups.get('rigid') ?? groups.set('rigid', []).get('rigid')!).push(i); continue; }
    let bone = -1, weight = 0, n = 0;
    for (let c = 0; c < 4; c++) {
      const w = c === 0 ? skinWeight.getX(i) : c === 1 ? skinWeight.getY(i) : c === 2 ? skinWeight.getZ(i) : skinWeight.getW(i);
      if (w !== 0) { n++; weight = w; bone = c === 0 ? skinIndex.getX(i) : c === 1 ? skinIndex.getY(i) : c === 2 ? skinIndex.getZ(i) : skinIndex.getW(i); }
    }
    if (n === 1) { const key = `${bone}:${weight}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(i); }
    else keep.push(i);                                         // blended (or no weight at all): read as before
  }
  const p = new Vector3();
  for (const idx of groups.values()) {
    if (idx.length < HULL_MIN_POINTS_ADAPTATION) { keep.push(...idx); continue; }
    const points = idx.map((i) => new Vector3().fromBufferAttribute(position, i));
    let faces: { normal: Vector3; constant: number }[] = [];
    try {
      const hull = new ConvexHull().setFromPoints(points);
      faces = hull.faces.map((f) => ({ normal: f.normal, constant: f.constant }));
    } catch { faces = []; }
    if (faces.length < 4) { keep.push(...idx); continue; }     // no closed hull (the catch above, or too few faces): keep all
    for (let k = 0; k < idx.length; k++) {
      p.copy(points[k]!);
      let inside = Infinity;                                   // the distance to the nearest face plane, inward
      for (const f of faces) { const d = f.constant - f.normal.dot(p); if (d < inside) inside = d; }
      if (!(inside > HULL_KEEP_MARGIN_ADAPTATION)) keep.push(idx[k]!);
    }
  }
  keep.sort((a, b) => a - b);
  const plan: BoundsPlan = keep.length === total ? all : { indices: Uint32Array.from(keep), total, kept: keep.length };
  plans.set(geometry, { plan, position, positionVersion: versionOf(position), skinIndex, skinWeight, skinVersion, skinned });
  return plan;
}

function expandBounds(box: Box3, object: Object3D): void {
  if (object.userData['effectLightPass'] === true) return;   // an effect light's overlay: the receiver beside it counts
  object.updateWorldMatrix(false, false);
  const o = object as Object3D & { geometry?: BufferGeometry; isMesh?: boolean; isInstancedMesh?: boolean; boundingBox?: Box3 | null; computeBoundingBox?: () => void };
  const geometry = o.geometry;
  if (geometry !== undefined) {
    const position = geometry.getAttribute('position');
    if (position !== undefined && o.isInstancedMesh !== true) {
      const skinned = (o as { isSkinnedMesh?: boolean }).isSkinnedMesh === true;
      const skinIndex = geometry.attributes['skinIndex'], skinWeight = geometry.attributes['skinWeight'];
      const ownLoop = skinned && skinIndex !== undefined && skinWeight !== undefined;   // else three's (it throws alike)
      if (ownLoop) _stamp++;                                    // CPS H8 step 2: this mesh's bone products, made afresh
      // SPC-2: under the switch, a mesh's planned vertices (the hulls' and the blended); a non-mesh reads every vertex.
      const indices = hullBounds && (ownLoop || o.isMesh === true) ? boundsPlanOf(o).indices : null;
      for (let k = 0, l = indices !== null ? indices.length : position.count; k < l; k++) {
        const i = indices !== null ? indices[k]! : k;
        if (ownLoop) skinnedVertexPosition(o as unknown as SkinnedMesh, skinIndex, skinWeight, i, _vertex);
        else if (o.isMesh === true) (o as unknown as Mesh).getVertexPosition(i, _vertex);
        else _vertex.fromBufferAttribute(position, i);
        _vertex.applyMatrix4(o.matrixWorld);
        box.expandByPoint(_vertex);
      }
    } else {
      if (o.boundingBox !== undefined) {
        if (o.boundingBox === null) o.computeBoundingBox!();
        _part.copy(o.boundingBox!);
      } else {
        if (geometry.boundingBox === null) geometry.computeBoundingBox();
        _part.copy(geometry.boundingBox!);
      }
      _part.applyMatrix4(o.matrixWorld);
      box.union(_part);
    }
  }
  const children = object.children;
  for (let i = 0, l = children.length; i < l; i++) expandBounds(box, children[i]!);
}

/**
 * What one frame's own-shadow box or map was made from, as a flat list compared with the last frame's value for value
 * (`Object.is`: exact, `-0` told from `0`, no tolerance). CPS H8 step 2, 2026-11-03 (plan
 * 2026-11-02-client-performance-sprint): 1.93 ms a frame remained in this file on the owner's PC (a 16-seat live cell);
 * an idle SEAL made the same box and drew the same map every frame. A CPU-side browser adaptation.
 */
class FrameInputs {
  private readonly values: unknown[] = [];
  private n = 0;
  private same = false;
  private valid = false;
  private readonly skeletons: unknown[] = [];

  begin(): void { this.n = 0; this.same = this.valid; this.skeletons.length = 0; }
  push(v: unknown): void {
    const vs = this.values, n = this.n++;
    if (n < vs.length) {
      if (!Object.is(vs[n], v)) { this.same = false; vs[n] = v; }
    } else { this.same = false; vs.push(v); }
  }
  matrix(m: Matrix4): void { const e = m.elements; for (let i = 0; i < 16; i++) this.push(e[i]); }
  /** An attribute and its version (an interleaved one's buffer's): a write flagged `needsUpdate` changes it. */
  attribute(a: { version?: number; data?: { version: number } } | null | undefined): void {
    this.push(a);
    if (a) this.push(a.data !== undefined ? a.data.version : a.version);
  }
  box(b: Box3 | null | undefined): void {
    this.push(b);
    if (b) { this.push(b.min.x); this.push(b.min.y); this.push(b.min.z); this.push(b.max.x); this.push(b.max.y); this.push(b.max.z); }
  }
  /** A skinned mesh's skeleton: its bones' world matrices and inverses, once a skeleton a frame. */
  skeleton(sk: { bones: Object3D[]; boneInverses: Matrix4[] }): void {
    this.push(sk);
    if (this.skeletons.includes(sk)) return;
    this.skeletons.push(sk);
    this.push(sk.bones.length);
    for (let i = 0; i < sk.bones.length; i++) { this.push(sk.bones[i]); this.matrix(sk.bones[i]!.matrixWorld); this.matrix(sk.boneInverses[i]!); }
  }
  end(): boolean {
    if (this.n !== this.values.length) { this.same = false; this.values.length = this.n; }
    this.valid = true;
    return this.same;
  }
  invalidate(): void { this.valid = false; }
  /** How many recorded values the cache holds (objects among them): a dev read, `CharacterShadow.retains`. */
  size(): number { return this.values.length; }
  /** Codex P2 on #638 (2026-11-04): the record dropped -- no object of a disposed match stays reachable through it. */
  clear(): void { this.values.length = 0; this.skeletons.length = 0; this.n = 0; this.same = false; this.valid = false; }
}

type Drawn = Object3D & {
  geometry?: BufferGeometry; material?: Material | Material[]; isMesh?: boolean; isSkinnedMesh?: boolean; isInstancedMesh?: boolean;
  boundingBox?: Box3 | null; morphTargetInfluences?: number[]; skeleton?: { bones: Object3D[]; boneInverses: Matrix4[] };
  bindMatrix?: Matrix4; bindMatrixInverse?: Matrix4; bindMode?: string; instanceMatrix?: { version: number }; count?: number;
};

type Versioned = { version?: number; data?: { version: number } };

/** What a mesh's vertices are made from (`expandBounds`' reads, and the draw's): geometry, morphs, skinning, instances. */
function recordVertices(r: FrameInputs, o: Drawn): void {
  const geometry = o.geometry;
  r.push(geometry);
  if (geometry === undefined) return;
  const a = geometry.attributes;
  r.attribute(a['position'] as Versioned | undefined);
  r.attribute(a['skinIndex'] as Versioned | undefined);
  r.attribute(a['skinWeight'] as Versioned | undefined);
  r.attribute(geometry.index as Versioned | null);
  r.push(geometry.drawRange.start); r.push(geometry.drawRange.count); r.push(geometry.groups.length);
  const morphs = geometry.morphAttributes['position'];
  r.push(morphs); r.push(geometry.morphTargetsRelative);
  if (morphs !== undefined) for (const m of morphs) r.attribute(m as Versioned);
  const influences = o.morphTargetInfluences;
  r.push(influences === undefined ? -1 : influences.length);
  if (influences !== undefined) for (const v of influences) r.push(v);
  r.box(geometry.boundingBox);
  r.push(o.isMesh === true); r.push(o.isSkinnedMesh === true); r.push(o.isInstancedMesh === true);
  if (o.isSkinnedMesh === true) {
    r.push(o.bindMode); r.matrix(o.bindMatrix!); r.matrix(o.bindMatrixInverse!);
    r.skeleton(o.skeleton!);
  }
  if (o.isInstancedMesh === true) { r.attribute(o.instanceMatrix); r.push(o.count); r.box(o.boundingBox); }
}

/** `shadowBounds`' inputs, in its own traversal: the overlays and their subtrees left out as it leaves them out. */
function recordBoxInputs(r: FrameInputs, object: Object3D): void {
  const overlay = object.userData['effectLightPass'] === true;
  r.push(object); r.push(overlay);
  if (overlay) return;
  r.matrix(object.matrixWorld);
  recordVertices(r, object as Drawn);
  const children = object.children;
  r.push(children.length);
  for (let i = 0, l = children.length; i < l; i++) recordBoxInputs(r, children[i]!);
}

/**
 * The map's draw inputs: the ancestors' visibility (three's projection stops at a hidden one), every object under the
 * actor -- visible, layers, world matrix, culling, order, vertices -- and what three r186's override takes from each
 * mesh's own material (`Renderer`: `alphaTest`, `alphaMap`, `positionNode`, `displacement*`, `transparent`).
 */
function recordDrawInputs(r: FrameInputs, actor: Object3D): void {
  for (let p = actor.parent; p !== null; p = p.parent) { r.push(p); r.push(p.visible); }
  actor.traverse((object) => {
    const o = object as Drawn;
    r.push(o); r.push(o.visible); r.push(o.layers.mask); r.matrix(o.matrixWorld); r.push(o.frustumCulled); r.push(o.renderOrder);
    r.push(o.children.length);
    recordVertices(r, o);
    const materials = o.material;
    if (materials === undefined) { r.push(undefined); return; }
    const list = Array.isArray(materials) ? materials : [materials];
    r.push(list.length);
    for (const m of list) {
      const n = m as Material & {
        alphaMap?: unknown; positionNode?: unknown; displacementMap?: unknown; displacementScale?: number; displacementBias?: number;
        transmission?: number; allowOverride?: boolean;
      };
      r.push(n); r.push(n.version); r.push(n.alphaTest); r.push(n.alphaMap); r.push(n.positionNode); r.push(n.transparent);
      r.push(n.side); r.push(n.displacementMap); r.push(n.displacementScale); r.push(n.displacementBias); r.push(n.transmission);
      r.push(n.allowOverride); r.push(n.visible);
    }
  });
}

/** Which `CharacterShadow` last drew the page's one map (`target`), so another's draw is never taken for its own. */
let drawnBy: CharacterShadow | null = null;
/** The shadow that last drew the map, for the tests (Codex P2 on #638: a disposed shadow is never it). */
export function shadowDrawnBy(): CharacterShadow | null { return drawnBy; }

/** The strength the receivers' formula scales by: `ShadowWeight * 255` in the GS's 0..128 alpha. */
export function shadowStrength(weight: number): number { return (weight * 255) / UNITY; }

export class CharacterShadow {
  readonly target = target;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly silhouette = new MeshBasicNodeMaterial();
  private readonly box = new Box3();
  private direction = new Vector3(1, -1, 1).normalize();
  private weight = SHADOW_WEIGHT;
  /** CPS H8 step 2: the last frame's box inputs and draw inputs, and whether the map holds that frame's draw. */
  private readonly boxInputs = new FrameInputs();
  private readonly drawInputs = new FrameInputs();
  private drawn = false;
  /**
   * CPS H9 (a dev instrument, `stats()`): CPS H9, 2026-11-03T01:58Z: calls 0 between frames; charShadow 0.15% with the
   * skip in -- this file fell to 0.15% of the main thread while the seat's pad script walked and fired, so whether the
   * idle skip takes moving frames is read from these. Full draws completed and skips taken since construction;
   * monotonic, never reset. They only count: nothing reads them to decide.
   */
  private drawCount = 0;
  private skipCount = 0;

  constructor() {
    this.silhouette.colorNode = vec4(0, 0, 0, 1);   // VU1 0x40: untextured, the actor's own triangles
    this.silhouette.fog = false;
    this.camera.layers.set(SHADOW_LAYER);
  }

  get texture(): Texture { return this.target.texture; }

  /** The map's shadow vector (the world root's `ShadowVector`; the constructor's (1,-1,1) when there is none). */
  setVector(v: readonly [number, number, number] | null, weight = SHADOW_WEIGHT): void {
    this.direction = new Vector3(...(v ?? [1, -1, 1])).normalize();
    if (this.direction.lengthSq() === 0) this.direction.set(1, -1, 1).normalize();
    this.weight = weight;
    toward.value.copy(this.direction).negate();
  }

  /**
   * VS-5 (VS.R5, a browser adaptation): the Shadows row's tier for the page's one map -- Medium the original's 256 (the
   * default; today's draw), Low 128, High 512 with the soft taps (`setShadowTier`). The next frame redraws the map.
   */
  setTier(tier: ShadowTier): void {
    if (tier === mapTier) return;
    setShadowTier(tier);
    this.drawn = false;
  }

  /** No actor to shadow this frame (fly mode with the body hidden): the receivers take none. */
  clear(): void { strength.value = 0; }

  /**
   * `FUN_0031a180` for one actor, then its silhouette: the camera on the bounds' centre down the shadow vector, the
   * frustum fitted to the eight corners with a texel's margin, the actor drawn black on its layer into the map.
   */
  update(renderer: ShadowRenderer, scene: Scene, actor: Object3D): void {
    // The batch-2 review's F1 (2026-11-03): `updateWorldMatrix(true, true)` below does not refresh a SkinnedMesh's
    // `bindMatrixInverse` the way the skipped scene update did (three r186 does that in `updateMatrixWorld` alone), so a
    // parent moved after this line would draw the silhouette shifted. Both pages hang the body group on the scene,
    // which never moves; this keeps the parents' chain current before the actor's own update, so the case cannot arise.
    actor.parent?.updateWorldMatrix(true, false);
    actor.updateMatrixWorld(true);
    // CPS H8 step 2, 2026-11-03 (plan 2026-11-02-client-performance-sprint): 1.93 ms a frame remained in this file on the
    // owner's PC (a 16-seat live cell), and an idle SEAL made the same box and drew the same map every frame. The box
    // is a function of what `recordBoxInputs` lists (every visited object's world matrix, its vertices' sources, the
    // skeletons' bone matrices); when all of it equals the last frame's, value for value (`Object.is`: exact, not a
    // tolerance), the last box is this frame's box. Likewise the map: when the box, the draw's inputs
    // (`recordDrawInputs`: the actor's chain after its update below, its layers, meshes and materials as the override
    // reads them), the shadow vector, the renderer and the scene all equal the last frame's, this shadow drew the page's
    // map last and that draw completed, the camera fit, the clear and the render are skipped: the target already holds
    // the picture the full path would draw. Any inequality runs the full path. A CPU-side browser adaptation.
    const box = this.boxInputs;
    box.begin();
    recordBoxInputs(box, actor);
    const boxSame = box.end();
    if (!boxSame) shadowBounds(actor, this.box);     // CPS H8: setFromObject(actor, true) without the overlays, the same box
    if (this.box.isEmpty()) { this.clear(); this.drawn = false; return; }
    markCasters(actor);
    // CPS H8, 2026-11-02: three's `render` ran `scene.updateMatrixWorld()` over the whole scene for this pass -- 0.86 ms
    // of its 1.32 ms a frame on the owner's PC (16-seat Frostfire, CDP profile) -- and the world's render a millisecond
    // later ran it again. The pass draws the actor alone (its layer; the camera has no parent and `fitShadowCamera`
    // updates it), so only the actor's chain is updated here: its parents, itself and its subtree, bones included
    // (`updateWorldMatrix(true, true)`: the same products the scene's update makes for them; the box above keeps
    // step 1's `updateMatrixWorld(true)`, as before). CPS H8 step 2 moved this update up from just before the render:
    // the camera fit, the uniforms and the renderer's state between read no matrix of the actor's, so nothing they
    // compute changes, and the draw inputs are read after it. The scene's own update is skipped for this render only
    // and the world's render updates the scene as before, so the frame's picture is unchanged. A browser adaptation on
    // the CPU side only.
    actor.updateWorldMatrix(true, true);
    const draw = this.drawInputs;
    draw.begin();
    draw.push(renderer); draw.push(scene); draw.push(this.target);
    draw.push(this.direction.x); draw.push(this.direction.y); draw.push(this.direction.z);
    recordDrawInputs(draw, actor);
    const drawSame = draw.end();
    if (boxSame && drawSame && this.drawn && drawnBy === this) {
      strength.value = shadowStrength(this.weight);  // a `clear()` since (the actor hidden a frame) zeroed only this
      this.skipCount++;                              // CPS H9: the idle skip took this frame
      return;
    }
    this.drawn = false;
    const range = fitShadowCamera(this.camera, this.box, this.direction);
    const cam = this.camera;
    const mid = this.box.getCenter(new Vector3());
    toLight.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    centre.value.copy(mid);
    far.value = range;
    strength.value = shadowStrength(this.weight);

    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousClear = renderer.getClearColor(new Color());
    const previousAlpha = renderer.getClearAlpha();
    scene.overrideMaterial = this.silhouette;
    scene.background = null;                         // the map starts empty: alpha 0 but where the actor covers it
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    drawnBy = null;                                  // CPS H8 step 2: the map is being redrawn; this shadow's once it is
    const autoUpdate = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    // RENDER-FINALLY (a renderer adaptation): the state goes back in the finally, so a throwing clear or render leaves
    // neither the silhouette nor the map's target behind for the world's render; the error still goes on.
    try {
      renderer.clear();
      renderer.render(scene, cam);
      drawnBy = this;
      this.drawn = true;
      this.drawCount++;                              // CPS H9: the full path ran to its render's end
    } finally {
      scene.matrixWorldAutoUpdate = autoUpdate;
      renderer.setClearColor(previousClear, previousAlpha);
      renderer.setRenderTarget(previousTarget);
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
    }
  }

  /**
   * What compiles the map's programs ahead of the first frame that draws it (research 90 item 17: the silhouette of
   * the SEAL's gear linked 100 ms of programs on entering the walk), for `ViewerRenderer.prepare`: the actor put on
   * the map's layer, the camera fitted to it, the map as the target and the silhouette as the override.
   */
  warmSetup(actor: Object3D): { camera: OrthographicCamera; target: RenderTarget; override: MeshBasicNodeMaterial } {
    this.boxInputs.invalidate();                     // CPS H8 step 2: the box and the camera are set here; the next frame redraws
    this.drawn = false;
    actor.updateMatrixWorld(true);
    markCasters(actor);
    shadowBounds(actor, this.box);
    if (this.box.isEmpty()) this.box.setFromCenterAndSize(actor.getWorldPosition(new Vector3()), new Vector3(1, 1, 1));
    fitShadowCamera(this.camera, this.box, this.direction);
    return { camera: this.camera, target: this.target, override: this.silhouette };
  }

  /** CPS H9: the full draws and the idle skips since construction (a copy; monotonic). A dev instrument's read. */
  stats(): { drawn: number; skipped: number } { return { drawn: this.drawCount, skipped: this.skipCount }; }

  /** The values the idle skip's two caches hold (0 after `dispose`): a dev read. */
  retains(): number { return this.boxInputs.size() + this.drawInputs.size(); }

  dispose(): void {
    this.silhouette.dispose();
    // Codex P2 on #638 (2026-11-04): the caches recorded the actor's objects, geometries, materials, the renderer and the
    // scene, and `drawnBy` named this shadow -- a match left for the menus stayed reachable through this module. Both
    // dropped here; the map's owner released when it is this shadow (another's draw sets it again).
    this.boxInputs.clear();
    this.drawInputs.clear();
    this.drawn = false;
    if (drawnBy === this) drawnBy = null;
  }
}

/** `ViewerRenderer.prepare` as the shadow's warm-up calls it (`./matchRenderer` `MatchRenderer.prepare`). */
export type ShadowPrepare = (
  objects: readonly Object3D[], scene: Scene, camera: Camera, options?: { stale?: () => boolean; target?: RenderTarget; override?: Material },
) => Promise<void>;

/** The characters' shadow as a page mounts it (`mountCharShadow`). */
export interface MatchShadow {
  readonly shadow: CharacterShadow;
  /** `./main`'s `show`: the map's `ShadowVector` (the constructor's (1,-1,1) with none, or no map). */
  setMap(map: { shadowVector?: readonly [number, number, number] } | null): void;
  /**
   * `./main`'s `warmWalk` line (research 90 item 17): the actor's programs compiled for the map -- the map's camera, the
   * map as the target, the silhouette as the override. Nothing asked without `prepare` or an actor.
   */
  warm(actor: Object3D | null, scene: Scene, prepare: ShadowPrepare | undefined, stale?: () => boolean): Promise<void>;
  /**
   * `./main`'s frame line, before the world's render: the visible actor's map drawn (`CharacterShadow.update`), else none
   * this frame (`clear`) -- and none on a renderer without render targets (`./matchRenderer` `shadowRendererOf`: null).
   */
  frame(renderer: ShadowRenderer | null, scene: Scene, actor: Object3D | null): void;
  /** The page's teardown: no shadow on the receivers, the silhouette and the map's target freed; nothing drawn after. */
  dispose(): void;
}

/**
 * PAR-6 (web sprint PARITY-1, audit A.6; web research 255 s1): the characters' shadow as `/testroom` mounts it
 * (`./main`: `new CharacterShadow()`, its `show`, `warmWalk` and frame lines), one helper both pages call. The original
 * draws it in every match it runs with the shadows on (`FUN_00599f00`, the header): the menu-launched match had none.
 */
export function mountCharShadow(): MatchShadow {
  const shadow = new CharacterShadow();
  let gone = false;
  return {
    shadow,
    setMap: (map) => { shadow.setVector(map?.shadowVector ?? null); },
    warm: (actor, scene, prepare, stale) => {
      if (gone || !actor || !prepare) return Promise.resolve();
      const map = shadow.warmSetup(actor);
      return prepare([actor], scene, map.camera, { ...(stale ? { stale } : {}), target: map.target, override: map.override });
    },
    frame: (renderer, scene, actor) => {
      if (gone) return;
      if (renderer && actor?.visible) shadow.update(renderer, scene, actor); else shadow.clear();
    },
    dispose: () => {
      if (gone) return;
      gone = true;
      shadow.clear();
      shadow.setTier('medium');                    // VS-5: the page's map left at the original's size for the next page
      shadow.dispose();
      shadow.target.dispose();
    },
  };
}
