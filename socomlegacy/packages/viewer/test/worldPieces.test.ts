import { describe, expect, it } from 'vitest';
import {
  IDENTITY, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, placeInstances, transformPoint, worldCollision,
  type CollisionPoly, type PlacedModel, type SceneNode,
} from '@s2u/scene';
import { mergeWorld, type LoadedMesh } from '../src/loadMap';
import {
  bareWorldPieceWarnings, formatWorldPieceList, parseWorldPieceKey, planWorldPieces, worldPieceLoadRequest, worldPiecePlanFor, worldPiecesKeptLine,
} from '../src/worldPieces';

/**
 * Level-piece swaps (`TEST_ROOM_MODEL_PACK_ADAPTATION`). The scene is synthetic: two sibling nodes that share
 * a name, the way Desert Glory's `building_wc2` nodes do, plus one uniquely named structure. No disc geometry.
 */

const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
  name, modelName: null, type: NODE_GENERIC, flags: 0, matrix: Float32Array.from(IDENTITY),
  bbox: new Float32Array(6), regionmask: 0, visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
});

const moved = (x: number, y: number, z: number): Float32Array => {
  const m = Float32Array.from(IDENTITY);
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

/** A triangle in the node's own space. The node's matrix is what carries it into the world. */
function poly(): CollisionPoly {
  return {
    region: 0, refcount: 0, ditype: 3, ptcount: 3, material: 1, cameratype: 0,
    appflags: 0, inside: 0, shadow: 0, reverbZone: 0,
    points: new Float32Array([0, 0, 0, 2, 0, 0, 0, 0, 2]),
  };
}

function wall(matrix: Float32Array): SceneNode {
  return node('wall', { visuals: 1, visualParams: [0], visualMaterials: [0], matrix });
}

/**
 * Root visual, then `building_wc2` at the origin (wall at local x 3), `garage` at x 100, and a second
 * `building_wc2` at x 50 (its wall therefore at world x 53). Collision sits on the three structures.
 */
function town(): SceneNode[] {
  const root = node('worldmodel', {
    type: NODE_MODEL, visuals: 1, visualParams: [0], visualMaterials: [0], children: [
      node('building_wc2', { collision: [poly()], children: [wall(moved(3, 0, 0))] }),
      node('garage', { matrix: moved(100, 0, 0), collision: [poly()], children: [
        node('body', { visuals: 1, visualParams: [0], visualMaterials: [0] }),
      ] }),
      node('building_wc2', { matrix: moved(50, 0, 0), collision: [poly()], children: [wall(moved(3, 0, 0))] }),
    ],
  });
  return [root];
}

function worldOf(models: readonly SceneNode[]): PlacedModel[] {
  return placeInstances(models as SceneNode[]).filter((p) => p.modelName === 'worldmodel' && p.facade === 0);
}

/** One triangle per world placement, in that placement's frame. The merge is the draw. */
function meshAt(rowMajor: Float32Array, order: number): LoadedMesh {
  const local: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const positions = new Float32Array(9);
  local.forEach((p, i) => {
    const w = transformPoint(rowMajor, p[0], p[1], p[2]);
    positions[i * 3] = w[0];
    positions[i * 3 + 1] = w[1];
    positions[i * 3 + 2] = w[2];
  });
  return {
    positions, uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
    indices: new Uint32Array([0, 1, 2]), textureName: 'wall.tif', fog: true, lit: false,
    order, orderEnd: order, cull: true, alternate: false, scroll: null,
  };
}

/** The merged world draw for a request. Null is a load that did not ask, so nothing is left out. */
function draw(models: readonly SceneNode[], requested: readonly string[] | null): number[] {
  const world = worldOf(models);
  const plan = requested === null ? null : planWorldPieces(models, world, requested);
  const parts = world.flatMap((placed, i) => (plan?.drop[i] ? [] : [meshAt(placed.rowMajor, i)]));
  return mergeWorld(parts, {}, {}).flatMap((mesh) => Array.from(mesh.positions));
}

function hull(models: readonly SceneNode[]): string {
  return worldCollision(models as SceneNode[]).map((p) => `${p.path}|${Array.from(p.points).join(',')}`).join('\n');
}

describe('a level-piece key', () => {
  it('reads a bare name and a same-name ordinal, and rejects an index with no name', () => {
    expect(parseWorldPieceKey('world:garage')).toEqual({ name: 'garage', ordinal: null });
    expect(parseWorldPieceKey(' WORLD:Building_WC2#7 ')).toEqual({ name: 'Building_WC2', ordinal: 7 });
    expect(parseWorldPieceKey('world:#0')).toBeNull();
    expect(parseWorldPieceKey('world:')).toBeNull();
    expect(parseWorldPieceKey('crate')).toBeNull();
  });

  it('tells the two building_wc2 nodes apart by ordinal, and the garage by its name', () => {
    const models = town();
    const world = worldOf(models);
    const list = planWorldPieces(models, world, []).list;
    expect(list.map((piece) => piece.key)).toEqual(['world:building_wc2#0', 'world:garage#0', 'world:building_wc2#1']);
    expect(list.map((piece) => piece.index)).toEqual([0, 1, 2]);
    expect(list.map((piece) => [piece.pivot[0], piece.pivot[1], piece.pivot[2]])).toEqual([[0, 0, 0], [100, 0, 0], [50, 0, 0]]);
    expect(formatWorldPieceList(list)).toBe('world:building_wc2#0\nworld:garage#0\nworld:building_wc2#1');

    const first = planWorldPieces(models, world, ['world:building_wc2#0']);
    const second = planWorldPieces(models, world, ['WORLD:building_wc2#1']);
    expect(first.swaps.map((swap) => [swap.index, swap.ordinal, swap.pivot[0]])).toEqual([[0, 0, 0]]);
    expect(second.swaps.map((swap) => [swap.index, swap.ordinal, swap.pivot[0]])).toEqual([[2, 1, 50]]);
    expect(second.swaps[0]!.anchor[12]).toBe(50);
    expect(second.swaps[0]!.anchor[13]).toBe(0);
    expect(second.swaps[0]!.anchor[14]).toBe(0);
    expect(first.drop).not.toEqual(second.drop);

    const byName = planWorldPieces(models, world, ['world:garage']);
    const byOrdinal = planWorldPieces(models, world, ['world:garage#0']);
    expect(byName.drop).toEqual(byOrdinal.drop);
    expect(byName.swaps[0]!.key).toBe('world:garage#0');
    expect(byName.swaps[0]!.pivot).toEqual([100, 0, 0]);

    const ambiguous = planWorldPieces(models, world, ['world:building_wc2']);
    expect(ambiguous.swaps).toEqual([]);
    expect(ambiguous.drop.every((drop) => !drop)).toBe(true);
    expect(ambiguous.notes[0]).toContain('world:building_wc2#0');
    expect(planWorldPieces(models, world, ['world:#0']).swaps).toEqual([]);
    const twice = planWorldPieces(models, world, ['world:garage', 'world:garage#0']);
    expect(twice.swaps).toHaveLength(1);
    expect(twice.notes.some((line) => line.includes('same piece'))).toBe(true);
  });

  it('does not start a piece at a realised prototype', () => {
    const crate = node('crate', { type: NODE_MODEL, visuals: 1, visualParams: [0], visualMaterials: [0] });
    const root = node('worldmodel', {
      type: NODE_MODEL, children: [
        node('box', { type: NODE_INSTANCE, modelName: 'crate', matrix: moved(8, 0, 0) }),
      ],
    });
    const models = [root, crate];
    const list = planWorldPieces(models, worldOf(models), []).list;
    expect(list.map((piece) => piece.key)).toEqual(['world:box#0']);
    expect(list[0]!.pivot).toEqual([8, 0, 0]);
  });

  // The takeover's review F1: a piece whose subtree draws only props (a door, a breakable crate) has no world draw to
  // leave out -- a GLB there would stand on top of the prop, which still draws, swings or breaks. Never swapped; named.
  it('a piece that draws only props is not swapped: nothing dropped, a note, and it is named as kept (the review\'s F1)', () => {
    const crate = node('crate', { type: NODE_MODEL, visuals: 1, visualParams: [0], visualMaterials: [0] });
    const root = node('worldmodel', {
      type: NODE_MODEL, children: [node('box', { type: NODE_INSTANCE, modelName: 'crate', matrix: moved(8, 0, 0) })],
    });
    const models = [root, crate];
    const plan = planWorldPieces(models, worldOf(models), ['world:box#0']);
    expect(plan.swaps).toEqual([]);
    expect(plan.drop.every((d) => !d)).toBe(true);
    expect(plan.keptPropsOnly).toEqual(['world:box#0']);
    expect(plan.notes.some((line) => line.includes('world:box#0') && line.includes('no world draw'))).toBe(true);
  });
});

describe('the world draw', () => {
  it('is byte-identical when the load asks for nothing, or for no world key', () => {
    const models = town();
    const world = worldOf(models);
    const full = draw(models, null);
    expect(worldPiecePlanFor(models, world, undefined)).toBeNull();
    expect(worldPiecePlanFor(models, world, { worldPieces: [] })).toBeNull();
    expect(draw(models, [])).toEqual(full);
    const listed = worldPiecePlanFor(models, world, { listWorldPieces: true })!;
    expect(listed.drop.every((drop) => !drop)).toBe(true);
    expect(listed.list).toHaveLength(3);
    expect(draw(models, [])).toEqual(full);
    // The four draws, in walk order: the root, the first wall at x 3, the garage at x 100, the second wall at x 53.
    expect(full).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      3, 0, 0, 4, 0, 0, 3, 1, 0,
      100, 0, 0, 101, 0, 0, 100, 1, 0,
      53, 0, 0, 54, 0, 0, 53, 1, 0,
    ]);
  });

  it('drops only the named sibling\'s triangles', () => {
    const models = town();
    const full = draw(models, null);
    const second = draw(models, ['world:building_wc2#1']);
    const first = draw(models, ['world:building_wc2#0']);
    expect(second).toEqual(full.slice(0, 27));
    expect(full.slice(27)).toEqual([53, 0, 0, 54, 0, 0, 53, 1, 0]);
    expect(first).toEqual([...full.slice(0, 9), ...full.slice(18)]);
    expect(first).not.toEqual(second);
    expect(draw(models, ['world:building_wc2'])).toEqual(full);
    expect(draw(models, ['world:#0'])).toEqual(full);
    expect(draw(models, ['world:garage'])).toEqual([...full.slice(0, 18), ...full.slice(27)]);
  });

  it('keeps the original draw when the piece\'s triangles were not matched', () => {
    const models = town();
    const world = worldOf(models);
    const rootOnly = world.slice(0, 1);
    const plan = planWorldPieces(models, rootOnly, ['world:building_wc2#1']);
    expect(plan.swaps).toEqual([]);
    expect(plan.drop).toEqual([false]);
    expect(plan.notes[0]).toContain('original stays');
  });
});

// #432, taken over (OT.R69; the merge controller's call): a swapped level piece changes only the draw -- and a piece that
// moves or breaks (an alternate state, a switch path) is never swapped, since its GLB would stand still and whole while
// the door opens or the wall breaks. It stays on the disc's draw, and the plan counts it for the pack's status line.
describe('a piece that moves or breaks keeps the disc\'s draw (#432)', () => {
  it('is not swapped: no swap, nothing dropped, a note, and the kept count', () => {
    const models = town();
    const world = worldOf(models);
    const moves = (q: PlacedModel): boolean => q.world[12] === 100;                   // the garage's placement
    expect(world.some(moves)).toBe(true);
    const plan = planWorldPieces(models, world, ['world:garage', 'world:building_wc2#1'], moves);
    expect(plan.swaps.map((swap) => swap.id)).toEqual(['world:building_wc2#1']);
    expect(plan.drop.filter(Boolean)).toHaveLength(1);                                   // the second wall alone
    expect(plan.notes.some((line) => line.includes('world:garage') && line.includes('moves or breaks'))).toBe(true);
    expect(plan.keptMoving).toEqual(['world:garage']);
  });
  it('the pack\'s line names them, and says nothing when none were kept', () => {
    expect(worldPiecesKeptLine(undefined)).toBe('');
    expect(worldPiecesKeptLine([])).toBe('');
    expect(worldPiecesKeptLine(['world:garage'])).toBe('1 piece kept: it moves or breaks (world:garage).');
    expect(worldPiecesKeptLine(['world:a', 'world:b'])).toBe('2 pieces kept: they move or break (world:a, world:b).');
    expect(worldPiecesKeptLine([], ['world:cdoor1#0'])).toBe('1 piece kept: it has no world draw of its own (props or billboards only) (world:cdoor1#0).');
    expect(worldPiecesKeptLine(['world:a'], ['world:b', 'world:c'])).toBe(
      '1 piece kept: it moves or breaks (world:a). 2 pieces kept: they have no world draw of their own (props or billboards only) (world:b, world:c).');
  });
  it('the load path passes the test through (worldPiecePlanFor)', () => {
    const models = town();
    const world = worldOf(models);
    const plan = worldPiecePlanFor(models, world, { worldPieces: ['world:garage'] }, (q) => q.world[12] === 100)!;
    expect(plan.swaps).toEqual([]);
    expect(plan.keptMoving).toEqual(['world:garage']);
  });
});

describe('collision', () => {
  it('is the same hull with and without a swap', () => {
    const models = town();
    const world = worldOf(models);
    const polys = models[0]!.children.map((child) => child.collision[0]!.points);
    const before = hull(models);
    planWorldPieces(models, world, ['world:building_wc2#1', 'world:garage']);
    const after = hull(models);
    expect(after).toBe(before);
    expect(after.split('\n')).toHaveLength(3);
    expect(after).toContain('worldmodel/building_wc2|0,0,0,2,0,0,0,0,2');
    expect(after).toContain('worldmodel/building_wc2|50,0,0,52,0,0,50,0,2');
    expect(after).toContain('worldmodel/garage|100,0,0,102,0,0,100,0,2');
    expect(models[0]!.children.map((child) => child.collision[0]!.points)).toEqual(polys);
  });
});

describe('a bare id', () => {
  const pieces = [
    { name: 'g47', key: 'world:g47#0' },
    { name: 'building_wc2', key: 'world:building_wc2#0' },
    { name: 'building_wc2', key: 'world:building_wc2#1' },
  ];

  it('warns with the key to copy, and stays quiet for a prop name and for an id that already says world:', () => {
    expect(bareWorldPieceWarnings(['g47', 'G47', 'crate', 'world:g47#0', 'building_wc2'], pieces)).toEqual([
      'Model pack: "g47" matches a world piece by name only, so the original stays. Use "world:g47#0".',
      'Model pack: "G47" matches a world piece by name only, so the original stays. Use "world:g47#0".',
      'Model pack: "building_wc2" matches a world piece by name only, so the original stays. Use "world:building_wc2#0" or "world:building_wc2#1".',
    ]);
  });
});

describe('what the page sends', () => {
  it('sends world ids only while a pack is on, and the catalog only when asked', () => {
    expect(worldPieceLoadRequest(false, ['world:garage#0'], false)).toEqual({});
    expect(worldPieceLoadRequest(false, ['world:garage#0'], true)).toEqual({ listWorldPieces: true });
    expect(worldPieceLoadRequest(true, ['crate', 'world:garage#0'], true)).toEqual({
      worldPieces: ['world:garage#0'], listWorldPieces: true,
    });
    expect(worldPieceLoadRequest(true, ['crate'], false)).toEqual({});
  });

  it('honours at most 128 ids', () => {
    const models = town();
    const world = worldOf(models);
    const ignored = worldPiecePlanFor(models, world, {
      worldPieces: [...Array.from({ length: 128 }, (_, i) => `world:missing#${i}`), 'world:garage'],
    })!;
    expect(ignored.swaps).toEqual([]);
    const kept = worldPiecePlanFor(models, world, {
      worldPieces: [...Array.from({ length: 127 }, () => 'world:missing'), 'world:garage'],
    })!;
    expect(kept.swaps.map((swap) => swap.key)).toEqual(['world:garage#0']);
    expect(worldPiecePlanFor(undefined, world, { listWorldPieces: true })).toBeNull();
  });
});
