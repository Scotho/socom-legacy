import { describe, expect, it } from 'vitest';
import { type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { LADDER_RELOAD_CLIPS } from '../../viewer/src/traversal';
import { MAX_BATCH, Room, type Conn } from '../src/room';

/**
 * LATER 562 (simulation track; reading, pending review): the room refuses a reload's start on a ladder. The original
 * refuses every `FUN_005b4340` code in the ladder's state 5 or under a posture-5 record (r0004's action gate 0x5ba680,
 * research 86 s2.8), the reload's code 3 among them (`FUN_005c2a90` -> `FUN_005b4340(actor, 3)` D:L477404). The room
 * asks `reloadRefusedBy` on the body's motion clip at the reload's command (its cone frame's `motion.clip`, `Room.reload`)
 * -- NU-1b B5's climb clips and, since LATER 562, a ladder's (`LADDER_RELOAD_CLIPS`). On a synthetic floor with no game
 * data (the room tests' convention, `roomDoorClip.test.ts`); the ladder is put on the body as its frame's clip, which
 * is all the room reads: a ladder clip at the command -> dropped 'reload: climb', the magazine ring unchanged; the
 * same reload with no ladder clip -> taken (the ring advances).
 */

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
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
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

type Ring = { state(): { slots: number[]; current: number } };
type Frame = { motion: { clip: string; phase: number; reversed: boolean } | null };
type Live = { alive: boolean; mags: [Ring, Ring]; reloadUntil: [number, number]; cone: { frame(seq: number): Frame | undefined } };

function setup() {
  let now = 0;
  let seed = 1;
  const room = new Room(flatMap(), null, {
    now: () => now, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, launchCountdownS: 0,
  });
  const client = new Client();
  room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: 'MP99' }, '192.0.2.1');
  let seq = 0;
  const tick = (): void => { now += TICK_MS; room.step(); };
  const step = (): number => {
    const c: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c].slice(0, MAX_BATCH) }));
    tick();
    return c.seq;
  };
  for (let t = 0; t < 10; t++) step();
  const p = (room as unknown as { players: Map<number, Live> }).players.get(1)!;
  return { room, client, p, step, tick };
}

/** One reload named on a fresh command, its frame's clip `clip` (null: left as the room ran it); the drops and the ring. */
function reloadOn(clip: string | null) {
  const s = setup();
  expect(s.p.alive).toBe(true);
  const seq = s.step();
  const frame = s.p.cone.frame(seq);
  expect(frame, 'the command has its frame').toBeDefined();
  if (clip !== null) frame!.motion = { clip, phase: 0.5, reversed: false };
  const before = s.p.mags[0].state(), untilBefore = s.p.reloadUntil[0];
  s.room.takeDrops();
  const sentFrom = s.client.events.length;
  s.room.text(1, { type: 'reload', seq } as never);
  s.step();                                                      // a reload is decided once the command after it ran (`due`)
  const stale = s.client.events.slice(sentFrom).filter((e) => (e as { type?: string; request?: string; seq?: number }).type === 'stale'
    && (e as { request?: string }).request === 'reload' && (e as { seq?: number }).seq === seq).length;
  return { drops: s.room.takeDrops() ?? {}, before, after: s.p.mags[0].state(), reloadUntil: s.p.reloadUntil[0], untilBefore, stale, s };
}

describe('LATER 562: the room refuses a reload begun on a ladder', () => {
  it('off the ladder (control): the same reload is taken -- the ring advances, no climb drop', () => {
    const r = reloadOn(null);
    expect(r.drops['reload: climb'] ?? 0).toBe(0);
    expect(r.after.current).not.toBe(r.before.current);
    expect(r.reloadUntil, 'the reload lock armed').toBeGreaterThan(r.untilBefore);
    expect(r.stale, 'no stale for a reload taken').toBe(0);
  });

  for (const clip of LADDER_RELOAD_CLIPS) {
    it(`on the ladder (${clip}): dropped 'reload: climb', nothing reloaded, the magazine unchanged`, () => {
      const r = reloadOn(clip);
      expect(r.drops['reload: climb'] ?? 0).toBe(1);
      expect(r.after).toEqual(r.before);
      expect(r.reloadUntil, 'no reload lock armed').toBe(r.untilBefore);
      // The page told (`stale`, request 'reload'), as the airborne refusal tells it, so its journal restores the magazine
      // its prediction took (netPage -> firearmWire.stale -> Fire.restoreReload) -- the network's bookkeeping, not the game's.
      expect(r.stale, "the page told: one 'stale' for the reload").toBe(1);
    });
  }
});
