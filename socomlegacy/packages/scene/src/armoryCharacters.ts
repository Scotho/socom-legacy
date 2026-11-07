import { rdrGet, type RdrNode, type RdrTypedNode } from '@s2u/archive';
import { mapKits, type Arsenal, type Loadout, type Side } from './arsenal';
import type { CharacterTable } from './character';

/**
 * The ARMORY's eight columns on a map (web sprint 5, S1; socomlegacy/docs/research/95 §6, W5.R2): each side's four
 * character types -- `READERM.ZAR/chartype.rdr`'s `navyseals` and `terrorists`, in order, their kits through
 * `READERC.ZAR/character.rdr` (`mapKits`, research 94 §A4) -- with their body (`model_name`, `texture_asset`) and the
 * portrait the column draws.
 *
 * The portraits and the equipment library are **data** (R95.13): each map's `READERM.ZAR/mission.rdr` `UiVars` names
 * `EQUIPMENT_LIBRARY = ui/assetlib/eq/emNN` and the eight `.tif`s `Seal1..4` / `Terr1..4` (checked on all 22 maps, in
 * the same order as the `EMnn_TXR` library), which the dialog's portrait objects show through their `UIVAR`
 * (`Seal1` ... `Terr4`, research 95 §2.3). An asset library's file is named by `FUN_003199c0` (L217434-217515): the
 * last path element cut to four characters, upper-cased, `_TXR`/`_PAL` -- `ui/assetlib/eq/em02` -> `EM02_TXR.ZED`.
 *
 * The column's type index is `MpCharSet` - 1 (1-4 SEAL, 5-8 Terrorist); with no saved loadout a player is SEAL 1 /
 * TERRORIST 1, type index 0 / 4 (R95.5). A column is its type **by name**, not by `chartype.rdr` position: the
 * ARMORY's `ChangeCharacterType(n)` (`FUN_002795e0` L123889-123933) takes the name `UiCharType<n>`
 * (`FUN_002af780(n - 1)` L153845-153855), which the level load registers (`FUN_002acc10` L152446-152451: online
 * `FUN_002af8c0`, offline `FUN_002afa10`) from `mission.rdr`'s `UiVehicles` list (key 0x3f1ca8), entry n - 1's `Name`
 * (0x3f1cb8) -- online through `FUN_0053b4b0` (L405168-405202), which looks the name up in `chartype.rdr`'s
 * `navyseals`, `terrorists`, `escortees` (`FUN_0053b5f0` L405207-405245: the entry whose `name` matches, without case
 * -- `FUN_00198b80` L15553 --, its `character`). So `armoryRoster` resolves each column through `UiVehicles`
 * (`uiVehicleNames`), and its `index` is the named type's position in its side's `chartype.rdr` list -- the index the
 * kits, the bodies and the room read. On all 22 MP maps the two orders are one (research 95 §6).
 *
 * The fourth column is open and captioned "SEAL 4" / "TERRORIST 4" on MP1-MP12; on maps 51-83 the map's own
 * `InWhichAOP` names the campaign's unlockable, which the original locks without the campaign (research 95 §2.8) and
 * which redotcom opens by the owner's ruling OT.R91 (`CAMPAIGN_UNLOCKS_EARNED_RULING`, `fourthArmoryTypeOpen`).
 */

/** The eight columns' `UiVars` names, `MpCharSet` order. */
export const ARMORY_COLUMNS = ['Seal1', 'Seal2', 'Seal3', 'Seal4', 'Terr1', 'Terr2', 'Terr3', 'Terr4'] as const;
export type ArmoryColumn = (typeof ARMORY_COLUMNS)[number];

/** The type a player is without a saved loadout (R95.5: `MpCharSet` 1 / 5, `ChangeCharacterType(1)` / `(5)`). */
export const DEFAULT_ARMORY_TYPE: Readonly<Record<Side, number>> = { seal: 0, terrorist: 0 };

/** The columns a side has (`MpCharSet` 1-4 SEAL, 5-8 Terrorist; `ActivateMPCharStack{Lft,Rt}` wraps in them, §3.2). */
export const ARMORY_TYPES_PER_SIDE = 4;

/**
 * FOURTH_UNLOCK_READING (research 95 §8): the unlock valves `UnlockMPChar` tests on a campaign map (`SetSabre`,
 * `SetPius`, `SetFeral`, `SetQuixada`, `SetReaver`, `SetOfficer`, `SetSpecialist`, `SetValeska`) are the campaign's
 * (`dlgDebriefing` `TestForCompletionLevel`, §3.1); the viewer holds no campaign save, so every one reads 0.
 * Owner-ruled: unlocked (OT.R91, `CAMPAIGN_UNLOCKS_EARNED_RULING`); this reading of the original is unchanged.
 */
export const FOURTH_UNLOCK_READING = 0 as const;

/**
 * CAMPAIGN_UNLOCKS_EARNED_RULING -- OT.R91, an owner-ruled departure from the original (socomlegacy/docs/MISSION.md). The
 * owner, Craig, 2026-10-31, verbatim: "Next: please unlock all characters that are available in the online mode in
 * armory by default." and, asked to confirm: "yes there is no campaign, so we unlock all campaign characters." The
 * original reads each `Set<Name>` PERSIST valve off the player's card, 0 on a fresh one (`FOURTH_UNLOCK_READING`,
 * unchanged), so its MP ARMORY locks the fourth column on maps 51-83; redotcom has no campaign, so with this true every
 * one of the eight reads 1 (`campaignUnlockValves`) and the original's own rule opens the column. False restores the
 * original's fresh card everywhere it is read (the room, the bots, the page's ARMORY and its scripts).
 */
export const CAMPAIGN_UNLOCKS_EARNED_RULING: boolean = true;

/** The campaign's unlock valves `UnlockMPChar` tests (research 95 §3.1; `global_valves.rdr` PERSIST, default 0). */
export const CAMPAIGN_UNLOCK_VALVES = ['SetSabre', 'SetPius', 'SetFeral', 'SetQuixada', 'SetReaver', 'SetOfficer', 'SetSpecialist', 'SetValeska'] as const;

/** `UnlockMPChar`'s rows (eq/UnlockMPChar@28-1564, research 95 §3.1): each AOP's SEAL and Terrorist unlock valve. */
const UNLOCK_BY_AOP: Readonly<Record<number, readonly [string, string]>> = {
  50: ['SetSabre', 'SetPius'], 60: ['SetFeral', 'SetQuixada'], 70: ['SetReaver', 'SetOfficer'], 80: ['SetSpecialist', 'SetValeska'],
};

/**
 * The eight `Set<Name>` valves as the card holds them: 1 each under OT.R91 (`ruling` true), else the original's fresh
 * card, `FOURTH_UNLOCK_READING`. The page's ARMORY seeds its scripts with them, so `UnlockMPChar` takes its own branch.
 */
export function campaignUnlockValves(ruling: boolean = CAMPAIGN_UNLOCKS_EARNED_RULING): Map<string, number> {
  const value = ruling ? 1 : FOURTH_UNLOCK_READING;
  return new Map(CAMPAIGN_UNLOCK_VALVES.map((n) => [n, value]));
}

/**
 * Whether the fourth column is open on a map (research 95 §3.1, R95.6 as corrected by the owner's PCSX2 capture of
 * 2026-10-01 -- Crossroads, its 4th Terrorist "ALG OFFICER" under the LOCKED stamp): `UnlockMPChar`
 * (eq/UnlockMPChar@28-1564) opens it -- `DisableFourthChar=0`, "SEAL 4" / "TERRORIST 4" -- when `InWhichAOP` is 0;
 * at 50/60/70/80 it names the campaign's unlockable and locks it unless that one's `Set<Name>` valve is 1. The valves
 * are `campaignUnlockValves(ruling)`: the original's fresh card reads 0 (`FOURTH_UNLOCK_READING`), so `ruling` false
 * is the original's answer (open only at 0); by the owner's ruling OT.R91 (`CAMPAIGN_UNLOCKS_EARNED_RULING`, the
 * default) they read 1 and the column opens on 50-80 too. Each side's own valve reads the same value, so the answer
 * is the side's either way. An `InWhichAOP` with no row stays locked. `InWhichAOP` is the map's own: every MP map's
 * `mission.rdr` `Valves` set it (0 on MP1-MP12, 50 on MP51-53, 60 on MP61/62/64, 70 on MP71-73, 80 on MP81-83), over
 * the main menu's 0 (`SetMenuValve`). `valves` is the map's (`MapArsenal.valves`, `missionValves`); none read: the
 * menu's 0.
 */
export function fourthArmoryTypeOpen(valves: ReadonlyMap<string, number> | null | undefined, ruling: boolean = CAMPAIGN_UNLOCKS_EARNED_RULING): boolean {
  const aop = valves?.get('InWhichAOP') ?? 0;
  if (aop === 0) return true;
  const row = UNLOCK_BY_AOP[aop], card = campaignUnlockValves(ruling);
  return row !== undefined && row.every((n) => card.get(n) === 1);
}

/**
 * Whether a player of `side` may be type `index` on `map` (`MapArsenal`: its `kits` and its `valves`; research 95 §3.2,
 * W5.R2): one of the side's columns the map lists (`chartype.rdr`, at most `ARMORY_TYPES_PER_SIDE`), the fourth only
 * while `fourthArmoryTypeOpen` (`ActivateMPCharStack` skips it when `DisableFourthChar==1`; open on every MP map by
 * OT.R91, `ruling`). Without the map's table only the default type is (the body and the kit have nothing else to be).
 * The room, the bots and the local match all ask it.
 */
export function armoryTypeAllowed(
  map: { kits: Readonly<Record<Side, readonly unknown[]>>; valves?: ReadonlyMap<string, number> } | null | undefined, side: Side, index: unknown,
  ruling: boolean = CAMPAIGN_UNLOCKS_EARNED_RULING,
): boolean {
  if (!Number.isInteger(index)) return false;
  const i = index as number;
  if (i === DEFAULT_ARMORY_TYPE[side]) return true;
  if (!map || i < 0 || i >= Math.min(ARMORY_TYPES_PER_SIDE, map.kits[side].length)) return false;
  return i < ARMORY_TYPES_PER_SIDE - 1 || fourthArmoryTypeOpen(map.valves, ruling);
}

export interface ArmoryCharacter {
  column: ArmoryColumn;
  side: Side;
  /** 0-3 within the side (`MpCharSet` - 1, less 4 for the Terrorists). */
  index: number;
  /** `chartype.rdr`'s name (`Seal1`, `Terrorist1`) and the `character.rdr` record it names (`mp2_seal1`). */
  type: string;
  character: string;
  /** The body: `model_name` without its extension (`seal_A_scuba`), and `texture_asset`. */
  model: string | null;
  textures: string[];
  loadout: Loadout;
  /** The portrait's texture in the map's `EMnn_TXR` (`Seal1_scuba.tif`), from `UiVars`. */
  portrait: string | null;
}

export interface ArmoryRoster {
  /** `EQUIPMENT_LIBRARY` (`ui/assetlib/eq/em02`) and its file stem (`EM02`), or null. */
  equipmentLibrary: string | null;
  equipmentStem: string | null;
  /** `mission_title`, the ARMORY's `MPgamename`. */
  missionTitle: string | null;
  characters: ArmoryCharacter[];
}

/** `mission.rdr`'s `UiVars`: `{ NAME VALUE }` records, the first of a repeated name kept. */
export function missionUiVars(mission: RdrNode): Map<string, string> {
  const out = new Map<string, string>();
  const vars = rdrGet(mission, 'UiVars');
  const list = Array.isArray(vars) && typeof vars[0] === 'string' ? [vars] : Array.isArray(vars) ? vars : [];
  for (const v of list) {
    const name = rdrGet([v], 'NAME'), value = rdrGet([v], 'VALUE');
    const text = typeof value === 'string' ? value : Array.isArray(value) ? value.filter((x) => typeof x === 'string').join(' ') : undefined;
    if (typeof name === 'string' && text !== undefined && !out.has(name)) out.set(name, text);
  }
  return out;
}

/** A `UiVars` entry's value as `CUIVariableSpec` copies it: the node itself, its type kept (`RdrTypedNode`'s leaves, or a list). */
export type MissionUiVarValue =
  | { readonly type: 'int'; readonly value: number }
  | { readonly type: 'real'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'array'; readonly value: readonly MissionUiVarValue[] };

/** One `mission.rdr` `UiVars` entry as `CUIVariableSpec` reads it: NAME, VALUE (null without one), the LONGEVITY word. */
export interface MissionUiVar { name: string; value: MissionUiVarValue | null; longevity?: string }

const typedValue = (n: RdrTypedNode): MissionUiVarValue =>
  Array.isArray(n) ? { type: 'array', value: (n as readonly RdrTypedNode[]).map(typedValue) } : (n as MissionUiVarValue);
/** A typed record's value list after `key` (a string leaf), or undefined. */
function typedAfter(record: RdrTypedNode, key: string): RdrTypedNode | undefined {
  if (!Array.isArray(record)) return undefined;
  const list = record as readonly RdrTypedNode[];
  for (let i = 0; i + 1 < list.length; i++) {
    const k = list[i]!;
    if (!Array.isArray(k) && (k as { type: string }).type === 'string' && (k as { value: string }).value === key) return list[i + 1];
  }
  return undefined;
}
/** A key's one string (`FUN_0032ee10`): the list's single string leaf, or undefined. */
function typedString(record: RdrTypedNode, key: string): string | undefined {
  const v = typedAfter(record, key);
  const one = Array.isArray(v) && (v as readonly RdrTypedNode[]).length === 1 ? (v as readonly RdrTypedNode[])[0]! : v;
  return one !== undefined && !Array.isArray(one) && (one as { type: string }).type === 'string' ? (one as { value: string }).value : undefined;
}

/**
 * `mission.rdr`'s `UiVars` (parsed with `parseRdrTyped`) as `FUN_002acc10` hands each entry to `CUIVariableSpec`
 * (`FUN_00386ff0` D:L280284-280350): NAME (`FUN_0032ee10`, D:L280299); VALUE's node copied with its type
 * (`FUN_0032f390`, D:L280324), a one-element list taken as its element (D:L280305-280312) -- so an int stays an int and a
 * float a real, where `missionUiVars` flattens both to text; the LONGEVITY word, if any (D:L280329). Entries in order.
 */
export function missionUiVarEntries(mission: RdrTypedNode): MissionUiVar[] {
  let root: RdrTypedNode | undefined = mission;
  for (let d = 0; d < 64 && root !== undefined && typedAfter(root, 'UiVars') === undefined; d++) {
    root = Array.isArray(root) && (root as readonly RdrTypedNode[]).length === 1 ? (root as readonly RdrTypedNode[])[0] : undefined;
  }
  const list = root === undefined ? undefined : typedAfter(root, 'UiVars');
  if (!Array.isArray(list)) return [];
  const entries = list as readonly RdrTypedNode[];
  // One entry stands bare (`UiVars` holding the record itself), as `missionUiVars` reads it; else a list of records.
  const records = entries.length > 0 && !Array.isArray(entries[0]) ? [list] : entries;
  const out: MissionUiVar[] = [];
  for (const rec of records) {
    const name = typedString(rec, 'NAME');
    if (name === undefined) continue;
    const raw = typedAfter(rec, 'VALUE');
    const node = Array.isArray(raw) && (raw as readonly RdrTypedNode[]).length === 1 ? (raw as readonly RdrTypedNode[])[0]! : raw;
    const longevity = typedString(rec, 'LONGEVITY');
    out.push({ name, value: node === undefined ? null : typedValue(node), ...(longevity !== undefined ? { longevity } : {}) });
  }
  return out;
}

/**
 * `mission.rdr`'s `UiVehicles` list: each entry's `Name`, in order -- `UiCharType1..n`'s types (`FUN_002af8c0`
 * L153936-153991). Empty when the map has none.
 */
export function uiVehicleNames(mission: RdrNode): string[] {
  const value = rdrGet(mission, 'UiVehicles');
  const list = Array.isArray(value) && typeof value[0] === 'string' ? [value] : Array.isArray(value) ? value : [];
  return list.map((e) => rdrGet([e], 'Name')).map((n) => (typeof n === 'string' ? n : Array.isArray(n) && typeof n[0] === 'string' ? n[0] : ''));
}

/** An asset library's file stem (`FUN_003199c0`): the last path element's first four characters, upper-cased. */
export function assetLibStem(library: string): string {
  const last = library.split(/[\\/]/).filter((p) => p.length > 0).pop() ?? '';
  return last.slice(0, 4).toUpperCase();
}

/** A map's ARMORY roster from its parsed scripts and the arsenal. */
export function armoryRoster(arsenal: Arsenal, mission: RdrNode, chartype: RdrNode, character: RdrNode, table: CharacterTable): ArmoryRoster {
  const vars = missionUiVars(mission);
  const kits = mapKits(arsenal, chartype, character);
  const vehicles = uiVehicleNames(mission);
  const characters: ArmoryCharacter[] = [];
  (['seal', 'terrorist'] as const).forEach((side, s) => {
    kits[side].slice(0, 4).forEach((_, position) => {
      const column = ARMORY_COLUMNS[s * 4 + position]!;
      // The column's type by its `UiVehicles` name (`FUN_0053b4b0`: the name looked up in the side's `chartype.rdr`
      // list); without the entry, or with a name the side does not list, its position in `chartype.rdr`.
      const named = vehicles[s * 4 + position]?.toLowerCase();
      const found = named === undefined ? -1 : kits[side].findIndex((k) => k.type.toLowerCase() === named);
      const index = found >= 0 && found < ARMORY_TYPES_PER_SIDE ? found : position;
      const kit = kits[side][index]!;
      const tex = table.get(kit.character, 'texture_asset');
      characters.push({
        column, side, index, type: kit.type, character: kit.character, model: table.model(kit.character),
        textures: (Array.isArray(tex) ? tex : tex === undefined ? [] : [tex]).filter((t): t is string => typeof t === 'string'),
        loadout: kit.loadout, portrait: vars.get(column) ?? null,
      });
    });
  });
  const library = vars.get('EQUIPMENT_LIBRARY') ?? null;
  return {
    equipmentLibrary: library, equipmentStem: library === null ? null : assetLibStem(library),
    missionTitle: vars.get('mission_title') ?? null, characters,
  };
}
