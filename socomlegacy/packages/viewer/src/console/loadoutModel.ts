import { pick as pickItem, slotLocked, menuValves, type Loadout, type Pick, type Side } from '@s2u/scene';
import {
  availableMissionRows, FIRST_RELEASE_MAPS, PLAY_LIST_MEDLEY, PLAY_LIST_RANDOM, playListNumbers,
  type ArmoryLoadoutProfile, type ArmoryLoadoutRecord, type ArmoryLoadoutSide, type MissionRecord,
} from '@s2u/ui';
import { Armory } from '../armory';
import type { ArmoryData } from '../armoryData';
import {
  activeColumn, charSetOf, columnCount, openArmory, profileOf, reachable, rowUi, SCROLL, stepItem,
  type ArmoryContext, type ArmoryProfile, type ArmoryState,
} from '../armoryState';

/**
 * The loadout editor's rules (MU-13f of `docs/plans/2026-10-09-modern-ui-parallel.md`; the parity audit's F38; since
 * CX-LOADOUTS of `docs/plans/2026-10-11-console-launcher.md` the console's Armory screens, `./adapters/loadouts`, which
 * took it over from the retired modern Loadouts section -- moved here from `src/modern/loadout/model.ts`, its rules unchanged). A
 * browser adaptation (MU.R1): a list-and-pick front to the original's ARMORY records, which changes nothing of the
 * ARMORY screen. **No rule is written here**: every choice is the original ARMORY's own, through
 * `../armoryState` (research 95 §3-§4; web sprint 5 S3), over the context the shared screen builds (`../armory`
 * `Armory`, from `../armoryData` `armoryFromDisc` with the world -- the game lobby's own read, `../frontEnd`):
 *
 * - **the record opened on**: `openArmory` with the stored record (`readProfile`: the column it names, each item re-chosen
 *   by its `Enable_` valve and the slot's refusals, research 182 §2.18), else `MpCharSet` 1 / 5;
 * - **the character types**: the side's columns (`columnCount`), the 4th only when the map opens it (`reachable`,
 *   R95.6 as corrected);
 * - **a slot's items**: what any run of the row's Left / Right presses shows (`stepItem`: the scroll order of §3.4,
 *   `scrollAdmits`, the room's `selectable` under the menu's valves), from the kit as it stands, each press applied as
 *   the screen applies it (`@s2u/scene` `pick` into the whole kit, `stepArmory`'s S2); a locked slot (`slotLocked`) offers only what it holds, and a row whose
 *   item is 253-255 is one the cursor skips (`nextRow`), so it offers nothing either;
 * - **the record saved**: `profileOf` (`CharacterProfile` mode 1, `FUN_002fb610`), the defaults the type's own kit
 *   (`ChooseDefaultEquipment`, S6) with the stored record's valid flag cleared (mode 7, D:L122001-122006).
 *
 * What differs from the screen is the input only: a choice from a list lands the kit the pad's presses would leave
 * (`LOADOUT_EDITOR_LIST_ADAPTATION`).
 */

/**
 * LOADOUT_EDITOR_LIST_ADAPTATION: a row's items are listed and one is chosen; the kit is the one the fewest Right / Left
 * presses that show it leave (the first found on a tie, Right tried before Left), the screen's own steps replayed
 * (`stepArmory` S2).
 * A browser adaptation of the input; the items offered, the kit and the record written are the ARMORY's.
 */
export const LOADOUT_EDITOR_LIST_ADAPTATION = 'a listed item lands the kit the pad leaves on reaching it' as const;

/**
 * LOADOUT_EDITOR_NO_GAME_ADAPTATION: the editor is outside any game, so `EQlimit` is 0 (no game's weapon restriction) and
 * `ComeFromLan` 0 -- the online ARMORY with no restriction, the only one that stores (S5 needs `EQlimit` 0). A joined
 * game's restriction applies at its own ARMORY and its launch (`Room.storedProfile` re-chooses each item on the map).
 */
export const LOADOUT_EDITOR_NO_GAME_ADAPTATION = 'EQlimit 0, ComeFromLan 0: no game is joined' as const;

/**
 * The first release's maps (`@s2u/ui` `FIRST_RELEASE_MAPS`, the server's `checkLoadout` with no `offered` handed in), as the
 * page keys them (`LOADOUT_MISSION_READING`: upper case), in stem order: the list `missionRowsOf` falls back to with no
 * mission table to order it.
 */
export const LOADOUT_MISSIONS: readonly string[] = FIRST_RELEASE_MAPS.map((n) => `MP${n}`);

/** One mission the editor lists: its key (`MP<n>`), its number and its name (`missionlist.rdr`'s NAME, else the key). */
export interface MissionRow { mission: string; number: number; name: string }

/**
 * LOADOUT_EDITOR_MISSIONS_ADAPTATION (MU2-4; NB-7, OT.R50): the missions the editor lists are the rows the game's CREATE
 * GAME lists over the same offer -- `FUN_00274940`'s (D:L121473-121555) through `@s2u/ui` `availableMissionRows`, with
 * respawn off (the list with every multiplayer mission, a record being kept per mission whatever the game's mode), the
 * offer's predicate `CreateGameCommands.GetAvailableMPMissions`'s (the server's map numbers, Medley and Random out;
 * absent, `FIRST_RELEASE_MAPS`) -- so the editor stores records for exactly the maps its server's CREATE GAME offers,
 * in that screen's order and by its names. The offer is `../createGameHost` `CREATE_GAME_OFFER_ADAPTATION`'s read.
 * With no mission table (a disc reader that gives none, or one that will not read), the offered numbers in stem order,
 * named by their stems. A browser adaptation of the input (the editor is the launcher's own, MU.R1); the rows are the
 * original's.
 */
export const LOADOUT_EDITOR_MISSIONS_ADAPTATION = 'CREATE GAME\'s rows over the server\'s offer, respawn off; no table: the offer by stem' as const;

/**
 * The editor's missions (`LOADOUT_EDITOR_MISSIONS_ADAPTATION`) from the disc's mission table (`missionlist.rdr`, the
 * opened image's `readMissions`; null or empty: none read) and the server's offer (`fetchCreateGameOffer`'s answer: the
 * numbers of the four it names (OT.R58), null for the release's four).
 */
export function missionRowsOf(table: readonly MissionRecord[] | null, offer: readonly number[] | null): MissionRow[] {
  const offered = offer ? (n: number) => n !== PLAY_LIST_MEDLEY.number && n !== PLAY_LIST_RANDOM.number && offer.includes(n) : undefined;
  if (table && table.length > 0) {
    const numbers = playListNumbers({ type: 'array', value: availableMissionRows(table, { respawn: false, offered }) });
    return numbers.map((n) => ({ mission: `MP${n}`, number: n, name: table.find((m) => m.number === n)?.name ?? `MP${n}` }));
  }
  const numbers = offer ? offer.filter((n) => n !== PLAY_LIST_MEDLEY.number && n !== PLAY_LIST_RANDOM.number) : [...FIRST_RELEASE_MAPS];
  return [...new Set(numbers)].sort((a, b) => a - b).map((n) => ({ mission: `MP${n}`, number: n, name: `MP${n}` }));
}

export const SIDES: readonly ArmoryLoadoutSide[] = ['seal', 'terrorist'];

/** The rows (`UiLastEquipClassBtn` 1-5; research 95 §3.3), as the editor labels them. */
export const ROWS = [
  { row: 1, label: 'Primary' }, { row: 2, label: 'Secondary' }, { row: 3, label: 'Equipment 1' }, { row: 4, label: 'Equipment 2' }, { row: 5, label: 'Equipment 3' },
] as const;

/**
 * The ARMORY's context for one side of a mission's data: the one the shared screen builds (`Armory.setData` /
 * `setWorld` / `context`), the map's own roster, arsenal and `mission.rdr` valves; null when the data lacks a part
 * (the screen would not open either).
 */
export function armoryContextOf(data: ArmoryData, side: Side): ArmoryContext | null {
  if (!data.world) return null;
  const a = new Armory({ clock: () => 0, change: () => {} });
  a.setData(data);
  a.setWorld({ arsenal: data.world.arsenal, valves: data.world.valves, side, map: data.archive, archive: data.archive, eqLimit: 0 });
  return a.context();
}

/** The editor's state: the screen's own (`openArmory`), the column committed. */
export type EditorState = ArmoryState;

/** S0 over the stored record (its column committed, its kit read back), else on the first column, committed. */
export function openEditor(ctx: ArmoryContext, stored: ArmoryLoadoutProfile | null): EditorState {
  const s = openArmory(ctx, 0, null, stored as ArmoryProfile | null, []).state;
  return { ...s, committed: s.committed ?? s.column };
}

/** The side's character types: `MpCharSet`, and whether the map lets it be chosen. */
export function columnsOf(ctx: ArmoryContext): { column: number; charSet: number; open: boolean }[] {
  return Array.from({ length: columnCount(ctx) }, (_, c) => ({ column: c, charSet: charSetOf(ctx.side, c), open: reachable(ctx, c) }));
}

/** A type chosen (S1a's commit): its kit as the screen holds it. A column the map closes is refused. */
export function chooseColumn(ctx: ArmoryContext, s: EditorState, column: number): EditorState {
  return reachable(ctx, column) ? { ...s, column, committed: column } : s;
}

/** The committed type's kit. */
export function kitOf(s: EditorState): Loadout { return s.kits[activeColumn(s)]!; }

export interface SlotChoices {
  /** The UI index the slot holds. */
  current: number;
  /** Why the slot cannot change: `locked` (`slotLocked`), `skipped` (253-255, the cursor's `nextRow` passes it), or null. */
  fixed: 'locked' | 'skipped' | null;
  /** The UI indices some run of the row's Left / Right presses shows, the current one included, in the row's scroll order. */
  options: number[];
  /**
   * For each option but the current: the fewest presses that show it on the screen, the kit they leave and the picks
   * they make (`stepArmory`'s S2).
   */
  reach: ReadonlyMap<number, { presses: ('right' | 'left')[]; kit: Loadout; picks: Pick[] }>;
}

/**
 * Row `row` (1-5)'s items: every item some run of Right / Left presses on the row shows, each press applied as
 * `stepArmory` applies it (`stepItem`, then `pick` into the whole kit as it stands -- a pick may change other slots: a
 * cost-2 item's partner, a dependent that fills in, a lock that ends the run), so the search is over whole kits,
 * breadth first: each item is kept with the fewest presses that show it, the first found on a tie (each kit's Right
 * tried before its Left). Bounded by the kits the row's presses can reach (each visited once). The options are in
 * `SCROLL`'s order for the row.
 */
export function slotChoices(ctx: ArmoryContext, kit: Loadout, row: number): SlotChoices {
  const slot = row - 1, current = rowUi(kit, row);
  const none = (fixed: 'locked' | 'skipped'): SlotChoices => ({ current, fixed, options: [current], reach: new Map() });
  if (current >= 253) return none('skipped');
  if (slotLocked(menuValves(ctx.valves, kit[0]!), ctx.side, kit, slot)) return none('locked');
  const order: readonly number[] = row === 1 ? SCROLL.primary : row === 2 ? SCROLL.secondary : SCROLL.equipment;
  type Node = { presses: ('right' | 'left')[]; kit: Loadout; picks: Pick[] };
  const reach = new Map<number, Node>();
  const visited = new Set<string>([kit.join(',')]);
  let frontier: Node[] = [{ presses: [], kit, picks: [] }];
  while (frontier.length > 0) {
    const next: Node[] = [];
    for (const at of frontier) {
      for (const press of ['right', 'left'] as const) {
        const id = stepItem(ctx, at.kit, row, press === 'right' ? 1 : -1);
        if (id === null) continue;                              // locked, or nothing else admitted
        const got = pickItem(ctx.arsenal, ctx.valves, ctx.side, at.kit, slot, id).loadout;
        const k = got.join(',');
        if (visited.has(k)) continue;
        visited.add(k);
        const node: Node = { presses: [...at.presses, press], kit: got, picks: [...at.picks, { slot, id }] };
        next.push(node);
        const ui = rowUi(got, row);
        if (ui !== current && !reach.has(ui)) reach.set(ui, node);
      }
    }
    frontier = next;
  }
  const rank = (ui: number): number => { const i = order.indexOf(ui); return i < 0 ? order.length : i; };
  return { current, fixed: null, options: [current, ...reach.keys()].sort((a, b) => rank(a) - rank(b)), reach };
}

/** An item chosen for row `row` (its UI index): taken only when the row offers it (`slotChoices`), the pad's kit and picks. */
export function chooseItem(ctx: ArmoryContext, s: EditorState, row: number, ui: number): EditorState {
  const col = activeColumn(s);
  const got = slotChoices(ctx, s.kits[col]!, row).reach.get(ui);
  if (!got) return s;
  const kits = s.kits.slice(), picks = s.picks.slice();
  kits[col] = got.kit;
  picks[col] = [...(s.picks[col] ?? []), ...got.picks];
  return { ...s, kits, picks };
}

/** Circle (S6, `returnto_Defaults`): the committed type's own kit (`ChooseDefaultEquipment`), its picks gone. */
export function defaultsOf(ctx: ArmoryContext, s: EditorState): EditorState {
  const col = activeColumn(s), kits = s.kits.slice(), picks = s.picks.slice();
  kits[col] = [...ctx.kits[col]!] as unknown as Loadout; picks[col] = [];
  return { ...s, kits, picks, custom: null };
}

/** Square's record (`CharacterProfile` 1, `profileOf`). */
export function recordOf(ctx: ArmoryContext, s: EditorState): ArmoryLoadoutProfile {
  return profileOf(ctx, s);
}

/** Mode 7 (D:L122001-122006): the stored valid record with its valid byte cleared, or null when none is valid. */
export function clearedRecord(stored: ArmoryLoadoutProfile | null): ArmoryLoadoutProfile | null {
  return stored?.valid ? { ...stored, valid: false } : null;
}

/** One side's record of a mission in the account's list (`GET /lobby/loadout`), or null. */
export function storedOf(list: readonly ArmoryLoadoutRecord[], mission: string, side: ArmoryLoadoutSide): ArmoryLoadoutProfile | null {
  return list.find((r) => r.mission.toUpperCase() === mission.toUpperCase())?.[side] ?? null;
}
