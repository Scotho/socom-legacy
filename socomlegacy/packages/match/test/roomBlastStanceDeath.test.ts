import { describe, expect, it } from 'vitest';
import { M67, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, TICK_HZ, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * LATER 1014 (Craig's blast list, 2026-11-19; simulation track, reading, pending review): the blast's death pick on a
 * stance transition. `FUN_0057e770`'s prone branch (D:L441003-441013) tests the low byte of the actor's RAW stance word
 * `+0x174` against 2 -- the word `FUN_0058a720(actor, 0)` returns (D:L446840-446842), not the size class -- and, prone,
 * plays the BODY list's prone death (`FUN_005a0950(actor, 3, 2)`); any other word throws the body (`FUN_005807d0`).
 * The word is the target from the press (`FUN_00552d60` -> `FUN_00581ed0(actor, 2)` -> `FUN_0058a6b0`, D:L418896,
 * D:L442697), and the handler's own pop before the test (`FUN_0058a4d0`, D:L440997) rewrites it from the base play left
 * on top. The port hands the pick the walker's `posture` (the size class); its raw word is `stance`. The two differ only
 * on a crouch run (word crouch, body stand: neither prone), so the pick -- which asks only "prone?" -- is the
 * original's either way. The real pin is the kill on the press tick with the transition's clip playing; the invariant
 * over six transitions holds by construction (every stance write goes through the walker's setter) and guards a future
 * split. The harness is `roomBlastStanceCount.test.ts`' (copied).
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

/** The victim settled `from`, asked `to`, and killed by an M67 at its feet `ticks` later: the walker's two words and its clip. */
function deathMid(from: Stance, to: Stance, ticks: number): { stance: Stance; posture: Stance; clip: string | null; dead: boolean; playing: string | null } {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const clients = [new Client(), new Client()];
  const room = new Room(map(), null, { now: () => 0, random }, null, null);
  [1, 2].forEach((id) => room.hello(id, clients[id - 1]!, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`));
  room.step();
  const at: V3[] = [[-300, 0, 600], [0, 0, 600]];
  at.forEach((p, i) => room.player(i + 1)!.sim.walker.place(p[0], p[1] + 20, p[2]));
  for (let i = 0; i < 30; i++) room.step();
  const drive = (n: number, ask: Stance | null): void => {
    for (let i = 0; i < n; i++) {
      const p = room.player(2)!;
      const first = ask !== null && i === 0;
      const cmd: Command = {
        seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0,
        buttons: first ? Button.Stance : 0, stance: first ? STANCE_CODES.indexOf(ask) : 0, weapon: 0,
      };
      room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  if (from !== 'stand') drive(1, from);
  drive(Math.round(2.5 * TICK_HZ), null);                        // the stance clip done
  drive(1, to);                                                  // the press: the word moves at once
  if (ticks > 1) drive(ticks - 1, null);
  const victim = room.player(2)!, thrower = room.player(1)!;
  const w = victim.sim.walker.state;
  const seen = { stance: victim.sim.walker.stance, posture: victim.sim.walker.posture, playing: (victim.sim.walker as unknown as { action: { name: string } | null }).action?.name ?? null };
  (room as unknown as Inner).blastPlayers({ record: M67, piercing: 4, fragments: true }, [w.x + 2, w.y + 0.1, w.z], () => thrower, undefined, 'P1');
  return { ...seen, clip: (victim as unknown as { deathClip: string | null }).deathClip, dead: !victim.alive };
}

const PRONE_DEATHS = ['death_prone_chest01'];
const PAIRS: [Stance, Stance][] = [['stand', 'prone'], ['prone', 'stand'], ['crouch', 'prone'], ['prone', 'crouch'], ['stand', 'crouch'], ['crouch', 'stand']];

describe('LATER 1014: the blast death pick asks the raw stance word (FUN_0057e770 D:L441003-441013); the port posture agrees on "prone?"', () => {
  it.each(PAIRS)('%s -> %s: through the transition, posture is prone exactly when the word is (ticks 1..90)', (from, to) => {
    for (const n of [1, 2, 4, 8, 16, 32, 60, 90]) {
      const out = deathMid(from, to, n);
      expect(out.posture === 'prone', `tick ${n}: ${out.stance}/${out.posture}`).toBe(out.stance === 'prone');
    }
  });

  it('killed on the press tick: just pressed prone -> the prone death; just pressed up from prone -> thrown', () => {
    const down = deathMid('stand', 'prone', 1), up = deathMid('prone', 'stand', 1);
    expect(down.playing, 'the transition is playing at the kill').toBe('standToProne');
    expect(up.playing, 'the transition is playing at the kill').toBe('standToProne');   // played reversed (mover.ts ~:3185)
    expect(down.stance).toBe('prone');
    expect(down.dead).toBe(true);
    expect(PRONE_DEATHS).toContain(down.clip);
    expect(up.stance).toBe('stand');
    expect(up.dead).toBe(true);
    expect(up.clip).toBeNull();
  });
});
