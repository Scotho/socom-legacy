import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import {
  Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, STANCE_CODES, TICK_HZ, type Command, type ServerEvent, type SimMap,
} from '../../viewer/src/sim';
import { deathClip } from '../../viewer/src/net/deaths';
import { PART } from '../../viewer/src/net/damage';
import { Room, type Conn } from '../src/room';

/**
 * LATER 980, CROUCH-RUN-DEATH (research 421 s14; simulation track, reading, pending review): the original's death pick
 * takes its posture from `FUN_005a0700` (handed to `FUN_005a0950` as its third argument, D:L458893), which starts from
 * `FUN_0058a720(actor, 0)` (D:L458846) -- with 0, the actor's RAW stance word `+0x174` (D:L446840-446842): crouched for
 * a crouch-runner. The size class, `FUN_0058a720(actor, 1)` (stand for a crouched word with the crouch-run flag `+0x21c`
 * bit 2, D:L446867-446868), is not what the pick reads. In the port the raw word is the walker's `stance` and the size
 * class its `posture` (viewer `mover.ts`: `stand` while a crouch runs at full stick, `FUN_00584c60`).
 *
 * So a player killed crouch-running by a bullet draws from the CROUCHED lists (`damanim.rdr`'s, as viewer
 * `net/deaths.ts` holds them), for every draw of the room's random; a crouch-walker, a standing and a prone player draw
 * as they did. Out of this test, named apart: the stance transitions' phase rule (D:L458862-458891, LATER 984) and the
 * `+0x1060` forced prone (D:L458859-458861, LATER 985).
 */

/** The players' lists (viewer `net/deaths.ts` `HEAD` / `BODY`, `damanim.rdr`'s `HEAD_DEATH_ANIMATIONS` / `BODY_...`). */
const HEAD_LIST = {
  stand: ['death_stand_head01', 'death_stand_head02', 'death_stand_head03', 'death_stand_head04'],
  crouch: ['death_crouch_head01', 'death_crouch_chest01'],
  prone: ['death_prone_chest01'],
} as const;
const BODY_LIST = {
  stand: [
    'death_stand_chest01', 'death_stand_chest02', 'death_stand_chest03', 'death_stand_rarm01', 'death_stand_larm01',
    'death_stand_larm02', 'death_stand_groin02', 'death_stand_groin01',
  ],
  crouch: ['death_crouch_back01', 'death_crouch_chest01', 'death_crouch_chest02'],
  prone: ['death_prone_chest01'],
} as const;
/** Every index of every list (8 at most): the draw's centre of each eighth. */
const DRAWS = Array.from({ length: 8 }, (_, i) => (i + 0.5) / 8);

type V3 = [number, number, number];
type Stance = 'stand' | 'crouch' | 'prone';
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
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
  bulletHit(p: unknown, victimId: number, part: number, struck: { distance: number; point: readonly number[] }, record: unknown, volley: boolean,
    from: readonly number[], report: { request: 'fire'; weapon: number; direction: readonly number[] }): void;
};

/**
 * Players 1 (T, the shooter) and 2 (S, the victim) on a flat floor, the room's random seeded until `draw` is set; the
 * victim asked `stance` (`Button.Stance`, `Command.stance`), let settle, then held at `stick` forward for half a second.
 */
function victimAt(stance: Stance, stick: number) {
  let seed = 1, draw: number | null = null;
  const random = (): number => {
    if (draw !== null) return draw;
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const room = new Room(map(), null, { now: () => 0, random }, null, null);
  [1, 2].forEach((id) => room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) }, `10.0.0.${id}`));
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
  const victim = room.player(2)!;
  const kill = (part: number, r: number): string | null => {
    const w = victim.sim.walker.state;
    victim.health.hp[part] = 0.5; victim.health.armour[part] = 0;   // the one round is lethal
    draw = r;
    (room as unknown as Inner).bulletHit(room.player(1)!, 2, part, { distance: 100, point: [w.x, w.y + 20, w.z] }, DEFAULT_RIFLE, false,
      [w.x - 100, w.y + 20, w.z], { request: 'fire', weapon: 0, direction: [1, 0, 0] });
    draw = null;
    expect(victim.alive).toBe(false);
    return (victim as unknown as { deathClip: string | null }).deathClip;   // the room's Player (`room.ts` `deathClip`)
  };
  return { walker: victim.sim.walker, kill };
}

/** Each case: what the walker reads at the kill (`stance`, the raw word; `posture`, the size class) and the list drawn. */
const CASES: { name: string; stance: Stance; stick: number; raw: Stance; size: Stance; part: number; list: readonly string[]; want: Stance }[] = [
  { name: 'a crouch-runner, BODY', stance: 'crouch', stick: 1, raw: 'crouch', size: 'stand', part: PART.BODY, list: BODY_LIST.crouch, want: 'crouch' },
  { name: 'a crouch-runner, HEAD', stance: 'crouch', stick: 1, raw: 'crouch', size: 'stand', part: PART.HEAD, list: HEAD_LIST.crouch, want: 'crouch' },
  { name: 'a crouch-walker, BODY', stance: 'crouch', stick: 0.6, raw: 'crouch', size: 'crouch', part: PART.BODY, list: BODY_LIST.crouch, want: 'crouch' },
  { name: 'a crouch-walker, HEAD', stance: 'crouch', stick: 0.6, raw: 'crouch', size: 'crouch', part: PART.HEAD, list: HEAD_LIST.crouch, want: 'crouch' },
  { name: 'a standing runner, BODY', stance: 'stand', stick: 1, raw: 'stand', size: 'stand', part: PART.BODY, list: BODY_LIST.stand, want: 'stand' },
  { name: 'a standing runner, HEAD', stance: 'stand', stick: 1, raw: 'stand', size: 'stand', part: PART.HEAD, list: HEAD_LIST.stand, want: 'stand' },
  { name: 'a prone player, BODY', stance: 'prone', stick: 0, raw: 'prone', size: 'prone', part: PART.BODY, list: BODY_LIST.prone, want: 'prone' },
  { name: 'a prone player, HEAD', stance: 'prone', stick: 0, raw: 'prone', size: 'prone', part: PART.HEAD, list: HEAD_LIST.prone, want: 'prone' },
];

describe('LATER 980: a player\'s bullet death reads the raw stance word (FUN_0058a720(actor, 0), D:L458846), not the size class', () => {
  it.each(CASES)('$name: stance $raw / posture $size at the kill draws the $want list, for every draw', (c) => {
    for (const r of DRAWS) {
      const v = victimAt(c.stance, c.stick);
      expect({ stance: v.walker.stance, posture: v.walker.posture }, `draw ${r}`).toEqual({ stance: c.raw, posture: c.size });
      const clip = v.kill(c.part, r);
      expect(c.list, `draw ${r}`).toContain(clip);
      expect(clip, `draw ${r}`).toBe(deathClip('bullet', c.part, c.want, () => r));
    }
  });

  it('the draws reach every clip of the crouch-runner\'s BODY list (the disc\'s three; CROUCH-BODY-LIST)', () => {
    const seen = new Set(DRAWS.map((r) => victimAt('crouch', 1).kill(PART.BODY, r)));
    expect([...seen].sort()).toEqual([...BODY_LIST.crouch].sort());
  });

  it('the three player bullet calls in the room pass the walker\'s stance; the hostage and blast calls keep theirs', () => {
    const src = readFileSync(new URL('../src/room.ts', import.meta.url), 'utf8');
    const player = [...src.matchAll(/deathClip\('bullet', [\w.]+, (\w+)\.sim\.walker\.(\w+), this\.opts\.random\)/g)];
    expect(player.map((m) => `${m[1]}.${m[2]}`)).toEqual(['victim.stance', 'victim.stance', 'q.stance']);
    expect(src).not.toMatch(/deathClip\([^)]*walker\.posture/);
    expect([...src.matchAll(/deathClip\('bullet', [\w.]+, this\.extraction!\.posture\(h\), this\.opts\.random, 'teammate'\)/g)]).toHaveLength(2);
    expect([...src.matchAll(/deathClip\('blast', out\.part, posture, this\.opts\.random/g)]).toHaveLength(2);
  });
});
