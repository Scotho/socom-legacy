// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { segmentHits, type CollisionOwner, type EffectProgram, type GridParams, type V3, type WorldPoly } from '@s2u/scene';
import type { MapAction } from '../src/mapActions';
import { under, type MapInitial, type MapMeta } from '../src/mapMeta';
import { groundGrid, packGround, type GroundData } from '../src/mover';
import type { SceneProgram } from '../src/sceneHealth';
import { forkGround, ROOM_SKIP_EFFECTS_READING, WorldState } from '../src/worldState';

/**
 * Ruling PF.R26 (the controller, 2026-10-05; research 210 s7, s8): the room runs a scene death with `skip_effects` 1 and
 * the wire carries its geometry only (`ROOM_SKIP_EFFECTS_READING`); the page's world, inferring the death from the wire
 * (`SceneHealth.takeDeath` from `WorldState.apply`, `SCENE_DEATH_ON_WIRE_READING`), runs it for presentation only: its
 * sounds and particles play, no node's own flag and no valve changes -- not at once, and not later (`access_part_fly`'s
 * caller off after 2 s). On a synthetic Vigilance barrier whose destroy program is the disc's in miniature (no game data).
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLAGS = 0x1001;
const ROOT = 'worldmodel/access1', REAL = `${ROOT}=access1`, GOOD = `${REAL}/good_parts`, DI = `${GOOD}/di_good`;
const LEFT = `${REAL}/whats_left`, BAD = `${REAL}/bad_parts`, PART = `${BAD}/part1`, ACTION = `${REAL}/access_action1`;

function hull(): GroundData {
  const wall = (path: string, x: number): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 0, -20, x, 0, 20, x, 40, 20, x, 40, -20]),
  });
  const floor: WorldPoly = { ...wall('worldmodel/floor', 0), ditype: 3, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const polys = [floor, wall(DI, 50), wall(DI, 52)];
  const owners: CollisionOwner[] = [
    { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: FLAGS },
    { modelName: 'worldmodel', path: DI, first: 1, count: 2, flags: FLAGS },
  ];
  return packGround(params, polys, owners);
}

/** `destroy_accessN` as the disc holds it, its part-fly loop one call: `access_part_fly` turns its caller off after 2 s. */
const destroy: SceneProgram = {
  search: [0, 0, 1, 1, 1, 1],
  program: {
    name: 'destroy_access1', root: 1, flags: 0x22, nodes: ['NA', 'access1', 'good_parts', 'di_good', 'whats_left', 'bad_parts'],
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
        { op: 'call', anim: 'access_part_fly' },
        { op: 'sound', sound: '.WOOD_DEBRIS', node: -7, volume: 1 },
        { op: 'endif' },
      ] },
    ],
  },
};
const partFly: SceneProgram = {
  search: [],
  program: { name: 'access_part_fly', root: 0, flags: 0, nodes: [], sequences: [{ name: 'NA', activation: 1, ops: [
    { op: 'wait', seconds: 2, range: 0, frames: null }, { op: 'active', node: -6, on: false },
  ] }] },
};
const access: EffectProgram = {
  name: 'access1', root: 1, flags: 0x2b, nodes: ['NA', 'access1', 'di_good'],
  sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'executeAction', anim: 'set_access1' }] }],
};

function meta(): MapMeta {
  const paths = ['worldmodel/floor', ROOT, REAL, GOOD, DI, BAD, PART, LEFT, ACTION];
  const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  const save = (path: string, deactivate = false): MapInitial => ({ path, deactivate, saveActive: true, saveTransform: false, saveParent: false });
  const action: MapAction = {
    node: 'access_action1', path: ACTION, at: [45, 0, 0], type: '', typeCode: 8, valve: 'set_access1', anims: ['destroy_access1'],
    team: null, range: 32, elevation: -1, points: 2, bitmap: '',
  };
  return {
    stem: 'SYN', actions: [action], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [save(GOOD), save(DI), save(BAD, true), save(LEFT, true)],
    scene: {
      programs: [destroy, partFly],
      destructibles: [{ id: 0, key: `access1#0@${ROOT}`, anim: 'access1', instance: 1, root: ROOT, targetPath: DI, health: 1, armor: 0, shield: 17, program: access, nodes: [null, ROOT, DI] }],
    },
  };
}

function world(room: boolean, ground: GroundData) {
  const grid = groundGrid(ground);
  const sounds: string[] = [];
  const w = new WorldState(meta(), ground, grid, { sound: (name) => { sounds.push(name); } });
  if (room) w.skipEffects = ROOM_SKIP_EFFECTS_READING;
  w.applyInitial();
  const blast = (at: V3, rating: number, radius: number): number[] =>
    w.health.blastAt(at, rating, radius, (to, target) => segmentHits(grid, at, to).every((h) => under(h.owner.path, target)));
  return { w, sounds, blast };
}
const step = (w: WorldState, seconds: number): void => { for (let i = 0; i < seconds * 60; i++) w.step(1 / 60); };
const PATHS = [GOOD, DI, LEFT, BAD, PART, ACTION];

describe('a scene death on the wire (ruling PF.R26)', () => {
  it("a page applying the room's death plays its sound once and changes no node and no valve beyond the wire's -- not at once, not 2 s later; the room's silent run is unchanged", () => {
    const ground = hull();
    const room = world(true, forkGround(ground));
    expect(room.blast([44, 20, 0], 18, 50)).toEqual([0]);
    // The room: geometry only (skip_effects 1) -- the barrier off, the rubble on, no debris; its context valve set.
    expect(PATHS.map((p) => room.w.isActive(p))).toEqual([false, false, true, false, false, true]);
    expect(room.w.valve('set_access1')).toBe(1);
    expect(room.sounds).toEqual([]);
    step(room.w, 3);
    expect(PATHS.map((p) => room.w.isActive(p))).toEqual([false, false, true, false, false, true]);
    const env = room.w.wireAll(1);

    const page = world(false, forkGround(ground));
    const changed: string[] = [];
    page.w.on({ visible: (path, on) => { changed.push(`${path} ${on}`); } });
    page.w.applyWire(env, false);
    expect(page.sounds).toEqual(['.WOOD_DEBRIS']);                       // the death's sound, once
    expect(page.w.states()).toEqual(room.w.states());                     // the wire's state, nothing more
    expect([...changed].sort()).toEqual([`${DI} false`, `${GOOD} false`, `${LEFT} true`].sort());   // the drawing told the wire's changes only
    expect(page.w.valve('set_access1')).toBe(0);                          // no valve the run set
    const revision = page.w.revision;
    step(page.w, 3);                                                      // past access_part_fly's 2 s
    expect(page.w.states()).toEqual(room.w.states());
    expect(page.w.revision).toBe(revision);
    expect(changed).toHaveLength(3);
    expect(PATHS.map((p) => page.w.isActive(p))).toEqual([false, false, true, false, false, true]);
    // A later snapshot of the same state: nothing more played.
    page.w.applyWire(room.w.wireAll(1), false);
    expect(page.sounds).toEqual(['.WOOD_DEBRIS']);
    // A joiner's (silent): the state, no sound.
    const joiner = world(false, forkGround(ground));
    joiner.w.applyWire(env, true);
    expect(joiner.sounds).toEqual([]);
    expect(joiner.w.states()).toEqual(room.w.states());
  });
});
