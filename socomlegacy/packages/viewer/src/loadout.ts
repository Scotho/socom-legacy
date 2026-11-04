import { Zar, type AssetSource } from '@s2u/archive';
import {
  armoryTypeAllowed, DEFAULT_ARMORY_TYPE, DEFAULT_SIDEARM, DEFAULT_WEAPON, DOUBLED_CLASSES, EMPTY_ITEM, FULL_SLOT, HE, HELD_RIFLE, HELD_SIDEARM, ITEM,
  itemClass, M67, parseMissionList, parseTurretDefs, readKitTable, readMapArsenal, type GameType, type KitTable, type MissionEntry, type Loadout, type MapArsenal, type Pick, type Side, type TurretDef, type WeaponRecord,
} from '@s2u/scene';
import { magazinesCarried } from './magazines';
import { MAX_LOADOUT_PICKS, type LoadoutRefusal } from './net/protocol';
import { gameTypeOf } from './net/rules';
import { equipmentLimit, equipmentLimitKit } from './equipmentLimit';

/**
 * The runtime kit (web sprint 4, M3/M4; spec §4's goal, W4.R2, W4.R6): what a SEAL or a Terrorist carries is a
 * `Loadout` -- five item ids, slot order primary, secondary, equipment 1-3 (`@s2u/scene` `arsenal.ts`) -- and every
 * per-weapon thing the page, the page's own match (`./net/loopback`) and the match server do follows it. One module,
 * headless (the shared sim: `./sim`), so the three read a slot the same way.
 *
 * - **The spawn kit** is the character type's `default_weapons` (`character.rdr` through `chartype.rdr`, research 91
 *   §14; R94.7: given as the game gives it, never checked against the valves). The type is the player's ARMORY column
 *   (web sprint 5 S2; research 95 §6, W5.R2): one of its side's four on the map, SEAL 1 / TERRORIST 1 (index 0) with
 *   none chosen (R95.5, `DEFAULT_ARMORY_TYPE`) -- its body (`./teamBody`), its kit here and its hit volumes (`./simMap`)
 *   alike. A type chosen is written like a pick, for the next spawn (`ChangeCharacterType`, research 95 §4.2 S1a; the
 *   body is rebuilt at the spawn, `FUN_00599f00`).
 * - **A pick** is written to the player's character type and applied at the next rebuild of the body -- in classic, the
 *   next round (`FUN_0023e5e0` L88381-88405 writes the type's kit; `FUN_00599b60` -> `FUN_00599f00` L455715-455836
 *   rebuilds it at the spawn; research 94 §A6, R94.3). So a pick is kept per side (each side's type is its own) and a
 *   new map, a new match, starts from the types' own kits (`PlayerLoadout`).
 * - **The two firearm slots** are the game's own: slot 0 the primary, which L1 takes up (`FUN_00594cf0`, the
 *   controller's `+0x224` = 0.0), and slot 1 the secondary, L2's (`+0x228` = 1.0; `./kit`'s `rifle` and `pistol`). The
 *   record behind each is the loadout's item's (`KitTable.records`; the MGL's and the M79's as carriers, M4); a slot
 *   whose item has no firearm record -- none on the disc's kits; the Designator or an empty slot in a later pick --
 *   keeps the baked record of that slot (`NO_FIREARM_RECORD_PLACEHOLDER`).
 * - **2X** (Double Ammo Load, id 194) anywhere in the kit doubles `NumMags` of every pistol, SMG, rifle, shotgun, MG and
 *   sniper it holds, at most the ring's ten, the extra magazines full (`FUN_005c75f0` L480207-480270, called by the
 *   kit's finaliser at every spawn; research 94 §A7, R94.13); `Ammo_Capacity` is unchanged. The ring (`./magazines`)
 *   fills `mags` magazines, so the record handed on carries the doubled count.
 *
 * Without `ZWEAPON.ZAR` (a test with no fixtures) the kit is the baked pair the viewer held before this sprint:
 * `BAKED_LOADOUT`, the M4A1 SD and the Mark 23 (`@s2u/scene` `weapons.ts`, each proven against the file).
 */

/** A firearm slot: 0 the primary (L1, `./kit`'s `rifle`), 1 the secondary (L2, `pistol`). */
export type FirearmSlot = 0 | 1;

/** The kit without the disc's tables: the baked M4A1 SD and Mark 23, the M67 and the HE (the viewer's kit to web sprint 3). */
export const BAKED_LOADOUT: Loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, M67.id, HE.id, EMPTY_ITEM];
const BAKED_RECORDS: readonly [WeaponRecord, WeaponRecord] = [HELD_RIFLE, HELD_SIDEARM];
/**
 * NO_FIREARM_RECORD_PLACEHOLDER: what a firearm slot fires when its item has no firearm record -- the Designator (11),
 * the M203 item (141) or an empty slot a later pick leaves -- the baked record of that slot. No default kit on the disc
 * holds such a slot (research 94 §A4). Web sprint 4 M4 retired it for the MGL and the M79: the kit table reads them as
 * carriers (`@s2u/scene` `kitTableOf`), which fire their rounds as fire modes (R94.8, `./firearms`).
 */
const NO_FIREARM_RECORD_PLACEHOLDER = BAKED_RECORDS;
/** The baked pair's held models (`@s2u/scene` `weapon.ts`: the M4A1 SD's `m4Acarbine_sd`, the Mark 23's `a_mark23`). */
const BAKED_MODELS: readonly [string, string] = [DEFAULT_WEAPON, DEFAULT_SIDEARM];
/**
 * The baked pair's HUD icons, as the HUD drew them before the kit was read (`./hudAssets`' two firearm icons): the
 * M4's `m4carbine_icon.tif` (the HUD's own default, `./hud`) and the Mark 23's `mark23_icon.tif`.
 */
export const BAKED_ICONS: readonly [string, string] = ['m4carbine_icon.tif', 'mark23_icon.tif'];

/** Whether the kit holds the Double Ammo Load (`FUN_005c75f0`: any kit item 194). */
export function holdsDoubleAmmo(loadout: Loadout): boolean {
  return loadout.includes(ITEM.DOUBLE_AMMO);
}

/** A firearm's record as the kit carries it: `NumMags` doubled (at most ten) when 2X is in the kit and its class is doubled. */
export function withDoubleAmmo(record: WeaponRecord, loadout: Loadout): WeaponRecord {
  if (!holdsDoubleAmmo(loadout) || !DOUBLED_CLASSES.has(itemClass(record.id))) return record;
  return { ...record, mags: magazinesCarried(record.mags, true) };
}

/** The record a firearm slot holds: the loadout item's (2X applied), else the baked record of that slot. */
export function slotRecord(table: KitTable | null, loadout: Loadout, slot: FirearmSlot): WeaponRecord {
  return withDoubleAmmo(table?.records.get(loadout[slot]) ?? NO_FIREARM_RECORD_PLACEHOLDER[slot], loadout);
}

/** Both firearm slots' records, slot order (the room's and the page's `[rifle, pistol]`). */
export function kitRecords(table: KitTable | null, loadout: Loadout): readonly [WeaponRecord, WeaponRecord] {
  return [slotRecord(table, loadout, 0), slotRecord(table, loadout, 1)];
}

/**
 * Explicit absent firearm markers are not usable (FUN_005bdc30 D:L474642-474648, research 362 §2). Missing fixture
 * tables remain the deliberate baked-record fallback; a known EMPTY_ITEM/FULL_SLOT never fires that fallback.
 */
export function firearmSlotPresent(loadout: Loadout, slot: FirearmSlot): boolean {
  return loadout[slot] !== EMPTY_ITEM && loadout[slot] !== FULL_SLOT;
}

/**
 * The initial hand: FUN_005c0250 D:L476054-476156 selects secondary only for an absent/FULL_SLOT primary and an
 * existing non-FULL_SLOT secondary. EQUIP_NONE has an original record and is not this branch's absent pointer.
 * Without tables the existing fallback records remain; research 362 §2.
 */
export function initialFirearmSlot(table: KitTable | null, loadout: Loadout): FirearmSlot {
  if (loadout[0] !== FULL_SLOT && (!table || table.arsenal.items.has(loadout[0]))) return 0;
  return loadout[1] !== FULL_SLOT && (!table || table.arsenal.items.has(loadout[1])) ? 1 : 0;
}

/** The held model of a firearm slot: the item's `ModelName`; null for none (an empty slot); the baked pair's without the tables. */
export function slotModel(table: KitTable | null, loadout: Loadout, slot: FirearmSlot): string | null {
  if (!firearmSlotPresent(loadout, slot)) return null;
  if (!table) return BAKED_MODELS[slot];
  return table.arsenal.items.get(loadout[slot])?.model ?? null;
}

/** The HUD weapon box's icon of a firearm slot: the item's `IconTextureName` (research 94 §C9), lower case as the HUD keys it. */
export function slotIcon(table: KitTable | null, loadout: Loadout, slot: FirearmSlot): string | null {
  if (!table) return BAKED_ICONS[slot];
  return table.arsenal.items.get(loadout[slot])?.icon?.toLowerCase() ?? null;
}

/**
 * LATER 117 (research 282 §9): an item's HUD weapon-box icon by its id -- its `IconTextureName` (research 94 §C9), lower
 * case as the HUD keys it, as `slotIcon` gives a slot's; null for no item (255, `EMPTY_ITEM`), an id the arsenal does not
 * hold, or no tables. The box's icon is the viewed actor's current item's bitmap (`FUN_005be050` D:L474764, written by
 * `FUN_00237760` D:L85245-85249): a dead player watching a teammate sees the teammate's held item, `BodyState.weapon`.
 */
export function itemIcon(table: KitTable | null, id: number): string | null {
  return table?.arsenal.items.get(id)?.icon?.toLowerCase() ?? null;
}

/**
 * A side's spawn kit on a map: its `index`-th character type's (the ARMORY column; SEAL 1 / TERRORIST 1 by default,
 * R95.5), the side's first when the map lists no such type, or null without the map's table.
 */
export function typeLoadout(map: MapArsenal | null, side: Side, index: number = DEFAULT_ARMORY_TYPE[side]): Loadout | null {
  return map?.kits[side][index]?.loadout ?? map?.kits[side][0]?.loadout ?? null;
}

/**
 * The developer's kit, `&kit=<id>,<id>,...` (up to five item ids, slot order; the rest empty): what a test that pins
 * a weapon spawns with (the page honours it only with `?devmode`, `./main`). Null when absent or not five ids 0-255.
 */
export function kitParam(search: string): Loadout | null {
  let raw: string | null;
  try { raw = new URLSearchParams(search).get('kit'); } catch { return null; }
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length > 5 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  const ids = parts.map(Number);
  while (ids.length < 5) ids.push(EMPTY_ITEM);
  return ids as unknown as Loadout;
}

/** Five item ids 0-255 off the wire (a `spawn`'s or a `loadout` answer's `kit`) as a loadout, or null. */
export function wireLoadout(ids: readonly unknown[] | null | undefined): Loadout | null {
  if (!Array.isArray(ids) || ids.length !== 5 || !ids.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255)) return null;
  return [...ids] as unknown as Loadout;
}

/** A `loadout` request as the page sent it (`NetPage.requestLoadout`): its list, and the type it named (protocol 9). */
export interface LoadoutRequest { list: readonly Pick[]; char?: number }

/**
 * The player's kit on the page: the loadout on the body, each side's pick waiting on its type, and the developer's
 * `&kit=`. `spawn` is the rebuild (`FUN_00599f00`): the side's pick, else the type's own kit, else the baked one.
 *
 * Protocol 7 (web sprint 4, M9): in a match the room owns the kit (W4.R6). Each confirm of the weapon select is kept
 * here, per side, in order since the map's match began (`confirm`, `picks`): the list the page sends as its `loadout`
 * request and the room replays from the type's own kit (`base`) -- the whole list each time, so a reconnect's new seat
 * is sent it again and lands on the same kit. The room's answer is the side's next kit (`answer` -> `pending`), and a
 * match's spawn carries the kit the room gave the body (`spawn`'s `kit`), which the page takes as it is.
 */
export class PlayerLoadout {
  private table: KitTable | null = null;
  private map: MapArsenal | null = null;
  private limit = 0;
  private current: Loadout = BAKED_LOADOUT;
  private readonly next: Record<Side, Loadout | null> = { seal: null, terrorist: null };
  private readonly confirmed: Record<Side, Pick[]> = { seal: [], terrorist: [] };
  /** The last list the room accepted, per side: what a refusal returns to (and a reconnect re-sends). */
  private readonly accepts: Record<Side, Pick[]> = { seal: [], terrorist: [] };
  private dev: Loadout | null = null;
  /** Web sprint 5 S2: each side's character type for its next spawn (the ARMORY's column, `MpCharSet` - 1 within the side). */
  private readonly types: Record<Side, number> = { ...DEFAULT_ARMORY_TYPE };
  /** The side and type the body was last rebuilt as (`spawn`), or null before the first. */
  private body: { side: Side; type: number } | null = null;
  /**
   * In a match, each side's type sent to the room and not yet answered (`setType(.., match)`), or null: the room's
   * answer to an earlier request, naming the type held before, does not undo it (`roomAnswer`).
   */
  private readonly staged: Record<Side, number | null> = { seal: null, terrorist: null };
  /** While a type is staged, the type the room held before it: the one `accepts` is the list of (`seated`). */
  private readonly was: Record<Side, number | null> = { seal: null, terrorist: null };

  /** A new map (a new match): its tables, and the types' own kits -- the picks of the last map's types go. */
  setMap(table: KitTable | null, map: MapArsenal | null): void {
    this.table = table;
    this.map = map;
    this.limit = 0;
    this.next.seal = this.next.terrorist = null;
    this.confirmed.seal = [];
    this.confirmed.terrorist = [];
    this.accepts.seal = [];
    this.accepts.terrorist = [];
    // A map's type indices name its own characters: a new map starts from the default types (R95.5).
    this.types.seal = DEFAULT_ARMORY_TYPE.seal;
    this.types.terrorist = DEFAULT_ARMORY_TYPE.terrorist;
    this.staged.seal = this.staged.terrorist = null;
    this.was.seal = this.was.terrorist = null;
    this.body = null;
  }

  /** The trusted room's restriction, applied before a welcome's seat/pick resend (research 362 §3). */
  setEquipmentLimit(value: number): void {
    const next = equipmentLimit(value);
    if (next === this.limit) return;
    this.limit = next;
    for (const side of ['seal', 'terrorist'] as const) {
      this.next[side] = null; this.confirmed[side] = []; this.accepts[side] = [];
      this.staged[side] = null; this.was[side] = null;
    }
  }

  equipmentLimit(): number { return this.limit; }

  /**
   * The ARMORY's type for the side's next spawn (`ChangeCharacterType(n)`, research 95 §4.2 S1a): a type the map's side
   * offers (`armoryTypeAllowed`), else refused -- false, nothing changed. A new type starts from its own kit, as the
   * game's `UpdateSelItemValves` reads the new type's kit (`FUN_00282140` L128327-128421): the side's picks go.
   *
   * `match`: the room owns the type (protocol 9) and may refuse it (`round`, `alive`, `type`), so the change is staged:
   * the new type's list starts empty (the request's), but the list the room last accepted -- the old type's picks, the
   * kit it still holds -- is kept until the room's answer to a request naming the new type accepts it (`roomAnswer`); a
   * refusal of that request restores the type and those picks both, so the next confirm replays from what the room
   * holds (the S2 review's round-end race). Outside a match (or before a welcome) nothing is staged.
   */
  setType(side: Side, index: number, match = false): boolean {
    if (!armoryTypeAllowed(this.map, side, index)) return false;
    if (this.types[side] === index && this.staged[side] === null) return true;
    if (match && this.staged[side] === null) this.was[side] = this.types[side];
    this.types[side] = index;
    this.next[side] = null;
    this.confirmed[side] = [];
    if (match) this.staged[side] = index;
    else { this.staged[side] = null; this.was[side] = null; this.accepts[side] = []; }
    return true;
  }

  /**
   * A seat taken -- a new socket's welcome, a promotion (the S2 review, rounds 2 and 3) -- on `side` as the room's type
   * `char` (the welcome's and the promotion's `char`). A staged type's request died with the old socket (or was dropped
   * with the old seat), so the staging ends here, and the page holds what the room seated:
   *
   * - **the staged type** (the hello's): its accepted list is empty (a refusal returns to its own kit, never the old
   *   type's);
   * - **the type held before the staging** (a reconnect under the round's lock, `Room.seat`): that type and the list the
   *   room last accepted for it -- the page re-sends it (`NetPage.resendPicks`: the whole list, so the room holds it
   *   whether or not its record kept it);
   * - **another type** (the side's default, a record's): that type with an empty list -- the page's list was its own
   *   type's.
   *
   * Returns the type the page had chosen when the room seated another (the page asks for it again, through the normal
   * path: a refusal leaves the room's), else null. Without `char` (a server before it), the old rule: the staged type
   * is taken as the seat's. The other side's staging (a seat on another side than before) ends the same old way.
   */
  seated(side: Side | null = null, char: number | null = null): number | null {
    let again: number | null = null;
    const known = side !== null && char !== null && armoryTypeAllowed(this.map, side, char);
    for (const s of ['seal', 'terrorist'] as const) {
      const staged = this.staged[s];
      if (s !== side || !known) {
        if (staged !== null) { this.staged[s] = null; this.was[s] = null; this.accepts[s] = []; }
        continue;
      }
      const chosen = this.types[s], was = this.was[s];
      this.staged[s] = null;
      this.was[s] = null;
      if (char === chosen) {
        if (staged !== null) this.accepts[s] = [];
        continue;
      }
      this.types[s] = char!;
      this.next[s] = null;
      if (staged !== null && char === was) this.confirmed[s] = this.accepts[s].map((p) => ({ ...p }));
      else { this.confirmed[s] = []; this.accepts[s] = []; }
      again = chosen;
    }
    return again;
  }

  /**
   * The seat gone (a demotion, W3.R13): the room drops its requests unanswered and holds nothing of the seat, so a staged
   * type is the page's choice now (sent as its spectator's types) and no list is the room's.
   */
  unseated(): void {
    for (const s of ['seal', 'terrorist'] as const) {
      this.staged[s] = null;
      this.was[s] = null;
      this.accepts[s] = [];
    }
  }

  /**
   * The room's answer to one of the side's `loadout` requests (protocol 7/9; the page's `NetPageDeps.loadoutAnswer`),
   * handed the request it answers (`request`: its list and the type it named; the answers come back in order on one
   * socket) and the type the room holds (`char`); `kit` is the side's next kit.
   *
   * - **An older request** -- one naming another type than the staged one (`setType(.., true)`): its answer settles
   *   only what the room holds for the old type (taken, its list is the one a refusal of the staged type returns to);
   *   the staged type, its list and the next kit wait for the staged request's own answer.
   * - **Otherwise** (the staged type's request, or none staged): refused, the side's list returns to the last one the
   *   room accepted and its type to the one the room holds; taken, `list` is the one it holds, with the type it names
   *   (a type the page did not hold makes the taken list the page's). The staging ends either way.
   */
  roomAnswer(side: Side, kit: readonly number[], refused: { reason: LoadoutRefusal; at: number } | null, request: LoadoutRequest | null, char?: number | null): void {
    const staged = this.staged[side];
    if (staged !== null && request?.char !== undefined && request.char !== staged) {
      if (!refused) this.accepted(side, request.list);
      return;
    }
    const known = char !== null && char !== undefined && armoryTypeAllowed(this.map, side, char);
    if (refused) this.refusedList(side);
    else if (request) {
      this.accepted(side, request.list);
      if (known && char !== this.types[side]) this.confirmed[side] = request.list.map((p) => ({ ...p }));
    }
    this.staged[side] = null;
    this.was[side] = null;
    if (known) this.types[side] = char;
    this.answer(side, kit);
  }

  /** The side's type for its next spawn (index 0-3 within the side). */
  type(side: Side): number {
    return this.types[side];
  }

  /** The type the page's body shows for `side`: the one it was rebuilt as when on that side, else the side's next. */
  bodyType(side: Side): number {
    return this.body?.side === side ? this.body.type : this.types[side];
  }

  /** The developer's `&kit=`: each side's pick on every map, until a pick replaces it. */
  setDevKit(loadout: Loadout | null): void {
    this.dev = loadout;
  }

  /** The developer's kit, or null: in the page's own room it stands in for the type's own (`RoomOptions.soloKit`). */
  devKit(): Loadout | null {
    return this.dev;
  }

  /** A pick written to the side's type as it is (the hook's `setLoadout`, a developer's), applied at its next spawn. */
  setLoadout(loadout: Loadout, side: Side): void {
    this.next[side] = [...loadout] as unknown as Loadout;
  }

  /** What the side's next spawn will take if nothing changes: its pick, or the developer's kit; null for the type's own. */
  pending(side: Side): Loadout | null {
    return this.next[side] ?? (this.limit === 0 ? this.dev : null);
  }

  /** The kit the side's picks are replayed from: the developer's kit, else the side's type's own, else the baked one. */
  base(side: Side): Loadout {
    const base = this.dev ?? typeLoadout(this.map, side, this.types[side]) ?? BAKED_LOADOUT;
    return equipmentLimitKit(base, this.map?.valves ?? new Map(), side, this.limit);
  }

  /** The side's confirmed picks since the map's match began, in order: the `loadout` request's list. */
  picks(side: Side): readonly Pick[] {
    return this.confirmed[side];
  }

  /**
   * A confirm of the weapon select (`FUN_0023e5e0`: the kit written to the type): the pick added to the side's list;
   * the list to send. `compact`, when given, may replace the list with a shorter one that reaches the same kit. A list
   * that would still pass `MAX_LOADOUT_PICKS` (the room refuses it as malformed) is not taken: null, the list unchanged.
   */
  confirm(side: Side, pick: Pick, compact?: (picks: readonly Pick[]) => Pick[]): readonly Pick[] | null {
    const list = [...this.confirmed[side], { slot: pick.slot, id: pick.id }];
    const next = compact ? compact(list) : list;
    if (next.length > MAX_LOADOUT_PICKS) return null;
    this.confirmed[side] = next;
    return this.confirmed[side];
  }

  /**
   * The ARMORY's leaving (web sprint 5 S3): the side's whole list replaced by the picks that reach the screen's kit from
   * the type's own (`./armoryState` `picksToReach`); false, unchanged, for a list past `MAX_LOADOUT_PICKS`.
   */
  setPicks(side: Side, picks: readonly Pick[]): boolean {
    if (picks.length > MAX_LOADOUT_PICKS) return false;
    this.confirmed[side] = picks.map((p) => ({ slot: p.slot, id: p.id }));
    return true;
  }

  /** The room accepted `list` for the side (its answer, unrefused): the list a refusal returns to. */
  accepted(side: Side, list: readonly Pick[]): void {
    this.accepts[side] = list.map((p) => ({ ...p }));
  }

  /**
   * The room refused the side's latest list: the side's list is the last one it accepted again (the kit it holds), so
   * the next request -- or a reconnect's re-send -- is one it takes, and the refused pick alone is lost.
   */
  refusedList(side: Side): void {
    this.confirmed[side] = this.accepts[side].map((p) => ({ ...p }));
  }

  /** The room's answer to a `loadout` request: the kit it holds for the side's next round (five ids; anything else is ignored). */
  answer(side: Side, kit: readonly number[]): void {
    const l = wireLoadout(kit);
    if (l) this.next[side] = l;
  }

  /**
   * The rebuild at a spawn: the loadout the body now carries. `kit`: a match's spawn names the kit the room gave the
   * body (protocol 7), which is taken as it is. `network` without a kit: the type's kit, as a network room gives it.
   * `type` (protocol 9): the type the room rebuilt the body as, taken as it is when the map's side has it; else the
   * side's own next type.
   */
  spawn(side: Side, opts: { network?: boolean; kit?: readonly number[] | null; type?: number | null } = {}): Loadout {
    const type = opts.type !== undefined && opts.type !== null && armoryTypeAllowed(this.map, side, opts.type) ? opts.type : this.types[side];
    this.body = { side, type };
    const given = wireLoadout(opts.kit);
    const pick = given ?? (opts.network ? null : this.pending(side));
    this.current = pick ?? equipmentLimitKit(typeLoadout(this.map, side, type) ?? BAKED_LOADOUT, this.map?.valves ?? new Map(), side, this.limit);
    return this.current;
  }

  /**
   * PF-34 (ruling PF.R54; research 234 s3): the kit on the body after a pickup -- the room's `kit` event, five ids --
   * and nothing else: the side's pick, its type and the next spawn are the weapon select's, untouched (`FUN_005bc410`
   * D:L473823-473868 "changes current inventory state; it is not a saved loadout edit", research 194 s2). A kit that is
   * not five ids changes nothing.
   */
  take(kit: readonly number[]): void {
    const given = wireLoadout(kit);
    if (given) this.current = given;
  }

  /** The loadout on the body. */
  loadout(): Loadout { return this.current; }
  tables(): KitTable | null { return this.table; }
  records(): readonly [WeaponRecord, WeaponRecord] { return kitRecords(this.table, this.current); }
  model(slot: FirearmSlot): string | null { return slotModel(this.table, this.current, slot); }
  icon(slot: FirearmSlot): string | null { return slotIcon(this.table, this.current, slot); }
}

/** The kit's tables as the room holds them: the disc's and the map's (null without its `READERM.ZAR`). */
export interface SimKits { table: KitTable; map: MapArsenal | null }

/** What a source's kit tables are read from once: `ZWEAPON.ZAR`'s table and `READERC.ZAR`'s bytes (the kits' characters). */
export interface KitSource { table: KitTable; readerc: Uint8Array }

const kitSources = new WeakMap<AssetSource, Promise<KitSource | null>>();

/**
 * `RUN/ZWEAPON.ZAR` and `RUN/READERC.ZAR` off a source (the served tree, the disc image, the server's `SOCOM_DISC`),
 * read once per source; null when either is not there or will not read -- the baked kit then.
 */
export function loadKitSource(source: AssetSource): Promise<KitSource | null> {
  let pending = kitSources.get(source);
  if (!pending) {
    pending = (async (): Promise<KitSource | null> => {
      try {
        const [zweapon, readerc] = await Promise.all([source.read('RUN/ZWEAPON.ZAR'), source.read('RUN/READERC.ZAR')]);
        return { table: readKitTable(zweapon), readerc };
      } catch {
        return null;
      }
    })();
    kitSources.set(source, pending);
  }
  return pending;
}

const missionLists = new WeakMap<KitSource, ReadonlyMap<string, MissionEntry> | null>();

/**
 * PF-40 (research 210 s4; 192 s1): a map's game type off the source's `READERC.ZAR/missionlist.rdr`, as the server reads
 * it (`match/src/server.ts`: `gameTypeOf(stem, parseMissionList(readerc))`), through the READERC bytes the kit source
 * already holds -- the page's one read, no second fetch; the list parsed once a source. Undefined (the room then plays
 * SUPPRESSION's rules, `./net/rules` `modeRules`) without the kit source, without the list, or for a stem off it (type
 * 0), as the server leaves `SimMap.gameType` unset.
 */
export function kitGameType(kits: KitSource | null, stem: string): GameType | undefined {
  if (!kits) return undefined;
  let list = missionLists.get(kits);
  if (list === undefined) {
    try { list = parseMissionList(Zar.parse(kits.readerc)); } catch { list = null; }
    missionLists.set(kits, list);
  }
  const type = list ? gameTypeOf(stem, list) : 0;
  return type || undefined;
}

const turretDefs = new WeakMap<KitSource, readonly TurretDef[] | null>();

/**
 * MAP-10a (research 215 s1): the source's `READERC.ZAR/ai_turrets.rdr` definitions (`@s2u/scene` `parseTurretDefs`),
 * through the READERC bytes the kit source already holds -- as `kitGameType` reads the mission list, no second fetch --
 * parsed once a source. Null without the kit source or when the script will not read.
 */
export function kitTurretDefs(kits: KitSource | null): readonly TurretDef[] | null {
  if (!kits) return null;
  let defs = turretDefs.get(kits);
  if (defs === undefined) {
    try { defs = parseTurretDefs(Zar.parse(kits.readerc)); } catch { defs = null; }
    turretDefs.set(kits, defs);
  }
  return defs;
}

/** A map's kits: its `READERM.ZAR` through the source's tables; the map's part null when it will not read. */
export function simKitsFromBytes(kits: KitSource, mapBytes: Uint8Array): SimKits {
  let map: MapArsenal | null = null;
  try { map = readMapArsenal(kits.table.arsenal, mapBytes, kits.readerc); } catch { map = null; }
  return { table: kits.table, map };
}
