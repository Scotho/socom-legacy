import type { Mesh } from 'three';

/**
 * Renderer adaptation: reject only ordinary static world geometry wholly outside the render camera.
 * The bound is computed from the geometry's Float32 positions, never from a cell or visual centroid.
 * These meshes have no vertex displacement; detail/env children share the same geometry and transform.
 * Keep a conservative 128-float32-epsilon margin at the bound's scale for CPU/GPU rounding at clip planes.
 * The margin only retains extra draws. Invalid bounds retain the old always-submit behavior.
 * Call once during construction, before attaching detail/env passes; props and moving meshes do not use this.
 */
export function prepareWorldFrustum(mesh: Mesh): void {
  mesh.frustumCulled = false;
  const bound = mesh.geometry.boundingSphere;
  if (!bound) return;
  const { x, y, z } = bound.center;
  if (![x, y, z, bound.radius].every(Number.isFinite) || bound.radius < 0) return;
  bound.radius += Math.max(1, Math.abs(x), Math.abs(y), Math.abs(z), bound.radius) * 2 ** -16;
  mesh.frustumCulled = true;
}
