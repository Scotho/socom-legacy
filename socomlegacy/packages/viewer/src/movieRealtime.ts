import {
  BackgroundMoviePlayer, MovieWorkerSource,
  type MovieBudgetReport, type MovieFrame, type MovieOpenOptions, type MovieStreamHandle,
} from '@s2u/fmv';
import { UiClock } from '@s2u/ui';

/**
 * PLAT-19c in the page (web research 120 §11): a disc movie played the way a `BACKGROUND TYPE MPEG` dialog plays it --
 * PLAT-21's `BackgroundMoviePlayer` built on it, ticked once per tick of PLAT-12's `UiClock` (29.97 Hz, research 110),
 * fed by PLAT-19b's worker through `@s2u/fmv`'s `MovieWorkerSource`, each picture handed to `present` (a 2D canvas, or
 * `MovieTexture`) -- until the player's event 3 (ONMPEGEND), with the movie's budget counted on the page's clock.
 *
 * This is the measurement's harness and the connecting piece for the front end: the front end's session (PLAT-10's
 * `frontEnd.ts`) still builds its movie host over the black stand-in, and swapping in the worker source there is the
 * front end's (W9.R4; research 120 §11 says which line). No game state is changed here; nothing runs unless called.
 */

/** The opener's movies, in boot order (research 121 §10): the logos, the intro, the main menu's background. */
export const OPENER_MOVIES = [
  'RUN/MOVIES/COMMON/SONY448.PSS',
  'RUN/MOVIES/INTRO_2.PSS',
  'RUN/MOVIES/COMMON/MENULOOP.PSS',
] as const;

export interface RealTimeMovieOptions {
  /** The movie's disc path. */
  path: string;
  /** Open it on the worker: `client.open(path, disc, wasm)` (`movieTexture.ts`'s `startMovieWorker`). */
  open(path: string, options: MovieOpenOptions): MovieStreamHandle;
  /** Show a picture: the frame being drawn's bottom layer (research 121 R121.10). */
  present(frame: MovieFrame): void;
  /** The page's clock, ms (`performance.now`). */
  now(): number;
  /** The display's next frame (`requestAnimationFrame`), its timestamp on the same clock. */
  requestFrame(callback: (t: number) => void): void;
  /** Whether the file is on the disc (the open fails at once when not). */
  exists?(path: string): boolean;
  /** PLAT-20: the movie's sound (`movieSound.ts`'s `MovieSound`): each picture presented, then the stop at event 3. */
  sound?: { picture(index: number): void; stop(): void };
}

export interface RealTimeMovieRun {
  /** The movie's budget (`MovieBudget.report`). */
  budget: MovieBudgetReport;
  /** The clock's ticks from the build to event 3. */
  ticks: number;
  /** The tick's seconds (`UI_TICK_SECONDS`). */
  tickSeconds: number;
  /** Display time the clock dropped past its catch-up (`UiClock.lostSeconds`): the page's own stalls, not the decoder's. */
  lostSeconds: number;
  /** The first build to event 3, ms on the page's clock. */
  wallMs: number;
}

/** Plays `o.path` to its end in real time and answers its budget. */
export function playMovieInRealTime(o: RealTimeMovieOptions): Promise<RealTimeMovieRun> {
  return new Promise((resolve) => {
    const source = new MovieWorkerSource({ open: (n, opts) => o.open(n, opts), now: o.now, ...(o.exists ? { exists: o.exists } : {}) });
    const clock = new UiClock();
    let done = false;
    const t0 = o.now();
    const player = new BackgroundMoviePlayer<MovieFrame>({
      source,
      sink: { present: (f) => { o.present(f); o.sound?.picture(f.index); } },
      onEnd: () => { done = true; },
    });
    player.build({ type: 1, filename: o.path });
    const finish = (): void => {
      o.sound?.stop();
      const budget = source.budgets[0]?.report() ?? {
        movie: o.path, startupMs: null, startupTicks: 0, pictures: 0, ticks: 0, lateTicks: 0, dropped: 0, repeated: 0,
        decodeMs: null, readMs: null, queue: null, intervalMs: null, presentedFps: null, end: null, sustained: false,
      };
      resolve({ budget, ticks: clock.ticks, tickSeconds: clock.tickSeconds, lostSeconds: clock.lostSeconds, wallMs: o.now() - t0 });
    };
    if (done) { finish(); return; }                // the open failed: event 3 in the build (research 121 R121.4)
    const frame = (t: number): void => {
      clock.advance(t, () => { if (!done) player.tick(); });
      if (done) { finish(); return; }
      o.requestFrame(frame);
    };
    o.requestFrame(frame);
  });
}

/** A `present` onto a 2D canvas: the picture's RGBA put at the origin, its own size (as `@s2u/ui`'s movie layer places it). */
export function canvasPresenter(ctx: CanvasRenderingContext2D): (frame: MovieFrame) => void {
  return (f) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(f.rgba), f.width, f.height), 0, 0);
  };
}
