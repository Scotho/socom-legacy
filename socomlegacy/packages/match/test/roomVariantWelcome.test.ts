import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, type ClientEvent, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * DAY-7b (DAY.R6, the no-bump alternative; product track, an adaptation -- the original names no variant on its wire):
 * a room made with `RoomOptions.variant` names it in its welcome (`variant`, additive under protocol 19), and refuses a
 * hello whose page cannot draw a variant (no `variants: true`, DAY-7a) by the room's one refusal (`refused`, its reason
 * naming the variant) -- a CPU seat's in-process hello excepted, which draws nothing. A room without one welcomes every
 * hello as before and its welcome carries no `variant`. On a synthetic floor (the room tests' convention), no disc.
 */

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP5', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  events: ServerEvent[] = [];
  closed: number | null = null;
  constructor(readonly cpu?: true) {}
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(code?: number): void { this.closed = code ?? 0; }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
type Hello = Extract<ClientEvent, { type: 'hello' }>;

function room(variant?: 'day' | 'night', rules: 'classic' | 'respawn' = 'classic'): Room {
  return new Room(flatMap(), null, { now: () => 0, random: () => 0.5, rules, launchCountdownS: 0, ...(variant ? { variant } : {}) });
}

const hello = (id: number, variants: boolean): Hello =>
  ({ type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP5', ...(variants ? { variants: true } : {}) } as Hello);

describe('DAY-7b: a variant room names its variant in the welcome', () => {
  it("a room made with variant 'day' welcomes a hello carrying variants: true, with variant: 'day'", () => {
    const r = room('day');
    const c = new Client();
    expect(r.hello(1, c, hello(1, true), '192.0.2.1')).toBe(true);
    const w = c.of('welcome')[0] as Welcome;
    expect(w).toBeDefined();
    expect(w.variant).toBe('day');
  });

  it('a variant room refuses a hello without the flag, by the room refusal, the reason naming the variant', () => {
    const r = room('day');
    const c = new Client();
    expect(r.hello(1, c, hello(1, false), '192.0.2.1')).toBe(false);
    expect(c.of('welcome')).toEqual([]);
    const refused = c.of('refused');
    expect(refused).toHaveLength(1);
    expect(refused[0]!.reason).toMatch(/day/i);
    expect(c.closed).toBe(4000);
  });

  it("a CPU seat's in-process hello (no flag; it draws nothing) is welcomed in a variant room", () => {
    const r = room('night', 'respawn');                              // H315: a CPU joins a respawn room only
    const c = new Client(true);
    expect(r.hello(1, c, hello(1, false))).toBe(true);
    expect((c.of('welcome')[0] as Welcome).variant).toBe('night');
  });

  it('a room without a variant welcomes both hellos and its welcome omits variant', () => {
    const r = room();
    const a = new Client(), b = new Client();
    expect(r.hello(1, a, hello(1, true), '192.0.2.1')).toBe(true);
    expect(r.hello(2, b, hello(2, false), '192.0.2.2')).toBe(true);
    expect(a.of('welcome')[0]).not.toHaveProperty('variant');
    expect(b.of('welcome')[0]).not.toHaveProperty('variant');
  });
});
