import { describe, expect, it } from 'vitest';
import { InstancedMesh, LineSegments, Matrix4, Mesh, Vector3, type BufferAttribute } from 'three';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import { buildWorld } from '../src/world';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';

/**
 * DOORS (socomlegacy/docs/research/92-doors.md): `WorldView.moveNode` draws a door's leaf where its swing has it -- every prop
 * placement at or under the door's node path, a mesh of its own or one instance of a shared draw -- and nothing
 * else; the identity puts them back where the disc has them, so nothing drawn is left behind.
 */

const part = (): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: 'door.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
  props: [
    // One placement: its own mesh (Frostfire's `door1` leaves, each lit apart).
    { modelName: 'leaf', parts: [part()], matrices: new Float32Array(at(10, 0, 0)), order: 0, alternate: false, facade: 0, lod: null,
      paths: ['worldmodel/door_a/door1=door1/door_slab'] },
    // Three placements, one instanced draw: the second is under door_b, the others are not.
    { modelName: 'slab', parts: [part()], matrices: new Float32Array([...at(0, 0, 0), ...at(20, 0, 0), ...at(40, 0, 0)]), order: 1,
      alternate: false, facade: 0, lod: null, paths: ['worldmodel/crate', 'worldmodel/door_b=slab', 'worldmodel/door_bb'] },
  ],
  textures: { 'door.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'door.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

describe('WorldView.moveNode (doors)', () => {
  const view = buildWorld(map());
  for (const task of view.revealProps) task();
  const leaf = view.group.children.find((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh) && c.name === 'leaf')!;
  const slabs = view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'slab')!;
  const instance = (i: number): Vector3 => { const m = new Matrix4(); slabs.getMatrixAt(i, m); return new Vector3().setFromMatrixPosition(m); };
  // A quarter turn about y through the door's hinge at (10, 0, 0), as a column-major delta.
  const turn = new Matrix4().makeTranslation(10, 0, 0).multiply(new Matrix4().makeRotationY(Math.PI / 2)).multiply(new Matrix4().makeTranslation(-10, 0, 0));

  it('moves the placements under the node, own mesh or instance, and only those', () => {
    expect(view.moveNode('worldmodel/door_a', turn.toArray())).toBe(1);
    leaf.updateMatrixWorld();
    // The leaf's far corner (1, 0, 0) in its model, (11, 0, 0) at rest, turns to (10, 0, -1).
    const corner = new Vector3(1, 0, 0).applyMatrix4(leaf.matrixWorld);
    expect(corner.x).toBeCloseTo(10, 5);
    expect(corner.z).toBeCloseTo(-1, 5);
    const shift = new Matrix4().makeTranslation(0, 0, 5).toArray();
    expect(view.moveNode('worldmodel/door_b', shift)).toBe(1);                  // not `door_bb`, not the crate
    expect(instance(0).toArray()).toEqual([0, 0, 0]);
    expect(instance(1).toArray()).toEqual([20, 0, 5]);
    expect(instance(2).toArray()).toEqual([40, 0, 0]);
  });

  it('the identity puts them back where the disc has them', () => {
    const identity = new Matrix4().toArray();
    view.moveNode('worldmodel/door_a', identity);
    view.moveNode('worldmodel/door_b', identity);
    leaf.updateMatrixWorld();
    expect(new Vector3().setFromMatrixPosition(leaf.matrixWorld).toArray()).toEqual([10, 0, 0]);
    expect(instance(1).toArray()).toEqual([20, 0, 0]);
    expect(view.moveNode('worldmodel/nothing', identity)).toBe(0);
  });
});

/**
 * Chain Reaction (research 176 §9.2): `swingplate` turns about its own X after the hook's translation, and a child of
 * it turns with it. The hook's other children keep the translation only.
 */
describe('WorldView.spinLocalX (the hook\'s swingplate)', () => {
  const m = map();
  m.props.push(
    { modelName: 'hook', parts: [part()], matrices: new Float32Array(at(100, 0, 0)), order: 3, alternate: false, facade: 0, lod: null, paths: ['worldmodel/hook1'] },
    { modelName: 'swing', parts: [part()], matrices: new Float32Array(at(100, -1, 0)), order: 4, alternate: false, facade: 0, lod: null, paths: ['worldmodel/hook1/swingplate'] },
    { modelName: 'bolt', parts: [part()], matrices: new Float32Array(at(100, -1, 2)), order: 5, alternate: false, facade: 0, lod: null, paths: ['worldmodel/hook1/swingplate/bolt'] },
    { modelName: 'cable', parts: [part()], matrices: new Float32Array(at(100, 1, 0)), order: 6, alternate: false, facade: 0, lod: null, paths: ['worldmodel/hook1/cable'] },
  );
  const view = buildWorld(m);
  for (const task of view.revealProps) task();
  const mesh = (name: string): Mesh => view.group.children.find((c): c is Mesh => c instanceof Mesh && c.name === name)!;
  const place = (name: string): number[] => {
    const node = mesh(name);
    node.updateMatrixWorld(true);
    return new Vector3().setFromMatrixPosition(node.matrixWorld).toArray();
  };
  const vertex = (name: string, x: number, y: number, z: number): number[] => {
    const node = mesh(name);
    node.updateMatrixWorld(true);
    return new Vector3(x, y, z).applyMatrix4(node.matrixWorld).toArray();
  };

  it('turns swingplate about its local X and keeps the hook translation on it and on its child', () => {
    const slide = new Matrix4().makeTranslation(0, 0, 5).toArray();
    expect(view.moveNode('worldmodel/hook1', slide)).toBe(4);
    expect(view.spinLocalX('worldmodel/hook1/swingplate', Math.PI / 2)).toBe(2);
    expect(place('hook')).toEqual([100, 0, 5]);
    expect(place('cable')).toEqual([100, 1, 5]);
    expect(place('swing')).toEqual([100, -1, 5]);
    const corner = vertex('swing', 0, 1, 0);
    expect(corner[0]).toBeCloseTo(100, 5);
    expect(corner[1]).toBeCloseTo(-1, 5);
    expect(corner[2]).toBeCloseTo(6, 5);
    expect(place('bolt')[0]).toBeCloseTo(100, 5);
    expect(place('bolt')[1]).toBeCloseTo(-3, 5);
    expect(place('bolt')[2]).toBeCloseTo(5, 5);
    expect(view.spinLocalX('worldmodel/hook1/missing', 1)).toBe(0);
  });
});

/**
 * MAP-02 (research 209 s8): `WorldView.setNodeActive` draws what the world's state has active -- every placement at or
 * under the path, its own mesh or one instance of a shared draw (that instance's matrix zeroed, the others drawn) --
 * and `setAlternate` stays the debug view that shows everything. An alternate group (`LoadedMap.props[].alternate`,
 * hidden as it opens) is shown member by member the same way.
 */
describe('WorldView.setNodeActive (the world\'s state)', () => {
  const m = map();
  m.props.push({ modelName: 'rubble', parts: [part()], matrices: new Float32Array([...at(0, 0, 50), ...at(20, 0, 50)]), order: 2,
    alternate: true, facade: 0, lod: null, paths: ['worldmodel/arch_a=arch/destroyed', 'worldmodel/arch_b=arch/destroyed'] });
  const view = buildWorld(m);
  for (const task of view.revealProps) task();
  const leaf = view.group.children.find((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh) && c.name === 'leaf')!;
  const slabs = view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'slab')!;
  const rubble = view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'rubble')!;
  const matrixOf = (mesh: InstancedMesh, i: number): Matrix4 => { const out = new Matrix4(); mesh.getMatrixAt(i, out); return out; };
  const shown = (mesh: InstancedMesh, i: number): boolean => matrixOf(mesh, i).determinant() !== 0;
  const where = (mesh: InstancedMesh, i: number): number[] => new Vector3().setFromMatrixPosition(matrixOf(mesh, i)).toArray();

  it('setNodeActive hides every placement under the path, an instance of a shared draw included, and shows it again; moveNode still moves the shown ones', () => {
    expect(view.setNodeActive('worldmodel/door_b', false)).toBe(1);                     // not `door_bb`, not the crate
    expect([0, 1, 2].map((i) => shown(slabs, i))).toEqual([true, false, true]);
    expect(slabs.visible).toBe(true);
    expect(view.setNodeActive('worldmodel/door_a', false)).toBe(1);
    expect(leaf.visible).toBe(false);
    // Moved while hidden: still hidden, and where the move put it once shown.
    expect(view.moveNode('worldmodel/door_b', new Matrix4().makeTranslation(0, 0, 5).toArray())).toBe(1);
    expect(shown(slabs, 1)).toBe(false);
    expect(view.moveNode('worldmodel/crate', new Matrix4().makeTranslation(0, 3, 0).toArray())).toBe(1);
    expect(where(slabs, 0)).toEqual([0, 3, 0]);
    expect(view.setNodeActive('worldmodel/door_b', true)).toBe(1);
    expect(where(slabs, 1)).toEqual([20, 0, 5]);
    view.setNodeActive('worldmodel/door_a', true);
    expect(leaf.visible).toBe(true);
    // The debug view shows everything; off again, the state is drawn as it was.
    view.setNodeActive('worldmodel/door_bb', false);
    view.setAlternate(true);
    expect(shown(slabs, 2)).toBe(true);
    expect(rubble.visible).toBe(true);
    view.setAlternate(false);
    expect(shown(slabs, 2)).toBe(false);
    expect(rubble.visible).toBe(false);
    // An alternate group, one member at a time: arch_a's rubble shown, arch_b's not.
    expect(view.setNodeActive('worldmodel/arch_a', true)).toBe(1);
    expect(rubble.visible).toBe(true);
    expect([shown(rubble, 0), shown(rubble, 1)]).toEqual([true, false]);
    view.setNodeActive('worldmodel/arch_a', false);
    expect(rubble.visible).toBe(false);
    expect(view.setNodeActive('worldmodel/nothing', false)).toBe(0);
  });
});

/**
 * LATER 165: `WorldView.setNodeCut` -- a node's opacity (+0x9c) at 0 draws nothing under it (`FUN_003374c0`
 * D:L235418-235437; the walk multiplies it down the subtree, `FUN_00336980` D:L235030-235043) -- a switch of its own
 * beside the world's state's: a placement is drawn only when neither hides it, and lifting one leaves the other's.
 */
describe('WorldView.setNodeCut (LATER 165: a node\'s opacity at 0)', () => {
  const view = buildWorld(map());
  for (const task of view.revealProps) task();
  const leaf = view.group.children.find((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh) && c.name === 'leaf')!;
  const slabs = view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'slab')!;
  const shown = (i: number): boolean => { const m = new Matrix4(); slabs.getMatrixAt(i, m); return m.determinant() !== 0; };

  it('cuts every placement under the path, own mesh or instance, and gives it back; the world state\'s switch stands apart', () => {
    expect(view.setNodeCut('worldmodel/door_b', true)).toBe(1);                          // not `door_bb`, not the crate
    expect([0, 1, 2].map(shown)).toEqual([true, false, true]);
    expect(view.setNodeCut('worldmodel/door_a', true)).toBe(1);
    expect(leaf.visible).toBe(false);
    // The world's state hides door_a too; the cut lifted, it stays hidden by the state -- and the other way round.
    view.setNodeActive('worldmodel/door_a', false);
    view.setNodeCut('worldmodel/door_a', false);
    expect(leaf.visible).toBe(false);
    view.setNodeActive('worldmodel/door_a', true);
    expect(leaf.visible).toBe(true);
    view.setNodeCut('worldmodel/door_b', true);
    view.setNodeActive('worldmodel/door_b', true);
    expect(shown(1)).toBe(false);                                                         // the cut still holds it
    expect(view.setNodeCut('worldmodel/door_b', false)).toBe(1);
    expect([0, 1, 2].map(shown)).toEqual([true, true, true]);
    expect(view.setNodeCut('worldmodel/nothing', true)).toBe(0);
  });
});

/**
 * FG-17 (the forge: a base map's own prop hidden in a layout; a browser adaptation): `WorldView.setPlacementActive`
 * switches ONE placement by its `<prop entry>:<placement>` key -- the switch `setNodeActive` flips by path -- so one of
 * many placements sharing a node path (Frostfire's thirteen `container_blue01`) can be hidden alone.
 */
describe('WorldView.setPlacementActive (one placement by its key)', () => {
  const view = buildWorld(map());
  for (const task of view.revealProps) task();
  const leaf = view.group.children.find((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh) && c.name === 'leaf')!;
  const slabs = view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'slab')!;
  const shown = (i: number): boolean => { const m = new Matrix4(); slabs.getMatrixAt(i, m); return m.determinant() !== 0; };

  it('hides the one placement, an instance of a shared draw or a mesh of its own, and shows it again', () => {
    expect(view.setPlacementActive('1:1', false)).toBe(1);
    expect([0, 1, 2].map(shown)).toEqual([true, false, true]);
    expect(view.setPlacementActive('0:0', false)).toBe(1);
    expect(leaf.visible).toBe(false);
    expect(view.setPlacementActive('1:1', true)).toBe(1);
    expect(view.setPlacementActive('0:0', true)).toBe(1);
    expect([0, 1, 2].map(shown)).toEqual([true, true, true]);
    expect(leaf.visible).toBe(true);
    expect(view.setPlacementActive('9:9', false)).toBe(0);
  });
});

/**
 * FG-23 (the owner's playtest, 2026-10-14: "deleting original map objects visually only appears to delete half of
 * them ... the hitbox does disappear"): a prop is drawn as one object per PART (one per texture), each registered under
 * the same `<prop entry>:<placement>` key, so the switch must reach every part of the placement -- an own mesh's as an
 * instance's -- or the parts drawn with the other textures stay on screen.
 */
describe('WorldView.setPlacementActive (every part of the placement)', () => {
  const m = map();
  const second = (): LoadedMesh => ({ ...part(), textureName: 'lid.tif' });
  m.textures['lid.tif'] = m.textures['door.tif']!;
  m.textureFlags['lid.tif'] = m.textureFlags['door.tif']!;
  m.props = [
    { modelName: 'box', parts: [part(), second()], matrices: new Float32Array(at(0, 0, 0)), order: 0, alternate: false, facade: 0, lod: null,
      paths: ['worldmodel/box_a'] },
    { modelName: 'crate', parts: [part(), second()], matrices: new Float32Array([...at(20, 0, 0), ...at(40, 0, 0)]), order: 1,
      alternate: false, facade: 0, lod: null, paths: ['worldmodel/crate_a', 'worldmodel/crate_b'] },
  ];
  const view = buildWorld(m);
  for (const task of view.revealProps) task();
  const boxes = view.group.children.filter((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh) && c.name === 'box');
  const crates = view.group.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === 'crate');
  const shown = (mesh: InstancedMesh, i: number): boolean => { const o = new Matrix4(); mesh.getMatrixAt(i, o); return o.determinant() !== 0; };

  it('draws two parts per prop', () => {
    expect(boxes).toHaveLength(2);
    expect(crates).toHaveLength(2);
  });

  it('hides both parts of an own mesh, both parts of one instance, and shows them again', () => {
    expect(view.setPlacementActive('0:0', false)).toBe(1);
    expect(boxes.map((b) => b.visible)).toEqual([false, false]);
    expect(view.setPlacementActive('1:1', false)).toBe(1);
    expect(crates.map((c) => shown(c, 1))).toEqual([false, false]);
    expect(crates.map((c) => shown(c, 0))).toEqual([true, true]);
    expect(view.setPlacementActive('0:0', true)).toBe(1);
    expect(view.setPlacementActive('1:1', true)).toBe(1);
    expect(boxes.map((b) => b.visible)).toEqual([true, true]);
    expect(crates.map((c) => shown(c, 1))).toEqual([true, true]);
  });
});

/**
 * FG-32 (the owner's playtest, FG.R17; the forge's hide, a browser adaptation): a prop's line strips -- Crossroads' tent
 * guy ropes and lamp filaments -- are merged into the world's line groups by texture, not drawn on the prop's own objects,
 * so `setPlacementActive` must collapse the hidden placement's span of points (`LoadedLineGroup.spans`, by the placement's
 * place in the walk, `LoadedMap.props[].walk`) and put it back when shown -- the other placements' strips untouched, and
 * the loaded map's own arrays never written.
 */
describe('WorldView.setPlacementActive (a hidden placement\'s line strips)', () => {
  const m = map();
  m.props = [
    { modelName: 'tent', parts: [part()], matrices: new Float32Array([...at(0, 0, 0), ...at(50, 0, 0)]), order: 0, alternate: false, facade: 0,
      lod: null, paths: ['worldmodel/tent_a=tent', 'worldmodel/tent_b=tent'], walk: [7, 9] },
  ];
  // One group: tent_a's two points (one segment), then tent_b's four (two segments).
  const positions = new Float32Array([0, 0, 0, 1, 2, 3, 50, 0, 0, 51, 2, 3, 51, 2, 3, 52, 4, 6]);
  const disc = positions.slice();
  m.lines = [{
    textureName: 'door.tif', fog: true, order: 0, positions, uvs: new Float32Array(12), colors: new Float32Array(24).fill(1),
    normals: new Float32Array(18), spans: [{ walk: 7, first: 0, count: 2 }, { walk: 9, first: 2, count: 4 }],
  }];
  const view = buildWorld(m);
  for (const task of view.revealProps) task();
  const lines = view.group.children.find((c): c is LineSegments => c instanceof LineSegments)!;
  const drawn = (): number[] => Array.from((lines.geometry.getAttribute('position') as BufferAttribute).array as Float32Array);
  const segment = (i: number): number => {
    const p = drawn();
    return Math.hypot(p[i * 6]! - p[i * 6 + 3]!, p[i * 6 + 1]! - p[i * 6 + 4]!, p[i * 6 + 2]! - p[i * 6 + 5]!);
  };

  it('hides the placement\'s segments alone, and shows them again byte for byte; the loaded map is not written', () => {
    expect(view.setPlacementActive('0:1', false)).toBe(1);
    expect([0, 1, 2].map((i) => segment(i) > 0)).toEqual([true, false, false]);
    expect(drawn().slice(0, 6)).toEqual(Array.from(disc.slice(0, 6)));
    expect((lines.geometry.getAttribute('position') as BufferAttribute).version).toBeGreaterThan(0);
    expect(Array.from(positions)).toEqual(Array.from(disc));
    expect(view.setPlacementActive('0:0', false)).toBe(1);
    expect([0, 1, 2].map((i) => segment(i) > 0)).toEqual([false, false, false]);
    expect(view.setPlacementActive('0:1', true)).toBe(1);
    expect(view.setPlacementActive('0:0', true)).toBe(1);
    expect(drawn()).toEqual(Array.from(disc));
  });
});

/**
 * FG-39 (the forge's day/night in Play): the match lights its world with `setLighting` only when a caller names a
 * brighten (`matchMount.ts`). With the map's own rig, as the mount's `lighting` carries it, that moves the brighten
 * uniform and re-bakes nothing: every lit vertex colour stays as built, so the game's look is unchanged.
 */
describe('WorldView.setLighting with the map\'s own rig (FG-39)', () => {
  it('re-bakes no vertex colour', () => {
    const m = map();
    const rig = { directions: [[0, 1, 0]], colours: [[0.8, 0.6, 0.4]], ambient: [0.2, 0.2, 0.2] } as unknown as LoadedMap['lightRig'];
    m.lightRig = rig;
    for (const p of m.props) for (const part of p.parts) part.lit = true;
    const view = buildWorld(m);
    for (const task of view.revealProps) task();
    const colours = (): number[][] => view.group.children.flatMap((c) => {
      const a = (c as Mesh).geometry?.getAttribute?.('color');
      return a ? [Array.from(a.array as Float32Array)] : [];
    });
    const before = colours();
    expect(before.length).toBeGreaterThan(0);
    view.setLighting({ ...DEFAULT_LIGHTING, rig, brighten: -64 });
    expect(colours()).toEqual(before);
  });
});
