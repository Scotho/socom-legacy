/**
 * Browser resource adaptation for Xbox WebGL2. Three r186's WebGLBackend.updateBinding
 * replaces the entire store with bufferData on every whole uniform update. Reuse a
 * known, equally sized allocation instead; byte contents and draw order are unchanged.
 * Partial ranges, unknown stores, unsupported data and size changes keep three's path.
 * Driver memory savings and possible synchronization cost require physical measurement.
 */
interface UniformBinding {
  isUniformsGroup?: boolean;
  isUniformBuffer?: boolean;
  buffer?: ArrayBufferView;
  updateRanges?: readonly { start: number; count: number }[];
}
export interface UniformStorageBackend {
  isWebGLBackend?: boolean;
  get?(binding: object): { bufferGPU?: object | null };
  createUniformBuffer?(binding: UniformBinding): void;
  updateBindings?(group: { bindings: UniformBinding[] }): void;
  updateBinding?(binding: UniformBinding): void;
  gl?: Pick<WebGL2RenderingContext, 'UNIFORM_BUFFER' | 'UNIFORM_BUFFER_BINDING' | 'BUFFER_SIZE'
    | 'bindBuffer' | 'bufferSubData' | 'getParameter' | 'getBufferParameter'>;
}
const installed = new WeakSet<object>();

export function reuseUniformStorage(backend: UniformStorageBackend | null | undefined): boolean {
  if (backend?.isWebGLBackend !== true) return false;
  if (installed.has(backend)) return true;
  const { gl, get, createUniformBuffer, updateBinding, updateBindings } = backend;
  if (!gl || typeof gl.bindBuffer !== 'function' || typeof gl.bufferSubData !== 'function'
    || typeof gl.getParameter !== 'function' || typeof gl.getBufferParameter !== 'function'
    || typeof get !== 'function' || typeof createUniformBuffer !== 'function' || typeof updateBinding !== 'function'
    || typeof updateBindings !== 'function') return false;
  const stores = new WeakMap<object, { gpu: object; bytes: number }>();
  const remember = (binding: UniformBinding, gpu: object): void => {
    // Allocation failure sets a GL error rather than throwing. Query capacity only
    // after allocation/replacement, never on the same-size per-frame reuse path.
    gl.bindBuffer(gl.UNIFORM_BUFFER, gpu);
    const bytes = gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE);
    if (ArrayBuffer.isView(binding.buffer) && bytes === binding.buffer.byteLength) stores.set(binding, { gpu, bytes });
    else stores.delete(binding);
  };
  backend.createUniformBuffer = function(binding): void {
    const before = get.call(this, binding).bufferGPU;
    createUniformBuffer.call(this, binding);
    const gpu = get.call(this, binding).bufferGPU;
    if (!before && gpu && ArrayBuffer.isView(binding.buffer)) remember(binding, gpu);
  };
  backend.updateBindings = function(group): void {
    updateBindings.call(this, group);
    // Rebinding a group also replaces whole uniform stores in three. Keep capacity
    // current even when that upload happens between individual updateBinding calls.
    const bound = gl.getParameter(gl.UNIFORM_BUFFER_BINDING);
    for (const binding of group.bindings) {
      if ((binding.isUniformsGroup || binding.isUniformBuffer) && binding.updateRanges?.length === 0 && ArrayBuffer.isView(binding.buffer)) {
        const gpu = get.call(this, binding).bufferGPU;
        if (gpu) remember(binding, gpu);
      }
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, bound);
  };
  backend.updateBinding = function(binding): void {
    const array = binding.buffer;
    const whole = (binding.isUniformsGroup === true || binding.isUniformBuffer === true)
      && binding.updateRanges?.length === 0 && ArrayBuffer.isView(array);
    if (!whole) { updateBinding.call(this, binding); return; }
    const gpu = get.call(this, binding).bufferGPU, store = stores.get(binding);
    if (gpu && store?.gpu === gpu && store.bytes === array.byteLength) {
      gl.bindBuffer(gl.UNIFORM_BUFFER, gpu);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array);
    } else {
      updateBinding.call(this, binding);
      if (gpu) remember(binding, gpu);
    }
  };
  installed.add(backend);
  return true;
}
