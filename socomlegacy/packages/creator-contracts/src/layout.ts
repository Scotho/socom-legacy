/**
 * FORGE layouts and their saved record (FCW-07a), a browser adaptation with no original: the forge is the project's
 * own build-and-fly sandbox, and nothing here changes the game. One pure module (no DOM, no renderer, no Node API) the
 * page, the agent bridge, the registry's map adapter (FCW-06) and a server's policy all read through:
 * `readCreatorRecord` reads a layout file (v1), a record v2 and a record v3, and gives a record v3.
 *
 * The layout file (v1, `parseLayout`) and the v2 record moved here from `viewer/src/forge/layout.ts` and `record.ts`
 * (FCW-07a), unchanged but for the v3 additions; the viewer's modules re-export them. The contract is
 * `docs/specs/2026-10-25-layout-record-v3.md`.
 *
 * A layout is a recipe, never the disc's bytes: a base (a map's world, or a blank floor beside an archive whose props
 * fill the palette), the pieces placed (an asset id, `<archive>:<prototype>`, or a pack's content reference, and a
 * column-major 4x4 in the game's world frame) and the team spawn markers. The players' own discs supply the geometry.
 */
import { canonicalJson } from "./digest.js";
import { checkContentRef, checkPackRef, contentAssetKey, packRefKey, samePackRef, sortPackRefs, missingPackRefs, type ContentRef } from "./content.js";
import { checkReport, diagnostic, type CheckReport, type Diagnostic } from "./diagnostics.js";
import type { PackRef } from "./packs.js";
import { parseSemver } from "./semver.js";
import { checkRulesParams, RULES_CODES, rulesCatalogue, validateRules, type RulesCatalogue, type RulesLayoutEntities, type RulesSpec } from "./rules.js";

// ---------------------------------------------------------------------------------------------------------------------
// The layout file (v1)
// ---------------------------------------------------------------------------------------------------------------------

/** The format's version; a file of another is refused rather than guessed at. */
export const LAYOUT_VERSION = 1;

export type LayoutBase =
  /** A map's world drawn under the pieces; its props are the palette. */
  | { kind: "map"; archive: string }
  /** A flat floor of the forge's own (no original), the palette `library`'s props. */
  | { kind: "blank"; library: string }
  /** FCW-10: an authored map a creator pack supplies (`ContentLayoutBase`), the palette `library`'s props. */
  | ContentLayoutBase;

/** A base the disc supplies (a map's world, or the blank floor beside an archive): every `LayoutBase` but a content one. */
export type RetailLayoutBase = Exclude<LayoutBase, ContentLayoutBase>;

/**
 * FCW-10 (product track; a browser adaptation with no original): a layout's base that is an authored map (the plan's
 * `{kind: 'content', ref, mapId}`) -- the map `mapId` of the pack `ref` (`maps.ts` `ContentMapDefinition`, its member
 * `contentMapMemberPath(mapId)`), and `library`, the disc archive whose props fill the palette and whose characters and
 * kits the match takes, as a blank floor's `library` does. The layout file (`parseLayout`, `checkContentLayoutBase`) and
 * the record v3 (`contentBase`) carry it; a v2 record never does. A lobby refuses it (`onlineCreatorLayoutRefusal`,
 * H273/H274): an authored map is played offline only.
 */
export interface ContentLayoutBase {
  readonly kind: "content";
  readonly ref: PackRef;
  readonly mapId: string;
  readonly library: string;
  /**
   * Never present: a content base names no disc archive. Declared so a reader of `base.archive` after ruling out the
   * blank floor gets `undefined` for a content base, never another base's archive.
   */
  readonly archive?: never;
}

/** A layout on an authored map: a `Layout` whose base is a `ContentLayoutBase`. */
export type ContentLayout = Omit<Layout, "base"> & { base: ContentLayoutBase };

export const isContentLayoutBase = (b: { readonly kind: string }): b is ContentLayoutBase => b.kind === "content";
export const isContentLayout = (l: Layout | ContentLayout): l is ContentLayout => l.base.kind === "content";

const CONTENT_MAP_ID = /^[A-Za-z0-9_.-]{1,64}$/;
const CONTENT_LIBRARY = /^[A-Za-z0-9_]{1,16}$/;

/** Null when `v` is a `ContentLayoutBase` and nothing else, else why not. */
export function checkContentLayoutBase(v: unknown): string | null {
  if (!isObj(v) || v["kind"] !== "content") return "a content base is {kind: content, ref, mapId, library}";
  const extra = Object.keys(v).find((k) => !["kind", "ref", "mapId", "library"].includes(k));
  if (extra) return `a content base names no field ${extra}`;
  const why = checkPackRef(v["ref"]);
  if (why) return why;
  if (typeof v["mapId"] !== "string" || !CONTENT_MAP_ID.test(v["mapId"])) return "a content base's mapId is 1-64 of A-Z a-z 0-9 _ . -";
  if (typeof v["library"] !== "string" || !CONTENT_LIBRARY.test(v["library"])) return "a content base's library is an archive stem";
  return null;
}

/** A checked content base, copied (its reference's three fields only). */
const contentBaseOf = (v: Record<string, unknown>): ContentLayoutBase => {
  const ref = v["ref"] as PackRef;
  return { kind: "content", ref: { id: ref.id, version: ref.version, hash: ref.hash }, mapId: v["mapId"] as string, library: v["library"] as string };
};

export interface Piece {
  /**
   * `<archive>:<prototype>`, e.g. `MP2:a_dumpster`. A pack piece's is `contentAssetKey(content)`: a label, never read
   * as a disc archive -- `content` is its reference.
   */
  asset: string;
  /** Column-major 4x4 (three's `Matrix4.elements`), the game's world frame. */
  m: number[];
  /** FG-49: a locked placement is not selected or moved. Absent: unlocked. */
  locked?: boolean;
  /** FCW-07a: the stable authored id. Absent: its row's default (`layoutIds`). */
  id?: string;
  /** FCW-07a: a creator pack's asset, in place of a disc prototype. */
  content?: ContentRef;
}

export interface SpawnMarker {
  team: "A" | "B";
  p: [number, number, number];
  /** Radians about y. */
  yaw: number;
  /** FG-49: a locked marker is not selected or moved. Absent: unlocked. */
  locked?: boolean;
  /** FCW-07a: the stable authored id. Absent: its row's default. */
  id?: string;
}

/** Where the editor's camera was: the fly camera's place and look (`FlyCamera.pose`). Absent: the base's own stand. */
export interface LayoutCamera {
  x: number; y: number; z: number; yaw: number; pitch: number;
}

/** A layout name long enough for a file, short enough for the toolbar (the record's bound, `RECORD_LIMITS.name`). */
export const LAYOUT_NAME_MAX = 48;

/** FCW-07a: a creator game mode a layout plays, by id and version, with its parameters (validated by the mode's spec). */
export interface RecordMode {
  id: string;
  version: string;
  params: Record<string, unknown>;
}

export interface Layout {
  forge: typeof LAYOUT_VERSION;
  base: LayoutBase;
  pieces: Piece[];
  spawns: SpawnMarker[];
  /** The name the downloaded file takes. Absent: the base's own name (`layoutDownloadName`). */
  name?: string;
  /** The editor camera, restored when the layout is opened. Absent: the base's stand, or the view's own saved camera. */
  camera?: LayoutCamera;
  /**
   * FG-17: the base map's own props hidden in this layout, each by `placementKey` (its model and its place, whole
   * units): the disc's placement left out of the drawing, the walk's hull and the match. Absent: none hidden.
   */
  hidden?: string[];
  /**
   * The base map's own objectives taken out of this layout (the owner, 2026-11-06; a browser adaptation, FG.R2: a custom
   * version of an official map), each by its key: `hostage:<name>` (an escortee), `bomb:start` (StartBomb),
   * `site:<node>` (an MPBOMB plant site), `zone:<name>` (an extraction zone). The disc's map is untouched; this
   * layout's editor and match leave them out (`viewer/src/forge/mapDataHide`). Absent: none. Online refused.
   */
  hiddenData?: string[];
  /**
   * The placements' tree (the owner, 2026-11-10: "implement the tree layout"): each `[child, parent]` pair a placement's
   * parent, both by their place in the layout (`TREE_REF`: `piece:3`, `door:0`, `bomb:seal:0`) -- the engine's own
   * model (a node's matrix local to its parent's, `@s2u/scene` `flattenScene`). Every placement keeps its own world place
   * as ever, so the tree is the editor's alone: a layout plays the same with it or without (an online lobby is sent
   * none, `withoutTree`). Absent: every placement at the top.
   */
  tree?: [child: string, parent: string][];
  /**
   * The Outliner's folders (the owner, 2026-11-11: "nulls/folders to group objects nicely ... purely for organizing objects
   * in the outliner ... when we export the map, we can flatten it"): each a name, referenced in `tree` and `order` as
   * `folder:<i>`. No object of the engine's nor of the game's: the editor's own, sent to no lobby (`withoutTree`).
   */
  folders?: { name: string }[];
  /**
   * The Outliner's order (the owner, 2026-11-11: "nice ux around object inserting and reordering"): every placement and
   * folder by its reference (`TREE_REF`), siblings drawn in this order. The editor's own (`withoutTree`). Absent: the
   * layout's own order.
   */
  order?: string[];
  /**
   * FG-21: the layout's NPCs -- each a seat of the offline match on `side`, as that side's character `type` of the map
   * (`LoadedMap.types`, protocol 9's), standing at `p` facing `yaw`. Hostile when on the side the player is not on.
   * Absent: none.
   */
  npcs?: NpcMarker[];
  /**
   * The layout's placed hostages (a browser adaptation, FG.R2; no original): each a place `p` facing `yaw`, added to the
   * base map's own escortees for an Escort or Extraction match (the Forge's Play). Absent: none. Online admitted (FP-1a):
   * the lobby's room places them as the page's Play does (`playObjectives`).
   */
  hostages?: HostageMarker[];
  /**
   * The layout's placed extraction zones (a browser adaptation, FG.R2; no original): each a named rectangle on the ground,
   * an EXTRACT_ZONE (AI-map kind 1) beside the map's own Safety zones for an Extraction match. Absent: none. Online
   * admitted (FP-1a): the lobby's room places them as the page's Play does (`playObjectives`).
   */
  extractionZones?: ExtractionZone[];
  /**
   * The layout's placed tactical points (a browser adaptation, FG.R2): a name, a kind and a place, beside the map's own
   * AIMAPS named points on its tactical map -- kind 1 a nav point the compass marks by the name's first letter. Absent:
   * none. Online admitted (FP-1a): the room holds no tactical map; the lobby's page composes them as its Play does.
   */
  tacPoints?: TacPointMarker[];
  /**
   * The layout's placed respawn points (a browser adaptation, FG.R2; the owner, 2026-11-06): each a team, a place and a
   * yaw (radians) as a spawn's, beside the map's own respawn records (`LoadedMap.respawns`, research 91 section 4.2).
   * Absent: none. Online admitted (FP-1a): the lobby's room composes them as the page's Play does (`placedRespawns`).
   */
  respawns?: SpawnMarker[];
  /**
   * The layout's placed flares (a browser adaptation, FG.R2; the owner, 2026-11-06): each a copy of one of a disc map's
   * facade nodes -- a glow the engine turns to the camera, not the lamp it hangs on -- by its archive (`source`) and its
   * node's name (`name`), at `at`. Absent: none. Online admitted (FP-1a): a light the page draws, nothing the room holds.
   */
  flares?: FlareMarker[];
  /**
   * The layout's placed spectator views (a browser adaptation, FG.R2): a name, a camera place and its yaw and pitch
   * (degrees, the port's convention, as `mission.rdr`'s Scenic_Views), beside the map's own. Absent: none. Online
   * admitted (FP-1a): the room holds no scenic view; the lobby's page composes them as its Play does.
   */
  scenicViews?: ScenicViewMarker[];
  /**
   * The layout's placed turrets (a browser adaptation, FG.R2): each a copy of a disc map's own manual turret -- its
   * archive (`source`) and placed node's name (`name`) -- stood at `at` facing `yaw` (radians), beside the map's own.
   * Absent: none. Online admitted (FP-1a): the lobby's room places them as the page's Play does (`withPlacedTurrets`).
   */
  turrets?: TurretMarker[];
  /**
   * The layout's placed doors (a browser adaptation, FG.R2): each a copy of a disc map's own door -- its archive
   * (`source`) and node (`name`) -- its hinge at `at`, turned `yaw` radians from that door's own turn. Absent: none.
   * Online admitted (FP-1a): the lobby's room places them as the page's Play does (`withPlacedDoors`).
   */
  doors?: DoorMarker[];
  /**
   * The layout's placed gates and C4 barriers (a browser adaptation, FG.R2): each a copy of a disc map's own access
   * object -- its archive (`source`) and its root node (`name`, `access1`) -- at `at`, turned `yaw` radians. A gate slides
   * on its lever and C4 wrecks it; a barrier C4 wrecks. Absent: none. Online admitted (FP-1a): the lobby's room places
   * them as the page's Play does (`withPlacedAccess`).
   */
  gates?: DoorMarker[];
  barriers?: DoorMarker[];
  /** The placed gates' switches (`SwitchMarker`): a gate opens only by one. Absent: none. Online refused. */
  switches?: SwitchMarker[];
  /** The layout's own props made damage triggers (`PieceTrigger`), each prop once. Absent: none. Online refused. */
  triggers?: PieceTrigger[];
  /** The layout's Forge objects (`ForgeObject`): ambient effects, cranes. Absent: none. A crane refused online. */
  objects?: ForgeObject[];
  /**
   * FG-24 (FG.R18; the owner, 2026-10-14: "a map settings that includes day/night slider, fog distance slider, max
   * players (up to 32 max)"; an adaptation, no original): the layout's settings, each optional -- absent, the disc's
   * value stands (`DEFAULT_SETTINGS`). Bounded by `SETTINGS_BOUNDS`; a value outside is refused.
   */
  settings?: Partial<LayoutSettings>;
  /**
   * FG-51 (an adaptation, no original): the layout's own game type and, for Demolition, its bomb. Absent, the base
   * map's type and its own objectives stand. The type may be omitted ("Map's own", L1): the base keeps its type and
   * its own bomb, and the block only keeps the bomb markers. Later modes (`escortees`, `zones`, `barriers`) may share
   * the block; this slice reads `gameType` and `bomb` and keeps any other key so a save does not drop it.
   */
  objectives?: ForgeObjectives;
  /**
   * FCW-07a (the review's F2): the stable authored ids of the bomb's start and its plant sites, parallel to
   * `objectives.bomb` (`bomb` its start, `sites` one per site in order) -- never inside the objectives, where an `id` on a
   * site or a `startId` on the bomb was an unknown key before v3 and stays one (carried inert, `legacyCarry`). The rows'
   * own ids ride the rows (`Piece.id`, `SpawnMarker.id`, `NpcMarker.id`). Absent, or an entry missing: its default
   * (`layoutIds`). An editor that deletes or reorders sites makes the ids explicit first (`withIds`) and moves `sites`
   * with them.
   */
  ids?: LayoutObjectiveIds;
  /**
   * FCW-07a: the creator packs the author declares beyond its pieces' own (a mode's, a rules pack's). Absent: none. A
   * pack a piece's `content` names is never listed here: the record's `requires` derives it from the pieces present
   * (`recordOfLayout`), so deleting a pack's last piece drops the pack (the review's F1).
   */
  requires?: PackRef[];
  /** FCW-07a: a creator game mode. Absent: the layout's `objectives` (or the base's own type) stand. */
  mode?: RecordMode;
  /** FCW-30: the rules entities (`LayoutZone`, `LayoutMarker`, `LayoutSpawner`), inert without a rules pack. Absent: none. */
  zones?: LayoutZone[];
  markers?: LayoutMarker[];
  spawners?: LayoutSpawner[];
}

/** FCW-07a: the bomb's start's id and its sites' ids, parallel to `objectives.bomb` (`Layout.ids`). */
export interface LayoutObjectiveIds {
  bomb?: string;
  sites?: string[];
}

/**
 * The layout's settings (FG.R18). What each binds:
 * - `timeOfDay` null or 0..1: saved Forge Night -> Day tone/atmosphere adaptation (`viewer/src/forge/lighting`).
 * - `light` 0..1: the legacy dimmer, retained for old layouts -- a scale on the brighten uniform and on the fog colour;
 *   1 is the disc's light.
 * - `fogFar`: the fog's far distance in game units; null, the disc's own distance.
 * - `players`: the lobby's cap, even, 2..32 -- above the original's 16 a forge lobby's own rule (FG.R20).
 * - `rounds` 1..MAX_ROUNDS (`viewer/src/net/rules`), `roundSeconds` 30..3600, `friendlyFire`: the room's own options
 *   (`RoomOptions.maxRounds`, `roundSeconds`, `allowFriendlyFire`), passed through.
 * - `npcBehaviour` (NPB-6, NPB.R6, NPB.R10; a taste ruling on the product track, no original): how the layout's NPCs
 *   play in offline Play -- `patrol`, the lobby bots' brain (`viewer/src/forge/npcBrain`; the default since the owner's
 *   word of 2026-10-25 that the forge's NPCs and the lobby's bots be the same, so a layout that names none patrols),
 *   which needs the map's prebuilt navigation graph and falls back to `sentry` without one; or `sentry`, the stationary
 *   turret of FG-21. Not the room's option: a lobby-hosted forge match seats no NPC.
 * - `arsenal` (`ArsenalSetting`; the owner, 2026-11-10): the map's `mission.rdr` valves with the layout's over them, and
 *   each side's kit picks -- what a side may pick and spawns with, by the game's own rules.
 * - `eqLimit` 0..4: CREATE GAME's equipment restriction (`EQlimit`, GameStats byte 5, `FUN_002f7c40` D:L196733-196734;
 *   research 362) -- 0 none, 1 pistols, 2 shotguns, 3 snipers, 4 no bombs -- the room's own option (`RoomOptions.eqLimit`).
 * - `respawn`: CREATE GAME's RESPAWN row (`mp_allow_respawn`; research 348), the room's `rules` 'respawn' when on.
 */
export const NPC_BEHAVIOURS = ["sentry", "patrol"] as const;
export type NpcBehaviour = (typeof NPC_BEHAVIOURS)[number];

/**
 * A layout's own light rig (the owner, 2026-11-06; a browser adaptation, FG.R2): the disc's `GlobalLighting` record's
 * shape (`@s2u/scene` `parseGlobalLighting`) -- three directional lights, each the unit direction it shines *from* and
 * its rgb (1 full brightness), and the ambient rgb every surface takes. Only a new empty map (a blank base) plays one:
 * a disc map keeps its own rig.
 */
export interface LightRigSetting {
  directions: [[number, number, number], [number, number, number], [number, number, number]];
  colours: [[number, number, number], [number, number, number], [number, number, number]];
  ambient: [number, number, number];
}

/** A rig colour lane's bound: 0 off, 2 twice the disc's full brightness (an editor's bound). */
export const LIGHT_RIG_COLOUR_MAX = 2;

/** One step of the in-game menu: the item put in a slot (`@s2u/scene` `Pick`; slot 0 primary, 1 secondary, 2-4 equipment). */
export interface ArsenalPick { slot: number; id: number }

/**
 * The layout's arsenal (the owner, 2026-11-10: "Give default weapons, c4, rocket launchers. Allows us to have breaching
 * on maps that don't have it"). Nothing is invented: it is written in the two things the disc's maps already carry.
 * - `valves`: `Enable_<item>` values over the map's own `mission.rdr` `Valves` (`@s2u/scene` `missionValves`), the same
 *   masks -- 1 the SEALs may pick it, 8 the Terrorists (`FUN_0023c390` D:L87468-87478), 16 / 32 C4 locked in a SEAL's /
 *   a Terrorist's kit (`FUN_0023e910` D:L88527-88545). An integer 0..63; a name the viewer knows no item of is refused there.
 * - `kits`: per side, menu picks replayed on every one of that side's types' kits (`character.rdr` `default_weapons`)
 *   through the menu's rules (`@s2u/scene` `applyPicks`, `FUN_0023fef0` D:L89138-89323) under those valves, so a
 *   cost-2 item's round, a launcher's slots and the single items follow; a type the menu would refuse keeps its own kit.
 */
export interface ArsenalSetting {
  valves: Record<string, number>;
  kits: { seal: ArsenalPick[]; terrorist: ArsenalPick[] };
}

/** An arsenal's bounds (an adaptation: a file's size, no game value): picks per side, valves per layout. */
export const ARSENAL_PICKS_MAX = 16;
export const ARSENAL_VALVES_MAX = 128;

/** One ARMORY column of a layout's roster: the `index`-th type (0..3) of a side on disc map `map`'s `chartype.rdr`. */
export interface RosterPick { map: string; index: number }

/**
 * The layout's character roster (the owner, 2026-11-10: "allow which characters the map can pick. Some maps use
 * different player models"; a browser adaptation, FG.R2 -- the original fixes each map's roster): each side's ARMORY
 * columns, in order, as types of any disc MP map's `READERM.ZAR/chartype.rdr` on the same side (`navyseals`,
 * `terrorists`; research 95 §6), each with that map's body and its `READERC.ZAR/character.rdr` kit. At most four a side
 * (`@s2u/scene` `ARMORY_TYPES_PER_SIDE`); an empty side is the map's own.
 */
export interface CharacterRoster { seal: RosterPick[]; terrorist: RosterPick[] }
export const ROSTER_COLUMNS_MAX = 4;

/**
 * The map's own world values a layout may write over (the owner, 2026-11-10: "I want to be able to define every single
 * map setting"); each absent or null is the map's own:
 * - `defaultMaterial`: `world_params.DefaultMaterial`, the SOILS entry a hull polygon's byte 0 stands for (`FUN_002dc1d0`,
 *   `FUN_002ddc30`); a name the viewer's SOILS table lacks is refused there.
 * - `reverb`: `mission.rdr` `IndoorReverb` / `OutdoorReverb`, each zone's [depth 0..1, ramp seconds] (research 81 §9).
 * - `fov`: the camera record's `m_hfov` / `m_vfov` half-angles, radians (Frostfire 0.6109 / 0.4276).
 * - `loading`: the loading screen (research 125) -- the disc map whose `LoadingScreenAssets` and `UiVars` it shows (null:
 *   the base's), and its `mission_title` / `mission_description` (null: that map's).
 */
export interface LoadingSetting { from: string | null; title: string | null; description: string | null }
export interface ReverbSetting { indoor: [number, number][]; outdoor: [number, number][] }
/** The bounds (an editor's, no game value): zones a list, ramp seconds, the half-angles, the words' lengths. */
export const REVERB_ZONES_MAX = 8, REVERB_SECONDS_MAX = 30, FOV_HALF_MIN = 0.1, FOV_HALF_MAX = 1.4, LOADING_TITLE_MAX = 64, LOADING_DESCRIPTION_MAX = 256;

export interface LayoutSettings {
  defaultMaterial?: string | null;
  reverb?: ReverbSetting | null;
  fov?: { h: number; v: number } | null;
  loading?: LoadingSetting | null;
  /** The ARMORY's character types over the map's (`CharacterRoster`); absent or null, the map's own. */
  characters?: CharacterRoster | null;
  /** The match's arsenal over the map's (`ArsenalSetting`); absent or null, the map's own. */
  arsenal?: ArsenalSetting | null;
  /** CREATE GAME's EQlimit, 0..4 (0 none). */
  eqLimit: number;
  /** CREATE GAME's RESPAWN (`mp_allow_respawn`): the room's respawn rules. */
  respawn: boolean;
  /** Forge adaptation: null retains authored/legacy lighting; 0..1 is shared Night -> Day. */
  timeOfDay: number | null;
  /** A new empty map's own light rig (`LightRigSetting`); absent or null, the rig of the map it is built from. */
  lightRig?: LightRigSetting | null;
  /**
   * A new empty map's own fog colour (the owner, 2026-11-06; a browser adaptation): the camera record's `m_fog_color`
   * (`@s2u/scene` `CameraParams.fogColor`), rgb 0..255; absent or null, the colour of the map it is built from.
   */
  fogColor?: [number, number, number] | null;
  /**
   * A new empty map's own drop-shadow direction (as `fogColor`): the world root's `shadowVector` (`@s2u/scene`
   * `parseWorldRoot`), the way the characters' shadows fall; absent or null, the vector of the map it is built from.
   */
  shadowVector?: [number, number, number] | null;
  /**
   * A new empty map's sky (the owner, 2026-11-06; a browser adaptation): the disc map (`MP72`) whose sky dome is copied
   * over the floor (`viewer/src/forge/skyDome`); absent or null, none -- the sky the fog colour clears.
   */
  skyFrom?: string | null;
  /**
   * A new empty map's own fog beyond its colour and far distance (`fogColor`, `fogFar`; as `fogColor`): the camera
   * record's on/off (`fogEnabled`), its near distance (`m_fog_near`), and its height band (`fogAltitude`, `m_fog_top` /
   * `m_fog_bottom`; null, none). Absent or null, the built-from map's.
   */
  fog?: { on: boolean; near: number; height: { top: number; bottom: number } | null } | null;
  /**
   * A new empty map's own night (as `fog`): the world root's `NightMission` (night vision offered) and `LensFX_NVG` (its
   * lens: four floats 0..1, the disc's range, as `LoadedMap.night` reads it -- (0.2, 0.898, 0.2, 0.24) on every map,
   * research 84 s14; null, none). Absent or null, the built-from map's. An earlier save's rgb 0..255 is read once as such
   * (`nightLensOf`, FP-1b).
   */
  night?: { mission: boolean; lens: [number, number, number, number] | null } | null;
  light: number;
  fogFar: number | null;
  players: number;
  rounds: number;
  roundSeconds: number;
  friendlyFire: boolean;
  npcBehaviour: NpcBehaviour;
}

/** The disc's values: no dimming, the map's own fog, 16 players, the room's default rounds and round time, no FF. */
export const DEFAULT_SETTINGS: Readonly<LayoutSettings> = Object.freeze({ timeOfDay: null, light: 1, fogFar: null, players: 16, rounds: 11, roundSeconds: 360, friendlyFire: false, npcBehaviour: "patrol", eqLimit: 0, respawn: false });

/** The numeric fields' bounds (inclusive) and the step a slider or the pad moves them by. */
export const SETTINGS_BOUNDS = Object.freeze({
  timeOfDay: { min: 0, max: 1, step: 0.05 },
  light: { min: 0, max: 1, step: 0.05 },
  fogFar: { min: 100, max: 100000, step: 100 },
  players: { min: 2, max: 32, step: 2 },
  rounds: { min: 1, max: 11, step: 1 },
  roundSeconds: { min: 30, max: 3600, step: 30 },
  eqLimit: { min: 0, max: 4, step: 1 },
} as const);

const SETTINGS_FIELDS = new Set(["timeOfDay", "light", "fogFar", "players", "rounds", "roundSeconds", "friendlyFire", "npcBehaviour", "lightRig", "fogColor", "shadowVector", "skyFrom", "fog", "night", "arsenal", "eqLimit", "respawn", "characters", "defaultMaterial", "reverb", "fov", "loading"]);

/**
 * A night lens (`settings.night.lens`): four floats 0..1, the disc's `LensFX_NVG` range (research 84 s14). The migration
 * (FP-1b; REVIEW-A 12; a browser adaptation, FG.R2): the Overhaul's first saves stored the rgb as bytes 0..255, so a
 * lens with any rgb lane above 1 is an earlier save's and is read once as such -- its rgb divided by 255, its alpha kept;
 * written back, it is in the disc's range. A lane past 255 or an alpha past 1 is refused.
 */
function settingsTriple4(v: unknown): [number, number, number, number] {
  const [r, g, b, a] = Array.isArray(v) && v.length === 4 ? v : [];
  const rgb = (n: unknown): n is number => isNum(n) && n >= 0 && n <= 255;
  if (!rgb(r) || !rgb(g) || !rgb(b) || !isNum(a) || a < 0 || a > 1) {
    throw new Error("settings.night.lens is not rgb 0..1 (or an earlier save's 0..255) and an alpha 0..1");
  }
  return nightLensOf([r, g, b, a]);
}

/** `settingsTriple4`'s migration alone: an earlier save's 0..255 rgb to the disc's 0..1, else the lens as it is. */
export function nightLensOf(lens: readonly [number, number, number, number]): [number, number, number, number] {
  const [r, g, b, a] = lens;
  return r > 1 || g > 1 || b > 1 ? [r / 255, g / 255, b / 255, a] : [r, g, b, a];
}

/** Three numbers each passing `check`, or null; `what` names the field in the refusal. */
function settingsTriple(v: unknown, what: string, check: (n: number) => boolean): [number, number, number] | null {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => isNum(n) && check(n))) throw new Error(`settings.${what} is not three numbers in range`);
  return [v[0], v[1], v[2]];
}

/** `settings.lightRig` read: three directions (unit, or zero for a light the rig leaves off), three colours, an ambient. */
function parseLightRig(v: unknown): LightRigSetting | null {
  if (v === null) return null;
  if (!isObj(v)) throw new Error("settings.lightRig is not an object");
  const vec = (x: unknown, what: string, check: (n: number) => boolean): [number, number, number] => {
    if (!Array.isArray(x) || x.length !== 3 || !x.every((n) => isNum(n) && check(n))) throw new Error(`settings.lightRig ${what} is not three numbers in range`);
    return [x[0], x[1], x[2]];
  };
  const three = (x: unknown, what: string, check: (n: number) => boolean) => {
    if (!Array.isArray(x) || x.length !== 3) throw new Error(`settings.lightRig ${what} is not three lights`);
    return [vec(x[0], `${what} 1`, check), vec(x[1], `${what} 2`, check), vec(x[2], `${what} 3`, check)] as LightRigSetting["directions"];
  };
  const dir = (n: number): boolean => n >= -1 && n <= 1;
  const lane = (n: number): boolean => n >= 0 && n <= LIGHT_RIG_COLOUR_MAX;
  return { directions: three(v["directions"], "directions", dir), colours: three(v["colours"], "colours", lane), ambient: vec(v["ambient"], "ambient", lane) };
}

/** `settings.arsenal` read: `Enable` valves 0..63, and each side's picks (slot 0..4, an item id 0..253). */
function parseArsenal(v: unknown): ArsenalSetting | null {
  if (v === null) return null;
  const no = (why: string): never => { throw new Error(`settings.arsenal ${why}`); };
  if (!isObj(v)) no("is not an object");
  const a = v as Record<string, unknown>;
  for (const k of Object.keys(a)) if (k !== "valves" && k !== "kits") no(`names no field ${k}`);
  const valves = a["valves"], kits = a["kits"];
  if (!isObj(valves)) no("valves is not an object");
  const names = Object.keys(valves as object);
  if (names.length > ARSENAL_VALVES_MAX) no(`names more than ${ARSENAL_VALVES_MAX} valves`);
  const outValves: Record<string, number> = {};
  for (const name of names) {
    const n = (valves as Record<string, unknown>)[name];
    if (!/^Enable[A-Za-z0-9_-]{1,40}$/.test(name)) no(`valve ${name} is not an Enable_ valve`);
    if (!isNum(n) || !Number.isInteger(n) || n < 0 || n > 63) no(`valve ${name} is not an integer 0..63`);
    outValves[name] = n as number;
  }
  if (!isObj(kits)) no("kits is not an object");
  const k = kits as Record<string, unknown>;
  for (const key of Object.keys(k)) if (key !== "seal" && key !== "terrorist") no(`kits names no side ${key}`);
  const side = (name: "seal" | "terrorist"): ArsenalPick[] => {
    const list = k[name];
    if (!Array.isArray(list) || list.length > ARSENAL_PICKS_MAX) no(`kits.${name} is not a list of at most ${ARSENAL_PICKS_MAX} picks`);
    return (list as unknown[]).map((p, i) => {
      if (!isObj(p) || Object.keys(p).some((x) => x !== "slot" && x !== "id")) no(`kits.${name} pick ${i} is not a slot and an id`);
      const { slot, id } = p as Record<string, unknown>;
      if (!isNum(slot) || !Number.isInteger(slot) || slot < 0 || slot > 4) no(`kits.${name} pick ${i} slot is not 0..4`);
      if (!isNum(id) || !Number.isInteger(id) || id < 0 || id > 253) no(`kits.${name} pick ${i} id is not an item 0..253`);
      return { slot: slot as number, id: id as number };
    });
  };
  return { valves: outValves, kits: { seal: side("seal"), terrorist: side("terrorist") } };
}

/** `settings.characters` read: each side at most four columns, each a disc MP map's stem and a type 0..3. */
function parseRoster(v: unknown): CharacterRoster | null {
  if (v === null) return null;
  const no = (why: string): never => { throw new Error(`settings.characters ${why}`); };
  if (!isObj(v)) no("is not an object");
  const r = v as Record<string, unknown>;
  for (const k of Object.keys(r)) if (k !== "seal" && k !== "terrorist") no(`names no side ${k}`);
  const side = (name: "seal" | "terrorist"): RosterPick[] => {
    const list = r[name];
    if (!Array.isArray(list) || list.length > ROSTER_COLUMNS_MAX) no(`.${name} is not a list of at most ${ROSTER_COLUMNS_MAX} columns`);
    return (list as unknown[]).map((c, i) => {
      if (!isObj(c) || Object.keys(c).some((x) => x !== "map" && x !== "index")) no(`.${name} column ${i} is not a map and an index`);
      const { map, index } = c as Record<string, unknown>;
      if (typeof map !== "string" || !/^MP\d{1,3}$/.test(map)) no(`.${name} column ${i} map is not a disc MP map`);
      if (!isNum(index) || !Number.isInteger(index) || index < 0 || index >= ROSTER_COLUMNS_MAX) no(`.${name} column ${i} index is not 0..3`);
      return { map: map as string, index: index as number };
    });
  };
  return { seal: side("seal"), terrorist: side("terrorist") };
}

export function parseSettings(raw: unknown): Partial<LayoutSettings> {
  if (!isObj(raw)) throw new Error("settings is not an object");
  const out: Partial<LayoutSettings> = {};
  for (const key of Object.keys(raw)) if (!SETTINGS_FIELDS.has(key)) throw new Error(`settings names no field ${key}`);
  const bounded = (key: keyof typeof SETTINGS_BOUNDS, v: unknown, integer: boolean): number => {
    const b = SETTINGS_BOUNDS[key];
    if (!isNum(v) || v < b.min || v > b.max || (integer && !Number.isInteger(v))) throw new Error(`settings.${key} is not a number in ${b.min}..${b.max}`);
    return v;
  };
  if (raw["timeOfDay"] !== undefined) out.timeOfDay = raw["timeOfDay"] === null ? null : bounded("timeOfDay", raw["timeOfDay"], false);
  if (raw["light"] !== undefined) out.light = bounded("light", raw["light"], false);
  if (raw["fogFar"] !== undefined) out.fogFar = raw["fogFar"] === null ? null : bounded("fogFar", raw["fogFar"], true);
  if (raw["players"] !== undefined) {
    const n = bounded("players", raw["players"], true);
    if (n % 2 !== 0) throw new Error("settings.players is not even");
    out.players = n;
  }
  if (raw["rounds"] !== undefined) out.rounds = bounded("rounds", raw["rounds"], true);
  if (raw["roundSeconds"] !== undefined) out.roundSeconds = bounded("roundSeconds", raw["roundSeconds"], true);
  if (raw["friendlyFire"] !== undefined) {
    if (typeof raw["friendlyFire"] !== "boolean") throw new Error("settings.friendlyFire is not a boolean");
    out.friendlyFire = raw["friendlyFire"];
  }
  if (raw["lightRig"] !== undefined) out.lightRig = parseLightRig(raw["lightRig"]);
  if (raw["fog"] !== undefined) {
    const v = raw["fog"];
    if (v === null) out.fog = null;
    else {
      if (!isObj(v) || typeof v["on"] !== "boolean" || !isNum(v["near"]) || v["near"] < 0 || v["near"] > SETTINGS_BOUNDS.fogFar.max) throw new Error("settings.fog is not an on, a near distance and a height band");
      const h = v["height"];
      if (h !== null && (!isObj(h) || !isNum(h["top"]) || !isNum(h["bottom"]) || Math.abs(h["top"]) > 100000 || Math.abs(h["bottom"]) > 100000)) throw new Error("settings.fog.height is not a top and a bottom");
      out.fog = { on: v["on"], near: v["near"], height: h === null ? null : { top: (h as Record<string, number>)["top"]!, bottom: (h as Record<string, number>)["bottom"]! } };
    }
  }
  if (raw["night"] !== undefined) {
    const v = raw["night"];
    if (v === null) out.night = null;
    else {
      if (!isObj(v) || typeof v["mission"] !== "boolean") throw new Error("settings.night is not a mission and a lens");
      const lens = v["lens"] === null ? null : settingsTriple4(v["lens"]);
      out.night = { mission: v["mission"], lens };
    }
  }
  if (raw["skyFrom"] !== undefined) {
    const v = raw["skyFrom"];
    if (v !== null && (typeof v !== "string" || !/^[A-Z]{1,3}\d{1,3}$/.test(v))) throw new Error("settings.skyFrom is not a disc map's archive");
    out.skyFrom = v as string | null;
  }
  if (raw["fogColor"] !== undefined) out.fogColor = settingsTriple(raw["fogColor"], "fogColor", (n) => n >= 0 && n <= 255);
  if (raw["shadowVector"] !== undefined) {
    const v = settingsTriple(raw["shadowVector"], "shadowVector", (n) => n >= -1000 && n <= 1000);
    if (v && Math.hypot(v[0], v[1], v[2]) === 0) throw new Error("settings.shadowVector is a zero direction");
    out.shadowVector = v;
  }
  if (raw["npcBehaviour"] !== undefined) {
    const v = raw["npcBehaviour"];
    if (typeof v !== "string" || !(NPC_BEHAVIOURS as readonly string[]).includes(v)) throw new Error(`settings.npcBehaviour is not one of ${NPC_BEHAVIOURS.join(", ")}`);
    out.npcBehaviour = v as NpcBehaviour;
  }
  if (raw["arsenal"] !== undefined) out.arsenal = parseArsenal(raw["arsenal"]);
  if (raw["characters"] !== undefined) out.characters = parseRoster(raw["characters"]);
  if (raw["defaultMaterial"] !== undefined) {
    const v = raw["defaultMaterial"];
    if (v !== null && (typeof v !== "string" || !/^[A-Z][A-Z0-9_ ]{0,31}$/.test(v))) throw new Error("settings.defaultMaterial is not a SOILS name");
    out.defaultMaterial = v as string | null;
  }
  if (raw["reverb"] !== undefined) {
    const v = raw["reverb"];
    if (v === null) out.reverb = null;
    else {
      const zones = (list: unknown, what: string): [number, number][] => {
        if (!Array.isArray(list) || list.length > REVERB_ZONES_MAX) throw new Error(`settings.reverb.${what} is not a list of at most ${REVERB_ZONES_MAX} zones`);
        return list.map((z, i) => {
          if (!Array.isArray(z) || z.length !== 2 || !isNum(z[0]) || !isNum(z[1]) || z[0] < 0 || z[0] > 1 || z[1] < 0 || z[1] > REVERB_SECONDS_MAX) {
            throw new Error(`settings.reverb.${what} zone ${i} is not a depth 0..1 and seconds 0..${REVERB_SECONDS_MAX}`);
          }
          return [z[0], z[1]] as [number, number];
        });
      };
      if (!isObj(v) || Object.keys(v).some((k) => k !== "indoor" && k !== "outdoor")) throw new Error("settings.reverb is not an indoor and an outdoor list");
      out.reverb = { indoor: zones(v["indoor"], "indoor"), outdoor: zones(v["outdoor"], "outdoor") };
    }
  }
  if (raw["fov"] !== undefined) {
    const v = raw["fov"];
    const half = (n: unknown): n is number => isNum(n) && n >= FOV_HALF_MIN && n <= FOV_HALF_MAX;
    if (v !== null && (!isObj(v) || Object.keys(v).some((k) => k !== "h" && k !== "v") || !half(v["h"]) || !half(v["v"]))) {
      throw new Error(`settings.fov is not two half-angles ${FOV_HALF_MIN}..${FOV_HALF_MAX}`);
    }
    out.fov = v === null ? null : { h: (v as Record<string, number>)["h"]!, v: (v as Record<string, number>)["v"]! };
  }
  if (raw["loading"] !== undefined) {
    const v = raw["loading"];
    if (v === null) out.loading = null;
    else {
      const no = (why: string): never => { throw new Error(`settings.loading ${why}`); };
      if (!isObj(v) || Object.keys(v).some((k) => k !== "from" && k !== "title" && k !== "description")) no("is not a map, a title and a description");
      const l = v as Record<string, unknown>;
      if (l["from"] !== null && (typeof l["from"] !== "string" || !/^MP\d{1,3}$/.test(l["from"]))) no("from is not a disc MP map");
      const words = (k: string, max: number): string | null => {
        const w = l[k];
        if (w !== null && (typeof w !== "string" || w.length > max)) no(`${k} is not text of at most ${max} characters`);
        return w as string | null;
      };
      out.loading = { from: l["from"] as string | null, title: words("title", LOADING_TITLE_MAX), description: words("description", LOADING_DESCRIPTION_MAX) };
    }
  }
  if (raw["eqLimit"] !== undefined) out.eqLimit = bounded("eqLimit", raw["eqLimit"], true);
  if (raw["respawn"] !== undefined) {
    if (typeof raw["respawn"] !== "boolean") throw new Error("settings.respawn is not a boolean");
    out.respawn = raw["respawn"];
  }
  return out;
}

/**
 * A layout's game type (`FUN_002c9540`: 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5 SUPPRESSION; moved from
 * `viewer/src/forge/layout.ts` with that citation). The viewer keeps the words (`FORGE_GAME_TYPE_NAME`).
 */
export const FORGE_GAME_TYPES = [1, 2, 3, 4, 5] as const;
export type ForgeGameType = (typeof FORGE_GAME_TYPES)[number];

/** An MPBOMB site's reach when a layout omits it: the disc's `actions.rdr` range and elevation, 15 (research 173 s2). */
export const BOMB_SITE_REACH = 15;

/**
 * The most plant sites a layout's bomb may name (an adaptation, a bound, not a game value; the review of b46b88328, its
 * low 6): the record's marker bound for spawns (`RECORD_LIMITS.spawns`, 48), since a site is a marker as a spawn is.
 * The disc's maps name two (research 173 s2, 174 s2: one).
 */
export const BOMB_SITES_MAX = 48;

/** One plant site. `team` is who plants here: 0 the SEALs, 1 the Terrorists (`FUN_00594480`). */
export interface BombSite {
  team: 0 | 1;
  at: [number, number, number];
  /** Radians about y. Omitted in a file: 0. */
  yaw: number;
  /** Horizontal reach, game units. Omitted: `BOMB_SITE_REACH`. */
  range: number;
  /** Height reach, game units; -1 is no height test (`ACTION_ELEVATION_NONE`). Omitted: `BOMB_SITE_REACH`. */
  elevation: number;
  /** FG-49's lock on the marker (the editor's; the room ignores it). Omitted when unlocked. */
  locked?: true;
}

/**
 * Demolition's bomb on a layout. `start` is StartBomb. The match replaces the base's MPBOMB records and StartBomb
 * only when `start` and one site of each team are present (`applyForgeObjectives`). An incomplete bomb leaves the base's.
 */
export interface BombObjectives {
  start?: [number, number, number];
  /** The start marker's lock (FG-49). Omitted when unlocked. */
  startLocked?: true;
  sites: BombSite[];
}

export interface ForgeObjectives {
  /** The layout's game type. Omitted under "Map's own" (L1): the base plays its own type and bomb; the markers wait. */
  gameType?: ForgeGameType;
  bomb?: BombObjectives;
}

/** A placed turret (`Layout.turrets`): the disc turret it copies (its archive, its node's name), its place and facing. */
export interface TurretMarker {
  source: string;
  name: string;
  at: [number, number, number];
  yaw: number;
  locked?: boolean;
}

/** A placed door (`Layout.doors`): the disc door it copies (its archive, its node), its hinge and its turn from that door's. */
export interface DoorMarker {
  source: string;
  name: string;
  at: [number, number, number];
  yaw: number;
  locked?: boolean;
}

/**
 * A placed gate's switch (`Layout.switches`; the owner, 2026-11-08; a browser adaptation, FG.R2): the disc's lever gates
 * are opened only by a separate lever panel -- `epanel_diN`'s one collision polygon and `lever_N`'s `gateswitch` prop,
 * a SWITCH record of their own (research 174 s5; measured on MP11 and MP62) -- never by the gate itself. A copy of a
 * gate's own disc lever, at `at`, turned `yaw` radians. It runs one of: `gate`, its gate's place in `Layout.gates`; or
 * `action` (the owner, 2026-11-08), a base map's own action by its valve (`actions.rdr`'s `valve`, Crossroads'
 * `seal_strike1`), executed as the original's `EXECUTE_ACTION` executes one (research 174 s3). Neither, it runs nothing.
 */
export interface SwitchMarker {
  gate?: number;
  action?: string;
  /**
   * Its look (the owner, 2026-11-08): absent, a gate's lever panel (Death Trap's `gateswitch`); `radio`, Sujo's airstrike
   * radio (`radio_portable`); `plate`, the lever's pick plate alone (nothing drawn: set it on a prop of the layout's).
   */
  look?: SwitchLook;
  /**
   * Its record's own fields, each absent for its action's (a map action's own record's; a gate's lever's): the prompt's
   * icon (`actions.rdr`'s `bitmap`), its reach and height reach (`range`, `elevation`, -1 none) and its `points`.
   */
  prompt?: string;
  range?: number;
  elevation?: number;
  points?: number;
  /**
   * A prop it is used on (the owner, 2026-11-10: "do the same thing for switch, have a custom prop as an option"):
   * `piece`, one of the layout's props by its place in `Layout.pieces`, or `node`, one of the base map's own objects by
   * its placed path -- that prop left as it is, the use prompt's ray striking its collision; the switch, then, copies no
   * look of its own. At most one; absent, its look is struck.
   */
  piece?: number;
  node?: string;
  /** Its script (`SwitchScript`): what a pull runs. One of `gate`, `action` and `script`, or none. */
  script?: SwitchScript;
  at: [number, number, number];
  yaw: number;
  locked?: boolean;
}

/**
 * A custom damage trigger (the owner, 2026-11-10: "make our own custom damage triggers ... patch a satchel on any prop";
 * "the damage trigger [should] stay a damage trigger ... and just link to the prop"; a browser adaptation, FG.R2): an
 * object of its own at `at`, linked to `piece` (its place in `Layout.pieces`) or `node` (one of the base map's own
 * objects by its placed path, `worldmodel/...`) -- that prop left as it is, its collision a scene destructible's
 * (`SceneDestructible`, research 174 s3) with the record's `health`, `armor` and `shield`: a health above 0 takes a
 * satchel whose damage reaches the shield (`FUN_002739b0`, C4's), 0 dies on any hit that reaches it (`FUN_00273a50`, a
 * plank's). Its death hides the prop, then runs `script`'s steps (`SwitchScript`'s, once: no `second`, no `repeat`).
 * Linked to neither, it does nothing yet.
 */
export interface PieceTrigger { piece?: number; node?: string; health: number; armor: number; shield: number; script?: SwitchScript; at?: [number, number, number] }
/**
 * A Forge object (the owner, 2026-11-10: "find every type of object we can place ... I want to be able to place every
 * type of object in game"; placing one is a browser adaptation, FG.R2), each a copy of a disc map's own, at `at` turned
 * `yaw` radians:
 * - `ambient`: one of a disc map's ambient programs (`source` its map, `name` the program: `flame_in_barrel`,
 *   `waterfall1_sprays`, `rain_falling`) -- the effects a map's mission set starts with the round (`EffectData.ambient`:
 *   its particles, its sound, its light) -- played here from the round's start, rooted at this place;
 * - `crane`: a copy of a disc map's crane (`source`, `name` its node: Chain Reaction's).
 *
 * `audio` (an ambient's; the owner, 2026-11-10: "keep ambient, but make it fully scriptable ... I don't want to have any
 * custom behaviour"): its program's sounds written as a script of the game's own commands (`AudioStep`), standing in for
 * the program's own (its particles and light as ever).
 */
export type ForgeObjectKind = "ambient" | "crane";
export interface ForgeObject { kind: ForgeObjectKind; source: string; name: string; at: [number, number, number]; yaw: number; locked?: boolean; audio?: AudioStep[] }
export const FORGE_OBJECT_KINDS: readonly ForgeObjectKind[] = ["ambient", "crane"];
/**
 * An ambient's audio script step: each one of the game's own program commands as its ambient programs use them (the
 * disc's: Sujo's `lightning_flashes`, the Fish Hook crickets, Desert Glory's `mp6_battlesounds`), run as the game runs them:
 * - `play`: `SOUND` at the object (`FUN_002659c0`): `sound` from the disc map `from` (absent, the base map's), at the
 *   command's `volume` (flag 0x10; absent 1), heard by the sound's own RANGE. A `~` sound is one of the game's loops: as
 *   every `~` sound of an ambient program, it loops at the object from the round's start (`zanimEmitters`);
 * - `wait`: `WAIT` `seconds`, plus up to `random` more (its random range, flag 0x20);
 * - `loop`: `LOOP` -- the script again from its first step, `times` in all (flag 1's count), for `seconds` (flag 2's), or for
 *   ever with neither (the disc's `LOOP -1`);
 * - `while` ... `endWhile`: `WHILE` (for ever) and `END_WHILE`;
 * - `if` / `elseif` (`chance`) ... `else` ... `endif`: `IF` / `ELSEIF` on `RANDOM_WEIGHT` (`FUN_0025dcf0`: taken when
 *   `rand() <= chance`, 0 to 1), `ELSE`, `ENDIF`.
 */
export type AudioStep =
  | { do: "play"; sound: string; from?: string; volume?: number }
  | { do: "wait"; seconds: number; random?: number }
  | { do: "loop"; times?: number; seconds?: number }
  | { do: "while" } | { do: "endWhile" }
  | { do: "if" | "elseif"; chance: number } | { do: "else" } | { do: "endif" };
/** The checks on a file's audio script (not game values): its steps, a wait's or a loop's seconds, a volume, a count. */
export const AUDIO_STEPS_MAX = 64;
export const AUDIO_WAIT_MAX = 600;
export const AUDIO_VOLUME_MAX = 4;
export const AUDIO_LOOP_MAX = 1000;
const AUDIO_SOUND = /^[A-Za-z0-9_.~!^ -]{1,48}$/;
/** Whether `v` is an audio script (`AudioStep[]`): known steps, in bounds, each `while` and `if` closed in order. */
export function audioScriptOk(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > AUDIO_STEPS_MAX) return false;
  const num = (x: unknown, lo: number, hi: number): boolean => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
  // The open blocks: a while, or an if (its else seen or not).
  const open: ("while" | "if" | "else")[] = [];
  for (const st of v) {
    if (st === null || typeof st !== "object" || Array.isArray(st)) return false;
    const s = st as Record<string, unknown>;
    const keys = (...k: string[]): boolean => Object.keys(s).every((x) => x === "do" || k.includes(x));
    switch (s["do"]) {
      case "play":
        if (!keys("sound", "from", "volume") || typeof s["sound"] !== "string" || !AUDIO_SOUND.test(s["sound"])) return false;
        if (s["from"] !== undefined && (typeof s["from"] !== "string" || !/^[A-Z]{1,3}\d{1,3}$/.test(s["from"]))) return false;
        if (s["volume"] !== undefined && !num(s["volume"], 0, AUDIO_VOLUME_MAX)) return false;
        break;
      case "wait":
        if (!keys("seconds", "random") || !num(s["seconds"], 0, AUDIO_WAIT_MAX) || (s["random"] !== undefined && !num(s["random"], 0, AUDIO_WAIT_MAX))) return false;
        break;
      case "loop":
        if (!keys("times", "seconds") || (s["times"] !== undefined && s["seconds"] !== undefined)) return false;
        if (s["times"] !== undefined && !(Number.isInteger(s["times"]) && num(s["times"], 1, AUDIO_LOOP_MAX))) return false;
        if (s["seconds"] !== undefined && !num(s["seconds"], 0, AUDIO_WAIT_MAX * 6)) return false;
        break;
      case "while": if (!keys()) return false; open.push("while"); break;
      case "endWhile": if (!keys() || open.pop() !== "while") return false; break;
      case "if": if (!keys("chance") || !num(s["chance"], 0, 1)) return false; open.push("if"); break;
      case "elseif": if (!keys("chance") || !num(s["chance"], 0, 1) || open[open.length - 1] !== "if") return false; break;
      case "else": if (!keys() || open[open.length - 1] !== "if") return false; open[open.length - 1] = "else"; break;
      case "endif": { if (!keys()) return false; const top = open.pop(); if (top !== "if" && top !== "else") return false; break; }
      default: return false;
    }
  }
  return open.length === 0;
}
const OBJECT_NAME = /^[A-Za-z0-9_ .=-]{1,48}$/;
const OBJECT_SOURCE = /^[A-Z]{1,3}\d{1,3}$/;
/** Whether `v` is a `ForgeObject` as a file holds one (its map, its name there, its place; an ambient's audio script). */
export function forgeObjectOk(v: unknown): boolean {
  if (!isObj(v) || !Object.keys(v).every((k) => ["kind", "source", "name", "at", "yaw", "locked", "audio"].includes(k))) return false;
  if (typeof v["kind"] !== "string" || !(FORGE_OBJECT_KINDS as readonly string[]).includes(v["kind"])) return false;
  if (typeof v["name"] !== "string" || !OBJECT_NAME.test(v["name"])) return false;
  if (!(typeof v["source"] === "string" && OBJECT_SOURCE.test(v["source"]))) return false;
  if (!Array.isArray(v["at"]) || v["at"].length !== 3 || !v["at"].every(isNum) || !isNum(v["yaw"])) return false;
  if (v["audio"] !== undefined && (v["kind"] !== "ambient" || !audioScriptOk(v["audio"]))) return false;
  return v["locked"] === undefined || v["locked"] === true;
}
/** A trigger's health, armour and shield: a check on the file's, not a game value. */
export const TRIGGER_STAT_MAX = 100_000;

/** Whether `v` is a `PieceTrigger` of a layout of `c`'s lists (its prop one of `c.pieces`, its script theirs). */
export function pieceTriggerOk(v: unknown, c: SwitchCounts): boolean {
  if (!isObj(v) || !Object.keys(v).every((k) => ["piece", "node", "health", "armor", "shield", "script", "at"].includes(k))) return false;
  if (v["at"] !== undefined && !(Array.isArray(v["at"]) && v["at"].length === 3 && v["at"].every(isNum))) return false;
  const stat = (x: unknown): boolean => isNum(x) && x >= 0 && x <= TRIGGER_STAT_MAX;
  // At most one of a prop of the layout's and a map node.
  const piece = v["piece"] !== undefined, node = v["node"] !== undefined;
  if ((piece && node) || (piece && !isIndex(v["piece"], c.pieces)) || (node && (typeof v["node"] !== "string" || !SWITCH_MAP_PATH.test(v["node"])))) return false;
  if (!stat(v["health"]) || !stat(v["armor"]) || !stat(v["shield"])) return false;
  const sc = v["script"];
  return sc === undefined || switchScriptOk(sc, c);
}

/**
 * What a script step acts on (the owner, 2026-11-08): a node of the base map by its placed path (`worldmodel/...`), or
 * one of the layout's own -- a piece, a damage trigger (`barriers`), a gate -- by its place in its list.
 */
export type SwitchTarget = { map: string } | { piece: number } | { barrier: number } | { gate: number } | { object: number };
/**
 * A script step (the owner, 2026-11-08; a browser adaptation, FG.R2): each one of the original's own program commands
 * (`@s2u/scene` `EffectOp`; research 209): `run` an action -- a base map's by its valve, or a damage trigger's death
 * (`EXECUTE_ACTION`); `show`/`hide` a node (`OBJECT_ACTIVE_STATE`); `wait` (`WAIT`); a `message` (`MESSAGE`); a `sound`
 * (`SOUND`) or an `effect` (a common effect, `CALL_ANIMATION`) at a target -- `from` the disc map whose sound or effect
 * it is (the owner, 2026-11-10: "all sounds/effects from all maps"; lent into the match where the base map lacks it),
 * absent for the base map's own; `set` a flag (`VALVE`) and test it (`if`
 * ... `else` ... `end`, `IF`/`ELSE`/`ENDIF`); a `blast` at a target: `FIRE_WEAPON` of MPBOMB / MPBOMB Ammo, as
 * Crossroads' bridges fire it at their `damage_point`s and Demolition's `base_explosion1` at the bomb (research 171 s4,
 * 332 s0-s2) -- the record's own Explosion_Damage 50 and Explosion_Radius 300 u, its fuse 0.001 and second timer 0.01,
 * nothing of the Forge's (the owner, 2026-11-10: "no custom stuff ... if we can support damage without custom, do it").
 */
export type SwitchStep =
  | { do: "run"; action: string } | { do: "run"; barrier: number }
  | { do: "show" | "hide"; target: SwitchTarget }
  | { do: "wait"; seconds: number }
  | { do: "message"; text: string }
  | { do: "sound" | "effect"; name: string; at?: SwitchTarget; from?: string }
  | { do: "set"; flag: string; value: number }
  | { do: "if"; flag: string; equals: number } | { do: "else" } | { do: "end" }
  | { do: "blast"; at?: SwitchTarget };
/**
 * A switch's script: the `steps` a pull runs -- once a round, as the disc's switches are (the room's `used`, cleared at the
 * round by `FUN_002b5510`; the owner, 2026-11-10: "no custom stuff").
 */
export interface SwitchScript { steps: SwitchStep[] }
/** A script's bounds: steps a list, the wait, the message and the names -- a check on the file's, not a game value. */
export const SWITCH_SCRIPT_STEPS_MAX = 64;
export const SWITCH_WAIT_MAX = 600;
const SWITCH_MESSAGE = /^[^\u0000-\u001f]{1,80}$/;
const SWITCH_SOUND = /^[A-Za-z0-9_. -]{1,48}$/;
/** A step's `from`: a disc map's archive stem (`MP72`, `M51`). */
const SWITCH_FROM = /^[A-Z]{1,3}\d{1,3}$/;
const SWITCH_FLAG = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const SWITCH_MAP_PATH = /^worldmodel(\/[A-Za-z0-9_ .-]+(=[A-Za-z0-9_ .-]+)?)+$/;
/** The layout's own lists a script's targets index. */
export interface SwitchCounts { pieces: number; barriers: number; gates: number; objects?: number }
const isIndex = (v: unknown, n: number): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
function switchTargetOk(t: unknown, c: SwitchCounts): boolean {
  if (!isObj(t)) return false;
  const keys = Object.keys(t);
  if (keys.length !== 1) return false;
  if ("map" in t) return typeof t["map"] === "string" && t["map"].length <= 240 && SWITCH_MAP_PATH.test(t["map"]);
  if ("piece" in t) return isIndex(t["piece"], c.pieces);
  if ("barrier" in t) return isIndex(t["barrier"], c.barriers);
  if ("gate" in t) return isIndex(t["gate"], c.gates);
  if ("object" in t) return isIndex(t["object"], c.objects ?? 0);   // a Forge object (`Layout.objects`): an ambient's place
  return false;
}
function switchStepsOk(list: unknown, c: SwitchCounts): boolean {
  if (!Array.isArray(list) || list.length > SWITCH_SCRIPT_STEPS_MAX) return false;
  const open: boolean[] = [];   // each open `if`: whether its `else` was seen
  for (const st of list) {
    if (!isObj(st) || typeof st["do"] !== "string") return false;
    const has = (...k: string[]) => Object.keys(st).every((x) => x === "do" || k.includes(x));
    switch (st["do"]) {
      case "run":
        if (!(has("action") && typeof st["action"] === "string" && SWITCH_ACTION.test(st["action"]))
          && !(has("barrier") && isIndex(st["barrier"], c.barriers))) return false;
        break;
      case "show": case "hide": if (!has("target") || !switchTargetOk(st["target"], c)) return false; break;
      case "wait": if (!has("seconds") || !isNum(st["seconds"]) || st["seconds"] < 0 || st["seconds"] > SWITCH_WAIT_MAX) return false; break;
      case "message":
        if (!has("text") || typeof st["text"] !== "string" || !SWITCH_MESSAGE.test(st["text"])) return false;
        break;
      case "sound": case "effect":
        if (!has("name", "at", "from") || typeof st["name"] !== "string" || !SWITCH_SOUND.test(st["name"]) || (st["at"] !== undefined && !switchTargetOk(st["at"], c))
          || (st["from"] !== undefined && (typeof st["from"] !== "string" || !SWITCH_FROM.test(st["from"])))) return false;
        break;
      case "blast":
        if (!has("at") || (st["at"] !== undefined && !switchTargetOk(st["at"], c))) return false;
        break;
      case "set": if (!has("flag", "value") || typeof st["flag"] !== "string" || !SWITCH_FLAG.test(st["flag"]) || !isPoints10k(st["value"])) return false; break;
      case "if":
        if (!has("flag", "equals") || typeof st["flag"] !== "string" || !SWITCH_FLAG.test(st["flag"]) || !isPoints10k(st["equals"])) return false;
        open.push(false);
        break;
      case "else": if (!has() || open.length === 0 || open[open.length - 1]) return false; open[open.length - 1] = true; break;
      case "end": if (!has() || open.length === 0) return false; open.pop(); break;
      default: return false;
    }
  }
  return open.length === 0;
}
const isPoints10k = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9999;
/** Null when `v` is a good `SwitchScript` for a layout of `c`; else why. */
export function switchScriptOk(v: unknown, c: SwitchCounts): boolean {
  if (!isObj(v) || !Object.keys(v).every((k) => k === "steps")) return false;
  return switchStepsOk(v["steps"], c);
}

/** A switch's map action: a valve's name as `actions.rdr` writes one. */
const SWITCH_ACTION = /^[A-Za-z0-9_.-]{1,64}$/;
/** A switch's looks beside the lever panel (`SwitchMarker.look`). */
export type SwitchLook = "radio" | "plate";
export const SWITCH_LOOKS: readonly SwitchLook[] = ["radio", "plate"];
/** A prompt's icon as `actions.rdr` names one (`action_pull_lever.tif`). */
const SWITCH_PROMPT = /^action_[a-z0-9_]{1,40}\.tif$/;
/** The bounds of a switch's own reach, height reach and points: a check on the file's, not a game value. */
export const SWITCH_REACH_MAX = 500;
export const SWITCH_POINTS_MAX = 100;
const isReach = (v: unknown): boolean => isNum(v) && (v as number) > 0 && (v as number) <= SWITCH_REACH_MAX;
const isElevation = (v: unknown): boolean => v === -1 || isReach(v);
const isPoints = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= SWITCH_POINTS_MAX;
/** A switch's optional fields as the file and the record carry them: each absent (`undefined`) or good. */
function switchFieldsOk(f: { look?: unknown; prompt?: unknown; range?: unknown; elevation?: unknown; points?: unknown }): boolean {
  return (f.look === undefined || SWITCH_LOOKS.includes(f.look as SwitchLook)) && (f.prompt === undefined || (typeof f.prompt === "string" && SWITCH_PROMPT.test(f.prompt)))
    && (f.range === undefined || isReach(f.range)) && (f.elevation === undefined || isElevation(f.elevation)) && (f.points === undefined || isPoints(f.points));
}
/** A switch's prop link (`SwitchMarker.piece` / `node`): at most one, a prop of the layout's or a map node's path. */
function switchLinkOk(piece: unknown, node: unknown, pieces: number): boolean {
  if (piece !== undefined && node !== undefined) return false;
  return (piece === undefined || isIndex(piece, pieces)) && (node === undefined || (typeof node === "string" && SWITCH_MAP_PATH.test(node)));
}
/** A switch's optional fields kept, each only when present. */
const switchFields = (f: { look?: unknown; prompt?: unknown; range?: unknown; elevation?: unknown; points?: unknown }): Pick<SwitchMarker, "look" | "prompt" | "range" | "elevation" | "points"> => ({
  ...(f.look !== undefined ? { look: f.look as SwitchLook } : {}), ...(f.prompt !== undefined ? { prompt: f.prompt as string } : {}),
  ...(f.range !== undefined ? { range: f.range as number } : {}), ...(f.elevation !== undefined ? { elevation: f.elevation as number } : {}),
  ...(f.points !== undefined ? { points: f.points as number } : {}),
});

/** A placed turret's source archive (a disc map's stem) and its turret's node name. */
const TURRET_SOURCE = /^[A-Z]{1,3}\d{1,3}$/;
/** The disc's own spelling, a space and all (Enowapi's MGL turret is `mp62MGLturret `): letters, digits, `_` and spaces. */
const TURRET_NAME = /^[A-Za-z0-9_ ]{1,48}$/;

/** A placed flare (`Layout.flares`): the archive and facade node it copies, its place. No turn: the engine faces it. */
export interface FlareMarker {
  source: string;
  name: string;
  at: [number, number, number];
  locked?: boolean;
}

/** A placed flare's node name: letters, digits, `_`, `.`, `-` and spaces, 1-48 (the viewer's `FLARE_NAME`). */
const FLARE_NODE = /^[A-Za-z0-9_ .-]{1,48}$/;

/** A placed tactical point (`Layout.tacPoints`): its name, its kind (0-31; 1 a nav point), its place. */
export interface TacPointMarker {
  name: string;
  kind: number;
  at: [number, number, number];
  locked?: boolean;
}

/** A placed spectator view (`Layout.scenicViews`): its name, the camera's place, yaw and pitch (degrees). */
export interface ScenicViewMarker {
  name: string;
  at: [number, number, number];
  yaw: number;
  pitch: number;
  locked?: boolean;
}

/** A placed extraction zone (`Layout.extractionZones`): its name (Safety, Safety2...), its centre, its width (x) and depth (z). */
export interface ExtractionZone {
  name: string;
  at: [number, number, number];
  size: [number, number];
  locked?: boolean;
}

/** A placed hostage (`Layout.hostages`): its place and facing; a lock as a marker's (FG-49). */
export interface HostageMarker {
  p: [number, number, number];
  yaw: number;
  locked?: boolean;
  /** Its scene name (the disc's Hostage1, Hostage2...); absent, the match names it. */
  name?: string;
  /** Its body, a hostage character of the base (`thai_wife`), or of `source`'s map; absent, the base's first hostage's. */
  character?: string;
  /** The disc map whose hostage character it wears (`MP6`), lent to the match with its body; absent, the base's own. */
  source?: string;
}

export interface NpcMarker {
  side: "seal" | "terrorist";
  /** The side's character type on the map: an index into `LoadedMap.types[side]`. */
  type: number;
  p: [number, number, number];
  yaw: number;
  /** FG-49: a locked marker is not selected or moved. Absent: unlocked. */
  locked?: boolean;
  /** FCW-07a: the stable authored id. Absent: its row's default. */
  id?: string;
}

/**
 * FCW-30 (`docs/specs/2026-10-27-creator-rules-contract.md` §4; a browser adaptation with no original): the layout's
 * rules entities -- a zone (a volume: an upright cylinder about `at`, or a box centred on `at` turned by `yaw`), a marker
 * (a named point) and a spawner (a source of players, NPCs or items, spread over `radius`) -- each with a stable authored
 * id (`AUTHORED_ID`, unique across the record, never a default). Inert data: only a rules pack's rules name them (the
 * room runs those, FCW-31); with no rules pack the layout plays as before. In a `Layout` a yaw is in radians, in a
 * record in whole degrees (as a spawn's); a record's numbers sit on its lattice (`RECORD_POSITION_DENOMINATOR`).
 */
export const ZONE_SHAPES = ["cylinder", "box"] as const;
export const SPAWNER_SOURCES = ["player", "npc", "item"] as const;
export type SpawnerSource = (typeof SPAWNER_SOURCES)[number];
/** Zones, markers and spawners in one layout, each kind: the record's marker bound (`RECORD_LIMITS.spawns`, as `BOMB_SITES_MAX`). */
export const RECORD_ENTITIES_MAX = 48;

export type LayoutZone =
  | { id: string; shape: "cylinder"; at: [number, number, number]; radius: number; height: number; locked?: true }
  | { id: string; shape: "box"; at: [number, number, number]; size: [number, number, number]; yaw: number; locked?: true };
export interface LayoutMarker {
  id: string;
  at: [number, number, number];
  yaw: number;
  locked?: true;
}
/** `team` for players (`SpawnMarker.team`), `side` and `type` for NPCs (`NpcMarker`'s), neither for items. */
export interface LayoutSpawner {
  id: string;
  source: SpawnerSource;
  at: [number, number, number];
  yaw: number;
  radius: number;
  team?: "A" | "B";
  side?: "seal" | "terrorist";
  type?: number;
  locked?: true;
}
/** The record's forms: the same fields, a yaw in whole degrees. */
export type RecordZone = LayoutZone;
export type RecordMarker = LayoutMarker;
export type RecordSpawner = LayoutSpawner;

const ZONE_KEYS = { cylinder: ["id", "shape", "at", "radius", "height", "locked"], box: ["id", "shape", "at", "size", "yaw", "locked"] } as const;
const MARKER_KEYS = ["id", "at", "yaw", "locked"];
const SPAWNER_KEYS = ["id", "source", "at", "yaw", "radius", "team", "side", "type", "locked"];
type EntityKind = "zone" | "marker" | "spawner";

/**
 * Null when `v` is the entity `kind` (its row `i`), else why not. `record`: a record's -- numbers on the lattice inside
 * the map bound, a yaw in whole degrees, a lock only `true`; else a layout file's -- finite numbers, a yaw in radians.
 */
function entityError(kind: EntityKind, v: unknown, i: number, record: boolean): string | null {
  const what = `${kind} ${i}`;
  if (!isObj(v)) return `${what} is not an object`;
  const size = (n: unknown): boolean => (record ? inBound(n) : isNum(n)) && (n as number) <= RECORD_LIMITS.coord;
  const positive = (n: unknown): boolean => size(n) && (n as number) > 0;
  const point = (p: unknown): boolean => Array.isArray(p) && p.length === 3 && p.every((x) => (record ? inBound(x) : isNum(x)));
  const yaw = (n: unknown): boolean => (record ? isDeg(n) : isNum(n));
  const keys = kind === "zone" ? (v["shape"] === "box" ? ZONE_KEYS.box : ZONE_KEYS.cylinder) : kind === "marker" ? MARKER_KEYS : SPAWNER_KEYS;
  for (const k of Object.keys(v)) if (!(keys as readonly string[]).includes(k)) return `${what} names no field ${k}`;
  if (typeof v["id"] !== "string" || !AUTHORED_ID.test(v["id"])) return `${what} id is not 1-64 of A-Z a-z 0-9 _ . -`;
  if (!point(v["at"])) return `${what} is not at a point${record ? " on the record's lattice" : ""}`;
  if (v["locked"] !== undefined && v["locked"] !== true && (record || v["locked"] !== false)) return `${what} lock is not true`;
  if (kind === "zone") {
    if (v["shape"] === "cylinder") return positive(v["radius"]) && positive(v["height"]) ? null : `${what} is not a cylinder of a radius and a height above 0`;
    if (v["shape"] === "box") {
      const s = v["size"];
      return Array.isArray(s) && s.length === 3 && s.every(positive) && yaw(v["yaw"]) ? null : `${what} is not a box of three sizes above 0 and a yaw`;
    }
    return `${what} shape is not one of ${ZONE_SHAPES.join(", ")}`;
  }
  if (!yaw(v["yaw"])) return `${what} yaw is not ${record ? "a whole degree" : "a number"}`;
  if (kind === "marker") return null;
  if (!size(v["radius"]) || (v["radius"] as number) < 0) return `${what} radius is not 0 or more`;
  const src = v["source"];
  const team = v["team"] !== undefined, side = v["side"] !== undefined, type = v["type"] !== undefined;
  if (src === "player") return team && (v["team"] === "A" || v["team"] === "B") && !side && !type ? null : `${what} is a player spawner: a team A or B, and no side or type`;
  if (src === "npc") {
    const t = v["type"];
    return !team && (v["side"] === "seal" || v["side"] === "terrorist") && Number.isInteger(t) && (t as number) >= 0 && (t as number) <= 31 ? null
      : `${what} is an NPC spawner: a side and a character type 0..31, and no team`;
  }
  if (src === "item") return !team && !side && !type ? null : `${what} is an item spawner: no team, side or type`;
  return `${what} source is not one of ${SPAWNER_SOURCES.join(", ")}`;
}

const ENTITY_LISTS = [["zones", "zone"], ["markers", "marker"], ["spawners", "spawner"]] as const;

/** The entity lists of a record (strict: each present list 1..`RECORD_ENTITIES_MAX`) or of a file (empty dropped). */
function entityListsError(r: Record<string, unknown>, record: boolean): string | null {
  for (const [list, kind] of ENTITY_LISTS) {
    const v = r[list];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.length > RECORD_ENTITIES_MAX || (record && v.length === 0)) return `${list} is not a list of ${record ? 1 : 0}-${RECORD_ENTITIES_MAX} ${kind}s`;
    for (const [i, e] of v.entries()) {
      const why = entityError(kind, e, i, record);
      if (why) return why;
    }
  }
  return null;
}

/** A checked entity, copied: the record's lattice and degrees (`toRecord`), or the layout's radians. */
function copyEntity<T extends LayoutZone | LayoutMarker | LayoutSpawner>(e: T, toRecord: boolean | null): T {
  const out = json(e) as unknown as { yaw?: number; radius?: number; height?: number; size?: number[]; at: number[]; locked?: unknown };
  if (out.locked !== true) delete out.locked;
  if (toRecord === null) return out as unknown as T;
  const conv = (n: number): number => (toRecord ? tenth(n) : n);
  out.at = out.at.map(conv);
  if (out.radius !== undefined) out.radius = conv(out.radius);
  if (out.height !== undefined) out.height = conv(out.height);
  if (out.size) out.size = out.size.map(conv);
  if (out.yaw !== undefined) out.yaw = toRecord ? wholeDeg(out.yaw) : (out.yaw * Math.PI) / 180;
  return out as unknown as T;
}

/** The entities' ids, each kind in its order. */
export function layoutEntityIds(l: { zones?: readonly { id: string }[]; markers?: readonly { id: string }[]; spawners?: readonly { id: string }[] }): RulesLayoutEntities {
  return { zones: (l.zones ?? []).map((z) => z.id), markers: (l.markers ?? []).map((m) => m.id), spawners: (l.spawners ?? []).map((s) => s.id) };
}
const entityIdList = (l: Parameters<typeof layoutEntityIds>[0]): string[] => {
  const e = layoutEntityIds(l);
  return [...e.zones, ...e.markers, ...e.spawners];
};

const PLACEMENT_KEY = /^[A-Za-z0-9_.\-]{1,64}@-?\d+,-?\d+,-?\d+$/;

export function parseAssetId(id: string): { archive: string; model: string } | null {
  const at = id.indexOf(":");
  if (at <= 0 || at === id.length - 1) return null;
  return { archive: id.slice(0, at), model: id.slice(at + 1) };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** FG-49: `locked: true` is kept; absent or false is unlocked; anything else is refused. */
const lockedFlag = (v: unknown, what: string): boolean => {
  if (v === undefined || v === false) return false;
  if (v === true) return true;
  throw new Error(`${what} is not a boolean`);
};

const CAMERA_KEYS = ["x", "y", "z", "yaw", "pitch"] as const;

/** A camera record, or a throw naming the field that is not a finite number. */
export function parseCamera(raw: unknown): LayoutCamera {
  if (!isObj(raw)) throw new Error("camera is not a position and a look");
  const out = {} as LayoutCamera;
  for (const k of CAMERA_KEYS) {
    if (!isNum(raw[k])) throw new Error(`camera.${k} is not a finite number`);
    out[k] = raw[k];
  }
  return out;
}

function parseName(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length > LAYOUT_NAME_MAX || /[\u0000-\u001f]/.test(raw)) {
    throw new Error(`the layout name is not at most ${LAYOUT_NAME_MAX} printable characters`);
  }
  const name = raw.trim();
  return name ? name : undefined;
}

/** FCW-07a: an optional authored id, or a throw. */
function authoredId(v: unknown, what: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !AUTHORED_ID.test(v)) throw new Error(`${what} id is not 1-64 of A-Z a-z 0-9 _ . -`);
  return v;
}

function parsePiece(p: unknown, i: number): Piece {
  if (!isObj(p)) throw new Error(`piece ${i} is not an object`);
  if (typeof p["asset"] !== "string" || !parseAssetId(p["asset"])) throw new Error(`piece ${i} asset is not an <archive>:<prototype> id`);
  const m = p["m"];
  if (!Array.isArray(m) || m.length !== 16 || !m.every(isNum)) throw new Error(`piece ${i} matrix is not a column-major 4x4 of finite numbers`);
  const locked = lockedFlag(p["locked"], `piece ${i} lock`);
  const id = authoredId(p["id"], `piece ${i}`);
  let content: ContentRef | undefined;
  if (p["content"] !== undefined) {
    const why = checkContentRef(p["content"]);
    if (why) throw new Error(`piece ${i}: ${why}`);
    content = cloneContent(p["content"] as unknown as ContentRef);
    if (p["asset"] !== contentAssetKey(content)) throw new Error(`piece ${i} asset is not its content's key`);
  }
  return { asset: p["asset"], m: [...m], ...(locked ? { locked: true as const } : {}), ...(id ? { id } : {}), ...(content ? { content } : {}) };
}

function parseRequires(raw: unknown): PackRef[] {
  if (!Array.isArray(raw)) throw new Error("requires is not a list of pack references");
  const seen = new Set<string>();
  return raw.map((r, i) => {
    const why = checkPackRef(r);
    if (why) throw new Error(`requires ${i}: ${why}`);
    const ref = r as PackRef;
    const key = `${ref.id}@${ref.version}`;
    if (seen.has(key)) throw new Error(`requires names ${key} twice`);
    seen.add(key);
    return { id: ref.id, version: ref.version, hash: ref.hash };
  });
}

/**
 * FCW-07a: a layout file's `ids` section (`Layout.ids`), its shape checked: `bomb` an authored id, `sites` a list of
 * them. Its length is not held to the sites' (an entry missing or past them is a default, or unused): the record's check
 * holds the record's `ids` to one per row. Empty: no section.
 */
function objectiveIdsOf(raw: unknown): { ids?: LayoutObjectiveIds } {
  if (!isObj(raw)) throw new Error("ids is not the bomb's and its sites' ids");
  for (const k of Object.keys(raw)) if (k !== "bomb" && k !== "sites") throw new Error(`ids names no field ${k}`);
  const out: LayoutObjectiveIds = {};
  const bomb = authoredId(raw["bomb"], "the bomb's start");
  if (bomb !== undefined) out.bomb = bomb;
  if (raw["sites"] !== undefined) {
    const sites = raw["sites"];
    if (!Array.isArray(sites) || sites.length > BOMB_SITES_MAX) throw new Error(`ids.sites is not a list of at most ${BOMB_SITES_MAX} site ids`);
    out.sites = sites.map((v, i) => authoredId(v, `bomb site ${i}`) as string);
  }
  return out.bomb !== undefined || out.sites ? { ids: out } : {};
}

/** Reads a layout file, refusing what is not one with the reason. */
export function parseLayout(text: string): Layout {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("not a forge layout: the file is not JSON"); }
  if (!isObj(raw)) throw new Error("not a forge layout: not an object");
  if (raw["forge"] !== LAYOUT_VERSION) throw new Error(`not a forge layout of version ${LAYOUT_VERSION}`);
  const b = raw["base"];
  let base: LayoutBase;
  if (isObj(b) && b["kind"] === "map" && typeof b["archive"] === "string" && b["archive"]) base = { kind: "map", archive: b["archive"] };
  else if (isObj(b) && b["kind"] === "blank" && typeof b["library"] === "string" && b["library"]) base = { kind: "blank", library: b["library"] };
  else if (isObj(b) && b["kind"] === "content") {
    // FCW-10: an authored map's base, checked whole (`checkContentLayoutBase`); a lobby refuses it after the parse
    const why = checkContentLayoutBase(b);
    if (why) throw new Error(`the layout's base: ${why}`);
    base = contentBaseOf(b);
  } else throw new Error("the layout's base is neither a map nor a blank floor");
  // Pieces before spawns: a bad matrix is the piece's problem, not a missing list (`piece i matrix`).
  if (!Array.isArray(raw["pieces"])) throw new Error("the layout's pieces is not a list");
  const pieces = raw["pieces"].map(parsePiece);
  if (!Array.isArray(raw["spawns"])) throw new Error("the layout's spawns is not a list");
  const spawns = raw["spawns"];
  const name = parseName(raw["name"]);
  const camera = raw["camera"] === undefined ? undefined : parseCamera(raw["camera"]);
  const layout: Layout = {
    forge: LAYOUT_VERSION,
    base,
    pieces,
    spawns: spawns.map((s, i) => {
      if (!isObj(s) || (s["team"] !== "A" && s["team"] !== "B") || !Array.isArray(s["p"]) || s["p"].length !== 3
        || !s["p"].every(isNum) || !isNum(s["yaw"])) throw new Error(`spawn ${i} is not a team, a point and a yaw`);
      const [x, y, z] = s["p"] as number[];
      const locked = lockedFlag(s["locked"], `spawn ${i} lock`);
      const id = authoredId(s["id"], `spawn ${i}`);
      return { team: s["team"], p: [x!, y!, z!] as [number, number, number], yaw: s["yaw"], ...(locked ? { locked: true as const } : {}), ...(id ? { id } : {}) };
    }),
    ...(raw["npcs"] === undefined ? {} : {
      npcs: (Array.isArray(raw["npcs"]) ? raw["npcs"] : [null]).map((n, i): NpcMarker => {
        if (!isObj(n) || (n["side"] !== "seal" && n["side"] !== "terrorist") || !Number.isInteger(n["type"]) || (n["type"] as number) < 0
          || (n["type"] as number) > 31 || !Array.isArray(n["p"]) || n["p"].length !== 3 || !n["p"].every(isNum) || !isNum(n["yaw"])) {
          throw new Error(`npc ${i} is not a side, a character type, a place and a yaw`);
        }
        const [x, y, z] = n["p"] as number[];
        const locked = lockedFlag(n["locked"], `npc ${i} lock`);
        const id = authoredId(n["id"], `npc ${i}`);
        return { side: n["side"], type: n["type"] as number, p: [x!, y!, z!] as [number, number, number], yaw: n["yaw"], ...(locked ? { locked: true as const } : {}), ...(id ? { id } : {}) };
      }),
    }),
    ...(raw["hostages"] === undefined ? {} : {
      hostages: (Array.isArray(raw["hostages"]) ? raw["hostages"] : [null]).map((h, i): HostageMarker => {
        if (!isObj(h) || !Array.isArray(h["p"]) || h["p"].length !== 3 || !h["p"].every(isNum) || !isNum(h["yaw"])) {
          throw new Error(`hostage ${i} is not a place and a yaw`);
        }
        const [x, y, z] = h["p"] as number[];
        const locked = lockedFlag(h["locked"], `hostage ${i} lock`);
        if (h["name"] !== undefined && (typeof h["name"] !== "string" || !HOSTAGE_NAME.test(h["name"]))) throw new Error(`hostage ${i} name is not 1-32 letters, digits, spaces, _ or -`);
        if (h["character"] !== undefined && (typeof h["character"] !== "string" || !HOSTAGE_CHARACTER.test(h["character"]))) throw new Error(`hostage ${i} character is not a character key`);
        if (h["source"] !== undefined && (typeof h["source"] !== "string" || !TURRET_SOURCE.test(h["source"]))) throw new Error(`hostage ${i} source is not a disc map's stem`);
        return { p: [x!, y!, z!] as [number, number, number], yaw: h["yaw"], ...(locked ? { locked: true as const } : {}),
          ...(typeof h["name"] === "string" ? { name: h["name"] } : {}), ...(typeof h["character"] === "string" ? { character: h["character"] } : {}),
          ...(typeof h["source"] === "string" ? { source: h["source"] } : {}) };
      }),
    }),
    ...(raw["extractionZones"] === undefined ? {} : {
      extractionZones: (Array.isArray(raw["extractionZones"]) ? raw["extractionZones"] : [null]).map((z, i): ExtractionZone => {
        if (!isObj(z) || typeof z["name"] !== "string" || !ZONE_NAME.test(z["name"]) || !Array.isArray(z["at"]) || z["at"].length !== 3
          || !z["at"].every(isNum) || !Array.isArray(z["size"]) || z["size"].length !== 2 || !z["size"].every((n) => isNum(n) && n > 0)) {
          throw new Error(`extraction zone ${i} is not a name, a centre and a size`);
        }
        const [x, y, zz] = z["at"] as number[];
        const [w, d] = z["size"] as number[];
        const locked = lockedFlag(z["locked"], `extraction zone ${i} lock`);
        return { name: z["name"], at: [x!, y!, zz!] as [number, number, number], size: [w!, d!] as [number, number], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["doors"] === undefined ? {} : {
      doors: (Array.isArray(raw["doors"]) ? raw["doors"] : [null]).map((t, i): DoorMarker => {
        if (!isObj(t) || typeof t["source"] !== "string" || !TURRET_SOURCE.test(t["source"]) || typeof t["name"] !== "string" || !TURRET_NAME.test(t["name"])
          || !isNum(t["yaw"]) || !Array.isArray(t["at"]) || t["at"].length !== 3 || !t["at"].every(isNum)) {
          throw new Error(`door ${i} is not a source, a name, a hinge and a yaw`);
        }
        const [x, y, z] = t["at"] as number[];
        const locked = lockedFlag(t["locked"], `door ${i} lock`);
        return { source: t["source"], name: t["name"], at: [x!, y!, z!] as [number, number, number], yaw: t["yaw"], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(["gates", "barriers"] as const).reduce((out, key) => (raw[key] === undefined ? out : {
      ...out,
      [key]: (Array.isArray(raw[key]) ? raw[key] as unknown[] : [null]).map((t, i): DoorMarker => {
        const what = key === "gates" ? "gate" : "barrier";
        if (!isObj(t) || typeof t["source"] !== "string" || !TURRET_SOURCE.test(t["source"]) || typeof t["name"] !== "string" || !TURRET_NAME.test(t["name"])
          || !isNum(t["yaw"]) || !Array.isArray(t["at"]) || t["at"].length !== 3 || !t["at"].every(isNum)) {
          throw new Error(`${what} ${i} is not a source, a name, a place and a yaw`);
        }
        const [x, y, z] = t["at"] as number[];
        const locked = lockedFlag(t["locked"], `${what} ${i} lock`);
        return { source: t["source"], name: t["name"], at: [x!, y!, z!] as [number, number, number], yaw: t["yaw"], ...(locked ? { locked: true as const } : {}) };
      }),
    }), {} as Pick<Layout, "gates" | "barriers">),
    ...(raw["switches"] === undefined ? {} : {
      switches: (Array.isArray(raw["switches"]) ? raw["switches"] as unknown[] : [null]).map((t, i): SwitchMarker => {
        const gates = Array.isArray(raw["gates"]) ? (raw["gates"] as unknown[]).length : 0;
        const gate = isObj(t) ? t["gate"] : undefined;
        const action = isObj(t) ? t["action"] : undefined;
        const script = isObj(t) ? t["script"] : undefined;
        const counts: SwitchCounts = { pieces: Array.isArray(raw["pieces"]) ? (raw["pieces"] as unknown[]).length : 0,
          barriers: Array.isArray(raw["barriers"]) ? (raw["barriers"] as unknown[]).length : 0, gates, objects: Array.isArray(raw["objects"]) ? (raw["objects"] as unknown[]).length : 0 };
        if (!isObj(t) || !isNum(t["yaw"]) || !Array.isArray(t["at"]) || t["at"].length !== 3 || !t["at"].every(isNum)
          || (gate !== undefined && !(Number.isInteger(gate) && (gate as number) >= 0 && (gate as number) < gates))
          || (action !== undefined && (typeof action !== "string" || !SWITCH_ACTION.test(action) || gate !== undefined))
          || !switchFieldsOk(t) || !switchLinkOk(t["piece"], t["node"], counts.pieces)
          || (script !== undefined && (!switchScriptOk(script, counts) || gate !== undefined || action !== undefined))) {
          throw new Error(`switch ${i} is not a place, a yaw and a gate of the layout or a map action`);
        }
        const [x, y, z] = t["at"] as number[];
        const locked = lockedFlag(t["locked"], `switch ${i} lock`);
        return { ...(gate !== undefined ? { gate: gate as number } : {}), ...(action !== undefined ? { action: action as string } : {}), ...switchFields(t),
          ...(t["piece"] !== undefined ? { piece: t["piece"] as number } : {}), ...(t["node"] !== undefined ? { node: t["node"] as string } : {}),
          ...(script !== undefined ? { script: JSON.parse(JSON.stringify(script)) as SwitchScript } : {}), at: [x!, y!, z!] as [number, number, number], yaw: t["yaw"] as number, ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["triggers"] === undefined ? {} : {
      triggers: (Array.isArray(raw["triggers"]) ? raw["triggers"] as unknown[] : [null]).map((t, i, all): PieceTrigger => {
        const counts: SwitchCounts = { pieces: Array.isArray(raw["pieces"]) ? (raw["pieces"] as unknown[]).length : 0,
          barriers: Array.isArray(raw["barriers"]) ? (raw["barriers"] as unknown[]).length : 0, gates: Array.isArray(raw["gates"]) ? (raw["gates"] as unknown[]).length : 0, objects: Array.isArray(raw["objects"]) ? (raw["objects"] as unknown[]).length : 0 };
        const same = (o: unknown): boolean => isObj(o) && isObj(t) && (t["piece"] !== undefined ? o["piece"] === t["piece"] : t["node"] !== undefined ? o["node"] === t["node"] : o === t);
        if (!pieceTriggerOk(t, counts) || all.findIndex(same) !== i) {
          throw new Error(`trigger ${i} is not a prop of the layout's or a map node (once), a health, an armour, a shield and a script`);
        }
        const o = t as Record<string, unknown>;
        const at = o["at"] as number[] | undefined;
        return { ...(o["piece"] !== undefined ? { piece: o["piece"] as number } : o["node"] !== undefined ? { node: o["node"] as string } : {}),
          ...(at ? { at: [at[0]!, at[1]!, at[2]!] as [number, number, number] } : {}), health: o["health"] as number, armor: o["armor"] as number, shield: o["shield"] as number,
          ...(o["script"] !== undefined ? { script: JSON.parse(JSON.stringify(o["script"])) as SwitchScript } : {}) };
      }),
    }),
    ...(raw["objects"] === undefined ? {} : {
      objects: (Array.isArray(raw["objects"]) ? raw["objects"] as unknown[] : [null]).map((o, i): ForgeObject => {
        if (!forgeObjectOk(o)) throw new Error(`object ${i} is not an ambient effect or a crane: a kind, a map, a name, a place and a turn, an audio script on an ambient`);
        const v = o as Record<string, unknown>;
        const at = v["at"] as number[];
        return { kind: v["kind"] as ForgeObjectKind, source: v["source"] as string, name: v["name"] as string,
          at: [at[0]!, at[1]!, at[2]!], yaw: v["yaw"] as number, ...(v["locked"] === true ? { locked: true } : {}),
          ...(v["audio"] !== undefined ? { audio: JSON.parse(JSON.stringify(v["audio"])) as AudioStep[] } : {}) };
      }),
    }),
    ...(raw["turrets"] === undefined ? {} : {
      turrets: (Array.isArray(raw["turrets"]) ? raw["turrets"] : [null]).map((t, i): TurretMarker => {
        if (!isObj(t) || typeof t["source"] !== "string" || !TURRET_SOURCE.test(t["source"]) || typeof t["name"] !== "string" || !TURRET_NAME.test(t["name"])
          || !isNum(t["yaw"]) || !Array.isArray(t["at"]) || t["at"].length !== 3 || !t["at"].every(isNum)) {
          throw new Error(`turret ${i} is not a source, a name, a place and a yaw`);
        }
        const [x, y, z] = t["at"] as number[];
        const locked = lockedFlag(t["locked"], `turret ${i} lock`);
        return { source: t["source"], name: t["name"], at: [x!, y!, z!] as [number, number, number], yaw: t["yaw"], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["flares"] === undefined ? {} : {
      flares: (Array.isArray(raw["flares"]) ? raw["flares"] : [null]).map((f, i): FlareMarker => {
        if (!isObj(f) || typeof f["source"] !== "string" || !TURRET_SOURCE.test(f["source"]) || typeof f["name"] !== "string" || !FLARE_NODE.test(f["name"])
          || !Array.isArray(f["at"]) || f["at"].length !== 3 || !f["at"].every(isNum)) {
          throw new Error(`flare ${i} is not a source, a name and a place`);
        }
        const [x, y, z] = f["at"] as number[];
        const locked = lockedFlag(f["locked"], `flare ${i} lock`);
        return { source: f["source"], name: f["name"], at: [x!, y!, z!] as [number, number, number], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["respawns"] === undefined ? {} : {
      respawns: (Array.isArray(raw["respawns"]) ? raw["respawns"] : [null]).map((s, i): SpawnMarker => {
        if (!isObj(s) || (s["team"] !== "A" && s["team"] !== "B") || !Array.isArray(s["p"]) || s["p"].length !== 3
          || !s["p"].every(isNum) || !isNum(s["yaw"])) throw new Error(`respawn point ${i} is not a team, a point and a yaw`);
        const [x, y, z] = s["p"] as number[];
        const locked = lockedFlag(s["locked"], `respawn point ${i} lock`);
        return { team: s["team"], p: [x!, y!, z!] as [number, number, number], yaw: s["yaw"], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["tacPoints"] === undefined ? {} : {
      tacPoints: (Array.isArray(raw["tacPoints"]) ? raw["tacPoints"] : [null]).map((t, i): TacPointMarker => {
        if (!isObj(t) || typeof t["name"] !== "string" || !ZONE_NAME.test(t["name"]) || !Number.isInteger(t["kind"]) || (t["kind"] as number) < 0
          || (t["kind"] as number) > 31 || !Array.isArray(t["at"]) || t["at"].length !== 3 || !t["at"].every(isNum)) {
          throw new Error(`tactical point ${i} is not a name, a kind and a place`);
        }
        const [x, y, z] = t["at"] as number[];
        const locked = lockedFlag(t["locked"], `tactical point ${i} lock`);
        return { name: t["name"], kind: t["kind"] as number, at: [x!, y!, z!] as [number, number, number], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["scenicViews"] === undefined ? {} : {
      scenicViews: (Array.isArray(raw["scenicViews"]) ? raw["scenicViews"] : [null]).map((v, i): ScenicViewMarker => {
        if (!isObj(v) || typeof v["name"] !== "string" || !ZONE_NAME.test(v["name"]) || !isNum(v["yaw"]) || !isNum(v["pitch"])
          || !Array.isArray(v["at"]) || v["at"].length !== 3 || !v["at"].every(isNum)) {
          throw new Error(`spectator view ${i} is not a name, a place, a yaw and a pitch`);
        }
        const [x, y, z] = v["at"] as number[];
        const locked = lockedFlag(v["locked"], `spectator view ${i} lock`);
        return { name: v["name"], at: [x!, y!, z!] as [number, number, number], yaw: v["yaw"], pitch: v["pitch"], ...(locked ? { locked: true as const } : {}) };
      }),
    }),
    ...(raw["hidden"] === undefined ? {} : {
      hidden: (Array.isArray(raw["hidden"]) ? raw["hidden"] : [null]).map((h, i) => {
        if (typeof h !== "string" || !PLACEMENT_KEY.test(h)) throw new Error(`hidden ${i} is not a model and a place`);
        return h;
      }),
    }),
    ...(raw["folders"] === undefined ? {} : (() => {
      const why = foldersWhy(raw["folders"]);
      if (why) throw new Error(why);
      return { folders: (raw["folders"] as { name: string }[]).map((f) => ({ name: f.name })) };
    })()),
    ...(raw["order"] === undefined ? {} : (() => {
      const why = orderWhy(raw["order"]);
      if (why) throw new Error(why);
      return { order: [...(raw["order"] as string[])] };
    })()),
    ...(raw["tree"] === undefined ? {} : (() => {
      const why = treeWhy(raw["tree"]);
      if (why) throw new Error(why);
      return { tree: (raw["tree"] as [string, string][]).map(([c, p]) => [c, p] as [string, string]) };
    })()),
    ...(raw["hiddenData"] === undefined ? {} : {
      hiddenData: (Array.isArray(raw["hiddenData"]) ? raw["hiddenData"] : [null]).map((h, i) => {
        if (typeof h !== "string" || !HIDDEN_DATA_KEY.test(h)) throw new Error(`hiddenData ${i} is not a map objective's key`);
        return h;
      }),
    }),
    ...(raw["settings"] === undefined ? {} : { settings: parseSettings(raw["settings"]) }),
    ...(raw["objectives"] === undefined ? {} : { objectives: parseObjectives(raw["objectives"]) }),
    ...(raw["ids"] === undefined ? {} : objectiveIdsOf(raw["ids"])),
    ...(name ? { name } : {}),
    ...(camera ? { camera } : {}),
    ...(raw["requires"] === undefined ? {} : { requires: parseRequires(raw["requires"]) }),
    ...(raw["mode"] === undefined ? {} : { mode: parseMode(raw["mode"]) }),
    ...entitiesOfFile(raw),
  };
  return layout;
}

/** FCW-30: a layout file's zones, markers and spawners, checked (`entityError`) and copied; an empty list is none. */
function entitiesOfFile(raw: Record<string, unknown>): Pick<Layout, "zones" | "markers" | "spawners"> {
  const why = entityListsError(raw, false);
  if (why) throw new Error(why);
  const out: Pick<Layout, "zones" | "markers" | "spawners"> = {};
  const zones = raw["zones"] as LayoutZone[] | undefined, markers = raw["markers"] as LayoutMarker[] | undefined, spawners = raw["spawners"] as LayoutSpawner[] | undefined;
  if (zones?.length) out.zones = zones.map((e) => copyEntity(e, null));
  if (markers?.length) out.markers = markers.map((e) => copyEntity(e, null));
  if (spawners?.length) out.spawners = spawners.map((e) => copyEntity(e, null));
  return out;
}

/** The keys this build reads at each objectives level; any other is kept as it was (`keptKeys`). */
export const KNOWN_OBJECTIVE_KEYS: readonly string[] = Object.freeze(["gameType", "bomb"]);
export const KNOWN_BOMB_KEYS: readonly string[] = Object.freeze(["start", "startLocked", "sites"]);
export const KNOWN_SITE_KEYS: readonly string[] = Object.freeze(["team", "at", "yaw", "range", "elevation", "locked"]);

/** Keys this slice does not read, kept so a later file still round-trips. */
function keptKeys(raw: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) if (!known.includes(key)) out[key] = raw[key];
  return out;
}

function pointOf(v: unknown, what: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) throw new Error(`${what} is not a point`);
  const [x, y, z] = v as number[];
  return [x!, y!, z!];
}

function parseObjectives(raw: unknown): ForgeObjectives {
  if (!isObj(raw)) throw new Error("objectives is not an object");
  const type = raw["gameType"];
  if (type !== undefined && type !== 1 && type !== 2 && type !== 3 && type !== 4 && type !== 5) throw new Error("objectives.gameType is not 1..5");
  const objectives = Object.assign(type === undefined ? {} : { gameType: type }, keptKeys(raw, KNOWN_OBJECTIVE_KEYS)) as ForgeObjectives;
  if (raw["bomb"] !== undefined) objectives.bomb = parseBomb(raw["bomb"]);
  return objectives;
}

function parseBomb(raw: unknown): BombObjectives {
  if (!isObj(raw)) throw new Error("objectives.bomb is not an object");
  if (!Array.isArray(raw["sites"])) throw new Error("objectives.bomb.sites is not a list");
  if (raw["sites"].length > BOMB_SITES_MAX) throw new Error(`objectives.bomb.sites names more than ${BOMB_SITES_MAX} sites`);
  const sites = raw["sites"].map((s, i): BombSite => {
    if (!isObj(s) || (s["team"] !== 0 && s["team"] !== 1)) throw new Error(`bomb site ${i} is not a planting team and a point`);
    const yaw = s["yaw"] === undefined ? 0 : s["yaw"];
    const range = s["range"] === undefined ? BOMB_SITE_REACH : s["range"];
    const elevation = s["elevation"] === undefined ? BOMB_SITE_REACH : s["elevation"];
    if (!isNum(yaw)) throw new Error(`bomb site ${i} yaw is not a number`);
    if (!isNum(range) || range <= 0) throw new Error(`bomb site ${i} range is not a reach above 0`);
    if (!isNum(elevation)) throw new Error(`bomb site ${i} elevation is not a number`);
    if (s["locked"] !== undefined && s["locked"] !== true) throw new Error(`bomb site ${i} lock is not true`);
    const team = s["team"];
    return Object.assign(
      { team, at: pointOf(s["at"], `bomb site ${i}`), yaw, range, elevation }, s["locked"] === true ? { locked: true } : {},
      keptKeys(s, KNOWN_SITE_KEYS),
    ) as BombSite;
  });
  const bomb = Object.assign({ sites }, keptKeys(raw, KNOWN_BOMB_KEYS)) as BombObjectives;
  if (raw["start"] !== undefined) bomb.start = pointOf(raw["start"], "objectives.bomb.start");
  if (raw["startLocked"] !== undefined && raw["startLocked"] !== true) throw new Error("objectives.bomb.startLocked is not true");
  if (raw["startLocked"] === true) bomb.startLocked = true;
  return bomb;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stable authored ids (FCW-07a)
// ---------------------------------------------------------------------------------------------------------------------

/** An authored id: 1-64 of A-Z a-z 0-9 _ . - , unique across the whole record. Never a revision ref. */
export const AUTHORED_ID = /^[A-Za-z0-9_.-]{1,64}$/;
/**
 * The default ids: a row's kind and its position, `p0`, `s1`, `n0`, `b0` (the bomb's start), `bs1` (a bomb site). A
 * migration gives each v1/v2 row its default, so the same input always yields the same v3 text; once written, an id
 * stays with its row through reorder, delete and undo, and a new row takes the first free default from its position.
 */
export const ID_PREFIX = Object.freeze({ piece: "p", spawn: "s", npc: "n", bomb: "b", site: "bs" } as const);

/** The record's ids, each list in its rows' order. `npcs`, `bomb` and `sites` only when the record has those rows. */
export interface RecordIds {
  pieces: string[];
  spawns: string[];
  npcs?: string[];
  bomb?: string;
  sites?: string[];
}

function explicitIds(l: Layout): string[] {
  const out: string[] = [];
  for (const p of l.pieces) if (p.id !== undefined) out.push(p.id);
  for (const s of l.spawns) if (s.id !== undefined) out.push(s.id);
  for (const n of l.npcs ?? []) if (n.id !== undefined) out.push(n.id);
  const bomb = l.objectives?.bomb;
  if (bomb?.start && l.ids?.bomb !== undefined) out.push(l.ids.bomb);
  (bomb?.sites ?? []).forEach((_, i) => { const id = l.ids?.sites?.[i]; if (id !== undefined) out.push(id); });
  out.push(...entityIdList(l));   // FCW-30: the rules entities share the record's one id space
  return out;
}

function duplicateId(ids: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/**
 * Every row's id: its own when it has one, else the first default free from its position (`ID_PREFIX`). A layout whose
 * rows name no id gets exactly the migration's defaults. An id a later row repeats (an editor's copy of a row) is the
 * first row's; the copy takes a fresh one. A file that repeats one is refused by the reader (`readCreatorRecord`), a
 * record by its check. Pure: the layout is not changed.
 */
export function layoutIds(l: Layout): RecordIds {
  // FCW-30: the rules entities' ids are taken first (they are always explicit), so no row's default lands on one
  const firsts = new Set<string>(entityIdList(l));
  const own = (id: string | undefined): string | undefined => {
    if (id === undefined || firsts.has(id)) return undefined;
    firsts.add(id);
    return id;
  };
  const bomb = l.objectives?.bomb;
  const owned = {
    pieces: l.pieces.map((p) => own(p.id)),
    spawns: l.spawns.map((s) => own(s.id)),
    npcs: (l.npcs ?? []).map((n) => own(n.id)),
    bomb: bomb?.start ? own(l.ids?.bomb) : undefined,
    sites: (bomb?.sites ?? []).map((_, i) => own(l.ids?.sites?.[i])),
  };
  const used = new Set(firsts);
  const take = (prefix: string, i: number, mine: string | undefined): string => {
    if (mine !== undefined) return mine;
    let k = i;
    while (used.has(`${prefix}${k}`)) k++;
    const id = `${prefix}${k}`;
    used.add(id);
    return id;
  };
  const ids: RecordIds = {
    pieces: owned.pieces.map((id, i) => take(ID_PREFIX.piece, i, id)),
    spawns: owned.spawns.map((id, i) => take(ID_PREFIX.spawn, i, id)),
  };
  if (l.npcs?.length) ids.npcs = owned.npcs.map((id, i) => take(ID_PREFIX.npc, i, id));
  if (bomb?.start) ids.bomb = take(ID_PREFIX.bomb, 0, owned.bomb);
  if (bomb?.sites.length) ids.sites = owned.sites.map((id, i) => take(ID_PREFIX.site, i, id));
  return ids;
}

/**
 * A copy of the layout with every row's id written on it (`layoutIds`). A layout row with no id has its default, which
 * follows its position; an editor that reorders, deletes or copies rows makes the ids explicit first, so each id stays
 * with its row. `layoutOfRecord` leaves a default id implied, so a layout of defaults is the v1 file it was.
 */
export function withIds(l: Layout): Layout {
  const ids = layoutIds(l);
  const copy = json(l);
  copy.pieces.forEach((p, i) => { p.id = ids.pieces[i]!; });
  copy.spawns.forEach((s, i) => { s.id = ids.spawns[i]!; });
  copy.npcs?.forEach((n, i) => { n.id = ids.npcs![i]!; });
  delete copy.ids;
  const marks: LayoutObjectiveIds = {};
  if (ids.bomb !== undefined) marks.bomb = ids.bomb;
  if (ids.sites) marks.sites = [...ids.sites];
  if (marks.bomb !== undefined || marks.sites) copy.ids = marks;
  return copy;
}

/** The layout keeps only an id that is not its row's default, so a layout with defaults alone is the v1 file it was. */
const ownId = (id: string | undefined, prefix: string, i: number): { id?: string } => (id !== undefined && id !== `${prefix}${i}` ? { id } : {});

// ---------------------------------------------------------------------------------------------------------------------
// The record: v2 (read, migrated) and v3 (written)
// ---------------------------------------------------------------------------------------------------------------------

/** The record v3's schema name and version (the plan's "Shared interfaces": `schema: 'forge-layout', version: 3`). */
export const RECORD_SCHEMA = "forge-layout" as const;
export const RECORD_VERSION = 3 as const;
/** The record before v3 (`{v: 2, ...}`), read and migrated, never written. */
export const RECORD_V2 = 2 as const;

/**
 * The record's bounds -- a server policy as much as the page's (OT.R26: harden, decisions at their defaults): a name a
 * list can show, a few thousand pieces, coordinates inside any map (the largest disc map spans about 20,000 units).
 */
export const RECORD_LIMITS = { name: 48, assets: 256, pieces: 2000, spawns: 48, coord: 100_000, requires: 64 } as const;

/**
 * FP-1a, Codex P1 on #745 (a browser/server adaptation, FG.R2; OT.R26): the layout's placed kinds, each a list of copies
 * or markers the page's Play and a lobby's room compose. The record bounds each to 1..`RECORD_LIMITS.spawns`
 * (`checkCreatorRecord`: hostages, doors, gates, barriers, turrets, flares, respawns, tacPoints, scenicViews,
 * extractionZones); the file's JSON path bounds none, so a lobby's create checks the same number
 * (`placedKindsPast`; central `forgeLobby.ts` `layoutWithinBounds`, `match/src/forgeSimMap.ts` `composeForgeSimMap`),
 * and the page's Check says it first. The rules entities and the bomb's sites are bounded by the parse already
 * (`RECORD_ENTITIES_MAX`, `BOMB_SITES_MAX`); the NPC markers by central (`FORGE_NPCS_MAX`).
 */
export const PLACED_KINDS = [
  "hostages", "extractionZones", "tacPoints", "respawns", "flares", "scenicViews", "turrets", "doors", "gates", "barriers",
] as const satisfies readonly (keyof Layout)[];
/** Each placed kind's most copies or markers: the record's marker bound (`RECORD_LIMITS.spawns`, 48), so the two paths agree. */
export const FORGE_PLACED_MAX_ADAPTATION = RECORD_LIMITS.spawns;

/** The placed kinds `l` holds past `FORGE_PLACED_MAX_ADAPTATION`, each with its count, in `PLACED_KINDS` order. Empty: within. */
export function placedKindsPast(l: Pick<Layout, (typeof PLACED_KINDS)[number]>): { kind: (typeof PLACED_KINDS)[number]; count: number }[] {
  const out: { kind: (typeof PLACED_KINDS)[number]; count: number }[] = [];
  for (const kind of PLACED_KINDS) {
    const count = l[kind]?.length ?? 0;
    if (count > FORGE_PLACED_MAX_ADAPTATION) out.push({ kind, count });
  }
  return out;
}

/**
 * The v2/v3 record's position lattice: a coordinate is stored as a multiple of one tenth of a game unit
 * (`round(x * 10) / 10`), so a disc height on a half unit (42.5) stays. The catalogue binds the same lattice.
 */
export const RECORD_POSITION_DENOMINATOR = 10;

/**
 * FX-1 (the FX plan's FX.R3: "finish scale and rotate"; a browser adaptation, FG.R2 -- the game has no editor): a
 * placed piece's scale per axis in a pose row (`PoseRow`) is a multiple of one hundredth (`round(s * 100) / 100`),
 * positive and within `RECORD_SCALE_MIN_ADAPTATION`..`RECORD_SCALE_MAX_ADAPTATION`. The bounds are the owner's default
 * (H442 b): 0.1 to 4 an axis, the 4 central's own cap on a lobby's piece (`forgeLobby.ts` `FORGE_PIECE_SCALE_MAX`). A
 * mirror (a negative scale) and a zero scale are out of them.
 */
export const RECORD_SCALE_DENOMINATOR = 100;
export const RECORD_SCALE_MIN_ADAPTATION = 0.1;
export const RECORD_SCALE_MAX_ADAPTATION = 4;

export type PieceRow = [asset: number, x: number, y: number, z: number, yaw: number, locked?: true];
/**
 * FX-1: a tilted or scaled piece's pose, beside its row's own yaw (`PieceRow[4]`): the turn is
 * `R_y(yaw) * R_x(pitch) * R_z(roll)` -- three's `YXZ` Euler order, the one the Forge's Inspector reads (`viewer` `page.ts`
 * `fillStubFields`) -- then the scale per axis, so a piece's matrix is `T * R * S`. Pitch is a whole degree in -90..90,
 * roll a whole degree in 0..359 (as a yaw is); at a pitch of 90 or -90 the roll is 0 and its turn is in the yaw (the one
 * canonical form). The scale is on `RECORD_SCALE_DENOMINATOR`'s lattice.
 */
export type PoseRow = [piece: number, pitch: number, roll: number, sx: number, sy: number, sz: number];
export type SpawnRow = [team: "A" | "B", x: number, y: number, z: number, yaw: number, locked?: true];
export type NpcRow = [side: "seal" | "terrorist", type: number, x: number, y: number, z: number, yaw: number, locked?: true];
/** A placed hostage's record row (`Layout.hostages`, a browser adaptation): its place on the lattice, whole degrees. */
export type HostageRow = [x: number, y: number, z: number, yaw: number, more?: { name?: string; character?: string; source?: string; locked?: true }];
/** A placed hostage's name (`HostageMarker.name`): 1-32 letters, digits, spaces, `_` or `-` (the disc's Hostage1). */
const HOSTAGE_NAME = /^[A-Za-z0-9_ -]{1,32}$/;
/** A placed hostage's character (`HostageMarker.character`): a `chartype.rdr` key, 1-32 letters, digits or `_`. */
const HOSTAGE_CHARACTER = /^[A-Za-z0-9_]{1,32}$/;
/** A placed extraction zone's record row (`Layout.extractionZones`, a browser adaptation): its name, centre and size. */
/** A placed tactical point's record row (`Layout.tacPoints`). */
/** A placed turret's record row (`Layout.turrets`): its source and name, place, and yaw in whole degrees. */
export type TurretRow = [source: string, name: string, x: number, y: number, z: number, yaw: number, locked?: true];
export type TacPointRow = [name: string, x: number, y: number, z: number, kind: number, locked?: true];
/**
 * A placed switch's record row (`Layout.switches`): its gate's index in `gates` (-1 none), its place, its yaw in degrees,
 * its map action's valve ('' none), its look ('' the lever panel), and its prompt, reach, height reach and points (null:
 * its action's own).
 */
export type SwitchRow = [gate: number, x: number, y: number, z: number, yaw: number, action: string, look: "" | SwitchLook,
  prompt: string | null, range: number | null, elevation: number | null, points: number | null, script: SwitchScript | null, locked?: true | null,
  team?: null, piece?: number, node?: string];
/**
 * A damage trigger's record row (`Layout.triggers`): its prop's index in `pieces` (-1 none), health, armour, shield,
 * script, the map node's path ('' none), and its place (null, at its prop).
 */
export type TriggerRow = [piece: number, health: number, armor: number, shield: number, script: SwitchScript | null, node: string, x: number | null, y: number | null, z: number | null];
/** A Forge object's record row (`Layout.objects`): its kind, its map ('' an empty's), its name, its place and turn (degrees). */
export type ObjectRow = [kind: ForgeObjectKind, source: string, name: string, x: number, y: number, z: number, yaw: number, locked?: boolean, audio?: AudioStep[]];
/** A placed flare's record row (`Layout.flares`): its source and node name, its place. */
export type FlareRow = [source: string, name: string, x: number, y: number, z: number, locked?: true];
/** A placed spectator view's record row (`Layout.scenicViews`): yaw and pitch in degrees, on the lattice. */
export type ScenicViewRow = [name: string, x: number, y: number, z: number, yaw: number, pitch: number, locked?: true];
export type ExtractionZoneRow = [name: string, x: number, y: number, z: number, width: number, depth: number, locked?: true];
/** A placed extraction zone's name: 1-32 letters, digits, spaces, `_` or `-` (the disc's Safety, Safety2). */
const ZONE_NAME = /^[A-Za-z0-9_ -]{1,32}$/;

/** The v2 record (FG.R10): what this browser kept and a share code carried until FCW-07a. */
export interface LayoutRecordV2 {
  v: typeof RECORD_V2;
  name: string;
  base: string;
  assets: string[];
  pieces: PieceRow[];
  spawns: SpawnRow[];
  hidden?: string[];
  /** The base map's own objectives the layout takes out (`Layout.hiddenData`), present only when it has some. */
  hiddenData?: string[];
  npcs?: NpcRow[];
  settings?: Partial<LayoutSettings>;
  camera?: LayoutCamera;
  missing?: number[];
  objectives?: ForgeObjectives;
}

/** A v3 record's asset: a disc prototype (`MP2:crate`) or a pack's content. */
export type RecordAsset = string | ContentRef;

/** A bomb site in a v3 record: the known fields only (its id is `ids.sites`). */
export interface RecordBombSite {
  team: 0 | 1;
  at: [number, number, number];
  yaw: number;
  range: number;
  elevation: number;
  locked?: true;
}
export interface RecordObjectives {
  gameType?: ForgeGameType;
  bomb?: { start?: [number, number, number]; startLocked?: true; sites: RecordBombSite[] };
}

/**
 * Members of a v1 file's or a v2 record's objectives this build does not read, kept inert (`legacyCarry`): at the
 * objectives level, the bomb level, and each site's, by the site's id. Never interpreted; written back at their own
 * paths when the layout is opened (`layoutOfRecord`), so a legacy export keeps each value as it was.
 */
export interface LegacyCarry {
  version: 1;
  objectives?: Record<string, unknown>;
  bomb?: Record<string, unknown>;
  sites?: Record<string, Record<string, unknown>>;
}

/** The record v3 (FCW-07a). */
export interface CreatorLayoutRecord {
  schema: typeof RECORD_SCHEMA;
  version: typeof RECORD_VERSION;
  name: string;
  /** An archive stem, `blank:<stem>`, `blank:floor`, or (FCW-10) `content:<stem>`: an authored map, `contentBase` its map. */
  base: string;
  /**
   * FCW-10: the authored map a `content:<stem>` base stands on (`ContentLayoutBase` less its `library`, which is the
   * base's stem). Present exactly when the base is `content:<stem>`; its pack is among `requires`.
   */
  contentBase?: RecordContentBase;
  /** Each prototype once, in first-use order: a disc id, or a pack's `ContentRef`. */
  assets: RecordAsset[];
  pieces: PieceRow[];
  /**
   * FX-1: the poses of the pieces that are tilted or scaled (`PoseRow`), each piece at most once, in piece order; present
   * only when the layout has one, so a layout of yaw-only pieces at scale 1 is the text it was. Additive inside v3, as
   * FCW-30's lists: an earlier build's strict v3 check refuses a record carrying it by name (`unknown field poses`), never
   * reads it as yaw-only pieces.
   */
  poses?: PoseRow[];
  spawns: SpawnRow[];
  /** The rows' stable authored ids. */
  ids: RecordIds;
  hidden?: string[];
  /** The base map's own objectives the layout takes out (`Layout.hiddenData`), present only when it has some. */
  hiddenData?: string[];
  /** The placements' tree (`Layout.tree`), present only when some placement has a parent. */
  tree?: [string, string][];
  /** The Outliner's folders (`Layout.folders`) and its order (`Layout.order`), present only when the layout has some. */
  folders?: { name: string }[];
  order?: string[];
  npcs?: NpcRow[];
  /** The placed hostages (`Layout.hostages`), present only when the layout has some: additive inside v3, as `zones`. */
  hostages?: HostageRow[];
  /** The placed extraction zones (`Layout.extractionZones`), present only when the layout has some. */
  extractionZones?: ExtractionZoneRow[];
  /** The placed tactical points and spectator views, each present only when the layout has some. */
  tacPoints?: TacPointRow[];
  /** The placed respawn points (`Layout.respawns`), as the spawns' rows, present only when the layout has some. */
  respawns?: SpawnRow[];
  /** The placed flares (`Layout.flares`), present only when the layout has some. */
  flares?: FlareRow[];
  scenicViews?: ScenicViewRow[];
  /** The placed turrets (`Layout.turrets`), present only when the layout has some. */
  turrets?: TurretRow[];
  /** The placed doors (`Layout.doors`), as the turrets' rows. */
  doors?: TurretRow[];
  /** The placed gates and C4 barriers (`Layout.gates`, `Layout.barriers`), as the doors' rows. */
  gates?: TurretRow[];
  barriers?: TurretRow[];
  /** The placed switches (`Layout.switches`), present only when the layout has some. */
  switches?: SwitchRow[];
  /** The props made damage triggers (`Layout.triggers`), present only when the layout has some. */
  triggers?: TriggerRow[];
  /** The Forge objects (`Layout.objects`), present only when the layout has some. */
  objects?: ObjectRow[];
  settings?: Partial<LayoutSettings>;
  camera?: LayoutCamera;
  missing?: number[];
  objectives?: RecordObjectives;
  /**
   * Every pack the record needs, each once, sorted: derived from the content its pieces name, plus the packs the layout
   * declares (`Layout.requires`). `layoutOfRecord` gives back only the declared ones (the review's F1).
   */
  requires?: PackRef[];
  mode?: RecordMode;
  legacyCarry?: LegacyCarry;
  /**
   * FCW-30: the rules entities, each list 1..`RECORD_ENTITIES_MAX` and present only when the layout has some, so a
   * record without them is the text it was. Additive inside v3, as FCW-10's `contentBase`: an earlier build's strict v3
   * check refuses a record carrying them by name (`unknown field zones`), never reads it otherwise.
   */
  zones?: RecordZone[];
  markers?: RecordMarker[];
  spawners?: RecordSpawner[];
}

export type AnyLayoutRecord = LayoutRecordV2 | CreatorLayoutRecord;

/** A v3 record's authored map (`CreatorLayoutRecord.contentBase`): the pack and the map id; the library is the base's stem. */
export interface RecordContentBase {
  ref: PackRef;
  mapId: string;
}

/** A v3 record's base text for an authored map: `content:<library>`. */
export const CONTENT_BASE_PREFIX = "content:";

const STEM = /^[A-Z]{1,3}\d{1,3}$/;
/** The page's blank floor when no archive is the palette (`matchMap` `BLANK_LIBRARY`). */
const BLANK_FLOOR = "floor";
const ASSET = /^[A-Z]{1,3}\d{1,3}:[A-Za-z0-9_.\-]{1,64}$/;
/** A placement's reference in the tree (`Layout.tree`): its kind and its place in its list (a bomb marker's by its kind). */
export const TREE_REF = /^(?:(?:piece|trigger|spawn|respawn|flare|npc|hostage|zone|turret|door|gate|barrier|switch|point|object|view|folder):\d{1,5}|bomb:(?:start|seal|terrorist):\d{1,2})$/;
/** A folder's name (`Layout.folders`): a check on the file's. */
const FOLDER_NAME = /^[^\u0000-\u001f]{1,48}$/;
/** Null when `v` is a good list of folders (`Layout.folders`); else why. */
export function foldersWhy(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > RECORD_LIMITS.pieces) return "folders is not a list of folders";
  for (const [i, f] of v.entries()) {
    if (!isObj(f) || !Object.keys(f).every((k) => k === "name") || typeof f["name"] !== "string" || !FOLDER_NAME.test(f["name"])) return `folder ${i} is not a name`;
  }
  return null;
}
/** Null when `v` is a good order (`Layout.order`): references, each once; else why. */
export function orderWhy(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > RECORD_LIMITS.pieces * 2) return "order is not a list of placements";
  const seen = new Set<string>();
  for (const [i, e] of v.entries()) {
    if (typeof e !== "string" || !TREE_REF.test(e)) return `order ${i} is not a placement`;
    if (seen.has(e)) return `order ${i}: ${e} twice`;
    seen.add(e);
  }
  return null;
}
/** Null when `v` is a good tree (`Layout.tree`): pairs of references, each child once, none its own ancestor; else why. */
export function treeWhy(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > RECORD_LIMITS.pieces) return "tree is not a list of [child, parent] pairs";
  const parent = new Map<string, string>();
  for (const [i, e] of v.entries()) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== "string" || typeof e[1] !== "string" || !TREE_REF.test(e[0]) || !TREE_REF.test(e[1]) || e[0] === e[1]) {
      return `tree ${i} is not a [child, parent] pair of placements`;
    }
    if (parent.has(e[0])) return `tree ${i}: ${e[0]} has two parents`;
    parent.set(e[0], e[1]);
  }
  for (const start of parent.keys()) {
    const seen = new Set<string>([start]);
    for (let at = parent.get(start); at !== undefined; at = parent.get(at)) {
      if (seen.has(at)) return `tree: ${start} is its own ancestor`;
      seen.add(at);
    }
  }
  return null;
}
/** The layout as an online lobby is sent it (`Layout.tree` left out): every placement at its own world place, the same game. */
export function withoutTree<L extends { tree?: unknown; folders?: unknown; order?: unknown }>(l: L): L {
  if (l.tree === undefined && l.folders === undefined && l.order === undefined) return l;
  const { tree: _t, folders: _f, order: _o, ...rest } = l;
  return rest as L;
}

/** A taken-out map objective's key (`Layout.hiddenData`): its kind and its name (a node, a hostage, a zone). */
const HIDDEN_DATA_KEY = /^(hostage|site|zone):[A-Za-z0-9_ .=\/-]{1,96}$|^bomb:start$|^(slot|respawn):[AB]\d{1,3}$/;

const V2_FIELDS = ["v", "name", "base", "assets", "pieces", "spawns", "hidden", "npcs", "settings", "camera", "missing", "objectives"];
const V3_FIELDS = ["schema", "version", "name", "base", "contentBase", "assets", "pieces", "spawns", "ids", "hidden", "npcs", "settings", "camera", "missing",
  "objectives", "requires", "mode", "legacyCarry", "hiddenData", "tree", "folders", "order", "zones", "markers", "spawners", "hostages", "extractionZones", "tacPoints", "respawns", "flares", "scenicViews", "turrets", "doors", "gates", "barriers", "switches", "triggers", "objects",
  "poses"];
const CAMERA_FIELDS = ["x", "y", "z", "yaw", "pitch"];
const ID_FIELDS = ["pieces", "spawns", "npcs", "bomb", "sites"];
const SITE_FIELDS = ["team", "at", "yaw", "range", "elevation", "locked"];
const BOMB_FIELDS = ["start", "startLocked", "sites"];
const MODE_ID = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

const wholeDeg = (rad: number): number => (((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360);
/** One decimal place. A disc height on a half unit (42.5) stays; +0 drops -0. */
const tenth = (n: number): number => Math.round(n * RECORD_POSITION_DENOMINATOR) / RECORD_POSITION_DENOMINATOR + 0;
/** Cosine and sine of a whole degree can be -0; a matrix stores 0. */
const n0 = (n: number): number => (n === 0 ? 0 : n);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const cloneContent = (c: ContentRef): ContentRef => ({ kind: "pack", pack: { id: c.pack.id, version: c.pack.version, hash: c.pack.hash }, assetId: c.assetId });

const baseText = (b: LayoutBase): string => (b.kind === "map" ? b.archive : b.kind === "blank" ? `blank:${b.library}` : `${CONTENT_BASE_PREFIX}${b.library}`);
const baseOf = (t: string, content?: RecordContentBase): LayoutBase => {
  if (content && t.startsWith(CONTENT_BASE_PREFIX)) {
    return { kind: "content", ref: { id: content.ref.id, version: content.ref.version, hash: content.ref.hash }, mapId: content.mapId, library: t.slice(CONTENT_BASE_PREFIX.length) };
  }
  return t.startsWith("blank:") ? { kind: "blank", library: t.slice(6) } : { kind: "map", archive: t };
};

/** The yaw of a column-major 4x4 about y (its first column's turn in the xz plane). */
const yawOf = (m: readonly number[]): number => Math.atan2(-(m[2] ?? 0), m[0] ?? 1);

/** FX-1: a scale on the record's lattice (`RECORD_SCALE_DENOMINATOR`), held within its bounds. */
const scaleOnLattice = (n: number): number => Math.min(RECORD_SCALE_MAX_ADAPTATION,
  Math.max(RECORD_SCALE_MIN_ADAPTATION, Math.round(n * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR + 0));
/** FX-1: a turn whose `|sin pitch|` reaches this is read at the gimbal (three's `Euler.setFromRotationMatrix`, `YXZ`). */
const GIMBAL = 0.9999999;

/**
 * FX-1: a piece's turn and scale on the record's lattice: the row's yaw in whole degrees and, when the piece is tilted or
 * scaled, its pose (pitch, roll, sx, sy, sz); `pose` null otherwise. The scale per axis is the length of its column; the
 * turn is read in three's `YXZ` order from the columns divided by those lengths (`Euler.setFromRotationMatrix`). A
 * piece whose pitch and roll are 0 on the lattice keeps the yaw the record has always written (`yawOf`), which for such
 * a piece is the `YXZ` yaw, so a yaw-only layout's text does not move. The canonical form: a pitch on the lattice of 90
 * (-90) writes roll 0 and the yaw less (plus) the roll, the same turn. A matrix that is not `T * R * S` (a mirror, a
 * shear) is written as the nearest pose this reads, as a yaw-only row was before.
 */
function poseOf(m: readonly number[]): { yaw: number; pose: [number, number, number, number, number] | null } {
  const at = (i: number): number => m[i] ?? 0;
  const lengths = [0, 4, 8].map((c) => Math.hypot(at(c), at(c + 1), at(c + 2)));
  const [sx, sy, sz] = lengths.map(scaleOnLattice) as [number, number, number];
  let yaw = yawOf(m), pitch = 0, roll = 0;
  if (lengths.every((n) => n > 0 && Number.isFinite(n))) {
    const unit = (i: number, column: number): number => at(i) / lengths[column]!;
    const m23 = unit(9, 2);
    const x = Math.asin(-Math.min(1, Math.max(-1, m23)));
    const gimbal = Math.abs(m23) >= GIMBAL;
    const y = gimbal ? Math.atan2(-unit(2, 0), unit(0, 0)) : Math.atan2(unit(8, 2), unit(10, 2));
    const z = gimbal ? 0 : Math.atan2(unit(1, 0), unit(5, 1));
    pitch = Math.round((x * 180) / Math.PI) + 0;
    roll = Math.abs(pitch) === 90 ? 0 : wholeDeg(z);
    if (pitch !== 0 || roll !== 0) yaw = Math.abs(pitch) === 90 ? y - Math.sign(pitch) * z : y;
  }
  const posed = pitch !== 0 || roll !== 0 || sx !== 1 || sy !== 1 || sz !== 1;
  return { yaw: wholeDeg(yaw), pose: posed ? [pitch, roll, sx, sy, sz] : null };
}

/**
 * FX-1: a posed piece's column-major 4x4: `T * R_y(yaw) * R_x(pitch) * R_z(roll) * S`, the elements three's
 * `Matrix4.makeRotationFromEuler` gives for the `YXZ` order, each column times its scale.
 */
function poseMatrix(x: number, y: number, z: number, yawDeg: number, [, pitchDeg, rollDeg, sx, sy, sz]: PoseRow): number[] {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const a = Math.cos(rad(pitchDeg)), b = Math.sin(rad(pitchDeg));
  const c = Math.cos(rad(yawDeg)), d = Math.sin(rad(yawDeg));
  const e = Math.cos(rad(rollDeg)), f = Math.sin(rad(rollDeg));
  const ce = c * e, cf = c * f, de = d * e, df = d * f;
  return [
    n0((ce + df * b) * sx), n0(a * f * sx), n0((cf * b - de) * sx), 0,
    n0((de * b - cf) * sy), n0(a * e * sy), n0((df + ce * b) * sy), 0,
    n0(a * d * sz), n0(-b * sz), n0(a * c * sz), 0,
    x, y, z, 1,
  ];
}

type Carry = { missing?: number[] };

function parseMode(v: unknown): RecordMode {
  const why = modeShapeError(v);
  if (why) throw new Error(why);
  return json(v as RecordMode);
}

function modeShapeError(v: unknown): string | null {
  if (!isObj(v)) return "mode is not {id, version, params}";
  for (const k of Object.keys(v)) if (!["id", "version", "params"].includes(k)) return `mode names no field ${k}`;
  if (typeof v["id"] !== "string" || v["id"].length > 64 || !MODE_ID.test(v["id"]) || v["id"].includes("..")) return "mode.id is not a mode id";
  if (typeof v["version"] !== "string" || !parseSemver(v["version"])) return "mode.version is not a SemVer version";
  if (!isObj(v["params"])) return "mode.params is not an object";
  try { canonicalJson(v["params"]); } catch { return "mode.params is not plain JSON data"; }
  return null;
}

/** A v2 record's points at one decimal place, as a piece's: a copy of `o`, its kept keys too. */
function objectivesV2(o: ForgeObjectives): ForgeObjectives {
  const copy = json(o);
  const point = (p: [number, number, number]): [number, number, number] => [tenth(p[0]), tenth(p[1]), tenth(p[2])];
  if (copy.bomb?.start) copy.bomb.start = point(copy.bomb.start);
  for (const site of copy.bomb?.sites ?? []) site.at = point(site.at);
  return copy;
}

/** The layout's objectives split: the known fields (points at one decimal) and what this build does not read. */
function objectivesV3(o: ForgeObjectives, siteIds: readonly string[]): { objectives: RecordObjectives; carry: Omit<LegacyCarry, "version"> } {
  const point = (p: readonly number[]): [number, number, number] => [tenth(p[0]!), tenth(p[1]!), tenth(p[2]!)];
  const objectives: RecordObjectives = {};
  const carry: Omit<LegacyCarry, "version"> = {};
  if (o.gameType !== undefined) objectives.gameType = o.gameType;
  const top = keptKeys(o as unknown as Record<string, unknown>, KNOWN_OBJECTIVE_KEYS);
  if (Object.keys(top).length) carry.objectives = json(top);
  const b = o.bomb;
  if (b) {
    const sites = b.sites.map((s, i): RecordBombSite => {
      const kept = keptKeys(s as unknown as Record<string, unknown>, KNOWN_SITE_KEYS);
      if (Object.keys(kept).length) (carry.sites ??= {})[siteIds[i]!] = json(kept);
      return { team: s.team, at: point(s.at), yaw: s.yaw, range: s.range, elevation: s.elevation, ...(s.locked === true ? { locked: true as const } : {}) };
    });
    objectives.bomb = { ...(b.start ? { start: point(b.start) } : {}), ...(b.startLocked === true ? { startLocked: true as const } : {}), sites };
    const kept = keptKeys(b as unknown as Record<string, unknown>, KNOWN_BOMB_KEYS);
    if (Object.keys(kept).length) carry.bomb = json(kept);
  }
  return { objectives, carry };
}

/** The layout as a record v3: its rows, its ids (`layoutIds`), its pack references, its inert legacy members. */
export function recordOfLayout(l: Layout, name: string): CreatorLayoutRecord {
  const ids = layoutIds(l);
  const assets: RecordAsset[] = [];
  const index = new Map<string, number>();
  const packs: PackRef[] = [];
  const poses: PoseRow[] = [];
  const pieces: PieceRow[] = l.pieces.map((p, at) => {
    const key = p.content ? `pack ${canonicalJson(p.content)}` : p.asset;
    let i = index.get(key);
    if (i === undefined) {
      i = assets.length;
      assets.push(p.content ? cloneContent(p.content) : p.asset);
      if (p.content) packs.push(p.content.pack);
      index.set(key, i);
    }
    // FX-1: a tilted or scaled piece's pose beside its row; a yaw-only piece at scale 1 writes its row alone, as before
    const { yaw, pose } = poseOf(p.m);
    if (pose) poses.push([at, ...pose]);
    const row: PieceRow = [i, tenth(p.m[12]!), tenth(p.m[13]!), tenth(p.m[14]!), yaw];
    if (p.locked === true) row[5] = true;
    return row;
  });
  const spawns: SpawnRow[] = l.spawns.map((s) => {
    const row: SpawnRow = [s.team, tenth(s.p[0]), tenth(s.p[1]), tenth(s.p[2]), wholeDeg(s.yaw)];
    if (s.locked === true) row[5] = true;
    return row;
  });
  const record: CreatorLayoutRecord = {
    schema: RECORD_SCHEMA, version: RECORD_VERSION, name: l.name?.trim() || name, base: baseText(l.base),
    // FCW-10: an authored map's reference beside its `content:<stem>` base; a retail base writes nothing more
    ...(isContentLayoutBase(l.base) ? { contentBase: { ref: { id: l.base.ref.id, version: l.base.ref.version, hash: l.base.ref.hash }, mapId: l.base.mapId } } : {}),
    assets, pieces, ...(poses.length ? { poses } : {}), spawns, ids,
  };
  if (l.hidden?.length) record.hidden = [...l.hidden];
  if (l.hiddenData?.length) record.hiddenData = [...l.hiddenData];
  if (l.tree?.length) record.tree = l.tree.map(([c, p]) => [c, p] as [string, string]);
  if (l.folders?.length) record.folders = l.folders.map((f) => ({ name: f.name }));
  if (l.order?.length) record.order = [...l.order];
  if (l.npcs?.length) record.npcs = l.npcs.map((n): NpcRow => {
    const row: NpcRow = [n.side, n.type, tenth(n.p[0]), tenth(n.p[1]), tenth(n.p[2]), wholeDeg(n.yaw)];
    if (n.locked === true) row[6] = true;
    return row;
  });
  if (l.hostages?.length) record.hostages = l.hostages.map((h): HostageRow => {
    const row: HostageRow = [tenth(h.p[0]), tenth(h.p[1]), tenth(h.p[2]), wholeDeg(h.yaw)];
    const more = { ...(h.name ? { name: h.name } : {}), ...(h.character ? { character: h.character } : {}), ...(h.source ? { source: h.source } : {}), ...(h.locked === true ? { locked: true as const } : {}) };
    if (Object.keys(more).length) row[4] = more;
    return row;
  });
  if (l.doors?.length) record.doors = l.doors.map((t): TurretRow => {
    const row: TurretRow = [t.source, t.name, tenth(t.at[0]), tenth(t.at[1]), tenth(t.at[2]), wholeDeg(t.yaw)];
    if (t.locked === true) row[6] = true;
    return row;
  });
  for (const key of ["gates", "barriers"] as const) {
    const list = l[key];
    if (list?.length) record[key] = list.map((t): TurretRow => {
      const row: TurretRow = [t.source, t.name, tenth(t.at[0]), tenth(t.at[1]), tenth(t.at[2]), wholeDeg(t.yaw)];
      if (t.locked === true) row[6] = true;
      return row;
    });
  }
  if (l.switches?.length) record.switches = l.switches.map((t): SwitchRow => {
    const row: SwitchRow = [t.gate ?? -1, tenth(t.at[0]), tenth(t.at[1]), tenth(t.at[2]), wholeDeg(t.yaw), t.action ?? "", t.look ?? "",
      t.prompt ?? null, t.range ?? null, t.elevation ?? null, t.points ?? null, t.script ? JSON.parse(JSON.stringify(t.script)) as SwitchScript : null];
    if (t.locked === true) row[12] = true;
    // Its prop link (`SwitchMarker.piece` / `node`): the two columns after the team's (null: a switch has no team), -1 and '' for none.
    if (t.piece !== undefined || t.node !== undefined) {
      row[12] = t.locked === true ? true : null; row[13] = null; row[14] = t.piece ?? -1; row[15] = t.node ?? "";
    }
    return row;
  });
  if (l.triggers?.length) record.triggers = l.triggers.map((t): TriggerRow => {
    return [t.piece ?? -1, t.health, t.armor, t.shield, t.script ? JSON.parse(JSON.stringify(t.script)) as SwitchScript : null, t.node ?? "",
      t.at ? tenth(t.at[0]) : null, t.at ? tenth(t.at[1]) : null, t.at ? tenth(t.at[2]) : null];
  });
  if (l.objects?.length) record.objects = l.objects.map((o): ObjectRow => {
    const row: ObjectRow = [o.kind, o.source, o.name, tenth(o.at[0]), tenth(o.at[1]), tenth(o.at[2]), wholeDeg(o.yaw)];
    if (o.locked === true) row[7] = true;
    if (o.audio) { row[7] = o.locked === true; row[8] = JSON.parse(JSON.stringify(o.audio)) as AudioStep[]; }
    return row;
  });
  if (l.turrets?.length) record.turrets = l.turrets.map((t): TurretRow => {
    const row: TurretRow = [t.source, t.name, tenth(t.at[0]), tenth(t.at[1]), tenth(t.at[2]), wholeDeg(t.yaw)];
    if (t.locked === true) row[6] = true;
    return row;
  });
  if (l.flares?.length) record.flares = l.flares.map((f): FlareRow => {
    const row: FlareRow = [f.source, f.name, tenth(f.at[0]), tenth(f.at[1]), tenth(f.at[2])];
    if (f.locked === true) row[5] = true;
    return row;
  });
  if (l.respawns?.length) record.respawns = l.respawns.map((s): SpawnRow => {
    const row: SpawnRow = [s.team, tenth(s.p[0]), tenth(s.p[1]), tenth(s.p[2]), wholeDeg(s.yaw)];
    if (s.locked === true) row[5] = true;
    return row;
  });
  if (l.tacPoints?.length) record.tacPoints = l.tacPoints.map((t): TacPointRow => {
    const row: TacPointRow = [t.name, tenth(t.at[0]), tenth(t.at[1]), tenth(t.at[2]), t.kind];
    if (t.locked === true) row[5] = true;
    return row;
  });
  if (l.scenicViews?.length) record.scenicViews = l.scenicViews.map((v): ScenicViewRow => {
    const row: ScenicViewRow = [v.name, tenth(v.at[0]), tenth(v.at[1]), tenth(v.at[2]), tenth(v.yaw), tenth(v.pitch)];
    if (v.locked === true) row[6] = true;
    return row;
  });
  if (l.extractionZones?.length) record.extractionZones = l.extractionZones.map((z): ExtractionZoneRow => {
    const row: ExtractionZoneRow = [z.name, tenth(z.at[0]), tenth(z.at[1]), tenth(z.at[2]), tenth(z.size[0]), tenth(z.size[1])];
    if (z.locked === true) row[6] = true;
    return row;
  });
  if (l.settings && Object.keys(l.settings).length) record.settings = { ...l.settings };
  if (l.camera) record.camera = parseCamera(l.camera);
  const src = l as Layout & Carry;
  if (Array.isArray(src.missing) && src.missing.length > 0
    && src.missing.every((i) => Number.isInteger(i) && i >= 0 && i < pieces.length)) record.missing = [...src.missing];
  let carry: Omit<LegacyCarry, "version"> = {};
  if (l.objectives) {
    const split = objectivesV3(l.objectives, ids.sites ?? []);
    record.objectives = split.objectives;
    carry = split.carry;
  }
  const requires = sortPackRefs([...(l.requires ?? []), ...packs, ...(isContentLayoutBase(l.base) ? [l.base.ref] : [])]);
  if (requires.length) record.requires = requires;
  if (l.mode) record.mode = json(l.mode);
  if (carry.objectives || carry.bomb || carry.sites) record.legacyCarry = { version: 1, ...carry };
  // FCW-30: the rules entities, on the record's lattice and in whole degrees; none, no key
  if (l.zones?.length) record.zones = l.zones.map((e) => copyEntity(e, true));
  if (l.markers?.length) record.markers = l.markers.map((e) => copyEntity(e, true));
  if (l.spawners?.length) record.spawners = l.spawners.map((e) => copyEntity(e, true));
  return record;
}

const isV2 = (r: AnyLayoutRecord): r is LayoutRecordV2 => (r as { v?: unknown }).v === RECORD_V2;

/** A layout from a record (v2 or v3): the v3 ids kept on their rows (a default id left implied), the carry put back. */
export function layoutOfRecord(r: AnyLayoutRecord): Layout {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const ids: RecordIds | null = isV2(r) ? null : r.ids;
  // FX-1: a tilted or scaled piece's pose by its piece's index (a v2 record has none)
  const poseRows: PoseRow[] = isV2(r) ? [] : r.poses ?? [];
  const poses = new Map<number, PoseRow>(poseRows.map((row): [number, PoseRow] => [row[0], row]));
  const layout: Layout & Carry = {
    forge: LAYOUT_VERSION,
    base: baseOf(r.base, isV2(r) ? undefined : r.contentBase),
    pieces: r.pieces.map(([a, x, y, z, yaw, locked], i) => {
      const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
      const asset = r.assets[a]!;
      const pose = poses.get(i);
      return {
        asset: typeof asset === "string" ? asset : contentAssetKey(asset),
        m: pose ? poseMatrix(x, y, z, yaw, pose) : [n0(c), 0, n0(-s), 0, 0, 1, 0, 0, n0(s), 0, n0(c), 0, x, y, z, 1],
        ...(locked === true ? { locked: true as const } : {}),
        ...ownId(ids?.pieces[i], ID_PREFIX.piece, i),
        ...(typeof asset === "string" ? {} : { content: cloneContent(asset) }),
      };
    }),
    spawns: r.spawns.map(([team, x, y, z, yaw, locked], i) => ({
      team, p: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}), ...ownId(ids?.spawns[i], ID_PREFIX.spawn, i),
    })),
  };
  if (r.hidden?.length) layout.hidden = [...r.hidden];
  if (!isV2(r) && r.hiddenData?.length) layout.hiddenData = [...r.hiddenData];
  if (!isV2(r) && r.tree?.length) layout.tree = r.tree.map(([c, p]) => [c, p] as [string, string]);
  if (!isV2(r) && r.folders?.length) layout.folders = r.folders.map((f) => ({ name: f.name }));
  if (!isV2(r) && r.order?.length) layout.order = [...r.order];
  if (r.npcs?.length) layout.npcs = r.npcs.map(([side, type, x, y, z, yaw, locked], i): NpcMarker => ({
    side, type, p: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}), ...ownId(ids?.npcs?.[i], ID_PREFIX.npc, i),
  }));
  if (!isV2(r) && r.hostages?.length) layout.hostages = r.hostages.map(([x, y, z, yaw, more]): HostageMarker => ({
    p: [x, y, z], yaw: rad(yaw), ...(more?.locked === true ? { locked: true as const } : {}),
    ...(more?.name ? { name: more.name } : {}), ...(more?.character ? { character: more.character } : {}), ...(more?.source ? { source: more.source } : {}),
  }));
  if (!isV2(r) && r.doors?.length) layout.doors = r.doors.map(([source, name, x, y, z, yaw, locked]): DoorMarker => ({
    source, name, at: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
  }));
  for (const key of ["gates", "barriers"] as const) {
    const rows = isV2(r) ? undefined : r[key];
    if (rows?.length) layout[key] = rows.map(([source, name, x, y, z, yaw, locked]): DoorMarker => ({
      source, name, at: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
    }));
  }
  if (!isV2(r) && r.switches?.length) layout.switches = r.switches.map(([gate, x, y, z, yaw, action, look, prompt, range, elevation, points, script, locked, , piece, node]): SwitchMarker => ({
    ...(piece !== undefined && piece >= 0 ? { piece } : {}), ...(node ? { node } : {}),
    ...(gate >= 0 ? { gate } : {}), ...(action ? { action } : {}), ...(script ? { script: JSON.parse(JSON.stringify(script)) as SwitchScript } : {}),
    ...switchFields({ look: look || undefined, prompt: prompt ?? undefined, range: range ?? undefined, elevation: elevation ?? undefined, points: points ?? undefined }), at: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.triggers?.length) layout.triggers = r.triggers.map(([piece, health, armor, shield, script, node, x, y, z]): PieceTrigger => ({
    ...(node ? { node } : piece >= 0 ? { piece } : {}), ...(x !== null && y !== null && z !== null ? { at: [x, y, z] as [number, number, number] } : {}), health, armor, shield, ...(script ? { script: JSON.parse(JSON.stringify(script)) as SwitchScript } : {}),
  }));
  if (!isV2(r) && r.objects?.length) layout.objects = r.objects.map(([kind, source, name, x, y, z, yaw, locked, audio]): ForgeObject => ({
    kind, source, name, at: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
    ...(audio ? { audio: JSON.parse(JSON.stringify(audio)) as AudioStep[] } : {}),
  }));
  if (!isV2(r) && r.turrets?.length) layout.turrets = r.turrets.map(([source, name, x, y, z, yaw, locked]): TurretMarker => ({
    source, name, at: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.flares?.length) layout.flares = r.flares.map(([source, name, x, y, z, locked]): FlareMarker => ({
    source, name, at: [x, y, z], ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.respawns?.length) layout.respawns = r.respawns.map(([team, x, y, z, yaw, locked]): SpawnMarker => ({
    team, p: [x, y, z], yaw: rad(yaw), ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.tacPoints?.length) layout.tacPoints = r.tacPoints.map(([name, x, y, z, kind, locked]): TacPointMarker => ({
    name, kind, at: [x, y, z], ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.scenicViews?.length) layout.scenicViews = r.scenicViews.map(([name, x, y, z, yaw, pitch, locked]): ScenicViewMarker => ({
    name, at: [x, y, z], yaw, pitch, ...(locked === true ? { locked: true as const } : {}),
  }));
  if (!isV2(r) && r.extractionZones?.length) layout.extractionZones = r.extractionZones.map(([name, x, y, z, w, d, locked]): ExtractionZone => ({
    name, at: [x, y, z], size: [w, d], ...(locked === true ? { locked: true as const } : {}),
  }));
  if (r.settings && Object.keys(r.settings).length) {
    layout.settings = { ...r.settings };
    // An earlier save's night lens in bytes, read once in the disc's range (`nightLensOf`, FP-1b).
    const night = r.settings.night;
    if (night?.lens) layout.settings.night = { ...night, lens: nightLensOf(night.lens) };
  }
  const name = r.name.trim();
  if (name) layout.name = name;
  if (r.camera) layout.camera = parseCamera(r.camera);
  if (r.missing?.length) layout.missing = [...r.missing];
  // The layout file's own parse, defaults filled (a site's yaw 0, its reach 15): a record may leave them out as a file
  // may (the forge seat's low 1 on b46b88328: a raw copy turned a marker by NaN). The check ran the same parse.
  if (r.objectives) layout.objectives = parsedObjectives(isV2(r) ? r.objectives : withCarry(r));
  if (!isV2(r)) {
    const marks: LayoutObjectiveIds = {};
    if (r.objectives?.bomb?.start && r.ids.bomb !== undefined && r.ids.bomb !== `${ID_PREFIX.bomb}0`) marks.bomb = r.ids.bomb;
    const siteIds = r.ids.sites ?? [];
    if (siteIds.some((id, i) => id !== `${ID_PREFIX.site}${i}`)) marks.sites = [...siteIds];
    if (marks.bomb !== undefined || marks.sites) layout.ids = marks;
    // the review's F1: the record's `requires` is derived (its pieces' packs) plus what the author declared; only the
    // declaration goes back on the layout, so a pack whose last piece is deleted is no longer required
    const derived = r.pieces.flatMap(([a]) => { const asset = r.assets[a]; return asset === undefined || typeof asset === "string" ? [] : [asset.pack]; });
    if (r.contentBase) derived.push(r.contentBase.ref);   // FCW-10: the base's pack is derived as a piece's is
    const declared = (r.requires ?? []).filter((p) => !derived.some((d) => samePackRef(d, p)));
    if (declared.length) layout.requires = declared.map((p) => ({ id: p.id, version: p.version, hash: p.hash }));
    if (r.mode) layout.mode = json(r.mode);
    // FCW-30: the rules entities back in the layout's radians
    if (r.zones?.length) layout.zones = r.zones.map((e) => copyEntity(e, false));
    if (r.markers?.length) layout.markers = r.markers.map((e) => copyEntity(e, false));
    if (r.spawners?.length) layout.spawners = r.spawners.map((e) => copyEntity(e, false));
  }
  return layout;
}

/** A v3 record's objectives with its carried members put back at their own paths (its ids are `Layout.ids`). */
function withCarry(r: CreatorLayoutRecord): unknown {
  const o = r.objectives!;
  const carry = r.legacyCarry;
  const out: Record<string, unknown> = Object.assign(o.gameType === undefined ? {} : { gameType: o.gameType }, json(carry?.objectives ?? {}));
  if (o.bomb) {
    const siteIds = r.ids.sites ?? [];
    const sites = o.bomb.sites.map((s, i) => Object.assign({}, s, json(carry?.sites?.[siteIds[i]!] ?? {})));
    const bomb: Record<string, unknown> = Object.assign({ sites }, json(carry?.bomb ?? {}));
    if (o.bomb.start) bomb["start"] = [...o.bomb.start];
    if (o.bomb.startLocked === true) bomb["startLocked"] = true;
    out["bomb"] = bomb;
  }
  return out;
}

/** A record's objectives as `parseLayout` reads a file's: checked, defaults filled, unknown keys kept. Throws why not. */
function parsedObjectives(v: unknown): ForgeObjectives | undefined {
  return parseLayout(JSON.stringify({ forge: LAYOUT_VERSION, base: { kind: "blank", library: "MP2" }, pieces: [], spawns: [], objectives: v })).objectives;
}

/** The layout's camera as `parseCamera` reads it, or the reason it is not one. Extra fields are refused. */
function cameraError(v: unknown): string | null {
  if (!isObj(v)) return "camera is not a position and a look";
  for (const k of Object.keys(v)) if (!CAMERA_FIELDS.includes(k)) return `camera names no field ${k}`;
  try { parseCamera(v); return null; } catch (e) { return e instanceof Error ? e.message : "camera"; }
}

/** A coordinate at one decimal place, inside the map bound. An integer is one. */
const inBound = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= RECORD_LIMITS.coord && tenth(n) === n;
const isDeg = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 360;

/** The layout's own settings check (`parseLayout`), so the record's bounds stay the file's. */
function settingsError(v: unknown): string | null {
  try {
    parseSettings(v);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "settings";
  }
}

/**
 * FG-51: the layout's own objectives check (`parseLayout`, as `settingsError`), then the record's bound on the bomb's
 * points: one decimal place inside the map bound, as a piece's.
 */
function objectivesError(v: unknown): string | null {
  let o: ForgeObjectives | undefined;
  try {
    o = parsedObjectives(v);
  } catch (e) {
    return e instanceof Error ? e.message : "objectives";
  }
  const points = [...(o?.bomb?.start ? [o.bomb.start] : []), ...(o?.bomb?.sites ?? []).map((s) => s.at)];
  return points.every((p) => p.every(inBound)) ? null : "objectives has a point off the record's bound";
}

/** The checks v2 and v3 share: the name, the base, the rows and the optional blocks. `assetError` is the version's. */
function commonError(r: Record<string, unknown>, assetError: (a: unknown, i: number) => string | null, contentBase = false): string | null {
  const name = r["name"];
  if (typeof name !== "string" || name.trim() === "" || name.length > RECORD_LIMITS.name || /[\u0000-\u001f]/.test(name)) return `the name is not 1-${RECORD_LIMITS.name} printable characters`;
  const base = r["base"];
  const library = typeof base === "string" && base.startsWith("blank:") ? base.slice(6) : "";
  // FCW-10: `content:<stem>` only where the version admits a content base (v3); its map is `contentBaseError`'s
  const contentLibrary = contentBase && typeof base === "string" && base.startsWith(CONTENT_BASE_PREFIX) ? base.slice(CONTENT_BASE_PREFIX.length) : "";
  const baseOk = typeof base === "string" && (STEM.test(base) || (library !== "" && (STEM.test(library) || library === BLANK_FLOOR)) || STEM.test(contentLibrary));
  if (!baseOk) return "the base is neither an archive nor a blank floor";
  const assets = r["assets"], pieces = r["pieces"], spawns = r["spawns"];
  if (!Array.isArray(assets) || !Array.isArray(pieces) || !Array.isArray(spawns)) return "assets, pieces or spawns is not a list";
  if (assets.length > RECORD_LIMITS.assets) return `more than ${RECORD_LIMITS.assets} assets`;
  if (pieces.length > RECORD_LIMITS.pieces) return `more than ${RECORD_LIMITS.pieces} pieces`;
  if (spawns.length > RECORD_LIMITS.spawns) return `more than ${RECORD_LIMITS.spawns} spawns`;
  for (const [i, a] of assets.entries()) {
    const why = assetError(a, i);
    if (why) return why;
  }
  for (const [i, p] of pieces.entries()) {
    if (!Array.isArray(p) || (p.length !== 5 && p.length !== 6) || !Number.isInteger(p[0]) || p[0] < 0 || p[0] >= assets.length
      || !inBound(p[1]) || !inBound(p[2]) || !inBound(p[3]) || !isDeg(p[4])) return `piece ${i} is not [asset#, x, y, z, yaw]`;
    if (p.length === 6 && p[5] !== true) return `piece ${i} lock is not true`;
  }
  for (const [i, s] of spawns.entries()) {
    if (!Array.isArray(s) || (s.length !== 5 && s.length !== 6) || (s[0] !== "A" && s[0] !== "B") || !inBound(s[1]) || !inBound(s[2])
      || !inBound(s[3]) || !isDeg(s[4])) return `spawn ${i} is not [team, x, y, z, yaw]`;
    if (s.length === 6 && s[5] !== true) return `spawn ${i} lock is not true`;
  }
  if (r["hidden"] !== undefined) {
    const hidden = r["hidden"];
    if (!Array.isArray(hidden) || hidden.length === 0 || hidden.length > RECORD_LIMITS.pieces) return "hidden is not a list of placements";
    for (const [i, h] of hidden.entries()) if (typeof h !== "string" || !PLACEMENT_KEY.test(h)) return `hidden ${i} is not a model and a place`;
  }
  if (r["tree"] !== undefined) { const why = treeWhy(r["tree"]); if (why) return why; }
  if (r["folders"] !== undefined) { const why = foldersWhy(r["folders"]); if (why) return why; }
  if (r["order"] !== undefined) { const why = orderWhy(r["order"]); if (why) return why; }
  if (r["hiddenData"] !== undefined) {
    const keys = r["hiddenData"];
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > RECORD_LIMITS.pieces) return "hiddenData is not a list of map objectives";
    for (const [i, h] of keys.entries()) if (typeof h !== "string" || !HIDDEN_DATA_KEY.test(h)) return `hiddenData ${i} is not a map objective's key`;
  }
  if (r["npcs"] !== undefined) {
    const npcs = r["npcs"];
    if (!Array.isArray(npcs) || npcs.length === 0 || npcs.length > RECORD_LIMITS.spawns) return "npcs is not a list";
    for (const [i, n] of npcs.entries()) {
      if (!Array.isArray(n) || (n.length !== 6 && n.length !== 7) || (n[0] !== "seal" && n[0] !== "terrorist") || !Number.isInteger(n[1])
        || (n[1] as number) < 0 || (n[1] as number) > 31 || !inBound(n[2]) || !inBound(n[3]) || !inBound(n[4]) || !isDeg(n[5])) {
        return `npc ${i} is not [side, type, x, y, z, yaw]`;
      }
      if (n.length === 7 && n[6] !== true) return `npc ${i} lock is not true`;
    }
  }
  if (r["hostages"] !== undefined) {
    const hostages = r["hostages"];
    if (!Array.isArray(hostages) || hostages.length === 0 || hostages.length > RECORD_LIMITS.spawns) return "hostages is not a list";
    for (const [i, h] of hostages.entries()) {
      if (!Array.isArray(h) || (h.length !== 4 && h.length !== 5) || !inBound(h[0]) || !inBound(h[1]) || !inBound(h[2]) || !isDeg(h[3])) {
        return `hostage ${i} is not [x, y, z, yaw]`;
      }
      if (h.length === 5) {
        const m = h[4] as unknown;
        if (!isObj(m) || Object.keys(m).some((k) => k !== "name" && k !== "character" && k !== "source" && k !== "locked")) return `hostage ${i} is not [x, y, z, yaw, { name, character, source, locked }]`;
        if (m["locked"] !== undefined && m["locked"] !== true) return `hostage ${i} lock is not true`;
        if (m["name"] !== undefined && (typeof m["name"] !== "string" || !HOSTAGE_NAME.test(m["name"]))) return `hostage ${i} name is not 1-32 letters, digits, spaces, _ or -`;
        if (m["character"] !== undefined && (typeof m["character"] !== "string" || !HOSTAGE_CHARACTER.test(m["character"]))) return `hostage ${i} character is not a character key`;
        if (m["source"] !== undefined && (typeof m["source"] !== "string" || !TURRET_SOURCE.test(m["source"]))) return `hostage ${i} source is not a disc map's stem`;
      }
    }
  }
  if (r["doors"] !== undefined) {
    const doors = r["doors"];
    if (!Array.isArray(doors) || doors.length === 0 || doors.length > RECORD_LIMITS.spawns) return "doors is not a list";
    for (const [i, t] of doors.entries()) {
      if (!Array.isArray(t) || (t.length !== 6 && t.length !== 7) || typeof t[0] !== "string" || !TURRET_SOURCE.test(t[0]) || typeof t[1] !== "string"
        || !TURRET_NAME.test(t[1]) || !inBound(t[2]) || !inBound(t[3]) || !inBound(t[4]) || !isDeg(t[5])) return `door ${i} is not [source, name, x, y, z, yaw]`;
      if (t.length === 7 && t[6] !== true) return `door ${i} lock is not true`;
    }
  }
  for (const [key, what] of [["gates", "gate"], ["barriers", "barrier"]] as const) {
    if (r[key] === undefined) continue;
    const rows = r[key];
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > RECORD_LIMITS.spawns) return `${key} is not a list`;
    for (const [i, t] of rows.entries()) {
      if (!Array.isArray(t) || (t.length !== 6 && t.length !== 7) || typeof t[0] !== "string" || !TURRET_SOURCE.test(t[0]) || typeof t[1] !== "string"
        || !TURRET_NAME.test(t[1]) || !inBound(t[2]) || !inBound(t[3]) || !inBound(t[4]) || !isDeg(t[5])) return `${what} ${i} is not [source, name, x, y, z, yaw]`;
      if (t.length === 7 && t[6] !== true) return `${what} ${i} lock is not true`;
    }
  }
  if (r["triggers"] !== undefined) {
    const rows = r["triggers"];
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > RECORD_LIMITS.pieces) return "triggers is not a list";
    const counts: SwitchCounts = { pieces: Array.isArray(r["pieces"]) ? (r["pieces"] as unknown[]).length : 0,
      barriers: Array.isArray(r["barriers"]) ? (r["barriers"] as unknown[]).length : 0, gates: Array.isArray(r["gates"]) ? (r["gates"] as unknown[]).length : 0, objects: Array.isArray(r["objects"]) ? (r["objects"] as unknown[]).length : 0 };
    for (const [i, t] of rows.entries()) {
      if (!Array.isArray(t) || t.length !== 9 || !Number.isInteger(t[0]) || typeof t[5] !== "string" || (t[5] !== "" && t[0] !== -1)
        || ![t[6], t[7], t[8]].every((v) => v === null || inBound(v)) || !([t[6], t[7], t[8]].every((v) => v === null) || [t[6], t[7], t[8]].every((v) => v !== null))
        || !pieceTriggerOk({ ...(t[5] ? { node: t[5] } : t[0] >= 0 ? { piece: t[0] } : {}), health: t[1], armor: t[2], shield: t[3], ...(t[4] !== null ? { script: t[4] } : {}) }, counts)
        || (t[5] !== "" && rows.findIndex((o) => Array.isArray(o) && o[5] === t[5]) !== i) || (t[0] >= 0 && rows.findIndex((o) => Array.isArray(o) && o[0] === t[0]) !== i)) {
        return `trigger ${i} is not [piece, health, armor, shield, script, node, x, y, z] of a prop of the layout's or a map node, once`;
      }
    }
  }
  if (r["objects"] !== undefined) {
    const rows = r["objects"];
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > RECORD_LIMITS.pieces) return "objects is not a list";
    for (const [i, t] of rows.entries()) {
      if (!Array.isArray(t) || t.length < 7 || t.length > 9 || (t.length === 8 && t[7] !== true) || (t.length === 9 && typeof t[7] !== "boolean")
        || ![t[3], t[4], t[5]].every(inBound) || !isDeg(t[6])
        || !forgeObjectOk({ kind: t[0], source: t[1], name: t[2], at: [t[3], t[4], t[5]], yaw: 0, ...(t.length === 9 ? { audio: t[8] } : {}) })) {
        return `object ${i} is not [kind, source, name, x, y, z, yaw, locked?, audio?] of an ambient effect or a crane`;
      }
    }
  }
  if (r["switches"] !== undefined) {
    const rows = r["switches"];
    const gates = Array.isArray(r["gates"]) ? (r["gates"] as unknown[]).length : 0;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > RECORD_LIMITS.spawns) return "switches is not a list";
    for (const [i, t] of rows.entries()) {
      const counts: SwitchCounts = { pieces: Array.isArray(r["pieces"]) ? (r["pieces"] as unknown[]).length : 0,
        barriers: Array.isArray(r["barriers"]) ? (r["barriers"] as unknown[]).length : 0, gates, objects: Array.isArray(r["objects"]) ? (r["objects"] as unknown[]).length : 0 };
      if (!Array.isArray(t) || t.length < 12 || t.length > 16 || !Number.isInteger(t[0]) || t[0] < -1 || t[0] >= gates
        || (t[11] !== null && (!switchScriptOk(t[11], counts) || t[0] !== -1 || t[5] !== ""))
        || !inBound(t[1]) || !inBound(t[2]) || !inBound(t[3]) || !isDeg(t[4])
        || typeof t[5] !== "string" || (t[5] !== "" && (!SWITCH_ACTION.test(t[5]) || t[0] !== -1)) || typeof t[6] !== "string"
        || !switchFieldsOk({ look: t[6] || undefined, prompt: t[7] ?? undefined, range: t[8] ?? undefined, elevation: t[9] ?? undefined, points: t[10] ?? undefined })) {
        return `switch ${i} is not [gate, x, y, z, yaw, action, look, prompt, range, elevation, points] of a gate of the layout or a map action`;
      }
      if (t.length === 13 && t[12] !== true) return `switch ${i} lock is not true`;
      if (t.length === 14) return `switch ${i} has a team column: a switch has no team`;
      if (t.length === 15) return `switch ${i} has a prop column without its node`;
      if (t.length === 16 && ((t[12] !== true && t[12] !== null) || t[13] !== null
        || !Number.isInteger(t[14]) || typeof t[15] !== "string" || (t[14] >= 0 && t[15] !== "") || (t[14] < 0 && t[15] === "")
        || !switchLinkOk(t[14] >= 0 ? t[14] : undefined, t[15] || undefined, Array.isArray(r["pieces"]) ? (r["pieces"] as unknown[]).length : 0))) {
        return `switch ${i} lock or prop link is not valid`;
      }
    }
  }
  if (r["turrets"] !== undefined) {
    const turrets = r["turrets"];
    if (!Array.isArray(turrets) || turrets.length === 0 || turrets.length > RECORD_LIMITS.spawns) return "turrets is not a list";
    for (const [i, t] of turrets.entries()) {
      if (!Array.isArray(t) || (t.length !== 6 && t.length !== 7) || typeof t[0] !== "string" || !TURRET_SOURCE.test(t[0]) || typeof t[1] !== "string"
        || !TURRET_NAME.test(t[1]) || !inBound(t[2]) || !inBound(t[3]) || !inBound(t[4]) || !isDeg(t[5])) return `turret ${i} is not [source, name, x, y, z, yaw]`;
      if (t.length === 7 && t[6] !== true) return `turret ${i} lock is not true`;
    }
  }
  if (r["flares"] !== undefined) {
    const flares = r["flares"];
    if (!Array.isArray(flares) || flares.length === 0 || flares.length > RECORD_LIMITS.spawns) return "flares is not a list";
    for (const [i, f] of flares.entries()) {
      if (!Array.isArray(f) || (f.length !== 5 && f.length !== 6) || typeof f[0] !== "string" || !TURRET_SOURCE.test(f[0]) || typeof f[1] !== "string"
        || !FLARE_NODE.test(f[1]) || !inBound(f[2]) || !inBound(f[3]) || !inBound(f[4])) return `flare ${i} is not [source, name, x, y, z]`;
      if (f.length === 6 && f[5] !== true) return `flare ${i} lock is not true`;
    }
  }
  if (r["respawns"] !== undefined) {
    const respawns = r["respawns"];
    if (!Array.isArray(respawns) || respawns.length === 0 || respawns.length > RECORD_LIMITS.spawns) return "respawns is not a list";
    for (const [i, s] of respawns.entries()) {
      if (!Array.isArray(s) || (s.length !== 5 && s.length !== 6) || (s[0] !== "A" && s[0] !== "B") || !inBound(s[1]) || !inBound(s[2])
        || !inBound(s[3]) || !isDeg(s[4])) return `respawn point ${i} is not [team, x, y, z, yaw]`;
      if (s.length === 6 && s[5] !== true) return `respawn point ${i} lock is not true`;
    }
  }
  if (r["tacPoints"] !== undefined) {
    const points = r["tacPoints"];
    if (!Array.isArray(points) || points.length === 0 || points.length > RECORD_LIMITS.spawns) return "tacPoints is not a list";
    for (const [i, t] of points.entries()) {
      if (!Array.isArray(t) || (t.length !== 5 && t.length !== 6) || typeof t[0] !== "string" || !ZONE_NAME.test(t[0]) || !inBound(t[1]) || !inBound(t[2])
        || !inBound(t[3]) || !Number.isInteger(t[4]) || (t[4] as number) < 0 || (t[4] as number) > 31) return `tactical point ${i} is not [name, x, y, z, kind]`;
      if (t.length === 6 && t[5] !== true) return `tactical point ${i} lock is not true`;
    }
  }
  if (r["scenicViews"] !== undefined) {
    const views = r["scenicViews"];
    if (!Array.isArray(views) || views.length === 0 || views.length > RECORD_LIMITS.spawns) return "scenicViews is not a list";
    for (const [i, v] of views.entries()) {
      const angle = (n: unknown): boolean => inBound(n) && Math.abs(n as number) <= 360;
      if (!Array.isArray(v) || (v.length !== 6 && v.length !== 7) || typeof v[0] !== "string" || !ZONE_NAME.test(v[0]) || !inBound(v[1]) || !inBound(v[2])
        || !inBound(v[3]) || !angle(v[4]) || !angle(v[5])) return `spectator view ${i} is not [name, x, y, z, yaw, pitch]`;
      if (v.length === 7 && v[6] !== true) return `spectator view ${i} lock is not true`;
    }
  }
  if (r["extractionZones"] !== undefined) {
    const zones = r["extractionZones"];
    if (!Array.isArray(zones) || zones.length === 0 || zones.length > RECORD_LIMITS.spawns) return "extractionZones is not a list";
    for (const [i, z] of zones.entries()) {
      const sized = (n: unknown): boolean => inBound(n) && (n as number) > 0;
      if (!Array.isArray(z) || (z.length !== 6 && z.length !== 7) || typeof z[0] !== "string" || !ZONE_NAME.test(z[0])
        || !inBound(z[1]) || !inBound(z[2]) || !inBound(z[3]) || !sized(z[4]) || !sized(z[5])) return `extraction zone ${i} is not [name, x, y, z, width, depth]`;
      if (z.length === 7 && z[6] !== true) return `extraction zone ${i} lock is not true`;
    }
  }
  if (r["settings"] !== undefined) {
    const why = settingsError(r["settings"]);
    if (why) return why;
  }
  if (r["camera"] !== undefined) {
    const whyCamera = cameraError(r["camera"]);
    if (whyCamera) return whyCamera;
  }
  if (r["missing"] !== undefined) {
    const missing = r["missing"];
    if (!Array.isArray(missing) || missing.length === 0
      || !missing.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < pieces.length)) return "missing is not a list of piece indices";
  }
  return null;
}

/** Null when `r` is a v2 record within its bounds, else the first reason it is not (the v2 check, unchanged). */
function checkV2(r: Record<string, unknown>): string | null {
  for (const k of Object.keys(r)) if (!V2_FIELDS.includes(k)) return `unknown field ${k}`;
  if (r["v"] !== RECORD_V2) return `not a forge record of version ${RECORD_V2} or ${RECORD_VERSION}`;
  const why = commonError(r, (a, i) => (typeof a !== "string" || !ASSET.test(a) ? `asset ${i} is not <archive>:<prototype>` : null));
  if (why) return why;
  if (r["objectives"] !== undefined) {
    const whyObjectives = objectivesError(r["objectives"]);
    if (whyObjectives) return whyObjectives;
  }
  return null;
}

/** A creator mode the build offers (FCW-07b's catalogue supplies these): by id and version, and its params' check. */
export interface ModeCatalogueEntry {
  readonly id: string;
  readonly version: string;
  /** Null when `params` suit the mode, else why not. Absent: any plain params. */
  check?(params: Readonly<Record<string, unknown>>): string | null;
}
export interface CheckRecordOptions {
  /** The modes this build plays. Absent: none, so a record naming a mode is refused (an unknown game mode). */
  readonly modes?: readonly ModeCatalogueEntry[];
}

/** The strict v3 objectives: no key this build does not read, at any of the three levels. */
function strictObjectivesError(o: unknown): string | null {
  if (!isObj(o)) return "objectives is not an object";
  for (const k of Object.keys(o)) if (!KNOWN_OBJECTIVE_KEYS.includes(k)) return `objectives names no objective kind ${k}`;
  const bomb = o["bomb"];
  if (bomb === undefined) return null;
  if (!isObj(bomb)) return "objectives.bomb is not an object";
  for (const k of Object.keys(bomb)) if (!BOMB_FIELDS.includes(k)) return `objectives.bomb names no field ${k}`;
  const sites = bomb["sites"];
  if (!Array.isArray(sites)) return "objectives.bomb.sites is not a list";
  for (const [i, s] of sites.entries()) {
    if (!isObj(s)) return `objectives.bomb site ${i} is not an object`;
    for (const k of Object.keys(s)) if (!SITE_FIELDS.includes(k)) return `objectives.bomb site ${i} names no field ${k}`;
  }
  return null;
}

/** The ids: one per row of each kind (`pieces`, `spawns` always; the rest only with their rows), authored, unique. */
function idsError(r: Record<string, unknown>): string | null {
  const ids = r["ids"];
  if (!isObj(ids)) return "ids is not the rows' ids";
  for (const k of Object.keys(ids)) if (!ID_FIELDS.includes(k)) return `ids names no field ${k}`;
  const count = (rows: unknown): number => (Array.isArray(rows) ? rows.length : 0);
  const exact = (k: string, n: number): string | null => (Array.isArray(ids[k]) && (ids[k] as unknown[]).length === n ? null : `ids.${k} is not one id per row`);
  const optional = (k: string, n: number): string | null => (n === 0 ? (ids[k] === undefined ? null : `ids.${k} names rows the record does not have`) : exact(k, n));
  const objectives = r["objectives"] as RecordObjectives | undefined;
  const why = exact("pieces", count(r["pieces"])) ?? exact("spawns", count(r["spawns"])) ?? optional("npcs", count(r["npcs"]))
    ?? optional("sites", count(objectives?.bomb?.sites));
  if (why) return why;
  const hasStart = objectives?.bomb?.start !== undefined;
  if (hasStart !== (ids["bomb"] !== undefined)) return hasStart ? "ids.bomb is missing for the bomb's start" : "ids.bomb names a start the record does not have";
  const all = [...(ids["pieces"] as unknown[]), ...(ids["spawns"] as unknown[]), ...((ids["npcs"] as unknown[] | undefined) ?? []),
    ...(ids["bomb"] === undefined ? [] : [ids["bomb"]]), ...((ids["sites"] as unknown[] | undefined) ?? [])];
  for (const id of all) if (typeof id !== "string" || !AUTHORED_ID.test(id)) return `ids: ${String(id)} is not an authored id`;
  const dup = duplicateId(all as string[]);
  return dup === null ? null : `duplicate id ${dup}`;
}

/** FCW-30: the rules entities' ids, unique among themselves and against every row's (`ids`, already checked). */
function entityIdsError(r: Record<string, unknown>): string | null {
  const ids = r["ids"] as RecordIds;
  const rows = [...ids.pieces, ...ids.spawns, ...(ids.npcs ?? []), ...(ids.bomb === undefined ? [] : [ids.bomb]), ...(ids.sites ?? [])];
  const dup = duplicateId([...rows, ...entityIdList(r as Parameters<typeof layoutEntityIds>[0])]);
  return dup === null ? null : `duplicate id ${dup}`;
}

/** FCW-10: a `content:<stem>` base has its map (`contentBase`: `{ref, mapId}`, a content base's own check), any other base none. */
function contentBaseError(r: Record<string, unknown>): string | null {
  const base = r["base"] as string;
  const c = r["contentBase"];
  if (!base.startsWith(CONTENT_BASE_PREFIX)) return c === undefined ? null : "contentBase names a map the base does not stand on";
  if (!isObj(c)) return "a content: base needs its contentBase {ref, mapId}";
  const extra = Object.keys(c).find((k) => !["ref", "mapId"].includes(k));
  if (extra) return `contentBase names no field ${extra}`;
  return checkContentLayoutBase({ kind: "content", ref: c["ref"], mapId: c["mapId"], library: base.slice(CONTENT_BASE_PREFIX.length) });
}

function requiresError(r: Record<string, unknown>): string | null {
  const req = r["requires"];
  const refs: PackRef[] = [];
  if (req !== undefined) {
    if (!Array.isArray(req) || req.length === 0 || req.length > RECORD_LIMITS.requires) return `requires is not a list of 1-${RECORD_LIMITS.requires} pack references`;
    const seen = new Set<string>();
    for (const [i, p] of req.entries()) {
      const why = checkPackRef(p);
      if (why) return `requires ${i}: ${why}`;
      const ref = p as PackRef;
      if (seen.has(`${ref.id}@${ref.version}`)) return `requires names ${ref.id}@${ref.version} twice`;
      seen.add(`${ref.id}@${ref.version}`);
      refs.push(ref);
    }
  }
  for (const [i, a] of (r["assets"] as unknown[]).entries()) {
    if (typeof a === "string") continue;
    const pack = (a as ContentRef).pack;
    if (!refs.some((p) => samePackRef(p, pack))) return `requires does not name ${packRefKey(pack)}, the pack of asset ${i}`;
  }
  const map = r["contentBase"] as RecordContentBase | undefined;
  if (map && !refs.some((p) => samePackRef(p, map.ref))) return `requires does not name ${packRefKey(map.ref)}, the pack of the base's map`;
  return null;
}

function legacyCarryError(r: Record<string, unknown>): string | null {
  const c = r["legacyCarry"];
  if (c === undefined) return null;
  if (!isObj(c)) return "legacyCarry is not an object";
  for (const k of Object.keys(c)) if (!["version", "objectives", "bomb", "sites"].includes(k)) return `legacyCarry names no field ${k}`;
  if (c["version"] !== 1) return "legacyCarry is not of version 1";
  const objectives = r["objectives"] as RecordObjectives | undefined;
  const members = (v: unknown, known: readonly string[], where: string): string | null => {
    if (!isObj(v) || Object.keys(v).length === 0) return `legacyCarry.${where} is not a set of members`;
    for (const k of Object.keys(v)) if (known.includes(k)) return `legacyCarry.${where} names ${k}, a key this build reads`;
    try { canonicalJson(v); } catch { return `legacyCarry.${where} is not plain JSON data`; }
    return null;
  };
  if (c["objectives"] === undefined && c["bomb"] === undefined && c["sites"] === undefined) return "legacyCarry carries nothing";
  if (c["objectives"] !== undefined) {
    if (!objectives) return "legacyCarry.objectives has no objectives to sit in";
    const why = members(c["objectives"], KNOWN_OBJECTIVE_KEYS, "objectives");
    if (why) return why;
  }
  if (c["bomb"] !== undefined) {
    if (!objectives?.bomb) return "legacyCarry.bomb has no bomb to sit in";
    const why = members(c["bomb"], KNOWN_BOMB_KEYS, "bomb");
    if (why) return why;
  }
  if (c["sites"] !== undefined) {
    const sites = c["sites"];
    const siteIds = ((r["ids"] as RecordIds).sites ?? []);
    if (!isObj(sites) || Object.keys(sites).length === 0) return "legacyCarry.sites is not a set of sites";
    for (const [id, v] of Object.entries(sites)) {
      if (!siteIds.includes(id)) return `legacyCarry.sites names ${id}, not a site of this record`;
      const why = members(v, KNOWN_SITE_KEYS, `sites.${id}`);
      if (why) return why;
    }
  }
  return null;
}

/** A scale on the record's lattice within its bounds (`RECORD_SCALE_*`). */
const isScale = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && n >= RECORD_SCALE_MIN_ADAPTATION
  && n <= RECORD_SCALE_MAX_ADAPTATION && Math.round(n * RECORD_SCALE_DENOMINATOR) / RECORD_SCALE_DENOMINATOR === n;

/**
 * FX-1: null when a v3 record's `poses` is absent or well formed (`PoseRow`): 1..`RECORD_LIMITS.pieces` rows, each naming
 * a piece of the record once, in piece order; pitch a whole degree in -90..90, roll in 0..359, each scale on its lattice
 * within its bounds; canonical (no roll at a pitch of 90 or -90); and a pose, never a row for a piece that needs none
 * (pitch 0, roll 0, scale 1, 1, 1), so one layout has one text.
 */
function posesError(r: Record<string, unknown>): string | null {
  if (r["poses"] === undefined) return null;
  const poses = r["poses"], pieces = r["pieces"] as unknown[];
  if (!Array.isArray(poses) || poses.length === 0 || poses.length > RECORD_LIMITS.pieces) return `poses is not a list of 1-${RECORD_LIMITS.pieces} piece poses`;
  let last = -1;
  for (const [i, p] of poses.entries()) {
    if (!Array.isArray(p) || p.length !== 6 || !Number.isInteger(p[0])) return `pose ${i} is not [piece#, pitch, roll, sx, sy, sz]`;
    const [piece, pitch, roll, sx, sy, sz] = p as [number, unknown, unknown, unknown, unknown, unknown];
    if (piece < 0 || piece >= pieces.length) return `pose ${i} names no piece`;
    if (piece <= last) return "poses are not in piece order, each piece once";
    last = piece;
    if (!Number.isInteger(pitch) || (pitch as number) < -90 || (pitch as number) > 90) return `pose ${i} pitch is not a whole degree in -90..90`;
    if (!isDeg(roll)) return `pose ${i} roll is not a whole degree in 0..359`;
    if (!isScale(sx) || !isScale(sy) || !isScale(sz)) {
      return `pose ${i} scale is not ${RECORD_SCALE_MIN_ADAPTATION}-${RECORD_SCALE_MAX_ADAPTATION} on a lattice of 1/${RECORD_SCALE_DENOMINATOR}`;
    }
    if (Math.abs(pitch as number) === 90 && roll !== 0) return `pose ${i} is not canonical: at a pitch of 90 or -90 the roll is 0, its turn in the yaw`;
    if (pitch === 0 && roll === 0 && sx === 1 && sy === 1 && sz === 1) return `pose ${i} is no pose: its piece is neither tilted nor scaled`;
  }
  return null;
}

/** Null when `r` is a v3 record: strict (no unknown key anywhere), within its bounds, ids unique, every pack required. */
function checkV3(r: Record<string, unknown>, options: CheckRecordOptions): string | null {
  for (const k of Object.keys(r)) if (!V3_FIELDS.includes(k)) return `unknown field ${k}`;
  if (r["schema"] !== RECORD_SCHEMA || r["version"] !== RECORD_VERSION) return `not a forge record of version ${RECORD_V2} or ${RECORD_VERSION}`;
  const why = commonError(r, (a, i) => {
    if (typeof a === "string") return ASSET.test(a) ? null : `asset ${i} is not <archive>:<prototype> or a pack's content`;
    const whyContent = checkContentRef(a);
    return whyContent ? `asset ${i}: ${whyContent}` : null;
  }, true) ?? contentBaseError(r);
  if (why) return why;
  if (r["objectives"] !== undefined) {
    const whyStrict = strictObjectivesError(r["objectives"]) ?? objectivesError(r["objectives"]);
    if (whyStrict) return whyStrict;
  }
  const whyIds = posesError(r) ?? idsError(r) ?? requiresError(r) ?? entityListsError(r, true) ?? entityIdsError(r);
  if (whyIds) return whyIds;
  if (r["mode"] !== undefined) {
    const whyMode = modeShapeError(r["mode"]);
    if (whyMode) return whyMode;
    const mode = r["mode"] as unknown as RecordMode;
    const entry = options.modes?.find((m) => m.id === mode.id && m.version === mode.version);
    if (!entry) return `unknown game mode ${mode.id}@${mode.version}`;
    const whyParams = entry.check?.(mode.params) ?? null;
    if (whyParams) return `mode ${mode.id}@${mode.version}: ${whyParams}`;
  }
  return legacyCarryError(r);
}

/**
 * Null when `r` is a record this build reads -- a v2 record (its own check, unchanged) or a v3 record (strict) --
 * else the first reason it is not. A server's policy runs the same check.
 */
export function checkCreatorRecord(r: unknown, options: CheckRecordOptions = {}): string | null {
  if (!isObj(r)) return "not an object";
  if (r["schema"] !== undefined) return checkV3(r, options);
  return checkV2(r);
}

/**
 * Copies fields `parseLayout` drops: `missing`, and a per-piece `locked: true` (FG-49, the v1 piece's own name).
 * A lock that is not a boolean is refused; false is unlocked and left off the piece. A `missing` value that is not a
 * list of piece indices is refused.
 */
function attachCarry(layout: Layout, raw: Record<string, unknown>): void {
  const extra = layout as Layout & Carry;
  if (raw["missing"] !== undefined) {
    const missing = raw["missing"];
    if (!Array.isArray(missing) || !missing.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < layout.pieces.length)) {
      throw new Error("not a forge layout: missing");
    }
    if (missing.length) extra.missing = [...(missing as number[])];
  }
  const rawPieces = raw["pieces"];
  if (!Array.isArray(rawPieces)) return;
  rawPieces.forEach((p, i) => {
    if (!isObj(p) || p["locked"] === undefined) return;
    if (p["locked"] !== true && p["locked"] !== false) throw new Error(`piece ${i} lock is not a boolean`);
    if (p["locked"] === true) layout.pieces[i]!.locked = true;
  });
}

/** The diagnostic codes of the record's reader and its online policy (namespace `record.`). */
export const RECORD_CODES = {
  legacyCarry: "record.LEGACY_CARRY",
  onlinePacks: "record.ONLINE_PACKS",
  onlineMode: "record.ONLINE_MODE",
  /** FP-1a: no longer raised -- the room places them (`playObjectives`); kept so an old reader's code still names. */
  onlineHostages: "record.ONLINE_HOSTAGES",
  /** FP-1a: no longer raised -- the room places them (`playObjectives`); kept likewise. */
  onlineExtractionZones: "record.ONLINE_EXTRACTION_ZONES",
  /** FP-1a: no longer raised -- the room holds no tactical map; the lobby's page composes the points. Kept likewise. */
  onlineTacticalPoints: "record.ONLINE_TACTICAL_POINTS",
  /** FP-1a: no longer raised -- the room composes placed respawn points (`placedRespawns`); kept so an old reader's code still names. */
  onlineRespawns: "record.ONLINE_RESPAWNS",
  /** FP-1a: no longer raised -- a placed flare is a light the page draws, nothing the room holds; kept likewise. */
  onlineFlares: "record.ONLINE_FLARES",
  onlineHiddenData: "record.ONLINE_HIDDEN_DATA",
  /** FP-1a: no longer raised -- the room holds no scenic view; the lobby's page composes them. Kept likewise. */
  onlineSpectatorViews: "record.ONLINE_SPECTATOR_VIEWS",
  /** FP-1a: no longer raised -- the room places them (`withPlacedObjects`); kept likewise. */
  onlineTurrets: "record.ONLINE_TURRETS",
  /** FP-1a: no longer raised -- the room places them (`withPlacedObjects`); kept likewise. */
  onlineDoors: "record.ONLINE_DOORS",
  /** FP-1a: no longer raised -- the room places them (`withPlacedObjects`); kept likewise. */
  onlineGates: "record.ONLINE_GATES",
  /** FP-1a: no longer raised -- the room places them (`withPlacedObjects`); kept likewise. */
  onlineBarriers: "record.ONLINE_BARRIERS",
  onlineSwitches: "record.ONLINE_SWITCHES",
  onlineTriggers: "record.ONLINE_TRIGGERS",
  onlineObjects: "record.ONLINE_OBJECTS",
  /** FCW-10, H273/H274: an online lobby plays the disc's own maps (`maps.ts` `CONTENT_MAP_CODES.onlineContentMap`). */
  onlineContentMap: "record.ONLINE_CONTENT_MAP",
} as const;

export interface ReadRecordOptions extends CheckRecordOptions {
  /** A v1 file's name when it names none (a v2 or v3 record names its own). Default `Layout`. */
  readonly name?: string;
  /** The packs this device holds (the registry's, FCW-06). Absent: none, so every required pack is `missing`. */
  readonly available?: readonly PackRef[];
}

export interface CreatorRecordRead {
  readonly record: CreatorLayoutRecord;
  /** Non-blocking: each legacy member carried inert (`record.LEGACY_CARRY`, source `check`, severity `warning`). */
  readonly warnings: Diagnostic[];
  /** The required packs not `available`: the record is still read and edited whole; Play waits on them (part 2's UI). */
  readonly missing: PackRef[];
}

/** One warning per carried member, objectives, then the bomb, then each site in its order. */
function carryWarnings(r: CreatorLayoutRecord): Diagnostic[] {
  const c = r.legacyCarry;
  if (!c) return [];
  const out: Diagnostic[] = [];
  const warn = (field: string, id?: string): void => {
    out.push(diagnostic({
      source: "check", severity: "warning", code: RECORD_CODES.legacyCarry, field, ...(id ? { id } : {}),
      text: `Kept as it was: this build does not read ${field}, and it changes nothing the layout plays.`,
    }));
  };
  for (const k of Object.keys(c.objectives ?? {})) warn(`objectives.${k}`);
  for (const k of Object.keys(c.bomb ?? {})) warn(`objectives.bomb.${k}`);
  (r.ids.sites ?? []).forEach((id, i) => { for (const k of Object.keys(c.sites?.[id] ?? {})) warn(`objectives.bomb.sites[${i}].${k}`, id); });
  return out;
}

/**
 * The one reader (FCW-07a): a layout file (v1), a record v2 or a record v3, as a record v3, with its warnings and the
 * packs it needs that are not here. A v1 file and a v2 record migrate deterministically (each row's default id,
 * `ID_PREFIX`; legacy members to `legacyCarry`), so the same input always gives the same v3 text. Throws with the
 * reason (`not a forge layout: ...`, or the file parse's own) when it is not one.
 */
export function readCreatorRecord(text: string, options: ReadRecordOptions = {}): CreatorRecordRead {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("not a forge layout: the file is not JSON"); }
  let record: CreatorLayoutRecord;
  if (isObj(raw) && raw["forge"] === LAYOUT_VERSION) {
    const layout = parseLayout(text);
    attachCarry(layout, raw);
    const dup = duplicateId(explicitIds(layout));
    if (dup) throw new Error(`not a forge layout: duplicate id ${dup}`);
    record = recordOfLayout(layout, options.name ?? "Layout");
  } else {
    const why = checkCreatorRecord(raw, options);
    if (why) throw new Error(`not a forge layout: ${why}`);
    const r = raw as unknown as AnyLayoutRecord;
    record = isV2(r) ? recordOfLayout(layoutOfRecord(r), r.name) : json(r);
  }
  const why = checkCreatorRecord(record, options);
  if (why) throw new Error(`not a forge layout: ${why}`);
  return { record, warnings: carryWarnings(record), missing: missingPackRefs(record.requires ?? [], options.available ?? []) };
}

/**
 * The online policy (H273, H274): a lobby plays the disc's own content, so a record that needs a creator pack, stands on
 * an authored map or names a creator mode is refused online -- while the same record reads, edits and plays locally
 * (H275). Empty: admitted. A share code and an account row carry the references only, never a pack's bytes (H276).
 */
export function onlineRecordRefusal(r: CreatorLayoutRecord): Diagnostic[] {
  // FP-1a (main): every placed kind the online room composes is admitted. The kinds the room does not compose -- a map
  // objective taken out, a switch, a damage trigger on a prop, a crane (the Forge branch's own) -- still play locally only.
  return [...onlineRefusal(r.requires ?? [], r.mode, r.contentBase),
    ...placedRefusal(RECORD_CODES.onlineHiddenData, "hiddenData", r.hiddenData?.length ?? 0, "objectives (this layout takes some of the map's out)"),
    ...placedRefusal(RECORD_CODES.onlineSwitches, "switches", r.switches?.length ?? 0, "switches"),
    ...placedRefusal(RECORD_CODES.onlineTriggers, "triggers", r.triggers?.length ?? 0, "damage triggers on props"),
    ...placedRefusal(RECORD_CODES.onlineObjects, "objects", r.objects?.filter((o) => o[0] !== "ambient").length ?? 0, "cranes")];
}

/** A placed kind the online room does not compose (a browser adaptation) plays locally only. */
function placedRefusal(code: string, field: string, count: number, words: string): Diagnostic[] {
  return count ? [diagnostic({
    source: "check", severity: "error", code, field, actual: String(count),
    text: `An online lobby plays the disc's own ${words}: this layout places its own. Play it locally.`,
  })] : [];
}

/**
 * The same online policy over a parsed layout file (`parseLayout`), for a server that holds a `Layout` (central's forge
 * lobby create and its restart, the match host's forge process) -- the one body the record's policy shares
 * (`onlineRefusal`): refused for an authored map's base (`record.ONLINE_CONTENT_MAP`, FCW-10), for every pack the layout
 * needs -- the base's, any a piece's `content` names, any it declares (`requires`) -- and for any creator `mode`.
 * Empty: admitted. A retail layout with no pack and no mode is admitted as before.
 */
export function onlineCreatorLayoutRefusal(l: Layout | ContentLayout): Diagnostic[] {
  const map = isContentLayoutBase(l.base) ? l.base : null;
  const packs = sortPackRefs([...(l.requires ?? []), ...(map ? [map.ref] : []), ...l.pieces.flatMap((p) => (p.content ? [p.content.pack] : []))]);
  // FP-1a (main): the placed kinds the room composes admitted; the branch's own kinds it does not, refused (as the record's).
  return [...onlineRefusal(packs, l.mode, map ? { ref: map.ref, mapId: map.mapId } : undefined),
    ...placedRefusal(RECORD_CODES.onlineHiddenData, "hiddenData", l.hiddenData?.length ?? 0, "objectives (this layout takes some of the map's out)"),
    ...placedRefusal(RECORD_CODES.onlineSwitches, "switches", l.switches?.length ?? 0, "switches"),
    ...placedRefusal(RECORD_CODES.onlineTriggers, "triggers", l.triggers?.length ?? 0, "damage triggers on props"),
    // An ambient effect plays online (the owner, 2026-11-10: "make it ... such that they will load in online games"): the
    // disc's own program and sounds, each page drawing and sounding it from its own disc, nothing of the room's; a crane not.
    ...placedRefusal(RECORD_CODES.onlineObjects, "objects", l.objects?.filter((o) => o.kind !== "ambient").length ?? 0, "cranes")];
}

/** FCW-07a's name for the layout's online policy: `onlineCreatorLayoutRefusal`, the one body (a content base refused too). */
export function onlineLayoutRefusal(l: Layout): Diagnostic[] {
  return onlineCreatorLayoutRefusal(l);
}

function onlineRefusal(requires: readonly PackRef[], mode: RecordMode | undefined, map?: RecordContentBase): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (map) {
    out.push(diagnostic({
      source: "check", severity: "error", code: RECORD_CODES.onlineContentMap, field: "base", actual: `${packRefKey(map.ref)}/${map.mapId}`,
      text: "An online lobby plays the disc's own maps: this layout stands on an authored map. Play it locally.",
    }));
  }
  if (requires.length) {
    out.push(diagnostic({
      source: "check", severity: "error", code: RECORD_CODES.onlinePacks, field: "requires", actual: requires.map(packRefKey).join(", "),
      text: "An online lobby plays the disc's own content: this layout needs creator packs. Play it locally.",
    }));
  }
  if (mode) {
    out.push(diagnostic({
      source: "check", severity: "error", code: RECORD_CODES.onlineMode, field: "mode", actual: `${mode.id}@${mode.version}`,
      text: "An online lobby plays the disc's own game types: this layout names a creator mode. Play it locally.",
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// FCW-30: the mode catalogue -- `RecordMode` from installed rules packs (spec 2026-10-27 §7), as data and pure
// functions. No caller is wired (FCW-32 passes it to `checkCreatorRecord`'s `modes` and the Forge's mode list).
// ---------------------------------------------------------------------------------------------------------------------

/** An installed rules pack: its reference and one rules member's parsed JSON (`RulesSpec` once it validates). */
export interface InstalledRulesPack {
  readonly ref: PackRef;
  readonly spec: unknown;
}
/** A mode a rules pack offers: the spec's id, the pack's version, the pack, the spec's name, and its params' check. */
export interface RulesModeEntry extends ModeCatalogueEntry {
  readonly pack: PackRef;
  readonly name: string;
  check(params: Readonly<Record<string, unknown>>): string | null;
}
export interface RulesModeCatalogue {
  readonly modes: readonly RulesModeEntry[];
  /** The packs not offered, with why: a spec that does not validate, or a second pack of one mode id and version. */
  readonly refused: readonly { readonly ref: PackRef; readonly report: CheckReport }[];
}

/**
 * The modes the installed rules packs offer, in their order: each spec validated against `catalogue` (`validateRules`);
 * a passing one is a mode `{id: spec.id, version: ref.version}` whose params are checked against its configuration
 * (`checkRulesParams`). The first pack of a mode id and version wins; a later one is refused (`rules.DUPLICATE_ID`).
 */
export function rulesModeCatalogue(installed: readonly InstalledRulesPack[], catalogue: RulesCatalogue = rulesCatalogue()): RulesModeCatalogue {
  const modes: RulesModeEntry[] = [];
  const refused: { ref: PackRef; report: CheckReport }[] = [];
  for (const { ref, spec } of installed) {
    const report = validateRules(spec, catalogue);
    if (report.status !== "pass") { refused.push({ ref, report }); continue; }
    const s = spec as RulesSpec;
    if (modes.some((m) => m.id === s.id && m.version === ref.version)) {
      refused.push({
        ref, report: checkReport([diagnostic({
          source: "pack", severity: "error", code: RULES_CODES.duplicateId, field: "id", actual: `${s.id}@${ref.version}`,
          text: `Another installed pack already offers the mode ${s.id}@${ref.version}.`,
        })], { evidence: "validation" }),
      });
      continue;
    }
    const copy = json(s);
    modes.push({ id: copy.id, version: ref.version, pack: { id: ref.id, version: ref.version, hash: ref.hash }, name: copy.name, check: (params) => checkRulesParams(copy, params) });
  }
  return { modes, refused };
}

/** One choice in the Forge's mode list: a retail game type (the layout's `objectives.gameType`) or a rules mode (`mode`). */
export type ForgeModeChoice =
  | { readonly kind: "retail"; readonly gameType: ForgeGameType }
  | { readonly kind: "rules"; readonly id: string; readonly version: string; readonly name: string; readonly pack: PackRef };

/** The Forge's mode list (spec §7): the retail types (`FORGE_GAME_TYPES`, in order), then the installed rules modes. */
export function forgeModeChoices(modes: readonly RulesModeEntry[]): ForgeModeChoice[] {
  return [
    ...FORGE_GAME_TYPES.map((gameType): ForgeModeChoice => ({ kind: "retail", gameType })),
    ...modes.map((m): ForgeModeChoice => ({ kind: "rules", id: m.id, version: m.version, name: m.name, pack: { id: m.pack.id, version: m.pack.version, hash: m.pack.hash } })),
  ];
}
