// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// N1b (the fresh review of N1; GM-XBOX1): the renderer probe (`./softwareRenderer` `probeSoftwareRenderer`) makes and loses
// a throwaway WebGL context. N1 made the page's one memoised probe (`./deviceClass` `pageRendererProbe`) run before the
// front's GPU surface; the error beacon's context (`./clientErrorBeacon` `pageBeaconContext`), the perf line's default
// (`./perfLine` `pagePerfLine`) and the no-GPU notice's default (`./softwareRendererNotice` `watchSoftwareRenderer`) read
// that memo, never a second throwaway context beside a live menu or match one on the Xbox class. PRODUCT TRACK, a browser
// adaptation with no original: it counts context makings, never a byte of a frame. Evidence kind: unit test (jsdom;
// `HTMLCanvasElement.prototype.getContext` observed, no GPU).

const XBOX = 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
/** The renderer the stand-in names: the Xbox class's unless a case says otherwise. */
let rendererNow = XBOX;

type DeviceClassModule = typeof import('../src/deviceClass');
let dc: DeviceClassModule;
let made: string[];

/** A WebGL stand-in naming the Xbox class's renderer; every 2D ask answers null (jsdom has none). */
function fakeGl(): unknown {
  return {
    RENDERER: 0x1f01,
    getExtension: (n: string) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
      : n === 'WEBGL_lose_context' ? { loseContext: () => {} } : null),
    getParameter: () => rendererNow,
  };
}

beforeEach(async () => {
  vi.resetModules();                                   // every memo the module's: a fresh page per test
  made = [];
  rendererNow = XBOX;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) => {
    if (id === 'webgl2' || id === 'webgl') { made.push(id); return fakeGl(); }
    return null;
  }) as never);
  dc = await import('../src/deviceClass');
  dc.resetPageRendererProbeForTest();
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); dc.resetPageRendererProbeForTest(); });

describe("N1b (GM-XBOX1): the page's one probe, never a second throwaway WebGL context", () => {
  it('the page probe itself makes one context, then answers from its memo', () => {
    expect(dc.pageRendererProbe()).toEqual({ renderer: XBOX, software: false });
    expect(dc.pageRendererProbe().renderer).toBe(XBOX);
    expect(made).toEqual(['webgl2']);
  });

  it('a software renderer through the real memo is the software class (the viewer-shadows review, finding 2)', () => {
    // The probe module's own internal call, not a module stub: only getContext is observed, so the memo, the
    // null-renderer filter (`readDeviceSignals`) and `detectDeviceClass` all run as on the page.
    rendererNow = SWIFTSHADER;
    expect(dc.pageRendererProbe()).toEqual({ renderer: SWIFTSHADER, software: true });
    expect(dc.pageDeviceClass()).toBe('software');
    expect(dc.pageDeviceClass()).toBe('software');      // from the memo
    expect(made).toEqual(['webgl2']);
  });

  it('pageBeaconContext (a first client error, a match end\'s perf report) reads the page probe: no further context', async () => {
    const beacon = await import('../src/clientErrorBeacon');
    beacon.resetPageClientErrorBeaconForTest();
    dc.pageRendererProbe();                              // N1: run before the front's GPU surface
    expect(made).toHaveLength(1);
    expect(beacon.pageBeaconContext(5000).adapter).toBe(XBOX);
    expect(beacon.pageBeaconContext(6000).adapter).toBe(XBOX);
    expect(made).toHaveLength(1);
  });

  it('pagePerfLine with no probe of its own reads the page probe: no further context', async () => {
    const perf = await import('../src/perfLine');
    dc.pageRendererProbe();
    expect(made).toHaveLength(1);
    const line = perf.pagePerfLine({ userAgent: '', devicePixelRatio: 1, version: '0.4.2' });
    expect(line).toContain(XBOX);
    expect(made).toHaveLength(1);
  });

  it('pagePerfLine still takes a test\'s own probe', async () => {
    const perf = await import('../src/perfLine');
    const probe = vi.fn(() => ({ renderer: 'R', software: false }));
    perf.pagePerfLine({ userAgent: '', probe, devicePixelRatio: 1, version: '0.4.2' });
    expect(probe).toHaveBeenCalled();
  });

  it('watchSoftwareRenderer with no probe of its own reads the page probe after the first frame: no further context', async () => {
    const notice = await import('../src/softwareRendererNotice');
    const queue: (() => void)[] = [];
    const win = {
      navigator: {},
      requestAnimationFrame: (cb: FrameRequestCallback) => { queue.push(() => cb(0)); return queue.length; },
      setTimeout: (cb: () => void) => { queue.push(cb); return queue.length; },
    } as unknown as Window;
    dc.pageRendererProbe();
    expect(made).toHaveLength(1);
    notice.watchSoftwareRenderer(document, win);
    while (queue.length) queue.shift()!();
    expect(made).toHaveLength(1);
    expect(document.querySelector('[data-no-gpu]')).toBeNull();   // a hardware renderer: no notice
  });
});
