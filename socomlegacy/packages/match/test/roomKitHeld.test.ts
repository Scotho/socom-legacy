import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  arsenalOf, DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type KitTable, type Loadout,
  type MapArsenal, type SpawnSlot, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ, type ClientEvent, type ServerEvent, type SimKits, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * KIT-HELD (the player report "the loadout resets to the default M4 after death"): the front end's match page holds no
 * kit of its own after the lobby hands the match over -- the lobby ARMORY's choice went over the lobby's socket, the
 * account's stored record is applied by the server (`launchStored`) -- so its WEAPON EXCHANGE opened on the type's
 * default kit and its next confirm replayed from it, losing every lobby pick at the next spawn. The room tells the seat
 * what it holds -- its type, its picks (the list a confirm extends) and the kit they replay to -- as `kitHeld`, a unicast
 * of its own (never an unsolicited `loadout`: the page pairs those with its requests in order): at the launch, at the
 * page's `loaded` (the match page's own, after the hand-off), and after the welcome of a seat whose kept record restored
 * its picks. The original keeps the kit on the type across rounds and respawns (`FUN_0023e5e0` writes the type's kit,
 * `FUN_00599f00` rebuilds from it at each spawn; research 94 §A6, R94.3). Synthetic map and arsenal, as
 * `roomLoadout.test.ts` builds them.
 */

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, display = name.toUpperCase()): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', display], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`],
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [
    weapon('M4A1', 54), weapon('M4A1 SD', 62), weapon('552', 57, '552 COMMANDO'), weapon('AK-47', 58), weapon('Mark 23', 15),
    weapon('M9', 5), weapon('M67', 121), weapon('AN-M8', 122), weapon('HE', 126), weapon('C4', 151), weapon('Double Ammo Load', 194, '2X AMMO'),
  ],
];
const rifle = (name: string, id: number): WeaponRecord => ({ ...DEFAULT_RIFLE, name, id });
const table: KitTable = {
  arsenal: arsenalOf(zweapon),
  records: new Map([[54, rifle('M4A1', 54)], [62, HELD_RIFLE], [57, rifle('552', 57)], [58, rifle('AK-47', 58)], [15, HELD_SIDEARM], [5, { ...HELD_SIDEARM, name: 'M9', id: 5 }]]),
  rounds: new Map(),
};
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const valves = new Map([
  ['Enable_m4Acarbine', 1], ['Enable_M4A1_SD', 1], ['Enablesig_commando', 8], ['Enable_ak47', 8], ['Enable_Mark23', 1],
  ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 16 | 1], ['Enable_2xammo', 9],
]);
/** SEAL 1's own kit: the M4A1 (54), no suppressor -- the kit the report's players were sent back to. */
const SEAL_KIT = kit(54, 15, 121, 151, 194);
const map: MapArsenal = {
  valves, selectable: { seal: [], terrorist: [] },
  kits: {
    seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: SEAL_KIT }],
    terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: kit(57, 5, 121, 126, 255) }],
  },
};
const kits: SimKits = { table, map };

class Client implements Conn {
  cpu?: true;
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void {}
  types(): string[] { return this.events.map((e) => e.type); }
  held(): ServerEvent[] { return this.events.filter((e) => (e.type as string) === 'kitHeld'); }
}

const tok = (tab: number): string => `tab${tab}`.padEnd(22, '_');

function setup(opts: ConstructorParameters<typeof Room>[2] = {}) {
  const room = new Room(flatMap(), null, { now: () => 0, random: () => 0.5, rules: 'classic', heldLaunch: true, launchCountdownS: 0, ...opts }, null, kits);
  const join = (id: number, cpu = false): Client => {
    const c = new Client();
    if (cpu) c.cpu = true;
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(id) } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
    return c;
  };
  return { room, join };
}

/** The M4A1 SD (62) for SEAL 1's primary: the lobby ARMORY's pick, the kit it replays to. */
const SD_PICKS = [{ slot: 0, id: 62 }];
const SD_KIT = [62, 15, 121, 151, 194];

describe('KIT-HELD: the room tells the seat the kit it holds (kitHeld)', () => {
  it('at the launch: a lobby pick of a non-default primary is told to the seat, its type, picks and kit', () => {
    const s = setup();
    s.join(1);                                                          // a Terrorist
    const seal = s.join(2);                                             // SEAL 1
    expect(s.room.player(2)!.team).toBe('seal');
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);   // the lobby ARMORY's leaving
    expect(seal.held()).toEqual([]);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    expect(seal.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
  });

  it('at the page\'s `loaded` over the launch\'s hold: the match page, after the hand-off, is told it again', () => {
    const s = setup({ loadBarrierS: 30 });
    s.join(1);
    const seal = s.join(2);
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    const before = seal.held().length;
    s.room.text(2, { type: 'loaded' } as ClientEvent);
    expect(seal.held().length).toBe(before + 1);
    expect(seal.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
  });

  it('a seat whose kept record restores its picks is told them after its welcome', () => {
    const s = setup();
    s.join(1);
    s.join(2);
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    s.room.leave(2);
    const back = s.join(2);                                             // the same tab (its token): the record restored
    const types = back.types();
    expect(types).toContain('kitHeld');
    expect(types.indexOf('welcome')).toBeLessThan(types.indexOf('kitHeld'));
    expect(back.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
  });

  it('a promotion whose kept record restores its picks is told them after `promoted` (the review\'s F2)', () => {
    const s = setup();
    const c = new Map<number, Client>();
    for (let id = 1; id <= 16; id++) c.set(id, s.join(id));
    const seals = [...c.keys()].filter((id) => s.room.player(id)?.team === 'seal');
    const [x, y] = [seals[0]!, seals[1]!];
    s.room.text(x, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    s.room.leave(x);
    s.join(18);                                                         // the place taken again: the room full
    const back = s.join(x);                                             // the same tab, queued as a spectator
    expect(back.events.find((e) => e.type === 'welcome')).toMatchObject({ role: 'spectator' });
    expect(back.held()).toEqual([]);
    s.room.leave(y);                                                    // a SEAL's place: the queue's head promoted
    const types = back.types();
    expect(types).toContain('promoted');
    expect(types.indexOf('promoted')).toBeLessThan(types.indexOf('kitHeld'));
    expect(back.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
  });

  it('a CPU seat\'s controller is never told; the human seat beside it is (the review\'s F2)', () => {
    const s = setup({ rules: 'respawn' });
    const human = s.join(1);
    const cpu = s.join(2, true);
    expect(s.room.player(2)).toBeDefined();
    expect(s.room.player(1)!.team).not.toBe(s.room.player(2)!.team);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    s.room.text(2, { type: 'loaded' } as ClientEvent);
    expect(human.held()).toHaveLength(1);
    expect(cpu.held()).toEqual([]);
  });

  it('a spectator\'s `loaded` tells nothing: it holds no kit (the review\'s F2)', () => {
    const s = setup({ loadBarrierS: 30 });
    for (let id = 1; id <= 16; id++) s.join(id);
    const watcher = s.join(17);
    expect(watcher.events.find((e) => e.type === 'welcome')).toMatchObject({ role: 'spectator' });
    expect(s.room.launchStored(0, new Map())).toBe(true);
    s.room.text(17, { type: 'loaded' } as ClientEvent);
    expect(watcher.held()).toEqual([]);
  });

  it('LATER 726: a seat still loading at the hold\'s ceiling is told once at the pass, on its socket; its late `loaded` sends nothing', () => {
    const s = setup({ loadBarrierS: 30 });
    const terr = s.join(1);
    const seal = s.join(2);
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    s.room.text(1, { type: 'loaded' } as ClientEvent);                  // the Terrorist's page loaded; SEAL 1's still loading
    const [t0, s0] = [terr.held().length, seal.held().length];
    for (let i = 0; i < TICK_HZ * 30 - 1; i++) s.room.step();
    expect(seal.held().length).toBe(s0);                                 // short of the ceiling: nothing yet
    s.room.step();                                                       // the ceiling's tick: the pass
    expect(seal.held().length).toBe(s0 + 1);
    expect(seal.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
    expect(terr.held().length).toBe(t0);                                 // a seat that loaded is not told again
    for (let i = 0; i < TICK_HZ; i++) s.room.step();                    // the count, round 1
    expect(seal.held().length).toBe(s0 + 1);                            // once, never per tick
    const marks = [terr.events.length, seal.events.length];
    s.room.text(2, { type: 'loaded' } as ClientEvent);                  // after the ceiling: refused (ONL-18b), nothing sent
    expect([terr.events.length, seal.events.length]).toEqual(marks);
  });

  it('LATER 726: the ceiling tells the seat on its current socket -- a takeover over the hold, its new connection', () => {
    const s = setup({ loadBarrierS: 30 });
    s.join(1);
    const old = s.join(2);
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    s.room.text(1, { type: 'loaded' } as ClientEvent);
    const page = new Client();                                           // the same tab's newer connection (its token)
    s.room.hello(20, page, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) } as Extract<ClientEvent, { type: 'hello' }>, '192.0.2.2');
    const [o0, p0] = [old.held().length, page.held().length];
    for (let i = 0; i < TICK_HZ * 30; i++) s.room.step();
    expect(page.held().length).toBe(p0 + 1);
    expect(page.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
    expect(old.held().length).toBe(o0);
  });

  it('LATER 726, the mid-round reload (F2): a late-marked page is told at its `loaded`; an unmarked takeover only after its welcome', () => {
    const s = setup();
    s.join(1);
    s.join(2);
    s.room.text(2, { type: 'loadout', picks: SD_PICKS } as unknown as ClientEvent);
    expect(s.room.launchStored(0, new Map())).toBe(true);
    for (let i = 0; i < 10; i++) s.room.step();
    expect((s.room as unknown as { state: { phase: string } }).state.phase).toBe('play');
    // The old socket still held (the bridge's `late` the older seat's, cleared at its load): a takeover, told after its
    // welcome (the kept record's picks); its `loaded` lies outside a hold and is refused -- nothing sent.
    const took = new Client();
    s.room.hello(20, took, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) } as Extract<ClientEvent, { type: 'hello' }>, '192.0.2.2');
    expect(took.held()).toEqual([{ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT }]);
    const n = took.events.length;
    s.room.text(20, { type: 'loaded' } as ClientEvent);
    expect(took.events.length).toBe(n);
    // The old socket gone first (the bridge marks a launched game's new seat late, `bridge.ts` `late`): told at its welcome
    // and again at its `loaded`, the one the room accepts (`awaitingLoad`) -- the match page's own after the hand-off.
    s.room.leave(20);
    const back = new Client();
    s.room.hello(21, back, { type: 'hello', version: PROTOCOL_VERSION, name: 'P2', map: 'MP99', session: tok(2) } as Extract<ClientEvent, { type: 'hello' }>, '192.0.2.2', { late: true });
    const w = back.held().length;
    s.room.text(21, { type: 'loaded' } as ClientEvent);
    expect(back.held().length).toBe(w + 1);
    expect(back.held().at(-1)).toEqual({ type: 'kitHeld', team: 'seal', char: 0, picks: SD_PICKS, kit: SD_KIT });
  });

  it('a new seat with nothing kept is told nothing at its welcome (no list to overwrite the page\'s)', () => {
    const s = setup();
    s.join(1);
    const seal = s.join(2);
    expect(seal.held()).toEqual([]);
  });
});
