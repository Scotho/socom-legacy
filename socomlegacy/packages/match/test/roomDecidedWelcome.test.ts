import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type GameType, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * LATER 155 (reading, pending review): a page that joins or resumes in a decided hold is told what decided the round --
 * the welcome's additive `decided` (with `phase: 'decided'` only): the winner and the room's own word for the path, the
 * one its event named to the pages there -- an elimination ('elimination'; EXTRACTION's and ESCORT's 'rescue' and
 * 'hostageKills', `eliminated.reason`), the clock's end ('timeout', `timedOut`), the bomb's result ('bomb'; `roomBomb.test.ts`).
 * Was: `phase: 'decided'` alone, so such a page's bomb took an elimination's (`DECIDED_WELCOME_REASON_PLACEHOLDER`) and its
 * round audio was not marked decided -- a defuse in BREACH's time-out hold played "TERRORISTS WIN!" a second time.
 * On a synthetic floor (the room tests' convention), so it runs without the disc.
 */

function flatMap(gameType?: GameType): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], ...(gameType !== undefined ? { gameType } : {}) };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

/** A classic room on the flat floor (`gameType` the map's), two players seated -- the round starts at once. */
function classic(gameType?: GameType, roundSeconds = 60) {
  let now = 0;
  const room = new Room(flatMap(gameType), null, { now: () => now, random: () => 0.5, rules: 'classic', launchCountdownS: 0, roundSeconds });
  const join = (id: number, watch = false): Client => {
    const c = new Client();
    expect(room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', ...(watch ? { watch: true } : {}) }, `192.0.2.${id}`)).toBe(true);
    return c;
  };
  const a = join(1); join(2);
  const steps = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; room.step(); } };
  const phase = (): string => (room as unknown as { state: { phase: string } }).state.phase;
  /** A watcher's welcome now. */
  const welcome = (id: number) => join(id, true).of('welcome')[0]! as Extract<ServerEvent, { type: 'welcome' }> & { decided?: unknown };
  steps(1);
  return { room, a, steps, phase, welcome };
}

describe("LATER 155: the welcome names what decided the round (`decided`, additive under protocol 11)", () => {
  it("an elimination's hold: decided { winner, reason: 'elimination' } -- the eliminated event's winner", () => {
    const g = classic();
    expect(g.welcome(10)).not.toHaveProperty('decided');            // in play: none
    // Player 2 falls (the room's own death path): the elimination's watch decides the round for player 1's side.
    const room = g.room as unknown as { kill(victim: unknown, killer: null, weapon: null, how: string, cause: number): void; players: Map<number, unknown> };
    room.kill(room.players.get(2), null, null, 'fall', 0);
    for (let i = 0; i < TICK_HZ * 30 && g.phase() !== 'decided'; i++) g.steps(1);
    expect(g.phase()).toBe('decided');
    const winner = g.a.of('eliminated')[0]!.winner;
    const w = g.welcome(20);
    expect(w.phase).toBe('decided');
    expect(w.decided).toEqual({ winner, reason: 'elimination' });
    // The round over: no reason told.
    for (let i = 0; i < TICK_HZ * 60 && g.phase() !== 'over'; i++) g.steps(1);
    expect(g.phase()).toBe('over');
    expect(g.welcome(21)).not.toHaveProperty('decided');
  });

  it("the clock's end: BREACH (type 1) decided { 'terrorist', 'timeout' }, ESCORT (type 3) { 'seal', 'timeout' } -- the timedOut event's", () => {
    for (const [gameType, winner] of [[1, 'terrorist'], [3, 'seal']] as const) {
      const g = classic(gameType, 20);
      g.steps(Math.ceil(20.1 * TICK_HZ));
      expect(g.a.of('timedOut'), `type ${gameType}`).toEqual([{ type: 'timedOut', winner }]);
      const w = g.welcome(30);
      expect(w.phase, `type ${gameType}`).toBe('decided');
      expect(w.decided, `type ${gameType}`).toEqual({ winner, reason: 'timeout' });
    }
  });
});
