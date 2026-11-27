import { describe, expect, it } from 'vitest';
import { PayloadBudget } from '../src/xboxPrototype/budget';
import { uploadBufferArena, type ArenaInput } from '../src/xboxPrototype/bufferArena';

function fakeGl(failUpload = false) {
  const stores = new Map<WebGLBuffer, Uint8Array>();
  const bound = new Map<number, WebGLBuffer>();
  const deleted: WebGLBuffer[] = [];
  let allocations = 0, error = 0;
  const gl = {
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044, NO_ERROR: 0,
    createBuffer: () => { allocations++; return {} as WebGLBuffer; },
    bindBuffer: (target: number, buffer: WebGLBuffer) => { bound.set(target, buffer); },
    bufferData: (target: number, bytes: number) => { stores.set(bound.get(target)!, new Uint8Array(bytes)); },
    bufferSubData: (target: number, offset: number, data: ArrayBufferView) => {
      if (failUpload) { error = 1285; return; }
      stores.get(bound.get(target)!)!.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
    },
    deleteBuffer: (buffer: WebGLBuffer) => { deleted.push(buffer); stores.delete(buffer); },
    getError: () => { const result = error; error = 0; return result; },
    isContextLost: () => false,
  } as unknown as WebGL2RenderingContext;
  return { gl, stores, bound, deleted, allocations: () => allocations };
}

describe('prototype GPU buffer arena', () => {
  it('updates an owned GPU range after source bindings close, and refuses writes outside it or after disposal', async () => {
    const f = fakeGl(), budget = new PayloadBudget(100), data = new Float32Array([1, 2, 3, 4]);
    const arena = await uploadBufferArena(f.gl, budget, [{ target: 'vertex', data }]);
    const write = arena.writer(data, 'vertex'); arena.finishBindings();
    write(4, new Float32Array([9]));
    expect([...new Float32Array(f.stores.get(f.bound.get(f.gl.ARRAY_BUFFER)!)!.buffer)]).toEqual([1, 9, 3, 4]);
    expect(() => write(16, new Float32Array([1]))).toThrow('range');
    expect(() => write(-1, new Uint8Array([1]))).toThrow('range');
    expect([...data]).toEqual([1, 2, 3, 4]);
    arena.dispose(); expect(() => write(0, new Float32Array([1]))).toThrow('disposed');
  });
  it('packs borrowed views into two target-specific buffers with aligned offsets and exact bytes', async () => {
    const f = fakeGl(), budget = new PayloadBudget(100);
    const backing = new Float32Array([99, 1, 2, 3, 88]);
    const position = backing.subarray(1, 4), alias = new Float32Array(backing.buffer, 4, 3);
    const joints = new Uint16Array([2]), index = new Uint32Array([0, 1, 2]);
    const inputs: ArenaInput[] = [
      { target: 'vertex', data: joints }, { target: 'vertex', data: position },
      { target: 'vertex', data: alias }, { target: 'index', data: index },
    ];
    const arena = await uploadBufferArena(f.gl, budget, inputs);
    expect(arena.buffers).toBe(2); expect(f.allocations()).toBe(2);
    expect(arena.bind(joints, 'vertex')).toBe(0);
    expect(arena.bind(position, 'vertex')).toBe(4); expect(arena.bind(alias, 'vertex')).toBe(4);
    expect([...f.stores.get(f.bound.get(f.gl.ARRAY_BUFFER)!)!]).toEqual([
      2, 0, 0, 0, ...new Uint8Array(position.buffer, position.byteOffset, position.byteLength),
    ]);
    expect(arena.bind(index, 'index')).toBe(0);
    expect(budget.current).toBe(28); expect(arena.payloadBytes).toBe(28);
    arena.finishBindings(); expect(() => arena.bind(position, 'vertex')).toThrow('closed');
    arena.dispose(); arena.dispose(); expect(budget.current).toBe(0); expect(f.deleted).toHaveLength(2);
    expect([...backing]).toEqual([99, 1, 2, 3, 88]);
  });
  it('refuses the whole reservation before creating GPU buffers', async () => {
    const f = fakeGl(), budget = new PayloadBudget(7);
    await expect(uploadBufferArena(f.gl, budget, [{ target: 'vertex', data: new Float32Array(2) }])).rejects.toThrow('budget');
    expect(f.allocations()).toBe(0); expect(budget.current).toBe(0);
  });
  it('releases all acquired handles and bytes when an upload fails', async () => {
    const f = fakeGl(true), budget = new PayloadBudget(100);
    await expect(uploadBufferArena(f.gl, budget, [{ target: 'vertex', data: new Float32Array(2) }])).rejects.toThrow('upload');
    expect(f.deleted).toHaveLength(f.allocations()); expect(budget.current).toBe(0);
  });
  it('keeps vertex/index targets separate even when they share the same source bytes', async () => {
    const f = fakeGl(), budget = new PayloadBudget(100), data = new Uint32Array([1, 2]);
    const arena = await uploadBufferArena(f.gl, budget, [{ target: 'vertex', data }, { target: 'index', data }]);
    arena.bind(data, 'vertex'); arena.bind(data, 'index');
    expect(f.bound.get(f.gl.ARRAY_BUFFER)).not.toBe(f.bound.get(f.gl.ELEMENT_ARRAY_BUFFER));
    expect(budget.current).toBe(16); arena.dispose();
  });
  it('cleans up if a paced upload is cancelled', async () => {
    const f = fakeGl(), budget = new PayloadBudget(8 * 1024 * 1024);
    await expect(uploadBufferArena(f.gl, budget, [{ target: 'vertex', data: new Uint8Array(4 * 1024 * 1024) }],
      async () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
    expect(budget.current).toBe(0); expect(f.deleted).toHaveLength(f.allocations());
  });
});
