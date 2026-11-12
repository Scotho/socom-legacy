import {
  Box3, BufferAttribute, BufferGeometry, ClampToEdgeWrapping, CustomBlending, DataTexture, DoubleSide, DstColorFactor,
  FrontSide, Group, type Object3D, InstancedBufferAttribute, InstancedMesh, LessEqualDepth, LinearFilter, LinearMipmapLinearFilter, LineSegments, Matrix4, Mesh,
  NearestFilter, NoColorSpace, OneFactor, OneMinusSrcAlphaFactor, Quaternion, RGBAFormat, RepeatWrapping, SrcAlphaFactor,
  Texture, Vector2, Vector3, ZeroFactor,
} from 'three';
import type { Blending, BlendingDstFactor, BlendingSrcFactor, Camera, InterleavedBufferAttribute, Scene } from 'three';
import { LineBasicNodeMaterial, MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import {
  attribute, cameraPosition, float, log2, materialReference, modelViewMatrix, normalWorld, positionView, positionWorld,
  renderGroup, select, texture as textureNode, uniform, uv, varying, vec3, vec4, vertexColor,
} from 'three/tsl';
import { buildGrid, cellAt, lodIsLast, lodOpacity, lodVisible, scaledRangeSq, type LodBand } from '@s2u/scene';
import { centreOf, centroidsOf } from '@s2u/mesh';
import { DEFAULT_RENDER_VIEW, type RenderView } from './zoom';
import { extendFar, extendFog } from './fog';
import {
  detailDrawState, detailRenderOrder, alphaPassState, drawState, gsMipLod, materialSpec, mipChain, type GsMipLod,
  type DetailSpec, type DrawState, type Factor, type MaterialSpec, type TextureFlags,
} from './materialSpec';
import { alphaPassOrder, engineOrder, inAlphaPass } from './engineOrder';
import { ALPHA_PASS_REST_ORDER, alphaDetailOrder, alphaEnvOrder, alphaItemOrder, type AlphaPassSource } from './alphaInterleave';
import { under } from './mapMeta';
import { facadeAlphaKey, FacadeRelight, turnFacade } from './facade';
import { shadowFactor } from './charShadow';
import { experimentalAssets, onExperimentalAssetsChange } from './experimentalAssets';
import {WorldTextureSampling, worldSamplingNames} from './experimentalWorldSampling';
import { nightLit } from './nightVision';
import { fadeMaterial, fadePhase } from './lodFade';
import type { Rgba } from '@s2u/gs';
import { applyLighting, brightenOf, colourSlotsOf, DEFAULT_LIGHTING, type Lightable, type Lighting } from './lighting';
import { interleaveWorldVertices, WORLD_COLOUR_OFFSET, WORLD_VERTEX_STRIDE } from './worldVertices';
import type { LoadedMap, LoadedMesh } from './loadMap';
import {TexturePackTarget} from './texturePackRuntime';
import {packSourcesFor} from './texturePackSources';
import { cloneMappedModel, hasMappedModel } from './modelPackHook';
import { craneRides } from './cranes';
import {hdTextures} from './hdTexturePack';
import { releaseWorldInstancing, WorldMeshMaterial } from './worldInstancing';

/**
 * `gs` decodes a texture's rows bottom-up, which is also what GL calls V = 0, so the data goes to the GPU
 * as it comes out of the decoder and the UVs go up unchanged. `DataTexture` defaults to this; the constant
 * is here so the one thing to change, if a screenshot ever comes out mirrored top to bottom, is visible.
 */
const FLIP_Y = false;

/** A drawn map: the placed group, what it cost, and the extent the camera can frame. */
export interface WorldView {
  /** Local experiment; no requests or source scan until explicitly enabled by the testroom. */
  texturePack?: TexturePackTarget;
  /**
   * The group, **empty** when `buildWorld` returns. Every drawn object is waiting in one of the two
   * reveal queues below, because the expensive part of showing a map is not building it -- it is the
   * first frame that draws it, when three uploads each texture and geometry and compiles each program.
   */
  group: Group;
  /** The world's own meshes, one task each. What the first paint of a new map waits for. */
  revealWorld: (() => void)[];
  /** The props, the flares and the line strips. These arrive behind the world, over further frames. */
  revealProps: (() => void)[];
  /**
   * The objects `revealWorld` and `revealProps` add, in their order: what the page compiles off-screen before each
   * reveal (`ViewerRenderer.prepare`), so no program is linked by the draw that first meets it.
   */
  worldObjects: Object3D[];
  propObjects: Object3D[];
  triangles: number;
  /** The extent of everything queued, accumulated as it was built rather than read off the group. */
  box: Box3;
  /** How many of the group's draws are drawing without a texture: the highlight's subject, counted. */
  untextured: number;
  /** How many draws are drop shadows, and how many are alternate states -- what the two toggles govern. */
  shadowDraws: number;
  alternateDraws: number;
  /** How many draws carry a detail pass (`setDetail`): what `tools/map-health.ts` lists per map. */
  detailDraws: number;
  /** Every material at once, for seeing the topology through the skin. */
  setWireframe(on: boolean): void;
  /** Shows or hides texture samples without changing the wireframe overlay. */
  setTextured(on: boolean): void;
  /**
   * Shows or hides the solid draws (a browser adaptation, the Forge's Draw menu's Geometry; the owner, 2026-11-11): off,
   * the world's meshes, lines, detail and environment passes are not drawn, and the wireframe overlay still is -- the
   * topology alone. On by default; the game never turns it off.
   */
  setGeometry(on: boolean): void;
  /** Shows vertex and texture colour without applying the map's dynamic light rig. */
  setUnlit(on: boolean): void;
  /**
   * Paints the meshes that are drawing without a texture magenta -- the ones whose name was not in the
   * map's `TXR` archive, and the ones whose packets cited no name at all. Both are invisible faults
   * otherwise: an untextured mesh in vertex colour alone looks like dim geometry, not like a diagnostic.
   */
  setUntexturedHighlight(on: boolean): void;
  /**
   * Whether a texture whose alpha is a *ramp* is blended with the equation its bind packet asks for
   * rather than punched out at a threshold (`./materialSpec`). On by default; off restores the cutout,
   * which sorts perfectly and looks wrong.
   */
  setBlendGraded(on: boolean): void;
  /**
   * The engine's draw order (W1.2), or three's. On, every draw goes out in the order `CPipe::RenderWorld`
   * issues it -- the grid walked ring by ring outward from the camera's cell, the alpha pass after the
   * last ring (`./engineOrder`: the drop shadows, the flares and glows, the windows, far to near) -- as its
   * `renderOrder`, in the opaque list, writing depth under every blend as the console did (research 26
   * section 2; `drawState` in `./materialSpec`). The walk is recomputed when the camera crosses into
   * another cell, the alpha pass every frame. Off, the draws keep the scene walk's own order (the engine
   * sorts nothing but its alpha pass: `restOrder`), blended draws in three's transparent list, depth
   * written under them as the console's walk writes it (NU-15 B1, research 330; was "with no depth
   * written", which let the env pass show through FISH HOOK's blended slopes), and the alpha pass after
   * them all, writing none, where three's back-to-front sort is the console's
   * (research 82 round 5). **Off by default** until the sweep and the poses clear it (W1.R3). The LOD
   * fade twins stay in the transparent list either way (W1.3, `./lodFade`), and a detail pass is drawn
   * right after its base in either (`detailRenderOrder`).
   */
  setEngineOrder(on: boolean): void;
  /**
   * The drop shadows: the quads under props and the baked shadow patches on the ground, every draw
   * whose texture is a `shadow*.tif`. Drawn as the engine's decal pass draws them -- source alpha,
   * no depth written, after the world, nudged off the ground by a polygon offset -- whatever the
   * draw-order mode. On by default.
   */
  setShadows(on: boolean): void;
  /**
   * The alternate states (`LoadedMesh.alternate`): a destructible's remains and debris, a lamp's
   * unlit copy, the far LOD copies. Hidden by default, because drawn over the state the map opens in
   * they z-fight with it; on shows what else the graph holds. MAP-02: a debug view over `setNodeActive` --
   * on, everything is drawn whatever the world's state; off, the state is drawn again.
   */
  setAlternate(on: boolean): void;
  /**
   * MAP-02 (`./worldState`, research 209 s8): draws (`on`) or hides every placement at or under the scene node `path`
   * (its own path, or one starting `path/` or `path=`) -- a mesh of its own, one instance of a shared draw (its matrix
   * zeroed while hidden, the others drawn), or a world chunk drawn apart for a path zAnim names
   * (`LoadedMesh.switchPath`). What the world's state turns on and off (`WorldHooks.visible`). Returns how many
   * placements it reached.
   */
  setNodeActive(path: string, on: boolean): number;
  /**
   * FG-17 (the forge's hide; a browser adaptation): ONE placement switched by its `<prop entry>:<placement>` key -- the
   * switch `setNodeActive` flips by path, for a placement whose path others share. Returns how many it reached (0 or 1).
   * Every part of the placement (one draw per texture) is switched together (FG-23), and its line strips, merged into the
   * world's line groups, collapsed while hidden (FG-32, `LoadedLineGroup.spans`).
   */
  setPlacementActive(key: string, on: boolean): number;
  /**
   * PB-9b (research 284 s1, s8): draws every placement at or under the scene node `path` that is a mesh of its own (a
   * world chunk drawn apart, a single or LOD prop, a flare) at the node's opacity (+0x9c) -- under 1 with its material's
   * faded twin at the texture's own blend, the alpha scaled by it (`BASE_PULSE_DRAW_READING`), times a LOD copy's own
   * fade; 1 its own material again. What a scene program's `OBJECT_OPACITY_FROM_TO` writes (`WorldHooks.opacity`): the
   * bases' pulse outlines. An instance of a shared draw is not reached (one opacity a draw). Returns how many it reached.
   */
  setNodeOpacity(path: string, opacity: number): number;
  /**
   * LATER 165: every placement at or under the scene node `path` -- a mesh of its own or one instance of a shared draw --
   * not drawn (`cut`) or drawn again: the node's opacity (+0x9c) at 0, which the draw walk multiplies down the node's
   * subtree (`FUN_00336a10` / `FUN_00336980` D:L235028-235058) and under which a visual is not drawn at all (at or below
   * 1/128: `FUN_003374c0` D:L235418-235437). A switch of its own beside the world's state's (`setNodeActive`): a turret's
   * parts hidden in its THERMAL view (`FUN_003aa020` D:L300960-300993) and shown again leave the world's state as it was.
   * Returns how many placements it reached.
   */
  setNodeCut(path: string, cut: boolean): number;
  /**
   * Whether the GS `LINE_STRIP` geometry is drawn (SEMANTICS section 12). On by default: a strip is
   * drawn one pixel wide with the packet's texture running along it, which is what the hardware did.
   */
  setLineStrips(on: boolean): void;
  /**
   * The detail pass (W1.6): a second draw over every surface whose texture's `mp<N>_lib.rdr` entry
   * carries a `detail` record -- the detail texture at `uv` times the surface's own, blended by the
   * record's `bmode`, fading out over its range, drawn after its base without writing depth
   * (`./materialSpec`, `DetailSpec`). The console's grain on the ground close up. On by default.
   */
  setDetail(on: boolean): void;
  /**
   * PF.R60 (`./detailDistance`, a browser adaptation over PF-30's gate, PF.R50): the detail distance factor -- a
   * distance multiplier, so each visual's gate range (the disc's, untouched) is multiplied by factor² on the GPU uniform. 1,
   * the original, until the caller sets it (the PS2 picture keeps 1; Modern and Experimental take the stored factor). It
   * stacks with the Experimental view's own Distance (`experimentalAssets.detailRangeSq`). A value that is not a positive
   * finite number reads 1.
   */
  setDetailDistance(factor: number): void;
  /** The detail distance factor in force (`setDetailDistance`). */
  readonly detailDistance: number;
  /**
   * The per-frame work, called once a frame before the render: turns the facades to the camera,
   * picks each LOD pair's copy by range, advances the scrolling textures, and -- with the engine order
   * on -- walks the grid again when the camera has crossed into another cell (`setEngineOrder`).
   *
   * A flare on disc is a single quad on a single plane -- `lightcage`'s `lightrays.tif` node is 4
   * vertices and 2 triangles, normal (0, 0.96, -0.24) -- so a fixed quad that nearly faces the sky is
   * edge-on from a standing player. The engine turns the nodes flagged `m_facade` (`facadeOf`); so
   * does this. `CVisual::DrawLOD` scales a LOD copy's opacity by the camera's range across its fades,
   * so a pair crosses over rather than switching; so does this (`lodOpacity`, `./lodFade`). A
   * `TextureScroll_Object` band adds its `du, dv` to a node's uvs; so does
   * this, at `SCROLL_TICKS_PER_SECOND` steps a second (1: the step is per second, see the constant).
   *
   * `view` (ruling PF.R49, research 232 §1-§2; `RenderView` in `./zoom`, from `Zoom.renderView()`): every LOD range
   * squared is divided by `view.magnification` (`scaledRangeSq`, `LOD_SCALE_READING`: `FUN_00290aa0` D:L137045), so is
   * the detail gate's centroid range² (`detailSwitch`, PF-30), and the fog's far and the camera's far clip are
   * pushed out by `view.farExtra` (`extendFog`, `extendFar`: `FUN_001f1470` D:L53202-53255), restored at 0. Absent, it
   * is `DEFAULT_RENDER_VIEW` -- `{ 1, 0 }`, nothing changes. The last copy at a spot stays kept at every range
   * (`LOD_LAST_KEPT_RULING`, the owner's H92).
   */
  frame(camera: Camera, dt: number, view?: RenderView): void;
  /**
   * LATER 593 (`./alphaInterleave`): the alpha pass's keys for a particle system to draw its batches between, as `frame`
   * numbers the pass (with the engine order off) -- each item's range squared to its centroid times one over the last
   * frame's magnification (`+0x2c8`), far to near; null with the engine order on. Absent on a stand-in world.
   */
  readonly alphaPass?: AlphaPassSource;
  /**
   * DOORS (`./doors`): moves every prop placement at or under the scene node `path` (its own path, or one starting
   * `path/` or `path=`) by `delta`, a column-major 4x4 applied after the placement's own matrix from the disc -- the
   * door leaf's swing. The identity puts them back. Returns how many placements it moved.
   */
  moveNode(path: string, delta: ArrayLike<number>): number;
  /**
   * Chain Reaction (research 176 §9.2): turns every prop placement at or under `path` about that node's own X by
   * `angle` radians, on top of the translation `moveNode` already put there. The node's matrix becomes
   * `delta * base * Rx`, and a child keeps its rest offset from the node, so the hook's travel is not dropped.
   * Call it after `moveNode` on the parent. Returns how many placements it turned.
   */
  spinLocalX(path: string, angle: number): number;
  /**
   * EFFECTS (research 92 §6): hangs `object` -- a mark whose world-space triangles were made where the placement at
   * `path` stands now -- on that placement, so every later `moveNode` over it carries the object by the swing since
   * (its matrix = the new delta x the inverse of the delta it was made under). Returns the remover, or null when no
   * placement has that exact path. The game's decal list is the hit visual's own (`FUN_003b3800` 306396-306416; its
   * heads made by the loader `FUN_003b2ea0` 306133-306135), drawn with the node by inference (no draw site cited): a
   * mark on a door's leaf swings with the leaf.
   */
  attachToNode(path: string, object: Object3D): (() => void) | null;
  /**
   * LATER 277 (research 92 §6): `gone` is called once when the node `path` -- or one above it -- is switched off
   * (`setNodeActive(.., false)`): a mark filed in its hit visual's list goes with the node, removed
   * (`NODE_OFF_MARKS_READING`). The hold ends then, or by the returned release (the mark recycled, a new map).
   */
  holdOnNode(path: string, gone: () => void): () => void;
  /** Whether the flares are turned at all, for seeing the pose the disc actually holds. */
  setBillboards(on: boolean): void;
  /** Where the flares are, in world space -- for aiming a camera at one. */
  flarePositions(): [number, number, number][];
  /**
   * The Forge's (a browser adaptation, FG.R2): each flare -- a facade placement: a light's glow, the sun, the moon, a
   * star -- by its mesh's name, at its world place (the group's offset included), for marking and listing it.
   */
  flares?(): { name: string; at: [number, number, number] }[];
  /**
   * The Forge's (a browser adaptation): the flares drawn or not -- moved off the camera's layer, so a hidden glow is
   * neither drawn nor picked, whatever else shows or hides the mesh. Shown, the game's own picture.
   */
  setFlaresShown?(on: boolean): void;
  /** Each line-strip group's texture and world-space extent -- for aiming a camera at a rope. */
  lineGroups(): { texture: string | null; min: [number, number, number]; max: [number, number, number] }[];
  /**
   * The lighting. The brighten is a uniform on every material and costs nothing to move; a change of
   * rig, or of whether the rig is applied everywhere, re-runs the VU's lighting over every vertex
   * (`record2 * lit`, see `./lighting`), about a millisecond on the largest map.
   */
  setLighting(light: Lighting): void;
  /**
   * A held weapon by `ModelName` (W2.4; web sprint 4 M3: `LoadedMap.weapons`), in its own frame and outside `group`:
   * `./play` hangs it on its mount every frame. Built on first ask and kept (one object a model; a remote player
   * clones it). Drawn with the world's own materials, so the same GS path shades it. Null for a model the map did not
   * decode.
   */
  held(model: string): Group | null;
  /**
   * The throwables' models by model name (`grenade`, `HEgrenade`; `LoadedMap.grenade`), built as the weapon is, outside
   * `group`: `./grenade` clones them for the hand and for each grenade in flight. Empty when the map decoded none.
   */
  grenades: Record<string, Group>;
  dispose(): void;
  /**
   * What `ViewerRenderer.warm` should compile besides the scene: a stand-in mesh per LOD copy's fading twin, made now
   * rather than on the first fade (`fadeTo`), so a copy crossing its band does not pay a compile in that frame.
   */
  warmExtras(): Object3D[];
}

/**
 * BASE_PULSE_DRAW_READING (PB-9b; research 284 s1, s7): how a node's opacity f under 1 enters an alpha-pass visual's draw
 * -- as the blend's alpha `As` x f: the bases' outlines, additive (`base_red.tif`, `base_green.tif`), draw `Cs x As x f +
 * Cd`; a source-alpha texture (the Breach maps' `base_red.tif`) `(Cs - Cd) x As x f + Cd`. The LOD fades' rule
 * (`./lodFade` `fadeMaterial`, its `alpha` mode). `FUN_003374c0` reads the opacity stack's top (D:L235394) and hands a
 * visual under 1 to the alpha list (`FUN_003371b0`, D:L235437-235438) [reading: the opacity's use in the list's draw,
 * `FUN_003b6b20` (D:L308264ff), is not traced; settles: that trace, or H164's capture of the outline].
 */
export const BASE_PULSE_DRAW_READING = 'alpha-times-opacity' as const;

/**
 * NODE_OFF_MARKS_READING (LATER 277; research 92 §6, §7): what a node switched off (`setNodeActive(.., false)`: a pane
 * broken, a bridge or a base blown, a ghost door) does to the marks and scorches filed on it -- `'removed'`: each is
 * recycled through `holdOnNode`'s `gone`, its pool's room freed, the marks' and the scorches' alike. The original can
 * remove a node's decals: `FUN_003b36f0` (D:L306328-306347) frees a visual's list, both kinds back to their pools
 * together (D:L306336-306342: the temporary marks by `FUN_003bf010`, the permanent blast set by `FUN_003befe0`), and
 * `FUN_00313620` (D:L213798-213827) does it for a node and its children; their callers are the round's clears and
 * `FUN_00315e70` (a child node removed), not the switch. The switch (OBJECT_ACTIVE_STATE, `FUN_00263aa0`
 * D:L111355-111369) calls the object's vtable `+0x38` [reading: its body unread at LATER 277; if it only hides the node, the
 * decals stay filed and show again when the node comes back on mid-round; settles: vtable `+0x38`'s body, or a capture
 * of a node switched off and on in one round]. OBF-22 (2026-10-30): research 183 §19 reads that body from the disassembly
 * (`FUN_001ec450` / `FUN_00312a70`: the node's `+0x5c` bit 0 written, the old bit returned) -- so the switch frees no
 * decal and they stay filed; what is still unread is whether an inactive node's list is drawn (no draw site cited). If it
 * is not, 'removed' departs only in the pool's room and a node switched back on mid-round (LATER 589).
 */
export const NODE_OFF_MARKS_READING = 'removed' as const;

/** The two material kinds the world is drawn with, which share every property this file sets. */
type Basic = MeshBasicNodeMaterial | LineBasicNodeMaterial;
/** A TSL node that yields a colour: what `colorNode` takes. */
type ColorNode = NonNullable<MeshBasicNodeMaterial['colorNode']>;

/** A material together with what it was built from, so a switch can rebuild it from the disc's state. */
interface Built {
  material: Basic;
  flags: TextureFlags | undefined;
  fog: boolean;
  textured: boolean;
  cull: boolean;
  /** A `shadow*.tif`: drawn as a decal, see `setShadows`. */
  shadow: boolean;
  /** A scrolling texture's own shading graph, which `apply` must keep rather than replace. */
  scrollNode: ColorNode | null;
  /** Takes the characters' shadow (`./charShadow`): the world and its props; not the held rifle or a grenade. */
  receive: boolean;
  /** The draw's vertices carry an alpha below unity (`LoadedMesh.vertexAlpha`): it blends whatever its texture says. */
  vertexAlpha: boolean;
  /** A draw of the engine's alpha pass (`LoadedMesh.alphaPass`): no depth written, in either order (`alphaPassState`). */
  alphaPass: boolean;
}

/** Two LOD copies within half a metre (5 units at 0.1 m/unit) share a placement. */
const LOD_SAME_SPOT_SQ = 5 * 5;
/**
 * With the engine order off (`restOrder`): a draw's `renderOrder` is its place in the scene walk scaled under a
 * detail pass's half step (`LoadedMesh.order` runs to a few hundred times 256), and the alpha pass sits at 1
 * (`./alphaInterleave` `ALPHA_PASS_REST_ORDER`), after every draw of the walk and its detail passes, until `frame` numbers
 * it in [1, 2) by the console's key (LATER 593).
 */
const REST_WALK_SCALE = 2 ** -24;

/** A drawn object with the facts its visibility and its place in the draw order depend on. */
interface Drawn {
  object: Object3D;
  order: number;
  /** The grid cells of the placements it draws (`LoadedMesh.cells`): where the engine order files it. */
  cells: readonly number[];
  alternate: boolean;
  /** MAP-02: hidden by the world's state (`setNodeActive`); starts as `alternate`. */
  off: boolean;
  /** LATER 165: not drawn by its node's opacity at 0 (`setNodeCut`); absent, drawn. */
  cut?: boolean;
  shadow: boolean;
  /** The engine's alpha pass (`LoadedMesh.alphaPass`): drawn after the walk, far to near (`./engineOrder`). */
  alphaPass: boolean;
  /**
   * The alpha pass's sort key in the group's frame: the visual's centroid through its matrix where the draw is one
   * visual at one placement (`LoadedMesh.centre`: a world draw of the pass, a prop's lone or LOD placement; `FUN_003371b0`
   * D:L235314-235317, LATER 593's F3), else the object's centre when built (an instanced draw of many placements, one
   * key for them all: `ALPHA_INSTANCED_KEY_ADAPTATION`, research 330); a turned facade's, its centroid through its turn,
   * moved every frame (`frame`, `facadeAlphaKey`, LATER 113).
   */
  centre: [number, number, number];
  line: boolean;
  /** Shown only in its LOD band's range; null for everything drawn at every range. */
  lod: { band: import('@s2u/scene').LodBand; at: Vector3; visible: boolean; last: boolean } | null;
}

/** MAP-02: an instance the world's state hides is drawn at this matrix: every vertex at the origin, nothing on screen. */
const ZERO_MATRIX = new Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);

/** The textures that are drop shadows: `shadow.tif`, `shadow_square.tif`, `t_shadow*`, and their kin. */
const SHADOW_TEXTURE = /shadow/i;
/**
 * The unit of a band's `du, dv`. `CScrollingTexture_band` holds a uv step and nothing about time, and the
 * engine's own update is not read yet. Taken as one step per engine tick at the 60 Hz field rate, Frostfire's
 * ocean (0.04) crossed 2.4 texture widths a second and its horizon (0.02) half that -- plainly faster than the
 * console (the owner, 2026-09-27). It is now read as texture widths per SECOND: the ocean drifts a width every
 * 25 s. Still an assumption; the one number to change is this multiplier, checked by eye against PCSX2.
 */
const SCROLL_TICKS_PER_SECOND = 1;

const FACTOR = {
  zero: ZeroFactor, one: OneFactor, srcAlpha: SrcAlphaFactor, oneMinusSrcAlpha: OneMinusSrcAlphaFactor, dstColor: DstColorFactor,
} as const satisfies Record<Factor, number>;

/** The blend a world material is given, colour and alpha, from its draw state's factors. */
export interface BlendFactors {
  blending: Blending;
  blendSrc: BlendingSrcFactor;
  blendDst: BlendingDstFactor;
  blendSrcAlpha: BlendingSrcFactor | null;
  blendDstAlpha: BlendingDstFactor | null;
}

/**
 * Pure, so the blend every world draw gets is pinned without a GPU (`test/blend.test.ts`).
 *
 * The colour is the draw state's blend, or a plain copy (One, Zero) for an unblended draw; the alpha is
 * always Zero, One. The GS's alpha never reached the television, and the canvas must stay opaque or the
 * page background shows through every cutout edge, alpha ramp and blended edge, unfogged (bluish in the
 * Modern look from `--bg`, black in PS2's) -- so no draw writes alpha, and the clear colour's 1 stays.
 */
export function blendFactorsFor(factors: DrawState['factors']): BlendFactors {
  return {
    blending: CustomBlending,
    blendSrc: factors ? FACTOR[factors.src] : OneFactor,
    blendDst: factors ? FACTOR[factors.dst] : ZeroFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  };
}

/**
 * Builds the scene objects for one decoded map: one `Mesh` per texture run for the world, whose vertices
 * `loadMap` has already placed, and one `InstancedMesh` per prop model-node -- a prop model is drawn in
 * up to 26 places, so it is uploaded once and instanced by the matrices `scene` produced.
 *
 * `map.origin` is zero whenever the scene graph could be read; it is only non-zero for the fallback,
 * where the whole group still shifts together the way it did before per-node placement.
 */
export function buildWorld(map: LoadedMap): WorldView {
  const group = new Group();
  group.name = `${map.archive} worldmodel`;
  group.position.set(map.origin[0], map.origin[1], map.origin[2]);

  const textures = new Map<string, Texture>();
  // The map's own rig, from its `GlobalLighting` record; the panel's trims arrive with `setLighting`.
  let lighting: Lighting = { ...DEFAULT_LIGHTING, rig: map.lightRig };
  let lastRig = lighting.rig;
  let lastEverywhere = lighting.rigEverywhere;
  const lineObjects: LineSegments[] = [];
  /**
   * The facade placements (#291), each its own mesh at its node's origin: its facade value (`facadeOf`), which `frame`
   * turns it by (`turnFacade`), and its pose on disc (the placement's own rotation and scale), which `setBillboards(false)`
   * puts back. FACADES-2: `drawn` and `centroid` (the visual's own, `LoadedMesh.centre`, model space) give the alpha
   * pass its key through the turn (LATER 113); `relight`, a part with normals, is lit under the turned ones (LATER 114).
   * LATER 120: a turned placement's line strips too (`LoadedLineGroup.turn`), one `LineSegments` each, never re-lit.
   */
  const billboards: {
    mesh: Mesh | LineSegments; facade: number; pose: { quaternion: Quaternion; scale: Vector3 }; drawn: Drawn; centroid: [number, number, number];
    relight: FacadeRelight | null;
  }[] = [];
  let billboardsOn = true;
  const eye = new Vector3(), eyeAt: number[] = [0, 0, 0], nodeAt: number[] = [0, 0, 0];   // `frame`'s, reused
  /**
   * LATER 114: a billboard's vertex lighting under its normals as its mesh now faces (`FacadeRelight`), when it is lit --
   * re-lit only when its turn changed or the lighting it reads did (`lightingStamp`, bumped by `setLighting` with the rig
   * or `rigEverywhere`; `setBillboards` invalidates it). A cost guard, with no visible change.
   */
  let lightingStamp = 0;
  const relit = (b: (typeof billboards)[number]): void => {
    if (!unlitOn) b.relight?.update(b.mesh.quaternion, lighting, lightingStamp);
  };
  // On, as `WorldView.setBlendGraded` says, for every page that builds a world: the menu match calls no toggle (PAR-35).
  let blendGraded = true;
  /** The engine order (`setEngineOrder`): on, `renderOrder` is each draw's place in the grid walk. */
  let engineOn = false;
  let highlight = false;
  let lineStripsOn = true;
  let wireframeOn = false;
  let geometryOn = true;                 // `setGeometry`: the solid draws; the wireframe overlay follows `shownOf`, not this
  let texturedOn = true;
  let unlitOn = false;
  let shadowsOn = true;
  let alternateOn = false;
  const built: Built[] = [];
  const wireframeMaterial = new MeshBasicNodeMaterial();
  wireframeMaterial.colorNode = vec4(1, 1, 1, 0.9);
  wireframeMaterial.transparent = true;
  wireframeMaterial.depthWrite = false;
  wireframeMaterial.polygonOffset = true;
  wireframeMaterial.polygonOffsetFactor = -1;
  wireframeMaterial.polygonOffsetUnits = -1;
  wireframeMaterial.wireframe = true;
  wireframeMaterial.needsUpdate = true;
  const wireframeOverlays: { source: Mesh; overlay: Mesh; instanced: boolean }[] = [];
  /**
   * The meshes a wireframe overlay would cover (a browser adaptation, the Forge's Draw menu): each overlay is made the
   * first time the wireframe is shown (`makeWireframeOverlays`), never before -- a match's world, or any world never
   * switched to it, builds exactly as the game's does. An overlay shares its source's geometry (and an instanced one its
   * instance matrices): it is taken off the group at `dispose`, never disposed itself.
   */
  const wireframeSources: Mesh[] = [];
  let wireframeMade = false;
  const makeWireframeOverlays = (): void => {
    if (wireframeMade) return;
    wireframeMade = true;
    for (const object of wireframeSources) {
      let overlay: Mesh;
      let instanced = false;
      if (object instanceof InstancedMesh) {
        const instancedOverlay = new InstancedMesh(object.geometry, wireframeMaterial, object.count);
        instancedOverlay.instanceMatrix = object.instanceMatrix;
        instancedOverlay.count = object.count;
        overlay = instancedOverlay;
        instanced = true;
      } else {
        overlay = new Mesh(object.geometry, wireframeMaterial);
      }
      overlay.name = `${object.name} wireframe`;
      overlay.frustumCulled = object.frustumCulled;
      overlay.matrixAutoUpdate = false;
      overlay.matrix.copy(object.matrix);
      overlay.raycast = () => undefined;
      wireframeOverlays.push({ source: object, overlay, instanced });
      group.add(overlay);
      overlay.matrixWorldNeedsUpdate = true;
    }
  };
  const graphUpdates: (() => void)[] = [];
  const qualityNames = worldSamplingNames(map);
  const quality = new WorldTextureSampling(() => { for (const update of graphUpdates) update(); });
  const stopExperimentalUpdates = onExperimentalAssetsChange('map', () => { for (const update of graphUpdates) update(); });
  /** Every drawn object, for `setEngineOrder` and for the visibility switches. */
  const drawn: Drawn[] = [];
  /** The map's grid, cells only: what the engine order walks (`LoadedMap.grid`). */
  const grid = buildGrid(map.grid, [], [], []);
  /** The camera's cell the engine order was last computed for; -1 when it is stale. */
  let orderCell = -1;
  /** Where `frame` last saw the camera, in the group's frame, so switching the order on can order at once. */
  const lastCamera = { x: 0, y: 0, z: 0, seen: false };
  /** Whether a draw draws under the switches, Geometry aside (`setGeometry` hides it, never its wireframe overlay). */
  const shownOf = (d: Drawn): boolean => (!d.off || alternateOn) && !d.cut && (!d.shadow || shadowsOn)
    && (!d.line || (lineStripsOn && !wireframeOn)) && (d.lod === null || d.lod.visible);
  const syncWireframeOverlays = (): void => {
    for (const { source, overlay, instanced } of wireframeOverlays) {
      // Whether its source would draw, Geometry aside (`shownOf`): Geometry off hides the source, never its overlay.
      const d = drawnByObject.get(source);
      const sourceShown = d ? shownOf(d) : source.visible;
      overlay.visible = wireframeOn && sourceShown && source.parent !== null;   // a source not yet revealed: none
      if (instanced || source.matrixAutoUpdate) {
        if (source.matrixAutoUpdate) source.updateMatrix();
        overlay.matrix.copy(source.matrix);
        overlay.matrixWorldNeedsUpdate = true;
      }
      overlay.renderOrder = source.renderOrder + 0.001;
    }
  };
  const refreshVisibility = (): void => {
    for (const d of drawn) d.object.visible = geometryOn && shownOf(d);
    syncWireframeOverlays();
    for (const put of instancePuts) put();
  };
  /**
   * MAP-02: what `setNodeActive` reaches -- one entry per drawn placement (`key`), at its node's `path`: a mesh's
   * `Drawn.off`, or an instance's own hidden flag.
   */
  const switchable: { key: string; path: string; setOff: (off: boolean) => void; setCut: (cut: boolean) => void }[] = [];
  /** Each instanced draw's members put again when its hidden set or `setAlternate` changed (a dirty flag a draw). */
  const instancePuts: (() => void)[] = [];
  /** The scrolling materials beside their offsets, advanced every frame. */
  const scrolling: { offset: ReturnType<typeof vec2Uniform>; du: number; dv: number }[] = [];
  // Every drawn part beside the buffer its lit colours go into, so a rig change can rewrite them in place (a packed
  // attribute, or CPS H12's interleaved colour slots: `colourSlotsOf`).
  const lit: { part: Lightable; attribute: BufferAttribute | InterleavedBufferAttribute }[] = [];
  const relight = (part: Lightable, attribute: BufferAttribute | InterleavedBufferAttribute): void => {
    const slots = colourSlotsOf(attribute);
    applyLighting(unlitOn ? { ...part, lit: false } : part, unlitOn ? { ...lighting, rigEverywhere: false } : lighting, slots.array, slots.stride, slots.offset);
    attribute.needsUpdate = true;
  };
  /** How many drawn objects have no texture: the number the status line reports. */
  let untexturedDraws = 0;
  let triangles = 0;

  /**
   * The shading, as the GS does it, in four node graphs shared by every material (a shared graph is one
   * compiled program, not one per texture):
   *
   * - **MODULATE, then clamp, then brighten.** `(texel * vertex) >> 7`, the product clamped to 255 by
   *   `COLCLAMP` before the fog is mixed in -- so the clamp is here, ahead of the fog three applies to
   *   the output, and the post-process's `1 + FIX/128` comes after it as a uniform. Alpha is the same
   *   product, clamped, and is not brightened.
   * - The untextured variant of the same: the vertex colour alone.
   * - **The destination brighten**, `(Cd - 0) * As + Cd`: the source colour is never read, so the shader
   *   emits `As` in every channel for the `Cs * Cd + Cd` blend to multiply with (`./materialSpec`).
   * - **Magenta**, flat, for the untextured highlight.
   */
  // The frame-wide uniforms sit in three's render group, not the per-object default (CPS H9, 2026-11-03: per-object
  // compares 0.7 ms and uploads 0.8 ms a frame across ~550 draws; a render-group uniform is compared once a render). A
  // browser adaptation on the CPU side only: the same values through the same arithmetic. The per-object ones
  // (`fadeOpacity`, the detail range) and the per-material ones (a scroll's offset, a detail pass's uv scale) stay.
  const brighten = uniform(brightenOf(lighting)).setName('worldBrighten').setGroup(renderGroup);
  const vec2Uniform = (x: number, y: number) => uniform(new Vector2(x, y));
  // The typings do not know a material reference to a texture is a vec4, which is what the sampler yields.
  const texel = materialReference('map', 'texture') as unknown as Node<'vec4'>;
  // The lit colour through the night vision's command 0x5c while the goggles are on (`./nightVision`), before the GS.
  const lane = nightLit(vertexColor());
  const modulated = vec4(texel.mul(lane)).clamp(0, 1);
  const plain = vec4(lane).clamp(0, 1);
  // The characters' shadow (`./charShadow`, VU1 0x3c): black, source-alpha over the receiver, `Cd * (1 - a)`.
  const unshadowed = float(1).sub(shadowFactor());
  const SHADED: ColorNode = vec4(modulated.rgb.mul(brighten).mul(unshadowed), modulated.a);
  const SHADED_PLAIN: ColorNode = vec4(plain.rgb.mul(brighten).mul(unshadowed), plain.a);
  const SHADED_SELF: ColorNode = vec4(modulated.rgb.mul(brighten), modulated.a);
  const SHADED_PLAIN_SELF: ColorNode = vec4(plain.rgb.mul(brighten), plain.a);
  const CARRIER: ColorNode = vec4(modulated.a, modulated.a, modulated.a, modulated.a);
  const CARRIER_PLAIN: ColorNode = vec4(plain.a, plain.a, plain.a, plain.a);
  /** The colour an untextured mesh takes when the highlight is on: nothing in the game is this. */
  const MAGENTA: ColorNode = vec4(1, 0, 1, 1);

  // LOD fades (W1.3). `CVisual::DrawLOD` scales a LOD copy's opacity across its fades (`lodOpacity`,
  // reCOM `zVisual/vis_main.cpp:305-317`), and the engine draws a copy at 1 in place and one below it in
  // its alpha pass (`zRender/zrndr_pipe.cpp:344-364`). The copies share their texture's material, so the
  // opacity is not a material property: it is one uniform three refreshes per object as it draws it --
  // `uniform()` lives in the object group, whose bindings three clones per render object, and
  // `onObjectUpdate` reads the drawn object's own value -- and it sits only in the graph of a *fading
  // twin*, one per shared material, made the first time a copy drawn with it fades. At rest a copy is
  // drawn with its shared material, so its draw state is `materialSpec`'s and nothing else (`./lodFade`).
  // Cloning a material per copy would have cost a material per placement and a spec to keep in step on
  // each; an instance attribute would have needed the copies instanced, and each is its own mesh.
  const lodOpacityOf = new WeakMap<Object3D, number>();
  // PB-9b (`setNodeOpacity`, BASE_PULSE_DRAW_READING): a scene node's own opacity, times the LOD's, through the same twin.
  const nodeOpacityOf = new WeakMap<Object3D, number>();
  const opacityOf = (object: Object3D): number => (lodOpacityOf.get(object) ?? 1) * (nodeOpacityOf.get(object) ?? 1);
  const fadeOpacity = uniform(1).setName('lodFadeOpacity')
    .onObjectUpdate(({ object }) => (object ? opacityOf(object) : 1));
  const fades = new Map<Basic, MeshBasicNodeMaterial>();
  /** The shared material, with what it was built from, that a LOD copy is drawn with at rest. */
  const lodRest = new WeakMap<Object3D, Built>();
  /** Puts a fading twin in step with its shared material, as `apply` has just left that. */
  const applyFade = (b: Built, twin: MeshBasicNodeMaterial): void => {
    const fade = fadeMaterial(materialSpec(b.flags, b.fog, blendGraded, b.cull, undefined, b.vertexAlpha), b.shadow);
    const shared = b.material;
    // What `apply` chose -- shaded, carrier, scroll or magenta -- each built as a `vec4` above.
    const base = (shared.colorNode ?? SHADED) as Node<'vec4'>;
    twin.map = shared.map;
    twin.vertexColors = false;
    twin.colorNode = fade.mode === 'solid' ? vec4(base.rgb, fadeOpacity)
      : fade.mode === 'carrier' ? vec4(base.rgb.mul(fadeOpacity), base.a)
      : vec4(base.rgb, base.a.mul(fadeOpacity));
    twin.maskNode = fade.mask > 0 ? base.a.greaterThan(fade.mask) : null;
    twin.alphaTest = 0;                                  // the mask tests the unfaded alpha instead
    twin.transparent = fade.state.transparent;
    twin.depthWrite = fade.state.depthWrite;
    Object.assign(twin, blendFactorsFor(fade.state.factors));
    twin.polygonOffset = shared.polygonOffset;
    twin.polygonOffsetFactor = shared.polygonOffsetFactor;
    twin.polygonOffsetUnits = shared.polygonOffsetUnits;
    twin.side = shared.side;
    twin.fog = shared.fog;
    twin.wireframe = shared instanceof MeshBasicNodeMaterial && shared.wireframe;
    twin.needsUpdate = true;
  };
  /** Draws a LOD copy at `opacity`: with its shared material at rest (and hidden), its twin while fading. */
  const fadeTo = (object: Object3D, opacity: number): void => {
    if (!lodRest.has(object) || !(object instanceof Mesh)) return;
    lodOpacityOf.set(object, opacity);
    drawFaded(object);
  };
  /**
   * A mesh drawn at its opacity now (`opacityOf`): its twin while under 1 -- and above 0, or at a node opacity (PB-9b:
   * a node the program fades to 0 draws nothing rather than its rest) -- else its shared material.
   */
  const drawFaded = (object: Object3D): void => {
    const rest = lodRest.get(object);
    if (!rest || !(object instanceof Mesh)) return;
    const opacity = opacityOf(object);
    let want: Basic = rest.material;
    if (fadePhase(opacity) === 'fading' || (opacity <= 0 && nodeOpacityOf.has(object))) {
      let twin = fades.get(rest.material);
      if (!twin) {
        twin = new MeshBasicNodeMaterial();
        twin.name = 'lod fade';
        fades.set(rest.material, twin);
        applyFade(rest, twin);
      }
      want = twin;
    }
    if (object.material !== want) object.material = want;
  };

  /** Puts a spec on a material: the shading graph, the blend, the test, the depth write, the cull and the fog. */
  const apply = (b: Built): void => {
    const spec = materialSpec(b.flags, b.fog, blendGraded, b.cull, undefined, b.vertexAlpha);
    // A shadow is a decal: blended over whatever is under it, after the world, writing no depth, and
    // never in the engine order's opaque list, where a quad drawn before its ground would show the sky through.
    // NU-15 B1 (research 330 R330.1, B1): the walk's draws -- the world's and the props' (`receive`; not the held
    // weapon's or a grenade's) -- write depth under every blend in either order: `RenderWorld` opens with
    // `FUN_003b7150(0)` (D:L236792), `ZBUF_1.ZMSK` 0 for the whole walk (`FUN_003afe70` D:L304682-304710). Three's order
    // keeps the transparent list and the walk's order (`restOrder`). Was `drawState(spec, engineOn)` alone, no depth
    // under a blend in three's order, so the env pass showed through FISH HOOK's blended slopes (NU.R7). The LOD fade
    // twins keep `drawState`'s no-depth state (`./lodFade`); `THREE_ORDER_WALK_HOLES_READING` (research 330 §6).
    const state = b.shadow
      ? { transparent: true, depthWrite: false, factors: { src: 'srcAlpha' as const, dst: 'oneMinusSrcAlpha' as const } }
      : b.alphaPass ? alphaPassState(spec, engineOn)   // the pass writes no depth (ZMSK = 1, `FUN_003b7150(1)`)
      : b.receive ? { ...drawState(spec, engineOn), depthWrite: true } : drawState(spec, engineOn);
    const { material } = b;
    const carrier = spec.blend === 'destination';
    material.polygonOffset = b.shadow;                  // off the ground it lies on, so it cannot z-fight it
    material.polygonOffsetFactor = b.shadow ? -1 : 0;
    material.polygonOffsetUnits = b.shadow ? -1 : 0;
    // Textures shown: the game's own expression, node for node. Hidden (the Forge's Draw menu): every sample dropped,
    // a scrolling one's too.
    const hasTexture = texturedOn && b.textured;
    material.colorNode = highlight && !hasTexture ? MAGENTA
      : carrier ? (hasTexture ? CARRIER : CARRIER_PLAIN)
      : (texturedOn ? b.scrollNode : undefined) ?? (b.receive ? (hasTexture ? SHADED : SHADED_PLAIN) : (hasTexture ? SHADED_SELF : SHADED_PLAIN_SELF));
    material.transparent = state.transparent;
    material.depthWrite = state.depthWrite;
    Object.assign(material, blendFactorsFor(state.factors));
    material.alphaTest = spec.alphaTest;
    // A shadow decal has no back to cull: its quad carries the cull flag like the prop it belongs to,
    // and culled by its winding it vanished from above, which is the only place it is ever seen from.
    material.side = spec.cull && !b.shadow ? FrontSide : DoubleSide;
    // A destination brighten reads only `As`, which the GS does not fog; fogging the carrier would fog it.
    material.fog = spec.fog && !carrier;
    material.needsUpdate = true;
    const twin = fades.get(material);                    // a LOD fade's twin follows every change (W1.3)
    if (twin) applyFade(b, twin);
  };

  /**
   * One material per (texture, fog, kind). The texture's own state block -- blend, alpha test, wrap,
   * filtering (`./materialSpec`) -- is the same for every draw of it; what varies per packet is the
   * `PRIM.FGE` fog bit, so a sky texture drawn fogged in one chunk and clear in another gets two -- and
   * whether the packet's vertices carry an alpha ramp (`vertexAlpha`), which makes a solid texture's
   * draw blend (research 82 round 5), so Vigilance's grass gets an opaque material and a blended one --
   * and whether the draw is the alpha pass's (`alphaPass`), which writes no depth: the same texture can
   * be drawn in the walk and in the pass.
   */
  const materialCache = new Map<string, Basic>();
  const materialFor = (name: string | null, fog: boolean, kind: 'mesh' | 'line', cull: boolean, scroll: [number, number] | null = null, receive = true, vertexAlpha = false, alphaPass = false): Basic => {
    const cacheKey = `${kind}|${name ?? ''}|${fog ? 1 : 0}|${cull ? 1 : 0}|${scroll ? `${scroll[0]},${scroll[1]}` : ''}|${receive ? 'r' : ''}|${vertexAlpha ? 'v' : ''}|${alphaPass ? 'a' : ''}`;
    const cached = materialCache.get(cacheKey);
    if (cached) return cached;
    const rgba = name === null ? undefined : map.textures[name];
    const flags = name === null ? undefined : map.textureFlags[name];
    const spec = materialSpec(flags, fog, blendGraded, cull, undefined, vertexAlpha);
    let texture = name === null ? undefined : textures.get(name);
    if (!texture && name !== null && rgba) {
      texture = makeTexture(rgba, spec, map.textureMips?.[name]);
      textures.set(name, texture);
    }
    // Backface culling is the visual's own flag on the disc (`VISUAL_FLAG_CULL`, `@s2u/scene`).
    //
    // SEMANTICS section 6: the right-handed cross product of a triangle's edges in index order *is*
    // the stored face normal, on all 8,764 non-degenerate Frostfire triangles, and VU1's cull handler
    // (`0x06`, research/13 section 4.2) keeps a triangle when the eye is on that side. So
    // counter-clockwise is front, which is three.js's default, and `FrontSide` is what the hardware
    // does -- for the visuals whose command list contains the cull, which the EE emits when bit 3 of
    // the visual's `vparams` is set (`FUN_003b5f20`, `flags & 8`). The flag is clear on exactly the
    // things drawn from both sides: Frostfire's ladders, whose rungs used to vanish from behind under
    // the old rule (cull where the texture is solid), grates, fan blades, Bitter Jungle's foliage,
    // Desert Glory's grass, rugs, the glow quads; and set on the solid objects, Crossroads' awning
    // included -- two coincident single-sided sheets that plaid when drawn double-sided.
    // IP5 (`./worldInstancing`, a renderer-internal adaptation): a mesh material's instanced draws share their programs.
    const material: Basic = kind === 'mesh' ? new WorldMeshMaterial() : new LineBasicNodeMaterial();
    material.map = texture ?? null;
    material.vertexColors = false;                     // the shading graph reads the attribute itself
    const entry: Built = { material, flags, fog, textured: !!texture, cull, shadow: name !== null && SHADOW_TEXTURE.test(name), scrollNode: null, receive, vertexAlpha, alphaPass };
    const mip = gsMipLod(flags?.gs);
    if (texture && mip && name && qualityNames.has(name) && kind === 'mesh') quality.add(texture);
    if (texture && (scroll || mip)) {
      // A scrolling texture gets a graph of its own: the same modulate, with the uv pushed along by an
      // offset that `frame` advances. So does a mipmapped one, whose level is the GS's, off the depth
      // (`gsTexel`). One program each, a handful per map at most.
      let at: Node<'vec2'> = uv();
      if (scroll) {
        const offset = vec2Uniform(0, 0);
        at = at.add(offset);
        scrolling.push({ offset, du: scroll[0], dv: scroll[1] });
      }
      const variants = new Map<number, ColorNode>();
      const graph = (): ColorNode => {
        const key = (mip && experimentalAssets.mipOn ? 1 : 0) + quality.key(texture!) * 2;
        let colour = variants.get(key);
        if (!colour) {
          const moved = vec4((quality.sample(texture!, at) ?? gsTexel(texture!, at, mip)).mul(nightLit(vertexColor()))).clamp(0, 1);
          colour = vec4(moved.rgb.mul(brighten).mul(receive ? unshadowed : float(1)), moved.a);
          variants.set(key, colour);
        }
        return colour;
      };
      entry.scrollNode = graph();
      if (mip) graphUpdates.push(() => {
        const next = graph();
        if (next !== entry.scrollNode) { entry.scrollNode = next; apply(entry); }
      });
    }
    apply(entry);
    built.push(entry);
    materialCache.set(cacheKey, material);
    return material;
  };

  /**
   * The detail pass (W1.6). For every draw whose texture binds a detail record (`LoadedMap.detail`), a
   * second mesh over the same geometry -- a child of the base, so it moves, instances and hides with it --
   * drawn with the detail texture. What the console did (SEMANTICS §7, §11.6): VU1's `0x30`/`0x32` kick
   * the pass's GS state, multiply the staging `S`,`T` by the record's `uv` and re-run the draw handler over
   * the same vertices, colours and `PRIM`. So the graph is the base's modulate on a scaled uv, the fog bit
   * and the cull are the base's, and the blend is the record's (`detailDrawState`).
   *
   * One material and one graph per bound (texture, fog, cull), as the scrolling textures have: the scale
   * and the gate are uniforms, so the passes share a program. A few per map, twelve at most (MP53).
   *
   * **The gate** (PF-30, ruling PF.R50; `DETAIL_SWITCH_READING`): the pass is on or off for a whole visual -- its
   * centroid's range squared, over the magnification (`rangeSqScale`), `<=` the visual's range (`FUN_003374c0`
   * D:L235405-235418) -- with no fade. The centroid is the `detailCentroid` attribute (not `centroid`, a GLSL ES 3.0
   * keyword): per vertex on a world draw (each merged visual's own, `MeshData.centroids`) and on a prop's single mesh
   * (its visual's, in model space), per instance on an instanced prop (each placement's, in the group's frame;
   * `InstancedMesh`'s own matrix is the identity). Either way `modelViewMatrix` takes it to the eye, and the switch is
   * made per vertex on a per-visual point, so every fragment of a visual agrees. A visual whose `vparams` lacks bit 14
   * (`LoadedMesh.detailOn` false, `DETAIL_BIT14_READING`) gets no pass at all.
   * The facades take none (no facade is drawn with a bound texture) and nor do the line strips: the two
   * handlers re-run the triangle draw handlers `0x1780`/`0x1a78` (research 13 §4.8), and the two strip
   * groups that cite a bound texture (MP11's `ground.tif`, MP61's `wall_white.tif`) are one pixel wide.
   */
  let detailOn = true;
  const detailMaterials = new Map<string, { material: MeshBasicNodeMaterial; flags: TextureFlags | undefined; fog: boolean; cull: boolean; vertexAlpha: boolean; spec: DetailSpec }>();
  /**
   * The render view's range² factor on the GPU (PF-29, ruling PF.R49; PF-30): `1 / view.magnification`,
   * `LOD_SCALE_READING`'s range² / m, on the detail gate's centroid range². Written by `frame`; one uniform for every
   * detail graph.
   */
  // Render group (CPS H9, 2026-11-03: a render-group uniform is compared once a render, not once a draw; a browser
  // adaptation on the CPU side only).
  const rangeSqScale = uniform(1).setName('detailRangeSqScale').setGroup(renderGroup);
  /**
   * PF.R60 (`./detailDistance`): the detail distance factor squared, on every pass's range uniform in both of
   * `detailColor`'s branches -- a browser adaptation laid over the original's gate; 1 (the original) by default.
   */
  let detailDistance = 1;
  let detailDistanceSq = 1;
  /** PF-30: each detail pass's gate range squared -- its visual's own (`LoadedMesh.detailRange`) or its record's. */
  const detailRangeOf = new WeakMap<Object3D, number>();
  /** PF-30: an instanced prop's per-placement centroid refresh, run whenever a placement's matrix is put. */
  const centroidRefresh = new WeakMap<Object3D, (i: number) => void>();
  /** Each detail pass beside the draw it lies on, whose place in the order it follows. */
  const details: { mesh: Mesh; base: Object3D }[] = [];
  /**
   * The pass's colour: `clamp(texel(uv * scale) * vertex)`, brightened; its alpha times the gate, 1 or 0 for the whole
   * visual (`detailSwitch`'s rule). The gate's two uniforms ride `material.userData.detailGate` for the tests.
   */
  const detailColor = (texture: Texture, spec: DetailSpec, material: MeshBasicNodeMaterial): ColorNode => {
    const scale = uniform(spec.scale).setName('detailUvScale');
    const range = uniform(spec.range).setName('detailRange');
    // The visual's range is the disc's (PF-30); the detail distance (PF.R60, an adaptation) scales it by factor²,
    // and the Experimental view's own Distance stacks on top.
    if (experimentalAssets.detailOn) range.onObjectUpdate(({ object }) => (object ? detailRangeOf.get(object) ?? spec.range : spec.range) * detailDistanceSq * experimentalAssets.detailRangeSq);
    else range.onObjectUpdate(({ object }) => (object ? detailRangeOf.get(object) ?? spec.range : spec.range) * detailDistanceSq);
    // The GS picks the detail's level off the depth as it does the base's; the uv scale does not enter it.
    const texel = vec4(gsTexel(texture, uv().mul(scale), gsMipLod(map.textureFlags[spec.texture]?.gs)).mul(nightLit(vertexColor()))).clamp(0, 1);
    // The visual's centroid at the eye, its range squared over the magnification (`rangeSqScale`, set by `frame`), `<=`
    // the visual's range: `FUN_003374c0` D:L235405-235418. Per vertex, on a point every vertex of the visual shares.
    const centroid = modelViewMatrix.mul(vec4(attribute('detailCentroid', 'vec3'), 1)).xyz;
    const on = varying(select(centroid.dot(centroid).mul(rangeSqScale).lessThanEqual(range), float(1), float(0)));
    material.userData.detailGate = { rangeSqScale, range };
    const alpha = texel.a.mul(on);
    return vec4(texel.rgb.mul(brighten).mul(unshadowed), experimentalAssets.detailOn ? alpha.mul(experimentalAssets.detailStrength).clamp(0, 1) : alpha);
  };
  /** Puts a detail pass's state on its material: its list follows its base's, which the two switches move. */
  const applyDetail = (entry: { material: MeshBasicNodeMaterial; flags: TextureFlags | undefined; fog: boolean; cull: boolean; vertexAlpha: boolean; spec: DetailSpec }): void => {
    const state = detailDrawState(entry.spec, drawState(materialSpec(entry.flags, entry.fog, blendGraded, entry.cull, undefined, entry.vertexAlpha), engineOn));
    const { material } = entry;
    material.transparent = state.transparent;
    material.depthWrite = state.depthWrite;
    material.depthFunc = LessEqualDepth;
    Object.assign(material, blendFactorsFor(state.factors));
    material.side = entry.spec.cull ? FrontSide : DoubleSide;
    material.fog = entry.spec.fog;
    material.needsUpdate = true;
  };
  const detailMaterialFor = (base: string, fog: boolean, cull: boolean, vertexAlpha: boolean): MeshBasicNodeMaterial | null => {
    const key = `${base}|${fog ? 1 : 0}|${cull ? 1 : 0}|${vertexAlpha ? 'v' : ''}`;
    const cached = detailMaterials.get(key);
    if (cached) return cached.material;
    const flags = map.textureFlags[base];
    const spec = materialSpec(flags, fog, blendGraded, cull, map.detail[base], vertexAlpha).detail;
    const rgba = spec ? map.textures[spec.texture] : undefined;
    if (!spec || !rgba) return null;
    let texture = textures.get(spec.texture);
    if (!texture) {
      // A detail texture's own `CLAMP_1` is REPEAT on both axes on all 65 detail records whose texture is
      // on the disc; 62 of them ask `TEX1` for the mipmaps the minification at `uv` times needs.
      texture = makeTexture(rgba, { ...materialSpec(map.textureFlags[spec.texture], fog, true, false), wrapS: 'repeat', wrapT: 'repeat' },
        map.textureMips?.[spec.texture]);
      textures.set(spec.texture, texture);
    }
    const material = new WorldMeshMaterial();          // IP5: an instanced prop's pass shares its program
    material.vertexColors = false;                     // the graph reads the attribute itself
    const variants = new Map<number, {colour: ColorNode; gate: unknown}>();
    const graph = (): ColorNode => {
      const key = (experimentalAssets.mipOn ? 1 : 0) + (experimentalAssets.detailOn ? 2 : 0);
      let variant = variants.get(key);
      if (!variant) {
        const colour = detailColor(texture!, spec, material);
        variant = {colour, gate: material.userData.detailGate}; variants.set(key, variant);
      }
      material.userData.detailGate = variant.gate;
      return variant.colour;
    };
    material.colorNode = graph();
    graphUpdates.push(() => {
      const next = graph();
      if (next !== material.colorNode) { material.colorNode = next; material.needsUpdate = true; }
    });
    const entry = { material, flags, fog, cull, vertexAlpha, spec };
    applyDetail(entry);
    detailMaterials.set(key, entry);
    return material;
  };
  const refreshDetail = (): void => {
    for (const d of details) d.mesh.visible = detailOn && !wireframeOn && geometryOn;
    for (const e of envPasses) e.mesh.visible = envOn && !wireframeOn && geometryOn;
  };

  /**
   * The environment-map pass (VU1 `0x34`/`0x36`, research 15 §6; `envVertex` in `./materialSpec` is its CPU twin):
   * over every draw whose visual names a reflection material (`LoadedMesh.reflect`), a second mesh on the same geometry
   * with the material's texture sampled at the sphere-map `st` of the reflection off the vertex's normal, coloured by
   * the material's base colour and faded by `(1 + a) * vertex alpha * rim` -- a faint sky on Blood Lake's, Fish Hook's
   * and Enowapi's water, the clouds on Sujo's glass. Computed per vertex, as the VU does, and interpolated. Its
   * `ALPHA` and `TEX1` are the texture's own (source-alpha, bilinear on all of them), it depth-tests less-or-equal
   * against its base (`TEST` GEQUAL on the console's Z16S) and writes none, fogged as its base is.
   */
  let envOn = true;
  const envPasses: { mesh: Mesh; base: Object3D }[] = [];
  const envMaterials = new Map<string, MeshBasicNodeMaterial>();
  const envByPalette = new Map((map.envMaterials ?? []).map((e) => [e.index + 1, e]));
  const envMaterialFor = (index: number, fog: boolean, cull: boolean): MeshBasicNodeMaterial | null => {
    const key = `${index}|${fog ? 1 : 0}|${cull ? 1 : 0}`;
    const cached = envMaterials.get(key);
    if (cached) return cached;
    const m = envByPalette.get(index);
    const rgba = m ? map.textures[m.texture] : undefined;
    if (!m || !rgba) return null;
    let texture = textures.get(m.texture);
    if (!texture) {
      texture = makeTexture(rgba, materialSpec(map.textureFlags[m.texture], fog, true, false), map.textureMips?.[m.texture]);
      textures.set(m.texture, texture);
    }
    const V = positionWorld.sub(cameraPosition);
    const R = V.sub(normalWorld.mul(V.dot(normalWorld).mul(2)));
    const turned = vec3(R.z, R.x, R.y);                          // the block's basis rows (0,1,0), (0,0,1), (1,0,0)
    const falls = turned.z.lessThan(0);
    const rim = select(falls, turned.z.add(m.rimOffset).mul(m.rimSlope).max(0), float(1));
    const clamped = vec3(turned.x, turned.y, turned.z.max(0));
    const length = select(falls, clamped.length(), V.length());
    const st = varying(clamped.xy.div(length).mul(m.uvScale).add(0.5));
    const alpha = varying(vertexColor().a.mul((1 + m.rgba[3]) / 128).mul(rim));
    const texel = textureNode(texture, st);
    const colour = texel.rgb.mul(vec3(m.rgba[0] / 128, m.rgba[1] / 128, m.rgba[2] / 128)).clamp(0, 1);
    const material = new WorldMeshMaterial();          // IP5: an instanced prop's pass shares its program
    material.name = `env ${m.texture}`;
    material.vertexColors = false;
    material.colorNode = vec4(colour.mul(brighten).mul(unshadowed), texel.a.mul(alpha).clamp(0, 1));
    material.transparent = true;
    material.depthWrite = false;
    material.depthFunc = LessEqualDepth;
    Object.assign(material, blendFactorsFor({ src: 'srcAlpha', dst: 'oneMinusSrcAlpha' }));
    material.side = cull ? FrontSide : DoubleSide;
    material.fog = fog;
    envMaterials.set(key, material);
    return material;
  };
  const addEnv = (base: Mesh, part: LoadedMesh): void => {
    if (!part.reflect || !part.normals) return;
    const material = envMaterialFor(part.reflect, part.fog, part.cull);
    if (!material) return;
    // The reflection needs the vertex normal the VU reads; the base draws never did. `part` is the chunk as
    // decoded -- a prop's normals in model space, which the instance matrix turns, a world part's already world.
    if (!base.geometry.getAttribute('normal')) base.geometry.setAttribute('normal', new BufferAttribute(part.normals, 3));
    let mesh: Mesh;
    if (base instanceof InstancedMesh) {
      const instanced = new InstancedMesh(base.geometry, material, base.count);
      instanced.instanceMatrix = base.instanceMatrix;
      mesh = instanced;
    } else mesh = new Mesh(base.geometry, material);
    mesh.name = `${base.name} (env)`;
    mesh.frustumCulled = base.frustumCulled;
    mesh.renderOrder = envOrderOf(base);                // the walk's: after the detail pass; the alpha pass's: right after its base (LATER 593)
    mesh.visible = envOn && !wireframeOn && geometryOn;
    base.add(mesh);
    envPasses.push({ mesh, base });
  };
  /**
   * Hangs a detail pass under a queued base draw, when its texture binds one and its visual's `vparams` has bit 14
   * (PF-30: `LoadedMesh.detailOn`, `FUN_003b6e10` D:L308392), with the centroid its gate measures from.
   */
  const addDetail = (base: Mesh, part: LoadedMesh): void => {
    if (part.textureName === null || SHADOW_TEXTURE.test(part.textureName) || !map.detail[part.textureName]) return;
    if (part.detailOn === false) return;
    const material = detailMaterialFor(part.textureName, part.fog, part.cull, part.vertexAlpha === true);
    if (!material) return;
    const geometry = base.geometry;
    let mesh: Mesh;
    if (base instanceof InstancedMesh) {
      const instanced = new InstancedMesh(geometry, material, base.count);
      instanced.instanceMatrix = base.instanceMatrix;       // the same placements, uploaded once
      mesh = instanced;
      // Per placement, in the group's frame: the visual's model-space centroid through each instance's matrix, again
      // whenever a placement is put (a door's swing, a hidden member).
      const centre = new Vector3(...(part.centre ?? centreOf(part)));
      const at = new InstancedBufferAttribute(new Float32Array(base.count * 3), 3);
      const m = new Matrix4(), p = new Vector3();
      const refresh = (i: number): void => {
        base.getMatrixAt(i, m);
        p.copy(centre).applyMatrix4(m);
        at.setXYZ(i, p.x, p.y, p.z);
        at.needsUpdate = true;
      };
      for (let i = 0; i < base.count; i++) refresh(i);
      geometry.setAttribute('detailCentroid', at);
      centroidRefresh.set(base, refresh);
    } else {
      mesh = new Mesh(geometry, material);
      // Per vertex: a world draw's merged visuals each their own (the group's frame), a prop's mesh its one visual's
      // (model space, the mesh's matrix placing it). LOD copies share a geometry and a model-space centroid.
      if (!geometry.getAttribute('detailCentroid')) {
        geometry.setAttribute('detailCentroid', new BufferAttribute(part.centroids ?? centroidsOf(part, part.centre ?? centreOf(part)), 3));
      }
    }
    detailRangeOf.set(mesh, part.detailRange ?? map.detail[part.textureName]!.range);
    mesh.name = `${base.name} (detail)`;
    mesh.frustumCulled = base.frustumCulled;
    mesh.renderOrder = detailRenderOrder(base.renderOrder, true);      // half a step behind the base, whatever list numbered it
    mesh.visible = detailOn && !wireframeOn && geometryOn;
    base.add(mesh);
    details.push({ mesh, base });
  };

  /**
   * Building an object is cheap; *drawing it the first time* is not, because that is when three uploads
   * its texture and geometry and compiles its program. So nothing is added to the group here. Each
   * object becomes a one-line task, and `main.ts` runs those across frames (`./scheduler`), which turns
   * one 1,700 ms frame into a few dozen short ones. The world's tasks come first and are what the first
   * paint waits for; the props follow behind it.
   */
  const revealWorld: (() => void)[] = [];
  const revealProps: (() => void)[] = [];
  const propObjects: Object3D[] = [];
  const worldObjects: Object3D[] = [];
  const box = new Box3();
  /**
   * A draw's `renderOrder` with the engine order off. The engine sorts nothing but its alpha pass: a visual is drawn
   * as the walk reaches it (`CPipe::RenderNode`), so the walk's own order stands, scaled under the detail passes'
   * half step -- it is what keeps a sky dome's fading cap over the ring under it, and a grass overlay over the cobbles
   * it fades onto, where three's back-to-front sort by object centre put them the other way about. The alpha pass is
   * held at 1, after every draw of the walk, where three's own back-to-front sort within it stands in for the console's
   * far-to-near one (`FUN_00336f60`) and is not it: three keys a draw by the clip-space depth of its bounding sphere's
   * centre through `matrixWorld`, the console by the range to the visual's centroid through the matrix it is drawn with
   * (`FUN_003371b0` D:L235314-235317), so the two part where depth and range order two draws otherwise, or a box
   * centre sits off its centroid (FACADES-2's census: 53 of 48,479 overlapping facade camera-pairs, all on MP9's
   * far-tree cards). The engine order keys by the range (`reorderAlphaPass`). The shadows were already there in all
   * but number: a decal over the world.
   */
  const restOrder = (d: Drawn): number => (inAlphaPass(d) ? ALPHA_PASS_REST_ORDER : d.order * REST_WALK_SCALE);
  /**
   * An env pass's `renderOrder` from its base's. A walk draw's goes after the detail pass, after the whole walk in three's
   * order (`ENV_PASS_PLACE_READING`'s NU15-W2, unchanged). An alpha-pass draw's (INV-WATER-LOOK F2) is its base's own
   * number until `frame` numbers the pass, then right after it (`alphaEnvOrder`): the console draws the reflection in
   * the visual's own list, straight after its base (`FUN_003b5b90` D:L307758-307779 via `FUN_003b4580`; research 330
   * §1.2). Was base + 0.75 -- 1.75, after the whole pass and every particle.
   */
  const envOrderOf = (base: Object3D): number => {
    const d = drawnByObject.get(base);
    return d && inAlphaPass(d) && !engineOn ? base.renderOrder : detailRenderOrder(base.renderOrder, true) + 0.25;
  };
  /** An alpha-pass prop placement's key point: the visual's model-space centroid through `m` (LATER 593, F3); else none. */
  const alphaKeyAt = (part: LoadedMesh, m: Matrix4): number[] | null =>
    part.alphaPass && part.centre ? new Vector3(...part.centre).applyMatrix4(m).toArray() : null;
  /** Each drawn object's record, for the passes hung under it (`addDetail`, `addEnv`). */
  const drawnByObject = new WeakMap<Object3D, Drawn>();
  /**
   * Queues an object with its place in the scene walk and its grid cells, and grows the map's extent by it.
   * Its `renderOrder` is `restOrder`'s until the engine order numbers it (`reorder`).
   */
  const later = (
    queue: (() => void)[], object: Object3D, order: number, cells: readonly number[], alternate: boolean,
    texture: string | null, line = false, lod: Drawn['lod'] = null, alphaPass = false, key: readonly number[] | null = null,
  ): void => {
    object.updateWorldMatrix(false, false);
    // An alternate state is not part of the extent the camera frames: it sits where its twin sits.
    if (!alternate) box.expandByObject(object);
    const shadow = texture !== null && SHADOW_TEXTURE.test(texture);
    const c = new Box3().setFromObject(object).getCenter(new Vector3());
    // LATER 593 (F3): the alpha pass keys by the visual's centroid where the caller has it (`Drawn.centre`).
    const centre: [number, number, number] = key ? [key[0]!, key[1]!, key[2]!] : [c.x, c.y, c.z];
    const d: Drawn = { object, order, cells, alternate, off: alternate, shadow, alphaPass, centre, line, lod };
    drawn.push(d);
    drawnByObject.set(object, d);
    object.renderOrder = restOrder(d);
    object.visible = geometryOn && shownOf(d);
    // CPS H13 (`./sceneMatrix`): flagged as it joins the frozen group -- `prepare` may have computed it parked off it.
    if (object instanceof Mesh && !(object instanceof LineSegments)) wireframeSources.push(object);   // its overlay made on demand
    queue.push(() => { group.add(object); object.matrixWorldNeedsUpdate = true; });
    (queue === revealProps ? propObjects : worldObjects).push(object);
  };

  /** MAP-02: a mesh of its own drawn for one placement at `path` (none: not switchable), switched by `Drawn.off`. */
  const switchMesh = (key: string | undefined, path: string | undefined, mesh: Object3D): void => {
    const d = drawnByObject.get(mesh);
    if (key === undefined || path === undefined || !d) return;
    switchable.push({ key, path, setOff: (off) => { d.off = off; }, setCut: (cut) => { d.cut = cut; } });
    // PB-9b (`setNodeOpacity`): a mesh of its own takes its node's opacity through its material's twin.
    if (mesh instanceof Mesh && !(mesh instanceof InstancedMesh)) {
      const rest = lodRest.get(mesh) ?? built.find((b) => b.material === mesh.material);
      if (rest) { lodRest.set(mesh, rest); faded.push({ path, object: mesh }); }
    }
  };
  /** PB-9b: the meshes `setNodeOpacity` reaches, by their node's path. */
  const faded: { path: string; object: Mesh }[] = [];

  for (const part of map.world) {
    const mesh = new Mesh(geometryOf(part, lighting, lit), materialFor(part.textureName, part.fog, 'mesh', part.cull, part.scroll, true, part.vertexAlpha === true, part.alphaPass === true));
    mesh.name = part.textureName ?? 'untextured';
    if (!part.textureName) untexturedDraws++;
    mesh.frustumCulled = false;                           // one mesh spans the whole map; culling it hides it
    later(revealWorld, mesh, part.order, part.cells ?? [], part.alternate, part.textureName, false, null, part.alphaPass === true, part.alphaPass ? part.centre ?? null : null);
    switchMesh(part.switchPath ? `w:${part.switchPath}` : undefined, part.switchPath, mesh);
    // OBF-22: the marks' clip files a mark on it under its switch path (`./markClip`, `lastNodePath`), so `setNodeActive`
    // at or above that path takes the mark (`holdOnNode`). Not `nodePath`: the world chunk is not a placement that moves.
    if (part.switchPath) mesh.userData.switchPath = part.switchPath;
    addDetail(mesh, part);
    addEnv(mesh, part);
    triangles += part.indices.length / 3;
  }

  // Test-room model pack: one GLB where the worker left a level piece out of `map.world` (`worldPieces`). The anchor
  // is that piece's top-level node. Scale, rotation and position are already on the clone, as they are for a prop.
  // No swaps, and this adds nothing: the draws above are the ones this loop has always built. Collision is the map's.
  for (const piece of map.worldSwaps ?? []) {
    if (!hasMappedModel(piece.id)) continue;
    const mesh = cloneMappedModel(piece.id);
    if (!mesh) continue;
    mesh.name = piece.id;
    mesh.applyMatrix4(new Matrix4().fromArray(piece.anchor));
    later(revealWorld, mesh, piece.order, piece.cells, false, null);
  }

  /**
   * DOORS: every prop placement by its node's path, and how to put it at a matrix (`moveNode`); `delta` is the swing it
   * stands at now (the identity on disc). `rider`: a mark hung on the placement (`attachToNode`), not a placement.
   */
  interface Movable { path: string; base: Matrix4; delta: Matrix4; set: (m: Matrix4) => void; rider?: boolean }
  const movable: Movable[] = [];
  /** LATER 277: the marks held on a node, let go when it (or one above it) is switched off (`holdOnNode`). */
  const markHolds: { path: string; gone: () => void }[] = [];
  /** CPS H9 step 1: the objects whose own transform is written after the build, kept auto-updating (`freezeStatic`). */
  const movers = new Set<Object3D>();
  const movableMesh = (path: string | undefined, mesh: Object3D, base: Matrix4): void => {
    if (!path) return;
    movers.add(mesh);
    mesh.userData.nodePath = path;                        // the marks' clip reads it (`./markClip`, `lastNodePath`)
    movable.push({ path, base: base.clone(), delta: new Matrix4(), set: (m) => { m.decompose(mesh.position, mesh.quaternion, mesh.scale); mesh.updateMatrix(); } });
  };
  /** A piece under a hook, `epan_N` or `hcont_N`: drawn on its own and not frustum-culled with a shared instance. */
  const craneRide = (path: string | undefined): boolean => !!path && (map.cranes ?? []).some((spec) => craneRides(spec, path));
  /**
   * A mapped model is one GLB per instance, gathered here and drawn after the loop so every sub-part is seen first.
   * The instance is the scene path through the last `=<model name>` (`worldmodel/door=crate`). A longer path is a
   * piece of that same prop, including the hidden alternate (broken) pieces. With no path, the placement's
   * translation is the instance, so pieces that share a spot still collapse. Two nodes may share that path (the
   * scene names both the same), and each is its own instance: the root of that path nearest the placement. The GLB
   * is anchored on that root's world matrix (`LoadedMap.instanceRoots`), including when the root draws nothing. One
   * root for the path keeps the path alone as the key. A map without those roots falls back to the shown piece
   * closer to that path. A tie keeps the first root in the scene's order (a strict `<`), and there is no distance
   * bound: every piece of the path belongs to some root, and a bound would only leave a hole where the native draw is
   * skipped. `moveNode` and `setNodeActive` reach every clone of a shared path and `attachToNode` binds the first, as
   * the native placements of that path already do.
   */
  interface InstanceRoot { path: string; matrix: Matrix4 }
  const rootsByPath = new Map<string, InstanceRoot[]>();
  for (const root of map.instanceRoots ?? []) {
    const key = root.path.toLowerCase();
    const list = rootsByPath.get(key) ?? [];
    list.push({ path: root.path, matrix: new Matrix4().fromArray(root.matrix) });
    rootsByPath.set(key, list);
  }
  const swapSpots = new Map<string, { key: string; modelName: string; matrix: Matrix4; path?: string; order: number; cells: readonly number[]; alternate: boolean; propIndex: number; place: number; pathLength: number; root?: InstanceRoot }>();
  const instanceKey = (modelName: string, path: string | undefined, matrix: Float32Array, at: number): { key: string; root?: InstanceRoot } => {
    if (path) {
      const lower = path.toLowerCase();
      const mark = `=${modelName.toLowerCase()}`;
      let from = 0;
      let hit = -1;
      while (from < lower.length) {
        const next = lower.indexOf(mark, from);
        if (next < 0) break;
        const end = next + mark.length;
        if (end === lower.length || lower[end] === '/') hit = next;
        from = next + 1;
      }
      const base = hit >= 0 ? lower.slice(0, hit + mark.length) : lower;
      const roots = rootsByPath.get(base);
      if (roots && roots.length > 1) {
        const px = matrix[at + 12] ?? 0, py = matrix[at + 13] ?? 0, pz = matrix[at + 14] ?? 0;
        let best = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let r = 0; r < roots.length; r++) {
          const e = roots[r]!.matrix.elements;
          const dx = px - (e[12] ?? 0), dy = py - (e[13] ?? 0), dz = pz - (e[14] ?? 0);
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) { bestD = d; best = r; }
        }
        return { key: `${base}#${best}`, root: roots[best] };
      }
      return { key: base, root: roots?.[0] };
    }
    return { key: `${modelName.toLowerCase()}@${matrix[at + 12]},${matrix[at + 13]},${matrix[at + 14]}` };
  };
  for (const [propIndex, prop] of map.props.entries()) {
    const count = prop.matrices.length / 16;
    /** A placement's cells; an instanced draw is filed under all of its placements' (`LoadedMesh.cells`). */
    const cellsOf = (i: number): readonly number[] => prop.cells?.[i] ?? [];
    const allCells = [...new Set(prop.cells?.flat() ?? [])];
    // Test-room model pack (`modelPackHook`): a visitor's GLB in place of this prop's mesh. With no pack installed
    // `hasMappedModel` is false and the draw below is the one this loop has always built. Collision is the map's,
    // not this mesh. A facade entry shares the model name (`m_facade` non-zero) but is the flare billboard, not
    // the mesh the pack replaces, so it falls through and is built below.
    if (hasMappedModel(prop.modelName) && prop.facade === 0) {
      for (let i = 0; i < count; i++) {
        const path = prop.paths?.[i];
        const keyed = instanceKey(prop.modelName, path, prop.matrices, i * 16);
        const spot = { key: keyed.key, root: keyed.root, modelName: prop.modelName, matrix: new Matrix4().fromArray(prop.matrices, i * 16), path, order: prop.order, cells: cellsOf(i), alternate: prop.alternate, propIndex, place: i, pathLength: path?.length ?? Number.MAX_SAFE_INTEGER };
        const prev = swapSpots.get(spot.key);
        if (!prev || (prev.alternate !== spot.alternate ? !spot.alternate : spot.pathLength < prev.pathLength)) swapSpots.set(spot.key, spot);
      }
      continue;
    }
    // A world chunk's normals are rotated into world space by `loadMap` before they are lit; a prop's
    // are not, because the rotation lives in the placement matrix instead. Lighting them unrotated
    // would light a turned prop as though it faced the way it was modelled, so they are rotated here
    // by the first placement. A prop drawn in several placements that do not share a rotation is still
    // lit by the first one's: one `InstancedMesh` has one set of vertex colours, and splitting it into
    // a mesh per placement would cost 26 draws to fix a shading error of a few degrees.
    const rotation = new Matrix4().fromArray(prop.matrices, 0);
    for (const part of prop.parts) {
      if (prop.facade !== 0) {
        // A facade node -- a lamp flare, a star, the moon -- is turned to face the camera by the
        // engine every frame: left where it was modelled a flare is edge-on from most of the map and
        // a flat card from the rest. Each placement becomes its own mesh at its node's origin, its
        // geometry in the node's model space, and `frame` turns it about that origin as `FUN_00317fc0`
        // turns the node (`turnFacade`, `./facade`, #291). The visual keeps its own cull bit: the turn
        // puts the camera on the node's -z side, so a culled quad wound to face +z is never seen --
        // Desert Glory's checker cross under the garage's light, Bitter Jungle's far-tree markers.
        // LATER 112: the world model's facade nodes come here too (`loadMap`'s `place`), M72's smoke columns with the texture
        // scroll (`TextureScroll_Object`, `part.scroll`) their merged world draw carried.
        const flareMaterial = materialFor(part.textureName, part.fog, 'mesh', part.cull, part.scroll, true, part.vertexAlpha === true, part.alphaPass === true);
        if (!part.textureName) untexturedDraws += count;
        for (let i = 0; i < count; i++) {
          const m = new Matrix4().fromArray(prop.matrices, i * 16);
          const mesh = new Mesh(geometryOf(rotateNormals(part, m), lighting, lit), flareMaterial);
          mesh.name = `${prop.modelName} (flare)`;
          const pose = { quaternion: new Quaternion(), scale: new Vector3() };
          m.decompose(mesh.position, pose.quaternion, pose.scale);
          later(revealProps, mesh, part.order, cellsOf(i), prop.alternate, part.textureName, false, null, part.alphaPass === true);
          // LATER 114: `frame` lights a part with normals again under the turned ones (`FacadeRelight`); the load's bake
          // above is the pose on disc's. LATER 113: the alpha key from the visual's centroid (`facadeAlphaKey`).
          const relight = part.normals ? new FacadeRelight({ ...part, normals: part.normals }, mesh.geometry.getAttribute('color') as BufferAttribute | InterleavedBufferAttribute) : null;
          billboards.push({ mesh, facade: prop.facade, pose, drawn: drawnByObject.get(mesh)!, centroid: part.centre ?? centreOf(part), relight });
          switchMesh(`${propIndex}:${i}`, prop.paths?.[i], mesh);
          // A crane facade is still turned to the camera in `frame` (quaternion only). The translation has to be a
          // movable, or the panel stays where it was modelled (`CRANE_PANEL_WITH_HOOK_READING`).
          if (craneRide(prop.paths?.[i])) { movableMesh(prop.paths?.[i], mesh, m); mesh.frustumCulled = false; }
        }
        triangles += (part.indices.length / 3) * count;
        continue;
      }
      const geometry = geometryOf(rotateNormals(part, rotation), lighting, lit);
      // F-B (FACADES-2): a prop's texture scroll (`TextureScroll_Object`, `part.scroll`) as a world part's: the skies, the
      // dust and rain that follow, the monitors (180 parts on 8 maps).
      const material = materialFor(part.textureName, part.fog, 'mesh', part.cull, part.scroll, true, part.vertexAlpha === true, part.alphaPass === true);
      if (!part.textureName) untexturedDraws++;
      if (prop.lod) {
        // A model in a LOD band is shown by the camera's range to each placement, so every placement
        // is its own mesh -- there are tens of these per map, not the hundreds instancing is for.
        const rest = built.find((b) => b.material === material);   // what its fading twin is made from
        for (let i = 0; i < count; i++) {
          const mesh = new Mesh(geometry, material);
          mesh.name = `${prop.modelName} (lod)`;
          mesh.userData['forgeBaseProp'] = { prop: propIndex, index: i };
          const m = new Matrix4().fromArray(prop.matrices, i * 16);
          mesh.applyMatrix4(m);
          movableMesh(prop.paths?.[i], mesh, m);
          if (craneRide(prop.paths?.[i])) mesh.frustumCulled = false;
          const at = new Vector3().setFromMatrixPosition(m);
          later(revealProps, mesh, part.order, cellsOf(i), prop.alternate, part.textureName, false, { band: prop.lod, at, visible: lodVisible(prop.lod, 0), last: false }, part.alphaPass === true, alphaKeyAt(part, m));
          switchMesh(`${propIndex}:${i}`, prop.paths?.[i], mesh);
          if (rest) lodRest.set(mesh, rest);
          addDetail(mesh, part);
          addEnv(mesh, part);
        }
        triangles += (part.indices.length / 3) * count;
        continue;
      }
      if (count === 1) {
        const mesh = new Mesh(geometry, material);
        mesh.name = prop.modelName;
        mesh.userData['forgeBaseProp'] = { prop: propIndex, index: 0 };
        mesh.applyMatrix4(new Matrix4().fromArray(prop.matrices, 0));
        movableMesh(prop.paths?.[0], mesh, new Matrix4().fromArray(prop.matrices, 0));
        if (craneRide(prop.paths?.[0])) mesh.frustumCulled = false;
        later(revealProps, mesh, part.order, cellsOf(0), prop.alternate, part.textureName, false, null, part.alphaPass === true, alphaKeyAt(part, new Matrix4().fromArray(prop.matrices, 0)));
        switchMesh(`${propIndex}:0`, prop.paths?.[0], mesh);
        addDetail(mesh, part);
        addEnv(mesh, part);
      } else {
        const mesh = new InstancedMesh(geometry, material, count);
        mesh.name = prop.modelName;
        mesh.userData['forgeBaseProp'] = { prop: propIndex };
        // MAP-02: each member's matrix now and whether the world's state hides it (a hidden one is drawn at the zero
        // matrix, nothing on screen, unless `setAlternate` shows everything); the group starts as `prop.alternate`.
        const now = Array.from({ length: count }, (_, i) => new Matrix4().fromArray(prop.matrices, i * 16));
        const hidden: boolean[] = new Array(count).fill(prop.alternate);
        const cut: boolean[] = new Array(count).fill(false);           // LATER 165 (`setNodeCut`)
        const put = (i: number): void => { mesh.setMatrixAt(i, (hidden[i] && !alternateOn) || cut[i] ? ZERO_MATRIX : now[i]!); centroidRefresh.get(mesh)?.(i); };
        const putAll = (): void => { for (let i = 0; i < count; i++) put(i); mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null; };
        putAll();
        // Put again (and uploaded) only when a member's hidden state or the show-everything view changed since the last
        // put: `refreshVisibility` runs at every LOD band crossing, which changes neither.
        let dirty = false, putWith = alternateOn;
        instancePuts.push(() => { if (!dirty && putWith === alternateOn) return; dirty = false; putWith = alternateOn; putAll(); });
        if (prop.paths) mesh.userData.nodePaths = prop.paths;   // per instance, for the marks' clip (`./markClip`)
        for (let i = 0; i < count; i++) {
          const path = prop.paths?.[i];
          // The detail and env passes share `instanceMatrix` (`addDetail`, `addEnv`): one write moves them too.
          if (path) movable.push({ path, base: new Matrix4().fromArray(prop.matrices, i * 16), delta: new Matrix4(), set: (m) => { now[i]!.copy(m); put(i); mesh.instanceMatrix.needsUpdate = true; mesh.boundingSphere = null; } });
        }
        later(revealProps, mesh, part.order, allCells, prop.alternate, part.textureName, false, null, part.alphaPass === true);
        const drawnMesh = drawnByObject.get(mesh)!;
        for (let i = 0; i < count; i++) {
          const path = prop.paths?.[i];
          if (path) switchable.push({ key: `${propIndex}:${i}`, path, setOff: (off) => { if (hidden[i] !== off) dirty = true; hidden[i] = off; drawnMesh.off = hidden.every(Boolean); }, setCut: (c) => { if (cut[i] !== c) dirty = true; cut[i] = c; } });
        }
        addDetail(mesh, part);
        addEnv(mesh, part);
      }
      triangles += (part.indices.length / 3) * count;
    }
  }
  for (const spot of swapSpots.values()) {
    const mesh = cloneMappedModel(spot.modelName);
    if (!mesh) continue;
    const matrix = spot.root?.matrix ?? spot.matrix;
    const path = spot.root?.path ?? spot.path;
    mesh.name = spot.modelName;
    mesh.traverse((part) => {
      if (part instanceof Mesh) part.userData['forgeBaseProp'] = { prop: spot.propIndex, index: spot.place };
    });
    mesh.applyMatrix4(matrix);
    movableMesh(path, mesh, matrix);
    later(revealProps, mesh, spot.order, spot.cells, spot.alternate, null, false, null, false);
    switchMesh(`${spot.propIndex}:${spot.place}`, path, mesh);
  }

  // Which LOD copy is the last at its spot (`lodIsLast`): the copies of one object share a placement,
  // so the others at a placement are the bands within a stride of it. Tens of placements, once.
  {
    const lodDrawn = drawn.filter((d): d is Drawn & { lod: NonNullable<Drawn['lod']> } => d.lod !== null);
    for (const d of lodDrawn) {
      const bandsHere: LodBand[] = [];
      for (const o of lodDrawn) if (o !== d && o.lod.at.distanceToSquared(d.lod.at) < LOD_SAME_SPOT_SQ) bandsHere.push(o.lod.band);
      d.lod.last = lodIsLast(d.lod.band, bandsHere);
    }
  }

  /**
   * FG-32 (the forge's hide, a browser adaptation): a prop placement's strips in the line groups, by its place in the walk
   * (`LoadedLineGroup.spans`): `saved` holds the points while `setPlacementActive` has them collapsed onto the span's first.
   */
  const lineSpans = new Map<number, { position: BufferAttribute; first: number; count: number; saved: Float32Array | null }[]>();
  // The GS LINE_STRIP geometry (SEMANTICS section 12): power lines, lamp brackets, guy ropes, light
  // filaments. The hardware draws these one pixel wide at any distance, textured (`TME`) along the
  // strip with uvs that run well outside 0..1, gouraud, fogged and blended -- `PRIM = IIP|TME|FGE|ABE`
  // on all 194 packets. A `LineSegments` per (texture, fog) with the same shading graph the meshes use
  // draws exactly that: the texture repeats along the rope, and the vertex colour shades it.
  for (const strip of map.lines ?? []) {
    const geometry = new BufferGeometry();
    // FG-32: a group holding props' strips gets its own copy of the points, so a hidden placement's collapse
    // (`setPlacementActive`) writes this view's and never the loaded map's.
    const position = new BufferAttribute(strip.spans ? strip.positions.slice() : strip.positions, 3);
    geometry.setAttribute('position', position);
    for (const s of strip.spans ?? []) {
      const list = lineSpans.get(s.walk) ?? [];
      list.push({ position, first: s.first, count: s.count, saved: null });
      lineSpans.set(s.walk, list);
    }
    geometry.setAttribute('uv', new BufferAttribute(strip.uvs, 2));
    const colors = new Float32Array(strip.colors.length);
    const part: Lightable = { colors: strip.colors, normals: strip.normals, lit: false };
    applyLighting(part, lighting, colors);
    const attribute = new BufferAttribute(colors, 4);
    geometry.setAttribute('color', attribute);
    lit.push({ part, attribute });
    const segments = new LineSegments(geometry, materialFor(strip.textureName, strip.fog, 'line', false));
    segments.name = `line strips (${strip.textureName ?? 'untextured'})`;
    segments.frustumCulled = false;
    if (!strip.textureName) untexturedDraws++;
    lineObjects.push(segments);
    // LATER 120: one placement's strips under a facade turn, in its model space: put at its pose on disc, then turned by
    // `frame` about its origin as the facade meshes are (`billboards`). Its points are never re-lit (`lit` false above).
    const pose = strip.turn ? { quaternion: new Quaternion(), scale: new Vector3() } : null;
    if (strip.turn && pose) {
      new Matrix4().fromArray(strip.turn.matrix).decompose(segments.position, pose.quaternion, pose.scale);
      segments.quaternion.copy(pose.quaternion);
      segments.scale.copy(pose.scale);
      segments.updateMatrix();   // `lineGroups()` reads the placed matrix before any frame
    }
    // `later` files the object in `drawnByObject` (its `Drawn`), so the push after it always finds one.
    later(revealProps, segments, strip.order, strip.cells ?? [], false, null, true);
    if (strip.turn && pose) billboards.push({ mesh: segments, facade: strip.turn.facade, pose, drawn: drawnByObject.get(segments)!, centroid: [0, 0, 0], relight: null });
  }

  /**
   * CPS H9 step 1, 2026-11-03: three recomposed every static matrix each frame, 0.66 ms of the owner's PC's frame (16-seat
   * live Frostfire, CDP profile: `scene.updateMatrixWorld()` in the main render; `Object3D.updateMatrixWorld`, `updateMatrix`
   * and `Matrix4.compose` in the Drawing category's top self-time). Every object the group holds is final by here, so a
   * static one has its local matrix composed once and `matrixAutoUpdate` turned off: three's walk skips its `compose`. A
   * CPU-side browser adaptation: the matrices are the very ones the per-frame compose made, so the picture is unchanged.
   * `matrixWorldAutoUpdate` is left on, so the walk still reaches and multiplies every object (a mover under a static one
   * moves). What keeps auto-updating, its own transform written after the build: the facades and turned strips (`frame`'s
   * `turnFacade`, `setBillboards`), and every placement `moveNode` / `spinLocalX` reaches (`movableMesh`: doors, gates,
   * cranes, turrets, every pathed placement). An instanced draw's placements move in `instanceMatrix`, never its own
   * transform, and a mover's detail and env passes hang at the identity under it, so those are frozen. An object already
   * off (a pack's node with its own matrix) is left as it is.
   */
  for (const b of billboards) movers.add(b.mesh);
  const freezeStatic = (o: Object3D): void => {
    if (movers.has(o) || !o.matrixAutoUpdate) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  };
  for (const object of [...worldObjects, ...propObjects]) object.traverse(freezeStatic);
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  group.updateMatrixWorld(true);

  // W2.4: the held weapon, built like a prop placed once -- the world's materials, lit by the map's rig -- but kept
  // out of `group`, the reveal queues, the extent and the triangle count: it belongs to the player, not the map,
  // and `./shot` moves it every frame. Its normals are lit in the weapon's own frame, not re-lit as it turns.
  // Every weapon as the rifle always was: the world's materials, no world shadow received (the hand's, as the grenade).
  const heldBuilt = new Map<string, Group | null>();
  const held = (model: string): Group | null => {
    if (heldBuilt.has(model)) return heldBuilt.get(model)!;
    const data = map.weapons?.[model];
    let g: Group | null = null;
    if (data) {
      g = new Group();
      g.name = data.name;
      // The same pack as a prop (`hasMappedModel`). The weapon's points stay `data.points`; this is the drawn mesh.
      const swapped = cloneMappedModel(data.name) ?? (model !== data.name ? cloneMappedModel(model) : null);
      if (swapped) g.add(swapped);
      else for (const part of data.parts) {
        const mesh = new Mesh(geometryOf(part, lighting, lit), materialFor(part.textureName, part.fog, 'mesh', part.cull, null, false));
        mesh.name = `${data.name} (${part.textureName ?? 'untextured'})`;
        if (part.node) mesh.userData.node = part.node;   // the kit's scope swap finds it (`./sights` `showScopeNodes`)
        g.add(mesh);
      }
    }
    heldBuilt.set(model, g);
    return g;
  };

  // The frag grenade, as the weapon: the world's materials and the map's rig; `./grenade` places its clones.
  const grenades: Record<string, Group> = {};
  for (const model of map.grenade?.models ?? []) {
    const swapped = hasMappedModel(model.name) ? cloneMappedModel(model.name) : null;
    if (!swapped && !model.parts.length) continue;
    const g = new Group();
    g.name = model.name;
    if (swapped) g.add(swapped);
    else for (const part of model.parts) {
      const mesh = new Mesh(geometryOf(part, lighting, lit), materialFor(part.textureName, part.fog, 'mesh', part.cull, null, false));
      mesh.name = `${model.name} (${part.textureName ?? 'untextured'})`;
      g.add(mesh);
    }
    grenades[model.name] = g;
  }

  /**
   * Numbers every draw by its place in the engine order from a camera at (x, z) in the group's frame, and
   * each detail pass half a step behind its base (`detailRenderOrder`). three's opaque list sorts by
   * `renderOrder` first, so this is the order the draws go out in.
   */
  const reorder = (x: number, z: number): void => {
    orderCell = cellAt(grid, x, z).index;
    engineOrder(drawn, grid, x, z, lastCamera.y).forEach((d, i) => { d.object.renderOrder = i; });
    for (const { mesh, base } of details) mesh.renderOrder = detailRenderOrder(base.renderOrder, true);
    for (const { mesh, base } of envPasses) mesh.renderOrder = detailRenderOrder(base.renderOrder, true) + 0.25;
  };
  /**
   * The alpha pass's own order, every frame: the console re-sorts its list each frame by the range to the camera
   * (`FUN_003371b0`), where the ring walk above changes only with the camera's cell. The pass keeps the numbers after
   * the walk's; the details and env passes hang half a step behind their base as `reorder` left them. The game's key is
   * the scaled range² (`FUN_00290aa0`, over the magnification: research 232 §1); one positive factor on every key leaves
   * the order as it is, so the plain range is kept here.
   */
  const reorderAlphaPass = (x: number, y: number, z: number): void => {
    const base = drawn.length - drawn.filter((d) => inAlphaPass(d)).length;
    alphaPassOrder(drawn.filter((d) => inAlphaPass(d)), x, y, z).forEach((d, i) => { d.object.renderOrder = base + i; });
    for (const { mesh, base: b } of details) if (inAlphaPass(drawnOf(b))) mesh.renderOrder = detailRenderOrder(b.renderOrder, true);
    for (const { mesh, base: b } of envPasses) if (inAlphaPass(drawnOf(b))) mesh.renderOrder = detailRenderOrder(b.renderOrder, true) + 0.25;
  };
  /**
   * The alpha pass's draws and the detail and env passes hung under them, made again only when a draw or a pass was
   * added since (a model-pack swap adds draws after the build).
   */
  let alphaDrawn: Drawn[] = [], alphaDrawnFor = -1;
  let alphaPasses: { details: { mesh: Mesh; base: Drawn }[]; envs: { mesh: Mesh; base: Drawn }[] } | null = null, alphaPassesFor = '';
  const alphaPassDraws = (): Drawn[] => {
    if (alphaDrawnFor !== drawn.length) { alphaDrawn = drawn.filter((d) => inAlphaPass(d)); alphaDrawnFor = drawn.length; }
    return alphaDrawn;
  };
  /**
   * LATER 593 (F1, F3): the alpha pass numbered every frame by the console's key with the engine order off -- far to near
   * by the range to each item's centroid (`alphaPassOrder`, `FUN_003371b0`, `FUN_00336f60`), each at its own number in
   * [1, 2) (`alphaItemOrder`), its reflection right after it (`alphaEnvOrder`, F2) and its detail pass half a step on;
   * the particles' batches take the numbers between (`./particles`, `alphaPass` below). Was: every item at 1, three's
   * back-to-front sort by the clip depth of its bounding sphere's centre standing in for the console's.
   */
  const orderAlphaPass = (x: number, y: number, z: number): void => {
    const pass = alphaPassDraws();
    if (pass.length === 0) return;
    const passesFor = `${drawn.length}|${details.length}|${envPasses.length}`;
    if (alphaPassesFor !== passesFor) alphaPasses = null;
    alphaPassesFor = passesFor;
    alphaPasses ??= {
      details: details.flatMap(({ mesh, base }) => { const d = drawnByObject.get(base); return d && inAlphaPass(d) ? [{ mesh, base: d }] : []; }),
      envs: envPasses.flatMap(({ mesh, base }) => { const d = drawnByObject.get(base); return d && inAlphaPass(d) ? [{ mesh, base: d }] : []; }),
    };
    const n = pass.length;
    const rank = new Map<Drawn, number>();
    alphaPassOrder(pass, x, y, z).forEach((d, i) => { rank.set(d, i); d.object.renderOrder = alphaItemOrder(i, n); });
    for (const { mesh, base } of alphaPasses.details) { const i = rank.get(base); if (i !== undefined) mesh.renderOrder = alphaDetailOrder(i, n); }
    for (const { mesh, base } of alphaPasses.envs) { const i = rank.get(base); if (i !== undefined) mesh.renderOrder = alphaEnvOrder(i, n); }
  };
  /** LATER 593: the pass's keys from an eye in world space, far to near, for the particles (`WorldView.alphaPass`). */
  const alphaPass: AlphaPassSource = {
    keys: (eye) => {
      if (engineOn) return null;
      const pass = alphaPassDraws();
      const x = eye.x - group.position.x, y = eye.y - group.position.y, z = eye.z - group.position.z;
      const scale = rangeSqScale.value as number;   // `+0x2c8`: one over the magnification (research 232 §1)
      const keys = new Float64Array(pass.length);
      pass.forEach((d, i) => { keys[i] = ((d.centre[0] - x) ** 2 + (d.centre[1] - y) ** 2 + (d.centre[2] - z) ** 2) * scale; });
      return keys.sort().reverse();
    },
  };
  const drawnOf = (o: Object3D): Drawn =>
    drawnByObject.get(o) ?? { object: o, order: 0, cells: [], alternate: false, off: false, shadow: false, alphaPass: false, centre: [0, 0, 0], line: false, lod: null };

  const warmExtras = (): Object3D[] => {
    const out: Object3D[] = [];
    const seen = new Set<Basic>();
    for (const d of drawn) {
      const rest = d.lod ? lodRest.get(d.object) : undefined;
      if (!rest || seen.has(rest.material) || !(d.object instanceof Mesh)) continue;
      seen.add(rest.material);
      let twin = fades.get(rest.material);
      if (!twin) {
        twin = new MeshBasicNodeMaterial();
        twin.name = 'lod fade';
        fades.set(rest.material, twin);
        applyFade(rest, twin);
      }
      out.push(new Mesh(d.object.geometry, twin));
    }
    return out;
  };

  const texturePack = new TexturePackTarget((roles) => packSourcesFor(map, roles), textures, map.archive);
  return {
    texturePack,
    alphaPass,
    group,
    warmExtras,
    revealWorld,
    revealProps,
    worldObjects,
    propObjects,
    triangles,
    box,
    untextured: untexturedDraws,
    shadowDraws: drawn.filter((d) => d.shadow).length,
    alternateDraws: drawn.filter((d) => d.alternate).length,
    detailDraws: details.length,
    setWireframe: (on) => {
      if (on === wireframeOn) return;                    // a split view's draw sets it again every view (Forge)
      if (on) makeWireframeOverlays();
      wireframeOn = on;
      refreshVisibility();
      refreshDetail();
    },
    setGeometry: (on) => {
      if (on === geometryOn) return;
      geometryOn = on;
      refreshVisibility();
      refreshDetail();
    },
    setTextured: (on) => {
      if (on === texturedOn) return;
      texturedOn = on;
      for (const b of built) apply(b);
    },
    setUntexturedHighlight: (on) => {
      if (on === highlight) return;
      highlight = on;
      for (const b of built) if (!b.textured) apply(b);
    },
    setUnlit: (on) => {
      if (on === unlitOn) return;
      unlitOn = on;
      for (const { part, attribute } of lit) relight(part, attribute);
      lightingStamp++;
    },
    setLighting: (next) => {
      brighten.value = brightenOf(next);
      const rigChanged = next.rig !== lastRig || next.rigEverywhere !== lastEverywhere;
      lighting = next;
      lastRig = next.rig;
      lastEverywhere = next.rigEverywhere;
      if (!rigChanged) return;
      lightingStamp++;   // LATER 114: what the facades' re-light reads changed (`FacadeRelight`)
      for (const { part, attribute } of lit) relight(part, attribute);
    },
    frame: (camera, dt, view = DEFAULT_RENDER_VIEW) => {
      const magnification = view.magnification > 0 ? view.magnification : 1;
      rangeSqScale.value = 1 / magnification;
      // The view range (`FUN_001f1470`): the fog's far and the far clip, each relative to its own base, every frame a
      // no-op while the extra holds. The fog is the scene's the world is drawn in.
      let root: Object3D = group;
      while (root.parent) root = root.parent;
      if ((root as Scene).isScene) extendFog(root as Scene, view.farExtra);
      extendFar(camera, view.farExtra);
      if (billboardsOn) {
        eye.copy(camera.position).sub(group.position).toArray(eyeAt);   // the camera in the group's frame, as `lastCamera`
        for (const b of billboards) {
          turnFacade(b.mesh, b.facade, b.mesh.position.toArray(nodeAt), eyeAt);
          relit(b);
        }
      }
      // LATER 113: the alpha pass keys a facade by its centroid through the matrix it is drawn with, every frame
      // (`facadeAlphaKey`); a pose put back by `setBillboards(false)` keys the same way.
      for (const b of billboards) if (inAlphaPass(b.drawn)) facadeAlphaKey(b.drawn.centre, b.centroid, b.mesh);   // LATER 593: in either order
      // The engine order follows the camera's cell: a new cell, a new walk; the same cell, the same order.
      lastCamera.x = camera.position.x - group.position.x;
      lastCamera.y = camera.position.y - group.position.y;
      lastCamera.z = camera.position.z - group.position.z;
      lastCamera.seen = true;
      if (engineOn) {
        if (cellAt(grid, lastCamera.x, lastCamera.z).index !== orderCell) reorder(lastCamera.x, lastCamera.z);
        else reorderAlphaPass(lastCamera.x, lastCamera.y, lastCamera.z);
      } else orderAlphaPass(lastCamera.x, lastCamera.y, lastCamera.z);   // LATER 593: three's order too, every frame
      let lodChanged = false;
      for (const d of drawn) {
        if (d.lod === null) continue;
        // `DrawLOD`'s opacity at the camera's range squared: drawn where it is above zero (`lodVisible`),
        // faded across each fade, at rest on the plateau.
        // The range squared over the magnification (`scaledRangeSq`, FUN_00290aa0 D:L137045); the last copy kept (H92).
        const opacity = lodOpacity(d.lod.band, scaledRangeSq(d.lod.at.distanceToSquared(camera.position), magnification), d.lod.last);
        const visible = opacity > 0;
        if (visible !== d.lod.visible) { d.lod.visible = visible; lodChanged = true; }
        fadeTo(d.object, opacity);
      }
      if (lodChanged) refreshVisibility();
      for (const s of scrolling) {
        const v = s.offset.value;
        // Kept in 0..1: a uv offset of 3.04 samples the same texel as 0.04 and drifts in precision.
        v.x = (v.x + s.du * dt * SCROLL_TICKS_PER_SECOND) % 1;
        v.y = (v.y + s.dv * dt * SCROLL_TICKS_PER_SECOND) % 1;
      }
      syncWireframeOverlays();
    },
    held,
    grenades,
    flarePositions: () => billboards.map(({ mesh: m }) => [m.position.x, m.position.y, m.position.z]),
    flares: () => billboards.map(({ mesh: m }) => {
      const at = m.position.clone().add(group.position);       // the facade mesh sits in the group's frame
      return { name: m.name, at: [at.x, at.y, at.z] as [number, number, number] };
    }),
    setFlaresShown: (on) => {
      // Off the drawn layer (0), which a raycaster tests too; the mask's other layers (the shadows') kept, and `visible`
      // stays the world's own to set.
      for (const { mesh: m } of billboards) { if (on) m.layers.enable(0); else m.layers.disable(0); }
    },
    lineGroups: () => lineObjects.map((line) => {
      // LATER 120: a turned placement's strips are in its model space, placed by the object's own matrix (identity else).
      const b = new Box3().setFromBufferAttribute(line.geometry.getAttribute('position') as BufferAttribute).applyMatrix4(line.matrix);
      return { texture: line.name, min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
    }),
    moveNode: (path, delta) => {
      const d = new Matrix4().fromArray(Array.from(delta));
      const underPath = (p: string): boolean => p === path || p.startsWith(`${path}/`) || p.startsWith(`${path}=`);
      let moved = 0;
      for (const m of movable) {
        if (!underPath(m.path)) continue;
        m.delta.copy(d);
        m.set(d.clone().multiply(m.base));
        if (!m.rider) moved++;
      }
      return moved;
    },
    spinLocalX: (path, angle) => {
      const root = movable.find((m) => !m.rider && m.path === path);
      if (!root) return 0;
      // delta * base * Rx * inverse(base), so the stored delta still composes as delta' * base = T * base * Rx.
      const rx = new Matrix4().makeRotationX(angle);
      const spin = root.delta.clone().multiply(root.base).multiply(rx).multiply(root.base.clone().invert());
      let spun = 0;
      for (const m of movable) {
        if (m.rider || !under(m.path, path)) continue;
        m.delta.copy(spin);
        m.set(spin.clone().multiply(m.base));
        spun++;
      }
      return spun;
    },
    attachToNode: (path, object) => {
      const at = movable.find((m) => !m.rider && m.path === path);
      if (!at) return null;
      // Made under the swing `at.delta`: each later delta D puts it at D x inverse(at.delta).
      const rider: Movable = {
        path, base: at.delta.clone().invert(), delta: at.delta.clone(), rider: true,
        set: (m) => { object.matrix.copy(m); object.matrixWorldNeedsUpdate = true; },
      };
      movable.push(rider);
      return () => { const i = movable.indexOf(rider); if (i >= 0) movable.splice(i, 1); };
    },
    setBillboards: (on) => {
      billboardsOn = on;
      for (const b of billboards) b.relight?.invalidate();   // LATER 114: re-lit under the pose put back, or the turn resumed
      if (!on) {
        for (const b of billboards) {
          b.mesh.quaternion.copy(b.pose.quaternion); b.mesh.scale.copy(b.pose.scale);   // the pose on disc
          relit(b);
        }
      }
    },
    setLineStrips: (on) => { lineStripsOn = on; refreshVisibility(); },
    setShadows: (on) => { if (on === shadowsOn) return; shadowsOn = on; refreshVisibility(); },
    setAlternate: (on) => { if (on === alternateOn) return; alternateOn = on; refreshVisibility(); },
    holdOnNode: (path, gone) => {
      const hold = { path, gone };
      markHolds.push(hold);
      return () => { const i = markHolds.indexOf(hold); if (i >= 0) markHolds.splice(i, 1); };
    },
    setNodeActive: (path, on) => {
      if (!on) for (const h of [...markHolds]) if (under(h.path, path)) { markHolds.splice(markHolds.indexOf(h), 1); h.gone(); }   // LATER 277: NODE_OFF_MARKS_READING
      const reached = new Set<string>();
      for (const sw of switchable) {
        if (!under(sw.path, path)) continue;
        sw.setOff(!on);
        reached.add(sw.key);
      }
      if (reached.size) refreshVisibility();
      return reached.size;
    },
    setNodeCut: (path, cut) => {
      let reached = 0;
      for (const sw of switchable) {
        if (!under(sw.path, path)) continue;
        sw.setCut(cut);
        reached++;
      }
      if (reached) refreshVisibility();
      return reached;
    },
    setPlacementActive: (key, on) => {
      // Every switch under the key: a placement is drawn as one object per part (one per texture), each filed under
      // the same key (FG-23: with `find`, only the first part hid).
      let reached = 0;
      for (const sw of switchable) {
        if (sw.key !== key) continue;
        sw.setOff(!on);
        reached++;
      }
      if (reached) refreshVisibility();
      // FG-32: its line strips, merged into the world's line groups by texture, collapsed to a point while hidden.
      const [prop, index] = key.split(':').map(Number) as [number, number];
      const walk = map.props[prop]?.walk?.[index];
      for (const s of walk === undefined ? [] : lineSpans.get(walk) ?? []) {
        const points = s.position.array as Float32Array, from = s.first * 3, to = (s.first + s.count) * 3;
        if (on === (s.saved === null)) continue;
        if (on) { points.set(s.saved!, from); s.saved = null; }
        else {
          s.saved = points.slice(from, to);
          for (let i = from; i < to; i += 3) points.copyWithin(i, from, from + 3);
        }
        s.position.needsUpdate = true;
        reached++;
      }
      return reached ? 1 : 0;
    },
    setNodeOpacity: (path, opacity) => {
      let reached = 0;
      for (const f of faded) {
        if (!under(f.path, path)) continue;
        if (opacity >= 1) nodeOpacityOf.delete(f.object); else nodeOpacityOf.set(f.object, opacity);
        drawFaded(f.object);
        reached++;
      }
      return reached;
    },
    setDetail: (on) => { if (on === detailOn) return; detailOn = on; refreshDetail(); },
    setDetailDistance: (factor) => {
      detailDistance = Number.isFinite(factor) && factor > 0 ? factor : 1;
      detailDistanceSq = detailDistance * detailDistance;
    },
    get detailDistance() { return detailDistance; },
    setBlendGraded: (on) => {
      if (on === blendGraded) return;
      blendGraded = on;
      for (const b of built) apply(b);
      for (const d of detailMaterials.values()) applyDetail(d);   // a pass's list follows its base's
    },
    setEngineOrder: (on) => {
      if (on === engineOn) return;
      engineOn = on;
      for (const b of built) apply(b);
      for (const d of detailMaterials.values()) applyDetail(d);
      orderCell = -1;
      if (on) {
        if (lastCamera.seen) reorder(lastCamera.x, lastCamera.z);   // else the next frame orders it
        return;
      }
      for (const d of drawn) d.object.renderOrder = restOrder(d);
      for (const { mesh, base } of details) mesh.renderOrder = detailRenderOrder(base.renderOrder, true);
      for (const { mesh, base } of envPasses) mesh.renderOrder = envOrderOf(base);   // the next frame numbers the pass
    },
    dispose: () => {
      texturePack.dispose();
      stopExperimentalUpdates();
      quality.dispose();
      // Every object built, revealed or not: `prepare` compiles (and uploads) the props before their reveal, and three's
      // renderer holds an uploaded geometry until its 'dispose' (`Geometries._geometryDisposeListeners`), so a map
      // switched away from mid-stream would keep its unrevealed props, flares and instance buffers for good. Each
      // geometry once: the LOD copies share one.
      const geometries = new Set<BufferGeometry>();
      for (const { object } of drawn) {
        if (!(object instanceof Mesh) && !(object instanceof LineSegments)) continue;   // an InstancedMesh is a Mesh too
        geometries.add(object.geometry as BufferGeometry);
        if (object instanceof InstancedMesh) object.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      group.clear();
      movable.length = 0;
      for (const { material } of built) material.dispose();
      wireframeMaterial.dispose();
      for (const twin of fades.values()) twin.dispose();
      for (const { material } of detailMaterials.values()) material.dispose();
      for (const { mesh } of details) if (mesh instanceof InstancedMesh) mesh.dispose();
      for (const material of envMaterials.values()) material.dispose();
      for (const { mesh } of envPasses) if (mesh instanceof InstancedMesh) mesh.dispose();
      for (const g of heldBuilt.values()) for (const child of g?.children ?? []) if (child instanceof Mesh) child.geometry.dispose();
      for (const g of Object.values(grenades)) for (const child of g.children) if (child instanceof Mesh) child.geometry.dispose();
      for (const texture of textures.values()) texture.dispose();
      releaseWorldInstancing();                          // IP5: the shared instance buffers let this world's meshes go
    },
  };
}

/**
 * The part with its normals turned by a placement's 3x3, so the lighting sees where it really faces.
 *
 * Renormalised afterwards: a placement matrix is not always a pure rotation. Clutter carries a uniform
 * scale -- Desert Glory's rocks come through at about 0.93 -- and a scaled normal would dim every
 * surface of that prop by the same factor, which reads as the prop being in shadow rather than smaller.
 * A zero normal (SEMANTICS section 4 allows them, 16 of Frostfire's are exactly zero) stays zero.
 */
function rotateNormals(part: LoadedMesh, m: Matrix4): LoadedMesh {
  if (!part.normals) return part;
  const e = m.elements;                                 // column-major, as three stores it
  const out = new Float32Array(part.normals.length);
  for (let i = 0; i < out.length; i += 3) {
    const [x, y, z] = [part.normals[i]!, part.normals[i + 1]!, part.normals[i + 2]!];
    const nx = x * e[0]! + y * e[4]! + z * e[8]!;
    const ny = x * e[1]! + y * e[5]! + z * e[9]!;
    const nz = x * e[2]! + y * e[6]! + z * e[10]!;
    const len = Math.hypot(nx, ny, nz);
    const k = len > 1e-6 ? 1 / len : 0;
    out[i] = nx * k;
    out[i + 1] = ny * k;
    out[i + 2] = nz * k;
  }
  return { ...part, normals: out };
}

/** The centre of a box, for framing a map whose spawns are not known. */
export function centre(box: Box3): [number, number, number] {
  const v = box.getCenter(new Vector3());
  return [v.x, v.y, v.z];
}

function geometryOf(
  part: LoadedMesh,
  light: Lighting,
  lit: { part: Lightable; attribute: BufferAttribute | InterleavedBufferAttribute }[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  // The colour attribute is the *lit* colour, not the material colour on disc: `record2 * lit`, computed here
  // the way the VU computes it (see `./lighting`). Float rather than a normalised byte, because a lit
  // colour goes above 1 and the GS clamps the modulate, not the vertex.
  // CPS H12 (product track, a browser adaptation): position, uv and colour in one interleaved buffer (`./worldVertices`,
  // stride 9), one vertex buffer bound a draw instead of three; the same f32 values under the same names.
  const vertices = interleaveWorldVertices(part.positions, part.uvs, part.colors.length / 4);
  if (vertices) {
    geometry.setAttribute('position', vertices.position);
    geometry.setAttribute('uv', vertices.uv);
    applyLighting(part, light, vertices.buffer.array as Float32Array, WORLD_VERTEX_STRIDE, WORLD_COLOUR_OFFSET);
    geometry.setAttribute('color', vertices.color);
    lit.push({ part, attribute: vertices.color });
  } else {
    // Counts that disagree: separate attributes, as the builder always made them.
    geometry.setAttribute('position', new BufferAttribute(part.positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(part.uvs, 2));
    const colors = new Float32Array(part.colors.length);
    applyLighting(part, light, colors);
    const attribute = new BufferAttribute(colors, 4);
    geometry.setAttribute('color', attribute);
    lit.push({ part, attribute });
  }
  geometry.setIndex(new BufferAttribute(part.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A texel as the GS samples it. A mipmapped texture's level is `gsMipLod`'s -- `log2` of the depth, scaled by
 * `2^L`, plus `K`, clamped to `0..MXL` -- read per fragment from the view depth (the clip `w` the VU divides by),
 * not the GPU's derivative LOD, which took Vigilance's walls two levels down at 150 units where the console
 * draws them sharp. Anything else samples as it always did.
 */
function gsTexel(texture: Texture, at: Node<'vec2'>, lod: GsMipLod | null): Node<'vec4'> {
  const sampled = textureNode(texture, at);
  if (!lod) return sampled as unknown as Node<'vec4'>;
  const base = log2(positionView.z.negate().max(1e-3)).mul(lod.scale).add(lod.k);
  const level = (experimentalAssets.mipOn ? base.add(experimentalAssets.mipBias) : base).clamp(0, lod.max);
  return sampled.level(level) as unknown as Node<'vec4'>;
}

export function makeTexture(rgba: Rgba, spec: MaterialSpec, discMips?: readonly Rgba[]): DataTexture {
  const texture = new DataTexture(new Uint8Array(rgba.data.buffer, rgba.data.byteOffset, rgba.data.length), rgba.width, rgba.height, RGBAFormat);
  texture.flipY = FLIP_Y;
  // NoColorSpace is the GS's own reading: the stored byte *is* the value, and the modulate happens on
  // it -- `(texel * vertex) >> 7` on 8-bit values. Decoding the texel to linear first, as an sRGB
  // texture would be, turned a vertex at half brightness into 0.73 of the pixel and washed every
  // shaded surface out; the renderer's output is left unconverted to match.
  texture.colorSpace = NoColorSpace;
  // `TEX1` off the disc: bilinear on every texture in the corpus, and a mipmap chain on the ground and
  // detail textures that ask for one (`MMIN = LINEAR_MIPMAP_LINEAR`). The hardware was given one or two
  // levels, the records `MIPTBP1` names (`LoadedMap.textureMips`), and those are uploaded as they are --
  // a detail texture's are transparent, the pass's fade with distance -- with a filtered tail to 1x1 that
  // `gsTexel` never reaches. A texture whose levels did not resolve gets three's generated chain.
  texture.magFilter = spec.bilinear ? LinearFilter : NearestFilter;
  texture.minFilter = spec.mipmaps ? LinearMipmapLinearFilter : spec.bilinear ? LinearFilter : NearestFilter;
  if (spec.mipmaps && discMips && discMips.length > 0) {
    texture.mipmaps = mipChain(rgba, discMips).map((l) => ({ data: new Uint8Array(l.data.buffer, l.data.byteOffset, l.data.length), width: l.width, height: l.height }));
    texture.generateMipmaps = false;
  } else texture.generateMipmaps = spec.mipmaps;
  // `CLAMP` off the disc, per axis. A glow's quad clamps so the bilinear tap at u = 1 cannot fetch
  // u = 0 and draw the quad's outline; a tiling wall repeats.
  texture.wrapS = spec.wrapS === 'clamp' ? ClampToEdgeWrapping : RepeatWrapping;
  texture.wrapT = spec.wrapT === 'clamp' ? ClampToEdgeWrapping : RepeatWrapping;
  texture.needsUpdate = true;
  // OT.R92 (HD-2): known to the test room's HD pack by the decode it was made from; inert until a pack is set.
  hdTextures.register(texture, rgba);
  return texture;
}
