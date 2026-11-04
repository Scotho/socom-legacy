import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import {
  ENGINE_READ_S, EXPIRED_PLAY_S, FINAL_ROUND_S, GAME_COMPLETE_S, RESULT_S, ROUND1_AFTER_BARRIER_S_READING,
  Room, type Conn, type RoomOptions,
} from '../src/room';

/** Synthetic floor and slots: test geometry, not a disc map or a spawn-selection assertion. */
function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1): SpawnSlot => ({
    side, index: 0, position: [side === 0 ? -400 : 400, 0, 0], onFloor: true, step: side === 0 ? 2 : 6,
    facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0), slot(1)], respawns: [], notes: [], gameType: 5 };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no socket */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

function respawnRoom(opts: Partial<RoomOptions> = {}) {
  let now = 0, holds = 0;
  const rounds: number[] = [];
  const returns: { launched: boolean; timeLeft: number | null }[] = [];
  const room: Room = new Room(flatMap(), null, {
    now: () => now, random: () => 0.5, rules: 'respawn', heldLaunch: true, ...opts,
    onRoundStart: (round) => rounds.push(round), onLoadHold: () => { holds++; },
    onMatchReturn: () => returns.push({ launched: room.launched, timeLeft: room.timeLeft() }),
  });
  const join = (id: number, watch = false): Client => {
    const client = new Client();
    expect(room.hello(id, client, {
      type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', ...(watch ? { watch: true } : {}),
    }, `192.0.2.${id}`, { host: id === 1 })).toBe(true);
    return client;
  };
  const steps = (ticks: number): void => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; room.step(); } };
  return { room, join, steps, rounds, returns, holds: () => holds };
}

describe('RSP-4: a held respawn game uses its game lobby lifecycle (research 350)', () => {
  it('both teams can wait beyond 15 seconds without starting a clock, countdown, round or match', () => {
    const g = respawnRoom();
    const a = g.join(1);
    expect(a.of('welcome')[0]).toMatchObject({ rules: 'respawn', phase: 'waiting', rounds: 1, waiting: true });
    expect(a.of('welcome')[0]).not.toHaveProperty('startTick');
    g.steps(2 * TICK_HZ);
    const b = g.join(2);
    g.steps(16 * TICK_HZ);
    expect(g.room.launched).toBe(false);
    expect(g.room.timeLeft()).toBeNull();
    expect(g.room.currentMatch().serial).toBe(0);
    expect(g.rounds).toEqual([]);
    for (const c of [a, b]) {
      expect(c.of('welcome')[0]).toMatchObject({ phase: 'waiting', epoch: 0 });
      expect(c.of('welcome')[0]).not.toHaveProperty('startTick');
      expect(c.of('countdown')).toEqual([]);
      expect(c.of('roundStart')).toEqual([]);
      expect(c.of('timeExpired')).toEqual([]);
    }
  });

  it('refuses a one-sided launch, then launch(0) starts exactly one 1200-second, one-round match', () => {
    const g = respawnRoom();
    const a = g.join(1);
    expect(g.room.launch(0)).toBe(false);
    g.steps(2 * TICK_HZ);
    const b = g.join(2);
    expect(g.room.launch(0)).toBe(true);
    expect(g.room.launch(0)).toBe(false);
    expect(g.room.launched).toBe(true);
    expect(g.room.timeLeft()).toBe(1200);
    expect(g.room.currentMatch().serial).toBe(1);
    expect(g.rounds).toEqual([1]);
    for (const c of [a, b]) expect(c.of('roundStart')).toEqual([expect.objectContaining({
      round: 1, seconds: 1200, rounds: 1, startTick: 2 * TICK_HZ,
    })]);
  });

  it('runs the requested countdown and existing load barrier, starting once after both loaded reports', () => {
    // The 30-second ceiling is the existing server/test adaptation, not an original load-state timer.
    const g = respawnRoom({ loadBarrierS: 30 });
    const a = g.join(1), b = g.join(2);
    expect(g.room.launch(11)).toBe(true);
    expect(g.room.launch(11)).toBe(false);
    for (const c of [a, b]) expect(c.of('countdown')).toEqual([{ type: 'countdown', seconds: 11 }]);
    g.steps(11 * TICK_HZ - 1);
    expect(g.holds()).toBe(0);
    g.steps(1);
    expect(g.holds()).toBe(1);
    expect(g.room.launched).toBe(true);
    expect(g.room.timeLeft()).toBeNull();
    expect(g.room.currentMatch().serial).toBe(0);
    g.room.text(1, { type: 'loaded' });
    g.steps(2 * TICK_HZ);
    expect(g.rounds).toEqual([]);
    g.room.text(2, { type: 'loaded' });
    g.room.text(2, { type: 'loaded' });                         // a duplicate cannot release a second round
    expect(g.room.launch(0)).toBe(false);
    g.steps(Math.round(ROUND1_AFTER_BARRIER_S_READING * TICK_HZ) - 1);
    expect(g.rounds).toEqual([]);
    g.steps(1);
    expect(g.rounds).toEqual([1]);
    expect(g.room.timeLeft()).toBe(1200);
    for (const c of [a, b]) expect(c.of('roundStart')).toEqual([expect.objectContaining({ round: 1, seconds: 1200, rounds: 1 })]);
    g.room.text(1, { type: 'loaded' });
    g.steps(1);
    expect(g.rounds).toEqual([1]);
  });

  it('returns once after the single round and existing result screens, then waits for a new explicit lobby launch', () => {
    // Two seconds is a test clock. Existing phase durations are held separately by round.parity.test.ts.
    const g = respawnRoom({ roundSeconds: 2 });
    const a = g.join(1), b = g.join(2);
    expect(g.room.launch(0)).toBe(true);
    const serial = g.room.currentMatch().serial;
    g.steps(2 * TICK_HZ);
    expect(a.of('timeExpired')).toHaveLength(1);
    expect(a.of('roundOver')).toHaveLength(0);
    g.steps((EXPIRED_PLAY_S + RESULT_S) * TICK_HZ);
    expect(a.of('roundOver')).toEqual([expect.objectContaining({
      round: 1, matchOver: true,
      screens: [{ screen: 'finalRound', seconds: 10 }, { screen: 'gameComplete', seconds: 10 }],
    })]);
    const hold = (ENGINE_READ_S + FINAL_ROUND_S + GAME_COMPLETE_S) * TICK_HZ;
    g.steps(hold - 1);
    expect(g.returns).toEqual([]);
    g.steps(1);
    expect(g.returns).toEqual([{ launched: false, timeLeft: null }]);
    expect(g.room.launched).toBe(false);
    expect(g.room.timeLeft()).toBeNull();
    expect(g.room.currentMatch().serial).toBe(serial);
    expect([g.room.player(1)!.team, g.room.player(2)!.team]).toEqual(['seal', 'terrorist']);
    for (const c of [a, b]) {
      expect(c.of('roundStart')).toHaveLength(1);
      expect(c.of('abandoned')).toHaveLength(0);
      expect(c.of('score').at(-1)).toMatchObject({ timeLeft: null, wins: { seal: 0, terrorist: 0 } });
    }
    g.steps(30 * TICK_HZ);
    expect(g.returns).toHaveLength(1);
    expect(g.rounds).toEqual([1]);
    expect(g.room.launch(0)).toBe(true);
    expect(g.rounds).toEqual([1, 1]);
    expect(g.room.currentMatch().serial).toBe(serial + 1);
    expect(a.of('roundStart').at(-1)).toMatchObject({ round: 1, seconds: 2, rounds: 1 });
  });

  it('an unheld dedicated respawn room keeps playing its next matches without a lobby return', () => {
    const g = respawnRoom({ heldLaunch: false, roundSeconds: 2 });
    const a = g.join(1);
    g.join(2);
    expect(a.of('welcome')[0]).toMatchObject({ phase: 'play', startTick: 0, rules: 'respawn', rounds: 1 });
    expect(g.room.timeLeft()).toBe(2);
    const serial = g.room.currentMatch().serial;
    const matchTicks = (2 + EXPIRED_PLAY_S + RESULT_S + ENGINE_READ_S + FINAL_ROUND_S + GAME_COMPLETE_S) * TICK_HZ;
    for (let matches = 1; matches <= 2; matches++) {
      g.steps(matchTicks);
      expect(a.of('roundOver')).toHaveLength(matches);
      expect(a.of('roundStart')).toHaveLength(matches);
      expect(a.of('roundStart').at(-1)).toMatchObject({ round: 1, seconds: 2, rounds: 1 });
      expect(g.room.currentMatch().serial).toBe(serial + matches);
      expect(g.returns).toEqual([]);
    }
  });
});
