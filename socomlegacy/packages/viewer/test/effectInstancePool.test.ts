import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, PerspectiveCamera, type Object3D } from 'three';
import { NODE_ROOT, type EffectMesh, type EffectOp, type EffectProgram } from '@s2u/scene';
import type { EffectData } from '../src/effectData';
import { EFFECT_INSTANCE_POOL_ADAPTATION, Effects } from '../src/effects';

/**
 * LATER 870 (product track, the renderer; a browser adaptation): a run's model copy (`Effects.instanceOf`, a muzzle
 * flash a shot) was taken out of the scene and dropped. three r186 frees a render object, and its uniform buffers, only
 * at a 'dispose' of its object or material (a geometry's only drops its attributes): shadow's census (16 seats, MP2, WebGPU) counted ~27 uniform
 * buffers a second made in a match and none destroyed -- `muzzle_flash_m4`'s two meshes and `muzzle_flash_hider`'s, a
 * new pair each shot, held for the session. The copies now go back to a pool by model and the next run takes one; a
 * copy past the pool's room is disposed (its objects, never the shared material and geometry). Synthetic data: one
 * two-mesh model, `flash`, and a program that shows it, moves it and scales it over 0.05 s.
 */

const quad = (texture: string): EffectMesh => ({
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1),
  indices: new Uint32Array([0, 1, 2]), normals: null, faceNormals: null, textureName: texture, fog: false, cull: false,
} as unknown as EffectMesh);

const program = (name: string, ops: EffectOp[]): EffectProgram => ({ name, root: 1, flags: 0, nodes: ['NA', 'flash', 'rotate'], sequences: [{ name: 's0', activation: 1, ops }] });

/** `muzzle`: shown, moved 5 along x and scaled 1 -> 3 over 0.05 s; `peek`: shown and held 0.05 s, its nodes untouched. */
const data = (modelName = 'flash'): EffectData => ({
  archive: 'T', textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
  ambient: [], sceneNodes: [], hitAnims: [], missing: [],
  models: [{ name: modelName, parts: [{ node: 'rotate', path: `${modelName}/rotate/quad`, world: new Float32Array(16), meshes: [quad('effect_muzzle01.tif'), quad('effect_muzzle02.tif')] }] }],
  programs: [
    { ...program('muzzle', [
      { op: 'active', node: 1, on: true },
      { op: 'translate', node: 2, ref: 0, flags: 1, xyz: [5, 0, 0] },
      { op: 'fromTo', node: 2, flags: 0, seconds: 0.05, from: [1, 1, 1], to: [3, 3, 3] },
    ]), nodes: ['NA', modelName, 'rotate'] },
    { ...program('peek', [{ op: 'active', node: 1, on: true }, { op: 'wait', seconds: 0.05, range: 0, frames: null }]), nodes: ['NA', modelName, 'rotate'] },
  ],
});

const camera = new PerspectiveCamera();
const meshesIn = (root: Object3D): Mesh[] => { const out: Mesh[] = []; root.traverse((o) => { if (o instanceof Mesh) out.push(o); }); return out; };

/** Plays `count` runs of `name` at once, steps them out, and returns every mesh seen in the scene meanwhile. */
function volley(fx: Effects, name: string, count: number, seen: Set<Mesh>): void {
  for (let i = 0; i < count; i++) expect(fx.play(name, { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
  for (let f = 0; f < 12; f++) { fx.update(1 / 60, camera); for (const m of meshesIn(fx.object)) seen.add(m); }
  expect(fx.stats().runs).toBe(0);
}

describe('LATER 870: a run\'s model copy goes back to a pool, not out of reach with its render objects held', () => {
  it('one flash at a time, 50 times: the same two meshes every time, not 100', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    const seen = new Set<Mesh>();
    for (let i = 0; i < 50; i++) volley(fx, 'muzzle', 1, seen);
    expect(seen.size).toBe(2);
    expect(meshesIn(fx.object)).toHaveLength(0);                 // and none left in the drawn scene
  });

  it('five at once, ten times: five copies, made once and taken again', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    const seen = new Set<Mesh>();
    for (let i = 0; i < 10; i++) volley(fx, 'muzzle', 5, seen);
    expect(seen.size).toBe(10);
  });

  it('a copy taken again starts as the model: the last run\'s place, scale and showing undone', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    volley(fx, 'muzzle', 1, new Set());
    expect(fx.play('peek', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(1 / 60, camera);
    const rotate = fx.object.getObjectByName('rotate')!;
    expect(rotate.position.toArray()).toEqual([0, 0, 0]);
    expect(rotate.scale.toArray()).toEqual([1, 1, 1]);
    expect(rotate.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(rotate.matrixAutoUpdate).toBe(true);
  });

  it('past the pool\'s room a copy is disposed -- its objects, never the material or the geometry the model shares', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    const over = 3, disposed = new Set<Object3D>(), shared = new Set<string>();
    const seen = new Set<Mesh>();
    for (let i = 0; i < EFFECT_INSTANCE_POOL_ADAPTATION + over; i++) expect(fx.play('muzzle', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(1 / 60, camera);
    for (const m of meshesIn(fx.object)) {
      seen.add(m);
      m.addEventListener('dispose', () => disposed.add(m));
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.addEventListener('dispose', () => shared.add('material'));
      m.geometry.addEventListener('dispose', () => shared.add('geometry'));
    }
    expect(seen.size).toBe(2 * (EFFECT_INSTANCE_POOL_ADAPTATION + over));
    for (let f = 0; f < 12; f++) fx.update(1 / 60, camera);
    expect(fx.stats().runs).toBe(0);
    expect(disposed.size).toBe(2 * over);                        // r186: the object's 'dispose' frees its render objects
    expect([...shared]).toEqual([]);
    const again = new Set<Mesh>();
    volley(fx, 'muzzle', EFFECT_INSTANCE_POOL_ADAPTATION, again);
    for (const m of again) { expect(seen.has(m)).toBe(true); expect(disposed.has(m)).toBe(false); }
  });

  it('a new map: the pool is let go with the old models, and the new map\'s runs copy the new ones', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    const before = new Set<Mesh>();
    volley(fx, 'muzzle', 2, before);
    fx.setData(data());
    const after = new Set<Mesh>();
    volley(fx, 'muzzle', 2, after);
    for (const m of after) expect(before.has(m)).toBe(false);
  });

  it('a round\'s end mid-run puts its copies in the pool too', () => {
    const fx = new Effects(() => 0.5);
    fx.setData(data());
    const seen = new Set<Mesh>();
    expect(fx.play('muzzle', { node: new Matrix4(), position: [0, 0, 0] })).toBe(true);
    fx.update(1 / 60, camera);
    for (const m of meshesIn(fx.object)) seen.add(m);
    fx.clearRound();
    expect(meshesIn(fx.object)).toHaveLength(0);
    volley(fx, 'muzzle', 1, seen);
    expect(seen.size).toBe(2);
  });
});

describe('LATER 870 (the main controller\'s ask): a tracer\'s run that ends before its flight leaves no node behind', () => {
  // `sweepRuns` drops a finished run a flight still holds (`tracerHolds`) without its node; the flight's retire
  // (`retireTracer`) was the last hold, and nothing took the node out of the scene after it. Synthetic: a tracer zAnim
  // of 0.01 s on a flight of many game frames, rooted at no model as the disc's are (`./tracers.test.ts`' rig).
  const tracerData = (): EffectData => ({
    archive: 'T', textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
    ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
    programs: [{ name: 'tracer_ally_anim', root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's0', activation: 1, ops: [
      { op: 'active', node: NODE_ROOT, on: true }, { op: 'wait', seconds: 0.01, range: 0, frames: null },   // its node made
    ] }] }],
  });

  it('flown out after its run ended: the scene\'s children are as before the shot', () => {
    const fx = new Effects(() => 0.5, () => {});
    fx.setData(tracerData());
    const before = fx.object.children.length;
    for (let shot = 0; shot < 5; shot++) {
      expect(fx.launchTracer([0, 20, 0], [0, 20, -2000], 'ally', 10000)).toBe(true);
      for (let i = 0; i < 400 && fx.stats().tracers.length > 0; i++) fx.update(1 / 30, camera);
      expect(fx.stats().tracers).toHaveLength(0);
      expect(fx.stats().runs).toBe(0);
    }
    expect(fx.object.children.length).toBe(before);
  });

  it('a round\'s end with such a tracer in flight: the same', () => {
    const fx = new Effects(() => 0.5, () => {});
    fx.setData(tracerData());
    const before = fx.object.children.length;
    expect(fx.launchTracer([0, 20, 0], [0, 20, -2000], 'ally', 10000)).toBe(true);
    for (let i = 0; i < 3; i++) fx.update(1 / 30, camera);       // the run ends; the flight flies on
    expect(fx.stats().tracers).toHaveLength(1);
    fx.clearRound();
    expect(fx.object.children.length).toBe(before);
  });
});

describe('LATER 870: three r186 as the pool reads it (a three upgrade fails here first)', () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve('three/webgpu'), 'utf8');

  it('a render object goes at its object\'s or material\'s dispose, and with it its bindings', () => {
    expect(bundle).toContain("this.object.addEventListener( 'dispose', this.onObjectDispose );");
    expect(bundle).toContain('this.bindings.deleteForRender( renderObject );');
    expect(bundle).toContain('uniformBufferData.buffer.destroy();');
  });

  it('why a pool and not a dispose a run: the last render object of a kind takes its node build and pipeline with it', () => {
    expect(bundle).toContain('this.nodeBuilderCache.delete( this.getForRenderCacheKey( object ) );');
    expect(bundle).toContain('if ( pipeline.usedTimes === 0 ) this._releasePipeline( pipeline );');
  });
});
