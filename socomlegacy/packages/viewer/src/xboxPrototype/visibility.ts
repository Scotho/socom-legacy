import { Frustum, Matrix4, type PerspectiveCamera, type Sphere } from 'three';

/** Same WebGL camera clip volume used by Three's renderer. A null bound is
 * deliberately uncullable (animated/held geometry or an unusable static bound).
 */
export function frameVisibility() {
  const frustum = new Frustum(), projectionView = new Matrix4();
  return {
    frame(camera: PerspectiveCamera) { frustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); },
    visible(bounds: Sphere | null) { return bounds === null || frustum.intersectsSphere(bounds); },
  };
}
