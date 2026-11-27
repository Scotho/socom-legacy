import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { lodOpacity, scaledRangeSq, type LodBand } from '@s2u/scene';
import type { LoadedMap } from '../src/loadMap';
import type { LoadedBody } from '../src/body';
import { lodPlacements, placementOpacity } from '../src/xboxPrototype/lod';
import { prototypeDraws } from '../src/xboxPrototype/model';

const high: LodBand = { nearFade: [0, 0], farFade: [100, 120] };
const low: LodBand = { nearFade: [100, 120], farFade: [420, 440] };
const mesh = () => ({ positions: new Float32Array(9), normals: null, colors: new Float32Array(12).fill(1), faceNormals: null, uvs: new Float32Array(6),
  indices: new Uint32Array([0, 1, 2]), textureName: null, fog: false, cull: false, lit: false,
  order: 1, orderEnd: 1, alternate: false, scroll: null });
const prop = (band: LodBand | null, places: number[], alternate = false) => ({
  parts: [mesh(), mesh()], matrices: Float32Array.from(places.flatMap(x => [...new Matrix4().makeTranslation(x, 0, 0).elements])),
  order: 1, alternate, lod: band, modelName: 'fixture', facade: 0,
});

describe('experimental renderer consumes the existing LOD rules', () => {
  it('groups the same placements as world: includes alternate copies, excludes facades', () => {
    const near = prop(high, [0, 1000]), far = prop(low, [0]), alternate = prop(low, [1000], true);
    const lone = prop(high, [2000]), facade = { ...prop(low, [2000]), facade: 1 };
    const result = lodPlacements([near, far, alternate, lone, facade]);
    expect(result.get(near)!.map(item => item.last)).toEqual([false, false]);
    expect(result.get(far)!.map(item => item.last)).toEqual([true]);
    expect(result.get(alternate)!.map(item => item.last)).toEqual([true]);
    expect(result.get(lone)!.map(item => item.last)).toEqual([true]);
    expect(result.has(facade)).toBe(false);
  });
  it('uses squared distance, magnification and the last-copy rule on both sides of a crossover', () => {
    const near = prop(high, [0]), far = prop(low, [0]), entries = lodPlacements([near, far]);
    for (const distance of [0, 90, 110, 130, 500]) for (const magnification of [1, 9]) {
      const eye = new Vector3(0, 0, distance), range = scaledRangeSq(distance * distance, magnification);
      expect(placementOpacity(entries.get(near)![0], eye, magnification)).toBe(lodOpacity(high, range, false));
      expect(placementOpacity(entries.get(far)![0], eye, magnification)).toBe(lodOpacity(low, range, true));
    }
    expect(placementOpacity(undefined, new Vector3(10000, 0, 0), 1)).toBe(1);
  });
  it('splits only banded placements and borrows geometry and matrix backing storage', () => {
    const banded = prop(high, [0, 1000]), ordinary = prop(null, [0, 1000]);
    const body = { parts: [], subMeshes: [], fittings: [], at: null } as unknown as LoadedBody;
    const map = { world: [], props: [banded, ordinary], origin: [0, 0, 0], textureFlags: {} } as unknown as LoadedMap;
    const draws = prototypeDraws(map, body), lod = draws.filter(draw => draw.lod), rest = draws.filter(draw => !draw.lod);
    expect(lod).toHaveLength(4); expect(rest).toHaveLength(2);
    expect(lod.map(draw => draw.instances!.length)).toEqual([16, 16, 16, 16]);
    for (const draw of lod) expect(draw.instances!.buffer).toBe(banded.matrices.buffer);
    expect(lod[0]!.positions).toBe(lod[1]!.positions);
    expect(lod[0]!.lod).toBe(lod[2]!.lod);
    expect(rest.every(draw => draw.instances === ordinary.matrices)).toBe(true);
  });
});
