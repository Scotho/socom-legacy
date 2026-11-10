import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GPU_TIME_PARAM, GpuTimer, gpuTimeAsked, timestampsAvailable, type TimestampRendererLike } from '../src/gpuStats';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * CPS GPU time (product track, a dev-only instrument, a browser adaptation; `docs/plans/2026-11-02-client-performance-sprint.md`,
 * CPS.R9: the readings are frames, CPU, RAM and GPU -- the GPU column was empty). three r186's `WebGPURenderer` takes
 * `trackTimestamp: true` (`Backend` constructor, `parameters.trackTimestamp === true`); its backend then times each
 * render pass (WebGPU: `timestampWrites` on the pass when the device has `timestamp-query`; WebGL2: a `TIME_ELAPSED_EXT`
 * query when `EXT_disjoint_timer_query_webgl2` is present), and `renderer.resolveTimestampsAsync('render')` reads them
 * back, resolving to the last resolved frame's ms. Fake renderers here; no GPU.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

/** A promise and the hand that settles it later. */
function later<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}
const settle = (): Promise<void> => new Promise((ok) => setTimeout(ok, 0));

/** A renderer whose `resolveTimestampsAsync` answers only when the test says. */
function fake(backend: TimestampRendererLike['backend']): { r: TimestampRendererLike; calls: string[]; pending: ReturnType<typeof later<number | undefined>>[] } {
  const calls: string[] = [];
  const pending: ReturnType<typeof later<number | undefined>>[] = [];
  const r: TimestampRendererLike = {
    backend,
    resolveTimestampsAsync: (type = 'render') => { calls.push(type); const p = later<number | undefined>(); pending.push(p); return p.promise; },
  };
  return { r, calls, pending };
}

describe('CPS GPU time: the switch', () => {
  it('asks for timestamps only on a development build with the dev tools switch AND &gputime', () => {
    expect(GPU_TIME_PARAM).toBe('gputime');
    expect(gpuTimeAsked('?devmode&gputime', true)).toBe(true);
    expect(gpuTimeAsked('?devtools&gputime', true)).toBe(true);
    expect(gpuTimeAsked('?devmode', true)).toBe(false);                 // the CPU cells keep their cost as before
    expect(gpuTimeAsked('?gputime', true)).toBe(false);                 // not without the dev tools switch
    expect(gpuTimeAsked('?devmode&gputime', false)).toBe(false);        // never on a release build
    expect(gpuTimeAsked('', true)).toBe(false);
  });
});

describe('CPS GPU time: the timer keeps the last resolved frame', () => {
  it('available only when three kept trackTimestamp on and the backend has the timer (WebGPU feature / WebGL2 extension)', () => {
    expect(timestampsAvailable(fake({ trackTimestamp: true, hasTimestamp: true }).r)).toBe(true);
    expect(timestampsAvailable(fake({ trackTimestamp: false, hasTimestamp: true }).r)).toBe(false);   // WebGPU without timestamp-query
    expect(timestampsAvailable(fake({ trackTimestamp: true, hasTimestamp: false }).r)).toBe(false);   // WebGL2 without the extension
    expect(timestampsAvailable(fake({}).r)).toBe(false);
    expect(timestampsAvailable({ resolveTimestampsAsync: () => Promise.resolve(1) })).toBe(false);   // no backend at all (a fake renderer)
  });

  it('absent: never asks three, and the reading is null', async () => {
    for (const backend of [{ trackTimestamp: false, hasTimestamp: true }, { trackTimestamp: true, hasTimestamp: false }]) {
      const f = fake(backend);
      const t = new GpuTimer(f.r);
      t.frame(); t.frame();
      await settle();
      expect(f.calls).toEqual([]);
      expect(t.stats()).toBeNull();
    }
  });

  it('asks for render and compute at a frame tail, never blocks: null until they resolve, then the last resolved value', async () => {
    const f = fake({ trackTimestamp: true, hasTimestamp: true });
    const t = new GpuTimer(f.r);
    t.frame();
    expect(f.calls).toEqual(['render', 'compute']);
    expect(t.stats()).toBeNull();
    t.frame();                                                           // one resolve in flight at a time
    expect(f.calls).toEqual(['render', 'compute']);
    f.pending[0]!.resolve(4.25); f.pending[1]!.resolve(undefined);       // no compute pass timed: three's undefined
    await settle();
    expect(t.stats()).toEqual({ render_ms: 4.25, compute_ms: null });
    t.frame();
    expect(f.calls).toEqual(['render', 'compute', 'render', 'compute']);
    expect(t.stats()).toEqual({ render_ms: 4.25, compute_ms: null });   // the last resolved, until the next resolves
    f.pending[2]!.resolve(6.5); f.pending[3]!.resolve(0.75);
    await settle();
    expect(t.stats()).toEqual({ render_ms: 6.5, compute_ms: 0.75 });
    expect(JSON.parse(JSON.stringify(t.stats()))).toEqual(t.stats());   // plain JSON, for the live scene's evaluate
  });

  it('a failed or empty resolve keeps the last value and frees the next frame to ask again', async () => {
    const f = fake({ trackTimestamp: true, hasTimestamp: true });
    const t = new GpuTimer(f.r);
    t.frame();
    f.pending[0]!.resolve(3); f.pending[1]!.resolve(undefined);
    await settle();
    t.frame();
    f.pending[2]!.reject(new Error('device lost')); f.pending[3]!.resolve(undefined);
    await settle();
    expect(t.stats()).toEqual({ render_ms: 3, compute_ms: null });
    t.frame();
    expect(f.calls.length).toBe(6);
    f.pending[4]!.resolve(undefined); f.pending[5]!.resolve(undefined);
    await settle();
    expect(t.stats()).toEqual({ render_ms: 3, compute_ms: null });
  });
});

describe('CPS GPU time: the wiring is a development build\'s only', () => {
  it('renderer.ts hands three trackTimestamp only when asked (false, three\'s default, otherwise)', () => {
    const r = src('renderer.ts');
    expect(r).toMatch(/export async function createRenderer\(canvas: HTMLCanvasElement, options: RendererOptions = \{\}\): Promise<ViewerRenderer>/);
    expect(r).toMatch(/new WebGPURenderer\(\{ canvas, antialias, forceWebGL: !webgpu, alpha: false, trackTimestamp: options\.trackTimestamp === true, \.\.\.powerParameters\(canvas, options\.power, webgpu, antialias\) \}\)/);   // VS-6: antialias and power from the options
  });
  it('matchMount.ts asks for it under a literal import.meta.env.DEV and the switch, times at the frame tail, and hangs gpuStats under devStats', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/const search = win\.location\?\.search \?\? '';/);
    expect(mount).toMatch(/r\.createRenderer\(c, \{ \.\.\.choice, trackTimestamp: import\.meta\.en[v]\.DEV && gpuTimeAsked\(search\) \}\)/);   // VS-6: the keeper's next-match rows beside it
    // the frame tail: after the overlays' snapshot, under the same gate
    expect(mount).toMatch(/lastOverlays = frameOverlaysOf\(firearm\.effects\.lights\);[^\n]*\n {4}if \(import\.meta\.en[v]\.DEV && devStats && renderer\) \(gpuTimer \?\?= new GpuTimer\(renderer\.renderer as unknown as TimestampRendererLike\)\)\.frame\(\);/);
    expect(mount).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devStats\) [^\n]*\.gpuStats = \(\) => gpuTimer\?\.stats\(\) \?\? null;/);
    expect(mount).toMatch(/\n {2}gpuStats\?\(\): GpuStats \| null;/);
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no gpuStats (CPS GPU time; OT.R29\'s rule for dev tools)', dist), () => {
  it('its hook name is absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('gpuStats');
  });
});
