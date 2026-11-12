import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, FULL_SLOT, ITEM, type Loadout, type MapArsenal } from '@s2u/scene';
import type { SimKits } from '../../src/loadout';
import type { ArsenalSetting } from '../../src/forge/layout';
import {
  ARSENAL_PRESETS, arsenalIsEmpty, arsenalWith, EMPTY_ARSENAL, kitSlotOf, mapWithArsenal, setKitSlot, setSideBit, valveOf,
} from '../../src/forge/arsenalSetting';

/**
 * The layout's arsenal (`./arsenalSetting`; the owner, 2026-11-10: "Give default weapons, c4, rocket launchers. Allows us
 * to have breaching on maps that don't have it"): the map's own `mission.rdr` valves with the layout's written over them
 * (the masks the disc's maps use: 1 SEAL, 8 Terrorist, 16 / 32 the C4 lock, `FUN_0023c390` D:L87468, `FUN_0023e910`
 * D:L88527-88545), and each side's kits with the layout's picks replayed through the menu's own rules (`applyPicks`,
 * `FUN_0023fef0` D:L89138-89323). The synthetic twin of the arsenal is `parseRdr`'s shape, as `scene/test/arsenal.test.ts`.
 */
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, extra: [string, RdrNode][] = []): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`], ...extra,
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [
    weapon('M4A1', 54), weapon('AK-47', 58), weapon('Mark 23', 15), weapon('M9', 5), weapon('M67', 121), weapon('HE', 126),
    weapon('PMN Mine', 158), weapon('C4', 151), weapon('LAW', 145, [['SlotCost', '2']]), weapon('LAW HEAT', 185),
    weapon('RPG LAUNCHER', 146, [['SlotCost', '2']]), weapon('RPG', 186), weapon('Double Ammo Load', 194),
  ],
];
const arsenal = arsenalOf(zweapon);
const SEAL: Loadout = [54, 15, 121, 126, 194];
const TERR: Loadout = [58, 5, 121, 158, 126];
const map: MapArsenal = {
  valves: new Map([['Enable_m4Acarbine', 1], ['Enable_ak47', 8], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_frag', 9],
    ['Enable_HEgren', 9], ['Enable_pmn', 8], ['Enable_2xammo', 9], ['Enable_c4', 0], ['Enable_LAW', 0], ['Enable_RPG', 0]]),
  selectable: { seal: [], terrorist: [] },
  kits: { seal: [{ type: 's1', character: 'mp2_seal1', loadout: SEAL }, { type: 's2', character: 'mp2_seal2', loadout: SEAL }],
    terrorist: [{ type: 't1', character: 'mp2_terr1', loadout: TERR }] },
};
const kits = { table: { arsenal }, map } as unknown as SimKits;
const a = (o: Partial<ArsenalSetting>): ArsenalSetting => ({ ...EMPTY_ARSENAL, ...o, kits: { ...EMPTY_ARSENAL.kits, ...(o.kits ?? {}) } });

describe('the layout\'s arsenal over the map\'s', () => {
  it('is the map\'s own, the same object, with no setting or an empty one', () => {
    expect(arsenalWith(kits, null)).toEqual({ kits, refused: [] });
    expect(arsenalWith(kits, EMPTY_ARSENAL).kits).toBe(kits);
    expect(arsenalIsEmpty(EMPTY_ARSENAL)).toBe(true);
    expect(arsenalIsEmpty(null)).toBe(true);
    expect(arsenalIsEmpty(a({ valves: { Enable_c4: 9 } }))).toBe(false);
  });

  it('writes the layout\'s valves over the map\'s and recomputes each side\'s selectable items; the map is not touched', () => {
    const out = arsenalWith(kits, a({ valves: { Enable_c4: 9, Enable_LAW: 1, Enable_RPG: 8 } }));
    expect(out.refused).toEqual([]);
    const m = out.kits!.map!;
    expect(m.valves.get('Enable_c4')).toBe(9);
    expect(m.valves.get('Enable_m4Acarbine')).toBe(1);                         // the map's others kept
    expect(m.selectable.seal).toEqual(expect.arrayContaining([ITEM.C4, ITEM.LAW]));
    expect(m.selectable.seal).not.toContain(ITEM.RPG7);
    expect(m.selectable.terrorist).toEqual(expect.arrayContaining([ITEM.C4, ITEM.RPG7]));
    expect(m.selectable.terrorist).not.toContain(ITEM.LAW);
    expect(map.valves.get('Enable_c4')).toBe(0);
    expect(out.kits!.table).toBe(kits.table);
  });

  it('refuses a valve no item is enabled by, and applies the rest', () => {
    const out = arsenalWith(kits, a({ valves: { Enable_c4: 9, Enable_nothing: 9 } }));
    expect(out.refused).toEqual(['Enable_nothing: no item is enabled by this valve']);
    expect(out.kits!.map!.valves.has('Enable_nothing')).toBe(false);
    expect(out.kits!.map!.valves.get('Enable_c4')).toBe(9);
  });

  it('replays a side\'s picks on every one of its types\' kits, through the menu\'s rules (a cost-2 rocket fills its round)', () => {
    const out = arsenalWith(kits, a({ valves: { Enable_c4: 9, Enable_RPG: 8 }, kits: { seal: [{ slot: 4, id: ITEM.C4 }], terrorist: [{ slot: 3, id: ITEM.RPG7 }] } }));
    expect(out.refused).toEqual([]);
    const m = out.kits!.map!;
    expect(m.kits.seal.map((k) => k.loadout)).toEqual([[54, 15, 121, 126, ITEM.C4], [54, 15, 121, 126, ITEM.C4]]);
    expect(m.kits.terrorist[0]!.loadout).toEqual([58, 5, 121, ITEM.RPG7, ITEM.RPG_ROUND]);
    expect(m.kits.seal[0]!.type).toBe('s1');
    expect(map.kits.seal[0]!.loadout).toBe(SEAL);                               // the map's kits not touched
  });

  it('keeps a type\'s own kit when the menu would refuse a pick, and names the type, the pick and why', () => {
    const out = arsenalWith(kits, a({ kits: { seal: [{ slot: 4, id: ITEM.C4 }], terrorist: [] } }));   // Enable_c4 0: not the SEALs'
    expect(out.kits!.map!.kits.seal[0]!.loadout).toEqual(SEAL);
    expect(out.refused).toEqual(['SEAL s1: pick 1 (slot 5, C4) refused', 'SEAL s2: pick 1 (slot 5, C4) refused']);
    const locked = { ...kits, map: { ...map, kits: { ...map.kits, seal: [{ type: 's1', character: 'c', loadout: [54, 15, ITEM.LAW, FULL_SLOT, 194] as Loadout }] } } } as SimKits;
    expect(arsenalWith(locked, a({ valves: { Enable_HEgren: 9 }, kits: { seal: [{ slot: 3, id: 126 }], terrorist: [] } })).refused)
      .toEqual(['SEAL s1: pick 1 (slot 4, HE) locked']);
  });

  it('names a setting a map with no arsenal cannot play, and plays nothing of it', () => {
    expect(arsenalWith(null, a({ valves: { Enable_c4: 9 } }))).toEqual({ kits: null, refused: ['this map has no arsenal: its kits are the baked pair'] });
    expect(arsenalWith(null, EMPTY_ARSENAL)).toEqual({ kits: null, refused: [] });
    const lm = { archive: 'MP2', arsenal: kits };
    const out = mapWithArsenal(lm, a({ valves: { Enable_c4: 9 } }));
    expect(out.map.arsenal!.map!.valves.get('Enable_c4')).toBe(9);
    expect(mapWithArsenal(lm, null).map).toBe(lm);
  });
});

describe('editing the setting', () => {
  it('a side\'s bit on or off over the map\'s value; back at the map\'s value the override is dropped', () => {
    const on = setSideBit(EMPTY_ARSENAL, map.valves, 'Enable_c4', 'seal', true);
    expect(on.valves).toEqual({ Enable_c4: 1 });
    expect(valveOf(on, map.valves, 'Enable_c4')).toBe(1);
    const both = setSideBit(on, map.valves, 'Enable_c4', 'terrorist', true);
    expect(both.valves).toEqual({ Enable_c4: 9 });
    expect(setSideBit(setSideBit(both, map.valves, 'Enable_c4', 'seal', false), map.valves, 'Enable_c4', 'terrorist', false).valves).toEqual({});
    // The lock bits are the map's and kept: MP61's 16 with the SEALs' pick bit is 17.
    const mp61 = new Map([['Enable_c4', 16]]);
    expect(setSideBit(EMPTY_ARSENAL, mp61, 'Enable_c4', 'seal', true).valves).toEqual({ Enable_c4: 17 });
    expect(valveOf(EMPTY_ARSENAL, new Map(), 'Enable_c4')).toBe(0);
  });

  it('a kit slot set or cleared, one pick a slot in slot order, the item\'s valve opened to the side', () => {
    const s1 = setKitSlot(EMPTY_ARSENAL, map.valves, 'seal', 4, ITEM.C4);
    expect(s1.kits.seal).toEqual([{ slot: 4, id: ITEM.C4 }]);
    expect(s1.valves).toEqual({ Enable_c4: 1 });
    const s2 = setKitSlot(s1, map.valves, 'seal', 2, 126);                     // HE: the map's 9 already the SEALs'
    expect(s2.kits.seal).toEqual([{ slot: 2, id: 126 }, { slot: 4, id: ITEM.C4 }]);
    expect(s2.valves).toEqual({ Enable_c4: 1 });
    expect(kitSlotOf(s2, 'seal', 4)).toBe(ITEM.C4);
    expect(kitSlotOf(s2, 'terrorist', 4)).toBeNull();
    const s3 = setKitSlot(s2, map.valves, 'seal', 4, null);
    expect(s3.kits.seal).toEqual([{ slot: 2, id: 126 }]);
    expect(s3.valves).toEqual({ Enable_c4: 1 });                               // the valve stays: an author may still pick it
    expect(arsenalWith(kits, s2).kits!.map!.kits.seal[0]!.loadout).toEqual([54, 15, 126, 126, ITEM.C4]);
  });

  it('the presets are valve and kit edits through the same helpers (a browser adaptation)', () => {
    const ids = ARSENAL_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['breach', 'launchers', 'c4-kit']);
    const breach = ARSENAL_PRESETS[0]!.apply(EMPTY_ARSENAL, map.valves);
    expect(breach.valves).toEqual({ Enable_c4: 9 });
    const launchers = ARSENAL_PRESETS[1]!.apply(EMPTY_ARSENAL, map.valves);
    expect(launchers.valves).toEqual({ Enable_LAW: 9, Enable_RPG: 9 });
    const kit = ARSENAL_PRESETS[2]!.apply(EMPTY_ARSENAL, map.valves);
    expect(kit.kits).toEqual({ seal: [{ slot: 4, id: ITEM.C4 }], terrorist: [{ slot: 4, id: ITEM.C4 }] });
    expect(kit.valves).toEqual({ Enable_c4: 9 });
    const out = arsenalWith(kits, kit);
    expect(out.refused).toEqual([]);
    expect(out.kits!.map!.kits.terrorist[0]!.loadout[4]).toBe(ITEM.C4);
  });

  it('each preset is a toggle: on once what it does holds, off back to the map\'s own', () => {
    const [breach, launchers, c4kit] = ARSENAL_PRESETS;
    expect(ARSENAL_PRESETS.map((p) => p.isOn(EMPTY_ARSENAL, map.valves))).toEqual([false, false, false]);
    const both = breach!.apply(c4kit!.apply(EMPTY_ARSENAL, map.valves), map.valves);
    expect([breach!.isOn(both, map.valves), launchers!.isOn(both, map.valves), c4kit!.isOn(both, map.valves)]).toEqual([true, false, true]);
    // On by hand too: both sides' C4 switches in the grid light the C4 in ARMORY button.
    const byHand = setSideBit(setSideBit(EMPTY_ARSENAL, map.valves, 'Enable_c4', 'seal', true), map.valves, 'Enable_c4', 'terrorist', true);
    expect(breach!.isOn(byHand, map.valves)).toBe(true);
    // Off: Spawn with C4 alone clears slot 5 (C4 stays pickable); C4 in ARMORY clears the valve and the C4 kit that needs it.
    expect(c4kit!.remove(both, map.valves)).toEqual({ valves: { Enable_c4: 9 }, kits: { seal: [], terrorist: [] } });
    expect(breach!.remove(both, map.valves)).toEqual({ valves: {}, kits: { seal: [], terrorist: [] } });
    const l = launchers!.apply(EMPTY_ARSENAL, map.valves);
    expect(launchers!.remove(l, map.valves)).toEqual(EMPTY_ARSENAL);
    // A map whose own valve already opens it both sides (MP51's 9): lit with no override.
    expect(breach!.isOn(EMPTY_ARSENAL, new Map([['Enable_c4', 9]]))).toBe(true);
  });
});
