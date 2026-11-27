import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector2, Vector4 } from 'three';

// Keep three's real Renderer/CanvasTarget sizing, viewport and scissor methods. Only GPU
// initialization and disposal are stubbed: this is a unit test, not a rendered browser run.
vi.mock('three/webgpu', async original => {
  const actual = await original<typeof import('three/webgpu')>();
  class SizingRenderer extends actual.WebGPURenderer {
    override async init() { (this.backend as unknown as { setScissorTest(): void }).setScissorTest = () => {}; return this; }
    override getMaxAnisotropy() { return 1; }
    override async dispose() {}
  }
  return { ...actual, WebGPURenderer: SizingRenderer };
});
import { createRenderer, PS2_FRAME, type ViewerRenderer } from '../src/renderer';

function trackedCanvas() {
  let width = 300, height = 150;
  const writes: [string, number][] = [];
  const canvas = {
    get width() { return width; }, set width(n: number) { writes.push(['width', n]); width = n; },
    get height() { return height; }, set height(n: number) { writes.push(['height', n]); height = n; },
    style: { width: '100%', height: '100%' },
  } as unknown as HTMLCanvasElement;
  return { canvas, writes };
}

const viewers: ViewerRenderer[] = [];
async function fixture() {
  const tracked = trackedCanvas();
  const v = await createRenderer(tracked.canvas, { graphics: 'webgl2' });
  viewers.push(v);
  const resized = vi.fn();
  // Pinned three r186's actual resize event drives backend attachment updates.
  (v.renderer as unknown as { _canvasTarget: { addEventListener(type: 'resize', fn: () => void): void } })
    ._canvasTarget.addEventListener('resize', resized);
  return { ...tracked, v, resized };
}

beforeEach(() => vi.stubGlobal('devicePixelRatio', 2));
afterEach(() => {
  for (const v of viewers.splice(0)) v.renderer.dispose();
  vi.unstubAllGlobals();
});

describe('renderer sizing adaptation with real three sizing methods', () => {
  it('sizes the first native frame and leaves CSS dimensions owned by layout', async () => {
    const { v, canvas, writes } = await fixture();
    writes.length = 0;
    v.resize(801, 451);
    expect(writes).toEqual([['width', 1602], ['height', 902]]);
    expect(v.renderer.getSize(new Vector2()).toArray()).toEqual([801, 451]);
    expect(v.renderer.getViewport(new Vector4()).toArray()).toEqual([0, 0, 801, 451]);
    expect(canvas.style).toEqual({ width: '100%', height: '100%' });
  });

  it('does not reset the canvas on repeated native viewport notifications', async () => {
    const { v, writes, resized } = await fixture();
    v.resize(800, 450);
    writes.length = 0;
    resized.mockClear();
    for (let i = 0; i < 10; i++) v.resize(800, 450);
    expect(writes).toEqual([]);
    expect(resized).not.toHaveBeenCalled();
    v.resize(900, 500);
    expect(writes).toEqual([['width', 1800], ['height', 1000]]);
    expect(resized).toHaveBeenCalledOnce();
  });

  it('does not reset the fixed PS2 buffer across fullscreen notifications', async () => {
    const { v, writes } = await fixture();
    v.resize(1280, 720);
    v.setPresentation('ps2');
    writes.length = 0;
    for (let i = 0; i < 10; i++) v.resize(PS2_FRAME.width, PS2_FRAME.height);
    v.setPresentation('ps2');
    expect(writes).toEqual([]);
    expect(v.renderer.getDrawingBufferSize(new Vector2()).toArray()).toEqual([640, 448]);
    expect(v.renderer.getSize(new Vector2()).toArray()).toEqual([640, 448]);
    expect(v.renderer.getViewport(new Vector4()).toArray()).toEqual([0, 0, 640, 448]);
  });

  it('changes size and ratio together on native -> PS2 -> native with one write per dimension', async () => {
    const { v, writes, resized } = await fixture();
    v.resize(1280, 720);
    writes.length = 0;
    resized.mockClear();
    v.setPresentation('ps2');
    expect(writes).toEqual([['width', 640], ['height', 448]]);
    expect(resized).toHaveBeenCalledOnce();
    writes.length = 0;
    resized.mockClear();
    v.resize(1001, 701);
    v.setPixelRatio(1.5);
    expect(writes).toEqual([]);
    expect(resized).not.toHaveBeenCalled();
    expect(v.pixelRatio()).toBe(1.5);
    v.setPresentation('native');
    expect(writes).toEqual([['width', 1501], ['height', 1051]]);
    expect(resized).toHaveBeenCalledOnce();
    expect(v.renderer.getSize(new Vector2()).toArray()).toEqual([1001, 701]);
    expect(v.renderer.getViewport(new Vector4()).toArray()).toEqual([0, 0, 1001, 701]);
    expect(v.renderer.getPixelRatio()).toBe(1.5);
  });

  it('applies a native ratio change once and keeps the existing device clamp', async () => {
    const { v, writes } = await fixture();
    v.resize(801, 451);
    writes.length = 0;
    v.setPixelRatio(1.25);
    expect(writes).toEqual([['width', 1001], ['height', 563]]);
    writes.length = 0;
    v.setPixelRatio(1.25);
    v.resize(801, 451);
    expect(writes).toEqual([]);
    vi.stubGlobal('devicePixelRatio', 1);
    v.setPixelRatio(2);
    expect(writes).toEqual([['width', 801], ['height', 451]]);
    expect(v.pixelRatio()).toBe(1);
  });

  it('skips presentation changes with identical effective sizing', async () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const { v, writes } = await fixture();
    v.resize(640, 448);
    writes.length = 0;
    v.setPresentation('ps2');
    v.setPresentation('native');
    expect(writes).toEqual([]);
  });

  it('preserves scissor settings and tracks logical sizes even when physical sizes round equally', async () => {
    const { v, writes } = await fixture();
    v.setPixelRatio(0.5);
    v.resize(800, 450);
    v.renderer.setScissor(3, 4, 100, 200);
    v.renderer.setScissorTest(true);
    writes.length = 0;
    v.resize(801, 451);
    expect(writes).toEqual([['width', 400], ['height', 225]]);
    expect(v.renderer.getSize(new Vector2()).toArray()).toEqual([801, 451]);
    expect(v.renderer.getViewport(new Vector4()).toArray()).toEqual([0, 0, 801, 451]);
    expect(v.renderer.getScissor(new Vector4()).toArray()).toEqual([3, 4, 100, 200]);
    expect(v.renderer.getScissorTest()).toBe(true);
  });
});
