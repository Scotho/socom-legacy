import { afterEach, describe, expect, it } from 'vitest';
import { LessEqualDepth, Mesh, type Material } from 'three';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import { buildWorld, COPLANAR_PASS_OFFSET_ADAPTATION, setCoplanarPassOffset } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';
import { TESTROOM_COPLANAR_OFFSET_PARAM, testroomCoplanarOffset } from '../src/testroomAntialias';

/**
 * MAC-FLOOR (INTAKE I-3; B-64; a test-room instrument, a browser adaptation): the fallback the tester can try beside the
 * invariant position in the same sitting -- the detail and environment passes drawn with the polygon offset the drop
 * shadows already carry (`./world` `COPLANAR_PASS_OFFSET_ADAPTATION`, -1 / -1). OFF unless the test room's address asks
 * (`?coplanaroffset=on`): a match never sets it, so nothing a player sees changes. Unit test on a synthetic world.
 */
const tri = (x: number, z: number): Float32Array => new Float32Array([x, 0, z, x + 1, 0, z, x, 0, z + 1]);
const NORMALS = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
  positions: tri(0, 0), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
  indices: new Uint32Array([0, 1, 2]), textureName, fog: true, lit: false, order, orderEnd: order, cull: true,
  alternate: false, scroll: null, ...extra,
});
const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const graded: TextureFlags = { bilinear: true, transparent: true, graded: true, opaque: false, gs: null };

/** A floor with a detail texture, and a pool with a reflection. */
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: DEFAULT_GRID_PARAMS, slots: [],
  world: [
    part('floor.tif', 0, { positions: tri(0, -10), centre: [0.5, 0, -9.5] }),
    part('water.tif', 256, { alphaPass: true, reflect: 1, normals: NORMALS, positions: tri(0, -20), centre: [0.5, 0, -19.5] }),
  ],
  props: [],
  textures: { 'floor.tif': rgba(255), 'floor_det.tif': rgba(255), 'water.tif': rgba(100), 'sky01.tif': rgba(255) },
  textureFlags: { 'floor.tif': solid, 'floor_det.tif': solid, 'water.tif': graded, 'sky01.tif': solid },
  envMaterials: [{ index: 0, rgba: [128, 128, 128, 0], uvScale: 0.5, rimOffset: 0, rimSlope: 1, texture: 'sky01.tif' }],
  detail: { 'floor.tif': { name: 'floor_det.tif', uv: 4, range: 1e9, bmode: 'COLORBLEND' } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

type Depth = { polygonOffset: boolean; polygonOffsetFactor: number; polygonOffsetUnits: number; depthFunc: number };
function passes(): { detail: Depth; env: Depth } {
  const view = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const child = (base: string, suffix: string): Depth => {
    const m = meshes.find((x) => x.name === base)!.children.find((c): c is Mesh => c instanceof Mesh && c.name.endsWith(suffix))!;
    const mat = m.material as Material;
    return { polygonOffset: mat.polygonOffset, polygonOffsetFactor: mat.polygonOffsetFactor, polygonOffsetUnits: mat.polygonOffsetUnits, depthFunc: mat.depthFunc };
  };
  return { detail: child('floor.tif', ' (detail)'), env: child('water.tif', ' (env)') };
}

afterEach(() => { setCoplanarPassOffset(false); });

describe('MAC-FLOOR: the test room\'s coplanar-pass offset', () => {
  it('the offset is the drop shadows\' (-1, -1)', () => {
    expect(COPLANAR_PASS_OFFSET_ADAPTATION).toEqual({ factor: -1, units: -1 });
  });

  it('off (every match): the detail and environment passes carry no offset, depth less-or-equal as before', () => {
    const { detail, env } = passes();
    for (const d of [detail, env]) expect(d).toEqual({ polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: 0, depthFunc: LessEqualDepth });
  });

  it('on (the test room\'s address): both passes carry it, still less-or-equal', () => {
    setCoplanarPassOffset(true);
    const { detail, env } = passes();
    for (const d of [detail, env]) expect(d).toEqual({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, depthFunc: LessEqualDepth });
  });

  it.each([['?coplanaroffset=on', true], ['?coplanaroffset=1', true], ['?coplanaroffset=off', false], ['', false], ['?coplanaroffset', false]] as const)(
    'the address %s -> %s', (search, want) => {
      expect(TESTROOM_COPLANAR_OFFSET_PARAM).toBe('coplanaroffset');
      expect(testroomCoplanarOffset(search)).toBe(want);
    });
});
