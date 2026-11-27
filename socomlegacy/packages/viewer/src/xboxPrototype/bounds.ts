import { Box3, Matrix4, Sphere } from 'three';

/** Conservative static bounds only. Transform all box corners, including every
 * authored instance, so nonuniform scaling/shear cannot shrink the bound.
 * The result owns numbers, never the decoded geometry or placement arrays.
 */
export function staticBounds(draw: { positions: Float32Array; instances?: Float32Array; model: Matrix4; actor: boolean; facade?: number; objectModel?: string }): Sphere | null {
  if (draw.actor || draw.facade || draw.objectModel || draw.positions.length < 3) return null;
  const local = new Box3().setFromArray(draw.positions), world = new Box3();
  if (draw.instances) {
    if (!draw.instances.length || draw.instances.length % 16) return null;
    const matrix = new Matrix4(), placed = new Box3();
    for (let i = 0; i < draw.instances.length; i += 16) {
      matrix.fromArray(draw.instances, i).premultiply(draw.model);
      world.union(placed.copy(local).applyMatrix4(matrix));
    }
  } else world.copy(local).applyMatrix4(draw.model);
  const sphere = world.getBoundingSphere(new Sphere());
  return sphere.isEmpty() || !Number.isFinite(sphere.radius) || !sphere.center.toArray().every(Number.isFinite) ? null : sphere;
}
