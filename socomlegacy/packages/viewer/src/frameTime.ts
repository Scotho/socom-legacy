/**
 * PAR-24 (socomlegacy/docs/research/252-timed-holds-in-real-time.md; ACT.R8's general rule, 2026-10-08: timed holds count
 * real time, not page frames): a page's frame's real seconds, read once a frame from its monotonic clock, beside the
 * simulation's clamped step.
 *
 * - **Why.** Both pages clamp a frame's step to 0.1 s (`./main`'s frame and `./matchMount`'s: "a backgrounded tab must
 *   not teleport the camera" -- a browser adaptation, the simulation's step bound, which stays). Below 10 fps a frame's
 *   real time exceeds the bound, and a timed rule fed the clamped step runs slow: at 5 fps the 3 s claim hold took 6 s
 *   (research 250 s8, measured on the mount's fakes in research 252 s2). The original subtracts its frame's elapsed time
 *   from the claim's hold (`FUN_00593da0` D:L452547-452549 takes its float argument off `+0x23c`, the argument the
 *   player controller's per-frame update `FUN_00594cf0` hands it, D:L453025 -> D:L453705; research 208 s0: one core
 *   tick a frame with the measured dt), and ACT.R8 rules that a timed hold takes its real time on any honest machine and
 *   never less for anyone.
 * - **Why the frame's own real seconds, not a wall clock each rule reads.** A rule credited the time since it last read a
 *   clock would be credited, at its next read, the frames it did not run -- the loading hold, a page whose lanes stopped.
 *   The frame's real seconds credit a rule only the frames it runs in, each its own real duration: a long frame (a stall)
 *   credits its real time and no more, a rule paused is credited nothing, and the rules keep their own gates (in reach,
 *   held, alive) and their cancels. Nothing here is a duration, a tolerance or a liveness bound.
 *
 * The pages call `frame` first in each frame and clamp what it returns for the simulation; the timed rules read `real`
 * (the wiring is the wave-4 integrator's, PAR.R3: research 252 s4).
 */
export class FrameTime {
  private last: number | null = null;
  private seconds = 0;
  /** cps-frame-hash-2's test-only hold (`hold`); false in every production frame. */
  private held = false;

  /**
   * A frame at `nowMs` -- a monotonic clock in milliseconds, `requestAnimationFrame`'s timestamp or `performance.now()`:
   * its real seconds since the frame before, kept for `real` and returned. The first frame, a clock that did not advance
   * or ran back, and a reading that is no number give 0; a bad reading is not kept, so the next frame counts from the
   * last good one.
   */
  frame(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return (this.seconds = 0);
    if (this.held) { this.last = nowMs; return (this.seconds = 0); }
    this.seconds = this.last === null ? 0 : Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    return this.seconds;
  }

  /**
   * cps-frame-hash-2 (CPS.R9 (e)'s frame identity gate; product track, a test-only instrument with no original): held, each
   * frame reads 0 seconds -- the clamped step and `real` alike, so every clock the page's frame hands on stands still --
   * and the last reading is kept, so the frame after the release counts from the last held frame (no jump). Called only by
   * the dev hook `window.__viewer.holdFrame` (`./main`, under the dev panel's gate), so a production frame never holds.
   */
  hold(on: boolean): void {
    this.held = on;
  }

  /** The last frame's real seconds (0 before the first): what the page's timed rules count. */
  real(): number {
    return this.seconds;
  }

  /**
   * IP3 (`./matchMount` `prepareMount`; a browser adaptation): the frames stopped and begun again -- a prepared match's,
   * stopped once drawn and run again at its attach. The next frame counts as a first (0): the pause is no frame's real
   * time, as a rule paused is credited nothing.
   */
  restart(): void {
    this.last = null;
    this.seconds = 0;
  }
}
