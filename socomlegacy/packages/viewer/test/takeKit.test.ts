import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, type WeaponRecord } from '@s2u/scene';
import { takeKit, type TakeKitDeps } from '../src/takeKit';
import type { Firearm } from '../src/kit';

/**
 * PF-34 review (web research 234 s6): the room's `kit` after a pickup on the page, one function both `main.ts` and
 * `matchFirearm.ts` call (the held area's wiring kept to a call each): the live kit taken, each firearm's ring set from
 * the room's slots without a fill, the hand's replaced weapon taken up, a replaced slot's fire mode and model renewed.
 */

function rig(hand: Firearm = 'rifle', start: readonly [WeaponRecord, WeaponRecord] = [DEFAULT_RIFLE, HELD_SIDEARM], kit: readonly number[] = [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255]) {
  const log: string[] = [], clips: string[] = [];
  let records = start, kitRecs = start, current = kit;
  const modes: Record<Firearm, number> = { rifle: 99, pistol: 98 };
  const deps: TakeKitDeps = {
    loadouts: {
      take: (k) => { log.push(`take ${k.join(',')}`); current = [...k]; records = k[0] === HELD_RIFLE.id ? [HELD_RIFLE, records[1]] : records; },
      records: () => records, loadout: () => current,
    },
    fire: {
      takeWeapon: (r, rounds) => { log.push(`takeWeapon ${r.name} ${rounds.join(',')}`); },
      setRing: (r, slots, replaced, only) => { log.push(`setRing ${r.name} ${slots.join(',')} ${replaced ?? '-'} ${only?.join(',') ?? '-'}`); },
    },
    accuracy: { setWeapon: (r) => { log.push(`accuracy ${r.name}`); } },
    hand: () => hand,
    records: (r) => { kitRecs = r; },
    modes,
    heldRounds: () => [],
    renew: () => { log.push('renew'); },
    launcherTaken: (slot, round, rounds) => { log.push(`launcherTaken ${slot} ${round} ${rounds}`); },
    swapClip: (name) => { clips.push(name); },
  };
  return { deps, log, clips, modes, kitRecs: () => kitRecs };
}

const ring = (n: number): number[] => [n, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe('PF-34 review: takeKit, one function for both pages (research 234 s6)', () => {
  it('takeKit after a claim of the slot in the hand takes the weapon up with its exact ring, sets the other ring, renews the slot\'s fire mode and model; after a walk-over it sets only the filled slots and renews nothing', () => {
    const r = rig('rifle');
    takeKit(r.deps, [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], 0, [ring(0), ring(12)]);
    expect(r.log).toEqual([
      'take 62,15,121,255,255',
      'takeWeapon M4A1 SD 0,0,0,0,0,0,0,0,0,0', 'accuracy M4A1 SD',
      'setRing Mark 23 12,0,0,0,0,0,0,0,0,0 - -',
      'renew',
    ]);
    expect(r.kitRecs()[0]).toBe(HELD_RIFLE);
    expect(r.modes.rifle).not.toBe(99);                            // a new record: its own default mode
    expect(r.modes.pistol).toBe(98);
    // The claim into the slot not in the hand: its ring set and the replaced weapon's stowed ring forgotten.
    const p = rig('pistol');
    takeKit(p.deps, [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], 0, [ring(0), ring(12)]);
    expect(p.log.filter((l) => !l.startsWith('take '))).toEqual(['setRing M4A1 SD 0,0,0,0,0,0,0,0,0,0 M4A1 -', 'setRing Mark 23 12,0,0,0,0,0,0,0,0,0 - -', 'renew']);
    // A walk-over: no slot, the filled slots only, nothing renewed.
    const w = rig('rifle');
    takeKit(w.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], null, [[30, 17, 0, 0, 0, 0, 0, 0, 0, 0], ring(12)], [[1], []]);
    expect(w.log).toEqual(['take 54,15,121,255,255', 'setRing M4A1 30,17,0,0,0,0,0,0,0,0 - 1', 'setRing Mark 23 12,0,0,0,0,0,0,0,0,0 - ']);
    expect(w.modes).toEqual({ rifle: 99, pistol: 98 });
  });
});

/**
 * NU-5 L1 (web research 323 R323.5, §1.6, §7 L1): a rocket launcher claimed goes into an equipment slot with its round
 * beside it, one round (`FUN_0059f0c0` D:L458238-458292; `PICKUP_LAUNCHER_ROUNDS_READING`). The room's `kit` names no
 * firearm slot for it and writes no firearm ring (`filled` empty), so the page takes the equipment slot from the kit's
 * own change: `launcherTaken` (the launcher's slot, its round's, the count) for the page's round slots and equipment,
 * and the HUD renewed (`FUN_005bc410` sets the weapon panel's redraw bit, D:L473845; again D:L458295-458296).
 */
describe('NU-5 L1: takeKit takes an equipment slot and its round (research 323 §7 L1)', () => {
  it("a LAW claimed into the spent M67's slot with its LAW HEAT in the empty slot: launcherTaken(2, 4, 1) and the HUD renewed; the firearm rings untouched (filled empty), no firearm mode changed", () => {
    const r = rig('rifle', [DEFAULT_RIFLE, HELD_SIDEARM], [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 126, 255]);
    takeKit(r.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 145, 126, 185], null, [ring(30), ring(12)], [[], []]);
    expect(r.log).toEqual([
      'take 54,15,145,126,185',
      'setRing M4A1 30,0,0,0,0,0,0,0,0,0 - ', 'setRing Mark 23 12,0,0,0,0,0,0,0,0,0 - ',
      'launcherTaken 2 4 1', 'renew',
    ]);
    expect(r.modes).toEqual({ rifle: 99, pistol: 98 });
    // The RPG-7 with its RPG round: the same, the round's slot by its item.
    const q = rig('pistol', [DEFAULT_RIFLE, HELD_SIDEARM], [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 255, 126, 255]);
    takeKit(q.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 146, 126, 186], null, [ring(30), ring(12)], [[], []]);
    expect(q.log.filter((l) => !l.startsWith('setRing'))).toEqual(['take 54,15,146,126,186', 'launcherTaken 2 4 1', 'renew']);
    // A walk-over that changes no equipment slot takes no launcher and renews nothing (the existing rule).
    const w = rig('rifle');
    takeKit(w.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], null, [ring(30), ring(12)], [[0], []]);
    expect(w.log.some((l) => l.startsWith('launcherTaken') || l === 'renew')).toBe(false);
  });
});

/**
 * NU-5 X1 and research 324 P2 (research 323 §1.5; `PICKUP_SWAP_OWN_LAG_READING`): the taker's own `Swap rifle` at the
 * room's `kit` -- `swapRifleExchange` when the claimed slot held a weapon (the exchange laid it, `FUN_00588bc0`
 * D:L458209-458211), `swapRifleClaim` after a launcher claim (D:L458199-458206), none for a claim into an empty slot or
 * a walk-over (`./walk` `WalkMode.pickupSwap` plays it).
 */
describe('NU-5: takeKit asks the own walk for the pick-up\'s Swap rifle (research 323 X1, 324 P2)', () => {
  it('an exchange: swapRifleExchange; a claim into an empty firearm slot: none; a launcher claim: swapRifleClaim; a walk-over: none', () => {
    const ex = rig('rifle');
    takeKit(ex.deps, [HELD_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], 0, [ring(0), ring(12)]);
    expect(ex.clips).toEqual(['swapRifleExchange']);
    const empty = rig('rifle', [DEFAULT_RIFLE, HELD_SIDEARM], [DEFAULT_RIFLE.id, 255, 121, 255, 255]);
    takeKit(empty.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], 1, [ring(30), ring(0)]);
    expect(empty.clips).toEqual([]);
    const law = rig('rifle', [DEFAULT_RIFLE, HELD_SIDEARM], [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255]);
    takeKit(law.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 145, 185], null, [ring(30), ring(12)], [[], []]);
    expect(law.clips).toEqual(['swapRifleClaim']);
    const walk = rig('rifle');
    takeKit(walk.deps, [DEFAULT_RIFLE.id, HELD_SIDEARM.id, 121, 255, 255], null, [ring(30), ring(12)], [[0], []]);
    expect(walk.clips).toEqual([]);
  });
});

/**
 * Research 323 §8 F1 (was `PICKUP_FIRE_MODE_PLACEHOLDER`): the taken weapon's fire mode as the original sets it. The
 * pickup (`FUN_0059f0c0` D:L458271, D:L458282) installs the record through the slot setter `FUN_005bc410`, which zeroes
 * the slot's mode `+0x6fc` (D:L473830-473834); nothing else on the pickup's path writes it. A zero mode is then stepped:
 * - the slot in the hand, by the kit's frame `FUN_005c0fd0` (D:L476658-476668): `FUN_005c4600` again and again until
 *   the mode is `MaxFireMode` (+0x24) when that is 1-3, else once -- the weapon's highest mode (a carrier with no
 *   firearm mode on its first round);
 * - a slot not in the hand, at the swap to it (`FUN_005c4b10` D:L478930-478931): `FUN_005c4600` once from 0 -- the
 *   first mode the weapon enables.
 */
describe('research 323 F1: a picked-up weapon\'s fire mode (FUN_005bc410 zeroes it; FUN_005c0fd0 / FUN_005c4b10 step it)', () => {
  const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
  const byName = (name: string): WeaponRecord => Object.values(PIN.records).find((r) => r.name === name)!;
  const take = (hand: Firearm, slot: 0 | 1, name: string, itemUp = false): number => {
    const got = byName(name), was: [WeaponRecord, WeaponRecord] = [{ ...DEFAULT_RIFLE, id: 999 }, { ...HELD_SIDEARM, id: 998 }];
    const now: [WeaponRecord, WeaponRecord] = slot === 0 ? [got, was[1]] : [was[0], got];
    const r = rig(hand, was, [999, 998, 121, 255, 255]);
    r.deps.inHand = () => !itemUp;
    let taken = false;
    r.deps.loadouts.take = () => { taken = true; };
    r.deps.loadouts.records = () => (taken ? now : was);
    takeKit(r.deps, now.map((x) => x.id).concat([121, 255, 255]), slot, [ring(0), ring(0)]);
    return r.modes[slot === 0 ? 'rifle' : 'pistol'];
  };

  it('taken into the slot in the hand: the weapon\'s highest mode -- AK-47 and M4A1 automatic, M16A2 burst, M14 automatic, M40A1 single', () => {
    expect(['AK-47', 'M4A1', 'M16A2', 'M14', 'M60E3', 'M40A1', 'M16A2-M203', 'M4A1-M203'].map((n) => [n, take('rifle', 0, n)]))
      .toEqual([['AK-47', 3], ['M4A1', 3], ['M16A2', 2], ['M14', 3], ['M60E3', 3], ['M40A1', 1], ['M16A2-M203', 2], ['M4A1-M203', 3]]);
    expect(take('pistol', 1, 'Model 18')).toBe(3);
  });

  it('taken into the slot not in the hand: the first mode it enables, the swap\'s one step from 0 -- automatic where it has it (OT.R100)', () => {
    // The original's first mode is `pickupFireMode`'s (pinned over every record in weapons.parity.test.ts); the page lays
    // DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION over it, so a weapon with automatic comes up on it.
    expect(['AK-47', 'M16A2', 'M14', 'M60E3', 'M40A1'].map((n) => [n, take('pistol', 0, n)]))
      .toEqual([['AK-47', 3], ['M16A2', 1], ['M14', 3], ['M60E3', 3], ['M40A1', 1]]);
  });

  it('taken with an item or a launcher up (the selected slot `+0x824` an equipment slot): no firearm slot is the hand\'s, so the first mode at the swap', () => {
    // The last firearm (`kitItem`) is the rifle, but a grenade is up: an M16A2 exchanged into the rifle slot is stepped
    // once at the swap back to it (FUN_005c4b10 D:L478930-478931), single -- not the hand's cycle up to burst.
    expect(take('rifle', 0, 'M16A2', true)).toBe(1);
    expect(take('rifle', 0, 'M16A2', false)).toBe(2);
    expect(take('rifle', 0, 'M40A1', true)).toBe(1);
  });
});
