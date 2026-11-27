import type { Camera } from 'three';

/** The far clip a camera had before the view range extended it, and the far the extension set. */
const farBases = new WeakMap<Camera, { base: number; applied: number }>();

/**
 * The view range on the far clip (`FUN_001f1470`: `cam+0xf0` / `+0x2ec`, research 188 U3, 232 §2): the camera's far is
 * its base plus the extra, restored at 0. The base is the far the camera had when no extension of this function's was
 * on it: a far set from outside since (`FlyCamera.setClipPlanes` at a map's load) is the new base. A camera without
 * a far (none the page uses) is left alone. The game's mid (`+0xec`, `FUN_00291180`) has no counterpart here.
 */
export function extendFar(camera: Camera, extra: number): void {
  const cam = camera as Camera & { far?: number; updateProjectionMatrix?: () => void };
  if (typeof cam.far !== 'number') return;
  const known = farBases.get(camera);
  const base = known && cam.far === known.applied ? known.base : cam.far;
  const far = base + extra;
  if (cam.far !== far) {
    cam.far = far;
    cam.updateProjectionMatrix?.();
  }
  farBases.set(camera, { base, applied: far });
}

