import type { PayloadBudget } from './budget';

export type ArenaTarget = 'vertex' | 'index';
export interface ArenaInput { target: ArenaTarget; data: ArrayBufferView }
type Slice = { target: ArenaTarget; offset: number };

/** Scene-owned storage. One buffer per WebGL target; no combined CPU staging copy.
 * Offsets are four-byte aligned for float/uint attributes and indices. Exact source
 * ranges share an upload within a target, even when represented by different views.
 * The reservation includes padding; it excludes driver/VAO/process overhead.
 */
export async function uploadBufferArena(gl: WebGL2RenderingContext, budget: PayloadBudget,
  inputs: readonly ArenaInput[], yieldUpload: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))) {
  const banks = new Map<ArenaTarget, { bytes: number; uploads: { data: ArrayBufferView; offset: number }[];
    ranges: Map<ArrayBufferLike, Map<string, Slice>>; buffer?: WebGLBuffer }>();
  const locations = new Map<ArrayBufferView, Map<ArenaTarget, Slice>>();
  for (const { target, data } of inputs) {
    let bank = banks.get(target);
    if (!bank) { bank = { bytes: 0, uploads: [], ranges: new Map() }; banks.set(target, bank); }
    let ranges = bank.ranges.get(data.buffer);
    if (!ranges) { ranges = new Map(); bank.ranges.set(data.buffer, ranges); }
    const key = `${data.byteOffset}:${data.byteLength}`;
    let slice = ranges.get(key);
    if (!slice) {
      const offset = Math.ceil(bank.bytes / 4) * 4;
      slice = { target, offset }; ranges.set(key, slice);
      bank.uploads.push({ data, offset }); bank.bytes = offset + data.byteLength;
    }
    let targets = locations.get(data);
    if (!targets) { targets = new Map(); locations.set(data, targets); }
    targets.set(target, slice);
  }
  const payloadBytes = [...banks.values()].reduce((total, bank) => total + bank.bytes, 0);
  const sourceRanges = [...banks.values()].reduce((total, bank) => total + bank.uploads.length, 0);
  // Reserve the entire geometry allocation before creating even the first GPU buffer.
  const release = budget.reserve(payloadBytes);
  let disposed = false, bindingsClosed = false, sinceYield = 0;
  const enumTarget = (target: ArenaTarget) => target === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
  const check = () => {
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('Prototype arena upload failed');
  };
  const finishBindings = () => { bindingsClosed = true; locations.clear(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true; finishBindings();
    for (const bank of banks.values()) { if (bank.buffer) gl.deleteBuffer(bank.buffer); bank.uploads.length = 0; bank.ranges.clear(); }
    banks.clear(); release();
  };
  try {
    for (const [target, bank] of banks) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Cannot allocate prototype arena');
      bank.buffer = buffer;
      gl.bindBuffer(enumTarget(target), buffer); gl.bufferData(enumTarget(target), bank.bytes, gl.STATIC_DRAW); check();
      for (const { data, offset } of bank.uploads) {
        gl.bufferSubData(enumTarget(target), offset, data); sinceYield += data.byteLength;
        if (sinceYield >= 4 * 1024 * 1024) { check(); sinceYield = 0; await yieldUpload(); check(); gl.bindBuffer(enumTarget(target), buffer); }
      }
      check(); bank.uploads.length = 0; bank.ranges.clear();
    }
    return {
      buffers: banks.size, payloadBytes, sourceRanges,
      bind(data: ArrayBufferView, target: ArenaTarget): number {
        if (disposed || bindingsClosed) throw new Error('Prototype arena bindings closed');
        const slice = locations.get(data)?.get(target), buffer = banks.get(target)?.buffer;
        if (!slice || !buffer) throw new Error('Unregistered prototype buffer view');
        gl.bindBuffer(enumTarget(target), buffer); return slice.offset;
      },
      /** A bounded GPU-range writer survives finishBindings without retaining
       * the decoded source view. Dynamic doors write placement matrices only. */
      writer(data: ArrayBufferView, target: ArenaTarget): (byteOffset: number, next: ArrayBufferView) => void {
        if (disposed || bindingsClosed) throw new Error('Prototype arena bindings closed');
        const slice = locations.get(data)?.get(target), buffer = banks.get(target)?.buffer, length = data.byteLength;
        if (!slice || !buffer) throw new Error('Unregistered prototype buffer view');
        const offset = slice.offset, destination = enumTarget(target);
        return (byteOffset, next) => {
          if (disposed) throw new Error('Prototype arena disposed');
          if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + next.byteLength > length) throw new Error('Prototype arena write outside range');
          gl.bindBuffer(destination, buffer); gl.bufferSubData(destination, offset + byteOffset, next);
        };
      },
      finishBindings, dispose,
    };
  } catch (error) { dispose(); throw error; }
}
