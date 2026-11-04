import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, type Material } from 'three';
import { buildGrid, DEFAULT_GRID_PARAMS, DEFAULT_RIFLE, type CollisionOwner, type Grid, type GridParams, type ParticleSource, type WorldPoly } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';
import type { GsState } from '@s2u/gs';
import type { EffectData, EffectTexture } from '../src/effectData';
import { Effects } from '../src/effects';
import { Fire, WALK_DECAL_RENDER_ORDER } from '../src/fire';
import { GrenadeThrower, THROWABLES } from '../src/grenade';
import { GRENADE_BITMAPS } from '../src/grenadeAssets';
import { MarkClipper } from '../src/markClip';
import { ParticleSystem } from '../src/particles';
import type { PlaySnapshot } from '../src/walk';

/**
 * OBF-32 (Craig's 2026-10-31 playtest: "bullet holes still visible through smoke grenades"): a mark, a footprint and a
 * grenade's scorch draw under the smoke's particles, not over them (socomlegacy/docs/research/89 §20, "the marks against the
 * alpha pass"). The original links a mark into the struck visual's own chain (`FUN_003b3800`, D:L306396-306413) and
 * `FUN_003b4580` ships that chain right after the visual's geometry (D:L307165-307190); a world wall is drawn in
 * RenderWorld's walk, and the particles drain afterwards in the alpha pass `FUN_00336cb0` (D:L235146-235180, called at
 * D:L237235), writing no depth (D:L235137, D:L235185). So the smoke blends over a mark as over the wall under it.
 *
 * three sorts its transparent list by `groupOrder`, then `renderOrder`, then depth far to near (three 0.186
 * `reversePainterSortStable`): a mark ordered above the particle batches drew after every puff at any distance.
 */

type V3 = [number, number, number];

/** three's transparent-list comparator (`reversePainterSortStable`, three 0.186): groupOrder, renderOrder, z far first. */
interface RenderItem { groupOrder: number; renderOrder: number; z: number; id: number; name: string }
const reversePainter = (a: RenderItem, b: RenderItem): number =>
  a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder
    : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder
      : a.z !== b.z ? b.z - a.z
        : a.id - b.id;

/** One particle source (particleTextures.test.ts's probe): one puff a second at the origin, living a second. */
function source(over: Partial<ParticleSource> = {}): ParticleSource {
  return {
    flagsA: 0x3, flagsB: 0, name: 'probe', setActive: true, node: -6, follow: false, perEvent: 1, events: 1, interval: 0.01,
    perDistance: false, type: 0, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
    baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
    atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
    friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [1, 1], nearFade: null, farFade: null, textures: [], textureMode: 'first',
    texture: null, colours: [[0, 0.4, 0.4, 0.4, 0.6], [1, 0.4, 0.4, 0.4, 0.6]], scales: [], ...over,
  };
}

/** Every batch mesh a particle system draws with: a smoke puff's (emitted and drawn) and the pre-warm's. */
function particleBatches(): Mesh[] {
  const ps = new ParticleSystem(() => 0.5);
  const cam = new PerspectiveCamera(50, 1, 0.1, 1000);
  cam.position.set(0, 0, 50);
  cam.updateMatrixWorld(true);
  ps.emit(source({ texture: 'cloudpuff01.tif', textures: [{ name: 'cloudpuff01.tif', t: 0 }] }), new Matrix4(), {}, 'smoke', () => true);
  ps.update(0.01, cam);
  ps.update(0.01, cam);
  ps.warm(['effect_mist.tif', 'fire_hardedge.tif']);
  const meshes = ps.object.children.filter((o): o is Mesh => o instanceof Mesh);
  expect(meshes.length).toBeGreaterThanOrEqual(3);
  return meshes;
}

/** A bullet mark from `Fire.place` (through `shoot`): a wall across x at z = -30, the round straight down -z. */
function bulletMark(): Mesh {
  const quad = (points: number[]): WorldPoly =>
    ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/q0', first: 0, count: 1 }];
  const g = buildGrid(params, [], [], [quad([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30])], owners);
  const eye: V3 = [0, 20, 0];
  const fire = new Fire({ grid: () => g, aim: () => ({ eye, far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, () => 0.5);
  fire.shoot();
  const mark = fire.decalMeshes()[0];
  expect(mark).toBeDefined();
  return mark!;
}

/** A footprint from `Effects.footfall`: SAND's `FOOTSTEP_DECALS` row, synthetic data. */
function footprint(): Mesh {
  const gs = { blend: 'source', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'clamp', wrapT: 'clamp' } as GsState;
  const tex: EffectTexture = { rgba: { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 128]) }, gs };
  const data: EffectData = {
    archive: 'T', models: [], textures: [['stamp_footprint01.tif', tex]], absent: [], materials: ['SAND'], defaultMaterial: 0, marks: [],
    footprints: [['SAND', 'stamp_footprint01.tif']], ambient: [], sceneNodes: [], hitAnims: [], missing: [], programs: [],
  };
  const fx = new Effects(() => 0.5);
  fx.setData(data);
  expect(fx.footfall([0, 0, 0], 0, [0, 1, 0], [0, 0, -1], false)).toBe(true);
  const print = fx.footprintMeshes()[0];
  expect(print).toBeDefined();
  return print!;
}

/** The scorch under a claymore's blast (grenadeScorchPool.test.ts's rig), clipped to a drawn floor or the bare square. */
function scorch(clipped: boolean): Mesh {
  const grid: Grid = (() => {
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [poly], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
  })();
  const snap = (): PlaySnapshot => ({
    feet: [-2, 0, 8], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0,
  } as PlaySnapshot);
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = new GrenadeThrower({ grid: () => grid, snapshot: snap, view: () => 'third', handPoint: () => [0, 12, 0] }, THROWABLES, random);
  g.setMap(null, { models: [], bitmaps: { [GRENADE_BITMAPS.scorch]: { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(128) } }, defaultMaterial: '' });
  if (clipped) {
    const floor = new BufferGeometry();
    floor.setAttribute('position', new BufferAttribute(Float32Array.from([-20, 0, 20, 20, 0, 20, 20, 0, -20, -20, 0, -20]), 3));
    floor.setAttribute('color', new BufferAttribute(Float32Array.from(Array(16).fill(0.5)), 4));
    floor.setIndex([0, 1, 2, 0, 2, 3]);
    const root = new Group();
    root.add(new Mesh(floor, new MeshBasicMaterial()));
    root.updateMatrixWorld(true);
    g.setClip(new MarkClipper(root));
  }
  const run = (seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
  g.refill();
  g.select('Claymore');
  g.pull();
  run(1.5);
  expect(g.detonateCharges()).toBe(1);
  run(0.1);
  const mark = g.scorchMeshes()[0];
  expect(mark).toBeDefined();
  return mark!;
}

describe('OBF-32: the walk\'s decals sort under the particle batches (FUN_003b4580 D:L307165-307190; FUN_00336cb0)', () => {
  const decals: [string, () => Mesh][] = [
    ['a bullet mark (Fire.place)', bulletMark],
    ['a footprint (Effects.footfall)', footprint],
    ['a clipped grenade scorch', () => scorch(true)],
    ['the bare-square grenade scorch (no clipper)', () => scorch(false)],
  ];
  const batches = particleBatches();
  for (const [name, make] of decals) {
    it(`${name} has a renderOrder strictly below every particle batch mesh`, () => {
      const decal = make();
      for (const b of batches) expect(decal.renderOrder, b.name).toBeLessThan(b.renderOrder);
      expect(decal.renderOrder).toBe(WALK_DECAL_RENDER_ORDER);
    });
  }

  it('in three\'s transparent sort, a smoke batch 50 units off draws after a mark on a wall 100 units off', () => {
    const mark = bulletMark();
    const smoke = batches[0]!;
    const items: RenderItem[] = [
      { groupOrder: 0, renderOrder: smoke.renderOrder, z: 50, id: smoke.id, name: 'smoke' },
      { groupOrder: 0, renderOrder: mark.renderOrder, z: 100, id: mark.id, name: 'mark' },
    ];
    const order = [...items].sort(reversePainter).map((i) => i.name);
    expect(order).toEqual(['mark', 'smoke']);
    // And the converse the depth test settles: a mark nearer than the smoke still sorts first, the smoke blending over
    // it only where its puffs are in front (the smoke writes no depth; the wall under the mark wrote its own).
    const near = [{ ...items[0]!, z: 100 }, { ...items[1]!, z: 50 }].sort(reversePainter).map((i) => i.name);
    expect(near).toEqual(['mark', 'smoke']);
  });
});

/**
 * Review F1 (OBF-32): a mark goes out AFTER its own visual's whole command list. `FUN_003b4580` builds each part's list
 * with `FUN_003b5f20` (D:L306946, D:L306993, D:L307040, D:L307083), which carries the reflection (`FUN_003b5b90`,
 * D:L307913, D:L307973; research 330 R330.2) and the detail pass, and only then walks the mark chain (D:L307165-307190).
 * So in three's order a walk decal sorts after every blended walk draw (`world.ts` `restOrder`, `d.order * 2^-24`), its
 * detail pass (+0.5) and its env pass (+0.75); and the particles, drained in the alpha pass after the whole walk
 * (`FUN_00336cb0` at D:L237235), after the decals -- but still before the world's alpha pass and the shadows
 * (`ALPHA_PASS_REST_ORDER` 1; their interleave by distance is LATER 593). The world is `worldWalkDepth.test.ts`'s
 * synthetic map, built as the menu match builds it, with one reflective draw at the last walk order the gap allows.
 */
describe('OBF-32 (review F1): the walk decals sort after their wall\'s blended draw, detail and env passes; the particles after them, before the alpha pass', () => {
  const S = 2 ** -24;                                     // `world.ts` `REST_WALK_SCALE`
  /** The last walk order the decals' gap holds for: a placement rank of 8191 (`loadMap.ts` `orderOf`: rank * 256 + 255). */
  const LAST_ORDER = 8191 * 256 + 255;
  const tri = (z: number): Float32Array => new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]);
  const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
    positions: tri(0), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
    indices: new Uint32Array([0, 1, 2]), textureName, fog: true, lit: false, order, orderEnd: order, cull: true,
    alternate: false, scroll: null, ...extra,
  });
  const RAMP = new Float32Array([1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 1, 1]);
  const NORMALS = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
  const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
  const graded: TextureFlags = { bilinear: true, transparent: true, graded: true, opaque: false, gs: null };
  const map = (): LoadedMap => ({
    archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: DEFAULT_GRID_PARAMS, slots: [],
    world: [
      part('rock.tif', 256, { vertexAlpha: true, colors: RAMP }),           // a vertex ramp (research 82 D8) with a detail pass
      part('water.tif', 512, { reflect: 1, normals: NORMALS }),            // a reflective draw: its env pass
      part('skyrim.tif', 768, { fog: false }),                             // a texture ramp
      part('ice.tif', LAST_ORDER, { vertexAlpha: true, colors: RAMP, reflect: 1, normals: NORMALS }),   // blended and reflective, last
      part('window.tif', 1280, { alphaPass: true }),                       // the alpha pass
      part('shadow.tif', 1536),                                            // a drop shadow
    ],
    props: [],
    textures: {
      'rock.tif': rgba(255), 'water.tif': rgba(255), 'skyrim.tif': rgba(128), 'ice.tif': rgba(255), 'window.tif': rgba(255),
      'shadow.tif': rgba(128), 'sky01.tif': rgba(255), 'grain.tif': rgba(255),
    },
    textureFlags: {
      'rock.tif': solid, 'water.tif': solid, 'skyrim.tif': graded, 'ice.tif': solid, 'window.tif': solid, 'shadow.tif': graded,
      'sky01.tif': solid, 'grain.tif': solid,
    },
    envMaterials: [{ index: 0, rgba: [128, 128, 128, 0], uvScale: 0.5, rimOffset: 0, rimSlope: 1, texture: 'sky01.tif' }],
    detail: { 'rock.tif': { name: 'grain.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' }, 'ice.tif': { name: 'grain.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' } },
    metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
    collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
    diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
  });
  function world() {
    const view = buildWorld(map());
    for (const task of [...view.revealWorld, ...view.revealProps]) task();
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const named = (name: string): Mesh => meshes.find((x) => x.name === name)!;
    const pass = (base: Mesh, suffix: string): Mesh => base.children.find((c): c is Mesh => c instanceof Mesh && c.name.endsWith(suffix))!;
    const rock = named('rock.tif'), water = named('water.tif'), ice = named('ice.tif');
    const walk: [string, Mesh][] = [
      ['the vertex ramp', rock], ['its detail pass', pass(rock, ' (detail)')], ['the reflective draw\'s env pass', pass(water, ' (env)')],
      ['the texture ramp', named('skyrim.tif')], ['the last blended draw', ice], ['its detail pass', pass(ice, ' (detail)')],
      ['its env pass', pass(ice, ' (env)')],
    ];
    for (const [name, m] of walk) {
      expect(m, name).toBeDefined();
      expect((m.material as Material).transparent, `${name}: three's transparent list`).toBe(true);
    }
    return { view, walk, window: named('window.tif'), shadow: named('shadow.tif'), lastEnv: pass(ice, ' (env)') };
  }
  const decals: [string, () => Mesh][] = [
    ['a bullet mark', bulletMark], ['a footprint', footprint], ['a clipped scorch', () => scorch(true)], ['a bare-square scorch', () => scorch(false)],
  ];

  it('the fixture: the last env pass sits at the walk order the gap allows (rank 8191)', () => {
    expect(world().lastEnv.renderOrder).toBeCloseTo(LAST_ORDER * S + 0.75, 12);
  });

  for (const [name, make] of decals) {
    it(`${name} sorts after every blended walk draw, detail pass and env pass (three's order)`, () => {
      const decal = make();
      for (const [what, m] of world().walk) expect(decal.renderOrder, what).toBeGreaterThan(m.renderOrder);
    });
  }

  it('the particle batches sort after the walk\'s blended draws and their passes, and before the alpha pass and the shadows', () => {
    const { walk, window, shadow } = world();
    expect(window.renderOrder).toBe(1);
    expect(shadow.renderOrder).toBe(1);
    for (const b of particleBatches()) {
      for (const [what, m] of walk) expect(b.renderOrder, `${b.name} after ${what}`).toBeGreaterThan(m.renderOrder);
      expect(b.renderOrder, `${b.name} before the alpha pass`).toBeLessThan(window.renderOrder);
      expect(b.renderOrder, `${b.name} before the shadows`).toBeLessThan(shadow.renderOrder);
    }
  });

  it('with the engine order on, the alpha pass and the shadows still sort after the particles and the decals', () => {
    const { view, window, shadow } = world();
    view.setEngineOrder(true);
    // `setEngineOrder` renumbers only once a frame has seen the camera (`lastCamera.seen`, set by the frame hook).
    const camera = new PerspectiveCamera();
    camera.position.set(0, 15, 0);
    camera.updateMatrixWorld();
    view.frame(camera, 0);
    // The engine order numbers the alpha pass `base + i` after the walk (`world.ts` `reorderAlphaPass`): six draws, two
    // in the pass (the window, the shadow), so 4 and 5 -- not their rest order 1.
    expect([window.renderOrder, shadow.renderOrder].sort()).toEqual([4, 5]);
    const top = Math.max(WALK_DECAL_RENDER_ORDER, ...particleBatches().map((b) => b.renderOrder));
    expect(window.renderOrder).toBeGreaterThan(top);
    expect(shadow.renderOrder).toBeGreaterThan(top);
  });
});
