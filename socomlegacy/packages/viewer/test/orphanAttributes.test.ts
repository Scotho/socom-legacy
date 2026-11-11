import { describe, expect, it, vi } from 'vitest';
import { BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { WebGPUBackend } from 'three/webgpu';
import { guardOrphanAttributeDestroys, orphanAttributeDestroysSkipped, type OrphanAttributesBackend } from '../src/orphanAttributes';

/**
 * XBOX-SRAKMD (2) (`../src/orphanAttributes`; product track, a renderer adaptation). Central's client_errors (b0's read,
 * 2026-11-10): after a WebGPU device loss on Xbox (DEVICE_REMOVED on CreateBuffer), a geometry's later dispose threw
 * "Cannot read properties of undefined (reading 'destroy')" -- v0.4.16 39 s after the loss (a scene traverse), v0.4.18
 * 77 s after it inside the match's close: three's `WebGPUAttributeUtils.destroyAttribute` reads the attribute's GPU
 * buffer record with no guard, and an attribute whose upload never made a buffer has none. three r186's real backend is
 * used here (constructed, no device).
 */

interface Internals extends OrphanAttributesBackend {
  isWebGPUBackend: true;
  has(object: object): boolean;
  get(object: object): Record<string, unknown>;
  destroyAttribute(attribute: object): void;
  attributeUtils: { destroyAttribute: unknown };
}

const backendOf = (): Internals => new WebGPUBackend() as unknown as Internals;

/** An attribute as three's upload leaves it: its record holding the GPU buffer. */
function uploaded(backend: Internals): { attribute: BufferAttribute; destroy: ReturnType<typeof vi.fn> } {
  const attribute = new BufferAttribute(new Float32Array(3), 3);
  const destroy = vi.fn();
  backend.get(attribute).buffer = { destroy };
  return { attribute, destroy };
}

describe('XBOX-SRAKMD (2): an attribute with no GPU buffer, destroyed after a lost device', () => {
  it('three r186 alone: destroying an attribute whose upload made no buffer throws (the Xbox pages\' error)', () => {
    const backend = backendOf();
    const attribute = new BufferAttribute(new Float32Array(3), 3);
    expect(() => backend.destroyAttribute(attribute)).toThrow(/reading 'destroy'/);
  });

  it('guarded: no throw, nothing destroyed, the record let go; a buffer that exists is destroyed as before', () => {
    const backend = backendOf();
    expect(guardOrphanAttributeDestroys(backend)).toBe(true);
    const skipped = orphanAttributeDestroysSkipped();
    const orphan = new BufferAttribute(new Float32Array(3), 3);
    backend.get(orphan);                               // a record with no buffer: an upload that failed on the lost device
    expect(() => backend.destroyAttribute(orphan)).not.toThrow();
    expect(backend.has(orphan)).toBe(false);
    expect(() => backend.destroyAttribute(new BufferAttribute(new Float32Array(3), 3))).not.toThrow();   // no record at all
    expect(orphanAttributeDestroysSkipped() - skipped).toBe(2);
    const { attribute, destroy } = uploaded(backend);
    backend.destroyAttribute(attribute);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(backend.has(attribute)).toBe(false);
  });

  it('an interleaved attribute is read through its buffer, as three reads it', () => {
    const backend = backendOf();
    guardOrphanAttributeDestroys(backend);
    const shared = new InterleavedBuffer(new Float32Array(6), 6);
    const a = new InterleavedBufferAttribute(shared, 3, 0);
    expect(() => backend.destroyAttribute(a)).not.toThrow();   // the buffer's record has no GPU buffer
    const destroy = vi.fn();
    backend.get(shared).buffer = { destroy };
    backend.destroyAttribute(new InterleavedBufferAttribute(shared, 3, 3));
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('installs once; nothing on WebGL2 or on a backend without the members', () => {
    const backend = backendOf();
    expect(guardOrphanAttributeDestroys(backend)).toBe(true);
    const wrapped = backend.destroyAttribute;
    expect(guardOrphanAttributeDestroys(backend)).toBe(true);
    expect(backend.destroyAttribute).toBe(wrapped);
    const gl = { isWebGPUBackend: false, has: () => true, get: () => ({}), delete: () => undefined, destroyAttribute: () => undefined };
    const destroy = gl.destroyAttribute;
    expect(guardOrphanAttributeDestroys(gl)).toBe(false);
    expect(gl.destroyAttribute).toBe(destroy);
    expect(guardOrphanAttributeDestroys({ isWebGPUBackend: true, destroyAttribute: () => undefined })).toBe(false);
    expect(guardOrphanAttributeDestroys(null)).toBe(false);
  });
});

describe('XBOX-SRAKMD (2) pin: the three r186 internals the guard rests on (a three upgrade fails here, loudly)', () => {
  it('the backend hands the destroy to its attribute utilities, which read the buffer record unguarded', () => {
    const backend = backendOf();
    expect(String(backend.destroyAttribute)).toContain('this.attributeUtils.destroyAttribute( attribute );');
    const body = String(backend.attributeUtils.destroyAttribute);
    expect(body).toContain('backend.get( this._getBufferAttribute( attribute ) );');
    expect(body).toContain('data.buffer.destroy();');
    expect(body).toContain('backend.delete( attribute );');
  });
});
