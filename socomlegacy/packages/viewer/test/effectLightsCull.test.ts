import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, OneMinusSrcAlphaFactor, PerspectiveCamera, Vector3, type Object3D } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { ZAnimLight } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { EffectLights, LIGHT_BOUND, spot, spotBorderClear } from '../src/effectLights';

/**
 * CPS overlay cull (product track, a browser adaptation that changes no pixel): an effect light's overlay is drawn only
 * where one of its pass's lights can still touch a pixel -- the light's bound sphere (`LIGHT_BOUND` times its range now)
 * meets the frustum the render draws with and, for a plain mesh, the overlay's own world box. Three asks each overlay
 * `intersectsFrustum` at its projection; `drawn` below does what three's `_projectObject` does with the answer.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(HERE, '../../../test-fixtures'));
const FIXTURE_MAPS = (['MP2', 'MP6', 'MP72'] as const).filter((m) => fixture(`RUN/${m}.ZDB`));

const light = (blend: number, ranges: [number, number, number][]): ZAnimLight => ({
  flags: 0, node: null, atContext: false, offset: [0, 0, 0], rgb: [255, 200, 120], opacity: 64, blend, ranges, duration: 1,
} as unknown as ZAnimLight);

/** A flat quad in the XZ plane at `y`, `half` across each way around (cx, cz). */
function quad(cx: number, y: number, cz: number, half: number): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([
    cx - half, y, cz - half, cx + half, y, cz - half, cx + half, y, cz + half,
    cx - half, y, cz - half, cx + half, y, cz + half, cx - half, y, cz + half,
  ], 3));
  return new Mesh(g, new MeshBasicMaterial());
}

function box(x: number, y: number, z: number, size = 1): Mesh {
  const m = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  m.position.set(x, y, z);
  return m;
}

function rig(meshes: Mesh[]): { lights: EffectLights; world: Group } {
  const lights = new EffectLights();
  const world = new Group();
  for (const m of meshes) world.add(m);
  lights.setReceivers(() => [world]);
  lights.setTexture(null);
  lights.warmMeshes();
  lights.warmHide();
  lights.warmDone();
  return { lights, world };
}

/** The frustum three's renderer builds for `camera` (`Renderer._renderScene`, `setFromProjectionMatrix`). */
function frustumOf(camera: PerspectiveCamera): Frustum {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
}

function camera(at: [number, number, number], look: [number, number, number], fov = 60): PerspectiveCamera {
  const c = new PerspectiveCamera(fov, 16 / 9, 0.1, 5000);
  c.position.set(...at);
  c.lookAt(new Vector3(...look));
  return c;
}

/** The overlays shown (visible, their parents too). */
function shown(world: Object3D): Mesh[] {
  const out: Mesh[] = [];
  world.updateMatrixWorld(true);
  world.traverseVisible((o) => { if (o.userData.effectLightPass) out.push(o as Mesh); });
  return out;
}

/** Three's projection: a shown overlay is drawn unless it is frustum-culled and says it misses the frustum. */
function drawn(world: Object3D, frustum: Frustum): Mesh[] {
  return shown(world).filter((o) => !o.frustumCulled || o.intersectsFrustum(frustum));
}

describe('CPS overlay cull: an overlay that cannot touch a visible pixel is not drawn', () => {
  it('a light inside the frustum draws the same overlays as before the cull (count and identity)', () => {
    const near = box(0, 0, 0), side = box(3, 0, 0), floor = quad(0, -0.5, 0, 200);
    const { lights, world } = rig([near, side, floor]);
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [0, 1, 0], () => true);
    const before = shown(world);
    expect(before.length).toBe(3);
    const after = drawn(world, frustumOf(camera([0, 2, 20], [0, 0, 0])));
    expect(after.length).toBe(before.length);
    after.forEach((o, i) => expect(o).toBe(before[i]));
    expect(lights.stats()).toMatchObject({ overlays: 3, culled: 0 });
  });

  it('a light whose bound sphere is wholly outside the frustum draws none of its overlays; the stats count them culled', () => {
    const near = box(0, 0, 0), side = box(3, 0, 0), floor = quad(0, -0.5, 0, 200);
    const { lights, world } = rig([near, side, floor]);
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [0, 1, 0], () => true);
    expect(shown(world).length).toBe(3);
    expect(drawn(world, frustumOf(camera([0, 2, 20], [0, 2, 40])))).toEqual([]);   // looking away
    expect(lights.stats()).toMatchObject({ overlays: 3, culled: 3 });
    lights.update(0.01);                                                              // a refresh forgets the last verdicts
    expect(lights.stats()).toMatchObject({ overlays: 3, culled: 0 });
  });

  it('a muzzle light (0x44) culls the same way, in its own pass', () => {
    const { lights, world } = rig([box(0, 0, 0)]);
    lights.begin(light(0x44, [[0, 5, 15], [1, 50, 100]]), [0, 1, 0], () => true);
    expect(shown(world).length).toBe(1);
    expect(drawn(world, frustumOf(camera([0, 2, 200], [0, 2, 400])))).toEqual([]);
    expect(drawn(world, frustumOf(camera([0, 2, 200], [0, 0, 0])))).toHaveLength(1);
  });

  it("a chunk whose sphere meets the light's reach but whose box misses its bound sphere is not drawn", () => {
    // A ceiling 10 above the light: its sphere (radius ~28) meets the reach 5, its box is 10 away, past 1.25 x 5.
    const ceiling = quad(0, 11, 0, 20), floor = quad(0, -0.5, 0, 20);
    const { lights, world } = rig([ceiling, floor]);
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [0, 1, 0], () => true);
    expect(shown(world).length).toBe(2);                                              // both wanted, as before
    const f = frustumOf(camera([0, 2, 30], [0, 2, 0]));
    const d = drawn(world, f);
    expect(d).toHaveLength(1);
    expect(d[0]!.geometry).toBe(floor.geometry);
    expect(lights.stats()).toMatchObject({ overlays: 2, culled: 1 });
  });

  it('the box test follows the range NOW, not the widest: a shrinking light lets a chunk go', () => {
    const plate = quad(0, -2, 0, 1);                                                  // 3 below the light
    const { lights, world } = rig([plate]);
    lights.begin(light(0x48, [[0, 0, 5], [0.2, 0, 1]]), [0, 1, 0], () => true);
    const f = frustumOf(camera([0, 2, 30], [0, 0, 0]));
    expect(drawn(world, f)).toHaveLength(1);                                          // 3 < 1.25 x 5
    lights.update(0.2);
    expect(shown(world)).toHaveLength(1);                                             // still wanted
    expect(drawn(world, f)).toHaveLength(0);                                          // 3 > 1.25 x 1
  });

  it("an overlay is kept while ANY light of its pass can touch it -- one moved in after its reach was chosen too", () => {
    // The strip is wanted by A (off screen, it reaches the strip's far end); B began far off (reaching nothing) and its
    // place moved over the strip's middle (a muzzle light that rides the gun): the additive pass draws B there.
    const strip = quad(0, -0.5, 0, 50);
    const { lights, world } = rig([strip]);
    const f = frustumOf(camera([0, 1, 10], [0, 0, 0], 30));
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [45, 0, 45], () => true);
    expect(drawn(world, f)).toHaveLength(0);                                          // A alone: off screen
    let at: [number, number, number] = [-1000, 0, 0];
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), at, () => true, () => at);
    at = [0, 0.5, 0];
    lights.update(0.01);
    expect(drawn(world, f)).toHaveLength(1);
  });

  it("another pass's light keeps nothing of this pass: an off-screen 0x48 beside an on-screen 0x44 draws the 0x44 overlay alone", () => {
    const strip = quad(0, -0.5, 0, 50);
    const { lights, world } = rig([strip]);
    const f = frustumOf(camera([0, 1, 10], [0, 0, 0], 30));
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [45, 0, 45], () => true);
    lights.begin(light(0x44, [[0, 0, 5], [1, 0, 5]]), [0, 0.5, 1], () => true);
    expect(shown(world)).toHaveLength(2);
    const d = drawn(world, f);
    expect(d).toHaveLength(1);
    expect(d[0]!.material).not.toBe(shown(world).find((o) => o !== d[0])!.material);
    expect((d[0]!.material as { blendDst: number }).blendDst).toBe(OneMinusSrcAlphaFactor);   // the lerped pass, not the additive (One)
  });

  it("the pre-warm's overlays are never culled (the compile must see them all)", () => {
    const lights = new EffectLights();
    const world = new Group();
    world.add(box(0, 0, 0), box(50, 0, 0));
    lights.setReceivers(() => [world]);
    lights.setTexture(null);
    lights.warmMeshes();
    const f = frustumOf(camera([0, 2, 20], [0, 2, 40]));
    expect(shown(world)).toHaveLength(4);
    expect(drawn(world, f)).toHaveLength(4);
  });

  it("a spot whose rim is not clear (the HD pack's, or a disc's) culls nothing: the bound needs the rim's zero", () => {
    const lights = new EffectLights();
    const world = new Group();
    world.add(box(0, 0, 0));
    lights.setReceivers(() => [world]);
    const n = 4, data = new Uint8ClampedArray(n * n * 4).fill(255);
    lights.setTexture({ rgba: { width: n, height: n, data }, gs: null } as never);
    lights.warmMeshes(); lights.warmHide(); lights.warmDone();
    lights.begin(light(0x48, [[0, 0, 5], [1, 0, 5]]), [0, 1, 0], () => true);
    expect(drawn(world, frustumOf(camera([0, 2, 20], [0, 2, 40])))).toHaveLength(1);
    expect(spotBorderClear({ width: n, height: n, data })).toBe(false);
    expect(spotBorderClear(spot())).toBe(true);
  });
});

/** The pass's arithmetic per fragment, as `passMaterial` writes it in TSL (the source pins below hold the text). */
function contribution(P: Vector3, N: Vector3, at: Vector3, rMin: number, rMax: number, img: { width: number; height: number; data: ArrayLike<number> }): number {
  const L = at.clone().sub(P);
  const h = Math.max(L.dot(N), 0);
  const f = Math.min(Math.max((rMax - h) / Math.max(rMax - rMin, 1e-4), 0), 1) * 0.5;
  const gate = Math.min(h, 1);
  const helper = Math.abs(N.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const T = helper.clone().cross(N).normalize();
  const B = N.clone().cross(T);
  const u = L.dot(T) / Math.max(rMax, 1e-4) + 0.5, v = L.dot(B) / Math.max(rMax, 1e-4) + 0.5;
  // A linear fetch, clamped to the edge (`ClampToEdgeWrapping`, `LinearFilter`, level 0).
  const { width: w, height: hh, data } = img;
  const x = u * w - 0.5, y = v * hh - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = (i: number, j: number) => data[((Math.min(Math.max(j, 0), hh - 1) * w) + Math.min(Math.max(i, 0), w - 1)) * 4 + 3]! / 255;
  const alpha = (a(x0, y0) * (1 - fx) + a(x0 + 1, y0) * fx) * (1 - fy) + (a(x0, y0 + 1) * (1 - fx) + a(x0 + 1, y0 + 1) * fx) * fy;
  return Math.min(Math.max(alpha * 0.5 * f * gate, 0), 1);
}

describe("CPS overlay cull: the pass is exactly zero beyond LIGHT_BOUND x its range (the cull's exactness)", () => {
  const src = readFileSync(resolve(HERE, '../src/effectLights.ts'), 'utf8');

  it('the falloff, the gate, the spot uv, the clamp and the plain fetch are the expressions the bound is argued from', () => {
    expect(src).toContain('const h = max(dot(L, N), 0);');
    expect(src).toContain('const f = clamp(u.rMax.sub(h).div(max(u.rMax.sub(u.rMin), 1e-4)), 0, 1).mul(0.5);');
    expect(src).toContain('const gate = min(h, 1);');
    expect(src).toContain('const uv = vec2(dot(L, T), dot(L, B)).div(max(u.rMax, 1e-4)).add(0.5);');
    expect(src).toContain('const texel = textureNode(map, uv).level(float(0));');
    expect(src).toContain('const as = clamp(texel.a.mul(u.opacity).mul(f).mul(gate).mul(mine), 0, 1);');
    expect(src).toContain('tex.wrapS = ClampToEdgeWrapping;');
    expect(src).toContain('tex.wrapT = ClampToEdgeWrapping;');
    expect(LIGHT_BOUND).toBeGreaterThan(Math.sqrt(1.5));   // h < rMax, |L.T|, |L.B| <= rMax / 2: |L|^2 <= 1.5 rMax^2
  });

  it('over random points and normals, nothing beyond the bound lights; inside it something does', () => {
    const img = spot();
    expect(spotBorderClear(img)).toBe(true);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const unit = () => { const v = new Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); return v.lengthSq() > 1e-6 ? v.normalize() : new Vector3(0, 1, 0); };
    const at = new Vector3(3, 1, -2);
    let lit = 0;
    for (let i = 0; i < 20000; i++) {
      const rMax = 0.5 + rnd() * 50, rMin = rnd() * rMax, N = unit();
      const far = at.clone().add(unit().multiplyScalar(LIGHT_BOUND * rMax * (1 + rnd() * 2)));
      expect(contribution(far, N, at, rMin, rMax, img)).toBe(0);
      const near = at.clone().sub(N.clone().multiplyScalar(rMax * 0.5));               // under the light, half its range
      if (contribution(near, N, at, rMin, rMax, img) > 0) lit++;
    }
    expect(lit).toBe(20000);
  });
});

describe.skipIf(FIXTURE_MAPS.length === 0)(`CPS overlay cull: the disc's light_map.tif has a clear rim${FIXTURE_MAPS.length ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it(`on every fixture map (${FIXTURE_MAPS.join(', ')}): its edge texels' alpha is 0, so the cull engages on the game's spot`, async () => {
    for (const m of FIXTURE_MAPS) {
      const data = await effectsFromDisc(new FsAssetSource(FIXTURES), `RUN/${m}.ZDB`, m);
      const t = data.textures.find(([n]) => n.toLowerCase() === 'light_map.tif')?.[1];
      expect(t, m).toBeDefined();
      expect(spotBorderClear(t!.rgba), m).toBe(true);
    }
  }, 60_000);
});
