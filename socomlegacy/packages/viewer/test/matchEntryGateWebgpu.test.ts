// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// LATER 1265 review (pilot/kill/keyjob-later1265-review.md) F1/F2: `willUseWebGPU` must make the renderer's choice
// (`../src/renderer` `createRenderer`): the class read, then MAC-FLOOR's `appleGraphics` on a resolved Automatic, then the
// adapter's answer. The page's device class and Apple probe are set per test; `classGraphics` / `appleGraphics` stay real.
const deviceClass = vi.hoisted(() => ({ value: 'standard' as string }));
const apple = vi.hoisted(() => ({ value: false }));
vi.mock('../src/deviceClass', async (original) => ({ ...(await original<typeof import('../src/deviceClass')>()), pageDeviceClass: () => deviceClass.value, pageAppleGpu: () => apple.value }));
import { gateMatchEntry, willUseWebGPU } from '../src/matchEntryGate';

/** A navigator.gpu whose adapter request answers (an adapter), counted. */
const answeringGpu = (): { asked: number } => {
  const c = { asked: 0 };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: () => { c.asked++; return Promise.resolve({}); } } });
  return c;
};

describe('LATER 1265 review F1/F2: willUseWebGPU is the renderer\'s choice', () => {
  afterEach(() => {
    deviceClass.value = 'standard'; apple.value = false;
    Reflect.deleteProperty(navigator, 'gpu');
    localStorage.clear();
  });

  it('an ordinary page on Automatic with an adapter that answers: WebGPU', async () => {
    answeringGpu();
    expect(await willUseWebGPU()).toBe(true);
  });

  it('F1: an Apple GPU on Automatic draws WebGL2 (MAC-FLOOR), so WebGPU is NOT used though an adapter answers', async () => {
    apple.value = true;
    const gpu = answeringGpu();
    expect(await willUseWebGPU()).toBe(false);
    expect(gpu.asked).toBe(0);                                      // as the renderer: no adapter request for a WebGL2 choice
  });

  it('F1: on the row\'s own device (Apple, WebGL2 blocked, Automatic, an adapter that answers) the gate ASKS', async () => {
    apple.value = true;
    answeringGpu();
    document.body.innerHTML = '';
    const asked = await gateMatchEntry(document, { leave: () => undefined, active: () => true }, { probe: () => ({ webgl2: false }), front: () => false });
    expect(asked).toBe(true);
  });

  it('F2: a page whose probe made WebGL2 never requests an adapter (the early return)', async () => {
    const webgpu = vi.fn(async () => true);
    const asked = await gateMatchEntry(document, { leave: () => undefined, active: () => true }, { probe: () => ({ webgl2: true }), front: () => false, webgpu });
    expect(asked).toBe(false);
    expect(webgpu).not.toHaveBeenCalled();
  });
});
