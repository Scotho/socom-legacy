import type { Scene } from 'three';

/**
 * CPS H13 (plan 2026-11-02-client-performance-sprint, Log 2026-11-03T02:52Z, "Theory 5"; CPS.R9 (e)). A CPU-side
 * browser adaptation (product track): the picture unchanged, every object's `matrixWorld` the old walk's own.
 *
 * The world's statics are frozen (`./world` `freezeStatic`: `matrixAutoUpdate` off), but a `Scene` left auto-updating
 * runs `updateMatrix` each frame, which sets its `matrixWorldNeedsUpdate`, and three's walk then forces every
 * descendant's `matrixWorld = parent.matrixWorld * matrix` (three r186 `src/core/Object3D.js`, `updateMatrix` :1161 and
 * `updateMatrixWorld` :1176-1213): ~0.12-0.2 ms a frame in a 16-seat match (the 2026-11-03 quiet runs' profiles), the
 * world's objects at depth 3. Nothing writes the page's scene's own transform, so its matrix is composed once here (the
 * identity) and its auto-update turned off. Its first walk is still flagged (`updateMatrix` sets the flag), so it is
 * computed once; after that a frozen object with its flag clear keeps last frame's `matrixWorld` -- the same operands,
 * so the same values -- while an auto-updating one (a body, a mover, the effects' groups) still flags itself and forces
 * its children each frame, as before.
 *
 * What the forced walk did that this must still do: give an object put directly under the scene one multiply by the
 * scene's matrix (the world group's is computed off the scene, `matrixWorld.copy(matrix)`: identity times it differs
 * only in a signed zero, but the old path made the product), so each child the scene takes is flagged as it is added.
 * Deeper, an object with auto-update off is flagged where it is written or re-parented (`./world` `later`'s queued add,
 * `./effectLights` `pair`, the riders' `set`, `./play` `placeHeld`, `./fire` / `./grenade` `detach`).
 */
export function freezeSceneMatrix(scene: Scene): void {
  scene.updateMatrix();
  scene.matrixAutoUpdate = false;
  scene.addEventListener('childadded', (e) => { e.child.matrixWorldNeedsUpdate = true; });
}
