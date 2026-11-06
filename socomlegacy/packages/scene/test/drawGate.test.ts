import { describe, expect, it } from 'vitest';
import { IDENTITY, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, placeInstances, type SceneNode } from '../src/index';

/**
 * LATER 707 (research 383 §5, research 318 §1.2): the draw walk's `m_active` gate. `FUN_003389c0` -- the world's node
 * draw, from the grid walk `FUN_00339de0` (D:L236971) -- tests the node's `+0x5c` bit 0 first (D:L236069), and only
 * inside that test draws the node's visuals (`FUN_003374c0`, D:L236189-236192) and recurses into its children
 * (D:L236208-236219): a node off draws nothing of itself or of its subtree, an instance's model with it. It is the draw's
 * twin of the probe's gate (`FUN_002d3030` D:L175073-175074). `placeInstances` keeps only what the gate lets through, the
 * chunk keys of the rest unchanged (the `N` index counts every visual-bearing node, drawn or not). Synthetic graphs; the
 * disc's count is `drawGateDisc.test.ts`'s.
 */
const ACTIVE = 1;
const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
  name, modelName: null, type: NODE_GENERIC, flags: ACTIVE, matrix: Float32Array.from(IDENTITY),
  bbox: new Float32Array(6), regionmask: 0, visuals: 1, visualParams: [0], visualMaterials: [0], children: [], collision: [], ...over,
});

describe('LATER 707: the draw gate (FUN_003389c0 D:L236069)', () => {
  const barrel = (): SceneNode => node('barrel', { type: NODE_MODEL, children: [node('lid')] });
  const world = (off: boolean): SceneNode[] => [barrel(), node('worldmodel', {
    type: NODE_MODEL, visuals: 0,
    children: [
      node('wall'),
      node('b1', {
        visuals: 0, flags: off ? 0 : ACTIVE,
        children: [node('b1_mesh'), node('barrel_1', { type: NODE_INSTANCE, modelName: 'barrel', visuals: 0 })],
      }),
      node('roof'),
    ],
  })];

  it('draws every placement of an active graph', () => {
    expect(placeInstances(world(false)).map((p) => p.path)).toEqual([
      'worldmodel/wall', 'worldmodel/b1/b1_mesh', 'worldmodel/b1/barrel_1=barrel', 'worldmodel/b1/barrel_1=barrel/lid', 'worldmodel/roof',
    ]);
  });

  it('a node off draws nothing of its subtree, its instances\' models included; the rest keep their chunk keys', () => {
    const on = placeInstances(world(false)), off = placeInstances(world(true));
    expect(off.map((p) => p.path)).toEqual(['worldmodel/wall', 'worldmodel/roof']);
    const keys = (ps: typeof on): Record<string, string[]> => Object.fromEntries(ps.map((p) => [p.path, p.chunks]));
    expect(keys(off)['worldmodel/roof']).toEqual(keys(on)['worldmodel/roof']);
    expect(keys(off)['worldmodel/wall']).toEqual(keys(on)['worldmodel/wall']);
  });

  it('a node off by its own bit, its parent on: only that node and below', () => {
    const models = world(false);
    models[1]!.children[1]!.children[0]!.flags = 0;   // b1_mesh off, b1 on
    expect(placeInstances(models).map((p) => p.path)).toEqual([
      'worldmodel/wall', 'worldmodel/b1/barrel_1=barrel', 'worldmodel/b1/barrel_1=barrel/lid', 'worldmodel/roof',
    ]);
  });
});
