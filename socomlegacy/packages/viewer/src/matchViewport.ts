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
/** The lowest ratio long frames take it to (`main.ts` `RATIO_FLOOR`). */
export const PIXEL_RATIO_FLOOR_ADAPTATION = 0.75;
/** One change of the ratio (`main.ts` `adapt`'s 0.25). */
export const PIXEL_RATIO_STEP_ADAPTATION = 0.25;
/** A smoothed frame longer than this asks for a lower ratio (`main.ts` `SLOW_MS`). */
export const SLOW_FRAME_MS_ADAPTATION = 24;
/** A smoothed frame shorter than this asks for a higher one (`main.ts` `FAST_MS`). */
export const FAST_FRAME_MS_ADAPTATION = 12;
/** The least time between two changes (`main.ts` `ADAPT_EVERY_MS`). */
export const ADAPT_EVERY_MS_ADAPTATION = 2000;
/** The frame time's smoothing a frame, from its start (`main.ts`'s `smoothedMs`: 16.7 ms, x 0.08). */
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
 * Trades pixels for frames (`main.ts` `adapt`): a phone that cannot hold a map at 1.5x drops to 1.25x, then 1x, and
 * climbs back when it can; a page that never runs long never moves. The frame time is smoothed every frame; every
 * 200 ms the ratio is checked, and changed at most once every 2 s, never while the page holds it (a map arriving, the
 * PS2 presentation, the loading screen's hold).
 *
 * CPS-4a (CPS.R7, a browser adaptation): the cap moves with the page's render scale and the canvas's size
 * (`./videoSettings` `renderCapFor`, `setCap`); the trade runs under it as before.
 */
export class AdaptiveRatio {
  private smoothed = FRAME_MS_START_ADAPTATION;
  private lastTick = 0;
  private lastChange = 0;
  /** The cap before a `setCap` the next tick has not met yet (null: none pending). */
  private capWas: number | null = null;

  constructor(private cap: number) {}

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

  /** The smoothed frame time, ms (`main.ts`'s frame counter reads it). */
  smoothedMs(): number { return this.smoothed; }

  /** The renderer at the cap (`main.ts`: `created.setPixelRatio(RATIO_CAP)` once the renderer is up). */
  start(target: RatioTarget): void { this.capWas = null; target.setPixelRatio(this.cap); }

  /**
   * One frame of `dt` seconds at `now` ms: the smoothing, then on the 200 ms tick the check. True on the tick (`main.ts`
   * redraws its frame counter then). No frame time (`dt` 0), no smoothing and no tick.
   */
  frame(dt: number, now: number, target: RatioTarget | null, hold: boolean): boolean {
    if (!(dt > 0)) return false;
    this.smoothed += (dt * 1000 - this.smoothed) * FRAME_MS_SMOOTHING_ADAPTATION;
    if (now - this.lastTick <= RATIO_TICK_MS_ADAPTATION) return false;
    this.lastTick = now;
    if (target && !this.meetCap(now, target)) this.adapt(now, target, hold);
    return true;
  }

  /** CPS-4a: the ratio put under a moved cap (`setCap`); true when it changed it (the trade waits its 2 s from here). */
  private meetCap(now: number, target: RatioTarget): boolean {
    const was = this.capWas, ratio = target.pixelRatio();
    this.capWas = null;
    if (!(ratio > this.cap) && !(was !== null && ratio < this.cap && ratio >= was)) return false;
    target.setPixelRatio(this.cap);
    this.lastChange = now;
    return true;
  }

  private adapt(now: number, target: RatioTarget, hold: boolean): void {
    if (hold || now - this.lastChange < ADAPT_EVERY_MS_ADAPTATION) return;
    const ratio = target.pixelRatio();
    if (this.smoothed > SLOW_FRAME_MS_ADAPTATION && ratio > PIXEL_RATIO_FLOOR_ADAPTATION) {
      target.setPixelRatio(Math.max(PIXEL_RATIO_FLOOR_ADAPTATION, ratio - PIXEL_RATIO_STEP_ADAPTATION));
    } else if (this.smoothed < FAST_FRAME_MS_ADAPTATION && ratio < this.cap) {
      target.setPixelRatio(Math.min(this.cap, ratio + PIXEL_RATIO_STEP_ADAPTATION));
    } else return;
    this.lastChange = now;
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
