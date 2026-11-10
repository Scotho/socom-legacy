// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS_BACKEND_KEY, saveGraphicsBackend } from '../src/graphicsBackend';

/**
 * VS-6 (VS.R4, a browser adaptation, product track): `createRenderer`'s antialias, graphics and power preference come
 * from its options -- the match hands it the video keeper's (`./matchMount`'s `pageRenderer`) when the mount makes its
 * renderer -- and, absent, from today's reads (`readGraphicsBackend()`, antialias `graphics !== 'xbox'`), so every
 * other caller (the test room, the Forge) makes the renderer it made before. three's renderer is a fake that records
 * what it was constructed with; no GPU, no browser.
 */
const made = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('three/webgpu', async (original) => {
  const actual = await original<typeof import('three/webgpu')>();
  class RecordingRenderer {
    samples = 4; stencil = false; outputColorSpace = ''; autoClear = true; target: unknown = null;
    backend = { isWebGLBackend: true, createRenderPipeline() {} };
    constructor(parameters: Record<string, unknown>) { made.push(parameters); }
    async init() {} setPixelRatio() {} setSize() {} setClearColor() {}
    getRenderTarget() { return this.target; } setRenderTarget(t: unknown) { this.target = t; }
    getDrawingBufferSize(v: { set(x: number, y: number): unknown }) { return v.set(640, 448); }
    render() {} async compileAsync() {} async dispose() {}
  }
  return { ...actual, WebGPURenderer: RecordingRenderer };
});
// S2: the page's device class, set per test (the real probe classes jsdom 'software'); `classGraphics` stays the real one.
const deviceClass = vi.hoisted(() => ({ value: 'standard' as string }));
vi.mock('../src/deviceClass', async (original) => ({ ...(await original<typeof import('../src/deviceClass')>()), pageDeviceClass: () => deviceClass.value }));
import { createRenderer } from '../src/renderer';

/** A canvas whose `getContext` is recorded and answers a stand-in context. */
function canvas() {
  const asked: { kind: string; attributes: unknown }[] = [];
  const context = { stand: 'in' };
  const c = { getContext: (kind: string, attributes: unknown) => { asked.push({ kind, attributes }); return context; } } as unknown as HTMLCanvasElement;
  return { c, asked, context };
}

const withGpu = (): void => { Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: () => Promise.resolve({}) } }); };

beforeEach(() => { made.length = 0; localStorage.clear(); deviceClass.value = 'standard'; });
afterEach(() => { delete (navigator as { gpu?: unknown }).gpu; localStorage.clear(); vi.restoreAllMocks(); });

describe('VS-6: createRenderer takes antialias, graphics and power from its options', () => {
  it('absent, today\'s reads: Automatic (WebGL2), antialias on, no power preference and no context of its own', async () => {
    const k = canvas();
    await createRenderer(k.c);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ antialias: true, forceWebGL: true, alpha: false, trackTimestamp: false });
    expect(made[0]).not.toHaveProperty('powerPreference');
    expect(made[0]).not.toHaveProperty('context');
    expect(k.asked).toEqual([]);
  });

  it('absent, a saved Xbox preset still turns antialias off (today\'s `graphics !== \'xbox\'`)', async () => {
    saveGraphicsBackend('xbox');
    await createRenderer(canvas().c);
    expect(made[0]).toMatchObject({ antialias: false, forceWebGL: true });
  });

  it('the options win over the saved choice: graphics webgl2 over a saved Xbox makes antialias on; antialias false turns it off', async () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    await createRenderer(canvas().c, { graphics: 'webgl2' });
    expect(made[0]).toMatchObject({ antialias: true, forceWebGL: true });
    await createRenderer(canvas().c, { graphics: 'webgl2', antialias: false });
    expect(made[1]).toMatchObject({ antialias: false, forceWebGL: true });
  });

  // WEBGPU-DEFAULT (WG-7, LATER 708; the owner's word 2026-11-09, MEGA.R8): Automatic asks WebGPU first, so the handed-in
  // choice is shown winning over the saved one both ways, and Automatic asking the adapter whatever is saved.
  it('graphics webgpu asks for the adapter (forceWebGL off) though the saved choice is WebGL2; graphics webgl2 does not though WebGPU is saved; Automatic asks', async () => {
    withGpu();
    saveGraphicsBackend('webgl2');
    await createRenderer(canvas().c, { graphics: 'webgpu' });
    expect(made[0]).toMatchObject({ forceWebGL: false, antialias: true });
    saveGraphicsBackend('webgpu');
    await createRenderer(canvas().c, { graphics: 'webgl2' });
    expect(made[1]).toMatchObject({ forceWebGL: true });
    saveGraphicsBackend('webgl2');
    await createRenderer(canvas().c, { graphics: 'auto' });
    expect(made[2]).toMatchObject({ forceWebGL: false });
  });

  it('power maps to powerPreference when not default: on WebGPU three\'s parameter; on WebGL2 the context made with it', async () => {
    withGpu();
    const g = canvas();
    await createRenderer(g.c, { graphics: 'webgpu', power: 'high-performance' });
    expect(made[0]).toMatchObject({ forceWebGL: false, powerPreference: 'high-performance' });
    expect(made[0]).not.toHaveProperty('context');                    // the WebGPU canvas context is three's own
    expect(g.asked).toEqual([]);
    const w = canvas();
    await createRenderer(w.c, { graphics: 'webgl2', antialias: false, power: 'low-power' });
    expect(made[1]).toMatchObject({ forceWebGL: true, powerPreference: 'low-power', antialias: false });
    // three's own WebGL2 context attributes (WebGLBackend.init: antialias from the samples, alpha always, depth, no
    // stencil) with the preference beside them; three is handed the context
    expect(w.asked).toEqual([{ kind: 'webgl2', attributes: { antialias: false, alpha: true, depth: true, stencil: false, powerPreference: 'low-power' } }]);
    expect(made[1]!.context).toBe(w.context);
  });

  it('power default asks nothing: no powerPreference, no context', async () => {
    const k = canvas();
    await createRenderer(k.c, { graphics: 'webgl2', power: 'default' });
    expect(made[0]).not.toHaveProperty('powerPreference');
    expect(made[0]).not.toHaveProperty('context');
    expect(k.asked).toEqual([]);
  });
});

// S2 (the controller's level-3 review of mega; the video settings plan's Log, 2026-11-10; VS-7's Xbox class, a browser
// adaptation): on the Xbox class a resolved Automatic -- a named preset's rows, or the test room's and the Forge's
// renderers with no `graphics` -- draws on WebGL2 and never asks for an adapter; a player's WebGPU, the Xbox pick and an
// address override are kept. The renderer is the recording fake above; the adapter request is counted.
describe('S2: the Xbox class never asks WebGPU for Automatic', () => {
  const gpuAsked = (): { count: number } => {
    const asked = { count: 0 };
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: () => { asked.count++; return Promise.resolve({}); } } });
    return asked;
  };
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('xbox, Automatic handed in (a named preset\'s rows) or absent (the test room, the Forge): WebGL2, no adapter asked, antialias as the choice says', async () => {
    deviceClass.value = 'xbox';
    const asked = gpuAsked();
    await createRenderer(canvas().c, { graphics: 'auto' });
    await createRenderer(canvas().c);
    expect(asked.count).toBe(0);
    expect(made[0]).toMatchObject({ forceWebGL: true, antialias: true });
    expect(made[1]).toMatchObject({ forceWebGL: true, antialias: true });
  });

  it('xbox, a player\'s WebGPU still asks for the adapter; the Xbox pick stays the Xbox preset (WebGL2, antialias off)', async () => {
    deviceClass.value = 'xbox';
    const asked = gpuAsked();
    await createRenderer(canvas().c, { graphics: 'webgpu' });
    expect(asked.count).toBe(1);
    expect(made[0]).toMatchObject({ forceWebGL: false });
    saveGraphicsBackend('xbox');
    await createRenderer(canvas().c);
    expect(asked.count).toBe(1);
    expect(made[1]).toMatchObject({ forceWebGL: true, antialias: false });
  });

  it('xbox, an address override of Automatic (?renderer=auto) wins as today: the adapter is asked', async () => {
    deviceClass.value = 'xbox';
    window.history.replaceState(null, '', '/?renderer=auto');
    const asked = gpuAsked();
    await createRenderer(canvas().c);
    expect(asked.count).toBe(1);
    expect(made[0]).toMatchObject({ forceWebGL: false });
  });

  it('every other class: Automatic asks for the adapter, as before', async () => {
    for (const cls of ['software', 'touch', 'lowMemory', 'standard', 'high']) {
      deviceClass.value = cls;
      made.length = 0;
      const asked = gpuAsked();
      await createRenderer(canvas().c, { graphics: 'auto' });
      expect(asked.count, cls).toBe(1);
      expect(made[0], cls).toMatchObject({ forceWebGL: false });
    }
  });
});
