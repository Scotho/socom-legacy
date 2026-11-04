import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  EMPTY_ITEM, ITEM, NO_DUPLICATE_ITEMS_READING, applyPicks, arsenalOf, autoFill, menuValves, selectable,
  type Arsenal, type Loadout, type Pick, type Side,
} from '../src/arsenal';
import { M60E3_FIRE_WAIT_READING, R0004_M60E3_NAME, weaponRecord } from '../src/weapons';

/**
 * R4B-06 (G9; OT.R97: r0004 is the specification for gameplay; research 378). r0004 closes the "two mine slots, 8
 * mines" exploit in both put-back copies -- the in-game select's (r4 0x2d3cd0, the rewrite of r0001 `FUN_0023bc50`) and
 * the lobby ARMORY's (r4 0x285150, of `FUN_00283e60`) -- adds C4 to the in-game select's no-duplicate list (r4
 * 0x2d2280, of `FUN_0023c390`), fixes the side mask in the put-back, never auto-picks the thermal scope, and strips a
 * leaving M79's / MGL's HE and SMOKE rounds. The port has no remembered put-back (LATER 616): what it has, and what it
 * cannot do, is held here over a hand-built `zweapon.rdr` (the repository's convention: no disc).
 */

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, extra: [string, RdrNode][] = []): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ...extra,
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [
    weapon('M4A1', 54), weapon('M4A1-M203', 61), weapon('AK-47', 58), weapon('M40A1', 102), weapon('MGL', 142), weapon('M79', 143),
    weapon('Mark 23', 15), weapon('M9', 5),
    weapon('M67', 121), weapon('HE', 126), weapon('Claymore', 153), weapon('PMN Mine', 158), weapon('C4', 151),
    rec(['InternalName', 'M203'], ['ID', '141'], ['AMMO_TYPES', []]), weapon('M203 HE', 171), weapon('M203 SMOKE', 173), weapon('M203 FRAG', 175),
    weapon('GL HE', 176), weapon('GL SMOKE', 178), weapon('GL FRAG', 179),
    weapon('Double Ammo Load', 194), weapon('Thermal Scope', 195),
  ],
];
const arsenal: Arsenal = arsenalOf(zweapon);
/** Both launchers for both sides, the Claymore the SEALs', the PMN the Terrorists' (research 94 §A3, every MP map); C4 free of lock bits. */
const valves = new Map([
  ['Enable_m4Acarbine', 1], ['Enable_m4Acarbine_203', 1], ['Enable_ak47', 8], ['Enable_remington700', 9], ['Enable_mglmk1', 9],
  ['Enable_m79', 9], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_HEgren', 9],
  ['Enable_claymore', 1], ['Enable_pmn', 8], ['Enable_c4', 9], ['Enable_2xammo', 9], ['Enable_ThermScope', 9],
]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const count = (k: Loadout, id: number): number => k.filter((x) => x === id).length;
const replay = (side: Side, from: Loadout, picks: Pick[]): Loadout => {
  const r = applyPicks(arsenal, valves, side, from, picks);
  if (!('loadout' in r)) throw new Error(`refused ${r.refused} at ${r.at}`);
  return r.loadout;
};

describe('R4B-06: r0004\'s no-duplicate list (r4 0x2d2280; r0001 FUN_0023c390 D:L87443-87444)', () => {
  it('is r0004\'s set: r0001\'s seven and C4 (0x97 at r4 0x2d24b4)', () => {
    // r0001: {0xc2, 0xc3, 0x9e, 0x99, 0xb9, 0x91, 0x92}; r0004 tests 0x97 first (0x2d24b4-0x2d24b8), then the same seven.
    expect([...NO_DUPLICATE_ITEMS_READING].sort((a, b) => a - b)).toEqual([0x91, 0x92, 0x97, 0x99, 0x9e, 0xb9, 0xc2, 0xc3]);
  });

  it('refuses a second C4 in the select, and the room\'s replay refuses it', () => {
    const k = kit(54, 15, ITEM.C4, 121, 126);
    expect(selectable(valves, 'seal', k, 3, ITEM.C4)).toBe(false);
    expect(selectable(valves, 'seal', k, 2, ITEM.C4)).toBe(true);           // its own slot: no other copy
    expect(selectable(valves, 'terrorist', kit(58, 5, 121, 126, ITEM.C4), 2, ITEM.C4)).toBe(false);
    expect(applyPicks(arsenal, valves, 'seal', k, [{ slot: 3, id: ITEM.C4 }])).toEqual({ refused: 'refused', at: 0 });
  });
});

describe('R4B-06: the double mines cannot be carried (r4 0x2d3cd0, 0x285150) -- already r0004\'s outcome by construction', () => {
  it('B1: SEAL, Claymore in equipment 1; the M4A1-M203 in, a second Claymore in equipment 3, the M4A1 back: one Claymore', () => {
    const on = replay('seal', kit(54, 15, ITEM.CLAYMORE, 121, 126), [{ slot: 0, id: ITEM.M4_203 }]);
    expect(on).toEqual([ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 126]);  // the Claymore displaced, not remembered
    const off = replay('seal', on, [{ slot: 4, id: ITEM.CLAYMORE }, { slot: 0, id: 54 }]);
    expect(count(off, ITEM.CLAYMORE)).toBe(1);
    expect(off[4]).toBe(ITEM.CLAYMORE);
  });

  it.each([ITEM.M79, ITEM.MGL])('B2: Terrorist, PMN in equipment 1; launcher %i in, a second PMN, the AK-47 back: one PMN', (launcher) => {
    const on = replay('terrorist', kit(58, 5, ITEM.PMN, 121, 126), [{ slot: 0, id: launcher }]);
    expect(on[2]).toBe(launcher === ITEM.M79 ? ITEM.GL_FRAG : ITEM.M203_FRAG);
    for (const slot of [3, 4]) {
      const off = replay('terrorist', on, [{ slot, id: ITEM.PMN }, { slot: 0, id: 58 }]);
      expect(count(off, ITEM.PMN)).toBe(1);
    }
  });

  it('no kit single picks reach over this table holds a no-duplicate item twice (both sides; the LAW, RPG-7, Satchel, F2000, M16-M203, thermal sniper and pickups are outside the table -- R4B-06 review P3)', () => {
    const ids = [...arsenal.order];
    for (const [side, start] of [['seal', kit(54, 15, ITEM.CLAYMORE, ITEM.C4, 121)], ['terrorist', kit(58, 5, ITEM.PMN, ITEM.C4, 121)]] as const) {
      const seen = new Set<string>([start.join()]);
      const queue: Loadout[] = [start];
      while (queue.length) {
        const at = queue.shift()!;
        for (const id of [ITEM.CLAYMORE, ITEM.PMN, ITEM.C4]) expect([side, at.join(), id, count(at, id) <= 1]).toEqual([side, at.join(), id, true]);
        for (let slot = 0; slot < 5; slot++) {
          for (const id of ids) {
            const r = applyPicks(arsenal, valves, side, at, [{ slot, id }]);
            if (!('loadout' in r) || seen.has(r.loadout.join())) continue;
            seen.add(r.loadout.join());
            queue.push(r.loadout);
          }
        }
      }
      expect(seen.size).toBeGreaterThan(50);
    }
  });
});

describe('R4B-06: the rest of G9 -- already r0004\'s outcome by construction', () => {
  it('the thermal scope is never auto-picked (r4 0x2d3ef0-0x2d3f08, 0x2d4198-0x2d41b0), even when it alone is left', () => {
    const only = new Map([['Enable_ThermScope', 9], ['Enable_remington700', 9]]);
    for (const after of arsenal.order) {
      expect(autoFill(arsenal, valves, 'seal', kit(102, 15, EMPTY_ITEM, 126, 194), after, after)).not.toBe(ITEM.THERMAL);
      expect(autoFill(arsenal, only, 'seal', kit(102, 15, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM), after, after)).toBe(EMPTY_ITEM);
    }
  });

  it('the refill walks with the player\'s own side: the owner\'s INGAME_AUTOFILL_SIDE_READING (r0004 fixed its put-back, r4 0x2d3f4c-0x2d3f58, but kept the next-item walk inverted, 0x2d41fc-0x2d4208)', () => {
    for (const after of arsenal.order) {
      const seal = autoFill(arsenal, valves, 'seal', kit(54, 15, EMPTY_ITEM, 121, 194), after, after);
      const terr = autoFill(arsenal, valves, 'terrorist', kit(58, 5, EMPTY_ITEM, 121, 194), after, after);
      expect([seal === ITEM.PMN, terr === ITEM.CLAYMORE]).toEqual([false, false]);
    }
  });

  it('the M79 leaving strips GL HE and GL SMOKE with the FRAG (r4 0x2d2fb4, 0x2d30c8, 0x2d31d8)', () => {
    const on = replay('seal', kit(54, 15, 121, 126, 194), [{ slot: 0, id: ITEM.M79 }, { slot: 3, id: 176 }, { slot: 4, id: 178 }]);
    expect(on).toEqual([ITEM.M79, 15, ITEM.GL_FRAG, 176, 178]);
    const off = replay('seal', on, [{ slot: 0, id: 54 }]);
    expect(off.slice(2).filter((id) => id >= 176 && id <= 179)).toEqual([]);
  });

  it('the MGL leaving strips M203 HE and M203 SMOKE with the FRAG (r4 0x2d33bc, 0x2d34d0, 0x2d35e0)', () => {
    const on = replay('terrorist', kit(58, 5, 121, 126, 194), [{ slot: 0, id: ITEM.MGL }, { slot: 3, id: 171 }, { slot: 4, id: 173 }]);
    expect(on).toEqual([ITEM.MGL, 5, ITEM.M203_FRAG, 171, 173]);
    const off = replay('terrorist', on, [{ slot: 0, id: 58 }]);
    expect(off.slice(2).filter((id) => id >= 171 && id <= 175)).toEqual([]);
    expect(menuValves(valves, off[0]!).get('Enable_203HE')).toBe(0);
  });
});

describe('R4B-01\'s follow-up: the arsenal\'s FireWait is the parser\'s (r4 0x3f054c; research 374)', () => {
  it('the M60E3\'s ArsenalItem.fireWait is r0004\'s 0.16, the WeaponRecord\'s, over the disc\'s 0.14; another record keeps its key', () => {
    const script: RdrNode = [
      // Two rounds: a one-record list reads back unwrapped (`rdrGet`), as one-record `Valves` do.
      'ZAMMO', [rec(['InternalName', '7.62 x 51mm'], ['ID', '9']), rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
      'ZWEAPON', [
        rec(['InternalName', R0004_M60E3_NAME], ['ID', '91'], ['FireWait', '0.14'], ['NumMags', '2'], ['Ammo_Capacity', '100'], ['Maximum_Range', '1000'],
          ['AMMO_TYPES', [rec(['NAME', '7.62 x 51mm'])]], ['DecalSet', 'BULLET_MARK_SMALL'],
          ['Reticule_Modifiers', rec(['STANCE_STAND', rec(['ReticuleKnock', '12'], ['ReticuleKnockReturn', '70'], ['ReticuleKnockMax', '45'])])]),
        rec(['InternalName', 'M63A'], ['ID', '92'], ['FireWait', '0.14'], ['AMMO_TYPES', [rec(['NAME', '7.62 x 51mm'])]]),
      ],
    ];
    const items = arsenalOf(script).items;
    expect(items.get(91)!.fireWait).toBe(M60E3_FIRE_WAIT_READING);
    expect(items.get(91)!.fireWait).toBe(weaponRecord(script, R0004_M60E3_NAME).fireWait);
    expect(items.get(92)!.fireWait).toBe(0.14);
  });
});
