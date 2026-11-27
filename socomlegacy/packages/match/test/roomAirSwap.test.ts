import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, type ClientEvent, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * B-65 (OWNER-DECISIONS C2; MISSION OT.R151, pending seat-merge): the owner's INTENTIONAL DIVERGENCE -- a swap pressed in
 * the air is taken, in the room as on the page (`../../viewer/src/mover` `AIR_SWAP_OWNER_DIVERGENCE_ADAPTATION`). The
 * original refuses it (`FUN_005a8cb0`: the body free, not in the air; research 201 §1). The room's own refusals stand
 * (`Room.swapRefused`: the reload locks, the moving lower, the victory dance), and so does its reload refusal in the air
 * (`FUN_005c2a90` D:L477395; LATER 194: the page told `stale`, the request dropped). A synthetic flat map, no disc.
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
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

function match() {
  let seed = 1;
  const room = new Room(flatMap(), null, { now: () => 0, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, rules: 'classic', launchCountdownS: 0 }, null, null);
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
    return c;
  };
  const t = join(1), seal = join(2);
  room.step();
  const cmd = (id: number, over: Partial<Command> = {}): Command => {
    const p = room.player(id)!;
    return { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: p.sim.weapon, ...over };
  };
  /** One command of `id`'s, and the room's step. */
  const run = (id: number, over: Partial<Command> = {}): void => { room.binary(id, encodeCommands({ viewTick: room.tick, commands: [cmd(id, over)] })); room.step(); };
  return { room, t, seal, run };
}

describe("B-65: the room takes a swap pressed in the air (the owner's divergence)", () => {
  it('an airborne player\'s Swap command is applied: the sidearm taken, no swap drop', () => {
    const s = match();
    const p = s.room.player(2)!;
    for (let i = 0; i < 30; i++) s.run(2);
    expect(p.sim.weapon).toBe(0);
    p.sim.walker.setAirborne(true, 300);
    s.run(2);
    expect(p.sim.walker.airborne).toBe(true);
    s.run(2, { buttons: Button.Swap, weapon: 1 });
    expect(p.sim.walker.airborne).toBe(true);
    expect(p.sim.weapon).toBe(1);                                // was: 0 (the mover refused it in the air)
    expect(p.sim.walker.swapping()).toBe(true);
  });

  it("B-65 review F3: a RUNNING jump -- a Swap riding a command under the jump's `launch` is taken, the flight's horizontal speed unchanged, the overlay not cut at the landing", () => {
    const s = match();
    const p = s.room.player(2)!;
    for (let i = 0; i < 90; i++) s.run(2, { forward: 1 });
    s.run(2, { forward: 1, buttons: Button.Jump });
    s.run(2, { forward: 1 });
    const w = p.sim.walker;
    expect(w.airborne).toBe(true);
    expect(w.action?.name).toBe('launch');
    const vx = w.state.vx, vz = w.state.vz;
    s.run(2, { forward: 1, buttons: Button.Swap, weapon: 1 });
    expect(p.sim.weapon).toBe(1);                                // was: 0 (the launch refused it)
    expect(w.action?.name).toBe('launch');
    expect(w.state.vx).toBeCloseTo(vx, 6);
    expect(w.state.vz).toBeCloseTo(vz, 6);
    const ends: string[] = [];
    const off = w.onActionEnd((e) => { if (e.overlay) ends.push(e.reason); });
    let swappingAtLanding: boolean | null = null;
    for (let i = 0; i < 300 && swappingAtLanding === null; i++) {
      s.run(2, { forward: 1, weapon: 1 });
      if (!w.airborne) swappingAtLanding = w.swapping();
    }
    for (let i = 0; i < 120; i++) s.run(2, { weapon: 1 });
    off();
    expect(swappingAtLanding).toBe(true);
    expect(ends).toEqual(['complete']);
  });

  it('a reload requested in the air is still refused: the page told stale, the request dropped', () => {
    const s = match();
    const p = s.room.player(2)!;
    for (let i = 0; i < 30; i++) s.run(2);
    p.sim.walker.setAirborne(true, 300);
    s.run(2);
    expect(p.sim.walker.airborne).toBe(true);
    s.room.text(2, { type: 'reload', seq: p.sim.seq } as ClientEvent);
    s.run(2);
    expect(s.seal.events.some((e) => e.type === 'stale' && (e as { request?: string }).request === 'reload')).toBe(true);
  });
});

describe("B-65 extended to the STANDING jump (the owner, 2026-11-25: \"add it to the standing jump as well\")", () => {
  it("a Swap riding a command under the standing jump's `jump` action is taken as the overlay; the jump is not cut and ends complete", () => {
    const s = match();
    const p = s.room.player(2)!;
    for (let i = 0; i < 30; i++) s.run(2);
    s.run(2, { buttons: Button.Jump });
    const w = p.sim.walker;
    expect(w.action?.name).toBe('jump');
    expect(w.airborne).toBe(false);                              // the standing jump never leaves the floor
    for (let i = 0; i < 10; i++) s.run(2);
    const ends: { what: string; reason: string }[] = [];
    const off = w.onActionEnd((e) => { ends.push({ what: e.overlay ? 'overlay' : e.body?.name ?? '?', reason: e.reason }); });
    s.run(2, { buttons: Button.Swap, weapon: 1 });
    expect(p.sim.weapon).toBe(1);                                // was: 0 (the `jump` action refused it)
    expect(w.swapping()).toBe(true);
    expect(w.overlay).not.toBeNull();                            // the moving overlay, never a full-body swap action
    expect(w.action?.name).toBe('jump');
    for (let i = 0; i < 150; i++) s.run(2, { weapon: 1 });
    off();
    expect(ends.filter((e) => e.what === 'jump')).toEqual([{ what: 'jump', reason: 'complete' }]);
    expect(ends.filter((e) => e.what === 'overlay')).toEqual([{ what: 'overlay', reason: 'complete' }]);
  });
});
