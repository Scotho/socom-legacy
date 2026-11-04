import { rdrGet, type RdrNode } from '@s2u/archive';

/**
 * The character types: `READERC.ZAR`'s `character.rdr` (socomlegacy/docs/research/78 §5). Not in a map archive -- a file
 * of its own on the disc, which the extractor copies beside the maps -- and the only place that says which part
 * a piece of gear hangs from.
 *
 * The file is one record: `AngleUnits`, `ai_settings`, `body_items` (the parts gear may name, with the gear nodes
 * after them), `gear` (one record a piece: `name`, `model`, and `ofs` = the part, a translation and three angles),
 * and `characters`, a flat list of `name [":" base] record` in which a character takes from its base whatever it
 * does not state -- `mp2_seal1 : mp_seal1 : mp_seal : ... : basic_seal`.
 */

/** One piece of gear: its model and where on the body it goes. */
export interface GearDef {
  name: string;
  /** The `FLIB_MDL.ZED` model: the `model` file name without its extension (`gear_holster.flt`). */
  model: string;
  /** The part it hangs from (`body_items`, the skeleton's names). */
  part: string;
  /** In the part's frame. */
  translation: [number, number, number];
  /** About x, then y, then z, the fixed axes, in `AngleUnits` (`gearMatrix`). */
  rotation: [number, number, number];
}

/** One entry of `characters`: its base, and its own record. */
export interface CharacterType { name: string; base: string | null; record: RdrNode }

export interface CharacterTable {
  angleUnits: 'DEG' | 'RAD';
  /** The parts gear may name, without the trailing `gear_nodes` list. */
  bodyItems: string[];
  gear: Map<string, GearDef>;
  characters: Map<string, CharacterType>;
  /** A key of a character, looked up through its bases; undefined when none of them states it. */
  get(character: string, key: string): RdrNode | undefined;
  /** The character's mesh, `model_name` without its extension, or null. */
  model(character: string): string | null;
  /** The character's `default_gear` names, or none. */
  defaultGear(character: string): string[];
}

/** `seal_A_scuba.xsi`, `gear_holster.flt`, `seal_black_hat.mb`: the exporter's file names, stripped. */
const stem = (file: string): string => file.replace(/\.[a-z]+$/i, '');
const list = (n: RdrNode | undefined): RdrNode[] => (Array.isArray(n) ? n : n === undefined ? [] : [n]);
/**
 * A list of records. `rdrGet` hands back a one-element value list as its element, so a list holding a single
 * record arrives as that record -- a list that starts with a key -- and is wrapped back up here.
 */
const records = (n: RdrNode | undefined): RdrNode[] => (Array.isArray(n) && typeof n[0] === 'string' ? [n] : list(n));
/** A bases chain longer than this is a loop, not an inheritance. */
const MAX_BASES = 32;

export function parseCharacterTable(root: RdrNode): CharacterTable {
  const units = rdrGet(root, 'AngleUnits');
  const angleUnits = units === 'RAD' ? 'RAD' : 'DEG';
  const items = list(rdrGet(root, 'body_items'));
  const bodyItems = items.filter((x): x is string => typeof x === 'string' && x !== 'gear_nodes');

  const gear = new Map<string, GearDef>();
  for (const record of records(rdrGet(root, 'gear'))) {
    const name = rdrGet(record, 'name'), model = rdrGet(record, 'model'), ofs = list(rdrGet(record, 'ofs'));
    if (typeof name !== 'string' || typeof model !== 'string') continue;
    const [part, t, r] = ofs;
    const three = (n: RdrNode | undefined): [number, number, number] => {
      const v = list(n).map(Number);
      return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
    };
    if (typeof part !== 'string') continue;
    gear.set(name, { name, model: stem(model), part, translation: three(t), rotation: three(r) });
  }

  const characters = new Map<string, CharacterType>();
  const entries = list(rdrGet(root, 'characters'));
  for (let i = 0; i < entries.length;) {
    const name = entries[i];
    if (typeof name !== 'string') { i++; continue; }
    if (entries[i + 1] === ':' && typeof entries[i + 2] === 'string') {
      characters.set(name, { name, base: entries[i + 2] as string, record: entries[i + 3] ?? [] });
      i += 4;
    } else {
      characters.set(name, { name, base: null, record: entries[i + 1] ?? [] });
      i += 2;
    }
  }

  const get = (character: string, key: string): RdrNode | undefined => {
    let c = characters.get(character);
    for (let depth = 0; c && depth < MAX_BASES; depth++) {
      const v = rdrGet([c.record], key);
      if (v !== undefined) return v;
      c = c.base === null ? undefined : characters.get(c.base);
    }
    return undefined;
  };
  return {
    angleUnits, bodyItems, gear, characters, get,
    model: (character) => { const m = get(character, 'model_name'); return typeof m === 'string' ? stem(m) : null; },
    defaultGear: (character) => list(get(character, 'default_gear')).filter((x): x is string => typeof x === 'string'),
  };
}

/**
 * A gear's offset as the engine stores a matrix, row-major with the translation in the fourth row (24 §1.1):
 * the turn is x, then y, then z about the fixed axes -- `Rz * Ry * Rx` on a column vector -- and that one of the
 * twelve orders is the one under which the SEAL's worn gear undoes its part's bind turn to a few hundredths
 * (78 §5): the gear is modelled in the character's own axes. A point of the gear lands at `p x offset x part`.
 */
export function gearMatrix(gear: GearDef, angleUnits: 'DEG' | 'RAD' = 'DEG'): Float32Array {
  const k = angleUnits === 'DEG' ? Math.PI / 180 : 1;
  const [a, b, c] = gear.rotation.map((x) => x * k) as [number, number, number];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rz(c) Ry(b) Rx(a), column-vector; the engine's row i is R's column i, the image of axis i.
  const R = [
    [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
    [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
    [-sb, cb * sa, cb * ca],
  ];
  const [tx, ty, tz] = gear.translation;
  return Float32Array.from([
    R[0]![0]!, R[1]![0]!, R[2]![0]!, 0,
    R[0]![1]!, R[1]![1]!, R[2]![1]!, 0,
    R[0]![2]!, R[1]![2]!, R[2]![2]!, 0,
    tx, ty, tz, 1,
  ]);
}

/**
 * A `chartype.rdr` list: the two sides, and (HX-2, web sprint 31; research 238 §1) `escortees`, the hostages a map fields
 * -- MP6's `mp_fem1-3` (Hostage1-3), none elsewhere. `FUN_0053b5f0` (D:L405207-405245) finds a type's entry by its name
 * without case, the escortees' as the sides' (`./armoryCharacters` cites the same lookup).
 */
export type CharacterTeam = 'navyseals' | 'terrorists' | 'escortees';

/**
 * A team's character on a map: the `index`-th entry of `team` (`navyseals`, `terrorists` or `escortees`) in its
 * `READERM.ZAR/chartype.rdr` that names a `character` -- `mp2_seal1`, or Frostfire's first Terrorist -- or null.
 * Each map lists four of each side (Seal1-4, Terrorist1-4; socomlegacy/docs/research/91 §14, the ARMORY's columns, research
 * 95 §6); a player with no saved loadout is SEAL 1 / TERRORIST 1 (R95.5: `MpCharSet` 1 / 5, `ChangeCharacterType(1)` /
 * `(5)`), so index 0 is the default (`./armoryCharacters` `DEFAULT_ARMORY_TYPE`). Desert Glory lists three escortees.
 */
export function teamCharacter(chartype: RdrNode, team: CharacterTeam, index = 0): string | null {
  let n = 0;
  for (const entry of records(rdrGet(chartype, team))) {
    const c = rdrGet(entry, 'character');
    if (typeof c === 'string' && n++ === index) return c;
  }
  return null;
}

/**
 * The player's character on a map: the first of the `navyseals` its `READERM.ZAR/chartype.rdr` lists -- `mp2_seal1`
 * on Frostfire -- or null when the file names none.
 */
export function playerCharacter(chartype: RdrNode): string | null {
  return teamCharacter(chartype, 'navyseals', 0);
}

/** The six parts a character's `health` and `armor` records name, `character.rdr`'s own order. */
export const HEALTH_PARTS = ['head', 'body', 'larm', 'rarm', 'lleg', 'rleg'] as const;
export type HealthPart = (typeof HEALTH_PARTS)[number];

/** A character's health and armour per part, as `character.rdr` states them. */
export interface PartHealth { health: Record<HealthPart, number>; armor: Record<HealthPart, number> }

/**
 * A character's health and armour (HX-2, web sprint 31; research 238 §1): its `health` and `armor` records, each the
 * nearest in its base chain that states it (`mp_fem1 : mp_hostage_extract`), a part the record does not name 0. Null when
 * no character in the chain states a `health`. The loader `FUN_0053ddb0` (L406804-406833) reads these into the actor's
 * part tables (`../../viewer/src/net/damage` `MP_HEALTH` is the SEAL's, `mp_seal`'s).
 */
export function healthOf(table: CharacterTable, name: string): PartHealth | null {
  const health = table.get(name, 'health');
  if (health === undefined) return null;
  const parts = (n: RdrNode | undefined): Record<HealthPart, number> => Object.fromEntries(HEALTH_PARTS.map((p) => {
    const v = n === undefined ? undefined : rdrGet(n, p);
    const x = Number(Array.isArray(v) ? v[0] : v);
    return [p, Number.isFinite(x) ? x : 0];
  })) as Record<HealthPart, number>;
  return { health: parts(health), armor: parts(table.get(name, 'armor')) };
}

/**
 * HOSTAGE_HEALTH_READING (HX-2; research 238 §1, §5): the character a hostage's health is read from -- `mp_fem1-3` state
 * none of their own and take `mp_hostage_extract`'s through the base chain (`healthOf`): head 8, body 40, larm and rarm
 * 10, lleg and rleg 15, armour 0 on every part; strength 4, recovery 2 (189 §2, §14.11, V2's decoder). The room reads the
 * table, not a literal (HX-1's hit path); the part pipeline is the players' (191 §2.3).
 */
export const HOSTAGE_HEALTH_READING = 'mp_hostage_extract' as const;
