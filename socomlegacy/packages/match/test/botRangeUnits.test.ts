import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type GridParams, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type SimMap } from '../../viewer/src/sim';
import type { SimKits } from '../../viewer/src/loadout';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';

/**
 * BOTS-LAND area (a) review item 6: a weapon record's `maximumRange` is in metres (`Maximum_Range`; the room's own
 * reach is `maximumRange * UNITS_PER_METRE`, room.ts `ray`), while a bot's distances are world units. Its sighting range
 * (`perceive`) and its fire preference (`withinWeaponPreference`) compared the two unscaled: a rifle reaching 30 m
 * (300 units) held fire at 200 units. The sight range is the vision adaptation alone (a BTL decision, below).
 */
function scene(rifle: WeaponRecord, enemyX: number) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 400, cellsX: 6, cellsZ: 6, originX: -1200, originZ: -1200 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-1200, 0, -1200, 1200, 0, -1200, 1200, 0, 1200, -1200, 0, 1200]) };
  const ground = packGround(params, [floor], [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }]);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 450 : enemyX, 0, index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'RANGE TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const loadout = [rifle.id, HELD_SIDEARM.id, 255, 255, 255] as const;
  const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] },
    records: new Map([[rifle.id, rifle], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map() },
  map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
  let now = 0;
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' },
    '', { host: true, side: 'seal' })).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: Array.from({ length: 21 }, (_, i) => ({
    at: [450, 0, i * 10 - 100], edges: [i - 1, i + 1].filter((n) => n >= 0 && n < 21), component: 0 })) };
  const bots = new MatchBots(room, { random: () => 0.5, navigation, kits, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 1 });
  const id = bots.botIds()[0]!;
  room.launch(0);
  const step = () => { now += 1000 / TICK_HZ; bots.step(); room.step(); };
  step();
  const human = room.player(1)!, bot = room.player(id)!;
  const hold = () => { human.sim.walker.place(enemyX, 0, 0); human.sim.walker.state.yaw = 270; bot.sim.walker.place(450, 0, 0); };
  hold(); bot.sim.walker.state.yaw = 90;
  return { room, bots, id, step, hold };
}

describe('a weapon record\'s range is metres: a bot scales it to world units (review (a) 6)', () => {
  it('fires at 200 units with a rifle that reaches 30 m (300 units)', () => {
    const r = scene({ ...HELD_RIFLE, maximumRange: 30, impactDamage: 0.01 }, 250);
    let fired = false;
    for (let tick = 0; tick < 2 * TICK_HZ && !fired; tick++) { r.hold(); r.step(); fired = r.bots.stats().actors[0]!.lastShot >= 0; }
    expect(fired).toBe(true);
  });

  // The BTL decision that folded this item: sight is the vision adaptation alone (850 units), whatever the weapon reaches;
  // the RED's second case (a 100 m rifle sighting past it) was the unit fix's first form, withdrawn with it.
  it('sights by the vision bound alone: a 100 m rifle sights an enemy at 800 units, not at 950', () => {
    for (const [x, sighted] of [[450 - 800, true], [450 - 950, false]] as const) {
      const r = scene({ ...HELD_RIFLE, maximumRange: 100, impactDamage: 0.01 }, x);
      let seen = false;
      for (let tick = 0; tick < 2 * TICK_HZ && !seen; tick++) { r.hold(); r.step(); seen = r.bots.stats().actors[0]!.target === 1; }
      expect(seen, `enemy at ${450 - x}`).toBe(sighted);
    }
  });
});
