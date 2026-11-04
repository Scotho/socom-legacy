/**
 * The test room's clock (`./devPanel`). A browser adaptation, a development instrument with no original: it scales the page's
 * frame `dt` while the panel is open, and while the panel is closed, the game's clock and ammo are main's; only the drawing
 * overlays may stay: the default scale is 1, closing the panel sets the clock back to it (04, OT.R53), and a closed
 * panel's frame is the real `dt`. A step advances one 60 Hz tick (1/60 s) and then stays paused. It does not touch the
 * replay clock, or the clocks that already run on real time (`DEV_CLOCK_NOTE`).
 */
export const DEV_CLOCK_SCALES = [1, 0.5, 0.25] as const;
/**
 * What the clock does not slow, the Time section's note in the style of `./devGaps`: the page's game-time consumers
 * take the scaled `dt`; the room's ticks and round clock, the frame clocks' real seconds, the turret and throw rules
 * and the voice clock run on wall time, and the panel has no command for them.
 */
export const DEV_CLOCK_NOTE = 'Pause and slow motion slow the page\'s walk, weapons and HUD; the room\'s round clock, fuses and timers run on real time.';
/** One simulation tick. A frame step advances this, not the real frame (which is capped at 0.1 s). */
export const DEV_CLOCK_STEP_S = 1 / 60;

export interface DevClockState {
  /** 1, 0.5, 0.25, or 0 while paused. */
  scale: number;
  /** The next call advances `DEV_CLOCK_STEP_S`, then the clock pauses. */
  step: boolean;
}

export function devClockState(): DevClockState {
  return { scale: 1, step: false };
}

/** The seconds this frame should advance, and the clock after it. A non-finite or negative `dt` advances nothing. */
export function devClockDt(state: DevClockState, dt: number): { dt: number; state: DevClockState } {
  const finite = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (state.step) return { dt: DEV_CLOCK_STEP_S, state: { scale: 0, step: false } };
  if (!(state.scale > 0)) return { dt: 0, state };
  return { dt: finite * state.scale, state };
}
