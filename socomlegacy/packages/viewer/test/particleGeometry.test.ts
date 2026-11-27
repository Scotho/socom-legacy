import { expect, it, vi } from 'vitest';
import { Matrix4, MeshBasicMaterial, PerspectiveCamera, Texture, type Mesh } from 'three';
import type { ParticleSource } from '@s2u/scene';
import { ParticleGeometry } from '../src/particleGeometry';

vi.mock('../src/effectMaterials', () => { throw new Error('Particle geometry must not load production materials'); });

/** Synthetic per-distance source; the existing particle tests hold the disc readings. */
const source: ParticleSource = {
  flagsA: 0x4013, flagsB: 0, name: 'trail', setActive: true, node: -6, follow: true, perEvent: 1, events: -1, interval: 1,
  perDistance: true, type: 2, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
  baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
  atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
  friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null, textures: [], textureMode: 'first',
  texture: null, colours: [], scales: [],
};

it('uses renderer-owned materials while preserving geometry, emission and cleanup', () => {
  const material = new MeshBasicMaterial({ map: new Texture() });
  const factory = vi.fn(() => material), releaseMaterial = vi.spyOn(material, 'dispose'), releaseTexture = vi.spyOn(material.map!, 'dispose');
  const particles = new ParticleGeometry(() => 0.5, factory);
  const node = new Matrix4(), camera = new PerspectiveCamera();
  camera.position.set(0, 10, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  particles.emit(source, node, {}, 'fixture', () => true, null, () => node);
  particles.update(1 / 60, camera);
  expect(particles.count()).toBe(0);
  node.makeTranslation(3, 0, 0); particles.update(1 / 60, camera);
  expect(particles.count()).toBe(3); expect(factory).toHaveBeenCalledTimes(1);
  const mesh = particles.object.children[0] as Mesh;
  expect(mesh.material).toBe(material); expect(mesh.geometry.drawRange.count).toBe(18);
  expect(Array.from(mesh.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true);
  const releaseGeometry = vi.spyOn(mesh.geometry, 'dispose');
  particles.expire(); expect(particles.count()).toBe(0); expect(mesh.visible).toBe(false);
  particles.setTextures(new Map());
  expect(particles.object.children).toHaveLength(0);
  expect(releaseGeometry).toHaveBeenCalledTimes(1); expect(releaseMaterial).toHaveBeenCalledTimes(1); expect(releaseTexture).toHaveBeenCalledTimes(1);
});
