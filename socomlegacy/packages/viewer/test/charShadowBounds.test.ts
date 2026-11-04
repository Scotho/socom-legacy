import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Bone, Box3, BoxGeometry, BufferGeometry, Euler, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Skeleton,
  SkinnedMesh, Vector3,
  Uint16BufferAttribute,
} from 'three';
import { shadowBounds } from '../src/charShadow';

/**
 * CPS H8 (plan 2026-11-02-client-performance-sprint, 2026-11-02): the own shadow's box. three's
 * `Box3.setFromObject(actor, true)` CPU-skinned every vertex of every SkinnedMesh under the actor -- the two effect-light
 * overlays `./effectLights` hangs beside each receiver (`userData.effectLightPass`, the same geometry, skeleton and bind
 * matrix) included: 3.25 ms a frame on the owner's PC. `shadowBounds` is the same traversal with the overlays left out;
 * the box must come out the same, bit for bit (a browser adaptation on the CPU side only: the picture unchanged).
 */

/** A deterministic pose generator (mulberry32): the same poses every run. */
const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A skinned part: `n` vertices, each weighted over two of the three bones. */
const skinnedGeometry = (n: number, r: () => number): BufferGeometry => {
  const g = new BufferGeometry();
  const pos: number[] = [], idx: number[] = [], wt: number[] = [];
  for (let i = 0; i < n; i++) {
    pos.push(r() * 4 - 2, r() * 18, r() * 4 - 2);
    const a = i % 3, b = (i + 1) % 3, w = r();
    idx.push(a, b, 0, 0);
    wt.push(w, 1 - w, 0, 0);
  }
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
  return g;
};

/** `./effectLights`' `overlayOf` + `pair` for a skinned receiver: the same geometry, skeleton, bind matrix and place. */
const overlay = (m: SkinnedMesh): SkinnedMesh => {
  const o = new SkinnedMesh(m.geometry, new MeshBasicMaterial());
  o.bind(m.skeleton, m.bindMatrix);
  o.bindMode = m.bindMode;
  o.userData.effectLightPass = true;
  o.visible = false;
  o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale);
  m.parent!.add(o);
  return o;
};

/** A SEAL-like actor: a skeleton of three bones, two skinned parts each with its two overlays, a rigid held item. */
const actor = (r: () => number) => {
  const group = new Group();
  const bones = [new Bone(), new Bone(), new Bone()];
  group.add(bones[0]!); bones[0]!.add(bones[1]!); bones[1]!.add(bones[2]!);
  bones[1]!.position.set(0, 6, 0); bones[2]!.position.set(0, 6, 0);
  group.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const parts = [skinnedGeometry(40, r), skinnedGeometry(25, r)].map((g) => {
    const m = new SkinnedMesh(g, new MeshBasicMaterial());
    group.add(m);
    m.bind(skeleton);
    return m;
  });
  const overlays = parts.flatMap((m) => [overlay(m), overlay(m)]);
  const held = new Mesh(new BoxGeometry(1, 1, 6), new MeshBasicMaterial());
  bones[2]!.add(held);
  const sight = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  sight.visible = false;                                   // a hidden child: today's box counts it, so does the new one
  held.add(sight);
  const heldOverlay = new Mesh(held.geometry, new MeshBasicMaterial());
  heldOverlay.userData.effectLightPass = true;
  bones[2]!.add(heldOverlay);
  return { group, bones, parts, overlays, held, sight, heldOverlay };
};

/** A random pose: the actor's place and heading, each bone turned, the held item offset. */
const pose = (a: ReturnType<typeof actor>, r: () => number): void => {
  a.group.position.set(r() * 200 - 100, r() * 10, r() * 200 - 100);
  a.group.rotation.set(0, r() * Math.PI * 2, 0);
  for (const b of a.bones) b.rotation.set(r() - 0.5, r() * 2 - 1, r() - 0.5);
  a.held.position.set(r(), r(), r());
  a.held.rotation.set(r(), r(), r());
  a.heldOverlay.position.copy(a.held.position);          // `pair`: the overlay in its receiver's place
  a.heldOverlay.quaternion.copy(a.held.quaternion);
  a.group.updateMatrixWorld(true);
};

/**
 * CPS H8 step 2: a part skinned over four bones a vertex (weights that do not sum to 1, one of them 0 now and then),
 * bound with a non-identity bind matrix, and a part with a morph target on top of its skinning.
 */
const actor4 = (r: () => number) => {
  const group = new Group();
  const bones = [new Bone(), new Bone(), new Bone(), new Bone(), new Bone()];
  group.add(bones[0]!);
  for (let i = 1; i < bones.length; i++) { bones[i - 1]!.add(bones[i]!); bones[i]!.position.set(r() - 0.5, 4, r() - 0.5); }
  group.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const geometry = (n: number): BufferGeometry => {
    const g = new BufferGeometry();
    const pos: number[] = [], idx: number[] = [], wt: number[] = [];
    for (let i = 0; i < n; i++) {
      pos.push(r() * 6 - 3, r() * 20, r() * 6 - 3);
      for (let k = 0; k < 4; k++) { idx.push(Math.floor(r() * bones.length)); wt.push(k === 3 && i % 5 === 0 ? 0 : r() * 0.4); }
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
    return g;
  };
  const bind = new Matrix4().compose(new Vector3(0.3, -1.2, 0.7), new Quaternion().setFromEuler(new Euler(0.2, 0.9, -0.1)), new Vector3(1.1, 0.95, 1.05));
  const body = new SkinnedMesh(geometry(60), new MeshBasicMaterial());
  group.add(body);
  body.bind(skeleton, bind);
  const morphed = geometry(30);
  const morph: number[] = [];
  for (let i = 0; i < 30; i++) morph.push(r() - 0.5, r() - 0.5, r() - 0.5);
  morphed.morphAttributes.position = [new Float32BufferAttribute(morph, 3)];
  morphed.morphTargetsRelative = true;
  const face = new SkinnedMesh(morphed, new MeshBasicMaterial());
  group.add(face);
  face.bind(skeleton);
  face.morphTargetInfluences = [0];
  const parts = [body, face];
  const overlays = parts.flatMap((m) => [overlay(m), overlay(m)]);
  // The test's overlays share the face's influences, so today's box (which skins them) is the receivers' box to compare
  // against; `./effectLights`' own overlays keep three's zero influences (the report of CPS H8 step 2 says so).
  for (const o of overlays) if (o.geometry === morphed) o.morphTargetInfluences = face.morphTargetInfluences;
  return { group, bones, parts, overlays, face };
};

const pose4 = (a: ReturnType<typeof actor4>, r: () => number): void => {
  a.group.position.set(r() * 200 - 100, r() * 10, r() * 200 - 100);
  a.group.rotation.set(0, r() * Math.PI * 2, 0);
  for (const b of a.bones) b.rotation.set(r() - 0.5, r() * 2 - 1, r() - 0.5);
  a.face.morphTargetInfluences![0] = r();
  a.group.updateMatrixWorld(true);
};

afterEach(() => { vi.restoreAllMocks(); });

describe('CPS H8: shadowBounds -- the own shadow\'s box without the effect-light overlays', () => {
  it('is the box setFromObject(actor, true) makes, Object.is on every bound, over several random poses', () => {
    const r = rng(0x5ec0);
    const a = actor(r);
    for (let p = 0; p < 12; p++) {
      pose(a, r);
      const today = new Box3().setFromObject(a.group, true);
      const ours = shadowBounds(a.group, new Box3());
      expect(today.isEmpty()).toBe(false);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Object.is(ours.min[k], today.min[k]), `pose ${p} min.${k}: ${ours.min[k]} vs ${today.min[k]}`).toBe(true);
        expect(Object.is(ours.max[k], today.max[k]), `pose ${p} max.${k}: ${ours.max[k]} vs ${today.max[k]}`).toBe(true);
      }
    }
  });

  it('skins only the receivers\' vertices: the overlays\' are never visited', () => {
    const r = rng(0xb0c5);
    const a = actor(r);
    pose(a, r);
    // Mesh's own `getVertexPosition` (the position and the morphs): three's SkinnedMesh reaches it through `super`, and
    // CPS H8 step 2's loop calls it before its own skinning -- one call a vertex either way.
    const read = vi.spyOn(Mesh.prototype, 'getVertexPosition');
    const skinnedCalls = (): unknown[] => read.mock.contexts.filter((c) => c instanceof SkinnedMesh);
    new Box3().setFromObject(a.group, true);
    const today = skinnedCalls();
    read.mockClear();
    shadowBounds(a.group, new Box3());
    const ours = skinnedCalls();
    expect(today).toHaveLength(3 * (40 + 25));             // each part and its two overlays
    expect(ours).toHaveLength(40 + 25);                    // each part once
    const visited = new Set(ours);
    for (const o of a.overlays) expect(visited.has(o)).toBe(false);
  });

  it('empties the box it is given first (setFromObject\'s makeEmpty) and returns it', () => {
    const r = rng(7);
    const a = actor(r);
    pose(a, r);
    const box = new Box3().setFromCenterAndSize(a.group.position.clone().addScalar(1e6), a.group.position.clone().setScalar(1));
    expect(shadowBounds(a.group, box)).toBe(box);
    expect(box.equals(new Box3().setFromObject(a.group, true))).toBe(true);
  });

  it("the one case it differs: an overlay left out of its receiver's place (moved since the light last `pair`ed it) no longer widens the box", () => {
    const r = rng(11);
    const a = actor(r);
    pose(a, r);
    a.heldOverlay.position.x += 50;                        // the held item moved, its overlay not re-placed yet
    a.group.updateMatrixWorld(true);
    const today = new Box3().setFromObject(a.group, true);
    const ours = shadowBounds(a.group, new Box3());
    a.heldOverlay.removeFromParent();
    for (const o of a.overlays) o.removeFromParent();
    expect(ours.equals(new Box3().setFromObject(a.group, true))).toBe(true);   // the actor's own meshes' box
    expect(today.containsBox(ours) && !today.equals(ours)).toBe(true);           // today's was the wider
  });

  it('CPS H8 step 2: four-weight vertices, a non-identity bind matrix and a morph target -- still Object.is on every bound', () => {
    const r = rng(0x4b1d);
    const a = actor4(r);
    for (let p = 0; p < 12; p++) {
      pose4(a, r);
      const today = new Box3().setFromObject(a.group, true);
      const ours = shadowBounds(a.group, new Box3());
      expect(today.isEmpty()).toBe(false);
      for (const k of ['x', 'y', 'z'] as const) {
        expect(Object.is(ours.min[k], today.min[k]), `pose ${p} min.${k}: ${ours.min[k]} vs ${today.min[k]}`).toBe(true);
        expect(Object.is(ours.max[k], today.max[k]), `pose ${p} max.${k}: ${ours.max[k]} vs ${today.max[k]}`).toBe(true);
      }
    }
  });

  it('CPS H8 step 2: one bone matrix a bone a mesh (multiplyMatrices), not one a vertex and weight', () => {
    const r = rng(0xb04e);
    for (const make of [actor, actor4] as const) {
      const a = make(r);
      if (make === actor) pose(a as ReturnType<typeof actor>, r); else pose4(a as ReturnType<typeof actor4>, r);
      const multiply = vi.spyOn(Matrix4.prototype, 'multiplyMatrices');
      shadowBounds(a.group, new Box3());
      const calls = multiply.mock.calls.length;
      multiply.mockRestore();
      // Besides the bones: the traversal's own `updateWorldMatrix(false, false)` (one product an object visited, as
      // three's `expandByObject` makes; the overlays not visited, the root's a copy).
      let objects = 0;
      a.group.traverse((o) => { if (o.userData.effectLightPass !== true && !o.parent?.userData.effectLightPass) objects++; });
      const bones = a.bones.length, meshes = a.parts.length;
      expect(calls, `${make.name}: ${calls} products`).toBeLessThanOrEqual(meshes * bones + objects);
    }
  });

  it('an actor of overlays alone has an empty box, as the frame then draws no shadow', () => {
    const g = new Group();
    const o = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    o.userData.effectLightPass = true;
    g.add(o);
    expect(shadowBounds(g, new Box3()).isEmpty()).toBe(true);
  });
});
