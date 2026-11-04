import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Color, type ColorRepresentation, Frustum, Matrix4, type Object3D, PerspectiveCamera, Quaternion, Scene, SkinnedMesh, Sphere, Vector3,
  type Camera,
} from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { characterTableFor, loadBody, type LoadedBody } from '../src/body';
import { buildBody, type BodyView } from '../src/bodyView';
import { CharacterShadow, SHADOW_LAYER, type ShadowRenderer } from '../src/charShadow';
import { bodiesInView } from '../src/frameHash';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * CPS H9, the body cull (plan 2026-11-02-client-performance-sprint, Log 2026-11-03T01:19Z part (1); a CPU-side browser
 * adaptation that changes no pixel): a body's skinned sub-meshes carry a bound that follows the pose -- per bone, the
 * farthest vertex the bone weighs, carried by the bone's world matrix -- so three's frustum test drops a sub-mesh wholly
 * out of view, and never one with a vertex in view. The bones are still posed every frame (CPS.R9 (e)).
 *
 * The reference for "where the vertex is drawn" is three r186's own CPU skinning, `SkinnedMesh.getVertexPosition` (the
 * GPU's `getSkinnedPosition` formula, `nodes/accessors/Skinning.js`), carried by the mesh's world matrix; the sphere is
 * the one three's `Frustum.intersectsObject` tests (`object.boundingSphere` through `matrixWorld`).
 */

/** mulberry32: a seeded sequence, so every run poses the same bodies. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const I = (): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/**
 * A synthetic body: a five-bone chain (two arms off the spine) and three sub-meshes, each vertex weighed by one to four
 * bones with positive weights that sum to one in float32 (as `topInfluences` writes them), the vertices spread over a
 * SEAL-sized box (19 units tall).
 */
function syntheticBody(seed: number, weights?: (v: number, w: Float32Array) => void): LoadedBody {
  const r = rng(seed);
  const names = ['skel_root', 'spine', 'larm', 'rarm', 'head'];
  const parents = [-1, 0, 1, 1, 1];
  const offsets: [number, number, number][] = [[0, 9, 0], [0, 4, 0], [-3, 3, 0], [3, 3, 0], [0, 5, 0]];
  const world: Matrix4[] = [];
  const parts = names.map((name, i) => {
    const local = new Matrix4().makeTranslation(...offsets[i]!);
    world[i] = parents[i]! < 0 ? local.clone() : world[parents[i]!]!.clone().multiply(local);
    return { name, parent: parents[i]!, bindLocal: Float32Array.from(local.elements), bindWorld: Float32Array.from(world[i]!.elements), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) };
  });
  const subMeshes = [0, 1, 2].map((s) => {
    const n = 40 + s * 7;
    const positions = new Float32Array(n * 3), skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      positions[v * 3] = (r() - 0.5) * 10; positions[v * 3 + 1] = r() * 19.4; positions[v * 3 + 2] = (r() - 0.5) * 6;
      const k = 1 + Math.floor(r() * 4);
      const raw = Array.from({ length: k }, () => 0.05 + r());
      const sum = raw.reduce((a, b) => a + b, 0);
      const used = new Set<number>();
      for (let i = 0; i < k; i++) {
        let b = Math.floor(r() * names.length);
        while (used.has(b)) b = (b + 1) % names.length;
        used.add(b);
        skinIndex[v * 4 + i] = b;
        skinWeight[v * 4 + i] = raw[i]! / sum;
      }
      if (weights) weights(v, skinWeight.subarray(v * 4, v * 4 + 4));
    }
    const indices = new Uint32Array(Math.floor(n / 3) * 3).map((_, i) => i);
    return { textureName: null, fog: false, positions, normals: new Float32Array(n * 3).fill(0.5), uvs: new Float32Array(n * 2), indices, skinIndex, skinWeight };
  });
  return {
    character: 'synthetic', model: 'synthetic', dressedBy: 'test', textureAsset: 'none', parts, subMeshes,
    fittings: [], missing: [], at: null, height: 19.4, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 0, triangles: 0, parts: names.length, subMeshes: 3, batches: 3, maxInfluences: 4, droppedWeight: 0, fittings: 0 },
  } as unknown as LoadedBody;
}

const MAP = { textures: {}, textureFlags: {} };

const skinnedOf = (view: BodyView): SkinnedMesh[] => view.group.getObjectsByProperty('isSkinnedMesh', true) as SkinnedMesh[];

/**
 * A pose: every part's local matrix a rotation, a translation near its bind offset and a scale -- uniform or not, so
 * the bones' world matrices carry a shear (a chain of non-uniform scales under rotations). The bound must hold for
 * any pose; the animator's own (rotation and translation, `partMatrixInto`) are a subset.
 */
function pose(view: BodyView, body: LoadedBody, r: () => number, scaled: boolean): void {
  const q = new Quaternion(), p = new Vector3(), s = new Vector3(), m = new Matrix4();
  const locals = body.parts.map((part) => {
    const bind = new Matrix4().fromArray(part.bindLocal);
    p.setFromMatrixPosition(bind).add(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(4));
    q.set(r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    if (scaled) s.set(0.5 + r(), 0.5 + r(), 0.5 + r()); else s.set(1, 1, 1);
    return Float32Array.from(m.compose(p, q, s).elements);
  });
  view.setPose(locals);
  view.place([(r() - 0.5) * 6000, (r() - 0.5) * 400, (r() - 0.5) * 6000], r() * 360);
  view.group.updateMatrixWorld(true);              // the scene's update, as three's render makes it
}

/** Every vertex as three draws it, in the world: its CPU skinning (the GPU's formula) through the mesh's world matrix. */
function drawnVertices(mesh: SkinnedMesh): Vector3[] {
  const out: Vector3[] = [];
  const count = mesh.geometry.getAttribute('position').count;
  for (let i = 0; i < count; i++) out.push(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
  return out;
}

/** The sphere three's frustum test reads (`Frustum.intersectsObject`): the object's own, through its world matrix. */
function testedSphere(mesh: SkinnedMesh): Sphere {
  return mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
}

const frustumOf = (camera: Camera): Frustum => {
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
};

/** Any of the points on the inner side of every plane (three's `containsPoint`). */
const anyInside = (f: Frustum, points: readonly Vector3[]): boolean => points.some((v) => f.containsPoint(v));

describe('CPS H9 body cull: a skinned sub-mesh carries a pose-following bound (a CPU-side adaptation, no pixel changed)', () => {
  it('every skinned sub-mesh is frustum-culled by its own sphere, the geometry\'s left as the depth sort\'s key', () => {
    const view = buildBody(syntheticBody(1), MAP, DEFAULT_LIGHTING);
    const skinned = skinnedOf(view);
    expect(skinned).toHaveLength(3);
    for (const m of skinned) {
      expect(m.frustumCulled).toBe(true);
      expect(m.boundingSphere).toBeInstanceOf(Sphere);
      expect(m.geometry.morphAttributes['position']).toBeUndefined();
      expect(m.bindMatrix.equals(new Matrix4())).toBe(true);            // bound at the model origin (bodyView)
    }
    view.dispose();
  });

  it('(a) containment: over 60 poses (rotated, moved, scaled non-uniformly, placed across a map), every drawn vertex lies in the sphere three tests', () => {
    const r = rng(7);
    for (const scaled of [false, true]) {
      const body = syntheticBody(2);
      const view = buildBody(body, MAP, DEFAULT_LIGHTING);
      const f = new Frustum();
      let worst = -Infinity;
      for (let step = 0; step < 30; step++) {
        pose(view, body, r, scaled);
        for (const m of skinnedOf(view)) {
          m.intersectsFrustum(f);                                        // the seam: the bound is made at the test
          const s = testedSphere(m);
          for (const v of drawnVertices(m)) {
            const d = v.distanceTo(s.center);
            worst = Math.max(worst, d / s.radius);
            expect(d).toBeLessThanOrEqual(s.radius);
          }
        }
      }
      expect(worst).toBeGreaterThan(0.3);                               // the bound is not vacuous
      view.dispose();
    }
  });

  it('(b) three\'s test with the bound never culls a sub-mesh that has a vertex in view, over a sweep of 400 cameras; it does cull some', () => {
    const r = rng(11);
    const body = syntheticBody(3);
    const view = buildBody(body, MAP, DEFAULT_LIGHTING);
    const camera = new PerspectiveCamera(60, 16 / 9, 1, 5000);
    let culled = 0, kept = 0;
    for (let step = 0; step < 400; step++) {
      if (step % 20 === 0) pose(view, body, r, step % 40 === 0);
      const at = view.group.position;
      const dir = new Vector3(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
      camera.position.copy(at).addScaledVector(dir, 4 + r() * 120);
      camera.lookAt(new Vector3(at.x + (r() - 0.5) * 400, at.y + (r() - 0.5) * 60, at.z + (r() - 0.5) * 400));
      const f = frustumOf(camera);
      for (const m of skinnedOf(view)) {
        const hit = m.intersectsFrustum(f);
        if (anyInside(f, drawnVertices(m))) expect(hit).toBe(true);
        if (hit) kept++; else culled++;
      }
    }
    expect(culled).toBeGreaterThan(50);
    expect(kept).toBeGreaterThan(50);
    view.dispose();
  });

  it('(c) a body wholly behind the camera is culled: every sub-mesh\'s sphere outside the frustum', () => {
    const body = syntheticBody(4);
    const view = buildBody(body, MAP, DEFAULT_LIGHTING);
    pose(view, body, rng(5), false);
    const camera = new PerspectiveCamera(60, 16 / 9, 1, 5000);
    const at = view.group.position.clone();
    camera.position.copy(at).add(new Vector3(0, 10, 60));
    camera.lookAt(at.clone().add(new Vector3(0, 10, 200)));            // looking away from the body
    const f = frustumOf(camera);
    for (const m of skinnedOf(view)) {
      expect(m.frustumCulled).toBe(true);
      expect(anyInside(f, drawnVertices(m))).toBe(false);
      expect(m.intersectsFrustum(f)).toBe(false);
    }
    // the gate's count (`./frameHash` `bodiesInView`) reads the same test: the body is not in view; turned round, it is
    view.setVisible(true);
    expect(bodiesInView(camera, [{ id: 1, group: view.group }]).count).toBe(0);
    camera.lookAt(at.clone().add(new Vector3(0, 10, 0)));
    expect(bodiesInView(camera, [{ id: 1, group: view.group }]).count).toBe(1);
    view.dispose();
  });

  it('(d) the local actor under the shadow\'s own fitted camera still draws every sub-mesh, while the main camera culls them', () => {
    const body = syntheticBody(6);
    const view = buildBody(body, MAP, DEFAULT_LIGHTING);
    view.setVisible(true);
    const scene = new Scene();
    scene.add(view.group);
    pose(view, body, rng(9), false);
    // The main camera looks away: the sub-meshes are culled for it.
    const main = new PerspectiveCamera(60, 16 / 9, 1, 5000);
    main.position.copy(view.group.position).add(new Vector3(0, 10, 60));
    main.lookAt(view.group.position.clone().add(new Vector3(0, 10, 200)));
    const projected = (camera: Camera): SkinnedMesh[] => {
      // three r186 `Renderer._projectObject` for a mesh: visible (an ancestor hidden stops it), on the camera's layers,
      // then `!frustumCulled || intersectsFrustum(frustum)` with the pass's camera.
      const f = frustumOf(camera), out: SkinnedMesh[] = [];
      const walk = (o: Object3D): void => {
        if (!o.visible) return;
        if (o.layers.test(camera.layers) && (o as SkinnedMesh).isSkinnedMesh) {
          const m = o as SkinnedMesh;
          if (!m.frustumCulled || m.intersectsFrustum(f)) out.push(m);
        }
        for (const c of o.children) walk(c);
      };
      walk(scene);
      return out;
    };
    expect(projected(main).map((m) => m.name)).toEqual([]);
    // The shadow pass: `CharacterShadow.update` fits its camera to the actor and renders the scene through it.
    const drawn: SkinnedMesh[][] = [];
    const renderer: ShadowRenderer = {
      getRenderTarget: () => null, setRenderTarget: () => {}, getClearColor: (c: Color) => c.set(0), getClearAlpha: () => 1,
      setClearColor: (_c: ColorRepresentation, _a?: number) => {}, clear: () => {},
      render: (_s: Scene, camera: Camera) => { drawn.push(projected(camera)); },
    };
    const shadow = new CharacterShadow();
    shadow.update(renderer, scene, view.group);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.map((m) => m.name)).toEqual(skinnedOf(view).map((m) => m.name));
    for (const m of skinnedOf(view)) expect(m.layers.isEnabled(SHADOW_LAYER)).toBe(true);
    // and the main camera, after the shadow's pass, still culls them (the bound is the pose's, not a camera's)
    expect(projected(main).map((m) => m.name)).toEqual([]);
    shadow.dispose();
    view.dispose();
  });

  it('a sub-mesh whose weights break the invariant (a negative weight, or a sum off one) is never culled', () => {
    const negative = buildBody(syntheticBody(8, (v, w) => { if (v === 3) { w[0] = 1.5; w[1] = -0.5; w[2] = 0; w[3] = 0; } }), MAP, DEFAULT_LIGHTING);
    expect(skinnedOf(negative).map((m) => m.frustumCulled)).toEqual([false, false, false]);
    negative.dispose();
    const short = buildBody(syntheticBody(8, (v, w) => { if (v === 5) { w[0] = 0.9; w[1] = 0; w[2] = 0; w[3] = 0; } }), MAP, DEFAULT_LIGHTING);
    expect(skinnedOf(short).map((m) => m.frustumCulled)).toEqual([false, false, false]);
    short.dispose();
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'));
const MP6 = fixture('RUN/MP6.ZDB');
const READERC = fixture('RUN/READERC.ZAR');

/** The disc's bodies: Desert Glory's SEAL and its three hostages (`loadBody`), their weights as `topInfluences` wrote them. */
describe.skipIf(!MP6 || !READERC)(`CPS H9 body cull on the disc's bodies${!MP6 || !READERC ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('weights positive and normalised on every vertex; every sub-mesh culled by its bound; containment over 20 poses each', async () => {
    const source = new FsAssetSource(FIXTURES);
    const characters = await characterTableFor(source, 'RUN/MP6.ZDB');
    const toc = parseZdb(MP6!);
    const bodies = [loadBody(MP6!, toc, characters, () => {}, 'navyseals', 0)!,
      ...[0, 1, 2].map((i) => loadBody(MP6!, toc, characters, () => {}, 'escortees', i)!)];
    const r = rng(13);
    for (const body of bodies) {
      for (const sub of body.subMeshes) {
        for (let v = 0; v < sub.skinWeight.length / 4; v++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) { const w = sub.skinWeight[v * 4 + k]!; expect(w).toBeGreaterThanOrEqual(0); sum += w; }
          expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-6);
        }
      }
      const view = buildBody(body, { textures: {}, textureFlags: {} }, DEFAULT_LIGHTING);
      expect(skinnedOf(view).every((m) => m.frustumCulled)).toBe(true);
      const f = new Frustum();
      for (let step = 0; step < 20; step++) {
        pose(view, body, r, step % 2 === 1);
        for (const m of skinnedOf(view)) {
          m.intersectsFrustum(f);
          const s = testedSphere(m);
          for (const v of drawnVertices(m)) expect(v.distanceTo(s.center)).toBeLessThanOrEqual(s.radius);
        }
      }
      view.dispose();
    }
  });
});

