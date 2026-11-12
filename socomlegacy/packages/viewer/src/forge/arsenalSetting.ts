import {
  applyPicks, ITEM, selectableItems, SIDE_BIT, VALVE_OF_ITEM, type CharacterKit, type MapArsenal, type Side,
} from '@s2u/scene';
import type { SimKits } from '../loadout';
import type { ArsenalPick, ArsenalSetting } from './layout';

/**
 * The layout's arsenal (`settings.arsenal`, `@s2u/creator-contracts` `ArsenalSetting`; the owner, 2026-11-10: "Give
 * default weapons, c4, rocket launchers. Allows us to have breaching on maps that don't have it") over the map's own
 * (`LoadedMap.arsenal`, `SimKits`). Nothing of the game is changed: the layout writes the same two things a disc map
 * carries, and the game's own rules read them.
 *
 * - **Valves**: the layout's `Enable_<item>` values over the map's `mission.rdr` `Valves`, each side's selectable items
 *   then recomputed by `selectableItems` (`FUN_0023c390` D:L87468-87478). A name no item is enabled by
 *   (`VALVE_OF_ITEM`, `FUN_003cf1f0` D:L322760-322968) is refused: nothing would read it.
 * - **Kits**: each side's picks replayed on every one of the side's types' kits by `applyPicks` (the menu's
 *   `FUN_0023fef0` D:L89138-89323 with `slotLocked` and `selectable`) under the layout's valves. A type whose kit the
 *   menu would refuse a pick on keeps its own kit, and the refusal is named.
 *
 * What reads the result: the page's room (`./match` `startForgeMatch`'s `kits`, the room's `typeKit` and its pick
 * replay), the lobby's ARMORY (`./match` `lobbyArmoryData`), and CREATE GAME's EQlimit over it (`../equipmentLimit`,
 * whose rewrite runs over the map's valves as `SetMPWeaponValves` runs over the mission's -- research 362).
 *
 * Not modelled: a kit that carries an item its side may not pick (the disc's MP61 / MP62 / MP73 SEALs' locked C4 at
 * `Enable_c4` 16; MP6 SEAL 4's Terrorist-only 226). The picks are the menu's, so they need the side's bit; the editor's
 * kit row opens it (`setKitSlot`).
 */

/** No override: the map's own arsenal. */
export const EMPTY_ARSENAL: ArsenalSetting = Object.freeze({ valves: Object.freeze({}), kits: Object.freeze({ seal: [], terrorist: [] }) }) as ArsenalSetting;

/** The valve names an item is enabled by (the RPG-7 and its round share `Enable_RPG`). */
export const ARSENAL_VALVE_NAMES: ReadonlySet<string> = new Set(VALVE_OF_ITEM.values());

export const arsenalIsEmpty = (a: ArsenalSetting | null | undefined): boolean =>
  !a || (Object.keys(a.valves).length === 0 && a.kits.seal.length === 0 && a.kits.terrorist.length === 0);

const SIDE_WORD: Readonly<Record<Side, string>> = { seal: 'SEAL', terrorist: 'Terrorist' };

/** The map's arsenal with the layout's over it, and each part of the layout's that could not be played, in words. */
export function arsenalWith(kits: SimKits | null | undefined, a: ArsenalSetting | null | undefined): { kits: SimKits | null; refused: string[] } {
  const own = kits ?? null;
  if (arsenalIsEmpty(a)) return { kits: own, refused: [] };
  if (!own?.map) return { kits: own, refused: ['this map has no arsenal: its kits are the baked pair'] };
  const refused: string[] = [];
  const arsenal = own.table.arsenal;
  const valves = new Map(own.map.valves);
  for (const [name, value] of Object.entries(a!.valves)) {
    if (!ARSENAL_VALVE_NAMES.has(name)) { refused.push(`${name}: no item is enabled by this valve`); continue; }
    valves.set(name, value);
  }
  const itemName = (id: number): string => arsenal.items.get(id)?.name ?? `item ${id}`;
  const side = (s: Side): CharacterKit[] => {
    const picks = a!.kits[s];
    return own.map!.kits[s].map((k) => {
      if (picks.length === 0) return k;
      const out = applyPicks(arsenal, valves, s, k.loadout, picks);
      if ('loadout' in out) return { ...k, loadout: out.loadout };
      const p = picks[out.at]!;
      refused.push(`${SIDE_WORD[s]} ${k.type}: pick ${out.at + 1} (slot ${p.slot + 1}, ${itemName(p.id)}) ${out.refused}`);
      return k;
    });
  };
  const map: MapArsenal = {
    valves,
    selectable: { seal: selectableItems(arsenal, valves, 'seal'), terrorist: selectableItems(arsenal, valves, 'terrorist') },
    kits: { seal: side('seal'), terrorist: side('terrorist') },
  };
  return { kits: { ...own, map }, refused };
}

/** A map (a `LoadedMap`, or anything holding its `arsenal`) with the layout's arsenal over its own. */
export function mapWithArsenal<T extends { arsenal?: SimKits | undefined }>(map: T, a: ArsenalSetting | null | undefined): { map: T; refused: string[] } {
  if (arsenalIsEmpty(a)) return { map, refused: [] };
  const out = arsenalWith(map.arsenal, a);
  return { map: out.kits ? { ...map, arsenal: out.kits } : map, refused: out.refused };
}

const withValve = (a: ArsenalSetting, mapValves: ReadonlyMap<string, number>, name: string, value: number): ArsenalSetting => {
  const valves = { ...a.valves };
  if (value === (mapValves.get(name) ?? 0)) delete valves[name];
  else valves[name] = value;
  return { ...a, valves };
};

/** A valve's value as played: the layout's, else the map's, else 0 (no valve: not selectable). */
export const valveOf = (a: ArsenalSetting | null | undefined, mapValves: ReadonlyMap<string, number>, name: string): number =>
  a?.valves[name] ?? mapValves.get(name) ?? 0;

/** A side's pick bit (1 / 8) on or off, the valve's other bits (the C4 lock's 16 / 32) kept; at the map's value, no override. */
export function setSideBit(a: ArsenalSetting, mapValves: ReadonlyMap<string, number>, name: string, side: Side, on: boolean): ArsenalSetting {
  const v = valveOf(a, mapValves, name);
  return withValve(a, mapValves, name, on ? v | SIDE_BIT[side] : v & ~SIDE_BIT[side]);
}

/** The item a side's picks put in a slot, else null (the type's own). */
export const kitSlotOf = (a: ArsenalSetting | null | undefined, side: Side, slot: number): number | null =>
  a?.kits[side].find((p) => p.slot === slot)?.id ?? null;

/**
 * A side's kit slot set to `id` (one pick a slot, in slot order: a primary's launcher fill comes before the equipment's
 * picks) or cleared (null, the type's own); a set item's valve opened to the side, as the menu needs it to be picked.
 */
export function setKitSlot(a: ArsenalSetting, mapValves: ReadonlyMap<string, number>, side: Side, slot: number, id: number | null): ArsenalSetting {
  const picks: ArsenalPick[] = a.kits[side].filter((p) => p.slot !== slot);
  if (id !== null) picks.push({ slot, id });
  picks.sort((x, y) => x.slot - y.slot);
  let out: ArsenalSetting = { ...a, kits: { ...a.kits, [side]: picks } };
  const valve = id === null ? undefined : VALVE_OF_ITEM.get(id);
  if (valve !== undefined && (valveOf(out, mapValves, valve) & SIDE_BIT[side]) === 0) out = setSideBit(out, mapValves, valve, side, true);
  return out;
}

/**
 * The panel's one-click toggles (a browser adaptation, no original: each is only valve and kit edits through the helpers
 * above). `isOn` lights its button; `remove` undoes it.
 * - C4 in ARMORY: C4 every side's pick -- a player may choose it in place of an equipment item. Off: `Enable_c4` back to
 *   the map's (and Spawn with C4 with it, which needs the side's bit to be picked).
 * - Launchers in ARMORY: the LAW and the RPG-7 every side's pick. Off: both valves back to the map's.
 * - Spawn with C4: C4 already in every type's slot 5 (the last equipment slot), on both sides; its valve opened as the
 *   menu needs. Off: slot 5 back to each type's own.
 */
export interface ArsenalPreset {
  id: string; label: string; title: string;
  apply(a: ArsenalSetting, mapValves: ReadonlyMap<string, number>): ArsenalSetting;
  isOn(a: ArsenalSetting, mapValves: ReadonlyMap<string, number>): boolean;
  remove(a: ArsenalSetting, mapValves: ReadonlyMap<string, number>): ArsenalSetting;
}
const SIDES: readonly Side[] = ['seal', 'terrorist'];
const bothSides = (a: ArsenalSetting, mapValves: ReadonlyMap<string, number>, names: readonly string[]): ArsenalSetting =>
  names.reduce((acc, n) => SIDES.reduce((x, s) => setSideBit(x, mapValves, n, s, true), acc), a);
const bothOpen = (a: ArsenalSetting, mapValves: ReadonlyMap<string, number>, names: readonly string[]): boolean =>
  names.every((n) => SIDES.every((s) => (valveOf(a, mapValves, n) & SIDE_BIT[s]) !== 0));
/** The layout's values of `names` dropped: the map's own again. */
const mapsOwn = (a: ArsenalSetting, names: readonly string[]): ArsenalSetting => {
  const valves = { ...a.valves };
  for (const n of names) delete valves[n];
  return { ...a, valves };
};
const C4_SLOT = 4;
const c4KitOn = (a: ArsenalSetting): boolean => SIDES.every((s) => kitSlotOf(a, s, C4_SLOT) === ITEM.C4);
const c4KitOff = (a: ArsenalSetting, v: ReadonlyMap<string, number>): ArsenalSetting =>
  SIDES.reduce((x, s) => (kitSlotOf(x, s, C4_SLOT) === ITEM.C4 ? setKitSlot(x, v, s, C4_SLOT, null) : x), a);
export const ARSENAL_PRESETS: readonly ArsenalPreset[] = [
  { id: 'breach', label: 'C4 in ARMORY', title: 'Both sides may pick C4 in the ARMORY (in place of an equipment item)',
    apply: (a, v) => bothSides(a, v, ['Enable_c4']), isOn: (a, v) => bothOpen(a, v, ['Enable_c4']),
    remove: (a, v) => mapsOwn(c4KitOff(a, v), ['Enable_c4']) },
  { id: 'launchers', label: 'Launchers in ARMORY', title: 'Both sides may pick the LAW and the RPG-7 in the ARMORY',
    apply: (a, v) => bothSides(a, v, ['Enable_LAW', 'Enable_RPG']), isOn: (a, v) => bothOpen(a, v, ['Enable_LAW', 'Enable_RPG']),
    remove: (a) => mapsOwn(a, ['Enable_LAW', 'Enable_RPG']) },
  { id: 'c4-kit', label: 'Spawn with C4', title: 'Every character on both sides spawns with C4 already in equipment slot 3',
    apply: (a, v) => SIDES.reduce((x, s) => setKitSlot(x, v, s, C4_SLOT, ITEM.C4), a), isOn: (a) => c4KitOn(a), remove: (a, v) => c4KitOff(a, v) },
];

