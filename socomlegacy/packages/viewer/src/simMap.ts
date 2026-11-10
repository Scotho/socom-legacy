import { hasCharacterLibraries, loadCharacterCatalogue } from './characters/inventory';
import { allMapsSwitch } from '../../match/src/botGates';
import type { CharacterCatalogue } from './characters/catalogue';
import { victoryFromBytes } from './victoryData';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type AssetSource, type RdrNode, type ZdbEntry } from '@s2u/archive';
import {
  aiCellCentre, applyR0004MapPatch, aiCellIndex, aiCellY, ARMORY_TYPES_PER_SIDE, characterModelNames, collisionOwners, DEFAULT_GRID_PARAMS, namedPoint, parseAiMaps, parseCharacterTable,
  parseEscortees, parseGridParams, parseSceneGraph, parseWorldRoot, placeEscortees, placeSpawnSlots, readSkeleton, readTurrets, spawnsFor, teamCharacter, worldCollision,
  type AiMaps, type EscorteeStart, type CharacterTable, type GameType, type SceneNode, type TurretPlacement, type Grid, type MotionClip, type Skeleton, type SpawnSlot, type Spawns, type CharacterTeam,
} from '@s2u/scene';
import { actionRoots, ACTION_CLIPS, groundGrid, HOLD_CODES, packGround, type GroundData, type Stance } from './mover';
import { CIV_ANIMS, SEAL_ANIMS } from './locomotion';
import { clipsFromPack, motionTableFromArchive, MOTION_PACK_PATH, type MotionEntry } from './motionTable';
import { leanClip, TRAVERSAL_CLIPS } from './traversal';
import { TURRET_CLIPS } from './net/emplacement';
import { FLINCH_CLIPS } from './net/deaths';
import { HIT_POSE_CLIPS, type HitMotion } from './net/hitPose';
import { ALL_RELOAD_CLIPS } from './reloadClip';
import { DOOR_CLIPS, readDoors, type DoorSpec } from './doors';
import { readGates, type GateSpec } from './gates';
import { readCranes, type CraneSpec } from './cranes';
import { readMapMeta, type MapMeta } from './mapMeta';
import { kitTurretDefs, type KitSource } from './loadout';

/**
 * A map as the shared sim needs it (web sprint 3, M2; spec W3.R6: the server loads only the hulls, the tuning and the
 * weapon records, from a private path): the probe's hull (`GroundData`, the same polygons, nodes and `grid_params`
 * `./loadMap` packs for the page's walk), its grid, the map's shown name, its measured spawns and its `AIMAPS.MPS` spawn
 * slots on the probe's floor. No textures, no meshes: a Node server holds all 22 maps in a few tens of megabytes.
 */
export interface SimMap {
  /** Authored bot extension FBA.R10: optional regional metadata, no meshes or textures. */
  characters?: CharacterCatalogue;
  victory?: import('./victoryData').VictoryData;
  /** The archive's stem (`MP2`). */
  stem: string;
  /** `READERM.ZAR/mission.rdr`'s `description` (`FROSTFIRE`), or the stem. */
  name: string;
  ground: GroundData;
  grid: Grid;
  /** The two measured spawns (`@s2u/scene` `spawns.ts`), when the map is one of the 22. */
  spawns: Spawns | null;
  /** `AIMAPS.MPS`'s spawn slots, side 0 (A) and side 1 (B), each on the probe's floor (research 75). */
  slots: SpawnSlot[];
  /** Its twin records: where a SEAL respawns (research 91 section 4, `FUN_002b7ee0`), placed the same way. */
  respawns: SpawnSlot[];
  /**
   * DOORS (`./doors`, socomlegacy/docs/research/92-doors.md): the map's doors, their polygons marked in `ground.owners`
   * (`sweep`) so the server's movers read them as they swing. Absent on a map built by hand without them.
   */
  doors?: DoorSpec[];
  /**
   * MAP-07 (`./gates`, research 174 §5, 175 §5.3): Death Trap's and Enowapi's lever gates, their polygons marked in
   * `ground.owners` (`sweep`) so the server's movers read them as they slide. Absent on a map built by hand without them.
   * The Chain Reaction crane is not one of these.
   */
  gates?: GateSpec[];
  /**
   * Chain Reaction's three hooks (`./cranes`, research 176 §9). Their polygons are marked in `ground.owners`
   * (`sweep`) so a mover reads the hook where it is. Empty on every other map.
   */
  cranes?: CraneSpec[];
  /**
   * The world root's `DefaultMaterial` (`@s2u/scene` `parseWorldRoot`): the material a hull polygon's byte 0 stands for
   * (`FUN_002dc1d0`), so the room's cast (`match/src/room.ts`) reads byte 0 as the page's does (`./grenade`,
   * `./grenadeAssets`). Absent or '' on a map built by hand: byte 0 reads `UNKNOWN` (`surfaceMaterial`).
   */
  defaultMaterial?: string;
  /**
   * MAP-01 (`./mapMeta`, research 209): the map's typed metadata -- every action record on its node, every placed
   * node's instance id (PF.R15), zAnim's initial state -- the page's `LoadedMap.meta` read the same way. Absent on a
   * map built by hand.
   */
  meta?: MapMeta;
  /**
   * PF-12: the map's game type, `READERC.ZAR/missionlist.rdr`'s TYPE (`@s2u/scene` `parseMissionList`; research 192 s1):
   * the room's rules follow it (`./net/rules` `modeRules`). Set by the server, which holds READERC; absent (a map built
   * by hand, or no list read): SUPPRESSION's rules.
   */
  gameType?: GameType;
  /**
   * MAP-10a (`@s2u/scene` `readTurrets`, research 215): the map's placed manual turrets -- each one's definition, parts,
   * limits and ammunition -- read through the kit source's `READERC.ZAR` and `ZWEAPON.ZAR` (`simMapFromBytes`'s `kits`,
   * the server's start-up read). Absent without the kit source or on a map with none (MP2, MP6).
   */
  turrets?: TurretPlacement[];
  /**
   * XR-05 (`bombStartOf`; research 173 s2, 214 s1): DEMOLITION's StartBomb -- the AI maps' named point's cell centre at the
   * cell's quantised height (`BOMB_GROUND_READING`). Absent on a map without the point or a map built by hand.
   */
  bombStart?: [number, number, number];
  /**
   * HX-0b (research 237 s1): the parsed `AIMAPS.MPS` (`@s2u/scene` `parseAiMaps`, research 75) -- its zones (EXTRACTION's
   * kind-1 `Safety`, `zonesOfKind`, `zoneContains`) and named points (the hostages' starts) for the room's modes. Read only:
   * a room's fork (`match/src/server.ts` `forkSimMap`) shares it by reference. Absent when the file will not read (a note)
   * or on a map built by hand. Desert Glory's: 171,424 bytes on disc, nine sub-maps, 13,547 stored cells.
   */
  ai?: AiMaps;
  /**
   * HX-0b (research 237 s1): the map's escortees off `READERM.ZAR/vehicles.rdr` (`@s2u/scene` `parseEscortees`) at their
   * named points' cells (`placeEscortees`): Desert Glory's three hostages. Always read; the room uses them on EXTRACTION
   * and ESCORT only (game types 4 and 3). Absent on a map with none (every record a player's) or without the AI maps.
   */
  escortees?: EscorteeStart[];
  /** What went wrong on the way (a missing member costs a line, never the load, except the hull's). */
  notes: string[];
}

const WORLD_MODEL = 'worldmodel';
const say = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const stemOf = (path: string): string => path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase();

/**
 * Reads a map archive's hull and spawns. Throws when the scene graph or its collision will not read: no hull, no round.
 * With `kits` (`./loadout` `loadKitSource`: the server's `ZWEAPON.ZAR` and `READERC.ZAR`), the map's turrets too (MAP-10a).
 */
export function simMapFromBytes(bytes: Uint8Array, path: string, kits: KitSource | null = null): SimMap {
  const notes: string[] = [];
  const toc = parseZdb(bytes);
  const stem = stemOf(path);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  applyR0004MapPatch(models, stem);   // R4B-09 (research 383): r0004's per-map collision, as the page's `place` does
  const polys = worldCollision(models, WORLD_MODEL);
  let params = DEFAULT_GRID_PARAMS;
  try {
    params = parseGridParams(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`)));
  } catch (e) {
    notes.push(`grid_params: ${say(e)} -- the engine's default grid`);
  }
  let defaultMaterial = '';
  try {
    defaultMaterial = parseWorldRoot(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`))).defaultMaterial;
  } catch (e) {
    notes.push(`DefaultMaterial: ${say(e)} -- a polygon's material byte 0 reads UNKNOWN`);
  }
  const owners = collisionOwners(models, WORLD_MODEL);
  const { doors, diagnostics } = readDoors(bytes, toc, models, owners, polys);   // marks the doors' owners: before the pack
  const gatesRead = readGates(bytes, toc, stem, models, owners, polys);          // MAP-07: the gates' owners, before the pack
  notes.push(...diagnostics, ...gatesRead.diagnostics);
  const cranesRead = readCranes(bytes, toc, models, owners, polys);   // marks the hooks' owners: before the pack
  notes.push(...cranesRead.diagnostics);
  const ground = packGround(params, polys, owners);
  const grid = groundGrid(ground);
  const name = missionName(bytes, toc, notes) ?? stem;
  const spawns = spawnsFor(name) ?? null;
  let slots: SpawnSlot[] = [], respawns: SpawnSlot[] = [];
  let bombStart: [number, number, number] | undefined;
  let ai: AiMaps | undefined;
  try {
    ai = parseAiMaps(zdbMember(bytes, toc, 'AIMAPS.MPS'));
    slots = placeSpawnSlots(ai, spawns ?? undefined, grid);
    respawns = placeSpawnSlots(ai, spawns ?? undefined, grid, true);
    bombStart = bombStartOf(ai);
  } catch (e) {
    notes.push(`spawn slots: ${say(e)}`);
  }
  const escortees = ai ? mapEscortees(bytes, toc, ai, (line) => notes.push(line)) : undefined;
  const meta = readMapMeta(bytes, toc, stem, models);
  notes.push(...meta.diagnostics);
  const turrets = mapTurrets(bytes, stem, kits, (line) => notes.push(line), models);
  // SUP-03: C4's targets are the scene's destructibles (`meta.scene`, `./sceneHealth`), not the type-less actions.
  return {
    victory: victoryFromBytes(bytes, kits?.readerc ?? null),
    stem, name, ground, grid, spawns, slots, respawns, doors, gates: gatesRead.gates, cranes: cranesRead.cranes, meta, notes, defaultMaterial, ...(turrets ? { turrets } : {}),
    ...(bombStart ? { bombStart } : {}), ...(ai ? { ai } : {}), ...(escortees ? { escortees } : {}),
  };
}

/**
 * HX-0b (research 237 s1): a map's escortees placed -- `READERM.ZAR/vehicles.rdr`'s escortee records (`parseEscortees`) at
 * their named points (`placeEscortees`). Undefined on a map with none; a read that fails, or a record not placed, costs a
 * note, never the load.
 */
export function mapEscortees(bytes: Uint8Array, toc: ZdbEntry[], ai: AiMaps, note: (line: string) => void): EscorteeStart[] | undefined {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const entry = readerm.root.children.find((k) => k.name.toLowerCase() === 'vehicles.rdr');
    if (!entry) return undefined;
    const starts = placeEscortees(parseEscortees(parseRdr(readerm.data(entry))), ai, note);
    return starts.length ? starts : undefined;
  } catch (e) {
    note(`escortees: ${say(e)}`);
    return undefined;
  }
}

/**
 * XR-05: DEMOLITION's StartBomb off the AI maps (research 173 s2; `FUN_002c1a80` D:L163839 asks `FUN_0052db70` for the
 * named point, `FUN_0052d480` turns its cell into XYZ): the point spelled `StartBomb`, `startBomb` or `startbomb`
 * (`namedPoint` is case-blind), in the sub-map its loc names (MP83's is sub-map 1, `Cats`: never a highest-floor
 * lookup), its cell's centre and the cell word's quantised height (`aiCellY`, `FUN_00516940` D:L385086) -- without
 * the optional `FUN_00516920` correction (`BOMB_GROUND_READING`). MP72: (1279.762, 47.334, 1446.111). Undefined when
 * the map has no such point or its cell is not stored.
 */
export function bombStartOf(ai: AiMaps): [number, number, number] | undefined {
  const found = namedPoint(ai, 'StartBomb');
  if (!found) return undefined;
  const { loc } = found.point;
  const sub = ai.maps[loc.map] ?? found.sub;
  const i = aiCellIndex(sub, loc.x, loc.z);
  if (i < 0) return undefined;
  const [x, z] = aiCellCentre(sub, loc.x, loc.z);
  return [x, aiCellY(sub, sub.cells[i]!), z];
}

/**
 * MAP-10a (research 215 s1): a map's placed manual turrets through a kit source -- `ai_turrets.rdr` off its READERC
 * (`./loadout` `kitTurretDefs`, parsed once a source), the ammunition off its arsenal -- the server's parse and the page's
 * `loadMap` alike. Undefined without the kit source, without the definitions, on a map with none, or when the read fails
 * (a note: the map still loads). A definition match without its parts (Frostfire's four `tank1`) is the disc's data, not a
 * fault: it costs no note (research 215 s2 lists them), so Frostfire's diagnostics stay empty.
 */
export function mapTurrets(bytes: Uint8Array, stem: string, kits: KitSource | null, note: (line: string) => void,
  models?: SceneNode[]): TurretPlacement[] | undefined {
  const defs = kitTurretDefs(kits);
  if (!kits || !defs) return undefined;
  try {
    const list = readTurrets(bytes, stem, defs, kits.table.arsenal, () => {}, models, note);
    return list.length ? list : undefined;
  } catch (e) {
    note(`turrets: ${say(e)}`);
    return undefined;
  }
}

export async function loadSimMap(source: AssetSource, path: string, kits: KitSource | null = null): Promise<SimMap> {
  return simMapFromBytes(await source.read(path), path, kits);
}

function missionName(bytes: Uint8Array, toc: ZdbEntry[], notes: string[]): string | null {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const mission = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
    if (!mission) return null;
    const name = rdrGet(parseRdr(readerm.data(mission)), 'description');
    return typeof name === 'string' ? name : null;
  } catch (e) {
    notes.push(`mission name: ${say(e)}`);
    return null;
  }
}

/**
 * The clips the sim reads: the mover's action clips (their root motion), the traversal moves', the eight reload clips
 * (`./reloadClip`: the room locks a weapon for its reload clip's `playback`, as the page's reload runs), the turret's
 * mount clips (`./net/emplacement` `mountShape`: the seat's steer) and the flinches (`./net/deaths` `FLINCH_CLIPS`: the
 * room's flinch window, PAR-58), with the table.
 */
export interface SimClips {
  clips: MotionClip[];
  table: Map<string, MotionEntry> | null;
  /** `actionRoots(clips)`: what `Walker.actionRoots` takes. */
  roots: Map<string, Float32Array>;
}

/** Every clip name the sim asks the pack for. */
export const SIM_CLIPS: readonly string[] = [
  ...new Set([
    ...Object.keys(ACTION_CLIPS).map((k) => SEAL_ANIMS[k as keyof typeof ACTION_CLIPS]), ...HOLD_CODES, ...TRAVERSAL_CLIPS, ...ALL_RELOAD_CLIPS,
    ...TURRET_CLIPS,                                 // MAP-10b: the mount's steer reads its clip's root (`SeatSteer`)
    ...FLINCH_CLIPS,                                 // PAR-58: the room's flinch window ends at the clip's one-shot end (its keys)
    ...DOOR_CLIPS,                                   // #485: the door clip's window from its keys and motion.rdr row
  ]),
];

/** `MOTION_P.ZAR`'s sim clips and `READERC.ZAR`'s `motion.rdr` (null when it will not read). */
export function simClipsFromBytes(motionPack: Uint8Array, readerc: Uint8Array | null): SimClips {
  const clips = clipsFromPack(motionPack, SIM_CLIPS);
  let table: Map<string, MotionEntry> | null = null;
  if (readerc) {
    try { table = motionTableFromArchive(readerc); } catch { table = null; }
  }
  return { clips, table, roots: actionRoots(clips) };
}

export async function loadSimClips(source: AssetSource): Promise<SimClips> {
  let readerc: Uint8Array | null = null;
  try { readerc = await source.read('RUN/READERC.ZAR'); } catch { readerc = null; }
  return simClipsFromBytes(await source.read(MOTION_PACK_PATH), readerc);
}

/**
 * The SEAL's skeleton as the server's hit volumes need it (web sprint 3, M6; research 91 section 1.3): the map's first
 * `navyseals` character's model (`READERM.ZAR/chartype.rdr` through `READERC.ZAR/character.rdr`, as `./body` `loadBody`
 * picks it), its skeleton out of `CLIB_GEO.ZED`, and the three stance idles out of `MOTION_P.ZAR`. No meshes, no
 * textures. The Terrorist models of the 22 maps carry the same 26 bone names in the same order (`al_gman01` on
 * Frostfire, `test/hitVolumes.test.ts`); since 2026-09-30 each side's own index-0 character is read (`team`
 * 'terrorists' the map's first Terrorist, as `./body` `loadBody` picks the page's), and since web sprint 5 S2 each of
 * the side's four ARMORY types (`simSkeletonsFromBytes`): the room picks a player's volumes by its body's type.
 */
export interface SimSkeleton {
  /** `seal_A_scuba` on Frostfire. */
  model: string;
  /** The `character.rdr` character (`mp2_seal1`), or null when the table did not read. */
  character: string | null;
  skeleton: Skeleton;
  /** The idle each posture stands in (`SEAL_ANIMS` stand, crouch, prone); null when the pack lacks it. */
  idles: Record<Stance, MotionClip | null>;
  /**
   * LEAN-HIT (issue #752; research 217 s3.6): each posture's two lean clips, `seal_<stance>2<l|r>lean` (`./traversal`
   * `leanClip`), the full-body clip `FUN_0057d810` (D:L440437-440510) pushes and holds on its last key -- the hit
   * volumes' pose under a held peek (`./net/hitVolumes` `stanceVolumes`). Null where the pack lacks one; a hostage's all
   * null (it never peeks).
   */
  leans: LeanClips;
  /**
   * HIT-POSE (research 217 s3.6): the motion the room poses the body's live skeleton with (`./net/hitPose`: the clips a
   * page's copy plays, `HIT_POSE_CLIPS`, and `motion.rdr`'s table), one object a map, shared by its skeletons. Absent
   * without `READERC.ZAR`'s table or `MOTION_P.ZAR` (a hostage's too: its body stays on its idles) -- the room then
   * keeps the idle sets (`idles`, `leans`), and without a skeleton the placeholder capsules.
   */
  motion?: HitMotion;
  notes: string[];
}

/** LEAN-HIT: a posture's left and right lean clips, each posture's. */
export type LeanClips = Record<Stance, { l: MotionClip | null; r: MotionClip | null }>;
const noLeans = (): LeanClips => ({ stand: { l: null, r: null }, crouch: { l: null, r: null }, prone: { l: null, r: null } });
const STANCES: readonly Stance[] = ['stand', 'crouch', 'prone'];

/** The SEAL model `./body` falls back to (W2.R4), and a LOD copy's suffix (`_1`, `_2`). */
const SEAL_FALLBACK = 'seal_A_scuba', LOD_COPY = /_\d+$/;
export const IDLE_CLIPS: Readonly<Record<Stance, string>> = { stand: SEAL_ANIMS.stand, crouch: SEAL_ANIMS.crouch, prone: SEAL_ANIMS.prone };
/**
 * HX-2 (web sprint 31; research 238 §1): the idles a hostage stands in, the No_weapon set's (`../locomotion` `CIV_ANIMS`):
 * `civ_stand`, `civ_crouch`, and no prone -- the set has no Prone entry (189 #13), so a prone hostage's capsules would be
 * the bind pose's (the AI never lays one down: 199 §9).
 */
export const ESCORTEE_IDLE_CLIPS: Readonly<Record<Stance, string | null>> = { stand: CIV_ANIMS.stand, crouch: CIV_ANIMS.crouch, prone: null };

/** What the skeleton readers share for one map: its libraries, its type table and the idles, each read once. */
interface SkeletonSource {
  geo: Zar;
  /** `READERM.ZAR/chartype.rdr` and `READERC.ZAR/character.rdr`, parsed; null when either will not read. */
  chartype: RdrNode | null;
  table: CharacterTable | null;
  idles: Record<Stance, MotionClip | null>;
  /** LEAN-HIT: the six lean clips (`SimSkeleton.leans`). */
  leans: LeanClips;
  /** HX-2: the hostages' idles (`ESCORTEE_IDLE_CLIPS`), read only when the map lists escortees. */
  escorteeIdles: Record<Stance, MotionClip | null>;
  /** HIT-POSE: the players' motion (`SimSkeleton.motion`), null without the table or the pack. */
  motion: HitMotion | null;
  /** The lines every skeleton of the map carries (a missing table, a missing idle). */
  notes: string[];
}

function skeletonSource(bytes: Uint8Array, readerc: Uint8Array | null, motionPack: Uint8Array | null,
  note: (line: string) => void): SkeletonSource | null {
  const notes: string[] = [];
  const keep = (line: string): void => { notes.push(line); note(line); };
  let toc: ZdbEntry[], geo: Zar;
  try {
    toc = parseZdb(bytes);
    geo = Zar.parse(zdbMember(bytes, toc, 'CLIB_GEO.ZED'));
  } catch (e) {
    note(`skeleton: ${say(e)}`);
    return null;
  }
  let chartype: RdrNode | null = null, table: CharacterTable | null = null;
  try {
    if (readerc) {
      const rc = Zar.parse(readerc);
      const key = rc.root.children.find((k) => k.name.toLowerCase() === 'character.rdr');
      const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
      const ct = readerm.root.children.find((k) => k.name.toLowerCase() === 'chartype.rdr');
      if (key && ct) {
        chartype = parseRdr(readerm.data(ct));
        table = parseCharacterTable(parseRdr(rc.data(key)));
      }
    }
  } catch (e) {
    keep(`character table: ${say(e)}`);
  }
  const idles: Record<Stance, MotionClip | null> = { stand: null, crouch: null, prone: null };
  const escorteeIdles: Record<Stance, MotionClip | null> = { stand: null, crouch: null, prone: null };
  const leans = noLeans();
  const escortees = chartype !== null && teamCharacter(chartype, 'escortees', 0) !== null;
  let motion: HitMotion | null = null;
  if (motionPack) {
    try {
      const civ = escortees ? Object.values(ESCORTEE_IDLE_CLIPS).filter((n): n is string => n !== null) : [];
      const leanNames = STANCES.flatMap((k) => [leanClip(k, -1), leanClip(k, 1)]);
      // HIT-POSE: with `motion.rdr`'s table, every clip a page's copy plays (the idles and the leans among them), once.
      let motionTable: Map<string, MotionEntry> | null = null;
      if (readerc) {
        try { motionTable = motionTableFromArchive(readerc); } catch (e) { keep(`motion table: ${say(e)}`); }
      }
      const clips = clipsFromPack(motionPack, [...new Set([...Object.values(IDLE_CLIPS), ...civ, ...leanNames, ...(motionTable ? HIT_POSE_CLIPS : [])])]);
      if (motionTable) motion = { clips: clips.filter((c) => HIT_POSE_CLIPS.includes(c.name)), table: motionTable };
      for (const k of Object.keys(IDLE_CLIPS) as Stance[]) idles[k] = clips.find((c) => c.name === IDLE_CLIPS[k]) ?? null;
      for (const k of STANCES) leans[k] = { l: clips.find((c) => c.name === leanClip(k, -1)) ?? null, r: clips.find((c) => c.name === leanClip(k, 1)) ?? null };
      if (escortees) for (const k of Object.keys(ESCORTEE_IDLE_CLIPS) as Stance[]) escorteeIdles[k] = clips.find((c) => c.name === ESCORTEE_IDLE_CLIPS[k]) ?? null;
    } catch (e) {
      keep(`idle clips: ${say(e)}`);
    }
  }
  for (const k of Object.keys(idles) as Stance[]) if (!idles[k]) keep(`no ${IDLE_CLIPS[k]}: ${k} stands in the bind pose`);
  for (const k of STANCES) for (const side of [-1, 1] as const) {
    if (!leans[k][side < 0 ? 'l' : 'r']) keep(`no ${leanClip(k, side)}: a ${k} peek is hit at the idle`);
  }
  if (escortees) for (const k of Object.keys(escorteeIdles) as Stance[]) {
    const name = ESCORTEE_IDLE_CLIPS[k];
    if (name !== null && !escorteeIdles[k]) note(`no ${name}: a hostage ${k}s in the bind pose`);
  }
  return { geo, chartype, table, idles, leans, escorteeIdles, motion, notes };
}

/**
 * One type's skeleton off a map's shared source (`index` in the side's `chartype.rdr` list; HX-2: `escortees`, a hostage, at
 * the No_weapon set's idles); `models` shares by model.
 */
function typeSkeleton(src: SkeletonSource, team: CharacterTeam, index: number, note: (line: string) => void,
  models: Map<string, Skeleton> = new Map()): SimSkeleton | null {
  const character = src.chartype ? teamCharacter(src.chartype, team, index) : null;
  let model = character && src.table ? src.table.model(character) ?? null : null;
  // Only the SEAL's first falls back on a name: another type without its table entry is left to its side's first
  // (the room's `volumesOf`), the Terrorist to the SEAL's, a hostage to the first hostage's.
  if (!model && (team !== 'navyseals' || index !== 0)) { note(`skeleton: no ${team} character ${index + 1} in the tables`); return null; }
  if (!model) {
    const names = characterModelNames(src.geo);
    const seals = names.filter((n) => /^seal_/i.test(n) && !LOD_COPY.test(n));
    model = names.includes(SEAL_FALLBACK) ? SEAL_FALLBACK : seals.find((n) => /^seal_A/i.test(n)) ?? seals[0] ?? null;
  }
  if (!model) { note('skeleton: the character library holds no SEAL'); return null; }
  let skeleton = models.get(model);
  if (!skeleton) {
    try {
      skeleton = readSkeleton(src.geo, model);
    } catch (e) {
      note(`skeleton ${model}: ${say(e)}`);
      return null;
    }
    models.set(model, skeleton);
  }
  return {
    model, character, skeleton, idles: team === 'escortees' ? src.escorteeIdles : src.idles,
    leans: team === 'escortees' ? noLeans() : src.leans,
    ...(team !== 'escortees' && src.motion ? { motion: src.motion } : {}), notes: [...src.notes],
  };
}

/**
 * Reads a side's type's skeleton out of a map archive's bytes (`index` 0, SEAL 1 / TERRORIST 1, by default), with
 * `READERC.ZAR` and `MOTION_P.ZAR` (either may be null). Null, with a note, when the character library or its skeleton
 * will not read: the server falls back to the side's first, the SEAL's, or the placeholder.
 */
export function simSkeletonFromBytes(bytes: Uint8Array, readerc: Uint8Array | null, motionPack: Uint8Array | null,
  note: (line: string) => void = () => {}, team: 'navyseals' | 'terrorists' = 'navyseals', index = 0): SimSkeleton | null {
  const src = skeletonSource(bytes, readerc, motionPack, note);
  return src ? typeSkeleton(src, team, index, note) : null;
}

/**
 * Each side's four ARMORY types' skeletons (web sprint 5 S2), `chartype.rdr` order; null for one that did not read. HX-2
 * (research 238 §1): `escortees`, the map's hostages' (MP6's three; empty elsewhere), the room's hit volumes for them.
 */
export interface TypeSkeletons { catalogue?: CharacterCatalogue; seal: (SimSkeleton | null)[]; terrorist: (SimSkeleton | null)[]; escortees: (SimSkeleton | null)[] }

/**
 * Every type's skeleton of a map (web sprint 5 S2, research 95 §6): the four SEAL and four Terrorist columns, the map's
 * libraries and idles read once, a model shared by the types that name it (MP1's SEAL 1, 3 and 4 are all `seal_A_arc`).
 * The types' models carry the same 26 bones but their own bind poses and parts' boxes, so each is hit on its own
 * (`Room.volumesOf`). A side's list is as long as its `chartype.rdr` list, at most `ARMORY_TYPES_PER_SIDE`.
 */
export function simSkeletonsFromBytes(bytes: Uint8Array, readerc: Uint8Array | null, motionPack: Uint8Array | null,
  note: (line: string) => void = () => {}): TypeSkeletons {
  const src = skeletonSource(bytes, readerc, motionPack, note);
  if (!src) return { seal: [], terrorist: [], escortees: [] };
  const models = new Map<string, Skeleton>();
  const side = (team: 'navyseals' | 'terrorists'): (SimSkeleton | null)[] => {
    const out: (SimSkeleton | null)[] = [];
    for (let i = 0; i < ARMORY_TYPES_PER_SIDE; i++) {
      if (i > 0 && !(src.chartype && teamCharacter(src.chartype, team, i))) break;
      out.push(typeSkeleton(src, team, i, note, models));
    }
    return out;
  };
  // HX-2: every escortee entry the map lists (no ARMORY bound: MP6 lists three), a model shared as the sides' are.
  const escortees: (SimSkeleton | null)[] = [];
  for (let i = 0; src.chartype && teamCharacter(src.chartype, 'escortees', i); i++) escortees.push(typeSkeleton(src, 'escortees', i, note, models));
  return { seal: side('navyseals'), terrorist: side('terrorists'), escortees };
}

/** `simSkeletonFromBytes` off a source: the map, `READERC.ZAR` beside it and `MOTION_P.ZAR` (each optional but the map). */
export async function loadSimSkeleton(source: AssetSource, mapPath: string,
  team: 'navyseals' | 'terrorists' = 'navyseals', index = 0): Promise<SimSkeleton | null> {
  const [bytes, readerc, pack] = await skeletonBytes(source, mapPath);
  return simSkeletonFromBytes(bytes, readerc, pack, () => {}, team, index);
}

/**
 * `simSkeletonsFromBytes` off a source: every type's skeleton of the map (the match server's hit volumes). On a map a room
 * can give bots (`CHARACTER_LIBRARY_MAPS`, H314; every disc map under P537-L2's `CREATE_GAME_ALL_MAPS=1`, a developer's
 * test server: `hasCharacterLibraries` with `allMapsSwitch`) it carries the appearance catalogue the room names a bot's
 * look from; no regional skeleton is decoded -- the room hits a bot on its type's volumes (BTL.R4) -- and any other map
 * reads no character library at all (the area (c) re-read's finding 1).
 */
export async function loadSimSkeletons(source: AssetSource, mapPath: string): Promise<TypeSkeletons> {
  const [bytes, readerc, pack] = await skeletonBytes(source, mapPath);
  const native = simSkeletonsFromBytes(bytes, readerc, pack);
  if (!hasCharacterLibraries(mapPath.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase(), allMapsSwitch())) return native;
  const catalogue = await loadCharacterCatalogue(source, mapPath);
  if (!catalogue) return native;
  catalogue.multiplayerModels = {
    seal: native.seal.flatMap((b) => b ? [b.model] : []),
    terrorist: native.terrorist.flatMap((b) => b ? [b.model] : []),
  };
  return { ...native, catalogue };
}

async function skeletonBytes(source: AssetSource, mapPath: string): Promise<[Uint8Array, Uint8Array | null, Uint8Array | null]> {
  const optional = async (path: string): Promise<Uint8Array | null> => {
    try { return await source.read(path); } catch { return null; }
  };
  return Promise.all([source.read(mapPath), optional(mapPath.replace(/[^/]*$/, 'READERC.ZAR')), optional(MOTION_PACK_PATH)]);
}
