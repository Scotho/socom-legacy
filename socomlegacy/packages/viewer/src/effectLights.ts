import {
  BufferAttribute, Box3, ClampToEdgeWrapping, CustomBlending, DataTexture, Group, InstancedMesh, SkinnedMesh, LessEqualDepth, LinearFilter,
  Matrix4, Mesh, NoColorSpace, OneFactor, OneMinusSrcAlphaFactor, RGBAFormat, Sphere, SrcAlphaFactor, Vector3, ZeroFactor,
  type Frustum, type FrustumArray, type InstancedBufferAttribute, type Object3D,
} from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import {
  abs, cameraPosition, clamp, cross, dFdx, dFdy, dot, instanceIndex, max, min, normalize, positionLocal, positionWorld,
  referenceBuffer, select, texture as textureNode, float, renderGroup, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { lightRange, type ZAnimLight } from '@s2u/scene';
import { MODEL_PACK_DRAW } from './modelPackHook';
import { effectBrighten } from './effectMaterials';
import type { EffectTexture } from './effectData';
import {hdTextures} from './hdTexturePack';

/**
 * The zAnim `LIGHT` command's dynamic light, drawn as the engine draws it (socomlegacy/docs/research/89 §10): not a light on the
 * vertex colours but **a second pass of every lit visual in its reach** -- `FUN_00339660` gives a node the world's
 * lights whose sphere meets its own (at most six), `FUN_003b5b90` emits VU1 command 0x3a once a light, and the VU1
 * handler at 0x23d8 re-draws the node's triangles with `light_map.tif` (`EFFE_TXR`, a white spot, alpha 0.94 at its
 * centre to 0 at its rim) projected on the surface:
 *
 * - `L = light − P`, `h = max(L·N, 0)`, the falloff `f = 0.5 clamp((max − h)/(max − min))`, the gate `min(h, 1)`;
 * - the spot's uv `0.5 + (L·T, L·B)/max` on the surface's own axes: a spot `max/2` in radius under the light;
 * - `MODULATE` against the white texel: `Cs = min(1, 2 rgb/255 f)`, `As = At · opacity f gate / 128`;
 * - blended by the light's ALPHA: 0x48 (the explosions) `dst += Cs As`, 0x44 (the muzzles) `dst = lerp(dst, Cs, As)`.
 *
 * The surface's own texture and baked colour never enter it. The viewer draws the pass as overlays sharing the lit
 * world's own geometry and matrices (`setReceivers`), depth-tested equal-or-nearer, writing no depth. Readings: every
 * opaque mesh of the world and the held weapon takes it (the game's gate is the visual flags 0x4000 and 0x10, 140 of
 * MP2's 177 visuals, which the viewer's merged meshes no longer carry); the normal is the face's own (the screen
 * derivatives), where the VU reads the vertex's. The SEAL's skinned body is re-drawn on its own skeleton.
 */

type Vec3 = [number, number, number];

/** The lights drawn at once (the engine's per-node limit). */
export const MAX_LIGHTS = 6;

/**
 * A uniform of the render's shared group: one buffer for every overlay, set once a render -- not TSL's default object
 * group, a buffer an overlay, which the pre-warm paid for over 1,200 overlays.
 */
const shared = <U extends { setGroup(g: typeof renderGroup): unknown }>(u: U): U => { u.setGroup(renderGroup); return u; };

/**
 * One light's uniforms: where it is, its range now, its colour and opacity, and whether it adds (0x48: 1) or lerps
 * (0x44: 0). A slot without a light has a range of 0, which draws nothing.
 */
const lightUniforms = () => ({
  at: shared(uniform(new Vector3())), rMin: shared(uniform(0)), rMax: shared(uniform(0)), rgb: shared(uniform(new Vector3(1, 1, 1))),
  opacity: shared(uniform(0)), adds: shared(uniform(1)),
});
type LightUniforms = ReturnType<typeof lightUniforms>;

interface LivePass {
  light: ZAnimLight;
  /** Where it is, world. */
  at: Vector3;
  t: number;
  alive: () => boolean;
  /** Its uniforms' slot. */
  slot: number;
  /** The receiver meshes its widest sphere meets. */
  reach: Mesh[];
  /** Its range is open now. */
  on: boolean;
  /** Where it is this tick, re-read each update (`FUN_00264cb0`'s tick recomputes the place, D:L111995-112031), or null: fixed. */
  where: (() => Vec3) | null;
}

/** An overlay pair: the receiver re-drawn in the additive pass and in the lerped one. */
interface Pair { add: Mesh; mix: Mesh }

/**
 * CPS overlay cull (product track, a browser adaptation: it changes no pixel, only what is submitted). The pass is
 * exactly zero at a fragment `P` unless `0 < h < rMax` (`f`'s clamp is 0 at `h >= rMax`, the gate 0 at `h = 0`) and
 * the spot's fetch is off the rim: `uv = 0.5 + (L.T, L.B)/max(rMax, 1e-4)` outside [0, 1] on either axis fetches only
 * rim texels (`ClampToEdgeWrapping`, `LinearFilter`, level 0), whose alpha is 0 where the spot's rim is clear
 * (`spotBorderClear`). With `N`, `T`, `B` orthonormal, a lit fragment has `|L|^2 = h^2 + (L.T)^2 + (L.B)^2 <=
 * 1.5 max(rMax, 1e-4)^2`; the bound is that radius, `sqrt(1.5) = 1.2247...`, with a margin for the GPU's rounding.
 * An overlay whose pass has no light whose bound sphere meets the render's frustum (and, for a plain mesh, the
 * overlay's own world box) adds `Cs As = 0` / lerps by `As = 0` at every fragment it would draw: it is not submitted.
 */
export const LIGHT_BOUND = 1.25;

/**
 * Whether a spot image's rim texels (its first and last rows and columns) all have alpha 0 -- what the cull's bound
 * needs (`LIGHT_BOUND`). An image the cull cannot read (no byte data, short data) is not clear: nothing is culled.
 */
export function spotBorderClear(img: { width?: number; height?: number; data?: ArrayLike<number> | null } | null | undefined): boolean {
  const w = img?.width ?? 0, h = img?.height ?? 0, d = img?.data;
  if (!d || w < 1 || h < 1 || !(d instanceof Uint8Array || d instanceof Uint8ClampedArray) || d.length < w * h * 4) return false;
  for (let x = 0; x < w; x++) if (d[x * 4 + 3] !== 0 || d[((h - 1) * w + x) * 4 + 3] !== 0) return false;
  for (let y = 0; y < h; y++) if (d[(y * w) * 4 + 3] !== 0 || d[(y * w + w - 1) * 4 + 3] !== 0) return false;
  return true;
}

/** A light's reach at its widest over its keys (for choosing what it re-draws). */
export function lightReach(light: Pick<ZAnimLight, 'ranges'>): number {
  return light.ranges.reduce((m, k) => Math.max(m, k[2]), 0);
}

/**
 * IP4 (a renderer-internal adaptation; nothing drawn changes): the most placements an instanced overlay reads through
 * its pass material's own instance buffer -- 16,384 bytes of matrices, WebGL2's least uniform block. three's own
 * instancing (`three/src/nodes/accessors/Instance.js` L28-45) makes a new buffer node at every build, named in the shader
 * by its process-global node id (`WGSLNodeBuilder.js` L1398, `GLSLNodeBuilder.js` L1792/L1800), and builds once an
 * instanced object (`RenderObject.js` L846-852 keys it by `object.uuid`): every instanced overlay linked a vertex program
 * of its own, two a receiver (MP72: 242). A buffer node held by the material is one node in every build, so the overlays
 * of one instance count link one program a pass. A receiver with more placements keeps three's instancing.
 */
export const SHARED_INSTANCES_MAX = 256;

/** The instance count an overlay of `m` reads through its pass material's buffer, or null: three's own instancing. */
function sharedInstances(m: Mesh): number | null {
  if (!(m instanceof InstancedMesh) || m.instanceMatrix.isInstancedBufferAttribute !== true) return null;
  const n = m.instanceMatrix.count;
  return n >= 1 && n <= SHARED_INSTANCES_MAX ? n : null;
}

/**
 * An overlay re-drawing `m` with `material`, hidden: the same geometry (a skinned body on its own skeleton, so the pass
 * bends with the pose; an instanced mesh on its instances). An instanced receiver of `sharedInstances` is re-drawn over
 * its own placements' array (the same live matrices: a placement put later moves the overlay too), handed to three as
 * a plain attribute so `NodeMaterial.setupPosition` (L798) leaves the transform to the pass material's `positionNode`
 * (`passMaterial`), the same `matrix * position` three's instancing applies (`Instance.js` L206-207).
 * Three asks `reaches` at its projection, with the frustum of the camera that render draws with (`intersectsFrustum`,
 * three's per-object hook): the CPS overlay cull (`LIGHT_BOUND`); an instanced overlay, shared or not, takes its
 * frustum test alone.
 */
function overlayOf(m: Mesh, material: MeshBasicNodeMaterial, reaches: (o: Mesh, frustum: Frustum | FrustumArray) => boolean): Mesh {
  let overlay: Mesh;
  if (m instanceof SkinnedMesh) {
    const sk = new SkinnedMesh(m.geometry, material);
    sk.bind(m.skeleton, m.bindMatrix);
    sk.bindMode = m.bindMode;
    overlay = sk;
  } else if (m instanceof InstancedMesh) {
    const im = new InstancedMesh(m.geometry, material, m.count);
    im.instanceMatrix = sharedInstances(m) === null ? m.instanceMatrix
      : new BufferAttribute(m.instanceMatrix.array, 16) as unknown as InstancedBufferAttribute;
    overlay = im;
  } else overlay = new Mesh(m.geometry, material);
  overlay.userData.effectLightPass = true;
  overlay.frustumCulled = true;
  overlay.intersectsFrustum = (frustum) => reaches(overlay, frustum);
  overlay.renderOrder = 10;
  overlay.visible = false;
  return overlay;
}

/**
 * The lights' passes, pooled (research 90 item 19: a new material and ~170 new overlays a blast cost a 300-850 ms
 * frame, every blast). The six lights' uniforms are fixed slots; two materials a map -- the additive pass and the
 * lerped one -- each sum every slot of their blend in one draw; a receiver mesh gets its two overlays once, at the map's
 * pre-warm (or the first light to reach a mesh made later) and keeps them. A light then sets uniforms and shows the
 * overlays in its reach: no program, no object is made during play.
 */
export class EffectLights {
  readonly object = new Group();
  private receivers: () => Object3D[] = () => [];
  private map: DataTexture | null = null;
  private readonly slots: LightUniforms[] = Array.from({ length: MAX_LIGHTS }, lightUniforms);
  private materials: { add: MeshBasicNodeMaterial; mix: MeshBasicNodeMaterial } | null = null;
  /** The two passes again for each instance count an overlay reads through its material (`sharedInstances`, IP4). */
  private instancedMaterials = new Map<number, { add: MeshBasicNodeMaterial; mix: MeshBasicNodeMaterial }>();
  private pairs = new Map<Mesh, Pair>();
  private live: LivePass[] = [];
  /** The overlays shown now (by the lights, or by the pre-warm). */
  private shown = new Set<Mesh>();
  private warming = false;
  /** The CPS cull's verdicts since the last `refresh` (an overlay drawn: true; left out: false). */
  private readonly judged = new Map<Mesh, boolean>();
  /** The spot's rim, read once a texture version (`spotBorderClear`). */
  private rim: { image: unknown; version: number; clear: boolean } | null = null;
  private readonly bound = new Sphere();
  private readonly box = new Box3();
  /** Lights begun, for the hook. */
  started = 0;

  constructor() {
    this.object.name = 'effect lights';
  }

  /** What the lights re-draw: the world's group, the held weapon, the SEAL's body (their opaque meshes). */
  setReceivers(roots: () => Object3D[]): void {
    this.receivers = roots;
  }

  /** `light_map.tif` off the map's `EFFE_TXR` (null: a spot computed to the same falloff); the materials made anew. */
  setTexture(t: EffectTexture | null): void {
    this.clear();
    for (const { add, mix } of this.pairs.values()) { add.removeFromParent(); mix.removeFromParent(); }
    this.pairs.clear();
    this.shown.clear();
    this.materials?.add.dispose();
    this.materials?.mix.dispose();
    for (const { add, mix } of this.instancedMaterials.values()) { add.dispose(); mix.dispose(); }
    this.instancedMaterials.clear();
    this.map?.dispose();
    const rgba = t?.rgba ?? spot();
    const tex = new DataTexture(new Uint8Array(rgba.data.buffer, rgba.data.byteOffset, rgba.data.length), rgba.width, rgba.height, RGBAFormat);
    hdTextures.register(tex, rgba);   // OT.R92 (HD-3): inert until the test room's HD pack is set
    tex.colorSpace = NoColorSpace;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.map = tex;
    this.materials = { add: passMaterial(tex, true, this.slots), mix: passMaterial(tex, false, this.slots) };
  }

  /**
   * The receivers' opaque meshes, each once (the held weapon hangs in the body); with `hidden`, the hidden ones too.
   * A pack remake (`MODEL_PACK_DRAW`, set when `cloneMappedModel` clones it) is left out: it draws unlit, and one
   * building-sized mesh would be re-drawn as see-through copies wherever a light's sphere touches it. `warmMeshes`
   * asks this list, so the pre-warm makes those copies neither.
   */
  private receiverMeshes(hidden = false): Mesh[] {
    const out: Mesh[] = [];
    const seen = new Set<Object3D>();
    for (const root of this.receivers()) {
      root.updateWorldMatrix(true, true);
      (hidden ? root.traverse : root.traverseVisible).call(root, (o) => {
        const m = o as Mesh;
        if (seen.has(m) || !m.isMesh || !m.parent || !m.geometry?.getAttribute('position') || m.userData.effectLightPass || m.userData[MODEL_PACK_DRAW] === true) return;
        seen.add(m);
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        if (!mat?.transparent) out.push(m);
      });
    }
    return out;
  }

  /**
   * `m`'s overlays, made once and kept beside it -- the same parent and place, so they walk with the SEAL and turn with
   * the rifle (the characters take the lights as the world does: research 89 §10).
   */
  private pair(m: Mesh): Pair {
    let p = this.pairs.get(m);
    if (!p) {
      const n = sharedInstances(m);
      let materials = n === null ? this.materials! : this.instancedMaterials.get(n);
      if (!materials) {
        materials = { add: passMaterial(this.map!, true, this.slots, n!), mix: passMaterial(this.map!, false, this.slots, n!) };
        this.instancedMaterials.set(n!, materials);
      }
      p = {
        add: overlayOf(m, materials.add, (o, f) => this.reaches(o, true, f)),
        mix: overlayOf(m, materials.mix, (o, f) => this.reaches(o, false, f)),
      };
      this.pairs.set(m, p);
    }
    for (const o of [p.add, p.mix]) {
      if (o.parent !== m.parent) m.parent?.add(o);
      o.position.copy(m.position);
      o.quaternion.copy(m.quaternion);
      o.scale.copy(m.scale);
      o.matrixAutoUpdate = m.matrixAutoUpdate;
      // CPS H13 (`./sceneMatrix`): beside a frozen static nothing forces its walk any more, so the copy is flagged.
      if (!m.matrixAutoUpdate) { o.matrix.copy(m.matrix); o.matrixWorldNeedsUpdate = true; }
    }
    return p;
  }

  /**
   * The pre-warm (`Effects.warmUp`, compiled with the scene by `ViewerRenderer.warm`): every receiver's overlays made
   * now and shown for the call where the receiver's parents are shown (a LOD copy out of range hides itself alone; the
   * renderer's stand-ins take the rest). With no light every slot's range is 0, so the call's frames look the same.
   * `warmDone` hides them.
   */
  warmMeshes(): void {
    if (!this.materials) this.setTexture(null);
    this.warming = true;
    for (const m of this.receiverMeshes(true)) {
      const p = this.pair(m);
      let shown = true;
      for (let o: Object3D | null = m.parent; o; o = o.parent) if (!o.visible) { shown = false; break; }
      if (!shown) continue;
      for (const o of [p.add, p.mix]) { o.visible = true; this.shown.add(o); }
    }
  }

  /**
   * The compile call has taken its list (the renderer's projection is synchronous): the overlays leave the scene, so
   * no frame drawn while the programs build draws one -- a frame that did built them itself, synchronously (MP6: a
   * 1.7 s frame). A light puts back the ones it reaches (`pair`).
   */
  warmHide(): void {
    for (const { add, mix } of this.pairs.values()) { add.visible = false; mix.visible = false; add.removeFromParent(); mix.removeFromParent(); }
    this.shown.clear();
  }

  /** The pre-warm is over: the overlays show only where a light is. */
  warmDone(): void {
    this.warming = false;
    for (const pass of this.live) for (const m of pass.reach) this.pair(m);
    this.refresh();
  }

  /**
   * A `LIGHT` command begins at `at` (world); it lives while `alive` answers true, its last key held. With `where`, its
   * place is read again every update -- the muzzle light rides the gun (research 149); the meshes it reaches are those
   * its widest sphere met at the begin [reading: a 0.07 s light moves under a unit while the SEAL runs].
   */
  begin(light: ZAnimLight, at: Vec3, alive: () => boolean, where: (() => Vec3) | null = null): void {
    if (!this.materials) this.setTexture(null);
    if (this.live.length >= MAX_LIGHTS) this.end(this.live[0]!, false);
    const used = new Set(this.live.map((p) => p.slot));
    const slot = this.slots.findIndex((_, i) => !used.has(i));
    const u = this.slots[slot]!;
    u.at.value.set(...at);
    u.rgb.value.set(light.rgb[0] / 255, light.rgb[1] / 255, light.rgb[2] / 255);
    u.opacity.value = light.opacity / 128;
    u.adds.value = light.blend === 0x48 ? 1 : 0;
    // What its widest sphere meets (a skinned body always: its bounds do not follow the pose).
    const sphere = new Sphere(new Vector3(...at), lightReach(light));
    const reach = this.receiverMeshes().filter((m) => {
      const s = m instanceof SkinnedMesh ? null : boundsOf(m);
      return !s || s.intersectsSphere(sphere);
    });
    const pass: LivePass = { light, at: sphere.center, t: 0, alive, slot, reach, on: false, where };
    for (const m of reach) this.pair(m);
    this.live.push(pass);
    this.started++;
    this.step(pass, 0);
    this.refresh();
  }

  update(dt: number): void {
    if (this.live.length === 0) return;
    for (const pass of [...this.live]) {
      if (!pass.alive()) { this.end(pass, false); continue; }
      this.step(pass, dt);
    }
    this.refresh();
  }

  clear(): void {
    for (const pass of [...this.live]) this.end(pass, false);
    this.refresh();
  }

  /**
   * `overlays`: the overlays shown now (before the cull); `culled`: of those, the ones the last render's projection left
   * out (`reaches`), since the last `refresh` (each `update`) -- so `overlays - culled` is what a frame's render drew.
   * `warming`: the pre-warm runs (`warmMeshes` to `warmDone`); a light begun meanwhile shows its overlays at `warmDone`.
   */
  stats(): { live: number; started: number; overlays: number; culled: number; pooled: number; warming: boolean; ranges: [number, number][]; at: Vec3[] } {
    let culled = 0;
    if (!this.warming) for (const o of this.shown) if (this.judged.get(o) === false) culled++;
    return {
      live: this.live.length, started: this.started, overlays: this.warming ? 0 : this.shown.size, culled, pooled: this.pairs.size * 2,
      warming: this.warming,
      ranges: this.live.map((p) => [this.slots[p.slot]!.rMin.value as number, this.slots[p.slot]!.rMax.value as number]),
      at: this.live.map((p) => [p.at.x, p.at.y, p.at.z]),
    };
  }

  private step(pass: LivePass, dt: number): void {
    pass.t += dt;
    if (pass.where && dt > 0) {
      const p = pass.where();
      pass.at.set(p[0], p[1], p[2]);
      this.slots[pass.slot]!.at.value.set(p[0], p[1], p[2]);
    }
    const [lo, hi] = lightRange(pass.light, pass.t);
    const u = this.slots[pass.slot]!;
    u.rMin.value = lo;
    u.rMax.value = hi;
    pass.on = hi > 0;
  }

  /**
   * The CPS overlay cull, three's question at the projection of overlay `o` of the additive pass (or the lerped one):
   * may it touch a pixel this render? Yes while the pre-warm shows it (the compile must see it) or the spot's rim is not
   * clear; else when a slot of its pass with a range open now -- the uniforms the GPU reads, so a light moved in after
   * the reach was chosen counts too -- has its bound sphere (`LIGHT_BOUND` x the range now) in the frustum and, for a
   * plain mesh (drawn as its geometry under its own world matrix), meeting the overlay's world box. A skinned or
   * instanced overlay takes the frustum test alone (its geometry's box does not follow the pose or the instances).
   */
  private reaches(o: Mesh, additive: boolean, frustum: Frustum | FrustumArray): boolean {
    if (this.warming || !this.rimClear()) { this.judged.set(o, true); return true; }
    let box: Box3 | null = null;
    if (!(o instanceof SkinnedMesh) && !(o instanceof InstancedMesh)) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox) box = this.box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    }
    let hit = false;
    for (const u of this.slots) {
      if ((u.adds.value === 1) !== additive) continue;
      const rMax = u.rMax.value as number;
      if (rMax <= 0) continue;                                    // f = 0 at every h >= 0: this slot draws nothing
      if (!Number.isFinite(rMax)) { hit = true; break; }
      this.bound.center.copy(u.at.value as Vector3);
      this.bound.radius = LIGHT_BOUND * Math.max(rMax, 1e-4);
      if (frustum.intersectsSphere(this.bound) && (!box || box.intersectsSphere(this.bound))) { hit = true; break; }
    }
    this.judged.set(o, hit);
    return hit;
  }

  /** Whether the spot's texture (as it is now: the HD pack may have replaced it) has a clear rim and clamps to it. */
  private rimClear(): boolean {
    const t = this.map;
    if (!t || t.wrapS !== ClampToEdgeWrapping || t.wrapT !== ClampToEdgeWrapping) return false;
    if (this.rim?.image !== t.image || this.rim.version !== t.version) this.rim = { image: t.image, version: t.version, clear: spotBorderClear(t.image) };
    return this.rim.clear;
  }

  /** The overlays shown: those of an open light's reach, in its blend's pass. */
  private refresh(): void {
    this.judged.clear();
    if (this.warming) return;
    const want = new Set<Mesh>();
    for (const pass of this.live) {
      if (!pass.on) continue;
      const add = pass.light.blend === 0x48;
      for (const m of pass.reach) { const p = this.pairs.get(m); if (p) want.add(add ? p.add : p.mix); }
    }
    for (const o of this.shown) if (!want.has(o)) o.visible = false;
    for (const o of want) o.visible = true;
    this.shown = want;
  }

  private end(pass: LivePass, refresh = true): void {
    const u = this.slots[pass.slot]!;
    u.rMin.value = 0;
    u.rMax.value = 0;
    u.opacity.value = 0;
    this.live = this.live.filter((p) => p !== pass);
    if (refresh) this.refresh();
  }
}

/** A mesh's bounding sphere in the world, or null when it has none. */
function boundsOf(m: Mesh): Sphere | null {
  if (m instanceof InstancedMesh) {
    if (!m.boundingSphere) m.computeBoundingSphere();
    return m.boundingSphere ? m.boundingSphere.clone().applyMatrix4(m.matrixWorld) : null;
  }
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  return m.geometry.boundingSphere ? m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld) : null;
}

/**
 * A pass's material: the VU1 handler's arithmetic per fragment (the header) for every light slot of its blend, in one
 * draw. The additive pass sums `Cs As` over its lights; the lerped one folds its lights in turn,
 * `C = C (1 − As) + Cs As`, `keep = keep (1 − As)`. Either goes out as the colour `C / A` at the alpha `A` (the
 * additive's `A = min(ΣAs, 1)`, the lerped's `1 − keep`) under `SrcAlpha`: one light is the old single pass exactly.
 * With `instances`, the material places an instanced overlay itself (`sharedInstances`, IP4): the overlay's own
 * `instanceMatrix.array` (its receiver's) read per object into one buffer node of this material, as three's
 * `skeleton.boneMatrices` is (`Skinning.js` L66), and applied as three's instancing applies it.
 */
function passMaterial(map: DataTexture, additive: boolean, lights: readonly LightUniforms[], instances?: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  if (instances !== undefined) {
    // `object` null: the reference is the drawn overlay, read at each update (`ReferenceNode.js` L273-279, L310-326);
    // `element` is the runtime's (L130-134), not in the type declarations.
    const matrices = referenceBuffer('instanceMatrix.array', 'mat4', instances, null) as unknown as { element(i: Node): Node<'mat4'> };
    m.positionNode = matrices.element(instanceIndex).mul(positionLocal).xyz;
  }
  const P = positionWorld;
  // The face's normal, turned to the camera (a surface seen is a surface facing it).
  const flat = normalize(cross(dFdx(P), dFdy(P)));
  const N = select(dot(flat, cameraPosition.sub(P)).lessThan(0), flat.negate(), flat);
  // The surface's own axes: any pair square to N (the spot is round).
  const helper = select(abs(N.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const T = normalize(cross(helper, N));
  const B = cross(N, T);
  let colour: Node<'vec3'> = vec3(0, 0, 0);
  let alpha: Node<'float'> = float(0);
  let keep: Node<'float'> = float(1);
  for (const u of lights) {
    const L = u.at.sub(P);
    const h = max(dot(L, N), 0);
    const f = clamp(u.rMax.sub(h).div(max(u.rMax.sub(u.rMin), 1e-4)), 0, 1).mul(0.5);
    const gate = min(h, 1);
    const uv = vec2(dot(L, T), dot(L, B)).div(max(u.rMax, 1e-4)).add(0.5);
    const texel = textureNode(map, uv).level(float(0));   // no mips: a plain fetch, no derivatives (a cheaper program)
    const cs = min(u.rgb.mul(f).mul(2), 1).mul(effectBrighten);
    const mine = additive ? u.adds : float(1).sub(u.adds);
    const as = clamp(texel.a.mul(u.opacity).mul(f).mul(gate).mul(mine), 0, 1);
    if (additive) {
      colour = colour.add(cs.mul(as));
      alpha = alpha.add(as);
    } else {
      colour = colour.mul(float(1).sub(as)).add(cs.mul(as));
      keep = keep.mul(float(1).sub(as));
    }
  }
  const a = additive ? min(alpha, 1) : float(1).sub(keep);
  m.colorNode = vec4(colour.div(max(a, 1e-4)), a);
  m.transparent = true;
  m.depthWrite = false;
  m.depthFunc = LessEqualDepth;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  m.blending = CustomBlending;
  m.blendSrc = SrcAlphaFactor;
  m.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = ZeroFactor;
  m.blendDstAlpha = OneFactor;
  m.fog = true;
  m.toneMapped = false;
  return m;
}

/** `light_map.tif`'s spot when the library lacks it: alpha `0.94 (1 − smoothstep(0, 0.5, r))`, white. */
export function spot(): { width: number; height: number; data: Uint8ClampedArray } {
  const n = 64, data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5);
      const k = Math.min(1, r / 0.5), s = k * k * (3 - 2 * k);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * 0.94 * (1 - s));
    }
  }
  return { width: n, height: n, data };
}

/** The world's matrix a light sits at, as a point. */
export function pointOf(m: Matrix4 | null): Vec3 | null {
  return m ? [m.elements[12]!, m.elements[13]!, m.elements[14]!] : null;
}
