/**
 * Lag read v4 s6 -- AN OPERATOR'S INSTRUMENT (the product track; a browser adaptation with no original; it changes
 * nothing the game does). The page's own main-thread stalls: the longest gap between two consecutive animation frames
 * since the page's previous app ping, and how many gaps passed `PAGE_STALL_OVER_MS_ADAPTATION`. `NetClient` feeds it from
 * `requestAnimationFrame` and attaches `take()` to its 2 s app ping (`pageStallMaxMs`, `pageStalls100`); the room only
 * stores the pair and the server's `rtt` line names it beside the heartbeat's round trip, so a busy page is told from a
 * slow wire. The names are the lag owner's: a bare "stall" would read as the host's `loopLagMs`.
 */

/** A frame gap over this many ms is counted as a stall (`pageStalls100`); the lag owner's threshold, an adaptation. */
export const PAGE_STALL_OVER_MS_ADAPTATION = 100;

/** One interval's reading, as the app ping carries it: whole milliseconds and a count. */
export interface PageStalls { pageStallMaxMs: number; pageStalls100: number }

export class StallMeter {
  private last: number | null = null;
  private max = 0;
  private over = 0;
  private gaps = 0;

  /** One animation frame at `nowMs` (`performance.now()` or the rAF timestamp). A step back or a non-finite time is no gap. */
  frame(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    const last = this.last;
    this.last = nowMs;
    if (last === null || nowMs < last) return;
    const gap = nowMs - last;
    this.gaps++;
    if (gap > this.max) this.max = gap;
    if (gap > PAGE_STALL_OVER_MS_ADAPTATION) this.over++;
  }

  /**
   * The lag batch review's N1: forget the last frame, so the next one is a baseline and no gap. A browser pauses the
   * frames of a hidden tab; the client calls this while the page is not visible, so a hidden spell is never a stall.
   */
  reset(): void {
    this.last = null;
  }

  /** The interval's reading, then a new interval from the last frame seen; null while no gap was measured. */
  take(): PageStalls | null {
    if (this.gaps === 0) return null;
    const out = { pageStallMaxMs: Math.round(this.max), pageStalls100: this.over };
    this.max = 0; this.over = 0; this.gaps = 0;
    return out;
  }
}
