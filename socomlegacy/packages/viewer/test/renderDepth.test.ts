import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WebGPURenderer } from 'three/webgpu';
import { renderSceneThrowsRestored, restoreRenderStateOnThrow, type RenderDepthRenderer } from '../src/renderDepth';

/**
 * RENDER-DEPTH-RESTORE (LATER 859's first look; `../src/renderDepth`; product track, a renderer adaptation). Three r186's
 * `_renderScene` raises `_callDepth`, pushes the lighting stack and sets its render target and render-object functions with
 * no try/finally; a throw inside (shadow's bench: a failed upload) leaves them all, and every later frame renders at a new
 * depth -- a new render context, so a new render object for every object in the scene.
 */

const src = (name: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', name), 'utf8');

/** A stand-in for three's Renderer with `_renderScene`'s own state changes, in its order, and a body that may throw. */
class FakeRenderer {
  _callDepth = -1;
  _renderTarget: object | null = null;
  _activeCubeFace = 0;
  _activeMipmapLevel = 0;
  _currentRenderContext: object | null = null;
  _currentRenderObjectFunction: unknown = null;
  _handleObjectFunction: unknown = null;
  _nodes = { nodeFrame: { renderId: 7 } };
  lighting = { _cache: [] as unknown[], beginRender(): void { this._cache.push({}); }, finishRender(): void { this._cache.pop(); } };
  frameBufferTarget: object | null = null;
  backend = { isWebGLBackend: false, _currentContext: null as unknown };
  body: (r: FakeRenderer) => void = () => undefined;
  setRenderTarget(target: object | null, face = 0, mip = 0): void { this._renderTarget = target; this._activeCubeFace = face; this._activeMipmapLevel = mip; }
  _renderScene(scene: object, _camera: object, useFrameBufferTarget = true): object {
    const fbt = useFrameBufferTarget ? this.frameBufferTarget : null;
    const previousRenderId = this._nodes.nodeFrame.renderId;
    const previousContext = this._currentRenderContext, previousObjectFn = this._currentRenderObjectFunction, previousHandle = this._handleObjectFunction;
    this.lighting.beginRender();
    this._callDepth++;
    const output = this._renderTarget, face = this._activeCubeFace, mip = this._activeMipmapLevel;
    if (fbt) this.setRenderTarget(fbt);
    const context = { depth: this._callDepth };
    this._currentRenderContext = context;
    const previousBackendContext = this.backend._currentContext;
    this.backend._currentContext = context;                // WebGLBackend.beginRender
    this._currentRenderObjectFunction = 'renderObject';
    this._handleObjectFunction = '_renderObjectDirect';
    this._nodes.nodeFrame.renderId++;
    this.body(this);                                      // the render lists: a failed upload throws here
    this.backend._currentContext = previousBackendContext; // WebGLBackend.finishRender
    this._nodes.nodeFrame.renderId = previousRenderId;
    this._currentRenderContext = previousContext;
    this._currentRenderObjectFunction = previousObjectFn;
    this._handleObjectFunction = previousHandle;
    this.lighting.finishRender();
    this._callDepth--;
    if (fbt) this.setRenderTarget(output, face, mip);
    void scene;
    return context;
  }
}

const state = (r: FakeRenderer): unknown => ({
  depth: r._callDepth, target: r._renderTarget, face: r._activeCubeFace, mip: r._activeMipmapLevel, context: r._currentRenderContext,
  objectFn: r._currentRenderObjectFunction, handle: r._handleObjectFunction, renderId: r._nodes.nodeFrame.renderId, lights: r.lighting._cache.length,
  backendContext: r.backend.isWebGLBackend ? r.backend._currentContext : 'webgpu: three own',
});
const asRenderer = (r: FakeRenderer): RenderDepthRenderer => r as unknown as RenderDepthRenderer;

describe('RENDER-DEPTH-RESTORE: a throw inside a render leaves the renderer as it found it', () => {
  it('without the guard (three as it is): a throw leaves the depth raised, so the next frame gets another context', () => {
    const r = new FakeRenderer();
    const ok = r._renderScene({}, {});
    r.body = () => { throw new RangeError('createBuffer failed'); };
    expect(() => r._renderScene({}, {})).toThrow('createBuffer failed');
    r.body = () => undefined;
    expect(r._renderScene({}, {})).not.toEqual(ok);        // depth 1, not 0: a new render context
  });

  it('a throw: rethrown as it was, and the depth, the target, the context, the functions, the render id and the lights put back', () => {
    const r = new FakeRenderer();
    r.frameBufferTarget = { fbt: true };
    expect(restoreRenderStateOnThrow(asRenderer(r))).toBe(true);
    const before = state(r);
    const boom = new RangeError('createBuffer failed');
    r.body = () => { throw boom; };
    let caught: unknown;
    try { r._renderScene({}, {}); } catch (e) { caught = e; }
    expect(caught).toBe(boom);                               // the frame guard still sees the error
    expect(state(r)).toEqual(before);
    expect(renderSceneThrowsRestored()).toBeGreaterThan(0);
  });

  it('the next frame after a throw renders at the same depth as before it: the same render context', () => {
    const r = new FakeRenderer();
    restoreRenderStateOnThrow(asRenderer(r));
    const ok = r._renderScene({}, {});
    r.body = () => { throw new Error('once'); };
    expect(() => r._renderScene({}, {})).toThrow('once');
    r.body = () => undefined;
    expect(r._renderScene({}, {})).toEqual(ok);
  });

  it('a throw in a nested render (a shadow map, the output pass) unwinds every level to the outer call\'s state', () => {
    const r = new FakeRenderer();
    restoreRenderStateOnThrow(asRenderer(r));
    const before = state(r);
    let depth = 0;
    r.body = (self) => { if (depth++ === 0) self._renderScene({}, {}, false); else throw new Error('inner'); };
    expect(() => r._renderScene({}, {})).toThrow('inner');
    expect(state(r)).toEqual(before);
  });

  it('a throw before the lights were pushed pops nothing of the caller\'s', () => {
    const r = new FakeRenderer();
    restoreRenderStateOnThrow(asRenderer(r));
    r.lighting._cache.push('caller');
    const begin = r.lighting.beginRender;
    r.lighting.beginRender = () => { throw new Error('early'); };
    expect(() => r._renderScene({}, {})).toThrow('early');
    r.lighting.beginRender = begin;
    expect(r.lighting._cache).toEqual(['caller']);
  });

  it('a render that does not throw is three\'s own: the same result, the same state', () => {
    const plain = new FakeRenderer(), guarded = new FakeRenderer();
    restoreRenderStateOnThrow(asRenderer(guarded));
    expect(guarded._renderScene({}, {})).toEqual(plain._renderScene({}, {}));
    expect(state(guarded)).toEqual(state(plain));
  });

  it('review F1: on WebGL2 the backend\'s current context goes back too (three\'s WebGLBackend keeps it between passes)', () => {
    const r = new FakeRenderer();
    r.backend.isWebGLBackend = true;
    restoreRenderStateOnThrow(asRenderer(r));
    const before = state(r);
    r.body = () => { throw new Error('gl'); };
    expect(() => r._renderScene({}, {})).toThrow('gl');
    expect(r.backend._currentContext).toBeNull();
    expect(state(r)).toEqual(before);
  });

  it('on WebGPU the backend\'s fields are left to three (its open pass is heldDestroys\' sweep)', () => {
    const r = new FakeRenderer();
    restoreRenderStateOnThrow(asRenderer(r));
    r.body = () => { throw new Error('gpu'); };
    expect(() => r._renderScene({}, {})).toThrow('gpu');
    expect(r.backend._currentContext).toEqual({ depth: 0 });  // as three left it
  });

  it('installed once; refused (three left as it is) without the members it relies on', () => {
    const r = new FakeRenderer();
    expect(restoreRenderStateOnThrow(asRenderer(r))).toBe(true);
    const wrapped = r._renderScene;
    expect(restoreRenderStateOnThrow(asRenderer(r))).toBe(true);
    expect(r._renderScene).toBe(wrapped);
    expect(restoreRenderStateOnThrow(null)).toBe(false);
    expect(restoreRenderStateOnThrow({ _callDepth: 0 } as unknown as RenderDepthRenderer)).toBe(false);
  });
});

describe('RENDER-DEPTH-RESTORE: three r186 as the guard reads it (a three upgrade fails here first)', () => {
  const renderScene = String((WebGPURenderer.prototype as unknown as { _renderScene: () => void })._renderScene);
  const bundle = readFileSync(createRequire(import.meta.url).resolve('three/webgpu'), 'utf8');

  it('_renderScene changes the state the guard puts back, with no try/finally of its own', () => {
    for (const line of [
      'this.lighting.beginRender( scene );', 'this._callDepth ++;', 'this.setRenderTarget( renderTarget );',
      'this._currentRenderContext = renderContext;', 'this._handleObjectFunction = this._renderObjectDirect;',
      'nodeFrame.renderId = previousRenderId;', 'this.lighting.finishRender( scene );', 'this._callDepth --;',
      'this.setRenderTarget( outputRenderTarget, activeCubeFace, activeMipmapLevel );',
    ]) expect(renderScene, line).toContain(line);
    expect(renderScene).not.toMatch(/\btry\s*\{/);          // three's own finally would make the guard unneeded
  });

  it('a render context is keyed by the call depth, and a render object by its render context', () => {
    expect(bundle).toContain("const renderStateKey = attachmentState + '-' + mrtState + '-' + callDepth;");
    expect(bundle).toContain('const renderContext = this._renderContexts.get( renderTarget, this._mrt, this._callDepth );');
    expect(bundle).toContain('_chainKeys$3[ 2 ] = renderContext;');
  });

  it('review F1: WebGLBackend keeps the current context across begin/finishRender', () => {
    expect(bundle).toContain('renderContextData.previousContext = this._currentContext;');
    expect(bundle).toContain('this._currentContext = previousContext;');
  });

  it('the lighting stack the guard pops is three\'s `_cache`', () => {
    expect(bundle).toContain('this._cache.push( this.getNode( scene ).getLights() );');
    expect(bundle).toContain('this.getNode( scene ).setLights( this._cache.pop() );');
  });
});

describe('RENDER-DEPTH-RESTORE: the page installs it', () => {
  it('renderer.ts installs the guard beside the other renderer guards, on either backend', () => {
    const r = src('renderer.ts');
    expect(r).toContain("import { restoreRenderStateOnThrow, type RenderDepthRenderer } from './renderDepth';");
    expect(r).toMatch(/\n\s+restoreRenderStateOnThrow\(renderer as unknown as RenderDepthRenderer\);/);
  });
});
