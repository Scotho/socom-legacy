import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type GridParams, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Button, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { encodeCommands } from '../../viewer/src/net/codec';
import type { SimKits } from '../../viewer/src/loadout';
import { SHOTGUN_PELLET_RANGE_SQ } from '../../viewer/src/net/damage';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { BotPlan, type BotObservation } from '../src/bots/botPlan';
import type { NavigationData } from '../src/bots/navigation';
import { seatAtSlots } from './helpers/slotPoses';

/** Synthetic fixtures test authored engagement preferences through native Room inputs, not retail AI parity. */
const shotgun: WeaponRecord = { ...HELD_RIFLE, id: 81, name: 'TEST PELLET WEAPON', pellets: 4,
  fireModes: [1], magazine: 12, mags: 3, impactDamage: 0.01 };
const preference = Math.sqrt(SHOTGUN_PELLET_RANGE_SQ.base);
function setup(pellet = true, opening = false, squad = false) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 300, cellsX: 4, cellsZ: 4, originX: -600, originZ: -600 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-600, 0, -600, 600, 0, -600, 600, 0, 600, -600, 0, 600]) };
  const polys = [floor];
  if (squad) polys.push({ ...floor, path: 'worldmodel/low-wall', ditype: 2,
    points: Float32Array.from([0, 0, -50, 0, 12, -50, 0, 12, 50, 0, 0, 50]) });
  const ground = packGround(params, polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 })));
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? squad ? 120 : 300 : squad ? -20 : 50, 0, index * 30], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'WEAPON PREFERENCE TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const primary = pellet ? shotgun : { ...HELD_RIFLE, impactDamage: 0.01 };
  // The synthetic squad kit carries a pellet record in its second input slot so switching needs no record mutation.
  const pistol = squad ? shotgun : { ...HELD_SIDEARM, impactDamage: 0.01 };
  const loadout = [primary.id, pistol.id, 255, 255, 255] as const;
  const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] },
    records: new Map([[primary.id, primary], [pistol.id, pistol]]), rounds: new Map() },
  map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
  const nodes: NavigationData['nodes'] = [];
  for (let x = 0; x < 45; x++) for (let z = 0; z < 21; z++) nodes.push({ at: [10 + x * 10, 0, -100 + z * 10], component: 0,
    edges: [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]].filter(([a, b]) => a! >= 0 && a! < 45 && b! >= 0 && b! < 21).map(([a, b]) => a! * 21 + b!) });
  let now = 0;
  const events: ServerEvent[] = [];
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5, combatReport: true }, null, kits);
  room.hello(1, { send: (f) => { if (typeof f === 'string') events.push(JSON.parse(f)); }, close: () => {} },
    { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' }, '', { host: true, side: 'seal' });
  const bots = new MatchBots(room, { random: () => 0.5, navigation: { version: 2, map: 'MP99', nodes }, kits,
    teamProfile: { seal: [], terrorist: opening ? [{ lane: 'fixture-hold', roles: ['hold'], via: [], goals: [[300, 0, 0]] }] : [] } });
  bots.setRoster({ seal: 0, terrorist: squad ? 2 : 1 });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  room.launch(0); step();
  seatAtSlots(room);                                           // H315: a respawn room; the scene's poses are the slots'
  const [id, supporter] = bots.botIds() as [number, number];
  if (squad) {
    room.player(id)!.sim.walker.place(120, 0, 0);
    room.player(supporter)!.sim.walker.place(40, 0, 30);
    while (room.player(id)!.mags[0].rounds() > 3) room.player(id)!.mags[0].fire();
  }
  const selectSecondary = (seat: number) => {
    const p = room.player(seat)!;
    // Stage an exhausted primary through its ring API; the bot will retain the secondary after the fixture swap.
    do { while (p.mags[0].fire()) { /* consume each carried magazine */ } } while (p.mags[0].reload());
    for (let tick = 0; tick < 2 * TICK_HZ; tick++) {
      const s = p.sim.walker.state;
      room.binary(seat, encodeCommands({ viewTick: room.tick, commands: [{ seq: p.sim.seq + 1, forward: 0, right: 0,
        yaw: s.yaw, pitch: s.pitch, turn: 0, buttons: p.sim.weapon === 0 ? Button.Swap : 0, stance: 0, weapon: 1 }] }));
      now += 1000 / TICK_HZ; room.step();
      if (p.sim.weapon === 1 && !p.sim.walker.swapProgress()) return;
    }
    throw new Error('fixture secondary swap did not finish through Room commands');
  };
  return { room, bots, id, supporter, events, step, selectSecondary };
}

describe('held-weapon engagement preference', () => {
  for (const opening of [false, true]) it(`closes a visible pellet contact before spending ammunition${opening ? ' from an opening hold' : ''}`, () => {
    const r = setup(true, opening), p = r.room.player(r.id)!, start = p.sim.walker.state.x, total = p.mags[0].total();
    let approaching = false, fired = false;
    for (let tick = 0; tick < 20 * TICK_HZ; tick++) {
      const before = r.events.length; r.step();
      const actor = r.bots.stats().actors[0]!, gap = Math.hypot(actor.feet[0]! - 50, actor.feet[1]!, actor.feet[2]!);
      if (actor.planning.action === 'approach' && actor.target === 1) approaching = true;
      const shots = r.events.slice(before).filter((e) => e.type === 'shot' && e.id === r.id);
      if (gap > preference + 1) expect(shots, `no pellet waste at gap ${gap}`).toHaveLength(0);
      if (shots.length) { fired = true; break; }
    }
    expect(approaching).toBe(true);
    expect(p.sim.walker.state.x).toBeLessThan(start - 100);
    expect(fired).toBe(true);
    expect(p.mags[0].total()).toBeLessThan(total);
    expect(r.events.some((e) => e.type === 'combat' && e.attacker?.id === r.id && e.status === 'applied')).toBe(true);
    expect(r.room.takeDrops()?.['look: turn'] ?? 0).toBe(0);
  });

  it('retains the rifle engagement distance and opening shot opportunity', () => {
    for (const opening of [false, true]) {
      const r = setup(false, opening);
      if (opening) r.room.player(1)!.sim.walker.place(-50, 0, 0);
      for (let tick = 0; tick < 3 * TICK_HZ && !r.events.some((e) => e.type === 'shot' && e.id === r.id); tick++) r.step();
      expect(r.events.some((e) => e.type === 'shot' && e.id === r.id)).toBe(true);
      expect(r.bots.stats().actors[0]!.planning.action).toBe('fire');
    }
  });

  for (const change of ['weapon', 'contact'] as const) it(`releases active suppression when the ${change} leaves the pellet preference`, () => {
    const r = setup(false, false, true);
    if (change === 'weapon') r.room.player(r.supporter)!.sim.walker.place(120, 0, 60);
    else r.selectSecondary(r.supporter);
    for (let tick = 0; tick < 3 * TICK_HZ && r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad.role !== 'supporter'; tick++) r.step();
    expect(r.bots.stats().actors.find((a) => a.id === r.supporter)!.squad.role, JSON.stringify(r.bots.stats().actors)).toBe('supporter');
    if (change === 'weapon') r.selectSecondary(r.supporter);
    expect(r.room.player(r.supporter)!.sim.weapon).toBe(1);
    expect(r.room.player(r.supporter)!.records[1].pellets).toBe(4);
    if (change === 'contact') r.room.player(1)!.sim.walker.place(-100, 0, 0);
    r.step(6); // Ordinary perception cadence must first observe the moved contact.
    const actor = r.bots.stats().actors.find((a) => a.id === r.supporter)!;
    expect(actor.target).toBe(1);
    expect(actor.squad).toMatchObject({ role: 'independent', partner: null, reason: 'not-ready' });
    expect(actor.planning.action).not.toBe('suppress');
    const before = r.events.length; r.step();
    expect(r.events.slice(before).some((e) => e.type === 'shot' && e.id === r.supporter)).toBe(false);
  });

  it('invalidates cached opening and support actions when the held preference becomes restricted', () => {
    const observation: BotObservation = { active: true, contact: true, visible: true, atContact: false, inRange: false, lane: true,
      loaded: true, needsReload: false, reloading: false, canReload: true, cover: false, protected: false, pressure: false,
      opening: true, pathFailed: false, contactKey: '1' };
    const opening = new BotPlan();
    expect(opening.update(observation).action).toBe('fire');
    expect(opening.update({ ...observation, rangeRestricted: true }).action).toBe('patrol');
    const support = new BotPlan();
    expect(support.update({ ...observation, opening: false, supporting: true }).action).toBe('suppress');
    expect(support.update({ ...observation, opening: false, supporting: true, rangeRestricted: true }).action).toBe('approach');
  });
});
