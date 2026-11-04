import { describe, expect, it } from 'vitest';
import { itemClass } from '@s2u/scene';
import {
  NET_CAP_CLASSES, NET_CAP_EMPTY_POOL_READING, NET_CAP_MAX, NET_CAP_READING, netCapCounts, netCapLive, netCapRefuses, type NetCapEntry,
} from '../src/net/netCap';

/**
 * NET-CAP (research 312 §10): the throwables' cap online, the one rule the room (`packages/match/src/room.ts`
 * `throwGrenade`, `placeCharge`) and the page import, as `../src/net/netRefill` is.
 *
 * - `netCapRefuses` is `FUN_005c0ae0`'s network test (D:L476470-476491): the record in the hand's slot (`kit+0x824`, not
 *   a round mode's redirect) of class 0x79 (grenade), 0x97 (explosive), 0xab (launcher round) or 0xb9 (rocket round)
 *   (`FUN_003d1e10` -> `FUN_003d1a60` D:L324336-324352), online (`DAT_0045a0c1`, D:L476479) and for a local actor
 *   (controller `+0x34`, `IsRemote`, D:L476481-476484), refused while `5 < FUN_003cb8f0(DAT_004b5220, actor+4)`
 *   (D:L476485-476486).
 * - `netCapLive` is `FUN_003cb8f0` (D:L320898-320952): the owner's entries of those four classes over the placed list
 *   (D:L320915-320929) and the pool's active entries (D:L320934-320947) -- but -1 when the pool holds no active entry
 *   (its high mark `+0x18` is -1, D:L320931-320933), the list's count dropped (`NET_CAP_EMPTY_POOL_READING`).
 */

const M67 = 121, AN_M8 = 122, C4 = 151, CLAYMORE = 153, PMN = 158, BACKBLAST = 159, M203_HE = 171, LAW_HEAT = 185, RPG_ROUND = 186;
const PISTOL_MARK_23 = 15, RIFLE_M4A1_M203 = 61, MGL = 142, LAW = 145, DETONATOR = 193;

const mine = (id: number, placed = false): NetCapEntry => ({ mine: true, id, placed });
const theirs = (id: number, placed = false): NetCapEntry => ({ mine: false, id, placed });

describe('NET-CAP: the four classes FUN_005c0ae0 and FUN_003cb8f0 test (research 312 §10.1)', () => {
  it('0x79, 0x97, 0xab, 0xb9 -- grenade, explosive, launcher round, rocket round -- and no other', () => {
    expect([...NET_CAP_CLASSES].sort()).toEqual(['explosive', 'grenade', 'launcherRound', 'rocketRound']);
    for (let id = 0; id <= 255; id++) {
      const c = itemClass(id);
      expect([id, netCapCounts(id)]).toEqual([id, c === 'grenade' || c === 'explosive' || c === 'launcherRound' || c === 'rocketRound']);
    }
  });

  it('the ids by FUN_003d1a60\'s ranges: 121-140, 151-170 (the Backblast 159 among them), 171-184, 185-189', () => {
    for (const id of [M67, AN_M8, 140, C4, CLAYMORE, PMN, BACKBLAST, 170, M203_HE, 184, LAW_HEAT, RPG_ROUND, 189]) expect([id, netCapCounts(id)]).toEqual([id, true]);
    for (const id of [120, PISTOL_MARK_23, RIFLE_M4A1_M203, MGL, LAW, 150, 190, DETONATOR]) expect([id, netCapCounts(id)]).toEqual([id, false]);
  });
});

describe('NET-CAP: netCapLive, FUN_003cb8f0\'s count (research 312 §10.2)', () => {
  it('the owner\'s entries of the four classes, placed and in flight alike; another owner\'s never', () => {
    expect(netCapLive([mine(M67), mine(CLAYMORE, true), mine(C4, true), theirs(M67), theirs(CLAYMORE, true)])).toBe(3);
    expect(netCapLive([mine(LAW_HEAT), mine(BACKBLAST), mine(M203_HE)])).toBe(3);
  });

  it('an entry of another class is not counted, but holds the pool (a firearm\'s round in the pool, D:L479349)', () => {
    expect(netCapLive([mine(RIFLE_M4A1_M203), mine(CLAYMORE, true)])).toBe(1);
  });

  it('-1 when no entry is in flight: the pool\'s high mark -1 drops the placed list\'s count (D:L320931-320933)', () => {
    expect(NET_CAP_EMPTY_POOL_READING).toMatch(/-1/);
    expect(netCapLive([])).toBe(-1);
    expect(netCapLive(Array.from({ length: 8 }, () => mine(C4, true)))).toBe(-1);
    // Another player's grenade in the air holds the pool: the eight count.
    expect(netCapLive([...Array.from({ length: 8 }, () => mine(C4, true)), theirs(M67)])).toBe(8);
  });
});

describe('NET-CAP: netCapRefuses, FUN_005c0ae0\'s refusal (research 312 §10.1)', () => {
  it('more than five: six refuse, five do not (`5 < count`, D:L476486)', () => {
    expect(NET_CAP_MAX).toBe(5);
    expect(NET_CAP_READING).toMatch(/more than five/);
    for (const hand of [M67, AN_M8, C4, CLAYMORE, PMN]) {
      expect([hand, netCapRefuses(hand, 6)]).toEqual([hand, true]);
      expect([hand, netCapRefuses(hand, 5)]).toEqual([hand, false]);
      expect([hand, netCapRefuses(hand, -1)]).toEqual([hand, false]);
    }
  });

  it('a round in the hand\'s own slot is tested by its class (0xab, 0xb9: D:L476472-476477)', () => {
    expect([netCapRefuses(M203_HE, 6), netCapRefuses(LAW_HEAT, 6)]).toEqual([true, true]);
  });

  it('never a carrier, a launcher, a firearm or the Detonator in the hand -- a launch is its carrier\'s (FUN_005c8a20)', () => {
    for (const hand of [RIFLE_M4A1_M203, MGL, LAW, PISTOL_MARK_23, DETONATOR]) expect([hand, netCapRefuses(hand, 40)]).toEqual([hand, false]);
  });
});
