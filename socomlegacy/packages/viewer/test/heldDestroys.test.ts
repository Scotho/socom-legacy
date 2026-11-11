import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { WebGPUBackend } from 'three/webgpu';
import { holdDestroysToSubmit, heldDestroysFreed, orphanUniformDestroysSkipped, type HeldDestroysBackend } from '../src/heldDestroys';

/**
 * WEBGPU-HELD-DESTROY (LATER 856; `../src/heldDestroys`; product track, a renderer adaptation). Shadow's red #17
 * (turretCensus:175, MP51, WebGPU, d628ce86e twice): "[Buffer "bindingBuffer50_render_(vertex,fragment,compute)"] used
 * in submit while destroyed" in renderContext_0 -- a uniform buffer three destroyed while a pass that drew with it was
 * still being encoded. three r186's real backend is used here (constructed, no device): its `destroyUniformBuffer` and
 * records are three's own; `beginRender` / `finishRender` / the compute pair, which need a device, are replaced by
 * recorders standing for an encoder opened and submitted (`finishRender` submits synchronously: the pin below).
 */

interface Internals extends HeldDestroysBackend {
  isWebGPUBackend: true;
  get(object: object): Record<string, unknown>;
  has(object: object): boolean;
  destroyUniformBuffer(binding: object): void;
  beginRender(context: object): void;
  finishRender(context: object): void;
  beginCompute(group: object): void;
  finishCompute(group: object): void;
}

/** A real backend whose encoder calls record 'begin' and 'submit' in `log` instead of asking a device. */
function backendOf(): { backend: Internals; log: string[] } {
  const backend = new WebGPUBackend() as unknown as Internals;
  const log: string[] = [];
  backend.beginRender = () => { log.push('begin'); };
  backend.finishRender = () => { log.push('submit'); };
  backend.beginCompute = () => { log.push('begin compute'); };
  backend.finishCompute = () => { log.push('submit compute'); };
  return { backend, log };
}

/** A uniform buffer as `WebGPUBackend.createUniformBuffer` leaves it: its record holding the GPU buffer. */
function uniformBuffer(backend: Internals, log: string[], name: string): object {
  const binding = { name };
  backend.get(binding).buffer = { label: name, destroy: vi.fn(() => { log.push(`destroy ${name}`); }) };
  return binding;
}

describe('WEBGPU-HELD-DESTROY: a uniform buffer freed while a pass that drew with it is still open', () => {
  it('three r186 alone: the buffer is destroyed at once, before the pass is submitted (red #17)', () => {
    const { backend, log } = backendOf();
    const render = uniformBuffer(backend, log, 'render');
    const canvas = {};                               // renderContext_0
    backend.beginRender(canvas);
    backend.destroyUniformBuffer(render);           // a render object's dispose inside the pass
    backend.finishRender(canvas);
    expect(log).toEqual(['begin', 'destroy render', 'submit']);   // WebGPU: "used in submit while destroyed"
  });

  it('held: destroyed right after the pass is submitted; three\'s record is let go at once, as before', () => {
    const { backend, log } = backendOf();
    expect(holdDestroysToSubmit(backend)).toBe(true);
    const render = uniformBuffer(backend, log, 'render');
    const freed = heldDestroysFreed();
    const canvas = {};
    backend.beginRender(canvas);
    backend.destroyUniformBuffer(render);
    expect(backend.has(render)).toBe(false);        // three's own bookkeeping unchanged: a remake gets a new buffer
    expect(log).toEqual(['begin']);
    backend.finishRender(canvas);
    expect(log).toEqual(['begin', 'submit', 'destroy render']);
    expect(heldDestroysFreed() - freed).toBe(1);
  });

  it('outside a pass (between frames, a compile, a teardown) the destroy is immediate, as three does', () => {
    const { backend, log } = backendOf();
    holdDestroysToSubmit(backend);
    backend.destroyUniformBuffer(uniformBuffer(backend, log, 'a'));
    expect(log).toEqual(['destroy a']);
  });

  it('nested passes (a target drawn inside the canvas\'s pass): held until the outermost submit', () => {
    const { backend, log } = backendOf();
    holdDestroysToSubmit(backend);
    const a = uniformBuffer(backend, log, 'a');
    const canvas = {};
    const target = {};
    backend.beginRender(canvas);                     // renderContext_0's encoder open
    backend.beginRender(target);                     // a target drawn from inside it
    backend.destroyUniformBuffer(a);
    backend.finishRender(target);                    // the inner pass submitted; the outer still holds a's draws
    expect(log).toEqual(['begin', 'begin', 'submit']);
    backend.finishRender(canvas);
    expect(log).toEqual(['begin', 'begin', 'submit', 'submit', 'destroy a']);
  });

  it('a compute pass holds the same way', () => {
    const { backend, log } = backendOf();
    holdDestroysToSubmit(backend);
    const c = uniformBuffer(backend, log, 'c');
    const group = {};
    backend.beginCompute(group);
    backend.destroyUniformBuffer(c);
    backend.finishCompute(group);
    expect(log).toEqual(['begin compute', 'submit compute', 'destroy c']);
  });

  it('a submit that throws still lets the held buffers go (no pass left open forever, no leak)', () => {
    const { backend, log } = backendOf();
    backend.finishRender = () => { log.push('submit'); throw new Error('lost'); };
    holdDestroysToSubmit(backend);
    const a = uniformBuffer(backend, log, 'a');
    const canvas = {};
    backend.beginRender(canvas);
    backend.destroyUniformBuffer(a);
    expect(() => backend.finishRender(canvas)).toThrow('lost');
    expect(log).toEqual(['begin', 'submit', 'destroy a']);
    backend.destroyUniformBuffer(uniformBuffer(backend, log, 'b'));   // the count is back at 0: immediate again
    expect(log.at(-1)).toBe('destroy b');
  });

  it('review F1: a pass that threw before its submit is let go at the next microtask, not held for the page', async () => {
    // three r186 raises `_callDepth` in `_renderScene` with no try/finally: after a throw between `beginRender` and
    // `finishRender` every later frame asks `RenderContexts.get` for another key, so the thrown context is never finished.
    // A pass is encoded and submitted inside one synchronous `render`, so one still open at a microtask is such a pass.
    const { backend, log } = backendOf();
    holdDestroysToSubmit(backend);
    const thrown = {};
    backend.beginRender(thrown);                     // a frame that threw mid-encode: no finishRender, ever
    const a = uniformBuffer(backend, log, 'a');
    backend.destroyUniformBuffer(a);
    const next = {};                                 // the next frame's context: another object (the raised call depth)
    backend.beginRender(next);
    backend.finishRender(next);
    expect(log).toEqual(['begin', 'begin', 'submit']);   // the same task: the thrown pass still counts as open
    await Promise.resolve();
    expect(log).toEqual(['begin', 'begin', 'submit', 'destroy a']);
    backend.destroyUniformBuffer(uniformBuffer(backend, log, 'b'));
    expect(log.at(-1)).toBe('destroy b');            // nothing left open: immediate again
  });

  it('review F5: three r186 alone, a uniform buffer whose record holds no GPU buffer throws on its destroy', () => {
    // A record with no buffer (how it would arise is not known for uniform buffers; inferred from destroyAttribute's
    // XBOX-SRAKMD throw): three's `destroyUniformBuffer` reads `.buffer.destroy()` unguarded, as `destroyAttribute` does.
    const { backend } = backendOf();
    const orphan = {};
    backend.get(orphan);
    expect(() => backend.destroyUniformBuffer(orphan)).toThrow(/reading 'destroy'/);
  });

  it('review F5: held, an orphan record is let go without a throw, in a pass and out of one; nothing destroyed', () => {
    const { backend, log } = backendOf();
    holdDestroysToSubmit(backend);
    const skipped = orphanUniformDestroysSkipped();
    const a = {}, b = {};
    backend.get(a);                                  // a record, no buffer
    expect(() => backend.destroyUniformBuffer(a)).not.toThrow();
    expect(backend.has(a)).toBe(false);
    const canvas = {};
    backend.beginRender(canvas);
    backend.get(b);
    expect(() => backend.destroyUniformBuffer(b)).not.toThrow();
    expect(backend.has(b)).toBe(false);
    backend.finishRender(canvas);
    expect(() => backend.destroyUniformBuffer({})).not.toThrow();   // no record at all
    expect(orphanUniformDestroysSkipped() - skipped).toBe(3);
    expect(log).toEqual(['begin', 'submit']);       // nothing destroyed: there was nothing
  });

  it('installs once; nothing on WebGL2 or on a backend without the members', () => {
    const { backend } = backendOf();
    expect(holdDestroysToSubmit(backend)).toBe(true);
    const wrapped = backend.destroyUniformBuffer;
    expect(holdDestroysToSubmit(backend)).toBe(true);
    expect(backend.destroyUniformBuffer).toBe(wrapped);
    const gl = { isWebGPUBackend: false, get: () => ({}), destroyUniformBuffer: () => undefined, beginRender() {}, finishRender() {} };
    const destroy = gl.destroyUniformBuffer;
    expect(holdDestroysToSubmit(gl)).toBe(false);
    expect(gl.destroyUniformBuffer).toBe(destroy);
    expect(holdDestroysToSubmit({ isWebGPUBackend: true, get: () => ({}), destroyUniformBuffer: () => undefined })).toBe(false);
    expect(holdDestroysToSubmit(null)).toBe(false);
  });
});

describe('WEBGPU-HELD-DESTROY pin: the three r186 internals the hold rests on (a three upgrade fails here, loudly)', () => {
  it('destroyUniformBuffer destroys the record\'s buffer, then deletes the record', () => {
    const body = String((new WebGPUBackend() as unknown as Internals).destroyUniformBuffer);
    expect(body).toContain('uniformBufferData.buffer.destroy();');
    expect(body).toContain('this.delete( uniformBuffer );');
    // Review F5's F2: the whole body, so a step three adds (which the orphan path, rebuilding its delete by hand, would
    // skip) fails here at the upgrade.
    expect(body.replace(/\s+/g, '')).toBe(
      'destroyUniformBuffer(uniformBuffer){constuniformBufferData=this.get(uniformBuffer);uniformBufferData.buffer.destroy();this.delete(uniformBuffer);}',
    );
  });

  it('the render and compute passes are submitted synchronously inside finishRender / finishCompute', () => {
    const backend = new WebGPUBackend() as unknown as Internals;
    expect(String(backend.finishRender)).toContain('submit( this.device, renderContextData.encoder.finish() );');
    expect(String(backend.finishCompute)).toContain('submit( this.device, groupData.cmdEncoderGPU.finish() );');
    const bundle = readFileSync(createRequire(import.meta.url).resolve('three/webgpu'), 'utf8');
    expect(bundle).toContain('device.queue.submit( _commandList );');
  });

  it('a uniform buffer is destroyed only through three\'s bindings when a bind group\'s last user goes', () => {
    const bundle = readFileSync(createRequire(import.meta.url).resolve('three/webgpu'), 'utf8');
    expect(bundle).toContain('this.backend.destroyUniformBuffer( binding );');
    expect(bundle.split('backend.destroyUniformBuffer(').length - 1).toBe(1);   // `Bindings._destroyBindings`, the one caller
  });
});
