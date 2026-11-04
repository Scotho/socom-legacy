// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, MotionClip, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode } from '../src/walk';
import { NetClient } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { lookContextOf } from '../src/net/lookGate';
import { BAKED_LOADOUT, kitRecords } from '../src/loadout';
import { shortTurn } from '../src/yaw';
import { PROTOCOL_VERSION, type ServerEvent } from '../src/net/protocol';
import { Play } from '../src/play';
import { VictoryPage } from '../src/victory';
import type { VictoryData } from '../src/victoryData';

/**
 * Research 303 with NET-LOOK's gate live (OT.R38): the VICTORY DANCE asked through the page's own `VictoryPage`, taken
 * by the loopback room, played on the page's real `WalkMode` and on the room's mover -- the clip's root travel along a
 * facing the look gate turns slowly (under the 0.1 cut) lands the page where the room has it, frame for frame, and the
 * facing never parts; a turn past the cut ends the dance on both at once.
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

/** A synthetic dance (no disc): 85 keys whose root walks 0.4 units a key along X and swings along Z. */
function danceClip(): MotionClip {
  const n = 85, t = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { t[3 * i] = 0.4 * i; t[3 * i + 2] = 3 * Math.sin(i / 9); }
  return { name: 'victory_funky', version: 5, duration: n / 30, frameCount: n, rate: 30, unknown10: -1, unknown14: 1, parts: [{ name: 'skel_root', translations: t }] } as unknown as MotionClip;
}
const VICTORY: VictoryData = {
  missing: [],
  variants: [{ name: 'victory_funky', weight: 1, clip: danceClip(), motion: { playback: 2.5, looped: false, noFire: 1 } as VictoryData['variants'][number]['motion'] }],
};
const LOADED = () => ({ path: 'RUN/MP99.ZDB', name: 'FLAT', ground: ground(), slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [], victory: VICTORY });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

class Seat {
  send(): void {}
  close(): void {}
}

async function rig() {
  const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false, random: () => 0.5 });
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
  const victory = new VictoryPage({ client: () => client, map: () => ({ victory: VICTORY }), play: new Play(), walk, release: () => {} });
  const heard: ServerEvent[] = [];
  client.on((ev) => { heard.push(ev); victory.event(ev); });
  await flush();
  const run = async (n: number, each?: () => void): Promise<void> => {
    for (let i = 0; i < n; i++) { each?.(); fly.update(1 / 60); walk.frame(1 / 60); match.step(); await flush(); }
  };
  await run(60);
  // The other side's seat, dead within reach: the corpse the room offers the dance at.
  const room = match.room;
  room.hello(99, new Seat(), { type: 'hello', version: PROTOCOL_VERSION, name: 'Other', map: 'MP99' });
  room.text(99, { type: 'ready' });
  await run(30);
  const player = room.player(client.id)!, other = room.player(99)! as unknown as { team: string; alive: boolean; diedAt: number; sim: typeof player.sim };
  other.team = player.team === 'seal' ? 'terrorist' : 'seal';       // the fixture's: the corpse an enemy's
  const at = player.sim.walker.state;
  Object.assign(other.sim.walker.state, { x: at.x, y: at.y, z: at.z + 20 });
  other.alive = false; other.diedAt = room.tick;
  await run(2);
  /** The page's mover against the room's, after the room ran the page's newest command. */
  const apart = () => {
    const page = walk['walker']!.state, rs = player.sim.walker.state;
    return { place: Math.hypot(page.x - rs.x, page.z - rs.z), yaw: Math.abs(shortTurn(rs.yaw, page.yaw)) };
  };
  return { fly, walk, match, player, run, victory, heard, apart };
}

describe('the VICTORY DANCE under the look gate (research 303, OT.R38)', () => {
  it("a slow turn while it plays: the page's mover stands and faces where the room's does, every frame; a fast turn cuts both", async () => {
    const r = await rig();
    expect(r.victory.state().offer).toBe('available');
    expect(r.victory.fire()).toBe(true);
    await r.run(2);
    expect(r.heard.some((e) => e.type === 'victory' && e.clip === 'victory_funky')).toBe(true);
    expect(r.walk.victoryMotionActive()).toBe(true);
    expect(r.player.sim.walker.victoryMotion).not.toBeNull();
    const start = { ...r.player.sim.walker.state };
    // 0.05 degrees a frame (3 deg/s): within the stick's law and under 0.1 of turn_maxrate (11.5 deg/s), so it plays on.
    let worstPlace = 0, worstYaw = 0, yaw = r.fly.pose().yaw;
    for (let i = 0; i < 90; i++) {
      await r.run(1, () => { yaw += 0.05; r.fly.setPose({ yaw }); });
      const d = r.apart();
      worstPlace = Math.max(worstPlace, d.place); worstYaw = Math.max(worstYaw, d.yaw);
      expect(r.walk.victoryMotionActive()).toBe(r.player.sim.walker.victoryMotion !== null);
    }
    expect(r.player.sim.walker.victoryMotion).not.toBeNull();         // still dancing: the slow turn did not cut it
    expect(Math.hypot(r.player.sim.walker.state.x - start.x, r.player.sim.walker.state.z - start.z)).toBeGreaterThan(10);   // the root moved it
    expect(Math.abs(shortTurn(start.yaw, r.player.sim.walker.state.yaw))).toBeGreaterThan(3);   // and the look did turn
    expect(worstYaw).toBeLessThan(1e-6);
    expect(worstPlace).toBeLessThan(0.01);
    // A turn past the cut: the gate turns at the stick's rate, past 0.1 of turn_maxrate -- both movers drop the dance.
    await r.run(1, () => { r.fly.setPose({ yaw: yaw + 60 }); });
    await r.run(2);
    expect(r.player.sim.walker.victoryMotion).toBeNull();
    expect(r.walk.victoryMotionActive()).toBe(false);
    expect(r.apart().yaw).toBeLessThan(1e-6);
    await r.run(3);
    expect(r.heard.filter((e) => e.type === 'victory').at(-1)).toMatchObject({ clip: null });
  });
});
