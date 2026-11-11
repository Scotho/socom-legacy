/**
 * XBOX-SRAKMD (2) (from LATER 859's first look -- its row is filed on `agent/red17-defer`; product track, a renderer
 * adaptation: no original -- the PS2 has no GPU buffers; nothing of the game's behaviour, no pixel and no timing
 * changes). Central's client_errors (b0's read,
 * 2026-11-10): on Xbox pages that lost their WebGPU device (0x887A0005 DEVICE_REMOVED, raised on CreateBuffer), a later
 * dispose of a geometry threw "Cannot read properties of undefined (reading 'destroy')" -- v0.4.16 39 s after the loss
 * (a dispose over the scene graph), v0.4.18 77 s after it inside the match's close, which the throw cut short; the same
 * message came from three v0.4.14 pages with no adapter named.
 *
 * Why, in three r186: a geometry's dispose reaches `Attributes.delete` -> `WebGPUBackend.destroyAttribute` ->
 * `WebGPUAttributeUtils.destroyAttribute`, which reads the attribute's (or its interleaved buffer's) backend record and
 * calls `buffer.destroy()` on it with no guard. An attribute three counted but whose upload made no GPU buffer has a
 * record with no buffer, so the dispose throws. How the upload failed is inferred, not seen: the beacons name
 * DEVICE_REMOVED on CreateBuffer, and a lost device's `createBuffer` normally returns an invalid buffer rather than
 * throwing, so a mapped-at-creation upload that threw is the likely route (review F4). The guard holds whichever route
 * left the record without a buffer.
 *
 * The guard: on WebGPU, an attribute whose record holds no GPU buffer has its record let go as three would, and nothing
 * is destroyed (there is nothing to destroy); one that holds a buffer is destroyed by three as before.
 */

/** The shape of three's backend this reads and wraps (method syntax: three's own signatures stand in for these). */
export interface OrphanAttributesBackend {
  isWebGPUBackend?: boolean;
  has?(object: object): boolean;
  get?(object: object): { buffer?: unknown };
  delete?(object: object): unknown;
  destroyAttribute?(attribute: object): void;
}

const GUARDING = Symbol('webgpu-orphan-attributes');

/** The destroys skipped since the page loaded: attributes with no GPU buffer (monotonic; its test reads it, no page does). */
let skipped = 0;
export function orphanAttributeDestroysSkipped(): number { return skipped; }

/** The object three keys an attribute's GPU buffer on (`WebGPUAttributeUtils._getBufferAttribute`). */
const bufferOwner = (attribute: object): object => {
  const a = attribute as { isInterleavedBufferAttribute?: boolean; data?: object };
  return a.isInterleavedBufferAttribute === true && a.data ? a.data : attribute;
};

/**
 * Installs the guard on `backend` (once). False, and three left as it is, on WebGL2 or when the members it relies on are
 * not there (a three upgrade: `test/orphanAttributes.test.ts` pins them).
 */
export function guardOrphanAttributeDestroys(backend: OrphanAttributesBackend | null | undefined): boolean {
  if (backend?.isWebGPUBackend !== true) return false;
  const { has, get, delete: drop, destroyAttribute } = backend;
  if (typeof has !== 'function' || typeof get !== 'function' || typeof drop !== 'function' || typeof destroyAttribute !== 'function') return false;
  const marked = backend as OrphanAttributesBackend & { [GUARDING]?: true };
  if (marked[GUARDING]) return true;
  const holds = (o: object): boolean => has.call(backend, o) && get.call(backend, o).buffer != null;   // `has` first: `get` makes a record
  const destroy = destroyAttribute.bind(backend);
  backend.destroyAttribute = (attribute) => {
    if (holds(bufferOwner(attribute))) { destroy(attribute); return; }
    skipped++;
    drop.call(backend, attribute);                     // as three's own destroy ends: the attribute's record let go
  };
  marked[GUARDING] = true;
  return true;
}
