// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { DEFAULT_GRID_PARAMS, type CollisionOwner, type EffectOp, type EffectProgram, type GridParams, type WorldPoly } from '@s2u/scene';
import { mergeWorld, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { groundGrid, packGround } from '../src/mover';
import {
  NodeFrame, profileAdvance, profileBegin, profileStrokeTick, runsProfileStroke, runsScroll, SCENE_PROFILE_MOTION_READING,
  scrollTick, scrollTravel, uvStep, type SpeedProfile, type Vec3,
} from '../src/sceneScroll';
import { bareMeta, SCROLL_MOTION_PLACEHOLDER, WorldState } from '../src/worldState';
import { buildWorld } from '../src/world';

/**
 * LATER 782 (research 387 §12.3, §12.7): Fish Hook's shore -- a speed-profile stroke of an empty node and the texture
 * scroll that reads its travel -- transcribed and run on the world (`./sceneScroll`, `./worldState`), and the per-visual
 * texture offset the page's world draws it with (`./world` `setNodeUvOffset`). Unit tests against the transcription:
 *
 * - `FUN_002606f0` (D:L109348-109434): three phases, a step split at a phase's end, the speed changed before it moves;
 * - `FUN_0025fe70` / `FUN_0025f9b0`: the begin places the start, the tick moves until the time is up, then sets the target
 *   and hands on the rest of the tick;
 * - `FUN_00260b40` (flag 8 clear): the travel's length, signed by the x and z of the axis; flag 1's end;
 * - `FUN_003bfee0`: steps of 1/4096, truncated toward zero, the carry kept only while no step is taken;
 * - the world: a program of the shore's shape moves its node and hands the drawing the scrolled node's offset.
 */

/** MP71's 1 u stroke (washup1's first): speeds (0, 0.5, 0), accel 0.5, decel -1, times (1, 1.25, 0.5) over 2.75 s. */
const ONE: SpeedProfile = { speeds: [0, 0.5, 0], accel: 0.5, decel: -1, times: [1, 1.25, 0.5] };
const stroke = (to: Vec3, from: Vec3 = [0, 0, 0], flags = 0x180a): Extract<EffectOp, { op: 'fromTo' }> => ({
  op: 'fromTo', node: 2, flags, seconds: 2.75, from: [0, 0, 0], to: [0, 0, 0],
  translation: { from, to, rate: [to[0] - from[0], to[1] - from[1], to[2] - from[2]] }, profile: ONE,
});
const scroll = (over: Partial<Extract<EffectOp, { op: 'scroll' }>> = {}): Extract<EffectOp, { op: 'scroll' }> => ({
  op: 'scroll', node: 1, mover: 2, flags: 0, axis: [-1, 0, 0], uv: [-0.2, 1], seconds: null, ...over,
});

describe('the speed profile (FUN_002606f0)', () => {
  it('begins at the first phase with a time, its speed, the unit direction from start to target', () => {
    expect(profileBegin(ONE, [0, 0, 0], [2, 0, 0])).toEqual({ phase: 1, elapsed: 0, speed: 0, dir: [1, 0, 0] });
    expect(profileBegin({ ...ONE, times: [0, 1, 1] }, [1, 0, 0], [0, 0, 0])).toEqual({ phase: 2, elapsed: 0, speed: 0.5, dir: [-1, 0, 0] });
    // Phase 3 first starts at the cruise speed (D:L109279-109281), not the third.
    expect(profileBegin({ ...ONE, speeds: [0, 0.5, 9], times: [0, 0, 1] }, [0, 0, 0], [0, 3, 4])).toMatchObject({ phase: 3, speed: 0.5, dir: [0, 0.6, 0.8] });
  });

  it('accelerates, then cruises, then slows; a step across a phase end is split there; the speed changes before the move', () => {
    const run = profileBegin(ONE, [0, 0, 0], [1, 0, 0]);
    const pos: Vec3 = [0, 0, 0];
    profileAdvance(run, ONE, 0.5, pos);
    expect(run.speed).toBe(0.25);
    expect(pos[0]).toBeCloseTo(0.125, 12);                 // 0.25 x 0.5: the speed after the change
    profileAdvance(run, ONE, 0.75, pos);                   // 0.5 s more of phase 1, then 0.25 s of phase 2
    expect(run.phase).toBe(2);
    expect(run.elapsed).toBeCloseTo(0.25, 12);
    expect(pos[0]).toBeCloseTo(0.125 + 0.5 * 0.5 + 0.5 * 0.25, 12);
    profileAdvance(run, ONE, 1.25, pos);                   // 1 s of cruise, then 0.25 s of phase 3
    expect(run.phase).toBe(3);
    expect(run.speed).toBeCloseTo(0.25, 12);
    expect(pos[0]).toBeCloseTo(0.5 + 0.5 * 1 + 0.25 * 0.25, 12);
  });
});

describe('the stroke (FUN_0025fe70 / FUN_0025f9b0)', () => {
  it('places the start, moves at 0.25 s a tick to exactly 1 u, and sets the target once the time is past, the rest handed on', () => {
    let at: Vec3 = [9, 9, 9];
    const tick = profileStrokeTick(stroke([1, 0, 0]), { get: () => [...at], set: (t) => { at = t; } });
    expect(at).toEqual([0, 0, 0]);
    const xs: number[] = [];
    for (let i = 0; i < 11; i++) { expect(tick(0.25)).toBe(false); xs.push(at[0]); }
    // 1 s accelerating, 1.25 s cruising (the fifth tick crosses into it), 0.5 s slowing (the tenth crosses into it).
    expect(xs.map((x) => +x.toFixed(6))).toEqual([0.03125, 0.09375, 0.1875, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375, 1, 1]);
    at = [0.9, 0, 0];
    expect(tick(0.25)).toBe(0.25);                        // 2.75 < 0.25 + 2.75: the target set, the whole tick handed on
    expect(at).toEqual([1, 0, 0]);
  });

  it('flag 1 sets the start plus the target; 0x2000 sets none', () => {
    let at: Vec3 = [0, 0, 0];
    const node = { get: () => [...at] as Vec3, set: (t: Vec3) => { at = t; } };
    const rel = profileStrokeTick(stroke([1, 0, 0], [2, 0, 0], 0x180b), node);
    rel(3);
    expect(at).toEqual([3, 0, 0]);
    const held = profileStrokeTick(stroke([1, 0, 0], [0, 0, 0], 0x380a), node);
    at = [0.5, 0, 0];
    held(3);
    expect(at).toEqual([0.5, 0, 0]);
  });

  it('runs the given-start, moving profile only (SCENE_PROFILE_MOTION_READING)', () => {
    expect(SCENE_PROFILE_MOTION_READING).toBe('givenStartNodeOnly');
    expect(runsProfileStroke(stroke([1, 0, 0]))).toBe(true);
    expect(runsProfileStroke({ ...stroke([1, 0, 0]), translation: { from: null, to: [1, 0, 0], rate: [1, 0, 0] } })).toBe(false);
    expect(runsProfileStroke({ ...stroke([1, 0, 0]), profile: undefined })).toBe(false);
    for (const f of [0x4, 0x10, 0x40, 0x200, 0x400]) expect(runsProfileStroke(stroke([1, 0, 0], [0, 0, 0], 0x180a | f))).toBe(false);
    expect(runsProfileStroke(stroke([1, 0, 0], [0, 0, 0], 0x1802))).toBe(false);   // flag 8 clear: the node is not moved
  });
});

describe('SCROLL_MOTION (FUN_00260b40, FUN_003bfee0)', () => {
  it('the travel: its length, negative where its x and z run against the axis; its y not asked', () => {
    expect(scrollTravel([-1, 0, 0], [0, 0, 0], [0.5, 0, 0])).toBe(-0.5);
    expect(scrollTravel([-1, 0, 0], [0.5, 0, 0], [0, 0, 0])).toBe(0.5);
    expect(scrollTravel([-1, 0, 0], [0, 0, 0], [0, 1, 0])).toBe(1);
    expect(scrollTravel([0, 0, -1], [0, 0, 0], [3, 0, 4])).toBe(-5);
  });

  it('the steps: 1/4096ths truncated toward zero; the carry kept until it makes a step, cleared by a step or a 0', () => {
    const carry: [number, number] = [0, 0];
    expect(uvStep(carry, 0.0001, 0)).toEqual([0, 0]);     // 0.41 of a step: carried
    expect(carry[0]).toBeCloseTo(0.0001, 12);
    expect(uvStep(carry, 0.0001, 0)).toEqual([0, 0]);     // 0.82
    expect(uvStep(carry, 0.0001, 0)).toEqual([1, 0]);     // 1.23: one step, the 0.23 dropped
    expect(carry).toEqual([0, 0]);
    expect(uvStep(carry, -0.0003, 0.5)).toEqual([-1, 2048]);
    uvStep(carry, 0.0001, 0);
    uvStep(carry, 0, 0);
    expect(carry).toEqual([0, 0]);
    expect(uvStep([0, 0], 8, 0)).toEqual([-32768, 0]);    // kept to 16 bits, as the vertex's coordinate
  });

  it('a tick hands uv x the travel since the last to the steps; never done, unless flag 1 once its seconds are up', () => {
    let x = 0;
    const steps: [number, number][] = [];
    const mover = { place: (): Vec3 => [x, 0, 0], axis: (): Vec3 => [-1, 0, 0] };
    const tick = scrollTick(scroll(), mover, (su, sv) => steps.push([su, sv]));
    x = 0.5;
    expect(tick(0.1)).toBe(false);
    expect(steps).toEqual([[409, -2048]]);                 // -0.2 x -0.5 = 0.1 (409.6), 1 x -0.5
    x = 0;
    tick(0.1);
    expect(steps[1]).toEqual([-409, 2048]);
    tick(0.1);
    expect(steps.length).toBe(2);                          // no travel, no step
    const timed = scrollTick(scroll({ flags: 1, seconds: 0.1 }), mover, () => {});
    expect(timed(0.05)).toBe(false);
    expect(timed(0.05)).toBe(false);
    expect(timed(0.05)).toBeCloseTo(0.05, 12);
    expect(runsScroll(scroll())).toBe(true);
    expect(runsScroll(scroll({ flags: 0x1c, projected: { point: [0, 0, 0], axis: [0, 1, 0] } }))).toBe(false);
  });

  it('a node frame: the own translation carried through the parent into the world, the axis through the world 3x3', () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(new NodeFrame(id, id).place([1, 0, 0])).toEqual([1, 0, 0]);
    // A parent turned a quarter about y (x -> -z) at (10, 0, 0); the node's own matrix the identity at (2, 0, 0).
    const own = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1];
    const world = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 0, -2, 1];
    const f = new NodeFrame(own, world);
    expect(f.rest).toEqual([2, 0, 0]);
    expect(f.place([3, 0, 0]).map((v) => +v.toFixed(9))).toEqual([10, 0, -3]);
    expect(f.direction([-1, 0, 0]).map((v) => +v.toFixed(9))).toEqual([0, 0, 1]);
  });
});

/** A world of the shore's shape: `wash` scrolled by `node`'s travel, the node stroked once 1 u out along x. */
function shore() {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: 0x1001 }];
  const ground = packGround(params, [poly], owners);
  const program: EffectProgram = {
    name: 'washup1', root: 0, flags: 0x21, nodes: ['NA', 'water_wash', 'water_node'],
    sequences: [
      { name: 's0', activation: 1, ops: [scroll()] },
      { name: 's1', activation: 1, ops: [stroke([1, 0, 0])] },
    ] as EffectProgram['sequences'],
  };
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const meta = {
    ...bareMeta('SYN'),
    instances: ['worldmodel', 'worldmodel/floor', 'worldmodel/water_wash', 'worldmodel/water_node'].map((path, id) => ({
      id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path,
    })),
    scene: { destructibles: [], programs: [{ program, search: [0, 0, 0] }] },
    motion: { scrolled: ['worldmodel/water_wash'], frames: new Map([['worldmodel/water_node', { own: id, world: id }]]) },
  };
  meta.instanceByPath = new Map(meta.instances.map((i) => [i.path, i.id]));
  const offsets: [string, number, number][] = [];
  const world = new WorldState(meta, ground, groundGrid(ground), { scroll: (path, u, v) => { offsets.push([path, u, v]); } });
  return { world, offsets };
}

describe('the world runs the shore (LATER 782)', () => {
  it('the stroke moves the node and the scroll hands the drawing the wash\'s offset: -1 repeat in v, 815/4096 in u', () => {
    expect(SCROLL_MOTION_PLACEHOLDER).toBe('travelOnWorldChunks');
    const { world, offsets } = shore();
    world.runAutostartPrograms = true;
    world.applyInitial();
    expect(world.running('washup1')).toBe(true);
    for (let i = 0; i < 14; i++) world.step(0.25);
    expect(world.nodeTranslation('worldmodel/water_node')).toEqual([1, 0, 0]);
    // Each tick's travel a whole number of 1/32 u (the stroke's 0.25 s ticks): v exact, u truncated at every step --
    // trunc(25.6 k) over k = 1, 2, 3, 4, 4, 4, 4, 4, 4, 2 thirty-seconds.
    expect(world.scrollOffset('worldmodel/water_wash')).toEqual([815 / 4096, -1]);
    expect(offsets.at(-1)).toEqual(['worldmodel/water_wash', 815 / 4096, -1]);
    expect(new Set(offsets.map((o) => o[0]))).toEqual(new Set(['worldmodel/water_wash']));
    // The room's world (no autostart programs) moves nothing.
    const room = shore();
    room.world.applyInitial();
    for (let i = 0; i < 14; i++) room.world.step(0.25);
    expect(room.world.scrollOffset('worldmodel/water_wash')).toBeNull();
    expect(room.offsets).toEqual([]);
  });

  it('the round\'s reset leaves the offset and the node where they stand (no reference saves them; the vertices keep theirs)', () => {
    const { world } = shore();
    world.runAutostartPrograms = true;
    world.applyInitial();
    for (let i = 0; i < 6; i++) world.step(0.25);
    const node = world.nodeTranslation('worldmodel/water_node')!, uv = world.scrollOffset('worldmodel/water_wash')!;
    world.reset();
    expect(world.nodeTranslation('worldmodel/water_node')).toEqual([0, 0, 0]);   // the stroke's begin places its start again
    // ... and the scroll begun with it saw the node at its old place: the jump back is scrolled, v back near 0.
    world.step(0.25);
    expect(node[0]).toBeGreaterThan(0);
    expect(uv[1]).toBeLessThan(0);
    expect(world.scrollOffset('worldmodel/water_wash')![1]).toBeGreaterThan(uv[1]);
  });
});

describe('the drawing: a scrolled node\'s world chunks drawn apart, each with its own texture offset (unrendered)', () => {
  const FLAGS = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
  const tri = (over: Partial<LoadedMesh> = {}): LoadedMesh => ({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), uvs: new Float32Array(6),
    colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
    textureName: 'wash.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null, ...over,
  });

  it('the merge keeps a scrolled path\'s chunks apart, by path', () => {
    const merged = mergeWorld([tri(), tri({ scrollPath: 'worldmodel/water_wash' }), tri({ scrollPath: 'worldmodel/water_wash1' }), tri()], { 'wash.tif': FLAGS }, {});
    expect(merged.map((m) => [m.scrollPath ?? null, m.positions.length / 3])).toEqual([[null, 6], ['worldmodel/water_wash', 3], ['worldmodel/water_wash1', 3]]);
  });

  it('setNodeUvOffset reaches the chunks at or under the path, each drawn with its own material and offset', () => {
    const map = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, props: [],
      world: [tri({ scrollPath: 'worldmodel/water_wash' }), tri({ scrollPath: 'worldmodel/water_wash1', order: 1, orderEnd: 1 }), tri({ order: 2, orderEnd: 2 })],
      textures: { 'wash.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
      textureFlags: { 'wash.tif': FLAGS }, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {},
      grid: DEFAULT_GRID_PARAMS, collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 }, slots: [],
      diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
    } as unknown as LoadedMap;
    const view = buildWorld(map);
    for (const task of view.revealWorld) task();
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    expect(meshes.length).toBe(3);
    const [a, b, still] = meshes as [Mesh, Mesh, Mesh];
    expect(a.material).not.toBe(b.material);
    expect(view.setNodeUvOffset('worldmodel/water_wash', 0.25, -0.5)).toBe(1);
    const offsetOf = (m: Mesh) => (m.userData.uvOffset as { value: { x: number; y: number } } | undefined)?.value;
    expect(offsetOf(a)).toMatchObject({ x: 0.25, y: -0.5 });
    expect(offsetOf(b)).toMatchObject({ x: 0, y: 0 });
    expect(offsetOf(still)).toBeUndefined();
    expect(view.setNodeUvOffset('worldmodel', 1, 1)).toBe(2);
    expect(view.setNodeUvOffset('worldmodel/elsewhere', 1, 1)).toBe(0);
  });
});
