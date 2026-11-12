/**
 * RENDER-DEPTH-RESTORE (LATER 859's first look; product track, **a renderer adaptation with no original**: the PS2 has
 * no render contexts; nothing of the game's behaviour, no pixel and no timing changes while renders do not throw).
 *
 * Three r186's `Renderer._renderScene` pushes the lighting stack, raises `_callDepth`, may set a frame-buffer target as
 * the render target, and sets the current render context, render-object functions and node frame's render id; it puts
 * them back on its last lines, with no try/finally. A throw between (shadow's bench, 2026-11-11: a failed
 * `mappedAtCreation` upload inside `geometries.updateForRender`) leaves them all. The frame guard (`./frameGuard`) keeps
 * the loop going, and every later frame then renders one depth deeper: render contexts are keyed by the call depth
 * (`RenderContexts.get`) and render objects by their context (`RenderObjects.get`), so every object in the scene gets a
 * new render object -- its node state, bindings, uniform buffers and bind groups made afresh -- and the old set is never
 * let go while the objects live. Each throwing frame costs a whole scene's set-up and a whole scene's GPU uniforms more,
 * where the throw was a failed allocation to begin with (the field's 0x887A0005 on CreateBuffer).
 *
 * The guard wraps the renderer's `_renderScene`: on a throw it puts back what that call changed -- the depth, the render
 * target (with its cube face and mip level), the current render context, both render-object functions, the render id,
 * and the lighting stack's entry when this call pushed one -- and rethrows the same error, so the frame guard still
 * reports it. Nested calls (a shadow map's, the output pass's) are wrapped too, each putting back its own level. On
 * either backend: the depth is the common renderer's, not WebGPU's. Review F1: on WebGL2 the backend's current context
 * (`WebGLBackend._currentContext`, set at `beginRender` and put back at `finishRender`) goes back too, or the next
 * frame's top pass would hand the context that threw back as current; WebGPU's open pass is `./heldDestroys`' sweep.
 */

/** The members of three's Renderer the guard reads and puts back (r186; `test/renderDepth.test.ts` pins them). */
export interface RenderDepthRenderer {
  _callDepth: number;
  _renderTarget: object | null;
  _activeCubeFace: number;
  _activeMipmapLevel: number;
  _currentRenderContext: unknown;
  _currentRenderObjectFunction: unknown;
  _handleObjectFunction: unknown;
  _nodes?: { nodeFrame?: { renderId: number } };
  backend?: { isWebGLBackend?: boolean; _currentContext?: unknown };
  lighting?: { _cache?: unknown[]; finishRender?(scene: unknown): void };
  setRenderTarget(target: object | null, face?: number, mip?: number): void;
  _renderScene(scene: unknown, camera: unknown, useFrameBufferTarget?: boolean): unknown;
}

const RESTORING = Symbol('render-depth-restore');

/** The throws put back since the page loaded (monotonic; its test reads it, no page does). */
let restored = 0;
export function renderSceneThrowsRestored(): number { return restored; }

/**
 * Installs the guard on `renderer` (once). False, and three left as it is, when the members it relies on are not there
 * (a three upgrade).
 */
export function restoreRenderStateOnThrow(renderer: RenderDepthRenderer | null | undefined): boolean {
  if (!renderer || typeof renderer._renderScene !== 'function' || typeof renderer._callDepth !== 'number'
    || typeof renderer.setRenderTarget !== 'function') return false;
  const marked = renderer as RenderDepthRenderer & { [RESTORING]?: true };
  if (marked[RESTORING]) return true;
  const inner = renderer._renderScene;
  renderer._renderScene = function (this: RenderDepthRenderer, scene, camera, useFrameBufferTarget) {
    const depth = this._callDepth;
    const target = this._renderTarget, face = this._activeCubeFace, mip = this._activeMipmapLevel;
    const context = this._currentRenderContext, objectFn = this._currentRenderObjectFunction, handle = this._handleObjectFunction;
    const nodeFrame = this._nodes?.nodeFrame;
    const renderId = nodeFrame?.renderId;
    const lighting = this.lighting;
    const lights = lighting?._cache;
    const lightsBefore = Array.isArray(lights) ? lights.length : -1;
    const gl = this.backend?.isWebGLBackend === true ? this.backend : null;
    const glContext = gl?._currentContext;
    try {
      // three passes its default (true) on an omitted argument; an explicit undefined does the same
      return inner.call(this, scene, camera, useFrameBufferTarget);
    } catch (error) {
      restored++;
      if (lighting && Array.isArray(lights) && lights.length > lightsBefore && typeof lighting.finishRender === 'function') {
        try { lighting.finishRender(scene); } catch { lights.length = lightsBefore; }   // the scene's lights as they were
      }
      this._callDepth = depth;
      if (this._renderTarget !== target || this._activeCubeFace !== face || this._activeMipmapLevel !== mip) {
        try { this.setRenderTarget(target, face, mip); } catch { /* the throw that matters is the render's */ }
      }
      this._currentRenderContext = context;
      this._currentRenderObjectFunction = objectFn;
      this._handleObjectFunction = handle;
      if (nodeFrame && renderId !== undefined) nodeFrame.renderId = renderId;
      if (gl) gl._currentContext = glContext;            // review F1
      throw error;
    }
  };
  marked[RESTORING] = true;
  return true;
}
