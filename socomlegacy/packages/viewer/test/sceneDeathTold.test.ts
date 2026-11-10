// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, EffectProgram, GridParams, ObjectMotion, WorldPoly } from '@s2u/scene';
import type { MapMeta } from '../src/mapMeta';
import { groundGrid, packGround, type GroundData } from '../src/mover';
import { applySceneDeath } from '../src/net/client';
import type { SceneProgram } from '../src/sceneHealth';
import { ROOM_SKIP_EFFECTS_READING, SCENE_NODE_MOTION_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * V13-3c (research 386 §3.5; `SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold', `SCENE_NODE_MOTION_PLACEHOLDER`): a death
 * the room tells (`sceneDeath`) is taken on the page's world whose target never goes off -- MP12's `ant_base1`, in
 * miniature (made-up paths, no game data): its program turns its `good` node off, calls a part-fly (an `OBJECT_MOTION`
 * of its caller, lifetime 5 s, nothing turned off -- `ant_part_fly1`'s shape) on `part1`, and a toilet-style part-fly
 * (the motion, then its own wait and off -- `toilet_flypart1`'s shape) on `part2`; a spinner's motion (lifetime 4 s) at
 * its own root. The room's world tells the death through `WorldHooks.died`.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const ROOT = 'worldmodel/ant', GOOD = `${ROOT}=ant/good`, PARTS = `${ROOT}=ant/parts`, P1 = `${PARTS}/part1`, P2 = `${PARTS}/part2`;
const SPIN = 'worldmodel/spinner', SPIN_VIS = `${SPIN}=spinner/vis`;

function hull(): GroundData {
  const wall = (path: string, x: number): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 0, -20, x, 0, 20, x, 40, 20, x, 40, -20]),
  });
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: GOOD, first: 0, count: 1, flags: 0x1001 }];
  return packGround(params, [wall(GOOD, 50)], owners);
}

const motion = (node: number, lifetime: number): ObjectMotion => ({
  flags: 723, node, frame: 0, direction: [0, 0, 0], launch: { azimuth: 0, zenith: 35, speed: 80, accel: 0 },
  range: { azimuth: 350, zenith: 55, speed: 60, accel: 0 }, gravityScale: 1, terminal: 0, callerVelocity: 0, bounce: 0.3,
  tolerance: 0.35, lifetime, refSpeed: 0, sound: null, tumble: null, angular: null, materials: [],
});
const fly: SceneProgram = { search: [], program: { name: 'fly', root: 0, flags: 0, nodes: [], sequences: [
  { name: 'NA', activation: 1, ops: [{ op: 'motion', motion: motion(-6, 5) }] },
] } };
const flyOff: SceneProgram = { search: [], program: { name: 'flyoff', root: 0, flags: 0, nodes: [], sequences: [
  { name: 'NA', activation: 1, ops: [{ op: 'motion', motion: motion(-6, 5) }] },
  { name: 'NA', activation: 1, ops: [{ op: 'wait', seconds: 1, range: 0, frames: null }, { op: 'active', node: -6, on: false }] },
] } };
const spin: SceneProgram = { search: [0, 0], program: { name: 'spin', root: 1, flags: 0, nodes: ['NA', 'spinner'], sequences: [
  { name: 'NA', activation: 1, ops: [{ op: 'motion', motion: motion(-7, 4) }] },
] } };
const death: EffectProgram = { name: 'ant', root: 1, flags: 0x23, nodes: ['NA', 'ant', 'good', 'part1', 'part2'], sequences: [
  { name: 'NA', activation: 1, ops: [
    { op: 'call', anim: 'spin' }, { op: 'active', node: 2, on: false },
    { op: 'call', anim: 'fly', caller: 3, place: 3 }, { op: 'call', anim: 'flyoff', caller: 4, place: 4 },
  ] },
] };

function meta(): MapMeta {
  const paths = [ROOT, `${ROOT}=ant`, GOOD, PARTS, P1, P2, SPIN, `${SPIN}=spinner`, SPIN_VIS];
  const instances = paths.map((path, id) => ({ id, path, node: path.split(/[/=]/).pop()!, modelName: 'worldmodel', root: path }));
  return {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [], initial: [],
    scene: {
      programs: [fly, flyOff, spin],
      destructibles: [{ id: 0, key: `ant#0@${ROOT}`, anim: 'ant', instance: 0, root: ROOT, targetPath: ROOT, health: 1, armor: 0, shield: 0, program: death, nodes: [null, ROOT, GOOD, P1, P2] }],
    },
  };
}

function world(room: boolean) {
  const ground = hull();
  const shown: string[] = [], fades = new Map<string, number[]>(), died: number[] = [];
  const w = new WorldState(meta(), ground, groundGrid(ground), {
    visible: (path, on) => { shown.push(`${path} ${on}`); },
    opacity: (path, f) => { fades.set(path, [...(fades.get(path) ?? []), f]); },
    died: (id) => { died.push(id); },
  });
  if (room) w.skipEffects = ROOM_SKIP_EFFECTS_READING;
  w.applyInitial();
  return { w, shown, fades, died };
}
const step = (w: WorldState, seconds: number): void => { for (let i = 0; i < Math.round(seconds * 60); i++) w.step(1 / 60); };

describe('V13-3c: a scene death told to the page, and the motion it cannot draw', () => {
  it("the room's world tells the death it ran (died), not one taken from the wire; the room's own run draws nothing", () => {
    const room = world(true);
    expect(room.w.health.hitAt(GOOD, { kind: 'impact', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(room.died).toEqual([0]);
    expect(room.w.isActive(GOOD)).toBe(false);
    step(room.w, 6);
    expect(room.fades.size).toBe(0);                                      // the room fades nothing
    // The toilet-style part: off by its own program at 1 s (the wire's); the others as they stood.
    expect([P1, P2, SPIN_VIS].map((p) => room.w.drawn(p))).toEqual([true, false, true]);
    const page = world(false);
    expect(page.w.takeDeath(0, false)).toBe(true);
    expect(page.died).toEqual([]);
    expect(page.w.takeDeath(0, false)).toBe(false);                       // told twice: once
  });

  it(`the page's presentation run: a motion whose program never turns its node off fades it over its lifetime and takes it from the drawing (${SCENE_NODE_MOTION_PLACEHOLDER}); the flags stay; the reset draws it back`, () => {
    expect(SCENE_NODE_MOTION_PLACEHOLDER).toBe('fadeOverLifetime');
    const page = world(false);
    expect(applySceneDeath({ id: 0 }, page.w, false)).toBe(true);
    expect(page.w.health.isSpent(0)).toBe(true);
    expect(page.w.isActive(GOOD)).toBe(true);                             // PF.R26: the wire's flags, not the run's
    step(page.w, 2);
    expect(page.fades.get(P1)!.at(-1)).toBeCloseTo(1 - 2 / 5, 2);
    expect(page.fades.get(SPIN)!.at(-1)).toBeCloseTo(1 - 2 / 4, 2);
    expect(page.fades.has(P2)).toBe(false);                               // its program turns it off itself: as before
    expect([P1, SPIN_VIS].map((p) => page.w.drawn(p))).toEqual([true, true]);
    step(page.w, 2.1);
    expect(page.w.drawn(SPIN_VIS)).toBe(false);                           // past 4 s: the spinner gone
    expect(page.shown).toContain(`${SPIN} false`);
    expect(page.w.drawn(P1)).toBe(true);
    step(page.w, 1);
    expect(page.w.drawn(P1)).toBe(false);                                 // past 5 s: the part gone
    expect(page.shown).toContain(`${P1} false`);
    expect(page.fades.get(P1)!.at(-1)).toBe(0);
    expect([P1, P2, SPIN_VIS, GOOD].map((p) => page.w.isActive(p))).toEqual([true, true, true, true]);
    expect(page.w.states()).toEqual([]);
    // A node above it shown again (the wire's) keeps it out of the drawing.
    page.w.setActive(PARTS, false);
    page.w.setActive(PARTS, true);
    expect(page.shown.at(-1)).toBe(`${P1} false`);
    page.shown.length = 0;
    page.w.reset();
    expect([P1, SPIN_VIS].map((p) => page.w.drawn(p))).toEqual([true, true]);
    expect(page.shown).toEqual(expect.arrayContaining([`${P1} true`, `${SPIN} true`]));
    expect(page.fades.get(P1)!.at(-1)).toBe(1);
    expect(page.fades.get(SPIN)!.at(-1)).toBe(1);
  });

  it("the review's F2: a page's own death (offline play: its world's skipEffects false, SceneHealth's run) fades as the told one", () => {
    const own = world(false);
    expect(own.w.health.hitAt(GOOD, { kind: 'impact', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    expect(own.w.isActive(GOOD)).toBe(false);                             // its own run: the flags are its own
    step(own.w, 5.1);
    expect([P1, SPIN_VIS].map((p) => own.w.drawn(p))).toEqual([false, false]);
    own.w.reset();
    expect([P1, SPIN_VIS].map((p) => own.w.drawn(p))).toEqual([true, true]);
  });

  it("a joiner's silent death and a display run draw no fade", () => {
    const joiner = world(false);
    expect(applySceneDeath({ id: 0 }, joiner.w, true)).toBe(true);
    step(joiner.w, 6);
    expect(joiner.fades.size).toBe(0);
    expect([P1, SPIN_VIS].map((p) => joiner.w.drawn(p))).toEqual([true, true]);
    const shown = world(false);
    expect(shown.w.runDisplay('spin')).toBe(true);
    step(shown.w, 6);
    expect(shown.fades.size).toBe(0);
    expect(shown.w.drawn(SPIN_VIS)).toBe(true);
  });
});
