import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type EffectProgram, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { DoorSpec } from '../../viewer/src/doors';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * The owner, 2026-11-07: "u shouldnt be able to open then move right away". The room's half (PTW.R3 with the page's
 * `../../viewer/src/walk` `pushedTop`; research 92 section 2, "The body under the door clip"): the door program's
 * `Open door` push (`Room.doorMotion`) is a full-body one-shot on top of the presser's stack (`FUN_00588bc0`
 * D:L487256-487260); with a one-shot on top the ground driver runs no ground state (`FUN_00550ef0` D:L418171-418203) and
 * the body moves by the top play's root alone (`FUN_0057a330` -> `FUN_0028c250` D:L438910) until the stick or the turn
 * past 0.1 cuts it once its phase is past `NoInterrupt` 0.5 (`FUN_00587c20` D:L445550-445556; D:L418180-418185) -- the
 * window's `cutFrom` -- or the clip ends (`until`). The room's mover holds the body for that window and ignores the move
 * commands in it, so a client that walks under it is corrected, not believed. Synthetic floor and door, as
 * `roomDoorClip.test.ts`: no disc (the clip's root keys absent, its travel over its length moves the body under 0.3).
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const TICK_MS = 1000 / TICK_HZ;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The door's program: Frostfire's `open` in miniature -- the ANIMATE (0.25 s), then the valve set on the context's. */
const DOOR_PROGRAM: EffectProgram = {
  name: 'singleDoor_test', root: 0, flags: 0xa2, nodes: ['NA'],
  sequences: [{
    name: 'seq_0', activation: 1,
    ops: [
      { op: 'aiAnimate', type: 63, prewait: 0, postwait: 0.25, blocking: false, select: 0 },
      { op: 'valve', valve: '', operation: 0x0b, operand: 1, context: true },
    ],
  }],
};

function doorMap(): SimMap {
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
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  // No hull polygons: the reach is the node's origin (`doorInReach`), set wide enough for any slot.
  const door: DoorSpec = {
    index: 0, node: 'door1', path: 'worldmodel/door1', valve: 'door1', range: 2000, elevation: -1, programs: [DOOR_PROGRAM],
    local: IDENTITY, parent: IDENTITY, owners: [], sweep: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
  };
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [door] };
}

/** The clips the room sizes the window from: `seal_open_door`, `motion.rdr` playback 0.8 and `NoInterrupt` 0.5, 14 keys. */
const CLIPS = {
  table: new Map([['seal_open_door', { playback: 0.8, noInterrupt: 0.5 }]]),
  clips: [{ name: 'seal_open_door', frameCount: 14 }],
} as unknown as ConstructorParameters<typeof Room>[1];

/** The room's live player 1 (not `player()`'s read-only view): its mover and its one-shot window. */
type Live = { sim: { jumps: number; seq: number }; flinchFrom: number; flinchUntil: number; flinchAt: number; flinchAir: number };
const live = (s: ReturnType<typeof setup>): Live => (s.room as unknown as { players: Map<number, Live> }).players.get(1)!;
/** One command of player 1 run, with `extra` on it; its seq. */
const step = (s: ReturnType<typeof setup>, extra: Partial<Command> = {}): number => {
  const c = { ...s.cmd(1), ...extra };
  s.send(1, [c]);
  s.tick();
  return c.seq;
};
/** Player 1 uses the door on its next command. */
const useDoor = (s: ReturnType<typeof setup>): void => {
  const c = s.cmd(1);
  s.send(1, [c]);
  s.room.text(1, { type: 'door', seq: c.seq, door: 0 } as never);
  s.tick();
};
/** Runs until the room has sent player 1's `motion` (the push, a game frame after the use); the event. */
const pushed = (s: ReturnType<typeof setup>): Extract<ServerEvent, { type: 'motion' }> => {
  const c = s.clients.get(1)!;
  for (let k = 0; k < 10 && c.of('motion').length === 0; k++) step(s);
  const m = c.of('motion').at(-1);
  if (!m || m.until === undefined || m.cutFrom === undefined || m.from === undefined) throw new Error('no sized motion event');
  return m;
};
function setup(clips: ConstructorParameters<typeof Room>[1] = null) {
  let now = 0;
  let seed = 1;
  const room = new Room(doorMap(), clips, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  const clients = new Map<number, Client>();
  const join = (id: number): Client => {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  const seqs = new Map<number, number>();
  const cmd = (id: number): Command => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    const yaw = clients.get(id)?.of('spawn').filter((e) => e.id === id).at(-1)?.yaw ?? 0;
    return { seq, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  };
  const send = (id: number, commands: Command[]): void => {
    for (let i = 0; i < commands.length; i += MAX_BATCH) room.binary(id, encodeCommands({ viewTick: room.tick, commands: commands.slice(i, i + MAX_BATCH) }));
  };
  const tick = (): void => { now += TICK_MS; room.step(); };
  return { room, join, cmd, send, tick, clients };
}


type Feet = { x: number; z: number };
const feetOf = (p: unknown): Feet => {
  const s = (p as { sim: { walker: { state: Feet } } }).sim.walker.state;
  return { x: s.x, z: s.z };
};
const gone = (a: Feet, b: Feet): number => Math.hypot(a.x - b.x, a.z - b.z);

describe("RED: the room holds the presser's body under the door clip, the stick read and not obeyed", () => {
  it('the stick forward from the push: the body stays for the commands before cutFrom, walks from cutFrom on', () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    useDoor(s);
    const m = pushed(s);
    const p = live(s);
    expect(p.sim.seq + 1).toBe(m.from);                            // the next command is the push's first
    const at = feetOf(p);
    while (p.sim.seq + 1 < m.cutFrom!) step(s, { forward: 1 });
    expect(gone(feetOf(p), at)).toBeLessThan(0.3);                 // 23 commands of a full stick: held (a walk is ~8)
    const before = feetOf(p);
    step(s, { forward: 1 });                                        // cutFrom: the stick cuts the clip, the ground state runs
    expect(p.flinchUntil).toBe(m.cutFrom);
    expect(gone(feetOf(p), before)).toBeGreaterThan(0.1);
    for (let k = 0; k < 10; k++) step(s, { forward: 1 });
    expect(gone(feetOf(p), at)).toBeGreaterThan(2);
  });

  it('no stick under the clip: held to the end; a stick on the commands after it walks', () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    useDoor(s);
    const m = pushed(s);
    const p = live(s);
    while (p.sim.seq + 1 < m.until!) step(s);
    const at = feetOf(p);
    for (let k = 0; k < 10; k++) step(s, { forward: 1 });
    expect(gone(feetOf(p), at)).toBeGreaterThan(1);
  });

  it('a stick pushed half-way, before cutFrom, is still not obeyed', () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    useDoor(s);
    const m = pushed(s);
    const p = live(s);
    for (let k = 0; k < 10; k++) step(s);
    const at = feetOf(p);
    while (p.sim.seq + 1 < m.cutFrom!) step(s, { forward: 1, right: 1 });
    expect(gone(feetOf(p), at)).toBeLessThan(0.3);
  });

  it('without the clips (no window sized) nothing is held: the body walks as before', () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    useDoor(s);
    for (let k = 0; k < 4; k++) step(s);
    const p = live(s);
    const at = feetOf(p);
    for (let k = 0; k < 10; k++) step(s, { forward: 1 });
    expect(gone(feetOf(p), at)).toBeGreaterThan(1);
  });

  it("a flinch's window (not a push) holds nothing: the body walks under it", () => {
    const s = setup(CLIPS);
    s.join(1);
    for (let t = 0; t < 10; t++) step(s);
    const p = live(s);
    p.flinchFrom = p.sim.seq + 1; p.flinchUntil = p.sim.seq + 40; p.flinchAt = p.sim.seq + 1;
    const at = feetOf(p);
    for (let k = 0; k < 10; k++) step(s, { forward: 1 });
    expect(gone(feetOf(p), at)).toBeGreaterThan(1);
  });
});
