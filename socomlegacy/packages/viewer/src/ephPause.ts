/**
 * PK-3, the parity pack's Pause (docs/specs/2026-11-03-parity-pack-design.md s5 "Play / Pause", s6 item 5): the page's
 * half of the tester's Pause, `__viewer.ephPause(on)`. A browser adaptation, product track (OT.R53): a dev-mode-only
 * instrument for the emulator parity harness, with no original and no game rule -- it changes nothing the game does,
 * it only stops the page's frame from stepping while a tester has paused both clients.
 *
 * Gated as `./ephFrame` is (`main.ts` `EPH_ON`, the bare `?devmode`): without it the hook is present and a no-op that
 * answers false, as `ephFrame()` answers null.
 *
 * - **What a held frame does.** `main.ts`'s frame reads its real seconds (`FrameTime.frame`) and then asks `held()`;
 *   a held frame runs nothing more and asks for the next one -- no input read (the pad's lanes, the walk's stance
 *   presses), no walk tick (`WalkMode.ticks` stays, so `ephFrame()` answers the same tick, stance and action), no
 *   draw: the picture stays the last one drawn before the pause.
 * - **The resume re-bases the clock.** Resuming calls `rebase` (`main.ts`: `FrameTime.restart`), so the first frame
 *   after it counts as a first (0 s) and the paused span is no frame's time -- neither the walk's clamped step nor the
 *   timed rules' real seconds (`FrameTime.real`). Without it a window whose animation frames stopped during the pause
 *   (occluded, hidden) would hand its first frame the whole span, clamped to the page's 0.1 s: six ticks at once.
 * - **Not held**: the match room's own clock (`./net/loopback` steps on wall time, as `./devClock`'s note says of the
 *   developer clock), socket events (queued for the next frame that runs), keyboard and mouse events (their latched
 *   presses and turns are read by the first frame after the resume).
 */
export class EphPause {
  private paused = false;

  /** `on`: the bare `?devmode` (`EPH_ON`); `rebase`: called once at each resume (the frame clock's restart). */
  constructor(private readonly on: boolean, private readonly rebase: () => void) {}

  /**
   * `__viewer.ephPause(on)`: `true` pauses, anything else resumes; answers the paused state after the call. Without
   * devmode a no-op answering false. Idempotent: a second pause or resume changes nothing and re-bases nothing.
   */
  set(on: boolean): boolean {
    if (!this.on) return false;
    const next = on === true;
    if (this.paused && !next) this.rebase();
    this.paused = next;
    return this.paused;
  }

  /** Whether this frame is held (runs nothing past its clock read). Always false without devmode. */
  held(): boolean {
    return this.paused;
  }
}
