import { describe, expect, it } from 'vitest';
import { JOIN_STATE_VERSION, TICK_HZ } from '../../viewer/src/net/protocol';
import { joinWire, type JoinView } from '../src/joinState';

/**
 * PF-28 (ruling PF.R47; web research 231 s1-s4): the join envelope built from the room's state alone -- the flying list
 * (each with its stable `pid`), the round's standing result with the tick it was sent at, and the seats' corpses and
 * ghosts. Pure: no room, no socket. The room's half (`Room.joinWire`) and the welcome are `roomJoin.test.ts`'s.
 */

const fresh: JoinView = { tick: 0, flying: [], result: null, seats: [] };

describe('PF-28: the join envelope from the room\'s state (research 231 s1)', () => {
  it('joinWire builds the envelope from the flying list, the last result and the dead players; empty lists on a fresh room; v is 1', () => {
    expect(JOIN_STATE_VERSION).toBe(1);
    expect(joinWire(fresh)).toEqual({ v: 1, projectiles: [], corpses: [], ghosts: [] });

    const screens = [{ screen: 'roundComplete' as const, seconds: 5 }];
    const view: JoinView = {
      tick: 1000,
      flying: [
        { pid: 0, owner: 3, kind: 'M67', g: { pos: [1, 2, 3], vel: [4, 5, 6], state: 'flight', age: 0.5, fuse: 2.5, removal: 2.6, bounces: 1, dud: false } },
        { pid: 1, owner: 4, kind: 'Claymore', g: { pos: [7, 0, 9], vel: [0, 0, 0], state: 'rest', age: 2, fuse: 9999997, removal: 8, bounces: 0, dud: false }, facing: [1, 0, 0] },
        { pid: 2, owner: 3, kind: 'AN-M8', g: { pos: [0, 0, 0], vel: [0, 0, 0], state: 'detonated', age: 10, fuse: -7, removal: 30, bounces: 2, dud: false } },
        { pid: 3, owner: 3, kind: 'M67', g: { pos: [0, 0, 0], vel: [0, 0, 0], state: 'removed', age: 3.2, fuse: -0.2, removal: -0.1, bounces: 3, dud: true } },
      ],
      result: { round: 2, winner: 'seal', wins: { seal: 2, terrorist: 0 }, matchOver: false, screens, at: 940 },
      seats: [
        { id: 1, alive: true, diedAt: -1, deathClip: null, deathCause: null },
        { id: 2, alive: false, diedAt: 700, deathClip: 'death_stand_chest01', deathCause: 4 },
        { id: 5, alive: false, diedAt: -1, deathClip: null, deathCause: null },
      ],
    };
    const w = joinWire(view);
    expect(w.v).toBe(JOIN_STATE_VERSION);
    // The ages and the timers on the room's clock, in ticks (JOIN_CLOCK_UNIT); a removed one is not sent.
    expect(w.projectiles).toEqual([
      { pid: 0, owner: 3, kind: 'M67', pos: [1, 2, 3], vel: [4, 5, 6], state: 'flight', age: 0.5 * TICK_HZ, fuse: 2.5 * TICK_HZ, removal: 2.6 * TICK_HZ, bounces: 1, dud: false },
      { pid: 1, owner: 4, kind: 'Claymore', pos: [7, 0, 9], vel: [0, 0, 0], state: 'rest', age: 2 * TICK_HZ, fuse: 9999997 * TICK_HZ, removal: 8 * TICK_HZ, bounces: 0, dud: false, facing: [1, 0, 0] },
      { pid: 2, owner: 3, kind: 'AN-M8', pos: [0, 0, 0], vel: [0, 0, 0], state: 'detonated', age: 10 * TICK_HZ, fuse: -7 * TICK_HZ, removal: 30 * TICK_HZ, bounces: 2, dud: false },
    ]);
    expect(w.result).toEqual({ round: 2, winner: 'seal', wins: { seal: 2, terrorist: 0 }, matchOver: false, screens, at: 940 });
    expect(w.corpses).toEqual([{ id: 2, clip: 'death_stand_chest01', cause: 4, age: 300 }]);
    expect(w.ghosts).toEqual([5]);
    // The wire is a copy: the room's vectors are not handed out.
    expect(w.projectiles[0]!.pos).not.toBe(view.flying[0]!.g.pos);
  });
});
