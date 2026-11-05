import type { ComposeScreenProbe, UiDrawItem } from '@s2u/ui';

/**
 * GM-02 (plan 2026-11-01-gpu-menus, "Performance"; research 380 §6): the browser baseline's ring -- an instrument, a
 * browser adaptation with no original, which changes nothing the menus do or draw. Only a development build under
 * `?devmode` makes one, and only when the address asks (`?uiPerf`, or `?uiPerfHd`, below); `./frontEnd` then hands it
 * each animation frame of its loop (`begin`, `advanced`, `end`), the session's `render` its raster and present times
 * (`rendered`), and `@s2u/ui`'s `composeScreen` each call's time (`composed`, `setComposeScreenProbe`). The page's hook
 * is `window.__uiGpuPerf` (`UI_PERF_WINDOW_HOOK`); `e2e/uiGpuPerf.spec.ts` reads it. `./frontEnd` loads this module with
 * `import()` only when the ring is asked for (review F2); a release build's front end ships none of it.
 *
 * The ring's columns are fixed typed arrays written in place, so the instrument allocates nothing a frame; reading it
 * (`samples`, `summarizeUiPerf`, `dialogSwitches`) allocates and is done off the measured window. Every number it
 * gives is a rendered browser run's on the run's host and renderer -- perf, never a parity claim.
 *
 * GM-16 (GM.R11): **the guard's frames.** The GPU guard's compare (`./uiGpuGuard`) runs in idle callbacks and tells the
 * probe each slice's ms (`UiPerfProbe.guarded`); the next frame the ring writes carries them (`guardMs`) -- the frame
 * the guard's work came before -- and is a guard frame: its lost seconds are left out of every `lostSeconds` figure
 * (`summarizeUiPerf`, `dialogSwitches`) and listed by its time (`guardFrames`), never dropped silently.
 */

/** The page's hook and the address's request: `./uiPerfRequest` (`./frontEnd` reads them without loading this module). */
export { UI_PERF_WINDOW_HOOK, uiPerfRequest } from './uiPerfRequest';
/** Instrument budget, not a game value: the frames the ring keeps (about 4.5 minutes at 60 Hz). */
export const UI_PERF_RING_FRAMES = 1 << 14;
/** Instrument threshold: a dialog switch's HD answers are settled once none has arrived for this long (ms). */
export const UI_PERF_SETTLE_QUIET_MS = 1000;
/**
 * The plan's "a rAF over 33.4 ms" (GM-13b's bar): two 59.94 Hz fields, the original's UI tick
 * (`@s2u/ui` `UI_TICK_RATE`); a frame longer than this missed a tick's draw.
 */
export const UI_PERF_SLOW_FRAME_MS = 33.4;

/**
 * UI_PERF_COLD_SWITCH_ADAPTATION: no original; bounds the browser instrument's verdict on GM-02b's cold-switch target
 * (the plan's "Performance", the targets; research 380 §6.2): on the GPU leg, a cold dialog switch with HD answers at
 * 2x and 4x has no animation frame over 50.0 ms (the 1x switches' 49.9 ms rounded up, also the clock's catch-up limit,
 * `CATCHUP_LIMIT_READING`: a frame at it loses nothing) and 0.00 s lost, the lost seconds printed to two digits. The
 * plan's ruling carried as numbers, not a game value; GM-13b's 33.4 ms (`UI_PERF_SLOW_FRAME_MS`) is reported as an aim.
 */
export const UI_PERF_COLD_SWITCH_ADAPTATION = Object.freeze({ maxFrameMs: 50.0, lostSecondsDigits: 2, scales: Object.freeze([2, 4] as const) });

/** One animation frame of the front end's loop. Times in ms; `lostSeconds` is `UiClock.lostSeconds` at its end. */
export interface UiPerfSample {
  /** The frame's animation-frame time. */
  t: number;
  /** Since the last frame's `t` (NaN for the ring's first). */
  frameMs: number;
  /** The UI ticks `advance` ran. */
  ticks: number;
  /** `FrontEndSession.advance`'s wall time: every tick's work, `composeScreen` included. */
  advanceMs: number;
  /** `composeScreen`'s time within it, and its calls. */
  composeMs: number;
  composes: number;
  /** 1 when the frame was drawn (`render`), else 0. */
  drawn: number;
  /** `rasterizeUiDrawList` and `presentUiFrame` (the canvas's `putImageData`: today's upload); NaN when not drawn. */
  rasterMs: number;
  presentMs: number;
  lostSeconds: number;
  /** 1 when a drawn frame showed a movie picture other than the last drawn one. */
  newPicture: number;
  /** The menus' HD lookup's answers so far (`HdMenus.options().version`); -1 without HD. */
  hdVersion: number;
  scale: number;
  dialog: string;
  /** GM-16: the ms of the GPU guard's idle work since the last frame (0: none) -- a guard frame (GM.R11). */
  guardMs: number;
}

const COLUMNS = ['t', 'frameMs', 'ticks', 'advanceMs', 'composeMs', 'composes', 'drawn', 'rasterMs', 'presentMs', 'lostSeconds', 'newPicture', 'hdVersion', 'scale', 'dialog', 'guardMs'] as const;

/** The last `capacity` frames, column by column, oldest overwritten. */
export class UiPerfRing {
  private readonly cols: Float64Array[];
  private readonly names: string[] = [];
  private readonly ids = new Map<string, number>();
  private next = 0;
  private count = 0;
  constructor(readonly capacity = UI_PERF_RING_FRAMES) {
    this.cols = COLUMNS.map(() => new Float64Array(capacity));
  }
  get size(): number { return this.count; }
  /** The column arrays (a test's: they are made once). */
  columns(): readonly Float64Array[] { return this.cols; }
  write(t: number, frameMs: number, ticks: number, advanceMs: number, composeMs: number, composes: number, drawn: number,
    rasterMs: number, presentMs: number, lostSeconds: number, newPicture: number, hdVersion: number, scale: number, dialog: string, guardMs = 0): void {
    let id = this.ids.get(dialog);
    if (id === undefined) { id = this.names.length; this.names.push(dialog); this.ids.set(dialog, id); }
    const i = this.next, c = this.cols;
    c[0]![i] = t; c[1]![i] = frameMs; c[2]![i] = ticks; c[3]![i] = advanceMs; c[4]![i] = composeMs; c[5]![i] = composes;
    c[6]![i] = drawn; c[7]![i] = rasterMs; c[8]![i] = presentMs; c[9]![i] = lostSeconds; c[10]![i] = newPicture;
    c[11]![i] = hdVersion; c[12]![i] = scale; c[13]![i] = id; c[14]![i] = guardMs;
    this.next = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  /** The frames kept, oldest first. */
  samples(): UiPerfSample[] {
    const out: UiPerfSample[] = [];
    const start = (this.next - this.count + this.capacity) % this.capacity, c = this.cols;
    for (let k = 0; k < this.count; k++) {
      const i = (start + k) % this.capacity;
      out.push({
        t: c[0]![i]!, frameMs: c[1]![i]!, ticks: c[2]![i]!, advanceMs: c[3]![i]!, composeMs: c[4]![i]!, composes: c[5]![i]!,
        drawn: c[6]![i]!, rasterMs: c[7]![i]!, presentMs: c[8]![i]!, lostSeconds: c[9]![i]!, newPicture: c[10]![i]!,
        hdVersion: c[11]![i]!, scale: c[12]![i]!, dialog: this.names[c[13]![i]!] ?? '', guardMs: c[14]![i]!,
      });
    }
    return out;
  }
}

/** The session's half: `FrontEndSession.render` reports its raster and present times here (`./frontEnd`); GM-16 the guard its slices. */
export interface UiPerfRenderProbe { now(): number; rendered(rasterMs: number, presentMs: number): void; guarded?(ms: number): void }

/** One frame at a time, from the front end's loop; `composeScreen`'s probe too (`setComposeScreenProbe(probe)`). */
export class UiPerfProbe implements ComposeScreenProbe, UiPerfRenderProbe {
  private frameT = NaN;
  private lastT = NaN;
  private t0 = 0;
  private ticks = 0;
  private advanceMs = 0;
  private composeMs = 0;
  private composes = 0;
  private rasterMs = NaN;
  private presentMs = NaN;
  private picture: unknown = undefined;
  private guardMs = 0;
  constructor(readonly now: () => number, readonly ring = new UiPerfRing()) {}
  /** The frame starts: its animation-frame time. */
  begin(t: number): void {
    this.frameT = t; this.t0 = this.now();
    this.ticks = 0; this.advanceMs = 0; this.composeMs = 0; this.composes = 0; this.rasterMs = NaN; this.presentMs = NaN;
  }
  composed(ms: number): void { this.composeMs += ms; this.composes += 1; }
  /** `advance` returned `ticks`. */
  advanced(ticks: number): void { this.ticks = ticks; this.advanceMs = this.now() - this.t0; }
  rendered(rasterMs: number, presentMs: number): void { this.rasterMs = rasterMs; this.presentMs = presentMs; }
  /** GM-16: one idle slice of the GPU guard's work (ms); the next frame written carries it (a guard frame, GM.R11). */
  guarded(ms: number): void { this.guardMs += Math.max(0, ms); }
  /** The frame ends: the clock's lost seconds, the draw list drawn (a new movie picture in it is counted), the HD answers, the scale, the dialog. */
  end(lostSeconds: number, items: readonly UiDrawItem[] | null, hdVersion: number, scale: number, dialog: string): void {
    const drawn = Number.isNaN(this.rasterMs) ? 0 : 1;
    let newPicture = 0;
    if (drawn && items) {
      for (const it of items) {
        if (it.kind !== 'movie') continue;
        if (it.picture && it.picture !== this.picture) newPicture = 1;
        this.picture = it.picture;
        break;
      }
    }
    this.ring.write(this.frameT, this.frameT - this.lastT, this.ticks, this.advanceMs, this.composeMs, this.composes, drawn,
      this.rasterMs, this.presentMs, lostSeconds, newPicture, hdVersion, scale, dialog, this.guardMs);
    this.guardMs = 0;
    this.lastT = this.frameT;
  }
}

export interface UiPerfSpread { n: number; p50: number; p95: number; max: number }

/** Nearest-rank percentiles and the maximum of the finite values (zeros for none). */
export function spread(values: readonly number[]): UiPerfSpread {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p50: 0, p95: 0, max: 0 };
  const at = (p: number): number => v[Math.min(v.length, Math.max(1, Math.ceil(p * v.length))) - 1]!;
  return { n: v.length, p50: at(0.5), p95: at(0.95), max: v[v.length - 1]! };
}

export interface UiPerfSummary {
  frames: number;
  wallSeconds: number;
  /** `UiClock.lostSeconds` over the window, the guard's frames left out (GM.R11). */
  lostSeconds: number;
  /** GM-16: the guard's frames, by time, with their frame ms, lost seconds and guard ms; and their lost seconds' sum. */
  guardFrames: { t: number; frameMs: number; lostSeconds: number; guardMs: number }[];
  guardLostSeconds: number;
  lostSecondsPerMinute: number;
  frameMs: UiPerfSpread;
  slowFrames: number;
  ticks: number;
  ticksPerSecond: number;
  /** `composeScreen` per tick, and the rest of `advance` per tick: the shells', widgets', lobby's and clock's work. */
  composeMsPerTick: number;
  shellsMsPerTick: number;
  drawnPerSecond: number;
  rasterMs: UiPerfSpread;
  presentMs: UiPerfSpread;
  picturesPerSecond: number;
  scale: number;
}

/**
 * The frames with `t` in [from, to]. The window's first frame anchors its time -- what it ran was before the window --
 * so every count, sum and spread is of the frames after it.
 */
export function summarizeUiPerf(samples: readonly UiPerfSample[], from: number, to: number): UiPerfSummary {
  const w = samples.filter((s) => s.t >= from && s.t <= to);
  const first = w[0], last = w[w.length - 1];
  const after = w.slice(1);
  const wallSeconds = first && last ? (last.t - first.t) / 1000 : 0;
  // GM-16 (GM.R11): a guard frame's lost seconds (its own: the clock's count against the frame before it) are left out.
  const guardFrames = after.flatMap((s, k) => (s.guardMs > 0 ? [{ t: s.t, frameMs: s.frameMs, lostSeconds: s.lostSeconds - w[k]!.lostSeconds, guardMs: s.guardMs }] : []));
  const guardLostSeconds = guardFrames.reduce((a, g) => a + g.lostSeconds, 0);
  const lostSeconds = first && last ? last.lostSeconds - first.lostSeconds - guardLostSeconds : 0;
  const sum = (f: (s: UiPerfSample) => number): number => after.reduce((a, s) => a + f(s), 0);
  const ticks = sum((s) => s.ticks), compose = sum((s) => s.composeMs), advance = sum((s) => s.advanceMs);
  const drawn = after.filter((s) => s.drawn);
  const per = (n: number, d: number): number => (d > 0 ? n / d : 0);
  return {
    frames: after.length, wallSeconds, lostSeconds, lostSecondsPerMinute: per(lostSeconds * 60, wallSeconds), guardFrames, guardLostSeconds,
    frameMs: spread(after.map((s) => s.frameMs)), slowFrames: after.filter((s) => s.frameMs > UI_PERF_SLOW_FRAME_MS).length,
    ticks, ticksPerSecond: per(ticks, wallSeconds),
    composeMsPerTick: per(compose, ticks), shellsMsPerTick: per(advance - compose, ticks),
    drawnPerSecond: per(drawn.length, wallSeconds),
    rasterMs: spread(drawn.map((s) => s.rasterMs)), presentMs: spread(drawn.map((s) => s.presentMs)),
    picturesPerSecond: per(sum((s) => s.newPicture), wallSeconds),
    scale: last?.scale ?? 0,
  };
}

export interface UiPerfSwitch {
  from: string;
  to: string;
  /** The first frame on the new dialog. */
  at: number;
  /** `to` not seen before in the ring: the dialog's first draw (its bitmaps, and under HD its replacements, cold). */
  cold: boolean;
  /** From `at` to the last HD answer before the next switch (0: none arrived). */
  settleMs: number;
  hdAnswers: number;
  /** The window: from `at` to the first frame `UI_PERF_SETTLE_QUIET_MS` past the last answer, before the next switch. */
  frames: number;
  maxFrameMs: number;
  slowFrames: number;
  /** The window's lost seconds, its guard frames' left out (GM.R11); `guardFrames` how many there were. */
  lostSeconds: number;
  guardFrames: number;
  firstRasterMs: number;
  firstPresentMs: number;
  maxRasterMs: number;
}

/** Every switch of the dialog in the ring (a frame's dialog unlike the last frame's, neither empty). */
export function dialogSwitches(samples: readonly UiPerfSample[]): UiPerfSwitch[] {
  const out: UiPerfSwitch[] = [];
  const seen = new Set<string>();
  const starts: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i]!.dialog;
    if (i > 0 && d && samples[i - 1]!.dialog && d !== samples[i - 1]!.dialog) starts.push(i);
  }
  let k = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]!.dialog) {
      if (k < starts.length && starts[k] === i) {
        const end = k + 1 < starts.length ? starts[k + 1]! : samples.length;
        const before = samples[i - 1]!, s = samples[i]!;
        let j = -1;
        for (let m = i; m < end; m++) if (samples[m]!.hdVersion !== samples[m - 1]!.hdVersion) j = m;
        const settleAt = j < 0 ? s.t : samples[j]!.t;
        let stop = i;
        while (stop + 1 < end && samples[stop]!.t < settleAt + UI_PERF_SETTLE_QUIET_MS) stop++;
        const w = samples.slice(i, stop + 1);
        const finite = (xs: number[]): number[] => xs.filter(Number.isFinite);
        // GM-16 (GM.R11): each guard frame's own lost seconds (against the frame before it) left out of the switch's.
        let guardFrames = 0, guardLost = 0;
        for (let m = i; m <= stop; m++) if (samples[m]!.guardMs > 0) { guardFrames++; guardLost += samples[m]!.lostSeconds - samples[m - 1]!.lostSeconds; }
        out.push({
          from: before.dialog, to: s.dialog, at: s.t, cold: !seen.has(s.dialog),
          // Review F3: a last frame with no HD lookup (-1) counts the answers from 0.
        settleMs: settleAt - s.t, hdAnswers: j < 0 ? 0 : samples[j]!.hdVersion - Math.max(0, before.hdVersion),
          frames: w.length, maxFrameMs: Math.max(0, ...finite(w.map((x) => x.frameMs))),
          slowFrames: w.filter((x) => x.frameMs > UI_PERF_SLOW_FRAME_MS).length,
          lostSeconds: w[w.length - 1]!.lostSeconds - before.lostSeconds - guardLost, guardFrames,
          firstRasterMs: s.rasterMs, firstPresentMs: s.presentMs, maxRasterMs: Math.max(0, ...finite(w.map((x) => x.rasterMs))),
        });
        k++;
      }
      seen.add(samples[i]!.dialog);
    }
  }
  return out;
}

/**
 * GM-16: GM-02b's cold-switch target on one switch (`UI_PERF_COLD_SWITCH_ADAPTATION`): its failures (empty: met) --
 * a frame over 50.0 ms, or lost seconds that print other than 0.00 -- and whether GM-13b's aim (no frame over
 * `UI_PERF_SLOW_FRAME_MS`) was met, reported, never a failure.
 */
export function coldSwitchVerdict(sw: Pick<UiPerfSwitch, 'maxFrameMs' | 'lostSeconds'>): { failures: string[]; aim: boolean } {
  const T = UI_PERF_COLD_SWITCH_ADAPTATION, failures: string[] = [];
  if (sw.maxFrameMs > T.maxFrameMs) failures.push(`a frame of ${sw.maxFrameMs.toFixed(1)} ms, over ${T.maxFrameMs.toFixed(1)} ms`);
  const lost = sw.lostSeconds.toFixed(T.lostSecondsDigits);
  if (Number(lost) !== 0) failures.push(`${lost} s lost, not ${(0).toFixed(T.lostSecondsDigits)}`);
  return { failures, aim: sw.maxFrameMs <= UI_PERF_SLOW_FRAME_MS };
}
