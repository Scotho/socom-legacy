import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type SimMap } from '../../viewer/src/sim';
import type { SimKits } from '../../viewer/src/loadout';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';

/**
 * BTL.R2 (BOTS-LAND, the merge controller, 2026-10-24; OT.R81): a bot reads an enemy's exact state only past the line of
 * sight a player's view would pass, or by hearing within its adaptation's range. Without either it knows nothing of
 * them -- no wall knowledge a player lacks. An enemy in range and in the bot's field of view but behind a wall, standing
 * still and silent, gives no target and no memory; the same enemy with the wall gone is seen.
 */
function scene(wall: boolean, humanAt: [number, number, number] = [50, 0, 0], platform = 0) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 300, cellsX: 4, cellsZ: 4, originX: -600, originZ: -600 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-600, 0, -600, 600, 0, -600, 600, 0, 600, -600, 0, 600]) };
  // A full-height wall across x 250, between the human (x 50) and the bot (x 450).
  const polys = wall ? [floor, { ...floor, path: 'worldmodel/wall', ditype: 2, points: Float32Array.from([250, 0, -600, 250, 120, -600, 250, 120, 600, 250, 0, 600]) }] : [floor];
  // A ledge `platform` units up under the human (its floor), for the camera's vertical half-angle; its near edge 6 units
  // past the human, so the line from the bot's eye to the chest clears it and only the view's half-angle can hide him.
  if (platform > 0) polys.push({ ...floor, path: 'worldmodel/ledge', points: Float32Array.from([humanAt[0] - 20, platform, -20, humanAt[0] + 6, platform, -20, humanAt[0] + 6, platform, 20, humanAt[0] - 20, platform, 20]) });
  const ground = packGround(params, polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 })));
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 450 : 50, 0, index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'VISION TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 255, 255, 255] as const;
  const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] },
    records: new Map([[HELD_RIFLE.id, HELD_RIFLE], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map() },
  map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
  let now = 0;
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' },
    '', { host: true, side: 'seal' })).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: Array.from({ length: 41 }, (_, i) => ({
    at: [450 + (i - 20) * 2, 0, i * 10 - 200], edges: [i - 1, i + 1].filter((n) => n >= 0 && n < 41), component: 0 })) };
  const bots = new MatchBots(room, { random: () => 0.5, navigation, kits, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 1 });
  const id = bots.botIds()[0]!;
  room.launch(0);
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  const human = room.player(1)!, bot = room.player(id)!;
  // Before any perception: the human stands still facing away (no footsteps, no shots); the bot faces -x, toward x 50.
  human.sim.walker.place(...humanAt); human.sim.walker.state.yaw = 270;
  bot.sim.walker.place(450, 0, 0); bot.sim.walker.state.yaw = 90;
  step();
  return { room, bots, id, step, human };
}

describe('BTL.R2: a bot sees through no wall', () => {
  it('an enemy in range and in view behind a wall, silent: no target and no memory', () => {
    const r = scene(true);
    for (let tick = 0; tick < 3 * TICK_HZ; tick++) {
      r.human.sim.walker.place(50, 0, 0);
      r.step();
      const a = r.bots.stats().actors[0]!;
      expect(a.target, `tick ${tick}`).toBeNull();
      expect(a.lastKnown, `tick ${tick}`).toBeNull();
    }
  });

  // Area (a)'s re-read 1: a player's view is the map camera's (`cameras/camera`'s fov (0.6109 0.4276), half-angles: 70
  // degrees across); a bot's may be no wider. An enemy 60 degrees off the bot's facing, in the open, is out of view.
  it('an enemy 60 degrees off its facing, no wall, silent: not seen (the 70-degree view a player has)', () => {
    const at: [number, number, number] = [450 - 200 * Math.cos(Math.PI / 3), 0, 200 * Math.sin(Math.PI / 3)];
    const r = scene(false, at);
    for (let tick = 0; tick < 3 * TICK_HZ; tick++) {
      r.human.sim.walker.place(...at);
      r.step();
      expect(r.bots.stats().actors[0]!.target, `tick ${tick}`).toBeNull();
    }
  });

  // The narrow check's 7: the camera's vertical half-angle (24.5 degrees, `cameras/camera`'s 0.4276) against the bot's pitch.
  it('an enemy on a ledge about 40 degrees above its resting look is not seen; the same enemy level with it is', () => {
    for (const [height, seen] of [[84, false], [0, true]] as const) {
      const at: [number, number, number] = [350, height, 0];
      const r = scene(false, at, height);
      let sighted = false;
      for (let tick = 0; tick < 3 * TICK_HZ && !sighted; tick++) { r.human.sim.walker.place(...at); r.step(); sighted = r.bots.stats().actors[0]!.target === 1; }
      expect(sighted, `ledge ${height}`).toBe(seen);
    }
  });

  it('the same enemy with no wall between them is seen', () => {
    const r = scene(false);
    let seen = false;
    for (let tick = 0; tick < 3 * TICK_HZ && !seen; tick++) { r.human.sim.walker.place(50, 0, 0); r.step(); seen = r.bots.stats().actors[0]!.target === 1; }
    expect(seen).toBe(true);
  });
});
