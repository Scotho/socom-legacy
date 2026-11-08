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
   * FG-21: the layout's NPCs -- each a seat of the offline match on `side`, as that side's character `type` of the map
   * (`LoadedMap.types`, protocol 9's), standing at `p` facing `yaw`. Hostile when on the side the player is not on.
   * Absent: none.
   */
  npcs?: NpcMarker[];
  /**
   * The layout's placed hostages (a browser adaptation, FG.R2; no original): each a place `p` facing `yaw`, added to the
   * base map's own escortees for an Escort or Extraction match (the Forge's Play). Absent: none. Online refused
   * (`onlineCreatorLayoutRefusal`): a lobby plays the disc's own escortees.
   */
  hostages?: HostageMarker[];
  /**
   * The layout's placed extraction zones (a browser adaptation, FG.R2; no original): each a named rectangle on the ground,
   * an EXTRACT_ZONE (AI-map kind 1) beside the map's own Safety zones for an Extraction match. Absent: none. Online
   * refused (`onlineCreatorLayoutRefusal`): a lobby plays the disc's own zones.
   */
  extractionZones?: ExtractionZone[];
  /**
   * The layout's placed tactical points (a browser adaptation, FG.R2): a name, a kind and a place, beside the map's own
   * AIMAPS named points on its tactical map -- kind 1 a nav point the compass marks by the name's first letter. Absent:
   * none. Online refused.
   */
  tacPoints?: TacPointMarker[];
  /**
   * The layout's placed respawn points (a browser adaptation, FG.R2; the owner, 2026-11-06): each a team, a place and a
   * yaw (radians) as a spawn's, beside the map's own respawn records (`LoadedMap.respawns`, research 91 section 4.2).
   * Absent: none. Online refused (`onlineCreatorLayoutRefusal`): a lobby plays the disc's own respawns.
   */
  respawns?: SpawnMarker[];
  /**
   * The layout's placed flares (a browser adaptation, FG.R2; the owner, 2026-11-06): each a copy of one of a disc map's
   * facade nodes -- a glow the engine turns to the camera, not the lamp it hangs on -- by its archive (`source`) and its
   * node's name (`name`), at `at`. Absent: none. Online refused (`onlineCreatorLayoutRefusal`).
   */
  flares?: FlareMarker[];
  /**
   * The layout's placed spectator views (a browser adaptation, FG.R2): a name, a camera place and its yaw and pitch
   * (degrees, the port's convention, as `mission.rdr`'s Scenic_Views), beside the map's own. Absent: none. Online refused.
   */
  scenicViews?: ScenicViewMarker[];
  /**
   * The layout's placed turrets (a browser adaptation, FG.R2): each a copy of a disc map's own manual turret -- its
   * archive (`source`) and placed node's name (`name`) -- stood at `at` facing `yaw` (radians), beside the map's own.
   * Absent: none. Online refused.
   */
  turrets?: TurretMarker[];
  /**
   * The layout's placed doors (a browser adaptation, FG.R2): each a copy of a disc map's own door -- its archive
   * (`source`) and node (`name`) -- its hinge at `at`, turned `yaw` radians from that door's own turn. Absent: none.
   * Online refused.
   */
  doors?: DoorMarker[];
  /**
   * The layout's placed gates and C4 barriers (a browser adaptation, FG.R2): each a copy of a disc map's own access
   * object -- its archive (`source`) and its root node (`name`, `access1`) -- at `at`, turned `yaw` radians. A gate slides
   * on its lever and C4 wrecks it; a barrier C4 wrecks. Absent: none. Online refused.
   */
  gates?: DoorMarker[];
  barriers?: DoorMarker[];
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

export interface LayoutSettings {
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
   * lens, rgb 0..255 and an alpha, as `LoadedMap.night` reads it; null, none). Absent or null, the built-from map's.
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
export const DEFAULT_SETTINGS: Readonly<LayoutSettings> = Object.freeze({ timeOfDay: null, light: 1, fogFar: null, players: 16, rounds: 11, roundSeconds: 360, friendlyFire: false, npcBehaviour: "patrol" });

/** The numeric fields' bounds (inclusive) and the step a slider or the pad moves them by. */
export const SETTINGS_BOUNDS = Object.freeze({
  timeOfDay: { min: 0, max: 1, step: 0.05 },
  light: { min: 0, max: 1, step: 0.05 },
  fogFar: { min: 100, max: 100000, step: 100 },
  players: { min: 2, max: 32, step: 2 },
  rounds: { min: 1, max: 11, step: 1 },
  roundSeconds: { min: 30, max: 3600, step: 30 },
} as const);

const SETTINGS_FIELDS = new Set(["timeOfDay", "light", "fogFar", "players", "rounds", "roundSeconds", "friendlyFire", "npcBehaviour", "lightRig", "fogColor", "shadowVector", "skyFrom", "fog", "night"]);

/** A night lens: rgb 0..255 and an alpha 0..1 (`settings.night.lens`). */
function settingsTriple4(v: unknown): [number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isNum) || v.slice(0, 3).some((n) => n < 0 || n > 255) || v[3] < 0 || v[3] > 1) {
    throw new Error("settings.night.lens is not rgb 0..255 and an alpha 0..1");
  }
  return [v[0], v[1], v[2], v[3]];
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
 * The v2/v3 record's position lattice: a coordinate is stored as a multiple of one tenth of a game unit
 * (`round(x * 10) / 10`), so a disc height on a half unit (42.5) stays. The catalogue binds the same lattice.
 */
export const RECORD_POSITION_DENOMINATOR = 10;

export type PieceRow = [asset: number, x: number, y: number, z: number, yaw: number, locked?: true];
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
  spawns: SpawnRow[];
  /** The rows' stable authored ids. */
  ids: RecordIds;
  hidden?: string[];
  /** The base map's own objectives the layout takes out (`Layout.hiddenData`), present only when it has some. */
  hiddenData?: string[];
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
/** A taken-out map objective's key (`Layout.hiddenData`): its kind and its name (a node, a hostage, a zone). */
const HIDDEN_DATA_KEY = /^(hostage|site|zone):[A-Za-z0-9_ .=\/-]{1,96}$|^bomb:start$|^(slot|respawn):[AB]\d{1,3}$/;

const V2_FIELDS = ["v", "name", "base", "assets", "pieces", "spawns", "hidden", "npcs", "settings", "camera", "missing", "objectives"];
const V3_FIELDS = ["schema", "version", "name", "base", "contentBase", "assets", "pieces", "spawns", "ids", "hidden", "npcs", "settings", "camera", "missing",
  "objectives", "requires", "mode", "legacyCarry", "hiddenData", "zones", "markers", "spawners", "hostages", "extractionZones", "tacPoints", "respawns", "flares", "scenicViews", "turrets", "doors", "gates", "barriers"];
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
  const pieces: PieceRow[] = l.pieces.map((p) => {
    const key = p.content ? `pack ${canonicalJson(p.content)}` : p.asset;
    let i = index.get(key);
    if (i === undefined) {
      i = assets.length;
      assets.push(p.content ? cloneContent(p.content) : p.asset);
      if (p.content) packs.push(p.content.pack);
      index.set(key, i);
    }
    const row: PieceRow = [i, tenth(p.m[12]!), tenth(p.m[13]!), tenth(p.m[14]!), wholeDeg(yawOf(p.m))];
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
    assets, pieces, spawns, ids,
  };
  if (l.hidden?.length) record.hidden = [...l.hidden];
  if (l.hiddenData?.length) record.hiddenData = [...l.hiddenData];
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
  const layout: Layout & Carry = {
    forge: LAYOUT_VERSION,
    base: baseOf(r.base, isV2(r) ? undefined : r.contentBase),
    pieces: r.pieces.map(([a, x, y, z, yaw, locked], i) => {
      const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
      const asset = r.assets[a]!;
      return {
        asset: typeof asset === "string" ? asset : contentAssetKey(asset),
        m: [n0(c), 0, n0(-s), 0, 0, 1, 0, 0, n0(s), 0, n0(c), 0, x, y, z, 1],
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
  if (r.settings && Object.keys(r.settings).length) layout.settings = { ...r.settings };
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
  const whyIds = idsError(r) ?? requiresError(r) ?? entityListsError(r, true) ?? entityIdsError(r);
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
  onlineHostages: "record.ONLINE_HOSTAGES",
  onlineExtractionZones: "record.ONLINE_EXTRACTION_ZONES",
  onlineTacticalPoints: "record.ONLINE_TACTICAL_POINTS",
  onlineRespawns: "record.ONLINE_RESPAWNS",
  onlineFlares: "record.ONLINE_FLARES",
  onlineHiddenData: "record.ONLINE_HIDDEN_DATA",
  onlineSpectatorViews: "record.ONLINE_SPECTATOR_VIEWS",
  onlineTurrets: "record.ONLINE_TURRETS",
  onlineDoors: "record.ONLINE_DOORS",
  onlineGates: "record.ONLINE_GATES",
  onlineBarriers: "record.ONLINE_BARRIERS",
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
  return [...onlineRefusal(r.requires ?? [], r.mode, r.contentBase), ...hostagesRefusal(r.hostages?.length ?? 0), ...zonesRefusal(r.extractionZones?.length ?? 0),
    ...placedRefusal(RECORD_CODES.onlineTacticalPoints, "tacPoints", r.tacPoints?.length ?? 0, "tactical points"),
    ...placedRefusal(RECORD_CODES.onlineRespawns, "respawns", r.respawns?.length ?? 0, "respawn points"),
    ...placedRefusal(RECORD_CODES.onlineFlares, "flares", r.flares?.length ?? 0, "flares"),
    ...placedRefusal(RECORD_CODES.onlineHiddenData, "hiddenData", r.hiddenData?.length ?? 0, "objectives (this layout takes some of the map's out)"),
    ...placedRefusal(RECORD_CODES.onlineSpectatorViews, "scenicViews", r.scenicViews?.length ?? 0, "spectator views"),
    ...placedRefusal(RECORD_CODES.onlineTurrets, "turrets", r.turrets?.length ?? 0, "turrets"),
    ...placedRefusal(RECORD_CODES.onlineDoors, "doors", r.doors?.length ?? 0, "doors"),
    ...placedRefusal(RECORD_CODES.onlineGates, "gates", r.gates?.length ?? 0, "gates"),
    ...placedRefusal(RECORD_CODES.onlineBarriers, "barriers", r.barriers?.length ?? 0, "C4 barriers")];
}

/** Placed tactical points or spectator views (a browser adaptation) play locally only: a lobby plays the disc's own. */
function placedRefusal(code: string, field: string, count: number, words: string): Diagnostic[] {
  return count ? [diagnostic({
    source: "check", severity: "error", code, field, actual: String(count),
    text: `An online lobby plays the disc's own ${words}: this layout places its own. Play it locally.`,
  })] : [];
}

/** Placed extraction zones (a browser adaptation) play locally only: a lobby's room plays the disc's own zones. */
function zonesRefusal(count: number): Diagnostic[] {
  return count ? [diagnostic({
    source: "check", severity: "error", code: RECORD_CODES.onlineExtractionZones, field: "extractionZones", actual: String(count),
    text: "An online lobby plays the disc's own extraction zones: this layout places its own. Play it locally.",
  })] : [];
}

/** Placed hostages (a browser adaptation) play locally only: a lobby's room plays the disc's own escortees. */
function hostagesRefusal(count: number): Diagnostic[] {
  return count ? [diagnostic({
    source: "check", severity: "error", code: RECORD_CODES.onlineHostages, field: "hostages", actual: String(count),
    text: "An online lobby plays the disc's own hostages: this layout places its own. Play it locally.",
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
  return [...onlineRefusal(packs, l.mode, map ? { ref: map.ref, mapId: map.mapId } : undefined), ...hostagesRefusal(l.hostages?.length ?? 0), ...zonesRefusal(l.extractionZones?.length ?? 0),
    ...placedRefusal(RECORD_CODES.onlineTacticalPoints, "tacPoints", l.tacPoints?.length ?? 0, "tactical points"),
    ...placedRefusal(RECORD_CODES.onlineRespawns, "respawns", l.respawns?.length ?? 0, "respawn points"),
    ...placedRefusal(RECORD_CODES.onlineFlares, "flares", l.flares?.length ?? 0, "flares"),
    ...placedRefusal(RECORD_CODES.onlineHiddenData, "hiddenData", l.hiddenData?.length ?? 0, "objectives (this layout takes some of the map's out)"),
    ...placedRefusal(RECORD_CODES.onlineSpectatorViews, "scenicViews", l.scenicViews?.length ?? 0, "spectator views"),
    ...placedRefusal(RECORD_CODES.onlineTurrets, "turrets", l.turrets?.length ?? 0, "turrets"),
    ...placedRefusal(RECORD_CODES.onlineDoors, "doors", l.doors?.length ?? 0, "doors"),
    ...placedRefusal(RECORD_CODES.onlineGates, "gates", l.gates?.length ?? 0, "gates"),
    ...placedRefusal(RECORD_CODES.onlineBarriers, "barriers", l.barriers?.length ?? 0, "C4 barriers")];
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
