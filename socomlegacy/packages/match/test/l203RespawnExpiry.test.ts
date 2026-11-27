import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn, type RoomOptions } from '../src/room';

/**
 * L203 (ATLAS's lead; the main controller's ruling 2026-11-22T20:53Z; simulation track): a RESPAWN round's time-out as
 * the original runs it. PROVEN by a capture of the original (r0004), reviewed PASS WITH FINDINGS:
 * `agent/spc-atlas` `socomlegacy/docs/atlas/captures/mp5-mp64-runs5-7-r0004.md`, run 5 (+ its `.review.md`), MP5 natural
 * expiry and two replicates, MP64 cross-check:
 *   - `mp_timer` goes 1 -> 0 at the first update whose remaining time reads under 1000 ms (996 / 995 / 992 ms left):
 *     the round expires about 0.995 s BEFORE its exact deadline, the HUD at 0:00 in the same update;
 *   - `mp_winner` is written 14.963 s (MP5, both trials) / 14.982 s (MP64) of clock after that clear -- the deadline +
 *     13.95-13.99 s.
 * The port (before this) expired AT the deadline and picked the winner at expiry + 16 s (`EXPIRED_PLAY_S + RESULT_S`):
 * about 2.0 s late against the deadline, kills scoring in the gap.
 *
 * Tolerances: the expiry within one original game frame (1/30 s, 2 port ticks at 60 Hz) of "the first tick with under a
 * second left"; the winner within 2 port ticks of 14.963 s after the expiry (the three trials span 0.019 s).
 *
 * The flat floor, the two slots and the held respawn room are `roomRespawnLifecycle.test.ts`'s (copied, not imported).
 */

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
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
  let now = 0, ticks = 0;
  const room: Room = new Room(flatMap(), null, { now: () => now, random: () => 0.5, rules: 'respawn', heldLaunch: true, ...opts });
  const join = (id: number): Client => {
    const client = new Client();
    expect(room.hello(id, client, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99' }, `192.0.2.${id}`, { host: id === 1 })).toBe(true);
    return client;
  };
  const step = (): number => { now += 1000 / TICK_HZ; room.step(); return ++ticks; };
  return { room, join, step, ticks: () => ticks };
}

/** The tick each of `timeExpired` and `roundOver` first reached the page, and the round's exact deadline. */
function timeOut(roundSeconds: number): { deadline: number; expiredAt: number; overAt: number } {
  const g = respawnRoom({ roundSeconds });
  const a = g.join(1); g.join(2);
  expect(g.room.launch(0)).toBe(true);
  const start = a.of('roundStart')[0]!;
  const deadline = (start.startTick ?? g.ticks()) + roundSeconds * TICK_HZ;
  let expiredAt = -1, overAt = -1;
  for (let i = 0; i < (roundSeconds + 30) * TICK_HZ && overAt < 0; i++) {
    const t = g.step();
    if (expiredAt < 0 && a.of('timeExpired').length) expiredAt = t;
    if (overAt < 0 && a.of('roundOver').length) overAt = t;
  }
  return { deadline, expiredAt, overAt };
}

describe('L203: a respawn round times out as the original does (ATLAS run 5, proven by a reviewed capture)', () => {
  // 1 s (the re-review's N2): a round of a second or less expires on its first tick, as the rule says.
  for (const roundSeconds of [1, 5, 12]) {
    it(`expires at the first tick with under a second left (~0.995 s before the deadline), not at it (${roundSeconds} s round)`, () => {
      const r = timeOut(roundSeconds);
      expect(r.expiredAt, 'timeExpired sent').toBeGreaterThan(0);
      const early = r.deadline - r.expiredAt;                      // ticks before the exact deadline
      expect(early, `expired ${early} ticks before the deadline`).toBeGreaterThanOrEqual(TICK_HZ - 2);
      expect(early).toBeLessThanOrEqual(TICK_HZ);
    });

    it(`picks the winner 14.963 s after the expiry -- the deadline + ~13.97 s -- not 16 s after it (${roundSeconds} s round)`, () => {
      const r = timeOut(roundSeconds);
      expect(r.overAt, 'roundOver sent').toBeGreaterThan(0);
      const hold = r.overAt - r.expiredAt;
      expect(Math.abs(hold - Math.round(14.963 * TICK_HZ)), `expiry to winner ${hold} ticks (${(hold / TICK_HZ).toFixed(3)} s)`).toBeLessThanOrEqual(2);
      const afterDeadline = (r.overAt - r.deadline) / TICK_HZ;
      expect(afterDeadline, 'the deadline to the winner, s').toBeGreaterThan(13.9);
      expect(afterDeadline).toBeLessThan(14.05);
    });
  }
});
