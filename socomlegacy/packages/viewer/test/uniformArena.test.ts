import { describe, expect, it, vi } from 'vitest';
import WebGLBackend from 'three/src/renderers/webgl-fallback/WebGLBackend.js';
import { installUniformArena } from '../src/uniformArena';
import { reuseUniformStorage } from '../src/reuseUniformStorage';

function fixture() {
  const backend = new WebGLBackend() as any;
  const bytes = new Map<object, Uint8Array>(), targets = new Map<number, object>();
  const indexed = new Map<number, { gpu: object; offset: number; size: number }>();
  const data = vi.fn((target: number, value: number | ArrayBufferView): void => { bytes.set(targets.get(target)!, typeof value === 'number' ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()); });
  const sub = vi.fn((target: number, offset: number, value: any, start = 0, length = 0) => {
    const unit = value.BYTES_PER_ELEMENT;
    bytes.get(targets.get(target)!)!.set(new Uint8Array(value.buffer, value.byteOffset + start * unit, (length || value.length - start) * unit), offset);
  });
  const gl = {
    UNIFORM_BUFFER: 35345, UNIFORM_BUFFER_BINDING: 35368, BUFFER_SIZE: 34660, DYNAMIC_DRAW: 35048, UNIFORM_BUFFER_OFFSET_ALIGNMENT: 35380, MAX_UNIFORM_BLOCK_SIZE: 35376,
    COPY_READ_BUFFER: 36662, COPY_WRITE_BUFFER: 36663, COPY_READ_BUFFER_BINDING: 36662, COPY_WRITE_BUFFER_BINDING: 36663, TEXTURE0: 33984,
    createBuffer: () => ({}), deleteBuffer: (gpu: object) => { bytes.delete(gpu); },
    getParameter: (key: number) => key === 35380 ? 256 : key === 35376 ? 65536 : targets.get(key === 35368 ? 35345 : key) ?? null,
    getBufferParameter: (target: number) => bytes.get(targets.get(target)!)?.byteLength ?? 0,
    bindBuffer: (target: number, gpu: object) => { targets.set(target, gpu); }, bufferData: data, bufferSubData: sub,
    bindBufferRange: vi.fn((_target: number, index: number, gpu: object, offset: number, size: number) => { indexed.set(index, { gpu, offset, size }); }),
    bindBufferBase: (_target: number, index: number, gpu: object) => { indexed.set(index, { gpu, offset: 0, size: bytes.get(gpu)?.length ?? 0 }); },
    copyBufferSubData: (read: number, write: number, from: number, to: number, length: number) => bytes.get(targets.get(write)!)!.set(bytes.get(targets.get(read)!)!.subarray(from, from + length), to),
  };
  const state = {
    currentBoundBufferBases: {} as Record<string, unknown>, bindTexture: vi.fn(),
    bindBufferBase(target: number, index: number, gpu: object) {
      const key = `${target}-${index}`;
      if (this.currentBoundBufferBases[key] !== gpu) { gl.bindBufferBase(target, index, gpu); this.currentBoundBufferBases[key] = gpu; }
    },
  };
  backend.gl = gl; backend.state = state; backend.dispose = vi.fn(async () => {});
  const binding = (values = [0, 0, 0, 0]) => ({ isUniformsGroup: true, isUniformBuffer: true, buffer: new Float32Array(values), updateRanges: [] as { start: number; count: number }[] });
  const read = (b: object) => { backend._bindUniforms([{ bindings: [b] }]); const v = indexed.get(0)!; return [...new Float32Array(bytes.get(v.gpu)!.slice(v.offset, v.offset + v.size).buffer)]; };
  return { backend, gl, state, bytes, data, sub, binding, read, indexed };
}

describe('bounded Xbox uniform arena', () => {
  it('composes after storage reuse through resize, detach, mixed groups and destruction', async () => {
    const f = fixture();
    expect(reuseUniformStorage(f.backend)).toBe(true);
    expect(installUniformArena(f.backend)).toBe(true);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]), ordinary = { ...f.binding([9, 10, 11, 12]), isUniformsGroup: false };
    for (const x of [a, b, ordinary]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    a.buffer = new Float32Array(300).fill(99); f.backend.updateBinding(a);
    b.updateRanges.push({ start: 2, count: 0 }); b.buffer.fill(42);
    ordinary.buffer.fill(71);
    f.backend.updateBindings({ bindings: [a, b, ordinary] });
    expect(f.read(a)).toEqual([...a.buffer]); expect(f.read(b)).toEqual([5, 6, 42, 42]);
    expect(f.read(ordinary)).toEqual([71, 71, 71, 71]);
    b.updateRanges.length = 0; b.buffer.fill(73); f.backend.updateBinding(b);
    expect(f.read(b)).toEqual([73, 73, 73, 73]);
    for (const x of [a, b, ordinary]) f.backend.destroyUniformBuffer(x);
    expect(f.bytes.size).toBe(0); await f.backend.dispose();
  });

  it('packs 1000 independent uniform bindings into four pages with exact per-binding bytes', () => {
    const f = fixture(); expect(installUniformArena(f.backend)).toBe(true);
    const bindings = Array.from({ length: 1000 }, (_, i) => f.binding([i, -i, i / 3, 1]));
    for (const b of bindings) { f.backend.createUniformBuffer(b); f.backend.updateBinding(b); }
    expect(f.bytes.size).toBe(4);
    for (const b of bindings) expect(f.read(b)).toEqual([...b.buffer]);
    for (const v of f.gl.bindBufferRange.mock.calls) expect(v[3] % 256).toBe(0);
  });

  it('preserves partial writes and clears reused slots without touching live neighbours', () => {
    const f = fixture(); installUniformArena(f.backend);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]);
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    a.buffer.set([9, 10, 11, 12]); a.updateRanges.push({ start: 1, count: 2 });
    f.backend.updateBindings({ bindings: [a, b] });
    expect(f.read(a)).toEqual([1, 10, 11, 4]); expect(f.read(b)).toEqual([5, 6, 7, 8]);
    f.backend.destroyUniformBuffer(a);
    const c = f.binding(); f.backend.createUniformBuffer(c);
    expect(f.read(c)).toEqual([0, 0, 0, 0]); expect(f.bytes.size).toBe(1);
    f.backend.destroyUniformBuffer(b); expect(f.bytes.size).toBe(1);
    f.backend.destroyUniformBuffer(c); expect(f.bytes.size).toBe(0);
  });

  it('rebinds ranges after ordinary indexed binds and preserves texture slots', () => {
    const f = fixture(); installUniformArena(f.backend);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]), texture = { isSampledTexture: true };
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    Object.assign(f.backend.get(texture), { textureGPU: 'texture', glTextureType: 3553 });
    f.read(b); const range = f.indexed.get(0)!;
    f.state.bindBufferBase(f.gl.UNIFORM_BUFFER, 0, range.gpu); // ArrayCamera's separate camera-index binding.
    expect(f.read(b)).toEqual([5, 6, 7, 8]);
    f.backend._bindUniforms([{ bindings: [a, texture, b] }]);
    expect(f.state.bindTexture).toHaveBeenCalledWith(3553, 'texture', f.gl.TEXTURE0);
    expect(f.indexed.get(1)!.offset).not.toBe(f.indexed.get(0)!.offset);
  });

  it('bounds page storage and falls back without dropping any uniforms', async () => {
    const f = fixture(); installUniformArena(f.backend, { budgetBytes: 65536 });
    const bindings = Array.from({ length: 260 }, (_, i) => f.binding([i, 2, 3, 4]));
    for (const b of bindings) { f.backend.createUniformBuffer(b); f.backend.updateBinding(b); }
    expect(f.bytes.size).toBe(5); // One page, four ordinary buffers.
    for (const b of bindings) expect(f.read(b)).toEqual([...b.buffer]);
    for (const b of bindings.slice(256)) f.backend.destroyUniformBuffer(b);
    await f.backend.dispose(); expect(f.bytes.size).toBe(0);
  });

  it('handles whole-buffer size changes without overwriting another slot', () => {
    const f = fixture(); installUniformArena(f.backend);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]);
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    a.buffer = new Float32Array(300).fill(9); f.backend.updateBinding(a);
    expect(f.read(a)).toEqual([...a.buffer]); expect(f.read(b)).toEqual([5, 6, 7, 8]);
  });

  it('honours typed subviews and a partial first upload into a recycled slot', () => {
    const f = fixture(); installUniformArena(f.backend);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]);
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    f.backend.destroyUniformBuffer(a);
    const c = f.binding(); c.buffer = new Float32Array(new Float32Array([99, 10, 11, 12, 13, 99]).buffer, 4, 4);
    c.updateRanges.push({ start: 1, count: 2 }); f.backend.createUniformBuffer(c); f.backend.updateBinding(c);
    expect(f.read(c)).toEqual([0, 11, 12, 0]); expect(f.read(b)).toEqual([5, 6, 7, 8]);
  });

  it('isolates zero-count and out-of-bounds updates before using the native path', () => {
    const f = fixture(); installUniformArena(f.backend);
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]);
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    a.buffer.set([9, 10, 11, 12]); a.updateRanges.push({ start: 2, count: 0 });
    f.backend.updateBinding(a); expect(f.read(a)).toEqual([1, 2, 11, 12]);
    b.buffer = new Float32Array(8).fill(99); b.updateRanges.push({ start: 3, count: 4 });
    // The fake GL reports overflow by throwing; real GL reports INVALID_VALUE.
    expect(() => f.backend.updateBinding(b)).toThrow(RangeError);
    expect(f.read(a)).toEqual([1, 2, 11, 12]); expect(f.read(b)).toEqual([5, 6, 7, 8]);
  });

  it('falls back on resize when the arena budget is full, and preserves slots if fallback allocation fails', () => {
    const f = fixture(); installUniformArena(f.backend, { budgetBytes: 65536 });
    const a = f.binding([1, 2, 3, 4]), b = f.binding([5, 6, 7, 8]);
    for (const x of [a, b]) { f.backend.createUniformBuffer(x); f.backend.updateBinding(x); }
    a.buffer = new Float32Array(300).fill(9); f.data.mockImplementationOnce(() => undefined);
    expect(() => f.backend.updateBinding(a)).toThrow('Uniform fallback storage unavailable');
    expect(f.read(a)).toEqual([1, 2, 3, 4]); expect(f.read(b)).toEqual([5, 6, 7, 8]);
    f.backend.updateBinding(a); expect(f.read(a)).toEqual([...a.buffer]); expect(f.bytes.size).toBe(2);
    expect(f.read(b)).toEqual([5, 6, 7, 8]);
  });

  it('does not publish failed pages and respects state reset and install guards', () => {
    const f = fixture(); expect(installUniformArena({ isWebGLBackend: false })).toBe(false);
    expect(installUniformArena(f.backend)).toBe(true); const method = f.backend.updateBinding;
    expect(installUniformArena(f.backend)).toBe(true); expect(f.backend.updateBinding).toBe(method);
    f.data.mockImplementationOnce(() => undefined);
    const a = f.binding([1, 2, 3, 4]); f.backend.createUniformBuffer(a); f.backend.updateBinding(a);
    expect(f.bytes.size).toBe(1); expect(f.read(a)).toEqual([1, 2, 3, 4]);
    const b = f.binding([5, 6, 7, 8]); f.backend.createUniformBuffer(b); f.backend.updateBinding(b);
    f.read(b); f.gl.bindBufferRange.mockClear(); f.state.currentBoundBufferBases = {};
    expect(f.read(b)).toEqual([5, 6, 7, 8]); expect(f.gl.bindBufferRange).toHaveBeenCalledTimes(1);
  });
});
