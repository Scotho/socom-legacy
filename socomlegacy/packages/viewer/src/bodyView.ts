import {
  Bone, BufferAttribute, CustomBlending, DoubleSide, FrontSide, Group, Matrix4, Mesh, OneMinusSrcAlphaFactor, Skeleton,
  SkinnedMesh, SrcAlphaFactor, Uint16BufferAttribute, BufferGeometry, type Blending, type BlendingDstFactor,
  type BlendingSrcFactor, type Texture,
} from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import { materialReference, renderGroup, uniform, vec4, vertexColor } from 'three/tsl';
import type { BodyStats, FittingMesh, LoadedBody } from './body';
import { cullByBones } from './bodyCullBound';
import { brightenOf, type Lighting } from './lighting';
import { rigShading } from './rigShading';
import { experimentalAssets, onExperimentalAssetsChange } from './experimentalAssets';
import { nightLit } from './nightVision';
import type { LoadedMap } from './loadMap';
import { drawState, materialSpec } from './materialSpec';
import { blendFactorsFor, makeTexture } from './world';

/**
 * The player's body on the page (W2.1): a three `SkinnedMesh` per sub-mesh on one `Skeleton` built from the
 * character's parts, the fittings hung off their bones, the whole stood at slot A (`./body`, `LoadedBody.at`).
 *
 * **Skinned, not CPU-posed.** The palette semantics are settled (socomlegacy/docs/research/78 §3): the mesh was exported
 * against the bind palette, every bone's own copy of every vertex landing on one point, so one bind-space
 * position per vertex with the bind matrices' inverses as `boneInverses` is exactly the game's weighted sum for
 * any pose -- up to the four-influence cut (`topInfluences`; 1 vertex of seal_A_scuba's 2,094 has five). The
 * bind pose is the identity pose: every bone matrix is the placement itself (`test/body.test.ts`), so the
 * vertices drawn are the decoded ones.
 *
 * **Shaded as the world is** (`./world`): the GS's MODULATE, clamped, times the frame brighten, each texture's
 * own state from its bind packet (`materialSpec`). The vertex colour is `record2 * lit`: `record2` the character's
 * colour lane, data quadword 338 as the EE's packet initializes it (research 15 §4.4; C51, later writers unvalidated) --
 * (128, 128, 128, 128), unity, in
 * all 26 skinning dumps of `logs/vu1dump3` -- or a fitting's own lane; `lit` the map's `GlobalLighting` rig on the
 * posed normal, per vertex every frame on the GPU (`./rigShading`). That the SEAL takes the light command is the one
 * reading left (78 §6.2): no dump of a textured character pass was captured.
 */

export interface BodyView {
  group: Group;
  /** What `stats().body` reports for the controller's pose check. */
  stats: BodyStats & {
    character: string | null; model: string; dressedBy: string; fittingNames: string[]; missing: string[];
    height: number; eye: number | null; at: [number, number, number] | null; yaw: number | null;
    /** WEAPON: the gear built but not shown (`HIDDEN_AT_SPAWN`, `setGearVisible`). */
    hiddenGear: string[];
  };
  setVisible(on: boolean): void;
  setLighting(light: Lighting): void;
  /**
   * W2.2b: a pose on the bones -- one local matrix per part in the engine's layout (row-major, row vectors: three's
   * column-major elements), as `@s2u/scene`'s `Skeleton.local` holds them after the animator has written it.
   */
  setPose(locals: readonly ArrayLike<number>[]): void;
  /** W2.2b: stands the body with its soles at `feet`, facing the look's `yaw` (degrees, `Pose.yaw`: the model's -z along it). */
  place(feet: readonly [number, number, number], yaw: number): void;
  /**
   * WEAPON: a node the body carries that its mesh does not skin to -- the held item's `rifle` under `rhand`
   * (`./heldItem`) -- hung under the named part at the identity. Its pose comes in `setPose` after the skeleton's
   * own parts, in the order the props were added. Returns the node, to hang a model on.
   */
  addProp(name: string, parent: string): Group;
  /** WEAPON: shows or hides a piece of gear by its `character.rdr` name; false when the body has none of that name. */
  setGearVisible(name: string, on: boolean): boolean;
  /**
   * HX-2 (research 238 §1): the body's opacity, 0..1 -- the rescued hostage's fade (`./net/escortee`
   * `HOSTAGE_FADE_READING`): every material of this body (its own: `buildBody` makes them per body) drawn at it while
   * under 1, its colour blended by the source's alpha (SrcAlpha, OneMinusSrcAlpha: `buildBody`'s opaque draw is a copy,
   * One, Zero, under which an opacity shows nothing), no depth written, the canvas's alpha factors kept (`./world`
   * `blendFactorsFor`); each back to its own blend at 1. Hiding the body at 0 is the caller's (`group.visible`).
   */
  setOpacity(opacity: number): void;
  dispose(): void;
}

/**
 * The gear the game hides as soon as it has hung it: `FUN_00599f00` 0x599f00 (decomp line 455788) dresses the SEAL
 * in its `default_gear` (`FUN_0058b790` per piece) and then calls `FUN_0059df60(seal, 0)`, which finds the gear
 * named "Satchel" (the string at 0x65f0f8, `FUN_0028e880(seal+0x170, "Satchel", 0)`) and turns it off through its
 * node's `vtbl+0x38`. It is shown only when the SEAL picks up the bomb (`FUN_005bbf10` 0x5bbf10, the inventory taking
 * item 0x9a, then `FUN_0059df60(owner, 1)`, D:L473670), and hidden again when the bomb is dropped (the dropper's
 * `FUN_0059dd30` D:L457568-457570, every machine's state-1 handler `FUN_0059ddb0` D:L457602-457605) or planted (the
 * placement's end `FUN_005bc730` D:L473973-473975, every machine's state-3 handler `FUN_005bc200` D:L473727), by
 * `FUN_0059fac0` (D:L458480-458482) and at the round's reset (line 76121). So a SEAL without the bomb wears no satchel.
 * The rule is every actor's: the others' bodies (`./remotePlayers` `setGearVisible`) and the page's own (`./play`
 * `Play.setGearVisible`), both driven by `./bombPage` (PB-1).
 */
export const HIDDEN_AT_SPAWN: ReadonlySet<string> = new Set(['Satchel']);

/**
 * `CLIB_GEO.ZED` `vparams` word 0 bit 3, the visual's backface cull (`VISUAL_FLAG_CULL`): set on every `CMesh` and
 * `CSubMesh` visual of the 411 characters (78 §2.5), and the winding is CCW-front as on the map (78 §2.3). A gear
 * mesh carries its own visual's bit (`FittingMesh.cull`).
 */
const CULL = true;
/**
 * 78 §6.2: the character's colour lane, the EE's quadword 338: its initialization read as the PS2's unity, 128
 * (`FUN_00335fd0` D:L234705-234709's packet at 0x3dbfe0). The dynamic colour path writes quadword 38, not 338; a
 * later writer to 338 and the complete rendered colour are not validated (the research reconciliation's C51).
 */
const UNITY = 1;

export function buildBody(body: LoadedBody, map: Pick<LoadedMap, 'textures' | 'textureFlags'>, lighting: Lighting): BodyView {
  const group = new Group();
  group.name = `body ${body.model}`;
  group.visible = false;                        // off by default in W2.1: the play mode switches it (W2.R1)

  // The skeleton: one bone per part, its local matrix the part's `nparams` (row-major row-vector storage is
  // three's column-major storage, `toColumnMajor` in @s2u/scene), and the bind matrices' inverses.
  const bones = body.parts.map((p) => {
    const bone = new Bone();
    bone.name = p.name;
    new Matrix4().fromArray(p.bindLocal).decompose(bone.position, bone.quaternion, bone.scale);
    return bone;
  });
  body.parts.forEach((p, i) => (p.parent < 0 ? group : bones[p.parent]!).add(bones[i]!));
  const skeleton = new Skeleton(bones, body.parts.map((p) => new Matrix4().fromArray(p.bindWorld).invert()));

  // Render group, not the per-object default (CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame
  // across ~550 draws; a render-group uniform is compared once a render): one value for every draw of this body. A
  // browser adaptation on the CPU side only.
  const brighten = uniform(brightenOf(lighting)).setName('bodyBrighten').setGroup(renderGroup);
  // The vertex colour is the material's (`record2`: unity on the skin -- data quadword 338 is (128,128,128,128) in
  // every one of the 26 skinning dumps in logs/vu1dump3 -- and the fitting's own), lit here per vertex, every frame,
  // from the posed normal (`./rigShading`).
  let currentRig = lighting.rig;
  const makeShading = () => {
    const rig = rigShading(currentRig, experimentalAssets.characterOn
        ? {ambient: experimentalAssets.characterAmbient, directional: experimentalAssets.characterDirectional} : undefined);
    // Then the night vision's command 0x5c while the goggles are on (`./nightVision`): the characters' packets carry it too.
    // A character's draws take the lens's row 2 (`FUN_00313240(model, 2)`, L406210: hot under the thermal scope).
    const litColour = nightLit(vec4(vertexColor().rgb.mul(rig.lit), vertexColor().a), 2);
    const texel = materialReference('map', 'texture') as unknown as Node<'vec4'>;
    const modulated = vec4(texel.mul(litColour)).clamp(0, 1);
    const shaded = vec4(modulated.rgb.mul(brighten), modulated.a);
    const plain = vec4(litColour).clamp(0, 1);
    const shadedPlain = vec4(plain.rgb.mul(brighten), plain.a);
    return {rig, shaded, shadedPlain};
  };
  const variants = new Map<boolean, ReturnType<typeof makeShading>>();
  const shadingFor = () => {
    let next = variants.get(experimentalAssets.characterOn);
    if (!next) { next = makeShading(); variants.set(experimentalAssets.characterOn, next); }
    next.rig.set(currentRig);
    return next;
  };
  let shading = shadingFor();

  const textures = new Map<string, Texture>();
  const materials = new Map<string, MeshBasicNodeMaterial>();
  const stopExperimentalUpdates = onExperimentalAssetsChange('character', () => {
    shading = shadingFor();
    for (const material of materials.values()) {
      material.colorNode = material.map ? shading.shaded : shading.shadedPlain;
      material.needsUpdate = true;
    }
  });
  const materialFor = (name: string | null, fog: boolean, cull: boolean): MeshBasicNodeMaterial => {
    const key = `${name ?? ''}|${fog ? 1 : 0}|${cull ? 1 : 0}`;
    const cached = materials.get(key);
    if (cached) return cached;
    const flags = name === null ? undefined : map.textureFlags[name];
    const spec = materialSpec(flags, fog, true, cull);
    const rgba = name === null ? undefined : map.textures[name];
    let texture = name === null ? undefined : textures.get(name);
    if (!texture && name !== null && rgba) textures.set(name, texture = makeTexture(rgba, spec));
    const state = drawState(spec, false);
    const material = new MeshBasicNodeMaterial();
    material.name = `body ${name ?? 'untextured'}`;
    material.map = texture ?? null;
    material.vertexColors = false;              // the graph reads the attribute itself, as the world's does
    material.colorNode = texture ? shading.shaded : shading.shadedPlain;
    material.transparent = state.transparent;
    material.depthWrite = state.depthWrite;
    Object.assign(material, blendFactorsFor(state.factors));
    material.alphaTest = spec.alphaTest;
    material.side = spec.cull ? FrontSide : DoubleSide;
    material.fog = spec.fog;
    materials.set(key, material);
    return material;
  };

  /** The material colour a part is drawn with before the rig: unity for the skin, the fitting's own lane. */
  const colour = (count: number, material: Float32Array | null): BufferAttribute =>
    new BufferAttribute(material ? Float32Array.from(material) : new Float32Array(count * 4).fill(UNITY), 4);
  // WEBGPU-BLACK (2026-11-05, live v0.4.7): the meshes this body built, the only ones `dispose` frees. Whatever is hung
  // under the group later -- the page's held weapons (`./play` `hangHeld`, `setBody`), the world's one object per model
  // whose geometry every remote body's `cloneHeld` copy shares (`./world` `held`), a grenade on a prop -- is someone
  // else's: disposing it with the body destroyed the shared buffers under every cached remote clone, and under WebGPU
  // the world's submit was rejected every frame from the next draw of one ("[Buffer] used in submit while destroyed").
  const ownMeshes: Mesh[] = [];
  for (const sub of body.subMeshes) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(sub.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(sub.normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(sub.uvs, 2));
    geometry.setAttribute('color', colour(sub.positions.length / 3, null));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(sub.skinIndex, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(sub.skinWeight, 4));
    geometry.setIndex(new BufferAttribute(sub.indices, 1));
    const mesh = new SkinnedMesh(geometry, materialFor(sub.textureName, sub.fog, CULL));
    mesh.name = `${body.model} ${sub.textureName ?? 'untextured'}`;
    group.add(mesh);
    ownMeshes.push(mesh);
    mesh.bind(skeleton, new Matrix4());         // bound at the model origin: the bind pose is the identity pose
    // CPS H9, the body cull: culled by a bound that follows the pose (`./bodyCullBound`), not the bind pose's bounds;
    // unculled, as before, when the mesh is outside what the bound covers. A CPU-side browser adaptation: no pixel changes.
    cullByBones(mesh);
  }

  // The fittings hang off their parts under `offset` (78 §5), so they follow the bone when a motion moves it.
  const gear = new Map<string, Group>();
  for (const fitting of body.fittings) {
    const holder = new Group();
    holder.name = fitting.name;
    holder.visible = !HIDDEN_AT_SPAWN.has(fitting.name);
    gear.set(fitting.name, holder);
    new Matrix4().fromArray(fitting.offset).decompose(holder.position, holder.quaternion, holder.scale);
    bones[fitting.part]!.add(holder);
    for (const m of fitting.meshes) {
      const mesh = new Mesh(fittingGeometry(m, colour(m.positions.length / 3, m.colors)),
        materialFor(m.textureName, m.fog, m.cull));
      mesh.name = `${fitting.name} ${m.textureName ?? 'untextured'}`;
      holder.add(mesh);
      ownMeshes.push(mesh);
    }
  }

  if (body.at) {
    group.position.set(...body.at.position);
    group.rotation.y = body.at.yaw;
  }

  const scratch = new Matrix4();
  const props: Group[] = [];
  /** Each material's own blend state, kept at the first `setOpacity` and put back at 1. */
  const drawn = new Map<MeshBasicNodeMaterial, {
    transparent: boolean; depthWrite: boolean; blending: Blending; blendSrc: BlendingSrcFactor | BlendingDstFactor; blendDst: BlendingDstFactor;
  }>();
  const hiddenGear = (): string[] => body.fittings.map((f) => f.name).filter((n) => gear.get(n)?.visible === false);
  const view: BodyView = {
    group,
    stats: {
      ...body.stats, character: body.character, model: body.model, dressedBy: body.dressedBy,
      fittingNames: body.fittings.map((f) => f.name), missing: body.missing, height: body.height, eye: body.eye,
      at: body.at ? [...body.at.position] : null, yaw: body.at?.yaw ?? null, hiddenGear: hiddenGear(),
    },
    setVisible: (on) => { group.visible = on; },
    setPose: (locals) => {
      locals.forEach((m, i) => {
        const node = bones[i] ?? props[i - bones.length];
        if (node) scratch.fromArray(m as ArrayLike<number> as number[]).decompose(node.position, node.quaternion, node.scale);
      });
    },
    addProp: (name, parent) => {
      const prop = new Group();
      prop.name = name;
      (bones.find((b) => b.name === parent) ?? group).add(prop);
      props.push(prop);
      return prop;
    },
    setGearVisible: (name, on) => {
      const holder = gear.get(name);
      if (!holder) return false;
      holder.visible = on;
      view.stats.hiddenGear = hiddenGear();
      return true;
    },
    place: (feet, yaw) => {
      group.position.set(feet[0], feet[1], feet[2]);
      group.rotation.y = (yaw * Math.PI) / 180;           // the camera's yaw is three's turn about y (`camera.ts`)
      view.stats.at = [feet[0], feet[1], feet[2]];
      view.stats.yaw = group.rotation.y;
    },
    setLighting: (next) => {
      brighten.value = brightenOf(next);
      currentRig = next.rig; shading.rig.set(next.rig);
    },
    setOpacity: (opacity) => {
      const o = Math.min(1, Math.max(0, opacity));
      for (const m of materials.values()) {
        let own = drawn.get(m);
        if (!own) drawn.set(m, own = { transparent: m.transparent, depthWrite: m.depthWrite, blending: m.blending, blendSrc: m.blendSrc, blendDst: m.blendDst });
        const fading = o < 1;
        if (m.transparent !== (fading || own.transparent) || m.blendSrc !== (fading ? SrcAlphaFactor : own.blendSrc)) m.needsUpdate = true;
        m.opacity = o;
        m.transparent = fading || own.transparent;
        // a fading body's surfaces behind its front ones show through: no depth written while it blends, as a blend draws
        m.depthWrite = fading ? false : own.depthWrite;
        m.blending = fading ? CustomBlending : own.blending;
        m.blendSrc = fading ? SrcAlphaFactor : own.blendSrc;
        m.blendDst = fading ? OneMinusSrcAlphaFactor : own.blendDst;
      }
    },
    dispose: () => {
      stopExperimentalUpdates();
      for (const m of ownMeshes) m.geometry.dispose();   // the body's own, never a child hung on it (WEBGPU-BLACK)
      for (const m of materials.values()) m.dispose();
      for (const t of textures.values()) t.dispose();
      skeleton.dispose();
    },
  };
  return view;
}

/** A fitting's geometry: its own positions, normals and uvs, and its material colour (the rig lights it on the GPU). */
function fittingGeometry(m: FittingMesh, color: BufferAttribute): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(m.positions, 3));
  if (m.normals) geometry.setAttribute('normal', new BufferAttribute(m.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(m.uvs, 2));
  geometry.setAttribute('color', color);
  geometry.setIndex(new BufferAttribute(m.indices, 1));
  if (!m.normals) geometry.computeVertexNormals();     // a fitting with no normal lane still has a surface to light
  geometry.computeBoundingSphere();
  return geometry;
}
