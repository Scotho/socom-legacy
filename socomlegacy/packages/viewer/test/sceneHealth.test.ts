// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  nodeRefInit, segmentHits, surfaceMaterial, ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER, type CollisionOwner, type EffectProgram, type GridParams, type WorldPoly,
  type ZAnimAnimation, type ZAnimArchive, type ZAnimNodeRef,
} from '@s2u/scene';
import { WorldState } from '../src/worldState';
import { groundGrid, packGround } from '../src/mover';
import { c4Eligible } from '../src/equipment';
import type { MapAction } from '../src/mapActions';
import type { MapInitial, MapMeta } from '../src/mapMeta';
import {
  armourStep, blastFalloff, blastLine, placeRefs, REACH_HITS_READING, reachGate, rangeFalloff, ROUND_SCENE_FALLOFF_READING, scaledDamage, SCENE_BLAST_REACH_PLACEHOLDER, SCENE_BOUNDS_MIDPOINT_READING,
  sceneProgramsOf, type SceneDestructible, type SceneProgram,
} from '../src/sceneHealth';

/**
 * MAP-06 (research 209 s13; research 174 s3, 173 s4, 203 s7): the scene objects' health on a synthetic hull (no game
 * data). Desert Glory's and Vigilance's access barrier in miniature -- `access1` whose `di_good` wall (shield 17, health
 * 1) runs `EXECUTE_ACTION set_access1`, the type-less action `access_action1` on that valve, and its `destroy_access1`
 * as the disc has it (its context valve guards it; `access_destroy` turns `good_parts` and `di_good` off and
 * `whats_left` on, then waits) -- beside a shield-0 pane that turns itself off, a Crossroads-style base (health 2, shield
 * 21) and a plank whose block reads health 0.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
const across = (path: string, x: number, z0 = -20, z1 = 20, h = 40): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([x, 0, z0, x, 0, z1, x, h, z1, x, h, z0]),
});
const ACCESS = 'worldmodel/access1', GOOD = `${ACCESS}/good_parts`, DI = `${GOOD}/di_good`, LEFT = `${ACCESS}/whats_left`;
const DILEFT = `${LEFT}/dileft`, ACTION = `${ACCESS}/access_action1`;
const SLAB = 'worldmodel/door/door1=door1/door_slab', PANE = `${SLAB}/pane1`;
const BASE = 'worldmodel/terrorist_base', BASEDI = `${BASE}/healthy/basedi`;
const PLANK = 'worldmodel/plankaccess1', PLANKDI = `${PLANK}/di_good`;
const POLYS: WorldPoly[] = [
  { ...across('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) },
  across(DI, 50), across(DILEFT, 60), across(PANE, -50), across(BASEDI, 200, 280, 320), across(PLANKDI, -200),
];
const PLACED = ['worldmodel/floor', ACCESS, GOOD, DI, LEFT, DILEFT, ACTION, 'worldmodel/door', 'worldmodel/door/door1=door1', SLAB, PANE,
  BASE, `${BASE}/healthy`, BASEDI, PLANK, PLANKDI];

function hull() {
  const owners: CollisionOwner[] = POLYS.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: FLAGS }));
  return packGround(params, POLYS, owners);
}

const action: MapAction = {
  node: 'access_action1', path: ACTION, at: [50, 0, 0], type: '', typeCode: 8, valve: 'set_access1', anims: ['destroy_access1'],
  team: null, range: 32, elevation: -1, points: 2, bitmap: '',
};

/** `destroy_access1` as Desert Glory's MZANIM holds it (research 209 s13), with a closing wait so it runs a while. */
const destroyAccess: SceneProgram = {
  search: [0, 0, 1, 1, 1],
  program: {
    name: 'destroy_access1', root: 1, flags: 0x22, nodes: ['NA', 'access1', 'good_parts', 'di_good', 'whats_left'],
    sequences: [
      {
        name: 'NA', activation: 1, ops: [
          { op: 'if', conditions: [{ kind: 'valve', valve: 'NA', operation: 2, operand: 0, context: true }] },
          { op: 'callSequence', sequence: 'access_destroy' },
          { op: 'valve', valve: 'NA', operation: 0x0b, operand: 1, context: true },
          { op: 'endif' },
        ],
      },
      {
        name: 'access_destroy', activation: 2, ops: [
          { op: 'active', node: 2, on: false }, { op: 'active', node: 3, on: false }, { op: 'active', node: 4, on: true },
          { op: 'if', conditions: [{ kind: 'valve', valve: 'skip_effects', operation: 2, operand: 0 }] },
          { op: 'sound', sound: '.WOOD_DEBRIS', node: -7, volume: 1 },
          { op: 'endif' },
          { op: 'wait', seconds: 0.5, range: 0, frames: null },
        ],
      },
    ],
  },
};

const prog = (name: string, nodes: string[], ops: EffectProgram['sequences'][number]['ops']): EffectProgram =>
  ({ name, root: 1, flags: 0x23, nodes, sequences: [{ name: 'NA', activation: 1, ops }] });

function destructibles(): SceneDestructible[] {
  const d = (id: number, anim: string, root: string, targetPath: string, health: number, shield: number, program: EffectProgram, nodes: (string | null)[]): SceneDestructible =>
    ({ id, key: `${anim}#0@${root}`, anim, instance: PLACED.indexOf(root), targetPath, root, health, armor: 0, shield, program, nodes });
  return [
    d(0, 'access1', ACCESS, DI, 1, 17, prog('access1', ['NA', 'access1', 'di_good'], [{ op: 'executeAction', anim: 'set_access1' }]), [null, ACCESS, DI]),
    d(1, 'door_slab', SLAB, PANE, 1, 0, prog('door_slab', ['NA', 'door_slab', 'pane1'], [{ op: 'active', node: 2, on: false }]), [null, SLAB, PANE]),
    d(2, 'destroy_terrorist_base', BASE, BASEDI, 2, 21, prog('destroy_terrorist_base', ['NA', 'terrorist_base', 'basedi'], [{ op: 'active', node: 2, on: false }]), [null, BASE, BASEDI]),
    d(3, 'plankaccess1', PLANK, PLANKDI, 0, 17, prog('plankaccess1', ['NA', 'plankaccess1', 'di_good'], [{ op: 'active', node: 2, on: false }]), [null, PLANK, PLANKDI]),
  ];
}

function world(): { world: WorldState; hits: (from: [number, number, number], to: [number, number, number]) => string[]; sounds: string[] } {
  const ground = hull();
  const grid = groundGrid(ground);
  const instances = PLACED.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const initial: MapInitial[] = [
    { path: GOOD, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: LEFT, deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
    { path: DI, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: PANE, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: BASEDI, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
    { path: PLANKDI, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
  ];
  const meta: MapMeta = {
    stem: 'SYN', actions: [action], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), initial, diagnostics: [],
    scene: { destructibles: destructibles(), programs: [destroyAccess] },
  };
  const sounds: string[] = [];
  const w = new WorldState(meta, ground, grid, { sound: (name) => { sounds.push(name); } });
  w.applyInitial();
  return { world: w, hits: (from, to) => segmentHits(grid, from, to).map((h) => h.owner.path), sounds };
}

const M4 = { kind: 'impact' as const, rating: 2.3, modifier: 0.3, point: [0, 20, 0] as [number, number, number] };
const blast = (rating: number) => ({ kind: 'explosion' as const, rating, modifier: 0, point: [0, 20, 0] as [number, number, number] });

describe('the scene objects\' health (MAP-06): Anim_Health bound to its placed node', () => {
  it("C4 eligibility (FUN_002739b0): health > 0 and shield <= the charge's 18 -- shield 17 accepted, 21 refused, health 0 refused", () => {
    const { world: w } = world();
    const h = w.health;
    expect([0, 1, 2, 3].map((id) => h.accepts(id, 18))).toEqual([true, true, false, false]);
    expect(h.accepts(2, 50)).toBe(true);                                   // MPBOMB's 50 opens the base (research 203 s7)
    expect(h.c4TargetAt(DI, 18)).toBe(0);
    expect(h.c4TargetAt(BASEDI, 18)).toBeNull();
    expect(h.c4TargetAt(PLANKDI, 18)).toBeNull();
    expect(h.c4TargetAt('worldmodel/floor', 18)).toBeNull();               // no destructible's node
    expect(h.at(DI)).toBe(0);
    expect(h.at(`${DI}/deeper`)).toBe(0);                                   // the target covers what lies under it
    expect(c4Eligible(h, 0, 18)).toBe(true);
    expect(c4Eligible(h, 2, 18)).toBe(false);
  });

  it('a hit qualifies when the rating plus the modifier reaches the shield (FUN_003c7490): 2.3 + 0.3 breaks shield 0 and not 17; RPG 20 and C4 18 open 17; M67 10 does not', () => {
    const { world: w } = world();
    const h = w.health;
    expect(h.hitAt(PANE, M4)).toEqual({ applied: true, died: true });     // shield 0: the pane
    expect(h.hitAt(DI, M4)).toEqual({ applied: false, died: false });     // 2.6 < 17
    expect(h.hitAt(DI, blast(10))).toEqual({ applied: false, died: false });   // M67
    expect(h.hp(0)).toBe(1);
    expect(h.hitAt(DI, blast(20))).toEqual({ applied: true, died: true });     // RPG
    w.reset();
    expect(h.hp(0)).toBe(1);
    expect(h.hitAt(DI, blast(18))).toEqual({ applied: true, died: true });     // C4
    w.reset();
    // The base takes 18 nowhere (21) and 50 at once (health 2).
    expect(h.hitAt(BASEDI, blast(18))).toEqual({ applied: false, died: false });
    expect(h.hitAt(BASEDI, blast(50))).toEqual({ applied: true, died: true });
    // AD-5: the damage is read (FUN_003c7490, FUN_003c7600); what stays a placeholder is the blast's list and its line.
    // Was 'full-rating' (MAP-06 to AD-4).
    expect(SCENE_BLAST_REACH_PLACEHOLDER).toBe('clear-line');
  });

  it('at health <= 0 the bound sequence runs once: EXECUTE_ACTION finds the action by valve, the destroy program turns good_parts off and whats_left on, a second hit changes nothing; reset restores health and geometry together', () => {
    const { world: w, hits, sounds } = world();
    const h = w.health;
    const street = (): string[] => hits([0, 20, 0], [100, 20, 0]);
    expect(street()).toEqual([DI]);                                        // the barrier stands, its rubble off (bit 31)
    const revision = w.revision;
    expect(h.hitAt(DI, blast(18))).toEqual({ applied: true, died: true });
    // access1's sequence: EXECUTE_ACTION set_access1 -> access_action1 (by valve, FUN_002b4e80) -> destroy_access1 with
    // the action's node and valve as its context (FUN_002b44e0): the context valve was 0, so access_destroy ran.
    expect(w.isActive(GOOD)).toBe(false);
    expect(w.isActive(DI)).toBe(false);
    expect(w.isActive(LEFT)).toBe(true);
    expect(w.valve('set_access1')).toBe(1);
    expect(street()).toEqual([DILEFT]);                                    // through the gap to the rubble behind it
    expect(sounds).toEqual(['.WOOD_DEBRIS']);
    expect(w.revision).toBeGreaterThan(revision);
    // FUN_002b44e0: refused while its animation runs (the closing wait), taken once it has finished.
    expect(w.executeAction('set_access1')).toBe(false);
    w.step(1);
    expect(w.executeAction('set_access1')).toBe(true);                     // runs, but the context valve is 1 now: nothing
    expect(sounds).toEqual(['.WOOD_DEBRIS']);
    expect(w.executeAction('no_such_valve')).toBe(false);
    // A second hit: the record is spent, nothing changes.
    expect(h.hitAt(DI, blast(50))).toEqual({ applied: false, died: false });
    expect(h.hp(0)).toBeLessThanOrEqual(0);
    // The round's reset: the health with the geometry (FUN_00273960, FUN_00273ee0 from FUN_002ac0e0; research 174 s3).
    w.reset();
    expect(h.hp(0)).toBe(1);
    expect(w.isActive(GOOD)).toBe(true);
    expect(w.isActive(LEFT)).toBe(false);
    expect(w.valve('set_access1')).toBe(0);
    expect(street()).toEqual([DI]);
    expect(sounds).toEqual(['.WOOD_DEBRIS']);                             // the reset runs no program: no effect played
    expect(w.busy).toBe(false);
    // And it falls again in the new round: nothing of the last is left behind.
    expect(h.hitAt(DI, blast(18))).toEqual({ applied: true, died: true });
    expect(street()).toEqual([DILEFT]);
    expect(sounds).toEqual(['.WOOD_DEBRIS', '.WOOD_DEBRIS']);
  });

  it('an HP-0 block is a hit trigger and never a C4 target', () => {
    const { world: w } = world();
    const h = w.health;
    expect(h.hp(3)).toBe(0);
    expect(h.accepts(3, 18)).toBe(false);
    expect(h.accepts(3, 1000)).toBe(false);                                // health > 0 is the accept's first test
    expect(h.c4TargetAt(PLANKDI, 1000)).toBeNull();
    expect(h.hitAt(PLANKDI, M4)).toEqual({ applied: false, died: false }); // the shield still gates it
    // FUN_00273a50's post-hit test is hp <= 0 with no test that the old hp was positive: the qualifying hit runs it.
    expect(h.hitAt(PLANKDI, blast(20))).toEqual({ applied: true, died: true });
    expect(w.isActive(PLANKDI)).toBe(false);
    expect(h.at(PLANKDI)).toBeNull();                                      // an inactive target is no one's to hit
  });

  it('a blast reaches a destructible whose bounds lie inside its radius along a line clear to its midpoint, and takes the read damage there (SCENE_BLAST_REACH_PLACEHOLDER)', () => {
    const { world: w, hits } = world();
    const h = w.health;
    const clear = (from: [number, number, number]) => (to: [number, number, number], target: string): boolean =>
      hits(from, to).every((p) => p === target || p.startsWith(`${target}/`));
    // C4 (18, 50 u) 10 short of the barrier: the barrier (17) falls; the pane at x -50 is 90 off, out of reach.
    expect(h.blastAt([40, 20, 0], 18, 50, clear([40, 20, 0]))).toEqual([0]);
    expect(w.isActive(PANE)).toBe(true);
    w.reset();
    // An M67 (10, 150 u) at the same place leaves the barrier (17) and breaks the pane 90 off (shield 0). The line is
    // the target's own: from behind the rubble's wall (x 60) a C4 reaches nothing.
    expect(h.blastAt([40, 20, 0], 10, 150, clear([40, 20, 0]))).toEqual([1]);
    expect(w.isActive(DI)).toBe(true);
    expect(w.isActive(PANE)).toBe(false);
    w.setActive(LEFT, true);
    expect(h.blastAt([70, 20, 0], 18, 50, clear([70, 20, 0]))).toEqual([]);
    expect(w.isActive(DI)).toBe(true);
  });
});

describe("PAR-92 B2: placeRefs reads a reference's parent (ZANIM_PARENT_SCOPE_READING; research 319 §1.2-§1.3)", () => {
  // `FUN_0026f4e0` D:L118221-118228: a non-zero parent beneath its parent's node only, no world fallback, the search
  // mode unread; 0xf9 (`root`) beneath the instance, else the root (§1.3); 0xfa the caller's, none at a placement.
  const paths = ['worldmodel/pane', 'worldmodel/slab_1', 'worldmodel/slab_1=slab/glass', 'worldmodel/rig_1', 'worldmodel/rig_1=rig/left',
    'worldmodel/rig_1=rig/left/hand', 'worldmodel/rig_1=rig/arm', 'worldmodel/rig_1=rig/arm/hand', 'worldmodel/rotor', 'worldmodel/heli_1',
    'worldmodel/heli_1=heli/body', 'worldmodel/heli_1=heli/body/rotor'];
  const meta: Pick<MapMeta, 'instances'> = {
    instances: paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path })),
  };

  it("a parent-k reference is placed beneath reference k's placement: the rig's arm/hand, not its first hand", () => {
    const names = ['NA', 'rig_1', 'arm', 'hand'];
    expect(placeRefs(meta, names, [0, 0, 0, 0], 1, 'worldmodel/rig_1', [0, 0, 0, 2]))
      .toEqual([null, 'worldmodel/rig_1', 'worldmodel/rig_1=rig/arm', 'worldmodel/rig_1=rig/arm/hand']);
    // Parent 0 as before (SCENE_INSTANCE_SCOPE_READING): the first hand beneath the root.
    expect(placeRefs(meta, names, [0, 0, 0, 0], 1, 'worldmodel/rig_1')[3]).toBe('worldmodel/rig_1=rig/left/hand');
  });

  it('parent 0xf9, search 0: beneath the root only -- no world fallback when the root holds none', () => {
    const names = ['NA', 'slab_1', 'pane'];
    expect(placeRefs(meta, names, [0, 0, 0], 1, 'worldmodel/slab_1', [0, 0, 'root'])).toEqual([null, 'worldmodel/slab_1', null]);
    expect(placeRefs(meta, names, [0, 0, 0], 1, 'worldmodel/slab_1')[2]).toBe('worldmodel/pane');
  });

  it("parent k reads no search mode, and has no world fallback: a search-3 rotor beneath its heli; none where k holds none", () => {
    expect(placeRefs(meta, ['NA', 'heli_1', 'rotor'], [0, 0, 3], 1, null, [0, 0, 1])).toEqual([null, 'worldmodel/heli_1', 'worldmodel/heli_1=heli/body/rotor']);
    expect(placeRefs(meta, ['NA', 'slab_1', 'rotor'], [0, 0, 0], 1, null, [0, 0, 1])).toEqual([null, 'worldmodel/slab_1', null]);
  });

  it('`caller` and a parent past the table are placed nowhere', () => {
    expect(placeRefs(meta, ['NA', 'rig_1', 'hand', 'arm'], [0, 0, 0, 0], 1, null, [0, 0, 'caller', ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER]))
      .toEqual([null, 'worldmodel/rig_1', null, null]);
  });

  it("sceneProgramsOf carries the parents where any is not 0, and leaves them out where all are (the fixtures' maps)", () => {
    const ref = (name: string, parent: ZAnimNodeRef['parent']): ZAnimNodeRef => ({ parent, name, search: 0, word: 0, flags: 0, init: nodeRefInit(0) });
    const anim = (name: string, refs: ZAnimNodeRef[]): ZAnimAnimation => ({
      name, names: ['NA', name], nodeRefs: refs, health: null, sequences: [],
      params: { nameIndex: 1, rootNodeIndex: 1, paused: 0, state: 1, flags: 0x22, timer: 0, priority: 0, seqOffsets: [0, 0, 0, 0] },
    });
    const archive: ZAnimArchive = { main: { version: 0, gravity: -98, flags: 0, userActionAnimIndex: 0 }, names: [], sets: [{ name: 'mission', names: ['NA'], rdrPaths: [], siScripts: [], anims: [
      anim('grab', [ref('NA', 0), ref('rig_1', 0), ref('arm', 0), ref('hand', 2)]), anim('plain', [ref('NA', 0), ref('rig_1', 0)]),
    ] }] };
    const [grab, plain] = sceneProgramsOf(archive);
    expect(grab!.parents).toEqual([0, 0, 0, 2]);
    expect(plain!.parents).toBeUndefined();
  });
});

// ---- AD-5: the destructible's damage (research 209 s13; reconciliation C42) ----------------------------------------

type V3 = [number, number, number];

/**
 * AD-5 (web sprint 40; reconciliation C42, chunks 04 and 10): the scene's damage as `FUN_003c7490` (D:L318596-318640)
 * and `FUN_003c7600` (D:L318650-318830) compute it at the point `FUN_00273a50` (D:L120968-120978) hands them -- the
 * target's transformed bounds midpoint: the first shield test before the falloff, the falloff (a blast's full to half
 * its radius, then linear to 0 at it; a round's full to `Effective_Range`, then linear to `Maximum_Range`), the second
 * shield test after it, x14, the armour step with the round's Piercing, the health floored at 0. Was (MAP-06 to AD-4):
 * the full rating plus modifier, no x14, the armour absorbing, the health unfloored, measured at the nearest bounds
 * point (`SCENE_BLAST_REACH_PLACEHOLDER` 'full-rating').
 */
describe('AD-5: falloff, shield, x14, armour and the midpoint (FUN_003c7490, FUN_003c7600, FUN_00273a50)', () => {
  /** A wall along x at `z` (x0..x1, y 0..h): one polygon. */
  const along = (path: string, z: number, x0: number, x1: number, h = 40): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, 0, z, x1, 0, z, x1, h, z, x0, h, z]),
  });
  type Target = { path: string; polys: WorldPoly[]; health: number; armor?: number; shield: number };
  /** A floor, the targets and any `others` (occluders); each target a destructible that turns itself off at its death. */
  const rig = (targets: Target[], others: WorldPoly[] = []) => {
    const polys: WorldPoly[] = [POLYS[0]!, ...targets.flatMap((t) => t.polys), ...others];
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: FLAGS }));
    const ground = packGround(params, polys, owners);
    const grid = groundGrid(ground);
    const paths = ['worldmodel/floor', ...new Set(polys.slice(1).map((p) => p.path))];
    const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
    const list: SceneDestructible[] = targets.map((t, id) => ({
      id, key: `t${id}#0@${t.path}`, anim: `t${id}`, instance: paths.indexOf(t.path), targetPath: t.path, root: t.path,
      health: t.health, armor: t.armor ?? 0, shield: t.shield, program: prog(`t${id}`, ['NA', 'self'], [{ op: 'active', node: 1, on: false }]),
      nodes: [null, t.path],
    }));
    const meta: MapMeta = {
      stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
      initial: targets.map((t) => ({ path: t.path, deactivate: false, saveActive: true, saveTransform: false, saveParent: false })),
      scene: { destructibles: list, programs: [] },
    };
    const w = new WorldState(meta, ground, grid);
    w.applyInitial();
    /** The room's line test: from `from` to the point, every surface met the target's own. */
    const clear = (from: V3) => (to: V3, target: string): boolean =>
      segmentHits(grid, from, to).every((h) => h.owner.path === target || h.owner.path.startsWith(`${target}/`));
    return { w, h: w.health, clear };
  };
  /** A 2-thick post across x 100..102 (z -20..20, y 0..40): its box's midpoint is (101, 20, 0). */
  const POST = 'worldmodel/post';
  const post = (health: number, shield: number, armor = 0): Target => ({ path: POST, polys: [across(POST, 100), across(POST, 102)], health, armor, shield });
  const MID: V3 = [101, 20, 0];
  /** A point `d` short of the post's midpoint, level with it. */
  const short = (d: number): V3 => [MID[0] - d, MID[1], MID[2]];
  const WALL = 'worldmodel/wall';
  /** A wall along z 0, x 0..200 (y 0..40): its midpoint (100, 20, 0). */
  const long = (health: number): Target => ({ path: WALL, polys: [along(WALL, 0, 0, 200)], health, shield: 0 });

  it('FUN_003c7600: a blast full to half its radius, linear to 0 at it (D:L318708-318735); a round full to Effective_Range, linear to Maximum_Range (D:L318737-318760); x14 after the second shield test; the armour step', () => {
    expect([0, 40, 50, 75, 100, 100.01, 200].map((d) => blastFalloff(18, d, 100))).toEqual([18, 18, 18, 9, 0, 0, 0]);
    expect(blastFalloff(18, 90, 100)).toBeCloseTo(3.6, 12);
    expect([0, 600, 700, 800, 1000].map((d) => rangeFalloff(2.6, d, 600, 1000))).toEqual([2.6, 2.6, 2.6 * 0.75, 2.6 * 0.5, 0]);
    expect(rangeFalloff(2.6, 1100, 600, 1000)).toBeLessThan(0);            // past Maximum_Range: under any shield
    expect(rangeFalloff(2.6, 601, 600, 600)).toBe(0);                     // Maximum_Range - Effective_Range <= 0: none past E
    expect(rangeFalloff(2.6, 600, 600, 600)).toBe(2.6);
    // D:L318763-318767: a falloff rating of 0, or under the shield, deals nothing; else x14 (`FUN_003c5950`).
    expect([scaledDamage(18, 17), scaledDamage(17, 17), scaledDamage(16.99, 17), scaledDamage(0, 0), scaledDamage(-1, 0)]).toEqual([252, 238, 0, 0, 0]);
    // D:L318624-318633: the armour takes A x (10 - P) / 10 off the damage, floored at 0, and loses a quarter of what it took.
    expect(armourStep(70, 50, 3)).toEqual({ damage: 35, armour: 41.25 });
    expect(armourStep(70, 50, 10)).toEqual({ damage: 70, armour: 50 });
    expect(armourStep(70, 100, 0)).toEqual({ damage: 0, armour: 82.5 });
    expect(armourStep(70, 0, 0)).toEqual({ damage: 70, armour: 0 });
    expect(armourStep(70, 10, 0)).toEqual({ damage: 60, armour: 7.5 });
  });

  it('a blast 0.4R from the midpoint takes the full rating x14, at 0.75R half of it, at R and past it nothing', () => {
    const taken = (d: number): number => {
      const { h, clear } = rig([post(1000, 0)]);
      expect(h.blastAt(short(d), 10, 100, clear(short(d)))).toEqual([]);
      return 1000 - h.hp(0);
    };
    expect([40, 75, 100, 101].map(taken)).toEqual([140, 70, 0, 0]);       // 101: the nearest point (x 100) at R, eligible
  });

  it('the midpoint, not the nearest point: a long wall whose nearest point is inside the radius and its midpoint past it takes nothing; nearest at 0.21R and midpoint at 0.75R, half', () => {
    // The blast at (-30, 20, 0): nearest 30, midpoint 130 (radius 100).
    const a = rig([long(1000)]);
    expect(a.h.blastAt([-30, 20, 0], 10, 100, a.clear([-30, 20, 0]))).toEqual([]);
    expect(a.h.hp(0)).toBe(1000);                                         // was (the nearest point, the full rating): 990
    // The blast at (-40, 20, 0), radius 140 / 0.75: nearest 40 (0.21R, full by the nearest point), midpoint 140 (0.75R).
    const b = rig([long(1000)]);
    b.h.blastAt([-40, 20, 0], 10, 140 / 0.75, b.clear([-40, 20, 0]));
    expect(b.h.hp(0)).toBeCloseTo(930, 9);                                // was: 990
    expect(SCENE_BOUNDS_MIDPOINT_READING).toBe('polygon-box');
  });

  it('the shield: on the rating before the falloff (at it qualifies, under it is refused, D:L318622) and on the falloff rating after it, strictly (D:L318763)', () => {
    const hp = (rating: number, d: number, shield: number): number => {
      const { h, clear } = rig([post(1000, shield)]);
      h.blastAt(short(d), rating, 100, clear(short(d)));
      return h.hp(0);
    };
    expect(hp(17, 10, 17)).toBe(1000 - 238);                              // at the shield: qualifies
    expect(hp(16.99, 10, 17)).toBe(1000);                                 // under it: refused
    expect(hp(18, 50, 17)).toBe(1000 - 252);                              // 0.5R: still full
    expect(hp(18, 75, 17)).toBe(1000);                                    // 0.75R: 9 < 17 after the falloff
    expect(hp(18, 52.5, 17)).toBeCloseTo(1000 - 18 * 0.95 * 14, 9);       // 0.525R: 17.1, over it
    expect(hp(18, 53, 17)).toBe(1000);                                    // 0.53R: 16.92, under it -- C4's 18 at 17: within 0.528R
  });

  it('x14 and the health floored at 0 (D:L318634-318638): rating 1 kills health 14 exactly, leaves 15 at 1; health 2 struck by 50 reads 0', () => {
    const hit = (health: number, rating: number) => {
      const { h, clear } = rig([post(health, 0)]);
      const died = h.blastAt(short(10), rating, 100, clear(short(10)));
      return [died, h.hp(0)];
    };
    expect(hit(14, 1)).toEqual([[0], 0]);
    expect(hit(15, 1)).toEqual([[], 1]);
    expect(hit(2, 50)).toEqual([[0], 0]);                                 // was -48 (2 - 50: no x14, no floor)
  });

  it("the armour (D:L318624-318633) with the round's Piercing: armour 50 against 70 lets 35 through at Piercing 3 and keeps 41.25; at 10 all of it; absent, Piercing 0", () => {
    const run = (piercing: number | undefined) => {
      const { h, clear } = rig([post(1000, 0, 50)]);
      h.blastAt(short(10), 5, 100, clear(short(10)), piercing === undefined ? undefined : { piercing });
      return [h.hp(0), h.armor(0)];
    };
    expect(run(3)).toEqual([965, 41.25]);
    expect(run(10)).toEqual([930, 50]);
    expect(run(undefined)).toEqual([980, 37.5]);                           // 70 - 50, the armour less 50 / 4
    // Was: the armour absorbed up to the damage (50 of 5: 45 left, health 1000).
  });

  it('the reach line runs to the midpoint: a slab across the line to the midpoint, under which the line to the nearest point passes, refuses it; the line test is handed the midpoint', () => {
    // A slab across x 90 (z -20..20, y 6..30); the blast at (60, 5, 0): the level line to the nearest point (100, 5, 0)
    // passes under it, the line to the midpoint (101, 20, 0) meets it at y 16.
    const SLAB = 'worldmodel/slab';
    const slab: WorldPoly = { ...across(SLAB, 90), points: Float32Array.from([90, 6, -20, 90, 6, 20, 90, 30, 20, 90, 30, -20]) };
    const from: V3 = [60, 5, 0];
    const seen: V3[] = [];
    const a = rig([post(1, 0)], [slab]);
    expect(a.h.blastAt(from, 10, 100, (to, target) => { seen.push([...to] as V3); return a.clear(from)(to, target); })).toEqual([]);
    expect(seen).toEqual([MID]);
    expect(a.w.isActive(POST)).toBe(true);                                // was: reached (its line to (100, 5, 0) clear)
    const b = rig([post(1, 0)]);
    expect(b.h.blastAt(from, 10, 100, b.clear(from))).toEqual([0]);
  });

  it("GetDamage's own factor after x14 (D:L318769-318782): the claymore's 32nd outside its cone; a factor of 0 deals nothing but a health-0 block's death still runs", () => {
    const { h, clear } = rig([post(1000, 0)]);
    h.blastAt(short(10), 10, 100, clear(short(10)), { cone: () => 1 / 32 });
    expect(h.hp(0)).toBe(1000 - 140 / 32);
    const t = rig([post(0, 0)]);
    expect(t.h.blastAt(short(10), 10, 100, t.clear(short(10)), { cone: () => 0 })).toEqual([0]);
    // And a qualifying blast whose falloff is 0 at the midpoint (past R; the nearest point inside it): the same.
    const u = rig([long(0)]);
    expect(u.h.blastAt([-30, 20, 0], 10, 100, u.clear([-30, 20, 0]))).toEqual([0]);
  });

  it("a round (FUN_003c7600's other branch): ImpactDamage + modifier x14, full to Effective_Range from the shot's start to the midpoint, linear to Maximum_Range, nothing past it (ROUND_SCENE_FALLOFF_READING)", () => {
    const round = (from: V3 | undefined) => {
      const { h } = rig([post(1000, 0)]);
      const r = h.hitAt(POST, { kind: 'impact', rating: 2.3, modifier: 0.3, point: [100, 20, 0], piercing: 3, ...(from ? { range: { from, effective: 600, maximum: 1000 } } : {}) });
      return [r, 1000 - h.hp(0)] as const;
    };
    expect(round([MID[0] - 500, 20, 0])[1]).toBeCloseTo(36.4, 9);
    expect(round([MID[0] - 800, 20, 0])[1]).toBeCloseTo(18.2, 9);
    expect(round([MID[0] - 1001, 20, 0])).toEqual([{ applied: true, died: false }, 0]);   // past Maximum_Range: applied, nothing
    expect(round(undefined)[1]).toBeCloseTo(36.4, 9);                      // no shot to measure: the full rating
    expect(ROUND_SCENE_FALLOFF_READING).toBe('shot-start');
    // Desert Glory's truck_stop_gas_hit (health 80, shield 0; research 209 s13): an M4A1's rounds inside Effective_Range
    // take 36.4 each, so it falls to the third (was: 2.6 a round, the 31st).
    const { h } = rig([post(80, 0)]);
    const shots = [1, 2, 3].map(() => h.hitAt(POST, { kind: 'impact', rating: 2.3, modifier: 0.3, point: [100, 20, 0], range: { from: [0, 20, 0], effective: 600, maximum: 1000 } }).died);
    expect(shots).toEqual([false, false, true]);
  });

  it('a direct explosion hit (`hitAt` with its radius) measures from its point to the midpoint; without one, at the full rating', () => {
    const a = rig([post(1000, 0)]);
    a.h.hitAt(POST, { kind: 'explosion', rating: 10, modifier: 0, point: short(75), radius: 100 });
    expect(a.h.hp(0)).toBe(930);
    const b = rig([post(1000, 0)]);
    b.h.hitAt(POST, { kind: 'explosion', rating: 10, modifier: 0, point: short(75) });
    expect(b.h.hp(0)).toBe(860);
  });
});

/**
 * AD-5, the reach gate (`FUN_003c80e0` D:L319096-319143; reconciliation chunk 04, C42's PENETRATION field
 * `FUN_002dde40` D:L181383-181385): on the ray from the blast to the target's midpoint, the squared radius multiplied by
 * each other surface's material PENETRATION (`+0x24`), refused at a PENETRATION under 0.0001 or when the product falls
 * under the ray's squared length; the target's own surfaces skipped (D:L319104-319108; `REACH_HITS_READING`).
 */
describe('AD-5: the reach gate (FUN_003c80e0)', () => {
  it('no surface between: reached at any length (the gate has no radius test of its own); a PENETRATION under 0.0001 refuses; else R^2 x P against the length^2', () => {
    expect(reachGate(50, 500, [])).toBe(true);
    expect(reachGate(50, 1, [0])).toBe(false);
    expect(reachGate(50, 1, [0.00009])).toBe(false);
    // Vigilance's access3 from its action point: a WOOD_THIN wall (0.25) on a 12.61 ray -- 625 >= 159: reached.
    expect(reachGate(50, 12.61, [0.25])).toBe(true);
    expect(reachGate(50, 25, [0.25])).toBe(true);                         // 625 >= 625
    expect(reachGate(50, 25.01, [0.25])).toBe(false);
    expect(reachGate(50, 12, [0.25, 0.25])).toBe(true);                   // 156.25 >= 144
    expect(reachGate(50, 13, [0.25, 0.25])).toBe(false);                  // 156.25 < 169
  });

  it("blastLine: the surfaces on the segment that are not the target's own, through their materials (the table's PENETRATION); a STONE slab refuses, a WOOD_THIN one within R/2 passes, the target's own surfaces never count", () => {
    const POSTP = 'worldmodel/post', SLAB = 'worldmodel/slab';
    // Material bytes (`materialTable`: two built-ins, then SOILS): 7 STONE (0), 20 WOOD_THIN (0.25), 19 WOOD_THICK (0).
    const slab = (material: number): WorldPoly => ({ ...across(SLAB, 90), material, points: Float32Array.from([90, 0, -20, 90, 0, 20, 90, 40, 20, 90, 40, -20]) });
    const grid = (material: number) => {
      const polys = [{ ...across(POSTP, 100), material: 19 }, { ...across(POSTP, 102), material: 19 }, slab(material)];
      const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: FLAGS }));
      return groundGrid(packGround(params, polys, owners));
    };
    const mat = (p: WorldPoly): number => surfaceMaterial(p.material, '').penetration;
    const from: [number, number, number] = [80, 20, 0], mid: [number, number, number] = [101, 20, 0];
    expect(blastLine(grid(7), from, mid, POSTP, 50, mat)).toBe(false);    // STONE: 0 < 0.0001
    expect(blastLine(grid(20), from, mid, POSTP, 50, mat)).toBe(true);    // WOOD_THIN: 625 >= 441
    expect(blastLine(grid(20), from, mid, POSTP, 40, mat)).toBe(false);   // 400 < 441
    expect(blastLine(grid(20), [95, 20, 0], mid, POSTP, 1, mat)).toBe(true);   // past the slab: the post's own WOOD_THICK skipped
  });

  it("a surface counts once per owner (the engine's type-2 record keeps the first hit per model, research 23 s1.1): a two-faced WOOD_THIN wall and a crossing through two triangles' shared edge each multiply 0.25 once -- C4's 50 u reaches 25 u past them, not 12.5", () => {
    const POSTP = 'worldmodel/post', SLAB = 'worldmodel/slab';
    const face = (x: number, pts: number[]): WorldPoly => ({ ...across(SLAB, x), material: 20, ptcount: pts.length / 3, points: Float32Array.from(pts) });
    /** The post (WOOD_THICK, its own owner) and the slab's polygons under one owner. */
    const grid = (slab: WorldPoly[]) => {
      const post = [{ ...across(POSTP, 100), material: 19 }, { ...across(POSTP, 102), material: 19 }];
      const polys = [...post, ...slab];
      const owners: CollisionOwner[] = [
        { modelName: 'worldmodel', path: POSTP, first: 0, count: 2, flags: FLAGS },
        { modelName: 'worldmodel', path: SLAB, first: 2, count: slab.length, flags: FLAGS },
      ];
      return groundGrid(packGround(params, polys, owners));
    };
    const mat = (p: WorldPoly): number => surfaceMaterial(p.material, '').penetration;
    const mid: [number, number, number] = [101, 20, 0];
    // Two faces 1 apart (x 90 and 91), one owner.
    const twoFaced = grid([face(90, [90, 0, -20, 90, 0, 20, 90, 40, 20, 90, 40, -20]), face(91, [91, 0, -20, 91, 0, 20, 91, 40, 20, 91, 40, -20])]);
    expect(segmentHits(twoFaced, [77, 20, 0], mid).filter((h) => h.owner.path === SLAB)).toHaveLength(2);
    expect(blastLine(twoFaced, [77, 20, 0], mid, POSTP, 50, mat)).toBe(true);   // 24 u: 625 >= 576 (was: 156.25 < 576, refused)
    expect(blastLine(twoFaced, [75.9, 20, 0], mid, POSTP, 50, mat)).toBe(false); // 25.1 u: 625 < 630
    // One quad at x 90 as two triangles; the line at y 20, z 0 crosses their shared diagonal (z = y - 20).
    const split = grid([face(90, [90, 0, -20, 90, 0, 20, 90, 40, 20]), face(90, [90, 0, -20, 90, 40, 20, 90, 40, -20])]);
    expect(segmentHits(split, [77, 20, 0], mid).filter((h) => h.owner.path === SLAB)).toHaveLength(2);
    expect(blastLine(split, [77, 20, 0], mid, POSTP, 50, mat)).toBe(true);
    // Two owners still count twice: the slab and a second wall of its own.
    const OTHER = 'worldmodel/other';
    const polys = [{ ...across(POSTP, 100), material: 19 }, face(90, [90, 0, -20, 90, 0, 20, 90, 40, 20, 90, 40, -20]), { ...face(91, [91, 0, -20, 91, 0, 20, 91, 40, 20, 91, 40, -20]), path: OTHER }];
    const two = groundGrid(packGround(params, polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: FLAGS }))));
    expect(blastLine(two, [77, 20, 0], mid, POSTP, 50, mat)).toBe(false);       // 156.25 < 576
    expect(REACH_HITS_READING).toBe('first-per-owner-in-order');
  });

  it("one record per owner object, not per path: two sibling WOOD_THIN owners sharing one path (as same-named nodes do, grid.ts collisionRuns) both count -- C4 reaches 12.5 u past them, not 25", () => {
    const POSTP = 'worldmodel/post', TWIN = 'worldmodel/twin';
    const wall = (x: number): WorldPoly => ({ ...across(TWIN, x), material: 20 });
    const polys = [{ ...across(POSTP, 100), material: 19 }, wall(90), wall(91)];
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: FLAGS }));
    const grid = groundGrid(packGround(params, polys, owners));
    const mat = (p: WorldPoly): number => surfaceMaterial(p.material, '').penetration;
    const mid: [number, number, number] = [101, 20, 0];
    expect(blastLine(grid, [77, 20, 0], mid, POSTP, 50, mat)).toBe(false);      // 24 u: 156.25 < 576 (was: one path, 625, reached)
    expect(blastLine(grid, [89, 20, 0], mid, POSTP, 50, mat)).toBe(true);       // 12 u: 156.25 >= 144
  });

  it("the record keeps the first polygon crossed per owner in surface order (type 2, FUN_0031dd90 D:L219888; research 23 s1.1), not the nearest: an owner whose first polygon is METAL_THICK (0) behind a nearer WOOD_THIN face refuses (D:L319117)", () => {
    const POSTP = 'worldmodel/post', SLAB = 'worldmodel/slab';
    const face = (x: number, material: number): WorldPoly => ({ ...across(SLAB, x), material });
    const build = (slab: WorldPoly[]) => {
      const polys = [{ ...across(POSTP, 100), material: 19 }, ...slab];
      const owners: CollisionOwner[] = [
        { modelName: 'worldmodel', path: POSTP, first: 0, count: 1, flags: FLAGS },
        { modelName: 'worldmodel', path: SLAB, first: 1, count: slab.length, flags: FLAGS },
      ];
      return groundGrid(packGround(params, polys, owners));
    };
    const mat = (p: WorldPoly): number => surfaceMaterial(p.material, '').penetration;
    const mid: [number, number, number] = [101, 20, 0];
    // In order: METAL_THICK (25) at x 92, then WOOD_THIN (20) at x 90 -- the nearer.
    expect(blastLine(build([face(92, 25), face(90, 20)]), [77, 20, 0], mid, POSTP, 50, mat)).toBe(false);   // was: the nearer, reached
    // In order: WOOD_THIN first, METAL_THICK second: the first is the WOOD_THIN -- reached (625 >= 576).
    expect(blastLine(build([face(90, 20), face(92, 25)]), [77, 20, 0], mid, POSTP, 50, mat)).toBe(true);
  });
});
