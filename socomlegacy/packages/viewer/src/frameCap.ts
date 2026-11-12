import type { FrameCap } from './videoSettings';

/**
 * VS-4 (VS.R2; product track): the frame cap -- **a browser adaptation with no original**. The original draws at the
 * console's rate; a browser's frames come at the display's (vsync is the browser's, always on, and is said, not
 * offered). The cap decides only whether an animation frame is drawn: the match's simulation, its net frame and its
 * timed rules run every animation frame on that frame's real seconds (`./mover` `:32` the fixed 60 Hz accumulator fed
 * real time; `./frameTime`, PAR-24), so a skipped draw changes nothing the game does -- as on any 30 fps machine.
 *
 * On the rAF clock alone (the frame's timestamp, no timers): cap 0 (Off) draws every frame; cap N keeps a due time on
 * a 1000 / N ms cadence and draws the first frame at or past it, less half a display frame of tolerance (the last
 * frame's interval, at most half the cap's), so 60 on a 60 Hz display draws every frame and 30 every other, and a cap
 * above the display's rate (120 on 60 Hz) draws every frame and skips none (the plan's Review focus 2). The cadence is
 * kept from the due time, not from the last drawn frame (which at 144 Hz would draw 72 a second under a cap of 60); a
 * frame that finds the due time a whole interval behind (a stall, a cap above the display's rate) restarts it from
 * itself, so no burst pays a stall back.
 */
export interface FrameCapGate {
  /** One animation frame at `nowMs` (rAF's timestamp): true when it is drawn. Call it once a frame. */
  shouldDraw(nowMs: number): boolean;
  /** A new cap, from the next frame (which draws, the cadence restarted from it). */
  setCap(cap: FrameCap): void;
  cap(): FrameCap;
}

export function frameCapGate(initial: FrameCap): FrameCapGate {
  let cap: FrameCap = initial;
  let due: number | null = null;          // the next drawn frame's due time; null: the next frame draws and starts it
  let last: number | null = null;         // the last frame's timestamp (drawn or not): the display's interval
  return {
    shouldDraw(now: number): boolean {
      const interval = last === null ? 0 : now - last;
      last = now;
      if (cap === 0) return true;
      const every = 1000 / cap;
      if (due === null) { due = now + every; return true; }
      const half = Math.min(Math.max(interval, 0), every) / 2;
      if (now < due - half) return false;
      due = Math.max(due + every, now + every - half);
      return true;
    },
    setCap(next: FrameCap): void {
      if (next === cap) return;
      cap = next;
      due = null;
    },
    cap: () => cap,
  };
}
