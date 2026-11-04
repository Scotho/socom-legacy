import { describe, expect, it } from 'vitest';
import { mergeMeshes, type MeshData } from '../src';

/**
 * PF-30 (ruling PF.R50, research 232 §4): the detail pass is switched per visual by its centroid's range
 * (`FUN_003374c0` D:L235405-235418), and the world's draws are merged across visuals, so each visual's centroid
 * rides its vertices through the merge as an attribute of its own.
 */
const tri = (x: number, centroid?: [number, number, number]): MeshData => ({
  positions: new Float32Array([x, 0, 0, x + 2, 0, 0, x, 4, 6]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1),
  normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]), textureName: 'ground.tif', fog: true,
  ...(centroid ? { centroids: new Float32Array([...centroid, ...centroid, ...centroid]) } : {}),
});

describe('mergeMeshes and the centroids', () => {
  it("mergeMeshes carries each part's centroid as a per-vertex attribute: every vertex of one part shares it, two parts differ, and a part without one gets its positions' centre", () => {
    const m = mergeMeshes([tri(0, [10, 20, 30]), tri(100, [-5, 0, 5]), tri(50)]);
    expect(m.centroids).toBeInstanceOf(Float32Array);
    expect(m.centroids!.length).toBe(m.positions.length);
    const at = (v: number): number[] => Array.from(m.centroids!.subarray(v * 3, v * 3 + 3));
    for (const v of [0, 1, 2]) expect(at(v)).toEqual([10, 20, 30]);
    for (const v of [3, 4, 5]) expect(at(v)).toEqual([-5, 0, 5]);
    // The third part had none: its positions' centre, the middle of its extent (50..52, 0..4, 0..6).
    for (const v of [6, 7, 8]) expect(at(v)).toEqual([51, 2, 3]);

    // No part with one, no attribute: the memory is spent on the detail-bearing draws only.
    expect(mergeMeshes([tri(0), tri(1)]).centroids).toBeUndefined();
  });
});
