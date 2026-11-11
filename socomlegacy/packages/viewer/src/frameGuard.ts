import { graphicsRecord, showGraphicsLost } from './graphicsLost';

/**
 * FRAME-LOOP-GUARD (LATER 859's first look; product track, **a browser adaptation with no original**: the console's
 * frame never threw; nothing of the game's behaviour, no pixel and no timing changes while frames run). Shadow's X3
 * bench (6343231f0, the main controller's GO 2026-11-10): one WebGPU upload that failed inside a frame threw out of
 * `renderer.render`, and the match froze on a black screen for good -- START dead, no notice -- because the match's
 * frame asked for the next one only on its last line (`./matchMount`), as the menus' loop does (`./frontEnd`); input
 * rides those loops, so the player could neither play nor leave.
 *
 * The guard runs one frame's body: what the body returns decides the next frame, as before. A body that throws ends
 * that frame only: the error is handed to the page (the first of a run of throwing frames: the console and the client
 * error beacon see it), the loop goes on while its owner is alive, and after `FRAME_THROWS_NOTICE_ADAPTATION` throwing
 * frames in a row the page shows graphicsLost's notice ("Graphics stopped ... Reload the page to continue."), once.
 *
 * Review folds (2026-11-11): F1, the notice is not shown over a lost device's own (its reason is the better one); F2, it
 * is taken down when frames draw again, and may show again on a later stuck run; F3, a throw that alternates with good
 * frames -- each its own run -- is reported at most `FRAME_REPORTS_CAP_ADAPTATION` times a guard. The notice still says
 * "Graphics" for any throw: the page cannot tell a draw's failure from another's, and the remedy is the same reload.
 */

/** Throwing frames in a row before the notice (a browser adaptation): one stray throw costs a frame, a stuck one is said. */
export const FRAME_THROWS_NOTICE_ADAPTATION = 3;
/** Reports a guard hands the page at most (a browser adaptation): a flapping throw is not 30 console lines a second. */
export const FRAME_REPORTS_CAP_ADAPTATION = 10;

/** The error handed to the page as an uncaught one would be: `reportError` where the browser has it, else an `error` event. */
export function reportFrameError(error: unknown): void {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
  if (typeof report === 'function') { report(error); return; }
  const win = globalThis as { dispatchEvent?: (e: Event) => boolean; ErrorEvent?: typeof ErrorEvent };
  if (typeof win.dispatchEvent === 'function' && typeof win.ErrorEvent === 'function') {
    win.dispatchEvent(new win.ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }));
  }
}

/** graphicsLost's notice for a frame that keeps throwing; none over a lost device's own (review F1). Returns it, to take down. */
function frameStoppedNotice(error: unknown): { remove(): void } | null {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || graphicsRecord().lost) return null;
  const message = error instanceof Error ? error.message : String(error);
  try { return showGraphicsLost(doc, { api: 'Frame', message, reason: 'every frame threw' }); } catch { return null; }   // a page being torn down
}

export interface FrameGuardOptions {
  /** Where a throwing frame's error goes (the first of each run); default `reportFrameError`. */
  report?: (error: unknown) => void;
  /** Shown at the limit; default graphicsLost's notice. What it returns is taken down when frames draw again. */
  notice?: (error: unknown) => { remove(): void } | null | void;
  limit?: number;
}

/** One loop's guard: its run of throwing frames and whether its notice is up. */
export class FrameGuard {
  private run = 0;
  private noticed = false;
  private reports = 0;
  private shown: { remove(): void } | null = null;
  constructor(private readonly o: FrameGuardOptions = {}) {}

  /**
   * One frame: `body` runs; its result (true: ask for the next frame) is returned. A throw ends this frame only and
   * returns `alive()` -- the owner's own test that it still wants frames (not torn down).
   */
  frame(body: () => boolean, alive: () => boolean): boolean {
    try {
      const again = body();
      this.run = 0;
      if (this.shown) { this.shown.remove(); this.shown = null; this.noticed = false; }   // review F2: drawing again
      return again;
    } catch (error) {
      this.run++;
      if (this.run === 1 && this.reports < FRAME_REPORTS_CAP_ADAPTATION) { this.reports++; (this.o.report ?? reportFrameError)(error); }
      if (this.run >= (this.o.limit ?? FRAME_THROWS_NOTICE_ADAPTATION) && !this.noticed) {
        this.noticed = true;
        this.shown = (this.o.notice ?? frameStoppedNotice)(error) ?? null;
      }
      return alive();
    }
  }
}
