import { describe, expect, it } from 'vitest';
import { surfaceMatcher, type HullPoly, type Surface } from '../../src/forge/geometry/collision';

/**
 * Bug 16 (a browser adaptation, FG.R2: the original's tools built its hulls by a process not known here): a reshaped
 * node's rebuilt hull takes each triangle's surface words from the disc polygon of that node it lies on -- its floors
 * the floors' (ditype 3, which the ground probe stands on), its walls the walls' (ditype 2) -- never one word for all.
 * MP72's b2_wc03 showed it: its commonest word is a wall's (2,22), and a Build that put it on every triangle left the
 * building with no floor (276 of 441 probes lost the ground, 2026-11-15).
 */
const FLOOR: Surface = [3, 19, 0, 0, 0];
const WALL: Surface = [2, 22, 0, 0, 0];
const poly = (points: [number, number, number][], surface: Surface): HullPoly => ({ points, surface, owner: 0 });
const disc = [
  poly([[0, 0, 0], [0, 0, 10], [10, 0, 10], [10, 0, 0]], FLOOR),                 // the floor at y 0
  poly([[0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]], WALL),                    // a wall on z 0
  poly([[0, 0, 10], [0, 5, 10], [10, 5, 10], [10, 0, 10]], WALL),                // and one on z 10 (most words: a wall's)
];

describe("a rebuilt node hull's surfaces", () => {
  const match = surfaceMatcher(disc);

  it('takes the words of the disc polygon a triangle lies on', () => {
    expect(match([[1, 0, 1], [1, 0, 4], [4, 0, 4]])).toEqual(FLOOR);
    expect(match([[4, 0, 4], [1, 0, 1], [1, 0, 4]])).toEqual(FLOOR);           // either winding
    expect(match([[1, 1, 0], [4, 1, 0], [4, 4, 0]])).toEqual(WALL);
  });

  it('gives an unmatched floor the ground words, never a wall-only word', () => {
    const raised = match([[1, 3, 1], [1, 3, 4], [4, 3, 4]]);                    // a floor lifted off the disc's
    expect(raised).toEqual(FLOOR);
    expect(raised[0] & 1).toBe(1);
  });

  it('gives an unmatched wall the walls words', () => {
    expect(match([[5, 0, 5], [5, 5, 5], [5, 5, 8]])).toEqual(WALL);             // a wall across the room
  });
});

describe("a moved piece's centroids (bug 16)", () => {
  it('carries each moved corner centroid with its point, and leaves the rest', async () => {
    const { box } = await import('../../src/forge/geometry/primitives');
    const { transformVerts, translation } = await import('../../src/forge/geometry/ops');
    const m = box([0, 0, 0], [1, 1, 1], { textureName: null, size: () => null, scaleTexel: 1 });
    for (let c = 0; c < m.cVert.length; c++) m.cCentroid.splice(c * 3, 3, 0.5, 0.5, 0.5);
    const moving = new Set([m.cVert[0]!]);
    transformVerts(m, moving, translation([10, 0, 0]));
    for (let c = 0; c < m.cVert.length; c++) {
      expect(m.cCentroid[c * 3]).toBeCloseTo(moving.has(m.cVert[c]!) ? 10.5 : 0.5);
    }
  });
});

describe("an edited draw's grid cells (bug 16)", () => {
  const grid = { atomCount: 0, posts: 0, cellDim: 10, cellsX: 4, cellsZ: 4, originX: 0, originZ: 0 };
  it('keeps the read cells while the triangles stay where they were read, and adds the cells they moved into', async () => {
    const { coveredCells, refiledCells } = await import('../../src/forge/geometry/worldMesh');
    const tri = (x: number, z: number): number[] => [x, 0, z, x + 1, 0, z, x, 0, z + 1];
    const read = [0];
    const covered = coveredCells(tri(1, 1), [0, 1, 2], grid);
    expect(covered).toEqual([0]);
    expect(refiledCells(read, tri(2, 2), [0, 1, 2], grid, covered)).toBeNull();      // moved inside its cell
    expect(refiledCells(read, tri(25, 31), [0, 1, 2], grid, covered)).toEqual([0, 14]); // moved to cell x 2, z 3
  });
});
