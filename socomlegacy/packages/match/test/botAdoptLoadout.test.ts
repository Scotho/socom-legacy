import { describe, expect, it } from 'vitest';
import { applyPicks, arsenalOf, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import type { SimKits } from '../../viewer/src/loadout';
import { Room, type Conn } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { botLoadout } from '../src/bots/armory';
import type { NavigationData } from '../src/bots/navigation';

/**
 * NPB-8 (docs/plans/2026-10-24-forge-npc-brains.md): a Forge NPC the brain adopts carries the kit a lobby bot of its role
 * is issued (`botLoadout`, through the room's own armory rules), on the character type it already holds -- so the two
 * places that run the one brain do not play with different weapons. Adaptation (the Forge's instrument): no original
 * behaviour is claimed; this pins the seam only.
 */
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
function flat(): SimMap {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]) };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }];
  const ground = packGround(PARAMS, [floor], owners);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 100 : -100, 0, -140 + index * 40], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  return { stem: 'MP99', name: 'ADOPT LOADOUT', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* no transport */ }
}

/** Kits as `botRolesIntegration` builds them: a frag, a smoke and a flash selectable on both sides, two characters a side. */
function kits(): SimKits {
  const ids = [62, 15, 121, 122, 123];
  const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', ids.map((id) => ['InternalName', [`fixture${id}`], 'DisplayName', [`ITEM ${id}`], 'ID', [String(id)], 'NumMags', ['3'], 'Ammo_Capacity', ['1']])]);
  const loadout = [HELD_RIFLE.id, HELD_SIDEARM.id, 255, 255, 255] as const;
  const column = (type: string) => ({ type, character: type.toLowerCase(), loadout });
  return { table: { arsenal, records: new Map([[HELD_RIFLE.id, HELD_RIFLE], [HELD_SIDEARM.id, HELD_SIDEARM]]), rounds: new Map() },
    map: { selectable: { seal: ids, terrorist: ids }, valves: new Map([['Enable_M4A1_SD', 9], ['Enable_Mark23', 9], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_flash', 9]]),
      kits: { seal: [column('S0'), column('S1')], terrorist: [column('T0'), column('T1')] } } };
}

function classicRoom(kit: SimKits | null) {
  let now = 0;
  const random = () => 0;
  const room = new Room(flat(), null, { rules: 'classic', heldLaunch: true, now: () => now, random }, null, kit);
  const hello = (id: number, side: 'seal' | 'terrorist', host: boolean, types?: Record<string, number>) =>
    room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', ...(types ? { types } : {}) }, '', { host, side });
  expect(hello(1, 'seal', true)).toBe(true);
  expect(hello(2, 'terrorist', false, { terrorist: 1 })).toBe(true);
  const navigation: NavigationData = { version: 2, map: 'MP99', nodes: [] };
  const bots = new MatchBots(room, { random, navigation, kits: kit });
  const step = (ticks = 1) => { for (let i = 0; i < ticks; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); } };
  return { room, bots, step };
}

describe('NPB-8: an adopted seat carries its role\'s kit, on the character it holds', () => {
  it('asks the armory for the role\'s picks and keeps the seat\'s own character type', () => {
    const kit = kits();
    const { room, bots, step } = classicRoom(kit);
    expect(room.player(2)!.nextChar, 'the seat holds the type its hello asked for').toBe(1);
    expect(bots.adopt(2)).toBeTypeOf('function');
    const role = bots.stats().actors[0]!.role;
    const want = botLoadout(kit, 'terrorist', () => 0, role, 1)!;
    expect(want.picks.length, 'the role has picks to make').toBeGreaterThan(0);
    expect(want.char).toBe(1);
    expect(room.player(2)!.nextChar).toBe(1);
    expect(room.launch(0)).toBe(true);
    step(2);
    const made = applyPicks(kit.table.arsenal, kit.map!.valves, 'terrorist', kit.map!.kits.terrorist[1]!.loadout, want.picks);
    expect('loadout' in made, 'the picks are legal').toBe(true);
    expect([...room.player(2)!.loadout]).toEqual('loadout' in made ? [...made.loadout] : []);
    expect(room.player(2)!.loadout.slice(2)).toContain(121);
    expect(room.player(2)!.char).toBe(1);
  });

  it('leaves a seat as it is where the room holds no kits', () => {
    const { room, bots, step } = classicRoom(null);
    const before = [...room.player(2)!.loadout];
    expect(bots.adopt(2)).toBeTypeOf('function');
    expect(room.launch(0)).toBe(true);
    step(2);
    expect([...room.player(2)!.loadout]).toEqual(before);
  });
});
