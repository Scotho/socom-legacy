// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadSimMap } from '../../viewer/src/simMap';
import { PROTOCOL_VERSION, TICK_HZ, encodeCommands, type Command, type ServerEvent } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';
import { roomOn, surfacesOver } from './sceneRoundsDisc';

/**
 * V13-3a/3b (research 386): Blizzard's (MP1) two outhouses and three snow windows through `loadSimMap` and the room, read
 * off the disc (`RUN/MP1.ZDB`, `MZANIM.ZAR`'s set `mission`).
 *
 * - The five blocks bind (`isDestructibleAnim`: state 1, flags 0x23): `outhouse1/2` HP 1, shield 10, armour 0, on their
 *   child `hitthecan` (node reference 2); `snow_window01..03` HP 0, shield 0, on their roots (386 §1).
 * - A window is a hit trigger: any round reaches shield 0 and HP 0 is "at or below 0 after the hit" (`FUN_00273a50`
 *   D:L120978-121059); its sequence plays `.GLS_BRK_MD` at its root, a `DESTRUCTION_SOURCE`, and turns its root off
 *   (386 §2). An outhouse takes a round of 10 or more (`FUN_003c7490` D:L318622); its sequence calls `outhousedoor1/2`
 *   (`door_outhouse1/2` off), turns `hitthecan` and `vishealthy` off and `toilet` on (386 §3) -- all on the wire.
 * - The door after the blow: its node off, the pick passes no polygon of it (`FUN_0031e160` -> `FUN_002d4780`, the gate
 *   D:L174789-174790), so the room refuses its packet (386 §4); the four other `door_outhouse3..6` are untouched.
 * - The round's reset gives every node back (each reference saves its active state; `toilet` saved off), the door used
 *   again (386 §5).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP1.ZDB')));

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

const HUT = (n: number, leaf: string): string => `worldmodel/outhouse${n}/alaska4d_outhouse_nodoor_2=alaska4d_outhouse_nodoor_2/${leaf}`;

describe.skipIf(!DISC)(`V13-3: Blizzard's outhouses and snow windows (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it('the five blocks bind as read; a window breaks on any round, an outhouse on 10; the door after the blow is refused; the reset gives all back', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP1.ZDB');
    const list = map.meta!.scene!.destructibles;
    const by = (anim: string) => list.filter((d) => d.anim === anim);
    for (const n of [1, 2]) {
      const [d, ...rest] = by(`outhouse${n}`);
      expect(rest).toEqual([]);
      expect(d).toMatchObject({ health: 1, shield: 10, armor: 0, targetPath: HUT(n, 'hitthecan'), root: `worldmodel/outhouse${n}` });
    }
    for (const n of [1, 2, 3]) {
      const [d, ...rest] = by(`snow_window0${n}`);
      expect(rest).toEqual([]);
      expect(d).toMatchObject({ health: 0, shield: 0, armor: 0, targetPath: `worldmodel/snow_window0${n}` });
      expect(d!.program.sequences.flatMap((s) => s.ops.map((o) => o.op))).toEqual(['sound', 'destruction', 'active']);
      expect(d!.program.sequences[0]!.ops[0]).toMatchObject({ op: 'sound', sound: '.GLS_BRK_MD', node: -7 });
    }

    let now = 0;
    const room = new Room({ ...map, gameType: 2 }, null, { now: () => now, random: () => 0.5, launchCountdownS: 0 });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: 'MP1' }, '192.0.2.1');
    let seq = 0;
    const step = (door?: number): void => {
      const c: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c] }));
      if (door !== undefined) room.text(1, { type: 'door', seq: c.seq, door } as never);
      now += 1000 / TICK_HZ;
      room.step();
    };
    for (let t = 0; t < 10; t++) step();
    const player = (room as unknown as { players: Map<number, { alive: boolean; sim: { walker: { state: { x: number; y: number; z: number } } } }> }).players.get(1)!;
    expect(player.alive).toBe(true);
    const doorOf = (node: string): number => room.doors.specs.findIndex((d) => d.node === node);
    const use = (node: string): boolean => {
      const i = doorOf(node);
      expect(i, node).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < 900 && room.doors.state(i).busy; k++) step();   // any earlier swing ended
      expect(room.doors.state(i).busy, node).toBe(false);
      const at = room.doors.leaf(i)[0]!;
      Object.assign(player.sim.walker.state, { x: at[0], y: at[1], z: at[2] });
      const before = client.of('doorUse').filter((e) => e.door === i).length;
      step(i);
      return client.of('doorUse').filter((e) => e.door === i).length > before;
    };
    const world = room.world;
    expect(use('door_outhouse1')).toBe(true);                       // a whole outhouse's door swings

    // The windows: a round of rating 1 breaks each (shield 0, HP 0), its root off on the wire.
    for (const n of [1, 2, 3]) {
      const path = `worldmodel/snow_window0${n}`;
      expect(world.health.hitAt(path, { kind: 'impact', rating: 1, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
      expect(world.isActive(path)).toBe(false);
    }
    // The outhouses: 9 is refused by the shield, 10 qualifies.
    for (const n of [1, 2]) {
      expect(world.health.hitAt(HUT(n, 'hitthecan'), { kind: 'impact', rating: 9, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: false, died: false });
      expect(world.health.hitAt(HUT(n, 'hitthecan'), { kind: 'impact', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
      expect([world.isActive(HUT(n, 'hitthecan')), world.isActive(HUT(n, 'vishealthy')), world.isActive(HUT(n, 'toilet')), world.isActive(`worldmodel/door_outhouse${n}`)])
        .toEqual([false, false, true, false]);
    }
    const wire = world.states().map((s) => `${s.path}:${s.active}`);
    for (const n of [1, 2]) {
      expect(wire).toEqual(expect.arrayContaining([`${HUT(n, 'hitthecan')}:false`, `${HUT(n, 'vishealthy')}:false`, `${HUT(n, 'toilet')}:true`, `worldmodel/door_outhouse${n}:false`]));
    }

    // The door after the blow: refused, both; the other four doors untouched.
    expect(use('door_outhouse1')).toBe(false);
    expect(use('door_outhouse2')).toBe(false);
    expect(use('door_outhouse3')).toBe(true);

    // The round's reset: every node back, the door used again.
    world.reset();
    for (const n of [1, 2]) {
      expect([world.isActive(HUT(n, 'hitthecan')), world.isActive(HUT(n, 'vishealthy')), world.isActive(HUT(n, 'toilet')), world.isActive(`worldmodel/door_outhouse${n}`)])
        .toEqual([true, true, false, true]);
    }
    for (const n of [1, 2, 3]) expect(world.isActive(`worldmodel/snow_window0${n}`)).toBe(true);
    expect(use('door_outhouse1')).toBe(true);
  }, 120_000);
});

/**
 * Research 386 §3.2 (the review's C): Blizzard's terrorist base fires its own MPBOMB at its `healthy` node a tick after
 * its death (`destroy_terrorist_base`: `FIRE_WEAPON`, then `WAIT 0.15`, then the swap; `destroy_seal_base` fires none).
 * The node (y 97.405) lies 0.3 u under the deck's top over it (97.705); with the blast's one-sided line it reaches a body
 * 30 u east on the surface at 96.395 (the fragments drawn low: random 0.01).
 */
describe.skipIf(!DISC || !existsSync(join(DISC, 'RUN/ZWEAPON.ZAR')))(`research 386 §3.2: Blizzard's terrorist base round (dev disc${DISC ? '' : ': absent -- skipped'})`, () => {
  it("MP1's destroy_terrorist_base: MPBOMB at its healthy node a tick on; a body 30 u east takes health; the SEAL base fires none", async () => {
    const s = await roomOn(DISC!, 'MP1', () => 0.01);
    const t = s.origin('terrorist_base/tnt_dredge_group=tnt_dredge_group/healthy');
    expect(t[1]).toBeCloseTo(97.405, 3);
    expect(surfacesOver(s.map.ground, t[0]!, t[2]!).map((y) => Math.round(y * 1000) / 1000)).toEqual(expect.arrayContaining([97.395, 97.705]));
    const list = s.map.meta!.scene!.destructibles;
    expect(list.find((d) => d.anim === 'destroy_seal_base')!.program.sequences.flatMap((q) => q.ops).some((o) => o.op === 'fireWeapon')).toBe(false);
    const ground = surfacesOver(s.map.ground, t[0]! + 30, t[2]!).find((y) => Math.abs(y - 96.395) < 0.01)!;
    const body = s.place(1, [t[0]! + 30, ground, t[2]!]);
    const base = list.find((d) => d.anim === 'destroy_terrorist_base')!;
    expect(s.room.world.health.hitAt(base.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    s.step(); s.step();
    expect(s.client(1).of('sceneRound').map((e) => [e.kind, e.at.map(Math.round)])).toEqual([['MPBOMB', t.map(Math.round)]]);
    expect(s.client(1).of('blast')).toHaveLength(1);
    expect(body.health.hp.reduce((a, b) => a + b, 0)).toBe(170);
  }, 120_000);
});
