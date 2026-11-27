import { Matrix4, Quaternion, Vector3 } from 'three';
import { turnFacade } from '../facade';

/** The current facade turn on a scene-owned matrix. No decoded geometry or
 * placement buffer is retained. Both eye and position are in world space, so
 * their difference is the same as world.frame's group-local turn.
 */
export function facingPlacement(model: Matrix4, facade: number) {
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  model.decompose(position, quaternion, scale);
  const origin = position.toArray(), eyeValues = [0, 0, 0];
  return { frame(eye: Vector3): boolean {
    eye.toArray(eyeValues);
    turnFacade({ quaternion, scale }, facade, origin, eyeValues);
    model.compose(position, quaternion, scale);
    // The original collapses a facade seen straight along its vertical axis.
    // Avoid submitting a singular matrix to the normal-transform shader.
    return scale.x !== 0 && scale.y !== 0 && scale.z !== 0;
  } };
}
