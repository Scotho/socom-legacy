import { describe, expect, it } from 'vitest';
import {
  BufferAttribute, BufferGeometry, Group, InterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicMaterial, Quaternion,
  Vector3, type Object3D,
} from 'three';
import { DEFAULT_GRID_PARAMS, type GlobalLighting } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import { applyLighting, type Lighting } from '../src/lighting';
import { FacadeRelight, relightFacade } from '../src/facade';
import { MarkClipper, markClipGeometry, markFrame } from '../src/markClip';
import { interleaveWorldVertices, isWorldVertexBuffer, WORLD_VERTEX_STRIDE } from '../src/worldVertices';

/**
 * CPS H12 (product track, a CPU-side browser adaptation; the plan's Log 2026-11-03T02:52Z, "Theory 4"): a world draw's
 * position, uv and lit colour sit in ONE interleaved Float32Array (stride 3 + 2 + 4 = 9), so a draw binds one vertex
 * buffer instead of three. The same f32 values reach the same shader inputs (`position`, `uv`, `color`): every
 * component here is compared exactly (`Object.is`) against the arrays the separate-attribute builder made -- the
 * part's own positions and uvs, and `applyLighting`'s colours -- and every writer (the rig change's re-light, the
 * facade re-light) and reader (the mark clipper) is held to the old layout's result.
 */

type V3 = [number, number, number];

const RIG: GlobalLighting = {
  directions: [[-0.6, -0.8, 0], [0, 0, 1], [0, 0, 0]], colours: [[0.5, 0.4, 0.3], [0.2, 0.3, 0.4], [0, 0, 0]], ambient: [0.1, 0.1, 0.1],
};
const RIG2: GlobalLighting = { ...RIG, colours: [[0.9, 0.1, 0.1], [0.1, 0.9, 0.1], [0, 0, 0]] };

/** A quad floor (two triangles), lit, its normals and colours varied so every component is distinct. */
const floor = (texture = 'ground.tif', y = 0): LoadedMesh => ({
  positions: Float32Array.from([-10, y, 10, 10, y, 10, 10, y, -10, -10, y, -10].map((v, i) => v + i * 0.013)),
  uvs: Float32Array.from([0.1, 0.2, 0.9, 0.25, 0.85, 0.95, 0.05, 0.8]),
  colors: Float32Array.from([0.31, 0.42, 0.53, 0.9, 0.61, 0.27, 0.44, 1, 0.73, 0.58, 0.19, 0.5, 0.22, 0.66, 0.39, 0.75]),
  // Unit axes: a prop's normals go through `rotateNormals`' renormalisation, which keeps these exactly.
  normals: Float32Array.from([0, 1, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0]),
  faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  textureName: texture, fog: true, lit: true, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const texture = { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 };
const flags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const mapOf = (world: LoadedMesh[], props: LoadedMap['props']): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, world, props,
  textures: { 'ground.tif': texture, 'crate.tif': texture, 'flare.tif': texture },
  textureFlags: { 'ground.tif': flags, 'crate.tif': flags, 'flare.tif': { ...flags, transparent: true, opaque: false } },
  metersPerUnit: 0.1, lightRig: RIG, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

/** The world chunk, a prop placed once, a prop placed twice (one instanced draw) and a facade's flare. */
function setUp() {
  const parts = { world: floor(), single: floor('crate.tif', 3), instanced: floor('crate.tif', 6), flare: floor('flare.tif', 9) };
  const view = buildWorld(mapOf([parts.world], [
    { modelName: 'crate', parts: [parts.single], matrices: new Float32Array(at(10, 0, 0)), order: 0, alternate: false, facade: 0, lod: null },
    { modelName: 'barrel', parts: [parts.instanced], matrices: new Float32Array([...at(20, 0, 0), ...at(30, 0, 0)]), order: 1, alternate: false, facade: 0, lod: null },
    { modelName: 'lamp', parts: [parts.flare], matrices: new Float32Array(at(40, 0, 0)), order: 2, alternate: false, facade: 1, lod: null },
  ]));
  const meshes = [...view.worldObjects, ...view.propObjects].filter((o): o is Mesh => o instanceof Mesh);
  const byName = (name: string): Mesh => meshes.find((m) => m.name === name)!;
  return {
    view, parts,
    drawn: [
      { mesh: byName('ground.tif'), part: parts.world },
      { mesh: byName('crate'), part: parts.single },
      { mesh: byName('barrel'), part: parts.instanced },
      { mesh: byName('lamp (flare)'), part: parts.flare },
    ],
  };
}

/** What the separate-attribute builder put in the colour attribute: `applyLighting` into a packed rgba array. */
const reference = (part: LoadedMesh, light: Lighting): Float32Array => {
  const out = new Float32Array(part.colors.length);
  applyLighting(part, light, out);
  return out;
};

/** Every component of `attribute`, through its own accessors (the stride and offset three uses). */
const components = (attribute: BufferAttribute | InterleavedBufferAttribute): number[] => {
  const out: number[] = [];
  for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) out.push(attribute.getComponent(i, k));
  return out;
};
const exact = (got: number[], want: ArrayLike<number>): void => {
  expect(got.length).toBe(want.length);
  got.forEach((v, i) => { if (!Object.is(v, want[i])) expect.fail(`component ${i}: ${v} !== ${want[i]}`); });
};

describe('CPS H12: a world draw\'s position, uv and colour are one interleaved buffer, the same floats', () => {
  it('each geometry the builder makes holds one buffer of stride 9: position at 0, uv at 3, colour at 5', () => {
    const { drawn } = setUp();
    expect(drawn.every((d) => d.mesh !== undefined)).toBe(true);
    for (const { mesh } of drawn) {
      const g = mesh.geometry;
      const p = g.getAttribute('position') as InterleavedBufferAttribute;
      const uv = g.getAttribute('uv') as InterleavedBufferAttribute;
      const c = g.getAttribute('color') as InterleavedBufferAttribute;
      expect([p.isInterleavedBufferAttribute, uv.isInterleavedBufferAttribute, c.isInterleavedBufferAttribute]).toEqual([true, true, true]);
      expect(uv.data).toBe(p.data);
      expect(c.data).toBe(p.data);
      expect(p.data.stride).toBe(WORLD_VERTEX_STRIDE);
      expect(WORLD_VERTEX_STRIDE).toBe(9);
      expect([p.offset, uv.offset, c.offset]).toEqual([0, 3, 5]);
      expect([p.itemSize, uv.itemSize, c.itemSize]).toEqual([3, 2, 4]);
      expect([p.normalized, uv.normalized, c.normalized]).toEqual([false, false, false]);
      expect(p.data.array).toBeInstanceOf(Float32Array);
      expect(isWorldVertexBuffer(p.data)).toBe(true);
    }
  });

  it('vertex for vertex, the components are the separate builder\'s exactly: the part\'s positions and uvs, its lit colours', () => {
    const { drawn } = setUp();
    const light: Lighting = { rig: RIG, brighten: 0, rigEverywhere: false };
    for (const { mesh, part } of drawn) {
      const g = mesh.geometry;
      exact(components(g.getAttribute('position') as InterleavedBufferAttribute), part.positions);
      exact(components(g.getAttribute('uv') as InterleavedBufferAttribute), part.uvs);
      exact(components(g.getAttribute('color') as InterleavedBufferAttribute), reference(part, light));
    }
  });

  it('a rig change re-lights through the stride: the colours are the reference\'s under the new rig, positions and uvs untouched', () => {
    const { view, drawn } = setUp();
    const versions = drawn.map(({ mesh }) => (mesh.geometry.getAttribute('color') as InterleavedBufferAttribute).data.version);
    view.setLighting({ rig: RIG2, brighten: 0, rigEverywhere: false });
    const light: Lighting = { rig: RIG2, brighten: 0, rigEverywhere: false };
    drawn.forEach(({ mesh, part }, i) => {
      const g = mesh.geometry;
      const c = g.getAttribute('color') as InterleavedBufferAttribute;
      exact(components(c), reference(part, light));
      exact(components(g.getAttribute('position') as InterleavedBufferAttribute), part.positions);
      exact(components(g.getAttribute('uv') as InterleavedBufferAttribute), part.uvs);
      expect(c.data.version).toBeGreaterThan(versions[i]!);     // marked for upload
    });
    // rigEverywhere on an unlit part: its colours go from the material's to the rig's, through the stride too.
    const plain = { ...floor(), lit: false };
    const v2 = buildWorld(mapOf([plain], []));
    const c2 = (v2.worldObjects[0] as Mesh).geometry.getAttribute('color') as InterleavedBufferAttribute;
    exact(components(c2), plain.colors);
    v2.setLighting({ rig: RIG, brighten: 0, rigEverywhere: true });
    exact(components(c2), reference(plain, { rig: RIG, brighten: 0, rigEverywhere: true }));
    v2.setLighting({ rig: RIG, brighten: 0, rigEverywhere: false });
    exact(components(c2), plain.colors);
  });
});

describe('CPS H12: the colour writers through the stride', () => {
  const light: Lighting = { rig: RIG, brighten: 0, rigEverywhere: false };

  it('applyLighting into a strided buffer writes the packed result\'s floats at the colour slots and nothing else', () => {
    for (const part of [floor(), { ...floor(), lit: false }, { ...floor(), normals: null }]) {
      const packed = reference(part, light);
      const strided = new Float32Array(4 * 9).fill(-7);
      applyLighting(part, light, strided, 9, 5);
      for (let v = 0; v < 4; v++) {
        for (let k = 0; k < 5; k++) expect(strided[v * 9 + k]).toBe(-7);
        for (let k = 0; k < 4; k++) expect(Object.is(strided[v * 9 + 5 + k], packed[v * 4 + k])).toBe(true);
      }
    }
  });

  it('FacadeRelight on an interleaved colour writes relightFacade\'s floats through the stride, positions and uvs untouched', () => {
    const part = floor('flare.tif');
    const vertices = interleaveWorldVertices(part.positions, part.uvs, part.colors.length / 4)!;
    expect(vertices).not.toBeNull();
    const relight = new FacadeRelight({ ...part, normals: part.normals! }, vertices.color);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
    const version = vertices.color.data.version;
    expect(relight.update(turn, light, 1)).toBe(true);
    const want = new Float32Array(16);
    relightFacade(part, turn, light, new Float32Array(12), want);
    exact(components(vertices.color), want);
    exact(components(vertices.position), part.positions);
    exact(components(vertices.uv), part.uvs);
    expect(vertices.color.data.version).toBeGreaterThan(version);
  });
});

describe('CPS H12: the mark clipper reads a world draw\'s interleaved positions and colours as it read the separate ones', () => {
  /** The separate-attribute geometry the builder used to make for `part` under `light`. */
  const separate = (part: LoadedMesh, light: Lighting): Mesh => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(part.positions, 3));
    g.setAttribute('uv', new BufferAttribute(part.uvs, 2));
    g.setAttribute('color', new BufferAttribute(reference(part, light), 4));
    g.setIndex(new BufferAttribute(part.indices, 1));
    return new Mesh(g, new MeshBasicMaterial());
  };
  const clip = (mesh: Object3D): { count: number; out: number[] } => {
    const root = new Group();
    root.add(mesh);
    root.updateMatrixWorld(true);
    const target = markClipGeometry();
    const count = new MarkClipper(root).clip(markFrame([0.5, 0, -0.5], [0, 1, 0], [0, -1, 0], 2), target, 0.01);
    const out = [...components(target.getAttribute('position') as BufferAttribute), ...components(target.getAttribute('color') as BufferAttribute),
      ...components(target.getAttribute('uv') as BufferAttribute), ...Array.from(target.getIndex()!.array), target.drawRange.count];
    return { count, out };
  };

  it('the same clipped triangles, positions, colours and uvs off the built draw as off the separate one', () => {
    const { drawn } = setUp();
    const world = drawn[0]!;
    world.mesh.removeFromParent();
    const got = clip(world.mesh);
    const want = clip(separate(world.part, { rig: RIG, brighten: 0, rigEverywhere: false }));
    expect(want.count).toBeGreaterThan(0);
    expect(got.count).toBe(want.count);
    exact(got.out, want.out);
  });

  it('an interleaved geometry the world did not build is still passed over, as before', () => {
    const part = floor();
    const data = new InterleavedBuffer(new Float32Array(4 * 9), 9);
    const g = new BufferGeometry();
    g.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
    g.setAttribute('uv', new InterleavedBufferAttribute(data, 2, 3));
    g.setAttribute('color', new InterleavedBufferAttribute(data, 4, 5));
    for (let i = 0; i < 4; i++) {
      g.getAttribute('position').setXYZ(i, part.positions[i * 3]!, part.positions[i * 3 + 1]!, part.positions[i * 3 + 2]!);
      g.getAttribute('color').setXYZW(i, 1, 1, 1, 1);
    }
    g.setIndex(new BufferAttribute(part.indices, 1));
    expect(isWorldVertexBuffer(data)).toBe(false);
    expect(clip(new Mesh(g, new MeshBasicMaterial())).count).toBe(0);
  });
});
