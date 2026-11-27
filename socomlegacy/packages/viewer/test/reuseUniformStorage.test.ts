import { describe, expect, it, vi } from 'vitest';
import WebGLBackend from 'three/src/renderers/webgl-fallback/WebGLBackend.js';
import { reuseUniformStorage, type UniformStorageBackend } from '../src/reuseUniformStorage';

function fixture() {
  const backend = new WebGLBackend() as unknown as UniformStorageBackend & { gl: NonNullable<UniformStorageBackend['gl']>; destroyUniformBuffer(binding: object): void };
  let bound: object | null = null;
  const bytes = new Map<object, Uint8Array>();
  const data = vi.fn((_target: number, value: number | ArrayBufferView) => {
    bytes.set(bound!, typeof value === 'number' ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice());
  });
  const sub = vi.fn((_target: number, offset: number, value: ArrayBufferView, start = 0, length?: number) => {
    const element = (value as Uint8Array).BYTES_PER_ELEMENT ?? 1;
    const size = length === undefined ? value.byteLength - start * element : length * element;
    bytes.get(bound!)!.set(new Uint8Array(value.buffer, value.byteOffset + start * element, size), offset);
  });
  backend.gl = { UNIFORM_BUFFER: 35345, UNIFORM_BUFFER_BINDING: 35368, BUFFER_SIZE: 34660, DYNAMIC_DRAW: 35048, createBuffer: () => ({}),
    getParameter: () => bound, getBufferParameter: () => bytes.get(bound!)?.byteLength ?? 0,
    deleteBuffer: (b: object) => { bytes.delete(b); }, bindBuffer: (_target: number, b: object) => { bound = b; }, bufferData: data, bufferSubData: sub } as typeof backend.gl;
  const binding = { isUniformBuffer: true, buffer: new Float32Array(4), updateRanges: [] as { start: number; count: number }[] };
  return { backend, binding, bytes, data, sub };
}

describe('Xbox WebGL uniform storage ownership', () => {
  it('reuses one allocation across 200 updates with exactly the original uploaded bytes', () => {
    const f = fixture(); expect(reuseUniformStorage(f.backend)).toBe(true);
    f.backend.createUniformBuffer!(f.binding);
    for (let i = 0; i < 200; i++) { f.binding.buffer.set([i, -i, i / 3, 1]); f.backend.updateBinding!(f.binding);
      expect(f.bytes.get(f.backend.get!(f.binding).bufferGPU!)).toEqual(new Uint8Array(f.binding.buffer.buffer)); }
    expect(f.data).toHaveBeenCalledTimes(1); expect(f.sub).toHaveBeenCalledTimes(200);
  });
  it('lets three resize storage, then reuses the new capacity', () => {
    const f = fixture(); reuseUniformStorage(f.backend); f.backend.createUniformBuffer!(f.binding);
    f.binding.buffer = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]); f.backend.updateBinding!(f.binding); f.backend.updateBinding!(f.binding);
    expect(f.data).toHaveBeenCalledTimes(2); expect(f.sub).toHaveBeenCalledTimes(1);
    expect(f.bytes.get(f.backend.get!(f.binding).bufferGPU!)).toEqual(new Uint8Array(f.binding.buffer.buffer));
  });
  it('leaves partial ranges to the real backend and tracks destruction/recreation', () => {
    const f = fixture(); reuseUniformStorage(f.backend); f.backend.createUniformBuffer!(f.binding);
    f.binding.buffer.set([1, 2, 3, 4]); f.backend.updateBinding!(f.binding);
    f.binding.buffer.set([8, 9, 10, 11]); f.binding.updateRanges.push({ start: 1, count: 2 }); f.backend.updateBinding!(f.binding);
    expect([...new Float32Array(f.bytes.get(f.backend.get!(f.binding).bufferGPU!)!.buffer)]).toEqual([1, 9, 10, 4]);
    f.backend.destroyUniformBuffer(f.binding); f.binding.updateRanges.length = 0;
    f.backend.createUniformBuffer!(f.binding); f.backend.updateBinding!(f.binding);
    expect(f.data).toHaveBeenCalledTimes(2); expect(f.bytes.size).toBe(1);
  });
  it('is idempotent and leaves other backends and incomplete contracts alone', () => {
    expect(reuseUniformStorage({ isWebGLBackend: false })).toBe(false);
    expect(reuseUniformStorage({ isWebGLBackend: true })).toBe(false);
    const f = fixture(); reuseUniformStorage(f.backend); const update = f.backend.updateBinding;
    expect(reuseUniformStorage(f.backend)).toBe(true); expect(f.backend.updateBinding).toBe(update);
  });
  it('tracks storage replaced by the bind-group update before a later individual update', () => {
    const f = fixture(); reuseUniformStorage(f.backend); f.backend.createUniformBuffer!(f.binding);
    f.binding.buffer = new Float32Array([2, 3]); f.backend.updateBindings!({ bindings: [f.binding] });
    f.binding.buffer = new Float32Array([4, 5, 6, 7]); f.backend.updateBinding!(f.binding);
    expect(f.bytes.get(f.backend.get!(f.binding).bufferGPU!)).toEqual(new Uint8Array(f.binding.buffer.buffer));
    expect(f.data).toHaveBeenCalledTimes(3);
  });
  it('retries a failed initial allocation and a failed resize without consuming GL errors', () => {
    const f = fixture(); reuseUniformStorage(f.backend);
    f.data.mockImplementationOnce(() => {}); // GL reports allocation failure through its error state.
    f.backend.createUniformBuffer!(f.binding);
    f.binding.buffer.set([1, 2, 3, 4]); f.backend.updateBinding!(f.binding);
    expect(f.data).toHaveBeenCalledTimes(2);
    f.backend.updateBinding!(f.binding); expect(f.sub).toHaveBeenCalledTimes(1);
    f.binding.buffer = new Float32Array([5, 6]); f.data.mockImplementationOnce(() => {});
    f.backend.updateBindings!({ bindings: [f.binding] });
    f.backend.updateBinding!(f.binding); f.backend.updateBinding!(f.binding);
    expect(f.bytes.get(f.backend.get!(f.binding).bufferGPU!)).toEqual(new Uint8Array(f.binding.buffer.buffer));
    expect(f.data).toHaveBeenCalledTimes(4); expect(f.sub).toHaveBeenCalledTimes(2);
  });
});
