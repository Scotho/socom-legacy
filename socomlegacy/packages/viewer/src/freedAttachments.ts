/**
 * WEBGPU-DEPTHFMT (product track, a renderer adaptation: no original -- the PS2 has no render pipelines; nothing of the
 * game's behaviour, no pixel and no timing changes). RC1's GPU view (shadow's A4500, Chrome 157 WebGPU, mega 088766214):
 * forgeCues:197 logged four "Async render pipeline creation failed (renderPipeline_MeshBasicNodeMaterial_...): ...
 * 'GPUDepthStencilState': Required member is undefined", all right after `play.stop`, the match's teardown.
 *
 * Why, in three r186:
 * - `compileAsync` (our warm-ups: `./renderer` `warm`, `prepare`'s queue, `warmGlow`) captures a render context, then
 *   works through its objects one by one, awaiting between them; each object's pipeline is made when its turn comes.
 * - Render contexts are keyed on a target's ATTACHMENTS, not on the target (`RenderContexts.get`): the PS2 `frame`, the
 *   character-shadow map, the glow target and its twin share one.
 * - A pipeline's colour and depth formats are read when it is made, from the context's textures' GPU records
 *   (`WebGPUUtils.getCurrentColorFormat`, `getCurrentDepthStencilFormat` -> `getTextureFormatGPU`).
 * - A target disposed or resized (`RenderTarget.setSize` disposes) -- the renderer's dispose at a teardown, a Shadows
 *   tier, a flash's end -- frees every one of its textures' records (`Textures._destroyRenderTarget` ->
 *   `WebGPUTextureUtils.destroyTexture` -> `backend.delete`). The pipelines still queued then ask for attachments with
 *   no format, and WebGPU refuses the descriptor (Chrome names `depthStencil` first: it reads the members in order).
 * - WebGL2 links programs by their code, with no attachment formats, so it never showed until WebGPU became the
 *   default (MEGA.R8).
 *
 * The skip: on WebGPU, a pipeline asked for by a compile (`promises` given: `compileAsync`) whose context has a colour
 * or depth texture with no live GPU record builds nothing. Its pipeline is for attachments that no longer exist. three
 * already handles a pipeline with no GPU object: `Pipelines.isReady` is false, so nothing draws with it, and a live draw
 * keys its own pipeline on the remade target's formats (`WebGPUBackend.needsRenderUpdate`). That is the same as today's
 * refused pipeline, but without the refused descriptor and its console error. A draw's own pipeline (`promises` null)
 * is never skipped: a draw allocates its target's textures first (`Textures.updateRenderTarget`).
 */

/** What of a three render context the check reads. */
export interface AttachmentContext {
  textures?: readonly object[] | null;
  depth?: boolean;
  depthTexture?: object | null;
}

/** The shape of three's backend this reads and wraps. */
export interface FreedAttachmentsBackend {
  isWebGPUBackend?: boolean;
  // Method syntax: three's own signatures (a required `context`, a richer record) stand in for these.
  has?(object: object): boolean;
  get?(object: object): { format?: unknown };
  createRenderPipeline?(renderObject: { context?: AttachmentContext | null }, promises: unknown[] | null): unknown;
}

/** A texture whose GPU record is live: three's backend has one, with its format (`WebGPUTextureUtils.createTexture`). */
function live(backend: Required<Pick<FreedAttachmentsBackend, 'has' | 'get'>>, texture: object): boolean {
  return backend.has(texture) && backend.get(texture).format !== undefined;   // `has` first: `get` would make a record
}

/** Whether `context`'s colour textures or (with depth on) its depth texture have no live GPU record. */
export function attachmentsFreed(backend: Required<Pick<FreedAttachmentsBackend, 'has' | 'get'>>, context: AttachmentContext): boolean {
  for (const t of context.textures ?? []) if (!live(backend, t)) return true;
  return context.depth === true && !!context.depthTexture && !live(backend, context.depthTexture);
}

const SKIPPING = Symbol('webgpu-depthfmt');

/** The compiles' pipelines skipped since the page loaded (a dev instrument's read; monotonic). */
let skipped = 0;
export function freedCompilesSkipped(): number { return skipped; }

/**
 * Installs the skip on `backend` (once). False, and three left as it is, on WebGL2 or when the members it relies on
 * are not there (a three upgrade: `test/freedAttachments.test.ts` pins them).
 */
export function skipFreedCompiles(backend: FreedAttachmentsBackend | null | undefined): boolean {
  if (backend?.isWebGPUBackend !== true) return false;
  const { has, get, createRenderPipeline } = backend;
  if (typeof has !== 'function' || typeof get !== 'function' || typeof createRenderPipeline !== 'function') return false;
  const marked = backend as FreedAttachmentsBackend & { [SKIPPING]?: true };
  if (marked[SKIPPING]) return true;
  const reads = { has: has.bind(backend), get: get.bind(backend) };
  const create = createRenderPipeline.bind(backend);
  backend.createRenderPipeline = (renderObject, promises) => {
    if (promises != null && renderObject.context && attachmentsFreed(reads, renderObject.context)) {
      skipped++;
      return undefined;
    }
    return create(renderObject, promises);
  };
  marked[SKIPPING] = true;
  return true;
}
