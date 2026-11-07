import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_GRID_PARAMS, type ParticleSource } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';
import { ParticleSystem } from '../src/particles';
import {
  ALPHA_PASS_REST_ORDER, alphaDetailOrder, alphaEnvOrder, alphaItemOrder, particleBucketOrder, particleSlot,
} from '../src/alphaInterleave';

/**
 * LATER 593 with water named (INV-WATER-LOOK F1-F3; research 330 `ENV_PASS_PLACE_READING`, research 89 §20): the
 * console's alpha pass `FUN_00336cb0` walks its list far to near (`FUN_00336f60` keeps it sorted by the key at `+0x40`,
 * D:L235220-235255) and, before each item, drains every particle whose key is above the item's (D:L235150-235153:
 * `item+0x40 < next particle's key` -> `FUN_00324c70(particle key, item key)`, the second argument the item's key in
 * `$f13`, read at the disassembly, 0x336d48-0x336d58), the rest after the loop (`FUN_003250b0`, D:L235177). The key of
 * an item is its centroid's range squared times the camera's `+0x2c8` (`FUN_003371b0` D:L235314-235317 ->
 * `FUN_00290aa0` D:L137047-137059); a particle's is its plain range squared (`FUN_00327910` D:L225490-225494, stored at
 * `+0x1c`, D:L225599). The reflection is in its visual's own list, right after its base (`FUN_003b5b90`
 * D:L307758-307779 via `FUN_003b4580`).
 *
 * three sorts its transparent list by `renderOrder` first (`reversePainterSortStable`), so the port numbers each item
 * and each particle bucket between them.
 */

describe('the alpha pass and the particles on one key (pure)', () => {
  // The water at range² 400 (20 units), a glow behind it at 900 (30 units): keys far to near.
  const keys = Float64Array.from([900, 400]);
  const water = alphaItemOrder(1, 2), glow = alphaItemOrder(0, 2);

  it('a particle nearer than the water draws after it', () => {
    const slot = particleSlot(keys, 100);              // 10 units: nearer than both
    expect(slot).toBe(2);
    expect(particleBucketOrder(slot, 2)).toBeGreaterThan(water);
  });

  it('a particle farther than the water draws before it, after the glow farther still', () => {
    const slot = particleSlot(keys, 625);              // 25 units: between the glow and the water
    expect(slot).toBe(1);
    expect(particleBucketOrder(slot, 2)).toBeLessThan(water);
    expect(particleBucketOrder(slot, 2)).toBeGreaterThan(glow);
    expect(particleBucketOrder(slot, 2)).toBeGreaterThan(alphaDetailOrder(0, 2));   // after the glow's own passes
    expect(particleBucketOrder(particleSlot(keys, 1e6), 2)).toBeLessThan(glow);     // farther than every item: first
  });

  it('a particle at an item\'s own key draws after it: the drain is strict (`item key < particle key`)', () => {
    expect(particleSlot(keys, 400)).toBe(2);
    expect(particleSlot(keys, 900)).toBe(1);
  });

  it('the reflection sits right after its base and before its detail pass; every number of the pass in [1, 2)', () => {
    for (const n of [0, 1, 2, 50, 4000]) {
      for (let r = 0; r < Math.min(n, 60); r++) {
        const item = alphaItemOrder(r, n);
        expect(alphaEnvOrder(r, n)).toBeGreaterThan(item);
        expect(alphaDetailOrder(r, n)).toBeGreaterThan(alphaEnvOrder(r, n));
        expect(particleBucketOrder(r, n)).toBeLessThan(item);
        if (r > 0) expect(particleBucketOrder(r, n)).toBeGreaterThan(alphaDetailOrder(r - 1, n));
      }
      expect(particleBucketOrder(0, n)).toBeGreaterThanOrEqual(ALPHA_PASS_REST_ORDER);
      expect(particleBucketOrder(n, n)).toBeLessThan(ALPHA_PASS_REST_ORDER + 1);
      if (n > 0) expect(particleBucketOrder(n, n)).toBeGreaterThan(alphaDetailOrder(n - 1, n));
    }
  });
});

const tri = (x: number, z: number): Float32Array => new Float32Array([x, 0, z, x + 1, 0, z, x, 0, z + 1]);
const NORMALS = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
  positions: tri(0, 0), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
  indices: new Uint32Array([0, 1, 2]), textureName, fog: true, lit: false, order, orderEnd: order, cull: true,
  alternate: false, scroll: null, ...extra,
});
const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
const graded: TextureFlags = { bilinear: true, transparent: true, graded: true, opaque: false, gs: null };
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };

/** MP12's case in small: a pool in the alpha pass with its reflection, a glow behind it, a second glow beside it. */
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: DEFAULT_GRID_PARAMS, slots: [],
  world: [
    part('rock.tif', 0, { positions: tri(0, -100) }),
    part('water.tif', 256, { alphaPass: true, reflect: 1, normals: NORMALS, positions: tri(0, -20), centre: [0.5, 0, -19.5] }),
    part('glow.tif', 512, { alphaPass: true, positions: tri(0, -30), centre: [0.5, 0, -29.5] }),
    part('glow.tif', 768, { alphaPass: true, positions: tri(0, -30), centre: [0.5, 0, -29.5] }),   // the same range: a tie
  ],
  props: [],
  textures: { 'rock.tif': rgba(255), 'water.tif': rgba(100), 'glow.tif': rgba(128), 'sky01.tif': rgba(255) },
  textureFlags: { 'rock.tif': solid, 'water.tif': graded, 'glow.tif': graded, 'sky01.tif': solid },
  envMaterials: [{ index: 0, rgba: [128, 128, 128, 0], uvScale: 0.5, rimOffset: 0, rimSlope: 1, texture: 'sky01.tif' }],
  detail: {},
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
});

/** three's transparent-list comparator (`reversePainterSortStable`, three 0.186): renderOrder, then z far first, then id. */
const drawList = (meshes: Mesh[], camera: PerspectiveCamera): Mesh[] => {
  const z = (m: Mesh) => new Vector3().setFromMatrixPosition(m.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
  return [...meshes].sort((a, b) => a.renderOrder - b.renderOrder || z(a) - z(b) || a.id - b.id);
};

/** One probe particle source (walkDecalOrder.test.ts's): one puff, a second's life, at `at`. */
function source(): ParticleSource {
  return {
    flagsA: 0x3, flagsB: 0, name: 'probe', setActive: true, node: -6, follow: false, perEvent: 1, events: 1, interval: 0.01,
    perDistance: false, type: 0, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
    baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
    atNode: true, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
    friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [10, 10], nearFade: null, farFade: null, textures: [], textureMode: 'first',
    texture: 'ripple.tif', colours: [[0, 0.4, 0.4, 0.4, 0.6], [1, 0.4, 0.4, 0.4, 0.6]], scales: [],
  };
}

function setUp() {
  const view = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const water = meshes.find((m) => m.name === 'water.tif')!;
  const env = water.children.find((c): c is Mesh => c instanceof Mesh && c.name.endsWith(' (env)'))!;
  const [glowA, glowB] = meshes.filter((m) => m.name === 'glow.tif');
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  const at = (x: number, y: number, z: number, magnification = 1) => {
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, -100);
    camera.updateMatrixWorld();
    view.frame(camera, 0, { magnification, farExtra: 0 });
  };
  /** A particle system on the world's alpha pass, one puff at each of `places`. */
  const particlesAt = (...places: [number, number, number][]) => {
    const ps = new ParticleSystem(() => 0.5);
    ps.setAlphaPass(view.alphaPass ?? null);
    for (const [i, p] of places.entries()) ps.emit(source(), new Matrix4().makeTranslation(...p), {}, `run${i}`, () => true);
    ps.update(0.01, camera);
    ps.update(0.01, camera);
    return ps.object.children.filter((c): c is Mesh => c instanceof Mesh && c.visible);
  };
  return { view, water: water!, env: env!, glowA: glowA!, glowB: glowB!, camera, at, particlesAt, meshes };
}

describe('the world numbers its alpha pass by the console\'s key every frame (F1, F3)', () => {
  it('far to near by the range to each item\'s centroid, at its own number in [1, 2)', () => {
    const { water, glowA, glowB, at } = setUp();
    at(0.5, 2, 0);
    expect(water.renderOrder).toBeGreaterThan(glowA.renderOrder);
    expect(water.renderOrder).toBeGreaterThan(glowB.renderOrder);
    for (const m of [water, glowA, glowB]) { expect(m.renderOrder).toBeGreaterThanOrEqual(1); expect(m.renderOrder).toBeLessThan(2); }
  });

  it('keeps two items at one range in the walk\'s order, frame after frame, under small camera moves (no flicker)', () => {
    const { glowA, glowB, at } = setUp();
    for (let i = 0; i < 20; i++) {
      at(0.5 + Math.sin(i) * 0.01, 2 + Math.cos(i) * 0.01, 0);
      expect(glowA.renderOrder).toBeLessThan(glowB.renderOrder);
    }
  });

  it('the reflection immediately follows its base in the frame\'s draw list (F2)', () => {
    const { water, env, camera, at, meshes, particlesAt } = setUp();
    at(0.5, 2, 0);
    const puffs = particlesAt([0.5, 1, -10], [0.5, 1, -25], [0.5, 1, -40]);
    const all = [...meshes.filter((m) => (m.material as { transparent: boolean }).transparent), ...meshes.flatMap((m) => m.children.filter((c): c is Mesh => c instanceof Mesh)), ...puffs];
    all.forEach((m) => m.updateMatrixWorld());
    const list = drawList(all, camera);
    expect(list.indexOf(env)).toBe(list.indexOf(water) + 1);
  });
});

describe('the particles drawn between the alpha items by range (F1)', () => {
  it('a puff nearer than the water draws after it; one between the water and the glows before it; one behind all first', () => {
    const { water, glowA, glowB, env, at, particlesAt } = setUp();
    at(0.5, 2, 0);
    const [near, mid, far] = particlesAt([0.5, 1, -10], [0.5, 1, -25], [0.5, 1, -40])
      .sort((a, b) => b.renderOrder - a.renderOrder);
    expect(near!.renderOrder).toBeGreaterThan(env.renderOrder);
    expect(mid!.renderOrder).toBeLessThan(water.renderOrder);
    expect(mid!.renderOrder).toBeGreaterThan(Math.max(glowA.renderOrder, glowB.renderOrder));
    expect(far!.renderOrder).toBeLessThan(Math.min(glowA.renderOrder, glowB.renderOrder));
  });

  it('keys the items over the magnification and the particles not (`+0x2c8`, research 232 §1)', () => {
    const { water, at, particlesAt } = setUp();
    // Water at range ~19.6, a puff at ~25: before the water unzoomed. At x4 the water's key is range²/4 (~9.8²),
    // the puff's stays 25², so the puff still draws before the water; one at range 15 draws after it unzoomed and
    // before it zoomed (15² > 19.6²/4).
    at(0.5, 2, 0, 4);
    const [puff] = particlesAt([0.5, 1, -15]);
    expect(puff!.renderOrder).toBeLessThan(water.renderOrder);
    at(0.5, 2, 0, 1);
    const [same] = particlesAt([0.5, 1, -15]);
    expect(same!.renderOrder).toBeGreaterThan(water.renderOrder);
  });

  it('without an alpha pass the batches keep their place under it (`PARTICLE_BATCH_RENDER_ORDER`)', () => {
    const ps = new ParticleSystem(() => 0.5);
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld();
    ps.emit(source(), new Matrix4().makeTranslation(0, 0, -10), {}, 'run', () => true);
    ps.update(0.01, camera);
    ps.update(0.01, camera);
    const [batch] = ps.object.children.filter((c): c is Mesh => c instanceof Mesh && c.visible);
    expect(batch!.renderOrder).toBeLessThan(ALPHA_PASS_REST_ORDER);
  });

  it("without an alpha pass many puffs stay one batch per texture, never one mesh each (the review's F1)", () => {
    const ps = new ParticleSystem(() => 0.5);
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld();
    for (let k = 0; k < 40; k++) ps.emit(source(), new Matrix4().makeTranslation((k % 8) - 4, 0, -10 - k), {}, 'run' + k, () => true);
    ps.update(0.01, camera);
    ps.update(0.01, camera);
    const batches = ps.object.children.filter((c): c is Mesh => c instanceof Mesh && c.visible);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.renderOrder).toBeLessThan(ALPHA_PASS_REST_ORDER);
  });
});
