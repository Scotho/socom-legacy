/**
 * WEBGPU-HELD-DESTROY (LATER 856; product track, a renderer adaptation: no original -- the PS2 has no GPU buffers;
 * nothing of the game's behaviour, no pixel and no timing changes). Shadow's red #17 (turretCensus:175, MP51 Vigilance's
 * load, Chrome WebGPU on the A4500, d628ce86e twice, trace on and off): "[Buffer
 * "bindingBuffer50_render_(vertex,fragment,compute)"] used in submit while destroyed" in renderContext_0.
 *
 * Why, in three r186:
 * - A render or compute pass is encoded between the backend's `beginRender` and `finishRender` (`beginCompute`,
 *   `finishCompute`), and `finish*` submits it synchronously (`submit( this.device, ... )`).
 * - A uniform buffer (a bind group's: the shared `render` group, the camera's uniforms, is one) is destroyed by
 *   `Bindings._destroyBindings` -> `WebGPUBackend.destroyUniformBuffer` when the group's last render object is disposed
 *   (a material's or a geometry's dispose, or `RenderObjects.get` remaking an object whose cache key changed).
 * - When that dispose runs inside an open pass -- after a draw that used the buffer was encoded, before the submit --
 *   WebGPU refuses the whole command buffer at submit: one frame of that pass is not drawn, and the uncaptured error
 *   demotes an Automatic page to WebGL2 for good (`./graphicsDemotion`).
 *
 * The hold: on WebGPU, a uniform buffer destroyed while a pass is open has three's record let go at once (its
 * bookkeeping unchanged: a remade group gets a new buffer) but its GPU buffer destroyed right after the outermost open
 * pass is submitted. A buffer destroyed after its last submit is legal WebGPU: the device frees it once that work is
 * done. Outside a pass (between frames, a compile, a teardown) the destroy is immediate, as three does.
 *
 * Not covered (review F2; LATER 856): a `usedTimes` miscount that frees the group while a live render object still holds
 * the backend's cached `GPUBindGroup` on that buffer (`WebGPUBindingUtils.deleteBindGroupData` clears only the layout).
 * The hold then only moves the destroy to the pass's end, and the next frame that draws with the group fails the same way.
 * Which case red #17 was is not known: its disposer was not caught.
 *
 * Review F5 (XBOX-SRAKMD's sibling; LATER 859): a uniform buffer whose record holds no GPU buffer is let go as three would
 * (its record deleted) with no `buffer.destroy()`, which three r186 calls unguarded. Inferred from `destroyAttribute`'s
 * "reading 'destroy'" on Xbox pages after a lost device; NOT seen for uniform buffers, and how such a record would arise
 * in r186 is not known (`createUniformBuffer` assigns the buffer after `createBuffer`, which on a lost device returns an
 * invalid buffer rather than throwing). The guard is a no-op wherever a buffer exists.
 */

/** The shape of three's backend this reads and wraps (method syntax: three's own signatures stand in for these). */
export interface HeldDestroysBackend {
  isWebGPUBackend?: boolean;
  has?(object: object): boolean;
  get?(object: object): { buffer?: unknown };
  delete?(object: object): unknown;
  destroyUniformBuffer?(binding: object): void;
  beginRender?(context: object): void;
  finishRender?(context: object): void;
  beginCompute?(group: object): void;
  finishCompute?(group: object): void;
}

const HOLDING = Symbol('webgpu-held-destroy');

/** Review F5: the destroys let go with no GPU buffer to destroy since the page loaded (monotonic; its test reads it). */
let orphans = 0;
export function orphanUniformDestroysSkipped(): number { return orphans; }

/** The buffers destroyed after their pass's submit since the page loaded (a dev instrument's read; monotonic). */
let freed = 0;
export function heldDestroysFreed(): number { return freed; }

/**
 * Installs the hold on `backend` (once). False, and three left as it is, on WebGL2 or when the members it relies on are
 * not there (a three upgrade: `test/heldDestroys.test.ts` pins them).
 */
export function holdDestroysToSubmit(backend: HeldDestroysBackend | null | undefined): boolean {
  if (backend?.isWebGPUBackend !== true) return false;
  const { has, get, delete: drop, destroyUniformBuffer, beginRender, finishRender, beginCompute, finishCompute } = backend;
  if (typeof has !== 'function' || typeof get !== 'function' || typeof drop !== 'function' || typeof destroyUniformBuffer !== 'function'
    || typeof beginRender !== 'function' || typeof finishRender !== 'function') return false;
  const marked = backend as HeldDestroysBackend & { [HOLDING]?: true };
  if (marked[HOLDING]) return true;

  // The open passes, by their render context or compute group (three hands `begin*` and `finish*` the same object).
  // Review F1: a pass that threw between them is never finished -- three r186's `_renderScene` raises `_callDepth` with no
  // try/finally, so later frames get other context objects. A pass is encoded and submitted inside one synchronous
  // `render` / `compute`, so one still open when the task ends is such a pass: a microtask scheduled at the first open
  // lets it go and destroys what it held (its encoder was never submitted).
  const open = new Set<object>();
  let sweeping = false;
  const sweep = (): void => {
    sweeping = false;
    if (open.size === 0) return;
    open.clear();
    release();
  };
  const held: { destroy(): void }[] = [];
  const read = get.bind(backend);
  const destroy = destroyUniformBuffer.bind(backend);
  const release = (): void => {
    for (const buffer of held.splice(0)) { buffer.destroy(); freed++; }
  };
  const opens = (begin: (a: object) => void): ((a: object) => void) => (a) => {
    begin(a);
    open.add(a);
    if (!sweeping) { sweeping = true; queueMicrotask(sweep); }
  };
  const submits = (finish: (a: object) => void): ((a: object) => void) => (a) => {
    try {
      finish(a);
    } finally {
      open.delete(a);
      if (open.size === 0) release();
    }
  };

  backend.destroyUniformBuffer = (binding) => {
    const record = has.call(backend, binding) ? read(binding) : null;   // `has` first: `get` would make a record
    const buffer = record?.buffer as { destroy(): void } | null | undefined;
    if (!record || buffer == null) { orphans++; drop.call(backend, binding); return; }   // review F5: nothing to destroy
    if (open.size === 0) { destroy(binding); return; }
    // three's own destroy runs (its record deleted), on a stand-in whose destroy keeps the GPU buffer for the submit.
    record.buffer = { destroy: () => { held.push(buffer); } };
    destroy(binding);
  };
  backend.beginRender = opens(beginRender.bind(backend));
  backend.finishRender = submits(finishRender.bind(backend));
  if (typeof beginCompute === 'function' && typeof finishCompute === 'function') {
    backend.beginCompute = opens(beginCompute.bind(backend));
    backend.finishCompute = submits(finishCompute.bind(backend));
  }
  marked[HOLDING] = true;
  return true;
}
