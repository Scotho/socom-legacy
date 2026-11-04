import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { SimKits } from '../../viewer/src/loadout';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';
import { seatAtSlots } from './helpers/slotPoses';

/** Input-controller integration only. Synthetic geometry/low damage make action transitions observable. */
function setup(wall: boolean | 'low' = false, prepared = true, magazines = 8, magazine = 3) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 300, cellsX: 4, cellsZ: 4, originX: -600, originZ: -600 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-600, 0, -600, 600, 0, -600, 600, 0, 600, -600, 0, 600]) };
  const polys = [floor];
  if (wall) polys.push({ ...floor, path: 'worldmodel/wall', ditype: 2,
    points: Float32Array.from([0, 0, -600, 0, wall === 'low' ? 12 : 60, -600, 0, wall === 'low' ? 12 : 60, 600, 0, 0, 600]) });
  const ground = packGround(params, polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 })));
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 450 : 50, 0, index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'PLANNER TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const rifle = { ...HELD_RIFLE, magazine, mags: magazines, impactDamage: 0.01 };
  const pistol = { ...HELD_SIDEARM, impactDamage: 0.01 };
  const loadout = [rifle.id, pistol.id, 255, 255, 255] as const;
  const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] },
    records: new Map([[rifle.id, rifle], [pistol.id, pistol]]), rounds: new Map() },
  map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
  let now = 0;
  const events: ServerEvent[] = [];
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5, combatReport: true }, null, kits);
  const join = () => room.hello(1, { send: (f) => { if (typeof f === 'string') events.push(JSON.parse(f)); }, close: () => {} },
    { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' }, '', { host: true, side: 'seal' });
  expect(join()).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: Array.from({ length: 41 }, (_, i) => ({
    at: [50 + i * 10, 0, 0], edges: [i - 1, i + 1].filter((n) => n >= 0 && n < 41), component: 0 })) };
  if (!prepared) navigation.nodes = [];
  const bots = new MatchBots(room, { random: () => 0.5, navigation, kits, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 1 });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  const id = bots.botIds()[0]!;
  room.launch(0); step();
  seatAtSlots(room);                                           // H315: a respawn room; the scene's poses are the slots'
  return { room, bots, id, events, step, join };
}

describe('single bot planning through normal Room inputs', () => {
  it('approaches before firing, spends real ammunition and requests the accepted reload path', () => {
    // Product test adaptation: mobile fire can empty tiny fixture magazines before preferred range. Native capacity
    // keeps this approach -> fire -> reload sequence observable before a switch to the shorter-range pistol.
    const r = setup(false, true, 8, HELD_RIFLE.magazine), p = r.room.player(r.id)!, actions = new Set<string>();
    const start = p.sim.walker.state.x;
    let approachWithoutShot = false, reloaded = false;
    for (let tick = 0; tick < 20 * TICK_HZ; tick++) {
      r.step();
      const stats = r.bots.stats().actors[0]!;
      if (stats.planning.action) actions.add(stats.planning.action);
      if (stats.planning.action === 'approach' && stats.target === 1 && stats.lastShot < 0) approachWithoutShot = true;
      if (stats.planning.action === 'reload' && p.reloadUntil[p.sim.weapon] > p.ran) reloaded = true;
      if (reloaded && actions.has('fire')) break;
    }
    expect(approachWithoutShot).toBe(true);
    expect(p.sim.walker.state.x).toBeLessThan(start - 50);
    expect(actions).toContain('fire');
    expect(reloaded).toBe(true);
    expect(r.events.some((e) => e.type === 'shot' && e.id === r.id)).toBe(true);
    expect(r.events.some((e) => e.type === 'combat' && e.attacker?.id === r.id && e.status === 'applied')).toBe(true);
    expect(r.room.takeDrops()?.['look: turn'] ?? 0).toBe(0);
  });

  it('cancels fire and its stale approach on sight loss without tracking a silent hidden target', () => {
    const r = setup(true);
    r.room.player(r.id)!.sim.walker.place(450, 0, 0);
    r.room.player(1)!.sim.walker.place(50, 0, 0);
    r.step(30);
    expect(r.bots.stats().actors[0]!.target).toBe(1);
    expect(r.bots.stats().actors[0]!.planning.action).toBe('approach');
    const remembered = r.bots.stats().actors[0]!.lastKnown;
    r.room.player(1)!.sim.walker.place(-350, 0, 350);
    r.step(12);
    const lost = r.bots.stats().actors[0]!;
    expect(lost.target).toBeNull();
    expect(lost.lastKnown).toEqual(remembered);
    expect(lost.planning.goal).toBe('find-contact');
    expect(['investigate', 'search']).toContain(lost.planning.action);
    expect(lost.nextWaypoint?.[0] ?? 1).toBeGreaterThan(0);
    r.room.player(1)!.sim.walker.place(-500, 0, -500);
    r.step(30);
    expect(r.bots.stats().actors[0]!.lastKnown).toEqual(remembered);
    for (let tick = 0; tick < 10 * TICK_HZ && r.bots.stats().actors[0]!.planning.action !== 'search'; tick++) r.step();
    expect(r.bots.stats().actors[0]!.planning.action).toBe('search');
    expect(r.bots.stats().actors[0]!.lastKnown).toEqual(remembered);
    expect(r.bots.stats().actors[0]!.target).toBeNull();
  });

  it('cancels an unreachable visible approach instead of executing a stale route or predicted shot', () => {
    const r = setup(false, false), start = r.bots.stats().actors[0]!.feet;
    r.step(30);
    const failed = r.bots.stats().actors[0]!;
    expect(failed.target).toBe(1);
    expect(failed.planning).toMatchObject({ action: null, status: 'unreachable', reason: 'path-failed' });
    expect(failed.route).toBe(0);
    expect(failed.nextWaypoint).toBeNull();
    expect(failed.feet).toEqual(start);
    expect(r.events.some((e) => e.type === 'shot' && e.id === r.id)).toBe(false);
  });

  it('keeps crouched shelter through a native reload which consumes the last reserve magazine', () => {
    const r = setup('low', true, 2), bot = r.room.player(r.id)!;
    bot.sim.walker.place(30, 0, 0); r.room.player(1)!.sim.walker.place(-100, 0, 0);
    let started = false, emptied = false;
    for (let tick = 0; tick < 8 * TICK_HZ; tick++) {
      r.step();
      const stats = r.bots.stats().actors[0]!;
      if (stats.cover && bot.reloadUntil[0] <= bot.ran && !emptied) {
        while (bot.mags[0].fire()) { /* stage an empty carried magazine; the last reserve remains native */ }
        emptied = true;
      }
      if (bot.reloadUntil[0] > bot.ran && stats.cover) {
        started = true;
        expect(bot.mags[0].total()).toBe(bot.mags[0].rounds());
        r.step(5);
        expect(r.bots.stats().actors[0]!).toMatchObject({ planning: { action: 'reload' }, stance: 'crouch' });
        expect(bot.reloadUntil[0]).toBeGreaterThan(bot.ran);
        break;
      }
    }
    expect(started, JSON.stringify(r.bots.stats().actors[0])).toBe(true);
  });

  // H315: a respawn room -- the boundary after a death is the room's own respawn, not a classic round's end.
  it('clears active plans/routes after death and the respawn', () => {
    const r = setup(true), p = r.room.player(r.id)!;
    const originalBody = p.sim;
    r.step(20);
    expect(r.bots.stats().actors[0]!.planning.action).not.toBeNull();
    p.sim.walker.state.y += 500; p.sim.walker.setAirborne(true);
    r.step(4 * TICK_HZ);
    expect(p.alive).toBe(false);
    r.step();
    expect(r.bots.stats().actors[0]!).toMatchObject({ route: 0, target: null, lastKnown: null,
      planning: { goal: 'idle', action: null, plan: [] } });
    for (let i = 0; i < 20 * TICK_HZ && !p.alive; i++) r.step();
    expect(p.alive).toBe(true);
    expect(r.room.player(r.id)!.sim).not.toBe(originalBody);
    expect(r.bots.stats().actors[0]!.planning.plan).not.toContain('fire');
  });
});
