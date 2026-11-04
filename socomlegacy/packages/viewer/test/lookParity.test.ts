// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode } from '../src/walk';
import { NetClient } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { lookContextOf } from '../src/net/lookGate';
import { BAKED_LOADOUT, kitRecords } from '../src/loadout';
import { shortTurn } from '../src/yaw';
import { TICK_HZ } from '../src/net/protocol';

/**
 * NET-LOOK's review (finding 1): the page's prediction runs the room's look gate with the room's own context -- the
 * held weapon's record (`lookContextOf`), the command's scope and binoculars bits, the stance's pitch limits -- so a
 * scoped, a pitched, a binoculars and a mid-swap look held by the room is held the same on the page. The page's real
 * `WalkMode` against the loopback room, frame for frame.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const ground = () => packGround(PARAMS, [FLOOR], OWNERS);
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
  side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
});
const LOADED = () => ({ path: 'RUN/MP99.ZDB', name: 'FLAT', ground: ground(), slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [] });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

async function rig() {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false, random });
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(ground(), [0, 0, 0]);
  fly.setPose({ x: -100, y: 40, z: 0, yaw: 0, pitch: 0 });
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  // The page's kit records, as `matchFirearm` hands them (the baked kit; the loopback room seats the same).
  const records = kitRecords(null, BAKED_LOADOUT);
  walk.setLookContext((w) => lookContextOf(records[w]));
  const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
  await flush();
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { fly.update(1 / 60); walk.frame(1 / 60); match.step(); await flush(); } };
  /** A long page frame of `dt` s: the room steps as many ticks as the frame ran. */
  const long = async (dt: number): Promise<void> => {
    const before = walk.ticks();
    fly.update(dt);
    walk.frame(dt);
    for (let i = before; i < walk.ticks(); i++) match.step();
    await flush();
  };
  await run(60);
  const player = match.room.player(client.id)!;
  /** Frames on, the page's mover and the room's compared after each (the room has run the page's newest command). */
  const same = async (n: number): Promise<number> => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      await run(1);
      const page = walk['walker']!.state, room = player.sim.walker.state;
      worst = Math.max(worst, Math.abs(shortTurn(room.yaw, page.yaw)), Math.abs(room.pitch - page.pitch));
    }
    return worst;
  };
  return { fly, walk, match, player, run, same, long };
}

describe('the page holds the look as the room does (NET-LOOK review, finding 1)', () => {
  it('a scoped snap, a pitch snap, a binoculars snap and a swap mid-turn: the page faces where the room does, every frame', async () => {
    const r = await rig();
    const clamps = r.player.sim.gate.clamps;
    const yaw0 = r.fly.pose().yaw;
    r.walk.setScopedMove(true);                                          // the rifle's scope (`Button.Scope`)
    r.fly.setPose({ yaw: yaw0 + 60 });
    expect(await r.same(60)).toBeLessThan(1e-6);
    r.walk.setScopedMove(false);
    r.fly.setPose({ pitch: 50 });                                        // the pitch, past its tick's allowance
    expect(await r.same(60)).toBeLessThan(1e-6);
    r.walk.setScopedMove(true); r.walk.setBinoculars(true);               // the binoculars (view state 4)
    r.fly.setPose({ yaw: yaw0 - 30, pitch: 0 });
    expect(await r.same(90)).toBeLessThan(1e-6);
    r.walk.setScopedMove(false); r.walk.setBinoculars(false);
    r.fly.setPose({ yaw: yaw0 + 120 });                                  // a turn held by the room ...
    expect(await r.same(3)).toBeLessThan(1e-6);
    expect(r.walk.swapWeapon('pistol')).not.toBeNull();                  // ... and the sidearm drawn in the middle of it
    expect(await r.same(90)).toBeLessThan(1e-6);
    expect(r.player.sim.weapon).toBe(1);
    expect(r.player.sim.gate.clamps).toBeGreaterThan(clamps + 4);         // the room did hold them: the test is not empty
  });
});

describe('a long frame spreads its look over its ticks (NET-LOOK round 3, finding 2)', () => {
  it('a 1.0 s hitch, the full stick held: no tick held on either side, and the body follows the camera', async () => {
    const r = await rig();
    const room0 = r.player.sim.gate.clamps;
    r.fly.setLook(1, 0);
    for (let i = 0; i < 4 * TICK_HZ; i++) await r.run(1);
    await r.long(1.0);
    expect(r.walk['lookGate'].clamps).toBe(0);
    expect(r.player.sim.gate.clamps).toBe(room0);
    expect(Math.abs(shortTurn(r.walk['walker']!.state.yaw, r.fly.pose().yaw))).toBeLessThan(0.01);
  });

  for (const [label, dt] of [['a 150 ms hitch', 0.15], ['10 frames a second', 0.1]] as const) {
    it(`${label}, the full stick held: neither the page's gate nor the room's holds a tick`, async () => {
      const r = await rig();
      const room0 = r.player.sim.gate.clamps;
      r.fly.setLook(1, 0);
      for (let i = 0; i < 4 * TICK_HZ; i++) await r.run(1);           // the ramp up, at 60 Hz
      for (let i = 0; i < 20; i++) await r.long(dt);
      for (let i = 0; i < 5; i++) await r.run(1);
      expect(r.walk['lookGate'].clamps).toBe(0);
      expect(r.player.sim.gate.clamps).toBe(room0);
      expect(Math.abs(shortTurn(270, r.fly.pose().yaw))).toBeGreaterThan(10);   // it did turn: the test is not empty
    });
  }
});
