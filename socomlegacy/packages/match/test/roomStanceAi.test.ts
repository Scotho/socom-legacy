import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { Button, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';

/**
 * COMBINED-CUT (OT.R93; research 80 section 6f): the room's mark of the controller's `IsAi` (slot +0x30, research 191
 * section 4) on a seat's mover (`MoverSim.ai`) -- the seats whose stance transitions the original refuses to the stick by
 * id (`FUN_00587c20` D:L445536-445545). A CPU's connection (`Conn.cpu`) marks its seat at the seat (`room.ts` `newSim`);
 * the bots' brain marks a seat it adopts (a Forge NPC, `MatchBots.adopt`) while it drives it; a respawn's new mover
 * carries the mark. Every other seat is a player's, whose stick cuts the clips in either stance mode.
 */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
function flat(): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }];
  const ground = packGround(PARAMS, [floor], owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'STANCE AI TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  constructor(readonly cpu?: true) {}
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no transport */ }
}

function respawnRoom() {
  let seed = 1;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const room = new Room(flat(), null, { rules: 'respawn', heldLaunch: true, now: () => 0, random }, null, null);
  const hello = (id: number, side: 'seal' | 'terrorist', cpu?: true) =>
    room.hello(id, new Client(cpu), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, '', { host: id === 1, side });
  expect(hello(1, 'seal')).toBe(true);                         // a human
  expect(hello(2, 'terrorist')).toBe(true);                    // a Forge NPC's seat: its own connection, not `cpu`
  expect(hello(3, 'terrorist', true)).toBe(true);              // a CPU's connection (the bots' own, `MatchBots`)
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
  const bots = new MatchBots(room, { random, navigation, kits: null });
  const respawn = (id: number): void => (room as unknown as { spawn(p: unknown, kind: string): void }).spawn(room.player(id), 'respawn');
  return { room, bots, respawn };
}

/** Crouch, then a prone pressed under the stick: whether the stance clip is still on top a few commands later. */
function dropHeld(room: Room, id: number): boolean {
  const sim = room.player(id)!.sim;
  let seq = sim.seq;
  const c = (right: number, stance?: string): Command => ({ seq: ++seq, forward: 0, right, yaw: 0, pitch: 0, turn: 0,
    buttons: stance ? Button.Stance : 0, stance: stance ? STANCE_CODES.indexOf(stance as never) : 0, weapon: 0, separate: false });
  sim.apply(c(0, 'crouch'));
  for (let i = 0; i < 60; i++) sim.apply(c(0));
  sim.apply(c(0.3, 'prone'));
  for (let i = 0; i < 4; i++) sim.apply(c(0.3));
  return sim.walker.action?.name === 'crouchToProne';
}

describe('COMBINED-CUT: the room marks IsAi on a seat\'s mover', () => {
  it('a CPU connection\'s seat is ai, a human\'s and an un-adopted NPC\'s are not', () => {
    const { room } = respawnRoom();
    expect(room.player(3)!.sim.ai).toBe(true);
    expect(room.player(1)!.sim.ai).toBe(false);
    expect(room.player(2)!.sim.ai).toBe(false);
  });

  it('the mark survives a respawn (the new mover carries it)', () => {
    const { room, respawn } = respawnRoom();
    const before = room.player(3)!.sim;
    respawn(3); respawn(1);
    expect(room.player(3)!.sim).not.toBe(before);
    expect(room.player(3)!.sim.ai).toBe(true);
    expect(room.player(1)!.sim.ai).toBe(false);
  });

  it('a seat the bots\' brain adopts (a Forge NPC) is ai while adopted, across a respawn, and not after its release', () => {
    const { room, bots, respawn } = respawnRoom();
    expect(bots.adopt(2)).toBeTypeOf('function');
    expect(room.player(2)!.sim.ai).toBe(true);
    respawn(2);
    expect(room.player(2)!.sim.ai).toBe(true);
    bots.release(2);
    expect(room.player(2)!.sim.ai).toBe(false);
  });

  it('an adopted seat re-seated in place (SWITCH TEAMS, the lobby\'s swap) is marked again at the bots\' next step', () => {
    for (const how of ['swapSides', 'switchTeam'] as const) {
      const { room, bots } = respawnRoom();
      bots.adopt(2);
      const before = room.player(2)!.sim;
      expect(how === 'swapSides' ? room.swapSides() : room.switchTeam(2) !== null, how).toBe(true);
      expect(room.player(2)!.sim, how).not.toBe(before);         // a new player and mover, `ai` from its connection
      bots.step();
      expect(room.player(2)!.sim.ai, how).toBe(true);
      bots.release(2);
      expect(room.player(2)!.sim.ai, how).toBe(false);
    }
  });

  it('dispose lets go of an adopted seat\'s mark as release does', () => {
    const { room, bots } = respawnRoom();
    bots.adopt(2);
    bots.dispose();
    expect(room.player(2)!.sim.ai).toBe(false);
  });

  it('MOVE fold F3: a seat its human left in SEPARATE, adopted, drives as a bot does (no cut, no SEPARATE)', () => {
    // Review F3 (B196): the human's last command left `stanceSeparate` (and the cut) on the walker, and the bots'
    // commands state no mode, so SEP-POP and MOVE-1/2/4 reached the bot-driven body. Adoption lays the bots' words.
    const { room, bots } = respawnRoom();
    const sim = room.player(2)!.sim;
    sim.apply({ seq: sim.seq + 1, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, separate: true });
    expect(sim.walker.stanceSeparate).toBe(true);
    expect(sim.walker.stanceCut).toBe(true);
    bots.adopt(2);
    expect(room.player(2)!.sim.walker.stanceSeparate).toBe(false);
    expect(room.player(2)!.sim.walker.stanceCut).toBe(false);
  });

  it('an adopted Forge NPC\'s walker refuses the stick\'s cut (IsAi), a player\'s takes it, its command saying COMBINED', () => {
    const a = respawnRoom();
    a.bots.adopt(2);
    expect(dropHeld(a.room, 2)).toBe(true);
    expect(a.room.player(2)!.sim.walker.stanceCut).toBe(false);
    const b = respawnRoom();
    expect(dropHeld(b.room, 2)).toBe(false);
    expect(b.room.player(2)!.sim.walker.stanceCut).toBe(true);
    expect(dropHeld(b.room, 3)).toBe(true);                    // the CPU's own seat
  });
});
