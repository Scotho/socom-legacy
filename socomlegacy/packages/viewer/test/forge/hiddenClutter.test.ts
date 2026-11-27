import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { placementsOf, propsWithout } from '../../src/forge/hide';
import { placementKey } from '../../src/forge/layout';

/**
 * LATER 999, the review's F1 (product track; the Forge's hide, a browser adaptation): a clutter instance drawn in several
 * parts (MP5's `bananatree1#282`: 5 parts at 5 places, one collision owner) is ONE object. Every part carries the
 * instance's path, `clutter/<model>#<record>`, and the hull's owners hang under it, so hiding one part takes the whole
 * instance's collision -- hiding it must take every part's drawing too, or a visible tree is left to walk through.
 * Synthetic placements; no disc.
 */
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

function map(): Pick<LoadedMap, 'props'> {
  return {
    props: [
      // Two parts of the tree's record 4 (a trunk and a crown, at two places), one part of its record 5, in one entry.
      { modelName: 'tree', matrices: Float32Array.from([...at(10, 0, 10), ...at(10, 6, 10), ...at(40, 0, 40)]), paths: ['clutter/tree#4', 'clutter/tree#4', 'clutter/tree#5'] },
      // A third part of record 4 drawn from another entry (the page splits entries by node, light and state).
      { modelName: 'tree', matrices: Float32Array.from(at(10, 12, 10)), paths: ['clutter/tree#4'] },
      // A graph prop of the same model at the same place as a part: not clutter, never swept in.
      { modelName: 'tree', matrices: Float32Array.from(at(80, 0, 80)), paths: ['worldmodel/tree=tree'] },
    ],
  } as unknown as Pick<LoadedMap, 'props'>;
}

describe('LATER 999 F1: hiding a part of a clutter instance hides the whole instance', () => {
  it('the key of one part finds every part of its record, in every entry, and nothing of another record', () => {
    expect([...placementsOf(map(), [placementKey('tree', 10, 6, 10)])].sort()).toEqual(['0:0', '0:1', '1:0']);
  });
  it('the drawing loses every part of the record and keeps the other record and the graph prop', () => {
    const m = map();
    const left = propsWithout(m, placementsOf(m, [placementKey('tree', 10, 0, 10)]));
    expect(left.flatMap((p) => p.paths ?? [])).toEqual(['clutter/tree#5', 'worldmodel/tree=tree']);
  });
  it('a graph placement hidden alone stays alone (no instance to sweep)', () => {
    expect([...placementsOf(map(), [placementKey('tree', 80, 0, 80)])]).toEqual(['2:0']);
  });
});
