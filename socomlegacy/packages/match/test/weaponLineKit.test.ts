import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  arsenalOf, DEFAULT_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type KitTable, type Loadout, type MapArsenal,
  type SpawnSlot, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, type ClientEvent, type Command, type SimKits, type SimMap } from '../../viewer/src/sim';
import { WEAPON_LINE_LENGTH_READING, WEAPON_LINE_M4A1_SD_PROVEN } from '../../viewer/src/weaponLine';
import { Room, type Conn } from '../src/room';

/**
 * SEGMENT-BODY part 4, fresh review 1's F1: the weapon line's length is the held weapon's (`FUN_0054e8f0`: the hand byte
 * `+0xf79` picks the kit's entry at `actor+0x388`, D:L416869-416870, its model's x extent twice, D:L416892-416902), so the
 * room's body casts the line its kit holds -- not the M4A1 SD's for every kit. The lengths are the disc's table
 * (`WEAPON_LINE_LENGTH_READING`, `WEAP_GEO`'s bounds): the MP5's 16.0, the Barrett's 28.5, the M4A1 SD's 22.93 between.
 * A synthetic map and a hand-built arsenal (the repository's convention: no disc); the item ids are made up, the model
 * names the disc's `WEAP_GEO` names.
 */

const MP5 = 'mp5', BARRETT = 'barretm82A1';

/** An appflags-4 crate 14 tall: its south face the plane z = 0 from x -80 to 80, facing +z; the spawns far off. */
function crateMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const quad = (pts: number[], ditype: number, appflags = 0): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
  });
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
  const polys = [
    floor(-1000, -1000, 1000, 1000, 0),
    quad([-80, 0, 0, 80, 0, 0, 80, 14, 0, -80, 14, 0], 2, 4), quad([80, 0, -40, -80, 0, -40, -80, 14, -40, 80, 14, -40], 2, 4),
    quad([-80, 0, -40, -80, 0, 0, -80, 14, 0, -80, 14, -40], 2, 4), quad([80, 0, 0, 80, 0, -40, 80, 14, -40, 80, 14, 0], 2, 4),
    floor(-80, -40, 80, 0, 14),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, 400 + i * 50), slot(1, i, 400, 400 + i * 50)]);
  return { stem: 'MP99', name: 'CRATE', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, model: string): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '9mm'])]], ['ModelName', model], ['IconTextureName', `${name}_icon.tif`],
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '9mm'], ['ID', '8'])],
  'ZWEAPON', [weapon('MP5', 70, MP5), weapon('BARRETT', 90, BARRETT), weapon('Mark 23', 15, 'a_mark23'), weapon('M67', 121, 'grenade')],
];
const rifle = (name: string, id: number): WeaponRecord => ({ ...DEFAULT_RIFLE, name, id });
const table: KitTable = {
  arsenal: arsenalOf(zweapon),
  records: new Map([[70, rifle('MP5', 70)], [90, rifle('BARRETT', 90)], [15, HELD_SIDEARM]]),
  rounds: new Map(),
};
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
function kits(sealPrimary: number): SimKits {
  const map: MapArsenal = {
    valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: {
      seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: kit(sealPrimary, 15, 121, 121, 121) }],
      terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: kit(70, 15, 121, 121, 121) }],
    },
  };
  return { table, map };
}

class Client implements Conn {
  send(): void {}
  close(): void {}
}

/** A classic room with a Terrorist (1) and a SEAL (2) holding `sealPrimary`; the SEAL stood `out` u square from the face. */
function standOff(sealPrimary: number, out: number) {
  let seed = 1;
  const room = new Room(crateMap(), null, { now: () => 0, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, rules: 'classic', launchCountdownS: 0 }, null, kits(sealPrimary));
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
  room.step();
  const p = room.player(2)!;
  expect(p.alive).toBe(true);
  expect(p.loadout[0]).toBe(sealPrimary);
  const w = p.sim.walker;
  expect(w.place(0, 5, out)).toBe(true);
  w.state.yaw = 0;                                             // facing -z, square to the face
  let seq = p.sim.seq;
  for (let i = 0; i < 5; i++) {
    const cmd: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    room.step();
  }
  return room.player(2)!.sim.walker;
}

describe('F1: the room\'s body casts the weapon line its kit holds (FUN_0054e8f0 D:L416869-416870, D:L416892-416902)', () => {
  it('the lengths straddle the M4A1 SD\'s: the MP5 16.0 under 18, the Barrett 28.5 over 26 (the disc\'s table)', () => {
    expect(WEAPON_LINE_LENGTH_READING[MP5]).toBeCloseTo(16.0, 3);
    expect(WEAPON_LINE_LENGTH_READING[BARRETT]).toBeCloseTo(28.5052, 3);
    expect(WEAPON_LINE_LENGTH_READING[MP5]!).toBeLessThan(18);
    expect(WEAPON_LINE_M4A1_SD_PROVEN).toBeGreaterThan(18);
    expect(WEAPON_LINE_M4A1_SD_PROVEN).toBeLessThan(26);
    expect(WEAPON_LINE_LENGTH_READING[BARRETT]!).toBeGreaterThan(26);
  });

  it('an MP5 kit standing 18 u square from a crate forms no stored contact', () => {
    const w = standOff(70, 18);
    expect(w.heldModels.rifle).toBe(MP5);
    expect(w.storedContact()).toBeNull();
  });

  it('a Barrett kit standing 26 u square from a crate forms one, on the face', () => {
    const w = standOff(90, 26);
    expect(w.heldModels.rifle).toBe(BARRETT);
    const c = w.storedContact();
    expect(c).not.toBeNull();
    expect(c!.z).toBeCloseTo(0, 3);
  });
});
