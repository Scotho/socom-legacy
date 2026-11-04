import { rdrGet, type RdrNode } from '@s2u/archive';
import { aiCellCentre, aiCellIndex, aiCellY, namedPoint, type AiLoc, type AiMaps } from './aimaps';
import { teamMask } from './turrets';

/**
 * HX-0b (web sprint 31; research 237 s1): a map's escortees -- the hostages of EXTRACTION -- as `READERM.ZAR/vehicles.rdr`
 * records them and as the original places them. Pure: the records in, the starts out; nothing is spawned here.
 *
 * Desert Glory (`MP6.ZDB`) holds four records (research 190 s2.2 A2, V2 claim 2): `player` (disabled) and `Hostage` /
 * `Hostage2` / `Hostage3`, `character` `mp_fem1` / `mp_fem2` / `mp_fem3`, `setup` `[["hostageStart","0"]]` /
 * `hostage2Start` / `hostage3Start`, `team 17 30 31`. The actor's scene name is the record's `name` -- the script finds
 * the actor by it (`FUN_0029e590` D:L144706, node `+0x90`) -- not `chartype.rdr`'s `escortees` labels (Hostage1-3).
 * `FUN_002b28d0` (D:L155776) places a record at the AIMAPS named point its setup names (`FUN_00533000` -> `FUN_0052db70`
 * -> `FUN_0052d480`) with the setup's heading index (`FUN_00532fc0` -> `FUN_00518ea0`).
 */

/**
 * [reading] The escortee bit of a body's team mask (`+200`, research 189 s2: FIRETEAM_ESCORTEE by the SOCOM 1 DWARF's
 * names): the test `+200 & 0x20000` every escortee path makes (research 190 V2 claim 2, 199 s2). A record whose `team`
 * list sets it is an escortee (`parseEscortees`).
 */
export const ESCORTEE_BIT_READING = 0x20000;

/**
 * [reading] A hostage's team mask: bits 17, 30 and 31 (ESCORTEE, ENEMIES, ALLIES by the SOCOM 1 DWARF's FIRETEAM names,
 * research 189 s2 -- the names a reading with a step, the mask read). The record parser ORs `1 << n` over the `team`
 * list into record `+0x11c` (D:L400381-400401, D:L400443); `FUN_002b28d0` copies it to body `+200` through
 * `FUN_0029ed10` (D:L144915); online the bit-30/31 swap (`DAT_004412d8`, D:L155859-155866) leaves a mask with both bits
 * as it is (research 190 V2 claim 2, U8 settled). Desert Glory's three records give exactly this.
 */
export const HOSTAGE_TEAM_READING = 0xc0020000;

/**
 * [reading] The lift over the cell's height an escortee starts at: the player spawn's +1.0 (`FUN_002b8100` D:L158793;
 * research 91 s4.2, 190 V2 claim 3, the room's `SPAWN_LIFT`) applied to an AI body -- `FUN_002b28d0`'s own placement is
 * unread. Capture C2's round-start positions settle it (research 237 s7).
 */
export const HOSTAGE_START_LIFT_READING = 1.0;

/**
 * [reading] An escortee's start yaw for setup heading 0: `FUN_00518ea0` (D:L386383) case 0 builds a y-axis quaternion of
 * pi and, with `param_3` = 1, composes a further pi -- net yaw 0 (research 190 s3.1 B1, BELIEVED; U10: the mesh's rest
 * facing is not established). Only heading 0 is read; every Desert Glory record has it.
 */
export const HOSTAGE_FACING_READING = 0;

/** One escortee record of `vehicles.rdr`. */
export interface EscorteeRecord {
  /** The record's `name`: the actor's scene name, which the script finds it by (`FUN_0029e590`). */
  name: string;
  /** `character` (`mp_fem1`): the `chartype.rdr` key HX-2 draws it by. */
  character: string;
  /** The setup's named point (`hostageStart`), an AIMAPS named point. */
  point: string;
  /** The setup's heading index (`FUN_00532fc0` -> `FUN_00518ea0`). */
  heading: number;
  /** The `team` list as the record parser ORs it (`teamMask`, D:L400381-400401). */
  teamBits: number;
}

/** An escortee placed at its start. */
export interface EscorteeStart {
  name: string;
  character: string;
  /** The named point's cell. */
  loc: AiLoc;
  /** The cell's centre, at its quantised height plus `HOSTAGE_START_LIFT_READING`. */
  at: [number, number, number];
  /** `HOSTAGE_FACING_READING`. */
  yaw: number;
  /** The record's mask (`HOSTAGE_TEAM_READING` on Desert Glory). */
  team: number;
}

const str = (n: RdrNode | undefined): string => (typeof n === 'string' ? n : '');
const list = (n: RdrNode | undefined): RdrNode[] => (n === undefined ? [] : typeof n === 'string' ? [n] : n);

/**
 * The records of a `vehicles.rdr` tree: the root wraps either one record (Frostfire's `player`) or a list of them
 * (Desert Glory's four); a record is a flat key/value list whose first item is a key.
 */
function recordsOf(root: RdrNode): RdrNode[][] {
  let n: RdrNode = root;
  while (Array.isArray(n) && n.length === 1 && Array.isArray(n[0])) n = n[0];
  if (!Array.isArray(n)) return [];
  return typeof n[0] === 'string' ? [n] : n.filter((r): r is RdrNode[] => Array.isArray(r));
}

/**
 * The escortee records of a `vehicles.rdr` tree (`parseRdr`'s): every record whose `team` mask has the escortee bit
 * (`ESCORTEE_BIT_READING`) and which is not `disabled`, in file order. The mask is the record parser's (`teamMask`: each
 * n ORs `1 << n`, an n outside 0..31 ends the walk and is the result, D:L400381-400401 as `FUN_00533c10`).
 */
export function parseEscortees(vehicles: RdrNode): EscorteeRecord[] {
  const out: EscorteeRecord[] = [];
  for (const record of recordsOf(vehicles)) {
    if (str(rdrGet(record, 'disabled')) === '1') continue;
    const teamBits = teamMask(list(rdrGet(record, 'team')).map((t) => Number(str(t))));
    if ((teamBits & ESCORTEE_BIT_READING) === 0) continue;
    const setup = list(rdrGet(record, 'setup'));
    out.push({
      name: str(rdrGet(record, 'name')), character: str(rdrGet(record, 'character')),
      point: str(setup[0]), heading: Number(str(setup[1]) || 0), teamBits,
    });
  }
  return out;
}

/**
 * The escortees at their starts: each record's named point (`namedPoint`, the sub-map its loc names), the cell's centre
 * (`aiCellCentre`, `FUN_0052d480` D:L396879) at the cell word's height (`aiCellY`, `FUN_00516940` D:L385082) plus
 * `HOSTAGE_START_LIFT_READING`, yaw `HOSTAGE_FACING_READING`, the record's mask. A record whose point is absent, or whose
 * cell the grid does not store, is dropped and noted (`note`); a heading other than 0 is noted and placed at yaw 0.
 */
export function placeEscortees(records: readonly EscorteeRecord[], ai: AiMaps, note: (line: string) => void = () => {}): EscorteeStart[] {
  const out: EscorteeStart[] = [];
  for (const r of records) {
    const found = r.point ? namedPoint(ai, r.point) : undefined;
    if (!found) { note(`escortee ${r.name}: no named point '${r.point}' in the AI maps -- not placed`); continue; }
    const { loc } = found.point;
    const sub = ai.maps[loc.map] ?? found.sub;
    const i = aiCellIndex(sub, loc.x, loc.z);
    if (i < 0) { note(`escortee ${r.name}: cell ${loc.map}:(${loc.x},${loc.z}) of '${r.point}' is not stored -- not placed`); continue; }
    if (r.heading !== 0) note(`escortee ${r.name}: setup heading ${r.heading} unread (FUN_00518ea0 case 0 only) -- yaw ${HOSTAGE_FACING_READING}`);
    const [x, z] = aiCellCentre(sub, loc.x, loc.z);
    out.push({
      name: r.name, character: r.character, loc: { ...loc },
      at: [x, aiCellY(sub, sub.cells[i]!) + HOSTAGE_START_LIFT_READING, z], yaw: HOSTAGE_FACING_READING, team: r.teamBits,
    });
  }
  return out;
}
