// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import {
  applyPicks, readArsenal, readMapArsenal, segmentHits, surfaceMaterial, valveAllows, ITEM, type CollisionOwner, type GridParams, type Loadout,
  type V3, type WorldPoly, type ZAnimArchive,
} from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { DoorSet } from '../src/doors';
import {
  aimPick, c4Line, c4PlantAllowed, C4Settle, c4TargetOf, C4_AIM_SETTLE_S, C4_REACH_READING, C4_REFUSED_MATERIAL, ACTION_RANGE_DEFAULT,
} from '../src/equipment';
import { actionAtPick, type MapAction } from '../src/mapActions';
import { under, type MapInitial, type MapMeta } from '../src/mapMeta';
import { groundGrid, packGround, type GroundData } from '../src/mover';
import { blastLine, destructiblesOf, type SceneProgram } from '../src/sceneHealth';
import { loadSimMap, type SimMap } from '../src/simMap';
import { forkGround, ROOM_SKIP_EFFECTS_READING, WorldState } from '../src/worldState';
import { crossing, doorFixture, swingToRest } from './helpers/doorFixture';
import { CLAYMORE, type ThrowableRecord } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import { Walker, type PlaySnapshot } from '../src/walk';

/**
 * SUP-03 (research 210 s8; research 176 s7, 203 s7, 174 s3): Vigilance's five access barriers. Each `accessN` is a
 * kind-3 block (health 1, no armour, shield 17) on `good_parts/di_good` whose sequence runs `EXECUTE_ACTION
 * set_accessN`; the type-less action `access_actionN` on that valve runs `destroy_accessN`, which -- once, its context
 * valve guarding it -- turns `good_parts` and `di_good` off and `whats_left` on, and under `IF skip_effects == 0` the
 * debris (`bad_parts`) and `.WOOD_DEBRIS`. C4 (18) and the RPG's round (20) qualify against 17; the M67 (10) does not.
 * The rule on a synthetic Vigilance twin (data none); the map itself on the disc (MP51 is no fixture: SOCOM_DISC).
 */

// ---- the synthetic twin: two barriers placed as Vigilance places them (the root and its realised prototype) --------

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
/** A wall across `x` (z0..z1, 0..h): one polygon. */
const across = (path: string, x: number, z0 = -20, z1 = 20, h = 40): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x, 0, z0, x, 0, z1, x, h, z1, x, h, z0]),
});
/** A low slab on the floor (the rubble): under the witness line. */
const rubble = (path: string, x: number): WorldPoly => ({
  ...across(path, x), ditype: 3, points: Float32Array.from([x, 1, -20, x + 10, 1, -20, x + 10, 1, 20, x, 1, 20]),
});

interface Barrier { n: number; x: number; root: string; real: string; good: string; di: string; left: string; bad: string; part: string; action: string }
const barrier = (n: number, x: number): Barrier => {
  const root = `worldmodel/access${n}`, real = `${root}=access${n}`;
  return {
    n, x, root, real, good: `${real}/good_parts`, di: `${real}/good_parts/di_good`, left: `${real}/whats_left`, bad: `${real}/bad_parts`,
    part: `${real}/bad_parts/part1`, action: `${real}/access_action${n}`,
  };
};
const B = [barrier(1, 50), barrier(2, 250)];
const DOOR = 'worldmodel/door_ft_1';

/** The hull: the floor; each barrier's `di_good` two walls 2 apart (two polygons along a witness line); its rubble. */
function hull(): GroundData {
  const polys: WorldPoly[] = [{ ...across('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) }];
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS }];
  for (const b of B) {
    owners.push({ modelName: 'worldmodel', path: b.di, first: polys.length, count: 2, flags: FLAGS });
    polys.push(across(b.di, b.x), across(b.di, b.x + 2));
    owners.push({ modelName: 'worldmodel', path: b.left, first: polys.length, count: 1, flags: FLAGS });
    polys.push(rubble(b.left, b.x + 20));
  }
  return packGround(params, polys, owners);
}

/** The barriers' block: Vigilance's armour 0 and shield 17 unless a case asks another (LATER 102's armoured twin). */
interface Block { armor?: number; shield?: number }

/** `destroy_accessN` as Vigilance's MZANIM holds it (176 s7.1; the probe of 2026-10-05), its part-fly loop left out. */
const destroy = (n: number): SceneProgram => ({
  search: [0, 0, 1, 1, 1, 1],
  program: {
    name: `destroy_access${n}`, root: 1, flags: 0x22, nodes: ['NA', `access${n}`, 'good_parts', 'di_good', 'whats_left', 'bad_parts'],
    sequences: [
      { name: 'NA', activation: 1, ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
        { op: 'callSequence', sequence: 'access_destroy' },
        { op: 'valve', valve: 'NA', operation: 0x0b, operand: 1, context: true },
        { op: 'endif' },
      ] },
      { name: 'access_destroy', activation: 2, ops: [
        { op: 'active', node: 2, on: false }, { op: 'active', node: 3, on: false }, { op: 'active', node: 4, on: true },
        { op: 'if', conditions: [{ kind: 'valve', valve: 'skip_effects', operation: 2, operand: 0 }] },
        { op: 'active', node: 5, on: true },
        { op: 'sound', sound: '.WOOD_DEBRIS', node: -7, volume: 1 },
        { op: 'endif' },
      ] },
    ],
  },
});
const accessProgram = (n: number): SceneProgram => ({
  search: [0, 0, 1],
  program: { name: `access${n}`, root: 1, flags: 0x2b, nodes: ['NA', `access${n}`, 'di_good'], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: `set_access${n}` }] }] },
});

/**
 * The archive's animations as `destructiblesOf` reads them: `access1`, `access2` (state 1, flags 0x2b, a 1/17 block on
 * `di_good`), their destroy programs (no block), `access6` (a 1/17 block, its root placed nowhere) and `plankaccess1`
 * (health 0, placed nowhere) -- Vigilance's stored animations.
 */
function archive(block: Block = {}): { archive: ZAnimArchive; programs: SceneProgram[] } {
  const armor = block.armor ?? 0, shield = block.shield ?? 17;
  const anim = (name: string, health: number | null, refs: [string, number][]) => ({
    name, params: { state: 1, flags: health === null ? 0x22 : 0x2b, rootNodeIndex: 1 },
    health: health === null ? null : { nodeRef: 2, health, healthReset: health, armor, armorReset: armor, shield },
    nodeRefs: refs.map(([n, search]) => ({ name: n, search })),
  });
  const accessRefs = (n: string): [string, number][] => [['NA', 0], [n, 0], ['di_good', 1]];
  const anims = [
    anim('access1', 1, accessRefs('access1')), anim('access2', 1, accessRefs('access2')), anim('access6', 1, accessRefs('access6')),
    anim('plankaccess1', 0, accessRefs('plankaccess1')), anim('destroy_access1', null, accessRefs('access1')), anim('destroy_access2', null, accessRefs('access2')),
  ];
  const programs = [accessProgram(1), accessProgram(2), accessProgram(6), accessProgram(1), destroy(1), destroy(2)];
  programs[2] = { ...programs[2]!, program: { ...programs[2]!.program, name: 'access6' } };
  programs[3] = { ...programs[3]!, program: { ...programs[3]!.program, name: 'plankaccess1' } };
  return { archive: { main: {}, names: [], sets: [{ name: 'mission', names: [], rdrPaths: [], siScripts: [], anims }] } as unknown as ZAnimArchive, programs };
}

const actions: MapAction[] = [
  ...B.map((b): MapAction => ({
    node: `access_action${b.n}`, path: b.action, at: [b.x - 5, 0, 0], type: '', typeCode: 8, valve: `set_access${b.n}`,
    anims: [`destroy_access${b.n}`], team: null, range: ACTION_RANGE_DEFAULT, elevation: -1, points: 2, bitmap: '',
  })),
  { node: 'door_ft_1', path: DOOR, at: [-300, 0, 0], type: 'DOOR', typeCode: 0, valve: 'door_ft_1', anims: ['singleDoor_left'], team: null, range: 30, elevation: -1, points: 0, bitmap: 'action_door_open.tif' },
];

function meta(block: Block = {}): MapMeta {
  const paths = ['worldmodel/floor', DOOR, ...B.flatMap((b) => [b.root, b.real, b.good, b.di, b.bad, b.part, b.left, b.action])];
  const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const initial: MapInitial[] = B.flatMap((b) => [
    { path: b.good, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: b.di, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: b.bad, deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
    { path: b.left, deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
  ]);
  const base = { instances };
  const { archive: a, programs } = archive(block);
  return {
    stem: 'SYN', actions, instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), initial, diagnostics: [],
    scene: { destructibles: destructiblesOf(base, a, programs), programs },
  };
}

/** A world on its own copy of the hull: the room's (`skipEffects`, ROOM_SKIP_EFFECTS_READING) or a page's. */
function world(room = false, ground: GroundData = hull(), block: Block = {}) {
  const grid = groundGrid(ground);
  const sounds: string[] = [];
  const w = new WorldState(meta(block), ground, grid, { sound: (name) => { sounds.push(name); } });
  if (room) w.skipEffects = ROOM_SKIP_EFFECTS_READING;
  w.applyInitial();
  const witness = (b: Barrier): number => segmentHits(grid, [b.x - 10, 20, 0], [b.x + 10, 20, 0]).length;
  /** The room's blast walk (`match/src/room.ts` `blast`): the line to the target's midpoint meets only the target (AD-5; was its nearest point). */
  const blast = (at: V3, rating: number, radius: number): number[] =>
    w.health.blastAt(at, rating, radius, (to, target) => segmentHits(grid, at, to).every((h) => under(h.owner.path, target)));
  return { w, grid, sounds, witness, blast };
}

/** The records' ratings and radii (ZWEAPON: C4 18 in 5 m, the RPG's round 20 in 15 m, the M67 10 in 15 m; 174 s3). */
const C4 = { rating: 18, radius: 50 }, RPG = { rating: 20, radius: 150 }, M67 = { rating: 10, radius: 150 };

describe('the access barriers on a synthetic Vigilance twin (SUP-03; data none)', () => {
  it.each([false, true])('the actual C4 plant and fuse open the offline world only (online=%s), and reset restores it', (online) => {
    const f = world();
    const record: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 6.1,
      explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true, capacity: 4 };
    const g = new GrenadeThrower({ grid: () => f.grid, view: () => 'third', online: () => online,
      snapshot: () => ({ feet: [30, 0, 0], yaw: 0, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
      handPoint: () => [30, 12, -8], aim: () => ({ eye: [30, 12, 0], far: [100, 12, 0] }),
    });
    g.setRecords([record]);
    g.setWorld(() => f.w);
    g.setKit(['M67', 'AN-M8', 'C4']);
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    expect(g.plantC4()).toBe(true);
    const explosions: string[] = [], positions: V3[] = [];
    g.on('explode', e => { explosions.push(e.item); positions.push(e.pos); });
    for (let i = 0; i < 500; i++) g.update(1 / 60);
    expect(explosions).toEqual(['C4']);
    expect(positions).toEqual([[B[0]!.x, 12, 0]]);
    expect(g.stats().leftByItem.C4).toBe(3);
    expect(f.w.health.hp(0)).toBe(online ? 1 : 0);
    expect(f.witness(B[0]!)).toBe(online ? 2 : 0);
    expect(f.w.isActive(B[0]!.good)).toBe(online);
    expect(f.w.isActive(B[0]!.left)).toBe(!online);
    expect(f.witness(B[1]!)).toBe(2);
    f.w.reset();
    expect(f.w.health.hp(0)).toBe(1);
    expect(f.witness(B[0]!)).toBe(2);
    expect(f.w.isActive(B[0]!.good)).toBe(true);
    g.clearAir();
  });
  it('a remote C4 fuse remains presentation-only even without a live network page', () => {
    const f = world();
    const record: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 6.1,
      explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true, capacity: 4 };
    const g = new GrenadeThrower({ grid: () => f.grid, view: () => 'third', snapshot: () => null });
    g.setRecords([record]); g.setWorld(() => f.w);
    g.launchRemote('C4', [44, 1, 0], [0, 0, 0], 2);
    for (let i = 0; i < 500; i++) g.update(1 / 60);
    expect(g.stats().explosions.map(e => e.item)).toEqual(['C4']);
    expect(f.w.health.hp(0)).toBe(1);
    expect(f.witness(B[0]!)).toBe(2);
    expect(f.w.isActive(B[0]!.good)).toBe(true);
    g.clearAir();
  });
  it('LATER 102: an RPG round with no room opens a shield-17 barrier; an M67 (10) does not; an online round stays presentation-only', () => {
    // Research 94 §C4 (packages/scene/test/equipment.test.ts): RPG id 186, Explosion_Damage 20, radius 150 u,
    // arming 100, muzzle 400, acceleration 980, impact. Research 176 §7.3: shield 17 takes 20 and refuses the M67's 10.
    const rpg: ThrowableRecord = {
      ...CLAYMORE, name: 'RPG', id: 186, muzzleVelocity: 400, acceleration: 980, armingDistance: 100, impact: true,
      hasBackblast: true, fuse: 20, removal: 20.1, explosionDamage: 20, explosionRadius: 150, impactDamage: 20,
      capacity: 1, volatile: undefined,
    };
    // The M67's transcribed record (research 94; id 121, Explosion_Damage 10, radius 150 u), fuse shortened so the
    // blast is the test's. The file's `M67` above is that rating pair, not the record.
    const frag: ThrowableRecord = {
      ...CLAYMORE, name: 'M67', id: 121, fuse: 0.25, removal: 0.4, muzzleVelocity: 1, gravity: 98,
      explosionDamage: 10, explosionRadius: 150, impact: false, capacity: 3, volatile: undefined, hasBackblast: undefined,
    };
    const fly = (record: ThrowableRecord, from: V3, velocity: V3, online = false) => {
      const f = world();
      const g = new GrenadeThrower({
        grid: () => f.grid, view: () => 'third', online: () => online,
        snapshot: () => ({ feet: from, yaw: 90, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
      });
      g.setWorld(() => f.w);
      g.launchRound(record, from, velocity);
      const booms: string[] = [];
      g.on('explode', (e) => booms.push(e.item));
      for (let i = 0; i < 180; i++) g.update(1 / 60);
      g.clearAir();
      return { f, booms };
    };
    // 220 u out, past the 100 u arming distance, straight at access1's near face (the wall at x = 50, y 0..40).
    const from: V3 = [B[0]!.x - 220, 20, 0];
    const opened = fly(rpg, from, [400, 0, 0]);
    expect(opened.booms).toEqual(['RPG']);
    expect(opened.f.w.health.hp(0)).toBe(0);
    expect(opened.f.witness(B[0]!)).toBe(0);
    expect(opened.f.w.isActive(B[0]!.good)).toBe(false);
    expect(opened.f.witness(B[1]!)).toBe(2);
    const fragged = fly(frag, [B[0]!.x - 6, 20, 0], [0, 0, 0]);
    expect(fragged.booms).toEqual(['M67']);
    expect(fragged.f.w.health.hp(0)).toBe(1);
    expect(fragged.f.witness(B[0]!)).toBe(2);
    expect(fragged.f.w.isActive(B[0]!.good)).toBe(true);
    const online = fly(rpg, from, [400, 0, 0], true);
    expect(online.booms).toEqual(['RPG']);
    expect(online.f.w.health.hp(0)).toBe(1);
    expect(online.f.witness(B[0]!)).toBe(2);
  });
  it("LATER 102 (AD-5): the page's blast takes the round's Piercing as the room's sceneBlast -- an M67 (piercing 4) kills an armoured block on the page as in the room", () => {
    // An armoured twin (armour 150, shield 10): the M67's 10 qualifies at the shield (D:L318622) and is 10 x 14 = 140 at
    // the midpoint 7 u off. `FUN_003c7490` D:L318624-318625 takes armour x (10 - piercing) / 10 off it: at the M67's
    // piercing 4 (research 91 §5; `BAKED_PIERCING`) 140 - 90 = 50 and the block (health 1) dies; at 0, 140 - 150 and it
    // stands. Was (LATER 102 as first built): the page passed no Piercing (0), so it stood on the page and died in the room.
    const armoured = { armor: 150, shield: 10 };
    const frag: ThrowableRecord = {
      ...CLAYMORE, name: 'M67', id: 121, fuse: 0.25, removal: 0.4, muzzleVelocity: 1, gravity: 98,
      explosionDamage: 10, explosionRadius: 150, impact: false, capacity: 3, volatile: undefined, hasBackblast: undefined,
    };
    const page = world(false, hull(), armoured);
    const g = new GrenadeThrower({
      grid: () => page.grid, view: () => 'third', online: () => false,
      snapshot: () => ({ feet: [B[0]!.x - 220, 0, 0], yaw: 90, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
    });
    g.setWorld(() => page.w);
    const at: V3[] = [];
    g.on('explode', (e) => at.push([...e.pos]));
    g.launchRound(frag, [B[0]!.x - 6, 20, 0], [0, 0, 0]);
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    g.clearAir();
    expect(at).toHaveLength(1);
    // The room's `sceneBlast` at the same point: `blastAt` with the round's piercing (match `room.ts`).
    const roomAt = (piercing: number) => {
      const r = world(true, hull(), armoured);
      const died = r.w.health.blastAt(at[0]!, frag.explosionDamage, frag.explosionRadius,
        (to, target) => segmentHits(r.grid, at[0]!, to).every((h) => under(h.owner.path, target)), { piercing });
      return { died, hp: r.w.health.hp(0) };
    };
    expect(roomAt(4)).toEqual({ died: [0], hp: 0 });
    expect(roomAt(0)).toEqual({ died: [], hp: 1 });                  // the case tells the two apart
    expect(page.w.health.hp(0)).toBe(0);
    expect(page.witness(B[0]!)).toBe(0);
  });
  it('LATER 122: the barrier blown open mid-plant (the object gone, D:L476938) gives the C4 back -- no charge, none spent', () => {
    const f = world();
    const record: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 6.1,
      explosionDamage: 18, explosionRadius: 50, ignoreExplosionDI: true, capacity: 4 };
    const g = new GrenadeThrower({ grid: () => f.grid, view: () => 'third', online: () => false,
      snapshot: () => ({ feet: [30, 0, 0], yaw: 0, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
      handPoint: () => [30, 12, -8], aim: () => ({ eye: [30, 12, 0], far: [100, 12, 0] }),
    });
    g.setRecords([record]);
    g.setWorld(() => f.w);
    g.setKit(['M67', 'AN-M8', 'C4']);
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    const left = g.stats().leftByItem.C4;
    expect(g.plantC4()).toBe(true);
    const placed: string[] = [];
    g.on('place', (e) => placed.push(e.item));
    for (let i = 0; i < 30; i++) g.update(1 / 60);                  // 0.5 s into the 1.098 s clip
    expect(f.blast([B[0]!.x - 6, 20, 0], RPG.rating, RPG.radius)).toEqual([0]);
    expect(f.w.isActive(B[0]!.di)).toBe(false);
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    expect(placed).toEqual([]);
    expect(g.stats().leftByItem.C4).toBe(left);
    expect(g.stats().live).toEqual([]);
    expect(g.stats().placing).toBe(false);
    g.clearAir();
  });
  it('a barrier placed with its realised prototype binds one destructible (health 1, shield 17, di_good); a stored animation with no placed root binds none', () => {
    const list = meta().scene!.destructibles;
    expect(list.map((d) => [d.anim, d.root, d.targetPath, d.health, d.armor, d.shield])).toEqual(
      B.map((b) => [`access${b.n}`, b.root, b.di, 1, 0, 17]),
    );
    expect(list.map((d) => d.id)).toEqual([0, 1]);
  });

  it('C4 (18) and an RPG round (20) open a shield-17 barrier through blastAt -- its witness segment 2 -> 0 -- and an M67 (10) does not; the other barrier stands', () => {
    for (const charge of [C4, RPG]) {
      const { w, witness, blast } = world(true);
      const at: V3 = [B[0]!.x - 6, 20, 0];
      expect(B.map(witness)).toEqual([2, 2]);
      expect(blast(at, M67.rating, M67.radius)).toEqual([]);
      expect(B.map(witness)).toEqual([2, 2]);
      expect(blast(at, charge.rating, charge.radius)).toEqual([0]);
      expect(B.map(witness)).toEqual([0, 2]);
      expect(w.isActive(B[0]!.good)).toBe(false);
      expect(w.isActive(B[0]!.left)).toBe(true);
      expect(w.valve('set_access1')).toBe(1);
    }
  });

  it('once a round: a second charge changes nothing; the next round restores geometry and health together (FUN_002ac0e0)', () => {
    const { w, witness, blast } = world(true);
    const at: V3 = [B[0]!.x - 6, 20, 0];
    expect(blast(at, C4.rating, C4.radius)).toEqual([0]);
    expect(blast(at, RPG.rating, RPG.radius)).toEqual([]);
    expect(w.health.hitAt(B[0]!.di, { kind: 'explosion', rating: 50, modifier: 0, point: at })).toEqual({ applied: false, died: false });
    w.reset();
    expect(B.map(witness)).toEqual([2, 2]);
    expect(w.health.hp(0)).toBe(1);
    expect(w.isActive(B[0]!.left)).toBe(false);
    expect(w.valve('set_access1')).toBe(0);
    expect(blast(at, C4.rating, C4.radius)).toEqual([0]);
    expect(B.map(witness)).toEqual([0, 2]);
  });

  it("the C4 target is the bound destructible under the reticle (aimPick -> c4TargetOf) within C4_REACH_READING of the feet, settled 0.2 s, not on INVISIBLE_DI; the room checks the page's named node along the head's line (c4Line)", () => {
    const { w, grid, blast } = world();
    const h = w.health;
    const look = (feet: V3, to: V3) => aimPick(grid, [feet[0], feet[1] + 12, feet[2]], to);
    const feet: V3 = [B[0]!.x - 20, 0, 0];
    const aim = look(feet, [B[0]!.x + 100, 12, 0]);
    expect(aim?.path).toBe(B[0]!.di);
    expect(c4TargetOf(h, aim, feet, C4.rating)).toBe(0);
    expect(c4TargetOf(h, aim, feet, M67.rating)).toBeNull();                       // a charge of 10 is under 17
    // The settle (kit +0x8a4, V1 #9): the frame that sets it and six game frames more on the same, unmoved target; the SEAL's speed is never read.
    const settle = new C4Settle();
    let held = 0;
    for (let i = 0; i < 7; i++) held = settle.step(1 / 30, h.c4TargetAt(aim!.path, C4.rating), aim!.poly);
    expect(held).toBeGreaterThanOrEqual(C4_AIM_SETTLE_S - 1e-9);
    expect(c4PlantAllowed({ target: 0, settledFor: held, material: aim!.material })).toBe(true);
    // The room: the page's node and point, the line from the head clear to it, the material the polygon's.
    expect(c4Line(grid, [feet[0], 12, 0], { path: B[0]!.di, point: aim!.point })).toEqual({ clear: true, material: aim!.material });
    expect(c4Line(grid, [B[1]!.x - 20, 12, 0], { path: B[1]!.di, point: [B[1]!.x, 12, 0] })).toEqual({ clear: true, material: aim!.material });
    expect(c4Line(grid, [feet[0], 12, 0], { path: B[1]!.di, point: [B[1]!.x, 12, 0] })).toEqual({ clear: false, why: 'walled' });   // access1 between
    expect(c4Line(grid, [feet[0], 12, 0], { path: B[0]!.di, point: [B[0]!.x, 12, 30] })).toEqual({ clear: false, why: 'missed' });  // off its face
    // INVISIBLE_DI (005c1970 D:L476975-476977): the same barrier's polygons named so refuse the plant, settled or not.
    const byte = aim!.poly.material;
    aim!.poly.material = 3;                                                        // SOILS[1] after the two built-ins
    expect(look(feet, [B[0]!.x + 100, 12, 0])?.material).toBe(C4_REFUSED_MATERIAL);
    expect(c4PlantAllowed({ target: 0, settledFor: 1, material: look(feet, [B[0]!.x + 100, 12, 0])!.material })).toBe(false);
    expect(c4Line(grid, [feet[0], 12, 0], { path: B[0]!.di, point: aim!.point })).toEqual({ clear: true, material: C4_REFUSED_MATERIAL });
    aim!.poly.material = byte;
    // Out of reach: the hit 32 along the ground (C4_REACH_READING: the action object's default reach, strict).
    expect(C4_REACH_READING).toBe(ACTION_RANGE_DEFAULT);
    const far: V3 = [B[0]!.x - C4_REACH_READING, 0, 0];
    expect(c4TargetOf(h, look(far, [B[0]!.x + 100, 12, 0]), far, C4.rating)).toBeNull();
    // The floor under the reticle: no destructible.
    expect(c4TargetOf(h, look(feet, [feet[0] + 5, -5, 0]), feet, C4.rating)).toBeNull();
    // Opened, the barrier is no one's target: the reticle passes on.
    blast([B[0]!.x - 6, 20, 0], C4.rating, C4.radius);
    expect(look(feet, [B[0]!.x + 100, 12, 0])?.path ?? null).not.toBe(B[0]!.di);
    expect(c4TargetOf(h, look(feet, [B[0]!.x + 100, 12, 0]), feet, C4.rating)).toBeNull();
    expect(h.c4TargetAt(B[0]!.di, C4.rating)).toBeNull();
  });

  it('access_actionN is never a prompt (type 8, FUN_005aa240): the door is', () => {
    for (const a of actions.filter((x) => x.typeCode === 8)) expect(actionAtPick(actions, { path: a.path, point: a.at }, a.at)).toBeNull();
    expect(actionAtPick(actions, { path: DOOR, point: [-300, 0, 0] }, [-290, 0, 0])?.node).toBe('door_ft_1');
  });

  it("the room's death runs with skip_effects 1 (ROOM_SKIP_EFFECTS_READING): no debris on the wire; a joiner takes the barrier open silently; a page's own death plays .WOOD_DEBRIS and bad_parts once", () => {
    expect(ROOM_SKIP_EFFECTS_READING).toBe(true);
    const ground = hull();
    const room = world(true, forkGround(ground));
    room.blast([B[0]!.x - 6, 20, 0], C4.rating, C4.radius);
    expect(room.w.isActive(B[0]!.bad)).toBe(false);                               // the debris is the page's
    expect(room.w.isActive(B[0]!.left)).toBe(true);
    const env = room.w.wireAll(1);
    expect(env.states.map((s) => room.w.meta.instances[s.id]!.path)).toEqual([B[0]!.good, B[0]!.di, B[0]!.left]);
    // A late joiner: the welcome's environment laid on silently (skip_effects 1).
    const joiner = world(false, forkGround(ground));
    joiner.w.applyWire(env, true);
    expect(joiner.witness(B[0]!)).toBe(0);
    expect(joiner.w.isActive(B[0]!.bad)).toBe(false);
    expect(joiner.sounds).toEqual([]);
    expect(joiner.w.health.c4TargetAt(B[0]!.di, C4.rating)).toBeNull();
    // A page that runs the death itself (an offline world): the effects branch, once.
    const page = world(false, forkGround(ground));
    page.blast([B[0]!.x - 6, 20, 0], C4.rating, C4.radius);
    page.blast([B[0]!.x - 6, 20, 0], RPG.rating, RPG.radius);
    expect(page.sounds).toEqual(['.WOOD_DEBRIS']);
    expect(page.w.isActive(B[0]!.bad)).toBe(true);
    page.w.reset();
    expect(page.w.isActive(B[0]!.bad)).toBe(false);
    expect(page.witness(B[0]!)).toBe(2);
  });

  it('Enable_c4 = 9 (1 SEALs | 8 Terrorists): both sides may put C4 in a kit (valveAllows, applyPicks)', () => {
    const valves = new Map([['Enable_c4', 9]]);
    expect(valveAllows(valves, 'seal', ITEM.C4)).toBe(true);
    expect(valveAllows(valves, 'terrorist', ITEM.C4)).toBe(true);
    expect(valveAllows(new Map([['Enable_c4', 1]]), 'terrorist', ITEM.C4)).toBe(false);
  });
});

// ---- Vigilance on the disc ------------------------------------------------------------------------------------------

const DISC = process.env.SOCOM_DISC;
const HAVE_MP51 = !!DISC && existsSync(resolve(DISC, 'RUN/MP51.ZDB'));
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const READERC = fixture('RUN/READERC.ZAR');

/** 176 s7.2's witness segments, one a barrier (2 polygons intact, 0 open). */
const WITNESS: [V3, V3][] = [
  [[1490.645, 54.766, 1041.2], [1490.645, 54.766, 1057.2]],
  [[1573.427, 40.670, 517.376], [1560.072, 40.732, 508.565]],
  [[334.897, 149.307, 1161.302], [318.897, 149.307, 1161.302]],
  [[985.469, 105.538, 1072.348], [987.469, 105.558, 1075.812]],
  [[897.420, 48.211, 725.579], [904.342, 48.211, 721.569]],
];

describe.skipIf(!HAVE_MP51)(`Vigilance's five access barriers on the disc${HAVE_MP51 ? '' : ' (SOCOM_DISC with RUN/MP51.ZDB absent)'}`, () => {
  let map: SimMap;
  const load = async (): Promise<SimMap> => (map ??= await loadSimMap(new FsAssetSource(DISC as string), 'RUN/MP51.ZDB'));
  const fresh = (m: SimMap, room = true) => {
    const ground = forkGround(m.ground);
    const grid = groundGrid(ground);
    const sounds: string[] = [];
    const w = new WorldState(m.meta!, ground, grid, { sound: (name) => { sounds.push(name); } });
    if (room) w.skipEffects = ROOM_SKIP_EFFECTS_READING;
    w.applyInitial();
    const hits = (k: number): number => segmentHits(grid, WITNESS[k]![0], WITNESS[k]![1]).length;
    /**
     * AD-5: a blast at `access_actionN`'s node, a unit up (where the Terrorist's plant below sets its charge), through
     * `FUN_003c80e0`'s reach gate on the line to the barrier's midpoint (`blastLine`: the map's materials' PENETRATION).
     * Each midpoint is 1.2-17.7 u from it (access1 12.61, access2 17.72, access3 12.61, access4 1.22, access5 1.30): inside
     * 0.528 of C4's 50 u, so its 18 stays over the shield 17. Was: at the witness segment's start, the plain line to the
     * nearest point -- see `fromWitness`.
     */
    const pen = (p: WorldPoly): number => surfaceMaterial(p.material, m.defaultMaterial ?? '').penetration;
    const blastFrom = (at: V3, c: { rating: number; radius: number }): number[] =>
      w.health.blastAt(at, c.rating, c.radius, (to, target) => blastLine(grid, at, to, target, c.radius, pen));
    const actionAt = (k: number): V3 => { const a = m.meta!.actions.find((x) => x.node === `access_action${k + 1}`)!; return [a.at[0]!, a.at[1]! + 1, a.at[2]!]; };
    const blast = (k: number, c: { rating: number; radius: number }): number[] => blastFrom(actionAt(k), c);
    /** A blast at the witness segment's start (in front of the barrier). */
    const fromWitness = (k: number, c: { rating: number; radius: number }): number[] => blastFrom(WITNESS[k]![0], c);
    return { w, grid, ground, sounds, hits, blast, fromWitness };
  };

  it('Vigilance: access1..5 are the live destructibles (health 1, shield 17, di_good under accessN); access6 and plankaccess1..3 have no placed root and are diagnostics', async () => {
    const m = await load();
    const list = m.meta!.scene!.destructibles;
    expect(list.map((d) => [d.anim, d.root, d.targetPath, d.health, d.armor, d.shield]).sort()).toEqual(
      [1, 2, 3, 4, 5].map((n) => [`access${n}`, `worldmodel/access${n}`, `worldmodel/access${n}=access${n}/good_parts/di_good`, 1, 0, 17]),
    );
    const names = m.meta!.scene!.programs.map((p) => p.program.name);
    for (const n of ['access6', 'plankaccess1', 'plankaccess2', 'plankaccess3']) {
      expect(names).toContain(n);
      expect(m.meta!.diagnostics.some((d) => d.includes(`zAnim ${n}`) && d.includes('not placed'))).toBe(true);
    }
    // The round's reset restores each: every barrier's good_parts and di_good are saved references (bit 28) -- no
    // Frostfire-style gap (each accessN is its own animation, its references search 1 under its own root).
    for (let n = 1; n <= 5; n++) {
      for (const node of ['good_parts', 'good_parts/di_good', 'whats_left', 'bad_parts']) {
        expect(m.meta!.initial.find((e) => e.path === `worldmodel/access${n}=access${n}/${node}`)?.saveActive, `access${n} ${node}`).toBe(true);
      }
    }
    // access_action1..5: type-less (8), never a prompt; their valves bind each to its barrier (forAction).
    const w = fresh(m).w;
    for (let n = 1; n <= 5; n++) {
      const a = m.meta!.actions.find((x) => x.node === `access_action${n}`)!;
      expect(a.typeCode).toBe(8);
      expect(actionAtPick(m.meta!.actions, { path: a.path, point: a.at }, a.at)).toBeNull();
      expect(w.health.forAction(`set_access${n}`)?.anim).toBe(`access${n}`);
    }
  }, 120_000);

  it("each barrier's witness segment goes 2 -> 0 when C4 or an RPG round opens it and stays 2 after an M67; the four door_ft doors still swing", async () => {
    const m = await load();
    // AD-5: from the witness segment's start the line to access4's and access5's midpoints (12.0 and 14.0 u) crosses
    // their own good_parts -- STONE, PENETRATION 0, not the target node -- so FUN_003c80e0 refuses it (D:L319117);
    // access1-3's lines meet only their di_good. Was: all five opened from there (the line ran to the nearest point).
    for (let k = 0; k < 5; k++) {
      const f = fresh(m);
      expect(f.fromWitness(k, C4).map((id) => f.w.health.list[id]!.anim), `access${k + 1} from its witness`).toEqual(k < 3 ? [`access${k + 1}`] : []);
    }
    for (let k = 0; k < 5; k++) {
      for (const charge of [C4, RPG]) {
        const f = fresh(m);
        expect(f.hits(k), `access${k + 1} intact`).toBe(2);
        expect(f.blast(k, M67)).toEqual([]);
        expect(f.hits(k), `access${k + 1} after an M67`).toBe(2);
        const died = f.blast(k, charge);
        expect(died.map((id) => f.w.health.list[id]!.anim)).toContain(`access${k + 1}`);
        expect(f.hits(k), `access${k + 1} after ${charge.rating}`).toBe(0);
        expect(f.w.isActive(`worldmodel/access${k + 1}=access${k + 1}/whats_left`)).toBe(true);
      }
    }
    const doors = new DoorSet(m.doors ?? [], forkGround(m.ground));
    expect(m.doors!.map((d) => d.node)).toEqual(['door_ft_1', 'door_ft_2', 'door_ft_3', 'door_ft_4']);
    for (let i = 0; i < 4; i++) {
      expect(doors.use(i)).toBe(true);
      swingToRest(doors, i);
      expect(doors.state(i).open, `door_ft_${i + 1}`).toBe(true);
    }
    // door_ft_1 shut stops the SEAL, open lets it through.
    const f = doorFixture(m, 0);
    const own = new DoorSet(m.doors ?? [], m.ground);
    const grid = groundGrid(m.ground);
    const before = Float32Array.from(m.ground.points);
    try {
      expect(crossing(m, f, 60, grid)).toBeLessThan(0);
      own.use(0);
      swingToRest(own, 0);
      expect(crossing(m, f, 60, grid)).toBeGreaterThan(0);
    } finally {
      own.use(0);
      swingToRest(own, 0);
    }
    expect(Array.from(m.ground.points).every((v, i) => Math.abs(v - before[i]!) < 1e-3)).toBe(true);
  }, 120_000);

  it('destroy_accessN runs once a round: a second blast changes nothing; a joiner with skip_effects 1 gets the geometry and no debris or sound; the next round restores good_parts', async () => {
    const m = await load();
    const room = fresh(m);
    for (let k = 0; k < 5; k++) expect(room.blast(k, C4).length).toBeGreaterThan(0);
    for (let k = 0; k < 5; k++) expect(room.blast(k, RPG)).toEqual([]);
    expect(WITNESS.map((_, k) => room.hits(k))).toEqual([0, 0, 0, 0, 0]);
    for (let n = 1; n <= 5; n++) expect(room.w.isActive(`worldmodel/access${n}=access${n}/bad_parts`)).toBe(false);
    const joiner = fresh(m, false);
    joiner.w.applyWire(room.w.wireAll(1), true);
    expect(WITNESS.map((_, k) => joiner.hits(k))).toEqual([0, 0, 0, 0, 0]);
    expect(joiner.sounds).toEqual([]);
    for (let n = 1; n <= 5; n++) {
      expect(joiner.w.isActive(`worldmodel/access${n}=access${n}/good_parts`)).toBe(false);
      expect(joiner.w.isActive(`worldmodel/access${n}=access${n}/whats_left`)).toBe(true);
      expect(joiner.w.isActive(`worldmodel/access${n}=access${n}/bad_parts`)).toBe(false);
    }
    room.w.reset();
    expect(WITNESS.map((_, k) => room.hits(k))).toEqual([2, 2, 2, 2, 2]);
    expect(room.w.health.list.map((d) => room.w.health.hp(d.id))).toEqual([1, 1, 1, 1, 1]);
    for (let n = 1; n <= 5; n++) expect(room.w.isActive(`worldmodel/access${n}=access${n}/good_parts`)).toBe(true);
  }, 120_000);

  it.skipIf(!ZWEAPON || !READERC)('Vigilance: a Terrorist kit holds C4 and the plant on access1 opens it', async () => {
    const m = await load();
    const zdb = readFileSync(resolve(DISC as string, 'RUN/MP51.ZDB'));
    const arsenal = readArsenal(ZWEAPON!);
    const vig = readMapArsenal(arsenal, new Uint8Array(zdb), READERC!);
    expect(vig.valves.get('Enable_c4')).toBe(9);
    expect(vig.selectable.terrorist).toContain(ITEM.C4);
    const kit = vig.kits.terrorist[0]!.loadout;
    const picked = applyPicks(arsenal, vig.valves, 'terrorist', kit, [{ slot: 4, id: ITEM.C4 }]);
    expect('loadout' in picked && (picked.loadout as Loadout)[4]).toBe(ITEM.C4);
    // PF-13: in front of access1 (the witness segment's start), the reticle along it: the page's pick is access1's
    // di_good, a material other than INVISIBLE_DI, settled six game frames after the first; the room's line from there to the point
    // is clear and meets the same material (no side in the rule); the charge opens it.
    const f = fresh(m);
    const eye = WITNESS[0]![0], ahead = WITNESS[0]![1];
    const pick = aimPick(f.grid, eye, [eye[0] + (ahead[0] - eye[0]) * 2, eye[1], eye[2] + (ahead[2] - eye[2]) * 2], m.defaultMaterial ?? '');
    expect(pick?.path.startsWith('worldmodel/access1=access1/good_parts/di_good')).toBe(true);
    expect(pick!.material).not.toBe(C4_REFUSED_MATERIAL);
    const feet: V3 = [eye[0], eye[1] - 12, eye[2]];
    const id = c4TargetOf(f.w.health, pick, feet, C4.rating);
    expect(id === null ? null : f.w.health.list[id]!.anim).toBe('access1');
    const settle = new C4Settle();
    let held = 0;
    for (let i = 0; i < 7; i++) held = settle.step(1 / 30, f.w.health.c4TargetAt(pick!.path, C4.rating), pick!.poly);
    expect(c4PlantAllowed({ target: id, settledFor: held, material: pick!.material })).toBe(true);
    expect(c4Line(f.grid, eye, { path: pick!.path, point: pick!.point }, m.defaultMaterial ?? '')).toEqual({ clear: true, material: pick!.material });
    const a = m.meta!.actions.find((x) => x.node === 'access_action1')!;
    const at: V3 = [a.at[0], a.at[1] + 1, a.at[2]];
    f.w.health.blastAt(at, C4.rating, C4.radius, (to, target) => segmentHits(f.grid, at, to).every((h) => under(h.owner.path, target)));
    expect(f.hits(0)).toBe(0);
  }, 120_000);

  // SEGMENT-BODY part 11 (the e2e twin is c4Barricades.spec.ts's MP51 block). Captured: r0004, ac, 2026-11-04
  // (agent-mail evidence eph-hunt-2026-11-01/segment-body/mp51-barricade/RESULTS.md, 2 trials each way): every wall of
  // access1's di_good faces +z and its collider's +0x80 reads 0x41 (bit 1 clear: one-sided, FUN_002d2890
  // D:L174831-174837; research 281 s4.3). From inside wc16 the original walks out through the intact planks (z 1046.4 ->
  // 1050.7 at 65 u/s); from outside (-z) it stops at z 1054.375-1054.417. The tolerance is LATER 681's stand-off residue
  // (0.6); the port stood at 1054.708 when this was written. Caveat: the walking client may have been a terrorist.
  it('access1 intact: walked out of wc16 the body passes the planks; walked in from outside it stops at the captured 1054.4; opened, it walks in', async () => {
    const m = await load();
    const walk = (grid: ReturnType<typeof groundGrid>, x: number, y: number, z: number, yaw: number, ticks: number): Walker => {
      const w = new Walker(grid);
      expect(w.place(x, y, z)).toBe(true);
      w.state.yaw = yaw;
      for (let i = 0; i < 18; i++) w.tick({ forward: 0, right: 0, boost: false });
      for (let i = 0; i < ticks; i++) w.tick({ forward: 1, right: 0, boost: false });
      return w;
    };
    const f = fresh(m);
    expect(f.w.isActive('worldmodel/access1=access1/good_parts/di_good')).toBe(true);
    expect(walk(f.grid, 1493.0955, 63.4, 1036.6, 180, 42).state.z, 'out from inside: through').toBeGreaterThan(1049.2);
    for (const x of [1488, 1493.0955, 1498]) {
      const z = walk(f.grid, x, 50, 1065, 0, 150).state.z;
      expect(Math.abs(z - 1054.4), `in from outside at x ${x}: z ${z.toFixed(3)}`).toBeLessThanOrEqual(0.6);
    }
    f.blast(0, C4);
    expect(f.w.isActive('worldmodel/access1=access1/good_parts/di_good')).toBe(false);
    expect(walk(f.grid, 1493.0955, 50, 1065, 0, 150).state.z, 'opened: in from outside').toBeLessThan(1048);
  }, 120_000);
});

// ---- Fish Hook on the disc (DF-8, research 387 s3) ---------------------------------------------------------------------

const HAVE_MP71 = !!DISC && existsSync(resolve(DISC, 'RUN/MP71.ZDB'));
/** Each barrier's placed prototype under its root (`access_fencegate`, `access_point`, `access_frontgate`). */
const FH = ['access_fencegate', 'access_point', 'access_frontgate'].map((p, k) => `worldmodel/access${k + 1}/${p}=${p}`);
/** A segment through each barrier's first `di_good` polygon, 8 u either side along its normal: two polygons intact. */
const FH_WITNESS: [V3, V3][] = [
  [[1937.75, 151.561, 1159.451], [1937.75, 151.561, 1175.451]],
  [[1707.888, 149.537, 816.532], [1707.816, 149.602, 832.532]],
  [[2285.37, 189.497, 832], [2285.37, 189.497, 848]],
];

/**
 * DF-8 (research 387 s3): Fish Hook's three access barriers are Vigilance's class (SUP-03) on MP71's own data -- each
 * `accessN` a kind-3 block (flags 0x2b, health 1, armour 0, shield 17) on `good_parts/di_good` under its placed
 * prototype, its sequence `EXECUTE_ACTION set_accessN`, the type-less `access_actionN` (points 2) running
 * `destroy_accessN`; `access4..6` are stored and unplaced (diagnostics). MP71 is no fixture until DF-2: SOCOM_DISC, else
 * skipped (said, never a pass).
 */
describe.skipIf(!HAVE_MP71)(`Fish Hook's three access barriers on the disc${HAVE_MP71 ? '' : ' (SOCOM_DISC with RUN/MP71.ZDB absent -- skipped; MP71 is no fixture until DF-2)'}`, () => {
  let map: SimMap;
  const load = async (): Promise<SimMap> => (map ??= await loadSimMap(new FsAssetSource(DISC as string), 'RUN/MP71.ZDB'));
  const fresh = (m: SimMap, room = true) => {
    const ground = forkGround(m.ground);
    const grid = groundGrid(ground);
    const sounds: string[] = [];
    const w = new WorldState(m.meta!, ground, grid, { sound: (name) => { sounds.push(name); } });
    if (room) w.skipEffects = ROOM_SKIP_EFFECTS_READING;
    w.applyInitial();
    const hits = (k: number): number => segmentHits(grid, FH_WITNESS[k]![0], FH_WITNESS[k]![1]).filter((h) => h.owner.path.startsWith(FH[k]!)).length;
    const pen = (p: WorldPoly): number => surfaceMaterial(p.material, m.defaultMaterial ?? '').penetration;
    /** A blast at `access_actionN`'s node, a unit up (AD-5's spot), through the reach gate (`blastLine`). */
    const blast = (k: number, c: { rating: number; radius: number }): string[] => {
      const a = m.meta!.actions.find((x) => x.node === `access_action${k + 1}`)!;
      const at: V3 = [a.at[0]!, a.at[1]! + 1, a.at[2]!];
      return w.health.blastAt(at, c.rating, c.radius, (to, target) => blastLine(grid, at, to, target, c.radius, pen)).map((id) => w.health.list[id]!.anim);
    };
    return { w, grid, sounds, hits, blast };
  };

  it('access1..3 bind (1/17 on di_good under their placed prototypes); access4..6 are unplaced diagnostics; access_actionN is type 8, points 2; every barrier node is a saved reference', async () => {
    const m = await load();
    const list = m.meta!.scene!.destructibles.filter((d) => d.anim.startsWith('access'));
    expect(list.map((d) => [d.anim, d.root, d.targetPath, d.health, d.armor, d.shield])).toEqual(
      [1, 2, 3].map((n) => [`access${n}`, `worldmodel/access${n}`, `${FH[n - 1]}/good_parts/di_good`, 1, 0, 17]),
    );
    expect(list.map((d) => m.ground.owners.filter((o) => o.path === d.targetPath).reduce((s, o) => s + o.count, 0))).toEqual([2, 7, 4]);
    expect(m.meta!.scene!.unplaced).toEqual(['access4', 'access5', 'access6']);
    for (const n of [4, 5, 6]) expect(m.meta!.diagnostics.some((d) => d.includes(`zAnim access${n}`) && d.includes('not placed'))).toBe(true);
    const w = fresh(m).w;
    for (let n = 1; n <= 3; n++) {
      const a = m.meta!.actions.find((x) => x.node === `access_action${n}`)!;
      expect([a.typeCode, a.valve, a.anims, a.points, a.range]).toEqual([8, `set_access${n}`, [`destroy_access${n}`], 2, 32]);
      expect(actionAtPick(m.meta!.actions, { path: a.path, point: a.at }, a.at)).toBeNull();
      expect(w.health.forAction(`set_access${n}`)?.anim).toBe(`access${n}`);
      for (const node of ['good_parts', 'good_parts/di_good', 'whats_left', 'bad_parts']) {
        expect(m.meta!.initial.find((e) => e.path === `${FH[n - 1]}/${node}`)?.saveActive, `access${n} ${node}`).toBe(true);
      }
    }
  }, 120_000);

  it("each barrier's witness segment goes 2 -> 0 when C4 (18) or an RPG round (20) opens it and stays 2 after an M67 (10); an M67 at access3 breaks plankaccess1 (HP 0) 83 u off", async () => {
    const m = await load();
    for (let k = 0; k < 3; k++) {
      for (const charge of [C4, RPG]) {
        const f = fresh(m);
        expect(f.hits(k), `access${k + 1} intact`).toBe(2);
        expect(f.blast(k, M67).filter((a) => a.startsWith('access')), `access${k + 1} after an M67`).toEqual([]);
        expect(f.hits(k), `access${k + 1} after an M67`).toBe(2);
        expect(f.blast(k, charge)).toContain(`access${k + 1}`);
        expect(f.hits(k), `access${k + 1} after ${charge.rating}`).toBe(0);
        expect([f.w.isActive(`${FH[k]}/good_parts`), f.w.isActive(`${FH[k]}/whats_left`), f.w.isActive(`${FH[k]}/bad_parts`)]).toEqual([false, true, false]);
      }
    }
    // The planks take any blast that reaches them (shield 0, HP 0; research 387 s2): from access_action3's node the
    // M67's 150 u reaches plankaccess1's midpoint.
    expect(fresh(m).blast(2, M67)).toEqual(['plankaccess1']);
  }, 120_000);

  it('destroy_accessN runs once a round; a joiner with skip_effects 1 takes the geometry and no debris or sound; a page plays .WOOD_DEBRIS once; the next round restores good_parts, di_good, whats_left and bad_parts', async () => {
    const m = await load();
    const room = fresh(m);
    for (let k = 0; k < 3; k++) expect(room.blast(k, C4)).toContain(`access${k + 1}`);
    for (let k = 0; k < 3; k++) expect(room.blast(k, RPG).filter((a) => a.startsWith('access'))).toEqual([]);
    expect(FH_WITNESS.map((_, k) => room.hits(k))).toEqual([0, 0, 0]);
    expect(room.sounds).toEqual([]);
    const joiner = fresh(m, false);
    joiner.w.applyWire(room.w.wireAll(1), true);
    expect(FH_WITNESS.map((_, k) => joiner.hits(k))).toEqual([0, 0, 0]);
    expect(joiner.sounds).toEqual([]);
    for (const p of FH) expect([joiner.w.isActive(`${p}/good_parts`), joiner.w.isActive(`${p}/whats_left`), joiner.w.isActive(`${p}/bad_parts`)]).toEqual([false, true, false]);
    const page = fresh(m, false);
    expect(page.blast(0, C4)).toContain('access1');
    expect(page.sounds).toEqual(['.WOOD_DEBRIS']);
    expect(page.w.isActive(`${FH[0]}/bad_parts`)).toBe(true);
    room.w.reset();
    expect(FH_WITNESS.map((_, k) => room.hits(k))).toEqual([2, 2, 2]);
    for (const p of FH) {
      expect([room.w.isActive(`${p}/good_parts`), room.w.isActive(`${p}/good_parts/di_good`), room.w.isActive(`${p}/whats_left`), room.w.isActive(`${p}/bad_parts`)])
        .toEqual([true, true, false, false]);
    }
    expect(room.w.health.list.filter((d) => d.anim.startsWith('access')).map((d) => room.w.health.hp(d.id))).toEqual([1, 1, 1]);
  }, 120_000);
});
