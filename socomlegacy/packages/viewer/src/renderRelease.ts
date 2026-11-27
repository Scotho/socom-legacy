import type { Object3D } from 'three';

/**
 * LATER 922 (`RENDER_RELEASE_ADAPTATION`; product track, a renderer memory fix -- no picture and no game value changed):
 * three r186's renderer keeps every render object it makes in a strong Set (`RenderObjects._renderObjects`) until the
 * render object's own object, material or geometry sends `dispose`. A copy the page lets go for good -- a dropped weapon
 * taken or swept at a round's end, a body's swapped weapon, its launcher taken off -- left by `remove`/`removeFromParent`
 * alone kept its render objects, each with its bind group, uniform buffer and VAO, until the match ended (PC 3's census,
 * 2026-11-18: +597 render objects and +600 uniform buffers over five classic rounds, 505 of them weapon copies off the
 * scene). This sends the object's own `dispose` EVENT down the tree -- not `dispose()`, which a subclass may extend to
 * free shared data: the geometry, the materials and the textures (the templates', shared) are untouched. A copy drawn
 * again later is given new render objects (a cost, never a fault).
 */
export const RENDER_RELEASE_ADAPTATION = "a copy let go for good sends its objects' dispose event, so the renderer's render objects for it go" as const;

/** `root` and every node under it told `dispose` (the renderer's render objects for them released); null is nothing. */
export function releaseRenderObjects(root: Pick<Object3D, 'traverse'> | null | undefined): void {
  if (typeof root?.traverse !== 'function') return;            // a stand-in with no tree (a test's structural copy): nothing drawn
  root.traverse((o) => { o.dispatchEvent?.({ type: 'dispose' }); });
}
