import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { palette, prototypeMap } from '../../src/forge/library';

/** FORGE: the palette is the props a loaded archive places; a piece is one prototype drawn once at the origin. */
const part = { positions: new Float32Array(9) } as unknown as LoadedMap['props'][number]['parts'][number];
const prop = (modelName: string, placements: number, parts = [part]): LoadedMap['props'][number] => ({
  modelName, parts, matrices: new Float32Array(16 * placements).fill(7), order: 3, alternate: true, facade: 0, lod: null,
  cells: Array.from({ length: placements }, () => [5]), paths: Array.from({ length: placements }, () => 'p'),
});
const map = {
  archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'FROSTFIRE', world: [part], lines: [],
  props: [prop('crate', 2), prop('barrel', 1), prop('crate', 3), prop('empty', 1, [])],
} as unknown as LoadedMap;

describe('FORGE: the palette', () => {
  it('lists each prototype once, by name, with how often the map places it; none without geometry', () => {
    expect(palette(map)).toEqual([
      { asset: 'MP2:barrel', model: 'barrel', placed: 1 },
      { asset: 'MP2:crate', model: 'crate', placed: 5 },
    ]);
  });
});

describe('FORGE: one prototype as a map of its own', () => {
  it('has no world and one placement at the identity, shown in its opening state', () => {
    const one = prototypeMap(map, 'crate')!;
    expect(one.world).toEqual([]);
    expect(one.lines).toBeNull();
    expect(one.props).toHaveLength(1);
    const p = one.props[0]!;
    expect(p.modelName).toBe('crate');
    expect([...p.matrices]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.alternate).toBe(false);
    expect(p.cells).toBeUndefined();
    expect(p.paths).toBeUndefined();
    expect(map.props[0]!.matrices[0]).toBe(7);                 // the loaded map is not touched
  });

  it('is null for a prototype the archive does not hold', () => {
    expect(prototypeMap(map, 'tank')).toBeNull();
  });
});

describe('FACADES-2 F1: the world model\'s own facade nodes are not a prop of the palette', () => {
  // Since LATER 112 `loadMap` draws the world model's facade nodes (MP7's moon and stars, MP52's pipes, ...) as props named
  // `worldmodel`; the server's forge reads no `worldmodel` placement (`archiveParts`), so the page offers none either.
  const withWorld = { ...map, props: [...map.props, { ...prop('worldmodel', 6), facade: 1 }] } as unknown as LoadedMap;
  it('palette lists no "worldmodel" entry', () => {
    expect(palette(withWorld).map((e) => e.model)).toEqual(['barrel', 'crate']);
  });
  it('prototypeMap makes no piece of it', () => {
    expect(prototypeMap(withWorld, 'worldmodel')).toBeNull();
  });
});
