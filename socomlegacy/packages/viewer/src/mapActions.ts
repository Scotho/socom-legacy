import { parseRdr, rdrGet, Zar, zdbMember, type RdrNode, type ZdbEntry } from '@s2u/archive';
import { applyR0004MapPatch, flattenScene, parseSceneGraph, transformPoint } from '@s2u/scene';

/**
 * The map's own context actions (socomlegacy/docs/research/87-hud.md §5, 209 §2): `READERM.ZAR/actions.rdr` lists, per
 * map, the scene nodes an action hangs on. The keys are the loader's (`FUN_002b4f40` D:L157236-157431 loads the
 * records; the strings at 0x3f20f0-0x3f2130; research 171 s3 corrects 92 s1, whose `FUN_002b4230` parses
 * `EXECUTE_ACTION`): `node`, `valve`, `anim` (a list), `type` (`DOOR`, `SWITCH`, `MPBOMB`, none), `range`,
 * `elevation`, `bitmap` (the prompt's icon), with `points` and `team` where a map gives them. This is where the door
 * icon comes from: the ELF never names it, the map data does. Frostfire has three doors (`bdoor_4`, `wdoor_1`,
 * `wdoor_2`), Crossroads two switches and two bomb tents, Desert Glory a door and a type-less `access_action1`.
 */

/**
 * The action object's default reach (`FUN_002b49f0` L157032-157066: `+0x1c` = 0x42000000, 32 units) when `actions.rdr`
 * gives no `range` (`FUN_0032ea80(..., "range", ...)` L157290 keeps the default).
 */
export const ACTION_RANGE_DEFAULT = 32;
/** The default `elevation` (`+0x20`): -1, no height test (research 92 s1, 171 s3). */
export const ACTION_ELEVATION_NONE = -1;

/**
 * The type codes (`+0x24`, research 92 s1): the loader's name switch (D:L157334-157362, research 200 s1.2's
 * `out/action_type_names.txt`) -- 0 DOOR, 1 WINDOW, 2 SWITCH, 3 DEFUSE, 4 MPBOMB, 5 ACT_BREACH, 6 SATCHEL, 7 ITEM --
 * and 8 when the record gives none or another name ("UNKNOWN", L157331-157365; research 94 C5.1).
 */
export const ACTION_TYPE_CODES: Readonly<Record<string, number>> = {
  DOOR: 0, WINDOW: 1, SWITCH: 2, DEFUSE: 3, MPBOMB: 4, ACT_BREACH: 5, SATCHEL: 6, ITEM: 7,
};
export const ACTION_TYPE_UNKNOWN = 8;

/** One record of `actions.rdr`, typed, with the loader's defaults where it gives none; not yet on its node. */
export interface ActionRecord {
  node: string;
  /** As written (`DOOR`), '' when the record gives none. */
  type: string;
  /** `ACTION_TYPE_CODES`, 8 for none or a name the switch does not hold. */
  typeCode: number;
  /** The `CValve` (`+0x18`) that holds its state; '' when none. */
  valve: string;
  /** `anim`, every name in order (`+0x08`/`+0x0c`): a door's swing and its kick. */
  anims: string[];
  /**
   * The record's raw first `team` value (`team 0`, the SEALs, on Sujo's radios: research 174), or null when absent (the
   * loader's unrestricted default, `FUN_002b49f0` D:L157059). Not the `+0x30` mask: the loader builds that in
   * `FUN_00533c10` (`1 << index` per entry, bits 0 and 8 swappable, D:L157405-157418), not decoded here; nothing reads it yet.
   */
  team: number | null;
  /** Horizontal reach (`+0x1c`), units: `ACTION_RANGE_DEFAULT` when absent. */
  range: number;
  /** Height reach (`+0x20`): `ACTION_ELEVATION_NONE` when absent. */
  elevation: number;
  /** `points` (171 s3: 2 on Crossroads' switches and the access actions), 0 when absent. */
  points: number;
  /** The prompt's icon, lower case (`action_door_open.tif`), '' when none. */
  bitmap: string;
  /**
   * G1 (action-labels review; reading, pending review): `descriptor`, the action's own caption as written, '' when absent
   * -- the loader's `FUN_0032ee10(.., 0x3f2118 "descriptor")` (D:L157285), kept at the action's `+0x2c` (D:L157318-157321);
   * `mapActionCaption` reads it. None of the four fixture maps' records carries one (`mapActions.test.ts`). Optional for a
   * record the reader did not make (the Forge's placed actions, the tests'): absent is none.
   */
  descriptor?: string;
  /**
   * Review S2 (reading, pending review): whether the record names the `tcm` key -- the loader asks only its presence
   * (`FUN_0032f0d0(.., 0x3f21c8 "tcm")`) and sets the action's `+0x3f` bit 2 (D:L157420-157422), which makes
   * `FUN_00220350` draw the text at 0x436500 or PLEASE ADD TO MISSION.RDR instead of the record's (D:L74405-74416).
   * Optional as `descriptor` is; absent is false.
   */
  tcm?: boolean;
}

/** A record on its placed node. */
export interface MapAction extends ActionRecord {
  /** The node's path in `flattenScene(models, 'worldmodel')` order: its first placement of that name. */
  path: string;
  /** The node's origin in the world, game units (the same placement). */
  at: [number, number, number];
}

const one = (r: RdrNode[], k: string): string => {
  const v = rdrGet(r, k);
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '';
};
const all = (r: RdrNode[], k: string): string[] => {
  const v = rdrGet(r, k);
  if (typeof v === 'string') return [v];
  return Array.isArray(v) ? (v.flat(4) as RdrNode[]).filter((s): s is string => typeof s === 'string') : [];
};
const num = (r: RdrNode[], k: string, absent: number): number => {
  const s = one(r, k);
  const n = Number(s);
  return s === '' || !Number.isFinite(n) ? absent : n;
};

/** The typed records of a parsed `actions.rdr` (the page, the room and the doors read them through this one parser). */
export function actionRecordsOf(script: RdrNode): ActionRecord[] {
  const root = Array.isArray(script) && Array.isArray(script[0]) && typeof script[0][0] === 'string' ? script[0] : script;
  const list = (rdrGet(root as RdrNode[], 'actions') ?? []) as RdrNode[];
  return list.filter((r): r is RdrNode[] => Array.isArray(r) && rdrGet(r, 'node') !== undefined).map((r) => {
    const type = one(r, 'type');
    const team = one(r, 'team');
    return {
      node: one(r, 'node'), type, typeCode: ACTION_TYPE_CODES[type.toUpperCase()] ?? ACTION_TYPE_UNKNOWN,
      valve: one(r, 'valve'), anims: all(r, 'anim'),
      team: team === '' || !Number.isFinite(Number(team)) ? null : Number(team),
      range: num(r, 'range', ACTION_RANGE_DEFAULT), elevation: num(r, 'elevation', ACTION_ELEVATION_NONE),
      points: num(r, 'points', 0), bitmap: one(r, 'bitmap').toLowerCase(), descriptor: one(r, 'descriptor'),
      tcm: rdrGet(r, 'tcm') !== undefined,
    };
  });
}

/**
 * G1 (action-labels review, `agent-mail/evidence/v0420/action-labels-review/REPORT.md` s3; reading, pending review, no
 * capture): `FUN_002b48e0`'s texts by the action's type (`+0x24`), each the string its pointer at `at` names in the ELF
 * (checked on the disc by `mapActions.test.ts`): type 0 OPEN DOOR (`PTR_s_OPEN_DOOR_003de62c`), or CLOSE DOOR
 * (`PTR_s_CLOSE_DOOR_003de628`) when the valve's short (`+0x18`'s `+4`) is non-zero (D:L156975-156979); type 2 FLIP
 * SWITCH (`PTR_s_FLIP_SWITCH_003de630`, D:L156982-156984).
 */
export const MAP_ACTION_TYPE_CAPTIONS = {
  open: { at: 0x3de62c, text: 'OPEN DOOR' }, close: { at: 0x3de628, text: 'CLOSE DOOR' }, flip: { at: 0x3de630, text: 'FLIP SWITCH' },
} as const;
/**
 * G1: MAP_ACTION_CAPTION_OTHER_TYPES_READING -- a map action of another type with no `descriptor`, on the map-action
 * record: types 4 (MPBOMB) and 6 (SATCHEL) never make that record (they set the offer's bits 7 and 0x11, not 13:
 * `FUN_005937c0` D:L452414-452424; their caption is the bomb's path), so this is types 1 (WINDOW), 3 (DEFUSE),
 * 5 (ACT_BREACH), 7 (ITEM) and 8 (none): `FUN_002b48e0` gives DEFUSE BOMB, BREACH, TAKE ITEM for 3, 5, 7 and nothing for
 * 1 and 8, which `FUN_002209c0` turns into UNKNOWN (D:L74570-74572); those texts are not re-read and ported yet, so the
 * port draws none. What settles it: their pointers read on the disc and a capture of one. An empty `descriptor` is taken
 * as none here, where the original would draw the empty string (D:L74576-74581); no known record has one.
 */
export const MAP_ACTION_CAPTION_OTHER_TYPES_READING = 'none: the texts of the other types and UNKNOWN are unported' as const;
/**
 * Review S2: MAP_ACTION_TCM_CAPTION_READING -- a `tcm` action (`ActionRecord.tcm`) is captioned with the text at 0x436500
 * when it is not empty, else PLEASE ADD TO MISSION.RDR (0x3e4f30), never its descriptor or type text (`FUN_00220350`
 * D:L74405-74416); what writes 0x436500 is not read, so the port draws none. The only known `tcm` records are the airstrike
 * radios (MP61, MP62, MP73, MP82; raw bytes, research 174). What settles it: the writer of 0x436500 read, a capture of a
 * radio's caption.
 */
export const MAP_ACTION_TCM_CAPTION_READING = 'none: the tcm text at 0x436500 is unported' as const;

/**
 * G1: a map action's caption, as `FUN_002209c0` sets the type-13 record's text (D:L74567-74582) -- the action's
 * `descriptor` when it has one, any type; else `FUN_002b48e0`'s by its type (`MAP_ACTION_TYPE_CAPTIONS`; `valve` is its
 * valve's value now, read for a DOOR only); else null (`MAP_ACTION_CAPTION_OTHER_TYPES_READING`). A `tcm` action: null
 * (`MAP_ACTION_TCM_CAPTION_READING`).
 */
export function mapActionCaption(record: Pick<ActionRecord, 'typeCode' | 'descriptor' | 'tcm'>, valve: number): string | null {
  if (record.tcm) return null;
  if (record.descriptor) return record.descriptor;
  if (record.typeCode === ACTION_TYPE_CODES.DOOR) return (valve !== 0 ? MAP_ACTION_TYPE_CAPTIONS.close : MAP_ACTION_TYPE_CAPTIONS.open).text;
  if (record.typeCode === ACTION_TYPE_CODES.SWITCH) return MAP_ACTION_TYPE_CAPTIONS.flip.text;
  return null;
}

/**
 * The map archive's action records, or none: `absent` when it has no `actions.rdr`, `error` when that does not read.
 * Never throws.
 */
export function readActionRecords(bytes: Uint8Array, toc: ZdbEntry[]): { records: ActionRecord[]; error?: string } {
  try {
    const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'actions.rdr');
    if (!key) return { records: [] };
    return { records: actionRecordsOf(parseRdr(readerm.data(key))) };
  } catch (e) {
    return { records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** The actions of a map archive whose nodes are placed; a map without the script has none. Never throws. */
export function readMapActions(bytes: Uint8Array, toc: ZdbEntry[], stem: string, graph?: ReturnType<typeof parseSceneGraph>): { actions: MapAction[]; diagnostics: string[] } {
  const { records, error } = readActionRecords(bytes, toc);
  if (error !== undefined) return { actions: [], diagnostics: [`actions: READERM.ZAR: ${error}`] };
  if (records.length === 0) return { actions: [], diagnostics: [] };
  let where: Map<string, { path: string; at: [number, number, number] }>;
  try {
    let models = graph;                                     // the caller's, when it has it (already r0004's)
    if (!models) {
      models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
      applyR0004MapPatch(models, stem);   // LATER 707 (research 383): the graph `place` hands in is r0004's; so is this one
    }
    where = new Map();
    for (const f of flattenScene(models, 'worldmodel')) {
      const name = f.node.name.toLowerCase();
      if (!where.has(name)) where.set(name, { path: f.path, at: transformPoint(f.world, 0, 0, 0) });
    }
  } catch (e) {
    return { actions: [], diagnostics: [`actions: ${stem}_GEO.ZED: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const actions: MapAction[] = [];
  const diagnostics: string[] = [];
  for (const r of records) {
    const placed = where.get(r.node.toLowerCase());
    if (!placed) { diagnostics.push(`actions: node ${r.node} is not placed`); continue; }
    actions.push({ ...r, path: placed.path, at: placed.at });
  }
  return { actions, diagnostics };
}

/** The valve value that locks an action, a door among them (`FUN_002b46f0`, `FUN_005aa240`: `*(short *)(valve + 4) != 99`). */
export const VALVE_LOCKED = 99;

/** A scene path's parent: the path up to its last `/` or `=` (`worldmodel/a=a/b` -> `worldmodel/a=a` -> `worldmodel/a`). */
function parentPath(path: string): string | null {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('='));
  return cut > 0 ? path.slice(0, cut) : null;
}

/**
 * The action on `path` or the nearest parent that has one (`FUN_005aa470`: six nodes inline, then the sixth's parent,
 * D:L463945, no depth limit). Undefined when none does.
 */
export function actionForNode(actions: readonly MapAction[], path: string): MapAction | undefined {
  for (let at: string | null = path; at !== null; at = parentPath(at)) {
    const found = actions.find((a) => a.path === at);
    if (found) return found;
  }
  return undefined;
}

/** Why `actionAtPick` takes or refuses the hit. `ok` is in reach. The dev pick log prints the others. */
export type ActionReachWhy = 'ok' | 'none' | 'locked' | 'range' | 'elevation';

/**
 * `actionAtPick`'s decision, with the refusal. The record is the action on the node even when refused, and null
 * only for `none`. Both distance tests are strict (D:L463895, D:L463898). There is no aim cone.
 */
export function actionReachNote(
  actions: readonly MapAction[], pick: { path: string; point: readonly number[] }, feet: readonly number[],
  valveOf: (valve: string) => number = () => 0,
): { record: MapAction | null; why: ActionReachWhy } {
  const found = actionForNode(actions, pick.path);
  if (!found) return { record: null, why: 'none' };
  if (found.typeCode === ACTION_TYPE_UNKNOWN || (found.valve !== '' && valveOf(found.valve) === VALVE_LOCKED)) {
    return { record: found, why: 'locked' };
  }
  const dx = feet[0]! - pick.point[0]!, dy = feet[1]! - pick.point[1]!, dz = feet[2]! - pick.point[2]!;
  if (dx * dx + dz * dz >= found.range * found.range) return { record: found, why: 'range' };
  if (found.elevation !== ACTION_ELEVATION_NONE && found.elevation * found.elevation <= dy * dy) {
    return { record: found, why: 'elevation' };
  }
  return { record: found, why: 'ok' };
}

/**
 * The action the button takes, the game's pick (`FUN_005aa240` D:L463830-463905; research 92 s1, 171 s3, 174 s8.1,
 * 179 §11.18): the node under the reticle (`pick.path`) or any of its parents up to the root names an action; it is
 * refused when its valve reads 99 (`valveOf`, 0 when not given) or its type is 8 (a type-less action is never a
 * prompt: 176 s7.1); else the SEAL's place (`feet`) against the reticle's hit point
 * (`pick.point`): the ground-plane distance squared under `range` squared, and, when `elevation` is not -1, the
 * height difference squared under `elevation` squared (both strict). There is no aim cone. Null when nothing qualifies.
 */
export function actionAtPick(
  actions: readonly MapAction[], pick: { path: string; point: readonly number[] }, feet: readonly number[],
  valveOf: (valve: string) => number = () => 0,
): MapAction | null {
  const note = actionReachNote(actions, pick, feet, valveOf);
  return note.why === 'ok' ? note.record : null;
}

/**
 * The action whose node is nearest the feet within its `range` (units, measured in 3D from the node's origin), or
 * none. The HUD icon's stand-in only [estimate: not the game's test, which is `actionAtPick`'s]; XR-06 retires it.
 */
export function actionInReach(actions: readonly MapAction[], feet: readonly number[] | null, types?: readonly string[]): MapAction | null {
  if (!feet) return null;
  let best: MapAction | null = null, bestD = Infinity;
  for (const a of actions) {
    if (types && !types.includes(a.type)) continue;
    const d = Math.hypot(a.at[0] - feet[0]!, a.at[1] - feet[1]!, a.at[2] - feet[2]!);
    if (d <= a.range && d < bestD) { best = a; bestD = d; }
  }
  return best;
}
