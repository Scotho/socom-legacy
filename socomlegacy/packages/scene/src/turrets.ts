import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, zdbSlice, type RdrNode, type ZdbEntry } from '@s2u/archive';
import { parseSceneGraph, transformPoint, type SceneNode } from './sceneGraph';
import { flattenScene, type SceneInstance } from './buildScene';
import type { Arsenal } from './arsenal';
import type { V3 } from './projectile';

/**
 * The manual turrets' data (MAP-10a, web sprint 27; research 177 s2-s4, 173 s2, 215): `RUN/READERC.ZAR/ai_turrets.rdr`'s
 * definitions, the placed map nodes they bind to, each placement's three parts, its authored limits and its ammunition.
 * One read the page (`viewer/src/loadMap.ts`), the page's own room (`net/loopback`) and the match server share; the
 * room's authority (mount, aim, fire, release) is MAP-10b's and reads nothing here but this table.
 *
 * - **A definition** is one alternating `TURRET` name/record pair of the script, 0x19c bytes in the game's table, in the
 *   file's order (`FUN_003aaa90` D:L301346-301412); its record's keys are read by `FUN_003aad20` D:L301447-301773.
 * - **The match** is the first definition in file order whose whole name is a case-sensitive prefix of the placed node's
 *   name (`FUN_003aac40` D:L301416-301445 through `FUN_00199648`'s compare bounded by the template's length): never
 *   lower-cased, never the longest -- Enowapi's `mp62turret2` takes `mp62turret` (research 177 s2).
 * - **A placement** is a matched node, the outermost of a nest, with all three of its definition's `PARTS` beneath it
 *   (`FUN_003aa350` D:L301117-301237, `FUN_003a9a80` D:L300759-300893): a name match alone is no turret (Frostfire's four
 *   `tank1` match the campaign's `tank1` and have none of its T72 parts).
 * - **The parts** live in the embedded GEO libraries (`TURR_GEO`, `TLMG_GEO`, `TLRM_GEO`), not in the map's own graph:
 *   the placed root holds an instance (`RMG_turret`) whose prototype is a library model. `readTurrets` joins the
 *   libraries' prototypes to the map's by name, the map's first, as `tools/probe-map-turrets.ts` always did (research
 *   177 s2: the join's precedence among duplicate names is the probe's, not a recovered engine rule).
 */

/** The definition's name and each part's are copied into 0x20-byte fields, 31 bytes and a NUL (D:L301488-301490, D:L301521-301522). */
const NAME_BYTES = 0x1f;
/** The parser keeps at most three parts (`uVar16 < 3`, D:L301502): the turret, the gun and the firepoint, in that order. */
const PART_COUNT = 3;
/** `MOUNTABLE_RANGE` absent: 22, squared for the mount's distance test (D:L301643-301648). */
export const TURRET_MOUNT_RANGE_DEFAULT = 22;
/** `MOUNTABLE_ANGLE` absent: 45 degrees, kept as its cosine (D:L301649-301654). */
export const TURRET_MOUNT_ANGLE_DEFAULT = 45;
/** The parser's degrees-to-radians factor, as the ELF spells it (D:L301533-301539, D:L301653). */
const DEG_TO_RAD = 0.017453292;

/**
 * [reading] `RATES` YAW/PITCH (1.5 on every manual definition) are stored as written, no degree conversion beside the
 * limits' (D:L301542-301545): their unit -- radians a second or a step a frame -- is unread (no consumer traced). The data
 * layer keeps the raw number (`TurretDef.rates`); MAP-10b applies it as radians a second to the clamp's approach and
 * leaves the look itself unslowed (S27-DISPATCH s8). Owed: the consumer's read, or capture B 13 (both stops' timing).
 */
export const TURRET_RATE_UNITS_READING = 'rad/s' as const;

/**
 * [reading] `TEAM` (`TEAM (30)` on every manual definition) is read: `FUN_003aad20` takes the key at 0x3fc020 ("TEAM",
 * D:L301593-301597) and `FUN_00533c10` (D:L400719-400762) ORs `1 << n` for each listed n <= 31 into a mask at the definition's
 * +0x12c; `FUN_003a9a80` writes that mask onto the turret object's +200 (`FUN_0029ed10`, D:L300877) and ORs in bit 0x1b
 * (`FUN_0029ece0`, D:L300878) -- team 30 becomes `1 << 30 | 1 << 27`. The data layer records the list and the mask
 * (`TurretDef.team`); the mask's consumer -- a mount gate or a membership -- is unread, so it is applied nowhere: both
 * sides may mount (PF.R31). Owed: the +200 mask's reader, or capture B 13 (a SEAL and a Terrorist each mounting).
 */
export const TURRET_TEAM_READING = 'unapplied' as const;

/**
 * [reading] The mount test's vertical bound: `FUN_003a90c0` refuses a mount when the squared vertical separation exceeds
 * `DAT_003e0828` (D:L300487-300489), a constant the decompilation does not give. Null: unread, so no value is recorded and
 * MAP-10b's mount test does not apply it. Owed: the constant's bytes off the ELF, or capture B 13 (a mount from a step).
 */
export const TURRET_VERTICAL_READING: number | null = null;

/** One `ai_turrets.rdr` definition, its raw fields as `FUN_003aad20` reads them. */
export interface TurretDef {
  /** Its place in the file's order: the match takes the first. */
  index: number;
  /**
   * The template name, at most 31 bytes, exactly as written: never trimmed or case-folded (Enowapi's placed
   * `mp62MGLturret `, a trailing space, takes `mp62MGLturret` by the prefix).
   */
  name: string;
  /** `MANUAL` (a bare flag): a player's emplacement, not an AI one (the parser clears flag bit 1, D:L301630-301633). */
  manual: boolean;
  /** `THERMAL` (D:L301769-301771). */
  thermal: boolean;
  /** `PARTS`, at most three, in order: the turret, the gun, the firepoint. */
  parts: string[];
  /** `LIMITS` YAW/PITCH as authored, in degrees, [lo, hi]; null when absent (D:L301529-301540). */
  limitsDeg: { yaw: [number, number] | null; pitch: [number, number] | null };
  /** `RATES` YAW/PITCH as written (`TURRET_RATE_UNITS_READING`); null when absent (D:L301542-301545). */
  rates: { yaw: number | null; pitch: number | null };
  /** `HEALTH` (D:L301657-301660): the turret object's own value, not the player's scale; null when absent. */
  health: number | null;
  /** `MOUNTABLE_RANGE`, unsquared (the loader squares it), or the loader's 22. */
  mountRange: number;
  /** `MOUNTABLE_ANGLE` in degrees, or the loader's 45. */
  mountAngle: number;
  /** `WEAPON` `NAME`: the `zweapon.rdr` record the turret fires (D:L301661-301705), or null. */
  weapon: string | null;
  /** `WEAPON` `AMMO`: the ammunition *type*, not a count (research 177 s4), or null. */
  ammo: string | null;
  /**
   * `TEAM`: the listed indices as written and the mask `FUN_00533c10` makes of them (`TURRET_TEAM_READING`), or null when
   * the record has none.
   */
  team: { list: number[]; mask: number } | null;
  /** The record, unread keys and all. */
  record: RdrNode[];
}

/** One placed manual turret: a matched node with its three parts, ready for the room (MAP-10b) and the page. */
export interface TurretPlacement {
  /** Its index in the map's list (the scene walk's order): the same on the page, its own room and the server. */
  id: number;
  /** The placed root's scene path (`flattenScene`'s: `worldmodel/mp72_turret01`). */
  root: string;
  /** The placed node's name (`mp72_turret01`). */
  name: string;
  def: TurretDef;
  /** Each part's scene path beneath the root, through the library prototype (`.../RMG_turret=RMG_turret/turret/gun`). */
  parts: { turret: string; gun: string; firepoint: string };
  /** The root's world origin. */
  origin: V3;
  /**
   * MAP-10b (research 215 s3): the gun's zero yaw in the body's yaw (degrees, `../../viewer/src/yaw`: 0 looks down -z,
   * left positive) -- the gun part's world -z axis, along which its firepoint sits at rest. The limits and the mount's
   * facing test are measured from it.
   */
  facing: number;
  /** MAP-10b: the gun part's world origin at rest -- the pivot its yaw and pitch turn about (Crossroads': the root's). */
  gunOrigin: V3;
  /** MAP-10b: the firepoint part's world origin at rest -- the muzzle the room fires from (`firepoint`, research 177 s2). */
  firepointOrigin: V3;
  /**
   * The firepoint part's world matrix at rest (16 floats, row-major, row-vector: three's `Matrix4.elements` order) -- the
   * node the turret's own fire places its muzzle effect on (`FUN_003a8d20` D:L300364: the firepoint node, `+0x288`),
   * turned with the gun (`viewer/src/net/emplacement` `firepointFrame`; `TURRET_MUZZLE_NODE_READING`). Optional: a
   * placement built by hand has none.
   */
  firepointMatrix?: number[];
  /** The definition's limits in radians, as the parser converts them (x 0.017453292); null where the record has none. */
  limits: { yaw: [number, number] | null; pitch: [number, number] | null };
  /** The mount reach in world units, unsquared: the game compares the squared distance with its square. */
  mountRange: number;
  /** The cosine of the mount angle: the orientation test's bound (`FUN_003a90c0` D:L300500-300504; the squared range D:L300482-300486). */
  mountAngleCos: number;
  /** The weapon record's name, or null. */
  weapon: string | null;
  /**
   * `Ammo_Capacity x NumMags` of the weapon's `zweapon.rdr` record (`FUN_003a9a80` D:L300860-300866: PKM TURRET 250 x 3 =
   * 750, LMG TURRET 75 x 3 = 225); the round's reset restores it (`FUN_003aa9d0` D:L301315-301342). Null without the
   * arsenal or the record.
   */
  ammoInit: number | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading.

/** A record's keys in order: a key followed by its value list, or a bare flag (`MANUAL`); the first of a repeat wins. */
function fieldsOf(record: RdrNode[]): Map<string, RdrNode[] | null> {
  const out = new Map<string, RdrNode[] | null>();
  for (let i = 0; i < record.length; i++) {
    const key = record[i];
    if (typeof key !== 'string') continue;
    const next = record[i + 1];
    const value = Array.isArray(next) ? next : null;
    if (value) i++;
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}
const strings = (n: RdrNode | null | undefined): string[] => (n == null ? [] : typeof n === 'string' ? [n] : n.flatMap(strings));
function numbers(n: RdrNode[] | null | undefined, where: string): number[] {
  return strings(n).map((s) => {
    const v = Number(s);
    if (!Number.isFinite(v)) throw new Error(`ai_turrets.rdr ${where}: ${s} is no number`);
    return v;
  });
}
const one = (n: RdrNode[] | null | undefined, where: string): number | null => numbers(n, where)[0] ?? null;
const pair = (n: RdrNode[] | null | undefined, where: string): [number, number] | null => {
  const v = numbers(n, where);
  return v.length >= 2 ? [v[0]!, v[1]!] : null;
};
const clip = (s: string): string => s.slice(0, NAME_BYTES);

/**
 * `FUN_00533c10` (D:L400719-400762): each listed n ORs `1 << n` into the mask; an n below 0 or above 31 ends the walk and is
 * itself the result, as the game returns it. Unsigned, so `1 << 31` stays positive.
 */
export function teamMask(list: readonly number[]): number {
  let mask = 0;
  for (const raw of list) {
    const n = Math.trunc(raw);
    if (n < 0 || n > 31) return n >>> 0;
    mask = (mask | (1 << n)) >>> 0;
  }
  return mask;
}
function teamOf(n: RdrNode[] | null | undefined, where: string): { list: number[]; mask: number } | null {
  if (n == null) return null;
  const list = numbers(n, where);
  return { list, mask: teamMask(list) };
}

function defOf(index: number, name: string, record: RdrNode[]): TurretDef {
  const f = fieldsOf(record), where = name;
  const sub = (key: string): Map<string, RdrNode[] | null> => fieldsOf(f.get(key) ?? []);
  const limits = sub('LIMITS'), rates = sub('RATES'), weapon = sub('WEAPON');
  return {
    index, name: clip(name), manual: f.has('MANUAL'), thermal: f.has('THERMAL'),
    parts: strings(f.get('PARTS')).slice(0, PART_COUNT).map(clip),
    limitsDeg: { yaw: pair(limits.get('YAW'), `${where} LIMITS YAW`), pitch: pair(limits.get('PITCH'), `${where} LIMITS PITCH`) },
    rates: { yaw: one(rates.get('YAW'), `${where} RATES YAW`), pitch: one(rates.get('PITCH'), `${where} RATES PITCH`) },
    health: one(f.get('HEALTH'), `${where} HEALTH`),
    mountRange: one(f.get('MOUNTABLE_RANGE'), `${where} MOUNTABLE_RANGE`) ?? TURRET_MOUNT_RANGE_DEFAULT,
    mountAngle: one(f.get('MOUNTABLE_ANGLE'), `${where} MOUNTABLE_ANGLE`) ?? TURRET_MOUNT_ANGLE_DEFAULT,
    weapon: strings(weapon.get('NAME'))[0] ?? null, ammo: strings(weapon.get('AMMO'))[0] ?? null,
    team: teamOf(f.get('TEAM'), `${where} TEAM`),
    record,
  };
}

/** `ai_turrets.rdr`, parsed -> its definitions in the file's order (`FUN_003aaa90`: name at 2i, record at 2i + 1). */
export function turretDefsOf(script: RdrNode): TurretDef[] {
  const list = rdrGet(script, 'TURRET');
  if (!Array.isArray(list)) throw new Error('ai_turrets.rdr has no TURRET definition list');
  const out: TurretDef[] = [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    const name = list[i], record = list[i + 1];
    if (typeof name !== 'string' || !Array.isArray(record)) throw new Error(`ai_turrets.rdr: definition ${i / 2} is no name and record`);
    out.push(defOf(i / 2, name, record));
  }
  return out;
}

/** `RUN/READERC.ZAR` -> its turret definitions. */
export function parseTurretDefs(readerc: Zar): TurretDef[] {
  const key = readerc.root.children.find((k) => k.name.toLowerCase() === 'ai_turrets.rdr') ?? readerc.find('ai_turrets.rdr');
  if (!key) throw new Error('READERC.ZAR has no ai_turrets.rdr');
  return turretDefsOf(parseRdr(readerc.data(key)));
}

/**
 * The definition a placed node takes: the first in file order whose whole name begins the node's, byte for byte and
 * case-sensitive (`FUN_003aac40` D:L301416-301445; `FUN_00199648` D:L16178-16273 compares the template's length). An empty
 * template or an empty name matches nothing (`FUN_00199288`'s length 0 skips it). Null: no definition.
 */
export function matchTurretDef(defs: readonly TurretDef[], placedName: string): TurretDef | null {
  if (placedName.length === 0) return null;
  return defs.find((d) => d.name.length > 0 && placedName.startsWith(d.name)) ?? null;
}

/** Degrees in [0, 360), as the viewer's `wrapYaw` keeps a yaw. */
const wrapDegrees = (d: number): number => { const w = ((d % 360) + 360) % 360; return w >= 360 ? 0 : w; };
/** `p` is `root` or beneath it, through a child (`/`) or a realised prototype (`=`). */
const beneath = (p: string, root: string): boolean => p.startsWith(`${root}/`) || p.startsWith(`${root}=`);
const toRad = (v: [number, number] | null): [number, number] | null => (v ? [v[0] * DEG_TO_RAD, v[1] * DEG_TO_RAD] : null);

/**
 * The placed turrets of a scene: every outermost node of `models`' world tree (`flattenScene`) a definition matches and
 * whose definition's three parts each name a node beneath it -- the first such node in the walk's order, the part's
 * role its place in `PARTS` (turret, gun, firepoint). `models` must hold the library prototypes the placements instance
 * (`turretSceneModels`); a match without its parts is told to `excluded` (the disc's data, not a fault: Frostfire's
 * `tank1`s) and placed nowhere.
 */
export function placeTurrets(models: SceneNode[], defs: readonly TurretDef[], arsenal: Arsenal | null,
  excluded: (line: string) => void = () => {}, rootName = 'worldmodel'): TurretPlacement[] {
  const flat = flattenScene(models, rootName);
  const roots: { f: SceneInstance; def: TurretDef }[] = [];
  for (const f of flat) {
    const def = matchTurretDef(defs, f.node.name);
    if (!def || roots.some((r) => beneath(f.path, r.f.path))) continue;
    roots.push({ f, def });
  }
  const out: TurretPlacement[] = [];
  for (const { f, def } of roots) {
    const found = def.parts.map((name) => flat.find((p) => p.node.name === name && beneath(p.path, f.path))?.path);
    const missing = def.parts.filter((_, i) => found[i] === undefined);
    if (def.parts.length < PART_COUNT || missing.length) {
      excluded(`turret: ${f.path} matches ${def.name} but lacks ${missing.length ? missing.join(', ') : `${PART_COUNT - def.parts.length} of its parts`} -- no turret`);
      continue;
    }
    const item = def.weapon !== null && arsenal ? arsenal.byName.get(def.weapon) : undefined;
    // MAP-10b: the gun's pivot and facing and the firepoint's rest place (row-major, row-vector: row 2 is local z).
    const gun = flat.find((p) => p.path === found[1])!.world, fire = flat.find((p) => p.path === found[2])!.world;
    out.push({
      id: out.length, root: f.path, name: f.node.name, def,
      parts: { turret: found[0]!, gun: found[1]!, firepoint: found[2]! },
      origin: transformPoint(f.world, 0, 0, 0),
      facing: wrapDegrees((Math.atan2(gun[8]!, gun[10]!) * 180) / Math.PI),
      gunOrigin: transformPoint(gun, 0, 0, 0), firepointOrigin: transformPoint(fire, 0, 0, 0), firepointMatrix: Array.from(fire),
      limits: { yaw: toRad(def.limitsDeg.yaw), pitch: toRad(def.limitsDeg.pitch) },
      mountRange: def.mountRange, mountAngleCos: Math.cos(def.mountAngle * DEG_TO_RAD),
      weapon: def.weapon, ammoInit: item ? item.magazine * item.mags : null,
    });
  }
  return out;
}

/**
 * LATER 166: a placed turret shows its model's `thermal_scope` node only when its definition is `THERMAL` and its `scope`
 * node only when it is not -- set at the turret's making (`FUN_003a9a80` D:L300804-300828: the two nodes found by name,
 * 0x3fbfd0 `scope` and 0x3fbfd8 `thermal_scope`, each shown by `+0x298`, the definition's flag, D:L300794) and again at
 * the mount and the release (`FUN_003a9ea0` D:L300898-300928). Whether a drawn part at `path` is hidden so: beneath a
 * placement's root and beneath a node named for the other kind (a segment `name` or `name=model`). The libraries'
 * turrets hold `thermal_scope` alone (Crossroads' RMG and LMG), so a plain turret draws no scope node.
 */
export function turretScopeHidden(placements: readonly Pick<TurretPlacement, 'root' | 'def'>[], path: string): boolean {
  for (const t of placements) {
    // The review's F1: beneath through a child (`root/`) or a realised prototype (`root=`), as `beneath` (above) reads it.
    if (path !== t.root && !path.startsWith(`${t.root}/`) && !path.startsWith(`${t.root}=`)) continue;
    const hide = t.def.thermal ? 'scope' : 'thermal_scope';
    return path.slice(t.root.length + 1).split('/').some((seg) => seg === hide || seg.startsWith(`${hide}=`));
  }
  return false;
}

/** The map's own graph's file in its archive (`MP72_GEO.ZED`), against a TOC entry's name (`RUN\MP\MP72\MP72_GEO.ZED`). */
const ownGeo = (entry: string, stem: string): boolean => entry.replace(/^.*[\\/]/, '').toUpperCase() === `${stem.toUpperCase()}_GEO.ZED`;

/**
 * The map's models with every embedded GEO library's prototypes joined by name, the map's own first and then the
 * libraries in the archive's order, a name already present kept (research 177 s2: `TURR_GEO`, `TLMG_GEO`, `TLRM_GEO` hold
 * the parts). A library that will not parse is skipped with a note.
 */
export function turretSceneModels(zdb: Uint8Array, toc: ZdbEntry[], stem: string, mapModels: SceneNode[],
  note: (line: string) => void = () => {}): SceneNode[] {
  const byName = new Map(mapModels.map((m) => [m.name, m]));
  for (const entry of toc) {
    if (!/_GEO\.ZED$/i.test(entry.name) || ownGeo(entry.name, stem)) continue;
    try {
      for (const model of parseSceneGraph(Zar.parse(zdbSlice(zdb, entry)))) {
        if (!byName.has(model.name)) byName.set(model.name, model);
      }
    } catch (e) {
      note(`turret: library ${entry.name} will not read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return [...byName.values()];
}

/**
 * A map archive's placed manual turrets (`MP72.ZDB` bytes, its stem, `parseTurretDefs`, the arsenal for the ammunition).
 * The libraries are opened only when a node of the map's own tree -- a node's name or an instance's model -- matches a
 * definition: a map with no candidate costs one walk of its graph. `excluded` hears each match without its parts
 * (`placeTurrets`), `note` each library that would not read (a fault); `mapModels`, when the caller has parsed the
 * map's graph already, saves the second parse.
 */
export function readTurrets(zdb: Uint8Array, stem: string, defs: readonly TurretDef[], arsenal: Arsenal | null,
  excluded: (line: string) => void = () => {}, mapModels?: SceneNode[], note: (line: string) => void = () => {}): TurretPlacement[] {
  const toc = parseZdb(zdb);
  const models = mapModels ?? parseSceneGraph(Zar.parse(zdbMember(zdb, toc, `${stem}_GEO.ZED`)));
  const candidate = flattenScene(models).some((f) => matchTurretDef(defs, f.node.name) !== null
    || (f.node.modelName !== null && matchTurretDef(defs, f.node.modelName) !== null));
  if (!candidate) return [];
  return placeTurrets(turretSceneModels(zdb, toc, stem, models, note), defs, arsenal, excluded);
}
