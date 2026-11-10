// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPageRendererProbeForTest } from '../src/deviceClass';
import { mountFrontEnd } from '../src/frontEnd';
import { FrontEndGpu } from '../src/uiGpuFront';
import { UiGpuSwitch } from '../src/uiGpuSwitch';

// N1 (the Fable seat's delta review of 788d20722; GM-XBOX1): the device class's renderer probe (`./deviceClass`
// `pageRendererProbe`, `./softwareRenderer` `probeSoftwareRenderer`) makes and loses a throwaway WebGL context, once a
// page load. `mountFrontEnd` runs it BEFORE the front's GPU surface is mounted, so the throwaway context is never made
// beside the front's -- the loading panel's and Settings' later class reads hit the memo. PRODUCT TRACK, a browser
// adaptation with no original: it orders two context makings, never a byte of a frame. Evidence kind: unit test (jsdom;
// `getContext` and `FrontEndGpu.mount` observed, no GPU).

const pending = { read: () => new Promise<Uint8Array>(() => {}), list: () => new Promise<string[]>(() => {}) };
const audio = { setData: () => {} };

beforeEach(() => { resetPageRendererProbeForTest(); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); resetPageRendererProbeForTest(); });

describe("N1 (GM-XBOX1): the device class's probe runs before the front's GPU surface mounts", () => {
  it('mountFrontEnd: the probe has asked its WebGL context when FrontEndGpu.mount is entered', () => {
    const order: string[] = [];
    // jsdom has no 2D canvas: a stand-in for `say()`'s calls, so the page reaches the GPU mount (`if (ctx && win)`);
    // every WebGL ask answers null (the probe then reads "no context", memoised like any verdict).
    const ctx2d = { fillStyle: '', font: '', fillRect: () => {}, fillText: () => {} };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) => {
      order.push(`getContext:${id}`);
      return id === '2d' ? ctx2d : null;
    }) as never);
    const real = FrontEndGpu.mount.bind(FrontEndGpu);
    vi.spyOn(FrontEndGpu, 'mount').mockImplementation((o) => { order.push('FrontEndGpu.mount'); return real(o); });

    const sw = new UiGpuSwitch({ search: '?uiGpu=on', storage: () => null, devTools: false });
    const m = mountFrontEnd('?menuflow', { kind: 'http', baseUrl: 'http://127.0.0.1:1/' } as never, document, { assets: pending as never, audio: audio as never, uiGpu: sw })!;

    const mounted = order.indexOf('FrontEndGpu.mount');
    expect(mounted, 'the front surface mounted').toBeGreaterThanOrEqual(0);
    const probed = order.indexOf('getContext:webgl2');
    expect(probed, "the probe's throwaway WebGL2 ask was made during the mount").toBeGreaterThanOrEqual(0);
    expect(probed, 'and before the front surface').toBeLessThan(mounted);
    m.stop();
  });
});
