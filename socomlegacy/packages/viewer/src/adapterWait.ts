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
 * Whether WebGPU answers with an adapter within `ms`: false with no `navigator.gpu`, no adapter, a refusal or a stall
 * past the bound -- the renderer then builds on WebGL2 (`forceWebGL`). An answer after the bound changes nothing.
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
    gpu.requestAdapter().then((adapter) => { end(adapter !== null && adapter !== undefined); }, () => { end(false); });
  });
}
