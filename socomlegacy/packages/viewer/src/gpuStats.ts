/**
 * CPS GPU time (product track, a dev-only instrument, a browser adaptation with no original; `docs/plans/
 * 2026-11-02-client-performance-sprint.md`, CPS.R9: the readings are frames, CPU, RAM and GPU, and the GPU column was
 * empty): the match's renderer's GPU time a frame, for the live perf cell (`tools/perf/cpf/liveRun.ts`), beside the CPU's
 * busy ms -- so a GPU-bound player (a 4K display) can be reasoned about. It changes nothing the game draws or does.
 *
 * three r186 (`node_modules/three/src/renderers`): `WebGPURenderer` takes `trackTimestamp: true` (`common/Backend.js`
 * constructor, `parameters.trackTimestamp === true`). On WebGPU the backend keeps it only when the device has
 * `timestamp-query` (`webgpu/WebGPUBackend.js` `init`: `trackTimestamp && hasFeature(TimestampQuery)`), and then each
 * render and compute pass carries `timestampWrites` into a 2048-slot query set (`initTimestampQuery`); on WebGL2 the
 * backend times a pass with a `TIME_ELAPSED_EXT` query only when `EXT_disjoint_timer_query_webgl2` is present
 * (`webgl-fallback/WebGLBackend.js` `initTimestampQuery` / `prepareTimestampBuffer`, gated on `this.disjoint`; its
 * `hasTimestamp` getter is `disjoint !== null`, WebGPU's is `true`). `renderer.resolveTimestampsAsync(type)`
 * (`common/Renderer.js` -> `Backend.resolveTimestampsAsync`) reads the pool back and resolves to the LAST resolved
 * frame's summed pass time in ms (the pools' `resolveQueriesAsync`: the passes grouped by their uid's `:f<frame>`, the
 * last frame's total), `undefined` when no pass of that type was ever timed. `renderer.info.render.timestamp` holds the
 * same figure but `Info.reset` zeroes it at each frame's start, so the value is kept here instead.
 *
 * What it costs, per three's code, with the switch on: WebGPU -- two timestamp writes a render pass and, per resolve, a
 * command encoder (`resolveQuerySet` + `copyBufferToBuffer`), a submit and a `mapAsync` read-back of the used slots;
 * WebGL2 -- a `beginQuery`/`endQuery` a pass (one active at a time) and, per resolve, a `getQueryParameter` poll every
 * 1 ms (`setTimeout`) on the main thread until the results are available. Small, but not nothing, and on the main thread
 * under WebGL2: so it has its own switch (`GPU_TIME_PARAM`) beside the dev tools', and a CPU cell run without it is as
 * before. Without the switch, or on a release build, three is constructed exactly as before (`trackTimestamp` false).
 */
import { devSwitches } from './source';

/** The query word that asks for the GPU timer, beside the dev tools switch (`./source` `devSwitches(search).tools`). */
export const GPU_TIME_PARAM = 'gputime';

/**
 * Whether the page asks three for timestamps: a development build (`devBuild`, Vite's `import.meta.env.DEV` by default)
 * with the dev tools switch on (`?devmode` or `?devtools`) AND `GPU_TIME_PARAM`. A release build never.
 */
export function gpuTimeAsked(search: string, devBuild: boolean = import.meta.env.DEV): boolean {
  if (!devBuild || !devSwitches(search, devBuild).tools) return false;
  try { return new URLSearchParams(search).has(GPU_TIME_PARAM); } catch { return false; }
}

/** What the timer reads of three's `WebGPURenderer` (its backend's flags are not on three's base `Backend` type). */
export interface TimestampRendererLike {
  backend?: { trackTimestamp?: boolean; hasTimestamp?: boolean };
  resolveTimestampsAsync(type?: 'render' | 'compute'): Promise<number | undefined>;
}

/** The last resolved frame's GPU time (ms): its render passes', and its compute passes' (null: none timed). */
export interface GpuStats { render_ms: number; compute_ms: number | null }

/**
 * A renderer with a backend (a test's fake may have none), three kept `trackTimestamp` on (WebGPU: the device has
 * `timestamp-query`) and the backend has its timer (WebGL2: the extension).
 */
export function timestampsAvailable(r: TimestampRendererLike): boolean {
  const b = r.backend;
  return b?.trackTimestamp === true && b.hasTimestamp === true;
}

/**
 * The GPU timer: `frame()` at the frame's tail asks three to resolve the passes timed so far, never awaiting it (the
 * frame goes on); one resolve in flight at a time. `stats()` is the last resolved value, null until one resolves and
 * whenever the timer is absent (three never asked then).
 */
export class GpuTimer {
  private last: GpuStats | null = null;
  private pending = false;

  constructor(private readonly renderer: TimestampRendererLike) {}

  frame(): void {
    if (this.pending || !timestampsAvailable(this.renderer)) return;
    this.pending = true;
    Promise.all([this.renderer.resolveTimestampsAsync('render'), this.renderer.resolveTimestampsAsync('compute')]).then(([render, compute]) => {
      if (typeof render === 'number' && Number.isFinite(render)) {
        this.last = { render_ms: render, compute_ms: typeof compute === 'number' && Number.isFinite(compute) ? compute : null };
      }
    }, () => { /* a failed read-back keeps the last value */ }).finally(() => { this.pending = false; });
  }

  stats(): GpuStats | null {
    return this.last;
  }
}
