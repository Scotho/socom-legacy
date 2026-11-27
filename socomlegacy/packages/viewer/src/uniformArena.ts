import { REVISION } from 'three';

interface Binding {
  isUniformsGroup?: boolean; isUniformBuffer?: boolean; isSampledTexture?: boolean;
  buffer?: ArrayBufferView;
  updateRanges?: readonly { start: number; count: number }[];
}
interface Group { bindings: Binding[] }
interface Data { bufferGPU?: WebGLBuffer | null; textureGPU?: WebGLTexture; glTextureType?: number }
interface Backend {
  isWebGLBackend: boolean;
  gl: WebGL2RenderingContext;
  state: {
    currentBoundBufferBases: Record<string, unknown>;
    bindBufferBase(target: number, index: number, buffer: WebGLBuffer | null | undefined): unknown;
    bindTexture(target: number | undefined, texture: WebGLTexture | undefined, unit: number): unknown;
  };
  get(binding: object): Data; delete(binding: object): unknown;
  createUniformBuffer(binding: Binding): void; updateBinding(binding: Binding): void;
  updateBindings(group: Group): void; destroyUniformBuffer(binding: Binding): void;
  _bindUniforms(groups: Group[]): void; dispose(): Promise<void>;
}
interface Page { gpu: WebGLBuffer; stride: number; bytes: number; free: number[]; live: number }
interface Slot { page: Page; offset: number; bytes: number }
const installed = new WeakSet<object>();

/**
 * Xbox renderer adaptation for the pinned Three r186 WebGL backend. Uniform groups
 * share bounded pages, indexed with bindBufferRange (the backend's own TODO).
 * Budget limits retained page capacity, not game content: overflow uses the existing
 * independent-buffer path. Storage/transform-feedback buffers are never pooled.
 * Driver savings and synchronization costs require browser/console measurement.
 * Install after reuseUniformStorage; the arena owns all uploads to shared pages.
 * Experimental only: the private full-match comparison did not lower peak memory.
 * The normal renderer does not install this adapter.
 */
export function installUniformArena(candidate: unknown, options: { pageBytes?: number; budgetBytes?: number } = {}): boolean {
  const b = candidate as Backend | null;
  if (!b || REVISION !== '186' || b.isWebGLBackend !== true) return false;
  if (installed.has(b)) return true;
  if (!b.gl || !b.state?.currentBoundBufferBases || !['get', 'delete', 'createUniformBuffer', 'updateBinding', 'updateBindings', 'destroyUniformBuffer', '_bindUniforms', 'dispose'].every(k => typeof (b as unknown as Record<string, unknown>)[k] === 'function')) return false;
  const gl = b.gl;
  if (![gl.bindBufferRange, gl.copyBufferSubData, gl.getBufferParameter, b.state.bindBufferBase, b.state.bindTexture].every(f => typeof f === 'function')) return false;
  const alignment = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) as number;
  const maxBlock = gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) as number;
  const pageBytes = options.pageBytes ?? 65536, budget = options.budgetBytes ?? 8 * 1024 * 1024;
  if (![alignment, maxBlock, pageBytes, budget].every(n => Number.isSafeInteger(n) && n > 0) || pageBytes % alignment !== 0 || pageBytes > budget) return false;
  const original = { create: b.createUniformBuffer, update: b.updateBinding, group: b.updateBindings, destroy: b.destroyUniformBuffer, dispose: b.dispose };
  const pages: Page[] = [], tokens = new WeakSet<object>();
  let slots = new WeakMap<Binding, Slot>(), reserved = 0, disposed = false;
  const zero = new Uint8Array(Math.min(pageBytes, maxBlock));

  const allocate = (bytes: number): Slot | null => {
    if (disposed || bytes <= 0 || bytes > maxBlock || bytes > pageBytes) return null;
    const stride = alignment * 2 ** Math.ceil(Math.log2(Math.ceil(bytes / alignment)));
    if (stride > pageBytes) return null;
    let page = pages.find(p => p.stride === stride && p.free.length > 0);
    if (!page) {
      if (reserved + pageBytes > budget) return null;
      const gpu = gl.createBuffer(); if (!gpu) return null;
      gl.bindBuffer(gl.UNIFORM_BUFFER, gpu);
      gl.bufferData(gl.UNIFORM_BUFFER, pageBytes, gl.DYNAMIC_DRAW);
      // Do not consume GL errors. A failed allocation must never become a shared page.
      if (gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE) !== pageBytes) { gl.deleteBuffer(gpu); return null; }
      page = { gpu, stride, bytes: pageBytes, free: [], live: 0 };
      for (let offset = 0; offset + stride <= pageBytes; offset += stride) page.free.push(offset);
      pages.push(page); reserved += pageBytes;
    }
    const slot = { page, offset: page.free.pop()!, bytes };
    page.live++; tokens.add(slot);
    gl.bindBuffer(gl.UNIFORM_BUFFER, page.gpu);
    // Native new buffers are zero-filled, including before a partial first upload.
    gl.bufferSubData(gl.UNIFORM_BUFFER, slot.offset, zero, 0, bytes);
    return slot;
  };
  const release = (slot: Slot): void => {
    const p = slot.page; p.free.push(slot.offset);
    if (--p.live === 0) {
      gl.deleteBuffer(p.gpu); pages.splice(pages.indexOf(p), 1); reserved -= p.bytes;
    }
  };
  const detach = (binding: Binding, slot: Slot): void => {
    // Exceptional partial/unsupported updates retain the old logical store before
    // delegating, so native validation can never spill into an adjacent arena slot.
    const gpu = gl.createBuffer(); if (!gpu) throw new Error('Uniform fallback allocation failed');
    gl.bindBuffer(gl.UNIFORM_BUFFER, gpu); gl.bufferData(gl.UNIFORM_BUFFER, slot.bytes, gl.DYNAMIC_DRAW);
    if (gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE) !== slot.bytes) { gl.deleteBuffer(gpu); throw new Error('Uniform fallback storage unavailable'); }
    const read = gl.getParameter(gl.COPY_READ_BUFFER_BINDING), write = gl.getParameter(gl.COPY_WRITE_BUFFER_BINDING);
    try {
      gl.bindBuffer(gl.COPY_READ_BUFFER, slot.page.gpu); gl.bindBuffer(gl.COPY_WRITE_BUFFER, gpu);
      gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, slot.offset, 0, slot.bytes);
    } catch (error) { gl.deleteBuffer(gpu); throw error; }
    finally { gl.bindBuffer(gl.COPY_READ_BUFFER, read); gl.bindBuffer(gl.COPY_WRITE_BUFFER, write); }
    b.get(binding).bufferGPU = gpu; slots.delete(binding); release(slot);
  };
  const update = (binding: Binding): boolean => {
    let slot = slots.get(binding); if (!slot) return false;
    const array = binding.buffer, ranges = binding.updateRanges;
    if (!(array instanceof Float32Array) || !Array.isArray(ranges)) { detach(binding, slot); return false; }
    if (ranges.length === 0 && array.byteLength !== slot.bytes) {
      const next = allocate(array.byteLength);
      if (!next) { detach(binding, slot); return false; }
      slots.set(binding, next); b.get(binding).bufferGPU = next.page.gpu; release(slot); slot = next;
    }
    for (const r of ranges) {
      // count=0 in WebGL means the remainder of the source. Native handles that
      // and other unusual inputs only after materializing an independent store.
      if (!Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.count) || r.start < 0 || r.count <= 0 || r.start + r.count > array.length || (r.start + r.count) * 4 > slot.bytes) { detach(binding, slot); return false; }
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, slot.page.gpu);
    if (ranges.length === 0) gl.bufferSubData(gl.UNIFORM_BUFFER, slot.offset, array);
    else for (const r of ranges) gl.bufferSubData(gl.UNIFORM_BUFFER, slot.offset + r.start * 4, array, r.start, r.count);
    return true;
  };

  b.createUniformBuffer = function(binding): void {
    const data = this.get(binding);
    if (data.bufferGPU !== undefined) return;
    const array = binding.buffer;
    const slot = binding.isUniformsGroup && array instanceof Float32Array && Array.isArray(binding.updateRanges) ? allocate(array.byteLength) : null;
    if (slot) { slots.set(binding, slot); data.bufferGPU = slot.page.gpu; }
    else original.create.call(this, binding);
  };
  b.updateBinding = function(binding): void { if (!update(binding)) original.update.call(this, binding); };
  b.updateBindings = function(group): void {
    for (const binding of group.bindings) if (!update(binding)) original.group.call(this, { bindings: [binding] });
  };
  b.destroyUniformBuffer = function(binding): void {
    const slot = slots.get(binding);
    if (!slot) { original.destroy.call(this, binding); return; }
    slots.delete(binding); release(slot); this.delete(binding);
  };
  b._bindUniforms = function(groups): void {
    let uniformIndex = 0, textureIndex = 0;
    for (const group of groups) for (const binding of group.bindings) {
      const data = this.get(binding);
      if (binding.isUniformsGroup || binding.isUniformBuffer) {
        const index = uniformIndex++, slot = slots.get(binding);
        if (slot) {
          const key = `${gl.UNIFORM_BUFFER}-${index}`;
          // Three r186 uses this cache only for identity comparisons. A slot token
          // includes its offset/length; ordinary camera-index binds and resetState
          // replace it, forcing the range to be rebound on the next render/compute.
          if (this.state.currentBoundBufferBases[key] !== slot) {
            gl.bindBufferRange(gl.UNIFORM_BUFFER, index, slot.page.gpu, slot.offset, slot.bytes);
            this.state.currentBoundBufferBases[key] = slot;
          }
        } else this.state.bindBufferBase(gl.UNIFORM_BUFFER, index, data.bufferGPU);
      } else if (binding.isSampledTexture) this.state.bindTexture(data.glTextureType, data.textureGPU, gl.TEXTURE0 + textureIndex++);
    }
  };
  b.dispose = async function(): Promise<void> {
    if (!disposed) {
      disposed = true;
      for (const page of pages) gl.deleteBuffer(page.gpu);
      pages.length = 0; reserved = 0; slots = new WeakMap();
      for (const key of Object.keys(this.state.currentBoundBufferBases)) {
        const value = this.state.currentBoundBufferBases[key];
        if (value && typeof value === 'object' && tokens.has(value)) delete this.state.currentBoundBufferBases[key];
      }
    }
    await original.dispose.call(this);
  };
  installed.add(b);
  return true;
}
