// @vitest-environment node
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InterleavedBufferAttribute, Mesh, type Material, type Object3D } from 'three';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture } from '../../archive/test/fixtures';
import { loadMap, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { groundGrid } from '../src/mover';
import { buildWorld, XBOX_SKIPS_FADE_TWIN_WARM_ADAPTATION } from '../src/world';
import { WorldState } from '../src/worldState';

/**
 * LATER 852 (the owner's playtest of agent/mega 841270596, 2026-11-10: on Desert Glory the first damage to some
 * destructibles hitched the frame; later hits did not). A death's fade (`SCENE_NODE_MOTION_PLACEHOLDER`'s fade of a
 * flown part, or a program's `OBJECT_OPACITY_FROM_TO` -- MP6's `crate_part_fly`) reaches the drawing through
 * `WorldView.setNodeOpacity`, which draws a node under opacity 1 with its shared material's fading twin (PB-9b,
 * `drawFaded`). The twin was made, and its program built and linked, in the frame of the first fade of each shared
 * material -- the first crate, bottle, cup, ashtray, tire pile, barrel or truck part of its texture -- while the load's
 * warm-up (`warmExtras`) made twins for the LOD copies only, and Desert Glory has none. A renderer warm-up only (product
 * track's kind of change inside a simulation-track row): what is compiled ahead, never what is drawn or when.
 *
 * The test: every draw a fade puts on a twin is one `warmExtras` handed the load's warm-up -- the same material on the
 * same geometry layout (a program is keyed by both) -- made before any fade, so the fade draws with the twin compiled.
 */

/**
 * What a program is built from here: the material and the geometry's attribute layout -- each attribute's name, item
 * size, stride and offset (an interleaved one's buffer stride and offset; a plain one's item size and 0), and whether it
 * is indexed. Names alone do not say it: CPS H12's interleaved part (stride 9) and the plain builder's part (counts that
 * disagree) carry the same three names in two layouts (the review of 852, F2).
 */
const drawKey = (o: Mesh): string => {
  const g = o.geometry;
  const layout = Object.keys(g.attributes).sort().map((name) => {
    const a = g.attributes[name]!;
    return a instanceof InterleavedBufferAttribute
      ? `${name}:${a.itemSize}:${a.data.stride}:${a.offset}`
      : `${name}:${a.itemSize}:${a.itemSize}:0`;
  });
  return `${(o.material as Material).uuid}|${layout.join(',')}|${g.index ? 'indexed' : 'plain'}`;
};
const warmKeys = (extras: readonly Object3D[]): Set<string> => {
  const keys = new Set<string>();
  for (const e of extras) e.traverse((o) => { if (o instanceof Mesh) keys.add(drawKey(o)); });
  return keys;
};

const part = (): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: 'cup.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
});
/** A prop placed once at `path`, drawn as a mesh of its own (no LOD band): what a scene program's opacity reaches. */
const single = (modelName: string, path: string) => ({
  modelName, parts: [part()], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  order: 0, alternate: false, facade: 0, lod: null, paths: [path],
});
const synthetic = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
  props: [single('cup_a', 'worldmodel/cup_a'), single('cup_b', 'worldmodel/cup_b')],
  textures: { 'cup.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'cup.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [],
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

describe('LATER 852: a scene node\'s fade draws with a twin the load warmed', () => {
  it('a prop of its own faded by a program (setNodeOpacity) draws with a twin warmExtras made before the fade, one per shared material', () => {
    const view = buildWorld(synthetic());
    for (const task of view.revealProps) task();
    const extras = view.warmExtras();                              // the load's warm-up, before any hit
    const warm = warmKeys(extras);
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const a = meshes.find((m) => m.name === 'cup_a')!, b = meshes.find((m) => m.name === 'cup_b')!;
    const rest = a.material;
    expect(b.material).toBe(rest);                                 // one texture, one shared material
    expect(view.setNodeOpacity('worldmodel/cup_a', 0.5)).toBe(1);
    expect(a.material).not.toBe(rest);                             // the fade draws with the twin
    expect(warm.has(drawKey(a)), 'the fading draw was warmed').toBe(true);
    expect(view.setNodeOpacity('worldmodel/cup_b', 0.5)).toBe(1);
    expect(b.material).toBe(a.material);                           // the twin is per shared material
    expect(warm.size).toBe(1);                                     // so one stand-in serves both
    view.setNodeOpacity('worldmodel/cup_a', 1);
    expect(a.material).toBe(rest);                                 // at 1, its own material again (unchanged)
  });

  it('one shared material on two geometry layouts (interleaved, plain) gets a stand-in for each: the key holds item size, stride and offset (F2)', () => {
    const map = synthetic();
    const plain = single('cup_c', 'worldmodel/cup_c');
    plain.parts = [{ ...part(), colors: new Float32Array(16).fill(1) }]; // 4 colours, 3 positions: the plain builder
    map.props.push(plain as (typeof map.props)[number]);
    const view = buildWorld(map);
    for (const task of view.revealProps) task();
    const warm = warmKeys(view.warmExtras());
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const a = meshes.find((m) => m.name === 'cup_a')!, c = meshes.find((m) => m.name === 'cup_c')!;
    expect(c.material).toBe(a.material);                           // one texture, one shared material
    expect(a.geometry.getAttribute('position')).toBeInstanceOf(InterleavedBufferAttribute);
    expect(c.geometry.getAttribute('position')).not.toBeInstanceOf(InterleavedBufferAttribute);
    expect(Object.keys(c.geometry.attributes).sort()).toEqual(Object.keys(a.geometry.attributes).sort()); // same names
    view.setNodeOpacity('worldmodel/cup_a', 0.5);
    view.setNodeOpacity('worldmodel/cup_c', 0.5);
    expect(c.material).toBe(a.material);                           // the one twin
    expect(warm.has(drawKey(a)), 'the interleaved layout was warmed').toBe(true);
    expect(warm.has(drawKey(c)), 'the plain layout was warmed').toBe(true);
    expect(warm.size).toBe(2);
  });

  it('the xbox class skips the fade-twin warm (XBOX_SKIPS_FADE_TWIN_WARM_ADAPTATION): no stand-in, the pre-852 count; every other class as before', () => {
    expect(XBOX_SKIPS_FADE_TWIN_WARM_ADAPTATION).toBe(true);
    const view = buildWorld(synthetic());
    for (const task of view.revealProps) task();
    expect(view.warmExtras('xbox')).toHaveLength(0);              // v0.4.18's warm: LOD copies' twins only, and none here
    for (const cls of ['standard', 'high', 'lowMemory', 'touch', 'software'] as const) {
      expect(warmKeys(view.warmExtras(cls)).size, cls).toBe(1);   // the fix as on 040fb01ee
    }
  });
});

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP6 = fixture('RUN/MP6.ZDB') !== null;

describe(`LATER 852: Desert Glory's destructibles, on its fixture${MP6 ? '' : ' (skipped: test-fixtures absent)'}`, () => {
  it.skipIf(!MP6)("every death's fade on MP6 draws with a twin the load's warm-up compiled (crates, pallets, bottles, cups, ashtrays, the tire pile, the barrel, the truck)", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP6.ZDB');
    const view = buildWorld(map);
    for (const task of [...view.revealWorld, ...view.revealProps]) task();
    const warm = warmKeys(view.warmExtras());                      // main.ts: `warmScene(built0.warmExtras())`
    const meshes: { mesh: Mesh; rest: Material }[] = [];
    view.group.traverse((o) => { if (o instanceof Mesh) meshes.push({ mesh: o, rest: o.material as Material }); });
    const page = new WorldState(map.meta!, map.ground!, groundGrid(map.ground!), {
      opacity: (path, f) => { view.setNodeOpacity(path, f); },    // main.ts's page world hook
    });
    page.applyInitial();
    const cold = new Map<string, string[]>();                      // a twin drawn that the warm-up did not compile
    const faded = new Set<string>();                               // the deaths whose fade reached a drawn part
    const twinned = new Set<Mesh>();
    for (const d of map.meta!.scene!.destructibles) {
      page.takeDeath(d.id, false);
      for (let t = 0; t < 60; t++) {                               // 6 s: past every MP6 motion's lifetime (5 s at most)
        page.step(0.1);
        for (const { mesh, rest } of meshes) {
          if (mesh.material === rest || twinned.has(mesh)) continue;
          twinned.add(mesh);                                       // first put on its twin by this death
          faded.add(d.anim);
          if (!warm.has(drawKey(mesh))) cold.set(mesh.name, [...(cold.get(mesh.name) ?? []), d.anim]);
        }
      }
    }
    for (const anim of ['hit_cratesmall', 'hit_crate01', 'hit_pal3x_1', 'beer1', 'tincup1', 'ashtray', 'tire_pile_hit', 'barrel_dest', 'truck_stop_gas_hit']) {
      expect(faded.has(anim), anim).toBe(true);
    }
    expect([...cold.keys()].sort()).toEqual([]);
  }, 120_000);
});
