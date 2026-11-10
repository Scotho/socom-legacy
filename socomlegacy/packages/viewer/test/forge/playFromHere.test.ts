import { describe, expect, it } from 'vitest';
import { Room, type Conn } from '../../../match/src/room';
import type { ServerEvent } from '../../src/net/protocol';
import { PROTOCOL_VERSION, TICK_HZ } from '../../src/net/protocol';
import { groundGrid } from '../../src/mover';
import type { SimMap } from '../../src/simMap';
import { floorGround } from '../../src/forge/ground';
import { slotsOfSpawns } from '../../src/forge/matchMap';
import { floorUnder, openingStand, randomStand, standFromHere, walkFeet, withPlayerHere, type ViewStand } from '../../src/forge/playFromHere';

/**
 * FG-50 (a browser adaptation, no original): Play from here stands the local player on the floor under the camera,
 * or under the cursor, facing the camera. No floor at either point keeps the layout's spawns.
 */
const floor = floorGround(200);
const grid = groundGrid(floor);
const view = (over: Partial<ViewStand> = {}): ViewStand => ({
  camera: [0, 40, 0], yaw: 0, cursor: null, ...over,
});

describe('FG-50: the floor under the view', () => {
  it('stands on the floor under the camera, ahead of the cursor', () => {
    const at = standFromHere(grid, floor, view({ cursor: [10, 10] }));
    expect(at).toEqual({ at: [0, 0, 0], yaw: 0 });
  });

  it('stands under the cursor when the camera has no floor there', () => {
    const at = standFromHere(grid, floor, view({ camera: [500, 40, 500], cursor: [20, -30], yaw: -Math.PI / 2 }));
    expect(at!.at).toEqual([20, 0, -30]);
    expect(at!.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('is null when neither the camera nor the cursor has a floor, even though the hull has ground', () => {
    // standingSpot would offer the hull's centre; that is not under the view, so the layout's spawns stay.
    expect(floorUnder(grid, floor, [[500, 500]], 40)).toBeNull();
    expect(standFromHere(grid, floor, view({ camera: [500, 40, 500], cursor: [800, 800] }))).toBeNull();
    expect(standFromHere(grid, floor, view({ camera: [0, -10, 0] }))).toBeNull();   // the floor is above the camera
  });
});

/**
 * LATER 803 (a browser adaptation, product track): FP.R15 opens a disc map at a still camera that often has no floor
 * under it, and a bare map has no layout spawn, so Walk falls back to the map's own computed stand (`../matchCore`
 * `standOf`: spawn A's feet, looked at from its eye) -- after the floor under the view and the layout's marker.
 */
describe('LATER 803: Walk stands on the map\'s own spawn when nothing else holds', () => {
  const nowhere = view({ camera: [500, 40, 500], cursor: null });
  const mapStand = { feet: [30, 0, -20] as [number, number, number], from: [30, 64, -20] as [number, number, number] };
  it('no floor under the view, no marker: the map stand\'s feet', () => {
    expect(walkFeet(grid, floor, nowhere, null, mapStand)).toEqual([30, 0, -20]);
  });
  it('a floor under the view wins over the map stand', () => {
    expect(walkFeet(grid, floor, view({ camera: [5, 40, 6] }), null, mapStand)).toEqual([5, 0, 6]);
  });
  it('a layout marker wins over the map stand', () => {
    expect(walkFeet(grid, floor, nowhere, [7, 0, 8], mapStand)).toEqual([7, 0, 8]);
  });
  it('a map stand with no floor under it is nowhere (the refusal)', () => {
    expect(walkFeet(grid, floor, nowhere, null, { feet: [800, 0, 800], from: [800, 64, 800] })).toBeNull();
    expect(walkFeet(grid, floor, nowhere, null, { feet: [10, -50, 10], from: [10, -10, 10] })).toBeNull();   // the floor is above its eye
    expect(walkFeet(grid, floor, nowhere, null, { feet: null, from: [0, 400, 600] })).toBeNull();          // no measured spawn
  });
  it('a base that is not a disc map (no map stand) keeps today\'s refusal', () => {
    expect(walkFeet(grid, floor, nowhere, null, null)).toBeNull();
  });
});

describe('FG-50: the local player\'s start slot', () => {
  const slots = slotsOfSpawns([
    { team: 'A', p: [1, 2, 3], yaw: 0 },
    { team: 'A', p: [4, 5, 6], yaw: 0 },
    { team: 'B', p: [7, 8, 9], yaw: Math.PI },
  ]);

  it('replaces the player\'s index 0 and keeps every other slot, facing the camera\'s yaw', () => {
    const next = withPlayerHere(slots, 0, [10, 0, 20], -Math.PI / 2);
    expect(slots.map((s) => s.position[0])).toEqual([1, 4, 7]);           // the layout's list is not changed
    expect(next.map((s) => [s.side, s.index, s.position])).toEqual([
      [0, 0, [10, 0, 20]],
      [0, 1, [4, 5, 6]],
      [1, 0, [7, 8, 9]],
    ]);
    expect(next[0]!.step).toBe(2);                                        // -90 degrees, eighth turns
    expect(next[0]!.facing[0]).toBeCloseTo(1);
    expect(next[0]!.facing[1]).toBeCloseTo(0);
  });

  it('adds the player\'s slot when the side has none', () => {
    const next = withPlayerHere(slots.filter((s) => s.side === 1), 0, [3, 1, 4], 0);
    expect(next.map((s) => [s.side, s.index, s.position])).toEqual([[0, 0, [3, 1, 4]], [1, 0, [7, 8, 9]]]);
    expect(next[0]!.facing).toEqual([0, -1]);
  });

  it('puts the layout\'s index 0 back into the same array after round 1', () => {
    const opening = openingStand(slots, 0, [10, 0, 20], 0);
    expect(opening.slots[0]!.position).toEqual([10, 0, 20]);
    expect(slots[0]!.position).toEqual([1, 2, 3]);
    opening.restore();
    expect(opening.slots[0]).toBe(slots[0]);
    opening.restore();
    expect(opening.slots[0]).toBe(slots[0]);
  });
});

/**
 * Classic starts every round from `map.slots` (the forge's room is classic). Round 1 stands on the camera spot; `restore`
 * runs from the room's `onRoundStart` after that spawn, and round 2 stands on the layout's marker.
 */
describe('FG-50: round 2 uses the layout slot', () => {
  it('stands round 1 on the camera spot and round 2 on the layout marker', () => {
    const ground = floorGround(400);
    const layout = slotsOfSpawns([
      { team: 'A', p: [80, 0, 40], yaw: 0 },
      { team: 'B', p: [-80, 0, -40], yaw: Math.PI },
    ]);
    const opening = openingStand(layout, 0, [12, 0, -8], 0);
    const map: SimMap = {
      stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null,
      slots: opening.slots, respawns: layout, notes: [],
    };
    let now = 0;
    const room = new Room(map, null, {
      now: () => now, random: () => 0, rules: 'classic', solo: true, roundSeconds: 16, maxRounds: 5, launchCountdownS: 0,
      onRoundStart: (round) => { if (round === 1) opening.restore(); },
    });
    const events: ServerEvent[] = [];
    const conn: Conn = {
      send: (frame) => { if (typeof frame === 'string') events.push(JSON.parse(frame) as ServerEvent); },
      close: () => {},
    };
    room.hello(1, conn, { type: 'hello', version: PROTOCOL_VERSION, name: 'P1', map: 'MP99' }, 'seat-1');
    const step = (seconds: number): void => {
      for (let i = 0; i < seconds * TICK_HZ; i++) { now += 1000 / TICK_HZ; room.step(); }
    };
    step(1);
    const feet = (): number[] => {
      const s = room.player(1)!.sim.walker.state;
      return [s.x, s.z];
    };
    expect(room.stats().round).toBe(1);
    expect(feet()[0]).toBeCloseTo(12, 0);
    expect(feet()[1]).toBeCloseTo(-8, 0);
    expect(opening.slots[0]!.position[0]).toBe(80);             // restored once round 1 had spawned
    step(30);
    expect(room.stats().round).toBe(2);
    expect(feet()[0]).toBeCloseTo(80, 0);
    expect(feet()[1]).toBeCloseTo(40, 0);
    expect(events.some((e) => e.type === 'roundStart' && e.round === 2)).toBe(true);
  });
});

describe('Play settings: a random spawn of the side (a browser adaptation, FG.R2)', () => {
  const slots = slotsOfSpawns([
    { team: 'A', p: [10, 0, 0], yaw: 0 }, { team: 'A', p: [20, 0, 0], yaw: -Math.PI / 2 }, { team: 'B', p: [99, 0, 0], yaw: 0 },
  ]);
  it('stands on one of the side\'s own slots, facing as it faces, chosen by the draw', () => {
    expect(randomStand(slots, 0, () => 0)).toEqual({ at: [10, 0, 0], yaw: 0 });
    const second = randomStand(slots, 0, () => 0.99)!;
    expect(second.at).toEqual([20, 0, 0]);
    expect(second.yaw).toBeCloseTo(-Math.PI / 2);
    expect(randomStand(slots, 1, () => 0.5)!.at).toEqual([99, 0, 0]);
  });
  it('a side with no slot: none', () => {
    expect(randomStand(slots.filter((s) => s.side === 0), 1, () => 0)).toBeNull();
  });
});
