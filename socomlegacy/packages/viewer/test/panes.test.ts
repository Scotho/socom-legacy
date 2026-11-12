// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { polygonNormal, segmentHits, type CollisionOwner, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { forkGround, GLASS_FRAGMENTS_PLACEHOLDER, SCENE_DEATH_ON_WIRE_READING, SCENE_SOUND_PLACE_READING, WorldState } from '../src/worldState';
import { DoorSet, type DoorSpec } from '../src/doors';
import { groundGrid, packGround, Walker, type GroundData, type WalkInput } from '../src/mover';
import type { MapInitial, MapMeta } from '../src/mapMeta';
import type { SceneDestructible, SceneProgram } from '../src/sceneHealth';

/**
 * SUP-02 (research 210 s6; research 176 s4.1): Frostfire's breakable panes in miniature, no game data. A door hinged at
 * the origin whose leaf is a narrow `door_slab` strip (x 0..4) and its `pane1` (x 4..24, 40 high) -- both door-leaf
 * owners (`CollisionOwner.sweep`), turned in place by the `DoorSet` -- and a second slab's pane standing apart (z 100),
 * as Frostfire's three placements each carry their own. `door_slab` calls `breakapane`, which plays `.GLS_BRK_VSMALL`,
 * emits `DESTRUCTION_SOURCE` and turns its root `pane1` off, as the disc's do (research 209 s13).
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
const SLAB = 'worldmodel/door/door1=door1/door_slab', PANE = `${SLAB}/pane1`;
const SLAB_B = 'worldmodel/door_b/door1=door1/door_slab', PANE_B = `${SLAB_B}/pane1`;
const SWEEP = { minX: -24, maxX: 24, minZ: -24, maxZ: 24 };
const quad = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
});
const POLYS: WorldPoly[] = [
  quad('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  quad(SLAB, 2, [0, 0, 0, 4, 0, 0, 4, 40, 0, 0, 40, 0]),
  quad(PANE, 2, [4, 0, 0, 24, 0, 0, 24, 40, 0, 4, 40, 0]),
  quad(PANE_B, 2, [4, 0, 100, 24, 0, 100, 24, 40, 100, 4, 40, 100]),
];
const PLACED = ['worldmodel/floor', 'worldmodel/door', 'worldmodel/door/door1=door1', SLAB, PANE,
  'worldmodel/door_b', 'worldmodel/door_b/door1=door1', SLAB_B, PANE_B];

function hull(): GroundData {
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS },
    { modelName: 'worldmodel', path: SLAB, first: 1, count: 1, flags: FLAGS, sweep: SWEEP },
    { modelName: 'worldmodel', path: PANE, first: 2, count: 1, flags: FLAGS, sweep: SWEEP },
    { modelName: 'worldmodel', path: PANE_B, first: 3, count: 1, flags: FLAGS },
  ];
  return packGround(params, POLYS, owners);
}

/** `door_slab` as Frostfire's: `CALL_ANIMATION breakapane` (research 209 s13). */
const doorSlab: EffectProgram = { name: 'door_slab', root: 1, flags: 0x23, nodes: ['NA', 'door_slab', 'pane1'], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'call', anim: 'breakapane' }] }] };
/** `breakapane`: its sound, its debris source and its root off, all at its root (`NODE_ROOT`, -7). */
const breakapane: SceneProgram = {
  search: [0, 0],
  program: {
    name: 'breakapane', root: 1, flags: 0x20, nodes: ['NA', 'pane1'],
    sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'sound', sound: '.GLS_BRK_VSMALL', node: -7, volume: 1, newPlay: true },
      { op: 'destruction', node: -7 },
      { op: 'active', node: -7, on: false },
    ] }],
  },
};

function meta(): MapMeta {
  const instances = PLACED.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const initial: MapInitial[] = [PANE, PANE_B].map((path) => ({ path, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }));
  const d = (id: number, slab: string, pane: string): SceneDestructible => ({
    id, key: `door_slab#0@${slab}`, anim: 'door_slab', instance: PLACED.indexOf(slab), targetPath: pane, root: slab,
    health: 1, armor: 0, shield: 0, program: doorSlab, nodes: [null, slab, pane],
  });
  return {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), initial, diagnostics: [],
    scene: { destructibles: [d(0, SLAB, PANE), d(1, SLAB_B, PANE_B)], programs: [{ program: doorSlab, search: [0, 0, 0] }, breakapane] },
  };
}

/** The door's swing (research 92 s2's shape): shut -> a quarter turn about y in a second, valve 1; open -> back, valve 0. */
const QUARTER: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
const swing: EffectProgram = {
  name: 'door_swing', root: 0, flags: 0, nodes: ['NA'],
  sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'if', conditions: [{ kind: 'valve', valve: 'door_valve', operation: 2, operand: 0 }] },
    { op: 'fromTo', node: -6, flags: 0x40, seconds: 1, from: [1, 1, 1], to: [1, 1, 1], rotation: { from: [0, 0, 0, 1], to: QUARTER } },
    { op: 'valve', valve: 'door_valve', operation: 0x0b, operand: 1 },
    { op: 'else' },
    { op: 'fromTo', node: -6, flags: 0x40, seconds: 1, from: [1, 1, 1], to: [1, 1, 1], rotation: { from: QUARTER, to: [0, 0, 0, 1] } },
    { op: 'valve', valve: 'door_valve', operation: 0x0b, operand: 0 },
    { op: 'endif' },
  ] }],
};
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const door: DoorSpec = {
  index: 0, node: 'door', path: 'worldmodel/door', valve: 'door_valve', range: 30, elevation: -1, programs: [swing],
  local: IDENTITY, parent: IDENTITY, owners: [1, 2], sweep: SWEEP,
};

type Played = { sounds: [string, string | null][]; debris: (string | null)[] };
function page(ground: GroundData = hull()): { world: WorldState; grid: ReturnType<typeof groundGrid>; played: Played; ground: GroundData } {
  const grid = groundGrid(ground);
  const played: Played = { sounds: [], debris: [] };
  const world = new WorldState(meta(), ground, grid, { sound: (name, path) => { played.sounds.push([name, path]); }, destruction: (path) => { played.debris.push(path); } });
  world.applyInitial();
  return { world, grid, played, ground };
}

const M4 = { kind: 'impact' as const, rating: 2.3, modifier: 0.3, point: [14, 20, 0] as [number, number, number] };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const run = (doors: DoorSet, seconds: number): void => { for (let k = 0; k < seconds * 60; k++) doors.step(1 / 60); };

describe("SUP-02: a door's breakable pane on the page and in the room", () => {
  it("the page takes a pane the room broke: a live snapshot plays breakapane's sound and debris once and spends the record; a joiner's silent one turns it off with neither; the reset restores it silently", () => {
    expect(SCENE_DEATH_ON_WIRE_READING).toBe('targetOffOrTold');
    expect(GLASS_FRAGMENTS_PLACEHOLDER).toBe('sound-and-pane-off');
    const parse = hull();
    const room = page(forkGround(parse));
    expect(room.world.health.hitAt(PANE, M4)).toEqual({ applied: true, died: true });
    // The room's own world runs the death: its hooks are the page's here, so the room's sound is counted apart.
    expect(room.played.sounds).toEqual([['.GLS_BRK_VSMALL', PANE]]);
    const env = room.world.wireAll(1);
    expect(env.states).toEqual([{ id: PLACED.indexOf(PANE), active: false }]);

    // A page in the round: the snapshot after the break plays its effects once, at the pane.
    const live = page(forkGround(parse));
    live.world.applyWire(env, false);
    expect(live.world.isActive(PANE)).toBe(false);
    expect(live.played.sounds).toEqual([['.GLS_BRK_VSMALL', PANE]]);
    expect(live.played.debris).toEqual([PANE]);
    expect(live.world.health.hp(0)).toBeLessThanOrEqual(0);
    expect(live.world.health.accepts(0, 1000)).toBe(false);
    expect(live.world.health.hp(1)).toBe(1);                                // the other slab's pane stands
    expect(live.world.isActive(PANE_B)).toBe(true);
    expect(live.world.isActive(SLAB)).toBe(true);                           // the leaf's own strip stays
    // The same state again (every snapshot carries the whole difference): nothing more is played.
    live.world.applyWire(room.world.wireAll(1), false);
    expect(live.played.sounds).toHaveLength(1);
    expect(live.played.debris).toHaveLength(1);
    expect(live.world.states()).toEqual(room.world.states());

    // A late joiner: the welcome's and first snapshot's state applied with skip_effects -- off, spent, silent.
    const joiner = page(forkGround(parse));
    joiner.world.applyWire(env, true);
    expect(joiner.world.isActive(PANE)).toBe(false);
    expect(joiner.played.sounds).toEqual([]);
    expect(joiner.played.debris).toEqual([]);
    expect(joiner.world.health.accepts(0, 1000)).toBe(false);
    joiner.world.applyWire(env, false);                                     // a later snapshot of the same state
    expect(joiner.played.sounds).toEqual([]);

    // The round's reset (NetClient.newEpoch): the pane back, its record whole, nothing played.
    live.world.reset();
    expect(live.world.isActive(PANE)).toBe(true);
    expect(live.world.health.hp(0)).toBe(1);
    expect(live.played.sounds).toHaveLength(1);
    // And it breaks again in the new round, once more heard.
    room.world.reset();
    room.world.health.hitAt(PANE, M4);
    live.world.applyWire(room.world.wireAll(2), false);
    expect(live.played.sounds).toHaveLength(2);
    // A page that follows the room's state alone (the offline room, `net/loopback`: no epoch of its own): the room's
    // reset gives the pane back, the record is whole again, and the next break is heard.
    room.world.reset();
    joiner.world.applyWire(room.world.wireAll(3), false);
    expect(joiner.world.isActive(PANE)).toBe(true);
    expect(joiner.world.health.hp(0)).toBe(1);
    expect(joiner.world.health.c4TargetAt(PANE, 18)).toBe(0);
    room.world.health.hitAt(PANE, M4);
    joiner.world.applyWire(room.world.wireAll(3), false);
    expect(joiner.played.sounds).toEqual([['.GLS_BRK_VSMALL', PANE]]);
  });

  it("one death a target on the page: two records on one pane die once, heard once, one spent; a record under the dead pane's target is not spent and not heard; the room's single death matches", () => {
    const GLINT = `${PANE}/glint`;
    const sounding = (name: string, sound: string): EffectProgram => ({
      name, root: 1, flags: 0x23, nodes: ['NA', 'pane1'],
      sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'sound', sound, node: -7, volume: 1, newPlay: true }, { op: 'active', node: -7, on: false }] }],
    });
    const SPINNER = 'worldmodel/spinner';
    const fanMeta = (withCall: boolean): MapMeta => {
      const m = meta();
      const placed = [...PLACED, GLINT, SPINNER];
      const instances = placed.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
      const base = m.scene!.destructibles[0]!;
      return {
        ...m, instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])),
        scene: {
          programs: [...m.scene!.programs, { program: { ...sounding('spinner', '.BUL_MET_PING_S'), nodes: ['NA', 'spinner'] }, search: [0, 0] }],
          destructibles: [
            withCall ? { ...base, program: { ...doorSlab, sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'call', anim: 'breakapane' }, { op: 'call', anim: 'spinner' }] }] } } : base,
            // MP73's shape: a second record bound to the same target (its own sound, so a replay would be heard).
            { ...base, id: 1, key: `pane_twin#0@${SLAB}`, anim: 'pane_twin', program: sounding('pane_twin', '.GLS_BRK_MD') },
            // MP7's shape: a record whose target lies under the dead record's target.
            { ...base, id: 2, key: `glint#0@${SLAB}`, anim: 'glint', targetPath: GLINT, program: sounding('glint', '.LAMP_BRK'), nodes: [null, SLAB, GLINT] },
            // MP7's `ant_base1` -> `spinner_hit`: a record of its own, whose animation the pane's death may also run
            // as a program (`CALL_ANIMATION`): the room then spends the caller alone.
            { ...base, id: 3, key: `spinner#0@${SPINNER}`, anim: 'spinner', root: SPINNER, targetPath: SPINNER, instance: placed.indexOf(SPINNER), program: { ...sounding('spinner', '.BUL_MET_PING_S'), nodes: ['NA', 'spinner'] }, nodes: [null, SPINNER] },
          ],
        },
      };
    };
    const make = (ground: GroundData, withCall = false) => {
      const grid = groundGrid(ground);
      const sounds: string[] = [];
      const world = new WorldState(fanMeta(withCall), ground, grid, { sound: (name) => { sounds.push(name); } });
      world.applyInitial();
      return { world, sounds };
    };
    const parse = hull();
    const room = make(forkGround(parse)), live = make(forkGround(parse));
    // The room: the hit lands on the pane's owner; one record (the first bound to the deepest target) dies.
    expect(room.world.health.hitAt(PANE, M4)).toEqual({ applied: true, died: true });
    expect([0, 1, 2].map((id) => room.world.health.isSpent(id))).toEqual([true, false, false]);
    expect(room.sounds).toEqual(['.GLS_BRK_VSMALL']);
    // The page: the same one death, heard once; the twin and the glint stay unspent.
    live.world.applyWire(room.world.wireAll(1), false);
    expect(live.sounds).toEqual(['.GLS_BRK_VSMALL']);
    expect([0, 1, 2].map((id) => live.world.health.isSpent(id))).toEqual([true, false, false]);
    expect([0, 1, 2].map((id) => live.world.health.hp(id))).toEqual([live.world.health.hp(0), 1, 1]);
    expect(live.world.health.hp(0)).toBeLessThanOrEqual(0);
    live.world.applyWire(room.world.wireAll(1), false);
    expect(live.sounds).toHaveLength(1);
    // A death that runs another record's animation: the room spends the caller alone and plays the called sound once;
    // the page, seeing both targets off, takes the caller's death alone and hears it once.
    const caller = make(forkGround(parse), true), follower = make(forkGround(parse), true);
    expect(caller.world.health.hitAt(PANE, M4)).toEqual({ applied: true, died: true });
    expect(caller.world.isActive(SPINNER)).toBe(false);
    expect(caller.sounds).toEqual(['.GLS_BRK_VSMALL', '.BUL_MET_PING_S']);
    expect([0, 3].map((id) => caller.world.health.isSpent(id))).toEqual([true, false]);
    follower.world.applyWire(caller.world.wireAll(1), false);
    expect([0, 1, 2, 3].map((id) => follower.world.health.isSpent(id))).toEqual([true, false, false, false]);
    expect(follower.sounds).toEqual(caller.sounds);
  });

  it("the sound plays at the pane's world origin as it stands now (SCENE_SOUND_PLACE_READING, FUN_00310980): shut, and turned with its leaf", () => {
    expect(SCENE_SOUND_PLACE_READING).toBe('nodeOrigin');
    const ground = hull();
    const places: (readonly number[] | null)[] = [];
    // The pane's origin (4, 0, 0): its leaf-side edge, on the hinge's line -- not its box's centre (14, 20, 0).
    const m: MapMeta = { ...meta(), worlds: new Map([[PANE, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1]]]) };
    const world = new WorldState(m, ground, groundGrid(ground), { sound: (_name, _path, _volume, at) => { places.push(at ?? null); } });
    world.applyInitial();
    expect(world.health.hitAt(PANE, M4).died).toBe(true);
    expect(places).toEqual([[4, 0, 0]]);
    world.reset();                                                          // whole again, shut
    // The door's swing carried to the world (`DoorPage`'s `move`, `./main` and `./matchMount`): the pane turns with the leaf.
    const doors = new DoorSet([door], ground, { moved: (d, delta) => { world.nodeMoved(d.path, delta); } });
    expect(doors.use(0)).toBe(true);
    run(doors, 1.5);
    expect(world.health.hitAt(PANE, M4).died).toBe(true);
    const at = places.at(-1)!;
    expect(places).toHaveLength(2);
    expect(Math.abs(at[0]!)).toBeLessThan(1e-3);                            // the leaf turned a quarter about the hinge
    expect(Math.abs(at[2]!)).toBeCloseTo(4, 3);
    expect(at[1]).toBeCloseTo(0, 3);
  });

  it("placeOf (a call's effect place): the centre of the pane's polygons as they stand now -- shut, and turned with its leaf", () => {
    const { world, ground } = page();
    expect(world.placeOf(PANE)).toEqual([14, 20, 0]);
    expect(world.placeOf('worldmodel/nothing')).toBeNull();
    const doors = new DoorSet([door], ground);
    expect(doors.use(0)).toBe(true);
    run(doors, 1.5);
    const at = world.placeOf(PANE)!;
    expect(Math.abs(at[0])).toBeLessThan(1e-3);                             // the leaf turned a quarter about the hinge
    expect(Math.abs(at[2])).toBeCloseTo(14, 3);
    expect(at[1]).toBeCloseTo(20, 3);
  });

  it("a pane under a swinging leaf: broken, it is out of every query and the mover's moving set while its door opens and shuts; the reset restores it with the door left open", () => {
    const { world, grid, ground } = page();
    const doors = new DoorSet([door], ground);
    const through = (z0: number, z1: number): string[] => segmentHits(grid, [14, 20, z0], [14, 20, z1]).map((h) => h.owner.path);
    expect(through(-10, 10)).toEqual([PANE]);
    // Open the door: the pane stands across the hinge's side now; a SEAL walking +x along it is stopped.
    expect(doors.use(0)).toBe(true);
    run(doors, 1.5);
    const paneNow = doors.leaf(0)[1]!;
    const z = (paneNow[2]! + paneNow[8]!) / 2;
    // SEGMENT-BODY: a hull face is met only from its front (research 281 s4.3), and the pane is one quad, so the walk comes
    // from the side the swung pane faces (its normal's x), along x through the pane's centre. `past` is how far beyond the
    // pane's plane, on its back side, the walker ended (negative: held on its front). Was: always from -x, which the swung
    // single-quad pane faces away from. Whether the disc's door panes are single quads (and the original lets a body
    // through one from its back) is not read here.
    const cx = (paneNow[0]! + paneNow[3]! + paneNow[6]! + paneNow[9]!) / 4;
    const front = Math.sign(polygonNormal(paneNow)![0]);
    expect(front, 'the swung pane faces along x').not.toBe(0);
    const walk = (): { past: number } => {
      const w = new Walker(grid);
      expect(w.place(cx + front * 30, 0, z)).toBe(true);
      w.state.yaw = front > 0 ? 90 : -90;                                      // facing the pane: -x from +x, +x from -x
      for (let k = 0; k < 120; k++) w.tick(FORWARD);
      return { past: front * (cx - w.state.x) };
    };
    expect(walk().past).toBeLessThan(0);
    // Break it mid-swing: the door shuts, the pane stays off.
    expect(doors.use(0)).toBe(true);
    run(doors, 0.5);
    expect(world.health.hitAt(PANE, M4)).toEqual({ applied: true, died: true });
    run(doors, 1);
    expect(doors.state(0)).toMatchObject({ open: false, busy: false });
    expect(world.isActive(PANE)).toBe(false);
    expect(ground.owners[2]!.flags! & 1).toBe(0);
    expect(through(-10, 10)).toEqual([]);                                   // the shut leaf's pane hole
    // Open again: the walker passes where the pane would stand (the moving set gated, MAP-02's revision).
    expect(doors.use(0)).toBe(true);
    run(doors, 1.5);
    expect(walk().past).toBeGreaterThan(10);
    // The round's reset with the door left open: the pane back where its leaf stands, and in the mover's way again.
    const revision = grid.revision;
    world.reset();
    expect(grid.revision).toBe(revision + 1);
    expect(world.isActive(PANE)).toBe(true);
    expect(world.health.hp(0)).toBe(1);
    expect(walk().past).toBeLessThan(0);
    // The doors' own reset shuts it; the pane is across the shut frame again.
    doors.reset();
    expect(through(-10, 10)).toEqual([PANE]);
  });
});
