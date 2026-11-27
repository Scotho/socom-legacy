import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { effectMaterial } from './effectMaterials';
import { ParticleGeometry, type Group3 as ParticleGroup } from './particleGeometry';

export * from './particleGeometry';
export type Group3 = ParticleGroup<MeshBasicNodeMaterial>;

/** Production presentation for the shared particle simulation and geometry. */
export class ParticleSystem extends ParticleGeometry<MeshBasicNodeMaterial> {
  constructor(random: () => number = Math.random) {
    super(random, texture => effectMaterial(texture, { fog: true, vertexAlpha: true }));
  }
}
