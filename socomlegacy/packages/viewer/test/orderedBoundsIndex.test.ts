import { describe, expect, it } from 'vitest';
import { OrderedBoundsIndex } from '../src/orderedBoundsIndex';

describe('ordered collision broad phase', () => {
  it('returns the same objects in original order as an inclusive bounds scan', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const walls = Array.from({ length: 513 }, (_, id) => {
      const minX = random() * 1000 - 500, minZ = random() * 1000 - 500;
      return { id, minX, minZ, maxX: minX + random() * 100, maxZ: minZ + random() * 100 };
    });
    const index = new OrderedBoundsIndex(walls);
    for (let i = 0; i < 200; i++) {
      const minX = random() * 1400 - 700, minZ = random() * 1400 - 700;
      const maxX = minX + random() * 200, maxZ = minZ + random() * 200;
      expect(index.query(minX, minZ, maxX, maxZ)).toEqual(walls.filter(w =>
        maxX >= w.minX && minX <= w.maxX && maxZ >= w.minZ && minZ <= w.maxZ));
      const after = i * 2;
      expect(index.queryAfter(minX, minZ, maxX, maxZ, after).map(e => e.value)).toEqual(walls.filter((w, order) =>
        order > after && maxX >= w.minX && minX <= w.maxX && maxZ >= w.minZ && minZ <= w.maxZ));
    }
  });

  it('includes zero-width faces and touching endpoints, and handles an empty cell', () => {
    const face = { minX: 5, maxX: 5, minZ: -10, maxZ: 10 };
    const index = new OrderedBoundsIndex([face]);
    expect(index.query(0, 10, 5, 20)).toEqual([face]);
    expect(index.query(0, 10.00001, 5, 20)).toEqual([]);
    expect(new OrderedBoundsIndex([]).query(0, 0, 1, 1)).toEqual([]);
  });
});
