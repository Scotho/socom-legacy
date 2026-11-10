/**
 * PAR-12 (web sprint PARITY-1, audit A.12; web research 255 s2): the pixel ratio the native picture draws at and the
 * events that resize it, as `/testroom`'s `main.ts` runs them (its `RATIO_CAP` .. `ADAPT_EVERY_MS`, `adapt`, the frame's
 * smoothing and its `resize` / `visualViewport` / `orientationchange` listeners), written once for both pages.
 *
 * **A browser adaptation**, every value here: the console drew one 640 x 448 frame on a television (`./renderer`
 * `PS2_FRAME`), so no original value stands behind a ratio, a frame-time threshold or a viewport event. They are
 * `main.ts`'s, moved unchanged, so the two pages trade pixels for frames the same way; none changes the game.
 */

/** A desktop's cap: the device's ratio, at most 2 (`main.ts` `RATIO_CAP`). */
export const PIXEL_RATIO_CAP_ADAPTATION = 2;
/** A touch device's cap: its GPU fills a screen a hand's width away (`main.ts` `RATIO_CAP`'s 1.5). */
export const TOUCH_PIXEL_RATIO_CAP_ADAPTATION = 1.5;
/** @deprecated VS-3: the floor is `ADAPTIVE_V2_ADAPTATION.floorShare` of the cap now. PAR-12's fixed floor (`main.ts` `RATIO_FLOOR`), kept for its readers. */
export const PIXEL_RATIO_FLOOR_ADAPTATION = 0.75;
/** @deprecated VS-3: a step is `ADAPTIVE_V2_ADAPTATION.stepShare` of the cap now. PAR-12's fixed step (`main.ts` `adapt`'s 0.25). */
export const PIXEL_RATIO_STEP_ADAPTATION = 0.25;
/** @deprecated VS-3: the dead band around `ADAPTIVE_V2_ADAPTATION.targetMs` decides now. PAR-12's slow frame (`main.ts` `SLOW_MS`), kept for `tools/perf`'s readers. */
export const SLOW_FRAME_MS_ADAPTATION = 24;
/** @deprecated VS-3: the dead band decides now. PAR-12's fast frame (`main.ts` `FAST_MS`). */
export const FAST_FRAME_MS_ADAPTATION = 12;
/** The least time between two changes (`main.ts` `ADAPT_EVERY_MS`); VS-3 keeps it beside the settle count (the panic alone skips it). */
export const ADAPT_EVERY_MS_ADAPTATION = 2000;
/** @deprecated VS-3: the smoothing is `ADAPTIVE_V2_ADAPTATION.ewma` from its `targetMs` now. PAR-12's (`main.ts`'s `smoothedMs`: 16.7 ms, x 0.08). */
export const FRAME_MS_START_ADAPTATION = 16.7;
export const FRAME_MS_SMOOTHING_ADAPTATION = 0.08;
/** How often the smoothed time is read and the ratio checked (`main.ts`'s readout: "redrawing text every frame is itself a cost"). */
export const RATIO_TICK_MS_ADAPTATION = 200;
/** A touch dock changes the canvas box without a browser viewport change. */
export const PICTURE_RESIZE_EVENT = 's2u-picture-resize';

/** The ratio the native picture may draw at: the device's, at most 2 on a desktop and 1.5 on a touch device. */
export function pixelRatioCap(device: number | undefined, touch: boolean): number {
  return Math.min(device || 1, touch ? TOUCH_PIXEL_RATIO_CAP_ADAPTATION : PIXEL_RATIO_CAP_ADAPTATION);
}

/** A renderer's pixel ratio (`./renderer` `ViewerRenderer`; `./matchRenderer` `ratioTargetOf`). */
export interface RatioTarget {
  setPixelRatio(ratio: number): void;
  pixelRatio(): number;
}

/**
 * VS-3 (the video settings plan, product track; the spec `docs/specs/2026-11-07-video-settings-design.md` §4.4 item 4):
 * the dynamic render scale's hysteresis. **A browser adaptation, every value**: the console drew one 640 x 448 frame at
 * a fixed rate, so no original value stands behind a frame-time target, a band, a smoothing or a step; none changes the
 * game (the simulation steps real time whatever the ratio, §3). The VS-3 review (the controller, 2026-11-07) amended §4.4
 * item 4: the ±10 % band moved a 60 Hz page on every dropped frame and never climbed at vsync, so the step down keeps
 * today's 24 ms edge (`downShare`) held 8 frames in a row, and the climb reads "at or under the target", with a back-off.
 */
export interface AdaptiveOptions {
  /** The frame time aimed at, ms: 60 fps, or the frame cap's interval (`AdaptiveRatio.setTarget`, VS-4). */
  targetMs: number;
  /** The frame time's smoothing a frame (an EWMA's weight on the newest frame). */
  ewma: number;
  /**
   * The frames before a step: drawn since the last change (or the hold's end), and, for a step down, in a row with the
   * smoothed time over the edge (one frame back under it restarts the count).
   */
  settleFrames: number;
  /** One step: this share of the cap. */
  stepShare: number;
  /** The floor: this share of the cap. */
  floorShare: number;
  /** The panic: this many frames in a row over `panicMs` drop two steps at once, inside the 2 s gap. */
  panicFrames: number;
  /** The panic's frame time at `targetMs`, ms; it scales with the target (`setTarget`). */
  panicMs: number;
  /** The step down's edge: this share of the target (1.44 x 16.7 = 24.05 ms, today's `SLOW_FRAME_MS_ADAPTATION`). */
  downShare: number;
  /** The climb: one step up after this long, ms, with the smoothed frame at or under the target and the ratio under the cap. */
  improveEveryMs: number;
  /**
   * "At or under the target", with this share over it for the frame clock: a frame cap's frames are whole vsync
   * intervals (30 fps on a 60 Hz screen: 33.33 ms against a 33.3 target), and a smoothed time falling to the target
   * comes at it from above and never reaches it exactly.
   */
  climbSlack: number;
  /** The climb's longest wait, ms, its back-off doubling held here. */
  improveMaxMs: number;
  /** A step down this soon after a climb, ms, is a bounce: the next climb's wait doubles. */
  bounceWindowMs: number;
  /**
   * A climb with no step down for this long, ms, resets the climb's wait to `improveEveryMs` -- once it has regained the
   * ratio the last bounce fell from (a climb short of it is not yet the ratio that failed, and holds by being lower).
   */
  holdResetMs: number;
}

/** The spec §4.4 item 4's values (VS-3; a browser adaptation, no original). */
export const ADAPTIVE_V2_ADAPTATION: Readonly<AdaptiveOptions> = {
  targetMs: 16.7, ewma: 0.2, settleFrames: 8, stepShare: 0.05, floorShare: 0.5, panicFrames: 6, panicMs: 33,
  downShare: 1.44, improveEveryMs: 4000, climbSlack: 0.01, improveMaxMs: 64000, bounceWindowMs: 10000, holdResetMs: 30000,
};

/** A ratio this close to a grid line, the floor or the cap is on it (the steps' float sums). */
const GRID_EPSILON = 1e-9;

/**
 * Trades pixels for frames (`main.ts` `adapt`, PAR-12; VS-3's hysteresis, as the review amended it): the frame time is
 * smoothed every frame; a smoothed time over 1.44 x the target (24 ms at 60 fps) for 8 frames in a row steps the ratio
 * down one step (5 % of the cap), at most once every 2 s; 6 frames in a row over the panic time (33 ms at 60 fps) drop
 * it two steps at once, without the 2 s wait; 4 s of smoothed frames at or under the target climb it one step, a wait
 * that doubles (to 64 s) when a step down follows a climb within 10 s and is reset by a climb that holds 30 s. The ratio
 * stays between half the cap and the cap. Never while the page holds it (a map arriving, the PS2 presentation, the
 * loading screen's hold): the hold also restarts the counts. Checked on a 200 ms tick, the panic on every frame.
 *
 * CPS-4a (CPS.R7, a browser adaptation): the cap moves with the page's render scale and the canvas's size
 * (`./videoSettings` `renderCapFor` / `renderCapForV2`, `setCap`); the trade runs under it, its steps and floor shares of
 * the cap now.
 */
export class AdaptiveRatio {
  private readonly opts: Readonly<AdaptiveOptions>;
  private target: number;
  private smoothed: number;
  private lastTick = 0;
  private lastChange = 0;
  /** Frames drawn since the last change or the hold. */
  private settled = 0;
  /** Frames in a row over the panic time. */
  private over = 0;
  /** Frames in a row with the smoothed time over the step down's edge. */
  private above = 0;
  /** When the smoothed frame came to or under the target (null: it is over it). */
  private underSince: number | null = null;
  /** The climb's wait now, ms (`improveEveryMs`, doubled by a bounce). */
  private climbWait: number;
  /** When the last climb was, while it has not been undone or held its `holdResetMs` (null: none). */
  private lastClimb: number | null = null;
  /** The ratio the last climb reached. */
  private climbedTo = 0;
  /**
   * The ratio a bounce (a step down soon after a climb) fell from, until a held climb regains it (null: none); read under
   * the cap, so a cap lowered since (`setCap`) is regained at the cap.
   */
  private bouncedFrom: number | null = null;
  /** The cap before a `setCap` the next tick has not met yet (null: none pending). */
  private capWas: number | null = null;

  constructor(private cap: number, opts: Readonly<AdaptiveOptions> = ADAPTIVE_V2_ADAPTATION) {
    this.opts = opts;
    this.target = opts.targetMs;
    this.smoothed = opts.targetMs;
    this.climbWait = opts.improveEveryMs;
  }

  /** The ceiling the ratio is held under now. */
  ratioCap(): number { return this.cap; }

  /**
   * CPS-4a: a new ceiling, met at the next 200 ms tick, held page or not (it is a ceiling, not a trade): a ratio above
   * it comes down to it; a ratio standing at the old cap (the frames had not lowered it) follows a raised one up, as
   * `start` puts it there; one the frames had lowered climbs back by the steps. Not a positive number: ignored.
   */
  setCap(cap: number): void {
    if (!(cap > 0) || cap === this.cap) return;
    if (this.capWas === null) this.capWas = this.cap;
    this.cap = cap;
  }

  /**
   * VS-3: the frame time aimed at, ms -- VS-4's frame cap: its interval (`1000 / cap`); 0, the cap Off: the default
   * `targetMs` (16.7) back. Anything else not a finite positive number (NaN, a negative, Infinity): ignored.
   */
  setTarget(ms: number): void {
    if (ms === 0) this.target = this.opts.targetMs;
    else if (ms > 0 && Number.isFinite(ms)) this.target = ms;
  }

  /** The smoothed frame time, ms (`main.ts`'s frame counter reads it). */
  smoothedMs(): number { return this.smoothed; }

  /** The renderer at the cap (`main.ts`: `created.setPixelRatio(RATIO_CAP)` once the renderer is up). */
  start(target: RatioTarget): void {
    this.capWas = null;
    this.restart();
    target.setPixelRatio(this.cap);
  }

  /**
   * One frame of `dt` seconds at `now` ms: the smoothing and the panic's count, then on the 200 ms tick the check. True
   * on the tick (`main.ts` redraws its frame counter then). No frame time (`dt` 0), no smoothing and no tick.
   */
  frame(dt: number, now: number, target: RatioTarget | null, hold: boolean): boolean {
    if (!(dt > 0)) return false;
    const ms = dt * 1000, o = this.opts;
    this.smoothed += (ms - this.smoothed) * o.ewma;
    if (hold) this.restart();
    else {
      this.settled++;
      this.over = ms > o.panicMs * (this.target / o.targetMs) ? this.over + 1 : 0;
      this.above = this.smoothed > this.target * o.downShare ? this.above + 1 : 0;
      if (this.smoothed <= this.target * (1 + o.climbSlack)) this.underSince ??= now;
      else this.underSince = null;
      if (target && this.over >= o.panicFrames && this.settled >= o.settleFrames) this.step(now, target, -2);
    }
    if (now - this.lastTick <= RATIO_TICK_MS_ADAPTATION) return false;
    this.lastTick = now;
    if (target && !this.meetCap(now, target)) this.adapt(now, target, hold);
    return true;
  }

  /** The counts begun again: a hold, a change, a start. */
  private restart(): void { this.settled = 0; this.over = 0; this.above = 0; this.underSince = null; }

  /** CPS-4a: the ratio put under a moved cap (`setCap`); true when it changed it (the trade waits its 2 s from here). */
  private meetCap(now: number, target: RatioTarget): boolean {
    const was = this.capWas, ratio = target.pixelRatio();
    this.capWas = null;
    if (!(ratio > this.cap) && !(was !== null && ratio < this.cap && ratio >= was)) return false;
    target.setPixelRatio(this.cap);
    this.lastChange = now;
    this.restart();
    return true;
  }

  private adapt(now: number, target: RatioTarget, hold: boolean): void {
    const o = this.opts;
    if (this.lastClimb !== null && now - this.lastClimb >= o.holdResetMs) {
      if (this.bouncedFrom === null || this.climbedTo >= Math.min(this.bouncedFrom, this.cap) - GRID_EPSILON) { this.climbWait = o.improveEveryMs; this.bouncedFrom = null; }
      this.lastClimb = null;
    }
    if (hold || now - this.lastChange < ADAPT_EVERY_MS_ADAPTATION || this.settled < o.settleFrames) return;
    if (this.above >= o.settleFrames) this.step(now, target, -1);
    else if (this.underSince !== null && now - this.underSince >= this.climbWait) this.step(now, target, 1);
  }

  /**
   * `steps` steps of `stepShare` x cap on the cap's grid (cap - k x step), held between `floorShare` x cap and the cap;
   * a ratio off the grid (a cap moved under it) goes to the next line in the step's direction. Down never raises a
   * ratio already at or under the floor; up never lowers one above the cap. A step down within `bounceWindowMs` of a
   * climb doubles the climb's wait (at most `improveMaxMs`) and records the ratio it fell from; a climb is remembered
   * for that and for the reset.
   */
  private step(now: number, target: RatioTarget, steps: number): void {
    const ratio = target.pixelRatio(), cap = this.cap, size = cap * this.opts.stepShare, floor = cap * this.opts.floorShare;
    if (steps < 0 ? !(ratio > floor + GRID_EPSILON) : !(ratio < cap - GRID_EPSILON)) return;
    const n = (cap - ratio) / size;
    const k = steps < 0 ? Math.floor(n + GRID_EPSILON) - steps : Math.ceil(n - GRID_EPSILON) - steps;
    let next = cap - Math.max(0, k) * size;
    if (next < floor + GRID_EPSILON) next = floor;
    if (next > cap - GRID_EPSILON) next = cap;
    target.setPixelRatio(next);
    if (steps > 0) { this.lastClimb = now; this.climbedTo = next; }
    else {
      if (this.lastClimb !== null && now - this.lastClimb <= this.opts.bounceWindowMs) {
        this.climbWait = Math.min(this.opts.improveMaxMs, this.climbWait * 2);
        this.bouncedFrom = ratio;
      }
      this.lastClimb = null;
    }
    this.lastChange = now;
    this.restart();
  }
}

/** What `watchViewport` listens on: the page's window and its visual viewport (absent on the tests' fakes). */
export interface ViewportWindow {
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
  visualViewport?: { addEventListener(type: string, fn: EventListener): void; removeEventListener(type: string, fn: EventListener): void } | null;
}

/**
 * `fit` on every change of the canvas's size (`main.ts` 1507-1512): the window's `resize`; the visual viewport's, which
 * a phone's browser bar changes without a window resize; and the rotation. Returns the teardown, which takes all off.
 */
export function watchViewport(win: ViewportWindow, fit: () => void): () => void {
  const fn: EventListener = () => { fit(); };
  const visual = win.visualViewport ?? null;
  win.addEventListener('resize', fn);
  win.addEventListener(PICTURE_RESIZE_EVENT, fn);
  visual?.addEventListener('resize', fn);
  win.addEventListener('orientationchange', fn);
  return () => {
    win.removeEventListener('resize', fn);
    win.removeEventListener(PICTURE_RESIZE_EVENT, fn);
    visual?.removeEventListener('resize', fn);
    win.removeEventListener('orientationchange', fn);
  };
}
