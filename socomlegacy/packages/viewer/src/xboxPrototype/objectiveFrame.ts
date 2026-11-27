import { BOMB_MODEL_READING } from '../bombPage';
import type { SceneObject } from './sceneFrame';

/** BombPage owns presence and point; BOMB_MODEL_READING owns the unturned
 * Satchel (FUN_0059dab0 D:L457497-L457506). No timers or simulation live here. */
export function bombModelFrame() {
  const matrix = new Float32Array(16); matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  const object: SceneObject = { id: 0, model: BOMB_MODEL_READING.model, matrix };
  const objects: SceneObject[] = [];
  return { objects,
    place(pos: readonly [number, number, number] | null) {
      if (!pos) { objects.length = 0; return; }
      matrix[12] = pos[0]; matrix[13] = pos[1]; matrix[14] = pos[2];
      if (!objects.length) objects.push(object);
    },
  };
}
