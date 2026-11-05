import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';
import { friendlyOnRay } from '../src/bots/shot';
import type { SimKits } from '../../viewer/src/loadout';
import { solidWalls } from './helpers/solidWalls';

/** Authored multiplayer-bot integration, no recovered retail AI claim. A synthetic room exercises the normal wire. */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
function flat(wall = false): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const polys = [floor];
  if (wall) polys.push({ ...floor, path: 'worldmodel/wall', ditype: 2,
    points: Float32Array.from([0, 0, -400, 0, 60, -400, 0, 60, 400, 0, 0, 400]) });
  // SEGMENT-BODY: each wall quad given its back face (`solidWalls`), a solid as a hull's is.
  const solid = solidWalls(polys);
  const owners: CollisionOwner[] = solid.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1 }));
  const ground = packGround(PARAMS, solid, owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'BOT TEST', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no transport */ }
}
function setup(options: ConstructorParameters<typeof Room>[2] = {}, map = flat(), kits: SimKits | null = null, randomOverride?: () => number) {
  let now = 0, seed = 1;
  const random = randomOverride ?? (() => { seed = seed * 16807 % 2147483647; return seed / 2147483647; });
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random, combatReport: true, ...options }, null, kits);
  const human = new Client();
  expect(room.hello(1, human, { type: 'hello', version: PROTOCOL_VERSION, name: 'Human', map: 'MP99' }, '', { host: true, side: 'seal' })).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
  const bots = new MatchBots(room, { random, navigation, kits });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  return { room, human, bots, step };
}

describe('authored multiplayer CPU seats on the authoritative Room', () => {
  it('seats named faction bots immediately, keeps existing IDs and caps the two sides at eight including humans', () => {
    const { bots, room } = setup();
    bots.setRoster({ seal: 8, terrorist: 8 });
    expect(bots.botIds()).toHaveLength(15);
    expect(room.lobby.players().filter((p) => p.team === 'seal')).toHaveLength(8);
    expect(room.lobby.players().filter((p) => p.team === 'terrorist')).toHaveLength(8);
    expect(bots.metadata()).toHaveLength(15);
    expect(new Set(bots.metadata().map((b) => b.name)).size).toBe(15);
    const ids = bots.botIds();
    bots.setRoster({ seal: 8, terrorist: 8 });
    expect(bots.botIds()).toEqual(ids);
    bots.setRoster({ seal: 0, terrorist: 1 });
    expect(bots.metadata()).toHaveLength(1);
    expect(bots.metadata()[0]!.team).toBe('terrorist');
    expect(ids).toContain(bots.botIds()[0]);
    bots.dispose();
    expect(room.lobby.players()).toHaveLength(1);
  });

  it('does not move before launch, then sends ordinary movement and accepted damaging fire with finite ammunition', () => {
    const { bots, room, human, step } = setup();
    bots.setRoster({ seal: 0, terrorist: 1 });
    const id = bots.botIds()[0]!, before = room.player(id)!.sim.seq;
    step(30);
    expect(room.player(id)!.sim.seq).toBe(before);
    expect(room.launch(0)).toBe(true);
    step();
    const bot = room.player(id)!;
    bot.sim.walker.place(100, 20, 0);
    room.player(1)!.sim.walker.place(0, 20, 0);
    const capacity = bot.mags[0].rounds();
    step(8 * TICK_HZ);
    const shots = human.events.filter((e) => e.type === 'shot' && e.id === id);
    expect(shots.length).toBeGreaterThan(0);
    expect(bot.sim.seq).toBeGreaterThan(before);
    expect(human.events.some((e) => e.type === 'combat' && e.status === 'applied' && e.attacker?.id === id)).toBe(true);
    expect(bot.mags[0].rounds()).toBeLessThan(capacity);
    expect(bot.records[0].id).toBe(HELD_RIFLE.id);
    expect(room.takeDrops()?.['look: turn'] ?? 0).toBe(0);
  });

  it('reconciles both teams before adding replacements and never leaves a CPU in a spectator queue', () => {
    const a = setup();
    a.bots.setRoster({ seal: 0, terrorist: 8 });
    a.bots.setRoster({ seal: 7, terrorist: 1 });
    expect(a.bots.metadata().filter((b) => b.team === 'seal')).toHaveLength(7);
    expect(a.bots.metadata().filter((b) => b.team === 'terrorist')).toHaveLength(1);
    const b = setup({ maxPlayers: 4 });
    b.bots.setRoster({ seal: 7, terrorist: 8 });
    expect(b.room.lobby.players()).toHaveLength(4);
    expect(b.room.lobby.spectators()).toHaveLength(0);
    expect(b.bots.botIds().every((id) => id < 240)).toBe(true);
    b.bots.setRoster({ seal: 0, terrorist: 3 });
    expect(b.bots.metadata().filter((bot) => bot.team === 'terrorist')).toHaveLength(3);
    expect(b.room.lobby.spectators()).toHaveLength(0);
  });

  it('passes the ordinary load barrier without counting the human as loaded', () => {
    const { bots, room, step } = setup({ loadBarrierS: 30 });
    bots.setRoster({ seal: 0, terrorist: 1 });
    room.launch(0);
    step(TICK_HZ);
    expect(room.roundRunning).toBe(false);
    room.text(1, { type: 'loaded' });
    step(TICK_HZ);
    expect(room.roundRunning).toBe(true);
  });

  it('hears nearby running through cover, keeps the last heard contact and cannot track a silent teleport', () => {
    const { bots, room, step } = setup({}, flat(true));
    bots.setRoster({ seal: 0, terrorist: 1 });
    room.launch(0); step();
    const human = room.player(1)!, id = bots.botIds()[0]!;
    human.sim.walker.place(-30, 0, 30);
    room.player(id)!.sim.walker.place(30, 0, 0);
    for (let i = 0; i < 60; i++) {
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: human.sim.seq + 1,
        yaw: human.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, forward: 1, right: 0 }] }));
      step();
    }
    const heard = bots.stats().actors[0]!;
    expect(heard.hunt).toBe(1);
    expect(heard.target).toBeNull();
    expect(heard.lastHeard?.kind).toBe('footstep');
    const contact = heard.lastKnown;
    human.sim.walker.place(-300, 0, 300);
    step(30);
    expect(bots.stats().actors[0]!.lastKnown).toEqual(contact);
    expect(bots.stats().actors[0]!.target).toBeNull();
  });

  it('requests a normal reload when its current magazine is empty', () => {
    const { bots, room, step } = setup({}, flat(true));
    bots.setRoster({ seal: 0, terrorist: 1 });
    room.launch(0); step(TICK_HZ);
    const p = room.player(bots.botIds()[0]!)!;
    while (p.mags[0].fire()) { /* stage an empty carried magazine */ }
    step(2);
    expect(p.mags[0].rounds()).toBe(p.records[0].magazine);
    expect(p.reloadUntil[0]).toBeGreaterThan(p.ran);
  });

  it('checks allies on a sampled miss beyond the raw metre range but within the actual world-unit trajectory', () => {
    const { bots, room, step } = setup();
    bots.setRoster({ seal: 1, terrorist: 0 });
    room.launch(0); step();
    const id = bots.botIds()[0]!, ally = room.player(1)!;
    ally.sim.walker.place(150, 0, 0);
    expect(friendlyOnRay(room, id, [0, 12, 0], [1, 0, 0], { maximumRange: 20 })).toBe(true);
    expect(friendlyOnRay(room, id, [0, 12, 0], [1, 0, 0], { maximumRange: 10 })).toBe(false);
    expect(friendlyOnRay(room, id, [0, 12, 0], [0, 0, 1], { maximumRange: 20 })).toBe(false);
    ally.sim.walker.place(150, 0, 80);
    expect(friendlyOnRay(room, id, [0, 12, 0], [1, 0, 0], { maximumRange: 20 })).toBe(false);
  });

  it('exhausts its rifle through accepted fire, then fires and reloads the pistol from its real remaining magazines', () => {
    // Small, low-damage synthetic records let one living target witness the complete ammunition transition.
    const rifle: WeaponRecord = { ...HELD_RIFLE, magazine: 2, mags: 1, impactDamage: 0.1 };
    const pistol: WeaponRecord = { ...HELD_SIDEARM, magazine: 2, mags: 2, impactDamage: 0.1 };
    const loadout = [rifle.id, pistol.id, 255, 255, 255] as const;
    const kits: SimKits = { table: { arsenal: { items: new Map(), byName: new Map(), order: [] }, records: new Map([[rifle.id, rifle], [pistol.id, pistol]]), rounds: new Map() },
      map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
        kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] } } };
    const { bots, room, step, human } = setup({}, flat(), kits, () => 0.5);
    bots.setRoster({ seal: 0, terrorist: 1 });
    room.launch(0); step();
    const id = bots.botIds()[0]!, bot = room.player(id)!;
    bot.sim.walker.place(100, 0, 0); room.player(1)!.sim.walker.place(0, 0, 0);
    let reloaded = false;
    for (let i = 0; i < 20 * TICK_HZ; i++) {
      step();
      const pistolShots = human.events.filter((e) => e.type === 'shot' && e.id === id && e.weapon === pistol.id);
      if (pistolShots.length >= 2 && bot.reloadUntil[1] > bot.ran && bot.mags[1].rounds() === pistol.magazine) {
        reloaded = true; break;
      }
    }
    expect(bot.mags[0].total()).toBe(0);
    expect(reloaded).toBe(true);
    expect(bot.sim.weapon).toBe(1);
    expect(human.events.some((e) => e.type === 'combat' && e.status === 'applied' && e.weapon === pistol.id && (e.rawDamage ?? 0) > 0
      && (e.damageApplied > 0 || e.armourBefore?.some((before, i) => before > (e.armourAfter?.[i] ?? before))))).toBe(true);
    step(10);
    expect(bot.sim.weapon).toBe(1);
  });

  it('retains ownership through native side swaps and team switches, then disposes every CPU seat', () => {
    const { bots, room } = setup();
    bots.setRoster({ seal: 2, terrorist: 3 });
    expect(room.swapSides()).toBe(true);
    bots.setRoster({ seal: 2, terrorist: 3 });
    expect(bots.metadata()).toHaveLength(5);
    expect(room.lobby.players()).toHaveLength(6);
    for (const bot of bots.metadata()) expect(room.lobby.member(bot.id)?.team).toBe(bot.team);
    const switched = bots.botIds()[0]!;
    expect(room.switchTeam(switched)).not.toBeNull();
    bots.setRoster({ seal: 2, terrorist: 3 });
    expect(room.lobby.players()).toHaveLength(6);
    for (const bot of bots.metadata()) expect(room.lobby.member(bot.id)?.team).toBe(bot.team);
    bots.dispose();
    expect(room.lobby.players().map((p) => p.id)).toEqual([1]);
    expect(room.lobby.spectators()).toHaveLength(0);
  });
});
