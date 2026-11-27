import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';
import { MatchBots, type PerceptionDrop } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';

/**
 * LATER 1122 step (1) (a diagnostic, product track; no original): `MatchBotOptions.perceptionTrace` tells a soak of every
 * enemy a bot's `perceive` does not sight, and why. Absent -- every room -- nothing changes: the same seeded room with
 * and without the hook runs tick for tick the same (every body's position, yaw and life -- a changed target shows in
 * them). The fresh review's scratch run also held base against head, hook absent, over four rooms: identical.
 */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
function flat(): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, 400, 400, 0, 400, 400, 0, -400, -400, 0, -400]) };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }];
  const ground = packGround(PARAMS, [floor], owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'ADOPT TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no transport */ }
}

function soak(trace?: (d: PerceptionDrop) => void) {
  let now = 0, seed = 7;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const room = new Room(flat(), null, { rules: 'respawn', heldLaunch: true, now: () => now, random }, null, null);
  expect(room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Host', map: 'MP99' }, '', { host: true, side: 'seal' })).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
  const bots = new MatchBots(room, { random, navigation, kits: null, ...(trace ? { perceptionTrace: trace } : {}) });
  bots.setRoster({ seal: 2, terrorist: 2 });
  room.launch(0);
  const frames: string[] = [];
  for (let i = 0; i < 600; i++) {
    now += 1000 / TICK_HZ; bots.step(); room.step();
    frames.push(JSON.stringify(room.lobby.players().map((m) => {
      const p = room.player(m.id), s = p?.sim.walker.state;
      return s ? [m.id, +s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4), +s.yaw.toFixed(3), p!.alive] : [m.id];
    })));
  }
  return { frames, bots: bots.botIds(), room };
}

describe('LATER 1122 step (1): the perception trace', () => {
  it('absent, nothing changes: the same seeded room runs tick for tick the same with and without the hook', () => {
    const drops: PerceptionDrop[] = [];
    const plain = soak(), traced = soak((d) => drops.push(d));
    expect(traced.frames).toEqual(plain.frames);
    // ... and the hook was told: every drop a bot's, of a known reason, with its numbers.
    expect(drops.length).toBeGreaterThan(0);
    const reasons = new Set(['flashed', 'range', 'cone', 'vertical', 'wall', 'smoke', 'danger']);
    for (const d of drops) {
      expect(reasons.has(d.reason), d.reason).toBe(true);
      expect(traced.bots).toContain(d.bot);
      for (const v of [d.distance, d.bearing, d.elevation, d.pitch]) expect(Number.isFinite(v)).toBe(true);
    }
    console.log(`LATER 1122 trace: ${drops.length} drops, ${[...new Set(drops.map((d) => d.reason))].join(', ')}`);
  });
});
