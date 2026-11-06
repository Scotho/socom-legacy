import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyR0004Ops, bitsToFloat, buildGrid, collisionOwners, DEFAULT_GRID_PARAMS, floatToBits, IDENTITY, levelNameOf, NODE_GENERIC,
  NODE_INSTANCE, NODE_MODEL, packSurfaceWord, polyFrom, probeGround, R0004_MAP_EDITS, r0004EditsFor, worldCollision,
  type CollisionPoly, type R0004Op, type SceneNode,
} from '../src/index';
import { chopF32 } from '../src/grid';

/**
 * R4B-09 (G1, research 383): each of r0004's per-map edit operations on a graph built by hand (no disc), and the
 * generated table against the transcription's own recount. The disc half -- every map, every box against r0001's
 * vertices -- is `r0004MapPatchDisc.test.ts`.
 */

const b = floatToBits;
const quad = (pts: number[][], word = 0x44000013): CollisionPoly => polyFrom({ word, points: pts.flat().map(b) });
function node(name: string, over: Partial<SceneNode> = {}): SceneNode {
  return {
    name, modelName: null, type: NODE_GENERIC, flags: 0x80801071, matrix: Float32Array.from(IDENTITY),
    bbox: new Float32Array(6), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
  };
}
const at = (m: Float32Array, x: number, y: number, z: number): Float32Array => { const c = Float32Array.from(m); c[12] = x; c[13] = y; c[14] = z; return c; };
const op = <T extends R0004Op['op']>(o: Extract<R0004Op, { op: T }>): R0004Op => o;
/** A box term pair round a value: strictly inside (lo, hi). */
const box = (v: number | null, axis: number, lo: number, hi: number) => [
  { v, axis, cmp: 'gt' as const, bits: b(lo) }, { v, axis, cmp: 'lt' as const, bits: b(hi) },
];

/** A world: a wall with one quad, a room holding a chair instance of a chair model (its own quad, the model's), a group with a child. */
function world(): { models: SceneNode[]; wall: SceneNode; chairModel: SceneNode; chair: SceneNode; group: SceneNode; child: SceneNode; root: SceneNode } {
  const wall = node('wall', { collision: [quad([[0, 0, 0], [0, 10, 0], [10, 10, 0], [10, 0, 0]])] });
  const chairModel = node('chair', { type: NODE_MODEL, collision: [quad([[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]])], children: [node('seat', { collision: [quad([[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]])] })] });
  const chair = node('chair', { type: NODE_INSTANCE, modelName: 'chair', matrix: at(IDENTITY, 100, 0, 100), collision: [quad([[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]])] });
  const child = node('leaf', { collision: [quad([[0, 0, 0], [0, 0, 5], [5, 0, 5], [5, 0, 0]])] });
  const group = node('grp', { matrix: at(IDENTITY, 50, 0, 50), children: [child] });
  const room = node('room', { children: [chair] });
  const root = node('worldmodel', { type: NODE_MODEL, children: [wall, room, group] });
  return { models: [chairModel, root], wall, chairModel, chair, group, child, root };
}

describe('R4B-09: the dispatch (r4 0x2d4c68-0x2d5214)', () => {
  it('reads an archive stem as the level name, lower case (research 154: "mp%d")', () => {
    expect(levelNameOf('MP72')).toBe('mp72');
    expect(levelNameOf('RUN/M52.ZDB')).toBe('m52');
  });
  it('takes the first strstr match, with the strlen == 3 guard on mp1, mp5, mp6, mp2, mp8, mp9 and m73', () => {
    const id = (level: string): string | null => r0004EditsFor(level)?.id ?? null;
    expect(['mp1', 'mp10', 'mp11', 'mp12'].map(id)).toEqual(['mp1', 'mp10', 'mp11', 'mp12']);
    expect(['mp5', 'mp51', 'mp52', 'mp53', 'mp54'].map(id)).toEqual(['mp5', 'mp51', 'mp52', null, null]);
    expect(['mp6', 'mp61', 'mp62', 'mp63', 'mp64'].map(id)).toEqual(['mp6', 'mp61', 'mp62', null, 'mp64']);
    expect(['mp7', 'mp71', 'mp72', 'mp73', 'mp74'].map(id)).toEqual([null, 'mp71', 'mp72', 'mp73', null]);
    expect(['mp8', 'mp81', 'mp82', 'mp83', 'mp2', 'mp9'].map(id)).toEqual(['mp8', 'mp81', 'mp82', 'mp83', 'mp2', 'mp9']);
    expect(['m51', 'm52', 'm61', 'm73', 'm62'].map(id)).toEqual([null, 'm52', 'm61', 'm73', null]);
  });
});

describe('R4B-09: the operations', () => {
  it('snap: every vertex strictly inside the box moves to the target; one on the bound does not', () => {
    const w = world();
    const [r] = applyR0004Ops(w.models, 'mp0', [op({ op: 'snap', pcs: ['t'], node: ['wall'], branches: [{
      guard: [...box(null, 0, -0.01, 0.01), ...box(null, 1, 9.99, 10.01), ...box(null, 2, -0.01, 0.01)],
      stores: [{ v: null, axis: 0, set: b(-1) }, { v: null, axis: 1, set: b(12) }, { v: null, axis: 2, set: b(0.5) }],
    }] })]);
    expect(r!.changed).toBe(1);
    expect(Array.from(w.wall.collision[0]!.points.slice(3, 6))).toEqual([-1, 12, 0.5]);
    const none = applyR0004Ops(w.models, 'mp0', [op({ op: 'snap', pcs: ['t'], node: ['wall'], branches: [{ guard: box(null, 0, 10, 11), stores: [{ v: null, axis: 1, set: b(0) }] }] })]);
    expect(none[0]!.changed).toBe(0);                                      // x == 10 is not > 10
  });
  it('snap: a guard on named vertices edits the polygon whose two vertices both hold (mp61 di_ext01)', () => {
    const w = world();
    const [r] = applyR0004Ops(w.models, 'mp0', [op({ op: 'snap', pcs: ['t'], node: ['wall'], branches: [{
      guard: [...box(1, 1, 9.9, 10.1), ...box(2, 1, 9.9, 10.1)], stores: [{ v: 1, axis: 1, set: b(5.8) }, { v: 2, axis: 1, set: b(5.8) }],
    }] })]);
    expect(r!.changed).toBe(1);
    expect(w.wall.collision[0]!.points[4]).toBe(Math.fround(5.8));
    expect(w.wall.collision[0]!.points[7]).toBe(Math.fround(5.8));
  });
  it('snap: a relative store chops (sub.s), and the else branch fires only where the first box does not (m52)', () => {
    const w = world();
    const z = 3477.885;
    w.wall.collision = [quad([[1, 1, z], [2, 1, z], [3, 1, z], [9, 9, 9]])];
    const [r] = applyR0004Ops(w.models, 'mp0', [op({ op: 'snap', pcs: ['a', 'b'], node: ['wall'], branches: [
      { guard: box(null, 0, 0.5, 1.5), stores: [{ v: null, axis: 2, sub: b(0.1) }] },
      { guard: box(null, 0, 0.5, 2.5), stores: [{ v: null, axis: 2, sub: b(0.1) }] },
    ] })]);
    expect(r!.changed).toBe(2);
    const want = chopF32(Math.fround(z) - Math.fround(0.1));
    expect(Array.from(w.wall.collision[0]!.points.filter((_, i) => i % 3 === 2))).toEqual([want, want, Math.fround(z), 9]);
  });
  it('point: one vertex of one polygon by index; an index past the list does nothing', () => {
    const w = world();
    const r = applyR0004Ops(w.models, 'mp0', [
      op({ op: 'point', pcs: ['t'], node: ['wall'], poly: 0, v: 3, axis: 1, set: b(73.368) }),
      op({ op: 'point', pcs: ['t'], node: ['wall'], poly: 8, v: 1, axis: 0, set: b(1) }),
    ]);
    expect(w.wall.collision[0]!.points[10]).toBe(Math.fround(73.368));
    expect(r.map((x) => x.changed)).toEqual([1, 0]);
  });
  it('word: the code\'s masks -- material := 20 keeps the point count (r4 0x2dd64c); ditype := 2 (r4 0x2d4fcc)', () => {
    const w = world();
    applyR0004Ops(w.models, 'mp0', [
      op({ op: 'word', pcs: ['t'], node: ['wall'], and: 0xfffc03ff, or: 0x00005000 }),
      op({ op: 'word', pcs: ['t'], node: ['wall'], and: 0xfffffffc, or: 0x00000002 }),
      op({ op: 'word', pcs: ['t'], node: ['wall'], and: 0xfff3ffff, or: 0x00040000 }),
      op({ op: 'word', pcs: ['t'], node: ['wall'], and: 0xff8fffff, or: 0 }),
    ]);
    const p = w.wall.collision[0]!;
    expect([p.material, p.ptcount, p.ditype, p.cameratype, p.appflags]).toEqual([20, 4, 2, 1, 0]);
    expect(packSurfaceWord(p)).toBe(0x00045012);
    expect(() => applyR0004Ops(w.models, 'mp0', [op({ op: 'word', pcs: ['t'], node: ['wall'], and: 0xefffffff, or: 0 })])).toThrow(/does not keep/);
  });
  it('stopFlag: cleared, and copied from another node (the constructor\'s 1 where none was written)', () => {
    const w = world();
    applyR0004Ops(w.models, 'mp0', [
      op({ op: 'stopFlag', pcs: ['t'], node: ['wall'], clear: true }),
      op({ op: 'stopFlag', pcs: ['t'], node: ['grp'], copyFrom: ['wall'] }),
      op({ op: 'stopFlag', pcs: ['t'], node: ['leaf'], copyFrom: ['chair'] }),
    ]);
    expect([w.wall.stopAtFirstHit, w.group.stopAtFirstHit, w.child.stopAtFirstHit]).toEqual([false, false, true]);
  });
  it('move: add and sub chop (add.s / sub.s), set takes the bits; identity then rotY turns the matrix', () => {
    const w = world();
    applyR0004Ops(w.models, 'mp0', [
      op({ op: 'move', pcs: ['t'], node: ['grp'], index: 12, add: b(-3.331) }),
      op({ op: 'move', pcs: ['t'], node: ['grp'], index: 14, sub: b(-10) }),
      op({ op: 'move', pcs: ['t'], node: ['grp'], index: 13, set: b(40.356) }),
    ]);
    expect(Array.from(w.group.matrix.slice(12, 15))).toEqual([chopF32(50 + Math.fround(-3.331)), Math.fround(40.356), 60]);
    applyR0004Ops(w.models, 'mp0', [op({ op: 'identity', pcs: ['t'], node: ['grp'] }), op({ op: 'rotY', pcs: ['t'], node: ['grp'], angle: -2.0943899154663086 })]);
    const c = Math.fround(Math.cos(-2.0943899154663086)), s = Math.fround(Math.sin(-2.0943899154663086));
    expect(Array.from(w.group.matrix)).toEqual([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1].map(Math.fround));
  });
  it('hide: the node and everything under it leave the probe -- an instance\'s model root with it (FUN_002d3030)', () => {
    const w = world();
    const before = collisionOwners(w.models).filter((o) => (o.flags! & 1) === 0).length;
    expect(before).toBe(0);
    applyR0004Ops(w.models, 'mp0', [op({ op: 'hide', pcs: ['t'], node: ['room', 'chair'] }), op({ op: 'hide', pcs: ['t'], node: ['grp'] })]);
    const off = collisionOwners(w.models).filter((o) => (o.flags! & 1) === 0).map((o) => o.path);
    expect(off).toEqual(['worldmodel/room/chair', 'worldmodel/room/chair=chair', 'worldmodel/room/chair=chair/seat', 'worldmodel/grp/leaf']);
    const polys = worldCollision(w.models);
    const grid = buildGrid(DEFAULT_GRID_PARAMS, [], [], polys, collisionOwners(w.models));
    expect(probeGround(grid, 101, 101)).toEqual([]);                     // the chair's floor is gone
    expect(probeGround(grid, 52, 52)).toEqual([]);                       // and the group's leaf
  });
  it('hideGridNamed: only the node of that name whose local translation is strictly inside the box', () => {
    const w = world();
    const [r] = applyR0004Ops(w.models, 'mp0', [op({ op: 'hideGridNamed', pcs: ['t'], name: 'chair', box: [
      { index: 12, cmp: 'gt', bits: b(99.9) }, { index: 12, cmp: 'lt', bits: b(100.1) }, { index: 14, cmp: 'gt', bits: b(99.9) }, { index: 14, cmp: 'lt', bits: b(100.1) },
    ] })]);
    expect(r!.nodes).toEqual(['worldmodel/room/chair']);
    expect(w.chair.flags & 1).toBe(0);
    expect(w.chairModel.flags & 1).toBe(1);                               // the model itself, shared, is not touched
  });
  it('assignDi: the node lists the source\'s polygons, the same objects; its own are gone', () => {
    const w = world();
    const own = w.group.collision;
    applyR0004Ops(w.models, 'mp0', [op({ op: 'assignDi', pcs: ['t'], node: ['grp'], from: ['wall'] })]);
    expect(w.group.collision).not.toBe(w.wall.collision);
    expect(w.group.collision[0]).toBe(w.wall.collision[0]);
    expect(own).toEqual([]);
  });
  it('addNode: under a named parent in its frame, under the world root for the level\'s own name, under each named crate; a missing parent attaches nothing', () => {
    const w = world();
    const p = { word: 0x44000c13, points: [0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0].map(b) };
    const r = applyR0004Ops(w.models, 'mp9', [
      op({ op: 'addNode', pcs: ['a'], parent: { name: 'grp' }, polys: [p] }),
      op({ op: 'addNode', pcs: ['b'], parent: { name: 'mp9' }, polys: [p] }),
      op({ op: 'addNode', pcs: ['c'], parent: { worldChildrenNamed: 'grp' }, polys: [p] }),
      op({ op: 'addNode', pcs: ['d'], parent: { name: 'mp5' }, polys: [p] }),
    ]);
    expect(r.map((x) => x.changed)).toEqual([1, 1, 1, 0]);
    expect(r[3]!.why).toMatch(/no node named mp5/);
    const added = worldCollision(w.models).filter((q) => /r0004@/.test(q.path));
    expect(added.map((q) => [q.path, q.points[0], q.points[2], q.material])).toEqual([
      ['worldmodel/grp/r0004@a', 50, 50, 3], ['worldmodel/grp/r0004@c', 50, 50, 3], ['worldmodel/r0004@b', 0, 0, 3],
    ]);
    const owners = collisionOwners(w.models).filter((o) => /r0004@/.test(o.path));
    expect(owners.every((o) => o.flags === ((1 << 0) | (1 << 12)))).toBe(true);
  });
  it('a path steps through an instance into its model: the edit is the model\'s, and every placement takes it', () => {
    const w = world();
    const [r] = applyR0004Ops(w.models, 'mp0', [op({ op: 'word', pcs: ['t'], node: ['room', 'chair', 'seat'], and: 0xfffc03ff, or: 0x5000 })]);
    expect(r!.shared).toEqual(['chair/seat']);
    expect(w.chairModel.children[0]!.collision[0]!.material).toBe(20);
  });
});

describe('R4B-09: the generated table against the transcription v2\'s recount', () => {
  const ops = Object.values(R0004_MAP_EDITS).flatMap((m) => m.ops);
  const count = (k: R0004Op['op']): number => ops.filter((o) => o.op === k).length;
  it('231 polygons with one crate: 219 on new nodes, the crate cap\'s 1, 11 added to mp61\'s di_ext01', () => {
    const onNew = ops.flatMap((o) => (o.op === 'addNode' && 'name' in o.parent ? o.polys : []));
    const caps = ops.flatMap((o) => (o.op === 'addNode' && 'worldChildrenNamed' in o.parent ? o.polys : []));
    const added = ops.flatMap((o) => (o.op === 'addPolys' ? o.polys : []));
    expect([onNew.length, caps.length, added.length]).toEqual([219, 1, 11]);
    expect(count('addNode')).toBe(105);                                    // 104 named parents + the crate cap
    expect(count('stray')).toBe(4);
  });
  it('per kind: 33 box snaps and m52\'s relative pair as one, 8 index stores, 8 word rewrites, 11 stop-flag stores, 5 hides', () => {
    expect(count('snap')).toBe(34);
    expect(ops.filter((o) => o.op === 'snap' && o.branches.length === 2)).toHaveLength(1);
    expect(count('point')).toBe(8);
    expect(count('word')).toBe(8);
    expect(count('stopFlag') + ops.filter((o) => o.op === 'noop' && /stop flag/.test(o.why)).length).toBe(11);
    expect(count('hide') + count('hideGridNamed')).toBe(5);
    expect(count('assignDi')).toBe(5);                                     // + mp62's g14_5 onto itself, a noop
    expect(count('render')).toBe(4);
  });
  it('the table is the generator\'s output: no hand edit', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../src/r0004MapPatchTable.ts'), 'utf8');
    expect(text.startsWith('// GENERATED by socomlegacy/tools/r0004MapPatchGen.ts')).toBe(true);
    expect(bitsToFloat(0x44ea675c)).toBe(Math.fround(1875.23));
  });
});
