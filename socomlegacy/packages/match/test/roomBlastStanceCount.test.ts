import { describe, expect, it } from 'vitest';
import { M67, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, TICK_HZ, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * FRAG-COUNT-STANCE (the v0.4.21 close review's finding; research 400 s12; simulation track, reading, pending review):
 * the fragment count's crouched / prone subtraction (`FUN_005a18b0` D:L459453-459461) reads `FUN_0058a720(actor, 0)`
 * (D:L459455) -- with 0, the actor's RAW stance word `+0x174` (D:L446840-446842), as the death pick does (research 421
 * s14, LATER 980; the word reads 1, crouched, on a crouch-running SEAL, measured n = 5). In the port the raw word is the
 * walker's `stance` and the size class its `posture` (`stand` while a crouch runs at full stick). So a crouch-runner in a
 * blast takes the CROUCHED count (one fewer); a crouch-walker, a standing runner and a prone player as before.
 *
 * The harness is `roomCrouchRunDeath.test.ts`' (copied, not imported): a flat floor, the victim asked a stance, let
 * settle, then held at `stick` forward for half a second; an M67 (`blastPlayers`, as `blast()` calls it) 10 u ahead of
 * the feet at the rest height, the room's random held at 0.3 for the blast: within 30 u the count is 8 + 4 (the draw's
 * 0.15..0.5 band), less the stance's 1 or 3; read off the combat report's `hitLocations` (one per fragment).
 */

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
function map(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}
const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');

type Inner = {
  blastPlayers(t: { record: typeof M67; piercing: number; fragments: boolean }, point: V3, ownerOf: (q: unknown) => unknown, facing: V3 | undefined, name: string): void;
};

/** Players 1 (the thrower) and 2 (the victim); the victim asked `stance`, settled, then held at `stick` forward half a second. */
function blastOn(stance: Stance, stick: number): { stance: Stance; posture: Stance; fragments: number } {
  let seed = 1, draw: number | null = null;
  const random = (): number => {
    if (draw !== null) return draw;
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const clients = [new Client(), new Client()];
  const room = new Room(map(), null, { now: () => 0, random, combatReport: true }, null, null);
  [1, 2].forEach((id) => room.hello(id, clients[id - 1]!, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`));
  room.step();
  const at: V3[] = [[-300, 0, 600], [0, 0, 600]];
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const drive = (ticks: number, forward: number, ask: Stance | null): void => {
    for (let i = 0; i < ticks; i++) {
      const p = room.player(2)!;
      const first = ask !== null && i === 0;
      const cmd: Command = {
        seq: p.sim.seq + 1, forward, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0,
        buttons: first ? Button.Stance : 0, stance: first ? STANCE_CODES.indexOf(ask) : 0, weapon: 0,
      };
      room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  if (stance !== 'stand') drive(1, 0, stance);
  drive(Math.round(2.5 * TICK_HZ), 0, null);                     // the stance clip done
  drive(Math.round(0.5 * TICK_HZ), stick, null);
  const victim = room.player(2)!, thrower = room.player(1)!;
  expect(victim.team).not.toBe(thrower.team);
  const w = victim.sim.walker.state;
  const seen = { stance: victim.sim.walker.stance, posture: victim.sim.walker.posture };
  const before = clients[1]!.events.length;
  draw = 0.3;
  (room as unknown as Inner).blastPlayers({ record: M67, piercing: 4, fragments: true }, [w.x + 10, w.y + 0.1, w.z], () => thrower, undefined, 'P1');
  draw = null;
  const reports = clients[1]!.events.slice(before).filter((e) => e.type === 'combat' && (e as { request?: string }).request === 'blast') as { hitLocations: unknown[] | null }[];
  expect(reports).toHaveLength(1);
  return { ...seen, fragments: reports[0]!.hitLocations?.length ?? 0 };
}

const CASES: { name: string; stance: Stance; stick: number; raw: Stance; size: Stance; want: number }[] = [
  { name: 'a crouch-runner', stance: 'crouch', stick: 1, raw: 'crouch', size: 'stand', want: 11 },
  { name: 'a crouch-walker', stance: 'crouch', stick: 0.6, raw: 'crouch', size: 'crouch', want: 11 },
  { name: 'a standing runner', stance: 'stand', stick: 1, raw: 'stand', size: 'stand', want: 12 },
  { name: 'a prone player', stance: 'prone', stick: 0, raw: 'prone', size: 'prone', want: 9 },
];

describe('FRAG-COUNT-STANCE: the fragment count reads the raw stance word (FUN_0058a720(actor, 0), D:L459455), not the size class', () => {
  it.each(CASES)('$name: stance $raw / posture $size takes $want fragments at 10 u (draw 0.3)', (c) => {
    const out = blastOn(c.stance, c.stick);
    expect({ stance: out.stance, posture: out.posture }).toEqual({ stance: c.raw, posture: c.size });
    expect(out.fragments).toBe(c.want);
  });
});
