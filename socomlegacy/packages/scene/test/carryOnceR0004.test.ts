import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  EMPTY_ITEM, ITEM, NO_DUPLICATE_ITEMS_READING, NO_REMEMBERED, applyPicks, arsenalOf, autoFill, menuValves, pick, putBackItem, replayPicks,
  selectable,
  type Arsenal, type Loadout, type Pick, type Remembered, type Side,
} from '../src/arsenal';
import { M60E3_FIRE_WAIT_READING, R0004_M60E3_NAME, weaponRecord } from '../src/weapons';

/**
 * R4B-06 (G9; OT.R97: r0004 is the specification for gameplay; research 378). r0004 closes the "two mine slots, 8
 * mines" exploit in both put-back copies -- the in-game select's (r4 0x2d3cd0, the rewrite of r0001 `FUN_0023bc50`) and
 * the lobby ARMORY's (r4 0x285150, of `FUN_00283e60`) -- adds C4 to the in-game select's no-duplicate list (r4
 * 0x2d2280, of `FUN_0023c390`), fixes the side mask in the put-back, never auto-picks the thermal scope, and strips a
 * leaving M79's / MGL's HE and SMOKE rounds. R4P-221 (LATER 616) adds the remembered put-back itself (`pick`'s and
 * `replayPicks`' `remembered`). Held here over a hand-built `zweapon.rdr` (the repository's convention: no disc).
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
    weapon('F2000', 63), weapon('F2000 FRAG', 183),
    weapon('Double Ammo Load', 194), weapon('Thermal Scope', 195), weapon('AN-M8', 122),
  ],
];
const arsenal: Arsenal = arsenalOf(zweapon);
/** Both launchers for both sides, the Claymore the SEALs', the PMN the Terrorists' (research 94 §A3, every MP map); C4 free of lock bits. */
const valves = new Map([
  ['Enable_m4Acarbine', 1], ['Enable_m4Acarbine_203', 1], ['Enable_ak47', 8], ['Enable_remington700', 9], ['Enable_mglmk1', 9],
  ['Enable_m79', 9], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_HEgren', 9],
  ['Enable_claymore', 1], ['Enable_pmn', 8], ['Enable_c4', 9], ['Enable_2xammo', 9], ['Enable_ThermScope', 9],
  ['Enable_smoke', 9],
  ['Enable_F2000', 9], ['Enable_F2000FRAG', 9],
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
    expect(on).toEqual([ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 126]);  // the Claymore displaced and remembered
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

  it('no kit single picks reach over this table holds a mine twice, the remembered pair carried; C4 twice only by the put-back second id (both sides; the LAW, RPG-7, Satchel, M16-M203, thermal sniper and pickups are outside the table -- R4B-06 review P3)', () => {
    const ids = [...arsenal.order];
    for (const [side, start] of [['seal', kit(54, 15, ITEM.CLAYMORE, ITEM.C4, 121)], ['terrorist', kit(58, 5, ITEM.PMN, ITEM.C4, 121)]] as const) {
      type State = { loadout: Loadout; remembered: Remembered };
      const key = (st: State): string => `${st.loadout.join()}|${st.remembered.join()}`;
      const first: State = { loadout: start, remembered: NO_REMEMBERED };
      const seen = new Set<string>([key(first)]);
      const queue: State[] = [first];
      const bad: string[] = [];
      while (queue.length) {
        const at = queue.shift()!;
        for (const id of [ITEM.CLAYMORE, ITEM.PMN]) if (count(at.loadout, id) > 1) bad.push(`${side} ${key(at)} ${id}`);
        // Two C4 only as the put-back gives them (the test below): equipment 1 and 2, the launcher just gone.
        if (count(at.loadout, ITEM.C4) > 1 && (at.loadout[2] !== ITEM.C4 || at.loadout[3] !== ITEM.C4)) bad.push(`${side} ${key(at)} C4`);
        for (let slot = 0; slot < 5; slot++) {
          for (const id of ids) {
            const r = replayPicks(arsenal, valves, side, at.loadout, [{ slot, id }], at.remembered);
            if (!('loadout' in r) || seen.has(key(r))) continue;
            seen.add(key(r));
            queue.push(r);
          }
        }
      }
      expect(bad).toEqual([]);
      expect(seen.size).toBeGreaterThan(50);
    }
  }, 60_000);
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

/** One pick at a time, the remembered pair carried from each to the next (the page's menus and the room's replay alike). */
const stepwise = (side: Side, from: Loadout, picks: Pick[], remembered: Remembered = NO_REMEMBERED): { loadout: Loadout; remembered: Remembered } => {
  let at = { loadout: from, remembered };
  for (const p of picks) {
    const r = pick(arsenal, valves, side, at.loadout, p.slot, p.id, at.remembered);
    at = { loadout: r.loadout, remembered: r.remembered };
  }
  return at;
};

describe('R4P-221: the remembered put-back (LATER 616; r0001 FUN_0023fef0 D:L89301-89316 / FUN_0023eca0 D:L88638-88653, r0004 FUN_002d25e0 via FUN_002d3cd0)', () => {
  it('Q-221\'s table: the M4A1-M203 in remembers slots 2-3, the M4A1 back gives back the M67 and the HE', () => {
    const on = stepwise('seal', kit(54, 15, 121, 126, 122), [{ slot: 0, id: ITEM.M4_203 }]);
    expect(on.loadout).toEqual([ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 122]);
    expect(on.remembered).toEqual([121, 126]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 121, 126, 122]);
    // The room's replay carries the pair across one request's picks.
    expect(replay('seal', kit(54, 15, 121, 126, 122), [{ slot: 0, id: ITEM.M4_203 }, { slot: 0, id: 54 }])).toEqual([54, 15, 121, 126, 122]);
  });

  it('proven by capture Q221-PC2 (r0004, Desert Glory, SEAL, 3/3 each way): 54 15 121 126 151 -> 61 15 141 175 151 -> 54 15 121 126 151', () => {
    const on = stepwise('seal', kit(54, 15, 121, 126, ITEM.C4), [{ slot: 0, id: ITEM.M4_203 }]);
    expect(on.loadout).toEqual([61, 15, 141, 175, 151]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 121, 126, 151]);
  });

  it('a grenade displaced by the M79 comes back as that grenade, not the walk\'s first item', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.M79 }]);
    expect(on.loadout).toEqual([ITEM.M79, 15, ITEM.GL_FRAG, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });

  it('a remembered carry-once item comes back once: the PMN back after the M79; with a second PMN carried, the own-side substitute instead', () => {
    const on = stepwise('terrorist', kit(58, 5, ITEM.PMN, 121, 126), [{ slot: 0, id: ITEM.M79 }]);
    expect(stepwise('terrorist', on.loadout, [{ slot: 0, id: 58 }], on.remembered).loadout).toEqual([58, 5, ITEM.PMN, 121, 126]);
    const twice = stepwise('terrorist', on.loadout, [{ slot: 4, id: ITEM.PMN }, { slot: 0, id: 58 }], on.remembered).loadout;
    expect(count(twice, ITEM.PMN)).toBe(1);
    // FUN_002d3cd0: the next equipment item after the PMN in the file's order the Terrorists' valve allows -- C4 (Enable_c4 9).
    expect(twice).toEqual([58, 5, ITEM.C4, 121, ITEM.PMN]);
  });

  it('a remembered thermal scope is dropped when the launcher leaves, a sniper coming in or not (ARMORY_THERMAL_DROP_READING)', () => {
    for (const primary of [54, 102]) {
      const off = stepwise('seal', kit(ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 126), [{ slot: 0, id: primary }], [ITEM.THERMAL, 121]).loadout;
      expect(count(off, ITEM.THERMAL)).toBe(0);
      expect(off[3]).toBe(121);
    }
  });
});

describe('R4P-221 fold: the ids go back to any of the launcher rounds (PUTBACK_SLOT_ORDER_READING)', () => {
  // The M203 rifles: every round loop carries the slot-3 test (r0001 FUN_0023eca0 D:L88897 in the 0xaf loop, D:L88936
  // 0xab, D:L88975 0xac, D:L89014 0xad, D:L89053 0xae; r4 0x2d2938-0x2d2958 (0xaf), 0x2d2a70-0x2d2a90 (0xab),
  // 0x2d2ba8-0x2d2bc8), so the second id goes to slot 3 whichever M203 round it holds.
  for (const round of [171, 173]) {
    it(`M4A1-M203 in, its FRAG switched to ${round}, the M4A1 back: the HE comes back to slot 3`, () => {
      const on = stepwise('seal', kit(54, 15, 121, 126, 122), [{ slot: 0, id: ITEM.M4_203 }, { slot: 3, id: round }]);
      expect(on.loadout).toEqual([ITEM.M4_203, 15, ITEM.M203, round, 122]);
      expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 121, 126, 122]);
    });
  }
  // The M79, the MGL (r0004): the first-id flag is cleared once (r4 0x2d2fa8) and carried across the FRAG, HE and SMOKE
  // loops (r4 0x2d3028/0x2d3038, 0x2d3138/0x2d3148, 0x2d3248/0x2d3258; the MGL's +0x1530 writes 0x2d3424, 0x2d3534,
  // 0x2d3644), so the first id goes to the first slot found holding any of them, in that order.
  it('M79 in, its GL FRAG switched to GL HE, the M4A1 back: the HE comes back to slot 2', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.M79 }, { slot: 2, id: 176 }]);
    expect(on.loadout).toEqual([ITEM.M79, 15, 176, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });
  it('MGL in, its M203 FRAG switched to M203 HE, the M4A1 back: the HE comes back to slot 2', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.MGL }, { slot: 2, id: 171 }]);
    expect(on.loadout).toEqual([ITEM.MGL, 15, 171, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });
  // The F2000 has the FRAG loop alone, in both revisions (r0001 D:L88784-88817; r4 the 0xb7 loop only): the first id goes
  // back to the F2000 FRAG's slot. Ids: the F2000 63, its FRAG 183 (golden arsenal-items.json, Enable_F2000 / Enable_F2000FRAG).
  it('F2000 in, the M4A1 back: the M67 comes back to the F2000 FRAG slot (slot 2)', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.F2000 }]);
    expect(on.loadout).toEqual([ITEM.F2000, 15, ITEM.F2000_FRAG, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });
  it('M79 in, its GL FRAG switched to GL SMOKE (178), the M4A1 back: the first id comes back to slot 2', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.M79 }, { slot: 2, id: 178 }]);
    expect(on.loadout).toEqual([ITEM.M79, 15, 178, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });
  it('MGL in, its M203 FRAG switched to M203 SMOKE (173), the M4A1 back: the first id comes back to slot 2', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.MGL }, { slot: 2, id: 173 }]);
    expect(on.loadout).toEqual([ITEM.MGL, 15, 173, 121, 194]);
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 126, 121, 194]);
  });
  // ORDER: FRAG is searched before HE, rounds before slots (r4 M79 loop heads 179 at 0x2d2fb4, 176 at 0x2d30c8, 178 at 0x2d31d8).
  it('M79 with GL HE in slot 2 and GL FRAG in slot 3, the M4A1 back: the first id goes to slot 3 (FRAG before HE)', () => {
    const on = stepwise('seal', kit(54, 15, 126, 121, 194), [{ slot: 0, id: ITEM.M79 }, { slot: 2, id: 176 }, { slot: 3, id: 179 }]);
    expect(on.loadout).toEqual([ITEM.M79, 15, 176, 179, 194]);
    const off = stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout;
    expect(off[3]).toBe(126);
    expect(off[2]).not.toBe(126);
  });
});

describe('R4P-221 fold: an empty slot is no record (r0001 FUN_0023fef0 D:L89301-89306, FUN_0023bc50 D:L87202-87210; r4 0x240250-0x240274)', () => {
  it('the M4A1-M203 over an empty slot 2 remembers none for both ids, and the M4A1 back walks both', () => {
    const on = stepwise('seal', kit(54, 15, EMPTY_ITEM, 121, EMPTY_ITEM), [{ slot: 0, id: ITEM.M4_203 }]);
    expect(on.remembered).toEqual([EMPTY_ITEM, EMPTY_ITEM]);
    // Both ids none -> replaced by the walk (D:L88646-88652): the first after the M4A1-M203, the second not that one.
    expect(stepwise('seal', on.loadout, [{ slot: 0, id: 54 }], on.remembered).loadout).toEqual([54, 15, 121, 126, EMPTY_ITEM]);
  });
  it('the helper never finds none carried: an empty slot holds no record to match', () => {
    expect(putBackItem(arsenal, valves, 'seal', kit(ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, EMPTY_ITEM), EMPTY_ITEM)).toBe(EMPTY_ITEM);
  });
});

describe('R4P-221: the put-back second id (r0001 FUN_0023eca0 D:L88643-88645; r0004 FUN_002d25e0 unchanged there, by the atlas masked diff)', () => {
  it('a remembered C4 comes back as itself beside the substitute C4 a carried Claymore gets: two C4 slots, the transcription of both revisions (research 378 s11)', () => {
    // The main controller's ruling, 2026-11-24: the port follows the original's code exactly even where this sequence lets a
    // player carry two C4 -- the original decides; R4B-06's refusal by omission was the departure. Source: r0001
    // FUN_0023eca0 D:L88643-88645 (only a second id the helper changed is walked); r4 0x2d267c-0x2d269c, the helper's
    // list r4 0x2d3e18. Reading, in-game select only, not measured; a capture of the sequence on r0004 settles it.
    // SEAL [54, 15, Claymore, C4, M67]: the M4A1-M203 remembers [Claymore, C4]; a Claymore into equipment 3; the M4A1 back.
    // The Claymore is carried and listed -> the walk's next SEAL equipment item, C4 (not carried); the C4 comes back as
    // itself, so the second id is not walked (only one the helper changed is compared with the first).
    const on = stepwise('seal', kit(54, 15, ITEM.CLAYMORE, ITEM.C4, 121), [{ slot: 0, id: ITEM.M4_203 }]);
    expect(on.remembered).toEqual([ITEM.CLAYMORE, ITEM.C4]);
    const off = stepwise('seal', on.loadout, [{ slot: 4, id: ITEM.CLAYMORE }, { slot: 0, id: 54 }], on.remembered).loadout;
    expect(off).toEqual([54, 15, ITEM.C4, ITEM.C4, ITEM.CLAYMORE]);
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
