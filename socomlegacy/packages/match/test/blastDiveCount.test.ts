import { describe, expect, it } from 'vitest';
import { M67, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, TICK_HZ, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { Traversal } from '../../viewer/src/traversal';
import { fragmentCount } from '../../viewer/src/net/damage';
import { BLAST_POINT_LIFT_READING } from '../../viewer/src/net/blast';
import { Room, type Conn } from '../src/room';

/**
 * B15-DIVE-COUNT (LATER 1341; simulation track, reading, pending review): the fragment count's stance subtraction
 * (`FUN_005a18b0` D:L459453-459461; r0004 0x5a7558-0x5a7590) takes 1 off for the stance byte 1 and 3 off for 2, nothing
 * for any other value; the byte (`FUN_0058a720(actor, 0)`, `+0x174`, D:L446840-446842) reads 6 through a dive (B-15's
 * capture of r0004, the desk read `b15-blast-parts-read.md` s4), so a diver is counted as a STANDING body. The port's
 * dive writes `walker.stance = 'prone'` at the press (`Traversal.dive`), and the room's `blastPlayers` hands that word to
 * the count: a diver takes prone's 3 off.
 *
 * The harness is `roomBlastStanceCount.test.ts`' (copied, not imported): a flat floor; the victim runs at full stick, then
 * the stance button's prone press dives (`Traversal.dive`); `ticks` later an M67 (`blastPlayers`, as `blast()` calls it)
 * bursts `distance` u from the feet (the round 0.1 over them, its lifted point -- `BLAST_POINT_LIFT_READING` over it --
 * exactly `distance` away). The room's random is scripted for the blast: the count's draw 0.97 (+7) and its second draw 0.6, then 0.5 for
 * every part. The want is `fragmentCount` at the stance code the original's byte takes (0 stand, 1 crouch, 2 prone),
 * replayed on the same two draws; at 40 u the three codes give 4 / 3 / 2, at 60 u 2 / 1 / 1.
 */

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const CODE_STANCE: readonly Stance[] = ['stand', 'crouch', 'prone'];
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
/** The dive's private clock and timer (`Traversal.diving`: `t` since the press, the hidden root timer), read for the phase. */
type Diving = { t: number; root: number; fall: number | null } | null;

/** The scripted blast draws: the count's roll and its second draw, then one per fragment. */
const COUNT_DRAWS = [0.97, 0.6] as const, PART_DRAW = 0.5;
function replayCount(distance: number, code: 0 | 1 | 2): number {
  const q = [...COUNT_DRAWS];
  return fragmentCount(distance, CODE_STANCE[code]!, () => q.shift() ?? PART_DRAW);
}

type Shot = { kind: string; stance: Stance; posture: Stance; diving: Diving; fragments: number };
/**
 * Players 1 (the thrower) and 2 (the victim). `body`: 'dive' runs at full stick half a second and presses the prone
 * stance (a dive), then steps `ticks`; else the victim asks the stance, settles, and stands still. Then the burst.
 */
function blastOn(body: Stance | 'dive', distance: number, ticks = 0): Shot {
  let seed = 1, script: number[] | null = null;
  const random = (): number => {
    if (script) return script.shift() ?? PART_DRAW;
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
  const drive = (n: number, forward: number, ask: Stance | null): void => {
    for (let i = 0; i < n; i++) {
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
  if (body === 'dive') {
    drive(Math.round(0.5 * TICK_HZ), 1, null);                   // the run, past the dive's 30 a second
    drive(1, 0, 'prone');                                        // the prone press: `Traversal.dive`
    drive(ticks, 0, null);
  } else {
    if (body !== 'stand') drive(1, 0, body);
    drive(Math.round(2.5 * TICK_HZ), 0, null);                   // the stance clip done
  }
  const victim = room.player(2)!, thrower = room.player(1)!;
  expect(victim.team).not.toBe(thrower.team);
  const moves = victim.sim.moves;
  const kind = moves instanceof Traversal ? moves.state().kind : 'none';
  const diving = moves instanceof Traversal ? (moves as unknown as { diving: Diving }).diving : null;
  const seen = { kind, stance: victim.sim.walker.stance, posture: victim.sim.walker.posture, diving: diving && { t: diving.t, root: diving.root, fall: diving.fall } };
  const w = victim.sim.walker.state;
  const before = clients[1]!.events.length;
  script = [...COUNT_DRAWS];
  // The round at rest 0.1 over the feet (as the copied harness's), lifted by the reading: its +x set so the lifted point
  // is `distance` from the feet in 3-D.
  const rise = 0.1 + BLAST_POINT_LIFT_READING;
  (room as unknown as Inner).blastPlayers({ record: M67, piercing: 4, fragments: true }, [w.x + Math.sqrt(distance * distance - rise * rise), w.y + 0.1, w.z], () => thrower, undefined, 'P1');
  script = null;
  const reports = clients[1]!.events.slice(before).filter((e) => e.type === 'combat' && (e as { request?: string }).request === 'blast') as { hitLocations: unknown[] | null }[];
  expect(reports).toHaveLength(1);
  return { ...seen, fragments: reports[0]!.hitLocations?.length ?? 0 };
}

/**
 * The dive's phases in the port (`Traversal.diveTick`): the hold (`t` under `DIVE_HOLD` 0.2 s, the kept speed), the
 * timer's fall to `DIVE_ROOT` 2.2, then down with the speed bled until rest, when the move ends prone. B-15's late window
 * (damage at dive +18/+19 PS2 frames, the airborne bit clear, the byte still 6 to +28) is the port's down-and-sliding
 * part; its early window (+11..+14, airborne) the timer's fall. Late first, as the brief asks.
 */
const DIVE_CASES: { name: string; ticks: number; phase: (d: NonNullable<Diving>) => boolean }[] = [
  { name: 'LATE (down, sliding: the timer at 2.2)', ticks: Math.round(0.6 * TICK_HZ), phase: (d) => d.t > 0.2 && d.root <= 2.2 },
  { name: 'EARLY (the hold: under 0.2 s)', ticks: Math.round(0.1 * TICK_HZ), phase: (d) => d.t < 0.2 },
  { name: 'EARLY (the timer falling)', ticks: Math.round(0.3 * TICK_HZ), phase: (d) => d.t > 0.2 && d.root > 2.2 },
];

describe('B15-DIVE-COUNT: a diver is counted as standing -- the byte reads 6, neither 1 nor 2 (FUN_005a18b0 D:L459453-459461)', () => {
  for (const c of DIVE_CASES) {
    for (const distance of [40, 60]) {
      it(`a ${c.name} dive at ${distance} u takes the standing count (code 0: ${replayCount(distance, 0)}), not prone's (${replayCount(distance, 2)})`, () => {
        const out = blastOn('dive', distance, c.ticks);
        expect(out.kind).toBe('dive');
        expect(out.diving).not.toBeNull();
        expect(c.phase(out.diving!), JSON.stringify(out.diving)).toBe(true);
        expect(replayCount(distance, 0)).not.toBe(replayCount(distance, 2));
        expect(out.fragments).toBe(replayCount(distance, 0));
      });
    }
  }
});

describe('B15-DIVE-COUNT guards: the stance byte as before -- prone 2, crouched 1, standing 0', () => {
  const GUARDS: { body: Stance; code: 0 | 1 | 2 }[] = [{ body: 'prone', code: 2 }, { body: 'crouch', code: 1 }, { body: 'stand', code: 0 }];
  for (const g of GUARDS) {
    for (const distance of [40, 60]) {
      it(`a ${g.body} body at ${distance} u takes code ${g.code}'s count (${replayCount(distance, g.code)})`, () => {
        const out = blastOn(g.body, distance);
        expect(out.kind).not.toBe('dive');
        expect(out.stance).toBe(g.body);
        expect(out.fragments).toBe(replayCount(distance, g.code));
      });
    }
  }
});
