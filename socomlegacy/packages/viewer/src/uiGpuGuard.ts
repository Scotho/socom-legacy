import type { Rgba } from '@s2u/gs';
import type { UiFramePlan, UiPlanBlendMode } from './uiFramePlan';
import type { UiGpuCaps, UiGpuSurface } from './uiGpuSwitch';

/**
 * GM-16 (the GPU menus plan, row GM-16; GM.R5, GM.R6, GM.R11; the parity contract, research 380 §1; research 380 §5):
 * the guard -- a PRODUCT-TRACK browser instrument with no original. It compares a frame the GPU drew with the frame the
 * software drew from the same draw list, and decides no pixel of either: the software is the reference, held to the
 * original elsewhere (research 380 §2), and the GPU frame is `GpuUiPresenter`'s.
 *
 * - **The exact class through the plan's mask** (`uiGpuExactMask`): the pixels the f32 twin claims equal to the
 *   software's (E/E\*, `uiGpuTwin.ts`'s rules: a clear puts every pixel in; an untextured quad of f32-exact channels --
 *   on `ff`, an alpha byte of 0 or 128 or a code -- keeps each pixel's class, or puts it in where it overwrites it
 *   wholly; a textured quad and a model triangle's box take their pixels out; a movie picture leaves the class as it
 *   was). Built from the plan's rectangles, with no arithmetic of the twin's, and held equal to the twin's own mask over
 *   GM-03's cases by `test/uiGpuGuard.test.ts`. A pixel of the class that differs is a trip (E/E\*: 0 bytes).
 * - **B** (`exactClassDiffs`): max |Δ| per channel and the pixels at |Δ| >= 1, 2, 3, over the whole frame, recorded with
 *   the context's renderer (`UNMASKED_RENDERER_WEBGL`, or the plain `RENDERER` said as such: `readUiGpuCaps`). Judged
 *   only against a bound the caller gives (`bound`): the tolerance (research 380 §1) is GM-11b's (provisional) and
 *   GM-27's (pinned) and not in the code yet, so with no bound B is recorded, never judged -- the bound is never guessed
 *   (GM.R5). A B result beyond a given bound is a trip.
 * - **Off the animation frame** (GM.R11): the caller hands over an asynchronous read-back (`UiGpuReadbackLike`, the
 *   backend's pack buffer and fence) and the reference frame; everything after -- the fence polled, the bytes mapped,
 *   the mask built, the diff -- runs in idle callbacks (`requestIdleCallback`, or a zero timeout where the browser has
 *   none), in slices of at most `UI_GPU_GUARD_SAMPLE_ADAPTATION.sliceMs`. Each slice that read or compared (never a poll)
 *   is reported to the frame ring (`UiGpuGuardProbe.guarded`), which names the frame after it as a guard frame and
 *   keeps its lost seconds out of `lostSeconds` (`./uiGpuPerf`).
 * - **Trip records** (`UiGpuGuardRecord`): every compare is recorded (the last `keep` kept), each trip with its reason;
 *   what a trip does -- escalate the surface to `exact`, or end its GPU path -- is the surface's (`./uiGpuPresenter`).
 * - **GM-14c: the reference rastered** (`UiGpuGuardJob.raster`; GM.R11, risk 17). Under `on` the page shows the GPU's
 *   frame and no software frame at the shown scale exists, so the surface hands over a raster instead of a frame: once
 *   the read-back's bytes are mapped, the next idle callback runs it -- the shown scale's software frame
 *   (`rasterizeUiDrawList`, about 106 ms p50 at 4x on either leg, the Log 2026-11-04T08:30Z, D2), one indivisible step
 *   in a callback of its own, past `sliceMs` and the browser's deadline -- and reports its ms to the frame ring like any
 *   slice, so the frame it delays is a guard frame, listed and kept out of `lostSeconds` (`./uiGpuPerf`). The compare
 *   after it is sliced as ever. A raster may answer a skip instead (an HD image the frame used no longer resident):
 *   recorded as skipped, with why, never a trip. In shadow the reference stays the shown frame (`reference`).
 */

/**
 * UI_GPU_GUARD_SAMPLE_ADAPTATION: no original; bounds the browser's guard work (GM.R11). One compare in flight at a
 * time; a new one begins at least `gapMs` after the last ended, for a frame whose plan hash differs from the last
 * compared, or for the same frame once `repeatMs` have passed since its compare began (a movie frame's pictures are not
 * in the hash); each idle slice works at most `sliceMs` (and never past the browser's own idle deadline), comparing
 * `rows` frame rows a step; the last `keep` records are kept. Start values with no measurement under them: the GPU leg
 * and GM-16b's dev shadow period record what they cost.
 */
export const UI_GPU_GUARD_SAMPLE_ADAPTATION = Object.freeze({ gapMs: 1000, repeatMs: 10_000, sliceMs: 8, rows: 16, keep: 64 } as const);

/**
 * UI_GPU_GUARD_TRIP_ADAPTATION: no original; bounds the browser's answer to guard trips (GM.R5, GM.R6; the plan's
 * fallback ladder, L2/L3 "guard trip", "trip limit"). The first trip escalates the surface to `exact` for the session;
 * a trip on a frame already drawn at `exact`, or the `killAt`-th trip of the session, ends the surface's GPU path for the
 * session (the switch's session kill, `guard-trip`: today's path). The bound itself is never widened (GM.R5).
 */
export const UI_GPU_GUARD_TRIP_ADAPTATION = Object.freeze({ killAt: 2 } as const);

/** A B bound (research 380 §1's B statistics): per channel max |Δ|, and pixels at |Δ| >= 1, 2, 3, per frame. */
export interface UiGpuGuardBound { readonly maxAbs: readonly [number, number, number, number]; readonly atLeast: readonly [number, number, number] }

/** A frame's guard statistics: the exact class's pixels and those of them that differ, and B over the whole frame. */
export interface UiGpuGuardStats {
  pixels: number;
  /** Pixels with any channel differing. */
  differing: number;
  maxAbs: [number, number, number, number];
  /** Pixels whose largest channel |Δ| is at least 1, 2, 3. */
  atLeast: [number, number, number];
  exactPixels: number;
  exactDiffering: number;
  /** The first differing byte (row order): where, the GPU's and the software's values, and whether in the class. */
  first: { x: number; y: number; channel: number; gpu: number; software: number; exact: boolean } | null;
}

/** An f32-exact integer channel, or a non-finite one carried by its code (P23): the exact class's colour (the twin's rule). */
const exactChannel = (v: number, code: number): boolean => code !== 0 || (Number.isInteger(v) && Math.fround(v) === v);

/**
 * The exact class of a plan's frame, one byte a pixel (1 in it), from the plan's steps in order -- the twin's rules
 * (`uiGpuTwin.ts`, "The exact class"), by rectangle. A plan the software draws (L1) is all in the class.
 */
export function uiGpuExactMask(plan: UiFramePlan): Uint8Array {
  const { width: W, height: H } = plan.target;
  const mask = new Uint8Array(W * H).fill(1);
  if (plan.verdict === 'software') return mask;
  const fill = (xs: number, ys: number, xe: number, ye: number, v: 0 | 1): void => {
    for (let y = ys; y < ye; y++) mask.fill(v, y * W + xs, y * W + xe);
  };
  for (const step of plan.steps) {
    if (step.kind === 'clear') { mask.fill(1); continue; }
    if (step.kind === 'triangles') {
      for (const i of step.triangles) { const b = plan.triangles[i]!.box; if (b.xe > b.xs) fill(b.xs, b.ys, b.xe, b.ye, 0); }
      continue;
    }
    if (step.kind !== 'quads') continue;           // a movie's RGB copy, a pass, a batch copy: the class as it was
    for (const i of step.quads) {
      const q = plan.quads[i]!;
      const { xs, ys, xe, ye } = q.rect;
      if (xe <= xs || ye <= ys) continue;
      const inClass = q.texture === null && q.codes.every((c, k) => exactChannel(q.colour[k]!, c))
        && (q.path === 'prog' || q.codes[3] !== 0 || q.colour[3] === 0 || q.colour[3] === 128);
      const overwrites = inClass && q.blend !== 'additive' && q.zeroMask === 0 && q.codes[3] === 0 && q.colour[3] === 128;
      if (!inClass) fill(xs, ys, xe, ye, 0);
      else if (overwrites) fill(xs, ys, xe, ye, 1);
    }
  }
  return mask;
}

/** The guard's statistics over rows `[y0, y1)`, added into `s` (a step of `UiGpuDiff`, and the whole of `exactClassDiffs`). */
function diffRows(gpu: Rgba, software: Rgba, mask: Uint8Array, s: UiGpuGuardStats, y0: number, y1: number): void {
  const a = gpu.data, b = software.data, W = gpu.width;
  for (let p = y0 * W, end = y1 * W, i = p * 4; p < end; p++, i += 4) {
    const inClass = mask[p] === 1;
    if (inClass) s.exactPixels++;
    let m = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[i + c]! - b[i + c]!);
      if (d === 0) continue;
      if (d > s.maxAbs[c]!) s.maxAbs[c] = d;
      if (d > m) m = d;
      if (!s.first) s.first = { x: p % W, y: Math.floor(p / W), channel: c, gpu: a[i + c]!, software: b[i + c]!, exact: inClass };
    }
    if (m === 0) continue;
    s.differing++;
    s.atLeast[0]++;
    if (m >= 2) s.atLeast[1]++;
    if (m >= 3) s.atLeast[2]++;
    if (inClass) s.exactDiffering++;
  }
}

const emptyStats = (pixels: number): UiGpuGuardStats => ({ pixels, differing: 0, maxAbs: [0, 0, 0, 0], atLeast: [0, 0, 0], exactPixels: 0, exactDiffering: 0, first: null });

const sameSize = (a: Rgba, b: Rgba, mask: Uint8Array): boolean =>
  a.width === b.width && a.height === b.height && a.data.length === b.data.length && a.data.length === a.width * a.height * 4 && mask.length === a.width * a.height;

/** The exact class's differing pixels and the B statistics of `gpu` against `software`, through `mask` (one pass). */
export function exactClassDiffs(gpu: Rgba, software: Rgba, mask: Uint8Array): UiGpuGuardStats {
  if (!sameSize(gpu, software, mask)) throw new Error(`exactClassDiffs: frames ${gpu.width}x${gpu.height} and ${software.width}x${software.height}, mask ${mask.length}`);
  const s = emptyStats(gpu.width * gpu.height);
  diffRows(gpu, software, mask, s, 0, gpu.height);
  return s;
}

/** Why `stats` is beyond `bound` (empty when within): each channel's max |Δ|, each count. */
export function boundExcess(stats: Pick<UiGpuGuardStats, 'maxAbs' | 'atLeast'>, bound: UiGpuGuardBound): string[] {
  const out: string[] = [];
  'RGBA'.split('').forEach((ch, i) => { if (stats.maxAbs[i]! > bound.maxAbs[i]!) out.push(`max |Δ| ${ch} ${stats.maxAbs[i]} > ${bound.maxAbs[i]}`); });
  stats.atLeast.forEach((v, i) => { if (v > bound.atLeast[i]!) out.push(`pixels at |Δ| >= ${i + 1}: ${v} > ${bound.atLeast[i]}`); });
  return out;
}

/** An asynchronous read-back of a drawn frame (`UiGpuBackend.beginReadback`): polled, never waited on. */
export interface UiGpuReadbackLike {
  /** The frame once the GPU has it (top row first, as the frame target holds it); `pending` before; `lost` with the context. */
  poll(): Rgba | 'pending' | 'lost';
  cancel(): void;
}

/** An idle callback's deadline (`IdleDeadline`). */
export interface UiGpuIdleDeadline { timeRemaining(): number }
/** Runs `fn` when the page is idle (`requestIdleCallback`), never inside an animation frame's callback. */
export type UiGpuIdle = (fn: (deadline: UiGpuIdleDeadline) => void) => void;

/**
 * The page's idle scheduler: `requestIdleCallback` where the browser has it; elsewhere a zero timeout (a task of its
 * own, after the frame) with a deadline of one slice.
 */
export function uiGpuIdle(win: { requestIdleCallback?: (fn: (d: UiGpuIdleDeadline) => void) => unknown; setTimeout?: (fn: () => void, ms: number) => unknown } = globalThis as never): UiGpuIdle {
  if (typeof win.requestIdleCallback === 'function') return (fn) => { win.requestIdleCallback!(fn); };
  return (fn) => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const at = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    win.setTimeout!(() => fn({ timeRemaining: () => Math.max(0, UI_GPU_GUARD_SAMPLE_ADAPTATION.sliceMs - (at() - start)) }), 0);
  };
}

/** What the guard tells the frame ring (`./uiGpuPerf` `UiPerfProbe.guarded`): the ms of one idle slice that read or compared. */
export interface UiGpuGuardProbe { guarded?(ms: number): void }

/**
 * GM-14c: a reference raster's answer -- the frame (with a note the record carries in `why`, e.g. a test's plant), or why
 * the compare is skipped (recorded, never a trip).
 */
export type UiGpuGuardReference = Rgba | { frame: Rgba; note: string } | { skip: string };
/** GM-14c: the shown scale's software frame, rastered in an idle callback of its own (`UiGpuGuardJob.raster`). */
export type UiGpuGuardRaster = () => UiGpuGuardReference;

/** One compare, as recorded. */
export interface UiGpuGuardRecord {
  /** When its frame was drawn (the surface's clock). */
  at: number;
  surface: UiGpuSurface;
  /** The plan's hash, scale, blend (the blend table's value it was drawn at) and frame mode. */
  hash: string;
  scale: number;
  blend: UiPlanBlendMode;
  transparent: boolean;
  /** `UNMASKED_RENDERER_WEBGL` (or the plain `RENDERER`, or none: `rendererSource` says which). */
  renderer: string | null;
  rendererSource: NonNullable<UiGpuCaps['rendererSource']> | 'unknown';
  stats: UiGpuGuardStats;
  /** The bound B was judged against; null: none pinned, B recorded only. */
  bound: UiGpuGuardBound | null;
  /** `exact`: a pixel of the exact class differs; `bound`: B beyond the bound; null: within (or skipped). */
  trip: 'exact' | 'bound' | null;
  why: string[];
  /** The idle time the compare took, and in how many slices. */
  idleMs: number;
  slices: number;
  /** GM-14c: the reference -- the frame the page showed (`shown`, shadow) or one rastered in idle time (`raster`, `on`). */
  reference: 'shown' | 'raster';
  /** GM-14c: the raster's own idle ms (0 for a shown reference). */
  rasterMs: number;
  /** GM-14c: why the compare was skipped (its stats empty, no trip); null when it ran. */
  skipped: string | null;
}

export interface UiGpuGuardOptions {
  surface: UiGpuSurface;
  now: () => number;
  idle: UiGpuIdle;
  /** The live context's capabilities (its renderer), read at each record (a restore may bring another). */
  caps: () => Pick<UiGpuCaps, 'renderer' | 'rendererSource'> | null;
  /** The pinned B bound; absent or null: B recorded, not judged. */
  bound?: UiGpuGuardBound | null;
  /** Overrides of `UI_GPU_GUARD_SAMPLE_ADAPTATION` (a test's). */
  sample?: Partial<typeof UI_GPU_GUARD_SAMPLE_ADAPTATION>;
  /** A transparent frame's read-back divided back to straight RGB before the compare (P22; the presenter's divide). */
  divide?: (data: Uint8ClampedArray) => void;
  /** Each record, as it is made. */
  onRecord?: (record: UiGpuGuardRecord) => void;
  /** Each trip, with the session's trip count so far. */
  onTrip?: (record: UiGpuGuardRecord, trips: number) => void;
}

/**
 * One compare handed to the guard: the read-back, the reference -- the shown frame (`reference`, shadow) or, GM-14c, a
 * raster run in an idle callback of its own (`raster`, `on`) -- the plan, the frame ring's probe.
 */
export type UiGpuGuardJob = { readback: UiGpuReadbackLike; plan: UiFramePlan; probe?: UiGpuGuardProbe | null; at?: number }
  & ({ reference: Rgba; raster?: undefined } | { raster: UiGpuGuardRaster; reference?: undefined });

/**
 * The guard's counts: compares begun, finished, read-backs lost with the context, references of another size, cancelled,
 * GM-14c's skipped (a raster's answer), idle ms.
 */
export interface UiGpuGuardCounts { sampled: number; compared: number; lost: number; mismatched: number; cancelled: number; skipped: number; idleMs: number }

interface Running {
  readback: UiGpuReadbackLike; plan: UiFramePlan; probe: UiGpuGuardProbe | null; raster: UiGpuGuardRaster | null;
  reference: Rgba | null; gpu: Rgba | null; mask: Uint8Array | null; stats: UiGpuGuardStats | null; row: number; idleMs: number; slices: number; at: number;
  rasterMs: number;
  note: string | null;
}

const fits = (a: Rgba, b: Rgba): boolean => a.width === b.width && a.height === b.height && a.data.length === b.data.length;

/** The guard of one surface (see the module's comment). */
export class UiGpuGuard {
  private readonly sample: typeof UI_GPU_GUARD_SAMPLE_ADAPTATION;
  private job: Running | null = null;
  private scheduled = false;
  private lastHash: string | null = null;
  private lastBegin = -Infinity;
  private lastEnd = -Infinity;
  private kept: UiGpuGuardRecord[] = [];
  private tripped: UiGpuGuardRecord[] = [];
  private readonly n: UiGpuGuardCounts = { sampled: 0, compared: 0, lost: 0, mismatched: 0, cancelled: 0, skipped: 0, idleMs: 0 };

  constructor(private readonly o: UiGpuGuardOptions) {
    this.sample = { ...UI_GPU_GUARD_SAMPLE_ADAPTATION, ...o.sample };
  }

  /** The last records kept (oldest first), and every trip of the session. */
  get records(): readonly UiGpuGuardRecord[] { return this.kept; }
  get trips(): readonly UiGpuGuardRecord[] { return this.tripped; }
  get counts(): Readonly<UiGpuGuardCounts> { return { ...this.n }; }
  /** A compare is in flight. */
  get busy(): boolean { return this.job !== null; }

  /** Whether the frame of plan hash `hash`, drawn at `now`, is to be compared (`UI_GPU_GUARD_SAMPLE_ADAPTATION`). */
  wants(now: number, hash: string): boolean {
    if (this.job) return false;
    if (now - this.lastEnd < this.sample.gapMs) return false;
    return hash !== this.lastHash || now - this.lastBegin >= this.sample.repeatMs;
  }

  /** A compare begun: nothing of it runs now -- the idle callbacks do it. */
  submit(job: UiGpuGuardJob): void {
    if (this.job) { job.readback.cancel(); return; }
    const at = job.at ?? this.o.now();
    this.job = {
      readback: job.readback, plan: job.plan, probe: job.probe ?? null, raster: job.raster ?? null, reference: job.reference ?? null,
      gpu: null, mask: null, stats: null, row: 0, idleMs: 0, slices: 0, at, rasterMs: 0, note: null,
    };
    this.lastHash = job.plan.hash;
    this.lastBegin = at;
    this.n.sampled++;
    this.schedule();
  }

  /** The compare in flight dropped (a loss, the surface let go); its read-back let go. */
  cancel(): void {
    if (!this.job) return;
    this.job.readback.cancel();
    this.job = null;
    this.n.cancelled++;
    this.lastEnd = this.o.now();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.o.idle((d) => { this.scheduled = false; this.pump(d); });
  }

  /**
   * One idle slice: the fence polled; once the bytes are there, mapped and masked; GM-14c: a reference to raster is
   * rastered in the next slice, alone; then compared, a few rows at a time.
   */
  private pump(deadline: UiGpuIdleDeadline): void {
    const job = this.job;
    if (!job) return;
    const t0 = this.o.now();
    if (!job.gpu) {
      const got = job.readback.poll();
      if (got === 'pending') { this.schedule(); return; }                 // a poll is no compare: no frame is marked for it
      if (got === 'lost') { this.job = null; this.n.lost++; this.lastEnd = t0; return; }
      const ref = job.reference;
      if (got.data.length !== got.width * got.height * 4 || (ref && !fits(got, ref))) {
        this.job = null; this.n.mismatched++; this.lastEnd = t0; return;     // the reference is not this frame's size: nothing to compare
      }
      if (job.plan.target.transparent) this.o.divide?.(got.data);
      job.gpu = got;
      job.mask = uiGpuExactMask(job.plan);
      job.stats = emptyStats(got.width * got.height);
      if (!ref) { this.slice(job, t0); this.schedule(); return; }        // GM-14c: the raster gets an idle callback of its own
    }
    if (!job.reference) {
      // GM-14c: the shown scale's software frame, in one step (GM.R11): its ms marks the next frame a guard frame.
      const r = job.raster!();
      job.rasterMs = this.o.now() - t0;
      this.slice(job, t0);
      if ('skip' in r) { this.skip(job, r.skip); return; }
      const frame = 'frame' in r ? r.frame : r;
      if ('note' in r) job.note = r.note;
      if (!fits(job.gpu, frame)) { this.job = null; this.n.mismatched++; this.lastEnd = this.o.now(); return; }
      job.reference = frame;
      this.schedule();
      return;
    }
    const budget = Math.max(0, Math.min(this.sample.sliceMs, deadline.timeRemaining()));
    const H = job.gpu.height;
    do {
      const y1 = Math.min(H, job.row + this.sample.rows);
      diffRows(job.gpu, job.reference, job.mask!, job.stats!, job.row, y1);
      job.row = y1;
    } while (job.row < H && this.o.now() - t0 < budget);
    this.slice(job, t0);
    if (job.row < H) { this.schedule(); return; }
    this.finish(job);
  }

  /** A slice that worked (never a poll): its ms counted and told to the frame ring (`UiGpuGuardProbe.guarded`). */
  private slice(job: Running, t0: number): void {
    const ms = this.o.now() - t0;
    job.idleMs += ms; job.slices++; this.n.idleMs += ms;
    job.probe?.guarded?.(ms);
  }

  /** GM-14c: a compare skipped (the raster's answer): recorded with why, its stats empty, never a trip. */
  private skip(job: Running, why: string): void {
    this.job = null;
    this.lastEnd = this.o.now();
    this.n.skipped++;
    this.keep(this.recordOf(job, emptyStats(job.gpu ? job.gpu.width * job.gpu.height : 0), null, null, [why], why));
  }

  private recordOf(job: Running, stats: UiGpuGuardStats, bound: UiGpuGuardBound | null, trip: UiGpuGuardRecord['trip'], why: string[], skipped: string | null): UiGpuGuardRecord {
    const caps = this.o.caps();
    return {
      at: job.at, surface: this.o.surface, hash: job.plan.hash, scale: job.plan.target.scale, blend: job.plan.blend,
      transparent: job.plan.target.transparent, renderer: caps?.renderer ?? null, rendererSource: caps?.rendererSource ?? 'unknown',
      stats, bound, trip, why, idleMs: job.idleMs, slices: job.slices,
      reference: job.raster ? 'raster' : 'shown', rasterMs: job.rasterMs, skipped,
    };
  }

  private keep(record: UiGpuGuardRecord): void {
    this.kept.push(record);
    if (this.kept.length > this.sample.keep) this.kept.splice(0, this.kept.length - this.sample.keep);
    this.o.onRecord?.(record);
  }

  private finish(job: Running): void {
    this.job = null;
    this.lastEnd = this.o.now();
    this.n.compared++;
    const stats = job.stats!, bound = this.o.bound ?? null;
    const why: string[] = [];
    if (stats.exactDiffering > 0) why.push(`E/E*: ${stats.exactDiffering} pixels of the exact class differ`);
    const over = bound ? boundExcess(stats, bound) : [];
    why.push(...over.map((e) => `B: ${e}`));
    if (job.note) why.push(job.note);                                    // GM-14c: the reference's own note (a plant)
    const trip = stats.exactDiffering > 0 ? 'exact' : over.length ? 'bound' : null;
    const record = this.recordOf(job, stats, bound, trip, why, null);
    this.keep(record);
    if (trip) {
      this.tripped.push(record);
      this.o.onTrip?.(record, this.tripped.length);
    }
  }
}
