import { experimentalAssets, updateExperimentalAssets } from '../src/experimentalAssets';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, PerspectiveCamera, type Object3D } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { parseRdr, parseZdb, readTexManifest, Zar, zdbMember, type TexEntry } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import {
  DEFAULT_GRID_PARAMS, DETAIL_BIT14_READING, DETAIL_CENTROID_READING, DETAIL_RANGE_SOURCE_READING, IDENTITY, NODE_INSTANCE,
  NODE_MODEL, parseSceneGraph, placeInstances, VISUAL_FLAG_DETAIL, visualHasDetail, type SceneNode,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { detailBindings, loadMap, mergeWorld, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import * as materialSpecModule from '../src/materialSpec';
import { DETAIL_SWITCH_READING, detailSwitch } from '../src/materialSpec';
import { buildWorld } from '../src/world';
import { resolveVisuals } from '../src/startupSettings';
import { DETAIL_DISTANCE_MODERN_DEFAULT, detailDistanceFor } from '../src/detailDistance';

/**
 * The detail pass's binding (W1.6): which of a map's draws get a second pass, and with what. A draw's
 * texture binds one when its `mp<N>_lib.rdr` entry carries a `detail` record (socomlegacy/docs/research/72 §6).
 * That is the disc's own rule, measured: over the 22 maps every one of the 2,395 visuals drawn with a
 * texture that has a detail record carries a `detail_buff` of its own, and none drawn with such a texture
 * lacks one -- so binding by texture is binding by visual.
 */
const entry = (name: string, detail?: TexEntry['detail']): [string, TexEntry] => [name.toLowerCase(), {
  name, dim2: { width: 64, height: 64, bpp: 8 }, typeU: 1, typeV: 1, pal: true, detail,
}];

describe('detailBindings (synthetic)', () => {
  const manifest = new Map<string, TexEntry>([
    entry('ground.tif', { name: 'Ground_Det.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' }),
    entry('wall.tif', { name: 'wall_det.tif', uv: 3, range: 20000000, bmode: 'COLORBLEND' }),
    entry('sky.tif'),
  ]);

  it('binds the drawn textures whose entry has a detail record, the detail named as map.textures keys it', () => {
    expect(detailBindings(manifest, ['ground.tif', 'sky.tif', 'ground.tif'])).toEqual({
      'ground.tif': { name: 'ground_det.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' },
    });
  });

  it('binds nothing for a texture the manifest does not list, or a map with no manifest', () => {
    expect(detailBindings(manifest, ['nowhere.tif'])).toEqual({});
    expect(detailBindings(new Map(), ['ground.tif'])).toEqual({});
  });
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const mp2 = fixture('RUN/MP2.ZDB');
const absent = mp2 === null || fixture('RUN/MP6.ZDB') === null || fixture('RUN/MP72.ZDB') === null;
const load = (path: string): Promise<LoadedMap> => loadMap(new FsAssetSource(FIXTURES), path);

describe.skipIf(absent)(`the detail bindings out of loadMap${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('Frostfire: the manifest lists all 37 names the world\'s chains cite, and floor_oilgrime.tif binds its detail', async () => {
    const map = await load('RUN/MP2.ZDB');
    const toc = parseZdb(mp2!);
    const readerm = Zar.parse(zdbMember(mp2!, toc, 'READERM.ZAR'));
    const manifest = readTexManifest(parseRdr(readerm.data(readerm.find('mp2_lib.rdr')!)));
    // Research 72 §6-7: the world's chains cite 37 distinct names; every one is in the manifest.
    const cited = new Set(map.world.map((m) => m.textureName).filter((n): n is string => n !== null));
    expect(cited.size).toBe(37);
    for (const name of cited) expect(manifest.has(name), name).toBe(true);

    // The one detail texture Frostfire draws: 8 across, gone at 500 units, added (SEMANTICS §11.6).
    expect(map.detail).toEqual({
      'floor_oilgrime.tif': { name: 'flooroil_detail.tif', uv: 8, range: 250000, bmode: 'ADDITIVE' },
    });
    expect(map.textures['flooroil_detail.tif']).toMatchObject({ width: 128, height: 128 });
    // `a_floor.tif`'s detail, `a_floordetail.tif`, is in none of the map's libraries -- and `a_floor.tif`
    // is drawn by nothing, so nothing is missing and nothing is said.
    expect(map.detail['a_floor.tif']).toBeUndefined();
    expect(map.diagnostics.filter((d) => /detail/i.test(d))).toEqual([]);
    const draws = [...map.world, ...map.props.flatMap((p) => p.parts)].filter((m) => m.textureName === 'floor_oilgrime.tif');
    expect(draws.length).toBeGreaterThan(0);
    // PF-30: the world's oil-grime draws carry their visuals' centroids, a vertex each, and bit 14 (every one of
    // Frostfire's detail-bearing visuals has it); no draw without a detail binding pays for the attribute.
    for (const d of map.world.filter((m) => m.textureName === 'floor_oilgrime.tif')) {
      expect(d.centroids?.length).toBe(d.positions.length);
      expect(d.detailOn).not.toBe(false);
    }
    expect(map.world.filter((m) => m.centroids && !map.detail[m.textureName ?? ''])).toEqual([]);
  });

  it.skipIf(absent)('Desert Glory and Crossroads bind the COLORBLEND details their drawn ground and walls carry', async () => {
    const mp6 = await load('RUN/MP6.ZDB');
    expect(mp6.detail['afghan2r_floor_dirty.tif']).toEqual({ name: 'detail_map.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' });
    expect(mp6.textures['detail_map.tif']).toBeDefined();
    const mp72 = await load('RUN/MP72.ZDB');
    expect(Object.keys(mp72.detail).sort()).toEqual([
      'cobblestone_rock.tif', 'extwalls01.tif', 'road_cobble.tif', 'roadcement2.tif', 'rooftile.tif', 'wall_dirty05.tif',
    ]);
    for (const [base, d] of Object.entries(mp72.detail)) {
      expect(d.bmode, base).toBe('COLORBLEND');
      expect(mp72.textures[d.name], `${base} -> ${d.name}`).toBeDefined();
    }
    for (const map of [mp6, mp72]) expect(map.diagnostics.filter((d) => /detail/i.test(d))).toEqual([]);
    // Load-bound, not logic-bound: `loadMap` reads and decodes two whole maps (MP6, MP72) off the fixtures.
    // Solo 0.39 s (vitest --maxWorkers=2, 2026-09-29). It passed alone and timed out at the default 5 s in
    // full-suite runs on a loaded host: a slow-down past 12x, which solo x 6 (2.4 s) would not cover, so
    // the budget is solo x ~26 -- this test's alone; the suite keeps the default.
  }, 10_000);
});

/**
 * PF-30 (ruling PF.R50, research 232 §4; 188 U2): the detail pass on or off for a whole visual. `CPipe::RenderVisual`
 * (`FUN_003374c0` D:L235405-235418) puts the visual centroid's scaled range² (`FUN_00290aa0`) in `DAT_004b4a98` and
 * sets `DAT_004b4a88` when it is `<=` the first float of any of the visual's detail entries; the pass's draw
 * (`FUN_003b6e10` D:L308360) runs only with that flag and `vparams` word 0 bit 14 (D:L308392). No fade.
 */
const RANGE = 202500;                                          // 450², the disc's commonest record (188 U2)
const tri = (over: Partial<LoadedMesh> = {}): LoadedMesh => ({
  // A wide triangle: its corners are 600 u from its centroid, so a per-fragment rule would ring it; the switch does not.
  positions: new Float32Array([-600, 0, -600, 600, 0, -600, 0, 0, 600]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: 'ground.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
  centroids: new Float32Array(9), ...over,
});
const FLAGS = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const DETAIL = { 'ground.tif': { name: 'grain.tif', uv: 4, range: RANGE, bmode: 'COLORBLEND' } };
const synthetic = (world: LoadedMesh[]): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world, lines: null, props: [],
  textures: {
    'ground.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 },
    'grain.tif': { data: new Uint8ClampedArray(16).fill(128), width: 2, height: 2 },
  },
  textureFlags: { 'ground.tif': FLAGS, 'grain.tif': FLAGS },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: DETAIL,
  grid: DEFAULT_GRID_PARAMS, collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 }, slots: [],
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

interface Gate { rangeSqScale: { value: number }; range: { value: number; update(frame: { object: Object3D }): void } }
const gateOf = (m: Mesh): Gate => (m.material as MeshBasicNodeMaterial).userData.detailGate as Gate;
/** The world built, its draws revealed, and its detail passes, with what each pass's graph decides. */
function built(world: LoadedMesh[]) {
  const view = buildWorld(synthetic(world));
  for (const task of view.revealWorld) task();
  const bases = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const passes = bases.flatMap((b) => b.children.filter((c): c is Mesh => c instanceof Mesh && c.name.endsWith(' (detail)')));
  /** The pass's switch at `vertex` with the camera at `camera`: the CPU twin over the graph's own inputs. */
  const on = (pass: Mesh, camera: PerspectiveCamera, vertex = 0): boolean => {
    const gate = gateOf(pass);
    gate.range.update({ object: pass });
    const c = pass.geometry.getAttribute('detailCentroid');
    const rangeSq = (c.getX(vertex) - camera.position.x) ** 2 + (c.getY(vertex) - camera.position.y) ** 2 + (c.getZ(vertex) - camera.position.z) ** 2;
    return detailSwitch(rangeSq * gate.rangeSqScale.value, gate.range.value, 1);
  };
  return { view, bases, passes, on };
}
const cameraAt = (x: number, y: number, z: number): PerspectiveCamera => {
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  camera.updateMatrixWorld();
  return camera;
};

describe('PF-30: the detail pass per visual', () => {
  // OT.R79's parity fix (the owner's question of 2026-10-23, the merge controller's ruling): the PS2 picture's preset
  // leaves the pass on -- the original draws it (`FUN_003b6e10` D:L308360-308392), gated per visual as below.
  it('the PS2 picture draws the detail pass: its preset keeps the pass, a visual inside its range has it on', () => {
    const { view, passes, on } = built([tri()]);
    try {
      view.setDetail(resolveVisuals(null, 'ps2').detail);
      const camera = cameraAt(0, 0, 449);
      view.frame(camera, 0);
      expect(passes).toHaveLength(1);
      expect(passes[0]!.visible).toBe(true);
      expect(on(passes[0]!, camera)).toBe(true);
    } finally { view.dispose(); }
  });

  it('experimental distance scales the existing visual gate and bypass restores it', () => {
    const {view, passes, on} = built([tri()]);
    const camera = cameraAt(0, 0, 650);
    try {
      updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS, enabled:true, detailAdjust:true, detailRange:1.5});
      view.frame(camera,0);
      expect(on(passes[0]!,camera)).toBe(true);
      expect(gateOf(passes[0]!).range.value).toBe(RANGE * 2.25);
      updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS, enabled:false});
      expect(on(passes[0]!,camera)).toBe(false);
      expect(experimentalAssets.detailStrength.value).toBe(1);
    } finally { updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS, enabled:false}); view.dispose(); }
  });
  it("the detail pass is on for a whole visual whose centroid's scaled range² <= the record's range and off beyond it: 449 u on, 451 u off at range 202,500 (FUN_003374c0 D:L235405-235418); no fade (DETAIL_SWITCH_READING)", () => {
    expect(DETAIL_SWITCH_READING).toBe('whole visual, no fade');
    expect(detailSwitch(449 ** 2, RANGE, 1)).toBe(true);
    expect(detailSwitch(450 ** 2, RANGE, 1)).toBe(true);           // `<=`: the record's range itself is inside
    expect(detailSwitch(451 ** 2, RANGE, 1)).toBe(false);
    // The W1.6 fade is retired: nothing weighs the pass by a fragment's distance any more.
    expect('detailWeight' in materialSpecModule).toBe(false);

    const { passes, on, view } = built([tri()]);
    view.setDetailDistance(1);                                     // the original (the PS2 picture's): PF.R60 off
    expect(passes.length).toBe(1);
    const pass = passes[0]!;
    // Every vertex of the visual carries the one centroid, so the whole triangle switches together.
    const c = pass.geometry.getAttribute('detailCentroid');
    expect(c.count).toBe(3);
    for (let v = 0; v < 3; v++) expect([c.getX(v), c.getY(v), c.getZ(v)]).toEqual([0, 0, 0]);
    for (const [units, want] of [[449, true], [450, true], [451, false]] as const) {
      const camera = cameraAt(0, 0, units);
      view.frame(camera, 0);
      for (let v = 0; v < 3; v++) expect(on(pass, camera, v), `${units} u, vertex ${v}`).toBe(want);
    }
  });

  // PF.R60 (the owner: "please make this a slider, and for modern mode, double the default. ps2 mode keeps the
  // original."): a browser adaptation over the original's per-visual gate -- the disc's range is untouched, the factor²
  // multiplies it on the GPU uniform. The PS2 picture's factor is 1, the original's 449 / 451 above.
  it('PF.R60: the Modern default detail distance (2) doubles the gate: 899 u on, 901 u off at range 202,500; factor 1 (PS2) restores 449 / 451', () => {
    expect(DETAIL_DISTANCE_MODERN_DEFAULT).toBe(2);
    const { passes, on, view } = built([tri()]);
    try {
      const pass = passes[0]!;
      const at = (units: number): boolean => { const camera = cameraAt(0, 0, units); view.frame(camera, 0); return on(pass, camera); };
      expect(view.detailDistance).toBe(1);                         // a world unwired keeps the original
      view.setDetailDistance(DETAIL_DISTANCE_MODERN_DEFAULT);
      expect(view.detailDistance).toBe(2);
      expect([at(899), at(900), at(901)]).toEqual([true, true, false]);
      gateOf(pass).range.update({ object: pass });
      expect(gateOf(pass).range.value).toBe(RANGE * 4);
      view.setDetailDistance(detailDistanceFor('ps2', 3.5));        // the PS2 picture: 1, whatever is stored
      expect([at(449), at(450), at(451), at(899)]).toEqual([true, true, false, false]);
      gateOf(pass).range.update({ object: pass });
      expect(gateOf(pass).range.value).toBe(RANGE);               // the disc's reading, untouched
      for (const bad of [0, -2, Number.NaN]) { view.setDetailDistance(bad); expect(view.detailDistance, String(bad)).toBe(1); }
    } finally { view.dispose(); }
  });

  it("PF.R60: the detail distance stacks with the Experimental view's own Distance (2 x 1.6 = 3.2 at its defaults)", () => {
    const { view, passes, on } = built([tri()]);
    const pass = passes[0]!;
    try {
      updateExperimentalAssets({ ...EXPERIMENTAL_DEFAULTS, enabled: true });
      view.setDetailDistance(DETAIL_DISTANCE_MODERN_DEFAULT);
      view.frame(cameraAt(0, 0, 0), 0);
      gateOf(pass).range.update({ object: pass });
      expect(gateOf(pass).range.value).toBeCloseTo(RANGE * (2 * 1.6) ** 2, 6);
      let camera = cameraAt(0, 0, 1439);                            // 450 x 3.2 = 1,440
      view.frame(camera, 0);
      expect(on(pass, camera)).toBe(true);
      camera = cameraAt(0, 0, 1441);
      view.frame(camera, 0);
      expect(on(pass, camera)).toBe(false);
    } finally { updateExperimentalAssets({ ...EXPERIMENTAL_DEFAULTS, enabled: false }); view.dispose(); }
  });

  it("a visual whose vparams word 0 lacks bit 14 (0x4000) draws no detail pass (FUN_003b6e10 D:L308392, DETAIL_BIT14_READING): a synthetic placement without the bit, and MP64's jungletree01_roots when the disc is present", () => {
    expect(VISUAL_FLAG_DETAIL).toBe(0x4000);
    expect(DETAIL_BIT14_READING).toBe('vparams word 0 bit 14');
    expect(visualHasDetail(0x8a0fe)).toBe(false);                  // jungletree01_roots' first visual, as the disc has it
    expect(visualHasDetail(0x8a0fe | 0x4000)).toBe(true);

    // The flag per visual out of the scene: a model of two visuals, the first with the bit and the second without.
    const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
      name, modelName: null, type: NODE_MODEL, flags: 1, matrix: Float32Array.from(IDENTITY), bbox: new Float32Array(6), regionmask: 0,
      visuals: 2, visualParams: [VISUAL_FLAG_DETAIL | 8, 8], visualMaterials: [0, 0], children: [], collision: [], ...over,
    });
    const tree = node('tree');
    const root = node('worldmodel', { visuals: 0, visualParams: [], children: [node('tree_1', { type: NODE_INSTANCE, modelName: 'tree', visuals: 0, visualParams: [] })] });
    expect(placeInstances([root, tree]).find((p) => p.modelName === 'tree')!.detail).toEqual([true, false]);

    // Built: the visual with the bit gets its pass, the one without none.
    const { view, bases, passes } = built([tri(), tri({ detailOn: false, order: 256, orderEnd: 256 })]);
    expect(view.detailDraws).toBe(1);
    expect(passes.length).toBe(1);
    expect(bases.filter((b) => b.children.length === 0).length).toBe(1);

    const disc = process.env.SOCOM_DISC;
    const mp64 = disc ? resolve(disc, 'RUN/MP64.ZDB') : '';
    if (disc && existsSync(mp64)) {
      const bytes = new Uint8Array(readFileSync(mp64));
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MP64_GEO.ZED')));
      const roots = placeInstances(models).filter((p) => p.modelName === 'jungletree01_roots');
      expect(roots.length).toBe(4);
      // Its first visual carries a detail_buff (102,500, Shadow Falls' one record) and lacks the bit: no pass.
      for (const p of roots) {
        expect(p.detailRanges?.[0]).toBe(102500);
        expect(p.detail?.[0]).toBe(false);
      }
    }
  });

  it('the detail gate scales with the view: at magnification 9 a visual 1,200 u out (1200²/9 = 400²) is inside range 202,500; at 1 it is outside', () => {
    expect(detailSwitch(1200 ** 2, RANGE, 9)).toBe(true);
    expect(detailSwitch(1200 ** 2, RANGE, 1)).toBe(false);
    const { passes, on, view } = built([tri()]);
    const pass = passes[0]!;
    const camera = cameraAt(0, 0, 1200);
    view.frame(camera, 0, { magnification: 9, farExtra: 0 });
    expect(gateOf(pass).rangeSqScale.value).toBeCloseTo(1 / 9, 12);
    expect(on(pass, camera)).toBe(true);
    view.frame(camera, 0, { magnification: 1, farExtra: 0 });
    expect(on(pass, camera)).toBe(false);
    view.frame(camera, 0, { magnification: 9, farExtra: 0 });
    view.frame(camera, 0);                                         // no view: magnification 1
    expect(on(pass, camera)).toBe(false);
  });

  it("a texture's run of visuals that disagree on bit 14 is split so each draw is gated whole (as a blended chunk splits a run)", () => {
    const visual = (x: number, detailOn: boolean, order: number, texture = 'ground.tif'): LoadedMesh => ({
      ...tri({ textureName: texture, order, orderEnd: order, detailOn, centre: [x, 0, 0] }), centroids: undefined,
      positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x, 0, 1]),
    });
    const merged = mergeWorld([visual(0, true, 0), visual(10, false, 256), visual(20, true, 512)], { 'ground.tif': FLAGS }, DETAIL);
    expect(merged.map((m) => [m.detailOn !== false, m.positions.length / 3])).toEqual([[true, 6], [false, 3]]);
    // The draw that keeps the pass carries each of its visuals' centroids, three vertices each.
    const on = merged.find((m) => m.detailOn !== false)!;
    expect(Array.from(on.centroids!)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 20, 0, 0, 20, 0, 0]);

    // A texture with no detail binding is not split by the bit, and spends nothing on centroids.
    const plain = mergeWorld([visual(0, true, 0, 'wall.tif'), visual(10, false, 256, 'wall.tif')], { 'wall.tif': FLAGS }, DETAIL);
    expect(plain.length).toBe(1);
    expect(plain[0]!.centroids).toBeUndefined();
  });

  it("the gate's range is the visual's own: the largest of its detail_buff entries, any entry passing (FUN_003374c0 D:L235408-235415, DETAIL_RANGE_SOURCE_READING); its centroid is vparams +0x0c (DETAIL_CENTROID_READING)", () => {
    expect(DETAIL_RANGE_SOURCE_READING).toBe("the visual's detail_buff, its largest entry");
    expect(DETAIL_CENTROID_READING).toBe('vparams +0x0c');
    // Two visuals of one texture whose own ranges differ are two draws, each with its visual's range on the pass.
    const merged = mergeWorld([tri({ detailRange: 90000 }), tri({ detailRange: 20000000, order: 256, orderEnd: 256 })], { 'ground.tif': FLAGS }, DETAIL);
    expect(merged.map((m) => m.detailRange)).toEqual([90000, 20000000]);
    const { passes } = built(merged);
    expect(passes.map((p) => { const g = gateOf(p); g.range.update({ object: p }); return g.range.value; })).toEqual([90000, 20000000]);
    // A hand-built draw with no range of its own takes its texture's record.
    const plain = built([tri()]).passes[0]!;
    gateOf(plain).range.update({ object: plain });
    expect(gateOf(plain).range.value).toBe(RANGE);

    if (mp2 === null) return;
    // Frostfire, off the fixture: its 61 detail-bearing visuals all hold 250,000 (floor_oilgrime's record), each a centre.
    const models = parseSceneGraph(Zar.parse(zdbMember(mp2, parseZdb(mp2), 'MP2_GEO.ZED')));
    const ranges: number[] = [];
    const walk = (n: SceneNode): void => {
      n.visualDetailRanges?.forEach((r, v) => {
        if (r === null) return;
        ranges.push(r);
        expect(n.visualCentres?.[v]).toHaveLength(3);
      });
      n.children.forEach(walk);
    };
    models.forEach(walk);
    expect(ranges.length).toBe(61);
    expect(new Set(ranges)).toEqual(new Set([250000]));
  });
});
