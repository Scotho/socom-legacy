import { victoryFromBytes } from './victoryData';
import {
  parseRdr, parseZdb, rdrGet, readTexManifest, Reader, Zar, zdbMember,
  type RdrNode, type TexDetail, type TexEntry,
  type AssetSource, type ZdbEntry,
} from '@s2u/archive';
import { decodeTexture, parseTextureRecord, type Rgba } from '@s2u/gs';
import {assetLibStems,textureLibrary,mipLevels,isOpaque,isGraded} from './mapTextures';
export {isOpaque} from './mapTextures';
import {
  archivePositionForm, centreOf, centroidsOf, interpretChainPartsAs, mergeMeshes, walkChain, type LineStrip, type MeshData, type PositionForm,
} from '@s2u/mesh';
import {
  buildGrid, collisionLines, DEFAULT_GRID_PARAMS, IDENTITY, loadModelLibrary, lodBands, parseCameraParams, parseClutter,
  DEFAULT_ENV_TEXTURE, parseGlobalLighting, parseGridParams, parseMaterialPalette, parseSceneGraph, parseWorldRoot, placeClutter, type EnvMaterial, type LodBand,
  placeInstances, placementCells, resolveChunk, toColumnMajor, transformPoint, worldCollision,
  type CameraParams, type CollisionLines, type GlobalLighting, type Grid, type GridParams, type ModelLibrary,
  type PlacedModel, type SceneNode, type TurretPlacement,
} from '@s2u/scene';
import { BULLET_MARK, parseAiMaps, VALVE_OF_ITEM, placeSpawnSlots, spawnsFor, type AiMaps, type EscorteeStart, type GameType, type SpawnSlot, type Spawns } from '@s2u/scene';
import type { TextureFlags } from './materialSpec';
import { applyR0004MapPatch, collisionOwners, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, type GroundData } from './mover';
import { placementKey } from './forge/layout';
import { openingStand, type Stand } from './stand';
import { bodyTextureNames, bodyTransferables, characterTableFor, loadBody, mapPlayer, placeBody, type CharacterSource, type LoadedBody } from './body';
import { loadCharacterAssets, type LoadedCharacters } from './characters/assets';
import { ARMORY_TYPES_PER_SIDE, ITEM, WEAPON_MEMBERS, weaponLibrary, type WeaponPoint } from '@s2u/scene';
import { equipmentKind } from './equipment';
import { BAKED_LOADOUT, kitGameType, kitTurretDefs, loadKitSource, simKitsFromBytes, slotModel, type SimKits } from './loadout';
import { chunkKey, flattenScene, matchTurretDef, placeTurrets, turretSceneModels, turretScopeHidden, type TurretDef } from '@s2u/scene';
import { readEffectBitmap, readReticle, type ReticleBitmaps } from './hudBitmaps';
import { readHud, type HudBitmaps } from './hudAssets';
import { grenadeTransferables, loadGrenadeAssets, type GrenadeAssets } from './grenadeAssets';
import { readMapActions, type MapAction } from './mapActions';
import { alternateDisagreement, readMapMeta, scenicViewsOf, under, type MapMeta, type ScenicView } from './mapMeta';
import { readDoors, type DoorSpec } from './doors';
import { readGates, type GateSpec } from './gates';
import { craneRides, readCranes, splitCranePlacements, type CraneSpec } from './cranes';
import { readTacData, type TacData } from './tacMap';
import { bombStartOf, mapEscortees, mapTurrets } from './simMap';
import { worldPiecePlanFor, type WorldPieceInfo, type WorldPieceSwap } from './worldPieces';
import { reverbZones } from './soundData';

/**
 * One map, decoded far enough to draw: the world's triangles grouped one mesh per texture, the textures
 * those meshes name, and everything that went wrong on the way.
 *
 * The world's positions are WORLD space: `scene` gives every chunk the matrix of the `MP*_GEO.ZED` node
 * it hangs off (`hookupVisuals`, `zVisual/vis_main.cpp:88-105`), so the chunks are baked into place here
 * rather than shifted together by `origin`, which is left at zero for a map whose graph could be read.
 *
 * The props stay in MODEL space (`mesh/SEMANTICS.md` section 4): one prop model is drawn in up to 26
 * places, so it is decoded once and each placement travels as a matrix for an `InstancedMesh`.
 */
/**
 * A decoded mesh plus what the drawing needs to know about where it came from: whether the engine
 * lights its node, and where in the engine's walk of the scene graph it was drawn.
 *
 * `order` is the place in that walk (`Placement.rank`, times 256, plus the chunk's index within its
 * node), and `orderEnd` the place of the last chunk merged into this draw -- the same number for a
 * draw that is one chunk. reCOM's `CPipe::RenderNode` draws each visual as the walk reaches it and
 * sorts nothing, so this is the order the hardware drew in, and `world.ts` draws in it.
 */
export type LoadedMesh = MeshData & {
  lit: boolean;
  order: number;
  orderEnd: number;
  /** Whether the engine culls this chunk's back faces (`PlacedModel.cull`, the disc's own flag). */
  cull: boolean;
  /**
   * An alternate state the game shows only later: a destructible's `whats_left` and its debris
   * `parts`, a lamp's `nolight`, the pulsing objective ribbon (`Placement.alternate`). Drawn over the
   * state the map opens in, these z-fight with it; the viewer hides them unless asked. MAP-02: what zAnim makes
   * inactive at initialisation (`MapMeta.initial`), and by name only what no reference of the map names.
   */
  alternate: boolean;
  /**
   * MAP-02: a world chunk under a path the map's zAnim references name (`MapMeta.initial`) -- the deepest such path.
   * The merge keeps such chunks apart by it, so the world's state can draw and hide them (`WorldView.setNodeActive`).
   */
  switchPath?: string;
  /**
   * LATER 782: a world chunk under a node a program's `SCROLL_MOTION` scrolls (`MapMeta.motion.scrolled`) -- the deepest
   * such path. The merge keeps such chunks apart by it, so each takes its own texture offset (`WorldView.setNodeUvOffset`).
   */
  scrollPath?: string;
  /**
   * The uv step per engine tick of a scrolling texture (`TextureScroll_Object` on the world root:
   * Frostfire's oceans and sky horizon), or null for the still majority.
   */
  scroll: [number, number] | null;
  /**
   * The environment-map pass over this draw (`EnvMaterial.index + 1`, the visual's `vparams` byte 7), or 0/absent for
   * none: the water, glass and icy terrain whose `Material_Palette` entry names a reflection texture.
   */
  reflect?: number;
  /**
   * A world part's grid cells (`x + z * cellsX` of `LoadedMap.grid`): every cell the placements merged into
   * it are filed in, as the engine's grid files them (`placementCells`) -- the engine order draws it at the
   * first ring that holds one (`./engineOrder`). The union of the placements' own cells, not the cells of
   * their joint extent, so a part with pieces in two far corners does not claim the cells between. A
   * prop's are per placement, on its entry (`LoadedMap.props[].cells`). Absent on a draw built by hand.
   */
  cells?: number[];
  /**
   * A held weapon's part: the model's node it came from (`scope`, `thermal_scope`, `m82a1_high` ...), which the kit
   * shows or hides (`./sights` `showScopeNodes`: the thermal scope's swap, `FUN_005b82e0`). Absent on the world's.
   */
  node?: string;
  /**
   * The packet's vertices carry an alpha below unity (`colors`' fourth lane, the byte over 128): the GS blends it by
   * `As = At x Af` with `PRIM.ABE` set on every world packet, so the draw blends by its `ALPHA` register however solid
   * its texture is (`materialSpec`'s `vertexAlpha`; research 82 round 5). Vigilance's grass over the courtyard cobbles,
   * the terrain blends of Sandstorm, Guidance and Fish Hook, the sky domes' rims fading into the fog. Such a part keeps
   * its own draw in the walk, as a graded texture does (`loadMap`'s merge). Absent on a draw whose alpha is all unity.
   */
  vertexAlpha?: boolean;
  /**
   * The engine draws this visual in its alpha pass (`PlacedModel.alphaPass`, the visual's `vparams` bit 0 set and bit 8
   * clear): after the walk, far to near by the range to its centroid, not where the walk reaches it (`FUN_003374c0`
   * D:L235422-235438, `FUN_00336cb0`; `./engineOrder`). The drop shadows, the flares and glows, the windows, the
   * puddles, the cloud layers. Such a part keeps its own draw. Absent on a draw the walk itself issues.
   */
  alphaPass?: boolean;
  /**
   * PF-30: false when the visual's `vparams` word 0 lacks bit 14 (`VISUAL_FLAG_DETAIL`, `DETAIL_BIT14_READING`): its
   * texture's detail pass is not drawn over it (`FUN_003b6e10` D:L308392). A merged draw is uniform in it -- the merge
   * splits a detail-bound texture's run where its visuals disagree (`mergeWorld`). Absent: drawn (a hand-built draw).
   */
  detailOn?: boolean;
  /**
   * PF-30: the visual's own detail gate range squared (`SceneNode.visualDetailRanges`, `DETAIL_RANGE_SOURCE_READING`),
   * uniform in a merged draw as `detailOn` is. Absent: the texture's manifest record's (`DetailSpec.range`).
   */
  detailRange?: number;
  /**
   * PF-30: the visual's centroid (`DETAIL_CENTROID_READING`) in this mesh's frame -- the world's for a world chunk,
   * the model's for a prop's part -- before any merge; a merged draw carries it per vertex (`MeshData.centroids`).
   */
  centre?: [number, number, number];
};

export interface LoadedMap {
  victory?: import('./victoryData').VictoryData;
  archive: string;
  /** `cameras/camera` out of `MP*.ZED`: the map's own fog, or null when the key is missing. */
  camera: CameraParams | null;
  path: string;
  name: string;
  world: LoadedMesh[];
  /**
   * GS LINE_STRIP geometry in world space (SEMANTICS section 12), one group per (texture, fog), or null
   * when the map drew none.
   */
  lines: LoadedLineGroup[] | null;
  /**
   * The model library each model name is read from (`<LIB>_MDL.ZED`'s stem: `WORL`, the map's own `MP2`, a shared one
   * such as `PAVE` or `TURR`), the first library holding the name, as `loadModelLibrary` keeps it. The forge's asset
   * browser reads it for its Shared list (a prop of no one map). Absent on a map built by hand.
   */
  modelLibraries?: Record<string, string>;
  /**
   * One entry per prop model-node: its geometry once, a column-major 4x4 per placement, and the place
   * of its first placement in the scene walk (see `LoadedMesh.order`).
   */
  props: {
    modelName: string; parts: LoadedMesh[]; matrices: Float32Array; order: number; alternate: boolean;
    /** `m_facade` on the node: non-zero, every placement is turned to face the camera each frame. */
    facade: number;
    /** The model's LOD band, or null: shown by camera range, one copy of a pair at a time. */
    lod: LodBand | null;
    /** Per placement, in `matrices` order: the grid cells it is filed in (see `LoadedMesh.cells`). */
    cells?: number[][];
    /** DOORS: per placement, in `matrices` order, its node's path in the scene walk -- what a door's swing moves (`./doors`). */
    paths?: string[];
    /**
     * FG-31: per placement, in `matrices` order, its place in the scene walk (`Placement.rank`): what orders one path's
     * placements across entries (the hull's owners follow the walk; the entries are draw groups), `forge/hide` `walkOrder`.
     */
    walk?: number[];
  }[];
  /**
   * Test-room model pack: the world matrix of each `=<model>` node (`flattenScene`), column-major, including a node
   * that draws nothing. A multi-piece prop's GLB is anchored here, not on one piece.
   */
  instanceRoots?: { path: string; matrix: Float32Array }[];
  /**
   * The map's own ambient effects where its scene places them (the owner, 2026-11-10: "I want to see where the ambient
   * objects are set in official maps"): each self-starting program of its mission set (`(flags & 3) === 1`, as
   * `./effectData` reads them) by its root node's world place -- every node of that name (`flattenScene`), as the
   * engine's node search finds one. A program rooted nowhere (the camera's rain and snow) has none. Absent: not read.
   */
  ambientPlaces?: { program: string; node: string; at: [number, number, number] }[];
  /**
   * The forge's placed plant sites' outlines that no program of the map's set lights (`./forge/siteOutlines`; a browser
   * adaptation, FG.R2): each its node's path and the carrier's side whose pickup lights it (`./bombPage` `worldPulse`).
   * Absent on every disc map.
   */
  forgeSiteOutlines?: readonly { path: string; side: 'seal' | 'terrorist' }[];
  /**
   * Test-room model pack: level pieces left out of `world`. One GLB is drawn at `anchor`. Absent when this load
   * was not asked to swap any, so a map with no pack still has the field missing.
   */
  worldSwaps?: WorldPieceSwap[];
  /**
   * Test-room, when the load asked for the list: every direct child of `worldmodel`, disc order. The dev hook and
   * the model-pack panel read it. Absent on every other load.
   */
  worldPieceList?: WorldPieceInfo[];
  /** Test-room model pack: requested level pieces kept on the disc's draw because they move or break (`worldPieces`). */
  worldPiecesKept?: string[];
  /** Test-room model pack: requested level pieces left alone because they have no world draw of their own (`worldPieces`). */
  worldPiecesPropsOnly?: string[];
  textures: Record<string, Rgba>;
  /**
   * A mipmapped texture's own mip levels, 1 to `MXL`, by texture name: the records its `MIPTBP1` names by `gsaddr`
   * in the same library (`rockwall_mip1.tif`, `mipdetail.tif`), decoded as the base is. The GS samples level n from
   * them; a generated chain would differ -- a detail texture's levels are authored transparent, the pass's fade.
   * Absent for a texture whose levels did not all resolve (it falls back to a generated chain).
   */
  textureMips?: Record<string, Rgba[]>;
  /**
   * The world root's reflection materials (`parseMaterialPalette`): what the environment-map pass of a draw whose
   * `reflect` names one draws with. Only those whose texture decoded; empty on most maps.
   */
  envMaterials?: EnvMaterial[];
  /** The world root's `ShadowVector` (every map has one): the direction the characters' shadow maps look down. */
  shadowVector?: [number, number, number];
  /**
   * Per texture: the record's flags, two facts read off the decoded pixels (`graded`, `opaque`), and the
   * GS state the record's bind packet sets -- blend equation, alpha test, filtering, wrap. See
   * `./materialSpec` for how the three become a material.
   */
  textureFlags: Record<string, TextureFlags>;
  /**
   * The detail pass each drawn texture binds, by texture name: its `mp<N>_lib.rdr` entry's `detail` record
   * (socomlegacy/docs/research/72 §6, `readTexManifest`), the detail texture's name lower-cased as `textures` keys
   * it, and only where that texture decoded. Empty on a map with no detail textures (Night Stalker, MP81).
   */
  detail: Record<string, TexDetail>;
  metersPerUnit: number;
  /**
   * ACCURACY (research 84 section 14): the world root's `NightMission` flag (the engine's `CWorld+0x5dc`, 0x318da0:
   * first zoom step is the night vision) and its `LensFX_NVG` colour (`CWorld+0x5e0`, RGBA).
   */
  night?: { mission: boolean; lens: [number, number, number, number] | null };
  /**
   * `MP*.ZED/grid_params`, the engine's grid (`parseGridParams`; the engine's default 640 and 8 x 8 when the
   * key is absent): the cells every draw's `cells` index, walked by the engine order (W1.2).
   */
  grid: GridParams;
  /** `MP*.ZED/GlobalLighting`: the map's own light rig, or null when the key is missing or short. */
  lightRig: GlobalLighting | null;
  origin: [number, number, number];
  /** The collision hull as line segments in world space, ready for a `LineSegments` overlay. */
  collision: CollisionLines;
  /**
   * The disc's spawn slots (W1.5b): `AIMAPS.MPS`'s spawn list, 24 a side with their facing, placed by
   * `placeSpawnSlots` (socomlegacy/docs/research/75 §5.5-§7), each on the ground probe's floor under its centre where
   * the map has ground (W1.4b). Drawn as the spawn overlay; the camera's opening stand stays at the measured
   * spawn A of `spawns.ts` (the spec's W1.R9; `stand`). Empty, with a diagnostic, when the file will not read.
   */
  slots: SpawnSlot[];
  /**
   * The slots' twin records (`placeSpawnSlots(..., true)`): where a SEAL respawns (research 91 section 4.2), for the
   * page's single-player match (`./net/loopback`), placed as the server's `simMapFromBytes` places them.
   */
  respawns?: SpawnSlot[];
  /**
   * What the walk stands on (`./walk`, W1.4): the hull's polygons as the probe reads them, their nodes, and the
   * map's `grid_params`. Absent when the graph would not parse.
   */
  ground?: GroundData;
  /**
   * Where the fly camera opens (W1.4b, `./stand`): spawn A's (x, z), `EYE` over the ground probe's floor there,
   * or over A's recorded y where the probe finds none. Absent when the map has no measured spawns.
   */
  stand?: Stand;
  /** PRE-SPAWN-SIDE (research 222 s12, `PRE_SPAWN_STAND_SIDE_READING`): the same stand at spawn B, a Terrorist seat's. */
  standB?: Stand;
  /**
   * The player's body (W2.1, `./body`): the map's player character out of `CLIB_MDL`/`CLIB_GEO`, in the gear
   * `READERC.ZAR/character.rdr` hangs on it out of `FLIB_MDL`, in its bind pose at slot A (socomlegacy/docs/research/78).
   * Null, with a diagnostic, when it will not decode; absent on a map built by hand.
   */
  body?: LoadedBody | null;
  /** Web sprint 3 M5: the map's first Terrorist type (`chartype.rdr`), for the other players. Unplaced (`at` null). */
  terrorist?: LoadedBody | null;
  /**
   * Web sprint 5 S2 (research 95 §6, W5.R2): each side's ARMORY types' bodies, `chartype.rdr` order, at most four a side
   * -- index 0 is `body` (placed) and `terrorist` themselves, a type naming the same character shares its body object;
   * null for a type that will not decode. What the page's own body and the others' follow (`./teamBody`). HX-2 (web sprint
   * 31; research 238 §1): `escortees`, the map's hostages (`chartype.rdr`'s `escortees`: MP6's `thai_biologist01/02`,
   * `thai_wife`), absent on a map that lists none; what `./remotePlayers` draws a hostage's id on.
   */
  types?: { seal: (LoadedBody | null)[]; terrorist: (LoadedBody | null)[]; escortees?: (LoadedBody | null)[] };
  /** FBA.R10: additional regional bot appearances, separate from the native ARMORY types (a browser adaptation). */
  characters?: LoadedCharacters & { diagnostics?: string[] };
  /**
   * The held weapons (W2.4; web sprint 4, M3), by `ModelName`: every firearm model the arsenal names that the map's
   * `COMMON/WEAP_GEO.ZED` and `WEAP_MDL.ZED` hold (the library decoded once), each its high LOD's packets in the
   * weapon's own frame -- the grip at the origin, x along the barrel, y up (socomlegacy/docs/research/79 §2) -- and
   * its named nodes, the muzzle `firepoint` among them; the page builds the loadout's two on demand (`WorldView.held`).
   * Their textures are in `textures` with the map's. Without the arsenal, the baked pair's two (`./loadout`). Absent
   * when the library will not read, with a diagnostic.
   */
  weapons?: Record<string, HeldWeapon>;
  /**
   * The kit tables (web sprint 4, `./loadout`): the source's `ZWEAPON.ZAR` read and this map's kits (`READERM.ZAR`
   * through `READERC.ZAR`) -- what the page's kit and its own match (`./net/loopback`) read. Absent without them.
   */
  arsenal?: SimKits;
  /** W2.4: the rifle reticle's bitmaps off `HUD2_TXR.ZED` (`./hudBitmaps`), or null with a diagnostic. */
  reticle?: ReticleBitmaps | null;
  /** W2.5: the shot's mark, `BULLET_MARK`'s bitmap off `EFFE_TXR.ZED` (`./hudBitmaps`), or null with a diagnostic. */
  bulletMark?: Rgba | null;
  /** The in-game HUD's bitmaps off `HUD_TXR`/`HUD2_TXR`/`HUDW_TXR`/`FONT_TXR` (`./hudAssets`, research 87), top row first. */
  hud?: HudBitmaps;
  /** The frag grenade's model, effect bitmaps and the map's `DefaultMaterial` (`./grenadeAssets`, `./grenade`). */
  grenade?: GrenadeAssets;
  /** The map's own context actions, `READERM.ZAR/actions.rdr` on placed nodes (`./mapActions`, research 87 §5). */
  actions?: MapAction[];
  /**
   * MAP-01: the map's typed metadata (`./mapMeta`, research 209) -- the actions, every placed node's instance id and
   * zAnim's initial state -- the same reading the room's `SimMap.meta` holds. Absent when the scene graph did not read.
   */
  meta?: MapMeta;
  /**
   * PF-40 (research 210 s4, 192 s1): the map's game type off `READERC.ZAR/missionlist.rdr` (`./loadout` `kitGameType`,
   * the arsenal's READERC read), for the offline room's rules (`./net/loopback` `LoadedForMatch.gameType`) as the server
   * sets `SimMap.gameType`. Absent without READERC or for a map off the list: SUPPRESSION's rules.
   */
  gameType?: GameType;
  /**
   * MAP-10a (`./simMap` `mapTurrets`, research 215): the map's placed manual turrets, read through the kit source's
   * READERC and arsenal as the server reads `SimMap.turrets`, for the offline room (`./net/loopback`
   * `LoadedForMatch.turrets`). Absent without the kit source or on a map with none.
   */
  turrets?: TurretPlacement[];
  /**
   * XR-05 (`./simMap` `bombStartOf`, research 173 s2): DEMOLITION's StartBomb, for the offline room
   * (`./net/loopback` `LoadedForMatch.bombStart`) as the server reads `SimMap.bombStart`. Absent without the point.
   */
  bombStart?: [number, number, number];
  /**
   * W0 (HX-0b's review; research 237 §0): the parsed `AIMAPS.MPS` (`SimMap.ai`, `@s2u/scene` `parseAiMaps`) and the map's
   * escortees at their named points (`SimMap.escortees`, `./simMap` `mapEscortees`), for the offline room
   * (`./net/loopback` `LoadedForMatch.ai`/`.escortees`) as the server reads them: Desert Glory's three hostages. Absent
   * when the AI maps will not read (the slots' line says why) or the map has no escortee.
   */
  ai?: AiMaps;
  escortees?: EscorteeStart[];
  /** A Forge layout's escort zones' compass marks (`./forge/playObjectives` `FORGE_ESCORT_ZONE_MARK_ADAPTATION`); never the disc's. */
  forgeZoneMarks?: [number, number, number][];
  /**
   * PF-31 (`./mapMeta` `scenicViewsOf`, SCENIC_VIEWS_READING): the spectator camera's fixed views, `mission.rdr`'s
   * `Scenic_Views` in file order (`./spectatorView` `scenicViews`). Absent when the map has none or they do not read.
   */
  scenicViews?: ScenicView[];
  /**
   * `mission.rdr`'s `IndoorReverb` / `OutdoorReverb` zones, [depth, seconds] (`./soundData` `reverbZones`, the sound's own
   * reading; research 81 §9): the forge's Settings show them as the map's own (`./forge/worldSettings`). Absent when the
   * mission will not read.
   */
  reverb?: { indoor: [number, number][]; outdoor: [number, number][] };
  /** DOORS: the map's doors (`./doors`, socomlegacy/docs/research/92-doors.md), their polygons marked in `ground.owners`. */
  doors?: DoorSpec[];
  /** MAP-07: Death Trap's and Enowapi's lever gates (`./gates`), their polygons marked in `ground.owners`. */
  gates?: GateSpec[];
  /** Chain Reaction's hooks (`./cranes`, research 176 §9), their polygons marked in `ground.owners`. Empty on any other map. */
  cranes?: CraneSpec[];
  /** The tactical map's lines, zones and named points, `AIMAPS.MPS` in world units (`./tacMap`, research 87 §9). */
  tac?: TacData | null;
  diagnostics: string[];
  loadMs: number;
  /**
   * Where the wait went, in milliseconds, for the status line and for measuring a regression: the
   * fetch, the decode, and the wall-clock moment the worker handed the map over (so the page can see
   * what the handoff itself cost, which the two clocks' different origins would otherwise hide).
   */
  timings: { fetch: number; decode: number; postedAt: number };
}

/** One held weapon: its model's name, its packets and its named points (`LoadedMap.weapons`). */
export interface HeldWeapon { name: string; parts: LoadedMesh[]; points: WeaponPoint[] }

/**
 * The diagnostic sink: every distinct line once.
 *
 * One cause usually fires more than once -- the same missing texture is cited by twenty chunks, and the
 * same model is asked for at every placement -- and twenty identical lines say no more than one does
 * while burying the rest. Each line already names its cause *and* its subject, so the line itself is the
 * identity, and a repeat is dropped. Order is first-seen, which is decode order.
 */
class Notes {
  private readonly seen = new Set<string>();
  readonly lines: string[] = [];

  add(line: string): void {
    if (this.seen.has(line)) return;
    this.seen.add(line);
    this.lines.push(line);
  }
}

/**
 * `nparams` is 96 bytes: a 64-byte row-major 4x4, a 24-byte bbox, then the u32 `m_type` and a u32 of
 * flags (`tag_NODE_PARAMS`, `zNode/znode.h:73-105`; SEMANTICS section 11.2). 36 section 2 and
 * SEMANTICS section 8 call the 32-byte tail one bbox, which it is not. Only the matrix matters here.
 */
const NPARAMS_SIZE = 96;
/** Row-vector convention: the translation is the matrix's fourth row, floats 12, 13, 14. */
const TRANSLATION_AT = 12 * 4;
/** 36 section 2: the one model key of `WORL_MDL.ZED`, and the root of `MP*_GEO.ZED`'s placement. */
const WORLD_MODEL = 'worldmodel';
/** `MP*.ZED/MetersPerUnit` is one float; Frostfire reads 0.1, and every map so far agrees. */
const DEFAULT_METERS_PER_UNIT = 0.1;

const stemOf = (path: string): string => path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase();
const textureKey = (name: string): string => name.toLowerCase();
const say = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Loads a map archive and decodes its `worldmodel` and the textures that model cites.
 *
 * The sequence mirrors `socomlegacy/tools/dump-textures.ts` for the texture half and the mesh package's Frostfire
 * tests for the geometry half: ZDB table of contents, `WORL_MDL.ZED` -> `worldmodel` -> DMA chains ->
 * VIF packets -> `MeshData`, and `MP*_TXR.ZED` + `MP*_PAL.ZED` -> `TextureRecord` -> RGBA.
 *
 * Nothing here throws for bad map data if it can help it, and that promise is kept one chunk at a time:
 * the DMA walk and the VIF interpretation of a chunk both happen inside `decoder`'s per-chunk `try`, so a
 * malformed tag costs that chunk and nothing else. The same holds a level up -- a model archive, the
 * scene graph, the texture archive, a single texture: each failure is a diagnostic string, and whatever
 * else decoded still draws. Only a ZDB whose table of contents will not parse ends the load.
 */
/**
 * The named parts of a load, in the order they happen. The page turns these into a sentence and a bar;
 * they exist because an 8 to 13 MB archive over a real network is seconds of nothing to look at.
 */
export type LoadStage = 'fetching' | 'archive' | 'geometry' | 'textures';

/** `done` of `total`; `total` is 0 when the step has no count to give (the archive parse). */
export type OnStage = (stage: LoadStage, done: number, total: number) => void;

/**
 * Test-room model pack (`TEST_ROOM_MODEL_PACK_ADAPTATION`). Absent, or with neither field set, the world draw is
 * the one this function has always built. `worldPieces` names level pieces to leave out of the merge. `listWorldPieces`
 * attaches their ids and does not, by itself, omit a triangle. Collision, the grid and the doors are read as before.
 */
export interface LoadMapOptions {
  worldPieces?: readonly string[];
  listWorldPieces?: boolean;
}

export async function loadMap(source: AssetSource, path: string, onStage?: OnStage, options?: LoadMapOptions): Promise<LoadedMap> {
  const started = Date.now();
  const notes = new Notes();
  const step = (stage: LoadStage, done: number, total: number): void => onStage?.(stage, done, total);
  const T0 = performance.now();
  step('fetching', 0, 0);
  const bytes = await source.read(path, (loaded, total) => step('fetching', loaded, total));
  const T1 = performance.now();
  step('archive', 0, 0);
  const toc = parseZdb(bytes);
  const stem = stemOf(path);

  // The geometry. `scene` reads MP*_GEO.ZED's node tree and says which chain of which model buffer each
  // node draws and where; everything below is decoding what it points at.
  const archives = mdlArchives(bytes, toc, stem, notes);
  const library = loadModelLibrary(archives.map((a) => a.zar), archives.map((a) => a.form));
  // Each model's library, the first holding it (`loadModelLibrary` keeps the first of a name).
  const modelLibraries: Record<string, string> = {};
  for (const a of archives) for (const key of a.zar.root.children) if (!(key.name in modelLibraries)) modelLibraries[key.name] = a.lib;
  const chunksOf = decoder(library, notes);
  // The engine's grid, cells only: what each placement is filed under for the engine order (W1.2).
  const grid = worldGrid(bytes, toc, stem, notes);
  // Web sprint 4: the arsenal's source (ZWEAPON.ZAR, READERC.ZAR) once; MAP-10b: its turret definitions join the turrets'
  // drawn parts to the scene (`turretParts`).
  const kitSource = await loadKitSource(source);
  const placement = place(library, bytes, toc, stem, notes, buildGrid(grid, [], [], []), kitTurretDefs(kitSource));
  /** The world's meshes, each with its place in the scene walk, so a blended surface keeps its own draw. */
  const parts: LoadedMesh[] = [];
  let chunk = 0;
  /** A chunk's place in the walk: its node's rank, then its index within the node (256 is a cap, not a count). */
  const orderOf = (p: PlacedModel, i: number): number => placement.rank(p) * 256 + Math.min(i, 255);
  // Relocation-type-1 packets are GS LINE_STRIPs, not meshes (SEMANTICS section 12): Desert Glory's
  // power lines and lamp brackets, Crossroads' guy ropes and light filaments. They carry no index list,
  // so a strip of n points is n-1 segments, flattened here into world-space segment lists, one per
  // (texture, fog) -- a strip is textured, and the texture is what a line draw is keyed on.
  const segments = new Segments();
  // Chain Reaction: a worldmodel piece under the hook, or under epan_N / hcont_N, is not merged into the static
  // draw. Those vertices are already in world space once `placeMesh` runs, and `moveNode` cannot then carry them.
  // Kept as a one-placement prop, model space plus the node's matrix, the hook's translation and the swingplate's
  // local X reach them (`CRANE_PANEL_WITH_HOOK_READING`). Every other map has no cranes, so this list stays empty.
  const riding: { p: PlacedModel; decoded: ReturnType<typeof chunksOf> }[] = [];
  const ridesCrane = (p: PlacedModel): boolean => (placement.cranes ?? []).some((c) => craneRides(c, p.path));
  // Level pieces (`worldPieces`): only when this load asked. Null is the draw this loop has always built. The hull,
  // the grid and the doors were already taken from the whole graph in `place` (`hull`); this loop does not touch them.
  // #432 (OT.R69): a piece that moves or breaks (an alternate state, a switch path) keeps the disc's draw; #337: so does
  // a piece that rides a crane.
  const piecePlan = worldPiecePlanFor(placement.models, placement.world, options, (p) => placement.alternate(p) || placement.switchPath(p) !== null || placement.scrollPath(p) !== null || ridesCrane(p));
  const pieceOrder = new Map<number, number>();
  const pieceCells = new Map<number, number[]>();
  for (const [wi, p] of placement.world.entries()) {
    step('geometry', chunk++, placement.world.length);
    if (piecePlan && piecePlan.drop[wi]) {
      const index = piecePlan.pieceIndex[wi];
      if (typeof index === 'number') {
        const order = orderOf(p, 0);
        const prev = pieceOrder.get(index);
        if (prev === undefined || order < prev) pieceOrder.set(index, order);
        const cells = pieceCells.get(index) ?? [];
        for (const c of placement.cells(p)) if (!cells.includes(c)) cells.push(c);
        pieceCells.set(index, cells);
      }
      continue;
    }
    const decoded = chunksOf(p);
    const rides = ridesCrane(p);
    // A world-model node under the hook or a panel that asked for chunks and got none is not drawn. The instance
    // path notes the same (`cranes: ${path} decodes to no mesh`). Nothing is invented in its place.
    if (rides && decoded.meshes.length === 0 && p.chunks.length > 0 && p.nodeIndex >= 0) notes.add(`cranes: ${p.path} decodes to no mesh`);
    if (decoded.meshes.length > 0 && rides) {
      riding.push({ p, decoded });
      continue;
    }
    const { meshes, lines } = decoded;
    const alternate = placement.alternate(p);
    const switchPath = placement.switchPath(p);
    const scrollPath = placement.scrollPath(p);
    const scroll = placement.scroll(p);
    const cells = placement.cells(p);
    meshes.forEach((mesh, i) => {
      const order = orderOf(p, i);
      // PF-30: the visual's centroid carried into the world as its vertices are (`placeMesh`: the same matrix).
      const centre = mesh.centre ? transformPoint(p.rowMajor, ...mesh.centre) : undefined;
      parts.push({
        ...placeMesh(mesh, p.rowMajor), lit: p.lit || mesh.lit, order, orderEnd: order, cull: mesh.cull, alternate, scroll, cells, reflect: mesh.reflect,
        ...(centre ? { centre } : {}),
        ...(mesh.detailOn ? {} : { detailOn: false }), ...(mesh.detailRange !== undefined ? { detailRange: mesh.detailRange } : {}),
        ...(switchPath !== null ? { switchPath } : {}),
        ...(scrollPath !== null ? { scrollPath } : {}),
        ...(hasVertexAlpha(mesh) ? { vertexAlpha: true } : {}),
        ...(mesh.alphaPass ? { alphaPass: true } : {}),
      });
    });
    for (const strip of lines) segments.add(strip, p.rowMajor, orderOf(p, 0), cells);
  }
  for (const line of piecePlan?.notes ?? []) notes.add(line);
  const worldSwaps: WorldPieceSwap[] | undefined = piecePlan && piecePlan.swaps.length > 0
    ? piecePlan.swaps.map((swap) => ({
        ...swap,
        order: pieceOrder.get(swap.index) ?? 0,
        cells: (pieceCells.get(swap.index) ?? []).slice().sort((a, b) => a - b),
      }))
    : undefined;

  // The props: one entry per model-node, its geometry decoded once and a matrix per placement.
  const props: LoadedMap['props'] = [];
  for (const { p, decoded } of riding) {
    const alternate = placement.alternate(p);
    const order = orderOf(p, 0);
    const geometry: LoadedMesh[] = decoded.meshes.map((mesh, i) => ({
      ...mesh, textureName: mesh.textureName === null ? null : textureKey(mesh.textureName), lit: p.lit || mesh.lit,
      order: orderOf(p, i), orderEnd: orderOf(p, i), cull: mesh.cull, alternate, scroll: placement.scroll(p), reflect: mesh.reflect,
      ...(hasVertexAlpha(mesh) ? { vertexAlpha: true } : {}),
      ...(mesh.alphaPass ? { alphaPass: true } : {}),
    }));
    // A strip has no matrix of its own. It stays in the static line draw; the panel meshes above are what move.
    for (const strip of decoded.lines) segments.add(strip, p.rowMajor, order, placement.cells(p), placement.rank(p));
    const matrices = new Float32Array(16);
    matrices.set(p.world, 0);
    props.push({
      modelName: p.modelName, parts: geometry, matrices, order, alternate, facade: p.facade, lod: null,
      cells: [placement.cells(p)], paths: [p.path], walk: [placement.rank(p)],
    });
  }
  // LATER 141: a strips-only node (strips, no mesh: no entry) -- each placement's walk, its spans re-filed below under the
  // entry at the same model and place (`placementKey`), so the forge's hide drops them with it (FG-32); a turned one too
  // (LATER 120: its own group, the span's walk as any other's).
  const stripsOnly: { key: string; walk: number }[] = [];
  for (const { group, decoded } of instanceShades(placement.props, chunksOf, orderOf)) {
    // Chain Reaction: instance children under the hook, epan_N or hcont_N (go_on_switch among them) would share one
    // InstancedMesh. That draw files the paths on nodePaths, and one bounds can hide every copy. Each riding
    // placement is its own mesh, so the hook's translation and the lever's mesh swap reach it
    // (CRANE_PANEL_WITH_HOOK_READING). The parts still share this group's decoded arrays; `transferables` lists each
    // buffer once. A map with no cranes keeps the group as one draw.
    for (const members of splitCranePlacements(group, placement.cranes ?? [])) {
      const first = members[0]!;
      // Lower-cased here for the same reason the world's names are: `map.textures` is keyed that way, and
      // one Frostfire prop cites `lightDark.tif` with a capital in it.
      // A prop is drawn in up to 26 places; its strips are placed once per placement, which is cheap --
      // 877 segments across the three maps in total.
      const order = orderOf(first, 0);
      for (const placementOf of members) {
        // LATER 120: a turned placement's strips are drawn as its meshes are -- in its model space at its node's origin,
        // turned each frame (`./world`) -- a line group of their own (`LoadedLineGroup.turn`): MP11's bulbs' `wire`.
        const turn = placementOf.facade !== 0 ? { facade: placementOf.facade, matrix: Float32Array.from(placementOf.world) } : undefined;
        for (const strip of decoded.lines) {
          segments.add(strip, turn ? IDENTITY : placementOf.rowMajor, orderOf(placementOf, 0), placement.cells(placementOf), placement.rank(placementOf), turn);
        }
      }
      const alternate = placement.alternate(first);
      const geometry: LoadedMesh[] = decoded.meshes.map((mesh, i) => ({
        ...mesh, textureName: mesh.textureName === null ? null : textureKey(mesh.textureName), lit: first.lit || mesh.lit,
        order: orderOf(first, i), orderEnd: orderOf(first, i), cull: mesh.cull, alternate, scroll: placement.scroll(first), reflect: mesh.reflect,
        ...(hasVertexAlpha(mesh) ? { vertexAlpha: true } : {}),
        ...(mesh.alphaPass ? { alphaPass: true } : {}),
      }));
      if (geometry.length === 0) {
        if (members.length === 1 && (placement.cranes ?? []).some((c) => craneRides(c, first.path))) {
          notes.add(`cranes: ${first.path} decodes to no mesh`);
        }
        if (decoded.lines.length) for (const p of members) stripsOnly.push({ key: placementKey(p.modelName, p.world[12]!, p.world[13]!, p.world[14]!), walk: placement.rank(p) });
        continue;
      }
      const matrices = new Float32Array(members.length * 16);
      members.forEach((p, i) => matrices.set(p.world, i * 16));
      props.push({
        modelName: first.modelName, parts: geometry, matrices, order, alternate,
        facade: first.facade, lod: placement.lod.get(first.modelName) ?? null,
        cells: members.map((p) => placement.cells(p)),
        paths: members.map((p) => p.path),
        walk: members.map((p) => placement.rank(p)),
      });
    }
  }
  if (stripsOnly.length) {
    const entryWalk = new Map<string, number>();
    for (const q of props) q.walk?.forEach((w, i) => { const k = placementKey(q.modelName, q.matrices[i * 16 + 12]!, q.matrices[i * 16 + 13]!, q.matrices[i * 16 + 14]!); if (!entryWalk.has(k)) entryWalk.set(k, w); });
    for (const s of stripsOnly) { const to = entryWalk.get(s.key); if (to !== undefined) segments.rewalk(s.walk, to); }
  }

  // W2.1: the player's body, decoded here so its textures join the ones decoded below (`./body`).
  const characterSource = await characterTableFor(source, path);
  const body = loadBody(bytes, toc, characterSource, (line) => notes.add(line));
  // Web sprint 3 M5: the map's first Terrorist, only once the SEAL loaded; a failure is a note.
  const terrorist = body ? loadBody(bytes, toc, characterSource, (line) => notes.add(line), 'terrorists') : null;
  // Web sprint 5 S2: the other ARMORY types' bodies, each side's first being the two above (the SEAL's placed below).
  const types = body ? typeBodies(bytes, toc, characterSource, (line) => notes.add(line), body, terrorist) : undefined;
  let characters: Awaited<ReturnType<typeof loadCharacterAssets>> = null;
  const characterNotes = new Set<string>();
  try {
    characters = await loadCharacterAssets(source, path, bytes, toc, characterSource, (line) => characterNotes.add(line));
  } catch (e) {
    // An unavailable optional appearance library leaves the native bodies and map playable.
    notes.add(`characters: ${say(e)}`);
  }
  // Web sprint 4: the arsenal -- the source's ZWEAPON.ZAR once (read above), this map's kits off its own READERM.ZAR.
  if (!kitSource) notes.add('arsenal: no RUN/ZWEAPON.ZAR or READERC.ZAR -- the baked M4A1 SD and Mark 23');
  const arsenal = kitSource ? simKitsFromBytes(kitSource, bytes) : undefined;
  if (arsenal && !arsenal.map) notes.add('arsenal: READERM.ZAR has no kits -- the baked M4A1 SD and Mark 23');
  const gameType = kitGameType(kitSource, stem);     // PF-40: the offline room's mode, as the server reads it
  // MAP-10a: the turrets off the same kit source's READERC and arsenal, the graph `place` parsed reused.
  const turrets = mapTurrets(bytes, stem, kitSource, (line) => notes.add(line), placement.models);
  // W2.4, M3: the held weapons, decoded here with the map so their textures come out of the same asset-library chain.
  const weapons = heldWeapons(bytes, toc, notes, arsenal);
  // The frag grenade (`./grenadeAssets`): its model's textures are decoded with the held weapon's below.
  const grenade = loadGrenadeAssets(bytes, toc, stem, textureKey, (line) => notes.add(line), arsenal ? equipmentModels(arsenal) : []);

  // The textures those meshes name, and only those: a map's TXR holds every texture the mission uses.
  // A TXR or PAL member that will not parse at all costs one diagnostic and the untextured map, not the
  // load: vertex colours alone still show the geometry, which is what a diagnosing eye is here for.
  const textures: Record<string, Rgba> = {};
  const textureMips: Record<string, Rgba[]> = {};
  const textureFlags: Record<string, TextureFlags> = {};
  // The textures the world, the props, the held weapon (W2.4) and the player's body (W2.1) draw.
  const heldParts = Object.values(weapons ?? {}).flatMap((w) => w.parts);
  const drawn = [...parts, ...props.flatMap((p) => p.parts), ...heldParts, ...grenade.models.flatMap((m) => m.parts)]
    .map((mesh) => (mesh.textureName === null ? null : textureKey(mesh.textureName)))
    .concat(body ? bodyTextureNames(body) : [])
    .concat(terrorist ? bodyTextureNames(terrorist) : [])
    .concat(types ? [...types.seal, ...types.terrorist, ...(types.escortees ?? [])].flatMap((b) => (b ? bodyTextureNames(b) : [])) : []);
  // W1.6: the detail pass each drawn texture binds, and its texture decoded with the rest.
  const detail = detailBindings(texManifest(bytes, toc, notes), drawn.filter((n): n is string => n !== null));
  // The reflection materials some draw names (the env pass), their textures decoded with the rest.
  const envNamed = new Set([...parts, ...props.flatMap((p) => p.parts)].map((m) => m.reflect ?? 0).filter((e) => e > 0));
  const usedEnv = envPalette(bytes, toc, stem, notes).filter((e) => envNamed.has(e.index + 1));
  const texlib = textureLibrary(bytes, toc, stem, notes);
  if (texlib) {
    const { palettes, keys, libs } = texlib;
    // The env pass's default (`DAT_004b4d90`) whenever any draw has the pass: an entry's texture may not resolve.
    const envTextures = usedEnv.length > 0 ? [...usedEnv.map((e) => e.texture), DEFAULT_ENV_TEXTURE] : [];
    const wanted = [...drawn, ...Object.values(detail).map((d) => d.name), ...envTextures];
    let decoded = 0;
    for (const name of wanted) {
      step('textures', decoded++, wanted.length);
      if (name === null || name in textures) continue;
      const hit = keys.get(name);
      if (!hit) {
        notes.add(`texture ${name}: in none of the map's ${libs} asset libs`);
        continue;
      }
      const { zar: txr, key } = hit;
      const texdat = txr.child(key, 'texdat');
      if (!texdat) {
        notes.add(`texture ${name}: no texdat key`);
        continue;
      }
      try {
        const record = parseTextureRecord(key.name, txr.data(texdat));
        const decoded = decodeTexture(record, palettes);
        for (const d of decoded.diagnostics) notes.add(`texture ${name}: ${d}`);
        textures[name] = decoded.rgba;
        const mips = mipLevels(txr, record, palettes, (line) => notes.add(`texture ${name}: ${line}`));
        if (mips) textureMips[name] = mips;
        textureFlags[name] = {
          bilinear: record.bilinear, transparent: record.transparent, graded: isGraded(decoded.rgba),
          opaque: isOpaque(decoded.rgba), gs: record.gs,
        };
      } catch (e) {
        notes.add(`texture ${name}: ${say(e)}`);
      }
    }
  }
  for (const [name, { rgba, record }] of Object.entries(characters?.textures ?? {})) {
    textures[name] = rgba;
    textureFlags[name] = {
      bilinear: record.bilinear, transparent: record.transparent, graded: isGraded(rgba), opaque: isOpaque(rgba), gs: record.gs,
    };
  }
  // A detail texture that did not decode has had its diagnostic above; its pass is not drawn.
  for (const [base, d] of Object.entries(detail)) if (!(d.name in textures)) delete detail[base];

  const world = mergeWorld(parts, textureFlags, detail);

  const name = missionName(bytes, toc, notes) ?? stem;
  const scenicViews = missionScenicViews(bytes, toc, notes);   // PF-31: the spectator's fixed views
  const reverb = missionReverb(bytes, toc, notes);
  // W1.4b: the probe's grid, built here once for the two things a load stands on the floor -- the opening stand
  // and the spawn slots -- so the page's thread does not pay for it; the walk builds its own when first asked.
  const probe = placement.ground ? groundGrid(placement.ground) : undefined;
  const measured = spawnsFor(name);
  const slots = spawnSlotsOf(bytes, toc, measured, (line) => notes.add(line), probe);
  // W2.1: the body stands at slot A; its type entry is the placed body itself (`OwnBody` compares bodies by identity).
  const placedBody = body && placeBody(body, slots);
  if (types) types.seal = types.seal.map((b) => (b === body ? placedBody : b));
  const respawns = spawnSlotsOf(bytes, toc, measured, () => {}, probe, true);   // the slots' own line says it once
  const ai = aiMapsFromBytes(bytes, toc);
  const bombStart = ai ? bombStartOf(ai) : undefined;   // XR-05: DEMOLITION's StartBomb, as the server reads it
  // W0: the hostage mode's ground for the offline room, as `simMapFromBytes` reads it (HX-0b).
  const escortees = ai ? mapEscortees(bytes, toc, ai, (line) => notes.add(line)) : undefined;
  const reticle = readReticle(bytes, toc);
  for (const line of reticle.diagnostics) notes.add(line);
  const bulletMark = readEffectBitmap(bytes, toc, BULLET_MARK.texture);
  for (const line of bulletMark.diagnostics) notes.add(line);
  // The HUD weapon box's icons (research 94 §C9): every firearm's `IconTextureName`, beside the HUD's own.
  const hud = readHud(bytes, toc, arsenal ? arsenalIcons(arsenal) : []);
  for (const line of hud.diagnostics) notes.add(line);
  // MAP-01: the actions off the metadata `place` read with the scene graph; without a graph, read on their own.
  const actions = placement.meta ? { actions: placement.meta.actions, diagnostics: placement.meta.diagnostics } : readMapActions(bytes, toc, stem);
  for (const line of actions.diagnostics) notes.add(line);
  const instanceRoots = placement.models ? instanceRootMatrices(placement.models) : [];
  const ambientPlaces = placement.models && placement.meta?.scene ? ambientNodePlaces(placement.models, placement.meta.scene.programs.map((p) => p.program)) : [];
  const tac = readTacData(bytes, toc);
  for (const line of tac.diagnostics) notes.add(line);
  return {
    victory: victoryFromBytes(bytes, kitSource?.readerc ?? null),
    archive: stem,
    lines: segments.result(),
    camera: cameraParams(bytes, toc, stem, notes),
    path,
    name,
    world,
    props,
    modelLibraries,
    ambientPlaces,
    textures,
    textureMips,
    envMaterials: usedEnv.map((e) => (e.texture in textures ? e : { ...e, texture: DEFAULT_ENV_TEXTURE })).filter((e) => e.texture in textures),
    shadowVector: shadowVectorOf(bytes, toc, stem),
    textureFlags,
    detail,
    metersPerUnit: metersPerUnit(bytes, toc, stem, notes),
    night: nightOf(bytes, toc, stem, notes),
    grid,
    lightRig: lightRig(bytes, toc, stem, notes),
    origin: placement.origin,
    collision: placement.collision,
    slots,
    respawns,
    body: placedBody,
    terrorist,
    ...(types ? { types } : {}),
    ...(characters ? { characters: { catalogue: characters.catalogue, bodies: characters.bodies, diagnostics: [...characterNotes] } } : {}),
    ground: placement.ground,
    doors: placement.doors ?? [],
    gates: placement.gates ?? [],
    cranes: placement.cranes ?? [],
    ...(measured ? { stand: openingStand(measured.a, probe), standB: openingStand(measured.b, probe) } : {}),
    ...(weapons ? { weapons } : {}),
    ...(arsenal ? { arsenal } : {}),
    ...(gameType !== undefined ? { gameType } : {}),
    ...(turrets ? { turrets } : {}),
    ...(bombStart ? { bombStart } : {}),
    ...(ai ? { ai } : {}),
    ...(escortees ? { escortees } : {}),
    ...(scenicViews.length ? { scenicViews } : {}),
    ...(reverb ? { reverb } : {}),
    grenade,
    reticle: reticle.bitmaps,
    bulletMark: bulletMark.rgba,
    hud: hud.bitmaps,
    actions: actions.actions,
    ...(placement.meta ? { meta: placement.meta } : {}),
    ...(instanceRoots.length ? { instanceRoots } : {}),
    ...(worldSwaps ? { worldSwaps } : {}),
    ...(options?.listWorldPieces && piecePlan ? { worldPieceList: piecePlan.list } : {}),
    ...(piecePlan && piecePlan.keptMoving.length > 0 ? { worldPiecesKept: piecePlan.keptMoving } : {}),
    ...(piecePlan && piecePlan.keptPropsOnly.length > 0 ? { worldPiecesPropsOnly: piecePlan.keptPropsOnly } : {}),
    tac: tac.data,
    diagnostics: notes.lines,
    loadMs: Date.now() - started,
    timings: { fetch: T1 - T0, decode: performance.now() - T1, postedAt: Date.now() },
  };
}

/**
 * Each side's ARMORY types' bodies (web sprint 5 S2; research 95 §6): `chartype.rdr`'s `navyseals` and `terrorists` in
 * order, at most `ARMORY_TYPES_PER_SIDE`, the first of each the body already decoded (`first`), a character named again
 * sharing its body. A type whose body will not decode is null (its player is drawn as its side's first, `./teamBody`).
 */
function typeBodies(bytes: Uint8Array, toc: ZdbEntry[], characters: CharacterSource, note: (line: string) => void,
  seal: LoadedBody | null, terrorist: LoadedBody | null): { seal: (LoadedBody | null)[]; terrorist: (LoadedBody | null)[]; escortees?: (LoadedBody | null)[] } {
  const side = (team: 'navyseals' | 'terrorists', first: LoadedBody | null): (LoadedBody | null)[] => {
    const out: (LoadedBody | null)[] = [first];
    const seen = new Map<string, LoadedBody | null>();
    if (first?.character) seen.set(first.character, first);
    for (let i = 1; i < ARMORY_TYPES_PER_SIDE; i++) {
      const character = mapPlayer(bytes, toc, team, i);
      if (!character) break;
      if (!seen.has(character)) seen.set(character, loadBody(bytes, toc, characters, note, team, i));
      out.push(seen.get(character)!);
    }
    return out;
  };
  // HX-2 (research 238 §1): each escortee entry the map lists (MP6's three; none elsewhere: read, never assumed), a
  // character named twice sharing its body; a hostage's body that will not decode is null (its id is then not drawn).
  const escortees: (LoadedBody | null)[] = [];
  const seen = new Map<string, LoadedBody | null>();
  for (let i = 0; ; i++) {
    const character = mapPlayer(bytes, toc, 'escortees', i);
    if (!character) break;
    if (!seen.has(character)) seen.set(character, loadBody(bytes, toc, characters, note, 'escortees', i));
    escortees.push(seen.get(character)!);
  }
  return { seal: side('navyseals', seal), terrorist: side('terrorists', terrorist), ...(escortees.length ? { escortees } : {}) };
}

/**
 * Every typed array in a `LoadedMap`, for the worker's transfer list: no copies cross the boundary. Each buffer once.
 * Split crane placements share one decoded mesh, and the character types share a body. The same `ArrayBuffer` twice,
 * or one already detached by an earlier entry, makes `postMessage` throw `DataCloneError`.
 */
export function transferables(map: LoadedMap): Transferable[] {
  const out: Transferable[] = [];
  const seen = new Set<ArrayBufferLike>();
  const add = (buffer: ArrayBufferLike): void => {
    if (seen.has(buffer)) return;
    seen.add(buffer);
    out.push(buffer as ArrayBuffer);
  };
  for (const mesh of [...map.world, ...map.props.flatMap((p) => p.parts), ...Object.values(map.weapons ?? {}).flatMap((w) => w.parts)]) {
    add(mesh.positions.buffer);
    add(mesh.uvs.buffer);
    add(mesh.colors.buffer);
    add(mesh.indices.buffer);
    if (mesh.normals) add(mesh.normals.buffer);
    if (mesh.faceNormals) add(mesh.faceNormals.buffer);
    if (mesh.centroids) add(mesh.centroids.buffer);
  }
  for (const prop of map.props) add(prop.matrices.buffer);
  for (const swap of map.worldSwaps ?? []) add(swap.anchor.buffer);
  add(map.collision.positions.buffer);
  add(map.collision.colors.buffer);
  if (map.ground) { add(map.ground.points.buffer); add(map.ground.fields.buffer); }
  for (const g of map.lines ?? []) { add(g.positions.buffer); add(g.uvs.buffer); add(g.colors.buffer); add(g.normals.buffer); }
  for (const rgba of Object.values(map.textures)) add(rgba.data.buffer);
  for (const levels of Object.values(map.textureMips ?? {})) for (const rgba of levels) add(rgba.data.buffer);
  // Each body's buffers once: the types share `body`'s and `terrorist`'s, a character named twice shares its body, and
  // a native type and a regional alias can share one.
  const bodies = new Set([map.body, map.terrorist, ...(map.types?.seal ?? []), ...(map.types?.terrorist ?? []), ...(map.types?.escortees ?? []),
    ...Object.values(map.characters?.bodies ?? {})]
    .filter((b): b is LoadedBody => !!b));
  for (const buffer of [...bodies].flatMap((b) => bodyTransferables(b))) add(buffer as ArrayBuffer);
  for (const rgba of [map.reticle?.fixed, map.reticle?.floating, map.reticle?.accuracy, map.bulletMark]) if (rgba) add(rgba.data.buffer);
  for (const rgba of Object.values(map.hud ?? {})) add(rgba.data.buffer);
  if (map.grenade) for (const buffer of grenadeTransferables(map.grenade)) add(buffer as ArrayBuffer);
  return out;
}

/**
 * The arsenal's HUD icons, lower case (the HUD's keys): every item's `IconTextureName` -- the firearms' for the weapon
 * box, every launcher round's (a round mode's fire-mode cell, `firemode_203_frag.tif` ...; web sprint 4 M4, research 94
 * §C9), and every card WEAPON EXCHANGE may draw (research 94 §B5: the icon of each listed item, equipment included, all
 * in `COMMON/HUDW_TXR.ZED`; `./weaponSelect` `weaponSelectTextures`). Only what a card can show: a firearm, a round, or
 * an item a valve can enable (`VALVE_OF_ITEM`: the menu lists nothing else, `FUN_0023c390`) -- the records outside the
 * arsenal (the binoculars, a `(null)` icon) name bitmaps no library holds.
 */
function arsenalIcons(arsenal: SimKits): string[] {
  const icons = new Set<string>();
  for (const item of arsenal.table.arsenal.items.values()) {
    const round = item.cls === 'launcherRound' || item.cls === 'rocketRound';
    // M7 (research 94 §C9): the equipment the box shows too -- `AT4_icon.tif`, `RPG_icon.tif`, `c4.tif`,
    // `PMN_mine_icon.tif`, `detonator_icon.tif` (the Detonator has no valve) -- not the Binoculars' or the internal rows'.
    const kind = equipmentKind(item.id);
    const equipment = kind === 'throwable' || kind === 'placed' || kind === 'c4' || kind === 'launcher' || kind === 'detonator';
    // PAR-55 (research 215 s8): a mounted turret's weapon is the box's item (`Turret_RMG.tif`, `Turret_LMG.tif`, HUDW_TXR's);
    // PAR-57: MGL FRAG TURRET's too (`Turret_MGL.tif`, class 230, the arsenal's `turret2`).
    const turret = item.cls === 'turret' || item.cls === 'turret2';
    if (!item.icon || !/\.tif$/i.test(item.icon) || (item.kind === 'equipment' && !round && !equipment && !turret && !VALVE_OF_ITEM.has(item.id))) continue;
    icons.add(item.icon.toLowerCase());
  }
  return [...icons];
}

/**
 * M7: the equipment's models the thrower and the flight draw beside the baked throwables' (`./grenadeAssets`): every
 * grenade's, placed charge's and launched round's `ModelName` (the PMN's `PMN_mine`, C4's `c4`, the rockets' `AT4_Heat`
 * and `RPGrenade`, the 40 mm rounds'), read off the arsenal.
 */
function equipmentModels(arsenal: SimKits): string[] {
  const out = new Set<string>();
  for (const item of arsenal.table.arsenal.items.values()) {
    const c = item.cls;
    if ((c === 'grenade' || c === 'explosive' || c === 'launcherRound' || c === 'rocketRound') && item.model) out.add(item.model);
  }
  return [...out];
}

/**
 * W2.4, web sprint 4 M3: the held weapons (`LoadedMap.weapons`) out of the map's own `WEAP_GEO`/`WEAP_MDL` (`@s2u/scene`'s
 * `weaponLibrary`, socomlegacy/docs/research/79 §2), the library parsed once: every firearm model the arsenal names
 * (the loadout may hold any, and a pick may change it at the next spawn), or the baked pair's two without the arsenal.
 * A record's `ModelName` is looked up case aside -- the SA-80's `IW80A2` is every library's `iw80a2`, and the retail
 * SA-80 draws (MODEL_NAME_CASE_READING: the game's compare was not traced) -- and kept under the record's spelling.
 * A model the library lacks (a `placeholder`, `NULL`) is left out, and said only when a kit of the map holds it. A library that will not read costs one diagnostic and the weapons, never the load; a chunk that
 * will not decode costs its own line and nothing else.
 */
function heldWeapons(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes, arsenal: SimKits | undefined): Record<string, HeldWeapon> | undefined {
  let library: ReturnType<typeof weaponLibrary>;
  try {
    library = weaponLibrary(Zar.parse(zdbMember(bytes, toc, WEAPON_MEMBERS.geo)), Zar.parse(zdbMember(bytes, toc, WEAPON_MEMBERS.mdl)));
  } catch (e) {
    notes.add(`weapons: ${say(e)}`);
    return undefined;
  }
  // The models the map's kits hold at their spawns: a missing one of these is a diagnostic.
  const kitModels = new Set<string>();
  for (const k of arsenal?.map ? [...arsenal.map.kits.seal, ...arsenal.map.kits.terrorist] : []) {
    for (const slot of [0, 1] as const) { const m = slotModel(arsenal!.table, k.loadout, slot); if (m) kitModels.add(m); }
  }
  const wanted = new Set<string>();
  if (arsenal) {
    // M7: the rocket launchers too (the LAW's `AT4`, the RPG-7's `RPG7`): raised in the hand, their `firepoint` the rocket's.
    for (const item of arsenal.table.arsenal.items.values()) if ((item.kind !== 'equipment' || item.cls === 'rocketLauncher') && item.model) wanted.add(item.model);
  } else {
    for (const slot of [0, 1] as const) wanted.add(slotModel(null, BAKED_LOADOUT, slot)!);
  }
  const MODEL_NAME_CASE_READING = new Map(library.names().map((n) => [n.toLowerCase(), n] as const));
  const out: Record<string, HeldWeapon> = {};
  for (const model of wanted) {
    const name = MODEL_NAME_CASE_READING.get(model.toLowerCase());
    if (name === undefined) {
      if (kitModels.has(model) || !arsenal) notes.add(`weapon ${model}: not in the map's weapon library`);
      continue;
    }
    try {
      const decoded = library.decode(name, 'high');
      for (const d of decoded.diagnostics) notes.add(`weapon ${decoded.name}: ${d}`);
      const parts: LoadedMesh[] = decoded.parts.flatMap((part) => part.meshes.map((mesh) => ({
        ...mesh, textureName: mesh.textureName === null ? null : textureKey(mesh.textureName),
        order: 0, orderEnd: 0, alternate: false, scroll: null, node: part.node,
      })));
      out[model] = { name: decoded.name, parts, points: decoded.points };
    } catch (e) {
      notes.add(`weapon ${model}: ${say(e)}`);
    }
  }
  return out;
}

/**
 * W1.5b: the map's spawn slots, read out of its `AIMAPS.MPS` (socomlegacy/docs/research/75) and placed
 * (`placeSpawnSlots`): the y the ground probe's floor under each slot's centre when the probe's grid is given
 * (W1.4b), else its cell's height (`aiCellY`, research 179 section 9.14). A file that is missing or will not read -- the
 * reader refuses any file its layout does not account for to the last byte -- costs one diagnostic and an empty
 * list, never the load: the slots are an overlay, and the map draws without them.
 */
export function spawnSlotsOf(bytes: Uint8Array, toc: ZdbEntry[], measured: Spawns | undefined, note: (line: string) => void, ground?: Grid, twins = false): SpawnSlot[] {
  try {
    return placeSpawnSlots(parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS')), measured, ground, twins);
  } catch (e) {
    note(`spawn slots: ${say(e)}`);
    return [];
  }
}

/**
 * The map's parsed `AIMAPS.MPS` (`SimMap.ai`), or undefined -- a missing or unreadable file is the slots' line. XR-05's
 * StartBomb (`./simMap` `bombStartOf`) and W0's escortees are read off it.
 */
export function aiMapsFromBytes(bytes: Uint8Array, toc: ZdbEntry[]): AiMaps | undefined {
  try {
    return parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
  } catch {
    return undefined;
  }
}

/** 36 section 6: the shown name is `READERM.ZAR/mission.rdr`'s `description`, as `listMaps` reads it. */
function missionName(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): string | null {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const mission = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
    if (!mission) return null;
    const name = rdrGet(parseRdr(readerm.data(mission)), 'description');
    return typeof name === 'string' ? name : null;
  } catch (e) {
    notes.add(`mission name: ${say(e)}`);
    return null;
  }
}

/** `mission.rdr`'s reverb zones as the sound reads them (`./soundData` `reverbZones`); null when the mission will not read. */
function missionReverb(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): { indoor: [number, number][]; outdoor: [number, number][] } | null {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
    if (!key) return null;
    const mission = parseRdr(readerm.data(key));
    return { indoor: reverbZones(rdrGet(mission, 'IndoorReverb')), outdoor: reverbZones(rdrGet(mission, 'OutdoorReverb')) };
  } catch (e) {
    notes.add(`mission reverb: ${say(e)}`);
    return null;
  }
}

/** PF-31: `mission.rdr`'s `Scenic_Views` (`./mapMeta` `scenicViewsOf`), read beside its `description`; none when they do not read. */
function missionScenicViews(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): ScenicView[] {
  try {
    return scenicViewsOf(bytes, toc);
  } catch (e) {
    notes.add(`scenic views: ${say(e)}`);
    return [];
  }
}

/**
 * Every texture manifest `READERM.ZAR` holds -- one `*_lib.rdr` per library the map loads, `mp51_lib.rdr`
 * beside `rm51_lib.rdr` -- read (`readTexManifest`, socomlegacy/docs/research/72 §6) and merged, the first entry
 * of a name winning as it does within one file. No name is listed by two files on the disc.
 */
function texManifest(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): Map<string, TexEntry> {
  const out = new Map<string, TexEntry>();
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    for (const key of readerm.root.children) {
      if (!/_lib\.rdr$/i.test(key.name)) continue;
      try {
        for (const [name, entry] of readTexManifest(parseRdr(readerm.data(key)))) if (!out.has(name)) out.set(name, entry);
      } catch (e) {
        notes.add(`texture manifest ${key.name}: ${say(e)}`);
      }
    }
  } catch (e) {
    notes.add(`texture manifest: ${say(e)}`);
  }
  return out;
}

/**
 * The detail pass each drawn texture binds: its manifest entry's `detail` record, the detail texture named
 * as `LoadedMap.textures` keys it. Binding by texture is the disc's own rule -- over the 22 maps every one
 * of the 2,395 visuals drawn with a texture that has a detail record carries a `detail_buff` of its own
 * (`CVisual::Read`, `zVisual/vis_main.cpp:276-296`), and no visual drawn with one lacks it.
 */
export function detailBindings(manifest: ReadonlyMap<string, TexEntry>, drawn: Iterable<string>): Record<string, TexDetail> {
  const out: Record<string, TexDetail> = {};
  for (const name of drawn) {
    const d = manifest.get(name)?.detail;
    if (d && !(name in out)) out[name] = { ...d, name: textureKey(d.name) };
  }
  return out;
}

/**
 * The world's chunks merged into its draws (`LoadedMap.world`).
 *
 * One draw call per texture: Frostfire's 416 packets cite 37 names, and merging by name turns 416 draws
 * into 37 without touching a vertex. What splits a texture's draw:
 *
 * - **Fog.** A packet's `PRIM.FGE` (SEMANTICS §3, `MeshData.fog`) is per packet, and a texture can be
 *   drawn both ways -- half of Frostfire's sky is fogged and half is not -- so the merge keys on it.
 * - **A ramp of alpha.** A blended surface is drawn where the engine's walk reached it, and where
 *   that is only means something if it is its own draw: the graded textures keep one mesh per chunk,
 *   which is the granularity the hardware drew them at anyway. And the opaque draws around it must
 *   not straddle it -- a wall merged across a glow would be drawn wholly before or wholly after it --
 *   so the merge is cut at every blended chunk: a texture's draws are one per *run* of the walk
 *   between blended chunks, and `order`/`orderEnd` say which run. A ramp in the **vertices**
 *   (`LoadedMesh.vertexAlpha`) is the same case: the GS blends by `At x Af`, so a solid texture whose
 *   packet fades by vertex alpha -- the grass laid over Vigilance's cobbles -- is a blended draw of its
 *   own, drawn after the layer it fades onto, not merged into that texture's opaque run where it would
 *   lose the ramp and z-fight the layer beneath (research 82 round 5). A cutout (`TEST.ATE`) is not: its
 *   test is on the modulated alpha and it needs no place of its own.
 * - **The alpha pass.** A visual the engine holds back into its alpha pass (`LoadedMesh.alphaPass`) is
 *   drawn after the walk, far to near, so it keeps its own draw too, out of the runs.
 * - **The detail pass** (PF-30): a texture that binds one is split where its visuals disagree on `vparams` bit 14 or
 *   on their gate's range, and its parts carry their centroids per vertex, so each draw is switched whole.
 */
export function mergeWorld(
  parts: readonly LoadedMesh[], textureFlags: Readonly<Record<string, TextureFlags>>, detail: Readonly<Record<string, TexDetail>>,
): LoadedMesh[] {
  const byGroup = new Map<string, LoadedMesh[]>();
  let run = 0;
  for (const part of parts) {
    const key = part.textureName === null ? '' : textureKey(part.textureName);
    const flags = key === '' ? undefined : textureFlags[key];
    const blended = isOwnDraw(part, flags);
    // A lit part (`PlacedModel.lit`) keeps its own draw as well: the rig is applied per vertex, and a
    // merge cannot be half lit.
    const scroll = part.scroll ? `|s${part.scroll[0]},${part.scroll[1]}` : '';
    // MAP-02: a chunk zAnim can switch is merged only with its own path's (`LoadedMesh.switchPath`).
    // PF-30: a detail-bound texture's run is split where its visuals disagree on bit 14 or on their gate's range, so
    // every draw is gated whole (`LoadedMesh.detailOn`, `detailRange`); a texture with no detail pass is not split.
    const bound = key !== '' && detail[key] !== undefined;
    const gate = bound ? `|d${part.detailOn === false ? 0 : 1}${part.detailRange !== undefined ? `:${part.detailRange}` : ''}` : '';
    const group = `${key}|${part.fog ? 1 : 0}${part.lit ? 'L' : ''}${part.cull ? 'C' : ''}${part.alternate ? 'A' : ''}${part.vertexAlpha ? 'V' : ''}${part.alphaPass ? 'P' : ''}${scroll}|e${part.reflect ?? 0}|${blended ? `b${part.order}` : `r${run}`}${part.switchPath ? `|w${part.switchPath}` : ''}${part.scrollPath ? `|x${part.scrollPath}` : ''}${gate}`;
    if (blended) run++;
    // PF-30: a detail-bound part brings its visual's centroid on every vertex (`MeshData.centroids`, kept through
    // `mergeMeshes`); the other draws spend nothing on it.
    const placed = bound ? { ...part, centroids: part.centroids ?? centroidsOf(part, part.centre ?? centreOf(part)) } : part;
    const list = byGroup.get(group);
    if (list) list.push(placed);
    else byGroup.set(group, [placed]);
  }
  return [...byGroup.values()].map((list) => ({
    ...mergeMeshes(list),
    // `mergeMeshes` drops the name when parts disagree; here they agree by construction.
    textureName: list[0]!.textureName === null ? null : textureKey(list[0]!.textureName),
    lit: list[0]!.lit,
    order: list[0]!.order,
    orderEnd: list[list.length - 1]!.order,
    cull: list[0]!.cull,
    alternate: list[0]!.alternate,
    ...(list[0]!.switchPath ? { switchPath: list[0]!.switchPath } : {}),
    ...(list[0]!.scrollPath ? { scrollPath: list[0]!.scrollPath } : {}),
    scroll: list[0]!.scroll,
    reflect: list[0]!.reflect ?? 0,
    cells: unionCells(list.map((part) => part.cells ?? [])),
    ...(list[0]!.vertexAlpha ? { vertexAlpha: true } : {}),
    ...(list[0]!.alphaPass ? { alphaPass: true } : {}),
    // LATER 593 (F3): an alpha-pass draw is one visual's (its own run, `b<order>`), keyed by its centroid
    // (`FUN_003371b0` D:L235314-235317); kept where its parts agree on it, else the world keys it by its box.
    ...(list[0]!.alphaPass && list[0]!.centre && list.every((p) => sameCentre(p.centre, list[0]!.centre)) ? { centre: list[0]!.centre } : {}),
    ...(list[0]!.centroids && list[0]!.detailOn === false ? { detailOn: false } : {}),
    ...(list[0]!.centroids && list[0]!.detailRange !== undefined ? { detailRange: list[0]!.detailRange } : {}),
  })).sort((a, b) => a.order - b.order);
}

const sameCentre = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Whether a decoded texture's alpha is a ramp rather than a switch. A corona, a glow or a soft-edged
 * decal has alpha between 0 and full; a cutout leaf or a wall has only the two ends. The flag on the
 * record says a texture *has* alpha, not what shape it is, and drawing a ramp with an alpha test is
 * what turns a light into a flat disc on a black square.
 */
/**
 * Is every pixel solid? A texture with so much as a punched-out corner is a *sheet* -- a leaf card, a
 * chain-link panel, a frond -- and the artists drew those as one face meant to be seen from both sides.
 * An all-solid texture skins a closed thing, and `world.ts` culls its back faces.
 *
 * Sampled the same way `isGraded` samples, and by the same 247 threshold, so the two agree about what
 * counts as solid.
 */
/**
 * Whether a packet's vertices carry an alpha below unity: the fourth lane of `colors` (the byte over 128, 1 the PS2's
 * unity; not lit, `./lighting`). What `LoadedMesh.vertexAlpha` records; about 1,700 packets over the 22 maps, none
 * without `PRIM.ABE`.
 */
/**
 * Whether a part keeps a draw of its own in the walk, out of its texture's merged runs (the merge above): a graded
 * texture that is not opaque; a vertex-alpha ramp that is no cutout (the cutout's test is on the modulated alpha);
 * or a visual of the engine's alpha pass, whatever its texture (research 82 round 5). Pure, so each clause is pinned.
 */
export function isOwnDraw(part: Pick<LoadedMesh, 'vertexAlpha' | 'alphaPass'>, flags: TextureFlags | undefined): boolean {
  const cutout = flags?.gs?.alphaTest !== null && flags?.gs?.alphaTest !== undefined;
  return ((flags?.graded ?? false) && !(flags?.opaque ?? true)) || (part.vertexAlpha === true && !cutout) || part.alphaPass === true;
}

export function hasVertexAlpha(mesh: Pick<MeshData, 'colors'>): boolean {
  for (let i = 3; i < mesh.colors.length; i += 4) if (mesh.colors[i]! < 1) return true;
  return false;
}

/** `MP*.ZED/cameras/camera`: fog colour, range and flags, the way the level authored them. */
function cameraParams(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): CameraParams | null {
  try {
    const params = parseCameraParams(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
    if (!params) notes.add(`${stem}.ZED: no cameras/camera key, so no fog`);
    return params;
  } catch (e) {
    notes.add(`cameras/camera: ${say(e)}`);
    return null;
  }
}

/** `MP*.ZED/MetersPerUnit`, the scale the research tables quote positions in. */
function metersPerUnit(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): number {
  try {
    const zed = Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`));
    const key = zed.find('MetersPerUnit');
    if (key && key.size === 4) return new Reader(zed.data(key)).f32(0);
    notes.add(`${stem}.ZED: no MetersPerUnit key, assuming ${DEFAULT_METERS_PER_UNIT}`);
  } catch (e) {
    notes.add(`MetersPerUnit: ${say(e)}`);
  }
  return DEFAULT_METERS_PER_UNIT;
}

/** `MP*.ZED/NightMission` and `LensFX_NVG` (a u32 flag and four f32s; `FUN_00318da0`). */
function nightOf(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): { mission: boolean; lens: [number, number, number, number] | null } {
  try {
    const zed = Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`));
    const flag = zed.find('NightMission'), lens = zed.find('LensFX_NVG');
    const mission = !!flag && flag.size >= 4 && new Reader(zed.data(flag)).u32(0) !== 0;
    const r = lens && lens.size >= 16 ? new Reader(zed.data(lens)) : null;
    return { mission, lens: r ? [r.f32(0), r.f32(4), r.f32(8), r.f32(12)] : null };
  } catch (e) {
    notes.add(`NightMission: ${say(e)}`);
    return { mission: false, lens: null };
  }
}

/** `MP*.ZED/grid_params` (`parseGridParams`, which takes the engine's default grid when the key is absent). */
function worldGrid(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): GridParams {
  try {
    return parseGridParams(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
  } catch (e) {
    notes.add(`grid_params: ${say(e)}`);
    return DEFAULT_GRID_PARAMS;
  }
}

/** The cells of several draws as one sorted list, each once. */
function unionCells(lists: Iterable<Iterable<number>>): number[] {
  const out = new Set<number>();
  for (const list of lists) for (const c of list) out.add(c);
  return [...out].sort((a, b) => a - b);
}

/**
 * `MP*.ZED/GlobalLighting`, the map's three directional lights and its ambient. All 34 maps carry it,
 * so an absence is worth a diagnostic rather than a silent fallback.
 */
function lightRig(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): GlobalLighting | null {
  try {
    const rig = parseGlobalLighting(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
    if (!rig) notes.add(`${stem}.ZED: no GlobalLighting key, lighting with a stand-in rig`);
    return rig;
  } catch (e) {
    notes.add(`GlobalLighting: ${say(e)}`);
    return null;
  }
}

/**
 * 36 section 2: the model buffers a map draws from. None of the three is required: a map missing its
 * world buffer still draws its props, and one missing a prop library still draws its world, each absence
 * costing one diagnostic. `decoder` names whatever the scene graph then asks for and cannot find.
 *
 * `CLIB_MDL.ZED` is deliberately absent, its models being the `MESH_` form the scene graph never names.
 * Each archive comes with the position form its chains are drawn in (`archivePositionForm`, research 79 §2): the
 * turret libraries' parts (`turretParts`) are `'scale'`, the world and the props `'bias'`.
 */
function mdlArchives(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): { zar: Zar; form: PositionForm; lib: string }[] {
  // The same asset-library chain the textures come from: 15 of the 22 maps name prop models that live
  // in libraries the viewer used to leave shut -- `TURR_MDL` (turrets) on eight of them, `PAVE_MDL`
  // (the Pave Hawk) on five, and so on. `WORL_MDL` is the world itself and is not an asset library, so
  // it leads; the chain follows in its own order, which puts the map's own library last, as the engine
  // does.
  //
  // `CLIB_MDL` is excluded on purpose. Character models are a different chain form -- `CMesh` /
  // `CSubMesh`, `vis_main.cpp:246-265` -- that this walker produces garbage on (36 section 3).
  const members = ['WORL_MDL.ZED', ...assetLibStems(bytes, toc, stem, notes)
    .filter((lib) => lib !== 'CLIB')
    .map((lib) => `${lib}_MDL.ZED`)];
  const out: { zar: Zar; form: PositionForm; lib: string }[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member)) continue;
    seen.add(member);
    try {
      out.push({ zar: Zar.parse(zdbMember(bytes, toc, member)), form: archivePositionForm(member), lib: member.replace(/_MDL\.ZED$/i, '') });
    } catch {
      // A library with no models of its own is ordinary -- MP53 has no `MP53_MDL.ZED` at all and is
      // right not to, drawing its three props out of shared libraries instead.
    }
  }
  if (out.length === 0) notes.add(`no model archive of ${members.length} could be read`);
  return out;
}

/** `LoadedMap.ambientPlaces`: the self-starting programs' root nodes, every node of each root's name, world space. */
export function ambientNodePlaces(models: readonly SceneNode[], programs: readonly { name: string; flags: number; root: number; nodes: readonly string[] }[]): { program: string; node: string; at: [number, number, number] }[] {
  const wanted = new Map<string, string[]>();
  for (const p of programs) {
    if ((p.flags & 3) !== 1) continue;
    const node = p.nodes[p.root];
    if (!node || node === 'NA' || node === 'camera') continue;
    const key = node.toLowerCase();
    wanted.set(key, [...(wanted.get(key) ?? []), p.name]);
  }
  if (wanted.size === 0) return [];
  const out: { program: string; node: string; at: [number, number, number] }[] = [];
  for (const found of flattenScene(models as SceneNode[], 'worldmodel')) {
    const last = found.path.split('/').pop()!.split('=')[0]!.toLowerCase();
    const names = wanted.get(last);
    if (!names) continue;
    const m = toColumnMajor(found.world);
    for (const program of names) {
      // An instance node and its model's node share the name (`bee1`, `bee1=mp6_fly1`): one place, kept once.
      if (out.some((o) => o.program === program && Math.abs(o.at[0] - m[12]!) < 0.5 && Math.abs(o.at[1] - m[13]!) < 0.5 && Math.abs(o.at[2] - m[14]!) < 0.5)) continue;
      out.push({ program, node: found.path, at: [m[12]!, m[13]!, m[14]!] });
    }
  }
  return out;
}

/**
 * The world matrix of every node whose path is an instance root (`worldmodel/stack=pallet`), including one that
 * draws nothing. `placeInstances` keeps only nodes with visuals, so a multi-piece prop's pieces are all the map
 * otherwise holds, and the shortest piece is not this node. Column-major, the same layout as a placement's `world`.
 */
export function instanceRootMatrices(models: readonly SceneNode[]): { path: string; matrix: Float32Array }[] {
  const roots: { path: string; matrix: Float32Array }[] = [];
  for (const found of flattenScene(models as SceneNode[], 'worldmodel')) {
    const slash = found.path.lastIndexOf('/');
    const eq = found.path.lastIndexOf('=');
    if (eq > slash) roots.push({ path: found.path, matrix: toColumnMajor(found.world) });
  }
  return roots;
}

/** What gets drawn where: the world's chunks one placement each, and the props grouped by model-node. */
interface Placement {
  world: PlacedModel[];
  /** One group per (model, node); every member draws the same geometry at a different matrix. */
  props: PlacedModel[][];
  /**
   * A placement's position in the engine's walk of the graph: `flattenScene` recurses the tree depth
   * first, children in order, prototypes realised in place, which is what reCOM's `CPipe::RenderNode`
   * does, and `placeInstances` keeps that order. The clutter, which the walk never reaches (it is
   * placed from `CLUTTER.ZAR`), ranks after everything the graph places.
   */
  rank: (p: PlacedModel) => number;
  /**
   * Whether a placement is a state the map does not open in. Not a flag on the node -- the engine
   * sets these from game logic. A crate is `crates_weapons/healthy` beside
   * `crates_weapons/whats_left` and `crates_weapons/parts/part1..15`; a lamp is `light02` with a
   * `light02/nolight` child; an alarm has `hornlightbox_on` and `hornlightbox_off`. The graph holds
   * every state and the game switches them; the map opens on the intact, lit one. The naming is the
   * exporter's and is the same on every map (surveyed over all 22).
   */
  alternate: (p: PlacedModel) => boolean;
  /** MAP-02: the deepest path the map's zAnim references name that the placement lies under, or null (`switchPath`). */
  switchPath: (p: PlacedModel) => string | null;
  /** LATER 782: the deepest scrolled path the placement lies under (`MapMeta.motion.scrolled`), or null (`scrollPath`). */
  scrollPath: (p: PlacedModel) => string | null;
  /** The LOD band per model name (`lodBands`), for the copies the engine shows by camera range. */
  lod: Map<string, LodBand>;
  /** The texture scroll of a placement's node (`TextureScroll_Object`), or null. */
  scroll: (p: PlacedModel) => [number, number] | null;
  /**
   * The grid cells a placement is filed in (`placementCells`): a graph placement by its node's bbox, a
   * clutter instance by its position -- the two rules the engine's grid links them by (`grid.ts`).
   */
  cells: (p: PlacedModel) => number[];
  /** Zero once the graph has been read: the matrices are already in the positions. */
  origin: [number, number, number];
  /** The collision hull, already in world space and already cut into segments (36 section 6). */
  collision: CollisionLines;
  /** The same hull as polygons, with its nodes and the grid, for the walk (`LoadedMap.ground`). */
  ground?: GroundData;
  /** DOORS: the map's doors (`./doors`), their owners marked in `ground`. */
  doors?: DoorSpec[];
  /** MAP-07: the map's lever gates (`./gates`), their owners marked in `ground`. */
  gates?: GateSpec[];
  /** Chain Reaction's hooks (`./cranes`), their owners marked in `ground`. */
  cranes?: CraneSpec[];
  /** MAP-01: the map's typed metadata (`./mapMeta`), read off the same graph. */
  meta?: MapMeta;
  /** The parsed graph itself (MAP-10a: `mapTurrets` reads the turrets off it, no second parse). */
  models?: SceneNode[];
}

/**
 * An empty hull: what a map whose graph would not parse has to offer the overlay. A function, not a
 * shared constant, because `transferables` hands these buffers to the page -- a constant's arrays would
 * be detached by the first load that used them and unusable by the second.
 */
const noCollision = (): CollisionLines => ({ positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 });

/**
 * A node name that is a state the map opens without: the destroyed remains, the debris, the lamp off,
 * and the `terrorist_pulse` ribbon round a demolition crate, which the game pulses and the graph
 * holds at full brightness. MAP-02: the rule hides only what the map's zAnim does not name (the lamps' `nolight`,
 * `light_off`, and their kin: `hiddenByRule` in `place`); what zAnim names opens as its node references say.
 */
const ALTERNATE_STATE = /^(vis_)?whats_left$|^parts$|^(beer|radio)_parts$|^nolight$|_off$|_pulse$/i;

function place(library: ModelLibrary, bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes, grid: Grid,
  turretDefs: readonly TurretDef[] | null = null): Placement {
  try {
    const geo = Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`));
    const models = parseSceneGraph(geo);
    applyR0004MapPatch(models, stem);   // R4B-09 (research 383): r0004's per-map collision, as the room's `simMapFromBytes` does
    const turrets = turretParts(bytes, toc, stem, models, turretDefs, notes);
    // LATER 166 (`@s2u/scene` `turretScopeHidden`; `FUN_003a9a80` D:L300804-300828): a plain turret hides its
    // `thermal_scope` node, a THERMAL one its `scope` -- MP10's own-graph RMG too (`placeInstances` places it).
    const placed = [...placeInstances(models, WORLD_MODEL), ...turrets.parts].filter((p) => !turretScopeHidden(turrets.placed, p.path));
    // LATER 112 (FACADES-2): a world-model node with facade bits is drawn as a facade prop is -- its own mesh at its
    // node's origin, turned each frame (`./facade`, `./world`) -- since the draw walk turns every node so flagged,
    // world model or prop (`FUN_003389c0` D:L236080-236081 -> `FUN_00317fc0`); merged into the world's draws it stood
    // as placed. 23 nodes on 7 maps: MP7's moon and five stars, MP52's four pipes, MP11's four glows, MP53's and
    // MP71's suns, M72's six smoke columns, M82's `g4445`.
    const turned = (p: PlacedModel): boolean => p.modelName === WORLD_MODEL && p.facade !== 0;
    const world = placed.filter((p) => p.modelName === WORLD_MODEL && !turned(p));
    if (world.length === 0) throw new Error(`no ${WORLD_MODEL} node carries visuals`);
    const groups = new Map<string, PlacedModel[]>();
    const ranks = new Map<PlacedModel, number>();
    // The clutter joins the props: `CLUTTER.ZAR` places models the graph holds as prototypes but never
    // instances from the root, so without this pass Desert Glory's ground is bare (36 section 2).
    const clutterPlaced = new Set(clutter(models, bytes, toc, notes));
    const hiddenByName = (path: string): boolean => path.split(/[/=]/).some((segment) => ALTERNATE_STATE.test(segment));
    // MAP-01: the metadata, and where the name rule above parts from zAnim's initial state (a diagnostic).
    const meta = readMapMeta(bytes, toc, stem, models);
    const disagree = alternateDisagreement([...placed, ...clutterPlaced].map((p) => p.path), hiddenByName, meta.initial);
    if (disagree) notes.add(disagree);
    // MAP-02: zAnim's initial state draws what the map's references name -- a placement under a path they make inactive
    // (bit 31) is hidden -- and the name rule only what they do not: a segment the rule matches hides the placement
    // unless the path up to that segment is itself a reference's (the lamps' `nolight` and `light_off` are no
    // reference's on the fixtures, research 209 s6).
    const off = meta.initial.filter((e) => e.deactivate).map((e) => e.path);
    const named = new Set(meta.initial.map((e) => e.path));
    const hiddenByRule = (path: string): boolean => {
      for (const m of path.matchAll(/[^/=]+/g)) {
        if (ALTERNATE_STATE.test(m[0]) && !named.has(path.slice(0, m.index + m[0].length))) return true;
      }
      return false;
    };
    const alternate = (p: PlacedModel): boolean => off.some((root) => under(p.path, root)) || hiddenByRule(p.path);
    /** The deepest reference-named path over a placement (`LoadedMesh.switchPath`). */
    const switchPath = (p: PlacedModel): string | null => {
      let best: string | null = null;
      for (const e of meta.initial) if (under(p.path, e.path) && (best === null || e.path.length > best.length)) best = e.path;
      return best;
    };
    /** LATER 782: the deepest scrolled path over a placement (`LoadedMesh.scrollPath`). */
    const scrollPath = (p: PlacedModel): string | null => {
      let best: string | null = null;
      for (const e of meta.motion?.scrolled ?? []) if (under(p.path, e) && (best === null || e.length > best.length)) best = e;
      return best;
    };
    for (const p of [...placed, ...clutterPlaced]) {
      ranks.set(p, ranks.size);
      if (p.modelName === WORLD_MODEL && !turned(p)) continue;
      // A group draws its first member's chunks at every member's matrix, so it must not mix instance
      // contexts the engine lights differently: the `_L` suffix is per context, not per node --
      // Death Trap's `access_topgate` is `N000_I000_V00` beside `N000_I001_V00_L`, Requiem's
      // `door_pointy` `_L` in nine contexts of eleven. The lit contexts draw from their own chains.
      const entry = library.get(p.modelName);
      const lit = entry !== undefined && p.chunks.some((c) => resolveChunk(entry, c)?.lit === true);
      // MAP-02: a group is all hidden or all shown as the map opens (`alternate`), so one switch per group starts right.
      // LATER 120: and all turned or all fixed, by one facade value (`PlacedModel.facade`: the stack entry it is drawn on).
      const key = `${p.modelName}#${p.nodeIndex}${lit ? '#L' : ''}${alternate(p) ? '#A' : ''}${p.facade !== 0 ? `#F${p.facade}` : ''}`;
      const group = groups.get(key);
      if (group) group.push(p);
      else groups.set(key, [p]);
    }
    const scrolls = textureScroll(bytes, toc, stem, notes);
    const scroll = (p: PlacedModel): [number, number] | null => {
      const node = p.path.split('/').pop()?.split('=')[0] ?? '';
      return scrolls.get(node) ?? null;
    };
    const { collision, ground, doors, gates, cranes } = hull(models, bytes, toc, stem, notes);
    return {
      world, props: [...groups.values()], origin: [0, 0, 0], collision, ground, doors, gates, cranes, meta, models,
      rank: (p) => ranks.get(p) ?? 0,
      alternate,
      switchPath,
      scrollPath,
      lod: lods(bytes, toc, notes),
      scroll,
      cells: (p) => placementCells(grid, p, clutterPlaced.has(p) ? 'clutter' : 'model').map((c) => c.index),
    };
  } catch (e) {
    notes.add(`scene graph: ${say(e)} -- falling back to the modal node translation, props omitted`);
    const entry = library.get(WORLD_MODEL);
    const every: PlacedModel = {
      modelName: WORLD_MODEL, path: WORLD_MODEL, nodeIndex: -1, instanceIndex: null,
      chunks: entry ? entry.nodes.map((n) => n.name) : [],
      cull: entry ? entry.nodes.map(() => true) : [],
      facade: 0,
      world: Float32Array.from(IDENTITY), rowMajor: Float32Array.from(IDENTITY), lit: false,
    };
    return {
      world: [every], props: [], origin: worldOrigin(bytes, toc, stem, notes), collision: noCollision(),
      rank: () => 0, alternate: () => false, switchPath: () => null, scrollPath: () => null, lod: new Map(), scroll: () => null,
      // No graph, no node bboxes: nothing to file the one modal placement by, so it is drawn after the walk.
      cells: () => [],
    };
  }
}

/**
 * MAP-10b (research 215 s3, route (a)): the manual turrets' drawn parts. A placed turret's root holds an instance
 * (`RMG_turret`) whose prototype lives in an embedded GEO library (`TURR_GEO`, `TLMG_GEO`, `TLRM_GEO`), never in the
 * map's own graph, so `placeInstances` over the map's models draws nothing under it. This joins the libraries'
 * prototypes as `@s2u/scene` `readTurrets` does (`turretSceneModels`) and keeps only the placements beneath a placed
 * turret's root -- the base, the gun's meshes, the belt, the scope -- at the very paths `TurretPlacement.parts` names, so
 * `WorldView.moveNode(parts.gun, gunDelta(...))` turns the drawn gun (`./turretPage`). Their chunks are the asset
 * libraries' (`TURR_MDL`, already in `mdlArchives`' chain), under their own fallback naming, and decoded in those
 * libraries' `'scale'` form (`archivePositionForm`, research 79 §2). Nothing else the join would reach is drawn
 * (Crossroads' sky prototype among them). No definitions, no candidate, or a library that will not read: none, a note.
 */
function turretParts(bytes: Uint8Array, toc: ZdbEntry[], stem: string, models: SceneNode[], defs: readonly TurretDef[] | null,
  notes: Notes): { parts: PlacedModel[]; placed: TurretPlacement[] } {
  const none = { parts: [], placed: [] };
  if (!defs?.length) return none;
  const named = (n: string | null): boolean => n !== null && matchTurretDef(defs, n) !== null;
  try {
    if (!flattenScene(models, WORLD_MODEL).some((f) => named(f.node.name) || named(f.node.modelName))) return none;
    const joined = turretSceneModels(bytes, toc, stem, models, (line) => notes.add(line));
    const placed = placeTurrets(joined, defs, null), roots = placed.map((t) => t.root);
    // The libraries' buffers name their chunks with the fallback naming (`N000_000`: each model exported alone, no
    // instance context -- `TURR_MDL.ZED`'s keys on Crossroads), so a part takes that key whatever the map's count.
    // W0 (research 237 §0): a prototype the map's own graph realises (MP10's `RMG_turret`, the join keeps the map's
    // copy) is placed by `place`'s own `placeInstances(models)` with its own chunks; placed again here it would ask
    // the map's buffer for the libraries' keys (14 'no such chain' notes on MP10), so only the libraries' models remain.
    const own = new Set(flattenScene(models, WORLD_MODEL).map((f) => f.modelName));
    return {
      placed,
      parts: roots.length ? placeInstances(joined, WORLD_MODEL).filter((p) => !own.has(p.modelName) && roots.some((r) => under(p.path, r)))
        .map((p) => ({ ...p, instanceIndex: null, chunks: p.chunks.map((_, v) => chunkKey(p.nodeIndex, null, v)) })) : [],
    };
  } catch (e) {
    notes.add(`turret parts: ${say(e)}`);
    return none;
  }
}

/** The LOD band per model named by `READERM.ZAR/lod.rdr`, or none when the record is missing or will not parse. */
function lods(bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): Map<string, LodBand> {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const lod = readerm.root.children.find((k) => k.name.toLowerCase() === 'lod.rdr');
    if (!lod) return new Map();
    return lodBands(parseRdr(readerm.data(lod)) as RdrNode);
  } catch (e) {
    notes.add(`lod table: ${say(e)}`);
    return new Map();
  }
}

/** The world root's `ShadowVector`, or undefined when the root will not read (the shadow takes the engine's default). */
function shadowVectorOf(bytes: Uint8Array, toc: ZdbEntry[], stem: string): [number, number, number] | undefined {
  try {
    return parseWorldRoot(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`))).shadowVector;
  } catch {
    return undefined;
  }
}

/** The world root's reflection materials (`parseMaterialPalette`), or none. */
function envPalette(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): EnvMaterial[] {
  try {
    return parseMaterialPalette(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
  } catch (e) {
    notes.add(`material palette: ${say(e)}`);
    return [];
  }
}

/** The scrolling textures of the world root, by node name, or none. */
function textureScroll(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): Map<string, [number, number]> {
  try {
    const root = parseWorldRoot(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
    return new Map(root.textureScroll.map((b) => [b.nodeName, [b.du, b.dv]]));
  } catch (e) {
    notes.add(`texture scroll: ${say(e)}`);
    return new Map();
  }
}

/**
 * The map's collision hull as line segments. It is drawn from the same graph and the same matrices as
 * the chunks, so a hull that does not sit on the floor is a placement bug, not a collision one -- which
 * is most of why the overlay is worth having.
 */
function hull(models: SceneNode[], bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): { collision: CollisionLines; ground?: GroundData; doors?: DoorSpec[]; gates?: GateSpec[]; cranes?: CraneSpec[] } {
  let polys;
  try {
    polys = worldCollision(models, WORLD_MODEL);
  } catch (e) {
    notes.add(`collision: ${say(e)}`);
    return { collision: noCollision() };
  }
  return { collision: collisionLines(polys), ...groundOf(polys, models, bytes, toc, stem, notes) };
}

/**
 * The hull as the probe reads it, for the walk (`./walk`): the polygons with their nodes (`collisionOwners` walks
 * the graph as `worldCollision` does, so the owners index the polygons) and the world root's `grid_params`. A
 * root without the key takes the engine's default grid, as `CGrid::Read` does (research 23 section 2.3).
 */
function groundOf(polys: WorldPoly[], models: SceneNode[], bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): { ground: GroundData; doors: DoorSpec[]; gates: GateSpec[]; cranes: CraneSpec[] } {
  let grid = DEFAULT_GRID_PARAMS;
  try {
    grid = parseGridParams(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
  } catch (e) {
    notes.add(`grid_params: ${say(e)} -- the walk takes the engine's default grid`);
  }
  const owners = collisionOwners(models, WORLD_MODEL);
  // DOORS (`./doors`): the doors mark their polygons' owners (`sweep`) before the pack, so every grid built off this
  // hull files a leaf under its whole swing and the mover reads it fresh as it turns.
  const doors = readDoors(bytes, toc, models, owners, polys);
  const gates = readGates(bytes, toc, stem, models, owners, polys);   // MAP-07: before the pack, with the doors
  for (const line of doors.diagnostics) notes.add(line);
  for (const line of gates.diagnostics) notes.add(line);
  const cranes = readCranes(bytes, toc, models, owners, polys);
  for (const line of cranes.diagnostics) notes.add(line);
  return { ground: packGround(grid, polys, owners), doors: doors.doors, gates: gates.gates, cranes: cranes.cranes };
}

/**
 * `CLUTTER.ZAR`'s instances, placed. A model it names that the graph does not hold costs one diagnostic
 * for the model, not one per instance -- 36 of the same rock would otherwise say the same thing 36 times.
 */
function clutter(models: SceneNode[], bytes: Uint8Array, toc: ZdbEntry[], notes: Notes): PlacedModel[] {
  try {
    const { placed, missing, malformed } = placeClutter(
      models, parseClutter(Zar.parse(zdbMember(bytes, toc, 'CLUTTER.ZAR'))));
    for (const name of missing) notes.add(`clutter ${name}: named by CLUTTER.ZAR but not in the scene graph`);
    // Records that are not the affine matrix the format says. Drawn, they compose into basis rows
    // thousands of units long and streak across the map; this is Abandoned's whole problem.
    for (const m of malformed) {
      notes.add(`clutter ${m.modelName}: ${m.instances} instance(s) whose params are not an affine`
        + ' matrix, so they are not placed (scene/clutter.ts isAffineRowVector)');
    }
    return placed;
  } catch (e) {
    notes.add(`clutter: ${say(e)}`);
    return [];
  }
}

/**
 * World-space line segments, accumulated across every placement that draws a strip.
 *
 * A `LineStrip` is points in draw order with no index list, so strip point `k` joins point `k+1` and a
 * strip of n points is n-1 segments. They are flattened into one pair list here rather than kept as
 * strips, because one `LineSegments` draw is cheaper than a few hundred `Line` objects and the whole
 * map's worth is under a thousand segments.
 */
class Segments {
  private readonly groups = new Map<string, {
    textureName: string | null; fog: boolean; order: number; cells: Set<number>;
    positions: number[]; uvs: number[]; colors: number[]; normals: number[]; spans: { walk: number; first: number; count: number }[];
    turn?: LoadedLineGroup['turn'];
  }>();

  /**
   * `walk`: a prop placement's place in the scene walk (`Placement.rank`), filed as the strip's span (FG-32; a strips-only
   * node's re-filed after under its placement's entry's, `rewalk`, LATER 141). `turn`
   * (LATER 120): the placement is drawn under a facade turn -- `rowMajor` is then the identity, its strips go into a group
   * of their own in model space, and the view turns that group about the placement's origin (`LoadedLineGroup.turn`).
   */
  add(strip: LineStrip, rowMajor: Float32Array, order: number, cells: readonly number[] = [], walk?: number, turn?: LoadedLineGroup['turn']): void {
    const n = strip.positions.length / 3;
    if (n < 2) return;                                   // a single point draws nothing
    const textureName = strip.textureName === null ? null : textureKey(strip.textureName);
    const key = `${textureName ?? ''}|${strip.fog ? 1 : 0}${turn ? `|turn:${walk ?? ''}` : ''}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { textureName, fog: strip.fog, order, cells: new Set(), positions: [], uvs: [], colors: [], normals: [], spans: [], ...(turn ? { turn } : {}) };
      this.groups.set(key, g);
    }
    g.order = Math.min(g.order, order);
    for (const c of cells) g.cells.add(c);
    const m = rowMajor;
    const at = (k: number): [number, number, number] =>
      transformPoint(m, strip.positions[k * 3]!, strip.positions[k * 3 + 1]!, strip.positions[k * 3 + 2]!);
    // The 3x3 alone, as `placeMesh` rotates a mesh's normals: a direction has no translation.
    const rot = (k: number): [number, number, number] => {
      const [x, y, z] = [strip.normals[k * 3]!, strip.normals[k * 3 + 1]!, strip.normals[k * 3 + 2]!];
      return [
        x * m[0]! + y * m[4]! + z * m[8]!,
        x * m[1]! + y * m[5]! + z * m[9]!,
        x * m[2]! + y * m[6]! + z * m[10]!,
      ];
    };
    if (walk !== undefined) {
      const first = g.positions.length / 3, count = (n - 1) * 2, last = g.spans[g.spans.length - 1];
      if (last && last.walk === walk && last.first + last.count === first) last.count += count;
      else g.spans.push({ walk, first, count });
    }
    for (let k = 0; k + 1 < n; k++) {
      for (const end of [k, k + 1]) {
        g.positions.push(...at(end));
        g.normals.push(...rot(end));
        g.uvs.push(strip.uvs[end * 2]!, strip.uvs[end * 2 + 1]!);
        g.colors.push(
          strip.colors[end * 4]!, strip.colors[end * 4 + 1]!,
          strip.colors[end * 4 + 2]!, strip.colors[end * 4 + 3]!,
        );
      }
    }
  }

  /** LATER 141: the spans filed under `from` (a strips-only node's placement) re-filed under `to` (its placement's entry). */
  rewalk(from: number, to: number): void {
    for (const g of this.groups.values()) for (const s of g.spans) if (s.walk === from) s.walk = to;
  }

  /** Null when the map drew no strips, so the viewer can skip the object entirely. */
  result(): LoadedLineGroup[] | null {
    if (this.groups.size === 0) return null;
    return [...this.groups.values()].map((g) => ({
      textureName: g.textureName, fog: g.fog, order: g.order, cells: unionCells([g.cells]),
      positions: Float32Array.from(g.positions),
      uvs: Float32Array.from(g.uvs),
      colors: Float32Array.from(g.colors),
      normals: Float32Array.from(g.normals),
      ...(g.spans.length ? { spans: g.spans } : {}),
      ...(g.turn ? { turn: g.turn } : {}),
    })).sort((a, b) => a.order - b.order);
  }
}

/**
 * Line segments in world space that share a texture and a fog bit: two points a segment, a uv, an rgba
 * and a normal per point, and the earliest place in the scene walk any of them was drawn.
 */
export interface LoadedLineGroup {
  textureName: string | null;
  fog: boolean;
  order: number;
  /** The grid cells of every placement whose strips are in the group (see `LoadedMesh.cells`). */
  cells?: number[];
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  /**
   * FG-32 (the forge's hide, a browser adaptation): the points each prop placement's strips put in the group -- `first`
   * and `count` in points (two a segment), by the walk its spans are filed under: its placement's place in the scene walk
   * (`LoadedMap.props[].walk`), or for a strips-only node (no entry) its placement's entry's (LATER 141). What
   * `WorldView.setPlacementActive` collapses for a hidden placement. Absent on a group of the world's strips alone.
   */
  spans?: { walk: number; first: number; count: number }[];
  /**
   * LATER 120: one placement's strips drawn under a facade turn (`PlacedModel.facade`) -- the draw walk draws a node's
   * strips with the matrix it draws its visuals with (`FUN_003389c0`), turned when the entry is (`FUN_00317fc0`): the
   * positions in the placement's model space, `matrix` its placement (column-major, the pose on disc), which the view turns
   * about its origin each frame as it turns a facade mesh (`./world`, `./facade` `turnFacade`). Absent on the strips
   * placed in world space.
   */
  turn?: { facade: number; matrix: Float32Array };
}

/**
 * Decodes the chains one placement draws. A chunk that will not interpret becomes a diagnostic and the
 * rest of the map still draws, as it did before the scene graph existed.
 */
/** Per library: its texture records by `gsaddr`, the space `TEX0.TBP0` and `MIPTBP1` both name them in. */

type Decoded = ReturnType<ReturnType<typeof decoder>>;

/**
 * Splits each prop group by the light its placements' chunks bake: one group per distinct shading, in the
 * order of the walk.
 *
 * A model instanced in several places carries a chunk per instance context (`N###_I###_V##`), and the
 * chunks differ in nothing but their prelit vertex colours -- which is the picture: Frostfire's seventeen
 * tank rails are seventeen shades, from 35 to 50 on the red lane, beside the prototype's own bare 128.
 * `hookupVisuals` hooks each context to its own chunk (`vis_main.cpp:77-111`), so a placement draws its
 * own; placements whose chunks decode to the same colours still share one instanced draw.
 */
function instanceShades(
  groups: PlacedModel[][], chunksOf: (p: PlacedModel) => Decoded, orderOf: (p: PlacedModel, i: number) => number,
): { group: PlacedModel[]; decoded: Decoded }[] {
  const out: { group: PlacedModel[]; decoded: Decoded; order: number }[] = [];
  for (const group of groups) {
    const shades = new Map<string, { group: PlacedModel[]; decoded: Decoded; order: number }>();
    for (const p of group) {
      const decoded = chunksOf(p);
      const key = shadeKey(decoded);
      const known = shades.get(key);
      if (known) known.group.push(p);
      else shades.set(key, { group: [p], decoded, order: orderOf(p, 0) });
    }
    out.push(...shades.values());
  }
  return out.sort((a, b) => a.order - b.order);
}

/** A decoded chunk set's colours, hashed (FNV-1a over the float bits), with its shape: what makes two shades one. */
function shadeKey(d: Decoded): string {
  let h = 0x811c9dc5;
  const parts: string[] = [];
  for (const mesh of [...d.meshes, ...d.lines]) {
    const bits = new Uint32Array(mesh.colors.buffer, mesh.colors.byteOffset, mesh.colors.length);
    for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i]!, 0x01000193) >>> 0;
    parts.push(String(mesh.colors.length));
  }
  return `${h.toString(16)}:${parts.join(',')}`;
}

/** A decoded chunk's mesh with its visual's flags (`decoder`). */
type DecodedMesh = MeshData & {
  cull: boolean; lit: boolean; reflect: number; alphaPass: boolean;
  /** PF-30: the visual's `vparams` bit 14, its detail gate range and its model-space centroid, when the scene gives them. */
  detailOn: boolean; detailRange?: number; centre?: [number, number, number];
};

function decoder(library: ModelLibrary, notes: Notes): (p: PlacedModel) => { meshes: DecodedMesh[]; lines: LineStrip[] } {
  return (p) => {
    const entry = library.get(p.modelName);
    if (!entry) {
      notes.add(`model ${p.modelName}: in the scene graph but not in any MDL archive`);
      return { meshes: [], lines: [] };
    }
    const meshes: DecodedMesh[] = [];
    const lines: LineStrip[] = [];
    for (const [i, chunk] of p.chunks.entries()) {
      const at = resolveChunk(entry, chunk);
      if (at === null) {
        notes.add(`chunk ${p.modelName}/${chunk}: no such chain in the model buffer`);
        continue;
      }
      try {
        // The archive's form (research 79 §2): a turret part's `TURR_MDL` chain read as the world's `'bias'` is
        // ~150 times its size, MAP-10b's mustard "bubbles" over 15 maps.
        const parts = interpretChainPartsAs(walkChain(entry.buffer, at.offset, chunk), entry.form ?? 'bias');
        // The cull is per visual, and a chunk is one visual: every mesh out of it takes its flag. So does
        // the `_L` light: a chunk stored as `<key>_L` is a node `hookupVisuals` marks dynamically lit
        // (`vis_main.cpp:100-109`, note 72 line 116), and its node flags do not say so -- none of Night
        // Stalker's eight `_L` chunks is on a `NODE_FLAGS_LIT` node. Every other chunk keeps `p.lit`.
        // The alpha pass is per visual too (`PlacedModel.alphaPass`, the visual's `vparams` bit 0).
        // PF-30: so are the detail pass's bit 14, its gate's range and the centroid it is measured from.
        const centre = p.centres?.[i] ?? null, detailRange = p.detailRanges?.[i] ?? null;
        meshes.push(...parts.meshes.map((mesh) => ({
          ...mesh, cull: p.cull[i] ?? true, lit: at.lit, reflect: p.material?.[i] ?? 0, alphaPass: p.alphaPass?.[i] ?? false,
          detailOn: p.detail?.[i] ?? true, ...(detailRange !== null ? { detailRange } : {}), ...(centre ? { centre } : {}),
        })));
        lines.push(...parts.lines);
      } catch (e) {
        notes.add(`chunk ${p.modelName}/${chunk}: ${say(e)}`);
      }
    }
    return { meshes, lines };
  };
}

/**
 * Carries a decoded chunk from model space into the world, positions and both sets of normals. Rotating
 * the normals matters even though Frostfire's six world matrices are pure translations: other maps'
 * need not be, and an unrotated normal is a lighting bug nobody would trace back to here.
 */
function placeMesh(mesh: MeshData, m: Float32Array): MeshData {
  if (IDENTITY.every((v, i) => v === m[i])) return mesh;
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const p = transformPoint(m, mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!);
    positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2];
  }
  const rotate = (n: Float32Array | null): Float32Array | null => {
    if (!n) return null;
    const out = new Float32Array(n.length);
    for (let i = 0; i < n.length; i += 3) {
      // The 3x3 alone: a direction has no translation. Row-vector, so the rows multiply the components.
      out[i] = n[i]! * m[0]! + n[i + 1]! * m[4]! + n[i + 2]! * m[8]!;
      out[i + 1] = n[i]! * m[1]! + n[i + 1]! * m[5]! + n[i + 2]! * m[9]!;
      out[i + 2] = n[i]! * m[2]! + n[i + 1]! * m[6]! + n[i + 2]! * m[10]!;
    }
    return out;
  };
  return { ...mesh, positions, normals: rotate(mesh.normals), faceNormals: rotate(mesh.faceNormals) };
}

/**
 * The fallback for a map whose scene graph would not read: SEMANTICS section 8's modal translation, the
 * one shared by most of the `worldmodel` subtree's direct children -- (960, 0, 800) on Frostfire. It
 * misplaces the chunks whose node carries a different matrix, which is why it is no longer the first
 * choice; `place` only reaches for it when `MP*_GEO.ZED` cannot be parsed at all.
 */
function worldOrigin(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: Notes): [number, number, number] {
  try {
    const geo = Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`));
    const children = geo.find('models/worldmodel/children');
    if (!children) throw new Error(`${stem}_GEO.ZED has no models/worldmodel/children key`);
    const counts = new Map<string, { translation: [number, number, number]; nodes: number }>();
    for (const node of children.children) {
      const nparams = geo.child(node, 'nparams');
      if (!nparams || nparams.size !== NPARAMS_SIZE) continue;
      const r = new Reader(geo.data(nparams));
      const translation: [number, number, number] = [r.f32(TRANSLATION_AT), r.f32(TRANSLATION_AT + 4), r.f32(TRANSLATION_AT + 8)];
      const id = translation.join(',');
      const seen = counts.get(id) ?? { translation, nodes: 0 };
      seen.nodes++;
      counts.set(id, seen);
    }
    const modal = [...counts.values()].sort((a, b) => b.nodes - a.nodes)[0];
    if (!modal) throw new Error(`${stem}_GEO.ZED: no worldmodel child carries a 96-byte nparams`);
    const total = [...counts.values()].reduce((n, c) => n + c.nodes, 0);
    if (modal.nodes * 2 <= total) {
      notes.add(`world placement: the modal node translation covers only ${modal.nodes} of ${total} chunks; chunk-exact placement is a later task`);
    }
    return modal.translation;
  } catch (e) {
    notes.add(`world placement: ${say(e)}`);
    return [0, 0, 0];
  }
}

/**
 * FCW-10 (product track; a browser adaptation with no original): what a layout's base asks to load -- a disc map by its
 * archive path (`zdb`, `loadMap` above, unchanged) or an authored map by its structured reference (`content`, a
 * `ContentLayoutBase`: `./packs/content/map` `loadContentBase`, which reads only the pack member that reference names).
 */
export type MapLoadRequest =
  | { kind: 'zdb'; source: AssetSource; path: string; onStage?: OnStage; options?: LoadMapOptions }
  | {
    kind: 'content'; base: import('@s2u/creator-contracts').ContentLayoutBase;
    readMap: (ref: import('@s2u/creator-contracts').ContentRef, signal?: AbortSignal) => Promise<unknown>;
    options?: import('./packs/content/map').LoadContentMapOptions;
  };

/**
 * The second loader beside the ZDB path: a `zdb` request is `loadMap` exactly as before; a `content` request -- a layout's
 * `ContentLayoutBase`, the `LayoutBase` member `parseLayout` and the record v3 now carry -- is the authored map's loader
 * (`loadContentBase`, which reads the map member and hands it to `loadContentMap`), imported on demand.
 *
 * S3b item 8, why the import stays dynamic: the two decode workers (`./worker.ts` L5 and `./forge/forgeWorker.ts` L4)
 * import `loadMap` alone, never `loadAnyMap`, and their bundles are ES modules (`vite.config.ts` `worker: { format: 'es' }`),
 * which Rollup code-splits and tree-shakes as it does the page: `loadAnyMap` is dropped from a worker's graph with the
 * import inside it, so neither worker bundle carries the content loader, and on the page it is a chunk of its own, fetched
 * the first time an authored map loads. A static import would instead bind `./packs/content/map` (and through it the
 * forge's ground, match map and objectives modules) into this module's graph for every importer of `loadMap`, a worker's
 * included, leaving its removal to tree-shaking alone. The build that would show the chunks is the S1a gate's
 * (`test/packs/contentLoaderSplit.test.ts` holds the facts this reads).
 */
export async function loadAnyMap(request: MapLoadRequest): Promise<LoadedMap> {
  if (request.kind === 'zdb') return loadMap(request.source, request.path, request.onStage, request.options);
  const { loadContentBase } = await import('./packs/content/map');
  return loadContentBase(request.base, request.readMap, request.options);
}
