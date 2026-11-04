import { describe, expect, it } from 'vitest';
import { probeGround } from '@s2u/scene';
import { groundGrid, groundPolygons, packGround } from '../../src/mover';
import type { LoadedMap } from '../../src/loadMap';
import { groundWithout, linesWithout, placementOf, placementsOf, propsWithout } from '../../src/forge/hide';
import { placementKey } from '../../src/forge/layout';

/**
 * FORGE (FG-17; the owner, 2026-10-13: "manipulating the existing props where possible by effectively hiding them on
 * the requested maps"): a base map's own placement hidden in a layout -- found by its model and place, taken out of
 * the props the match draws and out of the hull the walk and the room stand on.
 */
const grid = { atomCount: 8192, posts: 16, cellDim: 640, cellsX: 4, cellsZ: 4, originX: -1280, originZ: -1280 };
const at = (x: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];
const top = (x: number, z: number, y: number) => new Float32Array([x - 10, y, z - 10, x + 10, y, z - 10, x + 10, y, z + 10, x - 10, y, z + 10]);
const poly = (modelName: string, path: string, points: Float32Array) =>
  ({ modelName, path, region: 0, ditype: 3, material: 0, ptcount: 4, cameratype: 0, points });
const P = 'worldmodel/crate=crate';
/** Two crates on one shared path (as the disc's containers share theirs), a barrel, and the world's floor. */
const map = {
  archive: 'MP2',
  props: [
    { modelName: 'crate', parts: [{}], matrices: new Float32Array([...at(100, 200), ...at(-300, 0)]), order: 0, alternate: false, facade: 0, lod: null, paths: [P, P] },
    { modelName: 'barrel', parts: [{}], matrices: new Float32Array(at(50, 50)), order: 1, alternate: false, facade: 0, lod: null, paths: ['worldmodel/barrel=barrel'] },
  ],
  ground: packGround(grid, [
    poly('worldmodel', 'worldmodel', new Float32Array([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000])),
    poly('crate', `${P}/climb`, top(100, 200, 10)), poly('crate', `${P}/climb`, top(-300, 0, 10)), poly('barrel', 'worldmodel/barrel=barrel', top(50, 50, 30)),
  ], [
    { modelName: 'worldmodel', path: 'worldmodel', first: 0, count: 1 },
    { modelName: 'crate', path: `${P}/climb`, first: 1, count: 1 }, { modelName: 'crate', path: `${P}/climb`, first: 2, count: 1 },
    { modelName: 'barrel', path: 'worldmodel/barrel=barrel', first: 3, count: 1 },
  ]),
} as unknown as LoadedMap;

describe('FORGE: a base map\'s placement, hidden', () => {
  it('is found by its model and place: the prop entry and the placement', () => {
    expect(placementOf(map, 'crate', at(-300, 0))).toEqual({ prop: 0, index: 1, key: placementKey('crate', -300, 0, 0) });
    expect(placementOf(map, 'crate', at(5, 5))).toBeNull();
    expect([...placementsOf(map, [placementKey('crate', -300, 0, 0), placementKey('barrel', 50, 0, 50), 'ghost@1,2,3'])]).toEqual(['0:1', '1:0']);
  });

  it('leaves the props the match draws without it, the rest as they were', () => {
    const props = propsWithout(map, placementsOf(map, [placementKey('crate', -300, 0, 0), placementKey('barrel', 50, 0, 50)]));
    expect(props.map((p) => [p.modelName, p.matrices.length / 16, p.paths])).toEqual([['crate', 1, [P]]]);
    expect([...props[0]!.matrices.slice(12, 15)]).toEqual([100, 0, 200]);
    expect(map.props[0]!.matrices.length).toBe(32);                    // the loaded map is not touched
  });

  it('takes its own polygons out of the hull -- the shared path shared out in walk order -- and nothing else', () => {
    const g = groundWithout(map, map.ground!, placementsOf(map, [placementKey('crate', -300, 0, 0)]));
    expect(groundPolygons(g)).toHaveLength(3);
    const highest = (x: number, z: number) => probeGround(groundGrid(g), x, z).map((h) => h.y).sort((a, b) => b - a)[0];
    expect(highest(-300, 0)).toBeCloseTo(0);                           // the hidden crate's top gone: the floor
    expect(highest(100, 200)).toBeCloseTo(10);                         // the other crate on the same path stands
    expect(highest(50, 50)).toBeCloseTo(30);
    expect(groundWithout(map, map.ground!, new Set())).toBe(map.ground);
  });
});

describe('FG-31: a path\'s owners shared out in the walk\'s order, not the draw groups\'', () => {
  /**
   * One model's placements of one path split across two draw entries (`walk`: each placement's place in the scene walk):
   * the entries' order is not the walk's. The hull's owners under the path follow the walk: the first owner is the
   * walk's first placement's.
   */
  const split = {
    archive: 'MP2',
    props: [
      { modelName: 'crate', parts: [{}], matrices: new Float32Array([...at(-300, 0), ...at(700, 700)]), order: 0, alternate: false, facade: 0, lod: null, paths: [P, P], walk: [5, 9] },
      { modelName: 'crate', parts: [{}], matrices: new Float32Array(at(100, 200)), order: 1, alternate: false, facade: 0, lod: null, paths: [P], walk: [2] },
    ],
    ground: packGround(grid, [poly('crate', `${P}/climb`, top(100, 200, 10)), poly('crate', `${P}/climb`, top(-300, 0, 10)), poly('crate', `${P}/climb`, top(700, 700, 10))], [
      { modelName: 'crate', path: `${P}/climb`, first: 0, count: 1 }, { modelName: 'crate', path: `${P}/climb`, first: 1, count: 1 },
      { modelName: 'crate', path: `${P}/climb`, first: 2, count: 1 },
    ]),
  } as unknown as LoadedMap;
  const highest = (g: ReturnType<typeof groundWithout>, x: number, z: number) => probeGround(groundGrid(g), x, z).map((h) => h.y).sort((a, b) => b - a)[0];

  it('hiding the walk\'s first placement drops the first share of owners', () => {
    const g = groundWithout(split, split.ground!, placementsOf(split, [placementKey('crate', 100, 0, 200)]));
    expect(groundPolygons(g)).toHaveLength(2);
    expect(highest(g, 100, 200)).toBeUndefined();                     // its own top gone
    expect(highest(g, -300, 0)).toBeCloseTo(10);
    expect(highest(g, 700, 700)).toBeCloseTo(10);
  });

  it('each placement drops its own share by its place in the walk, whichever entry draws it', () => {
    const g = groundWithout(split, split.ground!, placementsOf(split, [placementKey('crate', 700, 0, 700)]));
    expect(highest(g, 700, 700)).toBeUndefined();
    expect(highest(g, 100, 200)).toBeCloseTo(10);
    expect(highest(g, -300, 0)).toBeCloseTo(10);
  });

  it('the hidden placement\'s walk place goes with it out of the drawn props', () => {
    const props = propsWithout(split, placementsOf(split, [placementKey('crate', -300, 0, 0)]));
    expect(props.map((p) => p.walk)).toEqual([[9], [2]]);
  });
});

/**
 * FG-36 (FG-32's report): Play's map keeps the base's line strips, so a hidden placement's guy ropes stayed in the match.
 * `linesWithout` drops each hidden placement's points (its spans, by its place in the walk) from every line group; a
 * group left with none goes; the loaded map is not touched.
 */
describe('FG-36: a hidden placement\'s line strips left out of the match\'s map', () => {
  const pts = (n: number, base: number): Float32Array => Float32Array.from({ length: n * 3 }, (_, i) => base + i);
  const group = (n: number, spans: { walk: number; first: number; count: number }[]) => ({
    textureName: 'rope.tif', fog: true, order: 0, positions: pts(n, 0), uvs: new Float32Array(n * 2).fill(0.5),
    colors: new Float32Array(n * 4).fill(1), normals: new Float32Array(n * 3), spans,
  });
  const lined = {
    props: [{ modelName: 'tent', matrices: new Float32Array(32), paths: ['worldmodel/tent_a=tent', 'worldmodel/tent_b=tent'], walk: [7, 9] }],
    lines: [group(6, [{ walk: 7, first: 0, count: 2 }, { walk: 9, first: 2, count: 4 }]), group(2, [{ walk: 9, first: 0, count: 2 }])],
  } as unknown as LoadedMap;

  it('drops the hidden placement\'s points only, renumbers what is kept, and drops a group left empty', () => {
    const out = linesWithout(lined, new Set(['0:1']))!;
    expect(out).toHaveLength(1);
    expect(out[0]!.positions).toEqual(lined.lines![0]!.positions.slice(0, 6));
    expect(out[0]!.uvs).toHaveLength(4);
    expect(out[0]!.colors).toHaveLength(8);
    expect(out[0]!.normals).toHaveLength(6);
    expect(out[0]!.spans).toEqual([{ walk: 7, first: 0, count: 2 }]);
    expect(lined.lines![0]!.positions).toHaveLength(18);                 // the loaded map's lines are not touched
  });

  it('is the map\'s own lines when nothing is hidden or the map has none', () => {
    expect(linesWithout(lined, new Set())).toBe(lined.lines);
    expect(linesWithout({ ...lined, lines: null } as LoadedMap, new Set(['0:0']))).toBeNull();
  });
});

describe('FACADES-2 F1: a world-model facade node is not a hideable base prop', () => {
  // Since LATER 112 `loadMap` draws the world model's facade nodes as props named `worldmodel` (MP52's pipe
  // `worldmodel/g21002`); the server's forge reads no `worldmodel` placement (`archiveParts`), so neither does the page.
  const withWorld = {
    ...map,
    props: [...map.props, { modelName: 'worldmodel', parts: [{}], matrices: new Float32Array(at(700, 700)), order: 2, alternate: false, facade: 1, lod: null, paths: ['worldmodel/g21002'] }],
  } as unknown as LoadedMap;
  it('placementOf finds none, and placementsOf takes no key of it', () => {
    expect(placementOf(withWorld, 'worldmodel', at(700, 700))).toBeNull();
    expect([...placementsOf(withWorld, [placementKey('worldmodel', 700, 0, 700), placementKey('barrel', 50, 0, 50)])]).toEqual(['1:0']);
  });
});
