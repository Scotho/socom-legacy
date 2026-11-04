import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, DEFAULT_RIFLE, HELD_SIDEARM, type GridParams, type KitTable, type Loadout, type SpawnSlot, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Button, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type SimKits, type SimMap } from '../../viewer/src/sim';
import { decodeCommands } from '../../viewer/src/net/codec';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { NavigationData } from '../src/bots/navigation';
import { seatAtSlots } from './helpers/slotPoses';

/**
 * #481 review (S2 x B138's bots): a CREATE GAME equipment restriction leaves a CPU's primary absent (254, research 362
 * §2) and its first hand on the secondary (FUN_005c0250 D:L476054-476156). The CPU's weapon preference must not ask
 * the Room to swap to the absent slot -- the Room refuses it (`swapRefused`), the swap never finishes and the CPU never
 * fires. Synthetic fixtures (a hand-built arsenal, roomLoadout.test.ts' shape) through native Room inputs.
 */

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`],
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [weapon('M4A1', 54), weapon('552', 57), weapon('Mark 23', 15), weapon('M9', 5), weapon('F57', 4), weapon('M67', 121),
    weapon('AN-M8', 122), weapon('Mark141', 123), weapon('Spas 12', 81), weapon('JACKHAMMER', 83), weapon('Double Ammo Load', 194),
    weapon('M82A1', 101), weapon('M87', 103)],
];
const firearm = (base: WeaponRecord, name: string, id: number): WeaponRecord => ({ ...base, name, id, impactDamage: 0.01 });
const table: KitTable = {
  arsenal: arsenalOf(zweapon),
  records: new Map([[54, firearm(DEFAULT_RIFLE, 'M4A1', 54)], [57, firearm(DEFAULT_RIFLE, '552', 57)], [15, firearm(HELD_SIDEARM, 'Mark 23', 15)],
    [5, firearm(HELD_SIDEARM, 'M9', 5)], [4, firearm(HELD_SIDEARM, 'F57', 4)], [81, firearm(DEFAULT_RIFLE, 'Spas 12', 81)],
    [83, firearm(DEFAULT_RIFLE, 'JACKHAMMER', 83)], [101, firearm(DEFAULT_RIFLE, 'M82A1', 101)], [103, firearm(DEFAULT_RIFLE, 'M87', 103)]]),
  rounds: new Map(),
};
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;

function setup(eqLimit: number) {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 300, cellsX: 4, cellsZ: 4, originX: -600, originZ: -600 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-600, 0, -600, 600, 0, -600, 600, 0, 600, -600, 0, 600]) };
  const ground = packGround(params, [floor], [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }]);
  const slots: SpawnSlot[] = [0, 1].flatMap((side) => Array.from({ length: 8 }, (_, index) => ({ side, index,
    position: [side ? 300 : 50, 0, index * 30], onFloor: true, step: side ? 6 : 2,
    facing: side ? [-1, 0] : [1, 0], loc: { map: 0, x: 0, z: 0 } } as SpawnSlot)));
  const map: SimMap = { stem: 'MP99', name: 'EQUIPMENT LIMIT BOTS', ground, grid: groundGrid(ground), slots, respawns: [], spawns: null, notes: [] };
  const valves = new Map([['Enable_m4Acarbine', 1], ['Enablesig_commando', 8], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8],
    ['Enable_frag', 9], ['Enable_smoke', 9]]);
  const kits: SimKits = { table, map: { valves, selectable: { seal: [], terrorist: [] },
    kits: { seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: kit(54, 15, 121, 122, 255) }],
      terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: kit(57, 5, 121, 122, 255) }] } } };
  const nodes: NavigationData['nodes'] = [];
  for (let x = 0; x < 45; x++) for (let z = 0; z < 21; z++) nodes.push({ at: [10 + x * 10, 0, -100 + z * 10], component: 0,
    edges: [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]].filter(([a, b]) => a! >= 0 && a! < 45 && b! >= 0 && b! < 21).map(([a, b]) => a! * 21 + b!) });
  let now = 0;
  const events: ServerEvent[] = [];
  const room = new Room(map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5, combatReport: true, eqLimit }, null, kits);
  room.hello(1, { send: (f) => { if (typeof f === 'string') events.push(JSON.parse(f)); }, close: () => {} },
    { type: 'hello', version: PROTOCOL_VERSION, name: 'Tester', map: 'MP99' }, '', { host: true, side: 'seal' });
  const bots = new MatchBots(room, { random: () => 0.5, navigation: { version: 2, map: 'MP99', nodes }, kits, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 1 });
  const step = () => { now += 1000 / TICK_HZ; bots.step(); room.step(); };
  room.launch(0); step();
  seatAtSlots(room);
  const [id] = bots.botIds() as [number];
  // The CPU's own commands, as the Room receives them: a refused swap leaves the hand unchanged, so the request is read here.
  const commands: Command[] = [];
  const binary = room.binary.bind(room);
  room.binary = (seat, bytes) => { if (seat === id) commands.push(...decodeCommands(bytes).commands); return binary(seat, bytes); };
  const swapsTo = (absent: 0 | 1) => commands.filter((c) => (c.buttons & Button.Swap) !== 0 && c.weapon === absent).length;
  return { room, bots, id, events, step, swapsTo };
}

describe('CPU weapon preference under CREATE GAME equipment limits (research 362 §2)', () => {
  it('a pistol-only CPU keeps its secondary hand and fires it, never swapping to the absent primary', () => {
    const r = setup(1), p = r.room.player(r.id)!;
    expect(p.loadout[0]).toBe(254);
    expect(p.sim.weapon).toBe(1);
    for (let tick = 0; tick < 5 * TICK_HZ && !r.events.some((e) => e.type === 'shot' && e.id === r.id); tick++) r.step();
    expect(r.swapsTo(0)).toBe(0);
    const shot = r.events.find((e) => e.type === 'shot' && e.id === r.id) as Extract<ServerEvent, { type: 'shot' }> | undefined;
    expect(shot?.weapon).toBe(p.loadout[1]);
  });

  it('a shotgun-only CPU with an emptied shotgun keeps the shotgun hand, never swapping to the absent secondary', () => {
    const r = setup(2), p = r.room.player(r.id)!;
    expect(p.loadout[1]).toBe(254);
    expect(p.sim.weapon).toBe(0);
    do { while (p.mags[0].fire()) { /* consume each carried magazine */ } } while (p.mags[0].reload());
    for (let tick = 0; tick < 2 * TICK_HZ; tick++) r.step();
    expect(r.swapsTo(1)).toBe(0);
    expect(p.sim.weapon).toBe(0);
  });

  // Re-check 56220345d (non-blocking): EQlimit 3, snipers only -- a sniper inside the sidearm draw range
  // (`WEAPON_SWAP_ADAPTATION.sniperDrawSidearm`) has no sidearm to draw. Coverage added after the fix (no RED of its own).
  it('a sniper-only CPU inside the sidearm draw range keeps the sniper, never swapping to the absent secondary', () => {
    const r = setup(3), p = r.room.player(r.id)!;
    expect(p.loadout[0]).toBe(101);
    expect(p.loadout[1]).toBe(254);
    expect(p.sim.weapon).toBe(0);
    p.sim.walker.place(100, 0, 0);
    r.room.player(1)!.sim.walker.place(50, 0, 0);
    let targeted = false;
    for (let tick = 0; tick < 3 * TICK_HZ; tick++) { r.step(); if (r.bots.stats().actors[0]!.target === 1) targeted = true; }
    expect(targeted).toBe(true);                                            // the sniper rule's distance applies only with a target
    expect(r.swapsTo(1)).toBe(0);
    expect(p.sim.weapon).toBe(0);
  });
});
