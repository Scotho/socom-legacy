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
  /** The panic: this many frames in a row over the panic's frame time (`panicShare`) drop two steps at once, inside the 2 s gap. */
  panicFrames: number;
  /**
   * The panic's frame time, as a multiple of the frame time aimed at (`targetMs`, or `setTarget`'s). AQ-8: **2.5** --
   * between a frame of two refresh intervals (one refresh missed: not a panic) and a frame of three (a panic). So
   * 41.75 ms at 16.7 and 83.25 ms under a 30 fps cap's 33.3; every figure in the tests and the spec is this multiple.
   * It was a fixed 33 ms, which one missed refresh at 60 Hz (33.3 ms) crossed.
   */
  panicShare: number;
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
  /**
   * AQ-8, the side test's bar: the frame time at the cap, read after the floor, must be more than the floor's by this
   * share of the cap's (the floor at least this share under it), or fewer pixels bought nothing (`AdaptiveRatio`'s class
   * comment).
   */
  sideGain: number;
  /**
   * AQ-8: no longer read (fold 4, 2026-11-11). It was the share of the cap down to which the ORDINARY steps of a descent
   * read the frame time the trade was judged against; a descent starts because frames are slow, so that reading was biased
   * high, and every descent now has the cap read after the floor instead. Kept in the options while their pin names it.
   */
  sideRefShare: number;
  /**
   * AQ-8: after 'not-pixels' no step down is taken until this long, ms, has passed since the verdict; then the next step
   * down (ordinary or a panic's) opens the test again. Each further 'not-pixels' doubles the wait, to `sideRetryMaxMs`.
   */
  sideRetryMs: number;
  sideRetryMaxMs: number;
  /**
   * AQ-8: how long, ms, the floor and then the cap are read before either is judged; the lowest median in the window is
   * that place's frame time, so a burst that falls on the moment of the check is not the page's rate there.
   */
  sideWindowMs: number;
}

/** The spec §4.4 item 4's values (VS-3; AQ-8's panic edge and side test; a browser adaptation, no original). */
export const ADAPTIVE_V2_ADAPTATION: Readonly<AdaptiveOptions> = {
  targetMs: 16.7, ewma: 0.2, settleFrames: 8, stepShare: 0.05, floorShare: 0.5, panicFrames: 6, panicShare: 2.5,
  downShare: 1.44, improveEveryMs: 4000, climbSlack: 0.01, improveMaxMs: 64000, bounceWindowMs: 10000, holdResetMs: 30000,
  sideGain: 0.15, sideRefShare: 0.8, sideRetryMs: 60000, sideRetryMaxMs: 480000, sideWindowMs: 2000,
};

/** AQ-8: what the side test has found of a match's trade (`AdaptiveRatio.bound`). */
export type RatioBound = 'unknown' | 'pixels' | 'not-pixels';

/** AQ-8: the frames whose median is the side test's "frame time now" (the smoothing lags a panic's six; one long frame is not the page's rate). */
const RECENT_FRAMES = 8;

/** A ratio this close to a grid line, the floor or the cap is on it (the steps' float sums). */
const GRID_EPSILON = 1e-9;

/**
 * Trades pixels for frames (`main.ts` `adapt`, PAR-12; VS-3's hysteresis, as the review amended it): the frame time is
 * smoothed every frame; a smoothed time over 1.44 x the target (24 ms at 60 fps) for 8 frames in a row steps the ratio
 * down one step (5 % of the cap), at most once every 2 s; 6 frames in a row over the panic time (2.5 x the target,
 * 41.75 ms at 60 fps: between a two-refresh frame and a three-refresh one) drop it two steps at once, without the 2 s wait; 4 s of smoothed frames at or under the target climb it one step, a wait
 * that doubles (to 64 s) when a step down follows a climb within 10 s and is reset by a climb that holds 30 s. The ratio
 * stays between half the cap and the cap. Never while the page holds it (a map arriving, the PS2 presentation, the
 * loading screen's hold): the hold also restarts the counts. Checked on a 200 ms tick, the panic on every frame.
 *
 * CPS-4a (CPS.R7, a browser adaptation): the cap moves with the page's render scale and the canvas's size
 * (`./videoSettings` `renderCapFor` / `renderCapForV2`, `setCap`); the trade runs under it, its steps and floor shares of
 * the cap now.
 *
 * AQ-8 (the Automatic quality plan's D1, 2026-11-11; a browser adaptation, no original): **the side test**. The panic's
 * edge was 33 ms, which one missed refresh at 60 Hz (33.3 ms) crossed, so a page holding 30 to 40 fps for any reason was
 * at half the cap inside two seconds and stayed (the field: 93 of 98 bad matches ended at the floor). Now a trade that
 * has gone from the cap to the floor without a climb is judged there, once it has settled: the frame time at the floor
 * against the frame time at the cap, read AFTER the floor -- the ratio returns to the cap in one change ('not-pixels'
 * meanwhile) and no step down is taken while the cap is read. A place's frame time is always the LOWEST median of the
 * last eight frames read there over a window of `sideWindowMs` (2 s), so neither one long frame nor a burst that falls
 * on the moment of a check counts as the page's rate. The cap slower than the floor by `sideGain` (15 %) of it: the
 * trade stands ('pixels') and is not judged again that match -- the ordinary steps take the ratio back down and it
 * stays. Not: fewer pixels bought nothing ('not-pixels'), and the ratio stays at the cap. It is judged at the floor and
 * not on the way: under vsync a page the pixels do help shows nothing until its cost crosses a refresh. The cap is read
 * after the floor for EVERY descent (fold 4, 2026-11-11): a reading taken on the way down is taken because frames are
 * slow -- the hub's run of that day read it at a re-test's first ordinary step, inside a burst, and kept a CPU-bound
 * page at the floor for the match. After 'not-pixels' the
 * trade is not lost for the match: once `sideRetryMs` (a minute) has passed since the verdict the next step down
 * opens the test again from the cap, and each further 'not-pixels' doubles that wait (to `sideRetryMaxMs`, 8 minutes),
 * so a CPU-bound page looks at the floor ever more rarely and a page whose load has turned to the pixels gets its
 * trade back. `start` begins afresh; a cap raised by more than a step (more pixels than were judged) does too,
 * keeping a descent on its way so that it is still judged.
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
  /** AQ-8: the last `RECENT_FRAMES` frame times, ms (a ring: no allocation a frame), and how many are in it. */
  private readonly recent = new Float64Array(RECENT_FRAMES);
  private recentAt = 0;
  private recentCount = 0;
  /** AQ-8: the ring sorted, for its median (scratch: no allocation at a step). */
  private readonly sorted = new Float64Array(RECENT_FRAMES);
  /** AQ-8: the ratio left the cap and has not climbed since: the descent the floor will judge. */
  private descending = false;
  /** AQ-8: the frame time at the floor when the trade was found to buy nothing, until the cap has been checked against it. */
  private msAtFloor: number | null = null;
  /** AQ-8: when the last 'not-pixels' was found, ms, and the wait from it before a step down may open the test again (0: none yet). */
  private verdictAt = 0;
  private sideWait = 0;
  /** AQ-8: the lowest median read in the window open now (the floor's, or the cap's check), and when it opened (null: none open). */
  private sideLow: number | null = null;
  private sideSince = 0;
  /** AQ-8: the side test's finding for this match. */
  private verdict: RatioBound = 'unknown';
  /** AQ-8: a verdict was taken back: the trade is not judged again this match. */
  private sideDone = false;

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
    // AQ-8: more pixels than were judged -- by more than a step; a resize of a pixel under a ceiling is not -- begins the
    // side test afresh; a descent on its way is kept, so it is still judged.
    if (cap > this.cap * (1 + this.opts.stepShare)) this.sideReset(true);
    this.cap = cap;
  }

  /** AQ-8: what the side test has found of this match's trade: nothing yet, the pixels help, or they do not. */
  bound(): RatioBound { return this.verdict; }

  /** AQ-8: the side test begun afresh (a start; a raised cap, which keeps a descent on its way). */
  private sideReset(keepDescent = false): void {
    this.verdict = 'unknown';
    this.msAtFloor = null;
    this.sideDone = false;
    this.sideWait = 0;
    this.sideLow = null;
    if (!keepDescent) this.descending = false;
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
    this.sideReset();
    this.recentCount = 0;
    this.recentAt = 0;
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
    if (hold) { this.restart(); this.recentCount = 0; this.recentAt = 0; }
    else {
      this.recent[this.recentAt] = ms;                 // AQ-8: the last frames, for the frame time the ratio leaves the cap at
      this.recentAt = (this.recentAt + 1) % RECENT_FRAMES;
      if (this.recentCount < RECENT_FRAMES) this.recentCount++;
      this.settled++;
      this.over = ms > this.target * o.panicShare ? this.over + 1 : 0;
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

  /** The counts begun again: a hold, a change, a start (AQ-8: and the side test's window, which reads one place). */
  private restart(): void { this.settled = 0; this.over = 0; this.above = 0; this.underSince = null; this.sideLow = null; }

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
    if (this.side(now, target)) return;
    if (this.above >= o.settleFrames) this.step(now, target, -1);
    else if (this.underSince !== null && now - this.underSince >= this.climbWait) this.step(now, target, 1);
  }

  /**
   * AQ-8, the side test, on a settled tick (the class comment). True when it changed the ratio.
   * - A descent from the cap with no climb, now settled at the floor: the floor's reading is kept, the ratio returns to
   *   the cap ('not-pixels' meanwhile) and the check at the cap decides -- for every descent (fold 4).
   * - That check: the cap slower than the floor was, by the bar, turns the verdict to 'pixels' (never judged again this
   *   match) and the trade resumes at this tick; not, 'not-pixels' stands, with its wait.
   * Each is read over `sideWindowMs` first (`sideRead`): the lowest median in the window is the place's frame time.
   */
  private side(now: number, target: RatioTarget): boolean {
    const o = this.opts;
    if (this.msAtFloor !== null) {
      const capNow = this.sideRead(now);
      if (capNow === null) return false;
      const floorMs = this.msAtFloor;
      this.msAtFloor = null;
      if (capNow * (1 - o.sideGain) > floorMs) { this.verdict = 'pixels'; this.sideDone = true; }
      return false;
    }
    if (!this.descending || this.sideDone || target.pixelRatio() > this.cap * o.floorShare + GRID_EPSILON) { this.sideLow = null; return false; }
    const nowMs = this.sideRead(now);
    if (nowMs === null) return false;
    this.descending = false;
    this.verdict = 'not-pixels';
    this.msAtFloor = nowMs;
    this.verdictAt = now;
    this.sideWait = this.sideWait === 0 ? o.sideRetryMs : Math.min(o.sideRetryMaxMs, this.sideWait * 2);
    target.setPixelRatio(this.cap);
    this.lastChange = now;
    this.lastClimb = null;
    this.bouncedFrom = null;
    this.climbWait = o.improveEveryMs;
    this.restart();
    return true;
  }

  /**
   * AQ-8: one settled tick of a window's reading -- the lowest median so far, and null until the window (`sideWindowMs`
   * from its first tick) is over; then the reading, and the window is closed.
   */
  private sideRead(now: number): number | null {
    const ms = this.recentMedian();
    if (this.sideLow === null) { this.sideLow = ms; this.sideSince = now; }
    else if (ms < this.sideLow) this.sideLow = ms;
    if (now - this.sideSince < this.opts.sideWindowMs) return null;
    const low = this.sideLow;
    this.sideLow = null;
    return low;
  }

  /** AQ-8: the median of the last frames, ms (the smoothed time when none is in the ring): one long frame is not the page's rate. */
  private recentMedian(): number {
    const n = this.recentCount, s = this.sorted;
    if (n === 0) return this.smoothed;
    for (let i = 0; i < n; i++) {                      // an insertion sort of at most eight
      const v = this.recent[i]!;
      let j = i;
      while (j > 0 && s[j - 1]! > v) { s[j] = s[j - 1]!; j--; }
      s[j] = v;
    }
    return n % 2 ? s[n >> 1]! : (s[(n >> 1) - 1]! + s[n >> 1]!) / 2;
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
    if (steps < 0 && this.verdict === 'not-pixels') {
      // AQ-8: fewer pixels bought nothing -- no step down until the wait is up; then the test opens again.
      if (now - this.verdictAt < this.sideWait) return;
      this.verdict = 'unknown';
      this.msAtFloor = null;
    }
    if (steps < 0 ? !(ratio > floor + GRID_EPSILON) : !(ratio < cap - GRID_EPSILON)) return;
    if (steps > 0) this.descending = false;                                // AQ-8: a climb ends the descent the side test would judge
    else if (ratio >= cap - GRID_EPSILON) this.descending = true;          // AQ-8: leaving the cap
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
