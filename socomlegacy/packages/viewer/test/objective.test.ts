import { describe, expect, it } from 'vitest';
import type { MapAction } from '../src/mapActions';
import {
  BOMB_RESULT_DELAY_READING, BOMB_STATE, bombOutcome, canDrop, defuseReach, DROP_AIM_READING, FUSE_S, HOLD_S, HOLD_TICKS, PICKUP_COOLDOWN_S,
  PLACEMENT_S, pickupReach, plantSite, resultHoldS, atPlantSite, holdKind, plantAimAt, plantReachFrom, PLANT_PICK_FIREPOINT_READING,
} from '../src/net/objective';
import { TICK_HZ } from '../src/net/protocol';

/**
 * XR-05 (research 214 s1-s2; 171 s6-s7, 173 s2-s3): the bomb's shared rules -- the room's authority (`match/src/bomb.ts`)
 * and the page's follower (`../src/bombPage.ts`) read the same reaches, holds and outcomes from `net/objective.ts`.
 */

/** An MPBOMB record as Crossroads' `actions.rdr` gives it (range 15, elevation 15; research 173 s2). */
function tent(node: string, at: [number, number, number]): MapAction {
  return {
    node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0,
    bitmap: 'action_mp_bomb.tif', path: `worldmodel/${node}`, at,
  };
}
const TERRORIST_TENT = tent('terrorist_tent', [526.023, 13.812, 1523.773]);
const SEAL_TENT = tent('seal_tent', [2018.595, 63.187, 1422.437]);

describe('the bomb\'s shared rules (XR-05; research 214)', () => {
  it('pickup reach is a squared 3D distance under 400 (20 u, FUN_005aa110 D:L463817-463821); defuse reach horizontal under 15 and vertical under 20 (DAT_00650688/690)', () => {
    const bomb: [number, number, number] = [100, 10, 100];
    expect(pickupReach(bomb, [119.99, 10, 100])).toBe(true);
    expect(pickupReach(bomb, [120, 10, 100])).toBe(false);                 // 20 u exactly: 400 is not under 400
    expect(pickupReach(bomb, [112, 10, 116])).toBe(false);                 // 12² + 16² = 400
    expect(pickupReach(bomb, [112, 10, 115.9])).toBe(true);
    // OBF-17 (Trello NH8lPT6Z): the height counts -- a player on a roof over the bomb does not take it.
    expect(pickupReach(bomb, [100, 500, 100])).toBe(false);
    expect(pickupReach(bomb, [100, 63.548, 100])).toBe(false);             // Night Stalker's hut: the roof 53.6 over the floor
    expect(pickupReach(bomb, [100, 29.99, 100])).toBe(true);
    expect(pickupReach(bomb, [100, 30, 100])).toBe(false);
    expect(pickupReach(bomb, [112, 26, 100])).toBe(false);                 // 12² + 16² = 400, the 16 upward
    expect(pickupReach(bomb, [112, -5.9, 100])).toBe(true);                // 12² + 15.9², the 15.9 downward
    expect(defuseReach(bomb, [114.99, 10, 100])).toBe(true);
    expect(defuseReach(bomb, [115, 10, 100])).toBe(false);
    expect(defuseReach(bomb, [100, 29.99, 100])).toBe(true);
    expect(defuseReach(bomb, [100, 30, 100])).toBe(false);
    expect(defuseReach(bomb, [100, -9.99, 100])).toBe(true);
    expect(defuseReach(bomb, [100, -10, 100])).toBe(false);
  });

  it('the plant site is the opposing tent: SEALs at terrorist_tent, Terrorists at seal_tent (FUN_00594480 D:L452755-452759)', () => {
    const switchRecord: MapAction = { ...tent('seal_callstrike_1', [0, 0, 0]), type: 'SWITCH', typeCode: 2 };
    const actions = [switchRecord, SEAL_TENT, TERRORIST_TENT];
    expect(plantSite('seal', actions)).toBe(TERRORIST_TENT);
    expect(plantSite('terrorist', actions)).toBe(SEAL_TENT);
    expect(plantSite('seal', [SEAL_TENT])).toBeNull();                     // the own tent is never a site
    expect(plantSite('seal', [{ ...TERRORIST_TENT, typeCode: 8 }])).toBeNull();   // the node's name alone is not an MPBOMB
    // A forge site (path `forge/site_<i>`) names who plants. A disc tent keeps the name rule even when `team` is set:
    // `mapActions.ts` reads `team` off the disc (research 174), so that field is not the plant rule.
    const forged = { ...tent('forge_site_0', [8, 0, 0]), team: 0, path: 'forge/site_0' };
    expect(plantSite('seal', [forged, SEAL_TENT])).toBe(forged);
    expect(plantSite('terrorist', [forged])).toBeNull();
    const discNamedSeal = { ...tent('terrorist_tent', [0, 0, 0]), team: 1 };
    expect(plantSite('seal', [discNamedSeal])).toBe(discNamedSeal);
    expect(plantSite('terrorist', [discNamedSeal])).toBeNull();
    const discNamedTerrorist = { ...tent('seal_tent', [1, 0, 0]), team: 0 };
    expect(plantSite('terrorist', [discNamedTerrorist])).toBe(discNamedTerrorist);
    expect(plantSite('seal', [discNamedTerrorist])).toBeNull();
    const forgedOnATentName = { ...tent('terrorist_tent', [2, 0, 0]), team: 1, path: 'forge/site_1' };
    expect(plantSite('terrorist', [forgedOnATentName])).toBe(forgedOnATentName);
    expect(plantSite('seal', [forgedOnATentName])).toBeNull();
    // `atPlantSite`: the feet within the record's range 15 and elevation 15 of its node's origin, both strict -- since
    // PLANT-AIM the forge site's reach and the sweeps' ring about the node, no longer a disc tent's plant gate.
    const [x, y, z] = TERRORIST_TENT.at;
    expect(atPlantSite(TERRORIST_TENT, [x + 14.99, y, z])).toBe(true);
    expect(atPlantSite(TERRORIST_TENT, [x + 15, y, z])).toBe(false);
    expect(atPlantSite(TERRORIST_TENT, [x, y + 14.99, z])).toBe(true);
    expect(atPlantSite(TERRORIST_TENT, [x, y - 15, z])).toBe(false);
  });

  it('PLANT-AIM: a disc tent is planted on the reticle\'s pick -- the struck node the tent\'s (or under it), the feet within range 15 / elevation 15 of the struck point (FUN_005aa240 D:L463895-463898) -- never by the feet near its origin', () => {
    const actions = [SEAL_TENT, TERRORIST_TENT];
    const carried = { state: BOMB_STATE.carried, carrier: 7, placing: false, plantingTeam: null, pos: [0, 0, 0] };
    const seal = (feet: readonly number[], pick: { path: string; point: readonly number[] } | null) => holdKind(carried, { id: 7, team: 'seal', feet, pick }, TERRORIST_TENT, actions);
    // MP72's terrorist_tent patch is the floor quad x 487.3-564.7, z 1492.0-1559.0 at y 14.31 (research 284 §1): its
    // corner is 49 u from the node's origin, the feet 3 u past it, the pick 4 u inside it.
    const corner = [484.3, 14.31, 1489.0], inside = [491.3, 14.31, 1496.0];
    expect(atPlantSite(TERRORIST_TENT, corner)).toBe(false);                          // the r0001 stand-in refused it
    expect(seal(corner, { path: 'worldmodel/terrorist_tent', point: inside })).toBe('plant');
    expect(plantAimAt(TERRORIST_TENT, corner, { path: 'worldmodel/terrorist_tent', point: inside }, actions)).toBe(true);
    // The pick decides, not the feet: at the node's own origin with no pick, or with the reticle on another node, none.
    expect(seal(TERRORIST_TENT.at, null)).toBeNull();
    expect(seal(TERRORIST_TENT.at, { path: 'worldmodel/warehouse=warehouse/di_intwalls_wh', point: TERRORIST_TENT.at })).toBeNull();
    // A node under the tent's names it (`FUN_005aa470`'s parent walk); the other side's tent is not this side's site.
    expect(seal(corner, { path: 'worldmodel/terrorist_tent/child', point: inside })).toBe('plant');
    expect(seal(SEAL_TENT.at, { path: 'worldmodel/seal_tent', point: SEAL_TENT.at })).toBeNull();
    // The reach from the struck point, both strict: range on the ground plane, elevation on y.
    const pt = [500, 14.31, 1500];
    expect(seal([pt[0]! + 14.99, 14.31, pt[2]!], { path: 'worldmodel/terrorist_tent', point: pt })).toBe('plant');
    expect(seal([pt[0]! + 15, 14.31, pt[2]!], { path: 'worldmodel/terrorist_tent', point: pt })).toBeNull();
    expect(seal([pt[0]!, 14.31 + 14.99, pt[2]!], { path: 'worldmodel/terrorist_tent', point: pt })).toBe('plant');
    expect(seal([pt[0]!, 14.31 - 15, pt[2]!], { path: 'worldmodel/terrorist_tent', point: pt })).toBeNull();
    // The review's F6: the reach measured from the standing firepoint (`plantReachFrom`, `PLANT_PICK_FIREPOINT_READING`;
    // `FUN_005aa240` D:L463874-463881), strict at 15 on the ground plane -- not from the feet.
    expect(PLANT_PICK_FIREPOINT_READING.stand).toEqual([-2.750, 12.728, -8.599]);
    const feet0 = [500, 14.31, 1500], fp = plantReachFrom(feet0, 0, 'stand');
    expect(fp[0]).toBeCloseTo(497.25, 9); expect(fp[1]).toBeCloseTo(27.038, 9); expect(fp[2]).toBeCloseTo(1491.401, 9);   // yaw 0 faces -z
    const at = (dx: number) => ({ path: 'worldmodel/terrorist_tent', point: [fp[0] + dx, 14.31, fp[2]] });
    expect(holdKind(carried, { id: 7, team: 'seal', feet: feet0, pick: at(-14.99), from: fp }, TERRORIST_TENT, actions)).toBe('plant');
    expect(holdKind(carried, { id: 7, team: 'seal', feet: feet0, pick: at(-15), from: fp }, TERRORIST_TENT, actions)).toBeNull();
    // From the feet the same point is 19.7 off: the firepoint, not the feet, is what reaches it.
    expect(Math.hypot(at(-14.99).point[0]! - feet0[0]!, at(-14.99).point[2]! - feet0[2]!)).toBeGreaterThan(15);
    // A forge site has no polygon to aim at: its reach stays the feet near its origin (an adaptation, unchanged).
    const forged = { ...tent('forge_site_0', [8, 0, 0]), team: 0, path: 'forge/site_0' };
    expect(holdKind(carried, { id: 7, team: 'seal', feet: [10, 0, 0], pick: null }, forged, [forged])).toBe('plant');
    expect(holdKind(carried, { id: 7, team: 'seal', feet: [30, 0, 0], pick: null }, forged, [forged])).toBeNull();
    // Never while a placement runs, nor for anyone but the carrier.
    expect(holdKind({ ...carried, placing: true }, { id: 7, team: 'seal', feet: corner, pick: { path: 'worldmodel/terrorist_tent', point: inside } }, TERRORIST_TENT, actions)).toBeNull();
    expect(holdKind(carried, { id: 8, team: 'seal', feet: corner, pick: { path: 'worldmodel/terrorist_tent', point: inside } }, TERRORIST_TENT, actions)).toBeNull();
  });

  it('a manual drop needs the bomb, a clear 4 s cooldown, no stick and the aim below -0.25 (FUN_005937c0 D:L452458-452473)', () => {
    expect(DROP_AIM_READING).toBe(-0.25);
    expect(PICKUP_COOLDOWN_S).toBe(4);
    const down = (Math.asin(-0.25) * 180) / Math.PI - 0.01;               // just under -14.48 degrees
    const ok = { carrying: true, tick: 1000, pickupAfterTick: 1000, forward: 0, right: 0, pitch: down };
    expect(canDrop(ok)).toBe(true);
    expect(canDrop({ ...ok, carrying: false })).toBe(false);
    expect(canDrop({ ...ok, pickupAfterTick: 1001 })).toBe(false);         // the cooldown still running
    expect(canDrop({ ...ok, forward: 0.1 })).toBe(false);
    expect(canDrop({ ...ok, right: -1 })).toBe(false);
    expect(canDrop({ ...ok, pitch: down + 0.02 })).toBe(false);            // -14.47 degrees: sin above -0.25
    expect(canDrop({ ...ok, pitch: 0 })).toBe(false);
  });

  it('state 4 is the defuser\'s team\'s round, state 5 the planting team\'s; the result hold is 3 + 20 + 1 s after a defuse and 2 + 2 + 20 + 1 after a detonation (171 s7)', () => {
    expect(BOMB_STATE).toEqual({ reset: 0, ground: 1, carried: 2, planted: 3, defused: 4, detonated: 5 });
    expect(bombOutcome(4, 'seal', 'terrorist')).toBe('terrorist');
    expect(bombOutcome(4, 'terrorist', 'seal')).toBe('seal');
    expect(bombOutcome(5, 'seal', null)).toBe('seal');
    expect(bombOutcome(5, 'terrorist', null)).toBe('terrorist');
    for (const s of [0, 1, 2, 3] as const) expect(bombOutcome(s, 'seal', 'terrorist')).toBeNull();
    expect(resultHoldS('defused')).toBe(3 + 20 + 1);
    expect(resultHoldS('detonated')).toBe(2 + 2 + 20 + 1);
    expect(BOMB_RESULT_DELAY_READING).toEqual({ defused: 24, detonated: 25 });
    // The timings the room counts in its ticks.
    expect([HOLD_S, PLACEMENT_S, FUSE_S]).toEqual([5, 2.25, 30]);
    expect(HOLD_TICKS).toBe(5 * TICK_HZ);
  });
});
