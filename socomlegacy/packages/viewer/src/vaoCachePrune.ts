import { WebGLBackend } from 'three/webgpu';

/**
 * LATER 1225 (`VAO_CACHE_PRUNE_ADAPTATION`; product track, a renderer memory fix like LATER 1168's override -- no picture
 * and no game value changed): three r186's WebGL2 backend caches every VAO it makes in `vaoCache`, a plain object keyed by
 * its attributes' backend ids (`WebGLBackend._getVaoKey`: `':' + id` per attribute), and never removes one. A disposed
 * geometry -- a round's scorches, a body view's parts -- leaves its VAOs there, each still binding the GL buffers three has
 * just deleted (PC 3's census, 2026-11-18: every new VAO stays; 53-65 WebGLBuffers held only by the cache).
 *
 * The override: `destroyAttribute` (three's, called when a geometry is disposed, `Geometries` ~:185-239) first deletes and
 * drops the cached VAOs whose key holds that attribute's id, then runs three's own. Every render object of that geometry
 * drops its attributes, and with them its cached VAO, on the same dispose (`RenderObject.onGeometryDispose`), so none
 * binds a deleted one; the next draw keys a fresh VAO. The limit (its review's F1): a render object NOT reset by that dispose
 * -- a BufferAttribute shared with another, live geometry; a mesh still drawing a geometry disposed under it -- would bind
 * the deleted VAO (INVALID_OPERATION, drawn wrong) where stock three draws stale data; no such sharing is in the page today
 * (the review's search). A storage attribute's id is a string (`'5|0'`), so a VAO holding one is not pruned (as stock).
 * WebGL2 only; WebGPU has no VAO. Installed once, on import
 * (`./renderer`). `test/vaoCachePrune.test.ts` pins the three lines this relies on and fails on an upgrade that changes them.
 */
export const VAO_CACHE_PRUNE_ADAPTATION = "a destroyed attribute's cached VAOs are deleted with it" as const;

interface BackendLike {
  vaoCache?: Record<string, unknown>;
  gl?: { deleteVertexArray?(vao: unknown): void };
  get(attribute: unknown): { id?: number } | undefined;
}
type DestroyAttribute = (this: BackendLike, attribute: unknown) => void;

const INSTALLED = Symbol.for('s2u.vaoCachePrune');

/** Wraps `WebGLBackend.prototype.destroyAttribute` once (idempotent). */
export function installVaoCachePrune(): void {
  const proto = WebGLBackend.prototype as unknown as { destroyAttribute: DestroyAttribute; [INSTALLED]?: boolean };
  if (proto[INSTALLED]) return;
  const own = proto.destroyAttribute;
  proto.destroyAttribute = function (this: BackendLike, attribute: unknown): void {
    const id = this.get(attribute)?.id;
    const cache = this.vaoCache;
    if (typeof id === 'number' && cache) {
      const token = String(id);
      for (const key of Object.keys(cache)) {
        if (!key.split(':').includes(token)) continue;
        try { this.gl?.deleteVertexArray?.(cache[key]); } catch { /* a lost context: nothing to free */ }
        delete cache[key];
      }
    }
    own.call(this, attribute);
  };
  proto[INSTALLED] = true;
}

installVaoCachePrune();
