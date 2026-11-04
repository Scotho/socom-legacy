import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, EMPTY_ITEM, HELD_RIFLE, HELD_SIDEARM, ITEM, readKitTable, readMapArsenal, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { slotModel } from '../../viewer/src/loadout';
import { MagazineRing } from '../../viewer/src/magazines';
import {
  AMMO_TRANSFER_PLACEHOLDER, claimWeapon, DROP_CONTENTS_READING, DROP_PLACEMENT_PLACEHOLDER, dropsOf, LAUNCHER_DROP_READING,
  PICKUP_FAMILY_READING, PICKUP_HAND_READING, transferAmmo, WEAPON_DROP_AMMO_READING,
} from '../src/pickups';

/**
 * PF-34 (ruling PF.R54; web research 234 s2-s4, 194 s2): the world inventory's pure half -- what a classic death lays
 * (`FUN_005a0040` D:L458646-458706 with `FUN_005ba040` D:L472580-472672), a weapon claim's same-family replacement
 * (`FUN_0059f0c0` D:L458178-458190), and an ammunition bundle's transfer into free ring slots (`AMMO_TRANSFER_PLACEHOLDER`:
 * the original's `FUN_005bb000`/`FUN_005ba770` redistribution is not read). The room's half is `roomPickups.test.ts`.
 */

const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const M9: WeaponRecord = { ...HELD_SIDEARM, name: 'M9', id: 16 };
const TABLE = { records: new Map([DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, M9].map((r) => [r.id, r])) } as unknown as KitTable;
type V3 = [number, number, number];

/** A ring of `capacity` with exactly `slots` (the ten slots' rounds) and `current` in the weapon. */
const ring = (capacity: number, slots: number[], current = 0): MagazineRing => {
  const r = new MagazineRing(capacity, 3);
  r.restore({ slots: [...slots, ...new Array<number>(10 - slots.length).fill(0)], current });
  return r;
};

describe('PF-34: the death drops, the claim and the bundle, pure (research 234 s2-s4)', () => {
  it("dropsOf a classic death: one weapon per firearm slot with an empty ring, the launcher only with its round present (LAUNCHER_DROP_READING), and ONE bundle holding every slot's ten ring entries exactly as they were, the rings cleared (005ba040 D:L472580-472672; DROP_CONTENTS_READING) -- never NumMags full magazines", () => {
    expect(DROP_CONTENTS_READING).toBe('weapons + one bundle of the ten entries, cleared');
    expect(LAUNCHER_DROP_READING).toBe('with its round');
    expect(DROP_PLACEMENT_PLACEHOLDER).toBe("at the feet, the body's yaw");
    const feet: V3 = [10, 0, -20];
    const mags: [MagazineRing, MagazineRing] = [ring(30, [0, 17, 30, 0, 4], 1), ring(12, [3, 0, 12], 0)];
    const victim = { id: 7, loadout: kit(HELD_RIFLE.id, HELD_SIDEARM.id, 121, EMPTY_ITEM, EMPTY_ITEM), records: [HELD_RIFLE, HELD_SIDEARM] as const, mags, rounds: null, feet, yaw: 1.5 };
    const drops = dropsOf(victim);
    // The bundle first (`FUN_0059fd50`), then the primary and the secondary (`FUN_0059f730`): the original's order.
    expect(drops).toEqual([
      { kind: 'ammo', entries: [{ item: HELD_RIFLE.id, rounds: [17, 30, 4] }, { item: HELD_SIDEARM.id, rounds: [3, 12] }], at: feet, yaw: 1.5, from: 7 },
      { kind: 'weapon', item: HELD_RIFLE.id, at: feet, yaw: 1.5, from: 7 },
      { kind: 'weapon', item: HELD_SIDEARM.id, at: feet, yaw: 1.5, from: 7 },
    ]);
    // The rings it was given are cleared (`005ba040` zeroes the ten entries): the body keeps no round.
    expect(mags[0].total()).toBe(0);
    expect(mags[1].total()).toBe(0);
    // Never a fresh NumMags x Ammo_Capacity: 51 rounds of the rifle, not 90; 15 of the pistol, not 36.
    const sum = (e: { rounds: number[] }): number => e.rounds.reduce((a, b) => a + b, 0);
    expect(drops[0]!.entries!.map(sum)).toEqual([51, 15]);
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
      { kind: 'ammo', entries: [{ item: DEFAULT_RIFLE.id, rounds: [12, 30] }], at: feet, yaw: -0.5, from: 3 },
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
    expect(pistol.replaced.map((d) => d.item ?? d.entries)).toEqual([[{ item: HELD_SIDEARM.id, rounds: [12, 12, 5] }], HELD_SIDEARM.id]);
    // A pistol onto the rifle slot: refused; a launcher (its own case) and a bundle are not claimed.
    expect(claimWeapon({ ...drop, item: M9.id }, taker, TABLE, 0)).toEqual({ refused: 'family' });
    expect(claimWeapon({ ...drop, item: ITEM.LAW }, taker, TABLE)).toEqual({ refused: 'family' });
    expect(claimWeapon({ did: 5, kind: 'ammo', entries: [], at: feet, yaw: 0, from: 9 }, taker, TABLE)).toEqual({ refused: 'kind' });
  });

  it('transferAmmo moves whole entries of a weapon the taker carries into free ring slots and leaves the rest as the residual bundle (AMMO_TRANSFER_PLACEHOLDER); an entry for a weapon not carried stays; nothing is created or rounded', () => {
    expect(AMMO_TRANSFER_PLACEHOLDER).toBe('whole entries into free slots');
    // The rifle's ring: 8 slots holding rounds, the one in the weapon (slot 2) empty -- two free slots past it.
    const rifle = ring(30, [30, 30, 0, 30, 30, 30, 30, 30, 30, 30].map((n, i) => (i === 8 || i === 9 ? 0 : n)), 2);
    const pistol = ring(12, [12]);
    const rings: [MagazineRing, MagazineRing] = [rifle, pistol];
    const before = rifle.total() + pistol.total();
    const bundle = [{ item: HELD_RIFLE.id, rounds: [17, 30, 4] }, { item: DEFAULT_RIFLE.id, rounds: [30] }, { item: HELD_SIDEARM.id, rounds: [3] }];
    const out = transferAmmo(bundle, [HELD_RIFLE, HELD_SIDEARM], rings);
    // Two free slots for the rifle (8 and 9; the empty one in the weapon is not one): the 17 and the 30 go, the 4 stays.
    expect(rifle.state()).toEqual({ slots: [30, 30, 0, 30, 30, 30, 30, 30, 17, 30], current: 2 });
    // The pistol takes its 3; the M4A1 (not carried) stays whole.
    expect(pistol.state().slots.slice(0, 3)).toEqual([12, 3, 0]);
    expect(out.moved).toBe(true);
    expect(out.filled).toEqual([[8, 9], [1]]);                   // the slots written: what the page's kit may touch
    expect(out.residual).toEqual([{ item: HELD_RIFLE.id, rounds: [4] }, { item: DEFAULT_RIFLE.id, rounds: [30] }]);
    // Conservation: what the rings gained is what left the bundle, round for round.
    const left = out.residual.flatMap((e) => e.rounds).reduce((a, b) => a + b, 0);
    expect(rifle.total() + pistol.total() - before).toBe(17 + 30 + 4 + 30 + 3 - left);
    // Again: nothing more fits, nothing moves; the input bundle was not mutated.
    const again = transferAmmo(out.residual, [HELD_RIFLE, HELD_SIDEARM], rings);
    expect(again).toEqual({ moved: false, filled: [[], []], residual: out.residual });
    expect(bundle[0]!.rounds).toEqual([17, 30, 4]);
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
