import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, EMPTY_ITEM, FULL_SLOT, HELD_RIFLE, HELD_SIDEARM, ITEM, readKitTable, readMapArsenal, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { slotModel } from '../../viewer/src/loadout';
import { magazinesCarried, MagazineRing } from '../../viewer/src/magazines';
import {
  AMMO_TRANSFER_PLACEHOLDER, claimWeapon, DROP_CONTENTS_READING, DROP_PLACEMENT_PLACEHOLDER, dropsOf, LAUNCHER_DROP_READING,
  PICKUP_AMMO_MATCH_READING, PICKUP_FAMILY_READING, PICKUP_HAND_READING, PICKUP_MAGAZINE_CAP_READING, PICKUP_POUR_READING,
  transferAmmo, WEAPON_DROP_AMMO_READING,
} from '../src/pickups';

/**
 * PF-34 (ruling PF.R54; web research 234 s2-s4, 194 s2): the world inventory's pure half -- what a classic death lays
 * (`FUN_005a0040` D:L458646-458706 with `FUN_005ba040` D:L472580-472672), a weapon claim's same-family replacement
 * (`FUN_0059f0c0` D:L458178-458190), and an ammunition bundle's transfer into free ring slots below the weapon's
 * magazines (`PICKUP_MAGAZINE_CAP_READING`: `FUN_005ba3d0` through `FUN_005bb000`; the top-up of part-spent
 * magazines `PICKUP_POUR_READING`, the remainder still `AMMO_TRANSFER_PLACEHOLDER`). The room's half is
 * `roomPickups.test.ts`.
 */

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const M9: WeaponRecord = { ...HELD_SIDEARM, name: 'M9', id: 16 };
const TABLE = { records: new Map([DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, M9].map((r) => [r.id, r])) } as unknown as KitTable;
/** The goldens' rows (scene test/golden/weapon-records.json: name, id, ammo, magazine, mags), on the M4A1's other fields. */
const R552: WeaponRecord = { ...DEFAULT_RIFLE, name: '552', id: 57, ammo: '5.56 x 45mm', magazine: 30, mags: 3 };
const P228: WeaponRecord = { ...HELD_SIDEARM, name: 'P228', id: 12, ammo: '9x19P', magazine: 15, mags: 4 };
const HK5: WeaponRecord = { ...DEFAULT_RIFLE, name: 'HK5', id: 31, ammo: '9x19P', magazine: 30, mags: 4 };
const M9_GOLDEN: WeaponRecord = { ...HELD_SIDEARM, name: 'M9', id: 5, ammo: '9x19P', magazine: 13, mags: 3 };
type V3 = [number, number, number];

/** A ring of `capacity` with exactly `slots` (the ten slots' rounds) and `current` in the weapon. */
const ring = (capacity: number, slots: number[], current = 0): MagazineRing => {
  const r = new MagazineRing(capacity, 3);
  r.restore({ slots: [...slots, ...new Array<number>(10 - slots.length).fill(0)], current });
  return r;
};

describe('PF-34: the death drops, the claim and the bundle, pure (research 234 s2-s4)', () => {
  it("dropsOf a classic death: one weapon per firearm slot with an empty ring, the launcher only with its round present (LAUNCHER_DROP_READING), and ONE bundle holding, for each slot with a round, its ammunition and the SUM of its ten magazines with no record -- a firearm's entry is matched by ammunition (005ba040 D:L472580-472626: the record zeroed for the firearm and pistol classes, D:L472586-472589; the sum D:L472601-472606) -- the rings cleared; never NumMags full magazines", () => {
    expect(DROP_CONTENTS_READING).toBe('weapons + one bundle of the ten entries, cleared');
    expect(LAUNCHER_DROP_READING).toBe('with its round');
    expect(DROP_PLACEMENT_PLACEHOLDER).toBe("at the feet, the body's yaw");
    const feet: V3 = [10, 0, -20];
    const mags: [MagazineRing, MagazineRing] = [ring(30, [0, 17, 30, 0, 4], 1), ring(12, [3, 0, 12], 0)];
    const victim = { id: 7, loadout: kit(HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), records: [HELD_RIFLE, HELD_SIDEARM] as const, mags, rounds: null, feet, yaw: 1.5 };
    const drops = dropsOf(victim);
    // The bundle first (`FUN_0059fd50`), then the primary and the secondary (`FUN_0059f730`): the original's order.
    expect(drops).toEqual([
      { kind: 'ammo', entries: [{ ammo: '5.56 x 45mm', count: 51 }, { ammo: '45 ACP', count: 15 }], at: feet, yaw: 1.5, from: 7 },
      { kind: 'weapon', item: HELD_RIFLE.id, at: feet, yaw: 1.5, from: 7 },
      { kind: 'weapon', item: HELD_SIDEARM.id, at: feet, yaw: 1.5, from: 7 },
    ]);
    // The rings it was given are cleared (`005ba040` zeroes the ten entries): the body keeps no round.
    expect(mags[0].total()).toBe(0);
    expect(mags[1].total()).toBe(0);
    // Never a fresh NumMags x Ammo_Capacity: 51 rounds of the rifle, not 90; 15 of the pistol, not 36.
    expect(drops[0]!.entries!.map((e) => e.count)).toEqual([51, 15]);
    expect(drops[0]!.entries!.every((e) => e.item === undefined)).toBe(true);
    // A dry body lays its weapons and no bundle; an empty slot lays nothing.
    const dry = dropsOf({ ...victim, loadout: kit(HELD_RIFLE.id, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM), mags: [ring(30, []), ring(12, [])] });
    expect(dry).toEqual([{ kind: 'weapon', item: HELD_RIFLE.id, at: feet, yaw: 1.5, from: 7 }]);
    // The launcher (`005a0040`: only with its round, 0xb9/0xba, present): with a LAW HEAT left it drops; spent, it does not.
    const law = kit(HELD_RIFLE.id, HELD_SIDEARM.id, ITEM.LAW, ITEM.LAW_HEAT, EMPTY_ITEM);
    const left = (n: number) => ({ ring: (id: number) => (id === ITEM.LAW_HEAT ? { total: () => n } : null) });
    const withRound = dropsOf({ ...victim, loadout: law, mags: [ring(30, [1]), ring(12, [])], rounds: left(1) });
    expect(withRound.filter((d) => d.kind === 'weapon').map((d) => d.item)).toEqual([HELD_RIFLE.id, HELD_SIDEARM.id, ITEM.LAW]);
    const spent = dropsOf({ ...victim, loadout: law, mags: [ring(30, [1]), ring(12, [])], rounds: left(0) });
    expect(spent.filter((d) => d.kind === 'weapon').map((d) => d.item)).toEqual([HELD_RIFLE.id, HELD_SIDEARM.id]);
  });

  it("a firearm slot with no firearm record bundles nothing at a death (FUN_005bdc30 D:L474642-474648: FULL_SLOT and EQUIP_NONE unusable; in the original such a slot holds no round, and FUN_005ba040 adds an entry only for a slot with its ammunition and a round, D:L472603-472614) -- the equipment limit's forced kits (research 362 s1: Shotguns and Snipers force the secondary to FULL_SLOT, Pistols the primary) hold the baked record there, whose ring the port fills at the spawn; a taker of that calibre gains nothing from it", () => {
    const feet: V3 = [0, 0, 0];
    // Snipers: the primary and a FULL_SLOT secondary, which holds the baked Mark 23 (`NO_FIREARM_RECORD_PLACEHOLDER`) and its full ring.
    const sniper = { id: 3, loadout: kit(HELD_RIFLE.id, FULL_SLOT, 194, 122, FULL_SLOT), records: [HELD_RIFLE, HELD_SIDEARM] as const,
      mags: [ring(30, [30, 30]), ring(12, [12, 12, 12])] as [MagazineRing, MagazineRing], rounds: null, feet, yaw: 0, table: TABLE };
    expect(dropsOf(sniper)[0]).toEqual({ kind: 'ammo', entries: [{ ammo: '5.56 x 45mm', count: 60 }], at: feet, yaw: 0, from: 3 });
    // Pistols: a FULL_SLOT primary holding the baked M4A1 SD; the pistol's rounds alone.
    const pistols = { ...sniper, loadout: kit(FULL_SLOT, HELD_SIDEARM.id, 123, 122, FULL_SLOT),
      mags: [ring(30, [30, 30]), ring(12, [12, 12])] as [MagazineRing, MagazineRing] };
    expect(dropsOf(pistols)[0]!.entries).toEqual([{ ammo: '45 ACP', count: 24 }]);
    // An empty slot and an item the table holds no firearm record for (the Designator, 11) likewise.
    const none = { ...sniper, loadout: kit(11, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM, EMPTY_ITEM),
      mags: [ring(30, [30]), ring(12, [12])] as [MagazineRing, MagazineRing] };
    expect(dropsOf(none).filter((d) => d.kind === 'ammo')).toEqual([]);
    // A taker with the Mark 23 walks over the sniper's bundle: its pistol's ring takes nothing.
    const takerPistol = ring(12, [12], 0);
    const out = transferAmmo(dropsOf({ ...sniper, mags: [ring(30, [30, 30]), ring(12, [12, 12, 12])] })[0]!.entries!,
      [HELD_RIFLE, HELD_SIDEARM], [ring(30, [30, 30, 30], 0), takerPistol]);
    expect(takerPistol.total()).toBe(12);
    expect(out.residual).toEqual([{ ammo: '5.56 x 45mm', count: 60 }]);
  });

  it("a claim into a firearm slot with no firearm hands back no bundle and no FULL_SLOT weapon (FUN_0059f0c0 D:L458178-458184: FUN_005b8630 matches a 254 to no slot, so neither FUN_0059fd50 nor FUN_0059f730 runs) -- the Snipers kit takes an M9 into its FULL_SLOT secondary", () => {
    const feet: V3 = [0, 0, 0];
    // Snipers: a FULL_SLOT secondary holding the baked Mark 23 and its full ring (the port's spawn fill, LATER 1013).
    const sniper = { id: 3, loadout: kit(HELD_RIFLE.id, FULL_SLOT, 194, 122, FULL_SLOT), records: [HELD_RIFLE, HELD_SIDEARM] as const,
      mags: [ring(30, [30]), ring(12, [12, 12, 12])] as [MagazineRing, MagazineRing], feet, yaw: 0 };
    const claimed = claimWeapon({ did: 6, kind: 'weapon', item: M9.id, at: feet, yaw: 0, from: 9 }, sniper, TABLE);
    expect('replaced' in claimed && claimed.replaced).toEqual([]);
    expect('loadout' in claimed && claimed.loadout[1]).toBe(M9.id);
  });

  it("claimWeapon replaces the taker's same-family slot and hands back the old weapon with its own ring as a new drop (0059f0c0 D:L458178-458190; PICKUP_FAMILY_READING); a pistol onto the rifle slot is refused", () => {
    expect(PICKUP_FAMILY_READING).toBe('same slot');
    expect(WEAPON_DROP_AMMO_READING).toBe('empty ring');
    const feet: V3 = [0, 0, 0];
    const taker = {
      id: 3, loadout: kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), records: [DEFAULT_RIFLE, HELD_SIDEARM] as const,
      mags: [ring(30, [12, 30]), ring(12, [12, 12, 5])] as [MagazineRing, MagazineRing], feet, yaw: -0.5,
    };
    const drop = { did: 4, kind: 'weapon' as const, item: HELD_RIFLE.id, at: [5, 0, 0] as V3, yaw: 0, from: 9 };
    const got = claimWeapon(drop, taker, TABLE);
    if ('refused' in got) throw new Error(got.refused);
    expect(got.slot).toBe(0);
    expect(got.loadout).toEqual([HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM]);
    expect(got.records[0]).toBe(HELD_RIFLE);
    expect(got.records[1]).toBe(HELD_SIDEARM);
    // The taken weapon arrives with the empty ring the bundle left it: nothing created.
    expect(got.ring!.total()).toBe(0);
    expect(got.ring!.capacity).toBe(HELD_RIFLE.magazine);
    // The replaced slot drops its ammo and then its weapon at the taker's feet (`FUN_0059fd50` then `FUN_0059f730`).
    expect(got.replaced).toEqual([
      { kind: 'ammo', entries: [{ ammo: '5.56 x 45mm', count: 42 }], at: feet, yaw: -0.5, from: 3 },
      { kind: 'weapon', item: DEFAULT_RIFLE.id, at: feet, yaw: -0.5, from: 3 },
    ]);
    // The taker's other slot is untouched; the inputs are not mutated (the room applies the result once).
    expect(taker.mags[0].total()).toBe(42);
    expect(taker.loadout[0]).toBe(DEFAULT_RIFLE.id);
    // A pistol onto the pistol slot: the M9 for the Mark 23.
    const pistol = claimWeapon({ ...drop, item: M9.id }, taker, TABLE);
    if ('refused' in pistol) throw new Error(pistol.refused);
    expect(pistol.slot).toBe(1);
    expect(pistol.loadout[1]).toBe(M9.id);
    expect(pistol.replaced.map((d) => d.item ?? d.entries)).toEqual([[{ ammo: '45 ACP', count: 29 }], HELD_SIDEARM.id]);
    // A pistol onto the rifle slot: refused; a launcher (its own case) and a bundle are not claimed.
    expect(claimWeapon({ ...drop, item: M9.id }, taker, TABLE, 0)).toEqual({ refused: 'family' });
    expect(claimWeapon({ ...drop, item: ITEM.LAW }, taker, TABLE)).toEqual({ refused: 'family' });
    expect(claimWeapon({ did: 5, kind: 'ammo', entries: [], at: feet, yaw: 0, from: 9 }, taker, TABLE)).toEqual({ refused: 'kind' });
  });

  it("a dead Terrorist's 552 rounds feed a SEAL's M4A1: transferAmmo matches a bundle entry by its AMMUNITION's name, not the weapon (FUN_005bb000 D:L473176-473188 with FUN_003d2680's name compare), to every slot of the taker whose record takes it, in slot order, the remainder flowing on; an ammunition the taker carries no weapon for stays (PICKUP_AMMO_MATCH_READING)", () => {
    expect(PICKUP_AMMO_MATCH_READING).toBe('by ammunition, every slot in order');
    expect(AMMO_TRANSFER_PLACEHOLDER).toBe('the remainder stays on the ground');
    expect(PICKUP_MAGAZINE_CAP_READING).toBe('NumMags, 2X doubled, at most 10');
    // The Terrorist dies with the 552 (5.56 x 45mm) and the M9 (9x19P): the bundle holds the two ammunitions summed.
    const feet: V3 = [0, 0, 0];
    const dead = { id: 9, loadout: kit(R552.id, M9_GOLDEN.id, 121, EMPTY_ITEM, EMPTY_ITEM), records: [R552, M9_GOLDEN] as const,
      mags: [ring(30, [0, 17, 30, 0, 4], 1), ring(13, [3, 0, 13])] as [MagazineRing, MagazineRing], rounds: null, feet, yaw: 0 };
    const bundle = dropsOf(dead)[0]!.entries!;
    expect(bundle).toEqual([{ ammo: '5.56 x 45mm', count: 51 }, { ammo: '9x19P', count: 16 }]);
    // The SEAL walks over it with the M4A1 (5.56 x 45mm) and the P228 (9x19P): the 552's rounds feed the M4A1; the M9's
    // the P228 -- neither weapon is the dead man's. Each is poured (PICKUP_POUR_READING): the M4A1's full slot 0 takes
    // nothing, the one in the weapon (slot 1) is skipped (NumMags 3), slot 2 is filled.
    const m4 = ring(30, [30, 0, 0], 1), p228 = ring(15, [15]);
    const rings: [MagazineRing, MagazineRing] = [m4, p228];
    const before = m4.total() + p228.total();
    const out = transferAmmo(bundle, [DEFAULT_RIFLE, P228], rings);
    expect(m4.state()).toEqual({ slots: [30, 0, 30, 0, 0, 0, 0, 0, 0, 0], current: 1 });
    expect(p228.state().slots.slice(0, 4)).toEqual([15, 15, 1, 0]);
    expect(out.moved).toBe(true);
    expect(out.filled).toEqual([[2], [1, 2]]);
    expect(out.residual).toEqual([{ ammo: '5.56 x 45mm', count: 21 }]);
    // Conservation: what the rings gained is what left the bundle, round for round; the input was not mutated.
    expect(m4.total() + p228.total() - before).toBe(51 + 16 - 21);
    expect(bundle).toEqual([{ ammo: '5.56 x 45mm', count: 51 }, { ammo: '9x19P', count: 16 }]);
    // The remainder flows on in slot order: 9x19P feeds the HK5 (slot 0) first, then the P228.
    const hk5 = ring(30, [30], 0), p2 = ring(15, [15]);
    const flow = transferAmmo([{ ammo: '9x19P', count: 100 }], [HK5, P228], [hk5, p2]);
    expect(hk5.state().slots.slice(0, 4)).toEqual([30, 30, 30, 30]);
    expect(p2.state().slots.slice(0, 4)).toEqual([15, 10, 0, 0]);
    expect(flow.residual).toEqual([]);
    // An ammunition no weapon of the taker takes stays whole, and an entry that carries a record (not a firearm's:
    // the equipment's, task 4) is left as it is.
    const kept = transferAmmo([{ ammo: '7.62 x 51mm', count: 40 }, { ammo: 'M67 Ammo', item: 121, count: 2 }], [DEFAULT_RIFLE, P228], [ring(30, [30, 0, 0]), ring(15, [15, 0, 0, 0])]);
    expect(kept).toEqual({ moved: false, filled: [[], []], added: [[], []], residual: [{ ammo: '7.62 x 51mm', count: 40 }, { ammo: 'M67 Ammo', item: 121, count: 2 }] });
    // A slot with no firearm (the port's baked record there, `NO_FIREARM_RECORD_PLACEHOLDER`) takes nothing: the original
    // skips a slot with no record (FUN_005bb000 D:L473180) -- the room passes `firearmSlotPresent` of the kit.
    const bare = ring(12, [12, 0, 0]);
    expect(transferAmmo([{ ammo: '45 ACP', count: 12 }], [DEFAULT_RIFLE, HELD_SIDEARM], [ring(30, [30]), bare], [true, false]).residual).toEqual([{ ammo: '45 ACP', count: 12 }]);
    expect(bare.total()).toBe(12);
    // The Double Ammo Load's record (NumMags 6, applied once by the kit, `withDoubleAmmo`): slots 2-5 under its cap.
    const doubled = ring(30, [30, 0, 0], 1);
    const twoX = transferAmmo([{ ammo: '5.56 x 45mm', count: 141 }], [{ ...DEFAULT_RIFLE, mags: 6 }, P228], [doubled, ring(15, [15])]);
    expect(doubled.state()).toEqual({ slots: [30, 0, 30, 30, 30, 30, 0, 0, 0, 0], current: 1 });
    expect(twoX.residual).toEqual([{ ammo: '5.56 x 45mm', count: 21 }]);
  });

  it("the pour (FUN_005ba3d0 D:L472718-472773, r0004's skip at r4 0x5c0d80-0x5c0d9c): every magazine under the cap topped up to capacity in order -- the part-spent ones too -- the one in the weapon skipped when the record's own NumMags is 2 or more, every one past the cap zeroed, the remainder returned (PICKUP_POUR_READING)", () => {
    expect(PICKUP_POUR_READING).toBe('topped up under the cap, the loaded one skipped from 2 magazines');
    const pour = (slots: number[], current: number, count: number, record: WeaponRecord, raw?: number) => {
      const r = ring(record.magazine, slots, current);
      const out = transferAmmo([{ ammo: record.ammo, count }], [record, P228], [r, ring(15, [15, 15, 15, 15])], [true, true], raw === undefined ? undefined : [raw, 4]);
      return { slots: r.state().slots, left: out.residual[0]?.count ?? 0, filled: out.filled[0], added: out.added[0] };
    };
    // 67's case, 2026-11-13: [in the weapon 5, 12, 0], cap 3, 48 rounds -> [5, 30, 30], none left (42 -> [5, 30, 24]).
    expect(pour([5, 12, 0], 0, 48, DEFAULT_RIFLE)).toEqual({ slots: [5, 30, 30, 0, 0, 0, 0, 0, 0, 0], left: 0, filled: [1, 2], added: [18, 30] });
    expect(pour([5, 12, 0], 0, 42, DEFAULT_RIFLE)).toEqual({ slots: [5, 30, 24, 0, 0, 0, 0, 0, 0, 0], left: 0, filled: [1, 2], added: [18, 24] });
    // The part-spent magazine after the one in the weapon: [30 in the weapon, 9, 0] takes 21 + 30, the rest left.
    expect(pour([30, 9, 0], 0, 60, DEFAULT_RIFLE)).toEqual({ slots: [30, 30, 30, 0, 0, 0, 0, 0, 0, 0], left: 9, filled: [1, 2], added: [21, 30] });
    // A one-magazine weapon (the M40A1: NumMags 1, r0004's skip not taken): its only magazine, the one in the weapon, topped up.
    const m40: WeaponRecord = { ...DEFAULT_RIFLE, name: 'M40A1', id: 102, ammo: '7.62 x 51mm', magazine: 25, mags: 1 };
    expect(pour([10], 0, 30, m40)).toEqual({ slots: [25, 0, 0, 0, 0, 0, 0, 0, 0, 0], left: 15, filled: [0], added: [15] });
    // With the Double Ammo Load the room's record says 2 (withDoubleAmmo) but r0004 reads the record's own NumMags, 1:
    // the one in the weapon is still topped up -- `raw`, the kit table's NumMags.
    expect(pour([10, 0], 0, 40, { ...m40, mags: 2 }, 1)).toEqual({ slots: [25, 25, 0, 0, 0, 0, 0, 0, 0, 0], left: 0, filled: [0, 1], added: [15, 25] });
    // A doubled 3-magazine record (6) skips the one in the weapon as its own NumMags (3) says.
    expect(pour([7, 0, 0, 0, 0, 0], 0, 300, { ...DEFAULT_RIFLE, mags: 6 }, 3)).toEqual({ slots: [7, 30, 30, 30, 30, 30, 0, 0, 0, 0], left: 150, filled: [1, 2, 3, 4, 5], added: [30, 30, 30, 30, 30] });
    // A magazine past the cap is zeroed (D:L472760-472763): the port's rings hold none there, but the rule is the original's.
    expect(pour([30, 30, 30, 0, 0, 12], 1, 0, DEFAULT_RIFLE)).toEqual({ slots: [30, 30, 30, 0, 0, 0, 0, 0, 0, 0], left: 0, filled: [5], added: [-12] });
  });

  it("the player report (2026-11-06, 9 MAG off bodies): an M4A1 ring never holds more than its NumMags magazines -- 3, or 6 with the 2X record -- however many bodies are walked over (FUN_005ba3d0 D:L472718-472763 via FUN_005bb000 D:L473174-473188)", () => {
    const body = () => [{ ammo: '5.56 x 45mm', count: 90 }];
    for (const [record, cap] of [[DEFAULT_RIFLE, 3], [{ ...DEFAULT_RIFLE, mags: magazinesCarried(DEFAULT_RIFLE.mags, true) }, 6]] as const) {
      expect(record.mags).toBe(cap);
      // A spent ring: the magazine in the weapon (slot 0) part-fired, nothing else.
      const m4 = ring(30, [9]);
      const rings: [MagazineRing, MagazineRing] = [m4, ring(12, [12, 12, 12])];
      for (let walked = 0; walked < 3; walked++) {
        transferAmmo(body(), [record, HELD_SIDEARM], rings);
        const s = m4.state().slots;
        expect(s.filter((n) => n > 0).length, `cap ${cap}, body ${walked + 1}`).toBeLessThanOrEqual(cap);
        expect(s.slice(cap).every((n) => n === 0), `cap ${cap}: no slot past the cap`).toBe(true);
        // The ammo box's MAG (`FUN_005c49b0`, less one) never above NumMags - 1: 2, or 5 with 2X -- never 9.
        expect(m4.shownMags(), `cap ${cap}, body ${walked + 1}`).toBeLessThanOrEqual(cap - 1);
      }
      expect(m4.shownMags()).toBe(cap - 1);
    }
  });
});

/**
 * NU-5 L1, pure (research 323 R323.5, §1.6, §7 L1; F1 of its review): `claimWeapon` takes a rocket launcher when
 * `launcherOffered` holds for the taker's kit (`FUN_005bac30` D:L473023-473084), into `FUN_005bae60`'s slot
 * (D:L473101-473152) with no exchange, its round (185, or 186 for 146) beside it with one round (`FUN_0059f0c0`
 * D:L458238-458292); `'family'` otherwise. The taker's kit slots (`kit`: each item and the rounds its ring holds) are
 * what the room reads off the seat (`KitRounds`, the pouch).
 */
describe('NU-5 L1: claimWeapon takes a rocket launcher (research 323 §7 L1)', () => {
  const feet: V3 = [0, 0, 0];
  const law = { did: 4, kind: 'weapon' as const, item: ITEM.LAW, at: [5, 0, 0] as V3, yaw: 0, from: 9 };
  const taker = (loadout: Loadout, rounds: number[] = []) => ({
    id: 3, loadout, records: [DEFAULT_RIFLE, HELD_SIDEARM] as const, mags: [ring(30, [30]), ring(12, [12])] as [MagazineRing, MagazineRing], feet, yaw: 0,
    kit: [...loadout].map((item, i) => ({ item, rounds: rounds[i] ?? 0 })),
  });

  it('a LAW into an empty equipment slot, LAW HEAT beside it with 1; an RPG-7 with its RPG round; no exchange laid', () => {
    const got = claimWeapon(law, taker(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), [0, 0, 3]), TABLE);
    if ('refused' in got) throw new Error(got.refused);
    expect(got.loadout).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, ITEM.LAW, ITEM.LAW_HEAT]);
    expect(got.launcher).toEqual({ slot: 3, round: 4, rounds: 1 });
    expect(got.replaced).toEqual([]);
    const rpg = claimWeapon({ ...law, item: ITEM.RPG7 }, taker(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), [0, 0, 0]), TABLE);
    if ('refused' in rpg) throw new Error(rpg.refused);
    expect(rpg.loadout).toEqual([DEFAULT_RIFLE.id, HELD_SIDEARM.id, ITEM.RPG7, ITEM.RPG_ROUND, EMPTY_ITEM]);   // the spent M67's slot first
    expect(rpg.launcher).toEqual({ slot: 2, round: 3, rounds: 1 });
  });

  it("refused 'family' for a kit holding a LAW, an M203 rifle or the MGL, and for one with no slot 2-4 free or replaceable", () => {
    for (const k of [kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, ITEM.LAW, ITEM.LAW_HEAT, EMPTY_ITEM), kit(ITEM.M4_203, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM),
      kit(ITEM.MGL, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM)]) {
      expect(claimWeapon(law, taker(k, [0, 0, 1, 1]), TABLE), k.join(',')).toEqual({ refused: 'family' });
    }
    expect(claimWeapon(law, taker(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 126, 151), [0, 0, 3, 3, 4]), TABLE)).toEqual({ refused: 'family' });
    // PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER (decision (i)): a place for the launcher (the empty slot 4) and none for its round.
    expect(claimWeapon(law, taker(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 126, EMPTY_ITEM), [0, 0, 3, 3]), TABLE)).toEqual({ refused: 'family' });
    // No kit read (a caller that lends none): refused, as before L1.
    const { kit: _k, ...bare } = taker(kit(DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM));
    expect(claimWeapon(law, bare, TABLE)).toEqual({ refused: 'family' });
  });
});

/**
 * NU-5 H1 (research 323 R323.3, §1.3 item 5, §7 H1): the hand after a claim is read -- `FUN_005bc410` writes no current
 * slot (`+0x824`) and refreshes the hand only when the installed slot is the hand's (D:L473823-473868) -- so
 * `PICKUP_HAND_PLACEHOLDER` is re-filed as `PICKUP_HAND_READING`, its value unchanged; `takeKit.test.ts` and
 * `roomPickups.test.ts`'s NU-6 P1 hold the behaviour.
 */
describe('NU-5 H1: the hand kept after a claim, a reading (research 323 §7 H1)', () => {
  it("PICKUP_HAND_READING is 'the hand kept' (005bc410 D:L473823-473868 writes no +0x824)", () => {
    expect(PICKUP_HAND_READING).toBe('the hand kept');
  });
});

// A dev-disc test (W6.R8): the disc tree is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; absent, it skips itself.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const disc = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : undefined;
const have = !!disc && existsSync(join(disc, 'RUN', 'ZWEAPON.ZAR'));
const maps = have ? readdirSync(join(disc, 'RUN')).filter((n) => /^MP\d+\.ZDB$/i.test(n)).sort() : ['MP2.ZDB'];

/**
 * NU-5 P1, the dev-disc case (research 323 R323.1, §7 P1): a weapon of the other side's kits, claimed by a kit of this
 * side, resolves its record and its held model from the disc's kit table (`kitRecords`, `slotModel`) -- the claim reads
 * the item, never a side (§1.1), so a cross-side record must be in the table for the taker and the remote re-hang.
 */
describe.skipIf(!have)('NU-5 P1 (dev disc): a cross-side weapon resolves for the taker over every MP map', () => {
  it.each(maps)('%s: each side takes each firearm of the other side\'s kits with its own record and model', (name) => {
    const table = readKitTable(readFileSync(join(disc!, 'RUN', 'ZWEAPON.ZAR')));
    const map = readMapArsenal(table.arsenal, readFileSync(join(disc!, 'RUN', name)), readFileSync(join(disc!, 'RUN', 'READERC.ZAR')));
    let claims = 0;
    for (const [side, other] of [['seal', 'terrorist'], ['terrorist', 'seal']] as const) {
      for (const own of map.kits[side]) for (const theirs of map.kits[other]) for (const s of [0, 1] as const) {
        const item = theirs.loadout[s];
        if (item === EMPTY_ITEM) continue;
        const taker = { id: 1, loadout: own.loadout, records: [HELD_RIFLE, HELD_SIDEARM] as const, mags: [new MagazineRing(30, 1), new MagazineRing(12, 1)] as [MagazineRing, MagazineRing], feet: [0, 0, 0] as V3, yaw: 0 };
        const got = claimWeapon({ kind: 'weapon', item, at: [0, 0, 0], yaw: 0, from: 2 }, taker, table);
        if ('refused' in got) throw new Error(`${name} ${side} ${item}: ${got.refused}`);
        expect(got.slot, `${name} ${side} ${item}`).toBe(s);
        expect(got.records[s].id, `${name} ${side} ${item}`).toBe(item);
        expect(slotModel(table, got.loadout, s), `${name} ${side} ${item}`).toBeTruthy();
        claims++;
      }
    }
    expect(claims).toBeGreaterThan(0);
  });
});
