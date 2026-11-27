import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { AimFrame } from '../../viewer/src/net/shotCone';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * LATER 597 at the room (the review's finding 4): the room hands its walker's `aimProne` to the shot cone's frames
 * (`p.cone.tick`'s AimMover) and to its start bodies (`Room.startBody`). Through the dive the walker's posture is prone
 * but the original's posture word is 6 (r0001 `FUN_0057e540` D:L440898), so the eye takes the standing branch
 * (`FUN_0029ae50` D:L142591 asks word 2): `aimProne` false; once the dive is over and the body lies prone, true. The
 * viewer's `diveEye.test.ts` holds the rule on the walker; this file holds the room's two hand-offs. On a synthetic flat
 * floor (the room tests' convention), so it runs without the disc. The dive is reached on the wire: a prone press
 * (`Button.Stance`, stance 2) while running at speed, as `roomDoorClip.test.ts`'s LATER 544 pin.
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const TICK_MS = 1000 / TICK_HZ;

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
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [], doors: [] };
}

function setup() {
  let now = 0;
  let seed = 1;
  const room = new Room(flatMap(), null, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  const clients = new Map<number, Client>();
  const join = (id: number): Client => {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: 'MP99' }, `10.0.0.${id}`);
    return c;
  };
  let seq = 0;
  const cmd = (): Command => {
    seq += 1;
    const yaw = clients.get(1)?.of('spawn').filter((e) => e.id === 1).at(-1)?.yaw ?? 0;
    return { seq, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  };
  const step = (extra: Partial<Command> = {}): void => {
    const c = { ...cmd(), ...extra };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c].slice(0, MAX_BATCH) }));
    now += TICK_MS;
    room.step();
  };
  return { room, join, step };
}

type Live = {
  sim: { seq: number; walker: { posture: string; stance: string; aimProne: boolean; state: { vx: number; vz: number } }; moves: { state(): { kind: string } } };
  cone: { latest(): AimFrame | undefined; frame(seq: number): AimFrame | undefined };
};

describe('LATER 597 -- the room hands the walker aimProne to its aim frames and start bodies', () => {
  it("through the dive (posture prone) aimProne is false on the cone's frame and the start body; prone and still, true", () => {
    const s = setup();
    s.join(1);
    for (let t = 0; t < 10; t++) s.step();
    const p = (s.room as unknown as { players: Map<number, Live> }).players.get(1)!;
    const startBody = (): { posture: string; aimProne?: boolean } => (s.room as unknown as { startBody(q: unknown): { posture: string; aimProne?: boolean } }).startBody(p);
    for (let t = 0; t < 40; t++) s.step({ forward: 1 });            // up to speed
    const v = p.sim.walker.state;
    expect(v.vx * v.vx + v.vz * v.vz, 'moving at 30 a second or more (D:L443998)').toBeGreaterThanOrEqual(900);
    s.step({ buttons: Button.Stance, stance: 2, forward: 1 });
    expect(p.sim.moves.state().kind, 'the dive taken').toBe('dive');
    expect(p.sim.walker.posture).toBe('prone');
    expect(p.sim.walker.aimProne, "the walker's word 6").toBe(false);
    // (a) the cone's frame of the dive's command
    const diving = p.cone.frame(p.sim.seq);
    expect(diving?.posture).toBe('prone');
    expect(diving?.aimProne, "the cone's frame through the dive").toBe(false);
    expect(p.cone.latest()?.aimProne).toBe(false);
    // (c) the start body through the dive
    expect(startBody().posture).toBe('prone');
    expect(startBody().aimProne, 'the start body through the dive').toBe(false);
    // the dive run out, the body lying prone and still
    let k = 0;
    for (; k < 600 && p.sim.moves.state().kind === 'dive'; k++) s.step({ stance: 2 });
    expect(p.sim.moves.state().kind, 'the dive ended').not.toBe('dive');
    for (let t = 0; t < 60; t++) s.step({ stance: 2 });
    expect(p.sim.walker.stance).toBe('prone');
    expect(p.sim.walker.aimProne, "the walker's word 2").toBe(true);
    // (b) the cone's frame once prone
    const lying = p.cone.frame(p.sim.seq);
    expect(lying?.posture).toBe('prone');
    expect(lying?.aimProne, "the cone's frame prone and still").toBe(true);
    expect(p.cone.latest()?.aimProne).toBe(true);
    // (c) the start body once prone
    expect(startBody().aimProne, 'the start body prone and still').toBe(true);
  });
});
