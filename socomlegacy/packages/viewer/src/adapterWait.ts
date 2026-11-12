/**
 * LATER 128 (a browser adaptation; the original has no renderer to choose): how long the match's renderer waits for
 * WebGPU's adapter before it draws on WebGL2. A working browser answers `requestAdapter` in milliseconds, with an
 * adapter or with none; the bound only matters where the request stalls. PAR-48c's probes saw it hold over 20 s on the
 * menu spec's third page (headless chromium, SwiftShader), no context made and nothing drawn, because
 * `createRenderer`'s `await renderer.init()` waited with no bound (`./renderer`).
 */
export const WEBGPU_ADAPTER_WAIT_MS_ADAPTATION = 2000;

/** What `webgpuAnswers` reads of `navigator.gpu` (structural, so the test needs no WebGPU). */
export interface GpuLike {
  requestAdapter(): Promise<unknown>;
}

/**
 * WG-7, W5 (a browser adaptation): whether an adapter is a software one. The WebGPU specification (W3C) marks an adapter
 * that trades performance for compatibility as a fallback adapter: `GPUAdapter.isFallbackAdapter` in its earlier text,
 * `GPUAdapterInfo.isFallbackAdapter` (the adapter's `info`) where the field moved; either is read. A fallback adapter is
 * treated as no adapter, so the page draws on WebGL2 rather than WebGPU in software.
 */
export function isFallbackAdapter(adapter: unknown): boolean {
  if (adapter === null || typeof adapter !== 'object') return false;
  const a = adapter as { isFallbackAdapter?: unknown; info?: { isFallbackAdapter?: unknown } | null };
  return a.isFallbackAdapter === true || a.info?.isFallbackAdapter === true;
}

/**
 * Whether WebGPU answers with an adapter within `ms`: false with no `navigator.gpu`, no adapter, a fallback (software)
 * adapter (`isFallbackAdapter`, WG-7), a refusal or a stall past the bound -- the renderer then builds on WebGL2
 * (`forceWebGL`). An answer after the bound changes nothing.
 */
export function webgpuAnswers(gpu: GpuLike | undefined, ms: number = WEBGPU_ADAPTER_WAIT_MS_ADAPTATION): Promise<boolean> {
  if (!gpu) return Promise.resolve(false);
  return new Promise<boolean>((done) => {
    let settled = false;
    const end = (answer: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(answer);
    };
    const timer = setTimeout(() => { end(false); }, ms);
    gpu.requestAdapter().then((adapter) => { end(adapter !== null && adapter !== undefined && !isFallbackAdapter(adapter)); }, () => { end(false); });
  });
}
