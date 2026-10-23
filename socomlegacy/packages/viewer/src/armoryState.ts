import {
  applyPicks, EMPTY_ITEM, FULL_SLOT, ITEM, menuValves, pick as pickItem, selectable, slotLocked, VALVE_OF_ITEM,
  type Arsenal, type Loadout, type Pick, type Side,
} from '@s2u/scene';
import { equipmentLimitKit } from './equipmentLimit';

/**
 * The pre-round ARMORY's states and rules without a pixel (web sprint 5, S3; socomlegacy/docs/research/95 §4.2, the
 * STATE TABLE S0-S7). The game's ARMORY is almost all script (R95.1): `dlg_equipment_mp.rdr`'s and `ShowAndSpin.rdr`'s
 * animations in `RUN/UIZANIM.ZAR`, over ~30 bound C functions. This module is that behaviour's logic -- which column,
 * which row, which item, what a press does, what is stored -- stepped by the pad's just-pressed edges; for its looks it
 * names the script animations the game runs at each step (`run`), which `./uiScript` plays over the dialog's objects
 * (`./armory`, `./armoryLayout`). Every row of the table is `test/armoryState.test.ts`'s.
 *
 * - **S0 Boot** (`open`): the screen's ONSTART animations (`UnlockMPChar`, `OnlyModes`, `UiEquipSwitch`, `MPSealPlace`,
 *   `MPTypeValveSet`; the layout's `ANIMATIONS`); a stored profile captions its column "CUSTOM" and is the cursor, else
 *   `MpCharSet` 1 / 5 (R95.5); the slide runs while S1 already takes input (§3.1).
 * - **S1 Character select**: Left/Right the column, wrapping in the side's four, the 4th skipped when locked
 *   (`ActivateMPCharStack{Lft,Rt}`); Up/Down `.DINK` only (`NothingUp`/`NothingDwn`); Cross commits (S1a); Triangle
 *   leaves (`returnto_lobby`); Circle and Square are unbound here.
 * - **S1a Commit** (`OnMp{Seal,Terr}BtnPress`): `ChangeCharacterType(n)`, the other columns drop, the chosen slides,
 *   input suspended 0.5 s, then S2 on the Primary row (Secondary when `EQlimit==1`).
 * - **S2 Weapon row r** (`EquipWeaponBtn`, rows 1-5): Left/Right step the row's item in the scroll order (§3.4), applied
 *   at once; Up/Down the rows, a row whose item is 253-255 skipped, 6 the DONE row (S3); Square stores (S5); Circle the
 *   type's whole default kit (S6); Triangle the confirm (S4).
 * - **S3 DONE row** (`EquipMPDoneBtn`): Cross leaves; Up/Down back to the rows; Circle S6; Triangle S4.
 * - **S4 Confirm** (`OnEquipWeaponBtnDefault`): popup 1245, open on NO; YES back to S1 with the kit kept, NO back where it was.
 * - **S5 Store** (`StoringLoadout`, online, `EQlimit==0`): the record written (`CharacterProfile` 1, `SaveCharacterProfile`
 *   3/4), "CUSTOM" on the column, input suspended until the save's 3 s are up.
 * - **S6 Defaults** (`returnto_Defaults`): `ChooseDefaultEquipment` -- the type's whole kit (R95.3) -- the record's valid
 *   flag cleared (mode 7), input suspended 2.3 s, no sound.
 * - **S7 Pulled out** (`UiBackToLobby`): popup 47 over the screen 5 s before the next round (R95.7) -- a notice, the
 *   screen still the player's, closed by the round's start (`ARMORY_CLOCK_READING`; a seat's screen, `ARMORY_SEAT_READING`).
 *
 * **Live** (W5.R1 as the controller ruled under the owner's mandate, the S3 review): the game's `ChangeCharacterType`
 * and `Choose*` apply at once, so each change of the committed type or of its kit -- the commit (S1a), an item step
 * (S2), the defaults (S6), a stored record opened on -- hands the page the type, its kit and the picks that reach it
 * (`ArmoryEvents.change`), which the page applies for the next spawn through web sprint 5 S2's seam
 * (`setCharacterType` and the side's picks) and sends the room as it happens. Leaving (DONE, Triangle on S1, the
 * round's start) simply closes (`ArmoryEvents.closed`). The rules a step obeys are the room's own (`@s2u/scene`
 * `selectable`, `slotLocked`, `pick`, which the server replays through `applyPicks`): `ARMORY_RULES_READING`.
 */

/** The pad's inputs the ARMORY reads (the controls' `BUTTON` bindings, research 95 §2.5). */
export type ArmoryInput = 'up' | 'down' | 'left' | 'right' | 'cross' | 'circle' | 'square' | 'triangle';

/**
 * The sounds the screen plays (research 95 §3.9; `HUDUI.bnk`: .DINK 0, .SLIDE 3, .NEG 4, .TYPE 7, .METAL 8). The
 * scripts play their own `SOUND`s (`./armory`); a step names a .DINK or a .SLIDE only where it is the `SOUND` of a
 * script the page does not run (`ARMORY_STATE_SOUNDS`); .METAL is `uisounds.rdr`'s SELECTION, the popup's keys'
 * (`FUN_00370990`; research 118 §4, research 122 R122.7); .TYPE the typed description's tick (`./armoryText`).
 */
export type ArmorySound = '.DINK' | '.SLIDE' | '.NEG' | '.TYPE' | '.METAL';

/** `uisounds.rdr` `SOUNDS` SELECTION -> `.METAL` (research 95 §3.9; `armoryData` reads the table): the UI's SELECTION. */
export const SELECTION_SOUND = '.METAL' as const satisfies ArmorySound;

/**
 * ARMORY_STATE_SOUNDS (research 182 §2.21; ARMORY-UI, 2026-10-04): every script `SOUND` plays (`./armory`), so a step
 * voices a sound itself only where the script that carries it is one the page does not run -- the entering .DINK (the
 * lobby's), `ActivateMPCharStack{Lft,Rt}` and `NothingUp`/`NothingDwn` (.DINK), `ActivateMPEquipStack{Up,Down}`
 * (.DINK), `OnEquipWeaponBtn{Left,Right}` (.SLIDE), `OnEquipDoneBtnPress` and `returnto_lobby` (.DINK). The commit's
 * (`OnMp*BtnPress`), the store's (`StoringLoadout`) and YES's (`OnMPWeaponBtnTriangle`) the page runs: the state names
 * none there, so nothing sounds twice. The sites, read off the disc's sets (the Frostfire fixture): `dlg_equipment_mp.rdr`
 * 14 .DINK, `ShowAndSpin.rdr` 2 .SLIDE and 43 .NEG.
 */
export const ARMORY_STATE_SOUNDS = 'the SOUNDs of the scripts the page does not run' as const;

/**
 * S0-S7 of the STATE TABLE (research 95 §4.2). S0 (the slide) and S1a (the commit's drop and slide) are the scripts'
 * animations over S1 and S2, which take input at once / after the commit's 0.5 s suspension.
 */
export type ArmoryScreen = 'closed' | 'select' | 'row' | 'done' | 'confirm' | 'store' | 'defaults';

/**
 * ARMORY_RULES_READING: the ARMORY's own slot rules (`CanCharactersSelectUIWeapon` 0x280d60 -> `FUN_00280e90`
 * L127738-127786; the free-slot count `FUN_00284120` L129298-129373; the cost-2 partner `FUN_00282f20`) are the armory
 * twins of research 94's in-game rules (R94, research 95 §4.3). The viewer steps by the in-game rules the room replays
 * (`selectable`, `slotLocked`, `pick`), so every item the screen shows is one the room takes: the two readings differ
 * only where a cost-2 item's partner slot holds a locked item (the ARMORY refuses with its text, the in-game rule
 * overwrites), which no map's default kit reaches.
 */
export const ARMORY_RULES_READING = 'in-game rules (the room replays them)' as const;

/**
 * ARMORY_EMPTY_PICK_READING: the equipment scroll's UI 0 (empty, id 255; §3.4 "35 -> ... -> 57 -> 0 -> 35") is
 * skipped: the room's replay has no pick of an empty slot (`applyPicks` refuses an item the arsenal lacks), so the
 * ARMORY never offers one the room would refuse.
 */
export const ARMORY_EMPTY_PICK_READING = 'skipped' as const;

/**
 * SUSPEND_MENU_INPUT_READING (research 95 §8): `SuspendMenuInput`'s argument in seconds, a "0" ending it. What each
 * step leaves suspended once its script has run its course: the commit 0.5 s (`OnMp*BtnPress`); a weapon step 0.2 s
 * after it (`OnEquipWeaponBtn{Left,Right}` "5" ... "0.2"); the store until the save's second sequence ends (4.0 at its
 * start, "0.0" after `SaveCharacterProfile`, whose WAIT is 3 s); the defaults 2.3 s (`returnto_Defaults`, no "0"); the
 * confirm's answer 1.5 s (`OnEquipWeaponBtnDefault`); the column steps none ("3.0" then "0" at once).
 */
export const SUSPEND = { commit: 0.5, weaponStep: 0.2, store: 3.0, defaults: 2.3, confirm: 1.5 } as const;

/** The pull-out's popup time (`UiBackToLobby`: popup 47, WAIT 5, research 95 §4.1): the notice's lead on the round. */
export const PULL_OUT_SECONDS = 5;

/** The popups' `UIMnLOC` ids (research 95 §3.3, §4.1): the confirm's text and buttons, the pull-out's text. */
export const POPUP_TEXT = { confirm: 1245, no: 246, yes: 253, pulled: 47 } as const;

/**
 * ARMORY_CONFIRM_VALUE_READING (research 95 §8): the confirm's answer, `AreYouSure` = the chosen button's record index
 * + 1 -- NO (246, the first record) 1, YES (253, the second) 2, which is what the script tests (2 back to character
 * select, 1 the popup away).
 */
export const ARMORY_CONFIRM_VALUE_READING = { no: 1, yes: 2 } as const;
/**
 * ARMORY_POPUP_FOCUS (research 182 §2.15, verified by V4 #3; research 118 §4; was ARMORY_POPUP_FOCUS_READING, 'yes'): a
 * record with buttons (+66) focuses its first slot (D:L266863, D:L267136-267137), which in record 1245 is NO (246). The
 * popup's keys (`FUN_00370990` D:L268476-268549): LEFT or RIGHT toggles the slot, CROSS answers, each with SELECTION;
 * TRIANGLE answers only when the record's +64 is set, and 1245's is 0, so it does nothing; UP and DOWN are no keys of it.
 */
export const ARMORY_POPUP_FOCUS = 'no' as const;

/** The rows (`UiLastEquipClassBtn`): 1 primary, 2 secondary, 3-5 equipment 1-3, 6 DONE (research 95 §3.3). */
export const DONE_ROW = 6;

/** Each row's handler (the scripts' `On*Btn`), for its looks. */
export const ROW_ANIMS = ['OnMpPrimaryBtn', 'OnMpSecondaryBtn', 'OnMPEquipEquip1Btn', 'OnMPEquipEquip2Btn', 'OnMPEquipEquip3Btn', 'OnMPEquipDoneAct'] as const;

// ---------------------------------------------------------------------------------------------------------------------
// UI indices and item ids.

/**
 * `FUN_003d3230` (L325704-325934): an item id to its ARMORY UI index (the `primsel`/`secsel`/`equipNsel` valves,
 * `UiWeapon`; `UpdateSelItemValves` `FUN_00282140` L128400 writes them through it). 255 (empty) is UI 0, 254
 * (`FULL_SLOT`) UI 255, 185 (LAW HEAT) UI 254; an id it does not list is 0xfe.
 */
export const UI_OF_ITEM: ReadonlyMap<number, number> = new Map([
  [EMPTY_ITEM, 0], [FULL_SLOT, 255], [ITEM.LAW_HEAT, 254], [141, 252], [128, 58], [183, 57], [182, 56], [181, 55],
  [186, 40], [127, 53], [195, 52], [146, 51], [145, 50], [158, 38], [176, 48], [178, 47], [179, 46], [175, 45],
  [173, 44], [171, 43], [151, 42], [153, 41], [152, 54], [123, 39], [122, 49], [126, 37], [121, 36], [194, 35],
  [13, 85], [12, 84], [11, 83], [7, 82], [8, 78], [4, 80], [14, 79], [5, 81], [6, 77], [16, 76], [15, 75],
  [67, 65], [104, 34], [63, 33], [38, 32], [66, 31], [64, 30], [65, 29], [68, 28], [84, 27], [81, 26], [83, 25],
  [52, 24], [34, 23], [142, 22], [143, 21], [62, 20], [61, 19], [54, 18], [103, 17], [101, 15], [105, 14], [106, 13],
  [92, 12], [91, 11], [102, 10], [37, 9], [57, 8], [60, 7], [59, 5], [58, 4], [31, 3], [33, 2], [51, 1],
]);
/** The inverse: a UI index to its item id (UI 0 empty, 255 `FULL_SLOT`, 254 LAW HEAT). */
export const ITEM_OF_UI: ReadonlyMap<number, number> = new Map([...UI_OF_ITEM].map(([id, ui]) => [ui, id]));

/** An item's UI index (0xfe for one `FUN_003d3230` does not list). */
export function uiOf(id: number): number { return UI_OF_ITEM.get(id) ?? 0xfe; }

/**
 * The scroll orders (research 95 §3.4, `ShowAndSpin` `ScrollRight`; `ScrollLeft` the exact inverse): the primaries
 * 1..5, 7..15, 17..34, 65 (6 and 16 do not exist); the secondaries 75..85; the equipment 35..57 then 0 (empty).
 */
export const SCROLL = {
  primary: [1, 2, 3, 4, 5, ...range(7, 15), ...range(17, 34), 65],
  secondary: range(75, 85),
  equipment: [...range(35, 57), 0],
} as const;
function range(a: number, b: number): number[] { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

/** The side's `player_team` (0 SEAL, 8 Terrorist) and its valve bit (`&1` / `&8`). */
export const TEAM: Readonly<Record<Side, number>> = { seal: 0, terrorist: 8 };

/**
 * Whether a step of the scroll may stop on UI `ui` for `side` (§3.4): the item's `Enable_` valve admits the side --
 * primaries and pistols **exactly** 9, or the side's bit alone (1 / 8), so a valve carrying a lock bit is passed;
 * equipment by the bit (`&1` / `&8`). An item with no valve (`VALVE_OF_ITEM`) is passed.
 */
export function scrollAdmits(valves: ReadonlyMap<string, number>, side: Side, ui: number): boolean {
  const id = ITEM_OF_UI.get(ui);
  if (id === undefined) return false;
  const name = VALVE_OF_ITEM.get(id);
  if (name === undefined) return false;
  const v = valves.get(name) ?? 0, bit = side === 'seal' ? 1 : 8;
  return ui >= 35 && ui <= 57 ? (v & bit) !== 0 : v === 9 || v === bit;
}

// ---------------------------------------------------------------------------------------------------------------------
// The context and the state.

/** What the screen sees of the world. */
export interface ArmoryContext {
  arsenal: Arsenal;
  /** The map's valves (`mission.rdr` `Valves`). */
  valves: ReadonlyMap<string, number>;
  side: Side;
  /** The side's types' own kits (`chartype.rdr` order, at most four): the columns; `ChooseDefaultEquipment`'s kit. */
  kits: readonly Loadout[];
  /** The 4th column open (`@s2u/scene` `fourthArmoryTypeOpen`: the map's `InWhichAOP` 0, R95.6 as corrected; every map by OT.R91). */
  fourthOpen: boolean;
  /** CREATE GAME's EQlimit (research 362); absent game contexts pass 0. */
  eqLimit: number;
  /** `ComeFromLan` (the viewer's matches are the online path, 0). */
  comeFromLan: boolean;
}

export interface ArmoryState {
  screen: ArmoryScreen;
  /** The cursor's column, 0-3 within the side (`MpCharSet` - 1, less 4 for the Terrorists). */
  column: number;
  /** The type `ChangeCharacterType` last set, or null before a commit (and without a stored profile). */
  committed: number | null;
  /** `UiLastEquipClassBtn`, 1-6. */
  row: number;
  /** Each column's kit as the screen has it (the type records' own, `ChooseDefaultEquipment`'s or the picks'). */
  kits: Loadout[];
  /** Each column's picks since its own kit, in order: what the room replays. */
  picks: Pick[][];
  /** The column captioned "CUSTOM" (24): the stored profile's, or the one just stored. */
  custom: number | null;
  /** The confirm's focused button. */
  focus: 'yes' | 'no';
  /** Where the confirm, the store and the defaults return to. */
  back: 'row' | 'done';
  /** Seconds (the caller's clock): when the screen opened, when this screen began, input suspended until. */
  openedAt: number;
  since: number;
  suspendedUntil: number;
  /** The pull-out's notice (popup 47) since when, or null (S7: `pullOut`). */
  pulledAt: number | null;
  /** The type and kit the page holds for the side (what the last `change` handed on, or the page's at the opening). */
  applied: { type: number; kit: Loadout } | null;
}

/** The profile record (`FUN_002fb610` L198800-198900): `{MpCharSet, prim, sec, eq1, eq2, eq3, valid}`, one per side. */
export interface ArmoryProfile { charSet: number; items: [number, number, number, number, number]; valid: boolean }

/** A change handed on (live): the committed type and its kit, and the picks that reach it from the type's own kit. */
export interface ArmoryExit { type: number; kit: Loadout; picks: Pick[] }

/** What a step asks of the page. */
export interface ArmoryEvents {
  sounds: ArmorySound[];
  /** Script animations to start, in order, after `valves` are written. */
  run: string[];
  /** Valves the scripts read, as the state has them (`armoryValves`). */
  valves: Record<string, number>;
  /** The profile to store (S5), or 'clear' (S6's mode 7). */
  store?: ArmoryProfile | 'clear';
  /** The committed type or its kit changed: what the page applies now, for the next spawn (live, W5.R1). */
  change?: ArmoryExit;
  /** The screen closed (DONE, Triangle on character select, the page's close). */
  closed?: true;
}

const none = (): ArmoryEvents => ({ sounds: [], run: [], valves: {} });

/** The columns a side has on the map (at most four), and whether the 4th is reachable. */
export function columnCount(ctx: ArmoryContext): number {
  return Math.min(4, ctx.kits.length);
}
export function reachable(ctx: ArmoryContext, c: number): boolean {
  return c >= 0 && c < columnCount(ctx) && (c < 3 || ctx.fourthOpen);
}

/** `MpCharSet` for a column (1-4 SEAL, 5-8 Terrorist). */
export function charSetOf(side: Side, column: number): number { return column + 1 + (side === 'terrorist' ? 4 : 0); }

/** The UI index shown on row `row` (1-5) of a kit. */
export function rowUi(kit: Loadout, row: number): number { return uiOf(kit[row - 1]!); }

/** The kit the screen works on: the committed type's (S2-S6), else the cursor's. */
export function activeColumn(s: ArmoryState): number { return s.committed ?? s.column; }

/**
 * The valves the scripts branch on, as the state has them (research 95 §3): `player_team`, `MpCharSet`, `UiCharSet`,
 * `UiLastEquipClassBtn`, `UiWeapon`, `primsel` .. `equip3sel` (`UpdateSelItemValves`), `EQlimit`, `ComeFromLan`,
 * `InWhichAOP` (the map's own, `mission.rdr`; research 95 §2.8), `DisableFourthChar`, `ArmoryType` (1, `MPTypeValveSet`), and `AreYouSure`.
 */
export function armoryValves(ctx: ArmoryContext, s: ArmoryState): Record<string, number> {
  const col = activeColumn(s), kit = s.kits[col] ?? s.kits[0]!;
  const set = charSetOf(ctx.side, s.screen === 'select' ? s.column : col);
  return {
    player_team: TEAM[ctx.side], MpCharSet: set, UiCharSet: 1 << (set - 1), UiLastEquipClassBtn: s.row,
    UiWeapon: s.row >= 1 && s.row <= 5 ? rowUi(kit, s.row) : 0,
    primsel: rowUi(kit, 1), secsel: rowUi(kit, 2), equip1sel: rowUi(kit, 3), equip2sel: rowUi(kit, 4), equip3sel: rowUi(kit, 5),
    EQlimit: ctx.eqLimit, ComeFromLan: ctx.comeFromLan ? 1 : 0, InWhichAOP: ctx.valves.get('InWhichAOP') ?? 0, DisableFourthChar: ctx.fourthOpen ? 0 : 1, ArmoryType: 1,
    AreYouSure: s.screen === 'confirm' ? 0 : s.focus === 'yes' ? ARMORY_CONFIRM_VALUE_READING.yes : ARMORY_CONFIRM_VALUE_READING.no,
  };
}

/** The screen closed. */
export function closedArmory(ctx: ArmoryContext): ArmoryState {
  return {
    screen: 'closed', column: 0, committed: null, row: 1, kits: ctx.kits.slice(0, 4).map((k) => [...k] as unknown as Loadout),
    picks: ctx.kits.slice(0, 4).map(() => []), custom: null, focus: ARMORY_POPUP_FOCUS, back: 'row',
    openedAt: 0, since: 0, suspendedUntil: 0, pulledAt: null, applied: null,
  };
}

/**
 * The picks that reach `kit` from `base` under the room's rules: one per changed slot, slot order (as the rows are
 * walked), when that replays to the very kit (`applyPicks`); else `log`, the picks as they were made, when that does;
 * else null.
 */
export function picksToReach(ctx: ArmoryContext, base: Loadout, kit: Loadout, log: readonly Pick[] = []): Pick[] | null {
  const same = (a: Loadout, b: Loadout): boolean => a.every((x, i) => x === b[i]);
  if (same(base, kit)) return [];
  const out: Pick[] = [];
  let at = base;
  for (let slot = 0; slot < 5; slot++) {
    if (at[slot] === kit[slot]) continue;
    out.push({ slot, id: kit[slot]! });
    at = pickItem(ctx.arsenal, ctx.valves, ctx.side, at, slot, kit[slot]!).loadout;
  }
  const replay = (list: readonly Pick[]): boolean => {
    const r = applyPicks(ctx.arsenal, ctx.valves, ctx.side, base, list);
    return !('refused' in r) && same(r.loadout, kit);
  };
  if (replay(out)) return out;
  return log.length && replay(log) ? [...log] : null;
}

/**
 * A stored profile read back for this map and side (`EquipCharacterProfileSeal/Merc*`, `UICharacterProfile.rdr`; research
 * 95 §4.4): the column and the kit it reaches, or null when the record is invalid, names another side's or a column the
 * map lacks. Per item (research 182 §2.18; ARMORY-UI, 2026-10-04): each stored item is re-chosen (`ChoosePrimary` ..
 * `ChooseEquip3`) only when its UI index names an item whose `Enable_` valve has the side's bit (`&1` SEAL, `&8`
 * Terrorist) and the slot takes it (the Choose functions' own refusals: the room's `selectable`); a refused item is
 * skipped and its slot keeps what it held -- the type's own item (`ChangeCharacterType` leaves the kit alone,
 * `FUN_002795e0` D:L123887-123935). The kit is never dropped whole.
 */
export function readProfile(ctx: ArmoryContext, p: ArmoryProfile | null): { column: number; kit: Loadout; picks: Pick[] } | null {
  if (!p || !p.valid) return null;
  const column = p.charSet - 1 - (ctx.side === 'terrorist' ? 4 : 0);
  if (!Number.isInteger(column) || !reachable(ctx, column)) return null;
  const base = ctx.kits[column]!, bit = ctx.side === 'seal' ? 1 : 8;
  let kit = base;
  const log: Pick[] = [];
  p.items.forEach((ui, slot) => {
    const id = ITEM_OF_UI.get(ui);
    if (id === undefined || kit[slot] === id) return;
    const valve = VALVE_OF_ITEM.get(id);
    if (valve === undefined || ((ctx.valves.get(valve) ?? 0) & bit) === 0) return;
    if (!selectable(menuValves(ctx.valves, kit[0]!), ctx.side, kit, slot, id)) return;
    kit = pickItem(ctx.arsenal, ctx.valves, ctx.side, kit, slot, id).loadout;
    log.push({ slot, id });
  });
  const picks = picksToReach(ctx, base, kit, log);
  return picks === null ? { column, kit: base, picks: [] } : { column, kit, picks };
}

/** The record Square stores for the committed column (`CharacterProfile` mode 1). */
export function profileOf(ctx: ArmoryContext, s: ArmoryState): ArmoryProfile {
  const col = activeColumn(s), kit = s.kits[col]!;
  return { charSet: charSetOf(ctx.side, col), items: [1, 2, 3, 4, 5].map((r) => rowUi(kit, r)) as ArmoryProfile['items'], valid: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// The steps.

/**
 * S0: the screen opens at `t`. `current` is the type the page holds for the side's next spawn and its kit (the type
 * records' own kit, as `UpdateSelItemValves` reads it); `profile` the stored record, if any. With a valid profile its
 * column is the cursor, captioned "CUSTOM", and committed (the lobby holds it), else the cursor is `MpCharSet` 1 / 5.
 *
 * `chosen` (ARMORY-SAVE, the game lobby's page; research 167 §7): `current` is a character committed in the ARMORY since
 * the lobby's entry -- the console's `IDFromBriefing` 1 (`OnMp{Seal,Terr}BtnPress`, research 95 §3.2), under which the
 * lobby's `FromBriefing` loads no record over the choice (tools/test/onlineDialogs.pinned.json P:L7561) and the ARMORY's
 * own entry only captions the stored column (`UiEquipSwitch`: `CharacterProfile` 2, no mode 0; research 95 §3.1). Then
 * the record captions its column "CUSTOM" and nothing more: the kits, the cursor (`MpCharSet`, the committed type: the
 * entry leaves it when a profile exists) and the page's choice stand. [reading, pending review]
 */
export function openArmory(ctx: ArmoryContext, t: number, current: { type: number; kit: Loadout } | null, profile: ArmoryProfile | null,
  onstart: readonly string[], opts: { chosen?: boolean } = {}): { state: ArmoryState; events: ArmoryEvents } {
  const s = closedArmory(ctx);
  if (ctx.eqLimit === 0 && current && reachable(ctx, current.type)) {
    s.kits[current.type] = [...current.kit] as unknown as Loadout;
    s.picks[current.type] = picksToReach(ctx, ctx.kits[current.type]!, current.kit) ?? [];
    s.applied = { type: current.type, kit: s.kits[current.type]! };
  }
  const stored = ctx.eqLimit === 0 ? readProfile(ctx, profile) : null;
  const keep = opts.chosen === true && current !== null && reachable(ctx, current.type);
  if (stored && keep) {
    s.custom = stored.column; s.column = current!.type;
  } else if (stored) {
    s.column = stored.column; s.committed = stored.column; s.custom = stored.column;
    s.kits[stored.column] = stored.kit; s.picks[stored.column] = stored.picks;
  }
  s.screen = 'select'; s.openedAt = t; s.since = t; s.suspendedUntil = t;
  // The lobby holds a stored record (UiEquipSwitch's "CUSTOM"): live, it is the page's from the opening.
  const events: ArmoryEvents = { sounds: ['.DINK'], run: [...onstart], valves: {} };
  // UiEquipSwitch reruns the mode's forced kits on every entry, even after a previous manual restricted choice.
  if (ctx.eqLimit !== 0 && current && reachable(ctx, current.type)) {
    // Mode 4 rewrites equipment only; its current primary/secondary survive native EquipStart (research 362 §2).
    const kit = equipmentLimitKit(current.kit, ctx.valves, ctx.side, ctx.eqLimit);
    const picks = picksToReach(ctx, ctx.kits[current.type]!, kit) ?? [];
    s.kits[current.type] = kit;
    s.picks[current.type] = picks;
    s.applied = { type: current.type, kit };
    if (current.kit.some((id, i) => id !== kit[i])) events.change = { type: current.type, kit, picks };
  }
  events.valves = armoryValves(ctx, s);
  return live(ctx, s, events);
}

/** The change a state carries over what the page holds (`applied`), if any: handed on, and held from now (live). */
function live(ctx: ArmoryContext, s: ArmoryState, events: ArmoryEvents): { state: ArmoryState; events: ArmoryEvents } {
  if (s.committed === null) return { state: s, events };
  const kit = s.kits[s.committed]!, was = s.applied;
  if (was && was.type === s.committed && was.kit.every((x, i) => x === kit[i])) return { state: s, events };
  const picks = picksToReach(ctx, ctx.kits[s.committed]!, kit, s.picks[s.committed]) ?? [];
  return { state: { ...s, applied: { type: s.committed, kit } }, events: { ...events, change: { type: s.committed, kit, picks } } };
}

/** The side's buttons' animation (`EquipMp{Seal,Terr}Btn`). */
const btn = (ctx: ArmoryContext, what: 'Act' | 'Press'): string => `OnMp${ctx.side === 'seal' ? 'Seal' : 'Terr'}Btn${what}`;

/** The next row from `row` in `dir` (+1 Down, -1 Up), 1..6 cyclic, a row 1-5 whose UI index is 253-255 skipped (`ActivateMPEquipStack*`). */
export function nextRow(kit: Loadout, row: number, dir: 1 | -1): number {
  let r = row;
  for (let k = 0; k < 6; k++) {
    r = ((r - 1 + dir + 6) % 6) + 1;
    if (r === DONE_ROW || rowUi(kit, r) < 253) return r;
  }
  return row;
}

/**
 * Left/Right on row `row` (1-5) of `kit` (§3.4): the next item in the row's scroll order the side's valves admit
 * (`scrollAdmits`) that the room's rules put in the slot (`selectable` under the menu's valves; `ARMORY_RULES_READING`);
 * null when the slot is locked (the script's refusals: a lock-bit item, `DoAllSelCharsHaveLockedEquip*`) or nothing else
 * is admitted.
 */
export function stepItem(ctx: ArmoryContext, kit: Loadout, row: number, dir: 1 | -1): number | null {
  const slot = row - 1;
  const seen = menuValves(ctx.valves, kit[0]!);
  if (slotLocked(seen, ctx.side, kit, slot)) return null;
  const order: readonly number[] = row === 1 ? SCROLL.primary : row === 2 ? SCROLL.secondary : SCROLL.equipment;
  const n = order.length, at = order.indexOf(rowUi(kit, row));
  const start = at >= 0 ? at : dir > 0 ? -1 : n;           // an item off the order (254/255): from the order's end
  for (let k = 1; k <= n; k++) {
    const ui = order[(((start + dir * k) % n) + n) % n]!;
    if (ui === 0) continue;                                  // ARMORY_EMPTY_PICK_READING
    if (ui === rowUi(kit, row)) return null;
    if (!scrollAdmits(ctx.valves, ctx.side, ui)) continue;
    const id = ITEM_OF_UI.get(ui)!;
    if (selectable(seen, ctx.side, kit, slot, id)) return id;
  }
  return null;
}

/** Whether input is taken at `t`: open, and not suspended. */
export function takesInput(s: ArmoryState, t: number): boolean {
  return s.screen !== 'closed' && s.screen !== 'store' && s.screen !== 'defaults' && t >= s.suspendedUntil;
}

/** Leaves: closed, every change already handed on (live). */
function leave(s: ArmoryState, t: number, sound: boolean): { state: ArmoryState; events: ArmoryEvents } {
  const state: ArmoryState = { ...s, screen: 'closed', since: t };
  return { state, events: { ...none(), sounds: sound ? ['.DINK'] : [], closed: true } };
}

/** Leaves now with no sound (the page closing the screen: the round's start, a new match). */
export function closeArmory(s: ArmoryState, t: number): { state: ArmoryState; events: ArmoryEvents } {
  return leave(s, t, false);
}

function row(ctx: ArmoryContext, s: ArmoryState, r: number, t: number, extra: Partial<ArmoryState> = {}): ArmoryState {
  return { ...s, ...extra, screen: r === DONE_ROW ? 'done' : 'row', row: r, since: t };
}

/**
 * Ui_MP_{SEAL,MERC}_EquipStart and returnto_Defaults rerun SetMPCharWeaponValves for every type (research 362 §2).
 * No Bombs keeps each type's firearms; only Circle first calls ChooseDefaultEquipment for the selected type.
 */
function resetRestricted(ctx: ArmoryContext, s: ArmoryState, defaultColumn?: number): { kits: ArmoryState['kits']; picks: ArmoryState['picks'] } {
  const kits = s.kits.map((kit, c) => equipmentLimitKit(c === defaultColumn ? ctx.kits[c]! : kit, ctx.valves, ctx.side, ctx.eqLimit));
  return { kits, picks: kits.map((kit, c) => picksToReach(ctx, ctx.kits[c]!, kit, s.picks[c]) ?? []) };
}

/** One just-pressed input at `t` (seconds, the caller's clock). */
export function stepArmory(ctx: ArmoryContext, s: ArmoryState, input: ArmoryInput, t: number): { state: ArmoryState; events: ArmoryEvents } {
  if (!takesInput(s, t)) return { state: s, events: none() };
  // Every step's valves, and the change it makes to the committed type or its kit handed on (live).
  const withValves = (state: ArmoryState, e: Partial<ArmoryEvents>): { state: ArmoryState; events: ArmoryEvents } =>
    live(ctx, state, { sounds: [], run: [], ...e, valves: armoryValves(ctx, state) });

  if (s.screen === 'select') {
    if (input === 'left' || input === 'right') {
      const n = columnCount(ctx), dir = input === 'right' ? 1 : -1;
      let c = s.column;
      for (let k = 0; k < n; k++) { c = (c + dir + n) % n; if (reachable(ctx, c)) break; }
      return withValves({ ...s, column: c }, { sounds: ['.DINK'], run: [btn(ctx, 'Act')] });
    }
    if (input === 'up' || input === 'down') return withValves(s, { sounds: ['.DINK'] });
    if (input === 'cross') {
      const first = ctx.eqLimit === 1 ? 2 : 1;
      const state = row(ctx, s, first, t, { committed: s.column, suspendedUntil: t + SUSPEND.commit });
      return withValves(state, { run: [btn(ctx, 'Press')] });   // its .DINK is OnMp*BtnPress's (ARMORY_STATE_SOUNDS)
    }
    // No control binding for Triangle here, so the screen's `returnto_lobby` (`ARMORY_BUTTON_PRECEDENCE_READING`).
    if (input === 'triangle') return leave(s, t, true);
    return { state: s, events: none() };                    // Circle, Square: unbound on character select
  }

  if (s.screen === 'row' || s.screen === 'done') {
    const col = activeColumn(s), kit = s.kits[col]!;
    if (input === 'up' || input === 'down') {
      const r = nextRow(kit, s.row, input === 'down' ? 1 : -1);
      return withValves(row(ctx, s, r, t), { sounds: ['.DINK'], run: [ROW_ANIMS[r - 1]!] });
    }
    if (input === 'triangle') {
      return withValves({ ...s, screen: 'confirm', focus: ARMORY_POPUP_FOCUS, back: s.screen === 'done' ? 'done' : 'row', since: t },
        { run: ['OnEquipWeaponBtnDefault'] });
    }
    if (input === 'circle') {
      const kits = s.kits.slice(), picks = s.picks.slice();
      kits[col] = [...ctx.kits[col]!] as unknown as Loadout; picks[col] = [];
      const reset = ctx.eqLimit === 0 ? { kits, picks } : resetRestricted(ctx, s, ctx.eqLimit === 4 ? col : undefined);
      const state: ArmoryState = { ...s, ...reset, custom: ctx.eqLimit === 0 ? null : s.custom, screen: 'defaults', back: s.screen === 'done' ? 'done' : 'row', since: t, suspendedUntil: t + SUSPEND.defaults };
      return withValves(state, { run: ['returnto_Defaults'], ...(ctx.eqLimit === 0 ? { store: 'clear' as const } : {}) });
    }
    if (s.screen === 'done') {
      if (input === 'cross') return leave(s, t, true);
      return { state: s, events: none() };                  // Left/Right, Square: unbound on the DONE row
    }
    if (input === 'left' || input === 'right') {
      const id = stepItem(ctx, kit, s.row, input === 'right' ? 1 : -1);
      if (id === null) return withValves(s, { sounds: ['.SLIDE'] });
      const kits = s.kits.slice(), picks = s.picks.slice();
      kits[col] = pickItem(ctx.arsenal, ctx.valves, ctx.side, kit, s.row - 1, id).loadout;
      picks[col] = [...(s.picks[col] ?? []), { slot: s.row - 1, id }];
      return withValves({ ...s, kits, picks, suspendedUntil: t + SUSPEND.weaponStep }, { sounds: ['.SLIDE'], run: ['CallShowAndSpin'] });
    }
    if (input === 'square') {
      if (ctx.comeFromLan || ctx.eqLimit !== 0) return { state: s, events: none() };
      const state: ArmoryState = { ...s, custom: col, screen: 'store', back: 'row', since: t, suspendedUntil: t + SUSPEND.store };
      return withValves(state, { run: ['StoringLoadout'], store: profileOf(ctx, s) });   // its .DINK is the script's
    }
    return { state: s, events: none() };                    // Cross on a weapon row: unbound
  }

  if (s.screen === 'confirm') {
    // The popup's keys (ARMORY_POPUP_FOCUS; `FUN_00370990`): LEFT/RIGHT toggle with SELECTION, CROSS answers with it.
    if (input === 'left' || input === 'right') return withValves({ ...s, focus: s.focus === 'yes' ? 'no' : 'yes' }, { sounds: [SELECTION_SOUND] });
    if (input !== 'cross') return { state: s, events: none() };   // TRIANGLE unarmed (1245's +64 is 0); the rest swallowed
    if (s.focus === 'yes') {
      // OnMPWeaponBtnTriangle re-enters the side's EquipStart: restricted kits reset, unrestricted kits stay.
      const reset = ctx.eqLimit === 0 ? {} : resetRestricted(ctx, s);
      const state: ArmoryState = { ...s, ...reset, screen: 'select', focus: 'yes', column: s.committed ?? s.column, since: t, suspendedUntil: t + SUSPEND.confirm };
      return withValves(state, { sounds: [SELECTION_SOUND] });
    }
    const state: ArmoryState = { ...s, screen: s.back, focus: 'no', since: t, suspendedUntil: t + SUSPEND.confirm };
    return withValves(state, { sounds: [SELECTION_SOUND] });
  }
  return { state: s, events: none() };
}

/** The clock at `t`: a store's or the defaults' suspension ends back on the row. */
export function tickArmory(ctx: ArmoryContext, s: ArmoryState, t: number): { state: ArmoryState; events: ArmoryEvents } | null {
  if ((s.screen === 'store' || s.screen === 'defaults') && t >= s.suspendedUntil) {
    const state: ArmoryState = { ...s, screen: s.back, since: t };
    return { state, events: { ...none(), valves: armoryValves(ctx, state) } };
  }
  return null;
}

/**
 * S7 (`UiBackToLobby`): the launch count's first tick shows popup 47 ("taken back to the game lobby in 5 seconds",
 * research 95 §4.1); its `PopUpDialog` plays `.METAL` (research 182 §3, R122.13; research 95 §3.9's "none" is
 * contradicted), which `Armory.pullOut` plays -- this pure step names no sound. The game's popup holds the screen and then leaves for the lobby; the viewer's is a
 * notice over a screen still the player's (every change applied as made), which the round's start closes
 * (`ARMORY_CLOCK_READING`). Since the owner's ruling of 2026-10-02 only a seat's screen reaches it (a seat taken in the
 * round-end interval, `ARMORY_SEAT_READING`): nothing in the match opens the ARMORY again. Nothing while closed or
 * already shown.
 */
export function pullOut(s: ArmoryState, t: number): ArmoryState {
  return s.screen === 'closed' || s.pulledAt !== null ? s : { ...s, pulledAt: t };
}

/** The popup on screen: the confirm (its focus), else the pull-out's notice; null otherwise. */
export function popupOf(s: ArmoryState): { text: number; buttons: { text: number; focused: boolean }[] } | null {
  if (s.screen === 'confirm') {
    return { text: POPUP_TEXT.confirm, buttons: [{ text: POPUP_TEXT.no, focused: s.focus === 'no' }, { text: POPUP_TEXT.yes, focused: s.focus === 'yes' }] };
  }
  if (s.pulledAt !== null && s.screen !== 'closed') return { text: POPUP_TEXT.pulled, buttons: [] };
  return null;
}
