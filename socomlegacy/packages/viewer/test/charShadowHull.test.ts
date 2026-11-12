import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Bone, Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute,
} from 'three';
import { boundsPlanOf, setShadowBoundsHull, shadowBounds } from '../src/charShadow';

/**
 * SPC-2 (the shadow PC's research loop, SPC.R4/R6; a CPU-side browser adaptation, behind a switch, off by default): the own
 * shadow's box from fewer vertices. A vertex moved by one affine map (a rigid mesh's, or a skinned vertex weighted to one
 * bone) can be an extreme of the box only if it lies on its group's convex hull, so the vertices strictly inside the hull
 * by more than a margin are skipped. Every vertex kept goes through the same arithmetic as today, so the box -- and the
 * map fitted to it -- must be the same value for value. This holds that, over random poses of a SEAL-like actor.
 */
const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A cloud of `n` points in a box, the shape of a body part (most points inside its hull). */
const cloud = (n: number, r: () => number, sx = 4, sy = 18, sz = 4): number[] => {
  const p: number[] = [];
  for (let i = 0; i < n; i++) p.push(r() * sx - sx / 2, r() * sy, r() * sz - sz / 2);
  return p;
};

/** A skinned part: `single` vertices on one bone each (a non-unit weight for some), `multi` blended over two or three. */
const skinned = (single: number, multi: number, r: () => number): BufferGeometry => {
  const g = new BufferGeometry();
  const idx: number[] = [], wt: number[] = [];
  for (let i = 0; i < single; i++) { idx.push(i % 4, 0, 0, 0); wt.push(i % 7 === 0 ? 0.9999 : 1, 0, 0, 0); }
  for (let i = 0; i < multi; i++) {
    const a = i % 4, b = (i + 1) % 4, c = (i + 2) % 4, w = r() * 0.6, u = r() * 0.3;
    if (i % 3 === 0) { idx.push(a, b, c, 0); wt.push(w, u, 1 - w - u, 0); } else { idx.push(a, b, 0, 0); wt.push(w, 1 - w, 0, 0); }
  }
  g.setAttribute('position', new Float32BufferAttribute(cloud(single + multi, r), 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4));
  return g;
};

const actor = (r: () => number) => {
  const group = new Group();
  const bones = [new Bone(), new Bone(), new Bone(), new Bone()];
  group.add(bones[0]!); bones[0]!.add(bones[1]!); bones[1]!.add(bones[2]!); bones[0]!.add(bones[3]!);
  bones[1]!.position.set(0, 6, 0); bones[2]!.position.set(0, 6, 0); bones[3]!.position.set(2, 3, 0);
  group.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  const parts = [skinned(600, 120, r), skinned(150, 200, r)].map((g) => {
    const m = new SkinnedMesh(g, new MeshBasicMaterial());
    group.add(m);
    m.bind(skeleton);
    return m;
  });
  const rigidGeometry = new BufferGeometry();
  rigidGeometry.setAttribute('position', new Float32BufferAttribute(cloud(500, r, 1, 1, 6), 3));
  const held = new Mesh(rigidGeometry, new MeshBasicMaterial());
  bones[2]!.add(held);
  return { group, bones, parts, held };
};

const pose = (a: ReturnType<typeof actor>, r: () => number): void => {
  a.group.position.set(r() * 6000 - 3000, r() * 200 - 100, r() * 6000 - 3000);
  a.group.rotation.set(0, r() * Math.PI * 2, 0);
  for (const b of a.bones) b.rotation.set(r() - 0.5, r() * 2 - 1, r() - 0.5);
  a.held.position.set(r(), r(), r());
  a.held.rotation.set(r() * 3, r() * 3, r() * 3);
  a.group.updateMatrixWorld(true);
};

const same = (x: Box3, y: Box3): boolean =>
  [x.min.x, x.min.y, x.min.z, x.max.x, x.max.y, x.max.z].every((v, i) => Object.is(v, [y.min.x, y.min.y, y.min.z, y.max.x, y.max.y, y.max.z][i]));

describe('SPC-2: the own shadow\'s box from the hulls\' vertices', () => {
  afterEach(() => setShadowBoundsHull(false));

  it('is off in a freshly loaded module, before anything sets it', async () => {
    vi.resetModules();
    const fresh = await import('../src/charShadow');
    expect(fresh.shadowBoundsHull()).toBe(false);
  });

  it('is off by default and gives the same box, value for value, over 300 random poses when on', () => {
    const r = rng(0x5eed);
    const a = actor(r);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      pose(a, r);
      setShadowBoundsHull(false);
      const full = shadowBounds(a.group, new Box3());
      setShadowBoundsHull(true);
      const hull = shadowBounds(a.group, new Box3());
      if (!same(full, hull)) throw new Error(`pose ${i}: ${JSON.stringify(full)} != ${JSON.stringify(hull)}`);
      checked++;
    }
    expect(checked).toBe(300);
  });

  it('skips the vertices inside the hulls and keeps every blended one', () => {
    const r = rng(7);
    const a = actor(r);
    const rigid = boundsPlanOf(a.held);
    expect(rigid.total).toBe(500);
    expect(rigid.kept).toBeLessThan(250);                          // a box-shaped cloud: most points inside its hull
    const part = boundsPlanOf(a.parts[0]!);
    expect(part.total).toBe(720);
    expect(part.kept).toBeGreaterThanOrEqual(120);                 // every one of the 120 blended vertices
    expect(part.kept).toBeLessThan(720);
  });

  it('keeps every vertex of a morphed mesh and of a group too small or flat for a hull', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(cloud(50, rng(3)), 3));
    g.morphAttributes['position'] = [new Float32BufferAttribute(cloud(50, rng(4)), 3)];
    const morphed = new Mesh(g, new MeshBasicMaterial());
    morphed.updateMorphTargets();
    expect(boundsPlanOf(morphed).kept).toBe(50);
    const flat = new BufferGeometry();
    flat.setAttribute('position', new Float32BufferAttribute(Array.from({ length: 40 }, (_, i) => [i % 7, Math.floor(i / 7), 0]).flat(), 3));
    expect(boundsPlanOf(new Mesh(flat, new MeshBasicMaterial())).kept).toBe(40);
    const few = new BufferGeometry();
    few.setAttribute('position', new Float32BufferAttribute(cloud(5, rng(5)), 3));
    expect(boundsPlanOf(new Mesh(few, new MeshBasicMaterial())).kept).toBe(5);
  });

  it('remakes a plan when the positions change', () => {
    const r = rng(9);
    const a = actor(r);
    const before = boundsPlanOf(a.held);
    const pos = a.held.geometry.getAttribute('position') as Float32BufferAttribute;
    pos.setXYZ(0, 50, 50, 50); pos.needsUpdate = true;              // a new extreme
    const after = boundsPlanOf(a.held);
    expect(after).not.toBe(before);
    pose(a, r);
    setShadowBoundsHull(false);
    const full = shadowBounds(a.group, new Box3());
    setShadowBoundsHull(true);
    expect(same(full, shadowBounds(a.group, new Box3()))).toBe(true);
  });
});
