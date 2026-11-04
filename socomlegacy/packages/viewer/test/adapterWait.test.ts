import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEBGPU_ADAPTER_WAIT_MS_ADAPTATION, webgpuAnswers } from '../src/adapterWait';

/**
 * LATER 128 (a browser adaptation; no original): the match's renderer waits for WebGPU's adapter a bounded time, then
 * draws on WebGL2. PAR-48c's probes: on the menu spec's third page the adapter request held over 20 s, no context was
 * made, and the page showed nothing (`createRenderer`'s `await renderer.init()` had no bound).
 */
const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => { vi.useRealTimers(); });

describe('LATER 128: WebGPU\'s adapter, waited for a bounded time', () => {
  it('an adapter in time: WebGPU', async () => {
    await expect(webgpuAnswers({ requestAdapter: () => Promise.resolve({}) })).resolves.toBe(true);
  });

  it('no adapter, a refusal or no WebGPU at all: WebGL2', async () => {
    await expect(webgpuAnswers({ requestAdapter: () => Promise.resolve(null) })).resolves.toBe(false);
    await expect(webgpuAnswers({ requestAdapter: () => Promise.reject(new Error('no')) })).resolves.toBe(false);
    await expect(webgpuAnswers(undefined)).resolves.toBe(false);
  });

  it('a stalled request: WebGL2 at the bound, and an answer after it changes nothing', async () => {
    vi.useFakeTimers();
    let answer: (a: object) => void = () => {};
    const said = webgpuAnswers({ requestAdapter: () => new Promise<object>((r) => { answer = r; }) });
    let got: boolean | undefined;
    void said.then((v) => { got = v; });
    await vi.advanceTimersByTimeAsync(WEBGPU_ADAPTER_WAIT_MS_ADAPTATION - 1);
    expect(got).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toBe(false);
    answer({});
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toBe(false);
  });

  it('the bound is a named browser adaptation, a few seconds (a working browser answers in milliseconds)', () => {
    expect(WEBGPU_ADAPTER_WAIT_MS_ADAPTATION).toBeGreaterThanOrEqual(1000);
    expect(WEBGPU_ADAPTER_WAIT_MS_ADAPTATION).toBeLessThanOrEqual(5000);
  });

  it('createRenderer asks first, and builds on WebGL2 when WebGPU did not answer', () => {
    const text = readFileSync(resolve(here, '../src/renderer.ts'), 'utf-8');
    expect(text).toContain('await webgpuAnswers(');
    expect(text).toContain('forceWebGL: !webgpu');
    expect(text).not.toContain('forceWebGL: false');
  });
});
