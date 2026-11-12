// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode } from '../src/walk';
import { NetClient } from '../src/net/client';
import { LoopbackMatch, offlineRoomLookRate, simMapOfLoaded } from '../src/net/loopback';
import { lookContextOf } from '../src/net/lookGate';
import { BAKED_LOADOUT, kitRecords } from '../src/loadout';
import { MAX_YAW_RATE } from '../src/look';
import { shortTurn } from '../src/yaw';
import type { RoomOptions } from '../../match/src/room';

/**
 * RB-9 (the replay batch, KBM-3; OT.R114, RB.R4, RB.R6 -- reviewed as the SIMULATION track): the free mouse look in the
 * page's own offline room. The room's movers run the open gate when the page's `LoopbackMatch` asks for it (RB-2,
 * `RoomOptions.lookRate`, match `room.ts` `roomLookGateMode`), and the room's shot cone follows the look the gate let
 * (match `room.ts` `Room` step: `this.aim(p, { ...c, yaw: looked.yaw, ... })`). The page's prediction (`WalkMode.frame`,
 * its gate step on each tick's command) must run the same gate, or the page predicts a look the room holds (or the
 * other way about) and the facing is corrected every frame. The pad's look law (`../src/look` `LookLaw.frame`, the full
 * push `MAX_YAW_RATE`, 128.1 deg/s: `turn_maxrate` x 1.118, research 22) is untouched: the open gate passes what the
 * pad commands, so a pad still turns at that rate. The page's real `WalkMode` against the loopback room, frame for frame
 * (the rig of `lookParity.test.ts`).
 */

const DEG = 180 / Math.PI;
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

const live: LoopbackMatch[] = [];
afterEach(() => { for (const m of live.splice(0)) m.stop(); });

async function rig(lookRate?: RoomOptions['lookRate']) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false, random, ...(lookRate ? { lookRate } : {}) });
  live.push(match);
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(ground(), [0, 0, 0]);
  fly.setPose({ x: -100, y: 40, z: 0, yaw: 0, pitch: 0 });
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  const records = kitRecords(null, BAKED_LOADOUT);
  walk.setLookContext((w) => lookContextOf(records[w]));
  const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
  await flush();
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) { fly.update(1 / 60); walk.frame(1 / 60); match.step(); await flush(); } };
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
  return { fly, walk, match, player, run, same };
}

describe('RB-9: the free look in the page\'s offline room, the prediction on the same gate', () => {
  it("a room that asks for 'free': the room's mover and the page's prediction both run the open gate", async () => {
    const r = await rig('free');
    expect(r.player.sim.gate.mode).toBe('free');
    expect(offlineRoomLookRate()).toBe('free');
    expect(r.walk['lookGate'].mode).toBe('free');
  });

  it('a 120 degree flick in one frame: the room lays it at once, the shot cone on the commanded yaw, the page faces the same', async () => {
    const r = await rig('free');
    const yaw0 = r.fly.pose().yaw;
    r.fly.setPose({ yaw: yaw0 + 120 });                                  // a mouse flick: far past a tick of the law
    const want = r.fly.pose().yaw;
    await r.run(1);
    const room = r.player.sim.walker.state;
    expect(Math.abs(shortTurn(want, room.yaw))).toBeLessThan(0.01);     // the commanded yaw (to the wire's step)
    const cone = r.player.cone.frame(r.player.sim.seq)!;
    expect(Math.abs(shortTurn(want, cone.yaw))).toBeLessThan(0.01);     // the cone on the look the room let (`room.ts` `aim`)
    expect(await r.same(30)).toBeLessThan(1e-6);
    expect(r.player.sim.gate.clamps).toBe(0);
    expect(r.walk['lookGate'].clamps).toBe(0);
  });

  it('a room that does not ask keeps the law, and the page\'s prediction holds the flick as the room does', async () => {
    const r = await rig();
    expect(r.player.sim.gate.mode).toBe('law');
    expect(offlineRoomLookRate()).toBe('law');
    const yaw0 = r.fly.pose().yaw;
    r.fly.setPose({ yaw: yaw0 + 120 });
    const want = r.fly.pose().yaw;
    await r.run(1);
    expect(Math.abs(shortTurn(want, r.player.sim.walker.state.yaw))).toBeGreaterThan(10);   // held: the test is not empty
    expect(await r.same(60)).toBeLessThan(1e-6);
    expect(r.walk['lookGate'].mode).toBe('law');
    expect(r.player.sim.gate.clamps).toBeGreaterThan(0);
  });

  it('a pad still turns at 128.1 deg/s in the free room (the look law untouched)', async () => {
    const r = await rig('free');
    expect(MAX_YAW_RATE * DEG).toBeCloseTo(128.1, 1);
    r.fly.setLook(1, 0);                                                  // the full push right
    await r.run(60);                                                      // the ramp up
    const y0 = r.player.sim.walker.state.yaw;
    await r.run(60);                                                      // one second at the full push
    const turned = Math.abs(shortTurn(y0, r.player.sim.walker.state.yaw));
    expect(turned).toBeCloseTo(MAX_YAW_RATE * DEG, 0);
    expect(Math.abs(shortTurn(r.player.sim.walker.state.yaw, r.walk['walker']!.state.yaw))).toBeLessThan(1e-6);
  });

  it("the room stopped: the page's offline mode is the law again; a newer room's mode is the one asked", async () => {
    const r = await rig('free');
    expect(offlineRoomLookRate()).toBe('free');
    r.match.stop();
    expect(offlineRoomLookRate()).toBe('law');
    const s = await rig();
    expect(offlineRoomLookRate()).toBe('law');
    s.match.stop();
    expect(offlineRoomLookRate()).toBe('law');
  });

  it("RB-47 (RB-9's finding 4): the solo room stopped, the walk's gate is the law again at the next room's tap, before any tick", async () => {
    const r = await rig('free');
    expect(r.walk['lookGate'].mode).toBe('free');
    r.walk.setNetTap(null);                                               // the page's leaveRoom: `net.close()` releases the walk ...
    r.match.stop();                                                       // ... then `solo.stop()`
    r.walk.setNetTap(() => undefined);                                    // the next room's client takes the walk (`NetClient` attach)
    expect(r.walk['lookGate'].mode).toBe('law');                         // no tick run: no free gate reaches the next room
  });

  it('RB-47: the walk released after its solo room stopped is on the law at once', async () => {
    const r = await rig('free');
    r.match.stop();
    r.walk.setNetTap(null);
    expect(r.walk['lookGate'].mode).toBe('law');
  });

  it('RB-47: a new numbering (the next room\'s tap) takes the live offline room\'s mode', async () => {
    const r = await rig('free');
    r.walk.setNetTap(() => undefined);
    expect(r.walk['lookGate'].mode).toBe('free');                        // the room still live: its open gate kept
  });
});

/**
 * RB-47 (RB-9's findings 1-2): the test room's offline room asks for the open gate where OT.R114 lets the page read the
 * mouse (`kbmAllowed('testroom', null)`, `../src/kbmScope`), and only that room: `main.ts`'s solo `LoopbackMatch`.
 */
describe("RB-47: the test room's offline room asks for the open gate under kbmAllowed", () => {
  const src = (f: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');

  it("main.ts's solo LoopbackMatch passes lookRate 'free' only when kbmAllowed('testroom', null)", () => {
    const main = src('main.ts');
    const at = main.indexOf('solo = new LoopbackMatch(soloMap');
    expect(at).toBeGreaterThan(0);
    const opts = main.slice(at, main.indexOf('});', at));
    expect(opts).toMatch(/\.\.\.\(kbmAllowed\('testroom', null\) \? \{ lookRate: 'free' as const \} : \{\}\)/);
    expect(main.match(/lookRate: 'free'/g) ?? []).toHaveLength(1);       // the one room that asks
  });
});
