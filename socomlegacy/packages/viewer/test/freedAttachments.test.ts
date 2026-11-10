import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepthFormat, DepthTexture, RenderTarget, UnsignedIntType } from 'three';
import { WebGPUBackend } from 'three/webgpu';
import { attachmentsFreed, freedCompilesSkipped, skipFreedCompiles, type AttachmentContext } from '../src/freedAttachments';

/**
 * WEBGPU-DEPTHFMT (`../src/freedAttachments`; product track, a renderer adaptation). RC1's GPU view: three's async
 * pipelines refused ("GPUDepthStencilState ... format ... Required member is undefined") right after a match's teardown.
 * three r186's real backend is used here (constructed, no device: nothing reaches the GPU). The pipeline's own builder
 * (`pipelineUtils.createRenderPipeline`, which needs a device) is replaced by a recorder; the backend's
 * `createRenderPipeline` that the renderer calls, its records, `destroyTexture` and the format reads are three's own.
 */

/** three r186's backend internals reached here (its typings name none of them). */
interface Internals {
  isWebGPUBackend: true;
  has(object: object): boolean;
  get(object: object): Record<string, unknown>;
  destroyTexture(texture: object): void;
  createRenderPipeline(renderObject: { context: AttachmentContext }, promises: unknown[] | null): unknown;
  utils: { getCurrentColorFormat(context: AttachmentContext): unknown; getCurrentDepthStencilFormat(context: AttachmentContext): unknown; getTextureFormatGPU: unknown };
  textureUtils: { destroyTexture: unknown };
  getRenderCacheKey: unknown;
  needsRenderUpdate: unknown;
  pipelineUtils: { createRenderPipeline: (renderObject: unknown, promises: unknown[] | null) => void };
}

/** A real backend whose pipeline builder records the descriptors' contexts instead of asking a device. */
function backendOf(): { backend: Internals; built: AttachmentContext[] } {
  const backend = new WebGPUBackend() as unknown as Internals;
  const built: AttachmentContext[] = [];
  backend.pipelineUtils.createRenderPipeline = (renderObject) => { built.push((renderObject as { context: AttachmentContext }).context); };
  return { backend, built };
}

/**
 * A depth-buffered target as three r186 holds it once drawn or compiled: its colour texture and the depth texture
 * `Textures.updateRenderTarget` makes, each with the record `WebGPUTextureUtils.createTexture` leaves (its format, the
 * GPU texture); freed on dispose as `Textures._destroyRenderTarget` frees it -- every colour texture and the depth
 * texture, through the backend's `destroyTexture`.
 */
function drawnTarget(backend: Internals): { target: RenderTarget; context: AttachmentContext } {
  const target = new RenderTarget(256, 256, { samples: 0, depthBuffer: true });
  const depth = new DepthTexture(256, 256);
  depth.format = DepthFormat;
  depth.type = UnsignedIntType;
  depth.renderTarget = target;
  Object.assign(backend.get(target.texture), { format: 'rgba8unorm', texture: { destroy: vi.fn() } });
  Object.assign(backend.get(depth), { format: 'depth24plus', texture: { destroy: vi.fn() } });
  target.addEventListener('dispose', () => {
    for (const t of target.textures) backend.destroyTexture(t);
    backend.destroyTexture(depth);
  });
  // As `compileAsync` leaves the shared context: depth on, the target's textures.
  return { target, context: { textures: target.textures, depth: true, depthTexture: depth } };
}

let before = 0;
beforeEach(() => { before = freedCompilesSkipped(); });

describe('WEBGPU-DEPTHFMT: a compile queued across its target\'s dispose', () => {
  it('three r186 alone: the next queued pipeline is asked for with no colour and no depth format (RC1\'s red)', () => {
    const { backend, built } = backendOf();
    const { target, context } = drawnTarget(backend);
    backend.createRenderPipeline({ context }, []);                       // the first queued object's pipeline
    expect(built).toHaveLength(1);
    target.setSize(512, 512);                                            // three's setSize disposes: every record freed
    expect(backend.utils.getCurrentColorFormat(context)).toBeUndefined();
    expect(backend.utils.getCurrentDepthStencilFormat(context)).toBeUndefined();
    backend.createRenderPipeline({ context }, []);                       // the next: the descriptor WebGPU refuses
    expect(built).toHaveLength(2);
  });

  it.each([
    ['a resize (a Shadows tier)', (t: RenderTarget) => t.setSize(128, 128)],
    ['a dispose (the renderer\'s at play.stop)', (t: RenderTarget) => t.dispose()],
  ])('skipped: after %s the queued pipeline is not built; before it, and for a draw, as three does', (_what, free) => {
    const { backend, built } = backendOf();
    expect(skipFreedCompiles(backend)).toBe(true);
    const { target, context } = drawnTarget(backend);
    backend.createRenderPipeline({ context }, []);
    expect(built).toHaveLength(1);                                       // live attachments: built as before
    free(target);
    backend.createRenderPipeline({ context }, []);
    backend.createRenderPipeline({ context }, []);
    expect(built).toHaveLength(1);                                       // freed: nothing asked of the device
    expect(freedCompilesSkipped() - before).toBe(2);
    backend.createRenderPipeline({ context }, null);                     // a draw's own pipeline is never skipped
    expect(built).toHaveLength(2);
  });

  it('the check: a freed colour texture alone, a freed depth texture only with depth on, the canvas never', () => {
    const { backend } = backendOf();
    const { target, context } = drawnTarget(backend);
    const reads = { has: backend.has.bind(backend), get: backend.get.bind(backend) as (o: object) => { format?: unknown } };
    expect(attachmentsFreed(reads, context)).toBe(false);
    backend.destroyTexture(target.texture);
    expect(attachmentsFreed(reads, context)).toBe(true);
    expect(attachmentsFreed(reads, { textures: null, depth: true, depthTexture: null })).toBe(false);   // the canvas
    const other = drawnTarget(backend);
    backend.destroyTexture(other.context.depthTexture!);
    expect(attachmentsFreed(reads, { ...other.context, depth: false })).toBe(false);
    expect(attachmentsFreed(reads, other.context)).toBe(true);
    // The check makes no record of its own: a freed texture stays unrecorded for three's next allocation.
    expect(backend.has(target.texture)).toBe(false);
  });

  it('installs once; nothing on WebGL2 or on a backend without the members', () => {
    const { backend } = backendOf();
    expect(skipFreedCompiles(backend)).toBe(true);
    const wrapped = backend.createRenderPipeline;
    expect(skipFreedCompiles(backend)).toBe(true);
    expect(backend.createRenderPipeline).toBe(wrapped);
    const gl = { isWebGPUBackend: false, has: () => true, get: () => ({}), createRenderPipeline: () => undefined };
    const create = gl.createRenderPipeline;
    expect(skipFreedCompiles(gl)).toBe(false);
    expect(gl.createRenderPipeline).toBe(create);
    expect(skipFreedCompiles({ isWebGPUBackend: true, createRenderPipeline: () => undefined })).toBe(false);
    expect(skipFreedCompiles(null)).toBe(false);
  });
});

describe('WEBGPU-DEPTHFMT pin: the three r186 internals the skip rests on (a three upgrade fails here, loudly)', () => {
  it('the backend\'s createRenderPipeline hands the render object and the promises to the pipeline builder', () => {
    const backend = new WebGPUBackend() as unknown as Internals;
    expect(String(backend.createRenderPipeline)).toContain('pipelineUtils.createRenderPipeline( renderObject, promises )');
  });

  it('the builder reads the colour and depth formats from the textures\' GPU records', () => {
    const backend = new WebGPUBackend() as unknown as Internals;
    const build = String(backend.pipelineUtils.createRenderPipeline);
    expect(build).toContain('utils.getTextureFormatGPU( texture )');
    expect(build).toContain('utils.getCurrentDepthStencilFormat');
    expect(build).toContain('promises === null');                     // the draw's synchronous path vs the compile's
    expect(String(backend.utils.getTextureFormatGPU)).toContain('this.backend.get( texture ).format');
  });

  it('a texture\'s destroy deletes its record, and the backend can tell a record is there without making one', () => {
    const backend = new WebGPUBackend() as unknown as Internals;
    expect(String(backend.textureUtils.destroyTexture)).toContain('backend.delete( texture )');
    expect(typeof backend.has).toBe('function');
    const t = {};
    expect(backend.has(t)).toBe(false);
    backend.get(t);
    expect(backend.has(t)).toBe(true);
  });

  it('a skipped pipeline is never drawn: the cache key and the update check carry both formats; no GPU object, not ready', () => {
    // The take-2 review's F2: the skip is safe only while a live draw re-keys on the remade target's formats and three
    // draws nothing with a pipeline that has no GPU object (both as for today's refused one).
    const backend = new WebGPUBackend() as unknown as Internals;
    expect(String(backend.getRenderCacheKey)).toContain('utils.getCurrentColorFormat( renderContext ), utils.getCurrentDepthStencilFormat( renderContext )');
    expect(String(backend.needsRenderUpdate)).toContain('data.colorFormat !== colorFormat || data.depthStencilFormat !== depthStencilFormat');
    const bundle = readFileSync(createRequire(import.meta.url).resolve('three/webgpu'), 'utf8');
    expect(bundle).toContain('return pipelineData.pipeline !== undefined && pipelineData.pipeline !== null;');   // Pipelines.isReady
    expect(bundle).toContain('if ( this._pipelines.isReady( renderObject ) ) {');                              // the draw asks it
  });
});
