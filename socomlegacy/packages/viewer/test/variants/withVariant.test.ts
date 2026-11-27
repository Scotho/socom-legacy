import { describe, expect, it } from 'vitest';
import type { LoadedMap, LoadedMesh } from '../../src/loadMap';
import type { TextureFlags } from '../../src/materialSpec';
import type { VariantProfile } from '../../src/variants/profile';
import { GRADE_SIZE, gradeIndex } from '../../src/variants/profile';
import { withVariant } from '../../src/variants/withVariant';
import { propsKey, worldKey } from '../../src/variants/key';

/**
 * DAY-2 (product track: the pure core, a browser adaptation; DAY.R3, DAY.R4). The map here is hand-built with only
 * the fields `withVariant` and `worldKey` read (world parts' positions, colours, texture, fog, cull; textures,
 * their flags and mips; camera, night, light rig), cast to `LoadedMap` through `unknown` -- the full type is large.
 */
const opaque: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const glow = {
  bilinear: true, transparent: true, graded: true, opaque: false,
  gs: { blend: 'additive', alphaTest: null, wrapS: 'clamp', wrapT: 'clamp', bilinear: true, mipmaps: false },
} as unknown as TextureFlags;
const light = {
  bilinear: true, transparent: true, graded: true, opaque: false,
  gs: { blend: 'destination', alphaTest: null, wrapS: 'clamp', wrapT: 'clamp', bilinear: true, mipmaps: false },
} as unknown as TextureFlags;

const part = (textureName: string, positions: number[], colors: number[]): LoadedMesh =>
  ({ textureName, positions: Float32Array.from(positions), colors: Float32Array.from(colors), fog: true, cull: false } as unknown as LoadedMesh);

const tex = (v: number) => ({ width: 1, height: 1, data: Uint8ClampedArray.from([v, v, v, 255]) });

function makeMap(): LoadedMap {
  return {
    archive: 'MP5', path: 'maps/MP5', name: 'test',
    world: [
      part('ground.tif', [0, 0, 0, 1, 0, 0], [0.25, 0.5, 0.75, 0.5, 0.1, 0.2, 0.3, 1]),
      part('sky.tif', [0, 9, 0], [0.4, 0.4, 0.4, 1]),
      part('glow.tif', [2, 0, 0], [0.6, 0.6, 0.6, 0.5]),
      part('lightmap.tif', [3, 0, 0], [0.7, 0.7, 0.7, 0.5]),
      part('crate.tif', [4, 0, 0, 5, 0, 0], [0.2, 0.2, 0.2, 1, 0.3, 0.3, 0.3, 1]),
    ],
    props: [],
    textures: { 'ground.tif': tex(10), 'sky.tif': tex(20), 'crate.tif': tex(30) },
    textureMips: { 'crate.tif': [tex(31)], 'ground.tif': [tex(11)] },
    textureFlags: { 'ground.tif': opaque, 'sky.tif': opaque, 'glow.tif': glow, 'lightmap.tif': light, 'crate.tif': opaque },
    camera: { fogColor: [1, 2, 3], fogNear: 200, fogFar: 4000, fogTop: 10, fogBottom: 0, fogEnabled: false, fogAltitude: false,
      fogDirectional: false, nearPlane: 1, farPlane: 5000, mid: 5000, hfov: 1, vfov: 0.75 },
    night: { mission: true, lens: [0, 1, 0, 1] },
    lightRig: { directions: [[0, 1, 0]], colours: [[0.2, 0.2, 0.3]], ambient: [0.1, 0.1, 0.1] },
  } as unknown as LoadedMap;
}

const RIG = { directions: [[0, -1, 0]] as [number, number, number][], colours: [[0.96, 0.93, 0.86]] as [number, number, number][], ambient: [0.5, 0.5, 0.5] as [number, number, number] };

function profile(over: Partial<VariantProfile> = {}): VariantProfile {
  return {
    stem: 'MP5', variant: 'day', colours: null, keepTextures: ['sky.tif'],
    night: { mission: false, lens: null }, lightRig: RIG,
    camera: { fogColor: [150, 155, 165], fogNear: 100, fogFar: 800, fogEnabled: true },
    hideTextures: [], textureSwaps: {}, ...over,
  };
}

const snapshot = (m: LoadedMap) => m.world.map((p) => [Array.from(p.positions), Array.from(p.colors), p.textureName]);
const rgb = (p: LoadedMesh) => Array.from({ length: p.colors.length / 4 }, (_, v) => [p.colors[v * 4]!, p.colors[v * 4 + 1]!, p.colors[v * 4 + 2]!]);

/** A grade LUT from a function of the lattice point's PS2-unit colour (domain 0..2, step 1/16) to a byte triple. */
function lut(f: (r: number, g: number, b: number) => [number, number, number]): Uint8Array {
  const out = new Uint8Array(GRADE_SIZE ** 3 * 3);
  for (let b = 0; b < GRADE_SIZE; b++) for (let g = 0; g < GRADE_SIZE; g++) for (let r = 0; r < GRADE_SIZE; r++) {
    const o = gradeIndex(r, g, b) * 3, c = f(r / 16, g / 16, b / 16);
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

describe('withVariant (DAY-2)', () => {
  it('a null or undefined profile gives the same object back', () => {
    const m = makeMap();
    expect(withVariant(m, null).map).toBe(m);
    expect(withVariant(m, undefined).map).toBe(m);
    expect(withVariant(m, null).diagnostic).toBeUndefined();
  });

  it('a profile for another stem throws', () => {
    expect(() => withVariant(makeMap(), profile({ stem: 'MP64' }))).toThrow(/MP64/);
  });

  it('a pair off the variant table (DAY.R2) gives the same object back with a diagnostic naming it, nothing applied', () => {
    const m = makeMap();
    const before = snapshot(m), night = JSON.stringify(m.night);
    const r = withVariant(m, profile({ variant: 'night', hideTextures: ['crate.tif'], textureSwaps: { 'ground.tif': tex(99) } }));
    expect(r.map).toBe(m);
    expect(r.diagnostic).toMatch(/MP5 night/);
    expect(r.diagnostic).toMatch(/not in the variant table/);
    expect(snapshot(m)).toEqual(before);
    expect(JSON.stringify(m.night)).toBe(night);

    const mp2 = { ...makeMap(), archive: 'MP2' } as LoadedMap;
    const r2 = withVariant(mp2, profile({ stem: 'MP2', variant: 'day', colours: { kind: 'pack', rgb8: new Uint8Array(3) } }));
    expect(r2.map).toBe(mp2);
    expect(r2.diagnostic).toMatch(/MP2 day/);
    expect(r2.diagnostic).toMatch(/not in the variant table/);
  });

  it('never mutates the input', () => {
    const m = makeMap();
    const before = snapshot(m), cam = JSON.stringify(m.camera), night = JSON.stringify(m.night), rig = JSON.stringify(m.lightRig);
    const textures = { ...m.textures }, mips = { ...m.textureMips }, world = [...m.world];
    const rgb8 = new Uint8Array(7 * 3).fill(200);
    withVariant(m, profile({ colours: { kind: 'pack', rgb8 }, hideTextures: ['crate.tif'], textureSwaps: { 'ground.tif': tex(99) },
      addParts: { world: [part('dome.tif', [0, 50, 0], [1, 1, 1, 1])], textures: { 'dome.tif': tex(5) }, textureFlags: { 'dome.tif': opaque } } }));
    expect(snapshot(m)).toEqual(before);
    expect(m.world).toEqual(world);
    expect(m.world.length).toBe(5);
    expect(JSON.stringify(m.camera)).toBe(cam);
    expect(JSON.stringify(m.night)).toBe(night);
    expect(JSON.stringify(m.lightRig)).toBe(rig);
    expect(m.textures).toEqual(textures);
    expect(m.textureMips).toEqual(mips);
  });

  it('applies a pack by world vertex index, byte b -> b/128, alpha untouched; kept and blended-light parts untouched', () => {
    const m = makeMap();
    // 7 world vertices: ground 0-1, sky 2, glow 3, lightmap 4, crate 5-6.
    const rgb8 = Uint8Array.from([10, 20, 30, 40, 50, 60, 1, 1, 1, 2, 2, 2, 3, 3, 3, 128, 64, 255, 0, 7, 9]);
    const out = withVariant(m, profile({ colours: { kind: 'pack', rgb8 } }));
    expect(out.diagnostic).toBeUndefined();
    const [ground, sky, glowP, lightP, crate] = out.map.world;
    expect(rgb(ground!)).toEqual([[10 / 128, 20 / 128, 30 / 128], [40 / 128, 50 / 128, 60 / 128]]);
    expect(rgb(crate!)).toEqual([[128 / 128, 64 / 128, 255 / 128], [0, 7 / 128, 9 / 128]]);
    expect(ground!.colors[3]).toBe(0.5);
    expect(ground!.colors[7]).toBe(1);
    // Kept (sky) and additive / destination parts: the very same part objects.
    expect(sky).toBe(m.world[1]);
    expect(glowP).toBe(m.world[2]);
    expect(lightP).toBe(m.world[3]);
    expect(ground!.colors).not.toBe(m.world[0]!.colors);
  });

  it('a pack of the wrong length gives the map unchanged and a diagnostic', () => {
    const m = makeMap();
    const out = withVariant(m, profile({ colours: { kind: 'pack', rgb8: new Uint8Array(6) } }));
    expect(out.map).toBe(m);
    expect(out.diagnostic).toMatch(/pack/);
  });

  it('an identity grade leaves the colours within 1/256; a constant grade makes them constant', () => {
    const m = makeMap();
    const id = lut((r, g, b) => [Math.min(255, Math.round(r * 128)), Math.min(255, Math.round(g * 128)), Math.min(255, Math.round(b * 128))]);
    const same = withVariant(m, profile({ colours: { kind: 'grade', lut33: id } })).map;
    for (const k of [0, 4]) {
      const a = m.world[k]!.colors, b = same.world[k]!.colors;
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(1 / 256);
    }
    const flat = withVariant(m, profile({ colours: { kind: 'grade', lut33: lut(() => [64, 32, 16]) } })).map;
    expect(rgb(flat.world[0]!)).toEqual([[0.5, 0.25, 0.125], [0.5, 0.25, 0.125]]);
    expect(rgb(flat.world[4]!)).toEqual([[0.5, 0.25, 0.125], [0.5, 0.25, 0.125]]);
    expect(flat.world[0]!.colors[3]).toBe(0.5);
    expect(flat.world[1]).toBe(m.world[1]);
    expect(flat.world[2]).toBe(m.world[2]);
  });

  it('a grade interpolates trilinearly between lattice points', () => {
    const m = makeMap();
    // Output red = 8 * lattice index of red: a colour halfway between two lattice points lands halfway.
    const ramp = lut((r) => [Math.round(r * 16) * 8, 0, 0]);
    const out = withVariant(m, profile({ colours: { kind: 'grade', lut33: ramp } })).map;
    // ground vertex 0 red 0.25 = lattice 4 exactly -> 32/128; crate vertex 0 red 0.2 = lattice 3.2 -> 25.6/128.
    expect(out.world[0]!.colors[0]).toBeCloseTo(32 / 128, 6);
    expect(out.world[4]!.colors[0]).toBeCloseTo(25.6 / 128, 5);
  });

  it('a key mismatch gives the input map unchanged and a diagnostic; a matching key applies', () => {
    const m = makeMap();
    const rgb8 = new Uint8Array(21).fill(64);
    const bad = withVariant(m, profile({ key: { vertices: 7, fnv64: '0000000000000000' }, colours: { kind: 'pack', rgb8 }, hideTextures: ['crate.tif'] }));
    expect(bad.map).toBe(m);
    expect(bad.diagnostic).toMatch(/key/);
    const wrongCount = withVariant(m, profile({ key: { ...worldKey(m), vertices: 8 } }));
    expect(wrongCount.map).toBe(m);
    expect(wrongCount.diagnostic).toBeDefined();
    const good = withVariant(m, profile({ key: worldKey(m), colours: { kind: 'pack', rgb8 } }));
    expect(good.diagnostic).toBeUndefined();
    expect(good.map.world[0]!.colors[0]).toBe(0.5);
  });

  it('sets night, the light rig and the camera fog fields only', () => {
    const m = makeMap();
    const out = withVariant(m, profile()).map;
    expect(out.night).toEqual({ mission: false, lens: null });
    expect(out.lightRig).toEqual(RIG);
    expect(out.camera).toEqual({ ...m.camera!, fogColor: [150, 155, 165], fogNear: 100, fogFar: 800, fogEnabled: true });
    // A non-fog camera field in the profile is not taken.
    const odd = withVariant(m, profile({ camera: { farPlane: 1, fogNear: 50 } })).map;
    expect(odd.camera!.farPlane).toBe(5000);
    expect(odd.camera!.fogNear).toBe(50);
  });

  it('hides world parts by texture name, after the pack is applied by the decoded index', () => {
    const m = makeMap();
    const rgb8 = Uint8Array.from([...new Array(15).fill(0), 128, 64, 255, 0, 7, 9]);
    const out = withVariant(m, profile({ colours: { kind: 'pack', rgb8 }, hideTextures: ['ground.tif'] })).map;
    expect(out.world.map((p) => p.textureName)).toEqual(['sky.tif', 'glow.tif', 'lightmap.tif', 'crate.tif']);
    expect(rgb(out.world[3]!)[0]).toEqual([1, 0.5, 255 / 128]);
  });

  it('appends added parts as a sky dome is appended, ungraded', () => {
    const m = makeMap();
    const dome = part('dome.tif', [0, 50, 0], [1, 1, 1, 1]);
    const out = withVariant(m, profile({ colours: { kind: 'grade', lut33: lut(() => [0, 0, 0]) },
      addParts: { world: [dome], textures: { 'dome.tif': tex(5) }, textureFlags: { 'dome.tif': opaque }, textureMips: { 'dome.tif': [tex(6)] } } })).map;
    expect(out.world.length).toBe(6);
    expect(out.world[5]).toBe(dome);
    expect(out.textures['dome.tif']).toEqual(tex(5));
    expect(out.textureFlags['dome.tif']).toBe(opaque);
    expect(out.textureMips!['dome.tif']).toEqual([tex(6)]);
    expect(out.textures['ground.tif']).toBe(m.textures['ground.tif']);
  });

  it('swaps textures by name and drops the mips of that name', () => {
    const m = makeMap();
    const out = withVariant(m, profile({ textureSwaps: { 'crate.tif': tex(77) } })).map;
    expect(out.textures['crate.tif']).toEqual(tex(77));
    expect(out.textureMips!['crate.tif']).toBeUndefined();
    expect(out.textureMips!['ground.tif']).toBe(m.textureMips!['ground.tif']);
    expect(out.textures['ground.tif']).toBe(m.textures['ground.tif']);
  });

  it('leaves the props as decoded when the profile has no prop colours and hides no prop', () => {
    const m = makeMap();
    expect(withVariant(m, profile()).map.props).toBe(m.props);
    const p = withProps(makeMap());
    expect(withVariant(p, profile({ hideProps: [] })).map.props).toBe(p.props);
  });
});

/**
 * IQ-143 (the owner's stills of Abandoned (Day), 2026-11-23): unlit props kept SOCOM II's night bake (the bridges, the
 * jungle trees) and the moon prop stayed drawn. A props pack (one RGB8 triple a prop vertex, `map.props` order, each
 * entry's parts in order, each part's vertices in order; keyed by `propsKey`) and `hideProps` (model names).
 */
const prop = (modelName: string, parts: LoadedMesh[], placements = 1) => ({
  modelName, parts, matrices: new Float32Array(16 * placements), order: 0, alternate: false, facade: 0, lod: null,
});
function withProps(m: LoadedMap): LoadedMap {
  return { ...m, props: [
    prop('a_bridge', [part('wall01.tif', [0, 0, 0, 1, 0, 0], [0.02, 0.02, 0.02, 1, 0.1, 0.1, 0.1, 0.5])]),
    prop('sun', [part('moon.tif', [0, 1, 0], [0.4, 0.3, 0.2, 1])]),
    prop('tree', [part('bark.tif', [5, 0, 0], [0.1, 0.1, 0.1, 1]), part('leaf.tif', [6, 0, 0, 7, 0, 0], [0.2, 0.2, 0.2, 1, 0.3, 0.3, 0.3, 0.25])], 3),
  ] } as unknown as LoadedMap;
}
const propRgb = (m: LoadedMap) => m.props.map((e) => e.parts.map(rgb));

describe('withVariant: props (IQ-143)', () => {
  it('applies a props pack by prop vertex index, byte b -> b/128, alpha untouched; the input untouched', () => {
    const m = withProps(makeMap());
    const before = JSON.stringify(m.props.map((e) => e.parts.map((p) => Array.from(p.colors))));
    // 6 prop vertices: bridge 0-1, sun 2, tree bark 3, tree leaf 4-5.
    const rgb8 = Uint8Array.from([40, 41, 42, 43, 44, 45, 128, 128, 128, 50, 51, 52, 60, 61, 62, 70, 71, 72]);
    const out = withVariant(m, profile({ propColours: { key: propsKey(m), rgb8 } }));
    expect(out.diagnostic).toBeUndefined();
    expect(propRgb(out.map)).toEqual([
      [[[40 / 128, 41 / 128, 42 / 128], [43 / 128, 44 / 128, 45 / 128]]],
      [[[1, 1, 1]]],
      [[[50 / 128, 51 / 128, 52 / 128]], [[60 / 128, 61 / 128, 62 / 128], [70 / 128, 71 / 128, 72 / 128]]],
    ]);
    expect(out.map.props[0]!.parts[0]!.colors[7]).toBe(0.5);
    expect(out.map.props[2]!.parts[1]!.colors[7]).toBe(0.25);
    expect(out.map.props[2]!.matrices).toBe(m.props[2]!.matrices);
    expect(JSON.stringify(m.props.map((e) => e.parts.map((p) => Array.from(p.colors))))).toBe(before);
    expect(out.map.world).not.toBe(undefined);
  });

  it('a props key mismatch or a props pack of the wrong length gives the input map unchanged and a diagnostic', () => {
    const m = withProps(makeMap());
    const rgb8 = new Uint8Array(18).fill(64);
    const bad = withVariant(m, profile({ propColours: { key: { vertices: 6, fnv64: '0000000000000000' }, rgb8 }, hideProps: ['sun'] }));
    expect(bad.map).toBe(m);
    expect(bad.diagnostic).toMatch(/props key/);
    const short = withVariant(m, profile({ propColours: { key: propsKey(m), rgb8: new Uint8Array(15) } }));
    expect(short.map).toBe(m);
    expect(short.diagnostic).toMatch(/props pack/);
  });

  it('hides prop entries by model name, after the props pack is applied by the decoded index', () => {
    const m = withProps(makeMap());
    const rgb8 = Uint8Array.from([...new Array(9).fill(0), 50, 51, 52, 60, 61, 62, 70, 71, 72]);
    const out = withVariant(m, profile({ propColours: { key: propsKey(m), rgb8 }, hideProps: ['sun'] })).map;
    expect(out.props.map((e) => e.modelName)).toEqual(['a_bridge', 'tree']);
    expect(rgb(out.props[1]!.parts[0]!)).toEqual([[50 / 128, 51 / 128, 52 / 128]]);
    const hiddenOnly = withVariant(m, profile({ hideProps: ['sun'] })).map;
    expect(hiddenOnly.props.map((e) => e.modelName)).toEqual(['a_bridge', 'tree']);
    expect(hiddenOnly.props[0]).toBe(m.props[0]);
  });
});

describe('propsKey (IQ-143)', () => {
  it('counts every prop vertex and hashes the parts positions in props order, as worldKey hashes the world', () => {
    const m = withProps(makeMap());
    const k = propsKey(m);
    expect(k.vertices).toBe(6);
    const flat = { world: m.props.flatMap((e) => e.parts) } as unknown as LoadedMap;
    expect(k).toEqual(worldKey(flat));
    expect(propsKey({ props: [] } as unknown as LoadedMap)).toEqual({ vertices: 0, fnv64: 'cbf29ce484222325' });
  });
});

describe('worldKey (DAY.R4)', () => {
  /** The reference: 64-bit FNV-1a in BigInt over the little-endian f32 bytes. */
  function reference(parts: Float32Array[]): string {
    let h = 0xcbf29ce484222325n;
    for (const p of parts) {
      const dv = new DataView(new ArrayBuffer(p.length * 4));
      p.forEach((v, i) => dv.setFloat32(i * 4, v, true));
      for (let i = 0; i < dv.byteLength; i++) h = BigInt.asUintN(64, (h ^ BigInt(dv.getUint8(i))) * 0x100000001b3n);
    }
    return h.toString(16).padStart(16, '0');
  }

  it('counts every world vertex and hashes the positions in world order', () => {
    const m = makeMap();
    const k = worldKey(m);
    expect(k.vertices).toBe(7);
    expect(k.fnv64).toMatch(/^[0-9a-f]{16}$/);
    expect(k.fnv64).toBe(reference(m.world.map((p) => p.positions)));
  });

  it('the empty world hashes to the FNV-1a offset basis', () => {
    expect(worldKey({ world: [] } as unknown as LoadedMap)).toEqual({ vertices: 0, fnv64: 'cbf29ce484222325' });
  });

  it('is stable and order-sensitive', () => {
    const m = makeMap();
    expect(worldKey(m)).toEqual(worldKey(makeMap()));
    const swapped = { ...m, world: [m.world[1]!, m.world[0]!, ...m.world.slice(2)] } as LoadedMap;
    expect(worldKey(swapped).vertices).toBe(7);
    expect(worldKey(swapped).fnv64).not.toBe(worldKey(m).fnv64);
  });

  it('reads a subarray view by its own bytes', () => {
    const big = Float32Array.from([9, 9, 1, 2, 3, 9]);
    const view = part('x', [], []);
    (view as { positions: Float32Array }).positions = big.subarray(2, 5);
    expect(worldKey({ world: [view] } as unknown as LoadedMap).fnv64).toBe(reference([Float32Array.from([1, 2, 3])]));
  });
});
